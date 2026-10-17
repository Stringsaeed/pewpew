# Release PewPew on iOS

PewPew uses EAS project `7331076e-619c-48de-a566-bbe0158c0b13`, Apple team `V3HN8HXZYK`, bundle identifier `com.saeed.pewpew`, and App Store Connect app `6822155755`.

## Build and upload

Run `npm run check`, then build the store binary:

```sh
eas build --platform ios --profile production
```

Inspect the completed build, then upload that exact build ID:

```sh
eas submit --platform ios --profile production --id BUILD_ID
```

EAS assigns an increasing build number. The public version is `version` in `app.config.ts`.

After the build, tag the commit it came from (`git tag v1.2.0 <commit> && git push origin v1.2.0`). The tag runs the
frame benchmark against the previous release. Then record the device benchmarks; see "After every release" in
[performance.md](performance.md).
An upload does not submit the App Store version for review. Select the processed build in App Store Connect and complete the listing before submitting.

## Publish compatible updates

The `production` channel points to the `production` branch. The `preview` channel points to the `preview` branch.
The runtime uses Expo's `appVersion` policy and is initially `1.0.0`. Bump the app version before changing native libraries, native configuration, or the Expo SDK, then build a new binary. JavaScript and asset updates must remain compatible with the native code in that version.

Test updates on `preview` before publishing to `production`:

```sh
eas update --platform ios --channel preview --environment preview --message "Describe the change"
```

After validating the update, publish the reviewed code to production:

```sh
eas update --platform ios --channel production --environment production --message "Describe the change"
```

Release builds check for updates at launch without waiting for the download. Fully close and reopen the app, allow the download, then close and reopen it again to run the update. The embedded bundle remains available offline.

Game Center leaderboards are set up separately; see [game-center.md](game-center.md).

## App Store listing

`store.config.json` contains the public listing. `store.config.js` adds review contact details when `PEWPEW_APP_REVIEW_PHONE` is set. Sync changes with `eas metadata:push --profile production`. Supply that environment variable when updating review notes. Keep the review phone number out of version control.

- Launch price: free.
- Availability: all 175 current storefronts and future storefronts, authorized by the owner. Mac and Vision Pro compatibility distribution are disabled for this iPhone release.
- Marketing URL: `https://pewpew.saeed.sh`.
- Support URL: `https://pewpew.saeed.sh/support`.
- Privacy policy URL: `https://pewpew.saeed.sh/privacy`.
- Primary language: English (U.S.).
- Public name: `PewPew: Neon Space Shooter`.
- Subtitle: `30 levels. 3 bosses.`.
- Categories: Games, with Action and Casual subcategories.
- Keywords: `space,shooter,arcade,rocket,asteroids,offline,neon,boss,shoot,em,up`.

### Description

Pilot a rocket through 30 levels of neon space action. Dodge asteroids, mines, and enemy fire, collect crystals, and take on three bosses.

Drag to steer while your rocket fires automatically. Pick up shields and rapid fire, earn up to three stars per level, and return to beat your best scores.

PewPew saves your progress on your device. Play offline, pause when you need a break, and control music and sound effects separately.

No account, ads, or in-app purchases.

### Review notes

No login is required. Tap PLAY, choose level 1, and drag to steer. Shooting is automatic. Clear levels to unlock the next level. The pause button opens the pause menu. Music and sound effects have separate switches in Settings.

The app uses Expo Updates to download compatible JavaScript and asset updates. It includes an embedded game bundle for offline play.

### Submission requirements

Publish the support and privacy pages, upload screenshots from the release build, complete age-rating and privacy declarations, set pricing and availability, and add the review contact before submitting. Confirm the declarations against the release binary and the published policy.

The privacy declaration includes a random installation identifier for update delivery and installation counts, plus fatal-error diagnostics for update recovery. Neither is used for tracking or linked to an account. The source is `expo-updates/ios/EXUpdates/AppLoader/FileDownloader.swift` in the installed dependency. [Expo explains its installation identifier](https://docs.expo.dev/eas/observe/reference/client-id/).

## First release evidence

- EAS build: `a6b38f7b-a280-4d0c-82a4-d66fd1a4ec38`, finished.
- EAS upload: `7efa33da-000c-4702-8dce-0c07d85cd336`, finished.
- App Store listing metadata synced through EAS Metadata. The owner confirmed that the game contains no third-party content.
- App Privacy responses published with the owner's approval. The label declares identifiers and crash diagnostics not linked to identity or used for tracking.
- Price schedule saved as free. Worldwide availability is saved as available on app release.
- Archive inspected: `com.saeed.pewpew`, version `1.0.0`, build `3`, update runtime `1.0.0`, channel `production`, embedded JavaScript bundle present.
- Simulator: iPhone 18 Pro Max, iOS 27.0, Release build launched with embedded JavaScript. No captured errors at launch. Title, level selection, level 1 completion, and level 2 game-over states were observed. This does not establish physical-device performance or audio quality.
- Screenshots: `docs/app-store/screenshots`, captured from the simulator release build at 1320 × 2868 pixels. Both were uploaded to the large Dynamic Island iPhone slot and appear as inherited screenshots for the required medium-size slot.

Apple processing, App Review submission, and public availability require separate verification in App Store Connect.

At the October 13 setup check, Apple's **Add for Review** validation reported only `You must choose a build`. TestFlight still showed **No Builds**, although EAS reported the upload finished. No App Review submission was sent. The support and privacy URLs still returned HTTP 404 and must be published before submission.

## Version 1.1.0 evidence

- EAS build: `8166338d-a04b-4f46-a422-2d5ab2566447`, build number 8, finished and auto-submitted (submission `fb2b14ab-c62c-405d-9a80-a4bada31db12`).
- The Game Center capability was added to the App ID through the App Store Connect API on 2026-10-13, which invalidated the old profile; EAS regenerated it as `Z6V6SPD5K6`. Non-interactive `eas build` skips capability sync, so a new entitlement needs this step or an interactive `eas credentials` run first.
- Remaining manual step: enable Game Center on the 1.1.0 version page and attach the four leaderboard sets (see game-center.md).
