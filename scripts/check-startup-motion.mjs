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
    page.on('console', message => {
      if (/WebGL.*(?:INVALID_|bufferSubData|out of bounds)/i.test(message.text())) {
        errors.push(message.text());
      }
    });
    try {
      await page.goto(process.env.REVIEW_URL || 'http://127.0.0.1:5190/');
      await page.locator('.entry-start:enabled').press('Enter', { timeout: 30000 });

      if (!reduced) {
        const early = await page.waitForFunction(() => {
          const state = window.rhine?.stats();
          if (state?.intro && state.intro.elapsed < 0.5) return state;
        });
        const state = await early.jsonValue();
        assert.equal(state.mode, 'archive');
        assert.equal(state.hoverCell, null, 'Entry must not synthesize a pointer preselection');
        assert.equal(state.extraction, 0, 'The archive begins flat');
        const crest = await (await page.waitForFunction(() => {
          const stats = window.rhine?.stats();
          if (stats?.intro?.elapsed >= 1.17 && stats.intro.elapsed < 1.25) return stats;
        })).jsonValue();
        assert.ok(crest.modelPosition[1] > state.modelPosition[1] + 0.25, 'The first wave lifts the starting card');
        assert.equal(crest.extraction, 0);
        assert.equal(crest.hoverCell, null);
        assert.ok(crest.archiveCount > 0 && crest.archiveCount <= crest.archiveCapacity);
        const lit = await (await page.waitForFunction(() => {
          const stats = window.rhine?.stats();
          if (stats?.intro?.fullLiftUnlocked) return stats;
        })).jsonValue();
        assert.ok(lit.overviewSlotLights.selected.intensity >= 0.35);
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

      let openedFrom;
      if (!reduced) {
        await page.evaluate(() => window.rhine.replayIntro());
        await page.waitForFunction(() => {
          const stats = window.rhine.stats();
          return stats.intro?.elapsed >= 1.45 && stats.extraction > 0.06;
        });
        const handoff = await page.evaluate(async () => {
          const before = window.rhine.stats();
          window.rhine.detail();
          const after = await new Promise(resolve => {
            function sample() {
              const stats = window.rhine.stats();
              if (stats.renderedFrames > before.renderedFrames) resolve(stats);
              else requestAnimationFrame(sample);
            }
            requestAnimationFrame(sample);
          });
          return { before, after };
        });
        assert.equal(handoff.after.mode, 'detail');
        assert.equal(handoff.after.intro, null);
        assert.ok(handoff.after.modelPosition[1] >= handoff.before.modelPosition[1] - 0.05,
          'Opening before the light arrives must not drop the raised card');
        openedFrom = handoff.before.extraction;
      } else {
        await page.locator('#three-scene').press('Enter');
        const opening = await page.evaluate(() => window.rhine.stats());
        assert.equal(opening.mode, 'detail');
        assert.ok(opening.extraction >= settled.extraction - 0.02, 'Opening must continue from the current height');
        openedFrom = opening.extraction;
      }
      await page.waitForFunction(() => window.rhine.stats().extraction > 3.9);
      assert.deepEqual(errors, []);
      report.checks.push({ browserMotion, initialLift: settled.extraction, openedFrom });
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
