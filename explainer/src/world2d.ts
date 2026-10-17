import { ARCHETYPES, BOSSES, Kind } from '../../src/levels';
import { PLAYER_RADIUS, type World, type WorldView } from '../../src/sim';
import { BOSS_R, TRACK_HALF_WIDTH } from '../../src/sim/rules';

export const KIND_NAME = ['asteroid', 'fragment', 'mine', 'drone', 'well', 'crystal', 'shield', 'rapid', 'bolt', 'enemy bolt'] as const;
export const KIND_COLOR: Record<number, string> = {
  [Kind.Asteroid]: '#9aa1bd', [Kind.Fragment]: '#7a809b', [Kind.Mine]: '#ff5d6c', [Kind.Drone]: '#ffb84f',
  [Kind.Well]: '#a58bff', [Kind.Crystal]: '#4ff3ff', [Kind.Shield]: '#8dff6a', [Kind.Rapid]: '#ff9d4f',
  [Kind.Bolt]: '#4ff3ff', [Kind.EnemyBolt]: '#ff6a26',
};

export interface DrawOpts {
  /** Pixels per world unit. */
  readonly scale: number;
  /** Rocket height on screen, 0 top … 1 bottom. */
  readonly rocketAt?: number;
  readonly highlight?: ReadonlySet<number>;
  readonly target?: number | null;
  readonly hitboxes?: boolean;
}

/** A top-down debug view of a world. Purely a reader, like the real renderer. */
export function drawWorld(ctx: CanvasRenderingContext2D, w: WorldView, o: DrawOpts): void {
  const W = ctx.canvas.width / (window.devicePixelRatio > 1 ? 2 : 1);
  const H = ctx.canvas.height / (window.devicePixelRatio > 1 ? 2 : 1);
  const S = o.scale;
  const p = w.player;
  const sy = (y: number): number => H * (o.rocketAt ?? 0.78) - (y - p.y) * S;
  const sx = (x: number): number => W / 2 + x * S;
  ctx.fillStyle = '#05060d';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#272d48';
  for (let i = 0; i < 60; i++) ctx.fillRect((i * 97.3) % W, (i * 53.7 + p.y * S * 0.4) % H, 1.4, 1.4);
  ctx.font = '10px "Paper Mono", ui-monospace, monospace';
  ctx.fillStyle = '#3d4466';
  for (let y = Math.ceil((p.y - 8) / 10) * 10; y < p.y + 30; y += 10) { ctx.fillText(`y ${y}`, 4, sy(y) - 3); ctx.fillRect(0, sy(y), 10, 1); }
  ctx.strokeStyle = '#2b3557';
  ctx.lineWidth = 2;
  for (const e of [-TRACK_HALF_WIDTH, TRACK_HALF_WIDTH]) { ctx.beginPath(); ctx.moveTo(sx(e), 0); ctx.lineTo(sx(e), H); ctx.stroke(); }
  if (w.wormholeY !== null) {
    ctx.strokeStyle = '#c86bff'; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(0, sy(w.wormholeY)); ctx.lineTo(W, sy(w.wormholeY)); ctx.stroke(); ctx.setLineDash([]);
  }
  const b = w.bodies;
  for (let i = 0; i < b.count; i++) {
    const k = b.kind[i] as Kind;
    const a = ARCHETYPES[k];
    const x = sx(b.x[i]!), y = sy(b.y[i]!);
    if (y < -40 || y > H + 40) continue;
    const r = Math.max(2, a.radius * S);
    const c = KIND_COLOR[k] ?? '#fff';
    if (a.role === 'playerShot') {
      ctx.strokeStyle = c; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.lineTo(x, y - 6); ctx.stroke();
    } else if (k === Kind.EnemyBolt) {
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, Math.max(3, r), 0, Math.PI * 2); ctx.fill();
    } else if (k === Kind.Drone) {
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y + r); ctx.lineTo(x - r, y - r * 0.7); ctx.lineTo(x + r, y - r * 0.7); ctx.closePath(); ctx.fill();
    } else if (a.role === 'pickup') {
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r * 1.2); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill();
    } else if (k === Kind.Well) {
      ctx.strokeStyle = c; ctx.lineWidth = 1.2;
      for (const f of [1, 0.6, 0.3]) { ctx.beginPath(); ctx.arc(x, y, r * f, 0, Math.PI * 2); ctx.stroke(); }
    } else {
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      if (k === Kind.Mine) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, Math.PI * 2); ctx.stroke(); }
    }
    if (o.highlight?.has(i)) {
      ctx.strokeStyle = '#ffe14f'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.stroke();
    }
    if (o.hitboxes && a.role !== 'playerShot') {
      ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, (a.radius + PLAYER_RADIUS) * S, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  if (w.boss !== null) {
    const bx = sx(w.boss.x), by = sy(w.boss.y);
    ctx.fillStyle = '#2a0f1f'; ctx.strokeStyle = '#ff4fa3'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(bx, by, BOSS_R * S, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffb3d6';
    ctx.fillText(`${w.boss.id} ${Math.max(0, w.boss.hp)}/${BOSSES[w.boss.id].hp}`, bx - 34, by - BOSS_R * S - 6);
  }
  if (o.target !== undefined && o.target !== null) {
    ctx.strokeStyle = 'rgba(79,243,255,.55)'; ctx.setLineDash([2, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx(p.x), sy(p.y) + 13); ctx.lineTo(sx(o.target), sy(p.y) + 13); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#4ff3ff'; ctx.fillRect(sx(o.target) - 1, sy(p.y) + 9, 2, 8);
  }
  const rx = sx(p.x), ry = sy(p.y);
  const blink = p.lives > 0 && w.tick < p.invulnUntilTick && Math.floor(w.tick / 4) % 2 === 0;
  if (p.lives > 0 && !blink) {
    ctx.fillStyle = '#eef0fa';
    ctx.beginPath(); ctx.moveTo(rx, ry - 12); ctx.lineTo(rx - 8, ry + 8); ctx.lineTo(rx + 8, ry + 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff9d4f';
    ctx.beginPath(); ctx.moveTo(rx - 4, ry + 9); ctx.lineTo(rx, ry + 15 + (w.tick % 4) * 1.5); ctx.lineTo(rx + 4, ry + 9); ctx.closePath(); ctx.fill();
  }
  if (p.shield) { ctx.strokeStyle = '#8dff6a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(rx, ry, 1.3 * S, 0, Math.PI * 2); ctx.stroke(); }
}

/** A canvas sized for crisp drawing on retina screens; drawWorld reads its CSS size back from width / ratio. */
export function canvas2d(w: number, h: number): { el: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const ratio = window.devicePixelRatio > 1 ? 2 : 1;
  const el = document.createElement('canvas');
  el.width = w * ratio;
  el.height = h * ratio;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  el.className = 'game2d';
  const ctx = el.getContext('2d')!;
  ctx.scale(ratio, ratio);
  return { el, ctx };
}

/** An exact copy of a World. Same track and spec objects (both immutable), fresh copies of everything mutable. */
export function cloneWorld(w: World): World {
  const b = w.bodies;
  return {
    spec: w.spec,
    track: w.track,
    cursor: w.cursor,
    tick: w.tick,
    rng: w.rng,
    phase: w.phase,
    score: w.score,
    wormholeY: w.wormholeY,
    player: { ...w.player },
    bodies: {
      count: b.count,
      kind: b.kind.slice(), variant: b.variant.slice(),
      x: b.x.slice(), y: b.y.slice(), px: b.px.slice(), py: b.py.slice(), vx: b.vx.slice(), vy: b.vy.slice(),
      rot: b.rot.slice(), spin: b.spin.slice(), t: b.t.slice(), param: b.param.slice(), hp: b.hp.slice(),
    },
    boss: w.boss === null ? null : { ...w.boss },
    dropped: w.dropped,
  };
}

export const hex = (n: number): string => n.toString(16).padStart(8, '0');
