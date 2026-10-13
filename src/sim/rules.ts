export const TICKS_PER_SEC = 60;
export const STEP = 1 / 60;
export const TRACK_HALF_WIDTH = 4.5;
export const MAX_BODIES = 512;

export const PLAYER_RADIUS = 0.35;
export const PLAYER_X_LIMIT = TRACK_HALF_WIDTH - 0.5;
export const PLAYER_MAX_VX = 9;
export const STEER_GAIN = 10;
export const STEER_ACCEL = 60;
export const COAST_DAMPING = 0.9;
// A full-width finger drag crosses the track with a little to spare.
export const DRAG_GAIN = 2 * TRACK_HALF_WIDTH * 1.25;

export const FIRE_TICKS = 12;
export const RAPID_TICKS = 360;
export const HIT_INVULN_TICKS = 90;
export const SHIELD_INVULN_TICKS = 30;
export const PICKUP_SLACK = 0.25;
export const BOLT_SPEED = 28;
export const ENEMY_BOLT_SPEED = 8;
export const DEAD = -1;

export const SPAWN_AHEAD = 24;
export const DESPAWN_BEHIND = 6;
export const BOLT_RANGE = 26;

export const TRACK_START = 20;
export const TRACK_END_CLEAR = 12;
export const ROW_DY = 5;
export const ROW_GAP = 1.6;
export const DRONE_ANCHOR_LIMIT = TRACK_HALF_WIDTH - 2.3;

export const BOSS_DIST = 12;
export const BOSS_R = 1.4;
export const BOSS_SWEEP = 3.2;
export const BOSS_GRACE_TICKS = 90;
export const BOSS_SCORE_PER_HP = 10;
// Neighbouring aimed bolts land about 2 units apart at the rocket's row, wide enough to thread by finger.
export const AIM_SPREAD = 0.2;
export const WELL_REACH_Y = 5;
