// Composes the captioned App Store screenshots from raw simulator captures.
// usage: node marketing/app-store/screenshots.mjs <raw-dir> <out-dir> [WxH]
//   1320x2868 (default)  iPhone large display, from 1320x2868 raws
//   1206x2622            iPhone medium display, from the same raws
//   1398x2034            iPhone Duo outer display, from 1398x2034 Duo raws
// Needs Playwright's Chromium. Raw captures are named after the `src` fields below.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [rawDir = 'marketing/raw', outDir = 'docs/app-store/screenshots', size = '1320x2868'] = process.argv.slice(2);
const [W, H] = size.split('x').map(Number);

const TIER = { violet: '42,20,80', teal: '12,58,68', crimson: '62,12,34' };

export const SHOTS = [
  { name: '01-gameplay', src: 'gameplay.png', tier: 'crimson', eyebrow: 'Drag to steer', title: ['Thread the', '<c>neon</c> chaos'], sub: 'Your rocket fires on its own. You just fly.' },
  { name: '02-hive', src: 'boss-hive.png', tier: 'teal', eyebrow: 'Three bosses', title: ['Dodge the', '<m>bullet curtain</m>'], sub: 'WARDEN. HIVE. CORE. Each one fights back harder.' },
  { name: '03-black-hole', src: 'black-hole.png', tier: 'crimson', eyebrow: 'Every level ends here', title: ['Dive into the', '<y>black hole</y>'], sub: 'Reach the wormhole to clear the sector.' },
  { name: '04-warden', src: 'boss-warden.png', tier: 'violet', eyebrow: 'Power-ups', title: ['Shields up.', '<c>Fire faster.</c>'], sub: 'Grab shields, rapid fire, and crystals mid-flight.' },
  { name: '05-core', src: 'boss-core.png', tier: 'crimson', eyebrow: 'Level 30', title: ['Face the', '<t>CORE</t>'], sub: 'The final boss. Two phases. No mercy.' },
  { name: '06-levels', src: 'levels.png', tier: 'violet', eyebrow: '30 levels · 90 stars', title: ['Earn', '<y>every star</y>'], sub: 'Keep your lives to the wormhole for three stars.' },
  { name: '07-clear', src: 'clear.png', tier: 'teal', eyebrow: 'No ads · Offline', title: ['Beat your', '<g>best</g>'], sub: 'No account. No in-app purchases. Just play.' },
];

const ink = (s) => s
  .replace(/<c>(.*?)<\/c>/g, '<span class="c">$1</span>')
  .replace(/<m>(.*?)<\/m>/g, '<span class="m">$1</span>')
  .replace(/<y>(.*?)<\/y>/g, '<span class="y">$1</span>')
  .replace(/<g>(.*?)<\/g>/g, '<span class="g">$1</span>')
  .replace(/<t>(.*?)<\/t>/g, '<span class="t">$1</span>');

const pngAspect = (buf) => buf.readUInt32BE(20) / buf.readUInt32BE(16);

/**
 * Phone frame sized for the canvas and fitted to the raw's aspect. Tall phones bleed off the bottom edge like the
 * 1320x2868 layout; squat Duo captures keep the whole screen in frame, since the rocket flies at the very bottom.
 */
function frame(rawAspect) {
  const k = H / 2868;
  const tall = rawAspect > 2;
  const top = tall ? 960 * k : 0.275 * H;
  const height = tall ? (H - top) / (1908 / 2303) : H - top - 0.035 * H;
  const pad = 26 * k;
  const width = Math.min(W * (1060 / 1320), (height - 2 * pad) / rawAspect + 2 * pad);
  const r = width / 1060;
  // Simulator captures of Dynamic Island phones omit the island; the Duo's camera already shows in its captures.
  return { k, top, height, width, pad, r, island: tall };
}

function html(shot, img, f) {
  const tint = TIER[shot.tier];
  const s = (px) => `${Math.round(px * f.k * 100) / 100}px`;
  const q = (px) => `${Math.round(px * f.r * 100) / 100}px`;
  return `<!doctype html><html><head><style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #05050f; }
  body { font-family: Menlo, monospace; color: #e8ecff; position: relative; }
  .bg { position: absolute; inset: 0;
    background:
      radial-gradient(${s(900)} ${s(700)} at 20% 18%, rgba(${tint},0.95), transparent 70%),
      radial-gradient(${s(800)} ${s(900)} at 90% 70%, rgba(${tint},0.7), transparent 70%),
      radial-gradient(${s(600)} ${s(500)} at 50% 100%, rgba(255,61,154,0.18), transparent 70%),
      #05050f; }
  .stars { position: absolute; inset: 0; opacity: .7;
    background-image:
      radial-gradient(2px 2px at 120px 180px, #fff8, transparent), radial-gradient(3px 3px at 980px 120px, #fff9, transparent),
      radial-gradient(2px 2px at 640px 420px, #fff6, transparent), radial-gradient(2px 2px at 1200px 520px, #fff7, transparent),
      radial-gradient(3px 3px at 260px 640px, #fff5, transparent), radial-gradient(2px 2px at 820px 300px, #fff8, transparent),
      radial-gradient(2px 2px at 420px 90px, #fff7, transparent), radial-gradient(2px 2px at 1100px 760px, #fff5, transparent); }
  .copy { position: absolute; top: ${s(190)}; left: 0; right: 0; text-align: center; padding: 0 ${s(80)}; }
  .eyebrow { font-size: ${s(40)}; letter-spacing: ${s(14)}; text-transform: uppercase; color: #ff3d9a; text-shadow: 0 0 ${s(24)} rgba(255,61,154,.7); font-weight: 700; }
  h1 { margin-top: ${s(40)}; font-size: ${s(128)}; line-height: 1.04; font-weight: 900; letter-spacing: ${s(2)}; text-shadow: 0 0 ${s(40)} rgba(232,236,255,.25); }
  .sub { margin-top: ${s(40)}; font-size: ${s(42)}; line-height: 1.4; color: #8a93b8; text-wrap: balance; }
  .c { color: #35f0ff; text-shadow: 0 0 ${s(36)} rgba(53,240,255,.8); }
  .m { color: #ff3d9a; text-shadow: 0 0 ${s(36)} rgba(255,61,154,.8); }
  .y { color: #ffd23f; text-shadow: 0 0 ${s(36)} rgba(255,210,63,.75); }
  .g { color: #5dff9b; text-shadow: 0 0 ${s(36)} rgba(93,255,155,.75); }
  .t { color: #ff5a36; text-shadow: 0 0 ${s(36)} rgba(255,90,54,.85); }
  .phone { position: absolute; left: 50%; top: ${f.top}px; width: ${f.width}px; height: ${f.height}px; transform: translateX(-50%);
    border-radius: ${q(150)}; padding: ${f.pad}px;
    background: linear-gradient(145deg, #3a3e5c, #0c0d18 35%, #1a1c2e 65%, #3a3e5c);
    box-shadow: 0 0 0 3px #05050f, 0 0 ${s(120)} rgba(${tint},1), 0 ${s(60)} ${s(220)} rgba(53,240,255,.22), 0 ${s(40)} ${s(160)} rgba(255,61,154,.25); }
  .screen { position: relative; width: 100%; height: 100%; border-radius: ${q(124)}; overflow: hidden; background: #000; }
  .screen::after { content: ''; display: ${f.island ? 'block' : 'none'}; position: absolute; top: ${q(26)}; left: 50%; width: ${q(286)}; height: ${q(84)}; transform: translateX(-50%); border-radius: ${q(42)}; background: #000; }
  .screen img { width: 100%; height: 100%; object-fit: cover; display: block; }
  </style></head><body>
  <div class="bg"></div><div class="stars"></div>
  <div class="copy">
    <div class="eyebrow">${shot.eyebrow}</div>
    <h1>${shot.title.map(ink).join('<br>')}</h1>
    <div class="sub">${shot.sub}</div>
  </div>
  <div class="phone"><div class="screen"><img src="data:image/png;base64,${img}"></div></div>
  </body></html>`;
}

const exe = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
mkdirSync(outDir, { recursive: true });
for (const shot of SHOTS) {
  const raw = readFileSync(resolve(rawDir, shot.src));
  await page.setContent(html(shot, raw.toString('base64'), frame(pngAspect(raw))), { waitUntil: 'load' });
  await page.screenshot({ path: join(outDir, `${shot.name}.png`) });
  console.log('wrote', shot.name);
}
await browser.close();
