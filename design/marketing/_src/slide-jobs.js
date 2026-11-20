// Magaza slaytlari: 1280x800, Chrome ve Firefox icin ayri sira ve metin.
// Once raw-jobs.js calismis olmali (ham goruntu ve oge konumlari raw/ altinda).
//   node src/tools/store-shots.js design/marketing/_src/slide-jobs.js
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const RAW = path.join(__dirname, 'raw');
const SLIDE = pathToFileURL(path.join(__dirname, 'slide.html')).href;
const ORDER = {
  chromium: { dir: 'chrome-store-v2', slides: ['location', 'identity', 'protect', 'moving', 'popup'] },
  firefox: { dir: 'firefox-amo', slides: ['location', 'protect', 'identity', 'moving', 'popup'] }
};
const FONTS = 'await document.fonts.ready;';

// Pencere gorunen alani: 1120 x 514 px. Ham goruntu rw css px genis (cogu 1100).
function view(b, s) {
  if (s === 'identity') return { rw: 1200, z: 1.12, ox: 112, oy: 0 };
  if (s === 'protect') {
    const r = JSON.parse(fs.readFileSync(path.join(RAW, b + '-protect.json'), 'utf8'));
    // Parmak izi ve izleme kartlari basliktan baslasin, yarim satir gorunmesin
    return { z: 1.1, ox: 100, oy: r.fp[1] - 22, mark: r.only };
  }
  return { z: 1, ox: 0, oy: 0 };
}

const jobs = [];
for (const [b, o] of Object.entries(ORDER)) {
  o.slides.forEach((s, i) => jobs.push({
    url: SLIDE + '?b=' + b + '&s=' + s + '&v=' + encodeURIComponent(JSON.stringify(view(b, s))),
    w: 1280, h: 800, dpr: 1, wait: 400, js: FONTS,
    out: path.join('design', 'marketing', o.dir, (i + 1) + '-' + s + '.png')
  }));
}

// Yalniz Chrome magazasi: tanitim karolari ve 128 magaza ikonu (96 cizim + 16 saydam kenar)
const TILE = pathToFileURL(path.join(__dirname, 'tile.html')).href;
const C = path.join('design', 'marketing', 'chrome-store-v2');
jobs.push(
  { url: TILE + '?t=small', w: 440, h: 280, dpr: 1, wait: 300, js: FONTS, out: path.join(C, 'small-tile-440x280.png') },
  { url: TILE + '?t=marquee', w: 1400, h: 560, dpr: 1, wait: 300, js: FONTS, out: path.join(C, 'marquee-1400x560.png') },
  { url: TILE + '?t=icon', w: 128, h: 128, dpr: 1, wait: 300, transparent: true, out: path.join(C, 'store-icon-128.png') }
);
module.exports = jobs;
