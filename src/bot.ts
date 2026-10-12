import { ARCHETYPES, Kind } from './levels';
import { COAST, STEP, type Bot } from './sim';

const LANES = [-4, -3, -2, -1, 0, 1, 2, 3, 4] as const;
const HORIZON = 3;
const SAMPLES = 5;
// The bot's own model of the rocket, kept slightly pessimistic so it leaves margin.
const SHIP_R = 0.35;
const MARGIN = 0.3;
const LATERAL_SPEED = 7;
const BOLT_SPEED = 28;
const FIRE_PERIOD = 0.2;

/**
 * Looks 3 s ahead, scores 9 lanes by threat (hazards, enemy bolts, well cores) minus pickup value, steers to the best.
 * For each body it finds the time window in which the body overlaps the rocket's row, then samples that window
 * against the rocket flying straight toward the lane, so threats beside or across the path count too. A shootable
 * body dead ahead with time to kill it costs little. Stateless, so two runs of a level make identical choices.
 */
export const greedyBot: Bot = (w) => {
  const p = w.player, b = w.bodies;
  const pvy = w.phase.p === 'fly' ? w.spec.scroll : 0;
  let best: number = LANES[0], bestScore = Infinity;
  for (const lane of LANES) {
    let score = 0.02 * Math.abs(lane - p.x);
    for (let i = 0; i < b.count; i++) {
      const k = b.kind[i] as Kind;
      const a = ARCHETYPES[k];
      if (a.role === 'playerShot') continue;
      const reach = a.radius + SHIP_R + (a.role === 'pickup' ? 0.2 : MARGIN);
      const dy = b.y[i] - p.y, rvy = b.vy[i] - pvy;
      let t0 = 0, t1 = HORIZON;
      if (rvy < -0.01 || rvy > 0.01) {
        const ta = (dy - reach) / -rvy, tb = (dy + reach) / -rvy;
        t0 = Math.max(0, Math.min(ta, tb));
        t1 = Math.min(HORIZON, Math.max(ta, tb));
      } else if (dy > reach || dy < -reach) continue;
      if (t0 > t1) continue;
      for (let s = 0; s < SAMPLES; s++) {
        const t = t0 + (t1 - t0) * s / (SAMPLES - 1);
        const bx = b.x[i] + b.vx[i] * t;
        const sx = p.x + Math.max(-LATERAL_SPEED * t, Math.min(LATERAL_SPEED * t, lane - p.x));
        const ex = sx - bx, ey = dy + rvy * t;
        if (ex * ex + ey * ey >= reach * reach) continue;
        if (a.role === 'pickup') score -= (k === Kind.Crystal ? 0.15 : 0.6) / (0.5 + t);
        else {
          const killable = a.hp > 0 && Math.abs(lane - bx) < a.radius && t > b.hp[i] * FIRE_PERIOD + dy / BOLT_SPEED + 0.3;
          score += (killable ? 0.2 : 1) / (0.2 + t);
        }
        break;
      }
    }
    if (w.boss !== null) {
      const bx = w.boss.x + (w.boss.x - w.boss.px) / STEP * 0.45;
      score -= 0.8 * Math.max(0, 1 - Math.abs(lane - bx) / 1.5);
    }
    if (score < bestScore) { bestScore = score; best = lane; }
  }
  return { targetX: best };
};
export const idleBot: Bot = () => COAST;
