// Run after web build, with web preview :5190.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:process.env.REVIEW_CHANNEL||'chrome',headless:true});
const errors=[];
const watch=page=>page.on('pageerror',error=>errors.push(error.message));
const settings=async page=>{await page.locator('[data-action="settings"]').click();await page.locator('.motion-advanced summary').click();};
const close=async page=>{await page.locator('[data-action="close-modal"]').click();await page.waitForFunction(()=>!document.querySelector('.modal-backdrop'));};
const stats=page=>page.evaluate(()=>window.rhine.stats());
try {
 const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block',reducedMotion:'reduce'});
 await context.addInitScript(()=>{if(!localStorage.getItem('rhine-settings'))localStorage.setItem('rhine-settings',JSON.stringify({reduced:false,superPerformance:true,music:false}));});
 const page=await context.newPage();watch(page);
 const load=async()=>{await page.waitForFunction(()=>window.rhine?.stats().ready);if(await page.locator('.entry-start').count())await page.locator('.entry-start').click();await page.waitForFunction(()=>!document.querySelector('#loading'));};
 await page.goto(process.env.REVIEW_URL||'http://127.0.0.1:5190');await load();
 assert.equal((await stats(page)).motion.preset,'full','Saved legacy full overrides system reduce');
 await page.evaluate(()=>window.rhine.archive());await settings(page);
 const keys=await page.locator('[data-motion]').evaluateAll(inputs=>inputs.map(input=>input.dataset.motion));assert.equal(keys.length,14);
 assert.ok(!keys.includes('smoothScroll'),'Do not expose an unimplemented scroll control');
 for(const key of keys){
  await page.locator(`[data-motion="${key}"]`).uncheck();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('rhine-settings')));
  // 暗色主题已移除：prefs.colorTheme 字段不再存在，仅保留动效开关与超性能设置的持久化校验。
  assert.equal(saved.motion[key],false);assert.equal(saved.superPerformance,true);
  assert.equal((await stats(page)).motion.preset,'custom');
  await page.locator(`[data-motion="${key}"]`).check();
 }
 await page.locator('[data-motion="modelDecryption"]').uncheck();
 await page.locator('[data-motion="detailTransition"]').uncheck();
 await page.locator('[data-motion="viewerModelTransition"]').uncheck();
 await page.locator('[data-motion="viewerNavigation"]').uncheck();
 await close(page);await page.reload();await load();
 assert.equal((await stats(page)).motion.preset,'custom');
 await page.evaluate(()=>window.rhine.archive());await page.waitForTimeout(400);
 assert.equal((await stats(page)).decryption.modelClarity,0,'Archive stays frosted when model reveal is disabled');
 await page.evaluate(()=>window.rhine.detail());
 await page.waitForFunction(()=>document.querySelectorAll('.document-redaction-window').length>0);
 assert.equal((await stats(page)).decryption.modelClarity,1);
 await page.waitForFunction(()=>document.querySelector('#inspection-marks').style.opacity==='0');
 await page.waitForFunction(()=>!document.querySelector('.document-redaction-window'));
 await page.locator('[data-action="model-viewer"]').click();
 await page.waitForFunction(()=>JSON.parse(document.querySelector('.model-viewer')?.dataset.stats||'{}').ready);
 await page.locator('[data-viewer="explode"]').click();
 await page.waitForFunction(()=>{const s=JSON.parse(document.querySelector('.model-viewer').dataset.stats);return s.spread===s.target&&s.target>0;});
 await page.locator('[data-viewer="frosted"]').click();
 await page.waitForFunction(()=>JSON.parse(document.querySelector('.model-viewer').dataset.stats).clarity===0);
 await page.locator('[data-viewer="assemble"]').click();
 await page.waitForFunction(()=>JSON.parse(document.querySelector('.model-viewer').dataset.stats).spread===0);
 await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('.model-viewer').hidden);
 await page.evaluate(()=>{window.rhine.archive();window.rhine.select(1);});
 await page.waitForFunction(()=>{
   const s=window.rhine.stats();
   return s.returningAppearance.length>0 && s.returningAppearance.every(card=>card.clarity===0);
 });
 assert.equal((await stats(page)).decryption.modelClarity,0,'New selection stays frosted');
 await page.evaluate(()=>window.rhine.select(0));
 assert.equal((await stats(page)).decryption.modelClarity,0,'Rapidly reselected returning card stays frosted');
 await settings(page);
 await page.locator('[data-motion="modelDecryption"]').check();await page.locator('[data-motion="documentReveal"]').uncheck();await close(page);
 await page.waitForTimeout(500);await page.evaluate(()=>window.rhine.detail());
 await page.waitForFunction(()=>document.querySelector('#inspection-marks').style.opacity==='1');
 assert.equal(await page.locator('.document-redaction-window').count(),0);
 await context.close();
 assert.deepEqual(errors,[]);
 console.log('Web: 14 toggles, legacy/custom persistence, super performance coexistence, archive/returning frost, independent model/document reveal and viewer controls passed; no page errors.');
}finally{await browser.close();}
