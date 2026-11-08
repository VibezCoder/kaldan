/**
 * Mirrors the publicly accessible frontend of a website:
 *   - rendered HTML for each page (via Chrome, post-JS)
 *   - linked CSS, JS, fonts and images referenced by those pages
 *   - a manifest describing the technology stack and asset inventory
 *
 * Only fetches publicly served resources. No auth, no bypassing restrictions.
 *
 * Usage: node mirror-site.mjs --out <dir> [--pages file.json]
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const get = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : def;
};

const OUT = path.resolve(get('--out', './site-code'));
const TS = new Date().toISOString().replace(/[:.]/g, '-');

const PAGES = [
  { name: 'home', url: 'https://www.kaldanhotels.com/' },
  { name: 'about-us', url: 'https://www.kaldanhotels.com/about-us' },
  { name: 'accommodations', url: 'https://www.kaldanhotels.com/accommodations' },
  { name: 'dining', url: 'https://www.kaldanhotels.com/dining' },
  { name: 'experiences', url: 'https://www.kaldanhotels.com/experiences' },
  { name: 'activities', url: 'https://www.kaldanhotels.com/activities' },
  { name: 'weddings', url: 'https://www.kaldanhotels.com/weddings' },
  { name: 'events', url: 'https://www.kaldanhotels.com/events' },
  { name: 'offers', url: 'https://www.kaldanhotels.com/offers' },
  { name: 'gallery', url: 'https://www.kaldanhotels.com/gallery' },
  { name: 'location', url: 'https://www.kaldanhotels.com/location' },
  { name: 'contact-us', url: 'https://www.kaldanhotels.com/contact-us' },
];

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function safeName(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return createHash('sha1').update(url).digest('hex').slice(0, 16);
  }
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith('/')) p += 'index';
  if (!path.extname(p)) p += '.bin';
  const host = u.hostname.replace(/^www\./, '');
  const base = `${host}${p}`.replace(/[^a-zA-Z0-9._/-]/g, '_');
  const h = createHash('sha1').update(u.search).digest('hex').slice(0, 8);
  return u.search ? `${base}.${h}` : base;
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
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, headers: res.headers, buf, finalUrl: res.url };
}

/** Extract asset references from raw HTML text. */
function extractRefs(html, pageUrl) {
  const refs = new Set();
  const push = (raw) => {
    if (!raw) return;
    let v = raw.trim().replace(/^['"]|['"]$/g, '');
    if (!v || v.startsWith('data:') || v.startsWith('javascript:') || v.startsWith('#')) return;
    try {
      refs.add(new URL(v, pageUrl).href);
    } catch {}
  };

  const attrRe = /(?:href|src|data-src|data-srcset|data-bg|data-background|data-lazy|poster|content)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
  let m;
  while ((m = attrRe.exec(html))) push(m[1]);

  // srcset handling
  const srcsetRe = /srcset\s*=\s*("[^"]*"|'[^']*')/gi;
  while ((m = srcsetRe.exec(html))) {
    for (const part of m[1].replace(/["']/g, '').split(',')) push(part.trim().split(/\s+/)[0]);
  }

  // url(...) inside inline styles / CSS
  const urlRe = /url\(\s*("[^"]*"|'[^']*'|[^)]+)\)/gi;
  while ((m = urlRe.exec(html))) push(m[1]);

  // Bare absolute URLs in inline JS (fonts, api, video)
  const absRe = /https?:\/\/[^\s"'<>()\\]+\.(?:css|js|mjs|jpg|jpeg|png|webp|avif|gif|svg|woff2?|ttf|otf|mp4|webm|m3u8|json)(?:\?[^\s"'<>()\\]*)?/gi;
  while ((m = absRe.exec(html))) push(m[0]);

  return [...refs];
}

async function main() {
  const htmlDir = path.join(OUT, 'html');
  const rawDir = path.join(OUT, 'raw-html');
  await fsp.mkdir(htmlDir, { recursive: true });
  await fsp.mkdir(rawDir, { recursive: true });

  const manifest = {
    generatedAt: new Date().toISOString(),
    note: 'Publicly accessible frontend resources only (HTML/CSS/JS/media served to any browser).',
    pages: [],
    assets: {},
    hosts: {},
    technologies: {},
  };

  // Use Chrome so we capture the post-JS DOM as well as the raw server HTML.
  const { launchChrome } = await import('./lib/chrome.mjs');
  const session = await launchChrome({ width: 1440, height: 900 });

  try {
    for (const page of PAGES) {
      try {
        console.log(`\n=== ${page.name} :: ${page.url}`);
        const raw = await fetchBuf(page.url);
        await fsp.writeFile(path.join(rawDir, `${page.name}.html`), raw.buf);

        const info = await session.goto(page.url, { waitMs: 4000 });
        await fsp.writeFile(path.join(htmlDir, `${page.name}.rendered.html`), info.html, 'utf8');
        await fsp.writeFile(
          path.join(htmlDir, `${page.name}.dom.json`),
          JSON.stringify({ title: info.title, url: info.url, links: info.links, outline: info.outline }, null, 2),
          'utf8',
        );

        const refs = new Set([...extractRefs(raw.buf.toString('utf8'), page.url), ...extractRefs(info.html, info.url), ...info.resourceUrls]);
        manifest.pages.push({
          name: page.name,
          url: page.url,
          finalUrl: raw.finalUrl,
          httpStatus: raw.status,
          rawBytes: raw.buf.length,
          server: raw.headers.get('server'),
          title: info.title,
          refCount: refs.size,
          outline: info.outline,
          links: info.links,
        });

        // Download assets (bounded, skip huge media).
        for (const ref of refs) {
          if (!ref.startsWith('http')) continue;
          let host;
          try {
            host = new URL(ref).hostname;
          } catch {
            continue;
          }
          manifest.hosts[host] = (manifest.hosts[host] ?? 0) + 1;
          if (manifest.assets[ref]) continue;

          const ext = (new URL(ref).pathname.match(/\.([a-z0-9]+)$/i) ?? [, ''])[1].toLowerCase();
          const isHeavy = ['mp4', 'webm', 'mov', 'm3u8', 'ts'].includes(ext);
          const entry = { url: ref, host, ext, type: 'unknown' };
          manifest.assets[ref] = entry;
          if (isHeavy) {
            entry.skipped = 'heavy-media (recorded URL only)';
            continue;
          }
          try {
            const a = await fetchBuf(ref, page.url);
            entry.status = a.status;
            entry.bytes = a.buf.length;
            entry.contentType = a.headers.get('content-type') ?? '';
            entry.type = (entry.contentType.split(';')[0] || ext || 'unknown').trim();
            if (a.status === 200 && a.buf.length) {
              const dest = path.join(OUT, 'assets', safeName(ref));
              await fsp.mkdir(path.dirname(dest), { recursive: true });
              await fsp.writeFile(dest, a.buf);
              entry.file = path.relative(OUT, dest).replace(/\\/g, '/');
            }
          } catch (e) {
            entry.error = e.message;
          }
        }
        console.log(`   assets tracked: ${refs.size}`);
      } catch (e) {
        console.log(`   FAILED: ${e.message}`);
        manifest.pages.push({ name: page.name, url: page.url, error: e.message });
      }
      await sleep(400);
    }

    // Technology fingerprinting from the homepage HTML.
    const home = await fsp.readFile(path.join(rawDir, 'home.html'), 'utf8').catch(() => '');
    const rendered = await fsp.readFile(path.join(htmlDir, 'home.rendered.html'), 'utf8').catch(() => '');
    const hay = `${home}\n${rendered}`;
    const sigs = {
      jQuery: /jquery/i,
      Bootstrap: /bootstrap(\.min)?\.(css|js)/i,
      'Tailwind CSS': /tailwind/i,
      React: /react(-dom)?[.\-/]|__REACT_DEVTOOLS|data-reactroot/i,
      'Next.js': /__NEXT_DATA__|\/_next\//i,
      Vue: /vue(\.min)?\.js|__VUE__/i,
      GSAP: /gsap|TweenMax|ScrollTrigger/i,
      Swiper: /swiper/i,
      Slick: /slick(\.min)?\.(js|css)/i,
      'OWL Carousel': /owl\.carousel/i,
      AOS: /\baos\.(js|css)/i,
      WOWjs: /wow(\.min)?\.js/i,
      Lottie: /lottie/i,
      MagnificPopup: /magnific-popup|mfp-/i,
      Fancybox: /fancybox/i,
      'Google Analytics (gtag)': /gtag\(|googletagmanager\.com\/gtag/i,
      'Google Tag Manager': /googletagmanager\.com\/gtm\.js/i,
      'Meta Pixel': /connect\.facebook\.net\/.*fbevents/i,
      Simplotel: /simplotel/i,
      CloudFront: /cloudfront\.net/i,
      'Font Awesome': /font-?awesome/i,
      'Google Fonts': /fonts\.googleapis\.com|fonts\.gstatic\.com/i,
      Typekit: /use\.typekit\.net/i,
      'Booking engine (Simplotel BE)': /simplotel\.com\/be|booking-engine|book\.simplotel/i,
      reCAPTCHA: /recaptcha/i,
      'WhatsApp widget': /wa\.me|whatsapp/i,
      WordPress: /wp-content|wp-includes/i,
      Cloudflare: /cloudflare/i,
    };
    for (const [name, re] of Object.entries(sigs)) manifest.technologies[name] = re.test(hay);

    // Font families actually used.
    manifest.fontsUsed = [...new Set((rendered.match(/font-family\s*:\s*([^;"'}]+)/gi) ?? []).map((s) => s.replace(/font-family\s*:\s*/i, '').trim()))].slice(0, 40);

    await fsp.writeFile(path.join(OUT, `manifest-${TS}.json`), JSON.stringify(manifest, null, 2), 'utf8');
    await fsp.writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

    const counts = Object.values(manifest.assets).reduce((acc, a) => {
      const k = a.type || a.ext || 'other';
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
    console.log('\n=== asset types ===');
    console.log(counts);
    console.log('\n=== hosts ===');
    console.log(manifest.hosts);
    console.log('\n=== technologies ===');
    console.log(Object.entries(manifest.technologies).filter(([, v]) => v).map(([k]) => k).join(', '));
    console.log(`\nManifest: ${path.join(OUT, 'manifest.json')}`);
  } finally {
    await session.close();
  }
}

main().catch((e) => {
  console.error('[fatal]', e.stack || e.message);
  process.exit(1);
});
