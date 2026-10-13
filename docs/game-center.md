# Game Center

PewPew submits best scores to Game Center leaderboards on iOS. The code lives in three places:

- `modules/game-center` is a local Expo module wrapping GameKit: sign in, submit, show the native sheet, read the player's rank.
- `src/leaderboards.ts` names the boards and decides what to submit from the save. It is pure and tested.
- `src/shell/useGameCenter.ts` owns the session: it authenticates at launch, queues scores while signed out, and flushes on sign-in.

The entitlement `com.apple.developer.game-center` is set in `app.config.ts`. The save on the device stays the source of truth; Game Center is write-mostly.

## Leaderboard design

| Board | Vendor ID | Value | Set |
| --- | --- | --- | --- |
| Campaign score | `pewpew.total_score` | Sum of every level's best score | Campaign |
| Stars | `pewpew.total_stars` | Stars earned, 0 to 90 | Campaign |
| Level 1 to 10 | `pewpew.level.01` to `pewpew.level.10` | Best score on that level | Sector 1 |
| Level 11 to 20 | `pewpew.level.11` to `pewpew.level.20` | Best score on that level | Sector 2 |
| Level 21 to 30 | `pewpew.level.21` to `pewpew.level.30` | Best score on that level | Sector 3 |

Every board is a classic leaderboard, integer format, high score wins, all-time scope. Game Center keeps each player's best, so submitting the same run twice is harmless, which matches `recordRun`.

Where the player sees it:

- **Title screen.** A yellow RANKINGS button opens the campaign score board.
- **Level clear.** After the stars land, the panel shows `WORLD #rank OF total` once Game Center confirms the submission. A RANKINGS button opens that level's board.
- **Signed out.** The buttons sign the player in first. If the player dismissed the launch sheet, GameKit will not show it again until relaunch, so the game points them to the Settings app instead.

What is submitted:

- On every win, the level's best plus both totals (`winEntries`).
- On sign-in, every nonzero board from the save (`allEntries`), so progress made offline or before signing in catches up. This is wired in the shell when sign-in completes.

Game over does not submit; only wins count.

## Admin: App Store Connect

Do these once. Development and TestFlight builds use the Game Center sandbox, so scores from testing never reach the production boards.

### 1. Enable Game Center for the app

In [App Store Connect](https://appstoreconnect.apple.com), open PewPew (app `6822155755`), go to **Services**, then **Game Center**, and turn it on. This creates the Game Center detail record the leaderboards hang off.

### 2. Create the leaderboards

Option A, scripted. Create an App Store Connect API key with the **App Manager** role under **Users and Access**, **Integrations**, **App Store Connect API**. Download the `.p8` once and run:

```sh
ASC_KEY_ID=XXXXXXXXXX ASC_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx ASC_KEY_PATH=~/Downloads/AuthKey_XXXXXXXXXX.p8 \
  npx tsx scripts/asc-leaderboards.ts
```

The script is idempotent: it creates the four leaderboard sets and the 32 boards that are missing, adds the English name for each, and leaves existing ones alone. Run it with `--dry-run` first to see the plan. It has not been run against a live account yet; if an endpoint rejects a request it prints the response and stops, and the remaining boards can be created by hand.

Option B, by hand. Under **Game Center**, create four **leaderboard sets** (Campaign, Sector 1, Sector 2, Sector 3) and then one **classic leaderboard** per row in the table above, with:

- Reference name: the board's display name, e.g. `Level 07`.
- Leaderboard ID: the vendor ID from the table, exactly.
- Score format: Integer. Sort order: High to Low. Submission: best score.
- Score range: 0 to 999999999.
- Localization: English (U.S.), the display name, score format suffix left empty.
- Set: the set in the table. Once an app uses sets, every board must belong to one.

### 3. Add Game Center to the app version

On the version page in App Store Connect, scroll to **Game Center** and tick it, then choose the leaderboards and sets to ship with that version. Leaderboards go live with the version; sandbox boards work immediately for development builds.

### 4. Capability on the App ID

EAS reads the entitlement from `app.config.ts` and enables Game Center on the App ID when it syncs capabilities during `eas build`. If a build fails on a provisioning profile mismatch, run `eas credentials --platform ios` and let it regenerate the profile. For a local `expo run:ios` build on the simulator nothing is needed.

### 5. Test

The simulator can sign in to Game Center from the Settings app, but the native sheet and rank lookups are unreliable there. Test on a device with a sandbox Apple ID: install a development build or a TestFlight build, sign in when GameKit asks at launch, clear a level, and check that the level clear panel shows a world rank and that RANKINGS opens the board.

### Review notes

Add to the App Store review notes that Game Center is optional: the game is fully playable without signing in, and leaderboards only record level scores.
