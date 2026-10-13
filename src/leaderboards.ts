import { LEVELS, type LevelNumber } from './levels';
import type { Save } from './save';

/**
 * Game Center leaderboard IDs. These must match the vendor identifiers in App Store Connect
 * (scripts/asc-leaderboards.ts creates them; docs/game-center.md explains the manual path).
 */
export const BOARD = {
  /** Sum of every level's best score. The campaign ranking. */
  score: 'pewpew.total_score',
  /** Stars earned across all levels, 0..90. */
  stars: 'pewpew.total_stars',
  level: (n: LevelNumber): string => `pewpew.level.${String(n).padStart(2, '0')}`,
} as const;

export interface Entry { readonly board: string; readonly value: number }

export function totals(save: Save): { readonly score: number; readonly stars: number } {
  return save.levels.reduce((t, r) => ({ score: t.score + r.best, stars: t.stars + r.stars }), { score: 0, stars: 0 });
}

/** Every board that has something to report. Pushed once after sign-in so an earlier offline streak catches up. */
export function allEntries(save: Save): readonly Entry[] {
  const t = totals(save);
  const levels = LEVELS.flatMap((l) => {
    const best = save.levels[l.n - 1].best;
    return best > 0 ? [{ board: BOARD.level(l.n), value: best }] : [];
  });
  return t.score > 0 ? [...levels, { board: BOARD.score, value: t.score }, { board: BOARD.stars, value: t.stars }] : [];
}

/** The boards a win on level `n` can have moved: that level and both totals. `save` is the save after recordRun. */
export function winEntries(save: Save, n: LevelNumber): readonly Entry[] {
  const t = totals(save);
  return [{ board: BOARD.level(n), value: save.levels[n - 1].best }, { board: BOARD.score, value: t.score }, { board: BOARD.stars, value: t.stars }];
}

/** One native submit call per distinct value, since GameKit takes a value plus a list of boards. Order is first-seen. */
export function batches(entries: readonly Entry[]): readonly { readonly value: number; readonly boards: readonly string[] }[] {
  const byValue = new Map<number, string[]>();
  for (const e of entries) {
    const boards = byValue.get(e.value);
    if (boards === undefined) byValue.set(e.value, [e.board]);
    else if (!boards.includes(e.board)) boards.push(e.board);
  }
  return [...byValue].map(([value, boards]) => ({ value, boards }));
}

/** Max-merges entries into a pending queue keyed by board, so repeated offline wins collapse to one submission each. */
export function enqueue(queue: ReadonlyMap<string, number>, entries: readonly Entry[]): Map<string, number> {
  const next = new Map(queue);
  for (const e of entries) next.set(e.board, Math.max(next.get(e.board) ?? 0, e.value));
  return next;
}
