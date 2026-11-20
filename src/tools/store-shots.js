// Magaza gorselleri icin ekran cekici. Bagimlilik yok: Edge/Chrome'u headless
// acar, DevTools protokolune Node'un kendi WebSocket'i ile baglanir.
//   node src/tools/store-shots.js <is.json>
//
// is.json: [{ url, w, h, dpr, js, wait, out }, ...]
//   js   sayfa yuklendikten sonra calisan kod (async olabilir): durumu kurar
//   wait ms, js'ten sonra (harita karolari icin)
//   out  PNG yolu (cwd'ye gore)
// Tarayici yolu: GNM_BROWSER ortam degiskeni, yoksa bilinen Windows yollari.
// PAKETE GIRMIYOR: src/tools altinda.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

// .js ise module.exports = [...] (ortak on kod paylasilabilsin), degilse JSON
const jobs = /\.js$/.test(process.argv[2])
  ? require(path.resolve(process.argv[2]))
  : JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const PORT = 9333;

function browserPath() {
  const list = [process.env.GNM_BROWSER,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
  const hit = list.find(p => p && fs.existsSync(p));
  if (!hit) throw new Error('tarayici bulunamadi, GNM_BROWSER ver');
  return hit;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function json(url, method = 'GET') {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(url, { method }); return await r.json(); } catch (e) { await sleep(200); }
  }
  throw new Error('DevTools cevap vermiyor: ' + url);
}

function client(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const wait = new Map();
  const events = [];
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
  const opened = new Promise(r => { ws.onopen = r; });
  return { opened, send, events, close: () => ws.close() };
}

(async () => {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'gnm-shots-'));
  const proc = spawn(browserPath(), ['--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + prof, '--no-first-run', 'about:blank'],
  { stdio: 'ignore' });
  try {
    await json(`http://127.0.0.1:${PORT}/json/version`);
    for (const job of jobs) {
      const t = await json(`http://127.0.0.1:${PORT}/json/new?about:blank`, 'PUT');
      const c = client(t.webSocketDebuggerUrl);
      await c.opened;
      await c.send('Page.enable');
      await c.send('Runtime.enable');
      await c.send('Emulation.setDeviceMetricsOverride',
        { width: job.w, height: job.h, deviceScaleFactor: job.dpr || 1, mobile: false });
      // transparent: saydam zemin (magaza ikonu gibi kenar boslugu saydam olmali)
      if (job.transparent) await c.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
      // fresh: onceki cekimin localStorage durumu tasinmasin (sayaclar tutarli kalsin)
      if (job.fresh) {
        await c.send('Storage.clearDataForOrigin',
          { origin: new URL(job.url).origin, storageTypes: 'local_storage' }).catch(() => {});
      }
      c.events.length = 0;
      await c.send('Page.navigate', { url: job.url });
      for (let i = 0; i < 100 && !c.events.includes('Page.loadEventFired'); i++) await sleep(100);
      await sleep(400);
      if (job.js) {
        const r = await c.send('Runtime.evaluate',
          { expression: '(async () => {' + job.js + '\n})()', awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(job.out + ': ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
      }
      await sleep(job.wait || 300);
      const shot = await c.send('Page.captureScreenshot', { format: 'png' });
      fs.mkdirSync(path.dirname(job.out), { recursive: true });
      // rects: { ad: secici } -> cikti yaninda .json, css px [x, y, w, h]
      if (job.rects) {
        const r = await c.send('Runtime.evaluate', { returnByValue: true, expression:
          '(' + function (m) {
            const o = {};
            for (const k in m) {
              const el = document.querySelector(m[k]);
              if (el) { const b = el.getBoundingClientRect(); o[k] = [b.x, b.y, b.width, b.height].map(Math.round); }
            }
            return o;
          } + ')(' + JSON.stringify(job.rects) + ')' });
        fs.writeFileSync(job.out.replace(/\.png$/, '.json'), JSON.stringify(r.result.value));
      }
      fs.writeFileSync(job.out, Buffer.from(shot.data, 'base64'));
      console.log('yazildi: ' + job.out);
      c.close();
      await fetch(`http://127.0.0.1:${PORT}/json/close/${t.id}`).catch(() => {});
    }
  } finally {
    proc.kill();
    await sleep(500);
    try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { /* kilitli kalabilir */ }
  }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
