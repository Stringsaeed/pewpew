# PewPew visual design audit

Branch `game`. Evidence: the nine screenshots in `.audit/baseline/screens/` (iPhone 17, dev build) plus `src/ui/*`, `src/render.ts`, `scripts/gen-meshes.ts`, `src/levels.ts`, `App.tsx`. Line numbers refer to the current tree. Effort is in focused hours.

## Art direction (three sentences)

The world is dark, matte, cool-lit low-poly, and only things that matter give off light. Color is a contract: cyan is you, hot orange-red is anything that hurts you, gold and mint are anything you want, and magenta belongs to the brand and the bosses. Everything the player causes gets an answer in light, motion, and time (a flash, a kick, a beat), and the menus use the same glowing-line language as the game.

## Palette adjustment

Keep the four neons. Change their roles and add two tokens:

| token | value | role |
|---|---|---|
| cyan `#35f0ff` | keep | player: bolts, hull stripe, primary buttons |
| magenta `#ff3d9a` | keep | brand, logo accent, boss identity, destructive UI |
| yellow `#ffd23f` | keep | rewards: stars, rapid pickup, score pops |
| green `#5dff9b` | keep | progress, success, crystal (mint) |
| **threat** `#ff5a36` | new | enemy bolts, drones, mine cores, boss HP bar |
| **textDim** `#8a93b8` | new | secondary text (6.7:1 on bg). Keep `#5b6385` only for borders and disabled states |

Per tier, add a nebula tint used in the backdrop and level select: tier 1 violet `#2a1450`, tier 2 teal `#0c3a44`, tier 3 crimson `#3e0c22`.

Why: the drones are cyan (`gen-meshes.ts:27`), the same color as the player's bolts and hull stripe. Enemy bolts are pink-magenta (`render.ts:21`), close to the rocket's own fins (`gen-meshes.ts:20-21`). Mines are pure red (`gen-meshes.ts:25`). So a threat currently shows up in three unrelated hues, two of which the player's own ship also uses.

## What is already good (do not touch)

- **Exhaust trail** (`render.ts:469-475`). The world-space flame particles in play-level1.png and play-level30.png are the best-looking thing on screen. They draw the player's path for free.
- **Shield bubble.** The hollow-ring glow (`render.ts:117`, play-level10-boss.png) is clean and costs nothing extra.
- **Star field.** Three hashed layers with twinkle and parallax in one fullscreen triangle (`render.ts:58-73`). It is cheap and calm, and it keeps moving behind the menus.
- **Flat-shaded, deterministic, generated meshes.** The asteroid icospheres read well as low-poly rock, and the generator's seeded pipeline is the right foundation.
- **Player bolts.** Elongated cyan glows (`render.ts:433`) are easy to read.
- **Complete screen star pop.** The staggered spring (`Complete.tsx:22-30`) is the one moment in the UI that feels like a game. Keep it.
- **One font, one border language.** Menlo, 2 px neon borders, 14/20 px radii, uppercase tracked labels. It is consistent and should be extended, not replaced.
- **Pause button.** It is 44 pt with hitSlop (`Hud.tsx:79`), and the dimmed HUD behind the pause panel (pause.png) keeps context.

---

## A. Game view (ranked by impact per effort)

**A1. The boss turns white under fire, a bug (0.5 h).** In play-level10-boss.png the Warden is a pale lavender slab, and its armor colors (`gen-meshes.ts:41-42`, `0.34,0.32,0.52`) are gone. The cause: every hit sets `bossFlash = 0.12` (`render.ts:380`), and the instance gets a binary `+0.6` white while it is above 0 (`render.ts:462`, added in `render.ts:100`). Normal fire is every 12 ticks (0.2 s, `sim.ts:21`), so the boss is white 60% of the time. Under RAPID (0.1 s) it is white 100% of the time. At normal fire it also flickers a large bright area at 5 Hz, which is a photosensitivity risk. Fix: on hit set `bossFlash = 0.06`, then pass `0.45 * bossFlash / 0.06` so the flash decays. Clamp re-triggers to at most one every 0.15 s.

**A2. Enforce the color contract on threats (1 h).**
- Repaint the drone body in threat colors in `gen-meshes.ts:27-29`: threat-orange top caps, dark maroon sides, hot-white eye. Then rerun `gen:meshes`.
- Mine core: change `gen-meshes.ts:25` to threat-orange.
- Enemy bolts (`render.ts:21`): `rgba [1,0.38,0.15]`, round rather than elongated (sx = sy = 0.5), with a bigger white core. Player shots stay thin cyan streaks; enemy shots become fat orange orbs. The two must differ in shape as well as hue, which is the standard bullet-hell readability rule.
- Pulse mines in the body loop: `flash = 0.12 * (0.5 + 0.5 * sin(time * 7))` for `Kind.Mine` at `render.ts:449-453`. A blinking core reads as armed.

**A3. Death and victory beats (2 h).** On `won`/`lost`, App dispatches `ended` immediately (`App.tsx:148`). `runOf` becomes null, so the renderer gets `world = null`, and the player never sees their ship explode, the 220-particle boss death (`render.ts:371`), or the dive into the wormhole. gameover.png and complete.png show bare stars because the world is already gone.
- Hold the dispatch for 1.0 s on a loss and 1.4 s on a boss kill. The sim is already terminal, so it emits nothing more, and determinism is unaffected.
- During the hold, scale particle `dt` by 0.3 inside `renderer.frame`. This is slow motion in the renderer only.
- Fire one big burst plus a ring (A9) at the player.
- Ease the camera 10% closer.

**A4. Screen shake (1 h).** There is no camera response to anything. Add a decaying `trauma` value in `render.ts` and offset eye and target x/y in `camera()` (`render.ts:329-349`) by `trauma² * 0.25 * hashNoise(time)`. Set trauma on events: playerHit 0.6, boss destroy 1.0, shieldBlock 0.3, asteroid destroy 0.08. It costs no GPU. Gate it on Reduce Motion (D5).

**A5. Muzzle flash and enemy tell (0.75 h).** `fire` and `enemyFire` events go to the `default` branch (`render.ts:385`). For `fire`: a 60 ms cyan glow of size 0.5 at `(ev.x, ev.y)` plus 2 sparks, so the ship feels like it shoots. For `enemyFire`: a 120 ms threat-orange flare at the boss or drone, which also warns the player.

**A6. Pickups need a halo (0.75 h).** Pickups are small (radius 0.4-0.45, `levels.ts:25-27`) and unlit like everything else. In play-level30.png the crystal near "LV 30" reads like a rock fragment. While walking bodies (`render.ts:445-454`), also `putGlow` a soft halo of 1.6x radius under each pickup in its kind color, pulsing at 2 Hz, and spin pickups at a fixed fast rate. The rule becomes: matte means rock, hot means threat, haloed means take it.

**A7. Rim light and hemisphere ambient (1 h).** The fragment shader is Lambert plus a flat 0.3 ambient (`render.ts:97-98`). Asteroid shadow sides (play-level30.png) sink into the `#05050f` backdrop and silhouettes go muddy. Two changes, still in one pass at about 10 ALU per mesh fragment:
- Ambient: `mix(vec3(0.22,0.16,0.30), vec3(0.20,0.28,0.42), n.y*0.5+0.5)` in place of the flat 0.3.
- Rim: `rim = pow(1 - saturate(dot(n, V)), 3) * vec3(0.35,0.45,0.8)`, where V is the constant view direction from PITCH.

Also lift the rock palette about 10% and widen its value spread (`gen-meshes.ts:24`).

**A8. Body hit flash and damage state (1.5 h).** Asteroids (hp 3) and drones (hp 2) never flash when hit: every body instance passes `flash = 0` (`render.ts:453`). The WorldView exposes `bodies.hp`, which gives two options without any identity tracking:
- Tint toward a hot emissive orange as `hp/maxHp` drops, so the damage state is visible.
- Flash white for 2 frames on any body of the hit `target` kind within 0.5 units of a `hit` event's `(x, y)`.

**A9. Shockwave rings on destruction (1 h).** `burstAt` only emits dots that shrink (`render.ts:283-291, 482`). Add a per-particle "grow" flag: negative size means a ring that grows from 0.2 to 1.6x with the ring falloff, reusing the negative-alpha path at `render.ts:117-119`. Use one ring per destroy, three staggered rings for a boss, and one red ring on playerHit. It adds a few instances and no extra pass.

**A10. Per-tier nebula and speed lines (2 h, measure GPU).** All 30 levels use the same backdrop, so tiers have no place identity.
- Add 2 octaves of value noise at very low frequency to `STARS fs` (`render.ts:58-73`), with parallax 0.03 and the tier tint (palette table above).
- Extend `U` with a `vec4 tint` (uniforms 36 to 40 floats) and set it from `world.spec.n` via `tierOf`.
- Stretch the nearest star layer in y by scroll speed (11.8 u/s on L30) for speed lines.

This is the only item that adds per-pixel cost to the one fullscreen pass (about 25 ALU at 3.2 Mpx). Ship it behind a constant, profile on a real A-series phone, and fall back to one octave.

**A11. Boss presence (2.5 h).**
- The `bossEnter` event is unused. Add a HUD "WARNING · WARDEN" banner (B1).
- Read `boss.hp / BOSSES[id].hp` in the renderer to raise eye emissive and emit sparks and smoke from the hull below each phase threshold (`levels.ts:52-64`). This makes the phase change visible.
- In the mesh generator, give the Warden an emissive magenta trim on alternate side faces (`gen-meshes.ts:277-278`) so its slab silhouette reads, and make the guns longer. Apply the same pass to Hive and Core: one emissive magenta accent each, which ties bosses to their brand color.

**A12. Rocket polish (0.5 h).** The rocket is good; keep the mesh. Add a warm additive glow quad at the nozzle (`render.ts:469`) and a cyan engine flare when moving fast. Leave the bank alone.

## B. HUD during play

**B1. Boss layout (1 h).** In play-level10-boss.png a full, useless green progress bar sits above the SHIELD chip, which sits above the boss bar. The chips row reserves 22 pt even when empty (`Hud.tsx:88`).
- During a boss, replace the progress track with a 10 pt threat-colored boss bar labeled with the boss name, with tick marks at the phase thresholds.
- Move the power-up chips next to the lives.
- Give RAPID a draining underline. `world.player.rapidUntil` is in the WorldView, so App can compute the remaining time without touching the sim.

**B2. Top scrim (0.25 h).** Hazards pass under the score and buttons: a mine sits on the progress bar in play-level30.png, and an asteroid sits under AUTO in play-level1.png. Add a 120 pt top band with `experimental_backgroundImage: 'linear-gradient(rgba(5,5,15,0.75), transparent)'`. RN 0.86 supports this natively, so no library is needed.

**B3. Score treatment (0.5 h).** Draw the leading zeros of `000060` in textDim and the significant digits in cyan (two nested `Text`, `Hud.tsx:19`). Add a 1.12x scale pop through Reanimated (already a dependency) when the score rises, throttled to at most one pop per 150 ms.

**B4. Level label (0.25 h).** `LV 1` is 12 pt `#5b6385`, which is 3.45:1 and fails AA (`Hud.tsx:78`). It also floats in the middle of the row. Use textDim at 13 pt, and either put it under the pause button or in the progress bar label (`LV 10 · SECTOR 1`).

**B5. Losing a life (0.5 h).** The lives icon just disappears. Animate it out (scale to 0 with a red tint) and flash a 180 ms red inset vignette over the whole screen, a React `View` with `boxShadow: 'inset 0 0 60px #ff5a36'` and Animated opacity, keyed on a drop in `hud.lives`. It runs on the compositor and adds no GPU pass.

## C. Menu screens

**C1. Ghost buttons look disabled (0.25 h).** SETTINGS, RETRY, and LEVELS use `#5b6385` for text (`Button.tsx:5`, `theme.ts:6`). That is 3.45:1 on bg and 3.26:1 on panel; at 18 pt bold it is not "large text", so it fails AA. Ghost labels should use textDim (`#8a93b8`, 6.7:1), with borders staying `#5b6385`.

**C2. Neon glow language (1 h, biggest menu win).** Everything is a flat outline: title.png, the panels, the tiles.
- Primary buttons and panel borders: `boxShadow: '0 0 18px <tint>73'` (RN 0.86 new arch, no library).
- Titles and the logo: `textShadowColor: tint, textShadowRadius: 14`.
- Logo: add a magenta copy offset 3 px down-left behind the cyan `PEWPEW` (`Title.tsx:17`). The chromatic split uses the brand pair.

**C3. Title has a dead band (1.5 h).** Between the tagline and PLAY there are about 450 px of empty space (title.png). When `world === null` (`render.ts:477-479`), draw the hero rocket idling with exhaust in that gap: slow bob and gentle bank. All the parts already exist. The best artwork in the game should be the first thing seen.

**C4. Level select tier grouping (1.5 h).** levels.png is a flat 5x6 grid. The tiers are indistinguishable except for the magenta boss tile, and the bottom 30% of the screen is empty.
- Insert a header per tier (`tierOf`, `levels.ts:189`): `SECTOR 1  ★ 12/30`, tinted with the tier nebula hue, a hairline divider, and two rows of five.
- Label boss tiles with the boss name in 10 pt under the number (WARDEN, HIVE, CORE) so they are not distinguished by color alone.

**C5. Locked tiles are illegible (0.75 h, unverified on screen).** The baseline used UNLOCK ALL, so no screenshot shows a locked tile. In code, a locked tile is `#5b6385` multiplied by `opacity: 0.45` (`LevelSelect.tsx:57-59,64`), about 1.5:1, so the number all but vanishes. Instead:
- Full opacity, a dashed `#5b6385` border, the number in textDim, and the lock icon.
- The next playable level gets a slow Reanimated border pulse, telling the player what to tap.

Capture a fresh-save screenshot to confirm.

**C6. Tile stars (0.25 h).** Empty `☆` stars use the same yellow at 11 pt (`LevelSelect.tsx:65,87`), so one-star and three-star tiles look alike at a glance. Use 13 pt, yellow for earned stars, and `#5b6385` for empty ones.

**C7. "SET" header button (0.5 h).** The abbreviation is cryptic (`LevelSelect.tsx:26`). Replace it with a gear drawn from Views (as `Lock` is), or drop it, since the title screen already has SETTINGS. The header buttons are about 42 pt tall; add `hitSlop={6}`.

**C8. Result panels (1.5 h).**
- **Complete:** shows `BEST 875` in 12 pt dim even when the run did not beat it. Add a yellow `NEW BEST` badge when `score >= best`, and count the score up over 600 ms in sync with the star pops.
- **GameOver** (gameover.png) is the emptiest screen at exactly the moment the player needs a reason to retry. Add `BEST ####` and `REACHED 62%` (the last `hud.progress` is in App state), and shake the panel in (D1).
- **Pause:** the filled-border magenta LEVELS button (pause.png, `Pause.tsx:17`) competes with RESUME. Make it ghost with magenta text.

**C9. Settings: keep.** Contrast is good and the Switch tints match the theme. UNLOCK ALL is dev-only.

## D. Motion and transitions

**D1. Panel enter and exit (0.5 h).** `Panel.tsx` mounts and unmounts as a hard cut. Use Reanimated 4, already installed: scrim `FadeIn.duration(140)`, panel `ZoomIn.springify().damping(14)` from 0.92, and `FadeOut.duration(100)` on exit. One change covers Pause, Settings, Complete, and GameOver. GameOver also gets a 3-cycle horizontal shake (6 px).

**D2. Title to Levels (1 h).** Currently a hard cut. Crossfade the screens over 160 ms, and stagger the tiles in with a 12 ms delay each, capped at 300 ms total, so the grid "boots up".

**D3. Star field continuity and warp (1 h).** The backdrop jumps on every play/menu switch, because the camera uses the player's y in play but an unrelated `menuY` in menus (`render.ts:415, 478`). Carry the last camY into `menuY`. Add a `warp` uniform that stretches stars vertically for 0.6 s at level start and during the wormhole exit; this reuses A10's uniform slot.

**D4. Level intro card (0.5 h).** A run currently starts cold. Show `SECTOR 1 · LEVEL 7` for 1.2 s, then fade it out, triggered when `hud` goes from null to set for a new run key (`App.tsx:96-104`). Use a `WARNING` variant on boss levels.

**D5. Reduce Motion (0.5 h).** Read `AccessibilityInfo.isReduceMotionEnabled()` and pass a flag to the renderer: shake off, flashes at half intensity, no slow motion, and fades in place of zooms.

---

## Accessibility summary

- **Contrast:** dim text `#5b6385` is 3.45:1 on bg and 3.26:1 on panel. It is used for ghost buttons, `LV n`, `LEVEL n`, `BEST n`, and AUTO, and all of these fail AA. Locked tile numbers are about 1.5:1. The cyan (14.6), yellow (14.1), green (15.7), and magenta (6.2) text all pass.
- **Text size:** 11 pt chips (`Hud.tsx:90`), 11 pt tile stars, and 12 pt sub-labels are below a comfortable 13 pt minimum at arm's length during play. Menlo sizes are fixed, and `allowFontScaling` is on by default, so at large Dynamic Type the 5-column tiles and the `LEVELS` header will clip. Set `maxFontSizeMultiplier={1.3}` on game text.
- **Tap targets:** level tiles (about 66x76 pt), panel buttons, and pause pass. Header BACK and SET are about 42 pt; add hitSlop.
- **Color-only meaning:** boss tiles (fixed by C4), pickups vs hazards (fixed by A6), and enemy vs player bolts (fixed by A2's shape change).
- **Photosensitivity:** the boss's binary white flash flickers at about 5 Hz under normal fire (A1). Keep every full-object or full-screen flash below 3 Hz.

## Cost notes

- Every item except A10 lives inside the existing three pipelines and the one render pass: extra glow instances, a few ALU in the mesh shader, and uniforms. A10 is the only addition to fullscreen per-pixel work; measure it on device.
- The vignettes and scrims are React views, composited by the system rather than drawn in WebGPU.
- Keep the new glow sizes small. Additive quads at 3x are paid in overdraw, and the 220-particle boss burst at size 0.5 is already the heaviest fill moment.
- Nothing here writes to the sim. A3 delays a React dispatch and slows only the renderer's own particle clock. B1 reads `rapidUntil` from the readonly WorldView.

## Suggested order (first 8 hours)

A1 (0.5), C1 (0.25), A2 (1), A3 (2), A4 (1), C2 (1), D1 (0.5), A6 (0.75), B2 (0.25), B4 (0.25), C6 (0.25).

That fixes the bug and all the contrast failures, establishes the color contract, and adds the three biggest feel upgrades: the death beat, shake, and glow.
