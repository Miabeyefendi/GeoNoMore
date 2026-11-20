// Arayüzü tarayıcıda açmak için küçük bir sunucu. Uzantıyı kurmadan bakmak
// içindir: tema, akordeon, yerleşim gibi şeyleri her seferinde paketleyip
// yeniden yüklemeden görmek çok vakit kazandırıyor.
//
//   node src/tools/preview.js
//   http://localhost:8137/ui/options.html
//
// chrome.* API'si yok, o yüzden HTML servis edilirken sahtesi enjekte ediliyor
// (mock-chrome.js). İkisi de src/tools altında, yani PAKETE GİRMİYOR.
// Gerçek davranışı burada test etme: ayarlar localStorage'da duruyor, arka plan
// betiği hiç çalışmıyor, konum yaması yok. Burası yalnız göze bakmak için.

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'extension');
const PORT = 8137;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  // Bu satır olmadan tarayıcı SVG'yi metin sanıyor ve logo boyutsuz kalıyor
  '.svg': 'image/svg+xml'
};

http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/ui/options.html';

  // Kök dışına çıkma denemesi
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('nope');
    return;
  }

  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404).end('yok: ' + rel);
      return;
    }

    const ext = path.extname(file);
    res.setHeader('Content-Type', TYPES[ext] || 'application/octet-stream');

    if (ext === '.html') {
      const mock = fs.readFileSync(path.join(__dirname, 'mock-chrome.js'), 'utf8');
      // İlk <script>'ten önce: options.js chrome.storage'ı hemen çağırıyor
      const out = buf.toString('utf8')
        .replace('<script', '<script>' + mock + '</script>\n  <script');
      res.end(out);
      return;
    }

    res.end(buf);
  });
}).listen(PORT, () => {
  console.log('onizleme: http://localhost:' + PORT + '/ui/options.html');
  console.log('          http://localhost:' + PORT + '/ui/popup.html');
});
