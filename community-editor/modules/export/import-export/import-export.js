/* ===== Card Import / Export (.dika files; .cardcraft is the pre-rename name and still reads) ===== */

/* Derive from the live CUSTOM_PROPS (single source of truth) so the two can't drift.
   The literal below is only a last-resort fallback if CUSTOM_PROPS isn't loaded yet. */
var DIKA_CUSTOM_PROPS = (typeof CUSTOM_PROPS !== 'undefined' && CUSTOM_PROPS) ? CUSTOM_PROPS : ['selectable', 'evented', 'id', 'qrUrl', 'qrFg', 'qrBg', 'isQR', '_ccType', '_barcodeType', '_barcodeValue', '_barcodeHumanReadable', '_barcodeSource', '_barcodeRowIndex', '_barcodeLineColor', '_barcodeBackgroundColor', '_iconName', '_imageName', '_fieldRole', '_dfField', '_dfNote', '_isStickyNote', '_isStickyBg', '_isStickyText', '_stickyBgId', '_stickyId', '_isBoardLine', 'arrow', 'curved', 'wbS', 'wbC', 'wbE', 'bindStart', 'bindEnd', '_wbName', '_wbLink', '_groupName', '_isWireframe', '_wfType', '_wfCustomCss', '_wfBrandLogo', '_isPattern', '_patternId', '_patternColor'];

function exportCardFile() {
  // Page-sleep: a project file leaves the browser; slept pages must ship full json.
  if (typeof CCPageSleep !== 'undefined' && CCPageSleep.hasSlept() && !CCPageSleep._exportingCard) {
    CCPageSleep._exportingCard = true;
    CCPageSleep.prefetchForSave(function () {
      try { exportCardFile(); } finally { CCPageSleep._exportingCard = false; CCPageSleep.releaseSaveMap(); }
    });
    return;
  }
  if (typeof saveCurrentPage === 'function') saveCurrentPage();

  var pagesData = [];
  if (typeof pages !== 'undefined' && Array.isArray(pages)) {
    pagesData = pages.map(function (p) {
      // ONE lossless page serializer: `pageToPayload` (autosave.js:126), the same one exportProject
      // uses (export-manager/service/service.js:1226). The literal that used to be here was a 6-key
      // whitelist, so a project file shipped ONLY {json,bg,label,w,h,_isBoard}: `_productType`,
      // `_videoProject`, `_slideDeck`, `_scene`, `_isWfBoard`, `_pageId` and `groupId` were dropped at
      // WRITE time. Re-importing then rebuilt every page as a plain single/classic page - video, slide
      // deck, infinite scene and web-page modes all gone. The READER (loadV2CardData) had already been
      // fixed to carry those fields; the writer never wrote them, so the round-trip stayed lossy.
      // (Page-sleep: pageToPayload reads the parked json via _psJsonForSave; the prefetch above ran.)
      if (typeof pageToPayload === 'function') return pageToPayload(p);
      var _pj = (typeof _psJsonForSave === 'function') ? _psJsonForSave(p) : p.json;
      return {
        json: _pj, bg: p.bg, label: p.label, w: p.w, h: p.h,
        _isBoard: p._isBoard, _isWfBoard: p._isWfBoard,
        _pageId: p._pageId || null, groupId: p.groupId || null,
        _productType: p._productType || null,
        _pageDesignNote: p._pageDesignNote || '',
        _bbRowKey: p._bbRowKey || null,
        _slideDeck: p._slideDeck || null,
        _videoProject: p._videoProject || null,
        _scene: p._scene || null
      };
    });
  } else {
    if (typeof currentFace === 'string' && currentFace === 'front') {
      frontJSON = canvas.toJSON(DIKA_CUSTOM_PROPS);
      frontBG = canvas.backgroundColor;
    } else {
      backJSON = canvas.toJSON(DIKA_CUSTOM_PROPS);
      backBG = canvas.backgroundColor;
    }
    pagesData = [{ json: frontJSON || canvas.toJSON(DIKA_CUSTOM_PROPS), bg: frontBG, label: 'Front' }];
    if (typeof dualSideEnabled !== 'undefined' && dualSideEnabled) {
      pagesData.push({ json: backJSON, bg: backBG, label: 'Back' });
    }
  }

  var data = {
    version: 2,
    app: 'dika studio',
    timestamp: Date.now(),
    activeProduct: typeof activeProduct !== 'undefined' ? activeProduct : 'card',
    pages: pagesData,
    pageGroups: typeof pageGroups !== 'undefined' ? pageGroups : [],
    CW: typeof CW !== 'undefined' ? CW : 700,
    CH: typeof CH !== 'undefined' ? CH : 400,
    userInfo: Object.assign({}, userInfo),
    settings: {
      orientation: wizSettings.orientation,
      corners: wizSettings.corners,
      sides: wizSettings.sides,
      canvasWidth: CW,
      canvasHeight: CH
    },
    template: selectedTpl
  };

  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  var safeName = (userInfo.company || userInfo.name || 'card').replace(/\s+/g, '-').toLowerCase();
  a.download = 'dika-' + safeName + '-' + Date.now() +
    ((window.CCEdition && CCEdition.formats && CCEdition.formats.project) || '.dika');
  a.href = url;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast('Card exported successfully!');
}

function importCardFile() {
  var MAX_LEGACY_IMPORT_BYTES = 32 * 1024 * 1024;
  var input = document.createElement('input');
  input.type = 'file';
  /* Every extension this app has ever written, so a file made before the rename still opens. */
  input.accept = (window.CCEdition && CCEdition.formats && CCEdition.formats.accept) ||
    '.dika,.dikapack,.cardcraft,.ccproj,.json';
  input.style.display = 'none';

  input.onchange = function (e) {
    var file = e.target.files[0];
    if (!file) return;

    // Use Export Manager's importProject if available (handles both ZIP and JSON)
    if (typeof window._exportManagerImport === 'function') {
      window._exportManagerImport(file).then(function (res) {
        showToast('Card imported successfully!');
      }).catch(function (err) {
        showToast('Failed to import: ' + (err.message || err), 'error');
      });
      return;
    }

    // Legacy fallback is JSON-only and bounded. ZIP packages belong to the streaming importer;
    // JSZip would materialize compressed and expanded archive bytes in memory.
    if (file.size > MAX_LEGACY_IMPORT_BYTES) {
      showToast('Import too large for legacy mode. Use the project importer.', 'error');
      return;
    }

    // Fallback: try ZIP first, then JSON
    var reader = new FileReader();
    reader.onload = function (ev) {
      var buf = ev.target.result;
      var arr = new Uint8Array(buf);
      var isZip = arr.length >= 2 && arr[0] === 0x50 && arr[1] === 0x4B; // 'PK'

      if (isZip) { showToast('ZIP import requires the streaming project importer.', 'error'); return; }
      if (false) {
        Promise.resolve(null).then(function (zip) {
          if (zip) {
            // v3/v4 ZIP package — delegate to the lossless project importer (part-aware pages: scene /
            // slide deck / video / board preserved, + tags). Replaces the old dead _restoreProjectFromImport
            // path that parsed the zip and then silently did nothing.
            if (typeof window._exportManagerImport === 'function') {
              return window._exportManagerImport(file).then(function () { showToast('Project imported'); });
            }
            _tryJsonImport(buf);
            return;
          }
          // Not a recognized ZIP — try as JSON
          _tryJsonImport(buf);
        }).catch(function () {
          _tryJsonImport(buf);
        });
      }
      _tryJsonImport(buf);
    };
    reader.onerror = function () { showToast('Failed to read file', 'error'); };
    file.slice(0, 4).arrayBuffer().then(function(signature) {
      var sig = new Uint8Array(signature);
      if (sig.length >= 2 && sig[0] === 0x50 && sig[1] === 0x4B) {
        showToast('ZIP import requires the streaming project importer.', 'error');
        return;
      }
      reader.readAsArrayBuffer(file);
    }).catch(function() { showToast('Failed to inspect file', 'error'); });
  };

  function _tryJsonImport(buf) {
    try {
      var text = new TextDecoder().decode(buf);
      var data = JSON.parse(text);
      if (data.app !== 'dika studio' && !data.manifest && !data.pages) {
        showToast('Invalid dika studio file', 'error');
        return;
      }
      loadCardData(data);
      showToast('Card imported successfully!');
    } catch (err) {
      showToast('Failed to import: ' + err.message, 'error');
    }
  }

  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
}

function loadCardData(data) {
  if (data.version === 2 && data.pages) {
    loadV2CardData(data);
  } else {
    loadLegacyCardData(data);
  }
}

function loadV2CardData(data) {
  var product = data.activeProduct || 'card';
  if (typeof setProductType === 'function') {
    setProductType(product);
  } else if (typeof activeProduct !== 'undefined') {
    activeProduct = product;
  }

  if (data.CW) CW = data.CW;
  if (data.CH) CH = data.CH;
  if (canvas) {
    canvas.setWidth(CW);
    canvas.setHeight(CH);
  }

  if (data.settings) {
    if (data.settings.orientation) wizSettings.orientation = data.settings.orientation;
    if (data.settings.corners) wizSettings.corners = data.settings.corners;
    if (data.settings.sides) wizSettings.sides = data.settings.sides;
    if (typeof setCardCorners === 'function' && wizSettings.corners) {
      setCardCorners(wizSettings.corners);
    }
  }

  if (data.userInfo) {
    Object.assign(userInfo, data.userInfo);
    syncUserInfoUI();
  }

  if (data.template) selectedTpl = data.template;

  if (typeof pages !== 'undefined' && Array.isArray(data.pages)) {
    var fbW = data.CW != null ? data.CW : typeof CW !== 'undefined' ? CW : 700;
    var fbH = data.CH != null ? data.CH : typeof CH !== 'undefined' ? CH : 400;
    pages.length = 0;
    data.pages.forEach(function (p) {
      // ONE page restorer: `normalizeRestoredPage` (autosave.js:158), the same one the export-manager
      // restore uses (service.js:1466). The hand-rolled whitelist that used to live here dropped every
      // page-kind field on load, and its later CARRY patch still missed `_isWfBoard` (web-page mode)
      // and the page-sleep markers. Mirroring the writer with the shared restorer is what keeps the
      // round-trip lossless; `_previewRev` is a thumbnail-cache counter the shared restorer does not
      // model, so it is carried on top rather than silently reset.
      var page = (typeof normalizeRestoredPage === 'function')
        ? normalizeRestoredPage(p, { CW: fbW, CH: fbH })
        : {
          json: p.json,
          bg: p.bg,
          label: p.label || 'Page',
          w: p.w != null ? p.w : fbW,
          h: p.h != null ? p.h : fbH,
          _isBoard: p._isBoard,
          _isWfBoard: p._isWfBoard,
          _pageId: p._pageId || null,
          groupId: p.groupId || null,
          _productType: p._productType || null,
          _pageDesignNote: p._pageDesignNote || '',
          _bbRowKey: p._bbRowKey || null,
          _slideDeck: p._slideDeck || null,
          _videoProject: p._videoProject || null,
          _scene: p._scene || null,
        };
      if (p._previewRev !== undefined) page._previewRev = p._previewRev;
      pages.push(page);
    });
  }

  // Restore page groups
  if (Array.isArray(data.pageGroups) && typeof pageGroups !== 'undefined') {
    pageGroups.length = 0;
    data.pageGroups.forEach(function (g) { pageGroups.push(g); });
  }

  if (typeof renderPageTabs === 'function') renderPageTabs();
  currentPageIndex = -1;
  if (typeof switchPage === 'function') switchPage(0, true);

  if (typeof applyView === 'function') applyView();
  if (typeof updateSizeBadge === 'function') updateSizeBadge();
}

function loadLegacyCardData(data) {
  if (data.settings) {
    wizSettings.orientation = data.settings.orientation || 'horizontal';
    wizSettings.corners = data.settings.corners || 'sharp';
    wizSettings.sides = data.settings.sides || 'double';

    CW = data.settings.canvasWidth || 700;
    CH = data.settings.canvasHeight || 400;
    canvas.setWidth(CW);
    canvas.setHeight(CH);

    dualSideEnabled = data.settings.dualSide !== false;

    if (typeof setCardCorners === 'function') setCardCorners(wizSettings.corners);

    var orientH = document.getElementById('orient-h');
    var orientV = document.getElementById('orient-v');
    if (orientH) orientH.classList.toggle('active', wizSettings.orientation === 'horizontal');
    if (orientV) orientV.classList.toggle('active', wizSettings.orientation === 'vertical');

    var faceTabsBar = document.getElementById('face-tabs-bar');
    if (faceTabsBar) faceTabsBar.style.display = dualSideEnabled ? '' : 'none';
  }

  if (data.userInfo) {
    Object.assign(userInfo, data.userInfo);
    syncUserInfoUI();
  }

  if (data.template) selectedTpl = data.template;

  // Convert old front/back to pages array when multi-page system is available
  if (typeof pages !== 'undefined') {
    var converted = [];
    if (data.front) {
      converted.push({ json: data.front.json, bg: data.front.background || '#0d0d0d', label: 'Front' });
    }
    if (data.back) {
      converted.push({ json: data.back.json, bg: data.back.background || '#1a1a2e', label: 'Back' });
    }
    if (converted.length) {
      pages.length = 0;
      converted.forEach(function (p) { pages.push(p); });
      if (typeof setProductType === 'function') setProductType('card');
      if (typeof renderPageTabs === 'function') renderPageTabs();
      if (typeof switchPage === 'function') switchPage(0);
      if (typeof applyView === 'function') applyView();
      if (typeof updateSizeBadge === 'function') updateSizeBadge();
      return;
    }
  }

  // Fallback: load directly onto canvas (pre-pages code path)
  if (data.front) {
    frontBG = data.front.background || '#0d0d0d';
    frontJSON = data.front.json;

    if (currentFace === 'front' && frontJSON) {
      canvas.loadFromJSON(frontJSON, function () {
        canvas.backgroundColor = frontBG;
        canvas.getObjects().forEach(function (obj) {
          if (obj.qrUrl || obj.isQR) obj.isQR = true;
        });
        canvas.renderAll();
        if (typeof snap === 'function') snap();
        if (typeof refreshStructure === 'function') refreshStructure();
      });
    }
  }

  if (data.back) {
    backBG = data.back.background || '#1a1a2e';
    backJSON = data.back.json;
  }

  if (typeof applyView === 'function') applyView();
  if (typeof updateSizeBadge === 'function') updateSizeBadge();
}

function syncUserInfoUI() {
  var fields = ['name', 'title', 'company', 'email', 'phone', 'website'];
  fields.forEach(function (field) {
    var el = document.getElementById('info-' + field) || document.getElementById(field);
    if (el && userInfo[field] !== undefined) el.value = userInfo[field];
  });
}

/* ===== Toast Notification ===== */

function showToast(message, type) {
  type = type || 'success';

  var toast = document.getElementById('toast-notification');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-notification';
    toast.style.cssText =
      'position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);' +
      'background:var(--surface, #1a1a2e);border:1px solid var(--border2, #333);color:var(--text, #fff);' +
      'padding:12px 24px;border-radius:10px;font-size:13px;font-family:"DM Sans",sans-serif;' +
      'font-weight:600;z-index:2000;opacity:0;transition:all 0.3s ease;' +
      'box-shadow:0 8px 32px rgba(0,0,0,0.5);display:flex;align-items:center;gap:8px;' +
      'pointer-events:none;';
    document.body.appendChild(toast);
  }

  var iconColor = type === 'error' ? 'var(--red, #e74c3c)' : 'var(--gold, #f1c40f)';
  var icon = type === 'error' ? getIcon('close', 16) : getIcon('check', 16);
  toast.innerHTML = '<span style="color:' + iconColor + ';display:flex">' + icon + '</span>' + message;

  toast.style.opacity = '1';
  toast.style.transform = 'translateX(-50%) translateY(0)';
  toast.style.pointerEvents = 'auto';

  clearTimeout(toast._timer);
  toast._timer = setTimeout(function () {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    toast.style.pointerEvents = 'none';
  }, 3000);
}

/* ===== Gear Menu ===== */

function initGearMenu() {
  var gearBtn = document.getElementById('gear-btn');
  var gearDrop = document.getElementById('gear-dropdown');
  if (!gearBtn || !gearDrop) return;

  gearBtn.onclick = function (e) {
    e.stopPropagation();
    gearDrop.classList.toggle('show');
  };

  document.addEventListener('click', function (e) {
    if (gearDrop && !gearDrop.contains(e.target) && e.target !== gearBtn) {
      gearDrop.classList.remove('show');
    }
  });
}

// resetWizard() DELETED (Faz 8): drove the retired business-card startup wizard (gear "Reset Wizard"
// button also removed). It also reset the canvas to a blank custom 1000×1000 — if a clean "New
// document" action is wanted, add it explicitly rather than reviving the wizard.

function newBlankCanvas() {
  var gearDrop = document.getElementById('gear-dropdown');
  if (gearDrop) gearDrop.classList.remove('show');

  function doNew() {
    // Clear autosave so it won't re-load on next refresh
    try { localStorage.removeItem('dika_autosave'); } catch (e) {}
    try { localStorage.removeItem('dika-autosave'); } catch (e) {}

    // Reset pages to blank
    if (typeof initPages === 'function') {
      initPages();
    }
    if (typeof canvas !== 'undefined' && canvas) {
      canvas.clear();
      canvas.setBackgroundColor('#0d0d0d', function () { canvas.renderAll(); });
    }
    if (typeof applyView === 'function') applyView();
    if (typeof refreshStructure === 'function') refreshStructure();
    if (typeof showToast === 'function') showToast('New blank canvas');
  }

  if (typeof showCustomConfirm === 'function') {
    showCustomConfirm('Start a new blank canvas? Your current design will be lost unless saved.', doNew);
  } else {
    if (confirm('Start a new blank canvas?')) doNew();
  }
}

// Modular skeleton hook (Faz 8) — import-export is now an export loader module (modules/export/).
if (window.cc && cc.modules) cc.modules.register({ id: 'import-export', parent: 'export', title: 'Import / export', mount: function () {}, unmount: function () {} });
