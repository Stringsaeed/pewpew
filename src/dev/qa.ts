import AsyncStorage from '@react-native-async-storage/async-storage';
import { FRAME_PHASES, FRAME_TIMING } from '../frameTiming';
import { LEVELS } from '../levels';
import { recordRun, type Save } from '../save';
import type { Loop } from '../shell/loop';
import { hashWorld, type World } from '../sim';

/**
 * A Release build with `EXPO_PUBLIC_PERF=1` keeps these tools (AUTO, the timers, the logs) so a device run can be measured
 * with JS at production speed. `EXPO_PUBLIC_PERF=auto` also plays level 1 on AUTO PERF_RUNS times by itself, so the run
 * needs no taps. babel-preset-expo inlines the variable at build time; a normal Release build drops all of it.
 */
const PERF_MODE = process.env.EXPO_PUBLIC_PERF;
export const PERF = PERF_MODE === '1' || PERF_MODE === 'auto';
export const PERF_AUTORUN = PERF_MODE === 'auto';
/** The autorun's runs in order: the bot playing, then the player coasting (no bot, no input), twice each. */
export const PERF_PLAN: readonly ('auto' | 'coast')[] = ['auto', 'coast', 'auto', 'coast'];

/**
 * Release builds send console.log only to os_log, which needs root or a cable to read. Perf builds also keep every line
 * under this AsyncStorage key, so `xcrun devicectl device copy from` can fetch it over Wi-Fi.
 */
export const PERF_KEY = 'pewpew.perf';
const perfLines: string[] = [];

export function perfLog(line: string): void {
  console.log(line);
  if (!PERF) return;
  perfLines.push(line);
  void AsyncStorage.setItem(PERF_KEY, perfLines.join('\n'));
}

/** One star on levels 1..29 unlocks all 30. recordRun max-merges, so real records survive and a second press changes nothing. */
export function unlockAll(s: Save): Save {
  return LEVELS.slice(0, -1).reduce((acc, spec) => recordRun(acc, spec.n, 0, 1), s);
}

/** Same hash and hex format as scripts/verify-levels.ts, so a device run greps against .audit/verify-levels.txt. */
export function logAutoRun(w: World): void {
  perfLog(`[pewpew] level ${w.spec.n} hash ${hashWorld(w).toString(16).padStart(8, '0')} steps ${w.tick}`);
}

export interface DevTools {
  toggleAuto(): void;
  unlock(save: Save): Save;
  resetTimer(): void;
  logBot(loop: Loop): void;
  sample(now: number, tick: (now: number) => void): void;
}

/** Dev and perf-build owner of AUTO, UNLOCK ALL, the frame timer, the bot hash log, and `globalThis.pewpew`. */
export function createDevTools(loop: Loop, onAuto: (on: boolean) => void): DevTools {
  (globalThis as { pewpew?: Loop }).pewpew = loop;
  const timer = createTickTimer();
  FRAME_TIMING.on = PERF;
  let last = 0;
  let started = false;
  return {
    toggleAuto() {
      loop.auto = !loop.auto;
      onAuto(loop.auto);
    },
    unlock(save) { return unlockAll(save); },
    resetTimer() { timer.reset(); },
    logBot(live) {
      if (live.botOnly && live.world) logAutoRun(live.world);
    },
    sample(now, tick) {
      if (!started) {
        started = true;
        logStartup();
      }
      const interval = last === 0 ? 0 : now - last;
      last = now;
      if (!loop.playing || !loop.world) return tick(now);
      for (const phase of FRAME_PHASES) FRAME_TIMING[phase] = 0;
      const t0 = performance.now();
      tick(now);
      const world = loop.world;
      if (!world) return;
      timer.add(performance.now() - t0, interval, world.spec.n, loop.auto);
    },
  };
}

const FRAMES = 600;

interface HermesStats { readonly js_heapSize: number; readonly js_allocatedBytes: number }
const hermes = (globalThis as { HermesInternal?: { getInstrumentedStats?: () => HermesStats } }).HermesInternal;
const mb = (bytes: number) => (bytes / 1048576).toFixed(1);

/** Once, on the first rendered frame: time since the JS bundle started, which includes building the renderer. */
function logStartup(): void {
  const start = (globalThis as { __BUNDLE_START_TIME__?: number }).__BUNDLE_START_TIME__;
  if (start === undefined) return;
  perfLog(`[pewpew] startup first frame ${(performance.now() - start).toFixed(0)} ms after bundle start`);
}

const pick = (sorted: Float64Array, q: number) => sorted[Math.min(FRAMES - 1, Math.floor(FRAMES * q))];

/**
 * Per window of 600 played frames: the JS cost of a frame (sim, bot, renderer), the interval between frames as the display
 * delivered them, frames that took over 1.5 times the median interval (each one a visible hitch), and the Hermes heap.
 * With FRAME_TIMING on (perf builds) it also splits the frame cost into phases; `other` is what the phases do not cover
 * (React hud updates, audio scheduling, the loop itself).
 */
export function createTickTimer() {
  const ms = new Float64Array(FRAMES);
  const gap = new Float64Array(FRAMES);
  const phases = Object.fromEntries([...FRAME_PHASES, 'other'].map((p) => [p, new Float64Array(FRAMES)])) as Record<string, Float64Array>;
  let n = 0, window = 0;
  return {
    reset(): void { n = 0; window = 0; },
    add(sample: number, interval: number, level: number, auto: boolean): void {
      ms[n] = sample;
      gap[n] = interval;
      if (FRAME_TIMING.on) {
        let covered = 0;
        for (const phase of FRAME_PHASES) {
          phases[phase][n] = FRAME_TIMING[phase];
          covered += FRAME_TIMING[phase];
        }
        phases.other[n] = Math.max(0, sample - covered);
      }
      n++;
      if (n < FRAMES) return;
      n = 0;
      window++;
      const sorted = ms.slice().sort();
      const avg = sorted.reduce((a, b) => a + b, 0) / FRAMES;
      const gaps = gap.slice().sort();
      const median = pick(gaps, 0.5);
      let long = 0;
      for (let i = 0; i < FRAMES; i++) if (gap[i] > median * 1.5) long++;
      const heap = hermes?.getInstrumentedStats?.();
      let split = '';
      if (FRAME_TIMING.on) {
        split = ' | phases avg/p95';
        for (const [phase, values] of Object.entries(phases)) {
          const v = values.slice().sort();
          split += ` ${phase} ${(v.reduce((a, b) => a + b, 0) / FRAMES).toFixed(2)}/${pick(v, 0.95).toFixed(2)}`;
        }
      }
      perfLog(`[pewpew] tick level ${level}${auto ? ' auto' : ''} window ${window} avg ${avg.toFixed(2)} ms p95 ${pick(sorted, 0.95).toFixed(2)} ms max ${sorted[FRAMES - 1].toFixed(2)} ms over ${FRAMES} frames`
        + ` | frame p50 ${median.toFixed(2)} p95 ${pick(gaps, 0.95).toFixed(2)} p99 ${pick(gaps, 0.99).toFixed(2)} max ${gaps[FRAMES - 1].toFixed(2)} ms, long ${long}`
        + split
        + (heap ? ` | heap ${mb(heap.js_heapSize)} MB allocated ${mb(heap.js_allocatedBytes)} MB` : ''));
    },
  };
}
