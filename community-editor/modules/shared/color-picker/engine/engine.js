/* Module: shared/color-picker/engine — colour MODEL/MATH/RASTER — pure conversions, gradient-state helpers, and the gradient→canvas/CSS raster engine. No DOM; the stateful UI children call these through CP.
   Part of the color-picker group (decomposed from the 1698-line IIFE). All functions hang
   off the shared namespace CP (window.__ccColorPicker, created by the parent); cross-module
   references resolve through CP at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var CP = window.__ccColorPicker;
  if (!CP) return;

  CP.hsvToRgb = function (h, s, v) {
    var r, g, b;
    var i = Math.floor(h * 6);
    var f = h * 6 - i;
    var p = v * (1 - s);
    var q = v * (1 - f * s);
    var t = v * (1 - (1 - f) * s);
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      default: r = v; g = p; b = q; break;
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  };

  CP.rgbToHsv = function (r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    var mx = Math.max(r, g, b);
    var mn = Math.min(r, g, b);
    var h, s, v = mx;
    var d = mx - mn;
    s = mx === 0 ? 0 : d / mx;
    if (mx === mn) {
      h = 0;
    } else {
      switch (mx) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return [h, s, v];
  };

  CP.hexToRgb = function (hex) {
    hex = String(hex || '').replace('#', '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    return [parseInt(hex.substr(0, 2), 16), parseInt(hex.substr(2, 2), 16), parseInt(hex.substr(4, 2), 16)];
  };

  CP.rgbToHex = function (r, g, b) {
    return '#' + [r, g, b].map(function (c) {
      var v = Math.max(0, Math.min(255, Math.round(c)));
      return v.toString(16).padStart(2, '0');
    }).join('');
  };

  CP.hsvToHex = function (h, s, v) {
    var rgb = CP.hsvToRgb(h, s, v);
    return CP.rgbToHex(rgb[0], rgb[1], rgb[2]);
  };

  CP.clamp = function (num, min, max) {
    return Math.max(min, Math.min(max, num));
  };

  /* Where to DRAW a drag handle so it stays fully inside its track. Handles are centred on
     their position (transform: translate(-50%,-50%)), so at frac 0 or 1 half of the handle
     would fall outside the wrap, which clips it (overflow:hidden) and renders a sliced
     half-circle. Only the drawn position is inset by the handle radius: _sat/_val/_hue are
     never touched, so the picked colour is unchanged. */
  CP.cursorOffset = function (frac, trackSize, cursorSize) {
    var r = (cursorSize || 0) / 2;
    return CP.clamp(frac * trackSize, r, Math.max(r, trackSize - r));
  };

  CP._cpColorParseCanvas = function () {
    if (!CP._cpColorParseCanvas._ctx) {
      var c = document.createElement('canvas');
      c.width = 1;
      c.height = 1;
      CP._cpColorParseCanvas._ctx = c.getContext('2d');
    }
    return CP._cpColorParseCanvas._ctx;
  };

  CP.normalizeHexColor = function (hex) {
    var value = String(hex || '').trim();
    if (!value) return '#ffffff';
    if (/^[0-9a-fA-F]{6}$/.test(value)) value = '#' + value;
    if (/^#[0-9a-fA-F]{3}$/.test(value)) {
      value = '#' + value.charAt(1) + value.charAt(1) + value.charAt(2) + value.charAt(2) + value.charAt(3) + value.charAt(3);
    }
    if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
    try {
      var ctx = CP._cpColorParseCanvas();
      ctx.fillStyle = '#ffffff';
      ctx.fillStyle = value;
      var normalized = ctx.fillStyle;
      if (normalized && normalized.indexOf('#') === 0) {
        if (normalized.length === 4) return CP.normalizeHexColor(normalized);
        if (normalized.length === 7) return normalized.toLowerCase();
      }
      if (typeof toHex === 'function') {
        var hexValue = toHex(value);
        if (hexValue) return CP.normalizeHexColor(hexValue);
      }
    } catch (err) {}
    return '#ffffff';
  };

  CP.parseColorWithOpacity = function (color) {
    var raw = String(color || '').trim();
    if (!raw) return { color: '#ffffff', opacity: 100 };
    var rgbaMatch = raw.match(/^rgba?\(([^)]+)\)$/i);
    if (rgbaMatch) {
      var parts = rgbaMatch[1].split(',').map(function (part) { return part.trim(); });
      if (parts.length >= 3) {
        return {
          color: CP.rgbToHex(parseFloat(parts[0]) || 0, parseFloat(parts[1]) || 0, parseFloat(parts[2]) || 0),
          opacity: parts.length > 3 ? CP.clamp(Math.round((parseFloat(parts[3]) || 0) * 100), 0, 100) : 100
        };
      }
    }
    return { color: CP.normalizeHexColor(raw), opacity: 100 };
  };

  CP.rgbaStringFromStop = function (stop) {
    var rgb = CP.hexToRgb(stop.color);
    return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + CP.clamp((stop.opacity || 0) / 100, 0, 1) + ')';
  };

  CP.copyStop = function (stop) {
    return {
      id: stop && stop.id != null ? stop.id : CP._gradStopSeq++,
      offset: CP.clamp(Math.round(Number(stop && stop.offset) || 0), 0, 100),
      color: CP.normalizeHexColor(stop && stop.color),
      opacity: CP.clamp(Math.round(Number(stop && stop.opacity) || 0), 0, 100)
    };
  };

  CP.normalizeStops = function (stops) {
    var list = (stops || []).map(CP.copyStop).sort(function (a, b) {
      return a.offset - b.offset;
    });
    if (!list.length) {
      list = [
        { id: 1, offset: 0, color: '#f2ff58', opacity: 100 },
        { id: 2, offset: 100, color: '#6c63ff', opacity: 100 }
      ];
    }
    list.forEach(function (stop) {
      if (stop.id >= CP._gradStopSeq) CP._gradStopSeq = stop.id + 1;
    });
    if (list.length === 1) list.push({ id: CP._gradStopSeq++, offset: 100, color: list[0].color, opacity: list[0].opacity });
    return list;
  };

  CP.cloneGradientState = function (state) {
    var src = state || CP._gradState;
    return {
      type: src.type || 'linear',
      angle: Number(src.angle) || 0,
      stops: CP.normalizeStops(src.stops || [])
    };
  };

  CP.getSelectedStop = function () {
    var stops = CP.normalizeStops(CP._gradState.stops);
    var found = null;
    stops.forEach(function (stop) {
      if (stop.id === CP._gradSelectedStopId) found = stop;
    });
    if (found) return found;
    CP._gradSelectedStopId = stops[0].id;
    return stops[0];
  };

  CP.canUseGradientTarget = function (target) {
    return target === 'fill' || target === 'textFill' || target === 'wbFill' || target === 'pageBg';
  };

  CP.getGradientTypeLabel = function (type) {
    for (var i = 0; i < CP.GRADIENT_TYPES.length; i++) {
      if (CP.GRADIENT_TYPES[i].value === type) return CP.GRADIENT_TYPES[i].label;
    }
    return 'Linear';
  };

  CP.escapeHtml = function (str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  CP.buildSwatchPreviewBackground = function (state) {
    var gradient = CP.cloneGradientState(state);
    var cssStops = gradient.stops.map(function (stop) {
      return CP.rgbaStringFromStop(stop) + ' ' + CP.clamp(stop.offset, 0, 100) + '%';
    }).join(', ');
    if (gradient.type === 'linear') return 'linear-gradient(' + (gradient.angle || 0) + 'deg, ' + cssStops + ')';
    if (gradient.type === 'radial') return 'radial-gradient(circle at 50% 50%, ' + cssStops + ')';
    if (gradient.type === 'angular') return 'conic-gradient(from ' + (gradient.angle || 0) + 'deg at 50% 50%, ' + cssStops + ')';
    return 'url(' + CP.buildGradientPreviewDataUrl(gradient, 120, 32) + ') center/cover no-repeat';
  };

  CP.colorPointAt = function (state, t) {
    var stops = CP.normalizeStops(state.stops || []);
    if (t <= stops[0].offset / 100) {
      var first = CP.hexToRgb(stops[0].color);
      return { r: first[0], g: first[1], b: first[2], a: CP.clamp(stops[0].opacity / 100, 0, 1) };
    }
    if (t >= stops[stops.length - 1].offset / 100) {
      var last = CP.hexToRgb(stops[stops.length - 1].color);
      return { r: last[0], g: last[1], b: last[2], a: CP.clamp(stops[stops.length - 1].opacity / 100, 0, 1) };
    }
    for (var i = 0; i < stops.length - 1; i++) {
      var start = stops[i];
      var end = stops[i + 1];
      var min = start.offset / 100;
      var max = end.offset / 100;
      if (t < min || t > max) continue;
      var span = Math.max(0.0001, max - min);
      var ratio = CP.clamp((t - min) / span, 0, 1);
      var c1 = CP.hexToRgb(start.color);
      var c2 = CP.hexToRgb(end.color);
      return {
        r: c1[0] + (c2[0] - c1[0]) * ratio,
        g: c1[1] + (c2[1] - c1[1]) * ratio,
        b: c1[2] + (c2[2] - c1[2]) * ratio,
        a: CP.clamp((start.opacity / 100) + ((end.opacity / 100) - (start.opacity / 100)) * ratio, 0, 1)
      };
    }
    var rgb = CP.hexToRgb(stops[0].color);
    return { r: rgb[0], g: rgb[1], b: rgb[2], a: CP.clamp(stops[0].opacity / 100, 0, 1) };
  };

  CP.buildGradientPreviewDataUrl = function (state, width, height) {
    return CP.buildGradientSourceCanvas(state, width, height).toDataURL('image/png');
  };

  CP.addCanvasGradientStops = function (grad, stops) {
    CP.normalizeStops(stops).forEach(function (stop) {
      grad.addColorStop(CP.clamp(stop.offset / 100, 0, 1), CP.rgbaStringFromStop(stop));
    });
  };

  CP.buildGradientSourceCanvas = function (state, width, height) {
    var cw = CP.clamp(Math.round(width || 256), 24, 1024);
    var ch = CP.clamp(Math.round(height || 256), 24, 1024);
    var canvasEl = document.createElement('canvas');
    canvasEl.width = cw;
    canvasEl.height = ch;
    var ctx = canvasEl.getContext('2d');
    var cx = cw / 2;
    var cy = ch / 2;
    var rad = ((state.angle || 0) % 360) * Math.PI / 180;

    if (state.type === 'linear') {
      var len = Math.abs(Math.cos(rad)) * (cw / 2) + Math.abs(Math.sin(rad)) * (ch / 2);
      var grad = ctx.createLinearGradient(cx - Math.cos(rad) * len, cy - Math.sin(rad) * len, cx + Math.cos(rad) * len, cy + Math.sin(rad) * len);
      CP.addCanvasGradientStops(grad, state.stops);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cw, ch);
      return canvasEl;
    }

    if (state.type === 'radial') {
      var radius = Math.max(cw, ch) * 0.72;
      var radial = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      CP.addCanvasGradientStops(radial, state.stops);
      ctx.fillStyle = radial;
      ctx.fillRect(0, 0, cw, ch);
      return canvasEl;
    }

    if (state.type === 'angular' && typeof ctx.createConicGradient === 'function') {
      var conic = ctx.createConicGradient(rad, cx, cy);
      CP.addCanvasGradientStops(conic, state.stops);
      ctx.fillStyle = conic;
      ctx.fillRect(0, 0, cw, ch);
      return canvasEl;
    }

    var img = ctx.createImageData(cw, ch);
    var data = img.data;
    var halfW = Math.max(1, cw / 2);
    var halfH = Math.max(1, ch / 2);
    for (var y = 0; y < ch; y++) {
      for (var x = 0; x < cw; x++) {
        var px = x - cx;
        var py = y - cy;
        var rx = px * Math.cos(rad) + py * Math.sin(rad);
        var ry = -px * Math.sin(rad) + py * Math.cos(rad);
        var t = 0;
        if (state.type === 'diamond') {
          t = CP.clamp(Math.abs(rx) / halfW + Math.abs(ry) / halfH, 0, 1);
        } else {
          t = (Math.atan2(ry, rx) + Math.PI) / (Math.PI * 2);
        }
        var color = CP.colorPointAt(state, t);
        var idx = (y * cw + x) * 4;
        data[idx] = Math.round(color.r);
        data[idx + 1] = Math.round(color.g);
        data[idx + 2] = Math.round(color.b);
        data[idx + 3] = Math.round(CP.clamp(color.a, 0, 1) * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvasEl;
  };

  CP.buildPatternFillForObject = function (state, obj) {
    var width = Math.max(24, Math.round(obj.width || 120));
    var height = Math.max(24, Math.round(obj.height || 120));
    return new fabric.Pattern({
      source: CP.buildGradientSourceCanvas(state, width, height),
      repeat: 'no-repeat'
    });
  };

  CP.rebuildObjectGradientFill = function (targetObj, state) {
    if (!targetObj || !state) return;
    var finalState = CP.cloneGradientState(state);
    targetObj._ccGradientState = finalState;
    targetObj.set('fill', CP.buildPatternFillForObject(finalState, targetObj));
    targetObj.dirty = true;
  };

  CP.applyGradientToTarget = function (targetObj, state) {
    if (!targetObj) return;
    if (CP.clearImageFillForObject) CP.clearImageFillForObject(targetObj);   // a fill has one kind
    var finalState = CP.cloneGradientState(state);
    if (typeof window.ensureTextObjectVisualPadding === 'function') {
      window.ensureTextObjectVisualPadding(targetObj);
    } else if (typeof window.ensureTextShapeAssetPadding === 'function') {
      window.ensureTextShapeAssetPadding(targetObj);
    }
    CP.rebuildObjectGradientFill(targetObj, finalState);
  };

  /* ── IMAGE FILL ─────────────────────────────────────────────────────────────────────────────
     A picture used as an object's FILL. The 4th button of the Fill segment had no implementation
     at all (owner 2026-08-07: "sekle resimli arkaplan atardim o da gitmis") - it opened a colour
     panel that has no image in it.

     Shape: obj.fill = a fabric.Pattern whose source is the IMG ELEMENT, plus obj._ccImageFill =
     {fit}. Deliberately NOT a pre-rendered canvas the way the gradient does it: fabric serialises
     an <img> source as its own src string, so the picture is stored ONCE, while a canvas source is
     re-encoded into a SECOND full copy of the same bytes on every save. Cover/contain are a
     patternTransform rather than a baked bitmap, so the fill keeps fitting when the object is
     resized.

     _ccImageFill is also the DISCRIMINATOR, not the pixel source: after a reload a gradient's
     Pattern source is an <img> too (fabric turns the canvas into a data URL), so "does the source
     have a .src" cannot tell the two apart. The marker can. */
  CP.IMAGE_FILL_FITS = ['cover', 'contain', 'tile'];

  CP.canUseImageTarget = function (target) {
    /* pageBg is excluded on purpose: the page background already owns a complete image control
       (#p-bg-image, with its own fit menu and effects popup). Two doors onto one setting is how
       they drift apart. */
    return target === 'fill' || target === 'textFill' || target === 'wbFill';
  };

  CP.buildImageFillPattern = function (imgEl, obj, fit) {
    var w = Math.max(1, (obj && obj.width) || 1);
    var h = Math.max(1, (obj && obj.height) || 1);
    var iw = imgEl.naturalWidth || imgEl.width || 1;
    var ih = imgEl.naturalHeight || imgEl.height || 1;
    var opts = { source: imgEl, repeat: fit === 'tile' ? 'repeat' : 'no-repeat' };
    if (fit !== 'tile') {
      var s = (fit === 'contain') ? Math.min(w / iw, h / ih) : Math.max(w / iw, h / ih);
      opts.patternTransform = [s, 0, 0, s, (w - iw * s) / 2, (h - ih * s) / 2];
    }
    return new fabric.Pattern(opts);
  };

  CP.applyImageFillToTarget = function (targetObj, src, fit, done) {
    if (!targetObj || !src) { if (done) done(false); return; }
    var isData = src.indexOf('data:') === 0;
    fabric.util.loadImage(src, function (imgEl) {
      /* A picture that will not load must not leave the object mid-change: keep the old fill and
         say so, rather than painting nothing and calling it an image fill. */
      if (!imgEl) { if (done) done(false); return; }
      // Remember the colour we are covering, so "Remove image" and the segment's own solid button
      // have something honest to go back to (the same field the none/solid path already uses).
      if (typeof targetObj.fill === 'string' && targetObj.fill && targetObj.fill !== 'transparent') {
        targetObj._rpfLastFill = targetObj.fill;
      }
      CP.clearGradientStateForObject(targetObj);
      targetObj._ccImageFill = { fit: fit || 'cover' };
      targetObj.set('fill', CP.buildImageFillPattern(imgEl, targetObj, fit || 'cover'));
      targetObj.dirty = true;
      if (done) done(true);
    }, null, isData ? undefined : 'anonymous');
  };

  CP.clearImageFillForObject = function (obj) {
    if (!obj) return;
    delete obj._ccImageFill;
  };

  CP.parseImageFillFromObject = function (obj) {
    if (!obj || !obj._ccImageFill) return null;
    var f = obj.fill;
    if (!f || typeof f !== 'object' || !f.source) return null;
    var src = (typeof f.source === 'string') ? f.source : (f.source.src || '');
    if (!src) return null;
    return { src: src, fit: obj._ccImageFill.fit || 'cover' };
  };

  CP.parseGradientStateFromObject = function (obj) {
    if (!obj) return null;
    // An image fill is a Pattern too; without this an image-filled object would read back as a
    // gradient the moment its own state marker was consulted.
    if (obj._ccImageFill) return null;
    if (obj._ccGradientState && obj._ccGradientState.stops && obj._ccGradientState.stops.length) {
      return CP.cloneGradientState(obj._ccGradientState);
    }
    if (!obj.fill || typeof obj.fill !== 'object' || !obj.fill.colorStops) return null;
    var type = obj.fill.type === 'radial' ? 'radial' : 'linear';
    var angle = 90;
    if (type === 'linear' && obj.fill.coords) {
      angle = Math.round((Math.atan2(obj.fill.coords.y2 - obj.fill.coords.y1, obj.fill.coords.x2 - obj.fill.coords.x1) * 180 / Math.PI + 360) % 360);
    }
    return {
      type: type,
      angle: angle,
      stops: CP.normalizeStops(obj.fill.colorStops.map(function (stop) {
        var parsed = CP.parseColorWithOpacity(stop.color);
        return {
          id: CP._gradStopSeq++,
          offset: Math.round(CP.clamp((Number(stop.offset) || 0) * 100, 0, 100)),
          color: parsed.color,
          opacity: parsed.opacity
        };
      }))
    };
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'engine', parent: 'shared.color-picker', title: 'Color Picker: engine', mount: function () {}, unmount: function () {} });
  }
})();
