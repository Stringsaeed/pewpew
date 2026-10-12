import type { LevelNumber } from './levels';
import type { Save } from './save';
import type { EventOf, Stars } from './sim';

const NI = (): never => { throw new Error('not implemented'); };

export type Screen =
  | { readonly s: 'title' }
  | { readonly s: 'levels' }
  | { readonly s: 'settings'; readonly back: 'title' | 'levels' | 'paused'; readonly level: LevelNumber | null }
  | { readonly s: 'play'; readonly level: LevelNumber; readonly attempt: number } // (level, attempt) keys the World
  | { readonly s: 'paused'; readonly level: LevelNumber; readonly attempt: number }
  | { readonly s: 'complete'; readonly level: LevelNumber; readonly score: number; readonly stars: Stars }
  | { readonly s: 'gameover'; readonly level: LevelNumber; readonly score: number };
export type Action =
  | { readonly a: 'start' } | { readonly a: 'pick'; readonly level: LevelNumber }
  | { readonly a: 'pause' } | { readonly a: 'resume' } | { readonly a: 'quit' }
  | { readonly a: 'retry' } | { readonly a: 'next' } | { readonly a: 'settings' } | { readonly a: 'back' }
  | { readonly a: 'ended'; readonly result: EventOf<'won'> | EventOf<'lost'> };
/** Actions invalid for the current screen return `s` unchanged, so duplicate dispatches are harmless. */
export function reduce(s: Screen, act: Action, save: Save): Screen { return NI(); }
