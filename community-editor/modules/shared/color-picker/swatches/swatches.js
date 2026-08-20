/* Module: shared/color-picker/swatches — COLOUR SOURCES — the Default / Document / Photo swatch rows scanned from the canvas.
   Part of the color-picker group (decomposed from the 1698-line IIFE). All functions hang
   off the shared namespace CP (window.__ccColorPicker, created by the parent); cross-module
   references resolve through CP at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var CP = window.__ccColorPicker;
  if (!CP) return;

  CP.renderDefaultColors = function () {
    var wrap = document.getElementById('cp-default-colors');
    if (!wrap) return;
    wrap.innerHTML = '';
    CP.DEFAULT_COLORS.forEach(function (color) {
      var s = document.createElement('div');
      s.className = 'cp-swatch';
      s.style.background = color;
      if (color === '#ffffff') s.classList.add('cp-swatch-light');
      s.addEventListener('click', function () {
        if (CP._cpTab === 'gradient' && CP.canUseGradientTarget(CP._cpTarget)) CP.setGradientStopColor(CP.getSelectedStop().id, color);
        else {
          CP.setColorFromHex(color);
          CP.applyCurrentColor();
        }
      });
      wrap.appendChild(s);
    });
  };

  CP.addObjColor = function (obj, set) {
    if (!obj) return;
    if (obj.fill && typeof obj.fill === 'string' && obj.fill !== 'transparent') {
      var fillHex = typeof toHex === 'function' ? toHex(obj.fill) : CP.normalizeHexColor(obj.fill);
      if (fillHex) set[fillHex.toLowerCase()] = true;
    }
    if (obj.stroke && typeof obj.stroke === 'string' && obj.stroke !== 'transparent') {
      var strokeHex = typeof toHex === 'function' ? toHex(obj.stroke) : CP.normalizeHexColor(obj.stroke);
      if (strokeHex) set[strokeHex.toLowerCase()] = true;
    }
    if (obj.fill && typeof obj.fill === 'object' && obj.fill.colorStops) {
      obj.fill.colorStops.forEach(function (stop) {
        if (!stop || !stop.color) return;
        set[CP.parseColorWithOpacity(stop.color).color.toLowerCase()] = true;
      });
    }
    if (obj._ccGradientState && obj._ccGradientState.stops) {
      obj._ccGradientState.stops.forEach(function (stop) {
        if (stop && stop.color) set[CP.normalizeHexColor(stop.color).toLowerCase()] = true;
      });
    }
    if (obj.type === 'group' && obj._objects) {
      obj._objects.forEach(function (child) { CP.addObjColor(child, set); });
    }
  };

  CP.scanDocumentColors = function () {
    var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
    if (!cvs) return [];
    var set = {};
    cvs.getObjects().forEach(function (obj) {
      CP.addObjColor(obj, set);
    });
    return Object.keys(set);
  };

  CP.renderDocumentColors = function () {
    var wrap = document.getElementById('cp-doc-colors');
    if (!wrap) return;
    var colors = CP.scanDocumentColors();
    wrap.innerHTML = '';
    if (!colors.length) {
      wrap.innerHTML = '<span class="cp-empty-hint">No colors in document yet</span>';
      return;
    }
    colors.forEach(function (color) {
      var s = document.createElement('div');
      s.className = 'cp-swatch';
      s.style.background = color;
      if (color === '#ffffff') s.classList.add('cp-swatch-light');
      s.addEventListener('click', function () {
        if (CP._cpTab === 'gradient' && CP.canUseGradientTarget(CP._cpTarget)) CP.setGradientStopColor(CP.getSelectedStop().id, color);
        else {
          CP.setColorFromHex(color);
          CP.applyCurrentColor();
        }
      });
      wrap.appendChild(s);
    });
  };

  CP.extractPhotoColorsGrouped = function () {
    var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
    if (!cvs) return [];
    var groups = [];
    cvs.getObjects().forEach(function (obj) {
      if (obj.type !== 'image' || obj.isQR || obj._isChart || obj._isEffect) return;
      try {
        var el = obj._element || obj._originalElement;
        var sampleW = 50;
        var sampleH = 50;
        var offCanvas = document.createElement('canvas');
        offCanvas.width = sampleW;
        offCanvas.height = sampleH;
        var ctx = offCanvas.getContext('2d');
        if (el && el.naturalWidth > 0) ctx.drawImage(el, 0, 0, sampleW, sampleH);
        else if (typeof obj.toCanvasElement === 'function') ctx.drawImage(obj.toCanvasElement(), 0, 0, sampleW, sampleH);
        else return;

        var thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = 28;
        thumbCanvas.height = 28;
        var tCtx = thumbCanvas.getContext('2d');
        if (el && el.naturalWidth > 0) tCtx.drawImage(el, 0, 0, 28, 28);
        else tCtx.drawImage(offCanvas, 0, 0, 28, 28);
        var thumbUrl = thumbCanvas.toDataURL('image/jpeg', 0.5);

        var data = ctx.getImageData(0, 0, sampleW, sampleH).data;
        var opaqueCount = 0;
        var buckets = {};
        for (var i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) continue;
          opaqueCount++;
          var r = Math.min(Math.round(data[i] / 32) * 32, 255);
          var g = Math.min(Math.round(data[i + 1] / 32) * 32, 255);
          var b = Math.min(Math.round(data[i + 2] / 32) * 32, 255);
          var key = r + ',' + g + ',' + b;
          buckets[key] = (buckets[key] || 0) + 1;
        }

        var threshold = Math.max(opaqueCount * 0.02, 3);
        var imgColors = [];
        Object.keys(buckets).forEach(function (key) {
          if (buckets[key] < threshold) return;
          var parts = key.split(',').map(Number);
          imgColors.push({ hex: CP.rgbToHex(parts[0], parts[1], parts[2]), count: buckets[key] });
        });
        imgColors.sort(function (a, b) { return b.count - a.count; });
        var colors = imgColors.slice(0, 5).map(function (entry) { return entry.hex; });
        if (colors.length) groups.push({ thumb: thumbUrl, colors: colors });
      } catch (err) {}
    });
    return groups;
  };

  CP.renderPhotoColors = function () {
    var wrap = document.getElementById('cp-photo-colors');
    if (!wrap) return;
    var grouped = CP.extractPhotoColorsGrouped();
    wrap.innerHTML = '';
    if (!grouped.length) {
      wrap.innerHTML = '<span class="cp-empty-hint">No photos on canvas</span>';
      return;
    }
    grouped.forEach(function (group) {
      var row = document.createElement('div');
      row.className = 'cp-photo-row';
      var thumb = document.createElement('img');
      thumb.className = 'cp-photo-thumb';
      thumb.src = group.thumb;
      row.appendChild(thumb);
      group.colors.forEach(function (color) {
        var s = document.createElement('div');
        s.className = 'cp-swatch';
        s.style.background = color;
        if (color === '#ffffff') s.classList.add('cp-swatch-light');
        s.addEventListener('click', function () {
          if (CP._cpTab === 'gradient' && CP.canUseGradientTarget(CP._cpTarget)) CP.setGradientStopColor(CP.getSelectedStop().id, color);
          else {
            CP.setColorFromHex(color);
            CP.applyCurrentColor();
          }
        });
        row.appendChild(s);
      });
      wrap.appendChild(row);
    });
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'swatches', parent: 'shared.color-picker', title: 'Color Picker: swatches', mount: function () {}, unmount: function () {} });
  }
})();
