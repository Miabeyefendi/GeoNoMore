// Ayar okuma/yazma ve preset yardımcıları. Popup ve options kullanır.
// Arka plan yalnız birkaç alana baktığı için doğrudan storage'dan okuyor.

// Tek yazar. Depo adresleri arayuzde de gorunuyor, ikinci bir kopya tutma.
var GNM_AUTHOR = 'Miabeyefendi';
var GNM_AUTHOR_URL = 'https://github.com/Miabeyefendi';
var GNM_REPO_URL = 'https://github.com/Miabeyefendi/GeoNoMore';

var GNM_DEFAULTS = {
  enabled: false,

  // arayüz
  language: 'en',         // ui/lang/<kod>.json
  theme: 'auto',          // auto | bkz. gnmThemes (ui.js)
  uiMode: 'basic',        // basic | advanced. Options sayfasında hangi sekmeler görünsün

  // konum
  country: 'TR',
  city: 'Istanbul',
  custom: false,          // nokta haritadan ya da aramadan geldiyse true
  lat: 41.0082,
  lon: 28.9784,
  privacy: 'medium',
  exact: false,
  zone: null,             // { inner, outer } metre. null ise gizlilik seviyesi belirler

  // tutarlılık
  timeZone: 'Europe/Istanbul',
  tzAuto: true,
  locale: 'tr-TR',
  localeAuto: true,
  localeSpoof: true,      // navigator.language
  acceptLanguage: true,   // Accept-Language başlığı
  webrtc: true,           // WebRTC yerel IP sızıntısı koruması
  windowName: false,      // window.name'i temizle, siteler arası taşınan alan
  webrtcRelay: false,     // sayfa içinde relay zorla. TURN'süz görüşmeyi bozar
  webrtcBlock: false,     // WebRTC'yi tamamen kapat. Görüntülü görüşmeyi bozar
  localeIntl: true,       // sayı, para, sıralama biçimleri de sahte dili kullansın
  tzDeep: true,           // Date metinleri ve lastModified de profil diliminde

  // siteler
  siteMode: 'all',        // all | only | except
  siteList: [],           // siteMode için desenler
  siteProfiles: [],       // [{ pattern, lat, lon, privacy, exact, timeZone, locale }]

  // Hazır gruplara kullanıcının elle eklediği adresler: { 'Shopping': ['x.com'] }.
  // Grubun kendi listesi sürümle değişiyor, buradaki ekler kalıcı.
  groupExtras: {},

  // geçici geçersiz kılma: { host, exact, privacy, expiresAt } ya da
  // { host, exact, until: 'browser' } (tarayıcı kapanınca arka plan siliyor)
  override: null,

  // hareket. Zamanlayıcı yok: konum startedAt'ten bu yana geçen süreyle
  // rota üzerinde neresi denk geliyorsa orası.
  motion: {
    on: false,
    profile: 'walking',   // walking | cycling | driving | commuting | stationary
    speed: 5,             // km/sa
    pause: 20,            // her noktada beklenen saniye
    loop: 'pingpong',     // once | loop | pingpong
    points: [],           // [[lat, lon], ...]
    startedAt: 0
  },

  // zamanlama. offset: kullanıcının UTC farkı (dakika). Motor Date/Intl
  // kullanamadığı için (sayfada onları biz yamalıyoruz) buradan okuyor.
  schedule: {
    on: false,
    offset: 0,
    entries: []           // [{ days: [1..5], time: '08:30', preset: 'Work' }]
  },

  // benzetilen hareketin geçmişi. Varsayılan KAPALI: gereksiz hassas veri
  // biriktirmenin anlamı yok.
  timeline: false,
  timelineMax: 500,

  // IP tabanlı konum servislerini sayfa içinde yakala
  ipGeo: true,

  // sertleştirme
  harden: true,           // sayfanın açtığı çerçevelere de yamayı taşı
  maskNative: true,       // yamalı fonksiyonlar toString'de yerli görünsün
  denyWhenOff: false,     // kapalıyken gerçek konum yerine "izin yok" de
  workerPatch: true,      // sayfanın açtığı worker'lara da saat dilimi ve dil yaması

  // ağ ve takip (arka plan; tarayıcı geneli, uzantı kapanınca geri verilir)
  noPrediction: true,     // DNS ön çözümleme ve ön yükleme kapalı
  noPing: true,           // <a ping> bildirimleri kapalı
  gpc: true,              // Sec-GPC başlığı ve navigator.globalPrivacyControl
  stripParams: true,      // utm_*, fbclid, gclid... adresten silinir

  // tarayıcıya özel (öteki tarayıcıda arayüzde görünmez, arka plan dokunmaz)
  noSandbox: true,        // yalnız Chrome: Topics, FLEDGE, reklam ölçümü kapalı
  etpAlways: false,       // yalnız Firefox: izleme koruması her pencerede

  // ince ayar
  accuracyMode: 'auto',   // auto: bölgeyle uyumlu | custom: elle
  accuracyM: 50,          // custom seçiliyken bildirilecek hassasiyet (m)
  jitterPeriod: 'day',    // day | hour | fixed. Sapmanın ne sıklıkla yenileneceği

  // Parmak izi katmanı. HEPSİ KAPALI ve öyle kalmalı: gürültü eklemek her zaman
  // gizlemek değil, nadir bir kombinasyon üretirse kullanıcıyı kalabalıktan
  // ayırır. Bunlar ne yaptığını bilenin açacağı ayarlar.
  // Gürültünün tohumu köken artı jitterPeriod, yani sapma aynı gün aynı sitede
  // sabit. Her çağrıda değişen gürültü kendisi imza olurdu.
  fpCanvas: false,
  fpWebgl: false,
  fpAudio: false,
  fpRect: false,
  fpScreen: false,
  fpDevice: false,
  watchInterval: 5,       // watchPosition kaç saniyede bir haber versin
  badge: true,            // araç çubuğu simgesinde ON rozeti
  tiles: 'osm',           // harita karo sunucusu, bkz. gnmTileServers
  // Koyu harita ayri bir sunucu DEGIL, secili sunucunun karolarina uygulanan
  // bir cevirme filtresi. CARTO'nun koyu karolari anahtarsiz kotayi asinca
  // "API key gerekli" yazan bir gorsel donduruyordu.
  darkMap: false,
  tilesCustom: '',        // kullanicinin kendi karo URL'si, {z}/{x}/{y} kalibinda

  // Bellek kipi: sayfa başına düşen işi kısıyor. Çerçeve gözcüsü kurulmuyor,
  // sayfa tarafında kayıt tutulmuyor, log tavanı düşüyor.
  lowMemory: false,

  presets: {},
  activePreset: '',

  // kayıt
  logging: true,          // v3 boyunca açık, sorun ayıklamanın tek yolu
  logVerbose: false,      // watchPosition tikleri, her saat dilimi okuması
  // logVerbose NE KAYDEDILECEGINI, logDetail NE GOSTERILECEGINI belirliyor.
  // Ikisi ayri: kayit her zaman ham tutuluyor, sunum sadelesiyor.
  logDetail: false,       // ham satirlar (kaynak, olay adi, JSON)
  logMax: 1000
};

// Bir presetin taşıdığı alanlar. Site kuralları ve enabled preset'e girmez,
// preset bir konum profilidir, uzantının açık olup olmadığı değil.
var GNM_PRESET_KEYS = [
  'country', 'city', 'custom', 'lat', 'lon',
  'privacy', 'exact', 'zone', 'timeZone', 'tzAuto', 'locale', 'localeAuto'
];

// Home / Work / Travel kullanıcının kendi yerleri, hazır koordinat veremeyiz.
// Boş yuva olarak listede duruyorlar, kullanıcı tek tıkla o anki ayarı içine koyuyor.
var GNM_PRESET_SLOTS = ['Home', 'Work', 'Travel'];

// Hazır alan adı grupları. Sites sekmesinde tek tıkla listeye giriyor.
// Liste dünya geneli: tek bir ülkenin siteleri değil, o alanda nerede olursan ol
// karşına çıkan adresler. Kullanıcının kendi eklediği adresler cfg.groupExtras'ta
// duruyor; bu tablo sürümle değiştiği için ikisi ayrı tutuluyor.
var GNM_DOMAIN_GROUPS = {
  'Social media': ['facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'threads.net',
    'tiktok.com', 'snapchat.com', 'reddit.com', 'linkedin.com', 'pinterest.com',
    'tumblr.com', 'mastodon.social', 'bsky.app', 'vk.com', 'ok.ru', 'weibo.com',
    'douyin.com', 'xiaohongshu.com', 'quora.com', 'nextdoor.com'],

  'Messaging': ['whatsapp.com', 'telegram.org', 'discord.com', 'signal.org',
    'messenger.com', 'line.me', 'kakao.com', 'viber.com', 'wechat.com', 'qq.com',
    'zalo.me', 'imo.im'],

  'Search engines': ['google.com', 'bing.com', 'duckduckgo.com', 'yahoo.com', 'yandex.com',
    'baidu.com', 'ecosia.org', 'startpage.com', 'brave.com', 'naver.com',
    'seznam.cz', 'qwant.com', 'sogou.com'],

  'Maps and navigation': ['google.com', 'openstreetmap.org', 'bing.com', 'here.com',
    'waze.com', 'yandex.com', 'mapquest.com', 'mapy.cz', '2gis.ru', 'komoot.com',
    'alltrails.com', 'strava.com', 'gaiagps.com', 'amap.com', 'baidu.com'],

  'Ride hailing': ['uber.com', 'lyft.com', 'bolt.eu', 'grab.com', 'careem.com',
    'didiglobal.com', 'olacabs.com', 'free-now.com', 'gojek.com', 'cabify.com',
    'bitaksi.com', '99app.com'],

  'Food delivery': ['ubereats.com', 'doordash.com', 'deliveroo.com', 'just-eat.com',
    'justeat.co.uk', 'grubhub.com', 'glovoapp.com', 'yemeksepeti.com', 'getir.com',
    'zomato.com', 'swiggy.in', 'meituan.com', 'ele.me', 'rappi.com', 'ifood.com.br',
    'foodpanda.com', 'wolt.com', 'lieferando.de'],

  'Shopping': ['amazon.com', 'ebay.com', 'aliexpress.com', 'alibaba.com', 'taobao.com',
    'jd.com', 'temu.com', 'shein.com', 'etsy.com', 'walmart.com', 'target.com',
    'bestbuy.com', 'costco.com', 'rakuten.co.jp', 'mercadolibre.com', 'flipkart.com',
    'myntra.com', 'coupang.com', 'noon.com', 'allegro.pl', 'otto.de', 'zalando.com',
    'ozon.ru', 'wildberries.ru', 'trendyol.com', 'hepsiburada.com', 'n11.com'],

  'Travel and stays': ['booking.com', 'airbnb.com', 'expedia.com', 'hotels.com',
    'tripadvisor.com', 'skyscanner.net', 'kayak.com', 'agoda.com', 'trivago.com',
    'vrbo.com', 'hostelworld.com', 'trip.com', 'makemytrip.com', 'despegar.com',
    'omio.com', 'rome2rio.com'],

  'Streaming': ['netflix.com', 'youtube.com', 'spotify.com', 'twitch.tv', 'disneyplus.com',
    'primevideo.com', 'hulu.com', 'max.com', 'paramountplus.com', 'peacocktv.com',
    'crunchyroll.com', 'deezer.com', 'soundcloud.com', 'tidal.com', 'bbc.co.uk',
    'itv.com', 'channel4.com', 'zdf.de', 'ardmediathek.de', 'raiplay.it',
    'bilibili.com', 'iqiyi.com', 'youku.com', 'viu.com', 'hotstar.com',
    'blutv.com', 'exxen.com'],

  'News': ['bbc.com', 'cnn.com', 'nytimes.com', 'washingtonpost.com', 'theguardian.com',
    'reuters.com', 'apnews.com', 'bloomberg.com', 'ft.com', 'aljazeera.com',
    'dw.com', 'france24.com', 'lemonde.fr', 'spiegel.de', 'elpais.com',
    'corriere.it', 'nhk.or.jp', 'asahi.com', 'scmp.com', 'timesofindia.com',
    'globo.com', 'clarin.com', 'hurriyet.com.tr'],

  'Work and files': ['slack.com', 'zoom.us', 'teams.microsoft.com', 'office.com',
    'notion.so', 'atlassian.net', 'github.com', 'gitlab.com', 'asana.com',
    'trello.com', 'figma.com', 'dropbox.com', 'box.com', 'miro.com', 'canva.com',
    'linear.app', 'basecamp.com', 'monday.com', 'clickup.com', 'webex.com'],

  'Banking and payments': ['paypal.com', 'wise.com', 'revolut.com', 'stripe.com',
    'squareup.com', 'klarna.com', 'n26.com', 'monzo.com', 'chase.com',
    'bankofamerica.com', 'hsbc.com', 'santander.com', 'ing.com', 'coinbase.com',
    'binance.com', 'kraken.com', 'bybit.com', 'papara.com'],

  'Dating': ['tinder.com', 'bumble.com', 'hinge.co', 'okcupid.com', 'badoo.com',
    'grindr.com', 'happn.com', 'match.com', 'pof.com', 'meetic.com', 'jaumo.com',
    'tantan.com'],

  'Jobs and housing': ['indeed.com', 'linkedin.com', 'glassdoor.com', 'monster.com',
    'seek.com.au', 'stepstone.de', 'kariyer.net', 'zillow.com', 'redfin.com',
    'realtor.com', 'rightmove.co.uk', 'zoopla.co.uk', 'immobilienscout24.de',
    'idealista.com', 'sahibinden.com', 'craigslist.org', 'gumtree.com'],

  'Weather': ['weather.com', 'accuweather.com', 'wunderground.com', 'met.no',
    'metoffice.gov.uk', 'meteofrance.com', 'windy.com', 'yr.no', 'mgm.gov.tr',
    'weather.gov', 'foreca.com'],

  'Gaming': ['steampowered.com', 'epicgames.com', 'ea.com', 'ubisoft.com',
    'battle.net', 'roblox.com', 'xbox.com', 'playstation.com', 'nintendo.com',
    'itch.io', 'gog.com', 'riotgames.com']
};

var GNM_BUILTIN_PRESETS = {
  'High Privacy': { privacy: 'high', exact: false, zone: null },
  'Precise Location': { exact: true }
};

function gnmGet(cb) {
  chrome.storage.local.get('config', function (r) {
    var cfg = Object.assign({}, GNM_DEFAULTS, r && r.config);
    // v5.1'e kadar tema yalnız 'dark' ya da 'light' idi. Adlandırılmış temalara
    // geçildi; eski kayıt aynı görünümün karşılığına taşınıyor. Tek okuma yolu
    // burası olduğu için göç de burada, ayrı bir sürüm alanı tutmuyoruz.
    if (cfg.theme === 'dark') cfg.theme = 'slate';
    else if (cfg.theme === 'light') cfg.theme = 'mist';
    // Süresi dolmuş geçersiz kılmayı okurken düşür, zamanlayıcıya gerek yok.
    // 'browser' kapsamlısını arka plan onStartup'ta siliyor, saate bakmıyoruz.
    if (cfg.override && cfg.override.until !== 'browser' &&
        Date.now() >= cfg.override.expiresAt) cfg.override = null;
    cb(cfg);
  });
}

function gnmSet(patch, cb) {
  gnmGet(function (cfg) {
    chrome.storage.local.set({ config: Object.assign(cfg, patch) }, function () {
      if (cb) cb(cfg);
    });
  });
}

function gnmPresetFrom(cfg) {
  var out = {};
  GNM_PRESET_KEYS.forEach(function (k) { out[k] = cfg[k]; });
  return out;
}

function gnmAllPresets(cfg) {
  return Object.assign({}, GNM_BUILTIN_PRESETS, cfg.presets);
}

// Bir grubun bugünkü üyeleri: hazır liste artı kullanıcının eklediği adresler.
function gnmGroupMembers(cfg, name) {
  var extra = ((cfg && cfg.groupExtras) || {})[name] || [];
  var out = (GNM_DOMAIN_GROUPS[name] || []).slice();
  extra.forEach(function (d) { if (out.indexOf(d) === -1) out.push(d); });
  return out;
}
