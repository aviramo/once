/* Once - the invite hand-off, in ONE place.
   Both invite links (/g/<TOKEN> for a group, /f/<CODE> for a friend) serve a
   page whose only job is: hand the invite to the installed app, and when
   nothing catches it, put the visitor on the real download page with the invite
   still attached. The two links differ only in their shape, so they share this
   module rather than each carrying its own copy of the same script.

   The invite rides to /download as the very query fragment the app parses back
   out of the Play install referrer ("grp=<TOKEN>" / "ref=<CODE>&f=1"), and
   store.js passes it through to the store link — so a fresh install still joins
   the group / connects the friend on first launch, with nothing to type. */
(function (w) {
  'use strict';

  var DOWNLOAD = '/download';
  var SCHEME = 'once';
  /* Same package as store.js's Play link. Duplicated for the same reason that
     one is: these are static assets served straight from /public and cannot
     import a shared constant. */
  var PACKAGE = 'com.aviramo.once';
  /* How long to wait for the app to take the link before deciding it isn't
     installed. Long enough for the OS hand-off, short enough that a visitor
     without the app isn't left staring at this page. Only the browsers that
     understand nothing but the bare scheme ever wait it out — an Android
     browser is told where to go instead (see `handoff` below). */
  var HANDOFF_MS = 1200;

  var SHAPES = [
    {
      re: /^\/g\/(\d{6})\/?$/,
      host: 'g',
      /* Group tokens are digits only; a 6-digit "ref" would be indistinguishable
         from a referral code, so the group invite gets its own param. */
      query: function (v) { return 'grp=' + v; }
    },
    {
      re: /^\/f\/([A-Za-z0-9]{4,16})\/?$/,
      host: 'f',
      upper: true,
      /* Same code as the credit referral, plus the friend flag — a fresh install
         both attributes the invite and links the pair. */
      query: function (v) { return 'ref=' + v + '&f=1'; }
    }
  ];

  var shape = null, value = '';
  for (var i = 0; i < SHAPES.length; i++) {
    var m = SHAPES[i].re.exec(location.pathname);
    if (m) { shape = SHAPES[i]; value = SHAPES[i].upper ? m[1].toUpperCase() : m[1]; break; }
  }

  /* Not an invite URL at all (a truncated or hand-edited link): there is
     nothing to hand off, so just go where every stray visitor belongs. */
  if (!shape) { location.replace(DOWNLOAD); return; }

  var download = DOWNLOAD + '?' + shape.query(value);
  var button = document.getElementById('fallback');
  if (button) button.href = download;

  /* Where to send the browser. Android gets an `intent://` URI rather than the
     bare `once://` one: it names the package, so the BROWSER resolves the whole
     question itself — installed, it opens the app; not installed, it goes
     straight to `browser_fallback_url`, with no wait and no guessing on our
     part. The bare scheme can say neither, because a browser with nothing to
     catch it simply does nothing at all, which is the only reason the timer
     below exists. Everyone else (iOS, desktop) still gets the plain scheme. */
  var appUrl = SCHEME + '://' + shape.host + '/' + value;
  function handoff() {
    if (!/android/i.test(navigator.userAgent || '')) return appUrl;
    return 'intent://' + shape.host + '/' + value + '#Intent' +
      ';scheme=' + SCHEME +
      ';package=' + PACKAGE +
      /* Absolute: the browser hands this to a fresh navigation of its own, so a
         site-relative path has nothing to resolve against. */
      ';S.browser_fallback_url=' + encodeURIComponent(location.origin + download) +
      ';end';
  }

  /* The app taking over hides this page, which is the signal that the hand-off
     worked. `pagehide` covers it on every browser that fires it, and the
     visibility check covers the ones that keep the page alive in the background
     without firing anything. */
  var timer = setTimeout(function () {
    if (document.hidden) return;
    location.replace(download);
  }, HANDOFF_MS);
  w.addEventListener('pagehide', function () { clearTimeout(timer); });

  location.href = handoff();
})(window);
