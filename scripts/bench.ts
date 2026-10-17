/// <reference types="node" />
/*
 * Headless frame benchmark. Plays levels the way a perf build does on AUTO: greedyBot, the app's loop (`advance`), and
 * the real renderer over a GPU that does nothing, at 120 frames a second. FRAME_TIMING splits each frame into phases.
 * This measures the JavaScript a frame costs (bot, sim, renderer packing and encoding), not the GPU or the display.
 * `npm run bench` runs Node with --jitless: Hermes on a phone has no JIT either, so the phases weigh the same as on a
 * device (the bot is about 15 times the renderer's packing on both), and runs repeat within a few percent. With the JIT,
 * a frame costs microseconds and tiering and host load swamp it. Compare runs from the same machine only; the device runs
 * in docs/performance.md measure real frame rates.
 *
 *   npm run bench                           prints the table
 *   npm run bench -- --out bench.json       also writes the results
 *   npm run bench -- --baseline old.json    adds a change column; exits 1 when a level's frame got slower than --max-slowdown (default 0.15)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { PerformanceObserver, performance } from 'node:perf_hooks';
import { FRAME_PHASES, FRAME_TIMING } from '../src/frameTiming';
import type { LevelNumber } from '../src/levels';
import { MAX_PIXEL_RATIO, createRenderer } from '../src/render';
import { advance, createLoop, resetRun, setPlaying, type Sinks } from '../src/shell/loop';
import { createFakeGpu } from '../src/testing/fake-gpu';

/** The first level and each boss level: the longest runs and the busiest frames. */
const LEVELS: readonly LevelNumber[] = [1, 10, 20, 30];
const REPEATS = 3;
const FRAME_MS = 1000 / 120;
/** Changes smaller than this many milliseconds are noise even when the percentage looks large. */
const MIN_DELTA_MS = 0.005;

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const outPath = flag('--out');
const jitless = process.execArgv.includes('--jitless') || (process.env.NODE_OPTIONS ?? '').includes('--jitless');
const baselinePath = flag('--baseline');
const maxSlowdown = Number(flag('--max-slowdown') ?? 0.15);

/**
 * Per run, then the median across runs. `avg` leaves out the slowest 1% of frames: a busy host stalls single frames for
 * tens of milliseconds in any phase, and one such stall moves a plain mean by a third. `max` is the worst of all runs and
 * is host noise more often than not, so the gate ignores it.
 */
interface Stats { avg: number; p50: number; p95: number; p99: number; max: number }

export interface LevelResult {
  level: number;
  frames: number;
  frame: Stats;
  /** Average milliseconds per frame for each FRAME_TIMING phase, plus `other`: the loop itself, events, and the hud. */
  phases: Record<string, number>;
  gcCount: number;
  gcMs: number;
}

export interface BenchResult {
  version: string;
  commit: string;
  node: string;
  jitless: boolean;
  cpu: string;
  date: string;
  repeats: number;
  levels: LevelResult[];
}

function stats(values: Float64Array): Stats {
  const sorted = values.slice().sort();
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  const kept = sorted.subarray(0, Math.max(1, Math.floor(sorted.length * 0.99)));
  return { avg: kept.reduce((a, b) => a + b, 0) / kept.length, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: sorted[sorted.length - 1] };
}

function medianOf(runs: Stats[]): Stats {
  const mid = (key: keyof Stats) => runs.map((r) => r[key]).sort((a, b) => a - b)[Math.floor(runs.length / 2)];
  return { avg: mid('avg'), p50: mid('p50'), p95: mid('p95'), p99: mid('p99'), max: Math.max(...runs.map((r) => r.max)) };
}

/** The renderer spawns particles with Math.random; a fixed seed makes every run draw the same frames. */
function seedRandom(seed: number): () => void {
  const prev = Math.random;
  let state = seed >>> 0;
  Math.random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  return () => { Math.random = prev; };
}

let gcCount = 0, gcMs = 0;
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    gcCount += 1;
    gcMs += entry.duration;
  }
}).observe({ entryTypes: ['gc'] });
/** GC entries arrive on a later turn of the event loop. */
const flushGc = () => new Promise((resolve) => setTimeout(resolve, 100));

/** One full run of `level` on AUTO, until the won or lost hold ends. Fills `total` and `phases` per frame. */
function play(level: LevelNumber, record: (total: number) => void): void {
  const gpu = createFakeGpu();
  // Keep the fake's call log from growing, and skip its byte copies: a device hands writes to the driver.
  gpu.device.queue.writeBuffer = () => {};
  const renderer = createRenderer(gpu.device, gpu.context, 'bgra8unorm', MAX_PIXEL_RATIO);
  const loop = createLoop();
  resetRun(loop, { level, attempt: 0 });
  loop.auto = true;
  setPlaying(loop, true);
  const sinks: Sinks = {
    render: renderer.frame,
    audio() {},
    ended() {},
    hud() {},
    hold: renderer.hold,
  };
  let now = 1000;
  loop.last = now;
  while (loop.playing || loop.hold !== null) {
    now += FRAME_MS;
    for (const phase of FRAME_PHASES) FRAME_TIMING[phase] = 0;
    const t0 = performance.now();
    advance(loop, now, sinks);
    record(performance.now() - t0);
    gpu.calls.length = 0;
  }
  renderer.dispose();
}

async function benchLevel(level: LevelNumber): Promise<LevelResult> {
  const runs: Stats[] = [];
  let frames = 0;
  const phaseSums: Record<string, number> = Object.fromEntries([...FRAME_PHASES, 'other'].map((p) => [p, 0]));
  await flushGc();
  gcCount = 0;
  gcMs = 0;
  for (let r = 0; r < REPEATS; r++) {
    const totals: number[] = [];
    const restore = seedRandom(level);
    try {
      play(level, (total) => {
        totals.push(total);
        let covered = 0;
        for (const phase of FRAME_PHASES) {
          phaseSums[phase] += FRAME_TIMING[phase];
          covered += FRAME_TIMING[phase];
        }
        phaseSums.other += Math.max(0, total - covered);
      });
    } finally {
      restore();
    }
    runs.push(stats(Float64Array.from(totals)));
    frames += totals.length;
  }
  await flushGc();
  const phases = Object.fromEntries(Object.entries(phaseSums).map(([p, sum]) => [p, sum / frames]));
  return { level, frames: frames / REPEATS, frame: medianOf(runs), phases, gcCount: gcCount / REPEATS, gcMs: gcMs / REPEATS };
}

function gitCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
      cwd: new URL('..', import.meta.url), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

async function main(): Promise<void> {
  FRAME_TIMING.on = true;
  // Warm the JIT on a short run so the first measured level is not paying for compilation.
  const restore = seedRandom(0);
  try { play(1, () => {}); } finally { restore(); }

  const levels: LevelResult[] = [];
  for (const level of LEVELS) levels.push(await benchLevel(level));
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  const appConfig = readFileSync(new URL('../app.config.ts', import.meta.url), 'utf8');
  const result: BenchResult = {
    version: /version: '([^']+)'/.exec(appConfig)?.[1] ?? pkg.version,
    commit: gitCommit(),
    node: process.version,
    jitless,
    cpu: cpus()[0]?.model ?? 'unknown',
    date: new Date().toISOString(),
    repeats: REPEATS,
    levels,
  };

  const baseline = baselinePath ? (JSON.parse(readFileSync(baselinePath, 'utf8')) as BenchResult) : null;
  if (baseline && baseline.jitless !== jitless) throw new Error(`${baselinePath} was measured ${baseline.jitless ? 'without' : 'with'} the JIT; this run was not`);
  const regressions = report(result, baseline);
  if (outPath) writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
  if (regressions.length > 0) {
    console.log(`\nFAIL: frame cost rose more than ${(maxSlowdown * 100).toFixed(0)}%`);
    for (const r of regressions) console.log(`  ${r}`);
    process.exit(1);
  }
}

const ms = (v: number) => v.toFixed(3);
const pct = (now: number, before: number) => `${now >= before ? '+' : ''}${(((now - before) / before) * 100).toFixed(1)}%`;

/** Prints a markdown table (it reads as text and pastes into a CI summary) and returns the regressions. */
function report(result: BenchResult, baseline: BenchResult | null): string[] {
  console.log(`## Frame benchmark: ${result.version} (${result.commit})\n`);
  console.log(`${result.cpu}, Node ${result.node}${result.jitless ? ' without its JIT' : ''}, ${result.repeats} runs per level on AUTO at 120 fps. Milliseconds of JavaScript per frame; avg leaves out the slowest 1%, phases do not.`);
  if (baseline) console.log(`Compared with ${baseline.version} (${baseline.commit}).`);
  console.log('');
  const head = ['level', 'frames', 'avg', 'p95', 'p99', 'max', ...FRAME_PHASES, 'other', 'GCs'];
  if (baseline) head.push('avg change', 'p95 change');
  console.log(`| ${head.join(' | ')} |`);
  console.log(`|${head.map(() => ' ---: ').join('|')}|`);
  const regressions: string[] = [];
  for (const level of result.levels) {
    const row = [level.level, level.frames, ms(level.frame.avg), ms(level.frame.p95), ms(level.frame.p99), ms(level.frame.max),
      ...[...FRAME_PHASES, 'other'].map((p) => ms(level.phases[p])), level.gcCount.toFixed(0)].map(String);
    const before = baseline?.levels.find((l) => l.level === level.level);
    if (before) {
      row.push(pct(level.frame.avg, before.frame.avg), pct(level.frame.p95, before.frame.p95));
      for (const key of ['avg', 'p95'] as const) {
        const delta = level.frame[key] - before.frame[key];
        if (delta > MIN_DELTA_MS && delta / before.frame[key] > maxSlowdown) {
          regressions.push(`level ${level.level} ${key} ${ms(before.frame[key])} -> ${ms(level.frame[key])} ms (${pct(level.frame[key], before.frame[key])})`);
        }
      }
    } else if (baseline) {
      row.push('new', 'new');
    }
    console.log(`| ${row.join(' | ')} |`);
  }
  return regressions;
}

void main();
