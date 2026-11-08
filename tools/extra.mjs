/**
 * 1) Checks what image format Cloudinary-style f_auto URLs actually return to a
 *    browser (WebP/AVIF vs PNG) and the real byte cost.
 * 2) Mirrors the real routes discovered in the header/footer nav.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('./site-code');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const BROWSER_ACCEPT = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8';

const SAMPLES = [
  'https://assets.simplotel.com/simplotel/image/upload/w_5000,h_3336/x_1560,y_0,w_2694,h_3336,r_0,c_crop/q_80,w_1600,dpr_1,f_auto',
  'https://assets.simplotel.com/simplotel/image/upload/x_98,y_0,w_2044,h_1493,r_0,c_crop/q_80,w_1600,dpr_1,f_auto',
  'https://assets.simplotel.com/simplotel/image/upload/w_3333,h_5000/x_0,y_27,w_3333,h_4946,r_0,c_crop/q_80,w_1600,dpr_1,f_auto',
  'https://assets.simplotel.com/simplotel/image/upload/x_0,y_39,w_4032,h_2946,r_0,c_crop/q_80,w_1600,dpr_1,f_auto',
];

async function head(url, accept) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept } });
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, type: r.headers.get('content-type'), bytes: buf.length };
}

console.log('=== FORMAT NEGOTIATION: f_auto images ===');
console.log('(what the CDN returns for a browser Accept header vs a generic client)\n');
for (const u of SAMPLES) {
  const label = u.split('/').slice(-1)[0].slice(0, 60);
  try {
    const generic = await head(u, '*/*');
    const browser = await head(u, BROWSER_ACCEPT);
    const pct = generic.bytes ? (100 - (browser.bytes / generic.bytes) * 100).toFixed(0) : '?';
    console.log(`  ${label}`);
    console.log(`    Accept */*            -> ${generic.type}  ${(generic.bytes / 1024).toFixed(0)} KB`);
    console.log(`    Accept webp/avif      -> ${browser.type}  ${(browser.bytes / 1024).toFixed(0)} KB   (${pct}% smaller)`);
  } catch (e) {
    console.log(`  ${label} FAILED: ${e.message}`);
  }
}

// ---------------------------------------------------------------- extra routes
const EXTRA = [
  'events-conferences', 'kaldan-weddings', 'about-juju', 'faqs', 'blogs', 'terms-conditions',
];
console.log('\n=== MIRRORING REAL NAV ROUTES ===');
const htmlDir = path.join(OUT, 'html');
await fsp.mkdir(htmlDir, { recursive: true });
const results = [];
for (const route of EXTRA) {
  const url = `https://www.kaldanhotels.com/${route}`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' }, redirect: 'follow' });
    const buf = Buffer.from(await r.arrayBuffer());
    const html = buf.toString('utf8');
    await fsp.writeFile(path.join(htmlDir, `${route}.html`), buf);
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ?? [, ''])[1].trim();
    const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]{0,300}?)<\/h1>/gi)].map((m) =>
      m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    );
    console.log(`  OK   ${route.padEnd(22)} ${r.status} ${(buf.length / 1024).toFixed(0)}KB  "${title.slice(0, 55)}"`);
    results.push({ route, status: r.status, bytes: buf.length, title, h1 });
  } catch (e) {
    console.log(`  FAIL ${route}: ${e.message}`);
  }
}
await fsp.writeFile(path.join(OUT, 'extra-routes.json'), JSON.stringify(results, null, 2), 'utf8');
console.log('\nWrote extra-routes.json');
