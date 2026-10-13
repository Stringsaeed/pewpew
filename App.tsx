import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Canvas, useCanvasRef } from 'react-native-webgpu';
import { createAudio, type AudioEngine } from './src/audio';
import { createDevTools, type DevTools } from './src/dev/qa';
import { reduce, runOf, TITLE, type Action, type Screen } from './src/flow';
import { parseSave, recordRun } from './src/save';
import type { Hud as HudState, SimEvent } from './src/sim';
import { createLoop, drag, press, rapidRemaining, release, resetRun, setPlaying, type Sinks } from './src/shell/loop';
import { useAudioLifecycle } from './src/shell/useAudioLifecycle';
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
  const audioRef = useRef<AudioEngine | null>(null);
  audioRef.current ??= createAudio();
  const audio = audioRef.current;
  const loop = useRef(createLoop()).current;
  const toolsRef = useRef<DevTools | null>(null);
  if (__DEV__ && toolsRef.current === null) toolsRef.current = createDevTools(loop, setAutoOn);
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
        dispatch({ a: 'ended', result: ev });
      },
      terminal(ev) {
        const level = loop.world?.spec.n;
        if (ev.e === 'won' && level !== undefined && saveRef.current) commitSave(recordRun(saveRef.current, level, ev.score, ev.stars));
        tools?.logBot(loop);
      },
      hud(next) { setHud(next); },
    };
  }

  const reduceMotion = useGpu(canvasRef, loop, sinksRef.current, tools?.sample ?? null);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Canvas ref={canvasRef} style={StyleSheet.absoluteFill} />
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
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
});
