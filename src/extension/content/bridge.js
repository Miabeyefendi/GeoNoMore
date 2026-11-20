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
      GNM_LOG.add('bridge', 'inject', { origin: location.origin, how: 'main' });
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
    var landed = insertScript(function (el) {
      el.src = chrome.runtime.getURL('content/fallback.js');
    });
    if (landed) {
      GNM_LOG.add('bridge', 'inject', { origin: location.origin, how: 'src' });
      return;
    }

    // Son care: satir ici. Buraya yalnizca ekleyecek bir dugum bulunamazsa
    // geliniyor.
    GNM_LOG.add('bridge', 'inject.fallback', { origin: location.origin });
    var code = '(' + gnmInjected + ')(' + gnmEngineFactory + ');';
    insertScript(function (el) { el.textContent = code; });
    GNM_LOG.add('bridge', 'inject', { origin: location.origin, how: 'inline' });
  }

  injectPatch();

  function active() {
    return !!(E && E.activeFor(cfg, location.origin));
  }

  function push(first) {
    window.postMessage({
      __gnm: 1,
      cfg: cfg,
      active: active(),
      first: !!first
    }, '*');
  }

  chrome.storage.local.get('config', function (r) {
    cfg = (r && r.config) || null;
    GNM_LOG.enable(!cfg || cfg.logging !== false);
    GNM_LOG.add('bridge', 'config.recv', {
      url: location.href,
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
    GNM_LOG.enable(!cfg || cfg.logging !== false);
    GNM_LOG.add('bridge', 'config.update', { url: location.href, active: active() });
    push(false);
  });

  function reply(id, payload) {
    window.postMessage(Object.assign({ __gnm: 4, id: id }, payload), '*');
  }

  window.addEventListener('message', function (e) {
    if (e.source !== window) return;
    var d = e.data;
    if (!d) return;

    // Yama "buradayım" diyor: ayarı (varsa) hemen yolla.
    if (d.__gnm === 0) {
      if (cfg !== undefined) push(true);
      return;
    }

    // Yamadan gelen kayıtlar. Bilinen sınır: sayfa da bu mesajı taklit edip log'a
    // sahte satır yazdırabilir. Zararı gürültü, o yüzden parti başına tavan var.
    if (d.__gnm === 2 && Array.isArray(d.log)) {
      toBackground(d.log.slice(0, MAX_RELAY));
      return;
    }

    // Konum isteği. Sayfa bunu uydurabilir; kararı burada yeniden veriyoruz.
    if (d.__gnm === 3) {
      if (active()) {
        // Sayfa "kapalıyım" diye uydurmuş olabilir. Açıksak yine sahte veriyoruz.
        reply(d.id, { pos: E.position(cfg, Date.now(), location.origin) });
        return;
      }

      GNM_LOG.add('bridge', 'geo.passthrough', { origin: location.origin });
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
