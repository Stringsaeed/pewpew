import { ARCHETYPES, Kind, type BossId } from '../levels';
import type { SimEvent, WorldView } from '../sim';
import { BUBBLE_POP_SECONDS, HOLD_LOST, addTrauma, type Fx } from './fx';

export const PARTICLE_CAP = 2048;

/** DOT shrinks as it fades. RING grows from a pinprick to full size as it fades. */
export const DOT = 0;
export const RING = 1;
/** SMOKE grows and fades faintly. Glow is additive, so it reads as a dim haze rather than a dark cloud. */
export const SMOKE = 2;
export type ParticleKind = typeof DOT | typeof RING | typeof SMOKE;

export interface ParticlePool {
  count: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  /** Seconds left. Above `ttl` the particle is still waiting out its start delay: it neither moves nor draws. */
  readonly life: Float32Array;
  readonly ttl: Float32Array;
  readonly size: Float32Array;
  readonly r: Float32Array;
  readonly g: Float32Array;
  readonly b: Float32Array;
  readonly kind: Uint8Array;
}

export interface BurstTables {
  readonly burst: Float32Array;
  readonly bossBurst: Float32Array;
  readonly bossMesh: { readonly [B in BossId]: number };
  readonly core: number;
}

const WHITE = Float32Array.of(1, 1, 1);
const RED = Float32Array.of(1, 0.25, 0.3);
const SHIELD_BLUE = Float32Array.of(0.35, 0.65, 1);
const HOLE_GOLD = Float32Array.of(1, 0.7, 0.3);
const HOLE_VIOLET = Float32Array.of(0.7, 0.4, 1);
const HOLE_VISIBLE_AHEAD = 17;
const SHIP_FIRE = Float32Array.of(1, 0.55, 0.15);

export function createPool(): ParticlePool {
  const f = (): Float32Array => new Float32Array(PARTICLE_CAP);
  return { count: 0, x: f(), y: f(), vx: f(), vy: f(), life: f(), ttl: f(), size: f(), r: f(), g: f(), b: f(), kind: new Uint8Array(PARTICLE_CAP) };
}

function spawn(pool: ParticlePool, x: number, y: number, vx: number, vy: number, ttl: number, size: number, r: number, g: number, b: number,
  kind: ParticleKind = DOT, delay = 0): void {
  if (pool.count === PARTICLE_CAP) return;
  const i = pool.count++;
  pool.x[i] = x; pool.y[i] = y; pool.vx[i] = vx; pool.vy[i] = vy;
  pool.life[i] = ttl + delay; pool.ttl[i] = ttl; pool.size[i] = size; pool.r[i] = r; pool.g[i] = g; pool.b[i] = b; pool.kind[i] = kind;
}

function burstAt(pool: ParticlePool, x: number, y: number, n: number, speed: number, size: number, ttl: number, rgb: Float32Array, o: number): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.3 + 0.7 * Math.random());
    const hot = Math.random() < 0.3 ? 1 : 0;
    spawn(pool, x, y, Math.cos(a) * s, Math.sin(a) * s, ttl * (0.5 + 0.5 * Math.random()), size * (0.6 + 0.8 * Math.random()),
      hot || rgb[o], hot || rgb[o + 1], hot || rgb[o + 2]);
  }
}

/** A shockwave: one particle whose quad grows to `size` while it fades. */
export function ringAt(pool: ParticlePool, x: number, y: number, size: number, ttl: number, rgb: Float32Array, delay = 0): void {
  spawn(pool, x, y, 0, 0, ttl, size, rgb[0], rgb[1], rgb[2], RING, delay);
}

/**
 * shieldBlock carries the ship's position, not the impact's, and the body that hit is already gone. The nearest survivor
 * within reach is the best guess for where it came from; failing that, assume head-on.
 */
function impactToward(fx: Fx, world: WorldView | null, x: number, y: number): void {
  fx.rippleX = 0; fx.rippleY = 1;
  if (!world) return;
  const b = world.bodies;
  let best = 2.5 * 2.5;
  for (let i = 0; i < b.count; i++) {
    const role = ARCHETYPES[b.kind[i] as Kind].role;
    if (role !== 'hazard' && role !== 'enemyShot') continue;
    const dx = b.x[i] - x, dy = b.y[i] - y, d2 = dx * dx + dy * dy;
    if (d2 < best && d2 > 1e-6) { best = d2; const inv = 1 / Math.sqrt(d2); fx.rippleX = dx * inv; fx.rippleY = dy * inv; }
  }
}

export function applyEvents(pool: ParticlePool, world: WorldView | null, events: readonly SimEvent[], tables: BurstTables, fx: Fx): void {
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    switch (ev.e) {
      case 'start': fx.holeAge = -1e3; break;
      case 'destroy': {
        if (ev.target === 'boss') {
          const m = world?.boss ? tables.bossMesh[world.boss.id] : tables.core;
          burstAt(pool, ev.x, ev.y, 220, 9, 0.5, 1.4, tables.bossBurst, m * 3);
          fx.flash = 0.3;
          addTrauma(fx, 1);
        } else {
          addTrauma(fx, 0.08);
          burstAt(pool, ev.x, ev.y, 18 + Math.round(ARCHETYPES[ev.target].radius * 30), 6, 0.32, 0.8, tables.burst, ev.target * 3);
        }
        break;
      }
      case 'hit':
        burstAt(pool, ev.x, ev.y, 6, 4, 0.2, 0.25, WHITE, 0);
        if (ev.target === 'boss' && fx.cooldown <= 0) {
          fx.flash = 0.06;
          fx.cooldown = 0.15;
        }
        break;
      case 'playerHit':
        burstAt(pool, ev.x, ev.y, 48, 7, 0.4, 0.9, RED, 0);
        addTrauma(fx, 0.6);
        break;
      case 'pickup':
        burstAt(pool, ev.x, ev.y, 22, 4, 0.25, 0.5, tables.burst, ev.kind * 3);
        if (ev.kind === Kind.Shield) fx.bubbleAge = 0;
        break;
      case 'shieldBlock':
        burstAt(pool, ev.x, ev.y, 36, 6, 0.3, 0.6, SHIELD_BLUE, 0);
        impactToward(fx, world, ev.x, ev.y);
        fx.ripple = 0;
        fx.dying = BUBBLE_POP_SECONDS;
        addTrauma(fx, 0.3);
        break;
      case 'wormholeOpen': {
        // The sim announces the hole 24 units out, before it can be seen, so the opening waits until it is about to enter the view.
        const wait = world ? Math.max(0, ev.y - world.player.y - HOLE_VISIBLE_AHEAD) / world.spec.scroll : 0;
        fx.holeAge = -wait;
        ringAt(pool, 0, ev.y, 4.2, 1, HOLE_GOLD, wait);
        ringAt(pool, 0, ev.y, 3.2, 1, HOLE_VIOLET, wait + 0.18);
        break;
      }
      default: break;
    }
  }
  if (fx.holdFresh && world) {
    fx.holdFresh = false;
    if (fx.hold === HOLD_LOST) {
      const p = world.player;
      burstAt(pool, p.x, p.y, 150, 10, 0.55, 1.2, SHIP_FIRE, 0);
      burstAt(pool, p.x, p.y, 60, 5, 0.9, 1, RED, 0);
      ringAt(pool, p.x, p.y, 3.4, 0.9, RED);
      ringAt(pool, p.x, p.y, 2.4, 0.9, WHITE, 0.12);
      addTrauma(fx, 1);
    }
  }
}

export function integrate(pool: ParticlePool, dt: number): void {
  const drag = Math.max(0, 1 - 2.2 * dt);
  for (let i = 0; i < pool.count; ) {
    pool.life[i] -= dt;
    if (pool.life[i] <= 0) {
      const j = --pool.count;
      pool.x[i] = pool.x[j]; pool.y[i] = pool.y[j]; pool.vx[i] = pool.vx[j]; pool.vy[i] = pool.vy[j]; pool.life[i] = pool.life[j];
      pool.ttl[i] = pool.ttl[j]; pool.size[i] = pool.size[j]; pool.r[i] = pool.r[j]; pool.g[i] = pool.g[j]; pool.b[i] = pool.b[j];
      pool.kind[i] = pool.kind[j];
      continue;
    }
    if (pool.life[i] <= pool.ttl[i]) {
      pool.x[i] += pool.vx[i] * dt; pool.y[i] += pool.vy[i] * dt;
      pool.vx[i] *= drag; pool.vy[i] *= drag;
    }
    i++;
  }
}

/** Puffs leave the nozzle against the heading (hx, hy). `k` scales their size, so a shrinking rocket leaves a thinner trail. */
export function spawnExhaust(pool: ParticlePool, nx: number, ny: number, hx: number, hy: number, k: number, dt: number): void {
  const puffs = Math.min(8, Math.round(dt * 120));
  for (let i = 0; i < puffs; i++) {
    const heat = Math.random();
    const back = 3 + Math.random() * 3;
    const sx = (Math.random() - 0.5) * 0.8, sy = (Math.random() - 0.5) * 0.18 * k;
    spawn(pool, nx + sy * hy, ny - sy * hx, -hx * back + sx * hy, -hy * back - sx * hx,
      0.22 + 0.2 * Math.random(), (0.22 + 0.12 * Math.random()) * k, 1, 0.45 + 0.45 * heat, 0.1 + 0.3 * heat * heat);
  }
}

const BOSS_HULL = 1.5;

/** Sparks and smoke off the hull of a boss that has passed a phase threshold. `phase` is its phase index: 0 emits nothing. */
export function emitBossDamage(pool: ParticlePool, fx: Fx, x: number, y: number, phase: number, dt: number): void {
  if (phase <= 0) return;
  fx.sparkDebt += dt * 12 * phase;
  fx.smokeDebt += dt * 6 * phase;
  for (; fx.sparkDebt >= 1; fx.sparkDebt -= 1) {
    const a = Math.random() * Math.PI * 2, r = BOSS_HULL * Math.sqrt(Math.random());
    const v = 2 + Math.random() * 3;
    const b = Math.random() * Math.PI * 2;
    spawn(pool, x + Math.cos(a) * r, y + Math.sin(a) * r, Math.cos(b) * v, Math.sin(b) * v - 1.5, 0.35 + Math.random() * 0.35, 0.22 + 0.14 * Math.random(), 1, 0.55 + 0.4 * Math.random(), 0.15);
  }
  for (; fx.smokeDebt >= 1; fx.smokeDebt -= 1) {
    const a = Math.random() * Math.PI * 2, r = BOSS_HULL * Math.sqrt(Math.random());
    spawn(pool, x + Math.cos(a) * r, y + Math.sin(a) * r, (Math.random() - 0.5) * 0.6, -1.2 - Math.random(), 1 + 0.6 * Math.random(), 0.5 + 0.3 * Math.random(), 0.6, 0.4, 0.55, SMOKE);
  }
}
