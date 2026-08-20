/* Module: left-panel/tools/barcode-tools/single — Single-barcode mode — preview, add-to-canvas, export, bindings.
   Part of the barcode-tools group (decomposed from the 1365-line IIFE). Functions hang off the
   shared namespace VBC (window.__ccBarcodeTools, created by the parent); cross-module refs resolve
   through VBC at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VBC = window.__ccBarcodeTools;
  if (!VBC) return;

  VBC._previewHtml = function () {
    var single = VBC._state.single;
    if (single.previewError) {
      return '<div class="barcode-preview-empty"><div class="barcode-preview-error">' + VBC._esc(single.previewError) + '</div></div>';
    }
    if (!single.previewDataUrl && !single.previewSvg) {
      return '<div class="barcode-preview-empty"><span>' + VBC._icon('scan', 16) + '</span><div>Preview appears here</div></div>';
    }
    if (single.previewDataUrl) {
      return '<div class="barcode-preview-art" style="transform:rotate(' + (parseInt(single.rotation, 10) || 0) + 'deg)"><img src="' + VBC._esc(single.previewDataUrl) + '" alt="Barcode preview"></div>';
    }
    return '<div class="barcode-preview-art" style="transform:rotate(' + (parseInt(single.rotation, 10) || 0) + 'deg)">' + single.previewSvg + '</div>';
  };

  VBC._setSinglePreview = function (result) {
    VBC._state.single.previewSvg = result.svg || '';
    VBC._state.single.previewDataUrl = result.dataUrl || '';
    VBC._state.single.previewError = result.error || '';
    VBC._saveState();
    var frame = document.getElementById('barcode-preview-frame');
    if (frame) frame.innerHTML = VBC._previewHtml();
    var err = document.getElementById('barcode-single-error');
    if (err) {
      err.textContent = VBC._state.single.previewError || '';
      err.style.display = VBC._state.single.previewError ? '' : 'none';
    }
  };

  VBC._setSizeReadout = function (rc) {
    var el = document.getElementById('bc-size-out');
    if (!el) return;
    if (!rc || !rc.width) { el.textContent = '—'; return; }
    // bwip renders at device px; approximate physical size at 96dpi for the readout
    el.textContent = Math.round(rc.width / 96 * 25.4) + '×' + Math.round(rc.height / 96 * 25.4) + 'mm';
  };

  VBC.generateBarcodePreview = function () {
    var validation = VBC._validateBarcode(VBC._state.single.type, VBC._state.single.value);
    var valid = !!(VBC._state.single.value && validation.ok);
    // keep the custom symbology row label in sync with the active type
    var sl = document.getElementById('bc-sel-label');
    if (sl) sl.textContent = VBC._barcodeMeta(VBC._state.single.type).label;
    // validation row + the inline check inside the value field
    var vs = document.getElementById('barcode-valid-status');
    if (vs) {
      if (valid) {
        vs.className = 'bc-valid bc-valid-ok';
        vs.innerHTML = VBC._icon('circle-check', 13) + ' Valid' + (VBC._needsCheckDigit(VBC._state.single.type, VBC._state.single.value) ? ' · check digit auto-added' : '');
      } else { vs.className = 'bc-valid'; vs.innerHTML = ''; }
    }
    var vc = document.getElementById('barcode-vcheck');
    if (vc) {
      vc.innerHTML = valid ? VBC._icon('circle-check', 16) : '';
      if (vc.parentElement) vc.parentElement.className = 'bc-vwrap' + (valid ? ' bc-vwrap-ok' : '');
    }
    if (!validation.ok) {
      VBC._setSinglePreview({ error: validation.message });
      VBC._setSizeReadout(null);
      return null;
    }
    try {
      var rc = VBC._renderBarcodeCanvas(VBC._state.single);
      var dataUrl = rc.toDataURL('image/png');
      VBC._setSinglePreview({ dataUrl: dataUrl });
      VBC._setSizeReadout(rc);
      return dataUrl;
    } catch (e) {
      VBC._setSinglePreview({ error: e && e.message ? e.message : 'Could not generate barcode preview.' });
      VBC._setSizeReadout(null);
      return null;
    }
  };

  VBC._getCanvasCenterSafe = function () {
    if (typeof getCanvasCenter === 'function') return getCanvasCenter();
    return { x: Math.round((typeof CW !== 'undefined' ? CW : 1000) / 2), y: Math.round((typeof CH !== 'undefined' ? CH : 1000) / 2) };
  };

  VBC._pushHistoryEntry = function (value, type) {
    VBC._state.history = VBC._state.history || [];
    VBC._state.history.unshift({ value: value, type: type, ts: Date.now() });
    VBC._state.history = VBC._state.history.slice(0, 12);
    VBC._saveState();
  };

  VBC.addBarcodeToCanvas = function (customOpts, done) {
    var opts = VBC._mergeDeep(VBC._clone(VBC._state.single), customOpts || {});
    var validation = VBC._validateBarcode(opts.type, opts.value);
    if (!validation.ok) {
      if (typeof showToast === 'function') showToast(validation.message, 'error');
      if (typeof done === 'function') done(false);
      return;
    }
    try {
      VBC._renderBarcodeCanvas(opts);
    } catch (e) {
      if (typeof showToast === 'function') showToast(e && e.message ? e.message : 'Could not generate barcode.', 'error');
      if (typeof done === 'function') done(false);
      return;
    }
    VBC._buildBarcodeFabricObject(opts, function (err, img) {
      if (err || !img) {
        if (typeof showToast === 'function') showToast('Could not insert barcode.', 'error');
        if (typeof done === 'function') done(false);
        return;
      }
      var center = VBC._getCanvasCenterSafe();
      var targetWidth = Math.min(Math.max(140, (typeof CW !== 'undefined' ? CW : 1000) * 0.36), 280);
      img.set({
        left: center.x - (targetWidth / 2),
        top: center.y - ((Math.min(targetWidth * 0.42, 120)) / 2),
        angle: parseInt(opts.rotation, 10) || 0,
        _ccType: 'barcode',
        _barcodeType: VBC._normalizeBcid(opts.type),
        _barcodeValue: validation.value,
        _barcodeHumanReadable: opts.humanReadable !== false,
        _barcodeSource: opts._source || 'single',
        _barcodeRowIndex: opts._rowIndex != null ? opts._rowIndex : null,
        _barcodeLineColor: opts.lineColor || '#111111',
        _barcodeBackgroundColor: opts.backgroundColor || '#ffffff'
      });
      img.scaleToWidth(targetWidth);
      canvas.add(img);
      canvas.setActiveObject(img);
      canvas.renderAll();
      if (typeof snap === 'function') snap();
      if (typeof refreshStructure === 'function') refreshStructure();
      VBC._pushHistoryEntry(validation.value, VBC._normalizeBcid(opts.type));
      if (typeof showToast === 'function') showToast('Barcode added to canvas');
      if (typeof done === 'function') done(true, img);
    });
  };

  VBC._syncSingleStateFromInputs = function () {
    var ids = {
      type: 'barcode-type',
      value: 'barcode-value',
      lineColor: 'barcode-line-color',
      backgroundColor: 'barcode-bg-color',
      width: 'barcode-width',
      height: 'barcode-height',
      padding: 'barcode-padding',
      scale: 'barcode-scale',
      rotation: 'barcode-rotation',
      outputMode: 'barcode-output-mode'
    };
    var key;
    for (key in ids) {
      var el = document.getElementById(ids[key]);
      if (el) VBC._state.single[key] = el.value;
    }
    VBC._state.single.humanReadable = !!((document.getElementById('barcode-human-readable') || {}).checked);
    VBC._state.single.createFieldAware = !!((document.getElementById('barcode-field-aware') || {}).checked);
    VBC._state.single.transparentBackground = !!((document.getElementById('barcode-transparent-bg') || {}).checked);
    VBC._state.single.autoFitFrame = !!((document.getElementById('barcode-fit-frame') || {}).checked);
    VBC._state.single.snapCenter = !!((document.getElementById('barcode-snap-center') || {}).checked);
    VBC._saveState();
  };

  VBC._bindSingleMode = function () {
    var previewBtn = document.getElementById('barcode-preview-btn');
    var addBtn = document.getElementById('barcode-add-btn');
    var liveIds = [
      'barcode-type', 'barcode-value', 'barcode-line-color', 'barcode-bg-color',
      'barcode-width', 'barcode-height', 'barcode-padding', 'barcode-scale', 'barcode-rotation',
      'barcode-output-mode', 'barcode-human-readable', 'barcode-field-aware',
      'barcode-transparent-bg', 'barcode-fit-frame', 'barcode-snap-center'
    ];
    var debounceTimer = 0;
    liveIds.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', function () {
        VBC._syncSingleStateFromInputs();
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(VBC.generateBarcodePreview, 240);
      });
      el.addEventListener('change', function () {
        VBC._syncSingleStateFromInputs();
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(VBC.generateBarcodePreview, 240);
      });
    });
    if (previewBtn) previewBtn.addEventListener('click', function () {
      VBC._syncSingleStateFromInputs();
      VBC.generateBarcodePreview();
    });
    if (addBtn) addBtn.addEventListener('click', function () {
      VBC._syncSingleStateFromInputs();
      VBC.addBarcodeToCanvas();
    });
    VBC.generateBarcodePreview();
  };

  VBC._singleMarkup = function () {
    var s = VBC._state.single;
    var isSquare = VBC._isSquareMatrixBcid(VBC._normalizeBcid(s.type));
    var meta = VBC._barcodeMeta(s.type);
    var vr = VBC._validateBarcode(s.type, s.value);
    var grp = String(meta.group || '1D').split(' ')[0];
    var valid = !!(s.value && vr.ok);
    var validHtml = valid ? (VBC._icon('circle-check', 13) + ' Valid' + (VBC._needsCheckDigit(s.type, s.value) ? ' · check digit auto-added' : '')) : '';
    var lineC = VBC._esc(s.lineColor || '#111111'), bgC = VBC._esc(s.backgroundColor || '#ffffff');
    return '<div class="bc-single">' +
      '<div class="bc-preview"><div class="barcode-preview-frame" id="barcode-preview-frame">' + VBC._previewHtml() + '</div></div>' +
      '<div class="bc-readout">' +
        '<span class="bc-rchip">Size <b id="bc-size-out">—</b></span>' +
        '<span class="bc-rchip">Out <b>' + (s.outputMode === 'vector' ? 'SVG·300' : 'PNG') + '</b></span>' +
        '<button type="button" class="bc-rbtn" id="barcode-regen-btn" title="Regenerate">' + VBC._icon('refresh-cw', 14) + '</button>' +
      '</div>' +
      '<div class="barcode-inline-error" id="barcode-single-error"' + (s.previewError ? '' : ' style="display:none"') + '>' + VBC._esc(s.previewError || '') + '</div>' +
      '<div class="bc-selrow">' + VBC._icon('barcode', 16) + '<span class="bc-sel-label" id="bc-sel-label">' + VBC._esc(meta.label) + '</span><span class="bc-sel-hint">' + grp + ' ·' + VBC._barcodeTypes().length + '</span><span class="bc-sel-arr">' + VBC._icon('chevron-down', 15) + '</span>' +
        '<select class="bc-sel-native" id="barcode-type">' + VBC._bcTypeOptions() + '</select></div>' +
      '<div class="bc-vwrap' + (valid ? ' bc-vwrap-ok' : '') + '"><input class="bc-input" id="barcode-value" value="' + VBC._esc(s.value) + '" placeholder="' + VBC._esc(meta.placeholder) + '"><span class="bc-vcheck" id="barcode-vcheck">' + (valid ? VBC._icon('circle-check', 16) : '') + '</span></div>' +
      '<div class="bc-valid' + (valid ? ' bc-valid-ok' : '') + '" id="barcode-valid-status">' + validHtml + '</div>' +
      VBC._bcAcc('ruler', 'Size &amp; scale', true,
        isSquare
          ? '<div class="bc-grid2">' + VBC._bcField2('barcode-scale', 'Module size', 2, 12, 1, s.scale) + VBC._bcField2('barcode-padding', 'Quiet zone', 0, 40, 1, s.padding) + '</div>'
          : '<div class="bc-grid2">' + VBC._bcField2('barcode-height', 'Height', 8, 120, 1, s.height) + VBC._bcField2('barcode-padding', 'Quiet zone', 0, 40, 1, s.padding) + '</div>'
      ) +
      VBC._bcAccColors(lineC, bgC) +
      VBC._bcAcc('type', 'Human-readable text', false,
        '<label class="bc-check"><input type="checkbox" id="barcode-human-readable"' + (s.humanReadable ? ' checked' : '') + '><span>Show text under the bars</span></label>'
      ) +
      VBC._bcAccHint('settings-2', 'Advanced', isSquare ? 'ECC · quiet' : 'scale · rotation',
        // Quiet zone lives in Size & scale; here we expose scale (1D only), rotation
        // and the output format. ('width' is intentionally never exposed — see VBC._buildBwipOptions.)
        (isSquare
          ? '<div class="bc-grid2">' + VBC._bcField2('barcode-rotation', 'Rotation', -180, 180, 5, s.rotation) +
              '<label class="bc-fld"><span class="bc-flbl">Output</span><select class="bc-input" id="barcode-output-mode"><option value="vector"' + (s.outputMode === 'vector' ? ' selected' : '') + '>SVG</option><option value="raster"' + (s.outputMode === 'raster' ? ' selected' : '') + '>PNG</option></select></label></div>'
          : '<div class="bc-grid2">' + VBC._bcField2('barcode-scale', 'Scale', 1, 8, 1, s.scale) + VBC._bcField2('barcode-rotation', 'Rotation', -180, 180, 5, s.rotation) + '</div>' +
              '<label class="bc-fld"><span class="bc-flbl">Output</span><select class="bc-input" id="barcode-output-mode"><option value="vector"' + (s.outputMode === 'vector' ? ' selected' : '') + '>SVG</option><option value="raster"' + (s.outputMode === 'raster' ? ' selected' : '') + '>PNG</option></select></label>'
        ) +
        '<label class="bc-check"><input type="checkbox" id="barcode-transparent-bg"' + (s.transparentBackground ? ' checked' : '') + '><span>Transparent background</span></label>'
      ) +
      VBC._bcAcc('layout-grid', 'Placement', false,
        '<label class="bc-check"><input type="checkbox" id="barcode-fit-frame"' + (s.autoFitFrame ? ' checked' : '') + '><span>Fit to selected frame</span></label>' +
        '<label class="bc-check"><input type="checkbox" id="barcode-field-aware"' + (s.createFieldAware ? ' checked' : '') + '><span>Field-aware object</span></label>' +
        '<label class="bc-check"><input type="checkbox" id="barcode-snap-center"' + (s.snapCenter ? ' checked' : '') + '><span>Snap to center after insert</span></label>'
      ) +
      '<button type="button" class="bc-btn-primary" id="barcode-add-btn">' + VBC._icon('plus', 15) + ' Add to canvas</button>' +
      '<div class="bc-btn-row">' +
        '<button type="button" class="bc-btn" id="barcode-preview-btn">' + VBC._icon('refresh-cw', 14) + ' Generate</button>' +
        '<div class="bc-export-wrap">' +
          '<button type="button" class="bc-btn bc-export-toggle" id="barcode-export-btn" aria-haspopup="true" aria-expanded="false">' + VBC._icon('download', 14) + ' Export' + VBC._icon('chevron-down', 13) + '</button>' +
          '<div class="bc-export-menu" id="barcode-export-menu" hidden>' +
            '<button type="button" class="bc-export-item" data-fmt="png">' + VBC._icon('image', 14) + ' PNG image</button>' +
            '<button type="button" class="bc-export-item" data-fmt="svg">' + VBC._icon('shapes', 14) + ' SVG vector</button>' +
            '<button type="button" class="bc-export-item" data-fmt="pdf">' + VBC._icon('file-text', 14) + ' PDF document</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  };

  VBC._renderBarcodeSvg = function (opts) {
    if (typeof bwipjs === 'undefined' || !bwipjs || typeof bwipjs.toSVG !== 'function') {
      throw new Error('SVG renderer is not available.');
    }
    return VBC._normalizeSvg(bwipjs.toSVG(VBC._buildBwipOptions(opts)));
  };

  VBC._bcDownloadBlob = function (blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  };

  VBC._exportBarcode = function (format) {
    var s = VBC._state.single;
    var validation = VBC._validateBarcode(s.type, s.value);
    if (!validation.ok) {
      if (typeof showToast === 'function') showToast(validation.message || 'Enter a valid value first', 'error');
      return;
    }
    var base = 'barcode-' + (String(s.value || 'code').replace(/[^\w-]/g, '') || 'code');
    try {
      if (format === 'svg') {
        VBC._bcDownloadBlob(new Blob([VBC._renderBarcodeSvg(s)], { type: 'image/svg+xml' }), base + '.svg');
      } else if (format === 'pdf') {
        var PDF = (typeof jspdf !== 'undefined' && jspdf.jsPDF) ? jspdf.jsPDF : (typeof jsPDF !== 'undefined' ? jsPDF : null);
        if (!PDF) throw new Error('PDF library is not available.');
        var probe = VBC._renderBarcodeCanvas(s);          // physical size reference (user scale)
        var hi = VBC._renderBarcodeHiRes(s, 2400);         // high-res pixels embedded at that size
        var pxToMm = 25.4 / 96, pad = 6;
        var wmm = Math.max(10, probe.width * pxToMm), hmm = Math.max(10, probe.height * pxToMm);
        var doc = new PDF({ orientation: wmm >= hmm ? 'l' : 'p', unit: 'mm', format: [wmm + pad * 2, hmm + pad * 2] });
        doc.addImage(hi.toDataURL('image/png'), 'PNG', pad, pad, wmm, hmm);
        doc.save(base + '.pdf');
      } else {
        var a = document.createElement('a');
        a.href = VBC._renderBarcodeHiRes(s, 2400).toDataURL('image/png');
        a.download = base + '.png'; a.click();
      }
      if (typeof showToast === 'function') showToast(String(format).toUpperCase() + ' exported');
    } catch (e) {
      if (typeof showToast === 'function') showToast(e && e.message ? e.message : 'Export failed', 'error');
    }
  };

  VBC._bindSingleExtras = function () {
    var regen = document.getElementById('barcode-regen-btn');
    if (regen) regen.addEventListener('click', function () { if (typeof VBC.generateBarcodePreview === 'function') VBC.generateBarcodePreview(); });

    // Re-render the single panel when the symbology changes so per-type controls
    // (e.g. the square-matrix "Module size" vs 1D "Module/Height" fields) update.
    var typeSel = document.getElementById('barcode-type');
    if (typeSel) typeSel.addEventListener('change', function () {
      VBC._state.single.type = this.value;
      VBC._saveState();
      var content = VBC._panelEl || document.getElementById('images-sub-content');
      if (content) VBC.renderBarcodeToolPanel(content);
    });

    var toggle = document.getElementById('barcode-export-btn');
    var menu = document.getElementById('barcode-export-menu');
    // Drop any document-level closer from a previous render so they don't pile up.
    if (VBC._bcExportCloser) { document.removeEventListener('click', VBC._bcExportCloser); document.removeEventListener('keydown', VBC._bcExportKey); VBC._bcExportCloser = VBC._bcExportKey = null; }
    if (toggle && menu) {
      function closeMenu() { menu.setAttribute('hidden', ''); toggle.classList.remove('bc-open'); toggle.setAttribute('aria-expanded', 'false'); }
      toggle.addEventListener('click', function (e) {
        e.stopPropagation();
        if (menu.hasAttribute('hidden')) { menu.removeAttribute('hidden'); toggle.classList.add('bc-open'); toggle.setAttribute('aria-expanded', 'true'); }
        else closeMenu();
      });
      menu.querySelectorAll('.bc-export-item').forEach(function (item) {
        item.addEventListener('click', function (e) {
          e.stopPropagation();
          closeMenu();
          VBC._exportBarcode(this.getAttribute('data-fmt'));
        });
      });
      VBC._bcExportCloser = function () { closeMenu(); };
      VBC._bcExportKey = function (e) { if (e.key === 'Escape') closeMenu(); };
      document.addEventListener('click', VBC._bcExportCloser);
      document.addEventListener('keydown', VBC._bcExportKey);
    }
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'single', parent: 'left-panel.tools.barcode-tools', title: 'barcode-tools: single', mount: function () {}, unmount: function () {} });
  }
})();
