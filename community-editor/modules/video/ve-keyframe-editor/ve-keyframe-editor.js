/* ═══════════════════════════════════════════════════════════════
   VE Keyframe Graph — value-graph editor over the selected clip's
   clip.keyframes (canonical VEKeyframes engine). Write-through:
   every edit lands in the clip immediately (live preview through
   the existing consumers), one undo entry per gesture.

   Scope notes:
   - Speed is deliberately NOT edited here: a speed curve re-derives
     the clip's timeline duration (an invariant owned by the Speed
     Curve tool). The graph edits value properties.
   - Properties shown = properties a consumer actually evaluates
     for this clip type (no ghost curves).
   ═══════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  var _panel = null;
  var _isOpen = false;
  var _canvas = null;
  var _ctx = null;
  var W = 760, H = 300;
  var PAD_L = 46, PAD_R = 12, PAD_T = 20, PAD_B = 16;
  var RULER_H = 20;

  var PROP_META = {
    opacity:  { color: '#f2ff58', label: 'Opacity',  fmt: function(v) { return v.toFixed(2); } },
    x:        { color: '#ffaa6b', label: 'X',        fmt: function(v) { return Math.round(v) + 'px'; } },
    y:        { color: '#aa6bff', label: 'Y',        fmt: function(v) { return Math.round(v) + 'px'; } },
    scaleX:   { color: '#ff6b6b', label: 'Scale X',  fmt: function(v) { return v.toFixed(2); } },
    scaleY:   { color: '#6bff6b', label: 'Scale Y',  fmt: function(v) { return v.toFixed(2); } },
    rotation: { color: '#6bcfff', label: 'Rotation', fmt: function(v) { return Math.round(v) + '°'; } },
    volume:   { color: '#6bffdf', label: 'Volume',   fmt: function(v) { return v.toFixed(2); } }
  };

  var EASE_OPTIONS = [
    { id: 'linear',     label: 'Linear' },
    { id: 'easeIn',     label: 'Ease In' },
    { id: 'easeOut',    label: 'Ease Out' },
    { id: 'easeInOut',  label: 'Ease In-Out' },
    { id: 'bounce',     label: 'Bounce' },
    { id: 'elastic',    label: 'Elastic' },
    { id: 'overshoot',  label: 'Overshoot' },
    { id: 'hold',       label: 'Hold (step)' },
    { id: 'bezier',     label: 'Bezier (handles)' }
  ];

  // Working state
  var _clipId = null;
  var _dur = 0;
  var _props = {};          // local editable copy: {prop: [kfs]}
  var _visible = {};
  var _active = null;
  var _t0 = 0, _t1 = 5;     // view window (seconds)
  var _sel = [];            // [{prop, idx}], last = primary
  var _drag = null;         // {mode, ...}
  var _marquee = null;
  var _dirty = true;
  var _pendingCommit = {};  // prop -> true (flushed on rAF)
  var _structural = false;  // needs full timeline re-render (diamonds)
  var _gestureDirty = false;
  var _rafId = null;
  var _syncTimer = null;
  var _loadedSig = '';
  var _yCache = {};         // prop -> {vmin, vmax}

  function _icon(name, sz) {
    if (typeof getIcon === 'function') { var r = getIcon(name, sz || 14); if (r) return r; }
    return '';
  }

  function _VE() { return window.__ccVideoEditor; }
  function _K() { return window.VEKeyframes; }

  function _clipById(id) {
    var VE = _VE();
    return (VE && VE._findClipById) ? VE._findClipById(id) : null;
  }

  // Overlay objects are selected on the fabric canvas, media clips on the timeline;
  // the graph binds to whichever is current (fabric selection wins: it is the finer intent).
  function _currentClip() {
    var VE = _VE();
    if (!VE) return null;
    if (typeof canvas !== 'undefined' && canvas && canvas.getActiveObject) {
      var obj = canvas.getActiveObject();
      if (obj && obj._veClipId) {
        var c = _clipById(obj._veClipId);
        if (c) return c;
      }
    }
    if (VE._veSelectedClips && VE._veSelectedClips.length) {
      return _clipById(VE._veSelectedClips[0]);
    }
    return null;
  }

  // Properties offered = properties a consumer actually evaluates for this clip type:
  // overlay via _veSyncOverlayVisibility (fabric objects, preview + export), media
  // transform/opacity via the compositor draw path (preview-render, export shares it),
  // volume via the playback loop gain + offline mixdown automation.
  function _animatableProps(clip) {
    if (!clip) return [];
    if (clip.type === 'overlay') return ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity'];
    if (clip.type === 'video') return ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity', 'volume'];
    if (clip.type === 'image') return ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity'];
    if (clip.type === 'audio') return ['volume'];
    return [];
  }

  function _fabricObjFor(clip) {
    if (typeof canvas === 'undefined' || !canvas || !clip) return null;
    var found = null;
    canvas.getObjects().forEach(function(o) { if (o._veClipId === clip.id) found = o; });
    return found;
  }

  // The clip's CURRENT pose supplies the default value for a first keyframe:
  // overlay clips read their fabric object, media clips their static transform/volume.
  function _currentValueOf(clip, prop) {
    if (_props[prop] && _props[prop].length) {
      return _K().evaluate({ keyframes: _props, startTime: 0 }, prop, _playheadLocal());
    }
    if (clip.type === 'overlay') {
      var obj = _fabricObjFor(clip);
      if (obj) {
        if (prop === 'x') return obj.left || 0;
        if (prop === 'y') return obj.top || 0;
        if (prop === 'scaleX') return obj.scaleX != null ? obj.scaleX : 1;
        if (prop === 'scaleY') return obj.scaleY != null ? obj.scaleY : 1;
        if (prop === 'rotation') return obj.angle || 0;
        if (prop === 'opacity') return obj.opacity != null ? obj.opacity : 1;
      }
    } else {
      var t = clip.transform || {};
      if (prop === 'x') return t.x || 0;
      if (prop === 'y') return t.y || 0;
      if (prop === 'scaleX' || prop === 'scaleY') return t.scale || 1;
      if (prop === 'rotation') return t.rotation || 0;
      if (prop === 'opacity') return 1;
      if (prop === 'volume') return clip.volume != null ? clip.volume : 1;
    }
    var range = _K().PROPERTIES[prop];
    return range ? range.default : 0;
  }

  function _playheadLocal() {
    var VE = _VE();
    var clip = _clipId ? _clipById(_clipId) : null;
    if (!VE || !clip) return 0;
    return Math.max(0, Math.min(_dur, VE._veProject.playheadTime - clip.startTime));
  }

  // ── panel DOM ──
  function _buildPanel() {
    if (_panel) return _panel;
    _panel = document.createElement('div');
    _panel.className = 've-keyframe-editor';

    var html = '';
    html += '<div class="ve-kfe-head">' +
      '<span class="ve-kfe-title">' + _icon('git-branch', 16) + ' Keyframe Graph</span>' +
      '<div class="ve-kfe-headr">' +
      '<span id="ve-kfe-clipname" class="ve-kfe-clipname"></span>' +
      '<button id="ve-kfe-close" class="ve-kfe-close" title="Close">&#10005;</button>' +
      '</div></div>';

    html += '<div id="ve-kfe-empty" class="ve-kfe-empty">' +
      '<div class="ve-kfe-empty-icon">' + _icon('mouse-pointer-click', 22) + '</div>' +
      '<div class="ve-kfe-empty-title" id="ve-kfe-empty-title">Select an element on the canvas</div>' +
      '<div class="ve-kfe-empty-hint" id="ve-kfe-empty-hint">Pick a text, image or shape overlay to animate its position, scale, rotation or opacity.</div>' +
      '<button id="ve-kfe-open-speed" class="ve-kfe-btn ve-kfe-hidden">' + _icon('activity', 12) + ' Open Speed Curve</button>' +
      '</div>';

    html += '<div id="ve-kfe-body" class="ve-kfe-body">';
    html += '<div class="ve-kfe-chips" id="ve-kfe-chips"></div>';
    html += '<div class="ve-kfe-canvas-wrap"><canvas id="ve-kfe-canvas" width="' + W + '" height="' + H + '"></canvas></div>';

    html += '<div class="ve-kfe-foot">' +
      '<button id="ve-kfe-add" class="ve-kfe-btn" title="Add a keyframe for the active property at the playhead">' + _icon('plus', 12) + ' Keyframe</button>' +
      '<button id="ve-kfe-del" class="ve-kfe-btn" title="Delete selected (Del)">' + _icon('trash-2', 12) + '</button>' +
      '<span class="ve-kfe-sep"></span>' +
      '<label class="ve-kfe-easelb">Ease <select id="ve-kfe-ease" class="ve-kfe-select" title="Easing of the segment entering the selected keyframe">';
    EASE_OPTIONS.forEach(function(o) { html += '<option value="' + o.id + '">' + o.label + '</option>'; });
    html += '</select></label>' +
      '<button id="ve-kfe-easy" class="ve-kfe-btn" title="Easy ease: smooth bezier in and out of the selected keyframe">' + _icon('spline', 12) + ' Easy</button>' +
      '<span class="ve-kfe-sep"></span>' +
      '<label class="ve-kfe-numlb">t <input id="ve-kfe-time" class="ve-kfe-num" type="number" step="0.01" min="0"></label>' +
      '<label class="ve-kfe-numlb">v <input id="ve-kfe-val" class="ve-kfe-num" type="number" step="0.01"></label>' +
      '<span class="ve-kfe-flex"></span>' +
      '<span id="ve-kfe-readout" class="ve-kfe-readout"></span>' +
      '<button id="ve-kfe-fit" class="ve-kfe-btn" title="Fit the whole clip in view">' + _icon('maximize-2', 12) + '</button>' +
      '</div>';
    html += '</div>';

    _panel.innerHTML = html;
    document.body.appendChild(_panel);

    _canvas = _panel.querySelector('#ve-kfe-canvas');
    _ctx = _canvas.getContext('2d');

    _panel.querySelector('#ve-kfe-close').addEventListener('click', _hide);
    _panel.querySelector('#ve-kfe-add').addEventListener('click', _addAtPlayhead);
    _panel.querySelector('#ve-kfe-del').addEventListener('click', _deleteSelected);
    _panel.querySelector('#ve-kfe-fit').addEventListener('click', function() { _fitView(); });
    _panel.querySelector('#ve-kfe-easy').addEventListener('click', _easyEase);
    _panel.querySelector('#ve-kfe-open-speed').addEventListener('click', function() {
      if (window.VESpeedCurve) VESpeedCurve.show();
    });

    _panel.querySelector('#ve-kfe-ease').addEventListener('change', function(e) {
      var p = _primary();
      if (!p) return;
      _setEasing(p, e.target.value);
    });

    _panel.querySelector('#ve-kfe-time').addEventListener('change', function(e) {
      var p = _primary();
      if (!p) return;
      var kf = _props[p.prop][p.idx];
      var v = parseFloat(e.target.value);
      if (isNaN(v)) return;
      kf.time = Math.max(0, Math.min(_dur, v));
      _resortKeepSelection(p.prop);
      _markCommit(p.prop, true);
      _pushGestureUndo('keyframe time');
    });
    _panel.querySelector('#ve-kfe-val').addEventListener('change', function(e) {
      var p = _primary();
      if (!p) return;
      var v = parseFloat(e.target.value);
      if (isNaN(v)) return;
      _props[p.prop][p.idx].value = v;
      _markCommit(p.prop, false);
      _pushGestureUndo('keyframe value');
    });

    _canvas.addEventListener('mousedown', _onMouseDown);
    _canvas.addEventListener('mousemove', _onMouseMove);
    _canvas.addEventListener('mouseleave', function() { _dirty = true; });
    _canvas.addEventListener('dblclick', _onDblClick);
    _canvas.addEventListener('wheel', _onWheel, { passive: false });
    window.addEventListener('mouseup', _onMouseUp);
    document.addEventListener('keydown', _onKeyDown);

    if (window.VEPanelHelpers) VEPanelHelpers.decorate(_panel);
    return _panel;
  }

  // ── state load / sync ──
  function _kfSig(clip) {
    if (!clip) return 'none';
    var kfs = (clip.keyframes && !Array.isArray(clip.keyframes)) ? clip.keyframes : {};
    var parts = [];
    for (var p in kfs) { if (p !== 'speed' && kfs[p] && kfs[p].length) parts.push(p + ':' + JSON.stringify(kfs[p])); }
    return clip.id + '|' + (clip.duration || 0).toFixed(4) + '|' + parts.join('|');
  }

  function _loadFromSelection() {
    var clip = _currentClip();
    var empty = _panel.querySelector('#ve-kfe-empty');
    var body = _panel.querySelector('#ve-kfe-body');
    var speedBtn = _panel.querySelector('#ve-kfe-open-speed');
    var props = _animatableProps(clip);

    if (!clip || !props.length) {
      _clipId = null; _sel = [];
      empty.style.display = 'flex';
      body.style.display = 'none';
      var title = _panel.querySelector('#ve-kfe-empty-title');
      var hint = _panel.querySelector('#ve-kfe-empty-hint');
      if (clip) {
        title.textContent = 'This clip type has no animatable properties';
        hint.textContent = 'Select a media clip or a canvas element. Speed ramps live in the Speed Curve tool.';
        if (clip.type === 'video' || clip.type === 'audio') speedBtn.classList.remove('ve-kfe-hidden');
        else speedBtn.classList.add('ve-kfe-hidden');
      } else {
        title.textContent = 'Select a clip or canvas element';
        hint.textContent = 'Pick a timeline clip or an overlay element to animate position, scale, rotation, opacity or volume.';
        speedBtn.classList.add('ve-kfe-hidden');
      }
      _loadedSig = _kfSig(clip);
      _dirty = true;
      return;
    }

    empty.style.display = 'none';
    body.style.display = 'flex';
    var isNewClip = _clipId !== clip.id;
    _clipId = clip.id;
    _dur = Math.max(0.01, clip.duration || 0.01);
    var kfsObj = _K() ? _K().ensureKeyframes(clip) : (clip.keyframes || {});
    _props = {};
    props.forEach(function(p) {
      _props[p] = kfsObj[p] ? JSON.parse(JSON.stringify(kfsObj[p])) : [];
      if (_visible[p] === undefined) _visible[p] = _props[p].length > 0;
      else if (_props[p].length && !_visible[p] && isNewClip) _visible[p] = true;
    });
    if (isNewClip || !_active || !(_active in _props)) {
      _active = null;
      props.forEach(function(p) { if (!_active && _props[p].length) _active = p; });
      if (!_active) _active = props[0];
      _visible[_active] = true;
      _sel = [];
      _fitView();
    }
    var nameEl = _panel.querySelector('#ve-kfe-clipname');
    if (nameEl) nameEl.textContent = clip.name || (clip._fabricType ? clip._fabricType : 'Clip');
    _loadedSig = _kfSig(clip);
    _renderChips(props);
    _syncFieldStates();
    _dirty = true;
  }

  function _syncTick() {
    if (!_isOpen || _drag) return;
    var clip = _currentClip();
    if (_kfSig(clip) !== _loadedSig) _loadFromSelection();
  }

  function _freshen() {
    _syncTick();
    return !!(_clipId && _active);
  }

  // ── chips ──
  function _renderChips(props) {
    var host = _panel.querySelector('#ve-kfe-chips');
    var html = '';
    props.forEach(function(p) {
      var m = PROP_META[p];
      var on = !!_visible[p];
      var act = p === _active;
      html += '<button class="ve-kfe-chip' + (on ? ' on' : '') + (act ? ' act' : '') + '" data-prop="' + p + '"' +
        ' style="--chip:' + m.color + '">' +
        '<span class="ve-kfe-chip-dot" data-dot="' + p + '" title="Show/hide curve"></span>' +
        m.label + (_props[p] && _props[p].length ? ' <span class="ve-kfe-chip-n">' + _props[p].length + '</span>' : '') +
        '</button>';
    });
    host.innerHTML = html;
    host.querySelectorAll('.ve-kfe-chip').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        var p = btn.dataset.prop;
        if (e.target.dataset && e.target.dataset.dot) {
          _visible[p] = !_visible[p];
          if (!_visible[p]) _sel = _sel.filter(function(s) { return s.prop !== p; });
        } else {
          _active = p;
          _visible[p] = true;
        }
        _renderChips(_animatableProps(_clipById(_clipId)));
        _syncFieldStates();
        _dirty = true;
      });
    });
  }

  // ── selection helpers ──
  function _primary() { return _sel.length ? _sel[_sel.length - 1] : null; }
  function _isSelected(prop, idx) {
    for (var i = 0; i < _sel.length; i++) if (_sel[i].prop === prop && _sel[i].idx === idx) return true;
    return false;
  }

  function _syncFieldStates() {
    var p = _primary();
    var easeSel = _panel.querySelector('#ve-kfe-ease');
    var tIn = _panel.querySelector('#ve-kfe-time');
    var vIn = _panel.querySelector('#ve-kfe-val');
    var delBtn = _panel.querySelector('#ve-kfe-del');
    var easyBtn = _panel.querySelector('#ve-kfe-easy');
    var has = !!(p && _props[p.prop] && _props[p.prop][p.idx]);
    [easeSel, tIn, vIn, delBtn, easyBtn].forEach(function(el) { if (el) el.disabled = !has; });
    if (has) {
      var kf = _props[p.prop][p.idx];
      easeSel.value = kf.easing && EASE_OPTIONS.some(function(o) { return o.id === kf.easing; }) ? kf.easing : 'linear';
      tIn.value = kf.time.toFixed(2);
      vIn.value = (Math.round(kf.value * 1000) / 1000);
    } else {
      tIn.value = ''; vIn.value = '';
    }
  }

  // ── write-through ──
  function _markCommit(prop, structural) {
    _pendingCommit[prop] = true;
    if (structural) _structural = true;
    _gestureDirty = true;
    _dirty = true;
  }

  function _flushCommits() {
    var clip = _clipId ? _clipById(_clipId) : null;
    var K = _K();
    var VE = _VE();
    if (!clip || !K || !VE) { _pendingCommit = {}; return; }
    var any = false;
    for (var prop in _pendingCommit) {
      K.setPropertyKeyframes(clip, prop, _props[prop]);
      any = true;
    }
    _pendingCommit = {};
    if (any) {
      if (_structural && VE._veRender) { VE._veRender(); _structural = false; }
      if (VE._veRenderPreviewFrame) VE._veRenderPreviewFrame();
      _loadedSig = _kfSig(clip);
    }
  }

  function _pushGestureUndo(label) {
    var VE = _VE();
    if (!_gestureDirty || !VE) return;
    _flushCommits();
    if (VE._vePushUndo) VE._vePushUndo(label || 'keyframe edit');
    _gestureDirty = false;
    _syncFieldStates();
    _renderChips(_animatableProps(_clipById(_clipId)));
  }

  function _resortKeepSelection(prop) {
    var arr = _props[prop];
    var selKfs = _sel.filter(function(s) { return s.prop === prop; }).map(function(s) { return arr[s.idx]; });
    arr.sort(function(a, b) { return a.time - b.time; });
    _sel = _sel.filter(function(s) { return s.prop !== prop; });
    selKfs.forEach(function(kf) {
      var idx = arr.indexOf(kf);
      if (idx >= 0) _sel.push({ prop: prop, idx: idx });
    });
  }

  // ── operations ──
  function _addAtPlayhead() {
    if (!_freshen()) return;
    var clip = _clipById(_clipId);
    var t = _playheadLocal();
    var v = _currentValueOf(clip, _active);
    _insertKeyframe(_active, t, v, 'easeInOut');
    _pushGestureUndo('keyframe add');
  }

  function _insertKeyframe(prop, t, v, easing) {
    var arr = _props[prop];
    for (var i = 0; i < arr.length; i++) {
      if (Math.abs(arr[i].time - t) < 0.011) {
        arr[i].value = v;
        _sel = [{ prop: prop, idx: i }];
        _markCommit(prop, false);
        _syncFieldStates();
        return;
      }
    }
    var kf = { time: Math.round(t * 100) / 100, value: v, easing: easing || 'linear' };
    arr.push(kf);
    arr.sort(function(a, b) { return a.time - b.time; });
    _sel = [{ prop: prop, idx: arr.indexOf(kf) }];
    _visible[prop] = true;
    _markCommit(prop, true);
    _syncFieldStates();
  }

  function _deleteSelected() {
    if (!_sel.length) return;
    var byProp = {};
    _sel.forEach(function(s) { (byProp[s.prop] = byProp[s.prop] || []).push(s.idx); });
    for (var prop in byProp) {
      byProp[prop].sort(function(a, b) { return b - a; }).forEach(function(idx) {
        _props[prop].splice(idx, 1);
      });
      _markCommit(prop, true);
    }
    _sel = [];
    _pushGestureUndo('keyframe delete');
  }

  function _setEasing(p, easing) {
    var arr = _props[p.prop];
    var kf = arr[p.idx];
    kf.easing = easing;
    if (easing === 'bezier') {
      // seed editable handles as linear equivalents (curve shape unchanged until dragged)
      var prev = arr[p.idx - 1];
      if (prev) {
        var span = kf.time - prev.time;
        var dv = (kf.value - prev.value) / 3;
        if (!prev.hOut) prev.hOut = { dt: span / 3, dv: dv };
        if (!kf.hIn) kf.hIn = { dt: -span / 3, dv: -dv };
      }
    } else {
      delete kf.hIn;
      var next = arr[p.idx + 1];
      if (!next || next.easing !== 'bezier') delete kf.hOut;
    }
    _markCommit(p.prop, false);
    _pushGestureUndo('keyframe ease');
  }

  function _easyEase() {
    var p = _primary();
    if (!p) return;
    var arr = _props[p.prop];
    var kf = arr[p.idx];
    var prev = arr[p.idx - 1];
    var next = arr[p.idx + 1];
    if (prev) {
      kf.easing = 'bezier';
      var spanIn = kf.time - prev.time;
      prev.hOut = { dt: spanIn / 3, dv: 0 };
      kf.hIn = { dt: -spanIn / 3, dv: 0 };
    }
    if (next) {
      next.easing = 'bezier';
      var spanOut = next.time - kf.time;
      kf.hOut = { dt: spanOut / 3, dv: 0 };
      if (!next.hIn) next.hIn = { dt: -spanOut / 3, dv: 0 };
    }
    _markCommit(p.prop, false);
    _pushGestureUndo('easy ease');
  }

  // ── view mapping ──
  function _fitView() {
    _t0 = 0;
    _t1 = Math.max(0.1, _dur);
    _dirty = true;
  }

  function _timeToX(t) { return PAD_L + ((t - _t0) / (_t1 - _t0)) * (W - PAD_L - PAD_R); }
  function _xToTime(x) { return _t0 + ((x - PAD_L) / (W - PAD_L - PAD_R)) * (_t1 - _t0); }

  function _yRange(prop) {
    if (_yCache[prop]) return _yCache[prop];
    var arr = _props[prop] || [];
    var vmin = Infinity, vmax = -Infinity;
    arr.forEach(function(kf) {
      if (kf.value < vmin) vmin = kf.value;
      if (kf.value > vmax) vmax = kf.value;
      if (kf.hIn) { var a = kf.value + kf.hIn.dv; if (a < vmin) vmin = a; if (a > vmax) vmax = a; }
      if (kf.hOut) { var b = kf.value + kf.hOut.dv; if (b < vmin) vmin = b; if (b > vmax) vmax = b; }
    });
    if (!arr.length) { vmin = 0; vmax = 1; }
    if (vmax - vmin < 1e-9) {
      var spanDefault = { opacity: 0.5, scaleX: 0.5, scaleY: 0.5, rotation: 45, x: 100, y: 100, volume: 0.5 }[prop] || 1;
      vmin -= spanDefault; vmax += spanDefault;
    }
    var pad = (vmax - vmin) * 0.14;
    var r = { vmin: vmin - pad, vmax: vmax + pad };
    _yCache[prop] = r;
    return r;
  }

  function _valueToY(v, prop) {
    var r = _yRange(prop);
    var n = (v - r.vmin) / (r.vmax - r.vmin);
    return PAD_T + RULER_H + (1 - n) * (H - PAD_T - RULER_H - PAD_B);
  }
  function _yToValue(y, prop) {
    var r = _yRange(prop);
    var n = 1 - (y - PAD_T - RULER_H) / (H - PAD_T - RULER_H - PAD_B);
    return r.vmin + n * (r.vmax - r.vmin);
  }

  function _niceStep(span, target) {
    var raw = span / target;
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag;
    var step = norm < 1.5 ? 1 : (norm < 3.5 ? 2 : (norm < 7.5 ? 5 : 10));
    return step * mag;
  }

  // ── drawing ──
  function _fake() { return { keyframes: _props, startTime: 0, duration: _dur }; }

  function _draw() {
    _yCache = {};
    _ctx.clearRect(0, 0, W, H);
    var plotT = PAD_T + RULER_H, plotB = H - PAD_B, plotR = W - PAD_R;
    var K = _K();
    if (!K || !_clipId) return;

    // ruler strip
    _ctx.fillStyle = '#101013';
    _ctx.fillRect(0, 0, W, PAD_T + RULER_H - 6);
    var step = _niceStep(_t1 - _t0, 8);
    var tStart = Math.ceil(_t0 / step) * step;
    _ctx.font = '9px sans-serif';
    _ctx.textAlign = 'center';
    for (var t = tStart; t <= _t1 + 1e-9; t += step) {
      var x = _timeToX(t);
      if (x < PAD_L - 1 || x > plotR + 1) continue;
      _ctx.strokeStyle = '#1e1e24'; _ctx.lineWidth = 1;
      _ctx.beginPath(); _ctx.moveTo(x, plotT - 4); _ctx.lineTo(x, plotB); _ctx.stroke();
      _ctx.fillStyle = '#6a6a74';
      _ctx.fillText((step < 0.1 ? t.toFixed(2) : (step < 1 ? t.toFixed(1) : Math.round(t))) + 's', x, 13);
    }
    // clip bounds shading (outside 0..dur)
    _ctx.fillStyle = 'rgba(0,0,0,0.35)';
    if (_t0 < 0) _ctx.fillRect(PAD_L, plotT, Math.max(0, _timeToX(0) - PAD_L), plotB - plotT);
    if (_t1 > _dur) { var xd = _timeToX(_dur); _ctx.fillRect(xd, plotT, plotR - xd, plotB - plotT); }

    // curves
    var props = Object.keys(_props);
    props.forEach(function(prop) {
      if (!_visible[prop]) return;
      var arr = _props[prop];
      var m = PROP_META[prop];
      var isActive = prop === _active;
      if (!arr.length) return;
      var n = 220;
      _ctx.strokeStyle = m.color;
      _ctx.lineWidth = isActive ? 2 : 1.2;
      _ctx.globalAlpha = isActive ? 1 : 0.45;
      _ctx.beginPath();
      for (var i = 0; i <= n; i++) {
        var tt = _t0 + (i / n) * (_t1 - _t0);
        var vv = K.evaluate(_fake(), prop, Math.max(0, Math.min(_dur, tt)));
        var xx = _timeToX(tt);
        var yy = _valueToY(vv, prop);
        if (i === 0) _ctx.moveTo(xx, yy); else _ctx.lineTo(xx, yy);
      }
      _ctx.stroke();
      _ctx.globalAlpha = 1;

      // keys
      arr.forEach(function(kf, idx) {
        var kx = _timeToX(kf.time), ky = _valueToY(kf.value, prop);
        if (kx < PAD_L - 8 || kx > plotR + 8) return;
        var selected = _isSelected(prop, idx);
        _ctx.save();
        _ctx.translate(kx, ky);
        _ctx.rotate(Math.PI / 4);
        _ctx.fillStyle = selected ? '#ffffff' : m.color;
        _ctx.globalAlpha = isActive || selected ? 1 : 0.55;
        _ctx.fillRect(-4.5, -4.5, 9, 9);
        if (selected) { _ctx.strokeStyle = m.color; _ctx.lineWidth = 2; _ctx.strokeRect(-4.5, -4.5, 9, 9); }
        _ctx.restore();
        _ctx.globalAlpha = 1;
      });
    });

    // bezier handles for the primary selection
    var p = _primary();
    if (p && _props[p.prop] && _props[p.prop][p.idx]) {
      var m2 = PROP_META[p.prop];
      var hs = _handlePoints(p);
      hs.forEach(function(h) {
        _ctx.strokeStyle = m2.color; _ctx.globalAlpha = 0.6; _ctx.lineWidth = 1;
        _ctx.beginPath();
        _ctx.moveTo(_timeToX(h.anchorT), _valueToY(h.anchorV, p.prop));
        _ctx.lineTo(_timeToX(h.t), _valueToY(h.v, p.prop));
        _ctx.stroke();
        _ctx.globalAlpha = 1;
        _ctx.fillStyle = '#ffffff';
        _ctx.beginPath(); _ctx.arc(_timeToX(h.t), _valueToY(h.v, p.prop), 3.5, 0, Math.PI * 2); _ctx.fill();
        _ctx.fillStyle = m2.color;
        _ctx.beginPath(); _ctx.arc(_timeToX(h.t), _valueToY(h.v, p.prop), 2, 0, Math.PI * 2); _ctx.fill();
      });
    }

    // playhead
    var local = _playheadLocal();
    var phx = _timeToX(local);
    if (phx >= PAD_L && phx <= plotR) {
      _ctx.strokeStyle = '#ef4444'; _ctx.lineWidth = 1.5;
      _ctx.beginPath(); _ctx.moveTo(phx, plotT - 6); _ctx.lineTo(phx, plotB); _ctx.stroke();
      _ctx.fillStyle = '#ef4444';
      _ctx.beginPath(); _ctx.moveTo(phx - 5, plotT - 6); _ctx.lineTo(phx + 5, plotT - 6); _ctx.lineTo(phx, plotT); _ctx.fill();
    }

    // marquee
    if (_marquee) {
      _ctx.strokeStyle = 'rgba(242,255,88,0.8)';
      _ctx.fillStyle = 'rgba(242,255,88,0.08)';
      _ctx.lineWidth = 1;
      var mx = Math.min(_marquee.x0, _marquee.x1), my = Math.min(_marquee.y0, _marquee.y1);
      var mw = Math.abs(_marquee.x1 - _marquee.x0), mh = Math.abs(_marquee.y1 - _marquee.y0);
      _ctx.fillRect(mx, my, mw, mh);
      _ctx.strokeRect(mx, my, mw, mh);
    }

    // empty-curve CTA for the active property
    if (_active && _props[_active] && !_props[_active].length) {
      _ctx.fillStyle = '#6a6a74';
      _ctx.font = '11px sans-serif';
      _ctx.textAlign = 'center';
      _ctx.fillText('No ' + PROP_META[_active].label + ' keyframes. Double-click the graph or press + Keyframe.', (PAD_L + plotR) / 2, (plotT + plotB) / 2);
    }

    // readout
    var ro = _panel.querySelector('#ve-kfe-readout');
    if (ro) {
      var pp = _primary();
      if (pp && _props[pp.prop] && _props[pp.prop][pp.idx]) {
        var k3 = _props[pp.prop][pp.idx];
        ro.textContent = PROP_META[pp.prop].label + ' ' + PROP_META[pp.prop].fmt(k3.value) + ' @ ' + k3.time.toFixed(2) + 's';
      } else ro.textContent = '';
    }
  }

  // handle dots for the primary selected keyframe (segment-in when kf is bezier,
  // segment-out when the NEXT keyframe is bezier)
  function _handlePoints(p) {
    var arr = _props[p.prop];
    var kf = arr[p.idx];
    var out = [];
    var prev = arr[p.idx - 1];
    var next = arr[p.idx + 1];
    if (kf.easing === 'bezier' && prev) {
      var hIn = kf.hIn || { dt: -(kf.time - prev.time) / 3, dv: (prev.value - kf.value) / 3 };
      out.push({ kind: 'in', t: kf.time + hIn.dt, v: kf.value + hIn.dv, anchorT: kf.time, anchorV: kf.value });
    }
    if (next && next.easing === 'bezier') {
      var hOut = kf.hOut || { dt: (next.time - kf.time) / 3, dv: (next.value - kf.value) / 3 };
      out.push({ kind: 'out', t: kf.time + hOut.dt, v: kf.value + hOut.dv, anchorT: kf.time, anchorV: kf.value });
    }
    return out;
  }

  // ── interaction ──
  function _canvasXY(e) {
    var rect = _canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (W / rect.width), y: (e.clientY - rect.top) * (H / rect.height) };
  }

  function _hitKey(pos) {
    var best = null, bestD = 110;
    Object.keys(_props).forEach(function(prop) {
      if (!_visible[prop]) return;
      _props[prop].forEach(function(kf, idx) {
        var kx = _timeToX(kf.time), ky = _valueToY(kf.value, prop);
        var dx = pos.x - kx, dy = pos.y - ky;
        var d = dx * dx + dy * dy;
        if (d < bestD) { best = { prop: prop, idx: idx }; bestD = d; }
      });
    });
    return best;
  }

  function _hitHandle(pos) {
    var p = _primary();
    if (!p || !_props[p.prop] || !_props[p.prop][p.idx]) return null;
    var hs = _handlePoints(p);
    for (var i = 0; i < hs.length; i++) {
      var hx = _timeToX(hs[i].t), hy = _valueToY(hs[i].v, p.prop);
      var dx = pos.x - hx, dy = pos.y - hy;
      if (dx * dx + dy * dy < 90) return hs[i];
    }
    return null;
  }

  function _hitCurve(pos) {
    if (!_active || !_props[_active] || !_props[_active].length) return null;
    var t = _xToTime(pos.x);
    if (t < 0 || t > _dur) return null;
    var v = _K().evaluate(_fake(), _active, t);
    var y = _valueToY(v, _active);
    if (Math.abs(pos.y - y) < 7) return { t: t, v: v };
    return null;
  }

  function _onMouseDown(e) {
    if (!_freshen()) return;
    var pos = _canvasXY(e);

    // ruler strip: scrub-seek
    if (pos.y < PAD_T + RULER_H - 6) {
      _drag = { mode: 'scrub' };
      _scrubTo(pos.x);
      return;
    }

    var h = _hitHandle(pos);
    if (h) {
      _drag = { mode: 'handle', kind: h.kind };
      return;
    }

    var hit = _hitKey(pos);
    if (hit) {
      if (e.shiftKey) {
        if (!_isSelected(hit.prop, hit.idx)) _sel.push(hit);
      } else if (!_isSelected(hit.prop, hit.idx)) {
        _sel = [hit];
      } else {
        _sel = _sel.filter(function(s) { return !(s.prop === hit.prop && s.idx === hit.idx); });
        _sel.push(hit); // make primary
      }
      _active = hit.prop;
      _drag = { mode: 'key', startX: pos.x, startY: pos.y, orig: _sel.map(function(s) {
        return { prop: s.prop, idx: s.idx, time: _props[s.prop][s.idx].time, value: _props[s.prop][s.idx].value };
      }) };
      _renderChips(_animatableProps(_clipById(_clipId)));
      _syncFieldStates();
      _dirty = true;
      return;
    }

    var onCurve = _hitCurve(pos);
    if (onCurve) {
      _insertKeyframe(_active, onCurve.t, Math.round(onCurve.v * 1000) / 1000, 'linear');
      var pIdx = _primary();
      _drag = { mode: 'key', startX: pos.x, startY: pos.y, orig: [{ prop: pIdx.prop, idx: pIdx.idx, time: _props[pIdx.prop][pIdx.idx].time, value: _props[pIdx.prop][pIdx.idx].value }] };
      return;
    }

    // empty space: marquee (shift keeps existing selection)
    if (!e.shiftKey) _sel = [];
    _marquee = { x0: pos.x, y0: pos.y, x1: pos.x, y1: pos.y };
    _drag = { mode: 'marquee' };
    _syncFieldStates();
    _dirty = true;
  }

  function _scrubTo(x) {
    var VE = _VE();
    var clip = _clipById(_clipId);
    if (!VE || !clip) return;
    var t = Math.max(0, Math.min(_dur, _xToTime(x)));
    if (VE._veSeek) VE._veSeek(clip.startTime + t);
    else { VE._veProject.playheadTime = clip.startTime + t; if (VE._veRenderPreviewFrame) VE._veRenderPreviewFrame(); }
    _dirty = true;
  }

  function _onMouseMove(e) {
    var pos = _canvasXY(e);
    if (!_drag) {
      var cur = 'default';
      if (pos.y < PAD_T + RULER_H - 6) cur = 'ew-resize';
      else if (_hitHandle(pos) || _hitKey(pos)) cur = 'grab';
      else if (_hitCurve(pos)) cur = 'copy';
      _canvas.style.cursor = cur;
      return;
    }

    if (_drag.mode === 'scrub') { _scrubTo(pos.x); return; }

    if (_drag.mode === 'marquee') {
      _marquee.x1 = pos.x; _marquee.y1 = pos.y;
      var mx0 = Math.min(_marquee.x0, _marquee.x1), mx1 = Math.max(_marquee.x0, _marquee.x1);
      var my0 = Math.min(_marquee.y0, _marquee.y1), my1 = Math.max(_marquee.y0, _marquee.y1);
      _sel = [];
      Object.keys(_props).forEach(function(prop) {
        if (!_visible[prop]) return;
        _props[prop].forEach(function(kf, idx) {
          var kx = _timeToX(kf.time), ky = _valueToY(kf.value, prop);
          if (kx >= mx0 && kx <= mx1 && ky >= my0 && ky <= my1) _sel.push({ prop: prop, idx: idx });
        });
      });
      _dirty = true;
      return;
    }

    if (_drag.mode === 'handle') {
      var p = _primary();
      if (!p) return;
      var arr = _props[p.prop];
      var kf = arr[p.idx];
      var t = _xToTime(pos.x), v = _yToValue(pos.y, p.prop);
      if (_drag.kind === 'in') {
        var prev = arr[p.idx - 1];
        var spanIn = prev ? (kf.time - prev.time) : 1;
        kf.hIn = { dt: Math.max(-spanIn, Math.min(0, t - kf.time)), dv: v - kf.value };
      } else {
        var next = arr[p.idx + 1];
        var spanOut = next ? (next.time - kf.time) : 1;
        kf.hOut = { dt: Math.max(0, Math.min(spanOut, t - kf.time)), dv: v - kf.value };
      }
      _markCommit(p.prop, false);
      return;
    }

    if (_drag.mode === 'key') {
      var dt = _xToTime(pos.x) - _xToTime(_drag.startX);
      var single = _drag.orig.length === 1;
      var axisLockTime = e.shiftKey && Math.abs(pos.x - _drag.startX) < Math.abs(pos.y - _drag.startY);
      var axisLockVal = e.shiftKey && !axisLockTime;
      _drag.orig.forEach(function(o) {
        var arr2 = _props[o.prop];
        var kf2 = arr2[o.idx];
        if (!kf2) return;
        if (!axisLockTime) {
          var nt = o.time + dt;
          var lo = o.idx > 0 ? arr2[o.idx - 1].time + 0.011 : 0;
          var hi = o.idx < arr2.length - 1 ? arr2[o.idx + 1].time - 0.011 : _dur;
          // playhead snap
          var ph = _playheadLocal();
          if (Math.abs(nt - ph) < (_t1 - _t0) * 0.008) nt = ph;
          kf2.time = Math.max(lo, Math.min(hi, Math.round(nt * 100) / 100));
        }
        if (single && !axisLockVal) {
          var dvPix = _yToValue(pos.y, o.prop) - _yToValue(_drag.startY, o.prop);
          kf2.value = Math.round((o.value + dvPix) * 1000) / 1000;
        }
        _markCommit(o.prop, false);
      });
      _syncFieldStates();
      return;
    }
  }

  function _onMouseUp() {
    if (!_drag) return;
    var mode = _drag.mode;
    _drag = null;
    if (mode === 'marquee') { _marquee = null; _syncFieldStates(); _dirty = true; return; }
    if (mode === 'scrub') return;
    _pushGestureUndo(mode === 'handle' ? 'keyframe handle' : 'keyframe move');
  }

  function _onDblClick(e) {
    if (!_freshen()) return;
    var pos = _canvasXY(e);
    if (pos.y < PAD_T + RULER_H - 6) return;
    if (_hitKey(pos)) return;
    var t = Math.max(0, Math.min(_dur, _xToTime(pos.x)));
    var v = _props[_active] && _props[_active].length
      ? _yToValue(pos.y, _active)
      : _currentValueOf(_clipById(_clipId), _active);
    _insertKeyframe(_active, t, Math.round(v * 1000) / 1000, 'linear');
    _pushGestureUndo('keyframe add');
  }

  function _onWheel(e) {
    if (!_clipId) return;
    e.preventDefault();
    var pos = _canvasXY(e);
    var span = _t1 - _t0;
    if (e.shiftKey) {
      var shift = span * (e.deltaY > 0 ? 0.12 : -0.12);
      _t0 += shift; _t1 += shift;
    } else {
      var factor = e.deltaY > 0 ? 1.18 : 1 / 1.18;
      var pivot = _xToTime(pos.x);
      var newSpan = Math.max(0.05, Math.min(span * factor, Math.max(0.1, _dur) * 3));
      _t0 = pivot - (pivot - _t0) * (newSpan / span);
      _t1 = _t0 + newSpan;
    }
    // keep some part of the clip in view
    if (_t1 < 0.02) { _t1 = 0.02; _t0 = _t1 - span; }
    if (_t0 > _dur - 0.02) { _t0 = _dur - 0.02; _t1 = _t0 + span; }
    _dirty = true;
  }

  function _onKeyDown(e) {
    if (!_isOpen) return;
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) return;
    if (!_sel.length) return;
    if (!_panel.contains(document.activeElement) && document.activeElement !== document.body) return;
    e.preventDefault();
    e.stopPropagation();
    _deleteSelected();
  }

  // ── loop / lifecycle ──
  function _rafLoop() {
    if (!_isOpen) { _rafId = null; return; }
    var hasPending = false;
    for (var k in _pendingCommit) { hasPending = true; break; }
    if (hasPending) _flushCommits();
    var VE = _VE();
    var playing = VE && VE._vePlayback && VE._vePlayback.playing;
    if (_dirty || playing || hasPending) { _draw(); _dirty = false; }
    _rafId = requestAnimationFrame(_rafLoop);
  }

  function _show() {
    _buildPanel();
    _panel.style.display = 'flex';
    _isOpen = true;
    _loadFromSelection();
    _dirty = true;
    if (!_rafId) _rafId = requestAnimationFrame(_rafLoop);
    if (!_syncTimer) _syncTimer = setInterval(_syncTick, 500);
    var host = document.getElementById('ve-timeline-host');
    if (host && !host._veKfeSyncBound) {
      host._veKfeSyncBound = true;
      host.addEventListener('mousedown', function() { setTimeout(_syncTick, 0); }, true);
    }
    if (typeof canvas !== 'undefined' && canvas && canvas.on && !canvas._veKfeSyncBound) {
      canvas._veKfeSyncBound = true;
      var canvasSync = function() { if (_isOpen) setTimeout(_syncTick, 0); };
      canvas.on('selection:created', canvasSync);
      canvas.on('selection:updated', canvasSync);
      canvas.on('selection:cleared', canvasSync);
    }
  }

  function _hide() {
    if (_panel) _panel.style.display = 'none';
    _isOpen = false;
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
    if (_syncTimer) { clearInterval(_syncTimer); _syncTimer = null; }
  }

  function _toggle() { _isOpen ? _hide() : _show(); }

  window.VEKeyframeEditor = {
    show: _show, hide: _hide, toggle: _toggle,
    isOpen: function() { return _isOpen; },
    refresh: function() { if (_isOpen) _loadFromSelection(); },
    addAtPlayhead: function() { if (!_isOpen) _show(); _addAtPlayhead(); }
  };
})();

// Modular skeleton hook — ve-keyframe-editor is a video loader module (modules/video/). Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-keyframe-editor', parent: 'video', title: 've-keyframe-editor', mount: function () {}, unmount: function () {} });
