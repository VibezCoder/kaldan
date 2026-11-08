import fs from 'node:fs';
const ROOT = 'C:/Users/Dell/Desktop/kaldanhotel';
const read = (m) => JSON.parse(fs.readFileSync(`${ROOT}/capture/prototype/${m}-report.json`, 'utf8'));
const d = read('desktop');
const m = read('mobile');
const sum = (r) => r.layout.loadShifts.reduce((a, s) => a + s.v, 0);
const out = {
  generatedAt: new Date().toISOString(),
  desktop: { loadCls: +sum(d).toFixed(4), lcp: d.metrics.lcp, payload: d.layout.payload, scrollW: d.layout.scrollW, innerW: d.layout.innerW, xScroll: d.layout.xScroll, overflowX: d.layout.overflowX, docH: d.layout.docH, errors: d.errors.length, brokenImages: d.layout.brokenImages.length },
  mobile: { loadCls: +sum(m).toFixed(4), lcp: m.metrics.lcp, payload: m.layout.payload, scrollW: m.layout.scrollW, innerW: m.layout.innerW, xScroll: m.layout.xScroll, overflowX: m.layout.overflowX, docH: m.layout.docH, errors: m.errors.length, brokenImages: m.layout.brokenImages.length },
};
fs.writeFileSync(`${ROOT}/prototype/assets/evidence/metrics.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out));