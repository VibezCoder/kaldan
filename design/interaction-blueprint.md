# Kaldan Samudhra — Interaction Blueprint & Creative Direction

**Status:** proposal for approval · **Date:** 7 Nov 2026
**Inputs:** live site audit (measured), `reference website analysis.md`, `redefined images/` (7 interactions + 3 modes), `kaldan content.md` media library
**Gate:** per the reference brief, no site code is written until this is approved.

---

## 0. What changed since the audit

The audit measured the current homepage. This document turns those measurements into a design. Nothing here is "make it look premium" — every decision below is a response to something measured, or a deliberate extraction from a reference.

**Media library is ready.** 145 usable photographs (61 MB) + 11 video files (169 MB), organised into six categories, described in `media/kaldan-media-inventory.xlsx`. Every section below is built from assets that actually exist.

---

## 1. What the references actually are (verified vs inferred)

I checked the three sites directly rather than assuming.

| Reference | Verified | Not verified |
| --- | --- | --- |
| **The Vineyard Hotel** | WordPress. **Lenis** smooth scroll, **Barba.js** page transitions, **Swiper** carousels. Vimeo HLS films + a pool reel MP4. Type set in **Optima** and **Mori**. Chapter structure: Sleep / Eat / Play / Meet. | The 3D walkthrough was not inspected. |
| **Hotel du Tasso** | — | **The site returned HTTP 520** (Cloudflare origin error). I could not inspect it at all. Everything attributed to Tasso below comes from your written analysis, not from my own verification. |
| **Casa Momo** | Built in **Framer** (React), **Lenis** smooth scroll, no MP4s — image-led. Single H1. | The scroll-expansion behaviour was not inspected frame by frame. |

Two of three run **Lenis**. That is the one technical signature worth adopting, because it addresses the smoothness complaint directly.

> Honesty note: the interaction library in your brief was itself labelled *"a proposed adaptation, not a claim that every listed animation was verified."* I'm keeping that distinction. Sections marked **inferred** are design decisions derived from references and screenshots, not observations of live behaviour.

---

## 2. Division of influence

| Reference | Weight | What it governs |
| --- | --- | --- |
| Hotel du Tasso | **40%** | Editorial typography, restraint, composition, white space, chapter pacing |
| The Vineyard | **35%** | Scale and immersion, aerial/architectural photography, property-as-experience |
| Casa Momo | **25%** | Warmth, intimacy, personal voice, alternating compositions |

The percentages are a working weighting, not a measurement.

---

## 3. Interaction extraction matrix

Seven interactions, mapped to Kaldan and to the seven files in `redefined images/`.

### 01 · Cinematic hero takeover → `01. Cinematic hero takeover.jpg`
- **How it works:** full-viewport film or slow-moving still; headline reveals line by line; the background scales ~1.0→1.08 as you scroll; nav starts transparent and settles into a solid bar; the hero dissolves or wipes into the next chapter.
- **Why it's effective:** it establishes scale before asking for anything.
- **Kaldan section:** §01 Arrival.
- **Adaptation:** the film is 1500×626 and 18.7 MB — wrong shape, wrong weight. Use `kaldan_palace_overview_compressed` as a muted, looping background *behind* a full-bleed poster frame, and on mobile fall back to the aerial still (`an-aerial-shot-of-the-beautifully-lit-in-mahabalipuram...`) with a slow 12 s ken-burns. Headline in the hero, not below it.
- **Priority: Essential.**

### 02 · Editorial typography reveals → `02. Editorial typography reveals.jpg`
- **How it works:** headings uncovered by a clipping mask; words stagger in; section labels stay small; a large statement can hold the viewport alone.
- **Why:** gives type authority without decoration.
- **Kaldan section:** every chapter opener, plus §02 The Story.
- **Adaptation:** Montel already carries the brand. Reveal each headline with `clip-path: inset(0 0 100% 0)` → `inset(0)` over 900 ms, staggered 60 ms per line. Labels: 11 px Manrope, 0.14 em tracking, uppercase.
- **Priority: Essential.**

### 03 · Pinned photographic storytelling → `03. Pinned photographic storytelling.jpg`
- **How it works:** the image stays fixed while text and detail images change; the section releases and the image expands onward.
- **Why:** it slows the visitor down at the point where the property needs explaining.
- **Kaldan section:** §03 The Estate.
- **Adaptation:** pin `a-stunning-wide-angle-view-of-our-palace-with-a-grand-central-pool-fra` full-bleed, while three short texts cross-fade — *10 acres · Rajasthani craft · Bay of Bengal* — with a detail image swapping inside a smaller frame. Release into the Statement interlude.
- **Priority: Essential**, used **once**.

### 04 · Horizontal image journey → `04. Horizontal image journey.jpg`
- **How it works:** vertical scroll drives a horizontal gallery; captions and numbering change per frame; then it returns to vertical.
- **Why:** good for comparing like-with-like (a room category run).
- **Kaldan section:** The Stay — the seven room types.
- **Adaptation:** seven cards, each with name, size and a single line. Native horizontal scroll on touch; scroll-jacked on desktop only, and only for this one section.
- **Priority: Important.** Your brief says "selective use" — this is the only horizontal moment on the site.

### 05 · Image expansion and reveal → `05. Image expansion and reveal.jpg`
- **How it works:** images enter inside a rounded, inset frame and expand toward full-bleed as they cross the viewport; slight scale while entering.
- **Why:** it makes photography feel alive without parallax noise.
- **Kaldan section:** Experiences, Dining, Celebrations.
- **Adaptation:** start `border-radius: 24px`, 78% width, `scale(0.96)`, opacity 0.6 → animate to 100% width, radius 0, scale 1, opacity 1 across the entry threshold. One shared utility so it behaves identically everywhere.
- **Priority: Essential.**

### 06 · Transitional statement → `06. Transitional statement.jpg`
- **How it works:** the previous chapter recedes; a full-screen statement appears in oversized type; it dissolves as the next chapter rises.
- **Why:** it creates emotional punctuation and separates modes.
- **Kaldan section:** between chapters — most importantly *"Service from the heart — grandeur, held lightly."*
- **Adaptation:** deep teal ground, ivory Montel at `clamp(2.5rem, 5vw, 4.5rem)`, centred, max 18 words. Used **three times**, never more: after The Estate, after The Stay, before the Invitation.
- **Priority: Essential.**

### 07 · Cursor and hover interactions → `07. Cursor and hover interactions.jpg`
- **How it works:** a custom cursor over photography; a "View" indicator; subtle image scale; animated underlines.
- **Why:** it rewards exploration on desktop.
- **Kaldan section:** gallery strips, dining cards, experience tiles.
- **Adaptation:** **desktop + fine pointer only.** The native cursor stays visible (a 12 px gold dot follows it); `@media (hover:hover) and (pointer:fine)` guard; disabled entirely under reduced-motion. No cursor replacement — your brief's warning about interfering with navigation is right.
- **Priority: Optional.** Ships last, and only if it doesn't hurt performance.

---

## 4. The three emotional modes

This is the organising idea, taken from your brief's closing recommendation and from the three named files in `redefined images/`.

| Mode | File | Feel | Chapters | Visual rules |
| --- | --- | --- | --- | --- |
| **Expansive** | `Expensive.jpg` | Scale, air, awe | Arrival · The Estate · Panch Mahal | Full-bleed, deep teal ground, wide aerial/architectural frames, slow motion (1200 ms+), large Montel |
| **Intimate** | `intimate.jpg` | Quiet, close, human | The Stay · Service · Testimonials | Ivory ground, portrait crops, narrow measure (≈58 ch), small type, still images, 600–900 ms |
| **Sensory** | `sensory.jpg` | Warm, saturated, alive | Dining · Experiences · Celebrations · Invitation | Near-black or terracotta ground, video, food and candlelight, faster cuts (400–700 ms), gold accents |

**The transitions between modes are the design.** Each chapter boundary is marked by a Statement interlude that changes ground colour, type scale and motion speed together. That is what stops the page feeling like a stack of blocks — the flaw in the current site, where every section is the same white ground with the same rhythm.

---

## 5. Section-by-section blueprint

Ten sections. Each entry: purpose, mode, interaction, assets from the library, motion, mobile behaviour.

### §01 · Arrival — *Expansive*
- **Job:** establish scale and make the promise; no booking controls in the way.
- **Interaction:** 01 cinematic hero takeover.
- **Asset:** `kaldan_palace_overview_compressed_1a13rr.mp4` (muted, loop, `playsinline`, poster from the aerial still); mobile poster `facade-entrance/an-aerial-shot-of-the-beautifully-lit-in-mahabalipuram-surrounded-by-l.webp`.
- **Layout:** 100 svh. Nav transparent over it. Headline occupies the lower-left third, not the centre.
- **Copy:** H1 *"An Immortal Palace by the Sea"* — in the hero, at last. Support line: *Kaldan Samudhra Palace · Mahabalipuram*. One restrained `Reserve` link, one `Explore` scroll cue.
- **Motion:** headline lines clip-reveal at 0/120/240 ms; background scales 1→1.08 across the first 900 px of scroll; a 1 px gold rule draws under the support line.
- **Mobile:** poster + ken-burns instead of video (saves ~18 MB); headline 2 lines; no scroll cue.
- **Fixes:** the 577 px hero, the h1 at y=776, the booking widget on top of the film.

### §02 · The Story — *Intimate*
- **Job:** say what the place *is* before showing what it has.
- **Interaction:** 02 editorial typography reveals.
- **Assets:** `facade-entrance/a-reception-area-with-a-reception-desk-receptionists-and-a-giant-chandelier.webp`, `facade-entrance/open-air-high-tea-area-with-majestic-architecture-under-a-serene-sky.webp`.
- **Layout:** asymmetric two-column — 5/12 text left, 7/12 image right, image offset down 96 px. Short paragraphs, 58 ch measure.
- **Copy:** *"Ten acres of Rajasthani craft, Mughal geometry and the Bay of Bengal — built as a palace, run as a home."*
- **Motion:** text line-reveal; image mask-wipe `inset(0 0 0 100%)` → `inset(0)`.
- **Mobile:** stacks; image before text.

### §03 · The Estate — *Expansive*
- **Job:** prove the scale that the hero promised.
- **Interaction:** 03 pinned photographic storytelling.
- **Assets:** pinned `a-stunning-wide-angle-view-of-our-palace-with-a-grand-central-pool-fra.webp`; swapping details `a-view-featuring-a-pool-lit-in-blue-colour...`, `an-image-of-our-palace-pool-with-sun-loungers-and-palm-trees-on-the-de.webp`, `a-reception-area-...-chandelier` .
- **Layout:** pin ~250 vh; three beats — *the approach / the court / the sea*.
- **Motion:** cross-fade 700 ms; counter-scaling detail frame.
- **Mobile:** unpin — a vertical sequence of the same three beats.

### §04 · Statement interlude I — *mode shift*
- *"Service from the heart — grandeur, held lightly."*
- Full-bleed teal, ivory Montel, fades in at 60% viewport, out at 40%.
- **This is the site's signature moment.** It is the one line the whole brand hangs on.

### §05 · The Stay — *Intimate*
- **Job:** make seven room types feel like seven invitations.
- **Interaction:** 04 horizontal image journey + 05 expansion on the intro frame.
- **Assets:** from `accommodations/` — `a-luxurious-bedroom-in-mahabalipuram-with-a-chandelier-...`, `bedroom-with-a-regal-gold-accented-ceiling-...`, `an-elegant-staircase-and-hallway-...` (portrait, 2400×3600), `a-luxurious-bathroom-with-a-petal-decorated-bathtub-...`.
- **Layout:** intro frame + horizontal run of 7 cards (Deluxe Twin → Premium Luxury Villa), each with name, size, view.
- **Motion:** horizontal scroll-jack on desktop, native swipe on touch; card hover lifts 6 px + caption underline.
- **Mobile:** pure native horizontal snap scroll, no JS hijack.

### §06 · Statement interlude II
- *"Ten acres. One palace. No hurry."*

### §07 · Experiences — *Sensory*
- **Job:** show life at the property, not a facility list.
- **Interaction:** 05 expansion + 07 hover.
- **Assets:** `experiences/an-image-of-group-of-friends-enjoying-volleyball-by-the-beach-during-a...`, high tea, folk dance/welcome, yoga, spa.
- **Layout:** editorial mosaic — one wide, two portrait, offset; never a uniform 3-up grid.
- **Motion:** each tile expands on entry, staggered 80 ms; hover scale 1.03.
- **Fixes:** the current "ACTIVITIES FOR ALL AGES" icon grid, which is a list of programme items.

### §08 · Dining — *Sensory*
- **Job:** appetite and atmosphere.
- **Asset:** `sagar_bar_13.mp4` in a contained rounded frame; stills `dining/a-sophisticated-dinner-setup-with-white-flowers-candles...`, `dining/a-romantic-dining-table-...`, `panch-mahal/a-grand-illuminated-gazebo-prepared-for-an-intimate-dinner.webp`.
- **Layout:** four venues — Dhani, Somapuraa, Sagar Bar, Panch Mahal — as alternating full-width bands, each with a short poetic line before the practical detail.
- **Motion:** 05 expansion; video plays only when >50% in view, pauses when out.
- **Mobile:** video replaced by poster still to protect data.

### §09 · Panch Mahal — *Expansive*
- **Job:** the property's most photogenic asset deserves its own chapter.
- **Asset:** `panch_mahal_images_21.mp4` + `panch-mahal/` (18 photos, incl. 2400×3593 gazebo portraits).
- **Layout:** dark ground, three portrait frames side by side on desktop, stacked on mobile.

### §10 · Celebrations — *Sensory*
- **Job:** convert wedding and corporate enquiries — your highest-value lead.
- **Assets:** `event-spaces/grand-ballroom-with-opulent-lighting-...`, `a-mandap-in-the-lawn-...`, `an-pathway-in-the-lawn-with-a-lamp-post-and-towering-arches.webp`; one wedding film (start with the 9.3 MB cut, not the 63 MB one).
- **Motion:** slow horizontal drift on the film frame; expansion on stills.

### §11 · Testimonials — *Intimate*
- **Job:** social proof, quietly.
- **Layout:** one quotation at a time, large Montel italic, ivory ground, name + source beneath. Cross-fade every 7 s, pausable.
- **Fixes:** the current "PRAISES FOR OUR PALACE" block.

### §12 · The Invitation — *Sensory*
- **Job:** one clear next step, two doors.
- **Layout:** full-bleed dusk photograph, statement *"Some places are meant to be experienced."*, then two actions: **Reserve a stay** (primary, filled gold-on-teal) and **Plan a celebration** (ghost). Plus the enquiry form as a third, quieter route.
- **Motion:** 06 statement transition into the footer.
- **Fixes:** the current double-capture collision (email strip + booking widget both on the hero).

### §13 · Footer — *Intimate*
- Ivory or deep teal, four columns: address, contact, the full nav (currently only in the footer), social. Newsletter as a single inline field, not a bar.

---

## 6. Flaw remediation — measure, fix, verify

| # | Measured flaw | Fix in this design | How we verify |
| --- | --- | --- | --- |
| 1 | **CLS 1.0009** | Every media slot has an explicit `aspect-ratio`; hero, carousel and footer reserve height; no injected banners above content; fonts `size-adjust` + `font-display: swap` | Re-measure CLS — target **< 0.1** |
| 2 | **LCP 6260 ms** | Hero poster preloaded (`fetchpriority=high`), video deferred; no hero image over 250 KB; critical CSS inlined | Target **< 2.5 s** |
| 3 | **H1 at y=776**, hero only 577 px | Headline inside a 100 svh hero | Geometry check: h1 within first 600 px |
| 4 | **Booking + email capture stacked on the film** | No form in the hero; one `Reserve` link; enquiry lives at §12 | Visual + DOM check |
| 5 | **3 fonts + Lato loaded for nothing** | **Two** families: Montel + Manrope, self-hosted, subset, preloaded | Font payload **< 120 KB total** |
| 6 | **vw-based type → 17.8128 px** | Fixed modular scale with `rem` floors inside `clamp()` | Type sizes land on the scale |
| 7 | **`Arial-BoldMT.woff2` = 352 KB** | Deleted. Montel already supplies display weight | No Arial webfont in the build |
| 8 | **4 Google tags / ~750 KB** | Prototype ships **zero** third-party tags; a single consolidated GTM plan is documented separately | Lighthouse third-party audit = 0 |
| 9 | **Mobile `scrollWidth` 777 px on a 390 px viewport** | `overflow-x: clip` on a single wrapper, all media `max-width:100%`, no fixed pixel widths, tested at 320/390/430 | `scrollWidth === innerWidth` at 3 widths |
| 10 | **Three CTA languages** | One system: `primary` (filled teal), `ghost` (outline), `text` (underline sweep) | Only three button classes exist |
| 11 | **Heading hierarchy skips (H2→H4)** | One H1, H2 per chapter, H3 for items | Heading outline is sequential |
| 12 | **18.7 MB hero film at 1500×626** | Poster-first; video `preload="none"`, muted, loop, 1920×1080 re-encode target; separate mobile still | Hero transfer **< 400 KB** before interaction |

---

## 7. Design system

**Colour** — five values, anchored on the brand's existing teal so this reads as evolution, not rebrand:

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#12201F` | Near-black grounds (Sensory) |
| `--palace` | `#1E3B3D` | Primary brand — **already the site's teal** |
| `--gold` | `#C1A477` | Accents, rules, the cursor dot |
| `--ivory` | `#F4EFE6` | Warm page ground (replaces stark white) |
| `--clay` | `#A56C51` | Rare heritage accent |

**Type** — Montel (display, already self-hosted and on-brand) + Manrope (UI/body). Playfair Display and Lato are dropped.

Scale: `display` clamp(2.75→5.5rem) · `h1` clamp(2.25→4rem) · `h2` clamp(1.75→2.75rem) · `h3` 1.375rem · `body` 1.0625rem/1.65 · `small` 0.8125rem · `label` 0.6875rem + 0.14em tracking.

**Motion** — five patterns only, and the same five everywhere: clip-reveal, mask-wipe, expansion, cross-fade, underline-sweep.
Durations 220 / 420 / 900 / 1400 ms · easing `cubic-bezier(0.16, 1, 0.3, 1)` · everything gated by `prefers-reduced-motion`.

**Grid** — 12 col, 1440 max, 24 px gutter, 96 px section rhythm; intentional asymmetry (5/7, 7/5, offset columns) so no two chapters look alike.

---

## 8. Performance & accessibility budget

| Metric | Budget |
| --- | --- |
| LCP | < 2.5 s |
| CLS | < 0.1 |
| INP | < 200 ms |
| JS (gzip) | < 180 KB |
| Fonts | < 120 KB |
| First-view images | < 600 KB |
| Third-party requests | 0 |

Accessibility: WCAG AA contrast (gold on teal passes at large sizes only — body text stays ivory on teal), visible focus rings, keyboard-operable carousel, real alt text from the inventory, `prefers-reduced-motion` honoured throughout, video never autoplays with sound.

---

## 9. What I will not do

Straight from your brief's avoid-list, and I agree with all of it:

- no horizontal scroll anywhere except The Stay;
- no parallax on every section;
- no custom cursor that replaces the native one;
- no more than three pinned sections;
- no animation on every text node;
- no WebGL/3D — the walkthrough idea needs assets nobody has shot yet.

---

## 10. Proposed stack

A static prototype, no CMS: **Vite + vanilla JS + GSAP/ScrollTrigger + Lenis**, output to plain HTML/CSS/JS. Reasons: it can be opened locally without a server, dropped on any host for review, handed to Simplotel's team as reference, and it adds no framework lock-in. If you would rather have React so future devs extend it, say so now — that is the one decision that is expensive to reverse.

---

## 11. Approval checklist

Before I write any code, please confirm or redirect:

1. **Mode weighting** — Expansive / Intimate / Sensory as the three chapters' organising idea?
2. **Type** — Montel + Manrope, dropping Playfair Display and Lato?
3. **Colour** — keep `#1E3B3D` as the anchor and move the page ground from white to ivory `#F4EFE6`?
4. **Hero** — poster-first on desktop, still-image ken-burns on mobile (accepting that mobile loses the film)?
5. **Horizontal section** — one only, The Stay; desktop hijacked, mobile native?
6. **Statement interludes** — three of them, including *"Service from the heart — grandeur, held lightly"* as the signature moment?
7. **Stack** — Vite + vanilla + GSAP/Lenis, or React?
8. **Scope** — homepage only, or homepage + The Stay + Weddings?

Answer those and I'll build it section by section, measuring CLS/LCP as I go so we can show the before/after honestly.