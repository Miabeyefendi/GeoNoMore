// Dil dosyalarını denetler. Eksik bir anahtar arayüzde sessizce ham anahtar adı
// olarak görünür, kimse fark etmez. O yüzden makine baksın.
//   node test-lang.js

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Kaynak tek yerde: src/extension. extensions/ altindakiler buradan uretiliyor.
const SRC_ROOT = path.join(__dirname, '..', 'extension');

const SRC = SRC_ROOT;
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');
const json = f => JSON.parse(read(f));

// Kod içinde değişkenle çağrılan anahtarlar. Düz metin taraması bunları göremez.
const DYNAMIC = [
  'low', 'medium', 'high',      // T(cfg.privacy), kural modu
  'statusRunning', 'statusStopped', 'start', 'stop',
  'coordHintFixed', 'coordHintZone',
  'exactShort', 'ruleInherit',
  'themeAuto',
  'exactForMinutes', 'exactUntilBrowser',
  'profWalking', 'profRunning', 'profCycling', 'profCommuting', 'profDriving',
  'profTrain', 'profFlight', 'profStationary',
  'profWalkingDesc', 'profRunningDesc', 'profCyclingDesc', 'profCommutingDesc',
  'profDrivingDesc', 'profTrainDesc', 'profFlightDesc', 'profStationaryDesc',
  'loopOnce', 'loopLoop', 'loopPingpong',
  'sunShort', 'monShort', 'tueShort', 'wedShort', 'thuShort', 'friShort', 'satShort',
  'schedActive', 'schedNone', 'schedIdle',
  'groupShow', 'groupHide', 'mapBlocked',
  // Sade kayit cumleleri. options.js icindeki SIMPLE tablosundan geliyorlar,
  // yani T() cagrisinda adlari yazmiyor; duz metin taramasi goremiyor.
  'evtInstalled', 'evtSettings', 'evtProtection', 'evtAsked', 'evtFaked',
  'evtDenied', 'evtReal', 'evtWatch', 'evtTz', 'evtLang', 'evtMapBlocked'
];

const langs = read('core/ui.js')
  .match(/\{\s*code:\s*'([a-z-]+)'/g)
  .map(m => m.match(/'([a-z-]+)'/)[1]);

assert.ok(langs.length >= 1, 'ui.js içinde dil listesi bulunamadı');
assert.strictEqual(langs[0], 'en', 'ilk dil en olmalı, yedek o');

// 1. Listedeki her dilin dosyası var ve geçerli JSON.
const maps = {};
langs.forEach(code => {
  const file = 'ui/lang/' + code + '.json';
  assert.ok(fs.existsSync(path.join(SRC, file)), file + ' yok');
  maps[code] = json(file);
});

// 2. Bütün diller aynı anahtar kümesine sahip.
const base = Object.keys(maps.en).sort();
langs.slice(1).forEach(code => {
  const keys = Object.keys(maps[code]).sort();
  const missing = base.filter(k => keys.indexOf(k) === -1);
  const extra = keys.filter(k => base.indexOf(k) === -1);
  assert.strictEqual(missing.length, 0, code + ' eksik anahtarlar: ' + missing.join(', '));
  assert.strictEqual(extra.length, 0, code + ' fazladan anahtarlar: ' + extra.join(', '));
});

// 3. Arayüzün istediği her anahtar en.json'da var.
const used = new Set();
['ui/popup.html', 'ui/options.html'].forEach(f => {
  const html = read(f);
  for (const m of html.matchAll(/data-i18n(?:-ph|-title)?="([^"]+)"/g)) used.add(m[1]);
});
['ui/popup.js', 'ui/options.js'].forEach(f => {
  for (const m of read(f).matchAll(/\bT\('([A-Za-z0-9]+)'\)/g)) used.add(m[1]);
});

const known = new Set(base);
const missing = [...used].filter(k => !known.has(k));
assert.strictEqual(missing.length, 0, 'çeviri dosyasında olmayan anahtarlar: ' + missing.join(', '));

// 4. Kullanılmayan anahtar kalmasın, sözlük şişmesin.
DYNAMIC.forEach(k => {
  assert.ok(known.has(k), 'dinamik listede olup sözlükte olmayan anahtar: ' + k);
  used.add(k);
});
const orphan = base.filter(k => !used.has(k));
assert.strictEqual(orphan.length, 0, 'hiçbir yerde kullanılmayan anahtarlar: ' + orphan.join(', '));

// 5. Yer tutucular çeviride kaybolmamış. "%1 privacy" gibi.
base.forEach(k => {
  const want = (maps.en[k].match(/%[0-9s]/g) || []).sort().join(',');
  langs.slice(1).forEach(code => {
    const got = (maps[code][k].match(/%[0-9s]/g) || []).sort().join(',');
    assert.strictEqual(got, want, `${code}/${k}: yer tutucular uyuşmuyor (${want} vs ${got})`);
  });
});

// 6. Manifest yalnız kendi metnini _locales'ta tutuyor, arayüz metinleri orada değil.
const manifestMsgs = Object.keys(json('_locales/en/messages.json'));
assert.deepStrictEqual(manifestMsgs, ['extDesc'],
  '_locales sadece manifest metnini taşımalı, arayüz ui/lang altında');

console.log(`lang: ${langs.length} dil, ${base.length} anahtar, 6 kontrol gecti`);
