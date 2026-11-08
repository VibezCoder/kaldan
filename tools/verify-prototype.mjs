import fs from 'node:fs';
import path from 'node:path';
import { launchChrome } from './lib/chrome.mjs';

const ROOT = 'C:/Users/Dell/Desktop/kaldanhotel';
const OUT = path.join(ROOT, 'capture/prototype');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URL_BASE = process.env.BASE || 'http://127.0.0.1:8899/';

const mode = process.argv[2] || 'desktop';
const mobile = mode === 'mobile';
const width = mobile ? 390 : 1440;
const height = mobile ? 844 : 900;

const session = await launchChrome({ width, height, mobile, logDir: OUT });
const { cdp } = session;
const errors = [];
const failed = [];
cdp.on('Runtime.exceptionThrown', (p) => errors.push('exception: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
cdp.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error') errors.push('console: ' + p.args.map((a) => a.value || a.description || '').join(' ')); });
cdp.on('Network.loadingFailed', (p) => failed.push(p.errorText + ' ' + p.type));
cdp.on('Log.entryAdded', (p) => { if (p.entry.level === 'error') errors.push('log: ' + p.entry.text); });
await cdp.send('Log.enable').catch(() => {});

await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__m = { cls: 0, lcp: 0, shifts: [] };
    window.addEventListener('load', () => { const rs = performance.getEntriesByType('resource'); window.__payloadAtLoad = { requests: rs.length, kb: Math.round(rs.reduce((a, r) => a + (r.transferSize || 0), 0) / 1024) }; });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (!e.hadRecentInput) { window.__m.cls += e.value; window.__m.shifts.push({ v: +e.value.toFixed(4), t: Math.round(e.startTime) }); } } }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => { const es = l.getEntries(); const e = es[es.length - 1]; window.__m.lcp = e.startTime; window.__m.lcpEl = e.element ? (e.element.id || e.element.tagName) : ''; window.__m.lcpUrl = e.url || ''; }).observe({ type: 'largest-contentful-paint', buffered: true });
  `,
});

const evalJs = async (expression) => {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};

await session.goto(URL_BASE, { waitMs: 3500 });
await sleep(1500);

const shot = async (name, full = false) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full });
  fs.writeFileSync(path.join(OUT, `${mode}-${name}.png`), Buffer.from(data, 'base64'));
};

await shot('01-hero');

// scroll through chapters, screenshot each
const chapters = ['story', 'estate', 'stay', 'experiences', 'dine', 'celebrate', 'praise', 'enquire'];
for (const id of chapters) {
  await evalJs(`document.getElementById('${id}').scrollIntoView({behavior:'instant',block:'start'}); window.scrollBy(0,-70);`);
  await sleep(1200);
  await shot('ch-' + id);
}

// full page
await evalJs(`window.scrollTo(0,0)`);
await sleep(800);
await shot('02-full', true);

// ---- interactions (desktop only; mobile gets layout + a subset) ----
const results = {};
if (!mobile) {
  await evalJs(`document.getElementById('stay').scrollIntoView({behavior:'instant'}); window.scrollBy(0,-70);`);
  await sleep(600);
  await evalJs(`document.querySelector('[data-room="luxury-villa"]').click()`);
  await sleep(1000);
  results.roomSwitch = await evalJs(`({ name: document.getElementById('roomName').textContent, tag: document.getElementById('roomTag').textContent, active: document.querySelectorAll('.room-figure img.is-active').length, amenities: document.querySelectorAll('#roomAmenities li').length })`);
  await shot('03-room-villa');
  await evalJs(`document.getElementById('amenityToggle').click()`);
  results.amenitiesExpanded = await evalJs(`document.querySelectorAll('#roomAmenities li').length`);

  await evalJs(`document.getElementById('experiences').scrollIntoView({behavior:'instant'}); window.scrollBy(0,-70);`);
  await sleep(600);
  await evalJs(`document.querySelector('[data-filter="Culture"]').click()`);
  await sleep(400);
  results.filterCulture = await evalJs(`[...document.querySelectorAll('.exp-card')].filter(c=>!c.classList.contains('is-hidden')).length`);
  await evalJs(`document.querySelector('[data-filter="all"]').click()`);
  await evalJs(`document.querySelector('[data-exp="kayak"]').click()`);
  await sleep(700);
  results.expModal = await evalJs(`({ open: document.getElementById('expModal').classList.contains('is-open'), title: document.getElementById('expModalTitle').textContent })`);
  await shot('04-exp-modal');
  await evalJs(`document.getElementById('expAddBtn').click()`);
  await sleep(300);
  results.itinerary = await evalJs(`({ chips: document.querySelectorAll('#itinChips .itin').length, mark: document.querySelector('[data-exp="kayak"]').classList.contains('in-itinerary'), btn: document.getElementById('expAddBtn').textContent })`);
  await evalJs(`document.getElementById('expModalClose').click()`);
  await sleep(400);

  await evalJs(`document.getElementById('dine').scrollIntoView({behavior:'instant'}); window.scrollBy(0,-70);`);
  await sleep(500);
  await evalJs(`document.querySelector('[data-dine="panch"] .dine-head').click()`);
  await sleep(900);
  results.dineOpen = await evalJs(`document.querySelector('[data-dine="panch"]').classList.contains('is-open')`);
  await shot('05-dine');

  await evalJs(`document.getElementById('quoteNext').click()`);
  const q1 = await evalJs(`document.getElementById('quoteIndex').textContent`);
  await evalJs(`document.getElementById('quoteNext').click()`);
  const q2 = await evalJs(`document.getElementById('quoteIndex').textContent`);
  results.quote = { afterFirst: q1, afterSecond: q2, activeSlide: await evalJs(`document.querySelector('.quote-slide.is-active').dataset.quote`) };

  // booking drawer
  await evalJs(`document.getElementById('reserveBtn').click()`);
  await sleep(800);
  results.booking = await evalJs(`({ open: document.getElementById('bookingDrawer').classList.contains('is-open'), summary: document.getElementById('bookingSummary').innerText.replace(/\\s+/g,' ').slice(0,160) })`);
  await evalJs(`document.getElementById('bkRoomsPlus').click(); document.getElementById('bkGuestsPlus').click();`);
  await shot('06-booking');
  results.bookingAfterSteppers = await evalJs(`document.getElementById('bookingSummary').innerText.replace(/\\s+/g,' ').slice(0,160)`);
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await sleep(600);
  results.bookingEsc = await evalJs(`({ drawer: document.getElementById('bookingDrawer').classList.contains('is-open'), scrim: document.getElementById('drawerScrim').classList.contains('is-open'), bodyOverflow: document.body.style.overflow })`);

  // enquiry: invalid then valid
  await evalJs(`document.getElementById('enquire').scrollIntoView({behavior:'instant'}); window.scrollBy(0,-70);`);
  await sleep(600);
  await evalJs(`document.getElementById('enqSubmit').click()`);
  await sleep(300);
  results.enquiryInvalid = await evalJs(`({ nameErr: document.getElementById('fieldName').classList.contains('has-err'), emailErr: document.getElementById('fieldEmail').classList.contains('has-err'), successHidden: document.getElementById('formSuccess').hidden })`);
  await shot('07-enquiry-errors');
  await evalJs(`
    document.getElementById('enqName').value = 'Ananya Rao';
    document.getElementById('enqEmail').value = 'ananya@example.com';
    document.querySelector('[data-intent="wedding"]').click();
    document.getElementById('guestPlus').click();
    document.getElementById('enqSubmit').click();
  `);
  await sleep(500);
  results.enquiryValid = await evalJs(`({ successShown: !document.getElementById('formSuccess').hidden, ref: document.getElementById('successRef').textContent, summary: document.getElementById('successSummary').innerText.replace(/\\s+/g,' ').slice(0,200), stored: JSON.parse(localStorage.getItem('kaldan.enquiries')||'[]').length })`);
  await shot('08-enquiry-success');

  // inspector
  await evalJs(`document.getElementById('inspectorToggle').click()`);
  await sleep(600);
  results.inspector = await evalJs(`({ open: document.getElementById('inspector').classList.contains('is-open'), rows: document.querySelectorAll('#inspectorLog .ev').length, count: document.getElementById('inspectorHeadCount').textContent })`);
  await shot('09-inspector');
  results.eventNames = await evalJs(`[...new Set(window.dataLayer.map(e=>e.event))]`);

  // film modal
  await evalJs(`document.getElementById('inspectorClose').click()`);
  await evalJs(`window.scrollTo(0,0)`);
  await sleep(700);
  await evalJs(`document.getElementById('filmBtn').click()`);
  await sleep(1500);
  results.film = await evalJs(`({ open: document.getElementById('filmModal').classList.contains('is-open'), playing: !document.getElementById('filmVideo').paused, muted: document.getElementById('filmVideo').muted })`);
  await shot('10-film');
  await evalJs(`document.getElementById('filmSound').click()`);
  results.filmMuted = await evalJs(`document.getElementById('filmVideo').muted`);
  await evalJs(`document.getElementById('filmClose').click()`);
  await sleep(400);

  // menu
  await evalJs(`document.getElementById('menuBtn').click()`);
  await sleep(900);
  results.menu = await evalJs(`document.body.classList.contains('menu-open')`);
  await shot('11-menu');
  await evalJs(`document.getElementById('menuBtn').click()`);
  await sleep(600);
} else {
  await evalJs(`document.getElementById('reserveBtn')?.click()`);
  await sleep(600);
  results.mobileBooking = await evalJs(`document.getElementById('bookingDrawer').classList.contains('is-open')`);
  await evalJs(`document.getElementById('bookingClose').click()`);
  await sleep(400);
  await evalJs(`document.getElementById('menuBtn').click()`);
  await sleep(800);
  await shot('m-menu');
  await evalJs(`document.getElementById('menuBtn').click()`);
  await sleep(500);
  await evalJs(`document.getElementById('enquire').scrollIntoView({behavior:'instant'})`);
  await sleep(600);
  await shot('m-enquire');
}

const metrics = await evalJs(`window.__m`);
const layout = await evalJs(`(() => {
  const y = window.scrollY;
  window.scrollTo({ left: 99999, top: y, behavior: 'instant' });
  const xScroll = document.documentElement.scrollLeft || document.body.scrollLeft;
  window.scrollTo({ left: 0, top: y, behavior: 'instant' });
  return {
  scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
  xScroll, overflowX: getComputedStyle(document.documentElement).overflowX,
  docH: document.documentElement.scrollHeight,
  overflowers: [...document.querySelectorAll('*')].filter(el=>{const r=el.getBoundingClientRect(); return r.width>0 && (r.right>window.innerWidth+2 || r.left<-2) && getComputedStyle(el).position!=='fixed';}).slice(0,12).map(el=>el.tagName+'.'+String(el.className).slice(0,50)),
  brokenImages: [...document.images].filter(i=>i.complete && i.naturalWidth===0).map(i=>i.src.split('/').pop()),
  heroH: document.getElementById('arrival').getBoundingClientRect().height,
  h1Top: document.querySelector('.hero h1').getBoundingClientRect().top + window.scrollY,
  fonts: [...document.fonts].map(f=>f.family+' '+f.weight+' '+f.status).slice(0,14),
  heroResources: performance.getEntriesByType('resource').filter(r=>/hero-poster|hero-loop/.test(r.name)).map(r=>({n:r.name.split('/').pop(),start:Math.round(r.startTime),dur:Math.round(r.duration),kb:Math.round((r.transferSize||0)/1024)})),
  loadShifts: window.__m.shifts.filter(s=>s.t<4500),
  payload: window.__payloadAtLoad || (()=>{const rs=performance.getEntriesByType('resource');return {requests:rs.length, kb:Math.round(rs.reduce((a,r)=>a+(r.transferSize||0),0)/1024)};})()
  };
})()`);

fs.writeFileSync(path.join(OUT, `${mode}-report.json`), JSON.stringify({ mode, errors, failed, results, metrics, layout }, null, 2));
console.log(JSON.stringify({ mode, errors, failed: failed.slice(0, 10), metrics: { cls: +metrics.cls.toFixed(4), lcp: Math.round(metrics.lcp) }, layout: { scrollW: layout.scrollW, innerW: layout.innerW, docH: layout.docH, overflowers: layout.overflowers, brokenImages: layout.brokenImages, h1Top: layout.h1Top }, results }, null, 1));
await session.close();