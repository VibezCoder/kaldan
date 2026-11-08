import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];


// Consent-gated analytics bridge. A hotel-approved consent manager must set
// window.kaldanAnalyticsConsent = true and load the site's GTM/GA4 dataLayer
// only after the visitor has granted analytics consent. No form values or PII
// are included in these events.
const analyticsAllowed = () => window.kaldanAnalyticsConsent === true && Array.isArray(window.dataLayer);
function trackKaldanEvent(eventName, parameters = {}) {
  if (!analyticsAllowed()) return;
  window.dataLayer.push({ event: eventName, page_path: location.pathname, ...parameters });
}

document.addEventListener('click', event => {
  if (!analyticsAllowed()) return;
  const control = event.target.closest('a[href], button');
  if (!control) return;

  const label = (control.getAttribute('aria-label') || control.textContent || '')
    .replace(/\s+/g, ' ').trim().slice(0, 90);
  const href = control.getAttribute('href');
  let destination = null;
  if (href) {
    try { destination = new URL(href, location.href); } catch { /* Ignore malformed or script URLs. */ }
  }
  let eventName = '';
  const parameters = { element_label: label };

  if (control.matches('.reserve-button') || destination?.hostname === 'bookings.kaldanhotels.com') {
    eventName = 'booking_start';
  } else if (control.matches('[data-reserve]')) {
    eventName = 'booking_assist_open';
  } else if (control.matches('[data-experience]')) {
    eventName = 'experience_select';
    parameters.experience_index = Number(control.dataset.experience) + 1;
  } else if (control.matches('[data-film]')) {
    eventName = 'palace_film_open';
  } else if (control.matches('[data-pause-film]')) {
    eventName = 'hero_film_toggle';
  } else if (control.closest('.site-header, .menu-dialog')) {
    eventName = 'navigation_click';
  } else if (control.matches('.button, .hero-discover') || control.classList.contains('text-link')) {
    eventName = 'cta_click';
  }

  if (!eventName) return;
  if (destination) {
    parameters.destination_path = destination.origin === location.origin ? destination.pathname : destination.hostname;
  }
  trackKaldanEvent(eventName, parameters);
});

const trackedScrollDepths = new Set();
let scrollTrackingScheduled = false;
addEventListener('scroll', () => {
  if (!analyticsAllowed() || scrollTrackingScheduled) return;
  scrollTrackingScheduled = true;
  requestAnimationFrame(() => {
    const maxScroll = document.documentElement.scrollHeight - innerHeight;
    const depth = maxScroll > 0 ? Math.round((scrollY / maxScroll) * 100) : 100;
    [25, 50, 75, 90].forEach(threshold => {
      if (depth >= threshold && !trackedScrollDepths.has(threshold)) {
        trackedScrollDepths.add(threshold);
        trackKaldanEvent('scroll_depth', { percent_scrolled: threshold });
      }
    });
    scrollTrackingScheduled = false;
  });
}, { passive: true });
const media = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = media.matches;
let lenis;
if (!reduced && matchMedia('(pointer:fine)').matches) {
  lenis = new Lenis({ duration: 1.05, smoothWheel: true, anchors: { offset: -85 } });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(time => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}
const header = $('.site-header');
const themes = $$('[data-theme]').filter(element => element !== header);
let navScheduled = false;
function updateNav() {
  const probe = header.getBoundingClientRect().height / 2;
  let theme = 'light';
  for (const section of themes) {
    const rect = section.getBoundingClientRect();
    if (rect.top <= probe && rect.bottom > probe) theme = section.dataset.theme;
  }
  header.dataset.theme = theme;
  header.classList.toggle('scrolled', scrollY > 30);
  navScheduled = false;
}
addEventListener('scroll', () => {
  if (!navScheduled) { navScheduled = true; requestAnimationFrame(updateNav); }
}, { passive: true });
addEventListener('resize', updateNav);
updateNav();

let returnFocus;
function openDialog(dialog, opener) {
  if (!dialog || dialog.open) return;
  returnFocus = opener || document.activeElement;
  lenis?.stop();
  document.body.classList.add('dialog-open');
  dialog.showModal();
  $('[data-close]', dialog)?.focus({ preventScroll: true });
}
$$('dialog').forEach(dialog => {
  $$('[data-close]', dialog).forEach(button => button.addEventListener('click', () => dialog.close()));
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
$$('[data-reserve]').forEach(link => link.addEventListener('click', event => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  openDialog($('#reservation'), link);
}));
$$('[data-film]').forEach(button => button.addEventListener('click', () => {
  const dialog = $('#palace-film');
  const video = $('video', dialog);
  video.src ||= video.dataset.src;
  openDialog(dialog, button);
  video.play().catch(() => {});
}));

const ambient = $('[data-ambient-src]');
const pauseButton = $('[data-pause-film]');
let filmRequested = false;
let filmInView = true;
const connection = navigator.connection;
function updateFilmButton() {
  if (!pauseButton || !ambient) return;
  const playing = !ambient.paused;
  pauseButton.textContent = playing ? 'Pause film' : 'Play film';
  pauseButton.setAttribute('aria-label', playing ? 'Pause background film' : 'Play background film');
  pauseButton.setAttribute('aria-pressed', String(playing));
}
async function playAmbient() {
  if (!ambient) return;
  ambient.src ||= matchMedia('(max-width: 700px)').matches ? '/media/palace-loop-mobile.mp4' : ambient.dataset.ambientSrc;
  try { await ambient.play(); ambient.classList.add('playing'); } catch { ambient.classList.remove('playing'); }
  updateFilmButton();
}
if (ambient) {
  ['play', 'pause'].forEach(event => ambient.addEventListener(event, updateFilmButton));
  ambient.addEventListener('error', () => { ambient.classList.remove('playing'); updateFilmButton(); });
  new IntersectionObserver(entries => {
    filmInView = entries[0].isIntersecting;
    if (filmInView && filmRequested && !document.hidden) playAmbient();
    else ambient.pause();
  }, { threshold: .1 }).observe($('.arrival-stage'));
  const begin = () => {
    if (reduced || connection?.saveData || /2g/.test(connection?.effectiveType || '') || !filmInView) return;
    filmRequested = true;
    playAmbient();
  };
  if (document.readyState === 'complete') begin();
  else addEventListener('load', begin, { once: true });
  pauseButton?.addEventListener('click', () => {
    if (ambient.paused) { filmRequested = true; playAmbient(); }
    else { filmRequested = false; ambient.pause(); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) ambient.pause();
    else if (filmRequested && filmInView) playAmbient();
  });
}

const mm = gsap.matchMedia();
mm.add('(prefers-reduced-motion: no-preference)', () => {
  $$('[data-rise]').forEach(element => {
    gsap.fromTo(element, { y: 28 }, { y: 0, duration: 1.1, ease: 'power3.out', immediateRender: false, scrollTrigger: { trigger: element, start: 'top 93%', once: true } });
  });
  $$('[data-parallax] img').forEach(element => {
    gsap.fromTo(element, { scale: 1.06, yPercent: -2 }, { scale: 1.06, yPercent: 2, ease: 'none', scrollTrigger: { trigger: element.parentElement, start: 'top bottom', end: 'bottom top', scrub: .7 } });
  });
});
mm.add('(min-width: 1001px) and (prefers-reduced-motion: no-preference)', () => {
  const arrival = $('.arrival');
  if (!arrival) return;
  arrival.classList.add('is-cinematic');
  const controls = $$('.arrival-copy, .arrival-bottom, .motion-toggle');
  const timeline = gsap.timeline({ scrollTrigger: { trigger: arrival, start: 'top top', end: 'bottom bottom', scrub: .55, onUpdate: self => {
    arrival.dataset.theme = self.progress > .35 ? 'light' : 'media';
    controls.forEach(element => { element.inert = self.progress > .3; });
    updateNav();
  } } });
  timeline.fromTo('.arrival-side', { opacity: 0 }, { opacity: 1, duration: .15, ease: 'none' }, .85);
  timeline.to('.arrival-window', { clipPath: 'inset(15% 28% 10% 28% round 46% 46% 1px 1px)', ease: 'none', duration: 1 }, 0);
  timeline.to('.arrival-copy', { opacity: 0, y: -65, ease: 'none', duration: .35 }, 0);
  timeline.to('.arrival-bottom', { opacity: 0, ease: 'none', duration: .2 }, 0);
  timeline.to('.motion-toggle', { opacity: 0, ease: 'none', duration: .2 }, 0);
  return () => {
    arrival.classList.remove('is-cinematic');
    arrival.dataset.theme = 'media';
    controls.forEach(element => { element.inert = false; });
    gsap.set(['.arrival-window', '.arrival-copy', '.arrival-bottom', '.motion-toggle', '.arrival-side'], { clearProps: 'all' });
    updateNav();
  };
});
media.addEventListener('change', event => {
  reduced = event.matches;
  if (reduced) { lenis?.destroy(); lenis = undefined; ambient?.pause(); filmRequested = false; }
});
document.fonts.ready.then(() => { ScrollTrigger.refresh(); updateNav(); });
addEventListener('load', () => { ScrollTrigger.refresh(); updateNav(); }, { once: true });

const experienceCopy = [
  { title: 'A little wonder.', italic: 'Every single day.', text: 'Music, colour and the living traditions of Rajasthan.' },
  { title: 'Breathe a little deeper.', italic: 'Stay a little longer.', text: 'Sunrise yoga and quiet moments beside the Bay of Bengal.' },
  { title: 'A ritual worth', italic: 'slowing down for.', text: 'Palace high tea, warm conversation and the charm of a Rajasthani folk performance.' },
];
$$('[data-experience]').forEach(button => button.addEventListener('click', () => {
  const index = Number(button.dataset.experience);
  const copy = experienceCopy[index];
  $$('.experience-bg').forEach((image, i) => image.classList.toggle('active', i === index));
  $$('[data-experience]').forEach((item, i) => item.setAttribute('aria-pressed', String(i === index)));
  const heading = $('[data-experience-copy] h2');
  heading.replaceChildren(document.createTextNode(copy.title), document.createElement('br'));
  const emphasis = document.createElement('em'); emphasis.textContent = copy.italic; heading.append(emphasis);
  $('[data-experience-copy]>p').textContent = copy.text;
  $('.experience-counter').textContent = `0${index + 1} / 03`;
}));

$$('[data-filter-scope], [data-search-scope]').filter((scope, index, all) => all.indexOf(scope) === index).forEach(scope => {
  const input = $('[data-search]', scope);
  const buttons = $$('[data-filter]', scope);
  const items = $$('[data-filter-item], [data-search-item]', scope).filter((item, i, all) => all.indexOf(item) === i);
  const filter = () => {
    const selected = buttons.find(button => button.getAttribute('aria-pressed') === 'true')?.dataset.filter || 'all';
    const query = (input?.value || '').trim().toLocaleLowerCase();
    let visible = 0;
    items.forEach(item => {
      const category = item.dataset.category || '';
      const matches = (selected === 'all' || category === selected) && (!query || item.textContent.toLocaleLowerCase().includes(query));
      item.hidden = !matches;
      if (matches) visible++;
    });
    const empty = $('[data-empty]', scope); if (empty) empty.hidden = visible > 0;
    ScrollTrigger.refresh();
  };
  buttons.forEach(button => button.addEventListener('click', () => {
    buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    filter();
  }));
  input?.addEventListener('input', filter);
});
$$('details').forEach(element => element.addEventListener('toggle', () => ScrollTrigger.refresh()));

let gallery = [];
let galleryIndex = 0;
function showGallery(index) {
  if (!gallery.length) return;
  galleryIndex = (index + gallery.length) % gallery.length;
  const source = gallery[galleryIndex];
  const img = $('#lightbox figure img');
  img.src = source.dataset.src;
  img.alt = source.dataset.caption || $('img', source)?.alt || 'Kaldan Samudhra Palace';
  $('#lightbox figcaption').textContent = img.alt;
  $('[data-gallery-count]').textContent = `${galleryIndex + 1} / ${gallery.length}`;
}
$$('[data-lightbox]').forEach(button => button.addEventListener('click', () => {
  gallery = $$('[data-lightbox]').filter(item => !item.closest('[hidden]'));
  showGallery(gallery.indexOf(button));
  openDialog($('#lightbox'), button);
}));
$('[data-gallery-prev]')?.addEventListener('click', () => showGallery(galleryIndex - 1));
$('[data-gallery-next]')?.addEventListener('click', () => showGallery(galleryIndex + 1));
$('#lightbox')?.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft') { event.preventDefault(); showGallery(galleryIndex - 1); }
  if (event.key === 'ArrowRight') { event.preventDefault(); showGallery(galleryIndex + 1); }
});

const params = new URLSearchParams(location.search);
$$('[data-enquiry]').forEach(form => {
  const interest = $('[name=interest]', form);
  const message = $('[name=message]', form);
  const preset = params.get('interest');
  if (preset && [...interest.options].some(option => option.value === preset)) interest.value = preset;
  if (params.get('room')) message.value = `I would like to enquire about ${params.get('room').slice(0, 100)}.`;
  const date = $('[name=date]', form);
  const today = new Date();
  date.min = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const status = $('.form-status', form);
  $('[data-email-enquiry]', form).addEventListener('click', () => {
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    const body = ['name', 'email', 'phone', 'interest', 'date', 'guests', 'message'].map(key => `${key}: ${values.get(key) || 'Not specified'}`).join('\r\n');
    location.href = `mailto:reservations.samudhra@kaldanhotels.com?subject=${encodeURIComponent('Palace visit enquiry')}&body=${encodeURIComponent(body)}`;
    status.textContent = 'Your email app should open a draft. Review it and send it there; this website has not sent your enquiry.';
  });
  $('[data-download-enquiry]', form).addEventListener('click', () => {
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    const text = ['Kaldan Samudhra Palace — Enquiry', '', ...['name', 'email', 'phone', 'interest', 'date', 'guests', 'message'].map(key => `${key}: ${values.get(key) || 'Not specified'}`), '', 'Please send this enquiry to reservations.samudhra@kaldanhotels.com. This document is not a reservation confirmation.'].join('\r\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'kaldan-enquiry.txt'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'Your enquiry file is ready. Email it to the reservations team; it has not been sent automatically.';
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const submit = $('button[type=submit]', form);
    submit.disabled = true; status.textContent = 'Sending your enquiry…';
    try {
      const payload = Object.fromEntries(new FormData(form));
      const response = await fetch('/api/enquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok || data.ok !== true) throw new Error(data.message || 'Online delivery is currently unavailable. Please email or call the reservations team.');
      status.textContent = data.message || 'Your enquiry was accepted for sending. This is an enquiry, not a confirmed reservation.';
      trackKaldanEvent('generate_lead', { lead_type: interest.value || 'general' });
      form.classList.add('is-sent');
      form.reset();
    } catch (error) {
      status.textContent = error instanceof Error && !/JSON|Unexpected token|fetch/i.test(error.message) ? error.message : 'Online delivery is not available in this preview. Please download your enquiry or contact reservations directly.';
    } finally { submit.disabled = false; }
  });
});
