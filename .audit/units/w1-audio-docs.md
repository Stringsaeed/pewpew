# W1-audio-docs: audio module naming, event lookup, docs placement

Worktree: /Users/saeed/.t3/projects/pewpew-audio, branch `w1-audio` from `game` after wave 0. No simulator needed.

Gates after every commit: `npm run check`.

Commit 1: `git mv src/audio.ts src/audio/engine.ts` and `git mv src/sound.ts src/audio/data.ts`, add `src/audio/index.ts` re-exporting the public API so `'./audio'` keeps resolving (App.tsx, scripts/render-song.ts, src/testing/fake-audio.ts, src/audio.test.ts). Move the test to `src/audio/audio.test.ts`. The native package stays loaded by a lazy plain `require('react-native-audio-api')` inside the default factory (Metro cannot bundle createRequire).

Commit 2: replace the `sfxIdFor` switch in the engine (it mirrors `EVENT_SFX` case by case) with a single typed lookup against `EVENT_SFX`, keeping `EVENT_SFX` an exhaustive mapped type over the SimEvent `e` tags, so a new SimEvent fails typecheck in exactly one place. All 13 audio tests must pass unchanged in behavior (adjust imports only).

Commit 3: `ampAt`, `pitchAt`, `cutoffAt` are used only by scripts/render-song.ts; move them next to their only caller or into `src/audio/data.ts` if they are pure data helpers, whichever keeps the engine smaller. Replace the `!` non-null assertions in the engine that assume `noUncheckedIndexedAccess` with explicit checks or typed tuples (tsconfig does not enable that flag).

Commit 4: docs placement. `git mv docs/leaderboard.md docs/design/leaderboard.md` (it is untracked on `game`; if it is absent in this worktree, copy it from /Users/saeed/.t3/projects/pewpew/docs/leaderboard.md first) and add a `Status: design, not built` line at the top. Fix any links in docs/architecture.md that point at moved files (sound.ts, audio.ts, .audit/u2-ramp-sweep.ts now scripts/ramp-sweep.ts). Add a `render-song` usage line to docs/architecture.md where the audio pipeline is described.

Rules: no behavior change in the engine, no new dependencies, nothing outside `src/audio/`, `src/testing/fake-audio.ts`, `scripts/render-song.ts`, `docs/`, and the import lines in App.tsx.

Report: commits, `npm run check` tail, the list of moved files.
