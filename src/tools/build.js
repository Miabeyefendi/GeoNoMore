// GeoNoMore paketleyici. Bağımlılık yok, Node'un kendi zlib'i yetiyor.
//   node src/tools/build.js            ikisini de kur
//   node src/tools/build.js firefox    yalnız birini
//
// İKİ paket var, beş değil. Chrome, Edge, Brave ve Opera aynı motoru taşıyor ve
// birebir aynı manifest'i alıyor; dördüne ayrı klasör açmak aynı dosyayı dört
// kez saklamaktan başka bir işe yaramıyordu. Aynı chromium arşivi dört mağazaya
// da yükleniyor (Brave'in mağazası yok, Chrome listesinden kuruluyor).
//
// src/extension tek kaynak. Burası onu releases/extensions/<ad>/ altına kopyalıyor,
// manifest'i yazıyor, yanına da zip çıkarıyor. Mağazaların hepsi zip kabul ediyor;
// Firefox imzayı kendi atıyor, yani ayrıca derleme adımı yok.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const vm = require('vm');   // yalnız yedek demeti ayrıştırıp denetlemek için

const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src', 'extension');
const OUT = path.join(ROOT, 'releases', 'extensions');
const DIST = OUT;

const VERSION = '5.1.1';
const GECKO_ID = 'geonomore@miabeyefendi.dev';

// İzinler hedef başına. Kaynak tek, ama Chrome ile Firefox ayrı tasarlanıyor:
// birine özel bir özellik kendi iznini yalnız kendi manifest'ine yazar (ör.
// Firefox'ta proxy.onRequest, contextualIdentities). Kod tarafı izni değil
// API'nin varlığını yoklar, izin yoksa API de yoktur.
//
// Kullanılmayan izin EKLEME: mağaza incelemesi "gereksiz izin" diye reddediyor
// ve kurulum uyarısı büyüyor. Özellik gelince izni de o getirsin.
const PERMS = {
  common: ['storage', 'privacy', 'declarativeNetRequestWithHostAccess'],
  chromium: [],
  firefox: []
};

function manifest(target) {
  const base = {
    manifest_version: 3,
    name: 'GeoNoMore',
    version: VERSION,
    description: '__MSG_extDesc__',
    default_locale: 'en',
    icons: icons(),
    action: {
      default_title: 'GeoNoMore',
      default_popup: 'ui/popup.html',
      default_icon: icons()
    },
    options_ui: { page: 'ui/options.html', open_in_tab: true },
    content_scripts: [{
      // ASIL YOL: yamayi tarayici dogrudan sayfa dunyasina koyuyor. DOM'a
      // <script> sokmadigi icin sayfanin CSP'sine TAKILMIYOR. Onceki yol
      // satir ici enjeksiyondu ve siki CSP'li sitelerde (script-src 'self')
      // hem satir ici hem <script src> bloklaniyordu; o sitelerde uzanti hic
      // calismiyordu ve konsola CSP hatasi basiyordu.
      //
      // content/fallback.js build sirasinda uretilen tek parca IIFE: sayfanin
      // window'una hicbir ad birakmiyor.
      matches: ['<all_urls>'],
      js: ['content/fallback.js'],
      world: 'MAIN',
      run_at: 'document_start',
      all_frames: true,
      match_about_blank: true
    }, {
      // Yalitilmis dunya: kopru, kayit ve satir ici YEDEK enjeksiyon.
      // MAIN calistiysa kopru satir ici denemesini hic yapmiyor.
      matches: ['<all_urls>'],
      js: ['core/engine.js', 'core/log.js', 'content/injected.js', 'content/bridge.js'],
      run_at: 'document_start',
      all_frames: true,
      // Boş çerçeveler en geniş kaçak yoluydu, bkz. proje notlari
      match_about_blank: true
    }],
    web_accessible_resources: [{
      resources: ['content/fallback.js'],
      matches: ['<all_urls>']
    }],
    background: { service_worker: 'background/index.js' },
    permissions: PERMS.common.concat(PERMS[target] || []),
    host_permissions: ['<all_urls>']
  };

  if (target === 'firefox') {
    base.browser_specific_settings = {
      gecko: {
        // 140, 128 değil. data_collection_permissions desteği masaüstünde 140,
        // Android'de 142 ile geldi; daha eski bir taban yazınca AMO "bu anahtar
        // o sürümde yok" diye uyarıyor. 140 zaten ESR, geride kalan kimse yok.
        id: GECKO_ID,
        strict_min_version: '140.0',
        // 3 Kasım 2025'ten beri AMO zorunlu tutuyor: eklenti kişisel veri
        // topluyor mu, açıkça yazacaksın. Toplamıyoruz, karşılığı "none".
        // Adres araması kullanıcı kutuya bir şey yazınca OpenStreetMap'e
        // gidiyor; onu eklenti toplamıyor, gizlilik metninde ve inceleme
        // notunda anlatılıyor.
        data_collection_permissions: { required: ['none'] }
      },
      // Android da uyumlu. Kullandığımız her API orada da var ve hepsinin
      // desteği çok daha eski: privacy.network 54, declarativeNetRequest 113,
      // action 109, options_ui 57, content_scripts 48. Tabanı 142'ye çeken
      // şey API'ler değil, data_collection_permissions.
      gecko_android: { strict_min_version: '142.0' }
    };
    // Firefox'ta arka plan service worker değil, olay betiği
    base.background = { scripts: ['background/index.js'] };
    return base;
  }

  // Chromium: data: ve srcdoc çerçevelerini de kapsıyor, Firefox'ta karşılığı yok.
  // Her iki girişe de gerekiyor.
  base.content_scripts.forEach(function (cs) { cs.match_origin_as_fallback = true; });
  base.minimum_chrome_version = '111';
  return base;
}

// MAIN dunya girisi manifest'te ILK sirada olmali: kopru (ikinci giriste)
// ondan sonra calisip __gnmOK isaretini gormek zorunda, yoksa gereksiz yere
// satir ici enjeksiyon deneyip CSP'li sitelerde konsola hata basiyor.
function checkManifest(m) {
  const cs = m.content_scripts;
  const bad =
    cs[0].world !== 'MAIN' ? 'ilk giris MAIN degil' :
    cs[0].js[0] !== 'content/fallback.js' ? 'MAIN girisi demeti yuklemiyor' :
    cs[1].world ? 'ikinci giris yalitilmis olmali' :
    cs[1].js.indexOf('content/bridge.js') === -1 ? 'kopru ikinci giriste yok' :
    new Set(m.permissions).size !== m.permissions.length ? 'izin listesinde tekrar var' : null;
  if (bad) {
    console.error('manifest hatali: ' + bad);
    process.exit(1);
  }
  return m;
}

function icons() {
  return { 16: 'assets/icons/16.png', 32: 'assets/icons/32.png',
    48: 'assets/icons/48.png', 128: 'assets/icons/128.png' };
}

const TARGETS = ['chromium', 'firefox'];

// --- dosya kopyalama --------------------------------------------------------

function walk(dir, prefix) {
  let out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = prefix ? prefix + '/' + name : name;
    if (fs.statSync(full).isDirectory()) out = out.concat(walk(full, rel));
    else if (name !== 'manifest.json') out.push(rel);
  }
  return out;
}

// --- zip --------------------------------------------------------------------
// Küçük bir yazıcı yetiyor: dosyaları deflate edip merkezi dizinle kapatıyoruz.

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function zip(files) {
  const parts = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const deflated = zlib.deflateRawSync(f.data, { level: 9 });
    // Sıkıştırma büyütüyorsa olduğu gibi koy
    const store = deflated.length >= f.data.length;
    const body = store ? f.data : deflated;
    const crc = crc32(f.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);            // gereken sürüm
    local.writeUInt16LE(0x0800, 6);        // ad UTF-8
    local.writeUInt16LE(store ? 0 : 8, 8); // yöntem
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(name.length, 26);

    parts.push(local, name, body);

    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(20, 6);
    head.writeUInt16LE(0x0800, 8);
    head.writeUInt16LE(store ? 0 : 8, 10);
    head.writeUInt32LE(crc, 16);
    head.writeUInt32LE(body.length, 20);
    head.writeUInt32LE(f.data.length, 24);
    head.writeUInt16LE(name.length, 28);
    head.writeUInt32LE(offset, 42);
    central.push(head, name);

    offset += local.length + name.length + body.length;
  }

  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([Buffer.concat(parts), dir, end]);
}

// --- çalıştır ---------------------------------------------------------------

const only = process.argv[2];
const list = only ? TARGETS.filter(t => t === only) : TARGETS;
if (!list.length) {
  console.error('bilinmeyen hedef: ' + only + '. Secenekler: ' + TARGETS.join(', '));
  process.exit(1);
}

// Motorun sonundaki disari acma blogu demete girmiyor: IIFE icinde de
// globalThis'e yazardi ve tam kacinmak istedigimiz sey o.
function bundle() {
  const engine = fs.readFileSync(path.join(SRC, 'core/engine.js'), 'utf8')
    .split('if (typeof module ===')[0].trimEnd();
  const injected = fs.readFileSync(path.join(SRC, 'content/injected.js'), 'utf8').trimEnd();
  return [
    '// Uretilmis dosya. Kaynak: core/engine.js + content/injected.js',
    '// Elle duzenleme, ilk build ile siliniyor.',
    '(function () {',
    engine,
    '',
    injected,
    '',
    'gnmInjected(gnmEngineFactory);',
    '})();',
    ''
  ].join('\n');
}

// Demet birleştirmeyle üretiliyor, yani bir sözdizimi hatası ancak CSP'li bir
// sitede, kullanıcının tarayıcısında ortaya çıkardı. Burada bir kez ayrıştırıp
// emin oluyoruz; çalıştırmıyoruz, yalnız ayrıştırıyoruz.
function checkBundle(code) {
  try {
    new vm.Script(code, { filename: 'content/fallback.js' });
  } catch (e) {
    console.error('yedek demet ayristirilamadi: ' + e.message);
    process.exit(1);
  }
  return code;
}

const names = walk(SRC, '');
fs.mkdirSync(DIST, { recursive: true });

for (const target of list) {
  const dir = path.join(OUT, target);
  fs.rmSync(dir, { recursive: true, force: true });

  const files = [];
  for (const rel of names) {
    const data = fs.readFileSync(path.join(SRC, rel));
    const dest = path.join(dir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, data);
    files.push({ name: rel, data: data });
  }

  // CSP yedegi tek dosya ve tamami bir IIFE icinde. Uc ayri <script src> ile
  // yuklenirken engine.js ve injected.js sayfanin window'una gnmEngineFactory,
  // gnmInjected ve __gnmEngine adlarini birakiyordu; sayfa Object.keys(window)
  // diyerek uzantiyi goruyordu. Sahte konum veren bir uzantinin kendini ele
  // vermesi kendi amacini bozuyor, o yuzden yedek yol da ad birakmiyor.
  const fallback = Buffer.from(checkBundle(bundle()), 'utf8');
  const fbPath = path.join(dir, 'content', 'fallback.js');
  fs.mkdirSync(path.dirname(fbPath), { recursive: true });
  fs.writeFileSync(fbPath, fallback);
  files.push({ name: 'content/fallback.js', data: fallback });

  const mf = Buffer.from(JSON.stringify(checkManifest(manifest(target)), null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'manifest.json'), mf);
  files.unshift({ name: 'manifest.json', data: mf });

  const archive = path.join(DIST, 'geonomore-' + target + '-' + VERSION + '.zip');
  fs.writeFileSync(archive, zip(files));

  console.log(target.padEnd(9) + files.length + ' dosya  ->  releases/extensions/' + target +
    '  ve  releases/extensions/' + path.basename(archive) + '  (' +
    Math.round(fs.statSync(archive).size / 1024) + ' KB)');
}
