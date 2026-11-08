# Kaldan Samudhra Palace — complete website concept

Independent, multipage internal-presentation concept. This is not the official hotel website and does not take payments or make reservations.

## Commands

Run in this directory with Node 22 or newer:

```bash
npm ci
npm run dev
npm run build
npm start
npm test
```

`npm start` serves the built website at http://127.0.0.1:8899/. Development uses Vite and proxies `/api` to that local server. The production output is `dist/`.

## Source

- `src/data/hotel-content.json`: recovered public hotel content, with source URLs.
- `src/render/home.mjs`, `pages.mjs`, `ui.mjs`: homepage, complete detail pages and shared helpers.
- `render.mjs`: shared document/navigation/dialog/footer shell and static page generation.
- `src/styles/index.css`: current design system. Other legacy styles are preserved but unused.
- `src/js/main.js`: progressive motion, navigation, dialogs, filters, gallery and enquiry handling.
- `public/`: local fonts, photography, films and generated route manifest.
- `server.mjs`: static serving and optional validated enquiry delivery.
- `server.test.mjs`: local-only server tests with mock email delivery.

The generator currently outputs 74 pages. Text is visible without animation. Reduced motion removes the scroll expansion and automatic film playback. The mobile accommodation rail uses native scrolling rather than a pinned desktop-only interaction.

See the parent README for packaging, browser verification, deployment environment variables and remaining hotel approval/integration requirements. Historical benchmark numbers do not describe this rebuilt edition.
