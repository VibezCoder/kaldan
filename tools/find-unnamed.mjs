/** Lists focusable elements that lack an accessible name. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL_ = process.argv[2] ?? 'http://localhost:4173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = await fsp.mkdtemp(path.join(os.tmpdir(), 'nm-'));
const logFd = fs.openSync(path.join(os.tmpdir(), 'nm.log'), 'w');
const child = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--hide-scrollbars', '--mute-audio', 'about:blank',
], { stdio: ['ignore', 'ignore', logFd], windowsHide: true });

const send = (ws, store) => (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++store.id;
    store.pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => rej(new Error('timeout ' + method)), 60000);
  });

try {
  const pf = path.join(profile, 'DevToolsActivePort');
  let port = null;
  for (let i = 0; i < 150; i++) {
    if (fs.existsSync(pf)) { port = Number((await fsp.readFile(pf, 'utf8')).split(/\r?\n/)[0]); if (port) break; }
    await sleep(200);
  }
  let target = null;
  for (let i = 0; i < 50 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
    if (!target) await sleep(200);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  const store = { id: 0, pending: new Map() };
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && store.pending.has(m.id)) {
      const { res, rej } = store.pending.get(m.id);
      store.pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    }
  });
  const cdp = send(ws, store);
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Page.navigate', { url: URL_ });
  await sleep(3500);

  const r = await cdp('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const f = [...document.querySelectorAll('a[href], button, [tabindex]:not([tabindex="-1"])')];
      return f.filter(el => !(el.innerText||'').trim() && !el.getAttribute('aria-label') && !el.getAttribute('title') && !el.getAttribute('aria-labelledby'))
        .map(el => ({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0,50), html: el.outerHTML.slice(0,110) }));
    })()`,
  });
  const list = r.result.value;
  console.log(`unnamed focusables: ${list.length}`);
  list.forEach((x, i) => console.log(`${i + 1}. <${x.tag} class="${x.cls}">\n   ${x.html}`));
  ws.close();
} finally {
  try { child.kill(); } catch {}
  try { fs.closeSync(logFd); } catch {}
  await sleep(300);
  await fsp.rm(profile, { recursive: true, force: true }).catch(() => {});
}