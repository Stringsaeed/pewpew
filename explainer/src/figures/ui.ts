import { h, svg } from '../dom';
import { codeView } from '../code';
import { figure, pill, segmented } from '../figure';
import { slide } from './basics';
import { reduce, runOf, TITLE, type Action, type Screen } from '../../../src/flow';
import { parseSave, recordRun } from '../../../src/save';
import { UNIFORM_FLOATS, writeCamera } from '../../../src/render/camera';

const ACTIONS: [string, Action][] = [
  ['start', { a: 'start' }], ['pick level 1', { a: 'pick', level: 1 }], ['pick level 2', { a: 'pick', level: 2 }],
  ['pause', { a: 'pause' }], ['resume', { a: 'resume' }], ['retry', { a: 'retry' }], ['next', { a: 'next' }],
  ['quit', { a: 'quit' }], ['settings', { a: 'settings' }], ['back', { a: 'back' }],
  ['ended: won ★★★', { a: 'ended', result: { e: 'won', score: 1200, stars: 3 } }], ['ended: lost', { a: 'ended', result: { e: 'lost', score: 300 } }],
];

/** The screen reducer. Buttons are the real actions; the ones reduce() would ignore are disabled, and the case that ran is lit. */
export function flowFigure(): HTMLElement {
  const fig = figure('reduce(screen, action, save)', { wide: true });
  let screen: Screen = TITLE;
  let cleared = false;
  const code = codeView('reduce', { maxHeight: 300 });
  const state = h('div', { class: 'mono small screen-state' });
  const buttons = h('div', { class: 'row wrap' });
  const trail: string[] = ['title'];
  const save = () => (cleared ? recordRun(parseSave(null), 1, 900, 2) : parseSave(null));

  function paint(): void {
    const from = code.find(`case '${screen.s}':`);
    let to = code.lines.length - 2;
    for (let k = from + 1; k < code.lines.length; k++) if (code.excerpt.text.split('\n')[k]!.trim().startsWith('case ')) { to = k - 1; break; }
    code.mark(from, to);
    const key = runOf(screen);
    state.textContent = `${JSON.stringify(screen)}\n${key ? `World key ${key.level}:${key.attempt}` : 'no World on this screen'}\n${trail.slice(-7).join(' → ')}`;
    buttons.replaceChildren(...ACTIONS.map(([label, act]) => {
      const next = reduce(screen, act, save());
      return pill(label, () => { screen = next; trail.push(next.s); paint(); }, next === screen ? { disabled: true } : {});
    }));
  }
  fig.body.append(
    h('div', { class: 'row' }, segmented(['fresh save', 'level 1 cleared'] as const, 'fresh save', (v) => { cleared = v === 'level 1 cleared'; paint(); }).el,
      pill('reset', () => { screen = TITLE; trail.length = 0; trail.push('title'); paint(); })),
    state,
    buttons,
    code.el,
  );
  paint();
  fig.caption('Disabled buttons are actions this screen ignores: `reduce` returns the same object. "pick level 2" only works once level 1 has a star, because `isUnlocked` reads the save.');
  return fig.el;
}

const PRESETS = { 'phone 390×844': [390, 844], 'tablet 834×1194': [834, 1194], 'landscape 844×390': [844, 390] } as const;
type Preset = keyof typeof PRESETS;

/** Projects the track through the matrices writeCamera writes, multiplied out by hand (column-major, as WGSL reads them). */
export function cameraFigure(): HTMLElement {
  const fig = figure('writeCamera()', { wide: true });
  let preset: Preset = 'phone 390×844';
  let zoom = 1;
  const view = h('div');
  const out = h('div', { class: 'mono small muted' });
  function project(u: Float32Array, x: number, y: number): { sx: number; sy: number } | null {
    const mul = (base: number, v: number[]) => [0, 1, 2, 3].map((r) => [0, 1, 2, 3].reduce((s, c) => s + u[base + c * 4 + r]! * v[c]!, 0));
    const clip = mul(16, mul(0, [x, y, 0, 1]));
    if (clip[3]! <= 0) return null;
    return { sx: (clip[0]! / clip[3]! + 1) / 2 * u[32]!, sy: (1 - clip[1]! / clip[3]!) / 2 * u[33]! };
  }
  function paint(): void {
    const [W, H] = PRESETS[preset];
    const u = new Float32Array(UNIFORM_FLOATS);
    writeCamera(u, 0, W, H, 0, zoom);
    const box = 300, s = Math.min(box / W, box / H);
    const ox = (box - W * s) / 2, oy = (box - H * s) / 2;
    const pt = (x: number, y: number) => { const p = project(u, x, y); return p ? `${ox + p.sx * s},${oy + p.sy * s}` : null; };
    const els: SVGElement[] = [svg('rect', { x: ox, y: oy, width: W * s, height: H * s, class: 'screen' })];
    for (const e of [-4.5, 4.5]) {
      const pts = Array.from({ length: 50 }, (_, k) => pt(e, -8 + k)).filter((q): q is string => q !== null);
      els.push(svg('polyline', { points: pts.join(' '), class: 'xline' }));
    }
    for (let y = -5; y <= 40; y += 5) { const a = pt(-4.5, y), b = pt(4.5, y); if (a && b) els.push(svg('polyline', { points: `${a} ${b}`, class: 'rowline' })); }
    const r = pt(0, 0);
    if (r) { const [x, y] = r.split(','); els.push(svg('circle', { cx: Number(x), cy: Number(y), r: 4, class: 'dot' })); }
    view.replaceChildren(svg('svg', { viewBox: `0 0 ${box} ${box}`, class: 'chart cam' }, ...els));
    const p0 = project(u, 0, 0);
    out.textContent = `aspect ${(W / H).toFixed(2)} · the rocket (dot) lands at ${p0 ? `${p0.sx.toFixed(0)}, ${p0.sy.toFixed(0)}` : 'off screen'} px of ${W}×${H} · eye pitched 16°, looking 6.5 units ahead`;
  }
  fig.body.append(
    h('div', { class: 'row' }, segmented(Object.keys(PRESETS) as Preset[], preset, (v) => { preset = v; paint(); }).el),
    slide('zoom', 0.6, 2, 0.05, zoom, (v) => { zoom = v; paint(); }),
    h('div', { class: 'two' }, view, codeView('writeCamera', { maxHeight: 300 }).el),
    out,
  );
  paint();
  fig.caption('The track walls (x = ±4.5) and 5-unit rows, projected with the real uniform block. The camera backs off on narrow screens so the whole track width always fits.');
  return fig.el;
}
