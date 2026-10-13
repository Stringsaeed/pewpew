// Social cut for LinkedIn and X: the app preview playing in a phone, with timed callouts about the stack.
// usage: node marketing/video/social.mjs <app-preview.mp4> <out-dir>
// Layers are drawn by Chromium (Playwright) and composited by ffmpeg, which needs no text support of its own.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [preview = 'docs/app-store/preview/app-preview.mp4', outDir = 'marketing/out'] = process.argv.slice(2);

const FORMATS = {
  landscape: { w: 1920, h: 1080, screen: { x: 360, y: 64, h: 952 }, col: { x: 930, w: 860 }, scale: 1, title: 112, endTitle: 88 },
  square: { w: 1080, h: 1080, screen: { x: 64, y: 70, h: 940 }, col: { x: 548, w: 490 }, scale: 0.6, title: 66, endTitle: 50 },
};

const BEATS = [
  { t: [0.2, 3.6], kicker: 'Now on iPhone', title: '<span class="logo"><b>PEWPEW</b><i>PEWPEW</i></span>', body: 'A neon space shooter. 30 levels. 3 bosses. One rocket.' },
  { t: [3.8, 9.2], kicker: 'Rendering', title: '<span class="c">WebGPU</span>', body: 'Four WGSL pipelines: a procedural nebula, instanced flat-shaded meshes, additive glow, a fresnel shield. One instance buffer per frame.', stat: ['~3 ms', 'JS per frame, whole game'] },
  { t: [9.4, 14.6], kicker: 'UI thread', title: '<span class="m">Reanimated 4</span>', body: 'Score pops, life loss, boss bars and panels animate on the UI thread. React re-renders only when a HUD number actually changes.' },
  { t: [14.8, 20.2], kicker: 'Agent QA', title: '<span class="g">Argent</span>', body: 'AI agents drove the iOS Simulator through Argent: tapping through menus, playing levels, profiling, and staging every shot you see here.', stat: ['30/30', 'levels beaten by the bot'] },
  { t: [20.4, 25.6], kicker: 'Audio', title: '<span class="y">Synthesized</span>', body: 'react-native-audio-api plays tracker songs and effects generated at runtime from data. Meshes come from a script too.', stat: ['0', 'audio files'] },
  { t: [25.8, 29.0], kicker: 'Free · No ads · Open source', title: '<span class="c">pewpew</span><span class="dim">.saeed.sh</span>', body: 'Free on the App Store<br>github.com/Stringsaeed/pewpew<br>@stringsaeed', end: true },
];

const css = (f) => `
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${f.w}px; height: ${f.h}px; overflow: hidden; background: transparent; }
  body { font-family: Menlo, monospace; color: #e8ecff; position: relative; }
  .c { color: #35f0ff; text-shadow: 0 0 ${30 * f.scale}px rgba(53,240,255,.8); }
  .m { color: #ff3d9a; text-shadow: 0 0 ${30 * f.scale}px rgba(255,61,154,.8); }
  .y { color: #ffd23f; text-shadow: 0 0 ${30 * f.scale}px rgba(255,210,63,.75); }
  .g { color: #5dff9b; text-shadow: 0 0 ${30 * f.scale}px rgba(93,255,155,.75); }
  .dim { color: #8a93b8; }
`;

function screenRect(f) {
  const sw = Math.round((f.screen.h * 886) / 1920);
  return { x: f.screen.x, y: f.screen.y, w: sw, h: f.screen.h, r: Math.round(sw * 0.125) };
}

function background(f) {
  const s = screenRect(f);
  const pad = Math.round(s.w * 0.035);
  return `<style>${css(f)}
    body { background:
      radial-gradient(${f.w * 0.5}px ${f.h * 0.7}px at ${s.x + s.w / 2}px 50%, rgba(42,20,80,.85), transparent 70%),
      radial-gradient(${f.w * 0.45}px ${f.h * 0.6}px at 85% 20%, rgba(12,58,68,.55), transparent 70%),
      radial-gradient(${f.w * 0.4}px ${f.h * 0.5}px at 80% 100%, rgba(255,61,154,.16), transparent 70%), #05050f; }
    .grid { position: absolute; inset: 0; opacity: .14;
      background-image: linear-gradient(rgba(138,147,184,.35) 1px, transparent 1px), linear-gradient(90deg, rgba(138,147,184,.35) 1px, transparent 1px);
      background-size: ${48 * f.scale + 16}px ${48 * f.scale + 16}px; mask-image: radial-gradient(closest-side, #000, transparent); }
    .phone { position: absolute; left: ${s.x - pad}px; top: ${s.y - pad}px; width: ${s.w + 2 * pad}px; height: ${s.h + 2 * pad}px;
      border-radius: ${s.r + pad}px; background: linear-gradient(145deg, #3a3e5c, #0c0d18 35%, #1a1c2e 65%, #3a3e5c);
      box-shadow: 0 0 0 2px #05050f, 0 0 ${90 * f.scale}px rgba(53,240,255,.25), 0 ${40 * f.scale}px ${140 * f.scale}px rgba(255,61,154,.3); }
    .hole { position: absolute; left: ${s.x}px; top: ${s.y}px; width: ${s.w}px; height: ${s.h}px; border-radius: ${s.r}px; background: #000; }
  </style><div class="grid"></div><div class="phone"></div><div class="hole"></div>`;
}

function islandLayer(f) {
  const s = screenRect(f);
  const iw = Math.round(s.w * 0.28), ih = Math.round(s.w * 0.083);
  return `<style>${css(f)}</style><div style="position:absolute;left:${s.x + (s.w - iw) / 2}px;top:${s.y + Math.round(s.w * 0.02)}px;width:${iw}px;height:${ih}px;border-radius:${ih}px;background:#000"></div>`;
}

function maskLayer(f) {
  const s = screenRect(f);
  return `<style>html,body{margin:0;background:#000}</style><div style="position:absolute;left:0;top:0;width:${s.w}px;height:${s.h}px;border-radius:${s.r}px;background:#fff"></div>`;
}

function beatLayer(f, b) {
  const k = f.scale;
  return `<style>${css(f)}
    .col { position: absolute; left: ${f.col.x}px; top: 0; bottom: 0; width: ${f.col.w}px; display: flex; flex-direction: column; justify-content: center; gap: ${26 * k}px; }
    .kicker { font-size: ${26 * k + 4}px; letter-spacing: ${10 * k}px; text-transform: uppercase; color: #ff3d9a; font-weight: 700; text-shadow: 0 0 20px rgba(255,61,154,.6); }
    h1 { font-size: ${b.end ? f.endTitle : f.title}px; white-space: nowrap; line-height: 1.02; font-weight: 900; letter-spacing: ${2 * k}px; }
    .logo { display: inline-grid; } .logo b, .logo i { grid-area: 1/1; font-style: normal; font-weight: 900; letter-spacing: ${12 * k}px; }
    .logo b { position: relative; z-index: 1; color: #35f0ff; text-shadow: 0 0 ${28 * k}px rgba(53,240,255,.9); }
    .logo i { color: #ff3d9a; transform: translate(-${7 * k}px, ${7 * k}px); text-shadow: 0 0 ${24 * k}px rgba(255,61,154,.8); }
    p { font-size: ${36 * k + 2}px; line-height: 1.45; color: #8a93b8; max-width: ${f.col.w}px; text-wrap: pretty; }
    .stat { display: flex; align-items: baseline; gap: ${18 * k}px; margin-top: ${10 * k}px; padding-top: ${24 * k}px; border-top: 1px solid rgba(138,147,184,.25); }
    .stat b { font-size: ${72 * k}px; color: #e8ecff; font-weight: 800; }
    .stat span { font-size: ${24 * k + 4}px; letter-spacing: ${4 * k}px; color: #5b6385; text-transform: uppercase; }
    .stack { display: flex; flex-wrap: wrap; gap: ${14 * k}px ${28 * k}px; font-size: ${24 * k + 4}px; letter-spacing: ${4 * k}px; text-transform: uppercase; margin-top: ${12 * k}px; }
  </style>
  <div class="col">
    <div class="kicker">${b.kicker}</div>
    <h1>${b.title}</h1>
    <p>${b.body}</p>
    ${b.stat ? `<div class="stat"><b>${b.stat[0]}</b><span>${b.stat[1]}</span></div>` : ''}
    ${b.end ? `<div class="stack"><span class="c">WebGPU</span><span class="m">Reanimated</span><span class="y">Audio API</span><span class="g">Argent</span></div>` : ''}
  </div>`;
}

const exe = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
mkdirSync(outDir, { recursive: true });

for (const [name, f] of Object.entries(FORMATS)) {
  const dir = mkdtempSync(join(tmpdir(), `pewpew-social-${name}-`));
  const s = screenRect(f);
  const page = await browser.newPage({ viewport: { width: f.w, height: f.h }, deviceScaleFactor: 1 });
  const shoot = async (file, body, transparent = true) => {
    await page.setContent(`<!doctype html><html><body>${body}</body></html>`);
    await page.screenshot({ path: join(dir, file), omitBackground: transparent });
  };
  await shoot('bg.png', background(f), false);
  await shoot('island.png', islandLayer(f));
  await page.setViewportSize({ width: s.w, height: s.h });
  await shoot('mask.png', maskLayer(f), false);
  await page.setViewportSize({ width: f.w, height: f.h });
  for (const [i, b] of BEATS.entries()) await shoot(`beat${i}.png`, beatLayer(f, b));
  await page.close();

  const inputs = ['-loop', '1', '-t', '29', '-i', join(dir, 'bg.png'), '-i', preview, '-loop', '1', '-t', '29', '-i', join(dir, 'mask.png'), '-loop', '1', '-t', '29', '-i', join(dir, 'island.png')];
  BEATS.forEach((_, i) => inputs.push('-loop', '1', '-t', '29', '-i', join(dir, `beat${i}.png`)));
  let g = `[1:v]scale=${s.w}:${s.h}:flags=lanczos,format=rgba[vid];[2:v]format=gray,scale=${s.w}:${s.h}[mask];[vid][mask]alphamerge[screen];`;
  g += `[0:v][screen]overlay=${s.x}:${s.y}[b0];[b0][3:v]overlay=0:0[b1];`;
  let last = 'b1';
  BEATS.forEach((b, i) => {
    const [a, z] = b.t;
    const fadeOut = z >= 29 ? '' : `,fade=t=out:st=${z - 0.35}:d=0.35:alpha=1`;
    g += `[${4 + i}:v]format=rgba,fade=t=in:st=${a}:d=0.35:alpha=1${fadeOut}[t${i}];[${last}][t${i}]overlay=0:0:enable='between(t,${a},${z})'[o${i}];`;
    last = `o${i}`;
  });
  g += `[${last}]format=yuv420p[v]`;
  const out = join(outDir, `pewpew-${name}.mp4`);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...inputs, '-filter_complex', g, '-map', '[v]', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '192k', '-t', '29', '-movflags', '+faststart', out], { stdio: 'inherit' });
  console.log('wrote', out);
}
await browser.close();
