export const PI = 3.141592653589793;
export const TWO_PI = 2 * PI;
const HALF_PI = PI / 2;

export function clamp(v: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, v)); }

export interface Rng { rng: number }
/** mulberry32. Math.imul and 32-bit integer ops are exact on every engine. */
export function rand(s: Rng): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Range-reduced odd polynomial, bit-identical across engines. Error under 1e-7 on the reduced range. */
export function sinT(x: number): number {
  let r = x - Math.floor(x / TWO_PI + 0.5) * TWO_PI;
  if (r > HALF_PI) r = PI - r;
  else if (r < -HALF_PI) r = -PI - r;
  const r2 = r * r;
  return r * (1 + r2 * (-1 / 6 + r2 * (1 / 120 + r2 * (-1 / 5040 + r2 * (1 / 362880 + r2 * (-1 / 39916800))))));
}
export function cosT(x: number): number { return sinT(x + HALF_PI); }
