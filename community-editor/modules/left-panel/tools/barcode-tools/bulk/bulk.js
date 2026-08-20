/* Module: left-panel/tools/barcode-tools/bulk — Bulk/CSV mode — mapping, per-row generation across pages, progress/results.
   Part of the barcode-tools group (decomposed from the 1365-line IIFE). Functions hang off the
   shared namespace VBC (window.__ccBarcodeTools, created by the parent); cross-module refs resolve
   through VBC at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VBC = window.__ccBarcodeTools;
  if (!VBC) return;

  VBC._sourceCanvasJson = function () {
    if (typeof saveCurrentPage === 'function') saveCurrentPage();
    var page = (typeof pages !== 'undefined' && pages[currentPageIndex]) ? pages[currentPageIndex] : null;
    if (page && page.json) return VBC._clone(page.json);
    if (typeof canvas !== 'undefined' && canvas) return canvas.toJSON(typeof CUSTOM_PROPS !== 'undefined' ? CUSTOM_PROPS : []);
    return { version: '5.3.1', objects: [] };
  };

  VBC._currentPageTemplate = function () {
    if (typeof saveCurrentPage === 'function') saveCurrentPage();
    if (typeof pages !== 'undefined' && pages[currentPageIndex]) return VBC._clone(pages[currentPageIndex]);
    return {
      json: VBC._sourceCanvasJson(),
      bg: (typeof canvas !== 'undefined' && canvas) ? canvas.backgroundColor : '#0d0d0d',
      label: 'Page 1',
      w: typeof CW !== 'undefined' ? CW : 1000,
      h: typeof CH !== 'undefined' ? CH : 1000,
      _productType: typeof activeProduct !== 'undefined' ? activeProduct : 'card'
    };
  };

  VBC._getSourceFieldTargets = function () {
    var page = VBC._currentPageTemplate();
    var json = page.json || VBC._sourceCanvasJson();
    var out = [];
    var seen = {};
    if (!json || !json.objects) return out;
    json.objects.forEach(function (obj) {
      var key = obj._dfField || obj._fieldRole;
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(key);
    });
    return out.sort();
  };

  VBC._defaultMapping = function (headers) {
    var mapping = {};
    headers.forEach(function (h) {
      var key = String(h || '').trim().toLowerCase();
      if (key === 'page_name' || key === 'page name') mapping[h] = 'page_name';
      else if (key === 'barcode_value' || key === 'barcode' || key === 'sku' || key === 'code') mapping[h] = 'barcode_value';
      else if (key === 'barcode_type' || key === 'type') mapping[h] = 'barcode_type';
      else mapping[h] = 'ignore';
    });
    return mapping;
  };

  VBC._parseCsvFile = function (file, done) {
    /* P0.4 (2026-07-18): delegates to the SHARED bulk engine parser (same {headers, rows}
       shape). The engine also normalizes row keys to their TRIMMED headers, fixing the
       latent mismatch this local copy had (mapping keyed by trimmed headers, rows keyed
       raw, so a padded CSV header silently dropped its values). The barcode-specific
       APPLY loop below stays local on purpose: its semantics (top-level walk, no currency
       logic, validation + create-missing-barcode) differ from CCBulk.applyRow. */
    if (window.CCBulk) return CCBulk.parseCsvFile(file, done);
    return done(new Error('Bulk engine not loaded.'));
  };

  VBC._renderBulkMappingRows = function () {
    var wrap = document.getElementById('barcode-bulk-mapping');
    if (!wrap) return;
    if (!VBC._state.bulk.headers.length) {
      wrap.innerHTML = '';
      return;
    }
    var fields = VBC._getSourceFieldTargets();
    var options = '<option value="ignore">Ignore</option>' +
      '<option value="page_name">Page Name</option>' +
      '<option value="barcode_value">Barcode Value</option>' +
      '<option value="barcode_type">Barcode Type</option>';
    fields.forEach(function (field) {
      options += '<option value="' + VBC._esc(field) + '">' + VBC._esc(field) + '</option>';
    });
    var html = '<div class="barcode-map-title">Field Mapping</div>';
    VBC._state.bulk.headers.forEach(function (header) {
      var mapped = VBC._state.bulk.mapping[header] || 'ignore';
      html += '<div class="barcode-map-row">' +
        '<div class="barcode-map-col">' + VBC._esc(header) + '</div>' +
        '<select class="wiz-input barcode-map-select" data-bc-header="' + VBC._esc(header) + '">' + options.replace('value="' + mapped + '"', 'value="' + mapped + '" selected') + '</select>' +
      '</div>';
    });
    wrap.innerHTML = html;
    wrap.querySelectorAll('.barcode-map-select').forEach(function (sel) {
      sel.addEventListener('change', function () {
        VBC._state.bulk.mapping[this.getAttribute('data-bc-header')] = this.value;
        VBC._saveState();
      });
    });
  };

  VBC._renderBulkPreviewRows = function () {
    var table = document.getElementById('barcode-bulk-preview-table');
    if (!table) return;
    if (!VBC._state.bulk.rows.length) {
      table.innerHTML = '';
      return;
    }
    var headers = VBC._state.bulk.headers;
    var rows = VBC._state.bulk.rows.slice(0, 3);
    var html = '<table class="barcode-preview-table"><thead><tr>';
    headers.forEach(function (h) { html += '<th>' + VBC._esc(h) + '</th>'; });
    html += '</tr></thead><tbody>';
    rows.forEach(function (row) {
      html += '<tr>';
      headers.forEach(function (h) { html += '<td>' + VBC._esc(row[h]) + '</td>'; });
      html += '</tr>';
    });
    html += '</tbody></table>';
    table.innerHTML = html;
  };

  VBC._renderBulkProgress = function () {
    var progress = document.getElementById('barcode-bulk-progress');
    if (!progress) return;
    var p = VBC._state.bulk.progress;
    if (!p.running && !p.total) {
      progress.innerHTML = '';
      return;
    }
    var pct = p.total ? Math.max(0, Math.min(100, Math.round((p.processed / p.total) * 100))) : 0;
    progress.innerHTML =
      '<div class="barcode-progress-top"><span>Generating ' + p.processed + ' / ' + p.total + ' pages</span><span>' + pct + '%</span></div>' +
      '<div class="barcode-progress-bar"><span style="width:' + pct + '%"></span></div>' +
      '<div class="barcode-progress-meta"><span>Success: ' + p.success + '</span><span>Failed: ' + p.failed + '</span>' +
      (p.running ? '<button type="button" class="barcode-inline-btn" id="barcode-bulk-cancel">Cancel</button>' : '') +
      '</div>';
    var cancelBtn = document.getElementById('barcode-bulk-cancel');
    if (cancelBtn) cancelBtn.onclick = function () {
      VBC._state.bulk.progress.canceled = true;
      VBC._saveState();
      VBC._renderBulkProgress();
    };
  };

  VBC._renderBulkResults = function () {
    var wrap = document.getElementById('barcode-bulk-results');
    if (!wrap) return;
    var list = VBC._state.bulk.results || [];
    if (!list.length) {
      wrap.innerHTML = '';
      return;
    }
    var html = '<div class="barcode-results-head"><span>Total ' + list.length + ' row result(s)</span><button type="button" class="barcode-inline-btn" id="barcode-bulk-retry-failed">Retry Failed</button></div><div class="barcode-results-list">';
    list.forEach(function (item) {
      html += '<div class="barcode-result-row ' + (item.status || 'info') + '"><div class="barcode-result-title">Row ' + item.row + ' — ' + VBC._esc(item.message) + '</div>' +
        (item.pageLabel ? '<div class="barcode-result-meta">' + VBC._esc(item.pageLabel) + '</div>' : '') +
      '</div>';
    });
    html += '</div>';
    wrap.innerHTML = html;
    var retryBtn = document.getElementById('barcode-bulk-retry-failed');
    if (retryBtn) retryBtn.onclick = function () {
      var failedRows = [];
      (VBC._state.bulk.results || []).forEach(function (item) {
        if (item.status === 'failed' && VBC._state.bulk.rows[item.row - 1]) failedRows.push(VBC._state.bulk.rows[item.row - 1]);
      });
      if (!failedRows.length) {
        if (typeof showToast === 'function') showToast('No failed rows to retry');
        return;
      }
      VBC._runBulkGeneration(failedRows);
    };
  };

  VBC._resolveRowTargets = function (row) {
    var mapped = {};
    Object.keys(VBC._state.bulk.mapping || {}).forEach(function (header) {
      var target = VBC._state.bulk.mapping[header];
      if (!target || target === 'ignore') return;
      mapped[target] = row[header];
    });
    return mapped;
  };

  VBC._uniquePageLabel = function (base) {
    var desired = String(base || '').trim() || 'Barcode';
    var label = desired;
    var n = 2;
    while (typeof pages !== 'undefined' && pages.some(function (p) { return p && p.label === label; })) {
      label = desired + ' (' + n + ')';
      n++;
    }
    return label;
  };

  VBC._fitBarcodeObjectJson = function (obj, pageW, pageH) {
    if (obj.left == null) obj.left = Math.max(40, Math.round(pageW * 0.1));
    if (obj.top == null) obj.top = Math.max(40, Math.round(pageH * 0.1));
    if (obj.scaleX == null) obj.scaleX = 1;
    if (obj.scaleY == null) obj.scaleY = 1;
  };

  VBC._createBarcodeObjectJson = function (opts, pageW, pageH, done) {
    VBC._buildBarcodeFabricObject(opts, function (err, img) {
      if (err || !img) return done(err || new Error('Could not create barcode image.'));
      var maxW = Math.min(Math.max(160, pageW * 0.32), 280);
      img.scaleToWidth(maxW);
      img.set({
        left: Math.round((pageW - img.getScaledWidth()) / 2),
        top: Math.round((pageH - img.getScaledHeight()) / 2),
        angle: parseInt(opts.rotation, 10) || 0
      });
      done(null, img.toObject(typeof CUSTOM_PROPS !== 'undefined' ? CUSTOM_PROPS : []));
    });
  };

  VBC._applyBulkRowToPage = function (sourcePage, row, rowIndex, done) {
    var page = VBC._clone(sourcePage);
    page._pageId = null;
    page.json = page.json || VBC._sourceCanvasJson();
    page.bg = page.bg || '#0d0d0d';
    page.w = page.w || (typeof CW !== 'undefined' ? CW : 1000);
    page.h = page.h || (typeof CH !== 'undefined' ? CH : 1000);
    var mapped = VBC._resolveRowTargets(row);
    var pageName = mapped.page_name || row.page_name || ('Barcode ' + (rowIndex + 1));
    page.label = VBC._uniquePageLabel(pageName);
    var barcodeType = mapped.barcode_type || VBC._state.bulk.globalBarcodeType || VBC._state.single.type;
    var barcodeValue = mapped.barcode_value || row.barcode_value || row.barcode || row.code || row.sku || '';
    var validation = VBC._validateBarcode(barcodeType, barcodeValue);
    if (!validation.ok) return done(new Error(validation.message));
    var opts = VBC._mergeDeep(VBC._clone(VBC._state.single), {
      type: barcodeType,
      value: validation.value,
      _source: 'bulk',
      _rowIndex: rowIndex + 1
    });
    var dataUrl = VBC._renderBarcodeDataUrl(opts);
    var objects = page.json.objects || [];
    var barcodeFound = false;
    /* F1 (2026-07-18, owner-approved behavior change): generic field application goes
       through the SHARED bulk engine now — group recursion, currency-preserve text,
       QR regeneration and color fields, identical to the main wizard. Barcode objects
       stay under the LOCAL pipeline below (validation, strict mode, own renderer). */
    if (window.CCBulk) {
      CCBulk.walkJsonObjects(objects, function (gobj) {
        var gkey = gobj._dfField || gobj._fieldRole;
        if (!gkey || mapped[gkey] == null) return;
        if (gkey === 'barcode_value' || gkey === 'barcode_type' || gkey === 'page_name') return;
        if (VBC.isBarcodeObject(gobj)) return;
        CCBulk.applyMappedValueToObject(gobj, String(mapped[gkey]), gkey);
      });
    }
    for (var i = 0; i < objects.length; i++) {
      var obj = objects[i];
      var key = obj._dfField || obj._fieldRole;
      if (VBC.isBarcodeObject(obj) || key === 'barcode_value') {
        obj.src = dataUrl;
        obj._ccType = 'barcode';
        obj._barcodeType = VBC._normalizeBcid(barcodeType);
        obj._barcodeValue = validation.value;
        obj._barcodeHumanReadable = opts.humanReadable !== false;
        obj._barcodeSource = 'bulk';
        obj._barcodeRowIndex = rowIndex + 1;
        obj._barcodeLineColor = opts.lineColor || '#111111';
        obj._barcodeBackgroundColor = opts.backgroundColor || '#ffffff';
        VBC._fitBarcodeObjectJson(obj, page.w, page.h);
        barcodeFound = true;
      }
    }
    if (barcodeFound) return done(null, page, page.label);
    VBC._createBarcodeObjectJson(opts, page.w, page.h, function (err, barcodeObj) {
      if (err) return done(err);
      page.json.objects = objects;
      page.json.objects.push(barcodeObj);
      done(null, page, page.label);
    });
  };

  VBC._flushBulkPages = function (createdPages) {
    if (!createdPages.length || typeof pages === 'undefined') return;
    var insertAt = currentPageIndex + 1;
    for (var i = 0; i < createdPages.length; i++) pages.splice(insertAt + i, 0, createdPages[i]);
    if (typeof renderPageTabs === 'function') renderPageTabs();
    if (typeof _psEvictIfNeeded === 'function') _psEvictIfNeeded();   // page-sleep: respect the awake budget after a bulk insert
  };

  VBC._runBulkGeneration = function (rowsOverride) {
    var rows = rowsOverride || VBC._state.bulk.rows;
    if (!rows || !rows.length) {
      if (typeof showToast === 'function') showToast('Upload a CSV with at least one row.', 'error');
      return;
    }
    VBC._bulkRunToken++;
    var token = VBC._bulkRunToken;
    VBC._state.bulk.progress = { total: rows.length, processed: 0, success: 0, failed: 0, running: true, canceled: false };
    VBC._state.bulk.results = [];
    VBC._saveState();
    VBC._renderBulkProgress();
    VBC._renderBulkResults();
    var sourcePage = VBC._currentPageTemplate();
    var cursor = 0;
    var created = [];

    function finish() {
      VBC._state.bulk.progress.running = false;
      VBC._saveState();
      VBC._flushBulkPages(created);
      VBC._renderBulkProgress();
      VBC._renderBulkResults();
      if (typeof showToast === 'function') showToast(VBC._state.bulk.progress.success + ' barcode page(s) generated');
    }

    function nextChunk() {
      if (token !== VBC._bulkRunToken) return;
      if (VBC._state.bulk.progress.canceled || cursor >= rows.length) {
        finish();
        return;
      }
      var end = Math.min(cursor + VBC.RESULT_CHUNK, rows.length);
      var localIndex = cursor;
      function handleOne() {
        if (localIndex >= end) {
          cursor = end;
          VBC._saveState();
          VBC._renderBulkProgress();
          VBC._renderBulkResults();
          setTimeout(nextChunk, 0);
          return;
        }
        var row = rows[localIndex];
        VBC._applyBulkRowToPage(sourcePage, row, localIndex, function (err, page, pageLabel) {
          VBC._state.bulk.progress.processed++;
          if (err) {
            VBC._state.bulk.progress.failed++;
            VBC._state.bulk.results.push({ row: localIndex + 1, status: 'failed', message: err.message || 'Row failed' });
          } else {
            created.push(page);
            VBC._state.bulk.progress.success++;
            VBC._state.bulk.results.push({ row: localIndex + 1, status: 'success', message: 'Page created', pageLabel: pageLabel });
          }
          localIndex++;
          handleOne();
        });
      }
      handleOne();
    }

    nextChunk();
  };

  VBC._bindBulkMode = function () {
    var fileInput = document.getElementById('barcode-bulk-file');
    var drop = document.getElementById('barcode-bulk-drop');
    var typeSelect = document.getElementById('barcode-bulk-global-type');
    var strictToggle = document.getElementById('barcode-bulk-strict');
    var startBtn = document.getElementById('barcode-bulk-generate');
    var sampleBtn = document.getElementById('barcode-download-sample');

    if (typeSelect) {
      typeSelect.value = VBC._state.bulk.globalBarcodeType || VBC._state.single.type;
      typeSelect.onchange = function () {
        VBC._state.bulk.globalBarcodeType = this.value;
        VBC._saveState();
      };
    }
    if (strictToggle) {
      strictToggle.checked = !!VBC._state.bulk.strictMode;
      strictToggle.onchange = function () {
        VBC._state.bulk.strictMode = !!this.checked;
        VBC._saveState();
      };
    }

    function acceptFile(file) {
      VBC._parseCsvFile(file, function (err, parsed) {
        if (err) {
          if (typeof showToast === 'function') showToast(err.message || 'Could not parse CSV.', 'error');
          return;
        }
        VBC._state.bulk.fileName = file.name || 'data.csv';
        VBC._state.bulk.headers = parsed.headers || [];
        VBC._state.bulk.rows = parsed.rows || [];
        VBC._state.bulk.previewRows = VBC._state.bulk.rows.slice(0, 3);
        VBC._state.bulk.mapping = VBC._defaultMapping(VBC._state.bulk.headers);
        VBC._saveState();
        VBC._renderBulkMappingRows();
        VBC._renderBulkPreviewRows();
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', function () {
        if (this.files && this.files[0]) acceptFile(this.files[0]);
      });
    }
    if (drop) {
      ['dragenter', 'dragover'].forEach(function (evt) {
        drop.addEventListener(evt, function (e) {
          e.preventDefault();
          drop.classList.add('is-dragover');
        });
      });
      ['dragleave', 'drop'].forEach(function (evt) {
        drop.addEventListener(evt, function (e) {
          e.preventDefault();
          drop.classList.remove('is-dragover');
        });
      });
      drop.addEventListener('drop', function (e) {
        var file = e.dataTransfer && e.dataTransfer.files ? e.dataTransfer.files[0] : null;
        if (file) acceptFile(file);
      });
    }
    if (sampleBtn) {
      sampleBtn.onclick = function () {
        var csv = 'page_name,barcode_value,title,price,image_url\nLabel A,123456789012,Product A,$12.99,https://example.com/a.png\nLabel B,123456789013,Product B,$13.99,https://example.com/b.png';
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'dika-barcode-sample.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      };
    }
    if (startBtn) startBtn.onclick = function () { VBC._runBulkGeneration(); };
    VBC._renderBulkMappingRows();
    VBC._renderBulkPreviewRows();
    VBC._renderBulkProgress();
    VBC._renderBulkResults();
  };

  VBC._bulkMarkup = function () {
    return '<div class="barcode-tool-panel">' +
      '<p class="barcode-copy">Use the current page as your master layout and generate one new page for each CSV row.</p>' +
      '<div class="barcode-bulk-drop" id="barcode-bulk-drop"><div class="barcode-drop-icon">' + VBC._icon('upload', 18) + '</div><div class="barcode-drop-title">Upload CSV</div><div class="barcode-drop-copy">Drag & drop a file here or choose one from disk.</div><input type="file" id="barcode-bulk-file" accept=".csv,text/csv"></div>' +
      '<div class="barcode-actions barcode-actions-tight"><button type="button" class="el-btn" id="barcode-download-sample">Download Sample CSV</button></div>' +
      '<div class="barcode-grid-2">' +
        '<label class="settings-field"><span class="settings-label">Fallback Barcode Type</span><select class="wiz-input" id="barcode-bulk-global-type">' +
          VBC._barcodeTypes().map(function (item) { return '<option value="' + item.id + '"' + ((VBC._state.bulk.globalBarcodeType || VBC._state.single.type) === item.id ? ' selected' : '') + '>' + item.label + '</option>'; }).join('') +
        '</select></label>' +
        '<label class="barcode-check barcode-check-inline"><input type="checkbox" id="barcode-bulk-strict"' + (VBC._state.bulk.strictMode ? ' checked' : '') + '><span>Strict mode</span></label>' +
      '</div>' +
      '<div id="barcode-bulk-mapping"></div><div id="barcode-bulk-preview-table"></div>' +
      '<div class="barcode-actions barcode-actions-tight"><button type="button" class="el-btn barcode-primary-btn" id="barcode-bulk-generate">Generate Pages</button></div>' +
      '<div id="barcode-bulk-progress"></div><div id="barcode-bulk-results"></div>' +
    '</div>';
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'bulk', parent: 'left-panel.tools.barcode-tools', title: 'barcode-tools: bulk', mount: function () {}, unmount: function () {} });
  }
})();
