/* Module: left-panel/tools/barcode-tools/panel — Panel shell — markup, history, sequence mode, render/update/sync.
   Part of the barcode-tools group (decomposed from the 1365-line IIFE). Functions hang off the
   shared namespace VBC (window.__ccBarcodeTools, created by the parent); cross-module refs resolve
   through VBC at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VBC = window.__ccBarcodeTools;
  if (!VBC) return;

  VBC._renderHistory = function () {
    var wrap = document.getElementById('barcode-history-list');
    if (!wrap) return;
    var items = VBC._state.history || [];
    if (!items.length) {
      wrap.innerHTML = '<div class="barcode-empty-copy">No barcode history yet.</div>';
      return;
    }
    var html = '';
    items.forEach(function (item) {
      html += '<button type="button" class="barcode-history-item" data-history-type="' + VBC._esc(item.type) + '" data-history-value="' + VBC._esc(item.value) + '">' +
        '<div class="barcode-history-main">' + VBC._esc(item.value) + '</div>' +
        '<div class="barcode-history-meta">' + VBC._esc(item.type.toUpperCase()) + ' · ' + new Date(item.ts).toLocaleDateString() + '</div>' +
      '</button>';
    });
    wrap.innerHTML = html;
    wrap.querySelectorAll('.barcode-history-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        VBC._state.mode = 'single';
        VBC._state.single.type = this.getAttribute('data-history-type');
        VBC._state.single.value = this.getAttribute('data-history-value');
        VBC._saveState();
        var content = VBC._panelEl || document.getElementById('images-sub-content');
        if (content) VBC.renderBarcodeToolPanel(content);
      });
    });
  };

  VBC._bcAcc = function (icon, title, open, body) {
    return '<div class="bc-acc' + (open ? ' bc-open' : '') + '"><button type="button" class="bc-acc-head" onclick="this.parentElement.classList.toggle(\'bc-open\')">' +
      VBC._icon(icon, 15) + '<span class="bc-acc-t">' + title + '</span><span class="bc-acc-arr">' + VBC._icon('chevron-down', 15) + '</span></button>' +
      '<div class="bc-acc-body">' + body + '</div></div>';
  };

  VBC._bcAccHint = function (icon, title, hint, body) {
    return '<div class="bc-acc"><button type="button" class="bc-acc-head" onclick="this.parentElement.classList.toggle(\'bc-open\')">' +
      VBC._icon(icon, 15) + '<span class="bc-acc-t">' + title + '</span><span class="bc-acc-hint">' + hint + '</span><span class="bc-acc-arr">' + VBC._icon('chevron-down', 15) + '</span></button>' +
      '<div class="bc-acc-body">' + body + '</div></div>';
  };

  VBC._bcAccColors = function (lineC, bgC) {
    return '<div class="bc-acc"><button type="button" class="bc-acc-head" onclick="this.parentElement.classList.toggle(\'bc-open\')">' +
      VBC._icon('palette', 15) + '<span class="bc-acc-t">Colors</span><span class="bc-sw-prev"><span class="bc-sw" style="background:' + lineC + '"></span><span class="bc-sw" style="background:' + bgC + '"></span></span></button>' +
      '<div class="bc-acc-body"><div class="bc-grid2">' +
        '<label class="bc-fld"><span class="bc-flbl">Line</span><input type="color" class="bc-color" id="barcode-line-color" value="' + lineC + '"></label>' +
        '<label class="bc-fld"><span class="bc-flbl">Background</span><input type="color" class="bc-color" id="barcode-bg-color" value="' + bgC + '"></label>' +
      '</div></div></div>';
  };

  VBC._bcField2 = function (id, label, min, max, step, val) {
    return '<label class="bc-fld"><span class="bc-flbl">' + label + '</span><input class="bc-input bc-num" id="' + id + '" type="number" min="' + min + '" max="' + max + '" step="' + step + '" value="' + VBC._esc(val) + '"></label>';
  };

  VBC._bcTypeOptions = function () {
    var s = VBC._state.single, order = [], byGroup = {};
    VBC._barcodeTypes().forEach(function (t) {
      var g = t.group || 'Other';
      if (!byGroup[g]) { byGroup[g] = []; order.push(g); }
      byGroup[g].push(t);
    });
    return order.map(function (g) {
      return '<optgroup label="' + g + '">' + byGroup[g].map(function (t) {
        return '<option value="' + t.id + '"' + (t.id === s.type ? ' selected' : '') + '>' + t.label + '</option>';
      }).join('') + '</optgroup>';
    }).join('');
  };

  VBC._historyMarkup = function () {
    return '<div class="barcode-tool-panel"><p class="barcode-copy">Reuse recent barcode values without rebuilding the panel settings.</p><div id="barcode-history-list"></div></div>';
  };

  VBC._sequenceMarkup = function () {
    var sq = VBC._state.sequence || {};
    return '<div class="bc-single">' +
      '<div class="bc-readout"><span class="bc-rchip">' + VBC._icon('list-ordered', 13) + ' Serial / batch generator</span></div>' +
      '<label class="bc-fld"><span class="bc-flbl">Symbology</span><select class="bc-input" id="barcode-seq-type">' + VBC._bcTypeOptions() + '</select></label>' +
      '<div class="bc-grid2">' +
        '<label class="bc-fld"><span class="bc-flbl">Prefix</span><input class="bc-input" id="barcode-seq-prefix" value="' + VBC._esc(sq.prefix || '') + '" placeholder="INV-"></label>' +
        '<label class="bc-fld"><span class="bc-flbl">Suffix</span><input class="bc-input" id="barcode-seq-suffix" value="' + VBC._esc(sq.suffix || '') + '" placeholder="-26"></label>' +
      '</div>' +
      '<div class="bc-grid2">' +
        VBC._bcField2('barcode-seq-start', 'Start', 0, 9999999, 1, sq.start != null ? sq.start : 1) +
        VBC._bcField2('barcode-seq-step', 'Step', 1, 1000, 1, sq.step || 1) +
      '</div>' +
      '<div class="bc-grid2">' +
        VBC._bcField2('barcode-seq-count', 'Count', 1, 100, 1, sq.count || 10) +
        VBC._bcField2('barcode-seq-pad', 'Zero-pad', 0, 12, 1, sq.pad != null ? sq.pad : 4) +
      '</div>' +
      '<label class="bc-fld"><span class="bc-flbl">Preview</span><div class="bc-seq-preview" id="barcode-seq-preview"></div></label>' +
      '<button type="button" class="bc-btn-primary" id="barcode-seq-generate">' + VBC._icon('plus', 15) + ' Generate sequence</button>' +
    '</div>';
  };

  VBC._bindSequenceMode = function () {
    function _v(id) { var el = document.getElementById(id); return el ? el.value : ''; }
    function _values() {
      var start = parseInt(_v('barcode-seq-start'), 10); if (isNaN(start)) start = 1;
      var step = parseInt(_v('barcode-seq-step'), 10) || 1;
      var count = Math.min(100, Math.max(1, parseInt(_v('barcode-seq-count'), 10) || 1));
      var pad = parseInt(_v('barcode-seq-pad'), 10) || 0;
      var prefix = _v('barcode-seq-prefix'), suffix = _v('barcode-seq-suffix');
      var out = [];
      for (var i = 0; i < count; i++) {
        var n = start + i * step, neg = n < 0, ns = String(Math.abs(n));
        while (ns.length < pad) ns = '0' + ns;
        out.push(prefix + (neg ? '-' : '') + ns + suffix);
      }
      return out;
    }
    function _render() {
      var box = document.getElementById('barcode-seq-preview'); if (!box) return;
      var v = _values();
      box.innerHTML = v.slice(0, 4).map(function (x) { return '<code>' + VBC._esc(x) + '</code>'; }).join('') + (v.length > 4 ? '<span class="bc-seq-more">+' + (v.length - 4) + ' more</span>' : '');
      VBC._state.sequence = { prefix: _v('barcode-seq-prefix'), suffix: _v('barcode-seq-suffix'), start: parseInt(_v('barcode-seq-start'), 10) || 1, step: parseInt(_v('barcode-seq-step'), 10) || 1, count: parseInt(_v('barcode-seq-count'), 10) || 10, pad: parseInt(_v('barcode-seq-pad'), 10) || 0 };
      VBC._saveState();
    }
    ['barcode-seq-prefix', 'barcode-seq-suffix', 'barcode-seq-start', 'barcode-seq-step', 'barcode-seq-count', 'barcode-seq-pad'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.addEventListener('input', _render);
    });
    _render();
    var gen = document.getElementById('barcode-seq-generate');
    if (gen) gen.addEventListener('click', function () {
      var type = _v('barcode-seq-type') || VBC._state.single.type;
      var list = _values(), i = 0;
      function next() {
        if (i >= list.length) { if (typeof showToast === 'function') showToast(list.length + ' barcodes added'); return; }
        var idx = i;
        VBC.addBarcodeToCanvas({ type: type, value: list[idx], _source: 'sequence', _rowIndex: idx }, function () {
          var c = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : (typeof canvas !== 'undefined' ? canvas : null);
          var ob = c && c.getActiveObject && c.getActiveObject();
          if (ob && ob.set) { try { ob.set({ left: (ob.left || 0) + (idx % 5) * 10, top: (ob.top || 0) + Math.floor(idx) * 8 }); ob.setCoords && ob.setCoords(); c.requestRenderAll && c.requestRenderAll(); } catch (e) {} }
          i++; setTimeout(next, 0);
        });
      }
      next();
    });
  };

  VBC.renderBarcodeToolPanel = function (contentEl) {
    if (!contentEl) return;
    // Preload bwip-js (~1MB) when the barcode panel opens — removed from index.html boot (editor-perf B3).
    // Fire-and-forget: arrives during the user's setup gap, before the sync renderer (core.js _renderBarcodeCanvas).
    if (window.cc && cc.requireLib) cc.requireLib('js/vendor/bwip-js-min.js').catch(function () {});
    VBC._panelEl = contentEl;
    var tabs = [
      { id: 'single', label: 'Single' },
      { id: 'sequence', label: 'Sequence' },
      { id: 'bulk', label: 'Bulk' },
      { id: 'history', label: 'History' }
    ];
    var html = '<div class="bc-studio">' +
      '<div class="bc-head">' + VBC._icon('barcode', 18) + '<span class="bc-head-t">Barcode studio</span><span class="bc-badge">enterprise</span></div>' +
      '<div class="bc-tabs">';
    tabs.forEach(function (tab) {
      html += '<button type="button" class="bc-tab' + (VBC._state.mode === tab.id ? ' active' : '') + '" data-bc-mode="' + tab.id + '">' + tab.label + '</button>';
    });
    html += '</div>';
    if (VBC._state.mode === 'sequence') html += VBC._sequenceMarkup();
    else if (VBC._state.mode === 'bulk') html += VBC._bulkMarkup();
    else if (VBC._state.mode === 'history') html += VBC._historyMarkup();
    else html += VBC._singleMarkup();
    html += '</div>';
    contentEl.innerHTML = html;
    contentEl.querySelectorAll('[data-bc-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        VBC._state.mode = this.getAttribute('data-bc-mode');
        VBC._saveState();
        VBC.renderBarcodeToolPanel(contentEl);
      });
    });
    if (VBC._state.mode === 'sequence') VBC._bindSequenceMode();
    else if (VBC._state.mode === 'bulk') VBC._bindBulkMode();
    else if (VBC._state.mode === 'history') VBC._renderHistory();
    else { VBC._bindSingleMode(); VBC._bindSingleExtras(); }
  };

  VBC.updateBarcodeObjectFromPanel = function () {
    if (typeof canvas === 'undefined' || !canvas) return;
    var obj = canvas.getActiveObject();
    if (!VBC.isBarcodeObject(obj)) return;
    var opts = {
      type: (document.getElementById('p-barcode-type') || {}).value || obj._barcodeType || 'code128',
      value: (document.getElementById('p-barcode-value') || {}).value || obj._barcodeValue || '',
      lineColor: (document.getElementById('p-barcode-line') || {}).value || '#111111',
      backgroundColor: (document.getElementById('p-barcode-bg') || {}).value || '#ffffff',
      humanReadable: !!((document.getElementById('p-barcode-human') || {}).checked)
    };
    var validation = VBC._validateBarcode(opts.type, opts.value);
    if (!validation.ok) {
      if (typeof showToast === 'function') showToast(validation.message, 'error');
      return;
    }
    try {
      VBC._renderBarcodeCanvas(VBC._mergeDeep(VBC._clone(VBC._state.single), opts));
    } catch (e) {
      if (typeof showToast === 'function') showToast(e.message || 'Could not update barcode.', 'error');
      return;
    }
    var currentWidth = obj.getScaledWidth();
    var currentLeft = obj.left;
    var currentTop = obj.top;
    var currentAngle = obj.angle || 0;
    var currentOriginX = obj.originX || 'left';
    var currentOriginY = obj.originY || 'top';
    var currentDfField = obj._dfField;
    var currentSource = obj._barcodeSource || 'single';
    var currentRowIndex = obj._barcodeRowIndex;
    VBC._buildBarcodeFabricObject(VBC._mergeDeep(VBC._clone(VBC._state.single), {
      type: opts.type,
      value: validation.value,
      lineColor: opts.lineColor,
      backgroundColor: opts.backgroundColor,
      humanReadable: opts.humanReadable,
      _source: currentSource,
      _rowIndex: currentRowIndex,
      createFieldAware: currentDfField === 'barcode_value'
    }), function (err, img) {
      if (err || !img) return;
      img.set({
        left: currentLeft,
        top: currentTop,
        angle: currentAngle,
        originX: currentOriginX,
        originY: currentOriginY
      });
      if (currentDfField) img._dfField = currentDfField;
      img.scaleToWidth(currentWidth);
      canvas.remove(obj);
      canvas.add(img);
      canvas.setActiveObject(img);
      canvas.renderAll();
      if (typeof snap === 'function') snap();
      if (typeof refreshStructure === 'function') refreshStructure();
      VBC._pushHistoryEntry(validation.value, VBC._normalizeBcid(opts.type));
      if (typeof showToast === 'function') showToast('Barcode updated');
    });
  };

  VBC.syncBarcodePanel = function (obj) {
    var typeEl = document.getElementById('p-barcode-type');
    var valueEl = document.getElementById('p-barcode-value');
    var lineEl = document.getElementById('p-barcode-line');
    var bgEl = document.getElementById('p-barcode-bg');
    var humanEl = document.getElementById('p-barcode-human');
    if (typeEl) typeEl.value = VBC._normalizeBcid(obj._barcodeType || 'code128');
    if (valueEl) valueEl.value = obj._barcodeValue || '';
    if (lineEl) lineEl.value = obj._barcodeLineColor || '#111111';
    if (bgEl) bgEl.value = obj._barcodeBackgroundColor || '#ffffff';
    if (humanEl) humanEl.checked = obj._barcodeHumanReadable !== false;
    var applyBtn = document.getElementById('p-barcode-apply-btn');
    if (applyBtn && !applyBtn._bcBound) {
      applyBtn._bcBound = true;
      applyBtn.addEventListener('click', VBC.updateBarcodeObjectFromPanel);
    }
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'panel', parent: 'left-panel.tools.barcode-tools', title: 'barcode-tools: panel', mount: function () {}, unmount: function () {} });
  }
})();
