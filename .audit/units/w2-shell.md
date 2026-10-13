# W2-shell: extract the app shell from App.tsx and wire the design props

Worktree: /Users/saeed/.t3/projects/pewpew-sim (reused), branch `w2-shell` from `game` after wave 1 (sim is `src/sim/`, render is `src/render/` with a fake GPU and snapshot test, audio is `src/audio/`, the menu design pass landed with `// TODO(W3)` optional props).
Device: iPhone 17 simulator udid 52721D7F-9573-4DFB-AC70-37FCE1B5AE20, Metro port 8081 from this worktree (kill any stale 8081 Metro first). Bundle id com.saeed.pewpew. Argent MCP rules: read ~/.claude/skills/argent-device-interact/SKILL.md first, describe before every tap, never tap from screenshot coordinates, stop the simulator server for this udid only when done.

Read first: .audit/arch-audit.md finding F1 and the "App loop seam" test list, App.tsx, src/flow.ts, src/save.ts, src/sim/index.ts (public API), src/render/index.ts (Renderer interface), src/audio/index.ts, src/dev/qa.ts, src/ui/* (look for every `TODO(W3)` prop), .audit/design-audit.md items A3, B1 (rapid countdown), C8 (game over progress and best), D4, D5.

## Part 1: extraction (no behavior change, one commit each)

```
src/shell/loop.ts          Loop record, createLoop(), resetRun(loop, run), advance(loop, now, sinks), press/drag/release input writers. Pure, no React, no GPU. `sinks` is { render(world, events, alpha, dt), audio(events), ended(ev), hud(next) }.
src/shell/loop.test.ts     dt clamped to 0.1 s; at most MAX_STEPS_PER_FRAME steps then the accumulator drops; events reach render and audio before they are cleared; `won` reaches `ended` exactly once; a human step clears botOnly; a paused loop renders but never steps; hud sink only called when hudOf returns a new object.
src/shell/useGpu.ts        adapter and device request, the zero-layout retry, rAF ownership, renderer create and dispose; takes the pixel ratio from one place.
src/shell/useSave.ts       loadSave once, commitSave (ref plus state plus writeSave).
src/shell/useAudioLifecycle.ts  AppState foreground tracking, active(), menu music on menu screens, mix from save toggles.
src/ui/Screens.tsx         the screen -> component routing JSX currently in App.tsx, taking the screen, save, hud, and callbacks as props.
src/dev/qa.ts              add createDevTools(loop, ...) that owns the AUTO toggle, UNLOCK ALL, the tick timer, logAutoRun, and the globalThis.pewpew handle; App calls it only under __DEV__ in one place.
App.tsx                    wiring only, target under 100 lines.
```

`loop.playing` must have exactly one writer. `auto` must exist once (on the loop) with the React state derived for the HUD chip. Keep `Loop` mutable; that is the frame budget contract.

## Part 2: wiring the design props (one commit each, after Part 1)

- D4 level intro card: when the hud goes from null to set for a new run key, Screens shows `SECTOR n · LEVEL m` (or a WARNING variant on boss levels) for 1.2 s then fades; the UI component may already exist from W1-ui under a TODO(W3) prop, otherwise add it in src/ui/.
- C8: pass `best` to GameOver and the last `hud.progress` as `reached`.
- B1: pass the rapid time remaining (from `world.player.rapidUntil` and `world.tick`, both on the readonly WorldView) to the Hud as a 0..1 fraction so the RAPID chip can drain.
- A3 death and victory beat: on `won` or `lost` do not dispatch `ended` immediately. Call `renderer.hold(kind, seconds)` if the renderer exposes it (optional chaining, it lands in the parallel game-view unit), keep the terminal world alive, pass `dt * 0.3` to render during the hold (slow motion is renderer-only), and dispatch `ended` after 1.0 s on a loss or 1.4 s on a win. The sim is terminal so it emits nothing more; determinism is untouched. The save is still recorded at the moment of `won`, not after the hold.
- D5 reduce motion: read `AccessibilityInfo.isReduceMotionEnabled()` plus its change event, pass it to `renderer.setReduceMotion?.(on)` and to the Screens as a prop so panel zooms become fades.

## Gates and proof

- `npm run check` after every commit; the golden file never changes.
- Device smoke after Part 1 and again after Part 2: launch, play level 1 by hand for ten seconds with a held-still finger (steering must hold), pause, settings from pause, resume, background and foreground the app (home button then launch-app), finish level 1 with AUTO, confirm the save persisted by killing and relaunching, lose a level with AUTO off. Screenshots to `.audit/w2-shell/`. Read the JS log for zero errors and the `[pewpew] level 1 hash e9ab99ad` line.

Commit messages end with: Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>

Report: commits, `npm run check` tail, App.tsx line count before and after, loop test list, smoke evidence, anything skipped.
