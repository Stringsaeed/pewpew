import { ARCHETYPES, Kind, levelSpec } from '../levels';
import type { BossId, LevelNumber, LevelSpec, PickupKind } from '../levels';
import { MAX_BODIES } from './rules';
import { compileTrack } from './track';
import type { Track } from './track';

/** Struct-of-arrays pool, dense in [0, count). Removal swaps the last body in, so indices are not identities. */
export interface Bodies {
  count: number;
  readonly kind: Uint8Array;
  readonly variant: Uint8Array; // mesh variant for asteroids; DronePattern index for drones
  readonly x: Float32Array; readonly y: Float32Array;
  readonly px: Float32Array; readonly py: Float32Array; // previous step, for render interpolation
  readonly vx: Float32Array; readonly vy: Float32Array;
  readonly rot: Float32Array; readonly spin: Float32Array;
  readonly t: Float32Array;     // per-body clock: pattern phase, fire timer
  readonly param: Float32Array; // pattern anchor x for drones, pull for wells
  readonly hp: Int16Array;
}

export interface Player {
  x: number; px: number; vx: number;
  y: number; py: number;
  lives: 0 | 1 | 2 | 3;
  shield: boolean;
  rapidUntilTick: number;
  invulnUntilTick: number;
  fireAtTick: number;
}
/** t is the sweep angle; it accumulates so a phase change alters speed without a jump in x. */
export interface Boss { readonly id: BossId; x: number; px: number; y: number; hp: number; attack: number; attackAtTick: number; t: number }

export type Stars = 1 | 2 | 3;
/** Run phase. 'won' and 'lost' are terminal, so step() on them is a no-op that emits nothing. */
export type Phase =
  | { readonly p: 'fly' }
  | { readonly p: 'boss' }
  | { readonly p: 'won'; readonly stars: Stars }
  | { readonly p: 'lost' };

export interface World {
  readonly spec: LevelSpec;
  readonly track: Track;
  cursor: number;           // next Spawn index
  tick: number;
  rng: number;              // mulberry32 state; the only randomness source
  phase: Phase;
  score: number;
  wormholeY: number | null; // null while a boss lives
  readonly player: Player;
  readonly bodies: Bodies;
  boss: Boss | null;
  dropped: number;          // spawns refused at MAX_BODIES; verifier asserts 0
}

type Column = ArrayLike<number>;
type View<T> = T extends Float32Array | Uint8Array | Int16Array ? Column
  : T extends object ? { readonly [K in keyof T]: View<T[K]> } : T;
/** What the renderer, HUD, and bots get. Mutation does not typecheck. */
export type WorldView = View<World>;

function readonlyViewProof(view: WorldView): void {
  // @ts-expect-error readers cannot write body columns
  view.bodies.x[0] = 1;
  // @ts-expect-error readers cannot move the player
  view.player.x = 1;
}

export type Target = Kind | 'boss';
export type SimEvent =
  | { readonly e: 'start'; readonly level: LevelNumber }
  | { readonly e: 'fire'; readonly x: number; readonly y: number; readonly rapid: boolean }
  | { readonly e: 'enemyFire'; readonly x: number; readonly y: number }
  | { readonly e: 'hit'; readonly target: Target; readonly x: number; readonly y: number }     // shot landed, target survived
  | { readonly e: 'destroy'; readonly target: Target; readonly x: number; readonly y: number } // includes mine detonation
  | { readonly e: 'pickup'; readonly kind: PickupKind; readonly x: number; readonly y: number }
  | { readonly e: 'shieldBlock'; readonly x: number; readonly y: number }
  | { readonly e: 'playerHit'; readonly x: number; readonly y: number; readonly lives: number }
  | { readonly e: 'bossEnter'; readonly boss: BossId }
  | { readonly e: 'wormholeOpen'; readonly y: number }
  | { readonly e: 'won'; readonly score: number; readonly stars: Stars }
  | { readonly e: 'lost'; readonly score: number };
export type EventName = SimEvent['e'];
export type EventOf<E extends EventName> = Extract<SimEvent, { e: E }>;

export function createWorld(n: LevelNumber): World {
  const spec = levelSpec(n);
  return {
    spec,
    track: compileTrack(spec),
    cursor: 0,
    tick: 0,
    rng: (spec.seed ^ 0x5bd1e995) | 0,
    phase: { p: 'fly' },
    score: 0,
    wormholeY: spec.boss === null ? spec.length : null,
    player: { x: 0, px: 0, vx: 0, y: 0, py: 0, lives: 3, shield: false, rapidUntilTick: 0, invulnUntilTick: 0, fireAtTick: 0 },
    bodies: createBodies(),
    boss: null,
    dropped: 0,
  };
}

function createBodies(): Bodies {
  const f = (): Float32Array => new Float32Array(MAX_BODIES);
  return {
    count: 0, kind: new Uint8Array(MAX_BODIES), variant: new Uint8Array(MAX_BODIES),
    x: f(), y: f(), px: f(), py: f(), vx: f(), vy: f(), rot: f(), spin: f(), t: f(), param: f(),
    hp: new Int16Array(MAX_BODIES),
  };
}
const COLUMNS = ['kind', 'variant', 'x', 'y', 'px', 'py', 'vx', 'vy', 'rot', 'spin', 't', 'param', 'hp'] as const;

/** Returns the new index, or -1 when the pool is full (counted in w.dropped). */
export function add(w: World, kind: Kind, x: number, y: number, vx: number, vy: number): number {
  const b = w.bodies;
  if (b.count === MAX_BODIES) { w.dropped++; return -1; }
  const i = b.count++;
  b.kind[i] = kind; b.variant[i] = 0;
  b.x[i] = x; b.y[i] = y; b.px[i] = x; b.py[i] = y; b.vx[i] = vx; b.vy[i] = vy;
  b.rot[i] = 0; b.spin[i] = 0; b.t[i] = 0; b.param[i] = 0;
  b.hp[i] = ARCHETYPES[kind].hp;
  return i;
}
export function remove(b: Bodies, i: number): void {
  const last = --b.count;
  if (i === last) return;
  for (const c of COLUMNS) b[c][i] = b[c][last];
}
