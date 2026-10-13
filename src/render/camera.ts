const FOV_Y = (50 * Math.PI) / 180;
const PITCH = (16 * Math.PI) / 180;
/** A point `dz` behind the plane of the bodies lands `dz * PITCH_TAN` lower on screen; raise it by that much to stay in line. */
export const PITCH_TAN = Math.tan(PITCH);
const LOOK_AHEAD = 6.5;
const VISIBLE_HALF_WIDTH = 5.4;
const NEAR = 1;
const FAR = 90;

/** Floats in the uniform block: view, proj, res, camY, time, nebula tint, fx. */
export const UNIFORM_FLOATS = 44;

/** Writes the view, projection, and clock into the preallocated uniform array. The caller fills tint and fx (floats 36 to 43). No allocation. */
export function writeCamera(uniforms: Float32Array, camY: number, width: number, height: number, time: number, zoom = 1, shakeX = 0, shakeY = 0): void {
  const aspect = width / height;
  const t = Math.tan(FOV_Y / 2);
  const dist = Math.max(VISIBLE_HALF_WIDTH / (t * aspect), 14) * zoom;
  const ty = camY + shakeY + LOOK_AHEAD;
  const ey = ty - dist * Math.sin(PITCH);
  const ez = dist * Math.cos(PITCH);
  // Eye and target share x = 0, so the basis is right = +x, forward = (0, fy, fz), up = (0, -fz, fy).
  const fy = (ty - ey) / dist;
  const fz = -ez / dist;
  const u = uniforms;
  u.fill(0, 0, 36);
  u[0] = 1;
  u[5] = -fz; u[6] = -fy;
  u[9] = fy; u[10] = -fz;
  u[12] = -shakeX; u[13] = -(-fz * ey + fy * ez); u[14] = fy * ey + fz * ez; u[15] = 1;
  const f = 1 / t;
  const nf = 1 / (NEAR - FAR);
  u[16] = f / aspect; u[21] = f; u[26] = FAR * nf; u[27] = -1; u[30] = NEAR * FAR * nf;
  u[32] = width; u[33] = height; u[34] = camY; u[35] = time;
}
