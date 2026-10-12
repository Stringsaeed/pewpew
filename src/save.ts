import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LevelNumber } from './levels';
import type { Stars } from './sim';

const NI = (): never => { throw new Error('not implemented'); };

export interface LevelRecord { readonly best: number; readonly stars: 0 | Stars }
/** Unlock state is derived by isUnlocked, never stored. */
export interface Save {
  readonly v: 1;
  readonly levels: readonly LevelRecord[]; // index n-1, length 30 (parseSave guarantees)
  readonly music: boolean; readonly sfx: boolean;
}
export const SAVE_KEY = 'pewpew/save/v1';
/** Any missing or malformed input yields a fresh save. */
export function parseSave(raw: unknown): Save { return NI(); }
/** Max-merges best and stars, so recording the same run twice is idempotent. */
export function recordRun(s: Save, n: LevelNumber, score: number, stars: Stars): Save { return NI(); }
/** n === 1, or level n - 1 has at least one star. */
export function isUnlocked(s: Save, n: LevelNumber): boolean { return NI(); }
export async function loadSave(): Promise<Save> { return NI(); }
export async function writeSave(s: Save): Promise<void> { return NI(); }
