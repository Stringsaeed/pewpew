import { h, svg } from '../dom';
import { codeView } from '../code';
import { figure, playback, rich, segmented } from '../figure';

type Lane = 'build' | 'js' | 'ui' | 'dawn' | 'gpu' | 'audio' | 'io';
type Where = 'phone' | 'page';
const LANES: readonly Lane[] = ['build', 'js', 'ui', 'dawn', 'gpu', 'audio', 'io'];
const LABEL: Record<Where, Record<Lane, string>> = {
  phone: {
    build: 'Your Mac · Node',
    js: 'JS thread · Hermes',
    ui: 'UI thread · native',
    dawn: 'Dawn · C++ via JSI',
    gpu: 'GPU · Metal / Vulkan',
    audio: 'Audio thread · native',
    io: 'Native async · I/O',
  },
  page: {
    build: 'build.mjs · Node',
    js: 'Main thread · V8',
    ui: 'Main thread · DOM',
    dawn: 'GPU process · Dawn',
    gpu: 'GPU · your machine',
    audio: 'Web Audio thread',
    io: 'unused (save stubbed)',
  },
};

interface Hop { readonly lanes: readonly Lane[]; readonly title: string; readonly phone: string; readonly page: string; readonly code?: string }
const HOPS: readonly Hop[] = [
  { lanes: ['build'], title: 'Before the app exists',
    phone: '`npm run gen:meshes` writes every mesh as typed arrays, and `npm run gen:shaders` resolves the TypeGPU shader functions to plain WGSL strings in `shaders.gen.ts`, so TypeGPU never ships. `npm run verify` plays all 30 levels in Node\'s V8. Metro bundles the TypeScript, and release builds compile it to Hermes bytecode.',
    page: '`build.mjs` bundles the same `src/` files with esbuild for the browser, and reads every code excerpt in this post from disk.' },
  { lanes: ['ui', 'js'], title: 'A finger moves', code: 'drag',
    phone: 'The touch lands on the UI thread. React Native hands `onTouchMove` to the JS thread, where `drag()` only writes a new target into `loop.input`. No simulation runs in a touch handler.',
    page: 'Pointer events fire on the main thread, which is also where JS runs. The hero figure calls the same `press` / `drag` / `release`.' },
  { lanes: ['js'], title: 'vsync: the frame callback', code: 'gpuFrame',
    phone: '`requestAnimationFrame` calls `frameFn` on the JS thread, once per display refresh. On the first call it creates the renderer. After that it calls `advance()`.',
    page: 'The browser\'s `requestAnimationFrame` calls the same `advance()`.' },
  { lanes: ['js'], title: 'The sim steps', code: 'step',
    phone: 'Up to four `step()` calls, plus `greedyBot` in AUTO mode. This is plain TypeScript with no native calls, and the same code runs in Node for the tests and the verifier.',
    page: 'The same `step()` on V8. Its arithmetic is restricted so that V8 and Hermes agree to the bit.' },
  { lanes: ['js'], title: 'The renderer\'s CPU half', code: 'writeCamera',
    phone: '`renderer.frame` ages effects, spawns particles from events, counting-sorts bodies into instance arrays, and writes the camera matrices. All of it is JavaScript filling preallocated `Float32Array`s.',
    page: 'The same code. The post imports `createRenderer` from `src/render`.' },
  { lanes: ['js', 'dawn'], title: 'WebGPU calls cross into C++',
    phone: '`queue.writeBuffer`, `beginRenderPass`, `drawIndexed` are JSI host functions. Each is a synchronous call from Hermes into Dawn\'s C++ on the same JS thread, with no bridge and no serialisation. Dawn validates the calls and records native commands.',
    page: 'Chrome\'s WebGPU is also Dawn, but it runs in a separate GPU process. Calls are queued across an IPC channel instead of made inline.' },
  { lanes: ['dawn', 'gpu'], title: 'The GPU draws',
    phone: '`queue.submit` hands the frame to the GPU, which runs four WGSL pipelines in one pass: stars, meshes, additive glow, and last the shield bubble. Dawn compiled the WGSL into Metal shaders on iOS or SPIR-V for Vulkan on Android when the renderer started.',
    page: 'The same WGSL, compiled by Chrome\'s Dawn for your GPU.' },
  { lanes: ['gpu', 'ui'], title: 'Present',
    phone: '`ctx.present()` queues the image to a `CAMetalLayer` on iOS or a `TextureView` on Android, in FIFO mode, so it waits for vsync. The native compositor puts it under the React views.',
    page: 'The browser presents the canvas itself, so the post passes a no-op `present()`.' },
  { lanes: ['js', 'audio'], title: 'Sound', code: 'pump',
    phone: 'The frame\'s events go to the audio engine, which creates oscillator, gain, and filter nodes through JSI, each stamped with a start time on the audio clock. Samples are computed on the native audio thread: AVAudioEngine on iOS, Oboe on Android. A 25 ms JS timer keeps music queued 120 ms ahead.',
    page: 'The same engine on Web Audio. The browser renders the nodes on its own audio thread.' },
  { lanes: ['js', 'ui'], title: 'HUD and screens', code: 'hudOf',
    phone: 'Only when `hudOf` returns a new object does React re-render. The new view tree is committed on the UI thread. HUD effects (the hurt vignette, life icon pop, rapid-fire bar) are Reanimated animations that then run on the UI thread with no JS involved.',
    page: 'This post has no React. The hero figure writes the HUD text directly.' },
  { lanes: ['js', 'io'], title: 'A level is won', code: 'appSinks',
    phone: 'The terminal sink records the run, and `AsyncStorage.setItem` writes the save on a native background thread. The Game Center module, in Swift, submits scores with async/await. Sign-in and the leaderboard sheet run on the main queue.',
    page: 'The save is stubbed out here, and there is no Game Center.' },
];

/** One frame of pewpew traced across every place code runs, on the phone or in this page. */
export function threadsFigure(): HTMLElement {
  const fig = figure('Where each part runs', { wide: true });
  let where: Where = 'phone';
  let i = 1;
  const lanesEl = h('div', { class: 'lanes' });
  const text = h('div', { class: 'walk-text' });
  const codeBox = h('div');

  function paint(): void {
    const hop = HOPS[i]!;
    const W = 640, rowH = 26, labelW = 170, colW = (W - labelW - 10) / HOPS.length;
    const H = LANES.length * rowH + 8;
    const cy = (l: Lane) => 4 + LANES.indexOf(l) * rowH + rowH / 2;
    const cx = (k: number) => labelW + colW * k + colW / 2;
    const els: SVGElement[] = [];
    LANES.forEach((l, r) => {
      els.push(svg('rect', { x: 0, y: 4 + r * rowH, width: W, height: rowH - 2, rx: 4, class: hop.lanes.includes(l) ? 'lane on' : 'lane' }));
      els.push(svg('text', { x: 8, y: 4 + r * rowH + 17, class: 'lane-label' }, LABEL[where][l]));
    });
    HOPS.forEach((hp, k) => {
      for (let j = 1; j < hp.lanes.length; j++) {
        els.push(svg('line', { x1: cx(k), x2: cx(k), y1: cy(hp.lanes[j - 1]!), y2: cy(hp.lanes[j]!), class: k === i ? 'hop on' : 'hop' }));
      }
      for (const l of hp.lanes) {
        const c = svg('circle', { cx: cx(k), cy: cy(l), r: k === i ? 7 : 4.5, class: k === i ? 'stop on' : k < i ? 'stop past' : 'stop' });
        c.addEventListener('click', () => { pb.stop(); i = k; paint(); });
        els.push(c);
      }
    });
    lanesEl.replaceChildren(svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart lanes-svg' }, ...els));
    fig.dots(HOPS.length, i);
    text.replaceChildren(h('div', { class: 'walk-top' }, h('span', { class: 'walk-n' }, `${i + 1}/${HOPS.length}`), h('span', { class: 'walk-title' }, hop.title)),
      h('div', { class: 'walk-note' }, rich(where === 'phone' ? hop.phone : hop.page)));
    codeBox.replaceChildren(hop.code ? codeView(hop.code, { maxHeight: 220 }).el : '');
  }
  const pb = playback({
    baseMs: 3200,
    prev: () => { i = (i - 1 + HOPS.length) % HOPS.length; paint(); },
    next: () => { i = (i + 1) % HOPS.length; paint(); },
  });
  fig.body.append(
    h('div', { class: 'row' }, segmented(['phone', 'page'] as const, where, (v) => { where = v; paint(); }, (v) => (v === 'phone' ? 'On the phone' : 'In this page')).el),
    lanesEl,
    text,
    pb.el,
    codeBox,
  );
  paint();
  fig.caption('Each column is one hop in the life of a frame. Click a dot to jump to it. Lit rows are the places involved. Switch to "In this page" to see where the same code runs as you read.');
  return fig.el;
}

const RUNTIMES: [string, string, string, string][] = [
  ['src/sim/*, src/levels.ts, src/bot.ts', 'TypeScript', 'JS thread (Hermes)', 'Node (V8): tests, verify, bench'],
  ['src/shell/loop.ts', 'TypeScript', 'JS thread', 'Node: loop.test.ts'],
  ['src/render/*.ts', 'TypeScript', 'JS thread, calling Dawn over JSI', 'Node: render.test.ts with a fake GPU'],
  ['src/render/shaders.gen.ts', 'WGSL strings', 'GPU, after Dawn compiles them', 'generated at build time'],
  ['src/render/shaders.ts', 'TypeGPU', 'not shipped', 'Node: npm run gen:shaders'],
  ['src/render/meshes.gen.ts', 'typed-array data', 'uploaded once to GPU buffers', 'generated by gen:meshes'],
  ['src/audio/*', 'TypeScript', 'JS schedules, and the native audio thread renders', 'Node: audio.test.ts with a fake graph'],
  ['App.tsx, src/ui/*.tsx', 'React', 'JS thread, then views on the UI thread', 'none'],
  ['Reanimated styles in src/ui', 'worklets', 'UI thread', 'none'],
  ['modules/game-center', 'Swift (Expo module)', 'main queue and Swift async tasks', 'none'],
  ['AsyncStorage (save.ts)', 'native module', 'native background I/O', 'Node: save.test.ts covers the pure parts'],
  ['scripts/*.ts, plugins/*.js', 'TypeScript, JS', 'never on the phone', 'Node at build or prebuild'],
];

/** The same information as a table, by file. */
export function runtimesFigure(): HTMLElement {
  const fig = figure('Every file, and where it runs');
  fig.body.append(h('table', { class: 'rt' },
    h('thead', {}, h('tr', {}, h('th', {}, 'code'), h('th', {}, 'language'), h('th', {}, 'on the phone'), h('th', {}, 'elsewhere'))),
    h('tbody', {}, ...RUNTIMES.map(([a, b, c, d]) => h('tr', {}, h('td', { class: 'mono' }, a), h('td', {}, b), h('td', {}, c), h('td', { class: 'muted' }, d)))),
  ));
  return fig.el;
}
