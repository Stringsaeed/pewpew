import { h, svg } from '../dom';
import { codeView } from '../code';
import { figure, segmented, walk, type WalkStep } from '../figure';
import { slide } from './basics';
import { BOSSES, DRONE_PATTERNS, Kind, type BossAttack, type BossId, type DronePattern } from '../../../src/levels';
import { add, createWorld } from '../../../src/sim/world';
import { DRONE_MOVES } from '../../../src/sim/drones';
import { sinT } from '../../../src/sim/math';
import { BOSS_GRACE_TICKS, BOSS_SWEEP, STEP, TICKS_PER_SEC, TRACK_HALF_WIDTH } from '../../../src/sim/rules';
import { bossPhase } from '../../../src/sim/boss';

const PATTERN_NOTE: Record<DronePattern, string> = {
  sine: 'Weaves around its anchor `param` with `sinT`, sinking at a steady 1.2 units/s. `driveX` writes x and the matching vx.',
  zigzag: 'A triangle wave instead of a sine: straight diagonal legs with sharp turns, harder to lead.',
  dive: 'Drifts slowly until it is within 8 units of the rocket, then drops at 7 units/s and steers toward the rocket\'s x. Move the rocket slider.',
  orbit: 'Circles: x swings with sin, and y speed swings with cos, so it loops back up before coming on.',
};

/** The drone's path from the real DRONE_MOVES, the same three lines moveBodies runs per step. */
function path(pattern: DronePattern, startX: number, rocketX: number): { x: number; y: number }[] {
  const w = createWorld(1);
  w.player.x = rocketX;
  w.player.y = 0;
  const i = add(w, Kind.Drone, startX, 20, 0, 0);
  const b = w.bodies;
  b.variant[i] = DRONE_PATTERNS.indexOf(pattern);
  b.param[i] = startX;
  const out: { x: number; y: number }[] = [];
  for (let k = 0; k < 16 / STEP && b.y[i]! > -2; k++) {
    b.t[i] += STEP;
    DRONE_MOVES[pattern](w, i);
    b.y[i] += b.vy[i]! * STEP;
    out.push({ x: b.x[i]!, y: b.y[i]! });
  }
  return out;
}

export function droneWalk(): HTMLElement {
  let pattern: DronePattern = 'sine';
  let startX = 0, rocketX = 1.5;
  const plot = h('div', { class: 'drone-plot' });
  function draw(): void {
    const W = 260, H = 300;
    const sx = (x: number) => W / 2 + (x / TRACK_HALF_WIDTH) * (W / 2 - 10);
    const sy = (y: number) => H - 18 - (y / 21) * (H - 30);
    const els: SVGElement[] = [svg('rect', { x: sx(-TRACK_HALF_WIDTH), y: 0, width: sx(TRACK_HALF_WIDTH) - sx(-TRACK_HALF_WIDTH), height: H, class: 'track' })];
    for (const p of DRONE_PATTERNS) {
      const pts = path(p, startX, rocketX);
      els.push(svg('polyline', { points: pts.map((q) => `${sx(q.x)},${sy(q.y)}`).join(' '), class: p === pattern ? 'dpath on' : 'dpath' }));
    }
    els.push(svg('path', { d: `M${sx(rocketX)},${sy(0) - 8} l-6,12 l12,0 z`, class: 'rocket' }));
    els.push(svg('text', { x: 6, y: 14 }, 'drone starts 20 units ahead'));
    plot.replaceChildren(svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart' }, ...els));
  }
  const steps: WalkStep[] = DRONE_PATTERNS.map((p) => ({
    at: `${p}: (w, i)`,
    to: p === 'zigzag' ? 'b.vy[i] = -1.2;\n' : undefined,
    title: p,
    note: PATTERN_NOTE[p],
    enter: () => { pattern = p; draw(); },
  }));
  // zigzag and dive span several lines; mark through their closing line.
  const fixed: WalkStep[] = steps.map((s) => (s.title === 'zigzag' ? { ...s, to: 'b.vy[i] = -1.2;' } : s.title === 'dive' ? { ...s, to: 'b.x[i] += b.vx[i] * STEP;' } : s.title === 'orbit' ? { ...s, to: 'b.vy[i] = -1 + 3' } : { ...s, to: undefined }));
  const w = walk({
    label: 'DRONE_MOVES',
    excerpt: 'DRONE_MOVES',
    steps: fixed,
    panel: h('div', { class: 'two' }, plot, h('div', { class: 'sliders' },
      slide('drone anchor x', -2, 2, 0.1, startX, (v) => { startX = v; draw(); }),
      slide('rocket x', -4, 4, 0.1, rocketX, (v) => { rocketX = v; draw(); }),
    )),
    maxHeight: 300,
  });
  w.go(0);
  w.fig.caption('All four paths are drawn by running the real pattern functions until the drone passes the rocket. The current one is bright.');
  return w.fig.el;
}

const ATTACK_COLOR: Record<BossAttack['a'], string> = { spread: '#ff9d4f', aimed: '#ff5d6c', mines: '#9aa1bd', drones: '#ffb84f' };
const describe = (a: BossAttack): string =>
  a.a === 'spread' ? `spread ${a.bolts} over ${a.arcDeg}°` : a.a === 'aimed' ? `aimed ×${a.bolts}` : a.a === 'mines' ? `mine wall ×${a.count}` : `${a.count} ${a.pattern} drones`;

/** Boss phases come from hp alone. Drag hp and watch the real bossPhase() switch rows. */
export function bossFigure(): HTMLElement {
  const fig = figure('Boss phases', { wide: true });
  let id: BossId = 'core';
  let pct = 100;
  const table = h('div');
  const timeline = h('div');
  function paint(): void {
    const spec = BOSSES[id];
    const hp = Math.round((pct / 100) * spec.hp);
    const active = bossPhase(spec, hp);
    table.replaceChildren(h('div', { class: 'phases' }, ...spec.phases.map((ph, i) => h('div', { class: `phase${ph === active ? ' on' : ''}` },
      h('div', { class: 'phase-top mono' }, `phase ${i + 1} · from ${Math.round(ph.atHpFraction * 100)}% hp`),
      h('div', { class: 'small' }, `sweep ${ph.sweepSpeed} · attack every ${ph.attackEverySec}s`),
      h('div', { class: 'chips' }, ...ph.attacks.map((a) => h('span', { class: 'chip', style: `border-color:${ATTACK_COLOR[a.a]};color:${ATTACK_COLOR[a.a]}` }, describe(a)))),
    ))), h('div', { class: 'mono small muted' }, `bossPhase(BOSSES.${id}, ${hp}) → phase ${spec.phases.indexOf(active as (typeof spec.phases)[number]) + 1}`));
    const W = 640, H = 120, pad = 10, span = 12;
    const tx = (s: number) => pad + (s / span) * (W - 2 * pad);
    const els: SVGElement[] = [];
    let k = 0;
    for (let t = BOSS_GRACE_TICKS / TICKS_PER_SEC; t < span; t += active.attackEverySec, k++) {
      const a = active.attacks[k % active.attacks.length]!;
      els.push(svg('rect', { x: tx(t) - 3, y: 10, width: 6, height: 30, rx: 2, fill: ATTACK_COLOR[a.a] }, svg('title', {}, describe(a))));
    }
    const pts: string[] = [];
    let th = 0;
    for (let i = 0; i <= span / STEP; i++) { pts.push(`${tx(i * STEP)},${82 - (BOSS_SWEEP * sinT(th) / BOSS_SWEEP) * 28}`); th += (active.sweepSpeed / BOSS_SWEEP) * STEP; }
    els.push(svg('polyline', { points: pts.join(' '), class: 'sweep' }), svg('text', { x: pad, y: H - 4 }, 'attacks on the timer (top), the sweep across the track (below), first 12 s'));
    timeline.replaceChildren(svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart' }, ...els));
  }
  fig.body.append(
    h('div', { class: 'row' }, segmented(['warden', 'hive', 'core'] as const, id, (v) => { id = v; paint(); }).el),
    slide('boss hp', 0, 100, 1, pct, (v) => { pct = v; paint(); }, '%'),
    table,
    timeline,
    codeView('bossPhase').el,
  );
  paint();
  fig.caption('The highlighted card is what the real `bossPhase` returns for this hp. There is no phase variable to keep in sync: damage alone moves the fight forward.');
  return fig.el;
}
