// GeoNoMore ikon kopyalayici. Bagimlilik yok.
//   node src/tools/make-logo2.js src/assets/logo/logo2/c-pin b
//   node src/tools/make-icons.js
//
// Kaynak: logo2 (kapusonlu figur, yuzu konum ignesi). Cizim ve tarama
// make-logo2.js'te; her boy kendi cozunurlugunde orneklendigi icin burada
// kucultme yok, yalniz kopya. Eski dikey logonun (1Artboard 1) ureteci
// archive/backups/make-icons.js.logo1.bak icinde.
//
// Cikti: "src/extension/assets/icons/{16,32,48,128}.png" ve logo.svg.
// Tarayici paketlerine src/tools/build.js ile gider.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src', 'assets', 'logo', 'logo2', 'c-pin');
const OUT = path.join(ROOT, 'src', 'extension', 'assets', 'icons');
const SIZES = [16, 32, 48, 128];

fs.mkdirSync(OUT, { recursive: true });

SIZES.forEach(size => {
  const from = path.join(SRC, size + '.png');
  if (!fs.existsSync(from)) throw new Error('eksik: ' + from + ' (once make-logo2.js calistir)');
  fs.copyFileSync(from, path.join(OUT, size + '.png'));
  console.log('yazildi: ' + size + '.png  ' + fs.statSync(from).size + ' bayt');
});

// Arayuz vektoru kullaniyor: sol ustteki isaret ve sekme simgesi buradan geliyor.
fs.copyFileSync(path.join(SRC, 'logo2.svg'), path.join(OUT, 'logo.svg'));
console.log('yazildi: logo.svg');
