/** Inspects gallery entry markup: captions, alt text, category grouping. */
import fsp from 'node:fs/promises';

const html = await fsp.readFile('./capture/gallery-images.html', 'utf8');

// How are gallery items marked up?
const markers = ['gallery-item', 'data-category', 'data-filter', 'data-src', 'carousel', 'lightbox', 'grid-item', 'masonry'];
for (const m of markers) {
  const c = (html.match(new RegExp(m, 'gi')) || []).length;
  console.log(`${m.padEnd(16)} occurrences: ${c}`);
}

console.log('\n=== images with alt text ===');
const imgTags = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
console.log('total <img> tags:', imgTags.length);
let withAlt = 0;
for (const t of imgTags) {
  const alt = (t.match(/alt=["']([^"']*)["']/i) || [])[1];
  if (alt && alt.trim()) withAlt++;
}
console.log('with non-empty alt:', withAlt);

console.log('\n=== sample of unique alt texts ===');
const alts = [...new Set(imgTags.map((t) => (t.match(/alt=["']([^"']*)["']/i) || [])[1]).filter(Boolean))];
alts.slice(0, 40).forEach((a) => console.log('  -', a.slice(0, 100)));
console.log(`  ... total unique alts: ${alts.length}`);

// asset public ids (the meaningful filename after the folder)
console.log('\n=== distinct asset public ids (kaldan-samudhra-palace/...) ===');
const ids = new Set();
for (const m of html.matchAll(/kaldan-samudhra-palace\/([A-Za-z0-9_%.\-]+)/g)) ids.add(decodeURIComponent(m[1]));
[...ids].sort().slice(0, 120).forEach((id) => console.log('  ' + id));
console.log(`  total distinct ids: ${ids.size}`);

// Look for a JS data blob listing photos
console.log('\n=== possible JSON blobs ===');
for (const m of html.matchAll(/<script[^>]*type=["']application\/json["'][^>]*>([\s\S]{0,300})/gi)) {
  console.log('  json script:', m[1].replace(/\s+/g, ' ').slice(0, 200));
}