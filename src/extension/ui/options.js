(function () {
  'use strict';

  var E = globalThis.__gnmEngine;
  var $ = function (id) { return document.getElementById(id); };

  var cfg = null;
  var DATA = null;
  var map = null;
  var savedTimer = 0;
  var logRows = [];
  var picking = false;
  var liveTimer = 0;

  GNM_LOG.via(function (entries) {
    try {
      chrome.runtime.sendMessage({ __gnmLog: entries }, function () {
        return chrome.runtime.lastError;
      });
    } catch (e) { /* arka plan yok, log yüzünden sayfa durmasın */ }
  });

  function flashSaved() {
    $('saved').hidden = false;
    clearTimeout(savedTimer);
    savedTimer = setTimeout(function () { $('saved').hidden = true; }, 1200);
  }

  function save(patch, redraw, center) {
    GNM_LOG.add('ui', 'options.set', patch);
    gnmSet(patch, function (updated) {
      cfg = updated;
      flashSaved();
      if (redraw) render();
      else syncMap();
      // Merkezleme burada, kayittan SONRA. Cagri yerinde setTimeout ile
      // yapiliyordu; depo geri donmeden calisip eski koordinati okuyordu.
      if (center && map) map.setMarker(cfg.lat, cfg.lon, true);
    });
  }

  function fill(sel, items, selected) {
    sel.textContent = '';
    items.forEach(function (item) {
      var o = document.createElement('option');
      o.value = typeof item === 'string' ? item : item.value;
      o.textContent = typeof item === 'string' ? item : item.text;
      if (o.value === selected) o.selected = true;
      sel.appendChild(o);
    });
  }

  // --- sekmeler ------------------------------------------------------------

  // Basit kipte görünen sekmeler. Gerisi gelişmiş kipte açılıyor.
  // Basit kipte yalnizca bu ikisi gorunur; gerisi Gelismis kipte acilir.
  // Basit kipte iki sekme: nerede olacaksın ve uygulamanın kendi ayarları.
  // Aradaki her şey gelişmiş kipte, sırası da yapılan işin sırası.
  // Basit kipte iki sekme. Genel once: kullanici dili ve temayi burada
  // ayarliyor, geri kalan her sey onun ustune biniyor.
  var BASIC_TABS = ['app', 'location'];

  // Tek tek yazilan her onay kutusu. Kaydetme ve okuma ayni listeden gidiyor,
  // yeni bir kutu eklerken tek yer degisiyor.
  var CHECKS = ['localeSpoof', 'localeIntl', 'acceptLanguage', 'tzDeep', 'ipGeo',
    'webrtc', 'webrtcRelay', 'webrtcBlock', 'windowName',
    'harden', 'maskNative', 'denyWhenOff', 'workerPatch',
    'noPrediction', 'noPing', 'gpc', 'stripParams', 'noSandbox', 'etpAlways',
    'fpCanvas', 'fpWebgl', 'fpAudio', 'fpRect', 'fpScreen', 'fpDevice',
    'badge', 'lowMemory', 'logDetail'];

  // Başka tarayıcıya ait seçenek sayılmaz ve toplu düğmeyle değişmez
  function boxesOf(grp) {
    return Array.prototype.slice.call(
      document.querySelectorAll('[data-grp="' + grp + '"] .gbody input[type="checkbox"]'))
      .filter(gnmShownHere);
  }

  // Grup kapaliyken de icerde ne oldugunu gosteriyor: "3 / 6". Toplu dugme de
  // buradan durumunu aliyor, hepsi acikken basinca hepsini kapatiyor.
  function drawGroups() {
    document.querySelectorAll('.grp[data-grp]').forEach(function (g) {
      var boxes = boxesOf(g.dataset.grp);
      var on = boxes.filter(function (x) { return x.checked; }).length;
      g.querySelector('.gsum').textContent = on + ' / ' + boxes.length;
      var master = g.querySelector('.master');
      if (master) master.setAttribute('aria-pressed', on === boxes.length ? 'true' : 'false');
    });
  }

  // Konum kipi ayri bir ayar DEGIL, mevcut ikisinden tureniyor. Yeni alan
  // eklemektense var olani okumak daha az yerde bozulur.
  function locMode() {
    if (cfg.motion && cfg.motion.on) return 'moving';
    return cfg.exact ? 'fixed' : 'zone';
  }

  function setLocMode(m) {
    if (m === locMode()) return;
    GNM_LOG.add('ui', 'mode.run', { mode: m });
    var base = Object.assign({}, cfg.motion || {});
    if (m === 'moving') {
      save({ exact: false, motion: Object.assign(base, { on: true, startedAt: Date.now() }) }, true);
    } else {
      save({ exact: m === 'fixed', motion: Object.assign(base, { on: false }) }, true);
    }
  }

  function selectTab(b) {
    if (!b) return;
    document.querySelectorAll('#tabs button[data-tab]').forEach(function (x) {
      x.classList.toggle('sel', x === b);
      if (x === b) x.setAttribute('aria-current', 'page');
      else x.removeAttribute('aria-current');
    });
    // CSS okuyor: kimlik seridi Konum'da buyuk, digerlerinde tek satir
    document.body.dataset.tab = b.dataset.tab;
    document.querySelectorAll('section.tab').forEach(function (s) {
      s.hidden = s.dataset.tab !== b.dataset.tab;
    });
    $('pageTitle').textContent = b.textContent;

    if (b.dataset.tab === 'history') { loadLog(); loadTimeline(); }

    // Harita gizliyken genisligi sifir, cizim vazgeciyor. Sekme acilinca tazele.
    if (b.dataset.tab === 'location') syncMap();
  }

  $('tabs').addEventListener('click', function (e) {
    selectTab(e.target.closest('button[data-tab]'));
  });

  // Adresler store.js'te, burada yalniz baglaniyor
  function renderByline() {
    // Yalnizca depo baglantisi var artik: sol menu tabaninda tek chip.
    // authorLink kaldirildi.
    var r = document.getElementById('repoLink');
    if (r) r.href = GNM_REPO_URL;
  }

  function renderMode() {
    var basic = cfg.uiMode !== 'advanced';
    // CSS bunu okuyor: gizlenen Advanced kartin yanindaki kart satiri doldurur
    document.body.dataset.ui = basic ? 'basic' : 'advanced';

    document.querySelectorAll('#uiMode button').forEach(function (b) {
      var on = (b.dataset.v === 'advanced') === !basic;
      b.classList.toggle('sel', on);
      b.setAttribute('aria-pressed', String(on));
    });
    // Seçici [data-tab] ile sınırlı olmak ZORUNDA. Sınırsızken Basit/Gelişmiş
    // düğmelerini de yakalayıp gizliyordu; ardından "seçili sekme gizlenmiş"
    // sanıp her kaydetmede General'e atlıyordu.
    document.querySelectorAll('#tabs button[data-tab]').forEach(function (b) {
      b.hidden = basic && BASIC_TABS.indexOf(b.dataset.tab) === -1;
    });

    // Sertlestirme ve ince ayar kartlari yalniz gelismis kipte
    document.querySelectorAll('[data-adv]').forEach(function (el) { el.hidden = basic; });

    // Açık sekme gizlendiyse Location'a geç: iki kipte de var ve asıl iş orada.
    // Önceden görünen ilk sekmeye (General) atıyordu.
    var sel = document.querySelector('#tabs button[data-tab].sel');
    if (!sel || sel.hidden) selectTab(document.querySelector('#tabs button[data-tab="location"]'));
    else $('pageTitle').textContent = sel.textContent;
  }

  // Ust cubuk: konum kipi, calisma durumu ve guc dugmesi
  function renderTopbar() {
    var m = locMode();
    document.querySelectorAll('#locMode button').forEach(function (b) {
      b.classList.toggle('sel', b.dataset.v === m);
      b.setAttribute('aria-pressed', String(b.dataset.v === m));
    });

    $('power').setAttribute('aria-pressed', String(cfg.enabled));
    $('power').title = T(cfg.enabled ? 'stop' : 'start');
    $('runstate').textContent = T(cfg.enabled ? 'statusRunning' : 'statusStopped');
    $('runstate').classList.toggle('on', !!cfg.enabled);
    renderIdentity();
  }

  // Kimlik seridi: sitelerin su an gordugu. Hareket varsa canli nokta.
  function renderIdentity() {
    var live = locMode() === 'moving' ? E.motionAt(motion(), Date.now()) : null;
    var c = DATA && DATA.countries[cfg.country];
    var place = cfg.custom ? T('customPoint') : cfg.city;
    $('idPlace').textContent = place + (c ? ', ' + cfg.country : '');
    $('idPlace').title = place + (c ? ', ' + c.name : '');
    $('idLat').textContent = (live ? live.lat : cfg.lat).toFixed(4);
    $('idLon').textContent = (live ? live.lon : cfg.lon).toFixed(4);
    $('idTz').textContent = cfg.timeZone;
    $('idTz').title = cfg.timeZone;
    $('idLocale').textContent = cfg.locale;
    $('idProt').textContent = T('protOn').replace('%s', gnmProtCount(cfg));
    $('idStrip').classList.toggle('off', !cfg.enabled);
    renderIp();
  }

  // --- IP kontrolü ---------------------------------------------------------
  // Siteler konumu sunucuda IP'den de bakabiliyor; sahte konum İstanbul, IP
  // Almanya ise ilk bakılan çelişki bu. IP'yi değiştiremeyiz, yalnız
  // gösteriyoruz. Yalnız kullanıcı basınca soruluyor ve eşitleme de onun
  // düğmesi: arka planda kendiliğinden eşitlemek, VPN'siz kullanıcıda sahte
  // konumu gerçeğe çeker, yani uzantıyı kendi eliyle kapatır.
  //
  // Üç kaynak sırayla; biri düşerse öteki. Kayda IP adresi YAZILMIYOR, yalnız
  // ülke ve kaynak.
  var IP_SOURCES = [
    { url: 'https://get.geojs.io/v1/ip/geo.json',
      read: function (j) { return { country: j.country_code, city: j.city, tz: j.timezone }; } },
    { url: 'https://ipwho.is/',
      read: function (j) {
        return j.success === false ? null
          : { country: j.country_code, city: j.city, tz: j.timezone && j.timezone.id };
      } },
    { url: 'https://freeipapi.com/api/json',
      read: function (j) {
        return { country: j.countryCode, city: j.cityName, tz: j.timeZones && j.timeZones[0] };
      } }
  ];
  var ipInfo = null, ipBusy = false;

  function validTz(tz) {
    if (!tz || typeof tz !== 'string') return null;
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch (e) { return null; }
  }

  function checkIp() {
    if (ipBusy) return;
    ipBusy = true;
    ipInfo = null;
    renderIp();
    var i = 0;
    (function next() {
      if (i >= IP_SOURCES.length) {
        ipBusy = false;
        ipInfo = { failed: true };
        GNM_LOG.add('ui', 'ip.check', { ok: false });
        renderIp();
        return;
      }
      var s = IP_SOURCES[i++];
      var ctl = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 6000);
      fetch(s.url, {
        cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
        signal: ctl ? ctl.signal : undefined
      })
        .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
        .then(function (j) {
          clearTimeout(timer);
          var v = s.read(j || {});
          if (!v || !v.country) throw new Error('empty');
          ipInfo = {
            country: String(v.country).toUpperCase(),
            city: v.city ? String(v.city) : '',
            tz: validTz(v.tz),
            source: s.url.split('/')[2]
          };
          ipBusy = false;
          GNM_LOG.add('ui', 'ip.check', { ok: true, source: ipInfo.source, country: ipInfo.country });
          renderIp();
        })
        .catch(function () { clearTimeout(timer); next(); });
    })();
  }

  function ipMismatch() {
    if (ipInfo.country !== cfg.country) return true;
    // Aynı ülke, farklı saat: ABD'nin doğusundan bağlanıp batısını seçmek
    return !!(ipInfo.tz && cfg.timeZone &&
      gnmTzOffsetHours(ipInfo.tz) !== gnmTzOffsetHours(cfg.timeZone));
  }

  function countryName(code) {
    return DATA && DATA.countries[code] ? DATA.countries[code].name : code;
  }

  function renderIp() {
    var btn = $('ipBtn'), match = $('ipMatch');
    if (!btn) return;
    btn.className = 'iplink';
    btn.title = T('ipHint');
    match.hidden = true;
    if (ipBusy) { btn.textContent = T('ipChecking'); return; }
    if (!ipInfo) { btn.textContent = T('ipCheck'); return; }
    if (ipInfo.failed) {
      btn.textContent = T('ipFailed');
      btn.classList.add('ipbad');
      return;
    }
    var bad = ipMismatch();
    btn.textContent = ipInfo.country + (ipInfo.city ? ' · ' + ipInfo.city : '');
    btn.classList.add(bad ? 'ipbad' : 'ipok');
    // Yer tutucular metinde birden çok kez geçebiliyor; replace yalnız ilkini alırdı
    var fill = { '%1': countryName(ipInfo.country), '%2': ipInfo.tz || '?',
      '%3': countryName(cfg.country), '%4': cfg.timeZone || '?' };
    btn.title = (bad ? T('ipMismatchTip') : T('ipMatchTip')).replace(/%[1-4]/g, function (k) {
      return fill[k];
    }) + '\n\n' + T('ipHint');
    match.hidden = !bad || !DATA.countries[ipInfo.country];
  }

  // Sahte konumu IP'nin ülkesine taşır. Şehir listede varsa o, yoksa başkent.
  // IP'nin dilimi ülkenin listesindeyse ve dilim otomatikse o dilim.
  function matchIp() {
    if (!ipInfo || !DATA.countries[ipInfo.country]) return;
    var patch = gnmGeoNormalize(DATA, cfg, { country: ipInfo.country, city: ipInfo.city });
    if (cfg.tzAuto && ipInfo.tz && DATA.countries[ipInfo.country].tz.indexOf(ipInfo.tz) !== -1) {
      patch.timeZone = ipInfo.tz;
    }
    GNM_LOG.add('ui', 'ip.match', { country: ipInfo.country });
    save(patch, true, true);
  }

  function bindTopbar() {
    document.querySelectorAll('#locMode button').forEach(function (b) {
      b.addEventListener('click', function () { setLocMode(b.dataset.v); });
    });
    $('power').addEventListener('click', function () {
      save({ enabled: !cfg.enabled }, true);
    });
    $('ipBtn').addEventListener('click', checkIp);
    $('ipMatch').addEventListener('click', matchIp);
  }

  function bindMode() {
    document.querySelectorAll('#uiMode button').forEach(function (b) {
      b.addEventListener('click', function () { save({ uiMode: b.dataset.v }, true); });
    });
  }

  function logTabOpen() {
    var s = document.querySelector('section.tab[data-tab="history"]');
    return s && !s.hidden;
  }

  // --- genel ---------------------------------------------------------------

  function renderGeneral() {
    $('theme').value = cfg.theme || 'auto';
    fill($('language'), GNM_LANGS.map(function (l) {
      return { value: l.code, text: l.name };
    }), cfg.language);
  }

  function bindGeneral() {
    $('theme').addEventListener('change', function () {
      gnmApplyTheme(this.value);
      save({ theme: this.value });
    });

    $('language').addEventListener('change', function () {
      // Metinlerin bir kısmı JS'ten geliyor, sayfayı tazelemek en temizi
      save({ language: this.value }, false);
      setTimeout(function () { location.reload(); }, 60);
    });

    $('exportBtn').addEventListener('click', function () {
      download(JSON.stringify(cfg, null, 2),
        'geonomore-settings-' + GNM_AUTHOR.toLowerCase() + '.json', 'application/json');
    });

    $('importBtn').addEventListener('click', function () { $('importFile').click(); });

    $('importFile').addEventListener('change', function () {
      var file = this.files && this.files[0];
      this.value = '';
      if (!file) return;
      file.text().then(function (text) {
        var incoming;
        try {
          incoming = JSON.parse(text);
        } catch (e) {
          $('dataMsg').textContent = T('importBad');
          return;
        }
        if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
          $('dataMsg').textContent = T('importBad');
          return;
        }
        // Yalnız tanıdığımız alanları al, dosyadan gelen her şeye güvenme
        var clean = {};
        Object.keys(GNM_DEFAULTS).forEach(function (k) {
          if (incoming[k] !== undefined) clean[k] = incoming[k];
        });
        $('dataMsg').textContent = T('importOk');
        save(clean, true);
      });
    });

    $('resetBtn').addEventListener('click', function () {
      if (!confirm(T('resetConfirm'))) return;
      chrome.storage.local.set({ config: Object.assign({}, GNM_DEFAULTS) }, function () {
        location.reload();
      });
    });
  }

  function download(text, name, type) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type }));
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }

  // --- konum ---------------------------------------------------------------

  // Ülke/bölge/yer yardımcıları core/ui.js'te, popup da aynısını kullanıyor
  function normalize(next) { return gnmGeoNormalize(DATA, cfg, next); }

  function activeZone() {
    return E.zoneOf({ zone: cfg.zone, privacy: cfg.privacy });
  }

  function syncMap() {
    if (!map) return;

    if (locMode() === 'moving') {
      var pts = motion().points || [];
      map.setRoute(pts);
      map.setZones(0, 0);
      var live = E.motionAt(motion(), Date.now());
      if (live) map.setMarker(live.lat, live.lon);
      else if (pts.length) map.setMarker(pts[0][0], pts[0][1]);
      else map.setMarker(cfg.lat, cfg.lon);
      return;
    }

    map.setRoute([]);
    map.setMarker(cfg.lat, cfg.lon);
    var z = activeZone();
    map.setZones(cfg.exact ? 0 : z[0], cfg.exact ? 0 : z[1]);
  }

  function initMap() {
    // Tekerlek ipucu CSS'ten okunuyor, cevirisi burada baglaniyor
    $('map').setAttribute('data-wheelhint', T('mapWheelHint'));

    map = gnmMap($('map'), {
      lat: cfg.lat,
      lon: cfg.lon,
      zoom: 12,
      tiles: cfg.tiles,
      customTileUrl: cfg.tilesCustom,
      onPick: function (lat, lon) {
        // Hareket kipinde tıklama rotaya nokta ekliyor, ötekilerde konumu taşıyor
        if (locMode() === 'moving') {
          if (!picking) return;
          setMotion({ points: (motion().points || []).concat([[round6(lat), round6(lon)]]) });
          return;
        }
        // Haritadan seçilen nokta şehir listesinden bağımsız. Ülkeyi buradan
        // bilemiyoruz, olduğu gibi kalıyor ve kullanıcı uyarılıyor; ama seçili
        // ülke içinde dilim noktaya göre yenileniyor (ABD'de doğudan batıya
        // tıklayınca New York'ta kalmıyor).
        save(customPoint({ lat: lat, lon: lon }), true);
      }
    });

    syncMap();
  }

  function renderLocation() {
    fill($('country'), gnmGeoCountryCodes(DATA).map(function (c) {
      return { value: c, text: DATA.countries[c].name };
    }), cfg.country);

    var places = gnmGeoPlaces(DATA, cfg.country).map(function (p) { return p.name; });
    if (cfg.custom) places = [{ value: '__custom', text: T('customPoint') }].concat(places);
    fill($('city'), places, cfg.custom ? '__custom' : cfg.city);

    $('customNote').hidden = !cfg.custom;
    $('lat').value = cfg.lat;
    $('lon').value = cfg.lon;

    // Kip neyi gosterip neyi gizliyor. Harita her kipte ayni yerde, en ustte;
    // taban koordinat da her kipte haritanin hemen altinda. Hareket kipinde de
    // duruyor cunku hareket bitince ya da kapatilinca oraya donuluyor.
    var m = locMode();
    // Haritanin yanindaki dar sutun kipe gore dolar: zone'da gizlilik,
    // moving'de rota karti. Hazir ayarlar her kipte orada, sutun bos kalmaz.
    $('zoneCard').hidden = m !== 'zone';
    $('motionRoute').hidden = m !== 'moving';
    $('motionHow').hidden = m !== 'moving';
    $('coordHint').textContent = T(m === 'fixed' ? 'coordHintFixed' : 'coordHintZone');
  }

  function bindLocation() {
    $('country').addEventListener('change', function () {
      save(normalize({ country: this.value }), true, true);
    });

    $('city').addEventListener('change', function () {
      if (this.value === '__custom') return;
      save(normalize({ country: cfg.country, city: this.value }), true, true);
    });

    $('searchBtn').addEventListener('click', runSearch);
    $('search').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); runSearch(); }
    });

    ['lat', 'lon'].forEach(function (id) {
      $(id).addEventListener('change', function () {
        var v = parseFloat(this.value);
        var limit = id === 'lat' ? 90 : 180;
        if (!isFinite(v) || Math.abs(v) > limit) { this.value = cfg[id]; return; }
        var at = { lat: cfg.lat, lon: cfg.lon };
        at[id] = v;
        save(customPoint(at), true, true);
      });
    });
  }

  // --- adres arama ---------------------------------------------------------
  // 192 ülke dosyada duruyor; dünyadaki her şehri yazmanın anlamı yok, gerisi arama.

  function runSearch() {
    var q = $('search').value.trim();
    if (!q) return;

    $('searchMsg').textContent = T('searchWorking');
    $('searchResults').hidden = true;
    GNM_LOG.add('ui', 'search', { q: q });

    gnmGeoSearch(q, function (err, rows) {
      if (err) {
        $('searchMsg').textContent = T('searchFailed');
        GNM_LOG.add('ui', 'search.error', { message: String(err.message || err) });
        return;
      }
      if (!rows.length) {
        $('searchMsg').textContent = T('searchNone');
        return;
      }
      $('searchMsg').textContent = '';
      showResults(rows);
    });
  }

  function showResults(rows) {
    var box = $('searchResults');
    box.textContent = '';
    box.hidden = false;

    rows.forEach(function (r) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = r.label;

      var c = document.createElement('span');
      c.className = 'coords';
      c.textContent = r.lat.toFixed(5) + ', ' + r.lon.toFixed(5) +
        (r.country ? '  ·  ' + r.country : '');
      b.appendChild(c);

      b.addEventListener('click', function () { useResult(r); });
      box.appendChild(b);
    });
  }

  // Aramadan gelen nokta listede yok, o yüzden custom. Ülke kodu geldiyse
  // saat dilimi ve dil de o ülkeye göre yenilenir, yoksa olduğu gibi kalır.
  function useResult(r) {
    var patch = {
      lat: Math.round(r.lat * 1e6) / 1e6,
      lon: Math.round(r.lon * 1e6) / 1e6,
      custom: true,
      city: r.label.split(',')[0].trim(),
      activePreset: ''
    };
    if (DATA.countries[r.country]) {
      patch.country = r.country;
      if (cfg.tzAuto) patch.timeZone = gnmGeoTz(DATA, r.country, r.lon, null, r.lat);
      if (cfg.localeAuto) patch.locale = DATA.countries[r.country].locale;
    }
    $('searchResults').hidden = true;
    $('search').value = '';
    save(patch, true, true);
  }

  // --- gizlilik ------------------------------------------------------------

  function renderPrivacy() {

    document.querySelectorAll('#privacy button').forEach(function (b) {
      b.classList.toggle('sel', b.dataset.v === cfg.privacy);
      b.setAttribute('aria-pressed', String(b.dataset.v === cfg.privacy));
    });

    var z = activeZone();
    $('inner').value = z[0];
    $('outer').value = z[1];
    $('inner').disabled = $('outer').disabled = false;
    // Reset satirda hep gorunur; ozel deger yoksa da varsayilana dondurur,
    // zararsiz. Kullanici [Inner][Outer][Reset] uclusunu bir arada bekliyor.
    $('zoneReset').disabled = !cfg.zone;
  }

  function bindPrivacy() {

    document.querySelectorAll('#privacy button').forEach(function (b) {
      b.addEventListener('click', function () {
        // Seviye seçmek elle girilen yarıçapları geçersiz kılar
        save({ privacy: b.dataset.v, zone: null, activePreset: '' }, true);
      });
    });

    ['inner', 'outer'].forEach(function (id) {
      $(id).addEventListener('change', function () {
        var inner = parseFloat($('inner').value);
        var outer = parseFloat($('outer').value);
        if (!isFinite(inner) || !isFinite(outer) || inner < 0 || outer <= inner) {
          renderPrivacy();
          return;
        }
        save({ zone: { inner: inner, outer: outer }, activePreset: '' }, true);
      });
    });

    $('zoneReset').addEventListener('click', function () {
      save({ zone: null }, true);
    });
  }

  // --- tutarlılık ----------------------------------------------------------

  function autoTz() {
    if (!DATA.countries[cfg.country]) return null;
    var place = cfg.custom ? null : gnmGeoPlace(DATA, cfg.country, cfg.city);
    return gnmGeoTz(DATA, cfg.country, cfg.lon, place && place.tz, cfg.lat);
  }

  // Haritadan ya da elle girilen nokta: custom, hazır ayar düşer, otomatik
  // dilim açıksa seçili ülke içinde noktaya göre yenilenir.
  function customPoint(at) {
    var patch = { lat: at.lat, lon: at.lon, custom: true, activePreset: '' };
    if (cfg.tzAuto && DATA.countries[cfg.country]) {
      patch.timeZone = gnmGeoTz(DATA, cfg.country, at.lon, null, at.lat);
    }
    return patch;
  }

  function autoLocale() {
    return DATA.countries[cfg.country] ? DATA.countries[cfg.country].locale : null;
  }

  function renderConsistency() {
    $('tzAuto').checked = !!cfg.tzAuto;
    $('tz').value = cfg.timeZone;
    $('tz').disabled = !!cfg.tzAuto;

    $('localeAuto').checked = !!cfg.localeAuto;
    $('locale').value = cfg.locale;
    $('locale').disabled = !!cfg.localeAuto;

    $('harden').checked = cfg.harden !== false;
    $('maskNative').checked = cfg.maskNative !== false;
    $('denyWhenOff').checked = !!cfg.denyWhenOff;
    $('workerPatch').checked = cfg.workerPatch !== false;
    ['noPrediction', 'noPing', 'gpc', 'stripParams', 'noSandbox'].forEach(function (id) {
      $(id).checked = cfg[id] !== false;
    });
    $('etpAlways').checked = cfg.etpAlways === true;
    $('badge').checked = cfg.badge !== false;
    $('lowMemory').checked = !!cfg.lowMemory;
    $('localeIntl').checked = cfg.localeIntl !== false;
    $('tzDeep').checked = cfg.tzDeep !== false;

    // Parmak izi ve sert WebRTC kademeleri: hepsi varsayilan kapali, o yuzden
    // "!== false" degil duz dogruluk kontrolu.
    ['webrtcRelay', 'webrtcBlock', 'windowName',
      'fpCanvas', 'fpWebgl', 'fpAudio', 'fpRect', 'fpScreen', 'fpDevice']
      .forEach(function (id) { $(id).checked = cfg[id] === true; });

    $('accuracyMode').value = cfg.accuracyMode === 'custom' ? 'custom' : 'auto';
    $('accuracyM').value = cfg.accuracyM;
    $('accuracyM').disabled = cfg.accuracyMode !== 'custom';
    $('jitterPeriod').value = cfg.jitterPeriod || 'day';
    $('watchInterval').value = cfg.watchInterval;
    $('logMax').value = String(cfg.logMax || 1000);
    $('tiles').value = cfg.tiles || 'osm';
    $('darkMap').setAttribute('aria-pressed', cfg.darkMap ? 'true' : 'false');
    $('map').classList.toggle('map-dark', !!cfg.darkMap);
    if ($('tilesCustom')) $('tilesCustom').value = cfg.tilesCustom || '';

    $('localeSpoof').checked = cfg.localeSpoof !== false;
    $('acceptLanguage').checked = cfg.acceptLanguage !== false;
    $('webrtc').checked = cfg.webrtc !== false;
    $('ipGeo').checked = cfg.ipGeo !== false;

    // EN SONDA: sayac kutulari okuyor, hepsi yerine oturmus olmali
    drawGroups();
  }

  function bindConsistency() {
    $('tzAuto').addEventListener('change', function () {
      var patch = { tzAuto: this.checked };
      var auto = autoTz();
      if (this.checked && auto) patch.timeZone = auto;
      save(patch, true);
    });

    $('tz').addEventListener('change', function () {
      var v = this.value.trim();
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: v });
      } catch (e) {
        this.value = cfg.timeZone;
        return;
      }
      save({ timeZone: v }, true);
    });

    $('localeAuto').addEventListener('change', function () {
      var patch = { localeAuto: this.checked };
      var auto = autoLocale();
      if (this.checked && auto) patch.locale = auto;
      save(patch, true);
    });

    $('locale').addEventListener('change', function () {
      var v = this.value.trim();
      if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(v)) {
        this.value = cfg.locale;
        return;
      }
      save({ locale: v }, true);
    });

    CHECKS.forEach(function (id) {
      $(id).addEventListener('change', function () {
        var patch = {};
        patch[id] = this.checked;
        save(patch);
        drawGroups();
      });
    });

    // Grup basligindaki toplu ac-kapa. Akordeon kalkti, grup artik her zaman
    // acik kart; olayi durdurmak zararsiz, baslik baska bir sey yapmiyor.
    document.querySelectorAll('.master').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var on = b.getAttribute('aria-pressed') !== 'true';
        var patch = {};
        boxesOf(b.dataset.master).forEach(function (x) {
          x.checked = on;
          patch[x.id] = on;
        });
        save(patch);
        drawGroups();
      });
    });

    ['accuracyMode', 'jitterPeriod'].forEach(function (id) {
      $(id).addEventListener('change', function () {
        var patch = {};
        patch[id] = this.value;
        save(patch, true);
      });
    });

    $('logMax').addEventListener('change', function () {
      save({ logMax: parseInt(this.value, 10) || 1000 });
    });

    // Koyu harita bir sunucu secimi degil, cizilen karolara uygulanan filtre.
    // Haritayi yeniden kurmaya gerek yok, tek sinif yetiyor.
    $('darkMap').addEventListener('click', function () {
      var on = this.getAttribute('aria-pressed') !== 'true';
      this.setAttribute('aria-pressed', on ? 'true' : 'false');
      $('map').classList.toggle('map-dark', on);
      save({ darkMap: on }, false);
    });

    // Harita nesnesi kurulurken sunucuyu okuyor, değişince yeniden kurulmalı
    $('tiles').addEventListener('change', function () {
      var custom = document.getElementById('tilesCustomBox');
      if (custom) custom.hidden = this.value !== 'custom';
      remapTiles(this.value);
    });
    var tc = document.getElementById('tilesCustom');
    if (tc) {
      tc.addEventListener('change', function () {
        save({ tilesCustom: this.value.trim() }, false);
        setTimeout(function () {
          $('map').textContent = '';
          $('map').className = 'map' + (cfg.darkMap ? ' map-dark' : '');
          map = null;
          initMap();
        }, 60);
      });
      document.getElementById('tilesCustomBox').hidden = $('tiles').value !== 'custom';
    }

    function remapTiles(v) {
      save({ tiles: v }, false);
      setTimeout(function () {
        $('map').textContent = '';
        $('map').className = 'map' + (cfg.darkMap ? ' map-dark' : '');
        map = null;
        initMap();
      }, 60);
    }

    // Sayi kutulari: gecersiz deger girilirse eski degere donuyor
    [['accuracyM', 1, 20000], ['watchInterval', 1, 600]].forEach(function (spec) {
      $(spec[0]).addEventListener('change', function () {
        var v = parseInt(this.value, 10);
        if (!isFinite(v) || v < spec[1] || v > spec[2]) { this.value = cfg[spec[0]]; return; }
        var patch = {};
        patch[spec[0]] = v;
        save(patch);
      });
    });

    $('prefsCopy').addEventListener('click', function () {
      var text = 'Firefox, about:config' + '\n' + $('prefsFF').textContent +
        '\n\n' + 'Chromium' + '\n' + $('prefsCR').textContent;
      navigator.clipboard.writeText(text).then(function () {
        $('prefsMsg').textContent = T('logCopied');
        setTimeout(function () { $('prefsMsg').textContent = ''; }, 2500);
      }, function () { /* pano reddetti, liste zaten ekranda secilebilir */ });
    });
  }

  // --- siteler -------------------------------------------------------------

  function renderSites() {
    document.querySelectorAll('#siteMode input').forEach(function (r) {
      r.checked = r.value === (cfg.siteMode || 'all');
    });
    $('siteList').value = (cfg.siteList || []).join('\n');
    renderGroups();
    syncSiteInputs(cfg.siteMode || 'all');
  }

  // "Every site" seciliyken liste ve gruplar hicbir sey yapmiyor; oyle de
  // gorunsun. Icerik silinmiyor, kip degisince geri geliyor.
  function syncSiteInputs(mode) {
    $('siteList').disabled = mode === 'all';
    $('groups').inert = mode === 'all';
  }

  function bindSites() {
    document.querySelectorAll('#siteMode input').forEach(function (r) {
      r.addEventListener('change', function () {
        syncSiteInputs(this.value);
        save({ siteMode: this.value });
      });
    });

    $('siteList').addEventListener('change', function () {
      var list = this.value.split('\n')
        .map(function (s) { return s.trim().toLowerCase(); })
        .filter(Boolean);
      save({ siteList: list }, true);
    });
  }

  // --- kurallar ------------------------------------------------------------

  var RULE_MODES = ['', 'low', 'medium', 'high', 'exact'];

  function renderRules() {
    var box = $('rules');
    box.textContent = '';

    if (!(cfg.siteProfiles || []).length) {
      var empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = T('noRules');
      box.appendChild(empty);
      return;
    }

    var head = document.createElement('div');
    head.className = 'rulehead';
    [T('rulePattern'), T('ruleMode'), T('ruleCoords'), ''].forEach(function (label) {
      var s = document.createElement('span');
      s.textContent = label;
      head.appendChild(s);
    });
    box.appendChild(head);

    cfg.siteProfiles.forEach(function (rule, i) {
      var row = document.createElement('div');
      row.className = 'rule';

      var pattern = document.createElement('input');
      pattern.type = 'text';
      pattern.spellcheck = false;
      pattern.value = rule.pattern || '';
      pattern.placeholder = 'miabeyefendi.dev';
      pattern.addEventListener('change', function () {
        updateRule(i, { pattern: this.value.trim() });
      });

      var mode = document.createElement('select');
      RULE_MODES.forEach(function (m) {
        var o = document.createElement('option');
        o.value = m;
        o.textContent = m === '' ? T('ruleInherit') : T(m === 'exact' ? 'exactShort' : m);
        mode.appendChild(o);
      });
      mode.value = rule.exact ? 'exact' : (rule.privacy || '');
      mode.addEventListener('change', function () {
        updateRule(i, this.value === 'exact'
          ? { exact: true, privacy: null }
          : { exact: false, privacy: this.value || null });
      });

      var coords = document.createElement('input');
      coords.type = 'text';
      coords.spellcheck = false;
      coords.placeholder = T('ruleCoordsPlaceholder');
      coords.value = isFinite(rule.lat) && isFinite(rule.lon) ? rule.lat + ', ' + rule.lon : '';
      coords.addEventListener('change', function () {
        var v = this.value.trim();
        if (!v) { updateRule(i, { lat: null, lon: null }); return; }
        var m = v.split(',');
        var la = parseFloat(m[0]), lo = parseFloat(m[1]);
        if (!isFinite(la) || !isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) {
          renderRules();
          return;
        }
        updateRule(i, { lat: la, lon: lo });
      });

      var del = document.createElement('button');
      del.className = 'del';
      del.type = 'button';
      del.textContent = '×';
      del.title = T('remove');
      del.addEventListener('click', function () {
        var list = cfg.siteProfiles.slice();
        list.splice(i, 1);
        save({ siteProfiles: list }, true);
      });

      row.append(pattern, mode, coords, del);
      box.appendChild(row);
    });
  }

  function updateRule(i, patch) {
    var list = (cfg.siteProfiles || []).slice();
    list[i] = Object.assign({}, list[i], patch);
    // Boş desenli kural hiçbir şeye uymaz, temizle
    list = list.filter(function (r) { return r.pattern; });
    save({ siteProfiles: list }, true);
  }

  function bindRules() {
    $('addRule').addEventListener('click', function () {
      var list = (cfg.siteProfiles || []).slice();
      list.push({ pattern: '', privacy: null, exact: false });
      cfg.siteProfiles = list;
      renderRules();
      var inputs = $('rules').querySelectorAll('.rule input[type="text"]');
      if (inputs.length) inputs[inputs.length - 2].focus();
    });
  }

  // --- hareket -------------------------------------------------------------
  // Motor zamanlayıcısız: konum startedAt'ten bu yana geçen sürenin fonksiyonu.
  // Burada yalnız rotayı ve ayarları topluyoruz, canlı satır da onu okuyor.

  function motion() { return cfg.motion || {}; }

  function setMotion(patch) {
    save({ motion: Object.assign({}, motion(), patch) }, true);
  }

  function round6(v) { return Math.round(v * 1e6) / 1e6; }

  function routeLength(pts) {
    var total = 0;
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      var R = 6371000, rad = Math.PI / 180;
      var dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
      var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      total += 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
    }
    return total;
  }

  function renderMotion() {
    var m = motion();
    $('motionProfile').value = m.profile || 'walking';
    $('motionSpeed').value = m.speed;
    $('motionPause').value = m.pause;
    $('motionLoop').value = m.loop || 'pingpong';
    $('pickPoints').classList.toggle('picking', picking);

    var pts = m.points || [];
    var box = $('waypoints');
    box.textContent = '';
    pts.forEach(function (p, i) {
      var chip = document.createElement('span');
      chip.className = 'waypoint';

      var label = document.createElement('span');
      label.textContent = (i + 1) + '.  ' + p[0].toFixed(4) + ', ' + p[1].toFixed(4);

      var del = document.createElement('button');
      del.type = 'button';
      del.textContent = '×';
      del.title = T('remove');
      del.addEventListener('click', function () {
        var next = pts.slice();
        next.splice(i, 1);
        setMotion({ points: next });
      });

      chip.append(label, del);
      box.appendChild(chip);
    });

    if (pts.length < 2) {
      $('routeInfo').textContent = T('motionNeedPoints');
    } else {
      var metres = routeLength(pts);
      var kmh = isFinite(m.speed) ? m.speed : 5;
      var mins = kmh > 0 ? metres / 1000 / kmh * 60 + (m.pause || 0) * pts.length / 60 : 0;
      $('routeInfo').textContent = T('motionRouteInfo')
        .replace('%1', pts.length)
        .replace('%2', (metres / 1000).toFixed(2))
        .replace('%3', Math.round(mins));
    }

    syncMap();
  }

  function locationTabOpen() {
    var s = document.querySelector('section.tab[data-tab="location"]');
    return s && !s.hidden;
  }

  function bindMotion() {
    $('motionProfile').addEventListener('change', function () {
      var preset = E.MOTION[this.value] || E.MOTION.walking;
      setMotion({ profile: this.value, speed: preset.speed, pause: preset.pause });
    });

    ['motionSpeed', 'motionPause'].forEach(function (id) {
      $(id).addEventListener('change', function () {
        var v = parseFloat(this.value);
        if (!isFinite(v) || v < 0) { renderMotion(); return; }
        setMotion(id === 'motionSpeed' ? { speed: v } : { pause: v });
      });
    });

    $('motionLoop').addEventListener('change', function () {
      setMotion({ loop: this.value, startedAt: Date.now() });
    });

    $('pickPoints').addEventListener('click', function () {
      picking = !picking;
      $('pickPoints').classList.toggle('picking', picking);
    });

    $('clearPoints').addEventListener('click', function () {
      setMotion({ points: [] });
    });

    $('restartMotion').addEventListener('click', function () {
      setMotion({ startedAt: Date.now() });
    });

    // 4 saniyede bir: konum sekmesinde hareketli haritanın işaretçisini
    // ilerlet, geçmiş sekmesi açıksa hareket geçmişini tazele. Canlı kutu
    // kaldırıldı; hareket değerleri artık History'de Movement History'de.
    liveTimer = setInterval(function () {
      if (!cfg) return;
      if (locMode() === 'moving') renderIdentity();
      if (locationTabOpen() && locMode() === 'moving') syncMap();
      if (logTabOpen()) renderTimeline();
    }, 4000);
  }

  // --- zamanlama -----------------------------------------------------------

  var DAY_KEYS = ['sunShort', 'monShort', 'tueShort', 'wedShort', 'thuShort', 'friShort', 'satShort'];

  function schedule() { return cfg.schedule || { entries: [] }; }

  // Bes satir bos olarak hazir bekliyor. Kullanici gun secmedikce hicbiri
  // calismiyor; "gun yoksa her gun" saymak dokunulmamis satiri devreye sokardi.
  var SCHED_ROWS = 5;

  function schedEntries() {
    var list = (schedule().entries || []).slice();
    while (list.length < SCHED_ROWS) list.push({ days: [], time: '08:00', preset: '' });
    return list;
  }

  function setSchedule(patch, extra) {
    // Motor Date/Intl kullanamiyor (sayfada ikisini de biz yamaliyoruz), o yuzden
    // kullanicinin UTC farkini burada, yamasiz ortamda yaziyoruz.
    save(Object.assign({
      schedule: Object.assign({}, schedule(), patch, {
        offset: -new Date().getTimezoneOffset()
      })
    }, extra || {}), true);
  }

  function setEntry(i, patch, extra) {
    var list = schedEntries();
    list[i] = Object.assign({}, list[i], patch);
    setSchedule({ entries: list }, extra);
  }

  function renderSchedule() {
    $('scheduleOn').checked = !!schedule().on;

    var box = $('schedule');
    box.textContent = '';
    var presets = Object.keys(gnmAllPresets(cfg));
    var entries = schedEntries();

    entries.forEach(function (e, i) {
      var row = document.createElement('div');
      row.className = 'sched';

      var days = document.createElement('div');
      days.className = 'days';
      DAY_KEYS.forEach(function (key, d) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = T(key);
        b.className = (e.days || []).indexOf(d) !== -1 ? 'sel' : '';
        b.addEventListener('click', function () {
          var picked = (e.days || []).slice();
          var at = picked.indexOf(d);
          if (at === -1) picked.push(d); else picked.splice(at, 1);
          setEntry(i, { days: picked.sort() });
        });
        days.appendChild(b);
      });

      var time = document.createElement('input');
      time.type = 'time';
      time.value = e.time || '08:00';
      time.addEventListener('change', function () { setEntry(i, { time: this.value }); });

      var preset = document.createElement('select');
      fill(preset, [{ value: '', text: T('schedPick') }].concat(presets), e.preset || '');
      preset.addEventListener('change', function () {
        // Motorun preset tablosu cfg.presets. Hazir gelen biri secilirse
        // oraya kopyalaniyor, yoksa zamanlama satiri bosa duserdi.
        var name = this.value;
        var extra = null;
        if (name && !Object.prototype.hasOwnProperty.call(cfg.presets, name) &&
            Object.prototype.hasOwnProperty.call(GNM_BUILTIN_PRESETS, name)) {
          var copy = Object.assign({}, cfg.presets);
          copy[name] = Object.assign({}, GNM_BUILTIN_PRESETS[name]);
          extra = { presets: copy };
        }
        setEntry(i, { preset: name }, extra);
      });

      var del = document.createElement('button');
      del.className = 'del';
      del.type = 'button';
      del.textContent = '\u00d7';
      del.title = T('remove');
      del.addEventListener('click', function () {
        var list = entries.slice();
        list.splice(i, 1);
        setSchedule({ entries: list });
      });

      row.classList.toggle('off', !(e.days || []).length);
      row.append(days, time, preset, del);
      box.appendChild(row);
    });

    // Hicbir satirda gun secili degilse zamanlama fiilen bos, bunu soyle
    var armed = entries.some(function (e) { return (e.days || []).length && e.preset; });
    var now = E.scheduleAt(cfg, Date.now());
    $('scheduleNow').textContent = !schedule().on ? ''
      : !armed ? T('schedIdle')
      : now ? T('schedActive').replace('%s', now.preset)
      : T('schedNone');
  }

  function bindSchedule() {
    $('scheduleOn').addEventListener('change', function () {
      setSchedule({ on: this.checked });
    });
    $('addSchedule').addEventListener('click', function () {
      // Gun secili GELMIYOR. Secili gelseydi kullanici farkinda olmadan
      // bir zamanlama satiri devreye girerdi.
      setSchedule({
        entries: schedEntries().concat([{ days: [], time: '08:00', preset: '' }])
      });
    });
  }

  // --- timeline ------------------------------------------------------------

  var POSITION_EVENTS = ['geo.fake', 'geo.watch.tick'];
  var timelineRows = [];

  function loadTimeline() {
    chrome.storage.local.get('timeline', function (r) {
      timelineRows = (r && r.timeline) || [];
      renderTimeline();
    });
  }

  // Log'daki konum kaydini noktaya cevir. Arka plan ayrintiyi metne cevirerek
  // sakliyor, o yuzden hem nesne hem metin gelebiliyor.
  function rowPoint(e) {
    if (POSITION_EVENTS.indexOf(e.e) === -1) return null;
    var d = e.d;
    if (typeof d === 'string') {
      try { d = JSON.parse(d); } catch (err) { return null; }
    }
    if (!d || !isFinite(d.lat) || !isFinite(d.lon)) return null;
    return {
      t: e.t,
      lat: d.lat,
      lon: d.lon,
      host: String(d.origin || '').replace(/^https?:\/\//, '')
    };
  }

  // Motor deterministik: konum f(ayar, an, koken). Zamanlayici da durum da
  // yok, yani GECMIS bir an icin de hesaplanabiliyor. Hareket kuruluyken bu,
  // hicbir site sormamis olsa bile rotanin nereden gectigini gosteriyor.
  //
  // Pencere iki saatle sinirli ve adim bir dakika: daha sik ornekleme listeyi
  // okunmaz yapiyor, daha uzun pencere de hareket dongusu zaten tekrar
  // ettigi icin yeni bir sey soylemiyor.
  var TRACK_WINDOW = 2 * 3600000;
  var TRACK_STEP = 60000;

  function computedTrack() {
    var m = cfg && cfg.motion;
    if (!cfg || !cfg.enabled) return [];
    if (!m || !m.on || (m.points || []).length < 2) return [];

    var now = Date.now();
    var from = Math.max(m.startedAt || now, now - TRACK_WINDOW);
    // Dakika sinirina oturt ki gozlenen satirlarla ayni damgaya denk gelmesin
    from = Math.ceil(from / TRACK_STEP) * TRACK_STEP;

    var out = [];
    for (var t = from; t <= now && out.length < 200; t += TRACK_STEP) {
      var pos;
      try { pos = E.position(cfg, t, ''); } catch (e) { break; }
      out.push({ t: t, lat: pos.latitude, lon: pos.longitude, host: '', computed: true });
    }
    return out;
  }

  // Kalici kayit artı log'dakiler. Log her zaman acik oldugu icin "Keep history"
  // kapaliyken de son hareketler goruluyor; onay kutusu yalniz log donunce
  // kaybolmasinlar diye.
  function movementRows() {
    var seen = Object.create(null);
    var out = [];
    // Gozlenenler once giriyor: ayni damgada ikisi de varsa gercekten olan
    // kazanir, hesaplanan dusurulur.
    timelineRows.concat(logRows.map(rowPoint).filter(Boolean))
      .concat(computedTrack()).forEach(function (p) {
      var key = p.t + '|' + p.lat + '|' + p.lon;
      if (seen[key]) return;
      seen[key] = 1;
      out.push(p);
    });
    return out.sort(function (a, b) { return a.t - b.t; });
  }

  function timelineText(rows) {
    return rows.map(function (p) {
      return clock(p.t) + '  ' + p.lat.toFixed(5) + ', ' + p.lon.toFixed(5) +
        (p.host ? '  ' + p.host : '');
    }).join('\n');
  }

  function renderTimeline() {
    var rows = movementRows();
    $('timelineOn').checked = !!cfg.timeline;
    var seen = rows.filter(function (p) { return !p.computed; }).length;
    $('timelineCount').textContent = T('timelineCount').replace('%s', seen) +
      (rows.length > seen ? '  ' + T('trackCount').replace('%s', rows.length - seen) : '');

    var box = $('timelineBox');
    box.textContent = '';
    if (!rows.length) {
      var empty = document.createElement('p');
      empty.className = 'logempty';
      empty.textContent = T('timelineEmpty');
      box.appendChild(empty);
      return;
    }

    rows.slice().reverse().forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'logrow timerow' + (p.computed ? ' guess' : '');
      [['lt', clock(p.t)], ['ls', p.lat.toFixed(5) + ', ' + p.lon.toFixed(5)],
       ['ld', p.host || (p.computed ? T('trackComputed') : '')]].forEach(function (pair) {
        var span = document.createElement('span');
        span.className = pair[0];
        span.textContent = pair[1];
        row.appendChild(span);
      });
      box.appendChild(row);
    });
  }

  function bindTimeline() {
    $('timelineOn').addEventListener('change', function () {
      save({ timeline: this.checked });
    });
    $('timelineClear').addEventListener('click', function () {
      // Hareket kaydi iki yerde duruyor. Yalniz birini silmek listeyi yarim
      // temizlerdi, ikisini birden dusuruyoruz.
      var kept = logRows.filter(function (e) { return POSITION_EVENTS.indexOf(e.e) === -1; });
      chrome.storage.local.set({ timeline: [], log: kept }, function () {
        timelineRows = [];
        logRows = kept;
        renderTimeline();
        renderLog();
      });
    });
    $('timelineDownload').addEventListener('click', function () {
      download(timelineText(movementRows()), 'geonomore-timeline.txt', 'text/plain');
    });
  }

  // --- alan adi gruplari ---------------------------------------------------
  // Hazir liste sabit, kullanicinin ekledigi adresler cfg.groupExtras'ta.
  // Ikisi ayri duruyor: hazir liste surumle degisiyor, kullanicininki kalici.

  var openGroups = Object.create(null);

  function groupOn(name) {
    var list = cfg.siteList || [];
    var members = gnmGroupMembers(cfg, name);
    return members.length > 0 && members.every(function (m) { return list.indexOf(m) !== -1; });
  }

  function toggleGroup(name, on) {
    var list = (cfg.siteList || []).slice();
    var members = gnmGroupMembers(cfg, name);

    if (on) {
      members.forEach(function (d) { if (list.indexOf(d) === -1) list.push(d); });
    } else {
      // Ayni adres birden fazla grupta gecebiliyor (google.com hem Maps'te
      // hem Search'te). Hala secili baska bir grupta duruyorsa silme.
      var keep = Object.create(null);
      Object.keys(GNM_DOMAIN_GROUPS).forEach(function (other) {
        if (other === name || !groupOn(other)) return;
        gnmGroupMembers(cfg, other).forEach(function (d) { keep[d] = 1; });
      });
      list = list.filter(function (d) { return members.indexOf(d) === -1 || keep[d]; });
    }

    GNM_LOG.add('ui', 'group.toggle', { group: name, on: on });
    save({ siteList: list }, true);
  }

  // "https://www.Ornek.com/yol" -> "ornek.com". Kullanici adresi nasil
  // yapistirirsa yapistirsin listeye ayni bicimde girsin.
  function cleanDomain(value) {
    var v = String(value || '').trim().toLowerCase();
    v = v.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '');
    v = v.split('/')[0].split('?')[0].split('#')[0].split(':')[0];
    return /^[a-z0-9*][a-z0-9.*-]*\.[a-z]{2,}$/.test(v) ? v : '';
  }

  function addDomain(name, value) {
    var d = cleanDomain(value);
    if (!d) return false;

    var extras = Object.assign({}, cfg.groupExtras);
    var own = (extras[name] || []).slice();
    if (gnmGroupMembers(cfg, name).indexOf(d) !== -1) return true;   // zaten var
    own.push(d);
    extras[name] = own;

    var patch = { groupExtras: extras };
    // Grup seciliyse yeni adres de hemen listeye girsin, yoksa yarim kalir
    if (groupOn(name)) patch.siteList = (cfg.siteList || []).concat([d]);

    GNM_LOG.add('ui', 'group.add', { group: name, domain: d });
    save(patch, true);
    return true;
  }

  function removeDomain(name, d) {
    var extras = Object.assign({}, cfg.groupExtras);
    extras[name] = (extras[name] || []).filter(function (x) { return x !== d; });
    if (!extras[name].length) delete extras[name];

    GNM_LOG.add('ui', 'group.remove', { group: name, domain: d });
    save({
      groupExtras: extras,
      siteList: (cfg.siteList || []).filter(function (x) { return x !== d; })
    }, true);
  }

  function groupMembersBox(name) {
    var box = document.createElement('div');
    box.className = 'members';

    var own = (cfg.groupExtras || {})[name] || [];
    var chips = document.createElement('div');
    chips.className = 'domains';

    gnmGroupMembers(cfg, name).forEach(function (d) {
      var mine = own.indexOf(d) !== -1;
      var chip = document.createElement('span');
      chip.className = 'domain' + (mine ? ' own' : '');

      var text = document.createElement('span');
      text.textContent = d;
      chip.appendChild(text);

      // Hazir listedeki adres silinmiyor; grubun kendisi o. Kullanicinin
      // ekledigi gidebilir.
      if (mine) {
        var del = document.createElement('button');
        del.type = 'button';
        del.textContent = '\u00d7';
        del.title = T('remove');
        del.addEventListener('click', function () { removeDomain(name, d); });
        chip.appendChild(del);
      }
      chips.appendChild(chip);
    });

    var row = document.createElement('div');
    row.className = 'addomain';

    var input = document.createElement('input');
    input.type = 'text';
    input.spellcheck = false;
    input.placeholder = T('groupAddPlaceholder');

    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'link add';
    add.textContent = T('groupAdd');

    var submit = function () {
      openGroups[name] = true;
      if (!addDomain(name, input.value)) input.select();
      else input.value = '';
    };
    add.addEventListener('click', submit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
    });

    row.append(input, add);
    box.append(chips, row);
    return box;
  }

  function renderGroups() {
    var box = $('groups');
    box.textContent = '';

    Object.keys(GNM_DOMAIN_GROUPS).forEach(function (name) {
      var members = gnmGroupMembers(cfg, name);
      var wrap = document.createElement('div');
      wrap.className = 'group';

      var head = document.createElement('label');
      head.className = 'check';

      var input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = groupOn(name);
      input.addEventListener('change', function () { toggleGroup(name, this.checked); });

      var text = document.createElement('span');
      text.textContent = name;

      var count = document.createElement('span');
      count.className = 'count';
      count.textContent = members.length;

      var toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'toggle';
      toggle.textContent = T(openGroups[name] ? 'groupHide' : 'groupShow');
      toggle.addEventListener('click', function (e) {
        // Etiketin icinde duruyor, engellenmezse onay kutusunu da tikliyor
        e.preventDefault();
        openGroups[name] = !openGroups[name];
        renderGroups();
      });

      head.append(input, text, count, toggle);
      wrap.appendChild(head);
      if (openGroups[name]) wrap.appendChild(groupMembersBox(name));
      box.appendChild(wrap);
    });
  }

  // --- presetler -----------------------------------------------------------

  function presetRow(name, apply, extra) {
    var row = document.createElement('div');
    row.className = 'preset' + (cfg.activePreset === name ? ' active' : '') +
      (apply ? '' : ' empty');

    var label = document.createElement('span');
    label.className = 'name';
    label.textContent = name;

    var tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = extra.tag || '';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = apply ? T('apply') : T('presetSetHere');
    btn.addEventListener('click', apply || function () {
      var p = Object.assign({}, cfg.presets);
      p[name] = gnmPresetFrom(cfg);
      save({ presets: p, activePreset: name }, true);
    });

    row.append(label, tag, btn);

    if (extra.deletable) {
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'danger';
      del.textContent = '×';
      del.title = T('remove');
      del.addEventListener('click', function () {
        var p = Object.assign({}, cfg.presets);
        delete p[name];
        save({ presets: p, activePreset: cfg.activePreset === name ? '' : cfg.activePreset }, true);
      });
      row.appendChild(del);
    }

    return row;
  }

  function renderPresets() {
    var box = $('presetList');
    box.textContent = '';
    var all = gnmAllPresets(cfg);

    function applier(name) {
      return function () {
        save(Object.assign({}, all[name], { activePreset: name }), true, true);
      };
    }

    // Home / Work / Travel kullanıcının kendi yerleri. Boş yuva olarak duruyorlar,
    // tek tıkla o anki ayar içlerine giriyor. Dolunca da yerlerinde kalıyorlar.
    GNM_PRESET_SLOTS.forEach(function (name) {
      var filled = Object.prototype.hasOwnProperty.call(cfg.presets, name);
      box.appendChild(filled
        ? presetRow(name, applier(name), { deletable: true })
        : presetRow(name, null, { tag: T('presetEmpty') }));
    });

    Object.keys(all).forEach(function (name) {
      if (GNM_PRESET_SLOTS.indexOf(name) !== -1) return;
      var builtin = Object.prototype.hasOwnProperty.call(GNM_BUILTIN_PRESETS, name) &&
        !Object.prototype.hasOwnProperty.call(cfg.presets, name);
      box.appendChild(presetRow(name, applier(name), {
        tag: builtin ? T('builtin') : '',
        deletable: !builtin
      }));
    });
  }

  function bindPresets() {
    $('presetSave').addEventListener('click', function () {
      var name = $('presetName').value.trim();
      if (!name) { $('presetName').focus(); return; }
      var p = Object.assign({}, cfg.presets);
      p[name] = gnmPresetFrom(cfg);
      $('presetName').value = '';
      save({ presets: p, activePreset: name }, true);
    });
  }

  // --- log -----------------------------------------------------------------

  function clock(ms) {
    var d = new Date(ms);
    var p = function (n, w) { return String(n).padStart(w || 2, '0'); };
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) +
      '.' + p(d.getMilliseconds(), 3);
  }

  function loadLog() {
    chrome.storage.local.get('log', function (r) {
      logRows = (r && r.log) || [];
      renderLog();
    });
  }

  // Konum kayitlari Hareket gecmisinde. Olay log'u geri kalani gosteriyor,
  // yoksa ayni satirlar iki listede birden duruyor ve olay log'u onlarla doluyor.
  function eventRows() {
    return logRows.filter(function (e) { return POSITION_EVENTS.indexOf(e.e) === -1; });
  }

  function visibleRows() {
    var f = $('logFilter').value;
    var rows = eventRows();
    return f ? rows.filter(function (e) { return e.s === f; }) : rows;
  }

  // Kaydin sade karsiligi. Ham satir "bg / dnr.clear / {...}" diyor; bu
  // kullaniciya hicbir sey anlatmiyor. Tabloda olmayan olaylar sade gorunumde
  // hic gosterilmiyor: onlar ic isleyis, hata ararken lazim, gunluk kullanimda
  // gurultu. Hepsi kayitta duruyor, "ham cikti" acilinca geri geliyor.
  var SIMPLE = {
    'installed': 'evtInstalled',
    'config.changed': 'evtSettings',
    'options.set': 'evtSettings',
    'webrtc.set': 'evtProtection',
    'webrtc.block': 'evtProtection',
    'geo.get.call': 'evtAsked',
    'geo.fake': 'evtFaked',
    'geo.denied': 'evtDenied',
    'geo.passthrough': 'evtReal',
    'geo.watch.start': 'evtWatch',
    'tz.read': 'evtTz',
    'locale.read': 'evtLang',
    'map.blocked': 'evtMapBlocked'
  };

  function detailOf(e) {
    var d = e.d;
    if (typeof d === 'string') {
      try { d = JSON.parse(d); } catch (err) { return ''; }
    }
    if (!d) return '';
    if (d.origin) return String(d.origin).replace(/^https?:\/\//, '');
    if (d.url) return String(d.url).replace(/^https?:\/\//, '').split('/')[0];
    if (d.version) return d.version;
    if (Array.isArray(d.keys)) return d.keys.join(', ');
    return '';
  }

  // Ayni saniye icinde ayni cumleyi tekrarlamiyoruz: bir ayar degisince
  // arka plan uc dort kayit birden atiyor, sade gorunumde hepsi ayni satir.
  function simpleRows(rows) {
    var out = [];
    var last = null;
    rows.forEach(function (e) {
      var key = SIMPLE[e.e];
      if (!key) return;
      var who = detailOf(e);
      var text = T(key).replace('%s', who);
      if (last && last.text === text && e.t - last.t < 2000) return;
      last = { text: text, t: e.t };
      out.push({ t: e.t, text: text, err: /error|fail|blocked/.test(e.e) });
    });
    return out;
  }

  function renderLog() {
    $('logging').checked = cfg.logging !== false;
    $('logVerbose').checked = !!cfg.logVerbose;
    $('logDetail').checked = !!cfg.logDetail;

    var sources = [];
    eventRows().forEach(function (e) { if (sources.indexOf(e.s) === -1) sources.push(e.s); });
    var keep = $('logFilter').value;
    fill($('logFilter'), [{ value: '', text: T('logAllSources') }].concat(sources));
    $('logFilter').value = sources.indexOf(keep) === -1 ? '' : keep;

    var rows = visibleRows();
    $('logCount').textContent = T('logCount')
      .replace('%1', rows.length).replace('%2', eventRows().length);

    var box = $('logBox');
    box.textContent = '';

    if (!rows.length) {
      var empty = document.createElement('p');
      empty.className = 'logempty';
      empty.textContent = T('logEmpty');
      box.appendChild(empty);
      return;
    }

    // Son kayıtlar üstte olsun, hata ararken en taze olan aranır
    if (!cfg.logDetail) {
      // Sade gorunum TUM kayittan besleniyor, eventRows'dan degil. "Siteye
      // sahte konum verildi" kullanicinin en cok isine yarayan satir ve o
      // olay ham listeden hareket gecmisine ayrildigi icin disarida kaliyordu.
      // Gurultuyu zaten SIMPLE tablosu eliyor.
      var f = $('logFilter').value;
      var all = f ? logRows.filter(function (e) { return e.s === f; }) : logRows;
      var simple = simpleRows(all);
      if (!simple.length) {
        var none = document.createElement('p');
        none.className = 'logempty';
        none.textContent = T('logQuiet');
        box.appendChild(none);
        return;
      }
      simple.slice().reverse().forEach(function (e) {
        var row = document.createElement('div');
        row.className = 'logrow simple' + (e.err ? ' err' : '');
        [['lt', clock(e.t)], ['lx', e.text]].forEach(function (pair) {
          var span = document.createElement('span');
          span.className = pair[0];
          span.textContent = pair[1];
          row.appendChild(span);
        });
        box.appendChild(row);
      });
      return;
    }

    rows.slice().reverse().forEach(function (e) {
      var row = document.createElement('div');
      row.className = 'logrow' + (/error|fail|unsupported/.test(e.e) ? ' err' : '');
      [['lt', clock(e.t)], ['ls', e.s], ['le', e.e], ['ld', e.d]].forEach(function (pair) {
        var span = document.createElement('span');
        span.className = pair[0];
        span.textContent = pair[1];
        row.appendChild(span);
      });
      box.appendChild(row);
    });
  }

  // Kopyalanan metnin başına durum özeti koyuyoruz. Log'a tek başına bakınca
  // hangi ayarla üretildiği belli olmuyor.
  function logText() {
    var m = chrome.runtime.getManifest();
    var head = [
      'GeoNoMore ' + m.version,
      navigator.userAgent,
      'enabled=' + cfg.enabled +
        ' siteMode=' + cfg.siteMode +
        ' privacy=' + cfg.privacy +
        ' exact=' + cfg.exact +
        ' zone=' + JSON.stringify(cfg.zone),
      'tz=' + cfg.timeZone + ' (auto=' + cfg.tzAuto + ')' +
        ' locale=' + cfg.locale + ' (auto=' + cfg.localeAuto + ')',
      'localeSpoof=' + cfg.localeSpoof +
        ' acceptLanguage=' + cfg.acceptLanguage +
        ' webrtc=' + cfg.webrtc,
      'lat=' + cfg.lat + ' lon=' + cfg.lon + ' custom=' + cfg.custom,
      'siteList=' + (cfg.siteList || []).length +
        ' siteProfiles=' + (cfg.siteProfiles || []).length +
        ' override=' + JSON.stringify(cfg.override),
      'ui=' + cfg.language + '/' + cfg.theme +
        ' kayit=' + logRows.length + ' verbose=' + !!cfg.logVerbose,
      '---'
    ];
    var body = visibleRows().map(function (e) {
      return clock(e.t) + '  ' + e.s.padEnd(7) + ' ' + e.e.padEnd(18) + ' ' + e.d;
    });

    // Konum satirlari listede gorunmuyor ama sorun ayiklarken en cok onlar
    // gerekiyor, metnin sonuna kendi bolumleri olarak ekleniyor.
    var moves = movementRows();
    if (moves.length) {
      body = body.concat(['', '--- movement (' + moves.length + ')'],
        moves.map(function (m) {
          return clock(m.t) + '  ' + m.lat.toFixed(5) + ', ' + m.lon.toFixed(5) +
            (m.host ? '  ' + m.host : '');
        }));
    }
    return head.concat(body).join('\n');
  }

  function bindLog() {
    ['logging', 'logVerbose'].forEach(function (id) {
      $(id).addEventListener('change', function () {
        var patch = {};
        patch[id] = this.checked;
        save(patch);
      });
    });

    $('logFilter').addEventListener('change', renderLog);

    $('logCopy').addEventListener('click', function () {
      var text = logText();
      navigator.clipboard.writeText(text).then(function () {
        // Kendi alanında duruyor, listenin otomatik tazelenmesi silmesin
        $('logMsg').textContent = T('logCopied');
        setTimeout(function () { $('logMsg').textContent = ''; }, 2500);
      }, function () {
        // Pano reddedilirse metni seçilebilir bırak, kullanıcı elle kopyalasın
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.width = '100%';
        ta.rows = 12;
        $('logBox').replaceChildren(ta);
        ta.select();
      });
    });

    $('logDownload').addEventListener('click', function () {
      download(logText(), 'geonomore-log.txt', 'text/plain');
    });

    $('logClear').addEventListener('click', function () {
      chrome.storage.local.set({ log: [] }, function () {
        logRows = [];
        renderLog();
        renderTimeline();
      });
    });

    // Başka sekmede kayıt oluşunca liste kendiliğinden tazelensin
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local' || !changes.log || !logTabOpen()) return;
      logRows = changes.log.newValue || [];
      renderLog();
      renderTimeline();
    });
  }

  // --- ortak ---------------------------------------------------------------

  function render() {
    renderMode();
    renderTopbar();
    renderGeneral();
    renderLocation();
    renderPrivacy();
    renderConsistency();
    renderSites();
    renderRules();
    renderMotion();
    renderSchedule();
    renderPresets();
    syncMap();
    if (logTabOpen()) { renderLog(); renderTimeline(); }
  }

  gnmGet(function (loaded) {
    cfg = loaded;
    gnmApplyTheme(cfg.theme);
    renderByline();
    // Yardim balonlarinin metnini T() ile doldur; native title kullaniliyor
    // ki ekran okuyucu da bulabilsin.
    document.querySelectorAll('.help[data-tip]').forEach(function (b) {
      b.title = T(b.dataset.tip);
    });
    GNM_LOG.enable(cfg.logging !== false);

    gnmLoadLang(cfg.language, function () {
      gnmApplyStrings(document);
      // Profil secenekleri: "Ad - ne yapar". Aciklamayi ayri satirda degil
      // secenegin icinde gosteriyoruz. Dil degisince sayfa reload oldugu icin
      // burada bir kez etiketlemek yetiyor.
      Array.prototype.forEach.call($('motionProfile').options, function (o) {
        var k = o.value.charAt(0).toUpperCase() + o.value.slice(1);
        o.textContent = T('prof' + k) + ' - ' + T('prof' + k + 'Desc');
      });
      fetch(chrome.runtime.getURL('core/geo-data.json'))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          DATA = data;

          // Kayıtlı seçim geo-data ile uyuşmuyorsa (eski sürümden kalma ad)
          // önce düzelt, yoksa çizim yarıda kalıyor
          var fix = gnmGeoFix(DATA, cfg);
          if (fix) {
            GNM_LOG.add('ui', 'geo.repair', fix);
            Object.assign(cfg, fix);
            gnmSet(fix);
          }
          GNM_LOG.add('ui', 'options.open', { enabled: cfg.enabled });
        $('version').textContent = 'v' + chrome.runtime.getManifest().version;
          bindMode();
          bindTopbar();
          bindGeneral();
          bindLocation();
          bindPrivacy();
          bindConsistency();
          bindSites();
          bindRules();
          bindMotion();
          bindSchedule();
          bindTimeline();
          bindPresets();
          bindLog();
          render();
          initMap();
          // Ilk acilista Location: kullanici ayarlara konum icin geliyor
          selectTab(document.querySelector('#tabs button[data-tab].sel'));
        });
    });
  });
})();
