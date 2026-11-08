import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = 'C:/Users/Dell/Desktop/kaldanhotel';
const OUT = path.join(ROOT, 'prototype/assets');
const inv = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/photo-inventory.json'), 'utf8'));
const byName = new Map(inv.map((r) => [r.name, r]));

fs.mkdirSync(path.join(OUT, 'img'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'fonts'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'vendor'), { recursive: true });

// name -> {src, widths, quality}
const stills = {
  'hero-poster': 'capture/film/poster-src.png',
  'pool-approach': 'capture/film/staircase.png',
  'brass-kitchen': 'capture/film/dining-candle.png',
  'welcome-ritual': 'capture/film/banquet.png',
  'folk-steps': 'capture/film/welcome-steps.png',
};

const plan = [
  ['hero-poster', [1920, 1280, 800], 74],
  ['pool-approach', [1920, 1280, 800], 74],
  ['A4A0910_eridzk', [1920, 1280, 800], 74],
  ['9db9613c98c051dc7a97ddf8a2665bff_gmo61g', [1600, 1000, 640], 74],
  ['_A4A7744', [1200, 800, 520], 76],
  ['_MG_7693', [1600, 1000, 640], 74],
  ['Kaldan0356_copy_96cdbf45', [1600, 1000, 640], 74],
  ['DJI_0637', [1920, 1280, 800], 72],
  ['MG_7470', [1600, 1000, 640], 74],
  ['Deluxe_Twin_Beds_Rooms', [1200, 800, 520], 76],
  ['Deluxe_King_Pool_View_Rooms', [1200, 800, 520], 76],
  ['Premium_Pool_view_room', [1200, 800, 520], 76],
  ['Executive_Palace_Suite', [1200, 800, 520], 76],
  ['Premium_Palace_Suite', [1200, 800, 520], 76],
  ['Executive_Studio_Villa2_rkjitb', [1200, 800, 520], 76],
  ['Premium_Luxury_Villa05_qu2htb', [1600, 1000, 640], 74],
  ['Premium_Luxury_Villa01_os8chw', [1200, 800, 520], 76],
  ['Suite_Bathroom', [1000, 640, 420], 76],
  ['enhanced_16_9', [1200, 800, 520], 76],
  ['micah-mckerlich-WNMfEYSlyUY-unsplash_h6fwkw', [1000, 640, 420], 76],
  ['pexels-rishabh-lakra-738802-1583350_pysktm', [1200, 800, 520], 76],
  ['phil-hearing-9xcQ-KpxV8E-unsplash_638dd167', [1000, 640, 420], 76],
  ['pexels-tomaz-barcellos-999425-2017868_lqixsw', [1000, 640, 420], 76],
  ['pexels-karolina-grabowska-7269689_d0monz', [1000, 640, 420], 76],
  ['pexels-mikhail-nilov-9366581_23d720aa', [1000, 640, 420], 76],
  ['_MG_7628', [1600, 1000, 640], 74],
  ['_MG_7740', [1200, 800, 520], 76],
  ['Sagar_Bar_10_4546740e', [1000, 640, 420], 76],
  ['Panch_Mahal_Images_4_54c2b075', [1600, 1000, 640], 74],
  ['_MG_7730', [1200, 800, 520], 76],
  ['brass-kitchen', [1200, 800, 520], 76],
  ['welcome-ritual', [1200, 800, 520], 76],
  ['folk-steps', [1600, 1000, 640], 74],
  ['hotel-award-11', [640, 420], 78],
  ['hotel-award-2', [640, 420], 78],
  ['hotel-award-5', [640, 420], 78],
  ['hotel-award-8', [640, 420], 78],
  ['hotel-award-7', [640, 420], 78],
  ['hotel-award-3', [640, 420], 78],
];

const lqip = {};
const report = [];
for (const [name, widths, q] of plan) {
  const src = stills[name] ? path.join(ROOT, stills[name]) : byName.get(name)?.local;
  if (!src || !fs.existsSync(src)) { console.log('MISSING', name); continue; }
  const meta = await sharp(src).metadata();
  const ladder = [...new Set([...widths, 420, 520, 800, 1000, 1200, 1600])].sort((a, b) => a - b);
  for (const w of ladder) {
    const file = path.join(OUT, 'img', `${name}-${w}.webp`);
    const info = await sharp(src).resize({ width: w, withoutEnlargement: true }).webp({ quality: q, effort: 5 }).toFile(file);
    report.push({ name, w, bytes: info.size });
  }
  const small = await sharp(src).resize(24, 16, { fit: 'cover' }).webp({ quality: 40 }).toBuffer();
  lqip[name] = 'data:image/webp;base64,' + small.toString('base64');
}
fs.writeFileSync(path.join(OUT, 'lqip.json'), JSON.stringify(lqip));

// fonts
const fontJobs = [
  ['@fontsource/cormorant-garamond', 'cormorant-garamond', [300, 400, 500, 600], ['normal', 'italic']],
  ['@fontsource/manrope', 'manrope', [400, 500, 600, 700], ['normal']],
];
for (const [pkg, family, weights, styles] of fontJobs) {
  for (const w of weights) for (const s of styles) {
    if (family === 'cormorant-garamond' && s === 'italic' && w !== 400) continue;
    const src = path.join(ROOT, 'node_modules', pkg, 'files', `${family}-latin-${w}-${s}.woff2`);
    if (!fs.existsSync(src)) { console.log('font missing', src); continue; }
    fs.copyFileSync(src, path.join(OUT, 'fonts', `${family}-${w}-${s}.woff2`));
  }
}

// vendor libs
for (const [src, dest] of [
  ['node_modules/gsap/dist/gsap.min.js', 'gsap.min.js'],
  ['node_modules/gsap/dist/ScrollTrigger.min.js', 'ScrollTrigger.min.js'],
  ['node_modules/lenis/dist/lenis.min.js', 'lenis.min.js'],
  ['node_modules/lenis/dist/lenis.css', 'lenis.css'],
]) {
  fs.copyFileSync(path.join(ROOT, src), path.join(OUT, 'vendor', dest));
}

const total = report.reduce((a, r) => a + r.bytes, 0);
fs.writeFileSync(path.join(ROOT, 'tools/asset-report.json'), JSON.stringify({ images: report, totalImageBytes: total }, null, 1));
console.log('images written:', report.length, 'total KB:', (total / 1024) | 0);
console.log('fonts:', fs.readdirSync(path.join(OUT, 'fonts')).length, 'vendor:', fs.readdirSync(path.join(OUT, 'vendor')).join(', '));