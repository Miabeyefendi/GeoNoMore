// Yamayı sahte bir sayfa dünyasında çalıştırıp doğrular. Sayfaya satır içi
// <script> olarak girdiği için burada da metne çevirip öyle kuruyoruz.
// Saat dilimi kaydırmasının işareti ve yaz saati geçişleri sessizce yanlış
// olabilecek cinsten, o yüzden gerçekten koşturuyoruz.
//   node test-patch.js

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

// Kaynak tek yerde: src/extension. extensions/ altindakiler buradan uretiliyor.
const SRC_ROOT = path.join(__dirname, '..', 'extension');

const SRC = SRC_ROOT;
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');

// vm bağlamı kendi Date / Intl kopyasını verir, patch.js'in yaptığı değişiklikler
// bu test sürecinin kendi Date'ine bulaşmaz.
const ctx = vm.createContext({
  console,
  setTimeout,
  clearTimeout,
  setInterval: () => 1,
  clearInterval: () => {},
  URL,           // injected.js IP-geo adresini ayristirirken kullaniyor
  WeakMap        // sertlestirme tablosu
});

vm.runInContext(`
  globalThis.window = globalThis;
  // Yama ile kopru ozel olaylarla konusuyor: ad+'p' yamadan koprue, ad+'b'
  // kopruden yamaya. Test kanal adini kendisi veriyor (TESTCH).
  globalThis.__handlers = [];
  globalThis.__pageSaw = [];   // ad bilinmeden sayfanin gorebilecegi her sey
  globalThis.addEventListener = function (type, fn) {
    if (type === 'TESTCHb') __handlers.push(fn);
    else __pageSaw.push(type);
  };
  globalThis.CustomEvent = function CustomEvent(type, init) {
    this.type = type; this.detail = init && init.detail;
  };
  globalThis.__posted = [];
  globalThis.dispatchEvent = function (ev) {
    if (ev.type === 'TESTCHp') __posted.push(JSON.parse(ev.detail));
    else __pageSaw.push('dispatch:' + ev.type);
  };
  globalThis.location = { origin: 'https://test.example', href: 'https://test.example/sayfa' };
  // Eski acik yol: bu cagrildiysa sayfa her seyi duyabilirdi
  globalThis.postMessage = function () { __pageSaw.push('postMessage'); };
  globalThis.Response = function (body, init) {
    this.__body = body;
    this.status = (init && init.status) || 200;
    this.ok = true;
    this.text = function () { return Promise.resolve(this.__body); };
    this.json = function () { return Promise.resolve(JSON.parse(this.__body)); };
  };
  globalThis.fetch = function () { return Promise.resolve(new Response('GERCEK', {})); };
  // Gercek tarayicida bu metotlar ORNEKTE degil prototipte durur. Yama da
  // oraya yaziyor; sahte dunya da oyle kurulmali, yoksa yanlis yolu test ederiz.
  globalThis.Geolocation = function Geolocation() {};
  Geolocation.prototype.getCurrentPosition = function () {};
  Geolocation.prototype.watchPosition = function () { return 0; };
  Geolocation.prototype.clearWatch = function () {};

  globalThis.Permissions = function Permissions() {};
  Permissions.prototype.query = function () {
    return Promise.resolve({ name: 'camera', state: 'prompt' });
  };

  globalThis.Navigator = function Navigator() {};
  Navigator.prototype.language = 'en-US';
  Navigator.prototype.languages = ['en-US'];

  globalThis.navigator = new Navigator();
  navigator.geolocation = new Geolocation();
  navigator.permissions = new Permissions();

  // Temporal: Node'da yok, gercek tarayicidaki bicimiyle sahtesi. Dilim
  // verilmezse "sistem" dilimi Etc/Real donuyor; sizinti oradan gorunur.
  globalThis.Temporal = {
    Now: {
      timeZoneId: function () { return 'Etc/Real'; },
      zonedDateTimeISO: function (tz) { return { tz: tz === undefined ? 'Etc/Real' : tz }; },
      plainDateTimeISO: function (tz) { return { tz: tz === undefined ? 'Etc/Real' : tz }; },
      plainDateISO: function (tz) { return { tz: tz === undefined ? 'Etc/Real' : tz }; },
      plainTimeISO: function (tz) { return { tz: tz === undefined ? 'Etc/Real' : tz }; },
      instant: function () { return {}; }
    },
    Instant: function Instant() {}
  };
  Temporal.Instant.prototype.toLocaleString = function (l, o) {
    return JSON.stringify({ l: l === undefined ? null : l, tz: (o && o.timeZone) || null });
  };

  // Worker, Blob, blob: adresleri ve senkron XHR. Blob icerikleri __blobs'ta
  // duruyor; test worker'a hangi kaynagin gittigini oradan okuyor.
  globalThis.__blobs = {};
  globalThis.__blobN = 0;
  globalThis.Blob = function Blob(parts) { this.src = parts.join(''); };
  globalThis.URL = (function (B) {
    function U(a, b) { return b === undefined ? new B(a) : new B(a, b); }
    U.createObjectURL = function (blob) {
      var id = 'blob:https://test.example/' + (++__blobN);
      __blobs[id] = blob.src;
      return id;
    };
    U.revokeObjectURL = function () {};
    return U;
  })(URL);
  globalThis.__workers = [];
  globalThis.Worker = function Worker(url, opts) {
    if (!(this instanceof Worker)) throw new TypeError('Worker ancak new ile');
    this.url = String(url);
    this.opts = opts;
    __workers.push(this);
    var self = this;
    // Deneme worker'i: CSP izin veriyormus gibi cevap ver
    if (__blobs[this.url] === 'postMessage(1)') {
      setTimeout(function () { if (self.onmessage) self.onmessage({ data: 1 }); }, 0);
    }
  };
  Worker.prototype.terminate = function () { this.terminated = true; };
  // Konusma sesleri: Turkce Windows'taki gibi, varsayilan ses Turkce
  globalThis.SpeechSynthesisVoice = function SpeechSynthesisVoice(name, lang, local, def) {
    this.name = name; this.lang = lang; this.localService = local; this.__def = def;
  };
  Object.defineProperty(SpeechSynthesisVoice.prototype, 'default', {
    configurable: true, enumerable: true, get: function () { return this.__def; }
  });
  globalThis.__voices = [
    new SpeechSynthesisVoice('Microsoft Tolga', 'tr-TR', true, true),
    new SpeechSynthesisVoice('Microsoft David', 'en-US', true, false),
    new SpeechSynthesisVoice('Microsoft Hedda', 'de-DE', true, false),
    new SpeechSynthesisVoice('Google Deutsch', 'de-DE', false, false),
    new SpeechSynthesisVoice('Google 日本語', 'ja-JP', false, false)
  ];
  globalThis.SpeechSynthesis = function SpeechSynthesis() {};
  SpeechSynthesis.prototype.getVoices = function () { return __voices.slice(); };
  globalThis.speechSynthesis = new SpeechSynthesis();

  // Klavye duzeni: Turkce Q. Gercek KeyboardLayoutMap gibi okuma yollari
  // prototipte, veri ornekte.
  globalThis.KeyboardLayoutMap = function KeyboardLayoutMap(entries) { this.__m = new Map(entries); };
  KeyboardLayoutMap.prototype.get = function (k) { return this.__m.get(k); };
  KeyboardLayoutMap.prototype.has = function (k) { return this.__m.has(k); };
  KeyboardLayoutMap.prototype.entries = function () { return this.__m.entries(); };
  KeyboardLayoutMap.prototype.keys = function () { return this.__m.keys(); };
  KeyboardLayoutMap.prototype.values = function () { return this.__m.values(); };
  KeyboardLayoutMap.prototype.forEach = function (cb) { this.__m.forEach(cb); };
  KeyboardLayoutMap.prototype[Symbol.iterator] = function () { return this.__m.entries(); };
  Object.defineProperty(KeyboardLayoutMap.prototype, 'size', {
    configurable: true, get: function () { return this.__m.size; }
  });
  globalThis.__trLayout = new KeyboardLayoutMap([['KeyI', 'ı'], ['Quote', 'i'], ['KeyQ', 'q']]);

  // Baglanti bilgisi: gercekte prototipte getter
  globalThis.NetworkInformation = function NetworkInformation() {};
  Object.defineProperty(NetworkInformation.prototype, 'rtt', { configurable: true, get: function () { return 350; } });
  Object.defineProperty(NetworkInformation.prototype, 'downlink', { configurable: true, get: function () { return 1.45; } });

  // Medya cihazlari: izin yok (etiket bos), iki mikrofon bir kamera
  globalThis.MediaDevices = function MediaDevices() {};
  MediaDevices.prototype.enumerateDevices = function () {
    return Promise.resolve([
      { kind: 'audioinput', label: '', deviceId: 'a1' },
      { kind: 'audioinput', label: '', deviceId: 'a2' },
      { kind: 'videoinput', label: '', deviceId: 'v1' }
    ]);
  };

  globalThis.XMLHttpRequest = function XMLHttpRequest() {};
  XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; };
  XMLHttpRequest.prototype.send = function () {
    var s = __blobs[this.__u];
    this.status = s === undefined ? 404 : 200;
    this.responseText = s === undefined ? '' : s;
  };

  // Sayfanin actigi bos cerceve: kendi gerceklikleri, el degmemis API'ler.
  // hardenFrame'in gidip yamayi oraya tasimasi gerekiyor.
  globalThis.__makeChild = function () {
    var w = {};
    w.Geolocation = function Geolocation() {};
    w.Geolocation.prototype.getCurrentPosition = function () {};
    w.Geolocation.prototype.watchPosition = function () { return 0; };
    w.Geolocation.prototype.clearWatch = function () {};
    w.Navigator = function Navigator() {};
    w.navigator = new w.Navigator();
    w.navigator.geolocation = new w.Geolocation();
    w.document = {};
    w.Intl = { DateTimeFormat: function () {} };
    w.Date = function () {};
    w.Date.prototype = {};
    w.Function = function () {};
    w.Function.prototype = {};
    w.XMLHttpRequest = function () {};
    w.XMLHttpRequest.prototype = { open: function () {}, send: function () {} };
    return w;
  };

  globalThis.__child = __makeChild();

  globalThis.HTMLIFrameElement = function HTMLIFrameElement() {};
  Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
    configurable: true,
    get: function () { return __child; }
  });

  // lastModified gercek tarayicida Document.prototype'ta bir getter. Yama da
  // oraya yaziyor, sahte dunya da oyle kurulmali.
  globalThis.Document = function Document() {};
  globalThis.__rawLastModified = '01/15/2026 08:30:00';
  Object.defineProperty(Document.prototype, 'lastModified', {
    configurable: true,
    get: function () { return __rawLastModified; }
  });

  globalThis.document = new Document();
  document.readyState = 'complete';
  document.addEventListener = function () {};
  document.querySelectorAll = function () { return []; };
`, ctx);

vm.runInContext(read('core/engine.js'), ctx, { filename: 'engine.js' });
vm.runInContext(read('content/injected.js'), ctx, { filename: 'injected.js' });

// Sayfaya nasıl giriyorsa öyle çalıştır: kaynağı metne çevirip yeniden kur.
// Böylece "gömülünce dışarıdaki bir değişkene bakıyor" hatası da yakalanır.
vm.runInContext('(' + vm.runInContext('gnmInjected', ctx) + ')(' +
  vm.runInContext('gnmEngineFactory', ctx) + ', "TESTCH");', ctx, { filename: 'injected-inline.js' });

// patch.js kayıtları postMessage ile gönderiyor, hepsini toplayalım
function logged() {
  return vm.runInContext(
    'JSON.stringify(__posted.filter(function (m) { return m && m.__gnm === 2; })' +
    '.reduce(function (a, m) { return a.concat(m.log); }, []))', ctx
  );
}
function loggedEvents() { return JSON.parse(logged()).map(e => e.e); }

function applyConfig(cfg, active) {
  ctx.__cfg = cfg;
  ctx.__active = active !== false;
  vm.runInContext(
    '__handlers.forEach(function (f) { f({ detail: JSON.stringify(' +
    '{ __gnm: 1, cfg: __cfg, active: __active }) }); })',
    ctx
  );
}

// Köprüye giden konum istekleri ve onlara verilen cevaplar
function requests() {
  return JSON.parse(vm.runInContext(
    'JSON.stringify(__posted.filter(function (m) { return m && m.__gnm === 3; }))', ctx));
}
function answer(id, pos) {
  ctx.__reply = { __gnm: 4, id: id, pos: pos };
  vm.runInContext('__handlers.forEach(function (f) { f({ detail: JSON.stringify(__reply) }); })', ctx);
}

const CFG = {
  lat: 40.9903, lon: 29.0250, privacy: 'medium', exact: false,
  timeZone: 'Europe/Istanbul', locale: 'tr-TR', logging: true
};

const run = expr => vm.runInContext(expr, ctx);
const tick = (ms) => new Promise(r => setTimeout(r, ms || 5));

(async function () {
  // 1. Ayar gelmeden önce çağrı yapılırsa kaybolmamalı, kuyrukta beklemeli.
  run('globalThis.__early = null; navigator.geolocation.getCurrentPosition(function (p) { __early = p; });');
  await tick();
  assert.strictEqual(ctx.__early, null, 'ayar gelmeden cevap verilmemeli');

  applyConfig(CFG);
  await tick();
  assert.ok(ctx.__early, 'ayar gelince kuyruktaki çağrı cevaplanmalı');

  // 2. Dönen konum motorun verdiği konum olmalı, gerçek koordinat değil.
  const engine = require('../extension/core/engine.js');
  const expected = engine.position(CFG, Date.now(), 'https://test.example');
  run('globalThis.__last = null; navigator.geolocation.getCurrentPosition(function (p) { __last = p; });');
  await tick();
  assert.strictEqual(ctx.__last.coords.latitude, expected.latitude, 'enlem motorla aynı olmalı');
  assert.strictEqual(ctx.__last.coords.longitude, expected.longitude, 'boylam motorla aynı olmalı');
  assert.strictEqual(ctx.__last.coords.accuracy, expected.accuracy, 'accuracy motorla aynı olmalı');
  assert.notStrictEqual(ctx.__last.coords.latitude, CFG.lat, 'merkez doğrudan verilmemeli');

  // 3. Konum izni verilmiş görünmeli, başka izinler dokunulmadan geçmeli.
  const geoPerm = await run("navigator.permissions.query({ name: 'geolocation' })");
  assert.strictEqual(geoPerm.state, 'granted', 'konum izni granted dönmeli');
  const camPerm = await run("navigator.permissions.query({ name: 'camera' })");
  assert.strictEqual(camPerm.state, 'prompt', 'diğer izinler değişmemeli');

  // 4. Intl saat dilimi profilden gelmeli, açıkça verilen dilim ezilmemeli.
  assert.strictEqual(
    run("new Intl.DateTimeFormat().resolvedOptions().timeZone"),
    'Europe/Istanbul', 'Intl profil dilimini bildirmeli'
  );
  assert.strictEqual(
    run("new Intl.DateTimeFormat('en', { timeZone: 'Asia/Tokyo' }).resolvedOptions().timeZone"),
    'Asia/Tokyo', 'sitenin açıkça verdiği dilim korunmalı'
  );

  // 5. getTimezoneOffset işareti. UTC+3 için -180.
  assert.strictEqual(run("new Date(Date.UTC(2026, 0, 15, 12, 0)).getTimezoneOffset()"), -180,
    'Europe/Istanbul offseti -180 olmalı');

  // 6. Yaz saati. New York kışın UTC-5, yazın UTC-4.
  applyConfig(Object.assign({}, CFG, { timeZone: 'America/New_York' }));
  assert.strictEqual(run("new Date(Date.UTC(2026, 0, 15, 12, 0)).getTimezoneOffset()"), 300,
    'New York kışın +300 olmalı');
  assert.strictEqual(run("new Date(Date.UTC(2026, 6, 4, 12, 0)).getTimezoneOffset()"), 240,
    'New York yazın +240 olmalı');

  // 7. Yerel getter'lar kaydırılmış olmalı. 4 Temmuz 02:00 UTC, New York'ta 3 Temmuz 22:00.
  assert.strictEqual(run("new Date(Date.UTC(2026, 6, 4, 2, 0)).getHours()"), 22, 'getHours kaymadı');
  assert.strictEqual(run("new Date(Date.UTC(2026, 6, 4, 2, 0)).getDate()"), 3, 'getDate kaymadı');
  assert.strictEqual(run("new Date(Date.UTC(2026, 6, 4, 2, 0)).getMonth()"), 6, 'getMonth bozuldu');

  // 8. Aynı anı Intl ve Date aynı saat olarak göstermeli. Site ikisini
  //    karşılaştırırsa çelişki görmemeli.
  applyConfig(Object.assign({}, CFG, { timeZone: 'Asia/Tokyo' }));
  const viaDate = run("new Date(Date.UTC(2026, 2, 9, 20, 15)).getHours()");
  const viaIntl = +run("new Intl.DateTimeFormat('en-US', { hour: '2-digit', hour12: false }).format(new Date(Date.UTC(2026, 2, 9, 20, 15)))");
  assert.strictEqual(viaDate, viaIntl % 24, `Date (${viaDate}) ile Intl (${viaIntl}) çelişiyor`);

  // 9. getTime UTC tabanlı, dokunulmamış olmalı.
  const t = Date.UTC(2026, 2, 9, 20, 15);
  assert.strictEqual(run(`new Date(${t}).getTime()`), t, 'getTime değişmemeli');

  // 10. navigator.language profilden gelmeli.
  applyConfig(CFG);
  assert.strictEqual(run('navigator.language'), 'tr-TR', 'dil profilden gelmeli');
  assert.deepStrictEqual(
    JSON.parse(run('JSON.stringify(navigator.languages)')), ['tr-TR', 'tr'],
    'languages listesi ana dili de içermeli'
  );

  // 11. Yapılan işler log'a düşmeli. Hata ararken tek elimizdeki bu.
  {
    await tick(500);   // gömülü kayıt tamponu 400 ms'de boşalıyor
    const events = loggedEvents();
    ['ready', 'geo.get.call', 'geo.fake', 'perm.query', 'tz.read', 'locale.read']
      .forEach(function (want) {
        assert.ok(events.indexOf(want) !== -1, want + ' kaydı yok. Olanlar: ' + events.join(','));
      });

    const geo = JSON.parse(logged()).filter(e => e.e === 'geo.fake')[0];
    assert.strictEqual(geo.s, 'patch');
    assert.strictEqual(geo.d.origin, 'https://test.example');
    assert.ok(isFinite(geo.d.lat) && isFinite(geo.d.lon), 'kaydedilen konum sayı olmalı');

    // Ayrıntılı kapalıyken saat dilimi okuması bir kez yazılmalı, yüzlerce kez değil
    const tzCount = JSON.parse(logged()).filter(e => e.e === 'tz.read').length;
    assert.strictEqual(tzCount, 1, 'tz okuması tekrar tekrar yazılmamalı, adet: ' + tzCount);
  }

  // 12. Uzantı bu sayfada kapalıysa patch konum uydurmuyor, köprüden istiyor.
  //     Gerçek konum API'si sayfa dünyasında hiç bulunmuyor; kapalıyken de
  //     kararı ve gerçek konumu yalıtılmış taraf veriyor.
  {
    const before = requests().length;
    applyConfig(CFG, false);
    run('globalThis.__off = null; navigator.geolocation.getCurrentPosition(function (p) { __off = p; });');
    await tick();

    const reqs = requests();
    assert.strictEqual(reqs.length, before + 1, 'kapalıyken köprüye istek gitmeli');
    assert.strictEqual(ctx.__off, null, 'cevap gelmeden konum verilmemeli');

    answer(reqs[reqs.length - 1].id, { latitude: 12.5, longitude: 34.5, accuracy: 30 });
    await tick();
    assert.strictEqual(ctx.__off.coords.latitude, 12.5, 'köprünün verdiği konum geçmeli');
    assert.strictEqual(ctx.__off.coords.accuracy, 30);
  }

  // 13. Sayfa "kapalıyım" diye taklit etse bile saat dilimi yamasını
  //     söktüremiyor: bir kez açıldıysa sayfa ömrü boyunca açık kalıyor.
  {
    applyConfig(Object.assign({}, CFG, { timeZone: 'Asia/Tokyo' }), true);
    const acikken = run("new Intl.DateTimeFormat().resolvedOptions().timeZone");
    assert.strictEqual(acikken, 'Asia/Tokyo');

    applyConfig(Object.assign({}, CFG, { timeZone: 'Asia/Tokyo' }), false);
    assert.strictEqual(run("new Intl.DateTimeFormat().resolvedOptions().timeZone"), 'Asia/Tokyo',
      'sahte "kapalı" mesajı gerçek saat dilimini açığa çıkarmamalı');
  }

  // 14. Kayıt kapatılırsa hiçbir şey gönderilmemeli.
  {
    const before = JSON.parse(logged()).length;
    applyConfig(Object.assign({}, CFG, { logging: false }), true);
    run("navigator.geolocation.getCurrentPosition(function () {});");
    await tick();
    await tick(500);   // gömülü kayıt tamponu 400 ms'de boşalıyor
    assert.strictEqual(JSON.parse(logged()).length, before, 'kayıt kapalıyken göndermemeli');
  }

  // 15. Gömülü kod TEK BAŞINA ayakta durmalı. Sayfaya metin olarak giriyor;
  //     dışarıdaki bir değişkene bakarsa gerçek sayfada sessizce ölür ve site
  //     gerçek konumu alır. Bu tam olarak yaşanmış bir hata, testi kalsın.
  {
    const clean = vm.createContext({
      console, setTimeout, clearTimeout, setInterval: () => 1, clearInterval: () => {}
    });
    vm.runInContext(`
      globalThis.window = globalThis;
      globalThis.__posted = [];
      globalThis.__names = [];
      globalThis.__open = 0;
      globalThis.postMessage = function () { __open++; };
      globalThis.CustomEvent = function (type, init) { this.type = type; this.detail = init && init.detail; };
      globalThis.dispatchEvent = function (ev) { __names.push(ev.type); __posted.push(JSON.parse(ev.detail)); };
      globalThis.addEventListener = function () {};
      globalThis.location = { origin: 'https://temiz.test', href: 'https://temiz.test/' };
      globalThis.navigator = {
        geolocation: { getCurrentPosition() {}, watchPosition() { return 0; }, clearWatch() {} },
        permissions: { query() { return Promise.resolve({ state: 'prompt' }); } }
      };
    `, clean);

    const code = '(' + vm.runInContext('gnmInjected', ctx) + ')(' +
      vm.runInContext('gnmEngineFactory', ctx) + ');';

    assert.doesNotThrow(() => vm.runInContext(code, clean, { filename: 'inline' }),
      'gömülü kod tek başına çalışmalı');
    assert.strictEqual(vm.runInContext('window.__gnmOK', clean), 1,
      'köprünün baktığı işaret konmalı, yoksa CSP yedeğine boşuna düşer');
    assert.strictEqual(vm.runInContext('JSON.stringify(__posted[0])', clean), '{"__gnm":0}',
      'yama yüklendiğini duyurmalı, yoksa geç yüklenince ayarı hiç alamaz');
    assert.strictEqual(vm.runInContext('__open', clean), 0, 'herkese acik postMessage kullanilmamali');
    assert.ok(/^g[a-z0-9]{12,}p$/.test(vm.runInContext('__names[0]', clean)),
      'kanal adi rastgele olmali, gelen: ' + vm.runInContext('__names[0]', clean));
    assert.notStrictEqual(
      vm.runInContext('navigator.geolocation.getCurrentPosition.toString()', clean).indexOf('native code'),
      1, 'konum API si gerçekten yamalanmalı');
  }

  // 15b. Acilis degeri: ayar kopruden GEC geliyor; o arada sayfanin ilk
  // betigi gercek dilimi okuyordu. Arka planin ekledigi Server-Timing gnm
  // kaydi okunmali, ayar gelmeden de sahte dilim ve dil donmeli, kayit da
  // sayfanin serverTiming listesinde gorunmemeli.
  {
    const boot = vm.createContext({
      console, setTimeout, clearTimeout, setInterval: () => 1, clearInterval: () => {}
    });
    vm.runInContext(`
      globalThis.window = globalThis;
      globalThis.postMessage = function () {};
      globalThis.addEventListener = function () {};
      globalThis.location = { origin: 'https://ilk.test', href: 'https://ilk.test/' };
      globalThis.navigator = { language: 'tr-TR', languages: ['tr-TR'],
        geolocation: { getCurrentPosition() {}, watchPosition() { return 0; }, clearWatch() {} } };
      globalThis.Navigator = function Navigator() {};
      Object.defineProperty(Navigator.prototype, 'language', { configurable: true, get() { return 'tr-TR'; } });
      Object.setPrototypeOf(navigator, Navigator.prototype); delete navigator.language;
      var entries = [{ name: 'cdn', description: 'hit' }, { name: 'gnm', description: 'Asia/Tokyo|ja-JP' }];
      globalThis.PerformanceResourceTiming = function () {};
      Object.defineProperty(PerformanceResourceTiming.prototype, 'serverTiming', { configurable: true, get() { return entries.slice(); } });
      var nav = Object.create(PerformanceResourceTiming.prototype);
      globalThis.performance = { getEntriesByType(t) { return t === 'navigation' ? [nav] : []; } };
      globalThis.__nav = nav;
    `, boot);
    const code = '(' + vm.runInContext('gnmInjected', ctx) + ')(' + vm.runInContext('gnmEngineFactory', ctx) + ');';
    vm.runInContext(code, boot, { filename: 'boot' });
    assert.strictEqual(vm.runInContext('new Intl.DateTimeFormat().resolvedOptions().timeZone', boot), 'Asia/Tokyo',
      'ayar gelmeden acilis dilimi kullanilmali');
    assert.strictEqual(vm.runInContext('navigator.language', boot), 'ja-JP',
      'ayar gelmeden acilis dili kullanilmali');
    assert.strictEqual(vm.runInContext("__nav.serverTiming.map(function (e) { return e.name; }).join(',')", boot), 'cdn',
      'gnm kaydi sayfadan gizlenmeli, sitenin kendi kaydi kalmali');
  }

  // 16. IP-geo yakalama: sayfa bilinen bir servise sordugunda cevabi biz veriyoruz.
  {
    applyConfig(Object.assign({}, CFG, { ipGeo: true }), true);

    const body = await run(
      "fetch('https://ipapi.co/json/').then(function (r) { return r.text(); })");
    const data = JSON.parse(body);
    assert.strictEqual(data.country_code, 'TR', 'ulke profilden gelmeli');
    assert.ok(isFinite(data.latitude) && isFinite(data.longitude), 'koordinat gelmeli');
    assert.strictEqual(data.timezone, 'Europe/Istanbul', 'saat dilimi profilden gelmeli');

    // Cloudflare trace duz metin
    const trace = await run(
      "fetch('https://www.cloudflare.com/cdn-cgi/trace').then(function (r) { return r.text(); })");
    assert.ok(trace.indexOf('loc=TR') !== -1, 'trace ciktisi ulkeyi tasimali: ' + trace);

    // Alakasiz adres dokunulmadan gecmeli
    const passed = await run("fetch('https://ornek.com/veri.json').then(function (r) { return r.text(); })");
    assert.strictEqual(passed, 'GERCEK', 'baska adresler yakalanmamali');

    // Kapatilabilmeli
    applyConfig(Object.assign({}, CFG, { ipGeo: false }), true);
    const off = await run("fetch('https://ipapi.co/json/').then(function (r) { return r.text(); })");
    assert.strictEqual(off, 'GERCEK', 'kapaliyken yakalamamali');
    applyConfig(Object.assign({}, CFG, { ipGeo: true }), true);
  }

  // 17. Sertlestirme: yamaladiklarimiz native gorunmeli, digerleri degismemeli.
  {
    const native = s => s.indexOf('[native code]') !== -1;
    assert.ok(native(run('navigator.geolocation.getCurrentPosition.toString()')),
      'getCurrentPosition native gorunmeli');
    assert.ok(native(run('navigator.geolocation.watchPosition.toString()')),
      'watchPosition native gorunmeli');
    assert.ok(native(run('Intl.DateTimeFormat.toString()')),
      'Intl.DateTimeFormat native gorunmeli');
    assert.ok(native(run('Date.prototype.getTimezoneOffset.toString()')),
      'getTimezoneOffset native gorunmeli');
    assert.ok(native(run('Function.prototype.toString.toString()')),
      'toString kendisi de native gorunmeli');

    // Sayfanin kendi fonksiyonu oldugu gibi kalmali, yoksa her sey supheli olur
    assert.ok(!native(run('(function ornek() { return 1; }).toString()')),
      'sayfanin fonksiyonu native gorunmemeli');
  }

  // 18. Konum API'si ORNEKTE degil PROTOTIPTE yamali olmali.
  // Ornekte olsaydi sayfa "delete navigator.geolocation.getCurrentPosition"
  // deyip prototipteki gercek fonksiyona geri donebilirdi.
  {
    assert.strictEqual(
      run('Object.getOwnPropertyNames(navigator.geolocation).length'), 0,
      'geolocation ornegi uzerinde kendi ozelligi kalmamali');

    run('globalThis.__afterDelete = null; delete navigator.geolocation.getCurrentPosition;' +
        'navigator.geolocation.getCurrentPosition(function (p) { __afterDelete = p; });');
    await tick();
    assert.ok(ctx.__afterDelete, 'delete sonrasi da yamali fonksiyon calismali');
    assert.notStrictEqual(ctx.__afterDelete.coords.latitude, CFG.lat,
      'delete ile gercek fonksiyona donulememeli');

    assert.strictEqual(
      run('Object.getOwnPropertyNames(navigator).indexOf("language")'), -1,
      'dil de prototipte olmali, navigator uzerinde gorunmemeli');
  }

  // 19. Cerceve sertlestirmesi: sayfa bos bir cerceve acip oradan konum
  // okuyabiliyordu, orada hicbir sey yamali degildi. En genis kacak yolu buydu.
  {
    const child = run('(function () { var f = new HTMLIFrameElement(); return f.contentWindow; })()');
    run('globalThis.__childFirst = __child;');

    assert.strictEqual(
      run('__child.Geolocation.prototype.getCurrentPosition === ' +
          'Geolocation.prototype.getCurrentPosition'), true,
      'cocuk pencerenin konum fonksiyonu bizimkiyle ayni olmali');
    assert.strictEqual(run('__child.Intl.DateTimeFormat === Intl.DateTimeFormat'), true,
      'cocuk pencerenin Intl.DateTimeFormat yamasi tasinmali');
    // Isaret artik Symbol: sayfa Object.keys ile goremiyor, biz adiyla okuyoruz
    // Isaret ayri: 'gnm.patched' cercevenin KENDI yamasina ait, ust pencere
    // 'gnm.hardened' koyuyor. Tek isaretken kendi yamasi olan cerceve atlaniyordu.
    assert.strictEqual(run("__child[Symbol['for']('gnm.hardened')]"), 1,
      'cocuk pencere isaretlenmeli');

    // Kendi yamasi olan cerceve (Chrome match_origin_as_fallback): yamasi ayarini
    // koprusunden gec aliyor, o arada gercek dilimi veriyordu. Ust pencere saat
    // dilimi ve dili yine de ustune yazmali; konum ve worker'a dokunmamali.
    run("globalThis.__own = __makeChild(); __own[Symbol['for']('gnm.patched')] = 1;" +
        'globalThis.__ownGeo = __own.Geolocation.prototype.getCurrentPosition;' +
        'globalThis.__child = __own; (function () { var f = new HTMLIFrameElement(); return f.contentWindow; })();');
    assert.strictEqual(run('__own.Intl.DateTimeFormat === Intl.DateTimeFormat'), true,
      'kendi yamasi olan cercevede de saat dilimi ust pencereden gelmeli');
    assert.strictEqual(run('__own.Date.prototype.getTimezoneOffset === Date.prototype.getTimezoneOffset'), true,
      'kendi yamasi olan cercevede Date de ust pencereden gelmeli');
    assert.strictEqual(run('__own.Geolocation.prototype.getCurrentPosition === __ownGeo'), true,
      'kendi yamasi olan cercevenin konum yamasina dokunulmamali');
    run('globalThis.__child = __childFirst;');
    assert.strictEqual(run('Object.keys(__child).filter(function (k) '
      + "{ return k.indexOf('__gnm') === 0; }).length"), 0,
      'cocuk pencerenin numaralandirmasinda iz kalmamali');

    // Gercekten sahte konum veriyor mu
    run('globalThis.__framePos = null; __child.navigator.geolocation' +
        '.getCurrentPosition(function (p) { __framePos = p; });');
    await tick();
    assert.ok(ctx.__framePos, 'cerceve icinden de cevap gelmeli');
    assert.notStrictEqual(ctx.__framePos.coords.latitude, CFG.lat,
      'cerceve icinde gercek konum verilmemeli');

    // Kapatilabilmeli: ayar kapaliysa yeni cerceveye dokunulmuyor
    applyConfig(Object.assign({}, CFG, { harden: false }), true);
    run('globalThis.__child2 = __makeChild();');
    const before = run('__child2.Geolocation.prototype.getCurrentPosition');
    run('(function () { var d = Object.getOwnPropertyDescriptor(' +
        'HTMLIFrameElement.prototype, "contentWindow"); })()');
    run('globalThis.__hardenOff = (function () {' +
        'var save = __child; __child = __child2;' +
        'var f = new HTMLIFrameElement(); f.contentWindow;' +
        'var same = __child2.Geolocation.prototype.getCurrentPosition ===' +
        ' Geolocation.prototype.getCurrentPosition;' +
        '__child = save; return same; })()');
    assert.strictEqual(ctx.__hardenOff, false, 'kapaliyken cerceveye dokunulmamali');
    applyConfig(CFG, true);
  }

  // 20. "Kapaliyken reddet": gercek konumu vermektense izin yokmus gibi davran.
  {
    applyConfig(Object.assign({}, CFG, { denyWhenOff: true }), false);
    const oncekiIstek = requests().length;

    run('globalThis.__denied = null;' +
        'navigator.geolocation.getCurrentPosition(function () {},' +
        ' function (e) { __denied = e; });');
    await tick();

    assert.ok(ctx.__denied, 'hata geri donmeli');
    assert.strictEqual(ctx.__denied.code, 1, 'PERMISSION_DENIED donmeli');
    assert.strictEqual(requests().length, oncekiIstek,
      'kopruye gercek konum sorulmamali');

    applyConfig(CFG, true);
  }

  // 21. Date'in metin yollari da profil dilimine kaymali. Kaymazsa getHours()
  // 14 derken toString() baska bir saat yaziyor; celiskinin kendisi imza.
  {
    applyConfig(CFG, true);
    run('globalThis.__ts = new Date(Date.UTC(2026, 0, 15, 12, 0, 0)).toString();');
    // Istanbul kisin UTC+3: 15:00, etiket GMT+0300
    assert.ok(/15:00:00 GMT\+0300/.test(ctx.__ts),
      'toString profil diliminde olmali, gelen: ' + ctx.__ts);
    assert.ok(/^Thu Jan 15 2026 /.test(ctx.__ts),
      'tarih kismi da kaymali, gelen: ' + ctx.__ts);

    run('globalThis.__td = new Date(Date.UTC(2026, 0, 15, 22, 30, 0)).toDateString();');
    // UTC 22:30 Istanbul'da ertesi gun 01:30
    assert.strictEqual(ctx.__td, 'Fri Jan 16 2026',
      'toDateString gun sinirini gecerken kaymali');
  }

  // 22. Gecersiz tarih bozulmamali: yamanin en kolay kirdigi yer burasi.
  {
    run('globalThis.__inv = new Date(NaN).toString();');
    assert.strictEqual(ctx.__inv, 'Invalid Date', 'gecersiz tarih olduğu gibi kalmali');
  }

  // 23. tzDeep kapaliyken metin yollari gercek dilime donmeli.
  {
    applyConfig(Object.assign({}, CFG, { tzDeep: false }), true);
    run('globalThis.__off = new Date(Date.UTC(2026, 0, 15, 12, 0, 0)).toString();');
    // Makinenin kendi dilimi Istanbul olabilir, "GMT+0300 olmasin" diyemeyiz.
    // Motorun kendi metniyle karsilastiriyoruz, o her makinede dogru.
    assert.strictEqual(ctx.__off, new Date(Date.UTC(2026, 0, 15, 12, 0, 0)).toString(),
      'tzDeep kapaliyken motorun kendi metni donmeli');
    applyConfig(CFG, true);
  }

  // 24. Intl'in tamami. DateTimeFormat disindakiler de sahte dili sormali;
  // yoksa Intl.NumberFormat().resolvedOptions().locale tek satirda ele veriyor.
  {
    run("globalThis.__nf = new Intl.NumberFormat().resolvedOptions().locale;");
    assert.strictEqual(ctx.__nf, 'tr-TR', 'NumberFormat sahte dili kullanmali');

    // Collator'in resolvedOptions'i bolgeyi dusurup 'tr' donduruyor: tr-TR icin
    // ayri bir siralama kurali yok. Gercek bir Turk kullanicida da boyle
    // gorunur, yani sizinti degil. Onemli olan gercek dilin gorunmemesi.
    run("globalThis.__co = new Intl.Collator().resolvedOptions().locale;");
    assert.ok(ctx.__co === 'tr' || ctx.__co.indexOf('tr-') === 0,
      'Collator sahte dili kullanmali, gelen: ' + ctx.__co);

    // Sayfa acikca dil verdiyse ona dokunulmamali
    run("globalThis.__exp = new Intl.NumberFormat('de-DE').resolvedOptions().locale;");
    assert.strictEqual(ctx.__exp, 'de-DE', 'acikca verilen dil korunmali');

    // instanceof bozulmamali
    run("globalThis.__inst = new Intl.NumberFormat() instanceof Intl.NumberFormat;");
    assert.strictEqual(ctx.__inst, true, 'instanceof calismali');
  }

  // 25. Intl disindaki ayni sizintinin kapilari.
  {
    run("globalThis.__num = (1234.5).toLocaleString();");
    assert.strictEqual(ctx.__num, (1234.5).toLocaleString('tr-TR'),
      'Number.toLocaleString sahte dili kullanmali');
  }

  // 26. localeIntl kapaliyken biçimlere hiç dokunulmamali.
  {
    applyConfig(Object.assign({}, CFG, { localeIntl: false }), true);
    run("globalThis.__nf2 = new Intl.NumberFormat().resolvedOptions().locale;");
    // Makinenin kendi dili tr-TR olabilir; "tr-TR olmasin" demek yerine
    // motorun varsayilaniyla karsilastiriyoruz.
    assert.strictEqual(ctx.__nf2, new Intl.NumberFormat().resolvedOptions().locale,
      'localeIntl kapaliyken motorun varsayilan dili kalmali');
    applyConfig(CFG, true);
  }

  // 27. document.lastModified de profil diliminde olmali. Sunucu Last-Modified
  // gondermeyen sayfalarda bu "su an" oluyor, yani her yuklemede gercek dilim.
  {
    applyConfig(Object.assign({}, CFG, { timeZone: 'UTC' }), true);
    run("globalThis.__lm = document.lastModified;");

    // Ham deger makinenin kendi diliminde okunuyor, beklenen degeri de oradan
    // hesapliyoruz. Boylece test her dilimde ayni sonucu veriyor.
    const ham = new Date(Date.parse('01/15/2026 08:30:00'));
    const p2 = n => String(n).padStart(2, '0');
    const beklenen = p2(ham.getUTCMonth() + 1) + '/' + p2(ham.getUTCDate()) + '/' +
      ham.getUTCFullYear() + ' ' + p2(ham.getUTCHours()) + ':' +
      p2(ham.getUTCMinutes()) + ':' + p2(ham.getUTCSeconds());
    assert.strictEqual(ctx.__lm, beklenen, 'lastModified profil diliminde olmali');
    applyConfig(CFG, true);
  }

  // 28. Sayfa uzantiyi numaralandirarak bulamamali. __gnmOK kopruye "satir ici
  // betik calisti mi" demek icin var ve enumerable olmamali; kopru okuyunca da
  // siliniyor. Sahte konum veren bir uzantinin kendini ele vermesi, kendi
  // amacini bozar.
  {
    run("globalThis.__keys = Object.keys(window).filter(function (k) { return k.indexOf('__gnm') === 0; });");
    assert.strictEqual(ctx.__keys.length, 0,
      'window numaralandirmasinda uzanti izi kalmamali, gelen: ' + JSON.stringify(ctx.__keys));

    // Kanal adi disaridan geldiginde (kopru betik sokarken) isaret konmuyor
    assert.strictEqual(run("'__gnmOK' in window"), false, 'kanal adi verildiyse isaret kalmamali');

    // Sayfanin duyabilecegi hicbir yol kullanilmamali: postMessage yok, bilinen
    // adli olay yok, 'message' dinleyicisi yok. Butun test boyunca biriken kayit.
    const saw = JSON.parse(run('JSON.stringify(__pageSaw)'));
    assert.deepStrictEqual(saw.filter(t => t === 'postMessage' || t === 'message' || /^dispatch:/.test(t)), [],
      'ayar ve kayitlar herkese acik kanaldan gitmemeli, gelen: ' + JSON.stringify(saw));
  }

  // 30. Intl.DateTimeFormat de sahte dili kullanmali. Oteki Intl yapicilari
  // sariliydi, en cok okunani acikta kalmisti.
  {
    applyConfig(CFG, true);
    assert.strictEqual(run("new Intl.DateTimeFormat().resolvedOptions().locale"), 'tr-TR',
      'DateTimeFormat sahte dili kullanmali');
    assert.strictEqual(run("new Intl.DateTimeFormat('de-DE').resolvedOptions().locale"), 'de-DE',
      'acikca verilen dil korunmali');
  }

  // 31. Temporal.Now. Chrome 144 ve Firefox 139'dan beri gercek dilimi tek
  // satirda veriyordu.
  {
    assert.strictEqual(run('Temporal.Now.timeZoneId()'), 'Europe/Istanbul',
      'Temporal.Now.timeZoneId profil dilimini vermeli');
    assert.strictEqual(run('Temporal.Now.zonedDateTimeISO().tz'), 'Europe/Istanbul',
      'zonedDateTimeISO profil dilimini kullanmali');
    assert.strictEqual(run('Temporal.Now.plainDateISO().tz'), 'Europe/Istanbul',
      'plainDateISO profil dilimini kullanmali');
    assert.strictEqual(run("Temporal.Now.zonedDateTimeISO('Asia/Tokyo').tz"), 'Asia/Tokyo',
      'acikca verilen dilim korunmali');
    const inst = JSON.parse(run('new Temporal.Instant().toLocaleString()'));
    assert.strictEqual(inst.tz, 'Europe/Istanbul', 'Instant.toLocaleString profil diliminde olmali');
    assert.strictEqual(inst.l, 'tr-TR', 'Instant.toLocaleString sahte dili kullanmali');
    assert.strictEqual(run('Temporal.Now.timeZoneId.toString()'),
      'function timeZoneId() { [native code] }', 'yama toString ile ele vermemeli');
    assert.strictEqual(run("'prototype' in Temporal.Now.timeZoneId"), false,
      'yerli yontem gibi prototype tasimamali');
  }

  // 32. Worker. CSP denemesi gecince sayfanin worker'i yamali blob'dan
  // kuruluyor; gecmeyen ya da kapsam disi durumda gercek yapiciya kaliyor.
  {
    await tick(10); // deneme worker'inin cevabi
    assert.ok(loggedEvents().includes('worker.probe'), 'CSP denemesi kayda dusmeli');

    run("globalThis.__w = new Worker('/w.js');");
    assert.ok(/^blob:/.test(ctx.__w.url), 'worker blob uzerinden kurulmali, gelen: ' + ctx.__w.url);
    const src = run('__blobs[__w.url]');
    assert.ok(src.includes('importScripts("https://test.example/w.js")'),
      'asil betik mutlak adresle yuklenmeli');
    assert.ok(src.includes('"tz":"Europe/Istanbul"'), 'yamaya profil dilimi gitmeli');
    assert.strictEqual(run('__w instanceof Worker'), true, 'instanceof bozulmamali');

    run("globalThis.__wx = new Worker('https://baska.example/w.js');");
    assert.strictEqual(ctx.__wx.url, 'https://baska.example/w.js',
      'baska kaynakli adrese dokunulmamali');

    run("globalThis.__wm = new Worker('/m.js', { type: 'module' });");
    const msrc = run('__blobs[__wm.url]');
    assert.ok(/^import "blob:/.test(msrc) && msrc.includes('import "https://test.example/m.js"'),
      'modul worker once yamayi sonra betigi import etmeli, gelen: ' + msrc);

    // Sayfanin kendi blob'u: yapici donmeden okunmali, sonra iptal edilebilir
    run("globalThis.__pb = URL.createObjectURL(new Blob(['self.x = 1;'])); globalThis.__wb = new Worker(__pb);");
    const bsrc = run('__blobs[__wb.url]');
    assert.ok(ctx.__wb.url !== ctx.__pb && /self\.x = 1;$/.test(bsrc),
      'blob kaynakli worker yamayla birlikte kurulmali');

    applyConfig(Object.assign({}, CFG, { workerPatch: false }), true);
    run("globalThis.__wo = new Worker('/w.js');");
    assert.strictEqual(ctx.__wo.url, '/w.js', 'ayar kapaliyken gercek yapiciya birakilmali');
    applyConfig(CFG, true);
  }

  // 33. Worker'a giden yama gercekten calisiyor mu: ayri bir "worker dunyasi"
  // kurup blob'un basini orada kosturuyoruz.
  {
    run("globalThis.__w2 = new Worker('/sub/w.js');");
    const src = run('__blobs[__w2.url]');
    const wctx = vm.createContext({ console, URL, WeakMap, setTimeout });
    vm.runInContext(`
      globalThis.self = globalThis;
      globalThis.WorkerGlobalScope = function WorkerGlobalScope() {};
      Object.defineProperty(WorkerGlobalScope.prototype, 'location', {
        configurable: true, get: function () { return { href: 'blob:https://test.example/9' }; }
      });
      Object.setPrototypeOf(globalThis, WorkerGlobalScope.prototype);
      globalThis.WorkerNavigator = function WorkerNavigator() {};
      WorkerNavigator.prototype.language = 'en-US';
      WorkerNavigator.prototype.languages = ['en-US'];
      globalThis.navigator = new WorkerNavigator();
      globalThis.__imported = [];
      globalThis.importScripts = function () { __imported.push.apply(__imported, arguments); };
      globalThis.Temporal = { Now: { timeZoneId: function () { return 'Etc/Real'; } } };
    `, wctx);
    vm.runInContext(src, wctx, { filename: 'worker-blob.js' });
    const w = e => vm.runInContext(e, wctx);
    assert.strictEqual(w('new Date(Date.UTC(2026, 0, 15, 12, 0)).getTimezoneOffset()'), -180,
      'worker icinde getTimezoneOffset profil diliminde olmali');
    assert.strictEqual(w('new Date(Date.UTC(2026, 0, 15, 12, 0)).getHours()'), 15,
      'worker icinde getHours kaymali');
    assert.strictEqual(w('new Intl.DateTimeFormat().resolvedOptions().timeZone'), 'Europe/Istanbul',
      'worker icinde Intl profil dilimini vermeli');
    assert.strictEqual(w('new Intl.DateTimeFormat().resolvedOptions().locale'), 'tr-TR',
      'worker icinde Intl sahte dili vermeli');
    assert.strictEqual(w('navigator.language'), 'tr-TR', 'worker icinde navigator.language sahte olmali');
    assert.strictEqual(w('Temporal.Now.timeZoneId()'), 'Europe/Istanbul',
      'worker icinde Temporal profil dilimini vermeli');
    assert.strictEqual(w('self.location.href'), 'https://test.example/sub/w.js',
      'worker gercek adresini gostermeli, blob adresini degil');
    assert.deepStrictEqual(Array.from(w('__imported')), ['https://test.example/sub/w.js'],
      'asil betik bir kez ve mutlak adresle yuklenmeli');
    w("importScripts('yardimci.js')");
    assert.strictEqual(w('__imported[1]'), 'https://test.example/sub/yardimci.js',
      'goreli importScripts gercek adrese gore cozulmeli');
    assert.strictEqual(w('Date.prototype.getHours.toString()'),
      'function getHours() { [native code] }', 'worker icinde de toString maskeli olmali');
  }

  // 34. Konusma sesleri. Cihazdaki sesler gercek dili soyluyor; sahte dilin
  // ve Ingilizcenin sesleri kalmali, uzak sesler herkeste ayni, dokunulmamali.
  {
    applyConfig(Object.assign({}, CFG, { locale: 'de-DE' }), true);
    const names = JSON.parse(run('JSON.stringify(speechSynthesis.getVoices().map(function (v) { return v.name; }))'));
    assert.deepStrictEqual(names,
      ['Microsoft David', 'Microsoft Hedda', 'Google Deutsch', 'Google 日本語'],
      'gercek dilin cihaz sesi gizlenmeli, gelen: ' + names.join(', '));
    assert.strictEqual(
      run('speechSynthesis.getVoices().filter(function (v) { return v.default; }).map(function (v) { return v.name; }).join()'),
      'Microsoft Hedda', 'varsayilan ses sahte dile gecmeli');

    applyConfig(CFG, true); // tr-TR: gercek dil zaten bu, liste aynen donmeli
    assert.strictEqual(run('speechSynthesis.getVoices().length'), 4,
      'tr-TR icin Almanca cihaz sesi gizlenmeli, Turkce kalmali');
    assert.strictEqual(
      run("speechSynthesis.getVoices().filter(function (v) { return v.default; })[0].name"),
      'Microsoft Tolga', 'gizlenmeyen varsayilan ses degismemeli');
    assert.strictEqual(run('SpeechSynthesis.prototype.getVoices.toString()'),
      'function getVoices() { [native code] }', 'yama toString ile ele vermemeli');
  }

  // 35. navigator.globalPrivacyControl, Sec-GPC basligiyla ayni ayardan.
  {
    applyConfig(Object.assign({}, CFG, { enabled: true }), true);
    assert.strictEqual(run('navigator.globalPrivacyControl'), true, 'GPC acikken true olmali');
    applyConfig(Object.assign({}, CFG, { enabled: true, gpc: false }), true);
    assert.strictEqual(run('navigator.globalPrivacyControl'), undefined,
      'GPC kapaliyken gercek degere (burada yok) donmeli');
    applyConfig(Object.assign({}, CFG, { enabled: false }), true);
    assert.strictEqual(run('navigator.globalPrivacyControl'), undefined,
      'uzanti kapaliyken basligi yollamiyoruz, sayfa da true gormemeli');
    applyConfig(CFG, true);
  }

  // 36. Klavye duzeni. Sahte dil gercekten (en-US) farkliysa ABD duzeni;
  // ayniysa gercek duzen kalmali.
  {
    applyConfig(CFG, true); // tr-TR, gercek en-US
    assert.strictEqual(run("__trLayout.get('KeyI')"), 'i', 'farkli dilde ABD duzeni donmeli');
    assert.strictEqual(run("__trLayout.size"), 48, 'ABD duzeninin anahtar sayisi donmeli');
    assert.strictEqual(run("__trLayout instanceof KeyboardLayoutMap"), true, 'instanceof bozulmamali');
    assert.strictEqual(run("Array.from(__trLayout).length"), 48, 'yineleyici de ABD duzenini vermeli');
    applyConfig(Object.assign({}, CFG, { locale: 'en-GB' }), true);
    assert.strictEqual(run("__trLayout.get('KeyI')"), 'ı', 'ayni dilde gercek duzene dokunulmamali');
    applyConfig(CFG, true);
  }

  // 37. Cihaz ayrintilari: baglanti bilgisi ve medya cihazlari ayni ayarda.
  {
    run('globalThis.__ni = new NetworkInformation();');
    assert.strictEqual(run('__ni.rtt'), 350, 'ayar kapaliyken gercek rtt');
    applyConfig(Object.assign({}, CFG, { fpDevice: true }), true);
    assert.strictEqual(run('__ni.rtt'), 50, 'ayar acikken sabit rtt');
    assert.strictEqual(run('__ni.downlink'), 10, 'ayar acikken sabit downlink');
    const kinds = await run('new MediaDevices().enumerateDevices().then(function (l) { return l.map(function (d) { return d.kind; }).join(); })');
    assert.strictEqual(kinds, 'audioinput,videoinput', 'izinsiz sitede her turden bir cihaz kalmali');
    applyConfig(CFG, true);
    const all = await run('new MediaDevices().enumerateDevices().then(function (l) { return l.length; })');
    assert.strictEqual(all, 3, 'ayar kapaliyken liste aynen donmeli');
  }

  console.log('patch: 37 kontrol gecti');
})().catch(e => { console.error(e.message); process.exit(1); });
