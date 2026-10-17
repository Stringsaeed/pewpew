import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
import { Canvas, useCanvasRef } from 'react-native-webgpu';
import { createAudio, type AudioEngine } from './src/audio';
import { createDevTools, PERF, PERF_AUTORUN, PERF_PLAN, perfLog, type DevTools } from './src/dev/qa';
import { reduce, runOf, TITLE, type Action, type Screen } from './src/flow';
import { allEntries, BOARD, winEntries } from './src/leaderboards';
import { parseSave, recordRun } from './src/save';
import type { Hud as HudState, SimEvent } from './src/sim';
import { createLoop, drag, press, rapidRemaining, release, resetRun, setPlaying, type Sinks } from './src/shell/loop';
import { useAudioLifecycle } from './src/shell/useAudioLifecycle';
import { useGameCenter, type GameCenterApi } from './src/shell/useGameCenter';
import { useGpu } from './src/shell/useGpu';
import { useSave } from './src/shell/useSave';
import { Screens } from './src/ui/Screens';
import { color } from './src/ui/theme';

export default function App() {
  const canvasRef = useCanvasRef();
  const widthRef = useRef(0);
  widthRef.current = useWindowDimensions().width;
  const { save, saveRef, commitSave } = useSave();
  const [screen, dispatch] = useReducer(
    (s: Screen, a: Action) => reduce(s, a, saveRef.current ?? parseSave(null)),
    TITLE,
  );
  const [hud, setHud] = useState<HudState | null>(null);
  const [autoOn, setAutoOn] = useState(false);
  const gc = useGameCenter();
  const gcRef = useRef<GameCenterApi>(gc);
  gcRef.current = gc;
  /** The player's rank on the level just cleared; cleared when the next run ends so a stale value never shows. */
  const [rank, setRank] = useState<{ level: number; rank: number; total: number } | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  audioRef.current ??= createAudio();
  const audio = audioRef.current;
  const loop = useRef(createLoop()).current;
  const toolsRef = useRef<DevTools | null>(null);
  if ((__DEV__ || PERF) && toolsRef.current === null) toolsRef.current = createDevTools(loop, setAutoOn);
  const tools = toolsRef.current;
  const run = useMemo(() => runOf(screen), [screen]);
  const onMenu = screen.s === 'title' || screen.s === 'levels' || (screen.s === 'settings' && run === null);

  useEffect(() => {
    setPlaying(loop, screen.s === 'play');
    if (resetRun(loop, run)) {
      tools?.resetTimer();
      setHud(null);
    }
  }, [screen, run, loop, tools]);

  // A perf autorun build plays level 1 once per PERF_PLAN entry by itself, with AUTO on or off as planned (see src/dev/qa.ts).
  const perfRuns = useRef(0);
  useEffect(() => {
    if (!PERF_AUTORUN || save === null || tools === null) return;
    const id = setTimeout(() => {
      if (screen.s === 'title') dispatch({ a: 'start' });
      else if (screen.s === 'levels') dispatch({ a: 'pick', level: 1 });
      else if (screen.s === 'play' && loop.auto !== (PERF_PLAN[perfRuns.current] === 'auto')) tools.toggleAuto();
      else if (screen.s === 'complete' || screen.s === 'gameover') {
        perfRuns.current += 1;
        if (perfRuns.current < PERF_PLAN.length) dispatch({ a: 'retry' });
        else perfLog(`[pewpew] perf done after ${perfRuns.current} runs`);
      }
    }, 1500);
    return () => clearTimeout(id);
  }, [screen, save, tools, loop]);

  // Once per sign-in, push every best the save already holds, so progress made offline or signed out catches up.
  const playerId = gc.player?.id ?? null;
  const saveLoaded = save !== null;
  useEffect(() => {
    if (playerId === null || !saveLoaded || saveRef.current === null) return;
    void gcRef.current.submit(allEntries(saveRef.current));
  }, [playerId, saveLoaded, saveRef]);

  useAudioLifecycle(audio, run !== null && screen.s !== 'play', onMenu, save, () => {
    if (!loop.playing) return;
    setPlaying(loop, false);
    dispatch({ a: 'pause' });
  });

  const sinksRef = useRef<Sinks | null>(null);
  if (sinksRef.current === null) {
    sinksRef.current = {
      render() {},
      audio(events) { audio.events(events); },
      ended(ev: SimEvent) {
        if (ev.e !== 'won' && ev.e !== 'lost') return;
        setRank(null);
        dispatch({ a: 'ended', result: ev });
      },
      terminal(ev) {
        const level = loop.world?.spec.n;
        if (ev.e === 'won' && level !== undefined && saveRef.current) {
          const next = recordRun(saveRef.current, level, ev.score, ev.stars);
          commitSave(next);
          const g = gcRef.current;
          void g.submit(winEntries(next, level))
            .then(() => g.rank(BOARD.level(level)))
            .then((entry) => { if (entry !== null) setRank({ level, rank: entry.rank, total: entry.total }); });
        }
        tools?.logBot(loop);
      },
      hud(next) { setHud(next); },
    };
  }

  const reduceMotion = useGpu(canvasRef, loop, sinksRef.current, tools?.sample ?? null);

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics} style={styles.root}>
      <StatusBar style="light" />
      {/* Android: the default SurfaceView is its own layer and hid every screen drawn over it; a TextureView composes in view order. */}
      <Canvas ref={canvasRef} style={StyleSheet.absoluteFill} transparent={Platform.OS === 'android'} />
      {save === null ? null : (
        <Screens
          save={save}
          screen={screen}
          hud={hud}
          run={run}
          act={(a) => { if (loop.hold !== null && a.a === 'pause') return; audio.ui('tap'); dispatch(a); }}
          commitSave={commitSave}
          auto={tools === null ? undefined : { on: autoOn, onToggle: tools.toggleAuto }}
          onUnlockAll={tools === null ? undefined : () => commitSave(tools.unlock(save))}
          onTouchStart={(e) => press(loop, e.nativeEvent.pageX)}
          onTouchMove={(e) => drag(loop, e.nativeEvent.pageX, widthRef.current)}
          onTouchEnd={() => release(loop)}
          rapid={rapidRemaining(loop.world)}
          reduceMotion={reduceMotion}
          ranks={gc.available ? { show: gc.show, current: rank } : undefined}
        />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
});
