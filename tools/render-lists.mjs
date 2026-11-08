import fs from 'node:fs';
import path from 'node:path';
import { ROOMS, EXPERIENCES, DINING, QUOTES, AWARDS } from '../prototype/assets/js/data.js';

const file = 'C:/Users/Dell/Desktop/kaldanhotel/prototype/index.html';
let html = fs.readFileSync(file, 'utf8');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const roomRail = ROOMS.map((r, i) => `
      <button role="tab" id="tab-${r.id}" aria-selected="${i === 0}" data-room="${r.id}" tabindex="${i === 0 ? 0 : -1}">
        <span class="n">${String(i + 1).padStart(2, '0')}</span>
        <span class="nm">${esc(r.name)}</span>
        <span class="sz">${esc(r.size.split(' · ')[0])}</span>
      </button>`).join('');

const expCards = EXPERIENCES.map((e) => `
      <button class="exp-card" data-exp="${e.id}" data-cat="${e.cat}" aria-haspopup="dialog">
        <img src="assets/img/${e.img}-800.webp" srcset="assets/img/${e.img}-520.webp 520w, assets/img/${e.img}-800.webp 800w" sizes="(max-width: 560px) 46vw, (max-width: 900px) 30vw, 22vw" alt="${esc(e.name)}" width="800" height="987" loading="lazy">
        <span class="added-mark" aria-hidden="true"><svg width="14" height="14"><use href="#i-check"/></svg></span>
        <span class="ec-body">
          <span class="ec-cat">${esc(e.cat)}</span>
          <span class="ec-name display">${esc(e.name)}</span>
          <span class="ec-cta">Read the story <svg width="16" height="16" aria-hidden="true"><use href="#i-arr"/></svg></span>
        </span>
      </button>`).join('');

const dineItems = DINING.map((d, i) => `
      <article class="dine-item${i === 0 ? ' is-open' : ''}" data-dine="${d.id}">
        <button class="dine-head" aria-expanded="${i === 0}" aria-controls="dine-body-${d.id}">
          <span class="n">${String(i + 1).padStart(2, '0')}</span>
          <span class="nm display">${esc(d.name)}</span>
          <span class="kind">${esc(d.kind)}</span>
          <span class="pm" aria-hidden="true"></span>
        </button>
        <div class="dine-body" id="dine-body-${d.id}">
          <div>
            <div class="dine-inner">
              <figure><img src="assets/img/${d.img}-1000.webp" alt="${esc(d.name)} — ${esc(d.kind)}" width="1000" height="625" loading="lazy"></figure>
              <div>
                <p>${esc(d.copy)}</p>
                <div class="dine-meta">
                  <span><b>Hours</b>${esc(d.hours)}</span>
                  <span><b>Setting</b>${esc(d.setting)}</span>
                  <span><b>Known for</b>${esc(d.seats)}</span>
                </div>
                <button class="btn btn-ghost btn-sm" data-table-enquiry="${d.id}">Reserve a table</button>
              </div>
            </div>
          </div>
        </div>
      </article>`).join('');

const quotes = QUOTES.map((q, i) => `
        <div class="quote-slide${i === 0 ? ' is-active' : ''}" data-quote="${i}">
          <blockquote>${esc(q.text)}</blockquote>
          <cite>${esc(q.who)}</cite>
        </div>`).join('');

const awards = AWARDS.map((a) => `
          <figure title="${esc(a.label)}"><img src="assets/img/${a.img}-420.webp" alt="${esc(a.label)}" width="420" height="560" loading="lazy"></figure>`).join('');

for (const [marker, content] of [
  ['<!--ROOM_RAIL-->', roomRail],
  ['<!--EXP_CARDS-->', expCards],
  ['<!--DINE_ITEMS-->', dineItems],
  ['<!--QUOTES-->', quotes],
  ['<!--AWARDS-->', awards],
]) {
  if (!html.includes(marker)) throw new Error('marker missing: ' + marker);
  html = html.replace(marker, content);
}
html = html.replace('<span class="tip">Eate</span>', '<span class="tip">Estate</span>');
fs.writeFileSync(file, html);
console.log('injected:', { rooms: ROOMS.length, experiences: EXPERIENCES.length, dining: DINING.length, quotes: QUOTES.length, awards: AWARDS.length });