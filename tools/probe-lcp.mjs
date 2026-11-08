import { launchChrome } from './lib/chrome.mjs';
import fs from 'node:fs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const s = await launchChrome({ width: 1440, height: 900, logDir: 'C:/Users/Dell/Desktop/kaldanhotel/capture/prototype' });
await s.cdp.send('Page.addScriptToEvaluateOnNewDocument', {
  source: `window.__lcp=[];new PerformanceObserver(l=>{for(const e of l.getEntries()){window.__lcp.push({t:Math.round(e.startTime),size:e.size,tag:e.element?e.element.tagName:'',id:e.element?e.element.id:'',cls:e.element?String(e.element.className).slice(0,60):'',txt:e.element?(e.element.textContent||'').replace(/\\s+/g,' ').trim().slice(0,60):'',url:e.url||''});}}).observe({type:'largest-contentful-paint',buffered:true});`,
});
await s.goto('http://127.0.0.1:8899/', { waitMs: 6000 });
const r = await s.cdp.send('Runtime.evaluate', { returnByValue: true, expression: `({lcp:window.__lcp, ready:document.getElementById('arrival').className, posterOpacity:getComputedStyle(document.querySelector('.hero-poster')).opacity, videoOpacity:getComputedStyle(document.getElementById('heroVideo')).opacity, vt:document.getElementById('heroVideo').currentTime})` });
console.log(JSON.stringify(r.result.value, null, 1));
const { data } = await s.cdp.send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('C:/Users/Dell/Desktop/kaldanhotel/capture/prototype/probe-hero-settled.png', Buffer.from(data, 'base64'));
await s.close();