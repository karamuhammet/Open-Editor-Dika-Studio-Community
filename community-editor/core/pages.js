/* ============================================================
   dika studio – pages.js  (Multi-Page System)
   Replaces the old front/back face system with N-page support.
   Loaded AFTER app.js — references canvas, CUSTOM_PROPS, etc.
   ============================================================ */

var pages = [];
var currentPageIndex = 0;

/* ── Page Group System ─────────────────────────────────────────── */
var pageGroups = [];           // Array of group objects
var selectedPageIds = [];      // Multi-selection state
var _pgNextGroupId = 1;
var _pgLastRangeAnchor = -1;  // For Shift+click range selection

function _pgEnsurePageId(page) {
  if (!page._pageId) page._pageId = 'pg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
  return page._pageId;
}

function _pgCreateGroup(name, color) {
  var g = {
    id: 'grp-' + (_pgNextGroupId++),
    name: name || 'Group ' + (_pgNextGroupId - 1),
    color: color || _pgGroupColors[(_pgNextGroupId - 2) % _pgGroupColors.length],
    order: pageGroups.length,
    collapsed: false,
    lastOpenedPageId: null,
    _savedViewport: null,
    _savedZoom: null
  };
  pageGroups.push(g);
  return g;
}

var _pgGroupColors = ['#f2ff58', '#e05252', '#e0a852', '#52e0a8', '#5290e0', '#a852e0', '#52e0e0', '#e0e052'];

function _pgFindGroup(groupId) {
  for (var i = 0; i < pageGroups.length; i++) {
    if (pageGroups[i].id === groupId) return pageGroups[i];
  }
  return null;
}

function _pgPagesInGroup(groupId) {
  var result = [];
  for (var i = 0; i < pages.length; i++) {
    if (pages[i].groupId === groupId) result.push(i);
  }
  return result;
}

function _pgUngroupedPages() {
  var result = [];
  for (var i = 0; i < pages.length; i++) {
    if (!pages[i].groupId) result.push(i);
  }
  return result;
}

/* ── Group switch: remember the outgoing group's viewport ──────── */
function _pgOnGroupSwitch(fromGroupId, toGroupId) {
  if (fromGroupId && fromGroupId !== toGroupId) {
    // Save viewport context so returning to the group can restore it.
    var fg = _pgFindGroup(fromGroupId);
    if (fg) {
      fg._savedViewport = canvas.viewportTransform ? canvas.viewportTransform.slice() : null;
      fg._savedZoom = canvas.getZoom();
    }
  }
}

/* ── Multi-Selection helpers ───────────────────────────────────── */
function _pgToggleSelect(pageIdx) {
  var pid = _pgEnsurePageId(pages[pageIdx]);
  var i = selectedPageIds.indexOf(pid);
  if (i >= 0) selectedPageIds.splice(i, 1);
  else selectedPageIds.push(pid);
  _pgLastRangeAnchor = pageIdx;
  renderPageTabs();
}

function _pgRangeSelect(pageIdx) {
  if (_pgLastRangeAnchor < 0) _pgLastRangeAnchor = currentPageIndex;
  var lo = Math.min(_pgLastRangeAnchor, pageIdx);
  var hi = Math.max(_pgLastRangeAnchor, pageIdx);
  selectedPageIds = [];
  for (var i = lo; i <= hi; i++) {
    selectedPageIds.push(_pgEnsurePageId(pages[i]));
  }
  renderPageTabs();
}

function _pgClearSelection() {
  selectedPageIds = [];
  _pgLastRangeAnchor = -1;
}

function _pgIsSelected(pageIdx) {
  if (!pages[pageIdx]) return false;
  return selectedPageIds.indexOf(pages[pageIdx]._pageId) >= 0;
}

function _pgSelectedIndices() {
  var result = [];
  for (var i = 0; i < pages.length; i++) {
    if (pages[i]._pageId && selectedPageIds.indexOf(pages[i]._pageId) >= 0) result.push(i);
  }
  return result;
}

/* ── Hover preview (lazy, single popover, on-demand render) ───────────── */
var _pgTabPreview = {
  showDelayMs: 140,
  hideDelayMs: 70,
  frameW: 151,
  frameH: 92,
  cacheLimit: 12,
  requestId: 0,
  showTimer: 0,
  hideTimer: 0,
  anchorEl: null,
  pageIdx: -1,
  root: null,
  stage: null,
  img: null,
  labelEl: null,
  metaEl: null,
  cache: {},
  cacheOrder: []
};

function _pgEnsurePreviewRev(page) {
  if (!page) return 0;
  if (typeof page._previewRev !== 'number') page._previewRev = 0;
  return page._previewRev;
}

function _pgTouchPagePreview(page) {
  if (!page) return;
  page._previewRev = _pgEnsurePreviewRev(page) + 1;
}

function _pgPreviewCacheKey(page) {
  if (!page) return '';
  _pgEnsurePageId(page);
  return page._pageId + ':' + _pgEnsurePreviewRev(page);
}

function _pgGetCachedPreview(cacheKey) {
  var entry = _pgTabPreview.cache[cacheKey];
  if (!entry) return null;
  var idx = _pgTabPreview.cacheOrder.indexOf(cacheKey);
  if (idx >= 0) {
    _pgTabPreview.cacheOrder.splice(idx, 1);
    _pgTabPreview.cacheOrder.push(cacheKey);
  }
  return entry;
}

function _pgSetCachedPreview(cacheKey, entry) {
  if (!cacheKey || !entry) return;
  _pgTabPreview.cache[cacheKey] = entry;
  var idx = _pgTabPreview.cacheOrder.indexOf(cacheKey);
  if (idx >= 0) _pgTabPreview.cacheOrder.splice(idx, 1);
  _pgTabPreview.cacheOrder.push(cacheKey);
  while (_pgTabPreview.cacheOrder.length > _pgTabPreview.cacheLimit) {
    var oldestKey = _pgTabPreview.cacheOrder.shift();
    delete _pgTabPreview.cache[oldestKey];
  }
}

function _pgEnsureTabPreviewUi() {
  if (_pgTabPreview.root) return _pgTabPreview.root;

  var root = document.createElement('div');
  root.id = 'pg-tab-preview-popover';
  root.className = 'pg-tab-preview-popover';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML =
    '<div class="pg-tab-preview-stage">' +
      '<img class="pg-tab-preview-img" alt="" draggable="false">' +
    '</div>' +
    '<div class="pg-tab-preview-caption">' +
      '<div class="pg-tab-preview-label"></div>' +
      '<div class="pg-tab-preview-meta"></div>' +
    '</div>';

  document.body.appendChild(root);

  _pgTabPreview.root = root;
  _pgTabPreview.stage = root.querySelector('.pg-tab-preview-stage');
  _pgTabPreview.img = root.querySelector('.pg-tab-preview-img');
  _pgTabPreview.labelEl = root.querySelector('.pg-tab-preview-label');
  _pgTabPreview.metaEl = root.querySelector('.pg-tab-preview-meta');

  window.addEventListener('resize', function () {
    if (_pgTabPreview.root && _pgTabPreview.root.classList.contains('is-visible')) _pgHideTabPreview(true);
  });
  document.addEventListener('scroll', function () {
    if (_pgTabPreview.root && _pgTabPreview.root.classList.contains('is-visible')) _pgPositionTabPreview();
  }, true);

  return root;
}

function _pgFindPreviewTab(node) {
  while (node && node !== document.body) {
    if (node.classList && node.classList.contains('page-tab') && node.getAttribute('data-page-idx') != null) return node;
    node = node.parentNode;
  }
  return null;
}

function _pgPreviewMetrics(pageW, pageH) {
  var safeW = Math.max(1, parseInt(pageW, 10) || 1);
  var safeH = Math.max(1, parseInt(pageH, 10) || 1);
  var frameW = _pgTabPreview.frameW;
  var frameH = _pgTabPreview.frameH;
  var scale = Math.min(frameW / safeW, frameH / safeH);
  if (!isFinite(scale) || scale <= 0) scale = 1;
  var drawW = Math.max(1, Math.round(safeW * scale));
  var drawH = Math.max(1, Math.round(safeH * scale));
  return {
    frameW: frameW,
    frameH: frameH,
    pageW: safeW,
    pageH: safeH,
    scale: scale,
    offsetX: Math.floor((frameW - drawW) / 2),
    offsetY: Math.floor((frameH - drawH) / 2)
  };
}

function _pgRenderEmptyPreview(pageBg, metrics) {
  var fallback = document.createElement('canvas');
  var ctx = fallback.getContext('2d');
  fallback.width = metrics.frameW;
  fallback.height = metrics.frameH;
  ctx.fillStyle = pageBg || '#ffffff';
  ctx.fillRect(0, 0, fallback.width, fallback.height);
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.strokeRect(0.5, 0.5, fallback.width - 1, fallback.height - 1);
  return fallback.toDataURL('image/png');
}

function _pgRenderPreviewData(pageData, pageBg, metrics, callback) {
  if (!pageData || typeof fabric === 'undefined' || !fabric || !fabric.StaticCanvas) {
    callback(_pgRenderEmptyPreview(pageBg, metrics));
    return;
  }

  var tmpCanvas = new fabric.StaticCanvas(null, {
    width: metrics.frameW,
    height: metrics.frameH,
    enableRetinaScaling: false,
    renderOnAddRemove: false
  });

  tmpCanvas.loadFromJSON(pageData, function () {
    tmpCanvas.setViewportTransform([metrics.scale, 0, 0, metrics.scale, metrics.offsetX, metrics.offsetY]);
    tmpCanvas.setBackgroundColor(pageBg || '#ffffff', function () {
      var dataUrl = '';
      try {
        tmpCanvas.renderAll();
        dataUrl = tmpCanvas.lowerCanvasEl.toDataURL('image/png');
      } catch (err) {
        dataUrl = _pgRenderEmptyPreview(pageBg, metrics);
      }
      tmpCanvas.dispose();
      callback(dataUrl);
    });
  });
}

function _pgRenderTabPreview(idx, callback) {
  var page = pages[idx];
  if (!page) {
    callback(null);
    return;
  }
  // Page-sleep: hydrate a slept page before rendering its hover preview (LRU re-evicts later).
  if (page._slept && typeof _psHydratePage === 'function') {
    _psHydratePage(idx, function () { _pgRenderTabPreview(idx, callback); });
    return;
  }

  var previewSource = (typeof getPagePreviewSource === 'function') ? getPagePreviewSource(page, idx) : null;
  var pageW = (previewSource && previewSource.w) || page.w || CW;
  var pageH = (previewSource && previewSource.h) || page.h || CH;
  var metrics = _pgPreviewMetrics(pageW, pageH);
  var pageBg = (previewSource && previewSource.bg) || page.bg || '#ffffff';
  // Page-sleep: a slept page's json is parked; _psJsonForSave returns it sync (no-op when off).
  var pageData = previewSource ? previewSource.json : ((typeof _psJsonForSave === 'function') ? _psJsonForSave(page) : page.json);
  var cacheKey = '';

  if (idx === currentPageIndex && typeof canvas !== 'undefined' && canvas) {
    pageData = canvas.toJSON(CUSTOM_PROPS);
    pageBg = canvas.backgroundColor || pageBg;
  } else {
    cacheKey = _pgPreviewCacheKey(page);
    var cached = _pgGetCachedPreview(cacheKey);
    if (cached) {
      callback(cached);
      return;
    }
  }

  _pgRenderPreviewData(pageData, pageBg, metrics, function (dataUrl) {
    var entry = {
      src: dataUrl || _pgRenderEmptyPreview(pageBg, metrics),
      bg: pageBg || '#ffffff'
    };
    if (cacheKey) _pgSetCachedPreview(cacheKey, entry);
    callback(entry);
  });
}

function _pgPreviewMeta(page) {
  if (!page) return '';
  var parts = [(page.w || CW) + ' × ' + (page.h || CH)];
  if (page._isBoard) parts.push('Board');
  else if (page._isWfBoard) parts.push('Web Page');
  else if (typeof pageHasSlideDeck === 'function' && pageHasSlideDeck(page)) parts.push('Slide Deck');
  if (page.groupId) {
    var group = _pgFindGroup(page.groupId);
    if (group && group.name) parts.push(group.name);
  }
  return parts.join(' • ');
}

function _pgPositionTabPreview() {
  if (!_pgTabPreview.root || !_pgTabPreview.anchorEl) return;
  if (!document.body.contains(_pgTabPreview.anchorEl)) {
    _pgHideTabPreview(true);
    return;
  }

  var rect = _pgTabPreview.anchorEl.getBoundingClientRect();
  var root = _pgTabPreview.root;
  var width = root.offsetWidth || 248;
  var height = root.offsetHeight || 188;
  var left = rect.left + (rect.width / 2) - (width / 2);
  var top = rect.top - height - 12;
  var pad = 10;

  left = Math.max(pad, Math.min(left, window.innerWidth - width - pad));
  if (top < pad) top = rect.bottom + 12;
  top = Math.max(pad, Math.min(top, window.innerHeight - height - pad));

  root.style.left = Math.round(left) + 'px';
  root.style.top = Math.round(top) + 'px';
}

function _pgShowTabPreview(tab, idx) {
  var page = pages[idx];
  if (!page || !tab || tab.querySelector('.page-tab-rename')) return;

  clearTimeout(_pgTabPreview.hideTimer);
  clearTimeout(_pgTabPreview.showTimer);

  _pgEnsureTabPreviewUi();
  _pgTabPreview.requestId++;
  _pgTabPreview.anchorEl = tab;
  _pgTabPreview.pageIdx = idx;
  _pgTabPreview.labelEl.textContent = page.label || ('Page ' + (idx + 1));
  _pgTabPreview.metaEl.textContent = _pgPreviewMeta(page);
  _pgTabPreview.stage.style.background = page.bg || '#ffffff';
  _pgTabPreview.img.removeAttribute('src');
  _pgTabPreview.root.classList.add('is-visible', 'is-loading');
  _pgTabPreview.root.setAttribute('aria-hidden', 'false');
  _pgPositionTabPreview();

  var requestId = _pgTabPreview.requestId;
  _pgRenderTabPreview(idx, function (entry) {
    if (requestId !== _pgTabPreview.requestId) return;
    if (_pgTabPreview.pageIdx !== idx || _pgTabPreview.anchorEl !== tab) return;
    if (!entry || !entry.src) return;

    _pgTabPreview.stage.style.background = entry.bg || page.bg || '#ffffff';
    _pgTabPreview.img.src = entry.src;
    _pgTabPreview.img.alt = (page.label || ('Page ' + (idx + 1))) + ' preview';
    _pgTabPreview.root.classList.remove('is-loading');
    _pgPositionTabPreview();
  });
}

function _pgScheduleTabPreview(tab) {
  if (!tab || tab.querySelector('.page-tab-rename')) return;
  var idx = parseInt(tab.getAttribute('data-page-idx'), 10);
  if (isNaN(idx) || !pages[idx]) return;

  clearTimeout(_pgTabPreview.hideTimer);
  clearTimeout(_pgTabPreview.showTimer);

  if (_pgTabPreview.anchorEl === tab && _pgTabPreview.pageIdx === idx && _pgTabPreview.root && _pgTabPreview.root.classList.contains('is-visible')) {
    _pgPositionTabPreview();
    return;
  }

  _pgTabPreview.showTimer = setTimeout(function () {
    _pgShowTabPreview(tab, idx);
  }, _pgTabPreview.showDelayMs);
}

function _pgHideTabPreview(immediate) {
  clearTimeout(_pgTabPreview.showTimer);
  clearTimeout(_pgTabPreview.hideTimer);
  _pgTabPreview.requestId++;

  if (!_pgTabPreview.root) {
    _pgTabPreview.anchorEl = null;
    _pgTabPreview.pageIdx = -1;
    return;
  }

  var runHide = function () {
    if (!_pgTabPreview.root) return;
    _pgTabPreview.root.classList.remove('is-visible', 'is-loading');
    _pgTabPreview.root.setAttribute('aria-hidden', 'true');
    _pgTabPreview.img.removeAttribute('src');
    _pgTabPreview.anchorEl = null;
    _pgTabPreview.pageIdx = -1;
  };

  if (immediate) runHide();
  else _pgTabPreview.hideTimer = setTimeout(runHide, _pgTabPreview.hideDelayMs);
}

function _pgBindTabPreviewEvents(inner) {
  if (!inner || inner._pgPreviewBound) return;
  inner._pgPreviewBound = true;

  inner.addEventListener('mouseover', function (e) {
    var tab = _pgFindPreviewTab(e.target);
    if (!tab) return;
    if (tab === _pgFindPreviewTab(e.relatedTarget)) return;
    _pgScheduleTabPreview(tab);
  });

  inner.addEventListener('mouseout', function (e) {
    var tab = _pgFindPreviewTab(e.target);
    if (!tab) return;
    if (tab === _pgFindPreviewTab(e.relatedTarget)) return;
    _pgHideTabPreview(false);
  });

  inner.addEventListener('focusin', function (e) {
    var tab = _pgFindPreviewTab(e.target);
    if (!tab) return;
    _pgScheduleTabPreview(tab);
  });

  inner.addEventListener('focusout', function (e) {
    var tab = _pgFindPreviewTab(e.target);
    if (!tab) return;
    if (tab === _pgFindPreviewTab(e.relatedTarget)) return;
    _pgHideTabPreview(false);
  });

  inner.addEventListener('scroll', function () {
    if (_pgTabPreview.root && _pgTabPreview.root.classList.contains('is-visible')) _pgPositionTabPreview();
  });
}

function initPages() {
  pages = [];
  currentPageIndex = 0;

  if (activeProduct === 'card' && dualSideEnabled) {
    pages.push({ json: null, bg: '#0d0d0d', label: 'Front', w: CW, h: CH, _productType: activeProduct });
    pages.push({ json: null, bg: '#1a1a2e', label: 'Back', w: CW, h: CH, _productType: activeProduct });
  } else {
    pages.push({ json: null, bg: '#ffffff', label: 'Page 1', w: CW, h: CH, _productType: activeProduct });
  }

  currentPageIndex = 0;
  renderPageTabs();
}

// Safe default: the REAL rehydrator is assigned by the lazily-loaded gallery/canvas/video module and re-links
// dead video/audio srcs inside page JSON. If that module file failed to load, the unguarded calls (here and in
// autosave.js) would throw INSIDE loadFromJSON callbacks and leave histLocked stuck true — which silently
// suspends every future save while the UI keeps saying "Saved". The stub just passes through to the callback.
if (typeof window._rehydrateCanvasVideoMedia !== 'function') {
  window._rehydrateCanvasVideoMedia = function (cv, cb) { if (typeof cb === 'function') cb(); };
}

function saveCurrentPage() {
  if (!pages[currentPageIndex]) return;

  // Scene (frame-canvas) page: persist its _scene model + world transform, skip the classic
  // canvas.toJSON path. Keyed on the PAGE property (not isActive) so it's order-independent.
  if (typeof ccFlag === 'function' && ccFlag('scene') && pages[currentPageIndex]._productType === 'scene' && typeof SceneEditor !== 'undefined') {
    _pgEnsurePageId(pages[currentPageIndex]);
    SceneEditor.saveForPage(pages[currentPageIndex]._pageId);
    _pgTouchPagePreview(pages[currentPageIndex]);
    return;
  }

  // Save video editor project for current page if active — ONLY when the current page is genuinely a video
  // page. If the video editor is active but the current page is another type (a raced lazy-activation left it
  // active after the user switched away), saving here would stamp _productType='video' onto that page and
  // overwrite it with the video project → the "infinite→video" corruption that cascades into a full doc wipe.
  if (typeof VideoEditor !== 'undefined' && VideoEditor.isActive() && pages[currentPageIndex] && pages[currentPageIndex]._productType === 'video') {
    _pgEnsurePageId(pages[currentPageIndex]);
    VideoEditor.saveForPage(pages[currentPageIndex]._pageId);
  }

  if (typeof pageHasSlideDeck === 'function' && pageHasSlideDeck(pages[currentPageIndex])) {
    if (typeof saveCurrentInnerSlide === 'function') saveCurrentInnerSlide();
    var slidePage = pages[currentPageIndex];
    slidePage._productType = 'slide';
    slidePage.w = CW;
    slidePage.h = CH;
    slidePage.bg = canvas.backgroundColor || slidePage.bg;
  } else {
  pages[currentPageIndex].json = canvas.toJSON(CUSTOM_PROPS);
  if (typeof _ccFixVideoSrcInJson === 'function') _ccFixVideoSrcInJson(pages[currentPageIndex].json);
  pages[currentPageIndex].bg = canvas.backgroundColor;
  pages[currentPageIndex].w = CW;
  pages[currentPageIndex].h = CH;
    if (pages[currentPageIndex]._isBoard) {
      // Board pages are marked by _isBoard only. Stamping the global
      // activeProduct here poisoned saved boards with a foreign type (e.g.
      // 'scene' after visiting an infinite page), which hijacked the restore
      // routing after F5. Also strip a stale stamp from already-saved docs.
      delete pages[currentPageIndex]._productType;
    } else {
      pages[currentPageIndex]._productType = activeProduct || pages[currentPageIndex]._productType || 'card';
    }
  }
  // Save page-level design note from textarea
  var pn = document.getElementById('p-page-note');
  if (pn) pages[currentPageIndex]._pageDesignNote = pn.value || '';
  _pgTouchPagePreview(pages[currentPageIndex]);
}

/* Resolve mode from the page being ENTERED, never from the page being left. A video visit used to
   leave activeProduct='video' behind on legacy/board/slide/scene pages with no explicit type. The next
   autosave then stamped those pages as video and the timeline became permanent after reload. Structural
   page markers are authoritative and also repair already-poisoned documents in place. */
function _pgResolvePageProduct(page) {
  if (!page) return 'custom';
  if (page._isBoard) {
    delete page._productType;
    return 'custom';
  }
  if (page._scene) {
    page._productType = 'scene';
    return 'scene';
  }
  if (page._slideDeck) {
    page._productType = 'slide';
    return 'slide';
  }
  // Repair pages poisoned by the old video-switch race. A classic generated page label plus an
  // empty/missing video project means the page was never intentionally a video page; the stale
  // `_productType='video'` stamp only came from the previously-active page. Keep non-empty video
  // projects authoritative so renamed/legacy real videos are never downgraded.
  if (page._productType === 'video' && /^(?:page|sayfa|canvas|slide|board|web page)\b/i.test(page.label || '')) {
    var _videoClipCount = 0;
    var _videoTracks = page._videoProject && page._videoProject.tracks;
    if (Array.isArray(_videoTracks)) {
      _videoTracks.forEach(function (track) { _videoClipCount += Array.isArray(track && track.clips) ? track.clips.length : 0; });
    }
    if (_videoClipCount === 0) page._productType = 'custom';
  }
  if (page._isWfBoard && page._productType === 'video') page._productType = 'custom';
  return page._productType || 'custom';
}

function switchPage(index, forceReload) {
  if (index < 0 || index >= pages.length) return;
  /* Opening a page always LEAVES the preview (owner 2026-08-06). The tab bar's own click handler
     did this, but the "+" add-page button (and every other creator: scene, board, slide, video)
     went straight to switchPage, so a new page was created behind an overlay that stayed up. It
     also has to run BEFORE the early-return below, or clicking the ACTIVE page's tab from the
     preview does nothing at all. */
  if (typeof splitMode !== 'undefined' && splitMode && typeof disableSplitMode === 'function') disableSplitMode();
  if (index === currentPageIndex && !forceReload) return;

  // Page-sleep: if the target page's json was parked (slept), hydrate it FIRST, then
  // re-enter with force. Hydration is sync when the _psRam mirror has it (v1 always),
  // async only after a reload before the mirror is warm. The active page never sleeps,
  // so this only fires for index !== currentPageIndex (the early-return above is clear).
  var _psTgt = pages[index];
  if (_psTgt && _psTgt._slept && typeof _psHydratePage === 'function') {
    _psHydratePage(index, function () { switchPage(index, true); });
    return;
  }

  // Never switch pages mid-export: leaving a video page deactivates the editor and re-inits
  // VE._veProject / videoPool, clobbering the running WebCodecs render (export-import-manager-plan Phase 6).
  if (typeof VE !== 'undefined' && VE && VE._veExporting) {
    if (typeof showToast === 'function') showToast('Page cannot be changed during export');
    return;
  }

  if (window.wbActive && typeof exitWhiteboardMode === 'function') {
    exitWhiteboardMode();
  }

  // Pause all videos and hide hover button before leaving current page
  if (typeof _ccVideoPauseAll === 'function') _ccVideoPauseAll();
  if (typeof _ccUpdateVideoHoverButton === 'function') _ccUpdateVideoHoverButton(null);

  // Save & deactivate video editor before leaving current page
  var _veWasActive = false;
  var _vePageW = CW, _vePageH = CH;  // snapshot BEFORE deactivate corrupts them
  if (typeof VideoEditor !== 'undefined' && VideoEditor.isActive()) {
    // Only treat this as a genuine video-page leave (save-back + the _veWasActive type-fixup below) when the
    // outgoing page really IS a video page. If the video editor was left active on a non-video page by a raced
    // lazy-activation, just deactivate to clean up — never save/stamp the video project onto that page.
    if (pages[currentPageIndex] && pages[currentPageIndex]._productType === 'video') {
      _veWasActive = true;
      _vePageW = CW;
      _vePageH = CH;
      _pgEnsurePageId(pages[currentPageIndex]);
      VideoEditor.saveForPage(pages[currentPageIndex]._pageId);
    }
    VideoEditor.deactivate();
  }

  // Scene (frame-canvas): save + deactivate the outgoing scene page so applyView/next-page run normally.
  // Guard pages[currentPageIndex]: autosave-restore sets currentPageIndex = -1 before switchPage, and a
  // restore triggered while a scene is active would otherwise deref pages[-1] here.
  if (typeof ccFlag === 'function' && ccFlag('scene') && typeof SceneEditor !== 'undefined' && SceneEditor.isActive() && pages[currentPageIndex]) {
    _pgEnsurePageId(pages[currentPageIndex]);
    SceneEditor.saveForPage(pages[currentPageIndex]._pageId);
    SceneEditor.deactivate();
  }

  if (index !== currentPageIndex) {
    saveCurrentPage();
    // deactivate restored pre-video product type & dims, so saveCurrentPage
    // wrote wrong values for the video page. Fix them now.
    if (_veWasActive) {
      pages[currentPageIndex]._productType = 'video';
      pages[currentPageIndex].w = _vePageW;
      pages[currentPageIndex].h = _vePageH;
    }
  }
  // Undo history is canvas-JSON based and NOT page-scoped: stepping back after
  // a switch would restore the PREVIOUS page's content onto this page (and in
  // video mode overlay-sync would turn every restored object into a clip).
  // History is per page visit: reset it when the page really changes.
  if (index !== currentPageIndex && typeof undoStack !== 'undefined') {
    undoStack.length = 0;
    hIdx = -1;
  }
  currentPageIndex = index;

  var page = pages[index];
  activeProduct = _pgResolvePageProduct(page);
  // D4: stamp lastOpened for the work browser's "son dokunulanlar" (silent → no autosave loop).
  if (typeof CCWorks !== 'undefined' && page && typeof _pgEnsurePageId === 'function') { try { CCWorks._stampOpen({ type: 'page', id: _pgEnsurePageId(page) }); } catch (e) {} }

  if (typeof ccFlag === 'function' && ccFlag('scene') && !page._isBoard && page._productType === 'scene' && typeof _scEnterScene === 'function') {
    _scEnterScene(index);   // scene takes over the canvas; its own world transform replaces the viewport reset below
  } else if (typeof pageHasSlideDeck === 'function' && pageHasSlideDeck(page)) {
    if (typeof loadInnerSlide === 'function') loadInnerSlide(index, page._slideDeck ? page._slideDeck.activeSlideIndex : 0, { skipSave: true });
  } else {

  if (page.w && page.h) {
    CW = page.w;
    CH = page.h;
    canvas.setWidth(CW);
    canvas.setHeight(CH);
  } else {
    // Legacy/imported page with no stored size — fall back to product-type defaults
    // (or 700×400) instead of silently inheriting the OUTGOING page's dimensions.
    var _pdef = (typeof getProductConfig === 'function')
      ? getProductConfig(page._productType || activeProduct)
      : null;
    CW = (_pdef && _pdef.w) || 700;
    CH = (_pdef && _pdef.h) || 400;
    // Persist so the page keeps a real size after this switch.
    page.w = CW;
    page.h = CH;
    canvas.setWidth(CW);
    canvas.setHeight(CH);
  }

  if (page.json) {
    histLocked = true;
    canvas.loadFromJSON(page.json, function () {
      window._rehydrateCanvasVideoMedia(canvas, function () {
        // Apply the page's stored background so a legacy/imported page whose JSON omits a
        // background doesn't inherit the previous page's canvas background.
        if (page.bg != null) canvas.backgroundColor = page.bg;
        canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
        canvas.setZoom(1);
        canvas.renderAll();
        histLocked = false;
        // Seed this page's undo baseline (stack was reset on page change) so
        // the FIRST edit can undo back to the freshly loaded state.
        if (hIdx < 0 && typeof _snapNow === 'function') _snapNow();
        if (typeof _restoreChartsAfterLoad === 'function') _restoreChartsAfterLoad(canvas);
        if (typeof refreshStructure === 'function') refreshStructure();
        // Post-load: ensure grid cell images are restored (bulk-generated pages)
        if (typeof _glRestoreGridCellImages === 'function') {
          var objs = canvas.getObjects();
          for (var gi = 0; gi < objs.length; gi++) {
            if (objs[gi]._isGridLayout) _glRestoreGridCellImages(objs[gi]);
          }
        }
      });
    });
  } else {
    canvas.clear();
    canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
    canvas.setZoom(1);
    canvas.setBackgroundColor(page.bg || '#ffffff', function () {
      canvas.renderAll();
      if (hIdx < 0 && typeof _snapNow === 'function') _snapNow();
    });
  }
  }

  if (page._isBoard && typeof enterWhiteboardMode === 'function') {
    setTimeout(function () { enterWhiteboardMode(); }, 50);
  }

  // Track group's last opened page
  if (page.groupId) {
    var g = _pgFindGroup(page.groupId);
    if (g) g.lastOpenedPageId = page._pageId;
  }

  syncLegacyFaceGlobals();
  renderPageTabs();
  updateCanvasLabel();
  if (!page._isBoard && typeof applyView === 'function') {
    applyView();
  }
  // `activeProduct` is assigned directly above so the target keeps its own stored dimensions.
  // Unlike setProductType(), that direct assignment does not refresh mode-dependent chrome;
  // after Video -> Page the badge and preset filters therefore kept saying/showing Video.
  if (typeof updateSizeBadge === 'function') updateSizeBadge();
  if (typeof updateRpTabBarVisibility === 'function') updateRpTabBarVisibility();
  if (typeof updateCanvasSizePanel === 'function') updateCanvasSizePanel();
  var exportBtn = document.getElementById('btn-export');
  if (exportBtn && typeof getIcon === 'function') {
    exportBtn.innerHTML = getIcon('share', 14) + ' Share';
  }
  if (typeof syncSlideDeckUi === 'function') syncSlideDeckUi();
  // Sync page-level design note
  if (typeof _syncPageDesignNote === 'function') _syncPageDesignNote();

  // Auto-activate video editor if target page is a video page. The video subsystem (~180 modules +
  // ffmpeg.wasm) is NOT in the boot manifest — it's lazy-loaded on first use here (editor-perf B4).
  if (page._productType === 'video') {
    _pgEnsurePageId(page);
    // Pin the target — the video subsystem loads ASYNC (lazy module + 60ms gap), and if the user switches
    // pages in that window we must NOT activate the video editor on whatever page is now current (it would
    // stamp that page 'video' → infinite→video corruption + doc wipe). _veStale() aborts the stale activation.
    var _veTargetIdx = index, _veTargetId = page._pageId;
    var _veStale = function () { return currentPageIndex !== _veTargetIdx || !pages[_veTargetIdx] || pages[_veTargetIdx]._pageId !== _veTargetId; };
    var _activateVideo = function () {
      if (typeof VideoEditor === 'undefined') return;
      if (_veStale()) return;
      // Guard autosave across the ENTIRE video activation: the 60ms gap + activate's canvas.clear() +
      // loadForPage's async loadFromJSON all run with histLocked false, and a save landing here would
      // serialize the empty canvas over the page. _veSwitching (a dedicated flag _ccSaveSuspended honors)
      // stays set for the whole window; the internal _veRestoring toggles can't be relied on alone.
      var _VE = window.__ccVideoEditor;
      if (_VE) _VE._veSwitching = true;
      setTimeout(function () {
        if (_veStale()) { if (_VE) _VE._veSwitching = false; return; }   // switched away during the 60ms gap → abort, don't corrupt the now-current page
        VideoEditor.loadForPage(_veTargetId);
        VideoEditor.activate();
        // Clear the switch guard only once the async restore has actually SETTLED (loadFromJSON callback done
        // → _veRestoring false), not on a fixed 500ms. The overlay/media restore can outlast 500ms, and a
        // save landing in that gap used to serialize an empty project over the page. Poll _veRestoring with a
        // hard ~5s cap so the flag can never stick.
        var _clearSwitch = function (tries) {
          var _V = window.__ccVideoEditor;
          if (!_V) return;
          if (_V._veRestoring && tries < 50) { setTimeout(function () { _clearSwitch(tries + 1); }, 100); return; }
          _V._veSwitching = false;
        };
        setTimeout(function () { _clearSwitch(0); }, 120);
      }, 60);
    };
    if (typeof VideoEditor !== 'undefined') _activateVideo();
    else if (window.cc && cc.loader && cc.loader.loadModule) cc.loader.loadModule('video').then(_activateVideo);
  }

  // Page-sleep: after the switch settles (currentPageIndex + neighbor window are now the
  // protected/hot set), evict LRU pages beyond the awake budget. No-op when sleep is off.
  if (typeof _psEvictIfNeeded === 'function') _psEvictIfNeeded();
}

function addPage(label, w, h) {
  saveCurrentPage();
  var newW = w || CW;
  var newH = h || CH;
  var newLabel = label || ('Page ' + (pages.length + 1));
  // Detect video mode authoritatively — activeProduct may NOT be 'video' while the video editor is
  // active, so also check the current page's type and VideoCanvas. Otherwise the new page inherits
  // the live 1920×1080 video resolution.
  var _curPg = pages[currentPageIndex];
  var _inVideo = (activeProduct === 'video') ||
                 (_curPg && _curPg._productType === 'video') ||
                 (typeof VideoCanvas !== 'undefined' && VideoCanvas.isActive && VideoCanvas.isActive());
  // Never create a new page as video — new pages should always be blank non-video
  var newProduct = _inVideo ? 'custom' : activeProduct;
  // If we're in video mode, use default canvas size instead of the live video dimensions
  if (_inVideo) {
    newW = w || 700;
    newH = h || 400;
  }
  pages.push({ json: null, bg: '#ffffff', label: newLabel, w: newW, h: newH, _productType: newProduct });
  switchPage(pages.length - 1);
}

// Add a NEW page of an explicit TYPE (the Add-page "+" hover menu): single | infinite | slide | video.
function _pgAddPageOfType(type) {
  if (type === 'infinite') {
    if (typeof _scCreateInfinitePage === 'function') { _scCreateInfinitePage(); return; }
    type = 'single';   // scene feature unavailable → fall back to a classic page
  }
  if (type === 'slide') {
    saveCurrentPage();
    pages.push({ json: null, bg: '#ffffff', label: 'Slide ' + (pages.length + 1), w: 1600, h: 900, _productType: 'custom' });
    var si = pages.length - 1;
    if (typeof ensureSlideDeck === 'function') ensureSlideDeck(pages[si], { w: 1600, h: 900 });
    switchPage(si, true);
    return;
  }
  if (type === 'video') {
    saveCurrentPage();
    pages.push({ json: null, bg: '#000000', label: 'Video ' + (pages.length + 1), w: 1920, h: 1080, _productType: 'video' });
    switchPage(pages.length - 1, true);   // switchPage auto-activates the video editor for video pages
    return;
  }
  if (type === 'board') {
    if (typeof _createBoardInGroup === 'function') { _createBoardInGroup(null); return; }   // reuse the rail's board creator
    saveCurrentPage();
    var ba = document.getElementById('canvas-area');
    pages.push({ json: null, bg: '#1a1a2e', label: 'Board', w: ba ? ba.clientWidth : 1400, h: ba ? ba.clientHeight : 900, _isBoard: true });
    switchPage(pages.length - 1);
    setTimeout(function () { if (typeof enterWhiteboardMode === 'function') enterWhiteboardMode(); }, 120);
    return;
  }
  // single (classic blank page)
  saveCurrentPage();
  pages.push({ json: null, bg: '#ffffff', label: 'Page ' + (pages.length + 1), w: 700, h: 400, _productType: 'custom' });
  switchPage(pages.length - 1);
}

// ── Wireframe Board Page (tall web-page canvas) ──────────────
function addWireframeBoardPage(label) {
  saveCurrentPage();
  var newW = 1440;
  var newH = 3000; // Default web page height
  var newLabel = label || ('Web Page ' + (pages.length + 1));
  pages.push({ json: null, bg: '#FFFFFF', label: newLabel, w: newW, h: newH, _isWfBoard: true, _productType: activeProduct });
  switchPage(pages.length - 1);
}

function setWfBoardHeight(height) {
  var h = Math.max(600, Math.min(20000, parseInt(height) || 3000));
  var page = pages[currentPageIndex];
  if (!page) return;
  page.h = h;
  page._isWfBoard = true;
  CH = h;
  canvas.setHeight(h);
  canvas.renderAll();
  if (typeof applyView === 'function') applyView();
  if (typeof saveState === 'function') saveState();
}

function removePage(index) {
  if (pages.length <= 1) return;
  if (index < 0 || index >= pages.length) return;

  var wasActive = (index === currentPageIndex);

  pages.splice(index, 1);

  if (wasActive) {
    // Canvas still shows the deleted page's content — must NOT save it.
    // Set currentPageIndex to target so switchPage skips saveCurrentPage.
    var newIdx = Math.min(index, pages.length - 1);
    currentPageIndex = newIdx;
    switchPage(newIdx, true);
  } else {
    // Non-active page removed — just adjust index if it shifted
    if (currentPageIndex > index) {
      currentPageIndex--;
    }
  }

  syncLegacyFaceGlobals();
  renderPageTabs();
}

function duplicatePage(index) {
  if (index < 0 || index >= pages.length) return;
  // Page-sleep: duplicating a slept page must copy its REAL json, not null. Hydrate first.
  if (pages[index] && pages[index]._slept && typeof _psHydratePage === 'function') {
    _psHydratePage(index, function () { duplicatePage(index); });
    return;
  }
  saveCurrentPage();
  var src = pages[index];
  var copy = {
    json: src.json ? JSON.parse(JSON.stringify(src.json)) : null,
    bg: src.bg,
    label: src.label + ' (copy)',
    w: src.w || CW,
    h: src.h || CH,
    _productType: src._productType || activeProduct,
    _pageDesignNote: src._pageDesignNote || '',
    groupId: src.groupId
  };
  if (src._slideDeck) {
    copy._slideDeck = JSON.parse(JSON.stringify(src._slideDeck));
    if (copy._slideDeck && Array.isArray(copy._slideDeck.slides)) {
      copy._slideDeck.slides.forEach(function(slide, idx) {
        slide.id = 'dup-' + Date.now() + '-' + idx;
        slide._previewRev = 0;
      });
    }
  }

  /* `copy` is an explicit WHITELIST, so every field a page grows has to be added here by hand or it
     is silently dropped. `_videoProject` and `_scene` never were.

     What that cost: duplicating a video page produced a page with NO `_videoProject` at all, so
     every track, every clip and every grade node went with it. And because `copy` carries no
     `_pageId` either, the new page gets a fresh one, `_veLoadForPage` finds neither an in-memory
     project nor a persisted one, and falls through to `_veResetToFresh()`: the duplicate opens
     COMPLETELY EMPTY. Same for `_scene` (infinite-canvas pages).

     Clip ids are regenerated rather than copied, the same way `_slideDeck` regenerates slide ids
     just above: `VE._vePlayback.videoPool` and `poolMeta` are both keyed by clip id, so two pages
     sharing ids would fight over one pool entry. `poolMeta` is remapped onto the new ids in the same
     pass, or the duplicate would have clips whose media cannot be rebuilt on restore. */
  if (src._videoProject) {
    var vp = JSON.parse(JSON.stringify(src._videoProject));
    var stamp = 'dup' + Date.now().toString(36);
    var idMap = {};
    (vp.tracks || []).forEach(function (track) {
      (track.clips || []).forEach(function (clip, ci) {
        var oldId = clip.id;
        clip.id = stamp + '-' + ci + '-' + Math.floor(Math.random() * 1e4);
        if (oldId) idMap[oldId] = clip.id;
      });
    });
    if (vp.poolMeta) {
      var pm = {};
      Object.keys(vp.poolMeta).forEach(function (oldId) {
        pm[idMap[oldId] || oldId] = vp.poolMeta[oldId];
      });
      vp.poolMeta = pm;
    }
    copy._videoProject = vp;
  }
  if (src._scene) copy._scene = JSON.parse(JSON.stringify(src._scene));

  pages.splice(index + 1, 0, copy);
  switchPage(index + 1);
  // Page-sleep: switchPage's same-index early-return can skip its evict when duplicating
  // repeatedly onto the same spot; enforce the awake budget here explicitly.
  if (typeof _psEvictIfNeeded === 'function') _psEvictIfNeeded();
}

function renamePage(index, newLabel) {
  if (index < 0 || index >= pages.length) return;
  pages[index].label = newLabel || pages[index].label;
  renderPageTabs();
}

function renderPageTabs() {
  var bar = document.getElementById('page-tabs-bar');
  if (!bar) return;

  // Ensure every page has _pageId
  pages.forEach(function (p) {
    _pgEnsurePageId(p);
    _pgEnsurePreviewRev(p);
  });

  var inner = document.getElementById('page-tabs-inner');
  if (!inner) {
    inner = document.createElement('div');
    inner.id = 'page-tabs-inner';
    inner.style.cssText = 'display:flex;align-items:center;gap:2px;overflow-x:auto;flex:1;padding:0 4px;';
    bar.innerHTML = '';
    bar.appendChild(inner);

    var addWrap = document.createElement('div');
    addWrap.className = 'page-add-wrap';

    var addBtn = document.createElement('button');
    addBtn.id = 'page-add-btn';
    addBtn.className = 'page-tab-add';
    addBtn.title = 'Add page';
    addBtn.innerHTML = typeof getIcon === 'function' ? getIcon('plus', 12) : '+';
    addBtn.onclick = function () { _pgAddPageOfType('single'); };
    addWrap.appendChild(addBtn);

    // hover menu — one-click create a page of any type (Single / Infinite / Slide / Video)
    var addMenu = document.createElement('div');
    addMenu.className = 'page-add-menu';
    [
      { t: 'single', icon: 'file', label: 'Single' },
      { t: 'infinite', icon: 'layout-grid', label: 'Infinite' },
      { t: 'slide', icon: 'presentation', label: 'Slide' },
      { t: 'video', icon: 'video', label: 'Video' },
      { t: 'board', icon: 'square-dashed', label: 'Board' }
    ].forEach(function (o) {
      var it = document.createElement('button');
      it.type = 'button'; it.className = 'page-add-item';
      it.innerHTML = (typeof getIcon === 'function' ? getIcon(o.icon, 14) : '') + '<span>' + o.label + '</span>';
      it.onclick = function (e) { e.stopPropagation(); addWrap.classList.remove('open'); _pgAddPageOfType(o.t); };
      addMenu.appendChild(it);
    });
    addWrap.appendChild(addMenu);

    var _addHideT = null;
    addWrap.addEventListener('mouseenter', function () { if (_addHideT) clearTimeout(_addHideT); addWrap.classList.add('open'); });
    addWrap.addEventListener('mouseleave', function () { _addHideT = setTimeout(function () { addWrap.classList.remove('open'); }, 200); });
    bar.appendChild(addWrap);

    var previewBtn = document.createElement('button');
    previewBtn.id = 'page-preview-btn';
    previewBtn.className = 'page-tab-preview';
    previewBtn.title = 'Preview all pages';
    previewBtn.innerHTML = (typeof getIcon === 'function' ? getIcon('eye', 12) : '&#128065;') + ' Preview';
    previewBtn.onclick = function () {
      if (typeof enableSplitMode === 'function' && !splitMode) enableSplitMode();
      else if (typeof disableSplitMode === 'function' && splitMode) disableSplitMode();
    };
    bar.appendChild(previewBtn);

    _pgBindTabPreviewEvents(inner);
  }

  // Show/hide quick-nav button based on groups existing
  var qnavBtn = document.getElementById('pg-quicknav-btn');
  var hasGroups = pageGroups.length > 0;
  if (hasGroups && !qnavBtn) {
    qnavBtn = document.createElement('button');
    qnavBtn.id = 'pg-quicknav-btn';
    qnavBtn.className = 'pg-quicknav-btn';
    qnavBtn.title = 'Quick page navigator';
    qnavBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 15 12 9 18 15"/></svg>';
    qnavBtn.onclick = function (e) { e.stopPropagation(); _pgShowQuickNav(qnavBtn); };
    bar.insertBefore(qnavBtn, inner);
  } else if (!hasGroups && qnavBtn) {
    qnavBtn.remove();
  }

  // Make inner bar a drop zone — dropping here removes from group (ungroups)
  inner.ondragover = function (e) { e.preventDefault(); };
  inner.ondrop = function (e) {
    // Only handle if drop target is the inner container itself (not a child)
    if (e.target !== inner) return;
    e.preventDefault();
    var dragData = e.dataTransfer.getData('text/plain');
    var dragIndices = dragData.split(',').map(function (s) { return parseInt(s, 10); }).filter(function (n) { return !isNaN(n); });
    if (dragIndices.length === 0) return;
    dragIndices.forEach(function (di) {
      if (pages[di]) delete pages[di].groupId;
    });
    _pgClearSelection();
    renderPageTabs();
  };

  _pgHideTabPreview(true);
  inner.innerHTML = '';

  // Build ordered render list: groups + ungrouped pages
  var rendered = new Set();

  // Sort groups by order
  var sortedGroups = pageGroups.slice().sort(function (a, b) { return a.order - b.order; });

  sortedGroups.forEach(function (group) {
    var groupPages = [];
    pages.forEach(function (p, idx) { if (p.groupId === group.id) groupPages.push(idx); });
    if (groupPages.length === 0) return; // don't render empty groups

    // Group chip
    var chip = document.createElement('div');
    chip.className = 'pg-group-chip' + (group.collapsed ? ' collapsed' : '');
    chip.style.setProperty('--pg-color', group.color);
    chip.innerHTML =
      '<span class="pg-group-dot" style="background:' + group.color + ';pointer-events:none"></span>' +
      '<span class="pg-group-name" style="pointer-events:none">' + _pgEsc(group.name) + '</span>' +
      '<span class="pg-group-count" style="pointer-events:none">' + groupPages.length + '</span>' +
      '<span class="pg-group-chevron" style="pointer-events:none">' + (group.collapsed ? '&#9656;' : '&#9662;') + '</span>';

    chip.onclick = function (e) {
      e.stopPropagation();
      group.collapsed = !group.collapsed;
      // If expanding, and this group has pages, switch to its last opened page
      if (!group.collapsed && groupPages.length > 0) {
        var targetIdx = groupPages[0]; // default first page in group
        if (group.lastOpenedPageId) {
          for (var ti = 0; ti < pages.length; ti++) {
            if (pages[ti]._pageId === group.lastOpenedPageId) { targetIdx = ti; break; }
          }
        }
        var fromGroup = pages[currentPageIndex] ? pages[currentPageIndex].groupId : null;
        if (fromGroup !== group.id) _pgOnGroupSwitch(fromGroup, group.id);
        switchPage(targetIdx);
      }
      renderPageTabs();
    };
    chip.oncontextmenu = function (e) {
      e.preventDefault();
      e.stopPropagation(); // don't let the general canvas context menu also fire
      _pgShowGroupContextMenu(e, group);
    };
    // Accept drops on group chip → move pages into this group
    chip.ondragover = function (e) { e.preventDefault(); chip.style.outline = '2px solid ' + group.color; chip.style.outlineOffset = '-2px'; };
    chip.ondragleave = function () { chip.style.outline = ''; chip.style.outlineOffset = ''; };
    chip.ondrop = function (e) {
      e.preventDefault();
      e.stopPropagation();
      chip.style.outline = ''; chip.style.outlineOffset = '';
      var dragData = e.dataTransfer.getData('text/plain');
      var dragIndices = dragData.split(',').map(function (s) { return parseInt(s, 10); }).filter(function (n) { return !isNaN(n); });
      if (dragIndices.length === 0) return;
      dragIndices.forEach(function (di) {
        if (pages[di]) pages[di].groupId = group.id;
      });
      group.collapsed = false;
      _pgClearSelection();
      renderPageTabs();
    };
    inner.appendChild(chip);

    // If expanded, render group pages
    if (!group.collapsed) {
      groupPages.forEach(function (idx) {
        rendered.add(idx);
        var tab = _pgCreateTab(idx, group);
        inner.appendChild(tab);
      });
    } else {
      groupPages.forEach(function (idx) { rendered.add(idx); });
    }
  });

  // Render ungrouped pages
  pages.forEach(function (page, idx) {
    if (rendered.has(idx)) return;
    var tab = _pgCreateTab(idx, null);
    inner.appendChild(tab);
  });

}

function _pgEsc(str) {
  var d = document.createElement('span');
  d.textContent = str;
  return d.innerHTML;
}

// N5: page-strip tag filter API — show only tabs whose page carries ALL of `ids`.
function pgFilterByTags(ids) { window._pgTagFilter = (ids || []).slice(); if (typeof renderPageTabs === 'function') renderPageTabs(); }
function pgClearTagFilter() { window._pgTagFilter = []; if (typeof renderPageTabs === 'function') renderPageTabs(); }

// Mode glyph for a page tab — mirrors the Add-page menu icons (Page / Infinite / Slide / Video / Board).
function _pgTabModeIcon(page) {
  if (!page) return 'file';
  if (page._isBoard) return 'square-dashed';
  var t = page._productType;
  if (t === 'scene') return 'layout-grid';   // Infinite canvas
  if (t === 'slide') return 'presentation';
  if (t === 'video') return 'video';
  return 'file';                              // single / classic / card / wireframe → Page
}

function _pgCreateTab(idx, group) {
  var page = pages[idx];
  var tab = document.createElement('button');
  var isActive = idx === currentPageIndex;
  var isSelected = _pgIsSelected(idx);
  tab.className = 'page-tab' + (isActive ? ' active' : '') + (isSelected ? ' pg-selected' : '');
  if (group) {
    tab.classList.add('pg-grouped');
    tab.style.setProperty('--pg-color', group.color);
  }
  if (page._slept) { tab.classList.add('pg-slept'); tab.title = 'Sleeping (click: wakes up)'; }
  tab.dataset.pageIdx = idx;

  // Mode icon on EVERY tab (Page / Infinite / Slide / Video / Board) — neutral colour, never volt.
  if (typeof getIcon === 'function') {
    var micon = document.createElement('span');
    micon.className = 'pg-tab-icon';
    micon.innerHTML = getIcon(_pgTabModeIcon(page), 12);
    tab.appendChild(micon);
  }
  var labelSpan = document.createTextNode(page.label);
  tab.appendChild(labelSpan);

  // G2: page tag colour dots (shared/tags). Only tagged pages have a _pageId-keyed entry.
  if (typeof CCTags !== 'undefined' && page._pageId) {
    var ptags = CCTags.of({ type: 'page', id: page._pageId });
    if (ptags.length) {
      // N3: heat-map — subtly tint the tab by its first tag's colour ("Acme nerede" tek bakışta).
      tab.classList.add('pg-tagtint');
      tab.style.setProperty('--pg-tagcolor', ptags[0].color);
      var dwrap = document.createElement('span');
      dwrap.className = 'pg-tagdots';
      for (var ti = 0; ti < ptags.length && ti < 4; ti++) {
        var dot = document.createElement('span');
        dot.className = 'pg-tagdot';
        dot.style.background = ptags[ti].color;
        dot.title = ptags[ti].name;
        dwrap.appendChild(dot);
      }
      tab.appendChild(dwrap);
    }
  }

  // N5: page-strip tag filter — hide tabs whose page lacks ALL active filter tags.
  if (window._pgTagFilter && window._pgTagFilter.length && typeof CCTags !== 'undefined' && page._pageId) {
    var _pf = CCTags.idsOf({ type: 'page', id: page._pageId });
    var _match = true; for (var _fi = 0; _fi < window._pgTagFilter.length; _fi++) if (_pf.indexOf(window._pgTagFilter[_fi]) < 0) { _match = false; break; }
    if (!_match) tab.classList.add('pg-filtered-out');
  }

  tab.onclick = function (e) {
    _pgHideTabPreview(true);
    if (e.ctrlKey || e.metaKey) {
      // Multi-select toggle
      _pgToggleSelect(idx);
      return;
    }
    if (e.shiftKey) {
      // Range select
      _pgRangeSelect(idx);
      return;
    }
    // Normal click: switch page, clear selection
    _pgClearSelection();
    if (splitMode && typeof disableSplitMode === 'function') disableSplitMode();

    // Track group switching
    var fromGroup = pages[currentPageIndex] ? pages[currentPageIndex].groupId : null;
    var toGroup = page.groupId || null;
    if (fromGroup !== toGroup) _pgOnGroupSwitch(fromGroup, toGroup);

    switchPage(idx);
  };

  tab.ondblclick = function (e) {
    e.stopPropagation();
    _pgHideTabPreview(true);
    var input = document.createElement('input');
    input.type = 'text';
    input.value = page.label;
    input.className = 'page-tab-rename';
    input.style.cssText = 'width:80px;padding:2px 6px;font-size:11px;background:var(--bg);color:var(--text);border:1px solid var(--gold);border-radius:4px;outline:none;text-align:center;';
    tab.textContent = '';
    tab.appendChild(input);
    input.focus(); input.select();
    var finish = function () {
      var val = input.value.trim();
      if (val && val !== page.label) renamePage(idx, val);
      renderPageTabs();
    };
    input.onblur = finish;
    input.onkeydown = function (ev) { if (ev.key === 'Enter') finish(); if (ev.key === 'Escape') renderPageTabs(); };
  };

  tab.draggable = true;
  tab.ondragstart = function (e) {
    _pgHideTabPreview(true);
    // If this tab is part of a multi-selection, drag all selected
    var selIdx = _pgSelectedIndices();
    if (selIdx.indexOf(idx) < 0) selIdx = [idx];
    e.dataTransfer.setData('text/plain', selIdx.join(','));
    // Dim all dragged tabs
    selIdx.forEach(function (si) {
      var el = document.querySelector('.page-tab[data-page-idx="' + si + '"]');
      if (el) el.style.opacity = '0.4';
    });
  };
  tab.ondragend = function () {
    document.querySelectorAll('.page-tab').forEach(function (el) { el.style.opacity = ''; });
  };
  tab.ondragover = function (e) { e.preventDefault(); tab.style.borderLeft = '2px solid var(--gold)'; };
  tab.ondragleave = function () { tab.style.borderLeft = ''; };
  tab.ondrop = function (e) {
    e.preventDefault();
    e.stopPropagation();
    tab.style.borderLeft = '';
    var dragData = e.dataTransfer.getData('text/plain');
    var dragIndices = dragData.split(',').map(function (s) { return parseInt(s, 10); }).filter(function (n) { return !isNaN(n); });
    if (dragIndices.length === 0) return;
    var toIdx = idx;

    // Assign group if dropping onto a grouped tab
    var targetGroupId = group ? group.id : null;

    // For multi-drag, we remove all dragged pages then re-insert at target position
    // First collect the page objects
    var draggedPages = dragIndices
      .slice().sort(function (a, b) { return a - b; })
      .map(function (di) { return { origIdx: di, page: pages[di] }; })
      .filter(function (dp) { return !!dp.page; });

    if (draggedPages.length === 0) return;

    // Track current page's _pageId to restore currentPageIndex after reorder
    var curPageId = pages[currentPageIndex] ? pages[currentPageIndex]._pageId : null;
    // Remember target page _pageId for safe lookup after splice
    var targetPageId = page._pageId;

    // Remove dragged pages (from end to start to preserve indices)
    draggedPages.slice().reverse().forEach(function (dp) {
      pages.splice(dp.origIdx, 1);
    });

    // Find new insert position by _pageId (safe even if target was dragged)
    var insertAt = pages.length; // default: end of array
    for (var i = 0; i < pages.length; i++) {
      if (pages[i]._pageId === targetPageId) { insertAt = i; break; }
    }

    // Insert dragged pages at the target position
    draggedPages.forEach(function (dp, offset) {
      if (targetGroupId) {
        dp.page.groupId = targetGroupId;
      } else {
        delete dp.page.groupId;
      }
      pages.splice(insertAt + offset, 0, dp.page);
    });

    // Restore currentPageIndex
    if (curPageId) {
      for (var ri = 0; ri < pages.length; ri++) {
        if (pages[ri]._pageId === curPageId) { currentPageIndex = ri; break; }
      }
    }

    _pgClearSelection();
    renderPageTabs();
  };

  tab.oncontextmenu = function (e) {
    e.preventDefault();
    e.stopPropagation(); // don't let the general canvas context menu also fire
    _pgHideTabPreview(true);
    showPageContextMenu(e, idx);
  };

  return tab;
}

/* Append a context menu and place it at the cursor, flipping UP when opening
   downward would overflow the viewport bottom (page bar sits at the bottom). */
function _pgPlaceMenu(menu, e) {
  menu.style.visibility = 'hidden';
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';
  document.body.appendChild(menu);
  requestAnimationFrame(function () {
    var rect = menu.getBoundingClientRect();
    var h = rect.height, w = rect.width;
    var top = e.clientY;
    if (e.clientY + h + 8 > window.innerHeight) {
      top = e.clientY - h;                       // flip up: menu's bottom edge at the cursor
      if (top < 4) top = Math.max(4, window.innerHeight - h - 8);
    }
    var left = e.clientX;
    if (e.clientX + w + 8 > window.innerWidth) left = Math.max(4, window.innerWidth - w - 8);
    menu.style.top = top + 'px';
    menu.style.left = left + 'px';
    menu.style.visibility = 'visible';
  });
}

function showPageContextMenu(e, index) {
  var old = document.getElementById('page-ctx-menu');
  if (old) old.remove();

  var menu = document.createElement('div');
  menu.id = 'page-ctx-menu';
  menu.className = 'page-ctx-menu';
  menu.style.cssText = 'position:fixed;z-index:9000;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:4px;min-width:180px;box-shadow:0 8px 24px rgba(0,0,0,0.4);';

  // If this page is not in selection, treat it as the only target
  var selIndices = _pgSelectedIndices();
  if (selIndices.indexOf(index) < 0) selIndices = [index];
  var multiSel = selIndices.length > 1;

  var items = [];

  // Rename (only single)
  if (!multiSel) {
    items.push({ label: 'Rename', action: function () {
      showCustomPrompt('Page name:', pages[index].label, function (name) {
        if (name) renamePage(index, name);
      });
    }});
  }

  items.push({ label: 'Duplicate', action: function () {
    selIndices.slice().reverse().forEach(function (si) { duplicatePage(si); });
  }});

  // Page-sleep (owner 2026-07-18): manual sleep/wake from the tab context menu.
  if (typeof CCPageSleep !== 'undefined') {
    var _slTargets = selIndices.slice();
    var _anySlept = _slTargets.some(function (si) { return pages[si] && pages[si]._slept; });
    var _anySleepable = _slTargets.some(function (si) { return pages[si] && !pages[si]._slept && si !== currentPageIndex && CCPageSleep.isSleepable(pages[si]) && pages[si].json != null; });
    if (_anySlept) {
      items.push({ label: multiSel ? 'Wake up selected' : 'Wake up', icon: (typeof getIcon === 'function' ? getIcon('sun', 13) : ''), action: function () {
        var left = 0;
        _slTargets.forEach(function (si) {
          if (pages[si] && pages[si]._slept) { left++; CCPageSleep.wakePage(si, function () { left--; if (left === 0) renderPageTabs(); }); }
        });
        if (left === 0) renderPageTabs();
      }});
    }
    if (_anySleepable) {
      items.push({ label: multiSel ? 'Put selected to sleep' : 'Put to sleep', icon: (typeof getIcon === 'function' ? getIcon('moon', 13) : ''), action: function () {
        var n = 0;
        _slTargets.forEach(function (si) { if (CCPageSleep.sleepPage(si, true)) n++; });
        if (typeof showToast === 'function' && n) showToast(n + ' page put to sleep');
        renderPageTabs();
      }});
    }
    var _slGrp = pages[index] ? pages[index].groupId : null;
    if (_slGrp && typeof _pgPagesInGroup === 'function' && !multiSel) {
      items.push({ label: 'Put group to sleep', icon: (typeof getIcon === 'function' ? getIcon('moon-star', 13) : ''), action: function () {
        var n = 0;
        _pgPagesInGroup(_slGrp).forEach(function (pi) { if (CCPageSleep.sleepPage(pi, true)) n++; });
        if (typeof showToast === 'function') showToast(n + ' page put to sleep');
        renderPageTabs();
      }});
    }
  }

  // G2: tag this page (shared/tags). Single target = the right-clicked page.
  if (typeof CCTagModal !== 'undefined') {
    items.push({ label: 'Tag…', icon: (typeof getIcon === 'function' ? getIcon('tag', 13) : '🏷'), action: function () {
      var pid = _pgEnsurePageId(pages[index]);
      CCTagModal.open({ target: { type: 'page', id: pid }, onChange: function () { if (typeof renderPageTabs === 'function') renderPageTabs(); } });
    }});
  }

  // portal-tags-page Phase 9 (D4): tag the WHOLE project (design-level, targetType='design').
  // Only for portal-backed designs (needs a designId); shows up on the portal Tags page as a design entity.
  if (typeof CCTagModal !== 'undefined' && window.CCRemote && window.CCRemote.designId) {
    items.push({ label: 'Tag project…', icon: (typeof getIcon === 'function' ? getIcon('bookmark', 13) : ''), action: function () {
      CCTagModal.open({ target: { type: 'design', id: window.CCRemote.designId }, onChange: function () {} });
    }});
  }

  // G7: open the project-wide work browser (Çalışma Tarayıcısı).
  if (typeof CCWorksBrowser !== 'undefined') {
    items.push({ label: 'All works…', icon: (typeof getIcon === 'function' ? getIcon('layout-grid', 13) : ''), action: function () { CCWorksBrowser.open(); } });
  }

  // Q2: pageGroups ↔ tags bridge — tag EVERY page in the right-clicked page's group at once (bulk modal).
  var _q2grp = pages[index] ? pages[index].groupId : null;
  if (typeof CCTagModal !== 'undefined' && _q2grp && typeof _pgPagesInGroup === 'function') {
    items.push({ label: 'Tag group…', icon: (typeof getIcon === 'function' ? getIcon('folder', 13) : ''), action: function () {
      var targets = _pgPagesInGroup(_q2grp).map(function (pi) { return { type: 'page', id: _pgEnsurePageId(pages[pi]) }; });
      if (targets.length) CCTagModal.open({ target: targets, onChange: function () { if (typeof renderPageTabs === 'function') renderPageTabs(); } });
    }});
  }

  // N5: filter the page strip by this page's first tag (or clear an active strip filter).
  if (typeof CCTags !== 'undefined' && pages[index] && pages[index]._pageId) {
    var _myTags = CCTags.of({ type: 'page', id: pages[index]._pageId });
    if (_myTags.length) items.push({ label: 'Strip "' + _myTags[0].name + '" filter', icon: (typeof getIcon === 'function' ? getIcon('filter', 13) : ''), action: function () { pgFilterByTags([_myTags[0].id]); } });
  }
  if (window._pgTagFilter && window._pgTagFilter.length) {
    items.push({ label: 'Clear strip filter', icon: (typeof getIcon === 'function' ? getIcon('filter-off', 13) : ''), action: function () { pgClearTagFilter(); } });
  }

  // Add wireframe board page option
  if (typeof activeProduct !== 'undefined' && activeProduct === 'wireframe') {
    items.push({ label: '+ Add Board Page', action: function () {
      if (typeof addWireframeBoardPage === 'function') addWireframeBoardPage();
    }});
  }

  // ── Group actions ──
  items.push({ type: 'sep' });

  var currentGroup = pages[index] ? pages[index].groupId : null;

  items.push({ label: '+ Create New Group', icon: '◈', action: function () {
    showCustomPrompt('Group name:', 'Group ' + (_pgNextGroupId), function (name) {
      if (!name) return;
      var g = _pgCreateGroup(name);
      selIndices.forEach(function (si) { pages[si].groupId = g.id; });
      g.lastOpenedPageId = pages[index]._pageId;
      renderPageTabs();
    });
  }});

  if (pageGroups.length > 0) {
    // Move to group submenu
    pageGroups.forEach(function (g) {
      if (g.id === currentGroup) return;
      items.push({ label: '→ Move to "' + g.name + '"', indent: true, action: function () {
        selIndices.forEach(function (si) { pages[si].groupId = g.id; });
        renderPageTabs();
      }});
    });
  }

  if (currentGroup) {
    items.push({ label: 'Remove from Group', action: function () {
      selIndices.forEach(function (si) { delete pages[si].groupId; });
      renderPageTabs();
    }});
  }

  items.push({ type: 'sep' });

  items.push({ label: 'Delete', action: function () {
    if (pages.length <= 1) return;
    var msg = multiSel ? ('Delete ' + selIndices.length + ' pages?') : ('Delete "' + pages[index].label + '"?');
    showCustomConfirm(msg, function () {
      selIndices.slice().sort(function (a, b) { return b - a; }).forEach(function (si) { removePage(si); });
      _pgClearSelection();
    });
  }, disabled: pages.length <= 1 });

  items.push({ type: 'sep' });
  items.push({ label: 'View Comments', action: function () { if (typeof showPageCommentsModal === 'function') showPageCommentsModal(index); } });

  _pgRenderMenu(menu, items);
  _pgPlaceMenu(menu, e);

  var dismiss = function (ev) {
    if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', dismiss); }
  };
  setTimeout(function () { document.addEventListener('click', dismiss); }, 50);
}

/* ── Group context menu (right-click on group chip) ────────── */
function _pgShowGroupContextMenu(e, group) {
  var old = document.getElementById('page-ctx-menu');
  if (old) old.remove();

  var menu = document.createElement('div');
  menu.id = 'page-ctx-menu';
  menu.className = 'page-ctx-menu';
  menu.style.cssText = 'position:fixed;z-index:9000;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:4px;min-width:170px;box-shadow:0 8px 24px rgba(0,0,0,0.4);';

  var items = [
    { label: 'Rename Group', action: function () {
      showCustomPrompt('Group name:', group.name, function (name) {
        if (name) { group.name = name; renderPageTabs(); }
      });
    }},
    { label: group.collapsed ? 'Expand Group' : 'Collapse Group', action: function () {
      group.collapsed = !group.collapsed;
      renderPageTabs();
    }},
    { type: 'sep' },
    { label: 'Change Color', action: function () {
      _pgShowColorPicker(e, group);
    }},
    { type: 'sep' },
    { label: 'Export to Excel', action: function () {
      if (typeof GroupExcelExport !== 'undefined') GroupExcelExport.open(group);
      else if (typeof showToast === 'function') showToast('Excel export module not loaded', 'error');
    }},
    { type: 'sep' },
    { label: 'Ungroup (keep pages)', action: function () {
      pages.forEach(function (p) { if (p.groupId === group.id) delete p.groupId; });
      var gi = pageGroups.indexOf(group);
      if (gi >= 0) pageGroups.splice(gi, 1);
      renderPageTabs();
    }},
    { label: 'Delete Group + Pages', action: function () {
      var gPages = _pgPagesInGroup(group.id);
      if (gPages.length >= pages.length) { showToast('Cannot delete all pages'); return; }
      showCustomConfirm('Delete group "' + group.name + '" and its ' + gPages.length + ' pages?', function () {
        gPages.sort(function (a, b) { return b - a; }).forEach(function (pi) { removePage(pi); });
        var gi = pageGroups.indexOf(group);
        if (gi >= 0) pageGroups.splice(gi, 1);
        renderPageTabs();
      });
    }, style: 'color:var(--red)' }
  ];

  _pgRenderMenu(menu, items);
  _pgPlaceMenu(menu, e);

  var dismiss = function (ev) {
    if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', dismiss); }
  };
  setTimeout(function () { document.addEventListener('click', dismiss); }, 50);
}

/* ── Color picker for groups ──────────────────────────────── */
function _pgShowColorPicker(e, group) {
  var old = document.getElementById('pg-color-picker');
  if (old) old.remove();

  var picker = document.createElement('div');
  picker.id = 'pg-color-picker';
  picker.className = 'pg-color-picker';
  picker.style.cssText = 'position:fixed;left:' + e.clientX + 'px;top:0px;z-index:9100;visibility:hidden;';

  _pgGroupColors.forEach(function (c) {
    var swatch = document.createElement('span');
    swatch.className = 'pg-color-swatch' + (c === group.color ? ' active' : '');
    swatch.style.background = c;
    swatch.onclick = function () {
      group.color = c;
      picker.remove();
      renderPageTabs();
    };
    picker.appendChild(swatch);
  });

  document.body.appendChild(picker);

  // Position above click point so it doesn't go off-screen (tabs are at bottom)
  requestAnimationFrame(function () {
    var rect = picker.getBoundingClientRect();
    var top = e.clientY - rect.height - 10;
    if (top < 4) top = 4;
    var left = e.clientX;
    if (left + rect.width > window.innerWidth) left = window.innerWidth - rect.width - 8;
    picker.style.top = top + 'px';
    picker.style.left = left + 'px';
    picker.style.visibility = 'visible';
  });
  var dismiss = function (ev) {
    if (!picker.contains(ev.target)) { picker.remove(); document.removeEventListener('click', dismiss); }
  };
  setTimeout(function () { document.addEventListener('click', dismiss); }, 50);
}

/* ── Quick Page Navigator Dropdown ─────────────────────────── */
function _pgShowQuickNav(anchorBtn) {
  var old = document.getElementById('pg-quicknav-dropdown');
  if (old) { old.remove(); return; } // toggle off

  var drop = document.createElement('div');
  drop.id = 'pg-quicknav-dropdown';
  drop.className = 'pg-quicknav-dropdown';

  // Search input
  var searchWrap = document.createElement('div');
  searchWrap.className = 'pg-qnav-search-wrap';
  var searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Search pages...';
  searchInput.className = 'pg-qnav-search';
  searchWrap.appendChild(searchInput);
  drop.appendChild(searchWrap);

  // Content container
  var content = document.createElement('div');
  content.className = 'pg-qnav-content';
  drop.appendChild(content);

  // Track which groups are collapsed in the dropdown (separate from tab bar collapse)
  var _qnavCollapsed = {};

  function buildList(filter) {
    content.innerHTML = '';
    var lowerFilter = (filter || '').toLowerCase();
    var sortedGroups = pageGroups.slice().sort(function (a, b) { return a.order - b.order; });

    // Render groups
    sortedGroups.forEach(function (group) {
      var gPages = [];
      pages.forEach(function (p, idx) { if (p.groupId === group.id) gPages.push(idx); });
      if (gPages.length === 0) return;

      // Filter: check if group name or any page in group matches
      var matchingPages = gPages.filter(function (pi) {
        return !lowerFilter || pages[pi].label.toLowerCase().indexOf(lowerFilter) >= 0;
      });
      var groupNameMatch = !lowerFilter || group.name.toLowerCase().indexOf(lowerFilter) >= 0;
      if (!groupNameMatch && matchingPages.length === 0) return;
      var showPages = groupNameMatch ? gPages : matchingPages;

      var isCollapsed = !!_qnavCollapsed[group.id];
      // When filtering, always expand to show matches
      if (lowerFilter) isCollapsed = false;

      // Group header
      var header = document.createElement('div');
      header.className = 'pg-qnav-group-header';
      header.innerHTML =
        '<span class="pg-qnav-chevron' + (isCollapsed ? ' collapsed' : '') + '">' + (isCollapsed ? '&#9656;' : '&#9662;') + '</span>' +
        '<span class="pg-qnav-dot" style="background:' + group.color + '"></span>' +
        '<span class="pg-qnav-group-name">' + _pgEsc(group.name) + '</span>' +
        '<span class="pg-qnav-group-count">' + gPages.length + '</span>';
      header.onclick = function () {
        _qnavCollapsed[group.id] = !_qnavCollapsed[group.id];
        buildList(searchInput.value);
      };
      content.appendChild(header);

      // Pages in group (only if expanded)
      if (!isCollapsed) {
        showPages.forEach(function (pi) {
          var item = document.createElement('div');
          item.className = 'pg-qnav-item' + (pi === currentPageIndex ? ' active' : '');
          item.innerHTML =
            '<span class="pg-qnav-item-dot" style="background:' + group.color + '"></span>' +
            '<span class="pg-qnav-item-label">' + _pgEsc(pages[pi].label) + '</span>';
          item.onclick = function () {
            _pgClearSelection();
            var fromGroup = pages[currentPageIndex] ? pages[currentPageIndex].groupId : null;
            var toGroup = pages[pi].groupId || null;
            if (fromGroup !== toGroup) _pgOnGroupSwitch(fromGroup, toGroup);
            // Make sure group is expanded in tab bar
            group.collapsed = false;
            drop.remove();
            switchPage(pi);
          };
          content.appendChild(item);
        });
      }
    });

    // Ungrouped pages
    var ungrouped = [];
    pages.forEach(function (p, idx) {
      if (!p.groupId) ungrouped.push(idx);
    });
    var filteredUngrouped = ungrouped.filter(function (pi) {
      return !lowerFilter || pages[pi].label.toLowerCase().indexOf(lowerFilter) >= 0;
    });
    if (filteredUngrouped.length > 0) {
      var ugHeader = document.createElement('div');
      ugHeader.className = 'pg-qnav-section-label';
      ugHeader.textContent = 'UNGROUPED';
      content.appendChild(ugHeader);

      filteredUngrouped.forEach(function (pi) {
        var item = document.createElement('div');
        item.className = 'pg-qnav-item' + (pi === currentPageIndex ? ' active' : '');
        item.innerHTML = '<span class="pg-qnav-item-label">' + _pgEsc(pages[pi].label) + '</span>';
        item.onclick = function () {
          _pgClearSelection();
          var fromGroup = pages[currentPageIndex] ? pages[currentPageIndex].groupId : null;
          if (fromGroup) _pgOnGroupSwitch(fromGroup, null);
          drop.remove();
          switchPage(pi);
        };
        content.appendChild(item);
      });
    }

    if (content.children.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'pg-qnav-empty';
      empty.textContent = 'No pages found';
      content.appendChild(empty);
    }
  }

  buildList('');
  searchInput.addEventListener('input', function () { buildList(searchInput.value); });

  document.body.appendChild(drop);

  // Position above the button
  requestAnimationFrame(function () {
    var btnRect = anchorBtn.getBoundingClientRect();
    var dropRect = drop.getBoundingClientRect();
    var top = btnRect.top - dropRect.height - 6;
    if (top < 4) top = 4;
    var left = btnRect.left;
    if (left + dropRect.width > window.innerWidth) left = window.innerWidth - dropRect.width - 8;
    drop.style.left = left + 'px';
    drop.style.top = top + 'px';
    drop.style.visibility = 'visible';
    searchInput.focus();
  });

  // Dismiss on outside click
  var dismiss = function (ev) {
    if (!drop.contains(ev.target) && ev.target !== anchorBtn) {
      drop.remove();
      document.removeEventListener('mousedown', dismiss);
    }
  };
  setTimeout(function () { document.addEventListener('mousedown', dismiss); }, 50);

  // Escape to close
  searchInput.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') { drop.remove(); document.removeEventListener('mousedown', dismiss); }
  });
}

/* ── Reusable menu renderer ───────────────────────────────── */
function _pgRenderMenu(menu, items) {
  items.forEach(function (item) {
    if (item.type === 'sep') {
      var sep = document.createElement('div');
      sep.style.cssText = 'height:1px;background:var(--border);margin:3px 0;';
      menu.appendChild(sep);
      return;
    }
    var btn = document.createElement('button');
    btn.style.cssText = 'display:flex;align-items:center;gap:6px;width:100%;text-align:left;padding:7px 12px;background:none;border:none;color:var(--text);font-size:12px;cursor:pointer;border-radius:4px;font-family:\'DM Sans\',sans-serif;';
    if (item.style) btn.style.cssText += item.style;
    if (item.indent) btn.style.paddingLeft = '22px';
    if (item.disabled) { btn.style.opacity = '0.3'; btn.style.pointerEvents = 'none'; }
    btn.innerHTML = (item.icon ? '<span>' + item.icon + '</span>' : '') + _pgEsc(item.label);
    btn.onmouseenter = function () { btn.style.background = 'var(--surface2)'; };
    btn.onmouseleave = function () { btn.style.background = 'none'; };
    btn.onclick = function () { menu.remove(); item.action(); };
    menu.appendChild(btn);
  });
}

function updateCanvasLabel() {
  var label = document.getElementById('canvas-face-label');
  if (!label) return;
  if (pages.length > 1) {
    label.textContent = pages[currentPageIndex] ? pages[currentPageIndex].label.toUpperCase() : '';
    label.style.display = 'block';
  } else {
    label.style.display = 'none';
  }
}

// ── Legacy Compatibility ──────────────────────────────────────
// Keep frontJSON/backJSON/frontBG/backBG/currentFace in sync so
// autosave.js, export.js, import-export.js, bulk-export.js and
// three-preview.js continue to work.

function syncLegacyFaceGlobals() {
  if (pages.length >= 1 && pages[0]) {
    frontJSON = pages[0].json;
    frontBG = pages[0].bg || '#0d0d0d';
  }
  if (pages.length >= 2 && pages[1]) {
    backJSON = pages[1].json;
    backBG = pages[1].bg || '#1a1a2e';
  } else {
    backJSON = null;
    backBG = '#1a1a2e';
  }
  currentFace = currentPageIndex === 0 ? 'front' : 'back';
}

function switchFace(face) {
  if (face === 'split') {
    if (typeof enableSplitMode === 'function') enableSplitMode();
    return;
  }
  if (splitMode && typeof disableSplitMode === 'function') disableSplitMode();

  if (face === 'front') switchPage(0);
  else if (face === 'back' && pages.length > 1) switchPage(1);
}
