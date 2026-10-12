# W1-sim: split src/sim.ts into src/sim/

Worktree: /Users/saeed/.t3/projects/pewpew-sim, branch `w1-sim` from `game` after wave 0. No simulator needed.

Gates after every commit: `npm run check` (typecheck, tests, verify with golden hashes, gen:meshes --check). The golden file `scripts/verify-levels.golden.txt` must never change in this task. Every commit is a cut-and-paste move with no behavior change.

Target layout (one commit per file extraction, in this order):

```
src/sim/index.ts    public API barrel; the only path other code imports ('./sim' keeps resolving)
src/sim/rules.ts    every tuning constant now at the top of sim.ts (STEP, TICKS_PER_SEC, TRACK_HALF_WIDTH, MAX_BODIES, COAST_DAMPING, BOLT_SPEED, FIRE_TICKS, PLAYER_X_LIMIT, PLAYER_RADIUS, ...)
src/sim/math.ts     mulberry32, sinT, cosT, clamp, PI: the determinism kernel
src/sim/world.ts    World, Bodies, Player, Boss, Phase, SimEvent, WorldView and its @ts-expect-error proof, createWorld, pool add/remove
src/sim/input.ts    Input, COAST, dragInput, steerVelocity
src/sim/track.ts    compileTrack and Spawn/Track types
src/sim/drones.ts   DRONE_MOVES, driveX, droneClock
src/sim/boss.ts     bossPhase, runBoss, bossAttack
src/sim/step.ts     step() and its stages (steer, wells, spawn, fire, move, collide, despawn, transition)
src/sim/run.ts      Bot, RunResult, simulate, replay, hashWorld
src/sim/hud.ts      Hud, hudOf
```

Commit 1: `git mv src/sim.ts src/sim/step.ts`, add `src/sim/index.ts` re-exporting everything that was exported, fix the relative import of levels (`'../levels'`). Move `src/sim.test.ts` to `src/sim/sim.test.ts` and fix its imports and the Math-ban file list (it must glob `src/sim/*.ts`).
Commits 2 to 10: extract one file each in the order above. Internal helpers that only one file uses stay private; helpers shared between files are exported from their owner and imported, never duplicated.

Rules: no behavior change, no renamed identifiers, no reordered floating point operations, no new comments. `src/sim/index.ts` is the only module anything outside `src/sim/` may import. Check with `grep -rn "sim/" src App.tsx scripts | grep -v "src/sim/"` that no deep imports exist. Update the module map in docs/architecture.md in the last commit.

Report: commit list, `npm run check` tail, and confirmation that the golden file is unchanged (`git diff --stat game -- scripts/verify-levels.golden.txt` is empty).
