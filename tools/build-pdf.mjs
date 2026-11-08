import fs from 'node:fs';
import { launchChrome } from './lib/chrome.mjs';
const ROOT = 'C:/Users/Dell/Desktop/kaldanhotel';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const s = await launchChrome({ width: 1440, height: 900, logDir: `${ROOT}/capture/prototype` });
await s.goto('http://127.0.0.1:8899/pitch.html', { waitMs: 2500 });
await s.cdp.send('Runtime.evaluate', { expression: 'document.fonts.ready.then(()=>true)', awaitPromise: true, returnByValue: true });
await sleep(800);
const { data } = await s.cdp.send('Page.printToPDF', {
  printBackground: true,
  preferCSSPageSize: true,
  marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
});
const buf = Buffer.from(data, 'base64');
fs.writeFileSync(`${ROOT}/prototype/pitch.pdf`, buf);
const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
console.log(JSON.stringify({ bytes: buf.length, pages }));
await s.close();