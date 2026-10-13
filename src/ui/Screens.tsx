import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';
import type { Action, Run, Screen } from '../flow';
import { BOARD } from '../leaderboards';
import { levelSpec, tierOf } from '../levels';
import type { Save } from '../save';
import type { Hud as HudState } from '../sim';
import { Complete } from './Complete';
import { GameOver } from './GameOver';
import { Hud } from './Hud';
import { LevelIntro } from './LevelIntro';
import { LevelSelect } from './LevelSelect';
import { Pause } from './Pause';
import { Settings } from './Settings';
import { Title } from './Title';

const INTRO_MS = 1200;

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
  /** Rapid window still left, 0..1, so the RAPID chip can drain between hud updates. */
  readonly rapid?: number;
  /** When set, panels fade in instead of zooming. */
  readonly reduceMotion?: boolean;
  /** Game Center. Absent where it does not exist, which hides every leaderboard button. */
  readonly ranks?: {
    readonly show: (board?: string) => void;
    /** The player's rank on the level just cleared, once known. */
    readonly current: { readonly level: number; readonly rank: number; readonly total: number } | null;
  };
}

/** Which screen is on top of the canvas. The canvas itself stays in App. */
export function Screens({ save, screen, hud, run, act, commitSave, auto, onUnlockAll, onTouchStart, onTouchMove, onTouchEnd, rapid, reduceMotion, ranks }: Props) {
  const onMenu = screen.s === 'title' || screen.s === 'levels' || (screen.s === 'settings' && run === null);
  const level = run?.level ?? 1;
  const intro = useIntro(hud, run);
  const reached = useRef(0);
  if (hud !== null) reached.current = hud.progress;
  return (
    <>
      {onMenu ? <View pointerEvents="none" style={styles.dim} /> : null}
      {intro !== null && hud !== null ? (
        <LevelIntro sector={tierOf(intro.level)} level={intro.level} warning={levelSpec(intro.level).boss !== null} />
      ) : null}
      {screen.s === 'title' ? (
        <Title save={save} onPlay={() => act({ a: 'start' })} onSettings={() => act({ a: 'settings' })} onRanks={ranks ? () => ranks.show(BOARD.score) : undefined} />
      ) : null}
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
          <Hud hud={hud} level={level} onPause={() => act({ a: 'pause' })} auto={auto} rapid={rapid} />
        </View>
      ) : null}
      {screen.s === 'paused' ? (
        <Pause
          onResume={() => act({ a: 'resume' })}
          onRetry={() => act({ a: 'retry' })}
          onSettings={() => act({ a: 'settings' })}
          onQuit={() => act({ a: 'quit' })}
          reduceMotion={reduceMotion}
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
          reduceMotion={reduceMotion}
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
          onRanks={ranks ? () => ranks.show(BOARD.level(screen.level)) : undefined}
          rank={ranks?.current !== null && ranks?.current.level === screen.level ? ranks.current : null}
          reduceMotion={reduceMotion}
        />
      ) : null}
      {screen.s === 'gameover' ? (
        <GameOver
          level={screen.level}
          score={screen.score}
          best={save.levels[screen.level - 1].best}
          reached={reached.current}
          onRetry={() => act({ a: 'retry' })}
          onLevels={() => act({ a: 'quit' })}
          reduceMotion={reduceMotion}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5,5,15,0.35)' },
});

/** Shows the sector card once per run key, starting the frame `hud` becomes non-null, for 1.2 s. */
function useIntro(hud: HudState | null, run: Run | null): Run | null {
  const hudOn = hud !== null;
  const key = run === null ? null : `${run.level}:${run.attempt}`;
  const [card, setCard] = useState<string | null>(null);
  const finished = useRef<string | null>(null);
  useEffect(() => {
    if (!hudOn || key === null) return;
    if (finished.current === key) return;
    setCard(key);
    const id = setTimeout(() => {
      finished.current = key;
      setCard((current) => (current === key ? null : current));
    }, INTRO_MS);
    return () => clearTimeout(id);
  }, [hudOn, key]);
  if (run === null || card !== key) return null;
  return run;
}
