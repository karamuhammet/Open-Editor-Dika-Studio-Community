/* wireframe/right-panel — WF right-panel dual tab (Properties + Layers). Split from the 2652-line wireframe.js (decomposition).
   FLAT sub-module: functions stay window globals (the wireframe init + each other call them at runtime).
   Registers under canvas.wireframe. NOTE: wireframe is a paused/hidden feature — load-level verified. */

// ═════════════════════════════════════════════════════════════
// PART E: RIGHT PANEL DUAL TAB (Properties + Layers)
// ═════════════════════════════════════════════════════════════

function initRpTabs() {
  var rpanel = document.getElementById('rpanel');
  if (!rpanel || document.getElementById('rp-tab-bar')) return;

  // Create tab bar — Properties + Layout always; Layers only for wireframe
  var tabBar = document.createElement('div');
  tabBar.id = 'rp-tab-bar';
  tabBar.className = 'rp-tab-bar';
  tabBar.innerHTML =
    '<button class="rp-tab active" data-rp-tab="properties">Properties</button>' +
    '<button class="rp-tab" data-rp-tab="layout">Layout</button>' +
    '<button class="rp-tab rp-tab-layers" data-rp-tab="layers">Layers</button>';
  rpanel.insertBefore(tabBar, rpanel.firstChild);

  // Wrap existing rp-sections in properties wrap
  var propWrap = document.createElement('div');
  propWrap.id = 'rp-properties-wrap';
  propWrap.className = 'rp-properties-wrap';

  var existingSections = rpanel.querySelectorAll('#rp-fig-bar, #rp-uni-appearance, #rp-selcolors, #rp-bg-panel, .rp-section, #rp-empty, #rp-text, #rp-shape, #rp-shadow, #rp-text-fx, #rp-image, #rp-qr, #rp-barcode, #rp-effect, #rp-board, #rp-canvas-size, #rp-chart, #rp-perspective, #rp-bg-effects, #rp-design-fields, #rp-page-design-note, #rp-wf-css');
  existingSections.forEach(function(sec) {
    propWrap.appendChild(sec);
  });
  rpanel.appendChild(propWrap);

  // Safety net — a section left OUTSIDE #rp-properties-wrap ignores switchRpTab entirely and stays
  // on screen in Layout/Layers. That is exactly what happened to #rp-effect (Background > Effects >
  // gradient/glass controls followed the user across all three tabs) and #rp-barcode: both were
  // simply missing from the list above. Sweep any remaining rp-* section in, so a NEW section can
  // never leak again. Only direct children are touched; the tab bar and the wraps are skipped.
  [].slice.call(rpanel.children).forEach(function (el) {
    if (el === tabBar || el === propWrap) return;
    if (!el.id || el.id.indexOf('rp-') !== 0) return;
    /* #rp-color-wrap is the ONE rp-* element that must stay outside: it is a full-panel overlay
       that hides all three wraps AND the tab bar, so sweeping it into the properties wrap means
       openColorPanel hides its own panel and the right side goes completely blank with no Back
       button and no tab bar to escape through (measured 2026-08-07). It only ever landed here as a
       RACE - both this init and the colour picker's are polling loops, so "the picker runs after
       us" was never a guarantee. openColorPanel also moves it back out if it finds it in here. */
    if (el.id === 'rp-color-wrap') return;
    propWrap.appendChild(el);
  });

  // Create layout wrap
  var layoutWrap = document.createElement('div');
  layoutWrap.id = 'rp-layout-wrap';
  layoutWrap.className = 'rp-layout-wrap';
  layoutWrap.style.display = 'none';
  layoutWrap.innerHTML = buildLayoutPanelHTML();
  rpanel.appendChild(layoutWrap);

  // Create layers wrap
  var layersWrap = document.createElement('div');
  layersWrap.id = 'rp-layers-wrap';
  layersWrap.className = 'rp-layers-wrap';
  layersWrap.style.display = 'none';
  layersWrap.innerHTML =
    '<div class="rp-layers-header">' +
      '<span class="rp-layers-title">Layers</span>' +
      '<div class="rp-layers-header-actions">' +
        '<button class="rp-layers-add-folder" title="New Folder" onclick="_rpCreateFolder()">' +
          (typeof getIcon === 'function' ? getIcon('folderPlus', 14) : '+') +
        '</button>' +
        '<button class="rp-layers-gear" title="Wireframe Settings" onclick="openWfSettings()">' +
          (typeof getIcon === 'function' ? getIcon('gear', 14) : '⚙') +
        '</button>' +
      '</div>' +
    '</div>' +
    '<div class="rp-layers-body" id="rp-layers-body"></div>' +
    '<div class="rp-layer-ctx" id="rp-layer-ctx" style="display:none"></div>';
  rpanel.appendChild(layersWrap);

  // Tab click handler
  tabBar.addEventListener('click', function(e) {
    var btn = e.target.closest('.rp-tab');
    if (!btn) return;
    var tab = btn.dataset.rpTab;
    switchRpTab(tab);
  });

  // Wire layout panel handlers
  wireLayoutPanel();
}

// Show/hide the tab bar based on product type
function updateRpTabBarVisibility() {
  var tabBar = document.getElementById('rp-tab-bar');
  if (!tabBar) return;
  var isWf = (typeof activeProduct !== 'undefined') && activeProduct === 'wireframe';

  // Tab bar always visible; all 3 tabs always visible
  tabBar.style.display = '';

  // Show/hide wireframe gear in layers header
  var gear = document.querySelector('.rp-layers-gear');
  if (gear) gear.style.display = isWf ? '' : 'none';
}

function switchRpTab(tab) {
  var propWrap = document.getElementById('rp-properties-wrap');
  var layoutWrap = document.getElementById('rp-layout-wrap');
  var layersWrap = document.getElementById('rp-layers-wrap');
  var tabs = document.querySelectorAll('#rp-tab-bar .rp-tab');

  tabs.forEach(function(t) {
    t.classList.toggle('active', t.dataset.rpTab === tab);
  });

  if (propWrap) propWrap.style.display = (tab === 'properties') ? '' : 'none';
  if (layoutWrap) {
    layoutWrap.style.display = (tab === 'layout') ? '' : 'none';
    if (tab === 'layout' && typeof syncLayoutPanel === 'function') syncLayoutPanel();
  }
  if (layersWrap) {
    layersWrap.style.display = (tab === 'layers') ? '' : 'none';
    if (tab === 'layers') refreshInlineLayers();
  }
}

// ─── Layer Color Palette ─────────────────────────────────────
var _RP_LAYER_COLORS = {
  none: 'transparent',
  red: '#ff4444',
  orange: '#ff8c00',
  yellow: '#ffd700',
  green: '#44bb44',
  blue: '#4488ff',
  purple: '#aa44ff'
};

// ─── Ensure UID helper ───────────────────────────────────────
function _rpEnsureUid(obj) {
  if (!obj._uid) {
    if (typeof _ensureUid === 'function') { _ensureUid(obj); }
    else { obj._uid = 'uid_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6); }
  }
}

// ─── Create Folder (group marker) ────────────────────────────
function _rpCreateFolder() {
  var c = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : canvas;
  var folder = new fabric.Rect({
    left: 0, top: 0, width: 0, height: 0, fill: 'transparent',
    stroke: 'transparent', selectable: false, evented: false, visible: false,
    _rpFolder: true, _rpFolderOpen: true, _rpFolderChildren: '[]', _customName: 'New Folder'
  });
  _rpEnsureUid(folder);
  c.add(folder);
  c.renderAll();
  if (typeof snap === 'function') snap();
  refreshInlineLayers();
}

function _rpGetFolderChildren(folderObj) {
  try { return JSON.parse(folderObj._rpFolderChildren || '[]'); } catch(e) { return []; }
}
function _rpSetFolderChildren(folderObj, arr) {
  folderObj._rpFolderChildren = JSON.stringify(arr);
}
function _rpAddToFolder(folderObj, uid) {
  var arr = _rpGetFolderChildren(folderObj);
  if (arr.indexOf(uid) === -1) arr.push(uid);
  _rpSetFolderChildren(folderObj, arr);
}
function _rpRemoveFromFolder(folderObj, uid) {
  var arr = _rpGetFolderChildren(folderObj);
  var idx = arr.indexOf(uid);
  if (idx !== -1) arr.splice(idx, 1);
  _rpSetFolderChildren(folderObj, arr);
}
function _rpRemoveFromAllFolders(c, uid) {
  c.getObjects().forEach(function(o) {
    if (o._rpFolder) _rpRemoveFromFolder(o, uid);
  });
}
function _rpFindFolderOf(c, uid) {
  var objs = c.getObjects();
  for (var i = 0; i < objs.length; i++) {
    if (objs[i]._rpFolder && _rpGetFolderChildren(objs[i]).indexOf(uid) !== -1) return objs[i];
  }
  return null;
}
function _rpGetAllFolders(c) {
  return c.getObjects().filter(function(o) { return o._rpFolder; });
}

// ─── Context Menu ────────────────────────────────────────────
function _rpShowCtx(e, idx, obj) {
  e.preventDefault();
  e.stopPropagation();
  var ctx = document.getElementById('rp-layer-ctx');
  if (!ctx) return;

  var gi = function(n, s) { return (typeof getIcon === 'function') ? getIcon(n, s || 13) : ''; };
  var isLinked = !!(obj._boundImageUid || obj._isFrame);
  var isFolder = !!obj._rpFolder;
  var colorDots = '';
  Object.keys(_RP_LAYER_COLORS).forEach(function(key) {
    var clr = _RP_LAYER_COLORS[key];
    var cls = 'rp-ctx-color-dot' + ((obj._layerColor || 'none') === key ? ' active' : '');
    colorDots += '<span class="' + cls + '" data-color="' + key + '" style="background:' + (clr === 'transparent' ? 'var(--surface2)' : clr) + '"></span>';
  });

  var hasFolder = _rpGetAllFolders((typeof getActiveCanvas === 'function') ? getActiveCanvas() : canvas).length > 0;

  ctx.innerHTML =
    (isLinked ? '<div class="rp-ctx-item" data-action="detach"><span class="rp-ctx-icon">' + gi('unlock') + '</span>Detach Frame</div>' : '') +
    '<div class="rp-ctx-item" data-action="duplicate"><span class="rp-ctx-icon">' + gi('duplicate') + '</span>Duplicate</div>' +
    '<div class="rp-ctx-item" data-action="delete"><span class="rp-ctx-icon">' + gi('trash') + '</span>Delete</div>' +
    '<div class="rp-ctx-item" data-action="rename"><span class="rp-ctx-icon">' + gi('pencil') + '</span>Rename</div>' +
    '<div class="rp-ctx-item" data-action="hide"><span class="rp-ctx-icon">' + gi(obj.visible !== false ? 'eyeOff' : 'eye') + '</span>' + (obj.visible !== false ? 'Hide' : 'Show') + '</div>' +
    (!isFolder && hasFolder ? '<div class="rp-ctx-item" data-action="moveToFolder"><span class="rp-ctx-icon">' + gi('folder') + '</span>Move to Folder</div>' : '') +
    '<div class="rp-ctx-sep"></div>' +
    '<div class="rp-ctx-label">COLOR LABEL</div>' +
    '<div class="rp-ctx-colors">' + colorDots + '</div>';

  var wrap = document.getElementById('rp-layers-wrap');
  var wrapRect = wrap ? wrap.getBoundingClientRect() : { left: 0, top: 0 };
  ctx.style.left = Math.min(e.clientX - wrapRect.left, wrapRect.width - 170) + 'px';
  ctx.style.top = (e.clientY - wrapRect.top) + 'px';
  ctx.style.display = '';
  ctx.dataset.idx = idx;

  ctx.onclick = function(ev) {
    var item = ev.target.closest('[data-action]');
    var colorDot = ev.target.closest('[data-color]');
    if (item) {
      var act = item.dataset.action;
      _rpCtxAction(act, parseInt(ctx.dataset.idx));
      // Don't hide if moveToFolder — popup needs to stay open
      if (act !== 'moveToFolder') _rpHideCtx();
    } else if (colorDot) {
      _rpSetLayerColor(parseInt(ctx.dataset.idx), colorDot.dataset.color);
      _rpHideCtx();
    }
  };

  setTimeout(function() {
    document.addEventListener('click', _rpHideCtx, { once: true });
  }, 0);
}

function _rpHideCtx() {
  var ctx = document.getElementById('rp-layer-ctx');
  if (ctx) ctx.style.display = 'none';
}

function _rpCtxAction(action, idx) {
  var c = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : canvas;
  var obj = c.item(idx);
  if (!obj) return;

  switch (action) {
    case 'detach':
      if (typeof detachFrameFromImage === 'function') {
        c.setActiveObject(obj);
        detachFrameFromImage(c);
      }
      break;
    case 'duplicate':
      obj.clone(function(cloned) {
        cloned.set({ left: obj.left + 20, top: obj.top + 20 });
        c.add(cloned);
        c.setActiveObject(cloned);
        c.renderAll();
        if (typeof snap === 'function') snap();
        refreshInlineLayers();
      }, CUSTOM_PROPS);
      return;
    case 'delete':
      if (obj._rpFolder) {
        // Remove folder — children become root-level
        var children = _rpGetFolderChildren(obj);
        // No need to do anything, they just become parentless
      }
      if (obj._uid) _rpRemoveFromAllFolders(c, obj._uid);
      if (obj._boundImageUid) {
        var objs = c.getObjects();
        for (var x = 0; x < objs.length; x++) {
          if (objs[x]._isFrame && objs[x]._boundImageUid === obj._uid) {
            c.remove(objs[x]); break;
          }
        }
      }
      c.remove(obj);
      c.discardActiveObject();
      c.renderAll();
      if (typeof snap === 'function') snap();
      break;
    case 'rename':
      refreshInlineLayers();
      setTimeout(function() { _rpStartRename(idx); }, 50);
      return;
    case 'hide':
      obj.visible = !obj.visible;
      c.renderAll();
      break;
    case 'moveToFolder':
      _rpShowMoveToFolder(idx, obj);
      return;
  }
  refreshInlineLayers();
}

// ─── Move to Folder Popup ────────────────────────────────────
function _rpShowMoveToFolder(idx, obj) {
  var existing = document.getElementById('rp-move-folder-popup');
  if (existing) existing.remove();

  var c = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : canvas;
  var folders = _rpGetAllFolders(c);
  if (!folders.length) return;

  var uid = obj._uid;
  if (!uid) {
    _rpEnsureUid(obj);
    uid = obj._uid;
  }
  var currentFolder = _rpFindFolderOf(c, uid);

  var popup = document.createElement('div');
  popup.id = 'rp-move-folder-popup';
  popup.className = 'rp-move-folder-popup';

  var gi = function(n, s) { return (typeof getIcon === 'function') ? getIcon(n, s || 14) : ''; };

  var html = '<div class="rp-mf-header">Move to Folder</div>';
  html += '<div class="rp-mf-search"><input type="text" class="rp-mf-search-input" placeholder="Search folders..."></div>';
  html += '<div class="rp-mf-list">';

  // "No folder" option to remove from current folder
  html += '<div class="rp-mf-item' + (!currentFolder ? ' active' : '') + '" data-folder-action="none">' +
    '<span class="rp-mf-item-icon">' + gi('close') + '</span>' +
    '<span class="rp-mf-item-name">No Folder (Root)</span></div>';

  folders.forEach(function(f) {
    var fName = f._customName || 'Folder';
    var isCurrent = (f === currentFolder);
    html += '<div class="rp-mf-item' + (isCurrent ? ' active' : '') + '" data-folder-uid="' + (f._uid || '') + '">' +
      '<span class="rp-mf-item-icon">' + gi('folder') + '</span>' +
      '<span class="rp-mf-item-name">' + fName.replace(/</g, '&lt;') + '</span></div>';
  });
  html += '</div>';

  popup.innerHTML = html;

  // Position relative to layers wrap
  var wrap = document.getElementById('rp-layers-wrap');
  wrap.appendChild(popup);

  // Search filter
  var searchInput = popup.querySelector('.rp-mf-search-input');
  searchInput.addEventListener('input', function() {
    var q = searchInput.value.trim().toLowerCase();
    popup.querySelectorAll('.rp-mf-item').forEach(function(item) {
      var name = (item.querySelector('.rp-mf-item-name') || {}).textContent || '';
      item.style.display = (!q || name.toLowerCase().indexOf(q) !== -1) ? '' : 'none';
    });
  });
  searchInput.focus();

  // Click handler
  popup.addEventListener('click', function(ev) {
    var item = ev.target.closest('.rp-mf-item');
    if (!item) return;

    // Ensure UID
    _rpEnsureUid(obj);
    var objUid = obj._uid;

    // Remove from all folders first
    _rpRemoveFromAllFolders(c, objUid);

    if (item.dataset.folderAction === 'none') {
      // Just remove from folder, stay root
    } else {
      var fUid = item.dataset.folderUid;
      if (fUid) {
        var fObjs = c.getObjects();
        for (var fi = 0; fi < fObjs.length; fi++) {
          if (fObjs[fi]._uid === fUid && fObjs[fi]._rpFolder) {
            _rpAddToFolder(fObjs[fi], objUid);
            break;
          }
        }
      }
    }

    c.renderAll();
    if (typeof snap === 'function') snap();
    popup.remove();
    refreshInlineLayers();
  });

  // Close on outside click
  setTimeout(function() {
    document.addEventListener('click', function _closeMf(ev) {
      if (!popup.contains(ev.target)) {
        popup.remove();
        document.removeEventListener('click', _closeMf);
      }
    });
  }, 10);
}

function _rpSetLayerColor(idx, colorKey) {
  var c = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : canvas;
  var obj = c.item(idx);
  if (!obj) return;
  obj._layerColor = colorKey === 'none' ? '' : colorKey;
  c.renderAll();
  if (typeof snap === 'function') snap();
  refreshInlineLayers();
}

// ─── Double-click Rename ─────────────────────────────────────
function _rpStartRename(idx) {
  var row = document.querySelector('.rp-layer-item[data-layer-index="' + idx + '"]');
  if (!row) return;
  var nameEl = row.querySelector('.rp-layer-name');
  if (!nameEl) return;

  var c = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : canvas;
  var obj = c.item(idx);
  if (!obj) return;

  var current = nameEl.textContent;
  var input = document.createElement('input');
  input.className = 'rp-layer-rename-input';
  input.value = current;
  input.maxLength = 40;
  nameEl.textContent = '';
  nameEl.appendChild(input);
  input.focus();
  input.select();

  function finish() {
    var val = input.value.trim() || current;
    obj._customName = val;
    if (typeof snap === 'function') snap();
    refreshInlineLayers();
  }

  input.addEventListener('blur', finish);
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = current; input.blur(); }
  });
}

// ─── Drag & Drop Reorder ─────────────────────────────────────
function _rpFindRowAtY(bodyEl, y, excludeItem) {
  var rows = bodyEl.querySelectorAll('.rp-layer-item');
  for (var i = 0; i < rows.length; i++) {
    if (rows[i] === excludeItem) continue;
    var rect = rows[i].getBoundingClientRect();
    if (y >= rect.top && y <= rect.bottom) return rows[i];
  }
  return null;
}

function _rpInitDragDrop(body) {
  body.querySelectorAll('.rp-layer-item').forEach(function(item) {
    item.setAttribute('draggable', 'false');
    var grip = item.querySelector('.rp-layer-grip');
    if (!grip) return;
    grip.style.cursor = 'grab';

    grip.addEventListener('mousedown', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var dragIdx = parseInt(item.dataset.layerIndex);
      item.classList.add('rp-drag-source');
      var bodyEl = body;

      var move = function(ev) {
        bodyEl.querySelectorAll('.rp-layer-item').forEach(function(r) {
          r.classList.remove('rp-drag-over');
          r.classList.remove('rp-drag-into-folder');
        });
        var targetRow = _rpFindRowAtY(bodyEl, ev.clientY, item);
        if (targetRow) {
          if (targetRow.classList.contains('rp-layer-folder')) {
            targetRow.classList.add('rp-drag-into-folder');
          } else {
            targetRow.classList.add('rp-drag-over');
          }
        }
      };

      var up = function(ev) {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        item.classList.remove('rp-drag-source');
        bodyEl.querySelectorAll('.rp-layer-item').forEach(function(r) {
          r.classList.remove('rp-drag-over');
          r.classList.remove('rp-drag-into-folder');
        });

        var targetRow = _rpFindRowAtY(bodyEl, ev.clientY, item);
        if (!targetRow) return;

        var dropIdx = parseInt(targetRow.dataset.layerIndex);
        if (isNaN(dropIdx) || dropIdx === dragIdx) return;

        var c = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : canvas;
        var dragObj = c.item(dragIdx);
        if (!dragObj) return;

        // Dropping onto a folder → add to that folder
        var dropObj = c.item(dropIdx);
        if (dropObj && dropObj._rpFolder && !dragObj._rpFolder) {
          _rpEnsureUid(dragObj);
          _rpRemoveFromAllFolders(c, dragObj._uid);
          _rpAddToFolder(dropObj, dragObj._uid);
          if (!dropObj._rpFolderOpen) dropObj._rpFolderOpen = true;
          c.renderAll();
          if (typeof snap === 'function') snap();
          refreshInlineLayers();
          return;
        }

        // Normal reorder
        dragObj.moveTo(dropIdx);
        c.renderAll();
        if (typeof snap === 'function') snap();
        refreshInlineLayers();
      };

      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  });
}

// ─── Inline Layers Panel ─────────────────────────────────────

function refreshInlineLayers() {
  var body = document.getElementById('rp-layers-body');
  if (!body) return;
  body.innerHTML = '';
  _rpHideCtx();

  if (typeof pages !== 'undefined' && pages[currentPageIndex] && typeof pageHasSlideDeck === 'function' && pageHasSlideDeck(pages[currentPageIndex])) {
    var deck = pages[currentPageIndex]._slideDeck;
    var slideIdx = deck && typeof deck.activeSlideIndex === 'number' ? deck.activeSlideIndex : 0;
    var slideCount = deck && deck.slides ? deck.slides.length : 0;
    var label = document.createElement('div');
    label.className = 'structure-page-indicator';
    label.textContent = 'Slide ' + (slideIdx + 1) + '/' + slideCount;
    body.appendChild(label);
  }

  var c = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : canvas;
  var objects = c.getObjects();
  var activeObj = c.getActiveObject();
  var gi = function(n, s) { return (typeof getIcon === 'function') ? getIcon(n, s || 14) : ''; };

  /* ── Build frame↔image link map ── */
  var skipSet = {};        // index → true
  var imgChildren = {};    // index → [frameIndex, ...]

  for (var fi = 0; fi < objects.length; fi++) {
    var fo = objects[fi];
    if (fo._isFrame && !fo._isClippedImage && fo._boundImageUid) {
      for (var si = 0; si < objects.length; si++) {
        if (objects[si]._uid === fo._boundImageUid && si !== fi) {
          if (!imgChildren[si]) imgChildren[si] = [];
          imgChildren[si].push(fi);
          skipSet[fi] = true;
          break;
        }
      }
    }
  }

  /* ── Build folder membership map: uid → folderObj ── */
  var uidToFolder = {};
  var folderList = [];
  for (var oi = 0; oi < objects.length; oi++) {
    if (objects[oi]._rpFolder) {
      folderList.push(oi);
      var ch = _rpGetFolderChildren(objects[oi]);
      for (var ci = 0; ci < ch.length; ci++) uidToFolder[ch[ci]] = objects[oi];
    }
  }

  /* ── Helper to build a single layer row ── */
  function buildRow(i, obj, indent) {
    if (skipSet[i]) return null;
    if (obj._isPerspHandle || obj._isPerspOutline || obj._isPerspWarp ||
        obj._isPeHandle || obj._isPeOutline ||
        obj.isSmartGuide || obj._isGridLine || obj._isGuide || obj._isPattern ||
        obj._isWbLabel || obj._isCropDim || obj._isCropGrid || obj._isCropRect ||
        obj._isGridPlusBtn || obj._isGridHighlight || obj.excludeFromExport) return null;
    var info = (typeof getLayerDisplayInfo === 'function') ? getLayerDisplayInfo(obj) : { name:'Object', typeIcon:'rectangle' };
    var displayName = obj._customName || info.name;
    var isActive = (obj === activeObj);
    var linkedFrameIdxs = imgChildren[i] || null;
    var isFolder = !!obj._rpFolder;

    var item = document.createElement('div');
    item.className = 'rp-layer-item';
    if (isActive) item.className += ' active';
    if (obj.visible === false && !isFolder) item.className += ' hidden-layer';
    if (!obj.selectable && !isFolder) item.className += ' locked';
    if (linkedFrameIdxs) item.className += ' rp-layer-linked';
    if (isFolder) item.className += ' rp-layer-folder';
    item.dataset.layerIndex = i;

    if (indent) item.style.paddingLeft = (10 + indent * 16) + 'px';

    // Color label
    var lc = obj._layerColor;
    if (lc && _RP_LAYER_COLORS[lc]) {
      item.style.borderLeftColor = _RP_LAYER_COLORS[lc];
      item.style.borderLeftWidth = '3px';
    }

    if (isFolder) {
      var fOpen = obj._rpFolderOpen !== false;
      var chevron = fOpen ? '▾' : '▸';
      item.innerHTML =
        '<div class="rp-layer-grip">' + gi('grip', 10) + '</div>' +
        '<span class="rp-folder-chevron" data-folder-idx="' + i + '">' + chevron + '</span>' +
        '<div class="rp-layer-icon">' + gi('folder') + '</div>' +
        '<div class="rp-layer-name" title="' + displayName.replace(/"/g, '&quot;') + '">' + displayName + '</div>' +
        '<button class="rp-layer-vis" data-idx="' + i + '" style="visibility:hidden"></button>' +
        '<button class="rp-layer-lock" data-idx="' + i + '" style="visibility:hidden"></button>';
    } else {
      var iconHtml = gi(info.typeIcon);
      var eyeHtml = gi(obj.visible !== false ? 'eye' : 'eyeOff');
      var lockHtml = gi(obj.selectable !== false ? 'unlock' : 'lock');

      var leftIcons = '';
      if (linkedFrameIdxs && linkedFrameIdxs.length > 0) {
        var fIdx = linkedFrameIdxs[0];
        var fInfo = (typeof getLayerDisplayInfo === 'function') ? getLayerDisplayInfo(objects[fIdx]) : { typeIcon:'frame' };
        leftIcons =
          '<div class="rp-layer-icon rp-layer-frame-icon">' + gi(fInfo.typeIcon) + '</div>' +
          '<div class="rp-layer-chain">' + gi('split', 10) + '</div>' +
          '<div class="rp-layer-icon">' + iconHtml + '</div>';
      } else {
        leftIcons = '<div class="rp-layer-icon">' + iconHtml + '</div>';
      }

      item.innerHTML =
        '<div class="rp-layer-grip">' + gi('grip', 10) + '</div>' +
        leftIcons +
        '<div class="rp-layer-name" title="' + displayName.replace(/"/g, '&quot;') + '">' + displayName + '</div>' +
        '<button class="rp-layer-vis" data-idx="' + i + '">' + eyeHtml + '</button>' +
        '<button class="rp-layer-lock" data-idx="' + i + '">' + lockHtml + '</button>';
    }

    // Click to select (folders toggle open/close, objects select)
    (function(idx, frameIdxs, isF) {
      item.addEventListener('click', function(e) {
        if (e.target.closest('.rp-layer-vis') || e.target.closest('.rp-layer-lock')) return;
        if (e.target.closest('.rp-folder-chevron') || isF) {
          var fObj = c.item(idx);
          if (fObj && fObj._rpFolder) {
            fObj._rpFolderOpen = !fObj._rpFolderOpen;
            refreshInlineLayers();
          }
          return;
        }
        var cc = c;
        var targetIdx = (frameIdxs && (e.ctrlKey || e.metaKey)) ? frameIdxs[0] : idx;
        cc.setActiveObject(cc.item(targetIdx));
        cc.renderAll();
        refreshInlineLayers();
      });
    })(i, linkedFrameIdxs, isFolder);

    // Double-click to rename
    (function(idx) {
      item.addEventListener('dblclick', function(e) {
        if (e.target.closest('.rp-layer-vis') || e.target.closest('.rp-layer-lock')) return;
        e.preventDefault();
        _rpStartRename(idx);
      });
    })(i);

    // Right-click context menu
    (function(idx, o) {
      item.addEventListener('contextmenu', function(e) {
        _rpShowCtx(e, idx, o);
      });
    })(i, obj);

    return item;
  }

  /* ── Render layers: folders first with children, then root items ── */
  var rendered = {};

  // Reverse order (top first)
  for (var i = objects.length - 1; i >= 0; i--) {
    if (skipSet[i]) continue;
    var obj = objects[i];

    // Skip items that belong to a folder (rendered under folder)
    if (obj._uid && uidToFolder[obj._uid] && !obj._rpFolder) continue;

    if (obj._rpFolder) {
      // Render folder row
      var fRow = buildRow(i, obj, 0);
      if (fRow) {
        body.appendChild(fRow);
        rendered[i] = true;
      }

      // Render children if open
      if (obj._rpFolderOpen !== false) {
        var childUids = _rpGetFolderChildren(obj);
        for (var ci = 0; ci < childUids.length; ci++) {
          for (var cj = 0; cj < objects.length; cj++) {
            if (objects[cj]._uid === childUids[ci] && !skipSet[cj]) {
              var cRow = buildRow(cj, objects[cj], 1);
              if (cRow) { body.appendChild(cRow); rendered[cj] = true; }
              break;
            }
          }
        }
      }
    } else {
      // ── Grid Layout: expandable tree with cell rows ──
      if (obj._isGridLayout && obj._cells) {
        (function(gridIdx, gridObj) {
          var isGridOpen = gridObj._rpGridOpen !== false;
          var gridInfo = (typeof getLayerDisplayInfo === 'function') ? getLayerDisplayInfo(gridObj) : { name:'Grid', typeIcon:'grid' };
          var gridName = gridObj._customName || gridInfo.name;
          var isGActive = (gridObj === activeObj);
          var eyeH = gi(gridObj.visible !== false ? 'eye' : 'eyeOff');
          var lockH = gi(gridObj.selectable !== false ? 'unlock' : 'lock');

          var gridRow = document.createElement('div');
          gridRow.className = 'rp-layer-item rp-layer-grid-header';
          if (isGActive) gridRow.className += ' active';
          gridRow.dataset.layerIndex = gridIdx;

          var lc = gridObj._layerColor;
          if (lc && _RP_LAYER_COLORS[lc]) {
            gridRow.style.borderLeftColor = _RP_LAYER_COLORS[lc];
            gridRow.style.borderLeftWidth = '3px';
          }

          gridRow.innerHTML =
            '<div class="rp-layer-grip">' + gi('grip', 10) + '</div>' +
            '<span class="rp-grid-chevron">' + (isGridOpen ? '\u25be' : '\u25b8') + '</span>' +
            '<div class="rp-layer-icon">' + gi(gridInfo.typeIcon) + '</div>' +
            '<div class="rp-layer-name" title="' + gridName.replace(/"/g, '&quot;') + '">' + gridName + '</div>' +
            '<button class="rp-layer-vis" data-idx="' + gridIdx + '">' + eyeH + '</button>' +
            '<button class="rp-layer-lock" data-idx="' + gridIdx + '">' + lockH + '</button>';

          var chevronEl = gridRow.querySelector('.rp-grid-chevron');
          chevronEl.addEventListener('click', function(e) {
            e.stopPropagation();
            gridObj._rpGridOpen = !gridObj._rpGridOpen;
            refreshInlineLayers();
          });

          gridRow.addEventListener('click', function(e) {
            if (e.target.closest('.rp-layer-vis') || e.target.closest('.rp-layer-lock') || e.target.closest('.rp-grid-chevron')) return;
            c.setActiveObject(gridObj);
            c.renderAll();
            refreshInlineLayers();
          });

          gridRow.addEventListener('dblclick', function(e) {
            if (e.target.closest('.rp-layer-vis') || e.target.closest('.rp-layer-lock')) return;
            e.preventDefault();
            _rpStartRename(gridIdx);
          });

          gridRow.addEventListener('contextmenu', function(e) {
            _rpShowCtx(e, gridIdx, gridObj);
          });

          body.appendChild(gridRow);
          rendered[gridIdx] = true;

          // Render cell rows if expanded
          if (isGridOpen) {
            var cells = gridObj._cells || [];
            var gridChildren = typeof gridObj.getObjects === 'function' ? gridObj.getObjects() : [];
            for (var ci2 = 0; ci2 < cells.length; ci2++) {
              (function(cellMeta, cellIndex) {
                var cellRow2 = cellMeta.row, cellCol2 = cellMeta.col;
                var cellLabel2 = 'Cell (' + (cellRow2 + 1) + ',' + (cellCol2 + 1) + ')';

                // Find child image for this cell
                var cellImg2 = null;
                for (var gi2 = 0; gi2 < gridChildren.length; gi2++) {
                  if (gridChildren[gi2]._isGridCellImage &&
                      gridChildren[gi2]._gridCellRow === cellRow2 &&
                      gridChildren[gi2]._gridCellCol === cellCol2) {
                    cellImg2 = gridChildren[gi2];
                    break;
                  }
                }

                var cellItem2 = document.createElement('div');
                cellItem2.className = 'rp-layer-item rp-layer-grid-cell';
                cellItem2.dataset.gridIdx = String(gridIdx);
                cellItem2.dataset.cellRow = String(cellRow2);
                cellItem2.dataset.cellCol = String(cellCol2);
                cellItem2.style.paddingLeft = '28px';

                var cellIcon2 = cellImg2 ? gi('image', 12) : gi('rectangle', 12);
                var cellDisplayName = cellImg2 ? (cellLabel2 + ' \u2014 Image') : cellLabel2;

                cellItem2.innerHTML =
                  '<div class="rp-layer-grip" style="visibility:hidden">' + gi('grip', 10) + '</div>' +
                  '<div class="rp-layer-icon">' + cellIcon2 + '</div>' +
                  '<div class="rp-layer-name">' + cellDisplayName + '</div>' +
                  (cellImg2 ? '<button class="rp-layer-cell-remove" title="Remove from cell" style="color:#e55;padding:2px 4px;background:none;border:none;cursor:pointer;font-size:11px">' + gi('close', 10) + '</button>' : '');

                // Click → select grid + show toolbar for cell
                cellItem2.addEventListener('click', function(e) {
                  if (e.target.closest('.rp-layer-cell-remove')) return;
                  c.setActiveObject(gridObj);
                  c.renderAll();
                  if (typeof _glShowGridToolbar === 'function') _glShowGridToolbar(gridObj);
                  if (typeof _glUpdateToolbar === 'function') _glUpdateToolbar(gridObj, cellMeta);
                  // Highlight cell on canvas
                  if (typeof _glShowCellHighlight === 'function') {
                    var cvs = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : canvas;
                    _glShowCellHighlight(cvs, gridObj, cellMeta);
                  }
                  // Highlight in layers
                  document.querySelectorAll('.rp-layer-grid-cell').forEach(function(el) { el.classList.remove('active'); });
                  cellItem2.classList.add('active');
                });

                // Right-click → cell context menu
                cellItem2.addEventListener('contextmenu', function(ev) {
                  ev.preventDefault();
                  ev.stopPropagation();
                  if (typeof _showCellLayerContextMenu === 'function') {
                    _showCellLayerContextMenu(ev, gridObj, cellMeta, cellImg2);
                  }
                });

                // Remove button
                var rmBtn2 = cellItem2.querySelector('.rp-layer-cell-remove');
                if (rmBtn2) {
                  rmBtn2.addEventListener('click', function(ev) {
                    ev.stopPropagation();
                    if (typeof _removeCellContent === 'function') _removeCellContent(gridObj, cellMeta);
                    refreshInlineLayers();
                  });
                }

                body.appendChild(cellItem2);
              })(cells[ci2], ci2);
            }
          }
        })(i, obj);
        continue;
      }

      // Root layer (not in any folder)
      var row = buildRow(i, obj, 0);
      if (row) { body.appendChild(row); rendered[i] = true; }
    }
  }

  // Visibility toggle
  body.querySelectorAll('.rp-layer-vis').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var cc = c;
      var idx = parseInt(btn.dataset.idx);
      var obj = cc.item(idx);
      if (!obj) return;
      obj.visible = !obj.visible;
      cc.renderAll();
      refreshInlineLayers();
    });
  });

  // Lock toggle
  body.querySelectorAll('.rp-layer-lock').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var cc = c;
      var idx = parseInt(btn.dataset.idx);
      var obj = cc.item(idx);
      if (!obj) return;
      var isLocked = !obj.selectable;
      obj.selectable = isLocked;
      obj.evented = isLocked;
      cc.renderAll();
      refreshInlineLayers();
    });
  });

  /* ── Background Image row (always at bottom) ── */
  if (c.backgroundImage) {
    var bgRow = document.createElement('div');
    bgRow.className = 'rp-layer-item rp-layer-bg-image';
    bgRow.style.cssText = 'border-top:1px solid var(--border);margin-top:4px;padding-top:6px;opacity:0.85;cursor:default';

    var bgIconHtml = gi('image');
    bgRow.innerHTML =
      '<div class="rp-layer-grip" style="visibility:hidden"></div>' +
      '<div class="rp-layer-icon">' + bgIconHtml + '</div>' +
      '<div class="rp-layer-name" style="font-style:italic;flex:1">Background Image</div>' +
      '<select class="rp-bg-pos-select" title="Position" style="font-size:9px;background:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:3px;padding:1px 2px;cursor:pointer;max-width:70px">' +
        '<option value="cover">Cover</option>' +
        '<option value="contain">Contain</option>' +
        '<option value="stretch">Stretch</option>' +
        '<option value="top-left">Top Left</option>' +
        '<option value="top-center">Top Center</option>' +
        '<option value="top-right">Top Right</option>' +
        '<option value="center">Center</option>' +
        '<option value="bottom-left">Bottom Left</option>' +
        '<option value="bottom-center">Bottom Center</option>' +
        '<option value="bottom-right">Bottom Right</option>' +
      '</select>' +
      '<button class="rp-layer-vis rp-bg-remove" title="Remove Background" style="color:var(--red)">' + gi('close', 12) + '</button>';

    body.appendChild(bgRow);

    var posSelect = bgRow.querySelector('.rp-bg-pos-select');
    if (posSelect) {
      posSelect.value = window._bgImagePosition || 'cover';
      posSelect.addEventListener('change', function() {
        if (typeof _applyBgImagePosition === 'function') {
          _applyBgImagePosition(c, posSelect.value);
          if (typeof snap === 'function') snap();
        }
      });
      posSelect.addEventListener('click', function(e) { e.stopPropagation(); });
    }

    var removeBtn = bgRow.querySelector('.rp-bg-remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (typeof ctxAction === 'function') ctxAction('removeBg');
      });
    }
  }

  // Init drag & drop on grips
  _rpInitDragDrop(body);
}


if (window.cc && cc.modules) cc.modules.register({ id: 'right-panel', parent: 'canvas.wireframe', title: 'Wireframe: right-panel', mount: function(){}, unmount: function(){} });
