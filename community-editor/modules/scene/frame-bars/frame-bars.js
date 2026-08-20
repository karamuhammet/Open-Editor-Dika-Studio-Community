/* Module: scene/frame-bars — frame SELECTION behaviour + floating context toolbars (infinite-canvas only).
   T1b: marquee / Shift-click selects FRAMES ONLY (D9). T6: a SINGLE selected frame gets a context bar
   above it (label+size · Arka plan · Özel size dropdown · İndir). T7: 2+ frames get a MULTI bar (Arka
   plan-all · Özel-all · Grup/Çöz · Hizalama sub-bar · İndir-all); grouped frames select & move together
   (lightweight, D8). Scene-only. See docs/infinite-canvas-toolbar-plan.md §3.7. */
(function (global) {
  'use strict';
  var SC = global.__ccSceneEditor;
  if (!SC) return;

  var _ready = false, _filtering = false;
  var _bar = null, _pop = null, _openPop = null, _mode = null;
  var _labelLayer = null, _labelEls = {};

  function _icon(names, size) {
    if (typeof getIcon !== 'function') return '';
    for (var i = 0; i < names.length; i++) { var s = getIcon(names[i], size || 15); if (s) return s; }
    return '';
  }
  function _host() { return document.getElementById('canvas-area') || document.querySelector('.canvas-area'); }
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function _frameObj(id) { return (SC._frameObjById ? SC._frameObjById(id) : null); }

  function _activeSel() {
    var ao = global.canvas && canvas.getActiveObject && canvas.getActiveObject();
    return (ao && ao.type === 'activeSelection') ? ao : null;
  }

  global._scSelectedFrames = function () {
    if (!global.canvas) return [];
    var ao = canvas.getActiveObject();
    if (!ao) return [];
    if (ao._ccFrame) return [ao];
    if (ao.type === 'activeSelection') return ao.getObjects().filter(function (o) { return o._ccFrame; });
    return [];
  };
  function _selectedIds() { return global._scSelectedFrames().map(function (fo) { return fo._frameId; }); }

  // D9 — keep multi-selections FRAMES ONLY (drop free top-level objects); skipped while entered / single
  // / during any programmatic frame op (histLocked = enter-edit explode, resize, align — must not touch
  // the transient selections those create).
  function _filterSelectionToFrames() {
    if (_filtering || !SC._active || global.__ccEnteredFrameId || global.histLocked) return;
    var sel = _activeSel();
    if (!sel) return;
    var objs = sel.getObjects();
    var frames = objs.filter(function (o) { return o._ccFrame; });
    if (frames.length === objs.length) return;
    if (global._scLog) _scLog('FILTER selection', objs.length, '→ frames-only', frames.length);
    _filtering = true;
    canvas.discardActiveObject();
    if (frames.length > 1) canvas.setActiveObject(new fabric.ActiveSelection(frames, { canvas: canvas }));
    else if (frames.length === 1) canvas.setActiveObject(frames[0]);
    canvas.requestRenderAll();
    _filtering = false;
  }

  // safety net: if we're NOT inside enter-edit but a frame is still dimmed (a transition didn't finish),
  // restore it. Only touches frames flagged `_dimmed` (the enter-edit dim) — never user-set opacity.
  function _undimStuck() {
    if (global.__ccEnteredFrameId || !global.canvas) return;
    var changed = false;
    canvas.getObjects().forEach(function (o) {
      if (o._ccFrame && o._dimmed) { o.set({ opacity: 1, selectable: true, evented: true }); o._dimmed = false; changed = true; }
    });
    if (changed) canvas.requestRenderAll();
  }

  // select-together (D8): clicking ONE frame that belongs to a group selects the whole group.
  function _expandGroups() {
    if (_filtering || !SC._active || global.__ccEnteredFrameId || global.histLocked || typeof _scFrameGroupOf !== 'function') return;
    var ao = canvas.getActiveObject();
    if (!ao || !ao._ccFrame) return;                 // only a single-frame selection
    var grp = _scFrameGroupOf(ao._frameId);
    if (!grp || grp.frameIds.length < 2) return;
    var fos = grp.frameIds.map(_frameObj).filter(Boolean);
    if (fos.length < 2) return;
    if (global._scLog) _scLog('EXPAND group', grp.name, '→', grp.frameIds.length, 'frames');
    _filtering = true;
    canvas.discardActiveObject();
    canvas.setActiveObject(new fabric.ActiveSelection(fos, { canvas: canvas }));
    canvas.requestRenderAll();
    _filtering = false;
  }

  function _modelOf(fo) { return (fo && typeof _scFindFrameModel === 'function') ? _scFindFrameModel(fo._frameId) : null; }
  function _single() {
    if (!SC._active || global.__ccEnteredFrameId) return null;
    var frames = global._scSelectedFrames();
    return frames.length === 1 ? frames[0] : null;
  }
  function _groupOfSelection() {
    var frames = global._scSelectedFrames();
    if (frames.length < 2 || typeof _scFrameGroupOf !== 'function') return null;
    var g0 = _scFrameGroupOf(frames[0]._frameId); if (!g0) return null;
    var same = frames.every(function (f) { var g = _scFrameGroupOf(f._frameId); return g && g.id === g0.id; });
    return same ? g0 : null;
  }

  // ── bar shell + per-mode content ──
  function _buildBar() {
    if (_bar) return;
    var host = _host(); if (!host) return;
    _bar = document.createElement('div');
    _bar.className = 'scfb';
    _bar.id = 'sc-frame-bar';
    var pop = document.createElement('div'); pop.className = 'scfb-pop'; _bar.appendChild(pop); _pop = pop;
    host.appendChild(_bar);
    _bar.addEventListener('click', _onBarClick);
  }

  function _renderSingle() {
    _bar.innerHTML =
      '<div class="scfb-label" data-act="rename" role="button" tabindex="0" title="Rename (click)"><span class="scfb-name"></span><span class="scfb-size"></span></div>' +
      '<span class="scfb-sep"></span>' +
      '<button class="scfb-btn" data-act="bg">' + _icon(['paint-bucket', 'palette', 'droplet']) + '<span>Background</span></button>' +
      '<button class="scfb-btn" data-act="size">' + _icon(['scaling', 'maximize']) + '<span>Custom</span><i class="scfb-cv"></i></button>' +
      '<button class="scfb-btn" data-act="tags">' + _icon(['tag', 'tags']) + '<span>Tags</span></button>' +
      '<button class="scfb-btn" data-act="download">' + _icon(['download', 'arrow-down-to-line']) + '<span>Download</span></button>';
    _appendPop();
  }
  function _renderMulti(n) {
    var grouped = !!_groupOfSelection();
    _bar.innerHTML =
      '<span class="scfb-label scfb-count">' + _icon(['layout-grid', 'frame'], 14) + '<b>' + n + '</b> frame</span>' +
      '<span class="scfb-sep"></span>' +
      '<button class="scfb-btn" data-act="bg">' + _icon(['paint-bucket', 'palette']) + '<span>Background</span></button>' +
      '<button class="scfb-btn" data-act="size">' + _icon(['scaling', 'maximize']) + '<span>Custom</span><i class="scfb-cv"></i></button>' +
      '<button class="scfb-btn" data-act="' + (grouped ? 'ungroup' : 'group') + '">' + _icon([grouped ? 'ungroup' : 'group', 'boxes']) + '<span>' + (grouped ? 'Ungroup' : 'Group') + '</span></button>' +
      '<button class="scfb-btn" data-act="align">' + _icon(['align-center-horizontal', 'align-horizontal-justify-center']) + '<span>Align</span><i class="scfb-cv"></i></button>' +
      '<button class="scfb-btn" data-act="download">' + _icon(['download']) + '<span>Download</span></button>';
    _appendPop();
  }
  function _appendPop() { if (_pop && _pop.parentNode !== _bar) { _bar.appendChild(_pop); } else if (!_pop) { _pop = document.createElement('div'); _pop.className = 'scfb-pop'; _bar.appendChild(_pop); } }

  function _onBarClick(e) {
    var btn = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!btn) return;
    var act = btn.getAttribute('data-act');
    var ids = _selectedIds(); if (!ids.length) return;
    if (global._scLog) _scLog('BAR click=', act, 'ids=', ids);
    if (act === 'rename') { var fo = _single(); if (fo) _rename(fo); return; }
    if (act === 'tags') { _closePop(); if (global.CCTagModal) CCTagModal.open({ target: { type: 'frame', id: ids[0] }, onChange: _renderFrameLabels }); return; }
    if (act === 'download') { _closePop(); ids.forEach(function (id) { if (typeof _scExportFrame === 'function') _scExportFrame(id); }); return; }
    if (act === 'group') { _closePop(); if (typeof _scGroupFrames === 'function') _scGroupFrames(ids); _reselect(ids); return; }
    if (act === 'ungroup') { _closePop(); var g = _groupOfSelection(); if (g && typeof _scUngroupFrames === 'function') _scUngroupFrames(g.id); _reselect(ids); return; }
    if (act === 'bg' || act === 'size' || act === 'align') { _togglePop(act, btn); return; }
  }
  function _reselect(ids) {
    if (global._scLog) _scLog('RESELECT ids=', ids, (typeof _scDumpFrames === 'function' ? '\n  ' + _scDumpFrames(ids) : ''));
    var fos = ids.map(_frameObj).filter(Boolean);
    _filtering = true; canvas.discardActiveObject();
    if (fos.length > 1) canvas.setActiveObject(new fabric.ActiveSelection(fos, { canvas: canvas }));
    else if (fos.length === 1) canvas.setActiveObject(fos[0]);
    _filtering = false; canvas.requestRenderAll();
    _mode = null; _positionBar();
  }

  // INLINE rename — no browser prompt: swap the name label for a text input in place.
  function _rename(fo) {
    if (!_bar) return;
    var nameEl = _bar.querySelector('.scfb-name');
    if (!nameEl || _bar.querySelector('.scfb-name-input')) return;
    var fr = _modelOf(fo);
    var input = document.createElement('input');
    input.className = 'scfb-name-input';
    input.type = 'text';
    input.value = (fr && fr.label) || fo.label || 'Frame';
    nameEl.style.display = 'none';
    nameEl.parentNode.insertBefore(input, nameEl);
    setTimeout(function () { try { input.focus(); input.select(); } catch (e) {} }, 0);
    var done = false;
    var commit = function (save) {
      if (done) return; done = true;
      if (save && typeof _scRenameFrame === 'function') _scRenameFrame(fo._frameId, input.value);
      if (input.parentNode) input.parentNode.removeChild(input);
      if (nameEl) nameEl.style.display = '';
      _mode = null; _positionBar();              // refresh the label + the on-canvas frame labels
    };
    input.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); commit(true); }
      else if (e.key === 'Escape') { e.preventDefault(); commit(false); }
    });
    input.addEventListener('blur', function () { commit(true); });
    input.addEventListener('click', function (e) { e.stopPropagation(); });
    input.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  }

  var BG_SWATCHES = ['#ffffff', '#f5f5f5', '#1f2937', '#000000', '#13243d', '#0f8f76', '#ef5b3b', '#f2ff58'];
  var RATIOS = [{ label: '1:1', w: 1080, h: 1080 }, { label: '16:9', w: 1920, h: 1080 }, { label: '9:16', w: 1080, h: 1920 }, { label: '4:3', w: 1024, h: 768 }, { label: '3:4', w: 768, h: 1024 }];
  var ALIGN = [
    { m: 'left', icons: ['align-start-vertical', 'align-left'], t: 'Left' },
    { m: 'centerH', icons: ['align-center-vertical'], t: 'Center horizontally' },
    { m: 'right', icons: ['align-end-vertical', 'align-right'], t: 'Right' },
    { sep: true },
    { m: 'top', icons: ['align-start-horizontal', 'align-top'], t: 'Top' },
    { m: 'middleV', icons: ['align-center-horizontal'], t: 'Center vertically' },
    { m: 'bottom', icons: ['align-end-horizontal', 'align-bottom'], t: 'Bottom' },
    { sep: true },
    { d: 'h', icons: ['align-horizontal-distribute-center', 'columns-3'], t: 'Distribute horizontally' },
    { d: 'v', icons: ['align-vertical-distribute-center', 'rows-3'], t: 'Distribute vertically' }
  ];

  function _togglePop(kind, btn) {
    if (_openPop === kind) { _closePop(); return; }
    _pop.innerHTML = (kind === 'bg') ? _bgPopHtml() : (kind === 'size') ? _sizePopHtml() : _alignPopHtml();
    _pop.setAttribute('data-pop', kind);
    _pop.classList.toggle('scfb-pop-align', kind === 'align');
    _pop.classList.add('show');
    _pop.style.left = (btn.offsetLeft + btn.offsetWidth / 2) + 'px';
    _openPop = kind;
    if (kind === 'bg') _wireBgPop(); else if (kind === 'size') _wireSizePop(); else _wireAlignPop();
  }
  function _closePop() { if (_pop) { _pop.classList.remove('show'); _pop.innerHTML = ''; } _openPop = null; }

  function _bgPopHtml() {
    var sw = BG_SWATCHES.map(function (c) { return '<button class="scfb-sw" data-bg="' + c + '" style="background:' + c + '" title="' + c + '"></button>'; }).join('');
    return '<div class="scfb-pop-row scfb-sw-row">' + sw + '<label class="scfb-sw scfb-sw-custom" title="Custom color"><input type="color" value="#ffffff"></label></div>' +
      '<button class="scfb-pop-act" data-bg="transparent">' + _icon(['ban', 'square'], 14) + ' Transparent</button>';
  }
  function _wireBgPop() {
    var ids = _selectedIds(); if (!ids.length) return;
    var apply = function (c) { ids.forEach(function (id) { if (typeof _scSetFrameBg === 'function') _scSetFrameBg(id, c); }); };
    var sws = _pop.querySelectorAll('[data-bg]');
    for (var i = 0; i < sws.length; i++) sws[i].addEventListener('click', function () { apply(this.getAttribute('data-bg')); _closePop(); });
    var ci = _pop.querySelector('input[type="color"]'); if (ci) ci.addEventListener('input', function () { apply(this.value); });
  }

  function _sizePopHtml() {
    var fo = _single(); var fr = _modelOf(fo);
    var rect = fr ? { w: fr.w, h: fr.h } : (fo ? global._scFrameRect(fo) : { w: 1080, h: 1080 });
    var ratios = RATIOS.map(function (r) { return '<button class="scfb-chip" data-w="' + r.w + '" data-h="' + r.h + '">' + r.label + '</button>'; }).join('');
    var groups = (typeof PRESET_GROUPS !== 'undefined' ? PRESET_GROUPS : []).map(function (g) {
      var items = g.presets.map(function (p) { return '<button class="scfb-preset" data-w="' + p.w + '" data-h="' + p.h + '"><span>' + _esc(p.name) + '</span><b>' + p.w + '×' + p.h + '</b></button>'; }).join('');
      return '<div class="scfb-pg"><div class="scfb-pg-h">' + _esc(g.group) + '</div>' + items + '</div>';
    }).join('');
    return '<div class="scfb-pop-row scfb-wh"><input type="number" class="scfb-in" id="scfb-w" value="' + rect.w + '" min="20" max="20000"><span class="scfb-x">×</span>' +
      '<input type="number" class="scfb-in" id="scfb-h" value="' + rect.h + '" min="20" max="20000"><button class="scfb-apply" data-act="apply">Apply</button></div>' +
      '<div class="scfb-pop-row scfb-ratios">' + ratios + '</div><div class="scfb-presets">' + groups + '</div>';
  }
  function _wireSizePop() {
    var ids = _selectedIds(); if (!ids.length) return;
    var apply = function (w, h) { ids.forEach(function (id) { if (typeof _scResizeFrame === 'function') _scResizeFrame(id, w, h); }); _reselect(ids); _closePop(); };
    var presets = _pop.querySelectorAll('[data-w]');
    for (var i = 0; i < presets.length; i++) presets[i].addEventListener('click', function () { apply(+this.getAttribute('data-w'), +this.getAttribute('data-h')); });
    var ab = _pop.querySelector('[data-act="apply"]');
    if (ab) ab.addEventListener('click', function () { var w = +(_pop.querySelector('#scfb-w') || {}).value, h = +(_pop.querySelector('#scfb-h') || {}).value; if (w > 0 && h > 0) apply(w, h); });
  }

  function _alignPopHtml() {
    return '<div class="scfb-pop-row scfb-align-row">' + ALIGN.map(function (a) {
      if (a.sep) return '<span class="scfb-align-sep"></span>';
      var key = a.m ? ('m="' + a.m + '"') : ('d="' + a.d + '"');
      return '<button class="scfb-align-btn" data-' + key + ' title="' + a.t + '">' + (_icon(a.icons, 16) || '<b>' + a.t.slice(0, 1) + '</b>') + '</button>';
    }).join('') + '</div>';
  }
  function _wireAlignPop() {
    var ids = _selectedIds(); if (ids.length < 2) return;
    var btns = _pop.querySelectorAll('.scfb-align-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        var m = this.getAttribute('data-m'), d = this.getAttribute('data-d');
        if (m && typeof _scAlignFrames === 'function') _scAlignFrames(_selectedIds(), m);
        else if (d && typeof _scDistributeFrames === 'function') _scDistributeFrames(_selectedIds(), d);
      });
    }
  }

  function _updateInfo(fo) {
    if (!_bar || !fo) return;
    var fr = _modelOf(fo), rect = global._scFrameRect(fo);
    var w = fr ? fr.w : rect.w, h = fr ? fr.h : rect.h;
    var nameEl = _bar.querySelector('.scfb-name'), sizeEl = _bar.querySelector('.scfb-size');
    if (nameEl) nameEl.textContent = (fr && fr.label) || fo.label || 'Frame';
    if (sizeEl) sizeEl.textContent = Math.round(w) + ' × ' + Math.round(h);
  }

  function _positionBar() {
    if (!_bar) return;
    var frames = global._scSelectedFrames();
    var n = frames.length;
    if (!SC._active || global.__ccEnteredFrameId || n === 0) { _bar.classList.remove('show'); _mode = null; _closePop(); return; }
    var mode = n === 1 ? 'single' : 'multi';
    if (mode !== _mode || (mode === 'multi' && _bar.querySelector('.scfb-count b') && +_bar.querySelector('.scfb-count b').textContent !== n)) {
      _closePop();
      if (mode === 'single') _renderSingle(); else _renderMulti(n);
      _mode = mode;
    }
    if (mode === 'single') _updateInfo(frames[0]);

    // bounding rect of the whole selection (single frame or activeSelection)
    var ao = canvas.getActiveObject();
    var b = ao.getBoundingRect();
    var canvasEl = canvas.lowerCanvasEl, r = canvasEl.getBoundingClientRect();
    var sx = r.width / canvas.getWidth(), sy = r.height / canvas.getHeight();
    var area = _host().getBoundingClientRect();
    var cx = r.left + (b.left + b.width / 2) * sx - area.left;
    var topY = r.top + b.top * sy - area.top;
    var barH = _bar.offsetHeight || 38;
    _bar.classList.add('show');
    _bar.style.left = cx + 'px';
    _bar.style.top = Math.max(barH + 8, topY - 12) + 'px';
  }

  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // G2: the frame's tags as little colour dots beside its on-canvas name label (max 4 + "+N").
  function _frameChipsHtml(id) {
    if (!global.CCTags) return '';
    var tags = CCTags.of({ type: 'frame', id: id });
    if (!tags.length) return '';
    var html = '<span class="scfb-flabel-tags">', max = 4;
    for (var i = 0; i < tags.length && i < max; i++) html += '<span class="scfb-ftag" style="background:' + _esc(tags[i].color) + '" title="' + _esc(tags[i].name) + '"></span>';
    if (tags.length > max) html += '<span class="scfb-ftag-more">+' + (tags.length - max) + '</span>';
    return html + '</span>';
  }

  // ── on-canvas frame NAME labels (Figma-style: the name sits just above each frame, follows pan/zoom) ──
  function _renderFrameLabels() {
    if (!SC._active) { if (_labelLayer) _labelLayer.style.display = 'none'; return; }
    var host = _host(); if (!host || !global.canvas) return;
    if (!_labelLayer) { _labelLayer = document.createElement('div'); _labelLayer.className = 'scfb-labels'; host.appendChild(_labelLayer); }
    _labelLayer.style.display = '';
    var frames = canvas.getObjects().filter(function (o) { return o._ccFrame && !o._isSleepThumb; });
    var canvasEl = canvas.lowerCanvasEl, r = canvasEl.getBoundingClientRect();
    var sx = r.width / canvas.getWidth(), sy = r.height / canvas.getHeight();
    var area = host.getBoundingClientRect();
    var seen = {};
    frames.forEach(function (fo) {
      var id = fo._frameId; if (!id) return; seen[id] = true;
      var el = _labelEls[id];
      if (!el) {
        el = document.createElement('div');
        el.className = 'scfb-flabel';
        el.addEventListener('mousedown', (function (frameObj) {
          return function (e) { e.stopPropagation(); try { canvas.discardActiveObject(); canvas.setActiveObject(frameObj); canvas.requestRenderAll(); } catch (er) {} };
        })(fo));
        _labelLayer.appendChild(el);
        _labelEls[id] = el;
      }
      el.innerHTML = '<span class="scfb-flabel-nm">' + _esc(fo.label || 'Frame') + '</span>' + _frameChipsHtml(id);
      el.title = fo.label || 'Frame';   // full name on hover (the visible label may be truncated to frame width)
      el.classList.toggle('on', fo === canvas.getActiveObject() || (fo.group && fo.group === canvas.getActiveObject()));
      var b = fo.getBoundingRect();
      el.style.left = (r.left + b.left * sx - area.left) + 'px';
      el.style.top = (r.top + b.top * sy - area.top - 19) + 'px';
      // Clamp to the frame's ON-SCREEN width so a long name truncates (ellipsis) instead of overflowing
      // into the neighbouring frame's label when zoomed out (Figma-style). Full name stays in the title.
      el.style.maxWidth = Math.max(40, b.width * sx) + 'px';
    });
    Object.keys(_labelEls).forEach(function (id) { if (!seen[id]) { if (_labelEls[id].parentNode) _labelEls[id].parentNode.removeChild(_labelEls[id]); delete _labelEls[id]; } });
  }

  global._scInitFrameBars = function () {
    if (_ready || !global.canvas) return;
    _ready = true;
    var c = global.canvas;
    _buildBar();
    var onSel = function (e) {
      if (!_filtering && typeof _scDedupeFrames === 'function' && _scDedupeFrames() > 0) return;   // clean phantom clones first
      var ao = canvas.getActiveObject();
      if (global._scLog) _scLog('SEL evt — ao=', ao && ao.type, 'frames=', global._scSelectedFrames().length, '\n  ', (typeof _scDumpFrames === 'function' ? _scDumpFrames(_selectedIds()) : ''));
      _undimStuck(); _filterSelectionToFrames(); _expandGroups(); _closePop(); _positionBar();
    };
    c.on('selection:created', onSel);
    c.on('selection:updated', onSel);
    c.on('selection:cleared', function () { _closePop(); _positionBar(); _renderFrameLabels(); });
    c.on('after:render', function () { _positionBar(); _renderFrameLabels(); });
    if (global.cc && cc.on) cc.on('tags:changed', function () { if (SC._active) _renderFrameLabels(); });
  };

  if (global.cc && cc.on) {
    cc.on('scene:active', function (on) {
      if (on) global._scInitFrameBars();
      else { if (_bar) { _bar.classList.remove('show'); _closePop(); } if (_labelLayer) _labelLayer.style.display = 'none'; }
    });
  }
  if (global.cc && cc.modules) {
    cc.modules.register({ id: 'frame-bars', parent: 'scene', title: 'scene: frame-bars', mount: function () {}, unmount: function () {} });
  }
})(window);
