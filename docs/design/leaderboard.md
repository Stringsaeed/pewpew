# Leaderboards and Game Center

Status: design, not built. Written 2026-10-12 against branch `game` at f018058.

## Goal

Players compare scores per level and across the campaign without us running a server. Game Center gives identity, friends, and the native dashboard for free on iOS. The design keeps every rule in pure TypeScript so the native layer is a thin pipe and the sync logic is unit tested in Node, the same way `src/audio.ts` wraps `react-native-audio-api`.

## What Game Center can and cannot do

- Scores are submitted from the device and trusted as sent. There is no server-side submission API and no way to attach a proof. Anyone with a jailbroken phone can post any number.
- Classic leaderboards keep the player's best (highest) value. Resubmitting a lower or equal score is a no-op, so submission is naturally idempotent.
- Each entry carries a 64-bit `context` integer that the dashboard never shows. We use it to tag the sim version and star count.
- Up to 100 leaderboards per app, grouped into leaderboard sets. The dashboard is `GKAccessPoint` (floating pill) or `GKGameCenterViewController` (modal). Opening the dashboard directly on one board needs iOS 18.
- The simulator can sign in to Game Center through the Settings app, but scores only post once the app record and its leaderboards exist in App Store Connect.

Because the proof problem is unsolvable on Game Center, phase 1 accepts client-trusted scores and keeps replay proofs on the device so a verified board can be added later without changing the sim or the save.

## Boards

| Board | ID | Value | Sort |
|---|---|---|---|
| Campaign | `pewpew.v1.campaign` | sum of best score over 30 levels | high to low |
| Stars | `pewpew.v1.stars` | sum of stars, 0 to 90 | high to low |
| Level n | `pewpew.v1.level.NN` (NN = 01..30) | best score on that level | high to low |

Sets: `pewpew.v1.set.1`, `.2`, `.3` hold levels 1 to 10, 11 to 20, 21 to 30. Campaign and Stars sit outside the sets. Total: 32 boards, 3 sets.

The `v1` token is the balance version. Scores from different level tables are not comparable, and Game Center cannot rescore. When `LEVELS` or scoring in `src/sim/` changes in a way that moves scores, bump `LEADERBOARD_VERSION` and create fresh boards. Old boards stay in App Store Connect as history. The ramp was tuned to greedyBot, not to people, so expect at least one bump before launch. Do not create the v1 boards in App Store Connect until human tuning settles.

A script `scripts/gen-leaderboards.ts` prints the 32 board definitions and 3 sets as a table, and optionally creates them through the App Store Connect API (`gameCenterLeaderboards`, `gameCenterLeaderboardSets`) given an API key. Creating 32 boards by hand per version bump is the kind of chore that silently does not happen.

Context value per entry: `(LEADERBOARD_VERSION << 8) | stars`, stars 0 for the Campaign and Stars boards. A future verifier reads the version from the entry without parsing the ID.

## Save changes (v2)

```ts
export interface LevelRecord {
  readonly best: number; readonly stars: 0 | Stars;
  readonly sent: number;          // best score Game Center has acknowledged for the current player, 0 if none
}
export interface Save {
  readonly v: 2;
  readonly levels: readonly LevelRecord[];
  readonly music: boolean; readonly sfx: boolean;
  readonly player: string | null; // gamePlayerID the `sent` watermarks belong to
  readonly sentStars: number;     // stars total acknowledged
}
```

`sent` is a watermark, not a queue. What still needs submitting is derived: every level where `best > sent`, plus Campaign when `sum(best) > sum(sent)`, plus Stars when `sum(stars) > sentStars`. This survives offline play, app kills mid-submit, and duplicate submits, because Game Center max-merges exactly like `recordRun` does. There is no outbox to corrupt.

When the signed-in `gamePlayerID` changes, every `sent` and `sentStars` resets to 0 and `player` is replaced. Local bests are device records and stay.

`parseSave` migrates v1 by filling `sent: 0`, `player: null`, `sentStars: 0`. The existing repair rules apply to the new fields (non-finite or negative becomes 0, `sent` is clamped to `best`).

Replay proofs: on a won run, keep `inputs` (Float32Array, one per step, NaN = coast) for the new personal best under `pewpew/proof/v1/NN` as a separate AsyncStorage key, base64 of the float32 bytes. A 90 s level is 5,400 floats, 21 KB. Thirty proofs are under 650 KB. `replay(n, inputs)` must reproduce `score` and `hash`, and a test asserts that round trip. Nothing reads proofs in phase 1. They exist so a verified board is a backend task, not a client migration.

## Pure module `src/leaderboard.ts`

No React, no native imports. Exhaustive tables like `ARCHETYPES` and `EVENT_SFX`.

```ts
export const LEADERBOARD_VERSION = 1;
export type BoardId = `pewpew.v${number}.campaign` | `pewpew.v${number}.stars` | `pewpew.v${number}.level.${string}`;
export const BOARDS: { campaign: BoardId; stars: BoardId; level: readonly BoardId[] }; // level[n-1], length 30 checked by a tuple type

export interface Submission { readonly board: BoardId; readonly value: number; readonly context: number }

/** Everything Game Center does not yet have for this player. Empty when the save is in sync. Pure. */
export function plan(s: Save, player: string): readonly Submission[];
/** Returns the save with watermarks advanced to what was acknowledged. Idempotent. Pure. */
export function acknowledge(s: Save, player: string, sent: readonly Submission[]): Save;
/** Reset watermarks when the account changed. Pure. */
export function rebind(s: Save, player: string | null): Save;
```

Tests (Node, same runner as `save.test.ts`):

- a fresh save plans nothing
- one won level plans that level, Campaign, and Stars
- acknowledge then plan is empty
- a second win with a lower score plans nothing
- a player change resets watermarks and replans everything
- Campaign value equals the sum of bests, Stars equals the sum of stars
- `BOARDS.level` has 30 entries and the IDs are zero padded

## Backend boundary `src/gamecenter.ts`

```ts
export interface Player { readonly id: string; readonly alias: string }
export interface GameCenter {
  /** Resolves once the auth handler settles. null when the player declined or Game Center is off. */
  readonly authenticate: () => Promise<Player | null>;
  readonly onAuthChange: (cb: (p: Player | null) => void) => () => void;
  readonly submit: (batch: readonly Submission[]) => Promise<void>; // one native call, all or nothing
  readonly localRank: (board: BoardId) => Promise<{ rank: number; total: number } | null>;
  readonly showDashboard: (board?: BoardId) => Promise<void>;        // resolves when dismissed
  readonly setAccessPoint: (active: boolean) => void;
}
export function createGameCenter(factory?: () => GameCenter): GameCenter;
```

The default factory lazily `require`s the local module, the same pattern that fixed the audio Metro bundling. `src/testing/fake-gamecenter.ts` records calls, lets tests script auth outcomes and failures, and is also what the app uses when `GKLocalPlayer` reports Game Center unavailable, so every screen works signed out.

Sync driver in App.tsx, one effect:

1. After `loadSave`, call `authenticate()`. On a player, `rebind` the save if the id differs, then run step 2.
2. `const batch = plan(save, player)`. If empty, stop. Else `submit(batch)`, then `commitSave(acknowledge(...))`. On failure, do nothing. The next trigger retries.
3. Triggers: auth change, a won run (right after `recordRun` in `onEnded`), and app foreground. No timers.

Failures are silent in the UI. A score that did not post is still the local best, and it posts next time. Log the failure under the existing `[pewpew]` prefix.

## Native module `modules/game-center`

Expo local module, Swift, `expo-module.config.json` with `"platforms": ["ios"]`. Scaffold with `npx create-expo-module@latest --local game-center`. Android gets a stub that reports unavailable, which the fake covers.

Functions, all run on the main thread:

- `authenticate()`: sets `GKLocalPlayer.local.authenticateHandler` once per process. If GameKit hands back a view controller, present it from the root view controller. Resolves with `{ id: gamePlayerID, alias }` or null. GameKit calls the handler multiple times, so the module stores the latest state and re-emits `authChanged` on every call rather than resolving the promise twice.
- `submit(entries)`: requires `isAuthenticated`, else rejects with `not_authenticated`. Calls `GKLeaderboard.submitScore(_:context:player:leaderboardIDs:)` once per entry, awaited together. Rejects on the first error so the watermark stays put.
- `localRank(board)`: `GKLeaderboard.loadLeaderboards(IDs:)` then `loadEntries(for: .global, timeScope: .allTime, range: 1...1)` and returns the local entry's rank and total.
- `showDashboard(board?)`: presents `GKGameCenterViewController(leaderboardID:playerScope:timeScope:)` when a board is given, else the default state. Resolves on dismiss through the delegate.
- `setAccessPoint(active)`: `GKAccessPoint.shared.location = .topLeading`, `isActive = active`, `showHighlights = false`.

Config plugin, same file as the module, adds the `com.apple.developer.game-center` entitlement and `GameKit` to the capabilities list. The provisioning profile must have Game Center enabled on the App ID or signing fails. That is an Apple Developer portal step, not a code step.

Error codes crossing the bridge are a closed set: `not_authenticated`, `unavailable`, `cancelled`, `network`, `other`. The TypeScript side maps them with an exhaustive table.

## UI

- Title: access point active. Pressing it opens the native dashboard. No custom leaderboard screen in phase 1, so `src/flow.ts` does not change. The dashboard is a native modal over whatever screen is up.
- Play, paused, complete, gameover: access point inactive. It would overlap the HUD and it steals the top corner.
- Complete: below `BEST n`, a line `RANK #r OF t` when `localRank` resolves within 2 s, otherwise nothing. A ghost `LEADERBOARD` button opens the dashboard on that level's board (falls back to the default dashboard below iOS 18).
- Settings: a row `GAME CENTER` with the alias when signed in, or `NOT SIGNED IN`. Tapping when signed out calls `authenticate()` again. If GameKit will not show its sheet (the player declined earlier this session), the row explains that sign in lives in iOS Settings under Game Center. We do not deep link into Settings.
- Levels: no change in phase 1. A per-level rank badge is cheap later because `localRank` is already there.

Audio keeps playing under the dashboard. The loop is already paused on every non-play screen, so nothing needs suspending.

## Prerequisites the user supplies

1. App Store Connect record for `com.saeed.pewpew` with Game Center enabled.
2. Game Center capability on the App ID in the developer portal, then a fresh provisioning profile.
3. The 32 boards and 3 sets created, from the generator script or by hand.
4. A sandbox tester account signed in on the test device or simulator.

Until 3 exists, `submit` succeeds on the client and nothing appears. That is the reported-in-the-wild failure mode, so the dev build logs the board IDs it posted to on every sync.

## Verification

- Node: the leaderboard tests above, save v1 to v2 migration tests, the proof round trip through `replay`.
- Fake backend: App.tsx sync driver tested by scripting auth null, auth ok, submit failure then success, and a player change.
- Device: with the sandbox account, win level 1, see the entry on the Game Center dashboard, kill the app offline, win level 2, come back online, foreground, and see level 2 and the updated Campaign post. argent `describe` reads the native dashboard, so this is scriptable.
- Simulator first, then a physical iPhone, since Game Center sign-in on the simulator has been flaky across Xcode releases.

## Phases

1. Pure: `src/leaderboard.ts`, save v2, proof storage, tests. No native code, no UI. Mergeable alone.
2. Native: the local module, config plugin, fake, sync driver. Verified on the simulator with the sandbox account or at least with auth null.
3. UI: access point, Complete rank line and button, Settings row.
4. Board creation script against the App Store Connect API, run once per balance version.

Later, not designed here: a verified board on our own backend that replays proofs with the same `src/sim/`, achievements (first boss, 90 stars, no-hit level), and Android through Play Games behind the same `GameCenter` interface.

## Decisions I took

- Watermarks over an outbox. Game Center max-merges, so derived state is correct and has nothing to corrupt.
- Version token in the board ID rather than filtering by context. The dashboard cannot filter by context, so mixed-version boards would show wrong winners.
- Native dashboard over a custom screen. It keeps `flow.ts` untouched and gets friends and avatars for free.
- Proofs stored from day one. Cheap, and the only path to an honest board later.
- Campaign as sum of bests, not best single run through all 30. The game is level based, with no continuous run to time.
