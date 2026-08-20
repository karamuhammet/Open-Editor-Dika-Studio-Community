/* Module: scene/toolbar — the floating tool bar for INFINITE (scene) mode only. A CapCut/Figma-style
   pill at the bottom-center of the canvas: Select(Move/Hand) · Frame · Image · Text · Pen · Shapes · More.

   Scene-only: mounts into #canvas-area lazily on the first cc.on('scene:active'), fades in/out with scene
   mode, invisible+inert everywhere else (single/slide/video/board byte-identical). Every tool reuses an
   existing engine — see docs/infinite-canvas-toolbar-plan.md.

   Done: T0 shell · T1 Select group (Move/Hand) + coordinator + Space-pan + Esc→Move · T2 Frame draw +
   presets · T3 Shapes sub-bar (reuses addToCenter + MyShapesBrowser) + Pen group (reuses activatePenTool).
     · __scTool ......... the one active MODE tool ('move'|'hand'|'frame'|'pen')
     · _scSetTool(t) .... switch tool (deactivate prev → activate next → reflect UI)
     · _scIsPanMode() ... world.js reads this to gate empty-drag pan (Hand or held Space)
     · _scApplyActiveTool() world.js re-applies the active tool's canvas state after every render
   Launchers (Shapes, More) open a menu on click and do NOT change __scTool. */
(function (global) {
  'use strict';
  var SC = global.__ccSceneEditor;
  if (!SC) return;

  var _bar = null, _tip = null, _tipTimer = 0, _built = false, _flyTimer = 0, _openFly = null, _outsideBound = false;

  global.__scTool = global.__scTool || 'move';
  global.__scSpaceDown = false;

  function _icon(names, size) {
    if (typeof getIcon !== 'function') return '';
    for (var i = 0; i < names.length; i++) { var s = getIcon(names[i], size || 18); if (s) return s; }
    return '';
  }

  // group buttons with variants. Select variants are real tools (__scTool = move/hand). Pen variants are
  // ENGINE modes (__scTool stays 'pen'; the chosen mode is tracked in _current.pen + drives the icon).
  var VARIANTS = {
    move: [
      { tool: 'move', label: 'Select / Move', key: 'V', icons: ['mouse-pointer-2', 'mouse-pointer', 'move'] },
      { tool: 'hand', label: 'Hand tool',   key: 'H', icons: ['hand', 'grab'] }
    ],
    pen: [
      { tool: 'pen',       label: 'Pen',     key: 'P',       icons: ['pen-tool', 'edit-2', 'pencil'] },
      { tool: 'freeform',  label: 'Free',   key: '⇧P',      icons: ['spline', 'pencil', 'edit-3'] },
      { tool: 'curvature', label: 'Curve',      key: '',        icons: ['spline', 'git-commit', 'bezier-curve'] },
      { tool: 'line',      label: 'Line',     key: 'L',       icons: ['minus', 'slash'] }
    ]
  };
  var _current = { move: 'move', pen: 'pen' };

  // Frame fly-up = quick artboard PRESETS — draw freeform OR one-click a sized frame (plan §3.2 bonus).
  var FRAME_PRESETS = [
    { w: 1080, h: 1080, label: 'Square',  sub: '1080×1080' },
    { w: 1080, h: 1350, label: 'Vertical', sub: '1080×1350' },
    { w: 1080, h: 1920, label: 'Story', sub: '1080×1920' },
    { w: 1920, h: 1080, label: 'Horizontal', sub: '1920×1080' },
    { w: 595,  h: 842,  label: 'A4',    sub: '595×842' }
  ];

  // Shapes sub-bar — the 4 quick shapes reuse the EXACT element-tools.js builders (so they match the left
  // panel), the 5th opens the full shape gallery (MyShapesBrowser). Quick-click = default size (D3 v1).
  var SHAPE_DEFS = [
    { id: 'rect', label: 'Box', icons: ['square', 'rectangle-horizontal'], make: function () { return new fabric.Rect({ width: 220, height: 80, fill: 'rgba(242, 255, 88,.25)', stroke: '#f2ff58', strokeWidth: 1.5, rx: 4, ry: 4 }); } },
    { id: 'circle', label: 'Circle', icons: ['circle'], make: function () { return new fabric.Circle({ radius: 60, fill: 'rgba(242, 255, 88,.15)', stroke: '#f2ff58', strokeWidth: 1.5 }); } },
    { id: 'triangle', label: 'Triangle', icons: ['triangle'], make: function () { return new fabric.Triangle({ width: 120, height: 120, fill: 'rgba(242, 255, 88,.2)', stroke: '#f2ff58', strokeWidth: 1.5 }); } },
    { id: 'line', label: 'Line', icons: ['minus', 'slash'], make: function () { var w = (global.canvas && canvas.getWidth && canvas.getWidth()) || 600; return new fabric.Rect({ width: Math.min(w * 0.8, 580), height: 1, fill: '#f2ff58' }); } },
    { id: 'gallery', label: 'Gallery', icons: ['shapes', 'layout-grid', 'grid'], gallery: true }
  ];

  // More (＋) menu — the §5 value-add tools (D4 v1): sticky note · template→frame · grid · snap toggles.
  var MORE_ITEMS = [
    { id: 'sticky', label: 'Sticky note', icons: ['sticky-note', 'square'], fn: function () { _scAddSticky(); } },
    { id: 'template', label: 'Add template', icons: ['layout-template', 'layout-grid'], fn: function () { if (typeof openFlyout === 'function') openFlyout('templates'); } },
    { sep: true },
    { id: 'grid', label: 'Grid', icons: ['grid-3x3', 'grid'], toggle: function () { return !!global.gridVisible; }, fn: function () { if (typeof toggleGridOverlay === 'function') toggleGridOverlay(); } },
    { id: 'snap', label: 'Smart snapping', icons: ['magnet', 'move'], toggle: function () { return !global.__ccSnapOff; }, fn: function () { global.__ccSnapOff = !global.__ccSnapOff; } }
  ];

  // which buttons own a fly-up + how it opens. type: variants|presets|shapes|menu; trigger: hover|click.
  var FLY = {
    move:  { type: 'variants', trigger: 'hover', rows: VARIANTS.move },
    frame: { type: 'presets',  trigger: 'hover', rows: FRAME_PRESETS },
    pen:   { type: 'variants', trigger: 'hover', rows: VARIANTS.pen },
    shape: { type: 'shapes',   trigger: 'click', rows: SHAPE_DEFS },
    more:  { type: 'menu',     trigger: 'click', rows: MORE_ITEMS }
  };
  function _hasFly(id) { return !!FLY[id]; }
  function _flyTrigger(id) { return FLY[id] ? FLY[id].trigger : null; }

  // mode → persistent tool (highlights via __scTool). action → one-shot. launcher → opens a menu, no mode.
  var TOOLS = [
    { id: 'move',  icons: ['mouse-pointer-2', 'mouse-pointer', 'move'], label: 'Select / Move', key: 'V', mode: true, group: true },
    { id: 'frame', icons: ['frame'],                                    label: 'Frame',    key: 'F', mode: true, group: true },
    { id: 'image', icons: ['image'],                                    label: 'Image',     key: 'I', action: true },
    { id: 'text',  icons: ['type', 'text'],                             label: 'Text',      key: 'T', action: true },
    { id: 'pen',   icons: ['pen-tool', 'edit-2', 'pencil'],             label: 'Pen',      key: 'P', mode: true, group: true },
    { id: 'shape', icons: ['shapes', 'square'],                         label: 'Shapes',   key: 'R', launcher: true, group: true },
    { sep: true },
    { id: 'more',  icons: ['plus'],                                     label: 'Other',      key: '',  launcher: true, group: true }
  ];

  function _host() { return document.getElementById('canvas-area') || document.querySelector('.canvas-area'); }
  function _toolById(id) { for (var i = 0; i < TOOLS.length; i++) if (TOOLS[i].id === id) return TOOLS[i]; return null; }
  function _esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function _variantOf(id, tool) { var v = VARIANTS[id]; if (!v) return null; for (var i = 0; i < v.length; i++) if (v[i].tool === tool) return v[i]; return null; }
  function _btnIconHtml(t) {
    if (VARIANTS[t.id]) { var cur = _variantOf(t.id, _current[t.id]); if (cur) return _icon(cur.icons); }
    return _icon(t.icons);
  }

  function _build() {
    if (_built) return;
    var host = _host();
    if (!host || typeof document === 'undefined') return;

    _bar = document.createElement('div');
    _bar.className = 'sctb';
    _bar.id = 'sc-toolbar';
    _bar.setAttribute('role', 'toolbar');
    _bar.setAttribute('aria-label', 'Infinite canvas tools');

    TOOLS.forEach(function (t) {
      if (t.sep) { var sp = document.createElement('span'); sp.className = 'sctb-sep'; _bar.appendChild(sp); return; }

      var btn = document.createElement('button');
      btn.className = 'sctb-btn';
      btn.type = 'button';
      btn.setAttribute('data-tool', t.id);
      btn.setAttribute('aria-label', t.label + (t.key ? ' (' + t.key + ')' : ''));
      if (t.mode) btn.setAttribute('aria-pressed', 'false');
      btn.innerHTML = _btnIconHtml(t) + (t.group ? '<span class="sctb-chev" aria-hidden="true"></span>' : '');
      btn.addEventListener('click', (function (def) { return function () { _onClick(def); }; })(t));
      btn.addEventListener('mouseenter', (function (b, def) { return function () { _scheduleTip(b, def); }; })(btn, t));
      btn.addEventListener('mouseleave', _hideTip);

      if (_hasFly(t.id)) {
        var grp = document.createElement('span');
        grp.className = 'sctb-group';
        grp.appendChild(btn);
        grp.appendChild(_buildFly(t));
        if (_flyTrigger(t.id) === 'hover') {
          grp.addEventListener('mouseenter', (function (def) { return function () { _scheduleFly(def); }; })(t));
          grp.addEventListener('mouseleave', _scheduleFlyClose);
        }
        _bar.appendChild(grp);
      } else {
        _bar.appendChild(btn);
      }
    });

    _tip = document.createElement('div');
    _tip.className = 'sctb-tip';
    _bar.appendChild(_tip);

    host.appendChild(_bar);
    _built = true;
    _reflect();
  }

  function _buildFly(t) {
    var cfg = FLY[t.id];
    var fly = document.createElement('div');
    fly.className = 'sctb-fly' + (cfg.type === 'shapes' ? ' sctb-subbar' : '');
    fly.setAttribute('data-fly', t.id);

    if (cfg.type === 'variants') {
      cfg.rows.forEach(function (v) {
        var row = document.createElement('button');
        row.className = 'sctb-fly-row';
        row.type = 'button';
        row.setAttribute('data-variant', v.tool);
        row.innerHTML = _icon(v.icons, 16) + '<span class="sctb-fly-label">' + _esc(v.label) + '</span>' +
          (v.key ? '<span class="sctb-key">' + _esc(v.key) + '</span>' : '');
        row.addEventListener('click', function (e) { e.stopPropagation(); _pickVariant(t, v.tool); });
        fly.appendChild(row);
      });
    } else if (cfg.type === 'presets') {
      cfg.rows.forEach(function (p) {
        var row = document.createElement('button');
        row.className = 'sctb-fly-row sctb-fly-preset';
        row.type = 'button';
        row.setAttribute('data-preset', p.w + 'x' + p.h);
        var ar = p.w / p.h, sw = ar >= 1 ? 16 : Math.max(6, Math.round(16 * ar)), sh = ar >= 1 ? Math.max(6, Math.round(16 / ar)) : 16;
        row.innerHTML = '<span class="sctb-ar" style="width:' + sw + 'px;height:' + sh + 'px"></span>' +
          '<span class="sctb-fly-label">' + _esc(p.label) + '</span><span class="sctb-fly-sub">' + _esc(p.sub) + '</span>';
        row.addEventListener('click', function (e) {
          e.stopPropagation(); _closeFly();
          if (typeof _scAddPresetFrame === 'function') _scAddPresetFrame(p.w, p.h, p.label);
          global._scSetTool('move');
        });
        fly.appendChild(row);
      });
    } else if (cfg.type === 'shapes') {
      cfg.rows.forEach(function (s) {
        var cell = document.createElement('button');
        cell.className = 'sctb-shape-cell' + (s.gallery ? ' sctb-shape-gallery' : '');
        cell.type = 'button';
        cell.setAttribute('data-shape', s.id);
        cell.setAttribute('aria-label', s.label);
        cell.innerHTML = _icon(s.icons, 18) + '<span class="sctb-shape-label">' + _esc(s.label) + '</span>';
        cell.addEventListener('click', function (e) {
          e.stopPropagation(); _closeFly();
          if (s.gallery) { if (global.MyShapesBrowser && MyShapesBrowser.open) MyShapesBrowser.open(); return; }
          if (typeof addToCenter === 'function' && global.fabric) addToCenter(s.make());
        });
        fly.appendChild(cell);
      });
    } else if (cfg.type === 'menu') {
      cfg.rows.forEach(function (it) {
        if (it.sep) { var d = document.createElement('div'); d.className = 'sctb-fly-divider'; fly.appendChild(d); return; }
        var row = document.createElement('button');
        row.className = 'sctb-fly-row sctb-menu-row';
        row.type = 'button';
        row.setAttribute('data-item', it.id);
        var check = it.toggle ? '<i class="sctb-check' + (it.toggle() ? ' on' : '') + '"></i>' : '';
        row.innerHTML = _icon(it.icons, 16) + '<span class="sctb-fly-label">' + _esc(it.label) + '</span>' + check;
        row.addEventListener('click', (function (item, rowEl) {
          return function (e) {
            e.stopPropagation();
            if (item.fn) item.fn();
            if (item.toggle) { var ic = rowEl.querySelector('.sctb-check'); if (ic) ic.classList.toggle('on', !!item.toggle()); }
            else _closeFly();
          };
        })(it, row));
        fly.appendChild(row);
      });
    }
    return fly;
  }

  // pick a variant from a group fly-up. Select → real tool. Pen → engine mode (re-arm if already penning).
  function _pickVariant(t, tool) {
    _current[t.id] = tool;
    _refreshBtnIcon(t);
    _closeFly();
    if (t.id === 'pen') {
      if (global.__scTool === 'pen' && typeof _penToolActive === 'function' && _penToolActive()) {
        if (typeof activatePenTool === 'function') activatePenTool(tool);   // switch engine mode in place
        _reflect();
      } else { global._scSetTool('pen'); }
    } else {
      global._scSetTool(tool);
    }
  }

  function _refreshBtnIcon(t) {
    if (!_bar || !t) return;
    var btn = _bar.querySelector('.sctb-btn[data-tool="' + t.id + '"]');
    if (btn) btn.innerHTML = _btnIconHtml(t) + (t.group ? '<span class="sctb-chev" aria-hidden="true"></span>' : '');
  }

  function _onClick(t) {
    _hideTip();
    if (_flyTrigger(t.id) === 'click') { _toggleFly(t); return; }   // Shapes / More launcher
    _closeFly();
    if (VARIANTS[t.id]) {                                           // Select / Pen → activate current variant
      if (t.id === 'pen') { _pickVariant(t, _current.pen || 'pen'); return; }
      global._scSetTool(_current[t.id] || t.id); return;
    }
    if (t.mode) { global._scSetTool(t.id); return; }                // Frame
    if (t.id === 'image') { if (global.CCImageModal && CCImageModal.open) CCImageModal.open(); return; }
    if (t.id === 'text') { _scAddText(); return; }
  }

  // ── hover fly-ups (Select / Frame / Pen) ──
  function _scheduleFly(t) { clearTimeout(_flyTimer); _flyTimer = setTimeout(function () { _showFly(t); }, 130); }
  function _showFly(t) {
    if (!_bar || !_bar.classList.contains('show')) return;
    _hideTip();
    var fly = _bar.querySelector('.sctb-fly[data-fly="' + t.id + '"]');
    if (!fly) return;
    if (_openFly && _openFly !== fly) _closeFly();
    _markFlyActive(fly); fly.classList.add('show'); _openFly = fly;
  }
  function _markFlyActive(fly) {
    var rows = fly.querySelectorAll('.sctb-fly-row[data-variant]');
    var id = fly.getAttribute('data-fly');
    var cur = (id === 'pen') ? _current.pen : global.__scTool;   // pen marks its engine mode, not __scTool
    for (var i = 0; i < rows.length; i++) rows[i].classList.toggle('on', rows[i].getAttribute('data-variant') === cur);
  }
  function _scheduleFlyClose() { clearTimeout(_flyTimer); _flyTimer = setTimeout(_closeFly, 180); }

  // ── click launchers (Shapes / More) ──
  function _toggleFly(t) {
    var fly = _bar.querySelector('.sctb-fly[data-fly="' + t.id + '"]');
    if (!fly) return;
    if (_openFly === fly) { _closeFly(); return; }
    _closeFly();
    fly.classList.add('show'); _openFly = fly;
    _reflectOpen();
    if (!_outsideBound) { _outsideBound = true; setTimeout(function () { document.addEventListener('mousedown', _outsideClose, true); }, 0); }
  }
  function _outsideClose(e) {
    if (_openFly && _openFly.parentNode && !_openFly.parentNode.contains(e.target)) _closeFly();
  }
  function _closeFly() {
    clearTimeout(_flyTimer);
    if (_openFly) { _openFly.classList.remove('show'); _openFly = null; }
    if (_outsideBound) { document.removeEventListener('mousedown', _outsideClose, true); _outsideBound = false; }
    _reflectOpen();
  }
  function _reflectOpen() {
    if (!_bar) return;
    var openId = _openFly ? _openFly.getAttribute('data-fly') : null;
    var btns = _bar.querySelectorAll('.sctb-btn');
    for (var i = 0; i < btns.length; i++) {
      var id = btns[i].getAttribute('data-tool');
      var def = _toolById(id);
      if (def && def.launcher) btns[i].classList.toggle('open', id === openId);
    }
  }

  // ── tooltip ──
  function _scheduleTip(btn, t) {
    clearTimeout(_tipTimer);
    _tipTimer = setTimeout(function () {
      if (!_tip || !_bar || !_bar.classList.contains('show') || _openFly) return;
      _tip.innerHTML = _esc(t.label) + (t.key ? '<span class="sctb-key">' + _esc(t.key) + '</span>' : '');
      var br = _bar.getBoundingClientRect(), bb = btn.getBoundingClientRect();
      _tip.style.left = (bb.left + bb.width / 2 - br.left) + 'px';
      _tip.classList.add('show');
    }, 350);
  }
  function _hideTip() { clearTimeout(_tipTimer); if (_tip) _tip.classList.remove('show'); }

  // ── tool-state coordinator ──
  global._scSetTool = function (t) {
    var known = _toolById(t) || _variantOf('move', t);   // 'hand' is a Select variant, not in TOOLS
    if (!known) return;
    if (t === global.__scTool) { _scActivateTool(t); _reflect(); return; }
    _scDeactivateTool(global.__scTool);
    global.__scTool = t;
    _scActivateTool(t);
    _reflect();
  };

  function _scActivateTool(t) {
    var c = global.canvas;
    if (!c) return;
    if (t !== 'pen') _scDeactivatePen();
    if (t === 'hand') {
      c.selection = false; c.skipTargetFind = true;
      c.defaultCursor = 'grab'; c.hoverCursor = 'grab'; c.setCursor('grab');
    } else if (t === 'frame') {
      c.selection = false; c.skipTargetFind = true;        // ignore existing frames → every drag draws a new one
      c.defaultCursor = 'crosshair'; c.hoverCursor = 'crosshair'; c.setCursor('crosshair');
    } else if (t === 'pen') {
      if (!(typeof _penToolActive === 'function' && _penToolActive())) {
        if (typeof activatePenTool === 'function') activatePenTool(_current.pen || 'pen');   // pen engine owns its cursor + float-bar
      }
    } else {                                               // move (resting) → normal select
      c.selection = true; c.skipTargetFind = false;
      c.defaultCursor = 'default'; c.hoverCursor = 'move'; c.setCursor('default');
    }
  }
  function _scDeactivateTool(t) { if (t === 'pen') _scDeactivatePen(); }
  function _scDeactivatePen() {
    if (typeof _penToolActive === 'function' && _penToolActive() && typeof deactivatePenTool === 'function') deactivatePenTool();
  }

  global._scApplyActiveTool = function () { _scActivateTool(global.__scTool); };
  global._scIsPanMode = function () { return global.__scTool === 'hand' || global.__scSpaceDown === true; };

  // set the Pen engine mode (used by the Shift+P / L shortcuts + the fly-up)
  function _scSetPenMode(mode) {
    _current.pen = mode;
    _refreshBtnIcon(_toolById('pen'));
    if (global.__scTool === 'pen' && typeof _penToolActive === 'function' && _penToolActive()) {
      if (typeof activatePenTool === 'function') activatePenTool(mode);
      _reflect();
    } else { global._scSetTool('pen'); }
  }

  // Text tool — drop an editable Textbox in the active frame (directly editable as a free object; it
  // nests into the frame on edit-exit via _scReparentObject). If already inside an entered frame, tag
  // it so the frame re-groups it on exit.
  function _scAddText() {
    if (!global.fabric || !global.canvas) return;
    var fr = (typeof _scActiveFrame === 'function') ? _scActiveFrame() : null;
    var size = fr ? Math.max(20, Math.round(fr.h * 0.045)) : 40;
    var cx = fr ? (fr.x + fr.w / 2) : 0, cy = fr ? (fr.y + fr.h / 2) : 0;
    var tb = new fabric.Textbox('Text', {
      fontFamily: 'DM Sans', fontSize: size, fill: '#1f2937', fontWeight: '600',
      originX: 'center', originY: 'center', left: cx, top: cy, width: size * 7, textAlign: 'left'
    });
    var entered = global.__ccEnteredFrameId;
    if (entered) tb._enteredFrameId = entered;       // re-grouped on frame exit
    global.histLocked = true;
    canvas.add(tb);
    canvas.setActiveObject(tb);
    global.histLocked = false;
    if (tb.enterEditing) { try { tb.enterEditing(); if (tb.selectAll) tb.selectAll(); } catch (e) {} }
    if (!entered) {
      var done = function () {
        tb.off('editing:exited', done);
        if (!global.__ccEnteredFrameId && typeof _scReparentObject === 'function') _scReparentObject(tb);  // nest into the frame
        if (typeof snap === 'function') snap();
        if (global.canvas) canvas.requestRenderAll();
      };
      tb.on('editing:exited', done);
    }
    canvas.requestRenderAll();
  }

  // Sticky note (A4) — a FigJam-style editable yellow note that lives FREE on the board (it never gets
  // absorbed into a frame — world.js skips reparenting `_scSticky`). Dropped at the viewport centre so it
  // never touches/distorts a frame.
  function _scAddSticky() {
    if (!global.fabric || !global.canvas) return;
    var c = global.canvas, vt = c.viewportTransform, z = vt[0] || 1;
    var wx = (c.getWidth() / 2 - vt[4]) / z, wy = (c.getHeight() / 2 - vt[5]) / z;
    var note = new fabric.Textbox('Not...', {
      width: 240, fontSize: 22, fontFamily: 'DM Sans', fontWeight: '500', fill: '#3a2f00',
      backgroundColor: '#ffe27a', textAlign: 'left', originX: 'center', originY: 'center',
      left: wx, top: wy, _scSticky: true
    });
    try { note.set('shadow', new fabric.Shadow({ color: 'rgba(0,0,0,0.25)', blur: 14, offsetX: 0, offsetY: 5 })); } catch (e) {}
    global.histLocked = true;
    c.add(note); c.setActiveObject(note);
    global.histLocked = false;
    if (note.enterEditing) { try { note.enterEditing(); if (note.selectAll) note.selectAll(); } catch (e) {} }
    if (typeof snap === 'function') snap();
    c.requestRenderAll();
  }

  function _reflect() {
    if (!_bar) return;
    var btns = _bar.querySelectorAll('.sctb-btn');
    for (var i = 0; i < btns.length; i++) {
      var id = btns[i].getAttribute('data-tool');
      var def = _toolById(id);
      var on = false;
      if (id === 'move') {                                 // Select group: __scTool is the active variant
        var v = _variantOf('move', global.__scTool);
        if (v) { on = true; if (_current.move !== global.__scTool) { _current.move = global.__scTool; _refreshBtnIcon(def); btns = _bar.querySelectorAll('.sctb-btn'); } }
      } else if (def && def.mode) {                        // frame, pen
        on = (id === global.__scTool);
      }
      btns[i].classList.toggle('active', on);
      if (def && def.mode) btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    _reflectOpen();
    if (_openFly) _markFlyActive(_openFly);
  }

  // ── keyboard: Esc→Move, momentary Space-pan (the V/H/F… command shortcuts land in T5) ──
  function _typing() {
    var a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return true;
    var ao = global.canvas && canvas.getActiveObject && canvas.getActiveObject();
    return !!(ao && ao.isEditing);
  }
  document.addEventListener('keydown', function (e) {
    if (!SC._active) return;
    if (e.code === 'Space' && !global.__scSpaceDown && !_typing() && global.__scTool !== 'pen') {
      global.__scSpaceDown = true;
      var c = global.canvas;
      if (c) { c.skipTargetFind = true; c.selection = false; c.defaultCursor = 'grab'; c.setCursor('grab'); }
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape' && !_typing()) {
      if (global.__ccEnteredFrameId) return;              // inside a frame → frame-edit owns Esc
      _closeFly();
      if (global.__scTool !== 'move') { global._scSetTool('move'); e.preventDefault(); }
      else if (global.canvas && canvas.getActiveObject && canvas.getActiveObject()) { canvas.discardActiveObject(); canvas.requestRenderAll(); }
    }
  });
  document.addEventListener('keyup', function (e) {
    if (e.code === 'Space' && global.__scSpaceDown) {
      global.__scSpaceDown = false;
      if (SC._active) global._scApplyActiveTool();
    }
  });

  // ── scene-scoped tool shortcuts (modern keyboard-manager path) ──
  // Registered as 'global' but gated by whenCondition = scene-active + not-typing, with a high priority,
  // so e.g. T beats the design-editor 'design-text' binding ONLY in scene mode and never elsewhere. This
  // avoids switching the global context (which would disable Delete/copy/paste inside scene).
  var _shortcutsReg = false;
  function _registerSceneShortcuts() {
    var KM = global.KeyboardManager;
    if (_shortcutsReg || !KM || typeof KM.registerCommand !== 'function') return;
    _shortcutsReg = true;
    var scene = function () { return !!(SC._active && !_typing()); };
    var defs = [
      { id: 'sc-move',  label: 'Tool: Select / Move', key: 'V', fn: function () { global._scSetTool('move'); } },
      { id: 'sc-hand',  label: 'Tool: Hand',         key: 'H', fn: function () { global._scSetTool('hand'); } },
      { id: 'sc-frame', label: 'Tool: Frame',    key: 'F', fn: function () { global._scSetTool('frame'); } },
      { id: 'sc-image', label: 'Tool: Image',     key: 'I', fn: function () { if (global.CCImageModal && CCImageModal.open) CCImageModal.open(); } },
      { id: 'sc-text',  label: 'Tool: Text',      key: 'T', fn: _scAddText },
      { id: 'sc-pen',   label: 'Tool: Pen',      key: 'P', fn: function () { global._scSetTool('pen'); } },
      { id: 'sc-pen-freeform', label: 'Pen: Freeform', key: 'Shift+P', fn: function () { _scSetPenMode('freeform'); } },
      { id: 'sc-pen-line', label: 'Pen: Line',  key: 'L', fn: function () { _scSetPenMode('line'); } },
      { id: 'sc-shapes', label: 'Tool: Shapes',  key: 'R', fn: function () { var d = _toolById('shape'); if (d) _toggleFly(d); } }
    ];
    defs.forEach(function (d) {
      KM.registerCommand({
        id: d.id, label: d.label, description: d.label + ' (sonsuz tuval)', category: 'Sonsuz Tuval',
        contexts: ['global'], defaultShortcut: d.key, priority: 20, whenCondition: scene,
        fn: function () { if (!scene()) return false; d.fn(); return true; }
      });
    });
  }

  function _show(on) {
    if (on) {
      _build();
      _registerSceneShortcuts();
      global.__scTool = 'move';                            // D6 — default tool on entering scene
      _current.move = 'move';
      if (_bar) { _bar.classList.add('show'); _refreshBtnIcon(_toolById('move')); _reflect(); }
      global._scApplyActiveTool();
    } else {
      _hideTip(); _closeFly();
      if (_bar) _bar.classList.remove('show');
    }
  }

  global._scToolbarEl = function () { return _bar; };
  global._scToolbarReflect = _reflect;

  if (global.cc && cc.on) { cc.on('scene:active', function (on) { _show(!!on); }); }
  if (global.cc && cc.modules) {
    cc.modules.register({ id: 'toolbar', parent: 'scene', title: 'scene: toolbar', mount: function () {}, unmount: function () {} });
  }
})(window);
