# pewpew architecture, candidate 1: "the level is a compiled track; the world is a flat pool"

## Usage (caller's view)

Three callers drive the design: the app shell, the CI verifier, and the menu screens.

```ts
// App.tsx: the whole input-to-pixels path (App.tsx -> sim.ts -> render.ts)
const onTouchStart = (e) => { drag.anchorX = loop.world!.player.x; drag.fx = e.nativeEvent.pageX; };
const onTouchMove  = (e) => { loop.input = dragInput(drag.anchorX, (e.nativeEvent.pageX - drag.fx) / width); };
const onTouchEnd   = () => { loop.input = COAST; };

function frame(now: number) {                     // the body of tick(), see sketch
  loop.acc += Math.min((now - loop.last) / 1000, 0.1); loop.last = now;
  while (screen.s === 'play' && loop.acc >= STEP) { step(loop.world!, loop.input, loop.events); loop.acc -= STEP; }
  renderer.frame(loop.world, loop.events, loop.acc / STEP, dt);
  audio.events(loop.events);
  for (const ev of loop.events) if (ev.e === 'won' || ev.e === 'lost') onEnded(ev);
  loop.events.length = 0;
  setHud((h) => hudOf(loop.world!, h));            // same object back = no re-render
}
const onEnded = (ev) => {
  dispatch({ a: 'ended', result: ev });
  if (ev.e === 'won') setSave((s) => { const n = recordRun(s, level, ev.score, ev.stars); void writeSave(n); return n; });
};
```

```ts
// scripts/verify-levels.ts, run with `node scripts/verify-levels.ts` (Node 26 strips types, no build step)
for (const spec of LEVELS) {
  const r = simulate(spec.n, greedyBot);
  assert(r.outcome === 'won' && r.dropped === 0, `level ${spec.n}: ${r.outcome}`);
  assert(replay(spec.n, r.inputs).hash === r.hash, `level ${spec.n}: nondeterministic`);
}
for (const col of keys(RAMP)) if (RAMP[col] === 'nondecreasing') assertMonotone(LEVELS, col);
```

```ts
// src/ui/Menus.tsx: screens dispatch actions and never touch the sim
<LevelTile n={n} stars={save.levels[n - 1].stars} locked={!isUnlocked(save, n)} onPress={() => dispatch({ a: 'pick', level: n })} />
```

## Problem

We need a 30-level arcade shooter whose rules can be proved headless in Node and then played on the phone, with the same code doing both. The brief adds hard constraints. The sim must be pure and deterministic. The renderer reads the sim and never writes it. Audio reacts only to events. Meshes and music are data. A reader must be able to trace input to pixels in three files. The shape is non-obvious for three reasons. Hermes punishes per-frame allocation. "Deterministic" breaks quietly when Node (V8) and Hermes disagree in the last bit of `Math.sin`. And "the table is the single source of truth" fails if per-level rules leak into spawn code, the renderer, or audio. The repo has a working spike in App.tsx with the canvas lifecycle (retry on zero layout, resize from `clientWidth * PixelRatio`, `ctx.present()`), `@webgpu/types`, TS 6 and Node 26. The design reuses that lifecycle inside `render.ts`.

## Shape

**Module map** (one file per module, so internals are file-local and nothing outside can import them, per the importable-internals red flag):

| file | owns | imports |
|---|---|---|
| `src/levels.ts` | `Kind`, `ARCHETYPES`, `LEVELS` (30 rows), `BOSSES` (3), `RAMP`, `tierOf` | nothing |
| `src/sim.ts` | `World`, `step`, `createWorld`, `Input`/`dragInput`, `SimEvent`, `hudOf`, `simulate`/`replay`, track compiler | levels |
| `src/bot.ts` | `greedyBot`, `idleBot` | sim, levels |
| `src/flow.ts` | `Screen`, `Action`, `reduce` | levels, save (type only) |
| `src/save.ts` | `Save`, `parseSave`, `recordRun`, `isUnlocked`, AsyncStorage I/O | levels |
| `src/sound.ts` | `PATCHES`, `SFX`, `SONGS`, `EVENT_SFX` (data) | sim (types) |
| `src/audio.ts` | `createAudio`: the synth engine, sequencer, voice caps, music state | sound |
| `src/meshes.gen.ts` | `MESHES`, `MeshId` (generated) | nothing |
| `src/render.ts` | `createRenderer`, `LOOK`, 3 WGSL pipelines, particles | sim (types), meshes |
| `App.tsx` | the shell: screen, save, audio, renderer, world, loop, touch | everything |
| `scripts/gen-meshes.ts`, `scripts/verify-levels.ts` | generation, CI proof | |

**Data first.**

- *Level = table row + fixed seed, compiled once into a `Track`.* `createWorld` runs `compileTrack(spec)` into a y-sorted `Spawn[]`. Every row carries its own `seed`, so the verifier proves the exact layout players fly, not a random sample. Spawning at runtime is a cursor walk. Per-level rules exist only in `LEVELS`/`BOSSES`, and `compileTrack` is the only reader of density, mix and wells.
- *Entities = one dense struct-of-arrays pool* (`Bodies`, 512 capacity, swap-remove). There's no per-entity object and no GC churn in Hermes. The renderer iterates `0..count` and counting-sorts by mesh straight into the instance buffer. Static per-kind facts (`radius`, `hp`, `score`, `splitInto`, `role`) live in `ARCHETYPES`, and collision switches on `role`, never on `kind`. The player, the boss and the wormhole are scalars on `World`, because they're unique and need stable identity, which swap-remove indices can't give.
- *Run phase* is a 4-variant union (`fly | boss | won | lost`). Terminal phases make `step` a no-op, so a double-dispatched end or an extra step is harmless (make-operations-idempotent). Invulnerability, rapid fire and the shield are tick deadlines or a boolean on `Player`, not phases, because they overlap with any phase.
- *Screen flow* is a separate pure reducer (`flow.ts`, 7 screens). Invalid actions return the same screen. The `play` screen carries `(level, attempt)`, and the shell rebuilds the `World` when that key changes, so "retry" can't reuse a dead world.
- *Input* is one value per step: `{ targetX: number | null }`. The human's relative drag and the bot both produce it. `null` means the finger is up: the rocket coasts and gravity wells get full authority, which is what gives wells teeth. The drag mapping (`dragInput`) lives in the sim, so the bot and the human share one input model.
- *Events* form a discriminated union appended to a caller-owned buffer. `step` appends and the shell clears once per rendered frame, so events from multiple steps in one frame aren't lost.

**Invariants encoded in types, not prose** (encode-lessons-in-structure):

- `WorldView = View<World>` maps typed arrays to `ArrayLike<number>` and every field to `readonly`. The renderer, HUD and bots receive a `WorldView`, and I verified with tsc that `v.bodies.x[0] = 1` fails to compile. That is brief requirement 3, enforced by the compiler.
- `EVENT_SFX: { [E in EventName]: ... }`, `LOOK: { [K in Kind]: Look }`, `ARCHETYPES: { [K in Kind]: ... }` and `RAMP: { [numeric column of LevelSpec]: ... }` are all exhaustive mapped types. Adding an event, kind or level column fails the build until every table classifies it, which is the hand-synced-list red flag turned into a compile error.
- `LevelNumber` is a 1..30 literal union, so `levelSpec(31)` doesn't compile.

**Determinism.** The sim uses a mulberry32 RNG (`Math.imul`, which is exact) and only `+ - * / sqrt`, which IEEE 754 makes bit-identical across engines. `Math.sin/cos/pow/random` are lint-banned in `sim.ts` and `levels.ts`, and drone patterns use a polynomial `sinT`. Without this, the verifier would prove a game that differs by an ulp from the phone's, and the divergence compounds over 3,000 steps. `replay(n, inputs)` proves determinism from the input stream alone.

**Renderer contract.** `frame(world | null, events, alpha, dt)`, one call per rAF. It reads positions (interpolating `px→x` by `alpha`, so 120 Hz ProMotion doesn't judder at a 60 Hz sim), maps `kind` through `LOOK` to a `MeshId`, and batches by mesh. There is one shared vertex and index buffer for all meshes and one instance buffer written once per frame, then a `drawIndexed` per non-empty mesh using `firstInstance`. That is about 17 draw calls in the worst case. There are three pipelines: `stars` (procedural, bufferless), `mesh` (instanced, Lambert plus emissive vertex color, depth) and `glow` (additive billboards for bolts, exhaust, particles and the shield). Particles are renderer-owned state spawned from events, so the sim stays lean and they never affect determinism. The HUD is React Native views fed by `hudOf(world, prev)`, which returns `prev` itself when nothing visible changed.

**Audio contract.** `events(evs)`, `ui(cue)`, `mix(...)` and `active(on)`. The engine is the single owner of music state. A `start` event selects `tierOf(level)`'s song, `bossEnter` switches to `boss`, and `won`/`lost` play a stinger and stop. SFX come from the exhaustive `EVENT_SFX` table. A `Patch` is wave, ADSR, optional detune, filter-with-envelope and pitch sweep, and noise comes from one buffer generated at init. A `Song` is bpm plus tracker strings (`"C4 - . E4"`) per voice, scheduled by a 25 ms lookahead timer against `ctx.currentTime`. Each SFX has a `maxVoices` cap so 10 lasers a second can't pile up nodes.

**Mesh generator output.** `MESHES: { [M in MeshId]: MeshData }` with `positions`, `normals`, `colors` (`Float32Array`), `indices` (`Uint16Array`) and `radius`. Vertices are unshared so face normals give flat shading. The `MeshId` union is emitted from the builder record's keys, and the script is seeded, so a rerun with unchanged code is byte-identical.

**Bot contract.** `type Bot = (w: WorldView) => Input`. A bot sees exactly what the renderer sees and speaks exactly the human's input type. It can't cheat through internals or write state.

**Persistence.** One AsyncStorage key holds `{ v: 1, levels: [{best, stars}] x 30, music, sfx }`, parsed at the boundary into a fresh save on any defect (boundary-discipline). Unlocks are derived (`isUnlocked`), never stored. `recordRun` max-merges, so writing a result twice is idempotent. Stars are lives left at the wormhole (1 to 3), so there is no tuning column for them.

**Interface depth.** The sim's public surface is 5 functions plus types (`createWorld`, `step`, `hudOf`, `simulate`, `replay`). It hides track compilation, spawning, steering physics, drone patterns, boss attack cycling, collision, scoring and phase transitions. Audio exposes 4 methods over a synth, sequencer and voice manager. The renderer exposes 1 method over 3 pipelines, instancing, particles, resize and camera.

**What it deliberately doesn't do:** no ECS framework, no worker or worklet thread for the sim, no React state for anything per-frame, no particle simulation in the sim, no runtime level generation (layouts are fixed per level), and no bloom pass.

## Synthesis decision

*(filled in by arena)*

## Tradeoffs accepted

- We accept fat files (`render.ts` with inline WGSL, `sim.ts` holding all rules) in exchange for the three-file trace from input to pixels and file-local internals.
- We accept a trig ban and a homemade `sinT` in the sim in exchange for the verifier proving the same bits the phone runs.
- We accept fixed layouts per level (no replay variety) in exchange for "verified" meaning *this* level, not *a* level, and fair per-level best scores.
- We accept swap-remove, under which body indices aren't identities, in exchange for dense iteration. Events carry positions, not indices, and anything needing identity (the player, the boss) is a scalar.
- We accept O(bolts x bodies) collision (about 32 x 300 = 10k checks per step) in exchange for no spatial index. Revisit only if the profiler says so.
- We accept a HUD in React Native views (one bail-out comparison per frame) in exchange for not building a GPU text renderer.
- Stars = lives left looks like an under-tuned shortcut. It's deliberate, because it adds no table column and is legible to players.

## Alternatives considered

- **Object-per-entity list with pooled objects.** It's simpler to read (`e.x`), but it exposes a mutable object graph the renderer could write. It also needs a separate repack into the instance buffer every frame and costs pointer-chasing in Hermes. It hides less: callers would learn the pooling discipline.
- **Runtime procedural spawning from the seeded RNG instead of a compiled track.** The spawn rules end up interleaved with the step logic, the verifier can't inspect a layout (gap guarantees, density), and a spawn-rule change silently shifts every downstream RNG draw. The compiled track makes layout a value you can assert on.
- **One combined "game" module (flow + sim + save) with `game.dispatch`.** It's a deeper single surface, but it fuses the pure deterministic sim with UI and persistence concerns, so the verifier would drag in screens. Separate `flow.reduce` stays tiny, and the sim stays importable from Node with zero UI.
- **Sim on a worklet thread (react-native-worklets).** It would free the JS thread, but it adds a serialization boundary between sim and renderer, splits ownership of `World`, and complicates determinism and debugging. That isn't justified for a few hundred bodies.

## Open questions and risks

- Does Metro resolve `./sim.ts`-style specifiers (needed for Node-native type stripping)? If not, do we accept `npx tsx scripts/verify-levels.ts` and drop the `.ts` specifiers?
- Is a greedy lookahead bot strong enough to win level 30 and its boss without the table being softened to suit the bot? If it isn't, do we let the bot read the compiled `Track` (perfect foresight) and keep a separate "human-plausible" reaction-delay check?
- Does `react-native-audio-api` 0.13.6 hold up under about 40 to 60 node creations a second (sequencer plus SFX) on Hermes and JSI without glitches? The fallback is pre-rendering SFX into `AudioBuffer`s with the same patch data at init.
- Should the JS thread carry the sim, renderer encoding and RN HUD updates together? The budget is about 4 ms of sim plus about 3 ms of encoding. We need to measure on the simulator before U4.
- Should cross-engine determinism be proved, not just designed for, by recording golden `hash` values from the device into the verifier?

## Next implementation step

Write `src/levels.ts` (all 30 rows) and `src/sim.ts` `createWorld`/`compileTrack`/`step` with `scripts/verify-levels.ts` against `idleBot`, then `greedyBot`, before any rendering.
