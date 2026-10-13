import { MESHES } from './meshes.gen';

/** Outer radius of the accretion disc in mesh units, as a WGSL float literal. */
const HOLE_OUTER = MESHES.accretion.radius.toFixed(4);

export const UNIFORMS = /* wgsl */ `
struct U { view: mat4x4f, proj: mat4x4f, res: vec2f, camY: f32, time: f32 };
@group(0) @binding(0) var<uniform> u: U;
`;

export const STARS = UNIFORMS + /* wgsl */ `
struct VO { @builtin(position) pos: vec4f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VO {
  var o: VO;
  o.pos = vec4f(f32((i << 1u) & 2u) * 2.0 - 1.0, f32(i & 2u) * 2.0 - 1.0, 1.0, 1.0);
  return o;
}
fn hash3(p: vec2f) -> vec3f {
  var q = fract(vec3f(p.x, p.y, p.x) * vec3f(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yxz + 33.33);
  return fract((q.xxy + q.yzz) * q.zyx);
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let unit = u.res.y / 23.0;
  var col = mix(vec3f(0.03, 0.01, 0.07), vec3f(0.005, 0.008, 0.025), i.pos.y / u.res.y);
  for (var l = 0; l < 3; l++) {
    let fl = f32(l);
    let cell = unit * (1.1 + fl * 0.9);
    let f = vec2f(i.pos.x, i.pos.y - u.camY * unit * (0.06 + fl * 0.12)) / cell + vec2f(fl * 17.0, fl * 31.0);
    let h = hash3(floor(f));
    let d = length(fract(f) - 0.5 - (h.xy - 0.5) * 0.7) * cell;
    let r = unit * (0.05 + 0.05 * h.z + fl * 0.025);
    let twinkle = 0.7 + 0.3 * sin(u.time * (1.0 + 3.0 * h.x) + 6.28 * h.y);
    let lit = (1.0 - smoothstep(0.0, r, d)) * step(0.62, h.z) * twinkle;
    col += mix(vec3f(0.55, 0.7, 1.0), vec3f(1.0, 0.7, 0.95), h.x) * lit * (0.45 + 0.3 * fl);
  }
  return vec4f(col, 1.0);
}
`;

/**
 * Mesh and glow instances are 12 floats: (x, y, rot, scale), (r, g, b, flash or alpha), then three per-draw extras.
 * Mesh extras are (heat, mode, a, b):
 *  mode 0  tumble: spin about z with a bounded wobble about y. Bodies.
 *  mode 1  flat: spin about z only. Bosses and the event horizon. a = emissive pulse amplitude.
 *  mode 2  disc: spin about its own axis, then tilt about x by b. The accretion disc.
 *  mode 3  dive: roll about the long axis by a, stretch it by b, point it along rot, lift it toward the camera by heat. The rocket falling into the hole.
 * Glow extras are (shape, z, 0, 0).
 */
export const MESH = UNIFORMS + /* wgsl */ `
struct VI {
  @location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) col: vec3f,
  @location(3) xyrs: vec4f, @location(4) tf: vec4f, @location(5) ex: vec4f,
};
struct VO {
  @builtin(position) pos: vec4f, @location(0) nrm: vec3f, @location(1) col: vec3f, @location(2) flash: f32,
  @location(3) heat: f32, @location(4) pulse: f32, @location(5) lp: vec3f, @location(6) mode: f32,
};
fn rotZ(r: f32) -> mat3x3f { return mat3x3f(vec3f(cos(r), sin(r), 0.0), vec3f(-sin(r), cos(r), 0.0), vec3f(0.0, 0.0, 1.0)); }
fn rotX(r: f32) -> mat3x3f { return mat3x3f(vec3f(1.0, 0.0, 0.0), vec3f(0.0, cos(r), sin(r)), vec3f(0.0, -sin(r), cos(r))); }
fn rotY(r: f32) -> mat3x3f { return mat3x3f(vec3f(cos(r), 0.0, -sin(r)), vec3f(0.0, 1.0, 0.0), vec3f(sin(r), 0.0, cos(r))); }
@vertex fn vs(v: VI) -> VO {
  let r = v.xyrs.z;
  let mode = v.ex.y;
  var m = rotZ(r) * rotY(0.45 * sin(r * 0.7));
  var p = v.pos;
  var pulse = 0.0;
  var lift = 0.0;
  if (mode > 0.5 && mode < 1.5) { m = rotZ(r); pulse = v.ex.z; }
  else if (mode > 1.5 && mode < 2.5) { m = rotX(v.ex.w) * rotZ(r); }
  else if (mode > 2.5) { p = rotY(v.ex.z) * p; p.y *= 1.0 + v.ex.w; m = rotZ(r); lift = v.ex.x; }
  var n = v.nrm;
  if (mode > 2.5) { n = rotY(v.ex.z) * n; }
  var o: VO;
  o.pos = u.proj * u.view * vec4f(m * p * v.xyrs.w + vec3f(v.xyrs.xy, lift), 1.0);
  o.nrm = m * n;
  o.col = v.col * v.tf.rgb;
  o.flash = v.tf.w;
  o.heat = select(v.ex.x, 0.0, mode > 2.5);
  o.pulse = pulse;
  o.lp = v.pos;
  o.mode = mode;
  return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let lam = max(dot(normalize(i.nrm), normalize(vec3f(-0.45, 0.55, 0.7))), 0.0);
  let lit = i.col * (0.3 + 0.7 * lam);
  let emissive = step(1.0001, max(i.col.r, max(i.col.g, i.col.b)));
  let glow = i.col * (0.7 * (1.0 + 0.6 * i.heat) * (1.0 + i.pulse * sin(u.time * 6.5 + i.lp.x * 3.0 + i.lp.y * 2.0))) + i.heat * vec3f(0.1, 0.28, 0.2);
  // The accretion disc (mode 2) dims toward its outer edge instead of ending in a hard violet rim. It keeps a trace, so the edge never reads as a black plate against the halo.
  let rim = select(1.0, mix(1.0, 0.16, smoothstep(0.5, 1.0, length(i.lp.xy) / ${HOLE_OUTER})), i.mode > 1.5 && i.mode < 2.5);
  return vec4f(mix(lit, glow, emissive) * rim + vec3f(i.flash), 1.0);
}
`;

export const GLOW = UNIFORMS + /* wgsl */ `
struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) rgba: vec4f, @location(2) shape: f32 };
@vertex fn vs(@builtin(vertex_index) vi: u32, @location(0) p: vec4f, @location(1) rgba: vec4f, @location(2) ex: vec4f) -> VO {
  let corner = vec2f(f32(vi & 1u), f32((vi >> 1u) & 1u)) * 2.0 - 1.0;
  var o: VO;
  o.pos = u.proj * (u.view * vec4f(p.xy, ex.y, 1.0) + vec4f(corner * p.zw, 0.0, 0.0));
  o.uv = corner;
  o.rgba = rgba;
  o.shape = ex.x;
  return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let d = length(i.uv);
  let edge = 1.0 - smoothstep(0.9, 1.0, d);
  var k = (exp(-d * d * 5.0) + 0.7 * exp(-d * d * 40.0)) * edge;
  var rgb = i.rgba.rgb;
  if (i.shape > 0.5 && i.shape < 1.5) {
    k = exp(-pow((d - 0.82) * 10.0, 2.0)) * edge;
  } else if (i.shape > 1.5 && i.shape < 2.5) {
    rgb = i.rgba.rgb * exp(-d * d * 6.0) + vec3f(1.0) * exp(-d * d * 26.0);
    k = edge;
  } else if (i.shape > 2.5 && i.shape < 3.5) {
    k = smoothstep(0.16, 0.36, d) * exp(-pow((d - 0.36) * 3.0, 2.0)) * edge;
  } else if (i.shape > 3.5) {
    k = 1.0;
  }
  return vec4f(rgb * i.rgba.a * k, 0.0);
}
`;
