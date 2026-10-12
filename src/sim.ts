import type { BossId, Kind, LevelNumber, LevelSpec, PickupKind } from './levels';

const NI = (): never => { throw new Error('not implemented'); };

// Math.random, Math.sin, Math.cos, and Math.pow are banned in this file. Engine trig differs in the last ulp between
// Hermes and V8, which would make the verifier prove a slightly different game than the one on the phone.

export const STEP = 1 / 60;
export const TRACK_HALF_WIDTH = 4.5;
export const MAX_BODIES = 512;

/** One input per step. targetX is the world x the rocket steers toward. null means the finger is up, so the rocket coasts and wells pull it. */
export interface Input { readonly targetX: number | null }
export const COAST: Input = { targetX: null };
/** Relative drag. anchorX is the rocket x when the finger went down; dxFrac is finger dx / screen width. */
export function dragInput(anchorX: number, dxFrac: number): Input { return NI(); }

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
  rapidUntil: number;  // tick
  invulnUntil: number; // tick
  fireAt: number;      // tick
}
export interface Boss { readonly id: BossId; x: number; px: number; y: number; hp: number; attack: number; attackAt: number }

export type Stars = 1 | 2 | 3;
/** Run phase. 'won' and 'lost' are terminal, so step() on them is a no-op that emits nothing. */
export type Phase =
  | { readonly p: 'fly' }
  | { readonly p: 'boss' }
  | { readonly p: 'won'; readonly stars: Stars }
  | { readonly p: 'lost' };

export interface Spawn { readonly y: number; readonly x: number; readonly kind: Kind; readonly variant: number; readonly param: number }
/** Compiled from (LevelSpec, seed) once at createWorld, sorted by y. */
export type Track = readonly Spawn[];

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

export function createWorld(n: LevelNumber): World { return NI(); }

/**
 * Advance one STEP. Appends events to `out`; the caller clears it once per rendered frame, after several steps.
 * Order: snapshot px/py, steer and well pull, scroll (held in 'boss'), spawn from track, fire, move bodies by kind,
 * collide by role, despawn behind camera, phase transition.
 */
export function step(w: World, input: Input, out: SimEvent[]): void { NI(); }

export interface Hud {
  readonly score: number; readonly lives: number; readonly progress: number; // 0..100 integer
  readonly shield: boolean; readonly rapid: boolean; readonly bossHp: number | null; // 0..100
}
/** Returns `prev` itself when nothing visible changed, so React's setState bails out at 60 fps. */
export function hudOf(w: WorldView, prev: Hud | null): Hud { return NI(); }

export type Bot = (w: WorldView) => Input;
export interface RunResult {
  readonly outcome: 'won' | 'lost' | 'timeout';
  readonly steps: number; readonly score: number; readonly stars: 0 | Stars;
  readonly hash: number;         // FNV-1a over final world state
  readonly dropped: number;
  readonly inputs: Float32Array; // one per step, NaN = coast; feed to replay()
}
/** Headless run through the same createWorld and step the app uses. */
export function simulate(n: LevelNumber, bot: Bot, maxSteps?: number): RunResult { return NI(); }
export function replay(n: LevelNumber, inputs: Float32Array): RunResult { return NI(); }

/** Stratified placement: hazards by mix weights, wells spaced evenly, a 1.6-unit gap guaranteed per row. */
function compileTrack(spec: LevelSpec): Track { return NI(); }
/** Range-reduced odd polynomial, bit-identical across engines. */
function sinT(x: number): number { return NI(); }
