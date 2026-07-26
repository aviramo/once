/* Once - where a download press goes, in ONE place.
   Both the landing page and /download press the same button, so the store URL,
   the platform rules and the referral rule live here rather than being written
   twice and drifting apart. Pages own their own copy (the notes are per-language)
   and their own presentation; this module owns the destination. */
(function (w) {
  'use strict';

  var PLAY_URL = 'https://play.google.com/store/apps/details?id=com.aviramo.once';

  /* A personal invite (/i/<CODE>) is rewritten to the download page for every
     non-Android visitor while the browser keeps the /i/<CODE> URL, so the code is
     still readable here and can ride the Play referrer exactly as proxy.ts packs
     it for an Android visitor. */
  var REFERRAL_PATH_RE = /^\/i\/([A-Za-z0-9]{4,16})\/?$/;

  var ua = navigator.userAgent || navigator.vendor || w.opera || '';
  var isAndroid = /android/i.test(ua);
  /* iPadOS 13+ reports as "MacIntel" with a touch screen, so this also catches
     modern iPads that no longer say "iPad" in the UA. */
  var isIOS = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  w.OnceStore = {
    isAndroid: isAndroid,
    isIOS: isIOS,
    /* Anything that is neither: nothing to install here, the phone does it. */
    isDesktop: !isAndroid && !isIOS,
    /* The Play listing, carrying the referral code when there is one. */
    url: function () {
      var m = REFERRAL_PATH_RE.exec(location.pathname);
      return m ? PLAY_URL + '?referrer=' + encodeURIComponent('ref=' + m[1].toUpperCase()) : PLAY_URL;
    },
    /* The scan code is drawn with the app's ink on white; qr.js needs literals. */
    qrColors: { dark: '#33265B', light: '#FFFFFF' }
  };
})(window);
