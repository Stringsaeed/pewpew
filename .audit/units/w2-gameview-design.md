# W2-gameview: game-view art pass (renderer, WGSL, mesh generator)

Worktree: /Users/saeed/.t3/projects/pewpew-render, branch `w2-gameview` from `game` after wave 1 (the renderer is now `src/render/` with a fake-GPU snapshot test).
Device: iPhone 17 Pro simulator udid 481B49F7-2989-405B-809C-DA3178DB220D, Metro port 8082 from this worktree. Bundle id com.saeed.pewpew. Argent MCP rules: read ~/.claude/skills/argent-device-interact/SKILL.md first, describe before every tap, never tap from screenshot coordinates, stop the simulator server for this udid only when done.

Read first: .audit/design-audit.md section A and the art direction, .audit/baseline/screens/play-*.png (before pictures), src/render/*, scripts/gen-meshes.ts, src/levels.ts (ARCHETYPES, BOSSES, tierOf), docs/architecture.md. The sim is read-only to you: you get a readonly WorldView and an event list, nothing else. Determinism is untouched by anything in this task.

## Owner feedback that overrides the audit where they differ

1. **Black hole exit, not a wormhole.** Today the level exit is two flat rings (`wormhole()` in gen-meshes) with a violet glow, and the run ends the frame the ship reaches it. Replace it with a black hole: a dark disc (true black core, the stars behind it must vanish) with a bright thin photon ring, an accretion disc tilted toward the camera built from a lathe or ring mesh with emissive vertex colors running hot white at the inner edge to deep orange and violet at the outer edge, slowly rotating, plus a glow halo. Build the mesh in gen-meshes as `blackhole` and retire `wormhole` (keep the MeshId exhaustive). Cheap lensing is welcome if it stays inside the existing pipelines, for example a second glow quad with negative alpha used as a dark occluder drawn before the ring; do not add a post-process pass. The ship must visibly fly into it: during the victory hold (the shell keeps the world alive for about 1.4 s after `won`, see "contract" below) the renderer animates the rocket from its last position to the hole's center, shrinking, spinning up, and stretching along the travel direction, with the exhaust trail following, then a white flash. The `wormholeOpen` event becomes the moment the hole fades in with a shockwave ring; keep that event name, it is sim API.

2. **Bosses look poor.** The Warden, Hive, and Core are pale slabs under one light. Redesign all three in gen-meshes with the goal that each reads as a distinct silhouette at the boss radius and as a threat: darker base armor with high-contrast emissive accents in the boss magenta, visible weapon points where their bolts actually originate (match the firing offsets in the sim: read `bossAttack` in src/sim/boss.ts for the bolt spawn positions), layered depth (plating, vents, a glowing core or eye), and some asymmetry. Warden: a heavy gunship, twin cannons, a central eye that glows brighter per phase. Hive: an organic honeycomb cluster with pulsing cells and a heart. Core: a caged sphere with orbiting barbs and a reactor eye. Use the existing primitives (extrude, prism, ring, icosphere, spikes, lathe, transform, merge) and add new ones only if a shape needs it. Per-phase damage: the renderer reads `boss.hp / BOSSES[id].hp` and brightens the emissive accent and emits sparks and smoke particles from the hull below each phase threshold.

3. **Shield feels off.** Today it is a flat hollow glow ring. Make it a volumetric bubble: a transparent icosphere shell mesh (new `bubble` mesh) with fresnel rim in the mesh shader (bright at grazing angles, near-invisible facing the camera), a slow hex or noise shimmer in WGSL, and a ripple pulse on `shieldBlock` at the impact point. If the mesh pipeline cannot blend, add alpha blending to that pipeline for a tagged instance or draw the bubble in the glow pipeline with a sphere-mapped falloff. It must read as a sphere around the ship, not a ring on the screen.

## Audit items in this task (section A of .audit/design-audit.md), in order after the three above

A2 color contract on threats (drone and mine recolor to threat orange, fat round orange enemy bolts vs thin cyan player bolts, mine core pulse), A4 screen shake with a trauma value in the camera (shake off when reduce motion is set), A5 muzzle flash and enemy-fire tell, A6 pickup halos and spin, A7 hemisphere ambient plus rim light in the mesh shader and a lifted rock palette, A8 body hit flash and damage tint using `bodies.hp`, A9 shockwave rings via a grow flag on particles, A10 per-tier nebula and speed lines behind a constant with GPU cost noted, A12 nozzle glow. A1 (boss flash decay) and the pixel ratio cap already landed in wave 0; keep them.

## Contract with the shell (wave 2 runs in parallel with the App.tsx extraction, so do not edit App.tsx)

Add to the `Renderer` interface, implemented here, wired by wave 3:
- `setReduceMotion(on: boolean): void` (shake off, flashes at half strength, no slow motion).
- `hold(kind: 'won' | 'lost', seconds: number): void` called once by the shell when the sim emits `won` or `lost`; the shell keeps calling `frame` with the same terminal world for that long and passes a `dt` it has already scaled for slow motion. During a `won` hold the renderer runs the black hole dive; during a `lost` hold it runs the ship explosion (big burst plus red ring, the ship mesh hidden). Until wave 3 wires it, nothing calls `hold`, so the existing immediate screen switch keeps working.

## Rules

- No sim changes. No new dependencies. No post-process pass. Every item lives in src/render/, src/testing/, scripts/gen-meshes.ts, and docs/architecture.md.
- Rerun `npm run gen:meshes` after mesh changes and commit the generated file; `npm run gen:meshes -- --check` must pass.
- The render snapshot test will change because visuals change: update it deliberately per commit (`--update` or by regenerating) and say so in each commit message. The call-shape assertions (one drawIndexed per non-empty mesh group, no buffer creation after frame 1, dispose frees everything) must still pass.
- Gates after every commit: `npm run check`.
- After each visual item, reload on the device, capture the relevant moment to `.audit/w2-gameview/<item>.png` (scale 1.0, includeImageInContext false), view it with the Read tool, and judge it against the art direction before the next item. Use AUTO and UNLOCK ALL (Settings) to reach levels 1, 10, 20, 30. For the black hole dive and the boss death, record a short clip with screen-recording-start/stop to `.audit/w2-gameview/` as well.
- Measure: read the `[pewpew] tick` log windows before and after A10 on level 30 and report tick avg and p95; if p95 rises above 9 ms on the simulator, reduce A10 to one octave.

Report: commits, `npm run check` tail, screenshot and clip list, tick numbers before and after, and anything skipped with the reason.
