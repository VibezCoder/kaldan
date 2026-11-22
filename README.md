# Kaldan Samudhra — premium website concept

**Live concept:** https://kaldan-samudhra.onrender.com/

The current website is **kaldan-site/**, not the older single-page prototype. This is an independent internal-presentation concept, not Kaldan's official website.

## Open the current website

With Node.js 22 or newer installed, double-click **start-pitch.bat**, or run from this folder:

```bash
npm run build
npm start
```

Open http://127.0.0.1:8899/ through the server, not by double-clicking an HTML file. `npm run dev` runs the source version on port 5174. For a clean installation, run `npm ci` here and `npm --prefix kaldan-site ci` first.

## What is included

- 74 generated pages: homepage, palace story, eight accommodation details, four dining details, experiences, activities, weddings, events, eight offer details, 36 full journal articles, galleries, location, contact, FAQs, policies and JUJU.
- Cinematic arch-scroll opening inspired by the Vineyard reference, section-aware navigation, self-hosted typography and palace photography.
- Working navigation, filters/search, gallery lightbox, films, FAQ disclosures, enquiry drafts/downloads and official booking handoff.
- A dependency-free Node server with a validated email-delivery endpoint. It does not take payment or make reservations.

The 37th journal entry links to its original source because a complete article could not be recovered. Room photography illustrates the palace collection; individual category mapping requires hotel approval. Published conflicting policies and seasonal offers are clearly qualified rather than silently treated as current promises.

## Delivery modes

`npm run build` creates **kaldan-site/dist/**. This is the canonical static build. A static host can serve those files with real directory routes; do not add a catch-all SPA rewrite. On a static-only host, use the email draft/download and direct contact options; the online-delivery endpoint is not present.

For the Node edition, serve the same build with `node kaldan-site/server.mjs`. Deploy the built `dist` folder beside `server.mjs`, use Node 22+, set `HOST=0.0.0.0` and the platform's `PORT`, and place the service behind HTTPS. `PUBLIC_ORIGIN` must equal the exact public HTTPS origin (no trailing slash) when TLS terminates at a reverse proxy. Do not expose the source folder as a static document root.

To enable real email, the hotel must authorize and configure these server environment variables through its hosting secret manager:

- `RESEND_API_KEY`: the email provider credential.
- `ENQUIRY_FROM`: a verified sender address, optionally `Hotel Reservations <verified-address>`.
- `PUBLIC_ORIGIN`: the exact deployed website origin.

Recipient is fixed to `reservations.samudhra@kaldanhotels.com`; the guest's address is reply-to only. No credentials are included in this project. Without configuration, the endpoint returns an honest unavailable response. Provider acceptance is not a reservation or proof of inbox delivery. No live enquiry has been sent during testing.

Rate limiting is in-memory, five attempts per ten minutes per socket IP. Forwarded client-IP headers are deliberately not trusted. A production reverse proxy needs an approved per-client abuse-control strategy; multiple replicas need shared rate limiting. Confirm email handling, retention, privacy wording, sender authorization, image rights, accessibility requirements, current content and booking handoff with the hotel before a public launch. The concept intentionally remains `noindex, nofollow`.

## Verify and package

```bash
npm test
npm run build
npm run verify
npm run package
```

Server tests mock the email provider. Browser verification uses an isolated local server with live email disabled, Chrome, pointer/keyboard input, desktop/mobile layouts, reduced motion and script-failure checks. Its actual results are saved in `capture/premium-verification.json`; screenshots use `capture/verified-*.jpg`. These are local functional checks, not a production performance or accessibility certification.

Packaging requires Python 3 and writes a timestamped ZIP containing the static build, Node server, source and this handoff information. It does not upload or publish anything.

## Historical presentation files

`prototype/`, root `dist/`, `kaldan-concept-deploy.zip`, the old deck/PDF and previous metric reports are preserved historical work. They are **not this rebuilt website**, and their performance or functionality claims must not be used to describe it. The current launcher opens the new website instead of the old demo. A pre-redesign backup is under `capture/before-premium-1794148265385/`.
