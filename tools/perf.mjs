/**
 * Measures real page performance in Chrome (DNS bypassed).
 * Reports transferred bytes per resource, paint timings, LCP, and video metadata.
 */
import { spawn } from 'node:child_process';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TARGET = process.argv[2] ?? 'https://www.kaldanhotels.com/';
const OUT = path.resolve(process.argv[3] ?? './capture/perf');
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
  send(method, params = {}, t = 60000) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => (this.pending.delete(id), rej(new Error('timeout ' + method))), t);
      this.pending.set(id, { resolve: (v) => (clearTimeout(timer), res(v)), reject: (e) => (clearTimeout(timer), rej(e)) });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  once(method, t = 60000) {
    return new Promise((res, rej) => {
      const fn = (p) => { clearTimeout(timer); this.events.set(method, (this.events.get(method) ?? []).filter((f) => f !== fn)); res(p); };
      this.events.set(method, [...(this.events.get(method) ?? []), fn]);
      const timer = setTimeout(() => rej(new Error('event timeout ' + method)), t);
    });
  }
  on(m, fn) { this.events.set(m, [...(this.events.get(m) ?? []), fn]); }
}

async function main() {
  await fsp.mkdir(OUT, { recursive: true });
  const hosts = ['www.kaldanhotels.com', 'assets.simplotel.com', 'cdn1.simplotel.com', 'cdnjs.cloudflare.com',
    'www.googletagmanager.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'bookings.kaldanhotels.com',
    'static.sojern.com', 'cdn.jsdelivr.net', 'cdn.plyr.io', 'www.google-analytics.com', 'connect.facebook.net',
    'www.facebook.com', 'www.instagram.com', 'www.youtube.com', 'www.tripadvisor.in', 'www.jscache.com',
    'www.google.com', 'www.simplotel.com', 'maps.app.goo.gl', 'www.linkedin.com'];
  const rules = [];
  for (const h of hosts) {
    try { rules.push(`MAP ${h} ${(await dns.resolve4(h))[0]}`); } catch {}
  }

  const profile = await fsp.mkdtemp(path.join(os.tmpdir(), 'perf-'));
  const logFd = fs.openSync(path.join(OUT, '.chrome-perf.log'), 'w');
  const child = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--window-size=1440,900', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--ignore-certificate-errors',
    `--host-resolver-rules=${rules.join(',')}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', logFd], windowsHide: true });

  let cdp;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    let port = null;
    for (let i = 0; i < 150; i++) {
      if (fs.existsSync(portFile)) { port = Number((await fsp.readFile(portFile, 'utf8')).split(/\r?\n/)[0]); if (port) break; }
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
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => {});

    // Sum real transferred bytes via CDP (encodedDataLength is the wire size).
    const byUrl = new Map();
    cdp.on('Network.responseReceived', (p) => { byUrl.set(p.requestId, { url: p.response.url, type: p.type, status: p.response.status, mime: p.response.mimeType }); });
    cdp.on('Network.loadingFinished', (p) => {
      const e = byUrl.get(p.requestId);
      if (e) { e.encoded = p.encodedDataLength; e.decoded = p.decodedBodyLength; }
    });

    // Inject LCP observer before navigation.
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.__lcp = 0; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({type:'largest-contentful-paint', buffered:true}); } catch(e) {}
               window.__cls = 0; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({type:'layout-shift', buffered:true}); } catch(e) {}`,
    });

    const t0 = Date.now();
    const loaded = cdp.once('Page.loadEventFired', 90000).catch(() => null);
    await cdp.send('Page.navigate', { url: TARGET }, 90000);
    await loaded;
    const loadMs = Date.now() - t0;
    await sleep(8000);

    const res = await cdp.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const nav = performance.getEntriesByType('navigation')[0] || {};
        const paints = {};
        performance.getEntriesByType('paint').forEach(p => paints[p.name] = Math.round(p.startTime));
        const rs = performance.getEntriesByType('resource').map(r => ({
          name: r.name, type: r.initiatorType, transfer: r.transferSize, encoded: r.encodedBodySize,
          duration: Math.round(r.duration)
        }));
        return { nav: { dcl: Math.round(nav.domContentLoadedEventEnd||0), load: Math.round(nav.loadEventEnd||0),
                        ttfb: Math.round(nav.responseStart||0), transfer: nav.transferSize||0 }, paints,
                 lcp: Math.round(window.__lcp||0), cls: +(window.__cls||0).toFixed(4), resources: rs,
                 videos: [...document.querySelectorAll('video')].map(v => ({ w: v.videoWidth, h: v.videoHeight, duration: v.duration, src: v.currentSrc })) };
      })()`,
    });
    const data = res.result.value;

    const cdpResources = [...byUrl.values()].filter((e) => e.encoded).sort((a, b) => b.encoded - a.encoded);
    const cdpTotal = cdpResources.reduce((s, e) => s + e.encoded, 0);

    const byType = {};
    for (const e of cdpResources) {
      const k = e.type || 'Other';
      byType[k] = byType[k] ?? { count: 0, bytes: 0 };
      byType[k].count++; byType[k].bytes += e.encoded;
    }

    console.log('=== PAGE PERFORMANCE (cold, 1440x900, no cache) ===');
    console.log(`  TTFB                : ${data.nav.ttfb} ms`);
    console.log(`  First paint         : ${JSON.stringify(data.paints)}`);
    console.log(`  LCP                 : ${data.lcp} ms`);
    console.log(`  CLS                 : ${data.cls}`);
    console.log(`  DOMContentLoaded    : ${data.nav.dcl} ms`);
    console.log(`  Load event          : ${data.nav.load} ms  (wall ${loadMs} ms)`);
    console.log(`  TOTAL transferred   : ${(cdpTotal / 1048576).toFixed(2)} MB over ${cdpResources.length} requests`);
    console.log('\n  By resource type:');
    for (const [k, v] of Object.entries(byType).sort((a, b) => b[1].bytes - a[1].bytes)) {
      console.log(`    ${k.padEnd(12)} ${String(v.count).padStart(4)} req  ${(v.bytes / 1048576).toFixed(2)} MB`);
    }
    console.log('\n  Heaviest 15 requests:');
    for (const e of cdpResources.slice(0, 15)) {
      console.log(`    ${(e.encoded / 1024).toFixed(0).padStart(6)} KB  ${(e.mime || '').padEnd(24)} ${e.url.slice(0, 88)}`);
    }
    console.log('\n  Video metadata:', JSON.stringify(data.videos));

    await fsp.writeFile(path.join(OUT, 'perf.json'), JSON.stringify({ url: TARGET, capturedAt: new Date().toISOString(), loadMs, metrics: data, cdpTotal, byType, resources: cdpResources }, null, 2), 'utf8');
    console.log(`\nWrote ${path.join(OUT, 'perf.json')}`);
  } finally {
    try { cdp?.ws.close(); } catch {}
    try { child.kill(); } catch {}
    try { fs.closeSync(logFd); } catch {}
    await sleep(400);
    await fsp.rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}
main().catch((e) => { console.error('[fatal]', e.stack || e.message); process.exit(1); });
