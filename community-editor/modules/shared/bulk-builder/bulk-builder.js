/* shared/bulk-builder: the Bulk Builder WIZARD (modal UI only; P0.1-P0.2 2026-07-18).
   Moved from core/bulk-builder.js into the module tree; all pure merge logic (field
   collection, CSV/XLSX parsing, per-row apply) now lives in the child module
   engine/engine.js as window.CCBulk. This file owns: the gear-menu entry, the 3-step
   modal, mapping state, page creation/splicing + group wiring. CCBulk is resolved at
   CALL time (child modules load after the parent), never at load time. */
(function () {
  var MODAL_ID = 'bulk-builder-overlay';
  var FILE_INPUT_ID = 'bulk-builder-file';
  var state = {
    mode: '',             // '' (choose screen) | 'excel' | 'ai' (Variations Generator) | 'products'
    step: 1,
    fileName: '',
    headers: [],
    rows: [],
    fields: [],
    mapping: {},
    fileUploads: {},
    groupName: '',
    labelColumn: '',
    openDropdown: '',
    creating: false,
    progress: 0,
    total: 0,
    aiBrief: '',          // AI mode: the plain-language brief
    aiFieldNotes: {},     // AI mode: per-field extra instruction
    aiProvider: '',       // AI mode: active AI provider (for the model picker label)
    aiModel: '',          // AI mode: chosen chat model (defaults to the active one)
    aiPickerOpen: false,  // AI mode: model list expanded
    aiBusy: false,
    aiError: '',
    aiRun: null,          // AI mode: active batch run (phase/total/done/labels/pages) or null
    aiPages: null,        // AI mode: multi-page selection list (page tabs) or null when single-page
    aiFocus: 0,           // AI mode: which page tab's fields/preview are shown
    /* Products mode (docs/bulk-builder-products-source-plan.md). The picker's own state; step 2
       and 3 stay untouched because it ends by filling the SAME headers/rows/mapping. */
    prodFilter: null,     // { q, category, brandIds[], brandNone, attrs, sort }
    prodItems: [],        // the pages loaded into the picker grid (browsing, not the selection)
    prodTotal: 0,
    prodBrands: [],       // org brand list from the payload (id -> name), for the row builder
    prodCats: null,
    prodAttrs: null,
    prodSel: null,        // manual selection: { <productId>: <item> }
    prodAll: false,       // "every product matching the filter" (the grid is only a window on it)
    prodLoading: false,
    prodError: '',
    prodBusy: false,      // the Continue fetch is running
    prodNote: '',         // progress line under the Continue button
    prodFetch: null,      // active fetchAll handle (cancellable)
    prodStats: null,      // toRows stats: how many products have no image / no price
    /* Natural sizes of the images this run will place, measured once and shared by the preview
       and the writers. ONLY filled when the template has a clip frame (nothing else needs it). */
    imageSizes: {},
    measureTotal: 0,
    measureDone: 0,
    _hasClip: null
  };

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function lucideIcon(name, size) {
    size = size || 16;
    if (typeof _getLucideIconNode === 'function' && typeof _renderLucideChild === 'function') {
      var node = _getLucideIconNode(name);
      if (node) {
        return '<svg class="bb-icon-svg" xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          node.map(function (child) { return _renderLucideChild(child); }).join('') +
          '</svg>';
      }
    }
    if (typeof getIcon === 'function') return getIcon(name, size);
    return '';
  }

  function closeGearMenu() {
    var gearDrop = document.getElementById('gear-dropdown');
    if (gearDrop) gearDrop.classList.remove('show');
  }

  function showError(msg) {
    if (typeof showToast === 'function') showToast(msg, 'error');
  }

  function getPageLabel(row, index) {
    var header = state.labelColumn || '';
    var value = header ? CCBulk.normalizeTextValue(row[header]).trim() : '';
    var word = state._deckMode ? 'Slide ' : (state._sceneMode ? 'Frame ' : 'Page ');
    return value || (word + (index + 1));
  }

  /* The in-place re-run key stamped on every generated part (_bbRowKey). ONE definition: the slide
     and frame writers had their own copies of it and must never drift from the page writer.
     Products mode keys on the PRODUCT ID, because a name or a price can change between two runs and
     the page must still recognise itself; keying on the label would append a second copy of every
     edited product instead of updating it. Every other mode keeps the original rule (the chosen
     label column, else the ordinal). */
  function rowKeyFor(row, index) {
    if (state.mode === 'products' && row && row['product-id']) return String(row['product-id']);
    var key = state.labelColumn ? CCBulk.normalizeTextValue(row[state.labelColumn]).trim() : '';
    return key || ('row-' + (index + 1));
  }

  function getDefaultGroupName() {
    var page = (typeof pages !== 'undefined' && pages[currentPageIndex]) ? pages[currentPageIndex] : null;
    return ((page && page.label) ? page.label : 'Template') + ' Bulk';
  }

  /* Returns { page, deckMode, slide } : deckMode: the template is the ACTIVE SLIDE and
     generation targets the same deck's slides[] (P2, S9). Boards stay unsupported. */
  function ensureSourceReady() {
    if (typeof pages === 'undefined' || !pages || !pages.length) {
      showError('No active page found.');
      return null;
    }
    var page = pages[currentPageIndex];
    if (!page) {
      showError('No active page found.');
      return null;
    }
    if (page._isBoard) {
      showError('Bulk Builder does not support boards yet.');
      return null;
    }
    if (typeof pageHasSlideDeck === 'function' && pageHasSlideDeck(page)) {
      if (typeof saveCurrentInnerSlide === 'function') saveCurrentInnerSlide();
      var slide = typeof getActiveInnerSlide === 'function' ? getActiveInnerSlide(page) : null;
      if (!slide || !slide.json) {
        showError('Active slide has no saved content yet.');
        return null;
      }
      return { page: page, deckMode: true, slide: slide };
    }
    if (page._productType === 'scene' && page._scene) {
      // Scene: the template is the SELECTED frame (or the first one), P2 S10
      if (typeof _scSerializeWorld === 'function') _scSerializeWorld(page);
      var frame = null;
      if (typeof _scSelectedFrames === 'function') {
        var sel = _scSelectedFrames();
        if (sel && sel.length && sel[0]._frameId && typeof _scFindFrameModel === 'function') {
          frame = _scFindFrameModel(sel[0]._frameId);
        }
      }
      if (!frame) frame = (page._scene.frames && page._scene.frames[0]) || null;
      if (!frame || !frame.json) {
        showError('Select a frame with content first.');
        return null;
      }
      return { page: page, deckMode: false, sceneMode: true, frame: frame };
    }
    if (typeof saveCurrentPage === 'function') saveCurrentPage();
    if (!page.json) {
      showError('Active page has no saved canvas content yet.');
      return null;
    }
    return { page: page, deckMode: false, slide: null };
  }

  function getMappedFieldCount() {
    var count = 0;
    Object.keys(state.mapping).forEach(function (field) {
      if (state.mapping[field]) count++;
    });
    // Count file-uploaded grid cell fields as mapped too
    Object.keys(state.fileUploads).forEach(function (field) {
      if (state.fileUploads[field] && !state.mapping[field]) count++;
    });
    return count;
  }

  function toggleDropdown(key) {
    state.openDropdown = state.openDropdown === key ? '' : key;
    renderModal();
  }

  function closeDropdowns() {
    if (!state.openDropdown) return;
    state.openDropdown = '';
    renderModal();
  }

  /* `icon` (lucide name) rides on the trigger so a row of dropdowns reads as WHAT each one filters;
     an option may carry its own `glyph` (raw html, e.g. a brand logo or colour chip) which then
     replaces that icon while it is the selected value. Both are optional: every existing caller
     keeps the plain text control it had. */
  function renderDropdown(key, value, placeholder, options, extraClass, icon) {
    var isOpen = state.openDropdown === key;
    var currentText = placeholder;
    var currentGlyph = '';
    for (var i = 0; i < options.length; i++) {
      if (String(options[i].value || '') === String(value || '')) {
        currentText = options[i].label;
        currentGlyph = options[i].glyph || '';
        break;
      }
    }
    var lead = currentGlyph || (icon ? '<span class="bulk-builder-drop-ico">' + lucideIcon(icon, 14) + '</span>' : '');
    return '' +
      '<div class="bulk-builder-drop' + (isOpen ? ' open' : '') + (extraClass ? ' ' + extraClass : '') + '" data-bb-drop="' + esc(key) + '">' +
        '<button type="button" class="bulk-builder-drop-trigger' + (!value ? ' is-placeholder' : '') + '" data-bb-drop-toggle="' + esc(key) + '">' +
          lead +
          '<span class="bulk-builder-drop-value">' + esc(currentText) + '</span>' +
          '<span class="bulk-builder-drop-chevron">' + lucideIcon('chevron-down', 14) + '</span>' +
        '</button>' +
        '<div class="bulk-builder-drop-menu' + (isOpen ? ' open' : '') + '">' +
          options.map(function (opt) {
            var active = String(opt.value || '') === String(value || '');
            return '<button type="button" class="bulk-builder-drop-item' + (active ? ' active' : '') + '" data-bb-drop-item="' + esc(key) + '" data-bb-drop-value="' + esc(opt.value || '') + '">' +
              (opt.glyph || '') +
              '<span class="bulk-builder-drop-item-text">' + esc(opt.label) + '</span>' +
              '<span class="bulk-builder-drop-item-check">' + lucideIcon('check', 14) + '</span>' +
            '</button>';
          }).join('') +
        '</div>' +
      '</div>';
  }

  function closeModal() {
    var root = document.getElementById(MODAL_ID);
    if (root) root.classList.remove('show');
  }

  /* P1 mapping validation: peek at the first non-empty cell of the mapped column and
     warn when its shape cannot work for the field kind (image URL / hex color). */
  function validateMappedColumn(field) {
    var header = state.mapping[field.field];
    if (!header || !state.rows.length) return '';
    var sample = '';
    for (var i = 0; i < state.rows.length; i++) {
      var v = state.rows[i][header];
      if (v != null && String(v).trim() !== '') { sample = String(v).trim(); break; }
    }
    if (!sample) return 'Every cell in "' + header + '" is empty; this field will keep its template value.';
    if ((field.kind === 'image' || field.kind === 'grid-cell') && !CCBulk.isImageUrl(sample)) {
      return 'Values in "' + header + '" do not look like image URLs (need https://... or data:image).';
    }
    if (field.kind === 'color' && !CCBulk.isColorValue(sample)) {
      return 'Values in "' + header + '" are not hex colors like #ff5500.';
    }
    return '';
  }

  /* P1 step-3 preview: first data row applied to the template, rendered offscreen. */
  var _previewToken = 0;
  function renderRowPreview() {
    var img = document.getElementById('bulk-builder-preview-img');
    var status = document.getElementById('bulk-builder-preview-status');
    if (!img || !state.rows.length || !state._srcJsonStr || typeof renderPart !== 'function') return;
    // The preview must show the REAL fit, so measure the first row's images once before drawing it
    // (one row, not the whole run: this is a thumbnail, not the generation).
    if (_bbTemplateHasClip() && !state._pvMeasured) {
      state._pvMeasured = true;
      if (status) status.textContent = 'Measuring images...';
      _bbMeasureImages([state.rows[0]], function () { renderRowPreview(); });
      return;
    }
    var token = ++_previewToken;
    if (status) status.textContent = 'Rendering preview...';
    var json = JSON.parse(state._srcJsonStr);
    var target;
    if (state._sceneMode) {
      CCBulk.applyRow({ objects: [json] }, state.rows[0], state.mapping, { fileUploads: state.fileUploads, imageSizes: state.imageSizes });
      target = { kind: 'frame', json: json, w: state._srcW, h: state._srcH, x: state._srcX, y: state._srcY, bg: state._srcBg };
    } else {
      CCBulk.applyRow(json, state.rows[0], state.mapping, { fileUploads: state.fileUploads, imageSizes: state.imageSizes });
      target = { kind: 'page', json: json, w: state._srcW, h: state._srcH, bg: state._srcBg };
    }
    renderPart(target, { fit: 480 }).then(function (url) {
      if (token !== _previewToken) return;
      var img2 = document.getElementById('bulk-builder-preview-img');
      var status2 = document.getElementById('bulk-builder-preview-status');
      if (!img2) return;
      if (url) {
        img2.src = url;
        img2.style.display = '';
        if (status2) status2.textContent = 'Row 1: ' + getPageLabel(state.rows[0], 0);
      } else if (status2) {
        status2.textContent = 'Preview could not be rendered.';
      }
    });
  }

  function _bbSaveImagesToGallery(groupName) {
    try {
      if (localStorage.getItem('dika_bulkGallerySave') !== '1') return;
    } catch (e) { return; }
    if (typeof galAddFolder !== 'function' || typeof galAddImageToFolder !== 'function') return;
    // Collect unique data-URL images from file uploads + row data
    var seen = {};
    var images = [];
    Object.keys(state.fileUploads).forEach(function (k) {
      var img = state.fileUploads[k];
      if (img && typeof img === 'string' && img.indexOf('data:image') === 0 && !seen[img]) {
        seen[img] = true;
        images.push(img);
      }
    });
    (state.rows || []).forEach(function (row) {
      Object.keys(row).forEach(function (h) {
        var v = row[h];
        if (v && typeof v === 'string' && v.indexOf('data:image') === 0 && !seen[v]) {
          seen[v] = true;
          images.push(v);
        }
      });
    });
    if (!images.length) return;
    var folder = galAddFolder('Bulk \u2014 ' + (groupName || 'Import'), 'upload');
    if (!folder) return;
    images.forEach(function (img) { galAddImageToFolder(folder.id, img); });
  }

  /* P2 (S9): deck mode : one new slide per row inside the SAME deck, with the same
     _bbRowKey in-place re-run semantics as pages. */
  function createSlidesFromCsv(src) {
    var page = src.page;
    var deck = page._slideDeck;
    var srcSlide = src.slide;
    var sourceJsonStr = JSON.stringify(srcSlide.json);
    var existingByKey = {};
    deck.slides.forEach(function (s) { if (s._bbRowKey) existingByKey[s._bbRowKey] = s; });
    var updateMode = Object.keys(existingByKey).length > 0;
    var newSlides = [];
    var created = 0;
    var updated = 0;
    var chunk = 20;
    state.creating = true;
    state.progress = 0;
    state.total = state.rows.length;
    renderModal();

    function runChunk(startIndex) {
      var end = Math.min(startIndex + chunk, state.rows.length);
      for (var i = startIndex; i < end; i++) {
        var row = state.rows[i];
        var clonedJson = JSON.parse(sourceJsonStr);
        CCBulk.applyRow(clonedJson, row, state.mapping, { fileUploads: state.fileUploads, imageSizes: state.imageSizes });
        var rowKey = rowKeyFor(row, i);
        var target = updateMode ? existingByKey[rowKey] : null;
        if (target) {
          target.json = clonedJson;
          target.label = getPageLabel(row, i);
          if (typeof _sdTouchSlide === 'function') _sdTouchSlide(target);
          updated++;
        } else {
          var ns = JSON.parse(JSON.stringify(srcSlide));
          delete ns.id;   // _sdNormalizeSlide mints a fresh slide id
          ns.json = clonedJson;
          ns.label = getPageLabel(row, i);
          ns._bbRowKey = rowKey;
          ns._previewRev = 0;
          newSlides.push(ns);
          created++;
        }
      }
      state.progress = created + updated;
      renderModal();
      if (end < state.rows.length) {
        setTimeout(function () { runChunk(end); }, 0);
        return;
      }
      if (newSlides.length) Array.prototype.push.apply(deck.slides, newSlides);
      var firstNewIndex = deck.slides.length - newSlides.length;
      if (typeof pageHasSlideDeck === 'function') pageHasSlideDeck(page);   // normalize: fresh ids, keeps _bbRowKey
      if (typeof _sdTouchDeck === 'function') _sdTouchDeck(page);
      state.creating = false;
      closeModal();
      if (typeof loadInnerSlide === 'function') {
        // skipSave: the wizard already saved the active slide on open; a save here would
        // clobber an in-place UPDATE of that same slide with the stale canvas content.
        loadInnerSlide(currentPageIndex, newSlides.length ? firstNewIndex : deck.activeSlideIndex, { skipSave: true });
      }
      if (typeof renderPageTabs === 'function') renderPageTabs();
      if (typeof showToast === 'function') {
        showToast(updateMode
          ? (updated + ' slides updated, ' + created + ' added')
          : (created + ' slides added to the deck'));
      }
    }

    runChunk(0);
  }

  /* P2 (S10): scene mode : one new FRAME per row, tiled to the right of the existing
     frames; same _bbRowKey in-place re-run semantics. Uses the scene's own primitives
     (_scAddFrame + _scRefreshFrame, the _scDuplicateFrame pattern). */
  function createFramesFromCsv(src) {
    var page = src.page;
    var sc = page._scene;
    var srcFrame = src.frame;
    var sourceJsonStr = JSON.stringify(srcFrame.json);
    var existingByKey = {};
    (sc.frames || []).forEach(function (f) { if (f._bbRowKey) existingByKey[f._bbRowKey] = f; });
    var updateMode = Object.keys(existingByKey).length > 0;
    var created = 0;
    var updated = 0;
    var failed = 0;
    var chunk = 10;
    state.creating = true;
    state.progress = 0;
    state.total = state.rows.length;
    renderModal();

    var gap = 60;
    var startX = 0;
    (sc.frames || []).forEach(function (f) { if (f.x + f.w > startX) startX = f.x + f.w; });
    startX += gap;

    function runChunk(startIndex) {
      var end = Math.min(startIndex + chunk, state.rows.length);
      for (var i = startIndex; i < end; i++) {
        var row = state.rows[i];
        var cloned = JSON.parse(sourceJsonStr);
        CCBulk.applyRow({ objects: [cloned] }, row, state.mapping, { fileUploads: state.fileUploads, imageSizes: state.imageSizes });
        var rowKey = rowKeyFor(row, i);
        var target = updateMode ? existingByKey[rowKey] : null;
        if (target) {
          target.json = cloned;
          target.label = getPageLabel(row, i);
          if (typeof _scRefreshFrame === 'function') _scRefreshFrame(target.id);
          updated++;
        } else {
          var nf = (typeof _scAddFrame === 'function') ? _scAddFrame(startX, srcFrame.y, srcFrame.w, srcFrame.h, { label: getPageLabel(row, i), bg: srcFrame.bg }) : null;
          if (nf) {
            nf.json = cloned;
            nf._bbRowKey = rowKey;
            if (typeof _scRefreshFrame === 'function') _scRefreshFrame(nf.id);
            startX += srcFrame.w + gap;
            created++;
          } else {
            failed++;   // frame limit reached (its own toast already fired)
          }
        }
      }
      state.progress = created + updated + failed;
      renderModal();
      if (end < state.rows.length && !failed) {
        setTimeout(function () { runChunk(end); }, 0);
        return;
      }
      if (typeof _scSerializeWorld === 'function') _scSerializeWorld(page);
      if (typeof canvas !== 'undefined' && canvas) canvas.requestRenderAll();
      if (typeof snap === 'function') snap();
      state.creating = false;
      closeModal();
      if (typeof showToast === 'function') {
        var msg = updateMode ? (updated + ' frames updated, ' + created + ' added') : (created + ' frames added');
        if (failed) msg += ' (' + failed + ' skipped: frame limit)';
        showToast(msg);
      }
    }

    runChunk(0);
  }

  function _dataUrlToBlob(u) {
    try {
      var p = u.split(','), m = (p[0].match(/:(.*?);/) || [])[1] || 'image/png';
      var b = atob(p[1]), n = b.length, a = new Uint8Array(n);
      while (n--) a[n] = b.charCodeAt(n);
      return new Blob([a], { type: m });
    } catch (e) { return null; }
  }

  /* Enterprise RAM fix (owner 2026-07-18, plan B): before generating, upload every UNIQUE
     inline base64 image (Excel-embedded row cells + single grid-cell uploads) to the asset
     library ONCE and rewrite state.rows/fileUploads to the returned URL. So generated pages
     carry a short URL, not MBs of base64 - keeping 500 image pages tiny in RAM + localStorage.
     No-op when the asset API is inactive (standalone :8200), keeps base64 (graceful). */
  function _bbUploadInlineImages(done) {
    if (typeof CCAssets === 'undefined' || !CCAssets.active || typeof CCAssets.uploadBlob !== 'function') { done(); return; }
    var seen = {}, list = [];
    function collect(v) { if (v && typeof v === 'string' && v.indexOf('data:image') === 0 && !seen[v]) { seen[v] = true; list.push(v); } }
    (state.rows || []).forEach(function (row) { if (row) Object.keys(row).forEach(function (h) { collect(row[h]); }); });
    Object.keys(state.fileUploads || {}).forEach(function (k) { collect(state.fileUploads[k]); });
    if (!list.length) { done(); return; }
    state.creating = true;
    state.uploadTotal = list.length;
    state.uploadDone = 0;
    renderModal();
    var map = {}, i = 0;
    function finish() {
      (state.rows || []).forEach(function (row) { if (row) Object.keys(row).forEach(function (h) { if (map[row[h]]) row[h] = map[row[h]]; }); });
      Object.keys(state.fileUploads || {}).forEach(function (k) { if (map[state.fileUploads[k]]) state.fileUploads[k] = map[state.fileUploads[k]]; });
      state.creating = false;
      state.uploadTotal = 0;
      done();
    }
    function next() {
      if (i >= list.length) { finish(); return; }
      var b64 = list[i];
      var blob = _dataUrlToBlob(b64);
      if (!blob) { i++; state.uploadDone = i; next(); return; }
      CCAssets.uploadBlob(blob, { name: 'bulk-image-' + (i + 1) + '.png', mime: blob.type || 'image/png' }).then(function (res) {
        if (res && res.url) map[b64] = res.url;
        i++; state.uploadDone = i; renderModal(); next();
      });
    }
    next();
  }

  /* ── Clip frames need the new image's NATURAL SIZE (bug reported 2026-08-06) ───────────────
     A shape+image clip stores fabric's own crop and scale, computed from the image that was in
     it. The engine can recompute all of it (CCBulk.refitClipFrames) but only from a real
     measurement, which the browser can give us just by loading the image.

     Cost is paid ONLY when the template actually has a clip: a design without one measures
     nothing. Failures are skipped rather than fatal (the merge then behaves as it did before). */
  function _bbTemplateHasClip() {
    if (state._hasClip != null) return state._hasClip;
    var found = false;
    try {
      var j = JSON.parse(state._srcJsonStr || '{}');
      var list = j.objects || (j.type ? [j] : []);
      CCBulk.walkJsonObjects(list, function (o) {
        if (o && (o._isClipFrame || o._isClippedImage)) found = true;
      });
    } catch (e) { found = false; }
    state._hasClip = found;
    return found;
  }

  function _bbCollectImageUrls(rows) {
    var seen = {}, out = [];
    var headers = [];
    Object.keys(state.mapping).forEach(function (f) { if (state.mapping[f]) headers.push(state.mapping[f]); });
    (rows || []).forEach(function (row) {
      if (!row) return;
      headers.forEach(function (h) {
        var v = row[h];
        if (!v || typeof v !== 'string' || seen[v]) return;
        if (!CCBulk.isImageUrl(v)) return;
        seen[v] = true;
        if (!state.imageSizes[v]) out.push(v);
      });
    });
    return out;
  }

  function _bbMeasureImages(rows, done) {
    if (!_bbTemplateHasClip()) { done(); return; }
    var list = _bbCollectImageUrls(rows);
    if (!list.length) { done(); return; }
    var i = 0, active = 0, finished = 0, LIMIT = 6;
    function one(url) {
      var im = new Image();
      var settled = false;
      var to = setTimeout(function () { if (!settled) { settled = true; im.src = ''; step(); } }, 15000);
      im.onload = function () {
        if (settled) return;
        settled = true; clearTimeout(to);
        if (im.naturalWidth && im.naturalHeight) state.imageSizes[url] = { w: im.naturalWidth, h: im.naturalHeight };
        step();
      };
      im.onerror = function () { if (settled) return; settled = true; clearTimeout(to); step(); };
      im.src = url;
    }
    function step() {
      active--; finished++;
      state.measureDone = finished; state.measureTotal = list.length;
      if (finished % 5 === 0 || finished === list.length) renderModal();
      pump();
    }
    function pump() {
      if (finished >= list.length) { state.measureTotal = 0; done(); return; }
      while (active < LIMIT && i < list.length) { active++; one(list[i++]); }
    }
    state.measureTotal = list.length; state.measureDone = 0;
    renderModal();
    pump();
  }

  function createPagesFromCsv() {
    var src = ensureSourceReady();
    if (!src) return;
    if (!state.rows.length) return showError('Upload a CSV file first.');
    if (!getMappedFieldCount()) return showError('Match at least one design field to a CSV column.');
    // Plan B: upload inline base64 images to assets first (no-op standalone), THEN measure the
    // images a clip frame has to be re-fitted around, THEN generate.
    _bbUploadInlineImages(function () {
      _bbMeasureImages(state.rows, function () {
        if (src.deckMode) return createSlidesFromCsv(src);
        if (src.sceneMode) return createFramesFromCsv(src);
        _createPagesCore(src);
      });
    });
  }

  function _createPagesCore(src) {
    var sourcePage = src.page;

    var groupName = String(state.groupName || '').trim() || getDefaultGroupName();

    /* P1 in-place re-run: if a group with this name already holds bulk pages (stamped
       _bbRowKey), UPDATE matching rows in place and only append the new ones, instead
       of always minting a duplicate group (research doc D7). */
    var existingGroup = null;
    if (typeof pageGroups !== 'undefined' && pageGroups && pageGroups.length) {
      for (var gi = 0; gi < pageGroups.length; gi++) {
        if (pageGroups[gi] && pageGroups[gi].name === groupName) { existingGroup = pageGroups[gi]; break; }
      }
    }
    var existingByKey = {};
    var lastGroupPageIndex = -1;
    if (existingGroup) {
      for (var pi = 0; pi < pages.length; pi++) {
        var pg = pages[pi];
        if (pg && pg.groupId === existingGroup.id) {
          lastGroupPageIndex = pi;
          if (pg._bbRowKey) existingByKey[pg._bbRowKey] = pg;
        }
      }
    }
    var updateMode = existingGroup && lastGroupPageIndex !== -1 && Object.keys(existingByKey).length > 0;
    var group = updateMode ? existingGroup : (typeof _pgCreateGroup === 'function' ? _pgCreateGroup(groupName) : null);

    var sourceJsonStr = JSON.stringify(sourcePage.json);
    var firstNewIndex = -1;   // where the first newly-created page landed (for the final switchPage)
    var created = 0;
    var updated = 0;
    var chunk = 20;
    var insertAt = updateMode ? lastGroupPageIndex + 1 : currentPageIndex + 1;
    // A NEW group must not be spliced INTO the previous one. After a run the active page is one of
    // the pages it produced, so "right after the active page" put the second run's pages in the
    // middle of the first run's group (measured 2026-08-06). Walk to the end of that group first.
    if (!updateMode && pages[currentPageIndex] && pages[currentPageIndex].groupId) {
      var _gid = pages[currentPageIndex].groupId;
      for (var _qi = currentPageIndex + 1; _qi < pages.length; _qi++) {
        if (pages[_qi] && pages[_qi].groupId === _gid) insertAt = _qi + 1; else break;
      }
    }
    state.creating = true;
    state.progress = 0;
    state.total = state.rows.length;
    var totalGridEmpty = 0;
    var totalGridFilled = 0;
    renderModal();

    function runChunk(startIndex) {
      var end = Math.min(startIndex + chunk, state.rows.length);
      var chunkNew = [];
      for (var i = startIndex; i < end; i++) {
        var row = state.rows[i];
        var clonedJson = JSON.parse(sourceJsonStr);
        var rowStats = CCBulk.applyRow(clonedJson, row, state.mapping, { fileUploads: state.fileUploads, imageSizes: state.imageSizes });
        totalGridEmpty += rowStats.gridEmpty;
        totalGridFilled += rowStats.gridFilled;
        var rowKey = rowKeyFor(row, i);
        var target = updateMode ? existingByKey[rowKey] : null;
        if (target) {
          // In-place update: keep _pageId/groupId, swap content
          target.json = clonedJson;
          target.bg = sourcePage.bg;
          target.label = getPageLabel(row, i);
          target.w = sourcePage.w || CW;
          target.h = sourcePage.h || CH;
          updated++;
        } else {
          var newPage = {
            json: clonedJson,
            bg: sourcePage.bg,
            label: getPageLabel(row, i),
            w: sourcePage.w || CW,
            h: sourcePage.h || CH,
            _productType: sourcePage._productType || activeProduct,
            _pageDesignNote: sourcePage._pageDesignNote || '',
            _bbRowKey: rowKey
          };
          if (group) newPage.groupId = group.id;
          chunkNew.push(newPage);
          created++;
        }
      }
      // Commit THIS chunk's new pages now (incremental: they appear + persist per slice, not all at
      // the end), so a long run streams to the canvas and an interruption keeps what already landed.
      if (chunkNew.length) {
        if (firstNewIndex === -1) firstNewIndex = insertAt;
        Array.prototype.splice.apply(pages, [insertAt, 0].concat(chunkNew));
        insertAt += chunkNew.length;
        if (typeof renderPageTabs === 'function') renderPageTabs();
      }
      state.progress = created + updated;
      renderModal();
      if (end < state.rows.length) {
        setTimeout(function () { runChunk(end); }, 0);
        return;
      }
      // Optionally save images to gallery
      _bbSaveImagesToGallery(groupName);
      if (typeof _pgClearSelection === 'function') _pgClearSelection();
      if (typeof renderPageTabs === 'function') renderPageTabs();
      if (typeof switchPage === 'function') {
        if (updateMode && created === 0) {
          // Only in-place content changed; reload whichever is on screen
          switchPage(currentPageIndex);
        } else {
          switchPage(firstNewIndex !== -1 ? firstNewIndex : currentPageIndex);
        }
      }
      // Page-sleep: a 500-row run must not keep 500 hydrated jsons around; evict to the
      // awake budget right after generation (switchPage's same-index early-return skips it).
      if (typeof _psEvictIfNeeded === 'function') _psEvictIfNeeded();
      state.creating = false;
      closeModal();
      if (typeof showToast === 'function') {
        showToast(updateMode
          ? (updated + ' updated, ' + created + ' added in "' + groupName + '"')
          : (created + ' pages created in "' + groupName + '"'));
      }
      if (totalGridEmpty > 0 && totalGridFilled === 0 && typeof showToast === 'function') {
        setTimeout(function () {
          showToast('Grid cell image columns are empty in CSV. Use actual image URLs (https://...) instead of embedded images.', 'warning');
        }, 800);
      }
    }

    runChunk(0);
  }

  function onFileChosen(file) {
    if (!file) return;
    CCBulk.parseFile(file, function (err, parsed) {
      if (err) return showError(err.message || 'Could not parse file.');
      state.fileName = file.name || 'data.csv';
      state.headers = parsed.headers || [];
      state.rows = parsed.rows || [];
      state.mapping = CCBulk.defaultMapping(state.fields, state.headers);
      state.labelColumn = '';
      state.imageSizes = {}; state._pvMeasured = false;   // new data set: measure again
      state.step = 2;
      renderModal();
    });
  }

  function ensureModal() {
    var existing = document.getElementById(MODAL_ID);
    if (existing) return existing;
    var root = document.createElement('div');
    root.id = MODAL_ID;
    root.className = 'bulk-builder-overlay';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'bulk-builder-title');
    // A dim scrim seats the panel over the (bright, busy) canvas; the panel itself is a SOLID,
    // draggable, resizable floating box (owner: not see-through, less radius, still SmartCam-like).
    root.innerHTML = '<div class="bulk-builder-scrim" data-bb-close="1"></div><div class="bulk-builder-panel"></div>';
    document.body.appendChild(root);
    root.addEventListener('click', function (e) {
      if (e.target && e.target.getAttribute('data-bb-close') === '1' && !state.creating && !state.aiBusy) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && root.classList.contains('show') && !state.creating && !state.aiBusy) closeModal();
    });
    return root;
  }

  /* Centre the panel on first open. JS px positioning (never transform:translate(-50%)) so the native
     resize grip grows the box from its corner instead of fighting a centring transform (SmartCam lesson). */
  function bbCenter(panel) {
    var w = panel.offsetWidth || 680, h = panel.offsetHeight || 560;
    panel.style.left = Math.max(8, Math.round((window.innerWidth - w) / 2)) + 'px';
    panel.style.top = Math.max(8, Math.round((window.innerHeight - h) / 2)) + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  /* Height is content-driven, so a mode with more content (AI/Excel vs the short chooser) can grow past
     the bottom edge from a position set for a shorter screen. Nudge it back in ONLY when off-screen,
     preserving a user-dragged position otherwise. */
  function bbClampIntoView(panel) {
    var r = panel.getBoundingClientRect();
    var top = Math.min(Math.max(8, r.top), Math.max(8, window.innerHeight - r.height - 8));
    var left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - r.width - 8));
    panel.style.top = Math.round(top) + 'px';
    panel.style.left = Math.round(left) + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function renderStepHeader() {
    var isProd = state.mode === 'products';
    var lastLabel = state._deckMode ? 'Create Slides' : (state._sceneMode ? 'Create Frames' : 'Create Pages');
    var steps = [
      { n: 1, label: isProd ? 'Select product' : 'Upload', icon: isProd ? 'package' : 'upload' },
      { n: 2, label: isProd ? 'Map fields' : 'Match Fields', icon: 'link' },
      { n: 3, label: isProd ? ('Create (' + bbUnitTr(state._unitNoun) + ')') : lastLabel, icon: 'layers-3' }
    ];
    return '<div class="bulk-builder-steps">' + steps.map(function (step) {
      var cls = 'bulk-builder-step' + (state.step === step.n ? ' is-active' : (state.step > step.n ? ' is-done' : ''));
      return '<div class="' + cls + '"><span class="bulk-builder-step-icon">' + lucideIcon(step.icon, 14) + '</span><span>' + esc(step.label) + '</span></div>';
    }).join('') + '</div>';
  }

  function renderUploadStep() {
    return '' +
      '<div class="bulk-builder-section">' +
        '<div class="bulk-builder-upload">' +
          '<div class="bulk-builder-upload-icon">' + lucideIcon('file-spreadsheet', 20) + '</div>' +
          '<div class="bulk-builder-upload-title">Upload CSV or Excel</div>' +
          '<div class="bulk-builder-upload-sub">Upload a .csv or .xlsx file. Excel files with embedded images will be extracted automatically.</div>' +
          '<button type="button" class="mform-dl-btn bulk-builder-upload-btn" id="bulk-builder-pick">' + lucideIcon('upload', 16) + '<span>Select File</span></button>' +
          '<input type="file" id="' + FILE_INPUT_ID + '" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" style="display:none">' +
        '</div>' +
      '</div>' +
      '<div class="bulk-builder-section">' +
        '<div class="bulk-builder-mini-title">Active design fields</div>' +
        '<div class="bulk-builder-field-list">' +
          state.fields.map(function (field) {
            var isGridCell = field.type === 'grid-cell';
            var chipName = isGridCell ? field.field.replace(/::cell\(\d+,\d+\)$/, '') : field.field;
            var chipType = isGridCell ? field.note : (field.type || 'object');
            return '<div class="bulk-builder-field-chip"><strong>' + esc(chipName) + '</strong><span>' + esc(chipType) + '</span></div>';
          }).join('') +
        '</div>' +
      '</div>';
  }

  function renderMappingStep() {
    // Product columns read as their human name here (the mapping dropdown still carries the raw key,
    // which IS the design-field value); a CSV column is the user's own header and stays verbatim.
    var prodCols = state.mode === 'products' && window.CCBulkProducts;
    var headerChips = state.headers.map(function (header) {
      if (prodCols) {
        var meta = CCBulkProducts.columnMeta(header);
        return '<span class="bulk-builder-header-chip">' + lucideIcon(meta.kind === 'image' ? 'image' : 'type', 12) + esc(meta.label) + '</span>';
      }
      return '<span class="bulk-builder-header-chip">' + esc(header) + '</span>';
    }).join('');
    var rows = state.fields.map(function (field) {
      var options = [{ value: '', label: 'Not mapped' }].concat(state.headers.map(function (header) {
        return { value: header, label: header };
      }));
      var isGridCell = field.type === 'grid-cell';
      var namePrefix = isGridCell ? (lucideIcon('grid-3x3', 13) + ' ') : '';
      var displayName = isGridCell ? field.field.replace(/::cell\(\d+,\d+\)$/, '') + ' \u2014 ' + field.note : field.field;
      var helpText = isGridCell ? field.note : (field.note || field.current || field.type || 'Design field');
      var warn = validateMappedColumn(field);
      var uploadHtml = '';
      if (isGridCell) {
        var uploadedImg = state.fileUploads[field.field] || null;
        var uploadLabel = uploadedImg ? 'Image set' : 'Upload image';
        var uploadBtnClass = 'bulk-builder-file-btn' + (uploadedImg ? ' has-files' : '');
        uploadHtml = '<div class="bulk-builder-upload-or"><span>or</span></div>' +
          '<button type="button" class="' + uploadBtnClass + '" data-bb-upload="' + esc(field.field) + '">' +
            lucideIcon(uploadedImg ? 'check-circle' : 'image-plus', 14) +
            '<span>' + esc(uploadLabel) + '</span>' +
          '</button>';
      }
      return '' +
        '<div class=\"bulk-builder-map-row' + (isGridCell ? ' bulk-builder-map-row-grid' : '') + '\">' +
          '<div class=\"bulk-builder-map-meta\">' +
            '<div class=\"bulk-builder-map-name\">' + namePrefix + esc(displayName) + '</div>' +
            '<div class="bulk-builder-map-help">' + esc(helpText) + '</div>' +
          '</div>' +
          '<div class="bulk-builder-map-actions">' +
            '<label class="bulk-builder-map-select-wrap">' +
              renderDropdown('map:' + field.field, state.mapping[field.field], 'Not mapped', options, 'bulk-builder-map-drop') +
            '</label>' +
            uploadHtml +
          '</div>' +
          (warn ? '<div class="bulk-builder-map-warn">' + lucideIcon('triangle-alert', 12) + '<span>' + esc(warn) + '</span></div>' : '') +
        '</div>';
    }).join('');
    var isProd = state.mode === 'products';
    return '' +
      '<div class="bulk-builder-section">' +
        '<div class="bulk-builder-mini-title">' + (isProd ? 'Product source' : 'CSV file') + '</div>' +
        '<div class="bulk-builder-file-meta"><span>' + lucideIcon(isProd ? 'package' : 'file-text', 14) + '</span><strong>' + esc(state.fileName) + '</strong><em>' + state.rows.length + (isProd ? ' products' : ' rows') + '</em></div>' +
        '<div class="bulk-builder-header-chips">' + headerChips + '</div>' +
      '</div>' +
      (isProd ? ppStatsHtml() : '') +
      '<div class="bulk-builder-section">' +
        '<div class="bulk-builder-mini-title">' + (isProd ? 'Map to design fields' : 'Map to active page fields') + '</div>' +
        '<div class="bulk-builder-map-list">' + rows + '</div>' +
      '</div>';
  }

  function renderCreateStep() {
    var summary = state.fields.filter(function (field) { return !!state.mapping[field.field] || !!state.fileUploads[field.field]; }).map(function (field) {
      // fileUploads[field] is ONE data-URL string applied to every row (D1 fix: .length on it counted characters)
      var label = state.fileUploads[field.field] ? 'Image set' : state.mapping[field.field];
      return '<div class="bulk-builder-summary-row"><span>' + esc(field.field) + '</span><strong>' + esc(label) + '</strong></div>';
    }).join('');
    var labelOptions = [{ value: '', label: 'Auto page labels' }].concat(state.headers.map(function (header) {
      return { value: header, label: header };
    }));
    var progressHtml = '';
    if (state.measureTotal) {
      // Clip frames only: the images are being measured so their crop/scale can be recomputed.
      progressHtml = '<div class="bulk-builder-progress"><div class="bulk-builder-progress-bar"><span style="width:' + Math.round((state.measureDone / Math.max(1, state.measureTotal)) * 100) + '%"></span></div><div class="bulk-builder-progress-text">Measuring images ' + state.measureDone + ' / ' + state.measureTotal + '</div></div>';
    } else if (state.uploadTotal) {
      // Plan B: image upload phase before generation.
      progressHtml = '<div class="bulk-builder-progress"><div class="bulk-builder-progress-bar"><span style="width:' + Math.round((state.uploadDone / Math.max(1, state.uploadTotal)) * 100) + '%"></span></div><div class="bulk-builder-progress-text">Uploading images ' + state.uploadDone + ' / ' + state.uploadTotal + '</div></div>';
    } else if (state.creating) {
      progressHtml = '<div class="bulk-builder-progress"><div class="bulk-builder-progress-bar"><span style="width:' + Math.round((state.progress / Math.max(1, state.total)) * 100) + '%"></span></div><div class="bulk-builder-progress-text">Creating ' + state.progress + ' / ' + state.total + '</div></div>';
    }
    var unitWord = state._deckMode ? 'slide' : (state._sceneMode ? 'frame' : 'page');
    var groupField = (state._deckMode || state._sceneMode)
      ? ''
      : '<label class="bulk-builder-field">' +
          '<span>Group name</span>' +
          '<input type="text" class="mform-input" id="bulk-builder-group-name" value="' + esc(state.groupName || '') + '" placeholder="' + esc(getDefaultGroupName()) + '">' +
        '</label>';
    return '' +
      '<div class="bulk-builder-section bulk-builder-form-grid">' +
        groupField +
        '<label class="bulk-builder-field">' +
          '<span>' + unitWord.charAt(0).toUpperCase() + unitWord.slice(1) + ' label column</span>' +
          renderDropdown('label-column', state.labelColumn, 'Auto ' + unitWord + ' labels', labelOptions) +
        '</label>' +
      '</div>' +
      '<div class="bulk-builder-section">' +
        '<div class="bulk-builder-mini-title">Preview (first row)</div>' +
        '<div class="bulk-builder-preview"><img id="bulk-builder-preview-img" alt="First row preview" style="display:none"><div id="bulk-builder-preview-status" class="bulk-builder-preview-status">Rendering preview...</div></div>' +
      '</div>' +
      '<div class="bulk-builder-section">' +
        '<div class="bulk-builder-mini-title">Bulk summary</div>' +
        '<div class="bulk-builder-summary">' +
          '<div class="bulk-builder-summary-stat"><span>' + (state.mode === 'products' ? 'Product' : 'Rows') + '</span><strong>' + state.rows.length + '</strong></div>' +
          '<div class="bulk-builder-summary-stat"><span>Mapped fields</span><strong>' + getMappedFieldCount() + '</strong></div>' +
          '<div class="bulk-builder-summary-stat"><span>Template page</span><strong>' + esc((pages[currentPageIndex] && pages[currentPageIndex].label) || 'Active Page') + '</strong></div>' +
        '</div>' +
        '<div class="bulk-builder-summary-table">' + summary + '</div>' +
        ppStatsHtml() +
      '</div>' +
      progressHtml;
  }

  function renderFooter() {
    if (state.mode !== 'ai' && state.mode !== 'excel' && state.mode !== 'products') return '';   // choose screen: the cards ARE the action
    var left = '';
    var right = '';
    // Products step 1 owns its footer (the picker's own Continue + a Cancel while fetching); steps 2
    // and 3 fall through to the shared Excel footer below, because they ARE the same screens.
    if (state.mode === 'products' && state.step === 1) {
      var n = ppSelCount();
      var canGo = (state.prodAll || n > 0) && !state.prodBusy && ppActive();
      if (state.prodBusy) {
        left += '<button type="button" class="bulk-builder-secondary" id="bb-pp-cancel">' + lucideIcon('square', 15) + '<span>Cancel</span></button>';
      }
      right += '<button type="button" class="mform-dl-btn" id="bb-pp-continue"' + (canGo ? '' : ' disabled') + '>' +
        lucideIcon('arrow-right', 15) + '<span>' +
        (state.prodBusy ? 'Fetching...' : (state.prodAll ? 'Continue (all)' : ('Continue' + (n ? ' (' + n + ' products)' : '')))) +
        '</span></button>';
      return '<div class="bulk-builder-footer"><div class="bulk-builder-footer-left">' + left + '</div><div class="bulk-builder-footer-right">' + right + '</div></div>';
    }
    if (state.mode === 'ai') {
      var aiDisabled = state.aiBusy || state.creating || !state.fields.length;
      right += '<button type="button" class="mform-dl-btn bb-generate" id="bb-ai-generate"' + (aiDisabled ? ' disabled' : '') + '>' + lucideIcon('sparkles', 15) + '<span>' + (state.aiBusy ? 'Generating...' : 'Generate') + '</span></button>';
      return '<div class="bulk-builder-footer"><div class="bulk-builder-footer-left">' + left + '</div><div class="bulk-builder-footer-right">' + right + '</div></div>';
    }
    if (state.step > 1) {
      left += '<button type="button" class="bulk-builder-secondary" id="bulk-builder-back">' + lucideIcon('arrow-left', 15) + '<span>Back</span></button>';
    }
    if (state.step === 2) {
      right += '<button type="button" class="mform-dl-btn" id="bulk-builder-next-map"' + (!getMappedFieldCount() ? ' disabled' : '') + '>' + lucideIcon('arrow-right', 15) + '<span>Review</span></button>';
    } else if (state.step === 3) {
      right += '<button type="button" class="mform-dl-btn" id="bulk-builder-create"' + (state.creating ? ' disabled' : '') + '>' + lucideIcon('plus', 15) + '<span>' + (state.creating ? 'Creating...' : 'Bulk Create') + '</span></button>';
    }
    return '<div class="bulk-builder-footer"><div class="bulk-builder-footer-left">' + left + '</div><div class="bulk-builder-footer-right">' + right + '</div></div>';
  }

  function bindModal() {
    var root = document.getElementById(MODAL_ID);
    if (!root) return;
    var fileInput = document.getElementById(FILE_INPUT_ID);
    var pickBtn = document.getElementById('bulk-builder-pick');
    if (pickBtn && fileInput) {
      pickBtn.onclick = function () { fileInput.click(); };
      fileInput.onchange = function (e) { onFileChosen((e.target.files || [])[0]); };
    }
    var backBtn = document.getElementById('bulk-builder-back');
    if (backBtn) backBtn.onclick = function () { state.step = Math.max(1, state.step - 1); renderModal(); };
    var nextMapBtn = document.getElementById('bulk-builder-next-map');
    if (nextMapBtn) nextMapBtn.onclick = function () { state.step = 3; renderModal(); };
    var createBtn = document.getElementById('bulk-builder-create');
    if (createBtn) createBtn.onclick = createPagesFromCsv;

    var groupName = document.getElementById('bulk-builder-group-name');
    if (groupName) groupName.oninput = function () { state.groupName = groupName.value; };
    Array.prototype.forEach.call(root.querySelectorAll('[data-bb-upload]'), function (btn) {
      btn.onclick = function () {
        var fieldKey = btn.getAttribute('data-bb-upload');
        var inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'image/*';
        inp.onchange = function (e) {
          var file = e.target.files && e.target.files[0];
          if (!file) return;
          var reader = new FileReader();
          reader.onload = function () {
            state.fileUploads[fieldKey] = reader.result;
            renderModal();
          };
          reader.readAsDataURL(file);
        };
        inp.click();
      };
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-bb-drop-toggle]'), function (btn) {
      btn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleDropdown(btn.getAttribute('data-bb-drop-toggle'));
      };
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-bb-drop-item]'), function (btn) {
      btn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        var key = btn.getAttribute('data-bb-drop-item');
        var value = btn.getAttribute('data-bb-drop-value') || '';
        if (key === 'label-column') state.labelColumn = value;
        else if (key.indexOf('map:') === 0) state.mapping[key.slice(4)] = value;
        else if (key.indexOf('pp-') === 0) { state.openDropdown = ''; ppOnDrop(key, value); return; }
        state.openDropdown = '';
        renderModal();
      };
    });

    // Choice cards / mode entry (Excel, Yapay Zeka or Ürünler) from the chooser
    Array.prototype.forEach.call(root.querySelectorAll('[data-bb-mode]'), function (btn) {
      btn.onclick = function () {
        if (state.creating || state.aiBusy || state.prodBusy || btn.disabled) return;
        var m = btn.getAttribute('data-bb-mode');
        if (!m || m === state.mode) return;
        state.mode = m; state.step = 1; state.aiError = ''; state.openDropdown = '';
        // The product picker loads its dictionaries + first page on entry; every other mode is static.
        if (m === 'products') ppEnter();
        else renderModal();
      };
    });
    // Header "back to chooser"
    var toChoose = document.getElementById('bulk-builder-tochoose');
    if (toChoose) toChoose.onclick = function () {
      if (state.creating || state.aiBusy || state.prodBusy) return;
      state.mode = ''; state.step = 1; state.aiError = ''; state.openDropdown = ''; renderModal();
    };
    if (state.mode === 'products') ppBind(root);
    // (Re)bind header drag, leak-free: the panel innerHTML (and its header) is rebuilt every render,
    // so dispose the previous binding before re-applying. VEFloat exists by call time (video loads it).
    if (window.VEFloat && VEFloat.drag) {
      var dpanel = root.querySelector('.bulk-builder-panel');
      if (dpanel) {
        if (dpanel._bbDragDispose) { try { dpanel._bbDragDispose(); } catch (e) {} }
        var head = document.getElementById('bulk-builder-head');
        dpanel._bbDragDispose = head ? VEFloat.drag(dpanel, head, 'bulkBuilder') : null;
      }
    }
    // AI mode controls
    var aiBrief = document.getElementById('bb-ai-brief');
    if (aiBrief) aiBrief.oninput = function () { state.aiBrief = aiBrief.value; };
    Array.prototype.forEach.call(root.querySelectorAll('[data-bb-ainote]'), function (inp) {
      inp.oninput = function () { state.aiFieldNotes[inp.getAttribute('data-bb-ainote')] = inp.value; };
    });
    var aiGen = document.getElementById('bb-ai-generate');
    if (aiGen) aiGen.onclick = _bbAiGenerate;
    var runCancel = document.getElementById('bb-run-cancel');
    if (runCancel) runCancel.onclick = function () { if (state.aiRun) { state.aiRun.cancelled = true; state.aiRun.note = 'Durduruluyor...'; renderModal(); } };
    // Multi-page: focus a page (its fields + preview show below), toggle its selection, or select all.
    function bbFocusPage(i) {
      var p = state.aiPages && state.aiPages[i];
      if (!p) return;
      state.aiFocus = i;
      state.fields = p.fields;
      state._srcJsonStr = p.srcJsonStr; state._srcBg = p.srcBg; state._srcW = p.srcW; state._srcH = p.srcH;
      state._sceneMode = false; state._aiPreviewUrl = '';
      renderModal();
    }
    Array.prototype.forEach.call(root.querySelectorAll('[data-bb-ptab-focus]'), function (b) {
      b.onclick = function (e) { e.stopPropagation(); bbFocusPage(parseInt(b.getAttribute('data-bb-ptab-focus'), 10)); };
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-bb-ptab-sel]'), function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        var i = parseInt(b.getAttribute('data-bb-ptab-sel'), 10);
        var p = state.aiPages && state.aiPages[i];
        if (p) { p.selected = !p.selected; renderModal(); }
      };
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-bb-ptab]'), function (b) {
      b.onclick = function () { bbFocusPage(parseInt(b.getAttribute('data-bb-ptab'), 10)); };
    });
    var ptabAll = document.getElementById('bb-ptab-all');
    if (ptabAll) ptabAll.onclick = function () {
      if (!state.aiPages) return;
      var allOn = state.aiPages.every(function (p) { return p.selected; });
      state.aiPages.forEach(function (p) { p.selected = !allOn; });
      renderModal();
    };
    Array.prototype.forEach.call(root.querySelectorAll('[data-bb-chip]'), function (b) {
      b.onclick = function () {
        var starter = b.getAttribute('data-bb-chip') || '';
        state.aiBrief = starter;
        var ta = document.getElementById('bb-ai-brief');
        if (ta) { ta.value = starter; ta.focus(); try { ta.setSelectionRange(starter.length, starter.length); } catch (e) {} }
      };
    });
    var mChange = document.getElementById('bb-model-change');
    if (mChange) mChange.onclick = function () { state.aiPickerOpen = !state.aiPickerOpen; renderModal(); };
    Array.prototype.forEach.call(root.querySelectorAll('[data-bb-model]'), function (b) {
      b.onclick = function () {
        state.aiProvider = b.getAttribute('data-bb-prov') || state.aiProvider;
        state.aiModel = b.getAttribute('data-bb-model');
        state.aiPickerOpen = false;
        renderModal();
      };
    });
  }

  function bbUnitTr(u) { return u === 'slide' ? 'slide' : (u === 'frame' ? 'frame' : 'page'); }

  /* A type glyph per design-field so the fields read as WHAT the AI will fill, not a flat list.
     Safe, common Lucide names only (unknown names render blank in this editor's icon set). */
  function fieldIcon(field) {
    var f = String(field.field || '').toLowerCase();
    var kind = field.kind || field.type || '';
    if (kind === 'image' || /image|logo|icon|photo|görsel|resim|foto/.test(f)) return 'image';
    if (kind === 'color' || /color|renk/.test(f)) return 'palette';
    if (/body|subtitle|desc|paragraf|metin|açıklama/.test(f)) return 'align-left';
    if (/author|name|isim|yazar/.test(f)) return 'user';
    if (/price|fiyat|tutar/.test(f)) return 'tag';
    if (/count|number|sayı|hash/.test(f)) return 'hash';
    return 'type'; // title, headline, cta, generic text
  }

  /* ══════════════ PRODUCTS source (docs/bulk-builder-products-source-plan.md) ══════════════
     Step 1 only. It ends by filling state.headers / state.rows / state.mapping, after which the
     EXISTING step 2 (mapping) and step 3 (preview + create) run untouched, and with them the
     page / slide / scene-frame writers. Never add a second generation path here. */
  var PP_PAGE = 24;    // picker grid page size (the server's own ceiling is 100)
  var PP_CAP = 300;    // products per run. REPORTED on screen; a silent cap reads as "all of them".

  function ppActive() { return !!(window.CCBulkProducts && CCBulkProducts.isActive()); }

  function ppResetState() {
    if (state.prodFetch) { try { state.prodFetch.cancel(); } catch (e) {} }
    state.prodFilter = { q: '', category: '', brandIds: [], brandNone: false, attrs: null, sort: 'updated_desc' };
    state.prodItems = []; state.prodTotal = 0; state.prodBrands = [];
    state.prodSel = {}; state.prodAll = false; state.prodStats = null; state.prodFetch = null;
    state.prodLoading = false; state.prodError = ''; state.prodBusy = false; state.prodNote = '';
    state._ppAttrKey = ''; state._ppAttrVal = '';
  }

  function ppSelCount() { return state.prodSel ? Object.keys(state.prodSel).length : 0; }

  /* Entering the mode: load the dictionaries once (CCProducts caches them for the session) and
     fetch the first page. Both are guarded on still being in this mode when they resolve. */
  function ppEnter() {
    ppResetState();
    if (!ppActive()) { renderModal(); return; }
    Promise.all([CCProducts.listCategories(), CCProducts.listAttributes()]).then(function (r) {
      state.prodCats = r[0] || []; state.prodAttrs = r[1] || [];
      if (state.mode === 'products') renderModal();
    });
    ppReload();
  }

  var _ppSeq = 0;
  function ppReload() {
    if (!ppActive()) return;
    state.prodLoading = true; state.prodError = ''; state.prodItems = [];
    ppPaint();
    var seq = ++_ppSeq;
    CCProducts.listProducts(CCBulkProducts.listParams(state.prodFilter, PP_PAGE, 0)).then(function (d) {
      if (seq !== _ppSeq || state.mode !== 'products') return;   // a later filter already won
      state.prodLoading = false;
      if (!d) { state.prodError = 'Products couldn\'t be loaded.'; ppPaint(); return; }
      state.prodItems = d.items || [];
      state.prodTotal = d.total || 0;
      state.prodBrands = d.brands || [];
      ppPaint();
    });
  }

  function ppLoadMore() {
    if (state.prodLoading || !ppActive()) return;
    state.prodLoading = true;
    ppPaint();
    var seq = ++_ppSeq;
    CCProducts.listProducts(CCBulkProducts.listParams(state.prodFilter, PP_PAGE, state.prodItems.length)).then(function (d) {
      if (seq !== _ppSeq || state.mode !== 'products') return;
      state.prodLoading = false;
      if (d && d.items) { state.prodItems = state.prodItems.concat(d.items); state.prodTotal = d.total || state.prodTotal; }
      ppPaint();
    });
  }

  /* Repaint ONLY the grid, the selection bar and the footer button. A full renderModal() would
     rebuild the search input and steal focus mid-typing, which is why the debounce below calls
     this instead. Falls back to a full render when the step is not on screen yet. */
  function ppPaint() {
    var grid = document.getElementById('bb-pp-grid');
    if (!grid || state.mode !== 'products' || state.step !== 1) { renderModal(); return; }
    grid.innerHTML = ppGridHtml();
    var bar = document.getElementById('bb-pp-bar');
    if (bar) bar.innerHTML = ppBarHtml();
    var btn = document.getElementById('bb-pp-continue');
    if (btn) {
      var n = ppSelCount();
      btn.disabled = !(state.prodAll || n) || state.prodBusy;
      var lbl = btn.querySelector('span');
      if (lbl) lbl.textContent = state.prodBusy ? 'Fetching...' : (state.prodAll ? 'Continue (all)' : ('Continue' + (n ? ' (' + n + ' products)' : '')));
    }
  }

  function ppCatItems() {
    var cats = state.prodCats || [];
    var out = [];
    function kids(pid) { return cats.filter(function (c) { return c.parentId === pid; }); }
    function walk(c, depth) {
      var pad = '';
      for (var i = 0; i < depth; i++) pad += ' ';
      out.push({ value: c.systemKey, label: pad + (depth ? '– ' : '') + c.name });
      kids(c.id).forEach(function (k) { walk(k, depth + 1); });
    }
    cats.filter(function (c) { return !c.parentId; }).forEach(function (r) { walk(r, 0); });
    return out;
  }

  function ppAttrDef(key) {
    var list = state.prodAttrs || [];
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
    return null;
  }

  /* The brand question has THREE answers, not two: every brand, no brand at all, or a named one.
     "Markasız" cannot be said on the brandIds axis (that one means "any of these brands"), so it
     rides the product RULE language instead (CCBulkProducts.BRAND_NONE). They are mutually
     exclusive by construction: one dropdown, one value. */
  function ppBrandValue() {
    if (state.prodFilter.brandNone) return '__none';
    return (state.prodFilter.brandIds && state.prodFilter.brandIds[0]) || '';
  }
  function ppSetBrand(v) {
    state.prodFilter.brandNone = (v === '__none');
    state.prodFilter.brandIds = (v && v !== '__none') ? [v] : [];
  }

  /* A brand is recognised by its LOGO, not by its name in a list (owner 2026-08-06: "marka resmi
     yok"). Order: the real logo, else the brand's own first palette colour as a chip with its
     initial, else a neutral initial. `palette.colors` is a string array in older rows and an array
     of {hex} in current ones; both are read rather than assuming one. */
  function ppBrandGlyph(b) {
    if (!b) return '';
    if (b.logoKey && window.CCBulkProducts) {
      return '<span class="bb-pp-glyph is-logo" style="background-image:url(\'' + CCBulkProducts.blobUrl(b.logoKey, 48) + '\')"></span>';
    }
    var hex = '';
    var cols = (b.palette && b.palette.colors) || [];
    for (var i = 0; i < cols.length && !hex; i++) {
      var c = cols[i];
      if (typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c)) hex = c;
      else if (c && typeof c === 'object' && /^#[0-9a-f]{3,8}$/i.test(c.hex || '')) hex = c.hex;
    }
    var initial = esc(String(b.name || '?').trim().charAt(0).toUpperCase());
    return '<span class="bb-pp-glyph is-initial"' + (hex ? ' style="background:' + esc(hex) + ';color:#0b0b0d"' : '') + '>' + initial + '</span>';
  }

  function ppOnDrop(key, value) {
    var f = state.prodFilter;
    if (key === 'pp-cat') f.category = value;
    else if (key === 'pp-brand') ppSetBrand(value);
    else if (key === 'pp-attrkey') {
      state._ppAttrKey = value; state._ppAttrVal = '';
      f.attrs = null;
    } else if (key === 'pp-attrval') {
      state._ppAttrVal = value;
      f.attrs = (state._ppAttrKey && value) ? (function () { var o = {}; o[state._ppAttrKey] = value; return o; })() : null;
    } else return false;
    state.prodAll = false;                       // the filter changed: "all matching" no longer means the same set
    renderModal();   // the trigger label and the attribute-value control belong to the panel body
    ppReload();
    return true;
  }

  function ppBrandOf(it) {
    var ids = (it && it.brandIds) || [];
    if (!ids.length) return null;
    var list = state.prodBrands || [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === ids[0]) return list[i];
    return null;
  }

  function ppCardHtml(it) {
    var sel = !!(state.prodSel && state.prodSel[it.id]) || state.prodAll;
    var cover = (it.imageKeys && it.imageKeys[0]) ? CCBulkProducts.blobUrl(it.imageKeys[0], 240) : '';
    var brand = ppBrandOf(it);
    var line = brand
      ? ppBrandGlyph(brand) + '<span class="bb-pp-cat-t">' + esc(brand.name) + (it.categoryName ? ' · ' + esc(it.categoryName) : '') + '</span>'
      : '<span class="bb-pp-cat-t is-dim">' + esc(it.categoryName || 'Unbranded') + '</span>';
    return '<button type="button" class="bb-pp-card' + (sel ? ' is-sel' : '') + '" data-bb-pp="' + esc(it.id) + '" title="' + esc(it.name) + '">' +
        '<span class="bb-pp-check">' + (sel ? lucideIcon('check', 12) : '') + '</span>' +
        (cover
          ? '<span class="bb-pp-thumb" style="background-image:url(\'' + cover + '\')"></span>'
          : '<span class="bb-pp-thumb is-empty">' + lucideIcon('package', 18) + '</span>') +
        '<span class="bb-pp-meta">' +
          '<span class="bb-pp-name">' + esc(it.name) + '</span>' +
          '<span class="bb-pp-cat">' + line + '</span>' +
        '</span>' +
      '</button>';
  }

  function ppGridHtml() {
    if (state.prodError) {
      return '<div class="bb-pp-state">' +
          '<div class="bb-pp-state-title">' + esc(state.prodError) + '</div>' +
          '<button type="button" class="bulk-builder-secondary bb-pp-state-btn" data-bb-pp-retry="1">Try again</button>' +
        '</div>';
    }
    if (state.prodLoading && !state.prodItems.length) {
      var sk = '';
      for (var i = 0; i < 8; i++) sk += '<span class="bb-pp-card is-skel"><span class="bb-pp-thumb"></span><span class="bb-pp-meta"><span class="bb-pp-skel-line"></span><span class="bb-pp-skel-line short"></span></span></span>';
      return '<div class="bb-pp-grid">' + sk + '</div>';
    }
    if (!state.prodItems.length) {
      var filtered = !!(state.prodFilter.q || state.prodFilter.category || state.prodFilter.brandNone ||
        (state.prodFilter.brandIds && state.prodFilter.brandIds.length) || state.prodFilter.attrs);
      return '<div class="bb-pp-state">' +
          '<div class="bb-pp-state-title">' + (filtered ? 'No results' : 'No products yet') + '</div>' +
          '<div class="bb-pp-state-sub">' + (filtered
            ? 'No products found matching the search or filters.'
            : 'Add products from the panel\'s Assets &gt; Products section, and they\'ll appear here automatically.') + '</div>' +
          (filtered
            ? '<button type="button" class="bulk-builder-secondary bb-pp-state-btn" data-bb-pp-clear="1">Clear filters</button>'
            : '<a class="bulk-builder-secondary bb-pp-state-btn" href="/library" target="_blank" rel="noopener">Open product library</a>') +
        '</div>';
    }
    var html = '<div class="bb-pp-grid">' + state.prodItems.map(ppCardHtml).join('') + '</div>';
    if (state.prodItems.length < state.prodTotal) {
      html += '<button type="button" class="bulk-builder-secondary bb-pp-more" data-bb-pp-more="1"' + (state.prodLoading ? ' disabled' : '') + '>' +
        (state.prodLoading ? 'Loading...' : ('Show more (' + (state.prodTotal - state.prodItems.length) + ')')) + '</button>';
    }
    return html;
  }

  function ppBarHtml() {
    var n = ppSelCount();
    var matching = state.prodTotal || 0;
    var willTake = Math.min(matching, PP_CAP);
    var left = state.prodAll
      ? '<span><b>All products</b> matching the filter are selected' + (matching > PP_CAP ? ' · first ' + PP_CAP + ' are fetched' : (matching ? ' (' + willTake + ')' : '')) + '</span>'
      : '<span><b>' + n + '</b> products selected' + (matching ? ' · ' + matching + ' match' : '') + '</span>';
    var right = '';
    if (matching > 1) {
      right += '<button type="button" class="bb-pp-linkbtn" data-bb-pp-all="1">' +
        (state.prodAll ? 'Clear selection' : ('Select all (' + matching + ')')) + '</button>';
    }
    if (n || state.prodAll) right += '<button type="button" class="bb-pp-linkbtn" data-bb-pp-clearsel="1">Clear</button>';
    return left + '<span class="bb-pp-bar-actions">' + right + '</span>';
  }

  function renderProductsStep() {
    if (!ppActive()) {
      return '<div class="bulk-builder-empty">' +
          '<div class="bulk-builder-empty-ico">' + lucideIcon('package', 26) + '</div>' +
          '<div class="bulk-builder-empty-title">No panel connection</div>' +
          '<div class="bulk-builder-empty-sub">The product library is available when the editor is opened with a design from the panel. In this tab, you can use the Excel or AI source.</div>' +
        '</div>';
    }
    var brandOpts = [
      { value: '', label: 'All brands', glyph: '<span class="bb-pp-glyph is-ico">' + lucideIcon('tag', 13) + '</span>' },
      { value: '__none', label: 'No brand', glyph: '<span class="bb-pp-glyph is-none">' + lucideIcon('ban', 13) + '</span>' }
    ].concat((state.prodBrands || []).map(function (b) {
      return { value: b.id, label: b.name, glyph: ppBrandGlyph(b) };
    }));
    var catOpts = [{ value: '', label: 'All categories' }].concat(ppCatItems());
    var attrOpts = [{ value: '', label: 'Attribute' }]
      .concat((state.prodAttrs || []).map(function (a) { return { value: a.key, label: a.name }; }));
    var def = ppAttrDef(state._ppAttrKey);
    var attrValHtml = '';
    if (state._ppAttrKey) {
      if (def && def.type === 'select' && (def.options || []).length) {
        attrValHtml = renderDropdown('pp-attrval', state._ppAttrVal, 'Select value',
          [{ value: '', label: 'All values' }].concat(def.options.map(function (o) { return { value: o, label: o }; })), 'bb-pp-drop');
      } else {
        attrValHtml = '<input type="text" class="mform-input bb-pp-attrinput" id="bb-pp-attrval" value="' + esc(state._ppAttrVal || '') + '" placeholder="Type a value...">';
      }
    }
    return '' +
      '<div class="bb-pp" id="bb-pp-body">' +
        '<div class="bb-pp-bar-row">' +
          '<div class="bb-pp-search">' + lucideIcon('search', 14) +
            '<input type="text" id="bb-pp-search" value="' + esc(state.prodFilter.q || '') + '" placeholder="Search products...">' +
          '</div>' +
          renderDropdown('pp-cat', state.prodFilter.category, 'All categories', catOpts, 'bb-pp-drop', 'grid-3x3') +
          renderDropdown('pp-brand', ppBrandValue(), 'All brands', brandOpts, 'bb-pp-drop', 'tag') +
          renderDropdown('pp-attrkey', state._ppAttrKey, 'Attribute', attrOpts, 'bb-pp-drop', 'sliders-horizontal') +
          attrValHtml +
        '</div>' +
        '<div class="bb-pp-selbar" id="bb-pp-bar">' + ppBarHtml() + '</div>' +
        '<div id="bb-pp-grid">' + ppGridHtml() + '</div>' +
        '<div class="bb-pp-note">' +
          'Each product becomes a ' + esc(bbUnitTr(state._unitNoun)) + '. Archived products aren\'t included; at most <b>' + PP_CAP + '</b> products are fetched.' +
        '</div>' +
        (state.prodNote ? '<div class="bb-pp-note" id="bb-pp-note">' + esc(state.prodNote) + '</div>' : '') +
      '</div>';
  }

  function ppBind(root) {
    var body = document.getElementById('bb-pp-body');
    if (body && !body._ppBound) {
      body._ppBound = true;
      body.addEventListener('click', function (e) {
        var n = e.target && e.target.closest ? e.target.closest('[data-bb-pp],[data-bb-pp-more],[data-bb-pp-all],[data-bb-pp-clear],[data-bb-pp-clearsel],[data-bb-pp-retry]') : null;
        if (!n || state.prodBusy) return;
        if (n.hasAttribute('data-bb-pp-more')) { ppLoadMore(); return; }
        if (n.hasAttribute('data-bb-pp-retry')) { ppReload(); return; }
        if (n.hasAttribute('data-bb-pp-clear')) {
          state.prodFilter.q = ''; state.prodFilter.category = ''; ppSetBrand('');
          state.prodFilter.attrs = null; state._ppAttrKey = ''; state._ppAttrVal = '';
          renderModal(); ppReload(); return;
        }
        if (n.hasAttribute('data-bb-pp-clearsel')) { state.prodSel = {}; state.prodAll = false; ppPaint(); return; }
        if (n.hasAttribute('data-bb-pp-all')) {
          state.prodAll = !state.prodAll;
          if (state.prodAll) state.prodSel = {};     // the filter IS the selection now
          ppPaint(); return;
        }
        var id = n.getAttribute('data-bb-pp');
        if (!id) return;
        // Ticking a card while "all" is on turns the blanket selection into an explicit one, starting
        // from what is on screen: silently dropping one product out of "all" would be a lie the user
        // cannot see on the pages that come out.
        if (state.prodAll) {
          state.prodAll = false;
          state.prodSel = {};
          state.prodItems.forEach(function (it) { if (it && it.id !== id) state.prodSel[it.id] = it; });
          ppPaint(); return;
        }
        if (state.prodSel[id]) delete state.prodSel[id];
        else {
          for (var i = 0; i < state.prodItems.length; i++) {
            if (state.prodItems[i] && state.prodItems[i].id === id) { state.prodSel[id] = state.prodItems[i]; break; }
          }
        }
        ppPaint();
      });
    }
    var search = document.getElementById('bb-pp-search');
    if (search && !search._ppBound) {
      search._ppBound = true;
      var t = null;
      search.addEventListener('input', function () {
        if (t) clearTimeout(t);
        t = setTimeout(function () {
          state.prodFilter.q = search.value.trim();
          state.prodAll = false;
          ppReload();                 // repaints the grid only, so typing is never interrupted
        }, 300);
      });
    }
    var av = document.getElementById('bb-pp-attrval');
    if (av && !av._ppBound) {
      av._ppBound = true;
      var t2 = null;
      av.addEventListener('input', function () {
        if (t2) clearTimeout(t2);
        t2 = setTimeout(function () {
          state._ppAttrVal = av.value.trim();
          var o = null;
          if (state._ppAttrKey && state._ppAttrVal) { o = {}; o[state._ppAttrKey] = state._ppAttrVal; }
          state.prodFilter.attrs = o;
          state.prodAll = false;
          ppReload();
        }, 400);
      });
    }
    var cont = document.getElementById('bb-pp-continue');
    if (cont) cont.onclick = ppContinue;
    var cancel = document.getElementById('bb-pp-cancel');
    if (cancel) cancel.onclick = function () {
      if (state.prodFetch) { try { state.prodFetch.cancel(); } catch (e) {} state.prodFetch = null; }
      state.prodBusy = false; state.prodNote = ''; renderModal();
    };
    void root;
  }

  /* "Devam": turn the selection into rows. A manual selection is already in memory (the picker keeps
     the item objects, not just ids), so it needs no second request; "all matching" is fetched page by
     page here, because the grid only ever held a window on it. */
  function ppContinue() {
    if (state.prodBusy) return;
    if (!ppActive()) { showError('No panel connection.'); return; }
    if (!state.prodAll && !ppSelCount()) { showError('Select at least one product.'); return; }
    if (!state.prodAll) {
      var items = [];
      Object.keys(state.prodSel).forEach(function (k) { items.push(state.prodSel[k]); });
      ppFinish(items, state.prodBrands, 0);
      return;
    }
    state.prodBusy = true; state.prodNote = 'Fetching products...'; state.prodError = '';
    renderModal();
    state.prodFetch = CCBulkProducts.fetchAll(state.prodFilter, PP_CAP, function (done, total) {
      state.prodNote = done + ' / ' + total + ' products fetched';
      var n = document.getElementById('bb-pp-note');
      if (n) n.textContent = state.prodNote;
    }, function (err, res) {
      state.prodFetch = null;
      if (err) { state.prodBusy = false; state.prodNote = ''; state.prodError = err.message || 'Products couldn\'t be fetched.'; renderModal(); return; }
      if (!res) { state.prodBusy = false; state.prodNote = ''; renderModal(); return; }   // cancelled
      ppFinish(res.items, res.brands, res.capped ? res.total : 0);
    });
  }

  /* What the selection could NOT give, said out loud on the review step. A product with no image
     still becomes a page (the template's own image stays), but the user has to learn that here and
     not by scrolling 40 pages afterwards. Same for the run cap. */
  function ppStatsHtml() {
    if (state.mode !== 'products' || !state.prodStats) return '';
    var s = state.prodStats, lines = [];
    var unit = bbUnitTr(state._unitNoun);
    if (s.cappedTotal) lines.push(s.cappedTotal + ' products match filter; the first ' + state.rows.length + ' were fetched (run limit ' + PP_CAP + ').');
    if (s.noImage) lines.push(s.noImage + ' products have no image: those ' + unit + 's keep the template\'s own image.');
    // The measured cause of "prices are not being pulled": the library row itself is empty. Say
    // WHERE the value is missing, not just that it is.
    if (s.noPrice === s.total) lines.push('NONE of the selected products have a price (empty in the product library): the price field keeps the template\'s value. Enter the price from the /library product page.');
    else if (s.noPrice) lines.push(s.noPrice + ' products have no price entered: those ' + unit + 'keep the template\'s price text.');
    // The struck-through list price is only worth reporting when the design actually asks for it.
    var wantsCompare = false;
    Object.keys(state.mapping || {}).forEach(function (f) { if (state.mapping[f] === 'product-compare-price') wantsCompare = true; });
    if (wantsCompare && s.noCompare === s.total) lines.push('Original price (strikethrough) hasn\'t been entered for any product: that field keeps the template\'s value.');
    else if (wantsCompare && s.noCompare) lines.push(s.noCompare + ' products have no original price.');
    if (!lines.length) return '';
    return '<div class="bulk-builder-map-warn bb-pp-warn">' + lucideIcon('triangle-alert', 12) +
      '<span>' + lines.map(function (l) { return esc(l); }).join('<br>') + '</span></div>';
  }

  function ppCatName() {
    var cat = '';
    if (state.prodFilter && state.prodFilter.category) {
      (state.prodCats || []).forEach(function (c) { if (c.systemKey === state.prodFilter.category) cat = c.name; });
    }
    return cat;
  }

  /* THE DEFAULT NAME ALWAYS OPENS A NEW GROUP (owner 2026-08-06, twice).
     `_createPagesCore` finds a group BY NAME and writes into it, so a repeated default name wrote
     the second run on top of the first. The same products in a DIFFERENT build is an ordinary
     thing to want (another template, another size, another language), and it has nothing to do
     with the earlier run, so no overlap test and no reuse: if the name is taken, take the next
     one. Updating in place stays reachable, but only by TYPING the existing group's name, which
     is a deliberate act rather than a coincidence. */
  function ppUniqueGroupName(base) {
    if (typeof pageGroups === 'undefined' || !pageGroups || !pageGroups.length) return base;
    function taken(n) {
      for (var i = 0; i < pageGroups.length; i++) if (pageGroups[i] && pageGroups[i].name === n) return true;
      return false;
    }
    if (!taken(base)) return base;
    var n = 2;
    while (taken(base + ' ' + n) && n < 500) n++;
    return base + ' ' + n;
  }

  function ppGroupName() {
    var cat = ppCatName();
    return ppUniqueGroupName(cat ? ('Products · ' + cat) : 'Products');
  }

  /* What step 2 prints where the Excel flow prints the file name. It must NOT be the count (the row
     beside it already says "N ürün"); it is WHICH slice of the library this came from, so a run can
     be recognised later. */
  function ppSourceLabel() {
    var bits = [], f = state.prodFilter || {};
    if (f.brandNone) bits.push('No brand');
    else if (f.brandIds && f.brandIds.length) {
      (state.prodBrands || []).forEach(function (b) { if (b.id === f.brandIds[0]) bits.push(b.name); });
    }
    var cat = ppCatName();
    if (cat) bits.push(cat);
    if (f.attrs) Object.keys(f.attrs).forEach(function (k) { bits.push(k + ': ' + f.attrs[k]); });
    if (f.q) bits.push('"' + f.q + '"');
    return 'Product library' + (bits.length ? ' · ' + bits.join(' · ') : '');
  }

  function ppFinish(items, brands, cappedTotal) {
    items = (items || []).filter(Boolean);
    if (!items.length) { state.prodBusy = false; state.prodNote = ''; showError('No products match the selection.'); renderModal(); return; }
    var built = CCBulkProducts.toRows(items, { brands: brands || state.prodBrands });
    state.headers = built.headers;
    state.rows = built.rows;
    state.prodStats = built.stats;
    state.prodStats.cappedTotal = cappedTotal || 0;
    state.fileName = ppSourceLabel();
    // Product columns ARE the design-field keys, so this lands them already matched; a generic field
    // (title, hero-image) stays unmapped and is picked by hand, same as the Excel flow.
    state.mapping = CCBulk.defaultMapping(state.fields, state.headers);
    state.labelColumn = built.headers.indexOf('product-name') !== -1 ? 'product-name' : '';
    if (!state.groupName || state.groupName === getDefaultGroupName() || /^Ürünler( · .+?)?( \d+)?$/.test(state.groupName)) {
      state.groupName = ppGroupName();
    }
    state.prodBusy = false; state.prodNote = ''; state.openDropdown = '';
    state.imageSizes = {}; state._pvMeasured = false;   // new selection: measure again
    state.step = 2;
    renderModal();
  }

  /* The ENTRY screen (owner: "ilk farklı modal gelsin: seçili alanları neyle doldurmak istersin,
     AI yoksa Excel"). Shows the design fields detected on the active part, then two choice cards.
     Zero fields is NOT a hard block anymore: a designed empty-state guides the user to assign one. */
  function renderChooseStep() {
    if (!state.fields.length) {
      var unit = bbUnitTr(state._unitNoun);
      return '<div class="bulk-builder-empty">' +
          '<div class="bulk-builder-empty-ico">' + lucideIcon('mouse-pointer-square-dashed', 26) + '</div>' +
          '<div class="bulk-builder-empty-title">No design field yet</div>' +
          '<div class="bulk-builder-empty-sub">Select an object on this ' + esc(unit) + ' and assign <strong>Design Field</strong> (e.g. title, image, price) from the right panel. Then come back here; let AI or Excel multiply those fields.</div>' +
        '</div>';
    }
    var chips = state.fields.map(function (field) {
      var isGridCell = field.type === 'grid-cell';
      var chipName = isGridCell ? field.field.replace(/::cell\(\d+,\d+\)$/, '') : field.field;
      var chipType = isGridCell ? field.note : (field.kind || field.type || 'object');
      return '<div class="bulk-builder-field-chip"><strong>' + esc(chipName) + '</strong><span>' + esc(chipType) + '</span></div>';
    }).join('');
    /* `off` = a reason string: the card renders disabled and SAYS why. A card that opens onto an
       empty screen is indistinguishable from a broken one. */
    function card(m, icon, title, desc, foot, off) {
      return '<button type="button" class="bulk-builder-choice' + (off ? ' is-off' : '') + '" data-bb-mode="' + m + '"' + (off ? ' disabled' : '') + '>' +
          '<span class="bulk-builder-choice-ico">' + lucideIcon(icon, 22) + '</span>' +
          '<span class="bulk-builder-choice-body">' +
            '<span class="bulk-builder-choice-title">' + title + '</span>' +
            '<span class="bulk-builder-choice-desc">' + (off ? esc(off) : desc) + '</span>' +
            '<span class="bulk-builder-choice-foot"><span>' + foot + '</span>' + lucideIcon('arrow-right', 14) + '</span>' +
          '</span>' +
        '</button>';
    }
    return '' +
      '<div class="bulk-builder-section">' +
        '<div class="bulk-builder-mini-title">Doldurulacak alanlar (' + state.fields.length + ')</div>' +
        '<div class="bulk-builder-field-list">' + chips + '</div>' +
      '</div>' +
      '<div class="bulk-builder-section">' +
        '<div class="bulk-builder-mini-title">What to fill with?</div>' +
        '<div class="bulk-builder-choice-grid">' +
          card('ai', 'sparkles', 'AI', 'Write what you want, let AI fill the fields. You do the design, it doesn\'t change it.', 'Variations Generator') +
          card('excel', 'file-spreadsheet', 'Excel / CSV', 'Upload your own data, match columns to fields, generate in groups.', 'Upload file') +
          /* COMMUNITY EDITION: no `off` argument, so the card is clickable. Upstream greys it out
             when the catalogue is unreachable, and a disabled button that never explains itself is
             the ghost UI this build exists not to ship. Clicking it opens the card. */
          card('products', 'package', 'Products',
            'Select from your panel\'s product library; name, price, image and attributes will fill the fields automatically.',
            'Select from library') +
        '</div>' +
      '</div>';
  }

  function renderModal() {
    var root = ensureModal();
    var panel = root.querySelector('.bulk-builder-panel');
    if (!panel) return;
    var mode = state.mode;
    var body, sub;
    if (mode === 'ai') {
      /* COMMUNITY EDITION: the Variations Generator runs on the dika studio AI pool. Its controls
         (model picker, brief box, Generate) used to render live and could only ever fail, which is
         the ghost UI this build exists not to ship. The card says what it is instead. The Excel and
         Products halves are untouched. */
      body = '<div id="bb-ai-locked"></div>';
      sub = 'AI field generation is part of the dika studio service.';
    } else if (mode === 'excel') {
      body = state.step === 1 ? renderUploadStep() : (state.step === 2 ? renderMappingStep() : renderCreateStep());
      sub = 'Upload your data, match columns to design fields, start bulk generation.';
    } else if (mode === 'products') {
      /* COMMUNITY EDITION: step 1 is the dika studio product catalogue picker, so it becomes the ad
         card. Steps 2 and 3 are the SHARED wizard (Excel uses them too) and are untouched: a person
         who arrived here from a spreadsheet still gets mapping and generation. */
      if (window.CCEdition && CCEdition.serverless && state.step === 1) {
        body = '<div id="bb-products-locked"></div>';
        sub = 'The product library is part of the dika studio service.';
      } else {
        body = state.step === 1 ? renderProductsStep() : (state.step === 2 ? renderMappingStep() : renderCreateStep());
        sub = state.step === 1
          ? ('Select the products to turn into pages. Each product becomes a ' + bbUnitTr(state._unitNoun) + '.')
          : 'Map product columns to design fields, then create.';
      }
    } else {
      body = renderChooseStep();
      sub = 'Active ' + bbUnitTr(state._unitNoun) + ': what should we fill the design fields with?';
    }
    var busy = state.creating || state.aiBusy || state.prodBusy;
    var backBtn = (mode === 'ai' || mode === 'excel' || mode === 'products')
      ? '<button type="button" class="bulk-builder-back-ico" id="bulk-builder-tochoose" title="Back"' + (busy ? ' disabled' : '') + '>' + lucideIcon('arrow-left', 15) + '</button>'
      : '';
    var badge = mode === 'ai'
      ? '<span class="bulk-builder-modebadge">' + lucideIcon('sparkles', 12) + 'AI</span>'
      : (mode === 'excel' ? '<span class="bulk-builder-modebadge">' + lucideIcon('file-spreadsheet', 12) + 'Excel / CSV</span>'
      : (mode === 'products' ? '<span class="bulk-builder-modebadge">' + lucideIcon('package', 12) + 'Products</span>' : ''));
    panel.innerHTML = '' +
      '<div class="bulk-builder-head" id="bulk-builder-head">' +
        '<div class="bulk-builder-head-l">' +
          backBtn +
          '<div>' +
            '<div class="bulk-builder-title" id="bulk-builder-title">' + lucideIcon('file-stack', 17) + '<span>Bulk Builder</span>' + badge + '</div>' +
            '<div class="bulk-builder-sub">' + sub + '</div>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="bulk-builder-close" id="bulk-builder-close"' + (busy ? ' disabled' : '') + '>' + lucideIcon('x', 16) + '</button>' +
      '</div>' +
      (mode === 'excel' || mode === 'products' ? renderStepHeader() : '') +
      '<div class="bulk-builder-body">' + body + '</div>' +
      renderFooter() +
      '<i class="bulk-builder-grip" aria-hidden="true"></i>';
    var closeBtn = document.getElementById('bulk-builder-close');
    if (closeBtn) closeBtn.onclick = closeModal;
    bindModal();
    bbClampIntoView(panel);   // a taller mode must not hang below the viewport (footer/generate stays reachable)
    if ((mode === 'excel' || mode === 'products') && state.step === 3 && !state.creating) renderRowPreview();
    if (window.CCEdition && CCEdition.serverless && CCEdition.lockSurface) {
      if (mode === 'ai') CCEdition.lockSurface('#bb-ai-locked', 'ai');
      if (mode === 'products') CCEdition.lockSurface('#bb-products-locked', 'products');
    }
  }

  /* CURRENT chat-model catalog. HAND-MIRROR of apps/web/public/editor-ai/portal/modes.js
     upgradeCatalog() (owner-maintained "2026-07, last 3 models per provider; the stale ones the
     editor's ai.js still lists were pulled from the providers' docs"). The editor does NOT run that
     portal upgrade, so its AIA.AI_PROVIDERS is stale - we source the picker from here instead, so the
     bulk builder shows the SAME models as the :3000/ai chat screen. fal/byteplus are video/image-only
     (noChat) and excluded. DRIFT RISK: this duplicates modes.js; keep in sync or extract to a shared
     catalog file (flagged to the owner). Request routing still uses AIA.AI_PROVIDERS[p].baseUrl, whose
     endpoints (api.moonshot.ai / api.z.ai+/v4) already match the proxy allow-list. */
  var BB_CHAT_CATALOG = [
    { provider: 'openai',   name: 'OpenAI',           models: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.4-mini', 'gpt-5.4'] },
    { provider: 'claude',   name: 'Anthropic Claude', models: ['claude-opus-5', 'claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5'] },
    { provider: 'google',   name: 'Google Gemini',    models: ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite'] },
    { provider: 'qwen',     name: 'Qwen (DashScope)', models: ['qwen3.8-max', 'qwen3.7-max', 'qwen3.7-plus', 'qwen3.6-flash'] },
    { provider: 'deepseek', name: 'DeepSeek',         models: ['deepseek-v4-pro', 'deepseek-v4-flash'] },
    { provider: 'kimi',     name: 'Kimi (Moonshot)',  models: ['kimi-k3', 'kimi-k2.7-code', 'kimi-k2.7-code-highspeed', 'kimi-k2.6'] },
    { provider: 'glm',      name: 'GLM (Zhipu)',      models: ['glm-5.2', 'glm-5-turbo', 'glm-5v-turbo'] }
  ];
  function bbCatEntry(p) { return BB_CHAT_CATALOG.filter(function (e) { return e.provider === p; })[0] || null; }
  /* Prefer the portal key check, fall back to the editor's; either reads the user's stored keys. */
  function bbHasKey(A, p) {
    var fn = A && (A._portalHasKey || A._hasServerKey);
    try { return fn ? !!fn.call(A, p) : false; } catch (e) { return false; }
  }

  /* Model picker, mirroring the AI-edit modal's ".ple-model" row (owner: "buna benzet"). Shows ONLY
     providers the user actually has a key for (owner: "key girmediğim modeller gözükmesin") and only
     the CURRENT models (BB_CHAT_CATALOG). No fake price/tier (chat models have none in the catalog).
     Picking sets state.aiProvider + state.aiModel; the request is built for THAT provider (see
     _bbAiGenerate), A._aiState is never left changed. */
  function renderModelPicker() {
    var A = window.__ccAI;
    var curProv = state.aiProvider, curModel = state.aiModel;
    var curEntry = bbCatEntry(curProv);
    var curLabel = curEntry ? curEntry.name : (curProv || 'AI');
    var row = '<div class="bb-model">' +
        '<div class="bb-model-main">' + lucideIcon('cpu', 13) +
          '<span class="bb-model-id">' + esc(curModel || 'no model selected') + '</span>' +
          '<span class="bb-model-prov">' + esc(curLabel) + '</span>' +
        '</div>' +
        '<button type="button" class="bb-model-change" id="bb-model-change">' + (state.aiPickerOpen ? 'Close' : 'Change') + '</button>' +
      '</div>';
    if (!state.aiPickerOpen) return row;
    var keyed = BB_CHAT_CATALOG.filter(function (e) { return bbHasKey(A, e.provider); });
    if (!keyed.length) {
      return row + '<div class="bb-model-list"><div class="bb-model-empty">You don\'t have a connected AI key yet. Link a key to a provider from Settings > AI; models will appear here.</div></div>';
    }
    var groups = keyed.map(function (e) {
      var head = '<div class="bb-model-group"><span>' + esc(e.name) + '</span></div>';
      var rows = e.models.map(function (m) {
        var sel = (e.provider === curProv && m === curModel) ? ' is-sel' : '';
        return '<button type="button" class="bb-model-row' + sel + '" data-bb-prov="' + esc(e.provider) + '" data-bb-model="' + esc(m) + '">' +
            '<span class="bb-model-row-l"><span class="bb-model-id">' + esc(m) + '</span></span>' +
          '</button>';
      }).join('');
      return head + rows;
    }).join('');
    return row + '<div class="bb-model-list">' + groups + '</div>';
  }

  /* AI mode: the design is made by the user; the AI ONLY fills the marked Design Fields.
     It auto-uses the "Variations Generator" skill in ISOLATION (reads the skill's prompt
     directly, never activates it in the chat), so the chat + other AI tools are untouched. */
  function renderAiStep() {
    if (!state.fields.length) {
      return '<div class="bulk-builder-section"><div class="bulk-builder-map-warn">' + lucideIcon('triangle-alert', 12) + '<span>First assign a Design Field to at least one object in the design (right panel), then AI will fill them.</span></div></div>';
    }
    var fieldRows = state.fields.map(function (field) {
      var isGridCell = field.type === 'grid-cell';
      var chipName = isGridCell ? field.field.replace(/::cell\(\d+,\d+\)$/, '') : field.field;
      var note = state.aiFieldNotes[field.field] || '';
      var cur = field.current ? String(field.current).slice(0, 80) : '';
      var isImg = (field.kind || field.type) === 'image';
      return '<div class="bb-field">' +
          '<div class="bb-field-head">' +
            '<span class="bb-field-ico">' + lucideIcon(fieldIcon(field), 15) + '</span>' +
            '<span class="bb-field-label">' + esc(chipName) + '</span>' +
            '<span class="bb-field-val">' + esc(cur || (isImg ? 'visual' : '')) + '</span>' +
          '</div>' +
          '<input type="text" class="bb-field-note" data-bb-ainote="' + esc(field.field) + '" value="' + esc(note) + '" placeholder="note (optional): e.g. don\'t translate this field, keep short">' +
        '</div>';
    }).join('');
    var progressHtml = '';
    if (state.aiRun) {
      var _run = state.aiRun;
      var _pct = _run.total ? Math.max(0, Math.min(100, Math.round(_run.done / _run.total * 100))) : 0;
      progressHtml = '<div class="bb-run">' +
          '<div class="bb-run-top">' +
            '<span class="bb-run-pct">%' + _pct + '</span>' +
            '<button type="button" class="bb-run-cancel" id="bb-run-cancel">' + lucideIcon('square', 13) + '<span>Cancel</span></button>' +
          '</div>' +
          '<div class="bb-run-bar"><i style="width:' + _pct + '%"></i></div>' +
          '<div class="bb-run-note">' + esc(_run.note || (_run.done + ' / ' + _run.total + ' pages')) + '</div>' +
          '<div class="bb-run-safe">' + lucideIcon('check', 12) + '<span>Finished pages have been added to the canvas; even if incomplete, they remain.</span></div>' +
        '</div>';
    } else if (state.aiError) {
      progressHtml = '<div class="bulk-builder-map-warn">' + lucideIcon('triangle-alert', 12) + '<span>' + esc(state.aiError) + '</span></div>';
    }
    var previewInner = state._aiPreviewUrl
      ? '<img id="bb-ai-preview-img" src="' + esc(state._aiPreviewUrl) + '" alt="Template preview">'
      : '<img id="bb-ai-preview-img" alt="Template preview" style="display:none"><div id="bb-ai-preview-status" class="bb-ai-preview-status">Preparing preview...</div>';
    // Multi-page (Phase 4): tab-name chips, one per page that has design fields. The checkbox selects a
    // page for the run; the chip body focuses it (its fields + preview show below). Active page = focused.
    var pagesTabsHtml = '', fieldsLabel = 'Doldurulacak alanlar';
    if (state.aiPages && state.aiPages.length > 1) {
      var selCount = 0;
      state.aiPages.forEach(function (p) { if (p.selected) selCount++; });
      var tabsHtml = state.aiPages.map(function (p, i) {
        var on = p.selected ? ' is-on' : '';
        var act = (i === state.aiFocus) ? ' is-active' : '';
        return '<div class="bb-ptab' + on + act + '" data-bb-ptab="' + i + '" title="' + esc(p.label) + '">' +
            '<button type="button" class="bb-ptab-cb" data-bb-ptab-sel="' + i + '" aria-label="Select">' + (p.selected ? lucideIcon('check', 12) : '') + '</button>' +
            '<button type="button" class="bb-ptab-name" data-bb-ptab-focus="' + i + '">' + esc(p.label) + '</button>' +
          '</div>';
      }).join('');
      var allOn = (selCount === state.aiPages.length);
      pagesTabsHtml = '<div class="bb-ai-block">' +
      '<div class="bb-eyebrow-row"><span class="bb-eyebrow">Pages</span><span class="bb-count-pill">' + selCount + ' / ' + state.aiPages.length + ' selected</span>' +
            '<button type="button" class="bb-ptab-all" id="bb-ptab-all">' + (allOn ? 'Deselect all' : 'Select all') + '</button></div>' +
          '<div class="bb-ptabs">' + tabsHtml + '</div>' +
          '<p class="bb-ai-hint">Each selected page is generated separately with the same instruction. Click the tab to see the fields.</p>' +
        '</div>';
      if (state.aiPages[state.aiFocus]) fieldsLabel = state.aiPages[state.aiFocus].label + ' fields';
    }
    return '' +
      '<div class="bulk-builder-ai">' +
        '<div class="bb-ai-cols">' +
          '<div class="bb-ai-main">' +
            '<div class="bb-ai-block">' +
              '<div class="bb-eyebrow">' + lucideIcon('sparkles', 12) + 'What should we do?</div>' +
              '<textarea class="bb-prompt" id="bb-ai-brief" placeholder="Write what you want to do. Duplicate fields with different content, translate to other languages, change the tone...">' + esc(state.aiBrief || '') + '</textarea>' +
              '<div class="bb-chips">' +
                '<button type="button" class="bb-chip" data-bb-chip="Duplicate fields with different content: ">' + lucideIcon('copy', 13) + '<span>Duplicate</span></button>' +
                '<button type="button" class="bb-chip" data-bb-chip="Translate this design to these languages: ">' + lucideIcon('globe', 13) + '<span>Translate</span></button>' +
                '<button type="button" class="bb-chip" data-bb-chip="Change the tone like this: ">' + lucideIcon('pencil', 13) + '<span>Yeniden yaz</span></button>' +
              '</div>' +
              '<p class="bb-ai-hint">AI sees the CURRENT content of fields; can duplicate, translate, or rewrite. Specify how many outputs you want in your instruction.</p>' +
            '</div>' +
            pagesTabsHtml +
            '<div class="bb-ai-block">' +
              '<div class="bb-eyebrow-row"><span class="bb-eyebrow">' + esc(fieldsLabel) + '</span><span class="bb-count-pill">' + state.fields.length + '</span></div>' +
              '<div class="bb-fields">' + fieldRows + '</div>' +
            '</div>' +
            '<div class="bb-ai-block">' +
              '<div class="bb-eyebrow">AI Modeli</div>' +
              renderModelPicker() +
            '</div>' +
          '</div>' +
          '<div class="bb-ai-side">' +
            '<div class="bb-eyebrow">Preview</div>' +
            '<div class="bb-ai-preview">' + previewInner + '</div>' +
            '<div class="bb-ai-side-info"><div><strong>' + state.fields.length + '</strong> field will be filled with AI</div><div>Generated ones become a group on canvas.</div></div>' +
          '</div>' +
        '</div>' +
        progressHtml +
      '</div>';
  }

  /* Right-panel preview: the CURRENT template rendered offscreen (NO row applied) via renderPart, the
     same real-canvas render the templates-panel covers use. Cached in state._aiPreviewUrl so it renders
     once, not on every re-render (chip click, model pick, note typing). */
  function renderAiPreview() {
    if (state._aiPreviewUrl || !state._srcJsonStr || typeof renderPart !== 'function') return;
    if (!document.getElementById('bb-ai-preview-img')) return;
    var token = ++_previewToken;
    var json;
    try { json = JSON.parse(state._srcJsonStr); } catch (e) { return; }
    var target = state._sceneMode
      ? { kind: 'frame', json: json, w: state._srcW, h: state._srcH, x: state._srcX, y: state._srcY, bg: state._srcBg }
      : { kind: 'page', json: json, w: state._srcW, h: state._srcH, bg: state._srcBg };
    renderPart(target, { fit: 480 }).then(function (url) {
      if (token !== _previewToken) return;
      state._aiPreviewUrl = url || '';
      var im = document.getElementById('bb-ai-preview-img');
      var st = document.getElementById('bb-ai-preview-status');
      if (!im) return;
      if (url) { im.src = url; im.style.display = ''; if (st) st.style.display = 'none'; }
      else if (st) st.textContent = 'Preview could not be created.';
    });
  }

  function _bbParseRows(text) {
    if (!text) return null;
    var s = text.indexOf('['), e = text.lastIndexOf(']');
    if (s === -1 || e === -1 || e < s) return null;
    try { var arr = JSON.parse(text.slice(s, e + 1)); return Array.isArray(arr) ? arr.filter(function (r) { return r && typeof r === 'object'; }) : null; } catch (er) { return null; }
  }

  function _bbParseList(text) {
    if (!text) return null;
    var s = text.indexOf('['), e = text.lastIndexOf(']');
    if (s === -1 || e === -1 || e < s) return null;
    try {
      var arr = JSON.parse(text.slice(s, e + 1));
      if (!Array.isArray(arr)) return null;
      return arr.map(function (x) { return (x == null ? '' : String(x)).trim(); }).filter(function (x) { return !!x; });
    } catch (er) { return null; }
  }

  /* Parse the PLAN pass into { translate, labels }: an object {"translate":bool,"labels":[...]} preferred,
     a bare [...] array tolerated (translate defaults false). translate drives the per-output naming
     (language prefix). Returns null if no labels could be read. */
  function _bbParsePlan(text) {
    if (!text) return null;
    var s = text.indexOf('{'), e = text.lastIndexOf('}');
    if (s !== -1 && e !== -1 && e > s) {
      try {
        var o = JSON.parse(text.slice(s, e + 1));
        if (o && Array.isArray(o.labels)) {
          var labels = o.labels.map(function (x) { return (x == null ? '' : String(x)).trim(); }).filter(function (x) { return !!x; });
          if (labels.length) return { translate: !!o.translate, labels: labels.length > 500 ? labels.slice(0, 500) : labels };
        }
      } catch (er) {}
    }
    var arr = _bbParseList(text);
    if (arr && arr.length) return { translate: false, labels: arr.length > 500 ? arr.slice(0, 500) : arr };
    return null;
  }

  /* COMMUNITY EDITION: no skills ship, so there is no skill-variations prompt to look up and
     window.__ccAI does not exist. The fallback string below was always the other branch of this
     function; it is now the only one. The rest of the AI block here is unreachable (the mode renders
     the card, so the Generate button is never drawn) and is recorded in the fork ledger as a
     follow-up rather than deleted piecemeal: it is a large connected block, and a half-deletion
     inside one of those is worse than dead code. Measured that the hard way in stock.js today. */
  function _bbAiSys() {
    var skill = null;
    return skill
      ? (skill.skillMd + (skill.references || []).map(function (r) { return '\n\n' + r.title + ':\n' + r.content; }).join(''))
      : 'You fill design fields. Return ONLY a JSON array of row objects mapping field name to value.';
  }

  function _bbFieldLinesFor(fields) {
    return fields.map(function (f) {
      var note = state.aiFieldNotes[f.field] || f.note || '';
      var cur = f.current ? String(f.current).slice(0, 240) : '';
      return '- "' + f.field + '" (' + (f.kind || f.type || 'text') + ')' + (cur ? ', current: "' + cur + '"' : '') + (note ? ', note: ' + note : '');
    }).join('\n');
  }

  /* The page-runs to generate: the CHECKED pages (multi-page, Phase 4) or the single active page. Each
     carries its OWN fields/template/mapping so the batch loop can run the same instruction across many
     pages, each output labeled with its page. */
  /* The one text field whose value best names an output (the "title"): a field literally named
     title/başlık/heading/name, else the first text field. Used to label each generated page from its
     own GENERATED value (owner: "titledan alabilirsin, design fieldlerda veriyoruz zaten"). */
  function _bbPickTitleField(fields) {
    if (!fields || !fields.length) return null;
    var firstText = null;
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i], nm = String(f.field || '').toLowerCase(), kind = (f.kind || f.type || 'text');
      if (kind !== 'text') continue;
      if (!firstText) firstText = f.field;
      if (/title|ba[sş]l[iı]k|heading|header|isim|name|^ad[ıi]?$/.test(nm)) return f.field;
    }
    return firstText;
  }

  function _bbBuildPageRuns() {
    var runs = [];
    if (state.aiPages && state.aiPages.length > 1) {
      state.aiPages.forEach(function (p) {
        if (!p.selected || !p.fields || !p.fields.length) return;
        var mp = {}; p.fields.forEach(function (f) { mp[f.field] = f.field; });
        runs.push({ fieldLines: _bbFieldLinesFor(p.fields), sourceJsonStr: p.srcJsonStr, mapping: mp, sourcePage: p.sourcePage,
          labelPrefix: p.label, groupName: p.label, titleField: _bbPickTitleField(p.fields), _group: null });
      });
    }
    if (!runs.length) {
      var src = ensureSourceReady();
      if (!src || !src.page || !state.fields.length) return [];
      var sp = src.page, m = {};
      state.fields.forEach(function (f) { m[f.field] = f.field; });
      runs.push({ fieldLines: _bbFieldLinesFor(state.fields), sourceJsonStr: JSON.stringify(sp.json), mapping: m,
        sourcePage: { bg: sp.bg, w: sp.w || (typeof CW !== 'undefined' ? CW : 1000), h: sp.h || (typeof CH !== 'undefined' ? CH : 1000), _productType: sp._productType, _pageDesignNote: sp._pageDesignNote },
        labelPrefix: '', groupName: (String(state.groupName || '').trim() || getDefaultGroupName()), titleField: _bbPickTitleField(state.fields), _group: null });
    }
    return runs;
  }

  /* ONE chat request to the PICKED provider, isolated (sync set/restore of A._aiState.provider around
     A._buildChatRequest, never touching _aiState.messages / active skill). Returns a Promise of the
     model's text output. Shared by the plan pass, every batch, and the fallback. */
  function _bbChat(sys, userMsg) {
    var A = window.__ccAI;
    var pickedProv = state.aiProvider || (A._aiState && A._aiState.provider) || '';
    var isClaude = pickedProv === 'claude';
    var model = state.aiModel || ((typeof A._getModelName === 'function') ? A._getModelName() : (A._aiState && A._aiState.model));
    var _o = A._aiState ? A._aiState.provider : null;
    if (A._aiState) A._aiState.provider = pickedProv;
    var req = A._buildChatRequest();
    if (A._aiState) A._aiState.provider = _o;
    var body = isClaude
      ? { model: model, system: sys, messages: [{ role: 'user', content: userMsg }], temperature: 0.9, max_tokens: 8192 }
      : { model: model, messages: [{ role: 'system', content: sys }, { role: 'user', content: userMsg }], temperature: 0.9, max_tokens: 8192 };
    return fetch(req.url, { method: 'POST', headers: req.headers, credentials: req.credentials, body: JSON.stringify(body) })
      .then(function (r) {
        return r.text().then(function (t) {
          var j = null; try { j = JSON.parse(t); } catch (e) {}
          if (!r.ok) {
            var m = (j && j.error && j.error.message) ? j.error.message : ('AI error (' + r.status + ')');
            if (j && j.error && j.error.code === 'NO_KEY') m = 'AI key not connected (Settings > AI).';
            throw new Error(m);
          }
          return isClaude
            ? (j && j.content && j.content[0] ? j.content[0].text : '')
            : (j && j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : '');
        });
      });
  }

  /* PLAN pass: ONE small request that returns the LIST of outputs (labels only), giving the exact total
     + a per-page label. Returns a Promise of a string[] (or null on parse-fail, triggering the fallback). */
  function _bbPlan(sys, brief, fieldLines) {
    var user = 'This request comes from the Bulk Builder (PLAN pass). Read the instruction and the design fields, then LIST the outputs you will produce, LABELS ONLY (no field content). Return ONLY a raw JSON object: {"translate": <true ONLY if the instruction asks to translate/localize into languages, else false>, "labels": [ ... ]}. When translate is true the labels are the LANGUAGE NAMES (written in the same language the user used). Otherwise the labels are a distinct short topic/seed per output. Honor any quantity named in the instruction; otherwise a sensible set (about 6 to 12). Hard cap 500.\n' + fieldLines + '\n\nInstruction: ' + brief + '\n\nReturn ONLY that JSON object.';
    return _bbChat(sys, user).then(function (out) {
      return _bbParsePlan(out);
    });
  }

  /* Commit ONE batch's rows to `pages` immediately (the anti-waste piece): each slice becomes real
     pages spliced in at the running insertAt, so they appear on the canvas and PERSIST before the next
     request. Standalone (does NOT touch the Excel _createPagesCore path). Returns count made. */
  function _bbAppendBatch(rows, labels, pageRun) {
    var run = state.aiRun; if (!run || !pageRun) return 0;
    var sp = pageRun.sourcePage, sjson = pageRun.sourceJsonStr, mapping = pageRun.mapping;
    // Each page-run has its OWN group (owner: "her sayfa için farklı grup"), minted lazily so a selected
    // page that yields no rows never leaves an empty group behind.
    if (!pageRun._group && typeof _pgCreateGroup === 'function') pageRun._group = _pgCreateGroup(pageRun.groupName || getDefaultGroupName());
    var made = 0, chunkNew = [];
    for (var i = 0; i < rows.length; i++) {
      var cloned;
      try { cloned = JSON.parse(sjson); } catch (e) { continue; }
      try { CCBulk.applyRow(cloned, rows[i], mapping, { fileUploads: {}, imageSizes: state.imageSizes }); } catch (e2) {}
      var lbl = _bbRowLabel(rows[i], (labels && labels[i]), pageRun, run.done + made);
      var np = {
        json: cloned, bg: sp.bg, label: lbl,
        w: sp.w || (typeof CW !== 'undefined' ? CW : 1000),
        h: sp.h || (typeof CH !== 'undefined' ? CH : 1000),
        _productType: sp._productType || (typeof activeProduct !== 'undefined' ? activeProduct : undefined),
        _pageDesignNote: sp._pageDesignNote || '',
        _bbRowKey: (pageRun.groupName || '') + '|' + lbl + '#' + (run.done + made)
      };
      if (pageRun._group) np.groupId = pageRun._group.id;
      chunkNew.push(np); made++;
    }
    if (chunkNew.length) {
      if (run._firstNewIndex == null) run._firstNewIndex = run.insertAt;
      Array.prototype.splice.apply(pages, [run.insertAt, 0].concat(chunkNew));
      run.insertAt += chunkNew.length;
      if (typeof renderPageTabs === 'function') renderPageTabs();
    }
    return made;
  }

  /* One output's page label. Name it by its GENERATED title-field value (owner: "titledan alabilirsin");
     for a translation prefix the language ("Türkçe · Merhaba"); a non-translation is just the title; if
     there is no usable title fall back to the plan label (language/seed), then the page/tab name. */
  function _bbRowLabel(row, planLabelRaw, pageRun, ordinal) {
    var run = state.aiRun, isTr = !!(run && run.translate);
    var planLabel = (planLabelRaw != null) ? String(planLabelRaw).trim() : '';
    var title = (pageRun.titleField && row && row[pageRun.titleField] != null) ? String(row[pageRun.titleField]).trim() : '';
    // Title source order: generated title field, then (non-translate) plan seed, then tab/page name, then ordinal.
    if (!title) title = isTr ? (pageRun.labelPrefix || '') : (planLabel || pageRun.labelPrefix || '');
    if (!title) title = 'Page ' + (ordinal + 1);
    // Translation: prefix the language ("Türkçe · Merhaba"); otherwise the title alone is the name.
    return (isTr && planLabel && planLabel !== title) ? (planLabel + ' · ' + title) : title;
  }

  /* The batch loop: walk the plan in slices, ONE request per slice, commit each slice's pages before
     the next request. Naturally paced by each fetch resolving. Cancel is checked before each slice; a
     failed slice is skipped (never drops earlier slices). */
  function _bbRunBatches(sys, brief) {
    var run = state.aiRun;
    function next(pageI, labelI) {
      if (!state.aiRun || run.cancelled) return _bbFinishRun('cancelled');
      if (pageI >= run.pages.length) return _bbFinishRun('done');
      if (labelI >= run.labels.length) return next(pageI + 1, 0);
      var pr = run.pages[pageI];
      var end = Math.min(labelI + run.batchSize, run.labels.length);
      var slice = run.labels.slice(labelI, end);
      var user = 'This request comes from the Bulk Builder (BATCH pass). Produce the FULL field content for EXACTLY these outputs, in this order (one row per label): ' + JSON.stringify(slice) + '. Each row maps the design field names to values; base any translation/transform on each field CURRENT value; omit image fields you have no real URL for.\n' + pr.fieldLines + '\n\nInstruction: ' + brief + '\n\nReturn ONLY a JSON array of ' + slice.length + ' row objects, in the same order as the labels.';
      _bbChat(sys, user).then(function (out) {
        if (!state.aiRun || run.cancelled) return _bbFinishRun('cancelled');
        var rows = _bbParseRows(out) || [];
        run.done += _bbAppendBatch(rows, slice, pr);
        run.note = run.done + ' / ' + run.total + ' pages';
        renderModal();
        setTimeout(function () { next(pageI, end); }, 0);
      })['catch'](function () {
        if (!state.aiRun || run.cancelled) return _bbFinishRun('cancelled');
        run.errored += slice.length;
        run.note = 'A piece could not be fetched, continuing... (' + run.done + ' / ' + run.total + ')';
        renderModal();
        setTimeout(function () { next(pageI, end); }, 0);
      });
    }
    next(0, 0);
  }

  /* Fallback when the plan returns nothing: ONE request for all rows (the old single-shot behavior),
     then commit them in one batch. Never regress. */
  function _bbAiFallback(sys, brief) {
    var pr = (state.aiRun && state.aiRun.pages && state.aiRun.pages[0]) || null;
    if (!pr) { state.aiBusy = false; state.aiRun = null; state.aiError = 'No page to generate.'; renderModal(); return; }
    if (state.aiRun) { state.aiRun.note = 'Generating...'; state.aiRun.total = 0; }
    renderModal();
    var user = 'This request comes from the Bulk Builder (data-source: AI). Do EXACTLY what the whole-page instruction asks (variations, translate to languages, rewrite, etc.). Return ONLY a raw JSON array of row objects (one row = one output page), each mapping the design field names to values; base any translation/transform on each field CURRENT value; omit image fields you have no real URL for. Produce EXACTLY the count the instruction implies; if none, a sensible set (6 to 12).\n' + pr.fieldLines + '\n\nInstruction: ' + brief + '\n\nReturn ONLY the JSON array.';
    _bbChat(sys, user).then(function (out) {
      if (!state.aiRun || state.aiRun.cancelled) return _bbFinishRun('cancelled');
      var rows = _bbParseRows(out) || [];
      if (!rows.length) throw new Error('AI did not return in expected format (no JSON line).');
      var labels = rows.map(function () { return ''; });  // no plan labels; _bbAppendBatch names by title field
      state.aiRun.total = rows.length;
      state.aiRun.done = _bbAppendBatch(rows, labels, pr);
      _bbFinishRun('done');
    })['catch'](function (e) {
      state.aiBusy = false; state.aiRun = null;
      state.aiError = (e && e.message) ? e.message : 'AI error';
      renderModal();
    });
  }

  function _bbFinishRun(kind) {
    var run = state.aiRun;
    state.aiBusy = false;
    if (!run) { return; }
    var made = run.done, total = run.total;
    if (typeof _pgClearSelection === 'function') _pgClearSelection();
    if (typeof renderPageTabs === 'function') renderPageTabs();
    if (typeof switchPage === 'function' && made && run._firstNewIndex != null) switchPage(run._firstNewIndex);
    if (typeof _psEvictIfNeeded === 'function') _psEvictIfNeeded();
    state.aiRun = null;
    if (typeof showToast === 'function') {
      showToast(kind === 'cancelled' ? (made + ' / ' + total + ' generated (stopped)') : (made + ' page generated'));
    }
    closeModal();
  }

  /* AI generation, BATCHED + incremental + resilient (docs/bulk-builder-batch-plan.md). Plan pass (get
     the list + total) then a batch loop that commits each slice's pages to the canvas immediately, with
     a real percent + a Cancel that keeps everything already made. Deck/scene stay on the fallback. */
  function _bbAiGenerate() {
    var A = window.__ccAI;
    if (!A || typeof A._buildChatRequest !== 'function') { showError('AI not ready. Open the editor from your account and set up AI settings.'); return; }
    if (!bbHasKey(A, state.aiProvider)) { showError('Key not connected to the selected model\'s provider (Settings > AI).'); return; }
    var brief = String(state.aiBrief || '').trim();
    if (!brief) { showError('Write what to generate.'); return; }
    if (state.aiRun) return; // already running

    var pageRuns = _bbBuildPageRuns();
    if (!pageRuns.length) { showError('No page/field to generate.'); return; }

    // Insert after the active page; if currentPageIndex is stale/out of range, append at the end. Each
    // page-run mints its OWN group lazily on first commit (see _bbAppendBatch).
    var _actIdx = (typeof currentPageIndex === 'number' && pages[currentPageIndex]) ? currentPageIndex : (pages.length - 1);
    state.aiRun = {
      phase: 'plan', total: 0, done: 0, cancelled: false, errored: 0, batchSize: 15,
      note: 'Preparing plan...', labels: [], translate: false, pages: pageRuns,
      _firstNewIndex: null, insertAt: _actIdx + 1
    };
    state.aiBusy = true; state.aiError = '';
    renderModal();

    var sys = _bbAiSys();
    // Plan ONCE from the first page-run; the label set + translate flag apply across every selected page.
    _bbPlan(sys, brief, pageRuns[0].fieldLines).then(function (plan) {
      if (!state.aiRun || state.aiRun.cancelled) return _bbFinishRun('cancelled');
      if (!plan || !plan.labels || !plan.labels.length) return _bbAiFallback(sys, brief);
      state.aiRun.labels = plan.labels;
      state.aiRun.translate = !!plan.translate;
      state.aiRun.total = plan.labels.length * pageRuns.length;
      state.aiRun.phase = 'batch';
      state.aiRun.note = '0 / ' + state.aiRun.total + ' pages';
      renderModal();
      _bbRunBatches(sys, brief);
    })['catch'](function () {
      if (!state.aiRun || state.aiRun.cancelled) return _bbFinishRun('cancelled');
      _bbAiFallback(sys, brief);
    });
  }

  function openModal() {
    if (typeof CCBulk === 'undefined') { showError('Bulk engine not loaded yet.'); return; }
    var src = ensureSourceReady();
    if (!src) return;
    // Scene mode inventories the FRAME's serialized json (the live canvas holds every frame);
    // page/deck modes read the live canvas (= the template being shown).
    state.fields = src.sceneMode ? CCBulk.collectFieldsFromJson(src.frame.json) : CCBulk.collectFields();
    state._unitNoun = src.sceneMode ? 'frame' : (src.deckMode ? 'slide' : 'page');
    // No hard block when zero fields: the chooser shows a designed empty-state guiding the user to
    // assign a Design Field (right panel). Board / no-saved-content cases were already blocked above.
    // Snapshot the template (page, active slide, or selected frame) for the step-3 live preview (P1)
    var tpl = src.deckMode ? src.slide : (src.sceneMode ? src.frame : src.page);
    state._deckMode = src.deckMode;
    state._sceneMode = !!src.sceneMode;
    state._srcFrameId = src.sceneMode ? src.frame.id : '';
    state._srcX = src.sceneMode ? src.frame.x : 0;
    state._srcY = src.sceneMode ? src.frame.y : 0;
    state._srcJsonStr = JSON.stringify(tpl.json);
    state._srcBg = tpl.bg;
    state._srcW = tpl.w || (typeof CW !== 'undefined' ? CW : 1000);
    state._srcH = tpl.h || (typeof CH !== 'undefined' ? CH : 1000);
    // Multi-page (page mode only, Phase 4): collect every plain page that has design fields, so ONE
    // instruction can bulk across pages. Default focus + selection = the active page.
    state.aiPages = null; state.aiFocus = 0;
    if (!src.deckMode && !src.sceneMode && typeof pages !== 'undefined' && pages && pages.length > 1) {
      // Match the active page by IDENTITY (src.page), not currentPageIndex: the index can be stale/out
      // of range, but ensureSourceReady() already resolved the real active page object.
      var _activePage = src.page, _list = [], _activeListIdx = -1;
      for (var _pi = 0; _pi < pages.length; _pi++) {
        var _pg = pages[_pi];
        if (!_pg || _pg._isBoard || !_pg.json || _pg._productType === 'scene') continue;
        if (typeof pageHasSlideDeck === 'function' && pageHasSlideDeck(_pg)) continue;
        var _isActive = (_pg === _activePage);
        // Active page: reuse the LIVE canvas snapshot (state.fields / _srcJsonStr) so its tab is byte-for-byte
        // what single-page mode would generate; other pages read their stored json.
        var _flds;
        if (_isActive) { _flds = state.fields; }
        else { try { _flds = CCBulk.collectFieldsFromJson(_pg.json); } catch (e) { _flds = null; } }
        if (!_flds || !_flds.length) continue;
        var _w = _pg.w || (typeof CW !== 'undefined' ? CW : 1000), _h = _pg.h || (typeof CH !== 'undefined' ? CH : 1000);
        if (_isActive) _activeListIdx = _list.length;
        _list.push({
          idx: _pi, label: (_pg.label || ('Page ' + (_pi + 1))), fields: _flds,
          srcJsonStr: _isActive ? state._srcJsonStr : JSON.stringify(_pg.json), srcBg: _pg.bg, srcW: _w, srcH: _h,
          sourcePage: { bg: _pg.bg, w: _w, h: _h, _productType: _pg._productType, _pageDesignNote: _pg._pageDesignNote },
          selected: _isActive
        });
      }
      if (_list.length > 1) {
        // If the active page had no fields (not in the list), default focus + selection to the first entry
        // so the user never opens onto an empty, all-unselected state.
        if (_activeListIdx < 0) { _activeListIdx = 0; _list[0].selected = true; }
        state.aiPages = _list;
        state.aiFocus = _activeListIdx;
      }
    }
    state.step = 1;
    state.fileName = '';
    state.headers = [];
    state.rows = [];
    state.mapping = {};
    state.fileUploads = {};
    state.groupName = getDefaultGroupName();
    state.labelColumn = '';
    state.openDropdown = '';
    state.creating = false;
    state.progress = 0;
    state.total = 0;
    state.mode = '';
    ppResetState();       // products picker: filter, selection and any in-flight fetch
    state.imageSizes = {}; state.measureTotal = 0; state.measureDone = 0;
    state._hasClip = null; state._pvMeasured = false;
    state.aiBrief = '';
    state.aiFieldNotes = {};
    state._aiPreviewUrl = '';
    state.aiRun = null;
    // Seed the model to a CURRENT chat model (BB_CHAT_CATALOG): the active provider's current model if
    // the active one is still current, else that provider's catalog default, else the first catalog
    // entry. Keys load async below; we then re-seed to a KEYED provider so the default is usable.
    var _A = window.__ccAI;
    var _ap = (_A && _A._aiState && _A._aiState.provider) || '';
    var _am = (_A && typeof _A._getModelName === 'function') ? _A._getModelName() : '';
    var _ce = bbCatEntry(_ap);
    if (_ce && _ce.models.indexOf(_am) !== -1) { state.aiProvider = _ap; state.aiModel = _am; }
    else if (_ce) { state.aiProvider = _ap; state.aiModel = _ce.models[0]; }
    else { state.aiProvider = BB_CHAT_CATALOG[0].provider; state.aiModel = BB_CHAT_CATALOG[0].models[0]; }
    state.aiPickerOpen = false;
    state.aiBusy = false;
    state.aiError = '';
    if (_A && typeof _A._loadServerKeys === 'function') {
      try {
        var _kp = _A._loadServerKeys();
        if (_kp && _kp.then) _kp.then(function () {
          if (!bbHasKey(_A, state.aiProvider)) {
            var _k = BB_CHAT_CATALOG.filter(function (e) { return bbHasKey(_A, e.provider); })[0];
            if (_k) { state.aiProvider = _k.provider; state.aiModel = _k.models[0]; }
          }
          var _mo = document.getElementById(MODAL_ID);
          if (_mo && _mo.classList.contains('show') && state.mode === 'ai') renderModal();
        });
      } catch (e) {}
    }
    var _m = ensureModal();
    var _panel = _m.querySelector('.bulk-builder-panel');
    _m.classList.add('show');
    renderModal();   // fill first so the panel has its real (content) height before centring
    if (window.VEFloat && VEFloat.persistResize && _panel && !_panel._bbResizeBound) { VEFloat.persistResize(_panel, 'bulkBuilder'); _panel._bbResizeBound = true; }
    if (!(window.VEFloat && VEFloat.restorePos && _panel && VEFloat.restorePos(_panel, 'bulkBuilder'))) bbCenter(_panel);
    closeGearMenu();
  }

  function injectGearItem() {
    var gearDrop = document.getElementById('gear-dropdown');
    if (!gearDrop || gearDrop.querySelector('[data-bulk-builder-btn]')) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gear-item';
    btn.setAttribute('data-bulk-builder-btn', '1');
    btn.innerHTML = lucideIcon('file-stack', 15) + '<span>Bulk Builder</span>';
    btn.addEventListener('click', openModal);

    var bulkExportBtn = gearDrop.querySelector('[data-bulk-export-btn]');
    var sep = document.createElement('div');
    sep.className = 'gear-sep';
    if (bulkExportBtn) {
      gearDrop.insertBefore(sep, bulkExportBtn);
      gearDrop.insertBefore(btn, bulkExportBtn);
    } else {
      gearDrop.appendChild(sep);
      gearDrop.appendChild(btn);
    }
  }

  function init() {
    injectGearItem();
    var root = ensureModal();
    var panel = root.querySelector('.bulk-builder-panel');
    if (panel && !panel._bbCloseDropsBound) {
      panel._bbCloseDropsBound = true;
      panel.addEventListener('click', function (e) {
        if (e.target && e.target.closest('[data-bb-drop]')) return;
        if (state.openDropdown) closeDropdowns();
      });
    }
  }

  window.openBulkBuilder = openModal;

  if (window.cc && cc.modules && cc.modules.register) {
    cc.modules.register({ id: 'shared.bulk-builder', parent: 'shared' });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
