/**
 * Harvests every Kaldan photo and video into organised folders, with a manifest.
 * Images: 2400px wide, full frame, WebP. Videos: original files.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('./media');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const WEBP_ACCEPT = 'image/webp,image/png,image/*,*/*;q=0.8';
const CDN = 'https://assets.simplotel.com/simplotel/image/upload';

const SOURCES = [
  { page: '/gallery/images', hint: 'gallery' },
  { page: '/', hint: 'home' },
  { page: '/accommodations', hint: 'accommodations' },
  { page: '/dining', hint: 'dining' },
  { page: '/experiences', hint: 'experiences' },
  { page: '/activities', hint: 'activities' },
  { page: '/kaldan-weddings', hint: 'weddings' },
  { page: '/events-conferences', hint: 'events' },
];

const TRANSFORM_SEG = /^[a-z]{1,4}_[\d.,a-z_]+(?:,[a-z]{1,4}_[\d.,a-z_]+)*$/i;

function publicPath(url) {
  const i = url.indexOf('/image/upload/');
  if (i < 0) return null;
  const rest = url.slice(i + '/image/upload/'.length).split('?')[0];
  const segs = rest.split('/');
  let k = 0;
  while (k < segs.length - 1 && TRANSFORM_SEG.test(segs[k])) k++;
  const p = segs.slice(k).join('/');
  if (!p || !/^[^/]+\/.+/.test(p)) return null;
  // HTML entities break the CDN lookup; keep percent-encoding intact for the request URL.
  return p.replace(/&amp;/g, '%26').replace(/&#39;/g, '%27');
}

const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);

/** Remove the trailing "- Kaldan Samudhra Palace" brand suffix that pollutes keywords. */
function stripBrand(alt) {
  let s = alt.replace(/\s*[-–—]\s*Kaldan\s+Samudhr?a.*$/i, '');
  s = s.replace(/Kaldan\s+Samudhr?a(\s+Palace)?/gi, '');
  return s.trim();
}

const BY_HINT = {
  accommodations: 'accommodations',
  dining: 'dining',
  experiences: 'experiences',
  activities: 'experiences',
  weddings: 'event-spaces',
  events: 'event-spaces',
};

function categorise(rawAlt, hint, sources = new Set()) {
  const alt = stripBrand(rawAlt);
  const a = ' ' + alt.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  const has = (...ws) => ws.some((w) => new RegExp(`\\b${w}s?\\b`).test(a));

  // Strong signals win regardless of where the photo appears.
  if (a.includes('panch mahal') || has('gazebo', 'courtyard', 'domed')) return 'panch-mahal';
  if (has('wedding', 'banquet', 'ballroom', 'mandap', 'baraat', 'sundarabagh', 'boardroom', 'corporate', 'conference', 'reception hall')) return 'event-spaces';

  // The page a photo lives on is a reliable prior.
  const srcCats = [...sources].filter((s) => s !== 'gallery' && s !== 'home').map((s) => BY_HINT[s]).filter(Boolean);
  if (srcCats.length && new Set(srcCats).size === 1) return srcCats[0];

  if (has('restaurant', 'bar', 'buffet', 'thali', 'cuisine', 'breakfast', 'chef', 'grill', 'dining', 'food', 'dish', 'cocktail', 'table', 'platter', 'dessert')) return 'dining';
  if (has('yoga', 'folk', 'dance', 'puppet', 'welcome', 'spa', 'performance', 'kathputli', 'badminton', 'cricket', 'kite', 'volleyball', 'game', 'activity')) return 'experiences';
  if (has('bedroom', 'suite', 'villa', 'bathroom', 'balcony', 'hallway', 'lobby', 'living', 'bed', 'interior')) return 'accommodations';
  if (has('pool', 'aerial', 'facade', 'entrance', 'reception', 'exterior', 'drone', 'palace', 'architecture', 'porch', 'pavilion', 'staircase', 'lawn', 'gate')) return 'facade-entrance';

  return BY_HINT[hint] ?? 'facade-entrance';
}

async function fetchText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' }, redirect: 'follow' });
  return { status: r.status, html: await r.text() };
}

async function main() {
  await fsp.rm(path.join(OUT, 'images'), { recursive: true, force: true });
  await fsp.mkdir(OUT, { recursive: true });

  const found = new Map();

  for (const s of SOURCES) {
    try {
      const { status, html } = await fetchText('https://www.kaldanhotels.com' + s.page);
      let n = 0;
      for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
        const tag = m[0];
        const src = (tag.match(/\bsrc=["']([^"']+)["']/i) || [])[1];
        if (!src || !src.includes('image/upload')) continue;
        const alt = ((tag.match(/\balt=["']([^"']*)["']/i) || [])[1] || '').replace(/&amp;/g, '&').trim();
        const pp = publicPath(src);
        if (!pp) continue;
        const prev = found.get(pp);
        if (!prev) {
          found.set(pp, { alt, sources: new Set([s.hint]), hint: s.hint, firstSrc: src });
          n++;
        } else {
          prev.sources.add(s.hint);
          if (alt.length > prev.alt.length) prev.alt = alt;
        }
      }
      console.log(`${status}  ${s.page.padEnd(22)} new: ${n}`);
    } catch (e) {
      console.log(`FAIL ${s.page}: ${e.message}`);
    }
  }

  const entries = [...found.entries()].filter(([pp, v]) => {
    const low = (v.alt + ' ' + pp).toLowerCase();
    if (/logo|favicon|sprite|placeholder|service from the heart|mask_group|mask-group/.test(low)) return false;
    return true;
  });
  console.log(`\nUnique photos: ${entries.length}`);

  const manifest = { generatedAt: new Date().toISOString(), source: 'https://www.kaldanhotels.com', images: [], videos: [] };
  const used = new Set();
  let done = 0, bytes = 0, retried = 0;

  async function worker(chunk) {
    for (const [pp, v] of chunk) {
      const cat = categorise(v.alt, v.hint, v.sources);
      const base = slugify(stripBrand(v.alt) || pp.split('/').pop());
      let slug = base || 'image';
      let n = 2;
      while (used.has(slug)) slug = `${base}-${n++}`;
      used.add(slug);

      const dir = path.join(OUT, 'images', cat);
      await fsp.mkdir(dir, { recursive: true });
      const file = path.join(dir, `${slug}.webp`);

      const clean = `${CDN}/q_85,f_auto,fl_progressive,c_limit,w_2400/${pp}`;
      const rec = {
        file: path.relative(OUT, file).replace(/\\/g, '/'),
        category: cat, alt: v.alt, altClean: stripBrand(v.alt),
        publicPath: decodeURIComponent(pp), sourcePages: [...v.sources], servedUrl: clean,
        originalUrl: v.firstSrc.startsWith('http') ? v.firstSrc : `https://assets.simplotel.com${v.firstSrc}`,
      };

      let ok = false;
      for (const url of [clean, rec.originalUrl]) {
        try {
          const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: WEBP_ACCEPT } });
          if (!r.ok) continue;
          const buf = Buffer.from(await r.arrayBuffer());
          if (buf.length < 2000) continue;
          await fsp.writeFile(file, buf);
          rec.bytes = buf.length;
          rec.contentType = r.headers.get('content-type');
          rec.usedFallback = url !== clean;
          if (rec.usedFallback) retried++;
          bytes += buf.length;
          ok = true;
          break;
        } catch {}
      }
      if (!ok) rec.error = 'all sources failed';
      manifest.images.push(rec);
      if (++done % 40 === 0) console.log(`   …${done}/${entries.length}`);
    }
  }

  const CH = Math.ceil(entries.length / 6);
  await Promise.all(Array.from({ length: 6 }, (_, i) => worker(entries.slice(i * CH, (i + 1) * CH))));

  console.log('\n=== videos ===');
  const vids = new Set();
  for (const s of [...SOURCES, { page: '/gallery/videos' }]) {
    try {
      const { html } = await fetchText('https://www.kaldanhotels.com' + s.page);
      for (const m of html.matchAll(/https?:\/\/cdn1\.simplotel\.com\/[^\s"'<>()\\]+\.mp4/g)) vids.add(m[0]);
    } catch {}
  }
  const vDir = path.join(OUT, 'videos');
  await fsp.mkdir(vDir, { recursive: true });
  for (const v of [...vids]) {
    const name = v.split('/').pop();
    const rec = { url: v, file: `videos/${name}` };
    try {
      const r = await fetch(v, { headers: { 'User-Agent': UA, Accept: '*/*' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      await fsp.writeFile(path.join(vDir, name), buf);
      rec.bytes = buf.length;
      console.log(`  ${(buf.length / 1048576).toFixed(1).padStart(6)} MB  ${name}`);
    } catch (e) {
      rec.error = e.message;
    }
    manifest.videos.push(rec);
  }

  const byCat = {};
  for (const im of manifest.images) if (!im.error) byCat[im.category] = (byCat[im.category] ?? 0) + 1;
  manifest.summary = {
    images: manifest.images.filter((i) => !i.error).length,
    failed: manifest.images.filter((i) => i.error).length,
    retried,
    imagesByCategory: byCat,
    imageBytes: bytes,
    videos: manifest.videos.filter((v) => !v.error).length,
    videoBytes: manifest.videos.reduce((s, v) => s + (v.bytes ?? 0), 0),
  };
  await fsp.writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  console.log('\n=== by category ===');
  console.log(byCat);
  console.log(`\nimages ${manifest.summary.images} (${(bytes / 1048576).toFixed(1)} MB), failed ${manifest.summary.failed}, fallbacks ${retried}`);
  console.log(`videos ${manifest.summary.videos} (${(manifest.summary.videoBytes / 1048576).toFixed(1)} MB)`);
}

main().catch((e) => { console.error('[fatal]', e.stack || e.message); process.exit(1); });