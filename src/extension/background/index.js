// Arka plan. İki işi var:
//
// A. Ayarlara bakıp tarayıcı ayarlarını ve istek kurallarını sürdürmek:
//      1. Accept-Language başlığı değişecek mi
//      2. WebRTC yerel IP sızıntısı kapalı mı
//      3. DNS ön çözümleme ve bağlantı pingi kapalı mı
//      4. GPC başlığı ve takip parametresi temizleme
// B. Log'un tek sahibi olmak. Herkes buraya mesaj atar, yazan tek yer burasıdır,
//    böylece sekmeler birbirinin kaydının üstüne yazmaz.


var GNM_LANG_RULE_ID = 1;
var GNM_TILE_RULE_ID = 2;
var GNM_GPC_RULE_ID = 3;
// Parametre kurali birden cok: Chrome regexFilter'i derlenince 2 KB ile
// sinirliyor, 27 adlik tek ifade "memoryLimitExceeded" ile reddediliyordu ve
// ayni cagridaki GPC kurali da onunla dusuyordu. Adlar 7'lik gruplara bolunuyor
// (gercek tarayicida 9'a kadar sigdi, pay birakildi). 4..7 bu kurallara ayrik.
var GNM_BOOT_RULE_ID = 8;   // Server-Timing acilis degeri, bkz. gnmBootRule
var GNM_STRIP_RULE_ID = 4;
var GNM_STRIP_CHUNK = 7;
var GNM_STRIP_RULE_MAX = 4;

// Bağlantıya eklenen takip parametreleri. Kural yalnız bunları siler ve YALNIZ
// bunlardan biri adreste varsa çalışır: eşleşip hiçbir şey silmeyen bir
// yönlendirme aynı adrese döner, döngü riski. O yüzden düzenli ifade bu
// listeden üretiliyor, joker (utm_*) yok.
var GNM_TRACK_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  'utm_name', 'utm_source_platform', 'utm_creative_format', 'utm_marketing_tactic',
  'fbclid', 'gclid', 'dclid', 'gbraid', 'wbraid', 'gclsrc', 'msclkid', 'twclid',
  'ttclid', 'li_fat_id', 'igshid', 'yclid', 'mc_cid', 'mc_eid', '_hsenc', '_hsmi',
  'mkt_tok'
];

// OpenStreetMap karo sunucusu kimliksiz isteği engelliyor ve "403 Access blocked,
// Referer is required" yazan bir karo döndürüyor. Uzantı sayfasından giden istekte
// Referer yok: Firefox moz-extension kaynağını gizliliğe saygıdan yollamıyor.
// OSM'nin istediği tam olarak bu, uygulamayı tanıtan bir Referer. Yalnız o alan
// adına, yalnız resim isteklerine ekleniyor.
var GNM_TILE_HOSTS = ['tile.openstreetmap.org', 'tile.openstreetmap.de'];
var GNM_TILE_REFERER = 'https://addons.mozilla.org/firefox/addon/geonomore/';
var GNM_LOG_MAX_DETAIL = 500;

function gnmSwallow() {
  // Kayıtlı olmayanı kaldırmak, desteklenmeyen API'yi çağırmak hata döndürür.
  // Okumazsak konsola düşer, işlevsel bir sonucu yok.
  return chrome.runtime.lastError;
}

// --- log ------------------------------------------------------------------

// Yazmalar sırayla gitsin. İki okuma-değiştirme-yazma iç içe geçerse kayıt kaybolur.
var gnmLogChain = Promise.resolve();

function gnmCleanEntry(e) {
  var detail;
  try {
    detail = typeof e.d === 'string' ? e.d : JSON.stringify(e.d);
  } catch (err) {
    detail = '?';
  }
  if (!detail) detail = '';
  if (detail.length > GNM_LOG_MAX_DETAIL) detail = detail.slice(0, GNM_LOG_MAX_DETAIL) + '…';

  return {
    t: typeof e.t === 'number' ? e.t : Date.now(),
    s: String(e.s || '?').slice(0, 12),
    e: String(e.e || '?').slice(0, 40),
    d: detail
  };
}

function gnmAppendLog(entries) {
  if (!entries || !entries.length) return;
  var clean = entries.map(gnmCleanEntry);

  gnmLogChain = gnmLogChain.then(function () {
    return new Promise(function (resolve) {
      chrome.storage.local.get(['config', 'log'], function (r) {
        gnmSwallow();
        var cfg = r && r.config;
        if (cfg && cfg.logging === false) return resolve();

        // Bellek kipinde tavan düşük: log storage'da duruyor ve options
        // sayfası açıldığında tamamı belleğe okunuyor.
        var max = cfg && cfg.lowMemory ? 200 : ((cfg && cfg.logMax) || 1000);
        var log = ((r && r.log) || []).concat(clean);
        if (log.length > max) log = log.slice(log.length - max);

        chrome.storage.local.set({ log: log }, function () {
          gnmSwallow();
          resolve();
        });
      });
    });
  });
}

function gnmLog(event, detail) {
  gnmAppendLog([{ t: Date.now(), s: 'bg', e: event, d: detail }]);
}

// --- timeline -------------------------------------------------------------
// Benzetilen hareketin geçmişi. Varsayılan kapalı: gereksiz hassas veri
// biriktirmenin anlamı yok. Açıkken de dakikada bir nokta yetiyor.

var gnmLastPoint = 0;

function gnmTimeline(entries) {
  var points = entries.filter(function (e) {
    return e && (e.e === 'geo.fake' || e.e === 'geo.watch.tick') && e.d && isFinite(e.d.lat);
  });
  if (!points.length) return;

  chrome.storage.local.get(['config', 'timeline'], function (r) {
    gnmSwallow();
    var cfg = r && r.config;
    if (!cfg || !cfg.timeline) return;

    var now = Date.now();
    if (now - gnmLastPoint < 60000) return;      // dakikada bir nokta yeter
    gnmLastPoint = now;

    var last = points[points.length - 1];
    var line = ((r && r.timeline) || []).concat([{
      t: last.t || now,
      lat: last.d.lat,
      lon: last.d.lon,
      host: String(last.d.origin || '').replace(/^https?:\/\//, '')
    }]);

    var max = cfg.timelineMax || 500;
    if (line.length > max) line = line.slice(line.length - max);
    chrome.storage.local.set({ timeline: line }, gnmSwallow);
  });
}

chrome.runtime.onMessage.addListener(function (msg, sender) {
  if (!msg || !Array.isArray(msg.__gnmLog)) return;
  var entries = msg.__gnmLog.slice(0, 50);
  gnmAppendLog(entries);
  gnmTimeline(entries);
});

// İçerik betikleri artık manifest'te statik tanımlı, burada kayıt işi yok.
// Dinamik kayıt (chrome.scripting.registerContentScripts) çoğu sayfada geç
// kalıyordu ve site gerçek konumu alıyordu. Hangi sayfada çalışacağına
// engine.activeFor karar veriyor, kararı da yalıtılmış dünyadaki bridge.js
// uyguluyor; sayfanın sözüne bakılmıyor.

// --- Accept-Language ------------------------------------------------------

// "tr-TR" -> "tr-TR,tr;q=0.9,en;q=0.8"
function gnmLanguageHeader(locale) {
  var l = String(locale || '').trim();
  if (!l) return null;
  var base = l.split('-')[0];
  var parts = [l];
  if (base !== l) parts.push(base + ';q=0.9');
  if (base !== 'en') parts.push('en;q=0.8');
  return parts.join(',');
}

// Karo kuralı ayarlardan bağımsız: harita uzantı kapalıyken de çiziliyor.
function gnmTileRule() {
  return {
    id: GNM_TILE_RULE_ID,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [{ header: 'Referer', operation: 'set', value: GNM_TILE_REFERER }]
    },
    condition: {
      requestDomains: GNM_TILE_HOSTS,
      resourceTypes: ['image']
    }
  };
}

// Bilinçli sadelik: tek genel kural. Site kuralları kendi diline sahip olsun istenirse
// requestDomains ile kural başına ayrılır, v4 işi.
function gnmSyncLanguage(cfg) {
  if (!chrome.declarativeNetRequest || !chrome.declarativeNetRequest.updateDynamicRules) {
    gnmLog('dnr.unsupported', {});
    return;
  }

  var value = cfg && cfg.enabled && cfg.acceptLanguage ? gnmLanguageHeader(cfg.locale) : null;
  var rules = [];
  if (value) {
    rules.push({
      id: GNM_LANG_RULE_ID,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [{ header: 'Accept-Language', operation: 'set', value: value }]
      },
      condition: {
        urlFilter: '*',
        resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest', 'script',
          'stylesheet', 'image', 'font', 'media', 'other']
      }
    });
  }

  try {
    rules.push(gnmTileRule());

    chrome.declarativeNetRequest.updateDynamicRules(
      { removeRuleIds: [GNM_LANG_RULE_ID, GNM_TILE_RULE_ID], addRules: rules },
      function () {
        var err = chrome.runtime.lastError;
        gnmLog(value ? 'dnr.set' : 'dnr.clear', {
          acceptLanguage: value,
          error: err ? err.message : null
        });
      }
    );
  } catch (e) {
    // Firefox'ta modifyHeaders desteği 128 ile geldi, eskisinde buraya düşer
    gnmLog('dnr.error', { message: String(e && e.message || e) });
  }
}

// Kurulumda tek satir imza. Log kullanicinin kendi makinesinde kaliyor,
// disari hicbir sey gitmiyor.
var GNM_BY = 'miabeyefendi';

// --- WebRTC ---------------------------------------------------------------

// Dikkat: bu tarayıcı geneli bir ayar, tek siteye uygulanamıyor.
// Uzantı kapanınca temizleniyor ki kullanıcının kendi tercihi geri gelsin.
function gnmSyncWebRTC(cfg) {
  var pref = chrome.privacy && chrome.privacy.network &&
    chrome.privacy.network.webRTCIPHandlingPolicy;
  if (!pref) {
    gnmLog('webrtc.unsupported', {});
    return;
  }

  var done = function (what) {
    return function () {
      var err = chrome.runtime.lastError;
      gnmLog(what, { error: err ? err.message : null });
    };
  };

  if (cfg && cfg.enabled && cfg.webrtc) {
    pref.set({ value: 'default_public_interface_only' }, done('webrtc.set'));
  } else {
    pref.clear({}, done('webrtc.clear'));
  }

  // İkinci kademe: WebRTC'yi tamamen kapat. Görüntülü görüşme, ekran paylaşımı
  // ve bazı oyunlar çalışmaz hale geliyor, o yüzden ayrı ve varsayılan kapalı.
  var off = chrome.privacy && chrome.privacy.network &&
    chrome.privacy.network.peerConnectionEnabled;
  if (!off) return;
  if (cfg && cfg.enabled && cfg.webrtcBlock) {
    off.set({ value: false }, done('webrtc.block'));
  } else {
    off.clear({}, done('webrtc.unblock'));
  }
}

// --- DNS ön çözümleme ve bağlantı pingi -----------------------------------

// İkisi de tarayıcı geneli ayar, WebRTC gibi: uzantı açıkken kurulur, kapanınca
// tarayıcıya geri verilir. Ön çözümleme, VPN ya da proxy kullanan birinin DNS
// isteklerini tıklamadan önce, tünel dışından yollatabiliyor. Ping (<a ping>)
// tıklanan bağlantıyı üçüncü bir adrese ayrıca bildiriyor.
// Yeni anahtarlar eski kayıtta yok; "kapatılmadıysa açık" okunuyor.
function gnmSyncNetwork(cfg) {
  var on = !!(cfg && cfg.enabled);
  // [grup, ayar, uygulansın mı, uygulanınca değer, kayıt adı, tarayıcıya özel mi]
  // Tarayıcıya özel olanın API'si öteki tarayıcıda yok; orada sessizce geçiliyor,
  // her senkronda "desteklenmiyor" yazmanın anlamı yok.
  var noSandbox = on && cfg.noSandbox !== false;
  var pairs = [
    ['network', 'networkPredictionEnabled', on && cfg.noPrediction !== false, false, 'predict', false],
    ['websites', 'hyperlinkAuditingEnabled', on && cfg.noPing !== false, false, 'ping', false],
    // Yalnız Chrome: Privacy Sandbox. Topics ilgi alanı çıkarıyor, FLEDGE
    // (Protected Audience) reklam grubu tutuyor, reklam ölçümü dönüşüm
    // raporluyor. Uzantılar bunları yalnız KAPATABİLİYOR.
    ['websites', 'topicsEnabled', noSandbox, false, 'topics', true],
    ['websites', 'fledgeEnabled', noSandbox, false, 'fledge', true],
    ['websites', 'adMeasurementEnabled', noSandbox, false, 'admeasure', true],
    // Yalnız Firefox: izleme içeriğini yalnız gizli pencerede değil her
    // pencerede engelle. Bazı gömülü içerikleri bozabildiği için varsayılan kapalı.
    ['websites', 'trackingProtectionMode', on && cfg.etpAlways === true, 'always', 'etp', true]
  ];
  pairs.forEach(function (p) {
    var pref = chrome.privacy && chrome.privacy[p[0]] && chrome.privacy[p[0]][p[1]];
    if (!pref) { if (!p[5]) gnmLog(p[4] + '.unsupported', {}); return; }
    var cb = function (what) {
      return function () {
        var err = chrome.runtime.lastError;
        gnmLog(what, { error: err ? err.message : null });
      };
    };
    if (p[2]) pref.set({ value: p[3] }, cb(p[4] + '.set'));
    else pref.clear({}, cb(p[4] + '.clear'));
  });
}

// --- GPC ve takip parametreleri --------------------------------------------

// Global Privacy Control: "verimi satma, paylaşma" sinyali, bazı eyalet ve
// ülkelerde yasal bağlayıcı. Başlık burada, sayfadaki
// navigator.globalPrivacyControl injected.js'te; ikisi aynı ayardan.
// Her grup kendi ifadesi; eslesen ad her zaman silinen listede (tum liste
// siliniyor), yani ayni adrese yonlendirme dongusu olamaz.
function gnmStripRegexes() {
  var out = [];
  for (var i = 0; i < GNM_TRACK_PARAMS.length; i += GNM_STRIP_CHUNK) {
    out.push('[?&](' + GNM_TRACK_PARAMS.slice(i, i + GNM_STRIP_CHUNK).join('|') + ')=');
  }
  return out;
}

function gnmStripRuleIds() {
  var ids = [];
  for (var i = 0; i < GNM_STRIP_RULE_MAX; i++) ids.push(GNM_STRIP_RULE_ID + i);
  return ids;
}

// Tek updateDynamicRules cagrisi toptan: bir kural reddedilirse hepsi duser.
// GPC ve parametre kurallari bu yuzden ayri cagrida.
function gnmUpdateRules(removeIds, rules, what) {
  try {
    chrome.declarativeNetRequest.updateDynamicRules(
      { removeRuleIds: removeIds, addRules: rules },
      function () {
        var err = chrome.runtime.lastError;
        gnmLog('track.sync', { what: what, rules: rules.length, error: err ? err.message : null });
      }
    );
  } catch (e) {
    gnmLog('track.sync', { what: what, error: String(e && e.message || e) });
  }
}

// --- acilis degeri ----------------------------------------------------------
// Sayfa yamasi ayari kopruden zaman uyumsuz aliyor; ilk betikler o arada gercek
// saat dilimini ve dili okuyordu. Yanitlara `Server-Timing: gnm;desc="dilim|dil"`
// ekleniyor, yama bunu navigasyon kaydindan eszamanli okuyup ayar gelene kadar
// kullaniyor (injected.js "acilis degeri"). Yalniz taban ayar biliniyor; motor
// burada yok. Sapma riski olan her yerde kural ya hic kurulmuyor ya da o alan
// adi disarida birakiliyor, o sayfalar eski zaman uyumsuz yola dusuyor:
//   - zamanlama acik ya da gecici gecersiz kilma suruyor: kural yok
//   - site kurali (kendi dilimi/dili olabilir): o alan adi haric
//   - site modu 'only': yalniz listedekiler; 'except': listedekiler haric
// Uzantinin kapali oldugu siteye sahte deger GITMEMELI, en onemlisi bu.
var GNM_BOOT_TZ = /^[A-Za-z0-9_+\-\/]{1,64}$/;
var GNM_BOOT_LOCALE = /^[A-Za-z0-9\-]{2,35}$/;

function gnmDomain(p) {
  return String(p || '').trim().toLowerCase().replace(/^\*\./, '').replace(/[:/].*$/, '');
}

function gnmBootRule(cfg, now) {
  if (!cfg || !cfg.enabled) return null;
  if (cfg.schedule && cfg.schedule.on) return null;
  var ov = cfg.override;
  if (ov && (ov.until === 'browser' || now < ov.expiresAt)) return null;

  var tz = GNM_BOOT_TZ.test(cfg.timeZone || '') ? cfg.timeZone : '';
  var locale = cfg.localeSpoof !== false && GNM_BOOT_LOCALE.test(cfg.locale || '') ? cfg.locale : '';
  if (!tz && !locale) return null;

  var own = (cfg.siteProfiles || []).map(function (r) { return gnmDomain(r.pattern); }).filter(Boolean);
  var listed = (cfg.siteList || []).map(gnmDomain).filter(Boolean);
  var mode = cfg.siteMode || 'all';
  var condition = { resourceTypes: ['main_frame', 'sub_frame'] };
  if (mode === 'only') {
    var only = listed.filter(function (d) { return own.indexOf(d) < 0; });
    if (!only.length) return null;
    condition.requestDomains = only;
    if (own.length) condition.excludedRequestDomains = own;
  } else {
    var out = mode === 'except' ? listed.concat(own) : own;
    if (out.length) condition.excludedRequestDomains = out;
  }
  return {
    id: GNM_BOOT_RULE_ID,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      // append: sitenin kendi Server-Timing kayitlari silinmesin
      responseHeaders: [{ header: 'Server-Timing', operation: 'append',
        value: 'gnm;desc="' + tz + '|' + locale + '"' }]
    },
    condition: condition
  };
}

function gnmSyncBoot(cfg) {
  if (!chrome.declarativeNetRequest || !chrome.declarativeNetRequest.updateDynamicRules) return;
  var rule = gnmBootRule(cfg, Date.now());
  gnmUpdateRules([GNM_BOOT_RULE_ID], rule ? [rule] : [], 'boot');
}

function gnmSyncTracking(cfg) {
  if (!chrome.declarativeNetRequest || !chrome.declarativeNetRequest.updateDynamicRules) return;
  var on = !!(cfg && cfg.enabled);
  var rules = [];
  if (on && cfg.gpc !== false) {
    rules.push({
      id: GNM_GPC_RULE_ID,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [{ header: 'Sec-GPC', operation: 'set', value: '1' }]
      },
      condition: {
        urlFilter: '*',
        resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest', 'script',
          'stylesheet', 'image', 'font', 'media', 'ping', 'other']
      }
    });
  }
  gnmUpdateRules([GNM_GPC_RULE_ID], rules, 'gpc');

  var strip = [];
  if (on && cfg.stripParams !== false) {
    gnmStripRegexes().forEach(function (re, i) {
      strip.push({
        id: GNM_STRIP_RULE_ID + i,
        priority: 1,
        action: {
          type: 'redirect',
          redirect: { transform: { queryTransform: { removeParams: GNM_TRACK_PARAMS.slice() } } }
        },
        condition: {
          regexFilter: re,
          resourceTypes: ['main_frame', 'sub_frame']
        }
      });
    });
  }
  gnmUpdateRules(gnmStripRuleIds(), strip, 'strip');
}

// --- ortak ----------------------------------------------------------------

function gnmSync(reason) {
  chrome.storage.local.get('config', function (r) {
    gnmSwallow();
    var cfg = (r && r.config) || null;
    var on = !!(cfg && cfg.enabled);

    gnmLog('sync', {
      reason: reason || 'bilinmiyor',
      enabled: on,
      siteMode: cfg && cfg.siteMode,
      privacy: cfg && cfg.privacy,
      exact: !!(cfg && cfg.exact),
      tz: cfg && cfg.timeZone,
      locale: cfg && cfg.locale
    });

    var badge = !cfg || cfg.badge !== false;
    chrome.action.setBadgeText({ text: on && badge ? 'ON' : '' }, gnmSwallow);
    chrome.action.setBadgeBackgroundColor({ color: '#7C3AED' }, gnmSwallow);

    gnmSyncLanguage(cfg);
    gnmSyncBoot(cfg);
    gnmSyncWebRTC(cfg);
    gnmSyncNetwork(cfg);
    gnmSyncTracking(cfg);
  });
}

chrome.runtime.onInstalled.addListener(function (d) {
  gnmLog('installed', { reason: d && d.reason, version: chrome.runtime.getManifest().version });
  gnmSync('installed');
});

chrome.runtime.onStartup.addListener(function () {
  // "Tarayıcı kapanana kadar" seçilen geçici konum burada bitiyor.
  // Zamanlayıcı yok, açılışta bir kez bakıyoruz.
  chrome.storage.local.get('config', function (r) {
    var cfg = r && r.config;
    if (cfg && cfg.override && cfg.override.until === 'browser') {
      cfg.override = null;
      chrome.storage.local.set({ config: cfg }, function () {
        gnmSwallow();
        gnmLog('override.expired', { reason: 'browser restart' });
        gnmSync('startup');
      });
      return;
    }
    gnmSync('startup');
  });
});

chrome.storage.onChanged.addListener(function (changes, area) {
  if (area !== 'local' || !changes.config) return;
  var before = changes.config.oldValue || {};
  var after = changes.config.newValue || {};
  var changed = Object.keys(after).filter(function (k) {
    return JSON.stringify(before[k]) !== JSON.stringify(after[k]);
  });
  gnmLog('config.changed', { keys: changed });
  gnmSync('config.changed');
});
