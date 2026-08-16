/* Once - where a download press goes, in ONE place.
   The home page owns the press now (there was a /download page for it until
   2026-08-16 and it said nothing this one does not), so the store URL, the
   platform rules and the referral rule live here rather than in each page that
   needs them. A page owns its own copy (the notes are per-language) and its own
   presentation; this module owns the destination. */
(function (w) {
  'use strict';

  var PLAY_URL = 'https://play.google.com/store/apps/details?id=com.aviramo.once';

  /* EVERY invite reaches this page as a QUERY, whatever shape it was shared in:
     a personal invite (/i/<CODE>) is redirected here as ?ref=<CODE> by
     proxy.ts, and the two hand-off pages (/g/<TOKEN>, /f/<CODE>) forward here
     with theirs when no installed app caught the link (invite.js). The params
     ARE the referrer fragment the app parses back on first launch, so they pass
     straight through: a group token under its own `grp` (six digits would
     otherwise be indistinguishable from a referral code), a friend under the
     referral `ref` plus the friend flag. */
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
    /* Whether this visitor arrived on an invite at all. The scan code asks,
       because a code that skips this page would drop the invite with it. */
    referrer: referrerFromQuery,
    /* The Play listing, carrying the invite when there is one. `&`, not `?`:
       PLAY_URL already carries the ?id= query, and appending a second `?`
       folded the whole referrer INTO the package id — Play saw no referrer at
       all, so every invite built here went unattributed. */
    url: function () {
      var referrer = referrerFromQuery();
      return referrer ? PLAY_URL + '&referrer=' + encodeURIComponent(referrer) : PLAY_URL;
    },
    /* The scan code is drawn with the app's ink on white; qr.js needs literals. */
    qrColors: { dark: '#33265B', light: '#FFFFFF' }
  };
})(window);
