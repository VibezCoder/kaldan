/** Dumps text-element geometry/colour and a full-page screenshot for pixel contrast checking. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL_ = process.argv[2] ?? 'http://localhost:4173/';
const OUT = path.resolve(process.argv[3] ?? './capture/contrast');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.events = new Map();
    ws.addEventListener('message', (ev) => {
      let m; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : ''); } catch { return; }
      if (m.id !== undefined && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      } else if (m.method) for (const fn of this.events.get(m.method) ?? []) fn(m.params);
    });
  }
  send(method, params = {}, t = 90000) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => (this.pending.delete(id), rej(new Error('timeout ' + method))), t);
      this.pending.set(id, { resolve: (v) => (clearTimeout(timer), res(v)), reject: (e) => (clearTimeout(timer), rej(e)) });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  once(m, t = 60000) {
    return new Promise((res, rej) => {
      const fn = (p) => { clearTimeout(timer); this.events.set(m, (this.events.get(m) ?? []).filter((f) => f !== fn)); res(p); };
      this.events.set(m, [...(this.events.get(m) ?? []), fn]);
      const timer = setTimeout(() => rej(new Error('timeout ' + m)), t);
    });
  }
}

async function main() {
  await fsp.mkdir(OUT, { recursive: true });
  const profile = await fsp.mkdtemp(path.join(os.tmpdir(), 'ct-'));
  const logFd = fs.openSync(path.join(os.tmpdir(), 'ct.log'), 'w');
  const child = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--hide-scrollbars', '--mute-audio', 'about:blank',
  ], { stdio: ['ignore', 'ignore', logFd], windowsHide: true });

  let cdp;
  try {
    const pf = path.join(profile, 'DevToolsActivePort');
    let port = null;
    for (let i = 0; i < 150; i++) {
      if (fs.existsSync(pf)) { port = Number((await fsp.readFile(pf, 'utf8')).split(/\r?\n/)[0]); if (port) break; }
      await sleep(200);
    }
    let target = null;
    for (let i = 0; i < 50 && !target; i++) {
      try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page' && t.webSocketDebuggerUrl); } catch {}
      if (!target) await sleep(200);
    }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', () => rej(new Error('ws')), { once: true }); });
    cdp = new CDP(ws);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    const loaded = cdp.once('Page.loadEventFired', 45000).catch(() => null);
    await cdp.send('Page.navigate', { url: URL_ }, 45000);
    await loaded;
    await sleep(3000);

    // reveal everything, then return to top
    await cdp.send('Runtime.evaluate', {
      awaitPromise: true,
      expression: `(async () => { const s = 800; for (let y = 0; y < document.body.scrollHeight + s; y += s) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 90)); } window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 1200)); return 1; })()`,
    }, 180000).catch(() => {});

    const els = await cdp.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const out = [];
        document.querySelectorAll('p,h1,h2,h3,h4,cite,figcaption,a,button,li,span').forEach(el => {
          const t = (el.innerText || '').trim();
          if (!t || t.length < 2) return;
          if (el.closest('[aria-hidden="true"]')) return;
          // only leaf-ish text nodes to avoid duplicates
          if (el.querySelector('h1,h2,h3,p,li')) return;
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.5) return;
          const r = el.getBoundingClientRect();
          if (r.width < 6 || r.height < 6) return;
          out.push({
            text: t.replace(/\\s+/g,' ').slice(0, 46),
            tag: el.tagName.toLowerCase(),
            x: Math.round(r.left), y: Math.round(r.top + window.scrollY),
            w: Math.round(r.width), h: Math.round(r.height),
            color: cs.color, size: Math.round(parseFloat(cs.fontSize)),
            weight: Number(cs.fontWeight)
          });
        });
        return out;
      })()`,
    });

    const height = (await cdp.send('Page.getLayoutMetrics')).cssContentSize.height;
    const shot = await cdp.send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: 1440, height: Math.ceil(height), scale: 1 },
    }, 240000);
    await fsp.writeFile(path.join(OUT, 'page.png'), Buffer.from(shot.data, 'base64'));
    await fsp.writeFile(path.join(OUT, 'elements.json'), JSON.stringify(els.result.value, null, 2), 'utf8');
    console.log(`elements: ${els.result.value.length}  page height: ${Math.round(height)}`);
    console.log(`wrote ${path.join(OUT, 'page.png')} and elements.json`);
  } finally {
    try { cdp?.ws.close(); } catch {}
    try { child.kill(); } catch {}
    try { fs.closeSync(logFd); } catch {}
    await sleep(300);
    await fsp.rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}
main().catch((e) => { console.error('[fatal]', e.stack || e.message); process.exit(1); });