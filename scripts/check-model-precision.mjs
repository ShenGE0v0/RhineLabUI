import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const smoke = process.argv.includes('--smoke');
const root = resolve('release/model-precision');
const output = `verification/model-precision/browser${smoke?'-smoke':''}`;
await mkdir(output,{recursive:true});
const scenarios = (process.env.PRECISION_CASES || 'static,idle,navigate,detail,inspect').split(',');
const orders = smoke ? [['high','medium','low']] : [['high','medium','low'],['low','high','medium'],['medium','low','high']];
const count = smoke ? 12 : 96;
async function runFixture({scenarios,count}) {
  const b = window.bench;
  b.scene.inputEvents.abort(); b.scene.setHover(null); b.scene.hoverLifts.clear(); b.scene.pointer.set(0,0);
  const results = [];
  for(const scenario of scenarios) {
    await b.prepare(scenario);
    // Compile/render the exact scenario before measuring; the measured sample
    // restarts its deterministic input index after this warm-up.
    await b.sample(scenario,60);
    await b.prepare(scenario);
    for(let i=0;i<60;i++){b.draw();await new Promise(r=>setTimeout(r,16));}
    const result = {scenario,...await b.sample(scenario,count)};
    b.scene.resize(); b.draw();
    result.image = b.scene.renderer.domElement.toDataURL('image/png');
    results.push(result);
  }
  return {userAgent:navigator.userAgent,results};
}
const server = createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  try {
    const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
    if(!path.startsWith(root+'/')&&!path.startsWith(root+'\\'))throw Error('outside root');
    const data=await readFile(path);
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');res.end(data);
  }catch{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(5197,'127.0.0.1',r));
const errors=[], runs=[];
let browser;
try {
  browser=await require(process.env.PLAYWRIGHT_MODULE||'playwright').chromium.launch({channel:'msedge',headless:true});
  for(const [round,order] of orders.entries())for(const tier of order){
    console.log('START browser',round+1,tier);
    const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'&&/THREE|WebGL|shader/.test(m.text()))errors.push(m.text());});
    await page.goto(`http://127.0.0.1:5197/reference/performance.html?precision=${tier}`);
    await page.waitForFunction(()=>window.bench,{timeout:90000});
    const data=await page.evaluate(runFixture,{scenarios,count});
    await page.close();
    if(data.error)throw Error(data.error);
    for(const result of data.results){
      await writeFile(`${output}/${tier}-${round+1}-${result.scenario}.png`,Buffer.from(result.image.split(',')[1],'base64'));delete result.image;
      const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)]??null;
      result.summary=Object.fromEntries(['cpu','gpu','calls','triangles','uploadBytes'].map(k=>[k,median(result.samples.map(s=>s[k]).filter(v=>v!==null))]));
      console.log(tier,result.scenario,JSON.stringify(result.summary),JSON.stringify(result.geometry));
    }
    runs.push({tier,round:round+1,...data});
    await writeFile(`${output}/runs.json`,JSON.stringify({errors,runs},null,2));
  }
  if(errors.length)throw Error(errors.join('\n'));
}finally{await browser?.close();server.close();}
