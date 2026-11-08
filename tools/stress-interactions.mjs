import { launchChrome } from './lib/chrome.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const s = await launchChrome({ width: 1440, height: 900, logDir: 'C:/Users/Dell/Desktop/kaldanhotel/capture/prototype' });
const errs = [];
s.cdp.on('Runtime.exceptionThrown', (p) => errs.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text));
const ev = async (expression) => {
  const r = await s.cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
await s.goto(process.env.BASE || 'http://127.0.0.1:8899/', { waitMs: 2500 });
await ev(`(async () => {
  const rooms = [...document.querySelectorAll('#roomRail button')];
  for (let k = 0; k < 3; k++) for (const b of rooms) b.click();
  const chips = [...document.querySelectorAll('#expFilters .chip')];
  for (let k = 0; k < 3; k++) for (const c of chips) c.click();
  for (let k = 0; k < 6; k++) document.getElementById('quoteNext').click();
  for (let k = 0; k < 3; k++) { document.getElementById('reserveBtn').click(); document.getElementById('bookingClose').click(); }
  for (let k = 0; k < 3; k++) { document.querySelector('[data-exp="yoga"]').click(); document.getElementById('expAddBtn').click(); document.getElementById('expModalClose').click(); }
  return true;
})()`);
await sleep(1500);
const out = await ev(`({
  activeRoomImgs: document.querySelectorAll('.room-figure img.is-active').length,
  selectedTabs: document.querySelectorAll('#roomRail button[aria-selected="true"]').length,
  visibleCards: [...document.querySelectorAll('.exp-card')].filter(c => !c.classList.contains('is-hidden')).length,
  pressedChips: document.querySelectorAll('#expFilters .chip[aria-pressed="true"]').length,
  activeQuotes: document.querySelectorAll('.quote-slide.is-active').length,
  openLayers: document.querySelectorAll('.drawer.is-open, .modal.is-open').length,
  itinerary: JSON.parse(localStorage.getItem('kaldan.itinerary') || '[]'),
  events: window.dataLayer.length,
  scrollW: document.documentElement.scrollWidth,
  innerW: innerWidth
})`);
console.log(JSON.stringify({ errs, out }, null, 1));
await s.close();