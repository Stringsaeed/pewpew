# pewpew architecture

The level is a compiled track and the world is a flat pool. This document explains the shape of the code in `src/` and why it has that shape.

## Usage from the caller's side

Three callers drive the design. They are the app shell, the CI verifier, and the menu screens.

```ts
// App.tsx writes input. useGpu calls advance once per rAF.
onTouchStart = (e) => press(loop, e.nativeEvent.pageX);
onTouchMove  = (e) => drag(loop, e.nativeEvent.pageX, width);
onTouchEnd   = () => release(loop);

// src/shell/loop.ts. dt is clamped to 0.1 s. At most MAX_STEPS_PER_FRAME (4)
// steps run, then a leftover accumulator is dropped. A loss holds the world
// for LOSS_HOLD_MS (1 s) and a win for WIN_HOLD_MS (1.4 s). During that beat
// render dt is multiplied by SLOW_MOTION (0.3). ended fires once, when the
// hold reaches zero. The save is not here: App's terminal sink calls commitSave.
export function advance(loop: Loop, now: number, sinks: Sinks): void {
  const dtMs = Math.min(now - loop.last, 100);
  const dt = dtMs / 1000;
  loop.last = now;
  const world = loop.world;
  let finished: Hold | null = null;
  if (loop.hold) {
    loop.hold.leftMs -= dtMs;
    if (loop.hold.leftMs <= 0) { finished = loop.hold; loop.hold = null; }
  }
  if (loop.playing && loop.hold === null && finished === null && world) {
    loop.acc += dt;
    let steps = 0;
    while (loop.acc >= STEP && steps < MAX_STEPS_PER_FRAME) {
      if (!loop.auto) loop.botOnly = false;
      step(world, loop.auto ? greedyBot(world) : loop.input, loop.events);
      loop.acc -= STEP;
      steps += 1;
    }
    if (loop.acc >= STEP) loop.acc = 0;
  }
  let started: EventOf<'won'> | EventOf<'lost'> | null = null;
  if (loop.hold === null && finished === null) {
    for (const ev of loop.events) if (ev.e === 'won' || ev.e === 'lost') { started = ev; break; }
  }
  const slow = loop.hold !== null || finished !== null || started !== null;
  sinks.render(world, loop.events, loop.acc / STEP, slow ? dt * SLOW_MOTION : dt);
  sinks.audio(loop.events);
  if (finished) sinks.ended(finished.ev);
  for (const ev of loop.events) if (ev.e !== 'won' && ev.e !== 'lost') sinks.ended(ev);
  if (started) {
    const totalMs = started.e === 'lost' ? LOSS_HOLD_MS : WIN_HOLD_MS;
    setPlaying(loop, false);
    sinks.hold?.(started.e, (totalMs / 1000) * SLOW_MOTION);
    sinks.terminal?.(started);
    const leftMs = totalMs - dtMs;
    if (leftMs <= 0) sinks.ended(started);
    else loop.hold = { kind: started.e, leftMs, ev: started };
  }
  loop.events.length = 0;
  if (world) {
    const next = hudOf(world, loop.hud); // same object back means no re-render
    if (next !== loop.hud) { loop.hud = next; sinks.hud(next); }
  }
}
```

```ts
// scripts/verify-levels.ts, run with `npm run verify` (tsx, no build step)
// Importing LEVELS already ran defineLevels, which throws on a malformed table.
for (const spec of LEVELS) {
  const r = simulate(spec.n, greedyBot);
  assert(r.outcome === 'won' && r.dropped === 0, `level ${spec.n}: ${r.outcome}`);
  assert(replay(spec.n, r.inputs).hash === r.hash, `level ${spec.n}: nondeterministic`);
}
```

```ts
// src/ui/LevelSelect.tsx: screens dispatch actions and never touch the sim
<LevelTile n={n} stars={save.levels[n - 1].stars} locked={!isUnlocked(save, n)} onPress={() => dispatch({ a: 'pick', level: n })} />
```

## Problem

We need a 30-level arcade shooter whose rules can be proved headless in Node and then played on the phone, with the same code doing both. The brief in `.audit/brief.md` adds hard constraints. The sim must be pure and deterministic. The renderer reads the sim and never writes it. Audio reacts only to events. Meshes and music are data. A reader must be able to trace input to pixels in three files.

The shape is non-obvious for three reasons. Hermes punishes per-frame allocation. "Deterministic" breaks quietly when Node (V8) and Hermes disagree in the last bit of `Math.sin`. And "the table is the single source of truth" fails if per-level rules leak into spawn code, the renderer, or audio. `src/shell/useGpu.ts` keeps the canvas lifecycle from the toolchain spike (retry on zero layout, resize from `clientWidth * PixelRatio`, `ctx.present()`), and `src/render` relies on it.

## Shape

### Module map

Internals stay unexported, so nothing outside a module can import them. Callers import the `src/sim`, `src/render`, and `src/audio` barrels, not a file inside them. `src/boundaries.test.ts` fails `npm test` when that slips; `*.test.ts` may deep-import. Audio is the directory `src/audio`. The renderer is the directory `src/render`.

| File | Owns | Imports |
|---|---|---|
| `src/levels.ts` | `Kind`, `Role`, `ARCHETYPES`, `DRONE_PATTERNS`, `BossPhase`, `BOSSES` (3), `LevelSpec`, `TrackLevel`, `BossLevel`, `Decade`, `LevelTable`, `RAMP`, `defineLevels`, `LEVELS` (30 rows), `LEVEL_COUNT`, `levelSpec`, `tierOf` | nothing |
| `src/sim/index.ts` | the public barrel, including `RAPID_TICKS`. Callers outside `src/sim` import this module and nothing under `src/sim/` | the other `src/sim` modules |
| `src/sim/rules.ts` | tuning constants (`STEP`, `TICKS_PER_SEC`, `TRACK_HALF_WIDTH`, `MAX_BODIES`, `COAST_DAMPING`, `BOLT_SPEED`, `FIRE_TICKS`, `PLAYER_X_LIMIT`, `PLAYER_RADIUS`, and the rest) | nothing |
| `src/sim/math.ts` | `rand` (mulberry32), `sinT`, `cosT`, `clamp`, `PI` | nothing |
| `src/sim/world.ts` | `World`, `WorldView`, `Bodies`, `Player`, `Boss`, `Phase`, `SimEvent`, `createWorld`, pool add/remove | levels, rules, track |
| `src/sim/input.ts` | `Input`, `COAST`, `dragInput`, `steerVelocity` | rules, math |
| `src/sim/track.ts` | `Spawn`, `Track`, `compileTrack` | levels, rules, math |
| `src/sim/drones.ts` | `DRONE_MOVES`, `driveX`, `droneClock` | rules, math, world (types) |
| `src/sim/boss.ts` | `bossPhase`, `runBoss`, `bossAttack` | levels, rules, math, world, drones |
| `src/sim/step.ts` | `step` and its stages (steer, wells, spawn, fire, move, collide, despawn, transition) | levels, rules, math, world, input, drones, boss |
| `src/sim/run.ts` | `Bot`, `RunResult`, `simulate`, `replay`, `hashWorld` | levels, rules, world, input, step |
| `src/sim/hud.ts` | `Hud`, `hudOf` | levels, world (types) |
| `src/bot.ts` | `greedyBot`, `idleBot` | sim |
| `src/flow.ts` | `Screen`, `Action`, `reduce` | levels, save, sim (types only) |
| `src/save.ts` | `Save`, `LevelRecord`, `SAVE_KEY`, `parseSave`, `recordRun`, `isUnlocked`, `loadSave`, `writeSave` | AsyncStorage, levels and sim (types) |
| `src/audio/data.ts` | `PATCHES`, `SFX`, `SONGS`, `EVENT_SFX` (data) | levels, sim (types) |
| `src/audio/engine.ts` | `AudioEngine`, `createAudio` (the synth engine, sequencer, voice caps, music state) | levels (`tierOf`), sim (types), audio data. The native backend is a lazy `require('react-native-audio-api')`, not an import |
| `src/audio/index.ts` | the public audio API, so `src/audio` keeps resolving | data, engine |
| `src/render/index.ts` | `Renderer`, `createRenderer` (GPU resources, four pipelines, pass, resize, hold and reduce-motion state, dispose) | render modules, sim (types), meshes |
| `src/render/look.ts` | `Look`, `LOOK`, visual radii, `NEBULA_OCTAVES`, tier tints | levels, sim, meshes (types) |
| `src/render/shaders.ts` | the stars, mesh, glow, and bubble shaders as TypeGPU functions, the `Uniforms` and `Instance` schemas, the vertex layouts, `shaderCode` | typegpu, look, meshes, fx |
| `src/render/batch.ts` | kind-to-mesh tables, counting sort, instance packing (bodies, bosses, black hole, bubble, dive) | levels, sim, look, meshes, particles, fx |
| `src/render/particles.ts` | particle pool (dots, rings, smoke, start delays), event bursts, boss damage emission, integration | levels, sim (types), fx |
| `src/render/fx.ts` | renderer-owned animation state (hold, hole age, bubble, trauma, hit flashes) and the dive pose | levels |
| `src/render/camera.ts` | view and projection uniforms, shake, zoom | nothing |
| `src/render/meshes.gen.ts` | `MeshData`, `MeshId`, `MESHES` (generated) | nothing |
| `src/shell/loop.ts` | mutable `Loop`, `createLoop`, `resetRun`, `setPlaying` (the only writer of `playing`), `advance`, `press`, `drag`, `release`, `rapidRemaining`, `RAPID_WINDOW_MS`. Holds a terminal world 1 s on a loss and 1.4 s on a win | sim barrel (`RAPID_TICKS`, `TICKS_PER_SEC`), bot, flow (type) |
| `src/shell/useGpu.ts` | adapter, device, zero-layout retry, rAF, renderer create and dispose, the one pixel-ratio read, Reduce Motion | react-native, webgpu, render, shell/loop |
| `src/shell/useSave.ts` | load once, `commitSave` (ref, state, writeSave) | react, save |
| `src/shell/useAudioLifecycle.ts` | AppState foreground, `active`, menu music, mix from the save toggles | react-native, audio, save |
| `src/shell/loop.test.ts` | `advance`, the hold, input, `rapidRemaining` | sim barrel, `src/sim/rules` (tests may deep-import), shell/loop |
| `src/ui/Screens.tsx` | which screen is on the canvas, the sector intro card, game-over best and reached | flow, levels (`levelSpec`, `tierOf`), save, sim (types), ui screens |
| `src/ui/Hud.tsx` | score, lives, the RAPID chip, the boss bar | react-native, reanimated, levels (`BOSSES`, `levelSpec`), sim (types), shell/loop (`RAPID_WINDOW_MS`) |
| `src/ui/Title.tsx` | title screen | react-native, reanimated, save (types), Button, theme |
| `src/ui/LevelSelect.tsx` | the 30-level grid | react-native, reanimated, levels (`LEVELS`, `tierOf`), save, Button, Gear, theme |
| `src/ui/LevelIntro.tsx` | `SECTOR n · LEVEL m`, WARNING on a boss level | theme, reanimated |
| `src/ui/Pause.tsx` | pause menu | Button, Panel, theme |
| `src/ui/Settings.tsx` | music and sfx toggles | react-native, Button, Panel, theme |
| `src/ui/Complete.tsx` | level-clear screen | react-native, levels (`LEVELS`), sim (types), Button, Panel, theme |
| `src/ui/GameOver.tsx` | loss screen | react-native, Button, Panel, theme |
| `src/ui/Panel.tsx` | modal panel | react, react-native, reanimated, theme |
| `src/ui/Button.tsx` | button | react-native, theme |
| `src/ui/Gear.tsx` | settings glyph | react-native, theme |
| `src/ui/Rocket.tsx` | life icon | react-native, theme |
| `src/ui/theme.ts` | color, type, spacing | nothing |
| `src/dev/qa.ts` | `unlockAll`, `logAutoRun`, the tick timer, `createDevTools` (AUTO, `globalThis.pewpew`) | levels, save, sim, shell/loop |
| `src/testing/fake-gpu.ts` | recording device, encoder, and pass for `createRenderer` under tsx | nothing from `src` |
| `src/testing/fake-audio.ts` | recording audio graph | audio (types) |
| `src/testing/render.snapshot.json` | frozen draw log and instance bytes. The render test must reproduce it | data |
| `src/render.test.ts` | the fake-GPU snapshot and the draw contract | bot, levels, render barrel, `render/meshes.gen` and `sim/world` (test-only deep imports), testing/fake-gpu |
| `src/sim/sim.test.ts` | sim behavior and the Math ban | levels, sim barrel, bot |
| `src/audio/audio.test.ts` | synth, sequencer, `EVENT_SFX` | levels, sim (types), audio, testing/fake-audio |
| `src/save.test.ts` | `parseSave`, `recordRun`, `isUnlocked` | save |
| `src/flow.test.ts` | `reduce` | flow, save |
| `src/boundaries.test.ts` | the import rules in this map | node builtins only |
| `index.ts` | `registerRootComponent(App)` | expo, App |
| `App.tsx` | wiring: screen state, the shell hooks, touch, and dev tools under `__DEV__` | shell, flow, audio, save, sim (types), ui. `src/dev` only from here, `src/shell`, and `src/dev` |
| `scripts/gen-meshes.ts` | mesh generation (`npm run gen:meshes`). Writes `src/render/meshes.gen.ts`. `--check` fails if that file would change | `node:fs` and `node:path` only. Nothing from `src` |
| `scripts/render-song.ts` | writes every song and effect to `/tmp/pewpew-audio` (`npm run render-song`) | `src/audio` (`SFX`, `SONGS`, `envelopePlan`, `midiHz`, `patchOf`, `sfxHits`, `songHits`) |
| `scripts/verify-levels.ts` | the CI proof (`npm run verify`), including the golden file | levels, sim, bot |
| `scripts/verify-levels.golden.txt` | expected hash, steps, score, and stars for all 30 levels | data |
| `scripts/ramp-sweep.ts` | seed tuning (`npm run sweep`). `--write-seeds` rewrites `src/levels.ts` | levels, sim, bot |

### Where to edit

| Task | Files, in order | Gate |
|---|---|---|
| Tune a level | `src/levels.ts` (that row; `BOSSES` when the level is 10, 20, or 30). `defineLevels` and `RAMP` reject a bad edit | `npm run check`. `scripts/verify-levels.golden.txt` must still match. A deliberate layout change updates it with `npm run verify -- --update-golden` |
| Add a hazard kind | `src/levels.ts` (`Kind`, `ARCHETYPES`, mix weights), `src/sim/step.ts` if it moves or collides on its own, `src/render/look.ts` (`LOOK`), `scripts/gen-meshes.ts` (rewrites `src/render/meshes.gen.ts`), `src/audio/data.ts` if it needs a sound | `npm run check` (golden file and `gen:meshes --check`). `src/testing/render.snapshot.json` if the draws change. Device smoke for a new shader or mesh |
| Add a boss attack | `src/levels.ts` (`BossAttack`, then the phase `attacks` list), `src/sim/boss.ts` (`bossAttack`) | `npm run check`. The golden file moves, because the fight changes |
| Add a drone pattern | `src/levels.ts` (`DRONE_PATTERNS`), `src/sim/drones.ts` (`DRONE_MOVES`) | `npm run check`. The golden file moves |
| Add a sound or song | `src/audio/data.ts` (`PATCHES`, `SFX`, `SONGS`, `EVENT_SFX`). `src/audio/engine.ts` only if the voice model changes | `npm run check`. Listen with `npm run render-song`. Device smoke for audibility |
| Change a look or mesh | `src/render/look.ts` for tints and radii, `scripts/gen-meshes.ts` for geometry, `src/render/shaders.ts` for a shader | `npm run check` (`shaders.test.ts` resolves every shader to WGSL and pins the schemas to the CPU packing). The render snapshot if instance layout or draw counts change. Device smoke for a shader (resolving catches TypeGPU type errors, but only a GPU compiles the WGSL) |
| Add a HUD element or screen | `src/sim/hud.ts` when it is a new visible fact, the component in `src/ui/`, `src/ui/Screens.tsx` to mount it, `src/flow.ts` when it is a new screen | `npm run check`. Device smoke for the screen |
| Change the frame loop or hold timing | `src/shell/loop.ts` (`MAX_STEPS_PER_FRAME`, `LOSS_HOLD_MS`, `WIN_HOLD_MS`, `SLOW_MOTION`), `src/shell/loop.test.ts`, then `src/render/fx.ts` and `src/render/index.ts` if the choreography changes | `npm run check`. Device smoke if the beat changes |
| Change the app icon | `design/rocket-icon/` (the Icon Composer bundle `PewPew.icon` and the `layers/`), then `scripts/gen-icons.sh` for the Android layers, then `npx expo prebuild --platform ios --clean` | Build to a device; the `.icon` bundle only renders on iOS 26, older systems get Xcode's flattened copy |
| Add a dev tool | `src/dev/qa.ts` (`createDevTools`), then `App.tsx` under `__DEV__` | `npm run check`. Device smoke under `__DEV__` |


### Data first

- *A level is a table row plus a fixed seed, compiled once into a `Track`.* `createWorld` runs `compileTrack(spec)` into a y-sorted `Spawn[]`. Every row carries its own `seed`, so the verifier proves the exact layout players fly, not a random sample. Spawning at runtime is a cursor walk. Per-level rules exist only in `LEVELS` and `BOSSES`, and `compileTrack` is the only reader of density, mix, and wells.
- *Entities live in one dense struct-of-arrays pool.* `Bodies` has 512 slots and uses swap-remove. There's no per-entity object and no GC churn in Hermes. The renderer iterates `0..count` and counting-sorts by mesh straight into the instance buffer. Static per-kind facts (`radius`, `hp`, `score`, `splitInto`, `role`) live in `ARCHETYPES`, and collision switches on `role`, never on `kind`. The player, the boss, and the wormhole are scalars on `World`, because they're unique and need stable identity, which swap-remove indices can't give.
- *The run phase is a 4-variant union* (`fly | boss | won | lost`). Terminal phases make `step` a no-op, so a double-dispatched end or an extra step is harmless. Invulnerability, rapid fire, and the shield are tick deadlines or a boolean on `Player`, not phases, because they overlap with any phase.
- *A boss is a list of health-gated phases.* `BossSpec.phases` is a non-empty tuple whose first entry has `atHpFraction: 1`. Each `BossPhase` sets `sweepSpeed`, `attackEverySec`, and a non-empty `attacks` cycle. The sim picks the last phase whose fraction is at or above the boss's remaining health, so phase is derived from `hp` and never stored.
- *Screen flow is a separate pure reducer* (`flow.ts`, 7 screens). Invalid actions return the same screen. The `play` screen carries `(level, attempt)`, and the shell rebuilds the `World` when that key changes, so "retry" can't reuse a dead world.
- *Input is one value per step*, `{ targetX: number | null }`. The human's relative drag and the bot both produce it. `null` means the finger is up. The rocket then coasts and gravity wells get full authority, which is what makes wells dangerous. The drag mapping (`dragInput`) lives in the sim, so the bot and the human share one input model.
- *Events form a discriminated union appended to a caller-owned buffer.* `step` appends and the shell clears once per rendered frame, so events from several steps in one frame aren't lost.

### Invariants the compiler or the loader enforces

- `WorldView` maps typed arrays to `ArrayLike<number>` and every field to `readonly`. The renderer, HUD, and bots receive a `WorldView`. A `@ts-expect-error` block in `src/sim/world.ts` proves that `view.bodies.x[0] = 1` and `view.player.x = 1` fail to compile, so brief requirement 3 is a build failure, not a review comment.
- `LEVELS` has type `LevelTable`, which is three `Decade` tuples. Each `Decade` is nine `TrackLevel` rows (`boss: null`) and one `BossLevel` row (`boss: BossId`). A boss on level 9 or a missing boss on level 20 fails to compile.
- `defineLevels` runs when `levels.ts` loads and throws if the table has the wrong length, an `n` out of order, a boss off 10, 20, or 30, a missing or non-positive mix weight, or a `RAMP` column marked `'nondecreasing'` that decreases. The app and the verifier can't load a bad table.
- `EVENT_SFX: { [E in EventName]: ... }`, `LOOK: { [K in Kind]: Look }`, `ARCHETYPES: { [K in Kind]: ... }`, `MESHES: { [M in MeshId]: MeshData }`, and `RAMP: { [numeric column of LevelSpec]: ... }` are exhaustive mapped types. Adding an event, kind, mesh, or level column fails the build until every table covers it.
- `LevelNumber` is a 1..30 literal union, so `levelSpec(31)` doesn't compile.

### Difficulty ramp

Every `RAMP` column rises or holds from level 1 to level 30. Scroll goes from 6.0 to 11.8 units per second, density from 8 to 33 hazards per 100 units, and length from 270 to 1060 units, so a run lasts 45 s on level 1 and about 90 s on level 30 (bosses add their fight on top). Wells start at level 4 and reach 5 by level 29. Drones appear at level 5 and start firing at level 6. The values were tuned against `npm run verify` and a 41-seed sweep (`scripts/ramp-sweep.ts`, log in `.audit/u2-ramp-sweep.txt`), and `defineLevels` keeps every edit monotone.

### Determinism

The sim uses a mulberry32 RNG (`Math.imul`, which is exact) and only `+ - * / sqrt`, which IEEE 754 makes bit-identical across engines. `Math.sin`, `Math.cos`, `Math.pow`, and `Math.random` are banned in `src/sim` and `levels.ts`, and drone patterns use a polynomial `sinT`. Without this ban the verifier would prove a game that differs by an ulp from the phone's, and the divergence compounds over 3,000 steps. `replay(n, inputs)` proves determinism from the input stream alone.

### Renderer contract

`frame(world | null, events, alpha, dt)` runs once per rAF. It reads positions, interpolating `px` to `x` by `alpha` so 120 Hz ProMotion doesn't judder at a 60 Hz sim. It maps `kind` through `LOOK` to a `MeshId` and batches by mesh. One shared vertex and index buffer holds all meshes, and one instance buffer is written once per frame. Stars is one `draw(3)`. Each non-empty mesh except the bubble then gets a `drawIndexed` whose `baseVertex` and `firstInstance` stay 0: Dawn rejects a nonzero value unless the device enabled `indirect-first-instance`, so the vertex buffer is bound at that mesh's byte offset and the instance buffer at that mesh's start. Glow is one `draw(4, count)`. The bubble pipeline draws last, with the same offset binding. There are four pipelines. `stars` is procedural and bufferless: three hashed star layers, a per-tier value-noise nebula (`NEBULA_OCTAVES`, the one per-pixel cost this layer adds), and speed lines from the nearest layer stretching with scroll speed. `mesh` is instanced, with a hemisphere ambient, Lambert, a rim light, emissive vertex color (any channel above 1 is unlit), a heat column (damage tint on bodies, accent brightening on bosses) and depth. `glow` draws additive billboards in five shapes (spot, ring, orb, halo, flat) for bolts, exhaust, particles, halos, and the flash. `bubble` draws the shield, a smooth icosphere, additively with no depth write: fresnel rim, hex shimmer, a ripple from the impact point. Particles are renderer-owned state spawned from events, so the sim stays lean and they never affect determinism. The HUD is React Native views fed by `hudOf(world, prev)`, which returns `prev` itself when nothing visible changed.

Mesh and glow instances are 12 floats: `(x, y, rot, scale)`, `(r, g, b, flash or alpha)`, then three extras. Mesh extras are `(heat, mode, a, b)`; the mode column picks the vertex transform (tumble, flat, tilted disc, dive). The black hole is two meshes, `blackhole` (horizon and photon ring) and `accretion` (a banded emissive disc the shader tilts and spins), plus a halo drawn behind the disc so the core stays black. The three bosses are authored in world units around the sim's bolt origin `(boss.x, boss.y - 1.4)`, so every launch point is on the mesh.

Two methods outside `frame` take the terminal beats. `hold(kind, seconds)` is called once when the sim emits `won` or `lost`; the shell then keeps calling `frame` with the same terminal world. Won flies the rocket into the black hole (accelerating, shrinking, rolling, stretching along its heading, exhaust following, camera easing in) and ends in a white flash. Lost blows the ship up and hides it. The choreography runs on the `dt` the shell passes, so a shell that slows `dt` for slow motion stretches the hold with it: pass `seconds` in the same scaled time. A new run or the menu ends a hold. `setReduceMotion(on)` turns the shake off, halves the flashes, and drops speed lines and warp; the shell skips its own slow motion. Shader compile errors do not show up in the fake-GPU tests, so a shader change must be checked on a device.

The shaders are TypeScript: each is a `tgpu.vertexFn` or `tgpu.fragmentFn` body marked `'use gpu'`, and `createRenderer` calls `tgpu.resolve` once per pair to get one WGSL module with a single vertex and fragment entry point, so the pipelines leave `entryPoint` unset. Only the shader source goes through TypeGPU. Buffers, pipelines, and the per-frame draw loop stay raw WebGPU, so a frame still allocates nothing. The `Uniforms` struct and the `MeshVertex` and `Instance` loose structs are the one description of the uniform block and both vertex buffers; `camera.ts` and `batch.ts` still write plain `Float32Array`s at fixed offsets, and `shaders.test.ts` checks those offsets against the schemas. `unplugin-typegpu` must see `src/render/shaders.ts` in every build: `babel.config.js` for Metro, the Vite plugin in `website/astro.config.mjs`, and `scripts/typegpu-hooks.mjs`, which `npm test` preloads into tsx. Without it `tgpu.resolve` throws "Missing metadata for tgpu.fn function body".

`AudioEngine` has four methods, `events(evs)`, `ui(cue)`, `mix(...)`, and `active(on)`. The engine is the single owner of music state. A `start` event selects the song for `tierOf(level)`, `bossEnter` switches to `boss`, and `won` or `lost` plays a stinger and stops. SFX come from the exhaustive `EVENT_SFX` table. A `Patch` is a wave, an ADSR envelope, an optional detune, an optional filter with its own envelope, and an optional pitch sweep. Noise comes from one buffer generated at init. A `Song` is a bpm plus tracker strings (`"C4 - . E4"`) per voice, scheduled by a 25 ms lookahead timer against `ctx.currentTime`. Each SFX has a `maxVoices` cap so 10 lasers a second can't pile up nodes. `npm run render-song` writes every song and effect to `/tmp/pewpew-audio` as wav; `npm run render-song -- tier1` renders one id.

### Mesh generator output

`MESHES` is a total record over `MeshId`. Each `MeshData` has `positions`, `normals`, and `colors` (`Float32Array`), `indices` (`Uint16Array`), and `radius`. Vertices are unshared, so face normals give flat shading. The generator emits the `MeshId` union from its builder record's keys and seeds its RNG, so a rerun with unchanged code is byte-identical.

### Bot contract

`type Bot = (w: WorldView) => Input`. A bot sees exactly what the renderer sees and speaks exactly the human's input type. It can't cheat through internals or write state.

### Persistence

One AsyncStorage key, `pewpew/save/v1`, holds `{ v: 1, levels: [{ best, stars }] x 30, music, sfx }`. `parseSave` turns any defect into a fresh save at the boundary. Unlocks are derived by `isUnlocked`, never stored. `recordRun` max-merges, so writing a result twice is idempotent. Stars are the lives left at the wormhole (1 to 3), so there is no tuning column for them.

### Interface depth

The sim exports five functions plus types (`createWorld`, `step`, `hudOf`, `simulate`, `replay`). They hide track compilation, spawning, steering physics, drone patterns, boss phase and attack cycling, collision, scoring, and phase transitions. Audio exposes four methods over a synth, a sequencer, and a voice manager. The renderer exposes `frame`, `dispose`, `hold`, and `setReduceMotion` over four pipelines, instancing, particles, hold choreography, resize, and camera.

### What it deliberately doesn't do

There's no ECS framework, no worker or worklet thread for the sim, and no React state for anything per-frame. The sim doesn't simulate particles or generate levels at runtime, since layouts are fixed per level. There's no bloom pass.

## Synthesis decision

Three architecture candidates competed in an arena. The coordinator and a gpt-5.6-sol cross-judge scored them on a 30-point rubric and reached the same totals. The verdict is in `.audit/decisions.tsv`.

| Candidate | Score | Verdict |
|---|---|---|
| 1 | 29 / 30 | Base |
| 2 | 23 / 30 | Grafts taken |
| 3 | 17 / 30 | Grafts taken |

**Base.** Candidate 1 is the only design that closes the full proof loop. Each level has a fixed compiled track, the phone and the verifier call the same `step`, `replay` consumes the recorded input stream, and the verifier compares a state hash. Its readonly `WorldView`, caller-owned event buffer, exhaustive tables, bounded pool, renderer-owned particles, and HUD bailout cover the boundary and frame-budget criteria with concrete mechanisms.

**Grafts from candidate 2.**

- All 30 level rows. Candidate 2's ramp was adapted to candidate 1's `LevelSpec`. Scroll and length kept candidate 2's values. Density changed from hazards per unit to hazards per 100 units. Gravity wells moved out of the hazard mix into the `wells` count, and the per-tier well counts became a running maximum so every `RAMP` column is monotone across the campaign. Drone patterns `cross` and `escort` became `zigzag` and `orbit`. The fixed per-row `seed` replaced candidate 2's caller-selected seeds.
- The load-time validator. `defineCampaign` became `defineLevels`.
- Boss phases. `BossPhaseSpec` became `BossPhase` (`atHpFraction`, `sweepSpeed`, `attackEverySec`, `attacks`), and it replaced candidate 1's flat `sweepSpeed`, `attackEverySec`, and `attacks` on `BossSpec`.

**Grafts from candidate 3.**

- The `Decade` tuple. `LevelTable` is three decades, so the compiler pins bosses to 10, 20, and 30.
- The total mesh set. `MESHES` is `{ [M in MeshId]: MeshData }`, so adding a mesh id fails the build until the generator emits it.

**Rejected.**

- Candidate 3's per-archetype partitioned pools. A counting sort over at most 512 bodies per frame is cheap, and fixed per-kind capacities add a second limit to tune. Revisit only if profiling shows the sort matters.
- Candidate 3's single `dispatch` writer that merges screens with the sim. It would pull screens and persistence into the headless verifier and hide who owns the simulation state.
- Candidate 2's runtime views through `NumericReadView` and `readSimulation`. The compile-time `WorldView` already rejects writes at no runtime cost, so an opaque handle plus a read call adds a layer without adding a guarantee.

## Tradeoffs accepted

- We accept a fat file (`render.ts` with inline WGSL) in exchange for the trace from input to pixels and file-local internals. The sim's rules live under `src/sim`, and callers still enter through one barrel.
- We accept a trig ban and a homemade `sinT` in the sim in exchange for the verifier proving the same bits the phone runs.
- We accept fixed layouts per level, with no replay variety, in exchange for "verified" meaning this exact level and for fair per-level best scores.
- We accept swap-remove, under which body indices aren't identities, in exchange for dense iteration. Events carry positions, not indices, and anything needing identity (the player, the boss) is a scalar.
- We accept O(bolts x bodies) collision, about 32 x 300 = 10k checks per step, in exchange for no spatial index. Revisit only if the profiler says so.
- We accept a HUD in React Native views, with one bailout comparison per frame, in exchange for not building a GPU text renderer.
- Stars equal to lives left looks like an under-tuned shortcut. It's deliberate, because it adds no table column and players can read it.

## Alternatives considered

- **Object-per-entity list with pooled objects.** It's simpler to read (`e.x`), but it exposes a mutable object graph the renderer could write. It also needs a separate repack into the instance buffer every frame and costs pointer-chasing in Hermes. It hides less, because callers would learn the pooling discipline.
- **Runtime procedural spawning from the seeded RNG instead of a compiled track.** The spawn rules end up interleaved with the step logic, the verifier can't inspect a layout (gap guarantees, density), and a spawn-rule change silently shifts every downstream RNG draw. The compiled track makes layout a value you can assert on.
- **One combined "game" module (flow plus sim plus save) with `game.dispatch`.** It's a deeper single entry point, but it fuses the pure deterministic sim with UI and persistence, so the verifier would drag in screens. A separate `flow.reduce` stays tiny, and the sim stays importable from Node with zero UI.
- **Sim on a worklet thread (react-native-worklets).** It would free the JS thread, but it adds a serialization boundary between sim and renderer, splits ownership of `World`, and complicates determinism and debugging. A few hundred bodies don't justify that.

## Resolved questions

- The greedy bot wins all 30 levels without reading the compiled `Track`. The table was tuned to it (boss hit points and attack cadence came down, seeds were chosen by the sweep), so the verifier proves these layouts are winnable by an instant-reaction bot, not that a person finds them fair.
- A level lasts 45 to 90 s of scroll. The 150 to 175 s first draft was cut.
- Cross-engine determinism is proved, not only designed for. The device logged the same hash as the Node verifier for levels 1, 10, and 30 (`.audit/u7-report.md`).
- The JS thread carries sim, bot, renderer, audio, and HUD in about 3 ms per frame on the simulator at 60 Hz (`.audit/u7-report.md`). A physical phone is not measured.
- `react-native-audio-api` constructs and schedules without errors on the device. Audibility and mix balance on hardware are not verified; render the songs with `npx tsx scripts/render-song.ts` to listen.

## Follow-ups

- Split the shared `Bodies` columns `variant`, `t`, and `param` per kind, as the comment review proposed. LevelSpec columns keep their names; each one already has a unit comment.
- Run the Android emulator and a physical iPhone pass, and a release build.
- Decide whether to keep momentum after a finger lift (coast damping is 0.9 per step) once people have played it.
