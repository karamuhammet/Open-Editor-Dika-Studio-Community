/* ═══════════════════════════════════════════════════════════════
   VE Speed Curve — per-clip speed ramp editor on the canonical
   keyframe engine. Edits clip.keyframes.speed via
   VEKeyframes.applySpeedCurve (source span conserved, timeline
   duration derived from the curve). Presets populate REAL editable
   speed points; every apply is one undo step.
   ═══════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  var _panel = null;
  var _isOpen = false;
  var _canvas = null;
  var _ctx = null;
  var W = 480, H = 220;
  var PAD_L = 34, PAD_R = 14, PAD_T = 12, PAD_B = 18;

  var SPEED_MIN = 0.1, SPEED_MAX = 8;
  var LOG_MIN = Math.log(SPEED_MIN), LOG_MAX = Math.log(SPEED_MAX);

  // Working state (all in the CURRENT clip timebase; reloaded after every apply
  // because applySpeedCurve rescales keyframe times into the new duration).
  var _clipId = null;
  var _kfs = null;          // working copy of speed keyframes [{time,value,easing}]
  var _dur = 0;             // clip duration the working copy is based on
  var _selIdx = -1;         // selected point index
  var _dragIdx = -1;
  var _dragMoved = false;
  var _hover = null;        // {time, speed} under cursor for readout
  var _dirty = true;
  var _rafId = null;
  var _syncTimer = null;
  var _loadedSig = '';

  // CapCut-style preset curves (normalized time 0..1). Points become real,
  // editable keyframes; nothing is a canned constant.
  var PRESETS = [
    { id: 'linear',    label: 'Linear',
      pts: [ { t: 0, v: 1, e: 'linear' }, { t: 1, v: 1, e: 'linear' } ] },
    { id: 'montage',   label: 'Montage',
      pts: [ { t: 0, v: 1, e: 'linear' }, { t: 0.35, v: 0.6, e: 'easeInOut' }, { t: 0.65, v: 2.2, e: 'easeInOut' }, { t: 1, v: 1, e: 'easeInOut' } ] },
    { id: 'hero',      label: 'Hero',
      pts: [ { t: 0, v: 0.5, e: 'linear' }, { t: 0.5, v: 3, e: 'easeInOut' }, { t: 1, v: 0.5, e: 'easeInOut' } ] },
    { id: 'bullet',    label: 'Bullet',
      pts: [ { t: 0, v: 2.5, e: 'linear' }, { t: 0.4, v: 2.5, e: 'linear' }, { t: 0.5, v: 0.1, e: 'easeInOut' }, { t: 0.6, v: 0.1, e: 'linear' }, { t: 0.7, v: 2.5, e: 'easeInOut' }, { t: 1, v: 2.5, e: 'linear' } ] },
    { id: 'jump-cut',  label: 'Jump Cut',
      pts: [ { t: 0, v: 1, e: 'linear' }, { t: 0.33, v: 3, e: 'hold' }, { t: 0.66, v: 1, e: 'hold' }, { t: 1, v: 1, e: 'hold' } ] },
    { id: 'flash-in',  label: 'Flash In',
      pts: [ { t: 0, v: 4, e: 'linear' }, { t: 0.3, v: 1, e: 'easeOut' }, { t: 1, v: 1, e: 'linear' } ] },
    { id: 'flash-out', label: 'Flash Out',
      pts: [ { t: 0, v: 1, e: 'linear' }, { t: 0.7, v: 1, e: 'linear' }, { t: 1, v: 4, e: 'easeIn' } ] }
  ];

  var EASE_OPTIONS = [
    { id: 'linear',    label: 'Linear' },
    { id: 'easeIn',    label: 'Ease In' },
    { id: 'easeOut',   label: 'Ease Out' },
    { id: 'easeInOut', label: 'Ease In-Out' },
    { id: 'hold',      label: 'Hold (step)' }
  ];

  function _icon(name, sz) {
    if (typeof getIcon === 'function') { var r = getIcon(name, sz || 14); if (r) return r; }
    return '';
  }

  function _VE() { return window.__ccVideoEditor; }

  function _selClip() {
    var VE = _VE();
    if (!VE || !VE._veSelectedClips || !VE._veSelectedClips.length) return null;
    var c = VE._findClipById ? VE._findClipById(VE._veSelectedClips[0]) : null;
    if (!c) return null;
    if (c.type !== 'video' && c.type !== 'audio') return null;
    return c;
  }

  function _clipById(id) {
    var VE = _VE();
    return (VE && VE._findClipById) ? VE._findClipById(id) : null;
  }

  // ── coordinate mapping (log speed axis: equal visual weight for 0.5x and 2x) ──
  function _plotW() { return W - PAD_L - PAD_R; }
  function _plotH() { return H - PAD_T - PAD_B; }
  function _speedToY(s) {
    var n = (Math.log(Math.max(SPEED_MIN, Math.min(SPEED_MAX, s))) - LOG_MIN) / (LOG_MAX - LOG_MIN);
    return PAD_T + (1 - n) * _plotH();
  }
  function _yToSpeed(y) {
    var n = 1 - (y - PAD_T) / _plotH();
    n = Math.max(0, Math.min(1, n));
    return Math.exp(LOG_MIN + n * (LOG_MAX - LOG_MIN));
  }
  function _timeToX(t) { return PAD_L + (_dur > 0 ? (t / _dur) : 0) * _plotW(); }
  function _xToTime(x) {
    var n = (x - PAD_L) / _plotW();
    return Math.max(0, Math.min(1, n)) * _dur;
  }

  function _fakeClip() { return { startTime: 0, duration: _dur, speed: 1, trimStart: 0, keyframes: { speed: _kfs } }; }

  function _curveSpeedAt(t) {
    if (!window.VEKeyframes || !_kfs || !_kfs.length) return 1;
    return VEKeyframes.evaluate(_fakeClip(), 'speed', t);
  }

  function _avgSpeed() {
    if (!_kfs || !_kfs.length || _dur <= 0) return 1;
    var n = 200, sum = 0;
    for (var i = 0; i <= n; i++) sum += _curveSpeedAt(i / n * _dur);
    return sum / (n + 1);
  }

  // ── panel ──
  function _buildPanel() {
    if (_panel) return _panel;
    _panel = document.createElement('div');
    _panel.className = 've-speed-curve';

    var html = '';
    html += '<div class="ve-sc-head">' +
      '<span class="ve-sc-title">' + _icon('activity', 16) + ' Speed Curve</span>' +
      '<div class="ve-sc-headr">' +
      '<span id="ve-sc-clipname" class="ve-sc-clipname"></span>' +
      '<span id="ve-sc-readout" class="ve-sc-readout"></span>' +
      '<button id="ve-sc-close" class="ve-sc-close" title="Close">&#10005;</button>' +
      '</div></div>';

    html += '<div id="ve-sc-empty" class="ve-sc-empty">' +
      '<div class="ve-sc-empty-icon">' + _icon('mouse-pointer-click', 22) + '</div>' +
      '<div class="ve-sc-empty-title">Select a video or audio clip</div>' +
      '<div class="ve-sc-empty-hint">Click a clip on the timeline, then shape its speed here. Presets give you a starting curve you can drag further.</div>' +
      '</div>';

    html += '<div id="ve-sc-body" class="ve-sc-body">';
    html += '<div class="ve-sc-canvas-wrap"><canvas id="ve-sc-canvas" width="' + W + '" height="' + H + '"></canvas></div>';

    html += '<div class="ve-sc-presets" id="ve-sc-presets">';
    PRESETS.forEach(function(p) {
      html += '<button class="ve-sc-preset" data-id="' + p.id + '">' + p.label + '</button>';
    });
    html += '</div>';

    html += '<div class="ve-sc-foot">' +
      '<label class="ve-sc-easelb">Ease <select id="ve-sc-ease" class="ve-sc-ease" title="Easing of the segment entering the selected point">';
    EASE_OPTIONS.forEach(function(o) { html += '<option value="' + o.id + '">' + o.label + '</option>'; });
    html += '</select></label>' +
      '<button id="ve-sc-delpt" class="ve-sc-btn" title="Delete selected point (Del)">' + _icon('trash-2', 12) + ' Point</button>' +
      '<span class="ve-sc-flex"></span>' +
      '<span id="ve-sc-durinfo" class="ve-sc-durinfo"></span>' +
      '<button id="ve-sc-reset" class="ve-sc-btn" title="Remove the curve, back to constant 1x">Reset 1x</button>' +
      '</div>';
    html += '</div>';

    _panel.innerHTML = html;
    document.body.appendChild(_panel);

    _canvas = _panel.querySelector('#ve-sc-canvas');
    _ctx = _canvas.getContext('2d');

    _panel.querySelector('#ve-sc-close').addEventListener('click', _hide);
    _panel.querySelector('#ve-sc-reset').addEventListener('click', _resetCurve);
    _panel.querySelector('#ve-sc-delpt').addEventListener('click', _deleteSelected);

    _panel.querySelector('#ve-sc-presets').addEventListener('click', function(e) {
      var btn = e.target.closest('.ve-sc-preset');
      if (btn) _applyPreset(btn.dataset.id);
    });

    _panel.querySelector('#ve-sc-ease').addEventListener('change', function(e) {
      if (_selIdx < 0 || !_kfs || !_kfs[_selIdx]) return;
      _kfs[_selIdx].easing = e.target.value;
      _applyWorking('speed curve ease');
    });

    _canvas.addEventListener('mousedown', _onMouseDown);
    _canvas.addEventListener('mousemove', _onMouseMove);
    _canvas.addEventListener('mouseleave', function() { _hover = null; _dirty = true; });
    _canvas.addEventListener('dblclick', _onDblClick);
    window.addEventListener('mouseup', _onMouseUp);
    document.addEventListener('keydown', _onKeyDown);

    if (window.VEPanelHelpers) VEPanelHelpers.decorate(_panel);
    return _panel;
  }

  // ── state load / sync ──
  function _stateSig(clip) {
    if (!clip) return 'none';
    return clip.id + '|' + (clip.duration || 0).toFixed(4) + '|' +
      JSON.stringify((clip.keyframes && !Array.isArray(clip.keyframes) && clip.keyframes.speed) || []);
  }

  function _loadFromSelection() {
    var clip = _selClip();
    var empty = _panel.querySelector('#ve-sc-empty');
    var body = _panel.querySelector('#ve-sc-body');
    if (!clip) {
      _clipId = null; _kfs = null; _selIdx = -1;
      empty.style.display = 'flex';
      body.style.display = 'none';
      _loadedSig = 'none';
      return;
    }
    empty.style.display = 'none';
    body.style.display = 'flex';
    _clipId = clip.id;
    _dur = Math.max(0.01, clip.duration || 0.01);
    var src = (window.VEKeyframes ? VEKeyframes.ensureKeyframes(clip) : (clip.keyframes || {})).speed;
    if (src && src.length) {
      _kfs = JSON.parse(JSON.stringify(src));
    } else {
      var cs = clip.speed || 1;
      _kfs = [ { time: 0, value: cs, easing: 'linear' }, { time: _dur, value: cs, easing: 'linear' } ];
    }
    if (_selIdx >= _kfs.length) _selIdx = -1;
    var nameEl = _panel.querySelector('#ve-sc-clipname');
    if (nameEl) nameEl.textContent = clip.name || 'Clip';
    _loadedSig = _stateSig(clip);
    _updateDurInfo();
    _updateEaseSelect();
    _dirty = true;
  }

  function _syncTick() {
    if (!_isOpen || _dragIdx >= 0) return;
    var clip = _selClip();
    var sig = _stateSig(clip);
    if (sig !== _loadedSig) _loadFromSelection();
  }

  // Interaction entry points must not act on a stale working copy: the clip can change
  // under an open panel (Inspector Rate field, undo, another tool) faster than the sync
  // interval. Returns true when the working state is usable.
  function _freshen() {
    _syncTick();
    return !!(_clipId && _kfs);
  }

  // ── apply path (THE only write: engine + undo + render) ──
  function _applyWorking(undoLabel) {
    var clip = _clipId ? _clipById(_clipId) : null;
    var VE = _VE();
    if (!clip || !window.VEKeyframes || !VE) return;
    VEKeyframes.applySpeedCurve(clip, _kfs);
    if (VE._vePushUndo) VE._vePushUndo(undoLabel || 'speed curve');
    if (VE._veRender) VE._veRender();
    if (VE._veRenderPreviewFrame) VE._veRenderPreviewFrame();
    _loadFromSelection(); // times were rescaled into the new duration
  }

  function _applyPreset(id) {
    var preset = null;
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) preset = PRESETS[i];
    if (!preset || !_freshen()) return;
    var clip = _clipById(_clipId);
    if (!clip) return;
    _kfs = preset.pts.map(function(p) {
      return { time: p.t * _dur, value: p.v, easing: p.e };
    });
    _selIdx = -1;
    _applyWorking('speed preset ' + preset.label);
    _flashPreset(id);
    if (typeof showToast === 'function') showToast('Speed curve: ' + preset.label);
  }

  function _flashPreset(id) {
    if (!_panel) return;
    _panel.querySelectorAll('.ve-sc-preset').forEach(function(b) {
      b.classList.toggle('active', b.dataset.id === id);
    });
  }

  function _resetCurve() {
    var clip = _clipId ? _clipById(_clipId) : null;
    var VE = _VE();
    if (!clip || !window.VEKeyframes || !VE) return;
    VEKeyframes.clearSpeedKeyframes(clip);
    if (VE._vePushUndo) VE._vePushUndo('speed curve reset');
    if (VE._veRender) VE._veRender();
    if (VE._veRenderPreviewFrame) VE._veRenderPreviewFrame();
    _selIdx = -1;
    _flashPreset('');
    _loadFromSelection();
    if (typeof showToast === 'function') showToast('Speed reset to constant 1x');
  }

  function _deleteSelected() {
    if (_selIdx < 0 || !_kfs) return;
    if (_kfs.length <= 2) {
      if (typeof showToast === 'function') showToast('A curve needs at least 2 points', 'warning');
      return;
    }
    _kfs.splice(_selIdx, 1);
    _selIdx = -1;
    _applyWorking('speed curve point delete');
  }

  function _updateEaseSelect() {
    var sel = _panel && _panel.querySelector('#ve-sc-ease');
    if (!sel) return;
    var lb = _panel.querySelector('.ve-sc-easelb');
    if (_selIdx >= 0 && _kfs && _kfs[_selIdx]) {
      lb.classList.remove('ve-sc-disabled');
      sel.disabled = false;
      var e = _kfs[_selIdx].easing || 'linear';
      sel.value = (e === 'bezier') ? 'easeInOut' : e;
    } else {
      lb.classList.add('ve-sc-disabled');
      sel.disabled = true;
    }
  }

  function _updateDurInfo() {
    var el = _panel && _panel.querySelector('#ve-sc-durinfo');
    if (!el) return;
    var clip = _clipId ? _clipById(_clipId) : null;
    if (!clip || !window.VEKeyframes) { el.textContent = ''; return; }
    var span = VEKeyframes.getSourceSpan(clip);
    var avg = _avgSpeed();
    var newDur = Math.max(0.05, span / Math.max(0.001, avg));
    if (Math.abs(newDur - clip.duration) < 0.02) {
      el.textContent = 'Duration ' + clip.duration.toFixed(2) + 's';
    } else {
      el.textContent = 'Duration ' + clip.duration.toFixed(2) + 's, becomes ' + newDur.toFixed(2) + 's';
    }
  }

  // ── canvas interaction ──
  function _canvasXY(e) {
    var rect = _canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (W / rect.width), y: (e.clientY - rect.top) * (H / rect.height) };
  }

  function _hitPoint(pos) {
    if (!_kfs) return -1;
    var best = -1, bestD = 121; // 11px radius
    for (var i = 0; i < _kfs.length; i++) {
      var px = _timeToX(_kfs[i].time), py = _speedToY(_kfs[i].value);
      var dx = pos.x - px, dy = pos.y - py;
      var d = dx * dx + dy * dy;
      if (d < bestD) { best = i; bestD = d; }
    }
    return best;
  }

  function _onMouseDown(e) {
    if (!_freshen()) return;
    var pos = _canvasXY(e);
    var hit = _hitPoint(pos);
    _selIdx = hit;
    _dragIdx = hit;
    _dragMoved = false;
    _updateEaseSelect();
    _dirty = true;
  }

  function _onMouseMove(e) {
    if (!_kfs) return;
    var pos = _canvasXY(e);
    if (_dragIdx >= 0) {
      var kf = _kfs[_dragIdx];
      var isFirst = _dragIdx === 0, isLast = _dragIdx === _kfs.length - 1;
      // endpoints move vertically only so the curve always spans the clip
      if (!isFirst && !isLast) {
        var t = _xToTime(pos.x);
        var lo = _kfs[_dragIdx - 1].time + 0.02;
        var hi = _kfs[_dragIdx + 1].time - 0.02;
        kf.time = Math.max(lo, Math.min(hi, t));
      }
      var s = _yToSpeed(pos.y);
      if (Math.abs(s - 1) < 0.07) s = 1; // snap to 1x
      kf.value = Math.round(s * 100) / 100;
      _dragMoved = true;
      _hover = { time: kf.time, speed: kf.value };
      _updateDurInfo();
      _dirty = true;
    } else {
      var t2 = _xToTime(pos.x);
      _hover = { time: t2, speed: _curveSpeedAt(t2) };
      _canvas.style.cursor = _hitPoint(pos) >= 0 ? 'grab' : 'crosshair';
      _dirty = true;
    }
  }

  function _onMouseUp() {
    if (_dragIdx >= 0 && _dragMoved) {
      _dragIdx = -1;
      _applyWorking('speed curve edit');
    }
    _dragIdx = -1;
  }

  function _onDblClick(e) {
    if (!_freshen()) return;
    var pos = _canvasXY(e);
    if (_hitPoint(pos) >= 0) return;
    var t = _xToTime(pos.x);
    var kf = { time: t, value: Math.round(_curveSpeedAt(t) * 100) / 100, easing: 'easeInOut' };
    _kfs.push(kf);
    _kfs.sort(function(a, b) { return a.time - b.time; });
    _selIdx = _kfs.indexOf(kf);
    _applyWorking('speed curve point add');
  }

  function _onKeyDown(e) {
    if (!_isOpen) return;
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) return;
    if (_selIdx < 0) return;
    if (!_panel.contains(document.activeElement) && document.activeElement !== document.body) return;
    e.preventDefault();
    e.stopPropagation();
    _deleteSelected();
  }

  // ── drawing ──
  function _draw() {
    _ctx.clearRect(0, 0, W, H);
    if (!_kfs) return;

    var plotR = W - PAD_R, plotB = H - PAD_B;

    // grid: log-spaced speed lines
    var gridSpeeds = [0.1, 0.25, 0.5, 1, 2, 4, 8];
    _ctx.font = '9px sans-serif';
    _ctx.textAlign = 'right';
    gridSpeeds.forEach(function(s) {
      var y = _speedToY(s);
      _ctx.strokeStyle = s === 1 ? '#3a3a42' : '#1e1e24';
      _ctx.lineWidth = 1;
      if (s === 1) _ctx.setLineDash([4, 3]);
      _ctx.beginPath(); _ctx.moveTo(PAD_L, y); _ctx.lineTo(plotR, y); _ctx.stroke();
      _ctx.setLineDash([]);
      _ctx.fillStyle = s === 1 ? '#9a9aa4' : '#55555e';
      _ctx.fillText(s + 'x', PAD_L - 5, y + 3);
    });

    // time gridlines
    var tStep = _dur > 20 ? 5 : (_dur > 8 ? 2 : (_dur > 3 ? 1 : 0.5));
    _ctx.textAlign = 'center';
    for (var t = 0; t <= _dur + 0.001; t += tStep) {
      var x = _timeToX(Math.min(t, _dur));
      _ctx.strokeStyle = '#1e1e24'; _ctx.lineWidth = 1;
      _ctx.beginPath(); _ctx.moveTo(x, PAD_T); _ctx.lineTo(x, plotB); _ctx.stroke();
      _ctx.fillStyle = '#55555e';
      _ctx.fillText(t.toFixed(t % 1 === 0 ? 0 : 1) + 's', x, H - 6);
    }

    // the true engine-interpolated curve (hold steps render as steps, eases as curves)
    var n = 240;
    _ctx.strokeStyle = '#f2ff58';
    _ctx.lineWidth = 2;
    _ctx.beginPath();
    for (var i = 0; i <= n; i++) {
      var tt = i / n * _dur;
      var y2 = _speedToY(_curveSpeedAt(tt));
      var x2 = _timeToX(tt);
      if (i === 0) _ctx.moveTo(x2, y2); else _ctx.lineTo(x2, y2);
    }
    _ctx.stroke();

    // area fill under curve (subtle)
    _ctx.lineTo(_timeToX(_dur), plotB);
    _ctx.lineTo(_timeToX(0), plotB);
    _ctx.closePath();
    _ctx.fillStyle = 'rgba(242,255,88,0.06)';
    _ctx.fill();

    // playhead
    var VE = _VE();
    if (VE && VE._veProject && _clipId) {
      var clip = _clipById(_clipId);
      if (clip) {
        var local = VE._veProject.playheadTime - clip.startTime;
        if (local >= 0 && local <= _dur) {
          var phx = _timeToX(local);
          _ctx.strokeStyle = '#ef4444'; _ctx.lineWidth = 1.5;
          _ctx.beginPath(); _ctx.moveTo(phx, PAD_T); _ctx.lineTo(phx, plotB); _ctx.stroke();
        }
      }
    }

    // points
    for (var k = 0; k < _kfs.length; k++) {
      var px = _timeToX(_kfs[k].time), py = _speedToY(_kfs[k].value);
      var isSel = k === _selIdx;
      _ctx.fillStyle = isSel ? '#ffffff' : '#f2ff58';
      _ctx.beginPath(); _ctx.arc(px, py, isSel ? 6 : 5, 0, Math.PI * 2); _ctx.fill();
      _ctx.fillStyle = '#0b0b0d';
      _ctx.beginPath(); _ctx.arc(px, py, isSel ? 3 : 2.5, 0, Math.PI * 2); _ctx.fill();
    }

    // hover readout
    var ro = _panel.querySelector('#ve-sc-readout');
    if (ro) {
      ro.textContent = _hover
        ? _hover.speed.toFixed(2) + 'x @ ' + _hover.time.toFixed(2) + 's'
        : '';
    }
  }

  function _rafLoop() {
    if (!_isOpen) { _rafId = null; return; }
    var VE = _VE();
    var playing = VE && VE._vePlayback && VE._vePlayback.playing;
    if (_dirty || playing) { _draw(); _dirty = false; }
    _rafId = requestAnimationFrame(_rafLoop);
  }

  // ── open/close ──
  function _show() {
    _buildPanel();
    _panel.style.display = 'flex';
    _isOpen = true;
    _loadFromSelection();
    _dirty = true;
    if (!_rafId) _rafId = requestAnimationFrame(_rafLoop);
    if (!_syncTimer) _syncTimer = setInterval(_syncTick, 500);
    // snappy re-sync on timeline clicks while open
    var host = document.getElementById('ve-timeline-host');
    if (host && !host._veScSyncBound) {
      host._veScSyncBound = true;
      host.addEventListener('mousedown', function() { setTimeout(_syncTick, 0); }, true);
    }
  }

  function _hide() {
    if (_panel) _panel.style.display = 'none';
    _isOpen = false;
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
    if (_syncTimer) { clearInterval(_syncTimer); _syncTimer = null; }
  }

  function _toggle() { _isOpen ? _hide() : _show(); }

  window.VESpeedCurve = {
    show: _show, hide: _hide, toggle: _toggle,
    isOpen: function() { return _isOpen; },
    PRESETS: PRESETS
  };
})();

// Modular skeleton hook — ve-speed-curve is a video loader module (modules/video/). Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-speed-curve', parent: 'video', title: 've-speed-curve', mount: function () {}, unmount: function () {} });
