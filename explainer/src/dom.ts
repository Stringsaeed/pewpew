export type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, string | number | boolean | EventListener | null | undefined>;

function append(el: Node, kids: Child[]): void {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k);
  }
}

/** Tiny element builder. Attributes starting with "on" bind events (onclick, oninput, ...). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') (el as HTMLInputElement).value = String(v);
    else if (k === 'checked') (el as HTMLInputElement).checked = v === true;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, kids);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** SVG element builder. Same attribute rules as h. */
export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number | null | undefined> = {}, ...kids: Child[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, String(v));
  append(el, kids);
  return el;
}

export function clear(el: Element): void {
  el.replaceChildren();
}

/** A labelled range input that calls onChange with the numeric value on every input event. */
export function slider(label: string, min: number, max: number, step: number, value: number, onChange: (v: number) => void): HTMLLabelElement {
  const out = h('output', {}, String(value));
  const input = h('input', {
    type: 'range', min, max, step, value,
    oninput: (e: Event) => {
      const v = Number((e.target as HTMLInputElement).value);
      out.textContent = String(v);
      onChange(v);
    },
  });
  return h('label', { class: 'ctl' }, h('span', {}, label), input, out);
}

export function select<T extends string | number>(label: string, options: readonly T[], value: T, onChange: (v: T) => void, text: (v: T) => string = String): HTMLLabelElement {
  const el = h('select', {
    onchange: (e: Event) => {
      const raw = (e.target as HTMLSelectElement).value;
      const match = options.find((o) => String(o) === raw);
      if (match !== undefined) onChange(match);
    },
  }, options.map((o) => h('option', { value: String(o), selected: o === value }, text(o))));
  return h('label', { class: 'ctl' }, h('span', {}, label), el);
}

export function button(text: string, onClick: () => void, extra: Attrs = {}): HTMLButtonElement {
  return h('button', { type: 'button', ...extra, onclick: onClick }, text);
}

/** A code block from build-time excerpts, with real line numbers and a source reference. */
export function code(name: string, excerpts: Record<string, { file: string; start: number; text: string }>): HTMLElement {
  const ex = excerpts[name];
  if (ex === undefined) throw new Error(`no excerpt ${name}`);
  const lines = ex.text.split('\n');
  return h('details', { class: 'src' },
    h('summary', {}, `${ex.file}:${ex.start}`, h('span', { class: 'muted' }, ` · ${lines.length} lines`)),
    h('pre', {}, h('code', {}, lines.map((line, i) => [h('span', { class: 'ln' }, String(ex.start + i)), line, '\n']))),
  );
}
