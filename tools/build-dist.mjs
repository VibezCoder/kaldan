import fs from 'node:fs';
import path from 'node:path';
const ROOT = 'C:/Users/Dell/Desktop/kaldanhotel';
const SRC = path.join(ROOT, 'prototype');
const DIST = path.join(ROOT, 'dist');
fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(SRC, DIST, { recursive: true });

fs.writeFileSync(path.join(DIST, 'netlify.toml'), `[build]
  publish = "."

[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
`);

fs.writeFileSync(path.join(DIST, 'vercel.json'), JSON.stringify({
  cleanUrls: true,
  headers: [
    { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    { source: '/(.*)', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }] },
  ],
}, null, 2));

fs.writeFileSync(path.join(DIST, 'README.md'), `# Kaldan Samudhra — digital experience concept

Independent concept prototype + internal pitch package. Not the production site.
Pure static HTML/CSS/JS — no build step, no server code, no runtime CDN dependency.

## Run locally
Double-click \`start-pitch.bat\` (Windows) to serve this folder and open the deck, or:

    python -m http.server 8899
    # then open http://127.0.0.1:8899/pitch.html

## What to open in the office
1. \`pitch.html\` — the deck. Arrows / space / wheel / swipe to move. **G** overview,
   **N** speaker notes (talk track + objection handling), **F** fullscreen, **P** print.
   Slide 7 embeds the live prototype; scroll it during the meeting.
2. \`index.html\` — the redesigned homepage, fully interactive.
3. \`compare.html\` — production capture beside the live concept, sync-scrollable.
4. \`design.html\` — palette, type scale, motion system, measured fixes.
5. \`pitch.pdf\` — 14-page landscape leave-behind of the deck.

## Deploy (any static host)
- **Netlify Drop:** drag this folder (or the zip) onto app.netlify.com/drop — live in seconds.
- **Netlify CLI:** \`netlify deploy --prod --dir .\`
- **Vercel:** \`vercel --prod\` (vercel.json included).
- **GitHub Pages:** push this folder to a repo, enable Pages on the root branch.
- **S3/CloudFront or any nginx/Apache:** upload as-is; serve \`index.html\` at the root.

No environment variables, no database, no backend. The enquiry form validates and
records in localStorage only; it transmits nothing. The booking CTA hands off to the
live production site in a new tab.

## Measured (headless Chrome, cold load)
| | production | concept |
|---|---|---|
| layout shift on load | 1.0009 | 0.0006 desktop / 0 mobile |
| largest contentful paint | 6260 ms | ~1.3 s |
| transferred on load | 5.32 MB / 90 req | ~0.8 MB / 23 req |
| mobile document width | 777 px in 390 | 390 px in 390 |

Figures live in \`assets/evidence/metrics.json\` and are rendered into the deck and
comparison page, so they cannot drift from the measurement.

## Contents
- \`index.html\`, \`design.html\`, \`compare.html\`, \`pitch.html\`, \`pitch.pdf\`
- \`assets/css\` — main.css (site), pages.css (evidence pages), pitch.css (deck)
- \`assets/js\` — main.js (site behaviour), analytics.js (GA4-shaped event layer),
  data.js (content transcribed from production), pitch.js (deck)
- \`assets/vendor\` — GSAP, ScrollTrigger, Lenis (self-hosted)
- \`assets/fonts\` — Cormorant Garamond + Manrope (self-hosted woff2)
- \`assets/img\`, \`assets/video\` — the property's own photography and film, re-encoded
- \`assets/evidence\` — production captures + metrics.json
`);

fs.writeFileSync(path.join(DIST, 'start-pitch.bat'), `@echo off
rem One-click pitch launcher: serves this folder and opens the deck.
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Python is required for the local server. Any static host works too - see README.md.
  pause
  exit /b 1
)
start /b "" python -m http.server 8899 --bind 127.0.0.1
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8899/pitch.html"
echo.
echo  Pitch deck:  http://127.0.0.1:8899/pitch.html
echo  Prototype:   http://127.0.0.1:8899/
echo  Close this window to stop the server.
echo.
pause >nul
`);

const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : files.push(p); } })(DIST);
const bytes = files.reduce((a, f) => a + fs.statSync(f).size, 0);
console.log(JSON.stringify({ distFiles: files.length, mb: +(bytes / 1048576).toFixed(1) }));