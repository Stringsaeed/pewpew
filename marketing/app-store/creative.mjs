// Renders the iOS 27 App Store creative assets: product page header, search result, and universal.
// usage: node marketing/app-store/creative.mjs <out-dir> [--guides]
// --guides outlines each safe area, for checking layouts only; never upload those renders.
// Needs Playwright's Chromium.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const guides = args.includes('--guides');
const outDir = args.find((a) => !a.startsWith('--')) ?? 'docs/app-store/creative';

const root = resolve(import.meta.dirname, '../..');
const png = (p) => `data:image/png;base64,${readFileSync(join(root, p)).toString('base64')}`;
const svg = (p) => `data:image/svg+xml;base64,${readFileSync(join(root, p)).toString('base64')}`;

const art = {
  warden: png('website/src/assets/bosses/warden.png'),
  hive: png('website/src/assets/bosses/hive.png'),
  core: png('website/src/assets/bosses/core.png'),
  hole: png('website/src/assets/bosses/blackhole.png'),
  gameplay: png('marketing/raw/gameplay.png'),
  bossHive: png('marketing/raw/boss-hive.png'),
  blackHole: png('marketing/raw/black-hole.png'),
};
const rocket = ['03-pink-echo', '04-flame', '05-fins', '06-rocket-body', '07-porthole']
  .map((l) => svg(`design/rocket-icon/layers/${l}.svg`));

/** Safe areas from Apple's templates; anything outside them may be cropped on some device or orientation. */
const ASSETS = [
  {
    name: 'header', w: 3840, h: 1646, safe: { x: 1097, y: 493, w: 1646, h: 661 },
    glow: [[1920, 823, 1500, '110,40,220', 0.55], [600, 700, 1300, '62,12,34', 0.9], [3300, 900, 1300, '12,58,68', 0.9]],
    layers: [
      { img: 'hole', cx: 1920, cy: 823, size: 1700, opacity: 0.5 },
      { img: 'warden', cx: 520, cy: 700, size: 2100, opacity: 0.95 },
      { img: 'hive', cx: 3330, cy: 760, size: 2100, opacity: 0.95 },
      { rocket: true, cx: 1400, cy: 823, size: 700, rotate: 8 },
      { logo: true, x: 1730, cy: 823, size: 230, tag: 50, align: 'left' },
    ],
  },
  {
    name: 'search', w: 3840, h: 2560, safe: { x: 836, y: 765, w: 2168, h: 1030 },
    glow: [[2560, 1280, 1700, '110,40,220', 0.6], [500, 600, 1600, '62,12,34', 0.9], [3400, 2100, 1600, '12,58,68', 0.9]],
    layers: [
      { img: 'hole', cx: 2560, cy: 1280, size: 2200, opacity: 0.45 },
      { img: 'warden', cx: 420, cy: 520, size: 2000, opacity: 0.8 },
      { img: 'core', cx: 3440, cy: 2180, size: 2000, opacity: 0.8 },
      { logo: true, x: 880, cy: 1280, size: 230, tag: 50, align: 'left' },
      { phone: 'gameplay', cx: 2120, cy: 1290, height: 960, rotate: -8 },
      { phone: 'blackHole', cx: 2760, cy: 1290, height: 960, rotate: 8 },
      { phone: 'bossHive', cx: 2440, cy: 1270, height: 1010, rotate: 0 },
    ],
  },
  {
    name: 'universal', w: 5244, h: 2950, safe: { x: 1921, y: 660, w: 1402, h: 962 },
    glow: [[2622, 1141, 2200, '110,40,220', 0.6], [900, 1300, 1900, '62,12,34', 0.9], [4350, 1300, 1900, '12,58,68', 0.9]],
    layers: [
      { img: 'hole', cx: 2622, cy: 1000, size: 2400, opacity: 0.5 },
      { img: 'warden', cx: 900, cy: 1200, size: 2700, opacity: 0.95 },
      { img: 'hive', cx: 4344, cy: 1200, size: 2700, opacity: 0.95 },
      { img: 'core', cx: 2622, cy: 2500, size: 2100, opacity: 0.55 },
      { rocket: true, cx: 2622, cy: 880, size: 520, rotate: 0 },
      { logo: true, x: 2622, cy: 1350, size: 230, tag: 56, align: 'center' },
    ],
  },
];

const feather = 'mask-image: radial-gradient(closest-side, #000 45%, transparent 100%);';

function layer(l) {
  if (l.img) {
    const s = l.size;
    return `<img class="art" src="${art[l.img]}" style="left:${l.cx - s / 2}px; top:${l.cy - s * 0.375}px; width:${s}px; height:${s * 0.75}px; opacity:${l.opacity}; object-fit:cover; ${feather}">`;
  }
  if (l.rocket) {
    const s = l.size;
    const imgs = rocket.map((src) => `<img src="${src}" style="position:absolute; inset:0; width:100%; height:100%">`).join('');
    return `<div style="position:absolute; left:${l.cx - s / 2}px; top:${l.cy - s / 2}px; width:${s}px; height:${s}px; transform:rotate(${l.rotate}deg); filter: drop-shadow(0 0 ${s * 0.06}px rgba(53,240,255,.55))">${imgs}</div>`;
  }
  if (l.logo) {
    const anchor = l.align === 'center' ? `left:${l.x}px; transform:translate(-50%,-50%); text-align:center;` : `left:${l.x}px; transform:translateY(-50%);`;
    return `<div class="logo-block" style="top:${l.cy}px; ${anchor}">
      <div class="logo" style="font-size:${l.size}px"><i>PEWPEW</i><b>PEWPEW</b></div>
      <div class="tag" style="font-size:${l.tag}px; margin-top:${l.size * 0.16}px">30 levels. 3 bosses.<br><y>One rocket.</y></div>
    </div>`;
  }
  const h = l.height;
  const w = h / (2868 / 1320);
  return `<div class="phone" style="left:${l.cx - w / 2}px; top:${l.cy - h / 2}px; width:${w}px; height:${h}px; border-radius:${w * 0.14}px; padding:${w * 0.025}px; transform:rotate(${l.rotate}deg)">
    <div class="screen" style="border-radius:${w * 0.117}px"><img src="${art[l.phone]}"></div></div>`;
}

function html(a) {
  const glow = a.glow.map(([x, y, r, c, o]) => `radial-gradient(${r}px ${r * 0.8}px at ${x}px ${y}px, rgba(${c},${o}), transparent 70%)`).join(',');
  const s = a.safe;
  return `<!doctype html><html><head><style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${a.w}px; height: ${a.h}px; overflow: hidden; background: #05050f; }
  body { position: relative; font-family: Menlo, monospace; color: #e8ecff; }
  .bg { position: absolute; inset: 0; background: ${glow}, #05050f; }
  canvas { position: absolute; inset: 0; }
  .art { position: absolute; display: block; }
  .logo-block { position: absolute; white-space: nowrap; }
  .logo { display: inline-grid; font-weight: 900; letter-spacing: 0.06em; line-height: 1; }
  .logo b, .logo i { grid-area: 1 / 1; font-style: normal; }
  .logo b { position: relative; color: #35f0ff; text-shadow: 0 0 0.12em rgba(53,240,255,.9), 0 0 0.4em rgba(53,240,255,.45); }
  .logo i { color: #ff3d9a; transform: translate(-0.035em, 0.035em); text-shadow: 0 0 0.15em rgba(255,61,154,.8); }
  .tag { line-height: 1.5; letter-spacing: 0.32em; text-transform: uppercase; font-weight: 700; color: #e8ecff; text-shadow: 0 0 0.5em rgba(5,5,15,1); }
  y { color: #ffd23f; text-shadow: 0 0 0.6em rgba(255,210,63,.7); }
  .phone { position: absolute; background: linear-gradient(145deg, #3a3e5c, #0c0d18 35%, #1a1c2e 65%, #3a3e5c);
    box-shadow: 0 0 0 3px #05050f, 0 0 120px rgba(110,40,220,.9), 0 40px 160px rgba(255,61,154,.3); }
  .screen { width: 100%; height: 100%; overflow: hidden; background: #000; }
  .screen img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .guide { position: absolute; left: ${s.x}px; top: ${s.y}px; width: ${s.w}px; height: ${s.h}px; outline: 6px dashed #5dff9b; }
  </style></head><body>
  <div class="bg"></div><canvas id="stars" width="${a.w}" height="${a.h}"></canvas>
  ${a.layers.map(layer).join('\n')}
  ${guides ? '<div class="guide"></div>' : ''}
  <script>
    const c = document.getElementById('stars').getContext('2d');
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < ${Math.round((a.w * a.h) / 9000)}; i++) {
      const r = rnd() < 0.92 ? 1 + rnd() * 1.6 : 2.6 + rnd() * 2.4;
      c.globalAlpha = 0.25 + rnd() * 0.6;
      c.fillStyle = rnd() < 0.15 ? '#ffb8e0' : rnd() < 0.3 ? '#b8f6ff' : '#ffffff';
      c.beginPath(); c.arc(rnd() * ${a.w}, rnd() * ${a.h}, r, 0, Math.PI * 2); c.fill();
    }
  </script>
  </body></html>`;
}

const exe = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
mkdirSync(outDir, { recursive: true });
for (const a of ASSETS) {
  const page = await browser.newPage({ viewport: { width: a.w, height: a.h }, deviceScaleFactor: 1 });
  await page.setContent(html(a), { waitUntil: 'load' });
  await page.screenshot({ path: join(outDir, `${a.name}.png`) });
  await page.close();
  console.log('wrote', a.name);
}
await browser.close();
