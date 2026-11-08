/**
 * Verifies the accessibility / data-saving fallbacks and asset loading.
 *   A. prefers-reduced-motion: reduce  -> content visible, no film loaded
 *   B. navigator.connection.saveData   -> no film loaded
 *   C. normal load                     -> every image decodes, every video reachable
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL_ = process.argv[2] ?? 'http://localhost:5173/';
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
  once(m, t = 60000) {
    return new Promise((res, rej) => {
      const fn = (p) => { clearTimeout(timer); this.events.set(m, (this.events.get(m) ?? []).filter((f) => f !== fn)); res(p); };
      this.events.set(m, [...(this.events.get(m) ?? []), fn]);
      const timer = setTimeout(() => rej(new Error('event timeout ' + m)), t);
    });
  }
}

async function main() {
  const profile = await fsp.mkdtemp(path.join(os.tmpdir(), 'fb-'));
  const logFd = fs.openSync(path.join(os.tmpdir(), 'fb-chrome.log'), 'w');
  const child = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
    '--autoplay-policy=no-user-gesture-required', 'about:blank',
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
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    const goto = async (setup) => {
      await cdp.send('Page.navigate', { url: 'about:blank' });
      await sleep(200);
      const loaded = cdp.once('Page.loadEventFired', 45000).catch(() => null);
      await cdp.send('Page.navigate', { url: URL_ }, 45000);
      await loaded;
      await sleep(3500);
    };

    // Evaluate-on-new-document scripts persist for the whole session; track and remove them.
    const scriptIds = [];
    const addInitScript = async (source) => {
      const r = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source });
      scriptIds.push(r.identifier);
    };
    const clearInitScripts = async () => {
      while (scriptIds.length) {
        const id = scriptIds.pop();
        await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: id }).catch(() => {});
      }
    };

    const probe = async () => {
      const r = await cdp.send('Runtime.evaluate', {
        returnByValue: true,
        expression: `(() => {
          // Only elements that should already have been revealed (in or above the viewport).
          const inView = el => el.getBoundingClientRect().top < window.innerHeight + 40;
          const hidden = [...document.querySelectorAll('[data-reveal]')]
            .filter(el => inView(el) && parseFloat(getComputedStyle(el).opacity) < 0.5).length;
          const linesHidden = [...document.querySelectorAll('.mask .line')]
            .filter(el => inView(el) && (() => { const t = getComputedStyle(el).transform;
              return t && t !== 'none' && !/matrix\\(1, 0, 0, 1, 0, 0\\)/.test(t); })()).length;
          const hero = document.querySelector('.hero__video');
          const films = [...document.querySelectorAll('.venue__media video, .panch__movie video')];
          return {
            revealHidden: hidden,
            linesHidden,
            heroHasSrc: !!(hero && (hero.currentSrc || hero.getAttribute('src'))),
            heroPlaying: !!(hero && !hero.paused),
            filmSrcCount: films.filter(v => v.currentSrc || v.getAttribute('src')).length,
            filmCount: films.length,
            bodyTextLen: document.body.innerText.length,
            h1Visible: (() => { const h = document.querySelector('h1'); if (!h) return false; const cs = getComputedStyle(h); return cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.5; })(),
          };
        })()`,
      });
      return r.result.value;
    };

    // ── A. reduced motion
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await goto();
    const a = await probe();
    console.log('=== A. prefers-reduced-motion: reduce ===');
    console.log(`  content visible        : ${a.revealHidden === 0 && a.linesHidden === 0 ? 'YES' : 'NO'} (hidden reveals ${a.revealHidden}, hidden lines ${a.linesHidden})`);
    console.log(`  h1 visible             : ${a.h1Visible ? 'YES' : 'NO'}`);
    console.log(`  hero film started      : ${a.heroHasSrc ? 'YES (bad)' : 'NO (correct)'}`);
    console.log(`  inline films started   : ${a.filmSrcCount}/${a.filmCount} (correct: 0)`);
    console.log(`  body text              : ${a.bodyTextLen} chars`);

    // ── B. Save-Data
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });
    await addInitScript(
      `Object.defineProperty(navigator, 'connection', { configurable: true, get: () => ({ saveData: true, effectiveType: '4g' }) });`,
    );
    await goto();
    const b = await probe();
    console.log('\n=== B. navigator.connection.saveData = true ===');
    console.log(`  hero film started      : ${b.heroHasSrc ? 'YES (bad)' : 'NO (correct)'}`);
    console.log(`  inline films started   : ${b.filmSrcCount}/${b.filmCount} (correct: 0)`);
    console.log(`  content visible        : ${b.revealHidden === 0 ? 'YES' : 'NO'}`);

    // ── B2. slow network (2g)
    await clearInitScripts();
    await addInitScript(
      `Object.defineProperty(navigator, 'connection', { configurable: true, get: () => ({ saveData: false, effectiveType: '2g' }) });`,
    );
    await goto();
    const b2 = await probe();
    console.log('\n=== B2. effectiveType = 2g ===');
    console.log(`  hero film started      : ${b2.heroHasSrc ? 'YES (bad)' : 'NO (correct)'}`);

    // ── C. normal load: asset integrity
    await clearInitScripts();
    await cdp.send('Page.reload', { ignoreCache: true });
    await sleep(4000);
    // Scroll through so lazy images are actually requested.
    await cdp.send('Runtime.evaluate', {
      awaitPromise: true,
      expression: `(async () => { const s = 700; for (let y = 0; y < document.body.scrollHeight + s; y += s) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 1500)); return 1; })()`,
    }, 120000).catch(() => {});
    await sleep(1200);
    const c = await cdp.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const imgs = [...document.images];
        const broken = imgs.filter(i => i.complete && i.naturalWidth === 0).map(i => i.currentSrc.split('/').pop());
        const notDone = imgs.filter(i => !i.complete).map(i => i.currentSrc.split('/').pop());
        const vids = [...document.querySelectorAll('video')];
        return {
          images: imgs.length, broken, notDone,
          videos: vids.length,
          videoState: vids.map(v => ({ playing: !v.paused, src: (v.currentSrc || '').split('/').pop(), ready: v.readyState })),
        };
      })()`,
    });
    const cc = c.result.value;
    console.log('\n=== C. normal load, asset integrity ===');
    console.log(`  images: ${cc.images}   broken: ${cc.broken.length}   still loading: ${cc.notDone.length}`);
    if (cc.broken.length) console.log('  broken ->', cc.broken);
    if (cc.notDone.length) console.log('  pending ->', cc.notDone);
    console.log(`  videos: ${cc.videos}`);
    cc.videoState.forEach((v) => console.log(`    ${v.src || '(poster only)'}  playing=${v.playing} readyState=${v.ready}`));
  } finally {
    try { cdp?.ws.close(); } catch {}
    try { child.kill(); } catch {}
    try { fs.closeSync(logFd); } catch {}
    await sleep(300);
    await fsp.rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}
main().catch((e) => { console.error('[fatal]', e.stack || e.message); process.exit(1); });