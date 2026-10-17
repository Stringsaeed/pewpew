import { h, svg } from '../dom';
import { segmented, walk, type WalkStep } from '../figure';
import { advance, createLoop, MAX_STEPS_PER_FRAME, setPlaying, type Sinks } from '../../../src/shell/loop';
import { createWorld, STEP } from '../../../src/sim';

interface Rec { n: number; at: number; raw: number; dtMs: number; accBefore: number; accAfterAdd: number; steps: number; dropped: number; accAfter: number; alpha: number; events: number; tick: number }

const PATTERNS = {
  '60 Hz': () => 1000 / 60,
  '120 Hz': () => 1000 / 120,
  '30 Hz': () => 1000 / 30,
  jittery: (i: number) => [16.7, 9, 24, 16.7, 13, 21][i % 6]!,
  'a stall': (i: number) => (i % 12 === 7 ? 140 : 1000 / 60),
} as const;
type Pattern = keyof typeof PATTERNS;

/** advance() walked one frame at a time. Each frame is a real call with a simulated clock; the notes quote its values. */
export function frameWalk(): HTMLElement {
  let pattern: Pattern = 'jittery';
  const loop = createLoop();
  const recs: Rec[] = [];
  let now = 0;
  let events = 0;
  let alpha = 0;
  const sinks: Sinks = {
    render(_w, ev, a) { alpha = a; events = ev.length; },
    audio() {}, ended() {}, hud() {},
  };
  const reset = (): void => {
    loop.world = createWorld(1);
    loop.key = '1:0';
    loop.acc = 0;
    setPlaying(loop, true);
    now = 0;
    loop.last = 0;
    recs.length = 0;
  };

  /** One real advance() call. Values the code computes internally are re-derived from its visible effects. */
  function frame(): Rec {
    const raw = PATTERNS[pattern](recs.length);
    const tick0 = loop.world!.tick;
    const accBefore = loop.acc;
    now += raw;
    advance(loop, now, sinks);
    const dtMs = Math.min(raw, 100);
    const steps = loop.world!.tick - tick0;
    const accAfterAdd = accBefore + dtMs / 1000;
    const leftover = accAfterAdd - steps * STEP;
    const dropped = steps === MAX_STEPS_PER_FRAME && leftover >= STEP ? leftover : 0;
    const rec: Rec = { n: recs.length + 1, at: now, raw, dtMs, accBefore, accAfterAdd, steps, dropped, accAfter: loop.acc, alpha, events, tick: loop.world!.tick };
    recs.push(rec);
    return rec;
  }

  const chart = h('div', { class: 'timeline' });
  function drawChart(): void {
    const W = 640, H = 170, pad = 30;
    const shown = recs.slice(-28);
    const t0 = shown[0] ? shown[0].at - shown[0].raw : 0;
    const t1 = Math.max(t0 + 200, shown[shown.length - 1]?.at ?? 0);
    const x = (t: number) => pad + ((t - t0) / (t1 - t0)) * (W - pad * 2);
    const els: SVGElement[] = [];
    // Wall clock axis: one tick per frame. Below it, one square per step that frame ran.
    els.push(svg('line', { x1: pad, x2: W - pad, y1: 40, y2: 40, class: 'axis' }));
    els.push(svg('text', { x: 2, y: 36 }, 'frames'));
    els.push(svg('text', { x: 2, y: 66 }, 'steps'));
    shown.forEach((r, i) => {
      const cur = i === shown.length - 1;
      els.push(svg('line', { x1: x(r.at), x2: x(r.at), y1: 30, y2: 46, class: cur ? 'frame cur' : 'frame' }));
      for (let s = 0; s < r.steps; s++) els.push(svg('rect', { x: x(r.at) - 4, y: 52 + s * 10, width: 8, height: 8, rx: 1.5, class: cur ? 'stepbox cur' : 'stepbox' }));
      if (r.dropped > 0) els.push(svg('text', { x: x(r.at) - 12, y: 104, class: 'bad' }, `−${(r.dropped * 1000).toFixed(0)}ms`));
    });
    // Sim time against wall time. On the diagonal the game runs at real speed; a flat stretch is time thrown away.
    const base = shown[0];
    if (base) {
      const simAt = (r: Rec) => (r.tick - (base.tick - base.steps)) * STEP * 1000;
      const wallAt = (r: Rec) => r.at - t0;
      const sy = (v: number) => H - 8 - (v / (t1 - t0)) * 52;
      els.push(svg('polyline', { points: shown.map((r) => `${x(r.at)},${sy(simAt(r))}`).join(' '), class: 'simline' }));
      els.push(svg('polyline', { points: shown.map((r) => `${x(r.at)},${sy(wallAt(r))}`).join(' '), class: 'wallline' }));
      els.push(svg('text', { x: 2, y: H - 30 }, 'clocks'));
    }
    chart.replaceChildren(svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart' }, ...els),
      h('div', { class: 'legend small' }, h('span', {}, h('i', { class: 'k-frame' }), 'frame (rAF)'), h('span', {}, h('i', { class: 'k-step' }), 'step()'), h('span', {}, h('i', { class: 'k-sim' }), 'sim time'), h('span', {}, h('i', { class: 'k-wall' }), 'wall time')));
  }

  let cur: Rec | null = null;
  // A new frame runs only when the walk wraps around (or starts), not when ‹ revisits line 1.
  let fresh = true;
  const r = (): Rec => cur!;
  const ms = (v: number) => `${v.toFixed(2)} ms`;
  const steps: WalkStep[] = [
    { at: 'const dtMs = Math.min', to: 'loop.last = now;', title: 'How long since the last frame?', enter: () => { if (fresh || cur === null) cur = frame(); fresh = false; drawChart(); },
      note: () => `This frame arrived ${ms(r().raw)} after the previous one. \`advance()\` clamps the gap to 100 ms, so an app back from the background does not run minutes of steps. \`dtMs = ${ms(r().dtMs)}\`.` },
    { at: 'let finished', to: 'loop.hold = null;', title: 'Count down a win or loss hold',
      note: 'After a win or a loss, the world freezes for 1.4 s or 1.0 s of real time while the renderer plays the ending. No hold runs here.' },
    { at: 'loop.acc += dt;', title: 'Add the time to the accumulator',
      note: () => `\`loop.acc\` held ${ms(r().accBefore * 1000)} from earlier frames. Now it holds ${ms(r().accAfterAdd * 1000)}.` },
    { at: 'while (loop.acc >= STEP', to: 'steps += 1;', title: 'Run whole steps',
      note: () => `Each \`step()\` covers exactly ${ms(STEP * 1000)}. This frame runs **${r().steps}** step${r().steps === 1 ? '' : 's'}, up to the cap of ${MAX_STEPS_PER_FRAME}. The sim sees only whole steps, never the frame rate.` },
    { at: 'if (loop.acc >= STEP) loop.acc = 0;', title: 'Drop the time past the cap',
      note: () => (r().dropped > 0 ? `Four steps were not enough, so \`advance()\` drops ${ms(r().dropped * 1000)}. The game slows for a moment instead of jumping ahead.` : 'Nothing is dropped this frame. Try the "a stall" pattern.') },
    { at: 'let started', to: 'const slow', title: 'Did the run just end?', note: 'If a step emitted `won` or `lost`, this frame starts the hold and slow motion.' },
    { at: 'sinks.render(', title: 'Draw between two steps',
      note: () => `The leftover (${ms(r().accAfter * 1000)}) becomes \`alpha = ${r().alpha.toFixed(2)}\`, the part of the next step that has passed. The renderer draws each body at \`px + (x - px) * alpha\`.` },
    { at: 'sinks.audio(', to: 'sinks.ended(ev);', title: 'Pass the events on', note: () => `${r().events} events this frame went to the audio engine and then to the shell, which changes screens. Most are \`fire\`.` },
    { at: 'if (started) {', to: 'else loop.hold', title: 'Start the ending', note: 'Runs only on the frame that saw `won` or `lost`. It stops play, tells the renderer to play the ending, saves the result, and starts the hold.' },
    { at: 'loop.events.length = 0;', to: 'sinks.hud(next);', title: 'Clear, then update the HUD only if it changed',
      note: '`hudOf` returns the same object when nothing visible changed, so React re-renders the HUD a few times a second, not 60.' },
  ];

  const patternSeg = segmented(Object.keys(PATTERNS) as Pattern[], pattern, (v) => { pattern = v; reset(); for (let i = 0; i < 6; i++) frame(); fresh = true; w.go(0); });
  const w = walk({
    label: 'advance(), one frame at a time',
    excerpt: 'advance',
    steps,
    panel: chart,
    extra: h('div', { class: 'walk-tools' }, h('span', { class: 'muted small' }, 'frame timing'), patternSeg.el),
    maxHeight: 360,
    baseMs: 1500,
    onEnd: () => { fresh = true; w.go(0); },
  });
  reset();
  for (let i = 0; i < 6; i++) frame();
  w.go(0);
  w.fig.caption('Each time the walk returns to line 1, it calls the real `advance()` once with a fake clock. The squares are the `step()` calls each frame ran.');
  return w.fig.el;
}
