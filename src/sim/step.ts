import { ARCHETYPES, BOSSES, DRONE_PATTERNS, Kind } from '../levels';
import type { PickupKind } from '../levels';
import {
  BOLT_RANGE, BOLT_SPEED, BOSS_DIST, BOSS_GRACE_TICKS, BOSS_R, BOSS_SCORE_PER_HP,
  COAST_DAMPING, DEAD, DESPAWN_BEHIND, ENEMY_BOLT_SPEED, FIRE_TICKS,
  HIT_INVULN_TICKS, PICKUP_SLACK, PLAYER_RADIUS, PLAYER_X_LIMIT, RAPID_TICKS,
  SHIELD_INVULN_TICKS, SPAWN_AHEAD, STEP, TRACK_HALF_WIDTH, WELL_REACH_Y,
} from './rules';
import { TWO_PI, cosT, rand, sinT } from './math';
import { runBoss } from './boss';
import { DRONE_MOVES, droneClock } from './drones';
import { steerVelocity } from './input';
import type { Input } from './input';
import { add, remove } from './world';
import type { Player, SimEvent, Stars, World } from './world';

// Every file in src/sim/ and levels.ts may use only + - * / and Math.sqrt, imul, floor, min, max, abs (sim.test.ts enforces it).
// Engine trig differs in the last ulp between Hermes and V8, which would make the verifier prove a slightly different
// game than the one on the phone. Those operations are correctly rounded by IEEE 754 on every engine.

/**
 * Advance one STEP. Appends events to `out`; the caller clears it once per rendered frame, after several steps.
 */
export function step(w: World, input: Input, out: SimEvent[]): void {
  if (w.phase.p === 'won' || w.phase.p === 'lost') return;
  const p = w.player, b = w.bodies;
  if (w.tick === 0) out.push({ e: 'start', level: w.spec.n });
  p.px = p.x; p.py = p.y;
  for (let i = 0; i < b.count; i++) { b.px[i] = b.x[i]; b.py[i] = b.y[i]; }
  if (w.boss !== null) w.boss.px = w.boss.x;

  steer(w, input);
  if (w.phase.p === 'fly') p.y += w.spec.scroll * STEP;
  spawnFromTrack(w);
  fire(w, out);
  if (w.boss !== null) runBoss(w, w.boss, out);
  moveBodies(w, out);
  collide(w, out);
  despawn(w);
  transition(w, out);
  w.tick++;
}

export function steer(w: World, input: Input): void {
  const p = w.player;
  p.vx = input.targetX === null ? p.vx * COAST_DAMPING : steerVelocity(p.x, p.vx, input.targetX);
  p.vx += wellPull(w) * STEP;
  p.x += p.vx * STEP;
  if (p.x > PLAYER_X_LIMIT) { p.x = PLAYER_X_LIMIT; p.vx = 0; }
  else if (p.x < -PLAYER_X_LIMIT) { p.x = -PLAYER_X_LIMIT; p.vx = 0; }
}

/** Lateral acceleration from every field body in reach: peaks at `param` about 0.7 units off the core, zero at the core. */
export function wellPull(w: World): number {
  const p = w.player, b = w.bodies;
  let a = 0;
  for (let i = 0; i < b.count; i++) {
    if (ARCHETYPES[b.kind[i] as Kind].role !== 'field') continue;
    const dy = b.y[i] - p.y;
    if (dy >= WELL_REACH_Y || dy <= -WELL_REACH_Y) continue;
    const dx = b.x[i] - p.x;
    a += b.param[i] * 1.4142135623730951 * dx / (0.5 + dx * dx) * (1 - dy * dy / (WELL_REACH_Y * WELL_REACH_Y));
  }
  return a;
}

export function spawnFromTrack(w: World): void {
  const b = w.bodies;
  while (w.cursor < w.track.length && w.track[w.cursor].y <= w.player.y + SPAWN_AHEAD) {
    const s = w.track[w.cursor++];
    const i = add(w, s.kind, s.x, s.y, 0, 0);
    if (i < 0) continue;
    b.variant[i] = s.variant;
    b.param[i] = s.param;
    b.spin[i] = (rand(w) - 0.5) * 3;
    if (s.kind === Kind.Asteroid) { b.vx[i] = s.param; b.vy[i] = -0.5; }
    else if (s.kind === Kind.Drone) b.t[i] = droneClock(w);
  }
}

export function fire(w: World, out: SimEvent[]): void {
  const p = w.player;
  if (w.tick < p.fireAtTick) return;
  const rapid = w.tick < p.rapidUntilTick;
  p.fireAtTick = w.tick + (rapid ? FIRE_TICKS / 2 : FIRE_TICKS);
  add(w, Kind.Bolt, p.x, p.y + 0.8, 0, BOLT_SPEED);
  out.push({ e: 'fire', x: p.x, y: p.y + 0.8, rapid });
}

export function moveBodies(w: World, out: SimEvent[]): void {
  const b = w.bodies, p = w.player;
  const rate = w.spec.droneFireRate;
  for (let i = 0; i < b.count; i++) {
    const k = b.kind[i] as Kind;
    b.t[i] += STEP;
    b.rot[i] += b.spin[i] * STEP;
    if (k === Kind.Drone) {
      DRONE_MOVES[DRONE_PATTERNS[b.variant[i]]](w, i);
      b.y[i] += b.vy[i] * STEP;
      const dy = b.y[i] - p.y;
      if (rate > 0 && dy > 1.5 && dy < 20 && Math.floor(b.t[i] * rate) > Math.floor((b.t[i] - STEP) * rate)) {
        const dx = p.x - b.x[i], len = Math.sqrt(dx * dx + dy * dy);
        add(w, Kind.EnemyBolt, b.x[i], b.y[i] - 0.4, ENEMY_BOLT_SPEED * dx / len, -ENEMY_BOLT_SPEED * dy / len);
        out.push({ e: 'enemyFire', x: b.x[i], y: b.y[i] });
      }
      continue;
    }
    b.x[i] += b.vx[i] * STEP;
    b.y[i] += b.vy[i] * STEP;
    if (k === Kind.Asteroid || k === Kind.Fragment) {
      const lim = TRACK_HALF_WIDTH - ARCHETYPES[k].radius;
      if ((b.x[i] > lim && b.vx[i] > 0) || (b.x[i] < -lim && b.vx[i] < 0)) b.vx[i] = -b.vx[i];
    }
  }
}

function hurt(w: World, out: SimEvent[]): void {
  const p = w.player;
  if (p.shield) {
    p.shield = false;
    p.invulnUntilTick = w.tick + SHIELD_INVULN_TICKS;
    out.push({ e: 'shieldBlock', x: p.x, y: p.y });
    return;
  }
  p.lives = (p.lives - 1) as Player['lives'];
  p.invulnUntilTick = w.tick + HIT_INVULN_TICKS;
  out.push({ e: 'playerHit', x: p.x, y: p.y, lives: p.lives });
}

function collect(w: World, kind: PickupKind, x: number, y: number, out: SimEvent[]): void {
  const p = w.player;
  if (kind === Kind.Shield) p.shield = true;
  else if (kind === Kind.Rapid) p.rapidUntilTick = w.tick + RAPID_TICKS;
  w.score += ARCHETYPES[kind].score;
  out.push({ e: 'pickup', kind, x, y });
}

export function collide(w: World, out: SimEvent[]): void {
  const p = w.player, b = w.bodies;
  const n = b.count;
  for (let i = 0; i < n; i++) {
    if (b.hp[i] < 0) continue;
    const k = b.kind[i] as Kind;
    const a = ARCHETYPES[k];
    if (a.role === 'playerShot') continue;
    const dx = b.x[i] - p.x, dy = b.y[i] - p.y;
    const rr = a.radius + PLAYER_RADIUS + (a.role === 'pickup' ? PICKUP_SLACK : 0);
    if (dx * dx + dy * dy >= rr * rr) continue;
    if (a.role === 'pickup') {
      collect(w, k as PickupKind, b.x[i], b.y[i], out);
      b.hp[i] = DEAD;
      continue;
    }
    if (w.tick < p.invulnUntilTick) continue;
    hurt(w, out);
    if (a.role === 'field') continue;
    b.hp[i] = DEAD;
    if (a.role === 'hazard') out.push({ e: 'destroy', target: k, x: b.x[i], y: b.y[i] });
  }

  const boss = w.boss;
  for (let j = 0; j < n; j++) {
    if (b.hp[j] < 0 || ARCHETYPES[b.kind[j] as Kind].role !== 'playerShot') continue;
    const bx = b.x[j], by = b.y[j], br = ARCHETYPES[Kind.Bolt].radius;
    if (boss !== null && boss.hp > 0) {
      const dx = boss.x - bx, dy = boss.y - by, rr = BOSS_R + br;
      if (dx * dx + dy * dy < rr * rr) {
        b.hp[j] = DEAD;
        boss.hp--;
        if (boss.hp > 0) out.push({ e: 'hit', target: 'boss', x: bx, y: by });
        continue;
      }
    }
    for (let i = 0; i < n; i++) {
      if (b.hp[i] <= 0) continue;
      const k = b.kind[i] as Kind;
      const a = ARCHETYPES[k];
      if (a.role !== 'hazard') continue;
      const dx = b.x[i] - bx, dy = b.y[i] - by, rr = a.radius + br;
      if (dx * dx + dy * dy >= rr * rr) continue;
      b.hp[j] = DEAD;
      if (--b.hp[i] > 0) { out.push({ e: 'hit', target: k, x: b.x[i], y: b.y[i] }); break; }
      b.hp[i] = DEAD;
      w.score += a.score;
      out.push({ e: 'destroy', target: k, x: b.x[i], y: b.y[i] });
      if (a.splitInto !== null) split(w, i, a.splitInto.kind, a.splitInto.count);
      break;
    }
  }
}

function split(w: World, i: number, kind: Kind, count: number): void {
  const b = w.bodies;
  const x = b.x[i], y = b.y[i], vx = b.vx[i], vy = b.vy[i];
  const base = rand(w) * TWO_PI;
  for (let k = 0; k < count; k++) {
    const a = base + TWO_PI * k / count;
    const j = add(w, kind, x, y, vx + 2.2 * cosT(a), vy + 2.2 * sinT(a));
    if (j < 0) continue;
    b.variant[j] = k;
    b.spin[j] = (rand(w) - 0.5) * 6;
  }
}

export function despawn(w: World): void {
  const b = w.bodies, p = w.player;
  const behind = p.y - DESPAWN_BEHIND, ahead = p.y + BOLT_RANGE, side = TRACK_HALF_WIDTH + 2;
  for (let i = b.count - 1; i >= 0; i--) {
    if (b.hp[i] < 0 || b.y[i] < behind || b.y[i] > ahead || b.x[i] > side || b.x[i] < -side) remove(b, i);
  }
}

export function transition(w: World, out: SimEvent[]): void {
  const p = w.player;
  if (p.lives === 0) {
    w.phase = { p: 'lost' };
    out.push({ e: 'lost', score: w.score });
    return;
  }
  const boss = w.boss;
  if (boss !== null && boss.hp <= 0) {
    out.push({ e: 'destroy', target: 'boss', x: boss.x, y: boss.y });
    w.score += BOSSES[boss.id].hp * BOSS_SCORE_PER_HP;
    // The boss's bolts die with it, so the flight to the wormhole is a victory lap, not a cleanup.
    const b = w.bodies;
    for (let i = b.count - 1; i >= 0; i--) if (ARCHETYPES[b.kind[i] as Kind].role === 'enemyShot') remove(b, i);
    w.boss = null;
    w.wormholeY = boss.y;
    w.phase = { p: 'fly' };
    out.push({ e: 'wormholeOpen', y: boss.y });
  } else if (w.phase.p === 'fly' && w.spec.boss !== null && w.wormholeY === null && p.y >= w.spec.length) {
    w.phase = { p: 'boss' };
    w.boss = { id: w.spec.boss, x: 0, px: 0, y: p.y + BOSS_DIST, hp: BOSSES[w.spec.boss].hp, attack: 0, attackAtTick: w.tick + BOSS_GRACE_TICKS, t: 0 };
    out.push({ e: 'bossEnter', boss: w.spec.boss });
  }
  const wy = w.wormholeY;
  if (wy === null) return;
  if (p.py + SPAWN_AHEAD < wy && wy <= p.y + SPAWN_AHEAD) out.push({ e: 'wormholeOpen', y: wy });
  if (p.y >= wy) {
    const stars = p.lives as Stars;
    w.phase = { p: 'won', stars };
    out.push({ e: 'won', score: w.score, stars });
  }
}
