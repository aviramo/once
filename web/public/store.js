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

  /* "ref=<CODE>" for a personal invite whose /i/<CODE> URL the browser kept. */
  function referrerFromPath() {
    var m = REFERRAL_PATH_RE.exec(location.pathname);
    return m ? 'ref=' + m[1].toUpperCase() : null;
  }

  /* The invite hand-off pages (/g/<TOKEN>, /f/<CODE>) forward here with the
     invite in the query when no installed app caught the link (invite.js). The
     params ARE the referrer fragment the app parses back on first launch, so
     they pass straight through: a group token under its own `grp` (six digits
     would otherwise be indistinguishable from a referral code), a friend under
     the referral `ref` plus the friend flag. */
  function referrerFromQuery() {
    if (typeof URLSearchParams !== 'function') return null;
    var q = new URLSearchParams(location.search);
    var grp = q.get('grp');
    if (grp && /^\d{6}$/.test(grp)) return 'grp=' + grp;
    var ref = q.get('ref');
    if (ref && /^[A-Za-z0-9]{4,16}$/.test(ref)) {
      return 'ref=' + ref.toUpperCase() + (q.get('f') === '1' ? '&f=1' : '');
    }
    return null;
  }

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
    /* The Play listing, carrying the invite when there is one. `&`, not `?`:
       PLAY_URL already carries the ?id= query, and appending a second `?`
       folded the whole referrer INTO the package id — Play saw no referrer at
       all, so every invite built here went unattributed. */
    url: function () {
      var referrer = referrerFromPath() || referrerFromQuery();
      return referrer ? PLAY_URL + '&referrer=' + encodeURIComponent(referrer) : PLAY_URL;
    },
    /* The scan code is drawn with the app's ink on white; qr.js needs literals. */
    qrColors: { dark: '#33265B', light: '#FFFFFF' }
  };
})(window);
