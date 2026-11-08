import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = 'C:/Users/Dell/Desktop/kaldanhotel';
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'site-code/manifest.json'), 'utf8'));

function localFor(url) {
  const u = new URL(url);
  const variants = [u.pathname, u.pathname.replace(/,/g, '_'), decodeURIComponent(u.pathname), decodeURIComponent(u.pathname).replace(/,/g, '_')];
  for (const p of variants) {
    const base = path.join(ROOT, 'site-code/assets', u.host, p);
    if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
    const dir = path.dirname(base);
    if (!fs.existsSync(dir)) continue;
    const stem = path.basename(base);
    const hit = fs.readdirSync(dir).find((f) => f === stem || f.startsWith(stem + '.'));
    if (hit) return path.join(dir, hit);
  }
  return null;
}

const rows = [];
for (const a of Object.values(manifest.assets)) {
  if (!a.url || !/simplotel\.com\/.*image\/upload/.test(a.url)) continue;
  if (a.status && a.status >= 400) continue;
  const local = localFor(a.url);
  if (!local) continue;
  const buf = fs.readFileSync(local);
  let meta;
  try { meta = await sharp(buf).metadata(); } catch { continue; }
  if (!meta.width || meta.width < 500) continue;
  const name = decodeURIComponent(path.basename(new URL(a.url).pathname));
  rows.push({
    name: name.replace(/\.(bin|jpg|png|webp)$/i, ''),
    local, url: a.url, w: meta.width, h: meta.height,
    format: meta.format, bytes: buf.length,
  });
}

// de-duplicate by name, keep the largest source
const byName = new Map();
for (const r of rows) {
  const prev = byName.get(r.name);
  if (!prev || r.w * r.h > prev.w * prev.h) byName.set(r.name, r);
}
const list = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(path.join(ROOT, 'tools/photo-inventory.json'), JSON.stringify(list, null, 1));
console.log('unique photos:', list.length);
console.log(list.map((r) => `${r.name}  ${r.w}x${r.h} ${r.format} ${(r.bytes / 1024) | 0}KB`).join('\n'));

// contact sheet
const TH = 210, COLS = 8, PAD = 6, LABEL = 22;
const rowsN = Math.ceil(list.length / COLS);
const sheet = sharp({
  create: { width: COLS * (TH + PAD) + PAD, height: rowsN * (TH + LABEL + PAD) + PAD, channels: 3, background: '#101a1b' },
});
const comps = [];
for (let i = 0; i < list.length; i++) {
  const r = list[i];
  const x = PAD + (i % COLS) * (TH + PAD);
  const y = PAD + Math.floor(i / COLS) * (TH + LABEL + PAD);
  const thumb = await sharp(r.local).resize(TH, TH, { fit: 'cover' }).jpeg({ quality: 72 }).toBuffer();
  comps.push({ input: thumb, left: x, top: y });
  const label = `${i}`.padStart(2, '0');
  const svg = Buffer.from(`<svg width="${TH}" height="${LABEL}"><rect width="100%" height="100%" fill="#101a1b"/><text x="4" y="15" font-family="monospace" font-size="13" fill="#e8dfcd">${label}</text></svg>`);
  comps.push({ input: svg, left: x, top: y + TH });
}
await sheet.composite(comps).jpeg({ quality: 82 }).toFile(path.join(ROOT, 'capture/photo-contact-sheet.jpg'));
console.log('contact sheet written');