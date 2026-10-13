import { ARCHETYPES, Kind, type BossId } from '../levels';
import { MAX_BODIES, type WorldView } from '../sim';
import { PITCH_TAN } from './camera';
import { BLACKHOLE_RADIUS, BLACKHOLE_TILT, BOSS_RADIUS, BUBBLE_RADIUS, LOOK, ROCKET_RADIUS } from './look';
import { BUBBLE_FORM_SECONDS, BUBBLE_POP_SECONDS, HOLD_LOST, HOLD_WON, HOLE_OPEN_SECONDS, RIPPLE_SECONDS, bossHeat, createDive, holdProgress, pose, smooth, type Fx } from './fx';
import { MESHES, type MeshId } from './meshes.gen';
import { PARTICLE_CAP, RING, SMOKE, type BurstTables, type ParticlePool } from './particles';

export const MESH_IDS = Object.keys(MESHES) as MeshId[];
/** Mesh and glow instances share one stride: see the layout comment in wgsl.ts. */
export const INSTANCE_FLOATS = 12;
export const GLOW_SPOT = 0;
export const GLOW_RING = 1;
export const GLOW_ORB = 2;
export const GLOW_HALO = 3;
export const GLOW_FLAT = 4;
export const MODE_TUMBLE = 0;
export const MODE_FLAT = 1;
export const MODE_DISC = 2;
export const MODE_DIVE = 3;
const GLOW_Z = 0.4;
/** Emissive accents on a boss breathe by this fraction, as a wave across the hull. */
const BOSS_PULSE = 0.22;
/** A mine's core blinks by this fraction: armed. */
const MINE_PULSE = 0.55;
/** Pickups spin at this rate (rad/s) and sit in a halo: matte means rock, hot means threat, haloed means take it. */
const PICKUP_SPIN = 3.2;
const HALO_SCALE = 3.1;
const HALO_HZ = 2;
/** Glow quads sit in the plane of the bodies. The hole's halo goes behind the whole accretion disc, so the core stays black and the disc takes no seam. */
const HALO_Z = -2.6;
/** In front of every mesh, so the flash covers the near half of the accretion disc too. */
const FLASH_Z = 6;

const MESH_INDEX = Object.fromEntries(MESH_IDS.map((id, i) => [id, i])) as { [M in MeshId]: number };
const MESH_CAP = MAX_BODIES + 5;
const GLOW_CAP = 2 * MAX_BODIES + PARTICLE_CAP + 16;
const HOLE_SCALE = BLACKHOLE_RADIUS / MESHES.accretion.radius;
const BOSS_MESH: { readonly [B in BossId]: number } = {
  warden: MESH_INDEX.warden, hive: MESH_INDEX.hive, core: MESH_INDEX.core,
};
const KIND_COUNT = Object.keys(LOOK).length;
const VARIANTS = 4;

/** Mean vertex color normalized to a max channel of 1: the burst color when that mesh is destroyed. */
function signature(id: MeshId): [number, number, number] {
  const c = MESHES[id].colors;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < c.length; i += 3) { r += Math.min(c[i], 1); g += Math.min(c[i + 1], 1); b += Math.min(c[i + 2], 1); }
  const m = Math.max(r, g, b) || 1;
  return [r / m, g / m, b / m];
}

export interface MeshBatch {
  readonly meshInst: Float32Array;
  readonly glowInst: Float32Array;
  readonly counts: Uint32Array;
  readonly starts: Uint32Array;
  readonly meshSlots: number;
  readonly glowCount: number;
  readonly px: number;
  readonly py: number;
  /** Where the exhaust leaves, which way it points, and how big the puffs are. Off while the rocket is hidden. */
  readonly nozzleX: number;
  readonly nozzleY: number;
  readonly headX: number;
  readonly headY: number;
  readonly puff: number;
  readonly exhaust: boolean;
  readonly bursts: BurstTables;
  begin(): void;
  packWorld(world: WorldView, alpha: number, time: number, fx: Fx): void;
  packParticles(pool: ParticlePool): void;
}

/** Kind-to-mesh tables, the counting sort, and instance packing. No GPU, no per-frame allocation. */
export function createBatch(): MeshBatch {
  // Flat (kind, variant) tables so the per-body loop is two typed-array reads. Mesh -1 means a glow kind.
  const meshOf = new Int16Array(KIND_COUNT * VARIANTS).fill(-1);
  const scaleOf = new Float32Array(KIND_COUNT * VARIANTS);
  const tintOf = new Float32Array(KIND_COUNT * 3);
  const pulseOf = new Float32Array(KIND_COUNT);
  // Billboard kinds: half-extents and glow shape.
  const glowW = new Float32Array(KIND_COUNT);
  const glowH = new Float32Array(KIND_COUNT);
  const glowShape = new Uint8Array(KIND_COUNT);
  const burst = new Float32Array(KIND_COUNT * 3);
  for (let k = 0; k < KIND_COUNT; k++) {
    const look = LOOK[k as Kind];
    if (look.draw === 'mesh') {
      if (look.meshes.length > VARIANTS || VARIANTS % look.meshes.length !== 0) throw new Error(`LOOK[${k}]: mesh count must divide ${VARIANTS}`);
      for (let v = 0; v < VARIANTS; v++) {
        const id = look.meshes[v % look.meshes.length];
        meshOf[k * VARIANTS + v] = MESH_INDEX[id];
        scaleOf[k * VARIANTS + v] = ARCHETYPES[k as Kind].radius / MESHES[id].radius;
      }
      tintOf.set(look.tint, k * 3);
      burst.set(signature(look.meshes[0]), k * 3);
    } else {
      burst.set(look.rgba.slice(0, 3), k * 3);
      const orb = look.shape === 'orb';
      glowW[k] = orb ? look.size : look.size * 0.7;
      glowH[k] = orb ? look.size : look.size * 1.9;
      glowShape[k] = orb ? GLOW_ORB : GLOW_SPOT;
    }
  }
  pulseOf[Kind.Mine] = MINE_PULSE;
  const haloOf = new Float32Array(KIND_COUNT);
  for (let k = 0; k < KIND_COUNT; k++) if (ARCHETYPES[k as Kind].role === 'pickup') haloOf[k] = ARCHETYPES[k as Kind].radius * HALO_SCALE;
  const bossBurst = Float32Array.from(MESH_IDS.flatMap((id) => signature(id)));
  const counts = new Uint32Array(MESH_IDS.length);
  const starts = new Uint32Array(MESH_IDS.length);
  const cursor = new Uint32Array(MESH_IDS.length);
  const bodyMesh = new Int16Array(MAX_BODIES);
  const meshInst = new Float32Array(MESH_CAP * INSTANCE_FLOATS);
  const glowInst = new Float32Array(GLOW_CAP * INSTANCE_FLOATS);
  const bursts: BurstTables = { burst, bossBurst, bossMesh: BOSS_MESH, core: MESH_INDEX.core };

  let meshSlots = 0;
  let glowCount = 0;
  let px = 0;
  let py = 0;
  let nozzleX = 0, nozzleY = 0, headX = 0, headY = 1, puff = 1;
  let exhaust = true;
  const dive = createDive();

  function putMesh(slot: number, x: number, y: number, rot: number, s: number, r: number, g: number, b: number, flash: number,
    heat = 0, mode = MODE_TUMBLE, a = 0, c = 0) {
    const o = slot * INSTANCE_FLOATS;
    meshInst[o] = x; meshInst[o + 1] = y; meshInst[o + 2] = rot; meshInst[o + 3] = s;
    meshInst[o + 4] = r; meshInst[o + 5] = g; meshInst[o + 6] = b; meshInst[o + 7] = flash;
    meshInst[o + 8] = heat; meshInst[o + 9] = mode; meshInst[o + 10] = a; meshInst[o + 11] = c;
  }
  function putGlow(x: number, y: number, sx: number, sy: number, r: number, g: number, b: number, a: number, shape = GLOW_SPOT, z = GLOW_Z) {
    if (glowCount === GLOW_CAP) return;
    const o = glowCount++ * INSTANCE_FLOATS;
    glowInst[o] = x; glowInst[o + 1] = y; glowInst[o + 2] = sx; glowInst[o + 3] = sy;
    glowInst[o + 4] = r; glowInst[o + 5] = g; glowInst[o + 6] = b; glowInst[o + 7] = a;
    glowInst[o + 8] = shape; glowInst[o + 9] = z; glowInst[o + 10] = 0; glowInst[o + 11] = 0;
  }

  function begin(): void {
    counts.fill(0);
    glowCount = 0;
    meshSlots = 0;
  }

  function packWorld(world: WorldView, alpha: number, time: number, fx: Fx): void {
    const pl = world.player;
    const held = fx.hold !== 0;
    // A terminal world no longer steps, so its interpolation alpha is meaningless.
    px = held ? pl.x : pl.px + (pl.x - pl.px) * alpha;
    py = held ? pl.y : pl.py + (pl.y - pl.py) * alpha;
    const bodies = world.bodies;
    for (let i = 0; i < bodies.count; i++) {
      const m = meshOf[bodies.kind[i] * VARIANTS + (bodies.variant[i] % VARIANTS)];
      bodyMesh[i] = m;
      if (m >= 0) {
        counts[m]++;
      } else {
        const look = LOOK[bodies.kind[i] as Kind];
        if (look.draw === 'glow') {
          const x = bodies.px[i] + (bodies.x[i] - bodies.px[i]) * alpha;
          const y = bodies.py[i] + (bodies.y[i] - bodies.py[i]) * alpha;
          const k = bodies.kind[i];
          putGlow(x, y, glowW[k], glowH[k], look.rgba[0], look.rgba[1], look.rgba[2], look.rgba[3], glowShape[k]);
        }
      }
    }

    const p = holdProgress(fx);
    const rocketShown = fx.hold !== HOLD_LOST;
    const diving = fx.hold === HOLD_WON && world.wormholeY !== null;
    if (diving) pose(dive, p, pl.x, pl.y, 0, world.wormholeY!);
    const rocketOn = rocketShown && (!diving || dive.visible);
    if (rocketOn) counts[MESH_INDEX.rocket]++;
    const bubbleOn = rocketShown && (pl.shield || fx.dying > 0);
    if (bubbleOn) counts[MESH_INDEX.bubble]++;
    if (world.boss) counts[BOSS_MESH[world.boss.id]]++;
    if (world.wormholeY !== null) { counts[MESH_INDEX.blackhole]++; counts[MESH_INDEX.accretion]++; }

    let acc = 0;
    for (let m = 0; m < counts.length; m++) { starts[m] = acc; cursor[m] = acc; acc += counts[m]; }
    meshSlots = acc;

    for (let i = 0; i < bodies.count; i++) {
      const m = bodyMesh[i];
      if (m < 0) continue;
      const k = bodies.kind[i];
      const x = bodies.px[i] + (bodies.x[i] - bodies.px[i]) * alpha;
      const y = bodies.py[i] + (bodies.y[i] - bodies.py[i]) * alpha;
      const halo = haloOf[k];
      if (halo > 0) {
        const pulse = 0.5 + 0.15 * Math.sin(time * HALO_HZ * 6.2832 + x);
        putGlow(x, y, halo, halo, burst[k * 3], burst[k * 3 + 1], burst[k * 3 + 2], pulse);
      }
      putMesh(cursor[m]++, x, y, halo > 0 ? time * PICKUP_SPIN + x : bodies.rot[i], scaleOf[k * VARIANTS + (bodies.variant[i] % VARIANTS)],
        tintOf[k * 3], tintOf[k * 3 + 1], tintOf[k * 3 + 2], 0, 0, MODE_TUMBLE, pulseOf[k]);
    }

    const rocketScale = ROCKET_RADIUS / MESHES.rocket.radius;
    exhaust = rocketOn;
    if (rocketOn) {
      if (diving) {
        putMesh(cursor[MESH_INDEX.rocket]++, dive.x, dive.y, dive.heading, rocketScale * dive.size, 1, 1, 1, 0,
          dive.z, MODE_DIVE, dive.roll, dive.stretch);
        const back = ROCKET_RADIUS * 0.95 * dive.size * (1 + dive.stretch);
        headX = dive.hx; headY = dive.hy; puff = dive.size;
        nozzleX = dive.x - headX * back; nozzleY = dive.y - headY * back;
      } else {
        const blink = world.tick < pl.invulnUntil && (world.tick >> 3) % 2 === 0 ? 0.5 : 0;
        const bank = Math.max(-0.5, Math.min(0.5, -pl.vx * 0.06));
        putMesh(cursor[MESH_INDEX.rocket]++, px, py, bank, rocketScale, 1, 1, 1, blink);
        headX = 0; headY = 1; puff = 1;
        nozzleX = px; nozzleY = py - ROCKET_RADIUS * 0.95;
      }
    }
    if (world.boss) {
      const b = world.boss;
      const m = BOSS_MESH[b.id];
      putMesh(cursor[m]++, b.px + (b.x - b.px) * alpha, b.y, Math.sin(time * 0.8) * 0.08,
        BOSS_RADIUS / MESHES[b.id].radius, 1, 1, 1, 0.45 * Math.min(1, fx.flash / 0.06), bossHeat(b.id, b.hp), MODE_FLAT, BOSS_PULSE);
    }
    if (world.wormholeY !== null) {
      const hy = world.wormholeY;
      const grow = smooth(0, 1, fx.holeAge / HOLE_OPEN_SECONDS);
      const size = HOLE_SCALE * (0.06 + 0.94 * grow);
      putMesh(cursor[MESH_INDEX.blackhole]++, 0, hy, 0, size, 1, 1, 1, 0, 0, MODE_FLAT, 0.12);
      putMesh(cursor[MESH_INDEX.accretion]++, 0, hy, time * 0.5, size, 1, 1, 1, 0, 0, MODE_DISC, 0, BLACKHOLE_TILT);
      const r = BLACKHOLE_RADIUS * (0.06 + 0.94 * grow);
      const haloY = hy - HALO_Z * PITCH_TAN;
      putGlow(0, haloY, r * 1.5, r * 1.5, 1, 0.5, 0.18, 0.2 * grow, GLOW_HALO, HALO_Z);
      putGlow(0, haloY, r * 2.3, r * 2.3, 0.55, 0.3, 1, 0.24 * grow, GLOW_HALO, HALO_Z);
    }
    if (bubbleOn) {
      // Forming: swells in from 70% with a bright flash. Popping (the sim already dropped the shield): swells out and fades.
      const form = Math.min(1, fx.bubbleAge / BUBBLE_FORM_SECONDS);
      const pop = pl.shield ? 0 : 1 - fx.dying / BUBBLE_POP_SECONDS;
      const swell = (0.7 + 0.3 * (1 - (1 - form) * (1 - form))) * (1 + 0.3 * pop) * (1 + 0.015 * Math.sin(time * 3));
      const bright = (1 + 1.5 * (1 - form)) * (1 - pop) * (fx.reduceMotion ? 0.85 : 1);
      const age = fx.ripple >= 0 && fx.ripple < RIPPLE_SECONDS ? fx.ripple : -1;
      putMesh(cursor[MESH_INDEX.bubble]++, px, py, 0, BUBBLE_RADIUS * swell / MESHES.bubble.radius, 0.35, 0.65, 1, bright,
        age, 0, fx.rippleX, fx.rippleY);
    }
    if (fx.hold === HOLD_WON) {
      const flash = smooth(0.62, 0.8, p) * (1 - smooth(0.82, 1, p)) * (fx.reduceMotion ? 0.5 : 1);
      if (flash > 0) putGlow(0, world.wormholeY ?? py, 60, 60, 1, 1, 1, flash, GLOW_FLAT, FLASH_Z);
    }
  }

  function packParticles(pool: ParticlePool): void {
    for (let i = 0; i < pool.count; i++) {
      const a = pool.life[i] / pool.ttl[i];
      if (a > 1) continue;
      if (pool.kind[i] === RING) {
        const s = pool.size[i] * (0.2 + 1.4 * (1 - a));
        putGlow(pool.x[i], pool.y[i], s, s, pool.r[i], pool.g[i], pool.b[i], a * 0.9, GLOW_RING);
      } else if (pool.kind[i] === SMOKE) {
        const s = pool.size[i] * (1 + 1.4 * (1 - a));
        putGlow(pool.x[i], pool.y[i], s, s, pool.r[i], pool.g[i], pool.b[i], a * 0.4);
      } else {
        const s = pool.size[i] * (0.4 + 0.6 * a);
        putGlow(pool.x[i], pool.y[i], s, s, pool.r[i], pool.g[i], pool.b[i], a);
      }
    }
  }

  return {
    meshInst, glowInst, counts, starts, bursts, begin, packWorld, packParticles,
    get meshSlots() { return meshSlots; },
    get glowCount() { return glowCount; },
    get px() { return px; },
    get py() { return py; },
    get nozzleX() { return nozzleX; },
    get nozzleY() { return nozzleY; },
    get headX() { return headX; },
    get headY() { return headY; },
    get puff() { return puff; },
    get exhaust() { return exhaust; },
  };
}
