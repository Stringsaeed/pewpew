# How pewpew works

pewpew is an arcade shooter for iOS and Android. A rocket climbs a narrow track and fires on its own. You steer it with one finger past asteroids, mines, drones, and gravity wells, through 30 levels and 3 bosses.

This post follows the code from one tick of the simulation to the thread that plays the sound. Every figure imports the game's own TypeScript, so the game below is the real one, and every code excerpt is read from the source with its real line number.^[`explainer/build.mjs` bundles the modules under `src/` with esbuild and reads each excerpt from disk at build time. When the code changes, the post changes with it.]

{{hero}}

## Three rules shape the code

1. **The simulation is pure.** The same level and the same inputs produce the same world, to the last bit. The sim never reads a clock, never draws, and imports nothing from React Native.
2. **The renderer only reads.** It gets a `WorldView`, a read-only type of the world, and writing to it is a compile error.^[`src/sim/world.ts` has a function, `readonlyViewProof`, that writes to a `WorldView` under `@ts-expect-error`. If the type became writable, that line would stop being an error and the build would fail.]
3. **Sound only listens.** The audio engine reacts to events such as `fire` and `destroy` and never reads positions.

Together they let a script prove the game before it ships. The script plays every level in Node with a bot and checks that each one can be won. Because the sim is pure, the result also holds on your phone.

## The world is a table of numbers

The game state is one `World` object. Its main part is `bodies`: every asteroid, mine, drone, pickup, and bolt in play.

`bodies` is a struct of arrays, not an array of objects. Each field is its own typed array, so body *i* is spread across fields such as `kind[i]`, `x[i]`, and `y[i]`.

{{code:Bodies}}

The pool has 512 slots, allocated once. A new object per body, 60 times a second, would give the garbage collector work in the middle of a frame. Typed arrays allocate nothing per frame.

Here is a live pool from a level the bot is playing. Remove a body and watch the slot numbers.

{{pool}}

Removal is a swap-remove. The last body moves into the freed slot, which takes constant time, but a slot number is not an identity, because a body changes slots when another one dies. The code never keeps an index from one step to the next.

## One step runs ten stages in a fixed order

The game advances in fixed steps of 1/60 s. One call to `step(world, input, events)` advances the world one step by calling ten stages, and their order is the game's rules.

The walkthrough runs those stages one at a time on a real world. Each › calls the stage function and lists what it changed. Click a dotted name to open its source, and click again inside it to go deeper.

{{step}}

After the last stage, the walkthrough hashes its world and compares it with a copy advanced by the real `step()`. The hashes match, so what you stepped through is what the game does.^[The stage functions are private to `step.ts`. The post's bundler adds an export line to that file in its own bundle only. The game's source does not change. See `internals` in `build.mjs`.]

Two details are easy to miss. `collide` only marks a body dead by setting `hp = -1`, and nothing leaves the pool until `despawn`, so slot numbers stay valid inside the collision loops. Every result also goes into the `events` array as a plain object, such as `{ e: 'destroy', target, x, y }`. Code outside the sim learns what happened only from that array.

## Your finger sets a target, not a position

When you press, the game records where the rocket and your finger are. As you drag, `dragInput` turns the finger's movement into a target x, and each step the rocket accelerates toward it.

{{steer}}

Two limits set how the rocket handles. Its speed is capped at 9 units per second, and its speed changes by at most 1 unit per second each step, so it cannot turn instantly. When you lift your finger, the velocity drops by 10% each step, and gravity wells keep pulling.

## Frames turn into whole steps

The display refreshes at 60 Hz, at 120 Hz, or slower when the phone is busy. The sim must not depend on that rate, or the proof would not hold. So each frame, `advance()` turns the elapsed time into whole steps.

This is a fixed timestep with an accumulator. `advance()` adds the frame's time to `loop.acc` and spends it in exact 1/60 s steps. The rest becomes `alpha`, which tells the renderer how far to draw between the last two steps.

{{frame}}

Try the "a stall" pattern. `advance()` clamps a 140 ms frame to 100 ms. That still needs six steps, but it runs at most four and drops the rest. The game slows for a moment instead of jumping ahead, so after a stall the game clock is a little behind the wall clock, never ahead.

## Each part runs in a different place

On a phone, one frame passes through several runtimes and threads before you see a pixel or hear a sound. The figure follows one frame through each of them.

{{threads}}

Three points stand out.

- **All the game logic runs on the JS thread.** The sim, the bot, the frame loop, and the renderer's CPU work all run in Hermes. This works because a step takes about a microsecond without the bot, and the frame loop does not allocate.
- **A WebGPU call is a direct call.** react-native-webgpu exposes Dawn, Google's C++ WebGPU implementation, through JSI. `device.queue.writeBuffer(...)` is a synchronous C++ call on the same thread. Dawn translates it to Metal on iOS and Vulkan on Android.^[Chrome also uses Dawn for WebGPU, but in a separate GPU process, and commands cross an IPC channel. That is why the hero figure can run the game's renderer unchanged.]
- **Sound and HUD animations run off the JS thread.** A native audio thread computes the audio samples, and Reanimated runs the HUD animations as worklets on the UI thread. JavaScript only schedules both.

The same split, by file:

{{runtimes}}

## Levels are data

No level has its own code. Each level is one row in a 30-row table. A row sets the track length, the scroll speed, the hazard density, which drones appear, and more. Click a field to see what it controls and how it changes across the levels.

{{level}}

`defineLevels` checks the table at import. It throws if a boss appears on a level other than 10, 20, or 30, if a mix weight is not positive, or if a column that `RAMP` marks `nondecreasing` goes down. A broken table never reaches the game or the verifier.

`compileTrack` turns a row into a track, a list of spawns sorted by distance, once when the level starts. It guarantees that every row of hazards has a gap at least 1.6 units wide, and that the gap moves no faster than the rocket can follow.

{{track}}

## Drones follow patterns, and bosses follow their health

A drone is a hazard with a motion pattern. Each pattern is a function from the world and a body index to a new position and velocity, kept in the `DRONE_MOVES` table.

{{drones}}

Bosses appear on levels 10, 20, and 30. Each boss has health phases. Below a set fraction of its hp, it sweeps faster, attacks more often, and uses a new list of attacks. The game never stores the current phase. `bossPhase` computes it from hp each time, so the phase cannot get out of sync with the health.

{{boss}}

## Collisions depend on a body's role

Every body has a role: hazard, pickup, field (a gravity well), player shot, or enemy shot. `collide` checks the role, never the kind, so a new kind of asteroid needs a new table row and no new branch.

Move the rocket around the body in the figure. Each move builds a world with one body, calls the real `collide()`, and lights the lines of code it ran.

{{collide}}

Every shape is a circle. Contact means the squared distance is less than the squared sum of the two radii. Pickups get an extra 0.25 units, so a near miss with a shield still collects it.

## The bot plays every level for the verifier

`greedyBot` plays the game for the verifier. Each step it scores nine lanes, one unit apart. For each lane it simulates the rocket's real steering for 3 seconds and adds a cost for each hazard, near miss, enemy bolt, and well in the way. Pickups lower the cost. Then it steers toward the lane with the lowest cost.

{{bot}}

The bot keeps no memory between calls, so the same world always gets the same lane and every run is reproducible. It loses a life on several of the later levels, but it wins all 30.^[The verifier checks that each level is won with no dropped spawns and that the replay hashes the same. It compares steps, score, stars, and hash with `scripts/verify-levels.golden.txt`, so a balance change shows up as a diff in review.]

{{code:greedyBot}}

## The proof compares hashes

`simulate` plays a level with the bot and records every input. `replay` feeds those inputs back into a new world. Because the sim is deterministic, both runs end in the same world, and `hashWorld` reduces each world to one number you can compare.

{{proof}}

The sim may not call `Math.sin`, `Math.cos`, or any other function whose result depends on the JavaScript engine. V8 runs the verifier and Hermes runs the phone, and the two can disagree in the last bit.

The flipped-bit test in the figure shows what such a disagreement does. Gameplay does not change, because steering pulls the rocket back to its lane.^[We changed one input by one ulp at six points in each of nine levels, once with fixed inputs and once with the bot deciding each step. In all 108 runs the hashes split for good, and score, lives, and body count never differed.] The proof does not. It compares hashes, and a hash cannot tell a harmless rounding difference from a bug. If the phone computed different bits, every golden hash would be wrong.

So the sim uses `sinT`, a polynomial built only from operations that IEEE 754 rounds the same way on every engine. A test scans every sim file and fails the build if it finds a banned call.

## The renderer draws a frame in four parts

The renderer is about 1,400 lines in seven hand-written files. Each frame it does four things.

1. Turns the frame's events into particle bursts, flashes, and screen shake. Particles exist only in the renderer, and the sim does not know about them.
2. Counting-sorts the live bodies by mesh and writes each one into an instance buffer as 12 floats.
3. Writes the view and projection matrices into a uniform block.
4. Draws four pipelines in one render pass: stars, then meshes, then additive glows, then the shield bubble.

The camera sits behind and below the rocket, pitched 16° and looking 6.5 units ahead. On narrow screens it moves back so the full track width fits.

{{camera}}

The shaders are written in TypeScript with TypeGPU and compiled to WGSL at build time, so the app ships only the WGSL strings. Meshes are generated at build time too, as typed arrays in `meshes.gen.ts`.

## Every sound is synthesized

The game has no audio files. Each sound comes from a small set of patches: a square, saw, sine, triangle, or noise wave, with an envelope and sometimes a filter or a pitch sweep. The music is four step-sequenced songs, one for each tier and one for bosses.

{{sound}}

Two details matter on a phone. Each sound effect has a voice cap, so rapid fire cannot stack hundreds of oscillators. And the engine schedules music slightly ahead on the audio clock instead of starting each note from JavaScript, so a slow frame does not delay the beat.

## Screens and the save use the same pure style

The menus are React Native views drawn over the game canvas. One pure function, `reduce(screen, action, save)`, decides which screen shows. Like the sim, it has no side effects, so `src/flow.test.ts` tests it with plain function calls.

{{flow}}

The save holds the best score and stars for each level, plus the music and sound switches. Unlocks are not stored. A level is open when the previous level has a star. Recording a run keeps the higher of the old and new values, so saving the same win twice changes nothing.

To check every claim in this post against the code, run `npm run check`. It typechecks, runs the tests, plays all 30 levels against the golden file, and checks that the generated meshes are current.
