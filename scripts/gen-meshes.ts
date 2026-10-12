/*
 * `npm run gen:meshes` rewrites src/meshes.gen.ts. The RNG is seeded, so a rerun with unchanged code is byte-identical.
 *
 *   const BUILDERS = { rocket: (rng) => lathe(ROCKET_PROFILE, 12, PALETTE.hull), asteroid0: (rng) => icosphere(2, 0.25, rng), ... }
 *     satisfies Record<string, (rng: () => number) => RawMesh>; the MeshId union is emitted from Object.keys(BUILDERS).
 *   primitives: lathe(profile, segments, color), icosphere(subdiv, noise, rng), prism, spikes; flatten(raw) gives MeshData.
 */
import type { MeshData, MeshId } from '../src/meshes.gen';

const NI = (): never => { throw new Error('not implemented'); };

NI();
