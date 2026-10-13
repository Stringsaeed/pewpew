# Launch posts

Attach `marketing/out/pewpew-square.mp4` to LinkedIn and `marketing/out/pewpew-landscape.mp4` to X.
Every number below comes from the repo: `.audit/u7-report.md` for frame time, `.audit/perf-audit.md` for buffer writes, and `npm run verify` for the bot run.

Video alt text: PewPew gameplay on an iPhone, a neon rocket weaving through asteroids and fighting three bosses, with captions naming WebGPU, Reanimated 4, Argent, and synthesized audio.

## X thread

**1/**

> I shipped an iPhone game where every pixel is drawn by WebGPU.
>
> PewPew: 30 levels, 3 bosses, one rocket. React Native, WebGPU, and Reanimated 4, at ~3 ms of JS per frame.
>
> AI agents built it and play-tested it through Argent.
>
> Play it in your browser: pewpew.saeed.sh

**2/**

> Rendering: react-native-webgpu by @wcandillon gives JS a real GPU device.
>
> Four WGSL pipelines draw everything: a procedural nebula, instanced flat-shaded meshes, additive glow, and a fresnel shield. Each frame uploads its data in three buffer writes.

**3/**

> UI: @swmansion's Reanimated 4 runs score pops, lost lives, boss bars, and every panel on the UI thread.
>
> React re-renders only when a number on the HUD actually changes. The game loop never waits on React.

**4/**

> QA: Argent gave the agents hands on the iOS Simulator.
>
> They tapped through menus, steered the rocket, read the React tree, profiled frames, and recorded runs. They also staged every App Store screenshot and this video.

**5/**

> Sound: react-native-audio-api synthesizes the music and sound effects at runtime from data.
>
> The app ships zero audio files. The 3D meshes come from a script too.

**6/**

> The sim is deterministic TypeScript at a fixed 60 Hz.
>
> A greedy bot flies all 30 levels on every check, and each replay has to be bit-identical. If a difficulty column ever goes down between levels, the game refuses to load.

**7/**

> The website runs the same TypeScript renderer on your browser's WebGPU, so the demo there is the real game.
>
> Open source: github.com/Stringsaeed/pewpew
> Free on the App Store: apps.apple.com/app/id6822155755

### Single-post version

> PewPew is out on iPhone: a neon space shooter with 30 levels and 3 bosses.
>
> Every pixel is WebGPU, the UI runs on Reanimated 4, and AI agents play-tested it on the simulator through Argent. It's free, open source, and playable in your browser.
>
> pewpew.saeed.sh

## LinkedIn

> I just shipped PewPew, a neon space shooter for iPhone. It has 30 levels, 3 bosses, and one rocket. It's free, has no ads, and the whole thing is open source.
>
> I wanted to see how far React Native can go on graphics when you skip the usual game engine. So PewPew renders every frame with WebGPU, written in TypeScript.
>
> The stack:
>
> → WebGPU, through react-native-webgpu by William Candillon. Four WGSL pipelines draw the whole game: a procedural nebula, instanced flat-shaded meshes, additive glow, and a fresnel shield. Each frame uploads its data in three buffer writes.
>
> → Reanimated 4 by Software Mansion. Score pops, lost lives, boss health bars, and every panel animate on the UI thread. React re-renders only when a number on the HUD changes, so the game loop never waits on React.
>
> → Argent by Software Mansion. This is what let AI agents test a game. Through Argent they tapped through menus, steered the rocket, read the React tree, profiled frames, and recorded runs on the iOS Simulator. They also staged every App Store screenshot and the video in this post.
>
> → React Native Audio API. The music and sound effects are synthesized at runtime from data, and the app ships zero audio files.
>
> The whole game (simulation, bot, renderer, audio, and HUD) runs in about 3 ms of JavaScript per frame and held 60 fps in a simulator dev build.
>
> Agents in Cursor, Claude, GPT, and T3 Code wrote the code, and I directed them. The repo includes the `.audit/` folder of reports, traces, and captures they left along the way.
>
> The website runs the same renderer on your browser's WebGPU, so you can play the real game before you install it.
>
> Play it: https://pewpew.saeed.sh
> App Store: https://apps.apple.com/app/id6822155755
> Source: https://github.com/Stringsaeed/pewpew
>
> #ReactNative #WebGPU #GameDev #Expo #AIAgents
