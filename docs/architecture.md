# pewpew architecture

The level is a compiled track and the world is a flat pool. This document explains the shape of the code in `src/` and why it has that shape.

## Usage from the caller's side

Three callers drive the design. They are the app shell, the CI verifier, and the menu screens.

```ts
// App.tsx owns the whole input-to-pixels path (App.tsx -> sim.ts -> render.ts)
const onTouchStart = (e) => { drag.anchorX = loop.world!.player.x; drag.fx = e.nativeEvent.pageX; };
const onTouchMove  = (e) => { loop.input = dragInput(drag.anchorX, (e.nativeEvent.pageX - drag.fx) / width); };
const onTouchEnd   = () => { loop.input = COAST; };

function frame(now: number) {
  loop.acc += Math.min((now - loop.last) / 1000, 0.1); loop.last = now;
  while (screen.s === 'play' && loop.acc >= STEP) { step(loop.world!, loop.input, loop.events); loop.acc -= STEP; }
  renderer.frame(loop.world, loop.events, loop.acc / STEP, dt);
  audio.events(loop.events);
  for (const ev of loop.events) if (ev.e === 'won' || ev.e === 'lost') onEnded(ev);
  loop.events.length = 0;
  setHud((h) => hudOf(loop.world!, h));            // same object back means no re-render
}
const onEnded = (ev) => {
  dispatch({ a: 'ended', result: ev });
  if (ev.e === 'won') setSave((s) => { const n = recordRun(s, level, ev.score, ev.stars); void writeSave(n); return n; });
};
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

The shape is non-obvious for three reasons. Hermes punishes per-frame allocation. "Deterministic" breaks quietly when Node (V8) and Hermes disagree in the last bit of `Math.sin`. And "the table is the single source of truth" fails if per-level rules leak into spawn code, the renderer, or audio. `App.tsx` keeps the canvas lifecycle from the toolchain spike (retry on zero layout, resize from `clientWidth * PixelRatio`, `ctx.present()`), and `render.ts` relies on it.

## Shape

### Module map

Internals stay unexported, so nothing outside a module can import them. Audio is the directory `src/audio`.

| File | Owns | Imports |
|---|---|---|
| `src/levels.ts` | `Kind`, `Role`, `ARCHETYPES`, `BossPhase`, `BOSSES` (3), `LevelSpec`, `TrackLevel`, `BossLevel`, `Decade`, `LevelTable`, `RAMP`, `defineLevels`, `LEVELS` (30 rows), `levelSpec`, `tierOf` | nothing |
| `src/sim/index.ts` | the public barrel. Callers import this module and nothing under `src/sim/` | the other `src/sim` modules |
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
| `src/audio/engine.ts` | `AudioEngine`, `createAudio` (the synth engine, sequencer, voice caps, music state) | sim (types), audio data |
| `src/audio/index.ts` | the public audio API, so `src/audio` keeps resolving | data, engine |
| `src/meshes.gen.ts` | `MeshData`, `MeshId`, `MESHES` (generated) | nothing |
| `src/render.ts` | `Look`, `LOOK`, `Renderer`, `createRenderer` (3 WGSL pipelines, particles) | levels, sim (types), meshes |
| `App.tsx` | the shell, which owns screen, save, audio, renderer, world, loop, and touch | everything |
| `scripts/gen-meshes.ts` | mesh generation (`npm run gen:meshes`) | meshes (types) |
| `scripts/verify-levels.ts` | the CI proof (`npm run verify`) | levels, sim, bot |


### Data first

- *A level is a table row plus a fixed seed, compiled once into a `Track`.* `createWorld` runs `compileTrack(spec)` into a y-sorted `Spawn[]`. Every row carries its own `seed`, so the verifier proves the exact layout players fly, not a random sample. Spawning at runtime is a cursor walk. Per-level rules exist only in `LEVELS` and `BOSSES`, and `compileTrack` is the only reader of density, mix, and wells.
- *Entities live in one dense struct-of-arrays pool.* `Bodies` has 512 slots and uses swap-remove. There's no per-entity object and no GC churn in Hermes. The renderer iterates `0..count` and counting-sorts by mesh straight into the instance buffer. Static per-kind facts (`radius`, `hp`, `score`, `splitInto`, `role`) live in `ARCHETYPES`, and collision switches on `role`, never on `kind`. The player, the boss, and the wormhole are scalars on `World`, because they're unique and need stable identity, which swap-remove indices can't give.
- *The run phase is a 4-variant union* (`fly | boss | won | lost`). Terminal phases make `step` a no-op, so a double-dispatched end or an extra step is harmless. Invulnerability, rapid fire, and the shield are tick deadlines or a boolean on `Player`, not phases, because they overlap with any phase.
- *A boss is a list of health-gated phases.* `BossSpec.phases` is a non-empty tuple whose first entry has `atHpFraction: 1`. Each `BossPhase` sets `sweepSpeed`, `attackEvery`, and a non-empty `attacks` cycle. The sim picks the last phase whose fraction is at or above the boss's remaining health, so phase is derived from `hp` and never stored.
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

`frame(world | null, events, alpha, dt)` runs once per rAF. It reads positions, interpolating `px` to `x` by `alpha` so 120 Hz ProMotion doesn't judder at a 60 Hz sim. It maps `kind` through `LOOK` to a `MeshId` and batches by mesh. One shared vertex and index buffer holds all meshes, and one instance buffer is written once per frame. Then a `drawIndexed` runs per non-empty mesh using `firstInstance`, which is about 17 draw calls in the worst case. There are three pipelines. `stars` is procedural and bufferless. `mesh` is instanced, with Lambert shading plus emissive vertex color and depth. `glow` draws additive billboards for bolts, exhaust, particles, and the shield. Particles are renderer-owned state spawned from events, so the sim stays lean and they never affect determinism. The HUD is React Native views fed by `hudOf(world, prev)`, which returns `prev` itself when nothing visible changed.

### Audio contract

`AudioEngine` has four methods, `events(evs)`, `ui(cue)`, `mix(...)`, and `active(on)`. The engine is the single owner of music state. A `start` event selects the song for `tierOf(level)`, `bossEnter` switches to `boss`, and `won` or `lost` plays a stinger and stops. SFX come from the exhaustive `EVENT_SFX` table. A `Patch` is a wave, an ADSR envelope, an optional detune, an optional filter with its own envelope, and an optional pitch sweep. Noise comes from one buffer generated at init. A `Song` is a bpm plus tracker strings (`"C4 - . E4"`) per voice, scheduled by a 25 ms lookahead timer against `ctx.currentTime`. Each SFX has a `maxVoices` cap so 10 lasers a second can't pile up nodes. `npm run render-song` writes every song and effect to `/tmp/pewpew-audio` as wav; `npm run render-song -- tier1` renders one id.

### Mesh generator output

`MESHES` is a total record over `MeshId`. Each `MeshData` has `positions`, `normals`, and `colors` (`Float32Array`), `indices` (`Uint16Array`), and `radius`. Vertices are unshared, so face normals give flat shading. The generator emits the `MeshId` union from its builder record's keys and seeds its RNG, so a rerun with unchanged code is byte-identical.

### Bot contract

`type Bot = (w: WorldView) => Input`. A bot sees exactly what the renderer sees and speaks exactly the human's input type. It can't cheat through internals or write state.

### Persistence

One AsyncStorage key, `pewpew/save/v1`, holds `{ v: 1, levels: [{ best, stars }] x 30, music, sfx }`. `parseSave` turns any defect into a fresh save at the boundary. Unlocks are derived by `isUnlocked`, never stored. `recordRun` max-merges, so writing a result twice is idempotent. Stars are the lives left at the wormhole (1 to 3), so there is no tuning column for them.

### Interface depth

The sim exports five functions plus types (`createWorld`, `step`, `hudOf`, `simulate`, `replay`). They hide track compilation, spawning, steering physics, drone patterns, boss phase and attack cycling, collision, scoring, and phase transitions. Audio exposes four methods over a synth, a sequencer, and a voice manager. The renderer exposes one method over three pipelines, instancing, particles, resize, and camera.

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
- Boss phases. `BossPhaseSpec` became `BossPhase` (`atHpFraction`, `sweepSpeed`, `attackEvery`, `attacks`), and it replaced candidate 1's flat `sweepSpeed`, `attackEvery`, and `attacks` on `BossSpec`.

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

- Rename fields to carry their units (`scrollUnitsPerSec`, `attackEverySec`) and split the shared `Bodies` columns `variant`, `t`, and `param` per kind, as the comment review proposed.
- Run the Android emulator and a physical iPhone pass, and a release build.
- Decide whether to keep momentum after a finger lift (coast damping is 0.9 per step) once people have played it.
