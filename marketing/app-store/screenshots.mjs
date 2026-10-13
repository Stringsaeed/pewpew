// Composes the captioned App Store screenshots (6.9", 1320x2868) from raw simulator captures.
// usage: node marketing/app-store/screenshots.mjs <raw-dir> <out-dir>
// Needs Playwright's Chromium. Raw captures are named after the `src` fields below.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [rawDir = 'marketing/raw', outDir = 'docs/app-store/screenshots'] = process.argv.slice(2);

const TIER = { violet: '42,20,80', teal: '12,58,68', crimson: '62,12,34' };

export const SHOTS = [
  { name: '01-gameplay', src: 'gameplay.png', tier: 'crimson', eyebrow: 'Drag to steer', title: ['Thread the', '<c>neon</c> chaos'], sub: 'Your rocket fires on its own. You just fly.' },
  { name: '02-hive', src: 'boss-hive.png', tier: 'teal', eyebrow: 'Three bosses', title: ['Dodge the', '<m>bullet curtain</m>'], sub: 'WARDEN. HIVE. CORE. Each one fights back harder.' },
  { name: '03-black-hole', src: 'black-hole.png', tier: 'crimson', eyebrow: 'Every level ends here', title: ['Dive into the', '<y>black hole</y>'], sub: 'Reach the wormhole to clear the sector.' },
  { name: '04-warden', src: 'boss-warden.png', tier: 'violet', eyebrow: 'Power-ups', title: ['Shields up.', '<c>Fire faster.</c>'], sub: 'Grab shields, rapid fire, and crystals mid-flight.' },
  { name: '05-core', src: 'boss-core.png', tier: 'crimson', eyebrow: 'Level 30', title: ['Face the', '<t>CORE</t>'], sub: 'The final boss. Two phases. No mercy.' },
  { name: '06-levels', src: 'levels.png', tier: 'violet', eyebrow: '30 levels · 90 stars', title: ['Earn', '<y>every star</y>'], sub: 'Keep your lives to the wormhole for three stars.' },
  { name: '07-clear', src: 'clear.png', tier: 'teal', eyebrow: 'Free · No ads · Offline', title: ['Beat your', '<g>best</g>'], sub: 'No account. No in-app purchases. Just play.' },
];

const ink = (s) => s
  .replace(/<c>(.*?)<\/c>/g, '<span class="c">$1</span>')
  .replace(/<m>(.*?)<\/m>/g, '<span class="m">$1</span>')
  .replace(/<y>(.*?)<\/y>/g, '<span class="y">$1</span>')
  .replace(/<g>(.*?)<\/g>/g, '<span class="g">$1</span>')
  .replace(/<t>(.*?)<\/t>/g, '<span class="t">$1</span>');

function html(shot, img) {
  const tint = TIER[shot.tier];
  return `<!doctype html><html><head><style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1320px; height: 2868px; overflow: hidden; background: #05050f; }
  body { font-family: Menlo, monospace; color: #e8ecff; position: relative; }
  .bg { position: absolute; inset: 0;
    background:
      radial-gradient(900px 700px at 20% 18%, rgba(${tint},0.95), transparent 70%),
      radial-gradient(800px 900px at 90% 70%, rgba(${tint},0.7), transparent 70%),
      radial-gradient(600px 500px at 50% 100%, rgba(255,61,154,0.18), transparent 70%),
      #05050f; }
  .stars { position: absolute; inset: 0; opacity: .7;
    background-image:
      radial-gradient(2px 2px at 120px 180px, #fff8, transparent), radial-gradient(3px 3px at 980px 120px, #fff9, transparent),
      radial-gradient(2px 2px at 640px 420px, #fff6, transparent), radial-gradient(2px 2px at 1200px 520px, #fff7, transparent),
      radial-gradient(3px 3px at 260px 640px, #fff5, transparent), radial-gradient(2px 2px at 820px 300px, #fff8, transparent),
      radial-gradient(2px 2px at 420px 90px, #fff7, transparent), radial-gradient(2px 2px at 1100px 760px, #fff5, transparent); }
  .copy { position: absolute; top: 190px; left: 0; right: 0; text-align: center; padding: 0 80px; }
  .eyebrow { font-size: 40px; letter-spacing: 14px; text-transform: uppercase; color: #ff3d9a; text-shadow: 0 0 24px rgba(255,61,154,.7); font-weight: 700; }
  h1 { margin-top: 40px; font-size: 128px; line-height: 1.04; font-weight: 900; letter-spacing: 2px; text-shadow: 0 0 40px rgba(232,236,255,.25); }
  .sub { margin-top: 40px; font-size: 42px; line-height: 1.4; color: #8a93b8; text-wrap: balance; }
  .c { color: #35f0ff; text-shadow: 0 0 36px rgba(53,240,255,.8); }
  .m { color: #ff3d9a; text-shadow: 0 0 36px rgba(255,61,154,.8); }
  .y { color: #ffd23f; text-shadow: 0 0 36px rgba(255,210,63,.75); }
  .g { color: #5dff9b; text-shadow: 0 0 36px rgba(93,255,155,.75); }
  .t { color: #ff5a36; text-shadow: 0 0 36px rgba(255,90,54,.85); }
  .phone { position: absolute; left: 50%; top: 960px; width: 1060px; height: 2303px; transform: translateX(-50%);
    border-radius: 150px; padding: 26px;
    background: linear-gradient(145deg, #3a3e5c, #0c0d18 35%, #1a1c2e 65%, #3a3e5c);
    box-shadow: 0 0 0 3px #05050f, 0 0 120px rgba(${tint},1), 0 60px 220px rgba(53,240,255,.22), 0 40px 160px rgba(255,61,154,.25); }
  .screen { position: relative; width: 100%; height: 100%; border-radius: 124px; overflow: hidden; background: #000; }
  .screen::after { content: ''; position: absolute; top: 26px; left: 50%; width: 286px; height: 84px; transform: translateX(-50%); border-radius: 42px; background: #000; }
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
const page = await browser.newPage({ viewport: { width: 1320, height: 2868 }, deviceScaleFactor: 1 });
mkdirSync(outDir, { recursive: true });
for (const shot of SHOTS) {
  const img = readFileSync(resolve(rawDir, shot.src)).toString('base64');
  await page.setContent(html(shot, img), { waitUntil: 'load' });
  await page.screenshot({ path: join(outDir, `${shot.name}.png`) });
  console.log('wrote', shot.name);
}
await browser.close();
