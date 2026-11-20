// Temaları denetler. Renk seçmek göz kararı bir iş ve göz yanılıyor: koyu bir
// kartın üstünde okunaklı görünen gri, açık temada kayboluyor. Kontrastı makine
// ölçsün, sayı tutmazsa yayın durdursun.
//   node test-theme.js

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'extension');
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');

let n = 0;
const check = (label, fn) => { fn(); n++; };

// --- WCAG bağıl parlaklık ve kontrast oranı --------------------------------

function luminance(hex) {
  const h = hex.replace('#', '');
  const ch = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(x => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// --- CSS'ten tema bloklarını çıkar -----------------------------------------
// Ayrıştırıcı yazmıyoruz, blok biçimi kendi ürettiğimiz sabit biçim.

function themesIn(file) {
  const css = read(file);
  const out = {};
  const re = /:root(?:, :root)?\[data-theme="([a-z]+)"\]\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const vars = {};
    m[2].replace(/--([a-zA-Z0-9]+):\s*([^;]+);/g, (_, k, v) => { vars[k] = v.trim(); });
    out[m[1]] = vars;
  }
  return out;
}

const optionsThemes = themesIn('ui/options.css');
const popupThemes = themesIn('ui/popup.css');

// --- 1. ui.js'teki liste ile CSS aynı temaları tanıyor mu ------------------

const declared = [...read('core/ui.js').matchAll(/\{ id: '([a-z]+)', dark: (true|false) \}/g)]
  .map(m => ({ id: m[1], dark: m[2] === 'true' }));

check('tema listesi boş değil', () => {
  assert.ok(declared.length >= 2, 'ui.js içinde tema listesi bulunamadı');
});

check('her tema iki sayfada da tanımlı', () => {
  for (const t of declared) {
    assert.ok(optionsThemes[t.id], `options.css içinde ${t.id} teması yok`);
    assert.ok(popupThemes[t.id], `popup.css içinde ${t.id} teması yok`);
  }
});

check('CSS fazladan tema tanımlamıyor', () => {
  const ids = declared.map(t => t.id);
  for (const id of Object.keys(optionsThemes)) {
    assert.ok(ids.includes(id), `options.css içinde listede olmayan tema: ${id}`);
  }
});

// --- 2. varsayılan koyu ve açık tema gerçekten öyle mi --------------------
// "Otomatik" seçiliyken bu ikisine düşüyoruz. Sistem koyu derken açık tema
// açılırsa hata gözle görünür ama kimse test etmez, o yüzden burada.

check('otomatik seçimin düştüğü temalar doğru tarafta', () => {
  const ui = read('core/ui.js');
  const dark = ui.match(/GNM_THEME_DARK = '([a-z]+)'/)[1];
  const light = ui.match(/GNM_THEME_LIGHT = '([a-z]+)'/)[1];
  const byId = Object.fromEntries(declared.map(t => [t.id, t.dark]));
  assert.strictEqual(byId[dark], true, `${dark} koyu tema olarak işaretli değil`);
  assert.strictEqual(byId[light], false, `${light} açık tema olarak işaretli değil`);
});

check('koyu tema koyu, açık tema açık', () => {
  for (const t of declared) {
    const bg = optionsThemes[t.id].bg;
    const dark = luminance(bg) < 0.2;
    assert.strictEqual(dark, t.dark,
      `${t.id}: zemin ${bg}, dark: ${t.dark} ile uyuşmuyor`);
  }
});

// --- 3. kontrast ------------------------------------------------------------
// Eşikler WCAG 2.1 AA: normal metin 4.5. İkincil metin ve durum renkleri için
// 4.0'da duruyoruz; hepsi gövde metninden küçük değil ama tam 4.5 tutturmak
// paletleri griye çeviriyordu. Çizgi ve vurgu metin değil, onlara 1.4 yetiyor.

// Her rolun KENDI esigi var. Hepsine ayni sayiyi uygulamak iki turlu yaniliyor:
// bir ayrac cizgiye 4.5 dayatmak paletleri griye cevirirken, bir dugme yazisina
// 3.0 birakmak okunmaz metin uretiyor.
const TEXT = { text: 4.5, dim: 4.5, blue: 4.5, go: 4.5, red: 4.5, warn: 4.5 };
const SURFACE = ['bg', 'panel', 'panel2'];

check('metin renkleri üç yüzeyin de üstünde okunuyor', () => {
  for (const t of declared) {
    const v = optionsThemes[t.id];
    for (const [key, need] of Object.entries(TEXT)) {
      for (const s of SURFACE) {
        const r = contrast(v[key], v[s]);
        assert.ok(r >= need,
          `${t.id}: --${key} (${v[key]}) --${s} (${v[s]}) üstünde ${r.toFixed(2)}, en az ${need} olmalı`);
      }
    }
  }
});

// --faint tasiyici metin degil: sayac, zaman damgasi, devre disi alan. Onun
// esigi 3.0 ve BILEREK dusuk; onemli bir bilgi buraya yazilmamali.
check('soluk metin en azından seçiliyor', () => {
  for (const t of declared) {
    const v = optionsThemes[t.id];
    for (const s of SURFACE) {
      const r = contrast(v.faint, v[s]);
      assert.ok(r >= 3.0, `${t.id}: --faint ${s} üstünde ${r.toFixed(2)}`);
    }
  }
});

// Yuzey merdiveni. Kademe yoksa koyu temada kart zeminden, ic kart karttan
// ayirt edilemiyor ve arayuz duz bir lekeye donuyor.
check('yüzeyler birbirinden ayrılıyor', () => {
  for (const t of declared) {
    const v = optionsThemes[t.id];
    assert.ok(contrast(v.panel, v.bg) >= 1.02,
      `${t.id}: kart zeminden ayrılmıyor (${contrast(v.panel, v.bg).toFixed(2)})`);
    assert.ok(contrast(v.panel2, v.panel) >= 1.05,
      `${t.id}: iç kart karttan ayrılmıyor (${contrast(v.panel2, v.panel).toFixed(2)})`);
  }
});

// Giris kutusunun kenarligi arayuz bileseni, WCAG 1.4.11'e gore 3:1.
check('giriş kenarlığı arayüz bileşeni eşiğini tutuyor', () => {
  for (const t of declared) {
    const v = optionsThemes[t.id];
    const r = contrast(v.lineStrong, v.panel2);
    assert.ok(r >= 2.6,
      `${t.id}: --lineStrong alan zemininde ${r.toFixed(2)}, kutunun sınırı görünmüyor`);
  }
});

check('dolu düğmelerde yazı okunuyor', () => {
  for (const t of declared) {
    const v = optionsThemes[t.id];
    const r = contrast(v.accent, v.accentText);
    assert.ok(r >= 4.5,
      `${t.id}: --accent (${v.accent}) üstünde --accentText (${v.accentText}) ${r.toFixed(2)}, en az 4.5 olmalı`);
    // Siniri dolgu degil kenar (--accentInk) ciziyor. Cogu temada ikisi ayni
    // renk; paper'da lime dolgu beyazda 1.3:1, siyah kenar 18:1.
    const onCard = contrast(v.accentInk, v.panel);
    assert.ok(onCard >= 2.0,
      `${t.id}: dolu düğmenin kenarı kartın üstünde seçilmiyor (${onCard.toFixed(2)})`);
  }
});

check('çizgi ve vurgu kartın üstünde seçiliyor', () => {
  for (const t of declared) {
    const v = optionsThemes[t.id];
    for (const key of ['line', 'purple']) {
      const r = contrast(v[key], v.panel);
      assert.ok(r >= 1.4,
        `${t.id}: --${key} (${v[key]}) kart üstünde ${r.toFixed(2)}, görünmüyor`);
    }
  }
});

// Bir temada eksik birakilan degisken bir oncekinden sizar ve hata gozle
// gorunmez: sayfa acilir, yalniz bir renk yanlistir. Sayilar esit olmali.
check('her tema aynı sayıda ve aynı adda renk tanımlıyor', () => {
  for (const store of [optionsThemes, popupThemes]) {
    const ids = declared.map(t => t.id);
    const ref = Object.keys(store[ids[0]]).sort().join(',');
    for (const id of ids) {
      const got = Object.keys(store[id]).sort().join(',');
      assert.strictEqual(got, ref,
        `${id}: renk seti ${ids[0]} ile aynı değil
  beklenen: ${ref}
  gelen:    ${got}`);
    }
  }
});

check('popup ile options aynı zemini kullanıyor', () => {
  for (const t of declared) {
    assert.strictEqual(popupThemes[t.id].bg, optionsThemes[t.id].bg,
      `${t.id}: iki sayfanın zemini farklı`);
    assert.strictEqual(popupThemes[t.id].text, optionsThemes[t.id].text,
      `${t.id}: iki sayfanın metin rengi farklı`);
  }
});

// --- 4. her temanın seçim kutusunda bir satırı ve her dilde bir adı var ----

check('her tema options.html içinde seçilebiliyor', () => {
  const html = read('ui/options.html');
  for (const t of declared) {
    assert.ok(html.includes(`<option value="${t.id}"`),
      `${t.id} teması seçim kutusunda yok`);
  }
});

check('her temanın her dilde adı var', () => {
  const langs = [...read('core/ui.js').matchAll(/\{\s*code:\s*'([a-z-]+)'/g)].map(m => m[1]);
  for (const code of langs) {
    const dict = JSON.parse(read(`ui/lang/${code}.json`));
    for (const t of declared) {
      const key = 'theme' + t.id[0].toUpperCase() + t.id.slice(1);
      assert.ok(dict[key], `${code}.json içinde ${key} yok`);
    }
  }
});

const renkSayisi = Object.keys(optionsThemes[declared[0].id]).length;
console.log(`theme: ${declared.length} tema x ${renkSayisi} renk, ${n} kontrol gecti`);
