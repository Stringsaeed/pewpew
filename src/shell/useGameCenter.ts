import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { GameCenter, type LocalEntry, type Player } from '../../modules/game-center';
import { batches, enqueue, type Entry } from '../leaderboards';

export interface GameCenterApi {
  /** False where GameKit does not exist, so the UI hides every leaderboard affordance. */
  readonly available: boolean;
  /** The signed-in player, or null. */
  readonly player: Player | null;
  /**
   * Pushes entries to Game Center. Signed out, they wait in a max-merged queue that flushes on sign-in.
   * Resolves once this call's entries have been sent (or dropped because the player is signed out).
   */
  readonly submit: (entries: readonly Entry[]) => Promise<void>;
  /** Signs in if needed, then presents the native sheet on `board` (or the leaderboards tab when omitted). */
  readonly show: (board?: string) => void;
  /** The player's global rank on one board, or null when signed out, unranked, or offline. */
  readonly rank: (board: string) => Promise<LocalEntry | null>;
}

const SIGN_IN_HELP = 'Sign in to Game Center in the Settings app to see rankings.';

/**
 * Game Center session for the shell. Authenticates once on mount (GameKit shows its own sheet when the device has
 * no signed-in player) and keeps the queue of unsent scores while signed out.
 */
export function useGameCenter(): GameCenterApi {
  const [player, setPlayer] = useState<Player | null>(null);
  const playerRef = useRef<Player | null>(null);
  const queue = useRef<Map<string, number>>(new Map());

  const send = useCallback(async (entries: readonly Entry[]) => {
    if (GameCenter === null) return;
    for (const b of batches(entries)) {
      try { await GameCenter.submit(b.value, b.boards); } catch (err) {
        // Offline or a board that does not exist yet in App Store Connect. Keep the best known values for a later flush.
        queue.current = enqueue(queue.current, b.boards.map((board) => ({ board, value: b.value })));
        if (__DEV__) console.warn('[gamecenter] submit failed', err);
      }
    }
  }, []);

  const flush = useCallback(async () => {
    if (queue.current.size === 0 || playerRef.current === null) return;
    const pending = [...queue.current].map(([board, value]) => ({ board, value }));
    queue.current = new Map();
    await send(pending);
  }, [send]);

  useEffect(() => {
    if (GameCenter === null) return;
    const apply = (p: Player | null) => { playerRef.current = p; setPlayer(p); void flush(); };
    const sub = GameCenter.addListener('onAuth', (ev) => apply(ev.player));
    GameCenter.authenticate().then(apply, (err) => { if (__DEV__) console.warn('[gamecenter] authenticate failed', err); });
    return () => sub.remove();
  }, [flush]);

  const submit = useCallback(async (entries: readonly Entry[]) => {
    if (GameCenter === null) return;
    if (playerRef.current === null) { queue.current = enqueue(queue.current, entries); return; }
    await send(entries);
  }, [send]);

  const show = useCallback((board?: string) => {
    const gc = GameCenter;
    if (gc === null) return;
    const present = () => gc.show(board ?? null).catch((err: unknown) => { if (__DEV__) console.warn('[gamecenter] show failed', err); });
    if (playerRef.current !== null) { void present(); return; }
    gc.authenticate().then((p) => {
      if (p === null) Alert.alert('Game Center', SIGN_IN_HELP);
      else void present();
    }, () => Alert.alert('Game Center', SIGN_IN_HELP));
  }, []);

  const rank = useCallback(async (board: string) => {
    if (GameCenter === null || playerRef.current === null) return null;
    try { return await GameCenter.localEntry(board); } catch { return null; }
  }, []);

  return { available: GameCenter !== null, player, submit, show, rank };
}
