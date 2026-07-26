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
  /* How long to wait for the app to take the link before deciding it isn't
     installed. Long enough for the OS hand-off, short enough that a visitor
     without the app isn't left staring at this page. */
  var HANDOFF_MS = 1200;

  var SHAPES = [
    {
      re: /^\/g\/(\d{6})\/?$/,
      scheme: 'once://g/',
      /* Group tokens are digits only; a 6-digit "ref" would be indistinguishable
         from a referral code, so the group invite gets its own param. */
      query: function (v) { return 'grp=' + v; }
    },
    {
      re: /^\/f\/([A-Za-z0-9]{4,16})\/?$/,
      scheme: 'once://f/',
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

  /* The app taking over hides this page, which is the signal that the hand-off
     worked. `pagehide` covers it on every browser that fires it, and the
     visibility check covers the ones that keep the page alive in the background
     without firing anything. */
  var timer = setTimeout(function () {
    if (document.hidden) return;
    location.replace(download);
  }, HANDOFF_MS);
  w.addEventListener('pagehide', function () { clearTimeout(timer); });

  location.href = shape.scheme + value;
})(window);
