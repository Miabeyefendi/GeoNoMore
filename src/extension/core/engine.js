// GeoNoMore konum motoru.
// Saf fonksiyon: position(config, now, origin). Zamanlayıcı, ağ isteği, yan etki yok.
// Popup, options, içerik betiği, ileride walking mode hep buradan geçer.
// Başka hiçbir yerde koordinat hesabı olmayacak.

// Sayfaya satır içi <script> olarak enjekte edilebilmesi için bu bir ADLI
// FONKSİYON, IIFE değil: bridge.js `gnmEngineFactory.toString()` ile kaynağını
// alıp sayfaya gömüyor. Dışarıdan hiçbir değişkene bakmamalı, yoksa gömülünce
// tanımsız kalır.
function gnmEngineFactory() {
  'use strict';

  // Gizlilik seviyesine göre [iç yarıçap, dış yarıçap], metre.
  // Bildirilen nokta bu halkanın içinde bir yerdedir, merkez asla verilmez.
  var ZONES = {
    low: [150, 500],
    medium: [500, 1500],
    high: [1200, 4000]
  };

  // Hareket profilleri: varsayılan hız (km/sa) ve bekleme (saniye).
  // Kullanıcı ikisini de elle ezebiliyor.
  var MOTION = {
    walking:    { speed: 5,   pause: 20 },
    running:    { speed: 11,  pause: 5  },
    cycling:    { speed: 18,  pause: 15 },
    commuting:  { speed: 30,  pause: 45 },
    driving:    { speed: 50,  pause: 60 },
    train:      { speed: 100, pause: 90 },
    flight:     { speed: 800, pause: 0  },
    stationary: { speed: 0,   pause: 0  }
  };

  // Bir profilin taşıdığı alanlar. Site kuralı ve geçici geçersiz kılma
  // bunların yalnız tanımladıklarını ezer, gerisi tabandan gelir.
  var PROFILE_KEYS = ['lat', 'lon', 'privacy', 'exact', 'zone', 'timeZone', 'locale'];

  function hostOf(origin) {
    return String(origin || '')
      .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
      .replace(/[:/?#].*$/, '')
      .toLowerCase();
  }

  // "google.com" ve "*.google.com" aynı şeydir: alan adının kendisi ve alt alanları.
  function matches(host, pattern) {
    var p = String(pattern || '').trim().toLowerCase().replace(/^\*\./, '');
    if (!p) return false;
    return host === p || (host.length > p.length && host.slice(-(p.length + 1)) === '.' + p);
  }

  function apply(target, source) {
    for (var i = 0; i < PROFILE_KEYS.length; i++) {
      var k = PROFILE_KEYS[i];
      if (source[k] !== undefined && source[k] !== null && source[k] !== '') target[k] = source[k];
    }
    return target;
  }

  // Hangi profil geçerli: taban ayar, üstüne site kuralı, en üste geçici geçersiz kılma.
  function resolve(cfg, now, origin) {
    var host = hostOf(origin);
    var out = {};
    for (var i = 0; i < PROFILE_KEYS.length; i++) out[PROFILE_KEYS[i]] = cfg[PROFILE_KEYS[i]];

    // Zamanlama tabanı ezer: "08:30 Work" dediysen o saatten sonra Work profili.
    var scheduled = scheduleAt(cfg, now);
    if (scheduled) apply(out, scheduled.profile);

    // Hareket onun da üstüne biner; site kuralı ve geçici kılma en üstte,
    // yani bir siteye sabit konum verirsen hareket oraya karışmaz.
    var moved = motionAt(cfg.motion, now);
    if (moved) {
      out.lat = moved.lat;
      out.lon = moved.lon;
      out.speed = moved.speed;
      out.heading = moved.heading;
    }

    // En uzun desen kazanır: "mail.google.com" kuralı "google.com" kuralını yener.
    var rules = cfg.siteProfiles || [];
    var best = null;
    for (var j = 0; j < rules.length; j++) {
      if (!matches(host, rules[j].pattern)) continue;
      if (!best || String(rules[j].pattern).length > String(best.pattern).length) best = rules[j];
    }
    if (best) apply(out, best);

    var ov = cfg.override;
    var live = ov && (ov.until === 'browser' || now < ov.expiresAt);
    if (live && (!ov.host || ov.host === host)) apply(out, ov);

    return out;
  }

  // --- zamanlama -----------------------------------------------------------
  // Yine zamanlayıcı yok: "şu an hangi girdi geçerli" saatin fonksiyonu.
  //
  // Gün ve saat hesabı Date ya da Intl kullanmıyor. Sebep: bu motor sayfanın
  // dünyasında da çalışıyor ve orada ikisini de biz yamalamış oluyoruz, kendi
  // yamamızı okursak döngüye gireriz. Onun yerine options sayfası kaydederken
  // kullanıcının UTC farkını (schedule.offset, dakika) yazıyor, burada düz
  // aritmetik yapıyoruz.

  function scheduleAt(cfg, now) {
    var sch = cfg && cfg.schedule;
    if (!sch || !sch.on) return null;

    // Gün seçilmemiş satır çalışmaz. Boş satırlar arayüzde hazır duruyor;
    // "gün yoksa her gün" saysaydık dokunulmamış satır kendiliğinden devreye girerdi.
    var entries = (sch.entries || []).filter(function (e) {
      return e && e.preset && e.days && e.days.length &&
        /^\d{1,2}:\d{2}$/.test(e.time || '');
    });
    if (!entries.length) return null;

    var t = now + (sch.offset || 0) * 60000;
    var day = Math.floor(t / 86400000);
    var minuteOfDay = Math.floor((t - day * 86400000) / 60000);
    var dow = ((day + 4) % 7 + 7) % 7;          // 1 Ocak 1970 perşembeydi

    // En son başlamış girdiyi ara: bugünden geriye doğru bir hafta.
    var best = null, bestAgo = Infinity;
    for (var back = 0; back < 8; back++) {
      var d = ((dow - back) % 7 + 7) % 7;
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        if (e.days.indexOf(d) === -1) continue;

        var parts = e.time.split(':');
        var start = (+parts[0]) * 60 + (+parts[1]);
        var ago = back * 1440 + (minuteOfDay - start);
        if (ago < 0) continue;                  // bugün henüz başlamamış
        if (ago < bestAgo) { bestAgo = ago; best = e; }
      }
      if (best) break;                          // daha eski günlere bakmaya gerek yok
    }

    if (!best) return null;
    var preset = (cfg.presets || {})[best.preset];
    return preset ? { preset: best.preset, profile: preset } : null;
  }

  // --- hareket -------------------------------------------------------------
  // Zamanlayıcı yok. Konum, "başlangıçtan bu yana geçen süre" ile rota üzerinde
  // nereye denk geliyorsa orası. Arka plan uyusa da, sekme kapansa da doğru
  // yerden devam ediyor. Gerekçe SPEC.md bölüm 0.3.

  var R_EARTH = 6371000;
  var RAD = Math.PI / 180;

  function metres(a, b) {
    var dLat = (b[0] - a[0]) * RAD;
    var dLon = (b[1] - a[1]) * RAD;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function bearing(a, b) {
    var dLon = (b[1] - a[1]) * RAD;
    var y = Math.sin(dLon) * Math.cos(b[0] * RAD);
    var x = Math.cos(a[0] * RAD) * Math.sin(b[0] * RAD) -
      Math.sin(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.cos(dLon);
    return (Math.atan2(y, x) / RAD + 360) % 360;
  }

  // Rota üzerinde `now` anındaki nokta. Hareket yoksa null.
  function motionAt(motion, now) {
    if (!motion || !motion.on) return null;
    var pts = motion.points || [];
    if (pts.length < 2) return null;

    var preset = MOTION[motion.profile] || MOTION.walking;
    var kmh = isFinite(motion.speed) ? motion.speed : preset.speed;
    var pause = isFinite(motion.pause) ? motion.pause : preset.pause;
    if (kmh <= 0) {
      // Duran profil: ilk noktada bekliyor
      return { lat: pts[0][0], lon: pts[0][1], speed: 0, heading: null, at: 0 };
    }

    var mps = (kmh * 1000) / 3600;
    var legs = [];
    var moving = 0;
    for (var i = 0; i < pts.length - 1; i++) {
      var d = metres(pts[i], pts[i + 1]);
      var t = d / mps;
      legs.push({ from: pts[i], to: pts[i + 1], t: t, bearing: bearing(pts[i], pts[i + 1]) });
      moving += t;
    }

    var cycle = moving + pause * pts.length;
    if (!(cycle > 0)) return { lat: pts[0][0], lon: pts[0][1], speed: 0, heading: null, at: 0 };

    var elapsed = Math.max(0, (now - (motion.startedAt || 0)) / 1000);
    var mode = motion.loop || 'loop';
    var t2;
    if (mode === 'once') {
      t2 = Math.min(elapsed, cycle);
    } else if (mode === 'pingpong') {
      // Gidip geliyor: ikinci yarıda zaman geri sarılıyor
      var p = elapsed % (2 * cycle);
      t2 = p <= cycle ? p : 2 * cycle - p;
    } else {
      t2 = elapsed % cycle;
    }

    // "once" kipinde rota bitmişse varılmıştır: son noktada durur.
    // Bu olmadan son anda hız hâlâ yürüyüş hızı görünüyor.
    if (mode === 'once' && elapsed >= cycle) {
      var end = pts[pts.length - 1];
      return { lat: end[0], lon: end[1], speed: 0, heading: legs[legs.length - 1].bearing, at: pts.length - 1 };
    }

    for (var j = 0; j < legs.length; j++) {
      if (t2 < pause) {
        return { lat: legs[j].from[0], lon: legs[j].from[1], speed: 0, heading: legs[j].bearing, at: j };
      }
      t2 -= pause;
      if (t2 <= legs[j].t) {
        var f = legs[j].t > 0 ? t2 / legs[j].t : 0;
        return {
          lat: legs[j].from[0] + (legs[j].to[0] - legs[j].from[0]) * f,
          lon: legs[j].from[1] + (legs[j].to[1] - legs[j].from[1]) * f,
          speed: mps,
          heading: legs[j].bearing,
          at: null                       // duraklamıyor, yolda
        };
      }
      t2 -= legs[j].t;
    }

    var last = pts[pts.length - 1];
    return { lat: last[0], lon: last[1], speed: 0, heading: legs[legs.length - 1].bearing, at: pts.length - 1 };
  }

  // Bu sayfada çalışıyor muyuz. Kararı hem yalıtılmış dünya (bridge) hem de
  // sayfa dünyası (patch) buradan alıyor ki ikisi ayrı düşmesin.
  function activeFor(cfg, origin) {
    if (!cfg || !cfg.enabled) return false;
    var host = hostOf(origin);
    var listed = (cfg.siteList || []).some(function (p) { return matches(host, p); });
    var mode = cfg.siteMode || 'all';
    if (mode === 'only') return listed;
    if (mode === 'except') return !listed;
    return true;
  }

  function zoneOf(profile) {
    var z = profile.zone;
    if (z && isFinite(z.inner) && isFinite(z.outer) && z.outer > z.inner && z.inner >= 0) {
      return [z.inner, z.outer];
    }
    return ZONES[profile.privacy] || ZONES.medium;
  }

  function hash(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }

  // mulberry32: tohumdan deterministik sayı üreteci
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function position(cfg, now, origin) {
    var p = resolve(cfg, now, origin);
    var lat = p.lat, lon = p.lon;

    // Hareket varken hız ve yön de bildiriliyor; sabit konumda ikisi de null.
    // watchPosition dinleyen bir site tutarlı bir iz görüyor.
    var speed = isFinite(p.speed) ? Math.round(p.speed * 100) / 100 : null;
    var heading = isFinite(p.heading) ? Math.round(p.heading * 10) / 10 : null;

    // Bildirilen hassasiyet: normalde bölgeyle uyumlu, istenirse sabit.
    // "50 m hassasiyetle 4 km sapma" çelişkisi site tarafında hemen görünür,
    // o yüzden elle değer vermek kullanıcının bilinçli tercihi.
    var fixedAcc = cfg.accuracyMode === 'custom' && isFinite(cfg.accuracyM) &&
      cfg.accuracyM > 0 ? Math.round(cfg.accuracyM) : 0;

    if (p.exact) {
      return {
        latitude: lat, longitude: lon, accuracy: fixedAcc || 12,
        speed: speed, heading: heading,
        timeZone: p.timeZone, locale: p.locale
      };
    }

    var zone = zoneOf(p);
    var inner = zone[0], outer = zone[1];

    // Tohum: site + gün + merkez. Aynı site aynı gün içinde aynı noktayı görür.
    // Her sorguda zıplayan konum, sabit konumdan daha çok ele verir.
    var period = cfg.jitterPeriod === 'hour' ? 3600000
      : cfg.jitterPeriod === 'fixed' ? 0
      : 86400000;
    var day = period ? Math.floor(now / period) : 0;
    // Tohumda koordinat YOK. Hareket sırasında merkez her an değişiyor;
    // koordinat tohuma girseydi sapma vektörü de her adımda değişir, nokta
    // rota boyunca zıplardı. Böylece sapma sabit kalıp iz düzgün ilerliyor.
    var rnd = rng(hash(hostOf(origin) + '|' + day + '|' + inner + ',' + outer));

    var angle = rnd() * 2 * Math.PI;
    // Halka içinde eşit dağılım için yarıçapın karesinden örnekle
    var r = Math.sqrt(inner * inner + rnd() * (outer * outer - inner * inner));

    // Bilinçli sadelik: düz düzlem yaklaşımı. Birkaç km'de hatası metre altı.
    // Kutuplara yakın enlemlerde bozulmasın diye kosinüs tabandan kırpılıyor.
    var mPerDegLat = 111320;
    var cos = Math.cos((lat * Math.PI) / 180);
    var mPerDegLon = mPerDegLat * Math.max(Math.abs(cos), 0.02);

    var outLat = lat + (r * Math.cos(angle)) / mPerDegLat;
    var outLon = lon + (r * Math.sin(angle)) / mPerDegLon;

    return {
      // 6 hane ~11 cm. Daha fazlası sahte hassasiyet, tuhaf durur.
      latitude: Math.round(Math.max(-90, Math.min(90, outLat)) * 1e6) / 1e6,
      longitude: Math.round(((((outLon + 180) % 360) + 360) % 360 - 180) * 1e6) / 1e6,
      // accuracy zone ile tutarlı olmalı. "50 m hassasiyetle 4 km sapma"
      // çelişkisi site tarafında hemen fark edilir.
      accuracy: fixedAcc || Math.round(outer),
      speed: speed,
      heading: heading,
      timeZone: p.timeZone,
      locale: p.locale
    };
  }

  var api = {
    position: position,
    resolve: resolve,
    zoneOf: zoneOf,
    matches: matches,
    hostOf: hostOf,
    activeFor: activeFor,
    scheduleAt: scheduleAt,
    motionAt: motionAt,
    BY: 'miabeyefendi',
    MOTION: MOTION,
    // Parmak izi katmani ayni tohum uretecini kullaniyor: ayni koken, ayni
    // donem, ayni gurultu. Sayfa iki kez olcup farkli sonuc alirsa gurultunun
    // kendisi imza oluyor.
    hash: hash,
    rng: rng,
    ZONES: ZONES,
    PROFILE_KEYS: PROFILE_KEYS
  };

  return api;
}

if (typeof module === 'object' && module.exports) {
  module.exports = gnmEngineFactory();     // node testi için
} else if (typeof globalThis !== 'undefined') {
  // Yalıtılmış dünya, popup ve options burayı kullanıyor
  // Numaralandirmada gorunmuyor: bu dosya bir gun sayfa dunyasina duserse
  // window'da ad birakmasin.
  Object.defineProperty(globalThis, '__gnmEngine', {
    value: gnmEngineFactory(), writable: true, configurable: true, enumerable: false
  });
}
