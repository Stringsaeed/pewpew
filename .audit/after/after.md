# After the fix waves: simulator re-measure against the baseline

Taken 2026-10-13 07:19 to 07:24 (Asia/Dubai) on `game` at bdb34a0 (waves 0, 1 and 2 merged), iPhone 17 simulator (52721D7F), dev build from Metro 8081, host M2 Max. Same method as `.audit/baseline/baseline.md`: the app's own 600-frame tick windows, a 10 s rAF probe through `debugger-evaluate`, and `sample.sh` (ps every 1 s plus top) on the app pid. Host contention was comparable to the baseline session: a second simulator (iPhone 17e) with its own copy of the app was running throughout.

## Frame rate and tick

| Scenario | rAF fps | p50 ms | p95 ms | max ms | frames > 20 ms | frames > 33 ms | tick avg ms (windows) | tick p95 ms (windows) |
|---|---|---|---|---|---|---|---|---|
| Level 1 AUTO, after | 60.04 | 16.75 | 21.42 | 25.56 | 69 | 0 | 3.55 / 3.95 / 4.51 / 4.31 | 6.09 / 6.76 / 7.72 / 7.86 |
| Level 1 AUTO, baseline | 59.99 to 60.06 | 16.68 | 19.01 to 19.04 | 22 to 28 | 18 to 23 | 0 | 2.61 / 3.36 | 5.27 / 5.25 |
| Level 10 boss AUTO, after | 59.66 | 16.67 | 19.85 | 48.42 | 27 | 2 | 4.04 to 4.31 (7 windows) | 6.00 to 6.35 |
| Level 10 boss AUTO, baseline | 60.00 | 16.67 to 16.74 | 16.99 to 19.07 | 18 to 22 | 0 to 15 | 0 | 3.42 / 3.46 | 5.49 / 5.69 |
| Level 30 AUTO, after | 60.04 | 16.91 | 25.04 | 30.86 | 125 | 0 | 4.07 to 4.47 (8 windows) | 7.40 to 9.71 |
| Level 30 AUTO, baseline | 59.98 to 60.09 | 16.73 to 16.80 | 22.06 to 22.40 | 24 to 25 | 91 to 96 | 0 | 3.56 / 3.71 | 7.33 / 7.36 |

The boss probe's 48 ms max and two frames over 33 ms fall on the boss death and the level-clear transition (boss death blasts, the save write, and the screen switch), which the probe window overlapped; the baseline's boss probe ended before the kill.

## CPU and memory

| Scenario | CPU % of one core, ps mean (after) | CPU % top mean (after) | top MEM (after) | CPU % ps mean (baseline) | top MEM (baseline) |
|---|---|---|---|---|---|
| Level 1 AUTO | 42.3 | 40.9 | 269 to 271 MB | 32.9 | 318 to 320 MB |
| Level 10 boss AUTO | 39.3 | 31.3 | 280 to 281 MB | 40.7 | 327 to 340 MB |
| Level 30 AUTO | 47.3 | 43.6 (max 52.4) | 282 MB | about 39 to 41 | 331 to 345 MB |

RSS from ps is not comparable across sessions (host paging); top's footprint is the memory figure, as in the baseline.

## Determinism

Device hashes under AUTO: level 10 `23c74b19` (4428 steps), level 30 `51ab16b2` (7008 steps). Both equal `scripts/verify-levels.golden.txt`. Level 1 was started by hand in an earlier smoke, so its device hash was not logged this session; the wave-1 smoke logged it as `e9ab99ad`. Zero JS errors in the argent log (24 entries).

## Reading

- Still 60 fps everywhere. The JS tick grew by about 0.8 to 1.0 ms per frame (25 to 30 percent) across all three scenarios. That is the game-view pass: two-octave nebula and speed lines, hit flashes, shockwave rings, muzzle flashes, the shield bubble, boss sparks and smoke, and the hemisphere lighting.
- Level 30 is the one to watch: tick p95 sits at 8.6 to 9.7 ms in six of eight windows, against the 9 ms bar the game-view unit used, and rAF frames over 20 ms rose from about 95 to 125 per 10 s. The cheapest lever is `NEBULA_OCTAVES` in `src/render/look.ts` (2 today; 1 drops a full-screen noise octave).
- Memory footprint is lower than the baseline by about 50 MB in every scenario. The sessions differ in length and host state, so treat it as "no regression", not as a win.
- CPU is up by about 5 to 9 points on levels 1 and 30, consistent with the tick growth; the boss scenario is flat.

## Files

- `play-level1.png`, `play-level10-boss.png`, `play-level30.png`: full-resolution after pictures (compare with `.audit/baseline/screens/play-*.png`).
- `raw/after-*.ps.csv`, `raw/after-*.top.txt`: the samples.
