import { h } from '../dom';
import { pill, segmented, walk, type WalkStep } from '../figure';
import { canvas2d, cloneWorld, drawWorld, hex, KIND_NAME } from '../world2d';
import { greedyBot } from '../../../src/bot';
import type { LevelNumber } from '../../../src/levels';
import { createWorld, hashWorld, step, STEP, type Input, type SimEvent, type World } from '../../../src/sim';
import { runBoss } from '../../../src/sim/boss';
import { collide, despawn, fire, moveBodies, spawnFromTrack, steer, transition } from '../../../src/sim/step';

type Line = { readonly t: '+' | '-' | '~' | '·'; readonly s: string };

/**
 * The ten stages of step(), each run on its own so the reader can see what it changed. Stage 0 and 2 and 10 are
 * inline statements in step() rather than functions; they are mirrored here line for line. After the last stage
 * the result is hashed against a copy advanced by the real step(), so the walkthrough proves it matches.
 */
const RUN: ((w: World, input: Input, out: SimEvent[]) => void)[] = [
  (w, _i, out) => {
    if (w.phase.p === 'won' || w.phase.p === 'lost') return;
    const p = w.player, b = w.bodies;
    if (w.tick === 0) out.push({ e: 'start', level: w.spec.n });
    p.px = p.x; p.py = p.y;
    for (let i = 0; i < b.count; i++) { b.px[i] = b.x[i]!; b.py[i] = b.y[i]!; }
    if (w.boss !== null) w.boss.px = w.boss.x;
  },
  (w, input) => steer(w, input),
  (w) => { if (w.phase.p === 'fly') w.player.y += w.spec.scroll * STEP; },
  (w) => spawnFromTrack(w),
  (w, _i, out) => fire(w, out),
  (w, _i, out) => { if (w.boss !== null) runBoss(w, w.boss, out); },
  (w, _i, out) => moveBodies(w, out),
  (w, _i, out) => collide(w, out),
  (w) => despawn(w),
  (w, _i, out) => transition(w, out),
  (w) => { w.tick++; },
];

const LAST = RUN.length - 1;
const INTERESTING = { hit: ['hit'], kill: ['destroy'], pickup: ['pickup'], 'drone fire': ['enemyFire'] } as const;
type Hunt = keyof typeof INTERESTING;

function fmt(v: number | string | boolean | null): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(3);
  return String(v);
}

function describeEvent(ev: SimEvent): string {
  switch (ev.e) {
    case 'hit': case 'destroy': return `${ev.e} ${ev.target === 'boss' ? 'boss' : KIND_NAME[ev.target]} at (${ev.x.toFixed(1)}, ${ev.y.toFixed(1)})`;
    case 'pickup': return `pickup ${KIND_NAME[ev.kind]}`;
    case 'fire': return `fire at (${ev.x.toFixed(2)}, ${ev.y.toFixed(2)})${ev.rapid ? ' rapid' : ''}`;
    case 'playerHit': return `playerHit, lives ${ev.lives}`;
    case 'won': return `won, ${ev.stars} stars`;
    case 'lost': return 'lost';
    case 'start': return `start level ${ev.level}`;
    case 'bossEnter': return `bossEnter ${ev.boss}`;
    case 'wormholeOpen': return `wormholeOpen at y ${ev.y.toFixed(1)}`;
    default: return ev.e;
  }
}

/** What changed between two worlds, in words, and which body slots to ring in the drawing. */
function diff(a: World, b: World, events: readonly SimEvent[]): { lines: Line[]; ring: Set<number> } {
  const lines: Line[] = [];
  const ring = new Set<number>();
  const scal: [string, (w: World) => number | string | boolean | null][] = [
    ['tick', (w) => w.tick], ['player.px', (w) => w.player.px], ['player.py', (w) => w.player.py],
    ['player.x', (w) => w.player.x], ['player.vx', (w) => w.player.vx], ['player.y', (w) => w.player.y],
    ['player.lives', (w) => w.player.lives], ['player.shield', (w) => w.player.shield],
    ['player.fireAtTick', (w) => w.player.fireAtTick], ['player.invulnUntilTick', (w) => w.player.invulnUntilTick],
    ['player.rapidUntilTick', (w) => w.player.rapidUntilTick], ['score', (w) => w.score], ['cursor', (w) => w.cursor],
    ['rng', (w) => hex(w.rng >>> 0)], ['phase', (w) => w.phase.p], ['wormholeY', (w) => w.wormholeY],
    ['boss.x', (w) => w.boss?.x ?? null], ['boss.hp', (w) => w.boss?.hp ?? null], ['boss.attack', (w) => w.boss?.attack ?? null],
    ['bodies.count', (w) => w.bodies.count],
  ];
  for (const [label, get] of scal) {
    const x = get(a), y = get(b);
    if (x !== y) lines.push({ t: '~', s: `${label}  ${fmt(x)} → ${fmt(y)}` });
  }
  const A = a.bodies, B = b.bodies;
  if (B.count < A.count) {
    const kinds = (bb: typeof A) => { const m = new Map<number, number>(); for (let i = 0; i < bb.count; i++) m.set(bb.kind[i]!, (m.get(bb.kind[i]!) ?? 0) + 1); return m; };
    const ka = kinds(A), kb = kinds(B);
    for (const [k, n] of ka) {
      const gone = n - (kb.get(k) ?? 0);
      if (gone > 0) lines.push({ t: '-', s: `removed ${gone} × ${KIND_NAME[k]}` });
    }
    lines.push({ t: '·', s: 'remove() swaps the last body into each hole, so slot numbers changed' });
  } else {
    let moved = 0, copied = 0;
    for (let i = 0; i < A.count; i++) {
      if (A.x[i] !== B.x[i] || A.y[i] !== B.y[i]) moved++;
      if (A.px[i] !== B.px[i] || A.py[i] !== B.py[i]) copied++;
      if (A.hp[i] !== B.hp[i]) {
        ring.add(i);
        lines.push({ t: '~', s: `#${i} ${KIND_NAME[B.kind[i]!]} hp ${A.hp[i]} → ${B.hp[i] === -1 ? 'DEAD (-1)' : B.hp[i]}` });
      }
    }
    if (copied) lines.push({ t: '~', s: `${copied} bodies: px, py ← x, y (kept for interpolation)` });
    if (moved) lines.push({ t: '~', s: `${moved} bodies moved` });
    for (let i = A.count; i < B.count; i++) {
      ring.add(i);
      lines.push({ t: '+', s: `#${i} ${KIND_NAME[B.kind[i]!]} at (${B.x[i]!.toFixed(2)}, ${B.y[i]!.toFixed(2)})` });
    }
  }
  for (const ev of events) lines.push({ t: '+', s: `event: ${describeEvent(ev)}` });
  if (lines.length === 0) lines.push({ t: '·', s: 'nothing changed this time' });
  return { lines, ring };
}

export function stepWalk(): HTMLElement {
  let n: LevelNumber = 6;
  let base = createWorld(n);
  const inputs: Input[] = [];
  let work = base;
  let lastCheck = 'runs after stage 11';
  let checkOk: boolean | null = null;
  let ring = new Set<number>();

  const { el: canvasEl, ctx } = canvas2d(250, 330);
  const changes = h('div', { class: 'diff' });
  const meta = h('div', { class: 'diff-meta' });
  const check = h('div', { class: 'check' });
  const panel = h('div', { class: 'walk-panel' }, canvasEl, h('div', { class: 'diff-col' }, meta, changes, check));

  const inputAt = (t: number, w: World): Input => (inputs[t] ??= greedyBot(w));

  /** Rebuild base at tick t with the recorded inputs, through the real step(). */
  function rebuild(t: number): void {
    base = createWorld(n);
    for (let k = 0; k < t; k++) step(base, inputAt(k, base), []);
  }

  /** Run stages 0..k on a copy of base; report what stage k did. */
  function show(k: number): SimEvent[] {
    const input = inputAt(base.tick, base);
    work = cloneWorld(base);
    const out: SimEvent[] = [];
    for (let s = 0; s < k; s++) RUN[s]!(work, input, out);
    const before = cloneWorld(work);
    const evFrom = out.length;
    RUN[k]!(work, input, out);
    const fresh = out.slice(evFrom);
    const d = diff(before, work, fresh);
    ring = d.ring;
    if (k === LAST) {
      const real = cloneWorld(base);
      step(real, input, []);
      const a = hashWorld(work), b = hashWorld(real);
      checkOk = a === b;
      lastCheck = `tick ${base.tick}: walkthrough ${hex(a)} · real step() ${hex(b)}`;
    }
    meta.textContent = `level ${n} · tick ${base.tick} · input.targetX = ${input.targetX === null ? 'null (coast)' : input.targetX.toFixed(2)} (greedyBot)`;
    changes.replaceChildren(...d.lines.slice(0, 14).map((l) => h('div', { class: `d d-${l.t === '+' ? 'add' : l.t === '-' ? 'del' : l.t === '~' ? 'chg' : 'dim'}` }, `${l.t} ${l.s}`)),
      d.lines.length > 14 ? h('div', { class: 'd d-dim' }, `… ${d.lines.length - 14} more`) : '');
    check.className = `check ${checkOk === null ? '' : checkOk ? 'ok' : 'bad'}`;
    check.textContent = `${checkOk === null ? '○' : checkOk ? '✓ matches' : '✗ differs'}  ${lastCheck}`;
    drawWorld(ctx, work, { scale: 22, highlight: ring, target: input.targetX, rocketAt: 0.8 });
    return fresh;
  }

  const note = (s: string) => () => s;
  const steps: WalkStep[] = [
    { at: "if (w.phase.p === 'won'", to: 'if (w.boss !== null) w.boss.px', title: 'Guard, then remember where everything was',
      note: note('A finished run does not change. Otherwise every position is copied into `px` and `py`, so the renderer can draw between the previous and the current position.'), enter: () => { show(0); } },
    { at: 'steer(w, input);', title: 'Steer', note: () => 'The input is a target x. `steer` turns it into velocity with `steerVelocity`, adds the sideways pull of gravity wells, and then moves and clamps the rocket.', enter: () => { show(1); } },
    { at: "if (w.phase.p === 'fly')", title: 'Scroll forward', note: note('Only this line moves the world forward. The rocket\'s `y` grows by the level\'s scroll speed times 1/60 s. During a boss fight, `y` does not change.'), enter: () => { show(2); } },
    { at: 'spawnFromTrack(w);', title: 'Release spawns', note: note('The track was compiled once, when the world was created. Each step releases the spawns that are now within 24 units ahead. Most steps release none.'), enter: () => { show(3); } },
    { at: 'fire(w, out);', title: 'Fire', note: note('Firing is automatic. A bolt joins the pool every 12 steps, or every 6 with rapid fire, and emits a `fire` event, which plays the laser sound.'), enter: () => { show(4); } },
    { at: 'if (w.boss !== null) runBoss', title: 'Boss', note: note('Runs only on boss levels, after the rocket reaches the arena. On level 10 the boss arrives about 59 seconds in.'), enter: () => { show(5); } },
    { at: 'moveBodies(w, out);', title: 'Move every body', note: note('Each body moves by its velocity. Drones run their pattern from `DRONE_MOVES` and may fire an aimed bolt.'), enter: () => { show(6); } },
    { at: 'collide(w, out);', title: 'Collide', note: note('A hit only marks a body DEAD (`hp = -1`). Nothing is removed yet, so slot numbers stay valid inside the loop. Use the jump buttons to land on a step where something hits.'), enter: () => { show(7); } },
    { at: 'despawn(w);', title: 'Despawn', note: note('`despawn` removes dead bodies and bodies out of range. It walks the pool backwards, so each swap-remove is safe.'), enter: () => { show(8); } },
    { at: 'transition(w, out);', title: 'Decide what happens next', note: note('Checks, in order, for a loss at zero lives, a wormhole when the boss dies, the boss arriving at the end of the track, and a win when the rocket reaches the wormhole.'), enter: () => { show(9); } },
    { at: 'w.tick++;', title: 'Tick', note: () => (checkOk ? 'One step is done. This world hashes the same as a copy advanced by the real `step()`. Press › for the next tick.' : 'One step is done. The check below compares this world with one advanced by the real `step()`.'), enter: () => { show(10); } },
  ];

  const hunt = (kind: Hunt): void => {
    const want: readonly string[] = INTERESTING[kind];
    // Look ahead on a copy, then move base to the start of the tick where it happens and open the stage that emits it.
    const tmp = cloneWorld(base);
    for (let guard = 0; guard < 6000 && (tmp.phase.p === 'fly' || tmp.phase.p === 'boss'); guard++) {
      const t = tmp.tick;
      const ev: SimEvent[] = [];
      const before = cloneWorld(tmp);
      step(tmp, inputAt(t, tmp), ev);
      if (ev.some((e) => want.includes(e.e))) {
        base = before;
        for (let k = 0; k <= LAST; k++) {
          const fresh = show(k);
          if (fresh.some((e) => want.includes(e.e))) { w.go(k); return; }
        }
        w.go(0);
        return;
      }
    }
    meta.textContent = `No ${kind} in the rest of this run. Drones first shoot back on level 10.`;
  };

  const levelSeg = segmented([1, 3, 6, 10] as const, 6, (v) => { n = v; inputs.length = 0; rebuild(0); w.go(0); }, (v) => `level ${v}`);
  const extra = h('div', { class: 'walk-tools' },
    levelSeg.el,
    h('span', { class: 'grow' }),
    h('span', { class: 'muted small' }, 'jump to the next'),
    ...(Object.keys(INTERESTING) as Hunt[]).map((k) => pill(k, () => hunt(k))),
    pill('+1 s', () => { for (let k = 0; k < 60; k++) step(base, inputAt(base.tick, base), []); w.go(0); }),
  );

  const w = walk({
    label: 'step(), one stage at a time',
    excerpt: 'step',
    steps,
    panel,
    extra,
    maxHeight: 420,
    baseMs: 1400,
    onEnd: () => {
      if (base.phase.p !== 'fly' && base.phase.p !== 'boss') { rebuild(0); w.go(0); return; }
      step(base, inputAt(base.tick, base), []);
      w.go(0);
    },
    onStart: () => {
      if (base.tick === 0) { w.go(0); return; }
      rebuild(base.tick - 1);
      w.go(LAST);
    },
  });
  // Start a little into the level, so there is something on screen.
  for (let k = 0; k < 150; k++) step(base, inputAt(base.tick, base), []);
  w.go(0);
  w.fig.caption('Each › runs the real stage function on a copy of the world and lists what it changed. Yellow rings mark bodies that a stage created or damaged. Click a dotted name to open its source.');
  return w.fig.el;
}
