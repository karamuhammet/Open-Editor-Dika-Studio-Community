/* VE Multi-Cam Monitor — the grid + program view + LIVE CUTTING (Phase E).
   Replaces BOTH old shells (ve-multicam-ui and advanced-panels' _veShowMultiCamPanel), which
   are removed in the demolition phase.

   What the old ones got wrong, and what this one does instead:
     - Their "switch" wrote to a private array (`_switchTimeline`) whose getter had zero
       consumers, so a cut never reached the project. Here a switch is a REAL
       _veSplitAtPlayhead + _veMcSwitchAngle on the resulting right half, inside one undo
       group, so one switch = one cut = one undo step.
     - Both panels used the DOM id `ve-multicam-panel`, so opening one silently deleted the
       other and then failed to open itself. This panel owns `ve-mc-monitor` and resolves
       every node through panel-scoped querySelector — never document.getElementById.

   What the old one got RIGHT and is kept: monitor cells render PRIVATE cloned elements. A
   pool element is a single DOM node; putting it in a visible cell would physically move it
   out of its offscreen holder and make the compositor and the monitor two writers of the
   same currentTime. Cells clone; they never borrow.

   Plan: docs/multicam-rebuild-plan-v2.md  (Phase E) */
(function () {
  'use strict';

  var _p = null;          // panel root — everything is queried from THIS, never from document
  var _open = false;
  var _clipId = null;     // the multicam clip being monitored
  var _cells = {};        // angleIdx -> <video>
  var _raf = null;
  var _rafWin = null;     // window whose rAF is driving the loop (main, or the popped-out one)
  var _lastSyncT = -1;
  var _grid = 'auto';     // 'auto' | '2x2' | '3x3' | '4x4' — user's choice wins (both Premiere
                          // and Resolve keep this under user control; auto-shrinking to the
                          // angle count was a regression against the old shell)
  var _taught = false;    // one-time explainer; neither Premiere nor Resolve teaches this
                          // workflow at all, which is exactly why we should
  var _win = null;        // popped-out window (dual-monitor mode)
  var GEOM_KEY = 'cc_mc_geom';

  function _VE() { return window.__ccVideoEditor; }
  function _icon(n, s) { return (typeof getIcon === 'function' && getIcon(n, s || 14)) || ''; }
  function _toast(m, t) { if (typeof showToast === 'function') showToast(m, t); }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#6366f1'];

  /* ── the clip under the playhead wins; else the selected one; else the first ── */
  function _pickClip() {
    var VE = _VE();
    if (!VE || !VE._veProject) return null;
    var t = VE._veProject.playheadTime || 0;
    var sel = VE._veSelectedClips || [];
    var all = [];
    VE._veProject.tracks.forEach(function (tr) {
      tr.clips.forEach(function (c) { if (VE._veMcIsMulticam(c)) all.push(c); });
    });
    if (!all.length) return null;
    var under = all.filter(function (c) { return t >= c.startTime && t < c.startTime + c.duration; });
    if (under.length) {
      var s = under.filter(function (c) { return sel.indexOf(c.id) > -1; });
      return (s[0] || under[0]);
    }
    var sc = all.filter(function (c) { return sel.indexOf(c.id) > -1; });
    return sc[0] || all[0];
  }

  function _clip() {
    var VE = _VE();
    if (!VE || !_clipId) return null;
    return VE._findClipById(_clipId);
  }

  /* Local time inside angle `i` for the current playhead.
     A clip sits on the shared sync axis at (trimStart + activeAngle.offset); the playhead's
     progress inside the clip moves along that axis, and each angle reads it back through its
     own offset. Same convention as VE._veMcTrimForAngle. */
  function _angleLocalTime(clip, i) {
    var VE = _VE();
    var act = VE._veMcActiveAngle(clip);
    var a = VE._veMcGetAngle(clip, i);
    if (!a) return 0;
    var t = VE._veProject.playheadTime || 0;
    var shared = (clip.trimStart || 0) + ((act && act.offset) || 0) + (t - (clip.startTime || 0));
    return Math.max(0, shared - (a.offset || 0));
  }

  /* ── cells: private clones of the parked angle sources ── */
  function _buildCells(clip) {
    var VE = _VE();
    var grid = _p.querySelector('#ve-mcm-grid');
    if (!grid) return;
    Object.keys(_cells).forEach(function (k) {
      try { _cells[k].pause(); } catch (e) {}
      if (_cells[k].parentNode) _cells[k].parentNode.removeChild(_cells[k]);
    });
    _cells = {};
    grid.innerHTML = '';

    var n = VE._veMcAngleCount(clip);
    // Hidden angles are display-only: they keep their index (so 1-9 never renumbers behind the
    // user's back) and are simply not drawn.
    var shown = [];
    for (var q = 0; q < n; q++) {
      var ang = VE._veMcGetAngle(clip, q);
      if (ang && !ang.hidden) shown.push(q);
    }
    // Grid: the user's pick wins; 'auto' falls back to a sensible square. Slots beyond the
    // angle count are drawn as placeholders rather than collapsing the grid — Premiere does
    // the same (unused slots render as black boxes) and it keeps the layout readable.
    var vis = shown.length;
    var cols = _grid === 'auto' ? (vis <= 4 ? 2 : (vis <= 9 ? 3 : 4)) : parseInt(_grid, 10);
    var slots = _grid === 'auto' ? vis : cols * cols;
    grid.style.gridTemplateColumns = 'repeat(' + cols + ',1fr)';

    for (var i = 0; i < vis && i < slots; i++) {
      (function (idx) {
        var a = VE._veMcGetAngle(clip, idx);
        var color = COLORS[idx % COLORS.length];
        var cell = document.createElement('div');
        cell.className = 've-mcm-cell';
        cell.dataset.i = String(idx);

        var srcEl = VE._veMcGetSource(a.srcId);
        var url = a.src || (srcEl && (srcEl.src || srcEl.currentSrc));
        if (url) {
          var v = document.createElement('video');
          v.src = url; v.muted = true; v.playsInline = true; v.preload = 'auto';
          v.className = 've-mcm-vid';
          cell.appendChild(v);
          _cells[idx] = v;
        } else {
          var ph = document.createElement('div');
          ph.className = 've-mcm-ph';
          ph.style.color = color;
          ph.textContent = String(idx + 1);
          cell.appendChild(ph);
        }

        var lbl = document.createElement('div');
        lbl.className = 've-mcm-lbl';
        lbl.innerHTML = '<b style="color:' + color + '">' + (idx + 1) + '</b> ' + _esc(a.label || ('Kamera ' + (idx + 1)));
        cell.appendChild(lbl);

        var live = document.createElement('div');
        live.className = 've-mcm-live';
        live.textContent = 'CANLI';
        cell.appendChild(live);

        // Click = cut at the playhead. Alt+click = switch THIS segment's angle with no cut.
        // Resolve's model (Option-click), deliberately not Premiere's, whose same-key-means-
        // two-things-depending-on-play-state is the #1 confusion in Adobe's own forums.
        cell.addEventListener('click', function (e) { _cut(idx, e.altKey); });
        grid.appendChild(cell);
      })(shown[i]);   // the REAL angle index — the loop counter only walks visible ones
    }

    // Placeholders for the unused slots of a fixed grid.
    for (var s = vis; s < slots; s++) {
      var empty = document.createElement('div');
      empty.className = 've-mcm-cell ve-mcm-empty';
      empty.textContent = 'Empty';
      grid.appendChild(empty);
    }
    _paintActive(clip);
  }

  function _paintActive(clip) {
    var act = clip ? (clip.mcActive || 0) : -1;
    _p.querySelectorAll('.ve-mcm-cell').forEach(function (c) {
      var on = parseInt(c.dataset.i, 10) === act;
      c.classList.toggle('is-live', on);
      if (on) c.style.borderColor = COLORS[act % COLORS.length];
      else c.style.borderColor = '';
    });
    var name = _p.querySelector('#ve-mcm-active');
    var VE = _VE();
    if (name && clip) {
      var a = VE._veMcActiveAngle(clip);
      name.textContent = (a && a.label) || ('Kamera ' + (act + 1));
      name.style.color = COLORS[act % COLORS.length];
    }
  }

  /* ── THE gesture ──
     cut=false (Alt): re-point THIS segment's angle, no cut. Lets you fix a wrong choice or
                      try an angle without littering the timeline.
     cut=true:        split at the playhead and put the new angle on the right half.
     If the playhead is not strictly inside the clip a cut is impossible, so we degrade to a
     switch and SAY SO rather than silently doing something else — that silent branch was the
     original "neye göre ayarlanıyor" complaint. */
  function _cut(idx, switchOnly) {
    var VE = _VE();
    var clip = _clip();
    if (!clip) return;
    if (idx === (clip.mcActive || 0)) return;

    var t = VE._veProject.playheadTime || 0;
    var inside = t > clip.startTime + VE.MIN_CLIP_DURATION &&
                 t < clip.startTime + clip.duration - VE.MIN_CLIP_DURATION;

    VE._veBeginUndoGroup && VE._veBeginUndoGroup(switchOnly ? 'Change multi-cam angle' : 'Multi-cam kesme');

    if (switchOnly || !inside) {
      if (!switchOnly && !inside) {
        _toast('Playhead not inside this clip: angle changed instead of cut');
      }
      VE._veMcSwitchAngle(clip.id, idx);
    } else {
      // Split THIS clip only, then re-point the right half. The right half inherits
      // mcAngles/mcActive through _veCloneClip's generic for-in, which is why this works
      // with no split changes at all.
      var track = null;
      VE._veProject.tracks.forEach(function (tr) {
        tr.clips.forEach(function (c) { if (c.id === clip.id) track = tr; });
      });
      if (!track) { VE._veEndUndoGroup && VE._veEndUndoGroup(); return; }

      var before = {};
      track.clips.forEach(function (c) { before[c.id] = true; });

      var savedSel = VE._veSelectedClips.slice();
      VE._veSelectedClips = [clip.id];
      VE._veSplitAtPlayhead();
      VE._veSelectedClips = savedSel;

      var right = null;
      track.clips.forEach(function (c) { if (!before[c.id]) right = c; });
      if (right) {
        VE._veMcSwitchAngle(right.id, idx);
        _clipId = right.id;                 // keep monitoring the half under the playhead
        VE._veSelectedClips = [right.id];
      } else {
        VE._veMcSwitchAngle(clip.id, idx);
      }
    }

    VE._veEndUndoGroup && VE._veEndUndoGroup();
    VE._veRender && VE._veRender();
    VE._veRenderPreviewFrame && VE._veRenderPreviewFrame();
    _paintActive(_clip());
    _renderCuts();
    // The cut count just changed but the playhead did not, and _tick only repaints on
    // playhead movement — so refresh the readout here or it shows a stale "Kesim n/m".
    _paintPlayhead(_clip(), VE._veProject.playheadTime || 0);
  }

  /* ── the cut strip: reads REAL clips, not a private array ── */
  function _renderCuts() {
    var VE = _VE();
    var bar = _p.querySelector('#ve-mcm-cuts');
    var cnt = _p.querySelector('#ve-mcm-cut-count');
    if (!bar) return;
    bar.innerHTML = '';
    var clip = _clip();
    if (!clip) return;

    var group = clip.mcGroupId;
    var sibs = [];
    VE._veProject.tracks.forEach(function (tr) {
      tr.clips.forEach(function (c) { if (c.mcGroupId && c.mcGroupId === group) sibs.push(c); });
    });
    sibs.sort(function (a, b) { return a.startTime - b.startTime; });
    if (cnt) cnt.textContent = sibs.length + ' kesim';
    if (!sibs.length) return;

    var t0 = sibs[0].startTime;
    var t1 = sibs[sibs.length - 1].startTime + sibs[sibs.length - 1].duration;
    var span = Math.max(0.001, t1 - t0);
    sibs.forEach(function (c) {
      var seg = document.createElement('div');
      seg.className = 've-mcm-seg';
      seg.style.left = ((c.startTime - t0) / span * 100) + '%';
      seg.style.width = (c.duration / span * 100) + '%';
      var col = COLORS[(c.mcActive || 0) % COLORS.length];
      seg.style.background = col + '44';
      seg.style.borderLeftColor = col;
      seg.title = (VE._veMcActiveAngle(c) || {}).label + ' @ ' + c.startTime.toFixed(2) + 'sn';
      seg.textContent = (c.mcActive || 0) + 1;
      seg.style.color = col;
      if (c.id === _clipId) seg.classList.add('is-cur');
      seg.addEventListener('click', function () {
        VE._veSeek && VE._veSeek(c.startTime + 0.001);
        _clipId = c.id;
        _refresh();
      });
      bar.appendChild(seg);
    });
  }

  /* ── the playhead, made visible ──
     A cut lands AT the playhead, so hiding it was asking the user to aim at something
     invisible ("neye göre ayarlanıyor"). Timecode + which cut you are on + a live marker on
     the cut strip. */
  function _fmtTC(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60), s = sec - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }

  function _paintPlayhead(clip, t) {
    var pos = _p.querySelector('#ve-mcm-pos');
    if (pos) {
      var idxTxt = '';
      var VE = _VE();
      if (clip && clip.mcGroupId) {
        var sibs = [];
        VE._veProject.tracks.forEach(function (tr) {
          tr.clips.forEach(function (c) { if (c.mcGroupId === clip.mcGroupId) sibs.push(c); });
        });
        sibs.sort(function (a, b) { return a.startTime - b.startTime; });
        var at = 0;
        for (var i = 0; i < sibs.length; i++) if (sibs[i].id === clip.id) at = i + 1;
        if (sibs.length > 1) idxTxt = '  ·  Kesim ' + at + '/' + sibs.length;
      }
      pos.textContent = _fmtTC(t) + idxTxt;
    }
    var line = _p.querySelector('#ve-mcm-ph-line');
    if (line && clip) {
      var VE2 = _VE();
      var group = clip.mcGroupId, sib = [];
      VE2._veProject.tracks.forEach(function (tr) {
        tr.clips.forEach(function (c) { if (c.mcGroupId === group) sib.push(c); });
      });
      if (sib.length) {
        sib.sort(function (a, b) { return a.startTime - b.startTime; });
        var t0 = sib[0].startTime;
        var t1 = sib[sib.length - 1].startTime + sib[sib.length - 1].duration;
        var span = Math.max(0.001, t1 - t0);
        var pct = ((t - t0) / span) * 100;
        line.style.display = (pct >= 0 && pct <= 100) ? 'block' : 'none';
        line.style.left = Math.max(0, Math.min(100, pct)) + '%';
      }
    }
  }

  /* ── the sync loop, driven by whichever window is actually visible ──
     A background window's rAF is throttled to a standstill by the browser. Once the monitor
     pops out, the popup is in front and the main window is behind — so driving the loop from
     the main window would FREEZE the cells on the second monitor, which is the one thing
     pop-out exists to make possible. Always run rAF on the window the panel lives in. */
  function _startLoop() {
    _stopLoop();
    _rafWin = (_win && !_win.closed) ? _win : window;
    _raf = _rafWin.requestAnimationFrame(_tick);
  }

  function _stopLoop() {
    if (_raf && _rafWin) { try { _rafWin.cancelAnimationFrame(_raf); } catch (e) {} }
    _raf = null;
    _rafWin = null;
  }

  /* ── keep the cells on the playhead ── */
  function _tick() {
    if (!_open) return;
    var VE = _VE();
    var clip = _clip();
    if (clip) {
      var t = VE._veProject.playheadTime || 0;
      // The clip under the playhead may have changed (playback crossed a cut)
      if (t < clip.startTime || t >= clip.startTime + clip.duration) {
        var next = _pickClip();
        if (next && next.id !== _clipId) { _clipId = next.id; _refresh(); clip = next; }
      }
      if (Math.abs(t - _lastSyncT) > 0.01) {
        _lastSyncT = t;
        _paintPlayhead(clip, t);
        Object.keys(_cells).forEach(function (k) {
          var v = _cells[k];
          var want = _angleLocalTime(clip, parseInt(k, 10));
          if (isFinite(want) && Math.abs(v.currentTime - want) > 0.18) {
            try { v.currentTime = want; } catch (e) {}
          }
        });
      }
      var playing = VE._vePlayback && VE._vePlayback.playing;
      Object.keys(_cells).forEach(function (k) {
        var v = _cells[k];
        if (playing && v.paused) { v.play()['catch'](function () {}); }
        else if (!playing && !v.paused) { try { v.pause(); } catch (e) {} }
      });
    }
    _raf = (_rafWin || window).requestAnimationFrame(_tick);
  }

  function _onKey(e) {
    if (!_open) return;
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    // Alt+1..9 = switch without cutting (mirrors Alt+click). e.key under Alt can be a dead
    // char on some layouts, so read the physical digit from e.code when present.
    var n = parseInt(e.key, 10);
    if (isNaN(n) && e.code && /^Digit[1-9]$/.test(e.code)) n = parseInt(e.code.slice(5), 10);
    if (n >= 1 && n <= 9) {
      var clip = _clip();
      if (clip && n <= _VE()._veMcAngleCount(clip)) {
        e.preventDefault();
        e.stopPropagation();
        _cut(n - 1, e.altKey);
      }
    }
  }

  function _refresh() {
    var clip = _clip();
    if (!clip) return;
    var VE = _VE();
    var head = _p.querySelector('#ve-mcm-name');
    if (head) head.textContent = clip.name || 'Multi-Cam';
    var cnt = _p.querySelector('#ve-mcm-angles');
    if (cnt) cnt.textContent = VE._veMcAngleCount(clip) + ' angle';
    _buildCells(clip);
    _renderCuts();
  }

  /* ── Edit Cameras: rename / reorder / hide, across the whole group ──
     Premiere ships this as its "Edit Cameras" dialog; Resolve does it via track Move Up/Down.
     Ours is an overlay inside the monitor because that is where the cameras are. */
  var _ecOrder = null, _ecLabels = null, _ecHidden = null;

  function _ecOpen() {
    var VE = _VE(), clip = _clip();
    if (!clip) return;
    var n = VE._veMcAngleCount(clip);
    _ecOrder = []; _ecLabels = {}; _ecHidden = {};
    for (var i = 0; i < n; i++) {
      _ecOrder.push(i);
      var a = VE._veMcGetAngle(clip, i) || {};
      _ecLabels[String(i)] = a.label || ('Kamera ' + (i + 1));
      _ecHidden[String(i)] = !!a.hidden;
    }
    _ecRender();
    _p.querySelector('#ve-mcm-ec').style.display = 'flex';
  }

  function _ecClose() {
    var el = _p && _p.querySelector('#ve-mcm-ec');
    if (el) el.style.display = 'none';
  }

  function _ecRender() {
    var host = _p.querySelector('#ve-mcm-ec-rows');
    if (!host) return;
    host.innerHTML = _ecOrder.map(function (oldIdx, pos) {
      var color = COLORS[pos % COLORS.length];
      return '<div class="ve-mcm-ec-row" data-pos="' + pos + '">' +
        '<span class="ve-mcm-ec-num" style="background:' + color + '">' + (pos + 1) + '</span>' +
        '<input class="ve-mcm-ec-name" data-old="' + oldIdx + '" value="' + _esc(_ecLabels[String(oldIdx)]) + '">' +
        '<button class="ve-mcm-ec-b" data-act="up" data-pos="' + pos + '"' + (pos === 0 ? ' disabled' : '') + ' title="Up">' + _icon('chevron-up', 12) + '</button>' +
        '<button class="ve-mcm-ec-b" data-act="dn" data-pos="' + pos + '"' + (pos === _ecOrder.length - 1 ? ' disabled' : '') + ' title="Down">' + _icon('chevron-down', 12) + '</button>' +
        '<button class="ve-mcm-ec-b' + (_ecHidden[String(oldIdx)] ? '' : ' is-on') + '" data-act="eye" data-old="' + oldIdx + '" title="Show/hide on grid">' +
          _icon(_ecHidden[String(oldIdx)] ? 'eye-off' : 'eye', 12) + '</button>' +
      '</div>';
    }).join('');

    host.querySelectorAll('.ve-mcm-ec-name').forEach(function (inp) {
      inp.addEventListener('input', function () { _ecLabels[inp.dataset.old] = inp.value; });
    });
    host.querySelectorAll('.ve-mcm-ec-b').forEach(function (b) {
      b.addEventListener('click', function () {
        var act = b.dataset.act;
        if (act === 'eye') {
          var k = b.dataset.old;
          _ecHidden[k] = !_ecHidden[k];
        } else {
          var pos = parseInt(b.dataset.pos, 10);
          var to = act === 'up' ? pos - 1 : pos + 1;
          if (to < 0 || to >= _ecOrder.length) return;
          var t = _ecOrder[pos]; _ecOrder[pos] = _ecOrder[to]; _ecOrder[to] = t;
        }
        _ecRender();
      });
    });
  }

  function _ecApply() {
    var VE = _VE(), clip = _clip();
    if (!clip) return;
    VE._veBeginUndoGroup && VE._veBeginUndoGroup('Edit cameras');
    VE._veMcReorderAngles(clip.mcGroupId, _ecOrder, _ecLabels, _ecHidden);
    VE._veEndUndoGroup && VE._veEndUndoGroup();
    _ecClose();
    _refresh();
    VE._veRender && VE._veRender();
    VE._veRenderPreviewFrame && VE._veRenderPreviewFrame();
    _toast('Cameras updated');
  }

  /* ── geometry: remembered size + position, centred on first ever open ── */
  function _savePos() {
    if (!_p || _p.classList.contains('is-popped')) return;
    try {
      localStorage.setItem(GEOM_KEY, JSON.stringify({
        l: parseInt(_p.style.left, 10) || 0, t: parseInt(_p.style.top, 10) || 0,
        w: _p.offsetWidth, h: _p.offsetHeight
      }));
    } catch (e) {}
  }

  function _restorePos() {
    var g = null;
    try { g = JSON.parse(localStorage.getItem(GEOM_KEY) || 'null'); } catch (e) {}
    if (!g || !(g.w > 200) || !(g.h > 150)) return false;
    _p.style.width = Math.min(g.w, window.innerWidth - 16) + 'px';
    _p.style.height = Math.min(g.h, window.innerHeight - 16) + 'px';
    // clamp into view — the window may be smaller than when this was saved
    _p.style.left = Math.max(0, Math.min(window.innerWidth - 120, g.l)) + 'px';
    _p.style.top = Math.max(0, Math.min(window.innerHeight - 60, g.t)) + 'px';
    return true;
  }

  function _center() {
    var w = _p.offsetWidth || 720, h = _p.offsetHeight || 560;
    _p.style.left = Math.max(8, Math.round((window.innerWidth - w) / 2)) + 'px';
    _p.style.top = Math.max(8, Math.round((window.innerHeight - h) / 2)) + 'px';
  }

  function _initDrag() {
    var head = _p.querySelector('.ve-mcm-head');
    if (!head) return;
    head.addEventListener('mousedown', function (e) {
      if (_p.classList.contains('is-popped')) return;   // the OS moves a real window
      if (e.target.closest('button')) return;           // buttons are not drag handles
      var sx = e.clientX, sy = e.clientY;
      var sl = parseInt(_p.style.left, 10) || 0, st = parseInt(_p.style.top, 10) || 0;
      function mv(ev) {
        _p.style.left = Math.max(0, Math.min(window.innerWidth - 80, sl + ev.clientX - sx)) + 'px';
        _p.style.top = Math.max(0, Math.min(window.innerHeight - 40, st + ev.clientY - sy)) + 'px';
      }
      function up() {
        document.removeEventListener('mousemove', mv);
        document.removeEventListener('mouseup', up);
        _savePos();
      }
      document.addEventListener('mousemove', mv);
      document.addEventListener('mouseup', up);
      e.preventDefault();
    });
  }

  /* ── pop-out: a real second window, for dual-monitor use ──
     adoptNode moves the live panel across documents WITHOUT re-creating it, so every listener,
     the cell <video> elements and the rAF loop keep running untouched (same JS context). The
     stylesheets are cloned so it looks identical over there. */
  function _syncPopBtn() {
    var b = _p && _p.querySelector('#ve-mcm-pop');
    if (!b) return;
    var out = !!(_win && !_win.closed);
    b.innerHTML = _icon(out ? 'minimize-2' : 'external-link', 14);
    b.title = out ? 'Dock to this window' : 'Open in separate window (dual monitor)';
  }

  function _popOut() {
    if (_win && !_win.closed) { _win.focus(); return; }
    var w = window.open('', 'ccMcMonitor', 'width=940,height=740,menubar=no,toolbar=no,location=no');
    if (!w) { _toast('Browser blocked new window', 'error'); return; }
    var d = w.document;
    d.write('<!doctype html><html><head><meta charset="utf-8"><title>Multi-Cam Monitor</title></head><body></body></html>');
    d.close();
    Array.prototype.forEach.call(
      document.querySelectorAll('link[rel="stylesheet"], style'),
      function (n) { try { d.head.appendChild(n.cloneNode(true)); } catch (e) {} }
    );
    d.body.style.cssText = 'margin:0;padding:0;background:#1b1b1f;overflow:hidden;';
    _savePos();
    _p.classList.add('is-popped');
    // Drop the inline geometry. It was written for the floating panel, and inline styles beat
    // class rules — leaving them makes .is-popped's "fill the window" never apply, so the panel
    // sits in the corner of the new window at its old size.
    _p.style.width = ''; _p.style.height = ''; _p.style.left = ''; _p.style.top = '';
    d.body.appendChild(d.adoptNode(_p));
    d.addEventListener('keydown', _onKey, true);
    w.addEventListener('beforeunload', function () { _popIn(); });
    _win = w;
    if (_open) _startLoop();   // hand the loop to the popup: it is the visible window now
    _syncPopBtn();
    _toast('Monitor opened in separate window');
  }

  function _popIn() {
    if (!_p) return;
    _win = null;
    _p.classList.remove('is-popped');
    document.body.appendChild(document.adoptNode(_p));
    // _restorePos re-applies the inline geometry that _popOut had to strip.
    if (!_restorePos()) _center();
    if (_open) _startLoop();   // loop comes home with the panel
    _syncPopBtn();
  }

  function _build() {
    if (_p) return _p;
    _p = document.createElement('div');
    _p.className = 've-mcm';
    _p.id = 've-mc-monitor';
    _p.innerHTML =
      '<div class="ve-mcm-head">' +
        '<span class="ve-mcm-title">' + _icon('monitor', 15) + ' <b id="ve-mcm-name">Multi-Cam</b>' +
          '<span class="ve-mcm-sub" id="ve-mcm-angles"></span></span>' +
        '<div class="ve-mcm-headright">' +
          '<div class="ve-mcm-gridsel" id="ve-mcm-gridsel">' +
            '<button data-g="auto" class="is-on">Oto</button>' +
            '<button data-g="2">2×2</button>' +
            '<button data-g="3">3×3</button>' +
            '<button data-g="4">4×4</button>' +
          '</div>' +
          '<button class="ve-mcm-x" id="ve-mcm-ec-open" title="Edit cameras (name / order / hide)">' + _icon('sliders', 14) + '</button>' +
          '<button class="ve-mcm-x" id="ve-mcm-pop" title="Open in separate window (dual monitor)">' + _icon('external-link', 14) + '</button>' +
          '<button class="ve-mcm-x" id="ve-mcm-x" title="Close">' + _icon('x', 14) + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="ve-mcm-teach" id="ve-mcm-teach">' +
        '<div class="ve-mcm-teach-t">' + _icon('info', 13) + ' <b>How it works</b></div>' +
        '<ol class="ve-mcm-teach-l">' +
          '<li><b>Play</b> the video. All cameras below show the same moment.</li>' +
          '<li><b>Click</b> the camera you like (or <kbd>1</kbd>-<kbd>9</kbd>). A <b>cut</b> is then made and the view switches to that camera.</li>' +
          '<li>If you pick the wrong one, <kbd>Alt</kbd>+click: changes only this clip\'s camera without a cut.</li>' +
        '</ol>' +
        '<button class="ve-mcm-teach-x" id="ve-mcm-teach-x">Got it</button>' +
      '</div>' +
      '<div class="ve-mcm-body">' +
        '<div class="ve-mcm-grid" id="ve-mcm-grid"></div>' +
        '<div class="ve-mcm-bar">' +
          '<span class="ve-mcm-livewrap">' + _icon('radio', 12) + ' <b id="ve-mcm-active">-</b></span>' +
          '<span class="ve-mcm-pos" id="ve-mcm-pos">0:00</span>' +
          '<span class="ve-mcm-tip">click / <kbd>1</kbd>-<kbd>9</kbd> = cut&nbsp;·&nbsp;<kbd>Alt</kbd>+click = change without cut</span>' +
        '</div>' +
        '<div class="ve-mcm-cutwrap">' +
          '<div class="ve-mcm-cuthead"><span>Cut list</span><span id="ve-mcm-cut-count">0 cuts</span></div>' +
          '<div class="ve-mcm-cuts" id="ve-mcm-cuts"><div class="ve-mcm-ph-line" id="ve-mcm-ph-line"></div></div>' +
        '</div>' +
      '</div>' +
      '<div class="ve-mcm-ec" id="ve-mcm-ec">' +
        '<div class="ve-mcm-ec-box">' +
          '<div class="ve-mcm-ec-head">' + _icon('sliders', 13) + ' <b>Edit Cameras</b></div>' +
          '<div class="ve-mcm-ec-rows" id="ve-mcm-ec-rows"></div>' +
          '<p class="ve-mcm-ec-hint">The order determines which camera the <kbd>1</kbd>-<kbd>9</kbd> keys map to. ' +
            'The ordering applies to all cuts; existing cuts do not lose their camera.</p>' +
          '<div class="ve-mcm-ec-foot">' +
            '<button class="ve-mcm-ec-btn" id="ve-mcm-ec-cancel">Cancel</button>' +
            '<button class="ve-mcm-ec-btn is-go" id="ve-mcm-ec-apply">Apply</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="ve-mcm-grip"></div>';
    document.body.appendChild(_p);
    _p.querySelector('#ve-mcm-ec-open').addEventListener('click', _ecOpen);
    _p.querySelector('#ve-mcm-ec-cancel').addEventListener('click', _ecClose);
    _p.querySelector('#ve-mcm-ec-apply').addEventListener('click', _ecApply);
    _p.querySelector('#ve-mcm-x').addEventListener('click', hide);
    _p.querySelector('#ve-mcm-pop').addEventListener('click', function () {
      if (_win && !_win.closed) { try { _win.close(); } catch (e) {} _popIn(); }
      else _popOut();
    });
    _initDrag();
    // Persist size after a native resize. ResizeObserver looks like the obvious hook but it
    // does not fire in a background tab (measured: zero callbacks), so it cannot be trusted as
    // the only trigger. The CSS `resize: both` grip is dragged with the mouse, so releasing
    // the button over the panel is the honest signal, and it is testable.
    _p.addEventListener('mouseup', function () { _savePos(); });

    _p.querySelector('#ve-mcm-teach-x').addEventListener('click', function () {
      _taught = true;
      try { localStorage.setItem('cc_mc_taught', '1'); } catch (e) {}
      _p.querySelector('#ve-mcm-teach').style.display = 'none';
    });

    _p.querySelectorAll('#ve-mcm-gridsel button').forEach(function (b) {
      b.addEventListener('click', function () {
        _grid = b.dataset.g;
        _p.querySelectorAll('#ve-mcm-gridsel button').forEach(function (x) {
          x.classList.toggle('is-on', x === b);
        });
        var c = _clip();
        if (c) _buildCells(c);
      });
    });

    if (window.VEPanelHelpers && VEPanelHelpers.decorate) VEPanelHelpers.decorate(_p);
    return _p;
  }

  function show() {
    var VE = _VE();
    if (!VE || !VE._veIsActive || !VE._veIsActive()) { _toast('First open the video editor', 'error'); return; }
    var clip = _pickClip();
    if (!clip) { _toast('First create a Multi-Cam source', 'error'); return; }
    _clipId = clip.id;
    _build();
    try { _taught = _taught || localStorage.getItem('cc_mc_taught') === '1'; } catch (e) {}
    var teach = _p.querySelector('#ve-mcm-teach');
    if (teach) teach.style.display = _taught ? 'none' : 'block';
    _p.style.display = 'flex';
    if (!_p.classList.contains('is-popped') && !_restorePos()) _center();
    _syncPopBtn();
    _open = true;
    _lastSyncT = -1;
    _refresh();
    _paintPlayhead(clip, VE._veProject.playheadTime || 0);
    document.addEventListener('keydown', _onKey, true);
    _startLoop();
  }

  function hide() {
    _open = false;
    // Close the second window first: its beforeunload calls _popIn(), which brings the panel
    // back into this document before we hide it — otherwise we would hide a node that lives
    // in a document that is about to disappear, and the panel would be lost on reopen.
    if (_win && !_win.closed) { try { _win.close(); } catch (e) {} }
    _popIn();
    if (_p) _p.style.display = 'none';
    _stopLoop();
    document.removeEventListener('keydown', _onKey, true);
    Object.keys(_cells).forEach(function (k) { try { _cells[k].pause(); } catch (e) {} });
  }

  function toggle() { _open ? hide() : show(); }

  window.VEMulticamMonitor = {
    show: show, hide: hide, toggle: toggle,
    isOpen: function () { return _open; },
    refresh: _refresh,
    cut: _cut,
    popOut: _popOut,
    popIn: _popIn,
    isPopped: function () { return !!(_win && !_win.closed); },
    // adoptNode-based move, exposed so the pop-out mechanism can be exercised against any
    // document (a popup is blocked from script, so this is how it gets tested).
    _moveTo: function (doc) {
      if (!_p || !doc) return false;
      var out = doc !== document;
      _p.classList.toggle('is-popped', out);
      // Mirror _popOut/_popIn exactly, or this helper tests something the real path doesn't do.
      if (out) { _p.style.width = ''; _p.style.height = ''; _p.style.left = ''; _p.style.top = ''; }
      doc.body.appendChild(doc.adoptNode(_p));
      if (!out && !_restorePos()) _center();
      return _p.ownerDocument === doc;
    }
  };
})();

if (window.cc && cc.modules) cc.modules.register({ id: 'monitor', parent: 'video.ve-multicam', title: 've-multicam: monitor', mount: function () {}, unmount: function () {} });
