import type { LevelNumber } from './levels';
import { isUnlocked, type Save } from './save';
import type { EventOf, Stars } from './sim';

/** The run a screen belongs to. A settings screen opened from pause keeps it, so resuming cannot lose the World key. */
export interface Run { readonly level: LevelNumber; readonly attempt: number }

export type Screen =
  | { readonly s: 'title' }
  | { readonly s: 'levels' }
  | { readonly s: 'settings'; readonly back: 'title' | 'levels' }
  | { readonly s: 'settings'; readonly back: 'paused'; readonly level: LevelNumber; readonly attempt: number }
  | { readonly s: 'play'; readonly level: LevelNumber; readonly attempt: number } // (level, attempt) keys the World
  | { readonly s: 'paused'; readonly level: LevelNumber; readonly attempt: number }
  | { readonly s: 'complete'; readonly level: LevelNumber; readonly score: number; readonly stars: Stars }
  | { readonly s: 'gameover'; readonly level: LevelNumber; readonly score: number };
export type Action =
  | { readonly a: 'start' } | { readonly a: 'pick'; readonly level: LevelNumber }
  | { readonly a: 'pause' } | { readonly a: 'resume' } | { readonly a: 'quit' }
  | { readonly a: 'retry' } | { readonly a: 'next' } | { readonly a: 'settings' } | { readonly a: 'back' }
  | { readonly a: 'ended'; readonly result: EventOf<'won'> | EventOf<'lost'> };

export const TITLE: Screen = { s: 'title' };

/** The live run behind a screen, or null when no World should exist. The shell rebuilds its World whenever this key changes. */
export function runOf(s: Screen): Run | null {
  switch (s.s) {
    case 'play': case 'paused': return { level: s.level, attempt: s.attempt };
    case 'settings': return s.back === 'paused' ? { level: s.level, attempt: s.attempt } : null;
    default: return null;
  }
}

/** Actions invalid for the current screen return `s` unchanged, so duplicate dispatches are harmless. */
export function reduce(s: Screen, act: Action, save: Save): Screen {
  switch (s.s) {
    case 'title':
      if (act.a === 'start') return { s: 'levels' };
      if (act.a === 'settings') return { s: 'settings', back: 'title' };
      return s;
    case 'levels':
      if (act.a === 'pick') return isUnlocked(save, act.level) ? { s: 'play', level: act.level, attempt: 0 } : s;
      if (act.a === 'settings') return { s: 'settings', back: 'levels' };
      if (act.a === 'back') return { s: 'title' };
      return s;
    case 'settings':
      if (act.a !== 'back') return s;
      return s.back === 'paused' ? { s: 'paused', level: s.level, attempt: s.attempt } : { s: s.back };
    case 'play':
      if (act.a === 'pause') return { s: 'paused', level: s.level, attempt: s.attempt };
      if (act.a === 'quit') return { s: 'levels' };
      if (act.a === 'ended') {
        return act.result.e === 'won'
          ? { s: 'complete', level: s.level, score: act.result.score, stars: act.result.stars }
          : { s: 'gameover', level: s.level, score: act.result.score };
      }
      return s;
    case 'paused':
      if (act.a === 'resume') return { s: 'play', level: s.level, attempt: s.attempt };
      if (act.a === 'retry') return { s: 'play', level: s.level, attempt: s.attempt + 1 };
      if (act.a === 'quit') return { s: 'levels' };
      if (act.a === 'settings') return { s: 'settings', back: 'paused', level: s.level, attempt: s.attempt };
      return s;
    case 'complete':
      if (act.a === 'next') return s.level === 30 ? { s: 'levels' } : { s: 'play', level: (s.level + 1) as LevelNumber, attempt: 0 };
      if (act.a === 'retry') return { s: 'play', level: s.level, attempt: 0 };
      if (act.a === 'quit') return { s: 'levels' };
      return s;
    case 'gameover':
      if (act.a === 'retry') return { s: 'play', level: s.level, attempt: 0 };
      if (act.a === 'quit') return { s: 'levels' };
      return s;
  }
}
