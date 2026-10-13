import { BOSSES } from '../levels';
import type { WorldView } from './world';

export interface Hud {
  readonly score: number; readonly lives: number; readonly progress: number; // 0..100 integer
  readonly shield: boolean; readonly rapid: boolean; readonly bossHp: number | null; // 0..100
}
/** Returns `prev` itself when nothing visible changed, so React's setState bails out at 60 fps. */
export function hudOf(w: WorldView, prev: Hud | null): Hud {
  const p = w.player;
  const score = w.score;
  const lives = p.lives;
  const progress = Math.floor(100 * Math.min(1, p.y / w.spec.length));
  const shield = p.shield;
  const rapid = w.tick < p.rapidUntilTick;
  const max = w.boss === null ? 0 : BOSSES[w.boss.id].hp;
  const bossHp = w.boss === null ? null : Math.floor((100 * Math.max(0, w.boss.hp) + max - 1) / max);
  if (prev !== null && prev.score === score && prev.lives === lives && prev.progress === progress
    && prev.shield === shield && prev.rapid === rapid && prev.bossHp === bossHp) return prev;
  return { score, lives, progress, shield, rapid, bossHp };
}
