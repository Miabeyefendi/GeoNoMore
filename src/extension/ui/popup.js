(function () {
  'use strict';

  var E = globalThis.__gnmEngine;
  var $ = function (id) { return document.getElementById(id); };

  var DATA = null;
  var cfg = null;
  var host = '';

  // "Session boyunca" ile "tarayıcı kapanana kadar" bir uzantıda aynı şey,
  // tek seçenek olarak duruyor: browser.
  var OVERRIDE_CHOICES = [5, 15, 30, 60, 'browser'];

  GNM_LOG.via(function (entries) {
    try {
      chrome.runtime.sendMessage({ __gnmLog: entries }, function () {
        return chrome.runtime.lastError;
      });
    } catch (e) { /* arka plan yok, log yüzünden popup durmasın */ }
  });

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

  // Hareket acikken konum duruyor gibi gorunmesin: mini pencere de ust
  // cubuktaki kip neyse onu gostermeli, yoksa sitelere gidenle burada yazan
  // birbirini tutmuyor.
  function live() {
    return cfg.motion && cfg.motion.on ? E.motionAt(cfg.motion, Date.now()) : null;
  }

  function privacyText() {
    var moving = live();
    var base = cfg.exact
      ? T('exactSummary')
      : T('privacySummary')
        .replace('%1', T(cfg.privacy))
        .replace('%2', E.zoneOf({ zone: cfg.zone, privacy: cfg.privacy })[1]);
    return moving ? T('modeMoving') + '  \u00b7  ' + base : base;
  }

  // --- geçici geçersiz kılma -----------------------------------------------

  function activeOverride() {
    var ov = cfg.override;
    if (!ov) return null;
    if (ov.until !== 'browser' && Date.now() >= ov.expiresAt) return null;
    if (ov.host && ov.host !== host) return null;
    return ov;
  }

  function renderOverride() {
    var ov = activeOverride();
    var items = [];

    if (!host) {
      $('siteName').textContent = T('noSite');
      $('siteDot').className = 'dot';
      $('override').hidden = true;
      return;
    }

    $('override').hidden = false;

    if (ov) {
      $('siteName').textContent = ov.until === 'browser'
        ? T('exactUntilBrowser')
        : T('exactForMinutes').replace('%s', Math.max(1, Math.round((ov.expiresAt - Date.now()) / 60000)));
      $('siteDot').className = 'dot on';
      items.push({ value: '', text: T('overrideActive') });
      items.push({ value: 'cancel', text: T('overrideCancel') });
    } else {
      $('siteName').textContent = host;
      // Yalniz "acik mi" degil: site listesi (only / except) bu siteyi disarida
      // birakiyorsa nokta yanmaz. Karar motordan, sayfanin kendisiyle ayni.
      $('siteDot').className = 'dot' + (E.activeFor(cfg, host) ? ' on' : '');
      items.push({ value: '', text: T('overrideMenu') });
      OVERRIDE_CHOICES.forEach(function (c) {
        items.push(c === 'browser'
          ? { value: 'browser', text: T('overrideUntilBrowser') }
          : { value: String(c), text: T('overrideMin').replace('%s', c) });
      });
    }

    fill($('override'), items, '');
  }

  function render() {
    fill($('country'), gnmGeoCountryCodes(DATA).map(function (c) {
      return { value: c, text: DATA.countries[c].name };
    }), cfg.country);
    var places = gnmGeoPlaces(DATA, cfg.country).map(function (p) { return p.name; });
    if (cfg.custom) places = [{ value: '__custom', text: T('customPoint') }].concat(places);
    fill($('city'), places, cfg.custom ? '__custom' : cfg.city);

    // Saat dilimi ve dil seçime göre kendiliğinden gelir, burada yalnız
    // gösteriliyor. Elle değiştirmek options'ın Consistency sekmesinde.
    $('tzField').textContent = cfg.timeZone;
    $('localeField').textContent = cfg.locale;
    var moving = live();
    $('latField').textContent = (moving ? moving.lat : cfg.lat).toFixed(4);
    $('lonField').textContent = (moving ? moving.lon : cfg.lon).toFixed(4);
    $('placePrivacy').textContent = privacyText();

    // Tek düğme, üstünde yapılacak iş çizili: duruyorsa yeşil oynat,
    // çalışıyorsa kırmızı duraklat. Simge CSS'te, popup.css'e bak.
    $('power').setAttribute('aria-pressed', String(cfg.enabled));
    $('power').title = T(cfg.enabled ? 'stop' : 'start');

    $('state').textContent = T(cfg.enabled ? 'statusRunning' : 'statusStopped');
    $('state').classList.toggle('on', cfg.enabled);

    // Sitelerin gordugu yer. Duruyorsa soluk: siteler gercek konumu goruyor.
    var place = cfg.custom ? T('customPoint') : cfg.city;
    $('idPlace').textContent = place + (DATA.countries[cfg.country] ? ', ' + cfg.country : '');
    $('idProt').textContent = T('protOn').replace('%s', gnmProtCount(cfg));
    $('idTile').classList.toggle('off', !cfg.enabled);

    renderOverride();
  }

  function save(patch) {
    GNM_LOG.add('ui', 'popup.set', { keys: Object.keys(patch) });
    gnmSet(patch, function (updated) {
      cfg = updated;
      render();
      GNM_LOG.flush(); // popup birazdan kapanabilir, kayıt tamponda kalmasın
    });
  }

  function openOptions() {
    chrome.runtime.openOptionsPage();
    window.close();
  }

  function bind() {
    $('gear').addEventListener('click', openOptions);
    $('more').addEventListener('click', openOptions);

    $('country').addEventListener('change', function () {
      save(gnmGeoNormalize(DATA, cfg, { country: this.value }));
    });

    $('city').addEventListener('change', function () {
      if (this.value === '__custom') return;
      save(gnmGeoNormalize(DATA, cfg, { country: cfg.country, city: this.value }));
    });

    $('power').addEventListener('click', function () { save({ enabled: !cfg.enabled }); });

    $('override').addEventListener('change', function () {
      var v = this.value;
      if (!v) return;
      if (v === 'cancel') { save({ override: null }); return; }
      save({
        override: v === 'browser'
          ? { host: host, exact: true, until: 'browser' }
          : { host: host, exact: true, expiresAt: Date.now() + parseInt(v, 10) * 60000 }
      });
    });

    $('permBtn').addEventListener('click', function () {
      chrome.permissions.request({ origins: ['<all_urls>'] }, function (granted) {
        if (granted) $('permWarn').hidden = true;
      });
    });
  }

  // Firefox MV3'te host izinleri kurulumda verilmiş sayılmıyor, kullanıcı ayrıca
  // vermeli. Chrome ve Edge'de bu kontrol her zaman true döner.
  function checkPermission() {
    if (!chrome.permissions || !chrome.permissions.contains) return;
    chrome.permissions.contains({ origins: ['<all_urls>'] }, function (has) {
      $('permWarn').hidden = !!has;
    });
  }

  function readActiveTab(done) {
    if (!chrome.tabs || !chrome.tabs.query) return done();
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var url = tabs && tabs[0] && tabs[0].url;
      if (url && /^https?:/i.test(url)) host = E.hostOf(url);
      done();
    });
  }

  gnmGet(function (loaded) {
    cfg = loaded;
    gnmApplyTheme(cfg.theme);
    GNM_LOG.enable(cfg.logging !== false);

    gnmLoadLang(cfg.language, function () {
      gnmApplyStrings(document);
      fetch(chrome.runtime.getURL('core/geo-data.json'))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          DATA = data;

          // Kayıtlı seçim geo-data ile uyuşmuyorsa (eski sürümden kalma ad)
          // önce düzelt, yoksa çizim yarıda kalıyor
          var fix = gnmGeoFix(DATA, cfg);
          if (fix) {
            GNM_LOG.add('ui', 'geo.repair', { keys: Object.keys(fix) });
            Object.assign(cfg, fix);
            gnmSet(fix);
          }
          bind();
          checkPermission();
          readActiveTab(function () {
            GNM_LOG.add('ui', 'popup.open', { enabled: cfg.enabled });
            render();

            // Hareket varken konum surekli degisiyor. Pencere zaten kisa omurlu,
            // acikken iki saniyede bir tazelemek yetiyor.
            if (cfg.motion && cfg.motion.on) {
              setInterval(function () {
                var m = live();
                if (!m) return;
                $('latField').textContent = m.lat.toFixed(4);
                $('lonField').textContent = m.lon.toFixed(4);
              }, 2000);
            }
          });
        });
    });
  });
})();
