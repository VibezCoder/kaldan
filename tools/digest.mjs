/** Prints a concise digest of the mirror manifest. */
import fsp from 'node:fs/promises';

const m = JSON.parse(await fsp.readFile(process.argv[2] ?? './site-code/manifest.json', 'utf8'));

console.log('SITE:', m.site, '| generated', m.generatedAt);
console.log('\n=== TECHNOLOGY SIGNATURES ===');
console.log(Object.entries(m.technologies).filter(([, v]) => v).map(([k]) => k).join(', ') || '(none detected)');

console.log('\n=== HOSTS ===');
for (const [h, n] of Object.entries(m.hosts).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${h}`);

console.log('\n=== ASSET TYPES ===');
for (const [t, n] of Object.entries(m.summary.byType).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${t}`);

if (m.fontsLinked?.length) {
  console.log('\n=== GOOGLE FONTS ===');
  m.fontsLinked.forEach((f) => console.log('  ' + decodeURIComponent(f)));
}
if (m.videos?.length) {
  console.log('\n=== VIDEOS ===');
  m.videos.forEach((v) => console.log('  ' + v));
}

console.log('\n=== PAGES ===');
for (const p of m.pages) {
  console.log(`\n--- ${p.name} [${p.status ?? 'ERR'}] ${p.bytes ? (p.bytes / 1024).toFixed(0) + 'KB' : p.error}`);
  console.log(`    title: ${p.title}`);
  console.log(`    desc : ${(p.description ?? '').slice(0, 150)}`);
  if (p.headings?.length) {
    for (const h of p.headings.slice(0, 22)) console.log(`      h${h.level}: ${h.text.slice(0, 110)}`);
    if (p.headings.length > 22) console.log(`      … +${p.headings.length - 22} more`);
  }
}

// Largest downloaded assets
const assets = Object.values(m.assets).filter((a) => a.bytes);
console.log('\n=== LARGEST DOWNLOADED ASSETS ===');
assets
  .sort((a, b) => b.bytes - a.bytes)
  .slice(0, 25)
  .forEach((a) => console.log(`  ${(a.bytes / 1024).toFixed(0).padStart(6)}KB  ${a.ext.padEnd(5)} ${a.url.slice(0, 130)}`));
