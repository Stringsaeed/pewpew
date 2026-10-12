import { ARCHETYPES, BOSSES, Kind, levelSpec } from './levels';
import type { BossAttack, BossId, BossPhase, BossSpec, DronePattern, LevelNumber, LevelSpec, PickupKind } from './levels';

// This file and levels.ts may use only + - * / and Math.sqrt, imul, floor, min, max, abs (sim.test.ts enforces it).
// Engine trig differs in the last ulp between Hermes and V8, which would make the verifier prove a slightly different
// game than the one on the phone. Those operations are correctly rounded by IEEE 754 on every engine.

export const STEP = 1 / 60;
export const TRACK_HALF_WIDTH = 4.5;
export const MAX_BODIES = 512;

export const PLAYER_RADIUS = 0.35;
const PLAYER_X_LIMIT = TRACK_HALF_WIDTH - 0.5;
const PLAYER_MAX_VX = 9;
const STEER_GAIN = 10;
const STEER_ACCEL = 60;
const COAST_DAMPING = 0.985;
// A full-width finger drag crosses the track with a little to spare.
const DRAG_GAIN = 2 * TRACK_HALF_WIDTH * 1.25;

const FIRE_TICKS = 12;
const RAPID_TICKS = 360;
const HIT_INVULN_TICKS = 90;
const SHIELD_INVULN_TICKS = 30;
const PICKUP_SLACK = 0.25;
const BOLT_SPEED = 28;
const ENEMY_BOLT_SPEED = 8;
const DEAD = -1;

const SPAWN_AHEAD = 24;
const DESPAWN_BEHIND = 6;
const BOLT_RANGE = 26;

const TRACK_START = 20;
const TRACK_END_CLEAR = 12;
const ROW_DY = 5;
const ROW_GAP = 1.6;
const DRONE_ANCHOR_LIMIT = TRACK_HALF_WIDTH - 2.3;

const BOSS_DIST = 12;
const BOSS_R = 1.4;
const BOSS_SWEEP = 3.2;
const BOSS_GRACE_TICKS = 90;
const BOSS_SCORE_PER_HP = 10;
// Neighbouring aimed bolts land about 2 units apart at the rocket's row, wide enough to thread by finger.
const AIM_SPREAD = 0.2;
const WELL_REACH_Y = 5;

const PI = 3.141592653589793;
const TWO_PI = 2 * PI;
const HALF_PI = PI / 2;

/** One input per step. targetX is the world x the rocket steers toward. null means the finger is up, so the rocket coasts and wells pull it. */
export interface Input { readonly targetX: number | null }
export const COAST: Input = { targetX: null };
/** Relative drag. anchorX is the rocket x when the finger went down; dxFrac is finger dx / screen width. */
export function dragInput(anchorX: number, dxFrac: number): Input {
  return { targetX: clamp(anchorX + dxFrac * DRAG_GAIN, -PLAYER_X_LIMIT, PLAYER_X_LIMIT) };
}

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
/** t is the sweep angle; it accumulates so a phase change alters speed without a jump in x. */
export interface Boss { readonly id: BossId; x: number; px: number; y: number; hp: number; attack: number; attackAt: number; t: number }

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
    player: { x: 0, px: 0, vx: 0, y: 0, py: 0, lives: 3, shield: false, rapidUntil: 0, invulnUntil: 0, fireAt: 0 },
    bodies: createBodies(),
    boss: null,
    dropped: 0,
  };
}

/**
 * Advance one STEP. Appends events to `out`; the caller clears it once per rendered frame, after several steps.
 * Order: snapshot px/py, steer and well pull, scroll (held in 'boss'), spawn from track, fire, move bodies by kind,
 * collide by role, despawn behind camera, phase transition.
 */
export function step(w: World, input: Input, out: SimEvent[]): void {
  if (w.phase.p === 'won' || w.phase.p === 'lost') return;
  const p = w.player, b = w.bodies;
  if (w.tick === 0) out.push({ e: 'start', level: w.spec.n });
  p.px = p.x; p.py = p.y;
  for (let i = 0; i < b.count; i++) { b.px[i] = b.x[i]; b.py[i] = b.y[i]; }
  if (w.boss !== null) w.boss.px = w.boss.x;

  steer(w, input);
  if (w.phase.p === 'fly') p.y += w.spec.scroll * STEP;
  spawnFromTrack(w);
  fire(w, out);
  if (w.boss !== null) runBoss(w, w.boss, out);
  moveBodies(w, out);
  collide(w, out);
  despawn(w);
  transition(w, out);
  w.tick++;
}

export interface Hud {
  readonly score: number; readonly lives: number; readonly progress: number; // 0..100 integer
  readonly shield: boolean; readonly rapid: boolean; readonly bossHp: number | null; // 0..100
}
/** Returns `prev` itself when nothing visible changed, so React's setState bails out at 60 fps. */
export function hudOf(w: WorldView, prev: Hud | null): Hud {
  const p = w.player;
  const score = w.score;
  const lives = p.lives;
  const progress = Math.floor(100 * Math.min(1, p.y / w.spec.length));
  const shield = p.shield;
  const rapid = w.tick < p.rapidUntil;
  const max = w.boss === null ? 0 : BOSSES[w.boss.id].hp;
  const bossHp = w.boss === null ? null : Math.floor((100 * Math.max(0, w.boss.hp) + max - 1) / max);
  if (prev !== null && prev.score === score && prev.lives === lives && prev.progress === progress
    && prev.shield === shield && prev.rapid === rapid && prev.bossHp === bossHp) return prev;
  return { score, lives, progress, shield, rapid, bossHp };
}

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
  const limit = maxSteps ?? Math.floor((spec.length / spec.scroll + 240) * 60);
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

function hashWorld(w: World): number {
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
  num(p.x); num(p.y); num(p.vx); num(p.lives); num(p.shield ? 1 : 0); num(p.rapidUntil); num(p.invulnUntil);
  num(b.count);
  for (let i = 0; i < b.count; i++) { num(b.kind[i]); num(b.x[i]); num(b.y[i]); num(b.hp[i]); }
  if (w.boss !== null) { num(w.boss.hp); num(w.boss.x); num(w.boss.attack); }
  return h >>> 0;
}

function clamp(v: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, v)); }

interface Rng { rng: number }
/** mulberry32. Math.imul and 32-bit integer ops are exact on every engine. */
function rand(s: Rng): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Range-reduced odd polynomial, bit-identical across engines. Error under 1e-7 on the reduced range. */
function sinT(x: number): number {
  let r = x - Math.floor(x / TWO_PI + 0.5) * TWO_PI;
  if (r > HALF_PI) r = PI - r;
  else if (r < -HALF_PI) r = -PI - r;
  const r2 = r * r;
  return r * (1 + r2 * (-1 / 6 + r2 * (1 / 120 + r2 * (-1 / 5040 + r2 * (1 / 362880 + r2 * (-1 / 39916800))))));
}
function cosT(x: number): number { return sinT(x + HALF_PI); }

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
function add(w: World, kind: Kind, x: number, y: number, vx: number, vy: number): number {
  const b = w.bodies;
  if (b.count === MAX_BODIES) { w.dropped++; return -1; }
  const i = b.count++;
  b.kind[i] = kind; b.variant[i] = 0;
  b.x[i] = x; b.y[i] = y; b.px[i] = x; b.py[i] = y; b.vx[i] = vx; b.vy[i] = vy;
  b.rot[i] = 0; b.spin[i] = 0; b.t[i] = 0; b.param[i] = 0;
  b.hp[i] = ARCHETYPES[kind].hp;
  return i;
}
function remove(b: Bodies, i: number): void {
  const last = --b.count;
  if (i === last) return;
  for (const c of COLUMNS) b[c][i] = b[c][last];
}

/** The rocket's lateral velocity after one held-finger STEP, before well pull. Exported so a bot can plan with the real handling. */
export function steerVelocity(x: number, vx: number, targetX: number): number {
  const want = clamp((clamp(targetX, -PLAYER_X_LIMIT, PLAYER_X_LIMIT) - x) * STEER_GAIN, -PLAYER_MAX_VX, PLAYER_MAX_VX);
  return vx + clamp(want - vx, -STEER_ACCEL * STEP, STEER_ACCEL * STEP);
}

function steer(w: World, input: Input): void {
  const p = w.player;
  p.vx = input.targetX === null ? p.vx * COAST_DAMPING : steerVelocity(p.x, p.vx, input.targetX);
  p.vx += wellPull(w) * STEP;
  p.x += p.vx * STEP;
  if (p.x > PLAYER_X_LIMIT) { p.x = PLAYER_X_LIMIT; p.vx = 0; }
  else if (p.x < -PLAYER_X_LIMIT) { p.x = -PLAYER_X_LIMIT; p.vx = 0; }
}

/** Lateral acceleration from every field body in reach: peaks at `param` about 0.7 units off the core, zero at the core. */
function wellPull(w: World): number {
  const p = w.player, b = w.bodies;
  let a = 0;
  for (let i = 0; i < b.count; i++) {
    if (ARCHETYPES[b.kind[i] as Kind].role !== 'field') continue;
    const dy = b.y[i] - p.y;
    if (dy >= WELL_REACH_Y || dy <= -WELL_REACH_Y) continue;
    const dx = b.x[i] - p.x;
    a += b.param[i] * 1.4142135623730951 * dx / (0.5 + dx * dx) * (1 - dy * dy / (WELL_REACH_Y * WELL_REACH_Y));
  }
  return a;
}

function spawnFromTrack(w: World): void {
  const b = w.bodies;
  while (w.cursor < w.track.length && w.track[w.cursor].y <= w.player.y + SPAWN_AHEAD) {
    const s = w.track[w.cursor++];
    const i = add(w, s.kind, s.x, s.y, 0, 0);
    if (i < 0) continue;
    b.variant[i] = s.variant;
    b.param[i] = s.param;
    b.spin[i] = (rand(w) - 0.5) * 3;
    if (s.kind === Kind.Asteroid) { b.vx[i] = s.param; b.vy[i] = -0.5; }
    else if (s.kind === Kind.Drone) b.t[i] = droneClock(w);
  }
}

/** A random start inside one fire period, so `droneFireRate` is the true expected rate from the first frame. */
function droneClock(w: World): number {
  const rate = w.spec.droneFireRate;
  return rate > 0 ? rand(w) / rate : rand(w) * 4;
}

function fire(w: World, out: SimEvent[]): void {
  const p = w.player;
  if (w.tick < p.fireAt) return;
  const rapid = w.tick < p.rapidUntil;
  p.fireAt = w.tick + (rapid ? FIRE_TICKS / 2 : FIRE_TICKS);
  add(w, Kind.Bolt, p.x, p.y + 0.8, 0, BOLT_SPEED);
  out.push({ e: 'fire', x: p.x, y: p.y + 0.8, rapid });
}

/** The last phase whose fraction is at or above the remaining health. Derived from hp, never stored. */
function bossPhase(spec: BossSpec, hp: number): BossPhase {
  const health = hp / spec.hp;
  let phase: BossPhase = spec.phases[0];
  for (const ph of spec.phases) if (ph.atHpFraction >= health) phase = ph;
  return phase;
}

function runBoss(w: World, boss: Boss, out: SimEvent[]): void {
  const phase = bossPhase(BOSSES[boss.id], boss.hp);
  boss.t += phase.sweepSpeed / BOSS_SWEEP * STEP;
  boss.x = BOSS_SWEEP * sinT(boss.t);
  if (w.tick < boss.attackAt) return;
  bossAttack(w, boss, phase.attacks[boss.attack % phase.attacks.length]);
  out.push({ e: 'enemyFire', x: boss.x, y: boss.y });
  boss.attack++;
  boss.attackAt = w.tick + Math.floor(phase.attackEvery * 60);
}

function bossAttack(w: World, boss: Boss, atk: BossAttack): void {
  const p = w.player, b = w.bodies;
  const y = boss.y - BOSS_R;
  switch (atk.a) {
    case 'spread': {
      const arc = atk.arcDeg * PI / 180;
      for (let k = 0; k < atk.bolts; k++) {
        const a = atk.bolts === 1 ? 0 : -arc / 2 + arc * k / (atk.bolts - 1);
        add(w, Kind.EnemyBolt, boss.x, y, ENEMY_BOLT_SPEED * sinT(a), -ENEMY_BOLT_SPEED * cosT(a));
      }
      return;
    }
    case 'aimed': {
      const dx = p.x - boss.x, dy = p.y - y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const ux = dx / len, uy = dy / len;
      for (let k = 0; k < atk.bolts; k++) {
        const a = (k - (atk.bolts - 1) / 2) * AIM_SPREAD;
        const c = cosT(a), s = sinT(a);
        add(w, Kind.EnemyBolt, boss.x, y, ENEMY_BOLT_SPEED * (ux * c - uy * s), ENEMY_BOLT_SPEED * (ux * s + uy * c));
      }
      return;
    }
    case 'mines': {
      // A wall across the track with two adjacent empty slots, so there is always a gap about 3 units wide.
      const slots = atk.count + 2;
      const skip = Math.floor(rand(w) * (slots - 1));
      const edge = TRACK_HALF_WIDTH - 0.6;
      for (let k = 0; k < slots; k++) {
        if (k === skip || k === skip + 1) continue;
        const i = add(w, Kind.Mine, -edge + 2 * edge * (k + 0.5) / slots, y, 0, -2.5);
        if (i >= 0) b.spin[i] = 1.5;
      }
      return;
    }
    case 'drones': {
      const pattern = DRONE_PATTERNS.indexOf(atk.pattern);
      for (let k = 0; k < atk.count; k++) {
        const x = clamp(boss.x + (k - (atk.count - 1) / 2) * 1.6, -DRONE_ANCHOR_LIMIT, DRONE_ANCHOR_LIMIT);
        const i = add(w, Kind.Drone, x, y, 0, 0);
        if (i < 0) continue;
        b.variant[i] = pattern; b.param[i] = x; b.t[i] = droneClock(w);
      }
      return;
    }
  }
}

const DRONE_PATTERNS: readonly DronePattern[] = ['sine', 'zigzag', 'dive', 'orbit'];
/** x-driven patterns also write vx, so a reader of WorldView sees the true lateral velocity. */
const DRONE_MOVES: { readonly [P in DronePattern]: (w: World, i: number) => void } = {
  sine: (w, i) => { const b = w.bodies; driveX(b, i, b.param[i] + 1.6 * sinT(2.4 * b.t[i])); b.vy[i] = -1.2; },
  zigzag: (w, i) => {
    const b = w.bodies;
    const ph = 0.5 * b.t[i], f = ph - Math.floor(ph);
    driveX(b, i, b.param[i] + 1.8 * (f < 0.5 ? 4 * f - 1 : 3 - 4 * f));
    b.vy[i] = -1.2;
  },
  dive: (w, i) => {
    const b = w.bodies, p = w.player;
    if (b.y[i] - p.y < 8) { b.vy[i] = -7; b.vx[i] = clamp((p.x - b.x[i]) * 1.2, -2, 2); }
    else { b.vy[i] = -1; b.vx[i] = 0; }
    b.x[i] += b.vx[i] * STEP;
  },
  orbit: (w, i) => {
    const b = w.bodies;
    driveX(b, i, b.param[i] + 1.5 * sinT(2 * b.t[i]));
    b.vy[i] = -1 + 3 * cosT(2 * b.t[i]);
  },
};
function driveX(b: Bodies, i: number, x: number): void {
  const nx = clamp(x, -PLAYER_X_LIMIT, PLAYER_X_LIMIT);
  b.vx[i] = (nx - b.x[i]) / STEP;
  b.x[i] = nx;
}

function moveBodies(w: World, out: SimEvent[]): void {
  const b = w.bodies, p = w.player;
  const rate = w.spec.droneFireRate;
  for (let i = 0; i < b.count; i++) {
    const k = b.kind[i] as Kind;
    b.t[i] += STEP;
    b.rot[i] += b.spin[i] * STEP;
    if (k === Kind.Drone) {
      DRONE_MOVES[DRONE_PATTERNS[b.variant[i]]](w, i);
      b.y[i] += b.vy[i] * STEP;
      const dy = b.y[i] - p.y;
      if (rate > 0 && dy > 1.5 && dy < 20 && Math.floor(b.t[i] * rate) > Math.floor((b.t[i] - STEP) * rate)) {
        const dx = p.x - b.x[i], len = Math.sqrt(dx * dx + dy * dy);
        add(w, Kind.EnemyBolt, b.x[i], b.y[i] - 0.4, ENEMY_BOLT_SPEED * dx / len, -ENEMY_BOLT_SPEED * dy / len);
        out.push({ e: 'enemyFire', x: b.x[i], y: b.y[i] });
      }
      continue;
    }
    b.x[i] += b.vx[i] * STEP;
    b.y[i] += b.vy[i] * STEP;
    if (k === Kind.Asteroid || k === Kind.Fragment) {
      const lim = TRACK_HALF_WIDTH - ARCHETYPES[k].radius;
      if ((b.x[i] > lim && b.vx[i] > 0) || (b.x[i] < -lim && b.vx[i] < 0)) b.vx[i] = -b.vx[i];
    }
  }
}

function hurt(w: World, out: SimEvent[]): void {
  const p = w.player;
  if (p.shield) {
    p.shield = false;
    p.invulnUntil = w.tick + SHIELD_INVULN_TICKS;
    out.push({ e: 'shieldBlock', x: p.x, y: p.y });
    return;
  }
  p.lives = (p.lives - 1) as Player['lives'];
  p.invulnUntil = w.tick + HIT_INVULN_TICKS;
  out.push({ e: 'playerHit', x: p.x, y: p.y, lives: p.lives });
}

function collect(w: World, kind: PickupKind, x: number, y: number, out: SimEvent[]): void {
  const p = w.player;
  if (kind === Kind.Shield) p.shield = true;
  else if (kind === Kind.Rapid) p.rapidUntil = w.tick + RAPID_TICKS;
  w.score += ARCHETYPES[kind].score;
  out.push({ e: 'pickup', kind, x, y });
}

function collide(w: World, out: SimEvent[]): void {
  const p = w.player, b = w.bodies;
  const n = b.count;
  for (let i = 0; i < n; i++) {
    if (b.hp[i] < 0) continue;
    const k = b.kind[i] as Kind;
    const a = ARCHETYPES[k];
    if (a.role === 'playerShot') continue;
    const dx = b.x[i] - p.x, dy = b.y[i] - p.y;
    const rr = a.radius + PLAYER_RADIUS + (a.role === 'pickup' ? PICKUP_SLACK : 0);
    if (dx * dx + dy * dy >= rr * rr) continue;
    if (a.role === 'pickup') {
      collect(w, k as PickupKind, b.x[i], b.y[i], out);
      b.hp[i] = DEAD;
      continue;
    }
    if (w.tick < p.invulnUntil) continue;
    hurt(w, out);
    if (a.role === 'field') continue;
    b.hp[i] = DEAD;
    if (a.role === 'hazard') out.push({ e: 'destroy', target: k, x: b.x[i], y: b.y[i] });
  }

  const boss = w.boss;
  for (let j = 0; j < n; j++) {
    if (b.hp[j] < 0 || ARCHETYPES[b.kind[j] as Kind].role !== 'playerShot') continue;
    const bx = b.x[j], by = b.y[j], br = ARCHETYPES[Kind.Bolt].radius;
    if (boss !== null && boss.hp > 0) {
      const dx = boss.x - bx, dy = boss.y - by, rr = BOSS_R + br;
      if (dx * dx + dy * dy < rr * rr) {
        b.hp[j] = DEAD;
        boss.hp--;
        if (boss.hp > 0) out.push({ e: 'hit', target: 'boss', x: bx, y: by });
        continue;
      }
    }
    for (let i = 0; i < n; i++) {
      if (b.hp[i] <= 0) continue;
      const k = b.kind[i] as Kind;
      const a = ARCHETYPES[k];
      if (a.role !== 'hazard') continue;
      const dx = b.x[i] - bx, dy = b.y[i] - by, rr = a.radius + br;
      if (dx * dx + dy * dy >= rr * rr) continue;
      b.hp[j] = DEAD;
      if (--b.hp[i] > 0) { out.push({ e: 'hit', target: k, x: b.x[i], y: b.y[i] }); break; }
      b.hp[i] = DEAD;
      w.score += a.score;
      out.push({ e: 'destroy', target: k, x: b.x[i], y: b.y[i] });
      if (a.splitInto !== null) split(w, i, a.splitInto.kind, a.splitInto.count);
      break;
    }
  }
}

function split(w: World, i: number, kind: Kind, count: number): void {
  const b = w.bodies;
  const x = b.x[i], y = b.y[i], vx = b.vx[i], vy = b.vy[i];
  const base = rand(w) * TWO_PI;
  for (let k = 0; k < count; k++) {
    const a = base + TWO_PI * k / count;
    const j = add(w, kind, x, y, vx + 2.2 * cosT(a), vy + 2.2 * sinT(a));
    if (j < 0) continue;
    b.variant[j] = k;
    b.spin[j] = (rand(w) - 0.5) * 6;
  }
}

function despawn(w: World): void {
  const b = w.bodies, p = w.player;
  const behind = p.y - DESPAWN_BEHIND, ahead = p.y + BOLT_RANGE, side = TRACK_HALF_WIDTH + 2;
  for (let i = b.count - 1; i >= 0; i--) {
    if (b.hp[i] < 0 || b.y[i] < behind || b.y[i] > ahead || b.x[i] > side || b.x[i] < -side) remove(b, i);
  }
}

function transition(w: World, out: SimEvent[]): void {
  const p = w.player;
  if (p.lives === 0) {
    w.phase = { p: 'lost' };
    out.push({ e: 'lost', score: w.score });
    return;
  }
  const boss = w.boss;
  if (boss !== null && boss.hp <= 0) {
    out.push({ e: 'destroy', target: 'boss', x: boss.x, y: boss.y });
    w.score += BOSSES[boss.id].hp * BOSS_SCORE_PER_HP;
    // The boss's bolts die with it, so the flight to the wormhole is a victory lap, not a cleanup.
    const b = w.bodies;
    for (let i = b.count - 1; i >= 0; i--) if (ARCHETYPES[b.kind[i] as Kind].role === 'enemyShot') remove(b, i);
    w.boss = null;
    w.wormholeY = boss.y;
    w.phase = { p: 'fly' };
    out.push({ e: 'wormholeOpen', y: boss.y });
  } else if (w.phase.p === 'fly' && w.spec.boss !== null && w.wormholeY === null && p.y >= w.spec.length) {
    w.phase = { p: 'boss' };
    w.boss = { id: w.spec.boss, x: 0, px: 0, y: p.y + BOSS_DIST, hp: BOSSES[w.spec.boss].hp, attack: 0, attackAt: w.tick + BOSS_GRACE_TICKS, t: 0 };
    out.push({ e: 'bossEnter', boss: w.spec.boss });
  }
  const wy = w.wormholeY;
  if (wy === null) return;
  if (p.py + SPAWN_AHEAD < wy && wy <= p.y + SPAWN_AHEAD) out.push({ e: 'wormholeOpen', y: wy });
  if (p.y >= wy) {
    const stars = p.lives as Stars;
    w.phase = { p: 'won', stars };
    out.push({ e: 'won', score: w.score, stars });
  }
}

/**
 * Stratified placement on rows ROW_DY apart. Each row first picks a gap whose centre random-walks no faster than the
 * rocket can follow, then places its hazards (and any well) outside that gap, so a 1.6-unit path always exists.
 */
function compileTrack(spec: LevelSpec): Track {
  const s: Rng = { rng: spec.seed | 0 };
  const out: Spawn[] = [];
  const mix: readonly (readonly [Kind, number])[] = [
    [Kind.Asteroid, spec.mix.asteroid ?? 0], [Kind.Mine, spec.mix.mine ?? 0], [Kind.Drone, spec.mix.drone ?? 0],
  ];
  const total = mix.reduce((sum, [, wt]) => sum + wt, 0);
  const pickKind = (u: number): Kind => {
    let acc = u * total;
    for (const [k, wt] of mix) { if (acc < wt) return k; acc -= wt; }
    return Kind.Asteroid;
  };
  const rows = Math.floor((spec.length - TRACK_END_CLEAR - TRACK_START) / ROW_DY) + 1;
  const wellRows = new Set<number>();
  for (let k = 0; k < spec.wells; k++) wellRows.add(Math.floor((k + 0.5) * rows / spec.wells));
  const reach = 0.5 * PLAYER_MAX_VX * ROW_DY / spec.scroll;
  const gapLimit = PLAYER_X_LIMIT - ROW_GAP / 2;
  const perRow = spec.density / 100 * ROW_DY;
  const pickupPerRow = [
    [Kind.Crystal, spec.pickups.crystal / 100 * ROW_DY], [Kind.Shield, spec.pickups.shield / 100 * ROW_DY],
    [Kind.Rapid, spec.pickups.rapid / 100 * ROW_DY],
  ] as const;
  const pickupOwed = [0, 0, 0];
  let gapX = 0, owed = 0;

  const outsideGap = (r: number): number => {
    const lo = -TRACK_HALF_WIDTH + r, hi = TRACK_HALF_WIDTH - r;
    const left = Math.max(0, gapX - ROW_GAP / 2 - r - lo);
    const right = Math.max(0, hi - (gapX + ROW_GAP / 2 + r));
    const u = rand(s) * (left + right);
    return u < left ? lo + u : gapX + ROW_GAP / 2 + r + (u - left);
  };

  for (let row = 0; row < rows; row++) {
    const y = TRACK_START + row * ROW_DY;
    gapX = clamp(gapX + (rand(s) * 2 - 1) * reach, -gapLimit, gapLimit);
    owed += perRow;
    const n = Math.floor(owed);
    owed -= n;
    if (wellRows.has(row)) {
      out.push({ y, x: outsideGap(ARCHETYPES[Kind.Well].radius), kind: Kind.Well, variant: 0, param: spec.wellPull });
    }
    for (let k = 0; k < n; k++) {
      const kind = pickKind(rand(s));
      const x = outsideGap(ARCHETYPES[kind].radius);
      if (kind === Kind.Asteroid) out.push({ y, x, kind, variant: Math.floor(rand(s) * 4), param: (rand(s) - 0.5) * 0.6 });
      else if (kind === Kind.Drone) {
        const pattern = spec.drones[Math.floor(rand(s) * spec.drones.length)];
        const ax = clamp(x, -DRONE_ANCHOR_LIMIT, DRONE_ANCHOR_LIMIT);
        out.push({ y, x: ax, kind, variant: DRONE_PATTERNS.indexOf(pattern), param: ax });
      } else out.push({ y, x, kind, variant: 0, param: 0 });
    }
    let slot = 0;
    pickupPerRow.forEach(([kind, rate], k) => {
      pickupOwed[k] += rate;
      while (pickupOwed[k] >= 1) {
        pickupOwed[k] -= 1;
        const x = kind === Kind.Crystal ? clamp(gapX + (rand(s) - 0.5) * 1.2, -PLAYER_X_LIMIT, PLAYER_X_LIMIT)
          : (rand(s) * 2 - 1) * (PLAYER_X_LIMIT - 0.5);
        out.push({ y: y + ROW_DY / 2 + 0.8 * slot++, x, kind, variant: 0, param: 0 });
      }
    });
  }
  return out.sort((a, b) => a.y - b.y);
}
