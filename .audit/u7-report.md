# U7 report. Integrate sim, renderer, and shell on the device

Branch `u6-screens` in `/Users/saeed/.t3/projects/pewpew-screens`. Device iPhone 17 Pro sim `481B49F7-2989-405B-809C-DA3178DB220D`, Metro 8082 (already running from this worktree, reused). No native rebuild was needed. Every JS change shipped by `debugger-reload-metro`.

## Who this is for

A player now flies the real game on the phone. The real sim, the real WebGPU renderer, and the screens run together. A QA engineer gets an AUTO switch on the HUD and an UNLOCK ALL button in Settings, both dev-only. Each AUTO run prints a hash that must equal the Node verifier. The next engineer inherits one place to delete once audio is merged (`src/dev/silentAudio.ts`), and a hash line that turns any Hermes vs V8 drift into a visible mismatch.

## Steps

1. **Stubs out.** VERIFIED. `App.tsx` imports `createWorld, step, hudOf, dragInput` from `src/sim` and `createRenderer` from `src/render`. `src/ui/stubs.ts` is deleted. `src/dev/silentAudio.ts` returns a no-op `AudioEngine` only when `createAudio` throws `'not implemented'`. `npm run typecheck` exit 0, `npm test` 30/30, `npm run verify` PASS with rows 1, 10, 30 unchanged.
2. **Dev helpers.** VERIFIED on device. AUTO (HUD, `accessibilityRole="switch"`) makes the tick call `greedyBot(world)` before every sim step, exactly as `simulate()` does. UNLOCK ALL writes one star on levels 1 to 29 through `recordRun`, so real records survive and a second press changes nothing. Level select then showed all 30 open. At the end of a run whose every step was bot-driven, the shell logs `[pewpew] level <n> hash <hex> steps <n>` from the exported `hashWorld`. Everything sits behind `__DEV__`; release passes `undefined` to the Hud and Settings props, so neither control renders.
3. **Manual play, level 1.** `.audit/int-play-manual.png`, trace `.audit/int-steer-trace.txt` (16 ms samples of `player.x` and `input.targetX` through a dev-only `globalThis.pewpew` handle).
   - Half-screen drag. The target moves 5.6 units, which is 62% of the 9-unit track and 70% of the rocket's 8-unit range (DRAG_GAIN 11.25 per screen width). From the centre a half-screen drag pins the rocket on the wall. Measured.
   - Lag. The sim saw the first move one frame after touch-down (sample 5479 ms to 5513 ms). The rocket then trails a fast finger by up to 2.4 units because of the 9 u/s speed cap, and settles about 300 ms after the finger stops. Measured. It reads as weighty, not laggy. Guess, not a human playtest.
   - Lift. The rocket keeps its position only if it had already arrived. Released mid-move, it coasts. COAST multiplies vx by 0.985 per step (0.40 per second), so a release at full speed drifts about 10 units. Swipe 2 released at x = -1.05 heading for -1.63 and slid to the wall at -4.0. Swipe 5 overshot its target by 1.1 units. Measured. This is the one feel problem I found. It is a product call, so I did not change the sim. greedyBot never coasts, so raising the coast damping would not move any verifier hash; only idleBot results would change. Inferred from `bot.ts`.
4. **AUTO level 1.** VERIFIED. On a fresh save (cleared through `nativeModuleProxy.RNCAsyncStorage.multiRemove`), level 1 under AUTO logged `level 1 hash e9ab99ad steps 2701`. The verifier row is `e9ab99ad`, 2701 steps, score 565, 3 stars. The Complete screen shows 565 and 3 stars (`.audit/int-complete.png`). Level select shows level 2 open with 0 stars and level 3 locked (`.audit/int-unlocked.png`). Hermes and V8 agree bit for bit, so no divergence hunt was needed.
5. **Bosses.** VERIFIED. Level 10 (warden) logged `23c74b19` in 4428 steps against verifier `23c74b19` in 4428 steps (score 2065, 3 stars). Level 30 (core) logged `51ab16b2` in 7008 steps against verifier `51ab16b2` in 7008 steps (score 7375, 2 stars). Screenshots are `.audit/int-boss.png`, `.audit/int-boss-complete.png` (frame 14 s of the recording), `.audit/int-boss30.png`, and `.audit/int-boss30-complete.png`.
6. **Performance.** VERIFIED against the 8 ms target, on the simulator in a dev build. The tick covers sim steps, greedyBot, `renderer.frame`, audio, and the HUD bail-out. React commits that `setHud` schedules run outside it.
   - Level 10 AUTO. Seven 600-frame windows. Average 2.41 to 3.26 ms. p95 4.12 to 4.82 ms. Worst frame 8.28 ms.
   - Level 30 AUTO. Eleven windows. Average 3.04 to 3.41 ms. p95 4.62 to 6.93 ms. One frame at 16.30 ms.
   - The windows log exactly 10.0 s apart, so rAF held 60 fps for the whole run. No profiling was needed. A Mac-hosted simulator is faster than a phone, so the phone margin is a guess.
7. **Recording.** `.argent/recordings/u7-level10-boss-auto.mp4` in this worktree. It is 24.2 s, 1206x2622, and 727 frames, covering the level 10 boss fight under AUTO, the wormhole, and the Complete screen. Argent saved it into the main checkout (`/Users/saeed/.t3/projects/pewpew/.argent/recordings/`) because that is the client's cwd. I moved it here and removed the empty `.argent` directory it created, so the main checkout's `git status` is clean again. The file is untracked and not committed (4 MB).
8. **Logs.** VERIFIED. `debugger-log-registry` reports 165 entries, all level `log`, with zero warnings and zero errors. Entries 0 to 137 are the earlier U6 session's stub logs. The known off-main-thread `ctx.configure` warning did not show up in the JS log at all.

## Sim and render fixes

One word in `src/sim.ts`. `hashWorld` is now exported so the device log uses the same FNV-1a as `simulate()` instead of a copy that could drift. `render.ts` and `flow.ts` are untouched.

## Deviations

- The tick timer logs every 600-frame window, not once per run. The first 600 frames of level 10 come before the boss, and the boss fight is the costly part.
- I added a dev-only `globalThis.pewpew` loop handle (one line in `App.tsx`). It made the steering trace and the AUTO state checks possible without extra UI.
- `.audit/int-boss-complete.png` is a frame taken from the recording. The live Complete screen for level 10 was gone before I captured it. The recording shows the LEVELS button in its pressed state at 17.2 s, 6 s after Complete appeared. None of my tool calls was touching the device then, and level 30's Complete screen stayed put for 40 s without input. So a touch from outside this session dismissed it. It was not the app. Evidence is the frames at 17.0 to 17.4 s.

## Open

- **Audio landed after my merge.** `game` now has `merge u5-audio` (2adaea3, 1a3f265, 0814c17), which this branch does not contain. I kept to my brief and did not merge it. To retire the fallback, merge `game`, change the App import to `import { createAudio } from './src/audio'`, call `createAudio()` in place of `createAudioOrSilent()`, and delete `src/dev/silentAudio.ts`. Then check on the device that sound plays and that `debugger-log-registry` stays clean.
- **Coast after release** (step 3) needs a product decision. You could raise the coast damping, for example to 0.9 per step (about 0.002 per second, so the rocket stops within roughly 0.15 units). Or you could keep the current momentum on purpose, because it is what gives wells their bite. Changing it affects idleBot outcomes only.
- `.argent/` is not in `.gitignore`, which belongs to another unit.

## Commits (on u6-screens, after merging game at 7bd68a6)

- c2ef434 App: real sim and renderer, silent audio fallback until audio lands; delete ui stubs
- 805d0cb dev: AUTO toggle (greedyBot input), UNLOCK ALL, run hash log, tick timer; export hashWorld
- be1e4f2 audit: manual play, auto complete, level 2 unlocked; level 1 hash matches verifier
- 368c0f0 dev: tick timer logs every 600-frame window, so boss fights are measured too
- 89111dc audit: boss fights on levels 10 and 30, hashes match the verifier
- c045895 audit: steering trace and u7 decision rows
- (this report)

## Files

- `App.tsx` is 295 lines (+45). It does the real imports, AUTO in the step loop, the botOnly flag, the tick timer, and wires the two dev props.
- `src/dev/silentAudio.ts` is 16 lines.
- `src/dev/qa.ts` is 33 lines. It holds `unlockAll`, `logAutoRun`, and `createTickTimer`.
- `src/ui/Hud.tsx` is 92 lines (+20). It renders the optional AUTO switch.
- `src/ui/Settings.tsx` is 46 lines (+5). It renders the optional UNLOCK ALL button.
- `src/sim.ts` changes by one word (`export`).
- `src/ui/stubs.ts` is deleted (-106).
- Decision rows are appended to `.audit/decisions.tsv` (`u7-integrate`, `u7-verify`).

## Playbook (Feature) and principles

- `how` skip: the subsystem was fully specified by `docs/architecture.md` and the unit brief.
- `architect` skip: one obvious shape. The shell already owns the loop, so the change is a per-step input choice.
- Throughput checkpoint. Blocking first step was the merge plus a green typecheck. There were no independent workstreams, because one simulator and one Metro are serial. Shared state is that simulator plus Metro 8082, owned by this unit alone. One worker, because common.md forbids subagents.
- Delegation skip: common.md forbids subagents. I owned the diff and reviewed it myself.
- Verify on the matching surface: done on the iPhone 17 Pro sim.
- Commits are small and ordered: stubs out, then helpers, then evidence.
- `interrogate` skip: nothing about the design is contested.
- Opening a PR skip: the coordinator merges.

Principles that changed a choice:

- **Prove It Works.** The cross-engine claim rests on the device's own log line compared against the verifier file. I read the video frame by frame instead of assuming the Complete-to-Levels jump was an app bug.
- **Fix Root Causes.** I traced that jump to a pressed LEVELS button instead of adding a guard to the flow.
- **Laziness Protocol.** I exported `hashWorld` rather than copying it, and built `unlockAll` from `recordRun` rather than writing new save logic.
- **Sequence Verifiable Units.** Each step ended in a device check and a commit before the next.
