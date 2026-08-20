/* Module: canvas/tools/selection-tools/refine — Refine-edge — smooth/feather/contrast/shift + the floating panel.
   Part of the selection-tools group (decomposed from the 1542-line IIFE). Functions hang off the
   shared namespace VST (window.__ccSelectionTools, created by the parent); cross-module refs resolve
   through VST at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VST = window.__ccSelectionTools;
  if (!VST) return;

  VST._reRefine = function (mask, w, h, smooth, feather, contrast, shift) {
    // Binary → float
    var f = new Float32Array(w * h);
    for (var i = 0; i < w * h; i++) f[i] = mask[i] ? 1.0 : 0.0;

    // 1. Smooth (Gaussian blur on mask)
    if (smooth > 0) f = VST._reGaussBlur(f, w, h, smooth);

    // 2. Feather (second lighter Gaussian)
    if (feather > 0) f = VST._reGaussBlur(f, w, h, feather * 0.7);

    // 3. Contrast (sigmoid re-tightening)
    if (contrast > 0) {
      var k = 1 + contrast * 0.12; // strength multiplier
      for (var i = 0; i < w * h; i++) {
        var v = f[i] - 0.5;
        v = 0.5 + v * k;
        f[i] = v < 0 ? 0 : v > 1 ? 1 : v;
      }
    }

    // 4. Shift edge (erode/dilate via distance offset)
    if (shift !== 0) f = VST._reShiftEdge(f, w, h, shift);

    return f;
  };

  VST._reGaussBlur = function (src, w, h, radius) {
    var r = Math.ceil(radius * 2.5);
    if (r < 1) return src;
    var kernel = new Float32Array(r * 2 + 1);
    var sum = 0, sigma = radius;
    for (var i = -r; i <= r; i++) {
      var v = Math.exp(-(i * i) / (2 * sigma * sigma));
      kernel[i + r] = v;
      sum += v;
    }
    for (var i = 0; i < kernel.length; i++) kernel[i] /= sum;

    // Horizontal pass
    var tmp = new Float32Array(w * h);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var acc = 0;
        for (var k = -r; k <= r; k++) {
          var sx = x + k;
          if (sx < 0) sx = 0; else if (sx >= w) sx = w - 1;
          acc += src[y * w + sx] * kernel[k + r];
        }
        tmp[y * w + x] = acc;
      }
    }
    // Vertical pass
    var dst = new Float32Array(w * h);
    for (var x = 0; x < w; x++) {
      for (var y = 0; y < h; y++) {
        var acc = 0;
        for (var k = -r; k <= r; k++) {
          var sy = y + k;
          if (sy < 0) sy = 0; else if (sy >= h) sy = h - 1;
          acc += tmp[sy * w + x] * kernel[k + r];
        }
        dst[y * w + x] = acc;
      }
    }
    return dst;
  };

  VST._reShiftEdge = function (f, w, h, shift) {
    var abs = Math.abs(shift), inward = shift < 0;
    var threshold = inward ? (0.5 + abs * 0.08) : (0.5 - abs * 0.08);
    threshold = Math.max(0.05, Math.min(0.95, threshold));
    // Apply threshold shift via remapping
    var out = new Float32Array(w * h);
    for (var i = 0; i < w * h; i++) {
      if (inward) {
        out[i] = f[i] > threshold ? ((f[i] - threshold) / (1 - threshold)) : 0;
      } else {
        out[i] = f[i] < threshold ? (f[i] / threshold) : 1;
      }
    }
    return out;
  };

  VST._reChaikin = function (pts, iterations) {
    if (!pts || pts.length < 3) return pts;
    var result = pts;
    for (var n = 0; n < iterations; n++) {
      var next = [];
      for (var i = 0; i < result.length; i++) {
        var p0 = result[i];
        var p1 = result[(i + 1) % result.length];
        next.push({ x: 0.75 * p0.x + 0.25 * p1.x, y: 0.75 * p0.y + 0.25 * p1.y });
        next.push({ x: 0.25 * p0.x + 0.75 * p1.x, y: 0.25 * p0.y + 0.75 * p1.y });
      }
      result = next;
    }
    return result;
  };

  VST._reShowPanel = function () {
    if (VST._rePanel) { VST._rePanel.style.display = 'block'; VST._rePreview(); return; }
    VST._rePanel = document.createElement('div');
    VST._rePanel.className = 'qs-refine-panel';
    VST._rePanel.innerHTML =
      '<div class="qs-refine-title">Refine Edge</div>' +
      VST._reSliderHTML('re-smooth',   'Smooth',   0, 10, VST._reSmooth) +
      VST._reSliderHTML('re-feather',  'Feather',  0, 10, VST._reFeather) +
      VST._reSliderHTML('re-contrast', 'Contrast', 0, 100, VST._reContrast) +
      VST._reSliderHTML('re-shift',    'Shift Edge', -10, 10, VST._reShift) +
      '<div style="display:flex;gap:6px;margin-top:10px;justify-content:flex-end">' +
        '<button class="qs-refine-btn" onclick="VST._reReset()">Reset</button>' +
        '<button class="qs-refine-btn qs-refine-ok" onclick="VST._reClose()">OK</button>' +
      '</div>';
    document.body.appendChild(VST._rePanel);
    VST._rePreview();
  };

  VST._reSliderHTML = function (id, label, min, max, val) {
    return '<label class="qs-refine-row">' +
      '<span class="qs-refine-lbl">' + label + '</span>' +
      '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" value="' + val + '" ' +
      'class="qs-refine-slider" oninput="VST._reOnSlider(\'' + id + '\',+this.value)">' +
      '<span id="' + id + '-val" class="qs-refine-val">' + val + '</span>' +
    '</label>';
  };

  VST._rePreview = function () {
    if (!VST._qsActive || !VST._qsMask) return;
    var refined = VST._reRefine(VST._qsMask, VST._qsW, VST._qsH, VST._reSmooth, VST._reFeather, VST._reContrast, VST._reShift);
    // Render soft overlay from refined float mask
    var w = VST._qsW, h = VST._qsH;
    VST._qsOffCtx.clearRect(0, 0, w, h);
    var id = VST._qsOffCtx.createImageData(w, h), od = id.data;
    for (var i = 0; i < w * h; i++) {
      var a = refined[i];
      if (a < 0.01) continue;
      // Detect border pixels (where alpha changes significantly)
      var x = i % w, y = (i / w) | 0;
      var isEdge = false;
      if (x > 0 && x < w - 1 && y > 0 && y < h - 1) {
        var da = Math.abs(refined[i] - refined[i - 1]) + Math.abs(refined[i] - refined[i + 1]) +
                 Math.abs(refined[i] - refined[i - w]) + Math.abs(refined[i] - refined[i + w]);
        isEdge = da > 0.3;
      } else { isEdge = true; }
      if (isEdge) {
        od[i * 4] = 255; od[i * 4 + 1] = 199; od[i * 4 + 2] = 234;
        od[i * 4 + 3] = Math.round(a * 210);
      } else {
        od[i * 4] = 255; od[i * 4 + 1] = 120; od[i * 4 + 2] = 220;
        od[i * 4 + 3] = Math.round(a * 55);
      }
    }
    VST._qsOffCtx.putImageData(id, 0, 0);
    var b = VST._qsImg.getBoundingRect(true);
    if (VST._qsOverlay) {
      VST._qsOverlay.setElement(VST._qsOffCvs);
      VST._qsOverlay.set({ left: b.left, top: b.top, scaleX: b.width / w, scaleY: b.height / h });
      VST._qsOverlay.dirty = true;
    }
    VST._getCvs().renderAll();
  };

  VST._reHidePanel = function () { if (VST._rePanel) VST._rePanel.style.display = 'none'; }

  VST._reOnSlider = function (id, val) {
    if (id === 're-smooth')   VST._reSmooth   = val;
    if (id === 're-feather')  VST._reFeather  = val;
    if (id === 're-contrast') VST._reContrast = val;
    if (id === 're-shift')    VST._reShift    = val;
    var sp = document.getElementById(id + '-val');
    if (sp) sp.textContent = val;
    VST._rePreview();
  };

  VST._reReset = function () {
    VST._reSmooth = 3; VST._reFeather = 1; VST._reContrast = 30; VST._reShift = 0;
    ['re-smooth','re-feather','re-contrast','re-shift'].forEach(function(id) {
      var sl = document.getElementById(id);
      var sp = document.getElementById(id + '-val');
      var defs = { 're-smooth': 3, 're-feather': 1, 're-contrast': 30, 're-shift': 0 };
      if (sl) sl.value = defs[id];
      if (sp) sp.textContent = defs[id];
    });
    VST._rePreview();
  };

  VST._reClose = function () { VST._reHidePanel(); };

  VST._reOpen = function () { if (VST._qsActive) VST._reShowPanel(); };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'refine', parent: 'canvas.tools.selection-tools', title: 'selection-tools: refine', mount: function () {}, unmount: function () {} });
  }
})();
