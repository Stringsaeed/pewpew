import { levelSpec } from '../levels';
import type { LevelNumber } from '../levels';
import { COAST } from './input';
import type { Input } from './input';
import { TICKS_PER_SEC } from './rules';
import { step } from './step';
import { createWorld } from './world';
import type { SimEvent, Stars, World, WorldView } from './world';

export type Bot = (w: WorldView) => Input;
export interface RunResult {
  readonly outcome: 'won' | 'lost' | 'timeout';
  readonly steps: number; readonly score: number; readonly stars: 0 | Stars;
  readonly hash: number;         // FNV-1a over final world state
  readonly dropped: number;
  readonly inputs: Float32Array; // one per step, NaN = coast; feed to replay()
}
/** Headless run through the same createWorld and step the app uses. */
export function simulate(n: LevelNumber, bot: Bot, maxSteps?: number): RunResult {
  const spec = levelSpec(n);
  const limit = maxSteps ?? Math.floor((spec.length / spec.scroll + 240) * TICKS_PER_SEC);
  return run(n, limit, (w) => {
    const x = bot(w).targetX;
    return x === null ? NaN : x;
  });
}
export function replay(n: LevelNumber, inputs: Float32Array): RunResult {
  return run(n, inputs.length, (_, i) => inputs[i]);
}

/** The input is stored as float32 before it is stepped, so the recorded stream replays bit for bit. */
function run(n: LevelNumber, maxSteps: number, next: (w: World, i: number) => number): RunResult {
  const w = createWorld(n);
  const inputs = new Float32Array(maxSteps);
  const out: SimEvent[] = [];
  let i = 0;
  for (; i < maxSteps && (w.phase.p === 'fly' || w.phase.p === 'boss'); i++) {
    inputs[i] = next(w, i);
    const x = inputs[i];
    step(w, x === x ? { targetX: x } : COAST, out);
    out.length = 0;
  }
  const ph = w.phase;
  return {
    outcome: ph.p === 'won' ? 'won' : ph.p === 'lost' ? 'lost' : 'timeout',
    steps: i,
    score: w.score,
    stars: ph.p === 'won' ? ph.stars : 0,
    hash: hashWorld(w),
    dropped: w.dropped,
    inputs: inputs.slice(0, i),
  };
}

const PHASE_CODE = { fly: 1, boss: 2, won: 3, lost: 4 } as const;

export function hashWorld(w: World): number {
  const f = new Float64Array(1);
  const u = new Uint32Array(f.buffer);
  let h = 0x811c9dc5;
  const word = (v: number): void => {
    h = Math.imul(h ^ (v & 0xff), 16777619);
    h = Math.imul(h ^ ((v >>> 8) & 0xff), 16777619);
    h = Math.imul(h ^ ((v >>> 16) & 0xff), 16777619);
    h = Math.imul(h ^ (v >>> 24), 16777619);
  };
  const num = (v: number): void => { f[0] = v; word(u[0]); word(u[1]); };
  const p = w.player, b = w.bodies;
  num(w.tick); num(w.score); num(w.rng); num(w.cursor); num(w.dropped); num(PHASE_CODE[w.phase.p]);
  num(p.x); num(p.y); num(p.vx); num(p.lives); num(p.shield ? 1 : 0); num(p.rapidUntilTick); num(p.invulnUntilTick);
  num(b.count);
  for (let i = 0; i < b.count; i++) { num(b.kind[i]); num(b.x[i]); num(b.y[i]); num(b.hp[i]); }
  if (w.boss !== null) { num(w.boss.hp); num(w.boss.x); num(w.boss.attack); }
  return h >>> 0;
}
