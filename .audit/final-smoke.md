# Final smoke, branch game, d38a059

Device 52721D7F-9573-4DFB-AC70-37FCE1B5AE20 (Trove Next QA iPhone 17, iOS 27). Metro from the pewpew-render worktree (pid 85591) was stopped with stop-metro, Metro restarted from this checkout on 8081, `expo run:ios` built with 0 errors. No stale RCT_jsLocation (defaults domain did not exist), nothing cleared. Fresh save (0 of 90 stars).

| # | Item | Result |
|---|------|--------|
| 1 | Audio engine on device | VERIFIED no error path. Audibility NOT VERIFIED (cannot be captured). |
| 2 | Manual steering after the coast fix | VERIFIED, drift 1.10 to 1.50 units (at the bound) |
| 3 | Full AUTO run, hash line | VERIFIED, `[pewpew] level 1 hash e9ab99ad steps 2701` |
| 4 | 45 s recording with touches | VERIFIED, with one deviation (hand steering about 10 s, not 15) |
| 5 | Pause, Settings, sfx off/on, back, resume | VERIFIED, no JS errors |
| 6 | Final log sweep | VERIFIED for JS (0 errors, 0 warnings). Native extras named below. |

## 1. Audio
- JS log after startup, a reload (to capture createAudio from the start), the Play tap and title music: 16 entries over the session, all level `log`. No error, no warning, nothing mentioning audio, AudioContext, AudioManager or `not implemented`. `createAudio` does not swallow errors, so a failure would have thrown at first render and shown a redbox. The title rendered.
- Native log (pid 89035): `Successfully installed JSI bindings for react-native-audio-api!` then `[AudioSessionManager] Configured audio session: category=AVAudioSessionCategoryPlayback, mode=AVAudioSessionModeDefault, options=0`, then CoreAudio built the aggregate device.
- Audibility: not capturable from the simulator and not claimed.
- Evidence: .audit/final-js-log.txt, .audit/final-native-audio.txt.

## 2. Steering
Rocket x is `globalThis.pewpew.world.player.x`. Each debugger-evaluate round trip costs seconds, so a 40 ms setInterval sampler on `globalThis.__tr` recorded x, vx, finger-down and tick, and I read it back after the three swipes. Swipes were 0.25 screen width, 300 ms, momentum false, on level 1 with a fresh save.

| swipe | x before | x at lift | x at rest | drift after lift | x 1 s after lift |
|-------|----------|-----------|-----------|------------------|------------------|
| 1 right | 0.000 | 2.219 | 3.316 | 1.10 | 3.314 |
| 2 left | 3.316 | 1.489 | -0.011 | 1.50 | -0.009 |
| 3 right | -0.011 | 2.084 | 3.362 | 1.28 | 3.360 |

"At lift" is the last finger-down sample, up to 40 ms before the true lift, so true drift is at most the figure shown. Coast settles in about 0.6 s (vx 7.6 to 0.003). Expected about 1.5 or less, and the maximum is 1.50. No wall pinning. Swipe 2 moves 3.3 units for a 0.25 width drag because the relative drag is anchored at the rocket, fine.

## 3. AUTO run
- First attempt was a by-hand run. A tool round trip let level 1 finish (3 stars, 530) before the AUTO tap landed on the Complete screen, so no hash was logged. That is correct behavior, the hash is logged only when every step came from the bot.
- AUTO persists across Retry. I turned it on from the pause menu, pressed Retry, and the bot-only run finished in about 35 s of wall time: `[pewpew] level 1 hash e9ab99ad steps 2701`, score 565, 3 stars. It matches .audit/verify-levels.txt line 6 (steps 2701, score 565, hash e9ab99ad).
- Screenshot: .audit/final-complete.png (1206 x 2622).
- Tick cost, auto: avg about 3.2 ms, p95 about 6.9 ms, max 11.5 ms over 600-frame windows.

## 4. Recording
- /Users/saeed/.t3/projects/pewpew/.argent/recordings/final-demo.mp4 (gitignored via .argent). 44.97 s, 7.4 MB, touches shown, trimStatic off.
- Flow: LEVELS from the level 1 Complete screen, level 2 from the select grid, AUTO toggled off (it persists), six hand swipes over about 10 s (the rocket lost two lives, so steering was rough, which is expected of scripted swipes), AUTO on, ran to the cap. Level 2 Complete appeared right at the cap.
- Deviation: hand steering was about 10 s, not 15, because the swipes were batched in one run-sequence.

## 5. Pause, Settings, sfx
Pause, Settings (MUSIC value 1, SFX value 1), SFX tap gave value 0, second tap restored it, BACK returned to the pause menu, RESUME, then Pause and Retry worked. No JS error. Natively there was one iOS 27 UIKit `DebugAssertion` (3 lines, level F) "Transformers don't support animations across multiple screens simultaneously" at 16:04:35, at the Settings to Pause transition. It comes from UIKit, not app code.

## 6. Final sweep
- JS console: 0 errors, 0 warnings. Metro terminal: only the bundle lines and `LOG` lines.
- Native extras, all outside the JS runtime (.audit/final-native-errors.txt):
  - Known acceptable: `Modifying properties of a view's layer off the main thread` on MetalView, 5 per load, from `applyCAMetalLayerColorSpace` in react-native-webgpu (the ctx.configure warning).
  - UIApplication statusBarStyle, statusBarFrame, setStatusBarStyle deprecation asserts (iOS 27, React Native status bar code).
  - CoreAudio simulator noise: `HALC_ProxyIOContext::IOWorkLoop: skipping cycle due to overload` twice, once per JS load while the Metal setup and audio start together. Also `MEMixerChannel GetParameters unimplemented for param 14`, `EnhanceDialogueProcessor` no tuning.
  - The UIKit Transformers assertion above, `RCTScrollViewComponentView implements focusItemsInRect`, a BoardServices PointerUI XPC note, and 8097 connection refused (React DevTools port, no DevTools running).
- The IOWorkLoop overload is the only one that touches the audio path. It is a simulator log at startup, not an app error, and I cannot tell from here whether it causes an audible glitch.

## Housekeeping
- Metro left running on 8081 from /Users/saeed/.t3/projects/pewpew (log /tmp/pewpew-metro.log).
- Simulator server for the device stopped. Debugger session left connected until the server stop.
- decisions.tsv already had two uncommitted `review` rows (12:02:56Z and 12:04:28Z) that another agent had appended in this checkout before my rows. They are included in the "audit: final smoke" commit because they live in the same file.
- The 12:04:28Z row says a cleanup merge (3a96407) was deferred until this smoke finished, so the device ran d38a059, not the comment-sweep branch.
