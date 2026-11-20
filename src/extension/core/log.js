// Ortak log tamponu. Kayıtları biriktirir, toplu halde bir "sink" fonksiyonuna verir.
// Sink'i her bağlam kendi belirler: sayfa dünyası postMessage ile, uzantı sayfaları
// runtime mesajıyla gönderir. Burada tarayıcı ya da bağlam sezmeye çalışmıyoruz,
// çağıran açıkça söylüyor.
//
//   GNM_LOG.via(fn)        gönderim yolunu ver
//   GNM_LOG.enable(bool)   kayıt açık mı
//   GNM_LOG.add(s, e, d)   kaynak, olay, ayrıntı

var GNM_LOG = (function () {
  'use strict';

  var BATCH = 25;
  var DELAY = 400;

  var buf = [];
  var timer = 0;
  var sink = null;
  var enabled = true;

  function flush() {
    timer = 0;
    if (!sink || !buf.length) return;
    var batch = buf;
    buf = [];
    try { sink(batch); } catch (e) { /* gönderemedik, log yüzünden iş durmasın */ }
  }

  return {
    via: function (fn) {
      sink = fn;
      flush();
    },

    enable: function (on) {
      enabled = on !== false;
      if (!enabled) buf = [];
    },

    add: function (source, event, detail) {
      if (!enabled) return;
      buf.push({ t: Date.now(), s: source, e: event, d: detail });
      if (buf.length >= BATCH) {
        clearTimeout(timer);
        flush();
      } else if (!timer) {
        timer = setTimeout(flush, DELAY);
      }
    },

    flush: flush
  };
})();
