import { h, svg } from '../dom';
import { figure, rich, walk, type WalkStep } from '../figure';
import { highlightInto } from '../code';
import { GOLDEN } from '../data';
import { KIND_COLOR, KIND_NAME } from '../world2d';
import { slide } from './basics';
import { ARCHETYPES, BOSSES, Kind, LEVELS, levelSpec, tierOf, type LevelNumber, type LevelSpec } from '../../../src/levels';
import { compileTrack } from '../../../src/sim/track';
import { PLAYER_MAX_VX, ROW_DY, TRACK_END_CLEAR, TRACK_HALF_WIDTH, TRACK_START } from '../../../src/sim/rules';

type Field = { key: string; get: (l: LevelSpec) => string; num?: (l: LevelSpec) => number; note: string };
const FIELDS: Field[] = [
  { key: 'n', get: (l) => String(l.n), note: 'The level number. defineLevels checks the rows are 1 … 30 in order.' },
  { key: 'seed', get: (l) => `0x${(l.seed >>> 0).toString(16)}`, note: 'Feeds mulberry32 in compileTrack and the world\'s RNG. Fixed per level, so every player and the verifier fly the identical track.' },
  { key: 'length', get: (l) => String(l.length), num: (l) => l.length, note: 'World units from the start to the wormhole, or to the boss arena. RAMP says it never decreases.' },
  { key: 'scroll', get: (l) => l.scroll.toFixed(1), num: (l) => l.scroll, note: 'Units per second the rocket climbs. Faster scroll leaves less time between rows, so the track compiler narrows how far the safe gap can wander.' },
  { key: 'density', get: (l) => String(l.density), num: (l) => l.density, note: 'Hazards per 100 units of track. compileTrack spreads them over rows with a fractional accumulator.' },
  { key: 'mix', get: (l) => `{ ${Object.entries(l.mix).map(([k, v]) => `${k}: ${v}`).join(', ')} }`, note: 'Relative weights for which hazard a slot becomes. An absent kind never spawns.' },
  { key: 'drones', get: (l) => `[${l.drones.map((d) => `'${d}'`).join(', ')}]`, num: (l) => l.drones.length, note: 'Motion patterns a drone may use on this level. defineLevels requires this list exactly when mix has a drone weight.' },
  { key: 'droneFireRate', get: (l) => String(l.droneFireRate), num: (l) => l.droneFireRate, note: 'Aimed shots per second per drone. 0 means drones hold fire.' },
  { key: 'wells', get: (l) => String(l.wells), num: (l) => l.wells, note: 'How many gravity wells, placed on evenly spaced rows.' },
  { key: 'wellPull', get: (l) => String(l.wellPull), num: (l) => l.wellPull, note: 'Sideways acceleration a well applies near its core.' },
  { key: 'pickups', get: (l) => `{ crystal: ${l.pickups.crystal}, shield: ${l.pickups.shield}, rapid: ${l.pickups.rapid} }`, num: (l) => l.pickups.shield, note: 'Pickups per 100 units. The sparkline shows shields, which spike on boss levels.' },
  { key: 'boss', get: (l) => (l.boss ? `'${l.boss}'` : 'null'), num: (l) => (l.boss ? BOSSES[l.boss].hp : 0), note: 'Set on levels 10, 20, and 30 only. The `LevelTable` type enforces that rule at compile time. The sparkline shows boss hp.' },
];

/** One row of the level table, as code. Click a field to see what it does and how it ramps across all 30 levels. */
export function levelRow(): HTMLElement {
  const fig = figure('A row of LEVELS', { wide: true });
  let n: LevelNumber = 5;
  let field = FIELDS[4]!;
  const code = h('pre', { class: 'code live rowcode' });
  const explain = h('div', { class: 'field-note' });
  const spark = h('div');
  const gold = h('div', { class: 'muted small mono' });

  function paint(): void {
    const l = levelSpec(n);
    const lines = [h('div', { class: 'cl' }, h('span', { class: 'cc' }, '{'))];
    for (const f of FIELDS) {
      const val = h('span', {});
      highlightInto(val, f.get(l));
      lines.push(h('div', { class: `cl field${f === field ? ' on' : ''}`, onclick: () => { field = f; paint(); } },
        h('span', { class: 'cc' }, '  ', h('span', { class: 't-prop call' }, f.key), ': ', val, ',')));
    }
    lines.push(h('div', { class: 'cl' }, h('span', { class: 'cc' }, '}')));
    code.replaceChildren(...lines);
    explain.replaceChildren(h('b', {}, field.key), ': ', rich(field.note));
    const g = GOLDEN.find((r) => r.n === n);
    gold.textContent = g ? `verifier: greedyBot wins level ${n} in ${g.steps} steps, ${g.score} points, ${'★'.repeat(g.stars)} · hash ${g.hash}` : '';
    if (field.num) {
      const vals = LEVELS.map(field.num);
      const lo = Math.min(...vals), hi = Math.max(...vals) || 1;
      const W = 300, H = 70;
      const x = (i: number) => 6 + (i / 29) * (W - 12);
      const y = (v: number) => H - 8 - ((v - lo) / (hi - lo || 1)) * (H - 16);
      spark.replaceChildren(svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart spark' },
        ...[9, 19, 29].map((i) => svg('line', { x1: x(i), x2: x(i), y1: 4, y2: H - 4, class: 'bossline' })),
        svg('polyline', { points: vals.map((v, i) => `${x(i)},${y(v)}`).join(' '), class: 'xline' }),
        svg('circle', { cx: x(n - 1), cy: y(vals[n - 1]!), r: 4, class: 'dot' }),
      ), h('div', { class: 'muted small' }, `${field.key} across levels 1–30 · dashed lines are boss levels`));
    } else spark.replaceChildren(h('div', { class: 'muted small' }, 'Not a number, so no curve.'));
  }

  fig.body.append(
    slide('level', 1, 30, 1, n, (v) => { n = v as LevelNumber; paint(); }),
    h('div', { class: 'two' }, code, h('div', {}, explain, spark)),
    gold,
  );
  paint();
  fig.caption('The row is read live from `LEVELS` in `src/levels.ts`, and the verifier line from the golden file. Click any field name.');
  return fig.el;
}

/** compileTrack walked, with the compiled level drawn as a strip: distance runs left to right, the track width top to bottom. */
export function trackWalk(): HTMLElement {
  let n: LevelNumber = 9;
  let focus: 'all' | 'rows' | 'hazards' | 'wells' | 'pickups' | 'gap' = 'all';
  const strip = h('div', { class: 'strip' });
  const stats = h('div', { class: 'muted small mono' });

  function draw(): void {
    const spec = levelSpec(n);
    const spawns = compileTrack(spec);
    const W = 640, H = 120;
    const x = (y: number) => 4 + (y / spec.length) * (W - 8);
    const yy = (lat: number) => H / 2 - (lat / TRACK_HALF_WIDTH) * (H / 2 - 6);
    const els: SVGElement[] = [svg('rect', { x: 0, y: yy(TRACK_HALF_WIDTH), width: W, height: yy(-TRACK_HALF_WIDTH) - yy(TRACK_HALF_WIDTH), class: 'track' })];
    if (focus === 'rows' || focus === 'gap') {
      for (let y = TRACK_START; y <= spec.length - TRACK_END_CLEAR; y += ROW_DY) els.push(svg('line', { x1: x(y), x2: x(y), y1: 4, y2: H - 4, class: 'rowline' }));
    }
    for (const s of spawns) {
      const role = ARCHETYPES[s.kind].role;
      const group = s.kind === Kind.Well ? 'wells' : role === 'pickup' ? 'pickups' : 'hazards';
      const dim = focus !== 'all' && focus !== 'rows' && focus !== 'gap' && focus !== group;
      els.push(svg('circle', { cx: x(s.y), cy: yy(s.x), r: Math.max(1.6, ARCHETYPES[s.kind].radius * 3), fill: KIND_COLOR[s.kind], opacity: dim ? 0.12 : 0.9 },
        svg('title', {}, `${KIND_NAME[s.kind]} at y ${s.y.toFixed(1)}, x ${s.x.toFixed(2)}`)));
    }
    if (spec.boss === null) els.push(svg('line', { x1: x(spec.length) - 1, x2: x(spec.length) - 1, y1: 2, y2: H - 2, class: 'worm' }));
    strip.replaceChildren(svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart' }, ...els));
    const count = (k: Kind) => spawns.filter((s) => s.kind === k).length;
    stats.textContent = `level ${n} · ${spawns.length} spawns · ${count(Kind.Asteroid)} asteroids, ${count(Kind.Mine)} mines, ${count(Kind.Drone)} drones, ${count(Kind.Well)} wells, ${count(Kind.Crystal) + count(Kind.Shield) + count(Kind.Rapid)} pickups · gap may move ${(0.5 * PLAYER_MAX_VX * ROW_DY / spec.scroll).toFixed(2)} units per row`;
  }

  const show = (f: typeof focus) => () => { focus = f; draw(); };
  const steps: WalkStep[] = [
    { at: 'const s: Rng', title: 'Seed a private RNG', note: 'Its own mulberry32 state from the level\'s seed, separate from the world\'s RNG. The same seed always compiles the same track.', enter: show('all') },
    { at: 'const pickKind', to: 'return Kind.Asteroid;', title: 'Weighted choice of hazard', note: 'A random number in [0, 1) picks asteroid, mine, or drone in proportion to the level\'s `mix` weights.', enter: show('hazards') },
    { at: 'const rows = Math.floor', title: 'Lay out rows', note: 'Rows sit every 5 units from y 20 to 12 units before the end. Everything lives on a row: that structure is what makes a safe path provable.', enter: show('rows') },
    { at: 'for (let k = 0; k < spec.wells', title: 'Wells on evenly spaced rows', note: 'The number of wells and their rows are fixed. Only their x is random.', enter: show('wells') },
    { at: 'const reach', title: 'How far the safe gap may wander', note: 'Between two rows the rocket has `ROW_DY / scroll` seconds. `reach` is half of what it could cross at top speed in that time, so the gap never moves faster than a human can follow.', enter: show('gap') },
    { at: 'const outsideGap', to: 'return u < left', title: 'Place things outside the gap', note: 'Picks an x uniformly from the free space left and right of a 1.6-unit gap. Hazards and wells never land in it, so every row has a way through.', enter: show('hazards') },
    { at: 'gapX = clamp(gapX', to: 'owed -= n;', title: 'Per row: move the gap, decide how many', note: 'The gap takes a bounded random step. `owed` accumulates `density × ROW_DY / 100` per row and spends the whole part, so a density of 8.5 gives exactly the right total.', enter: show('gap') },
    { at: 'const kind = pickKind(rand(s));', to: 'else out.push({ y, x, kind, variant: 0, param: 0 });', title: 'Hazards', note: 'Asteroids get a mesh variant and a drift. Drones get a pattern from the level\'s list and an anchor clamped inside the track.', enter: show('hazards') },
    { at: 'pickupOwed[k] += rate;', to: 'out.push({ y: y + ROW_DY / 2', title: 'Pickups', note: 'The same owed trick per pickup kind. Crystals sit near the gap, as a reward for taking it. Shields and rapid fire can land anywhere.', enter: show('pickups') },
    { at: 'return out.sort', title: 'Sort by y', note: 'step() then only needs a cursor: release spawns while the next one is within 24 units ahead.', enter: show('all') },
  ];
  const w = walk({
    label: 'compileTrack()',
    excerpt: 'compileTrack',
    steps,
    panel: h('div', {}, slide('level', 1, 30, 1, n, (v) => { n = v as LevelNumber; draw(); }), strip, stats),
    maxHeight: 300,
  });
  draw();
  w.go(0);
  w.fig.caption('The strip is the real output of `compileTrack` for the chosen level, from the start (left) to the wormhole (right). Hover a dot for its spawn.');
  return w.fig.el;
}
