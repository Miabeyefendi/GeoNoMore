// Arayüz ortakları: dil, tema ve ülke/bölge/yer listesi.
// Popup ile options aynı yerden besleniyor, ikisinde ayrı kopya durmasın.
//
// chrome.i18n kullanmıyoruz. O, dili tarayıcının diline göre kendisi seçiyor;
// biz kullanıcının seçtiği dili istiyoruz. Her dil ayrı dosyada: ui/lang/<kod>.json

var GNM_LANGS = [
  { code: 'en', name: 'English' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'es', name: 'Español' },
  { code: 'ru', name: 'Русский' },
  { code: 'zh', name: '中文' }
];

// Yeni dil eklemek: ui/lang/<kod>.json dosyasını en.json'un anahtarlarıyla
// oluştur, üstteki listeye bir satır ekle. Başka yerde değişiklik gerekmiyor.
// test-lang.js eksik ya da fazla anahtarı ve kaybolan yer tutucuyu yakalıyor.

var GNM_STRINGS = {};

function T(key) {
  return Object.prototype.hasOwnProperty.call(GNM_STRINGS, key) ? GNM_STRINGS[key] : key;
}

function gnmLoadLang(code, done) {
  var known = GNM_LANGS.some(function (l) { return l.code === code; });
  var use = known ? code : 'en';

  fetch(chrome.runtime.getURL('ui/lang/' + use + '.json'))
    .then(function (r) { return r.json(); })
    .then(function (map) {
      GNM_STRINGS = map;
      done();
    })
    .catch(function () {
      // Dosya bozuk ya da yoksa anahtarlar görünür, arayüz yine de açılır
      GNM_STRINGS = {};
      done();
    });
}

function gnmApplyStrings(root) {
  var el = root || document;
  el.querySelectorAll('[data-i18n]').forEach(function (n) {
    n.textContent = T(n.dataset.i18n);
  });
  el.querySelectorAll('[data-i18n-ph]').forEach(function (n) {
    n.placeholder = T(n.dataset.i18nPh);
  });
  el.querySelectorAll('[data-i18n-title]').forEach(function (n) {
    n.title = T(n.dataset.i18nTitle);
    // Ici tek isaret ya da simge olan dugmenin adi title'dan gelir: yoksa
    // ekran okuyucu (?) dugmesini "soru isareti" diye okuyor, aciklamayi degil.
    if (n.tagName === 'BUTTON' && n.textContent.trim().length <= 1) {
      n.setAttribute('aria-label', n.title);
    }
  });
}

// --- tema -----------------------------------------------------------------
// Renkler CSS'te, burada yalnız hangi temanın koyu olduğu yazıyor. Bu bilgi tek
// bir yerde gerekiyor: "otomatik" seçiliyken sistem koyuysa hangi temaya
// düşeceğimiz. Yeni tema eklemek CSS'e bir blok, buraya bir satır, dil
// dosyalarına bir ad demek; kodun geri kalanı değişmiyor.

var GNM_THEMES = [
  { id: 'ink', dark: true },
  { id: 'paper', dark: false },
  { id: 'slate', dark: true },
  { id: 'indigo', dark: true },
  { id: 'brick', dark: true },
  { id: 'mist', dark: false },
  { id: 'carbon', dark: false },
  { id: 'moss', dark: false },
  { id: 'vcrimson', dark: true },
  { id: 'vgreenify', dark: true },
  { id: 'volive', dark: true },
  { id: 'vteal', dark: false },
  { id: 'vwhite', dark: false },
  { id: 'vlavender', dark: false },
  { id: 'vmidnight', dark: true },
  { id: 'vrose', dark: false },
  { id: 'vblack', dark: true },
  { id: 'vindigo', dark: false }
];



var GNM_THEME_DARK = 'ink';
var GNM_THEME_LIGHT = 'paper';

// --- koruma sayaci ----------------------------------------------------------
// Kimlik seridi ve popup "N koruma acik" diyor. Basic kipte bu ayarlarin
// sekmesi gizli; sayac kullaniciya gormedigi seyin calistigini soyluyor.
// Varsayilanlar options.js renderConsistency() ile ayni: ilk liste
// varsayilan acik (!== false), ikincisi varsayilan kapali (=== true).
var GNM_PROT_ON = ['webrtc', 'harden', 'maskNative', 'localeSpoof', 'localeIntl',
  'acceptLanguage', 'tzDeep', 'ipGeo', 'workerPatch', 'noPrediction', 'noPing', 'gpc',
  'stripParams'];
var GNM_PROT_OFF = ['webrtcRelay', 'webrtcBlock', 'windowName', 'denyWhenOff',
  'fpCanvas', 'fpWebgl', 'fpAudio', 'fpRect', 'fpScreen', 'fpDevice'];

// Tarayıcıya özel korumalar: yalnız o tarayıcıda sayılır. Değer, varsayılanı
// açık mı (true) kapalı mı (false).
var GNM_PROT_ONLY = {
  noSandbox: { browser: 'chromium', on: true },
  etpAlways: { browser: 'firefox', on: false }
};

function gnmProtCount(cfg) {
  var n = 0;
  GNM_PROT_ON.forEach(function (k) { if (cfg[k] !== false) n++; });
  GNM_PROT_OFF.forEach(function (k) { if (cfg[k] === true) n++; });
  var here = typeof gnmBrowser === 'function' ? gnmBrowser() : 'chromium';
  Object.keys(GNM_PROT_ONLY).forEach(function (k) {
    var p = GNM_PROT_ONLY[k];
    if (p.browser !== here) return;
    if (p.on ? cfg[k] !== false : cfg[k] === true) n++;
  });
  return n;
}

function gnmThemeKnown(id) {
  for (var i = 0; i < GNM_THEMES.length; i++) {
    if (GNM_THEMES[i].id === id) return true;
  }
  return false;
}

var GNM_SYSTEM_DARK = null;

function gnmApplyTheme(theme) {
  var resolved = theme;

  if (!gnmThemeKnown(theme)) {
    if (!GNM_SYSTEM_DARK && window.matchMedia) {
      GNM_SYSTEM_DARK = window.matchMedia('(prefers-color-scheme: dark)');
      // Sistem teması değişince, seçim "otomatik" kaldığı sürece takip et
      GNM_SYSTEM_DARK.addEventListener('change', function () {
        if (document.documentElement.dataset.themeMode === 'auto') gnmApplyTheme('auto');
      });
    }
    resolved = GNM_SYSTEM_DARK && GNM_SYSTEM_DARK.matches ? GNM_THEME_DARK : GNM_THEME_LIGHT;
    document.documentElement.dataset.themeMode = 'auto';
  } else {
    document.documentElement.dataset.themeMode = theme;
  }

  document.documentElement.setAttribute('data-theme', resolved);
}

// --- konum listesi --------------------------------------------------------
// Veri iki katmanlı: 192 ülke (başkent koordinatı ve saat dilimi adayları) ve
// bazı ülkeler için elle girilmiş şehirler. Listede olmayan her yer için
// gnmGeoSearch var; dünyadaki her şehri dosyaya yazmanın anlamı yok.

function gnmGeoCountryCodes(data) {
  return Object.keys(data.countries);
}

// Bir ülkenin seçilebilir yerleri. Şehir listesi yoksa tek seçenek başkenttir,
// adı da ülkenin adıdır.
function gnmGeoPlaces(data, code) {
  var country = data.countries[code];
  if (!country) return [];
  var list = data.places[code];
  if (list && list.length) {
    return list.map(function (p) {
      return { name: p[0], lat: p[1], lon: p[2], tz: p[3] || null };
    });
  }
  return [{ name: country.name, lat: country.lat, lon: country.lon, tz: null }];
}

function gnmGeoPlace(data, code, name) {
  var list = gnmGeoPlaces(data, code);
  return list.filter(function (p) { return p.name === name; })[0] || list[0] || null;
}

// Bir saat diliminin verilen andaki UTC farkı, saat cinsinden
function gnmTzOffsetHours(tz, when) {
  try {
    var parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
      .formatToParts(when || new Date());
    var name = parts.filter(function (p) { return p.type === 'timeZoneName'; })[0].value;
    var m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
    if (!m) return 0;                                  // düz "GMT" = 0
    return (m[1] === '-' ? -1 : 1) * (+m[2] + (+(m[3] || 0)) / 60);
  } catch (e) {
    return 0;
  }
}

// Dilimin standart (yaz saatsiz) farkı. Yaz saati saati hep ileri aldığı için
// yılın iki ucundan küçük olan standart olandır.
//
// Bunu kullanmak şart: ağustosta Los Angeles UTC-7'ye çıkıyor ve boylamına
// göre Anchorage'dan (UTC-8) daha uzak görünüyor, seçim yanlış dilime kayıyor.
function gnmTzStandardOffset(tz) {
  var y = new Date().getUTCFullYear();
  return Math.min(
    gnmTzOffsetHours(tz, new Date(Date.UTC(y, 0, 15))),
    gnmTzOffsetHours(tz, new Date(Date.UTC(y, 6, 15)))
  );
}

// Çok saat dilimli ülkelerde (US, RU, CA, BR, AU...) hangisi geçerli.
// Yerin kendi dilimi varsa o. Enlem de verildiyse ülkenin referans
// noktalarından (geo-data tzAnchors) en yakınının dilimi: boylam tek başına
// Arizona'yı, Kaliningrad'ı, Kanarya'yı, Perth ile Adelaide sınırını
// tutturamıyordu. Enlem yoksa ya da ülkenin noktası yoksa boylam sezgisi.
function gnmGeoTz(data, code, lon, placeTz, lat) {
  if (placeTz) return placeTz;
  var country = data.countries[code];
  if (!country || !country.tz.length) return 'UTC';
  if (country.tz.length === 1) return country.tz[0];

  var anchors = data.tzAnchors && data.tzAnchors[code];
  if (anchors && anchors.length && isFinite(lat) && isFinite(lon)) {
    // Kısa mesafede düzlem yaklaşımı yeter; boylam farkı enleme göre daralıyor
    var k = Math.cos(lat * Math.PI / 180);
    var near = null, nearD = Infinity;
    anchors.forEach(function (a) {
      var dLon = Math.abs(lon - a[2]);
      if (dLon > 180) dLon = 360 - dLon;
      var dx = dLon * k, dy = lat - a[1];
      var d = dx * dx + dy * dy;
      if (d < nearD) { nearD = d; near = a[0]; }
    });
    if (near) return near;
  }

  // Listenin ilki başkentin dilimi. Boylam sezgisi kıl payı farklarda yanılıyor
  // (Ulaanbaatar 106.9 boylamda ama saati +8, Hovd +7 daha yakın çıkıyor),
  // o yüzden ilkini geçmek için en az bir saatlik belirgin fark aranıyor.
  var MARGIN = 1;
  var want = lon / 15;
  var head = Math.abs(gnmTzStandardOffset(country.tz[0]) - want);

  var best = country.tz[0], bestDiff = head;
  country.tz.forEach(function (tz) {
    var diff = Math.abs(gnmTzStandardOffset(tz) - want);
    if (diff < bestDiff && diff < head - MARGIN) { bestDiff = diff; best = tz; }
  });
  return best;
}

// Seçim değiştiğinde geçerli olmayan alt seçimi düzeltip kaydedilecek yamayı üretir
function gnmGeoNormalize(data, cfg, next) {
  var code = data.countries[next.country] ? next.country : gnmGeoCountryCodes(data)[0];
  var place = gnmGeoPlace(data, code, next.city);

  var out = {
    country: code,
    city: place.name,
    lat: place.lat,
    lon: place.lon,
    custom: false,
    activePreset: ''
  };
  if (cfg.tzAuto) out.timeZone = gnmGeoTz(data, code, place.lon, place.tz, place.lat);
  if (cfg.localeAuto) out.locale = data.countries[code].locale;
  return out;
}

// Kayıtlı seçim veriyle uyuşuyor mu. Uyuşmuyorsa (eski sürümden kalma ad,
// listeden çıkmış bir yer) düzeltilmiş yamayı döndürür, uyuşuyorsa null.
//
// Bu kontrol olmadan çizim geçersiz seçimde patlıyor ve altındaki her şey
// boş kalıyor. Tek giriş noktası burası, iki sayfa da yüklenirken çağırıyor.
function gnmGeoFix(data, cfg) {
  var country = data.countries[cfg.country];
  var known = country && gnmGeoPlaces(data, cfg.country).some(function (p) {
    return p.name === cfg.city;
  });
  // Haritadan ya da aramadan gelen noktanın listede karşılığı olmak zorunda değil
  if (country && (known || cfg.custom)) return null;

  var patch = gnmGeoNormalize(data, cfg, cfg);
  delete patch.activePreset;              // onarım hazır ayarı bozmasın
  if (cfg.custom && country) {
    delete patch.lat;                     // koordinat korunur, yalnız etiket düzelir
    delete patch.lon;
    patch.custom = true;
  }
  return patch;
}

// --- adres arama ----------------------------------------------------------
// OpenStreetMap Nominatim. Anahtar istemiyor, karoları zaten oradan alıyoruz.
// Aranan metin OSM sunucusuna gidiyor; arayüzde bu açıkça yazılı.
// Bilinçli sadelik: sonuç önbelleği yok, kullanıcı saniyede bir arama yapmıyor.

function gnmGeoSearch(query, done) {
  var url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1' +
    '&limit=8&q=' + encodeURIComponent(query);

  fetch(url, { headers: { Accept: 'application/json' } })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (rows) {
      done(null, (rows || []).map(function (r) {
        return {
          label: r.display_name,
          lat: parseFloat(r.lat),
          lon: parseFloat(r.lon),
          country: ((r.address && r.address.country_code) || '').toUpperCase()
        };
      }).filter(function (r) { return isFinite(r.lat) && isFinite(r.lon); }));
    })
    .catch(function (e) { done(e); });
}

// Karo sunucusu engellediğinde haritanın ortasına açıklama koyuyor.
// map.js'in dile erişimi yok, metin buradan geliyor.
function gnmMapBlocked(el, status) {
  if (el.querySelector('.map-note')) return;
  var note = document.createElement('div');
  note.className = 'map-note';
  note.textContent = T('mapBlocked');
  el.appendChild(note);
  if (typeof GNM_LOG !== 'undefined') GNM_LOG.add('ui', 'map.blocked', { status: status });
}

// Mobil mi. Genişliğe bakmıyoruz: masaüstünde popup penceresi 280 px ve dar
// ekran kuralları oraya da uyuyor. İki şart birden aranıyor, ikisi de masaüstünde
// yanlış çıkıyor. Dokunmatik ekranlı masaüstünde fare olduğu için pointer ince
// kalıyor, o yüzden yanlış pozitif vermiyor.
function gnmMarkDevice() {
  var coarse = false;
  try { coarse = matchMedia('(pointer: coarse)').matches; } catch (e) { /* eski motor */ }
  var mobileUA = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  if (coarse && mobileUA) document.documentElement.classList.add('is-mobile');
}

if (typeof document !== 'undefined') gnmMarkDevice();

// --- tarayıcı ----------------------------------------------------------------
// Chrome ile Firefox ayrı tasarlanıyor ama kaynak tek: tarayıcıya özel bir
// özellik, API'si var mı diye bakılarak açılır. Kullanıcı aracısı (UA)
// okunmaz, "isFirefox" dalı yazılmaz. Arayüzdeki tek ayrım bu işaret:
// <html data-browser="firefox|chromium">, CSS de [data-only] öğeleri buna göre
// gösteriyor. browser.runtime.getBrowserInfo yalnız Firefox'ta var.
function gnmBrowser() {
  try {
    if (typeof browser !== 'undefined' && browser.runtime &&
      typeof browser.runtime.getBrowserInfo === 'function') return 'firefox';
  } catch (e) { /* yoksay */ }
  return 'chromium';
}

// Öğe bu tarayıcıda gösteriliyor mu: kendisi ya da bir atası data-only taşıyorsa
// o değer tarayıcıyla aynı olmalı.
function gnmShownHere(el) {
  var o = el && el.closest ? el.closest('[data-only]') : null;
  return !o || o.getAttribute('data-only') === gnmBrowser();
}

if (typeof document !== 'undefined') document.documentElement.setAttribute('data-browser', gnmBrowser());
