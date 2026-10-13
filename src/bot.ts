import { ARCHETYPES, Kind } from './levels';
import { BOLT_SPEED, COAST, FIRE_TICKS, PLAYER_RADIUS, PLAYER_X_LIMIT, STEP, TICKS_PER_SEC, steerVelocity, type Bot } from './sim';

const LANES: number[] = [];
for (let lane = -PLAYER_X_LIMIT; lane <= PLAYER_X_LIMIT; lane += 1) LANES.push(lane);
const HORIZON = 3;
const SAMPLES = 5;
const PATH_TICKS = 3;
const PATH_DT = PATH_TICKS * STEP;
const PATH_POINTS = Math.floor(HORIZON / PATH_DT) + 1;
const MARGIN = 0.3;
const FIRE_PERIOD = FIRE_TICKS / TICKS_PER_SEC;
// A rocket against the wall has one escape direction, so the bot prefers room on both sides.
const CORNER = 0.04;

const paths = new Float64Array(LANES.length * PATH_POINTS);

/**
 * Looks 3 s ahead, scores 9 lanes by threat (hazards, enemy bolts, well cores) minus pickup value, steers to the best.
 * Each lane's path is the rocket's real steering response from its current x and velocity. For each body the bot finds
 * the window in which the body overlaps the rocket's row and samples it against that path, so threats beside or across
 * the path count too. Contact costs full weight and a near miss a quarter; a shootable body dead ahead with time to
 * kill it costs little. No memory between calls, so two runs of a level make identical choices.
 */
export const greedyBot: Bot = (w) => {
  const p = w.player, b = w.bodies;
  const pvy = w.phase.p === 'fly' ? w.spec.scroll : 0;
  for (let l = 0; l < LANES.length; l++) {
    let x = p.x, vx = p.vx;
    for (let s = 0; s < PATH_POINTS; s++) {
      paths[l * PATH_POINTS + s] = x;
      for (let k = 0; k < PATH_TICKS; k++) { vx = steerVelocity(x, vx, LANES[l]); x += vx * STEP; }
    }
  }
  let best: number = LANES[0], bestScore = Infinity;
  for (let l = 0; l < LANES.length; l++) {
    const lane = LANES[l];
    let score = 0.02 * Math.abs(lane - p.x) + CORNER * Math.abs(lane);
    for (let i = 0; i < b.count; i++) {
      const k = b.kind[i] as Kind;
      const a = ARCHETYPES[k];
      if (a.role === 'playerShot') continue;
      const contact = a.radius + PLAYER_RADIUS;
      const reach = contact + (a.role === 'pickup' ? 0.2 : MARGIN);
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
        const ex = paths[l * PATH_POINTS + Math.floor(t / PATH_DT + 0.5)] - bx, ey = dy + rvy * t, d2 = ex * ex + ey * ey;
        if (d2 >= reach * reach) continue;
        if (a.role === 'pickup') score -= (k === Kind.Crystal ? 0.15 : 0.6) / (0.5 + t);
        else {
          const killable = a.hp > 0 && Math.abs(lane - bx) < a.radius && t > b.hp[i] * FIRE_PERIOD + dy / BOLT_SPEED + 0.3;
          score += (killable ? 0.2 : 1) * (d2 < contact * contact ? 1 : 0.25) / (0.2 + t);
        }
        break;
      }
    }
    if (w.boss !== null) {
      const bx = w.boss.x + (w.boss.x - w.boss.px) / STEP * 0.45;
      score -= 0.25 * Math.max(0, 1 - Math.abs(lane - bx) / 1.5);
    }
    if (score < bestScore) { bestScore = score; best = lane; }
  }
  return { targetX: best };
};
export const idleBot: Bot = () => COAST;
