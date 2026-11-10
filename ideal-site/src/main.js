/* ═══════════════════════════════════════════════════════════
   Ideal Beach Resort — interaction layer (concept, vanilla-first)
   Same behavioural inventory as the playbook build:
   theme-morphing header, rise reveals, scroll-depth telemetry,
   consent-gated events, dialog patterns.
   GSAP/Lenis is swapped in at production approval if requested;
   every behaviour here degrades gracefully without it.
   ═══════════════════════════════════════════════════════════ */

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
let scheduled = false;
addEventListener('scroll', () => {
  if (!analyticsAllowed() || scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    const max = document.documentElement.scrollHeight - innerHeight;
    const pct = max > 0 ? Math.round((scrollY / max) * 100) : 100;
    [25, 50, 75, 90].forEach(t => {
      if (pct >= t && !depths.has(t)) { depths.add(t); trackIdealEvent('scroll_depth', { percent: t }); }
    });
    scheduled = false;
  });
}, { passive: true });

/* ── theme-morphing header ───────────────────────────────── */
const header = document.querySelector('.site-header');
const themes = [...document.querySelectorAll('[data-theme]')].filter(el => el !== header);
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
  document.documentElement.style.setProperty('--header-ink', theme === 'light' ? 'var(--ink)' : 'var(--sand)');
  navScheduled = false;
}
addEventListener('scroll', () => { if (!navScheduled) { navScheduled = true; requestAnimationFrame(updateNav); } }, { passive: true });
addEventListener('resize', updateNav);
updateNav();

/* ── rise reveals (vanilla IntersectionObserver) ─────────── */
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!reduced && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('in'); io.unobserve(entry.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('[data-rise]').forEach(el => io.observe(el));
} else {
  document.querySelectorAll('[data-rise]').forEach(el => el.classList.add('in'));
}

/* ── parallax drift for placeholder media frames ─────────── */
if (!reduced) {
  const frames = document.querySelectorAll('[data-parallax]');
  if (frames.length) {
    const onScroll = () => {
      frames.forEach(frame => {
        const r = frame.getBoundingClientRect();
        const progress = (r.top + r.height / 2 - innerHeight / 2) / innerHeight; // -1..1-ish
        const inner = frame.querySelector('.ph-waves, .ph::after') || frame;
        if (inner instanceof HTMLElement) inner.style.transform = `translateY(${progress * 12}px)`;
      });
    };
    let pSchedule = false;
    addEventListener('scroll', () => { if (!pSchedule) { pSchedule = true; requestAnimationFrame(() => { onScroll(); pSchedule = false; }); } }, { passive: true });
    onScroll();
  }
}

/* ── dialogs (menu / lightbox patterns) ──────────────────── */
let returnFocus;
function openDialog(dialog, opener) {
  if (!dialog || dialog.open) return;
  returnFocus = opener || document.activeElement;
  dialog.showModal();
  dialog.querySelector('[data-close]')?.focus({ preventScroll: true });
}
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => returnFocus?.focus({ preventScroll: true }));
});
document.querySelector('[data-open-menu]')?.addEventListener('click', event => openDialog(document.getElementById('site-menu'), event.currentTarget));

/* ── filter/search scope (rooms & offers) ────────────────── */
document.querySelectorAll('[data-filter-scope], [data-search-scope]').forEach(scope => {
  const input = scope.querySelector('[data-search]');
  const buttons = [...scope.querySelectorAll('[data-filter]')];
  const items = [...scope.querySelectorAll('[data-filter-item]')];
  const apply = () => {
    const selected = buttons.find(b => b.getAttribute('aria-pressed') === 'true')?.dataset.filter || 'all';
    const query = (input?.value || '').trim().toLowerCase();
    items.forEach(item => {
      const cat = item.dataset.category || '';
      item.hidden = !((selected === 'all' || cat === selected) && (!query || item.textContent.toLowerCase().includes(query)));
    });
  };
  buttons.forEach(button => button.addEventListener('click', () => {
    buttons.forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    apply();
  }));
  input?.addEventListener('input', apply);
});
