import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppState, PixelRatio, StyleSheet, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Canvas, useCanvasRef, type NativeCanvas } from 'react-native-webgpu';
import { reduce, runOf, TITLE, type Action, type Run, type Screen } from './src/flow';
import { loadSave, parseSave, recordRun, writeSave, type Save } from './src/save';
import { COAST, STEP, createWorld, dragInput, hudOf, step, type Hud as HudState, type Input, type SimEvent, type World } from './src/sim';
import { createRenderer, type Renderer } from './src/render';
import type { AudioEngine } from './src/audio';
import { greedyBot } from './src/bot';
import { createTickTimer, logAutoRun, unlockAll } from './src/dev/qa';
import { createAudio } from './src/audio';
import { Complete } from './src/ui/Complete';
import { GameOver } from './src/ui/GameOver';
import { Hud } from './src/ui/Hud';
import { LevelSelect } from './src/ui/LevelSelect';
import { Pause } from './src/ui/Pause';
import { Settings } from './src/ui/Settings';
import { Title } from './src/ui/Title';
import { color } from './src/ui/theme';

const MAX_STEPS_PER_FRAME = 4;

/** Everything the rAF tick reads and writes. Mutable on purpose: nothing here may cost a React render per frame. */
interface Loop {
  world: World | null;
  key: string | null;
  playing: boolean;
  input: Input;
  /** Dev only: greedyBot drives every step instead of touch. */
  auto: boolean;
  /** Every step of this world so far came from the bot, so its final hash is comparable with the verifier's. */
  botOnly: boolean;
  readonly events: SimEvent[];
  acc: number;
  last: number;
  hud: HudState | null;
}

const runKey = (r: Run | null) => (r === null ? null : `${r.level}:${r.attempt}`);

export default function App() {
  const canvasRef = useCanvasRef();
  const { width } = useWindowDimensions();
  const widthRef = useRef(width);
  widthRef.current = width;

  const saveRef = useRef<Save | null>(null);
  const [save, setSave] = useState<Save | null>(null);
  const [screen, dispatch] = useReducer(
    (s: Screen, a: Action) => reduce(s, a, saveRef.current ?? parseSave(null)),
    TITLE,
  );
  const [hud, setHud] = useState<HudState | null>(null);

  const audioRef = useRef<AudioEngine | null>(null);
  audioRef.current ??= createAudio();
  const audio = audioRef.current;

  const loop = useRef<Loop>({ world: null, key: null, playing: false, input: COAST, auto: false, botOnly: true, events: [], acc: 0, last: 0, hud: null }).current;
  if (__DEV__) (globalThis as { pewpew?: Loop }).pewpew = loop;
  const [auto, setAuto] = useState(false);
  const timer = useRef(createTickTimer()).current;
  const drag = useRef({ anchorX: 0, fx: 0 }).current;
  const foreground = useRef(true);

  const commitSave = useCallback((next: Save) => {
    if (next === saveRef.current) return;
    saveRef.current = next;
    setSave(next);
    void writeSave(next);
  }, []);

  useEffect(() => {
    let alive = true;
    void loadSave().then((s) => {
      if (!alive) return;
      saveRef.current = s;
      setSave(s);
    });
    return () => { alive = false; };
  }, []);

  const act = useCallback((a: Action) => {
    audio.ui('tap');
    dispatch(a);
  }, [audio]);

  const run = useMemo(() => runOf(screen), [screen]);
  const key = runKey(run);
  const onMenu = screen.s === 'title' || screen.s === 'levels' || (screen.s === 'settings' && run === null);
  const suspended = run !== null && screen.s !== 'play';

  useEffect(() => {
    loop.playing = screen.s === 'play';
    loop.input = COAST;
    if (key !== loop.key) {
      loop.key = key;
      loop.world = run === null ? null : createWorld(run.level);
      loop.botOnly = true;
      timer.reset();
      loop.acc = 0;
      loop.events.length = 0;
      loop.hud = null;
      setHud(null);
    }
  }, [screen, key, run, loop, timer]);

  useEffect(() => { loop.auto = auto; }, [auto, loop]);

  useEffect(() => {
    audio.active(foreground.current && !suspended);
    if (onMenu) audio.ui('menu-music');
  }, [audio, suspended, onMenu]);

  useEffect(() => {
    if (save) audio.mix({ music: save.music, sfx: save.sfx });
  }, [audio, save?.music, save?.sfx]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      foreground.current = state === 'active';
      if (!foreground.current) {
        audio.active(false);
        if (loop.playing) {
          loop.playing = false;
          dispatch({ a: 'pause' });
        }
      } else {
        audio.active(!suspended);
      }
    });
    return () => sub.remove();
  }, [audio, loop, suspended]);

  useEffect(() => {
    let frame = 0;
    let stopped = false;
    let renderer: Renderer | null = null;
    let device: GPUDevice | null = null;
    let format: GPUTextureFormat;
    let ctx: (GPUCanvasContext & { present(): void }) | null = null;

    const onEnded = (ev: SimEvent) => {
      if (ev.e !== 'won' && ev.e !== 'lost') return;
      loop.playing = false;
      const level = loop.world?.spec.n;
      if (ev.e === 'won' && level !== undefined && saveRef.current) commitSave(recordRun(saveRef.current, level, ev.score, ev.stars));
      if (__DEV__ && loop.botOnly && loop.world) logAutoRun(loop.world);
      dispatch({ a: 'ended', result: ev });
    };

    const tick = (now: number) => {
      const dt = Math.min((now - loop.last) / 1000, 0.1);
      loop.last = now;
      const world = loop.world;
      if (loop.playing && world) {
        loop.acc += dt;
        let steps = 0;
        while (loop.acc >= STEP && steps < MAX_STEPS_PER_FRAME) {
          if (!loop.auto) loop.botOnly = false;
          step(world, loop.auto ? greedyBot(world) : loop.input, loop.events);
          loop.acc -= STEP;
          steps += 1;
        }
        if (loop.acc >= STEP) loop.acc = 0;
      }
      renderer!.frame(world, loop.events, loop.acc / STEP, dt);
      audio.events(loop.events);
      for (const ev of loop.events) onEnded(ev);
      loop.events.length = 0;
      if (world) {
        const next = hudOf(world, loop.hud);
        if (next !== loop.hud) {
          loop.hud = next;
          setHud(next);
        }
      }
    };

    const frameFn = (now: number) => {
      if (stopped) return;
      frame = requestAnimationFrame(frameFn);
      if (!renderer) {
        // Layout size is 0 until the first layout pass, so retry on the next frame.
        const c = canvasRef.current?.getContext('webgpu') ?? null;
        const canvas = c?.canvas as unknown as NativeCanvas | undefined;
        if (!c || !canvas || canvas.clientWidth === 0 || canvas.clientHeight === 0 || !device) return;
        const ratio = PixelRatio.get();
        canvas.width = Math.round(canvas.clientWidth * ratio);
        canvas.height = Math.round(canvas.clientHeight * ratio);
        c.configure({ device, format, alphaMode: 'opaque' });
        ctx = c;
        renderer = createRenderer(device, ctx, format);
        loop.last = now;
        return;
      }
      if (!__DEV__ || !loop.playing || !loop.world) return tick(now);
      const t0 = performance.now();
      tick(now);
      timer.add(performance.now() - t0, loop.world.spec.n, loop.auto);
    };

    const init = async () => {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) throw new Error('no GPU adapter');
      device = await adapter.requestDevice();
      format = navigator.gpu.getPreferredCanvasFormat();
      if (!stopped) frame = requestAnimationFrame(frameFn);
    };

    init().catch((e) => console.error('[pewpew] webgpu init failed', e));
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      renderer?.dispose();
    };
  }, [audio, canvasRef, commitSave, loop, timer]);

  const onTouchStart = (e: GestureResponderEvent) => {
    drag.anchorX = loop.world?.player.x ?? 0;
    drag.fx = e.nativeEvent.pageX;
    loop.input = dragInput(drag.anchorX, 0);
  };
  const onTouchMove = (e: GestureResponderEvent) => {
    loop.input = dragInput(drag.anchorX, (e.nativeEvent.pageX - drag.fx) / widthRef.current);
  };
  const onTouchEnd = () => { loop.input = COAST; };

  const level = run?.level ?? 1;
  const setMusic = (music: boolean) => save && commitSave({ ...save, music });
  const setSfx = (sfx: boolean) => save && commitSave({ ...save, sfx });

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Canvas ref={canvasRef} style={StyleSheet.absoluteFill} />
      {save === null ? null : (
        <>
          {onMenu ? <View pointerEvents="none" style={styles.dim} /> : null}
          {screen.s === 'title' ? <Title save={save} onPlay={() => act({ a: 'start' })} onSettings={() => act({ a: 'settings' })} /> : null}
          {screen.s === 'levels' ? (
            <LevelSelect
              save={save}
              onPick={(n) => act({ a: 'pick', level: n })}
              onBack={() => act({ a: 'back' })}
              onSettings={() => act({ a: 'settings' })}
            />
          ) : null}
          {run !== null && hud !== null ? (
            <View
              style={StyleSheet.absoluteFill}
              onStartShouldSetResponder={() => screen.s === 'play'}
              onResponderGrant={onTouchStart}
              onResponderMove={onTouchMove}
              onResponderRelease={onTouchEnd}
              onResponderTerminate={onTouchEnd}
            >
              <Hud hud={hud} level={level} onPause={() => act({ a: 'pause' })} auto={__DEV__ ? { on: auto, onToggle: () => setAuto((a) => !a) } : undefined} />
            </View>
          ) : null}
          {screen.s === 'paused' ? (
            <Pause
              onResume={() => act({ a: 'resume' })}
              onRetry={() => act({ a: 'retry' })}
              onSettings={() => act({ a: 'settings' })}
              onQuit={() => act({ a: 'quit' })}
            />
          ) : null}
          {screen.s === 'settings' ? (
            <Settings
              music={save.music}
              sfx={save.sfx}
              onMusic={setMusic}
              onSfx={setSfx}
              onBack={() => act({ a: 'back' })}
              onUnlockAll={__DEV__ ? () => commitSave(unlockAll(save)) : undefined}
            />
          ) : null}
          {screen.s === 'complete' ? (
            <Complete
              level={screen.level}
              score={screen.score}
              stars={screen.stars}
              best={save.levels[screen.level - 1].best}
              onNext={() => act({ a: 'next' })}
              onRetry={() => act({ a: 'retry' })}
              onLevels={() => act({ a: 'quit' })}
            />
          ) : null}
          {screen.s === 'gameover' ? (
            <GameOver level={screen.level} score={screen.score} onRetry={() => act({ a: 'retry' })} onLevels={() => act({ a: 'quit' })} />
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5,5,15,0.35)' },
});
