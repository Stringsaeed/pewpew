import { d, std, tgpu, type TgpuFragmentFn, type TgpuVertexFn } from 'typegpu';
import { RIPPLE_SECONDS } from './fx';
import { NEBULA_OCTAVES } from './look';
import { MESHES } from './meshes.gen';

/**
 * The four shaders, written as TypeGPU functions. unplugin-typegpu ('use gpu') captures each body at build time and
 * `shaderCode` resolves a vertex and fragment pair into one WGSL module. The renderer keeps its own WebGPU pipelines and
 * draw loop; the schemas below are the single source of the uniform block and both vertex buffer layouts.
 */

/** tint: nebula rgb. fx: x scroll speed (units/s), y warp 0..1, zw spare. camera.ts writes it as UNIFORM_FLOATS floats. */
export const Uniforms = d.struct({
  view: d.mat4x4f, proj: d.mat4x4f, res: d.vec2f, camY: d.f32, time: d.f32, tint: d.vec4f, fx: d.vec4f,
});
export const uniformLayout = tgpu.bindGroupLayout({ u: { uniform: Uniforms } }).$idx(0);

/** One interleaved mesh vertex, 36 B: position, normal, color. Colors above 1 are emissive. */
export const MeshVertex = d.unstruct({ pos: d.location(0, d.vec3f), nrm: d.location(1, d.vec3f), col: d.location(2, d.vec3f) });

/**
 * Mesh and glow instances share one layout: place, color, then three per-draw extras.
 * Mesh: place (x, y, rot, scale), color (r, g, b, flash), extra (heat, mode, a, b):
 *  mode 0  tumble: spin about z with a bounded wobble about y. Bodies. a = emissive pulse amplitude (mine cores).
 *  mode 1  flat: spin about z only. Bosses and the event horizon. a = emissive pulse amplitude.
 *  mode 2  disc: spin about its own axis, then tilt about x by b. The accretion disc.
 *  mode 3  dive: roll about the long axis by a, stretch it by b, point it along rot, lift it toward the camera by heat. The rocket falling into the hole.
 * Glow: place (x, y, half width, half height), color (r, g, b, alpha), extra (shape, z, 0, 0).
 * Bubble: the mesh layout, with extra (ripple age or -1, unused, impact x, impact y) and color.a as brightness.
 */
export const Instance = d.unstruct({ place: d.location(3, d.vec4f), color: d.location(4, d.vec4f), extra: d.location(5, d.vec4f) });

export const meshVertexLayout = tgpu.vertexLayout(d.disarrayOf(MeshVertex));
export const instanceLayout = tgpu.vertexLayout(d.disarrayOf(Instance), 'instance');

/** Outer radius of the accretion disc in mesh units. */
const HOLE_OUTER = MESHES.accretion.radius;
const KEY_LIGHT = std.normalize(d.vec3f(-0.45, 0.55, 0.7));
/** Toward the camera from a body, along the camera's 16 degree pitch. Rims and the bubble's fresnel use it. */
const TOWARD_CAMERA = d.vec3f(0, -0.276, 0.961);

/**
 * Both hashes avoid sin: Adreno and Mali approximate it for large arguments, and the classic sin(dot(p, k)) hash
 * feeds it tens of thousands, which turned the nebula into flat rectangles on real Android phones.
 */
const hash21 = (p: d.v2f): number => {
  'use gpu';
  let q = std.fract(d.vec3f(p.x, p.y, p.x).mul(0.1031));
  q = q.add(std.dot(q, q.yzx.add(33.33)));
  return std.fract((q.x + q.y) * q.z);
};

const hash3 = (p: d.v2f): d.v3f => {
  'use gpu';
  let q = std.fract(d.vec3f(p.x, p.y, p.x).mul(d.vec3f(0.1031, 0.103, 0.0973)));
  q = q.add(std.dot(q, q.yxz.add(33.33)));
  return std.fract(q.xxy.add(q.yzz).mul(q.zyx));
};

const valueNoise = (p: d.v2f): number => {
  'use gpu';
  const i = std.floor(p);
  const f = std.fract(p);
  const w = f.mul(f).mul(d.vec2f(3).sub(f.mul(2)));
  return std.mix(
    std.mix(hash21(i), hash21(i.add(d.vec2f(1, 0))), w.x),
    std.mix(hash21(i.add(d.vec2f(0, 1))), hash21(i.add(d.vec2f(1, 1))), w.x),
    w.y,
  );
};

const rotX = (r: number): d.m3x3f => {
  'use gpu';
  return d.mat3x3f(d.vec3f(1, 0, 0), d.vec3f(0, std.cos(r), std.sin(r)), d.vec3f(0, -std.sin(r), std.cos(r)));
};

const rotY = (r: number): d.m3x3f => {
  'use gpu';
  return d.mat3x3f(d.vec3f(std.cos(r), 0, -std.sin(r)), d.vec3f(0, 1, 0), d.vec3f(std.sin(r), 0, std.cos(r)));
};

const rotZ = (r: number): d.m3x3f => {
  'use gpu';
  return d.mat3x3f(d.vec3f(std.cos(r), std.sin(r), 0), d.vec3f(-std.sin(r), std.cos(r), 0), d.vec3f(0, 0, 1));
};

/** x: distance to the nearest hex edge, 0 at a cell centre and 0.5 on the edge. yz: the cell centre. */
const hexCell = (p: d.v2f): d.v3f => {
  'use gpu';
  const r = d.vec2f(1, 1.7320508);
  const h = r.mul(0.5);
  const a = p.sub(r.mul(std.floor(p.div(r)))).sub(h);
  const q = p.sub(h);
  const b = q.sub(r.mul(std.floor(q.div(r)))).sub(h);
  const g = std.select(b, a, std.dot(a, a) < std.dot(b, b));
  const e = std.max(std.dot(std.abs(g), d.vec2f(0.5, 0.8660254)), std.abs(g.x));
  return d.vec3f(e, p.sub(g));
};

/** A fullscreen triangle at the far plane. Procedural hashed star layers parallaxed by camY, over a tier-tinted nebula. */
const starsVertex = tgpu.vertexFn({ in: { i: d.builtin.vertexIndex }, out: { pos: d.builtin.position } })((v) => {
  'use gpu';
  return { pos: d.vec4f(d.f32((v.i << 1) & 2) * 2 - 1, d.f32(v.i & 2) * 2 - 1, 1, 1) };
});

const starsFragment = tgpu.fragmentFn({ in: { pos: d.builtin.position }, out: d.vec4f })((frag) => {
  'use gpu';
  const u = uniformLayout.$.u;
  const unit = u.res.y / 23;
  let col = std.mix(d.vec3f(0.03, 0.01, 0.07), d.vec3f(0.005, 0.008, 0.025), frag.pos.y / u.res.y);
  // Nebula: low-frequency noise, almost no parallax, tinted per tier.
  let np = d.vec2f(frag.pos.x, frag.pos.y - u.camY * unit * 0.03).div(unit * 11);
  let neb = d.f32(0);
  let amp = d.f32(0.6);
  for (let o = 0; o < NEBULA_OCTAVES; o++) {
    neb += amp * valueNoise(np);
    np = np.mul(2.3).add(d.vec2f(5.2, 1.7));
    amp *= 0.5;
  }
  col = col.add(u.tint.xyz.mul(std.smoothstep(0.28, 0.85, neb) * 1.6));
  for (let l = 0; l < 3; l++) {
    const fl = d.f32(l);
    const cell = unit * (1.1 + fl * 0.9);
    const f = d.vec2f(frag.pos.x, frag.pos.y - u.camY * unit * (0.06 + fl * 0.12)).div(cell).add(d.vec2f(fl * 17, fl * 31));
    const h = hash3(std.floor(f));
    // The nearest layer stretches along y with scroll speed (and the won-hold warp): speed lines.
    const stretch = std.select(d.f32(1), 1 + 0.15 * u.fx.x + 6 * u.fx.y, l === 2);
    const off = std.fract(f).sub(0.5).sub(h.xy.sub(0.5).mul(0.7));
    const dist = std.length(d.vec2f(off.x, off.y / stretch)) * cell;
    const r = unit * (0.05 + 0.05 * h.z + fl * 0.025);
    // The rate is a multiple of 0.05 rad/s (1 to 3.95), so the clock wrap at CLOCK_PERIOD lands on the same phase.
    const twinkle = 0.7 + 0.3 * std.sin(u.time * (1 + std.floor(h.x * 60) * 0.05) + 6.28 * h.y);
    const lit = (1 - std.smoothstep(0, r, dist)) * std.step(0.62, h.z) * twinkle / std.sqrt(stretch);
    col = col.add(std.mix(d.vec3f(0.55, 0.7, 1), d.vec3f(1, 0.7, 0.95), h.x).mul(lit * (0.45 + 0.3 * fl)));
  }
  return d.vec4f(col, 1);
});

const MeshVaryings = {
  pos: d.builtin.position, nrm: d.vec3f, col: d.vec3f, flash: d.f32, heat: d.f32, pulse: d.f32, lp: d.vec3f, mode: d.f32,
};

const meshVertex = tgpu.vertexFn({ in: { ...MeshVertex.propTypes, ...Instance.propTypes }, out: MeshVaryings })((v) => {
  'use gpu';
  const u = uniformLayout.$.u;
  const r = v.place.z;
  const mode = v.extra.y;
  let m = std.mul(rotZ(r), rotY(0.45 * std.sin(r * 0.7)));
  let p = d.vec3f(v.pos);
  let n = d.vec3f(v.nrm);
  let pulse = std.select(d.f32(0), v.extra.z, mode < 0.5);
  let lift = d.f32(0);
  if (mode > 0.5 && mode < 1.5) {
    m = rotZ(r);
    pulse = v.extra.z;
  } else if (mode > 1.5 && mode < 2.5) {
    m = std.mul(rotX(v.extra.w), rotZ(r));
  } else if (mode > 2.5) {
    const roll = rotY(v.extra.z);
    p = std.mul(roll, p);
    p = d.vec3f(p.x, p.y * (1 + v.extra.w), p.z);
    n = std.mul(roll, n);
    m = rotZ(r);
    lift = v.extra.x;
  }
  const world = std.mul(m, p).mul(v.place.w).add(d.vec3f(v.place.xy, lift));
  return {
    pos: std.mul(u.proj, std.mul(u.view, d.vec4f(world, 1))),
    nrm: std.mul(m, n),
    col: v.col.mul(v.color.xyz),
    flash: v.color.w,
    heat: std.select(v.extra.x, d.f32(0), mode > 2.5),
    pulse: pulse,
    lp: v.pos,
    mode: mode,
  };
});

const meshFragment = tgpu.fragmentFn({ in: MeshVaryings, out: d.vec4f })((frag) => {
  'use gpu';
  const u = uniformLayout.$.u;
  const n = std.normalize(frag.nrm);
  const lam = std.max(std.dot(n, KEY_LIGHT), 0);
  // Cool hemisphere ambient (violet from below, blue from above) and a rim light along the view direction, so shadow
  // sides keep their silhouette against the backdrop. Black stays black: the rim scales with the surface's own luminance.
  const ambient = std.mix(d.vec3f(0.22, 0.16, 0.3), d.vec3f(0.2, 0.28, 0.42), n.y * 0.5 + 0.5);
  const rimK = std.pow(1 - std.saturate(std.dot(n, TOWARD_CAMERA)), 3) * std.saturate(std.dot(frag.col, d.vec3f(0.3, 0.5, 0.2)) * 6);
  const rim = d.vec3f(0.35, 0.45, 0.8).mul(rimK);
  // Bodies (mode 0) heat toward orange as they near death. Bosses (mode 1) use heat to brighten their emissive accents instead.
  const scorch = d.vec3f(1, 0.3, 0.05).mul(std.select(d.f32(0), frag.heat, frag.mode < 0.5) * (0.5 + 0.4 * lam));
  const lit = frag.col.mul(ambient.add(0.7 * lam)).add(rim).add(scorch);
  const emissive = std.step(1.0001, std.max(frag.col.x, std.max(frag.col.y, frag.col.z)));
  const breathe = 1 + frag.pulse * std.sin(u.time * 6.5 + frag.lp.x * 3 + frag.lp.y * 2);
  const glow = frag.col.mul(0.7 * (1 + 0.6 * frag.heat) * breathe).add(d.vec3f(0.1, 0.28, 0.2).mul(frag.heat));
  // The accretion disc (mode 2) dims toward its outer edge instead of ending in a hard violet rim. It keeps a trace, so the edge never reads as a black plate against the halo.
  const discFade = std.mix(1, 0.16, std.smoothstep(0.5, 1, std.length(frag.lp.xy) / HOLE_OUTER));
  const edgeFade = std.select(d.f32(1), discFade, frag.mode > 1.5 && frag.mode < 2.5);
  return d.vec4f(std.mix(lit, glow, emissive).mul(edgeFade).add(d.vec3f(frag.flash)), 1);
});

const GlowVaryings = { pos: d.builtin.position, uv: d.vec2f, rgba: d.vec4f, shape: d.f32 };

/** Camera-facing quads in a triangle strip, lifted to z = extra.y. Additive, so the alpha output is 0. */
const glowVertex = tgpu.vertexFn({ in: { vi: d.builtin.vertexIndex, ...Instance.propTypes }, out: GlowVaryings })((v) => {
  'use gpu';
  const u = uniformLayout.$.u;
  const corner = d.vec2f(d.f32(v.vi & 1), d.f32((v.vi >>> 1) & 1)).mul(2).sub(1);
  const eye = std.mul(u.view, d.vec4f(v.place.xy, v.extra.y, 1)).add(d.vec4f(corner.mul(v.place.zw), 0, 0));
  return { pos: std.mul(u.proj, eye), uv: corner, rgba: v.color, shape: v.extra.x };
});

const glowFragment = tgpu.fragmentFn({ in: GlowVaryings, out: d.vec4f })((frag) => {
  'use gpu';
  const r = std.length(frag.uv);
  const edge = 1 - std.smoothstep(0.9, 1, r);
  let k = (std.exp(-r * r * 5) + 0.7 * std.exp(-r * r * 40)) * edge;
  let rgb = frag.rgba.xyz;
  if (frag.shape > 0.5 && frag.shape < 1.5) {
    k = std.exp(-std.pow((r - 0.82) * 10, 2)) * edge;
  } else if (frag.shape > 1.5 && frag.shape < 2.5) {
    rgb = frag.rgba.xyz.mul(1.3 * std.exp(-r * r * 3.5)).add(d.vec3f(std.exp(-r * r * 16)));
    k = edge;
  } else if (frag.shape > 2.5 && frag.shape < 3.5) {
    k = std.smoothstep(0.16, 0.36, r) * std.exp(-std.pow((r - 0.36) * 3, 2)) * edge;
  } else if (frag.shape > 3.5) {
    k = d.f32(1);
  }
  return d.vec4f(rgb.mul(frag.rgba.w * k), 0);
});

const BubbleVaryings = { pos: d.builtin.position, nrm: d.vec3f, lp: d.vec3f, tint: d.vec3f, bright: d.f32, ripple: d.vec3f };

const bubbleVertex = tgpu.vertexFn({ in: { ...MeshVertex.propTypes, ...Instance.propTypes }, out: BubbleVaryings })((v) => {
  'use gpu';
  const u = uniformLayout.$.u;
  const world = v.pos.mul(v.place.w).add(d.vec3f(v.place.xy, 0));
  return {
    pos: std.mul(u.proj, std.mul(u.view, d.vec4f(world, 1))),
    nrm: v.nrm,
    lp: v.pos,
    tint: v.color.xyz,
    bright: v.color.w,
    ripple: d.vec3f(v.extra.x, v.extra.z, v.extra.w),
  };
});

/** Near invisible facing the camera, bright at grazing angles, a slow hex shimmer, and a ripple from the impact point. */
const bubbleFragment = tgpu.fragmentFn({ in: BubbleVaryings, out: d.vec4f })((frag) => {
  'use gpu';
  const u = uniformLayout.$.u;
  const n = std.normalize(frag.nrm);
  const fres = std.pow(1 - std.saturate(std.dot(n, TOWARD_CAMERA)), 2.4);
  const c = std.cos(u.time * 0.25);
  const s = std.sin(u.time * 0.25);
  const rp = d.vec3f(frag.lp.x * c + frag.lp.z * s, frag.lp.y, -frag.lp.x * s + frag.lp.z * c);
  const cell = hexCell(rp.xy.mul(3.4));
  const edge = std.smoothstep(0.4, 0.5, cell.x);
  const shimmer = 0.5 + 0.5 * std.sin(u.time * 1.8 + hash21(cell.yz) * 6.2832);
  const sweep = 0.5 + 0.5 * std.sin(u.time * 1.1 - rp.y * 2.5 + rp.x * 1.3);
  const hex = edge * (0.2 + 0.8 * shimmer) * (0.25 + 0.75 * sweep) * (0.12 + 1.1 * fres);
  let ripple = d.f32(0);
  if (frag.ripple.x >= 0) {
    const dir = std.normalize(d.vec3f(frag.ripple.y, frag.ripple.z, 0.35));
    const ang = std.acos(std.clamp(std.dot(std.normalize(frag.lp), dir), -1, 1));
    ripple = std.exp(-std.pow((ang - frag.ripple.x * 4.5) * 3, 2)) * (1 - frag.ripple.x / RIPPLE_SECONDS);
  }
  const k = 0.04 + 1.25 * fres + 0.8 * hex + 2.6 * ripple;
  return d.vec4f(frag.tint.mul(k * frag.bright), 0);
});

/** Inputs are contravariant, so `never` admits every IO record. The renderer only resolves the pair. */
export interface ShaderPair {
  readonly vertex: TgpuVertexFn<never>;
  readonly fragment: TgpuFragmentFn<never>;
}

export const SHADERS = {
  stars: { vertex: starsVertex, fragment: starsFragment },
  mesh: { vertex: meshVertex, fragment: meshFragment },
  glow: { vertex: glowVertex, fragment: glowFragment },
  bubble: { vertex: bubbleVertex, fragment: bubbleFragment },
} satisfies Record<string, ShaderPair>;

/** WGSL for one pair: exactly one @vertex and one @fragment, so pipelines can leave entryPoint unset. */
export function shaderCode(pair: ShaderPair): string {
  return tgpu.resolve([pair.vertex, pair.fragment]);
}
