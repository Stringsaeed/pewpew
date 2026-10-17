# How pewpew works

A long-form, interactive post about the pewpew codebase, set in the game's own look: one monospaced family, the neon palette from `src/ui/theme.ts`, and numbered notes at the end. The figures run the game's own code:

- The opening figure is `App.tsx` without React: the real shell loop (`createLoop`, `resetRun`, `advance`) driving the real renderer (`createRenderer`) on browser WebGPU. Without WebGPU it falls back to a 2D view.
- Code walkthroughs step through real functions. `step()` runs its actual stage functions one at a time, diffs the world after each, and checks the result against the real `step()` by hash. `advance()` runs once per frame with a simulated clock.
- In any code block, a dotted name opens the callee's real source inline, nested up to three deep.
- Sound comes from the game's `createAudio` on a browser `AudioContext`.
- "Where each part runs" traces one frame across the JS thread, UI thread, Dawn, GPU, audio thread, and native I/O, for the phone or for this page.

## Run it

```sh
node explainer/build.mjs
python3 -m http.server 8787 --directory explainer/dist
```

Open http://localhost:8787 in Chrome (WebGPU needs a secure context, and localhost counts). `node explainer/build.mjs --watch` rebuilds on change, including `post.md`.

## Files

- `post.md`: the article, in a small Markdown dialect. `^[note]` adds a numbered endnote, and `{{figure}}` or `{{code:NAME}}` on its own line places a figure.
- `build.mjs`: renders the post, reads every code excerpt from `src/` at build time (`EXCERPTS`), and bundles the figures with esbuild. Its `pewpew-internals` plugin exposes the private stage functions of `step.ts` to the bundle only. The game source does not change.
- `src/code.ts`: the highlighter and live code blocks with call peeks. `src/figure.ts`: figure card, playback controls, and the walkthrough component.
- `src/figures/*.ts`: one file per topic. `src/world2d.ts`: a 2D world reader and an exact world clone.
- `stubs/`: empty stand-ins for AsyncStorage and react-native-audio-api, the only native imports on the bundled path.
- `site/fonts/`: [Paper Mono](https://paper.design/mono), self-hosted under the SIL Open Font License (`OFL.txt`), so the page loads nothing from the network.
- `dist/` and `build/` are generated and git-ignored.

## Type check

```sh
node_modules/.bin/tsc -p explainer/tsconfig.json
```

The root `tsconfig.json` excludes this folder, so `npm run typecheck` is unaffected.
