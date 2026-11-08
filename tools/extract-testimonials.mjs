/** Extracts full testimonial quote/name pairs into JSON. */
import fsp from 'node:fs/promises';

const html = await fsp.readFile('./capture/desktop/home-desktop-rendered.html', 'utf8');
const i = html.indexOf('PRAISES FOR OUR');
const slice = html.slice(i, i + 60000);

const text = slice
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, '\n')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&#39;/g, "'")
  .replace(/&rsquo;/g, '\u2019')
  .replace(/&lsquo;/g, '\u2018')
  .replace(/&ldquo;/g, '\u201c')
  .replace(/&rdquo;/g, '\u201d')
  .replace(/&quot;/g, '"')
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean);

const quotes = [];
for (let k = 0; k < text.length; k++) {
  const line = text[k];
  if (!line.startsWith('"')) continue;
  const next = text[k + 1] || '';
  if (next.startsWith('"') || next.length > 60) continue; // name should be short
  quotes.push({ quote: line.replace(/^"|"$/g, '').trim(), name: next.replace(/\s+/g, ' ').trim() });
}

console.log(`found ${quotes.length} testimonials\n`);
quotes.forEach((q, n) => {
  console.log(`${n + 1}. "${q.quote}"`);
  console.log(`   — ${q.name}\n`);
});

await fsp.mkdir('./kaldan-site/src/data', { recursive: true });
await fsp.writeFile('./kaldan-site/src/data/testimonials.json', JSON.stringify(quotes, null, 2), 'utf8');
console.log('wrote kaldan-site/src/data/testimonials.json');