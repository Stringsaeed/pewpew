/// <reference types="node" />
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Vec3 = readonly [number, number, number];
type Rgb = Vec3;
/** Picks a face color from the primitive's natural indices (band and segment, face, cell). */
type Paint = (a: number, b: number) => Rgb;
/** Triangle soup: 9 position floats and 3 color floats per triangle. Normals and indices are derived in flatten(). */
interface RawMesh { readonly pos: number[]; readonly col: number[]; /** Normals follow the position instead of the face, for spheres that want to read as round. */ readonly smooth?: boolean }
type Builder = (rng: () => number) => RawMesh;

const SEED = 0x5eed1e55;
const TAU = Math.PI * 2;

/** A color with any component above 1 is emissive: the mesh shader draws it unlit. */
const PALETTE = {
  hull: [0.86, 0.9, 1] as Rgb,
  hullStripe: [0.15, 0.95, 1] as Rgb,
  nose: [1, 0.2, 0.65] as Rgb,
  fin: [1, 0.15, 0.6] as Rgb,
  steel: [0.38, 0.4, 0.5] as Rgb,
  flame: [2, 0.9, 0.25] as Rgb,
  rock: [[0.42, 0.38, 0.52], [0.5, 0.45, 0.62], [0.36, 0.32, 0.46], [0.56, 0.5, 0.66]] as readonly Rgb[],
  /** Threat orange, the one hue for anything that hurts: mine cores, drones, enemy bolts, the boss bar. */
  mineCore: [1.9, 0.5, 0.16] as Rgb,
  mineSpike: [0.55, 0.55, 0.65] as Rgb,
  drone: [1.55, 0.55, 0.22] as Rgb,
  droneDark: [0.2, 0.05, 0.09] as Rgb,
  droneEye: [2.2, 2, 1.7] as Rgb,
  well: [0.4, 0.1, 0.8] as Rgb,
  wellBright: [0.75, 0.35, 1.3] as Rgb,
  wellCore: [0.25, 0.02, 0.5] as Rgb,
  mint: [0.3, 1, 0.72] as Rgb,
  mintBright: [0.7, 1.4, 1.05] as Rgb,
  shield: [0.2, 0.5, 1] as Rgb,
  shieldBright: [0.6, 0.9, 1.6] as Rgb,
  amber: [1, 0.68, 0.08] as Rgb,
  amberBright: [1.6, 1.05, 0.25] as Rgb,
  white: [1.5, 1.45, 1.9] as Rgb,
  violet: [0.6, 0.32, 1.15] as Rgb,
  /** Bosses: dark armor with magenta emissive accents, so the brand color reads as the threat. */
  bossArmor: [0.17, 0.15, 0.27] as Rgb,
  bossLit: [0.3, 0.27, 0.43] as Rgb,
  bossDeep: [0.085, 0.075, 0.15] as Rgb,
  bossChitin: [0.22, 0.13, 0.22] as Rgb,
  bossChitinDeep: [0.11, 0.07, 0.13] as Rgb,
  bossMagenta: [2.1, 0.2, 1.05] as Rgb,
  bossHot: [2.8, 0.75, 1.9] as Rgb,
  bossEmber: [1.15, 0.12, 0.62] as Rgb,
  /** The shield bubble is drawn by its own shader; the color is only its tint. */
  bubble: [0.35, 0.65, 1] as Rgb,
  holeCore: [0, 0, 0] as Rgb,
  photon: [3, 2.7, 2.2] as Rgb,
  /** Accretion disc, inner edge to outer edge: white-hot, amber, deep orange, magenta, violet fading to near-black. Every channel set peaks above 1, so the disc is unlit. */
  disc: [[3, 2.9, 2.6], [2.8, 2.5, 1.8], [2.5, 1.8, 0.8], [2.2, 1.2, 0.4], [1.9, 0.8, 0.22], [1.6, 0.5, 0.2], [1.4, 0.3, 0.4], [1.1, 0.25, 0.9], [0.7, 0.18, 1.1], [0.4, 0.1, 1.02]] as readonly Rgb[],
} as const;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => scale(a, 1 / Math.hypot(a[0], a[1], a[2]));
const solid = (c: Rgb): Paint => () => c;
const mesh = (): RawMesh => ({ pos: [], col: [] });

/** Appends a triangle wound so its face normal agrees with `outward`. Degenerate triangles are dropped. */
function tri(m: RawMesh, a: Vec3, b: Vec3, c: Vec3, color: Rgb, outward: Vec3): void {
  const n = cross(sub(b, a), sub(c, a));
  if (Math.hypot(n[0], n[1], n[2]) < 1e-9) return;
  const [p, q] = dot(n, outward) < 0 ? [c, b] : [b, c];
  m.pos.push(...a, ...p, ...q);
  m.col.push(...color);
}

function merge(...parts: RawMesh[]): RawMesh {
  const out = mesh();
  for (const p of parts) { out.pos.push(...p.pos); out.col.push(...p.col); }
  return out;
}

/** Rotations and positive scales only, so winding stays outward. */
function transform(m: RawMesh, f: (p: Vec3) => Vec3): RawMesh {
  const pos: number[] = [];
  for (let i = 0; i < m.pos.length; i += 3) pos.push(...f([m.pos[i], m.pos[i + 1], m.pos[i + 2]]));
  return { pos, col: [...m.col] };
}
const rotX = (t: number) => (p: Vec3): Vec3 => [p[0], p[1] * Math.cos(t) - p[2] * Math.sin(t), p[1] * Math.sin(t) + p[2] * Math.cos(t)];
const rotY = (t: number) => (p: Vec3): Vec3 => [p[0] * Math.cos(t) + p[2] * Math.sin(t), p[1], -p[0] * Math.sin(t) + p[2] * Math.cos(t)];
const rotZ = (t: number) => (p: Vec3): Vec3 => [p[0] * Math.cos(t) - p[1] * Math.sin(t), p[0] * Math.sin(t) + p[1] * Math.cos(t), p[2]];
const place = (s: Vec3, at: Vec3) => (p: Vec3): Vec3 => [p[0] * s[0] + at[0], p[1] * s[1] + at[1], p[2] * s[2] + at[2]];

/** Revolves an (r, y) profile, ordered bottom to top, around the y axis. paint(band, segment). */
function lathe(profile: readonly (readonly [number, number])[], segments: number, paint: Paint): RawMesh {
  const m = mesh();
  const at = (r: number, y: number, a: number): Vec3 => [r * Math.cos(a), y, r * Math.sin(a)];
  for (let j = 0; j + 1 < profile.length; j++) {
    const [r0, y0] = profile[j];
    const [r1, y1] = profile[j + 1];
    const nr = y1 - y0;
    const ny = -(r1 - r0);
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * TAU;
      const a1 = ((i + 1) / segments) * TAU;
      const am = (a0 + a1) / 2;
      const out: Vec3 = [nr * Math.cos(am), ny, nr * Math.sin(am)];
      const color = paint(j, i);
      tri(m, at(r0, y0, a0), at(r0, y0, a1), at(r1, y1, a1), color, out);
      tri(m, at(r0, y0, a0), at(r1, y1, a1), at(r1, y1, a0), color, out);
    }
  }
  return m;
}

/** Subdivided icosahedron with shared-vertex radial noise, so displaced faces never crack. paint(face, 0). */
function icosphere(subdiv: number, noiseAmp: number, rng: () => number, paint: Paint): RawMesh {
  const t = (1 + Math.sqrt(5)) / 2;
  const verts: Vec3[] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t],
    [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map((v) => norm(v as unknown as Vec3));
  let faces: (readonly [number, number, number])[] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  for (let s = 0; s < subdiv; s++) {
    const mid = new Map<string, number>();
    const midpoint = (a: number, b: number) => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const hit = mid.get(key);
      if (hit !== undefined) return hit;
      verts.push(norm(scale(add(verts[a], verts[b]), 0.5)));
      mid.set(key, verts.length - 1);
      return verts.length - 1;
    };
    faces = faces.flatMap(([a, b, c]) => {
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]] as const;
    });
  }
  const shaped = verts.map((v) => scale(v, 1 + noiseAmp * (rng() * 2 - 1)));
  const m = mesh();
  faces.forEach(([a, b, c], f) => {
    const centroid = scale(add(add(shaped[a], shaped[b]), shaped[c]), 1 / 3);
    tri(m, shaped[a], shaped[b], shaped[c], paint(f, 0), centroid);
  });
  return m;
}

/** Extrudes a convex xy polygon along z, centred on z = 0. paint(0 = caps | 1 = sides, edge). */
function extrude(poly: readonly (readonly [number, number])[], depth: number, paint: Paint): RawMesh {
  const m = mesh();
  const h = depth / 2;
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    tri(m, [cx, cy, h], [x0, y0, h], [x1, y1, h], paint(0, i), [0, 0, 1]);
    tri(m, [cx, cy, -h], [x0, y0, -h], [x1, y1, -h], paint(0, i), [0, 0, -1]);
    const out: Vec3 = [(x0 + x1) / 2 - cx, (y0 + y1) / 2 - cy, 0];
    tri(m, [x0, y0, h], [x0, y0, -h], [x1, y1, -h], paint(1, i), out);
    tri(m, [x0, y0, h], [x1, y1, -h], [x1, y1, h], paint(1, i), out);
  }
  return m;
}

/** Regular n-gon prism facing the camera (+z). phase rotates the polygon; 0 puts a vertex at +y. */
function prism(sides: number, radius: number, depth: number, paint: Paint, phase = 0): RawMesh {
  const poly = Array.from({ length: sides }, (_, i) => {
    const a = Math.PI / 2 + phase + (i / sides) * TAU;
    return [radius * Math.cos(a), radius * Math.sin(a)] as const;
  });
  return extrude(poly, depth, paint);
}

/** Pyramidal spikes from `base` out to `length` along each direction. paint(spike, side). */
function spikes(dirs: readonly Vec3[], base: number, length: number, width: number, sides: number, paint: Paint): RawMesh {
  const m = mesh();
  dirs.forEach((raw, k) => {
    const d = norm(raw);
    const helper: Vec3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = norm(cross(d, helper));
    const v = cross(d, u);
    const c = scale(d, base);
    const tip = scale(d, length);
    const ring = Array.from({ length: sides }, (_, i) => {
      const a = (i / sides) * TAU;
      return add(c, add(scale(u, width * Math.cos(a)), scale(v, width * Math.sin(a))));
    });
    for (let i = 0; i < sides; i++) {
      const a = ring[i], b = ring[(i + 1) % sides];
      tri(m, tip, a, b, paint(k, i), sub(scale(add(add(tip, a), b), 1 / 3), c));
    }
  });
  return m;
}

/** Torus around the z axis, so it faces the camera. paint(segment, tube). */
function ring(segments: number, major: number, minor: number, tube: number, paint: Paint): RawMesh {
  const m = mesh();
  const at = (u: number, v: number): Vec3 => {
    const r = major + minor * Math.cos(v);
    return [r * Math.cos(u), r * Math.sin(u), minor * Math.sin(v)];
  };
  for (let i = 0; i < segments; i++) {
    const u0 = (i / segments) * TAU, u1 = ((i + 1) / segments) * TAU, um = (u0 + u1) / 2;
    for (let j = 0; j < tube; j++) {
      const v0 = (j / tube) * TAU, v1 = ((j + 1) / tube) * TAU, vm = (v0 + v1) / 2;
      const out = sub(at(um, vm), [major * Math.cos(um), major * Math.sin(um), 0]);
      const color = paint(i, j);
      tri(m, at(u0, v0), at(u1, v0), at(u1, v1), color, out);
      tri(m, at(u0, v0), at(u1, v1), at(u0, v1), color, out);
    }
  }
  return m;
}

/** Flat annulus in the xy plane facing +z. Band edges follow (j / bands) ** curve, so curve above 1 packs thin bands against the inner edge. paint(band, segment). */
function disc(inner: number, outer: number, segments: number, bands: number, curve: number, paint: Paint): RawMesh {
  const m = mesh();
  const at = (r: number, a: number): Vec3 => [r * Math.cos(a), r * Math.sin(a), 0];
  for (let j = 0; j < bands; j++) {
    const r0 = inner + (outer - inner) * (j / bands) ** curve;
    const r1 = inner + (outer - inner) * ((j + 1) / bands) ** curve;
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * TAU, a1 = ((i + 1) / segments) * TAU;
      const color = paint(j, i);
      tri(m, at(r0, a0), at(r0, a1), at(r1, a1), color, [0, 0, 1]);
      tri(m, at(r0, a0), at(r1, a1), at(r1, a0), color, [0, 0, 1]);
    }
  }
  return m;
}

const pick = (rng: () => number, colors: readonly Rgb[]): Paint => () => colors[Math.floor(rng() * colors.length)];
const alternate = (a: Rgb, b: Rgb): Paint => (i) => (i % 2 === 0 ? a : b);
const ICO_DIRS: readonly Vec3[] = [
  [-1, 1.618, 0], [1, 1.618, 0], [-1, -1.618, 0], [1, -1.618, 0], [0, -1, 1.618], [0, 1, 1.618],
  [0, -1, -1.618], [0, 1, -1.618], [1.618, 0, -1], [1.618, 0, 1], [-1.618, 0, -1], [-1.618, 0, 1],
];

function asteroid(rng: () => number): RawMesh {
  const s: Vec3 = [0.85 + rng() * 0.3, 0.85 + rng() * 0.3, 0.8 + rng() * 0.25];
  return transform(icosphere(2, 0.2, rng, pick(rng, PALETTE.rock)), place(s, [0, 0, 0]));
}

function fragment(rng: () => number): RawMesh {
  const s: Vec3 = [0.7 + rng() * 0.5, 1 + rng() * 0.4, 0.6 + rng() * 0.3];
  return transform(icosphere(0, 0.3, rng, pick(rng, PALETTE.rock)), place(s, [0, 0, 0]));
}

function rocket(): RawMesh {
  const hullBands: readonly Rgb[] = [PALETTE.hull, PALETTE.hullStripe, PALETTE.hull, PALETTE.hull, PALETTE.nose, PALETTE.nose];
  const hull = lathe([[0.3, -0.74], [0.38, -0.5], [0.4, -0.25], [0.4, 0.15], [0.34, 0.5], [0.2, 0.82], [0, 1.1]], 12, (j) => hullBands[j]);
  const nozzle = lathe([[0, -1.02], [0.28, -1.02], [0.17, -0.8], [0.3, -0.74]], 12, (j) => (j === 0 ? PALETTE.flame : PALETTE.steel));
  const fin = extrude([[0.33, -0.72], [0.82, -1], [0.78, -0.62], [0.36, -0.1]], 0.06, solid(PALETTE.fin));
  const fins = [0, 1, 2, 3].map((k) => transform(fin, rotY((k * TAU) / 4)));
  return merge(hull, nozzle, ...fins);
}

function mine(rng: () => number): RawMesh {
  const core = icosphere(1, 0, rng, solid(PALETTE.mineCore));
  const spikeShell = spikes(ICO_DIRS, 0.85, 1.55, 0.16, 4, (_, i) => (i % 2 === 0 ? PALETTE.mineSpike : PALETTE.steel));
  return merge(transform(core, place([0.9, 0.9, 0.9], [0, 0, 0])), spikeShell);
}

function drone(): RawMesh {
  const wing = extrude([[-1, 0.42], [-0.35, 0.55], [0.35, 0.55], [1, 0.42], [0, -0.8]], 0.2, (s) => (s === 0 ? PALETTE.drone : PALETTE.droneDark));
  const canopy = transform(prism(6, 0.26, 0.36, (s) => (s === 0 ? PALETTE.droneEye : PALETTE.droneDark)), place([1, 1, 1], [0, 0.1, 0.16]));
  return merge(wing, canopy);
}

function well(rng: () => number): RawMesh {
  const torus = ring(24, 0.8, 0.17, 8, (i) => (i % 3 === 0 ? PALETTE.wellBright : PALETTE.well));
  const inner = ring(16, 0.42, 0.07, 6, solid(PALETTE.wellBright));
  const core = transform(icosphere(1, 0.1, rng, solid(PALETTE.wellCore)), place([0.28, 0.28, 0.28], [0, 0, 0]));
  return merge(torus, inner, core);
}

/** Event horizon and photon ring, both facing the camera. The renderer tilts and spins `accretion` on its own. */
function blackhole(): RawMesh {
  const horizon = prism(48, 1, 0.14, solid(PALETTE.holeCore));
  // Just proud of the horizon. Any further forward and the camera pitch slides it off the hole.
  const photon = transform(ring(48, 1.03, 0.06, 6, solid(PALETTE.photon)), place([1, 1, 1], [0, 0, 0.3]));
  return merge(horizon, photon);
}

const HOLE_DISC = { inner: 1.1, outer: 2.9 } as const;

/** Flat in the xy plane. Three spiral arms of brighter segments, so the spin reads on an otherwise symmetric disc. */
function accretion(): RawMesh {
  const bands = 18;
  return disc(HOLE_DISC.inner, HOLE_DISC.outer, 56, bands, 1.7, (j, i) => {
    const t = (j / (bands - 1)) * (PALETTE.disc.length - 1);
    const lo = Math.floor(t), hi = Math.min(lo + 1, PALETTE.disc.length - 1);
    const f = t - lo;
    const arm = 0.8 + 0.3 * Math.sin(((i + j * 1.6) / 56) * TAU * 3);
    const c = PALETTE.disc[lo].map((v, k) => (v + (PALETTE.disc[hi][k] - v) * f) * arm) as unknown as Rgb;
    const peak = Math.max(...c);
    return peak < 1.05 ? (c.map((v) => (v * 1.05) / peak) as unknown as Rgb) : c;
  });
}

/** Every boss bolt spawns at the sim's (boss.x, boss.y - 1.4). The bosses are authored in world units around that point. */
const MUZZLE_Y = -1.4;
type Poly = readonly (readonly [number, number])[];
const mirror = (poly: Poly): Poly => poly.map(([x, y]) => [-x, y] as const);
const at = (m: RawMesh, x: number, y: number, z: number): RawMesh => transform(m, place([1, 1, 1], [x, y, z]));
/** A convex plate: caps in `top`, sides alternating `side` and `edge`, centred on z. */
const plate = (poly: Poly, depth: number, x: number, y: number, z: number, top: Rgb, side: Rgb, edge: Rgb = side): RawMesh =>
  at(extrude(poly, depth, (s, i) => (s === 0 ? top : i % 2 === 0 ? side : edge)), x, y, z);

/** Heavy gunship: twin cannons flank the firing port, one big eye, a larger right wing and a broken left one. */
function warden(rng: () => number): RawMesh {
  const { bossArmor: A, bossLit: L, bossDeep: D, bossMagenta: M, bossHot: H } = PALETTE;
  const hull = plate([[-0.5, 1], [0.5, 1], [1.05, 0.55], [1.4, -0.1], [0.95, -0.75], [0.45, -1.05], [-0.45, -1.05], [-0.95, -0.75], [-1.4, -0.1], [-1.05, 0.55]], 0.5, 0, 0, 0, A, D, L);
  const wingR: Poly = [[1.2, 0.75], [2, 0.5], [2.3, -0.2], [2.1, -0.8], [1.5, -0.95], [1, -0.3]];
  const wingL: Poly = [[-1.15, 0.7], [-1.85, 0.35], [-2.05, -0.35], [-1.55, -0.85], [-1, -0.3]];
  const wings = [plate(wingR, 0.34, 0, 0, -0.08, D, A, L), plate(wingL, 0.3, 0, 0, -0.1, D, A, L)];
  const dorsal = plate([[-0.8, 0.55], [0.8, 0.55], [1, -0.1], [0.55, -0.55], [-0.55, -0.55], [-1, -0.1]], 0.12, 0, 0, 0.3, L, A, D);
  const slashes = [1, -1].map((sx) => plate([[0.55, 0.62], [0.95, 0.42], [1.02, 0.3], [0.6, 0.5]].map(([x, y]) => [x * sx, y] as const), 0.05, 0, 0, 0.38, M, M));
  const vents = [at(extrude([[1.45, 0.05], [2, 0.05], [2.05, -0.1], [1.4, -0.1]], 0.04, solid(M)), 0, 0, 0.1),
    at(extrude([[-1.4, -0.05], [-1.8, -0.05], [-1.85, -0.2], [-1.4, -0.2]], 0.04, solid(M)), 0, 0, 0.08)];
  const barrel = lathe([[0.12, -1.5], [0.2, -1.38], [0.2, -0.5]], 8, (j) => (j === 0 ? H : A));
  const housing = prism(6, 0.36, 0.5, (sd) => (sd === 0 ? D : L));
  const cannons = [-1, 1].flatMap((sx) => [at(barrel, sx * 0.62, 0, 0.3), at(housing, sx * 0.62, -0.5, 0.18)]);
  const portHousing = at(prism(8, 0.3, 0.3, (sd) => (sd === 0 ? D : A)), 0, MUZZLE_Y + 0.1, 0.18);
  const port = at(prism(8, 0.15, 0.2, solid(H)), 0, MUZZLE_Y, 0.3);
  const eyeSocket = at(prism(6, 0.55, 0.25, (sd) => (sd === 0 ? D : L)), 0, 0.2, 0.36);
  const eye = at(transform(icosphere(1, 0, rng, solid(H)), place([0.36, 0.36, 0.36], [0, 0, 0])), 0, 0.2, 0.5);
  const dish = at(prism(5, 0.22, 0.3, (sd) => (sd === 0 ? M : A)), 1.85, 0.2, 0.2);
  const aerial = at(spikes([[0.2, 1, 0]], 0.1, 0.9, 0.07, 4, solid(L)), -1.7, 0.4, 0.05);
  return merge(hull, ...wings, dorsal, ...slashes, ...vents, ...cannons, portHousing, port, eyeSocket, eye, dish, aerial);
}

/** Honeycomb of dark chitin cells with pulsing magenta pupils, a bright heart, and the launch cell at the firing point. */
function hive(rng: () => number): RawMesh {
  const { bossChitin: C, bossChitinDeep: CD, bossMagenta: M, bossHot: H, bossEmber: E } = PALETTE;
  const rc = 0.43;
  const parts: RawMesh[] = [];
  for (let q = -3; q <= 3; q++) {
    for (let r = -3; r <= 3; r++) {
      const layer = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
      const x = rc * Math.sqrt(3) * (q + r / 2), y = -rc * 1.5 * r;
      const reach = Math.hypot(x, y);
      if (layer === 0 || layer > 3 || reach > 1.95) continue;
      if (layer === 3 && rng() > 0.55) continue;
      if (layer === 2 && rng() < 0.15) continue;
      if (Math.abs(x) < 0.05 && y < -1.2) continue;
      const depth = 0.62 - layer * 0.1 + rng() * 0.16;
      parts.push(at(prism(6, rc * 0.93, depth, (sd, i) => (sd === 0 ? C : i % 2 === 0 ? CD : C)), x, y, 0));
      if (rng() < 0.6) parts.push(at(prism(6, rc * 0.5, 0.05, solid(rng() < 0.5 ? M : E)), x, y, depth / 2 + 0.02));
    }
  }
  const launch = [at(prism(6, 0.4, 0.5, (sd, i) => (sd === 0 ? CD : i % 2 === 0 ? C : CD)), 0, MUZZLE_Y, 0),
    at(prism(6, 0.24, 0.08, solid(H)), 0, MUZZLE_Y, 0.27)];
  const heart = at(transform(icosphere(1, 0.06, rng, solid(H)), place([0.44, 0.44, 0.44], [0, 0, 0])), 0, 0, 0.55);
  const aura = at(ring(32, 0.62, 0.05, 6, solid(M)), 0, 0, 0.45);
  const dirs: Vec3[] = [[0.2, 1, 0], [1, 0.55, 0], [-1, 0.3, 0], [-0.8, -0.7, 0], [0.9, -0.6, 0]];
  const barbs = spikes(dirs, 1.75, 2.4, 0.13, 4, (k, i) => (i % 2 === 0 ? CD : k % 2 === 0 ? M : C));
  return merge(...parts, ...launch, heart, aura, barbs);
}

/** Caged sphere: a dark shell inside two crossing rings, barbs through the cage, a reactor eye, and a lance at the firing point. */
function core(rng: () => number): RawMesh {
  const { bossArmor: A, bossLit: L, bossDeep: D, bossMagenta: M, bossHot: H } = PALETTE;
  const shell = transform(icosphere(1, 0.03, rng, (f) => (f % 4 === 0 ? L : A)), place([1.05, 1.05, 1.05], [0, 0, 0]));
  const band = (i: number) => (i % 8 < 2 ? M : A);
  const cageA = transform(ring(40, 1.55, 0.08, 6, (i) => band(i)), rotX(1.2));
  const cageB = transform(ring(40, 1.55, 0.08, 6, (i) => band(i + 4)), rotY(1.2));
  const hoop = ring(40, 1.75, 0.06, 6, (i) => (i % 5 === 0 ? H : D));
  const angles = [0.25, 0.95, 1.7, 2.45, 3.2, 3.95, 5.6];
  const lengths = [2.35, 2.1, 2.4, 1.9, 2.35, 2.2, 2.4];
  const barbs = angles.map((a, k) => spikes([[Math.cos(a), Math.sin(a), 0]], 1.6, lengths[k], 0.16, 4, (_, i) => (i % 2 === 0 ? D : k % 2 === 0 ? M : L)));
  const socket = at(prism(8, 0.75, 0.2, (sd) => (sd === 0 ? D : A)), 0, 0.05, 0.9);
  const eye = at(transform(icosphere(1, 0, rng, solid(H)), place([0.42, 0.42, 0.42], [0, 0, 0])), 0, 0.05, 1);
  const iris = at(ring(32, 0.6, 0.06, 6, solid(M)), 0, 0.05, 0.95);
  const lance = spikes([[0, -1, 0]], 1.05, 1.5, 0.15, 4, (_, i) => (i % 2 === 0 ? D : M));
  const muzzle = at(transform(icosphere(0, 0, rng, solid(H)), place([0.15, 0.15, 0.15], [0, 0, 0])), 0, MUZZLE_Y, 0.2);
  const satellite = at(prism(5, 0.2, 0.3, (sd) => (sd === 0 ? M : A)), -1.9, 1.05, 0.1);
  return merge(shell, cageA, cageB, hoop, ...barbs, socket, eye, iris, lance, muzzle, satellite);
}

const BUILDERS = {
  rocket,
  asteroid0: asteroid, asteroid1: asteroid, asteroid2: asteroid, asteroid3: asteroid,
  fragment0: fragment, fragment1: fragment,
  mine, drone, well,
  crystal: () => lathe([[0, -1], [0.55, 0], [0, 1]], 6, (j, i) => ((i + j) % 2 === 0 ? PALETTE.mint : PALETTE.mintBright)),
  shield: (rng) => icosphere(1, 0, rng, (f) => (f % 3 === 0 ? PALETTE.shieldBright : PALETTE.shield)),
  rapid: () => merge(
    transform(prism(3, 0.62, 0.34, (s) => (s === 0 ? PALETTE.amberBright : PALETTE.amber)), place([1.3, 0.8, 1], [0, 0.35, 0])),
    transform(prism(3, 0.62, 0.34, (s) => (s === 0 ? PALETTE.amberBright : PALETTE.amber)), place([1.3, 0.8, 1], [0, -0.35, 0])),
  ),
  blackhole, accretion, warden, hive, core,
  // Last, so it draws last (it alone uses the translucent pipeline) and its noise-free rng draws shift no earlier mesh.
  bubble: (rng) => ({ ...icosphere(3, 0, rng, solid(PALETTE.bubble)), smooth: true }),
} satisfies Record<string, Builder>;

function flatten(raw: RawMesh): { positions: number[]; normals: number[]; colors: number[]; radius: number } {
  const normals: number[] = [];
  const colors: number[] = [];
  let radius = 0;
  for (let t = 0; t < raw.pos.length; t += 9) {
    const a: Vec3 = [raw.pos[t], raw.pos[t + 1], raw.pos[t + 2]];
    const b: Vec3 = [raw.pos[t + 3], raw.pos[t + 4], raw.pos[t + 5]];
    const c: Vec3 = [raw.pos[t + 6], raw.pos[t + 7], raw.pos[t + 8]];
    const face = norm(cross(sub(b, a), sub(c, a)));
    const col = raw.col.slice(t / 3, t / 3 + 3);
    for (const p of [a, b, c]) {
      normals.push(...(raw.smooth ? norm(p) : face));
      colors.push(...col);
      radius = Math.max(radius, Math.hypot(p[0], p[1], p[2]));
    }
  }
  return { positions: raw.pos, normals, colors, radius };
}

const num = (v: number) => {
  const r = Math.round(v * 1e4) / 1e4;
  return Object.is(r, -0) ? '0' : String(r);
};
const list = (xs: readonly number[]) => xs.map(num).join(',');

function emit(): string {
  const rng = mulberry32(SEED);
  const ids = Object.keys(BUILDERS) as (keyof typeof BUILDERS)[];
  let vertices = 0;
  const entries = ids.map((id) => {
    const m = flatten(BUILDERS[id](rng));
    const count = m.positions.length / 3;
    if ((id === 'warden' || id === 'hive' || id === 'core') && !(m.radius > 2.2 && m.radius < 2.5)) throw new Error(`${id}: radius ${m.radius} strays from the drawn boss radius 2.4`);
    if (count > 0xffff) throw new Error(`${id}: ${count} vertices overflow Uint16 indices`);
    vertices += count;
    return [
      `  ${id}: {`,
      `    radius: ${num(m.radius)},`,
      `    positions: new Float32Array([${list(m.positions)}]),`,
      `    normals: new Float32Array([${list(m.normals)}]),`,
      `    colors: new Float32Array([${list(m.colors)}]),`,
      `    indices: new Uint16Array([${list(Array.from({ length: count }, (_, i) => i))}]),`,
      `  },`,
    ].join('\n');
  });
  return [
    '// Generated by scripts/gen-meshes.ts. Do not edit; rerun `npm run gen:meshes`.',
    `// MESH_STATS meshes=${ids.length} vertices=${vertices} indices=${vertices} triangles=${vertices / 3}`,
    '',
    '/** Flat-shaded. Vertices are unshared and each carries its face normal. Color components above 1 are emissive. */',
    'export interface MeshData {',
    '  readonly positions: Float32Array; // xyz',
    '  readonly normals: Float32Array;   // xyz',
    '  readonly colors: Float32Array;    // rgb, neon palette',
    '  readonly indices: Uint16Array;',
    '  readonly radius: number;          // bounding radius; the renderer scales by archetype radius / mesh radius',
    '}',
    `export type MeshId = ${ids.map((id) => `'${id}'`).join(' | ')};`,
    'export const MESHES: { readonly [M in MeshId]: MeshData } = {',
    ...entries,
    '};',
    '',
  ].join('\n');
}

const out = resolve(__dirname, '../src/render/meshes.gen.ts');
const text = emit();
if (process.argv.includes('--check')) {
  const committed = readFileSync(out, 'utf8');
  if (committed !== text) {
    console.error(`${out} differs from the generator output. Rerun \`npm run gen:meshes\`.`);
    process.exit(1);
  }
  process.exit(0);
}
writeFileSync(out, text);
console.log(`wrote ${out} (${(text.length / 1024).toFixed(0)} KB)`);
