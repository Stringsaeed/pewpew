import type { DronePattern } from '../levels';
import { clamp, cosT, rand, sinT } from './math';
import { PLAYER_X_LIMIT, STEP } from './rules';
import type { Bodies, World } from './world';

/** A random start inside one fire period, so `droneFireRate` is the true expected rate from the first frame. */
export function droneClock(w: World): number {
  const rate = w.spec.droneFireRate;
  return rate > 0 ? rand(w) / rate : rand(w) * 4;
}

/** x-driven patterns also write vx, so a reader of WorldView sees the true lateral velocity. */
export const DRONE_MOVES: { readonly [P in DronePattern]: (w: World, i: number) => void } = {
  sine: (w, i) => { const b = w.bodies; driveX(b, i, b.param[i] + 1.6 * sinT(2.4 * b.t[i])); b.vy[i] = -1.2; },
  zigzag: (w, i) => {
    const b = w.bodies;
    const ph = 0.5 * b.t[i], f = ph - Math.floor(ph);
    driveX(b, i, b.param[i] + 1.8 * (f < 0.5 ? 4 * f - 1 : 3 - 4 * f));
    b.vy[i] = -1.2;
  },
  dive: (w, i) => {
    const b = w.bodies, p = w.player;
    if (b.y[i] - p.y < 8) { b.vy[i] = -7; b.vx[i] = clamp((p.x - b.x[i]) * 1.2, -2, 2); }
    else { b.vy[i] = -1; b.vx[i] = 0; }
    b.x[i] += b.vx[i] * STEP;
  },
  orbit: (w, i) => {
    const b = w.bodies;
    driveX(b, i, b.param[i] + 1.5 * sinT(2 * b.t[i]));
    b.vy[i] = -1 + 3 * cosT(2 * b.t[i]);
  },
};
function driveX(b: Bodies, i: number, x: number): void {
  const nx = clamp(x, -PLAYER_X_LIMIT, PLAYER_X_LIMIT);
  b.vx[i] = (nx - b.x[i]) / STEP;
  b.x[i] = nx;
}
