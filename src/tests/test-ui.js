// Arayüz ortakları ve konum verisi.
// İki derdi var:
//   1. 192 ülkelik tablo elle yazıldı. Ters çevrilmiş ya da yanlış yazılmış bir
//      koordinat gözle görülmez; saat diliminin UTC farkı ile boylamı
//      karşılaştırarak makine yakalasın.
//   2. Kayıtlı seçim veriyle uyuşmazsa çizim yarıda kalıp panel boş görünüyordu.
//   node test-ui.js

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

// Kaynak tek yerde: src/extension. extensions/ altindakiler buradan uretiliyor.
const SRC_ROOT = path.join(__dirname, '..', 'extension');

const SRC = SRC_ROOT;
const DATA = JSON.parse(fs.readFileSync(path.join(SRC, 'core/geo-data.json'), 'utf8'));

const ctx = vm.createContext({ console, Intl, Date, fetch: () => Promise.reject() });
vm.runInContext(fs.readFileSync(path.join(SRC, 'core/ui.js'), 'utf8'), ctx, { filename: 'ui.js' });

const call = (fn, ...args) => { ctx.__a = args; return vm.runInContext(`${fn}.apply(null, __a)`, ctx); };
const plain = v => JSON.parse(JSON.stringify(v));

const codes = Object.keys(DATA.countries);

// 1. Tablo bütünlüğü.
{
  assert.ok(codes.length > 150, 'ülke sayısı beklenenden az: ' + codes.length);
  codes.forEach(code => {
    const c = DATA.countries[code];
    assert.ok(/^[A-Z]{2}$/.test(code), code + ': ülke kodu iki büyük harf olmalı');
    assert.ok(c.name && c.name.length > 1, code + ': ad yok');
    assert.ok(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(c.locale), code + ': locale bozuk: ' + c.locale);
    assert.ok(Math.abs(c.lat) <= 90, code + ': enlem aralık dışı');
    assert.ok(Math.abs(c.lon) <= 180, code + ': boylam aralık dışı');
    assert.ok(Array.isArray(c.tz) && c.tz.length, code + ': saat dilimi yok');
  });
}

// 2. Her saat dilimi adı gerçekten var. Yazım hatası burada çıkar.
{
  codes.forEach(code => {
    DATA.countries[code].tz.forEach(tz => {
      assert.doesNotThrow(
        () => new Intl.DateTimeFormat('en-US', { timeZone: tz }),
        code + ': tanınmayan saat dilimi: ' + tz
      );
    });
  });
}

// 3. Koordinat ile saat dilimi birbirini tutuyor mu.
//    Beklenen fark boylam/15. Siyasi sınırlar yüzünden sapma olur, 4 saatten
//    fazlası tablo hatasıdır (ters işaret, enlem-boylam karışması, yanlış dilim).
//
//    Tarih çizgisi: Samoa boylam olarak -171'de ama saati +13. Fark tam 24 saat,
//    o yüzden karşılaştırma -12..+12 aralığına sarmalanıyor.
{
  const wrap = d => {
    while (d > 12) d -= 24;
    while (d < -12) d += 24;
    return Math.abs(d);
  };

  const sapan = [];
  codes.forEach(code => {
    const c = DATA.countries[code];
    const want = c.lon / 15;
    const best = Math.min(...c.tz.map(tz => wrap(call('gnmTzStandardOffset', tz) - want)));
    if (best > 4) sapan.push(`${code} ${c.name}: lon ${c.lon} vs ${c.tz.join(',')} (${best.toFixed(1)} saat)`);
  });
  assert.strictEqual(sapan.length, 0, 'koordinat ile saat dilimi uyuşmuyor:\n  ' + sapan.join('\n  '));
}

// 4. Elle girilmiş şehirler kendi ülkelerinin makul yakınında olmalı.
{
  const uzak = [];
  Object.keys(DATA.places).forEach(code => {
    assert.ok(DATA.countries[code], code + ': şehir listesi var ama ülke yok');
    DATA.places[code].forEach(p => {
      assert.ok(typeof p[0] === 'string' && p[0], code + ': şehir adı yok');
      assert.ok(Math.abs(p[1]) <= 90 && Math.abs(p[2]) <= 180, code + '/' + p[0] + ': koordinat aralık dışı');
      if (p[3]) {
        assert.doesNotThrow(() => new Intl.DateTimeFormat('en-US', { timeZone: p[3] }),
          code + '/' + p[0] + ': tanınmayan saat dilimi ' + p[3]);
        assert.ok(DATA.countries[code].tz.indexOf(p[3]) !== -1,
          code + '/' + p[0] + ': dilim ülkenin aday listesinde yok: ' + p[3]);
      }
      // Başkentten uzaklık ölçmek ABD, Rusya, Kanada gibi ülkelerde işe yaramıyor.
      // Bunun yerine şehrin boylamı ile diliminin farkı tutuyor mu, ona bak.
      const tz = p[3] || DATA.countries[code].tz[0];
      let d = call('gnmTzStandardOffset', tz) - p[2] / 15;
      while (d > 12) d -= 24;
      while (d < -12) d += 24;
      if (Math.abs(d) > 4) uzak.push(`${code}/${p[0]} (${Math.abs(d).toFixed(1)} saat)`);
    });
  });
  assert.strictEqual(uzak.length, 0, 'şehir boylamı ile saat dilimi uyuşmuyor: ' + uzak.join(', '));
}

// 5. Çok dilimli ülkede boylama göre doğru dilim seçilmeli.
{
  assert.strictEqual(call('gnmGeoTz', DATA, 'US', -118.24, null), 'America/Los_Angeles',
    'Los Angeles boylamı Pasifik dilimini vermeli');
  assert.strictEqual(call('gnmGeoTz', DATA, 'US', -74.0, null), 'America/New_York',
    'New York boylamı doğu dilimini vermeli');
  assert.strictEqual(call('gnmGeoTz', DATA, 'RU', 37.6, null), 'Europe/Moscow',
    'Moskova boylamı Moskova dilimini vermeli');
  assert.strictEqual(call('gnmGeoTz', DATA, 'TR', 28.9, null), 'Europe/Istanbul',
    'tek dilimli ülke her boylamda aynı dilimi vermeli');
  assert.strictEqual(call('gnmGeoTz', DATA, 'US', -74.0, 'America/Denver'), 'America/Denver',
    'yerin kendi dilimi varsa o kazanmalı');

  // Kıl payı farkta başkentin dilimi kalmalı: Ulaanbaatar 106.9 boylamda ama +8,
  // Hovd +7 boylama daha yakın görünüyor. Ülkenin ana dilimi kazanmalı.
  assert.strictEqual(call('gnmGeoTz', DATA, 'MN', 106.9057, null), 'Asia/Ulaanbaatar',
    'küçük fark başkentin dilimini düşürmemeli');
  assert.strictEqual(call('gnmGeoTz', DATA, 'AU', 149.13, null), 'Australia/Sydney',
    'Canberra boylamı Sydney dilimini vermeli');
  assert.strictEqual(call('gnmGeoTz', DATA, 'AU', 115.86, null), 'Australia/Perth',
    'Perth boylamı batı dilimini vermeli');
}

// 6. Şehir listesi olmayan ülkede tek seçenek başkent, adı ülkenin adı.
{
  const list = plain(call('gnmGeoPlaces', DATA, 'AO'));
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].name, DATA.countries.AO.name);
  assert.strictEqual(list[0].lat, DATA.countries.AO.lat);

  const tr = plain(call('gnmGeoPlaces', DATA, 'TR'));
  assert.ok(tr.length > 5, 'Türkiye için şehir listesi gelmeli');
  assert.ok(tr.some(p => p.name === 'Istanbul'));
}

const base = {
  country: 'TR', city: 'Istanbul', custom: false, lat: 41.0082, lon: 28.9784,
  tzAuto: true, localeAuto: true, timeZone: 'Europe/Istanbul', locale: 'tr-TR'
};
const with_ = p => Object.assign({}, base, p);

// 7. Geçerli seçim onarım istemez; geçersiz olan çizimi patlatmadan düzelir.
{
  assert.strictEqual(call('gnmGeoFix', DATA, base), null, 'geçerli seçim dokunulmamalı');

  // Eski sürümden kalma bölge/şehir adları
  const fix = plain(call('gnmGeoFix', DATA, with_({ city: 'Kadikoy' })));
  assert.ok(fix, 'geçersiz yer onarılmalı');
  assert.ok(plain(call('gnmGeoPlaces', DATA, fix.country)).some(p => p.name === fix.city),
    'onarılan yer listede olmalı');

  const bilinmeyen = plain(call('gnmGeoFix', DATA, with_({ country: 'XX', city: 'Yok' })));
  assert.ok(DATA.countries[bilinmeyen.country], 'bilinmeyen ülke geçerliye düşmeli');

  // Aramadan gelen nokta listede yok ama geçerli, onarılmamalı
  assert.strictEqual(call('gnmGeoFix', DATA, with_({ custom: true, city: 'Chacenay' })), null,
    'özel nokta onarım istememeli');

  // Özel nokta ama ülkesi de geçersiz: koordinatın hangi ülkede olduğunu
  // bilemeyiz, saat dilimi ve dil buradan üretilemez. Tutarsız bir profil
  // bırakmaktansa tümüyle geçerli bir seçime dönüyoruz.
  const ozel = plain(call('gnmGeoFix', DATA, with_({ custom: true, country: 'XX', lat: 12.5, lon: 34.5 })));
  assert.ok(DATA.countries[ozel.country], 'geçerli bir ülkeye dönmeli');
  assert.strictEqual(ozel.custom, false, 'artık özel nokta sayılmamalı');
  assert.strictEqual(ozel.lat, DATA.countries[ozel.country].lat, 'koordinat da o ülkeye taşınmalı');
  assert.strictEqual('activePreset' in ozel, false, 'onarım hazır ayara karışmamalı');
}

// --- onay kutulari ---------------------------------------------------------
// Yeni bir ayar eklerken dort yer degisiyor: store varsayilani, HTML kutusu,
// options.js listesi, dil dosyasindaki aciklama. Biri unutulunca arayuz sessizce
// yanlis calisiyor; kutu duruyor ama hicbir sey kaydetmiyor. Makine baksin.
{
  const grab = f => fs.readFileSync(path.join(SRC, f), 'utf8');
  const optionsJs = grab('ui/options.js');
  const optionsHtml = grab('ui/options.html');
  const storeJs = grab('core/store.js');

  const checks = optionsJs
    .slice(optionsJs.indexOf('var CHECKS = ['))
    .match(/\[([^\]]*)\]/)[1]
    .match(/'([a-zA-Z]+)'/g)
    .map(x => x.replace(/'/g, ''));

  assert.ok(checks.length >= 15, 'CHECKS listesi bulunamadı');

  for (const id of checks) {
    assert.ok(optionsHtml.includes(`<input id="${id}" type="checkbox">`),
      `${id}: options.html içinde onay kutusu yok`);
    assert.ok(new RegExp('^\\s+' + id + ':', 'm').test(storeJs),
      `${id}: store.js içinde varsayılanı yok`);
  }
}

// Akordeon icindeki her kutunun bir (?) yardim dugmesi olmali. Bu ayarlarin
// cogu bir seyi bozabiliyor; ne bozdugunu soylemeden kutu koymak kullaniciyi
// korumaz. Aciklamalar satir arasindan (?) balonlarina tasindi.
{
  const html = fs.readFileSync(path.join(SRC, 'ui/options.html'), 'utf8');
  const opts = html.match(/<div class="opt"[\s\S]*?<\/div>/g) || [];
  assert.ok(opts.length >= 12, 'akordeon seçenekleri bulunamadı');
  for (const o of opts) {
    const id = (o.match(/id="([a-zA-Z]+)"/) || [])[1];
    assert.ok(/class="help"[^>]*data-tip="[a-zA-Z]+"/.test(o),
      `${id}: yardım düğmesi yok`);
  }
}

// 10. Koordinattan dilim. Boylam sezgisinin tutturamadığı yerler: kendi
// dilimi olan dar bir kıyı (Kaliningrad), boylamı Madrid'den uzak adalar
// (Kanarya, Azorlar), aynı boylamda farklı dilimler (Adelaide, Darwin).
{
  const tzAt = (cc, lat, lon) => call('gnmGeoTz', DATA, cc, lon, null, lat);
  const cases = [
    ['RU', 54.71, 20.51, 'Europe/Kaliningrad'],
    ['RU', 55.03, 82.92, 'Asia/Krasnoyarsk'],
    ['RU', 43.12, 131.89, 'Asia/Vladivostok'],
    ['ES', 28.10, -15.40, 'Atlantic/Canary'],
    ['ES', 41.39, 2.17, 'Europe/Madrid'],
    ['PT', 37.74, -25.67, 'Atlantic/Azores'],
    ['AU', -34.93, 138.60, 'Australia/Adelaide'],
    ['AU', -12.46, 130.84, 'Australia/Adelaide'],
    ['AU', -31.95, 115.86, 'Australia/Perth'],
    ['US', 47.61, -122.33, 'America/Los_Angeles'],
    ['US', 31.76, -106.49, 'America/Denver'],
    ['US', 21.31, -157.86, 'Pacific/Honolulu'],
    ['US', 36.16, -86.78, 'America/Chicago'],
    ['MX', 29.07, -110.96, 'America/Chihuahua'],
    ['ID', -8.65, 115.22, 'Asia/Makassar'],
    ['CN', 43.83, 87.62, 'Asia/Urumqi']
  ];
  const yanlis = cases.filter(c => tzAt(c[0], c[1], c[2]) !== c[3])
    .map(c => `${c[0]} ${c[1]},${c[2]}: ${tzAt(c[0], c[1], c[2])} (beklenen ${c[3]})`);
  assert.strictEqual(yanlis.length, 0, 'koordinattan dilim yanlış: ' + yanlis.join('; '));

  // Referans noktası verisi kendi içinde tutarlı olmalı: her nokta ülkenin
  // dilim listesinde, her dilimin en az bir noktası var, aynı koordinatta iki
  // farklı dilim yok, nokta boylamı dilim farkından 4 saatten fazla sapmıyor.
  const A = DATA.tzAnchors;
  const sorun = [];
  Object.keys(DATA.countries).filter(cc => DATA.countries[cc].tz.length > 1).forEach(cc => {
    if (!A[cc]) { sorun.push(cc + ': noktası yok'); return; }
    DATA.countries[cc].tz.forEach(tz => {
      if (!A[cc].some(a => a[0] === tz)) sorun.push(`${cc}/${tz}: noktası yok`);
    });
    const seen = {};
    A[cc].forEach(a => {
      if (DATA.countries[cc].tz.indexOf(a[0]) === -1) sorun.push(`${cc}: listede olmayan ${a[0]}`);
      const key = a[1] + ',' + a[2];
      if (seen[key] && seen[key] !== a[0]) sorun.push(`${cc} ${key}: iki dilim`);
      seen[key] = a[0];
      let d = call('gnmTzStandardOffset', a[0]) - a[2] / 15;
      while (d > 12) d -= 24;
      while (d < -12) d += 24;
      if (Math.abs(d) > 4) sorun.push(`${cc} ${a[0]} ${key}: ${Math.abs(d).toFixed(1)} saat`);
      if (tzAt(cc, a[1], a[2]) !== a[0]) sorun.push(`${cc} ${key}: kendi dilimini vermiyor`);
    });
  });
  assert.strictEqual(sorun.length, 0, 'referans noktaları: ' + sorun.join('; '));
}

// 11. Tarayiciya ozel ayrim. Algilama API'nin varligindan, UA'dan degil.
// HTML'deki data-only degerleri ve koruma sayacindaki tarayici eslesmesi ayni
// olmali; yoksa Chrome'da gorunmeyen bir kutu sayaca girer.
{
  assert.strictEqual(call('gnmBrowser'), 'chromium', 'browser yokken chromium sayilmali');
  vm.runInContext('globalThis.browser = { runtime: { getBrowserInfo: function () {} } };', ctx);
  assert.strictEqual(call('gnmBrowser'), 'firefox', 'getBrowserInfo varken firefox sayilmali');
  vm.runInContext('delete globalThis.browser;', ctx);

  const html = fs.readFileSync(path.join(SRC, 'ui/options.html'), 'utf8');
  const only = [...html.matchAll(/data-only="([^"]*)"[\s\S]*?<input id="([a-zA-Z]+)"/g)]
    .map(m => [m[1], m[2]]);
  assert.ok(only.length >= 2, 'tarayiciya ozel secenek bulunamadi');
  const prot = vm.runInContext('JSON.stringify(GNM_PROT_ONLY)', ctx);
  const P = JSON.parse(prot);
  for (const [browser, id] of only) {
    assert.ok(browser === 'chromium' || browser === 'firefox', `${id}: gecersiz data-only ${browser}`);
    assert.ok(P[id] && P[id].browser === browser,
      `${id}: GNM_PROT_ONLY icinde yok ya da tarayicisi farkli (${browser})`);
  }
  // Sayac: Chrome'da Firefox ayari sayilmamali
  const base = call('gnmProtCount', { noSandbox: false, etpAlways: false });
  assert.strictEqual(call('gnmProtCount', { noSandbox: false, etpAlways: true }), base,
    'chromium sayacina Firefox ayari girmemeli');
  assert.strictEqual(call('gnmProtCount', { noSandbox: true, etpAlways: false }), base + 1,
    'chromium sayacina Chrome ayari girmeli');
}

console.log(`ui: ${codes.length} ulke, 11 kontrol gecti`);
