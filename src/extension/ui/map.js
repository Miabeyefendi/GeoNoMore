// Küçük kaydırmalı harita. OpenStreetMap karoları düz <img>, kütüphane yok.
// Leaflet'in %5'ini kullanacaktık, 140 KB taşımaya değmedi.
//
// gnmMap(el, { lat, lon, zoom, onPick }) -> { setView, setMarker, setZones, getMarker }

// Karo sunucuları. Hiçbiri anahtar istemiyor. Varsayılan OSM; bir kullanıcının
// IP'si OSM tarafından engellenirse (bu kullanıcı bazında oluyor ve uzantının
// elinde değil) ayarlardan başkasına geçebiliyor.
// Karo sunuculari. Hepsi ANAHTARSIZ. Custom secenegi kullanicinin kendi
// URL'sini kabul ediyor: MapTiler, Thunderforest, Stadia anahtarini kendisi
// kuruyor. Adres {z}/{x}/{y} kalibinda olmali.
var gnmTileServers = {
  osm: {
    url: 'https://tile.openstreetmap.org/',
    label: '© OpenStreetMap',
    href: 'https://www.openstreetmap.org/copyright'
  },
  osmde: {
    url: 'https://tile.openstreetmap.de/',
    label: '© OpenStreetMap Deutschland',
    href: 'https://www.openstreetmap.org/copyright'
  },
  topo: {
    url: 'https://a.tile.opentopomap.org/',
    label: '© OpenTopoMap (CC-BY-SA)',
    href: 'https://opentopomap.org'
  }
};


function gnmMap(el, opts) {
  'use strict';

  var TILE = 256;
  var MIN_ZOOM = 3;   // daha dışarıda dünya ekrandan dar kalıp karo tekrarlıyor
  var MAX_ZOOM = 18;   // sunucu daha azını destekliyorsa aşağıda kırpılıyor
  var MAX_LAT = 85.05112878;

  var view = { lat: opts.lat, lon: opts.lon, zoom: opts.zoom || 13 };
  var marker = { lat: opts.lat, lon: opts.lon };
  var zones = { inner: 0, outer: 0 };
  var tiles = Object.create(null);
  var srv = gnmTileServers[opts.tiles] || gnmTileServers.osm;
  var TILE_URL = srv.url;
  var TILE_TPL = null;   // {z}/{x}/{y} icin
  if (opts.tiles === 'custom' && opts.customTileUrl) {
    TILE_TPL = opts.customTileUrl;
    srv = { label: '© (custom)', href: '#' };
  }

  // OSM engellediğinde 403 ile birlikte "Access blocked" yazan bir KARO dönüyor.
  // Geçerli bir resim olduğu için img.onerror tetiklenmiyor; durum kodunu okumak
  // tek anlama yolu. Yoklama İLK ÇİZİMDE yapılıyor, harita kurulurken değil:
  // sekmeyi hiç açmayan kullanıcı için tek bir istek bile gitmesin.
  var probed = false;
  function probe() {
    if (probed) return;
    probed = true;
    fetch((TILE_TPL ? TILE_TPL.replace('{z}','0').replace('{x}','0').replace('{y}','0') : TILE_URL + '0/0/0.png'), { cache: 'no-store' }).then(function (r) {
      if (r.ok) return;
      el.classList.add('map-blocked');
      if (typeof gnmMapBlocked === 'function') gnmMapBlocked(el, r.status);
    }, function () { /* ağ yok, karolar zaten boş kalır */ });
  }

  var layer = document.createElement('div');
  layer.className = 'map-tiles';

  var outer = document.createElement('div');
  outer.className = 'map-zone map-zone-outer';
  var inner = document.createElement('div');
  inner.className = 'map-zone map-zone-inner';
  var pin = document.createElement('div');
  pin.className = 'map-pin';

  // Rota çizgisi ve numaralı duraklar. Katman SVG çünkü çizgi div ile çizilmiyor.
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var routeSvg = document.createElementNS(SVG_NS, 'svg');
  routeSvg.setAttribute('class', 'map-route');
  var route = [];

  // Atıf zorunlu. OSM verisi ODbL ile geliyor ve atıf yoksa karo sunucusu elle
  // engelleme sebebi sayıyor. Metin sunucuya göre değişiyor.
  var attrib = document.createElement('a');
  attrib.className = 'map-attrib';
  attrib.href = srv.href;
  attrib.target = '_blank';
  attrib.rel = 'noreferrer';
  attrib.textContent = srv.label;

  var zoomIn = document.createElement('button');
  zoomIn.className = 'map-zoom';
  zoomIn.type = 'button';
  zoomIn.textContent = '+';
  var zoomOut = document.createElement('button');
  zoomOut.className = 'map-zoom map-zoom-out';
  zoomOut.type = 'button';
  zoomOut.textContent = '−';

  el.classList.add('map');
  el.append(layer, outer, inner, routeSvg, pin, attrib, zoomIn, zoomOut);

  // --- izdüşüm (Web Mercator) ---------------------------------------------

  function scale() { return Math.pow(2, view.zoom) * TILE; }
  function lonToX(lon) { return ((lon + 180) / 360) * scale(); }
  function latToY(lat) {
    var s = Math.sin((Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI) / 180);
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale();
  }
  function xToLon(x) { return (x / scale()) * 360 - 180; }
  function yToLat(y) {
    var n = Math.PI - (2 * Math.PI * y) / scale();
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }

  // Tam sayiya yuvarli. Kusuratli olunca karolar -18.2 px gibi yerlere
  // oturuyor, aralarinda harita zemini ince cizgi olarak gorunuyordu.
  // Igne, bolge, rota ve tiklama donusumu de buradan okuyor; hepsi ayni
  // noktaya kayiyor, aralarinda kayma yok.
  function topLeft() {
    return {
      x: Math.round(lonToX(view.lon) - el.clientWidth / 2),
      y: Math.round(latToY(view.lat) - el.clientHeight / 2)
    };
  }

  // --- çizim ---------------------------------------------------------------

  function draw() {
    var w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;

    probe();

    var tl = topLeft();
    var n = Math.pow(2, view.zoom);
    var keep = Object.create(null);

    for (var ty = Math.floor(tl.y / TILE); ty <= Math.floor((tl.y + h) / TILE); ty++) {
      if (ty < 0 || ty >= n) continue;
      for (var tx = Math.floor(tl.x / TILE); tx <= Math.floor((tl.x + w) / TILE); tx++) {
        var wx = ((tx % n) + n) % n;
        var key = view.zoom + '/' + wx + '/' + ty;
        keep[key] = 1;

        var img = tiles[key];
        if (!img) {
          img = new Image();
          img.className = 'map-tile';
          img.alt = '';
          img.src = TILE_TPL
            ? TILE_TPL.replace('{z}', view.zoom).replace('{x}', wx).replace('{y}', ty)
            : TILE_URL + view.zoom + '/' + wx + '/' + ty + '.png';
          tiles[key] = img;
          layer.appendChild(img);
        }
        img.style.left = tx * TILE - tl.x + 'px';
        img.style.top = ty * TILE - tl.y + 'px';
      }
    }

    Object.keys(tiles).forEach(function (k) {
      if (!keep[k]) { tiles[k].remove(); delete tiles[k]; }
    });

    drawOverlay(tl);
  }

  function drawRoute(tl) {
    routeSvg.textContent = '';
    routeSvg.setAttribute('width', el.clientWidth);
    routeSvg.setAttribute('height', el.clientHeight);
    if (route.length < 1) return;

    var pts = route.map(function (p) {
      return [lonToX(p[1]) - tl.x, latToY(p[0]) - tl.y];
    });

    if (pts.length > 1) {
      var line = document.createElementNS(SVG_NS, 'polyline');
      line.setAttribute('points', pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' '));
      line.setAttribute('class', 'route-line');
      routeSvg.appendChild(line);
    }

    pts.forEach(function (p, i) {
      var dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', p[0]);
      dot.setAttribute('cy', p[1]);
      dot.setAttribute('r', 9);
      dot.setAttribute('class', 'route-dot');
      routeSvg.appendChild(dot);

      var label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', p[0]);
      label.setAttribute('y', p[1] + 4);
      label.setAttribute('class', 'route-num');
      label.textContent = String(i + 1);
      routeSvg.appendChild(label);
    });
  }

  function drawOverlay(tl) {
    drawRoute(tl);
    var mx = lonToX(marker.lon) - tl.x;
    var my = latToY(marker.lat) - tl.y;
    pin.style.left = mx + 'px';
    pin.style.top = my + 'px';

    // metre/piksel, Mercator'da enleme bağlı
    var mpp = (156543.03392 * Math.cos((marker.lat * Math.PI) / 180)) / Math.pow(2, view.zoom);
    [[outer, zones.outer], [inner, zones.inner]].forEach(function (pair) {
      var elc = pair[0], radius = pair[1];
      if (!radius || !mpp) { elc.hidden = true; return; }
      var d = (2 * radius) / mpp;
      elc.hidden = false;
      elc.style.width = d + 'px';
      elc.style.height = d + 'px';
      elc.style.left = mx - d / 2 + 'px';
      elc.style.top = my - d / 2 + 'px';
    });
  }

  // --- etkileşim -----------------------------------------------------------

  var drag = null;

  el.addEventListener('pointerdown', function (e) {
    if (e.target === zoomIn || e.target === zoomOut || e.target === attrib) return;
    drag = { x: e.clientX, y: e.clientY, moved: false };
    el.setPointerCapture(e.pointerId);
  });

  el.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    drag.moved = true;
    view.lon = xToLon(lonToX(view.lon) - dx);
    view.lat = Math.max(-MAX_LAT, Math.min(MAX_LAT, yToLat(latToY(view.lat) - dy)));
    drag.x = e.clientX;
    drag.y = e.clientY;
    draw();
  });

  el.addEventListener('pointerup', function (e) {
    if (drag && !drag.moved) pickAt(e.clientX, e.clientY);
    drag = null;
  });

  el.addEventListener('pointercancel', function () { drag = null; });

  // Tekerlek YAKALANMIYOR. Eskiden harita her tekerlek olayini yiyordu:
  // kullanici sayfayi asagi kaydirmak isterken imleci haritanin uzerinden
  // gecirince sayfa duruyor, harita yakinlasiyordu. Tek cikis yolu imleci
  // bosluga tasimakti.
  //
  // Iki kapi birakiyoruz: Ctrl (macOS'ta Cmd) basiliyken tekerlek, ya da
  // haritaya bir kez tiklayip "etkin" hale getirmek. Ikisi de degilse olay
  // sayfaya birakiliyor ve sayfa normal kayiyor.
  var wheelArmed = false;
  var wheelHintTimer = 0;

  function armWheel(on) {
    wheelArmed = on;
    el.classList.toggle('map-armed', on);
  }

  function flashHint() {
    el.classList.add('map-hint');
    clearTimeout(wheelHintTimer);
    wheelHintTimer = setTimeout(function () { el.classList.remove('map-hint'); }, 1600);
  }

  el.addEventListener('wheel', function (e) {
    if (!e.ctrlKey && !e.metaKey && !wheelArmed) {
      flashHint();      // sayfa kaysin, kullaniciya da neden oldugunu soyle
      return;
    }
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1 : -1);
  }, { passive: false });

  // Haritaya tiklamak yakinlastirmayi aciyor, disari tiklamak kapatiyor.
  el.addEventListener('pointerdown', function () { armWheel(true); });
  document.addEventListener('pointerdown', function (e) {
    if (!el.contains(e.target)) armWheel(false);
  }, true);

  zoomIn.addEventListener('click', function () { zoomBy(1); });
  zoomOut.addEventListener('click', function () { zoomBy(-1); });

  function zoomBy(step) {
    var z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.zoom + step));
    if (z === view.zoom) return;
    view.zoom = z;
    Object.keys(tiles).forEach(function (k) { tiles[k].remove(); delete tiles[k]; });
    draw();
  }

  function pickAt(clientX, clientY) {
    var r = el.getBoundingClientRect();
    var tl = topLeft();
    marker.lat = round6(yToLat(tl.y + (clientY - r.top)));
    marker.lon = round6(xToLon(tl.x + (clientX - r.left)));
    draw();
    if (opts.onPick) opts.onPick(marker.lat, marker.lon);
  }

  function round6(v) { return Math.round(v * 1e6) / 1e6; }

  // Pencere yeniden boyutlanınca yakalar. Gizli sekme açılınca her ortamda
  // tetiklenmiyor, o yüzden çağıran taraf da sekmeyi açarken setMarker çağırıyor.
  var ro = typeof ResizeObserver === 'function' ? new ResizeObserver(draw) : null;
  if (ro) ro.observe(el);

  draw();

  return {
    setView: function (lat, lon, zoom) {
      view.lat = lat;
      view.lon = lon;
      if (zoom) view.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
      draw();
    },
    setMarker: function (lat, lon, recenter) {
      marker.lat = lat;
      marker.lon = lon;
      if (recenter) { view.lat = lat; view.lon = lon; }
      draw();
    },
    setRoute: function (points) {
      route = points || [];
      draw();
    },
    setZones: function (innerM, outerM) {
      zones.inner = innerM || 0;
      zones.outer = outerM || 0;
      draw();
    },
    getMarker: function () { return { lat: marker.lat, lon: marker.lon }; }
  };
}
