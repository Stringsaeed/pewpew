import { ARCHETYPES, type BossId } from '../levels';
import type { SimEvent, WorldView } from '../sim';
import { ROCKET_RADIUS } from './look';

export const PARTICLE_CAP = 2048;

export interface ParticlePool {
  count: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly life: Float32Array;
  readonly ttl: Float32Array;
  readonly size: Float32Array;
  readonly r: Float32Array;
  readonly g: Float32Array;
  readonly b: Float32Array;
}

export interface BurstTables {
  readonly burst: Float32Array;
  readonly bossBurst: Float32Array;
  readonly bossMesh: { readonly [B in BossId]: number };
  readonly core: number;
}

export interface BossFlash { flash: number; cooldown: number }

const WHITE = Float32Array.of(1, 1, 1);
const RED = Float32Array.of(1, 0.25, 0.3);
const SHIELD_BLUE = Float32Array.of(0.35, 0.65, 1);

export function createPool(): ParticlePool {
  return {
    count: 0,
    x: new Float32Array(PARTICLE_CAP), y: new Float32Array(PARTICLE_CAP),
    vx: new Float32Array(PARTICLE_CAP), vy: new Float32Array(PARTICLE_CAP),
    life: new Float32Array(PARTICLE_CAP), ttl: new Float32Array(PARTICLE_CAP), size: new Float32Array(PARTICLE_CAP),
    r: new Float32Array(PARTICLE_CAP), g: new Float32Array(PARTICLE_CAP), b: new Float32Array(PARTICLE_CAP),
  };
}

function spawn(pool: ParticlePool, x: number, y: number, vx: number, vy: number, ttl: number, size: number, r: number, g: number, b: number): void {
  if (pool.count === PARTICLE_CAP) return;
  const i = pool.count++;
  pool.x[i] = x; pool.y[i] = y; pool.vx[i] = vx; pool.vy[i] = vy;
  pool.life[i] = ttl; pool.ttl[i] = ttl; pool.size[i] = size; pool.r[i] = r; pool.g[i] = g; pool.b[i] = b;
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

export function applyEvents(pool: ParticlePool, world: WorldView | null, events: readonly SimEvent[], tables: BurstTables, fx: BossFlash): void {
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    switch (ev.e) {
      case 'destroy': {
        if (ev.target === 'boss') {
          const m = world?.boss ? tables.bossMesh[world.boss.id] : tables.core;
          burstAt(pool, ev.x, ev.y, 220, 9, 0.5, 1.4, tables.bossBurst, m * 3);
          fx.flash = 0.3;
        } else {
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
      case 'playerHit': burstAt(pool, ev.x, ev.y, 48, 7, 0.4, 0.9, RED, 0); break;
      case 'pickup': burstAt(pool, ev.x, ev.y, 22, 4, 0.25, 0.5, tables.burst, ev.kind * 3); break;
      case 'shieldBlock': burstAt(pool, ev.x, ev.y, 36, 6, 0.3, 0.6, SHIELD_BLUE, 0); break;
      default: break;
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
      continue;
    }
    pool.x[i] += pool.vx[i] * dt; pool.y[i] += pool.vy[i] * dt;
    pool.vx[i] *= drag; pool.vy[i] *= drag;
    i++;
  }
}

export function spawnExhaust(pool: ParticlePool, px: number, py: number, dt: number): void {
  const nozzle = py - ROCKET_RADIUS * 0.95;
  const puffs = Math.min(8, Math.round(dt * 120));
  for (let i = 0; i < puffs; i++) {
    const heat = Math.random();
    spawn(pool, px + (Math.random() - 0.5) * 0.18, nozzle, (Math.random() - 0.5) * 0.8, -3 - Math.random() * 3,
      0.22 + 0.2 * Math.random(), 0.22 + 0.12 * Math.random(), 1, 0.45 + 0.45 * heat, 0.1 + 0.3 * heat * heat);
  }
}
