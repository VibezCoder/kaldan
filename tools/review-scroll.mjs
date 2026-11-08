import fs from 'node:fs';
import path from 'node:path';
import { launchChrome } from './lib/chrome.mjs';
const ROOT = 'C:/Users/Dell/Desktop/kaldanhotel';
const OUT = path.join(ROOT, 'capture/review');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mobile = process.argv[2] === 'mobile';
const width = mobile ? 390 : 1440;
const height = mobile ? 844 : 900;
const s = await launchChrome({ width, height, mobile, logDir: OUT });
const evalJs = async (expression) => {
  const r = await s.cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
await s.goto('http://127.0.0.1:8899/', { waitMs: 3000 });
const shot = async (name) => {
  const { data } = await s.cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, `${mobile ? 'm' : 'd'}-${name}.png`), Buffer.from(data, 'base64'));
};
await sleep(1200);
await shot('01-hero');
const ids = ['story', 'estate', 'stay', 'experiences', 'dine', 'celebrate', 'praise', 'enquire'];
for (const id of ids) {
  await evalJs(`window.__lenis ? window.__lenis.scrollTo(document.getElementById('${id}'), { immediate: true, offset: -66 }) : document.getElementById('${id}').scrollIntoView()`);
  await sleep(1400);
  await shot(id);
}
// mid-scroll state of the expand motion
await evalJs(`window.__lenis.scrollTo(document.getElementById('expandFrame'), { immediate: true, offset: -window.innerHeight * 0.5 })`);
await sleep(900);
await shot('estate-mid');
const state = await evalJs(`({
  revealed: document.querySelectorAll('.is-in').length,
  scrollY: Math.round(window.scrollY),
  expandWidth: Math.round(document.getElementById('expandFrame').getBoundingClientRect().width),
  innerW: window.innerWidth
})`);
console.log(JSON.stringify(state));
await s.close();