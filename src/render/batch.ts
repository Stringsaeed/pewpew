import { ARCHETYPES, Kind, type BossId } from '../levels';
import { MAX_BODIES, type WorldView } from '../sim';
import { BOSS_RADIUS, LOOK, ROCKET_RADIUS, WORMHOLE_RADIUS } from './look';
import { MESHES, type MeshId } from './meshes.gen';
import { PARTICLE_CAP, type BurstTables, type ParticlePool } from './particles';

export const MESH_IDS = Object.keys(MESHES) as MeshId[];
export const INSTANCE_FLOATS = 8;

const MESH_INDEX = Object.fromEntries(MESH_IDS.map((id, i) => [id, i])) as { [M in MeshId]: number };
const MESH_CAP = MAX_BODIES + 3;
const GLOW_CAP = MAX_BODIES + PARTICLE_CAP + 2;
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
  readonly bursts: BurstTables;
  begin(): void;
  packWorld(world: WorldView, alpha: number, time: number, bossFlash: number): void;
  packParticles(pool: ParticlePool): void;
}

/** Kind-to-mesh tables, the counting sort, and instance packing. No GPU, no per-frame allocation. */
export function createBatch(): MeshBatch {
  // Flat (kind, variant) tables so the per-body loop is two typed-array reads. Mesh -1 means a glow kind.
  const meshOf = new Int16Array(KIND_COUNT * VARIANTS).fill(-1);
  const scaleOf = new Float32Array(KIND_COUNT * VARIANTS);
  const tintOf = new Float32Array(KIND_COUNT * 3);
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
    }
  }
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

  function putMesh(slot: number, x: number, y: number, rot: number, s: number, r: number, g: number, b: number, flash: number) {
    const o = slot * INSTANCE_FLOATS;
    meshInst[o] = x; meshInst[o + 1] = y; meshInst[o + 2] = rot; meshInst[o + 3] = s;
    meshInst[o + 4] = r; meshInst[o + 5] = g; meshInst[o + 6] = b; meshInst[o + 7] = flash;
  }
  function putGlow(x: number, y: number, sx: number, sy: number, r: number, g: number, b: number, a: number) {
    if (glowCount === GLOW_CAP) return;
    const o = glowCount++ * INSTANCE_FLOATS;
    glowInst[o] = x; glowInst[o + 1] = y; glowInst[o + 2] = sx; glowInst[o + 3] = sy;
    glowInst[o + 4] = r; glowInst[o + 5] = g; glowInst[o + 6] = b; glowInst[o + 7] = a;
  }

  function begin(): void {
    counts.fill(0);
    glowCount = 0;
    meshSlots = 0;
  }

  function packWorld(world: WorldView, alpha: number, time: number, bossFlash: number): void {
    const pl = world.player;
    px = pl.px + (pl.x - pl.px) * alpha;
    py = pl.py + (pl.y - pl.py) * alpha;
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
          putGlow(x, y, look.size * 0.7, look.size * 1.9, look.rgba[0], look.rgba[1], look.rgba[2], look.rgba[3]);
        }
      }
    }
    counts[MESH_INDEX.rocket]++;
    if (world.boss) counts[BOSS_MESH[world.boss.id]]++;
    if (world.wormholeY !== null) counts[MESH_INDEX.wormhole]++;

    let acc = 0;
    for (let m = 0; m < counts.length; m++) { starts[m] = acc; cursor[m] = acc; acc += counts[m]; }
    meshSlots = acc;

    for (let i = 0; i < bodies.count; i++) {
      const m = bodyMesh[i];
      if (m < 0) continue;
      const k = bodies.kind[i];
      putMesh(cursor[m]++,
        bodies.px[i] + (bodies.x[i] - bodies.px[i]) * alpha,
        bodies.py[i] + (bodies.y[i] - bodies.py[i]) * alpha,
        bodies.rot[i], scaleOf[k * VARIANTS + (bodies.variant[i] % VARIANTS)],
        tintOf[k * 3], tintOf[k * 3 + 1], tintOf[k * 3 + 2], 0);
    }
    const blink = world.tick < pl.invulnUntil && (world.tick >> 3) % 2 === 0 ? 0.5 : 0;
    const bank = Math.max(-0.5, Math.min(0.5, -pl.vx * 0.06));
    putMesh(cursor[MESH_INDEX.rocket]++, px, py, bank, ROCKET_RADIUS / MESHES.rocket.radius, 1, 1, 1, blink);
    if (world.boss) {
      const b = world.boss;
      const m = BOSS_MESH[b.id];
      putMesh(cursor[m]++, b.px + (b.x - b.px) * alpha, b.y, Math.sin(time * 0.8) * 0.08,
        BOSS_RADIUS / MESHES[b.id].radius, 1, 1, 1, 0.45 * Math.min(1, bossFlash / 0.06));
    }
    if (world.wormholeY !== null) {
      putMesh(cursor[MESH_INDEX.wormhole]++, 0, world.wormholeY, time * 0.9, WORMHOLE_RADIUS / MESHES.wormhole.radius, 1, 1, 1, 0);
      putGlow(0, world.wormholeY, WORMHOLE_RADIUS * 0.9, WORMHOLE_RADIUS * 0.9, 0.6, 0.4, 1, 0.5);
    }
    if (pl.shield) putGlow(px, py, 1.3, 1.3, 0.35, 0.65, 1, -0.9);
  }

  function packParticles(pool: ParticlePool): void {
    for (let i = 0; i < pool.count; i++) {
      const a = pool.life[i] / pool.ttl[i];
      const s = pool.size[i] * (0.4 + 0.6 * a);
      putGlow(pool.x[i], pool.y[i], s, s, pool.r[i], pool.g[i], pool.b[i], a);
    }
  }

  return {
    meshInst, glowInst, counts, starts, bursts, begin, packWorld, packParticles,
    get meshSlots() { return meshSlots; },
    get glowCount() { return glowCount; },
    get px() { return px; },
    get py() { return py; },
  };
}
