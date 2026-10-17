import { EXCERPTS, type Excerpt } from './data';
import { h } from './dom';

/** What a call does, in one line. A name listed here becomes clickable in any code block and opens its real source. */
export const CALLS: Record<string, string> = {
  step: 'Advances the world by one 1/60 s tick. Ten stages in a fixed order.',
  steer: 'Turns the input into rocket velocity, adds well pull, moves and clamps x.',
  wellPull: 'Sideways acceleration from every gravity well within 5 units of the rocket\'s row.',
  spawnFromTrack: 'Releases compiled spawns that are now within 24 units ahead.',
  fire: 'Adds a bolt every 12 ticks, or every 6 while rapid fire is on.',
  moveBodies: 'Integrates every body; drones run their pattern and may fire.',
  collide: 'Rocket against bodies, then each bolt against the boss and hazards.',
  collect: 'Applies a pickup: shield flag, rapid timer, or crystal score.',
  split: 'Replaces a destroyed asteroid with fragments flying apart.',
  hurt: 'Spends the shield if there is one, otherwise a life, then grants immunity.',
  despawn: 'Removes dead bodies and anything out of range.',
  transition: 'Decides loss, boss arrival, boss death, and the win at the wormhole.',
  createWorld: 'Builds a fresh World for a level: compiled track, seeded RNG, empty pool.',
  add: 'Appends a body to the pool, or counts a drop when all 512 slots are full.',
  remove: 'Swap-remove: the last body moves into the freed slot.',
  compileTrack: 'Turns a level row and its seed into a sorted list of spawns, once.',
  steerVelocity: 'Proportional steering with a speed cap and an acceleration cap.',
  dragInput: 'Maps a finger drag to a target x, relative to where the finger went down.',
  rand: 'mulberry32: a 32-bit integer PRNG that every JS engine computes identically.',
  sinT: 'A polynomial sine. Engine Math.sin can differ in the last bit between Hermes and V8.',
  cosT: 'cos via sinT, shifted by π/2.',
  clamp: 'Pins a value into [lo, hi].',
  DRONE_MOVES: 'One motion function per drone pattern.',
  driveX: 'Sets a drone\'s x and writes the matching vx, so readers see true velocity.',
  droneClock: 'Random start phase so drone fire is spread from the first frame.',
  runBoss: 'Sweeps the boss and fires the next attack when its timer is due.',
  bossAttack: 'Spawns one attack: spread, aimed bolts, a mine wall, or drones.',
  bossPhase: 'Picks the boss phase from current hp. Never stored, always derived.',
  simulate: 'Headless run with a bot, recording every input as float32.',
  replay: 'Feeds recorded inputs back through the same createWorld and step.',
  run: 'The shared loop behind simulate and replay.',
  hashWorld: 'FNV-1a over the world\'s state, used to prove two runs are identical.',
  hudOf: 'Derives the HUD; returns the previous object when nothing visible changed.',
  advance: 'One rendered frame: clamps dt, runs up to four steps, calls the sinks.',
  press: 'Finger down: remember the rocket x and finger x.',
  drag: 'Finger moves: a new target x from the relative drag.',
  release: 'Finger up: the rocket coasts.',
  resetRun: 'Rebuilds the World when the (level, attempt) key changes.',
  setPlaying: 'The only writer of loop.playing.',
  reduce: 'The screen state machine.',
  recordRun: 'Max-merges a finished run into the save.',
  isUnlocked: 'A level is open when the previous one has a star.',
  writeCamera: 'Fills the view and projection matrices into the uniform block.',
  pump: 'Every 25 ms, schedules music notes that fall within the next 120 ms.',
  playSfx: 'Plays a sound effect, stealing the oldest voice past its cap.',
  begin: 'Starts a song from step 0.',
  greedyBot: 'The verifier\'s player: scores nine lanes three seconds ahead.',
  defineLevels: 'Validates the level table at import time.',
  levelSpec: 'Row n of the level table.',
  tierOf: 'Levels 1–10 are tier 1, 11–20 tier 2, 21–30 tier 3.',
  ARCHETYPES: 'Per-kind table: role, radius, hp, score, split.',
};

const KEYWORDS = new Set(('const let var function return if else for while do switch case break continue new export import from type interface ' +
  'readonly typeof as of in null true false void undefined this default throw try catch finally async await extends keyof satisfies').split(' '));

type Tok = { t: 'com' | 'str' | 'num' | 'kw' | 'fn' | 'prop' | 'type' | 'id' | 'sign' | 'sp'; v: string };

/** A small TypeScript tokenizer. Good enough for highlighting; it never needs to parse. */
export function tokenize(src: string): Tok[] {
  const re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`)|(0x[0-9a-fA-F]+|\b\d+(?:\.\d+)?(?:e-?\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|([\s\S])/g;
  const raw: Tok[] = [];
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m[1]) raw.push({ t: 'com', v: m[1] });
    else if (m[2]) raw.push({ t: 'str', v: m[2] });
    else if (m[3]) raw.push({ t: 'num', v: m[3] });
    else if (m[4]) raw.push({ t: 'id', v: m[4] });
    else if (m[5]) raw.push({ t: 'sp', v: m[5] });
    else raw.push({ t: 'sign', v: m[6]! });
  }
  for (let i = 0; i < raw.length; i++) {
    const tk = raw[i]!;
    if (tk.t !== 'id') continue;
    let j = i + 1;
    while (raw[j]?.t === 'sp') j++;
    let k = i - 1;
    while (raw[k]?.t === 'sp') k--;
    if (KEYWORDS.has(tk.v)) tk.t = 'kw';
    else if (raw[j]?.v === '(') tk.t = 'fn';
    else if (raw[k]?.v === '.') tk.t = 'prop';
    else if (/^[A-Z]/.test(tk.v)) tk.t = 'type';
  }
  return raw;
}

/** Highlights inline `code` spans and plain fenced blocks that came from post.md. */
export function highlightInto(el: HTMLElement, src: string): void {
  el.replaceChildren(...tokenize(src).map((tk) => (tk.t === 'sp' || tk.t === 'id' ? document.createTextNode(tk.v) : h('span', { class: `t-${tk.t}` }, tk.v))));
}

export interface CodeView {
  readonly el: HTMLElement;
  /** Line elements, index 0 = first line of the excerpt. */
  readonly lines: HTMLElement[];
  readonly excerpt: Excerpt;
  /** Index of the first excerpt line containing `needle`, searching from `from`. -1 when absent. */
  find(needle: string, from?: number): number;
  /** Highlight [from, to] inclusive, dim the rest when `dim`, and scroll the box so the range is visible. */
  mark(from: number, to: number, dim?: boolean): void;
  clearMark(): void;
}

/**
 * Renders a real excerpt with its line numbers. Names in CALLS become buttons that open the callee's source in an
 * inline peek under the line, which can itself be peeked into, three levels deep.
 */
export function codeView(name: string | Excerpt, opts: { depth?: number; maxHeight?: number; self?: string } = {}): CodeView {
  const ex = typeof name === 'string' ? EXCERPTS[name] : name;
  if (ex === undefined) throw new Error(`no excerpt ${String(name)}`);
  const self = opts.self ?? (typeof name === 'string' ? name : '');
  const depth = opts.depth ?? 0;
  const box = h('div', { class: 'codebox', style: opts.maxHeight ? `max-height:${opts.maxHeight}px` : null });
  const pre = h('pre', { class: 'code live' });
  box.append(pre);
  const lines: HTMLElement[] = [];
  let line = h('div', { class: 'cl' }, h('span', { class: 'ln' }, String(ex.start)));
  const body = (): HTMLElement => line.lastElementChild as HTMLElement;
  line.append(h('span', { class: 'cc' }));
  const push = (node: Node) => body().append(node);
  const newline = () => {
    lines.push(line);
    pre.append(line);
    line = h('div', { class: 'cl' }, h('span', { class: 'ln' }, String(ex.start + lines.length)), h('span', { class: 'cc' }));
  };
  for (const tk of tokenize(ex.text)) {
    const parts = tk.v.split('\n');
    parts.forEach((part, pi) => {
      if (pi > 0) newline();
      if (!part) return;
      if ((tk.t === 'fn' || tk.t === 'id' || tk.t === 'type' || tk.t === 'prop') && CALLS[part] && part !== self && depth < 3 && EXCERPTS[part]) {
        const host = line;
        push(h('button', { type: 'button', class: `call t-${tk.t}`, title: CALLS[part], onclick: () => togglePeek(host, part) }, part));
      } else if (tk.t === 'sp' || tk.t === 'id') push(document.createTextNode(part));
      else push(h('span', { class: `t-${tk.t}` }, part));
    });
  }
  newline();

  function togglePeek(host: HTMLElement, callee: string): void {
    const next = host.nextElementSibling;
    if (next instanceof HTMLElement && next.dataset.peek === callee) { next.remove(); return; }
    if (next instanceof HTMLElement && next.dataset.peek) next.remove();
    const cex = EXCERPTS[callee]!;
    const inner = codeView(callee, { depth: depth + 1, maxHeight: 300 });
    const peek = h('div', { class: 'peek', 'data-peek': callee },
      h('div', { class: 'peek-head' },
        h('span', {}, h('b', {}, callee), ': ', CALLS[callee] ?? ''),
        h('span', { class: 'peek-src' }, `${cex.file}:${cex.start}`),
        h('button', { type: 'button', class: 'peek-x', 'aria-label': 'close', onclick: () => peek.remove() }, '×'),
      ),
      inner.el,
    );
    host.after(peek);
  }

  return {
    el: box,
    lines,
    excerpt: ex,
    find(needle, from = 0) {
      for (let i = from; i < lines.length; i++) if (ex.text.split('\n')[i]!.includes(needle)) return i;
      return -1;
    },
    mark(from, to, dim = true) {
      lines.forEach((l, i) => {
        const on = i >= from && i <= to;
        l.classList.toggle('on', on);
        l.classList.toggle('dim', dim && !on);
      });
      const first = lines[from];
      if (first) {
        // Centre the range in the box without scrolling the page.
        const top = first.offsetTop - box.clientHeight / 3;
        box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }
    },
    clearMark() {
      for (const l of lines) l.classList.remove('on', 'dim');
    },
  };
}

/** A captioned, standalone excerpt for the post: file:line on top, peekable calls inside. */
export function codeFigure(name: string, caption?: string): HTMLElement {
  const view = codeView(name, { maxHeight: 460 });
  const ex = view.excerpt;
  return h('figure', { class: 'codefig' },
    h('div', { class: 'codefig-head' }, h('span', { class: 'mono' }, `${ex.file}:${ex.start}`), h('span', { class: 'hint' }, 'click a dotted name to open it')),
    view.el,
    caption ? h('figcaption', {}, caption) : null,
  );
}
