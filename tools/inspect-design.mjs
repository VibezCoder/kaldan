/**
 * Extracts the above-the-fold composition and the design tokens (fonts, sizes,
 * colours, buttons) from the live homepage.
 */
import { spawn } from 'node:child_process';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TARGET = process.argv[2] ?? 'https://www.kaldanhotels.com/';
const OUT = path.resolve(process.argv[3] ?? './capture/design');
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
    'static.sojern.com', 'cdn.jsdelivr.net', 'cdn.plyr.io', 'www.google-analytics.com', 'www.jscache.com'];
  const rules = [];
  for (const h of hosts) { try { rules.push(`MAP ${h} ${(await dns.resolve4(h))[0]}`); } catch {} }

  const profile = await fsp.mkdtemp(path.join(os.tmpdir(), 'design-'));
  const logFd = fs.openSync(path.join(OUT, '.chrome.log'), 'w');
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
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    const loaded = cdp.once('Page.loadEventFired', 60000).catch(() => null);
    await cdp.send('Page.navigate', { url: TARGET }, 60000);
    await loaded;
    await sleep(7000);

    const r = await cdp.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const rect = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y + scrollY), w: Math.round(b.width), h: Math.round(b.height) }; };
        const cs = (el, p) => getComputedStyle(el).getPropertyValue(p);

        // --- what occupies the first viewport (0-900) ---
        const fold = [];
        document.querySelectorAll('body *').forEach(el => {
          const b = el.getBoundingClientRect();
          const top = b.top + scrollY;
          if (b.width < 40 || b.height < 12) return;
          if (top > 900) return;
          const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim();
          const tag = el.tagName.toLowerCase();
          const isMedia = ['video','img','iframe'].includes(tag);
          if (!own && !isMedia) return;
          const s = getComputedStyle(el);
          fold.push({ tag, cls: (el.className && String(el.className).slice(0,70)) || '', id: el.id || '',
            rect: { x: Math.round(b.x), y: Math.round(top), w: Math.round(b.width), h: Math.round(b.height) },
            position: s.position, zIndex: s.zIndex, fontSize: s.fontSize, fontFamily: s.fontFamily.split(',')[0],
            color: s.color, bg: s.backgroundColor, text: (own || tag.toUpperCase()).slice(0, 90) });
        });

        // --- typography of headings ---
        const type = [];
        document.querySelectorAll('h1,h2,h3,h4,p,a,button,li').forEach(el => {
          if (!el.innerText || el.innerText.trim().length < 3) return;
          const s = getComputedStyle(el);
          const b = el.getBoundingClientRect();
          if (b.height < 6) return;
          type.push({ tag: el.tagName.toLowerCase(), fontSize: s.fontSize, fontFamily: s.fontFamily,
            weight: s.fontWeight, letterSpacing: s.letterSpacing, lineHeight: s.lineHeight,
            textTransform: s.textTransform, color: s.color,
            text: el.innerText.replace(/\\s+/g,' ').trim().slice(0, 60) });
        });

        // --- buttons / CTAs ---
        const ctas = [];
        document.querySelectorAll('a,button').forEach(el => {
          const s = getComputedStyle(el);
          const b = el.getBoundingClientRect();
          if (b.height < 20 || b.width < 40) return;
          const t = (el.innerText || '').replace(/\\s+/g,' ').trim();
          if (!t) return;
          ctas.push({ text: t.slice(0, 40), bg: s.backgroundColor, color: s.color, radius: s.borderRadius,
            padding: s.padding, fontSize: s.fontSize, fontFamily: s.fontFamily.split(',')[0],
            fontWeight: s.fontWeight, textTransform: s.textTransform, letterSpacing: s.letterSpacing,
            w: Math.round(b.width), h: Math.round(b.height) });
        });

        // --- section backgrounds ---
        const bgs = [];
        document.querySelectorAll('div,section,main,footer,header').forEach(el => {
          const s = getComputedStyle(el);
          const b = el.getBoundingClientRect();
          if (b.height < 200) return;
          const bg = s.backgroundColor;
          if (bg === 'rgba(0, 0, 0, 0)') return;
          bgs.push({ tag: el.tagName.toLowerCase(), cls: (el.className && String(el.className).slice(0,60))||'', bg,
            y: Math.round(b.top + scrollY), h: Math.round(b.height) });
        });

        return {
          fold, type, ctas, bgs,
          body: { fontFamily: cs(document.body,'font-family'), fontSize: cs(document.body,'font-size'),
                  color: cs(document.body,'color'), bg: cs(document.body,'background-color') },
          viewport: { w: innerWidth, h: innerHeight }
        };
      })()`,
    });

    const d = r.result.value;
    await fsp.writeFile(path.join(OUT, 'design.json'), JSON.stringify(d, null, 2), 'utf8');

    console.log('=== BODY ===');
    console.log(' ', JSON.stringify(d.body));
    console.log('\n=== FIRST VIEWPORT (0-900px) — what the visitor sees first ===');
    const sorted = d.fold.sort((a, b) => a.rect.y - b.rect.y || a.rect.h - b.rect.h);
    for (const f of sorted.slice(0, 45)) {
      console.log(`  y=${String(f.rect.y).padStart(4)} h=${String(f.rect.h).padStart(4)} x=${String(f.rect.x).padStart(4)} w=${String(f.rect.w).padStart(4)} ${f.position.padEnd(8)} ${f.tag.padEnd(6)} ${(f.fontSize||'').padEnd(6)} ${f.color.padEnd(18)} ${f.bg.padEnd(20)} "${f.text.slice(0,52)}"`);
    }

    console.log('\n=== HEADING TYPOGRAPHY (unique) ===');
    const seen = new Set();
    for (const t of d.type.filter((t) => ['h1', 'h2', 'h3'].includes(t.tag))) {
      const k = `${t.tag}|${t.fontSize}|${t.fontFamily}|${t.weight}|${t.letterSpacing}`;
      if (seen.has(k)) continue; seen.add(k);
      console.log(`  ${t.tag} ${t.fontSize.padEnd(7)} w=${t.weight.padEnd(4)} ls=${t.letterSpacing.padEnd(8)} ${t.fontFamily.split(',')[0].padEnd(22)} ${t.color.padEnd(20)} "${t.text}"`);
    }

    console.log('\n=== UNIQUE TYPE STYLES (all elements) ===');
    const fams = {};
    for (const t of d.type) {
      const k = `${t.fontFamily.split(',')[0].replace(/"/g,'')} @ ${t.fontSize}`;
      fams[k] = (fams[k] ?? 0) + 1;
    }
    Object.entries(fams).sort((a, b) => b[1] - a[1]).slice(0, 18).forEach(([k, n]) => console.log(`  ${String(n).padStart(4)}x  ${k}`));

    console.log('\n=== CTA BUTTON STYLES (unique) ===');
    const seenC = new Set();
    for (const c of d.ctas) {
      const k = `${c.bg}|${c.color}|${c.radius}|${c.padding}|${c.fontSize}|${c.textTransform}|${c.letterSpacing}`;
      if (seenC.has(k)) continue; seenC.add(k);
      console.log(`  bg=${c.bg.padEnd(22)} fg=${c.color.padEnd(20)} r=${c.radius.padEnd(9)} pad=${c.padding.padEnd(18)} fs=${c.fontSize.padEnd(6)} tt=${c.textTransform.padEnd(10)} ls=${c.letterSpacing.padEnd(8)} "${c.text}"`);
    }

    console.log('\n=== SECTION BACKGROUNDS ===');
    for (const b of d.bgs.slice(0, 30)) console.log(`  y=${String(b.y).padStart(5)} h=${String(b.h).padStart(5)} ${b.bg.padEnd(22)} ${b.tag}.${b.cls.slice(0,40)}`);
  } finally {
    try { cdp?.ws.close(); } catch {}
    try { child.kill(); } catch {}
    try { fs.closeSync(logFd); } catch {}
    await sleep(400);
    await fsp.rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}
main().catch((e) => { console.error('[fatal]', e.stack || e.message); process.exit(1); });
