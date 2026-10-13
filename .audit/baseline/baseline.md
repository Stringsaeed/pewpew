# PewPew resource baseline (iOS simulator, dev build)

Date: 2026-10-12, 14:14 to 14:34 UTC. Branch `game` at `f018058`. No tracked files edited.

## Environment

| Item | Value |
|---|---|
| Simulator | "Trove Next QA iPhone 17", udid 52721D7F-9573-4DFB-AC70-37FCE1B5AE20. xctrace reports it as "Simulated iPhone 17", iOS 27.0 (24A434). Screens are 1206x2622. |
| App | com.saeed.pewpew, Expo dev build (`PewPew.debug.dylib`, Debug native code). JS bundle comes from Metro :8081 with `__DEV__` on. App pid 899 (from `ps -axo pid,command \| grep "52721D7F.*PewPew.app/PewPew"`). |
| Host | Apple M2 Max (`sysctl -n machdep.cpu.brand_string`), 12 cores, 32 GB, macOS 27.0.1 (26A434), xctrace 27.1 (27A9269) |
| Host load during the runs | 1-minute load average 6 to 14. A second booted simulator (iPhone 17 Pro, another worktree) was running its own PewPew (pid 35376). An Android emulator (qemu) was running. Memory was under pressure: 31 GB used, 11 GB in the compressor, 164 MB free. |

## Scenario tables

RSS comes from `ps`. MEM is top's physical footprint, which includes compressed pages. ps %CPU is a decaying average and top %CPU is the per-second value; both are per core, so 100% is one core. Each column shows min / mean / max. "JS frame ms" is the app's own tick timer (`createTickTimer` in `src/dev/qa.ts`, logged every 600 frames). It times the `tick()` call inside rAF: sim steps, bot, `renderer.frame` with WebGPU encode and submit, audio events, and `setHud`. It only runs while playing.

### 1. Title screen idle (20 s, 20 samples)
| Metric | min / mean / max |
|---|---|
| RSS MB | 566.7 / 572.3 / 574.8 |
| CPU % (ps) | 18.5 / 21.7 / 27.1 |
| CPU % (top) | 13.6 / 21.8 / 26.0 |
| Threads | 25 to 28 |
| MEM (top) | 299 to 307 MB |
| JS frame ms avg / max | n/a (the timer runs only during play) |

### 2. Level select idle (20 s, 20 samples)
| Metric | min / mean / max |
|---|---|
| RSS MB | 421.4 / 426.7 / 429.9 |
| CPU % (ps) | 18.3 / 25.3 / 31.0 |
| CPU % (top) | 15.1 / 25.2 / 31.0 |
| Threads | 25 to 26 |
| MEM (top) | 315 to 322 MB |
| JS frame ms avg / max | n/a |

### 3. Level 1 playing, AUTO (20 s, 20 samples, starting about 4 s into a bot-only run)
| Metric | min / mean / max |
|---|---|
| RSS MB | 549.2 / 553.8 / 559.0 |
| CPU % (ps) | 22.5 / 32.9 / 40.3 |
| CPU % (top) | 16.2 / 34.3 / 42.0 |
| Threads | 26 to 27 |
| MEM (top) | 318 to 320 MB |
| JS frame ms avg / max | windows 1 and 2: 2.61 / 9.77 and 3.36 / 12.87. Windows 3 and 4: 3.52 / 10.50 and 3.42 / 9.39. |

### 4. Level 10 boss phase, AUTO (26 samples from two runs, all taken while the boss was on screen)
With AUTO the boss phase lasts only 13.3 s (tick 3540 to 4338). A JS watcher recorded the exact start and end of each boss phase. I sampled across two full level-10 runs (B and C) and kept only the samples that fell inside a boss phase, 13 from each run. There is no contiguous 20 s window.

| Metric | min / mean / max |
|---|---|
| RSS MB | 449.6 / 479.9 / 529.5 |
| CPU % (ps) | 33.0 / 40.7 / 48.6 |
| CPU % (top) | B: 34.6 / 41.1 / 44.8. C: 34.0 / 39.1 / 43.5. |
| Threads | 25 to 27 |
| MEM (top) | 327 to 340 MB |
| JS frame ms avg / max | Window 7 is frames 3600 to 4200, the only full window inside the boss. Run A: 3.39 / 11.73. Run B: 3.46 / 10.46. Run C: 3.42 / 8.97. |

For reference, the level 10 fly phase before the boss (run B, 51 samples): RSS 505 / 539 / 569 MB, CPU 25.8 / 36.4 / 44.7 %.

### 5. Level 30, AUTO (fly phase, 20 s, 20 samples, 2 to 22 s into the run)
| Metric | min / mean / max |
|---|---|
| RSS MB | 476.7 / 484.2 / 487.7 |
| CPU % (ps) | 31.2 / 38.8 / 45.0 |
| CPU % (top) | 25.2 / 38.1 / 42.2 |
| Threads | 27 |
| MEM (top) | 331 to 334 MB |
| JS frame ms avg / max | windows 1 and 2: 3.56 / 9.64 and 3.71 / 9.59. Windows 3 to 11 of the same run: avg 3.01 to 3.81, max 8.91 to 19.23. |

### 6. Paused during level 30 (20 s, 20 samples)
| Metric | min / mean / max |
|---|---|
| RSS MB | 336.5 / 337.8 / 344.6 |
| CPU % (ps) | 5.2 / 10.8 / 13.8 |
| CPU % (top) | 5.1 / 11.1 / 14.3 |
| Threads | 26 |
| MEM (top) | 344 to 345 MB |
| JS frame ms avg / max | n/a (the timer stops while paused) |

### Summary
| Scenario | RSS MB min/mean/max | CPU % min/mean/max (ps) | Threads | JS frame ms avg / max |
|---|---|---|---|---|
| 1 Title idle | 566.7 / 572.3 / 574.8 | 18.5 / 21.7 / 27.1 | 25-28 | n/a |
| 2 Level select idle | 421.4 / 426.7 / 429.9 | 18.3 / 25.3 / 31.0 | 25-26 | n/a |
| 3 Level 1 AUTO | 549.2 / 553.8 / 559.0 | 22.5 / 32.9 / 40.3 | 26-27 | 2.61-3.52 / 12.87 |
| 4 Level 10 boss AUTO | 449.6 / 479.9 / 529.5 | 33.0 / 40.7 / 48.6 | 25-27 | 3.39-3.46 / 11.73 |
| 5 Level 30 AUTO | 476.7 / 484.2 / 487.7 | 31.2 / 38.8 / 45.0 | 27 | 3.56-3.71 / 9.64 |
| 6 Paused (level 30) | 336.5 / 337.8 / 344.6 | 5.2 / 10.8 / 13.8 | 26 | n/a |

## FPS

The rAF rate measures how often the JS thread gets a frame callback. It does not measure display refresh, and the simulator caps it at 60 Hz. Each rAF row is one 10 s probe (`debugger-evaluate`, the coordinator's expression). Results were stashed on `globalThis` and read back, because the evaluate tool does not await promises. In scenario 4 a watcher started each probe at the moment the boss entered, so the boss was on screen for the whole window. Each probe overlapped the ps sampling for its scenario.

The tick columns come from the app's 600-frame windows. Log-interval FPS is 600 divided by the seconds between two consecutive window lines; the timestamps are argent's receive times with ms resolution.

| Scenario | rAF fps | p50 ms | p95 ms | max ms | frames > 20 ms | frames > 33 ms | tick avg ms | tick p95 ms | tick max ms | log-interval fps |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 Title idle, probe 1 | 60.06 | 16.67 | 17.48 | 19.84 | 0 | 0 | n/a | n/a | n/a | n/a |
| 1 Title idle, probe 2 | 60.08 | 16.66 | 17.79 | 25.60 | 6 | 0 | n/a | n/a | n/a | n/a |
| 3 Level 1 AUTO, probe 1 / window 1 | 59.99 | 16.69 | 19.01 | 27.67 | 23 | 0 | 2.61 | 5.27 | 9.77 | 59.99 (10.001 s) |
| 3 Level 1 AUTO, probe 2 / window 2 | 60.06 | 16.68 | 19.04 | 22.14 | 18 | 0 | 3.36 | 5.25 | 12.87 | 59.98 (10.004 s, w2 to w3) |
| 4 Level 10 boss AUTO, run B / window 7 | 60.00 | 16.74 | 19.07 | 22.39 | 15 | 0 | 3.46 | 5.49 | 10.46 | 60.00 (10.000 s, w6 to w7) |
| 4 Level 10 boss AUTO, run C / window 7 | 60.00 | 16.67 | 16.99 | 18.13 | 0 | 0 | 3.42 | 5.69 | 8.97 | 60.01 (9.998 s, w6 to w7) |
| 5 Level 30 AUTO, probe 1 / window 1 | 60.09 | 16.80 | 22.40 | 25.12 | 91 | 0 | 3.56 | 7.33 | 9.64 | 60.00 (10.000 s) |
| 5 Level 30 AUTO, probe 2 / window 2 | 59.98 | 16.73 | 22.06 | 24.41 | 96 | 0 | 3.71 | 7.36 | 9.59 | 60.00 (10.000 s, w2 to w3) |
| (extra) Level 30 boss AUTO | 59.78 | 16.73 | 21.21 | 44.90 | 55 | 1 | 3.01 / 3.60 (w10/w11) | 6.55 / 6.97 | 17.17 / 19.23 | ~60.0 |

Notes:
- The two scenario-4 rows come from separate runs. The boss phase (13.3 s) holds only one full 600-frame window, so two consecutive in-boss windows cannot exist. A third run (A) gave window 7 = 3.39 / 6.41 / 11.73.
- Level 30 has about five times as many rAF frames over 20 ms as level 1 (91 to 96 vs 18 to 23), yet the mean rate stays at 60. That points to jitter, not dropped frames. Tick p95 is also higher on level 30 (7.3 ms vs 5.3 ms).
- The level-30 boss probe overlapped the host-side export of the native profile (heavy host CPU), which likely explains its 44.9 ms max.

## Native profiler (scenario 5, level 30 AUTO)

`native-profiler-start` (with `app_process: PewPew`, because a second app, TroveNext, was running on the device) -> about 15 s -> `native-profiler-stop` -> `native-profiler-analyze`. The profiler ran successfully. Things to know about the run:
- Argent recorded the Time Profiler template with `--all-processes`, which is host-wide. I filtered the samples to pid 899.
- The recorded span is 21.4 s, because of the stop latency.
- The export after stop took about 3.5 minutes. Level 30 finished during it.
- `native-profiler-analyze` reported "All clear — no CPU hotspots, UI hangs, or memory issues", with no per-symbol detail. The breakdown below comes from parsing the exported time-profile XML myself (`parse_timeprofile.py`, `drill_timeprofile.py`, `categorize_timeprofile.py`). Sampling is 1 ms.

PewPew used 8368 ms of CPU over 21.4 s, about 39% of one core (matches ps).

| Thread | CPU ms | Share of app CPU | What it is doing |
|---|---|---|---|
| JS thread (`com.facebook.react.runtime.JavaScript`, Hermes) | 4599 | 55.0% | Hermes interpreter (app JS) 72.5%, WebGPU via rnwgpu/Dawn 15.6%, audio API host objects 5.9%, Hermes GC 2.1%, Fabric commit 0.9%, other 3.1% |
| Audio thread (`AURemoteIO::IOThread`) | 2866 | 34.2% | 99.2% in react-native-audio-api `AudioContext::renderAudio` |
| Unnamed GCD worker threads (Metal) | 703 | 8.4% | Metal, MTLSimDriver and FramePacing 43.4%; other dispatch work 51% |
| Main thread | 125 | 1.5% | Run loop and UIKit update cycle; 12.8% of it is in `worklets::AnimationFrameBatchinator` (CADisplayLink) |
| `com.apple.audio.IOThread.client` | 38 | 0.5% | CoreAudio client |
| `hades` (Hermes background GC) | 33 | 0.4% | `HadesGC::OldGen::sweepNext` |

### JS thread (Hermes)
- 87.8% of samples are inside `TimerManager::callTimer`. RN routes `requestAnimationFrame` through TimerManager, so this is the game loop.
- Top self symbols: `Interpreter::interpretFunction` 1982 ms, `doGetByIdSlowPath_RJS` 273 ms (property lookups missing the inline cache), `toNumber_RJS` 76, `mathMin` 60, `GCBase::getCurrentIPSlow` 60, `handleCallSlowPath` 59, `memset_pattern16` 51, `readSignedLEB128` 47, `makeA<Environment>` 45 (closure allocation), `mathMax` 37.
- WebGPU calls, inclusive: `GPUQueue::submit` 138 ms (3.0%, of which Dawn `QueueBase::SubmitInternal` 131 and `metal::EncodeMetalRenderPass` 58), `GPUCanvasContext::present` 75, `getCurrentTexture` 73, `JSIConverter<GPURenderPassDescriptor>::fromJSI` 65, `beginRenderPass` 57, `writeBuffer` 34, `GPUTexture::createView` 21. Dawn records and submits Metal command buffers on the JS thread; there is no separate Dawn thread.
- Audio API calls from JS: `JsiHostObject::get` 98 ms, `createOscillator` 53, `createGain` 41, `createBiquadFilter` 25. New audio nodes are created per sound effect.
- Hermes GC: `HadesGC::youngGenCollection` 98 ms (2.1%).

### Audio thread (AURemoteIO::IOThread)
- Inclusive: `AudioNode::processAudio` 84.5%, `AudioParam::processARateParam` 59.5%, `AudioParam::getValueAtTime` 56.7%, `OscillatorNode::processNode` 46.1%, `ParamRenderQueue::computeValueAtTime` 40.3%, `GainNode::processNode` 30.8%, `PeriodicWave::getSample` 15.0%, `AudioGraphManager::preProcessGraph` 12.9%, `AudioParam::setValue` 11.8%, `BiquadFilterNode::processNode` 1.7%.
- Top self symbols are un-inlined libc++ templates: `std::less<float>` 129, `ParamRenderQueue::computeValueAtTime` 103, `PeriodicWave::doInterpolation` 94, `optional<RenderParamEvent>::__get` 90, `has_value` 87, `std::clamp` 76, atomic float store 75. This is a -O0 Debug native build, so the audio cost here is heavily inflated compared with Release.

### Main and Metal threads
- Main thread: `CA::Display::DisplayLink` -> `AnimationFrameQueue executeQueue` -> `worklets::AnimationFrameBatchinator::flush` (16 ms), plus dispatch-queue work. No hangs; the hangs table has no rows.
- Metal (unnamed GCD workers): `handleMainConnectionReplies` (MTLSimDriver) 117 ms, `_MTLCommandQueue _submitAvailableCommandBuffers` 92, `MTLSimCommandQueue submitCommandBuffers` 89, `FPCAMetalLayerState _updateLayerState` 61, `_MTLCommandBuffer didScheduleWithStartTime` 58, `CAMetalDrawable present` 24. This is the simulator's Metal proxy (MTLSim) overhead.

## GPU

- First attempt: `xcrun xctrace record --template 'Metal System Trace' --attach 899 --time-limit 10s --output /tmp/pewpew-gpu.trace` failed with `Cannot find process for provided pid: 899`. Without `--device`, xctrace looks for host processes.
- Corrected attempt, adding `--device 52721D7F-9573-4DFB-AC70-37FCE1B5AE20`: it recorded 10 s (40.8 s wall including save). There was one warning: "This configuration of instruments creates 1 table without a known input source." `xctrace export --input /tmp/pewpew-gpu.trace --toc` -> `raw/gpu-trace-toc.xml`.
- Contents:
  - `metal-gpu-intervals`: 65,207 rows. `metal-driver-intervals`: 42,152. `metal-command-buffer-completed`: 7,237. `metal-gpu-info`: 1 row.
  - Plus 22 kdebug tables, time-profile, hangs and signposts.
  - The app-level tables are empty: `metal-application-command-buffer-submissions` 0 rows, `metal-application-intervals` 0, `metal-gpu-counter-intervals` 0, `metal-current-allocated-size` 0.
- The GPU intervals cover the whole host. Simulator GPU work shows up under host `SimMetalHost` proxy processes, one per guest Metal client, with truncated names.
  - For this simulator, `SimMetalHost (Trove Next QA iPh` pid 36082 shows about 600 submissions in 10 s (Fragment 195.9 ms over 414 intervals, Vertex 22.9 ms over 571, Compute 17.9 ms over 607). That is about 237 ms of busy time in 10.39 s: 2.3% of the host GPU, about 0.4 ms per frame.
  - I attribute 36082 to PewPew because its rate matches 60 fps. This is an inference; the proxy name is truncated.
  - Its sibling, pid 36084, has about 5,600 small passes and looks like the guest compositor.
  - Full table: `raw/gpu-busy-by-process.txt`.
- Conclusion: that number is M2 Max GPU time after translation by the simulator's Metal proxy. It is not iPhone GPU time, and the simulator exposes no per-app GPU counters. GPU frame time has to come from a physical iPhone, using Xcode's GPU report or Metal System Trace.

## Screenshots (`.audit/baseline/screens/`, 1206x2622 PNG, scale 1.0)

- `title.png`
- `levels.png`: after UNLOCK ALL, all 30 tiles available
- `settings.png`
- `play-level1.png`: about 4 s into a bot-only level 1
- `play-level10-boss.png`: level 10 during the boss (warden) phase with the boss on screen and the boss health bar visible
- `play-level30.png`: about 4 s into level 30
- `pause.png`: level 30 paused
- `complete.png`: level 1 LEVEL CLEAR (3 stars, 565)
- `gameover.png`: level 30 with AUTO off and no steering, GAME OVER at 890

## Commands used

```sh
# app pid on this simulator only (the other booted sim also runs PewPew)
ps -axo pid,command | grep "52721D7F.*PewPew.app/PewPew" | grep -v grep          # -> 899
# per-scenario sampler: .audit/baseline/sample.sh <pid> <label> [seconds]
#   ps every 1 s:  ps -o rss=,%cpu=,%mem= -p 899 ; threads = $(ps -M -p 899 | wc -l) - 1
#   (macOS ps has no thcount column), in parallel with:
#   top -l <n+1> -s 1 -pid 899 -stats pid,cpu,th,mem,command
./sample.sh 899 s1-title 20 ; ./sample.sh 899 s2-levels 20 ; ./sample.sh 899 s3-level1-auto 20
./sample.sh 899 s4-level10-runB-full 85 ; ./sample.sh 899 s4-level10-runC-full 85   # trimmed to boss windows
./sample.sh 899 s5-level30-auto-full 30 ; ./sample.sh 899 s6-level30-paused 20
python3 -I stats.py <label> ; python3 -I window_stats.py <start_epoch> <end_epoch> <label>...
# native profiler (argent MCP): native-profiler-start {device_id, app_process: "PewPew"} -> ~15 s -> native-profiler-stop -> native-profiler-analyze
#   -> profiler-stack-query thread_breakdown; then:
python3 -I parse_timeprofile.py  <..._raw_cpu.xml> 899
python3 -I drill_timeprofile.py  <..._raw_cpu.xml> 899 <thread-substring> <frame-regex>
python3 -I categorize_timeprofile.py <..._raw_cpu.xml> 899
# GPU
xcrun xctrace record --template 'Metal System Trace' --attach 899 --time-limit 10s --output /tmp/pewpew-gpu.trace          # failed
xcrun xctrace record --template 'Metal System Trace' --device 52721D7F-9573-4DFB-AC70-37FCE1B5AE20 --attach 899 --time-limit 10s --output /tmp/pewpew-gpu.trace
xcrun xctrace export --input /tmp/pewpew-gpu.trace --toc
xcrun xctrace export --input /tmp/pewpew-gpu.trace --xpath '/trace-toc/run[@number="1"]/data/table[@schema="<schema>"]'
python3 -I gpu_by_process.py /tmp/pewpew-gpu-export/gpu-metal-gpu-intervals.xml
# host
sysctl -n machdep.cpu.brand_string hw.memsize hw.ncpu ; sw_vers ; xcrun xctrace version
```

Argent MCP tools used: list-devices, restart-app, describe, gesture-tap, run-sequence, await-ui-element, await-screen-idle, screenshot (scale 1, includeImageInContext false), debugger-connect, debugger-evaluate (rAF probe, `globalThis.pewpew` world tick and phase reads, and a 50 ms boss-phase watcher, removed at the end), debugger-log-registry, native-profiler-start/stop/analyze, profiler-stack-query, and stop-simulator-server (this udid only).

## Raw files (`.audit/baseline/raw/`)

- `s*.ps.csv` and `s*.top.txt`: samples
- `fps.jsonl`: rAF probes
- `boss-windows.jsonl`: boss start and end epoch ms and ticks
- `js-console.log`: tick windows and bot hashes
- `s5-native-profile-pid899.txt`, `s5-drill-*.txt`, `s5-profile-categories.txt`, `s5-argent-profiler-report.md`: profiler breakdowns and argent's own report
- `gpu-*.xml` and `gpu-busy-by-process.txt`: GPU trace exports

The large files stay outside the repo: the trace is `/var/folders/4k/mlnwxj1d47x28dl1j4f57z900000gn/T/argent-profiler-cwd/native-profiler-20261012-142404.trace` (and `_raw_cpu.xml`), `/tmp/pewpew-gpu.trace`, and `/tmp/pewpew-gpu-export/`.

## Caveats

- **This is a dev build.** The JS comes from Metro with `__DEV__` on, so the tick timer and dev checks run. The native code is Debug (-O0): the audio thread's top symbols are un-inlined `std::less` and `optional::has_value`. Release CPU, especially audio, will be much lower.
- **This is the simulator on an M2 Max**, not iPhone hardware. CPU percentages are host-core percentages. The simulator caps rAF at 60 Hz.
- **The host was shared and under memory pressure.** The other simulator's PewPew and an Android emulator were running, the load average was 6 to 14, and about 11 GB sat in the compressor. Because of that, RSS swings between scenarios with the host's paging, not with app state (title 572 MB, level select 427 MB, paused 338 MB). Use top's MEM (physical footprint, 299 to 345 MB across all scenarios) as the memory figure. The footprint rose slowly from 299 MB to 345 MB over the 20-minute session; that is not enough evidence to call it a leak.
- **The title and pause screens are not idle.** The rAF loop calls `renderer.frame` every frame (with `world` null on menus, and with a frozen world when paused). Menu music plays on title and level select. That explains 22 to 25% CPU on the menus and 11% when paused.
- **Measurement overhead.** The rAF probe ran during the ps samples of scenarios 1, 3, 4 and 5. A 50 ms `setInterval` watcher ran during the level 10 and level 30 runs. The CDP debugger stayed attached and argent's simulator-server was capturing.
- **Scenario 4 is short by design.** The boss phase lasts about 13.3 s with AUTO, so it uses two runs with 13 in-boss samples each instead of one 20 s window. Only one full tick window per run falls inside the boss.
- **The profiler run did not go quite as planned.** argent's analyzer reported no findings; the per-symbol attribution above is my own parse of its export. The profile ran about 21 s instead of 15 s, and the long export overlapped the level 30 boss.
- **The level 1 run is bot-only from step 0.** AUTO is a HUD toggle, so after turning it on in level 1 I used Pause -> RETRY. All bot runs matched `.audit/verify-levels.txt`: L1 e9ab99ad steps 2701, L10 23c74b19 steps 4428 (3 runs), L30 51ab16b2 steps 7008 (2 runs).
- **UI differs from the brief.** The title button is labelled PLAY, not START. UNLOCK ALL is in Settings, and AUTO is on the in-game HUD, not on level select.
- **A Metro "Refreshing..." banner appeared at about 14:33 UTC**, after all measurements and before the game-over capture. A file change outside this task triggered it, and app state survived.
