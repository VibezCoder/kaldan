/* ═══════════════════════════════════════════════════════════
   Ideal Beach Resort — interaction layer v2
   Same motion stack as the Kaldan build: Lenis smooth scroll +
   GSAP ScrollTrigger (scrubbed reveals, parallax, cinematic
   hero). Everything degrades gracefully if a CDN is offline or
   the visitor prefers reduced motion.
   ═══════════════════════════════════════════════════════════ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ── consent-gated analytics bridge ──────────────────────── */
const analyticsAllowed = () => window.idealAnalyticsConsent === true && Array.isArray(window.dataLayer);
function trackIdealEvent(eventName, parameters = {}) {
  if (!analyticsAllowed()) return;
  window.dataLayer.push({ event: eventName, page_path: location.pathname, ...parameters });
}

document.addEventListener('click', event => {
  if (!analyticsAllowed()) return;
  const control = event.target.closest('a[href], button');
  if (!control) return;
  const label = (control.getAttribute('aria-label') || control.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90);
  const href = control.getAttribute('href');
  let eventName = '';
  if (control.matches('.reserve-button') || (href && href.includes('swiftbook.io'))) eventName = 'booking_start';
  else if (control.closest('.site-header, .menu-dialog')) eventName = 'navigation_click';
  else if (control.matches('.button, .ghost, a.text-link')) eventName = 'cta_click';
  if (eventName) trackIdealEvent(eventName, { element_label: label });
});

/* scroll depth — rAF-throttled, once per threshold */
const depths = new Set();
let depthScheduled = false;
addEventListener('scroll', () => {
  if (!analyticsAllowed() || depthScheduled) return;
  depthScheduled = true;
  requestAnimationFrame(() => {
    const max = document.documentElement.scrollHeight - innerHeight;
    const pct = max > 0 ? Math.round((scrollY / max) * 100) : 100;
    [25, 50, 75, 90].forEach(t => {
      if (pct >= t && !depths.has(t)) { depths.add(t); trackIdealEvent('scroll_depth', { percent: t }); }
    });
    depthScheduled = false;
  });
}, { passive: true });

/* ── motion stack ────────────────────────────────────────── */
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const gsapOK = !reduced && !!(window.gsap && window.ScrollTrigger);

let lenis;
if (!reduced && matchMedia('(pointer:fine)').matches && window.Lenis) {
  lenis = new window.Lenis({ duration: 1.05, smoothWheel: true, anchors: { offset: -80 } });
  window.__idealLenis = lenis; // QA/debug handle — also lets tests drive real smooth scrolling
  if (gsapOK) {
    lenis.on('scroll', window.ScrollTrigger.update);
    window.gsap.ticker.add(time => lenis?.raf(time * 1000));
    window.gsap.ticker.lagSmoothing(0);
  }
}

if (gsapOK) {
  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);

  /* staggered grid selectors — children animate as a sequence */
  const staggerGroups = [".room-grid", ".voice-row", ".offer-band", ".gather-grid"];
  const originalScrollTrigger = [];
  const isInStaggerGroup = el => staggerGroups.some(sel => el.parentElement?.matches(sel));

  /* rise reveals — same timing as the Kaldan build (skips grouped items) */
  $$('[data-rise]').forEach(element => {
    if (isInStaggerGroup(element)) return;
    gsap.fromTo(element, { y: 28 }, {
      y: 0, duration: 1.1, ease: 'power3.out', immediateRender: false,
      scrollTrigger: { trigger: element, start: 'top 93%', once: true }
    });
  });
  /* staggered grids: rooms, voices, offers */
  /* staggered grids: rooms, voices, offers — per-element fromTo
     (the pattern the Kaldan rise uses), tiny index delay for the
     cascade; clearProps restores :hover transforms afterwards */
  staggerGroups.forEach(sel => {
    const group = $(sel);
    if (!group) return;
    Array.from(group.children).forEach((child, i) => {
      gsap.fromTo(child, { y: 34, opacity: 0 }, {
        y: 0, opacity: 1, duration: 1.05, ease: 'power3.out', delay: (i % 4) * 0.12, clearProps: 'transform',
        scrollTrigger: { trigger: child, start: 'top 92%', once: true, immediateRender: false }
      });
    });
  });

  /* parallax — placeholder frames drift like glass over depth.
     Handles both shapes: wrapper[data-parallax] > .ph and .ph[data-parallax]. */
  $$('[data-parallax]').forEach(frame => {
    const element = frame.classList.contains('ph') ? frame : frame.querySelector('.ph');
    if (!element) return;
    gsap.fromTo(element, { scale: 1.06, yPercent: -2 }, {
      scale: 1.06, yPercent: 2, ease: 'none',
      scrollTrigger: { trigger: frame.parentElement, start: 'top bottom', end: 'bottom top', scrub: .7 }
    });
  });

  /* cinematic arrival: the sun sinks, the sea rises, the copy
     lifts away — scrubbed to the first viewport scroll. Plays on
     any viewport that fits (701px+); touch-safe since it is
     scroll-linked, not wheel-dependent. */
  const mm = gsap.matchMedia();
  mm.add('(min-width: 701px) and (prefers-reduced-motion: no-preference)', () => {
    const arrival = $('.arrival');
    if (!arrival) return;
    arrival.classList.add('is-cinematic');
    const controls = $$('.arrival-copy, .trust-line');
    const timeline = gsap.timeline({
      scrollTrigger: { trigger: arrival, start: 'top top', end: 'bottom top', scrub: .55, onUpdate: self => {
        controls.forEach(element => { element.inert = self.progress > .55; });
      } }
    });
    timeline
      .to('.arrival-copy', { opacity: 0, y: -70, ease: 'none', duration: .35 }, 0)
      .to('.arrival-horizon .sun', { y: 120, scale: 1.16, ease: 'none', duration: 1 }, 0)
      .to('.arrival-horizon .sea', { height: '74%', ease: 'none', duration: 1 }, 0)
      .to('.arrival-horizon .sky', { bottom: '26%', ease: 'none', duration: 1 }, 0)
      .to('.tide-band', { yPercent: 54, scaleY: 1.14, ease: 'none', duration: 1 }, 0)
      .fromTo('.arrival-side', { opacity: 0 }, { opacity: .85, duration: .18, ease: 'none' }, .8);
    return () => {
      arrival.classList.remove('is-cinematic');
      controls.forEach(element => { element.inert = false; });
      gsap.set(['.arrival-copy', '.tide-band', '.arrival-side'], { clearProps: 'all' });
      gsap.set('.arrival-horizon > *', { clearProps: 'all' });
    };
  });

  document.fonts?.ready.then(() => ScrollTrigger.refresh());
  addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
  addEventListener('resize', () => ScrollTrigger.refresh());
} else {
  /* vanilla fallback: IO reveals */
  if (!reduced && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('in'); io.unobserve(entry.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    $$('[data-rise]').forEach(el => io.observe(el));
    $$(".room-grid, .voice-row, .offer-band, .gather-grid").forEach(group =>
      [...group.children].forEach((child, i) => { child.style.transitionDelay = `${i * 90}ms`; io.observe(child); }));
  } else {
    $$('[data-rise]').forEach(el => el.classList.add('in'));
  }
}

/* ── theme-morphing header (ScrollTrigger-aware) ─────────── */
const header = $('.site-header');
const themes = $$('[data-theme]').filter(el => el !== header);
let navScheduled = false;
function updateNav() {
  const probe = (header?.getBoundingClientRect().height || 0) / 2;
  let theme = 'media';
  for (const section of themes) {
    const r = section.getBoundingClientRect();
    if (r.top <= probe && r.bottom > probe) theme = section.dataset.theme;
  }
  if (header) header.dataset.theme = theme;
  header?.classList.toggle('scrolled', scrollY > 30);
  navScheduled = false;
}
addEventListener('scroll', () => { if (!navScheduled) { navScheduled = true; requestAnimationFrame(updateNav); } }, { passive: true });
addEventListener('resize', updateNav);
updateNav();

/* ── dialogs (menu / lightbox patterns) ──────────────────── */
let returnFocus;
function openDialog(dialog, opener) {
  if (!dialog || dialog.open) return;
  returnFocus = opener || document.activeElement;
  lenis?.stop();
  document.body.classList.add('dialog-open');
  dialog.showModal();
  dialog.querySelector('[data-close]')?.focus({ preventScroll: true });
}
$$('dialog').forEach(dialog => {
  $$('[data-close]', dialog).forEach(b => b.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('dialog-open');
    lenis?.start();
    $$('video', dialog).forEach(video => video.pause());
    returnFocus?.focus({ preventScroll: true });
  });
});
$('[data-open-menu]')?.addEventListener('click', event => openDialog($('#site-menu'), event.currentTarget));

/* ── filter/search scope ─────────────────────────────────── */
$$('[data-filter-scope], [data-search-scope]').forEach(scope => {
  const input = $('[data-search]', scope);
  const buttons = $$('[data-filter]', scope);
  const items = $$('[data-filter-item]', scope);
  const apply = () => {
    const selected = buttons.find(b => b.getAttribute('aria-pressed') === 'true')?.dataset.filter || 'all';
    const query = (input?.value || '').trim().toLocaleLowerCase();
    let visible = 0;
    items.forEach(item => {
      const matches = (selected === 'all' || (item.dataset.category || '') === selected) && (!query || item.textContent.toLocaleLowerCase().includes(query));
      item.hidden = !matches;
      if (matches) visible++;
    });
    const empty = $('[data-empty]', scope);
    if (empty) empty.hidden = visible > 0;
    gsapOK && window.ScrollTrigger.refresh();
  };
  buttons.forEach(button => button.addEventListener('click', () => {
    buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    apply();
  }));
  input?.addEventListener('input', apply);
});
