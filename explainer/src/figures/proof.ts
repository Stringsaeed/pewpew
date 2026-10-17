import { h, svg } from '../dom';
import { figure, pill, rich } from '../figure';
import { GOLDEN } from '../data';
import { hex } from '../world2d';
import { slide } from './basics';
import { greedyBot } from '../../../src/bot';
import type { LevelNumber } from '../../../src/levels';
import { COAST, createWorld, hashWorld, replay, simulate, step, type SimEvent } from '../../../src/sim';
import { sinT } from '../../../src/sim/math';
import { PLAYER_X_LIMIT, STEP } from '../../../src/sim/rules';

/** A full bot run of one level: the lane it asked for each step, where the rocket actually went, and what happened. */
export function botFigure(): HTMLElement {
  const fig = figure('greedyBot, a whole level', { wide: true });
  let n: LevelNumber = 7;
  const plot = h('div');
  const stats = h('div', { class: 'mono small muted' });
  function paint(): void {
    const t0 = performance.now();
    const r = simulate(n, greedyBot);
    const ms = performance.now() - t0;
    // Replay the recorded inputs to see the rocket's real x and the events, step by step.
    const w = createWorld(n);
    const xs: number[] = [];
    const marks: { i: number; e: SimEvent['e'] }[] = [];
    for (let i = 0; i < r.inputs.length; i++) {
      const v = r.inputs[i]!;
      const ev: SimEvent[] = [];
      step(w, v === v ? { targetX: v } : COAST, ev);
      xs.push(w.player.x);
      for (const e of ev) if (e.e === 'playerHit' || e.e === 'pickup' || e.e === 'destroy' || e.e === 'shieldBlock') marks.push({ i, e: e.e });
    }
    const W = 640, H = 170, pad = 8;
    const N = r.inputs.length;
    const x = (i: number) => pad + (i / N) * (W - 2 * pad);
    const y = (v: number) => H / 2 - (v / PLAYER_X_LIMIT) * (H / 2 - 12);
    const target = Array.from(r.inputs, (v, i) => `${x(i)},${y(v)}`).join(' ');
    plot.replaceChildren(svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart' },
      svg('polyline', { points: target, class: 'tline' }),
      svg('polyline', { points: xs.map((v, i) => `${x(i)},${y(v)}`).join(' '), class: 'xline' }),
      ...marks.map((m) => svg('circle', { cx: x(m.i), cy: m.e === 'destroy' ? H - 8 : m.e === 'pickup' ? 8 : H / 2, r: m.e === 'destroy' ? 1.6 : 3, class: `mk mk-${m.e}` })),
    ), h('div', { class: 'legend small' },
      h('span', {}, h('i', { class: 'k-t' }), 'lane it asked for'), h('span', {}, h('i', { class: 'k-x' }), 'rocket x'),
      h('span', {}, h('i', { class: 'k-pick' }), 'pickup (top)'), h('span', {}, h('i', { class: 'k-kill' }), 'kill (bottom)'), h('span', {}, h('i', { class: 'k-hit' }), 'hit taken')));
    stats.textContent = `level ${n}: ${r.outcome} in ${N} steps (${(N * STEP).toFixed(1)} s of game), ${r.score} points, ${r.stars}★ · simulated in ${ms.toFixed(0)} ms here, ${((ms / N) * 1000).toFixed(1)} µs per step including the bot`;
  }
  fig.body.append(slide('level', 1, 30, 1, n, (v) => { n = v as LevelNumber; paint(); }), plot, stats);
  paint();
  fig.caption('The bot only ever outputs a target lane (thin line, whole units). Steering turns that into the smooth thick line. The level runs left to right.');
  return fig.el;
}

const bits = (v: number): string => {
  const f = new Float64Array([v]);
  const u = new Uint32Array(f.buffer);
  return `${hex(u[1]!)}${hex(u[0]!)}`;
};

/** Determinism, three ways: engine trig vs the polynomial, replay against the golden file, and one flipped bit. */
export function proofFigure(): HTMLElement {
  const fig = figure('Same inputs, same world', { wide: true });

  // 1. Trig
  let x = 1.234;
  const trig = h('div', { class: 'mono small trig' });
  const paintTrig = (): void => {
    const a = Math.sin(x), b = sinT(x);
    trig.replaceChildren(
      h('div', {}, `Math.sin(${x})  = ${a.toPrecision(17)}  bits ${bits(a)}`),
      h('div', {}, `sinT(${x})      = ${b.toPrecision(17)}  bits ${bits(b)}`),
      h('div', { class: 'muted' }, `difference ${(a - b).toExponential(2)}. Math.sin is whatever this engine computes. sinT is only + − × ÷ and floor, which IEEE 754 rounds the same everywhere.`),
    );
  };

  // 2 + 3. Replay and the butterfly
  let n: LevelNumber = 4;
  let flipAt = 600;
  const result = h('div', { class: 'proof-out' });
  const run = (): void => {
    const r = simulate(n, greedyBot);
    const back = replay(n, r.inputs);
    const g = GOLDEN.find((row) => row.n === n);
    const gOk = g !== undefined && g.hash === hex(r.hash) && g.steps === r.steps && g.score === r.score;
    // Nudge one recorded input by the smallest float32 step and run both copies side by side.
    const k = Math.min(flipAt, r.inputs.length - 1);
    const bent = r.inputs.slice();
    // Lanes are whole numbers, often 0, so step by a float32 ulp at the value's own scale: a change of a few parts in ten million.
    bent[k] = Math.fround(r.inputs[k]! + Math.max(Math.abs(r.inputs[k]!), 1) * 2 ** -22);
    const a = createWorld(n), b = createWorld(n);
    let firstHash = -1, firstVisible = -1;
    for (let i = 0; i < r.inputs.length; i++) {
      const ia = r.inputs[i]!, ib = bent[i]!;
      step(a, ia === ia ? { targetX: ia } : COAST, []);
      step(b, ib === ib ? { targetX: ib } : COAST, []);
      if (firstHash < 0 && hashWorld(a) !== hashWorld(b)) firstHash = a.tick;
      if (firstVisible < 0 && (a.score !== b.score || a.player.lives !== b.player.lives || a.bodies.count !== b.bodies.count)) { firstVisible = a.tick; break; }
    }
    result.replaceChildren(
      h('div', { class: 'mono small' }, `simulate  level ${n}: ${r.outcome}, ${r.steps} steps, ${r.score} points, hash ${hex(r.hash)}`),
      h('div', { class: `mono small ${back.hash === r.hash ? 'ok' : 'bad'}` }, `replay    same ${r.steps} inputs → hash ${hex(back.hash)} ${back.hash === r.hash ? '✓ identical' : '✗ differs'}`),
      h('div', { class: `mono small ${gOk ? 'ok' : 'bad'}` }, `golden    scripts/verify-levels.golden.txt → ${g ? g.hash : 'missing'} ${gOk ? '✓ matches' : '✗ differs'}`),
      h('p', {}, rich(firstHash < 0
        ? `Changing input ${k} from \`${r.inputs[k]!.toFixed(9)}\` to \`${bent[k]!.toFixed(9)}\` was absorbed by rounding this time. Try another step.`
        : `Now change input ${k} from \`${r.inputs[k]!.toFixed(9)}\` to \`${bent[k]!.toFixed(9)}\`, about one part in four million. The hashes split at tick **${firstHash}** and never agree again. ${firstVisible > 0 ? `By tick **${firstVisible}** the two runs differ in score, lives, or body count.` : 'Yet score, lives, and bodies never differ: steering pulls the rocket back onto its lane and the difference fades.'} The game shrugs off a last-bit difference; the proof does not. A hash cannot tell harmless rounding from a real bug, so the verifier needs the phone to compute the same bits, not merely the same game.`)),
    );
  };

  fig.body.append(
    h('h4', {}, '1 · The trig the sim refuses'),
    slide('x', 0, 60, 0.001, x, (v) => { x = v; paintTrig(); }),
    trig,
    h('h4', {}, '2 · Replay, and the golden file'),
    h('div', { class: 'row' }, slide('level', 1, 30, 1, n, (v) => { n = v as LevelNumber; }), slide('flip input at step', 0, 3000, 10, flipAt, (v) => { flipAt = v; }), pill('run', run, { class: 'pill primary' })),
    result,
  );
  paintTrig();
  run();
  fig.caption('Everything here runs the game\'s own `simulate`, `replay`, `step`, and `hashWorld`. Every level\'s golden row is checked into the repo, and `npm run verify` fails when a run stops matching it.');
  return fig.el;
}
