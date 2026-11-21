// Run against the web preview. Set PLAYWRIGHT_MODULE to a local test installation if needed.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href
  : 'playwright');
const channel = process.env.REVIEW_CHANNEL || 'chrome';
const browser = await chromium.launch({
  channel,
  headless: true,
  args: process.platform === 'win32' ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : [],
});
const report = { channel, version: browser.version(), checks: [] };

try {
  for (const browserMotion of ['no-preference', 'reduce']) {
    const reduced = browserMotion === 'reduce';
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: browserMotion,
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(process.env.REVIEW_URL || 'http://127.0.0.1:5190/');
      await page.locator('.entry-start:enabled').press('Enter', { timeout: 30000 });

      if (!reduced) {
        const early = await page.waitForFunction(() => {
          const state = window.rhine?.stats();
          if (state?.intro && !state.intro.fullLiftUnlocked) return state;
        });
        const state = await early.jsonValue();
        assert.equal(state.mode, 'archive');
        assert.equal(state.hoverCell, null, 'Entry must not synthesize a pointer preselection');
        assert.equal(state.extraction, 0, 'The card rises only after the array settles at its slot');
      }

      await page.waitForFunction(() => {
        const state = window.rhine?.stats();
        return state?.startup === 'started' && !state.intro && state.extraction >= 0.38;
      }, null, { timeout: 20000 });
      const settled = await page.evaluate(() => window.rhine.stats());
      assert.equal(settled.mode, 'archive');
      assert.equal(settled.motion.reduced, reduced);
      assert.equal(settled.motion.preset, reduced ? 'reduced' : 'full');
      assert.equal(settled.hoverCell, null);

      await page.locator('#three-scene').press('Enter');
      const opening = await page.evaluate(() => window.rhine.stats());
      assert.equal(opening.mode, 'detail');
      assert.ok(opening.extraction >= settled.extraction - 0.02, 'Opening must continue from the current height');
      await page.waitForFunction(() => window.rhine.stats().extraction > 3.9);
      assert.deepEqual(errors, []);
      report.checks.push({ browserMotion, initialLift: settled.extraction, openedFrom: opening.extraction });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

await mkdir('.tools/responsive', { recursive: true });
await writeFile(`.tools/responsive/startup-${channel}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
