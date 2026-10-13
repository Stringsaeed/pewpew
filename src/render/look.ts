import { ARCHETYPES, Kind } from '../levels';
import { PLAYER_RADIUS } from '../sim';
import type { MeshId } from './meshes.gen';

/** Kind to look. 'glow' kinds draw as additive billboards, not meshes. A mesh look picks meshes[variant % length]. */
export type Look =
  | { readonly draw: 'mesh'; readonly meshes: readonly [MeshId, ...MeshId[]]; readonly tint: readonly [number, number, number] }
  | {
    readonly draw: 'glow';
    readonly size: number;
    readonly rgba: readonly [number, number, number, number];
    /** Player shots are thin streaks along their travel; enemy shots are fat round orbs, so shape alone separates them. */
    readonly shape: 'streak' | 'orb';
  };

/**
 * Mesh kinds are drawn at the archetype hit radius: the batcher scales by ARCHETYPES[kind].radius / mesh.radius.
 * Bolt and enemy-bolt billboards are larger than their colliders (0.12 and 0.15).
 */
export const LOOK: { readonly [K in Kind]: Look } = {
  [Kind.Asteroid]:  { draw: 'mesh', meshes: ['asteroid0', 'asteroid1', 'asteroid2', 'asteroid3'], tint: [1, 1, 1] },
  [Kind.Fragment]:  { draw: 'mesh', meshes: ['fragment0', 'fragment1'], tint: [1, 1, 1] },
  [Kind.Mine]:      { draw: 'mesh', meshes: ['mine'], tint: [1, 1, 1] },
  [Kind.Drone]:     { draw: 'mesh', meshes: ['drone'], tint: [1, 1, 1] },
  [Kind.Well]:      { draw: 'mesh', meshes: ['well'], tint: [1, 1, 1] },
  [Kind.Crystal]:   { draw: 'mesh', meshes: ['crystal'], tint: [1, 1, 1] },
  [Kind.Shield]:    { draw: 'mesh', meshes: ['shield'], tint: [1, 1, 1] },
  [Kind.Rapid]:     { draw: 'mesh', meshes: ['rapid'], tint: [1, 1, 1] },
  [Kind.Bolt]:      { draw: 'glow', size: 0.35, rgba: [0.3, 1, 1, 1], shape: 'streak' },
  [Kind.EnemyBolt]: { draw: 'glow', size: 0.6, rgba: [1, 0.38, 0.15, 1], shape: 'orb' },
};

/** Rocket hit radius is PLAYER_RADIUS (0.35). The hull is drawn at 0.8, which is 0.8 / 0.35 of the collider. */
export const ROCKET_RADIUS = 0.8;
/** Boss hit radius is 1.4 in the sim. The body is drawn at 2.4, which is 2.4 / 1.4 of the collider. */
export const BOSS_RADIUS = 2.4;
/** The shield bubble's radius around the rocket (hull radius 0.8). */
export const BUBBLE_RADIUS = 1.3;
/** The black hole has no collider. This is the drawn radius of its accretion disc. */
export const BLACKHOLE_RADIUS = 2.6;
/** The disc is authored face-on; the shader tilts it about x by this much (radians). Negative puts the near half below the hole. */
export const BLACKHOLE_TILT = -0.7;

const bolt = LOOK[Kind.Bolt];
const enemyBolt = LOOK[Kind.EnemyBolt];
if (bolt.draw !== 'glow' || enemyBolt.draw !== 'glow') throw new Error('bolt looks are billboards');

/** Drawn radius / hit radius for the actors that are not scaled from a mesh. Boss hit radius is the sim's 1.4. */
export const VISUAL_OVER_HIT = {
  rocket: ROCKET_RADIUS / PLAYER_RADIUS,
  boss: BOSS_RADIUS / 1.4,
  bolt: bolt.size / ARCHETYPES[Kind.Bolt].radius,
  enemyBolt: enemyBolt.size / ARCHETYPES[Kind.EnemyBolt].radius,
} as const;

/**
 * Octaves of value noise in the backdrop nebula. This is the only per-pixel cost this pass adds to the fullscreen stars
 * shader: each octave is four hashes (a sin each) and a bilerp per pixel. Measured on the simulator at 2 octaves; drop to
 * 1 if a real phone's GPU time says so.
 */
export const NEBULA_OCTAVES = 2;

/** Nebula tint per tier (levels 1-10, 11-20, 21-30): violet, teal, crimson. */
export const TIER_TINT: readonly (readonly [number, number, number])[] = [
  [0x2a / 255, 0x14 / 255, 0x50 / 255],
  [0x0c / 255, 0x3a / 255, 0x44 / 255],
  [0x3e / 255, 0x0c / 255, 0x22 / 255],
];
