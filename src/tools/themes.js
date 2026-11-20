// Tema üreteci. Renk sabitleri elle yazılmıyor, buradan çıkıyor.
//   node src/tools/themes.js
//
// Neden bir üreteç: 16 tema x 23 renk = 368 değer var ve her birinin bir
// kontrast kuralı var. Elle tutulamaz. Test kuralları DENETLİYOR ama değer
// üretemiyor; üretmek buranın işi.
//
// Paletin tamamı bir çekirdekten türüyor:
//   yüzeyler   bir açıklık merdiveni (zemin, kart, iç kart, katman)
//   metinler   yüzeylere göre kontrast hedefinden
//   etkileşim  kendi çiftiyle (dolu zemin + üstündeki yazı)
//
// Vantagraph ile başlayanlar dışarıdan gelen paletler (Spicetify teması).
// Onların renkleri KORUNUYOR; yalnız eşiği tutmayanlar tonu bozulmadan
// açılıyor, çünkü Spotify arayüzünde yeterli olan bir gri ayar sayfasında
// okunmuyor.

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'extension');

// --- renk işleri ------------------------------------------------------------

function rgb(h) {
  const s = h.replace('#', '');
  return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16) / 255);
}

function hex(c) {
  return '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v * 255)))
    .toString(16).padStart(2, '0')).join('');
}

function lum(h) {
  const c = rgb(h).map(x => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function ratio(a, b) {
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function toHsl([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (mx === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return hex([l, l, l]);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = t => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return hex([f(h + 1 / 3), f(h), f(h - 1 / 3)]);
}

function shiftL(h, d) {
  const [hh, s, l] = toHsl(rgb(h));
  return hsl(hh, s, Math.max(0, Math.min(1, l + d)));
}

function mix(a, b, t) {
  const ra = rgb(a), rb = rgb(b);
  return hex([0, 1, 2].map(i => ra[i] * (1 - t) + rb[i] * t));
}

function rgba(h, a) {
  const c = rgb(h).map(v => Math.round(v * 255));
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
}

// Tonu ve doygunluğu koruyup açıklığı kaydırarak eşiğe çıkar. Palet kimliği
// bozulmuyor, yalnız okunur hale geliyor.
function toward(color, surfaces, need, dark) {
  const step = dark ? 0.015 : -0.015;
  for (let i = 0; i < 70; i++) {
    const cand = shiftL(color, step * i);
    if (Math.min(...surfaces.map(s => ratio(cand, s))) >= need) return cand;
  }
  return shiftL(color, step * 69);
}

// Dolu düğme çifti: zemin + üstündeki yazı.
//
// DIKKAT, buranın bir geçmişi var. Önceki sürüm rengi hsl(ton, doygunluk, x)
// ile YENIDEN KURUYORDU ve doygunluğa alt sınır koyuyordu. Sonuç: Vanta Black'in
// nötr grisi (#b0b5b0, doygunluk 0.02) parlak yeşile (#26d926) döndü, Vanta
// White'ın siyahı kirli kırmızıya. Dışarıdan gelen bir paleti böyle bozmak
// kabul edilemez.
//
// Kural: VERILEN RENGE DOKUNMA. Önce olduğu gibi dene; siyah ya da beyazdan
// biri üstünde okunuyorsa iş bitti. Olmuyorsa yalnız AÇIKLIK kaydır, ton ve
// doygunluk aynen kalsın.
function inkFor(c) {
  return ratio(c, '#ffffff') >= ratio(c, '#000000') ? '#ffffff' : '#000000';
}

function solidFrom(base, panel) {
  const tryIt = c => {
    const ink = inkFor(c);
    return (ratio(c, ink) >= 4.5 && ratio(c, panel) >= 3.0) ? [c, ink] : null;
  };
  const asIs = tryIt(base);
  if (asIs) return asIs;

  for (let i = 1; i < 60; i++) {
    for (const d of [-0.012 * i, 0.012 * i]) {
      const hit = tryIt(shiftL(base, d));
      if (hit) return hit;
    }
  }
  return [base, inkFor(base)];
}

// Kendi temalarımızda başlangıç rengi yok, tondan kuruluyor. Burada yeniden
// kurmak serbest çünkü ortada korunacak bir palet yok.
function solidFromHue(hue, sat, panel) {
  for (let i = 0; i < 100; i++) {
    for (const l of [0.5 + 0.006 * i, 0.5 - 0.006 * i]) {
      if (l <= 0.05 || l >= 0.95) continue;
      const hit = solidFrom(hsl(hue, sat, l), panel);
      if (ratio(hit[0], hit[1]) >= 4.5 && ratio(hit[0], panel) >= 3.0) return hit;
    }
  }
  return solidFrom(hsl(hue, sat, 0.4), panel);
}

// --- çekirdekler ------------------------------------------------------------

// ink ve paper siyah-beyaz: yuzeyde ton yok (sat 0), renk yalniz vurguda.
// Uyari vurgudan turemiyor (warnHue), yoksa uyari ile secili dugme ayni lime.
//
// paper'in bir istisnasi var. Lime beyaz ustunde 1.3:1; uretec onu 3:1'e
// cekince zeytin yesili cikiyordu, lime degil. Burada vurgu SABIT (fill) ve
// kartla ayrilma isini lime degil siyah kenar (ink) tasiyor: kenarlik, odak
// halkasi, isaret cizgisi --accentInk. Metin rengi --blue da o siyah.
const SEEDS = [
  { id: 'ink', hue: 0, sat: 0, aHue: 75, aSat: 0.85, warnHue: 38, dark: true },
  { id: 'paper', hue: 0, sat: 0, aHue: 75, aSat: 0.85, warnHue: 38, dark: false,
    fill: '#c4f22a', ink: '#141414' },
  { id: 'slate', hue: 202, sat: 0.13, aHue: 197, aSat: 0.30, dark: true },
  { id: 'indigo', hue: 246, sat: 0.2, aHue: 250, aSat: 0.3, dark: true },
  { id: 'brick', hue: 14, sat: 0.12, aHue: 10, aSat: 0.42, dark: true },
  { id: 'mist', hue: 200, sat: 0.1, aHue: 200, aSat: 0.34, dark: false },
  { id: 'carbon', hue: 210, sat: 0.1, aHue: 208, aSat: 0.26, dark: false },
  { id: 'moss', hue: 142, sat: 0.08, aHue: 145, aSat: 0.32, dark: false }
];

// Koyu temada yükseklik gölgeyle değil PARLAKLIKLA anlatılıyor: yüzey
// yükseldikçe açılıyor. Açık temada tersi.
const DARK_STEPS = [0.055, 0.095, 0.135, 0.175];
const LIGHT_STEPS = [0.965, 1.0, 0.945, 1.0];

function build(seed) {
  const { id, hue, sat, aHue, aSat, dark } = seed;
  const steps = dark ? DARK_STEPS : LIGHT_STEPS;
  const bg = hsl(hue, dark ? sat : sat * 0.5, steps[0]);
  const panel = hsl(hue, dark ? sat : sat * 0.5, steps[1]);
  const panel2 = hsl(hue, dark ? sat : sat * 0.6, steps[2]);
  const float = hsl(hue, dark ? sat : sat * 0.5, steps[3]);
  const surf = [bg, panel, panel2];

  // 0.97 degil 0.90: neredeyse beyaz metin koyu zeminde parliyor (halation).
  // 0.08 degil 0.13: saf siyah da acik zeminde ayni sekilde sert.
  const text = toward(hsl(hue, sat * 0.5, dark ? 0.90 : 0.13), surf, 4.5, dark);
  const dim = toward(hsl(hue, sat * 1.6, dark ? 0.66 : 0.36), surf, 4.5, dark);
  const faint = toward(hsl(hue, sat * 1.4, dark ? 0.52 : 0.5), surf, 3.0, dark);

  const [accent, accentText] = seed.fill
    ? [seed.fill, inkFor(seed.fill)]
    : solidFromHue(aHue, aSat, panel);
  const accentInk = seed.ink || accent;
  const warn = seed.warnHue === undefined ? undefined
    : toward(hsl(seed.warnHue, 0.9, dark ? 0.6 : 0.4), surf, 4.5, dark);

  return finish(id, dark, {
    bg, panel, panel2, float, text, dim, faint, accent, accentText, accentInk, warn,
    line: toward(hsl(hue, sat * 1.2, dark ? 0.3 : 0.8), [panel], 1.5, dark),
    // Giris kutusunun zemini --panel2, kenarligi orada da gorunmeli
    lineStrong: toward(hsl(hue, sat * 1.2, dark ? 0.42 : 0.62), [panel, panel2], 3.0, dark),
    blue: seed.ink || toward(hsl(aHue, aSat * 1.2, dark ? 0.7 : 0.34), surf, 4.5, dark),
    mapbg: shiftL(panel, dark ? -0.02 : -0.04),
    bar: rgba(bg, '.95')
  });
}

const fixed = [];

function fromVanta(id, p) {
  const hx = k => '#' + p[k].toLowerCase();
  const bg = hx('window'), panel = hx('panel');
  const dark = lum(bg) < 0.2;

  let panel2 = hx('hover');
  if (ratio(panel2, panel) < 1.06) panel2 = shiftL(panel, dark ? 0.05 : -0.05);
  const surf = [bg, panel, panel2];

  const need = (color, target, role) => {
    const out = toward(color, surf, target, dark);
    if (out !== color) fixed.push([id, role, color, out]);
    return out;
  };

  // Vurgu OLDUGU GIBI. Doygunluğa alt sınır YOK, ton hiç değişmiyor.
  const [accent, accentText] = solidFrom(hx('accent'), panel);

  let line = hx('stroke');
  if (ratio(line, panel) < 1.5) {
    line = toward(line, [panel], 1.5, dark);
    fixed.push([id, 'line', hx('stroke'), line]);
  }

  return finish(id, dark, {
    bg, panel, panel2, float: hx('menu'), accent, accentText, line,
    text: need(hx('text'), 4.5, 'text'),
    dim: need(hx('subtext'), 4.5, 'dim'),
    faint: need(hx('subtext'), 3.0, 'faint'),
    lineStrong: toward(hx('stroke'), [panel, panel2], 3.0, dark),
    blue: need(hx('btn'), 4.5, 'blue'),
    go: need(hx('fill'), 4.5, 'go'),
    red: need(hx('heart'), 4.5, 'red'),
    mapbg: hx('barbg'),
    bar: rgba(hx('player'), '.95')
  });
}

// İki yoldan gelen paletin ortak kuyruğu: kalan roller ve türevler.
function finish(id, dark, v) {
  const surf = [v.bg, v.panel, v.panel2];
  if (!v.go) v.go = toward(hsl(148, 0.34, dark ? 0.62 : 0.32), surf, 4.5, dark);
  if (!v.red) v.red = toward(hsl(6, 0.52, dark ? 0.68 : 0.42), surf, 4.5, dark);

  // Uyarı rengi. Önceki sürüm burada sabit bir turuncu üretiyordu (#cfac77) ve
  // o renk paletin hiçbir yerinde yoktu; on altı temanın hepsinde aynı turuncu
  // duruyordu. Artık paletin kendi vurgusundan geliyor: ton ve doygunluk
  // vurgunun, açıklık okunurluğun.
  const warn = v.warn || toward(v.accent, surf, 4.5, dark);

  // Vurgunun karta karistirilmis hali. Secili satir, etkin sekme, isaretli
  // grup gibi yerlerde dolu vurgu fazla bagiriyor; bu onun sessiz karsiligi.
  // Uzerine --text biniyor, o yuzden karttan cok uzaklasmiyor.
  const accentSoft = mix(v.accent, v.panel, dark ? 0.84 : 0.88);

  // Sayfa ve sol menu icin iki duraklı cok hafif bir gecis. Duz tek renk
  // koyu temada karton gibi duruyordu; fark gozle secilmeyecek kadar az ama
  // yuzeyin olu olmadigini soyluyor. Dugmelerde gradient YOK, orada renk
  // tasiyici bilgi.
  const washFrom = v.bg;
  const washTo = shiftL(v.bg, dark ? 0.028 : -0.018);

  return [id, dark, {
    bg: v.bg, panel: v.panel, panel2: v.panel2,
    accentSoft: accentSoft, washFrom: washFrom, washTo: washTo,
    line: v.line, lineStrong: v.lineStrong,
    text: v.text, dim: v.dim, faint: v.faint,
    blue: v.blue,
    // --purple eski adı, hâlâ odak halkası olarak kullanılıyor
    purple: v.lineStrong,
    accent: v.accent, accentText: v.accentText,
    // Vurgunun CIZGI hali: kenarlik, odak halkasi, isaret. Cogu temada
    // vurgunun kendisi; dolgusu kartla ayrilmayan temada (paper) siyah.
    accentInk: v.accentInk || v.accent,
    accentHover: shiftL(v.accent, dark ? 0.06 : -0.06),
    orange: warn, red: v.red, go: v.go, warn: warn,
    mapbg: v.mapbg,
    zebra: rgba(v.text, dark ? '.035' : '.05'),
    dangerline: mix(v.red, v.panel, 0.62),
    bar: v.bar,
    float: rgba(v.float, '.96'),
    warnbg: mix(warn, v.panel, 0.82)
  }];
}

const VANTA = require('./vanta-palettes.json');
const ORDER = ['vcrimson', 'vgreenify', 'volive', 'vteal', 'vwhite',
  'vlavender', 'vmidnight', 'vrose', 'vblack', 'vindigo'];

const THEMES = SEEDS.map(build).concat(ORDER.map(id => fromVanta(id, VANTA[id])));

// --- denetim ----------------------------------------------------------------
// Test de aynı kuralları koşuyor. Burada da bakıyoruz ki bozuk bir CSS hiç
// yazılmasın; testin kırmızı yanması için önce dosyanın bozulması gerekirdi.

const KEYS = ['bg', 'panel', 'panel2', 'accentSoft', 'washFrom', 'washTo', 'line', 'lineStrong', 'text', 'dim',
  'faint', 'blue', 'purple', 'accent', 'accentText', 'accentInk', 'accentHover', 'orange',
  'red', 'go', 'mapbg', 'zebra', 'dangerline', 'warn', 'bar', 'float', 'warnbg'];

let fail = 0;
console.log('tema        text   dim    faint  go     red    warn   dugme  kenar  kademe');
for (const [id, dark, v] of THEMES) {
  const eksik = KEYS.filter(k => !v[k]);
  if (eksik.length) { console.log('EKSIK', id, eksik.join(',')); fail++; continue; }
  const surf = [v.bg, v.panel, v.panel2];
  const cells = [];
  for (const [role, need] of [['text', 4.5], ['dim', 4.5], ['faint', 3.0],
    ['go', 4.5], ['red', 4.5], ['warn', 4.5]]) {
    const r = Math.min(...surf.map(s => ratio(v[role], s)));
    cells.push(r.toFixed(2) + (r < need ? '!' : ' '));
    if (r < need) fail++;
  }
  const btn = ratio(v.accent, v.accentText);
  if (btn < 4.5) fail++;
  // Dolu dugme karttan ayrilmali: kenari (--accentInk) en az 2:1.
  const kenar = ratio(v.accentInk, v.panel);
  if (kenar < 2.0) { console.log('KENAR GORUNMUYOR', id); fail++; }
  const kademe = ratio(v.panel2, v.panel);
  if (kademe < 1.05) { console.log('KADEME YOK', id); fail++; }
  console.log(id.padEnd(11) + cells.join(' ') + ' ' +
    btn.toFixed(2).padEnd(6) + ' ' + kenar.toFixed(2).padEnd(6) + ' ' + kademe.toFixed(2));
}

if (fixed.length) {
  console.log('\nVantagraph paletlerinde esige cekilenler:');
  for (const [id, role, a, b] of fixed) {
    console.log('  ' + id.padEnd(11) + '--' + role.padEnd(7) + a + ' -> ' + b);
  }
}

if (fail) {
  console.error('\n' + fail + ' deger esigin altinda, CSS yazilmadi.');
  process.exit(1);
}
console.log('\n' + THEMES.length + ' tema, her birinde ' + KEYS.length + ' renk, hepsi gecti');

// --- yaz --------------------------------------------------------------------

const OPT_KEYS = KEYS.filter(k => k !== 'warnbg');
const POP_KEYS = ['bg', 'panel', 'panel2', 'accentSoft', 'washFrom', 'washTo', 'line', 'lineStrong', 'text', 'dim',
  'faint', 'blue', 'purple', 'accent', 'accentText', 'accentInk', 'accentHover', 'orange',
  'red', 'go', 'warnbg'];

const HEAD = `/* Temalar. Bu blok ELLE DUZENLENMEZ, src/tools/themes.js uretiyor.

   Paletin tamami bir cekirdekten turuyor: yuzeyler bir aciklik merdiveni,
   metinler kontrast hedefinden, etkilesim renkleri kendi ciftiyle. Vantagraph
   ile baslayanlar disaridan gelen paletler; renkleri korunuyor, yalniz esigi
   tutmayanlar tonu bozulmadan aciliyor.

   Her rolun KENDI esigi var, cunku isleri farkli:
     --text --dim --blue --go --red --warn      4.5  metin
     --faint                                    3.0  sus, tasiyici degil
     --accent uzerinde --accentText             4.5  dolu dugme yazisi
     --accentInk   vurgunun cizgisi, kartta     2.0  dolu dugmenin siniri
     --lineStrong  giris kenarligi              3.0  arayuz bileseni
     --line        ayrac                        1.5  yalnizca secilebilsin

   Yuzeyler dort kademe: --bg zemin, --panel kart, --panel2 ic kart ve satir
   vurgusu, --float katman. Koyu temada yukseklik golgeyle degil parlaklikla
   anlatiliyor: yukseldikce aciliyor.

   Olcumu src/tests/test-theme.js yapiyor, tutmayan bir deger yayini durdurur. */

`;

function block(keys) {
  let out = HEAD;
  THEMES.forEach(([id, dark, v], i) => {
    out += (i === 0 ? `:root, :root[data-theme="${id}"]` : `:root[data-theme="${id}"]`) + ' {\n';
    for (const k of keys) out += `  --${k}: ${v[k]};\n`;
    out += '}\n\n';
  });
  return out;
}

for (const [file, keys] of [['ui/options.css', OPT_KEYS], ['ui/popup.css', POP_KEYS]]) {
  const p = path.join(SRC, file);
  const s = fs.readFileSync(p, 'utf8');
  const start = s.indexOf('/* Temalar');
  const end = s.indexOf('* { box-sizing: border-box; }');
  fs.writeFileSync(p, s.slice(0, start) + block(keys) + s.slice(end));
  console.log('yazildi: ' + file);
}

const uiPath = path.join(SRC, 'core/ui.js');
let ui = fs.readFileSync(uiPath, 'utf8');
const a = ui.indexOf('var GNM_THEMES = [');
const b = ui.indexOf('];', a) + 3;
const rows = THEMES.map(([id, dark]) => `  { id: '${id}', dark: ${dark} }`).join(',\n');
fs.writeFileSync(uiPath, ui.slice(0, a) + 'var GNM_THEMES = [\n' + rows + '\n];\n' + ui.slice(b));
console.log('yazildi: core/ui.js');
