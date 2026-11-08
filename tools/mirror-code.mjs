/**
 * Pure-Node mirror of the publicly accessible frontend.
 * No browser required: fetches HTML, extracts every referenced asset,
 * downloads CSS/JS/fonts/images, and fingerprints the tech stack.
 *
 * Usage: node mirror-code.mjs --out ./site-code
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const get = (f, d) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : d;
};

const OUT = path.resolve(get('--out', './site-code'));
const BASE = 'https://www.kaldanhotels.com';
const MAX_ASSETS = Number(get('--max', 800));

const PAGES = [
  ['home', '/'],
  ['about-us', '/about-us'],
  ['accommodations', '/accommodations'],
  ['dining', '/dining'],
  ['experiences', '/experiences'],
  ['activities', '/activities'],
  ['weddings', '/weddings'],
  ['events', '/events'],
  ['offers', '/offers'],
  ['gallery', '/gallery'],
  ['location', '/location'],
  ['contact-us', '/contact-us'],
];

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function safeName(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return createHash('sha1').update(url).digest('hex').slice(0, 20);
  }
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith('/')) p += 'index';
  if (!path.extname(p)) p += '.bin';
  const base = `${u.hostname.replace(/^www\./, '')}${p}`.replace(/[^a-zA-Z0-9._/-]/g, '_');
  const suffix = u.search ? `.${createHash('sha1').update(u.search).digest('hex').slice(0, 8)}` : '';
  return base + suffix;
}

async function fetchBuf(url, referer) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': UA,
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      ...(referer ? { Referer: referer } : {}),
    },
    signal: AbortSignal.timeout(45000),
  });
  return { status: res.status, headers: res.headers, buf: Buffer.from(await res.arrayBuffer()), finalUrl: res.url };
}

function extractRefs(html, pageUrl) {
  const refs = new Set();
  const push = (raw) => {
    if (!raw) return;
    const v = String(raw).trim().replace(/^['"]|['"]$/g, '');
    if (!v || v.startsWith('data:') || v.startsWith('javascript:') || v.startsWith('#') || v.startsWith('mailto:') || v.startsWith('tel:')) return;
    try {
      const u = new URL(v, pageUrl);
      if (u.protocol === 'http:' || u.protocol === 'https:') refs.add(u.href);
    } catch {}
  };

  const attrRe = /(?:href|src|data-src|data-original|data-bg|data-background|data-lazy|poster|content)\s*=\s*("[^"]*"|'[^']*')\s*/gi;
  let m;
  while ((m = attrRe.exec(html))) push(m[1]);

  const srcsetRe = /(?:srcset|data-srcset)\s*=\s*("[^"]*"|'[^']*')/gi;
  while ((m = srcsetRe.exec(html))) {
    for (const part of m[1].replace(/["']/g, '').split(',')) push(part.trim().split(/\s+/)[0]);
  }

  const urlRe = /url\(\s*("[^"]*"|'[^']*'|[^)]*)\)/gi;
  while ((m = urlRe.exec(html))) push(m[1]);

  const absRe = /https?:\/\/[^\s"'<>()\\]+\.(?:css|js|mjs|jpg|jpeg|png|webp|avif|gif|svg|woff2?|ttf|otf|mp4|webm|m3u8|json)(?:\?[^\s"'<>()\\]*)?/gi;
  while ((m = absRe.exec(html))) push(m[0]);

  return [...refs];
}

const HEAVY = new Set(['mp4', 'webm', 'mov', 'm3u8', 'ts', 'mkv']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const htmlDir = path.join(OUT, 'html');
  await fsp.mkdir(htmlDir, { recursive: true });

  const manifest = {
    generatedAt: new Date().toISOString(),
    site: BASE,
    note: 'Publicly accessible frontend resources only — the same HTML/CSS/JS any browser receives. No backend, CMS admin, database or booking-engine internals.',
    pages: [],
    assets: {},
    hosts: {},
    technologies: {},
  };

  const allRefs = new Set();

  for (const [name, route] of PAGES) {
    const url = BASE + route;
    try {
      const r = await fetchBuf(url);
      const html = r.buf.toString('utf8');
      await fsp.writeFile(path.join(htmlDir, `${name}.html`), r.buf);

      const headings = [...html.matchAll(/<h([1-6])[^>]*>([\s\S]{0,400}?)<\/h\1>/gi)]
        .map((mm) => ({
          level: Number(mm[1]),
          text: mm[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        }))
        .filter((h) => h.text)
        .slice(0, 60);

      const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ?? [, ''])[1].trim();
      const desc = (html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)/i) ?? [, ''])[1];

      const refs = extractRefs(html, url);
      refs.forEach((x) => allRefs.add(x));

      manifest.pages.push({
        name,
        route,
        url,
        status: r.status,
        bytes: r.buf.length,
        title,
        description: desc,
        headingCount: headings.length,
        headings,
        refCount: refs.length,
      });
      console.log(`OK  ${name.padEnd(14)} ${String(r.status)} ${(r.buf.length / 1024).toFixed(0)}KB refs=${refs.length}  "${title.slice(0, 60)}"`);
    } catch (e) {
      console.log(`FAIL ${name}: ${e.message}`);
      manifest.pages.push({ name, route, url, error: e.message });
    }
    await sleep(250);
  }

  console.log(`\nTotal unique refs: ${allRefs.size}. Downloading…`);

  const queue = [...allRefs].slice(0, MAX_ASSETS);
  let done = 0;

  async function worker() {
    while (queue.length) {
      const ref = queue.shift();
      let ext = '';
      try {
        ext = (new URL(ref).pathname.match(/\.([a-z0-9]+)$/i) ?? [, ''])[1].toLowerCase();
      } catch {
        continue;
      }
      const host = new URL(ref).hostname;
      manifest.hosts[host] = (manifest.hosts[host] ?? 0) + 1;

      const entry = { url: ref, host, ext };
      manifest.assets[ref] = entry;

      if (HEAVY.has(ext)) {
        entry.skipped = 'video — URL recorded only';
        continue;
      }
      try {
        const a = await fetchBuf(ref, BASE);
        entry.status = a.status;
        entry.bytes = a.buf.length;
        entry.contentType = (a.headers.get('content-type') ?? '').split(';')[0];
        if (a.status === 200 && a.buf.length) {
          const dest = path.join(OUT, 'assets', safeName(ref));
          await fsp.mkdir(path.dirname(dest), { recursive: true });
          await fsp.writeFile(dest, a.buf);
          entry.file = path.relative(OUT, dest).replace(/\\/g, '/');
        }
      } catch (e) {
        entry.error = e.message;
      }
      if (++done % 25 === 0) console.log(`   …${done}/${allRefs.size}`);
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));

  const home = await fsp.readFile(path.join(htmlDir, 'home.html'), 'utf8').catch(() => '');
  const allHtml = (await Promise.all(PAGES.map(([n]) => fsp.readFile(path.join(htmlDir, `${n}.html`), 'utf8').catch(() => '')))).join('\n');

  const sigs = {
    jQuery: /jquery/i,
    'Bootstrap': /bootstrap(\.min)?\.(css|js)/i,
    'Tailwind CSS': /tailwind/i,
    React: /react(-dom)?[.\-/]|data-reactroot/i,
    'Next.js': /__NEXT_DATA__|\/_next\//i,
    Vue: /vue(\.min)?\.js/i,
    GSAP: /gsap|TweenMax|ScrollTrigger/i,
    Swiper: /swiper/i,
    Slick: /slick(\.min)?\.(js|css)/i,
    'OWL Carousel': /owl\.carousel/i,
    AOS: /\baos\.(js|css)/i,
    WOWjs: /wow(\.min)?\.js/i,
    Lottie: /lottie/i,
    'Magnific Popup': /magnific-popup|mfp-/i,
    Fancybox: /fancybox/i,
    'GA4 / gtag': /googletagmanager\.com\/gtag|gtag\(/i,
    'Google Tag Manager': /googletagmanager\.com\/gtm\.js/i,
    'Meta Pixel': /connect\.facebook\.net.*fbevents/i,
    Simplotel: /simplotel/i,
    'Font Awesome': /font-?awesome/i,
    'Google Fonts': /fonts\.googleapis\.com|fonts\.gstatic\.com/i,
    Typekit: /use\.typekit\.net/i,
    reCAPTCHA: /recaptcha/i,
    'WhatsApp': /wa\.me|whatsapp/i,
    WordPress: /wp-content\/|wp-includes\//i,
    'Schema.org JSON-LD': /application\/ld\+json/i,
    'Open Graph': /property=["']og:/i,
  };
  for (const [k, re] of Object.entries(sigs)) manifest.technologies[k] = re.test(allHtml);

  manifest.fontsLinked = [...new Set([...allHtml.matchAll(/fonts\.googleapis\.com\/css2?\?([^"'>\s]+)/gi)].map((m) => m[1]))].slice(0, 20);
  manifest.videos = [...new Set([...allHtml.matchAll(/https?:\/\/[^\s"'<>()\\]+\.(?:mp4|webm|m3u8)(?:\?[^\s"'<>()\\]*)?/gi)].map((m) => m[0]))].slice(0, 30);

  const byType = {};
  for (const a of Object.values(manifest.assets)) {
    const k = a.contentType || a.ext || 'other';
    byType[k] = (byType[k] ?? 0) + 1;
  }
  manifest.summary = { assetCount: Object.keys(manifest.assets).length, byType, hosts: manifest.hosts };

  await fsp.writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  console.log('\n=== by type ===');
  console.log(byType);
  console.log('\n=== hosts ===');
  console.log(manifest.hosts);
  console.log('\n=== stack ===');
  console.log(Object.entries(manifest.technologies).filter(([, v]) => v).map(([k]) => k).join(', '));
  console.log(`\nSaved -> ${OUT}`);
}

main().catch((e) => {
  console.error('[fatal]', e.stack || e.message);
  process.exit(1);
});