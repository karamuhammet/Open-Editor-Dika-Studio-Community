// ═══════════════════════════════════════════════════════════════════
//  VE-SUBTITLE-ELEMENT - First-class subtitle element for the video editor
//  dika studio Video Editor - MirexSoft
//  Dedicated, raw-canvas subtitle renderer (NOT a Fabric object). The
//  captions track (track.type==='subtitle', track.cues) is the single
//  source of truth; it persists through the project document and burns
//  into the WebCodecs export for free because export reuses the preview
//  draw path. This module owns the subtitle identity, the schema
//  defaults, and the per-frame renderer. Styles (Phase 4), animations
//  (Phase 7), and karaoke (Phase 8) extend renderTrack.
// ═══════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  // Default text properties (in the 1920x1080 preview coordinate space).
  var DEFAULT_TEXT_PROPS = {
    fontFamily: 'Inter, Arial, sans-serif',
    fontSize: 48,
    color: '#ffffff',
    bold: true,
    weight: 700,
    italic: false,
    align: 'center',
    lineHeight: 1.2,
    letterSpacing: 0,
    opacity: 1,
    padding: 0
  };

  // Owner decision: default on-canvas placement is center, plain. Position is
  // normalized (0..1) so it survives resolution changes.
  function _defaultPosition() {
    return { x: 0.5, y: 0.5, maxWidth: 0.8 };
  }

  // Static style presets (Phase 4), adapted 1:1 from CapCut, re-skinned to the
  // editor palette. `none` plus 9. box=background fill, pad=box padding as a
  // fraction of fontSize, stroke=outline color, strokeW=outline width fraction,
  // textColor=default fill, shadow=readability shadow. Applying a style also
  // sets track.textProps.color to textColor so the Metin tab reflects it.
  /* Every key is OPTIONAL and every one of them is a fraction of `fontSize`, never a pixel, so a style
     looks the same at 24px and at 96px:
       textColor  default fill (also written onto track.textProps.color by applyStyle)
       box        background fill behind each LINE          pad / padX   box padding (y / x)
       radius     'pill' | 'sharp' | omitted (soft corners)
       boxStroke / boxStrokeW   outlined box
       stroke / strokeW         glyph outline
       hard / hardX / hardY     HARD offset shadow (no blur) - the retro / 3D look
       glow / glowBlur          coloured bloom around the glyphs
       bar / barH               accent rule under the line
       shadow / shadowStrong    the plain readability drop shadow
     Adding a style is data only; nothing in the renderer needs to learn about it. */
  var STYLES = {
    none:        { key: 'none', textColor: '#ffffff', shadow: true },
    boxdark:     { key: 'boxdark', textColor: '#ffffff', box: 'rgba(0,0,0,0.82)', pad: 0.28 },
    boxwhite:    { key: 'boxwhite', textColor: '#111111', box: '#ffffff', pad: 0.28 },
    outline:     { key: 'outline', textColor: '#ffffff', stroke: '#000000', strokeW: 0.07 },
    outlinebold: { key: 'outlinebold', textColor: '#ffffff', stroke: '#000000', strokeW: 0.16 },
    accent:      { key: 'accent', textColor: '#f2ff58', shadow: true },
    highlight:   { key: 'highlight', textColor: '#111111', box: '#f2ff58', pad: 0.16 },
    blue:        { key: 'blue', textColor: '#3b82f6', stroke: '#0b2a5b', strokeW: 0.05 },
    glow:        { key: 'glow', textColor: '#ffffff', box: 'rgba(0,0,0,0.7)', stroke: '#f2ff58', strokeW: 0.05, pad: 0.28 },
    shadow:      { key: 'shadow', textColor: '#ffffff', shadow: true, shadowStrong: true },
    // ── added 2026-08-11 ──
    pill:        { key: 'pill', textColor: '#16161b', box: '#f2ff58', pad: 0.26, padX: 0.52, radius: 'pill' },
    boxoutline:  { key: 'boxoutline', textColor: '#ffffff', box: 'rgba(0,0,0,0.32)', boxStroke: '#ffffff', boxStrokeW: 0.045, pad: 0.26 },
    banner:      { key: 'banner', textColor: '#ffffff', box: 'rgba(0,0,0,0.78)', pad: 0.34, padX: 1.05, radius: 'sharp' },
    paper:       { key: 'paper', textColor: '#16161b', box: '#f4f4f0', pad: 0.28, radius: 'sharp' },
    neon:        { key: 'neon', textColor: '#ffffff', stroke: '#f2ff58', strokeW: 0.05, glow: '#f2ff58', glowBlur: 0.5 },
    hardshadow:  { key: 'hardshadow', textColor: '#ffffff', hard: '#000000', hardX: 0.07, hardY: 0.07 },
    retro:       { key: 'retro', textColor: '#ffffff', hard: '#f2ff58', hardX: 0.06, hardY: 0.06, stroke: '#16161b', strokeW: 0.045 },
    underline:   { key: 'underline', textColor: '#ffffff', shadow: true, bar: '#f2ff58', barH: 0.1 },
    mint:        { key: 'mint', textColor: '#5ef2c0', stroke: '#06382b', strokeW: 0.06 },
    pop:         { key: 'pop', textColor: '#ffffff', box: '#ff3d7f', pad: 0.2, radius: 'pill' }
  };
  // Grid order for the picker, grouped so twenty tiles stay readable.
  var STYLE_GROUPS = [
    { label: 'Plain',   keys: ['none', 'accent', 'shadow', 'hardshadow', 'mint', 'blue'] },
    { label: 'Box',     keys: ['highlight', 'pill', 'pop', 'boxdark', 'boxwhite', 'paper', 'banner', 'boxoutline'] },
    { label: 'Outline', keys: ['outline', 'outlinebold', 'retro', 'neon', 'glow', 'underline'] }
  ];
  var STYLE_ORDER = (function () {
    var out = [];
    for (var g = 0; g < STYLE_GROUPS.length; g++) out = out.concat(STYLE_GROUPS[g].keys);
    return out;
  })();

  function _roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Ensure a captions track carries every field this feature needs. Idempotent,
  // so it is safe to call on legacy subtitle tracks and on every render.
  function ensureTrackDefaults(track) {
    // Apply subtitle defaults to any subtitle track OR any track that holds cues
    // (subtitles can be dragged onto any track).
    if (!track) return track;
    if (track.type !== 'subtitle' && !Array.isArray(track.cues)) return track;
    if (!track.cues) track.cues = [];
    if (!track.styleId) track.styleId = 'none';
    if (!track.animationId) track.animationId = 'none';
    if (!track.textProps) track.textProps = {};
    for (var k in DEFAULT_TEXT_PROPS) {
      if (track.textProps[k] === undefined) track.textProps[k] = DEFAULT_TEXT_PROPS[k];
    }
    if (!track.position) track.position = _defaultPosition();
    if (track.lang === undefined) track.lang = null;
    return track;
  }

  // Find or create a captions track on the current project.
  // opts: { forceNew, label, lang, sourceTrackId }
  function ensureCaptionsTrack(opts) {
    opts = opts || {};
    var proj = (window.VideoEditor && VideoEditor.getProject) ? VideoEditor.getProject() : (window._veProject || null);
    if (!proj || !proj.tracks) return null;

    var track = null;
    if (!opts.forceNew) {
      // Reuse any track that already holds cues (subtitles live on NORMAL tracks
      // now - owner: no dedicated "Sub" track bar), including a legacy subtitle track.
      for (var i = 0; i < proj.tracks.length; i++) {
        var et = proj.tracks[i];
        if ((et.cues && et.cues.length) || et.type === 'subtitle') { track = et; break; }
      }
    }
    if (!track) {
      // Create a NORMAL track (type 'video'), NOT a dedicated 'subtitle' track, so
      // no special "Sub" bar appears (owner 2026-07-13). Cues on a normal track are
      // fully supported - render, panel, and persistence all key off `cues`, not the
      // track type (see render.js track header, ve-subtitle-panel, ve-persistence).
      var vc = proj.tracks.filter(function(t) { return t.type === 'video'; }).length + 1;
      track = {
        id: 'v-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        type: 'video',
        label: opts.label || ('V' + vc),
        muted: false, locked: false, solo: false, collapsed: false,
        clips: [], cues: [], subtitleStyle: {}
      };
      ensureTrackDefaults(track);
      if (opts.lang) track.lang = opts.lang;
      if (opts.sourceTrackId) track.sourceTrackId = opts.sourceTrackId;
      proj.tracks.push(track);
    } else {
      // Migrate a legacy dedicated subtitle track to a normal one so its "Sub"
      // header disappears too (owner: remove the dedicated track bar).
      if (track.type === 'subtitle') {
        track.type = 'video';
        track.label = 'V' + proj.tracks.filter(function(t) { return t.type === 'video'; }).length;
      }
      ensureTrackDefaults(track);
    }
    return track;
  }

  // Cues active at a given playhead time.
  function getActiveCues(track, time) {
    var out = [];
    if (!track || !track.cues) return out;
    for (var i = 0; i < track.cues.length; i++) {
      var c = track.cues[i];
      if (time >= c.startTime && time < c.endTime) out.push(c);
    }
    return out;
  }

  /* WORD WRAP. A cue longer than the max width used to be handed to `fillText` with its `maxWidth`
     argument, which does not clip or wrap - it CONDENSES the glyphs horizontally. Measured on a
     130-character cue: 2926px of text squeezed into 1536px, a 53% horizontal scale, which is exactly
     the "harfler birbirine yapışık" the owner sees with no effect applied at all. A subtitle wraps;
     it never gets squashed. A single word wider than the line is broken by character, because the
     alternative is the squeeze again. */
  function _wrapLines(ctx, lines, maxW) {
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line === '') { out.push(''); continue; }
      if (ctx.measureText(line).width <= maxW) { out.push(line); continue; }
      var words = line.split(/(\s+)/);   // keep the separators so double spaces survive
      var cur = '';
      for (var j = 0; j < words.length; j++) {
        var tok = words[j];
        var next = cur + tok;
        if (cur !== '' && ctx.measureText(next).width > maxW) {
          out.push(cur.replace(/\s+$/, ''));
          cur = /^\s+$/.test(tok) ? '' : tok;
        } else {
          cur = next;
        }
        // A single token that cannot fit on a line of its own: break it by character.
        while (ctx.measureText(cur).width > maxW && cur.length > 1) {
          var cut = cur.length;
          while (cut > 1 && ctx.measureText(cur.slice(0, cut)).width > maxW) cut--;
          out.push(cur.slice(0, cut));
          cur = cur.slice(cut);
        }
      }
      if (cur.replace(/\s+$/, '') !== '') out.push(cur.replace(/\s+$/, ''));
    }
    return out.length ? out : lines;
  }

  /* Compute the pixel geometry of the subtitle block, given the track props and canvas size. Shared
     by the renderer and the interaction hit-test so selection matches what is drawn.
     It RETURNS the wrapped lines and their individual widths: the caller must draw exactly what was
     measured, or the background box and the glyphs describe two different strings. */
  function measureBlock(ctx, track, lines, w, h) {
    ensureTrackDefaults(track);
    var tp = track.textProps, pos = track.position;
    _applyFont(ctx, tp);
    var lineH = tp.fontSize * (tp.lineHeight || 1.2);
    var maxW = w * (pos.maxWidth || 0.8);
    var wrapped = _wrapLines(ctx, lines, maxW);
    var widest = 0, widths = [];
    for (var i = 0; i < wrapped.length; i++) {
      var lw = ctx.measureText(wrapped[i]).width;
      widths.push(lw);
      if (lw > widest) widest = lw;
    }
    var blockH = wrapped.length * lineH;
    var cx = w * (pos.x != null ? pos.x : 0.5);
    var cy = h * (pos.y != null ? pos.y : 0.5);
    return {
      cx: cx, cy: cy, lineH: lineH, maxW: maxW,
      lines: wrapped, lineWidths: widths,
      width: widest, height: blockH,
      left: cx - widest / 2, top: cy - blockH / 2
    };
  }

  /* THE DEFAULT SUBTITLE FONT WAS A GHOST. `Inter` is in the editor's Google catalog but nothing ever
     loaded it, so every subtitle silently rendered in the Arial fallback, and the on-canvas Textbox
     proxy - which strips the stack to its first family - fell all the way through to TIMES NEW ROMAN.
     Measured on "This fixes it. Watch!" at 700/48px: Arial 444px of ink with 17 letter gaps, the
     proxy's fallback 407px with 13. That is the "harfler birbirine yapışık" with no effect applied:
     while a cue is selected you are looking at a narrower serif, not the face that will be exported.
     Ask for the family ONCE per (family, weight) and repaint when it lands. `loadGoogleFont` resolving
     only means the @font-face CSS is in the document; `document.fonts.load` for the actual WEIGHT is
     what makes the face usable, so both steps are needed (same trap as the AI Post font pass). */
  var _fontReq = {};
  function _familyOf(tp) {
    return String(tp && tp.fontFamily || '').split(',')[0].replace(/['"]/g, '').trim();
  }
  function _ensureSubtitleFont(tp) {
    var fam = _familyOf(tp); if (!fam) return;
    var weight = tp.weight || (tp.bold ? 700 : 400);
    var key = fam + '|' + weight;
    if (_fontReq[key]) return;
    _fontReq[key] = true;
    // Calling a foreign global from inside the per-frame render path: it may not exist, and it must
    // never be able to take the draw down with it.
    try { _requestFont(fam, weight); } catch (e) {}
  }
  function _requestFont(fam, weight) {
    function repaint() {
      var VE = _VE();
      if (VE && VE._veExporting) return;   // never disturb an in-flight export frame
      _rerenderRawOnly();
      if (_sel.proxy) { try { _sel.proxy.dirty = true; } catch (e) {} var cv = _cv(); if (cv) cv.requestRenderAll(); }
    }
    function loadWeight() {
      if (!document.fonts || !document.fonts.load) { repaint(); return; }
      document.fonts.load(weight + ' 48px "' + fam + '"').then(repaint)['catch'](function () {});
    }
    if (typeof loadGoogleFont === 'function') {
      // Promise.resolve, not `.then` on the return value: a loader that hands back undefined (or a
      // non-promise) would otherwise throw and skip the weight load entirely.
      Promise.resolve(loadGoogleFont(fam)).then(loadWeight, loadWeight);
    } else loadWeight();
  }

  function _applyFont(ctx, tp) {
    var weight = tp.weight || (tp.bold ? 700 : 400);
    var style = tp.italic ? 'italic ' : '';
    ctx.font = style + weight + ' ' + tp.fontSize + 'px ' + tp.fontFamily;
    try { ctx.letterSpacing = (tp.letterSpacing || 0) + 'px'; } catch (e) {}
  }

  function _cueLines(active) {
    var lines = [];
    active.forEach(function(cue) {
      (cue.text || '').split('\n').forEach(function(l) { lines.push(l); });
    });
    return lines;
  }

  // Render the track's active cues onto the raw preview 2D canvas.
  // Phase 1: plain centered text with a readability shadow (the "center, plain"
  // default). Styles and animations extend this in later phases.
  // Detect a right-to-left script (Arabic, Hebrew ranges) in the text.
  function _isRTL(text) {
    return /[֐-׿؀-ۿݐ-ݿࢠ-ࣿיִ-﷿ﹰ-﻿]/.test(text || '');
  }

  /* ONE BOX PER LINE, hugging that line's own width and only what is VISIBLE right now.
     It used to be a single rectangle spanning the whole block at the WIDEST line's width, so a two
     line cue put a 974px yellow bar behind a 221px line, and with a progressive animation the box
     was drawn at the final width while a fraction of the text was on screen - measured, 785px of
     empty bar hanging off the right of a typewriter mid-reveal. That is the owner's "bütün parça
     olarak verdiği için kayma".
     `segs` is [{ i, x, w }] per line: the line index and the pixel extent actually being painted.
     An empty extent draws nothing at all, rather than an empty tab of colour. */
  function _drawBoxSegments(ctx, geo, segs, st, pad, fontSize) {
    if ((!st.box && !st.boxStroke && !st.bar) || !segs || !segs.length) return;
    var padX = (st.padX != null) ? st.padX * fontSize : pad;
    var bh = fontSize * 1.16 + pad * 2;
    var radius = st.radius === 'pill' ? bh / 2
      : st.radius === 'sharp' ? Math.max(1, fontSize * 0.03)
      : Math.min(bh / 2, fontSize * 0.18);
    ctx.save();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (!s || s.w <= 0) continue;
      // Derive from the SAME y the text uses (textBaseline 'middle'), so the plate can never drift
      // off the glyphs it is behind.
      var cy = geo.top + geo.lineH / 2 + s.i * geo.lineH;
      var bx = s.x - padX, by = cy - fontSize * 0.58 - pad, bw = s.w + padX * 2;
      if (st.box) {
        ctx.fillStyle = st.box;
        _roundRect(ctx, bx, by, bw, bh, radius);
        ctx.fill();
      }
      if (st.boxStroke) {
        ctx.lineWidth = Math.max(1, fontSize * (st.boxStrokeW || 0.04));
        ctx.strokeStyle = st.boxStroke;
        _roundRect(ctx, bx, by, bw, bh, radius);
        ctx.stroke();
      }
      if (st.bar) {
        var barH = Math.max(2, fontSize * (st.barH || 0.1));
        ctx.fillStyle = st.bar;
        _roundRect(ctx, s.x, cy + fontSize * 0.46, s.w, barH, barH / 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // x of a line's left edge for the current alignment (the text is drawn from the same anchor).
  function _lineLeft(geo, lineW, align) {
    if (align === 'left') return geo.left;
    if (align === 'right') return geo.left + geo.width - lineW;
    return geo.cx - lineW / 2;
  }

  function _setShadow(ctx, st, fontSize) {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    var fs = fontSize || 48;
    if (st.glow) {
      // Bloom, drawn as the canvas shadow with no offset. Scales with the type like everything else.
      ctx.shadowColor = st.glow;
      ctx.shadowBlur = Math.max(2, fs * (st.glowBlur || 0.4));
      return;
    }
    if (st.shadow && !st.box) {
      ctx.shadowColor = 'rgba(0,0,0,' + (st.shadowStrong ? '0.9' : '0.75') + ')';
      ctx.shadowBlur = fs * (st.shadowStrong ? 0.17 : 0.085);
      ctx.shadowOffsetY = fs * 0.042;
    }
  }

  /* NO maxWidth ARGUMENT. `fillText`/`strokeText` treat it as "condense the glyphs to fit", never as
     a clip or a wrap, so every long cue came out horizontally squashed. Wrapping happens up front in
     measureBlock; by the time a string reaches here it already fits. */
  function _drawText(ctx, str, x, y, st, fill, fontSize) {
    // A HARD shadow is a second pass at an offset with the blur switched off, drawn first so it sits
    // behind. The canvas shadow cannot do it: shadowBlur 0 plus an offset still tints the glow colour
    // through the glyph edge, and stacking it with `glow` is impossible - one context, one shadow.
    if (st.hard) {
      ctx.save();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
      ctx.fillStyle = st.hard;
      ctx.fillText(str, x + fontSize * (st.hardX || 0.06), y + fontSize * (st.hardY || 0.06));
      ctx.restore();
    }
    if (st.stroke) {
      ctx.lineWidth = Math.max(1, fontSize * st.strokeW);
      ctx.strokeStyle = st.stroke;
      ctx.lineJoin = 'round';
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = fill;
    ctx.fillText(str, x, y);
  }

  // Word timings for a cue. Uses cue.words when present (populated by the
  // word-timestamp pass), else distributes evenly by token length across the
  // cue duration (so animations work without the heavy Whisper word pass).
  function getCueWords(cue) {
    if (cue.words && cue.words.length) return cue.words;
    var toks = (cue.text || '').split(/\s+/).filter(Boolean);
    var dur = Math.max(0.001, cue.endTime - cue.startTime);
    var totalChars = 0;
    for (var i = 0; i < toks.length; i++) totalChars += toks[i].length;
    totalChars = totalChars || 1;
    var out = [], t = cue.startTime;
    for (var j = 0; j < toks.length; j++) {
      var d = dur * (toks[j].length / totalChars);
      out.push({ w: toks[j], start: t, end: t + d });
      t += d;
    }
    return out;
  }

  /* THE ONE full-block draw: box plates per line, then the glyphs. `_renderStatic` and every ENTRANCE
     animation go through it, so a new animation of that family is a transform, never a second copy of
     the drawing code. */
  function _drawBlock(ctx, geo, st, fill, pad, tp) {
    var lines = geo.lines, align = tp.align || 'center';
    var segs = [], i;
    for (i = 0; i < lines.length; i++) {
      if (!lines[i]) continue;
      segs.push({ i: i, x: _lineLeft(geo, geo.lineWidths[i], align), w: geo.lineWidths[i] });
    }
    _drawBoxSegments(ctx, geo, segs, st, pad, tp.fontSize);
    for (i = 0; i < lines.length; i++) {
      if (!lines[i]) continue;
      var y = geo.top + geo.lineH / 2 + i * geo.lineH;
      _setShadow(ctx, st, tp.fontSize);
      _drawText(ctx, lines[i], _lineLeft(geo, geo.lineWidths[i], align), y, st, fill, tp.fontSize);
    }
  }

  function _renderStatic(ctx, track, active, w, h, tp, st) {
    var raw = _cueLines(active); if (!raw.length) return;
    var geo = measureBlock(ctx, track, raw, w, h);
    var fill = tp.color || st.textColor || '#ffffff';
    var pad = (st.pad || 0) * tp.fontSize + (tp.padding || 0);
    ctx.save();
    ctx.globalAlpha = (tp.opacity != null ? tp.opacity : 1);
    _applyFont(ctx, tp);
    ctx.textAlign = 'left';                // per-line anchors, so the box and the glyphs share one x
    ctx.textBaseline = 'middle';
    _drawBlock(ctx, geo, st, fill, pad, tp);
    ctx.restore();
  }

  // Animated single-cue render: typewriter (char reveal), popin (word appear),
  // karaoke (active-word background highlight).
  /* TWO FAMILIES, and which one an id belongs to is data, not an if-chain scattered through the draw.
       block  = an entrance/exit for the WHOLE cue: alpha, offset, scale, or a reveal clip. It reuses
                `_drawBlock` untouched, so it inherits every style feature for free.
       word   = per-word timing (cue.words, or an even split from getCueWords).
     A new entry in either map is picked up by the panel and by the renderer with no other change. */
  var BLOCK_ANIMS = { fade: 1, slideup: 1, slidedown: 1, slidein: 1, scalein: 1, wipe: 1 };
  var WORD_ANIMS = { karaoke: 1, karaokefill: 1, popin: 1, bounce: 1, wordfade: 1 };
  function _easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  // Overshoot then settle. `bounce` needs to pass 1 and come back, which no monotone ease can do.
  function _easeBack(t) { var c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }

  var ANIM_IN = 0.42, ANIM_OUT = 0.28;
  function _blockTransform(anim, cue, time, geo) {
    var tIn = Math.max(0, Math.min(1, (time - cue.startTime) / ANIM_IN));
    var tOut = Math.max(0, Math.min(1, ((cue.endTime || 0) - time) / ANIM_OUT));
    var e = _easeOut(tIn), o = _easeOut(tOut);
    var f = { alpha: e * o, dx: 0, dy: 0, scale: 1, clip: 1 };
    if (anim === 'slideup') f.dy = (1 - e) * geo.lineH * 0.85;
    else if (anim === 'slidedown') f.dy = -(1 - e) * geo.lineH * 0.85;
    else if (anim === 'slidein') f.dx = (1 - e) * geo.maxW * 0.22;
    else if (anim === 'scalein') f.scale = 0.82 + 0.18 * e;
    else if (anim === 'wipe') { f.alpha = o; f.clip = e; }   // the wipe IS the entrance; no fade in
    return f;
  }

  function _renderBlockAnimated(ctx, geo, st, fill, pad, tp, cue, time, anim) {
    var f = _blockTransform(anim, cue, time, geo);
    if (f.alpha <= 0.003 || f.clip <= 0) return;
    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * f.alpha;
    if (f.scale !== 1) {
      ctx.translate(geo.cx, geo.cy);
      ctx.scale(f.scale, f.scale);
      ctx.translate(-geo.cx, -geo.cy);
    }
    if (f.dx || f.dy) ctx.translate(f.dx, f.dy);
    if (f.clip < 1) {
      // Reveal left to right across the widest line; the box is inside the clip, so it is revealed
      // with the glyphs instead of appearing whole a frame early.
      var margin = tp.fontSize * 1.5;
      ctx.beginPath();
      ctx.rect(geo.left - margin, geo.top - margin, (geo.width + margin) * f.clip + margin, geo.height + margin * 2);
      ctx.clip();
    }
    _drawBlock(ctx, geo, st, fill, pad, tp);
    ctx.restore();
  }

  function _renderAnimated(ctx, track, cue, time, w, h, tp, st, anim) {
    var raw = (cue.text || '').split('\n'); if (!raw.length) return;
    var geo = measureBlock(ctx, track, raw, w, h);
    var lines = geo.lines;
    var fill = tp.color || st.textColor || '#ffffff';
    var pad = (st.pad || 0) * tp.fontSize + (tp.padding || 0);
    var dur = Math.max(0.001, cue.endTime - cue.startTime);
    var prog = Math.max(0, Math.min(1, (time - cue.startTime) / dur));
    var align = tp.align || 'center';

    ctx.save();
    ctx.globalAlpha = (tp.opacity != null ? tp.opacity : 1);
    _applyFont(ctx, tp);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    if (BLOCK_ANIMS[anim]) {
      _renderBlockAnimated(ctx, geo, st, fill, pad, tp, cue, time, anim);
      ctx.restore();
      return;
    }

    /* THE BOX IS SIZED FROM WHAT IS ON SCREEN AT THIS INSTANT, so it grows with the reveal instead of
       sitting at the final width from frame one. Both passes below therefore compute their visible
       extents FIRST and draw the background after. */
    var li, y, segs = [];

    if (anim === 'typewriter') {
      var totalChars = 0;
      for (var c0 = 0; c0 < lines.length; c0++) totalChars += lines[c0].length;
      var reveal = Math.floor(prog * totalChars) + (prog >= 1 ? 0 : 1);
      var shown = 0, parts = [];
      for (li = 0; li < lines.length; li++) {
        var take = Math.max(0, Math.min(lines[li].length, reveal - shown));
        shown += lines[li].length;
        var str = lines[li].slice(0, take);
        // The line keeps its FINAL anchor so the text does not slide sideways as it grows; only the
        // revealed part is painted, and the box hugs exactly that part.
        var lx = _lineLeft(geo, geo.lineWidths[li], align);
        parts.push({ i: li, x: lx, str: str });
        if (str) segs.push({ i: li, x: lx, w: ctx.measureText(str).width });
      }
      _drawBoxSegments(ctx, geo, segs, st, pad, tp.fontSize);
      for (li = 0; li < parts.length; li++) {
        if (!parts[li].str) continue;
        y = geo.top + geo.lineH / 2 + parts[li].i * geo.lineH;
        _setShadow(ctx, st, tp.fontSize);
        _drawText(ctx, parts[li].str, parts[li].x, y, st, fill, tp.fontSize);
      }
      ctx.restore();
      return;
    }

    // word-based (popin / karaoke)
    var flat = getCueWords(cue), wi = 0;
    var spaceW = ctx.measureText(' ').width;
    var lineData = [];
    for (var l2 = 0; l2 < lines.length; l2++) {
      var toks = lines[l2].split(/\s+/).filter(Boolean);
      var widths = [], lineW = 0;
      for (var t2 = 0; t2 < toks.length; t2++) { var ww = ctx.measureText(toks[t2]).width; widths.push(ww); lineW += ww + (t2 < toks.length - 1 ? spaceW : 0); }
      // Word x-positions. RTL (Arabic/Hebrew): reading order goes right-to-left,
      // so word[0] sits at the right edge (R21).
      var rtl = _isRTL(lines[l2]);
      var base = _lineLeft(geo, lineW, align);
      var xs = [], cursor;
      if (rtl) {
        cursor = base + lineW;
        for (var q = 0; q < toks.length; q++) { cursor -= widths[q]; xs.push(cursor); cursor -= spaceW; }
      } else {
        cursor = base;
        for (var q2 = 0; q2 < toks.length; q2++) { xs.push(cursor); cursor += widths[q2] + spaceW; }
      }
      var words = [];
      for (var t4 = 0; t4 < toks.length; t4++) {
        words.push({ tok: toks[t4], x: xs[t4], w: widths[t4], timing: flat[wi] || { start: cue.startTime, end: cue.endTime } });
        wi++;
      }
      lineData.push({ i: l2, words: words });
      // Visible extent of this line. The progressive anims reveal word by word; karaoke / karaokefill
      // show the whole line from the start and only recolour, so their plate is the full width.
      var revealing = (anim === 'popin' || anim === 'bounce' || anim === 'wordfade');
      var vis = null;
      for (var v = 0; v < words.length; v++) {
        var shownWord = !revealing || time >= words[v].timing.start;
        if (!shownWord) continue;
        var lo = words[v].x, hi = words[v].x + words[v].w;
        if (!vis) vis = { lo: lo, hi: hi };
        else { if (lo < vis.lo) vis.lo = lo; if (hi > vis.hi) vis.hi = hi; }
      }
      if (vis) segs.push({ i: l2, x: vis.lo, w: vis.hi - vis.lo });
    }
    _drawBoxSegments(ctx, geo, segs, st, pad, tp.fontSize);

    for (var ld = 0; ld < lineData.length; ld++) {
      var y2 = geo.top + geo.lineH / 2 + lineData[ld].i * geo.lineH;
      var ws = lineData[ld].words;
      for (var t3 = 0; t3 < ws.length; t3++) {
        var word = ws[t3].timing, xw = ws[t3].x;
        if (anim === 'popin' || anim === 'bounce') {
          if (time >= word.start) {
            var since = time - word.start;
            var scale;
            if (anim === 'bounce') {
              // Overshoots ~1.13 then settles. A monotone ease cannot do it, which is the whole point
              // of having `bounce` beside `popin` rather than as a tuning of it.
              scale = since < 0.34 ? 0.55 + 0.45 * _easeBack(since / 0.34) : 1;
            } else {
              scale = since < 0.15 ? 0.65 + 0.35 * (since / 0.15) : 1;
            }
            ctx.save();
            var cxw = xw + ws[t3].w / 2;
            ctx.translate(cxw, y2); ctx.scale(scale, scale); ctx.translate(-cxw, -y2);
            _setShadow(ctx, st, tp.fontSize);
            _drawText(ctx, ws[t3].tok, xw, y2, st, fill, tp.fontSize);
            ctx.restore();
          }
        } else if (anim === 'wordfade') {
          if (time >= word.start) {
            var a = Math.min(1, (time - word.start) / 0.26);
            ctx.save();
            ctx.globalAlpha = ctx.globalAlpha * _easeOut(a);
            _setShadow(ctx, st, tp.fontSize);
            _drawText(ctx, ws[t3].tok, xw, y2, st, fill, tp.fontSize);
            ctx.restore();
          }
        } else if (anim === 'karaokefill') {
          /* The classic karaoke: no pill. Every word is on screen from the start; the ones already
             sung take the accent colour and the ones still to come are dimmed. On a style that
             already paints the text in the accent (accent / neon / highlight's ink) the sung colour
             would be invisible, so the sung word falls back to the style's own box colour or to
             white - the two are never allowed to be the same value. */
          var sung = time >= word.start;
          var accent = '#f2ff58';
          if (String(fill).toLowerCase() === accent) accent = st.box ? '#16161b' : '#ffffff';
          ctx.save();
          if (!sung) ctx.globalAlpha = ctx.globalAlpha * 0.48;
          _setShadow(ctx, st, tp.fontSize);
          _drawText(ctx, ws[t3].tok, xw, y2, st, sung ? accent : fill, tp.fontSize);
          ctx.restore();
        } else { // karaoke
          if (time >= word.start && time < word.end) {
            var hb = tp.fontSize * 0.14;
            ctx.save();
            // The highlight has to stay visible ON the style's own box: a black pill on a black box
            // is invisible, which made karaoke look broken on boxdark / glow.
            ctx.fillStyle = st.box ? 'rgba(242,255,88,0.92)' : 'rgba(0,0,0,0.85)';
            _roundRect(ctx, xw - hb, y2 - geo.lineH * 0.42, ws[t3].w + hb * 2, geo.lineH * 0.84, tp.fontSize * 0.12);
            ctx.fill();
            ctx.restore();
          }
          _setShadow(ctx, st, tp.fontSize);
          var kFill = fill;
          if (st.box && time >= word.start && time < word.end) kFill = '#111111';
          _drawText(ctx, ws[t3].tok, xw, y2, st, kFill, tp.fontSize);
        }
      }
    }
    ctx.restore();
  }

  /* A SUBTITLE FAILURE MUST NEVER PRESENT AS "INVISIBLE". Subtitles are the LAST thing the compositor
     draws, so anything thrown in here skipped only them: the video still rendered, the timeline still
     rendered, and the only surface left showing text was the click-created Textbox proxy - which reads
     as "it does not show unless I click it, and style and animation do nothing". Reported once per
     message so a per-frame fault cannot flood the console. */
  var _renderFaults = {};
  function renderTrack(ctx, track, time, w, h) {
    try { _renderTrackInner(ctx, track, time, w, h); }
    catch (e) {
      var key = String(e && e.message || e);
      if (!_renderFaults[key]) {
        _renderFaults[key] = true;
        try { console.error('[subtitle] render failed for track ' + (track && track.id) + ': ' + key, e); } catch (e2) {}
        if (window.VEErrorHandler && VEErrorHandler.report) {
          try { VEErrorHandler.report('SubtitleRender', key, { trackId: track && track.id }); } catch (e3) {}
        }
      }
    }
  }
  function _renderTrackInner(ctx, track, time, w, h) {
    ensureInteraction();
    // The fabric Textbox proxy shows exactly ONE cue, so skip the raw draw for THAT CUE ONLY, never
    // for the whole track. Skipping the track was a real defect: one click on a cue segment left the
    // proxy frozen on that cue and suppressed every other cue of the track at every other playhead
    // position, so the subtitles simply vanished from the canvas for the rest of the session (owner:
    // "bir kez tıklarsam sonra tüm subtrackler gizli kalıyor"). A hidden proxy suppresses nothing.
    // S1 (export plan): DURING AN EXPORT the proxy is not in the frame at all (it carries
    // excludeFromExport, so canvas.toJSON leaves it out of the export snapshot). Skipping here as
    // well meant that exporting while a subtitle track happened to be selected silently dropped
    // every cue of that track from the file. Draw them for real while exporting.
    var _VEX = window.__ccVideoEditor;
    var _exporting = !!(_VEX && _VEX._veExporting);
    var skipCueId = (!_exporting && _sel.proxy && _sel.proxy.visible !== false && _sel.trackId === track.id)
      ? _sel.proxy._ccCueId : null;
    var active = getActiveCues(track, time);
    if (skipCueId) {
      active = active.filter(function (c) { return c.id !== skipCueId; });
    }
    if (!active.length) return;
    ensureTrackDefaults(track);
    var tp = track.textProps;
    _ensureSubtitleFont(tp);   // once per (family, weight); repaints when the real face lands
    var st = STYLES[track.styleId] || STYLES.none;
    var anim = track.animationId || 'none';
    // An unknown id (a project saved by a newer build, or a typo) renders STATIC rather than nothing.
    var known = anim !== 'none' && (anim === 'typewriter' || BLOCK_ANIMS[anim] || WORD_ANIMS[anim]);
    if (!known || active.length > 1) {
      _renderStatic(ctx, track, active, w, h, tp, st);
    } else {
      _renderAnimated(ctx, track, active[0], time, w, h, tp, st, anim);
    }
  }

  function renderTracks(ctx, tracks, time, w, h) {
    var groups = {};
    var order = [];
    for (var i = 0; i < tracks.length; i++) {
      var track = tracks[i];
      if (!track || !track.cues || !getActiveCues(track, time).length) continue;
      var key = track.subtitleSetId || ('track:' + track.id);
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(track);
    }
    for (var oi = 0; oi < order.length; oi++) {
      var group = groups[order[oi]];
      group.sort(function(a, b) { return (a.speakerOrdinal || 999) - (b.speakerOrdinal || 999); });
      if (group.length === 1 || order[oi].indexOf('track:') === 0) {
        for (var singleIndex = 0; singleIndex < group.length; singleIndex++) renderTrack(ctx, group[singleIndex], time, w, h);
        continue;
      }
      var selectedIndex = -1;
      for (var si = 0; si < group.length; si++) if (_sel.trackId === group[si].id && _sel.proxy) { selectedIndex = si; break; }
      var gap = Math.max(0.055, Math.min(0.09, 0.42 / group.length));
      for (var gi = 0; gi < group.length; gi++) {
        var current = group[gi];
        ensureTrackDefaults(current);
        var originalPosition = current.position;
        var baseY = originalPosition.y == null ? 0.5 : originalPosition.y;
        var laneOffset = selectedIndex >= 0
          ? (gi - selectedIndex) * gap
          : (gi - (group.length - 1) / 2) * gap;
        current.position = Object.assign({}, originalPosition, { y: Math.max(0.08, Math.min(0.92, baseY + laneOffset)) });
        try { renderTrack(ctx, current, time, w, h); }
        finally { current.position = originalPosition; }
      }
    }
  }

  // ─── Canvas interaction (Phase 2): select / drag / resize / edit ──────────
  // The subtitle draws on the raw preview canvas (export-safe). For parity with
  // the text element we overlay an invisible Fabric proxy Rect (selectable,
  // draggable, corner-resizable) that maps to the subtitle box. It is excluded
  // from export and from the overlay-clip system, so it never persists. Fabric
  // logical space is 1920x1080 == preview space (verified), so no scaling math.

  var _sel = { trackId: null, proxy: null };
  var _bound = false;
  var _scratch = null;
  var _removingProxy = false;

  function _cv() { return (typeof canvas !== 'undefined' && canvas) ? canvas : null; }
  function _VE() { return window.__ccVideoEditor || null; }
  function _time() { var VE = _VE(); return VE ? VE._veProject.playheadTime : 0; }
  function _proj2() { return (window.VideoEditor && VideoEditor.getProject) ? VideoEditor.getProject() : (window._veProject || null); }
  function _rerender() {
    if (window.VideoEditor && VideoEditor.render) VideoEditor.render();
    if (window.VideoEditor && VideoEditor.renderPreview) VideoEditor.renderPreview();
  }
  function _scratchCtx() {
    if (!_scratch) { _scratch = document.createElement('canvas'); _scratch.width = 1920; _scratch.height = 1080; }
    return _scratch.getContext('2d');
  }
  function _trackById(id) {
    var proj = _proj2(); if (!proj) return null;
    for (var i = 0; i < proj.tracks.length; i++) if (proj.tracks[i].id === id) return proj.tracks[i];
    return null;
  }
  function _activeSubtitleTrackAt(time) {
    var proj = _proj2(); if (!proj) return null;
    for (var i = 0; i < proj.tracks.length; i++) {
      var t = proj.tracks[i];
      if (!t.muted && t.cues && t.cues.length && getActiveCues(t, time).length) return t;
    }
    return null;
  }
  function _boxForCues(track, cues) {
    var cv = _cv(); if (!cv || !cues || !cues.length) return null;
    var lines = _cueLines(cues); if (!lines.length) return null;
    return measureBlock(_scratchCtx(), track, lines, cv.getWidth(), cv.getHeight());
  }
  function _boxFor(track, time) {
    return _boxForCues(track, getActiveCues(track, time));
  }

  // Delete the active/selected cue of the selected subtitle (called when the
  // native delete path removes the proxy: Delete key, trash toolbar button).
  function _deleteCueFromProxy(obj) {
    var track = _trackById(obj._ccTrackId);
    if (!track || !track.cues) { _deselect(); return; }
    var idx = -1;
    for (var i = 0; i < track.cues.length; i++) if (track.cues[i].id === obj._ccCueId) { idx = i; break; }
    if (idx === -1) { var ac = getActiveCues(track, _time())[0]; if (ac) idx = track.cues.indexOf(ac); }
    if (idx > -1) {
      track.cues.splice(idx, 1);
      var VE = _VE(); if (VE && VE._vePushUndo) VE._vePushUndo();
    }
    _deselect();
    _rerender();
    if (window.VESubtitlePanel && VESubtitlePanel.isOpen && VESubtitlePanel.isOpen()) VESubtitlePanel.render();
  }

  function _deselect(silent) {
    var cv = _cv();
    var VE = _VE();
    var hadSelection = !!(_sel.proxy || _sel.trackId || (VE && (VE._veSelectedCueId || VE._veSelectedSubtitleTrackId)));
    // Persist the proxy's final native-edited props before it goes away.
    if (_sel.proxy && _sel.trackId) _syncProxyToTextProps();
    var proxy = _sel.proxy;
    // Clear selection state FIRST. Removing the active object makes fabric fire
    // selection:cleared (and possibly a re-entrant remove) synchronously; nulling
    // _sel up front makes those handlers no-ops so _removingProxy is never reset
    // early (that reset was deleting the cue on every deselect).
    _sel.proxy = null; _sel.trackId = null; _sel.cueId = null; _proxySnap = null;
    if (VE) { VE._veSelectedSubtitleTrackId = null; VE._veSelectedCueId = null; }
    // A REAL deselect (empty canvas click, Escape, another element selected) drops the timeline cue
    // selection too, so the two surfaces cannot disagree about what Delete would remove. The SILENT
    // path is programmatic (selectTrack re-selecting, a marquee about to set its own group) and must
    // leave `_veSelectedCues` alone.
    if (!silent && VE) VE._veSelectedCues = [];
    if (proxy && cv) { _removingProxy = true; try { cv.remove(proxy); } catch (e) {} _removingProxy = false; }
    if (window.VESubtitleProps && VESubtitleProps.hide) VESubtitleProps.hide();
    // Redraw the raw preview so the cue is drawn again (renderTrack no longer skips).
    if (window.VideoEditor && VideoEditor.renderPreview) VideoEditor.renderPreview();
    if (!silent && hadSelection) {
      if (window.VESubtitlePanel && VESubtitlePanel.syncSelection) VESubtitlePanel.syncSelection(null, null);
      if (VE && VE._veRender) VE._veRender();
    }
    return hadSelection;
  }

  function _cueById(track, id) {
    if (!track || !track.cues) return null;
    for (var i = 0; i < track.cues.length; i++) if (track.cues[i].id === id) return track.cues[i];
    return null;
  }
  function _syncTextboxPos(track, tb) {
    var cv = _cv(); if (!cv) return;
    track.position.x = Math.max(0, Math.min(1, tb.left / cv.getWidth()));
    track.position.y = Math.max(0, Math.min(1, tb.top / cv.getHeight()));
  }
  // The subtitle uses the NATIVE text modules (font/fill/opacity edit the proxy
  // Textbox directly), so mirror the proxy's live props back onto track.textProps
  // - the single source of truth the raw renderer + export read. Runs on every
  // canvas render while selected, so native edits persist without a bespoke event.
  /* MIRROR ONLY WHAT THE PROXY ACTUALLY CHANGED. This runs on EVERY canvas render, and it used to
     copy the proxy's props onto the track unconditionally - so anything that wrote to the TRACK lost
     the race. Measured: applying a style set `textProps.color` to the style's own colour, then
     `renderPreview()` fired `after:render`, this function put the proxy's old white back, and the
     following `refitSelected()` pushed that white onto the proxy. The picker looked dead ("font rengi
     değişmedi"), and the box colour changed because the box comes from `styleId`, not from `color`.
     The snapshot makes the direction explicit: a key moves canvas -> track only when the canvas value
     has actually moved since the last sync. */
  var _proxySnap = null;
  function _proxyPropSnapshot(tb) {
    return {
      fontFamily: tb.fontFamily, fontSize: tb.fontSize, fontWeight: tb.fontWeight,
      fontStyle: tb.fontStyle, fill: tb.fill, opacity: tb.opacity,
      textAlign: tb.textAlign, lineHeight: tb.lineHeight
    };
  }
  function _syncProxyToTextProps() {
    var tb = _sel.proxy; if (!tb || !_sel.trackId) return;
    var track = _trackById(_sel.trackId); if (!track || !track.textProps) return;
    var tp = track.textProps;
    if (!_proxySnap) { _proxySnap = _proxyPropSnapshot(tb); return; }
    var snap = _proxySnap;
    if (tb.fontFamily && tb.fontFamily !== snap.fontFamily) tp.fontFamily = tb.fontFamily;
    if (tb.fontSize && tb.fontSize !== snap.fontSize) tp.fontSize = Math.round(tb.fontSize);
    if (tb.fontWeight != null && tb.fontWeight !== snap.fontWeight) {
      var w = tb.fontWeight;
      tp.weight = (w === 'bold') ? 700 : (w === 'normal' ? 400 : (parseInt(w, 10) || tp.weight));
      tp.bold = tp.weight >= 700;
    }
    if (tb.fontStyle !== snap.fontStyle) tp.italic = tb.fontStyle === 'italic';
    if (typeof tb.fill === 'string' && tb.fill !== snap.fill) tp.color = tb.fill;
    if (tb.opacity !== snap.opacity) tp.opacity = (tb.opacity != null ? tb.opacity : 1);
    if (tb.textAlign && tb.textAlign !== snap.textAlign) tp.align = tb.textAlign;
    if (tb.lineHeight && tb.lineHeight !== snap.lineHeight) tp.lineHeight = tb.lineHeight;
    _proxySnap = _proxyPropSnapshot(tb);
  }
  function _rerenderRawOnly() { if (window.VideoEditor && VideoEditor.renderPreview) VideoEditor.renderPreview(); }

  /* THE PROXY MUST WEAR THE STYLE. While a cue is selected the raw renderer stands aside, so the
     Textbox WAS the only thing on screen and it showed plain white text with no box: picking a style
     visibly did nothing, which is half of "font rengi değişmedi". Fabric's `textBackgroundColor`
     paints PER LINE behind the glyphs, which is exactly the shape the raw renderer now draws, so the
     two agree. Nothing here is read back by _syncProxyToTextProps, so there is no feedback loop, and
     the proxy carries excludeFromExport - none of it reaches a file. */
  function _proxyStyleProps(track, tp) {
    var st = STYLES[track.styleId] || STYLES.none;
    var size = tp.fontSize || 48;
    var props = {
      // Keep the WHOLE family stack. Stripping it to the first name is what dropped the proxy onto
      // the browser's default serif when that first name was not loaded, so the text you edit was a
      // different typeface from the one that renders and exports.
      fontFamily: tp.fontFamily || 'Inter, Arial, sans-serif',
      fontSize: size,
      fontWeight: tp.weight || (tp.bold ? 700 : 400),
      fontStyle: tp.italic ? 'italic' : 'normal',
      fill: tp.color || st.textColor || '#ffffff',
      textAlign: tp.align || 'center',
      lineHeight: tp.lineHeight || 1.2,
      opacity: (tp.opacity != null ? tp.opacity : 1),
      // fabric charSpacing is in 1/1000 em, the raw renderer's letterSpacing is in px
      charSpacing: Math.round(((tp.letterSpacing || 0) / size) * 1000),
      textBackgroundColor: st.box || '',
      stroke: st.stroke || null,
      strokeWidth: st.stroke ? Math.max(1, size * st.strokeW) : 0,
      paintFirst: 'stroke'
    };
    props.shadow = (st.shadow && !st.box)
      ? new fabric.Shadow({ color: 'rgba(0,0,0,' + (st.shadowStrong ? 0.9 : 0.75) + ')', blur: st.shadowStrong ? 8 : 4, offsetX: 0, offsetY: 2 })
      : null;
    return props;
  }
  // Push current textProps onto the live Textbox (props panel edits reflect live).
  function _applyPropsToTextbox() {
    var tb = _sel.proxy; if (!tb || !_sel.trackId) return;
    var track = _trackById(_sel.trackId); if (!track) return;
    var tp = track.textProps;
    tb.set(_proxyStyleProps(track, tp));
    tb.setCoords();
    // A track -> proxy push is not a proxy EDIT: re-baseline, or the very next after:render would read
    // the values we just wrote as a user change and copy them straight back.
    _proxySnap = _proxyPropSnapshot(tb);
    var cv = _cv(); if (cv) cv.requestRenderAll();
  }

  // Selecting a subtitle creates a REAL fabric Textbox for the active cue, so the
  // native floating toolbar, native double-click editing, native drag/resize and
  // native delete all work (owner: behave exactly like a text element). The raw
  // canvas still renders the cue when NOT selected (styles/animations/export);
  // renderTrack skips the selected track to avoid double text.
  function selectTrack(track, cueId) {
    if (!track) return;
    var cv = _cv();
    _deselect(true);
    _sel.trackId = track.id;
    var VE = _VE(); if (VE) VE._veSelectedSubtitleTrackId = track.id;
    if (window.VESubtitleProps && VESubtitleProps.syncStyleAnim) VESubtitleProps.syncStyleAnim(track.id);
    if (!cv) return;
    ensureTrackDefaults(track);
    var cue = cueId ? _cueById(track, cueId) : getActiveCues(track, _time())[0];
    if (!cue) {
      if (track.cues && track.cues.length) { cue = track.cues[0]; }
      else return;
    }
    // Park the playhead inside the cue being edited, or the box would sit on screen showing text
    // that is not supposed to be visible at this moment.
    if (VE && VE._veSeek && !(_time() >= cue.startTime && _time() < cue.endTime)) VE._veSeek(cue.startTime || 0);
    // Measure THIS cue, not "whatever is active": with the id passed in they can differ, and an empty
    // cue has no measurable block at all. Falling back to the track's own position keeps a proxy for
    // an empty cue instead of returning with the track marked selected and no box (which left the
    // subtitle un-editable AND un-deletable from the canvas).
    var geo = _boxForCues(track, [cue]);
    if (!geo) {
      var cvW = cv.getWidth(), cvH = cv.getHeight();
      var p = track.position || _defaultPosition();
      geo = { cx: cvW * (p.x != null ? p.x : 0.5), cy: cvH * (p.y != null ? p.y : 0.5), width: 240 };
    }
    var tp = track.textProps;
    var _init = _proxyStyleProps(track, tp);
    _init.left = geo.cx; _init.top = geo.cy; _init.originX = 'center'; _init.originY = 'center';
    _init.width = Math.max(120, geo.width + tp.fontSize);
    _init.editable = true; _init.objectCaching = false;
    _init.borderColor = '#f2ff58'; _init.cornerColor = '#f2ff58';
    _init.transparentCorners = false; _init.lockRotation = true;
    var tb = new fabric.Textbox(cue.text || ' ', _init);
    tb._isCCSubtitle = true;
    tb._ccTrackId = track.id;
    tb._ccCueId = cue.id;
    tb.excludeFromExport = true;
    _sel.proxy = tb; _sel.cueId = cue.id;
    // Baseline BEFORE the first render, or the initial after:render would read every prop as a fresh
    // user edit and copy the proxy's defaults over the track's real values.
    _proxySnap = _proxyPropSnapshot(tb);
    if (VE) VE._veSelectedCueId = cue.id;
    cv.add(tb);
    cv.setActiveObject(tb);
    tb.on('changed', function () { var c = _cueById(track, tb._ccCueId); if (c) { c.text = tb.text; _rerenderRawOnly(); } });
    tb.on('editing:exited', function () { var c = _cueById(track, tb._ccCueId); if (c) c.text = tb.text; _rerender(); });
    tb.on('moving', function () { _syncTextboxPos(track, tb); });
    tb.on('modified', function () {
      var f = tb.scaleY || 1;
      if (Math.abs(f - 1) > 0.001) { tp.fontSize = Math.max(8, Math.min(240, Math.round(tp.fontSize * f))); tb.set({ fontSize: tp.fontSize, scaleX: 1, scaleY: 1 }); }
      _syncTextboxPos(track, tb);
      _rerender();
      // Parity with native elements: a canvas move/resize is an undoable edit.
      if (VE && VE._vePushUndo) VE._vePushUndo();
      if (window.VESubtitleProps && VESubtitleProps.refresh) VESubtitleProps.refresh();
    });
    cv.requestRenderAll();
    // Re-render the raw preview so renderTrack's skip clears this cue's raw text
    // (the Textbox now shows it) - avoids a doubled/offset draw.
    if (window.VideoEditor && VideoEditor.renderPreview) VideoEditor.renderPreview();
  }

  function _onMouseDown(opt) {
    var cv = _cv(); if (!cv) return;
    // clicking an existing fabric object (overlay/our proxy) is handled by fabric
    if (opt.target) {
      if (opt.target._isCCSubtitle) return; // our proxy, keep selection
      return;
    }
    var track = _activeSubtitleTrackAt(_time());
    if (!track) { if (_sel.proxy) { _deselect(); cv.requestRenderAll(); } return; }
    var geo = _boxFor(track, _time()); if (!geo) return;
    var p = cv.getPointer(opt.e);
    var pad = 24;
    if (p.x >= geo.left - pad && p.x <= geo.left + geo.width + pad &&
        p.y >= geo.top - pad && p.y <= geo.top + geo.height + pad) {
      selectTrack(track);
    } else if (_sel.proxy) {
      _deselect(); cv.requestRenderAll();
    }
  }

  // Bind fabric canvas interaction once (lazy, when a subtitle first renders).
  function ensureInteraction() {
    if (_bound) return;
    var cv = _cv(); if (!cv || !cv.on) return;
    _bound = true;
    cv.on('mouse:down', _onMouseDown);
    // Double-click editing is native now (the proxy is a fabric Textbox).
    // Native deselect: when the fabric selection clears (empty click, Escape),
    // drop our subtitle selection too.
    cv.on('selection:cleared', function () { if (_sel.trackId) _deselect(); });
    // Selecting a DIFFERENT element (fabric fires selection:updated/created with a
    // new active object) must drop our proxy too, else the subtitle stays selected
    // forever (owner: "seçim gitmiyor"). Ignore the create fired by selectTrack
    // itself (its active object IS our proxy).
    function _dropIfNotOurs() {
      if (!_sel.trackId) return;
      var act = cv.getActiveObject();
      if (!act || !act._isCCSubtitle) _deselect();
    }
    cv.on('selection:updated', _dropIfNotOurs);
    cv.on('selection:created', _dropIfNotOurs);
    // Native delete: the app's delete path (Delete key, trash toolbar) removes
    // the active fabric object -> object:removed. If that was our proxy (and not
    // our own programmatic deselect), delete the real cue.
    cv.on('object:removed', function (opt) {
      var obj = opt && opt.target;
      if (obj && obj._isCCSubtitle && !_removingProxy) _deleteCueFromProxy(obj);
    });
    // Native text modules edit the proxy Textbox directly (no single event), so
    // mirror its props back to track.textProps on every render while selected.
    cv.on('after:render', function () { if (_sel.proxy) _syncProxyToTextProps(); });
  }

  /* THE PROXY FOLLOWS THE PLAYHEAD. It is an editing affordance for ONE cue while the playhead moves
     underneath it, so when the playhead leaves that cue the box must either re-point at the cue now
     under it or step aside. Left alone it froze on the cue that was clicked, which (together with
     renderTrack's old whole-track skip) is what made every subtitle disappear from the canvas after a
     single click. Hiding is enough to step aside: renderTrack only skips a cue whose proxy is VISIBLE,
     so the raw renderer takes the cue straight back.
     Never runs while the caret is in the box - retargeting text under a live edit would throw away
     what the user is typing. Called from VE._veUpdatePlayhead, the one place a playhead move lands,
     which is also why it must NEVER call _veRender (that function calls _veUpdatePlayhead itself). */
  function syncSelectionToTime() {
    var tb = _sel.proxy; if (!tb || !_sel.trackId) return;
    if (tb.isEditing) return;
    var cv = _cv(); if (!cv) return;
    var track = _trackById(_sel.trackId);
    if (!track || !track.cues || !track.cues.length) return;
    var active = getActiveCues(track, _time());
    var VE = _VE();
    var i, still = false;
    for (i = 0; i < active.length; i++) if (active[i].id === tb._ccCueId) { still = true; break; }

    // Fabric draws the active object's control frame WITHOUT consulting `visible` (measured: 10940
    // volt pixels on the lower canvas with the box hidden), so an invisible proxy left an empty
    // selection frame floating over the video. Controls and borders go with it.
    if (!active.length) {
      if (tb.visible !== false) {
        tb.set({ visible: false, hasControls: false, hasBorders: false, evented: false });
        cv.requestRenderAll(); _rerenderRawOnly();
      }
      return;
    }
    var target = still ? _cueById(track, tb._ccCueId) : active[0];
    if (!target) return;
    var retarget = !still || tb.visible === false;
    if (!retarget) return;

    tb._ccCueId = target.id;
    _sel.cueId = target.id;
    if (VE) {
      VE._veSelectedCueId = target.id;
      // The TIMELINE selection has to follow too. A proxy only ever exists for a SINGLE selected
      // cue, so a one-item list is retargeted with it; otherwise Delete would remove the cue the
      // user stopped looking at three seconds ago rather than the one in the box.
      if (VE._veSelectedCues && VE._veSelectedCues.length === 1) VE._veSelectedCues = [target.id];
    }
    tb.set({ visible: true, hasControls: true, hasBorders: true, evented: true });
    if (tb.text !== (target.text || ' ')) tb.set({ text: target.text || ' ' });
    var geo = _boxForCues(track, [target]);
    if (geo) {
      var tp = track.textProps || DEFAULT_TEXT_PROPS;
      tb.set({ left: geo.cx, top: geo.cy, width: Math.max(120, geo.width + tp.fontSize) });
    }
    tb.setCoords();
    cv.requestRenderAll();
    _rerenderRawOnly();
    // Move the timeline highlight with it by touching the two segments directly: _veRender would
    // re-enter through _veUpdatePlayhead.
    var segs = document.querySelectorAll('.ve-cue-seg');
    for (i = 0; i < segs.length; i++) {
      var isIt = segs[i].getAttribute('data-cue-id') === target.id;
      var grouped = VE && VE._veCueSelected && VE._veCueSelected(segs[i].getAttribute('data-cue-id'));
      segs[i].classList.toggle('ve-cue-seg--selected', !!(isIt || grouped));
    }
  }

  /* IS THIS TRACK'S CAPTION ON SCREEN? `captionVisible = false` is written on the SOURCE track by
     dubbing (`ve-dubbing.js`) and by translation (`ve-subtitle-translate.js`) so the original captions
     do not double up with the new set. That is only true WHILE the replacement actually exists and
     carries cues - and the destination track is created EMPTY and filled asynchronously, so a run that
     never produced cues (or a destination deleted later) left the flag hiding the only subtitles in the
     project, with nothing on the canvas and no way back.
     Measured on the owner's real design: source track 2 cues / captionVisible false, destination
     `cue-dub-translation-...-es` 0 cues. Nothing on screen, so style and animation both read as dead.
     So the flag is not a stored answer, it is a QUESTION asked against the live project. It needs no
     switch and must not have one: it heals itself the moment the replacement is gone.
     `tracks` is optional; pass the project's list to keep this O(n) inside a render loop. */
  function captionsVisible(track, tracks) {
    if (!track || !track.cues || !track.cues.length) return false;
    if (track.captionVisible !== false) return true;
    var list = tracks || (_proj2() ? _proj2().tracks : []);
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (!t || t === track || !t.cues || !t.cues.length) continue;
      if (t.captionVisible === false) continue;          // itself stood aside; it replaces nothing
      var replaces = (t.sourceTrackId && t.sourceTrackId === track.id) ||
                     (t.sourceSubtitleSetId && track.subtitleSetId && t.sourceSubtitleSetId === track.subtitleSetId);
      if (replaces) return false;                        // a real replacement is up; stay out of its way
    }
    return true;                                          // nobody took over: show, never hide the only cues
  }

  function applyStyle(track, styleId) {
    if (!track) return;
    ensureTrackDefaults(track);
    var st = STYLES[styleId] || STYLES.none;
    track.styleId = st.key;
    if (st.textColor) track.textProps.color = st.textColor;
    // Push the new colour onto the live proxy HERE, not only from the panel's re-render helper: the
    // proxy is what the user is looking at while they pick a style, and the two must not disagree.
    if (_sel.proxy && _sel.trackId === track.id) _applyPropsToTextbox();
    var VE = _VE(); if (VE && VE._vePushUndo) VE._vePushUndo();
  }

  window.VESubtitleElement = {
    DEFAULT_TEXT_PROPS: DEFAULT_TEXT_PROPS,
    STYLES: STYLES,
    STYLE_ORDER: STYLE_ORDER,
    STYLE_GROUPS: STYLE_GROUPS,
    BLOCK_ANIMS: BLOCK_ANIMS,
    WORD_ANIMS: WORD_ANIMS,
    applyStyle: applyStyle,
    ensureTrackDefaults: ensureTrackDefaults,
    ensureCaptionsTrack: ensureCaptionsTrack,
    getActiveCues: getActiveCues,
    getCueWords: getCueWords,
    measureBlock: measureBlock,
    renderTrack: renderTrack,
    renderTracks: renderTracks,
    ensureInteraction: ensureInteraction,
    captionsVisible: captionsVisible,
    selectTrack: selectTrack,
    syncSelectionToTime: syncSelectionToTime,
    getSelectedTrackId: function () { return _sel.trackId; },
    getSelectedCueId: function () { return _sel.proxy ? _sel.proxy._ccCueId : null; },
    refitSelected: function () { _applyPropsToTextbox(); },
    deselect: _deselect
  };
})();

// Modular skeleton hook - ve-subtitle-element is a video loader module (modules/video/). Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-subtitle-element', parent: 'video', title: 've-subtitle-element', mount: function () {}, unmount: function () {} });
