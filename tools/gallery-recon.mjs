/** Recon: discovers the gallery structure, media URLs and categories. */
import fsp from 'node:fs/promises';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PAGES = [
  'https://www.kaldanhotels.com/gallery',
  'https://www.kaldanhotels.com/gallery/images',
  'https://www.kaldanhotels.com/gallery/videos',
];

function imgUrls(html) {
  const out = new Set();
  for (const m of html.matchAll(/https?:\/\/assets\.simplotel\.com\/[^\s"'<>()\\]+/g)) {
    out.add(m[0].replace(/&amp;/g, '&'));
  }
  // relative/root-relative variants
  for (const m of html.matchAll(/\/simplotel\/image\/upload\/[^\s"'<>()\\]+/g)) {
    out.add('https://assets.simplotel.com' + m[0].replace(/&amp;/g, '&'));
  }
  return [...out];
}

function vids(html) {
  const out = new Set();
  for (const m of html.matchAll(/https?:\/\/[^\s"'<>()\\]+\.(?:mp4|webm|m3u8)(?:\?[^\s"'<>()\\]*)?/g)) out.add(m[0]);
  for (const m of html.matchAll(/https?:\/\/[^\s"'<>()\\]*(?:youtube\.com|youtu\.be|vimeo\.com)[^\s"'<>()\\]*/g)) out.add(m[0]);
  return [...out];
}

for (const url of PAGES) {
  console.log('\n' + '='.repeat(78));
  console.log(url);
  console.log('='.repeat(78));
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' }, redirect: 'follow' });
    const html = await r.text();
    console.log(`status ${r.status}  ${(html.length / 1024).toFixed(0)} KB  final=${r.url}`);

    const imgs = imgUrls(html);
    const videos = vids(html);
    console.log(`unique image URLs: ${imgs.length}`);
    console.log(`video URLs: ${videos.length}`);
    videos.slice(0, 10).forEach((v) => console.log('   VID ' + v));

    // categories / filters
    const cats = [...html.matchAll(/data-(?:category|filter|tab)[^=]*=["']([^"']{2,40})["']/gi)].map((m) => m[1]);
    const uniqCats = [...new Set(cats)];
    if (uniqCats.length) console.log('filter attrs:', uniqCats.slice(0, 20));

    // look for gallery API endpoints
    const apis = [...new Set([...html.matchAll(/["'](\/[a-z0-9/_-]*(?:gallery|album|media|photos?|videos?)[a-z0-9/_?=-]*)["']/gi)].map((m) => m[1]))];
    if (apis.length) console.log('gallery-ish paths:', apis.slice(0, 15));

    // headings
    const hs = [...html.matchAll(/<h([1-4])[^>]*>([\s\S]{0,160}?)<\/h\1>/gi)]
      .map((m) => `h${m[1]}: ${m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}`)
      .filter((s) => s.length > 4);
    console.log('headings:', hs.slice(0, 12).join(' | '));

    // sample image urls
    imgs.slice(0, 6).forEach((u) => console.log('   IMG ' + u.slice(0, 150)));

    await fsp.writeFile(`./capture/gallery-${url.split('/').pop() || 'root'}.html`, html, 'utf8');
  } catch (e) {
    console.log('FAILED', e.message);
  }
}