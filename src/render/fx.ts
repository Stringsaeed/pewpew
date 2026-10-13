import { BOSSES, type BossId } from '../levels';

/** Renderer-owned animation state. Never reaches the sim; mutated in place so a frame allocates nothing. */
export const HOLD_NONE = 0;
export const HOLD_WON = 1;
export const HOLD_LOST = 2;
export type Hold = typeof HOLD_NONE | typeof HOLD_WON | typeof HOLD_LOST;

export interface Fx {
  reduceMotion: boolean;
  /** Boss hit flash seconds left, and the cooldown that stops re-triggers from flickering above 3 Hz. */
  flash: number;
  cooldown: number;
  hold: Hold;
  holdSeconds: number;
  /** Seconds of dt accumulated since hold() was called. */
  holdT: number;
  /** hold() has no world, so the burst at the ship waits for the next frame. */
  holdFresh: boolean;
  /** Seconds since the black hole opened. Large until the first wormholeOpen, so a hole already open reads as open. */
  holeAge: number;
  /** Fractional particles owed to the damaged boss's hull. */
  sparkDebt: number;
  smokeDebt: number;
}

export function createFx(): Fx {
  return { reduceMotion: false, flash: 0, cooldown: 0, hold: HOLD_NONE, holdSeconds: 1, holdT: 0, holdFresh: false, holeAge: 1e3, sparkDebt: 0, smokeDebt: 0 };
}

/** The hold choreography runs on dt, so a shell that slows dt stretches the hold with it. */
export const holdProgress = (fx: Fx): number => (fx.hold === HOLD_NONE ? 0 : Math.min(1, fx.holdT / fx.holdSeconds));

/** Fraction of a hold spent flying into the hole. The rest is the flash and the settle. */
export const DIVE_END = 0.8;
export const HOLE_OPEN_SECONDS = 0.9;

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Where the rocket is during the won hold. Filled in place. */
export interface Dive {
  x: number; y: number; z: number;
  /** Heading as the rotation that points +y along the travel direction. */
  heading: number;
  /** Fraction of full size. */
  size: number;
  roll: number;
  stretch: number;
  /** Unit vector the rocket points along. */
  hx: number; hy: number;
  visible: boolean;
}
export function createDive(): Dive {
  return { x: 0, y: 0, z: 0, heading: 0, size: 1, roll: 0, stretch: 0, hx: 0, hy: 1, visible: true };
}

/**
 * Falls from the last rocket position to the hole's centre: accelerating, shrinking to a speck, rolling faster and
 * stretching along the way, passing from in front of the disc to behind the event horizon.
 */
export function pose(out: Dive, p: number, fromX: number, fromY: number, holeX: number, holeY: number): void {
  const u = clamp01(p / DIVE_END);
  const e = u * u;
  const dx = holeX - fromX, dy = holeY - fromY;
  const len = Math.sqrt(dx * dx + dy * dy);
  out.hx = len > 0.05 ? dx / len : 0;
  out.hy = len > 0.05 ? dy / len : 1;
  out.heading = Math.atan2(-out.hx, out.hy);
  out.x = fromX + dx * e;
  out.y = fromY + dy * e;
  out.z = 3 * (1 - e) - 0.4 * e;
  out.size = 1 - 0.94 * e;
  out.roll = 38 * e * e;
  out.stretch = 1.8 * e;
  out.visible = u < 1;
}

/** Index into BOSSES[id].phases that `hp` has reached. The same rule the sim uses, read from the same table. */
export function bossPhaseIndex(id: BossId, hp: number): number {
  const spec = BOSSES[id];
  const health = hp / spec.hp;
  let idx = 0;
  for (let i = 0; i < spec.phases.length; i++) if (spec.phases[i].atHpFraction >= health) idx = i;
  return idx;
}

/** 0 at full health, 1 near death: steps up at each phase threshold and creeps up between them. */
export function bossHeat(id: BossId, hp: number): number {
  const spec = BOSSES[id];
  const steps = spec.phases.length - 1;
  const phase = steps > 0 ? bossPhaseIndex(id, hp) / steps : 0;
  return clamp01(phase * 0.75 + (1 - hp / spec.hp) * 0.25);
}
