import fs from 'node:fs';
import path from 'node:path';
import { launchChrome } from './lib/chrome.mjs';
const ROOT = 'C:/Users/Dell/Desktop/kaldanhotel';
const OUT = path.join(ROOT, 'capture/deck');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const s = await launchChrome({ width: 1440, height: 900, logDir: OUT });
const errors = [];
s.cdp.on('Runtime.exceptionThrown', (p) => errors.push('exception: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
s.cdp.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error') errors.push('console: ' + p.args.map((a) => a.value || a.description || '').join(' ')); });
s.cdp.on('Log.entryAdded', (p) => { if (p.entry.level === 'error') errors.push('log: ' + p.entry.text); });
await s.cdp.send('Log.enable').catch(() => {});
const evalJs = async (expression) => {
  const r = await s.cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const key = async (k) => { await s.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, windowsVirtualKeyCode: k === 'ArrowRight' ? 39 : k === 'ArrowLeft' ? 37 : 71 }); await s.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k }); };
const shot = async (n) => { const { data } = await s.cdp.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, n + '.png'), Buffer.from(data, 'base64')); };
const results = {};

await s.goto('http://127.0.0.1:8899/pitch.html', { waitMs: 2200 });
results.initial = await evalJs(`({
  slides: document.querySelectorAll('.slide').length,
  active: document.querySelector('.slide.is-active').dataset.title,
  count: document.getElementById('deckCount').textContent,
  notesHiddenOnScreen: getComputedStyle(document.querySelector('.slide .notes')).display === 'none',
  progress: document.getElementById('deckProgress').style.width,
  scrollW: document.documentElement.scrollWidth, innerW: innerWidth
})`);
await shot('01-title');
await key('ArrowRight'); await sleep(900);
await key('ArrowRight'); await sleep(900);
results.afterTwoNext = await evalJs(`({ active: document.querySelector('.slide.is-active').dataset.title, count: document.getElementById('deckCount').textContent, hash: location.hash })`);
await shot('03-metrics');
results.metricsFilled = await evalJs(`[...document.querySelectorAll('[data-m]')].map(e => e.textContent)`);
await key('ArrowRight'); await sleep(700);
await key('ArrowRight'); await sleep(700);
await key('ArrowRight'); await sleep(700);
await key('ArrowRight'); await sleep(1600);
results.demoSlide = await evalJs(`({ active: document.querySelector('.slide.is-active').dataset.title, iframeSrc: document.getElementById('demoFrame').src, iframeLoaded: !!document.getElementById('demoFrame').contentWindow.document.querySelector('.hero') })`);
await shot('07-demo');
// notes
await evalJs(`document.getElementById('btnNotes').click()`);
await sleep(700);
results.notes = await evalJs(`({ open: document.body.classList.contains('notes-open'), text: document.getElementById('notesBody').innerText.slice(0, 90) })`);
await shot('07-notes');
await evalJs(`document.getElementById('btnNotes').click()`);
await sleep(500);
// overview + jump
await evalJs(`document.getElementById('btnOverview').click()`);
await sleep(600);
results.overview = await evalJs(`({ open: document.body.classList.contains('overview-open'), items: document.querySelectorAll('#overviewGrid button').length })`);
await shot('overview');
await evalJs(`document.querySelector('#overviewGrid button[data-go="7"]').click()`);
await sleep(900);
results.jump = await evalJs(`({ active: document.querySelector('.slide.is-active').dataset.title, overviewClosed: !document.body.classList.contains('overview-open') })`);
await shot('08-before-after');
// wheel + repeated navigation stability
for (let i = 0; i < 6; i++) { await key('ArrowRight'); await sleep(250); }
for (let i = 0; i < 6; i++) { await key('ArrowLeft'); await sleep(250); }
results.stability = await evalJs(`({ active: document.querySelector('.slide.is-active').dataset.title, activeCount: document.querySelectorAll('.slide.is-active').length, count: document.getElementById('deckCount').textContent })`);
await evalJs(`document.querySelector('#overviewGrid') && document.getElementById('btnOverview').click()`);
await sleep(400);
await evalJs(`document.querySelector('#overviewGrid button[data-go="13"]').click()`);
await sleep(900);
await shot('14-ask');
results.ask = await evalJs(`document.querySelector('.slide.is-active').dataset.title`);
// mobile layout
await s.cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
await sleep(900);
results.mobile = await evalJs(`({ scrollW: document.documentElement.scrollWidth, innerW: innerWidth, active: document.querySelector('.slide.is-active').dataset.title, slideScrollable: getComputedStyle(document.querySelector('.slide.is-active')).overflowY })`);
await shot('m-ask');
fs.writeFileSync(path.join(OUT, 'deck-report.json'), JSON.stringify({ errors, results }, null, 2));
console.log(JSON.stringify({ errors, results }, null, 1));
await s.close();