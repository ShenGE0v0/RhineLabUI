// 暗色主题已移除：window.rhine.stats() 的 selectedIndexDim / returningIndexDims 字段、
// wallpaper 属性 colortheme 与 selectedindexaccent 均随暗色主题删除。
// 「暗色下仅选中标签强调 / 两个方向高亮插值」的断言整段移除；
// 本脚本保留的意图：外部音乐频谱在拖拽期间保持活跃、flat 选择样式压平播放场、静音后恢复。
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&/THREE|shader|WebGL/.test(m.text()))errors.push(m.text())});
await page.goto('http://127.0.0.1:5176/?scene=archive');await page.waitForFunction(()=>window.rhine?.stats().ready);
const apply=async(values)=>{await page.evaluate(values=>window.wallpaperPropertyListener.applyUserProperties(Object.fromEntries(Object.entries(values).map(([k,value])=>[k,{value}]))),values);await page.waitForTimeout(300)};
const stats=()=>page.evaluate(()=>window.rhine.stats());
await apply({desktopmode:'workbench',boot:false,superperformance:true,screenfinish:false,hudparallax:false,uifrost:false,music:false,reduced:false,selectionstyle:'music-flat',audioreactive:true});
await page.waitForFunction(()=>window.rhine.stats().extraction>.38);
const before=await stats();
await page.evaluate(()=>{window.musicSignal=setInterval(()=>{const t=performance.now()/1000;window.rhineWallpaperSpectrum={samples:Array(128).fill(.2),time:t}},35)});
await page.mouse.move(860,480);await page.mouse.down();await page.mouse.move(1120,570,{steps:18});await page.mouse.up();
await page.waitForTimeout(1200);const dragged=await stats();
await page.evaluate(()=>{clearInterval(window.musicSignal);window.rhineWallpaperSpectrum={samples:Array(128).fill(0),time:performance.now()/1000}});
assert.ok(dragged.flatten>.9,'External spectrum remains active during a drag');
assert.ok(dragged.spectrumActivity>.9,'Removed local-sound filter does not suppress external music');
await page.waitForFunction(()=>window.rhine.stats().flatten<.01&&window.rhine.stats().spectrumActivity<.01);
await page.waitForFunction(()=>window.rhine.stats().extraction>.38&&!window.rhine.stats().archiveMomentum);
await apply({selectionstyle:'flat'});await page.waitForFunction(()=>window.rhine.stats().flatten>.995);
const flat=await stats();assert.ok(flat.flatten>.995,'Flat selection style flattens the playfield');
await mkdir('verification/selection-state',{recursive:true});await page.screenshot({path:'verification/selection-state/flat.png'});
await apply({selectionstyle:'music-flat'});await page.waitForFunction(()=>window.rhine.stats().flatten<.01&&window.rhine.stats().extraction>.38);await page.screenshot({path:'verification/selection-state/silent-selected.png'});
assert.deepEqual(errors,[]);await writeFile('verification/selection-state/results.json',JSON.stringify({before,dragged,flat,errors},null,2));
console.log('External spectrum remains active during drag and releases; flat selection style flattens the playfield; restore passed. Dark-theme selected-label accent checks removed with the dark theme.');
} finally {await browser.close()}
