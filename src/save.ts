import AsyncStorage from '@react-native-async-storage/async-storage';
import { LEVEL_COUNT, type LevelNumber } from './levels';
import type { Stars } from './sim';

export interface LevelRecord { readonly best: number; readonly stars: 0 | Stars }
/** Unlock state is derived by isUnlocked, never stored. */
export interface Save {
  readonly v: 1;
  readonly levels: readonly LevelRecord[]; // index n-1, length 30 (parseSave guarantees)
  readonly music: boolean; readonly sfx: boolean;
}
export const SAVE_KEY = 'pewpew/save/v1';
const FRESH_RECORD: LevelRecord = { best: 0, stars: 0 };

function freshSave(): Save {
  return { v: 1, levels: Array.from({ length: LEVEL_COUNT }, () => FRESH_RECORD), music: true, sfx: true };
}

function parseRecord(raw: unknown): LevelRecord {
  if (typeof raw !== 'object' || raw === null) return FRESH_RECORD;
  const { best, stars } = raw as Record<string, unknown>;
  return {
    best: typeof best === 'number' && Number.isFinite(best) && best > 0 ? Math.floor(best) : 0,
    stars: stars === 1 || stars === 2 || stars === 3 ? stars : 0,
  };
}

/** Takes the stored string or its parsed value. Any missing or malformed input yields a fresh save. */
export function parseSave(raw: unknown): Save {
  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return freshSave(); }
  }
  if (typeof value !== 'object' || value === null) return freshSave();
  const o = value as Record<string, unknown>;
  const levels: unknown = o.levels;
  if (o.v !== 1 || !Array.isArray(levels)) return freshSave();
  return {
    v: 1,
    levels: Array.from({ length: LEVEL_COUNT }, (_, i) => parseRecord(levels[i])),
    music: typeof o.music === 'boolean' ? o.music : true,
    sfx: typeof o.sfx === 'boolean' ? o.sfx : true,
  };
}

/** Max-merges best and stars, so recording the same run twice is idempotent. */
export function recordRun(s: Save, n: LevelNumber, score: number, stars: Stars): Save {
  const prev = s.levels[n - 1];
  const best = Math.max(prev.best, score);
  const merged = Math.max(prev.stars, stars) as 0 | Stars;
  if (best === prev.best && merged === prev.stars) return s;
  return { ...s, levels: s.levels.map((r, i) => (i === n - 1 ? { best, stars: merged } : r)) };
}

export function isUnlocked(s: Save, n: LevelNumber): boolean {
  return n === 1 || s.levels[n - 2].stars > 0;
}

export async function loadSave(): Promise<Save> {
  try { return parseSave(await AsyncStorage.getItem(SAVE_KEY)); } catch { return freshSave(); }
}

export async function writeSave(s: Save): Promise<void> {
  await AsyncStorage.setItem(SAVE_KEY, JSON.stringify(s));
}
