// Arka planı sahte bir chrome API'siyle çalıştırıp doğrular.
// İki şey sınanıyor:
//   1. tarayıcı geneli ayarlar (Accept-Language başlığı, WebRTC, rozet)
//   2. log'un tek yazarı burası. Kırpma, kapatma ve sayfadan gelen bozuk kaydı
//      temizleme burada olmazsa hiçbir yerde olmaz.
//   node test-background.js

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

// Kaynak tek yerde: src/extension. extensions/ altindakiler buradan uretiliyor.
const SRC_ROOT = path.join(__dirname, '..', 'extension');

const SRC = path.join(SRC_ROOT, 'background', 'index.js');

let CONFIG = null;
let LOG = [];
const calls = { rules: [], webrtc: [], net: [] };
const listeners = {};

function storageGet(keys, cb) {
  const want = Array.isArray(keys) ? keys : [keys];
  const out = {};
  if (want.indexOf('config') !== -1) out.config = CONFIG;
  if (want.indexOf('log') !== -1) out.log = LOG;
  cb(out);
}

const chrome = {
  runtime: {
    lastError: null,
    getManifest: () => ({ version: '3.0.0' }),
    getURL: p => 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/' + p,
    onInstalled: { addListener: f => { listeners.installed = f; } },
    onStartup: { addListener: () => {} },
    onMessage: { addListener: f => { listeners.message = f; } }
  },
  storage: {
    local: {
      get: storageGet,
      set: (o, cb) => { if ('log' in o) LOG = o.log; if (cb) cb(); },
      remove: (k, cb) => { (calls.removed = calls.removed || []).push(k); if ([].concat(k).indexOf('log') >= 0) LOG = []; if (cb) cb(); }
    },
    onChanged: { addListener: () => {} }
  },
  action: {
    setBadgeText: (o, cb) => { calls.badge = o.text; if (cb) cb(); },
    setBadgeBackgroundColor: (o, cb) => { if (cb) cb(); }
  },
  declarativeNetRequest: {
    updateDynamicRules: (o, cb) => { calls.rules.push(o); if (cb) cb(); }
  },
  privacy: {
    network: {
      webRTCIPHandlingPolicy: {
        set: (o, cb) => { calls.webrtc.push(['set', o.value]); if (cb) cb(); },
        clear: (o, cb) => { calls.webrtc.push(['clear']); if (cb) cb(); }
      },
      networkPredictionEnabled: {
        set: (o, cb) => { calls.net.push(['predict', o.value]); if (cb) cb(); },
        clear: (o, cb) => { calls.net.push(['predict', 'clear']); if (cb) cb(); }
      }
    },
    websites: {
      hyperlinkAuditingEnabled: {
        set: (o, cb) => { calls.net.push(['ping', o.value]); if (cb) cb(); },
        clear: (o, cb) => { calls.net.push(['ping', 'clear']); if (cb) cb(); }
      }
    }
  }
};

const ctx = vm.createContext({ chrome, console, Promise });
vm.runInContext(fs.readFileSync(SRC, 'utf8'), ctx, { filename: 'background/index.js' });

// DNR cagrisini sirasina gore degil, sildigi ilk kural numarasina gore bul:
// yeni bir kural grubu eklenince sira kayiyor, testler kirilmasin.
function ruleCall(id) {
  return calls.rules.find(c => c.removeRuleIds && c.removeRuleIds[0] === id);
}

function sync(config) {
  CONFIG = config;
  calls.rules.length = 0;
  calls.webrtc.length = 0;
  calls.net.length = 0;
  listeners.installed({ reason: 'install' });
}

// Log yazmaları zincirlenmiş sözler üzerinden gidiyor, bitmelerini bekle
async function settled() {
  for (let i = 0; i < 6; i++) await vm.runInContext('gnmLogChain', ctx);
}

const cfg = extra => Object.assign({
  enabled: true, siteMode: 'all', siteList: [],
  locale: 'tr-TR', acceptLanguage: true, webrtc: true,
  logging: true, logMax: 1000
}, extra);

// vm içinde üretilen diziler farklı prototipte, deepStrictEqual takılıyor.
// Karşılaştırmadan önce sade veriye çeviriyoruz.
const plain = v => JSON.parse(JSON.stringify(v));
const events = () => plain(LOG).map(e => e.e);

// Not: içerik betiği kapsamı artık burada değil. Betikler manifest'te statik
// tanımlı, hangi sayfada etkin olduğuna engine.activeFor karar veriyor ve
// testi test-engine.js'te (17. kontrol).

// 1. Kapalıyken tarayıcı ayarları geri verilir.
{
  sync(cfg({ enabled: false }));
  assert.deepStrictEqual(calls.webrtc, [['clear']], 'kapalıyken WebRTC ayarı bırakılmalı');
  // Karo kuralı ayardan bağımsız, harita uzantı kapalıyken de çiziliyor.
  // Kapalıyken kalan TEK kural o olmalı, dil kuralı düşmeli.
  const kapali = plain(calls.rules[0].addRules);
  assert.strictEqual(kapali.length, 1, 'kapalıyken yalnız karo kuralı kalmalı');
  assert.strictEqual(kapali[0].id, 2, 'kalan kural karo kuralı olmalı');
  assert.strictEqual(kapali[0].action.requestHeaders[0].header, 'Referer',
    'karo kuralı Referer yazmalı');
  assert.deepStrictEqual(kapali[0].condition.requestDomains,
    ['tile.openstreetmap.org', 'tile.openstreetmap.de'],
    'karo kuralı yalnız karo sunucularına uygulanmalı');
  assert.deepStrictEqual(kapali[0].condition.resourceTypes, ['image'],
    'karo kuralı yalnız resim isteklerine uygulanmalı');
  assert.strictEqual(calls.badge, '', 'kapalıyken rozet boş olmalı');
}

// 2. Açıkken rozet ve WebRTC korumasi kurulur.
{
  sync(cfg());
  assert.deepStrictEqual(calls.webrtc, [['set', 'default_public_interface_only']]);
  assert.strictEqual(calls.badge, 'ON');
}

// 3. Accept-Language değeri dile göre kurulur, kapatılabilir.
{
  sync(cfg({ locale: 'tr-TR' }));
  const header = calls.rules[0].addRules[0].action.requestHeaders[0];
  assert.strictEqual(header.header, 'Accept-Language');
  assert.strictEqual(header.value, 'tr-TR,tr;q=0.9,en;q=0.8');

  sync(cfg({ locale: 'en-US' }));
  assert.strictEqual(calls.rules[0].addRules[0].action.requestHeaders[0].value, 'en-US,en;q=0.9',
    'ingilizce için ikinci kez en eklenmemeli');

  sync(cfg({ acceptLanguage: false }));
  const kalan = plain(calls.rules[0].addRules);
  assert.strictEqual(kalan.length, 1, 'kapatılınca dil kuralı düşmeli, karo kuralı kalmalı');
  assert.strictEqual(kalan[0].id, 2, 'kalan kural karo kuralı olmalı');
}

// 4. WebRTC kapatılabilir, kapatınca ayar tarayıcıya geri verilir.
{
  sync(cfg({ webrtc: false }));
  assert.deepStrictEqual(calls.webrtc, [['clear']]);
}

(async function () {
  // 5. Arka planın kendi yaptıkları log'a düşer.
  {
    LOG = [];
      sync(cfg());
    await settled();
    const e = events();
    ['installed', 'sync', 'dnr.set', 'webrtc.set'].forEach(function (want) {
      assert.ok(e.indexOf(want) !== -1, want + ' kaydı yok. Olanlar: ' + e.join(','));
    });
    assert.ok(plain(LOG).every(r => r.s === 'bg'), 'arka plan kayıtları bg kaynaklı olmalı');
  }

  // 6. İçerik betiğinden gelen kayıtlar eklenir.
  {
    LOG = [];
    listeners.message({ __gnmLog: [{ t: 111, s: 'patch', e: 'geo.get', d: { lat: 1 } }] }, {});
    await settled();
    const row = plain(LOG)[0];
    assert.strictEqual(row.s, 'patch');
    assert.strictEqual(row.e, 'geo.get');
    assert.strictEqual(row.d, '{"lat":1}', 'ayrıntı metne çevrilmeli');
  }

  // 7. Kayıt kapalıyken hiçbir şey yazılmaz.
  {
    LOG = [];
    CONFIG = cfg({ logging: false });
    listeners.message({ __gnmLog: [{ t: 1, s: 'patch', e: 'geo.get', d: 'x' }] }, {});
    await settled();
    assert.strictEqual(LOG.length, 0, 'kayıt kapalıyken yazmamalı');
  }

  // 8. Tavan aşılınca en eskiler düşer, en yeniler kalır.
  {
    LOG = [];
    CONFIG = cfg({ logMax: 10 });
    for (let i = 0; i < 25; i++) {
      listeners.message({ __gnmLog: [{ t: i, s: 'patch', e: 'n' + i, d: '' }] }, {});
    }
    await settled();
    assert.strictEqual(LOG.length, 10, 'tavana kırpılmalı');
    assert.strictEqual(plain(LOG)[0].e, 'n15', 'en eskiler düşmeli');
    assert.strictEqual(plain(LOG)[9].e, 'n24', 'en yeni kalmalı');
  }

  // 9. Sayfadan gelen kaydın alanları temizlenir. Sayfa mesajı taklit edebilir,
  //     devasa ya da bozuk bir kayıtla log'u şişirmesine izin yok.
  {
    LOG = [];
    CONFIG = cfg();
    listeners.message({
      __gnmLog: [{ t: 'saat degil', s: 'x'.repeat(50), e: 'y'.repeat(90), d: 'z'.repeat(2000) }]
    }, {});
    await settled();
    const row = plain(LOG)[0];
    assert.strictEqual(typeof row.t, 'number', 'bozuk zaman damgası sayıya dönmeli');
    assert.strictEqual(row.s.length, 12, 'kaynak kırpılmalı');
    assert.strictEqual(row.e.length, 40, 'olay adı kırpılmalı');
    assert.ok(row.d.length <= 501, 'ayrıntı kırpılmalı, uzunluk: ' + row.d.length);
    assert.ok(row.d.endsWith('…'), 'kırpılan ayrıntı işaretlenmeli');
  }

  // 10. Tek parti 50 kayıtla sınırlı, sayfa log'u sel altında bırakamaz.
  {
    LOG = [];
    CONFIG = cfg();
    const flood = [];
    for (let i = 0; i < 200; i++) flood.push({ t: i, s: 'patch', e: 'f', d: '' });
    listeners.message({ __gnmLog: flood }, {});
    await settled();
    assert.strictEqual(LOG.length, 50, 'parti başına tavan uygulanmalı');
  }

  // 11. DNS on cozumleme ve ping: acikken kapatilir, uzanti ya da ayar
  // kapaninca tarayiciya geri verilir. Eski kayitta anahtar yoksa acik sayilir.
  {
    sync(cfg());
    assert.deepStrictEqual(plain(calls.net), [['predict', false], ['ping', false]],
      'anahtar yokken ikisi de kapatilmali');
    sync(cfg({ noPrediction: false }));
    assert.deepStrictEqual(plain(calls.net), [['predict', 'clear'], ['ping', false]],
      'ayar kapaninca on cozumleme tarayiciya birakilmali');
    sync(cfg({ enabled: false }));
    assert.deepStrictEqual(plain(calls.net), [['predict', 'clear'], ['ping', 'clear']],
      'uzanti kapaliyken ikisi de birakilmali');
  }

  // 12. GPC ve takip parametresi kurallari. Her biri AYRI cagrida: tek cagri
  // toptan oldugu icin Chrome parametre ifadesini reddedince GPC de dusuyordu
  // (gercek tarayicida leak-check.js buldu, sahte API yakalamiyordu).
  {
    sync(cfg());
    const gcall = plain(ruleCall(3));
    assert.deepStrictEqual(gcall.removeRuleIds, [3], 'GPC kurali kendi cagrisinda once silinmeli');
    const gpc = gcall.addRules.find(r => r.id === 3);
    assert.ok(gpc, 'GPC kurali kurulmali');
    assert.deepStrictEqual(gpc.action.requestHeaders[0], { header: 'Sec-GPC', operation: 'set', value: '1' });

    const scall = plain(ruleCall(4));
    assert.deepStrictEqual(scall.removeRuleIds, [4, 5, 6, 7], 'parametre kurallari her seferinde once silinmeli');
    const strips = scall.addRules;
    assert.ok(strips.length >= 2 && strips.every(r => r.id >= 4 && r.id <= 7), 'parametre kurallari 4..7 araliginda');
    // Chrome 2 KB derleme siniri: 27 adlik tek ifade reddediliyordu, grup kucuk kalmali
    strips.forEach(r => assert.ok(r.condition.regexFilter.split('|').length <= 9,
      'tek ifade en cok 9 ad: ' + r.condition.regexFilter));
    const any = url => strips.some(r => new RegExp(r.condition.regexFilter).test(url));
    assert.ok(any('https://a.example/x?utm_source=news&id=7'), 'utm_source eslesmeli');
    assert.ok(any('https://a.example/x?id=7&fbclid=abc'), 'fbclid eslesmeli');
    assert.ok(any('https://a.example/x?mkt_tok=1'), 'listenin son adi da eslesmeli');
    assert.ok(!any('https://a.example/x?utm_foo=1'), 'listede olmayan utm_ eslesmemeli');
    assert.ok(!any('https://a.example/x?xgclid=1'), 'parametre adinin parcasi eslesmemeli');
    // Dongu guvencesi: her ifadenin eslestirdigi her ad silinen listede
    const inRegex = [];
    strips.forEach(r => {
      const removed = r.action.redirect.transform.queryTransform.removeParams;
      const names = r.condition.regexFilter.match(/\(([^)]*)\)/)[1].split('|');
      names.forEach(n => assert.ok(removed.includes(n), n + ' eslesiyor ama silinmiyor, dongu olur'));
      inRegex.push(...names);
      assert.deepStrictEqual(r.condition.resourceTypes, ['main_frame', 'sub_frame'],
        'yalniz sayfa ve cerceve adreslerine uygulanmali');
    });
    assert.deepStrictEqual(inRegex.slice().sort(),
      strips[0].action.redirect.transform.queryTransform.removeParams.slice().sort(),
      'gruplar birlikte listenin tamamini kapsamali');

    sync(cfg({ gpc: false, stripParams: false }));
    assert.strictEqual(plain(ruleCall(3)).addRules.length, 0, 'GPC kapaninca kural kalmamali');
    assert.strictEqual(plain(ruleCall(4)).addRules.length, 0, 'parametre ayari kapaninca kural kalmamali');
    sync(cfg({ enabled: false }));
    assert.strictEqual(plain(ruleCall(3)).addRules.length + plain(ruleCall(4)).addRules.length, 0,
      'uzanti kapaliyken kural kalmamali');
  }

  // 12b. Acilis degeri (Server-Timing). Sayfa yamasi ayari gec aliyor, ilk
  // betikler gercek dilimi okuyordu. Uzantinin kapali oldugu siteye ve kendi
  // dilimi olabilecek siteye sahte deger GITMEMELI.
  {
    const boot = c => { sync(cfg(c)); const r = plain(ruleCall(8)); return r && r.addRules[0]; };
    let r = boot({ timeZone: 'Asia/Tokyo', locale: 'ja-JP' });
    assert.ok(r, 'acikken acilis kurali kurulmali');
    assert.deepStrictEqual(r.action.responseHeaders[0],
      { header: 'Server-Timing', operation: 'append', value: 'gnm;desc="Asia/Tokyo|ja-JP"' },
      'yanit basligina eklenmeli, sitenin kendi kaydi silinmemeli');
    assert.deepStrictEqual(r.condition.resourceTypes, ['main_frame', 'sub_frame'], 'yalniz belge yanitlari');
    assert.ok(!r.condition.excludedRequestDomains, 'site kurali yokken haric alan olmamali');

    r = boot({ timeZone: 'Asia/Tokyo', locale: 'ja-JP', localeSpoof: false });
    assert.strictEqual(r.action.responseHeaders[0].value, 'gnm;desc="Asia/Tokyo|"', 'dil sahteleme kapaliysa dil gitmemeli');

    r = boot({ timeZone: 'Asia/Tokyo', siteMode: 'except', siteList: ['*.bank.example'],
      siteProfiles: [{ pattern: 'mail.example', timeZone: 'Europe/Paris' }] });
    assert.deepStrictEqual(r.condition.excludedRequestDomains.sort(), ['bank.example', 'mail.example'],
      'kapali site ve kendi profili olan site haric tutulmali');

    r = boot({ timeZone: 'Asia/Tokyo', siteMode: 'only', siteList: ['a.example', 'mail.example'],
      siteProfiles: [{ pattern: 'mail.example' }] });
    assert.deepStrictEqual(r.condition.requestDomains, ['a.example'], 'only kipinde yalniz listedekiler, profilli olan disinda');
    assert.strictEqual(boot({ timeZone: 'Asia/Tokyo', siteMode: 'only', siteList: [] }), undefined,
      'only kipinde liste bossa hic gitmemeli');

    assert.strictEqual(boot({ timeZone: 'Asia/Tokyo', schedule: { on: true } }), undefined, 'zamanlama aciksa kural yok');
    assert.strictEqual(boot({ timeZone: 'Asia/Tokyo', override: { until: 'browser' } }), undefined, 'gecici kilma suruyorsa kural yok');
    assert.strictEqual(boot({ timeZone: 'Asia/Tokyo', enabled: false }), undefined, 'uzanti kapaliyken kural yok');
    assert.strictEqual(boot({ timeZone: 'Asia/Tokyo"; x=1', locale: '' }), undefined,
      'baslik degerini bozabilecek dilim reddedilmeli');
  }

  // 13. Tarayiciya ozel tercihler. API varsa kurulur, yoksa sessizce gecilir:
  // Chrome'da Firefox'un, Firefox'ta Chrome'un ayari "desteklenmiyor" diye
  // her senkronda kayda dusmemeli.
  {
    LOG = [];
    sync(cfg());
    await settled();
    assert.ok(!events().some(e => /^(topics|fledge|admeasure|etp)\./.test(e)),
      'olmayan tarayiciya ozel API kayda dusmemeli');

    const W = chrome.privacy.websites;
    const fake = name => ({
      set: (o, cb) => { calls.net.push([name, o.value]); if (cb) cb(); },
      clear: (o, cb) => { calls.net.push([name, 'clear']); if (cb) cb(); }
    });
    W.topicsEnabled = fake('topics');
    W.fledgeEnabled = fake('fledge');
    W.adMeasurementEnabled = fake('admeasure');
    W.trackingProtectionMode = fake('etp');

    sync(cfg());
    const got = plain(calls.net).filter(c => c[0] !== 'predict' && c[0] !== 'ping');
    assert.deepStrictEqual(got,
      [['topics', false], ['fledge', false], ['admeasure', false], ['etp', 'clear']],
      'Sandbox varsayilan kapanmali, izleme korumasi varsayilan dokunulmamali');

    sync(cfg({ etpAlways: true, noSandbox: false }));
    const got2 = plain(calls.net).filter(c => c[0] !== 'predict' && c[0] !== 'ping');
    assert.deepStrictEqual(got2,
      [['topics', 'clear'], ['fledge', 'clear'], ['admeasure', 'clear'], ['etp', 'always']],
      'ayarlar tersine donunce tercihler de donmeli');

    delete W.topicsEnabled; delete W.fledgeEnabled;
    delete W.adMeasurementEnabled; delete W.trackingProtectionMode;
  }

  // 14. Gizli pencereden gelen kayit diske yazilmaz.
  {
    await settled();
    LOG = []; CONFIG = cfg({ timeline: true });
    listeners.message({ __gnmLog: [{ s: 'patch', e: 'geo.fake', d: { lat: 1, lon: 2, origin: 'https://gizli.example' } }] }, { tab: { incognito: true } });
    await settled();
    assert.deepStrictEqual(plain(LOG), [], 'gizli pencere kaydi yazilmamali');
  }

  // 15. Dil ve GPC basligi websocket, ping ve CSP raporunda da gitmeli.
  const added = () => calls.rules.reduce((a, c) => a.concat(plain(c.addRules || [])), []);
  const withHeader = h => added().filter(r => (r.action.requestHeaders || []).some(x => x.header === h));
  {
    sync(cfg({ gpc: true }));
    ['Accept-Language', 'Sec-GPC'].forEach(h => {
      const types = withHeader(h).reduce((a, r) => a.concat(r.condition.resourceTypes), []);
      ['main_frame', 'sub_frame', 'xmlhttprequest', 'websocket', 'ping', 'csp_report', 'object', 'other']
        .forEach(t => assert.ok(types.indexOf(t) >= 0, h + ' kuralinda eksik tur: ' + t));
    });
  }

  // 16. Dil basligi site kipine uyar: sayfadaki dil ile baslik celismesin.
  {
    const split = () => {
      const rs = withHeader('Accept-Language');
      return {
        nav: rs.find(r => r.condition.resourceTypes.indexOf('main_frame') >= 0),
        sub: rs.find(r => r.condition.resourceTypes.indexOf('main_frame') < 0),
        n: rs.length
      };
    };
    sync(cfg({ siteMode: 'only', siteList: ['a.com', '*.b.org'] }));
    let s = split();
    assert.strictEqual(s.n, 2);
    assert.deepStrictEqual(s.nav.condition.resourceTypes, ['main_frame', 'sub_frame']);
    assert.deepStrictEqual(s.nav.condition.requestDomains, ['a.com', 'b.org'], 'gezinme hedefe gore');
    assert.deepStrictEqual(s.sub.condition.initiatorDomains, ['a.com', 'b.org'], 'alt istekler isteyen sayfaya gore');
    assert.strictEqual(s.sub.condition.requestDomains, undefined);

    sync(cfg({ siteMode: 'except', siteList: ['a.com'] }));
    s = split();
    assert.deepStrictEqual(s.nav.condition.excludedRequestDomains, ['a.com']);
    assert.deepStrictEqual(s.sub.condition.excludedInitiatorDomains, ['a.com']);

    sync(cfg({ siteMode: 'only', siteList: [] }));
    assert.strictEqual(withHeader('Accept-Language').length, 0, 'listede kimse yoksa baslik kurali yok');

    sync(cfg());
    s = split();
    assert.ok(!s.nav.condition.requestDomains && !s.sub.condition.initiatorDomains, 'her site kipinde sinir yok');
  }

  // 17. Harita Referer kurali yalniz uzantinin KENDI isteklerine uygulanir:
  // baska bir sitenin karo istegine GeoNoMore adresi eklenmemeli.
  {
    sync(cfg({ enabled: false }));
    const tile = withHeader('Referer')[0];
    assert.deepStrictEqual(tile.condition.initiatorDomains, ['abcdefghijklmnopabcdefghijklmnop']);
  }

  // 18. 5.1.2'den onceki kayitlar gercek adres ve konum iceriyor: guncellemede silinir.
  {
    const wipe = d => { calls.removed = []; CONFIG = cfg(); listeners.installed(d); return plain(calls.removed); };
    assert.deepStrictEqual(wipe({ reason: 'update', previousVersion: '5.1.1' }), [['log', 'timeline']]);
    assert.deepStrictEqual(wipe({ reason: 'update', previousVersion: '4.9.0' }), [['log', 'timeline']]);
    assert.deepStrictEqual(wipe({ reason: 'update', previousVersion: '5.1.2' }), []);
    assert.deepStrictEqual(wipe({ reason: 'update', previousVersion: '5.2.0' }), []);
    assert.deepStrictEqual(wipe({ reason: 'update', previousVersion: '5.10.0' }), []);
    assert.deepStrictEqual(wipe({ reason: 'install' }), []);
  }

  console.log('background: 18 kontrol gecti');
})().catch(e => { console.error(e.message); process.exit(1); });
