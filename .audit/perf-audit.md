# pewpew performance audit (branch `game`, read-only)

Scope: App.tsx tick, src/sim.ts step, src/render.ts frame, src/audio.ts, src/ui/Hud.tsx. All numbers are from Node 26 (V8 JIT),
because Hermes was not available to me. Hermes is an interpreter, so tight numeric JS runs roughly 10-30x slower than these
figures (an estimate, not a measurement). JSI calls do not scale that way. They are counted, not timed.
Scratch scripts and raw output are in /tmp/pewpew-perf-audit/ (bench.ts, render-bench.ts with a mocked GPUDevice, audio-bench.ts
with a counting AudioContext fake, prof-step.ts and top.mjs for --cpu-prof, cold.ts).

## Measurements (MEASURED, V8)

| level | steps | simulate µs/step | step only (replay) µs/step | bot µs/step | bodies avg/max | events/step (max) | new Hud objs/s |
|---|---|---|---|---|---|---|---|
| 1  | 2701 | 15.2 | 0.47 | 14.7 | 8.6 / 12 | 0.098 (2) | 2.73 |
| 10 | 4428 | 15.0 | 0.55 | 14.5 | 11.5 / 20 | 0.123 (2) | 2.68 |
| 20 | 6683 | 15.5 | 0.71 | 14.8 | 13.9 / 26 | 0.166 (2) | 3.04 |
| 30 | 7008 | 16.3 | 0.89 | 15.4 | 18.1 / 30 | 0.168 (3) | 2.95 |

- Throughput: `simulate(30, greedyBot)` runs about 61k steps/s, `replay(30)` about 1.13M steps/s. Level 1 runs 66k and 2.1M, level 10 runs 67k and 1.8M.
  `greedyBot` is about 95% of `simulate`. The sim itself costs under 1 µs per step.
- Bodies peak at 30 out of `MAX_BODIES` 512. So O(bolts x bodies) collision is about 5 x 30 checks, not the 10k the architecture doc budgets for.
- CPU profile, step only (`replay` x60 over all 30 levels, self time with the setup bot excluded): `collide` about 52%, `moveBodies` about 18%,
  `despawn` about 7%, `step` about 5%, `wellPull` about 4%, `remove` about 2%, `sinT` under 1%. GC was 0.3%.
  CPU profile, `simulate`: `clamp` 41%, the bot body 35%, `steerVelocity` 17% (the bot's 9 lanes x 61 points x 3 sub-steps), `collide` 2.6%.
- Renderer with a mocked device, level 30 at 60 Hz: `frame()` JS takes 4.6 µs per frame, and 3.3 µs at 120 Hz. Per frame it makes 3 `writeBuffer` calls
  (uniforms 144 B, mesh instances, glow instances; 2.0-2.8 KB in total), 1 `setBindGroup`, 3 `setPipeline`, 2 `draw` plus 4.8-6.2 `drawIndexed` on average,
  and 10.6-13.4 `setVertexBuffer`. It makes exactly 1 `beginRenderPass`, 1 `submit`, and 1 `present`. The texture is created once and the context configured once. Peak glow instances were 268.
- Audio with a counting fake, where every create, connect, start, stop, param automation, and AudioParam getter counts as 1 JSI call. Music creates 31 (tier1), 47 (tier2),
  35 (tier3), and 53 (boss) nodes/s, with 229-384 JSI calls/s. Each SFX event: fire 4 nodes / 31 calls, hit 4 / 32, destroy 6 / 45, pickup 6 / 42, playerHit 6 / 45.
- Cold path: `createWorld` takes 0.02-0.06 ms warm and 0.42 ms on the first call. `songColumns` takes 0.05-0.09 ms. `hudOf` takes 5-12 ns.

## Hot path findings (per frame / per step), ranked

### H1. Every App re-render resets the drag input to COAST (correctness bug found while auditing perf). REASONED, identity part MEASURED
- App.tsx:88 `const run = runOf(screen)`. src/flow.ts:28 returns a new object on every call. App.tsx:105 lists `run` in the deps of the
  effect at App.tsx:93-105, so that effect re-runs after every App render, and it executes `loop.input = COAST` (App.tsx:95).
- App re-renders whenever the HUD changes, which is about 3 times/s (measured above: score, progress, lives, chips).
- Effect: while a finger is held still, the rocket switches to coasting (vx x 0.9 per step) and wells get full authority until the next
  `onResponderMove`. It also re-runs the effect body about 3 times/s (cheap).
- Fix, one line: `const run = useMemo(() => runOf(screen), [screen]);`. Another option is to drop `run` from the deps, since `key` already captures it.

### H2. Rendering at full device pixel ratio (3x) and at 120 Hz. REASONED (largest GPU and energy lever, unmeasured)
- App.tsx:181-183 and render.ts:313-315 size the canvas to `clientWidth * PixelRatio.get()`. On the iPhone 17 Pro that is 1206x2622,
  or 3.16 Mpx. ios/PewPew/Info.plist sets `CADisableMinimumFrameDurationOnPhone` to true, so rAF and therefore `renderer.frame` run at
  120 Hz while the sim runs at 60. Every rendered frame fills every pixel twice or more: the stars pass is a fullscreen triangle with `depthCompare: 'always'`
  and 3 layers of hash3 + length + smoothstep + sin (render.ts:58-73, about 130 ALU ops per pixel), then mesh, then additive glow.
  A boss kill spawns 220 quads of about 110 px, roughly 0.9 of a screen of extra blending.
- Rough cost: about 0.4 G ALU ops per frame for stars alone, about 49 G ops/s at 120 Hz. That is a few percent of an A18-class GPU's peak, so it fits, but it is
  the dominant energy and thermal cost. The depth24plus texture is 12.6 MB at 3x.
- Why it can reach the JS thread: react-native-webgpu runs `getCurrentTexture()` (nextDrawable) and `present()` synchronously on the
  JS thread. `presentFrame()` also calls `WaitForCommandsToBeScheduled` (node_modules/react-native-webgpu/cpp/rnwgpu/SurfaceRegistry.h:133-150).
  If the GPU falls behind, the JS thread blocks there, which delays touch handling and the 25 ms audio pump.
- Fix, about 2 lines: cap the ratio, `const ratio = Math.min(PixelRatio.get(), 2)` at App.tsx:181 and render.ts:313. Better, export one
  `MAX_RENDER_RATIO = 2` from render.ts and use it in both places, because the two must agree or `resize()` reconfigures on frame 1. That gives 804x1748 =
  1.41 Mpx (-55% fragments, bandwidth, and depth memory). Flat-shaded meshes and soft glows look nearly the same at 2x on a 460 ppi panel.
  Optional: if thermals show up, render every other rAF at 120 Hz (skip `frameFn` when `now - lastDraw < 12`). Interpolation already
  makes 60 Hz smooth, which halves all render-side JS, JSI, and GPU work. Measure first with Metal HUD (`MTL_HUD_ENABLED=1`) or
  argent-native-profiler on a physical phone.

### H3. HUD state lives in the App root: a per-frame dispatch, and an App-wide re-render on each change. Rate MEASURED, cost REASONED
- App.tsx:170 calls `setHud((h) => hudOf(world, h))` every frame (120/s), including while paused or on Complete. Each call allocates a closure
  plus a React update object, and runs the eager-state check. `hudOf` bails out correctly (sim.ts:199-200; measured 2.7-3.0 new objects/s, 5-12 ns per call).
- Each real change re-renders all of `App`: about 15 new closures, `<Canvas>` (whose `useImperativeHandle` has no deps, so the ref detaches and
  reattaches each commit, and whose `style={{ flex: 1 }}` is a new object), the responder `View`, and `Hud`. `Hud` calls `padStart`, does 4 template strings,
  calls `Array.from(lives)`, and builds inline style objects. Then comes a Fabric commit to the UI thread. My estimate is 0.3-1 ms of JS per change in Hermes release, at about 3 per second,
  and it is what triggers H1.
- Smallest fix (removes the per-frame dispatch): keep the last Hud in the loop and only call setHud on change:
  `const next = hudOf(world, loop.hud); if (next !== loop.hud) { loop.hud = next; setHud(next); }` (add `hud: Hud | null` to `Loop`, and reset it
  where `setHud(null)` runs at App.tsx:103).
- Scope fix (removes the App-wide re-render): move `hud` state into a small `HudHost` child that registers its setter in `loop`, so only
  the HUD subtree renders. That is about 15 lines. Do it if H1 is fixed via deps and profiling still shows commits.

### H4. The only device timing measures the dev bot, not the game. MEASURED ratio
- .audit/u7-report.md reports 3 ms per frame. That was taken in AUTO mode (App.tsx:160 runs `greedyBot` before every step) in a dev build on the simulator,
  and the timer only runs under `__DEV__` (App.tsx:190). In V8 the bot costs 14.5-15.4 µs per step, against 0.5-0.9 µs for `step` and 4.6 µs for `frame()`.
  So in AUTO the bot is about 70-75% of JS work. The human path is probably far below 3 ms, but nobody has measured it.
- Fix: before any optimization, time a release build with AUTO off on a physical phone. A small change makes the tick timer opt-in in
  release (`const TIMING = __DEV__ || globalThis.PEWPEW_TIMING`). Do not optimize the bot: any float reordering would change its inputs and every verifier hash.

### H5. Audio: node creation and JSI traffic at peak. Counts MEASURED, cost REASONED
- Every note builds a gain, an optional filter, and 1-2 sources (audio.ts:271-321). That is required by Web Audio, since sources are one-shot.
  The peak is the boss song plus rapid fire (10 lasers/s) plus about 10 boss `hit`/s: about 53 + 40 + 40 = 133 nodes/s and about 1,000 JSI calls/s,
  or about 8-17 per frame at 120/60 Hz. That is roughly 1-2 ms/s of JS thread at 1-2 µs per JSI call.
- JS allocations per SFX (audio.ts:325-335): `(capped.get(id) ?? []).filter(...)` makes 1 array, plus 1 `stops` array and 1 closure. Per note: the Cell literal (330),
  the `envelopePlan` object, the `sources` array, the `arm` closure, and the Voice object with its closure. That is about 7 objects per note.
  `pump` runs 40 times/s on its own interval and allocates a filtered `voices` array each time (audio.ts:349). It is not tied to frames.
- Finished nodes do not leak processing. In react-native-audio-api, a source that ends calls `disable()`, its gain disables via `onInputDisabled`,
  and the bus skips disabled inputs (node_modules/react-native-audio-api/common/cpp/audioapi/core/AudioNode.cpp:103-111, 172, 261-265).
  Memory is reclaimed after the Hermes GC frees the host objects.
- Fix: none needed now. If a profile shows audio, the cheapest product-side change is a 1-note `laser` (sound.ts:33), which halves
  the most frequent SFX. The JS-side compaction (filter in place) is not worth the diff.

### H6. Renderer JSI calls and host objects per frame. MEASURED. Already near minimal
- About 35-40 JSI calls per frame (counted above, plus 2 `clientWidth`/`clientHeight` getters in `resize()`, render.ts:314-315). That is about 4,500/s at 120 Hz.
- Per frame it creates 5 WebGPU host objects (current texture, view, encoder, pass, command buffer) and 1 array literal `[encoder.finish()]`
  (render.ts:491-515). That is unavoidable with the WebGPU API shape. react-native-webgpu already passes `reportsMemoryPressure=false` for the
  canvas texture to avoid GC churn (GPUCanvasContext.cpp:50).
- The JS in `frame()` allocates nothing else. `passDesc` and the attachments are reused (render.ts:302-310), the counting sort uses preallocated
  `counts/starts/cursor/bodyMesh` arrays (265-268), particles are SoA with swap-remove (390-404), and the instance buffers are sized once to
  `MESH_CAP` (515) and `GLOW_CAP` (2562) while only the used prefix is uploaded (488-489).
- The 2 `setVertexBuffer` calls per mesh draw are a workaround for an observed Dawn error (.audit/decisions.tsv:24). Requesting
  `indirect-first-instance` at App.tsx:199 might allow `firstInstance`/`baseVertex` and save about 8-10 calls per frame. Not worth it (see "do not bother").

### H7. Sim step. MEASURED. Already good
- Exact allocations inside `step` and its callees:
  - One event object literal per emitted event: sim.ts:168 (start, once), 375 (fire, 5-10/s), 392 and 487 (enemyFire), 505, 510, 518, 541, 553, 565, 568, and
    600/605/613/617/621/625 (once per run). Measured 0.10-0.17 events per step, at most 3.
  - Phase objects on transitions only: 599, 612, 615, 624. The boss object once: 616.
  - Iterators: `for (const c of COLUMNS)` per `remove` (317) and `for (const ph of spec.phases)` per boss step (382). Hermes has an
    array fast path for for-of, so this is likely free (REASONED).
  - No closures (the `DRONE_MOVES` table is static), no spreads, no `.map/.filter`, no strings.
- `collide` is about half of step time. A per-kind `ROLE` Uint8Array plus a `RADIUS` Float64Array (not Float32, to keep bits) would replace the
  `ARCHETYPES[k].role` string compares. That might save 20-40% of under 1 µs. See "do not bother".

### Per-frame tick allocations (App.tsx:151-171)
- 170: closure plus React update object per frame (H3). 168: for-of iterator over events. 160 (AUTO only): `greedyBot` returns `{ targetX }`
  per step (bot.ts:72). 191-193 (dev only): 2 `performance.now()` calls. Touch: `dragInput` allocates 1 `Input` per move event (sim.ts:58),
  which is event-rate, not frame-rate, and is fine.

## Suspects, confirmed or cleared
- `inputs` Float32Array sized to maxSteps per run (sim.ts:228): CLEARED. It is only in `run()` (simulate/replay: verifier, tests). The app loop never
  calls it. At most about 80 KB once per verify run, plus the `.slice` at 245.
- `hudOf` object churn: CLEARED for allocation (about 3 objects/s). The real cost is what each new object triggers (H3, H1).
- Events array `out.length = 0`: CLEARED. It is one caller-owned array, cleared once per frame (App.tsx:169), and holds at most a few small objects.
- `loop.events` passed to audio and renderer each frame: CLEARED. It is the same array, the renderer iterates by index, and it is empty on more than 85% of steps.
- `Math.min(dt, 0.1)` plus `MAX_STEPS_PER_FRAME`: CLEARED, it cannot spiral. The loop runs at most 4 steps per frame and drops the remainder (App.tsx:158-164).
  A 100 ms hitch costs 4 steps (about 4 µs in V8) and loses 2 steps of game time instead of catching up.
- PixelRatio canvas size means rendering at 3x: CONFIRMED. A render scale of 2 helps (H2).
- Stars drawn fullscreen with a procedural shader every frame: CONFIRMED, including menus. It is cheap per pixel. The lever is the pixel count (H2),
  not caching. The parallax moves every frame, so a cached texture would still need a fullscreen blit.

## Cold path findings (level load, screen change)
- C1. `begin()` re-parses the song on every start (audio.ts:363 `songColumns(song)`): regex per token, 4 voices x 128 tokens.
  It also runs at `bossEnter` mid-run and on each return to a menu. That is 0.05-0.09 ms in V8, roughly 0.5-2 ms in Hermes, as a one-frame hitch at the boss
  entrance (MEASURED in V8, Hermes figure REASONED). Fix: memoize, `const COLS = new Map<MusicId, Cell[][]>()` and
  `cols: COLS.get(id) ?? (COLS.set(id, songColumns(song)), COLS.get(id)!)`, or precompute all 4 at `createAudio`.
- C2. `createWorld` / `compileTrack` (sim.ts:144, 633): 28-415 spawns, 0.02-0.06 ms warm, 0.42 ms on the first call (V8), and 13 typed arrays of
  512 elements (about 22 KB) per world. It runs in an effect after commit. Fine.
- C3. `createRenderer` runs once: it interleaves meshes, creates 3 pipelines, and uploads 2 static buffers. Fine. `Object.keys`/`flatMap` at module load are fine.
- C4. Screen changes re-render App and mount overlay screens. Expected, and not per frame.

## Top 5 by expected payoff
1. H1: memoize `run` (1 line). It fixes dropped steering whenever the HUD updates, and stops a redundant effect about 3 times/s.
2. H2: cap the render ratio at 2 (2 lines). It cuts about 55% of fragment work, bandwidth, and depth memory at 120 Hz, and lowers the chance that GPU back-pressure
   stalls the JS thread in `getCurrentTexture`/`present`.
3. H4: get a release-build, AUTO-off timing on a physical phone (CPU and Metal HUD) before any other optimization. Today's 3 ms figure is mostly the bot.
4. H3: call `setHud` only on change (3 lines). Optionally move HUD state into a child so App and Canvas stop re-rendering.
5. C1: cache `songColumns` per `MusicId` (2 lines). It removes a parse hitch at boss entrance and on menu returns.

## Do not bother
- Sim micro-optimizations (role/radius tables, spatial index, partitioned pools). The step is under 1 µs in V8, with at most 30 bodies.
- Optimizing `greedyBot`. It is dev-only on device, and changing its float order changes verifier hashes.
- Requesting `indirect-first-instance` to drop the per-mesh `setVertexBuffer` offsets. That saves about 8-10 JSI calls per frame and couples the shell to a feature.
- Particle system changes. They are SoA, swap-remove, allocation-free, and peak at 268 glows.
- Pooling or reusing audio nodes. Web Audio sources are one-shot, and finished voices already drop out of processing.
- The `inputs` Float32Array, `out.length = 0`, event passing, `hudOf` itself, and `dragInput` allocation.
- Caching the star field to a texture. Use the render scale instead.
- Transient (memoryless) depth via a Dawn feature. It saves memory only, since `depthStoreOp: 'discard'` already avoids bandwidth on tile GPUs.

## What is already good
The sim is allocation-free apart from event objects (0.1-0.17 per step). The SoA pool, the static drone move table, and the bounded step loop are all
in place. The renderer does 1 pass, 1 submit, and 1 present, uploads only the used instance prefix, reuses descriptors, and uses about 6 draws.
Particles stay on the renderer side and never touch determinism. `hudOf` bails out correctly. Audio voice caps and lookahead scheduling work, and nothing
in audio runs per frame unless events fire. Determinism is not touched by any fix above. H1-H3 and C1 are shell, render, and audio changes only.
