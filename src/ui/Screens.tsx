import { StyleSheet, View, type GestureResponderEvent } from 'react-native';
import type { Action, Run, Screen } from '../flow';
import type { Save } from '../save';
import type { Hud as HudState } from '../sim';
import { Complete } from './Complete';
import { GameOver } from './GameOver';
import { Hud } from './Hud';
import { LevelSelect } from './LevelSelect';
import { Pause } from './Pause';
import { Settings } from './Settings';
import { Title } from './Title';

interface Props {
  readonly save: Save;
  readonly screen: Screen;
  readonly hud: HudState | null;
  readonly run: Run | null;
  readonly act: (a: Action) => void;
  readonly commitSave: (next: Save) => void;
  /** Dev only. Absent in release, which hides the AUTO chip. */
  readonly auto?: { readonly on: boolean; readonly onToggle: () => void };
  /** Dev only. Absent in release, which hides UNLOCK ALL. */
  readonly onUnlockAll?: () => void;
  readonly onTouchStart: (e: GestureResponderEvent) => void;
  readonly onTouchMove: (e: GestureResponderEvent) => void;
  readonly onTouchEnd: () => void;
}

/** Which screen is on top of the canvas. The canvas itself stays in App. */
export function Screens({ save, screen, hud, run, act, commitSave, auto, onUnlockAll, onTouchStart, onTouchMove, onTouchEnd }: Props) {
  const onMenu = screen.s === 'title' || screen.s === 'levels' || (screen.s === 'settings' && run === null);
  const level = run?.level ?? 1;
  return (
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
          <Hud hud={hud} level={level} onPause={() => act({ a: 'pause' })} auto={auto} />
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
          onMusic={(music) => commitSave({ ...save, music })}
          onSfx={(sfx) => commitSave({ ...save, sfx })}
          onBack={() => act({ a: 'back' })}
          onUnlockAll={onUnlockAll}
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
  );
}

const styles = StyleSheet.create({
  dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5,5,15,0.35)' },
});
