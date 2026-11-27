// Sayfanın kendi dünyasında çalışan yama. Konum, saat dilimi ve dil API'lerini
// burada değiştiriyoruz.
//
// ÖNEMLİ: bu dosya kendi başına çalışmıyor. `bridge.js` fonksiyonun kaynağını
// `gnmInjected.toString()` ile alıp sayfaya satır içi <script> olarak sokuyor.
// Önceki iki yol da tutmadı: dinamik kayıt geç kalıyordu, `world: "MAIN"` ise
// kullanıcının tarayıcısında hiç çalışmadı (log'da tek bir patch kaydı yoktu).
// Location Guard da satır içi enjeksiyon kullanıyor, tek güvenilir yol bu.
//
// Dışarıdan hiçbir değişkene bakmamalı: gömüldüğünde etrafında hiçbir şey yok.
// Motor ve kayıt tamponu bu yüzden içeride kuruluyor.

function gnmInjected(makeEngine, tokenArg) {
  'use strict';

  var E = makeEngine();

  // Bu pencerenin SITE adresi. about:blank ve srcdoc cercevelerinde
  // location.origin "null"; site kurallari ona gore karar verince korunan
  // sitenin bos cercevesi korumasiz kaliyordu. bridge.js'te ayni sira.
  var ORIGIN = (function () {
    var list = [window.origin, location.origin];
    var a = location.ancestorOrigins;
    if (a) for (var i = 0; i < a.length; i++) list.push(a[i]);
    try { list.push(window.parent.location.origin); } catch (e) { /* baska kaynak */ }
    for (var j = 0; j < list.length; j++) if (list[j] && list[j] !== 'null') return list[j];
    return '';
  })();

  // --- ozel kanal ---------------------------------------------------------
  // Yama ile kopru ESKIDEN window.postMessage('*') ile konusuyordu: sayfadaki
  // HER betik (reklam, analitik dahil) 'message' dinleyip ayarin tamamini
  // okuyabiliyor, kapaliyken bile "buradayim" diyerek ayari istetebiliyordu.
  // Simdi iki yon icin sayfa basina RASTGELE adli iki olay var (ad+'p' sayfa
  // dunyasindan koprue, ad+'b' kopruden sayfa dunyasina). Ad, sayfa betikleri
  // calismadan once el degistiriyor ve sayfa onu hic goremiyor:
  //   - MAIN dunya betigi (birincil): yama adi uretir, kok elemana gecici
  //     `data-gnm-ok` olarak koyar, kopru okur okumaz siler.
  //   - kopru betik sokarsa (yedek): adi o uretir, betik elemaninin
  //     `data-gnm-k` ozniteligiyle (harici) ya da kod argumani olarak (satir ici) verir.
  // Olay yuku JSON metni: iki dunya arasinda nesne gecisi tarayiciya gore degisiyor.
  // Yama yuklenirken pencerenin dinleme ve gonderme fonksiyonlari saklaniyor.
  var addL = window.addEventListener;
  var sendEv = window.dispatchEvent;
  var CustomEv = window.CustomEvent;
  // Sayfa sonradan JSON.parse ya da CustomEvent.prototype.detail'i degistirirse,
  // yama onlari cagirirken veriyi sayfaya vermis olurdu; asillari saklaniyor.
  // Gonderirken ic nesne prototipsiz: yoksa tarayici bubbles/composed gibi
  // alanlari Object.prototype'tan okurken sayfanin getter'i nesneyi gorur.
  // Sinir: sayfa dunyasinda calisan kod hedefli bir saldirgandan tam korunamaz,
  // bu yuzden kopru sayfaya zaten en az veriyi gonderiyor (bridge.js).
  var jParse = JSON.parse, jString = JSON.stringify, objCreate = Object.create;
  var detailDesc = CustomEv && CustomEv.prototype &&
    Object.getOwnPropertyDescriptor(CustomEv.prototype, 'detail');
  var detailGet = detailDesc && detailDesc.get;

  var CH = null, handoff = false;
  try {
    var cs = typeof document !== 'undefined' && document.currentScript;
    CH = tokenArg || (cs && cs.getAttribute && cs.getAttribute('data-gnm-k')) || null;
  } catch (e) { CH = null; }
  if (!CH) {
    handoff = true;
    var rnd = '';
    try {
      var rb = new Uint32Array(4);
      crypto.getRandomValues(rb);
      for (var ri = 0; ri < rb.length; ri++) rnd += rb[ri].toString(36);
    } catch (e) { rnd = ''; }
    // Tarayicida crypto her zaman var; sinama ortami icin yedek
    CH = 'g' + rnd + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  CH = String(CH);

  function toBridge(msg) {
    try {
      var init = objCreate(null);
      init.detail = jString(msg);
      sendEv.call(window, new CustomEv(CH + 'p', init));
    } catch (e) { /* yoksay */ }
  }

  // Sayfa dunyasinda chrome API'si yok. Kayitlar koprue ozel kanaldan gidiyor.
  var LOG = (function () {
    var buf = [], timer = 0, on = true;
    function flush() {
      timer = 0;
      if (!buf.length) return;
      var batch = buf;
      buf = [];
      toBridge({ __gnm: 2, log: batch });
    }
    return {
      enable: function (v) { on = v !== false; if (!on) buf = []; },
      flush: flush,
      add: function (s, e, d) {
        if (!on) return;
        buf.push({ t: Date.now(), s: s, e: e, d: d });
        if (buf.length >= 25) { clearTimeout(timer); flush(); }
        else if (!timer) timer = setTimeout(flush, 400);
      }
    };
  })();

  // Köprü bunu okuyup HEMEN SİLİYOR: satır içi betik gerçekten çalıştı mı,
  // yoksa sayfanın CSP'si mi engelledi, ancak böyle anlaşılıyor.
  //
  // İki önlem şart. Numaralandırmada görünmemeli, yoksa sayfa
  // Object.keys(window) diyerek uzantının varlığını okur; ve köprü okur okumaz
  // silinmeli, yoksa sayfanın window'unda kalıcı bir işaret bırakmış oluruz.
  // Sahte konum veren bir uzantının kendini ele vermesi, kendi amacını bozar.
  //
  // Isaret DOM'da: kok elemana gecici oznitelik. ESKIDEN window.__gnmOK'tu ama
  // Chrome'da kopru yalitilmis dunyada, sayfa dunyasinin degiskenini goremiyor:
  // isaret hic silinmiyor ('__gnmOK' in window uzantiyi ele veriyordu) ve kopru
  // yamayi bosuna ikinci kez yukluyordu (leak-check.js). DOM iki dunyada ortak.
  // Sayfa betigi arada calisamiyor: ikisi de document_start'ta, arka arkaya.
  // Kopru <script> ile soktuysa (currentScript dolu) isaret konmuyor, onu
  // okuyacak kimse kalmadi. Kok eleman yoksa eski yol (Firefox Xray okuyabiliyor).
  // Isaretin degeri kanal adi (yukaridaki aciklama). Yalniz MAIN yolunda konur.
  if (handoff) {
    try {
      var okRoot = typeof document !== 'undefined' && document.documentElement;
      if (okRoot) okRoot.setAttribute('data-gnm-ok', CH);
      else {
        Object.defineProperty(window, '__gnmOK', {
          value: 1, configurable: true, enumerable: false, writable: true
        });
      }
    } catch (e) { /* yoksay */ }
  }

  // "Bu pencereye yama girdi" işareti. __gnmOK silindikten sonra da gerekiyor:
  // yedek harici betik ikinci kez çalışırsa her şeyi tekrar yamalamasın.
  // Symbol, sayfa kodunun rastgele denk gelmeyeceği bir anahtar ve
  // Object.keys ile listelenmiyor.
  var GNM_MARK = typeof Symbol === 'function' ? Symbol['for']('gnm.patched') : '__gnmPatched';
  try { window[GNM_MARK] = 1; } catch (e) { /* yoksay */ }
  // Ayri isaret: "ust pencere bu cerceveyi sertlestirdi". GNM_MARK cercevenin
  // KENDI yamasi da koyuyor (Chrome'da match_origin_as_fallback ile about:blank
  // cerceveye de giriyor); ikisi tek isaretken ust pencere "zaten yapilmis"
  // sanip cikiyordu, cerceve ise ayarini beklerken gercek dilimi veriyordu.
  var GNM_HARD = typeof Symbol === 'function' ? Symbol['for']('gnm.hardened') : '__gnmHardened';

  LOG.add('patch', 'install', {
    origin: ORIGIN,
    frame: window.top !== window
  });

  // "Buradayım, ayarı yolla." Satır içi yolda köprü zaten yolluyor ama harici
  // yedek yolda yama geç yükleniyor ve ilk yollamayı kaçırıyor.
  toBridge({ __gnm: 0 });

  var RealDate = Date;
  var OrigDTF = Intl.DateTimeFormat;
  var origLanguage = navigator.language;
  var origLanguages = navigator.languages;

  // --- acilis degeri (Server-Timing) ---------------------------------------
  // Ayar kopruden ZAMAN UYUMSUZ geliyor (chrome.storage). O arada sayfanin ilk
  // betikleri gercek saat dilimini ve dili okuyordu (leak-check.js). Arka plan
  // her sayfa yanitina DNR ile `Server-Timing: gnm;desc="<dilim>|<dil>"`
  // ekliyor; burada navigasyon kaydindan eszamanli okunuyor ve YALNIZ ayar
  // gelene kadar kullaniliyor. Kalici "acik" durumu yaratmiyor: kendi gnm
  // kaydini uyduran bir sunucu ancak ilk anin sahte degerini degistirebilir.
  // Baslik sunucuya gitmiyor (yanita tarayici ekliyor); sayfa gormesin diye
  // serverTiming ve toJSON ciktisindan siliniyor (asagida).
  var BOOT_NAME = 'gnm';
  var boot = null;
  try {
    var navs = typeof performance !== 'undefined' && performance.getEntriesByType &&
      performance.getEntriesByType('navigation');
    var sts = navs && navs[0] && navs[0].serverTiming;
    if (sts) {
      for (var bi = sts.length - 1; bi >= 0; bi--) {
        if (sts[bi].name !== BOOT_NAME) continue;
        var bp = String(sts[bi].description || '').split('|');
        if (/^[A-Za-z0-9_+\-\/]{1,64}$/.test(bp[0] || '') || /^[A-Za-z0-9\-]{2,35}$/.test(bp[1] || '')) {
          boot = {
            tz: /^[A-Za-z0-9_+\-\/]{1,64}$/.test(bp[0] || '') ? bp[0] : null,
            locale: /^[A-Za-z0-9\-]{2,35}$/.test(bp[1] || '') ? bp[1] : null
          };
        }
        break;
      }
    }
  } catch (e) { boot = null; }

  // about:blank gibi cercevelerde Server-Timing yok ve ayar zaman uyumsuz:
  // sayfa `window[0]` ile ayni anda gercek dilimi okuyordu. Ayni kaynakli ust
  // pencere zaten yamali, onun verdigi deger gercekten farkliysa acilis degeri
  // o. Baska kaynakli ust pencerede erisim hata veriyor.
  if (!boot) {
    try {
      var up = window.parent;
      if (up && up !== window) {
        var upTz = up.Intl.DateTimeFormat().resolvedOptions().timeZone;
        var upLang = up.navigator.language;
        var ownTz = OrigDTF().resolvedOptions().timeZone;
        var tzDiff = upTz && upTz !== ownTz ? upTz : null;
        var langDiff = upLang && upLang !== origLanguage ? upLang : null;
        if (tzDiff || langDiff) boot = { tz: tzDiff, locale: langDiff };
      }
    } catch (e) { /* baska kaynak */ }
  }

  var cfg = null;
  var isActive = false;      // konum için: mesajı doğrudan izliyor
  var stickyActive = false;  // saat dilimi ve dil için: bkz. asimetri notu
  var pending = [];

  var seen = { tz: 0, locale: 0, worker: 0 };
  function note(kind, event, detail) {
    var limit = cfg && cfg.logVerbose ? 20 : 1;
    if (seen[kind] >= limit) return;
    seen[kind]++;
    LOG.add('patch', event, detail);
  }

  // --- köprüyle konuşma ----------------------------------------------------

  var nextReq = 1;
  var waiting = Object.create(null);

  function askBridge(options, done) {
    var id = nextReq++;
    waiting[id] = done;
    toBridge({ __gnm: 3, id: id, options: options || null });

    // Köprü cevap vermezse sayfanın çağrısı sonsuza kadar asılı kalmasın
    setTimeout(function () {
      if (!waiting[id]) return;
      delete waiting[id];
      done(null, { code: 2, message: 'GeoNoMore: bridge did not answer' });
    }, 20000);
  }

  addL.call(window, CH + 'b', function (e) {
    var d;
    try { d = jParse(detailGet ? detailGet.call(e) : e.detail); } catch (x) { return; }
    if (!d) return;

    if (d.__gnm === 4) {
      var done = waiting[d.id];
      if (!done) return;
      delete waiting[d.id];
      done(d.pos || null, d.error || null, d.timestamp);
      return;
    }

    if (d.__gnm !== 1) return;

    cfg = d.cfg || null;
    gotConfig = true;
    resolved = null;

    // Konumda mesaja doğrudan uyuyoruz: sayfa "kapalıyım" diye taklit etse bile
    // köprü kararı yeniden veriyor, taklitten bir şey kazanamıyor.
    isActive = !!d.active;

    // Saat dilimi ve dil senkron okunuyor, köprüye soramıyoruz. Orada sahte bir
    // "kapalı" mesajı gerçek saat dilimini açığa çıkarırdı; o yüzden bir kez
    // açıldıysa sayfa ömrü boyunca açık kalıyor. Gerçek kapatma yenilemede geçerli.
    if (d.active) stickyActive = true;

    // Bellek kipinde sayfa tarafında hiç kayıt tutulmuyor: tampon, metinler ve
    // postMessage trafiği her sekmede yer kaplıyor.
    LOG.enable(!cfg || (cfg.logging !== false && !cfg.lowMemory));
    LOG.add('patch', 'ready', {
      origin: ORIGIN,
      active: isActive,
      frame: window.top !== window,
      queued: pending.length
    });

    if (typeof clearWindowName === 'function') clearWindowName();
    // Ayar geldi, uzanti aciksa worker icin CSP'yi bir kez yokla
    if (typeof probeWorkers === 'function' && blobWorkers === null) probeWorkers();

    if (pending.length) {
      var q = pending;
      pending = [];
      for (var i = 0; i < q.length; i++) q[i]();
    }
  }, true);

  var gotConfig = false;
  function whenReady(fn) {
    if (gotConfig) setTimeout(fn, 0); else pending.push(fn);
  }

  var resolved = null;
  var resolvedUntil = Infinity;

  function prof() {
    var now = RealDate.now();
    if (!resolved || now >= resolvedUntil) {
      resolved = E.resolve(cfg, now, ORIGIN);
      var ov = cfg && cfg.override;
      resolvedUntil = ov && ov.until !== 'browser' && ov.expiresAt > now
        ? ov.expiresAt : Infinity;
    }
    return resolved;
  }

  // --- konum ---------------------------------------------------------------

  function wrap(p, timestamp) {
    // Bilinçli sadelik: düz nesne. instanceof GeolocationPosition kontrolü yapan siteler
    // bunu yakalar, sertleştirme sırasında gerçek prototiple sarılacak.
    return {
      coords: {
        latitude: p.latitude,
        longitude: p.longitude,
        accuracy: p.accuracy,
        altitude: p.altitude === undefined ? null : p.altitude,
        altitudeAccuracy: p.altitudeAccuracy === undefined ? null : p.altitudeAccuracy,
        heading: p.heading === undefined ? null : p.heading,
        speed: p.speed === undefined ? null : p.speed
      },
      timestamp: timestamp || RealDate.now()
    };
  }

  // Konumu üret: açıksak burada hesaplanıyor, kapalıysak köprüden isteniyor.
  function getPosition(options, ok, fail) {
    if (isActive && cfg) {
      var p = E.position(cfg, RealDate.now(), ORIGIN);
      LOG.add('patch', 'geo.fake', {
        origin: ORIGIN, lat: p.latitude, lon: p.longitude,
        acc: p.accuracy, exact: !!prof().exact
      });
      ok(wrap(p));
      return;
    }

    // "Kapaliyken gercek konumu da verme" secenegi. Sitenin gercek konumu
    // almasindansa izin reddedilmis gibi davranmasi.
    if (cfg && cfg.denyWhenOff) {
      LOG.add('patch', 'geo.denied', { origin: ORIGIN });
      if (fail) fail({ code: 1, message: 'User denied Geolocation', PERMISSION_DENIED: 1 });
      return;
    }

    askBridge(options, function (pos, err, ts) {
      if (pos) ok(wrap(pos, ts));
      else if (fail) fail(err || { code: 2, message: 'GeoNoMore: no position' });
    });
  }

  var watches = Object.create(null);
  var nextWatchId = 1;

  var geo = {
    getCurrentPosition: function (success, error, options) {
      LOG.add('patch', 'geo.get.call', {
        origin: ORIGIN,
        active: isActive,
        highAccuracy: !!(options && options.enableHighAccuracy)
      });
      if (typeof success !== 'function') return;
      whenReady(function () {
        getPosition(options, success, error);
      });
    },

    watchPosition: function (success, error, options) {
      var id = nextWatchId++;
      LOG.add('patch', 'geo.watch.start', { origin: ORIGIN, id: id });
      if (typeof success !== 'function') return id;

      whenReady(function () {
        if (watches[id] === 0) return; // biz hazır olmadan clearWatch çağrılmış
        var ticks = 0;
        var tick = function () {
          getPosition(options, function (pos) {
            ticks++;
            // Yalniz sahte konum kaydediliyor: kapaliyken gelen GERCEK konum
            if (isActive && (ticks === 1 || (cfg && cfg.logVerbose && ticks <= 20))) {
              LOG.add('patch', 'geo.watch.tick', {
                origin: ORIGIN, id: id, n: ticks,
                lat: pos.coords.latitude, lon: pos.coords.longitude
              });
            }
            try { success(pos); } catch (e) { /* sayfanın hatası */ }
          }, function (err) {
            if (typeof error === 'function') { try { error(err); } catch (e) {} }
          });
        };
        tick();
        // Hareket varken konum sürekli değişiyor, seyrek haber kopuk iz bırakır.
        var moving = isActive && cfg && cfg.motion && cfg.motion.on &&
          (cfg.motion.points || []).length > 1;
        var every = cfg && isFinite(cfg.watchInterval) ? cfg.watchInterval * 1000 : 5000;
        watches[id] = setInterval(tick, moving ? Math.min(1000, every) : every);
      });
      return id;
    },

    clearWatch: function (id) {
      LOG.add('patch', 'geo.watch.clear', { origin: ORIGIN, id: id });
      if (watches[id]) clearInterval(watches[id]);
      watches[id] = 0;
    }
  };

  var GeoProto = window.Geolocation && window.Geolocation.prototype;
  if (GeoProto) {
    ['getCurrentPosition', 'watchPosition', 'clearWatch'].forEach(function (k) {
      try {
        Object.defineProperty(GeoProto, k, {
          value: geo[k], writable: true, enumerable: true, configurable: true
        });
      } catch (e) { /* yoksay */ }
    });
  } else if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition = geo.getCurrentPosition;
    navigator.geolocation.watchPosition = geo.watchPosition;
    navigator.geolocation.clearWatch = geo.clearWatch;
  } else {
    // http gibi güvensiz kaynaklarda geolocation hiç yoktur
    try {
      Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
    } catch (e) { /* yoksay */ }
  }

  // Konum izni sorulduğunda "izin verildi" de, yoksa site izin kutusu bekler.
  // Kapalıyken dokunmuyoruz, gerçek izin durumu geçerli olsun.
  var PermProto = window.Permissions && window.Permissions.prototype;
  if (navigator.permissions && navigator.permissions.query) {
    var origQuery = navigator.permissions.query.bind(navigator.permissions);
    var patchedQuery = function (desc) {
      if (isActive && desc && desc.name === 'geolocation') {
        LOG.add('patch', 'perm.query', { origin: ORIGIN, answer: 'granted' });
        return Promise.resolve({
          name: 'geolocation',
          state: 'granted',
          onchange: null,
          addEventListener: function () {},
          removeEventListener: function () {},
          dispatchEvent: function () { return false; }
        });
      }
      return origQuery(desc);
    };

    if (PermProto) {
      try {
        Object.defineProperty(PermProto, 'query', {
          value: patchedQuery, writable: true, enumerable: true, configurable: true
        });
      } catch (e) { navigator.permissions.query = patchedQuery; }
    } else {
      navigator.permissions.query = patchedQuery;
    }
  }

  // --- saat dilimi ---------------------------------------------------------
  // Konum Türkiye, saat dilimi Almanya ise site bunu karşılaştırıp yakalar.
  // O yüzden ikisi hep aynı profilden gelir.

  function activeTz() {
    if (!cfg) return boot ? boot.tz : null;   // ayar gelene kadar acilis degeri
    if (!stickyActive) return null;
    var tz = prof().timeZone;
    if (tz) note('tz', 'tz.read', { origin: ORIGIN, tz: tz });
    return tz || null;
  }

  var dtfTz = null, dtfInst = null;
  function tzFormatter(tz) {
    if (dtfTz !== tz) {
      dtfTz = tz;
      dtfInst = new OrigDTF('en-US', {
        timeZone: tz, hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    }
    return dtfInst;
  }

  // Önbelleğin tavanı var. Sayfa rastgele zaman damgaları biçimlendirdikçe her
  // 15 dakikalık kova için yeni bir anahtar giriyordu; uzun süre açık kalan bir
  // sohbet ya da takvim binlerce kova üretiyor ve nesne sessizce büyüyor. Ölçtük:
  // içerik betiğinin sekme başına en pahalı kalemi buydu. Tavan aşılınca komple
  // atılıyor, yeniden hesabı birkaç mikrosaniye.
  var OFF_MAX = 512;
  var offCache = Object.create(null);
  var offCount = 0;

  // getTimezoneOffset ile aynı işaret: UTC'nin batısı pozitif, doğusu negatif
  function offsetAt(t, tz) {
    if (!isFinite(t)) return NaN;
    var key = tz + '|' + Math.floor(t / 900000); // 15 dakikalık kova yeter
    var v = offCache[key];
    if (v !== undefined) return v;

    var parts = tzFormatter(tz).formatToParts(new RealDate(t));
    var p = {};
    for (var i = 0; i < parts.length; i++) p[parts[i].type] = parts[i].value;
    var hour = p.hour === '24' ? 0 : +p.hour;
    var asUTC = RealDate.UTC(+p.year, +p.month - 1, +p.day, hour, +p.minute, +p.second);
    v = Math.round((Math.floor(t / 1000) * 1000 - asUTC) / 60000);
    if (!(Math.abs(v) <= 1440)) v = 0;   // milattan onceki yillar: bicim cag tasiyor
    if (offCount >= OFF_MAX) { offCache = Object.create(null); offCount = 0; }
    offCache[key] = v;
    offCount++;
    return v;
  }

  // Sarilan yapicinin yerine gecerken prototype.constructor da degismeli:
  // `new (new Intl.DateTimeFormat().constructor)()` tek satirda ASIL yapiciyi,
  // yani gercek saat dilimini ve dili veriyordu.
  function adopt(Patched, Orig) {
    Patched.prototype = Orig.prototype;
    try {
      Object.defineProperty(Orig.prototype, 'constructor', {
        value: Patched, writable: true, configurable: true
      });
    } catch (e) { /* yoksay */ }
  }

  // Intl.DateTimeFormat: saat dilimi verilmemişse profilinkini koy.
  // Böylece hem resolvedOptions().timeZone doğru döner hem de biçimlendirme
  // gerçekten o dilimde yapılır, ikisi arasında çelişki kalmaz.
  // Dil de: new Intl.DateTimeFormat().resolvedOptions().locale gercek dili
  // tek satirda veriyordu, oteki Intl yapicilari zaten sariliydi.
  function PatchedDTF(locales, options) {
    var opts = Object.assign({}, options);
    var tz = activeTz();
    if (tz && !opts.timeZone) opts.timeZone = tz;
    return new OrigDTF(localeArg(locales), opts);
  }
  adopt(PatchedDTF, OrigDTF);
  PatchedDTF.supportedLocalesOf = OrigDTF.supportedLocalesOf.bind(OrigDTF);
  Intl.DateTimeFormat = PatchedDTF;

  var origOffset = RealDate.prototype.getTimezoneOffset;
  RealDate.prototype.getTimezoneOffset = function () {
    var tz = activeTz();
    if (!tz) return origOffset.call(this);
    var o = offsetAt(this.getTime(), tz);
    return isFinite(o) ? o : origOffset.call(this);
  };

  // Yerel saat okuyan getter'lar. Bunlar sistem dilimini kullanıyor; profildeki
  // dilime kaydırılmazsa site new Date().getHours() ile Intl çıktısını
  // karşılaştırıp uyumsuzluğu görür.
  var LOCAL_TO_UTC = {
    getFullYear: 'getUTCFullYear',
    getMonth: 'getUTCMonth',
    getDate: 'getUTCDate',
    getDay: 'getUTCDay',
    getHours: 'getUTCHours',
    getMinutes: 'getUTCMinutes',
    getSeconds: 'getUTCSeconds',
    getMilliseconds: 'getUTCMilliseconds'
  };

  Object.keys(LOCAL_TO_UTC).forEach(function (local) {
    var utc = LOCAL_TO_UTC[local];
    var orig = RealDate.prototype[local];
    RealDate.prototype[local] = function () {
      var tz = activeTz();
      if (!tz) return orig.call(this);
      var t = this.getTime();
      var o = offsetAt(t, tz);
      if (!isFinite(o)) return orig.call(this);
      return new RealDate(t - o * 60000)[utc]();
    };
  });

  // Date'in metin üreten yolları. Yukarıdaki getter'lar profil dilimine kayıyor
  // ama toString ve toLocaleString motorun kendi diliminden geçiyordu:
  // getHours() 14 derken toString() "11:03:00 GMT+0000" yazıyordu. Çelişkinin
  // kendisi imza. Metni elle kuruyoruz çünkü motorun biçimine dışarıdan saat
  // dilimi geçirilemiyor.

  var DAY3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
    'Oct', 'Nov', 'Dec'];

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // Derin saat dilimi: metin yolları ve lastModified. Ayrı düğmesi var çünkü
  // burada motorun çıktısını taklit ediyoruz, bir sitede biçim beklentisi
  // tutmazsa kullanıcının kapatabileceği bir yer olsun.
  function deepTz() {
    return cfg && cfg.tzDeep === false ? null : activeTz();
  }

  // getTimezoneOffset ile aynı işaret, GMT etiketinde ters çevriliyor
  function gmtLabel(off) {
    var abs = Math.abs(off);
    return 'GMT' + (off > 0 ? '-' : '+') + pad2(Math.floor(abs / 60)) + pad2(abs % 60);
  }

  var zoneNameTz = null, zoneNameFmt = null;
  function zoneName(t, tz) {
    try {
      if (zoneNameTz !== tz) {
        zoneNameTz = tz;
        zoneNameFmt = new OrigDTF('en-US', { timeZone: tz, timeZoneName: 'long' });
      }
      var parts = zoneNameFmt.formatToParts(new RealDate(t));
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === 'timeZoneName') return parts[i].value;
      }
    } catch (e) { /* yoksay */ }
    return tz;
  }

  // Aşağıdaki getter'lar zaten yamalı, çağırmak yeterli: kayma bir kez yapılıyor
  function datePart(d) {
    return DAY3[d.getDay()] + ' ' + MON3[d.getMonth()] + ' ' +
      pad2(d.getDate()) + ' ' + d.getFullYear();
  }

  function timePart(d, tz) {
    var off = offsetAt(d.getTime(), tz);
    if (!isFinite(off)) off = 0;
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()) +
      ' ' + gmtLabel(off) + ' (' + zoneName(d.getTime(), tz) + ')';
  }

  var origDateToString = RealDate.prototype.toString;
  var origDateToDate = RealDate.prototype.toDateString;
  var origDateToTime = RealDate.prototype.toTimeString;

  RealDate.prototype.toString = function () {
    var tz = deepTz();
    if (!tz || !isFinite(this.getTime())) return origDateToString.call(this);
    return datePart(this) + ' ' + timePart(this, tz);
  };

  RealDate.prototype.toDateString = function () {
    var tz = deepTz();
    if (!tz || !isFinite(this.getTime())) return origDateToDate.call(this);
    return datePart(this);
  };

  RealDate.prototype.toTimeString = function () {
    var tz = deepTz();
    if (!tz || !isFinite(this.getTime())) return origDateToTime.call(this);
    return timePart(this, tz);
  };

  // toLocale* zaten dilimi seçenek olarak kabul ediyor, elle kurmaya gerek yok
  ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString'].forEach(function (name) {
    var orig = RealDate.prototype[name];
    RealDate.prototype[name] = function (locales, options) {
      var tz = deepTz();
      if (!tz) return orig.call(this, locales, options);
      var opts = Object.assign({}, options);
      if (!opts.timeZone) opts.timeZone = tz;
      return orig.call(this, localeArg(locales), opts);
    };
  });

  // document.lastModified yerel saat diliminde bir metin. Sunucu Last-Modified
  // göndermeyen sayfalarda "şu an" oluyor, yani her yüklemede gerçek dilimi
  // söylüyor. Motorun ürettiği metni epoch'a çevirip profil diliminde yeniden
  // yazıyoruz; biçim ECMAScript'in MM/DD/YYYY hh:mm:ss biçimi.
  try {
    var DocProto = window.Document && window.Document.prototype;
    var lmDesc = DocProto && Object.getOwnPropertyDescriptor(DocProto, 'lastModified');
    if (lmDesc && lmDesc.get) {
      var origLastModified = lmDesc.get;
      Object.defineProperty(DocProto, 'lastModified', {
        configurable: true,
        enumerable: lmDesc.enumerable,
        get: function () {
          var raw = origLastModified.call(this);
          var tz = deepTz();
          if (!tz) return raw;
          var t = RealDate.parse(raw);
          if (!isFinite(t)) return raw;
          var o = offsetAt(t, tz);
          if (!isFinite(o)) return raw;
          var d = new RealDate(t - o * 60000);
          return pad2(d.getUTCMonth() + 1) + '/' + pad2(d.getUTCDate()) + '/' +
            d.getUTCFullYear() + ' ' + pad2(d.getUTCHours()) + ':' +
            pad2(d.getUTCMinutes()) + ':' + pad2(d.getUTCSeconds());
        }
      });
    }
  } catch (e) { /* yeniden tanımlanamıyorsa vazgeç */ }

  // --- dil -----------------------------------------------------------------

  function activeLocale() {
    if (!cfg) return boot ? boot.locale : null;   // ayar gelene kadar acilis degeri
    if (!stickyActive || cfg.localeSpoof === false) return null;
    var l = prof().locale || null;
    if (l) note('locale', 'locale.read', { origin: ORIGIN, locale: l });
    return l;
  }

  var langDesc = {
    configurable: true,
    enumerable: true,
    get: function () { return activeLocale() || origLanguage; }
  };

  var langsDesc = {
    configurable: true,
    enumerable: true,
    get: function () {
      var l = activeLocale();
      if (!l) return origLanguages;
      var base = l.split('-')[0];
      return Object.freeze(base === l ? [l] : [l, base]);
    }
  };

  // Ornek yerine prototip: navigator uzerinde fazladan ozellik gorunmuyor ve
  // sayfa "delete navigator.language" ile gercege donemiyor.
  var NavProto = window.Navigator && window.Navigator.prototype;
  try {
    Object.defineProperty(NavProto || navigator, 'language', langDesc);
    Object.defineProperty(NavProto || navigator, 'languages', langsDesc);
  } catch (e) { /* bazı tarayıcılarda yeniden tanımlanamıyor, vazgeç */ }

  // Intl'in tamamı. Sadece DateTimeFormat'ı sarmak yetmiyor: sayfa
  // new Intl.NumberFormat().resolvedOptions().locale yazınca gerçek dili tek
  // satırda öğreniyordu. Aynı şey Collator, PluralRules ve kardeşleri için de
  // geçerli. Hepsinde yaptığımız iş aynı: dil verilmemişse profilinkini koy.
  //
  // Ayrı düğmesi var. Para ve sayı biçimi tek başına kimseyi ele vermiyor;
  // biçime dokunmak istemeyen kullanıcı kapatabilsin.

  function localeArg(locales) {
    if (cfg ? cfg.localeIntl === false : !boot) return locales;
    var l = activeLocale();
    if (!l) return locales;
    if (locales === undefined) return l;
    if (Array.isArray(locales) && locales.length === 0) return l;
    return locales;
  }

  function wrapIntl(G, name) {
    var Orig = G.Intl && G.Intl[name];
    if (typeof Orig !== 'function') return;

    // new'siz de çağrılabiliyor (NumberFormat), sınıf olanlar new istiyor.
    // İçeride hep new kullanmak ikisini de karşılıyor: yapıcı nesne döndürünce
    // new de o nesneyi veriyor.
    function Patched(locales, options) {
      return new Orig(localeArg(locales), options);
    }
    adopt(Patched, Orig);
    if (Orig.supportedLocalesOf) {
      Patched.supportedLocalesOf = Orig.supportedLocalesOf.bind(Orig);
    }
    try { Object.defineProperty(Patched, 'name', { value: name, configurable: true }); }
    catch (e) { /* yoksay */ }

    G.Intl[name] = Patched;
  }

  var INTL_NAMES = ['NumberFormat', 'Collator', 'PluralRules', 'RelativeTimeFormat', 'ListFormat',
    'DisplayNames', 'Segmenter', 'DurationFormat'];
  INTL_NAMES.forEach(function (n) { wrapIntl(window, n); });

  // Aynı sızıntının Intl dışındaki kapıları. toLocaleUpperCase/LowerCase de
  // sistem dilini kullaniyor: 'i' Turkce'de 'İ' oluyor.
  function wrapLocaleMethods(G, mark) {
    [['Number', 'toLocaleString'], ['BigInt', 'toLocaleString'], ['String', 'localeCompare'],
      ['String', 'toLocaleUpperCase'], ['String', 'toLocaleLowerCase']].forEach(function (pair) {
      var Ctor = G[pair[0]], name = pair[1];
      if (!Ctor || !Ctor.prototype || typeof Ctor.prototype[name] !== 'function') return;
      var orig = Ctor.prototype[name];
      var made = name === 'localeCompare'
        ? function (that, locales, options) { return orig.call(this, that, localeArg(locales), options); }
        : name === 'toLocaleString'
          ? function (locales, options) { return orig.call(this, localeArg(locales), options); }
          : function () { return orig.call(this, localeArg(arguments[0])); };
      Ctor.prototype[name] = made;
      if (mark) mark(made, name);
    });
  }
  wrapLocaleMethods(window);

  // --- WebRTC ---------------------------------------------------------------
  // Arka plan tarayıcı tercihini kuruyor ve o tercih hiçbir siteyi bozmuyor;
  // varsayılan koruma odur. Buradaki relay zorlaması ikinci kademe: yerel ağ
  // adayı hiç üretilmiyor, ama TURN sunucusu olmayan bir görüşme de hiç
  // kurulamıyor. O yüzden kendi düğmesinde ve varsayılan kapalı.

  function wrapRTC(G, name, mark) {
    var Orig = G[name];
    if (typeof Orig !== 'function') return;
    // Chrome'da webkitRTCPeerConnection AYNI nesne: ikinci kez sarmak
    // constructor'i ikinci sarmalayiciya cevirirdi
    if (name !== 'RTCPeerConnection' && G.RTCPeerConnection &&
        G.RTCPeerConnection.prototype === Orig.prototype) {
      G[name] = G.RTCPeerConnection;
      return;
    }
    function PatchedRTC(config, constraints) {
      if (isActive && cfg && cfg.webrtcRelay) {
        config = Object.assign({}, config);
        config.iceTransportPolicy = 'relay';
      }
      return new Orig(config, constraints);
    }
    adopt(PatchedRTC, Orig);
    if (typeof Orig.generateCertificate === 'function') {
      PatchedRTC.generateCertificate = Orig.generateCertificate.bind(Orig);
    }
    try { Object.defineProperty(PatchedRTC, 'name', { value: name, configurable: true }); }
    catch (e) { /* yoksay */ }
    G[name] = PatchedRTC;
    if (mark) mark(PatchedRTC, name);
  }
  ['RTCPeerConnection', 'webkitRTCPeerConnection'].forEach(function (n) { wrapRTC(window, n); });

  // --- IP tabanlı konum servisleri -----------------------------------------
  // Uzantı IP'yi DEĞİŞTİREMEZ; sunucu gerçek IP'yi ağ katmanında görür. Ama
  // IP-geo kontrollerinin çoğu sayfanın kendi JS'inde yapılıyor: bilinen bir
  // servise istek atılıp dönen JSON'daki ülkeye bakılıyor. Onu burada
  // yakalayıp profile uygun cevap veriyoruz.
  //
  // Sunucusunda IP'ye bakan siteyi (banka, bahis, yayın) bu AŞMAZ.

  var IPGEO = /(^|\.)(ipapi\.co|ip-api\.com|ipinfo\.io|geolocation-db\.com|ipwho\.is|ipwhois\.app|freeipapi\.com|ipgeolocation\.io|geoplugin\.net|ipbase\.com|db-ip\.com)$/i;

  function ipGeoOn() {
    return isActive && cfg && cfg.ipGeo !== false;
  }

  function ipGeoTarget(url) {
    try {
      var u = new URL(String(url), location.href);
      if (u.hostname === 'www.cloudflare.com' || u.hostname === 'cloudflare.com') {
        return u.pathname.indexOf('/cdn-cgi/trace') === 0 ? 'trace' : null;
      }
      if (u.pathname.indexOf('/cdn-cgi/trace') === 0) return 'trace';
      return IPGEO.test(u.hostname) ? 'json' : null;
    } catch (e) {
      return null;
    }
  }

  // Servisler farklı alan adları kullanıyor. Hepsinin üstünü birden dolduruyoruz;
  // hangi anahtarı okurlarsa okusun tutarlı cevap alsınlar.
  function ipGeoBody(kind) {
    var p = E.position(cfg, RealDate.now(), ORIGIN);
    var prf = prof();
    var cc = (prf.locale || 'en-US').split('-')[1] || 'US';
    var lang = (prf.locale || 'en-US').split('-')[0];

    var NL = String.fromCharCode(10);
    if (kind === 'trace') {
      return 'fl=0x0' + NL + 'loc=' + cc + NL + 'tz=' + (prf.timeZone || 'UTC') + NL;
    }

    return JSON.stringify({
      ip: '0.0.0.0',
      country: cc, country_code: cc, countryCode: cc, country_code2: cc,
      country_name: cc, countryName: cc,
      region: '', region_name: '', regionName: '', state_prov: '',
      city: '', zip: '', postal: '',
      latitude: p.latitude, longitude: p.longitude,
      lat: p.latitude, lon: p.longitude, lng: p.longitude,
      timezone: prf.timeZone, time_zone: prf.timeZone,
      languages: prf.locale, language: lang,
      success: true, status: 'success'
    });
  }

  var origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (input, init) {
      var url = input && input.url ? input.url : input;
      var kind = ipGeoOn() ? ipGeoTarget(url) : null;
      if (!kind) return origFetch.apply(this, arguments);

      LOG.add('patch', 'ipgeo.fetch', { origin: ORIGIN });
      var body = ipGeoBody(kind);
      return Promise.resolve(new Response(body, {
        status: 200,
        headers: { 'Content-Type': kind === 'trace' ? 'text/plain' : 'application/json' }
      }));
    };
  }

  var XHR = window.XMLHttpRequest;
  if (typeof XHR === 'function') {
    var origOpen = XHR.prototype.open;
    var origSend = XHR.prototype.send;

    XHR.prototype.open = function (method, url) {
      this.__gnmKind = ipGeoOn() ? ipGeoTarget(url) : null;
      return origOpen.apply(this, arguments);
    };

    XHR.prototype.send = function () {
      var xhr = this;
      if (!xhr.__gnmKind) return origSend.apply(this, arguments);

      LOG.add('patch', 'ipgeo.xhr', { origin: ORIGIN });
      var body = ipGeoBody(xhr.__gnmKind);
      setTimeout(function () {
        try {
          Object.defineProperty(xhr, 'readyState', { value: 4, configurable: true });
          Object.defineProperty(xhr, 'status', { value: 200, configurable: true });
          Object.defineProperty(xhr, 'responseText', { value: body, configurable: true });
          Object.defineProperty(xhr, 'response', { value: body, configurable: true });
          if (typeof xhr.onreadystatechange === 'function') xhr.onreadystatechange();
          xhr.dispatchEvent(new Event('readystatechange'));
          xhr.dispatchEvent(new Event('load'));
          xhr.dispatchEvent(new Event('loadend'));
        } catch (e) { /* sayfanın hatası */ }
      }, 0);
    };
  }

  // --- sertleştirme --------------------------------------------------------
  // Yamaladığımız fonksiyonun toString() çıktısı "[native code]" görünmezse
  // sıradan bir kontrol bile bizi yakalıyor. Değiştirdiklerimizi bir tabloda
  // tutup toString'i de yamalıyoruz.
  //
  // Bilinen sınır: ciddi anti-fraud (banka, bahis) yine yakalayabilir. Bu, ucuz
  // kontrolleri kapatır; kusursuz gizlenme sözü vermiyoruz.

  var faked = new WeakMap();
  function pretendNative(fn, name) {
    if (typeof fn === 'function') faked.set(fn, name);
    return fn;
  }

  if (navigator.geolocation) {
    pretendNative(navigator.geolocation.getCurrentPosition, 'getCurrentPosition');
    pretendNative(navigator.geolocation.watchPosition, 'watchPosition');
    pretendNative(navigator.geolocation.clearWatch, 'clearWatch');
  }
  pretendNative(navigator.permissions && navigator.permissions.query, 'query');
  pretendNative(Intl.DateTimeFormat, 'DateTimeFormat');
  pretendNative(RealDate.prototype.getTimezoneOffset, 'getTimezoneOffset');
  Object.keys(LOCAL_TO_UTC).forEach(function (k) {
    pretendNative(RealDate.prototype[k], k);
  });
  ['toString', 'toDateString', 'toTimeString', 'toLocaleString',
    'toLocaleDateString', 'toLocaleTimeString'].forEach(function (k) {
    pretendNative(RealDate.prototype[k], k);
  });
  ['NumberFormat', 'Collator', 'PluralRules', 'RelativeTimeFormat', 'ListFormat',
    'DisplayNames', 'Segmenter', 'DurationFormat'].forEach(function (k) {
    pretendNative(Intl[k], k);
  });
  ['RTCPeerConnection', 'webkitRTCPeerConnection'].forEach(function (k) {
    pretendNative(window[k], k);
  });
  pretendNative(Number.prototype.toLocaleString, 'toLocaleString');
  if (window.BigInt) pretendNative(BigInt.prototype.toLocaleString, 'toLocaleString');
  pretendNative(String.prototype.localeCompare, 'localeCompare');
  pretendNative(String.prototype.toLocaleUpperCase, 'toLocaleUpperCase');
  pretendNative(String.prototype.toLocaleLowerCase, 'toLocaleLowerCase');
  try {
    pretendNative(Object.getOwnPropertyDescriptor(
      window.Document.prototype, 'lastModified').get, 'lastModified');
  } catch (e) { /* yamalanamamis */ }
  if (CanvasProto) {
    pretendNative(CanvasProto.toDataURL, 'toDataURL');
    pretendNative(CanvasProto.toBlob, 'toBlob');
  }
  if (Ctx2D) {
    pretendNative(Ctx2D.getImageData, 'getImageData');
    pretendNative(Ctx2D.measureText, 'measureText');
  }
  if (window.Element) {
    pretendNative(window.Element.prototype.getBoundingClientRect, 'getBoundingClientRect');
  }
  pretendNative(window.fetch, 'fetch');
  if (typeof XHR === 'function') {
    pretendNative(XHR.prototype.open, 'open');
    pretendNative(XHR.prototype.send, 'send');
  }

  var origToString = Function.prototype.toString;
  Function.prototype.toString = function () {
    var name = cfg && cfg.maskNative === false ? null : faked.get(this);
    if (name) return 'function ' + name + '() { [native code] }';
    return origToString.call(this);
  };
  pretendNative(Function.prototype.toString, 'toString');

  // --- Temporal -------------------------------------------------------------
  // Chrome 144 ve Firefox 139'dan beri var. Temporal.Now.timeZoneId() sistem
  // dilimini tek satirda veriyordu; Date ve Intl ne kadar tutarli olursa olsun
  // buradan gercek dilim okunuyordu. Bu dosyanin sonundaki gnmPatchTemporal
  // sayfa ve worker icin ayni.
  gnmPatchTemporal(window.Temporal, activeTz, deepTz, localeArg, pretendNative);

  // --- Date yapicisi --------------------------------------------------------
  // Getter ve metin yollari yukarida; Date(), new Date(yil, ay, gun),
  // Date.parse ve setHours ailesi hala sistem dilimiyle calisiyordu.
  gnmPatchDate(window, activeTz, offsetAt, origOffset, pretendNative);

  // --- GPC ------------------------------------------------------------------
  // Arka plan Sec-GPC: 1 başlığını yolluyor; sayfa navigator.globalPrivacyControl
  // ile de soruyor. İkisi çelişmesin: aynı ayar, aynı açık/kapalı. Firefox'ta
  // özellik zaten var, Chrome'da yok; GPC destekleyen tarayıcılar (Firefox,
  // Brave) onu gösterdiği için eklemek bizi ayırmıyor. Ayar gelmeden ya da
  // kapalıyken gerçek değer.
  var origGpc = NavProto && Object.getOwnPropertyDescriptor(NavProto, 'globalPrivacyControl');
  var gpcGet = function () {
    if (cfg && cfg.enabled && cfg.gpc !== false) return true;
    return origGpc && origGpc.get ? origGpc.get.call(this) : undefined;
  };
  function patchGpc(win) {
    var np = win.Navigator && win.Navigator.prototype;
    if (!np) return;
    try {
      Object.defineProperty(np, 'globalPrivacyControl', {
        configurable: true, enumerable: true, get: gpcGet
      });
    } catch (e) { /* yoksay */ }
  }
  patchGpc(window);
  pretendNative(gpcGet, 'get globalPrivacyControl');

  // Acilis kaydini (Server-Timing gnm) sayfadan gizle: serverTiming dizisinden
  // ve toJSON ciktisindan cikar. Navigasyon kaydi PerformanceResourceTiming'den
  // turuyor, getter orada. Kayit yoksa da kuruluyor: sayfa yalniz uzantiyla
  // degisen bir prototip goremesin diye davranis her durumda ayni.
  // Cercevelere de uygulaniyor (hardenFrame): yoksa sayfa bos bir iframe'in el
  // degmemis getter'ini ana penceredeki kayit uzerinde cagirip gizlemeyi atlatir.
  function hideBoot(win) {
    var RT = win.PerformanceResourceTiming && win.PerformanceResourceTiming.prototype;
    if (!RT) return;
    var keep = function (e) { return !e || e.name !== BOOT_NAME; };
    var st = Object.getOwnPropertyDescriptor(RT, 'serverTiming');
    if (st && st.get) {
      var stGet = function () {
        var v = st.get.call(this);
        return Array.isArray(v) ? v.filter(keep) : v;
      };
      try { Object.defineProperty(RT, 'serverTiming', { configurable: true, enumerable: st.enumerable, get: stGet }); }
      catch (e) { /* yoksay */ }
      pretendNative(stGet, 'get serverTiming');
    }
    [RT, win.PerformanceNavigationTiming && win.PerformanceNavigationTiming.prototype].forEach(function (P) {
      if (!P || !Object.prototype.hasOwnProperty.call(P, 'toJSON')) return;
      var orig = P.toJSON;
      var toJSON = function toJSON() {
        var o = orig.call(this);
        if (o && Array.isArray(o.serverTiming)) o.serverTiming = o.serverTiming.filter(keep);
        return o;
      };
      try { P.toJSON = toJSON; } catch (e) { /* yoksay */ }
      pretendNative(toJSON, 'toJSON');
    });
  }
  hideBoot(window);

  // --- konuşma sesleri --------------------------------------------------------
  // speechSynthesis.getVoices() sistemde kurulu sesleri listeliyor. Türkçe
  // Windows'ta "Microsoft Tolga - Turkish" var; dil de saat dilimi de sahte
  // olsa bu liste gerçek dili söylüyor, varsayılan ses de o.
  //
  // Ne yapıyoruz: CİHAZDAKİ (localService) seslerden yalnız sahte dilin ve
  // İngilizcenin seslerini bırakıyoruz. Çoğu sistemde İngilizce ses de kurulu,
  // tek başına kimseyi ayırmıyor. Uzak sesler (Chrome'un Google sesleri)
  // herkeste aynı liste, dokunulmuyor. Varsayılan ses gizlenen bir sesse,
  // bayrak kalanlardan sahte dile uyana geçiyor. Hiçbir ses kalmayacaksa
  // liste olduğu gibi dönüyor: boş liste konuşan bir uygulamayı bozar.
  var SynthProto = window.SpeechSynthesis && window.SpeechSynthesis.prototype;
  var VoiceProto = window.SpeechSynthesisVoice && window.SpeechSynthesisVoice.prototype;
  var origGetVoices = SynthProto && SynthProto.getVoices;
  var voiceDefDesc = VoiceProto && Object.getOwnPropertyDescriptor(VoiceProto, 'default');
  var chosenVoice = null;   // gizleme yapıldıysa varsayılan sayılacak ses

  function voiceBase(v) {
    return String(v && v.lang || '').split(/[-_]/)[0].toLowerCase();
  }

  var patchedGetVoices = typeof origGetVoices !== 'function' ? null : function getVoices() {
    var list = origGetVoices.call(this);
    var l = activeLocale();
    chosenVoice = null;
    if (!l || !list || !list.length) return list;
    var want = l.split('-')[0].toLowerCase();
    var keep = [];
    for (var i = 0; i < list.length; i++) {
      var v = list[i], b = voiceBase(v);
      if (!v.localService || b === want || b === 'en') keep.push(v);
    }
    if (!keep.length || keep.length === list.length) return list;

    var realDefault = null;
    for (var j = 0; j < list.length; j++) {
      if (voiceDefDesc && voiceDefDesc.get.call(list[j])) { realDefault = list[j]; break; }
    }
    if (realDefault && keep.indexOf(realDefault) === -1) {
      var pick = null;
      for (var k = 0; k < keep.length && !pick; k++) {
        if (keep[k].localService && voiceBase(keep[k]) === want) pick = keep[k];
      }
      for (k = 0; k < keep.length && !pick; k++) if (keep[k].localService) pick = keep[k];
      chosenVoice = pick || keep[0];
    }
    note('locale', 'voices.filter', { origin: ORIGIN, before: list.length, after: keep.length });
    return keep;
  };

  var voiceDefaultGet = voiceDefDesc && voiceDefDesc.get ? function () {
    var real = voiceDefDesc.get.call(this);
    if (!chosenVoice || !activeLocale()) return real;
    return this === chosenVoice;
  } : null;

  function patchVoices(win) {
    var sp = win.SpeechSynthesis && win.SpeechSynthesis.prototype;
    var vp = win.SpeechSynthesisVoice && win.SpeechSynthesisVoice.prototype;
    if (sp && patchedGetVoices) sp.getVoices = patchedGetVoices;
    if (vp && voiceDefaultGet) {
      try {
        Object.defineProperty(vp, 'default', {
          configurable: true, enumerable: voiceDefDesc.enumerable, get: voiceDefaultGet
        });
      } catch (e) { /* yoksay */ }
    }
  }
  patchVoices(window);
  pretendNative(patchedGetVoices, 'getVoices');
  pretendNative(voiceDefaultGet, 'get default');

  // --- worker ---------------------------------------------------------------
  // Worker ayri bir dunya: Date, Intl, Temporal ve navigator.language orada
  // el degmemis. Sayfa new Worker() dediginde araya giriyoruz: worker'in kendi
  // betiginden once yamayi calistiran bir blob kuruyor, gercek betigi onun
  // icinden yukluyoruz (klasikte importScripts, modulde import).
  //
  // Ne zaman YAPMIYORUZ, gercek yapiciya birakiyoruz:
  //   - ayar kapali, uzanti kapali ya da sahte dilim/dil yok
  //   - sayfanin CSP'si blob: worker'a izin vermiyor (deneme worker'i ile
  //     olculuyor; sonuc gelene kadar da yapmiyoruz, kirmaktansa sizdir)
  //   - baska kaynakli adres (gercek yapici zaten reddediyor)
  // data: worker yine data: olarak kuruluyor (blob'a cevirmek ona sayfanin
  // kaynagini verirdi), yama metnin basina ekleniyor. Worker'in kendi actigi
  // worker'lar da ayni yoldan geciyor.
  //   - Trusted Types blob adresini reddederse
  // SharedWorker ve ServiceWorker kapsam disi: blob adresi her sekmede farkli
  // oldugu icin SharedWorker paylasilmaz olurdu, ServiceWorker blob kabul etmiyor.

  var RealBlob = window.Blob;
  var RealURL = window.URL;
  var OrigWorker = window.Worker;
  var blobWorkers = null;  // null: denenmedi, true/false: CSP sonucu
  var probing = false;

  function blobUrl(src) {
    return RealURL.createObjectURL(new RealBlob([src], { type: 'text/javascript' }));
  }
  function forget(u) {
    setTimeout(function () { try { RealURL.revokeObjectURL(u); } catch (e) { /* yoksay */ } }, 30000);
  }

  function workerWanted() {
    return !!(cfg && cfg.workerPatch !== false && stickyActive && (activeTz() || activeLocale()));
  }

  function probeWorkers() {
    if (blobWorkers !== null || probing || !workerWanted()) return;
    if (typeof OrigWorker !== 'function' || typeof RealBlob !== 'function' ||
      !RealURL || !RealURL.createObjectURL) return;
    probing = true;
    var u = null, w = null, settled = false;
    var done = function (ok, why) {
      if (settled) return;
      settled = true;
      blobWorkers = ok;
      try { if (w) w.terminate(); } catch (e) { /* yoksay */ }
      try { if (u) RealURL.revokeObjectURL(u); } catch (e) { /* yoksay */ }
      LOG.add('patch', 'worker.probe', { origin: ORIGIN, ok: ok, why: why || null });
    };
    try {
      u = blobUrl('postMessage(1)');
      w = new OrigWorker(u);
      w.onmessage = function () { done(true); };
      w.onerror = function (e) { if (e && e.preventDefault) e.preventDefault(); done(false, 'error'); };
      setTimeout(function () { done(false, 'timeout'); }, 3000);
    } catch (e) {
      done(false, String(e && e.name || e));
    }
  }

  // blob: kaynagini yapici donmeden okumak zorundayiz: sayfa cogu zaman
  // new Worker(u) der demez URL.revokeObjectURL(u) cagiriyor.
  function readSync(href) {
    try {
      var x = new XHR();
      x.open('GET', href, false);
      x.send();
      return x.status === 200 || x.status === 0 ? x.responseText : null;
    } catch (e) {
      return null;
    }
  }

  function workerScript(win, url, options) {
    if (!workerWanted()) return null;
    var href;
    try { href = new RealURL(String(url), win.location.href).href; } catch (e) { return null; }
    return gnmWorkerSource({
      origin: win.origin && win.origin !== 'null' ? win.origin : win.location.origin,
      blobs: blobWorkers === true,   // sayfanin CSP'si blob worker'a izin veriyor mu
      make: blobUrl,
      forget: forget,
      read: readSync
    }, href, !!(options && options.type === 'module'), {
      tz: activeTz(),
      locale: activeLocale(),
      intl: cfg.localeIntl !== false,
      deep: cfg.tzDeep !== false,
      mask: cfg.maskNative !== false,
      origin: ORIGIN
    });
  }

  function wrapWorker(win) {
    var Orig = win.Worker;
    if (typeof Orig !== 'function' || typeof Reflect === 'undefined') return;

    var W = function Worker(url) {
      if (!new.target) return Orig.apply(this, arguments); // gercegi gibi TypeError atsin
      var args = Array.prototype.slice.call(arguments);
      var src = null;
      try { src = args.length ? workerScript(win, args[0], args[1]) : null; } catch (e) { src = null; }
      if (src) {
        try {
          var w = Reflect.construct(Orig, [src].concat(args.slice(1)), new.target);
          forget(src);
          note('worker', 'worker.wrap', {
            origin: ORIGIN,
            module: !!(args[1] && args[1].type === 'module')
          });
          return w;
        } catch (e) {
          try { RealURL.revokeObjectURL(src); } catch (e2) { /* yoksay */ }
          LOG.add('patch', 'worker.error', { message: String(e && e.message || e) });
        }
      }
      return Reflect.construct(Orig, args, new.target);
    };
    adopt(W, Orig);
    try { Object.defineProperty(W, 'length', { value: 1 }); } catch (e) { /* yoksay */ }
    win.Worker = W;
    pretendNative(W, 'Worker');
  }

  try { wrapWorker(window); } catch (e) { LOG.add('patch', 'worker.error', { message: String(e) }); }

  // --- parmak izi -----------------------------------------------------------
  //
  // Buradaki her şey VARSAYILAN KAPALI ve öyle kalmalı. Sebebi ters gelebilir:
  // gürültü eklemek her zaman gizlemek değildir. Herkesin canvas'ı aynı çıkarken
  // seninki her sitede biraz farklı çıkıyorsa, kalabalığa karışmıyorsun, tam
  // tersine ayrılıyorsun. Bu katman yalnız ne yaptığını bilen kullanıcı için.
  //
  // Gürültü kökene ve döneme bağlı, çağrıya değil. Aynı site iki kez ölçüp
  // farklı sonuç alırsa değişkenliğin kendisi imza oluyor; o yüzden aynı gün
  // aynı sitede hep aynı sapma dönüyor. Konum sapmasıyla aynı mantık.

  var fpSeedValue = null, fpSeedAt = 0;

  function fpSeed() {
    var period = cfg && cfg.jitterPeriod === 'hour' ? 3600000
      : cfg && cfg.jitterPeriod === 'fixed' ? 0 : 86400000;
    var bucket = period ? Math.floor(RealDate.now() / period) : 0;
    if (fpSeedValue === null || fpSeedAt !== bucket) {
      fpSeedAt = bucket;
      fpSeedValue = E.hash(ORIGIN + '|fp|' + bucket);
    }
    return fpSeedValue;
  }

  // Aynı yüzey aynı gün aynı sayıyı alsın diye tohuma yüzey adı da giriyor
  function fpRand(surface) {
    return E.rng(E.hash(surface) ^ fpSeed());
  }

  // -1 ile 1 arasında, kökene ve yüzeye sabit
  function fpDelta(surface) {
    return fpRand(surface)() * 2 - 1;
  }

  function fpOn(key) {
    return isActive && cfg && cfg[key] === true;
  }

  // --- canvas ---------------------------------------------------------------
  // Görünen tuvale DOKUNMUYORUZ. Rakip eklentiler okuma sırasında putImageData
  // ile asıl tuvali bozuyor; sayfa o tuvali ekranda gösteriyorsa gürültü göze
  // görünür hale geliyor. Biz kopya çıkarıp kopyayı bozuyoruz.

  var CanvasProto = window.HTMLCanvasElement && window.HTMLCanvasElement.prototype;
  var Ctx2D = window.CanvasRenderingContext2D && window.CanvasRenderingContext2D.prototype;

  if (CanvasProto && Ctx2D) {
    var origToDataURL = CanvasProto.toDataURL;
    var origToBlob = CanvasProto.toBlob;
    var origGetImageData = Ctx2D.getImageData;

    var noiseImage = function (img) {
      var rand = fpRand('canvas');
      var d = img.data;
      for (var i = 0; i < d.length; i += 4) {
        if (rand() >= 0.02) continue;          // piksellerin yüzde ikisi yeter
        var step = rand() < 0.5 ? -1 : 1;
        d[i] = Math.max(0, Math.min(255, d[i] + step));
        d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + step));
        d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + step));
      }
      return img;
    };

    // Kopyayı üret: asıl tuval olduğu gibi kalıyor
    var noisyCopy = function (canvas) {
      var c = document.createElement('canvas');
      c.width = canvas.width;
      c.height = canvas.height;
      var g = c.getContext('2d');
      g.drawImage(canvas, 0, 0);
      g.putImageData(noiseImage(origGetImageData.call(g, 0, 0, c.width, c.height)), 0, 0);
      return c;
    };

    var canvasReadable = function (canvas) {
      return fpOn('fpCanvas') && canvas && canvas.width > 0 && canvas.height > 0;
    };

    CanvasProto.toDataURL = function () {
      if (!canvasReadable(this)) return origToDataURL.apply(this, arguments);
      try { return origToDataURL.apply(noisyCopy(this), arguments); }
      catch (e) { return origToDataURL.apply(this, arguments); }
    };

    CanvasProto.toBlob = function () {
      if (!canvasReadable(this)) return origToBlob.apply(this, arguments);
      try { return origToBlob.apply(noisyCopy(this), arguments); }
      catch (e) { return origToBlob.apply(this, arguments); }
    };

    // Bu zaten kopya döndürüyor, yerinde bozmak güvenli
    Ctx2D.getImageData = function () {
      var img = origGetImageData.apply(this, arguments);
      if (!fpOn('fpCanvas')) return img;
      try { return noiseImage(img); } catch (e) { return img; }
    };
  }

  // --- webgl ----------------------------------------------------------------
  // Ekran kartının markası ve modeli WEBGL_debug_renderer_info uzantısından
  // okunuyor. Uzantıyı yok saymak yeterli: yoksa sayfa sormuyor bile.

  [window.WebGLRenderingContext, window.WebGL2RenderingContext].forEach(function (G) {
    if (!G || !G.prototype) return;
    var origGetExt = G.prototype.getExtension;
    var origSupported = G.prototype.getSupportedExtensions;

    G.prototype.getExtension = function (name) {
      if (fpOn('fpWebgl') && name === 'WEBGL_debug_renderer_info') return null;
      return origGetExt.apply(this, arguments);
    };

    G.prototype.getSupportedExtensions = function () {
      var list = origSupported.apply(this, arguments);
      if (!fpOn('fpWebgl') || !list) return list;
      return list.filter(function (n) { return n !== 'WEBGL_debug_renderer_info'; });
    };
  });

  // --- ses ------------------------------------------------------------------
  // Ses yığınının ürettiği dalga, donanıma göre son hanelerde farklılaşıyor.
  // Duyulamayacak kadar küçük bir sapma imzayı bozuyor.

  var audioNoise = function (arr, surface) {
    var rand = fpRand(surface);
    for (var i = 0; i < arr.length; i++) arr[i] += (rand() - 0.5) * 1e-7;
    return arr;
  };

  if (window.AnalyserNode) {
    ['getFloatFrequencyData', 'getFloatTimeDomainData'].forEach(function (name) {
      var orig = window.AnalyserNode.prototype[name];
      if (typeof orig !== 'function') return;
      window.AnalyserNode.prototype[name] = function (arr) {
        orig.apply(this, arguments);
        if (fpOn('fpAudio')) { try { audioNoise(arr, name); } catch (e) { /* yoksay */ } }
      };
    });
  }

  if (window.AudioBuffer) {
    var origChannel = window.AudioBuffer.prototype.getChannelData;
    if (typeof origChannel === 'function') {
      window.AudioBuffer.prototype.getChannelData = function () {
        var data = origChannel.apply(this, arguments);
        if (!fpOn('fpAudio')) return data;
        // Kopya döndürüyoruz: asıl tampon bozulursa çalan ses bozulur.
        // Bedeli, tampona yazan bir uygulamanın yazdığını kaybetmesi. Ses
        // düzenleyen siteler bu yüzden ayarı kapatmalı, açıklamada yazıyor.
        try { return audioNoise(data.slice(0), 'audioBuffer'); }
        catch (e) { return data; }
      };
    }
  }

  // --- ölçüm ----------------------------------------------------------------
  // Kutu ölçüleri ve metin genişliği yüklü yazı tiplerini ele veriyor: aynı
  // metin farklı makinelerde farklı piksel genişliğinde çiziliyor. Sapma
  // piksel altı, göze görünmüyor, ölçüm imzasını bozuyor.

  var measureDelta = function (surface, v) {
    if (!isFinite(v) || v === 0) return v;
    return v + fpDelta(surface) * 0.0001 * v;
  };

  if (window.Element && window.Element.prototype.getBoundingClientRect) {
    var origRect = window.Element.prototype.getBoundingClientRect;
    window.Element.prototype.getBoundingClientRect = function () {
      var r = origRect.apply(this, arguments);
      if (!fpOn('fpRect') || typeof DOMRect !== 'function') return r;
      try {
        return new DOMRect(measureDelta('rectX', r.x), measureDelta('rectY', r.y),
          measureDelta('rectW', r.width), measureDelta('rectH', r.height));
      } catch (e) { return r; }
    };
  }

  if (Ctx2D && Ctx2D.measureText) {
    var origMeasure = Ctx2D.measureText;
    Ctx2D.measureText = function () {
      var m = origMeasure.apply(this, arguments);
      if (!fpOn('fpRect')) return m;
      try {
        Object.defineProperty(m, 'width', {
          configurable: true,
          value: measureDelta('textWidth', m.width)
        });
      } catch (e) { /* yeniden tanımlanamıyor */ }
      return m;
    };
  }

  if (window.SVGTextContentElement) {
    ['getComputedTextLength', 'getSubStringLength'].forEach(function (name) {
      var orig = window.SVGTextContentElement.prototype[name];
      if (typeof orig !== 'function') return;
      window.SVGTextContentElement.prototype[name] = function () {
        var v = orig.apply(this, arguments);
        return fpOn('fpRect') ? measureDelta('svgText', v) : v;
      };
    });
  }

  // --- ekran ve pencere -----------------------------------------------------
  // Ekran ölçüleri ile pencere ölçüleri TEK düğmede, çünkü birbiriyle tutarlı
  // olmak zorundalar. Ekranı 1920 diye bildirip pencereyi 3000 bildirmek,
  // gerçeği söylemekten daha çok ele verir.
  //
  // Bildirilen ekran, tarayıcı penceresinin kendisi. Tam ekran çalışan bir
  // kullanıcıda zaten böyle görünüyor, yani sıra dışı bir değer değil. Kaç
  // monitörün olduğu, nerede durdukları ve görev çubuğunun yeri gizleniyor.

  if (window.Screen && window.screen) {
    var screenValue = function (name) {
      var w = window.outerWidth || window.innerWidth || 0;
      var h = window.outerHeight || window.innerHeight || 0;
      if (name === 'width' || name === 'availWidth') return w;
      if (name === 'height' || name === 'availHeight') return h;
      if (name === 'availLeft' || name === 'availTop') return 0;
      return 24;   // colorDepth, pixelDepth
    };

    ['width', 'height', 'availWidth', 'availHeight', 'availLeft', 'availTop',
      'colorDepth', 'pixelDepth'].forEach(function (name) {
      var desc = Object.getOwnPropertyDescriptor(window.Screen.prototype, name);
      if (!desc || !desc.get) return;
      var orig = desc.get;
      try {
        Object.defineProperty(window.Screen.prototype, name, {
          configurable: true,
          enumerable: desc.enumerable,
          get: function () {
            return fpOn('fpScreen') ? screenValue(name) : orig.call(this);
          }
        });
      } catch (e) { /* yoksay */ }
    });

    // Kesirli piksel oranı ekran ölçeklemesini ele veriyor, yarıma yuvarlanıyor
    try {
      var dprDesc = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
      if (dprDesc && dprDesc.get) {
        var origDpr = dprDesc.get;
        Object.defineProperty(window, 'devicePixelRatio', {
          configurable: true,
          get: function () {
            var v = origDpr.call(this);
            return fpOn('fpScreen') ? Math.round(v * 2) / 2 : v;
          }
        });
      }
    } catch (e) { /* yoksay */ }
  }

  // --- cihaz ----------------------------------------------------------------
  // Çekirdek sayısı, bellek ve dokunma noktası sayısı tek başına az bilgi ama
  // birlikte daraltıyorlar. En yaygın değerleri bildiriyoruz.

  // Aynı ayarın (fpDevice) altında, yalnız Chrome'da olan iki yüzey daha:
  // bağlantı bilgisi (rtt, downlink: VPN'in uzak ucu gecikmeden okunuyor) ve
  // pil (seviye ve şarj süresi kısa süreli bir kimlik gibi çalışıyor). Firefox'ta
  // bu API'ler yok, prototip bulunmayınca kendiliğinden atlanıyor.
  var DEVICE = { hardwareConcurrency: 8, deviceMemory: 8, maxTouchPoints: 0 };
  var NETINFO = { effectiveType: '4g', rtt: 50, downlink: 10, saveData: false };
  var BATTERY = { charging: true, level: 1, chargingTime: 0, dischargingTime: Infinity };

  // Bir prototipin getter'larını sar: ayar açıkken sabit değer, değilken asıl
  function fakeGetters(proto, values, on) {
    if (!proto) return;
    Object.keys(values).forEach(function (name) {
      var desc = Object.getOwnPropertyDescriptor(proto, name);
      if (!desc || !desc.get) return;
      var orig = desc.get;
      var get = function () { return on() ? values[name] : orig.call(this); };
      try {
        Object.defineProperty(proto, name, { configurable: true, enumerable: desc.enumerable, get: get });
        pretendNative(get, 'get ' + name);
      } catch (e) { /* yoksay */ }
    });
  }

  var deviceOn = function () { return fpOn('fpDevice'); };

  // Medya cihazları: izin verilmemiş sitede etiketler zaten boş, kimlikler
  // siteye göre karışık; ama KAÇ mikrofon, kaç kamera olduğu görünüyor. İzin
  // yokken her türden ilkini bırakıyoruz. İzin varsa (etiket doluysa) dokunmuyoruz:
  // görüntülü görüşme uygulaması cihaz seçebilmeli.
  function patchMedia(win) {
    var MD = win.MediaDevices && win.MediaDevices.prototype;
    if (!MD || typeof MD.enumerateDevices !== 'function') return;
    var orig = MD.enumerateDevices;
    MD.enumerateDevices = function enumerateDevices() {
      var p = orig.apply(this, arguments);
      if (!deviceOn()) return p;
      return p.then(function (list) {
        if (!list || list.some(function (d) { return d.label; })) return list;
        var seen = {};
        return list.filter(function (d) {
          if (seen[d.kind]) return false;
          seen[d.kind] = 1;
          return true;
        });
      });
    };
    pretendNative(MD.enumerateDevices, 'enumerateDevices');
  }

  // Klavye düzeni (yalnız Chrome, navigator.keyboard.getLayoutMap). Türkçe Q,
  // Almanca QWERTZ gibi düzenler dili ve ülkeyi veriyor. Sahte dil gerçek dilden
  // farklıysa en yaygın düzeni (ABD) bildiriyoruz; aynıysa gerçek düzen zaten
  // tutarlı, dokunmuyoruz. Ayrı ayarı yok, dil sahteleme açıksa çalışıyor.
  var US_LAYOUT = (function () {
    var m = [], i, c;
    for (i = 0; i < 26; i++) {
      c = String.fromCharCode(97 + i);
      m.push(['Key' + c.toUpperCase(), c]);
    }
    for (i = 0; i < 10; i++) m.push(['Digit' + i, String(i)]);
    [['Backquote', '`'], ['Minus', '-'], ['Equal', '='], ['BracketLeft', '['],
      ['BracketRight', ']'], ['Backslash', '\\'], ['Semicolon', ';'], ['Quote', "'"],
      ['Comma', ','], ['Period', '.'], ['Slash', '/'],
      // 102. tuş. Windows'un ABD düzeni de bunu tanımlıyor; gerçek harita 48
      // anahtar, bizimki 47 kalsaydı sayının kendisi iz olurdu.
      ['IntlBackslash', '\\']].forEach(function (p) { m.push(p); });
    return m;
  })();
  var US_MAP = typeof Map === 'function' ? new Map(US_LAYOUT) : null;

  function layoutOn() {
    var l = activeLocale();
    if (!l || !US_MAP) return false;
    return l.split('-')[0].toLowerCase() !==
      String(origLanguage || '').split('-')[0].toLowerCase();
  }

  // KeyboardLayoutMap yapılamıyor; gerçeğini döndürüp prototipteki okuma
  // yollarını ABD düzenine yönlendiriyoruz. instanceof da tutuyor.
  function patchKeyboard(win) {
    var KP = win.KeyboardLayoutMap && win.KeyboardLayoutMap.prototype;
    if (!KP) return;
    var wrapM = function (name, fn) {
      var orig = KP[name];
      if (typeof orig !== 'function') return;
      var w = function () { return layoutOn() ? fn.apply(this, arguments) : orig.apply(this, arguments); };
      try { Object.defineProperty(w, 'name', { value: name, configurable: true }); } catch (e) { /* yoksay */ }
      KP[name] = w;
      pretendNative(w, name);
    };
    wrapM('get', function (k) { return US_MAP.get(k); });
    wrapM('has', function (k) { return US_MAP.has(k); });
    wrapM('keys', function () { return US_MAP.keys(); });
    wrapM('values', function () { return US_MAP.values(); });
    wrapM('entries', function () { return US_MAP.entries(); });
    wrapM('forEach', function (cb, thisArg) {
      var self = this;
      US_MAP.forEach(function (v, k) { cb.call(thisArg, v, k, self); });
    });
    if (typeof Symbol === 'function' && Symbol.iterator && KP[Symbol.iterator]) {
      var origIt = KP[Symbol.iterator];
      KP[Symbol.iterator] = function entries() {
        return layoutOn() ? US_MAP.entries() : origIt.apply(this, arguments);
      };
      pretendNative(KP[Symbol.iterator], 'entries');
    }
    var sd = Object.getOwnPropertyDescriptor(KP, 'size');
    if (sd && sd.get) {
      var sizeGet = function () { return layoutOn() ? US_MAP.size : sd.get.call(this); };
      try {
        Object.defineProperty(KP, 'size', { configurable: true, enumerable: sd.enumerable, get: sizeGet });
        pretendNative(sizeGet, 'get size');
      } catch (e) { /* yoksay */ }
    }
  }

  function patchDevice(win) {
    fakeGetters(win.Navigator && win.Navigator.prototype, DEVICE, deviceOn);
    fakeGetters(win.NetworkInformation && win.NetworkInformation.prototype, NETINFO, deviceOn);
    fakeGetters(win.BatteryManager && win.BatteryManager.prototype, BATTERY, deviceOn);
    patchMedia(win);
    patchKeyboard(win);
  }
  try { patchDevice(window); } catch (e) { LOG.add('patch', 'device.error', { message: String(e) }); }

  // --- window.name ----------------------------------------------------------
  // Siteler arası taşınan tek yazılabilir alan: A sitesi buraya bir kimlik
  // yazıyor, B sitesi okuyor. Aynı sekmede gezerken izin kopmuyor.
  // Sertleştirme değil sızıntı kapatma, o yüzden kendi düğmesinde.

  var clearWindowName = function () {
    if (!isActive || !cfg || cfg.windowName !== true) return;
    try { if (window.name) window.name = ''; } catch (e) { /* yoksay */ }
  };

  // --- çerçeve sertleştirmesi ----------------------------------------------
  // EN BÜYÜK KAÇAK YOLU BURASIYDI. Sayfa boş bir iframe açıp
  // `iframe.contentWindow.navigator.geolocation` diyor; o pencere yepyeni bir
  // gerçeklik, içindeki API'ler el değmemiş. İçerik betiği about:blank ve
  // srcdoc çerçevelerinde çalışmadığı için oraya yetişemiyor.
  //
  // Çözüm: kendi yamalarımızı çocuk pencereye kopyalamak. Aynı kaynaklı
  // olmayan pencerede erişim zaten hata veriyor, orada işimiz yok.

  function hardened(win) {
    if (!win || win === window) return false;
    try {
      // Aynı kaynaklı değilse buraya erişim SecurityError atıyor
      if (win[GNM_HARD]) return false;
      if (!win.navigator || !win.document) return false;
      win[GNM_HARD] = 1;
    } catch (e) {
      return false;
    }
    return true;
  }

  // Cercevenin kendi yamasi var mi (kendi icerik betigi calismis)
  function ownPatch(win) {
    try { return !!win[GNM_MARK]; } catch (e) { return false; }
  }

  function hardenFrame(win) {
    if (cfg && cfg.harden === false) return;
    var own = ownPatch(win);
    if (!hardened(win)) return;

    try {
      var wn = win.navigator;

      // Cercevenin kendi yamasi varsa yalniz eszamanli okunan saat dilimi ve
      // dil parcalarini bu pencerenin ayariyla ustune yaz. Kendi yamasi ayarini
      // koprusunden ZAMAN UYUMSUZ bekliyor; sayfa da cerceveyi ekler eklemez
      // contentWindow.Intl ile gercek dilimi okuyordu (leak-check.js). Ayni
      // kaynak, ayni site kurali: bu pencerenin ayari cerceve icin de dogru.
      // Worker ve Temporal'a dokunulmuyor, onlari cercevenin yamasi zaten sardi.
      if (own) {
        var onp = win.Navigator && win.Navigator.prototype;
        if (onp) {
          Object.defineProperty(onp, 'language', langDesc);
          Object.defineProperty(onp, 'languages', langsDesc);
        }
        if (win.Intl) win.Intl.DateTimeFormat = Intl.DateTimeFormat;
        if (win.Date && win.Date.prototype) {
          win.Date.prototype.getTimezoneOffset = RealDate.prototype.getTimezoneOffset;
          Object.keys(LOCAL_TO_UTC).forEach(function (k) {
            win.Date.prototype[k] = RealDate.prototype[k];
          });
        }
        hideBoot(win);
        LOG.add('patch', 'frame.sync', { origin: ORIGIN });
        return;
      }

      var wgp = win.Geolocation && win.Geolocation.prototype;
      if (wgp) {
        wgp.getCurrentPosition = geo.getCurrentPosition;
        wgp.watchPosition = geo.watchPosition;
        wgp.clearWatch = geo.clearWatch;
      } else if (wn.geolocation) {
        wn.geolocation.getCurrentPosition = geo.getCurrentPosition;
        wn.geolocation.watchPosition = geo.watchPosition;
        wn.geolocation.clearWatch = geo.clearWatch;
      }

      var wpp = win.Permissions && win.Permissions.prototype;
      if (wpp && navigator.permissions) wpp.query = navigator.permissions.query;

      var wnp = win.Navigator && win.Navigator.prototype;
      if (wnp) {
        Object.defineProperty(wnp, 'language', langDesc);
        Object.defineProperty(wnp, 'languages', langsDesc);
      }

      if (win.Intl) {
        win.Intl.DateTimeFormat = Intl.DateTimeFormat;
        INTL_NAMES.forEach(function (n) { wrapIntl(win, n); pretendNative(win.Intl[n], n); });
      }
      wrapLocaleMethods(win, pretendNative);
      ['RTCPeerConnection', 'webkitRTCPeerConnection'].forEach(function (n) { wrapRTC(win, n, pretendNative); });

      if (win.Date && win.Date.prototype) {
        win.Date.prototype.getTimezoneOffset = RealDate.prototype.getTimezoneOffset;
        Object.keys(LOCAL_TO_UTC).concat(['toString', 'toDateString', 'toTimeString',
          'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']).forEach(function (k) {
          win.Date.prototype[k] = RealDate.prototype[k];
        });
        gnmPatchDate(win, activeTz, offsetAt, origOffset, pretendNative);
      }
      var wdp = win.Document && win.Document.prototype;
      var lmNow = window.Document && Object.getOwnPropertyDescriptor(window.Document.prototype, 'lastModified');
      if (wdp && lmNow) Object.defineProperty(wdp, 'lastModified', lmNow);

      if (typeof window.fetch === 'function') win.fetch = window.fetch;
      if (typeof XHR === 'function' && win.XMLHttpRequest) {
        win.XMLHttpRequest.prototype.open = XHR.prototype.open;
        win.XMLHttpRequest.prototype.send = XHR.prototype.send;
      }

      if (win.Function && win.Function.prototype) {
        win.Function.prototype.toString = Function.prototype.toString;
      }

      // Cerceve kendi Temporal'ini ve Worker'ini getiriyor. Ana pencerenin
      // fonksiyonunu kopyalamak olmaz: donen nesne baska dunyanin olur,
      // instanceof tutmaz. Cercevenin kendi aslini sariyoruz.
      gnmPatchTemporal(win.Temporal, activeTz, deepTz, localeArg, pretendNative);
      wrapWorker(win);
      patchVoices(win);
      patchGpc(win);
      patchDevice(win);
      hideBoot(win);

      LOG.add('patch', 'frame.harden', { origin: ORIGIN });
    } catch (e) {
      LOG.add('patch', 'frame.error', { message: String(e && e.message || e) });
    }
  }

  // İki yol birden: çerçeve DOM'a girer girmez, bir de sayfa contentWindow'a
  // eriştiği anda. İlki window.frames[0] ile ulaşılanı da yakalıyor, ikincisi
  // DOM'a hiç girmeyeni.
  function watchFrames() {
    var IF = window.HTMLIFrameElement && window.HTMLIFrameElement.prototype;
    if (IF) {
      var cw = Object.getOwnPropertyDescriptor(IF, 'contentWindow');
      if (cw && cw.get) {
        Object.defineProperty(IF, 'contentWindow', {
          configurable: true,
          enumerable: cw.enumerable,
          get: function () {
            var w = cw.get.call(this);
            hardenFrame(w);
            return w;
          }
        });
        pretendNative(Object.getOwnPropertyDescriptor(IF, 'contentWindow').get, 'contentWindow');
      }

      var cd = Object.getOwnPropertyDescriptor(IF, 'contentDocument');
      if (cd && cd.get) {
        Object.defineProperty(IF, 'contentDocument', {
          configurable: true,
          enumerable: cd.enumerable,
          get: function () {
            var d = cd.get.call(this);
            if (d) hardenFrame(d.defaultView);
            return d;
          }
        });
        pretendNative(Object.getOwnPropertyDescriptor(IF, 'contentDocument').get, 'contentDocument');
      }
    }

    var origOpenWin = window.open;
    if (typeof origOpenWin === 'function') {
      window.open = function () {
        var w = origOpenWin.apply(this, arguments);
        hardenFrame(w);
        return w;
      };
      pretendNative(window.open, 'open');
    }

    var seed = function () {
      var list = document.querySelectorAll('iframe, frame');
      for (var i = 0; i < list.length; i++) {
        try { hardenFrame(list[i].contentWindow); } catch (e) { /* yoksay */ }
      }
    };

    // Gözcü YALNIZ eklenen düğümlere bakıyor. Önceden her değişiklik yığınında
    // belgenin tamamında querySelectorAll koşuyordu; DOM'u sık değişen bir
    // sayfada bu, uzantının en pahalı işi oluyordu.
    var onMutations = function (records) {
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (!n || n.nodeType !== 1) continue;
          var tag = n.tagName;
          if (tag === 'IFRAME' || tag === 'FRAME') {
            try { hardenFrame(n.contentWindow); } catch (e) { /* yoksay */ }
          } else if (n.firstElementChild && n.querySelectorAll) {
            // Bir kap düğüm çerçeveyle birlikte eklenmiş olabilir
            var inner = n.querySelectorAll('iframe, frame');
            for (var k = 0; k < inner.length; k++) {
              try { hardenFrame(inner[k].contentWindow); } catch (e) { /* yoksay */ }
            }
          }
        }
      }
    };

    // Bellek kipinde gözcü hiç kurulmuyor: contentWindow ve contentDocument
    // getter'ları zaten yerinde, sayfa çerçeveye eriştiği anda yama gidiyor.
    // Gözcü yalnız sayfanın hiç dokunmadığı çerçeveleri erkenden yakalıyor.
    if (typeof MutationObserver === 'function' && !(cfg && cfg.lowMemory)) {
      new MutationObserver(onMutations).observe(document, { childList: true, subtree: true });
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', seed);
    } else {
      seed();
    }
  }

  try { watchFrames(); } catch (e) { LOG.add('patch', 'frame.error', { message: String(e) }); }

  // --- kendi basina calisan parcalar ---------------------------------------
  // Asagidaki fonksiyonlar worker'a METIN olarak gidiyor (gnmWorkerHead).
  // Disaridaki hicbir degiskene bakmamali: yalniz parametrelerine ve
  // birbirlerine.

  // Worker'in basina eklenen metin. Hepsi tek kapali kapsamda: worker'in
  // global'inde hicbir yardimci adi gorunmuyor.
  function gnmWorkerHead(o) {
    return '(function(){\n' + [gnmWorkerHead, gnmWorkerSource, gnmPatchDate, gnmPatchTemporal,
      gnmWorkerPrelude].join('\n') + '\ngnmWorkerPrelude(' + JSON.stringify(o) + ');\n})();\n';
  }

  // Worker'a verilecek yeni adres: once yama, sonra asil betik. Sayfa ve worker
  // (ic ice worker) ayni yolu kullaniyor. Sarilamiyorsa null.
  // io: { origin, blobs, make(metin) -> blob adresi, forget(adres), read(adres) }
  function gnmWorkerSource(io, href, module, o) {
    var scheme = href.slice(0, href.indexOf(':'));
    var head = function (h) { return gnmWorkerHead(Object.assign({}, o, { href: h })); };
    var hu;

    if (scheme === 'data') {
      var asData = function (src) {
        return 'data:text/javascript;charset=utf-8,' + encodeURIComponent(src);
      };
      var comma = href.indexOf(',');
      if (comma < 0) return null;
      // Gecersiz % dizisi tarayicida oldugu gibi kaliyor
      var text = href.slice(comma + 1).split('#')[0].replace(/(%[0-9a-f]{2})+/gi, function (run) {
        try { return decodeURIComponent(run); } catch (e) { return run; }
      });
      if (/;\s*base64\s*$/i.test(href.slice(0, comma))) {
        try {
          var bin = atob(text.replace(/\s/g, ''));
          var bytes = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          text = new TextDecoder().decode(bytes);
        } catch (e) { return null; }
      }
      if (!module) return asData(head(null) + text);
      return asData('import ' + JSON.stringify(asData(head(null))) + ';\n' + text);
    }

    if (!io.blobs) return null;

    if (scheme === 'http' || scheme === 'https') {
      if (new URL(href).origin !== io.origin) return null;
      if (!module) return io.make(head(href) + 'importScripts(' + JSON.stringify(href) + ');\n');
      // import'lar sirayla degerlendiriliyor: once yama modulu, sonra asil betik.
      // Tek blob'a koymak olmazdi, import govdeden ONCE calisir.
      hu = io.make(head(href));
      io.forget(hu);
      return io.make('import ' + JSON.stringify(hu) + ';\nimport ' + JSON.stringify(href) + ';\n');
    }

    if (scheme === 'blob') {
      var body = io.read(href);
      if (body === null) return null;
      if (!module) return io.make(head(href) + body);
      hu = io.make(head(href));
      io.forget(hu);
      return io.make('import ' + JSON.stringify(hu) + ';\n' + body);
    }
    return null;
  }

  // Date'in dilim hesabi yapan kalan yollari: Date() metni, yerel parcali ve
  // metinli yapici, Date.parse, setHours ailesi, getYear.
  // G: pencere ya da worker. offs(t, tz): getTimezoneOffset isaretli dakika.
  // sysOffset: tarayicinin ASIL getTimezoneOffset'i.
  function gnmPatchDate(G, tzNow, offs, sysOffset, mark) {
    var RD = G.Date;
    var P = RD && RD.prototype;
    if (!P || !P.setUTCHours || typeof Reflect === 'undefined') return;
    var realParse = RD.parse, realUTC = RD.UTC, getTime = P.getTime, setTime = P.setTime;
    var put = function (obj, name, fn, length) {
      try {
        if (length !== undefined) Object.defineProperty(fn, 'length', { value: length, configurable: true });
        Object.defineProperty(obj, name, { value: fn, writable: true, enumerable: false, configurable: true });
        if (mark) mark(fn, name);
      } catch (e) { /* yoksay */ }
    };

    // Duvar saati (UTC gibi yazilmis milisaniye) -> gercek an. Yaz saati
    // tekrarinda erken olan, boslugunda gecisten onceki fark: ECMAScript kurali
    var toUtc = function (wall, tz) {
      if (!isFinite(wall) || Math.abs(wall) > 8.64e15) return NaN;
      var before = offs(wall - 86400000, tz), after = offs(wall + 86400000, tz);
      if (!isFinite(before)) before = offs(wall, tz);
      if (!isFinite(after)) after = before;
      var a = wall + before * 60000;
      if (before === after) return a;
      var b = wall + after * 60000;
      var aOk = offs(a, tz) === before, bOk = offs(b, tz) === after;
      if (aOk && bOk) return Math.min(a, b);
      return bOk ? b : a;
    };

    // Metin sistem diliminde mi yorumlaniyor: dilim yazmiyorsa ve yalniz ISO
    // tarih degilse (o UTC sayiliyor)
    var isLocal = function (text) {
      var x = text.trim();
      if (/^[+-]?\d{4,6}(-\d\d(-\d\d)?)?$/.test(x)) return false;
      if (/\b(gmt|utc|ut|[ecmp][sd]t)\b/i.test(x)) return false;
      x = x.replace(/\s*\([^)]*\)\s*$/, '');
      return !/(\d:\d\d(:\d\d(\.\d+)?)?\s*([ap]\.?m\.?)?\s*(z|[+-]\d{1,2}(:?\d\d)?)|\s[+-]\d{4})$/i.test(x);
    };
    var parseIn = function (text, tz) {
      var ms = realParse(text);
      if (!isFinite(ms) || !isLocal(text)) return ms;
      return toUtc(ms - sysOffset.call(new RD(ms)) * 60000, tz);
    };

    var D = function Date(year, month, day, hours, minutes, seconds, ms) {
      if (!new.target) return P.toString.call(new RD());
      var args = arguments;
      var tz = args.length ? tzNow() : null;
      if (tz && args.length === 1) {
        var v = args[0];
        if (v !== null && typeof v === 'object') {
          try { v = getTime.call(v); } catch (e) {
            var prim = typeof Symbol === 'function' ? v[Symbol.toPrimitive] : undefined;
            if (prim) v = prim.call(v, 'default');
            else {
              var val = v.valueOf();
              v = val !== null && (typeof val === 'object' || typeof val === 'function') ? String(v) : val;
            }
          }
        }
        args = [typeof v === 'string' ? parseIn(v, tz) : v];
      } else if (tz) {
        args = [toUtc(realUTC.apply(null, args), tz)];
      }
      return Reflect.construct(RD, args, new.target);
    };
    D.prototype = P;
    put(D, 'now', RD.now);
    put(D, 'UTC', realUTC);
    put(D, 'parse', ({
      parse(text) {
        var tz = tzNow();
        return tz ? parseIn(String(text), tz) : realParse(text);
      }
    }).parse);

    ['Milliseconds', 'Seconds', 'Minutes', 'Hours', 'Date', 'Month', 'FullYear'].forEach(function (k) {
      var name = 'set' + k, orig = P[name], utc = P['setUTC' + k];
      if (!orig || !utc) return;
      put(P, name, ({
        [name]() {
          var tz = tzNow();
          if (!tz) return orig.apply(this, arguments);
          var t = getTime.call(this);
          var wall = isFinite(t) ? t - offs(t, tz) * 60000 : (k === 'FullYear' ? 0 : NaN);
          var tmp = new RD(wall);
          utc.apply(tmp, arguments);
          return setTime.call(this, toUtc(getTime.call(tmp), tz));
        }
      })[name], orig.length);
    });

    var oGetYear = P.getYear, oSetYear = P.setYear;
    if (oGetYear) {
      put(P, 'getYear', ({
        getYear() { return tzNow() ? this.getFullYear() - 1900 : oGetYear.call(this); }
      }).getYear);
    }
    if (oSetYear) {
      put(P, 'setYear', ({
        setYear(y) {
          if (!tzNow()) return oSetYear.call(this, y);
          var n = Number(y);
          if (!isFinite(n)) return setTime.call(this, NaN);
          n = Math.trunc(n);
          return this.setFullYear(n >= 0 && n <= 99 ? 1900 + n : n);
        }
      }).setYear, 1);
    }

    put(P, 'constructor', D);
    put(G, 'Date', D);
    if (mark) mark(D, 'Date');
  }

  // Temporal.Now'un dilim okuyan dort yolu ve toLocaleString'ler. Acikca
  // dilim verilmisse dokunulmuyor. tzNow: Now icin dilim, tzText: metin yollari
  // (tzDeep), locOf: dil yoksa sahte dili koyan fonksiyon, mark: toString maskesi.
  function gnmPatchTemporal(T, tzNow, tzText, locOf, mark) {
    if (!T || !T.Now) return;
    var N = T.Now;
    var put = function (obj, name, fn) {
      try {
        var d = Object.getOwnPropertyDescriptor(obj, name);
        Object.defineProperty(obj, name, {
          value: fn,
          writable: d ? d.writable : true,
          enumerable: d ? d.enumerable : false,
          configurable: true
        });
        if (mark) mark(fn, name);
      } catch (e) { /* yoksay */ }
    };

    // Yontem sozdizimi: yerli yontemler gibi prototype'i yok, adi dogru
    var oId = N.timeZoneId;
    if (typeof oId === 'function') {
      put(N, 'timeZoneId', ({ timeZoneId() { return tzNow() || oId.call(N); } }).timeZoneId);
    }

    ['zonedDateTimeISO', 'plainDateTimeISO', 'plainDateISO', 'plainTimeISO'].forEach(function (name) {
      var orig = N[name];
      if (typeof orig !== 'function') return;
      var m = {
        [name]() {
          var z = arguments[0];
          if (z === undefined) z = tzNow() || undefined;
          return z === undefined ? orig.call(N) : orig.call(N, z);
        }
      };
      put(N, name, m[name]);
    });

    ['Instant', 'ZonedDateTime', 'PlainDateTime', 'PlainDate', 'PlainTime',
      'PlainYearMonth', 'PlainMonthDay', 'Duration'].forEach(function (k) {
      var P = T[k] && T[k].prototype;
      var orig = P && P.toLocaleString;
      if (typeof orig !== 'function') return;
      put(P, 'toLocaleString', ({
        toLocaleString() {
          var op = arguments[1];
          // Yalniz Instant sistem dilimine dusuyor; otekiler ya dilimsiz ya
          // kendi dilimini tasiyor
          if (k === 'Instant') {
            var t = tzText();
            if (t) {
              op = Object.assign({}, op);
              if (!op.timeZone) op.timeZone = t;
            }
          }
          return orig.call(this, locOf(arguments[0]), op);
        }
      }).toLocaleString);
    });
  }

  // Worker'in icinde, worker'in kendi betiginden ONCE calisan yama. Ayar
  // sabit (o): worker kuruldugu andaki profil. Sayfa yamasinin worker'a
  // yetecek kadari: Date, Intl, Temporal, dil, toString maskesi.
  function gnmWorkerPrelude(o) {
    'use strict';
    var G = self;
    var RD = Date, DP = Date.prototype, ODTF = Intl.DateTimeFormat;
    var faked = new WeakMap();
    var mark = function (fn, name) { if (typeof fn === 'function') faked.set(fn, name); return fn; };
    var named = function (fn, name) {
      try { Object.defineProperty(fn, 'name', { value: name, configurable: true }); } catch (e) { /* yoksay */ }
      return fn;
    };
    var adopt = function (Patched, Orig) {
      Patched.prototype = Orig.prototype;
      try {
        Object.defineProperty(Orig.prototype, 'constructor', { value: Patched, writable: true, configurable: true });
      } catch (e) { /* yoksay */ }
    };

    // Worker'in kendi actigi worker'lar: ayni yama, ayni ayar. Asillar adresler
    // asagida degistirilmeden once saklaniyor.
    var OW = G.Worker, RB = G.Blob, RU = G.URL, RX = G.XMLHttpRequest;
    if (typeof OW === 'function' && typeof Reflect !== 'undefined') {
      var xOpen = RX && RX.prototype.open, xSend = RX && RX.prototype.send;
      var inner = {
        origin: o.origin,
        blobs: !!(RB && RU && RU.createObjectURL),
        make: function (src) { return RU.createObjectURL(new RB([src], { type: 'text/javascript' })); },
        forget: function (u) {
          setTimeout(function () { try { RU.revokeObjectURL(u); } catch (e) { /* yoksay */ } }, 30000);
        },
        read: function (u) {
          try {
            var x = new RX();
            xOpen.call(x, 'GET', u, false);
            xSend.call(x);
            return x.status === 200 || x.status === 0 ? x.responseText : null;
          } catch (e) { return null; }
        }
      };
      var selfHref = o.href || (G.location && G.location.href);
      var NW = function Worker(url) {
        if (!new.target) return OW.apply(this, arguments);
        var args = Array.prototype.slice.call(arguments), src = null;
        try {
          src = gnmWorkerSource(inner, new RU(String(args[0]), selfHref).href,
            !!(args[1] && args[1].type === 'module'), o);
        } catch (e) { src = null; }
        if (src) {
          try {
            var w = Reflect.construct(OW, [src].concat(args.slice(1)), new.target);
            inner.forget(src);
            return w;
          } catch (e) { /* asil yapiciya dus */ }
        }
        return Reflect.construct(OW, args, new.target);
      };
      adopt(NW, OW);
      G.Worker = mark(NW, 'Worker');
    }

    // Blob adresinde calisiyoruz. Goreli adresler blob'a gore cozulup
    // kirilmasin, self.location da sayfanin verdigi adresi gostersin.
    if (o.href) {
      var base = o.href;
      var abs = function (x) {
        if (typeof x !== 'string') return x;
        try { return new URL(x, base).href; } catch (e) { return x; }
      };
      try {
        var u = new URL(base);
        var loc = {};
        ['href', 'origin', 'protocol', 'host', 'hostname', 'port', 'pathname', 'search',
          'hash'].forEach(function (k) { loc[k] = u[k]; });
        loc.toString = function () { return u.href; };
        var WGS = G.WorkerGlobalScope && G.WorkerGlobalScope.prototype;
        var onProto = WGS && Object.getOwnPropertyDescriptor(WGS, 'location');
        Object.defineProperty(onProto ? WGS : G, 'location', {
          configurable: true,
          enumerable: true,
          get: mark(named(function () { return loc; }, 'get location'), 'get location')
        });
      } catch (e) { /* yoksay */ }

      if (typeof G.importScripts === 'function') {
        var oIS = G.importScripts;
        G.importScripts = mark(function importScripts() {
          return oIS.apply(this, Array.prototype.map.call(arguments, abs));
        }, 'importScripts');
      }
      if (typeof G.fetch === 'function') {
        var oF = G.fetch;
        G.fetch = mark(function fetch(input) {
          return arguments.length > 1 ? oF.call(this, abs(input), arguments[1]) : oF.call(this, abs(input));
        }, 'fetch');
      }
      var XP = G.XMLHttpRequest && G.XMLHttpRequest.prototype;
      if (XP && XP.open) {
        var oOpen = XP.open;
        XP.open = mark(function open(method, url) {
          var a = Array.prototype.slice.call(arguments);
          if (a.length > 1) a[1] = abs(url);
          return oOpen.apply(this, a);
        }, 'open');
      }
    }

    var L = o.locale;
    var locOf = function (ls) {
      if (!L || !o.intl) return ls;
      if (ls === undefined || (Array.isArray(ls) && !ls.length)) return L;
      return ls;
    };

    var tz = o.tz;
    var off = null;
    if (tz) {
      var F = new ODTF('en-US', {
        timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
      var cache = Object.create(null), count = 0;
      // getTimezoneOffset isareti; sayfa yamasindaki offsetAt ile ayni hesap
      off = function (t) {
        if (!isFinite(t)) return NaN;
        var key = Math.floor(t / 900000);
        if (cache[key] !== undefined) return cache[key];
        var p = {}, parts = F.formatToParts(new RD(t));
        for (var i = 0; i < parts.length; i++) p[parts[i].type] = parts[i].value;
        var h = p.hour === '24' ? 0 : +p.hour;
        var v = Math.round((Math.floor(t / 1000) * 1000 -
          RD.UTC(+p.year, +p.month - 1, +p.day, h, +p.minute, +p.second)) / 60000);
        if (count++ > 512) { cache = Object.create(null); count = 0; }
        cache[key] = v;
        return v;
      };

      var oOff = DP.getTimezoneOffset;
      var zoneOff = function (t) { return off(t); };
      var zoneNow = function () { return tz; };
      DP.getTimezoneOffset = mark(function getTimezoneOffset() {
        var v = off(this.getTime());
        return isFinite(v) ? v : oOff.call(this);
      }, 'getTimezoneOffset');

      ['FullYear', 'Month', 'Date', 'Day', 'Hours', 'Minutes', 'Seconds',
        'Milliseconds'].forEach(function (k) {
        var orig = DP['get' + k], utc = DP['getUTC' + k];
        DP['get' + k] = mark(named(function () {
          var t = this.getTime(), v = off(t);
          if (!isFinite(v)) return orig.call(this);
          return utc.call(new RD(t - v * 60000));
        }, 'get' + k), 'get' + k);
      });

      if (o.deep) {
        var D3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        var M3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
        var ZN = null;
        try { ZN = new ODTF('en-US', { timeZone: tz, timeZoneName: 'long' }); } catch (e) { /* yoksay */ }
        var zname = function (t) {
          try {
            var ps = ZN.formatToParts(new RD(t));
            for (var i = 0; i < ps.length; i++) if (ps[i].type === 'timeZoneName') return ps[i].value;
          } catch (e) { /* yoksay */ }
          return tz;
        };
        var dPart = function (d) {
          return D3[d.getDay()] + ' ' + M3[d.getMonth()] + ' ' + p2(d.getDate()) + ' ' + d.getFullYear();
        };
        var tPart = function (d) {
          var v = off(d.getTime());
          if (!isFinite(v)) v = 0;
          var a = Math.abs(v);
          return p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()) +
            ' GMT' + (v > 0 ? '-' : '+') + p2(Math.floor(a / 60)) + p2(a % 60) +
            ' (' + zname(d.getTime()) + ')';
        };
        var oS = DP.toString, oDS = DP.toDateString, oTS = DP.toTimeString;
        DP.toString = mark(function toString() {
          return isFinite(this.getTime()) ? dPart(this) + ' ' + tPart(this) : oS.call(this);
        }, 'toString');
        DP.toDateString = mark(function toDateString() {
          return isFinite(this.getTime()) ? dPart(this) : oDS.call(this);
        }, 'toDateString');
        DP.toTimeString = mark(function toTimeString() {
          return isFinite(this.getTime()) ? tPart(this) : oTS.call(this);
        }, 'toTimeString');
        ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString'].forEach(function (k) {
          var orig = DP[k];
          DP[k] = mark(named(function () {
            var op = Object.assign({}, arguments[1]);
            if (!op.timeZone) op.timeZone = tz;
            return orig.call(this, locOf(arguments[0]), op);
          }, k), k);
        });
      }
    }

    if (tz || L) {
      var PD = function DateTimeFormat(locales, options) {
        var op = Object.assign({}, options);
        if (tz && !op.timeZone) op.timeZone = tz;
        return new ODTF(locOf(locales), op);
      };
      adopt(PD, ODTF);
      PD.supportedLocalesOf = ODTF.supportedLocalesOf.bind(ODTF);
      Intl.DateTimeFormat = mark(PD, 'DateTimeFormat');
    }

    if (L) {
      var WN = G.WorkerNavigator && G.WorkerNavigator.prototype;
      var b = L.split('-')[0];
      var langs = Object.freeze(b === L ? [L] : [L, b]);
      try {
        Object.defineProperty(WN || G.navigator, 'language', {
          configurable: true, enumerable: true,
          get: mark(named(function () { return L; }, 'get language'), 'get language')
        });
        Object.defineProperty(WN || G.navigator, 'languages', {
          configurable: true, enumerable: true,
          get: mark(named(function () { return langs; }, 'get languages'), 'get languages')
        });
      } catch (e) { /* yoksay */ }

      if (o.intl) {
        ['NumberFormat', 'Collator', 'PluralRules', 'RelativeTimeFormat', 'ListFormat',
          'DisplayNames', 'Segmenter', 'DurationFormat'].forEach(function (name) {
          var Orig = Intl[name];
          if (typeof Orig !== 'function') return;
          var P = named(function (locales, options) { return new Orig(locOf(locales), options); }, name);
          adopt(P, Orig);
          if (Orig.supportedLocalesOf) P.supportedLocalesOf = Orig.supportedLocalesOf.bind(Orig);
          Intl[name] = mark(P, name);
        });
        [[G.String, 'toLocaleUpperCase'], [G.String, 'toLocaleLowerCase']].forEach(function (pair) {
          var k = pair[1], orig = pair[0].prototype[k];
          pair[0].prototype[k] = mark(named(function () { return orig.call(this, locOf(arguments[0])); }, k), k);
        });
        [[G.Number, 'toLocaleString'], [G.BigInt, 'toLocaleString'],
          [G.String, 'localeCompare']].forEach(function (pair) {
          var C = pair[0], k = pair[1];
          if (!C || !C.prototype || typeof C.prototype[k] !== 'function') return;
          var orig = C.prototype[k];
          C.prototype[k] = mark(named(k === 'localeCompare'
            ? function (that) { return orig.call(this, that, locOf(arguments[1]), arguments[2]); }
            : function () { return orig.call(this, locOf(arguments[0]), arguments[1]); }, k), k);
        });
      }
    }

    if (tz && typeof gnmPatchDate === 'function') {
      gnmPatchDate(G, zoneNow, zoneOff, oOff, mark);
    }

    if (typeof gnmPatchTemporal === 'function') {
      gnmPatchTemporal(G.Temporal,
        function () { return tz || null; },
        function () { return o.deep ? tz || null : null; },
        locOf, mark);
    }

    if (o.mask) {
      var FP = Function.prototype, oTo = FP.toString;
      FP.toString = function toString() {
        var n = faked.get(this);
        return n ? 'function ' + n + '() { [native code] }' : oTo.call(this);
      };
      faked.set(FP.toString, 'toString');
    }
  }

}
