// GeoNoMore logo2: kapusonlu anonim figur, yuzu ters konum ignesi bicimli bosluk.
// Bagimliliksiz: sekiller cokgene acilir, her boy kendi cozunurlugunde SS kat
// orneklenip ortalanir (kenar yumusatma), PNG make-icons.js'teki yazici ile.
//   node logo2.js <cikis> [a|b]
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = process.argv[2];
const VARIANT = process.argv[3] || 'a';
fs.mkdirSync(OUT, { recursive: true });

const BG = [20, 20, 20];        // #141414
const INK = [196, 242, 42];     // #C4F22A, zemine karsi ~15:1
const R_CORNER = 230;           // 1024 uzerinden, yuvarlak kose (~%22)
const SHIFT_Y = 60;             // figur butun halinde asagi: sekillere dokunmadan
const FACE_SCALE = 1.2;         // igne (yuz boslugu ve delik) kendi merkezinden buyuk
const HOLE_MIN = 0;             // delik her boyda; buyutulunce kucuklerde de seciliyor
const SHOULDER = 16;            // omuzlar iki yana bu kadar genis (128 px'te ~2 px)
const FACE_UP = 60;             // igne cenenin ustune: yalniz yuz ve delik yukari

// --- sekiller, 1024 koordinat ------------------------------------------------
const HOOD = [
  ['M', 560, 96],
  ['C', 660, 140, 728, 262, 750, 396],
  ['C', 770, 500, 768, 600, 742, 676],
  // Omuz: kapusonun bas kismindan (742,676 / 282,676) sonrasi disa acik
  ['C', 800, 716, 892 + SHOULDER, 752, 950 + SHOULDER, 822],
  ['L', 1010 + SHOULDER, 1024], ['L', 14 - SHOULDER, 1024], ['L', 74 - SHOULDER, 822],
  ['C', 132 - SHOULDER, 752, 224, 716, 282, 676],
  ['C', 256, 600, 254, 500, 276, 392],
  ['C', 300, 236, 410, 104, 560, 96],
  ['Z']
];
// Ters igne: bas yukarida, uc asagida. Buyutme bas merkezi sabit kalarak;
// kivrim ve kenar cizgileriyle cakisirsa cakissin, onlara dokunulmuyor.
const FACE = { cx: 512, cy: 478 - FACE_UP, r: 148 * FACE_SCALE, d: 268 * FACE_SCALE };
const HOLE_R = 64 * FACE_SCALE;
// Igne yalniz yatayda, merkezden iki yana bu kadar genis (128 px'te ~2.5 px).
// Afin olcek: tepe ile uc arasindaki teget dogrular teget kalir.
const FACE_WIDEN = 20;
const FACE_SX = (FACE.r + FACE_WIDEN) / FACE.r;
// Sapka ucu: yuzun ust kenari ortada yumusak bir cukurla asagi iner. Ayri parca
// degil, kenarin kendisi egiliyor: cos^2 tumsegi uclarda sifir egimle bittigi
// icin hicbir yerde kose yok. PEAK_W yarim genislik, PEAK_DEPTH derinlik.
// Golge: yuzun ust kenarinin merkeze dogru (yaricap boyunca) iceri alinmis
// kopyasi. Bant kapusonun kavsine paralel bir hilal: tepede SHADE_IN kalin,
// tepeden SHADE_SPAN acida sifira incelir, yanlardan asagi inmez.
const PEAK_W = 84;
const PEAK_DEPTH = 46;
const SHADE_IN = 54;
const SHADE_SPAN = 80 * Math.PI / 180;
const DOT_DOWN = 32;            // nokta igne icinde asagi (128 px'te ~4 px)
const SHADE = [83, 101, 22];   // lime ile zemin arasi: sapkanin golgesi
// Ikinci golge: ilkinin altinda, %40 daha koyu, ayni kavisle yanlardan
// neredeyse igne kenarinin bittigi yere kadar iner (teget nokta ~123 derece).
// Incelme cos^1: cos^2'den yavas, golge yanlarda daha uzun gorunur kalir.
const SHADE2_IN = 76;
const SHADE2_SPAN = 123 * Math.PI / 180;
const SHADE2_POW = 1;
const SHADE2 = SHADE.map(v => Math.round(v * 0.45));
// Kivrim: tepeden yuzun soluna inen kumas cizgisi. Kenar: kapusonun omuzla
// birlestigi yer, yuzun ucunun altindan iki yana.
// Kalemle cizilmis gibi: kivrim daha kavisli bir yay, kenar V degil yumusak U
// (iki egri ortada yatay tegetle birlesiyor, sivri dip yok).
const FOLD = flatten([['M', 548, 118], ['C', 462, 146, 384, 234, 368, 346]], 64);
const RIM = flatten([['M', 286, 690], ['C', 360, 762, 440, 812, 512, 812],
  ['C', 584, 812, 664, 762, 738, 690]], 96);

// Cizgiyi dolu cokgene cevir: her noktayi normali boyunca iki yana it.
// Kalinlik ortada tam, uclara dogru yumusakca %45'e iner; uclar sivri degil
// yarim daireyle kapanir.
function strokePoly(pts, w) {
  const L = [], R = [], H = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
    const t = i / (pts.length - 1);
    const h = w / 2 * (0.45 + 0.55 * Math.sin(Math.PI * t));
    H.push(h);
    L.push([pts[i][0] + nx * h, pts[i][1] + ny * h]);
    R.push([pts[i][0] - nx * h, pts[i][1] - ny * h]);
  }
  // Yuvarlak uc: uc noktanin cevresinde, L'den R'ye disa dogru yarim daire
  const cap = (p, from, to, h) => {
    const a0 = Math.atan2(from[1] - p[1], from[0] - p[0]);
    let a1 = Math.atan2(to[1] - p[1], to[0] - p[0]);
    if (a1 > a0) a1 -= 2 * Math.PI;   // saat yonunun tersine, disa
    const out = [];
    for (let s = 1; s < 16; s++) {
      const a = a0 + (a1 - a0) * s / 16;
      out.push([p[0] + h * Math.cos(a), p[1] + h * Math.sin(a)]);
    }
    return out;
  };
  const last = pts.length - 1;
  return L
    .concat(cap(pts[last], L[last], R[last], H[last]))
    .concat(R.slice().reverse())
    .concat(cap(pts[0], R[0], L[0], H[0]));
}

function flatten(cmds, steps = 96) {
  const pts = [];
  let cur;
  for (const c of cmds) {
    if (c[0] === 'M' || c[0] === 'L') { cur = [c[1], c[2]]; pts.push(cur); }
    else if (c[0] === 'C') {
      const [x0, y0] = cur, [, x1, y1, x2, y2, x3, y3] = c;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps, u = 1 - t;
        pts.push([u ** 3 * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * x3,
          u ** 3 * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * y3]);
      }
      cur = [x3, y3];
    }
  }
  return pts;
}

function pinPoly(p, dip = 0, inset = 0, span = SHADE_SPAN, pow = 2, steps = 240) {
  const k = p.r / p.d, px = p.r * Math.sqrt(1 - k * k), py = p.r * k;
  const a0 = Math.atan2(py, -px), a1 = Math.atan2(py, px) + 2 * Math.PI;  // ustten dolan
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * i / steps;
    // phi: tepeden aci (tepe 3pi/2'de). Iceri alma tepede tam, SHADE_SPAN'da sifir.
    const phi = a - 1.5 * Math.PI;
    const t = Math.abs(phi) < span ? inset * Math.cos(Math.PI / 2 * phi / span) ** pow : 0;
    pts.push([p.cx + (p.r - t) * Math.cos(a), p.cy + (p.r - t) * Math.sin(a)]);
  }
  pts.push([p.cx, p.cy + p.d]);
  return pts.map(([x, y]) => {
    const u = (x - p.cx) / PEAK_W;
    const bump = y < p.cy && Math.abs(u) < 1 ? Math.cos(Math.PI / 2 * u) ** 2 : 0;
    return [p.cx + (x - p.cx) * FACE_SX, y + dip * bump];
  });
}

function circlePoly(cx, cy, r, steps = 160) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = 2 * Math.PI * i / steps;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function roundRect(w, h, r, steps = 40) {
  const pts = [];
  const corner = (cx, cy, a0) => {
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (Math.PI / 2) * i / steps;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  corner(w - r, r, -Math.PI / 2);
  corner(w - r, h - r, 0);
  corner(r, h - r, Math.PI / 2);
  corner(r, r, Math.PI);
  return pts;
}

// Katmanlar sirayla ustune boyanir: [cokgen, renk]
// Figurun butun parcalari ayni miktar asagi; zemin ve kose yerinde
const move = pts => pts.map(([x, y]) => [x, y + SHIFT_Y]);

function layers(withHole) {
  const L = [[roundRect(1024, 1024, R_CORNER), BG], [move(flatten(HOOD)), INK], [move(pinPoly(FACE, PEAK_DEPTH)), SHADE],
    [move(pinPoly(FACE, PEAK_DEPTH, SHADE_IN)), SHADE2],
    [move(pinPoly(FACE, PEAK_DEPTH, SHADE2_IN, SHADE2_SPAN, SHADE2_POW)), BG]];
  if (withHole) L.push([move(circlePoly(FACE.cx, FACE.cy + DOT_DOWN, HOLE_R)), INK]);
  L.push([move(strokePoly(FOLD, 30)), BG], [move(strokePoly(RIM, 30)), BG]);
  return L;
}

// --- tarama --------------------------------------------------------------------
// Yuksek cozunurlukte her piksel bir renk indeksi (0 saydam). Satir tarama,
// cift-tek kurali. Kose maskesi ilk katman: dis koseler saydam kalir.
function raster(size, SS) {
  const N = size * SS, k = N / 1024;
  const idx = new Uint8Array(N * N);
  const palette = [null];
  const clip = new Uint8Array(N * N);
  layers(VARIANT === 'b' && size >= HOLE_MIN).forEach(([poly, color], li) => {
    palette.push(color);
    const ci = palette.length - 1;
    const P = poly.map(([x, y]) => [x * k, y * k]);
    const xs = [];
    for (let y = 0; y < N; y++) {
      const sy = y + 0.5;
      xs.length = 0;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        const [x1, y1] = P[i], [x2, y2] = P[j];
        if ((y1 > sy) !== (y2 > sy)) xs.push(x1 + (sy - y1) * (x2 - x1) / (y2 - y1));
      }
      xs.sort((a, b) => a - b);
      for (let n = 0; n + 1 < xs.length; n += 2) {
        const from = Math.max(0, Math.ceil(xs[n] - 0.5)), to = Math.min(N - 1, Math.floor(xs[n + 1] - 0.5));
        for (let x = from; x <= to; x++) {
          const o = y * N + x;
          if (li === 0) { clip[o] = 1; idx[o] = ci; }
          else if (clip[o]) idx[o] = ci;
        }
      }
    }
  });
  // SS x SS kutu ortalamasi, on carpilmis alfa
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const c = palette[idx[(y * SS + dy) * N + x * SS + dx]];
          if (c) { r += c[0]; g += c[1]; b += c[2]; a += 1; }
        }
      }
      const o = (y * size + x) * 4, n = SS * SS;
      if (a) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); }
      out[o + 3] = Math.round(255 * a / n);
    }
  }
  return out;
}

// --- PNG (make-icons.js ile ayni) ------------------------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8); return c ^ -1; }
function chunk(type, body) {
  const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
  const head = Buffer.concat([Buffer.from(type, 'latin1'), body]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(head) >>> 0);
  return Buffer.concat([len, head, crc]);
}
function encodePng(w, h, rgba) {
  const stride = w * 4, raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const icons = {};
for (const [s, SS] of [[1024, 3], [128, 8], [48, 8], [32, 8], [16, 8]]) {
  icons[s] = raster(s, SS);
  fs.writeFileSync(path.join(OUT, s + '.png'), encodePng(s, s, icons[s]));
}

// --- SVG kaynagi ---------------------------------------------------------------
const svgPath = cmds => cmds.map(c => c[0] === 'Z' ? 'Z' : c[0] + ' ' + c.slice(1).join(' ')).join(' ');
const polyD = pts => 'M ' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L ') + ' Z';
const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
// Iki SVG: buyuk boylar icin delikli, kucuk boylar (48 ve alti) icin deliksiz
const svgOf = withHole => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <!-- GeoNoMore logo2: kapusonlu anonim figur, yuzu ters konum ignesi bicimli
       bosluk. Koyu zemin, lime sembol (~15:1), yuvarlak kose. ${withHole ? '128 px ve ustu.' : '48 px ve alti: delik yok.'} -->
  <defs><clipPath id="k"><rect width="1024" height="1024" rx="${R_CORNER}"/></clipPath></defs>
  <g clip-path="url(#k)">
    <rect width="1024" height="1024" fill="${hex(BG)}"/>
    <g transform="translate(0 ${SHIFT_Y})">
      <path fill="${hex(INK)}" d="${svgPath(HOOD)}"/>
      <path fill="${hex(SHADE)}" d="${polyD(pinPoly(FACE, PEAK_DEPTH))}"/>
      <path fill="${hex(SHADE2)}" d="${polyD(pinPoly(FACE, PEAK_DEPTH, SHADE_IN))}"/>
      <path fill="${hex(BG)}" d="${polyD(pinPoly(FACE, PEAK_DEPTH, SHADE2_IN, SHADE2_SPAN, SHADE2_POW))}"/>${withHole ? `\n      <circle cx="${FACE.cx}" cy="${FACE.cy + DOT_DOWN}" r="${HOLE_R}" fill="${hex(INK)}"/>` : ''}
      <path fill="${hex(BG)}" d="${polyD(strokePoly(FOLD, 30))}"/>
      <path fill="${hex(BG)}" d="${polyD(strokePoly(RIM, 30))}"/>
    </g>
  </g>
</svg>
`;
fs.writeFileSync(path.join(OUT, 'logo2.svg'), svgOf(VARIANT === 'b'));
// Deliksiz kucuk surum yalniz delik bir boy esiginin ustundeyse anlamli
if (VARIANT === 'b' && HOLE_MIN > 16) fs.writeFileSync(path.join(OUT, 'logo2-small.svg'), svgOf(false));

// --- inceleme sayfasi: acik ve koyu arac cubugu, 16 px 8 kat ---------------
const W = 820, H = 520, sheet = Buffer.alloc(W * H * 4);
const fill = (x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const o = (y * W + x) * 4; sheet[o] = c[0]; sheet[o + 1] = c[1]; sheet[o + 2] = c[2]; sheet[o + 3] = 255; } };
const paste = (img, s, X, Y, scale = 1) => {
  for (let y = 0; y < s * scale; y++) for (let x = 0; x < s * scale; x++) {
    const si = ((Math.floor(y / scale)) * s + Math.floor(x / scale)) * 4, a = img[si + 3] / 255;
    const o = ((Y + y) * W + X + x) * 4;
    for (let c = 0; c < 3; c++) sheet[o + c] = Math.round(img[si + c] * a + sheet[o + c] * (1 - a));
  }
};
fill(0, 0, W, 200, [255, 255, 255]); fill(0, 200, W, 340, [32, 33, 36]);
fill(0, 340, W, 430, [255, 255, 255]); fill(0, 430, W, 475, [32, 33, 36]); fill(0, 475, W, H, [222, 225, 230]);
let x = 16;
for (const s of [128, 48, 32, 16]) { paste(icons[s], s, x, 36 + (128 - s) / 2); paste(icons[s], s, x, 206 + (128 - s) / 2); x += s + 30; }
paste(icons[16], 16, 440, 20, 8); paste(icons[32], 32, 600, 20, 4);
for (const [y, bg] of [[444, null], [489, null]]) {
  let bx = 20;
  for (let i = 0; i < 4; i++) { fill(bx, y, bx + 16, y + 16, [95, 99, 104]); bx += 28; }
  paste(icons[16], 16, bx, y); bx += 28;
  for (let i = 0; i < 2; i++) { fill(bx, y, bx + 16, y + 16, [26, 115, 232]); bx += 28; }
}
fs.writeFileSync(path.join(OUT, 'review.png'), encodePng(W, H, sheet));
console.log('ok', OUT, VARIANT);
