# Website Transformation Playbook
### The Kaldan Method — how a dated template site becomes an authored, cinematic, measurable digital experience

**Version:** 2026-11-10 · **Reference implementation:** `kaldanhotels.com` → `kaldan-site/` in this repo
**This file is a self-contained briefing.** Paste it (with a target website URL) into any LLM or agency session and it can execute the same transformation for any industry, with a different visual theme, plus the market-research and reporting layer.

---

## PART 1 — WHAT THE TRANSFORMATION IS (the concept)

### 1.1 Purpose
Take a client's existing website — usually a template-built CMS site that *presents information* — and rebuild it as an *authored experience* that:

1. **Tells the brand's story** in an editorial, cinematic way (scrollytelling, photography-led, one strong narrative arc), not a grid of generic blocks.
2. **Converts deliberately**: every page ends in the same few revenue actions (reserve / enquire / contact), each measurable in analytics.
3. **Is instrumented from day one**: consent-gated behavioural analytics wired into GTM/GA4 so UX and marketing decisions come from data, not taste.
4. **Is market-intelligent**: built alongside a dated fact-pack of the client's public digital footprint (ratings, reviews, social presence, competitor positions) so the engagement can be *sold monthly* — baseline vs. delta reporting.
5. **Stays commercially respectful**: shipped as a `noindex, nofollow` concept until the client formally approves content, imagery rights and policy wording. It is presented as a design proposal, never as the official site.

### 1.2 The one-line pitch formula
> "Your reputation is already excellent; the *experience and measurement* behind it are dated. We rebuild the experience (faster, more beautiful, story-driven), wire measurement into it (funnel + behaviour analytics), and re-measure your whole digital footprint monthly so progress is provable."

---

## PART 2 — WHAT WE READ FROM THE ORIGINAL SITE (discovery method)

The original `kaldanhotels.com` (Simplotel CMS) gave us everything we needed *without inventing anything*:

| What we pulled | Where | How it was used |
|---|---|---|
| All 15 pages (About, Rooms ×8, Dining outlets, Weddings, Events, Experiences, Activities, Gallery, Location, Contact, FAQs, Terms, Blog) | Site nav + sitemap.xml | Same content map, same deep URLs → no SEO-breaking new taxonomy (plus `llms.txt`-style AI readability) |
| Full room copy, sizes, occupancies, amenity lists (8 room categories) | Accommodations HTML | Stored verbatim (with source URLs) in `src/data/hotel-content.json` — content provenance is tracked per block |
| Brand facts: 10-acre Rajasthani palace, ECR/Bay of Bengal, Taj-inspired "Immortal Palace", "Service from the heart" / JUJU ethos, opening 9 Dec 2021 | About pages | Became the narrative spine and headline copy |
| Real photography (their own Simplotel asset library) | `assets.simplotel.com` | Reworked into responsive WebP set with descriptive alt text |
| Booking engine deep link | `bookings.kaldanhotels.com/?propertyId=9858` | Every CTA point to *their own live engine* — nothing fake in the funnel |
| Contact/phone/address | Contact page | Footer, menus, enquiry fallbacks |

**Rule: the client's own content is the raw material.** Transformation = re-architecture + re-expression, not re-authoring facts.

---

## PART 3 — THE DESIGN LANGUAGE (what makes the "after" feel the way it does)

### 3.1 Aesthetic summary
**Quiet luxury, editorial and cinematic.** A palace at dusk: dark teal-green rooms of calm, ivory pages of light, brass-gold accents used sparsely like gilding, and photography treated as the ornament instead of decorative chrome. It reads like a coffee-table book that sells rooms — every screen answers "what does it feel like to be there?" before "what does it cost?"

### 3.2 Palette (from `src/styles/tokens.css` — five colours, strictly scoped)
- `--palace/--palace-deep` deep teal-green (#1e3b3d/#16292b) — dark authority sections (Stay, Celebrate, footer)
- `--ivory/--ivory-2/--ivory-3` (#f4efe6 → #ded4c1) — light editorial sections (story, dining, journal)
- `--gold/--gold-bright` (#c1a477/#d9bd90) — gilding: eyebrows, rules, buttons, crests
- `--gold-deep` (#7f6035) — **accessible bronze** for gold-family text on ivory (5.1:1 AA) — accessibility is built into the token itself
- `--clay` (#a56c51) — warm terracotta for human touches
- Light/dark sections declare `data-theme="light|dark|media"`; the **header inverts itself automatically** as you scroll across section boundaries (a `scroll` listener probes which theme is under the header's midpoint). This one mechanism is what makes the site feel "directed" rather than assembled.

### 3.3 Typography
- **Display serif:** "Montel" with Cormorant Garamond fallback — high-contrast romantic serif, used at `clamp(2.9rem, 7.2vw, 5.75rem)` with tight leading (`0.98`) for a monumental, film-poster feel.
- **UI sans:** Manrope — restrained, slightly rounded, all the labels/buttons/body.
- **Voice pattern:** two-beat headlines where the second beat is italic and softer — *"Some places are visited. / *Others are felt.*"* — repeated across every section. This is the single strongest stylistic fingerprint; copy it.
- Eyebrows are numbered chapters (`01 / The palace`, `02 / Rooms, suites & villas` … `06 / The palace journal`) — the homepage is literally a short story with numbered acts.
- Fonts are self-hosted WOFF2, preloaded in `<head>` — no FOUT, no Google-Fonts privacy leak.

### 3.4 Layout system
- Max width 1440px, gutters `clamp(1.25rem, 4vw, 4rem)`, reading measure 58ch.
- Space scale s1–s10 (0.5rem → 12rem) — sections breathe in *tens of rems*, never cramped.
- A hand-drawn SVG **crest** (palace-gable monogram) is the only "logo ornament" — decoration is earned, minimal, single-colour (currentColor), so it adapts to theme.

---

## PART 4 — MOTION, SCROLL & INTERACTION INVENTORY (the actual behaviours)

Stack: **Lenis** (smooth scroll, 1.05s duration, only for fine pointers) + **GSAP + ScrollTrigger**. Everything is disabled under `prefers-reduced-motion` and on touch/low-power conditions. Inventory:

| # | Behaviour | Implementation | Purpose |
|---|---|---|---|
| 1 | **Hero "arrival": full-bleed ambient film** in a clip-path window, autoplay-on-load only if network isn't save-data/2G and section in view; mobile gets a smaller swap file (`palace-loop-mobile.mp4`) | `IntersectionObserver` + `navigator.connection` + user-controlled Pause/Play button with `aria-pressed` | Instant "we are somewhere else" first impression; user consent to motion respected |
| 2 | **Cinematic scroll scrub (desktop only)**: as you scroll story "side" copy, the hero window contracts (`clip-path: inset(... round 46% 46% 1px 1px)` mid-scroll — rounded top like an arch), hero copy lifts and fades, side rail fades in; theme flips mid-scroll; copy is made `inert` at depth | GSAP timeline, `scrub: .55`, progress > 0.3/0.35 thresholds | The palace "closing in behind you" sensation — the signature moment |
| 3 | **Rise reveals**: every `[data-rise]` element starts 28px down, eases up (`power3.out`, 1.1s) once, at 93% viewport | `gsap.fromTo` + `once: true` | Content arrives breath by breath, never bouncy |
| 4 | **Parallax imagery**: `[data-parallax] img` scales 1.06 and drifts −2%→+2% `yPercent`, scrubbed 0.7 to section bounds | ScrollTrigger scrub | Photography feels physical, like glass over depth |
| 5 | **Theme-morphing sticky header**: data-theme probe + `.scrolled` compact state at 30px; on overshoot the header re-inks to match the section beneath it | rAF-throttled scroll handler | The "chameleon chrome" trick — deserves copying in every build |
| 6 | **Experience switcher**: full-section background crossfade between 3 experiences; buttons swap headline (title + italic beat), copy, counter `01/03`; `aria-pressed` + `aria-live="polite"` counter | dataset-driven state, `replaceChildren` for text nodes (XSS-safe) | Story interactivity without a carousel library |
| 7 | **Rooms "horizontal journey"** on dark ground: numbered features (`01 / Rooms`, `02 / Suites`, `03 / Villas`) as photographic cards with round-arrow affordance | CSS grid + staggered reveals | Selection pressure on the booking path |
| 8 | **Native `<dialog>` system** (menu, reserve-assist, lightbox, film player): focus moves in and back out, body scroll stops (lenis.stop), backdrop-click closes, videos auto-pause on close, Escape works for free | `<dialog>` + small JS | Zero modal libraries; accessibility is structural, not patched |
| 9 | **Filterable/searchable lists** (rooms, blogs, gallery): `aria-pressed` filter chips + live text search + empty-state handling + `ScrollTrigger.refresh()` after each toggle | delegated dataset filter | "CMS-like" behaviour in a static site |
| 10 | **Keyboard-driven lightbox gallery** with prev/next, counter, captions | keydown on dialog | Editorial polish that competitors' sites lack |
| 11 | **Scroll-depth telemetry**: rAF-throttled, fires once per 25/50/75/90% | custom events → dataLayer | The feed that proves engagement in reports |
| 12 | ** enquiry form with three exits**: framework-correct POST to `/api/enquiry`, plus "open email draft" (mailto compose) and "download enquiry .txt", honeypot field, consent checkbox, `generate_lead` event on success, date min=today, `?room=`/`?interest=` URL prefill from other pages | `/api/enquiry` (Resend-ready but dormant without API keys) + fallbacks | A lead machine that still works with zero backend dependencies |

**Motion vocabulary tokens:** `--dur-micro 220ms / --dur-ui 420ms / --dur-reveal 900ms / --dur-cinema 1400ms`, two easings only (`ease-out: cubic-bezier(.16,1,.3,1)`, `ease-inout`). Uniform durations and the two easing curves are what make it feel *directed* instead of animated.

**Constraint stack (non-negotiable):** `prefers-reduced-motion` fully honoured; `pointer:fine` gate for Lenis; network-aware film loading; touch never smooth-scrolled; all reveals `once: true` (no re-animation on rescroll); `immediateRender:false` everywhere; AA contrast verified in tokens (the bronze token literally documents its ratio).

---

## PART 5 — ENGINEERING ARCHITECTURE (why it's fast and safe)

1. **Zero-CMS, zero-client-JS-framework.** A build script (`render.mjs`) reads one content file (`src/data/hotel-content.json`) + page generators (`src/render/home.mjs`, `pages.mjs`, shared helpers `ui.mjs`) and emits **plain multi-page HTML** (`/accommodations/`, `/dining/dhani/`, …) + `routes.json` for the server. Vite only bundles `main.js` (Lenis+GSAP, ~40KB gz total). Result: Lighthouse 100/100/100, 97/97 automated tests, near-instant LCP.
2. **Single source of truth for content.** `hotel-content.json` holds rooms (with `source:` URLs per entry), articles, testimonials, contact. Rewriting copy or adding a room never touches templates. (This is what makes the method portable to ANY industry — swap the JSON, keep the machine.)
3. **Responsive imagery discipline.** One `image()` helper emits `srcset` 800w/1600w WebP + `sizes`, explicit `width/height` (no CLS), `loading=lazy` / `fetchpriority=high` for heroes.
4. **Server (`server.mjs`)**: static file serving + `PORT/HOST/PUBLIC_ORIGIN` env contract (origin must be an exact origin without trailing slash — this bit us once on Render); `/api/enquiry` endpoint dormant without `RESEND_API_KEY`. Deploys on Render as a Node web service (`npm ci && npm run build`, start `node server.mjs`).
5. **SEO & AI readability**: per-page title/description, breadcrumbs, semantic landmarks, skip link, `robots` meta — but currently `noindex, nofollow` because **this is the concept build**; real launch flips one token *after* hotel approval of content/image rights/policy wording. (Marketing-asset pages legitimately ship noindex in this arrangement.)
6. **Analytics bridge**: NO third-party tags are loaded by default. The consent manager (hotel-owned) sets `window.kaldanAnalyticsConsent = true` and loads GTM/GA4 only after opt-in; every `trackKaldanEvent` push is a no-op until then. **Consent-first by structure, not by policy document.**

---

## PART 6 — EVENT TAXONOMY (the measurement layer)

All events flow into the hotel's existing `dataLayer` (GTM `GTM-XXXX`, GA4 `G-XXXX`) — reusing their paid stack, no new tools to buy:

| Event | Fires when | Answers (business question) |
|---|---|---|
| `booking_start` | Reserve clicked → hotel's own booking engine | Which pages create intent to pay? |
| `booking_assist_open` | Reserve-assist dialog opened | Hesitation points near CTA |
| `cta_click` / `navigation_click` | Buttons/header/menu | Which stories funnel toward action |
| `experience_select` (with index) | Experience switcher used | Interactive-interest evidence |
| `palace_film_open` / `hero_film_toggle` | Film lightbox / hero control | Media positioning value |
| `scroll_depth` (25/50/75/90, once each) | rAF-throttled scroll | Content depth reached per page — the Core Web Vitals of *narrative* |
| `generate_lead` (lead_type) | Enquiry submitted | Lead volume by interest type |

Plus Phase-0 external telemetry for the monthly report: TripAdvisor rank & count, Booking/Agoda/Goibibo scores, Instagram/YouTube growth, Reddit/Quora mention count, Google AI-mention scoreboard. The **internal funnel + external footprint** together are the retainer dashboards.

---

## PART 7 — THE RESEARCH & BUSINESS LAYER (how each project is also sold)

Every transformation project ships three documents (see `kaldan-intel/` in the repo for the Kaldan exemplars):

1. **Phase 0 — Baseline fact pack** (date-stamped, URL-cited, facts only): platform/CMS identification; robots/sitemap/llms.txt; schema types present; analytics tags present; review scores & ranks on each booking platform; social follower counts, cadence and content mix; zero-presence channels; stale-content evidence.
2. **Phase 1 — Opportunity map** (each item cites a Phase 0 fact): analytics funnel proposals, SEO/content gaps, GEO/AI-visibility scoreboard, social channel plays, revenue levers, month-by-month execution plan.
3. **Client report** (polished, client-safe tone): their wins first, gaps framed as opportunities, the 90-day plan, "what we need access to". HTML one-pager is ideal — presentable full-screen or print-to-PDF.

**Commercial thesis:** the *free meeting* is the report; the *paid work* is (a) the rebuild, then (b) monthly baseline-vs-delta reporting + funnel ops. The same measurement table re-run monthly is what keeps the engagement alive 2–3+ months — not hustle, provability.

---

## PART 8 — THE REUSABLE EXECUTION RECIPE (Phase A→H, any industry)

**Phase A — Research (facts before opinions).** For the client's domain: robots.txt, sitemap, llms.txt, current CMS fingerprint, schema (`application/ld+json` @type counts), analytics tags present (GTM/GA/Pixel/Hotjar/Clarity), page inventory, og/canonical/viewport presence. External: TripAdvisor/Google/Booking/Agoda/local-comparable scores and ranks; Instagram/YouTube/Facebook/LinkedIn counts and cadence; competitor rank positions; Reddit/Quora mention counts. Date-stamp and URL-cite **everything**. Save as Phase 0 pack.

**Phase B — Content harvest.** Pull the site's real copy/facts/media into `content.json` with per-item `source` URLs. Never invent spec numbers. Note what's stale/dated (that's tomorrow's "quick-win" evidence).

**Phase C — Derive the theme.** Interrogate the brand's own materials (photos, awards, founder story, guest tone).

- Pick 4–6 colours max + one deep "authority" tone + one light "editorial" tone + one metallic accent + an accessible variant of the accent (AA token).
- Pick display serif + UI sans; define the two-beat headline pattern; decide the metaphor (Kaldan = "arriving at a palace" / arrival-window clip-path; a fintech would be "a glass tower rising"; a clinic = "morning light"; a kitchen/apparel brand = "warm craft").
- Write the numbered-acts outline for the homepage (5–7 acts: arrival → identity → product world → sensory proof → emotional peak → trust/journal → invitation).

**Phase D — Build.** Content JSON + generator functions → static multi-page HTML; tokens.css (colour/type/space/motion/z-index); base.css (reset, prose, buttons, dialog); sections.css (per-act styling); `main.js` (interaction set from Part 4, adapted); `ui.mjs` helpers (esc, image, link, form); Vite; server.mjs; 97-test QA suite; Lighthouse gates: A11y 100, Best-practices 100, SEO 100, Perf ≥95 mobile.

**Phase E — Approvals & launch discipline.** Ship noindex/nofollow; walkthrough with client; request sign-off on content accuracy, image rights, policy/legal wording, contact routing, consent text; flip to indexable; submit sitemap; connect/re-point GTM & GA4; verify funnel events in DebugView.

**Phase F — Instrument & verify.** Enable the event taxonomy; verify booking events reach the real engine; deploy Clarity (free) after consent; weekly funnel dashboard (source → sessions → booking_start → generate_lead).

**Phase G — Monthly operation.** Re-run Phase 0 table → delta report; publish AI-mention scoreboard; review-score velocity; content freshness wins; offer parity checks; 3 priorities for next month.

**Phase H — Growth and stay-installed strategy.** The rebuilt site + monthly measured deltas make replacing you expensive; adding channels (Reddit/Quora seeding, Shorts pipeline from existing video assets, review-multiplication, schema additions) compounds.

---

## PART 9 — PASTE-READY TRANSFORMATION PROMPT (fill the brackets)

> I'm giving you a website-transformation brief that must follow the playbook below. Target: **[client URL]**. Industry: **[industry]**. Client evidence hooks we already know: **[awards, differentiators, famous product lines]**. Competitors to benchmark: **[3–5 names]**. Budget/asking engagement: **[one-time rebuild + 2–3 month retainer]**.
> Execute in order:
> 1) **Intelligence Phase 0** — produce the dated, URL-cited fact-pack per PART 8-A (include robots.txt/sitemap/llms.txt/schema types/analytics tags/CMS fingerprint/public platform scores/ranks/social counts/cadence/Reddit-Quora presence/stale-content notes).
> 2) **Content harvest Phase B** — extract the client's real copy/specs/media into a `content` JSON with per-block `source` URLs; flag stale/dated material as quick-win evidence.
> 3) **Theme derivation (PART 8-C)** — propose 4–6 colours (with the AA-accessibility variant of the accent), display-serif + UI-sans pairing, the two-beat headline voice, page-metaphor for **[industry metaphor]**, and the numbered-acts homepage outline (5–7 acts). Give me this as a review before code.
> 4) **Build Phase D** — tokens.css + base.css + sections.css + single interaction module; implement PART 4 behaviours exactly (Lenis+GSAP only on fine pointers, theme-morphing sticky header via `data-theme` probe, once-only data-rise reveals, parallax scrub, native `<dialog>` modals with focus return, filter/search scope pattern, rAF-throttled scroll-depth telemetry, consent-gated `trackEvent` bridge); render static multi-page HTML from the content JSON; responsive WebP imagery with explicit dimensions; noindex until approval; Lighthouse gates A11y/BP/SEO 100.
> 5) **Deliverables** — Phase 0 pack, Phase 1 opportunity map (recs must cite Phase 0 facts), client-facing HTML one-pager, internal contacts/decision-map, the QA/test suite, and monthly reporting template (baseline table → delta columns).
> Constraints: never a fake funnel — every CTA must route to the client's *actual* engines/contacts; no third-party tracker loads until the client's consent manager grants analytics consent (`window.analyticsConsent === true && Array.isArray(window.dataLayer)`); hotel/legal/brand approvals obtained before removing `noindex, nofollow`; all imagery rights stay with the client; present internally as concept work until approved.

---

## PART 10 — Ethical & operational guardrails (carry these to every client)

- **Never present the concept as the official site.** Concept footer states it plainly ("Independent design concept — not the official website"); launch only after approval, then remove the disclaimer.
- **No invented facts** — room specs, award names, prices must come from client materials (traceable via `source` URL) or the client confirms them.
- **Consent is structural**: no analytics runs until consent granted by the client's own manager; no PII in events.
- **Benchmarking uses public pages only** — no scraping gated content, no ToS-violating harvesting; blocked channels are documented as pending, never guessed.
- **Anti-bot honesty**: measurement methodologies that work (browser passes, DDG-HTML until rate-limit) should be noted in Phase 0 so monthly re-measurement is reproducible rather than secretly lucky.

---

*Provenance: this playbook is extracted from the completed Kaldan rebuild in this repo — `kaldan-site/` (production build), `kaldan-intel/` (research exemplars), `README.md` (intent), and Lighthouse/test results (A11y 100, BP 100, SEO 100, 97/97 tests). Any LLM that receives this file + a URL + an industry can produce Phase A–F coherently; Part 9 is the direct prompt.*
