/* Once - landing-page illustrations.
   Each artwork is a flat vector restatement of a real app screen: the people are
   the app's own profile photos, everything around them (chrome, cards, buttons,
   the phone itself) is drawn. There is no lettering anywhere - every piece of
   copy is a blurred bar, so a screen reads as a screen in any language.
   Colours are the site's palette custom properties from styles.css, never
   literals, so the art always matches the app. Flat fills only, no gradients.

   Screens are designed once against a 300x617 phone and placed with device()
   at whatever size a scene needs; scenes are 800x500 (wide), 800x450 (final)
   or 300x617 (phone), matching the media aspect ratios in styles.css. */
(function (w) {
  'use strict';

  /* ---------- Palette handles ---------- */
  var SURFACE = 'var(--surface)';
  var PAGE = 'var(--bg)';
  var LINE = 'var(--art-line)';
  var TINT = 'var(--art-tint)';
  var GHOST = 'var(--art-ghost)';
  var INK = 'var(--ink)';
  var ACCENT = 'var(--accent)';
  var BRAND = 'var(--brand)';

  /* The people are the app's own test profiles. Every scene draws from the same
     pool, and no two people in a scene are the same: F(i) walks the pool, which
     alternates women and men, so consecutive picks always differ. */
  var FACES = (function () {
    var out = [];
    for (var i = 1; i <= 24; i++) out.push('media/p' + (i < 10 ? '0' : '') + i + '.jpg');
    return out;
  })();
  function F(i) { return FACES[i % FACES.length]; }

  /* Phone design space. Every screen below is drawn against it. */
  var SW = 300, SH = 617;

  /* ---------- Primitives ---------- */
  var uid = 0;
  function id(prefix) { return prefix + '-' + (++uid); }
  function n(v) { return Math.round(v * 100) / 100; }
  function op(o) { return o == null ? '' : ' opacity="' + o + '"'; }

  function rect(x, y, wd, ht, r, fill, extra) {
    return '<rect x="' + n(x) + '" y="' + n(y) + '" width="' + n(wd) + '" height="' + n(ht) +
      '" rx="' + n(r) + '" fill="' + fill + '"' + (extra || '') + '/>';
  }
  function circle(cx, cy, r, fill, extra) {
    return '<circle cx="' + n(cx) + '" cy="' + n(cy) + '" r="' + n(r) + '" fill="' + fill + '"' + (extra || '') + '/>';
  }
  function ring(cx, cy, r, stroke, sw, extra) {
    return '<circle cx="' + n(cx) + '" cy="' + n(cy) + '" r="' + n(r) + '" fill="none" stroke="' + stroke +
      '" stroke-width="' + sw + '"' + (extra || '') + '/>';
  }
  function path(d, extra) { return '<path d="' + d + '"' + (extra || '') + '/>'; }
  function line(d, stroke, sw, extra) {
    return path(d, ' fill="none" stroke="' + stroke + '" stroke-width="' + sw +
      '" stroke-linecap="round" stroke-linejoin="round"' + (extra || ''));
  }
  function group(inner, extra) { return '<g' + (extra || '') + '>' + inner + '</g>'; }
  function place(x, y, s, inner) { return '<g transform="translate(' + n(x) + ',' + n(y) + ') scale(' + n(s) + ')">' + inner + '</g>'; }

  function pt(cx, cy, r, deg) {
    var t = (deg - 90) * Math.PI / 180;
    return n(cx + r * Math.cos(t)) + ' ' + n(cy + r * Math.sin(t));
  }
  function arc(cx, cy, r, a0, a1, stroke, sw, extra) {
    return line('M' + pt(cx, cy, r, a0) + 'A' + r + ' ' + r + ' 0 ' + ((a1 - a0) > 180 ? 1 : 0) + ' 1 ' + pt(cx, cy, r, a1), stroke, sw, extra);
  }

  /* Deterministic jitter, so noise art is identical on every render. */
  function lcg(seed) {
    var s = seed;
    return function () { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  }

  /* ---------- Photo ---------- */
  /* A real profile photo, cropped to fill the box. `zoom` > 1 pushes in on the
     face; `dy` nudges the crop vertically. */
  function photo(x, y, wd, ht, r, src, o, zoom, dy) {
    var c = id('clip');
    zoom = zoom || 1;
    var iw = wd * zoom, ih = ht * zoom;
    return '<clipPath id="' + c + '">' + rect(x, y, wd, ht, r, '#000') + '</clipPath>' +
      '<image href="' + src + '" x="' + n(x - (iw - wd) / 2) + '" y="' + n(y - (ih - ht) / 2 + (dy || 0)) +
      '" width="' + n(iw) + '" height="' + n(ih) + '" preserveAspectRatio="xMidYMid slice" clip-path="url(#' + c + ')"' + op(o) + '/>';
  }

  /* ---------- App chrome parts ---------- */
  /* A line of copy: present, deliberately unreadable. */
  function bar(x, y, wd, ht, fill, o) {
    return rect(x, y, wd, ht || 10, (ht || 10) / 2, fill || INK, ' filter="url(#BLUR)"' + op(o == null ? 0.6 : o));
  }
  function roundBtn(cx, cy, r, glyph) { return circle(cx, cy, r, SURFACE) + glyph; }
  function hamburger(cx, cy, wd) {
    return line('M' + n(cx - wd / 2) + ' ' + n(cy - wd * 0.34) + 'h' + n(wd) +
      'M' + n(cx - wd / 2) + ' ' + n(cy) + 'h' + n(wd) +
      'M' + n(cx - wd / 2) + ' ' + n(cy + wd * 0.34) + 'h' + n(wd), INK, n(wd * 0.15));
  }
  /* The path runs 1.62s tall, so it starts half of that above cy: the glyph is
     centred on (cx, cy) and drops straight into a round button. */
  function shield(cx, cy, s, fill) {
    return path('M' + n(cx) + ' ' + n(cy - s * 0.81) + 'l' + n(s * 0.72) + ' ' + n(s * 0.26) + 'v' + n(s * 0.5) +
      'c0 ' + n(s * 0.46) + ' ' + n(-s * 0.3) + ' ' + n(s * 0.75) + ' ' + n(-s * 0.72) + ' ' + n(s * 0.86) +
      'c' + n(-s * 0.42) + ' ' + n(-s * 0.11) + ' ' + n(-s * 0.72) + ' ' + n(-s * 0.4) + ' ' + n(-s * 0.72) + ' ' + n(-s * 0.86) +
      'v' + n(-s * 0.5) + 'Z', ' fill="' + (fill || ACCENT) + '"');
  }
  function heart(cx, cy, s, fill) {
    return path('M' + n(cx) + ' ' + n(cy + s * 0.62) + 'c' + n(-s * 0.06) + ' 0 ' + n(-s * 0.53) + ' ' + n(-s * 0.33) + ' ' + n(-s * 0.69) + ' ' + n(-s * 0.64) +
      'c' + n(-s * 0.11) + ' ' + n(-s * 0.25) + ' ' + n(-s * 0.03) + ' ' + n(-s * 0.53) + ' ' + n(s * 0.22) + ' ' + n(-s * 0.61) +
      'c' + n(s * 0.19) + ' ' + n(-s * 0.08) + ' ' + n(s * 0.39) + ' ' + n(s * 0.03) + ' ' + n(s * 0.47) + ' ' + n(s * 0.17) +
      'c' + n(s * 0.08) + ' ' + n(-s * 0.14) + ' ' + n(s * 0.28) + ' ' + n(-s * 0.25) + ' ' + n(s * 0.47) + ' ' + n(-s * 0.17) +
      'c' + n(s * 0.25) + ' ' + n(s * 0.08) + ' ' + n(s * 0.33) + ' ' + n(s * 0.36) + ' ' + n(s * 0.22) + ' ' + n(s * 0.61) +
      'c' + n(-s * 0.16) + ' ' + n(s * 0.31) + ' ' + n(-s * 0.63) + ' ' + n(s * 0.64) + ' ' + n(-s * 0.69) + ' ' + n(s * 0.64) + 'Z', ' fill="' + (fill || SURFACE) + '"');
  }
  /* A credit: a coin - solid disc with a rim struck into it. */
  function token(cx, cy, r, color, o, inner) {
    color = color || BRAND;
    return group(circle(cx, cy, r, color) +
      ring(cx, cy, r * 0.64, inner || SURFACE, Math.max(1.4, r * 0.13), ' opacity=".85"'), op(o));
  }
  function chip(x, y, wd, glyph) {
    var ht = 30;
    return rect(x, y, wd, ht, ht / 2, SURFACE) + bar(x + 14, y + 10, wd - 52, 10) +
      group(glyph, ' transform="translate(' + n(x + wd - 26) + ',' + n(y + 15) + ')"');
  }
  /* A text-only chip: the same beige tile, one line of copy, no trailing glyph.
     `bold` reads it a touch heavier - the name/age heading uses it. */
  function plainChip(x, y, wd, bold) {
    var ht = 30;
    return rect(x, y, wd, ht, ht / 2, SURFACE) +
      bar(x + 14, y + 10, wd - 28, bold ? 11 : 10, INK, bold ? 0.78 : 0.6);
  }
  /* The report button: deliberately de-emphasised beside the heart - the small
     chrome size over the DARKER page beige with a MUTED shield, so it recedes
     rather than mirroring the heart (user directive 2026-07-26). */
  function reportBtn(cx, cy, r) {
    return circle(cx, cy, r, PAGE) + group(shield(cx, cy, r * 0.62, ACCENT), op(0.5));
  }
  function pinGlyph(s) {
    return line('M0 ' + n(-s) + 'c' + n(s * 0.6) + ' 0 ' + n(s) + ' ' + n(s * 0.44) + ' ' + n(s) + ' ' + n(s) +
      'c0 ' + n(s * 0.8) + ' ' + n(-s) + ' ' + n(s * 1.72) + ' ' + n(-s) + ' ' + n(s * 1.72) +
      's' + n(-s) + ' ' + n(-s * 0.92) + ' ' + n(-s) + ' ' + n(-s * 1.72) + 'c0 ' + n(-s * 0.56) + ' ' + n(s * 0.4) + ' ' + n(-s) + ' ' + n(s) + ' ' + n(-s) + 'Z', ACCENT, s * 0.3) +
      circle(0, s * 0.05, s * 0.34, 'none', ' stroke="' + ACCENT + '" stroke-width="' + n(s * 0.3) + '"');
  }
  function userGlyph(s) {
    return circle(0, -s * 0.45, s * 0.42, 'none', ' stroke="' + ACCENT + '" stroke-width="' + n(s * 0.26) + '"') +
      line('M' + n(-s * 0.72) + ' ' + n(s * 0.7) + 'c0 ' + n(-s * 0.5) + ' ' + n(s * 0.32) + ' ' + n(-s * 0.78) + ' ' + n(s * 0.72) + ' ' + n(-s * 0.78) +
        's' + n(s * 0.72) + ' ' + n(s * 0.28) + ' ' + n(s * 0.72) + ' ' + n(s * 0.78), ACCENT, s * 0.26);
  }
  /* Two overlapping heads - the shared-group fact chip. */
  function usersGlyph(s) {
    return ring(-s * 0.42, 0, s * 0.4, ACCENT, n(s * 0.24)) + ring(s * 0.42, 0, s * 0.4, ACCENT, n(s * 0.24));
  }

  /* ---------- Screens (drawn against 300x617) ---------- */
  var SCREEN = {};

  /* Home: one person, full bleed, with the shell chrome over it. The match card
     layout (2026-07-26): hamburger top-START, name/age heading chip top-END, the
     fact chips (distance, family, shared group) stacked bottom-START, the small
     de-emphasised report at the very bottom-START, and the heart (invite) floating
     bottom-END. */
  SCREEN.home = function (face, o) {
    o = o || {};
    return photo(0, 0, SW, SH, 0, face || F(0), null, o.zoom, o.dy) +
      roundBtn(34, 42, 20, hamburger(34, 42, 18)) +
      plainChip(166, 27, 118, true) +
      chip(16, 404, 168, pinGlyph(7)) +
      chip(16, 442, 150, userGlyph(9)) +
      chip(16, 480, 120, usersGlyph(8)) +
      reportBtn(36, 556, 20) +
      circle(254, 546, 30, BRAND) + heart(254, 546, 20) +
      rect(105, 598, 90, 5, 2.5, INK, op(0.35));
  };

  /* Invite: the countdown panel over the person. `tone` picks the action colour. */
  SCREEN.invite = function (face, tone, withToken) {
    var btn = tone || BRAND;
    return rect(0, 0, SW, 250, 0, PAGE) +
      roundBtn(266, 34, 18, hamburger(266, 34, 16)) +
      bar(46, 66, 208, 11) + bar(30, 88, 240, 11) + bar(70, 110, 160, 11) +
      rect(108, 140, 84, 26, 13, INK, ' filter="url(#BLUR)" opacity=".78"') +
      rect(24, 192, withToken ? 168 : 252, 44, 22, btn) +
      bar(withToken ? 66 : 108, 208, withToken ? 84 : 84, 12, SURFACE, 0.92) +
      (withToken ? rect(204, 192, 72, 44, 22, GHOST) + bar(222, 209, 36, 11, INK, 0.4) + token(48, 214, 12, SURFACE, 1, BRAND) : '') +
      photo(0, 250, SW, SH - 250, 0, face || F(1), null, 1, 0) +
      roundBtn(34, 286, 18, shield(34, 286, 12));
  };

  /* Chat: the conversation that opens on a match. */
  SCREEN.chat = function () {
    var bubble = function (x, y, wd, mine) {
      return rect(x, y, wd, 44, 18, mine ? BRAND : TINT, mine ? '' : ' stroke="' + LINE + '" stroke-width="1.5"') +
        bar(x + 16, y + 17, wd - 32, 11, mine ? SURFACE : INK, mine ? 0.9 : 0.5);
    };
    return rect(0, 0, SW, SH, 0, PAGE) +
      rect(0, 0, SW, 58, 0, TINT) + rect(14, 16, 46, 26, 13, SURFACE) + bar(112, 24, 76, 12, INK, 0.7) +
      circle(268, 29, 15, SURFACE) + line('M262 23l12 12M274 23l-12 12', INK, 2.4, op(0.6)) +
      bubble(24, 300, 190, false) + bubble(24, 356, 150, false) +
      bubble(96, 412, 180, true) + bubble(140, 468, 136, true) +
      rect(0, 545, SW, 72, 0, TINT) + circle(36, 581, 22, BRAND) +
      rect(70, 561, 212, 40, 20, SURFACE) + bar(88, 576, 110, 11, INK, 0.35) +
      rect(105, 606, 90, 5, 2.5, INK, op(0.3));
  };

  /* Report: the safety sheet, one tap from every card. The sheet rises over the
     person with a shield at its head, so the screen reads as safety at a glance. */
  SCREEN.report = function (face) {
    return photo(0, -2, SW, 396, 0, face || F(1), null, 1, -10) +
      roundBtn(34, 42, 20, hamburger(34, 42, 18)) +
      plainChip(166, 27, 118, true) +
      rect(0, 370, SW, 280, 30, PAGE, ' filter="url(#SHADOW)"') +
      rect(138, 384, 24, 4, 2, INK, op(0.25)) +
      circle(150, 428, 30, TINT) + shield(150, 428, 18, ACCENT) +
      bar(105, 470, 90, 14, INK, 0.75) +
      rect(20, 500, 260, 56, 16, SURFACE, ' stroke="' + LINE + '" stroke-width="2"') +
      bar(38, 516, 190, 11, INK, 0.3) + bar(38, 536, 120, 11, INK, 0.3) +
      rect(20, 568, 260, 42, 21, ACCENT) + bar(110, 585, 80, 12, SURFACE, 0.92);
  };

  /* ---------- Devices ---------- */
  /* A drawn phone with a screen inside it, scaled from the 300x617 design. */
  function device(x, y, s, inner, shadow) {
    var c = id('screen');
    var wd = SW * s, ht = SH * s, r = 34 * s, b = 6 * s;
    return rect(x - b, y - b, wd + b * 2, ht + b * 2, r + b, INK, shadow ? ' filter="url(#SHADOW)"' : '') +
      '<clipPath id="' + c + '">' + rect(x, y, wd, ht, r, '#000') + '</clipPath>' +
      group(rect(x, y, wd, ht, 0, PAGE) + place(x, y, s, inner), ' clip-path="url(#' + c + ')"');
  }

  /* A small profile card - the app's card, reduced to photo plus two lines. */
  function miniCard(x, y, wd, ht, face, o, zoom) {
    var c = id('mini');
    return group(
      rect(x, y, wd, ht, wd * 0.13, SURFACE, ' stroke="' + LINE + '" stroke-width="2"') +
      (face ? photo(x + wd * 0.08, y + wd * 0.08, wd * 0.84, ht * 0.6, wd * 0.09, face, null, zoom || 1.15, 0)
        : rect(x + wd * 0.08, y + wd * 0.08, wd * 0.84, ht * 0.6, wd * 0.09, TINT)) +
      rect(x + wd * 0.08, y + wd * 0.08 + ht * 0.66, wd * 0.5, ht * 0.06, ht * 0.03, GHOST) +
      rect(x + wd * 0.08, y + wd * 0.08 + ht * 0.78, wd * 0.68, ht * 0.05, ht * 0.025, GHOST), op(o));
  }

  /* A circular avatar, used wherever a person appears as a dot. */
  function avatar(cx, cy, r, face, o, stroke) {
    return photo(cx - r, cy - r, r * 2, r * 2, r, face, o, 1.25, 0) +
      (stroke ? ring(cx, cy, r, stroke, Math.max(2, r * 0.14)) : '');
  }

  /* ---------- Canvas ---------- */
  function svg(wd, ht, body, fill) {
    var sh = id('sh'), bl = id('bl');
    return '<svg class="art" viewBox="0 0 ' + wd + ' ' + ht + '" preserveAspectRatio="xMidYMid ' +
      (fill ? 'slice' : 'meet') + '" aria-hidden="true" focusable="false">' +
      '<defs>' +
      '<filter id="' + sh + '" x="-40%" y="-40%" width="180%" height="180%">' +
      '<feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="' + INK + '" flood-opacity="0.16"/></filter>' +
      '<filter id="' + bl + '" x="-25%" y="-120%" width="150%" height="340%"><feGaussianBlur stdDeviation="2.4"/></filter>' +
      '</defs>' +
      rect(0, 0, wd, ht, 0, 'var(--art-bg)') +
      body.replace(/#SHADOW/g, '#' + sh).replace(/#BLUR/g, '#' + bl) +
      '</svg>';
  }
  function wide(body) { return svg(800, 500, body); }
  /* A phone artwork IS the device frame's content, so it fills it edge to edge:
     a hair of crop beats a band of background along the top. */
  function phone(body) { return svg(SW, SH, body, true); }

  /* ---------- Artworks ---------- */
  var ART = {};

  /* Hero: the home screen itself - one person, one action. */
  ART.hero = function () { return phone(SCREEN.home(F(0))); };

  /* Problem: a crowd of profile cards around the one that is actually clear. */
  ART.problem = function () {
    var crowd = [
      [24, -34, F(8), 0.42], [156, -50, F(9), 0.38], [292, -62, F(10), 0.36], [438, -50, F(11), 0.38], [594, -34, F(12), 0.42],
      [-30, 74, F(13), 0.46], [46, 208, F(14), 0.6], [0, 342, F(15), 0.46], [124, 412, F(16), 0.44], [292, 444, null, 0.32],
      [702, 70, F(17), 0.46], [640, 208, F(18), 0.6], [688, 342, F(19), 0.46], [560, 412, F(20), 0.44], [440, 444, null, 0.32]
    ];
    return wide(
      crowd.map(function (g) { return miniCard(g[0], g[1], 116, 152, g[2], g[3], 1.4); }).join('') +
      device(325, 42, 0.68, SCREEN.home(F(1)), true)
    );
  };

  /* Difference: the four principles - one person, one credit, a timer, an invitation. */
  ART.principles = function () {
    var tile = function (x, y) { return rect(x, y, 352, 196, 22, SURFACE, ' stroke="' + LINE + '" stroke-width="2"'); };

    var one = group(miniCard(112, 84, 76, 100, null, 0.4) + miniCard(232, 84, 76, 100, null, 0.4)) +
      miniCard(170, 74, 80, 116, F(2), 1, 1.5);

    var credit = circle(590, 132, 58, TINT) + token(590, 132, 40);

    var timer = circle(210, 368, 46, TINT) + ring(210, 368, 46, LINE, 8) + arc(210, 368, 46, 0, 250, BRAND, 8) +
      line('M210 368V342M210 368l17 11', INK, 5) + circle(210, 368, 4.5, INK);

    var invite = rect(500, 322, 180, 92, 22, SURFACE, ' stroke="' + LINE + '" stroke-width="2" filter="url(#SHADOW)"') +
      avatar(534, 368, 26, F(21)) + bar(574, 348, 86, 12) + bar(574, 374, 62, 11, INK, 0.4) +
      token(680, 322, 15, BRAND);

    return wide(tile(34, 34) + tile(414, 34) + tile(34, 270) + tile(414, 270) + one + credit + timer + invite);
  };

  /* The step artworks are read at a card's width, so each one carries a single
     large subject: legibility beats detail at that size. */

  /* How, step 1: a short profile - a few photos and a few words. */
  ART.step1 = function () {
    return wide(
      rect(180, 46, 440, 408, 44, SURFACE, ' stroke="' + LINE + '" stroke-width="3" filter="url(#SHADOW)"') +
      photo(214, 80, 180, 180, 26, F(3), null, 1.25, 0) + rect(406, 80, 180, 180, 26, TINT) +
      rect(214, 272, 180, 180, 26, TINT) + rect(406, 272, 180, 180, 26, TINT) +
      line('M496 148v44M474 170h44M304 340v44M282 362h44M496 340v44M474 362h44', ACCENT, 8, op(0.45))
    );
  };

  /* How, step 2: the search that ends on one candidate. */
  ART.step2 = function () {
    return wide(
      ring(400, 250, 236, ACCENT, 5, op(0.16)) + ring(400, 250, 178, ACCENT, 5, op(0.26)) + ring(400, 250, 120, ACCENT, 5, op(0.38)) +
      miniCard(288, 76, 224, 348, F(4), 1, 1.3)
    );
  };

  /* How, step 3: two clear actions - move on, or invite. */
  ART.step3 = function () {
    return wide(
      miniCard(288, 24, 224, 340, F(5), 1, 1.3) +
      circle(300, 400, 72, SURFACE, ' stroke="' + LINE + '" stroke-width="3"') +
      line('M276 376l48 48M324 376l-48 48', INK, 9, op(0.45)) +
      circle(500, 400, 72, BRAND) + heart(500, 400, 46)
    );
  };

  /* How, step 4: the ten-minute window. */
  ART.step4 = function () {
    return wide(
      circle(400, 250, 176, TINT) + ring(400, 250, 176, LINE, 22) + arc(400, 250, 176, 0, 250, BRAND, 22) +
      line('M400 250V148M400 250l66 42', INK, 16) + circle(400, 250, 16, INK)
    );
  };

  /* How, step 5: the match, and the chat it opens. */
  ART.step5 = function () {
    return wide(
      avatar(288, 148, 100, F(6), null, SURFACE) + avatar(512, 148, 100, F(7), null, SURFACE) +
      token(400, 148, 42) +
      rect(150, 302, 320, 68, 34, TINT) + bar(184, 328, 240, 16, INK, 0.45) +
      rect(330, 394, 320, 68, 34, BRAND) + bar(376, 420, 220, 16, SURFACE, 0.9)
    );
  };

  /* Psychology: noise settling into one calm, present moment. */
  ART.psychology = function () {
    var rows = [[92, 42, 0.24, 2, 11], [166, 29, 0.34, 2.5, 23], [240, 17, 0.46, 3, 37], [314, 7, 0.6, 3.5, 51]];
    var body = rows.map(function (r) {
      var rand = lcg(r[4]), pts = [], steps = 20;
      for (var i = 0; i <= steps; i++) pts.push(n(60 + (680 / steps) * i) + ' ' + n(r[0] + (rand() * 2 - 1) * r[1]));
      return line('M' + pts.join('L'), ACCENT, r[3], op(r[2]));
    }).join('');

    var dots = '', rand = lcg(7);
    for (var i = 0; i < 26; i++) {
      var y = 40 + rand() * 240;
      dots += circle(50 + rand() * 700, y, 3 + rand() * 3, ACCENT, op(n(0.3 * (1 - (y - 40) / 280) + 0.05)));
    }

    return wide(dots + body + line('M60 400h268M472 400h268', INK, 5) +
      ring(400, 400, 64, ACCENT, 3, op(0.28)) + avatar(400, 400, 46, F(22), null, SURFACE));
  };

  /* Dual role: both people can invite and be invited, at the same time. */
  ART.dualRole = function () {
    return wide(
      device(96, 60, 0.62, SCREEN.home(F(2)), true) +
      device(518, 60, 0.62, SCREEN.home(F(3)), true) +
      line('M292 176Q400 108 508 176', ACCENT, 3, ' stroke-dasharray="8 9" opacity=".7"') +
      line('M494 166l14 10-14 10', ACCENT, 3, op(0.7)) +
      line('M508 344Q400 412 292 344', ACCENT, 3, ' stroke-dasharray="8 9" opacity=".7"') +
      line('M306 334l-14 10 14 10', ACCENT, 3, op(0.7)) +
      token(400, 142, 17) + token(400, 378, 17)
    );
  };

  /* Credits: one invitation, one credit out of a small daily balance. */
  ART.credits = function () {
    return wide(
      device(310, 24, 0.62, SCREEN.invite(F(4), BRAND, true), true) +
      token(150, 190, 40) + token(650, 190, 40) +
      token(112, 330, 24, BRAND, 0.35) + token(688, 330, 24, BRAND, 0.35) +
      line('M196 214Q250 268 296 300', BRAND, 3, ' stroke-dasharray="7 9" opacity=".6"') +
      line('M604 214Q550 268 504 300', BRAND, 3, ' stroke-dasharray="7 9" opacity=".6"')
    );
  };

  /* Matching: the right person nearby, not a random pick. */
  ART.matching = function () {
    var grid = '';
    for (var x = 128; x < 740; x += 68) grid += line('M' + x + ' 60V440', LINE, 2, op(0.6));
    for (var y = 128; y < 440; y += 68) grid += line('M60 ' + y + 'H740', LINE, 2, op(0.6));

    var spots = [[196, 160], [648, 146], [228, 380], [612, 372], [404, 100], [148, 268], [692, 274], [396, 412]];
    var dots = spots.map(function (s, i) { return circle(s[0], s[1], 9, ACCENT, op(i % 2 ? 0.26 : 0.36)); }).join('');

    return wide(
      rect(60, 60, 680, 380, 30, TINT) + grid + dots +
      ring(400, 250, 92, ACCENT, 3, op(0.28)) + ring(400, 250, 148, ACCENT, 3, op(0.18)) + ring(400, 250, 204, ACCENT, 3, op(0.1)) +
      avatar(300, 176, 34, F(11), 0.9, SURFACE) + avatar(508, 328, 34, F(16), 0.9, SURFACE) +
      circle(400, 250, 56, SURFACE) + avatar(400, 250, 48, F(23), null, BRAND) +
      circle(400, 250, 48, BRAND, op(0.001))
    );
  };

  /* Safety: end it, block, report - always one tap away. */
  ART.safety = function () { return phone(SCREEN.report(F(5))); };

  /* Final: the three moments - meet, invite, talk. */
  ART.final = function () {
    return svg(800, 450,
      device(72, 44, 0.58, SCREEN.home(F(6)), true) +
      device(310, 44, 0.58, SCREEN.invite(F(7), BRAND, true), true) +
      device(548, 44, 0.58, SCREEN.chat(), true)
    );
  };

  w.ART = ART;
})(window);
