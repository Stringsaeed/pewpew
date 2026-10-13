import { createAudio, type AudioEngine, type BaseAudioContextLike } from '@game/audio';
import type { LevelNumber } from '@game/levels';
import { MAX_PIXEL_RATIO, createRenderer, type Renderer } from '@game/render';
import { advance, createLoop, drag, press, release, resetRun, setPlaying, type Sinks } from '@game/shell/loop';
import type { EventOf, Hud } from '@game/sim';

type Ctx = GPUCanvasContext & { present(): void };
export type Result = EventOf<'won'> | EventOf<'lost'>;

let shared: Promise<GPUDevice | null> | null = null;

/** One device for every canvas on the page. Null when the browser has no WebGPU. */
export function getDevice(): Promise<GPUDevice | null> {
  shared ??= (async () => {
    if (!('gpu' in navigator)) return null;
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      return adapter ? await adapter.requestDevice() : null;
    } catch {
      return null;
    }
  })();
  return shared;
}

/** The renderer was written against react-native-webgpu, which needs an explicit present(). The browser presents on its own. */
function contextOf(canvas: HTMLCanvasElement): Ctx | null {
  const ctx = canvas.getContext('webgpu');
  return ctx ? Object.assign(ctx, { present() {} }) : null;
}

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Runs `tick` on rAF only while `el` is on screen and the tab is visible. */
function whileVisible(el: Element, tick: (now: number, dt: number) => void, onChange?: (on: boolean) => void): () => void {
  let raf = 0;
  let last = 0;
  let inView = false;
  let running = false;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    tick(now, dt);
  };
  const sync = () => {
    const want = inView && document.visibilityState === 'visible';
    if (want === running) return;
    running = want;
    if (want) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else cancelAnimationFrame(raf);
    onChange?.(want);
  };
  const io = new IntersectionObserver(([entry]) => { inView = entry?.isIntersecting ?? false; sync(); }, { threshold: 0.05 });
  io.observe(el);
  document.addEventListener('visibilitychange', sync);
  return () => {
    io.disconnect();
    document.removeEventListener('visibilitychange', sync);
    cancelAnimationFrame(raf);
  };
}

/** The menu backdrop from the app: three parallax star layers and the tier nebula, no world. */
export function mountBackdrop(canvas: HTMLCanvasElement, device: GPUDevice): () => void {
  const ctx = contextOf(canvas);
  if (!ctx) return () => {};
  const renderer = createRenderer(device, ctx, navigator.gpu.getPreferredCanvasFormat(), Math.min(devicePixelRatio, 1.5));
  renderer.setReduceMotion(reduceMotion());
  const stop = whileVisible(canvas, (_, dt) => renderer.frame(null, [], 0, dt));
  return () => { stop(); renderer.dispose(); };
}

export interface GameView {
  hud(hud: Hud): void;
  intro(level: LevelNumber): void;
  ended(result: Result, level: LevelNumber, attract: boolean): void;
  mode(attract: boolean): void;
  telemetry(fps: number, cpuMs: number, bodies: number): void;
}

export interface Game {
  start(level: LevelNumber, attract: boolean): void;
  setAutopilot(on: boolean): void;
  setSound(on: boolean): void;
  readonly level: LevelNumber;
  readonly attract: boolean;
  dispose(): void;
}

const KEY_DIR: Record<string, -1 | 1> = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 };

export function mountGame(canvas: HTMLCanvasElement, input: HTMLElement, device: GPUDevice, view: GameView): Game | null {
  const ctx = contextOf(canvas);
  if (!ctx) return null;
  const renderer: Renderer = createRenderer(device, ctx, navigator.gpu.getPreferredCanvasFormat(), Math.min(devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setReduceMotion(reduceMotion());
  const loop = createLoop();
  let level: LevelNumber = 1;
  let attempt = 0;
  let attract = true;
  let audio: AudioEngine | null = null;
  let soundOn = false;
  let keyDir = 0;

  const sinks: Sinks = {
    render(world, events, alpha, dt) { renderer.frame(world, events, alpha, dt); },
    audio(events) { if (soundOn) audio?.events(events); },
    ended(ev) { if (ev.e === 'won' || ev.e === 'lost') view.ended(ev, level, attract); },
    hud(next) { view.hud(next); },
    hold(kind, seconds) { renderer.hold(kind, seconds); },
  };

  let frames = 0, cpu = 0, windowStart = performance.now();
  const stop = whileVisible(canvas, (now) => {
    const world = loop.world;
    if (keyDir !== 0 && world && !loop.auto) loop.input = { targetX: world.player.x + keyDir * 4 };
    const t0 = performance.now();
    advance(loop, now, sinks);
    cpu += performance.now() - t0;
    frames += 1;
    if (now - windowStart >= 500) {
      view.telemetry((frames * 1000) / (now - windowStart), cpu / frames, loop.world?.bodies.count ?? 0);
      frames = 0; cpu = 0; windowStart = now;
    }
  }, (on) => {
    if (loop.world && loop.hold === null && loop.world.phase.p !== 'won' && loop.world.phase.p !== 'lost') setPlaying(loop, on);
    if (soundOn) audio?.active(on);
  });

  const takeStick = () => {
    if (!attract) return;
    attract = false;
    loop.auto = false;
    view.mode(false);
  };
  const onDown = (e: PointerEvent) => {
    takeStick();
    if (loop.auto) return;
    input.setPointerCapture(e.pointerId);
    press(loop, e.clientX);
  };
  const onMove = (e: PointerEvent) => {
    if (!input.hasPointerCapture(e.pointerId) || loop.auto) return;
    drag(loop, e.clientX, input.getBoundingClientRect().width);
  };
  const onUp = () => release(loop);
  const onKey = (e: KeyboardEvent) => {
    const dir = KEY_DIR[e.code];
    if (dir === undefined) return;
    e.preventDefault();
    if (e.type === 'keydown') { takeStick(); keyDir = dir; }
    else if (keyDir === dir) { keyDir = 0; release(loop); }
  };
  input.addEventListener('pointerdown', onDown);
  input.addEventListener('pointermove', onMove);
  input.addEventListener('pointerup', onUp);
  input.addEventListener('pointercancel', onUp);
  input.addEventListener('keydown', onKey);
  input.addEventListener('keyup', onKey);

  const game: Game = {
    start(n, auto) {
      level = n;
      attempt += 1;
      attract = auto;
      loop.auto = auto;
      keyDir = 0;
      resetRun(loop, { level: n, attempt });
      setPlaying(loop, true);
      view.mode(auto);
      view.intro(n);
    },
    setAutopilot(on) {
      loop.auto = on;
      if (!on) release(loop);
    },
    setSound(on) {
      soundOn = on;
      if (on && !audio) {
        audio = createAudio({
          configureSession() {},
          createContext: () => new AudioContext() as unknown as BaseAudioContextLike,
        });
      }
      if (!audio) return;
      audio.active(on);
      if (!on) return;
      const boss = loop.world?.boss;
      audio.events([boss ? { e: 'bossEnter', boss: boss.id } : { e: 'start', level }]);
    },
    get level() { return level; },
    get attract() { return attract; },
    dispose() {
      stop();
      input.removeEventListener('pointerdown', onDown);
      input.removeEventListener('pointermove', onMove);
      input.removeEventListener('pointerup', onUp);
      input.removeEventListener('pointercancel', onUp);
      input.removeEventListener('keydown', onKey);
      input.removeEventListener('keyup', onKey);
      audio?.active(false);
      renderer.dispose();
    },
  };
  return game;
}
