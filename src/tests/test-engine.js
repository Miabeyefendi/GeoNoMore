// Konum motorunun kendi kendini denetlemesi. Çerçeve yok, bağımlılık yok.
//   node test-engine.js
// Motor src/extension içinden okunuyor, tek kaynak orası (bkz. proje notlari).

const assert = require('assert');
const E = require('../extension/core/engine.js');

const R = 6371000;
function meters(a, b) {
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.lat);
  const dLon = toRad(b.longitude - a.lon);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const base = {
  lat: 40.9903, lon: 29.0250,
  privacy: 'medium', exact: false, zone: null,
  timeZone: 'Europe/Istanbul', locale: 'tr-TR',
  siteProfiles: [], override: null
};
const NOW = Date.UTC(2026, 7, 21, 12, 0, 0);
const DAY = 86400000;
const with_ = patch => Object.assign({}, base, patch);

// 1. Aynı site, aynı gün, aynı ayar: aynı nokta.
{
  const a = E.position(base, NOW, 'https://a.com');
  const b = E.position(base, NOW + 3600000, 'https://a.com');
  assert.deepStrictEqual(a, b, 'aynı gün içinde konum değişmemeli');
  // Aynı alan adının farklı şeması / yolu da aynı noktayı görmeli
  assert.deepStrictEqual(E.position(base, NOW, 'http://a.com:8080'), a, 'host aynıysa nokta aynı olmalı');
}

// 2. Farklı site farklı nokta, farklı gün farklı nokta.
{
  const a = E.position(base, NOW, 'https://a.com');
  assert.notDeepStrictEqual(a, E.position(base, NOW, 'https://b.com'), 'site başına ayrışmalı');
  assert.notDeepStrictEqual(a, E.position(base, NOW + DAY, 'https://a.com'), 'gün başına ayrışmalı');
}

// 3. Bildirilen nokta halkanın içinde: merkeze iç yarıçaptan yakın olmamalı,
//    dış yarıçaptan uzak olmamalı. Her seviye, çok sayıda site ile.
for (const [level, [inner, outer]] of Object.entries(E.ZONES)) {
  const cfg = with_({ privacy: level });
  for (let i = 0; i < 500; i++) {
    const p = E.position(cfg, NOW, 'https://site' + i + '.example');
    const d = meters(cfg, p);
    assert.ok(d >= inner - 1, `${level}: ${d.toFixed(1)} m iç yarıçapın (${inner}) içinde kaldı`);
    assert.ok(d <= outer + 1, `${level}: ${d.toFixed(1)} m dış yarıçapı (${outer}) aştı`);
    assert.strictEqual(p.accuracy, outer, 'accuracy dış yarıçapla aynı olmalı');
  }
}

// 4. Exact modda nokta hiç kaydırılmaz.
{
  const p = E.position(with_({ exact: true }), NOW, 'https://a.com');
  assert.strictEqual(p.latitude, base.lat);
  assert.strictEqual(p.longitude, base.lon);
}

// 5. Saat dilimi ve dil profilden aynen geçer.
{
  const p = E.position(base, NOW, 'https://a.com');
  assert.strictEqual(p.timeZone, 'Europe/Istanbul');
  assert.strictEqual(p.locale, 'tr-TR');
}

// 6. Kutba yakın enlemde boylam patlamamalı, mesafe yine halkada kalmalı.
{
  const cfg = with_({ lat: 82.5, lon: 12.0, privacy: 'high' });
  for (let i = 0; i < 200; i++) {
    const p = E.position(cfg, NOW, 'https://polar' + i + '.example');
    assert.ok(isFinite(p.latitude) && isFinite(p.longitude), 'kutupta sayı bozuldu');
    assert.ok(p.longitude >= -180 && p.longitude <= 180, 'boylam aralık dışına çıktı');
    assert.ok(p.latitude >= -90 && p.latitude <= 90, 'enlem aralık dışına çıktı');
  }
}

// 7. Tarih çizgisinin dibinde boylam sarmalı, -180..180 dışına taşmamalı.
{
  const cfg = with_({ lat: -16.5, lon: 179.9987, privacy: 'high' });
  for (let i = 0; i < 200; i++) {
    const p = E.position(cfg, NOW, 'https://fiji' + i + '.example');
    assert.ok(p.longitude >= -180 && p.longitude <= 180, 'boylam sarmadı: ' + p.longitude);
  }
}

// 8. Desen eşleşmesi: alan adının kendisi ve alt alanları, başka bir şey değil.
{
  assert.ok(E.matches('google.com', 'google.com'));
  assert.ok(E.matches('mail.google.com', 'google.com'));
  assert.ok(E.matches('mail.google.com', '*.google.com'));
  assert.ok(!E.matches('notgoogle.com', 'google.com'), 'son ek benzerliği eşleşme sayılmamalı');
  assert.ok(!E.matches('google.com.tr', 'google.com'), 'farklı TLD eşleşmemeli');
  assert.ok(!E.matches('google.com', ''), 'boş desen hiçbir şeye uymamalı');
}

// 9. Site kuralı: en uzun desen kazanır, eşleşmeyen site tabanı kullanır.
{
  const cfg = with_({
    siteProfiles: [
      { pattern: 'google.com', privacy: 'high' },
      { pattern: 'mail.google.com', exact: true },
      { pattern: 'ornek.com', lat: 39.9179, lon: 32.8627, timeZone: 'Europe/Berlin' }
    ]
  });

  assert.strictEqual(E.resolve(cfg, NOW, 'https://www.google.com').privacy, 'high',
    'alt alan üst kuralı almalı');
  assert.strictEqual(E.resolve(cfg, NOW, 'https://mail.google.com').exact, true,
    'daha uzun desen kazanmalı');
  assert.strictEqual(E.resolve(cfg, NOW, 'https://baska.com').privacy, 'medium',
    'eşleşmeyen site tabanı kullanmalı');

  const r = E.resolve(cfg, NOW, 'https://ornek.com');
  assert.strictEqual(r.lat, 39.9179, 'kural koordinatı ezmeli');
  assert.strictEqual(r.timeZone, 'Europe/Berlin', 'kural saat dilimini ezmeli');
  assert.strictEqual(r.locale, 'tr-TR', 'kuralın belirtmediği alan tabandan gelmeli');
}

// 10. Geçici geçersiz kılma: süresi ve sitesi kadar geçerli.
{
  const cfg = with_({ override: { host: 'a.com', exact: true, expiresAt: NOW + 600000 } });

  assert.strictEqual(E.position(cfg, NOW, 'https://a.com').latitude, base.lat,
    'süresi dolmamış geçersiz kılma tam konum vermeli');
  assert.notStrictEqual(E.position(cfg, NOW + 700000, 'https://a.com').latitude, base.lat,
    'süresi dolunca eski davranışa dönmeli');
  assert.notStrictEqual(E.position(cfg, NOW, 'https://b.com').latitude, base.lat,
    'başka sitede geçerli olmamalı');
}

// 11. "Tarayıcı kapanana kadar" kapsamlı geçersiz kılmanın son kullanma tarihi yok.
//     Saate bakılmaz, silinmesi arka planın işi.
{
  const cfg = with_({ override: { host: 'a.com', exact: true, until: 'browser' } });
  assert.strictEqual(E.position(cfg, NOW, 'https://a.com').latitude, base.lat,
    'süresiz geçersiz kılma tam konum vermeli');
  assert.strictEqual(E.position(cfg, NOW + 400 * DAY, 'https://a.com').latitude, base.lat,
    'aradan ne kadar geçerse geçsin düşmemeli');
  assert.notStrictEqual(E.position(cfg, NOW, 'https://b.com').latitude, base.lat,
    'başka sitede geçerli olmamalı');
}

// 12. Elle girilen zone seviyeyi ezer, geçersiz değer yok sayılır.
{
  const cfg = with_({ zone: { inner: 100, outer: 250 } });
  for (let i = 0; i < 300; i++) {
    const p = E.position(cfg, NOW, 'https://z' + i + '.example');
    const d = meters(cfg, p);
    assert.ok(d >= 99 && d <= 251, `elle girilen halkanın dışına çıktı: ${d.toFixed(1)} m`);
  }
  assert.strictEqual(E.position(cfg, NOW, 'https://z0.example').accuracy, 250);

  // outer <= inner anlamsız, seviyeye düşmeli
  assert.deepStrictEqual(E.zoneOf({ zone: { inner: 900, outer: 300 }, privacy: 'low' }), E.ZONES.low);
  assert.deepStrictEqual(E.zoneOf({ zone: { inner: -5, outer: 300 }, privacy: 'low' }), E.ZONES.low);
  assert.deepStrictEqual(E.zoneOf({ zone: null, privacy: 'high' }), E.ZONES.high);
}

// 13. Hareket: rota üzerinde zamanla ilerleyen nokta. Zamanlayıcı yok, konum
//     yalnız "başlangıçtan bu yana geçen süre"nin fonksiyonu.
{
  // Kuzeye doğru düz bir hat. 1 derece enlem ~111.2 km.
  const A = [41.0, 29.0], B = [41.01, 29.0];   // ~1112 m
  const motion = {
    on: true, profile: 'walking', speed: 3.6, pause: 10, loop: 'loop',
    points: [A, B], startedAt: NOW
  };
  const at = t => E.motionAt(motion, NOW + t * 1000);

  // Hız 3.6 km/sa = 1 m/s, bacak ~1112 saniye, iki nokta * 10 sn bekleme
  const legSec = 1112.0;

  // Başlangıçta ilk noktada bekliyor
  const start = at(0);
  assert.strictEqual(start.lat, A[0], 'başta ilk noktada olmalı');
  assert.strictEqual(start.speed, 0, 'beklerken hız sıfır olmalı');

  // Bekleme bitince yürümeye başlıyor, yön kuzey
  const walking = at(10 + legSec / 2);
  assert.ok(walking.lat > A[0] && walking.lat < B[0], 'iki nokta arasında olmalı');
  assert.ok(Math.abs(walking.speed - 1) < 0.01, 'hız 1 m/s olmalı, gelen: ' + walking.speed);
  assert.ok(walking.heading < 1 || walking.heading > 359, 'kuzeye giderken yön ~0 olmalı');

  // Yol yarısındaysa mesafenin de yarısında olmalı
  const half = Math.abs(walking.lat - A[0]) / (B[0] - A[0]);
  assert.ok(Math.abs(half - 0.5) < 0.02, 'yolun yarısında olmalı, oran: ' + half.toFixed(3));

  // Zamanla ilerliyor
  assert.ok(at(10 + legSec * 0.8).lat > walking.lat, 'zamanla ilerlemeli');
}

// 14. Döngü biçimleri.
{
  const A = [41.0, 29.0], B = [41.01, 29.0];
  const make = loop => ({
    on: true, speed: 3.6, pause: 0, loop: loop, points: [A, B], startedAt: NOW
  });
  const cycle = 1112.0;   // bekleme yok, tek bacak

  // once: sonda durur, daha ileri gitmez
  const once = E.motionAt(make('once'), NOW + cycle * 5 * 1000);
  assert.ok(Math.abs(once.lat - B[0]) < 1e-9, 'once bitince son noktada kalmalı');
  assert.strictEqual(once.speed, 0, 'bitince hız sıfır olmalı');

  // loop: bir tur sonra başa döner
  const looped = E.motionAt(make('loop'), NOW + (cycle + 5) * 1000);
  assert.ok(looped.lat < A[0] + (B[0] - A[0]) * 0.1, 'loop başa dönmeli');

  // pingpong: ikinci turda geri gelir
  const back = E.motionAt(make('pingpong'), NOW + cycle * 1.5 * 1000);
  const forth = E.motionAt(make('pingpong'), NOW + cycle * 0.5 * 1000);
  assert.ok(Math.abs(back.lat - forth.lat) < 1e-6, 'pingpong aynı noktadan geri geçmeli');
}

// 15. Hareket halinde bildirilen konum zıplamamalı.
//     Tohumda koordinat olsaydı her adımda sapma değişir, iz paramparça olurdu.
{
  const pts = [[41.0, 29.0], [41.02, 29.0]];
  const cfg = with_({
    motion: { on: true, speed: 36, pause: 0, loop: 'loop', points: pts, startedAt: NOW }
  });

  let prev = E.position(cfg, NOW + 1000, 'https://a.com');
  for (let t = 2; t < 60; t++) {
    const p = E.position(cfg, NOW + t * 1000, 'https://a.com');
    const step = meters({ lat: prev.latitude, lon: prev.longitude }, p);
    // 36 km/sa = 10 m/s, saniyede ~10 m. 40 m'den fazlası zıplama demektir.
    assert.ok(step < 40, `adım ${t}: konum ${step.toFixed(0)} m zıpladı`);
    prev = p;
  }

  // Hız ve yön de dışarı çıkmalı
  const p = E.position(cfg, NOW + 30000, 'https://a.com');
  assert.ok(Math.abs(p.speed - 10) < 0.1, 'hız bildirilmeli, gelen: ' + p.speed);
  assert.ok(p.heading !== null, 'yön bildirilmeli');
}

// 16. Sabit konumda hız ve yön null; site kuralı hareketi ezebilmeli.
{
  assert.strictEqual(E.position(base, NOW, 'https://a.com').speed, null,
    'hareket yokken hız null olmalı');

  const pts = [[41.0, 29.0], [41.02, 29.0]];
  const cfg = with_({
    motion: { on: true, speed: 36, pause: 0, loop: 'loop', points: pts, startedAt: NOW },
    siteProfiles: [{ pattern: 'sabit.com', lat: 10, lon: 20, exact: true }]
  });
  const pinned = E.position(cfg, NOW + 30000, 'https://sabit.com');
  assert.strictEqual(pinned.latitude, 10, 'site kuralı hareketi ezmeli');
  assert.strictEqual(pinned.longitude, 20);
}

// 17. Bu sayfada çalışıyor muyuz. Karar hem köprüde hem sayfa dünyasında
//     buradan alınıyor, ikisi ayrı düşmesin.
{
  const on = p => with_(Object.assign({ enabled: true, siteMode: 'all', siteList: [] }, p));

  assert.strictEqual(E.activeFor(on({}), 'https://a.com'), true, 'her sitede açık olmalı');
  assert.strictEqual(E.activeFor(with_({ enabled: false }), 'https://a.com'), false,
    'uzantı kapalıysa hiçbir yerde çalışmamalı');
  assert.strictEqual(E.activeFor(null, 'https://a.com'), false, 'ayar yoksa çalışmamalı');

  const only = on({ siteMode: 'only', siteList: ['google.com'] });
  assert.strictEqual(E.activeFor(only, 'https://mail.google.com'), true, 'listedeki alt alan açık');
  assert.strictEqual(E.activeFor(only, 'https://baska.com'), false, 'listede olmayan kapalı');
  assert.strictEqual(E.activeFor(on({ siteMode: 'only', siteList: [] }), 'https://a.com'), false,
    'boş liste "her yer" anlamına gelmemeli');

  const except = on({ siteMode: 'except', siteList: ['banka.com.tr'] });
  assert.strictEqual(E.activeFor(except, 'https://banka.com.tr'), false, 'hariç tutulan kapalı');
  assert.strictEqual(E.activeFor(except, 'https://a.com'), true, 'hariç listesi dışı açık');
}

// 18. Zamanlama: hangi girdi gecerli, saatin fonksiyonu. Date/Intl kullanilmiyor
//     cunku bu motor sayfada da calisiyor ve orada ikisini de biz yamaliyoruz.
{
  const MON = Date.UTC(2026, 7, 24, 0, 0);   // 24 Agustos 2026 pazartesi
  const SUN = Date.UTC(2026, 7, 23, 0, 0);
  const cfg = with_({
    presets: { Work: { lat: 10, lon: 20 }, Home: { lat: 30, lon: 40 } },
    schedule: {
      on: true, offset: 0,
      entries: [
        { days: [1, 2, 3, 4, 5], time: '08:00', preset: 'Work' },
        { days: [1, 2, 3, 4, 5], time: '18:00', preset: 'Home' }
      ]
    }
  });

  const at = (base, h, m) => E.scheduleAt(cfg, base + (h * 60 + (m || 0)) * 60000);

  assert.strictEqual(at(MON, 9).preset, 'Work', 'pazartesi 09:00 Work olmali');
  assert.strictEqual(at(MON, 19).preset, 'Home', 'pazartesi 19:00 Home olmali');
  assert.strictEqual(at(MON, 7, 59).preset, 'Home',
    'sabah ilk girdiden once cuma aksamindan devam etmeli');
  assert.strictEqual(at(SUN, 12).preset, 'Home',
    'pazar hic girdi yok, cuma aksamki gecerli kalmali');

  // Kapaliyken hicbir sey donmemeli
  assert.strictEqual(E.scheduleAt(with_({ schedule: { on: false, entries: [] } }), MON), null);
  assert.strictEqual(E.scheduleAt(base, MON), null, 'zamanlama yoksa null');

  // Eksik ya da bozuk girdiler elenmeli, cokmemeli
  const bozuk = with_({
    presets: { Work: { lat: 10, lon: 20 } },
    schedule: { on: true, offset: 0, entries: [
      { days: [1], time: 'saat degil', preset: 'Work' },
      { days: [1], time: '08:00', preset: 'YokBoylePreset' },
      { days: [1], time: '09:00', preset: 'Work' }
    ] }
  });
  assert.strictEqual(E.scheduleAt(bozuk, MON + 10 * 3600000).preset, 'Work',
    'bozuk girdiler atlanip gecerli olan bulunmali');

  // UTC farki gercekten uygulaniyor mu: AYNI ana iki farkli fark ile bakip
  // sonucun degistigini gor. +180 ile 06:00 UTC yerelde 09:00 oluyor.
  const iki = off => with_({
    presets: { Work: { lat: 1, lon: 2 }, Home: { lat: 3, lon: 4 } },
    schedule: { on: true, offset: off, entries: [
      { days: [1], time: '09:00', preset: 'Work' },
      { days: [1], time: '10:00', preset: 'Home' }
    ] }
  });
  assert.strictEqual(E.scheduleAt(iki(180), MON + 6 * 3600000).preset, 'Work',
    'fark uygulaninca yerelde 09:00, Work basliyor');
  assert.strictEqual(E.scheduleAt(iki(0), MON + 6 * 3600000).preset, 'Home',
    'farksiz yerelde 06:00, bugun hicbiri baslamadi, gecen haftaki Home surer');

  // Gun secilmemis satir CALISMAMALI. Arayuzde bes satir bos duruyor;
  // "gun yoksa her gun" saysaydik dokunulmamis satir kendiliginden acilirdi.
  const bosgun = with_({
    presets: { Work: { lat: 10, lon: 20 } },
    schedule: { on: true, offset: 0, entries: [
      { days: [], time: '08:00', preset: 'Work' }
    ] }
  });
  assert.strictEqual(E.scheduleAt(bosgun, MON + 10 * 3600000), null,
    'gun secilmemis satir devreye girmemeli');

  // Profil gercekten uygulaniyor mu
  const p = E.position(Object.assign({}, cfg, { exact: true }), MON + 9 * 3600000, 'https://a.com');
  assert.strictEqual(p.latitude, 10, 'zamanlanan hazir ayarin konumu gecerli olmali');
}

// 20. Calisma kipi gercekten motoru degistiriyor mu.
// Arayuzdeki Fixed point / Fixed zone / Moving ayri bir alan DEGIL, exact ve
// motion.on'dan tureniyor. Bu ucu de burada, motorun gordugu haliyle deniyoruz.
{
  const pts = [[41.0000, 29.0000], [41.0200, 29.0000]];
  const kip = {
    fixed: { exact: true, motion: { on: false } },
    zone: { exact: false, motion: { on: false } },
    moving: {
      exact: true,
      motion: {
        on: true, profile: 'walking', speed: 36, pause: 0,
        loop: 'loop', points: pts, startedAt: 0
      }
    }
  };

  const T0 = 1000000;

  const sabit = E.position(with_(kip.fixed), T0, 'https://a.com');
  assert.strictEqual(sabit.latitude, base.lat, 'Fixed point tam koordinati vermeli');
  assert.strictEqual(sabit.longitude, base.lon, 'Fixed point tam koordinati vermeli');

  const bolge = E.position(with_(kip.zone), T0, 'https://a.com');
  const d = meters(base, bolge);
  const z = E.zoneOf({ privacy: base.privacy, zone: null });
  assert.ok(d >= z[0] - 1 && d <= z[1] + 1,
    'Fixed zone noktasi halkanin icinde olmali, olcum: ' + Math.round(d));

  const h1 = E.position(with_(kip.moving), T0, 'https://a.com');
  const h2 = E.position(with_(kip.moving), T0 + 60000, 'https://a.com');
  assert.notStrictEqual(h1.latitude, h2.latitude, 'Moving kipinde konum ilerlemeli');
  assert.ok(h1.latitude >= pts[0][0] - 1e-6 && h1.latitude <= pts[1][0] + 1e-6,
    'Moving noktasi rotanin uzerinde olmali');
  assert.ok(isFinite(h2.speed) && h2.speed > 0, 'Moving kipinde hiz da bildirilmeli');

  // Kip degisince eski kipin izi kalmamali
  assert.strictEqual(E.position(with_(kip.fixed), T0, 'https://a.com').speed, null,
    'sabit kipte hiz bildirilmemeli');
}

console.log('engine: 20 kontrol gecti');
