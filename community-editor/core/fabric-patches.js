/* ============================================================
   dika studio - fabric-patches.js
   Targeted fixes for fabric.js 5.3.1 quirks. Loaded IMMEDIATELY
   after fabric.min.js, before any dika studio code touches fabric.

   FIX: text objects restored from JSON that has NO `styles` key
   (bulk_generate-cloned docs, imports, externally authored JSON)
   end up with `styles === undefined` at runtime: fromObject runs
   stylesFromArray(undefined) -> undefined, Object.assign writes
   the styles key anyway, and setOptions then CLOBBERS the `{}`
   default from Text.initialize. The next toObject()/canvas.toJSON()
   dies in fabric.util.stylesToArray reading styles[0] ->
   "TypeError: Cannot read properties of undefined (reading '0')".
   In the embedded editor that throw killed buildAutosavePayload,
   breaking the portal-bridge get-project-data/save-project flow
   (Tier-2 render worker load-handshake timeouts).
   ============================================================ */

(function () {
  if (typeof fabric === 'undefined') return;

  // Belt 1 - serializer tolerance: a missing/undefined styles object
  // serializes as the empty-array form (identical to what {} yields).
  // Covers every toObject/toJSON path, including texts nested in groups.
  if (fabric.util && typeof fabric.util.stylesToArray === 'function') {
    var _origStylesToArray = fabric.util.stylesToArray;
    fabric.util.stylesToArray = function (styles, text) {
      if (!styles) return [];
      return _origStylesToArray.call(this, styles, text);
    };
  }

  // Belt 2 - normalize at revival: any Text/IText/Textbox coming out of
  // fromObject with a missing styles object gets `{}`, so live editing
  // code that reads this.styles[line] unguarded can never explode either.
  ['Text', 'IText', 'Textbox'].forEach(function (klassName) {
    var klass = fabric[klassName];
    if (!klass || typeof klass.fromObject !== 'function') return;
    var _origFromObject = klass.fromObject;
    klass.fromObject = function (object, callback) {
      return _origFromObject.call(this, object, function (instance) {
        if (instance && !instance.styles) instance.styles = {};
        if (typeof callback === 'function') callback.apply(this, arguments);
      });
    };
  });

  /* ==========================================================================
     Belt 3 - CVE-2026-27013: toSVG() does NOT escape object strings that it
     interpolates into SVG ATTRIBUTE markup. Text CONTENT is escaped ("Ben &
     Jerry" -> "Ben &amp; Jerry"), attribute values are not, so a crafted value
     closes the attribute and injects elements. Fixed upstream in fabric 7.2.0;
     we are on 5.3.x, so we patch it here.

     Measured on 5.3.0 — these seven reach attribute markup unescaped:
       fontFamily / fontStyle / fontWeight (<text …>), strokeDashArray (style="…"),
       id (getSvgCommons), canvas backgroundColor (background <rect fill="…">).
     Safe already (fabric normalises or escapes them): fill, stroke, textAlign,
     text content, image src, shadow color, clipPath.

     This is ALSO a correctness fix, not only a security one: a legitimate font
     called `AT&T Sans`, or an id containing `&`, produced malformed XML and the
     export died. Same root cause, same one-line-per-site fix.

     Strategy: escape the VALUE, never the produced markup — the markup contains
     the real `"` delimiters. Each wrapper swaps the risky property for its
     escaped form, calls fabric's own implementation (so formatting/behaviour is
     untouched), then restores. Restore runs in `finally`, so a throw inside
     fabric cannot leave an escaped value on a live object.
     ========================================================================== */
  var _esc = (fabric.util && fabric.util.string && fabric.util.string.escapeXml)
    ? fabric.util.string.escapeXml
    : function (s) {
        return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
          .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;');
      };
  var _RISKY = /[&"'<>]/;

  /* Run `fn` with the listed string props temporarily XML-escaped on `obj`. */
  function _withEscaped(obj, props, fn) {
    var saved = null;
    for (var i = 0; i < props.length; i++) {
      var k = props[i], v = obj[k];
      if (typeof v === 'string' && _RISKY.test(v)) {
        if (!saved) saved = {};
        saved[k] = v;
        obj[k] = _esc(v);
      }
    }
    if (!saved) return fn();           // nothing risky: zero overhead, byte-identical output
    try { return fn(); }
    finally { for (var k2 in saved) { if (Object.prototype.hasOwnProperty.call(saved, k2)) obj[k2] = saved[k2]; } }
  }

  // 3a - <text font-family="…" font-style="…" font-weight="…">. Patching Text
  // covers IText and Textbox, which inherit toSVG.
  if (fabric.Text && fabric.Text.prototype && typeof fabric.Text.prototype.toSVG === 'function') {
    var _origTextToSVG = fabric.Text.prototype.toSVG;
    var _FONT_PROPS = ['fontFamily', 'fontStyle', 'fontWeight'];
    fabric.Text.prototype.toSVG = function (reviver) {
      var self = this, args = arguments;
      return _withEscaped(this, _FONT_PROPS, function () { return _origTextToSVG.apply(self, args); });
    };
  }

  // 3b - id="…" (every object, via getSvgCommons).
  if (fabric.Object && fabric.Object.prototype && typeof fabric.Object.prototype.getSvgCommons === 'function') {
    var _origCommons = fabric.Object.prototype.getSvgCommons;
    fabric.Object.prototype.getSvgCommons = function () {
      var self = this, args = arguments;
      return _withEscaped(this, ['id'], function () { return _origCommons.apply(self, args); });
    };
  }

  // 3c - style="… stroke-dasharray: … ;". The dasharray is the only caller-set
  // string in this CSS blob; the rest is numbers, keywords and rgb(). None of
  // `<>"&` is ever legitimate there, so escaping the produced string is safe and
  // also catches anything else that lands in it later.
  if (fabric.Object && fabric.Object.prototype && typeof fabric.Object.prototype.getSvgStyles === 'function') {
    var _origStyles = fabric.Object.prototype.getSvgStyles;
    fabric.Object.prototype.getSvgStyles = function () {
      var css = _origStyles.apply(this, arguments);
      return (typeof css === 'string' && _RISKY.test(css)) ? _esc(css) : css;
    };
  }

  // 3d - the canvas background/overlay <rect fill="…">. Only a plain colour
  // string is a risk; a Gradient/Pattern object goes down another path.
  if (fabric.StaticCanvas && fabric.StaticCanvas.prototype && typeof fabric.StaticCanvas.prototype.toSVG === 'function') {
    var _origCanvasToSVG = fabric.StaticCanvas.prototype.toSVG;
    fabric.StaticCanvas.prototype.toSVG = function (options, reviver) {
      var self = this, args = arguments;
      return _withEscaped(this, ['backgroundColor', 'overlayColor'], function () { return _origCanvasToSVG.apply(self, args); });
    };
  }
})();
