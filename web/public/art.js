/* Once - landing-page illustrations.
   Each artwork is a flat vector restatement of a real app screen: the people are
   the app's own profile photos, everything around them (chrome, cards, buttons,
   the phone itself) is drawn. There is no lettering anywhere - every piece of
   copy is a blurred bar, so a screen reads as a screen in any language.
   Colours are the site's palette custom properties from styles.css, never
   literals, so the art always matches the app. Flat fills only, no gradients.

   Screens are designed once against a 300x617 phone and placed with device()
   at whatever size a scene needs; scenes are 800x500 (wide) or 800x450 (final),
   matching the media aspect ratios in styles.css. */
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
  /* A text-only chip: the same white tile, one line of copy, no trailing glyph.
     `bold` reads it a touch heavier - the name/age heading uses it. */
  function plainChip(x, y, wd, bold) {
    var ht = 30;
    return rect(x, y, wd, ht, ht / 2, SURFACE) +
      bar(x + 14, y + 10, wd - 28, bold ? 11 : 10, INK, bold ? 0.78 : 0.6);
  }
  /* The report button: deliberately de-emphasised beside the heart - the small
     chrome size over the TINTED page purple with a MUTED shield, so it recedes
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

  /* Communities hub: my-friends (pinned) over the groups you manage / are in,
     with create + find actions. Pale top, dark glyphs, no purple band. */
  SCREEN.communities = function () {
    // A short row of overlapping member faces, left to right.
    var faces = function (x, y, r, list) {
      return list.map(function (f, i) { return avatar(x + i * (r * 1.35), y, r, f, null, SURFACE); }).join('');
    };
    // One group row: rounded tile, a group thumbnail, a name line, a little
    // cluster of member faces and a count.
    var groupRow = function (y, thumb, list) {
      return rect(20, y, 260, 76, 18, SURFACE, ' stroke="' + LINE + '" stroke-width="2"') +
        photo(32, y + 12, 52, 52, 14, thumb, null, 1.2, 0) +
        bar(100, y + 18, 116, 12) +
        faces(102, y + 48, 11, list) + bar(176, y + 44, 34, 9, INK, 0.4);
    };
    return rect(0, 0, SW, SH, 0, PAGE) +
      // header: back chevron + title
      line('M42 34l-10 10 10 10', INK, 3, op(0.7)) +
      bar(62, 36, 92, 15, INK, 0.8) +
      // my-friends, pinned (a distinct tinted tile)
      rect(20, 74, 260, 84, 20, TINT) +
      faces(54, 116, 18, [F(6), F(7), F(8)]) +
      bar(150, 100, 94, 13) + bar(150, 126, 64, 10, INK, 0.4) +
      // groups you manage
      bar(24, 180, 118, 10, INK, 0.5) + groupRow(198, F(9), [F(10), F(11), F(12)]) +
      // groups you are in
      bar(24, 292, 118, 10, INK, 0.5) + groupRow(310, F(13), [F(14), F(15), F(16)]) +
      // actions: create (solid) + find (outline)
      rect(20, 406, 124, 46, 23, BRAND) + bar(52, 423, 60, 12, SURFACE, 0.92) +
      rect(156, 406, 124, 46, 23, SURFACE, ' stroke="' + LINE + '" stroke-width="2"') + bar(184, 423, 68, 11, INK, 0.45) +
      rect(105, 598, 90, 5, 2.5, INK, op(0.35));
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

  /* A pile of profile cards: the habit Once does away with. Three cards leaning
     on each other read as ONE object, so the scene stays quiet - only the card on
     top carries a person, the ones behind it are blank, and the whole pile fades
     back so nothing competes with the phone. `tilt` leans the pile (negate it to
     mirror the pile on the other side of the phone). */
  function cardPile(cx, cy, wd, face, tilt) {
    var ht = wd * 1.31;
    var lean = [[tilt * 2, -18, 0.22], [tilt, -9, 0.36], [0, 0, 0.6]];
    return lean.map(function (l, i) {
      return group(miniCard(cx - wd / 2, cy - ht / 2 + l[1], wd, ht, i === lean.length - 1 ? face : null, l[2], 1.35),
        ' transform="rotate(' + n(l[0]) + ' ' + n(cx) + ' ' + n(cy) + ')"');
    }).join('');
  }

  /* A circular avatar, used wherever a person appears as a dot. */
  function avatar(cx, cy, r, face, o, stroke) {
    return photo(cx - r, cy - r, r * 2, r * 2, r, face, o, 1.25, 0) +
      (stroke ? ring(cx, cy, r, stroke, Math.max(2, r * 0.14)) : '');
  }

  /* ---------- Canvas ---------- */
  function svg(wd, ht, body) {
    var sh = id('sh'), bl = id('bl');
    return '<svg class="art" viewBox="0 0 ' + wd + ' ' + ht + '" preserveAspectRatio="xMidYMid meet"' +
      ' aria-hidden="true" focusable="false">' +
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

  /* ---------- Artworks ---------- */
  var ART = {};

  /* ---------- Store feature graphic ---------- */
  /* Redrawn from mobile/store/play-feature-graphic.svg so the site band and the
     Play listing are the same picture: the ringed "1", the broken dial around it,
     three hearts, one profile card and a scatter of dots. Every element below is
     defined ONCE and only placed differently by the two layouts, so the long
     desktop band is the same drawing stretched along its length, not a redesign.
     Colours come from the palette vars, which hold the same hex values the store
     file hardcodes. */
  var MUTED = 'var(--muted)';
  var GROUND = 'var(--ground)';

  /* Every piece of the banner comes out of these helpers wrapped in a group that
     carries a CLASS and nothing else. It paints nothing and moves nothing: it is
     there so a page can stage the picture's ARRIVAL piece by piece
     (download.html does) without a CSS transform having to fight the `transform`
     ATTRIBUTE already on the thing it would move. A CSS transform REPLACES that
     attribute rather than composing with it, which would tear the numeral, the
     hearts and the card off their positions the moment they were animated; the
     wrapper is the layer an entrance is allowed to touch. */
  function part(cls, inner, style) {
    return '<g class="' + cls + '"' + (style ? ' style="' + style + '"' : '') + '>' + inner + '</g>';
  }
  /* A stroke a page may DRAW rather than reveal. `pathLength="1"` restates the
     path's length as 1, so a dash animation is `stroke-dashoffset: 1 -> 0` in
     CSS with nothing measured in JS and nothing to keep in sync with the `d`. */
  var DRAWABLE = ' pathLength="1"';
  /* Where a piece PIVOTS, stated in the drawing's own coordinates. It is the one
     thing about an entrance that CSS cannot know and the drawing can: a
     connector grows from the end it STARTS at, and only the `d` says which end
     that is. view-box and not fill-box on purpose — a horizontal rule's fill box
     has no height, which is not a box to measure a centre against. */
  function pivot(x, y) {
    return 'transform-box:view-box;transform-origin:' + n(x) + 'px ' + n(y) + 'px';
  }

  /* The concentric rings, thinning outwards. The store file bleeds four of them
     off its edges; on the page a stroke that stops dead against the header reads as
     a cropping mistake, so the band draws `count` of them (three) at a scale that
     keeps the outermost inside the canvas. */
  function fgRings(cx, cy, s, count) {
    return part('fg-rings', [[200, 10], [250, 8.4], [300, 6.8], [350, 5.2]].slice(0, count || 4).map(function (r) {
      return ring(cx, cy, r[0] * s, GROUND, n(r[1] * s), ' class="fg-ring"');
    }).join(''));
  }
  /* The dial: a long brand-purple sweep with a short muted one riding above it. */
  function fgDial(cx, cy, s) {
    var r = 172 * s, sw = n(11 * s), drawable = ' class="fg-arc"' + DRAWABLE;
    return part('fg-dial', arc(cx, cy, r, 22, 300, BRAND, sw, drawable) + arc(cx, cy, r, 310, 350, MUTED, sw, drawable));
  }
  /* The "1" itself: one stroked polyline, drawn in the store file's own 1024 glyph
     space so the shape stays identical at any size. */
  function fgOne(cx, cy, s) {
    return part('fg-one', '<g transform="translate(' + n(cx) + ',' + n(cy) + ') scale(' + n(s) +
      ') translate(-512,-512)" fill="none" stroke="' + BRAND +
      '" stroke-width="150" stroke-linecap="round" stroke-linejoin="round">' +
      '<path class="fg-stroke"' + DRAWABLE + ' d="M577 312 L447 412 M577 312 L577 712"/></g>');
  }
  /* The store graphic's heart (a filled Material heart, not the app's own). */
  function fgHeart(cx, cy, s, fill) {
    return part('fg-heart', '<path transform="translate(' + n(cx) + ',' + n(cy) + ') scale(' + n(s) +
      ') translate(-12,-12)" fill="' + fill + '" d="M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41 0.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>');
  }
  /* The profile card, tilted off true. Its innards keep the store file's absolute
     coordinates and are moved as a whole, so the card is pixel-identical. */
  function fgCard(cx, cy, s) {
    var clip = id('fg');
    return part('fg-card', '<g transform="translate(' + n(cx) + ',' + n(cy) + ') scale(' + n(s) +
      ') translate(-810,-250) rotate(-4 810 250)">' +
      rect(706, 90, 208, 320, 32, GROUND) +
      rect(712, 96, 196, 308, 26, SURFACE) +
      rect(728, 112, 164, 150, 18, GROUND) +
      '<clipPath id="' + clip + '">' + rect(728, 112, 164, 150, 18, '#000') + '</clipPath>' +
      '<g clip-path="url(#' + clip + ')">' +
        circle(810, 178, 30, ACCENT) +
        path('M 752 266 a 58,52 0 0 1 116,0 z', ' fill="' + ACCENT + '"') +
      '</g>' +
      rect(734, 282, 104, 12, 6, ACCENT) +
      rect(734, 308, 140, 12, 6, MUTED) +
      rect(734, 330, 92, 12, 6, GROUND) +
      circle(902, 358, 32, BRAND) +
      fgHeart(902, 358, 1.4, SURFACE) +
      '</g>');
  }
  function fgDots(list, s) {
    return part('fg-dots', list.map(function (d) {
      return circle(d[0], d[1], n(d[2] * s), d[3], ' class="fg-dot"');
    }).join(''));
  }
  /* The cluster the whole picture hangs off: rings, dial and the numeral. */
  function fgCluster(cx, cy, s, rings) {
    return fgRings(cx, cy, s, rings) + fgDial(cx, cy, s) + fgOne(cx, cy, 0.5 * s);
  }

  /* Under RTL the band swaps its two ends so the numeral leads from the reading
     side, by MOVING each element rather than mirroring the canvas: a scaleX(-1)
     would reverse the "1" itself (and the site does mirror other art that way).
     `X(w)` returns the x-mapper for a canvas that wide. */
  function X(w, rtl) { return function (x) { return rtl ? w - x : x; }; }

  /* The store arrangement at full size, on a canvas 120 units taller than the
     store's 500 with everything sitting 60 lower: same drawing, but with clear air
     above it so the band is not shaved off by the header. */
  ART.banner = function (rtl) {
    var x = X(1024, rtl), dy = 60;
    return svg(1024, 620,
      fgCluster(x(360), 250 + dy, 1, 3) +
      fgHeart(x(556), 322 + dy, 1.5, BRAND) + fgHeart(x(628), 210 + dy, 2, ACCENT) + fgHeart(x(674), 330 + dy, 1.2, MUTED) +
      fgCard(x(810), 250 + dy, 1) +
      fgDots([[x(150), 96 + dy, 11, BRAND], [x(198), 142 + dy, 6, ACCENT], [x(112), 402 + dy, 8, MUTED],
        [x(624), 96 + dy, 7, BRAND], [x(600), 418 + dy, 6, MUTED], [x(966), 430 + dy, 8, ACCENT]], 1));
  };

  /* The same picture drawn along a wide band for desktop: identical elements,
     scaled together and spread over the length instead of stacked into a 2:1 box.
     6.4:1 keeps the band about 220px tall at a laptop width, so it sits under the
     header without pushing the headline off the screen. */
  ART.bannerLong = function (rtl) {
    var s = 0.55, x = X(1920, rtl);
    return svg(1920, 340,
      fgCluster(x(300), 170, s, 3) +
      fgHeart(x(780), 105, 1.5 * s, BRAND) + fgHeart(x(1070), 205, 2 * s, ACCENT) + fgHeart(x(1340), 110, 1.2 * s, MUTED) +
      fgCard(x(1700), 170, 0.56) +
      fgDots([[x(660), 260, 11, BRAND], [x(890), 70, 6, ACCENT], [x(1190), 265, 8, MUTED],
        [x(1450), 85, 7, BRAND], [x(1530), 240, 6, MUTED], [x(1860), 115, 8, ACCENT]], s));
  };

  /* Message 1, one person at a time: the pile of cards set aside on either side of
     the one screen that is actually clear. Two quiet piles rather than a scatter of
     faces - the section's own words are "no feed, no pile of cards", and a scene
     that shouts about the habit competes with the person it is meant to leave alone. */
  /* The parts each scene below is built from carry a class and nothing else, in
     the banner's own vocabulary (see `part`): `sc-lead` is what the picture is
     ABOUT, `sc-aside` what stands beside it, and the rest name themselves. The
     ORDER they arrive in is each picture's own and lives in styles.css, next to
     the message it illustrates. */
  ART.one = function () {
    return wide(
      part('sc-aside', cardPile(146, 262, 156, F(9), -5)) +
      part('sc-aside', cardPile(654, 238, 156, F(14), 5)) +
      part('sc-lead', device(325, 42, 0.68, SCREEN.home(F(1)), true))
    );
  };

  /* The question under the hero: one person's whole attention closing in on one
     face. Same vocabulary as the message scenes - real photos, flat rings, the
     dashed link that means "these two are connected", the brand rim on whoever
     is lit. The crowd sits OUTSIDE the rings, faded and joined to nobody: they
     are the twenty other conversations, and none of them is looking at you. */
  ART.focus = function () {
    var cx = 336, cy = 200;
    return svg(600, 400,
      part('sc-crowd', [[62, 52, 26, F(11)], [130, 342, 22, F(16)], [524, 66, 21, F(18)], [548, 328, 27, F(21)]]
        .map(function (g) { return avatar(g[0], g[1], g[2], g[3], 0.28); }).join('')) +
      part('sc-ring', ring(cx, cy, 152, ACCENT, 3, op(0.16))) +
      part('sc-ring', ring(cx, cy, 118, ACCENT, 4, op(0.3))) +
      part('sc-ring', ring(cx, cy, 88, ACCENT, 6, op(0.5))) +
      part('sc-link', line('M100 200H' + (cx - 152), ACCENT, 3, ' stroke-dasharray="7 9" opacity=".5"'), pivot(100, 200)) +
      part('sc-face', avatar(58, 200, 40, F(4), null, ACCENT)) +
      part('sc-lead', avatar(cx, cy, 62, F(1), null, BRAND))
    );
  };

  /* Message 3, friends and shared circles: the hub on the START side;
     on the other, members of one community linked to each other, with a friend
     pair lit brand-purple - friends surface to each other first. */
  ART.circles = function () {
    var cx = 556, cy = 250, R = 150;
    var ring6 = [
      [cx, cy - R, F(3)], [cx + 132, cy - 74, F(4)], [cx + 132, cy + 74, F(5)],
      [cx, cy + R, F(6)], [cx - 132, cy + 74, F(7)], [cx - 132, cy - 74, F(8)]
    ];
    // Every spoke is drawn FROM the hub outwards, so a page that draws them
    // draws the circle growing out of its centre rather than closing in on it.
    var spokes = ring6.map(function (m) {
      return line('M' + cx + ' ' + cy + 'L' + m[0] + ' ' + m[1], LINE, 3, op(0.7) + ' class="sc-spoke"' + DRAWABLE);
    }).join('');
    // The two members on the END side are friends: a brand link between them.
    var friendLink = line('M' + (cx + 132) + ' ' + (cy - 74) + 'L' + (cx + 132) + ' ' + (cy + 74), BRAND, 4,
      op(0.85) + ' class="sc-friend"' + DRAWABLE);
    var dots = ring6.map(function (m, i) {
      return part('sc-member', avatar(m[0], m[1], 30, m[2], null, (i === 1 || i === 2) ? BRAND : SURFACE));
    }).join('');
    return wide(
      part('sc-lead', device(60, 44, 0.66, SCREEN.communities(), true)) +
      part('sc-link', line('M266 250H396', ACCENT, 3, ' stroke-dasharray="7 9" opacity=".5"'), pivot(266, 250)) +
      part('sc-ring', ring(cx, cy, R, ACCENT, 3, op(0.14))) +
      part('sc-spokes', spokes) + friendLink + part('sc-members', dots) +
      part('sc-hub', circle(cx, cy, 52, SURFACE, ' stroke="' + LINE + '" stroke-width="3"') +
        group(usersGlyph(30), ' transform="translate(' + cx + ',' + cy + ')"'))
    );
  };

  /* Message 2, real time: the invitation as it lands, beside the ten-minute
     window it lives inside. The dial is drawn part-spent, so the scene reads as
     a clock already running rather than a decoration. */
  ART.now = function () {
    var cx = 578, cy = 250, R = 130;
    return wide(
      part('sc-lead', device(60, 22, 0.7, SCREEN.invite(F(4), BRAND, true), true)) +
      part('sc-link', line('M282 250H428', ACCENT, 3, ' stroke-dasharray="7 9" opacity=".5"'), pivot(282, 250)) +
      part('sc-dial', circle(cx, cy, R, TINT) + ring(cx, cy, R, LINE, 18)) +
      // The spent sweep and the hands are drawn strokes, so a page can start the
      // clock instead of switching it on.
      arc(cx, cy, R, 0, 250, BRAND, 18, ' class="sc-sweep"' + DRAWABLE) +
      line('M' + cx + ' ' + cy + 'V' + (cy - 90) + 'M' + cx + ' ' + cy + 'l60 38', INK, 13,
        ' class="sc-hands"' + DRAWABLE) +
      part('sc-hub', circle(cx, cy, 13, INK))
    );
  };

  /* Message 4, the schedule with the kids: two weeks facing each other, the days
     the kids are home marked, and the one day BOTH sides are free lit in brand
     purple. Same no-lettering rule as every other piece: a marked day is a tinted
     cell with two small dots, a free day is an empty tile. */
  ART.parents = function () {
    var X0 = 216, STEP = 68, CELL = 58, RA = 178, RB = 278;
    var FREE_COL = 3;
    var withKids = [[0, 1, 4, 5], [1, 2, 5, 6]];
    function day(i, y, marked, lit) {
      var x = X0 + i * STEP, cx = x + CELL / 2, cy = y + CELL / 2;
      return part('sc-cell', rect(x, y, CELL, CELL, 14, marked ? TINT : SURFACE,
        ' stroke="' + (lit ? BRAND : LINE) + '" stroke-width="' + (lit ? 3 : 2) + '"') +
        (marked ? circle(cx - 9, cy, 5, INK, op(0.3)) + circle(cx + 9, cy, 5, INK, op(0.3)) : ''));
    }
    // The cells of a week are wrapped as a set, so a page can fill them in one
    // after another along the row without counting past anything else.
    function week(y, marks, face) {
      var cells = '';
      for (var i = 0; i < 7; i++) cells += day(i, y, marks.indexOf(i) >= 0, i === FREE_COL);
      return part('sc-face', avatar(118, y + CELL / 2, 30, face, null, SURFACE)) + part('sc-week', cells);
    }
    var litX = X0 + FREE_COL * STEP;
    return wide(
      part('sc-lead', rect(60, 96, 680, 308, 30, SURFACE, ' stroke="' + LINE + '" stroke-width="2" filter="url(#SHADOW)"')) +
      part('sc-title', bar(102, 132, 150, 14)) +
      part('sc-band', rect(litX - 8, RA - 16, CELL + 16, RB + CELL - RA + 32, 20, BRAND, op(0.12))) +
      week(RA, withKids[0], F(2)) + week(RB, withKids[1], F(3)) +
      part('sc-mark', heart(litX + CELL / 2, (RA + CELL + RB) / 2, 20, BRAND))
    );
  };

  /* Final: the three moments - meet, invite, talk. */
  ART.final = function () {
    return svg(800, 450,
      part('sc-lead', device(72, 44, 0.58, SCREEN.home(F(6)), true)) +
      part('sc-lead', device(310, 44, 0.58, SCREEN.invite(F(7), BRAND, true), true)) +
      part('sc-lead', device(548, 44, 0.58, SCREEN.chat(), true))
    );
  };

  w.ART = ART;
})(window);
