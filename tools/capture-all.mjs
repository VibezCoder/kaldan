/**
 * Finds a Chrome configuration that can actually load the network under this
 * sandbox, then captures the full-page screenshots.
 *
 * Configurations are probed in order; the first that renders real content wins.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TARGET = process.argv[2] ?? 'https://www.kaldanhotels.com/';
const OUT = path.resolve(process.argv[3] ?? './capture/desktop');
const LABEL = process.argv[4] ?? 'home-desktop';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.events.get(msg.method) ?? []) fn(msg.params);
      }
    });
  }
  send(method, params = {}, timeoutMs = 60000) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => (clearTimeout(timer), resolve(v)),
        reject: (e) => (clearTimeout(timer), reject(e)),
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  once(method, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      const fn = (p) => {
        clearTimeout(timer);
        this.events.set(method, (this.events.get(method) ?? []).filter((f) => f !== fn));
        resolve(p);
      };
      this.events.set(method, [...(this.events.get(method) ?? []), fn]);
      const timer = setTimeout(() => reject(new Error(`event timeout ${method}`)), timeoutMs);
    });
  }
  on(m, fn) {
    this.events.set(m, [...(this.events.get(m) ?? []), fn]);
  }
}

const CONFIGS = [
  { name: 'single-process', args: ['--single-process', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] },
  { name: 'default', args: ['--disable-gpu'] },
  { name: 'no-sandbox', args: ['--no-sandbox', '--disable-gpu'] },
];

async function tryConfig(cfg, width, height) {
  const profileDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'kaldan-prof-'));
  const logPath = path.join(OUT, `.chrome-${cfg.name}.log`);
  const logFd = fs.openSync(logPath, 'w');

  const child = spawn(
    CHROME,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profileDir}`,
      `--window-size=${width},${height}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--hide-scrollbars',
      '--mute-audio',
      '--autoplay-policy=no-user-gesture-required',
      '--force-device-scale-factor=1',
      ...cfg.args,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', logFd], windowsHide: true },
  );

  let cdp = null;
  const cleanup = async () => {
    try { cdp?.ws.close(); } catch {}
    try { child.kill(); } catch {}
    try { fs.closeSync(logFd); } catch {}
    await sleep(500);
    try { await fsp.rm(profileDir, { recursive: true, force: true }); } catch {}
  };

  try {
    const portFile = path.join(profileDir, 'DevToolsActivePort');
    let port = null;
    for (let i = 0; i < 120; i++) {
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
      width, height, deviceScaleFactor: 1, mobile: false, screenWidth: width, screenHeight: height,
    });

    const loaded = cdp.once('Page.loadEventFired', 45000).catch(() => null);
    await cdp.send('Page.navigate', { url: TARGET }, 45000);
    await loaded;
    await sleep(3000);

    const probe = await cdp.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `({ href: location.href, title: document.title, textLen: (document.body?.innerText||'').length, imgs: document.images.length })`,
    });
    const v = probe.result.value;
    const ok = !v.href.startsWith('chrome-error') && v.textLen > 500;
    return { ok, cdp, child, cleanup, probe: v, logPath };
  } catch (e) {
    await cleanup();
    throw e;
  }
}

async function main() {
  await fsp.mkdir(OUT, { recursive: true });

  let session = null;
  let winner = null;
  for (const cfg of CONFIGS) {
    process.stdout.write(`[probe] ${cfg.name} … `);
    try {
      const res = await tryConfig(cfg, 1440, 900);
      console.log(res.ok ? `OK (${res.probe.textLen} chars, ${res.probe.imgs} imgs)` : `FAILED (${res.probe.href})`);
      if (res.ok) {
        session = res;
        winner = cfg;
        break;
      }
      await res.cleanup();
    } catch (e) {
      console.log(`ERROR ${e.message}`);
    }
  }

  if (!session) {
    console.log('No working Chrome configuration found.');
    return;
  }
  console.log(`[probe] using "${winner.name}"`);

  const { cdp, cleanup } = session;
  // Reset to a clean viewport now that we know the config works.
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false, screenWidth: 1440, screenHeight: 900,
  });

  try {
    // Reload cleanly with the known-good config.
    const loaded = cdp.once('Page.loadEventFired', 60000).catch(() => null);
    await cdp.send('Page.navigate', { url: TARGET }, 60000);
    await loaded;
    await sleep(6000);

    // Trigger lazy content + scroll animations.
    await cdp.send('Runtime.evaluate', {
      awaitPromise: true,
      expression: `(async () => {
        const step = 700;
        for (let y = 0; y < document.body.scrollHeight + step; y += step) {
          window.scrollTo(0, y);
          await new Promise(r => setTimeout(r, 220));
        }
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise(r => setTimeout(r, 1500));
        window.scrollTo(0, 0);
        await new Promise(r => setTimeout(r, 1500));
        return true;
      })()`,
    }, 180000).catch((e) => console.log('[scroll]', e.message));

    await cdp.send('Runtime.evaluate', {
      awaitPromise: true,
      expression: `(async () => {
        document.querySelectorAll('img[loading="lazy"]').forEach(i => i.loading = 'eager');
        const t0 = Date.now();
        while (Date.now() - t0 < 15000) {
          if ([...document.images].every(i => i.complete)) break;
          await new Promise(r => setTimeout(r, 300));
        }
        if (document.fonts?.ready) { try { await document.fonts.ready } catch(e) {} }
        return true;
      })()`,
    }, 40000).catch(() => {});
    await sleep(2000);

    const info = await cdp.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => ({
        title: document.title, url: location.href,
        scrollHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth,
        vh: innerHeight, vw: innerWidth,
        images: document.images.length,
        videos: [...document.querySelectorAll('video')].map(v => ({src: v.currentSrc || v.src, poster: v.poster, w: v.videoWidth, h: v.videoHeight})),
        iframes: [...document.querySelectorAll('iframe')].map(f => f.src)
      }))()`,
    });
    const meta = info.result.value;
    console.log('[page]', JSON.stringify({ ...meta, videos: meta.videos.length }));

    const metrics = await cdp.send('Page.getLayoutMetrics');
    const content = metrics.cssContentSize ?? metrics.contentSize;
    const fullH = Math.ceil(content.height);
    console.log(`[layout] ${content.width} x ${fullH}`);

    // Full page in one shot when feasible, otherwise chunked.
    const shotPath = path.join(OUT, `${LABEL}-full.png`);
    if (fullH <= 16000) {
      const shot = await cdp.send('Page.captureScreenshot', {
        format: 'png', captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: 1440, height: fullH, scale: 1 },
      }, 240000);
      await fsp.writeFile(shotPath, Buffer.from(shot.data, 'base64'));
    } else {
      const chunkDir = path.join(OUT, `${LABEL}-chunks`);
      await fsp.mkdir(chunkDir, { recursive: true });
      const CH = 6000;
      let i = 0;
      for (let y = 0; y < fullH; y += CH) {
        const h = Math.min(CH, fullH - y);
        const s = await cdp.send('Page.captureScreenshot', {
          format: 'png', captureBeyondViewport: true,
          clip: { x: 0, y, width: 1440, height: h, scale: 1 },
        }, 240000);
        await fsp.writeFile(path.join(chunkDir, `chunk-${String(i).padStart(2,'0')}.png`), Buffer.from(s.data, 'base64'));
        i++;
      }
      console.log(`[shot] ${i} chunks -> ${chunkDir} (stitch needed)`);
    }
    const st = await fsp.stat(shotPath).catch(() => null);
    console.log(`[shot] ${shotPath} ${st ? (st.size / 1024).toFixed(0) + ' KB' : '(chunked)'}`);

    // Viewport-sized scroll segments (as experienced).
    const segDir = path.join(OUT, `${LABEL}-segments`);
    await fsp.mkdir(segDir, { recursive: true });
    const totalH = meta.scrollHeight;
    let idx = 0;
    for (let y = 0; y < totalH; y += 900) {
      await cdp.send('Runtime.evaluate', { expression: `window.scrollTo(0, ${y})` });
      await sleep(900);
      const s = await cdp.send('Page.captureScreenshot', { format: 'png' }, 120000);
      await fsp.writeFile(path.join(segDir, `seg-${String(idx).padStart(2, '0')}.png`), Buffer.from(s.data, 'base64'));
      idx++;
    }
    await cdp.send('Runtime.evaluate', { expression: `window.scrollTo(0, 0)` });
    console.log(`[shot] ${idx} segments -> ${segDir}`);

    const html = await cdp.send('Runtime.evaluate', { returnByValue: true, expression: 'document.documentElement.outerHTML' });
    await fsp.writeFile(path.join(OUT, `${LABEL}-rendered.html`), html.result.value ?? '', 'utf8');

    const outline = await cdp.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const rows = [];
        document.querySelectorAll('header,footer,section,main,nav,h1,h2,h3,h4,video,form,[class*="section"],[class*="banner"]').forEach(el => {
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
      label: LABEL, url: TARGET, config: winner.name, capturedAt: new Date().toISOString(),
      meta, contentSize: content, segments: idx,
    }, null, 2), 'utf8');
    console.log('[done]');
  } finally {
    await cleanup();
  }
}

main().catch((e) => {
  console.error('[fatal]', e.stack || e.message);
  process.exit(1);
});