// Builds the "How pewpew works" post: renders post.md to HTML, bundles the figures with the real game modules, and
// pulls every code excerpt from the source at build time so the post cannot drift from the code.
// Run: node explainer/build.mjs [--watch]. Serve: python3 -m http.server 8787 --directory explainer/dist
import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = join(HERE, 'dist');
const WATCH = process.argv.includes('--watch');

/** Every excerpt the post can show or peek into. The pattern matches the first line; the excerpt runs to its closing brace. */
const EXCERPTS = {
  step: ['src/sim/step.ts', /^export function step\(/],
  steer: ['src/sim/step.ts', /^function steer\(/],
  wellPull: ['src/sim/step.ts', /^function wellPull\(/],
  spawnFromTrack: ['src/sim/step.ts', /^function spawnFromTrack\(/],
  fire: ['src/sim/step.ts', /^function fire\(/],
  moveBodies: ['src/sim/step.ts', /^function moveBodies\(/],
  collide: ['src/sim/step.ts', /^function collide\(/],
  collect: ['src/sim/step.ts', /^function collect\(/],
  split: ['src/sim/step.ts', /^function split\(/],
  despawn: ['src/sim/step.ts', /^function despawn\(/],
  transition: ['src/sim/step.ts', /^function transition\(/],
  hurt: ['src/sim/step.ts', /^function hurt\(/],
  Bodies: ['src/sim/world.ts', /^export interface Bodies/],
  World: ['src/sim/world.ts', /^export interface World /],
  createWorld: ['src/sim/world.ts', /^export function createWorld\(/],
  add: ['src/sim/world.ts', /^export function add\(/],
  remove: ['src/sim/world.ts', /^export function remove\(/],
  compileTrack: ['src/sim/track.ts', /^export function compileTrack\(/],
  steerVelocity: ['src/sim/input.ts', /^export function steerVelocity\(/],
  dragInput: ['src/sim/input.ts', /^export function dragInput\(/],
  rand: ['src/sim/math.ts', /^export function rand\(/],
  sinT: ['src/sim/math.ts', /^export function sinT\(/],
  cosT: ['src/sim/math.ts', /^export function cosT\(/],
  clamp: ['src/sim/math.ts', /^export function clamp\(/],
  DRONE_MOVES: ['src/sim/drones.ts', /^export const DRONE_MOVES/],
  driveX: ['src/sim/drones.ts', /^function driveX\(/],
  droneClock: ['src/sim/drones.ts', /^export function droneClock\(/],
  runBoss: ['src/sim/boss.ts', /^export function runBoss\(/],
  bossAttack: ['src/sim/boss.ts', /^function bossAttack\(/],
  bossPhase: ['src/sim/boss.ts', /^function bossPhase\(/],
  simulate: ['src/sim/run.ts', /^export function simulate\(/],
  replay: ['src/sim/run.ts', /^export function replay\(/],
  run: ['src/sim/run.ts', /^function run\(/],
  hashWorld: ['src/sim/run.ts', /^export function hashWorld\(/],
  hudOf: ['src/sim/hud.ts', /^export function hudOf\(/],
  advance: ['src/shell/loop.ts', /^export function advance\(/],
  press: ['src/shell/loop.ts', /^export function press\(/],
  drag: ['src/shell/loop.ts', /^export function drag\(/],
  release: ['src/shell/loop.ts', /^export function release\(/],
  resetRun: ['src/shell/loop.ts', /^export function resetRun\(/],
  setPlaying: ['src/shell/loop.ts', /^export function setPlaying\(/],
  reduce: ['src/flow.ts', /^export function reduce\(/],
  recordRun: ['src/save.ts', /^export function recordRun\(/],
  isUnlocked: ['src/save.ts', /^export function isUnlocked\(/],
  writeCamera: ['src/render/camera.ts', /^export function writeCamera\(/],
  pump: ['src/audio/engine.ts', /^\s*function pump\(/],
  playSfx: ['src/audio/engine.ts', /^\s*function playSfx\(/],
  begin: ['src/audio/engine.ts', /^\s*function begin\(/],
  EVENT_SFX: ['src/audio/data.ts', /^export const EVENT_SFX/],
  greedyBot: ['src/bot.ts', /^export const greedyBot/],
  defineLevels: ['src/levels.ts', /^export function defineLevels\(/],
  levelSpec: ['src/levels.ts', /^export const levelSpec/],
  tierOf: ['src/levels.ts', /^export const tierOf/],
  ARCHETYPES: ['src/levels.ts', /^export const ARCHETYPES/],
  RAMP: ['src/levels.ts', /^export const RAMP/],
  appSinks: ['App.tsx', /sinksRef\.current = \{/],
  gpuFrame: ['src/shell/useGpu.ts', /const frameFn = \(now: number\)/],
  gpuInit: ['src/shell/useGpu.ts', /const init = async \(\)/],
};

function extract(file, pattern) {
  const lines = readFileSync(join(ROOT, file), 'utf8').split('\n');
  const i = lines.findIndex((l) => pattern.test(l));
  if (i < 0) throw new Error(`excerpt not found: ${file} ${pattern}`);
  let depth = 0;
  let opened = false;
  let j = i;
  for (; j < lines.length; j++) {
    const code = lines[j].replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '').replace(/\/\/.*$/, '');
    for (const ch of code) {
      if (ch === '{') { depth++; opened = true; } else if (ch === '}') depth--;
    }
    if (opened && depth === 0) break;
    if (!opened && /;\s*$/.test(code)) break;
  }
  const body = lines.slice(i, j + 1);
  const indent = Math.min(...body.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return { file, start: i + 1, text: body.map((l) => l.slice(indent)).join('\n') };
}

/** Golden verifier rows: n, hash, steps, score, stars. Produced by `npm run verify`. */
function golden() {
  const rows = readFileSync(join(ROOT, 'scripts/verify-levels.golden.txt'), 'utf8').trim().split('\n');
  return rows.map((line) => {
    const [n, hash, steps, score, stars] = line.trim().split(/\s+/);
    return { n: Number(n), hash, steps: Number(steps), score: Number(score), stars: Number(stars) };
  });
}

// ---------- A small Markdown dialect for the post ----------
// Blocks: # title, ## / ### headings, paragraphs, - and 1. lists, > quotes, ``` fences, and {{figure}} on its own line.
// Inline: `code`, **strong**, *em*, [text](url), and ^[note]. Notes are numbered in the text and listed at the end.
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
let noteN = 0;
let endnotes = [];
function inline(src) {
  // Notes first, on the raw text: a note is inlined on its own, with its own code spans.
  const notes = [];
  let s = src.replace(/\^\[((?:[^\[\]]|\[[^\]]*\])+)\]/g, (_, n) => { notes.push(n); return `\u0001${notes.length - 1}\u0001`; });
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\u0001(\d+)\u0001/g, (_, k) => {
    noteN += 1;
    const body = inline(notes[Number(k)]);
    endnotes.push(`<li id="note-${noteN}">${body} <a class="back" href="#ref-${noteN}" aria-label="back to the text">↑</a></li>`);
    return `<sup class="ref" id="ref-${noteN}"><a href="#note-${noteN}">${noteN}</a></sup>`;
  });
  return s.replace(/\u0000(\d+)\u0000/g, (_, k) => `<code class="inline" data-code>${esc(codes[Number(k)])}</code>`);
}

function markdown(md) {
  const out = [];
  const lines = md.replace(/\r/g, '').split('\n');
  let i = 0;
  let headingN = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim() || 'ts';
      const body = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) body.push(lines[i]);
      i++;
      out.push(`<pre class="code" data-lang="${lang}"><code>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }
    const fig = line.match(/^\{\{([\w:-]+)\}\}\s*$/);
    if (fig) { out.push(`<div class="fig" data-fig="${fig[1]}"></div>`); i++; continue; }
    const h = line.match(/^(#{1,3}) (.*)$/);
    if (h) {
      const level = h[1].length;
      const id = h[2].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (level === 1) out.push(`<h1 class="title">${inline(h[2])}</h1>`);
      else { headingN += 1; out.push(`<h${level} id="${id}"><a href="#${id}">${inline(h[2])}</a></h${level}>`); }
      i++;
      continue;
    }
    if (/^(- |\d+\. )/.test(line)) {
      const ordered = /^\d+\. /.test(line);
      const items = [];
      while (i < lines.length && /^(- |\d+\. )/.test(lines[i])) {
        let item = lines[i].replace(/^(- |\d+\. )/, '');
        i++;
        while (i < lines.length && /^ {2,}\S/.test(lines[i])) { item += ' ' + lines[i].trim(); i++; }
        items.push(`<li>${inline(item)}</li>`);
      }
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }
    if (line.startsWith('> ')) {
      const body = [];
      while (i < lines.length && lines[i].startsWith('> ')) { body.push(lines[i].slice(2)); i++; }
      out.push(`<blockquote>${inline(body.join(' '))}</blockquote>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3} |```|- |\d+\. |> |\{\{)/.test(lines[i])) { para.push(lines[i]); i++; }
    if (para.length === 0) { para.push(line); i++; }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  void headingN;
  if (endnotes.length) out.push(`<section class="notes"><h2 class="notes-h">Notes</h2><ol>${endnotes.join('')}</ol></section>`);
  return out.join('\n');
}

// ---------- Exposing sim internals to the figures, without touching the game source ----------
// step() calls ten private stage functions. The step-by-step figure calls the same functions in the same order, so this
// plugin appends an export line to step.ts and boss.ts in the bundle only. The figure then checks its result against a
// world advanced by the real step(), so the walkthrough cannot quietly diverge from the game.
const STEP_INTERNALS = ['steer', 'wellPull', 'spawnFromTrack', 'fire', 'moveBodies', 'collide', 'despawn', 'transition'];
const internals = {
  name: 'pewpew-internals',
  setup(b) {
    b.onResolve({ filter: /^pewpew-internals$/ }, () => ({ path: 'pewpew-internals', namespace: 'pewpew-internals' }));
    b.onLoad({ filter: /.*/, namespace: 'pewpew-internals' }, () => ({
      contents: `export { ${STEP_INTERNALS.join(', ')} } from './src/sim/step';\nexport { bossPhase } from './src/sim/boss';\n`,
      resolveDir: ROOT,
      loader: 'ts',
    }));
    b.onLoad({ filter: /[\\/]src[\\/]sim[\\/](step|boss)\.ts$/ }, (args) => {
      const src = readFileSync(args.path, 'utf8');
      const extra = args.path.endsWith('step.ts') ? `export { ${STEP_INTERNALS.join(', ')} };` : 'export { bossPhase };';
      return { contents: `${src}\n${extra}\n`, loader: 'ts' };
    });
  },
};

function buildData() {
  mkdirSync(join(HERE, 'build'), { recursive: true });
  const excerpts = {};
  for (const [name, [file, pattern]] of Object.entries(EXCERPTS)) excerpts[name] = extract(file, pattern);
  writeFileSync(join(HERE, 'build/excerpts.json'), JSON.stringify(excerpts));
  writeFileSync(join(HERE, 'build/golden.json'), JSON.stringify(golden()));
}

function buildPage() {
  noteN = 0;
  endnotes = [];
  mkdirSync(OUT, { recursive: true });
  const post = markdown(readFileSync(join(HERE, 'post.md'), 'utf8'));
  const page = readFileSync(join(HERE, 'site/index.html'), 'utf8').replace('<!--POST-->', post);
  writeFileSync(join(OUT, 'index.html'), page);
  copyFileSync(join(HERE, 'site/style.css'), join(OUT, 'style.css'));
  // Paper Mono (paper.design/mono), self-hosted with its licence, so the page loads nothing from the network.
  mkdirSync(join(OUT, 'fonts'), { recursive: true });
  for (const f of ['PaperMono-wght.woff2', 'OFL.txt']) copyFileSync(join(HERE, 'site/fonts', f), join(OUT, 'fonts', f));
}

const options = {
  entryPoints: [join(HERE, 'src/main.ts')],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  outfile: join(OUT, 'app.js'),
  alias: {
    '@react-native-async-storage/async-storage': join(HERE, 'stubs/async-storage.ts'),
    'react-native-audio-api': join(HERE, 'stubs/audio-api.ts'),
  },
  plugins: [internals, {
    name: 'page',
    setup(b) { b.onStart(() => { buildData(); buildPage(); }); },
  }],
  logLevel: 'warning',
  loader: { '.json': 'json' },
};

buildData();
buildPage();
if (WATCH) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('explainer: watching (post.md and site/ are re-read on every rebuild)');
} else {
  await esbuild.build(options);
  console.log(`explainer built: ${join('explainer', 'dist', 'index.html')}`);
}
