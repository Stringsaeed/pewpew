# U5 audio

The player hears four original tracker songs and eight synthesized effects. The next engineer inherits `events`, `ui`, `mix`, and `active` over one play cursor and a shared note-column planner.

Worktree `/Users/saeed/.t3/projects/pewpew-audio`, branch `u5-audio`. No pull request. The screens unit owns `App.tsx`.

## Commits

- `75f4f7c` tune patches and write the four tracker songs
- `97c429b` schedule synth voices from one play cursor
- `555c201` render songs and sfx to wav with the shared planner

The decision rows and this report are the commit that follows those three.

## Files

| File | Lines |
| --- | ---: |
| `src/sound.ts` | 269 |
| `src/audio.ts` | 411 |
| `src/audio.test.ts` | 398 |
| `src/testing/fake-audio.ts` | 103 |
| `src/testing/node-ambient.d.ts` | 25 |
| `scripts/render-song.ts` | 169 |

## Songs

One render pass, then the release tail. The runtime sequencer loops. The file stops when the last note finishes.

| Id | bpm | Key | Bars | Seconds | Path |
| --- | ---: | --- | ---: | ---: | --- |
| tier1 | 120 | C major | 8 | 15.782 | `/tmp/pewpew-audio/tier1.wav` |
| tier2 | 132 | A minor | 8 | 14.305 | `/tmp/pewpew-audio/tier2.wav` |
| tier3 | 144 | F# minor | 8 | 13.261 | `/tmp/pewpew-audio/tier3.wav` |
| boss | 160 | D minor | 8 | 11.853 | `/tmp/pewpew-audio/boss.wav` |

Each song has lead, bass, kick, and hat. tier1 is bright and on the beat. tier2 is minor and driving. tier3 is offbeat. The boss is heavy and fast.

## Effects

| Id | Seconds | Path |
| --- | ---: | --- |
| laser | 0.145 | `/tmp/pewpew-audio/laser.wav` |
| hit | 0.140 | `/tmp/pewpew-audio/hit.wav` |
| explode | 0.560 | `/tmp/pewpew-audio/explode.wav` |
| pickup | 0.580 | `/tmp/pewpew-audio/pickup.wav` |
| shield | 0.720 | `/tmp/pewpew-audio/shield.wav` |
| complete | 1.090 | `/tmp/pewpew-audio/complete.wav` |
| gameover | 1.360 | `/tmp/pewpew-audio/gameover.wav` |
| tap | 0.062 | `/tmp/pewpew-audio/tap.wav` |

## What was verified

Typecheck is green. `npm run typecheck` exited 0 in this worktree. Logged in `.audit/decisions.tsv`.

The node test run is green. `npm test` reported 13 passed, 0 failed, 453 ms. The tests are `src/audio.test.ts`. They drive `createAudio` with the fake in `src/testing/fake-audio.ts` and assert literal schedules.

Session options are set before the context exists. VERIFIED. The fake records `session`, then `context`.

Each patch builds the expected graph. VERIFIED. Chime is one triangle and no filter. Zap is two squares and a pitch ramp. Boom is looping noise into a lowpass that moves from 1200 Hz to 200 Hz. Hat is looping noise into a highpass at 7000 Hz. Lead is two squares 7 cents apart. Bass is a saw into a lowpass that opens from 480 Hz to 1300 Hz. Kick is a sine into its gain.

ADSR times are scheduled in order. VERIFIED. The shield note records gain events at 0, 0.002, 0.202, 0.5, and 0.7 seconds. The floor is 0.0001 because `exponentialRampToValueAtTime` rejects 0.

The pitch sweep lands on the semitone target. VERIFIED. The first laser note ramps to a frequency that rounds to 370 Hz.

The voice cap stops the oldest laser. VERIFIED. Five triggers at 0, 0.02, 0.04, 0.06, and 0.08 stop the oldest source at 0.08. A planted bug that used `>` instead of `>=` failed that assertion with actual 0.09000000000000001. The comparison was restored and the test passed again. Logged in `.audit/decisions.tsv`.

The sequencer fills bar 1 inside the lookahead, then bar 2 on the next tick. VERIFIED. At t=0 only step 0 is scheduled. At t=1.8 the bar 1 strikes are present and nothing starts at or after 2 seconds. At t=1.91 step 16 starts at 2 seconds (lead D5, bass A2, kick, hat) and nothing starts later.

Switching tier or entering the boss stops the old voices. VERIFIED. A later `start` at level 11 stops the tier1 sources at that time and the new bass is A1. `bossEnter` stops the previous sources and the new lead is D4.

Won plays the stinger and stops the music. VERIFIED. Music sources stop at the win time. A later tick adds no music-bus notes. The sfx bus has the four complete-arpeggio gains.

Mix writes the two master gains. VERIFIED. `mix({ music: false, sfx: true })` sets the music gain to 0 and the sfx gain to 1 at the current time. The reverse call swaps them. The sequencer still schedules while a bus is silent.

Ui plays a tap and starts or stops the title song. VERIFIED. `tap` is one sfx noise source. `menu-music` starts tier1. `silence` stops those sources.

Active suspends the context and the sequencer together. VERIFIED. `active(false)` suspends and clears the 25 ms interval. The disarmed callback adds no nodes. `active(true)` resumes and arms a new 25 ms interval.

EVENT_SFX names every sim event. VERIFIED. The runtime record has the same 12 names as the sim, and a sample of each event maps to the expected id or null. The switch has a `never` default.

Every song voice is 8 bars of tokens that parse. VERIFIED. Each voice is 128 tokens. Each token matches a note, a hold, or a rest. Bass opens on C2, A1, F#1, and D1 for tier1, tier2, tier3, and boss.

The WAVs are real 16-bit files and they are not silent. VERIFIED. A header read of all 12 files found RIFF/WAVE, 1 channel, 44100 Hz, 16-bit PCM. Peaks are in the thousands of PCM counts, and the 12 sha256 prefixes differ. Durations match the renderer log above.

The renderer shares the planner with the engine. VERIFIED by reading `scripts/render-song.ts`. It imports `songHits`, `sfxHits`, `ampAt`, `pitchAt`, and `cutoffAt` from `src/audio.ts`, and the songs and patches from `src/sound.ts`.

## What is open

Sound on the iOS simulator is NOT VERIFIED. This run did not build or launch the app, and there is no audio capture. The proof of the schedule is the fake graph. The proof a person can listen to is the WAV files.

The default factory's lazy `require` of `react-native-audio-api` is NOT VERIFIED at runtime. Tests always pass a fake. `tsc` accepts `AudioManager.setAudioSessionOptions` and `new AudioContext()` against the package types. Nothing in this run constructed a native context.

A second model did not review the diff. NOT VERIFIED as an outside review. `common.md` forbids subagents, so the show-me-your-work cross-model pass did not run.

`App.tsx` does not call `createAudio` yet. That wiring belongs to the screens unit. Calling `createAudio()` with no argument is the app path.

## Skeleton deviations

`createAudio` gained an optional factory argument, `{ createContext(): BaseAudioContextLike, configureSession(): void }`. The brief required that seam so Node tests do not import `react-native-audio-api` at module top level. The four public methods are unchanged. The import sits inside `defaultFactory` via `createRequire(import.meta.url)`.

`patchOf` widens one row of the `as const` patch table to `Patch`. Indexing the const table hides `filter`, `sweep`, and `detune` on the members that omit them. The `Patch` interface itself is unchanged.

`src/testing/node-ambient.d.ts` declares `node:module`, `node:fs`, `node:test`, and `node:assert/strict`. `tsconfig.json` sets `types` to `@webgpu/types` only, and that file belongs to the scaffold. The ambient script is the local boundary. It is the one file outside the unit's named list.

Patch numbers moved during tuning. Lead gain is 0.14. Bass lowpass is 480 Hz, Q 3.2, envHz 820. Kick sweep time is 0.09 seconds. Hat Q is 0.8. Boom Q is 0.7 and its attack is 0.002 seconds. SFX are short phrases. The eight ids, the patch ids, and `EVENT_SFX` are the skeleton names. Title music reuses tier1.

`envHz` is an additive offset, floored at 20 Hz. Boom closes (1200 + -1000). Bass opens (480 + 820). Detune is a second oscillator at `f * 2^(cents/1200)`.

## Design

Candidate A is the one that shipped. Tracker columns (`songColumns`, `songHits`, `sfxHits`) and the envelope plan are pure data. The Web Audio engine schedules them. The WAV script mixes them in software. Music state is one cursor, `{ origin, index, stepDur, cols, voices }`, or null. Step time is `origin + index * stepDur`.

Candidate B was a sample-accurate fake context that was also the mixer. That fused the test double with the renderer, so it was dropped.

Throughput stayed serial. One worker owns the planner, the songs, the fake, the tests, and the renderer, because they share one data shape.

How and architect ran in this thread. Subagents are forbidden. Interrogate was skipped because `docs/architecture.md` already closed the synth contract. Opening a PR was skipped because the unit ends at commits on `u5-audio` plus this report.

## Principles

Model the Domain. Music state is the play cursor. Song and effect identity lives in the column data.

Foundational Thinking. The column parser and `envelopePlan` exist before the sequencer loop. The clock multiplies by the step duration instead of adding it.

Boundary Discipline. `AudioFactory` is the only door to `react-native-audio-api`. The interpreter, the tests, and the renderer stay on the structural interfaces.

Type System Discipline. `bar()` takes 16 tokens, so a short bar fails `tsc`. The sim switch ends in `never`. `patchOf` returns `Patch`. There is no `any`.

Laziness Protocol. A time jump leaves the next step at `origin + index * stepDur`. The optional factory is the only signature change.

Build the Lever. `scripts/render-song.ts` writes the files a person can play.

Prove It Works. The matching surface for the schedule is the fake graph. The matching surface for listening is the WAV.

Test Behavior Not Implementation. The assertions name start times, frequencies, and gain events.

Sequence Verifiable Units. Song data was committed after it typechecked. The engine was committed after `npm test`. The renderer was committed after the WAVs existed.

Minimize Reader Load. The pure planners sit above `createAudio`. The engine function is the only place that owns the cursor, the voice cap, and the interval.

Exhaust the Design Space. Two shapes were compared. The shared planner won.

Separate Before Serializing. There was one writer, so there was no handoff to checkpoint.

Comment Sicko. Comments that stayed explain a constraint the next reader cannot see from the names. The envelope floor exists because the library rejects a ramp to 0. A later `stop()` overwrites `stopTime_` in `react-native-audio-api`, which is how the voice cap cuts a note. The session comment explains why options are set before the context. The skeleton's engine comments stayed because they are the ownership contract.
