# Candidate 2: one simulation writer, narrow readers

## Usage (caller's view)

`PlayScreen.tsx` is the composition point. It owns the fixed-step clock and platform adapters, but no game rules. Touch-to-pixel execution crosses only `PlayScreen.tsx`, `game/sim.ts`, and `render/renderer.ts`.

```ts
const sim = createSimulation({ level: CAMPAIGN.levels[levelIndex], seed });
const input = createInputAccumulator();

const onDrag = (dx: number, viewportWidth: number) =>
  recordDrag(input, dx, viewportWidth);

function onAnimationFrame(nowMs: number) {
  const frameEvents: SimEvent[] = [];
  clock.consume(nowMs, () => {
    frameEvents.push(...stepSimulation(sim, sampleInput(input)).events);
  });
  renderer.draw(readSimulation(sim), frameEvents, clock.alpha);
  audio.dispatch(mapAudioEvents(frameEvents));
}
```

The flow reducer owns screen and overlay transitions. The screen controller executes returned effects, so navigation rules do not leak into React components.

```ts
const transition = reduceFlow(flow, { type: "choose-level", level: 12, seed }, CAMPAIGN);
setFlow(transition.state);
runEffects(transition.effects);
```

CI uses the same campaign and simulation entry points as the app.

```ts
const report = verifyCampaign(CAMPAIGN, () => createAutopilotBot(), VERIFY_SEEDS);
assertCampaignVerified(report);
```

Progress storage exposes domain values, not AsyncStorage strings. Lock state is derived from completed levels.

```ts
const save = await progressStore.load();
await progressStore.save(recordLevelResult(save, result));
const tiles = deriveLevelTiles(CAMPAIGN, save.progress);
```

## Problem

The game needs deterministic 60 Hz rules, hundreds of active entities, WebGPU rendering, runtime synthesis, and a headless proof that all 30 levels can finish. React Native and Hermes make per-frame object churn costly. The architecture must also prevent platform code from entering the simulation, prevent rendering or audio from becoming a second state writer, and keep all level-specific difficulty in one reviewable value.

## Module map

- `src/screens/PlayScreen.tsx` adapts touch events, advances the fixed clock, and sends simulation output to the renderer and audio engine.
- `src/game/sim.ts` owns all mutable run state, fixed-tick rules, input quantization, collision work, deterministic random state, and read-only views. Private functions stay in this file so the execution chain does not grow.
- `src/game/flow.ts` is the screen and gameplay-overlay reducer. It returns effects instead of calling React, storage, audio, or the simulation.
- `src/game/campaign.ts` exports the only 30-row campaign table and shared archetype definitions. Bosses are optional row data on levels 10, 20, and 30.
- `src/render/renderer.ts` owns GPU resources, instance staging buffers, visual-only particles, and the frame pass order. It scans the read view once and groups instances by mesh ID.
- `src/render/pipelines/{starfield,mesh,particle}.wgsl` contain the three pipelines. `mesh` draws flat-shaded vertex-color geometry and lasers, `particle` draws exhaust and event-driven explosions, and `starfield` draws the procedural background.
- `src/generated/meshes.ts` is checked in and exports typed arrays. `scripts/gen-meshes.ts` is its deterministic author and review path.
- `src/audio/{catalog,engine}.ts` hold patch and sequence data plus the only interpreter over `react-native-audio-api`.
- `src/storage/progress-store.ts` validates and migrates one AsyncStorage document at the boundary.
- `scripts/verify-levels.ts` runs the campaign rules and a deterministic bot in Node.

## Shape

`Simulation` is opaque. `stepSimulation` is its only writer and always advances one `FIXED_DT_MS` tick. It consumes a quantized input frame and returns typed events. `readSimulation` exposes numeric read views rather than the mutable typed arrays. This gives the renderer enough data for one linear scan without exposing spawn, collision, or score mutation. It also avoids one object per entity per frame, per foundational-thinking and boundary-discipline.

The internal entity store is struct-of-arrays. Hermes runs tight loops over `Float32Array`, `Uint16Array`, and `Uint8Array` without allocating temporary entity objects. A numeric slot and generation form a stable entity ID. Shared archetype data maps each kind to collision, score, mesh, and behavior policy. The campaign references those archetypes instead of copying their rules.

`CampaignSpec` contains exactly 30 rows, the boss cadence, and monotonicity rules. `defineCampaign` checks row order, positive values, weight sums, boss placement, and thresholds once. The app, renderer, audio tier selection, and verifier read the validated value. No switch statement may branch on a level number.

The renderer's public interface has `resize`, `draw`, and `dispose`. `draw` hides the mesh-ID scan, instance packing, buffer growth, pass encoding, queue submission, and required `present()` call. Simulation events are the only source of explosion particles. The renderer may use a separate visual random generator because its particles cannot affect simulation state.

The audio engine accepts commands only. The mapping table sends laser, hit, destruction, pickup, shield, completion, game-over, and UI events to named SFX sequences. A `start-run` flow effect selects the level row's music tier, `boss-entered` selects boss music, and completion, loss, or quit stops it. Patch data defines oscillator layers, envelopes, filters, pitch motion, and delay. Sequence data defines note timing. The engine owns audio-session setup and scheduling against `AudioContext.currentTime`; it never inspects a simulation view.

The flow reducer uses discriminated unions for every screen. Gameplay has a `running` or `paused` overlay phase, while the simulation has `launching`, `flying`, `boss`, `escaping`, `won`, or `lost`. Impossible combinations such as paused title screens or completed runs that still tick have no representation. The state reducer and simulation remain separate writers for separate state, per separate-before-serializing-shared-state.

The public interfaces are small relative to what they hide. Callers choose a level, submit one input frame per tick, read one view, and route one event list. They do not coordinate collision systems, GPU batches, synth nodes, migrations, or bot timing.

## Synthesis decision

Pending arena synthesis. This candidate chooses an opaque, in-place simulation over immutable state copies, struct-of-arrays over entity objects, and command-driven audio over a shared event bus. These choices keep allocation bounded and ownership visible. A synthesizer should retain the three-file touch-to-pixel path and the campaign value as the single source of level truth.

## Tradeoffs accepted

- We accept numeric arrays that are less convenient to inspect in exchange for low allocation and predictable scans on Hermes.
- We accept one substantial `sim.ts` file in exchange for a three-file input-to-pixel trace and one owner for tick ordering.
- We accept runtime validation in `defineCampaign` for cross-row rules that TypeScript cannot express clearly.
- We accept visual particle nondeterminism in exchange for keeping cosmetic work out of the replay contract.
- We accept rewriting the entire small save document in exchange for atomic versioning and simple migration.

## Alternatives considered

- An object list with polymorphic `update()` methods makes each entity easy to add, but exposes allocation, dispatch, lifecycle, and ordering rules to every entity class. The struct-of-arrays module hides those policies behind one step call.
- An immutable state returned on every tick makes purity obvious, but copies or persistently wraps hot arrays. It also asks callers to replace state correctly. The opaque owned simulation has a smaller interface and the same deterministic replay contract.
- A global event bus decouples imports, but hides ordering and ownership. Explicit returned events make audio, particles, tests, and replays consume the same ordered fact list.

## Open questions and risks

- Does `react-native-webgpu` on the target simulator sustain the proposed instance count without a fourth post-process pipeline, or should bloom remain out of the first release?
- Can one scripted bot complete every tuned level across the fixed verification seeds without receiving privileged future-spawn data?
- Should a failed save block the completion screen, or should the app retain a dirty in-memory document and retry on the next lifecycle event?

## Next implementation step

Implement `campaign.ts` and its Node validation tests first, then build the simulation against the validated 30-row value.
