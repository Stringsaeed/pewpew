import { h, type Child } from './dom';
import { codeView, highlightInto, type CodeView } from './code';

/** Prose with `code` and **bold**, for notes inside figures. */
export function rich(text: string): HTMLElement {
  const span = h('span');
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  for (const part of parts) {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
      const c = h('code', { class: 'inline' });
      highlightInto(c, part.slice(1, -1));
      span.append(c);
    } else if (part.startsWith('**') && part.endsWith('**')) span.append(h('strong', {}, part.slice(2, -2)));
    else if (part) span.append(document.createTextNode(part));
  }
  return span;
}

export interface Fig {
  readonly el: HTMLElement;
  readonly body: HTMLElement;
  /** Show n progress dots with the i-th one active. n = 0 hides them. */
  dots(n: number, i: number): void;
  caption(text: string): void;
}

/** The card every interactive block sits in: a small uppercase label, progress dots, a body, an optional caption. */
export function figure(label: string, opts: { wide?: boolean; dark?: boolean } = {}): Fig {
  const dotsEl = h('div', { class: 'dots', 'aria-hidden': 'true' });
  const body = h('div', { class: `viz-body${opts.dark ? ' dark' : ''}` });
  const cap = h('figcaption', { class: 'viz-cap' });
  const el = h('figure', { class: `viz${opts.wide ? ' wide' : ''}` },
    h('div', { class: 'viz-head' }, h('span', { class: 'viz-label' }, label), dotsEl),
    body,
    cap,
  );
  return {
    el,
    body,
    dots(n, i) {
      dotsEl.replaceChildren(...Array.from({ length: n }, (_, k) => h('span', { class: k === i ? 'on' : '' })));
    },
    caption(text) {
      cap.replaceChildren(rich(text));
    },
  };
}

/** A pill button, the control style used across figures. */
export function pill(text: Child, onClick: () => void, attrs: Record<string, string | boolean> = {}): HTMLButtonElement {
  return h('button', { type: 'button', class: 'pill', ...attrs, onclick: onClick }, text);
}

/** A segmented control. Returns the element and a setter. */
export function segmented<T extends string | number>(options: readonly T[], value: T, onChange: (v: T) => void, label: (v: T) => string = String): { el: HTMLElement; set(v: T): void } {
  const buttons = options.map((o) => h('button', { type: 'button', class: o === value ? 'on' : '', onclick: () => { set(o); onChange(o); } }, label(o)));
  function set(v: T): void {
    buttons.forEach((b, i) => b.classList.toggle('on', options[i] === v));
  }
  return { el: h('div', { class: 'seg' }, buttons), set };
}

/** Prev, play/pause, next, and a 0.5× / 1× / 2× speed switch, driving a stepper. */
export function playback(opts: { prev(): void; next(): void; baseMs: number; onPlayChange?(on: boolean): void }): { el: HTMLElement; stop(): void; playing(): boolean } {
  let speed = 1;
  let timer = 0;
  const playBtn = pill('▶ Play', () => (timer ? stop() : start()), { 'aria-label': 'play' });
  function start(): void {
    stop();
    timer = window.setInterval(opts.next, opts.baseMs / speed);
    playBtn.textContent = '❚❚ Pause';
    opts.onPlayChange?.(true);
  }
  function stop(): void {
    if (timer) window.clearInterval(timer);
    timer = 0;
    playBtn.textContent = '▶ Play';
    opts.onPlayChange?.(false);
  }
  const speedSel = segmented([0.5, 1, 2] as const, 1, (v) => { speed = v; if (timer) start(); }, (v) => `${v}×`);
  const el = h('div', { class: 'playback' },
    pill('‹', () => { stop(); opts.prev(); }, { 'aria-label': 'previous step' }),
    playBtn,
    pill('›', () => { stop(); opts.next(); }, { 'aria-label': 'next step' }),
    h('span', { class: 'grow' }),
    speedSel.el,
  );
  return { el, stop, playing: () => timer !== 0 };
}

export interface WalkStep {
  /** Text on the first line to mark. */
  readonly at: string;
  /** Text on the last line to mark; defaults to the first line. */
  readonly to?: string;
  readonly title: string;
  /** Explanation. A function is re-evaluated every time the step is shown, so it can quote live values. */
  readonly note: string | (() => string);
  /** Runs when the step is shown, before the note is read. */
  enter?(): void;
}

export interface Walk {
  readonly fig: Fig;
  readonly code: CodeView;
  go(i: number): void;
  index(): number;
  /** Re-run the current step's note, after the figure's own state changed. */
  refresh(): void;
  stop(): void;
}

/**
 * Steps through a real excerpt: each step marks a line range, explains it, and may run code. The figure's own
 * panel (passed as `panel`) sits under the code and is updated by the steps' enter() hooks.
 */
export function walk(opts: {
  label: string;
  excerpt: string;
  steps: readonly WalkStep[];
  panel?: HTMLElement;
  /** next() past the last step: loop to 0, or call this instead. */
  onEnd?(): void;
  onStart?(): void;
  baseMs?: number;
  maxHeight?: number;
  extra?: HTMLElement;
}): Walk {
  const fig = figure(opts.label, { wide: true });
  const code = codeView(opts.excerpt, { maxHeight: opts.maxHeight ?? 340 });
  const ranges = opts.steps.map((s) => {
    const from = code.find(s.at);
    if (from < 0) throw new Error(`walk ${opts.label}: no line with "${s.at}"`);
    const to = s.to ? code.find(s.to, from) : from;
    if (to < 0) throw new Error(`walk ${opts.label}: no line with "${s.to}"`);
    return [from, to] as const;
  });
  let i = 0;
  const counter = h('span', { class: 'walk-n' });
  const title = h('span', { class: 'walk-title' });
  const note = h('div', { class: 'walk-note' });
  const pb = playback({
    baseMs: opts.baseMs ?? 1800,
    prev: () => { if (i > 0) go(i - 1); else if (opts.onStart) opts.onStart(); else go(opts.steps.length - 1); },
    next: () => { if (i < opts.steps.length - 1) go(i + 1); else if (opts.onEnd) opts.onEnd(); else go(0); },
  });
  fig.body.append(
    code.el,
    h('div', { class: 'walk-text' }, h('div', { class: 'walk-top' }, counter, title), note),
    pb.el,
  );
  if (opts.extra) fig.body.append(opts.extra);
  if (opts.panel) fig.body.append(opts.panel);

  function show(): void {
    const s = opts.steps[i]!;
    counter.textContent = `${i + 1}/${opts.steps.length}`;
    title.textContent = s.title;
    note.replaceChildren(rich(typeof s.note === 'function' ? s.note() : s.note));
  }
  function go(k: number): void {
    i = k;
    const [from, to] = ranges[i]!;
    code.mark(from, to);
    fig.dots(opts.steps.length, i);
    opts.steps[i]!.enter?.();
    show();
  }
  return { fig, code, go, index: () => i, refresh: show, stop: pb.stop };
}
