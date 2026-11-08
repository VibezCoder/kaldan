/** Compares CDN image bytes for a generic client vs a real browser Accept header. */
import fsp from 'node:fs/promises';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const BROWSER = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8';

const m = JSON.parse(await fsp.readFile('./site-code/manifest.json', 'utf8'));
const imgs = Object.values(m.assets)
  .filter((a) => (a.contentType || '').startsWith('image/') && a.bytes > 800_000)
  .sort((a, b) => b.bytes - a.bytes)
  .slice(0, 6);

async function get(url, accept) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept } });
  const b = Buffer.from(await r.arrayBuffer());
  return { type: (r.headers.get('content-type') || '').split(';')[0], bytes: b.length, status: r.status };
}

let genericTotal = 0;
let browserTotal = 0;
console.log('=== f_auto IMAGE FORMAT NEGOTIATION (real URLs) ===\n');
for (const a of imgs) {
  try {
    const g = await get(a.url, '*/*');
    const b = await get(a.url, BROWSER);
    if (g.bytes) genericTotal += g.bytes;
    if (b.bytes) browserTotal += b.bytes;
    const saving = g.bytes ? (100 - (b.bytes / g.bytes) * 100).toFixed(0) : '?';
    console.log(`  ${a.url.split('/').slice(-1)[0].slice(0, 58)}`);
    console.log(`    generic client : ${g.type.padEnd(12)} ${(g.bytes / 1024).toFixed(0).padStart(6)} KB`);
    console.log(`    real browser   : ${b.type.padEnd(12)} ${(b.bytes / 1024).toFixed(0).padStart(6)} KB   ${saving}% smaller`);
  } catch (e) {
    console.log(`  FAILED ${e.message}`);
  }
}
console.log(`\n  Sample totals: generic ${(genericTotal / 1048576).toFixed(2)} MB vs browser ${(browserTotal / 1048576).toFixed(2)} MB`);
