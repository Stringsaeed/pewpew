import { clamp } from './math';
import { DRAG_GAIN, PLAYER_MAX_VX, PLAYER_X_LIMIT, STEER_ACCEL, STEER_GAIN, STEP } from './rules';

/** One input per step. targetX is the world x the rocket steers toward. null means the finger is up, so the rocket coasts and wells pull it. */
export interface Input { readonly targetX: number | null }
export const COAST: Input = { targetX: null };
/** Relative drag. anchorX is the rocket x when the finger went down; dxFrac is finger dx / screen width. */
export function dragInput(anchorX: number, dxFrac: number): Input {
  return { targetX: clamp(anchorX + dxFrac * DRAG_GAIN, -PLAYER_X_LIMIT, PLAYER_X_LIMIT) };
}

/** The rocket's lateral velocity after one held-finger STEP, before well pull. Exported so a bot can plan with the real handling. */
export function steerVelocity(x: number, vx: number, targetX: number): number {
  const want = clamp((clamp(targetX, -PLAYER_X_LIMIT, PLAYER_X_LIMIT) - x) * STEER_GAIN, -PLAYER_MAX_VX, PLAYER_MAX_VX);
  return vx + clamp(want - vx, -STEER_ACCEL * STEP, STEER_ACCEL * STEP);
}
