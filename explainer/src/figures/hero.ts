import { h } from '../dom';
import { figure, pill, segmented } from '../figure';
import { canvas2d, drawWorld } from '../world2d';
import { webAudio } from './sound';
import type { LevelNumber } from '../../../src/levels';
import { MAX_PIXEL_RATIO, createRenderer, type Renderer } from '../../../src/render';
import { advance, createLoop, drag, press, release, resetRun, setPlaying, type Sinks } from '../../../src/shell/loop';
import type { AudioEngine } from '../../../src/audio';

/**
 * The opening figure. This is App.tsx without React: the real shell loop (createLoop, resetRun, advance) drives the
 * real sim, and the real renderer (createRenderer, WebGPU) draws it. Where WebGPU is missing, a 2D reader draws instead.
 */
export function hero(): HTMLElement {
  const fig = figure('The game, running in this page', { wide: true });
  const gpuCanvas = h('canvas', { class: 'gpu' });
  const flat = canvas2d(300, 460);
  flat.el.style.display = 'none';
  const stage = h('div', { class: 'hero-stage' }, gpuCanvas, flat.el);
  const hud = h('div', { class: 'hero-hud mono' });
  const status = h('div', { class: 'hero-status' }, 'starting…');
  const loop = createLoop();
  let level: LevelNumber = 1;
  let attempt = 0;
  let renderer: Renderer | null = null;
  let view: 'renderer' | 'sim view' = 'renderer';
  let audio: AudioEngine | null = null;
  let visible = true;
  let raf = 0;

  const start = (): void => {
    attempt += 1;
    resetRun(loop, { level, attempt });
    setPlaying(loop, true);
  };

  const sinks: Sinks = {
    render(world, events, alpha, dt) {
      if (view === 'renderer' && renderer) renderer.frame(world, events, alpha, dt);
      else if (world) drawWorld(flat.ctx, world, { scale: 26, target: loop.input.targetX });
    },
    audio(events) { audio?.events(events); },
    ended(ev) {
      if (ev.e === 'won' || ev.e === 'lost') start();
    },
    hud(next) {
      hud.textContent = `score ${String(next.score).padStart(5)}   lives ${'▲'.repeat(next.lives)}${'·'.repeat(3 - next.lives)}   ${String(next.progress).padStart(3)}%${next.shield ? '   shield' : ''}${next.rapid ? '   rapid' : ''}${next.bossHp === null ? '' : `   boss ${next.bossHp}%`}`;
    },
    hold(kind, seconds) { renderer?.hold(kind, seconds); },
  };

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame);
    if (!visible) { loop.last = now; return; }
    advance(loop, now, sinks);
  };

  async function initGpu(): Promise<void> {
    const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
    if (!gpu) throw new Error('this browser has no WebGPU');
    const adapter = await gpu.requestAdapter();
    if (!adapter) throw new Error('no WebGPU adapter');
    const device = await adapter.requestDevice();
    const ctx = gpuCanvas.getContext('webgpu');
    if (!ctx) throw new Error('no webgpu canvas context');
    // react-native-webgpu needs an explicit present(); a browser presents on its own, so it is a no-op here.
    const native = Object.assign(ctx, { present() {} });
    renderer = createRenderer(device, native, gpu.getPreferredCanvasFormat(), Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  }

  const viewSeg = segmented(['renderer', 'sim view'] as const, 'renderer', (v) => {
    view = v;
    gpuCanvas.style.display = v === 'renderer' ? '' : 'none';
    flat.el.style.display = v === 'renderer' ? 'none' : '';
  }, (v) => (v === 'renderer' ? 'GPU renderer' : '2D sim view'));
  let soundOn = false;
  const soundBtn = pill('♪ sound off', () => {
    soundOn = !soundOn;
    if (audio === null) {
      // Created on the first click: browsers only start audio from a user gesture.
      audio = webAudio();
      audio.events([{ e: 'start', level }]);
    }
    audio.mix({ music: soundOn, sfx: soundOn });
    soundBtn.textContent = soundOn ? '♪ sound on' : '♪ sound off';
    soundBtn.classList.toggle('on', soundOn);
  });
  const botBtn = pill('let the bot fly', () => { loop.auto = true; botBtn.classList.add('on'); });
  botBtn.classList.add('on');

  fig.body.append(
    h('div', { class: 'hero' },
      stage,
      h('div', { class: 'hero-side' },
        hud,
        h('p', { class: 'hero-copy' }, 'greedyBot is flying. Press and drag on the game to take over. The figure calls the same ', h('code', { class: 'inline' }, 'press'), ', ', h('code', { class: 'inline' }, 'drag'), ', and ', h('code', { class: 'inline' }, 'release'), ' as the phone.'),
        h('div', { class: 'row' }, segmented([1, 5, 10, 21, 30] as const, 1, (v) => { level = v; attempt = 0; start(); }, (v) => `L${v}`).el),
        h('div', { class: 'row' }, viewSeg.el),
        h('div', { class: 'row' }, botBtn, soundBtn),
        status,
      ),
    ),
  );

  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId);
    loop.auto = false;
    botBtn.classList.remove('on');
    press(loop, e.pageX);
  });
  stage.addEventListener('pointermove', (e) => { if (stage.hasPointerCapture(e.pointerId)) drag(loop, e.pageX, stage.clientWidth); });
  stage.addEventListener('pointerup', () => release(loop));
  stage.addEventListener('pointercancel', () => release(loop));

  new IntersectionObserver((entries) => { visible = entries.some((en) => en.isIntersecting); }).observe(fig.el);

  loop.auto = true;
  start();
  initGpu()
    .then(() => { status.textContent = 'Drawn by the game\'s own createRenderer on WebGPU.'; })
    .catch((e: Error) => {
      status.textContent = `No WebGPU here (${e.message}), so the 2D sim view is drawing instead.`;
      viewSeg.set('sim view');
      view = 'sim view';
      gpuCanvas.style.display = 'none';
      flat.el.style.display = '';
    })
    .finally(() => {
      loop.last = performance.now();
      raf = requestAnimationFrame(frame);
    });
  fig.caption('`createLoop`, `resetRun`, `advance`, `step`, `greedyBot`, and `createRenderer` are imported from the game\'s source. Switch to the 2D sim view to see the same world drawn by a different reader.');
  void raf;
  return fig.el;
}
