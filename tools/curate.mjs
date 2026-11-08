/** Copies the curated assets into the prototype, with semantic filenames. */
import fsp from 'node:fs/promises';
import path from 'node:path';

const MEDIA = path.resolve('./media');
const PUB = path.resolve('./kaldan-site/public/media');

/** dest -> substring that identifies the source file */
const PICKS = {
  // Arrival + Estate
  'hero-aerial.webp': 'an-aerial-shot-of-the-beautifully-lit',
  'estate-wide.webp': 'a-stunning-wide-angle-view-of-our-palace-with-a-grand-central-pool-fra',
  'estate-pool-night.webp': 'a-view-featuring-a-pool-lit-in-blue-colour',
  'estate-pool-day.webp': 'an-image-of-our-palace-pool-with-sun-loungers',
  'invite-dusk.webp': 'outdoor-evening-event-setup-with-string-lights',

  // The Story
  'story-reception.webp': 'a-reception-area-with-a-reception-desk-receptionists-and-a-giant-chand',
  'story-hightea.webp': 'open-air-high-tea-area-with-majestic-architecture',
  'story-pavilion.webp': 'arched-pavilion-with-ornate-ceilings',

  // The Stay
  'stay-bedroom-1.webp': 'a-luxurious-bedroom-in-mahabalipuram-with-a-chandelier-beige-tones',
  'stay-bedroom-2.webp': 'bedroom-with-a-regal-gold-accented-ceiling',
  'stay-bath.webp': 'a-luxurious-bathroom-with-a-petal-decorated-bathtub',
  'stay-seating.webp': 'a-seating-area-with-an-ornate-chandelier',
  'stay-stair.webp': 'an-elegant-staircase-and-hallway-with-contemporary-paintings',
  'stay-villa-balcony.webp': 'a-balcony-in-the-premium-luxury-villa-featuring-a-pool',
  'stay-balcony.webp': 'a-balcony-with-classic-furniture-and-serene-views',

  // Experiences
  'exp-dance.webp': 'two-women-performing-the-traditional-rajasthani-dance',
  'exp-yoga.webp': 'a-yoga-session-on-the-shores-of-the-bay-of-bengal',
  'exp-puppet.webp': 'an-image-of-a-puppet-show-with-vibrant-rajasthani-dolls',
  'exp-hightea.webp': 'the-high-tea-place-at-our-resort-in-mahabalipuram-offering-cosy-orange',
  'exp-volleyball.webp': 'an-image-of-group-of-friends-enjoying-volleyball-by-the-beach-during-a',

  // Dining
  'dine-table.webp': 'a-sophisticated-dinner-setup-with-white-flowers-candles',
  'dine-romantic.webp': 'a-romantic-dining-table-with-elegant-decor-and-ambient-lighting',
  'dine-cocktails.webp': 'a-dreamy-outdoor-dining-experience-with-cocktails-and-a-palace-view',
  'dine-poolside.webp': 'a-luxurious-poolside-setup-with-colourful-cocktails',
  'dine-hall.webp': 'a-spacious-dining-hall-featuring-modern-decor',

  // Panch Mahal
  'panch-gazebo.webp': 'a-grand-illuminated-gazebo-prepared-for-an-intimate-dinner',
  'panch-wide.webp': 'a-serene-outdoor-dining-experience-with-multiple-gazebos',
  'panch-detail.webp': 'a-close-up-shot-of-the-gazebo-at-panch-mahal-featuring-ornamental-latt',
  'panch-ledge.webp': 'a-ledge-with-intricate-flower-patters-at-panch-mahal',

  // Celebrations
  'celeb-ballroom.webp': 'grand-ballroom-with-opulent-lighting-and-luxurious-carpeting',
  'celeb-mandap.webp': 'a-mandap-in-the-lawn-of-featuring-a-table-with-a-bouquet-of-roses',
  'celeb-pathway.webp': 'an-pathway-in-the-lawn-with-a-lamp-post-and-towering-arches',
  'celeb-stair.webp': 'the-low-angle-image-of-the-staircase-in-front-of-the-lawn',
  'celeb-stage.webp': 'a-stage-with-couch-an-arch-with-ornamental-flowers',
  'celeb-banquet.webp': 'spacious-banquet-hall-with-warm-golden-lighting-and-arched-designs',
};

const VIDEOS = {
  'hero-desktop.mp4': 'kaldan_palace_overview_compressed_1a13rr.mp4',
  'hero-mobile.mp4': 'kaldan_home_page_video_1087_x_590_2.mp4',
  'dine-sagar.mp4': 'sagar_bar_13.mp4',
  'panch.mp4': 'panch_mahal_images_21.mp4',
};

const manifest = JSON.parse(await fsp.readFile(path.join(MEDIA, 'manifest.json'), 'utf8'));
const photos = manifest.images.filter((i) => i.kind === 'photo');

await fsp.mkdir(PUB, { recursive: true });

let copied = 0, bytes = 0;
const missing = [];
const inventory = [];

for (const [dest, needle] of Object.entries(PICKS)) {
  const hits = photos.filter((p) => p.file.includes(needle));
  if (hits.length === 0) {
    missing.push([dest, needle]);
    continue;
  }
  // prefer the largest
  hits.sort((a, b) => b.width * b.height - a.width * a.height);
  const src = hits[0];
  await fsp.copyFile(path.join(MEDIA, src.file), path.join(PUB, dest));
  const st = await fsp.stat(path.join(PUB, dest));
  copied++;
  bytes += st.size;
  inventory.push({ file: `media/${dest}`, source: src.file, category: src.category, width: src.width, height: src.height, bytes: st.size, alt: src.altClean });
}

for (const [dest, name] of Object.entries(VIDEOS)) {
  const src = path.join(MEDIA, 'videos', name);
  try {
    await fsp.copyFile(src, path.join(PUB, dest));
    const st = await fsp.stat(path.join(PUB, dest));
    copied++;
    bytes += st.size;
    inventory.push({ file: `media/${dest}`, source: `videos/${name}`, bytes: st.size, kind: 'video' });
  } catch (e) {
    missing.push([dest, name]);
  }
}

await fsp.writeFile(path.join(PUB, '..', 'media-manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), assets: inventory }, null, 2));

console.log(`copied ${copied} assets, ${(bytes / 1048576).toFixed(1)} MB`);
if (missing.length) {
  console.log('\nMISSING:');
  for (const [d, n] of missing) console.log(`  ${d}  <-  ${n}`);
} else {
  console.log('all picks resolved');
}
console.log('\nlargest:');
inventory.sort((a, b) => b.bytes - a.bytes).slice(0, 8).forEach((i) => console.log(`  ${(i.bytes / 1024).toFixed(0).padStart(5)} KB  ${i.file}`));