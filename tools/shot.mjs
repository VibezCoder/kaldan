/**
 * Screenshot driver using Playwright's Firefox/WebKit (Chromium is blocked by the
 * sandbox because its Crashpad handler cannot OpenProcess).
 *
 * Loads playwright-core from the local npx cache so no install is required.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);

const PLAYWRIGHT_PATHS = [
  'C:\\Users\\Dell\\AppData\\Local\\npm-cache\\_npx\\e41f203b7505f1fb\\node_modules\\playwright-core',
  'playwright-core',
  'playwright',
];

function loadPlaywright() {
  const errors = [];
  for (const p of PLAYWRIGHT_PATHS) {
    try {
      return require(p);
    } catch (e) {
      errors.push(`${p}: ${e.message.split('\n')[0]}`);
    }
  }
  throw new Error(`could not load playwright:\n${errors.join('\n')}`);
}

const args = process.argv.slice(2);
const get = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : def;
};
const has = (flag) => args.includes(flag);

const url = get('--url');
const out = path.resolve(get('--out', './capture'));
const label = get('--label', 'shot');
const width = Number(get('--width', 1440));
const height = Number(get('--height', 900));
const browserName = get('--browser', 'firefox');
const exe = get('--exe', undefined);
const isMobile = has('--mobile');
const waitMs = Number(get('--wait', 6000));
const segmentHeight = Number(get('--segment', 0)); // >0 => also capture scroll segments

if (!url) {
  console.error('need --url');
  process.exit(2);
}

const EXPLICIT_EXE = {
  firefox: 'C:\\Users\\Dell\\AppData\\Local\\ms-playwright\\firefox-1532\\firefox\\firefox.exe',
  webkit: 'C:\\Users\\Dell\\AppData\\Local\\ms-playwright\\webkit-2311\\Playwright.exe',
  chromium: 'C:\\Users\\Dell\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win\\chrome.exe',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const pw = loadPlaywright();
  const executablePath = exe ?? EXPLICIT_EXE[browserName];
  await fsp.mkdir(out, { recursive: true });

  const browserType = pw[browserName];
  if (!browserType) throw new Error(`unknown browser: ${browserName}`);

  console.log(`[pw] launching ${browserName} exe=${executablePath}`);
  const browser = await browserType.launch({
    headless: true,
    executablePath,
    args: browserName === 'firefox' ? [] : [],
    firefoxUserPrefs:
      browserName === 'firefox'
        ? {
            'datareporting.policy.dataSubmissionEnabled': false,
            'datareporting.healthreport.uploadEnabled': false,
            'toolkit.telemetry.enabled': false,
            'browser.safebrowsing.downloads.enabled': false,
            'browser.ping-centre.telemetry': false,
            'app.update.enabled': false,
          }
        : undefined,
  });

  try {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      isMobile,
      hasTouch: isMobile,
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      ignoreHTTPSErrors: true,
      reducedMotion: 'no-preference',
    });
    const page = await context.newPage();

    const consoleMsgs = [];
    page.on('console', (m) => consoleMsgs.push({ type: m.type(), text: m.text().slice(0, 300) }));
    const failedRequests = [];
    page.on('requestfailed', (r) =>
      failedRequests.push({ url: r.url(), error: r.failure()?.errorText, type: r.resourceType() }),
    );
    const responses = [];
    page.on('response', (r) =>
      responses.push({
        url: r.url(),
        status: r.status(),
        type: r.request().resourceType(),
        contentType: r.headers()['content-type'] ?? '',
      }),
    );

    console.log(`[pw] goto ${url}`);
    await page.goto(url, { waitUntil: 'load', timeout: 90000 });
    await sleep(waitMs);

    // Trigger lazy loading and scroll animations, then return to top.
    await page
      .evaluate(async () => {
        const step = Math.round(window.innerHeight * 0.75);
        for (let y = 0; y < document.body.scrollHeight + step; y += step) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 250));
        }
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise((r) => setTimeout(r, 1000));
        window.scrollTo(0, 0);
        await new Promise((r) => setTimeout(r, 1000));
      })
      .catch((e) => console.log('[scroll] ', e.message));

    // Force eager image loading and wait for completion.
    await page
      .evaluate(async () => {
        document.querySelectorAll('img[loading="lazy"]').forEach((i) => (i.loading = 'eager'));
        const t0 = Date.now();
        while (Date.now() - t0 < 12000) {
          if ([...document.images].every((i) => i.complete)) break;
          await new Promise((r) => setTimeout(r, 300));
        }
        if (document.fonts?.ready) await document.fonts.ready;
      })
      .catch(() => {});
    await sleep(1200);

    const dims = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      title: document.title,
      url: location.href,
      videos: document.querySelectorAll('video').length,
      images: document.querySelectorAll('img').length,
      iframes: [...document.querySelectorAll('iframe')].map((f) => f.src),
    }));
    console.log('[page]', JSON.stringify(dims));

    const fullPath = path.join(out, `${label}-full.png`);
    await page.screenshot({ path: fullPath, fullPage: true, animations: 'disabled' });
    const st = await fsp.stat(fullPath);
    console.log(`[shot] full page -> ${fullPath} (${(st.size / 1024).toFixed(0)} KB)`);

    // Optional: viewport-sized segments for scroll-experience review.
    if (segmentHeight > 0) {
      const total = dims.scrollHeight;
      const segDir = path.join(out, `${label}-segments`);
      await fsp.mkdir(segDir, { recursive: true });
      let idx = 0;
      for (let y = 0; y < total; y += segmentHeight) {
        await page.evaluate((yy) => window.scrollTo(0, yy), y);
        await sleep(700);
        const f = path.join(segDir, `seg-${String(idx).padStart(2, '0')}-y${y}.png`);
        await page.screenshot({ path: f });
        idx++;
      }
      console.log(`[shot] ${idx} scroll segments -> ${segDir}`);
      await page.evaluate(() => window.scrollTo(0, 0));
    }

    const html = await page.content();
    await fsp.writeFile(path.join(out, `${label}-rendered.html`), html, 'utf8');

    const outline = await page.evaluate(() => {
      const rows = [];
      document
        .querySelectorAll('header,footer,section,main,nav,h1,h2,h3,h4,video,iframe,form,[class*="section"],[class*="banner"]')
        .forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.height < 8) return;
          rows.push({
            tag: el.tagName.toLowerCase(),
            id: el.id || '',
            cls: el.className && String(el.className).slice(0, 110),
            top: Math.round(r.top + window.scrollY),
            height: Math.round(r.height),
            text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200),
          });
        });
      return rows.sort((a, b) => a.top - b.top).slice(0, 400);
    });
    await fsp.writeFile(path.join(out, `${label}-outline.json`), JSON.stringify(outline, null, 2), 'utf8');

    const links = await page.evaluate(() => [...new Set([...document.querySelectorAll('a[href]')].map((a) => a.href))]);
    await fsp.writeFile(path.join(out, `${label}-links.json`), JSON.stringify(links, null, 2), 'utf8');

    const report = {
      label,
      url,
      browser: browserName,
      executablePath,
      capturedAt: new Date().toISOString(),
      viewport: { width, height, isMobile },
      dims,
      screenshot: { file: path.basename(fullPath), bytes: st.size },
      network: { responses, failedRequests, consoleMessages: consoleMsgs },
    };
    await fsp.writeFile(path.join(out, `${label}-report.json`), JSON.stringify(report, null, 2), 'utf8');
    console.log(`[done] ${label}`);
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error('[fatal]', e.stack || e.message);
  process.exit(1);
});
