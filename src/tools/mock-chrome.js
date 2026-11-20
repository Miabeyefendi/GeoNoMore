// Önizleme sunucusunun HTML'e enjekte ettiği sahte chrome API'si.
// PAKETE GİRMİYOR: src/extension dışında duruyor, build.js buraya bakmıyor.
//
// Amaç arayüzü tarayıcıda açabilmek. Depolama localStorage'a düşüyor, mesajlar
// boşa gidiyor. Davranış testi burada YAPILMAZ, onun için src/tests var.

(function () {
  'use strict';

  var KEY = 'gnm-preview';

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch (e) { return {}; }
  }

  function save(all) {
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { /* dolu */ }
  }

  var listeners = [];

  // ?browser=firefox: Firefox'a özel kartları görmek için. Gerçek Firefox'ta
  // yalnız orada olan browser.runtime.getBrowserInfo'yu taklit ediyor;
  // core/ui.js gnmBrowser() buna bakıyor.
  if (/[?&]browser=firefox\b/.test(location.search)) {
    window.browser = { runtime: { getBrowserInfo: function () { return Promise.resolve({ name: 'Firefox' }); } } };
  }

  window.chrome = {
    runtime: {
      lastError: null,
      id: 'preview',
      getURL: function (p) { return '/' + p; },
      sendMessage: function (msg, cb) { if (cb) setTimeout(cb, 0); },
      onMessage: { addListener: function () {} },
      getManifest: function () { return { version: 'preview' }; }
    },

    storage: {
      local: {
        get: function (keys, cb) {
          var all = load();
          var out = {};
          if (typeof keys === 'string') keys = [keys];
          if (Array.isArray(keys)) keys.forEach(function (k) { out[k] = all[k]; });
          else if (keys && typeof keys === 'object') {
            Object.keys(keys).forEach(function (k) {
              out[k] = all[k] === undefined ? keys[k] : all[k];
            });
          } else out = all;
          setTimeout(function () { cb(out); }, 0);
        },
        set: function (obj, cb) {
          var all = load();
          var changes = {};
          Object.keys(obj).forEach(function (k) {
            changes[k] = { oldValue: all[k], newValue: obj[k] };
            all[k] = obj[k];
          });
          save(all);
          setTimeout(function () {
            listeners.forEach(function (f) { f(changes, 'local'); });
            if (cb) cb();
          }, 0);
        },
        remove: function (keys, cb) {
          var all = load();
          (Array.isArray(keys) ? keys : [keys]).forEach(function (k) { delete all[k]; });
          save(all);
          if (cb) setTimeout(cb, 0);
        },
        clear: function (cb) { save({}); if (cb) setTimeout(cb, 0); }
      },
      onChanged: { addListener: function (f) { listeners.push(f); } }
    },

    permissions: {
      contains: function (p, cb) { setTimeout(function () { cb(true); }, 0); },
      request: function (p, cb) { setTimeout(function () { cb(true); }, 0); }
    },

    action: {
      setBadgeText: function () {},
      setBadgeBackgroundColor: function () {},
      setTitle: function () {}
    },

    tabs: { query: function (q, cb) { setTimeout(function () { cb([]); }, 0); } },

    declarativeNetRequest: { updateDynamicRules: function (o, cb) { if (cb) cb(); } },

    privacy: { network: {} }
  };
})();
