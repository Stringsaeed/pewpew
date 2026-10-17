import { h, svg } from '../dom';
import { codeView } from '../code';
import { figure, pill, walk, type WalkStep } from '../figure';
import { KIND_COLOR, KIND_NAME } from '../world2d';
import { greedyBot } from '../../../src/bot';
import { createWorld, dragInput, step, steerVelocity, type World } from '../../../src/sim';
import { remove } from '../../../src/sim/world';
import { COAST_DAMPING, DRAG_GAIN, PLAYER_MAX_VX, PLAYER_X_LIMIT, STEER_ACCEL, STEER_GAIN, STEP } from '../../../src/sim/rules';

const COLS = ['kind', 'x', 'y', 'vx', 'vy', 'hp'] as const;

/** The body pool as it really is: parallel typed arrays, read live from a running world. */
export function poolFigure(): HTMLElement {
  const fig = figure('World.bodies: one array per field');
  let w: World = createWorld(3);
  for (let k = 0; k < 400; k++) step(w, greedyBot(w), []);
  let running = true;
  let flash = -1;
  let msg = 'Slots fill from the front. Live slots are always 0 … count − 1.';
  const table = h('div', { class: 'pool' });
  const note = h('p', { class: 'fig-note' });
  const ROWS = 12;

  function paint(): void {
    const b = w.bodies;
    const head = h('div', { class: 'pool-row head mono' }, h('span', {}, 'slot'), ...COLS.map((c) => h('span', {}, `${c}[ ]`)));
    const rows = Array.from({ length: ROWS }, (_, i) => {
      const live = i < b.count;
      const k = b.kind[i]!;
      return h('div', { class: `pool-row mono${live ? '' : ' empty'}${i === flash ? ' flash' : ''}` },
        h('span', {}, String(i)),
        h('span', {}, live ? h('b', { style: `color:${KIND_COLOR[k]}` }, KIND_NAME[k]) : ''),
        h('span', {}, live ? b.x[i]!.toFixed(2) : ''),
        h('span', {}, live ? b.y[i]!.toFixed(1) : ''),
        h('span', {}, live ? b.vx[i]!.toFixed(2) : ''),
        h('span', {}, live ? b.vy[i]!.toFixed(1) : ''),
        h('span', {}, live ? String(b.hp[i]) : ''),
      );
    });
    table.replaceChildren(head, ...rows, h('div', { class: 'pool-foot mono' }, `count = ${b.count} of 512 · tick ${w.tick}`));
    note.textContent = msg;
  }

  let last = 0;
  const loop = (now: number): void => {
    requestAnimationFrame(loop);
    if (!running || now - last < 160) return;
    last = now;
    for (let k = 0; k < 6 && w.phase.p === 'fly'; k++) step(w, greedyBot(w), []);
    if (w.phase.p !== 'fly') { w = createWorld(3); }
    flash = -1;
    paint();
  };

  const pauseBtn = pill('pause', () => { running = !running; pauseBtn.textContent = running ? 'pause' : 'resume'; });
  fig.body.append(
    table,
    h('div', { class: 'row' },
      pauseBtn,
      pill('remove(bodies, 2)', () => {
        running = false;
        pauseBtn.textContent = 'resume';
        const b = w.bodies;
        if (b.count < 3) return;
        const last = b.count - 1;
        const was = KIND_NAME[b.kind[last]!];
        remove(b, 2);
        flash = 2;
        msg = `The ${was} that lived in slot ${last} was copied into slot 2, and count went down by one. Nothing else moved, so removal is O(1). The cost is that slot numbers are not identities.`;
        paint();
      }),
    ),
    note,
    codeView('remove').el,
  );
  paint();
  requestAnimationFrame(loop);
  fig.caption('The real `remove()` from `src/sim/world.ts`, applied to this live pool.');
  return fig.el;
}

/** steerVelocity walked, with a plot of the rocket's response to the current target. */
export function steerWalk(): HTMLElement {
  let start = -3, target = 2.5, lift = 3;
  const plot = h('div');
  const sim = (): { x: number[]; v: number[] } => {
    const xs: number[] = [], vs: number[] = [];
    let x = start, v = 0;
    for (let i = 0; i <= 180; i++) {
      xs.push(x); vs.push(v);
      v = i * STEP < lift ? steerVelocity(x, v, target) : v * COAST_DAMPING;
      x = Math.max(-PLAYER_X_LIMIT, Math.min(PLAYER_X_LIMIT, x + v * STEP));
    }
    return { x: xs, v: vs };
  };
  function draw(): void {
    const r = sim();
    const W = 640, H = 170, pad = 26;
    const tx = (i: number) => pad + (i / 180) * (W - 2 * pad);
    const yx = (v: number) => H / 2 - (v / PLAYER_X_LIMIT) * (H / 2 - 14);
    const yv = (v: number) => H / 2 - (v / (PLAYER_MAX_VX + 1)) * (H / 2 - 14);
    plot.replaceChildren(svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart' },
      svg('line', { x1: pad, x2: W - pad, y1: yx(target), y2: yx(target), class: 'target' }),
      svg('line', { x1: tx(lift / STEP), x2: tx(lift / STEP), y1: 6, y2: H - 6, class: 'axis' }),
      svg('polyline', { points: r.v.map((v, i) => `${tx(i)},${yv(v)}`).join(' '), class: 'vline' }),
      svg('polyline', { points: r.x.map((v, i) => `${tx(i)},${yx(v)}`).join(' '), class: 'xline' }),
      svg('text', { x: W - pad - 20, y: H - 6 }, '3 s'),
    ), h('div', { class: 'legend small' }, h('span', {}, h('i', { class: 'k-x' }), 'rocket x'), h('span', {}, h('i', { class: 'k-v' }), 'velocity'), h('span', {}, h('i', { class: 'k-t' }), 'target x')));
  }
  const want = () => Math.max(-PLAYER_MAX_VX, Math.min(PLAYER_MAX_VX, (Math.max(-PLAYER_X_LIMIT, Math.min(PLAYER_X_LIMIT, target)) - start) * STEER_GAIN));
  const steps: WalkStep[] = [
    { at: 'export function steerVelocity', title: 'Inputs', note: () => `Called once per step while a finger is down, with the rocket's x (${start.toFixed(1)}), its velocity (0 at rest), and the target x (${target.toFixed(1)}).` },
    { at: 'const want', title: 'The speed it would like', note: () => `Distance to target × ${STEER_GAIN}, capped at ±${PLAYER_MAX_VX}. Here: (${target.toFixed(1)} − ${start.toFixed(1)}) × ${STEER_GAIN} → \`want = ${want().toFixed(2)}\`. Far away it is capped; close in it shrinks, so the rocket settles instead of overshooting.` },
    { at: 'return vx', title: 'The speed it can get this step', note: () => `Velocity may change by at most ${STEER_ACCEL} × 1/60 = ${(STEER_ACCEL * STEP).toFixed(1)} units/s per step. From rest the first step gives \`vx = ${steerVelocity(start, 0, target).toFixed(2)}\`. That limit is what gives the rocket weight.` },
  ];
  const controls = h('div', { class: 'sliders' },
    slide('start x', -4, 4, 0.1, start, (v) => { start = v; draw(); w.refresh(); }),
    slide('target x', -4, 4, 0.1, target, (v) => { target = v; draw(); w.refresh(); }),
    slide('finger lifts at', 0, 3, 0.05, lift, (v) => { lift = v; draw(); }, 's'),
  );
  const w = walk({ label: 'steerVelocity()', excerpt: 'steerVelocity', steps, panel: h('div', {}, controls, plot), maxHeight: 200 });
  w.go(0);
  draw();
  w.fig.caption(`The plot calls the real \`steerVelocity\` 180 times. After the finger lifts, velocity is multiplied by \`COAST_DAMPING\` (${COAST_DAMPING}) each step. A full-width drag moves the target ${DRAG_GAIN} units: \`dragInput(0, 1)\` = ${dragInput(0, 1).targetX}.`);
  return w.fig.el;
}

/** A labelled range input. */
export function slide(label: string, min: number, max: number, stepv: number, value: number, on: (v: number) => void, unit = ''): HTMLElement {
  const out = h('output', {}, `${value}${unit}`);
  const input = h('input', { type: 'range', min, max, step: stepv, value, oninput: (e: Event) => { const v = Number((e.target as HTMLInputElement).value); out.textContent = `${v}${unit}`; on(v); } });
  return h('label', { class: 'slide' }, h('span', {}, label), input, out);
}
