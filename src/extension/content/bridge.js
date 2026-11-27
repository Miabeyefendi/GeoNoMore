// Yalıtılmış dünya. Sayfayla aynı window'u paylaşıyor ama ayrı JS ortamında,
// yani buradaki navigator.geolocation sayfadaki yamadan etkilenmiyor. Üç işi var:
//
//   1. ayarları sayfanın dünyasındaki patch.js'e taşımak
//   2. patch.js'in log kayıtlarını arka plana iletmek
//   3. uzantı bu sayfada KAPALIYKEN gerçek konumu alıp geri vermek
//
// Üçüncüsü neden burada: patch.js sayfanın dünyasında ve orada gerçek konum
// API'sine hiç erişim bırakmıyoruz. Sayfa "kapalıyım" mesajı uydursa bile
// kararı burası veriyor, sayfanın iddiasına bakmıyoruz.

(function () {
  'use strict';

  var E = globalThis.__gnmEngine;
  var MAX_RELAY = 50;
  var cfg;   // undefined: storage'dan daha okunmadı

  // Bu pencerenin SITE adresi. about:blank ve srcdoc cercevelerinde
  // location.origin "null": site kurallari ona gore karar verince "yalniz bu
  // siteler" kipinde korunan sitenin bos cercevesi GERCEK konumu aliyordu.
  // window.origin miras alinan adresi veriyor; opak cercevelerde (sandbox,
  // data:) ust pencerenin adresine bakiliyor. injected.js'te ayni sira.
  function siteOrigin() {
    var list = [window.origin, location.origin];
    var a = location.ancestorOrigins;
    if (a) for (var i = 0; i < a.length; i++) list.push(a[i]);
    try { list.push(window.parent.location.origin); } catch (e) { /* baska kaynak */ }
    for (var j = 0; j < list.length; j++) if (list[j] && list[j] !== 'null') return list[j];
    return '';
  }
  var ORIGIN = siteOrigin();

  // Gizli pencerede hicbir sey kaydedilmiyor
  var PRIVATE = !!(chrome.extension && chrome.extension.inIncognitoContext);
  var how = null;   // yama hangi yoldan girdi; ayar gelince kaydediliyor

  // Sayfa dunyasiyla ozel kanalin adi (rastgele, sayfa basina). Yamanin
  // aciklamasi injected.js basinda: window.postMessage herkese acikti.
  var token = null;
  function newToken() {
    var s = '';
    try {
      var b = new Uint32Array(4);
      crypto.getRandomValues(b);
      for (var i = 0; i < b.length; i++) s += b[i].toString(36);
    } catch (e) { s = ''; }
    return 'g' + s + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function toPage(msg) {
    if (!token) return;
    try { window.dispatchEvent(new CustomEvent(token + 'b', { detail: JSON.stringify(msg) })); } catch (e) { /* yoksay */ }
  }

  function toBackground(entries) {
    try {
      chrome.runtime.sendMessage({ __gnmLog: entries }, function () {
        return chrome.runtime.lastError; // arka plan uykudaysa sessizce geç
      });
    } catch (e) { /* uzantı yeniden yüklenmiş olabilir */ }
  }

  GNM_LOG.via(toBackground);

  // --- sayfaya yamayı sok ---------------------------------------------------
  // document_start'ta, sayfanın kendi betiklerinden ÖNCE. Satır içi <script>
  // hemen çalışıyor; Chrome uzantı enjeksiyonunu sayfa CSP'sinden muaf tutuyor,
  // Firefox tutmuyor. O yüzden çalıştı mı diye bakıp gerekirse harici dosyayla
  // ikinci kez deniyoruz (o biraz geç kalabilir ama hiç yoktan iyidir).

  function insertScript(setup) {
    var el = document.createElement('script');
    setup(el);
    var parent = document.head || document.documentElement;
    if (!parent) return false;
    parent.insertBefore(el, parent.firstChild);
    el.remove();
    return true;
  }

  // Yama sayfa dunyasina girdi mi? Iz birakmamak icin isaret okunur okunmaz
  // siliniyor, o yuzden bir kez cagriliyor.
  function patchLanded() {
    var ok = false;
    // Once DOM isareti: iki dunyada da gorunuyor, Chrome'da tek yol bu
    try {
      var root = document.documentElement;
      if (root && root.hasAttribute('data-gnm-ok')) {
        token = root.getAttribute('data-gnm-ok') || null;   // kanal adi
        root.removeAttribute('data-gnm-ok');
        return true;
      }
    } catch (e) { /* asagidaki eski yola dus */ }
    try {
      var w = window.wrappedJSObject || window;
      ok = !!w.__gnmOK;
      // Silme AYRI deneniyor. Firefox'ta Xray sarmalayicisi uzerinden delete
      // atabiliyor; disardaki try'a birakirsak yama GIRMIS olmasina ragmen
      // false donup bosuna ikinci bir enjeksiyon yapiyorduk.
      if (ok) { try { delete w.__gnmOK; } catch (e2) { w.__gnmOK = undefined; } }
    } catch (e) { return false; }
    return ok;
  }

  function injectPatch() {
    // MAIN dunya betigi (manifest'teki ilk content_scripts girisi) zaten
    // calistiysa isimiz bitti. Bu yol sayfanin CSP'sine takilmiyor.
    if (patchLanded()) {
      how = 'main';
      return;
    }

    // MAIN calismadi. En cok about:blank ve srcdoc cercevelerinde oluyor:
    // yalitilmis betik oraya giriyor, MAIN dunya betigi girmiyor. Google Maps
    // gibi cok cerceveli sayfalarda ust cerceve MAIN ile yamalaniyor, ic
    // cerceve buraya dusuyor.
    //
    // Harici dosya SATIR ICINDEN once deneniyor. Tarayici, web_accessible_resources
    // icin uzanti kaynagini sayfanin script-src'sine kendisi ekliyor; yani bu yol
    // kati CSP'de de sessizce calisiyor. Satir ici ise 'unsafe-inline' yoksa
    // bloklaniyor ve konsola CSP hatasi dusuyor, kullanici bunu eklentinin
    // hatasi saniyor. Bedeli: harici betik zaman uyumsuz, cok az gecikebilir.
    // Kanal adini bu yolda kopru uretiyor ve betik elemaninin ozniteligiyle
    // veriyor; eleman eklenir eklenmez cikariliyor, sayfa betigi arada calismiyor.
    token = newToken();
    var landed = insertScript(function (el) {
      el.src = chrome.runtime.getURL('content/fallback.js');
      el.setAttribute('data-gnm-k', token);
    });
    if (landed) {
      how = 'src';
      return;
    }

    // Son care: satir ici. Buraya yalnizca ekleyecek bir dugum bulunamazsa
    // geliniyor.
    var code = '(' + gnmInjected + ')(' + gnmEngineFactory + ',' + JSON.stringify(token) + ');';
    insertScript(function (el) { el.textContent = code; });
    how = 'inline';
  }

  // Ayar okunana kadar kayit yok: bu sayfada kayit tutulup tutulmayacagi
  // henuz bilinmiyor
  GNM_LOG.enable(false);
  injectPatch();

  function active() {
    return !!(E && E.activeFor(cfg, ORIGIN));
  }

  // Yalniz uzantinin ACIK oldugu, gizli olmayan sayfalar kaydediliyor. Eskiden
  // her sayfanin tam adresi (sorgu ve parca dahil) kapaliyken bile yaziliyordu.
  function mayLog() {
    return !PRIVATE && !!cfg && cfg.logging !== false && active();
  }

  // Sayfa dunyasina giden ayar. BEYAZ LISTE: burada acikca yazilmayan anahtar
  // sayfaya gitmez (yeni bir ayar eklenince varsayilan olarak sizmasin).
  // Giden her sey sayfa dunyasinda calisan kod icin; ozel kanal sayfa betiklerine
  // kapali olsa da, kanal bir gun delinirse acik kalan veri en aza insin:
  //   - site listeleri, kayitli yerler, harita adresi/anahtari, dil ve tema yok
  //   - site kurali yalniz BU adrese uyan (adres olarak ana makine adiyla)
  //   - kayitli yerlerden yalniz zamanlamanin kullandiklari, adlari p0, p1...
  //   - kapaliysa ya da bu site haric tutulmussa konuma dair hicbir sey yok
  var FLAG_KEYS = ['enabled', 'gpc', 'denyWhenOff', 'maskNative', 'harden', 'workerPatch',
    'windowName', 'lowMemory', 'logging', 'logVerbose', 'localeSpoof', 'localeIntl',
    'tzDeep', 'ipGeo', 'webrtcRelay', 'watchInterval'];
  var PROFILE_KEYS = ['lat', 'lon', 'privacy', 'exact', 'zone', 'timeZone', 'locale',
    'accuracyMode', 'accuracyM', 'jitterPeriod', 'motion'];

  function pageConfig() {
    if (!cfg) return null;
    var out = {};
    var k;
    for (var i = 0; i < FLAG_KEYS.length; i++) {
      k = FLAG_KEYS[i];
      if (cfg[k] !== undefined) out[k] = cfg[k];
    }
    // Parmak izi anahtarlari (fpCanvas, fpDevice...) yalniz acik/kapali bayragi
    for (k in cfg) if (/^fp[A-Z]/.test(k) && typeof cfg[k] === 'boolean') out[k] = cfg[k];

    if (!active()) return out;

    for (var j = 0; j < PROFILE_KEYS.length; j++) {
      k = PROFILE_KEYS[j];
      if (cfg[k] !== undefined) out[k] = cfg[k];
    }

    var host = E.hostOf(ORIGIN);

    // En uzun desenli uyan kural kazaniyor (motordaki gibi); deseni ana makine
    // adiyla degistiriyoruz ki kullanicinin yazdigi desen sizmasin.
    var best = null, rules = cfg.siteProfiles || [];
    for (var r = 0; r < rules.length; r++) {
      if (!E.matches(host, rules[r].pattern)) continue;
      if (!best || String(rules[r].pattern).length > String(best.pattern).length) best = rules[r];
    }
    if (best) out.siteProfiles = [Object.assign({}, best, { pattern: host })];

    var ov = cfg.override;
    if (ov && (!ov.host || ov.host === host)) out.override = ov;

    var sch = cfg.schedule;
    if (sch && sch.on) {
      var names = Object.create(null), n = 0, presets = {}, entries = [];
      (sch.entries || []).forEach(function (e) {
        if (!e || !e.preset || !cfg.presets || !cfg.presets[e.preset]) return;
        if (!(e.preset in names)) {
          names[e.preset] = 'p' + (n++);
          presets[names[e.preset]] = cfg.presets[e.preset];
        }
        entries.push(Object.assign({}, e, { preset: names[e.preset] }));
      });
      out.schedule = { on: true, offset: sch.offset || 0, entries: entries };
      out.presets = presets;
    }
    return out;
  }

  function push(first) {
    toPage({
      __gnm: 1,
      cfg: pageConfig(),
      active: active(),
      first: !!first
    });
  }

  chrome.storage.local.get('config', function (r) {
    cfg = (r && r.config) || null;
    GNM_LOG.enable(mayLog());
    GNM_LOG.add('bridge', 'inject', { origin: ORIGIN, how: how });
    GNM_LOG.add('bridge', 'config.recv', {
      origin: ORIGIN,
      active: active(),
      enabled: !!(cfg && cfg.enabled),
      siteMode: cfg && cfg.siteMode,
      privacy: cfg && cfg.privacy,
      exact: !!(cfg && cfg.exact),
      tz: cfg && cfg.timeZone,
      motion: !!(cfg && cfg.motion && cfg.motion.on)
    });
    push(true);
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local' || !changes.config) return;
    cfg = changes.config.newValue || null;
    GNM_LOG.enable(mayLog());
    GNM_LOG.add('bridge', 'config.update', { origin: ORIGIN, active: active() });
    push(false);
  });

  function reply(id, payload) {
    toPage(Object.assign({ __gnm: 4, id: id }, payload));
  }

  // Yalniz kanal adini bilen yama konusabilir. Kanal yoksa (kok eleman yoktu)
  // hicbir sey dinlenmiyor ve yollanmiyor, yama acilis degeriyle devam ediyor.
  if (token) window.addEventListener(token + 'p', function (e) {
    var d;
    try { d = JSON.parse(e.detail); } catch (x) { return; }
    if (!d) return;

    // Yama "buradayım" diyor: ayarı (varsa) hemen yolla.
    if (d.__gnm === 0) {
      if (cfg !== undefined) push(true);
      return;
    }

    // Yamadan gelen kayıtlar. Bilinen sınır: sayfa da bu mesajı taklit edip log'a
    // sahte satır yazdırabilir. Zararı gürültü, o yüzden parti başına tavan var.
    if (d.__gnm === 2 && Array.isArray(d.log)) {
      if (mayLog()) toBackground(d.log.slice(0, MAX_RELAY));
      return;
    }

    // Konum isteği. Sayfa bunu uydurabilir; kararı burada yeniden veriyoruz.
    if (d.__gnm === 3) {
      if (active()) {
        // Sayfa "kapalıyım" diye uydurmuş olabilir. Açıksak yine sahte veriyoruz.
        reply(d.id, { pos: E.position(cfg, Date.now(), ORIGIN) });
        return;
      }

      // Adresi bilinmeyen opak cerceve ve siteye gore ayrilan bir kip: bu
      // cercevenin korunan siteye ait olup olmadigi soylenemiyor, gercek konum
      // verilmiyor
      if (!ORIGIN && cfg && cfg.enabled && (cfg.siteMode || 'all') !== 'all') {
        reply(d.id, { error: { code: 1, message: 'User denied Geolocation' } });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          reply(d.id, {
            pos: {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              altitude: pos.coords.altitude,
              altitudeAccuracy: pos.coords.altitudeAccuracy,
              heading: pos.coords.heading,
              speed: pos.coords.speed
            },
            timestamp: pos.timestamp
          });
        },
        function (err) {
          reply(d.id, { error: { code: err.code, message: err.message } });
        },
        d.options || {}
      );
    }
  }, true);
})();
