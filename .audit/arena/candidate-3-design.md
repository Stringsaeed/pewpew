# pewpew architecture

## Problem

A portrait rocket arcade game: one finger steers, the ship auto-climbs a fixed track, and thirty levels plus three bosses have to be data. The sim must be deterministic in Node, with no React, WebGPU, or audio imports, so `scripts/verify-levels.ts` can prove every level is completable. The repo today is a spike in `App.tsx` that already configures `react-native-webgpu`, calls `present()` after submit, and opens an `AudioContext` after `AudioManager.setAudioSessionOptions`. The non-obvious part is keeping that platform shell thin while the hot path stays readable in three files and Hermes can step a few hundred entities at 60 Hz without allocating.

## Usage (caller's view)

`App.tsx` owns the finger, the clock, and the canvas. It never sees entities. A tick command goes in; a session and a cue list come out. The same `dispatch` drives the headless bot.

```ts
import { dispatch, freshApp, hud, steer, STEP_SEC, tierOf, type SimEvent } from "./src/sim";
import { createRenderer, render } from "./src/render";
import { createAudio, hear } from "./src/audio";
import { loadProfile, saveProfile } from "./src/save";

let app = freshApp(await loadProfile());
const gpu = await createRenderer(canvas);
const audio = createAudio();
let held = steer(0);
let acc = 0;

function onTouchX(xPx: number, widthPx: number) {
  held = steer((xPx / widthPx) * 2 - 1);
}

function onFrame(dtSec: number) {
  acc += dtSec;
  const cues: SimEvent[] = [];
  let steps = 0;
  while (acc >= STEP_SEC && steps < 4) {
    const out = dispatch(app, { t: "tick", input: { steer: held } });
    app = out.app;
    cues.push(...out.events);
    acc -= STEP_SEC;
    steps += 1;
  }
  if (steps === 4) acc = 0;
  render(gpu, app.session, cues);
  hear(audio, cues, tierOf(app.session), app.profile);
  paintHud(hud(app.session));
  if (cues.some((e) => e.t === "cleared" || e.t === "failed")) void saveProfile(app.profile);
}
```

Finger-up keeps `held`. Pause, start, retry, and the music toggles are the other `Cmd` values; a command the current screen cannot accept comes back unchanged. Level select renders `tiles(profile)` and sends `{ t: "start", level }`.

```ts
import { LEVELS } from "./src/sim";
import { checkMonotone, gapBot, verifyAll } from "./scripts/verify-levels";

const bad = checkMonotone(LEVELS);
const reports = verifyAll(gapBot, 90_000);
```

```ts
import { emitMeshModule, generateMeshes } from "./scripts/gen-meshes";

writeFileSync("src/meshes.ts", emitMeshModule(generateMeshes()));
```

## Shape

Seven files plus two scripts. Pixels cross three of them: `App.tsx` (touch, fixed-step accumulator, RN screens and HUD), `src/sim.ts` (`dispatch`), `src/render.ts` (`render`). `src/audio.ts`, `src/save.ts`, and generated `src/meshes.ts` are siblings. `App.tsx` does not import meshes or the verifier.

`Session` is a discriminated union: title, select, play, pause, complete, over, settings. Settings remembers `back: "title" | "select" | "pause"` and a frozen `World` only when it covered a pause. Opening settings from play pauses first, so a settings screen never ticks. `Profile` is best scores, star counts, and two booleans. Unlock is derived: level 0 is open, and level `i` is open when `stars[i - 1] > 0`. Stars on a clear are the lives remaining, clamped to 1..3. One writer, `dispatch`, updates both the session and the profile. `saveProfile` runs from the shell after a clear, a fail, or a toggle. Per separate-before-serializing-shared-state, the sim does not share the store with the particle pool or the audio graph; those own their buffers and merge at the cue list.

`LevelTable` is a 30-tuple of three decades. Each decade is nine `TrackLevel` rows and a `BossLevel`. A boss row is the same recipe plus `BossDef` (`hp`, `shotsPerSec`, `pattern`, `speed`). Track rows carry seed, scrollSpeed, length, density, mix weights, a drone-pattern palette, and a well count. That is the whole per-level rule set. `compile` lowers one row into a y-sorted `SpawnTape` once per attempt. Step advances a cursor. There is no second RNG: fragments, bolts, and boss shots are functions of the tape and the tick.

The live set is a struct of arrays, one dense prefix per `Archetype`, capacities totaling 355 slots. Swap-remove, no per-entity objects, no spatial hash. Pair tests over those prefixes are the collision structure at this count. `readArchetype` projects the draw columns (`x`, `y`, `rot`, `scale`, `tint`). Radius, hp, and pattern stay off that view. `snap` copies plain threat numbers for the bot so a held snapshot cannot alias the columns. `World` on the public type is the scoreboard; `dispatch` mutates the store in place and returns the new cue list. Callers drop column views before the next tick.

`SimEvent` is the only side channel: laser, hit, explode, pickup, shield, hurt, cleared, failed. The renderer reads the world for instances and uses events to seed particles. Exhaust is derived from the rocket each frame. Audio never reads the world. `hear(audio, cues, tier, mute)` is the synth. A `Patch` is wave, pitch, gain, ADSR, cutoff. A `Sequence` is bpm, loop length, and voices of notes. `MUSIC` has four sequences. `tierOf` maps a session to `"i" | "ii" | "iii" | "boss" | "off"`: boss rows use `"boss"`, the other decades use `"i"` through `"iii"`, menus use `"off"`. The same tier is a no-op. `SFX_TABLE` is `Record` of every cue tag, including shell-only `"ui"`, to `Patch | null`. One interpreter builds osc, biquad, and gain. Per boundary-discipline, `steer()` clamps at the touch edge, and `loadProfile` parses the `{ v: 1 }` envelope; inside, `Steer` and `Profile` are trusted.

`render` keeps three WGSL pipelines: instanced vertex-color meshes (one draw per archetype, no sort, because the store is already partitioned), additive particle quads, and a parallax starfield. HUD is RN text. The mesh script emits `MeshSet`, a total `Record<Archetype, Mesh>` of positions, normals, colors, and indices. Adding an archetype fails the build until a mesh and a capacity exist. The bot is `(BotSnap) => InputFrame`. `gapBot` steers toward the widest gap ahead. `verifyAll` replays through `dispatch`. `checkMonotone` requires scrollSpeed, density, length, and wells to be non-decreasing along track rows, and boss hp and fire rate to be non-decreasing across the three bosses. Camera y is the rocket's y.

Interface depth: the shell's surface is `dispatch`, `render`, and `hear`. Hidden behind that are the tape compiler, the slot allocator, collision, the phase rules, the WGSL, and the audio graph. Exposed on purpose: the command union, the cue union, and the archetype list. Those are the domain vocabulary. Per encode-lessons-in-structure, the decade tuple, the total mesh record, and the total SFX record make a missing boss, mesh, or sound a compile error. Per make-operations-idempotent, every command except `tick` can run twice safely.

## Synthesis decision

Pending arena synthesis. This package is candidate 3 only.

## Tradeoffs accepted

- We accept one long `src/sim.ts` in exchange for a three-file trace from touch to pixels.
- We accept in-place store mutation in exchange for zero typed-array allocation during a tick.
- We accept O(n²) pair tests over the dense prefixes in exchange for not growing a spatial index the entity count does not need.
- We accept dropping leftover frame time after four catch-up steps in exchange for a bounded hitch. Replay is per tick, not per wall-clock frame.
- We accept lives-remaining stars in exchange for keeping star rules out of the difficulty table.
- We accept a rocket that holds the last steer after finger-up in exchange for one `Steer` value on every tick, including bot ticks.
- We accept AsyncStorage for one JSON blob in exchange for not standing up sqlite for a document we never query.
- We accept RN text for the HUD in exchange for not building a glyph pipeline beside the three mesh pipelines.

## Alternatives considered

- An object per entity, with a subclass per kind, lost on interface depth. Each kind would publish its own `update`, the renderer would sort into mesh batches every frame, and Hermes would allocate those objects for the life of the run. The caller would have to learn the class list to know what a tick does. The column store hides that behind `dispatch` and `readArchetype`.
- A multi-system ECS lost because it is temporal decomposition. Movement, weapons, and collision would each own a pass over the same store, and the path from touch to pixels would cross a scheduler plus those passes. `dispatch` keeps one writer and one file.
- Having the sim emit packed instance buffers lost because it leaks the GPU stride into the pure module the verifier imports. `readArchetype` leaves packing, pipelines, and particles in `src/render.ts`.

## Open questions and risks

- Are stars the lives remaining at the moment of a clear, or score gates that should live on the row?
- When the fragment prefix is full, is "emit explode and skip the split" the right overflow policy?
- Boss rows only carry hp, fire rate, pattern, and speed. If the third boss needs scripted phases, do we extend `BossDef` with a phase list before anyone branches on the level index inside `step`?
- Column views are live `Float32Array`s. `readonly` will not stop an index write. Is the "drop views before the next dispatch" rule enough, or should `readArchetype` copy?

## Next implementation step

Fill `LEVELS` and `dispatch` in `src/sim.ts`, then run `verifyAll(gapBot)` for level 0 in Node before replacing the spike's draw loop.
