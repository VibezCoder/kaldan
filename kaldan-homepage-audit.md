# Kaldan Samudhra — Homepage Structure & Evidence Audit

**Site:** https://www.kaldanhotels.com/
**Captured:** 7 Nov 2026, Chrome (headless), 1440×900 desktop + 390×844 mobile
**Method:** Chrome DevTools Protocol — full-page screenshot, DOM geometry, network timing, CSS token extraction

---

## 1. Deliverables produced

| Artefact | Path | What it is |
| --- | --- | --- |
| Full homepage screenshot | `capture/desktop/home-desktop-full.png` | 1440 × **8398 px** — first screen to footer, one image |
| Scroll sections | `capture/desktop/home-desktop-segments/` | 10 × 1440×900 frames, in scroll order |
| Mobile homepage | `capture/mobile/home-mobile-full.png` | 390 × **7412 px** |
| Mobile sections | `capture/mobile/home-mobile-segments/` | 9 frames |
| Site code | `site-code/` | 18 pages of HTML + 370 assets + `manifest.json` |
| Performance data | `capture/perf/perf.json` | Real transferred bytes, LCP, CLS |
| Design tokens | `capture/design/design.json` | Fonts, sizes, colours, CTA styles |
| DOM geometry | `capture/desktop/home-desktop-outline.json` | Every section's pixel position |

### Screenshot integrity check
Because these were captured headless, the images were verified programmatically before being reported:

- desktop: 69,100 unique colours, **0 / 10 blank bands**, brightness profile `[100, 194, 153, 175, 225, 196, 191, 179, 219, 99, 255]` — content throughout, dark hero at top, white footer at bottom
- mobile: 148,598 unique colours, **0 / 10 blank bands**

So the images are genuine renders, not blank or error pages.

> **Honest note:** the model driving this session cannot view images, so I verified the screenshots numerically rather than by eye. The layout conclusions below come from the DOM geometry, computed styles and network data — which are more precise than eyeballing anyway, but you should still open the PNGs yourself to sanity-check the *visual* impression.

---

## 2. The homepage, section by section (measured)

Total document height **8398 px**. Positions are absolute Y offsets at 1440 px wide.

| Y range | H | Section | Heading in it |
| --- | --- | --- | --- |
| 0–102 | 102 | Sticky header + nav | — Home, About Us, Accommodations, Offers, Dining + `BOOK NOW` |
| 102–679 | 577 | **Hero video** (Plyr player) | *nothing — no headline* |
| 398–468 | 70 | Email capture *overlaying the video* | "Get the prices emailed to you!" |
| 492–597 | 105 | **Booking widget *overlaying the video*** | — Check In / Check Out / Rooms & Guests / Promo Code / `BOOK NOW` |
| 719 | — | Video countdown chip | `-01:58` |
| 773–1341 | 568 | Intro image + first statement | **H1** "KALDAN SAMUDHRA PALACE – AN IMMORTAL PALACE BY THE SEA" @ y=776 |
| 1435–2293 | 858 | Accommodation carousel | **H2** "SOLANKI-STYLED SPACES FROM FLOOR-TO-CEILING" @ y=1528 |
| ↑ | | 7 room types (H4) | Deluxe Twin · Deluxe King Pool View · Premium Pool View · Executive Palace Suite · Premium Palace Suite · Executive Studio Villa · Premium Luxury Villa |
| 2386 | 56 | Offers | **H2** "OFFERS" |
| 2852 | 113 | Activities | **H2** "ACTIVITIES FOR ALL AGES" |
| 3529 | 113 | Dining | **H2** "BITES, SIPS, & SEA BREEZES" |
| 4497 | 94 | 4 dining venues (H3) | Dhani—All-day Dining · Somapuraa—Bar · Sagar Bar—Pool Bar · Panch Mahal |
| 4517–4775 | 258 | Venue detail strip (grey `#F4F4F4`) | — |
| 4904 | 191 | Weddings & events | **H2** "CELEBRATE WITH CHANDELIERS & STARS" |
| 5911 | 135 | Experiences | **H2** "MEMORABLE EXPERIENCES" |
| 6736 | 113 | Awards | **H2** "AWARDS AND CERTIFICATIONS" |
| 7161–7767 | 606 | Testimonials | **H2** "PRAISES FOR OUR PALACE" |
| 7767–8398 | 631 | Footer (deep teal, 0.91 alpha) | Address · Contact · Follow us · full nav |

**The content architecture is actually fine.** All the right chapters exist. The problem is entirely in the *first 900 pixels* and in how those chapters are dressed.

---

## 3. The core finding: the first screen has no story in it

This is the precise, measured version of your instinct that "it straight away led to booking right in front, but doesn't speak about the experience visually."

What actually occupies the first 900 px viewport:

| y | Element |
| --- | --- |
| 0–102 | Header — nav links at x=394→932, logo at x=148, `BOOK NOW` at x=1129 |
| 102–679 | Hero video, **1440 × 577** — i.e. **64 % of the viewport, not full-bleed cinema** |
| 398–468 | Email-capture strip, **stacked on top of the video** |
| 492–597 | Booking widget, **also stacked on top of the video** |
| 719 | Video countdown timer |
| 776 | **H1 brand statement — 86 % down the first screen** |
| 0–900 | `div.layer` at `rgba(0,0,0,0.7)` scrim over the whole fold |

Three consequences worth putting in front of your senior:

1. **The headline is not in the hero.** The single most important sentence on the site ("An Immortal Palace by the Sea") sits at y=776 — effectively at the fold line, below the video.
2. **Two competing conversion layers fight the video.** A booking widget *and* an email-capture bar are both overlaid on the hero. The hero is doing three jobs (brand film, booking form, lead capture) and none of them well.
3. **The hero is short.** 577 px of a 900 px viewport means roughly a third of the first screen is already the next section. There is no feeling of entering an environment — compare Casa Momo's full-bleed hero.

---

## 4. Performance — this is where "lacks smoothness" is measurable

Cold load, 1440×900, no cache:

| Metric | Measured | "Good" threshold | Verdict |
| --- | --- | --- | --- |
| TTFB | 45 ms | < 800 ms | ✅ excellent |
| First Contentful Paint | **2000 ms** | < 1800 ms | ⚠️ borderline |
| **Largest Contentful Paint** | **6260 ms** | ≤ 2500 ms | ❌ **2.5× too slow** |
| **Cumulative Layout Shift** | **1.0009** | < 0.1 | ❌ **10× the "poor" threshold** |
| DOMContentLoaded | 2929 ms | — | |
| Load event | 7934 ms | — | |
| Total transferred | 5.32 MB / 90 requests | — | |

**CLS of 1.0 is the smoking gun.** A CLS of 1.0 means the page visibly jumps and reflows as it loads — that is exactly the "lack of smoothness" you felt while scrolling. It is not a matter of taste; it is a measured defect, and it is the single highest-value thing to fix.

Payload breakdown:

| Type | Requests | Bytes |
| --- | --- | --- |
| Image | 31 | 2.75 MB |
| Script | 28 | 1.37 MB |
| Font | 7 | 0.78 MB |
| Stylesheet | 11 | 0.19 MB |
| Media (video) | 1 | 0.18 MB (streams progressively) |

Two specific wastes:

- **`Arial-BoldMT.woff2` weighs 352 KB** — a quarter of the entire font budget is spent serving *Arial Bold* as a webfont.
- **Google tags load four separate times**: `AW-10884276075`, `G-X88QT57E8P`, `G-DMYPKC176S` and container `GTM-KKD44VB` — roughly 750 KB of JavaScript, and it splits your analytics across multiple properties. For your data-analytics angle this is the first thing to consolidate.

Good news: the image CDN (`assets.simplotel.com`) already negotiates **WebP / AVIF / JPEG-XL** — the same photo is 2079 KB as PNG but 239 KB as WebP (**89 % smaller**). The infrastructure is capable; the *sizing* is the problem (several heroes are requested at `w_5000`).

### The hero video
- `kaldan_palace_overview_compressed_1a13rr.mp4` — **18.71 MB**
- Decoded resolution **1500 × 626** (an unusual ~2.4:1 ratio), duration 127.9 s
- ≈ **1.17 Mbps** for a 1500 px-wide brand film

So your instinct about "high SD — low HD" was right and is now quantified: the file is *heavy in megabytes* but *low in effective quality per pixel*. Re-encoding to 1920×1080 (or 2560-wide) HEVC/AV1 at a sane bitrate, plus a mobile-specific cut, would look sharper **and** download less.

---

## 5. Typography & colour — what the site actually uses

**Body:** `"Alegreya Sans", sans-serif` @ 17.81 px, colour `rgba(40,40,40,0.8)`, on white.

**Headings:** `Montel` @ 45 px, weight 400 — self-hosted from `cdn1.simplotel.com` in five formats (eot/woff2/woff/ttf/svg).

Font families actually rendering on the homepage:

| Family | Usage |
| --- | --- |
| Alegreya Sans | body, labels (65 + 28 + 22 elements) |
| Montel | all headings (H1/H2 at 45 px) |
| Playfair Display | 13 elements @ 22.5 px |
| Lato | loaded from Google Fonts, no visible role |

**Three display families are in play with no clear division of labour**, plus Lato loaded for nothing. That is the "everything felt subpar" feeling — there is no type system, just accumulated fonts.

Sizing is **viewport-proportional** (`clamp(20px, 3.386vw, 52px)` appears throughout), which produces the tell-tale fractional sizes: 17.8128 px, 13.1184 px, 37.4976 px, 22.5072 px, 11.2464 px. Text therefore ignores the user's browser font-size preference and never sits on a consistent scale.

**Palette in use:**

| Role | Value |
| --- | --- |
| Primary / brand | `#1E3B3D` (deep teal) — `BOOK NOW`, footer |
| Footer bg | `rgba(30,59,61,0.91)` |
| Footer text | `rgba(248,247,246,0.9)` |
| Cream | `rgba(255,253,246,…)`, `rgba(238,231,220,0.63)` |
| Neutral | `#F4F4F4` |
| Amber accent | `#D08511` |

Encouragingly, `#1E3B3D` is already within a hair of the "deep olive / ocean blue" direction in your proposal — so this is an **evolution, not a rebrand**. That is a much easier sell internally.

**CTA inconsistency:** `BOOK NOW` is teal-filled, 4 px radius, uppercase, 19 px. `KNOW MORE` is ghost/transparent at 0.64 px letter-spacing. `EXPLORE` is a bare underline-less text link at 0 px radius. Three different button languages for the same job.

---

## 6. Technology stack

Detected from the served markup:

- **Platform:** Simplotel (hotel website + booking engine) — footer credit "Simplotel - Hotel Website Design & Booking Engine"
- **Hosting:** Amazon S3 behind **CloudFront**
- **Booking engine:** `bookings.kaldanhotels.com` (separate subdomain, embedded)
- **jQuery**, **GSAP**, **Plyr 3.6.3** (video), **Font Awesome**, **animate.css**, Popper/Bootstrap-era grid
- **Analytics:** GA4 ×3 properties + GTM ×1, Meta Pixel, **Sojern** (travel retargeting)
- **reCAPTCHA**, **intl-tel-input**, WhatsApp, Schema.org JSON-LD, Open Graph
- **Fonts:** Montel (self-hosted), Alegreya Sans + Lato (Google Fonts)

### On "getting the code"
`site-code/` holds everything a browser receives — the same publicly served files, no auth bypass:

- **18 pages** of HTML (home, about-us, accommodations, dining, experiences, activities, offers, gallery, location, contact-us, events-conferences, kaldan-weddings, about-juju, faqs, blogs, terms-conditions + 404s)
- **370 downloaded assets** — compressed CSS, JS, images, fonts, the corporate PDF
- `manifest.json` — every referenced URL, host, content type and byte size

What is **not** obtainable, and shouldn't be: the CMS admin, database, booking-engine internals, server-side code. You can rebuild the front end as a prototype without any of it.

---

## 7. Other things worth fixing

- **Mobile has horizontal overflow:** at a 390 px viewport the document's `scrollWidth` is **777 px** — the content is nearly twice the screen width. That's a real bug, not a nitpick.
- **Two lead-capture layers, no combined intent:** the email strip and the booking widget both sit on the hero, but neither captures *what the visitor wants* (leisure / wedding / dining / corporate) — which is exactly the enquiry experience your proposal describes.
- **`alt` text:** the homepage carries 78 images; you should audit accessibility before launch.
- **A 12.42 MB PDF** (`accord_group_corporate_profile_2025`) is fetchable from the site — worth checking who links it and whether it is compressed.

---

## 8. What I'd do next, in order

1. **Fix CLS (1.0 → < 0.1).** Reserve space for the hero, the room carousel and the footer. This alone will transform the *felt* smoothness, before any redesign. It is also the cheapest, most defensible win to show your senior.
2. **Rebuild the first screen.** Full-viewport cinematic hero, headline *in* the hero, booking reduced to one restrained secondary control, email capture removed from the fold entirely.
3. **Set a real type system.** One display face (Montel is already on-brand and self-hosted — keep it) + one UI sans. Drop Lato, drop Playfair Display. Move off vw-based font sizes onto a fixed modular scale.
4. **Systemise the CTAs.** One filled primary, one ghost secondary, everywhere. Keep `#1E3B3D` as the primary — it already works.
5. **Cut the hero video's weight and raise its resolution.** 1080p/1440p AV1 or HEVC, separate mobile cut, poster frame, and stop shipping 18.7 MB.
6. **Consolidate the four Google tags into one GTM container**, then implement the event taxonomy from your proposal (`hero_video_play`, `room_view`, `booking_cta_click`, `enquiry_form_submit`, `wedding_enquiry`). Right now the data can't answer those questions.
7. **Then** build the section-by-section redesign against these measurements.

The screenshots and the code are now evidence, not impressions. Every number above can be reproduced or demonstrated live in DevTools.

---

## 9. Reproducing this

Tools written for this audit live in `tools/`:

| Tool | Purpose |
| --- | --- |
| `mirror-code.mjs` | Download all publicly served pages + assets + `manifest.json` |
| `capture-resolver.mjs` | Full-page + segmented screenshots via Chrome |
| `perf.mjs` | LCP / CLS / transferred bytes |
| `inspect-design.mjs` | First-screen geometry, fonts, colours, CTAs |
| `analyze.py` | Image verification, payload, DOM, CSS token analysis |
| `formatcheck.mjs` | WebP/AVIF negotiation check |
| `digest.mjs` | Human-readable manifest summary |

**Environment note:** Chrome could not run under the default workspace sandbox here — its Crashpad handler and IPC are blocked, and Chrome's own DNS resolver returned `ERR_NAME_NOT_RESOLVED`. The captures were produced by running Chrome with every site host pre-resolved (bypassing Chrome's resolver) under full file access. If you re-run these tools on your own laptop, plain `chrome` will work normally and the `--host-resolver-rules` workaround is unnecessary.
