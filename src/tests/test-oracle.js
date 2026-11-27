// "Gercek deger avi": test sureci gercek sistem dilimi Europe/Istanbul olarak
// calisiyor, yama baska bir dilimi taklit ediyor. Siradan sayfa kodunun HICBIR
// yolu Istanbul'u gostermemeli. Eski testler "sahte deger geliyor mu" diye
// soruyordu; bu dosya "gercek deger baska nereden okunuyor" diye soruyor.
// Tarih hesabi ayrica tarayicinin kendisiyle karsilastiriliyor: ayni islemler
// sistem dilimi taklit edilen dilim olan ayri bir surecte yamasiz kosuluyor.
//   node src/tests/test-oracle.js

process.env.TZ = 'Europe/Istanbul';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const SRC = path.join(__dirname, '..', 'extension');
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');

// Sayfa dunyasi: yamanin ihtiyac duydugu en az sey. Date ve Intl vm'in kendi
// gercek kopyalari, yani olcum gercek motor uzerinde.
const WORLD = `
  globalThis.window = globalThis;
  globalThis.__handlers = [];
  globalThis.addEventListener = function (type, fn) { if (type === 'Kb') __handlers.push(fn); };
  globalThis.dispatchEvent = function () {};
  globalThis.CustomEvent = function (type, init) { this.type = type; this.detail = init && init.detail; };
  globalThis.Navigator = function Navigator() {};
  Navigator.prototype.language = 'en-US';
  Navigator.prototype.languages = ['en-US'];
  globalThis.navigator = new Navigator();
  globalThis.document = { readyState: 'complete', addEventListener: function () {}, querySelectorAll: function () { return []; } };
  globalThis.__blobs = {}; globalThis.__blobN = 0;
  globalThis.Blob = function Blob(parts) { this.src = parts.join(''); };
  globalThis.URL = (function (B) {
    function U(a, b) { return b === undefined ? new B(a) : new B(a, b); }
    U.createObjectURL = function (blob) { var id = 'blob:https://test.example/' + (++__blobN); __blobs[id] = blob.src; return id; };
    U.revokeObjectURL = function () {};
    return U;
  })(__NodeURL);
  globalThis.Worker = function Worker(url, opts) {
    if (!new.target) throw new TypeError('new gerekli');
    this.url = String(url); this.opts = opts;
    var self = this;
    if (__blobs[this.url] === 'postMessage(1)') setTimeout(function () { if (self.onmessage) self.onmessage({ data: 1 }); }, 0);
  };
  Worker.prototype.terminate = function () {};
  globalThis.XMLHttpRequest = function XMLHttpRequest() {};
  XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; };
  XMLHttpRequest.prototype.send = function () { var s = __blobs[this.__u]; this.status = s === undefined ? 404 : 200; this.responseText = s === undefined ? '' : s; };
`;

const base = { console, setTimeout, clearTimeout, setInterval: () => 1, clearInterval: () => {}, WeakMap, __NodeURL: URL, atob, TextDecoder, Uint8Array };

function page(cfg, opts) {
  const ctx = vm.createContext(Object.assign({}, base));
  vm.runInContext(WORLD, ctx);
  vm.runInContext('globalThis.location = ' + JSON.stringify((opts && opts.location) || { origin: 'https://test.example', href: 'https://test.example/a' }), ctx);
  if (opts && opts.setup) vm.runInContext(opts.setup, ctx);
  vm.runInContext(read('core/engine.js'), ctx);
  vm.runInContext(read('content/injected.js'), ctx);
  vm.runInContext('gnmInjected(gnmEngineFactory, "K")', ctx);
  const run = e => vm.runInContext(e, ctx);
  if (cfg) {
    ctx.__msg = JSON.stringify({ __gnm: 1, cfg: cfg, active: true });
    run('__handlers.forEach(function (f) { f({ detail: __msg }); })');
  }
  return { ctx, run };
}

const CFG = { enabled: true, siteMode: 'all', lat: 35.68, lon: 139.69, privacy: 'medium', exact: false, timeZone: 'Asia/Tokyo', locale: 'ja-JP', logging: false };
const tick = ms => new Promise(r => setTimeout(r, ms || 10));

let passed = 0;
const failed = [];
async function check(name, fn) {
  try { await fn(); passed++; }
  catch (e) { failed.push(name + ': ' + String(e && e.message || e).split('\n')[0].slice(0, 200)); }
}

// Dilim hesabi gerektiren islemler: hem yamali sayfada hem yamasiz surecte kosar
const OPS = `(function () {
  var out = [];
  var moments = [[2026, 0, 15], [2026, 0, 15, 12, 30, 45, 678], [2026, 6, 4, 23, 59],
    [2026, 2, 8, 1, 59], [2026, 2, 8, 2, 30], [2026, 2, 8, 3, 0],
    [2026, 10, 1, 0, 59], [2026, 10, 1, 1, 30], [2026, 10, 1, 2, 0],
    [2026, 2, 29, 2, 30], [2026, 9, 25, 2, 30], [2026, 0, 0], [2026, 12, 1], [2000, 1, 29, 24, 61]];
  moments.forEach(function (m) {
    out.push(new (Function.prototype.bind.apply(Date, [null].concat(m.length < 2 ? m.concat(0) : m)))().getTime());
  });
  ['2026-01-15T00:00:00', '2026-07-15T13:14:15.500', '2026-03-08T02:30:00', '2026-11-01T01:30:00',
    'January 15, 2026 08:00:00', '2026/01/15 08:00', '1/15/2026, 8:00:00 PM', '2026-01-15', '2026-01', '2026',
    '2026-01-15T00:00:00Z', '2026-01-15T00:00:00+05:30', 'Thu, 15 Jan 2026 00:00:00 GMT', '15 Jan 2026 10:00 UTC', 'gecersiz'
  ].forEach(function (s) { out.push(String(Date.parse(s))); out.push(String(new Date(s).getTime())); });
  var stamps = [Date.UTC(2026, 0, 15, 12), Date.UTC(2026, 2, 8, 6, 30), Date.UTC(2026, 10, 1, 5, 30), Date.UTC(2026, 6, 4, 2)];
  stamps.forEach(function (t) {
    [['setHours', [0]], ['setHours', [2, 30, 0, 0]], ['setMinutes', [75]], ['setSeconds', [3600]], ['setMilliseconds', [5]],
      ['setDate', [8]], ['setDate', [0]], ['setMonth', [2, 8]], ['setFullYear', [2027]], ['setFullYear', [2026, 2, 8]]
    ].forEach(function (op) {
      var d = new Date(t); var r = d[op[0]].apply(d, op[1]);
      out.push(r, d.getTime(), d.getHours(), d.getDate(), d.getTimezoneOffset());
    });
  });
  var bad = new Date(NaN); out.push(String(bad.setHours(1)), String(bad.getTime()));
  bad.setFullYear(2026); out.push(bad.getTime());
  out.push(new Date({ valueOf: function () { return 5; } }).getTime());
  out.push(String(new Date({ toString: function () { return '2026-01-15T00:00:00'; } }).getTime()));
  return JSON.stringify(out);
})()`;

function nativeIn(tz) {
  return execFileSync(process.execPath, ['-e', 'process.stdout.write(' + OPS + ')'],
    { env: Object.assign({}, process.env, { TZ: tz }) }).toString();
}

(async function () {
  assert.strictEqual(new Date(2026, 0, 15).getTimezoneOffset(), -180, 'test sureci Istanbul diliminde olmali');

  const p = page(CFG);
  await tick();
  const eq = (expr, want, why) => assert.strictEqual(p.run(expr), want, why || expr);
  const noReal = expr => {
    const v = String(p.run(expr));
    assert.ok(!/Istanbul|GMT\+0300|Turkey|Türkiye/.test(v), expr + ' gercek dilimi gosterdi: ' + v);
  };

  // --- yapici uzerinden kacis ---
  await check('DTF .constructor', () => eq('new (new Intl.DateTimeFormat().constructor)().resolvedOptions().timeZone', 'Asia/Tokyo'));
  for (const n of ['NumberFormat', 'Collator', 'PluralRules']) {
    // Collator ve PluralRules bolgeyi atip 'ja' donuyor
    await check(n + ' .constructor', () => eq(`new (new Intl.${n}().constructor)().resolvedOptions().locale.slice(0, 2)`, 'ja'));
  }
  await check('Intl.DateTimeFormat.prototype.constructor', () => eq('Intl.DateTimeFormat.prototype.constructor === Intl.DateTimeFormat', true));
  await check('Worker .constructor', () => eq('Worker.prototype.constructor === Worker', true));

  // --- Date ---
  await check('Date() metni', () => { noReal('Date()'); assert.ok(/GMT\+0900/.test(p.run('Date()'))); });
  await check('new Date().constructor', () => eq('new Date().constructor === Date', true));
  await check('.constructor ile Date()', () => assert.ok(/GMT\+0900/.test(p.run('(new Date()).constructor()'))));
  await check('yerel parcalarla yapici', () => eq('new Date(2026, 0, 15).getTime()', Date.UTC(2026, 0, 14, 15)));
  await check('yerel parcalar geri okunuyor', () => eq('new Date(2026, 0, 15, 12).getHours()', 12));
  await check('sahte fark', () => eq('(Date.UTC(2026,0,15) - new Date(2026,0,15)) / 6e4', 540));
  await check('Date.parse dilimsiz metin', () => eq("(Date.UTC(2026,0,15) - Date.parse('2026-01-15T00:00:00')) / 6e4", 540));
  await check('setHours', () => eq('(function () { var d = new Date(Date.UTC(2026,0,15,12)); d.setHours(0); return d.getTime(); })()', Date.UTC(2026, 0, 14, 15)));
  await check('Date davranisi bozulmuyor', () => {
    eq('new Date() instanceof Date', true);
    eq('(function () { class A extends Date {} var a = new A(2026, 0, 1); return a instanceof A && a instanceof Date && a.getHours() === 0; })()', true);
    eq('Date.length', 7); eq('Date.name', 'Date'); eq('typeof Date.now()', 'number');
    eq('new Date(new Date(123456)).getTime()', 123456); eq('new Date(0).getTime()', 0);
    eq('Date.UTC(2026,0,1)', Date.UTC(2026, 0, 1));
    eq("Object.prototype.toString.call(new Date())", '[object Date]');
    eq('(function () { var d = new Date(); return Math.abs(Date.parse(d.toString()) - d.getTime()) < 1000; })()', true);
    eq("Date.toString()", 'function Date() { [native code] }');
    eq("Date.parse.toString()", 'function parse() { [native code] }');
    eq("Date.prototype.setHours.toString()", 'function setHours() { [native code] }');
  });

  // Tarayicinin kendisiyle karsilastirma: yaz saati bosluklari ve tekrarlari dahil
  for (const zone of ['Asia/Tokyo', 'America/New_York', 'Europe/London', 'Asia/Kolkata', 'Australia/Lord_Howe']) {
    await check('tarih hesabi ' + zone, () => {
      const q = page(Object.assign({}, CFG, { timeZone: zone }));
      const got = JSON.parse(q.run(OPS)), want = JSON.parse(nativeIn(zone));
      assert.strictEqual(got.length, want.length);
      for (let i = 0; i < want.length; i++) assert.strictEqual(got[i], want[i], 'islem #' + i + ' beklenen ' + want[i] + ' gelen ' + got[i]);
    });
  }

  // --- dil ---
  await check('toLocaleUpperCase sahte dili kullaniyor', () => {
    const q = page(Object.assign({}, CFG, { locale: 'tr-TR' }));
    assert.strictEqual(q.run("'i'.toLocaleUpperCase()"), 'İ');
    assert.strictEqual(q.run("'I'.toLocaleLowerCase()"), 'ı');
    assert.strictEqual(q.run("'i'.toLocaleUpperCase('en')"), 'I', 'acikca verilen dil korunmali');
  });

  // --- worker ---
  function workerWorld(src) {
    const w = vm.createContext(Object.assign({}, base));
    vm.runInContext(WORLD, w);
    vm.runInContext(`globalThis.self = globalThis; delete globalThis.window; delete globalThis.document;
      globalThis.WorkerNavigator = Navigator; globalThis.importScripts = function () {};
      globalThis.location = { href: 'blob:https://test.example/9', origin: 'https://test.example' };`, w);
    vm.runInContext(src, w);
    return e => vm.runInContext(e, w);
  }
  const decode = u => decodeURIComponent(u.slice(u.indexOf(',') + 1));
  await tick(20);

  await check('data: worker yamaliyor, kaynagi data: kaliyor', () => {
    p.run("globalThis.__d = new Worker('data:text/javascript,self.__ran=1;');");
    const u = p.run('__d.url');
    assert.ok(/^data:/.test(u), 'data: worker blob adresine cevrilmemeli (kaynak degisir): ' + u.slice(0, 40));
    const w = workerWorld(decode(u));
    assert.strictEqual(w('Intl.DateTimeFormat().resolvedOptions().timeZone'), 'Asia/Tokyo');
    assert.strictEqual(w('self.__ran'), 1, 'asil kod calismali');
  });
  await check('data: worker base64', () => {
    const b64 = Buffer.from('self.__ran = "ğ";', 'utf8').toString('base64');
    p.run(`globalThis.__d2 = new Worker('data:text/javascript;base64,${b64}');`);
    const w = workerWorld(decode(p.run('__d2.url')));
    assert.strictEqual(w('self.__ran'), 'ğ');
  });

  await check('worker icinde yardimci adlar gorunmuyor', () => {
    p.run("globalThis.__b = new Worker(URL.createObjectURL(new Blob(['self.__x=1'])));");
    const w = workerWorld(p.run('__blobs[__b.url]'));
    assert.strictEqual(w("Object.keys(self).concat(Object.getOwnPropertyNames(self)).filter(function (k) { return /^gnm/i.test(k); }).join()"), '');
  });

  await check('worker icinde .constructor, Date() ve ic ice worker', async () => {
    p.run("globalThis.__n = new Worker(URL.createObjectURL(new Blob(['self.__x=1'])));");
    const w = workerWorld(p.run('__blobs[__n.url]'));
    assert.strictEqual(w('new (new Intl.DateTimeFormat().constructor)().resolvedOptions().timeZone'), 'Asia/Tokyo');
    assert.ok(/GMT\+0900/.test(w('Date()')), w('Date()'));
    assert.strictEqual(w('new Date(2026, 0, 15).getTime()'), Date.UTC(2026, 0, 14, 15));
    w("globalThis.__inner = new Worker(URL.createObjectURL(new Blob(['self.__y=2'])));");
    const src = w('__blobs[__inner.url]');
    const w2 = workerWorld(src);
    assert.strictEqual(w2('Intl.DateTimeFormat().resolvedOptions().timeZone'), 'Asia/Tokyo', 'ic ice worker yamali olmali');
    assert.strictEqual(w2('self.__y'), 2);
    w("globalThis.__inner2 = new Worker('data:text/javascript,self.__z=3');");
    assert.strictEqual(workerWorld(decode(w('__inner2.url')))('Intl.DateTimeFormat().resolvedOptions().timeZone'), 'Asia/Tokyo');
  });

  // --- about:blank cercevesi ---
  await check('yeni cerceve, ayar gelmeden ust pencerenin degerini devralir', () => {
    // ust pencere: yamali (Tokyo, ja-JP) gibi davranan bir nesne
    const q = page(null, {
      location: { origin: 'null', href: 'about:blank' },
      setup: `globalThis.parent = { Intl: { DateTimeFormat: function () { return { resolvedOptions: function () { return { timeZone: 'Asia/Tokyo' }; } }; } },
        navigator: { language: 'ja-JP' } };`
    });
    assert.strictEqual(q.run('Intl.DateTimeFormat().resolvedOptions().timeZone'), 'Asia/Tokyo');
    assert.strictEqual(q.run('navigator.language'), 'ja-JP');
    assert.ok(/GMT\+0900/.test(q.run('new Date().toString()')));
  });
  await check('about:blank konumu ust adrese gore hesaplaniyor', async () => {
    const E = require(path.join(SRC, 'core', 'engine.js'));
    const cfg = Object.assign({}, CFG, { siteProfiles: [{ pattern: 'test.example', lat: 51.5, lon: -0.12 }] });
    const q = page(cfg, { location: { origin: 'null', href: 'about:blank' }, setup: "globalThis.origin = 'https://test.example';" });
    q.run('globalThis.__pos = null; navigator.geolocation.getCurrentPosition(function (x) { __pos = x; });');
    await tick();
    const want = E.position(cfg, Date.now(), 'https://test.example');
    assert.strictEqual(q.run('__pos && __pos.coords.latitude'), want.latitude);
  });

  failed.forEach(f => console.log('KIRMIZI  ' + f));
  if (failed.length) { console.log('oracle: ' + passed + ' gecti, ' + failed.length + ' kirmizi'); process.exit(1); }
  console.log('oracle: ' + passed + ' kontrol gecti');
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
