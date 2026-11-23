// Run against built web preview. Uses the same environment as check-motion-integration.mjs.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { testScreenshotPath } from './test-screenshot-path.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: process.env.REVIEW_CHANNEL || 'msedge', headless: true });
const errors = [], report = {};
const watch = page => page.on('pageerror', error => errors.push(error.message));
const settings = async page => {
  await page.locator('[data-action="settings"]').click();
  await page.locator('.motion-advanced summary').click();
};
const closeSettings = async page => {
  await page.locator('[data-action="close-modal"]').click();
  await page.waitForFunction(() => !document.querySelector('.modal-backdrop'));
};
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  // 暗色主题已移除：prefs 不再有 colorTheme 字段，亮色暖焦糖是唯一主题。
  await context.addInitScript(() => localStorage.setItem('rhine-settings', JSON.stringify({
    music: false, superPerformance: true,
    motion: { boot: false, surfaceTransitions: false, detailTransition: true, modelDecryption: false, documentReveal: false },
  })));
  const page = await context.newPage(); watch(page);
  await page.goto(process.env.REVIEW_URL || 'http://127.0.0.1:5190');
  await page.waitForFunction(() => window.rhine?.stats().startup === 'started' && !document.querySelector('#loading'));
  await settings(page);
  report.contrast = await page.evaluate(() => {
    const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
    const luminance = color => rgb(color).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
      .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const panel = getComputedStyle(document.querySelector('.terminal-modal')).backgroundColor;
    return [...document.querySelectorAll('.motion-settings-head button, .motion-settings-head span, .motion-advanced summary span, .motion-settings legend, .motion-setting span')].map(el => {
      const style = getComputedStyle(el), background = style.backgroundColor === 'rgba(0, 0, 0, 0)' ? panel : style.backgroundColor;
      const a = luminance(style.color), b = luminance(background);
      return { text: el.textContent, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
    });
  });
  assert.ok(report.contrast.every(item => item.ratio >= 4.5), JSON.stringify(report.contrast));
  await mkdir('.tools/motion-surfaces', { recursive: true });
  await page.locator('.motion-settings-head').screenshot({ path: testScreenshotPath('motion-surfaces', 'light-controls.png') });
  await closeSettings(page);
  const entry = await page.evaluate(() => {
    window.rhine.detail();
    return { animations: document.querySelector('#detail-ui').getAnimations().length, camera: window.rhine.stats().cameraDetail };
  });
  assert.equal(entry.animations, 0, 'Disabled surface transition does not fade the detail panel');
  assert.ok(entry.camera < .95, 'Independent 3D detail transition still runs');
  await page.waitForFunction(() => window.rhine.stats().cameraDetail > .95);
  await page.locator('[data-tab="notes"]').click();
  assert.equal(await page.locator('.tab-indicator').evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  assert.equal(await page.locator('#tab-panel').evaluate(el => el.getAnimations().length), 0);
  await page.evaluate(() => window.rhine.archive());
  assert.equal(await page.locator('#detail-ui').evaluate(el => el.hidden), true, 'Detail exit completes immediately');
  await settings(page);
  await page.locator('[data-motion="detailTransition"]').uncheck();
  await page.locator('[data-motion="surfaceTransitions"]').check();
  await closeSettings(page);
  assert.ok(await page.evaluate(() => {
    window.rhine.detail();
    return document.querySelector('#detail-ui').getAnimations().some(a => a.playState === 'running');
  }), 'UI fade remains available when only the 3D transition is disabled');
  await context.close();
  assert.deepEqual(errors, []);
  await writeFile('.tools/motion-surfaces/report.json', JSON.stringify(report, null, 2));
  console.log('Passed: independent UI/3D transitions and light text contrast; no page errors.');
} finally { await browser.close(); }
