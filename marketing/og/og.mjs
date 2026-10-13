// Renders website/public/og.png (1200x630) from the App Store screenshots.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const shot = (name) => `data:image/png;base64,${readFileSync(`${root}docs/app-store/screenshots/${name}.png`).toString('base64')}`;

const html = `<!doctype html><html><head><style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #05050f; font-family: Menlo, monospace; color: #e8ecff; }
  .bg { position: absolute; inset: 0; background:
    radial-gradient(50% 70% at 78% 50%, rgba(255, 61, 154, 0.28), transparent 70%),
    radial-gradient(40% 60% at 15% 30%, rgba(53, 240, 255, 0.16), transparent 70%),
    radial-gradient(60% 80% at 60% 110%, rgba(110, 60, 220, 0.35), transparent 70%); }
  .copy { position: absolute; left: 72px; top: 0; bottom: 0; display: flex; flex-direction: column; justify-content: center; gap: 22px; width: 560px; }
  .eyebrow { font-size: 16px; letter-spacing: 0.35em; color: #ff3d9a; font-weight: 700; }
  .logo { position: relative; font-size: 128px; font-weight: 800; letter-spacing: 0.04em; line-height: 1; }
  .logo span { position: relative; z-index: 1; color: #35f0ff; text-shadow: 0 0 28px rgba(53, 240, 255, 0.75); }
  .logo::before { content: 'PEWPEW'; position: absolute; left: 5px; top: 5px; color: #ff3d9a; opacity: 0.85; }
  .tag { font-size: 22px; letter-spacing: 0.22em; color: #ffd23f; text-shadow: 0 0 16px rgba(255, 210, 63, 0.5); }
  .stack { display: flex; gap: 18px; font-size: 15px; letter-spacing: 0.14em; font-weight: 700; margin-top: 10px; }
  .stack b:nth-child(1) { color: #35f0ff; } .stack b:nth-child(2) { color: #ff3d9a; } .stack b:nth-child(3) { color: #5dff9b; }
  .url { font-size: 18px; color: #8a93b8; letter-spacing: 0.08em; }
  .fan { position: absolute; right: -10px; top: 40px; width: 560px; height: 600px; }
  .fan img { position: absolute; width: 250px; border-radius: 20px; box-shadow: 0 30px 80px rgba(0, 0, 0, 0.7), 0 0 60px rgba(255, 61, 154, 0.25); border: 1px solid rgba(138, 147, 184, 0.25); }
  .fan img:nth-child(1) { left: 20px; top: 90px; transform: rotate(-10deg); }
  .fan img:nth-child(2) { left: 280px; top: 90px; transform: rotate(10deg); }
  .fan img:nth-child(3) { left: 150px; top: 20px; z-index: 2; width: 270px; }
</style></head><body>
  <div class="bg"></div>
  <div class="copy">
    <div class="eyebrow">FREE ON IPHONE</div>
    <div class="logo"><span>PEWPEW</span></div>
    <div class="tag">30 LEVELS. 3 BOSSES.<br>ONE ROCKET.</div>
    <div class="stack"><b>WEBGPU</b><b>REANIMATED</b><b>ARGENT</b></div>
    <div class="url">pewpew.saeed.sh</div>
  </div>
  <div class="fan">
    <img src="${shot('02-hive')}"><img src="${shot('05-core')}"><img src="${shot('01-gameplay')}">
  </div>
</body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.screenshot({ path: `${root}website/public/og.png` });
await browser.close();
console.log('wrote website/public/og.png');
