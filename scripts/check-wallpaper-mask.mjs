// Run against the Wallpaper Engine Vite preview (--mode wallpaper).
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { testScreenshotPath } from './test-screenshot-path.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: process.env.REVIEW_CHANNEL || 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Wait for these test properties just as the file-based CEF host does.
  await page.addInitScript(() => { window.wallpaperRegisterAudioListener = () => {}; });
  await page.goto(process.env.WALLPAPER_URL || 'http://127.0.0.1:5176/');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="100%" height="100%" fill="#bfd0db"/></svg>';
  const image = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  const apply = props => page.evaluate(values => {
    window.wallpaperPropertyListener.applyUserProperties(
      Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }])),
    );
  }, props);
  await apply({ load3donstartup: false, desktopmode: 'archive', music: false, reduced: true, customwallpaper: true, customwallpaperfile: image });
  await page.waitForFunction(() => window.rhine?.stats().startup === 'started' &&
    document.querySelector('#stage').dataset.customWallpaperVisible === 'true');

  const results = [];
  for (const value of [100, 50, 0]) {
    await apply({ customwallpaper: true, customwallpapermask: value });
    const result = await page.locator('.archive-atmosphere').evaluate(el => ({
      opacity: getComputedStyle(el).opacity,
      top: getComputedStyle(el, '::before').backgroundSize,
      bottom: getComputedStyle(el, '::after').backgroundSize,
    }));
    assert.equal(result.opacity, value === 0 ? '0' : '1');
    assert.deepEqual(result.top.split(', ').slice(0, 2), [`100% ${value}%`, '100% 100%']);
    assert.equal(result.bottom.split(', ')[0], `100% ${value}%`);
    results.push({ value, ...result });
    await page.screenshot({ path: testScreenshotPath('wallpaper-mask', `${value}.png`) });
  }
  assert.deepEqual(errors, []);
  await mkdir('.tools/wallpaper-mask', { recursive: true });
  await writeFile('.tools/wallpaper-mask/results.json', JSON.stringify(results, null, 2));
  console.log('Wallpaper mask ranges 100, 50, 0 passed.');
} finally {
  await browser.close();
}
