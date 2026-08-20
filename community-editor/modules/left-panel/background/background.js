/* Module: left-panel/background — Text / Icon / Image background-pattern features.
   Extracted VERBATIM from app.js (Faz 2). The bg color palette + CMYK stay in app.js
   (core canvas background); the effect objects are the sub-module effects/. Uses globals
   (canvas, addToCenter, fabric, getIcon…) unchanged. Self-inits on load (loader runs after
   DOMContentLoaded); the matching initApp calls were removed. All functions exposed on window. */
(function () {
  'use strict';

// ── 20c. Text Pattern Feature ────────────────────────────────
function initTextPattern() {
  var fontSel = document.getElementById('tp-font');
  if (!fontSel) return;

  // Populate font select from exposed Google Fonts list
  var fonts = window._GOOGLE_FONTS_LIST;
  if (fonts && fonts.length) {
    fontSel.innerHTML = '';
    fonts.forEach(function (f) {
      var opt = document.createElement('option');
      opt.value = f.name;
      opt.textContent = f.name;
      fontSel.appendChild(opt);
    });
    fontSel.value = 'DM Sans';
  }

  var opSlider = document.getElementById('tp-opacity');
  var opVal = document.getElementById('tp-opacity-val');
  if (opSlider) {
    opSlider.addEventListener('input', function () {
      if (opVal) opVal.textContent = opSlider.value + '%';
    });
  }

  var applyBtn = document.getElementById('tp-apply');
  if (applyBtn) applyBtn.addEventListener('click', applyTextPattern);

  var removeBtn = document.getElementById('tp-remove');
  if (removeBtn) removeBtn.addEventListener('click', removeTextPattern);
}

function applyTextPattern() {
  var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
  if (!cvs) return;

  var txt = (document.getElementById('tp-text') || {}).value || 'BRAND';
  var fontFamily = (document.getElementById('tp-font') || {}).value || 'DM Sans';
  var fontSize = parseInt((document.getElementById('tp-size') || {}).value) || 72;
  var fontWeight = (document.getElementById('tp-weight') || {}).value || '400';
  var charSpacing = parseInt((document.getElementById('tp-spacing') || {}).value) || 0;
  var angle = parseInt((document.getElementById('tp-angle') || {}).value) || -45;
  var cols = parseInt((document.getElementById('tp-cols') || {}).value) || 1;
  var rows = parseInt((document.getElementById('tp-rows') || {}).value) || 5;
  var gapX = parseInt((document.getElementById('tp-gap-x') || {}).value) || 40;
  var gapY = parseInt((document.getElementById('tp-gap-y') || {}).value) || 20;
  var color = (document.getElementById('tp-color') || {}).value || '#ffffff';
  var opacity = parseInt((document.getElementById('tp-opacity') || {}).value) || 20;

  // Remove existing text pattern
  removeTextPattern();

  // Load font first, then create objects
  var fontPromise = (typeof loadGoogleFont === 'function') ? loadGoogleFont(fontFamily) : Promise.resolve();
  fontPromise.then(function () {
    var cw = cvs.getWidth();
    var ch = cvs.getHeight();

    // Measure one text instance to calculate spacing
    var measure = new fabric.Text(txt, {
      fontFamily: fontFamily,
      fontSize: fontSize,
      fontWeight: fontWeight,
      charSpacing: charSpacing * 10,
      fill: color,
    });
    var tw = measure.width + gapX;
    var th = fontSize + gapY;

    // Expand coverage area to handle rotation overflow
    var diag = Math.sqrt(cw * cw + ch * ch);
    var expand = diag * 1.2;
    var startX = (cw - expand) / 2;
    var startY = (ch - expand) / 2;

    // Use user-specified row count, centered vertically
    var totalRows = rows;
    var totalHeight = totalRows * th - gapY;
    var rowWidth = cols * tw - gapX;
    var patStartY = (ch / 2) - (totalHeight / 2);

    var textObjs = [];
    for (var r = 0; r < totalRows; r++) {
      var rowY = patStartY + r * th;
      for (var c = 0; c < cols; c++) {
        // Center the row of N columns horizontally within the expanded area
        var rowStartX = cw / 2 - rowWidth / 2;
        var t = new fabric.Text(txt, {
          fontFamily: fontFamily,
          fontSize: fontSize,
          fontWeight: fontWeight,
          charSpacing: charSpacing * 10,
          fill: color,
          left: rowStartX + c * tw + measure.width / 2,
          top: rowY,
          originX: 'center',
          originY: 'center',
          selectable: false,
          evented: false,
        });
        textObjs.push(t);
      }
    }

    if (!textObjs.length) return;

    var group = new fabric.Group(textObjs, {
      left: cw / 2,
      top: ch / 2,
      originX: 'center',
      originY: 'center',
      angle: angle,
      opacity: opacity / 100,
      selectable: true,
      evented: true,
      _isTextPattern: true,
      _groupName: 'Text Pattern',
    });

    cvs.add(group);
    cvs.setActiveObject(group);
    cvs.renderAll();
    if (typeof snap === 'function') snap();
  });
}

function removeTextPattern() {
  var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
  if (!cvs) return;
  var objs = cvs.getObjects();
  for (var i = objs.length - 1; i >= 0; i--) {
    if (objs[i]._isTextPattern) cvs.remove(objs[i]);
  }
  cvs.renderAll();
}

// ── 20d. Icon Pattern Feature ────────────────────────────────
var _ipSelectedIcons = [];   // [{name, data, rotation, blur, scale}]
var _ipEditingIndex = -1;
var _ipPickerOpen = false;

function initIconPattern() {
  // Mode tabs
  var modeTabs = document.querySelectorAll('#ip-mode-tabs .ip-mode-btn');
  modeTabs.forEach(function(btn) {
    btn.addEventListener('click', function() {
      modeTabs.forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var mode = btn.getAttribute('data-mode');
      _ipEnforceModeLimit(mode);
    });
  });

  // Add icon button
  var addBtn = document.getElementById('ip-add-icon');
  if (addBtn) addBtn.addEventListener('click', function() { _ipTogglePicker(); });

  // Search
  var searchInput = document.getElementById('ip-search');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      _ipRenderIconGrid(searchInput.value.trim().toLowerCase());
    });
  }

  // Opacity slider
  var opSlider = document.getElementById('ip-opacity');
  var opVal = document.getElementById('ip-opacity-val');
  if (opSlider) {
    opSlider.addEventListener('input', function() {
      if (opVal) opVal.textContent = opSlider.value + '%';
    });
  }

  // Per-icon blur slider
  var blurSlider = document.getElementById('ip-icon-blur');
  var blurVal = document.getElementById('ip-icon-blur-val');
  if (blurSlider) {
    blurSlider.addEventListener('input', function() {
      if (blurVal) blurVal.textContent = blurSlider.value + 'px';
      if (_ipEditingIndex >= 0 && _ipSelectedIcons[_ipEditingIndex]) {
        _ipSelectedIcons[_ipEditingIndex].blur = parseFloat(blurSlider.value) || 0;
      }
    });
  }

  // Per-icon rotation
  var rotInput = document.getElementById('ip-icon-rotation');
  if (rotInput) {
    rotInput.addEventListener('change', function() {
      if (_ipEditingIndex >= 0 && _ipSelectedIcons[_ipEditingIndex]) {
        _ipSelectedIcons[_ipEditingIndex].rotation = parseInt(rotInput.value) || 0;
      }
    });
  }

  // Per-icon scale
  var scaleInput = document.getElementById('ip-icon-scale');
  if (scaleInput) {
    scaleInput.addEventListener('change', function() {
      if (_ipEditingIndex >= 0 && _ipSelectedIcons[_ipEditingIndex]) {
        _ipSelectedIcons[_ipEditingIndex].scale = parseFloat(scaleInput.value) || 1;
      }
    });
  }

  // Apply / Remove
  var applyBtn = document.getElementById('ip-apply');
  if (applyBtn) applyBtn.addEventListener('click', applyIconPattern);

  var removeBtn = document.getElementById('ip-remove');
  if (removeBtn) removeBtn.addEventListener('click', removeIconPattern);
}

function _ipGetMode() {
  var active = document.querySelector('#ip-mode-tabs .ip-mode-btn.active');
  return active ? active.getAttribute('data-mode') : 'single';
}

function _ipMaxIcons(mode) {
  if (mode === 'single') return 1;
  if (mode === 'dual') return 2;
  return 8; // mixed
}

function _ipEnforceModeLimit(mode) {
  var max = _ipMaxIcons(mode);
  while (_ipSelectedIcons.length > max) _ipSelectedIcons.pop();
  _ipEditingIndex = -1;
  _ipRenderSlots();
  _ipHideIconSettings();
}

function _ipTogglePicker() {
  var mode = _ipGetMode();
  var max = _ipMaxIcons(mode);
  if (_ipSelectedIcons.length >= max) return;
  var picker = document.getElementById('ip-picker');
  if (!picker) return;
  _ipPickerOpen = !_ipPickerOpen;
  picker.style.display = _ipPickerOpen ? '' : 'none';
  if (_ipPickerOpen) {
    _ipRenderIconGrid('');
    var s = document.getElementById('ip-search');
    if (s) { s.value = ''; s.focus(); }
  }
}

function _ipRenderIconGrid(filter) {
  var grid = document.getElementById('ip-icon-grid');
  if (!grid || typeof CANVAS_ICONS === 'undefined') return;
  grid.innerHTML = '';
  var cats = Object.keys(CANVAS_ICONS);
  var count = 0;
  for (var ci = 0; ci < cats.length; ci++) {
    var catName = cats[ci];
    var entries = Object.entries(CANVAS_ICONS[catName]);
    for (var ei = 0; ei < entries.length; ei++) {
      var name = entries[ei][0];
      var data = entries[ei][1];
      if (filter && name.toLowerCase().indexOf(filter) === -1) continue;
      if (count > 120) break;
      var svgHtml = getCanvasIconSvgMarkup(data, 22, 'var(--text)');
      var cell = document.createElement('div');
      cell.className = 'ip-grid-cell';
      cell.title = name;
      cell.innerHTML = svgHtml;
      cell.setAttribute('data-icon-name', name);
      cell.setAttribute('data-icon-cat', catName);
      cell.addEventListener('click', (function(n, d) {
        return function() { _ipAddIcon(n, d); };
      })(name, data));
      grid.appendChild(cell);
      count++;
    }
  }
  if (count === 0) {
    grid.innerHTML = '<div style="color:var(--text-dim);font-size:11px;padding:8px;text-align:center">No icons found</div>';
  }
}

function _ipAddIcon(name, data) {
  var mode = _ipGetMode();
  var max = _ipMaxIcons(mode);
  if (_ipSelectedIcons.length >= max) return;
  _ipSelectedIcons.push({ name: name, data: data, rotation: 0, blur: 0, scale: 1 });
  _ipRenderSlots();
  // Close picker if limit reached
  if (_ipSelectedIcons.length >= max) {
    _ipPickerOpen = false;
    var picker = document.getElementById('ip-picker');
    if (picker) picker.style.display = 'none';
  }
}

function _ipRenderSlots() {
  var container = document.getElementById('ip-icon-slots');
  if (!container) return;
  container.innerHTML = '';
  var mode = _ipGetMode();
  var max = _ipMaxIcons(mode);

  for (var i = 0; i < _ipSelectedIcons.length; i++) {
    var ic = _ipSelectedIcons[i];
    var slot = document.createElement('div');
    slot.className = 'ip-slot ip-slot-filled' + (_ipEditingIndex === i ? ' ip-slot-active' : '');
    var svg = getCanvasIconSvgMarkup(ic.data, 22, 'var(--gold)');
    slot.innerHTML = svg + '<span class="ip-slot-name">' + ic.name + '</span>' +
      '<span class="ip-slot-remove" title="Remove">&times;</span>';
    (function(idx) {
      slot.addEventListener('click', function(e) {
        if (e.target.classList.contains('ip-slot-remove')) {
          _ipSelectedIcons.splice(idx, 1);
          if (_ipEditingIndex === idx) { _ipEditingIndex = -1; _ipHideIconSettings(); }
          else if (_ipEditingIndex > idx) _ipEditingIndex--;
          _ipRenderSlots();
          return;
        }
        _ipEditIcon(idx);
      });
    })(i);
    container.appendChild(slot);
  }

  // Add button
  if (_ipSelectedIcons.length < max) {
    var addSlot = document.createElement('div');
    addSlot.className = 'ip-slot ip-slot-add';
    addSlot.title = 'Add icon';
    addSlot.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
    addSlot.addEventListener('click', function() { _ipTogglePicker(); });
    container.appendChild(addSlot);
  }
}

function _ipEditIcon(idx) {
  if (!_ipSelectedIcons[idx]) return;
  _ipEditingIndex = idx;
  _ipRenderSlots();
  var ic = _ipSelectedIcons[idx];
  var panel = document.getElementById('ip-icon-settings');
  var nameEl = document.getElementById('ip-editing-name');
  var rotInput = document.getElementById('ip-icon-rotation');
  var blurSlider = document.getElementById('ip-icon-blur');
  var blurVal = document.getElementById('ip-icon-blur-val');
  var scaleInput = document.getElementById('ip-icon-scale');
  if (panel) panel.style.display = '';
  if (nameEl) nameEl.textContent = ic.name;
  if (rotInput) rotInput.value = ic.rotation || 0;
  if (blurSlider) { blurSlider.value = ic.blur || 0; }
  if (blurVal) blurVal.textContent = (ic.blur || 0) + 'px';
  if (scaleInput) scaleInput.value = ic.scale || 1;
}

function _ipHideIconSettings() {
  var panel = document.getElementById('ip-icon-settings');
  if (panel) panel.style.display = 'none';
}

function applyIconPattern() {
  var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
  if (!cvs || !_ipSelectedIcons.length) return;

  var iconSize = parseInt((document.getElementById('ip-size') || {}).value) || 32;
  var cols = parseInt((document.getElementById('ip-cols') || {}).value) || 5;
  var rows = parseInt((document.getElementById('ip-rows') || {}).value) || 5;
  var gapX = parseInt((document.getElementById('ip-gap-x') || {}).value) || 30;
  var gapY = parseInt((document.getElementById('ip-gap-y') || {}).value) || 30;
  var angle = parseInt((document.getElementById('ip-angle') || {}).value) || 0;
  var color = (document.getElementById('ip-color') || {}).value || '#ffffff';
  var opacity = parseInt((document.getElementById('ip-opacity') || {}).value) || 20;
  var offset = document.getElementById('ip-offset') && document.getElementById('ip-offset').checked;

  removeIconPattern();

  var cw = cvs.getWidth();
  var ch = cvs.getHeight();

  // Build SVG strings for each selected icon
  var svgStrings = _ipSelectedIcons.map(function(ic) {
    var sz = Math.round(iconSize * (ic.scale || 1));
    return {
      svg: getCanvasIconSvgMarkup(ic.data, sz, color),
      rotation: ic.rotation || 0,
      blur: ic.blur || 0,
      scale: ic.scale || 1,
      size: sz
    };
  });

  // Calculate grid dimensions
  var cellW = iconSize + gapX;
  var cellH = iconSize + gapY;
  var totalW = cols * cellW - gapX;
  var totalH = rows * cellH - gapY;
  var startX = (cw / 2) - (totalW / 2);
  var startY = (ch / 2) - (totalH / 2);

  var pending = cols * rows;
  var fabricObjs = [];
  var completedCount = 0;

  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < cols; c++) {
      var idx = (r * cols + c) % svgStrings.length;
      var iconInfo = svgStrings[idx];
      var x = startX + c * cellW + iconSize / 2;
      var y = startY + r * cellH + iconSize / 2;
      if (offset && r % 2 === 1) x += cellW / 2;

      (function(svgStr, posX, posY, rot, blur, sz, cellIdx) {
        fabric.loadSVGFromString(svgStr, function(objects, options) {
          var obj;
          if (objects.length === 1) {
            obj = objects[0];
          } else {
            obj = fabric.util.groupSVGElements(objects, options);
          }
          // Scale to desired size
          var bw = Math.max(1, obj.width || sz);
          var bh = Math.max(1, obj.height || sz);
          var sc = Math.min(sz / bw, sz / bh);
          obj.set({
            scaleX: sc,
            scaleY: sc,
            left: posX,
            top: posY,
            originX: 'center',
            originY: 'center',
            angle: rot,
            selectable: false,
            evented: false,
          });
          if (blur > 0) {
            obj.filters = obj.filters || [];
            // fabric.js blur filter not available for SVG paths easily,
            // store blur value and apply via shadow instead
            obj.set({ shadow: new fabric.Shadow({ blur: blur * 3, color: color, offsetX: 0, offsetY: 0 }) });
          }
          obj._ipCellIndex = cellIdx;
          fabricObjs.push(obj);
          completedCount++;
          if (completedCount >= pending) {
            _ipFinalizeGroup(cvs, fabricObjs, angle, opacity, cw, ch);
          }
        });
      })(iconInfo.svg, x, y, iconInfo.rotation, iconInfo.blur, iconInfo.size, r * cols + c);
    }
  }
}

function _ipFinalizeGroup(cvs, objs, angle, opacity, cw, ch) {
  if (!objs.length) return;
  // Sort by cell index for consistent ordering
  objs.sort(function(a, b) { return (a._ipCellIndex || 0) - (b._ipCellIndex || 0); });

  var group = new fabric.Group(objs, {
    left: cw / 2,
    top: ch / 2,
    originX: 'center',
    originY: 'center',
    angle: angle,
    opacity: opacity / 100,
    selectable: true,
    evented: true,
    _isIconPattern: true,
    _groupName: 'Icon Pattern',
  });

  cvs.add(group);
  cvs.setActiveObject(group);
  cvs.renderAll();
  if (typeof snap === 'function') snap();
}

function removeIconPattern() {
  var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
  if (!cvs) return;
  var objs = cvs.getObjects();
  for (var i = objs.length - 1; i >= 0; i--) {
    if (objs[i]._isIconPattern) cvs.remove(objs[i]);
  }
  cvs.renderAll();
}

// ── 20e. Image Pattern Feature ───────────────────────────────
var _imgPatImages = [];  // [{src (dataURL or url), name, rotation, blur, scale}]
var _imgPatEditIdx = -1;
var _imgPatGalFolder = null; // null = root, string = folder id

function initImagePattern() {
  // Tab switching (Gallery / Upload)
  var tabBtns = document.querySelectorAll('#imgp-src-tabs .ip-mode-btn');
  for (var t = 0; t < tabBtns.length; t++) {
    (function(btn) {
      btn.addEventListener('click', function() {
        for (var b = 0; b < tabBtns.length; b++) tabBtns[b].classList.remove('active');
        btn.classList.add('active');
        var tab = btn.getAttribute('data-tab');
        var galPanel = document.getElementById('imgp-gallery-panel');
        var upPanel = document.getElementById('imgp-upload-panel');
        if (galPanel) galPanel.style.display = tab === 'gallery' ? '' : 'none';
        if (upPanel) upPanel.style.display = tab === 'upload' ? '' : 'none';
        if (tab === 'gallery') _imgPatRenderGallery();
      });
    })(tabBtns[t]);
  }

  // Upload drop zone
  var dropZone = document.getElementById('imgp-drop-zone');
  var fileInput = document.getElementById('imgp-file-input');
  if (dropZone) {
    dropZone.addEventListener('click', function() { if (fileInput) fileInput.click(); });
    dropZone.addEventListener('dragover', function(e) { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', function() { dropZone.classList.remove('dragover'); });
    dropZone.addEventListener('drop', function(e) {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      _imgPatHandleFiles(e.dataTransfer.files);
    });
  }
  if (fileInput) {
    fileInput.addEventListener('change', function(e) {
      _imgPatHandleFiles(e.target.files);
      fileInput.value = '';
    });
  }

  // Gallery search
  var galSearch = document.getElementById('imgp-gal-search');
  if (galSearch) {
    galSearch.addEventListener('input', function() { _imgPatRenderGallery(); });
  }

  // Opacity slider
  var opSlider = document.getElementById('imgp-opacity');
  var opVal = document.getElementById('imgp-opacity-val');
  if (opSlider) {
    opSlider.addEventListener('input', function() {
      if (opVal) opVal.textContent = opSlider.value + '%';
    });
  }

  // Per-image blur slider
  var blurSlider = document.getElementById('imgp-img-blur');
  var blurVal = document.getElementById('imgp-img-blur-val');
  if (blurSlider) {
    blurSlider.addEventListener('input', function() {
      if (blurVal) blurVal.textContent = blurSlider.value + 'px';
      if (_imgPatEditIdx >= 0 && _imgPatImages[_imgPatEditIdx]) {
        _imgPatImages[_imgPatEditIdx].blur = parseFloat(blurSlider.value) || 0;
      }
    });
  }

  // Per-image rotation
  var rotInput = document.getElementById('imgp-img-rotation');
  if (rotInput) {
    rotInput.addEventListener('change', function() {
      if (_imgPatEditIdx >= 0 && _imgPatImages[_imgPatEditIdx]) {
        _imgPatImages[_imgPatEditIdx].rotation = parseInt(rotInput.value) || 0;
      }
    });
  }

  // Per-image scale
  var scaleInput = document.getElementById('imgp-img-scale');
  if (scaleInput) {
    scaleInput.addEventListener('change', function() {
      if (_imgPatEditIdx >= 0 && _imgPatImages[_imgPatEditIdx]) {
        _imgPatImages[_imgPatEditIdx].scale = parseFloat(scaleInput.value) || 1;
      }
    });
  }

  // Random rotation range
  var randRotSlider = document.getElementById('imgp-rand-rot');
  var randRotVal = document.getElementById('imgp-rand-rot-val');
  if (randRotSlider) {
    randRotSlider.addEventListener('input', function() {
      if (randRotVal) randRotVal.textContent = '\u00b1' + randRotSlider.value + '\u00b0';
    });
  }

  // Random blur range
  var randBlurSlider = document.getElementById('imgp-rand-blur');
  var randBlurVal = document.getElementById('imgp-rand-blur-val');
  if (randBlurSlider) {
    randBlurSlider.addEventListener('input', function() {
      if (randBlurVal) randBlurVal.textContent = '0\u2013' + randBlurSlider.value + 'px';
    });
  }

  // Random scale range
  var randScaleSlider = document.getElementById('imgp-rand-scale');
  var randScaleVal = document.getElementById('imgp-rand-scale-val');
  if (randScaleSlider) {
    randScaleSlider.addEventListener('input', function() {
      if (randScaleVal) randScaleVal.textContent = '0.5\u2013' + parseFloat(randScaleSlider.value).toFixed(1) + 'x';
    });
  }

  // Randomize enable/disable toggle
  var randCheck = document.getElementById('imgp-random');
  var randControls = document.getElementById('imgp-rand-controls');
  if (randCheck && randControls) {
    randCheck.addEventListener('change', function() {
      randControls.style.display = randCheck.checked ? '' : 'none';
    });
  }

  // Apply / Remove
  var applyBtn = document.getElementById('imgp-apply');
  if (applyBtn) applyBtn.addEventListener('click', applyImagePattern);

  var removeBtn = document.getElementById('imgp-remove');
  if (removeBtn) removeBtn.addEventListener('click', removeImagePattern);

  // Initial gallery render
  _imgPatRenderGallery();
}

function _imgPatHandleFiles(files) {
  if (!files || !files.length) return;
  for (var i = 0; i < files.length && _imgPatImages.length < 8; i++) {
    (function(file) {
      var reader = new FileReader();
      reader.onload = function(ev) {
        _imgPatImages.push({ src: ev.target.result, name: file.name, rotation: 0, blur: 0, scale: 1 });
        _imgPatRenderSlots();
        _imgPatUpdateCount();
      };
      reader.readAsDataURL(file);
    })(files[i]);
  }
}

function _imgPatUpdateCount() {
  var el = document.getElementById('imgp-count');
  if (el) el.textContent = _imgPatImages.length;
}

function _imgPatRenderGallery() {
  var grid = document.getElementById('imgp-gal-grid');
  var emptyEl = document.getElementById('imgp-gal-empty');
  var bcEl = document.getElementById('imgp-gal-breadcrumb');
  if (!grid) return;
  grid.innerHTML = '';
  if (bcEl) bcEl.innerHTML = '';

  var searchTerm = ((document.getElementById('imgp-gal-search') || {}).value || '').toLowerCase().trim();
  // Read from in-memory gallery store (IndexedDB-backed)
  var store = (typeof _galStore === 'function') ? _galStore() : null;
  if (!store && typeof _galMemStore !== 'undefined') store = _galMemStore;

  var allFolders = [];

  if (store) {
    if (store.folders && store.folders.length) {
      for (var fi = 0; fi < store.folders.length; fi++) {
        var f = store.folders[fi];
        if (f.images && f.images.length) {
          allFolders.push({ id: f.id || ('f' + fi), name: f.name || 'Folder', icon: f.icon || '', images: f.images });
        }
      }
    }
    if (store.recent && store.recent.length) {
      allFolders.unshift({ id: '__recent', name: 'Recent', icon: '', images: store.recent });
    }
  }

  // Breadcrumb
  if (_imgPatGalFolder && bcEl) {
    var homeSpan = document.createElement('span');
    homeSpan.textContent = '\u2302 All';
    homeSpan.addEventListener('click', function() {
      _imgPatGalFolder = null;
      _imgPatRenderGallery();
    });
    bcEl.appendChild(homeSpan);
    var sep = document.createElement('span');
    sep.textContent = ' \u203a ';
    sep.style.cursor = 'default';
    bcEl.appendChild(sep);
    var currentFolder = null;
    for (var ci = 0; ci < allFolders.length; ci++) {
      if (allFolders[ci].id === _imgPatGalFolder) { currentFolder = allFolders[ci]; break; }
    }
    var curSpan = document.createElement('span');
    curSpan.className = 'active';
    curSpan.textContent = currentFolder ? currentFolder.name : 'Folder';
    bcEl.appendChild(curSpan);
  }

  var hasContent = false;

  if (!_imgPatGalFolder) {
    // Root: show folders + ungrouped images
    for (var gi = 0; gi < allFolders.length; gi++) {
      var folder = allFolders[gi];
      if (searchTerm) {
        // When searching, show matching images from all folders flat
        for (var si = 0; si < folder.images.length; si++) {
          var imgSrc = folder.images[si];
          var imgName = (store.imageNames && store.imageNames[imgSrc]) || folder.name;
          if (imgName.toLowerCase().indexOf(searchTerm) === -1 && folder.name.toLowerCase().indexOf(searchTerm) === -1) continue;
          _imgPatAddGalCell(grid, imgSrc, imgName);
          hasContent = true;
        }
      } else {
        // Show folder chips
        if (folder.images.length > 0) {
          var fCell = document.createElement('div');
          fCell.className = 'imgp-gal-folder';
          fCell.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' +
            '<span>' + folder.name + ' (' + folder.images.length + ')</span>';
          (function(fid) {
            fCell.addEventListener('click', function() {
              _imgPatGalFolder = fid;
              _imgPatRenderGallery();
            });
          })(folder.id);
          grid.appendChild(fCell);
          hasContent = true;
        }
      }
    }
  } else {
    // Inside a folder: show images
    var folder = null;
    for (var fi2 = 0; fi2 < allFolders.length; fi2++) {
      if (allFolders[fi2].id === _imgPatGalFolder) { folder = allFolders[fi2]; break; }
    }
    if (folder) {
      for (var ii = 0; ii < folder.images.length; ii++) {
        var src = folder.images[ii];
        var nm = (store && store.imageNames && store.imageNames[src]) || folder.name;
        if (searchTerm && nm.toLowerCase().indexOf(searchTerm) === -1) continue;
        _imgPatAddGalCell(grid, src, nm);
        hasContent = true;
      }
    }
  }

  if (emptyEl) emptyEl.style.display = hasContent ? 'none' : '';
}

function _imgPatAddGalCell(grid, src, name) {
  var cell = document.createElement('div');
  cell.className = 'imgp-gal-cell';
  // Check if already selected
  for (var s = 0; s < _imgPatImages.length; s++) {
    if (_imgPatImages[s].src === src) { cell.classList.add('selected'); break; }
  }
  var img = document.createElement('img');
  img.src = src;
  img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:6px';
  img.loading = 'lazy';
  cell.appendChild(img);
  cell.addEventListener('click', function() {
    if (_imgPatImages.length >= 8) return;
    _imgPatImages.push({ src: src, name: name || 'Image', rotation: 0, blur: 0, scale: 1 });
    _imgPatRenderSlots();
    _imgPatUpdateCount();
    cell.classList.add('selected');
  });
  grid.appendChild(cell);
}

function _imgPatRenderSlots() {
  var container = document.getElementById('imgp-slots');
  if (!container) return;
  container.innerHTML = '';

  for (var i = 0; i < _imgPatImages.length; i++) {
    var img = _imgPatImages[i];
    var slot = document.createElement('div');
    slot.className = 'imgp-slot imgp-slot-filled' + (_imgPatEditIdx === i ? ' imgp-slot-active' : '');
    slot.innerHTML = '<img src="' + img.src + '" style="width:36px;height:36px;object-fit:cover;border-radius:6px">' +
      '<span class="imgp-slot-name">' + (img.name || 'Image').substring(0, 10) + '</span>' +
      '<span class="imgp-slot-remove" title="Remove">&times;</span>';
    (function(idx) {
      slot.addEventListener('click', function(e) {
        if (e.target.classList.contains('imgp-slot-remove')) {
          _imgPatImages.splice(idx, 1);
          if (_imgPatEditIdx === idx) { _imgPatEditIdx = -1; _imgPatHideSettings(); }
          else if (_imgPatEditIdx > idx) _imgPatEditIdx--;
          _imgPatRenderSlots();
          _imgPatUpdateCount();
          _imgPatRenderGallery(); // refresh selected state
          return;
        }
        _imgPatEditImage(idx);
      });
    })(i);
    container.appendChild(slot);
  }
}

function _imgPatEditImage(idx) {
  if (!_imgPatImages[idx]) return;
  _imgPatEditIdx = idx;
  _imgPatRenderSlots();
  var img = _imgPatImages[idx];
  var panel = document.getElementById('imgp-img-settings');
  var nameEl = document.getElementById('imgp-editing-name');
  var rotInput = document.getElementById('imgp-img-rotation');
  var blurSlider = document.getElementById('imgp-img-blur');
  var blurVal = document.getElementById('imgp-img-blur-val');
  var scaleInput = document.getElementById('imgp-img-scale');
  if (panel) panel.style.display = '';
  if (nameEl) nameEl.textContent = (img.name || 'Image').substring(0, 20);
  if (rotInput) rotInput.value = img.rotation || 0;
  if (blurSlider) blurSlider.value = img.blur || 0;
  if (blurVal) blurVal.textContent = (img.blur || 0) + 'px';
  if (scaleInput) scaleInput.value = img.scale || 1;
}

function _imgPatHideSettings() {
  var panel = document.getElementById('imgp-img-settings');
  if (panel) panel.style.display = 'none';
}

function applyImagePattern() {
  var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
  if (!cvs || !_imgPatImages.length) return;

  var imgSize = parseInt((document.getElementById('imgp-size') || {}).value) || 48;
  var cols = parseInt((document.getElementById('imgp-cols') || {}).value) || 4;
  var rows = parseInt((document.getElementById('imgp-rows') || {}).value) || 4;
  var gapX = parseInt((document.getElementById('imgp-gap-x') || {}).value) || 30;
  var gapY = parseInt((document.getElementById('imgp-gap-y') || {}).value) || 30;
  var angle = parseInt((document.getElementById('imgp-angle') || {}).value) || 0;
  var opacity = parseInt((document.getElementById('imgp-opacity') || {}).value) || 20;
  var offset = document.getElementById('imgp-offset') && document.getElementById('imgp-offset').checked;
  var useRandom = document.getElementById('imgp-random') && document.getElementById('imgp-random').checked;
  var randRot = parseFloat((document.getElementById('imgp-rand-rot') || {}).value) || 0;
  var randBlur = parseFloat((document.getElementById('imgp-rand-blur') || {}).value) || 0;
  var randScale = parseFloat((document.getElementById('imgp-rand-scale') || {}).value) || 1;

  removeImagePattern();

  var cw = cvs.getWidth();
  var ch = cvs.getHeight();
  var cellW = imgSize + gapX;
  var cellH = imgSize + gapY;
  var totalW = cols * cellW - gapX;
  var totalH = rows * cellH - gapY;
  var startX = (cw / 2) - (totalW / 2);
  var startY = (ch / 2) - (totalH / 2);

  var pending = cols * rows;
  var fabricObjs = [];
  var completedCount = 0;

  // Build shuffled image index array so same images don't line up
  var imgIndices = [];
  for (var _ii = 0; _ii < pending; _ii++) imgIndices.push(_ii % _imgPatImages.length);
  if (useRandom && _imgPatImages.length > 1) {
    // Fisher-Yates shuffle
    for (var _si = imgIndices.length - 1; _si > 0; _si--) {
      var _sj = Math.floor(Math.random() * (_si + 1));
      var _tmp = imgIndices[_si]; imgIndices[_si] = imgIndices[_sj]; imgIndices[_sj] = _tmp;
    }
  }

  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < cols; c++) {
      var cellNum = r * cols + c;
      var idx = imgIndices[cellNum];
      var imgInfo = _imgPatImages[idx];
      var x = startX + c * cellW + imgSize / 2;
      var y = startY + r * cellH + imgSize / 2;
      if (offset && r % 2 === 1) x += cellW / 2;

      // Determine per-cell rotation/blur/scale
      var cellRot = imgInfo.rotation || 0;
      var cellBlur = imgInfo.blur || 0;
      var cellScale = imgInfo.scale || 1;
      if (useRandom) {
        cellRot += Math.round((Math.random() * 2 - 1) * randRot);
        cellBlur += Math.random() * randBlur;
        // Scale: random between 0.5 and randScale
        var minScale = 0.5;
        cellScale *= (minScale + Math.random() * (randScale - minScale));
      }

      // Position jitter: scatter images away from grid lines
      if (useRandom) {
        var jitterX = cellW * 0.4; // 40% of cell width
        var jitterY = cellH * 0.4;
        x += Math.round((Math.random() * 2 - 1) * jitterX);
        y += Math.round((Math.random() * 2 - 1) * jitterY);
      }

      var sz = Math.round(imgSize * cellScale);

      (function(src, posX, posY, rot, blur, size, cellIdx) {
        fabric.Image.fromURL(src, function(fImg) {
          var bw = Math.max(1, fImg.width);
          var bh = Math.max(1, fImg.height);
          var sc = Math.min(size / bw, size / bh);
          fImg.set({
            scaleX: sc,
            scaleY: sc,
            left: posX,
            top: posY,
            originX: 'center',
            originY: 'center',
            angle: rot,
            selectable: false,
            evented: false,
          });
          if (blur > 0) {
            fImg.filters = fImg.filters || [];
            fImg.filters.push(new fabric.Image.filters.Blur({ blur: blur / 10 }));
            fImg.applyFilters();
          }
          fImg._imgpCellIndex = cellIdx;
          fabricObjs.push(fImg);
          completedCount++;
          if (completedCount >= pending) {
            _imgPatFinalizeGroup(cvs, fabricObjs, angle, opacity, cw, ch);
          }
        }, { crossOrigin: 'anonymous' });
      })(imgInfo.src, x, y, cellRot, cellBlur, sz, r * cols + c);
    }
  }
}

function _imgPatFinalizeGroup(cvs, objs, angle, opacity, cw, ch) {
  if (!objs.length) return;
  objs.sort(function(a, b) { return (a._imgpCellIndex || 0) - (b._imgpCellIndex || 0); });

  var group = new fabric.Group(objs, {
    left: cw / 2,
    top: ch / 2,
    originX: 'center',
    originY: 'center',
    angle: angle,
    opacity: opacity / 100,
    selectable: true,
    evented: true,
    _isImagePattern: true,
    _groupName: 'Image Pattern',
  });

  cvs.add(group);
  cvs.setActiveObject(group);
  cvs.renderAll();
  if (typeof snap === 'function') snap();
}

function removeImagePattern() {
  var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
  if (!cvs) return;
  var objs = cvs.getObjects();
  for (var i = objs.length - 1; i >= 0; i--) {
    if (objs[i]._isImagePattern) cvs.remove(objs[i]);
  }
  cvs.renderAll();
}

  // Page background color (solid/gradient/image) + CMYK now live in the right panel
  // (modules/right-panel/, no-selection Background section). The old left-panel solid-color
  // palette + Custom input + CMYK picker were removed; this module is now patterns/effects only.

  // expose every function (covers inline onclicks + cross-file callers)
  window.initTextPattern = initTextPattern;
  window.applyTextPattern = applyTextPattern;
  window.removeTextPattern = removeTextPattern;
  window.initIconPattern = initIconPattern;
  window._ipGetMode = _ipGetMode;
  window._ipMaxIcons = _ipMaxIcons;
  window._ipEnforceModeLimit = _ipEnforceModeLimit;
  window._ipTogglePicker = _ipTogglePicker;
  window._ipRenderIconGrid = _ipRenderIconGrid;
  window._ipAddIcon = _ipAddIcon;
  window._ipRenderSlots = _ipRenderSlots;
  window._ipEditIcon = _ipEditIcon;
  window._ipHideIconSettings = _ipHideIconSettings;
  window.applyIconPattern = applyIconPattern;
  window._ipFinalizeGroup = _ipFinalizeGroup;
  window.removeIconPattern = removeIconPattern;
  window.initImagePattern = initImagePattern;
  window._imgPatHandleFiles = _imgPatHandleFiles;
  window._imgPatUpdateCount = _imgPatUpdateCount;
  window._imgPatRenderGallery = _imgPatRenderGallery;
  window._imgPatAddGalCell = _imgPatAddGalCell;
  window._imgPatRenderSlots = _imgPatRenderSlots;
  window._imgPatEditImage = _imgPatEditImage;
  window._imgPatHideSettings = _imgPatHideSettings;
  window.applyImagePattern = applyImagePattern;
  window._imgPatFinalizeGroup = _imgPatFinalizeGroup;
  window.removeImagePattern = removeImagePattern;

  // self-init when this module loads (replaces the removed initApp calls)
  try { if (typeof initTextPattern === 'function') initTextPattern(); } catch (e) { console.error('[background] initTextPattern', e); }
  try { if (typeof initIconPattern === 'function') initIconPattern(); } catch (e) { console.error('[background] initIconPattern', e); }
  try { if (typeof initImagePattern === 'function') initImagePattern(); } catch (e) { console.error('[background] initImagePattern', e); }

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'background', parent: 'left-panel', title: 'Background', icon: 'image', mount: function () {}, unmount: function () {} });
  }
})();
