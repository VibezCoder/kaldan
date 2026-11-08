/**
 * Reusable headless-Chrome session over CDP.
 * Spawns Chrome with stdio redirected to files (no pipes), connects over WebSocket.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe') : '',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

export const CHROME = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
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
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method) {
        const subs = this.events.get(msg.method);
        if (subs) for (const fn of [...subs]) fn(msg.params);
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
        resolve: (v) => (clearTimeout(timer), resolve(v)),
        reject: (e) => (clearTimeout(timer), reject(e)),
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  once(method, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      const list = this.events.get(method) ?? [];
      const fn = (params) => {
        clearTimeout(timer);
        this.events.set(method, (this.events.get(method) ?? []).filter((f) => f !== fn));
        resolve(params);
      };
      list.push(fn);
      this.events.set(method, list);
      const timer = setTimeout(() => reject(new Error(`event timeout: ${method}`)), timeoutMs);
    });
  }

  on(method, fn) {
    const list = this.events.get(method) ?? [];
    list.push(fn);
    this.events.set(method, list);
  }
}

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export async function launchChrome({ width = 1440, height = 900, mobile = false, logDir } = {}) {
  if (!CHROME) throw new Error('Chrome/Edge executable not found');
  const profileDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cdp-profile-'));
  const logPath = path.join(logDir ?? os.tmpdir(), `chrome-${Date.now()}.log`);
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
      '--disable-background-networking',
      '--disable-features=Translate,OptimizationHints,MediaRouter',
      '--hide-scrollbars',
      '--mute-audio',
      '--autoplay-policy=no-user-gesture-required',
      '--force-device-scale-factor=1',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', logFd], windowsHide: true },
  );

  const portFile = path.join(profileDir, 'DevToolsActivePort');
  let port = null;
  for (let i = 0; i < 200; i++) {
    if (fs.existsSync(portFile)) {
      const [p] = (await fsp.readFile(portFile, 'utf8')).split(/\r?\n/);
      if (p) {
        port = Number(p);
        break;
      }
    }
    if (child.exitCode !== null) throw new Error(`Chrome exited early (code ${child.exitCode}); log: ${logPath}`);
    await sleep(150);
  }
  if (!port) throw new Error('Chrome did not open a DevTools port');

  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    } catch {}
    if (!target) await sleep(200);
  }
  if (!target) throw new Error('no CDP page target');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('CDP websocket failed')), { once: true });
  });
  const cdp = new CDP(ws);

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Network.setUserAgentOverride', { userAgent: UA, platform: 'Win32' });
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
    screenWidth: width,
    screenHeight: height,
  });

  const resourceUrls = new Set();
  cdp.on('Network.responseReceived', (p) => {
    if (p.response?.url) resourceUrls.add(p.response.url);
  });

  return {
    cdp,
    port,
    async goto(url, { waitMs = 4000, timeoutMs = 60000 } = {}) {
      resourceUrls.clear();
      const loaded = cdp.once('Page.loadEventFired', timeoutMs).catch(() => null);
      await cdp.send('Page.navigate', { url }, timeoutMs);
      await loaded;
      await sleep(waitMs);
      const info = await cdp.send('Runtime.evaluate', {
        returnByValue: true,
        expression: `(() => {
          const outline = [];
          document.querySelectorAll('h1,h2,h3,h4,section,header,footer,nav,form,video,iframe').forEach((el) => {
            const r = el.getBoundingClientRect();
            if (r.height < 6) return;
            outline.push({
              tag: el.tagName.toLowerCase(), id: el.id || '',
              cls: (el.className && String(el.className).slice(0,100)) || '',
              top: Math.round(r.top + window.scrollY), height: Math.round(r.height),
              text: (el.innerText||'').replace(/\\s+/g,' ').trim().slice(0,160)
            });
          });
          return {
            title: document.title,
            url: location.href,
            html: document.documentElement.outerHTML,
            outline: outline.sort((a,b)=>a.top-b.top).slice(0,300),
            links: [...new Set([...document.querySelectorAll('a[href]')].map(a => a.href))].slice(0,300)
          };
        })()`,
      });
      return { ...info.result.value, resourceUrls: [...resourceUrls] };
    },
    async close() {
      try { ws.close(); } catch {}
      try { child.kill(); } catch {}
      try { fs.closeSync(logFd); } catch {}
      await sleep(400);
      try { await fsp.rm(profileDir, { recursive: true, force: true }); } catch {}
    },
  };
}
