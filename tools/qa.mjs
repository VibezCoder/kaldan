/**
 * Prototype QA: console errors, failed requests, CLS/LCP, overflow, screenshots.
 * Usage: node qa.mjs [url] [outDir]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL_ = process.argv[2] ?? 'http://localhost:5173/';
const OUT = path.resolve(process.argv[3] ?? './capture/qa');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, mobile: false },
  { name: 'tablet', width: 834, height: 1112, mobile: true },
  { name: 'mobile', width: 390, height: 844, mobile: true },
  { name: 'mobile-sm', width: 320, height: 640, mobile: true },
];

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
  send(method, params = {}, t = 60000) {
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
      const timer = setTimeout(() => rej(new Error('event timeout ' + m)), t);
    });
  }
  on(m, fn) { this.events.set(m, [...(this.events.get(m) ?? []), fn]); }
}

async function main() {
  await fsp.mkdir(OUT, { recursive: true });
  const profile = await fsp.mkdtemp(path.join(os.tmpdir(), 'qa-'));
  const logFd = fs.openSync(path.join(OUT, '.chrome.log'), 'w');
  const child = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--mute-audio', '--autoplay-policy=no-user-gesture-required',
    '--force-device-scale-factor=1', 'about:blank',
  ], { stdio: ['ignore', 'ignore', logFd], windowsHide: true });

  let cdp;
  const results = [];
  try {
    const pf = path.join(profile, 'DevToolsActivePort');
    let port = null;
    for (let i = 0; i < 150; i++) {
      if (fs.existsSync(pf)) { port = Number((await fsp.readFile(pf, 'utf8')).split(/\r?\n/)[0]); if (port) break; }
      if (child.exitCode !== null) throw new Error('chrome exited');
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
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable');

    for (const vp of VIEWPORTS) {
      const consoleErrors = [];
      const failed = [];
      const onConsole = (p) => {
        if (p.type === 'error') consoleErrors.push((p.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
      };
      const onFail = (p) => failed.push({ error: p.errorText, type: p.type });
      cdp.on('Runtime.consoleAPICalled', onConsole);
      cdp.on('Network.loadingFailed', onFail);

      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width, height: vp.height, deviceScaleFactor: 1,
        mobile: vp.mobile, screenWidth: vp.width, screenHeight: vp.height,
      });
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: vp.mobile, maxTouchPoints: 5 }).catch(() => {});
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `window.__cls=0;try{new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__cls+=e.value}).observe({type:'layout-shift',buffered:true})}catch(e){}
                 window.__lcp=0;try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lcp=e.startTime}).observe({type:'largest-contentful-paint',buffered:true})}catch(e){}`,
      });

      const loaded = cdp.once('Page.loadEventFired', 45000).catch(() => null);
      await cdp.send('Page.navigate', { url: URL_ }, 45000);
      await loaded;
      await sleep(2500);

      // Measure CLS/LCP BEFORE scrolling — scrolling paints new large images and
      // would otherwise register them as LCP candidates, inflating the number.
      const early = await cdp.send('Runtime.evaluate', {
        returnByValue: true,
        expression: `(() => { const n = performance.getEntriesByType('navigation')[0] || {};
          return { cls: +(window.__cls||0).toFixed(4), lcp: Math.round(window.__lcp||0),
                   dcl: Math.round(n.domContentLoadedEventEnd||0), load: Math.round(n.loadEventEnd||0) }; })()`,
      });

      // scroll through to settle scroll-triggered layout
      await cdp.send('Runtime.evaluate', {
        awaitPromise: true,
        expression: `(async()=>{const s=600;for(let y=0;y<document.body.scrollHeight+600;y+=s){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,90));}window.scrollTo(0,0);await new Promise(r=>setTimeout(r,600));return 1})()`,
      }, 120000).catch(() => {});
      await sleep(800);

      const m = await cdp.send('Runtime.evaluate', {
        returnByValue: true,
        expression: `(() => {
          const de = document.documentElement;
          const over = [...document.querySelectorAll('body *')].filter(el => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && (r.right > innerWidth + 2 || r.left < -2);
          }).slice(0, 6).map(el => ({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0,44), right: Math.round(el.getBoundingClientRect().right) }));
          const nav = performance.getEntriesByType('navigation')[0] || {};
          return {
            scrollWidth: de.scrollWidth, innerWidth, docHeight: de.scrollHeight,
            overflow: de.scrollWidth > innerWidth + 1,
            offenders: over,
            cls: +(window.__cls || 0).toFixed(4),
            lcp: Math.round(window.__lcp || 0),
            dcl: Math.round(nav.domContentLoadedEventEnd || 0),
            load: Math.round(nav.loadEventEnd || 0),
            h1: document.querySelector('h1')?.innerText.replace(/\\s+/g,' ').trim(),
            h1Top: Math.round(document.querySelector('h1')?.getBoundingClientRect().top ?? -1),
            headings: [...document.querySelectorAll('h1,h2,h3')].map(h => h.tagName + ':' + h.innerText.replace(/\\s+/g,' ').trim().slice(0,42)),
            imgCount: document.images.length,
            videoSrc: document.querySelector('.hero__video')?.currentSrc || '(none)',
            videoReady: !!document.querySelector('.hero__video.is-ready'),
            sections: [...document.querySelectorAll('main > section')].length,
          };
        })()`,
      });
      const r = m.result.value;

      const shot = await cdp.send('Page.captureScreenshot', {
        format: 'png', captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: vp.width, height: Math.min(r.docHeight, 30000), scale: 1 },
      }, 240000);
      const file = path.join(OUT, `${vp.name}.png`);
      await fsp.writeFile(file, Buffer.from(shot.data, 'base64'));

      const e = early.result.value;
      results.push({ viewport: vp, ...r, cls: e.cls, lcp: e.lcp, dcl: e.dcl, load: e.load, consoleErrors: [...new Set(consoleErrors)].slice(0, 8), failed: failed.slice(0, 8), screenshot: file });

      console.log(`\n=== ${vp.name} (${vp.width}x${vp.height}) ===`);
      console.log(`  docHeight ${r.docHeight}  scrollWidth ${r.scrollWidth} / inner ${r.innerWidth}  ${r.overflow ? 'OVERFLOW!' : 'no overflow'}`);
      console.log(`  CLS ${e.cls}   LCP ${e.lcp}ms   load ${e.load}ms`);
      console.log(`  H1 top ${r.h1Top}px  "${(r.h1 || '').slice(0, 60)}"`);
      console.log(`  sections ${r.sections}  images ${r.imgCount}`);
      console.log(`  hero video: ${r.videoReady ? 'PLAYING' : 'poster only'} ${r.videoSrc.slice(-40)}`);
      if (r.offenders.length) console.log('  overflow elements:', JSON.stringify(r.offenders));
      if (consoleErrors.length) console.log('  console errors:', [...new Set(consoleErrors)].slice(0, 5));
      if (failed.length) console.log('  failed requests:', failed.slice(0, 5));

      cdp.events.set('Runtime.consoleAPICalled', []);
      cdp.events.set('Network.loadingFailed', []);
    }

    await fsp.writeFile(path.join(OUT, 'qa-report.json'), JSON.stringify(results, null, 2), 'utf8');
    console.log(`\nreport -> ${path.join(OUT, 'qa-report.json')}`);
  } finally {
    try { cdp?.ws.close(); } catch {}
    try { child.kill(); } catch {}
    try { fs.closeSync(logFd); } catch {}
    await sleep(400);
    await fsp.rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}
main().catch((e) => { console.error('[fatal]', e.stack || e.message); process.exit(1); });