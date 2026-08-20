// ═══════════════════════════════════════════════════════════════════
//  VESilenceCut — Silence detection + one-click jump-cut
//  dika studio Video Editor — MirexSoft
//
//  Descript-style "shorten the talking-head video": detect silent gaps in the
//  selected clip's audio, preview them as range markers on the ruler, then cut
//  them all with ONE click = ONE undo step. Plan: docs/subtitle-silencecut-plan.md.
//
//  Everything here is reuse: decode via the shared VEAudioEngine context, spans
//  preview via VE._veAddMarker range markers, cutting via the proven
//  playhead+selection-driven VE._veSplitAtPlayhead idiom (multicam monitor.js),
//  batching via VE._veBeginUndoGroup/_veEndUndoGroup. Ripple scope = ALL tracks
//  (owner decision D1): the composition actually gets shorter, later material on
//  every track (clips, cues, markers) moves up together.
// ═══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var VE = null;
  function _VE() { return (VE = window.__ccVideoEditor || VE); }
  function _toast(m, k) { if (typeof showToast === 'function') showToast(m, k); }

  var SIL_COLOR = '#ff9c58';           // marker color: how "ours" are found again for cut/clear
  var DEFAULTS = { dropDb: 24, minSil: 0.35, padAfter: 0.12, padBefore: 0.08 };

  var _pcmCache = {};                  // clipId -> {pcm, rate}  (decode once per clip per session)
  var _last = null;                    // {clipId, regions:[{start,end}] timeline secs, totalSec}
  var _strip = null;

  // ── audio: clip -> mono Float32Array ─────────────────────────────
  function _decodeClip(clip) {
    if (_pcmCache[clip.id]) return Promise.resolve(_pcmCache[clip.id]);
    var VE = _VE();
    var el = VE._vePlayback && VE._vePlayback.videoPool[clip.id];
    var src = el && (el.src || el.currentSrc);
    if (!src) return Promise.reject(new Error('Clip audio source not found'));
    var ctx = (window.VEAudioEngine && VEAudioEngine.ensureContext) ? VEAudioEngine.ensureContext() : null;
    if (!ctx) return Promise.reject(new Error('Could not start audio engine'));
    return fetch(src).then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
      return new Promise(function (res, rej) { ctx.decodeAudioData(buf, res, rej); });
    }).then(function (audio) {
      // average all channels down to mono (same shape as multicam's _decodeMono)
      var n = audio.length, chs = audio.numberOfChannels, pcm = new Float32Array(n);
      for (var c = 0; c < chs; c++) {
        var d = audio.getChannelData(c);
        for (var i = 0; i < n; i++) pcm[i] += d[i] / chs;
      }
      var out = { pcm: pcm, rate: audio.sampleRate };
      _pcmCache[clip.id] = out;
      return out;
    });
  }

  // ── detection: windowed RMS vs a speech-relative threshold ───────
  /* Threshold is RELATIVE to the clip's own speech level (90th percentile RMS), not an absolute
     dB: a quiet lavalier recording and a hot shotgun mic then behave the same. Silence spans get
     padded conservatively (padAfter keeps the tail of a word, padBefore keeps the attack of the
     next one) - the industry "avoid harsh cuts" rule. */
  function _findSilences(pcm, rate, opts) {
    var win = Math.max(16, Math.round(rate * 0.01));         // 10ms windows
    var n = Math.floor(pcm.length / win);
    var rms = new Float32Array(n);
    for (var w = 0; w < n; w++) {
      var s = 0, off = w * win;
      for (var i = 0; i < win; i++) { var v = pcm[off + i]; s += v * v; }
      rms[w] = Math.sqrt(s / win);
    }
    var sorted = Array.prototype.slice.call(rms).sort(function (a, b) { return a - b; });
    var ref = sorted[Math.min(n - 1, Math.floor(n * 0.9))] || 0;   // P90 = speech level
    var floor = sorted[Math.floor(n * 0.1)] || 0;                  // P10 = room tone / noise floor
    if (ref <= 1e-6) return null;   // decoded but ALL-silent: a different diagnosis than "no gaps"
    /* Threshold = speech level minus dropDb, but never below just-above the clip's own noise
       floor. Real footage has room tone: a fixed -24dB drop can land UNDER the noise floor and
       find nothing ("Sessiz boşluk bulunamadı" on obviously gappy speech). Clamping to
       1.6 x floor adapts to whatever the mic/room actually was. */
    var thresh = Math.max(
      ref * Math.pow(10, -(opts.dropDb || DEFAULTS.dropDb) / 20),
      floor * 1.6
    );
    if (thresh >= ref * 0.7) thresh = ref * 0.7; // degenerate case (floor ~ speech): keep sane
    var spans = [], inSil = false, s0 = 0, wsec = win / rate;
    for (var q = 0; q < n; q++) {
      var silent = rms[q] < thresh;
      if (silent && !inSil) { inSil = true; s0 = q; }
      else if (!silent && inSil) {
        inSil = false;
        var dur = (q - s0) * wsec;
        if (dur >= (opts.minSil || DEFAULTS.minSil)) spans.push({ start: s0 * wsec, end: q * wsec });
      }
    }
    if (inSil) {
      var tdur = (n - s0) * wsec;
      if (tdur >= (opts.minSil || DEFAULTS.minSil)) spans.push({ start: s0 * wsec, end: n * wsec });
    }
    // pads: keep a little silence on both sides so speech never clips
    var padA = opts.padAfter != null ? opts.padAfter : DEFAULTS.padAfter;
    var padB = opts.padBefore != null ? opts.padBefore : DEFAULTS.padBefore;
    var out = [];
    for (var k = 0; k < spans.length; k++) {
      var a = spans[k].start + padA, b = spans[k].end - padB;
      if (b - a >= 0.1) out.push({ start: a, end: b });
    }
    return out;
  }

  function _targetClip() {
    var VE = _VE();
    var clip = null;
    if (VE._veSelectedClips.length) {
      var c = VE._findClipById(VE._veSelectedClips[0]);
      if (c && c.type === 'video') clip = c;
    }
    if (!clip) {
      var best = null;
      VE._veProject.tracks.forEach(function (t) {
        (t.clips || []).forEach(function (c) {
          if (c.type === 'video' && (!best || c.duration > best.duration)) best = c;
        });
      });
      clip = best;
    }
    return clip;
  }

  // ── public: detect + preview ─────────────────────────────────────
  function detect(opts) {
    opts = opts || {};
    var VE = _VE();
    if (!VE || !VE._veProject) return Promise.reject(new Error('Video editor not open'));
    var clip = _targetClip();
    if (!clip) return Promise.reject(new Error('Video clip not found'));
    return _decodeClip(clip).then(function (au) {
      var srcSpans = _findSilences(au.pcm, au.rate, opts);
      if (srcSpans === null) {
        // decoded fine but there is NOTHING in the channel: not a threshold problem, say so
        throw new Error('No decodable audio in clip or channel is silent. Note: AI-generated videos often have no audio track.');
      }
      // source secs -> timeline secs, only the part of the source the clip actually shows
      var speed = clip.speed || 1, trim = clip.trimStart || 0;
      var srcEnd = trim + (clip.duration || 0) * speed;
      var regions = [];
      for (var i = 0; i < srcSpans.length; i++) {
        var a = Math.max(srcSpans[i].start, trim), b = Math.min(srcSpans[i].end, srcEnd);
        if (b - a < 0.1) continue;
        regions.push({
          start: (clip.startTime || 0) + (a - trim) / speed,
          end: (clip.startTime || 0) + (b - trim) / speed
        });
      }
      var total = 0;
      regions.forEach(function (r) { total += r.end - r.start; });
      _last = { clipId: clip.id, regions: regions, totalSec: total, opts: opts };
      return _last;
    });
  }

  function _clearMarkers() {
    var VE = _VE();
    if (!VE._veProject.markers) return;
    VE._veProject.markers = VE._veProject.markers.filter(function (m) {
      return !(m.type === 'range' && m.color === SIL_COLOR);
    });
  }

  function _markRegions(regions) {
    var VE = _VE();
    _clearMarkers();
    for (var i = 0; i < regions.length; i++) {
      VE._veAddMarker(regions[i].start, 'Sessizlik ' + (i + 1), {
        type: 'range', endTime: regions[i].end, color: SIL_COLOR
      });
    }
  }

  // ── the one-click cut ────────────────────────────────────────────
  /* Regions are applied RIGHT-TO-LEFT so earlier (left) region times never shift under us, and
     the original clip id always names the left piece (split clones the RIGHT half), so every
     region still lives inside the clip we keep splitting. All-tracks ripple (D1): every clip,
     cue and marker after the removed gap moves left by the gap's length. */
  function cutAll() {
    var VE = _VE();
    // Cut what is ON THE RULER (the user may have deleted individual markers = opt-out per gap)
    var markers = (VE._veProject.markers || []).filter(function (m) {
      return m.type === 'range' && m.color === SIL_COLOR && m.endTime != null;
    });
    if (!markers.length || !_last) { _toast('No silence to cut'); return 0; }
    var clipId = _last.clipId;
    var regions = markers.map(function (m) { return { start: m.time, end: m.endTime }; })
      .sort(function (a, b) { return b.start - a.start; });

    var MIN = VE.MIN_CLIP_DURATION || 0.1;
    var savedSel = VE._veSelectedClips.slice();
    var savedPh = VE._veProject.playheadTime;
    var cut = 0, totalCut = 0;

    VE._veBeginUndoGroup('Sessizlik kesimi');
    try {
      for (var i = 0; i < regions.length; i++) {
        var clip = VE._findClipById(clipId);
        if (!clip) break;
        var clipStart = clip.startTime || 0, clipEnd = clipStart + (clip.duration || 0);
        // clamp so both split halves respect MIN_CLIP_DURATION
        var a = Math.max(regions[i].start, clipStart + MIN + 0.01);
        var b = Math.min(regions[i].end, clipEnd - MIN - 0.01);
        if (b - a < 0.1) continue;

        var track = null;
        VE._veProject.tracks.forEach(function (tr) {
          (tr.clips || []).forEach(function (c) { if (c.id === clipId) track = tr; });
        });
        if (!track) break;

        var before = {};
        track.clips.forEach(function (c) { before[c.id] = true; });
        VE._veSelectedClips = [clipId];
        VE._veProject.playheadTime = b;
        VE._veSplitAtPlayhead();
        VE._veProject.playheadTime = a;
        VE._veSplitAtPlayhead();
        // two new clips appeared: the MIDDLE one starts at `a` (the right-of-b piece starts at b)
        var mid = null;
        track.clips.forEach(function (c) {
          if (!before[c.id] && Math.abs(c.startTime - a) < 0.02) mid = c;
        });
        if (!mid) continue;
        VE._veSelectedClips = [mid.id];
        VE._veDeleteSelected();

        // all-tracks ripple: close the gap everywhere
        var delta = b - a;
        VE._veProject.tracks.forEach(function (tr) {
          (tr.clips || []).forEach(function (c) {
            if (c.startTime >= b - 0.005) c.startTime -= delta;
          });
          (tr.cues || []).forEach(function (cue) {
            if (cue.startTime >= b - 0.005) { cue.startTime -= delta; cue.endTime -= delta; }
          });
        });
        (VE._veProject.markers || []).forEach(function (m) {
          if (m.color === SIL_COLOR) return; // ours are consumed below
          if (m.time >= b - 0.005) {
            m.time -= delta;
            if (m.endTime != null) m.endTime -= delta;
          }
        });
        cut++; totalCut += delta;
      }
      _clearMarkers();
    } finally {
      VE._veSelectedClips = savedSel.filter(function (id) { return VE._findClipById(id); });
      VE._veProject.playheadTime = Math.min(savedPh, VE._veProject.duration || savedPh);
      VE._veEndUndoGroup();
    }
    VE._veRecalcDuration && VE._veRecalcDuration();
    VE._veRender && VE._veRender();
    VE._veRenderPreviewFrame && VE._veRenderPreviewFrame();
    _toast(cut + ' silent gap cut (' + totalCut.toFixed(1) + ' s shortened). Ctrl+Z undoes in one step.');
    _last = null;
    _closeStrip();
    return cut;
  }

  // ── the floating panel (SmartCam-style: draggable header, pop-out, resizable) ──
  var _dragDispose = null;

  function _closeStrip() {
    if (_strip) {
      if (window.VEFloat && VEFloat.isPopped && VEFloat.isPopped(_strip)) VEFloat.popIn(_strip);
      if (_dragDispose) { try { _dragDispose(); } catch (e) {} _dragDispose = null; }
      _strip.remove(); _strip = null;
    }
  }

  function _icon(n, s) {
    var VE = _VE();
    if (VE && VE._veIcon) return VE._veIcon(n, s || 14);
    if (typeof getIcon === 'function') return getIcon(n, s || 14) || '';
    return '';
  }

  function _fmtT(s) {
    var m = Math.floor(s / 60), ss = (s % 60);
    return (m < 10 ? '0' + m : m) + ':' + (ss < 10 ? '0' : '') + ss.toFixed(1);
  }

  // The gap list is rebuilt FROM the markers (the source of truth cutAll consumes), so a gap
  // deleted here or from the ruler's own marker menu stays consistent with what gets cut.
  function _ourMarkers() {
    var VE = _VE();
    return (VE._veProject.markers || []).filter(function (m) {
      return m.type === 'range' && m.color === SIL_COLOR && m.endTime != null;
    }).sort(function (a, b) { return a.time - b.time; });
  }

  function _showStrip(res) {
    var VE = _VE();
    var wasOpen = !!_strip;
    if (!_strip) {
      _strip = document.createElement('div');
      _strip.id = 've-silence-panel';
      _strip.className = 've-scp';
      _strip.style.left = Math.max(12, Math.round(window.innerWidth / 2) - 190) + 'px';
      _strip.style.top = '80px';
      document.body.appendChild(_strip);
    }
    var lastDrop = (res.opts && res.opts.dropDb) || DEFAULTS.dropDb;
    var lastMin = (res.opts && res.opts.minSil) || DEFAULTS.minSil;
    var marks = _ourMarkers();
    var total = 0;
    marks.forEach(function (m) { total += m.endTime - m.time; });
    var none = !marks.length;

    var listH = '';
    if (none) {
      listH = '<div class="ve-scp-empty">No silent gaps found.<br>Reduce sensitivity and rescan.</div>';
    } else {
      for (var i = 0; i < marks.length; i++) {
        listH += '<div class="ve-scp-row" data-mid="' + marks[i].id + '">' +
          '<span class="ve-scp-n">' + (i + 1) + '</span>' +
          '<span class="ve-scp-t">' + _fmtT(marks[i].time) + ' - ' + _fmtT(marks[i].endTime) + '</span>' +
          '<span class="ve-scp-d">' + (marks[i].endTime - marks[i].time).toFixed(1) + ' sn</span>' +
          '<button class="ve-scp-b ve-scp-go" data-act="go" data-mid="' + marks[i].id + '" title="Git">' + _icon('play', 11) + '</button>' +
          '<button class="ve-scp-b ve-scp-del" data-act="del" data-mid="' + marks[i].id + '" title="Cut this gap">' + _icon('trash-2', 11) + '</button>' +
          '</div>';
      }
    }

    _strip.innerHTML =
      '<div class="ve-scp-head" id="ve-scp-head">' +
        '<span class="ve-scp-ico">' + _icon('scissors', 14) + '</span>' +
        '<span class="ve-scp-title">Cut Silences</span>' +
        '<button class="ve-scp-x" id="ve-sc-popout" title="' + ((window.VEFloat && VEFloat.isPopped(_strip)) ? 'Undo' : 'Open in separate window') + '">' +
          _icon((window.VEFloat && VEFloat.isPopped(_strip)) ? 'minimize-2' : 'external-link', 13) + '</button>' +
        '<button class="ve-scp-x" id="ve-sc-close" title="Close">' + _icon('x', 14) + '</button>' +
      '</div>' +
      '<div class="ve-scp-status">' +
        (none ? '<b>0 gaps</b>' : '<b>' + marks.length + ' silent gaps</b><i>total ' + total.toFixed(1) + ' s shorter</i>') +
      '</div>' +
      '<div class="ve-scp-controls">' +
        '<label>Sensitivity<input type="range" id="ve-sc-drop" min="10" max="40" step="1" value="' + lastDrop + '"></label>' +
        '<label>Min duration<input type="number" id="ve-sc-min" min="0.2" max="3" step="0.05" value="' + lastMin + '"><i>sn</i></label>' +
        '<button class="ve-scp-b ve-scp-rescan" id="ve-sc-rescan">' + _icon('refresh-cw', 12) + ' Yeniden tara</button>' +
      '</div>' +
      '<div class="ve-scp-list">' + listH + '</div>' +
      '<div class="ve-scp-foot">' +
        '<button class="ve-scp-cut" id="ve-sc-cut"' + (none ? ' disabled' : '') + '>' +
          _icon('scissors', 13) + ' Cut All' + (none ? '' : ' (' + marks.length + ')') + '</button>' +
      '</div>';

    // wire
    _strip.querySelector('#ve-sc-rescan').addEventListener('click', function () {
      run({ dropDb: +_strip.querySelector('#ve-sc-drop').value, minSil: +_strip.querySelector('#ve-sc-min').value });
    });
    var cutBtn = _strip.querySelector('#ve-sc-cut');
    if (cutBtn && !none) cutBtn.addEventListener('click', function () { cutAll(); });
    _strip.querySelector('#ve-sc-close').addEventListener('click', function () {
      _clearMarkers();
      VE._veRender && VE._veRender();
      _closeStrip();
    });
    _strip.querySelector('#ve-sc-popout').addEventListener('click', function () {
      if (!window.VEFloat) return;
      if (VEFloat.isPopped(_strip)) VEFloat.popIn(_strip);
      else VEFloat.popOut(_strip, 'Cut Silences');
      _showStrip(res);
    });
    _strip.querySelector('.ve-scp-list').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!b) return;
      var mid = b.getAttribute('data-mid');
      var mk = (VE._veProject.markers || []).filter(function (m) { return m.id === mid; })[0];
      if (!mk) return;
      if (b.getAttribute('data-act') === 'go') {
        if (VE._veSeek) VE._veSeek(mk.time);
        VE._veRenderPreviewFrame && VE._veRenderPreviewFrame();
      } else {
        VE._veProject.markers = VE._veProject.markers.filter(function (m) { return m.id !== mid; });
        VE._veRender && VE._veRender();
        _showStrip(res);
      }
    });
    // drag by header (skip while popped out: the OS window IS the drag surface then)
    if (window.VEFloat && VEFloat.drag && !(VEFloat.isPopped && VEFloat.isPopped(_strip))) {
      if (_dragDispose) { try { _dragDispose(); } catch (e2) {} }
      _dragDispose = VEFloat.drag(_strip, _strip.querySelector('#ve-scp-head'), 'silencecut');
    }
  }

  // ── entry point (Tools menu) ─────────────────────────────────────
  function run(opts) {
    _toast('Scanning for silences...');
    detect(opts).then(function (res) {
      if (!res.regions.length) {
        // Zero results must NOT close the strip: the sensitivity slider is exactly what the
        // user needs next, so it stays available for a re-scan.
        _clearMarkers();
        var VE = _VE(); VE._veRender && VE._veRender();
        _showStrip(res);
        return;
      }
      _markRegions(res.regions);
      _showStrip(res);
    }).catch(function (err) {
      _toast('Silence scan failed: ' + err.message, 'error');
      _closeStrip();
    });
  }

  window.VESilenceCut = {
    run: run,
    detect: detect,
    cutAll: cutAll,
    isOpen: function () { return !!_strip; },
    close: function () { _clearMarkers(); _closeStrip(); },
    // internals for the test harness
    _findSilences: _findSilences,
    SIL_COLOR: SIL_COLOR
  };
})();

// Modular skeleton hook — ve-silence-cut is a video loader module. Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-silence-cut', parent: 'video', title: 've-silence-cut', mount: function () {}, unmount: function () {} });
