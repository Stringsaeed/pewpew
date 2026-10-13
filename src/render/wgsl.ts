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

export const MESH = UNIFORMS + /* wgsl */ `
struct VI {
  @location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) col: vec3f,
  @location(3) xyrs: vec4f, @location(4) tf: vec4f,
};
struct VO { @builtin(position) pos: vec4f, @location(0) nrm: vec3f, @location(1) col: vec3f, @location(2) flash: f32 };
@vertex fn vs(v: VI) -> VO {
  let r = v.xyrs.z;
  // One rot column drives two axes: spin about z plus a bounded wobble about y, so bodies tumble without rings going edge-on.
  let w = 0.45 * sin(r * 0.7);
  let rz = mat3x3f(vec3f(cos(r), sin(r), 0.0), vec3f(-sin(r), cos(r), 0.0), vec3f(0.0, 0.0, 1.0));
  let ry = mat3x3f(vec3f(cos(w), 0.0, -sin(w)), vec3f(0.0, 1.0, 0.0), vec3f(sin(w), 0.0, cos(w)));
  let m = rz * ry;
  var o: VO;
  o.pos = u.proj * u.view * vec4f(m * v.pos * v.xyrs.w + vec3f(v.xyrs.xy, 0.0), 1.0);
  o.nrm = m * v.nrm;
  o.col = v.col * v.tf.rgb;
  o.flash = v.tf.w;
  return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let lam = max(dot(normalize(i.nrm), normalize(vec3f(-0.45, 0.55, 0.7))), 0.0);
  let lit = i.col * (0.3 + 0.7 * lam);
  let emissive = step(1.0001, max(i.col.r, max(i.col.g, i.col.b)));
  return vec4f(mix(lit, i.col * 0.7, emissive) + vec3f(i.flash), 1.0);
}
`;

export const GLOW = UNIFORMS + /* wgsl */ `
struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) rgba: vec4f };
@vertex fn vs(@builtin(vertex_index) vi: u32, @location(0) p: vec4f, @location(1) rgba: vec4f) -> VO {
  let corner = vec2f(f32(vi & 1u), f32((vi >> 1u) & 1u)) * 2.0 - 1.0;
  var o: VO;
  o.pos = u.proj * (u.view * vec4f(p.xy, 0.4, 1.0) + vec4f(corner * p.zw, 0.0, 0.0));
  o.uv = corner;
  o.rgba = rgba;
  return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let d = length(i.uv);
  // Negative alpha selects the hollow ring falloff (the shield bubble) without another instance column.
  let ring = exp(-pow((d - 0.82) * 9.0, 2.0)) + 0.12 * (1.0 - d);
  let spot = exp(-d * d * 5.0) + 0.7 * exp(-d * d * 40.0);
  let k = select(spot, ring, i.rgba.a < 0.0) * (1.0 - smoothstep(0.9, 1.0, d));
  return vec4f(i.rgba.rgb * abs(i.rgba.a) * k, 0.0);
}
`;

