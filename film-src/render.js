// Renders film.html to film.mp4, frame by frame.
// Usage (needs Node, Playwright with Chromium, and ffmpeg):
//   node film-src/render.js && ffmpeg -framerate 30 -i film-src/frames/f%05d.png -c:v libx264 -pix_fmt yuv420p -crf 23 -movflags +faststart assets/film.mp4
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
(async () => {
  const out = path.join(__dirname, 'frames');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('file://' + path.join(__dirname, 'film.html'));
  await page.evaluate(() => document.fonts.ready);
  const fps = 30;
  const frames = Math.round(await page.evaluate(() => window.DURATION) * fps);
  for (let i = 0; i < frames; i++) {
    await page.evaluate(t => window.render(t), i / fps);
    await page.screenshot({ path: path.join(out, 'f' + String(i).padStart(5, '0') + '.png') });
  }
  await browser.close();
})();
