// Sizinti denetimi: paketlenmis uzantiyi headless Edge/Chrome'a yukler, Tokyo'ya
// ayarlar, yerel bir test sayfasinda sitelerin gordugunu olcer.
//   node src/tools/build.js chromium
//   node src/tools/leak-check.js
// Bagimlilik yok. Kendi baslattigi tarayici surecini kapatir, baskasina dokunmaz.
// Not: Chrome 137+ --load-extension'i kapatti; Edge hala kabul ediyor.
// PAKETE GIRMIYOR: src/tools altinda.

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const EXT = path.join(ROOT, 'releases', 'extensions', 'chromium');
const PORT = 9334, WEB = 8199;
const WANT = { tz: 'Asia/Tokyo', lang: 'ja', lat: 35.6, lon: 139.6 };

function browserPath() {
  const list = [process.env.GNM_BROWSER,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
  const hit = list.find(p => p && fs.existsSync(p));
  if (!hit) throw new Error('Edge bulunamadi, GNM_BROWSER ver');
  return hit;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function json(url, method = 'GET') {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(url, { method }); return await r.json(); } catch (e) { await sleep(250); }
  }
  throw new Error('DevTools cevap vermiyor: ' + url);
}
function client(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0; const wait = new Map(); const events = [];
  ws.onmessage = m => {
    const msg = JSON.parse(m.data);
    if (msg.id && wait.has(msg.id)) {
      const { ok, no } = wait.get(msg.id); wait.delete(msg.id);
      msg.error ? no(new Error(msg.error.message)) : ok(msg.result);
    } else if (msg.method) events.push(msg.method);
  };
  const send = (method, params = {}) => new Promise((ok, no) => {
    const n = ++id; wait.set(n, { ok, no }); ws.send(JSON.stringify({ id: n, method, params }));
  });
  return { opened: new Promise(r => { ws.onopen = r; }), send, events, close: () => ws.close() };
}
async function evalIn(c, expr) {
  const r = await c.send('Runtime.evaluate', { expression: '(async () => {' + expr + '\n})()', awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result.value;
}
async function open(url) {
  const t = await json(`http://127.0.0.1:${PORT}/json/new?about:blank`, 'PUT');
  const c = client(t.webSocketDebuggerUrl); await c.opened;
  await c.send('Page.enable'); await c.send('Runtime.enable');
  c.events.length = 0;
  await c.send('Page.navigate', { url });
  for (let i = 0; i < 100 && !c.events.includes('Page.loadEventFired'); i++) await sleep(100);
  return c;
}

// --- test sayfasi: her olcum hatada bile bir deger dondurur -----------------
const WORKER = `
  const r = {};
  try { r.tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { r.tz = 'ERR ' + e; }
  try { r.locale = Intl.DateTimeFormat().resolvedOptions().locale; } catch (e) {}
  try { r.lang = navigator.language; r.langs = navigator.languages && navigator.languages.join(','); } catch (e) {}
  try { r.offset = new Date(2026, 0, 15).getTimezoneOffset(); } catch (e) {}
  try { r.temporal = typeof Temporal !== 'undefined' ? Temporal.Now.timeZoneId() : null; } catch (e) { r.temporal = 'ERR'; }
  const out = r;`;
const PAGE = `<!doctype html><meta charset="utf-8"><title>leak</title><script>
window.__r = (async () => {
  const R = {};
  const step = async (k, f) => { try { R[k] = await f(); } catch (e) { R[k] = 'ERR ' + (e && e.message || e); } };
  await step('main', () => { ${WORKER} return out; });
  // Uzantinin varligini ele veren iz (en erken an, sayfanin ilk betigi)
  await step('trace', () => ('__gnmOK' in window) || document.documentElement.hasAttribute('data-gnm-ok') ||
    JSON.stringify(performance.getEntriesByType('navigation')[0].toJSON()).indexOf('"gnm"') >= 0 ||
    performance.getEntriesByType('navigation')[0].serverTiming.some(function (e) { return e.name === 'gnm'; }));
  await step('dateString', () => new Date(2026, 0, 15, 12).toString());
  await step('geo', () => new Promise(res => {
    if (!navigator.geolocation) return res('none');
    navigator.geolocation.getCurrentPosition(p => res([+p.coords.latitude.toFixed(3), +p.coords.longitude.toFixed(3), p.coords.accuracy]),
      e => res('ERR ' + e.code + ' ' + e.message), { timeout: 4000 });
  }));
  const wsrc = ${JSON.stringify(WORKER)} + ' postMessage(out);';
  const wsrcShared = ${JSON.stringify(WORKER)} + ' onconnect = e => e.ports[0].postMessage(out);';
  const viaWorker = (make) => new Promise(res => {
    try { const w = make(); w.onmessage = e => res(e.data); w.onerror = e => res('ERR ' + (e.message || 'error')); setTimeout(() => res('TIMEOUT'), 4000); }
    catch (e) { res('ERR ' + e.message); }
  });
  await step('worker', () => viaWorker(() => new Worker(URL.createObjectURL(new Blob([wsrc], { type: 'text/javascript' })))));
  await step('workerUrl', () => viaWorker(() => new Worker('/w.js')));
  await step('workerModule', () => viaWorker(() => new Worker('/w.js', { type: 'module' })));
  await step('shared', () => new Promise(res => {
    try { const s = new SharedWorker('/sw.js'); s.port.onmessage = e => res(e.data); s.onerror = () => res('ERR'); setTimeout(() => res('TIMEOUT'), 4000); }
    catch (e) { res('ERR ' + e.message); }
  }));
  await step('iframe', () => new Promise(res => {
    const f = document.createElement('iframe'); document.body.appendChild(f);
    const w = f.contentWindow; res({ tz: w.Intl.DateTimeFormat().resolvedOptions().timeZone, lang: w.navigator.language });
  }));
  await step('headers', () => fetch('/echo').then(r => r.json()));
  await step('webrtc', () => new Promise(res => {
    try {
      const pc = new RTCPeerConnection({ iceServers: [] }); const ips = new Set();
      pc.createDataChannel('x'); pc.onicecandidate = e => { if (e.candidate) { const m = e.candidate.candidate.split(' '); ips.add(m[4] + ' ' + m[7]); } };
      pc.createOffer().then(o => pc.setLocalDescription(o));
      setTimeout(() => { pc.close(); res([...ips]); }, 2500);
    } catch (e) { res('ERR ' + e.message); }
  }));
  await step('keyboard', async () => {
    if (!navigator.keyboard || !navigator.keyboard.getLayoutMap) return 'none';
    const m = await navigator.keyboard.getLayoutMap(); return [m.get('KeyQ'), m.get('KeyW'), m.get('Semicolon'), m.get('BracketLeft')].join('');
  });
  await step('intlNumber', () => new Intl.NumberFormat().resolvedOptions().locale);
  // Gizleme atlatilabiliyor mu: bos iframe'in el degmemis getter'i ana kayit uzerinde
  await step('bootBypass', () => {
    const f = document.createElement('iframe'); document.body.appendChild(f);
    const g = Object.getOwnPropertyDescriptor(f.contentWindow.PerformanceResourceTiming.prototype, 'serverTiming').get;
    return g.call(performance.getEntriesByType('navigation')[0]).some(function (e) { return e.name === 'gnm'; });
  });
  // Gec olcum: ilk anki sizinti zamanlama mi, yoksa yama hic tutmuyor mu?
  await step('mainLate', () => { ${WORKER} return out; });
  await step('workerLate', () => viaWorker(() => new Worker(URL.createObjectURL(new Blob([wsrc], { type: 'text/javascript' })))));
  await step('iframeLate', () => new Promise(res => {
    const f = document.createElement('iframe'); document.body.appendChild(f);
    const w = f.contentWindow; res({ tz: w.Intl.DateTimeFormat().resolvedOptions().timeZone, lang: w.navigator.language,
      offset: new w.Date(2026, 0, 15).getTimezoneOffset() });
  }));
  return R;
})();
</script>`;

function server() {
  return http.createServer((req, res) => {
    if (req.url === '/echo') {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ acceptLanguage: req.headers['accept-language'] || null, gpc: req.headers['sec-gpc'] || null }));
    }
    if (req.url === '/w.js') { res.setHeader('content-type', 'text/javascript'); return res.end(WORKER + ' postMessage(out);'); }
    if (req.url === '/sw.js') { res.setHeader('content-type', 'text/javascript'); return res.end(WORKER + ' onconnect = e => e.ports[0].postMessage(out);'); }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(PAGE);
  }).listen(WEB, '127.0.0.1');
}

// --- degerlendirme: Tokyo disinda bir sey gorunuyorsa sizinti -------------------
function judge(R) {
  const rows = [];
  const add = (name, ok, got) => rows.push((ok ? 'OK    ' : 'LEAK  ') + name.padEnd(16) + JSON.stringify(got));
  const ctx = (name, o) => {
    if (!o || typeof o !== 'object') return add(name, false, o);
    add(name + '.tz', o.tz === WANT.tz, o.tz);
    add(name + '.lang', String(o.lang || '').startsWith(WANT.lang), o.lang + ' / ' + o.langs);
    add(name + '.offset', o.offset === -540, o.offset);
    if ('temporal' in o && o.temporal !== null) add(name + '.temporal', o.temporal === WANT.tz, o.temporal);
  };
  ctx('main', R.main);
  add('trace', R.trace === false, R.trace);
  add('bootBypass', R.bootBypass === false, R.bootBypass);
  add('dateString', /GMT\+0900/.test(R.dateString), R.dateString);
  add('geo', Array.isArray(R.geo) && Math.abs(R.geo[0] - WANT.lat) < 1 && Math.abs(R.geo[1] - WANT.lon) < 1, R.geo);
  for (const k of ['worker', 'workerUrl', 'workerModule', 'shared']) ctx(k, R[k]);
  for (const k of ['iframe', 'iframeLate']) {
    if (R[k] && typeof R[k] === 'object') {
      add(k + '.tz', R[k].tz === WANT.tz, R[k].tz);
      add(k + '.lang', String(R[k].lang).startsWith(WANT.lang), R[k].lang);
    } else add(k, false, R[k]);
  }
  ctx('mainLate', R.mainLate);
  ctx('workerLate', R.workerLate);
  add('hdr.accept-lang', R.headers && String(R.headers.acceptLanguage).startsWith(WANT.lang), R.headers && R.headers.acceptLanguage);
  add('hdr.sec-gpc', R.headers && R.headers.gpc === '1', R.headers && R.headers.gpc);
  const priv = Array.isArray(R.webrtc) && R.webrtc.some(s => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(s));
  add('webrtc.private', !priv, R.webrtc);
  add('keyboard', R.keyboard === 'none' || R.keyboard === 'qw;[', R.keyboard);
  add('intlNumber', String(R.intlNumber).startsWith(WANT.lang), R.intlNumber);
  return rows;
}

(async () => {
  if (!fs.existsSync(path.join(EXT, 'manifest.json'))) throw new Error('once: node src/tools/build.js chromium');
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'gnm-leak-'));
  const web = server();
  const proc = spawn(browserPath(), ['--headless=new', '--disable-gpu', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + prof, '--no-first-run', '--load-extension=' + EXT, '--disable-extensions-except=' + EXT,
    'about:blank'], { stdio: 'ignore' });
  try {
    await json(`http://127.0.0.1:${PORT}/json/version`);
    let id = null;
    for (let i = 0; i < 40 && !id; i++) {
      const list = await json(`http://127.0.0.1:${PORT}/json/list`);
      // Edge'in gomulu uzantilari da listede; bizimkini arka plan betiginden tani
      const sw = list.find(t => /^chrome-extension:\/\/[a-p]{32}\/background\/index\.js/.test(t.url));
      if (sw) id = sw.url.split('/')[2]; else await sleep(250);
    }
    if (!id) throw new Error('uzanti yuklenmedi (tarayici --load-extension kabul etmiyor olabilir)');
    console.log('uzanti: ' + id);

    // Ayarlar sayfasindan Tokyo sec ve calistir
    const o = await open(`chrome-extension://${id}/ui/options.html`);
    console.log('ayar: ' + await evalIn(o, `
      const S = ms => new Promise(r => setTimeout(r, ms)), $ = s => document.querySelector(s);
      for (let i = 0; i < 40 && !$('#country'); i++) await S(250);
      if (!$('#country')) return 'SAYFA YOK: ' + location.href + ' | ' + document.title + ' | ' + document.body.innerText.slice(0, 200);
      await S(500);
      const c = $('#country'); c.value = 'JP'; c.dispatchEvent(new Event('change', { bubbles: true })); await S(400);
      const ci = $('#city'); ci.value = 'Tokyo'; ci.dispatchEvent(new Event('change', { bubbles: true })); await S(400);
      if ($('#power').getAttribute('aria-pressed') !== 'true') $('#power').click();
      await S(1200);
      return $('#idPlace').textContent + ' / ' + $('#runstate').textContent;`));
    // GNM_EXT_DEBUG: uzanti sayfasinda (chrome.* erisimli) ek ifade
    if (process.env.GNM_EXT_DEBUG) console.log('ext: ' + JSON.stringify(await evalIn(o, process.env.GNM_EXT_DEBUG)));
    o.close();

    const p = await open(`http://127.0.0.1:${WEB}/`);
    const R = await evalIn(p, 'return await window.__r;');
    // GNM_DEBUG: sayfada ek ifade calistir (teshis icin)
    if (process.env.GNM_DEBUG) console.log('debug: ' + JSON.stringify(await evalIn(p, process.env.GNM_DEBUG)));
    p.close();
    fs.writeFileSync(path.join(os.tmpdir(), 'gnm-leak-result.json'), JSON.stringify(R, null, 1));
    const rows = judge(R);
    rows.forEach(r => console.log(r));
    const leaks = rows.filter(r => r.startsWith('LEAK')).length;
    console.log(leaks ? leaks + ' sizinti' : 'sizinti yok');
    process.exitCode = leaks ? 1 : 0;
  } finally {
    proc.kill();
    web.close();
    await sleep(600);
    try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { /* kilitli kalabilir */ }
  }
})().catch(e => { console.error(e.message); process.exitCode = 2; });
