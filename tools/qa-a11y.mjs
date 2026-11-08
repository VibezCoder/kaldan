/** Checks WCAG contrast for visible text and basic keyboard focusability. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL_ = process.argv[2] ?? 'http://localhost:4173/';
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
      const timer = setTimeout(() => rej(new Error('timeout ' + m)), t);
    });
  }
}

async function main() {
  const profile = await fsp.mkdtemp(path.join(os.tmpdir(), 'a11y-'));
  const logFd = fs.openSync(path.join(os.tmpdir(), 'a11y.log'), 'w');
  const child = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--disable-extensions', '--hide-scrollbars', '--mute-audio', 'about:blank',
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
    // reveal everything
    await cdp.send('Runtime.evaluate', {
      awaitPromise: true,
      expression: `(async () => { const s = 800; for (let y = 0; y < document.body.scrollHeight + s; y += s) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 70)); } window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 800)); return 1; })()`,
    }, 120000).catch(() => {});

    const res = await cdp.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const toRgb = (c) => { const m = c.match(/[\\d.]+/g); return m ? m.slice(0,3).map(Number) : null; };
        const lum = ([r,g,b]) => { const f = v => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b); };
        const ratio = (a,b) => { const l1 = lum(a), l2 = lum(b); const hi = Math.max(l1,l2), lo = Math.min(l1,l2); return (hi+0.05)/(lo+0.05); };
        // walk up for an opaque background
        const bgOf = (el) => {
          let n = el;
          while (n && n !== document.documentElement) {
            const c = getComputedStyle(n).backgroundColor;
            const rgba = c.match(/[\\d.]+/g);
            if (rgba && rgba.length >= 3 && (rgba.length < 4 || Number(rgba[3]) > 0.75)) return toRgb(c);
            n = n.parentElement;
          }
          return toRgb(getComputedStyle(document.body).backgroundColor) || [255,255,255];
        };
        const out = [];
        const seen = new Set();
        document.querySelectorAll('p,h1,h2,h3,h4,a,button,cite,span,li').forEach(el => {
          if (!el.innerText || !el.innerText.trim()) return;
          if (el.closest('[aria-hidden="true"]')) return;
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.5) return;
          const r = el.getBoundingClientRect();
          if (r.width < 4 || r.height < 4) return;
          const fg = toRgb(cs.color); if (!fg) return;
          const bg = bgOf(el);
          const size = parseFloat(cs.fontSize);
          const bold = Number(cs.fontWeight) >= 700;
          const large = size >= 24 || (size >= 18.66 && bold);
          const need = large ? 3 : 4.5;
          const cr = ratio(fg, bg);
          const key = cs.color + '|' + bg.join(',') + '|' + Math.round(size);
          if (seen.has(key)) return; seen.add(key);
          out.push({ text: el.innerText.trim().slice(0, 42), tag: el.tagName.toLowerCase(), size: Math.round(size), large, cr: +cr.toFixed(2), need, pass: cr >= need, fg: cs.color, bg: 'rgb(' + bg.join(',') + ')' });
        });
        return out.sort((a,b) => a.cr - b.cr);
      })()`,
    });

    const rows = res.result.value;
    const fails = rows.filter((r) => !r.pass);
    console.log(`text styles checked: ${rows.length}`);
    console.log(`below AA         : ${fails.length}\n`);
    console.log('lowest 14 contrast ratios:');
    rows.slice(0, 14).forEach((r) =>
      console.log(`  ${String(r.cr).padStart(5)}:1  need ${r.need}  ${r.pass ? 'PASS' : 'FAIL'}  ${String(r.size).padStart(2)}px ${r.tag.padEnd(6)} "${r.text}"`),
    );
    if (fails.length) {
      console.log('\nFAILURES:');
      fails.forEach((r) => console.log(`  ${r.cr}:1 (need ${r.need}) ${r.size}px ${r.tag} "${r.text}" fg=${r.fg} bg=${r.bg}`));
    }

    // focusability
    const focus = await cdp.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const focusables = [...document.querySelectorAll('a[href], button, [tabindex]:not([tabindex="-1"])')];
        const noName = focusables.filter(el => !(el.innerText || '').trim() && !el.getAttribute('aria-label') && !el.getAttribute('title'));
        return { count: focusables.length, unnamed: noName.length, imgsNoAlt: [...document.images].filter(i => !i.hasAttribute('alt')).length };
      })()`,
    });
    const f = focus.result.value;
    console.log(`\nfocusable elements: ${f.count}   without accessible name: ${f.unnamed}   images missing alt attribute: ${f.imgsNoAlt}`);
  } finally {
    try { cdp?.ws.close(); } catch {}
    try { child.kill(); } catch {}
    try { fs.closeSync(logFd); } catch {}
    await sleep(300);
    await fsp.rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}
main().catch((e) => { console.error('[fatal]', e.stack || e.message); process.exit(1); });