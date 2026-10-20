import { BOSSES, DRONE_PATTERNS, Kind } from '../levels';
import type { BossAttack, BossPhase, BossSpec } from '../levels';
import { droneClock } from './drones';
import { PI, clamp, cosT, rand, sinT } from './math';
import {
  AIM_SPREAD, BOSS_R, BOSS_SWEEP, DRONE_ANCHOR_LIMIT, ENEMY_BOLT_SPEED, STEP, TICKS_PER_SEC, TRACK_HALF_WIDTH,
} from './rules';
import { add } from './world';
import type { Boss, SimEvent, World } from './world';

/** The last phase whose fraction is at or above the remaining health. Derived from hp, never stored. */
export function bossPhase(spec: BossSpec, hp: number): BossPhase {
  const health = hp / spec.hp;
  let phase: BossPhase = spec.phases[0];
  for (const ph of spec.phases) if (ph.atHpFraction >= health) phase = ph;
  return phase;
}

export function runBoss(w: World, boss: Boss, out: SimEvent[]): void {
  const phase = bossPhase(BOSSES[boss.id], boss.hp);
  boss.t += phase.sweepSpeed / BOSS_SWEEP * STEP;
  boss.x = BOSS_SWEEP * sinT(boss.t);
  if (w.tick < boss.attackAtTick) return;
  bossAttack(w, boss, phase.attacks[boss.attack % phase.attacks.length]);
  out.push({ e: 'enemyFire', x: boss.x, y: boss.y });
  boss.attack++;
  boss.attackAtTick = w.tick + Math.floor(phase.attackEverySec * TICKS_PER_SEC);
}

function bossAttack(w: World, boss: Boss, atk: BossAttack): void {
  const p = w.player, b = w.bodies;
  const y = boss.y - BOSS_R;
  switch (atk.a) {
    case 'spread': {
      const arc = atk.arcDeg * PI / 180;
      for (let k = 0; k < atk.bolts; k++) {
        const a = atk.bolts === 1 ? 0 : -arc / 2 + arc * k / (atk.bolts - 1);
        add(w, Kind.EnemyBolt, boss.x, y, ENEMY_BOLT_SPEED * sinT(a), -ENEMY_BOLT_SPEED * cosT(a));
      }
      return;
    }
    case 'aimed': {
      const dx = p.x - boss.x, dy = p.y - y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const ux = dx / len, uy = dy / len;
      for (let k = 0; k < atk.bolts; k++) {
        const a = (k - (atk.bolts - 1) / 2) * AIM_SPREAD;
        const c = cosT(a), s = sinT(a);
        add(w, Kind.EnemyBolt, boss.x, y, ENEMY_BOLT_SPEED * (ux * c - uy * s), ENEMY_BOLT_SPEED * (ux * s + uy * c));
      }
      return;
    }
    case 'mines': {
      // A wall across the track with two adjacent empty slots, so there is always a gap about 3 units wide.
      const slots = atk.count + 2;
      const skip = Math.floor(rand(w) * (slots - 1));
      const edge = TRACK_HALF_WIDTH - 0.6;
      for (let k = 0; k < slots; k++) {
        if (k === skip || k === skip + 1) continue;
        const i = add(w, Kind.Mine, -edge + 2 * edge * (k + 0.5) / slots, y, 0, -2.5);
        if (i >= 0) b.spin[i] = 1.5;
      }
      return;
    }
    case 'drones': {
      const pattern = DRONE_PATTERNS.indexOf(atk.pattern);
      for (let k = 0; k < atk.count; k++) {
        const x = clamp(boss.x + (k - (atk.count - 1) / 2) * 1.6, -DRONE_ANCHOR_LIMIT, DRONE_ANCHOR_LIMIT);
        const i = add(w, Kind.Drone, x, y, 0, 0);
        if (i < 0) continue;
        b.variant[i] = pattern; b.param[i] = x; b.t[i] = droneClock(w);
      }
      return;
    }
  }
}
