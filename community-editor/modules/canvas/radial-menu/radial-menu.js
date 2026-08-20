/* ============================================================
   Radial Tool Menu — Compact Arc Style
   A tight C-shaped arc menu with ~8-10 icon slots.
   Two modes:
     1) Pin toggle (Alt+M) — persistent on screen, draggable
     2) Quick show (Alt+Shift+M) — appears at cursor, auto-dismiss
   Settings integration for slot assignment (max 10 slots).
   ============================================================ */

(function () {
  'use strict';

  var RM_MAX_SLOTS = 10;
  var RM_ARC_DEG = 220;     // C-arc sweep
  var RM_ARC_START = 160;   // start angle — opens leftward/down

  /* ── Available actions ──────────────────────────────────── */
  var RM_ACTIONS = {
    // Panels
    'panel-templates':   { label: 'Templates',   icon: 'templates',  fn: function () { if (typeof openFlyout === 'function') openFlyout('templates'); } },
    'panel-text':        { label: 'Text',         icon: 'text',       fn: function () { if (typeof openFlyout === 'function') openFlyout('text'); } },
    'panel-background':  { label: 'Background',   icon: 'background', fn: function () { if (typeof openFlyout === 'function') openFlyout('background'); } },
    'panel-icons':       { label: 'Icons',         icon: 'icons',      fn: function () { if (typeof openFlyout === 'function') openFlyout('icons'); } },
    'panel-shape':       { label: 'Shapes',        icon: 'shape',      fn: function () { if (typeof openFlyout === 'function') openFlyout('shape'); } },
    'panel-images':      { label: 'Images',        icon: 'images',     fn: function () { if (typeof openFlyout === 'function') openFlyout('images'); } },
    'panel-patterns':    { label: 'Patterns',      icon: 'patterns',   fn: function () { if (typeof openFlyout === 'function') openFlyout('patterns'); } },
    'panel-charts':      { label: 'Charts',        icon: 'charts',     fn: function () { if (typeof openFlyout === 'function') openFlyout('charts'); } },

    // Tools
    'tool-brush':        { label: 'Brush',         icon: 'droplet',    fn: function () { if (typeof activateBrushTool === 'function') activateBrushTool(); } },
    'tool-pen':          { label: 'Pen',           icon: 'pencil',     fn: function () { if (typeof activatePenTool === 'function') activatePenTool('pen'); } },
    'tool-pen-freeform': { label: 'Freeform Pen',  icon: 'wave',       fn: function () { if (typeof activatePenTool === 'function') activatePenTool('freeform'); } },
    'tool-pen-spline':   { label: 'Spline Pen',    icon: 'spiral',     fn: function () { if (typeof activatePenTool === 'function') activatePenTool('curvature'); } },
    'tool-pen-line':     { label: 'Line Tool',     icon: 'line',       fn: function () { if (typeof activatePenTool === 'function') activatePenTool('line'); } },
    'tool-crop':         { label: 'Crop',          icon: 'frame',      fn: function () { if (typeof enterCropMode === 'function') enterCropMode(); } },
    'tool-remove-bg':    { label: 'Remove BG',     icon: 'eyeOff',     fn: function () { if (typeof removeImageBg === 'function') removeImageBg(); } },

    // Quick add
    'add-text':          { label: 'Add Text',      icon: 'text',       fn: function () { _rmAddText(); } },
    'add-image':         { label: 'Upload Image',  icon: 'images',     fn: function () { var inp = document.getElementById('logo-file'); if (inp) inp.click(); } },
    'add-rect':          { label: 'Rectangle',     icon: 'rectangle',  fn: function () { _rmAddShape('rect'); } },
    'add-circle':        { label: 'Circle',        icon: 'circle',     fn: function () { _rmAddShape('circle'); } },
    'add-star':          { label: 'Star',           icon: 'star',       fn: function () { _rmAddShape('star'); } },

    // Actions
    'action-export':     { label: 'Share',        icon: 'share',      fn: function () { if (typeof toggleShareMenu === 'function') toggleShareMenu(); } },
    'action-duplicate':  { label: 'Duplicate',     icon: 'duplicate',  fn: function () { var c = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas; var o = c && c.getActiveObject(); if (o) { o.clone(function (cl) { cl.set({ left: o.left + 20, top: o.top + 20 }); c.add(cl); c.setActiveObject(cl); c.renderAll(); if (typeof snap === 'function') snap(); }); } } },
    'action-delete':     { label: 'Delete',        icon: 'trash',      fn: function () { if (typeof delSelected === 'function') delSelected(); } },
    'action-layers':     { label: 'Layers',        icon: 'layers',     fn: function () { if (typeof toggleStructurePanel === 'function') toggleStructurePanel(); } },
    'action-3d':         { label: '3D Preview',    icon: 'eye',        fn: function () { if (typeof toggle3DPreview === 'function') toggle3DPreview(); } },
    'action-settings':   { label: 'Settings',      icon: 'gear',       fn: function () { if (typeof openSettingsScreen === 'function') openSettingsScreen(); } },
    'action-board':      { label: 'Board',         icon: 'whiteboard', fn: function () { if (typeof showBoardConfirm === 'function') showBoardConfirm(); } },
    'action-comments':   { label: 'Comments',      icon: 'info',       fn: function () { if (typeof toggleCommentPanel === 'function') toggleCommentPanel(); } },
    'action-add-comment':{ label: 'Add Comment',    icon: 'plus',       fn: function () { if (typeof enterCommentMode === 'function') enterCommentMode(); } }
  };

  /* ── Categories for settings dropdown ───────────────────── */
  var RM_CATEGORIES = [
    { id: 'panels',  label: 'Panels',  keys: ['panel-templates','panel-text','panel-background','panel-icons','panel-shape','panel-images','panel-patterns','panel-charts'] },
    { id: 'tools',   label: 'Tools',   keys: ['tool-brush','tool-pen','tool-pen-freeform','tool-pen-spline','tool-pen-line','tool-crop','tool-remove-bg'] },
    { id: 'add',     label: 'Add',     keys: ['add-text','add-image','add-rect','add-circle','add-star'] },
    { id: 'actions', label: 'Actions', keys: ['action-export','action-duplicate','action-delete','action-layers','action-3d','action-settings','action-board','action-comments','action-add-comment'] }
  ];

  /* ── State ──────────────────────────────────────────────── */
  var _rmEl = null;
  var _rmOpen = false;
  var _rmPinned = false;
  var _rmQuickTimer = null;
  var _rmDragOfs = null;
  var _rmDragging = false;

  /* ── Settings (persisted) ───────────────────────────────── */
  var _rmDefaults = [
    'panel-text', 'panel-shape', 'panel-images', 'tool-brush',
    'action-export', 'action-delete', 'action-layers', 'add-text'
  ];

  var _rmSettings = {
    slots: _rmDefaults.slice(),
    quickDuration: 3000
  };

  var _STORAGE_KEY = 'dika_radialMenu';

  function _rmLoad() {
    try {
      var s = localStorage.getItem(_STORAGE_KEY);
      if (s) {
        var o = JSON.parse(s);
        if (o.slots) _rmSettings.slots = o.slots.slice(0, RM_MAX_SLOTS);
        if (o.quickDuration) _rmSettings.quickDuration = o.quickDuration;
      }
    } catch (e) {}
  }
  function _rmSave() {
    try { localStorage.setItem(_STORAGE_KEY, JSON.stringify(_rmSettings)); } catch (e) {}
  }

  /* ── Shape / text helpers ───────────────────────────────── */
  function _rmAddShape(type) {
    var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
    if (!cvs) return;
    var obj, fill = '#f2ff58', stroke = '#ffffff';
    if (type === 'rect')   obj = new fabric.Rect({ width: 120, height: 80, rx: 4, ry: 4, fill: fill, stroke: stroke, strokeWidth: 1 });
    if (type === 'circle') obj = new fabric.Circle({ radius: 50, fill: fill, stroke: stroke, strokeWidth: 1 });
    if (type === 'star') {
      var pts = [], or = 50, ir = 20;
      for (var i = 0; i < 10; i++) { var r = i % 2 === 0 ? or : ir; var a = (Math.PI / 2 * 3) + (i * Math.PI / 5); pts.push({ x: Math.cos(a) * r + 50, y: Math.sin(a) * r + 50 }); }
      obj = new fabric.Polygon(pts, { fill: fill, stroke: stroke, strokeWidth: 1 });
    }
    if (obj && typeof addToCenter === 'function') addToCenter(obj);
  }

  function _rmAddText() {
    var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
    if (!cvs) return;
    var t = new fabric.IText('Text', { fontSize: 32, fontFamily: 'DM Sans', fill: '#ffffff', fontWeight: 400, editable: true });
    if (typeof addToCenter === 'function') addToCenter(t);
    cvs.setActiveObject(t);
    t.enterEditing();
  }

  /* ── Build DOM — compact C-arc ──────────────────────────── */
  function _rmBuild() {
    if (_rmEl) return;
    _rmEl = document.createElement('div');
    _rmEl.id = 'radial-menu';
    _rmEl.className = 'rm-container';

    // Hub (tiny center dot)
    var hub = document.createElement('div');
    hub.className = 'rm-hub';
    hub.id = 'rm-hub';
    hub.innerHTML = '<div class="rm-hub-icon">' + (typeof getIcon === 'function' ? getIcon('gear', 23) : '⚙') + '</div>';
    _rmEl.appendChild(hub);

    // Arc track (dark background ring)
    var track = document.createElement('div');
    track.className = 'rm-track';
    track.id = 'rm-track';
    _rmEl.appendChild(track);

    // Slot container
    var ring = document.createElement('div');
    ring.className = 'rm-ring';
    ring.id = 'rm-ring';
    _rmEl.appendChild(ring);

    document.body.appendChild(_rmEl);

    hub.addEventListener('mousedown', _rmHubDown);
    hub.addEventListener('click', _rmHubClick);

    _rmRenderSlots();
  }

  function _rmRenderSlots() {
    var ring = document.getElementById('rm-ring');
    if (!ring) return;
    ring.innerHTML = '';

    var slots = _rmSettings.slots;
    var n = Math.min(slots.length, RM_MAX_SLOTS);
    if (!n) return;

    var radius = 81;
    var arcRad = RM_ARC_DEG * Math.PI / 180;
    var startRad = RM_ARC_START * Math.PI / 180;

    for (var i = 0; i < n; i++) {
      var actionId = slots[i];
      var act = RM_ACTIONS[actionId];
      if (!act) continue;

      var t = n > 1 ? i / (n - 1) : 0.5;
      var angle = startRad + t * arcRad;
      var x = Math.cos(angle) * radius;
      var y = Math.sin(angle) * radius;

      var btn = document.createElement('button');
      btn.className = 'rm-slot';
      btn.dataset.rmAction = actionId;
      btn.title = act.label;
      btn.style.cssText = '--rm-x:' + x.toFixed(1) + 'px;--rm-y:' + y.toFixed(1) + 'px;--rm-delay:' + (i * 20) + 'ms;';
      btn.innerHTML = typeof getIcon === 'function' ? getIcon(act.icon, 24) : '?';
      btn.addEventListener('click', (function (a) {
        return function (e) {
          e.stopPropagation();
          _rmClose();
          if (a.fn) a.fn();
        };
      })(act));
      ring.appendChild(btn);
    }

    // Update track arc
    _rmUpdateTrack(n);
  }

  function _rmUpdateTrack(n) {
    var track = document.getElementById('rm-track');
    if (!track) return;
    // SVG arc background
    var r = 81;
    var startRad = RM_ARC_START * Math.PI / 180;
    var endRad = startRad + RM_ARC_DEG * Math.PI / 180;
    var x1 = Math.cos(startRad) * r;
    var y1 = Math.sin(startRad) * r;
    var x2 = Math.cos(endRad) * r;
    var y2 = Math.sin(endRad) * r;
    var large = RM_ARC_DEG > 180 ? 1 : 0;
    track.innerHTML = '<svg width="208" height="208" viewBox="-104 -104 208 208" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)">' +
      '<path d="M ' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x2.toFixed(1) + ' ' + y2.toFixed(1) + '" fill="none" stroke="rgba(20,20,24,0.92)" stroke-width="48" stroke-linecap="round"/>' +
      '</svg>';
  }

  /* ── Open / Close ───────────────────────────────────────── */
  function _rmOpen_() {
    if (!_rmEl) _rmBuild();
    _rmEl.classList.add('rm-visible');
    requestAnimationFrame(function () { _rmEl.classList.add('rm-expanded'); });
    _rmOpen = true;
  }

  function _rmClose() {
    if (!_rmEl) return;
    _rmEl.classList.remove('rm-expanded');
    if (!_rmPinned) {
      setTimeout(function () { if (!_rmOpen) _rmEl.classList.remove('rm-visible'); }, 200);
    }
    _rmOpen = false;
    if (_rmQuickTimer) { clearTimeout(_rmQuickTimer); _rmQuickTimer = null; }
  }

  function _rmToggle() { if (_rmOpen) _rmClose(); else _rmOpen_(); }

  /* ── Mode 1: Pin toggle ─────────────────────────────────── */
  function rmPin() {
    if (!_rmEl) _rmBuild();
    _rmPinned = true;
    _rmEl.classList.add('rm-visible', 'rm-pinned');
    if (!_rmEl.dataset.placed) {
      _rmEl.style.left = (window.innerWidth / 2 - 26) + 'px';
      _rmEl.style.top = (window.innerHeight / 2 - 26) + 'px';
      _rmEl.dataset.placed = '1';
    }
  }

  function rmUnpin() {
    _rmPinned = false;
    _rmClose();
    if (_rmEl) _rmEl.classList.remove('rm-pinned', 'rm-visible', 'rm-expanded');
  }

  function rmTogglePin() { if (_rmPinned) rmUnpin(); else rmPin(); }

  /* ── Mode 2: Quick show ─────────────────────────────────── */
  function rmQuickShow(x, y) {
    if (!_rmEl) _rmBuild();
    var cx = typeof x === 'number' ? x : window.innerWidth / 2;
    var cy = typeof y === 'number' ? y : window.innerHeight / 2;
    _rmEl.style.left = (cx - 26) + 'px';
    _rmEl.style.top = (cy - 26) + 'px';
    _rmEl.dataset.placed = '1';
    _rmOpen_();
    if (_rmQuickTimer) clearTimeout(_rmQuickTimer);
    _rmQuickTimer = setTimeout(function () { _rmClose(); }, _rmSettings.quickDuration);
  }

  /* ── Hub drag ───────────────────────────────────────────── */
  var _rmClickStart = 0;

  function _rmHubDown(e) {
    if (e.button !== 0) return;
    _rmClickStart = Date.now();
    _rmDragOfs = { x: e.clientX - _rmEl.offsetLeft, y: e.clientY - _rmEl.offsetTop };
    _rmDragging = false;
    document.addEventListener('mousemove', _rmHubMove);
    document.addEventListener('mouseup', _rmHubUp);
    e.preventDefault();
  }

  function _rmHubMove(e) {
    if (!_rmDragOfs) return;
    _rmDragging = true;
    _rmEl.style.left = (e.clientX - _rmDragOfs.x) + 'px';
    _rmEl.style.top = (e.clientY - _rmDragOfs.y) + 'px';
  }

  function _rmHubUp() {
    document.removeEventListener('mousemove', _rmHubMove);
    document.removeEventListener('mouseup', _rmHubUp);
    _rmDragOfs = null;
    if (!_rmDragging && Date.now() - _rmClickStart < 250) _rmToggle();
    _rmDragging = false;
  }

  function _rmHubClick(e) { e.stopPropagation(); }

  /* ── Click outside to close ─────────────────────────────── */
  document.addEventListener('mousedown', function (e) {
    if (!_rmOpen || !_rmEl) return;
    if (_rmEl.contains(e.target)) return;
    _rmClose();
  });

  /* ── Settings section ───────────────────────────────────── */
  function buildRadialMenuSection() {
    var durationBtns = [2000, 3000, 4000, 5000].map(function (ms) {
      var active = _rmSettings.quickDuration === ms;
      return '<button class="rm-set-dur" data-rm-dur="' + ms + '" style="padding:5px 12px;border-radius:6px;border:1px solid var(--border);background:' + (active ? 'var(--gold)' : 'var(--surface2)') + ';color:' + (active ? '#111' : 'var(--text)') + ';font-size:11px;cursor:pointer;font-family:\'DM Sans\',sans-serif">' + (ms / 1000) + 's</button>';
    }).join('');

    var slotRows = '';
    for (var i = 0; i < _rmSettings.slots.length; i++) {
      var aid = _rmSettings.slots[i];
      slotRows += '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;margin-bottom:4px">' +
        '<span style="color:var(--gold);font-size:10px;min-width:18px;text-align:center">' + (i + 1) + '</span>' +
        '<select class="rm-set-select" data-rm-idx="' + i + '" style="flex:1;background:var(--surface);border:1px solid var(--border);color:var(--text);padding:4px 6px;border-radius:4px;font-size:11px;font-family:\'DM Sans\',sans-serif">' + _rmBuildOptions(aid) + '</select>' +
        '<button class="rm-set-remove" data-rm-idx="' + i + '" style="background:none;border:none;color:var(--red,#f66);cursor:pointer;font-size:14px;padding:2px 6px" title="Remove">&times;</button>' +
      '</div>';
    }

    var canAdd = _rmSettings.slots.length < RM_MAX_SLOTS;

    return '<div class="settings-section-title" style="margin-bottom:12px">' +
      '<span style="color:var(--gold);margin-right:8px;vertical-align:middle">' + (typeof getIcon === 'function' ? getIcon('gear', 18) : '') + '</span>' +
      'Radial Tool Menu' +
    '</div>' +
    '<div style="color:var(--text-dim);font-size:11px;margin-bottom:14px">Compact arc menu for quick tool access. Max ' + RM_MAX_SLOTS + ' slots.</div>' +
    '<div style="margin-bottom:16px">' +
      '<div style="font-size:12px;color:var(--text);font-weight:600;margin-bottom:6px">Quick Show Duration</div>' +
      '<div style="display:flex;gap:6px">' + durationBtns + '</div>' +
    '</div>' +
    '<div style="margin-bottom:10px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">' +
        '<span style="font-size:12px;color:var(--text);font-weight:600">Slots (' + _rmSettings.slots.length + '/' + RM_MAX_SLOTS + ')</span>' +
        (canAdd ? '<button id="rm-set-add-slot" style="padding:4px 10px;border-radius:5px;border:1px solid var(--gold);background:transparent;color:var(--gold);font-size:11px;cursor:pointer;font-family:\'DM Sans\',sans-serif">+ Add</button>' : '') +
      '</div>' +
      '<div id="rm-set-slots" style="max-height:320px;overflow-y:auto;padding-right:4px">' + slotRows + '</div>' +
    '</div>' +
    '<div style="margin-top:12px;display:flex;gap:8px">' +
      '<button id="rm-set-preview" style="padding:6px 16px;border-radius:6px;border:1px solid var(--gold);background:transparent;color:var(--gold);font-size:12px;cursor:pointer;font-family:\'DM Sans\',sans-serif">Preview</button>' +
      '<button id="rm-set-reset" style="padding:6px 16px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text-dim);font-size:12px;cursor:pointer;font-family:\'DM Sans\',sans-serif">Reset</button>' +
    '</div>';
  }

  function _rmBuildOptions(selected) {
    var html = '';
    RM_CATEGORIES.forEach(function (cat) {
      html += '<optgroup label="' + cat.label + '">';
      cat.keys.forEach(function (k) {
        var a = RM_ACTIONS[k];
        if (!a) return;
        html += '<option value="' + k + '"' + (k === selected ? ' selected' : '') + '>' + a.label + '</option>';
      });
      html += '</optgroup>';
    });
    return html;
  }

  function _rmRefreshSettings() {
    var ct = document.getElementById('settings-content');
    if (ct) { ct.innerHTML = buildRadialMenuSection(); wireRadialMenuHandlers(); }
  }

  function wireRadialMenuHandlers() {
    document.querySelectorAll('.rm-set-dur').forEach(function (btn) {
      btn.onclick = function () {
        _rmSettings.quickDuration = parseInt(btn.dataset.rmDur, 10);
        _rmSave(); _rmRefreshSettings();
      };
    });

    document.querySelectorAll('.rm-set-select').forEach(function (sel) {
      sel.onchange = function () {
        _rmSettings.slots[parseInt(sel.dataset.rmIdx, 10)] = sel.value;
        _rmSave(); _rmRenderSlots();
      };
    });

    document.querySelectorAll('.rm-set-remove').forEach(function (btn) {
      btn.onclick = function () {
        _rmSettings.slots.splice(parseInt(btn.dataset.rmIdx, 10), 1);
        _rmSave(); _rmRenderSlots(); _rmRefreshSettings();
      };
    });

    var addBtn = document.getElementById('rm-set-add-slot');
    if (addBtn) addBtn.onclick = function () {
      if (_rmSettings.slots.length >= RM_MAX_SLOTS) return;
      _rmSettings.slots.push('panel-templates');
      _rmSave(); _rmRenderSlots(); _rmRefreshSettings();
    };

    var prevBtn = document.getElementById('rm-set-preview');
    if (prevBtn) prevBtn.onclick = function () { rmQuickShow(window.innerWidth / 2, window.innerHeight / 2); };

    var resetBtn = document.getElementById('rm-set-reset');
    if (resetBtn) resetBtn.onclick = function () {
      _rmSettings.slots = _rmDefaults.slice();
      _rmSettings.quickDuration = 3000;
      _rmSave(); _rmRenderSlots(); _rmRefreshSettings();
    };
  }

  /* ── Init ───────────────────────────────────────────────── */
  /* ── Triple-tap to open (mobile/tablet) ───────────────── */
  var _rmTapTimes = [];
  var _TRIPLE_TAP_WINDOW = 500; // 3 taps within 500ms

  function _rmTripleTapListener(e) {
    // Only single-finger taps
    if (e.touches && e.touches.length > 1) return;
    var now = Date.now();
    _rmTapTimes.push(now);
    // Keep only last 3
    if (_rmTapTimes.length > 3) _rmTapTimes.shift();
    if (_rmTapTimes.length === 3) {
      if (now - _rmTapTimes[0] <= _TRIPLE_TAP_WINDOW) {
        _rmTapTimes = [];
        var touch = e.changedTouches ? e.changedTouches[0] : e;
        rmQuickShow(touch.clientX, touch.clientY);
      }
    }
  }

  function initRadialMenu() {
    _rmLoad();
    _rmBuild();
    // Triple-tap for touch devices
    var area = document.getElementById('canvas-area') || document.body;
    area.removeEventListener('touchend', _rmTripleTapListener, { passive: true });
    area.addEventListener('touchend', _rmTripleTapListener, { passive: true });
  }

  /* ── Public API ─────────────────────────────────────────── */
  window.initRadialMenu = initRadialMenu;
  window.rmTogglePin = rmTogglePin;
  window.rmQuickShow = rmQuickShow;
  window.rmPin = rmPin;
  window.rmUnpin = rmUnpin;
  window.buildRadialMenuSection = buildRadialMenuSection;
  window.wireRadialMenuHandlers = wireRadialMenuHandlers;
  window.RM_ACTIONS = RM_ACTIONS;
  window.RM_CATEGORIES = RM_CATEGORIES;
})();

// Modular skeleton hook (Faz 8) — radial-menu is now a canvas subsystem loader module (modules/canvas/).
if (window.cc && cc.modules) cc.modules.register({ id: 'radial-menu', parent: 'canvas', title: 'Radial menu', mount: function () {}, unmount: function () {} });
// Faz 8: app.js's typeof-guarded initRadialMenu() runs before this module loads, so it's skipped.
// Self-init on the sticky cc:canvas-ready event instead (uses the exposed global, guarded).
if (window.cc && cc.on) cc.on('cc:canvas-ready', function () { cc.safe('canvas.radial-menu', function () { if (typeof window.initRadialMenu === 'function') window.initRadialMenu(); }); });
