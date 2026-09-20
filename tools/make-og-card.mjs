/**
 * Render the share card, once, and write it into `static/`.
 *
 * Not a build step. A 1200x630 PNG that changes about never does not justify a headless
 * browser in every `npm run build`, and a share card that silently regenerates is one
 * nobody looks at again. Run it by hand when the card should change, and commit the
 * result:
 *
 *   node tools/make-og-card.mjs
 *
 * Chromium comes from the Playwright install the e2e suite already depends on, so this
 * adds no dependency of its own.
 */
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'og.png');

/*
 * Same fallback as `playwright.config.ts`, for the same reason: some images ship a
 * Chromium whose revision does not match the one this Playwright expects, and the
 * managed download is not always available. `CHROME_PATH` overrides both.
 */
const PREINSTALLED = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'];
const executablePath = process.env.CHROME_PATH ?? PREINSTALLED.find((p) => existsSync(p));

// The light palette from app.css. Light rather than dark because a share card is shown
// against whichever background the chat client uses, and the light one holds up on both.
const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; display: flex; flex-direction: column;
    justify-content: center; gap: 30px; padding: 76px 92px;
    background: #f2f6fa; color: #10151a;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  }
  .rule { width: 132px; height: 10px; background: #00539b; border-radius: 5px; }
  h1 { font-size: 92px; font-weight: 800; letter-spacing: -0.03em; line-height: 1; }
  /* Wide enough for two lines. At a narrower measure the last phrase wraps mid-clause,
     which is the one thing a card of four short lines cannot hide. */
  p { font-size: 42px; line-height: 1.3; color: #414d58; max-width: 30ch; font-weight: 400; }
  strong { color: #10151a; font-weight: 600; }
  ul { list-style: none; display: flex; gap: 16px; margin-top: 8px; flex-wrap: wrap; }
  li {
    font-size: 25px; font-weight: 600; padding: 11px 22px; border-radius: 999px;
    background: #ffffff; border: 2px solid #ccd8e4; color: #414d58;
  }
</style></head>
<body>
  <div class="rule"></div>
  <h1>ABA Assist</h1>
  <p>The terms, the ethics codes and the tracking, for <strong>ABA work</strong>.</p>
  <ul><li>Free</li><li>Works offline</li><li>No account</li><li>No ads</li></ul>
</body></html>`;

const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({
	viewport: { width: 1200, height: 630 },
	deviceScaleFactor: 1
});
await page.setContent(html, { waitUntil: 'networkidle' });
// Fonts settle after `networkidle` on a webfont; without this the card renders in the
// fallback face about one run in three.
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out, type: 'png' });
await browser.close();
console.log(`wrote ${out}`);
