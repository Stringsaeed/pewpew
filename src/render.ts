import { Kind } from './levels';
import type { MeshId } from './meshes.gen';
import type { SimEvent, WorldView } from './sim';

const NI = (): never => { throw new Error('not implemented'); };

/** Kind to look. 'glow' kinds draw as additive billboards, not meshes. A mesh look picks meshes[variant % length]. */
export type Look =
  | { readonly draw: 'mesh'; readonly meshes: readonly [MeshId, ...MeshId[]]; readonly tint: readonly [number, number, number] }
  | { readonly draw: 'glow'; readonly size: number; readonly rgba: readonly [number, number, number, number] };
export const LOOK: { readonly [K in Kind]: Look } = {
  [Kind.Asteroid]:  { draw: 'mesh', meshes: ['asteroid0', 'asteroid1', 'asteroid2', 'asteroid3'], tint: [1, 1, 1] },
  [Kind.Fragment]:  { draw: 'mesh', meshes: ['fragment0', 'fragment1'], tint: [1, 1, 1] },
  [Kind.Mine]:      { draw: 'mesh', meshes: ['mine'], tint: [1, 0.25, 0.35] },
  [Kind.Drone]:     { draw: 'mesh', meshes: ['drone'], tint: [1, 0.4, 1] },
  [Kind.Well]:      { draw: 'mesh', meshes: ['well'], tint: [0.55, 0.3, 1] },
  [Kind.Crystal]:   { draw: 'mesh', meshes: ['crystal'], tint: [0.3, 1, 0.9] },
  [Kind.Shield]:    { draw: 'mesh', meshes: ['shield'], tint: [0.3, 0.6, 1] },
  [Kind.Rapid]:     { draw: 'mesh', meshes: ['rapid'], tint: [1, 0.85, 0.2] },
  [Kind.Bolt]:      { draw: 'glow', size: 0.35, rgba: [0.3, 1, 1, 1] },
  [Kind.EnemyBolt]: { draw: 'glow', size: 0.4, rgba: [1, 0.3, 0.6, 1] },
};

/**
 * Reads WorldView, never writes it. Owns GPU objects and particles. Three pipelines, drawn in order into one pass
 * with a depth buffer:
 *  stars  fullscreen triangle, procedural hashed star layers parallaxed by a camera y uniform. No buffers.
 *  mesh   one shared vertex and index buffer holding every MeshData (interleaved pos|normal|color, 36 B), plus one
 *         instance buffer (x, y, rot, scale, tint rgb, flash = 8 f32). Per frame: counting-sort live bodies by MeshId,
 *         one writeBuffer, then drawIndexed(indexCount, n, firstIndex, baseVertex, firstInstance) per non-empty mesh.
 *         Rocket, boss, and wormhole are appended from the player, boss, and wormholeY scalars. Lambert plus emissive vertex color.
 *  glow   instanced quads, additive blend, no depth write: bolts, exhaust, explosion particles, shield bubble.
 * Particles live here (CPU SoA, 2048 cap) and spawn from SimEvents; the sim never knows they exist.
 */
export interface Renderer {
  /** world null = menu backdrop (stars only). alpha = leftover accumulator / STEP, for interpolation. */
  frame(world: WorldView | null, events: readonly SimEvent[], alpha: number, dtSec: number): void;
  dispose(): void;
}
/** Resizes the backing store from clientWidth × PixelRatio inside frame() and calls ctx.present() after submit. */
export function createRenderer(device: GPUDevice, ctx: GPUCanvasContext, format: GPUTextureFormat): Renderer { return NI(); }
