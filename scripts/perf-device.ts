/// <reference types="node" />
/*
 * Device frame benchmark. Launches a perf build (EXPO_PUBLIC_PERF=auto, see src/dev/qa.ts), which plays level 1 by
 * itself following PERF_PLAN (bot, then no input, twice each), waits for it to finish, reads its log, and writes a summary.
 *
 *   npm run perf:device -- --android emulator-5554 --label lowend-emulator [--build]
 *   npm run perf:device -- --ios-sim <udid> --label iphone-17-sim [--build]
 *   npm run perf:device -- --ios-device <udid> --label iphone-16-pro-max [--build]
 *
 * --build makes a Release perf build first and installs it. Without it, the installed app must already be one.
 * --from-log <file> summarizes a log saved earlier instead of running anything. --device "<name>" names the device.
 * --startup <n> measures only startup instead: n cold launches, each stopped at its first frame, reported as medians.
 * --baseline perf/device/<earlier>.json adds a change column. --out sets the result path without extension
 * (default perf/device/<version>-<label>); both .json and .md are written.
 *
 * Android reads logcat. iOS reads the AsyncStorage file the perf build writes: from the simulator's data container, or
 * over the network from a phone with `xcrun devicectl device copy from`.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { FRAME_PHASES } from '../src/frameTiming';

const BUNDLE = 'com.saeed.pewpew';
const PERF_KEY = 'pewpew.perf';
const ROOT = new URL('..', import.meta.url).pathname;
const POLL_MS = 15_000;
const TIMEOUT_MS = 20 * 60_000;

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

type Target = { kind: 'android'; id: string } | { kind: 'ios-sim'; id: string } | { kind: 'ios-device'; id: string };
function parseTarget(): Target {
  for (const kind of ['android', 'ios-sim', 'ios-device'] as const) {
    const id = flag(`--${kind}`);
    if (id) return { kind, id };
  }
  console.error('usage: npm run perf:device -- (--android <serial> | --ios-sim <udid> | --ios-device <udid>) [--label name] [--build] [--baseline file.json] [--out path]');
  process.exit(2);
}
const target = parseTarget();

const run = (cmd: string, argv: string[], env?: Record<string, string>): string =>
  execFileSync(cmd, argv, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 });
const loud = (cmd: string, argv: string[], cwd = ROOT, env?: Record<string, string>): void => {
  console.log(`$ ${cmd} ${argv.join(' ')}`);
  execFileSync(cmd, argv, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const PERF_ENV = { EXPO_PUBLIC_PERF: 'auto', EXPO_NO_TYPESCRIPT_SETUP: '1' };
const ANDROID_HOME = process.env.ANDROID_HOME ?? join(process.env.HOME ?? '', 'Library/Android/sdk');
const adb = (...argv: string[]) => run(join(ANDROID_HOME, 'platform-tools/adb'), ['-s', target.id, ...argv]);

function build(): void {
  if (target.kind === 'android') {
    if (!existsSync(join(ROOT, 'android'))) loud('npx', ['expo', 'prebuild', '--platform', 'android'], ROOT, PERF_ENV);
    loud('./gradlew', ['assembleRelease', '-PreactNativeArchitectures=arm64-v8a',
      '-Dorg.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g', '--console=plain'], join(ROOT, 'android'), { ...PERF_ENV, ANDROID_HOME });
    adb('install', '-r', join(ROOT, 'android/app/build/outputs/apk/release/app-release.apk'));
    return;
  }
  if (!existsSync(join(ROOT, 'ios'))) loud('npx', ['expo', 'prebuild', '--platform', 'ios'], ROOT, PERF_ENV);
  const derived = join(tmpdir(), 'pewpew-perf-dd');
  const device = target.kind === 'ios-device';
  loud('xcodebuild', ['-workspace', 'ios/PewPew.xcworkspace', '-scheme', 'PewPew', '-configuration', 'Release',
    '-destination', `id=${target.id}`, '-derivedDataPath', derived,
    ...(device ? ['-allowProvisioningUpdates', 'DEVELOPMENT_TEAM=V3HN8HXZYK', 'CODE_SIGN_STYLE=Automatic'] : []), 'build'], ROOT, PERF_ENV);
  const app = join(derived, `Build/Products/Release-${device ? 'iphoneos' : 'iphonesimulator'}/PewPew.app`);
  if (device) run('xcrun', ['devicectl', 'device', 'install', 'app', '--device', target.id, app]);
  else run('xcrun', ['simctl', 'install', target.id, app]);
}

/** AsyncStorage keeps values over 1 KB in a file named by the key's MD5, and smaller ones inline in manifest.json. */
function readStorage(dir: string): string | null {
  const file = join(dir, createHash('md5').update(PERF_KEY).digest('hex'));
  if (existsSync(file)) return readFileSync(file, 'utf8');
  const manifest = join(dir, 'manifest.json');
  if (!existsSync(manifest)) return null;
  const value = (JSON.parse(readFileSync(manifest, 'utf8')) as Record<string, string | null>)[PERF_KEY];
  return typeof value === 'string' ? value : null;
}

const STORAGE = `Library/Application Support/${BUNDLE}/RCTAsyncLocalStorage_V1`;
const simStorage = () => join(run('xcrun', ['simctl', 'get_app_container', target.id, BUNDLE, 'data']).trim(), STORAGE);

function launch(): void {
  if (target.kind === 'android') {
    adb('shell', 'am', 'force-stop', BUNDLE);
    adb('logcat', '-c');
    adb('shell', 'am', 'start', '-n', `${BUNDLE}/.MainActivity`);
  } else if (target.kind === 'ios-sim') {
    try { run('xcrun', ['simctl', 'terminate', target.id, BUNDLE]); } catch { /* not running */ }
    rmSync(join(simStorage(), createHash('md5').update(PERF_KEY).digest('hex')), { force: true });
    run('xcrun', ['simctl', 'launch', target.id, BUNDLE]);
  } else {
    run('xcrun', ['devicectl', 'device', 'process', 'launch', '--device', target.id, '--terminate-existing', BUNDLE]);
  }
}

function readLog(): string {
  if (target.kind === 'android') {
    // Release builds still send console.log to logcat under ReactNativeJS.
    return adb('logcat', '-d', '-s', 'ReactNativeJS:I').split('\n').map((l) => l.slice(l.indexOf('[pewpew]'))).filter((l) => l.startsWith('[pewpew]')).join('\n');
  }
  if (target.kind === 'ios-sim') return readStorage(simStorage()) ?? '';
  const dest = mkdtempSync(join(tmpdir(), 'pewpew-perf-'));
  try {
    run('xcrun', ['devicectl', 'device', 'copy', 'from', '--device', target.id, '--domain-type', 'appDataContainer',
      '--domain-identifier', BUNDLE, '--source', STORAGE, '--destination', dest]);
    return readStorage(dest) ?? readStorage(join(dest, 'RCTAsyncLocalStorage_V1')) ?? '';
  } catch {
    return '';
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}

interface Window {
  auto: boolean;
  jsAvg: number; jsP95: number; jsMax: number; frames: number;
  gapP50: number; gapP95: number; gapP99: number; gapMax: number; long: number;
  phases: Record<string, number>;
  heapMb: number | null;
}

const TICK = /\[pewpew\] tick level \d+( auto)? window \d+ avg ([\d.]+) ms p95 ([\d.]+) ms max ([\d.]+) ms over (\d+) frames \| frame p50 ([\d.]+) p95 ([\d.]+) p99 ([\d.]+) max ([\d.]+) ms, long (\d+)/;
const PHASES = /\| phases avg\/p95 ([^|]*)/;
const HEAP = /\| heap ([\d.]+) MB/;

function parseWindows(log: string): Window[] {
  const out: Window[] = [];
  for (const line of log.split('\n')) {
    const m = TICK.exec(line);
    if (!m) continue;
    const phases: Record<string, number> = {};
    for (const [, name, avg] of (PHASES.exec(line)?.[1] ?? '').matchAll(/(\w+) ([\d.]+)\/[\d.]+/g)) phases[name] = Number(avg);
    const heap = HEAP.exec(line);
    out.push({
      auto: m[1] !== undefined, jsAvg: Number(m[2]), jsP95: Number(m[3]), jsMax: Number(m[4]), frames: Number(m[5]),
      gapP50: Number(m[6]), gapP95: Number(m[7]), gapP99: Number(m[8]), gapMax: Number(m[9]), long: Number(m[10]),
      phases, heapMb: heap === null ? null : Number(heap[1]),
    });
  }
  return out;
}

interface ModeSummary {
  windows: number;
  frames: number;
  /**
   * Display refresh rate implied by the median frame interval. JS and frame figures are the median window's, so one
   * window the device or its host stalled does not move them; hitches and worst frame count every window.
   */
  hz: number;
  jsAvg: number;
  jsP95: number;
  jsMax: number;
  /** Frames whose interval was over 1.5 times the median: each one a visible hitch. */
  longFrames: number;
  longPct: number;
  worstFrameMs: number;
  frameP99Ms: number;
  phases: Record<string, number>;
  heapMb: number | null;
}

export interface DeviceResult {
  version: string;
  commit: string;
  label: string;
  platform: Target['kind'];
  device: string;
  date: string;
  startupMs: number | null;
  /**
   * The session's first 600 frames, kept out of `modes`: the app has just launched, the GPU driver is still building
   * pipelines, and on an emulator the system is often still settling. One such window can triple a mode's average.
   */
  warmup: { jsAvg: number; worstFrameMs: number; longFrames: number } | null;
  /** `bot`: greedyBot plays. `play`: no bot and no input, so the frame is the game without the bot's search. */
  modes: Partial<Record<'bot' | 'play', ModeSummary>>;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];

function summarize(windows: Window[]): ModeSummary | undefined {
  if (windows.length === 0) return undefined;
  const frames = windows.reduce((a, w) => a + w.frames, 0);
  const longFrames = windows.reduce((a, w) => a + w.long, 0);
  const phases: Record<string, number> = {};
  for (const name of [...FRAME_PHASES, 'other']) {
    const values = windows.map((w) => w.phases[name]).filter((v) => v !== undefined);
    if (values.length > 0) phases[name] = mean(values);
  }
  return {
    windows: windows.length, frames, hz: Math.round(1000 / median(windows.map((w) => w.gapP50))),
    jsAvg: median(windows.map((w) => w.jsAvg)), jsP95: median(windows.map((w) => w.jsP95)), jsMax: Math.max(...windows.map((w) => w.jsMax)),
    longFrames, longPct: (longFrames / frames) * 100, worstFrameMs: Math.max(...windows.map((w) => w.gapMax)),
    frameP99Ms: median(windows.map((w) => w.gapP99)), phases, heapMb: windows.at(-1)?.heapMb ?? null,
  };
}

function describeDevice(): string {
  try {
    if (target.kind === 'android') {
      const prop = (name: string) => adb('shell', 'getprop', name).trim();
      return `${prop('ro.product.model')}, Android ${prop('ro.build.version.release')}, ${adb('shell', 'nproc').trim()} cores`;
    }
    if (target.kind === 'ios-sim') {
      const list = JSON.parse(run('xcrun', ['simctl', 'list', 'devices', '-j'])) as { devices: Record<string, { udid: string; name: string }[]> };
      for (const [runtime, devices] of Object.entries(list.devices)) {
        const d = devices.find((x) => x.udid === target.id);
        if (d) return `${d.name} simulator, ${runtime.split('.').pop()}`;
      }
    }
  } catch { /* fall through */ }
  return target.id;
}

function gitCommit(): string {
  try { return run('git', ['rev-parse', '--short', 'HEAD']).trim(); } catch { return 'unknown'; }
}

const f2 = (v: number) => v.toFixed(2);
const change = (now: number, before: number | undefined, worseIsUp = true) => {
  if (before === undefined || before === 0) return '';
  const p = ((now - before) / before) * 100;
  return ` (${p >= 0 ? '+' : ''}${p.toFixed(0)}%${(worseIsUp ? p : -p) > 15 ? ' ⚠' : ''})`;
};

function markdown(r: DeviceResult, base: DeviceResult | null): string {
  const lines = [`## Device benchmark: ${r.version} (${r.commit}) on ${r.label}`, '', `${r.device}. ${r.date.slice(0, 10)}.`
    + (r.startupMs === null ? '' : ` First frame ${r.startupMs} ms after the bundle started${change(r.startupMs, base?.startupMs ?? undefined)}.`)
    + (r.warmup === null ? '' : ` The first 600 frames after launch (left out below) averaged ${f2(r.warmup.jsAvg)} ms of JS with ${r.warmup.longFrames} hitches.`)
    + (base ? ` Changes against ${base.version} (${base.commit}).` : ''), ''];
  lines.push('| mode | frames | display | JS avg | JS p95 | JS max | hitches | worst frame | frame p99 | heap |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const [mode, s] of Object.entries(r.modes) as ['bot' | 'play', ModeSummary][]) {
    const b = base?.modes[mode];
    lines.push(`| ${mode} | ${s.frames} | ${s.hz} Hz | ${f2(s.jsAvg)} ms${change(s.jsAvg, b?.jsAvg)} | ${f2(s.jsP95)} ms${change(s.jsP95, b?.jsP95)} | ${f2(s.jsMax)} ms`
      + ` | ${s.longFrames} (${s.longPct.toFixed(2)}%) | ${f2(s.worstFrameMs)} ms | ${f2(s.frameP99Ms)} ms${change(s.frameP99Ms, b?.frameP99Ms)} | ${s.heapMb ?? '?'} MB |`);
  }
  const names = [...FRAME_PHASES, 'other'];
  lines.push('', 'JS milliseconds per frame by phase (averages):', '', `| mode | ${names.join(' | ')} |`, `| --- |${names.map(() => ' ---: ').join('|')}|`);
  for (const [mode, s] of Object.entries(r.modes) as [string, ModeSummary][]) {
    lines.push(`| ${mode} | ${names.map((n) => (s.phases[n] === undefined ? '?' : f2(s.phases[n]))).join(' | ')} |`);
  }
  return `${lines.join('\n')}\n`;
}

async function collect(): Promise<string> {
  const saved = flag('--from-log');
  if (saved) return readFileSync(saved, 'utf8');
  if (args.includes('--build')) build();
  const startedAt = Date.now();
  launch();
  console.log(`launched ${BUNDLE} on ${target.kind} ${target.id}; waiting for the perf plan to finish (up to ${TIMEOUT_MS / 60_000} min)`);

  let log = '';
  for (;;) {
    await sleep(POLL_MS);
    log = readLog();
    const session = /\[pewpew\] perf session (\d+)/.exec(log);
    // A phone's storage holds the last session until this one writes; its clock may differ from this machine's by seconds.
    const fresh = target.kind !== 'ios-device' || (session !== null && Number(session[1]) > startedAt - 60_000);
    const windows = fresh ? parseWindows(log).length : 0;
    if (fresh && /\[pewpew\] perf done/.test(log)) break;
    if (Date.now() - startedAt > TIMEOUT_MS) throw new Error(`no "perf done" after ${TIMEOUT_MS / 60_000} min; ${windows} windows logged. Is the installed app a perf build (EXPO_PUBLIC_PERF=auto)?`);
    console.log(`  ${Math.round((Date.now() - startedAt) / 1000)} s: ${windows} windows of 600 frames so far`);
  }
  return log;
}

const STARTUP_LINE = /\[pewpew\] startup first frame (\d+) ms after bundle start(?: \| renderer ([\d.]+) ms(?:, shader code ([\d.]+) ms)?)?/;

interface StartupRun { firstFrame: number; renderer: number | null; shaderCode: number | null }

/** Cold launches: stop the app, launch it, wait for its first frame's startup line, repeat. */
async function startupRuns(n: number): Promise<StartupRun[]> {
  if (args.includes('--build')) build();
  const runs: StartupRun[] = [];
  for (let i = 0; i < n; i++) {
    const startedAt = Date.now();
    launch();
    for (;;) {
      await sleep(1000);
      const log = readLog();
      const session = /\[pewpew\] perf session (\d+)/.exec(log);
      const m = STARTUP_LINE.exec(log);
      if (m && (target.kind !== 'ios-device' || (session !== null && Number(session[1]) > startedAt - 60_000))) {
        runs.push({ firstFrame: Number(m[1]), renderer: m[2] === undefined ? null : Number(m[2]), shaderCode: m[3] === undefined ? null : Number(m[3]) });
        console.log(`  launch ${i + 1}/${n}: first frame ${m[1]} ms, renderer ${m[2] ?? '?'} ms, shader code ${m[3] ?? '?'} ms`);
        break;
      }
      if (Date.now() - startedAt > 60_000) throw new Error(`launch ${i + 1}: no startup line after 60 s`);
    }
  }
  if (target.kind === 'android') adb('shell', 'am', 'force-stop', BUNDLE);
  return runs;
}

function reportStartup(runs: StartupRun[]): void {
  const row = (name: string, values: number[]) => {
    if (values.length === 0) return `| ${name} | ? | ? | ? |`;
    const sorted = values.slice().sort((a, b) => a - b);
    return `| ${name} | ${median(sorted).toFixed(1)} ms | ${sorted[0].toFixed(1)} ms | ${sorted[sorted.length - 1].toFixed(1)} ms |`;
  };
  const md = [`## Startup: ${runs.length} cold launches on ${flag('--label') ?? target.id} (${gitCommit()})`, '',
    '| measure | median | min | max |', '| --- | ---: | ---: | ---: |',
    row('bundle start to first frame', runs.map((r) => r.firstFrame)),
    row('createRenderer', runs.flatMap((r) => (r.renderer === null ? [] : [r.renderer]))),
    row('  of which shader code', runs.flatMap((r) => (r.shaderCode === null ? [] : [r.shaderCode]))), ''].join('\n');
  const out = flag('--out');
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(`${out}.json`, `${JSON.stringify({ commit: gitCommit(), label: flag('--label') ?? target.id, runs }, null, 2)}\n`);
    writeFileSync(`${out}.md`, `${md}\n`);
  }
  console.log(`\n${md}`);
}

async function main(): Promise<void> {
  const launches = flag('--startup');
  if (launches) return reportStartup(await startupRuns(Number(launches)));
  const log = await collect();

  const [first, ...windows] = parseWindows(log);
  const startup = STARTUP_LINE.exec(log);
  const appConfig = readFileSync(join(ROOT, 'app.config.ts'), 'utf8');
  const label = flag('--label') ?? target.id;
  const result: DeviceResult = {
    version: /version: '([^']+)'/.exec(appConfig)?.[1] ?? 'unknown',
    commit: gitCommit(),
    label,
    platform: target.kind,
    device: flag('--device') ?? describeDevice(),
    date: (flag('--from-log') ? statSync(flag('--from-log')!).mtime : new Date()).toISOString(),
    startupMs: startup ? Number(startup[1]) : null,
    warmup: first === undefined ? null : { jsAvg: first.jsAvg, worstFrameMs: first.gapMax, longFrames: first.long },
    modes: { bot: summarize(windows.filter((w) => w.auto)), play: summarize(windows.filter((w) => !w.auto)) },
  };
  const basePath = flag('--baseline');
  const base = basePath ? (JSON.parse(readFileSync(basePath, 'utf8')) as DeviceResult) : null;
  const out = flag('--out') ?? join(ROOT, 'perf/device', `${result.version}-${label}`);
  mkdirSync(dirname(out), { recursive: true });
  const md = markdown(result, base);
  writeFileSync(`${out}.json`, `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(`${out}.md`, md);
  writeFileSync(`${out}.log`, `${log}\n`);
  console.log(`\n${md}\nwrote ${out}.json, .md, and .log`);
}

void main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
