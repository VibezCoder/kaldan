/** Fingerprints the three reference sites: libraries, fonts, video, structure. */
const SITES = [
  ['The Vineyard Hotel', 'https://www.vineyard.co.za/'],
  ['Hotel du Tasso', 'https://www.hoteldutassosorrento.com/'],
  ['Casa Momo', 'https://www.casamomo.at/'],
];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const SIGS = {
  'GSAP': /gsap|TweenMax|ScrollTrigger|SplitText/i,
  'Lenis smooth scroll': /lenis/i,
  'Locomotive Scroll': /locomotive/i,
  'Three.js / WebGL': /three\.(min\.)?js|THREE\.|webgl/i,
  'Barba.js': /barba/i,
  'Swiper': /swiper/i,
  'Framer Motion': /framer-motion|motion\.dev/i,
  'Next.js': /__NEXT_DATA__|\/_next\//i,
  'Nuxt': /__NUXT__|_nuxt/i,
  'Astro': /astro-island|data-astro/i,
  'React': /react(-dom)?[.\-/]/i,
  'WordPress': /wp-content|wp-includes/i,
  'Webflow': /webflow/i,
  'Squarespace': /squarespace/i,
  'Elementor': /elementor/i,
  'Lottie': /lottie/i,
  'Google Fonts': /fonts\.googleapis\.com/i,
  'Typekit': /typekit/i,
};

for (const [name, url] of SITES) {
  console.log('\n' + '='.repeat(76));
  console.log(name, '—', url);
  console.log('='.repeat(76));
  try {
    const t0 = Date.now();
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(45000) });
    const html = await r.text();
    console.log(`status ${r.status}  ${(html.length / 1024).toFixed(0)} KB  ${Date.now() - t0}ms  final=${r.url}`);

    const found = Object.entries(SIGS).filter(([, re]) => re.test(html)).map(([k]) => k);
    console.log('tech:', found.join(', ') || '(none detected)');

    const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);
    console.log(`scripts: ${scripts.length}`);
    scripts.slice(0, 12).forEach((s) => console.log('   ' + s.replace(/^https?:\/\/[^/]+/, '').slice(0, 90)));

    const videos = [...new Set([...html.matchAll(/https?:\/\/[^\s"'<>()\\]+\.(?:mp4|webm|m3u8)/gi)].map((m) => m[0]))];
    console.log(`videos: ${videos.length}`, videos.slice(0, 3).map((v) => v.slice(0, 80)));

    const fonts = [...new Set([...html.matchAll(/font-family\s*:\s*([^;"'}]+)/gi)].map((m) => m[1].trim()))].slice(0, 8);
    console.log('font-family declarations:', fonts);

    const gf = [...new Set([...html.matchAll(/fonts\.googleapis\.com\/(css2?)\?([^"'>\s]+)/gi)].map((m) => decodeURIComponent(m[2])))];
    if (gf.length) console.log('google fonts:', gf);

    const sections = [...html.matchAll(/<(section|header|footer)[^>]*>/gi)].length;
    console.log('section-ish tags:', sections);

    const headings = [...html.matchAll(/<h([1-3])[^>]*>([\s\S]{0,120}?)<\/h\1>/gi)]
      .map((m) => `h${m[1]}: ${m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}`)
      .filter((s) => s.length > 6)
      .slice(0, 10);
    console.log('headings:'); headings.forEach((h) => console.log('   ' + h.slice(0, 90)));
  } catch (e) {
    console.log('FAILED:', e.message);
  }
}