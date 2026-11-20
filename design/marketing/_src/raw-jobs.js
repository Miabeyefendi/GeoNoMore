// Ham arayuz cekimleri: her tarayici icin ayri. Onizleme sunucusu acik olmali
// (node src/tools/preview.js), sonra:
//   node src/tools/store-shots.js design/marketing/_src/raw-jobs.js
// Ayarlar sayfasi 1100 css px genis, 2x: slaytta ~1:1 gosterilince arayuz
// yazisi okunur kalir. Her cekim temiz depolamayla baslar (fresh), yanina
// isaret ve kirpma icin oge konumlari (.json) yazilir.
const BASE = 'http://localhost:8137/ui/';
const OUT = 'design/marketing/_src/raw/';

// Ortak kurulum: ulke/sehir sec, calistir, gerekirse gelismis mod, sekme, rota
const setup = (country, city, opt = {}) => `
  const S = ms => new Promise(r => setTimeout(r, ms));
  const $ = s => document.querySelector(s);
  await S(600);
  const c = $('#country'); c.value = '${country}'; c.dispatchEvent(new Event('change', { bubbles: true }));
  await S(300);
  const ci = $('#city'); if (ci) { ci.value = '${city}'; ci.dispatchEvent(new Event('change', { bubbles: true })); }
  await S(300);
  if ($('#power').getAttribute('aria-pressed') !== 'true') $('#power').click();
  await S(300);
  ${opt.advanced ? "$('#uiMode [data-v=advanced]') && $('#uiMode [data-v=advanced]').click(); await S(300);" : ''}
  ${opt.mode ? `$('#locMode [data-v=${opt.mode}]').click(); await S(400);` : ''}
  ${opt.route ? `
  // Rota: haritaya sirayla tikla (secim modu acikken)
  $('#pickPoints').click(); await S(200);
  const mr = $('#map').getBoundingClientRect();
  for (const [fx, fy] of ${JSON.stringify(opt.route)}) {
    const x = mr.left + mr.width * fx, y = mr.top + mr.height * fy, t = document.elementFromPoint(x, y);
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
      t.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }));
    await S(250);
  }
  $('#pickPoints').click(); await S(300);` : ''}
  ${opt.tab ? `$('#tabs [data-tab=${opt.tab}]').click(); await S(400);` : ''}
  ${opt.fp ? "const m = $('[data-master=fp]'); if (m && m.getAttribute('aria-pressed') !== 'true') m.click(); await S(300);" : ''}
  ${opt.etp ? "const e = $('#etpAlways'); if (e && !e.checked) e.click(); await S(300);" : ''}
  // Onizlemede surum 'preview' gorunuyor, gercek pakettekini yaz
  const v = $('#version'); if (v) v.textContent = 'v5.1.0';
`;

const W = 1100, H = 700;
const jobs = [];
for (const b of ['chromium', 'firefox']) {
  const q = b === 'firefox' ? '?browser=firefox' : '';
  const only = b === 'firefox' ? '#etpAlways' : '#noSandbox';
  const opt = (o) => Object.assign({ w: W, h: H, dpr: 2, fresh: true }, o);
  jobs.push(
    opt({ url: BASE + 'options.html' + q, wait: 3500,
      js: setup('JP', 'Tokyo', { mode: 'zone' }), out: OUT + b + '-location.png' }),
    opt({ url: BASE + 'options.html' + q, wait: 3500,
      js: setup('FR', 'Paris', { mode: 'moving', advanced: true,
        // Rota panelin (sol alt) disinda, haritanin sag yarisinda
        route: [[0.50, 0.30], [0.64, 0.50], [0.80, 0.36], [0.74, 0.70]] }),
      out: OUT + b + '-moving.png' }),
    // Koruma: izleme kartinin son satiri 700'un altinda, bu cekim daha uzun
    opt({ url: BASE + 'options.html' + q, wait: 3000, h: 900,
      js: setup('DE', 'Berlin', { advanced: true, tab: 'protect', fp: true, etp: b === 'firefox' }),
      rects: { track: '[data-grp=track]', only: '.opt:has(' + only + ') .lblrow', fp: '[data-grp=fp]' },
      out: OUT + b + '-protect.png' }),
    // Kimlik: seritte saat dilimi sutunu sabit genis, 'America/New_York' kesiliyordu;
    // kisa adli Londra secildi, cekim de biraz genis
    opt({ url: BASE + 'options.html' + q, wait: 1500, w: 1200,
      js: setup('GB', 'London', { advanced: true, tab: 'identity' }),
      rects: { strip: '#idStrip' },
      out: OUT + b + '-identity.png' }),
    { url: BASE + 'popup.html' + q, w: 320, h: 470, dpr: 2, wait: 400, fresh: true,
      js: setup('JP', 'Tokyo'), out: OUT + b + '-popup.png' }
  );
}
module.exports = jobs;
