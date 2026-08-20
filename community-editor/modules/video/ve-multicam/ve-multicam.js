/* VE Multi-Cam — Create Multi-Camera Source (Phase D).
   Turns N selected video clips into ONE multicam clip: a normal type:'video' clip carrying
   its angles in `mcAngles`. The angle model + the switch primitive live in
   video-editor/multicam (VE._veMc*); the sync engine lives in ve-multicam-sync. This file is
   the UI + the assembly step.

   CRITICAL, and the reason this does not go through _veDeleteSelected: that path ends in
   _veReleasePoolEntry (clips.js), which strips src / calls load() / removes the element —
   destroying the very media the new multicam clip depends on. Once an element is out of the
   pool, _veSerializeProject's poolMeta loop never sees it, its blob is never persisted, and
   on reload the media is gone PERMANENTLY. So source clips are removed by hand and their
   elements are HANDED OFF into the angle store ('mcsrc:'+srcId) instead of released.

   Plan: docs/multicam-rebuild-plan-v2.md  (Phase D) */
(function () {
  'use strict';

  var _dlg = null;
  var _state = null;   // { angles:[...], method, audioMode, audioAngle, busy }

  // Same offscreen holder styling the pool uses everywhere else (clips.js).
  var OFFSCREEN = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';

  function _VE() { return window.__ccVideoEditor; }
  function _icon(n, s) { return (typeof getIcon === 'function' && getIcon(n, s || 14)) || ''; }
  function _toast(m, t) { if (typeof showToast === 'function') showToast(m, t); }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Reject generated ids masquerading as names, and drop the file extension.
  // _veUid builds "<prefix>-<base36 timestamp>-<counter>" and the prefix itself may contain a
  // dash ("ve-clip-mrnmw83i-2"), so match the tail signature rather than the whole shape.
  function _cleanLabel(s) {
    if (!s || typeof s !== 'string') return '';
    if (/-[a-z0-9]{6,}-\d+$/i.test(s)) return '';
    return s.replace(/\.[a-z0-9]{2,4}$/i, '');
  }

  /* ── which clips can become angles ── */
  function _candidates() {
    var VE = _VE();
    if (!VE || !VE._veProject) return [];
    var sel = VE._veSelectedClips || [];
    var out = [];
    VE._veProject.tracks.forEach(function (t) {
      t.clips.forEach(function (c) {
        if (c.type !== 'video') return;
        if (VE._veMcIsMulticam(c)) return;            // no nesting in v1
        if (sel.length && sel.indexOf(c.id) === -1) return;
        out.push({ clip: c, track: t });
      });
    });
    return out;
  }

  function _fmt(sec) {
    var s = Math.abs(sec), sign = sec < 0 ? '-' : '';
    var m = Math.floor(s / 60), r = s - m * 60;
    return sign + (m > 0 ? m + 'dk ' : '') + r.toFixed(2) + 'sn';
  }

  function _statusChip(a) {
    if (a.status === 'reference')
      return '<span class="ve-mc-chip ve-mc-chip-ref">' + _icon('anchor', 11) + ' Referans</span>';
    if (a.status === 'unsynced')
      return '<span class="ve-mc-chip ve-mc-chip-bad" title="Audio silent; alignment failed. Enter offset manually.">' +
             _icon('volume-x', 11) + ' No audio</span>';
    if (a.status === 'low-confidence')
      return '<span class="ve-mc-chip ve-mc-chip-warn" title="Weak match. Verify or fix manually.">' +
             _icon('alert-triangle', 11) + ' Weak match</span>';
    if (a.status === 'ok')
      return '<span class="ve-mc-chip ve-mc-chip-ok">' + _icon('check', 11) + ' Aligned</span>';
    return '';
  }

  /* ── rows ── */
  function _renderRows() {
    if (!_dlg || !_state) return;
    var host = _dlg.querySelector('#ve-mc-rows');
    if (!host) return;
    var needsAttention = 0;
    var html = _state.angles.map(function (a, i) {
      if (a.status === 'low-confidence' || a.status === 'unsynced') needsAttention++;
      var manual = _state.method === 'manual' || a.status === 'unsynced' || a.status === 'low-confidence';
      return '<div class="ve-mc-row">' +
        '<span class="ve-mc-dot" style="background:' + a.color + '"></span>' +
        '<span class="ve-mc-name" title="' + _esc(a.label) + '">' + _esc(a.label) + '</span>' +
        (_state.method === 'audio' && a.analysed ? _statusChip(a) : '') +
        '<label class="ve-mc-off">' +
          '<span>Offset</span>' +
          '<input type="number" step="0.01" class="ve-mc-off-in" data-i="' + i + '" value="' +
            (a.offset || 0).toFixed(2) + '"' + (a.status === 'reference' ? ' disabled' : '') + '>' +
          '<span class="ve-mc-unit">sn</span>' +
        '</label>' +
      '</div>';
    }).join('');
    host.innerHTML = html;

    host.querySelectorAll('.ve-mc-off-in').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var i = parseInt(inp.dataset.i, 10);
        var v = parseFloat(inp.value);
        if (!isFinite(v)) { inp.value = (_state.angles[i].offset || 0).toFixed(2); return; }
        _state.angles[i].offset = v;
        _state.angles[i].status = 'manual';
        _renderRows();
      });
    });

    var warn = _dlg.querySelector('#ve-mc-warn');
    if (warn) {
      if (needsAttention && _state.method === 'audio' && _state.analysed) {
        warn.style.display = 'flex';
        warn.innerHTML = _icon('alert-triangle', 13) +
          '<span>' + needsAttention + ' angle could not be aligned safely. Check offset values; ' +
          'incorrect alignment is not silently accepted.</span>';
      } else warn.style.display = 'none';
    }
  }

  /* ── analyse (Synchronize by Audio) ── */
  function _analyse() {
    if (!_state || _state.busy) return;
    if (!window.VEMulticamSync || !VEMulticamSync.isSupported()) {
      _toast('Audio sync is not supported in this browser', 'error');
      return;
    }
    _state.busy = true;
    var btn = _dlg.querySelector('#ve-mc-analyse');
    var prog = _dlg.querySelector('#ve-mc-prog');
    if (btn) { btn.disabled = true; btn.textContent = 'Analiz ediliyor...'; }
    if (prog) prog.style.display = 'block';

    VEMulticamSync.sync(
      _state.angles.map(function (a) { return { srcId: a.srcId, src: a.src }; }),
      function (p) {
        var bar = _dlg && _dlg.querySelector('#ve-mc-prog-bar');
        var lbl = _dlg && _dlg.querySelector('#ve-mc-prog-lbl');
        if (bar) bar.style.width = (p.pct || 0) + '%';
        if (lbl) lbl.textContent = p.phase === 'decode' ? 'Decoding audio...' :
                                   p.phase === 'envelope' ? 'Extracting audio envelope...' :
                                   p.phase === 'correlate' ? 'Aligning angles...' : 'Bitiriliyor...';
      }
    ).then(function (res) {
      _state.angles.forEach(function (a) {
        var m = res.angles.filter(function (x) { return x.srcId === a.srcId; })[0];
        if (!m) return;
        a.offset = m.offset;
        a.confidence = m.confidence;
        a.status = m.status;
        a.analysed = true;
      });
      _state.analysed = true;
      _toast('Audio sync completed');
    })['catch'](function (e) {
      _toast('Sync failed: ' + (e.message || e), 'error');
    }).then(function () {
      _state.busy = false;
      if (btn) { btn.disabled = false; btn.innerHTML = _icon('activity', 12) + ' Align from audio'; }
      if (prog) prog.style.display = 'none';
      _renderRows();
    });
  }

  /* ── assembly ── */
  function _create() {
    var VE = _VE();
    if (!VE || !_state || _state.busy) return;
    var pool = VE._vePlayback.videoPool;
    var angles = _state.angles;
    if (angles.length < 2) { _toast('At least 2 angles required', 'error'); return; }

    // The multicam clip takes the position of the FIRST angle's clip and lives on its track.
    var first = angles[0];
    var host = null, hostTrack = null;
    VE._veProject.tracks.forEach(function (t) {
      t.clips.forEach(function (c) { if (c.id === first.clipId) { host = c; hostTrack = t; } });
    });
    if (!host) { _toast('Source clip not found', 'error'); return; }

    VE._veBeginUndoGroup && VE._veBeginUndoGroup('Create multi-cam source');

    var mcAngles = {};
    var duration = 0;

    angles.forEach(function (a, i) {
      // Hand the element off into the angle store. NOT _veReleasePoolEntry: that would
      // destroy this media and it would never reach poolMeta on save.
      var el = pool[a.clipId];
      if (window.VEAudioEngine) VEAudioEngine.disconnectClip(a.clipId);
      if (el) {
        delete pool[a.clipId];
        VE._veMcParkSource(a.srcId, el, a.file);
      }
      mcAngles[String(i)] = {
        srcId: a.srcId,
        label: a.label,
        offset: a.offset || 0,
        srcDuration: a.srcDuration || 0,
        src: a.src
      };
      if (a.srcDuration > duration) duration = a.srcDuration;
    });

    // Remove every source clip from its track by hand.
    var ids = {};
    angles.forEach(function (a) { ids[a.clipId] = true; });
    VE._veProject.tracks.forEach(function (t) {
      for (var i = t.clips.length - 1; i >= 0; i--) {
        if (ids[t.clips[i].id]) t.clips.splice(i, 1);
      }
    });

    // Build the multicam clip: a NORMAL video clip that happens to carry angles.
    var mc = {
      id: VE._veUid('mc'),
      type: 'video',
      name: 'Multi-Cam (' + angles.length + ' angle)',
      src: mcAngles['0'].src,
      startTime: host.startTime || 0,
      duration: Math.max(0.1, host.duration || duration || 1),
      trimStart: 0, trimEnd: 0,
      volume: typeof host.volume === 'number' ? host.volume : 1,
      speed: 1,
      filters: {},
      transitions: { in: null, out: null },
      mcAngles: mcAngles,
      mcActive: 0,
      mcGroupId: VE._veUid('mcg')
      // No mcAudio field on purpose. Audio already follows the active angle for free
      // (videoPool[clip.id] IS that angle, so syncPlayback and the export mixdown both read
      // it), which is Premiere's "Switch Audio". The other two modes — lock-to-angle-N and
      // all-angles — need a SECOND element per clip plus companion support in syncPlayback /
      // seekAll / renderOffline, i.e. a shared-audio-seam change. Adding a field that only
      // honours one of its values would be a trap, so it lands with that work or not at all.
    };
    hostTrack.clips.push(mc);
    hostTrack.clips.sort(function (a, b) { return a.startTime - b.startTime; });

    // ── Audio. THE DEFAULT IS "DON'T MOVE IT".
    // Cameras each carry their own mic, but a cut that changes the sound is audible as a jump
    // mid-sentence, so the working practice is to pick ONE sound and leave it alone. Premiere
    // agrees: its "Audio Follows Video" ships OFF. We ship the same intent, but implemented by
    // DETACHING the chosen angle's audio into an ordinary audio clip (the `_veDetachAudio`
    // pattern) and muting the multicam clip's own track. That needs no second element per clip
    // and it hands the user a normal audio clip they can trim/fade like any other.
    if (_state.audioMode === 'angle') {
      var aSrc = mcAngles[String(_state.audioAngle)] || mcAngles['0'];
      var aEl = VE._veMcGetSource(aSrc.srcId);
      if (aEl) {
        var aTrack = VE._veEnsureAudioTrack();
        var aClip = {
          id: VE._veUid('clip'), type: 'audio', src: aSrc.src,
          name: (aSrc.label || 'Kamera') + ' (audio)',
          startTime: mc.startTime, duration: mc.duration,
          /* A10 (export plan): this was a hard `trimStart: 0`, which throws away the whole point of
             the alignment step. `angle.offset` is where that angle's media 0:00 sits on the shared
             sync axis, so a clip's position on that axis is (trimStart + activeAngle.offset). Taking
             sound from a NON-reference angle at trimStart 0 therefore played it `offset` seconds away
             from the picture - the exact lip-sync error the user just spent time measuring away.
             `_veMcTrimForAngle` is the one function that converts between angles; use it. */
          trimStart: VE._veMcTrimForAngle(mc, mcAngles[String(mc.mcActive || 0)], aSrc),
          trimEnd: 0, volume: 1, speed: 1,
          filters: {}, transitions: { in: null, out: null },
          _srcDuration: aSrc.srcDuration || 0
        };
        var aFile = VE._veMcSrcFiles[aSrc.srcId];
        if (aFile) aClip._file = aFile;
        aTrack.clips.push(aClip);
        var aClone = aEl.cloneNode(true);
        aClone.style.cssText = OFFSCREEN;
        aClone.muted = false;
        document.body.appendChild(aClone);
        pool[aClip.id] = aClone;
        if (window.VEAudioEngine) VEAudioEngine.connectClip(aClip.id, aClone, aTrack.id, 1);
        if (VE._veGenerateWaveform) VE._veGenerateWaveform(aClip, aSrc.src);
        mc.volume = 0;   // picture only; the sound now lives on its own track
      }
    } else if (_state.audioMode === 'none') {
      mc.volume = 0;
    }
    // 'follow' leaves mc.volume alone: sound rides the active angle (rarely what you want).

    // Materialise angle 0 as the live element. _veMcSwitchAngle owns that whole dance
    // (clone, src/_file truthfulness, trim, audio, thumbnails), so reuse it rather than
    // repeating it here — it is the same code path every later switch takes.
    mc.mcActive = -1;
    var ok = VE._veMcSwitchAngle(mc.id, 0);

    VE._veSelectedClips = [mc.id];
    VE._veEndUndoGroup && VE._veEndUndoGroup();
    VE._veRecalcDuration && VE._veRecalcDuration();
    VE._veRender && VE._veRender();
    VE._veRenderPreviewFrame && VE._veRenderPreviewFrame();

    _hide();
    _toast(ok ? angles.length + ' angles merged into a single multi-cam clip'
              : 'Multi-cam clip created but angle could not be loaded', ok ? undefined : 'error');
  }

  /* ── dialog ── */
  function _build() {
    if (_dlg) return _dlg;
    _dlg = document.createElement('div');
    _dlg.className = 've-mc-create';
    _dlg.id = 've-mc-create-dlg';
    _dlg.innerHTML =
      '<div class="ve-mc-head">' +
        '<span class="ve-mc-title">' + _icon('video', 15) + ' Create Multi-Cam Source</span>' +
        '<button class="ve-mc-x" id="ve-mc-create-x" title="Close">' + _icon('x', 14) + '</button>' +
      '</div>' +
      '<div class="ve-mc-body">' +
        '<div class="ve-mc-methods">' +
          '<button class="ve-mc-m is-on" data-m="audio">' + _icon('activity', 12) + ' Sesten senkron</button>' +
          '<button class="ve-mc-m" data-m="inpoint">' + _icon('flag', 12) + ' In point</button>' +
          '<button class="ve-mc-m" data-m="manual">' + _icon('sliders', 12) + ' Elle</button>' +
        '</div>' +
        '<p class="ve-mc-hint" id="ve-mc-hint"></p>' +
        '<div class="ve-mc-prog" id="ve-mc-prog"><div class="ve-mc-prog-t"><span id="ve-mc-prog-lbl">Preparing...</span></div>' +
          '<div class="ve-mc-prog-track"><div class="ve-mc-prog-bar" id="ve-mc-prog-bar"></div></div></div>' +
        '<div class="ve-mc-rows" id="ve-mc-rows"></div>' +
        '<div class="ve-mc-warn" id="ve-mc-warn"></div>' +
        '<div class="ve-mc-audio">' +
          '<div class="ve-mc-audio-head">' + _icon('volume-2', 12) + ' <b>Audio</b></div>' +
          '<div class="ve-mc-audio-row">' +
            '<select class="ve-mc-sel" id="ve-mc-audio-mode">' +
              '<option value="angle">Single camera\'s audio (separate audio track)</option>' +
              '<option value="follow">Audio follows the active camera</option>' +
              '<option value="none">Silent (I\'ll manage audio separately)</option>' +
            '</select>' +
            '<select class="ve-mc-sel ve-mc-sel-narrow" id="ve-mc-audio-angle"></select>' +
          '</div>' +
          '<p class="ve-mc-audio-hint" id="ve-mc-audio-hint"></p>' +
        '</div>' +
      '</div>' +
      '<div class="ve-mc-foot">' +
        '<button class="ve-mc-btn" id="ve-mc-analyse">' + _icon('activity', 12) + ' Align by audio</button>' +
        '<span class="ve-mc-spacer"></span>' +
        '<button class="ve-mc-btn" id="ve-mc-cancel">Cancel</button>' +
        '<button class="ve-mc-btn ve-mc-btn-go" id="ve-mc-go">Create</button>' +
      '</div>';
    document.body.appendChild(_dlg);

    _dlg.querySelector('#ve-mc-create-x').addEventListener('click', _hide);
    _dlg.querySelector('#ve-mc-cancel').addEventListener('click', _hide);
    _dlg.querySelector('#ve-mc-go').addEventListener('click', _create);
    _dlg.querySelector('#ve-mc-analyse').addEventListener('click', _analyse);

    _dlg.querySelectorAll('.ve-mc-m').forEach(function (b) {
      b.addEventListener('click', function () {
        _state.method = b.dataset.m;
        _dlg.querySelectorAll('.ve-mc-m').forEach(function (x) { x.classList.toggle('is-on', x === b); });
        _applyMethod();
      });
    });

    _dlg.querySelector('#ve-mc-audio-mode').addEventListener('change', function (e) {
      _state.audioMode = e.target.value;
      _applyAudio();
    });
    _dlg.querySelector('#ve-mc-audio-angle').addEventListener('change', function (e) {
      _state.audioAngle = parseInt(e.target.value, 10) || 0;
      _applyAudio();
    });

    if (window.VEPanelHelpers && VEPanelHelpers.decorate) VEPanelHelpers.decorate(_dlg);
    return _dlg;
  }

  function _applyAudio() {
    var sel = _dlg.querySelector('#ve-mc-audio-angle');
    var hint = _dlg.querySelector('#ve-mc-audio-hint');
    var mode = _state.audioMode;
    if (sel) {
      sel.style.display = (mode === 'angle') ? '' : 'none';
      if (mode === 'angle' && !sel.options.length) {
        sel.innerHTML = _state.angles.map(function (a, i) {
          return '<option value="' + i + '"' + (i === _state.audioAngle ? ' selected' : '') + '>' +
            _esc(a.label) + '</option>';
        }).join('');
      }
    }
    if (!hint) return;
    if (mode === 'angle') {
      hint.textContent = 'The selected camera\'s audio goes to a separate track and as the camera switches, ' +
        'DOES NOT CHANGE. You can also trim and adjust its level. Recommended.';
    } else if (mode === 'follow') {
      hint.textContent = 'At each cut, the audio also switches to that camera\'s microphone. The cameras\' audio ' +
        'if they are not identical, there will be an audible jump mid-sentence.';
    } else {
      hint.textContent = 'The multi-cam clip will be silent. You\'ll add your external audio recording yourself.';
    }
  }

  function _applyMethod() {
    var hint = _dlg.querySelector('#ve-mc-hint');
    var an = _dlg.querySelector('#ve-mc-analyse');
    if (_state.method === 'audio') {
      hint.textContent = 'Each angle\'s audio is analyzed and aligned to a common timeline. Cameras may have started minutes apart.';
      if (an) an.style.display = '';
    } else if (_state.method === 'inpoint') {
      hint.textContent = 'Angles are aligned based on their current start points on the timeline.';
      if (an) an.style.display = 'none';
      _state.angles.forEach(function (a) { a.offset = a.startTime - _state.angles[0].startTime; a.status = 'manual'; a.analysed = false; });
      _state.analysed = false;
    } else {
      hint.textContent = 'Enter offset values manually. The reference angle is taken as 0.';
      if (an) an.style.display = 'none';
      _state.analysed = false;
    }
    _renderRows();
  }

  var COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#6366f1'];

  function _show() {
    var VE = _VE();
    if (!VE || !VE._veIsActive || !VE._veIsActive()) { _toast('First open the video editor', 'error'); return; }
    var cands = _candidates();
    if (cands.length < 2) {
      _toast('Select at least 2 video clips for multi-cam', 'error');
      return;
    }
    _state = {
      method: 'audio',
      audioMode: 'angle',   // default: one camera's sound, detached, never moves
      audioAngle: 0,
      busy: false,
      analysed: false,
      angles: cands.map(function (c, i) {
        var el = VE._vePlayback.videoPool[c.clip.id];
        return {
          srcId: VE._veUid('mcs'),
          clipId: c.clip.id,
          // fileName first: clip.name can end up holding a generated uid (e.g. after some
          // add/split paths), and "ve-clip-mrnmw83i-2" is not a camera label a human wants.
          label: _cleanLabel(c.clip.fileName) || _cleanLabel(c.clip.name) || ('Kamera ' + (i + 1)),
          src: c.clip.src || (el && (el.src || el.currentSrc)) || '',
          file: c.clip._file,
          startTime: c.clip.startTime || 0,
          srcDuration: c.clip._srcDuration || c.clip.duration || 0,
          offset: 0,
          confidence: 0,
          status: i === 0 ? 'reference' : 'pending',
          analysed: false,
          color: COLORS[i % COLORS.length]
        };
      })
    };
    _build();
    var aSel = _dlg.querySelector('#ve-mc-audio-angle');
    if (aSel) aSel.innerHTML = '';   // rebuilt by _applyAudio for THIS angle set
    _dlg.querySelector('#ve-mc-audio-mode').value = _state.audioMode;
    _applyMethod();
    _applyAudio();
    _dlg.style.display = 'flex';
  }

  function _hide() {
    if (_dlg) _dlg.style.display = 'none';
    _state = null;
  }

  window.VEMulticam = {
    showCreate: _show,
    hide: _hide,
    isOpen: function () { return !!(_dlg && _dlg.style.display === 'flex'); }
  };
})();

// Modular skeleton hook — ve-multicam is a video loader module. Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-multicam', parent: 'video', title: 've-multicam', mount: function () {}, unmount: function () {} });
