/** Downloads and self-hosts Montel (display) and Manrope (UI) as woff2. */
import fsp from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('./kaldan-site/public/fonts');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

await fsp.mkdir(OUT, { recursive: true });

// ---- Montel: the brand's existing display face, self-hosted by Simplotel
const montelUrl = 'https://cdn1.simplotel.com/fonts/Montel-Regular.woff2';
try {
  const r = await fetch(montelUrl, { headers: { 'User-Agent': UA, Accept: '*/*' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  await fsp.writeFile(path.join(OUT, 'montel-regular.woff2'), buf);
  console.log(`montel-regular.woff2  ${(buf.length / 1024).toFixed(0)} KB`);
} catch (e) {
  console.log('montel FAILED:', e.message);
}

// ---- Manrope: variable UI sans
const cssUrl = 'https://fonts.googleapis.com/css2?family=Manrope:wght@400..700&display=swap';
const css = await (await fetch(cssUrl, { headers: { 'User-Agent': UA } })).text();
await fsp.writeFile(path.join(OUT, '_manrope.css'), css, 'utf8');

const blocks = [...css.matchAll(/\/\*\s*([a-z0-9-]+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/g)];
console.log(`\nManrope subsets offered: ${blocks.map((b) => b[1]).join(', ') || 'none'}`);

const wanted = blocks.filter((b) => b[1] === 'latin' || b[1] === 'latin-ext');
for (const [, subset, body] of wanted) {
  const url = (body.match(/url\((https:[^)]+)\)/) || [])[1];
  if (!url) continue;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    await fsp.writeFile(path.join(OUT, `manrope-${subset}.woff2`), buf);
    console.log(`manrope-${subset}.woff2  ${(buf.length / 1024).toFixed(0)} KB`);
  } catch (e) {
    console.log(`manrope-${subset} FAILED:`, e.message);
  }
}

const files = await fsp.readdir(OUT);
let total = 0;
for (const f of files) if (f.endsWith('.woff2')) total += (await fsp.stat(path.join(OUT, f))).size;
console.log(`\nself-hosted font payload: ${(total / 1024).toFixed(0)} KB  (${files.filter((f) => f.endsWith('.woff2')).length} files)`);