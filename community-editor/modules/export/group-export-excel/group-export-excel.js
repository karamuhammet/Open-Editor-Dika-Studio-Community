/* ============================================================
   dika studio – Group Export to Excel
   Wizard flow: field selection → page selection → settings →
   preview & export. Generates XLSX with ExcelJS, embeds page
   images, shows floating progress modal during generation.
   ============================================================ */

var GroupExcelExport = (function () {
  'use strict';

  /* ── Constants ────────────────────────────────────────────── */
  var BUILT_IN_COLS = [
    { key: '__label',  label: 'Page Label',  builtin: true, checked: true },
    { key: '__image',  label: 'Page Image',  builtin: true, checked: true },
    { key: '__dims',   label: 'Page Size',   builtin: true, checked: false }
  ];
  var KNOWN_ROLES = ['name', 'title', 'company', 'email', 'phone', 'website'];

  /* ── State ────────────────────────────────────────────────── */
  var _group = null;
  var _overlay = null;
  var _step = 1;
  var _columns = [];       // [{key, label, builtin, checked}]
  var _pageEntries = [];   // [{pageIndex, label, isBoard, checked, thumb}]
  var _settings = {
    tableFormat: true,
    imgSize: 200,
    dpi: 150,
    sheetName: '',
    fileName: '',
    includePageSize: false
  };

  /* ═══════════════════════════════════════════════════════════
     SCANNING — discover design fields in group pages
     ═══════════════════════════════════════════════════════════ */

  function _scanGroupFields(group) {
    var found = {};
    var pageIdxs = _pgPagesInGroup(group.id);
    pageIdxs.forEach(function (pi) {
      var page = pages[pi];
      if (!page) return;
      // Page-sleep: bulk groups are the prime sleep target; read parked json (no-op when off).
      var _pj = (typeof _psJsonForSave === 'function') ? _psJsonForSave(page) : page.json;
      if (!_pj) return;
      var objs = _pj.objects || [];
      _walkObjects(objs, function (o) {
        var role = o._dfField || o._fieldRole;
        if (role && typeof role === 'string' && role.trim()) {
          found[role.trim()] = true;
        }
      });
    });
    return Object.keys(found);
  }

  function _walkObjects(objs, fn) {
    if (!objs) return;
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i];
      if (!o) continue;
      if (o.type === 'group' && o.objects) {
        _walkObjects(o.objects, fn);
      }
      if (o.type === 'i-text' || o.type === 'text' || o.type === 'textbox') {
        fn(o);
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════
     WIZARD OVERLAY
     ═══════════════════════════════════════════════════════════ */

  function open(group) {
    if (!group) return;
    // Lazy-load ExcelJS (~450KB) on first Excel-export use — removed from index.html (editor-perf B3).
    if (typeof ExcelJS === 'undefined') {
      if (window.cc && cc.requireLib) cc.requireLib('js/vendor/exceljs.min.js').then(function () { open(group); });
      return;
    }
    // Page-sleep: the wizard scans + extracts this group's page jsons; hydrate them first
    // (bulk groups are the prime sleep target). LRU re-evicts after.
    if (typeof CCPageSleep !== 'undefined' && typeof _pgPagesInGroup === 'function' && !CCPageSleep._excelHydrating) {
      var _slIdxs = _pgPagesInGroup(group.id).filter(function (pi) { return pages[pi] && pages[pi]._slept; });
      if (_slIdxs.length) {
        CCPageSleep._excelHydrating = true;
        var _left = _slIdxs.length;
        _slIdxs.forEach(function (pi) {
          CCPageSleep.ensurePageHydrated(pi, function () {
            if (--_left === 0) { CCPageSleep._excelHydrating = false; open(group); }
          });
        });
        return;
      }
    }
    _group = group;
    _step = 1;

    // Discover fields
    var roles = _scanGroupFields(group);
    _columns = [];
    // Add known roles in order
    KNOWN_ROLES.forEach(function (r) {
      if (roles.indexOf(r) !== -1) {
        _columns.push({ key: r, label: r.charAt(0).toUpperCase() + r.slice(1), builtin: false, checked: true });
      }
    });
    // Add unknown/custom roles
    roles.forEach(function (r) {
      if (KNOWN_ROLES.indexOf(r) === -1) {
        _columns.push({ key: r, label: r, builtin: false, checked: true });
      }
    });
    // Add built-in columns
    BUILT_IN_COLS.forEach(function (b) {
      _columns.push({ key: b.key, label: b.label, builtin: true, checked: b.checked });
    });

    // Build page entries
    var pageIdxs = _pgPagesInGroup(group.id);
    _pageEntries = pageIdxs.map(function (pi) {
      var p = pages[pi];
      return {
        pageIndex: pi,
        label: p.label || ('Page ' + (pi + 1)),
        isBoard: !!p._isBoard,
        checked: !p._isBoard
      };
    });

    // Default settings
    _settings.sheetName = group.name || 'Sheet1';
    _settings.fileName = (group.name || 'export').replace(/[^a-zA-Z0-9_\- ]/g, '') + '.xlsx';
    _settings.tableFormat = true;
    _settings.imgSize = 200;
    _settings.dpi = 150;

    _createOverlay();
    _renderStep();
  }

  function _createOverlay() {
    if (_overlay) _overlay.remove();
    _overlay = document.createElement('div');
    _overlay.id = 'gxe-overlay';
    _overlay.className = 'gxe-overlay';
    _overlay.innerHTML =
      '<div class="gxe-wizard">' +
        '<div class="gxe-header">' +
          '<span class="gxe-title">Export Group to Excel</span>' +
          '<button class="gxe-close" title="Close">&times;</button>' +
        '</div>' +
        '<div class="gxe-steps">' +
          '<span class="gxe-step" data-s="1">1. Fields</span>' +
          '<span class="gxe-step" data-s="2">2. Pages</span>' +
          '<span class="gxe-step" data-s="3">3. Settings</span>' +
          '<span class="gxe-step" data-s="4">4. Export</span>' +
        '</div>' +
        '<div class="gxe-body" id="gxe-body"></div>' +
        '<div class="gxe-footer" id="gxe-footer"></div>' +
      '</div>';
    document.body.appendChild(_overlay);

    _overlay.querySelector('.gxe-close').onclick = _close;
    _overlay.addEventListener('click', function (e) {
      if (e.target === _overlay) _close();
    });
  }

  function _close() {
    if (_overlay) { _overlay.remove(); _overlay = null; }
  }

  function _renderStep() {
    if (!_overlay) return;
    // Highlight step indicators
    var steps = _overlay.querySelectorAll('.gxe-step');
    for (var i = 0; i < steps.length; i++) {
      steps[i].classList.toggle('active', parseInt(steps[i].dataset.s) === _step);
      steps[i].classList.toggle('done', parseInt(steps[i].dataset.s) < _step);
    }
    var body = _overlay.querySelector('#gxe-body');
    var footer = _overlay.querySelector('#gxe-footer');
    if (_step === 1) _renderFieldStep(body, footer);
    else if (_step === 2) _renderPageStep(body, footer);
    else if (_step === 3) _renderSettingsStep(body, footer);
    else if (_step === 4) _renderPreviewStep(body, footer);
  }

  /* ── Step 1: Field Selection ────────────────────────────── */
  function _renderFieldStep(body, footer) {
    var fieldCols = _columns.filter(function (c) { return !c.builtin; });
    var builtinCols = _columns.filter(function (c) { return c.builtin; });

    var html = '<div class="gxe-section-title">Design Fields</div>';
    html += '<div class="gxe-hint" style="margin-bottom:8px">Click column headers to rename them for Excel output.</div>';
    if (fieldCols.length === 0) {
      html += '<div class="gxe-hint">No design fields found on pages in this group.<br>Assign <b>Field Role</b> to text objects in the right panel.</div>';
    } else {
      html += '<div class="gxe-field-list">';
      fieldCols.forEach(function (c) {
        html += '<div class="gxe-field-item">' +
          '<label class="gxe-field-check"><input type="checkbox" data-key="' + _escAttr(c.key) + '" ' + (c.checked ? 'checked' : '') + '> ' + _escHtml(c.key) + '</label>' +
          '<span class="gxe-field-arrow">→</span>' +
          '<input type="text" class="gxe-header-input" data-key="' + _escAttr(c.key) + '" value="' + _escAttr(c.label) + '" placeholder="Header name">' +
        '</div>';
      });
      html += '</div>';
    }
    html += '<div class="gxe-section-title" style="margin-top:14px">Built-in Columns</div>';
    html += '<div class="gxe-field-list">';
    builtinCols.forEach(function (c) {
      html += '<div class="gxe-field-item">' +
        '<label class="gxe-field-check"><input type="checkbox" data-key="' + _escAttr(c.key) + '" ' + (c.checked ? 'checked' : '') + '> ' + _escHtml(c.key === '__label' ? 'Page Label' : c.key === '__image' ? 'Page Image' : 'Page Size') + '</label>' +
        '<span class="gxe-field-arrow">→</span>' +
        '<input type="text" class="gxe-header-input" data-key="' + _escAttr(c.key) + '" value="' + _escAttr(c.label) + '" placeholder="Header name">' +
      '</div>';
    });
    html += '</div>';
    body.innerHTML = html;

    // Wire checkboxes
    var checks = body.querySelectorAll('input[type=checkbox]');
    for (var i = 0; i < checks.length; i++) {
      checks[i].onchange = function () {
        var key = this.dataset.key;
        for (var j = 0; j < _columns.length; j++) {
          if (_columns[j].key === key) _columns[j].checked = this.checked;
        }
      };
    }
    // Wire header rename inputs
    var headerInputs = body.querySelectorAll('.gxe-header-input');
    for (var hi = 0; hi < headerInputs.length; hi++) {
      headerInputs[hi].oninput = function () {
        var key = this.dataset.key;
        var val = this.value.trim();
        for (var j = 0; j < _columns.length; j++) {
          if (_columns[j].key === key) _columns[j].label = val || _columns[j].key;
        }
      };
    }

    footer.innerHTML =
      '<button class="gxe-btn secondary" onclick="GroupExcelExport._close()">Cancel</button>' +
      '<button class="gxe-btn primary" id="gxe-next1">Next →</button>';
    footer.querySelector('#gxe-next1').onclick = function () { _step = 2; _renderStep(); };
  }

  /* ── Step 2: Page Selection ─────────────────────────────── */
  function _renderPageStep(body, footer) {
    var html = '<div class="gxe-section-title">Select Pages to Export</div>';
    html += '<div class="gxe-page-actions">' +
      '<button class="gxe-link-btn" id="gxe-sel-all">Select All</button>' +
      '<button class="gxe-link-btn" id="gxe-sel-none">Select None</button>' +
    '</div>';
    html += '<div class="gxe-page-list">';
    _pageEntries.forEach(function (pe, i) {
      html +=
        '<label class="gxe-page-item' + (pe.isBoard ? ' is-board' : '') + '">' +
          '<input type="checkbox" data-pi="' + i + '" ' + (pe.checked ? 'checked' : '') + '>' +
          '<span class="gxe-page-label">' + _escHtml(pe.label) + '</span>' +
          (pe.isBoard ? '<span class="gxe-badge">Board</span>' : '') +
        '</label>';
    });
    html += '</div>';
    if (_pageEntries.some(function (pe) { return pe.isBoard; })) {
      html += '<div class="gxe-hint">Board pages are unchecked by default.</div>';
    }
    body.innerHTML = html;

    // Wire
    var checks = body.querySelectorAll('input[type=checkbox]');
    for (var ci = 0; ci < checks.length; ci++) {
      checks[ci].onchange = function () {
        _pageEntries[parseInt(this.dataset.pi)].checked = this.checked;
      };
    }
    body.querySelector('#gxe-sel-all').onclick = function () {
      _pageEntries.forEach(function (pe) { pe.checked = true; });
      _renderPageStep(body, footer);
    };
    body.querySelector('#gxe-sel-none').onclick = function () {
      _pageEntries.forEach(function (pe) { pe.checked = false; });
      _renderPageStep(body, footer);
    };

    footer.innerHTML =
      '<button class="gxe-btn secondary" id="gxe-back2">← Back</button>' +
      '<button class="gxe-btn primary" id="gxe-next2">Next →</button>';
    footer.querySelector('#gxe-back2').onclick = function () { _step = 1; _renderStep(); };
    footer.querySelector('#gxe-next2').onclick = function () { _step = 3; _renderStep(); };
  }

  /* ── Step 3: Excel Settings ─────────────────────────────── */
  function _renderSettingsStep(body, footer) {
    var html =
      '<div class="gxe-form">' +

        '<label class="gxe-form-row">' +
          '<span>File Name</span>' +
          '<input type="text" id="gxe-filename" value="' + _escAttr(_settings.fileName) + '" class="gxe-input">' +
        '</label>' +

        '<label class="gxe-form-row">' +
          '<span>Sheet Name</span>' +
          '<input type="text" id="gxe-sheetname" value="' + _escAttr(_settings.sheetName) + '" class="gxe-input">' +
        '</label>' +

        '<label class="gxe-form-row">' +
          '<span>Table Format</span>' +
          '<div class="gxe-toggle-wrap">' +
            '<input type="checkbox" id="gxe-table" ' + (_settings.tableFormat ? 'checked' : '') + '>' +
            '<span class="gxe-toggle-label">Striped rows with table header</span>' +
          '</div>' +
        '</label>' +

        '<label class="gxe-form-row">' +
          '<span>Image Size</span>' +
          '<select id="gxe-imgsize" class="gxe-select">' +
            '<option value="100"' + (_settings.imgSize === 100 ? ' selected' : '') + '>Small (100px)</option>' +
            '<option value="200"' + (_settings.imgSize === 200 ? ' selected' : '') + '>Medium (200px)</option>' +
            '<option value="400"' + (_settings.imgSize === 400 ? ' selected' : '') + '>Large (400px)</option>' +
          '</select>' +
        '</label>' +

        '<label class="gxe-form-row">' +
          '<span>Image DPI</span>' +
          '<select id="gxe-dpi" class="gxe-select">' +
            '<option value="72"' + (_settings.dpi === 72 ? ' selected' : '') + '>72 (Screen)</option>' +
            '<option value="150"' + (_settings.dpi === 150 ? ' selected' : '') + '>150 (Standard)</option>' +
            '<option value="300"' + (_settings.dpi === 300 ? ' selected' : '') + '>300 (Print)</option>' +
          '</select>' +
        '</label>' +

      '</div>';
    body.innerHTML = html;

    footer.innerHTML =
      '<button class="gxe-btn secondary" id="gxe-back3">← Back</button>' +
      '<button class="gxe-btn primary" id="gxe-next3">Next →</button>';
    footer.querySelector('#gxe-back3').onclick = function () { _step = 2; _renderStep(); };
    footer.querySelector('#gxe-next3').onclick = function () {
      // Collect settings
      _settings.fileName = body.querySelector('#gxe-filename').value.trim() || 'export.xlsx';
      if (!_settings.fileName.endsWith('.xlsx')) _settings.fileName += '.xlsx';
      _settings.sheetName = body.querySelector('#gxe-sheetname').value.trim() || 'Sheet1';
      _settings.tableFormat = body.querySelector('#gxe-table').checked;
      _settings.imgSize = parseInt(body.querySelector('#gxe-imgsize').value) || 200;
      _settings.dpi = parseInt(body.querySelector('#gxe-dpi').value) || 150;
      _step = 4;
      _renderStep();
    };
  }

  /* ── Step 4: Preview & Export ────────────────────────────── */
  function _renderPreviewStep(body, footer) {
    var selCols = _columns.filter(function (c) { return c.checked; });
    var selPages = _pageEntries.filter(function (pe) { return pe.checked; });

    if (selPages.length === 0) {
      body.innerHTML = '<div class="gxe-hint" style="text-align:center;padding:30px">No pages selected. Go back and select at least one page.</div>';
      footer.innerHTML = '<button class="gxe-btn secondary" id="gxe-back4">← Back</button>';
      footer.querySelector('#gxe-back4').onclick = function () { _step = 2; _renderStep(); };
      return;
    }

    // Build preview table
    var html = '<div class="gxe-section-title">Preview (' + selPages.length + ' pages, ' + selCols.length + ' columns)</div>';
    html += '<div class="gxe-preview-scroll"><table class="gxe-preview-table"><thead><tr>';
    selCols.forEach(function (c) {
      html += '<th>' + _escHtml(c.label) + '</th>';
    });
    html += '</tr></thead><tbody>';

    // Show first 3 rows as preview
    var previewCount = Math.min(3, selPages.length);
    for (var r = 0; r < previewCount; r++) {
      var pe = selPages[r];
      var page = pages[pe.pageIndex];
      html += '<tr>';
      selCols.forEach(function (c) {
        if (c.key === '__label') {
          html += '<td>' + _escHtml(pe.label) + '</td>';
        } else if (c.key === '__image') {
          html += '<td><span style="color:var(--text-dim)">[Image]</span></td>';
        } else if (c.key === '__dims') {
          html += '<td>' + (page.w || CW) + '×' + (page.h || CH) + '</td>';
        } else {
          var val = _extractField(pe.pageIndex, c.key);
          html += '<td>' + _escHtml(val || '—') + '</td>';
        }
      });
      html += '</tr>';
    }
    if (selPages.length > 3) {
      html += '<tr><td colspan="' + selCols.length + '" style="text-align:center;color:var(--text-dim)">... +' + (selPages.length - 3) + ' more rows</td></tr>';
    }
    html += '</tbody></table></div>';

    html += '<div class="gxe-summary">' +
      '<span>File: <b>' + _escHtml(_settings.fileName) + '</b></span>' +
      '<span>Sheet: <b>' + _escHtml(_settings.sheetName) + '</b></span>' +
      '<span>Images: <b>' + _settings.imgSize + 'px / ' + _settings.dpi + ' DPI</b></span>' +
      (_settings.tableFormat ? '<span>Table: <b>On</b></span>' : '') +
    '</div>';

    body.innerHTML = html;

    footer.innerHTML =
      '<button class="gxe-btn secondary" id="gxe-back4">← Back</button>' +
      '<button class="gxe-btn primary" id="gxe-export">Export .xlsx</button>';
    footer.querySelector('#gxe-back4').onclick = function () { _step = 3; _renderStep(); };
    footer.querySelector('#gxe-export').onclick = function () {
      _close();
      _startExport();
    };
  }

  /* ═══════════════════════════════════════════════════════════
     FIELD EXTRACTION — read text values from page JSON
     ═══════════════════════════════════════════════════════════ */

  function _extractField(pageIndex, roleKey) {
    var page = pages[pageIndex];
    if (!page) return '';
    // Page-sleep: read the parked json for a slept page (no-op when off).
    var _pj = (typeof _psJsonForSave === 'function') ? _psJsonForSave(page) : page.json;
    if (!_pj) return '';
    var objs = _pj.objects || [];
    var val = '';
    _walkObjects(objs, function (o) {
      var role = o._dfField || o._fieldRole;
      if (role === roleKey) {
        val = o.text || '';
      }
    });
    return val;
  }

  /* ═══════════════════════════════════════════════════════════
     FLOATING PROGRESS MODAL — draggable, minimizable
     ═══════════════════════════════════════════════════════════ */

  var _progModal = null;
  var _progMinimized = false;

  function _showProgress(current, total, msg) {
    if (!_progModal) {
      _progModal = document.createElement('div');
      _progModal.id = 'gxe-progress';
      _progModal.className = 'gxe-progress';
      _progModal.innerHTML =
        '<div class="gxe-prog-header" id="gxe-prog-header">' +
          '<span class="gxe-prog-title">Exporting to Excel</span>' +
          '<div class="gxe-prog-btns">' +
            '<button class="gxe-prog-min" id="gxe-prog-min" title="Minimize">−</button>' +
            '<button class="gxe-prog-close" id="gxe-prog-close" title="Cancel">&times;</button>' +
          '</div>' +
        '</div>' +
        '<div class="gxe-prog-body" id="gxe-prog-body"></div>';
      document.body.appendChild(_progModal);
      _makeDraggable(_progModal, _progModal.querySelector('#gxe-prog-header'));
      _progModal.querySelector('#gxe-prog-min').onclick = function () {
        _progMinimized = !_progMinimized;
        _progModal.classList.toggle('minimized', _progMinimized);
        this.textContent = _progMinimized ? '+' : '−';
      };
      _progModal.querySelector('#gxe-prog-close').onclick = function () {
        _cancelExport = true;
      };
    }

    _progModal.style.display = '';
    var pct = total > 0 ? Math.round(current / total * 100) : 0;
    var bodyEl = _progModal.querySelector('#gxe-prog-body');

    if (_progMinimized) {
      _progModal.querySelector('.gxe-prog-title').textContent = 'Exporting... ' + current + '/' + total;
    } else {
      _progModal.querySelector('.gxe-prog-title').textContent = 'Exporting to Excel';
      bodyEl.innerHTML =
        '<div class="gxe-prog-bar-wrap"><div class="gxe-prog-bar" style="width:' + pct + '%"></div></div>' +
        '<div class="gxe-prog-info">' +
          '<span>' + _escHtml(msg || '') + '</span>' +
          '<span>' + current + ' / ' + total + ' (' + pct + '%)</span>' +
        '</div>';
    }
  }

  function _showProgressDone(totalPages, fileName) {
    if (!_progModal) return;
    _progMinimized = false;
    _progModal.classList.remove('minimized');
    _progModal.querySelector('.gxe-prog-title').textContent = 'Export Complete';
    _progModal.querySelector('#gxe-prog-body').innerHTML =
      '<div class="gxe-prog-done">' +
        '<div style="font-size:24px;margin-bottom:8px">✓</div>' +
        '<div>' + totalPages + ' pages exported to <b>' + _escHtml(fileName) + '</b></div>' +
      '</div>';
    _progModal.querySelector('#gxe-prog-close').onclick = _hideProgress;
    _progModal.querySelector('#gxe-prog-min').style.display = 'none';
  }

  function _showProgressError(msg) {
    if (!_progModal) return;
    _progMinimized = false;
    _progModal.classList.remove('minimized');
    _progModal.querySelector('.gxe-prog-title').textContent = 'Export Failed';
    _progModal.querySelector('#gxe-prog-body').innerHTML =
      '<div class="gxe-prog-done" style="color:var(--red,#f44)">' +
        '<div style="font-size:24px;margin-bottom:8px">✕</div>' +
        '<div>' + _escHtml(msg) + '</div>' +
      '</div>';
    _progModal.querySelector('#gxe-prog-close').onclick = _hideProgress;
  }

  function _hideProgress() {
    if (_progModal) { _progModal.remove(); _progModal = null; _progMinimized = false; }
  }

  /* ── Drag helper ────────────────────────────────────────── */
  function _makeDraggable(el, handle) {
    var ox = 0, oy = 0, sx = 0, sy = 0;
    handle.style.cursor = 'move';
    handle.onmousedown = function (e) {
      if (e.target.tagName === 'BUTTON') return;
      e.preventDefault();
      sx = e.clientX; sy = e.clientY;
      var rect = el.getBoundingClientRect();
      ox = rect.left; oy = rect.top;
      document.onmousemove = function (ev) {
        el.style.right = 'auto'; el.style.bottom = 'auto';
        el.style.left = Math.max(0, ox + (ev.clientX - sx)) + 'px';
        el.style.top = Math.max(0, oy + (ev.clientY - sy)) + 'px';
      };
      document.onmouseup = function () { document.onmousemove = null; document.onmouseup = null; };
    };
  }

  /* ═══════════════════════════════════════════════════════════
     EXPORT ENGINE — build XLSX with ExcelJS
     ═══════════════════════════════════════════════════════════ */

  var _cancelExport = false;

  function _startExport() {
    if (typeof ExcelJS === 'undefined') {
      if (typeof showToast === 'function') showToast('ExcelJS library not loaded', 'error');
      return;
    }

    _cancelExport = false;
    var selCols = _columns.filter(function (c) { return c.checked; });
    var selPages = _pageEntries.filter(function (pe) { return pe.checked; });
    var hasImageCol = selCols.some(function (c) { return c.key === '__image'; });
    var total = selPages.length;

    _showProgress(0, total, 'Preparing...');

    // Collect row data async (renders images)
    var rows = [];
    var idx = 0;

    function processNext() {
      if (_cancelExport) { _hideProgress(); return; }
      if (idx >= selPages.length) {
        _buildWorkbook(selCols, rows, total);
        return;
      }

      var pe = selPages[idx];
      var page = pages[pe.pageIndex];
      _showProgress(idx, total, 'Rendering: ' + pe.label);

      var row = {};
      selCols.forEach(function (c) {
        if (c.key === '__label') {
          row.__label = pe.label;
        } else if (c.key === '__dims') {
          row.__dims = (page.w || CW) + ' × ' + (page.h || CH);
        } else if (c.key === '__image') {
          row.__image = null; // filled below
        } else {
          row[c.key] = _extractField(pe.pageIndex, c.key);
        }
      });

      if (hasImageCol && page.json) {
        ExportService.renderPage(pe.pageIndex, 'png', _settings.dpi).then(function (dataUrl) {
          row.__image = dataUrl;
          rows.push(row);
          idx++;
          // Yield to keep UI responsive
          setTimeout(processNext, 10);
        });
      } else {
        rows.push(row);
        idx++;
        setTimeout(processNext, 10);
      }
    }

    processNext();
  }

  function _buildWorkbook(selCols, rows, total) {
    _showProgress(total, total, 'Building Excel file...');

    try {
      var wb = new ExcelJS.Workbook();
      wb.creator = 'dika studio';
      wb.created = new Date();

      var ws = wb.addWorksheet(_settings.sheetName, {
        properties: { defaultRowHeight: 20 }
      });

      // ── Determine image column index ──
      var imgColIdx = -1;
      var colDefs = [];
      selCols.forEach(function (c, ci) {
        colDefs.push({
          header: c.label,
          key: c.key,
          width: c.key === '__image' ? Math.round(_settings.imgSize / 7) : 20
        });
        if (c.key === '__image') imgColIdx = ci;
      });
      ws.columns = colDefs;

      // ── Style header row ──
      var headerRow = ws.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B1B1F' } };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      headerRow.height = 28;

      // ── Add data rows + images ──
      var imageRowHeight = Math.round(_settings.imgSize * 0.75); // px to Excel row height approx
      var imgIds = [];

      rows.forEach(function (row, ri) {
        var dataRow = {};
        selCols.forEach(function (c) {
          if (c.key !== '__image') dataRow[c.key] = row[c.key] || '';
        });
        var addedRow = ws.addRow(dataRow);
        var excelRowIdx = ri + 2; // 1-indexed, row 1 is header

        if (imgColIdx >= 0 && row.__image) {
          // Set row height for image
          ws.getRow(excelRowIdx).height = imageRowHeight;

          var base64 = row.__image.split(',')[1];
          if (base64) {
            var imgId = wb.addImage({
              base64: base64,
              extension: 'png'
            });
            // Calculate column letter
            ws.addImage(imgId, {
              tl: { col: imgColIdx, row: excelRowIdx - 1 },
              ext: { width: _settings.imgSize, height: imageRowHeight }
            });
          }
        }

        // Style data rows
        addedRow.alignment = { vertical: 'middle', wrapText: true };
        if (_settings.tableFormat && ri % 2 === 1) {
          addedRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
        }
      });

      // ── Auto-fit text columns (approximate) ──
      ws.columns.forEach(function (col) {
        if (col.key === '__image') return;
        var maxLen = (col.header || '').length;
        rows.forEach(function (row) {
          var val = row[col.key] || '';
          if (val.length > maxLen) maxLen = val.length;
        });
        col.width = Math.min(50, Math.max(12, maxLen + 4));
      });

      // ── Add table formatting ──
      if (_settings.tableFormat && rows.length > 0) {
        try {
          ws.addTable({
            name: 'ExportData',
            ref: 'A1',
            headerRow: true,
            style: {
              theme: 'TableStyleMedium2',
              showRowStripes: true
            },
            columns: selCols.map(function (c) { return { name: c.label, filterButton: true }; }),
            rows: rows.map(function (row) {
              return selCols.map(function (c) {
                if (c.key === '__image') return '';
                return row[c.key] || '';
              });
            })
          });
        } catch (tableErr) {
          // Table creation can fail in some edge cases — data still intact
        }
      }

      // ── Write + download ──
      wb.xlsx.writeBuffer().then(function (buf) {
        var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = _settings.fileName;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);

        _showProgressDone(rows.length, _settings.fileName);
        setTimeout(_hideProgress, 4000);
      });

    } catch (ex) {
      _showProgressError('Export failed: ' + ex.message);
    }
  }

  /* ── Utility ────────────────────────────────────────────── */
  function _escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }
  function _escAttr(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  /* ── Public API ─────────────────────────────────────────── */
  return {
    open: open,
    _close: _close
  };

})();

// Modular skeleton hook (Faz 8) — group-export-excel is now an export loader module (modules/export/).
if (window.cc && cc.modules) cc.modules.register({ id: 'group-export-excel', parent: 'export', title: 'Excel export', mount: function () {}, unmount: function () {} });
