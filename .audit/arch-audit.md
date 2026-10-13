# pewpew code-structure audit (branch `game`, f018058)

Produced by a read-only Opus agent on 2026-10-12. Spot-checked by the orchestrator: F3 (bot copies of sim constants), F4 (hand-copied DRONE_PATTERNS), and F2 (no golden hashes in verify) confirmed against the source.

**Baseline today:** `tsc --noEmit` 1.7 s; `npm test` 43/43 pass in 0.5 s; `npm run verify` PASS in 2.4 s. All 30 level hashes still equal `.audit/verify-levels.txt`.

## Verdict

1. At the module level the code is not scattered. `src/` has nine modules, each with one owner, and the import graph has no cycles: `levels.ts` imports nothing, `sim.ts` imports only `levels.ts`, and every UI import from the sim is type-only.
2. The scatter the owner feels is real in three places: App.tsx does seven jobs in one component and hides the frame loop inside a `useEffect` closure; a handful of rule numbers are copied rather than imported (bot, render, save, flow); the docs and the audit trail do not tell anyone where to make an edit.
3. sim.ts (697 lines) and render.ts (526 lines) are long but internally ordered. Splitting them pays off mainly for testing (render.ts cannot even be imported in Node today) and for giving boss, track and particle edits their own small files, not for line count.
4. Nothing that a framework would supply is missing. The fix is about 20 small commits, most of them mechanical. They are guarded by a golden-hash check that does not exist yet, so that check must land first.
5. docs/leaderboard.md plans a "sync driver in App.tsx" with tests against a fake backend. App.tsx has no test seam today, so the shell extraction has to come before leaderboard phase 2.

## Import graph (adjacency list; `(t)` = type-only import)

```
index.ts               -> App
App.tsx                -> flow, save, sim, render, audio, bot, dev/qa, ui/{Complete,GameOver,Hud,LevelSelect,Pause,Settings,Title,theme}
src/levels.ts          -> (none)
src/sim.ts             -> levels
src/bot.ts             -> levels, sim
src/flow.ts            -> levels(t), save, sim(t)
src/save.ts            -> AsyncStorage, levels(t), sim(t)
src/sound.ts           -> levels, sim(t)
src/audio.ts           -> levels, sim(t), sound, lazy require('react-native-audio-api')
src/render.ts          -> react-native(PixelRatio), react-native-webgpu(t), levels, meshes.gen, sim
src/meshes.gen.ts      -> (none)
src/dev/qa.ts          -> levels, save, sim
src/testing/fake-audio -> audio(t)
src/ui/Complete        -> levels, sim(t), Button, Panel, theme
src/ui/LevelSelect     -> levels, save, Button, theme
src/ui/Hud             -> sim(t), Rocket, theme
src/ui/Title           -> save(t), Button, theme
src/ui/{GameOver,Pause,Settings} -> Button, Panel, theme ; Button/Panel/Rocket -> theme
scripts/verify-levels  -> levels, sim, bot
scripts/render-song    -> sound, audio
scripts/gen-meshes     -> node only (writes src/meshes.gen.ts)
.audit/u2-ramp-sweep.ts-> levels, sim, bot   (NOT typechecked: tsc skips dot dirs)
tests: sim.test -> levels, sim, bot ; audio.test -> levels, sim, sound, audio, testing/fake-audio ; flow.test -> flow, save ; save.test -> save
```

Two edges look wrong but are not: render imports `ARCHETYPES` only to scale each mesh to its hit radius (render.ts:256), so what you see is what you hit; UI imports of `LEVELS` and `isUnlocked` are reads from the source of truth.

## Findings, ranked by how much they hurt editing

**F1. App.tsx is the one real tangle (high).** It holds the `Loop` record (24-37, 59), dev tools (11, 60-62, 107, 147, 190-193, 251, 269), save (47-48, 66-81), screen state plus a tap sound on every action (49-52, 83-86), the run-reset effect (93-105), audio and AppState lifecycle (109-132), device, canvas, rAF and the frame loop in one 77-line effect (134-210), touch input (212-220), and screen routing JSX (226-289).

Specific problems: `loop.playing` has three writers (94, 124, 144); `auto` exists twice, as React state (61) and as `loop.auto`, mirrored by an effect (107); `tick` (151-171) is a closure inside the effect, so the step cap, the accumulator drop (164), the order events reach render and audio, and `onEnded` cannot be tested; `renderer!` at 166 is only safe because of call order.

Fix: move the loop into a pure `src/shell/loop.ts` exposing `createLoop`, `resetRun`, `advance(loop, now, sinks)` and `press/drag/release`. Add `src/shell/useGpu.ts`, `useSave.ts` and `useAudioLifecycle.ts`. Move the routing JSX into `src/ui/Screens.tsx`, and gather the dev concerns behind `createDevTools(loop)`. App.tsx ends up at about 80 lines. Keep `Loop` mutable; that is correct for the frame budget.

**F2. There are no golden hashes, so no refactor is safe yet (high; blocks everything else).** verify-levels.ts:48 only checks that `replay` matches `simulate` within the same build. A move that reorders float operations would shift all 30 layouts while verify stays green, as long as the bot still wins. That would quietly break the "device hash = Node hash" proof (architecture.md:177) and make future leaderboard scores incomparable.

Fix: commit `scripts/verify-levels.golden.txt`, fail verify on any mismatch, and add `--update-golden` for deliberate tuning. A hash change in a diff then becomes the signal to bump the leaderboard version.

**F3. Rule numbers live away from their owner (medium-high).**
- bot.ts:11 `BOLT_SPEED = 28` copies sim.ts:26.
- bot.ts:12 `FIRE_PERIOD = 0.2` is sim's `FIRE_TICKS` (sim.ts:21) times `STEP`.
- bot.ts:4 `LANES` ±4 is the private `PLAYER_X_LIMIT` (sim.ts:13).
- The number 30 is spelled four ways: save.ts:13, flow.ts:65, levels.ts:107 and Complete.tsx:50 (`LEVELS.length`).
- A literal `60` appears at sim.ts:215, sim.ts:394 and verify-levels.ts:51.
- render.ts:136 `VISIBLE_HALF_WIDTH = 5.4` frames `TRACK_HALF_WIDTH` (4.5), which is exported from sim and used by nobody.
- render.ts:130-131 visual radii (rocket 0.8, boss 2.4) have no stated relation to the hit radii (0.35 and 1.4).

Fix: add `sim/rules.ts` and `LEVEL_COUNT`. Add a literal `TICKS_PER_SEC = 60`, and write `FIRE_TICKS / TICKS_PER_SEC` (exactly 0.2), not `12 * STEP`, so hashes stay bit-identical. Express the visual radii in render/look.ts relative to the hit radii.

**F4. `DRONE_PATTERNS` (sim.ts:445) is a non-exhaustive copy of the `DronePattern` union (medium; latent crash).** If a pattern is added to levels.ts:32, `DRONE_MOVES` still type-checks, `indexOf` returns -1, which is stored as 255 in a `Uint8Array`, and `DRONE_MOVES[undefined]` then throws mid-level.

Fix: define an `as const` tuple in levels.ts and derive the type from it. The order stays the same, so hashes are unchanged.

**F5. Render is untestable and owns half the canvas (medium).** render.ts:1 imports `PixelRatio` from react-native; importing render under tsx fails with "Unexpected typeof". Canvas sizing and `configure` run twice: App.tsx:181-184 and render.ts:312-327. `createRenderer` is one closure of about 370 lines (154-526).

Fix: inject the pixel ratio, let the renderer alone size the canvas, and split out the pure parts.

**F6. The docs have drifted and do not say where to edit (medium).** The architecture.md:14-27 snippet is not the shipped loop (no `MAX_STEPS_PER_FRAME`, no `commitSave`, gates on `screen.s`). :101 says draws use `firstInstance`; render.ts:502-506 deliberately avoids it. The module map (:57-70) leaves out dev/qa, testing/fake-audio, ui/* and render-song. :69 says gen-meshes imports the meshes types; it imports nothing from src.

Fix: correct these, and add a "Where to edit" table (tune a level, add a hazard kind, add a boss attack, add a sound, change a look).

**F7. Tooling gaps (medium).** The seed-tuning tool `.audit/u2-ramp-sweep.ts` is never typechecked, yet `--write-seeds` rewrites levels.ts. `render-song` has no npm script. The claim that gen-meshes reruns byte-identical is never checked. There is no single gate script and no CI, although there is a GitHub remote.

**F8. Audio naming and duplication (low-medium).** `audio.ts` and `sound.ts` are near-synonyms. `sfxIdFor` (audio.ts:184-203) mirrors `EVENT_SFX` case by case, so a new SimEvent needs edits in several files. `ampAt`, `pitchAt` and `cutoffAt` are used only by render-song. The `!` assertions assume `noUncheckedIndexedAccess`, which tsconfig does not enable.

Fix: rename to `audio/engine.ts` and `audio/data.ts`, and replace the switch with one typed lookup.

**F9. Dev code on the production path (low).** App.tsx:10-11 always imports `greedyBot` and `dev/qa`, and `__DEV__` checks appear at six sites, woven into the frame loop (190-193). F1's `createDevTools` fixes this.

**F10. `.audit/` (low).** It holds 49 tracked files and 4.3 MB of PNGs, and 20 of the 62 commits touch only it. The stale `*-sketch.ts.txt` files pollute grep. architecture.md cites five of its files.

## Opinions on the questions asked

**Splitting sim.ts: worth it.** The seams already exist as contiguous blocks: math (271-291), pool (293-318), boss (378-443), drones (445-471), collision (500-586), track compiler (629-697), run/replay/hash (204-269), hud (185-202). "Internals are file-local" becomes "internals are directory-local", enforced by a boundaries test. The Math-ban test (sim.test.ts:18) must also glob `src/sim/*.ts`.

**Splitting render.ts: worth it**, mainly so particles, camera and batching become pure, Node-testable code. Keep the WGSL inline, because Metro has no `.wgsl` loader.

**Unit suffixes: only for time fields.** Rename `attackEvery` to `attackEverySec` (8 BOSSES rows), and `rapidUntil`, `invulnUntil`, `fireAt` and `attackAt` to `…Tick`. About 25 edits, under an hour, no hash change. Skip the `LevelSpec` renames: each column already carries a unit comment (levels.ts:75-84) and `RAMP` forces classification. Renaming would widen all 30 rows and touch about 45 sites for little gain.

**Bodies columns: split two of the three.** Split `variant` into `look` and `pattern`. Split `param` into `anchorX` and `pull`. Keep `t`: it is a real per-body clock. Cost: two more 512-entry columns, `remove()` copying 15 columns instead of 13, about 15 edits (including render.ts:424 and :452). The hash does not depend on these columns, and the golden check guards it. Do it after the sim split.

## Tests

**Current setup:** tests sit next to their modules in `src/*.test.ts`, run with `node:test` via tsx, fakes in `src/testing/`. Keep this.

**Covered:** flow (11), save (7), sim (9 plus the Math ban), audio (13).

**Not covered:** render (no tests, cannot be imported in Node), the App shell, the `defineLevels` rejection paths, gen-meshes determinism, golden hashes, the bot (indirect only).

**Render test seam:** inject the pixel ratio, then add a ~60-line `src/testing/fake-gpu.ts` (recording device, encoder and pass, plus stubs for the `GPUBufferUsage`, `GPUShaderStage` and `GPUTextureUsage` globals). Tests: one `drawIndexed` per non-empty mesh; instance counts equal bodies per mesh; zero buffer or texture creation across 100 frames; a null world draws only stars and particles; `dispose` destroys every buffer. Before any split, snapshot the call log and instance arrays with `Math.random` stubbed. Every later render commit must reproduce that snapshot exactly.

**App loop seam:** test `advance(loop, now, sinks)` for `dt` clamped to 0.1 s; at most 4 steps per frame, then the accumulator drops (App.tsx:164); events reach render and audio before they are cleared; `won` fires `onEnded` exactly once; a human step clears `botOnly`; a paused loop renders but never steps.

## Tooling

- One gate script: `"check": "tsc --noEmit && npm test && npm run verify && npm run gen:meshes -- --check"`, under 6 s total.
- New npm scripts: `render-song`, and `sweep` for the moved ramp-sweep tool.
- CI: `.github/workflows/check.yml`.
- Lint: a zero-dependency `src/boundaries.test.ts` instead of ESLint, asserting that sim and levels import no react-native, ui, render, audio, save or flow; UI imports from sim are type-only; render imports no save, flow or audio; only the shell and dev/ import dev/; nothing deep-imports `sim/*` or `render/*`.
- Formatter: skip Prettier. It would reflow about 2,000 lines of dense tables.

## Docs

- `docs/architecture.md` stays the single place for the current shape. Each restructuring commit updates its own rows in the module map.
- Proposals go in `docs/design/` with a status line. Commit the untracked leaderboard doc as `docs/design/leaderboard.md`.
- The trail moves from `.audit/` to `docs/history/`. Keep the cited files: brief, decisions.tsv, u7-report, u2-ramp-sweep.txt, verify-levels.txt. Moving or deleting the PNGs and arena sketches (behind a tag such as `trail-2026-10`) is the owner's call.
- Move `u2-ramp-sweep.ts` to `scripts/ramp-sweep.ts`.

## Target tree

```
App.tsx                         wiring only: src/shell hooks + <Screens>, ~80 lines
index.ts                        registerRootComponent
src/levels.ts                   LEVELS, ARCHETYPES, BOSSES, RAMP, defineLevels, + LEVEL_COUNT, DRONE_PATTERNS
src/sim/index.ts                public sim API; the only sim path importable from outside
src/sim/rules.ts                every sim tuning number; bot and render import from here
src/sim/math.ts                 mulberry32, sinT/cosT, clamp, PI: the determinism kernel the ban guards
src/sim/world.ts                World/Bodies/Player/Boss/Phase/SimEvent types, WorldView + proof, createWorld, pool add/remove
src/sim/input.ts                Input, COAST, dragInput, steerVelocity: the one control model for human and bot
src/sim/step.ts                 step() and its stages: steer, wells, spawn, fire, move, collide, despawn, transition
src/sim/drones.ts               DRONE_MOVES, driveX, droneClock: a new pattern touches levels.ts + this file only
src/sim/boss.ts                 bossPhase, runBoss, bossAttack: boss edits stay out of step.ts
src/sim/track.ts                compileTrack: the only reader of density/mix/wells/pickups
src/sim/run.ts                  Bot, RunResult, simulate, replay, hashWorld: the headless proof harness
src/sim/hud.ts                  Hud, hudOf: the per-frame HUD projection
src/bot.ts, flow.ts, save.ts    unchanged roles
src/audio/engine.ts             createAudio + backend interfaces (was audio.ts)
src/audio/data.ts               PATCHES, SFX, SONGS, EVENT_SFX (was sound.ts)
src/render/index.ts             createRenderer: GPU resources, pipelines, pass encoding, resize, dispose
src/render/look.ts              LOOK table + visual radii stated against hit radii
src/render/wgsl.ts              uniform struct + stars/mesh/glow shaders
src/render/batch.ts             kind->mesh tables, counting sort, instance packing (pure)
src/render/particles.ts         particle pool, event->burst mapping, integration (pure)
src/render/camera.ts            view/projection uniforms (pure)
src/render/meshes.gen.ts        generated; only render reads it
src/shell/loop.ts               Loop, createLoop, resetRun, advance, press/drag/release (pure, tested)
src/shell/useGpu.ts             adapter/device, zero-layout retry, rAF, renderer create/dispose
src/shell/useSave.ts            load once, commitSave
src/shell/useAudioLifecycle.ts  AppState pause, active/menu-music/mix
src/ui/Screens.tsx              screen -> component routing (from App.tsx:226-289)
src/ui/*                        unchanged
src/dev/qa.ts                   + createDevTools(loop)
src/testing/fake-audio.ts, fake-gpu.ts (new)
src/leaderboard.ts, src/gamecenter.ts   reserved slots for the leaderboard design (not built)
scripts/verify-levels.ts (+ golden file), gen-meshes.ts (+ --check), render-song.ts, ramp-sweep.ts (moved)
docs/architecture.md (+ "Where to edit"), docs/design/leaderboard.md, docs/history/
.github/workflows/check.yml
```

## Migration plan

Every commit must pass typecheck, `npm test` and `npm run verify` (with the golden check from C2 onward). **R** marks a risky commit.

**Serial on `game`:**
1. C1: the Math-ban test covers `sim.ts` if present, plus `src/sim/*.ts` and `levels.ts`.
2. C2: golden hashes, checked in verify, with `--update-golden`.
3. C3: the `check`, `render-song` and `sweep` scripts, `gen:meshes --check`, and CI.
4. C4: `LEVEL_COUNT` and the `DRONE_PATTERNS` tuple (F3, F4).
5. C5 **R**: export the sim rule constants, add `TICKS_PER_SEC`, and have the bot derive its copies. The float-equality risk is covered by the golden check.

**Then in parallel worktrees** (files do not overlap; `'./sim'` and `'./render'` keep resolving through directory `index.ts` files):

- **W-sim:** C6 `git mv sim.ts sim/step.ts` plus a barrel, no code changes. C7 to C13: extract math, rules, world, input, track, boss+drones, run and hud, one per commit. **R** (this is the core), but every commit is cut-and-paste, guarded by golden, ban and the 9 sim tests.
- **W-render:** C14 **R**: inject `pixelRatio`, add fake-gpu, and snapshot-test the old single file. C15: `git mv` to `render/index.ts` and move meshes.gen.ts (generator output path). C16 to C19: extract look, wgsl, particles, camera and batch. The snapshot must not change. After C14 and C19: smoke-test level 1 on AUTO and a boss level on the simulator.
- **W-docs-audio (safe):** C20: move the trail, ramp-sweep and the leaderboard doc, fix links. C21: the audio rename and the `sfxIdFor` lookup.
- **W-shell** (after C14 merges, since both touch the App canvas lines): C22 `loop.ts` + tests. C23 **R** `useGpu`. C24 **R** `useSave` + `useAudioLifecycle`. C25 `Screens.tsx`. C26 `createDevTools`. After C23 and C24: device smoke run (launch, play, pause, background/foreground, complete, quit).

**Merge order:** W-docs-audio, W-render, W-sim, W-shell. Then serially: C27 `boundaries.test.ts`; C28 the time-unit renames (touch render.ts:455, so after the merges); C29 (optional) the Bodies column split; C30 architecture.md with the drift fixes and the "Where to edit" table.

## Leave alone

- `levels.ts` as one file. The `Decade` tuple, `RAMP` and `defineLevels` depend on it being one table.
- `WorldView` and its compile-time proof, the exhaustive tables, and the tracker format. They are what makes a bad edit fail loudly.
- flow.ts and save.ts. Each is under 75 lines, pure and well tested.
- The `ui/` components.
- The mutable `Loop` and the "no React state per frame" rule. That is a performance contract, not a mess.
- The mesh generator and its output format. Inline WGSL. Colocated `node:test` + tsx (no Jest).
- No ECS, Redux, state library or formatter reflow.
- `createAudio` as one engine. Only rename and move it.
