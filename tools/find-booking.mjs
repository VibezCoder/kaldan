import fsp from 'node:fs/promises';

const h = await fsp.readFile('./capture/desktop/home-desktop-rendered.html', 'utf8');

const hrefs = [...new Set([...h.matchAll(/href=["']([^"']*book[^"']*)["']/gi)].map((m) => m[1]))];
console.log('href containing "book":');
hrefs.slice(0, 20).forEach((l) => console.log('  ' + l));

const hostRefs = [...new Set([...h.matchAll(/https?:\/\/bookings[^"'\s<>]+/gi)].map((m) => m[0]))];
console.log('\nbookings host references:');
hostRefs.slice(0, 10).forEach((l) => console.log('  ' + l));

const onclick = [...h.matchAll(/onclick=["']([^"']{0,160})/gi)].map((m) => m[1]).filter((t) => /book/i.test(t));
console.log('\nbooking onclick handlers:');
onclick.slice(0, 8).forEach((l) => console.log('  ' + l));

const dataAttrs = [...h.matchAll(/data-[a-z-]*book[a-z-]*=["']([^"']{0,120})/gi)].map((m) => m[0]);
console.log('\nbooking data attributes:');
dataAttrs.slice(0, 8).forEach((l) => console.log('  ' + l));

// Simplotel booking widgets often configure a property id
const propIds = [...new Set([...h.matchAll(/property[_/-]?id["'\s:=]+(\d{2,6})/gi)].map((m) => m[1]))];
console.log('\nproperty ids seen:', propIds.slice(0, 10));