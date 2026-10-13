import { ARCHETYPES, Kind } from '../levels';
import { PLAYER_RADIUS } from '../sim';
import type { MeshId } from './meshes.gen';

/** Kind to look. 'glow' kinds draw as additive billboards, not meshes. A mesh look picks meshes[variant % length]. */
export type Look =
  | { readonly draw: 'mesh'; readonly meshes: readonly [MeshId, ...MeshId[]]; readonly tint: readonly [number, number, number] }
  | { readonly draw: 'glow'; readonly size: number; readonly rgba: readonly [number, number, number, number] };

/**
 * Mesh kinds are drawn at the archetype hit radius: the batcher scales by ARCHETYPES[kind].radius / mesh.radius.
 * Bolt and enemy-bolt billboards are longer than their colliders (0.12 and 0.15).
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
  [Kind.Bolt]:      { draw: 'glow', size: 0.35, rgba: [0.3, 1, 1, 1] },
  [Kind.EnemyBolt]: { draw: 'glow', size: 0.4, rgba: [1, 0.3, 0.6, 1] },
};

/** Rocket hit radius is PLAYER_RADIUS (0.35). The hull is drawn at 0.8, which is 0.8 / 0.35 of the collider. */
export const ROCKET_RADIUS = 0.8;
/** Boss hit radius is 1.4 in the sim. The body is drawn at 2.4, which is 2.4 / 1.4 of the collider. */
export const BOSS_RADIUS = 2.4;
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
