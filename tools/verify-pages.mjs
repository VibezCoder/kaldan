import fs from 'node:fs';
import path from 'node:path';
import { launchChrome } from './lib/chrome.mjs';
const ROOT = 'C:/Users/Dell/Desktop/kaldanhotel';
const OUT = path.join(ROOT, 'capture/prototype');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const s = await launchChrome({ width: 1440, height: 900, logDir: OUT });
const { cdp } = s;
const errors = [];
cdp.on('Runtime.exceptionThrown', (p) => errors.push('exception: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
cdp.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error') errors.push('console: ' + p.args.map((a) => a.value || a.description || '').join(' ')); });
cdp.on('Log.entryAdded', (p) => { if (p.entry.level === 'error') errors.push('log: ' + p.entry.text); });
await cdp.send('Log.enable').catch(() => {});
const evalJs = async (expression) => {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const shot = async (name, full = false) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(data, 'base64'));
};
const results = {};

await s.goto('http://127.0.0.1:8899/design.html', { waitMs: 2000 });
results.design = await evalJs(`({
  swatches: document.querySelectorAll('.swatch').length,
  typeRows: document.querySelectorAll('.type-row').length,
  motionTiles: document.querySelectorAll('.motion-tile').length,
  mCls: document.getElementById('mCls').textContent,
  mLcp: document.getElementById('mLcp').textContent,
  mOverflow: document.getElementById('mOverflow').textContent,
  scrollW: document.documentElement.scrollWidth
})`);
await evalJs(`document.querySelector('.swatch').click()`);
await sleep(300);
results.swatchCopy = await evalJs(`document.querySelector('.swatch').classList.contains('is-copied')`);
await evalJs(`document.querySelector('[data-demo="d-expand"]').click()`);
await sleep(400);
results.replay = await evalJs(`document.querySelector('.d-expand').classList.contains('play')`);
await shot('pages-design', true);

await s.goto('http://127.0.0.1:8899/compare.html', { waitMs: 3500 });
results.compare = await evalJs(`({
  cmCls: document.getElementById('cmCls').textContent,
  cmLcp: document.getElementById('cmLcp').textContent,
  cmKb: document.getElementById('cmKb').textContent,
  cmOv: document.getElementById('cmOv').textContent,
  beforeImgOk: document.getElementById('beforeImg').naturalWidth > 0,
  frameLoaded: !!document.getElementById('afterFrame').contentWindow.document.querySelector('.hero'),
  scrollW: document.documentElement.scrollWidth
})`);
await shot('pages-compare-top');
await evalJs(`document.getElementById('beforeScroll').scrollTop = 1500;`);
await sleep(900);
results.syncScroll = await evalJs(`({ before: document.getElementById('beforeScroll').scrollTop, after: document.getElementById('afterFrame').contentWindow.scrollY })`);
await evalJs(`document.getElementById('vpMobile').click()`);
await sleep(1200);
results.mobileToggle = await evalJs(`({ paneMobile: document.getElementById('paneBefore').classList.contains('is-mobile'), img: document.getElementById('beforeImg').src.split('/').pop(), frameW: document.getElementById('afterFrame').getBoundingClientRect().width })`);
await shot('pages-compare-mobile');
await evalJs(`document.getElementById('vpDesktop').click()`);
await sleep(600);

fs.writeFileSync(path.join(OUT, 'pages-report.json'), JSON.stringify({ errors, results }, null, 2));
console.log(JSON.stringify({ errors, results }, null, 1));
await s.close();