/**
 * Chrome capture with DNS bypassed.
 *
 * Chrome's network service cannot resolve DNS under this sandbox, so every host
 * used by the site is resolved in Node and injected via --host-resolver-rules.
 *
 * Usage: node capture-resolver.mjs <url> <outDir> <label> [width] [height]
 */
import { spawn } from 'node:child_process';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TARGET = process.argv[2] ?? 'https://www.kaldanhotels.com/';
const OUT = path.resolve(process.argv[3] ?? './capture/desktop');
const LABEL = process.argv[4] ?? 'home-desktop';
const WIDTH = Number(process.argv[5] ?? 1440);
const HEIGHT = Number(process.argv[6] ?? 900);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = new Map();
    ws.addEventListener('message', (ev) => {
      let m;
      try {
        m = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
      } catch {
        return;
      }
      if (m.id !== undefined && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      } else if (m.method) for (const fn of this.events.get(m.method) ?? []) fn(m.params);
    });
  }
  send(method, params = {}, t = 60000) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => (this.pending.delete(id), rej(new Error(`timeout ${method}`))), t);
      this.pending.set(id, {
        resolve: (v) => (clearTimeout(timer), res(v)),
        reject: (e) => (clearTimeout(timer), rej(e)),
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  once(method, t = 60000) {
    return new Promise((res, rej) => {
      const fn = (p) => {
        clearTimeout(timer);
        this.events.set(method, (this.events.get(method) ?? []).filter((f) => f !== fn));
        res(p);
      };
      this.events.set(method, [...(this.events.get(method) ?? []), fn]);
      const timer = setTimeout(() => rej(new Error(`event timeout ${method}`)), t);
    });
  }
  on(m, fn) {
    this.events.set(m, [...(this.events.get(m) ?? []), fn]);
  }
}

/** Every host the site touches, so we can pre-resolve all of them. */
async function collectHosts() {
  const hosts = new Set([
    'www.kaldanhotels.com',
    'kaldanhotels.com',
    'websites.simplotel.com',
    'dzk7s6hqvp8gk.cloudfront.net',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'www.googletagmanager.com',
    'www.google-analytics.com',
    'connect.facebook.net',
    'www.google.com',
    'www.gstatic.com',
    'cdn.jsdelivr.net',
    'cdnjs.cloudflare.com',
    'unpkg.com',
    'code.jquery.com',
    'maps.googleapis.com',
    'maps.gstatic.com',
    'www.youtube.com',
    'i.ytimg.com',
    'player.vimeo.com',
    'vimeo.com',
    'book.simplotel.com',
    'simplotel.com',
    'api.simplotel.com',
  ]);
  for (const f of ['./site-code/manifest.json']) {
    try {
      const m = JSON.parse(await fsp.readFile(f, 'utf8'));
      Object.keys(m.hosts ?? {}).forEach((h) => hosts.add(h));
    } catch {}
  }
  return [...hosts];
}

async function resolveAll(hosts) {
  const rules = [];
  const resolved = {};
  await Promise.all(
    hosts.map(async (h) => {
      try {
        const addrs = await dns.resolve4(h);
        if (addrs?.length) {
          resolved[h] = addrs[0];
          rules.push(`MAP ${h} ${addrs[0]}`);
        }
      } catch {
        try {
          const { address } = await dns.lookup(h, { family: 4 });
          resolved[h] = address;
          rules.push(`MAP ${h} ${address}`);
        } catch {}
      }
    }),
  );
  return { rules, resolved };
}

async function main() {
  await fsp.mkdir(OUT, { recursive: true });

  const hosts = await collectHosts();
  const { rules, resolved } = await resolveAll(hosts);
  console.log(`[dns] resolved ${rules.length}/${hosts.length} hosts`);
  await fsp.writeFile(path.join(OUT, 'dns-map.json'), JSON.stringify(resolved, null, 2), 'utf8');

  const profileDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'kaldan-'));
  const logFd = fs.openSync(path.join(OUT, `.chrome-${LABEL}.log`), 'w');

  const chromeArgs = [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--hide-scrollbars',
    '--mute-audio',
    '--autoplay-policy=no-user-gesture-required',
    '--force-device-scale-factor=1',
    '--ignore-certificate-errors',
    `--host-resolver-rules=${rules.join(',')}`,
    'about:blank',
  ];

  const child = spawn(CHROME, chromeArgs, { stdio: ['ignore', 'ignore', logFd], windowsHide: true });
  let cdp = null;

  try {
    const portFile = path.join(profileDir, 'DevToolsActivePort');
    let port = null;
    for (let i = 0; i < 150; i++) {
      if (fs.existsSync(portFile)) {
        port = Number((await fsp.readFile(portFile, 'utf8')).split(/\r?\n/)[0]);
        if (port) break;
      }
      if (child.exitCode !== null) throw new Error(`chrome exited ${child.exitCode}`);
      await sleep(200);
    }
    if (!port) throw new Error('no devtools port');

    let target = null;
    for (let i = 0; i < 50 && !target; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      } catch {}
      if (!target) await sleep(200);
    }
    if (!target) throw new Error('no page target');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', () => rej(new Error('ws error')), { once: true });
    });
    cdp = new CDP(ws);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: WIDTH,
      screenHeight: HEIGHT,
    });

    const failed = [];
    cdp.on('Network.loadingFailed', (p) => failed.push({ error: p.errorText, type: p.type }));

    const loaded = cdp.once('Page.loadEventFired', 60000).catch(() => null);
    await cdp.send('Page.navigate', { url: TARGET }, 60000);
    await loaded;
    await sleep(6000);

    const probe = await cdp.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `({ href: location.href, title: document.title, textLen: (document.body?.innerText||'').length, imgs: document.images.length, videos: document.querySelectorAll('video').length })`,
    });
    console.log('[probe]', JSON.stringify(probe.result.value));
    if (probe.result.value.href.startsWith('chrome-error') || probe.result.value.textLen < 500) {
      console.log(`[FAIL] page did not render. failed requests sample:`, JSON.stringify(failed.slice(0, 6)));
      return;
    }

    // Scroll through to trigger lazy load + scroll animations, then return to top.
    await cdp.send('Runtime.evaluate', {
      awaitPromise: true,
      expression: `(async () => {
        const step = 600;
        for (let y = 0; y < document.body.scrollHeight + step; y += step) {
          window.scrollTo(0, y);
          await new Promise(r => setTimeout(r, 200));
        }
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise(r => setTimeout(r, 2000));
        window.scrollTo(0, 0);
        await new Promise(r => setTimeout(r, 2000));
        return true;
      })()`,
    }, 240000).catch((e) => console.log('[scroll]', e.message));

    await cdp.send('Runtime.evaluate', {
      awaitPromise: true,
      expression: `(async () => {
        document.querySelectorAll('img[loading="lazy"]').forEach(i => i.loading = 'eager');
        const t0 = Date.now();
        while (Date.now() - t0 < 20000) {
          if ([...document.images].every(i => i.complete)) break;
          await new Promise(r => setTimeout(r, 300));
        }
        if (document.fonts?.ready) { try { await document.fonts.ready } catch(e) {} }
        return true;
      })()`,
    }, 45000).catch(() => {});
    await sleep(2500);

    const info = await cdp.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => ({
        title: document.title, url: location.href,
        scrollHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth,
        vw: innerWidth, vh: innerHeight,
        images: document.images.length,
        videos: [...document.querySelectorAll('video')].map(v => ({ src: (v.currentSrc||v.src||'').slice(0,200), poster: (v.poster||'').slice(0,200), w: v.videoWidth, h: v.videoHeight, paused: v.paused })),
        iframes: [...document.querySelectorAll('iframe')].map(f => f.src)
      }))()`,
    });
    const meta = info.result.value;
    console.log('[page]', JSON.stringify({ ...meta, videos: meta.videos }));

    const metrics = await cdp.send('Page.getLayoutMetrics');
    const content = metrics.cssContentSize ?? metrics.contentSize;
    const fullH = Math.ceil(content.height);

    const shotPath = path.join(OUT, `${LABEL}-full.png`);
    const shot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: WIDTH, height: fullH, scale: 1 },
    }, 300000);
    await fsp.writeFile(shotPath, Buffer.from(shot.data, 'base64'));
    const st = await fsp.stat(shotPath);
    console.log(`[shot] ${shotPath} ${WIDTH}x${fullH} ${(st.size / 1024).toFixed(0)}KB`);

    // Viewport segments — the page as actually scrolled through.
    const segDir = path.join(OUT, `${LABEL}-segments`);
    await fsp.mkdir(segDir, { recursive: true });
    let idx = 0;
    for (let y = 0; y < meta.scrollHeight; y += HEIGHT) {
      await cdp.send('Runtime.evaluate', { expression: `window.scrollTo(0, ${y})` });
      await sleep(850);
      const s = await cdp.send('Page.captureScreenshot', { format: 'png' }, 120000);
      await fsp.writeFile(path.join(segDir, `seg-${String(idx).padStart(2, '0')}.png`), Buffer.from(s.data, 'base64'));
      idx++;
    }
    await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo(0,0)' });
    console.log(`[shot] ${idx} segments -> ${segDir}`);

    const html = await cdp.send('Runtime.evaluate', { returnByValue: true, expression: 'document.documentElement.outerHTML' });
    await fsp.writeFile(path.join(OUT, `${LABEL}-rendered.html`), html.result.value ?? '', 'utf8');

    const outline = await cdp.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const rows = [];
        document.querySelectorAll('header,footer,section,main,nav,h1,h2,h3,h4,video,form,iframe,[class*="section"],[class*="banner"],[class*="slide"]').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.height < 8) return;
          rows.push({ tag: el.tagName.toLowerCase(), id: el.id||'', cls: el.className && String(el.className).slice(0,110),
            top: Math.round(r.top + scrollY), height: Math.round(r.height),
            text: (el.innerText||'').replace(/\\s+/g,' ').trim().slice(0,200) });
        });
        return rows.sort((a,b)=>a.top-b.top).slice(0,350);
      })()`,
    });
    await fsp.writeFile(path.join(OUT, `${LABEL}-outline.json`), JSON.stringify(outline.result.value ?? [], null, 2), 'utf8');

    await fsp.writeFile(path.join(OUT, `${LABEL}-report.json`), JSON.stringify({
      label: LABEL, url: TARGET, capturedAt: new Date().toISOString(),
      dnsBypassed: true, hostCount: rules.length,
      meta, contentSize: content, segments: idx, failedRequests: failed.slice(0, 40),
    }, null, 2), 'utf8');

    console.log('[done]');
  } finally {
    try { cdp?.ws.close(); } catch {}
    try { child.kill(); } catch {}
    try { fs.closeSync(logFd); } catch {}
    await sleep(500);
    await fsp.rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((e) => {
  console.error('[fatal]', e.stack || e.message);
  process.exit(1);
});
