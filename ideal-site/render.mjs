/* ═══════════════════════════════════════════════════════════
   Ideal Beach Resort — concept render pipeline
   node render.mjs  →  emits static multi-page HTML + manifest
   Same architecture as the Kaldan build: one content.json,
   template functions, plain HTML output. noindex until approval.
   ═══════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const content = JSON.parse(fs.readFileSync(path.join(root, 'content.json'), 'utf8'));

export const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* honest placeholder frame — labelled, no invented photography */
const image = (key, alt, mood = 'sea', parallax = false) =>
  `<figure class="ph" data-a="${mood}" ${parallax ? 'data-parallax' : ''}><span class="ph-waves"></span><span class="ph-label">${esc(alt)}</span></figure>`;

const crest = `<span class="brand-mark" aria-hidden="true">i</span>`;

const nav = [['The resort', '/'], ['Stays', '/rooms/'], ['Dining', '/dining/'], ['Offers', '/events-offers/'], ['Our story', '/about-us/'], ['Find us', '/contact/']];

const booking = content.identity.bookingEngine;

function header(page) {
  const link = (name, href) => `<a href="${href}" ${page === href ? 'aria-current="page"' : ''}>${name}</a>`;
  return `<a class="skip-link" href="#main">Skip to content</a><header class="site-header" data-theme="media">
    <a class="brand" href="/" aria-label="Ideal Beach Resort, home">${crest}<span class="brand-name">IDEAL<span>BEACH RESORT</span></span></a>
    <nav class="site-nav" aria-label="Primary">${nav.map(([n, h]) => link(n, h)).join('')}</nav>
    <a class="reserve-button" href="${booking}" target="_blank" rel="noopener noreferrer" aria-label="Reserve a stay — opens the resort's official booking engine in a new tab">Reserve <span aria-hidden="true">→</span></a>
  </header>`;
}

function footer() {
  const i = content.identity;
  return `<footer class="footer" data-theme="dark"><div class="wrap footer-grid">
    <div class="footer-brand"><a class="brand" href="/" style="color:var(--sand)">${crest}<span class="brand-name">IDEAL<span>BEACH RESORT</span></span></a>
      <p>${esc(i.tagline)}.</p><p class="trust-line" style="color:rgba(246,241,231,.6)">${esc(i.trustLine)}</p></div>
    <div><h2>Find your way</h2>${nav.map(([n, h]) => `<a href="${h}">${n}</a>`).join('')}</div>
    <div><h2>At your service</h2><a href="tel:${esc(i.phone1.replace(/\s/g, ''))}">${esc(i.phone1)}</a><a href="mailto:${esc(i.email)}">${esc(i.email)}</a>
      <address>${esc(i.address)}</address>
      <a href="${esc(i.facebook)}" target="_blank" rel="noopener noreferrer">Facebook — @trulyideal</a>
      <a href="${esc(i.instagram)}" target="_blank" rel="noopener noreferrer">Instagram — @idealbeach</a>
      <a href="#" onclick="return false">Ideal River View Resort, Thanjavur — site pending</a></div>
  </div>
  <div class="wrap"><p class="concept-note"><strong>Independent design concept — not the official hotel website.</strong> No booking or payment is taken here; reserve buttons open the resort's own live booking engine. All imagery is a labelled placeholder pending the hotel's approval of real photography. ${esc(content.notesForBuild.consent)}</p></div></footer>`;
}

const head = (page, prefix) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(page.title)}</title><meta name="description" content="${esc(page.description)}">
<meta name="theme-color" content="#0d2430">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,500;1,400&family=Manrope:wght@400;600;700&display=swap" rel="stylesheet">
<script defer src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/lenis@1.1.14/dist/lenis.min.js"></script>
<link rel="stylesheet" href="${prefix}src/theme.css"><script defer src="${prefix}src/main.js"></script></head><body>`;

/* ── home ─────────────────────────────────────────────────── */
function home() {
  const i = content.identity, s = content.story, g = content.gatherings;
  return `<section class="arrival" data-theme="media"><div class="arrival-stage">
    <div class="arrival-horizon" aria-hidden="true"><div class="sky"></div><div class="sun"></div><div class="sea"></div><div class="tide-band"></div></div>
    <span class="arrival-side">THE LONG TIDE · ECR · SINCE 1978</span>
    <div class="arrival-copy">
      <p class="eyebrow arrival-kicker">Ideal Beach Resort · Mahabalipuram</p>
      <h1><span>The sea set the table.</span><em>The family kept it.</em></h1>
      <p class="hero-tagline">12 acres of garden meeting a private beach on the East Coast Road — run by the same family for ${new Date().getFullYear() - s.founded} years.</p>
      <div class="hero-ctas"><a class="button" href="${booking}" target="_blank" rel="noopener noreferrer">Check availability <span aria-hidden="true">→</span></a><a class="button ghost" href="/rooms/">See the rooms</a></div>
      <p class="trust-line">${esc(i.trustLine)}</p>
    </div>
  </div></section>

  <section class="section wrap" data-theme="light" id="heritage"><div class="story-grid">
    <div class="story-copy" data-rise><p class="eyebrow">01 / Since 1978 — the family side of the shore</p>
      <h2 class="display">Start as two rooms.<br><em>Grown by one family, still.</em></h2>
      ${s.paragraphs.map(p => `<p>${esc(p)}</p>`).join('')}
      <div class="timeline"><div><strong>1978</strong> — P.M. &amp; Mrs Dharmalingam build the first two Garden View rooms on procured land.</div><div><strong>The estate grows</strong> — more rooms, amenities, tidied gardens — at the family's own pace, on the family's own ECR acreage.</div><div><strong>Today</strong> — son Bose Dharmalingam leads the Ideal Group: this resort plus Ideal River View Resort, Thanjavur; the proprietors present on both properties.</div></div>
    </div>
    <div class="story-visual" data-rise>${image('heritage', 'Resort photography pending approval: the original garden wing & founder era', 'garden', true)}<p class="story-caption">Image slot reserved for hotel-approved photography: founder era / garden wing.</p></div>
  </div></section>

  <section class="section" data-theme="dark"><div class="wrap">
    <div class="story-copy" data-rise style="max-width:760px"><p class="eyebrow">02 / Stays</p>
      <h2 class="display">Three ways to hold<br><em>the same quiet shore.</em></h2>
      <p class="lede">Room categories as listed on the resort's own Booking.com inventory. One long-time guest summed the layout up best — <em>"all rooms facing beach."</em></p>
    </div>
    <div class="room-grid" data-filter-scope>
      ${content.rooms.map((r, idx) => `<article class="room-card" data-filter-item data-category="rooms" data-rise>
        ${image('room', `Resort photography pending approval: ${r.name}`, idx === 2 ? 'sea' : 'sand')}
        <div class="room-meta"><span class="n">0${idx + 1} / ${esc(r.beds)}</span><h3>${esc(r.name)}</h3><p>${esc(r.blurb)}</p><span class="feature">${esc(r.feature)}</span></div>
      </article>`).join('')}
    </div>
    <p class="small rooms-note" style="color:rgba(246,241,231,.6)">${esc(content.roomNote)}</p>
  </div></section>

  <section class="section wrap" data-theme="light" id="dining"><div class="story-grid">
    <div class="story-visual" data-rise>${image('dining', 'Resort photography pending approval: the breakfast table', 'dusk', true)}<p class="story-caption">Image slot reserved for hotel-approved photography: breakfast service.</p></div>
    <div class="story-copy" data-rise><p class="eyebrow">03 / At the table</p>
      <h2 class="display">Breakfast is<br><em>the second favourite beach here.</em></h2>
      <p class="lede">${esc(content.dining.note)}</p>
      ${content.dining.quotes.map(q => `<p><em>"${esc(q.text)}"</em> — ${esc(q.who)}, ${esc(q.when)}.</p>`).join('')}
      <a class="button" href="/dining/" style="margin-top:1.6rem">Explore dining</a>
    </div>
  </div></section>

  <section class="section" data-theme="media"><div class="wrap">
    <div class="story-copy" data-rise style="max-width:760px"><p class="eyebrow">04 / The long tide — days at the resort</p>
      <h2 class="display">Do nothing by the water.<br><em>Or everything.</em></h2>
    </div>
    <div class="exp-list" data-theme="dark">
      ${content.experiences.map(e => `<div class="exp-item" data-rise><span class="n" aria-hidden="true">${esc(e.n)}</span><div><h3>${esc(e.title)}</h3><p>${esc(e.text)}</p><p class="quote">${esc(e.quote)}</p></div></div>`).join('')}
    </div>
  </div></section>

  <section class="section wrap" data-theme="light"><div class="story-copy" data-rise style="max-width:720px"><p class="eyebrow">05 / Gatherings</p>
    <h2 class="display">Your wedding, the sea's front row.<br><em>Your conference, its own tide.</em></h2>
  </div>
  <div class="gather-grid">
    <article class="gather" data-rise>${image('wed', 'Resort photography pending approval: the lawn wedding setting', 'garden')}<div class="gather-body"><h3>${esc(g.weddings.title)}</h3><p>${esc(g.weddings.text)}</p></div></article>
    <article class="gather" data-rise>${image('conf', 'Resort photography pending approval: the conference block', 'dusk')}<div class="gather-body"><h3>${esc(g.conferences.title)}</h3><p>${esc(g.conferences.text)}</p></div></article>
  </div></section>

  <section class="section" data-theme="dark"><div class="wrap">
    <div class="story-copy" data-rise style="max-width:760px"><p class="eyebrow">06 / In their words</p>
      <h2 class="display">1,208 reviewers said it best.<br><em>We just kept the sand tidy.</em></h2>
    </div>
    <div class="voice-row">${content.voices.map((v, idx) => `<figure class="voice" data-rise><p>"${esc(v.text)}"</p><cite>— ${esc(v.who)} · ${esc(v.when)}</cite></figure>`).join('')}</div>
  </div></section>

  <section class="section invitation" data-theme="media"><div class="tide-foot" aria-hidden="true"></div><div class="wrap invitation-inner">
    <p class="eyebrow" style="margin-bottom:.6rem">The tide keeps its appointments</p>
    <h2 class="display">Come for the stories.<br><em>Stay for the silence.</em></h2>
    <p class="lede" style="color:rgba(246,241,231,.8)">Direct reservations with the resort's own booking office — no third-party mark-up on your weekend.</p>
    <div class="hero-ctas"><a class="button" href="${booking}" target="_blank" rel="noopener noreferrer">Reserve your stay <span aria-hidden="true">→</span></a><a class="button ghost" href="/contact/">Talk to us</a></div>
    <div class="invitation-meta"><span>${esc(i.phone1)}</span><a href="mailto:${esc(i.email)}">${esc(i.email)}</a><span>${esc(i.address)}</span></div>
  </div></section>`;
}

const pageHero = (eyebrow, title, lead, mood = 'sea') =>
  `<section class="section" data-theme="media" style="padding-block:calc(var(--s9) + 3rem) var(--s7)"><div class="wrap" data-rise>
    <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a> <span aria-hidden="true">/</span> ${esc(eyebrow.split('/').pop())}</nav>
    <p class="eyebrow" style="margin-top:1rem">${esc(eyebrow)}</p><h1 class="display" style="font-size:var(--fs-h2)">${esc(title)}</h1>
    ${lead ? `<p class="lede" style="color:rgba(246,241,231,.8);margin-top:.8rem">${esc(lead)}</p>` : ''}
  </div></section>`;

function rooms() {
  return `<section class="section wrap" data-theme="light"><div class="story-grid">
    <div class="story-copy" data-rise><p class="eyebrow">Stays</p><h2 class="display">Every window chosen for you.<br><em>Mostly, for the sea.</em></h2>
    <p class="lede">Categories below match the resort's own inventory on Booking.com (verified 2026-11-10). Rates are live on the booking engine — this concept does not quote prices, so the resort keeps full rate control.</p></div>
    <div class="story-visual" data-rise>${image('rooms-hero', 'Resort photography pending approval: a sea-facing room', 'sea', true)}<p class="story-caption">Image slot reserved for hotel-approved photography.</p></div>
  </div>
  <div class="room-grid" data-filter-scope>
    ${content.rooms.map((r, idx) => `<article class="room-card" data-filter-item data-category="rooms" data-rise>
      ${image('room', `Resort photography pending approval: ${r.name}`, idx === 1 ? 'garden' : 'sand')}
      <div class="room-meta"><span class="n">0${idx + 1} / ${esc(r.beds)}</span><h3>${esc(r.name)}</h3><p>${esc(r.blurb)}</p><span class="feature">${esc(r.feature)}</span></div>
    </article>`).join('')}
  </div>
  <p class="small rooms-note">${esc(content.roomNote)}</p></section>`;
}

function dining() {
  return `<section class="section wrap" data-theme="light"><div class="story-grid">
    <div class="story-visual" data-rise><figure class="ph" data-a="dusk" data-parallax style="aspect-ratio:1;min-height:0"><span class="ph-waves"></span><span class="ph-label">Resort photography pending approval: the restaurant</span></figure></div>
    <div class="story-copy" data-rise><p class="eyebrow">Dining</p><h2 class="display">The table guests<br><em>write home about.</em></h2>
    <p class="lede">${esc(content.dining.note)}</p>
    ${content.dining.quotes.map(q => `<p><em>"${esc(q.text)}"</em> — ${esc(q.who)}, ${esc(q.when)}.</p>`).join('')}
    <p class="browser-note">Menu and outlet naming to be finalized with the hotel ("The Garden Table" is a placeholder concept name).</p></div>
  </div></section>`;
}

function eventsOffers() {
  return `<section class="section wrap" data-theme="light"><div class="story-copy" data-rise style="max-width:720px">
    <p class="eyebrow">Gatherings &amp; offers</p><h2 class="display">One acre, one wedding.<br><em>One lawn, one boardroom.</em></h2>
    <p class="lede">${esc(content.gatherings.weddings.text)}</p><p class="lede">${esc(content.gatherings.conferences.text)}</p>
    <p class="browser-note">${esc(content.offersNote)}</p></div>
    <div class="offer-band">
      <article class="offer" data-rise><span class="tag">Festive — sample</span><h3>Deepavali by the sea</h3><p>Two-night festive stay with the family breakfast, fireworks eve on the lawn, and the private beach at dusk.</p></article>
      <article class="offer" data-rise><span class="tag">Corporate — sample</span><h3>Monsoon off-site</h3><p>Day-conference package with the tide as the tea break: poolside lunches, garden breakouts.</p></article>
      <article class="offer" data-rise><span class="tag">Long stay — sample</span><h3>The 1978 rate</h3><p>Seven nights or more — quiet-season pricing for readers, writers, and retirees.</p></article>
    </div></section>`;
}

function aboutUs() {
  const s = content.story;
  return `<section class="section wrap" data-theme="light"><div class="story-grid">
    <div class="story-copy" data-rise><p class="eyebrow">Our story</p><h2 class="display">Since 1978,<br><em>the family at the shore.</em></h2>
    ${s.paragraphs.map(p => `<p>${esc(p)}</p>`).join('')}
    <div class="timeline"><div><strong>1978</strong> — Two Garden View rooms; the Dharmalingams move in over their work.</div><div><strong>12 acres</strong> — the estate grows room by room, garden by garden, at the family's pace.</div><div><strong>Ideal Group</strong> — Ideal Beach Resort, Mahabalipuram + Ideal River View Resort, Thanjavur.</div><div><strong>Legacy trust asset</strong> — 10,511 Google reviews (measured 2026-11-10): the corridor's largest accumulated guest record.</div></div></div>
    <div class="story-visual" data-rise>${image('about', 'Resort photography pending approval: the founders & the family table', 'garden', true)}</div>
  </div></section>`;
}

function contact() {
  const i = content.identity;
  return `<section class="section wrap" data-theme="light"><div class="loc-grid">
    <div class="story-copy" data-rise><p class="eyebrow">Find us</p><h2 class="display">#164, ECR Road,<br><em>Devaneri, Mahabalipuram.</em></h2>
    <p class="lede">On the East Coast Road between Chennai and Pondicherry — private beach access from the garden gate.</p>
    <div class="loc-facts"><div><strong>Booking office</strong><p>${esc(i.phone1)} / ${esc(i.phone1b)}<br>${esc(i.phone2)}</p></div>
    <div><strong>Email</strong><p><a href="mailto:${esc(i.email)}" style="text-decoration:underline">${esc(i.email)}</a></p></div>
    <div><strong>Live rates &amp; availability</strong><p>Through the resort's official booking system — <a href="${booking}" target="_blank" rel="noopener noreferrer" style="text-decoration:underline">open it here</a>.</p></div></div></div>
    <div class="story-visual" data-rise>${image('map', 'Interactive map slot — embed OpenStreetMap/Google Map with the resort pin on approval', 'sea')}</div>
  </div></section>`;
}

/* ── manifest ────────────────────────────────────────────── */
const pages = [
  { path: '/', title: 'Ideal Beach Resort, Mahabalipuram — A private beach, kept in the family since 1978', description: '12 acres of garden meeting a private beach on the East Coast Road, Mahabalipuram. Family-run since 1978. Rated by 10,000+ guests on Google.', body: home(), prefix: '' },
  { path: '/rooms/', title: 'Stays — Ideal Beach Resort', description: 'Garden View, Deluxe Twin and Sea-side Villa categories on 12 acres at ECR, Mahabalipuram — as listed by the resort on Booking.com.', body: rooms(), prefix: '../' },
  { path: '/dining/', title: 'Dining — Ideal Beach Resort', description: 'Breakfast and bay-side dining, repeatedly named the best part of a stay in verified guest reviews.', body: dining(), prefix: '../' },
  { path: '/events-offers/', title: 'Weddings, conferences & offers — Ideal Beach Resort', description: 'Lawn weddings and tide-side conferences on the resort\'s 12 private acres; festive offers to be published.', body: eventsOffers(), prefix: '../' },
  { path: '/about-us/', title: 'Our story — Ideal Beach Resort since 1978', description: 'Founded 1978 by P.M. Dharmalingam; family-run ever since; the Ideal Group with its sister resort in Thanjavur.', body: aboutUs(), prefix: '../' },
  { path: '/contact/', title: 'Find us — Ideal Beach Resort, Devaneri, ECR', description: 'Booking office phone, email and live rates for Ideal Beach Resort, #164 ECR Road, Devaneri Village, Mahabalipuram.', body: contact(), prefix: '../' },
];

for (const page of pages) {
  const html = `${head(page, page.prefix)}${header(page.path)}<main id="main" tabindex="-1">${page.body}</main>${footer()}</body></html>`;
  const target = page.path === '/' ? 'index.html' : path.join(page.path.slice(1), 'index.html');
  fs.mkdirSync(path.dirname(path.join(root, target)), { recursive: true });
  fs.writeFileSync(path.join(root, target), html);
}
fs.writeFileSync(path.join(root, 'routes.json'), JSON.stringify(pages.map(({ path: p, title }) => ({ path: p, title })), null, 2));
console.log(`Rendered ${pages.length} pages for Ideal Beach Resort (concept).`);
