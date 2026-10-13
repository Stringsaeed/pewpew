# W1-ui: menu and HUD design pass (React side only)

Worktree: /Users/saeed/.t3/projects/pewpew-screens, branch `w1-ui` from `game` after wave 0.
Device: iPhone 17 Pro simulator udid 481B49F7-2989-405B-809C-DA3178DB220D, Metro port 8082 from this worktree (`npx expo start --port 8082`, the device already defaults to 8082 via RCT_jsLocation; if the app does not connect, `npx expo run:ios --device 481B49F7-2989-405B-809C-DA3178DB220D`). Bundle id com.saeed.pewpew. Argent MCP rules: read ~/.claude/skills/argent-device-interact/SKILL.md first, describe before every tap, never tap from screenshot coordinates, stop the simulator server for this udid only when done.

Read first: .audit/design-audit.md (the full audit, you are implementing sections B, C, D), .audit/baseline/screens/*.png (the before pictures), src/ui/*, src/ui/theme.ts, App.tsx (read only, you may not edit it in this task), docs/architecture.md.

Scope: only files under `src/ui/`. Reanimated 4 is already a dependency and may be used for enter and exit animations. RN 0.86 new architecture supports `boxShadow`, `experimental_backgroundImage` linear gradients, and `textShadow*` natively; use those instead of any new library. No new dependencies. Anything that needs App.tsx (level intro card, game-over progress, rapid countdown, reduce-motion plumbing, death-beat hold) is NOT in this task; leave a `// TODO(W3)` only where a prop is needed, and keep the prop optional so the current App compiles.

Items, in order, one commit each (effort from the audit in parentheses):
1. C2 neon glow language (1 h): primary buttons and panel borders get `boxShadow: '0 0 18px <tint>73'`; panel titles and the logo get a text shadow in their tint; the logo gets a magenta copy offset 3 px down-left behind the cyan PEWPEW.
2. C4 level select tier grouping (1.5 h): a header per tier (`tierOf` from src/levels.ts) reading `SECTOR n  ★ earned/30`, tinted violet #2a1450, teal #0c3a44, crimson #3e0c22 (as header background bands or hairlines), two rows of five per tier; boss tiles show the boss name (WARDEN, HIVE, CORE) under the number in 10 pt.
3. C5 locked tiles (0.75 h): full opacity, dashed `color.dim` border, number in textDim, lock icon; the next playable level gets a slow border pulse. Then capture a fresh-save screenshot (clear the app data by reinstalling or deleting the save through Settings if a reset exists; otherwise `reinstall-app`) to confirm locked legibility.
4. C7 header buttons (0.5 h): replace the `SET` text with a gear drawn from Views (like the existing Lock) with accessibilityLabel Settings, `hitSlop={6}` on both header buttons.
5. C8 result panels (1.5 h): Complete shows a yellow `NEW BEST` badge when score >= best and counts the score up over 600 ms in sync with the star pops; GameOver gets a `BEST n` line (pass `best` as a new optional prop; App wiring comes in W3) and a shake-in; Pause's LEVELS button becomes ghost tone with magenta text.
6. D1 panel enter and exit (0.5 h): in Panel.tsx use Reanimated `FadeIn.duration(140)` on the scrim and `ZoomIn.springify().damping(14)` on the panel, `FadeOut.duration(100)` on exit.
7. D2 title to levels (1 h): crossfade 160 ms and stagger the tiles in with 12 ms per tile capped at 300 ms total.
8. B1 boss HUD layout (1 h, HUD side only): during a boss (hud.bossHp !== null) hide the green progress track and show a 10 pt threat-colored boss bar with the boss name label and tick marks at the phase thresholds (read `BOSSES` from src/levels.ts); move the power-up chips next to the lives; do not reserve 22 pt when the chip row is empty.
9. B2 top scrim (0.25 h): a 120 pt gradient band at the top of the HUD root using `experimental_backgroundImage: 'linear-gradient(rgba(5,5,15,0.75), transparent)'`, `pointerEvents="none"`.
10. B3 score treatment (0.5 h): leading zeros in textDim, significant digits in cyan; a 1.12x scale pop on score increase throttled to one per 150 ms.
11. B5 losing a life (0.5 h): inside Hud.tsx keep the previous lives in a ref; when lives drop, animate the lost rocket icon out (scale to 0 with threat tint) and flash a 180 ms inset threat-colored vignette view over the screen with Animated opacity.

After every two or three commits, reload on the device and screenshot the affected screen to `.audit/w1-ui/<item>.png` at scale 1.0 with includeImageInContext false, then view it with the Read tool and judge it against the audit's intent before moving on. Fix what looks wrong before committing the next item.

Gates after every commit: `npm run check`. Accessibility: every text keeps at least 4.5:1 contrast on its background using the theme tokens (textDim for secondary text), tap targets at least 44 pt or hitSlop to reach it.

Report: commits, `npm run check` tail, the screenshot list, and anything from the list you skipped with the reason.
