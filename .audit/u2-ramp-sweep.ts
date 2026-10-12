/// <reference types="node" />
/*
 * Tuning lever for the level table. For each row it flies greedyBot over the row's seed and N derived candidate
 * seeds, then prints the expected lives lost and loss rate. One fixed seed is a single chaotic sample, so this is the
 * difficulty a row actually encodes.
 * With --write-seeds it sets each row's seed to the first candidate whose greedyBot lives lost equals the rounded mean
 * and, from level 4 up, on which idleBot loses, so the shipped layout is a typical sample of its row that meets every
 * verifier property. The current seed is candidate 0, so a rerun keeps a seed that still qualifies.
 *   npx tsx .audit/u2-ramp-sweep.ts [N=40] [--write-seeds]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { LEVELS } from '../src/levels';
import { simulate } from '../src/sim';
import { greedyBot, idleBot } from '../src/bot';

const N = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 40);
const write = process.argv.includes('--write-seeds');
/** Candidate 0 is the row's current seed; the rest depend only on (n, k), so reruns average over the same population. */
const candidate = (n: number, seed: number, k: number): number => (k === 0 ? seed : Math.imul(Math.imul(n, 0x85ebca6b) ^ Math.imul(k, 0x9e3779b9), 2654435761) | 0);
const hex = (s: number): string => `0x${(s >>> 0).toString(16).padStart(8, '0')}`;

let source = readFileSync(new URL('../src/levels.ts', import.meta.url), 'utf8');
console.log(`lvl  mean-lost  losses  idle-wins  seed-lost  typical  seed`);
for (const spec of LEVELS) {
  const row = spec as { seed: number };
  const original = row.seed;
  const lost: number[] = [];
  const idleWon: boolean[] = [];
  for (let k = 0; k <= N; k++) {
    row.seed = candidate(spec.n, original, k);
    const r = simulate(spec.n, greedyBot);
    lost.push(r.outcome === 'won' ? 3 - r.stars : 3);
    idleWon.push(simulate(spec.n, idleBot).outcome !== 'lost');
  }
  row.seed = original;
  const mean = lost.reduce((a, b) => a + b, 0) / lost.length;
  const typical = Math.min(2, Math.floor(mean + 0.5));
  const pick = lost.findIndex((l, k) => l === typical && (spec.n < 4 || !idleWon[k]));
  const chosen = pick < 0 ? original : candidate(spec.n, original, pick);
  console.log(`${String(spec.n).padStart(3)}  ${mean.toFixed(2).padStart(9)}  ${String(lost.filter((l) => l === 3).length).padStart(3)}/${lost.length}  ${String(idleWon.filter(Boolean).length).padStart(6)}/${lost.length}  ${String(lost[0]).padStart(9)}  ${String(typical).padStart(7)}  ${hex(original)}${chosen !== original ? ` -> ${hex(chosen)}` : ''}`);
  if (write && chosen !== original) source = source.replace(`{ n: ${spec.n}, seed: ${hex(original)},`, `{ n: ${spec.n}, seed: ${hex(chosen)},`);
}
if (write) writeFileSync(new URL('../src/levels.ts', import.meta.url), source);
