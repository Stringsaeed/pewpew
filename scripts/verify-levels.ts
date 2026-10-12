/// <reference types="node" />
/*
 * CI proof of "30 levels". Exits 1 on any failure and prints a per-level stats table.
 * Importing LEVELS already ran defineLevels, which throws on a malformed table; the checks below repeat the shape
 * assertions so a weakened validator cannot hide a bad table.
 */
import { performance } from 'node:perf_hooks';
import { BOSSES, LEVELS, RAMP, tierOf } from '../src/levels';
import { replay, simulate } from '../src/sim';
import { greedyBot, idleBot } from '../src/bot';

const STEP_BUDGET_MS = 2;
const failures: string[] = [];
const check = (ok: boolean, msg: string): void => { if (!ok) failures.push(msg); };

check(LEVELS.length === 30, `expected 30 levels, got ${LEVELS.length}`);
LEVELS.forEach((spec, i) => {
  check(spec.n === i + 1, `row ${i} has n ${spec.n}`);
  check((spec.boss !== null) === (spec.n % 10 === 0), `level ${spec.n}: boss ${spec.boss}`);
});
for (const col of Object.keys(RAMP) as (keyof typeof RAMP)[]) {
  if (RAMP[col] !== 'nondecreasing') continue;
  for (let i = 1; i < LEVELS.length; i++) {
    check(LEVELS[i][col] >= LEVELS[i - 1][col], `RAMP ${col} falls at level ${i + 1}`);
  }
}
check(BOSSES.warden.hp < BOSSES.hive.hp && BOSSES.hive.hp < BOSSES.core.hp, 'boss hp must rise warden < hive < core');

const pad = (v: unknown, n: number): string => String(v).padStart(n);
console.log(['lvl', 'outcome', 'steps', 'secs', 'scroll s', 'score', 'stars', 'lost', 'dropped', 'hash', 'replay', 'idle', 'ms/step']
  .map((h, i) => pad(h, [3, 7, 6, 5, 8, 6, 5, 4, 7, 10, 6, 5, 7][i])).join(' '));

const livesLost: Record<1 | 2 | 3, number[]> = { 1: [], 2: [], 3: [] };
let stepMs = 0, stepCount = 0, worstLevelMs = 0;
for (const spec of LEVELS) {
  const r = simulate(spec.n, greedyBot);
  const t0 = performance.now();
  const rp = replay(spec.n, r.inputs);
  const ms = performance.now() - t0;
  const idle = simulate(spec.n, idleBot);
  const lost = r.outcome === 'won' ? 3 - r.stars : 3;
  const perStep = ms / rp.steps;
  stepMs += ms; stepCount += rp.steps; worstLevelMs = Math.max(worstLevelMs, perStep);
  livesLost[tierOf(spec.n)].push(lost);

  check(r.outcome === 'won', `level ${spec.n}: greedyBot ${r.outcome}`);
  check(r.dropped === 0, `level ${spec.n}: dropped ${r.dropped} spawns`);
  const same = rp.hash === r.hash && rp.steps === r.steps && rp.score === r.score;
  check(same, `level ${spec.n}: replay hash ${rp.hash} != ${r.hash}`);
  if (spec.n >= 4) check(idle.outcome === 'lost', `level ${spec.n}: idleBot ${idle.outcome}`);
  console.log([spec.n, r.outcome, r.steps, (r.steps / 60).toFixed(1), (spec.length / spec.scroll).toFixed(1), r.score, r.stars, lost,
    r.dropped, r.hash.toString(16).padStart(8, '0'), same ? 'ok' : 'DIFF', idle.outcome, perStep.toFixed(4)]
    .map((v, i) => pad(v, [3, 7, 6, 5, 8, 6, 5, 4, 7, 10, 6, 5, 7][i])).join(' '));
}

const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const tiers = [avg(livesLost[1]), avg(livesLost[2]), avg(livesLost[3])];
console.log(`greedyBot lives lost per level, tier averages: ${tiers.map((t) => t.toFixed(2)).join(' <= ')}`);
check(tiers[0] <= tiers[1] && tiers[1] <= tiers[2], `lives lost per tier must not fall: ${tiers.join(', ')}`);
console.log(`step cost (replay, no bot): ${(stepMs / stepCount).toFixed(4)} ms/step average over ${stepCount} steps; worst level ${worstLevelMs.toFixed(4)} ms/step; budget ${STEP_BUDGET_MS} ms`);
check(worstLevelMs < STEP_BUDGET_MS, `step cost ${worstLevelMs} ms exceeds ${STEP_BUDGET_MS} ms`);

if (failures.length > 0) {
  console.log(`\nFAIL (${failures.length})`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log('\nPASS: 30 levels, every level won by greedyBot with no dropped spawns, replay bit-identical');
