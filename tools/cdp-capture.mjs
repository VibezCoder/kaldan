/**
 * Chrome DevTools Protocol screenshot driver.
 *
 * Launches Chrome headless, drives it over CDP (WebSocket), captures:
 *   - a full-page screenshot (captureBeyondViewport)
 *   - a JSON metrics report
 *   - the rendered DOM (post-JS outerHTML)
 *   - a resource-timing inventory
 *
 * Usage:
 *   node cdp-capture.mjs --url <url> --out <dir> --label <name> [--width 1440] [--height 900] [--mobile]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function parseArgs(argv) {
  const out = { width: 1440, height: 900, mobile: false, wait: 6000 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--url') out.url = next();
    else if (a === '--out') out.out = next();
    else if (a === '--label') out.label = next();
    else if (a === '--width') out.width = Number(next());
    else if (a === '--height') out.height = Number(next());
    else if (a === '--wait') out.wait = Number(next());
    else if (a === '--mobile') out.mobile = true;
  }
  if (!out.url || !out.out || !out.label) {
    console.error('need --url --out --label');
    process.exit(2);
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Minimal CDP client over a page-level WebSocket. */
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = new Map();
    ws.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
      } catch {
        return;
      }
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error.data ?? '')})`));
        else resolve(msg.result);
      } else if (msg.method) {
        const subs = this.events.get(msg.method);
        if (subs) for (const fn of subs) fn(msg.params);
      }
    });
  }

  send(method, params = {}, timeoutMs = 60000) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  once(method, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      const list = this.events.get(method) ?? [];
      const fn = (params) => {
        clearTimeout(timer);
        this.events.set(
          method,
          (this.events.get(method) ?? []).filter((f) => f !== fn),
        );
        resolve(params);
      };
      list.push(fn);
      this.events.set(method, list);
      const timer = setTimeout(() => reject(new Error(`CDP event timeout: ${method}`)), timeoutMs);
    });
  }

  on(method, fn) {
    const list = this.events.get(method) ?? [];
    list.push(fn);
    this.events.set(method, list);
  }
}

async function waitForPort(profileDir, timeoutMs = 45000) {
  const portFile = path.join(profileDir, 'DevToolsActivePort');
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(portFile)) {
      const txt = await fsp.readFile(portFile, 'utf8');
      const [port, wsPath] = txt.split(/\r?\n/);
      if (port && wsPath) return { port: Number(port), wsPath };
    }
    await sleep(250);
  }
  throw new Error('Chrome did not report a DevTools port in time');
}

async function main() {
  const opts = parseArgs(process.argv);
  const outDir = path.resolve(opts.out);
  await fsp.mkdir(outDir, { recursive: true });

  const profileDir = path.join(outDir, `.chrome-profile-${opts.label}`);
  await fsp.rm(profileDir, { recursive: true, force: true });
  await fsp.mkdir(profileDir, { recursive: true });
  const logFd = fs.openSync(path.join(outDir, `.chrome-${opts.label}.log`), 'w');

  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profileDir}`,
      `--window-size=${opts.width},${opts.height}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-features=Translate,OptimizationHints,MediaRouter',
      '--hide-scrollbars',
      '--mute-audio',
      '--autoplay-policy=no-user-gesture-required',
      '--force-device-scale-factor=1',
      '--allow-running-insecure-content',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', logFd], windowsHide: true },
  );

  let cdp;
  try {
    const { port } = await waitForPort(profileDir);
    console.log(`[chrome] devtools port ${port} pid ${chrome.pid}`);

    // Find the page target.
    let target = null;
    for (let i = 0; i < 40 && !target; i++) {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await res.json();
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (!target) await sleep(250);
    }
    if (!target) throw new Error('no page target found');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error('ws error')), { once: true });
    });
    cdp = new CDP(ws);

    const UA =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.send('Log.enable').catch(() => {});
    await cdp.send('Network.setUserAgentOverride', { userAgent: UA, platform: 'Win32' });
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: opts.width,
      height: opts.height,
      deviceScaleFactor: 1,
      mobile: opts.mobile,
      screenWidth: opts.width,
      screenHeight: opts.height,
    });
    if (opts.mobile) {
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    }

    // Collect failed requests for the audit.
    const failed = [];
    const responses = [];
    cdp.on('Network.responseReceived', (p) => {
      responses.push({
        url: p.response.url,
        status: p.response.status,
        mime: p.response.mimeType,
        type: p.type,
        fromDiskCache: p.response.fromDiskCache,
        encodedLength: p.response.encodedDataLength,
        headers: p.response.headers,
      });
    });
    cdp.on('Network.loadingFailed', (p) => {
      failed.push({ errorText: p.errorText, type: p.type, blocked: !!p.blockedReason });
    });
    const consoleMsgs = [];
    cdp.on('Runtime.consoleAPICalled', (p) => {
      consoleMsgs.push({ type: p.type, text: (p.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ') });
    });

    const loadFired = cdp.once('Page.loadEventFired', 90000).catch(() => null);
    await cdp.send('Page.navigate', { url: opts.url }, 60000);
    await loadFired;
    console.log('[page] load event fired');

    // Let fonts, images, hero video and entrance animations settle.
    await sleep(opts.wait);

    // Scroll the whole page to trigger lazy-loading and scroll animations, then return to top.
    await cdp
      .send('Runtime.evaluate', {
        awaitPromise: true,
        expression: `(async () => {
          const step = Math.round(window.innerHeight * 0.8);
          const max = document.body.scrollHeight;
          for (let y = 0; y < max + step; y += step) {
            window.scrollTo(0, y);
            await new Promise(r => setTimeout(r, 220));
          }
          window.scrollTo(0, document.body.scrollHeight);
          await new Promise(r => setTimeout(r, 800));
          window.scrollTo(0, 0);
          await new Promise(r => setTimeout(r, 800));
          return true;
        })()`,
      }, 120000)
      .catch((e) => console.log('[scroll] warn:', e.message));

    // Wait until all images report complete.
    await cdp
      .send('Runtime.evaluate', {
        awaitPromise: true,
        expression: `(async () => {
          document.querySelectorAll('img').forEach(i => { i.loading = 'eager'; });
          const t0 = Date.now();
          while (Date.now() - t0 < 15000) {
            const pending = [...document.images].filter(i => !i.complete);
            if (!pending.length) break;
            await new Promise(r => setTimeout(r, 300));
          }
          if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }
          return true;
        })()`,
      }, 40000)
      .catch(() => {});

    await sleep(1500);

    const metrics = await cdp.send('Page.getLayoutMetrics');
    const content = metrics.cssContentSize ?? metrics.contentSize;
    const pageInfo = await cdp.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => ({
        title: document.title,
        url: location.href,
        scrollHeight: document.documentElement.scrollHeight,
        bodyScrollHeight: document.body.scrollHeight,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        docHeight: document.documentElement.getBoundingClientRect().height,
        fontFamilies: [...new Set([...document.querySelectorAll('h1,h2,h3,h4,h5,p,a,button,body')].slice(0,400).map(e => getComputedStyle(e).fontFamily))],
        bodyBg: getComputedStyle(document.body).backgroundColor,
        videoCount: document.querySelectorAll('video').length,
        imgCount: document.querySelectorAll('img').length,
        iframeCount: document.querySelectorAll('iframe').length,
        iframeSrcs: [...document.querySelectorAll('iframe')].map(f => f.src).slice(0,20)
      }))()`,
    });

    const fullHeight = Math.ceil(Math.min(content.height, 30000));
    console.log(`[page] content ${content.width}x${content.height} -> capturing ${opts.width}x${fullHeight}`);

    // Full-page screenshot in one shot.
    const shot = await cdp.send(
      'Page.captureScreenshot',
      {
        format: 'png',
        captureBeyondViewport: true,
        optimizeForSpeed: false,
        clip: { x: 0, y: 0, width: opts.width, height: fullHeight, scale: 1 },
      },
      180000,
    );
    const pngPath = path.join(outDir, `${opts.label}-full.png`);
    await fsp.writeFile(pngPath, Buffer.from(shot.data, 'base64'));
    const size = (await fsp.stat(pngPath)).size;
    console.log(`[shot] ${pngPath} (${(size / 1024).toFixed(0)} KB)`);

    // Rendered DOM + resource inventory.
    const dom = await cdp.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `document.documentElement.outerHTML`,
    });
    await fsp.writeFile(path.join(outDir, `${opts.label}-rendered.html`), dom.result.value ?? '', 'utf8');

    const perf = await cdp.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const nav = performance.getEntriesByType('navigation')[0] || {};
        return {
          domContentLoaded: nav.domContentLoadedEventEnd,
          loadEvent: nav.loadEventEnd,
          transferSize: nav.transferSize,
          resources: performance.getEntriesByType('resource').map(r => ({
            name: r.name, initiatorType: r.initiatorType,
            duration: Math.round(r.duration), transferSize: r.transferSize,
            encodedBodySize: r.encodedBodySize
          }))
        };
      })()`,
    });

    const report = {
      label: opts.label,
      url: opts.url,
      options: { width: opts.width, height: opts.height, mobile: opts.mobile },
      capturedAt: new Date().toISOString(),
      pageInfo: pageInfo.result.value,
      contentSize: content,
      screenshot: { file: path.basename(pngPath), width: opts.width, height: fullHeight, bytes: size },
      network: { responses, failed, consoleMessages: consoleMsgs },
      performance: perf.result.value,
    };
    await fsp.writeFile(path.join(outDir, `${opts.label}-report.json`), JSON.stringify(report, null, 2), 'utf8');

    // Headings outline for the section-by-section audit.
    const outline = await cdp.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const rows = [];
        const sel = 'header,footer,section,main,nav,h1,h2,h3,h4,video,iframe,form,[class*="section"],[class*="banner"]';
        document.querySelectorAll(sel).forEach((el) => {
          const r = el.getBoundingClientRect();
          const top = r.top + window.scrollY;
          if (r.height < 8) return;
          rows.push({
            tag: el.tagName.toLowerCase(),
            id: el.id || '',
            cls: (el.className && String(el.className).slice(0, 120)) || '',
            top: Math.round(top),
            height: Math.round(r.height),
            text: (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 180)
          });
        });
        return rows.sort((a, b) => a.top - b.top).slice(0, 400);
      })()`,
    });
    await fsp.writeFile(
      path.join(outDir, `${opts.label}-outline.json`),
      JSON.stringify(outline.result.value ?? [], null, 2),
      'utf8',
    );

    console.log(`[done] ${opts.label}`);
  } finally {
    try {
      cdp?.ws.close();
    } catch {}
    try {
      chrome.kill();
    } catch {}
    try {
      fs.closeSync(logFd);
    } catch {}
  }
}

main().catch((err) => {
  console.error('[fatal]', err.stack || err.message);
  process.exit(1);
});
