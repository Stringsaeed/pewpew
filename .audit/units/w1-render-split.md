# W1-render: make the renderer testable and split src/render.ts into src/render/

Worktree: /Users/saeed/.t3/projects/pewpew-render, branch `w1-render` from `game` after wave 0.
Device for the final smoke: iPhone 17 simulator udid 52721D7F-9573-4DFB-AC70-37FCE1B5AE20, Metro port 8081 (kill any Metro on 8081 first, it belongs to another checkout; start yours from this worktree). Bundle id com.saeed.pewpew. Build with `npx expo run:ios --device 52721D7F-9573-4DFB-AC70-37FCE1B5AE20` from the worktree if the installed app does not connect.

Gates after every commit: `npm run check`. The golden hashes never change (render does not touch the sim).

Commit 1 (the test seam): `createRenderer(device, ctx, format, pixelRatio)` takes the pixel ratio as a parameter instead of importing PixelRatio from react-native (App passes `Math.min(PixelRatio.get(), MAX_PIXEL_RATIO)`). Canvas sizing and `ctx.configure` happen in exactly one place (the renderer), remove the duplicate in App.tsx. Add `src/testing/fake-gpu.ts`: a recording GPUDevice, command encoder, and render pass that log every call (createBuffer, writeBuffer with byte length, setPipeline, setBindGroup, setVertexBuffer, setIndexBuffer, draw, drawIndexed, submit, present) plus stubs for the `GPUBufferUsage`, `GPUShaderStage`, `GPUTextureUsage` globals. Add `src/render.test.ts` that builds a renderer on the fake, runs 100 frames against `createWorld(1)` stepped with `greedyBot` and `createWorld(10)` stepped into the boss phase, and asserts: one `drawIndexed` per non-empty mesh group, instance counts equal bodies per mesh, zero buffer or texture creation after the first frame, a null world draws only stars and particles, `dispose` destroys every created buffer. Also write a snapshot: with `Math.random` stubbed to a fixed sequence, serialize the call log and the instance float arrays for frames 1, 50, 100 to `src/testing/render.snapshot.json` and assert equality. The snapshot is the refactor guard for the commits below.

Commit 2: `git mv src/render.ts src/render/index.ts`, `git mv src/meshes.gen.ts src/render/meshes.gen.ts`, update `scripts/gen-meshes.ts` output path, update imports. `npm run gen:meshes -- --check` must still pass.

Commits 3 to 7, one file each, snapshot must not change:
```
src/render/look.ts       LOOK table and the visual radii, each stated relative to the hit radius from ARCHETYPES
src/render/wgsl.ts       uniform struct plus the stars, mesh, and glow shaders as exported strings
src/render/particles.ts  particle pool, event to burst mapping, integration (pure, no GPU)
src/render/camera.ts     view and projection uniform computation (pure)
src/render/batch.ts      kind to mesh tables, counting sort, instance packing (pure)
```
`src/render/index.ts` keeps GPU resources, pipelines, pass encoding, resize, dispose, and composes the pure modules.

Last commit: update docs/architecture.md module map. Then device smoke: launch the app on the simulator, play level 1 with AUTO, and a boss level (10) with AUTO via UNLOCK ALL in Settings; take one screenshot of each to `.audit/w1-render-smoke-*.png`; read the JS log with debugger-log-registry and confirm the `[pewpew] level 1 hash e9ab99ad` and `level 10 hash 23c74b19` lines and zero JS errors. Stop the simulator server for this udid only when done.

Rules: no visual change at all in this task (the design pass comes after), no new dependencies, nothing outside `src/render/`, `src/testing/`, `src/render.test.ts`, `App.tsx` (only the sizing lines and the import path), `scripts/gen-meshes.ts` (output path), docs/architecture.md. Argent MCP rules: describe before every tap, never tap from screenshot coordinates.

Report: commits, `npm run check` tail, snapshot status, smoke evidence file names and the two hash lines.
