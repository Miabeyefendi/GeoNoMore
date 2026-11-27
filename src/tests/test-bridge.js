// Kopru sayfaya NE gonderiyor? Eskiden ayarin tamami window.postMessage ile
// herkese acikti: site listeleri, kayitli yerler, harita adresindeki anahtar.
// Burada hem sizan seyler hem de suzulmus ayarla motorun ayni sonucu verdigi
// olculuyor.
//   node src/tests/test-bridge.js

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'extension');
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');
const E = require(path.join(SRC, 'core', 'engine.js'));

const NOW = Date.UTC(2026, 10, 24, 12, 0, 0);

const FULL = {
  enabled: true, siteMode: 'all', siteList: [],
  lat: 35.68, lon: 139.69, privacy: 'medium', exact: false,
  timeZone: 'Asia/Tokyo', locale: 'ja-JP', localeSpoof: true,
  logging: true, gpc: true, fpCanvas: true, watchInterval: 5,
  accuracyMode: 'auto', jitterPeriod: 'day',
  tiles: 'custom', tilesCustom: 'https://harita.example/{z}/{x}/{y}.png?key=SECRETKEY',
  language: 'tr', theme: 'dark', city: 'Tokyo', country: 'JP',
  presets: {
    Home: { lat: 41.1234, lon: 29.5678, timeZone: 'Europe/Istanbul' },
    Office: { lat: 48.8566, lon: 2.3522, timeZone: 'Europe/Paris' }
  },
  activePreset: 'Home',
  siteProfiles: [
    { pattern: 'bank.example', lat: 1, lon: 1, timeZone: 'Etc/UTC' },
    { pattern: 'test.example', lat: 51.5, lon: -0.12, timeZone: 'Europe/London' }
  ],
  override: { host: 'other.example', until: 'browser', lat: 2, lon: 2 },
  schedule: { on: true, offset: 0, entries: [
    { preset: 'Office', days: [0, 1, 2, 3, 4, 5, 6], time: '09:00' }
  ] }
};

function bridge(config, origin) {
  const sent = [];
  const handlers = {};
  let open = 0;
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, crypto: require('crypto').webcrypto });
  ctx.__gnmEngine = E;
  ctx.GNM_LOG = { via() {}, add() {}, enable() {} };
  ctx.location = { origin: origin, href: origin + '/x' };
  ctx.navigator = { geolocation: { getCurrentPosition() {} } };
  const attrs = { 'data-gnm-ok': 'KANAL' };
  ctx.document = {
    documentElement: {
      hasAttribute: k => k in attrs,
      getAttribute: k => attrs[k],
      removeAttribute: k => { delete attrs[k]; }
    }
  };
  ctx.CustomEvent = function (type, init) { this.type = type; this.detail = init && init.detail; };
  ctx.dispatchEvent = ev => sent.push({ type: ev.type, msg: JSON.parse(ev.detail) });
  ctx.addEventListener = (type, fn) => { handlers[type] = fn; };
  ctx.postMessage = () => { open++; };
  ctx.window = ctx;
  ctx.chrome = {
    runtime: { sendMessage() {}, lastError: null },
    storage: {
      local: { get: (k, cb) => cb({ config: config }) },
      onChanged: { addListener() {} }
    }
  };
  vm.runInContext(read('content/bridge.js'), ctx, { filename: 'bridge.js' });
  return { sent, handlers, attrs, open: () => open };
}

const cfgOf = b => b.sent[b.sent.length - 1].msg.cfg;
let n = 0;
const ok = () => { n++; };

// 1. Yalniz ozel kanal; isaret okunur okunmaz siliniyor.
{
  const b = bridge(FULL, 'https://test.example');
  assert.strictEqual(b.open(), 0, 'postMessage kullanilmamali');
  assert.ok(b.sent.length >= 1 && b.sent.every(s => s.type === 'KANALb'), 'yalniz kanal olayi');
  assert.ok(!('data-gnm-ok' in b.attrs), 'isaret silinmeli');
  assert.deepStrictEqual(Object.keys(b.handlers), ['KANALp'], 'yalniz kanal dinlenmeli, message degil');
  ok();
}

// 2. Gizli kalmasi gerekenler hicbir durumda gitmiyor.
{
  const s = JSON.stringify(cfgOf(bridge(FULL, 'https://test.example')));
  ['SECRETKEY', 'harita.example', 'bank.example', 'other.example', 'Home', 'Office', '41.1234',
    'tilesCustom', 'siteList', 'activePreset', '"city"', '"country"', '"language"', '"theme"'
  ].forEach(x => assert.ok(s.indexOf(x) < 0, 'sayfaya gitmemeli: ' + x));
  const c = JSON.parse(s);
  assert.deepStrictEqual(c.siteProfiles.map(r => r.pattern), ['test.example'], 'yalniz bu adrese uyan kural');
  assert.deepStrictEqual(Object.keys(c.presets), ['p0'], 'yalniz zamanlamanin kullandigi yer, adsiz');
  assert.strictEqual(c.override, undefined, 'baska siteye ait gecici kilma gitmemeli');
  assert.strictEqual(c.fpCanvas, true, 'parmak izi bayragi gitmeli');
  ok();
}

// 3. Kapali ya da site haric: konuma dair hicbir sey yok.
[
  Object.assign({}, FULL, { enabled: false }),
  Object.assign({}, FULL, { siteMode: 'except', siteList: ['test.example'] }),
  Object.assign({}, FULL, { siteMode: 'only', siteList: ['baska.example'] })
].forEach(c => {
  const b = bridge(c, 'https://test.example');
  const m = b.sent[b.sent.length - 1].msg;
  assert.strictEqual(m.active, false);
  const s = JSON.stringify(m.cfg);
  ['"lat"', '"lon"', 'timeZone', 'locale":', 'motion', 'schedule', 'presets', 'siteProfiles',
    'override', 'SECRETKEY', '41.1234', 'bank.example', 'test.example'
  ].forEach(x => assert.ok(s.indexOf(x) < 0, 'kapaliyken gitmemeli: ' + x));
  ok();
});

// 4. Suzulmus ayarla motor, tam ayardaki ile ayni sonucu vermeli: yoksa sayfa
// kullanicinin secmedigi bir yeri gorur.
{
  const cases = {
    'site kurali': ['https://test.example', FULL],
    'zamanlama': ['https://baska.example', FULL],
    'hareket': ['https://baska.example', Object.assign({}, FULL, {
      schedule: { on: false, entries: [] },
      motion: { on: true, profile: 'walking', speed: 5, pause: 0, loop: 'pingpong', startedAt: NOW - 600000,
        points: [[35.68, 139.69], [35.70, 139.72]] }
    })],
    'gecici kilma': ['https://other.example', FULL]
  };
  Object.keys(cases).forEach(name => {
    const [origin, full] = cases[name];
    const page = cfgOf(bridge(full, origin));
    [NOW, NOW + 3600000, NOW + 86400000].forEach(t => {
      assert.deepStrictEqual(E.resolve(page, t, origin), E.resolve(full, t, origin), name + ' @' + t);
      assert.deepStrictEqual(E.position(page, t, origin), E.position(full, t, origin), name + ' konum @' + t);
    });
    ok();
  });
}

// 5. "Buradayim" yalniz kanaldan; sayfa kanal adini bilmeden hicbir sey isteyemez.
{
  const b = bridge(FULL, 'https://test.example');
  const before = b.sent.length;
  b.handlers['KANALp']({ detail: JSON.stringify({ __gnm: 0 }) });
  assert.strictEqual(b.sent.length, before + 1, 'kanaldan gelen selama ayar yollanmali');
  assert.doesNotThrow(() => b.handlers['KANALp']({ detail: 'bozuk{' }));
  ok();
}

console.log('bridge: ' + n + ' kontrol gecti');
