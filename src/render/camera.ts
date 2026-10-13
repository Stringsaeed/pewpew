const FOV_Y = (50 * Math.PI) / 180;
const PITCH = (16 * Math.PI) / 180;
const LOOK_AHEAD = 6.5;
const VISIBLE_HALF_WIDTH = 5.4;
const NEAR = 1;
const FAR = 90;

/** Writes the view and projection into the preallocated 36-float uniform array. No allocation. */
export function writeCamera(uniforms: Float32Array, camY: number, width: number, height: number, time: number): void {
  const aspect = width / height;
  const t = Math.tan(FOV_Y / 2);
  const dist = Math.max(VISIBLE_HALF_WIDTH / (t * aspect), 14);
  const ty = camY + LOOK_AHEAD;
  const ey = ty - dist * Math.sin(PITCH);
  const ez = dist * Math.cos(PITCH);
  // Eye and target share x = 0, so the basis is right = +x, forward = (0, fy, fz), up = (0, -fz, fy).
  const fy = (ty - ey) / dist;
  const fz = -ez / dist;
  const u = uniforms;
  u.fill(0);
  u[0] = 1;
  u[5] = -fz; u[6] = -fy;
  u[9] = fy; u[10] = -fz;
  u[13] = -(-fz * ey + fy * ez); u[14] = fy * ey + fz * ez; u[15] = 1;
  const f = 1 / t;
  const nf = 1 / (NEAR - FAR);
  u[16] = f / aspect; u[21] = f; u[26] = FAR * nf; u[27] = -1; u[30] = NEAR * FAR * nf;
  u[32] = width; u[33] = height; u[34] = camY; u[35] = time;
}
