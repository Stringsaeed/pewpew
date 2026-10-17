# Measuring performance

PewPew has four ways to measure performance. Each answers a different question.

| Tool | Answers | Runs on | Time |
| --- | --- | --- | --- |
| `npm run bench` | Did a change make a frame's JavaScript slower? | Any machine, and CI for every release tag | about 2 min |
| `npm run perf:device` | How smooth is a real build on this device? | A phone, an Android emulator, or an iOS simulator | 5 to 15 min plus the build |
| `npm run verify` | Does one simulation step stay under its 2 ms budget? | Any machine, every CI run | seconds |
| Argent profilers | Why is it slow? | A dev build on a simulator | minutes, by hand |

The first two keep a record across releases. The last two catch a broken budget, or explain a number the first two
reported.

## Frame benchmark: `npm run bench`

`scripts/bench.ts` plays levels 1, 10, 20, and 30 on AUTO, three times each, through the app's own loop
(`advance` in `src/shell/loop.ts`) and the real renderer over a GPU that does nothing. It runs at 120 frames a second and
splits every frame into the `FRAME_TIMING` phases (`src/frameTiming.ts`).

- **What it measures:** JavaScript per frame. That covers the bot, the simulation, and the renderer's packing and encoding.
  It does not measure the GPU, the display, React, or audio.
- **Why Node runs without its JIT:** the npm script sets `--jitless`. Hermes on a phone has no JIT either, so the
  phases keep the same proportions as on a device: the bot costs about 15 times the renderer's packing on both. With
  the JIT a frame costs microseconds, and host load swamps the result. Without it, repeated runs agree within a few
  percent.
- **Spikes:** `avg` leaves out the slowest 1% of frames, and every figure is the median of the three runs. A busy machine
  stalls single frames for tens of milliseconds in any phase. `max` shows those stalls, and the regression check ignores it.
- **Comparing:** `npm run bench -- --out a.json`, then later `npm run bench -- --baseline a.json`. The second run adds a
  change column and exits 1 when a level's `avg` or `p95` rose more than 15% (`--max-slowdown 0.15`). Compare runs
  from the same machine only.

The `perf` workflow (`.github/workflows/perf.yml`) runs this for every pushed `v*` tag. It benchmarks the tag and the
previous `v*` tag on the same runner, writes the table to the run summary, and fails on a regression. Start it by hand
from the Actions tab to compare any branch with a ref of your choice.

## Device benchmark: `npm run perf:device`

A perf build is a Release build with `EXPO_PUBLIC_PERF=auto` (see `src/dev/qa.ts`). It plays level 1 four times by itself,
following `PERF_PLAN`. Two runs use the bot. The other two use no bot and no input, which is the closest to a player's
frame. Every 600 frames it logs the frame interval the display delivered, hitches (frames longer than 1.5 times the
median interval), JavaScript time by phase, and the Hermes heap.

```sh
# Android emulator or phone (needs JAVA_HOME pointing at JDK 17)
npm run perf:device -- --android emulator-5554 --label lowend-emulator --build
# iOS simulator
npm run perf:device -- --ios-sim <udid> --label iphone-17-sim --build
# iPhone, over USB or the same Wi-Fi network
npm run perf:device -- --ios-device <udid> --label iphone-16-pro-max --build
```

`--build` makes the perf build and installs it. Leave it out to rerun an installed perf build. The script launches the
app, waits for the plan to finish, and writes `perf/device/<version>-<label>.json`, `.md`, and `.log`. Pass
`--baseline perf/device/<older>.json` to add a change column. The script marks changes worse than 15% with ⚠ but does not
fail, because a device varies more from run to run than the headless benchmark.

For startup alone, `--startup 10` cold-launches the installed perf build ten times, stops each at its first frame, and
reports the median and range of bundle start to first frame and of `createRenderer`. Compare two builds by alternating
them on one freshly booted device (A, B, A, B), and wait a minute after each Android install: Android compiles a new
app in the background, and the emulator swaps once its memory fills, which slows launches several times over.

Reading the result:

- **hitches** and **worst frame** are what a player notices. Zero hitches means every frame arrived on time.
- **JS avg** against the frame budget (8.3 ms at 120 Hz, 16.7 ms at 60 Hz) is the headroom left.
- The **phases** table shows where JavaScript time goes. `acquire` grows when the GPU or the display falls behind.

### Limits of the emulator

An Android emulator is not a low-end phone. Its CPU cores run at the host's speed, and its GPU is translated to the host's
Metal. The `pewpew-lowend` AVD (2 cores, 2 GB, 720 × 1600, Android 37.2) limits core count, memory, and resolution,
but it cannot slow the CPU. Treat its numbers as a check that Android works and stays smooth on fewer cores. Only a
real budget phone can show real low-end headroom. Firebase Test Lab and BrowserStack rent real low-end Android phones
when one is not at hand.

The emulator also shares the Mac's CPU, so anything else the Mac does shows up as stalled windows. A window where `bot`,
which is pure JavaScript, costs several times its usual value was starved by the host, not slowed by the game. Close
other heavy apps, keep hands off the emulator during the run, and rerun when a window looks like that. `submit` costs
about 6 ms per frame on the emulator because every GPU call is translated to the Mac's Metal; on a phone it is a fraction
of a millisecond. The Android 37.2 image also restarts a broken UWB service every 5 seconds. Stop it before a run with
`adb root && adb shell stop vendor.uwb_hal`.

## After every release

1. Tag the released commit and push the tag: `git tag v1.2.0 <commit> && git push origin v1.2.0`. The `perf` workflow
   compares it with the previous tag.
2. Run `npm run perf:device` with `--build` on the iPhone and on the `pewpew-lowend` emulator, each with `--baseline`
   pointing at the previous release's file in `perf/device/`.
3. Commit the new `perf/device` files, so the next release has a baseline.

Start each device run from a cool, charged phone with other apps closed. Thermal throttling and Low Power Mode both
slow it down.
