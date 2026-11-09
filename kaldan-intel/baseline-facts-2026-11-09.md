# Kaldan Samudhra Palace — Digital Footprint Baseline (Phase 0: facts only)

**Collected:** 2026-11-09 (two passes: unauthenticated fetches + rendered browser session) · **Method:** public, unauthenticated access to live public pages. No scraping of gated content; all data below is what a logged-out visitor/agent can verify.
**Recommendations:** intentionally excluded. This document records observed facts only.

---

## 1. Official website — kaldanhotels.com

| Fact | Value | Source |
|---|---|---|
| Platform / CMS | **Simplotel** (third-party hotel CMS + booking engine) — footer credit + all images on `assets.simplotel.com` | homepage footer |
| robots.txt | Fully open (`User-agent: * / Allow: /`), sitemap declared at `/sitemap.xml` | /robots.txt |
| **llms.txt** | **Present** — full structured page inventory (site is AI-agent readable) | /llms.txt |
| Direct booking engine | `bookings.kaldanhotels.com` (Simplotel engine), propertyId 9858; "Manage Booking" at `/property/9858/bookings/manage/` | homepage |
| "Book Now" CTA | Present in navbar (empty anchor `[](#)`) | homepage |
| Contact | reservations.samudhra@kaldanhotels.com · Manager on Duty +91 91 5007 6579 · Hotel +91 44 4568 1000 · Reservations +91 89 2581 4910 | homepage |
| Group association | "Accord Hotels and Resorts" asset URLs / "Service From The Heart" (about-juju) — hotel appears part of Accord group | asset paths |
| TripAdvisor link | Footer links → `tripadvisor.in/Hotel_Review-g1162480-d24019190-...` | homepage footer |
| Google Maps link | `maps.app.goo.gl/3EQnwmQE6oRzbYnf7` | homepage footer |
| Social links in footer | Facebook · Instagram · TripAdvisor · YouTube · LinkedIn | homepage footer |
| Awards displayed (certificates photographed on page) | Environmental Management System cert · SATTE 2023 winner · Tamil Nadu Tourism cert · **Agoda Gold Circle 2023** · **MakeMyTrip Customer Choice Award** · misc trophies | /awards section |
| Dated content on live homepage | "Panch Mahal (Soft Opening from 2nd October onwards)" still displayed in November | homepage dining section |
| Blog inventory | 37 blog posts listed; several dated titles (e.g., "Cake-Mixing ceremony", "JCB Dealers Meet 2022", "Kaldan December 2022", "First Year" anniversary, "Summer" posts) | /llms.txt |
| Offer inventory | 8 live offer pages (Weekday Discount, Book 7 Days Ahead 12% Off, Day Use, Royal Summer Saver, Summer Crown Escape, The Royal Affair, Enchanted Empress, Book Early & Save) | /llms.txt |
| Dining outlets | Dhani (all-day), Somapuraa (bar), Sagar Bar (pool), Panch Mahal | homepage |
| Content claims on homepage | "Chef Venkatesh Bhat's recipes" at all-day dining; 10-acre Rajasthani themed property on ECR | homepage |

## 2. Instagram — @kaldanhotels

| Fact | Value | Source |
|---|---|---|
| Followers | **75.6K** | logged-out profile header |
| Following | 47 | logged-out profile header |
| Bio link | → kaldanhotels.com | profile |
| Posting cadence (visible window) | Posts on Nov 9, 7, 6 (×2), 5, 4, 2, Oct 29, 28, 26, 25 — near-daily through late Oct to Nov 9 | profile grid timestamps |
| Content mix visible | Reels/Clips + Carousels + single photos; one partner clip from "Illusion Dance Studio" | profile grid |
| Story highlights | F & B, Reviews, Weddings, Activities, Amenities, Celebrities, Promotions, Rooms, Features, IRL Team | profile |
| Engagement counts | Not visible logged-out (likes/comments hidden by Instagram) | — |

## 3: YouTube — @KaldanSamudhraPalace (browser pass)

| Fact | Value | Source |
|---|---|---|
| Subscribers | **1.13K** | channel page header |
| Videos | **172** | channel page header |
| Bio | Same profile line as Instagram ("shores of Bay of Bengal, 2 Kms before Temple city") | channel page |
| Observation | 172 videos of content but subscriber base 1.13K vs 75.6K Instagram — recorded as raw contrast of channel sizes | derived fact (counts above) |

## 4: TripAdvisor (browser pass, live page)

| Fact | Value | Source |
|---|---|---|
| Rating | **4.9 / 5** | live hotel page |
| Review count | **2,702 reviews** | live hotel page |
| Ranking | **#1 of 40 hotels in Mahabalipuram** | live hotel page |
| Photos | 1,342 candid photos (recent DDG snippet; 1,338 on earlier snapshots — growing) | cached snippets |
| Price band on page | 6 partner deals, nightly total from **₹23,216** (weekday offer with breakfast), up to ₹32,657 | live page deals widget |
| Property display name | "Kaldan Samudhra Palace, a Palace by the Sea" | switch name on page |

Cross-checked via cached DuckDuckGo snippets across tripadvisor.com/.in/.co.uk: review counts ranged 2,672–2,702 with #1 of 40 constant.

## 4B: Booking.com (browser pass)

| Fact | Value | Source |
|---|---|---|
| Overall rating | **8.9 / 10 — "Rated: Excellent"** | hotel page |
| Review volume | **~604 reviews** (location sub-score 9.1/10 from 583 reviews) | hotel page |
| Address consistency | Address shown as "East Coast Road, Mahabalipuram 603103" | hotel page |
| Listing URL | booking.com/hotel/in/kaldan-samudhra.html (also .hi.html Hindi version) | page |

## 4C: Other OTAs (cached snippets)

| OTA | Fact | Source |
|---|---|---|
| Agoda | Review page states "**9.1 Exceptional**" (provided by verified guests) | agoda.com/en-in/kaldan-samudhra-palace/reviews/mamallapuram-in.html snippet |
| Goibibo | **4.7 / 5** | goibibo.com hotel page snippets (multiple) |
| MakeMyTrip | Listing exists (review URL confirmed); score not machine-readable in snippet | makemytrip.com review page |
| Trip.com | Listing exists (Kanchipuram detail 89890807); score not in snippet | trip.com page |

## 5: Channels still not machine-readable (documented as-is)

| Channel | Status | How to close the gap |
|---|---|---|
| Google Business Profile rating | Maps side panel does not populate unauthenticated in this environment; Google Travel endpoint returned HTTP 500 | 30-second manual check on google.com/maps from the hotel's maps link, or Search Console/GMB access |
| Facebook @kaldansamudhra | Login wall; no public metadata | Manual or hotel Insights export |
| LinkedIn company page | Connection-level failure (tunnel) | Manual view (their team link uses `viewAsMember=true`, suggesting admin access) |
| DuckDuckGo | Started rate limiting (CAPTCHA) after several queries | Spread future crawls over days |

## 5A. Search-results channel

⚠️ Reference note: web search integration returned empty results for two Kaldan-specific queries on collection day; DDG-html and Bing-html were used instead — Bing results were corrupted/off-topic for hotel queries (recorded method caveat), DDG was reliable until rate-limited.

## 6. Candidate comparison anchor points (from Kaldan's own site; verify -01.rank later)

- Award certificates photographically confirm **Agoda Gold Circle 2023** and **MakeMyTrip Customer Choice** → MMT + Agoda are primary OTA stakes
- Simplotel engine + own domain → direct-booking funnel already exists (Reserve/Manage Booking flows)
- Differentiator claims found: 10-acre Rajasthani palace theme, private beach + lawn weddings, kids club

---

*Next re-measurement: monthly delta pack (same metrics → month-over-month table). This Phase-0 file is the baseline anchor.*
