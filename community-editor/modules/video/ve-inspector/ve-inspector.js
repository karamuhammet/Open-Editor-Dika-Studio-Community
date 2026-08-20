// ═══════════════════════════════════════════════════════════════
//  VE-INSPECTOR  —  Clip Properties Inspector Panel (Phase 11)
//  Collapsible right-side panel for editing selected clip props
// ═══════════════════════════════════════════════════════════════
(function() {
  'use strict';

  var _panel = null;
  var _currentClipId = null;
  var _visible = false;
  var _dragState = null; // {startX, startY, origLeft, origTop}

  /* Alpha AI feature switch (owner 2026-07-18). false HIDES the "AI BG Removal" and "Face Tracker"
     inspector sections: both are demo-quality (BG removal = low-accuracy model + per-frame CPU cost
     + stale-mask ghosting; face tracker = main-thread whole-clip loop that freezes the UI and never
     stored its results). Engines stay in the repo for the planned WebGPU / Tasks Vision rebuilds.
     Denoise and Chroma Key are NOT gated: both are wired and working. */
  var AI_ALPHA_UI = false;

  // ── Transition type options ──
  var TRANS_TYPES = window.VETransitions && VETransitions.ALL_IDS ? VETransitions.ALL_IDS : ['none','crossfade','fade-black','fade-white','flash','dissolve','wipe-left','wipe-right','wipe-up','wipe-down','iris-open','iris-close','diamond','clock','slide-left','slide-right','slide-up','slide-down','push-left','push-right','cover-left','cover-right','zoom-in','zoom-out','zoom-rotate','zoom-bounce','spin-cw','spin-ccw','flip-x','flip-y','blur-in','blur-out','pixelate','glitch','morph','burn','ripple','curtain'];

  // ── Helpers ──
  function _icon(name, sz) {
    if (typeof getIcon === 'function') {
      var r = getIcon(name, sz || 14);
      if (r) return r;
    }
    return '';
  }

  function _findClip(clipId) {
    if (!window.VideoEditor) return null;
    var proj = VideoEditor.getProject ? VideoEditor.getProject() : null;
    if (!proj) return null;
    for (var i = 0; i < proj.tracks.length; i++) {
      for (var j = 0; j < proj.tracks[i].clips.length; j++) {
        if (proj.tracks[i].clips[j].id === clipId) return proj.tracks[i].clips[j];
      }
    }
    return null;
  }

  function _findTrackForClip(clipId) {
    if (!window.VideoEditor) return null;
    var proj = VideoEditor.getProject ? VideoEditor.getProject() : null;
    if (!proj) return null;
    for (var i = 0; i < proj.tracks.length; i++) {
      for (var j = 0; j < proj.tracks[i].clips.length; j++) {
        if (proj.tracks[i].clips[j].id === clipId) return proj.tracks[i];
      }
    }
    return null;
  }

  function _fmt(sec) {
    var m = Math.floor(sec / 60);
    var s = (sec % 60).toFixed(2);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  // ── Build Panel DOM (floating modal attached to body) ──
  function _ensurePanel() {
    if (_panel) return _panel;

    _panel = document.createElement('div');
    _panel.id = 've-inspector';
    _panel.className = 've-inspector';
    document.body.appendChild(_panel);

    // ── Drag-to-move via header ──
    _panel.addEventListener('mousedown', function(e) {
      var header = _panel.querySelector('.ve-insp-header');
      if (!header || !header.contains(e.target)) return;
      if (e.target.closest('.ve-insp-close')) return;
      e.preventDefault();
      var rect = _panel.getBoundingClientRect();
      _dragState = { startX: e.clientX, startY: e.clientY, origLeft: rect.left, origTop: rect.top };
    });
    document.addEventListener('mousemove', function(e) {
      if (!_dragState) return;
      var dx = e.clientX - _dragState.startX;
      var dy = e.clientY - _dragState.startY;
      var nx = Math.max(0, Math.min(window.innerWidth - 100, _dragState.origLeft + dx));
      var ny = Math.max(0, Math.min(window.innerHeight - 40, _dragState.origTop + dy));
      _panel.style.left = nx + 'px';
      _panel.style.top = ny + 'px';
      _panel.style.right = 'auto';
    });
    document.addEventListener('mouseup', function() { _dragState = null; });

    return _panel;
  }

  // ── Accordion section helpers ──
  var _chevSvg = '<svg class="ve-acc-chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  // `tab` pins the section to a dock tab instead of letting the title table guess
  // it (used by the non-clip item kinds, which have their own tab vocabulary).
  function _accOpen(iconName, title, tab) {
    return '<div class="ve-insp-section"' + (tab ? ' data-veitab="' + tab + '"' : '') + '>' +
      '<div class="ve-insp-section-title">' + _icon(iconName, 12) + ' ' + title + _chevSvg + '</div>' +
      '<div class="ve-insp-section-body">';
  }
  function _accClose() { return '</div></div>'; }

  // ── Render the panel content ──
  function _render(clipId, target) {
    var panel = target || _ensurePanel();
    var clip = _findClip(clipId);
    if (!clip) {
      panel.innerHTML = '<div class="ve-insp-empty">No clip selected</div>';
      return;
    }
    _currentClipId = clipId;

    var t = clip.transform || { x: 0, y: 0, scale: 1, rotation: 0, flipH: false, flipV: false };
    var f = clip.filters || {};
    var trIn = (clip.transitions && clip.transitions.in) || { type: 'none', duration: 0.5 };
    var trOut = (clip.transitions && clip.transitions.out) || { type: 'none', duration: 0.5 };

    var html = '';

    // ── Header ──
    html += '<div class="ve-insp-header">' +
      '<span class="ve-insp-title">' + _icon('sliders', 14) + ' Inspector</span>' +
      '<button class="ve-insp-close" id="ve-insp-close" title="Close">' + _icon('x', 14) + '</button>' +
    '</div>';

    // ── Source Info ── (read-only meta as compact spec chips, not stacked rows)
    html += _accOpen('info', 'Source') +
      '<div class="ve-insp-row"><span class="ve-insp-label">Name</span><input class="ve-insp-input" id="ve-insp-name" value="' + _esc(clip.name || '') + '"></div>' +
      '<div class="ve-insp-specs">' +
        '<div class="ve-insp-spec"><span class="ve-insp-spec-k">Type</span><span class="ve-insp-spec-v">' + (clip.type || '—') + '</span></div>' +
        '<div class="ve-insp-spec"><span class="ve-insp-spec-k">Duration</span><span class="ve-insp-spec-v">' + _fmt(clip.duration) + '</span></div>' +
        (clip._mediaWidth ? '<div class="ve-insp-spec"><span class="ve-insp-spec-k">Size</span><span class="ve-insp-spec-v">' + clip._mediaWidth + '×' + clip._mediaHeight + '</span></div>' : '') +
      '</div>' +
    _accClose();

    // ── Multi-Cam ── change the angle of a cut after the fact, or flatten.
    // Keys off mcAngles (never a clip type) — a multicam clip is an ordinary type:'video'
    // clip, which is exactly why every other section below still renders for it.
    if (clip.mcAngles && Object.keys(clip.mcAngles).length) {
      var _mcAct = clip.mcActive || 0;
      var _mcKeys = Object.keys(clip.mcAngles).sort(function (a, b) { return (+a) - (+b); });
      html += _accOpen('video', 'Multi-Cam') +
        '<div class="ve-insp-mc-grid">';
      _mcKeys.forEach(function (k) {
        var a = clip.mcAngles[k] || {};
        html += '<button class="ve-insp-mc-btn' + ((+k) === _mcAct ? ' is-on' : '') + '" data-mcangle="' + k + '">' +
          '<b>' + ((+k) + 1) + '</b><span>' + _esc(a.label || ('Kamera ' + ((+k) + 1))) + '</span></button>';
      });
      html += '</div>' +
        '<button class="ve-insp-mc-flatten" id="ve-insp-mc-flatten" title="Remove angle set, make the active angle view permanent">' +
          'Flatten' +
        '</button>' +
      _accClose();
    }

    // ── Timeline ── (Start full width; trims paired side by side)
    html += _accOpen('clock', 'Timeline') +
      '<div class="ve-insp-row"><span class="ve-insp-label">Start</span><input type="number" class="ve-insp-input" id="ve-insp-start" value="' + clip.startTime.toFixed(2) + '" step="0.1" min="0"></div>' +
      '<div class="ve-insp-pair">' +
        '<div class="ve-insp-field"><span class="ve-insp-field-lb">Trim Start</span><input type="number" class="ve-insp-input ve-insp-num" id="ve-insp-trim-start" value="' + (clip.trimStart || 0).toFixed(2) + '" step="0.1" min="0"></div>' +
        '<div class="ve-insp-field"><span class="ve-insp-field-lb">Trim End</span><input type="number" class="ve-insp-input ve-insp-num" id="ve-insp-trim-end" value="' + (clip.trimEnd || 0).toFixed(2) + '" step="0.1" min="0"></div>' +
      '</div>' +
    _accClose();

    // ── Transform ──
    if (clip.type === 'video') {
      var _proj0 = (window.VideoEditor && VideoEditor.getProject) ? VideoEditor.getProject() : null;
      var _isBgClip = !!(_proj0 && _proj0._bgClipId === clip.id);
      var _fit = _isBgClip ? (_proj0.bgFit || 'cover') : (clip.fit || 'cover');
      html += _accOpen('move', 'Transform') +
        '<div class="ve-insp-row ve-insp-fitrow"><span class="ve-insp-label">Fit</span>' +
          '<select class="ve-insp-select ve-insp-fitsel" id="ve-insp-fit">' +
            '<option value="cover"' + (_fit === 'cover' ? ' selected' : '') + '>Cover</option>' +
            '<option value="contain"' + (_fit === 'contain' ? ' selected' : '') + '>Contain</option>' +
            '<option value="stretch"' + (_fit === 'stretch' ? ' selected' : '') + '>Doldur</option>' +
          '</select></div>' +
        '<div class="ve-insp-pair">' +
          '<div class="ve-insp-field"><span class="ve-insp-field-lb">X</span><input type="number" class="ve-insp-input ve-insp-num" id="ve-insp-tx" value="' + (t.x || 0) + '" step="1"></div>' +
          '<div class="ve-insp-field"><span class="ve-insp-field-lb">Y</span><input type="number" class="ve-insp-input ve-insp-num" id="ve-insp-ty" value="' + (t.y || 0) + '" step="1"></div>' +
        '</div>' +
        '<div class="ve-insp-pair">' +
          '<div class="ve-insp-field"><span class="ve-insp-field-lb">Scale</span><input type="number" class="ve-insp-input ve-insp-num" id="ve-insp-tscale" value="' + (t.scale || 1) + '" step="0.05" min="0.1" max="5"></div>' +
          '<div class="ve-insp-field"><span class="ve-insp-field-lb">Rotation</span><input type="number" class="ve-insp-input ve-insp-num" id="ve-insp-trot" value="' + (t.rotation || 0) + '" step="1"></div>' +
        '</div>' +
        '<div class="ve-insp-row ve-insp-fliprow">' +
          '<button class="ve-insp-btn' + (t.flipH ? ' active' : '') + '" id="ve-insp-fliph">' + _icon('flip-horizontal', 12) + ' Flip H</button>' +
          '<button class="ve-insp-btn' + (t.flipV ? ' active' : '') + '" id="ve-insp-flipv">' + _icon('flip-vertical', 12) + ' Flip V</button>' +
        '</div>' +
      _accClose();
    }

    /* ── Filters ── PICTURE ONLY. `clip.filters` is read by the compositor's draw path and by
       nothing else, so brightness / contrast / saturation on an audio clip were controls that
       could not change a single sample - and they were also what kept an empty Color tab on an
       audio clip's panel. */
    var _hasPicture = (clip.type === 'video' || clip.type === 'image');
    if (_hasPicture) html += _filtersSection(clip);

    // ── Speed ──
    var hasSpeedKf = window.VEKeyframes && VEKeyframes.hasKeyframes(clip, 'speed');
    var presetOpts = '<option value="">None</option>';
    if (window.VEKeyframes && VEKeyframes.SPEED_PRESETS) {
      for (var pk in VEKeyframes.SPEED_PRESETS) {
        presetOpts += '<option value="' + pk + '">' + VEKeyframes.SPEED_PRESETS[pk].label + '</option>';
      }
    }
    html += _accOpen('zap', 'Speed') +
      '<div class="ve-insp-pair">' +
        '<div class="ve-insp-field"><span class="ve-insp-field-lb">Rate</span><input type="number" class="ve-insp-input ve-insp-num" id="ve-insp-speed" value="' + (clip.speed || 1) + '" step="0.25" min="0.1" max="8"></div>' +
        '<div class="ve-insp-field"><span class="ve-insp-field-lb">Ramp</span><select class="ve-insp-select" id="ve-insp-speed-preset">' + presetOpts + '</select></div>' +
      '</div>' +
      (hasSpeedKf ? '<div class="ve-insp-row"><canvas id="ve-insp-speed-graph" width="200" height="40" class="ve-insp-speed-graph"></canvas></div>' : '') +
      (hasSpeedKf ? '<div class="ve-insp-row"><button class="ve-insp-btn" id="ve-insp-speed-clear">Clear Speed Ramp</button></div>' : '') +
    _accClose();

    /* ── Transitions ── PICTURE ONLY, same reason: a transition is drawn by the compositor, and
       the audio engine never reads `clip.transitions`. "Wipe left" on a music track did nothing. */
    if (_hasPicture) html += _accOpen('shuffle', 'Transitions') +
      '<div class="ve-insp-trhead"><span>Intro</span><button class="ve-insp-fxall" data-trall="ve-insp-tr-in">Show all</button></div>' + _transCards('ve-insp-tr-in', trIn.type || 'none') + _durRow('ve-insp-tr-in-dur', trIn.duration || 0.5) +
      '<div class="ve-insp-trhead"><span>Exit</span><button class="ve-insp-fxall" data-trall="ve-insp-tr-out">Show all</button></div>' + _transCards('ve-insp-tr-out', trOut.type || 'none') + _durRow('ve-insp-tr-out-dur', trOut.duration || 0.5) +
    _accClose();

    // ── Audio ── (only where there IS an audio stream: a still image has none, and its
    // volume/EQ sliders were dead controls that also kept an empty Audio tab on screen)
    if (clip.type === 'video' || clip.type === 'audio') {
      var eqVals = (clip.eq || { low: 0, mid: 0, high: 0 });
      html += _accOpen('volume-2', 'Audio') +
        _filterSlider('Volume', 've-insp-vol', Math.round((clip.volume || 1) * 100), 0, 200, '%') +
        '<div class="ve-insp-row" style="margin-top:6px;opacity:0.6;font-size:10px;">3-Band EQ (dB)</div>' +
        _filterSlider('Low', 've-insp-eq-low', eqVals.low || 0, -12, 12, 'dB') +
        _filterSlider('Mid', 've-insp-eq-mid', eqVals.mid || 0, -12, 12, 'dB') +
        _filterSlider('High', 've-insp-eq-high', eqVals.high || 0, -12, 12, 'dB') +
      _accClose();
    }

    // ── Background ──
    var _proj = window.VideoEditor && VideoEditor.getProject ? VideoEditor.getProject() : null;
    var _isBg = _proj && _proj._bgClipId === clip.id;
    if (_isBg) {
      var _fitVal = (_proj && _proj.bgFit) || 'cover';
      html += _accOpen('image', 'Background') +
        '<div class="ve-insp-row"><span class="ve-insp-label">Fit Mode</span>' +
          '<select class="ve-insp-select" id="ve-insp-bg-fit">' +
            '<option value="cover"' + (_fitVal === 'cover' ? ' selected' : '') + '>Cover</option>' +
            '<option value="contain"' + (_fitVal === 'contain' ? ' selected' : '') + '>Contain</option>' +
            '<option value="stretch"' + (_fitVal === 'stretch' ? ' selected' : '') + '>Stretch</option>' +
          '</select></div>' +
        '<div class="ve-insp-row"><button class="ve-insp-btn" id="ve-insp-bg-remove">' + _icon('x-circle', 12) + ' Remove from Background</button></div>' +
      _accClose();
    }

    // ── Denoise (Audio) ──
    if ((clip.type === 'video' || clip.type === 'audio') && window.VEDenoise) {
      var dn = clip.denoise || { enabled: false, mix: 100 };
      html += _accOpen('volume-x', 'Denoise (AI)') +
        '<div class="ve-insp-row"><label class="ve-insp-label">Enable</label><input type="checkbox" id="ve-insp-dn-on"' + (dn.enabled ? ' checked' : '') + '></div>' +
        _filterSlider('Mix', 've-insp-dn-mix', dn.mix != null ? dn.mix : 100, 0, 100, '%') +
      _accClose();
    }

    // ── AI Background Removal ──
    /* ALPHA / HIDDEN (owner 2026-07-18). The MediaPipe selfie-segmentation pipeline is demo
       quality: low-accuracy model hardcoded, full-resolution CPU mask refine per preview frame,
       one-frame-stale mask compositing. Hidden until the WebGPU rebuild (see ve-bg-removal.js
       header); flip AI_ALPHA_UI in this file to resurface for development. */
    if (AI_ALPHA_UI && clip.type === 'video' && window.VEBGRemoval) {
      var bgr = clip.bgRemoval || { enabled: false, method: 'mediapipe', threshold: 0.7, feather: 3 };
      html += _accOpen('user-x', 'AI BG Removal') +
        '<div class="ve-insp-row"><label class="ve-insp-label">Enable</label><input type="checkbox" id="ve-insp-bgr-on"' + (bgr.enabled ? ' checked' : '') + '></div>' +
        '<div class="ve-insp-row"><span class="ve-insp-label">Method</span><select class="ve-insp-select" id="ve-insp-bgr-method">' +
          '<option value="mediapipe"' + ((bgr.method || 'mediapipe') === 'mediapipe' ? ' selected' : '') + '>MediaPipe</option>' +
        '</select></div>' +
        _filterSlider('Threshold', 've-insp-bgr-thresh', Math.round((bgr.threshold != null ? bgr.threshold : 0.7) * 100), 0, 100, '%') +
        _filterSlider('Feather', 've-insp-bgr-feather', bgr.feather != null ? bgr.feather : 3, 0, 20, 'px') +
      _accClose();
    }

    // ── Face Tracker (AI) ──
    /* ALPHA / HIDDEN (owner 2026-07-18). Whole-clip main-thread seek loop with no cancel/progress
       (reads as a freeze) and the result plumbing never stored data (array vs .frames mismatch).
       Hidden until a MediaPipe Tasks Vision rebuild; flip AI_ALPHA_UI to resurface. */
    if (AI_ALPHA_UI && clip.type === 'video' && window.VEAdvancedFeatures && VEAdvancedFeatures.MotionTracker) {
      html += _accOpen('scan-face', 'Face Tracker (AI)') +
        '<div class="ve-insp-row"><button class="ve-insp-btn" id="ve-insp-face-track">' + _icon('scan-face', 12) + ' Track Faces</button></div>' +
        '<div class="ve-insp-row"><button class="ve-insp-btn" id="ve-insp-face-zoom">' + _icon('zoom-in', 12) + ' Auto-Zoom to Face</button></div>' +
      _accClose();
    }

    // ── Chroma Key (Phase 12) ──
    if (clip.type === 'video') {
      var ck = clip.chromaKey || { enabled: false, color: '#00b140', similarity: 0.4, smoothness: 0.1, spill: 0.5 };
      html += _accOpen('eye-off', 'Chroma Key') +
        '<div class="ve-insp-row"><label class="ve-insp-label">Enable</label><input type="checkbox" id="ve-insp-ck-on"' + (ck.enabled ? ' checked' : '') + '></div>' +
        '<div class="ve-insp-row"><span class="ve-insp-label">Key Color</span><input type="color" class="ve-insp-input" id="ve-insp-ck-color" value="' + (ck.color || '#00b140') + '" style="width:50px;height:24px;padding:0;border:none;"></div>' +
        _filterSlider('Similarity', 've-insp-ck-sim', Math.round((ck.similarity || 0.4) * 100), 0, 100, '%') +
        _filterSlider('Smoothness', 've-insp-ck-smooth', Math.round((ck.smoothness || 0.1) * 100), 0, 100, '%') +
        _filterSlider('Spill', 've-insp-ck-spill', Math.round((ck.spill || 0.5) * 100), 0, 100, '%') +
      _accClose();
    }

    // ── Dublaj / Seslendirme (ElevenLabs) — right under Chroma Key in the AI tab ──
    if (clip.type === 'video' && window.VEDubbing) {
      html += _accOpen('layers', 'Dubbing') +
        '<div class="ve-insp-row"><span class="ve-insp-value" style="font-size:11px;">Add AI voiceover to this video (ElevenLabs).</span></div>' +
        '<div class="ve-insp-row"><button type="button" onclick="window.VEDubbing&&VEDubbing.showDublaj()" style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid var(--accent,#f2ff58);background:var(--accent,#f2ff58);color:#0b0b0d;font-weight:600;cursor:pointer;">Dubbing (AI)</button></div>' +
      _accClose();
    }

    // ── Blend Mode (icon-card wizard, like transitions) ──
    if (clip.type === 'video') {
      html += _accOpen('layers', 'Blend Mode') + _blendCards(clip.blendMode || 'normal') + _accClose();
    }

    // ── Color Grading (overhauled: sub-tabbed pro panel — levels/curves/wheels/LUT + WB/sat/scope) ──
    if (clip.type === 'video' && window.VEColorGrading) {
      html += _cgSection(clip);
    }

    // Power Windows are NOT here (owner 2026-07-17). Local grading is a canvas activity: you draw
    // the shape on the picture, so its controls belong on a floating toolbar over the picture, not
    // buried in a properties tab. See modules/video/ve-color-tools/.

    // Style Transfer (neural, TF.js from CDN) removed entirely — owner: broken under COEP + too heavy (2026-07-13).

    // ── Keyframes summary ──
    if (clip.keyframes && window.VEKeyframes) {
      var kfTimes = VEKeyframes.getAllKeyframeTimes(clip.keyframes);
      html += _accOpen('diamond', 'Keyframes') +
        '<div class="ve-insp-row"><span class="ve-insp-value">' + kfTimes.length + ' keyframe(s)</span></div>' +
      _accClose();
    }

    panel.innerHTML = html;
    _bindEvents(clip, panel);
    _bindAccordions(panel);
    if (target) _applyDockTabs(panel);
  }

  // ── Docked mode: render the inspector into the right Properties panel and
  // split the sections into pill tabs (owner: clip props in the panel, tabbed).
  // Reuses the EXACT sections + bindings above; the tabs only filter which
  // sections are visible, so zero binding logic is touched.
  var _docked = false, _dockHost = null, _dockTab = 'temel';
  /* The remembered tab is PER KIND (`_dockKey`), not one global string: a media clip's tabs and a
     subtitle's tabs are different vocabularies, so one shared value made every switch between two
     item kinds land on a tab the other kind does not have. */
  var _dockTabMem = {}, _dockKey = 'clip';
  var _DOCK_TABMAP = [
    ['temel', ['Source', 'Timeline', 'Transform', 'Speed']],
    ['renk', ['Filters', 'Color Grading']],
    ['ses', ['Audio']],
    ['efekt', ['Transitions', 'Blend Mode']],
    ['ai', ['Denoise', 'AI BG Removal', 'Face Tracker', 'Chroma Key', 'Dubbing', 'Background', 'Keyframes']]
  ];
  var _DOCK_TABS = [['temel', 'Basic'], ['renk', 'Color'], ['ses', 'Audio'], ['efekt', 'Effect'], ['ai', 'AI']];
  function _tabForTitle(title) {
    for (var i = 0; i < _DOCK_TABMAP.length; i++) {
      var keys = _DOCK_TABMAP[i][1];
      for (var j = 0; j < keys.length; j++) if (title.indexOf(keys[j]) !== -1) return _DOCK_TABMAP[i][0];
    }
    return 'temel';
  }
  /* AN ADOPTED BLOCK IS OPAQUE TO THE SHELL: every query below is DIRECT-CHILD only.
     A borrowed panel block can itself be a tabbed inspector built from the same classes - the image
     inspector is exactly that - so a descendant query found ITS sections and ITS pills too. Measured
     on an image overlay: seven pills instead of four (its row counted as ours) and this filter
     writing inline display over sections whose visibility that inspector owns through its own
     `data-cci-tab` CSS rule, which no click of its own could then undo. */
  var _SEC_SEL = ':scope > .ve-insp-section';
  function _filterDockTab(host, tab) {
    var secs = host.querySelectorAll(_SEC_SEL);
    for (var i = 0; i < secs.length; i++) {
      secs[i].style.display = (secs[i].getAttribute('data-veitab') === tab) ? '' : 'none';
    }
  }
  /* THE PILL ROW IS DERIVED FROM THE SECTIONS THAT REALLY EXIST (owner 2026-08-12).
     It used to render all five pills unconditionally, so an audio clip opened a Color and an Effect
     tab with nothing inside them: an empty tab is indistinguishable from a broken one. A section may
     now also DECLARE its own tab with `data-veitab` (that is how a non-clip item kind - overlay,
     subtitle - reuses this shell without going through the title-matching table). */
  function _applyDockTabs(host, opts) {
    opts = opts || {};
    var tabDefs = opts.tabs || _DOCK_TABS;
    var hdr = host.querySelector('.ve-insp-header');
    if (hdr) hdr.style.display = 'none'; // no floating "Inspector" chrome in the panel
    // tag each section with its tab (a declared data-veitab wins over the title table)
    var secs = host.querySelectorAll(_SEC_SEL);
    for (var i = 0; i < secs.length; i++) {
      if (secs[i].getAttribute('data-veitab')) continue;
      var titleEl = secs[i].querySelector('.ve-insp-section-title');
      secs[i].setAttribute('data-veitab', _tabForTitle(titleEl ? titleEl.textContent.trim() : ''));
    }
    // Effects slider at the top of the Efekt tab (owner: effects as a horizontal
    // slider + "Tümünü göster"). Reuses VEEffectsLibrary (data + applyEffect).
    // Injected BEFORE the pills are derived, or its own tab would not be counted.
    if (opts.effects !== false) _injectEffectsSlider(host);
    var present = {};
    secs = host.querySelectorAll(_SEC_SEL);
    for (i = 0; i < secs.length; i++) present[secs[i].getAttribute('data-veitab')] = true;
    var live = [];
    tabDefs.forEach(function (t) { if (present[t[0]]) live.push(t); });
    if (!live.length) return;
    if (!present[_dockTab]) _dockTab = live[0][0];
    // pill-tab row (owner: image-1 style segmented pills)
    var row = document.createElement('div');
    row.className = 've-insp-docktabs';
    live.forEach(function (t) {
      var b = document.createElement('button');
      b.className = 've-insp-docktab' + (_dockTab === t[0] ? ' active' : '');
      b.textContent = t[1];
      b.setAttribute('data-veitab', t[0]);
      b.onclick = function () {
        _dockTab = t[0];
        _dockTabMem[_dockKey] = t[0];
        _filterDockTab(host, t[0]);
        var all = host.querySelectorAll(':scope > .ve-insp-docktabs > .ve-insp-docktab');
        for (var k = 0; k < all.length; k++) all[k].classList.toggle('active', all[k].getAttribute('data-veitab') === t[0]);
      };
      row.appendChild(b);
    });
    if (hdr && hdr.nextSibling) host.insertBefore(row, hdr.nextSibling);
    else host.insertBefore(row, host.firstChild);
    _dockTabMem[_dockKey] = _dockTab;
    _filterDockTab(host, _dockTab);
  }

  /* "Back" from a full-grid view (effects / transitions / blend) returns to WHATEVER the dock was
     showing: a media clip re-renders through renderInto, any other item kind through the renderer it
     registered with dockRender. Hard-coding renderInto here sent a Back press on an overlay's
     transition grid to the media inspector, or to a blank panel when no media clip was selected. */
  var _dockRerender = null;
  function _dockBack(dh, cid) {
    if (typeof _dockRerender === 'function') { _dockRerender(); return; }
    if (dh && cid) renderInto(dh, cid);
  }

  function _fxCardHtml(fx, clip, gridCls) {
    var active = window.VEEffectsLibrary && VEEffectsLibrary.isEffectActive && clip && VEEffectsLibrary.isEffectActive(clip, fx.id);
    return '<button class="ve-insp-fxcard' + (gridCls ? ' ' + gridCls : '') + (active ? ' active' : '') + '" data-fx="' + fx.id + '" title="' + _esc(fx.desc || '') + '">' +
      '<span class="ve-insp-fxcard-ic">' + _icon(fx.icon || 'wand', 18) + '</span>' +
      '<span class="ve-insp-fxcard-lb">' + _esc(fx.label) + '</span></button>';
  }
  function _refreshFxActive() {
    var VEL = window.VEEffectsLibrary, clip = _findClip(_currentClipId);
    if (!VEL || !VEL.isEffectActive || !clip) return;
    var all = document.querySelectorAll('.ve-insp-fxcard');
    for (var i = 0; i < all.length; i++) all[i].classList.toggle('active', VEL.isEffectActive(clip, all[i].getAttribute('data-fx')));
  }
  // Hide the left arrow at scroll start / right at end; both are hover-only via CSS.
  function _updateArrowEdges(vp, prev, next) {
    if (!vp) return;
    var atStart = vp.scrollLeft <= 1;
    var atEnd = vp.scrollLeft >= (vp.scrollWidth - vp.clientWidth - 1);
    if (prev) prev.classList.toggle('at-edge', atStart);
    if (next) next.classList.toggle('at-edge', atEnd);
  }
  function _injectEffectsSlider(host) {
    var VEL = window.VEEffectsLibrary;
    if (!VEL || !VEL.EFFECTS) return;
    var clip = _findClip(_currentClipId);
    // A picture effect has no target on an audio clip (or on no clip at all): offering it there is
    // a control that cannot do anything, and it is also what kept the Effect tab non-empty.
    if (!clip || (clip.type !== 'video' && clip.type !== 'image')) return;
    var sec = document.createElement('div');
    sec.className = 've-insp-section ve-insp-fxsec';
    sec.setAttribute('data-veitab', 'efekt');
    var cards = '';
    VEL.EFFECTS.slice(0, 14).forEach(function (fx) { cards += _fxCardHtml(fx, clip); });
    sec.innerHTML =
      '<div class="ve-insp-fxhead"><span>Effects</span><button class="ve-insp-fxall" id="ve-insp-fxall">Show all</button></div>' +
      '<div class="ve-insp-fxnav">' +
        '<button class="ve-insp-fxarrow" id="ve-insp-fxprev" aria-label="Previous">' + _icon('chevron-left', 16) + '</button>' +
        '<div class="ve-insp-fxviewport"><div class="ve-insp-fxrow">' + cards + '</div></div>' +
        '<button class="ve-insp-fxarrow" id="ve-insp-fxnext" aria-label="Next">' + _icon('chevron-right', 16) + '</button>' +
      '</div>';
    var firstEfekt = null;
    var secs = host.querySelectorAll(_SEC_SEL);
    for (var i = 0; i < secs.length; i++) { if (secs[i] !== sec && secs[i].getAttribute('data-veitab') === 'efekt') { firstEfekt = secs[i]; break; } }
    if (firstEfekt) host.insertBefore(sec, firstEfekt); else host.appendChild(sec);
    var allBtn = sec.querySelector('#ve-insp-fxall');
    if (allBtn) allBtn.onclick = function () { _dockTab = 'efekt'; _showAllEffects(host); };
    var vp = sec.querySelector('.ve-insp-fxviewport');
    var prev = sec.querySelector('#ve-insp-fxprev'), next = sec.querySelector('#ve-insp-fxnext');
    if (prev && vp) prev.onclick = function () { vp.scrollBy({ left: -168, behavior: 'smooth' }); };
    if (next && vp) next.onclick = function () { vp.scrollBy({ left: 168, behavior: 'smooth' }); };
    if (vp) { vp.addEventListener('scroll', function () { _updateArrowEdges(vp, prev, next); }); setTimeout(function () { _updateArrowEdges(vp, prev, next); }, 0); }
    _wireFxCards(sec);
  }
  function _wireFxCards(scope) {
    var cards = scope.querySelectorAll('.ve-insp-fxcard');
    for (var i = 0; i < cards.length; i++) {
      cards[i].onclick = (function (id) {
        return function () {
          var VEL = window.VEEffectsLibrary; if (!VEL) return;
          var clip = _findClip(_currentClipId);
          // Toggle: active effect -> remove, else apply (owner: geri kaldıramıyorum).
          if (VEL.isEffectActive && clip && VEL.isEffectActive(clip, id)) { if (VEL.removeEffect) VEL.removeEffect(id); }
          else if (VEL.applyEffect) VEL.applyEffect(id);
          _refreshFxActive();
        };
      })(cards[i].getAttribute('data-fx'));
    }
  }
  function _showAllEffects(host) {
    var VEL = window.VEEffectsLibrary;
    if (!VEL || !VEL.EFFECTS) return;
    var clip = _findClip(_currentClipId);
    var grid = '';
    VEL.EFFECTS.forEach(function (fx) { grid += _fxCardHtml(fx, clip, 've-insp-fxcard--grid'); });
    // This view REPLACES the dock's innerHTML, so any borrowed panel block must go home first
    // (see the dock-release note above); the reference alone surviving in the borrower's array is
    // luck, not a contract - a getElementById between the wipe and the Back press finds nothing.
    _fireDockRelease();
    var _cid = _currentClipId, _dh = _dockHost || document.getElementById('rp-properties-wrap');
    host.innerHTML =
      '<div class="ve-insp-fxallhead"><button class="ve-insp-fxback" id="ve-insp-fxback">' + _icon('chevron-left', 15) + ' Back</button><span>All effects</span></div>' +
      '<div class="ve-insp-fxgrid">' + grid + '</div>';
    var back = host.querySelector('#ve-insp-fxback');
    if (back) back.onclick = function () { _dockTab = 'efekt'; _dockBack(_dh, _cid); };
    _wireFxCards(host);
  }
  function _showAllTransitions(host, idFor, clipArg) {
    var clip = clipArg || _findClip(_currentClipId);
    if (!clip) return;
    var isIn = idFor === 've-insp-tr-in';
    var cur = 'none';
    if (clip && clip.transitions) { var tr = isIn ? clip.transitions.in : clip.transitions.out; cur = (tr && tr.type) || 'none'; }
    var grid = '';
    TRANS_TYPES.forEach(function (t) {
      var lb = t === 'none' ? 'None' : t.replace(/-/g, ' ');
      grid += '<button class="ve-insp-trcard ve-insp-fxcard--grid' + (cur === t ? ' active' : '') + '" data-tr="' + t + '" data-for="' + idFor + '" title="' + _esc(lb) + '">' +
        '<span class="ve-insp-trcard-ic">' + _icon(_transIcon(t), 16) + '</span><span class="ve-insp-trcard-lb">' + _esc(lb) + '</span></button>';
    });
    // This view REPLACES the dock's innerHTML, so any borrowed panel block must go home first
    // (see the dock-release note above); the reference alone surviving in the borrower's array is
    // luck, not a contract - a getElementById between the wipe and the Back press finds nothing.
    _fireDockRelease();
    var _cid = _currentClipId, _dh = _dockHost || document.getElementById('rp-properties-wrap');
    host.innerHTML =
      '<div class="ve-insp-fxallhead"><button class="ve-insp-fxback" id="ve-insp-fxback">' + _icon('chevron-left', 15) + ' Back</button><span>Transitions ' + (isIn ? '(In)' : '(Out)') + '</span></div>' +
      '<div class="ve-insp-fxgrid">' + grid + '</div>';
    var back = host.querySelector('#ve-insp-fxback');
    if (back) back.onclick = function () { _dockTab = 'efekt'; _dockBack(_dh, _cid); };
    var cards = host.querySelectorAll('.ve-insp-trcard[data-for="' + idFor + '"]');
    for (var i = 0; i < cards.length; i++) {
      cards[i].onclick = (function (tid) {
        return function () {
          if (!clip.transitions) clip.transitions = { in: null, out: null };
          var dir = isIn ? 'in' : 'out';
          var dur = (clip.transitions[dir] && clip.transitions[dir].duration) || 0.5;
          if (window.VideoEditor && VideoEditor.setTransition) VideoEditor.setTransition(clip.id, dir, tid, dur);
          else clip.transitions[dir] = (tid === 'none') ? null : { type: tid, duration: dur };
          // Seek to the transition window so it's visible (legacy parity).
          if (window.VideoEditor && VideoEditor.seek && tid !== 'none') {
            if (dir === 'out') VideoEditor.seek(Math.max(0, clip.startTime + clip.duration - dur));
            else VideoEditor.seek(clip.startTime);
          }
          _changed();
          _showAllTransitions(host, idFor);
        };
      })(cards[i].getAttribute('data-tr'));
    }
  }

  // ── Filter slider helper ──
  function _filterSlider(label, id, val, min, max, unit) {
    return '<div class="ve-insp-row ve-insp-slider-row">' +
      '<span class="ve-insp-label">' + label + '</span>' +
      '<input type="range" class="ve-insp-slider" id="' + id + '" min="' + min + '" max="' + max + '" value="' + val + '">' +
      '<span class="ve-insp-slider-val" id="' + id + '-val">' + val + unit + '</span>' +
    '</div>';
  }

  // ── Accordion toggle binding ──
  function _bindAccordions(panel) {
    // Direct children only: a borrowed inspector binds its own titles, and a second
    // listener on the same one toggles `collapsed` twice, i.e. does nothing at all.
    var titles = panel.querySelectorAll(':scope > .ve-insp-section > .ve-insp-section-title');
    for (var i = 0; i < titles.length; i++) {
      titles[i].addEventListener('click', function(e) {
        var section = this.closest('.ve-insp-section');
        if (section) section.classList.toggle('collapsed');
      });
    }
  }

  // ── Transition select helper ──
  function _transSelect(id, current) {
    var html = '<select class="ve-insp-select" id="' + id + '">';
    TRANS_TYPES.forEach(function(t) {
      html += '<option value="' + t + '"' + (t === current ? ' selected' : '') + '>' + t + '</option>';
    });
    html += '</select>';
    return html;
  }

  // Transition icon-card picker (owner: iconlu kutucuklar, süre tasarıma yedirilmiş)
  function _transIcon(id) {
    // single source of truth — same complete icon map the transitions modal uses
    return (window.VETransitions && VETransitions.iconFor) ? VETransitions.iconFor(id) : 'shuffle';
  }
  function _transCards(idFor, current) {
    var cards = '';
    TRANS_TYPES.forEach(function (t) {
      var lb = t === 'none' ? 'None' : t.replace(/-/g, ' ');
      cards += '<button class="ve-insp-trcard' + (current === t ? ' active' : '') + '" data-tr="' + t + '" data-for="' + idFor + '" title="' + _esc(lb) + '">' +
        '<span class="ve-insp-trcard-ic">' + _icon(_transIcon(t), 15) + '</span>' +
        '<span class="ve-insp-trcard-lb">' + _esc(lb) + '</span></button>';
    });
    return '<div class="ve-insp-fxnav">' +
      '<button class="ve-insp-fxarrow" data-trnav="' + idFor + '" data-dir="-1" aria-label="Previous">' + _icon('chevron-left', 15) + '</button>' +
      '<div class="ve-insp-fxviewport ve-insp-trvp" data-vp="' + idFor + '"><div class="ve-insp-trrow">' + cards + '</div></div>' +
      '<button class="ve-insp-fxarrow" data-trnav="' + idFor + '" data-dir="1" aria-label="Next">' + _icon('chevron-right', 15) + '</button></div>';
  }
  function _durRow(id, val) {
    return '<div class="ve-insp-durrow"><span class="ve-insp-durlabel">Duration</span>' +
      '<input type="range" class="ve-insp-slider ve-insp-durslider" id="' + id + '" min="0.1" max="3" step="0.1" value="' + val + '">' +
      '<span class="ve-insp-durval" id="' + id + '-val">' + (val || 0.5).toFixed(1) + 's</span></div>';
  }
  /* ONE transition binder for every timeline item that HAS transitions (media clip and canvas
     overlay alike - the compositor already applies an overlay's in/out through
     `VE._veApplyOverlayTransition`, it simply had no control anywhere).
     Applies via the SAME path as the legacy transitions browser (VideoEditor.setTransition → undo +
     render) AND seeks to the transition window so the effect is visible right away. Without the seek
     the transition was set but the playhead sat elsewhere, so nothing showed — owner: "yeni çalışmıyor".
     Scoped to `root`, so the dock and the floating panel can never bind each other's cards. */
  function _bindTransUI(root, clip, onChange) {
    var R = root || document;
    if (!clip) return;
    function fire() { if (typeof onChange === 'function') onChange(); else _changed(); }
    function wireCards(forId, dir) {
      var cards = R.querySelectorAll('.ve-insp-trcard[data-for="' + forId + '"]');
      for (var i = 0; i < cards.length; i++) {
        cards[i].addEventListener('click', function () {
          var tid = this.getAttribute('data-tr');
          if (!clip.transitions) clip.transitions = { in: null, out: null };
          var dur = (clip.transitions[dir] && clip.transitions[dir].duration) || 0.5;
          if (window.VideoEditor && VideoEditor.setTransition) {
            VideoEditor.setTransition(clip.id, dir, tid, dur);   // undo + render (legacy parity)
          } else {
            clip.transitions[dir] = (tid === 'none') ? null : { type: tid, duration: dur };
          }
          var all = R.querySelectorAll('.ve-insp-trcard[data-for="' + forId + '"]');
          for (var k = 0; k < all.length; k++) all[k].classList.toggle('active', all[k] === this);
          // Seek to the transition preview window (start for in, end-dur for out).
          if (window.VideoEditor && VideoEditor.seek && tid !== 'none') {
            if (dir === 'out') VideoEditor.seek(Math.max(0, clip.startTime + clip.duration - dur));
            else VideoEditor.seek(clip.startTime);
          }
          fire();
        });
      }
    }
    wireCards('ve-insp-tr-in', 'in');
    wireCards('ve-insp-tr-out', 'out');
    function bindDur(id, cb) {
      var el = R.querySelector('#' + id); if (!el) return;
      var vEl = R.querySelector('#' + id + '-val');
      el.addEventListener('input', function () { var v = parseFloat(el.value) || 0.5; if (vEl) vEl.textContent = v.toFixed(1) + 's'; cb(v); fire(); });
    }
    bindDur('ve-insp-tr-in-dur', function (v) { if (clip.transitions && clip.transitions.in) clip.transitions.in.duration = v; });
    bindDur('ve-insp-tr-out-dur', function (v) { if (clip.transitions && clip.transitions.out) clip.transitions.out.duration = v; });
    var trNav = R.querySelectorAll('.ve-insp-fxarrow[data-trnav]');
    for (var _tn = 0; _tn < trNav.length; _tn++) {
      trNav[_tn].addEventListener('click', function () {
        var vp = R.querySelector('.ve-insp-trvp[data-vp="' + this.getAttribute('data-trnav') + '"]');
        if (vp) vp.scrollBy({ left: parseInt(this.getAttribute('data-dir'), 10) * 168, behavior: 'smooth' });
      });
    }
    // edge-aware arrows for each transition viewport
    var trVps = R.querySelectorAll('.ve-insp-trvp');
    for (var _tv = 0; _tv < trVps.length; _tv++) {
      (function (vp) {
        var forId = vp.getAttribute('data-vp');
        var p = R.querySelector('.ve-insp-fxarrow[data-trnav="' + forId + '"][data-dir="-1"]');
        var n = R.querySelector('.ve-insp-fxarrow[data-trnav="' + forId + '"][data-dir="1"]');
        vp.addEventListener('scroll', function () { _updateArrowEdges(vp, p, n); });
        setTimeout(function () { _updateArrowEdges(vp, p, n); }, 0);
      })(trVps[_tv]);
    }
    // "Tümünü göster" for transitions (owner: transitions library show-all)
    var trAll = R.querySelectorAll('[data-trall]');
    for (var _ta = 0; _ta < trAll.length; _ta++) {
      trAll[_ta].addEventListener('click', function () {
        var host = document.getElementById('ve-insp-dock') || _panel;
        if (host) _showAllTransitions(host, this.getAttribute('data-trall'), clip);
      });
    }
  }

  var _BLEND_MODES = [['normal', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['overlay', 'Overlay'], ['darken', 'Darken'], ['lighten', 'Lighten'], ['color-dodge', 'Color Dodge'], ['color-burn', 'Color Burn'], ['hard-light', 'Hard Light'], ['soft-light', 'Soft Light'], ['difference', 'Difference'], ['exclusion', 'Exclude'], ['hue', 'Tone'], ['saturation', 'Saturation'], ['color', 'Color'], ['luminosity', 'Brightness']];
  function _blendCards(current) {
    var cards = '';
    _BLEND_MODES.forEach(function (m) {
      cards += '<button class="ve-insp-trcard' + (current === m[0] ? ' active' : '') + '" data-blend="' + m[0] + '" title="' + _esc(m[1]) + '">' +
        '<span class="ve-insp-trcard-ic">' + _icon('layers', 15) + '</span><span class="ve-insp-trcard-lb">' + _esc(m[1]) + '</span></button>';
    });
    return '<div class="ve-insp-trhead"><span></span><button class="ve-insp-fxall" data-blall="1">Show all</button></div>' +
      '<div class="ve-insp-fxnav">' +
      '<button class="ve-insp-fxarrow" data-blnav="1" data-dir="-1" aria-label="Previous">' + _icon('chevron-left', 15) + '</button>' +
      '<div class="ve-insp-fxviewport ve-insp-blvp"><div class="ve-insp-trrow">' + cards + '</div></div>' +
      '<button class="ve-insp-fxarrow" data-blnav="1" data-dir="1" aria-label="Next">' + _icon('chevron-right', 15) + '</button></div>';
  }

  // Full blend-mode grid + back (owner: blend mode needs a "Tümünü göster" like transitions/effects).
  function _showAllBlendModes(host, clipArg) {
    var clip = clipArg || _findClip(_currentClipId);
    var cur = (clip && clip.blendMode) || 'normal';
    var grid = '';
    _BLEND_MODES.forEach(function (m) {
      grid += '<button class="ve-insp-trcard ve-insp-fxcard--grid' + (cur === m[0] ? ' active' : '') + '" data-blend="' + m[0] + '" title="' + _esc(m[1]) + '">' +
        '<span class="ve-insp-trcard-ic">' + _icon('layers', 16) + '</span><span class="ve-insp-trcard-lb">' + _esc(m[1]) + '</span></button>';
    });
    // This view REPLACES the dock's innerHTML, so any borrowed panel block must go home first
    // (see the dock-release note above); the reference alone surviving in the borrower's array is
    // luck, not a contract - a getElementById between the wipe and the Back press finds nothing.
    _fireDockRelease();
    var _cid = _currentClipId, _dh = _dockHost || document.getElementById('rp-properties-wrap');
    host.innerHTML =
      '<div class="ve-insp-fxallhead"><button class="ve-insp-fxback" id="ve-insp-fxback">' + _icon('chevron-left', 15) + ' Back</button><span>All blend modes</span></div>' +
      '<div class="ve-insp-fxgrid">' + grid + '</div>';
    var back = host.querySelector('#ve-insp-fxback');
    if (back) back.onclick = function () { _dockTab = 'efekt'; _dockBack(_dh, _cid); };
    var cards = host.querySelectorAll('.ve-insp-trcard[data-blend]');
    for (var i = 0; i < cards.length; i++) {
      cards[i].onclick = (function (bid) {
        return function () { if (clip) clip.blendMode = bid; _changed(); _showAllBlendModes(host); };
      })(cards[i].getAttribute('data-blend'));
    }
  }

  // ── Escape HTML ──
  function _esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Bind all input events ──
  // Re-render after a multicam change, honouring where the inspector currently lives.
  // Mirrors the existing docked/floating pattern used by the effects-grid back button.
  function _mcRerender(clipId) {
    var dh = _dockHost || document.getElementById('rp-properties-wrap');
    if (_docked && dh) renderInto(dh, clipId);
    else _render(clipId);
  }

  function _bindEvents(clip, cgRoot) {
    var clipId = clip.id;

    // Close button
    var closeBtn = document.getElementById('ve-insp-close');
    if (closeBtn) closeBtn.addEventListener('click', function() { hide(); });

    // Name — refresh so the timeline clip label updates too (was set silently).
    _bindInput('ve-insp-name', function(val) { clip.name = val; _changed(); });

    // Multi-Cam: change this cut's angle after the fact, or flatten it.
    // Delegates to VE._veMcSwitchAngle / _veMcFlatten — the same primitives the monitor's live
    // cutting uses, so there is one angle-switch code path, not two.
    var _mcVE = window.__ccVideoEditor;
    if (_mcVE && clip.mcAngles) {
      var mcBtns = document.querySelectorAll('.ve-insp-mc-btn[data-mcangle]');
      Array.prototype.forEach.call(mcBtns, function (b) {
        b.addEventListener('click', function () {
          var idx = parseInt(b.getAttribute('data-mcangle'), 10);
          if (idx === (clip.mcActive || 0)) return;
          _mcVE._veBeginUndoGroup && _mcVE._veBeginUndoGroup('Change angle');
          _mcVE._veMcSwitchAngle(clipId, idx);
          _mcVE._veEndUndoGroup && _mcVE._veEndUndoGroup();
          _changed();
          _mcRerender(clipId);
        });
      });
      var flatBtn = document.getElementById('ve-insp-mc-flatten');
      if (flatBtn) flatBtn.addEventListener('click', function () {
        _mcVE._veBeginUndoGroup && _mcVE._veBeginUndoGroup('Flatten multi-cam');
        var ok = _mcVE._veMcFlatten(clipId);
        _mcVE._veEndUndoGroup && _mcVE._veEndUndoGroup();
        if (ok && typeof showToast === 'function') showToast('Multi-cam flattened');
        _changed();
        _mcRerender(clipId);
      });
    }

    // Timeline
    _bindNum('ve-insp-start', function(val) { clip.startTime = Math.max(0, val); _changed(); });
    _bindNum('ve-insp-trim-start', function(val) { clip.trimStart = Math.max(0, val); _changed(); });
    _bindNum('ve-insp-trim-end', function(val) { clip.trimEnd = Math.max(0, val); _changed(); });

    // Transform
    _bindNum('ve-insp-tx', function(val) { _setTransform(clip, 'x', val); });
    _bindNum('ve-insp-ty', function(val) { _setTransform(clip, 'y', val); });
    _bindNum('ve-insp-tscale', function(val) { _setTransform(clip, 'scale', val); });
    _bindNum('ve-insp-trot', function(val) { _setTransform(clip, 'rotation', val); });

    var flipH = document.getElementById('ve-insp-fliph');
    if (flipH) flipH.addEventListener('click', function() {
      _setTransform(clip, 'flipH', !(clip.transform && clip.transform.flipH));
      flipH.classList.toggle('active');
    });
    var flipV = document.getElementById('ve-insp-flipv');
    if (flipV) flipV.addEventListener('click', function() {
      _setTransform(clip, 'flipV', !(clip.transform && clip.transform.flipV));
      flipV.classList.toggle('active');
    });

    // Fit: cover / contain / stretch dropdown (owner). Drives clip.fit which the
    // compositor reads; adjustable further via the X/Y/Scale values above.
    var fitSel = document.getElementById('ve-insp-fit');
    if (fitSel) fitSel.addEventListener('change', function () {
      clip.fit = this.value;
      // The background clip is drawn via _veProject.bgFit, not clip.fit - set both
      // so the fit works whether or not this clip is the canvas background (owner).
      var _p = (window.VideoEditor && VideoEditor.getProject) ? VideoEditor.getProject() : null;
      if (_p && _p._bgClipId === clip.id) _p.bgFit = this.value;
      _changed();
    });

    // Filters
    _bindSlider('ve-insp-f-bright', '%', function(val) { _setFilter(clip, 'brightness', val); });
    _bindSlider('ve-insp-f-contrast', '%', function(val) { _setFilter(clip, 'contrast', val); });
    _bindSlider('ve-insp-f-sat', '%', function(val) { _setFilter(clip, 'saturation', val); });
    _bindSlider('ve-insp-f-hue', '°', function(val) { _setFilter(clip, 'hue', val); });
    _bindSlider('ve-insp-f-sepia', '%', function(val) { _setFilter(clip, 'sepia', val); });
    _bindSlider('ve-insp-f-gray', '%', function(val) { _setFilter(clip, 'grayscale', val); });
    _bindSlider('ve-insp-f-invert', '%', function(val) { _setFilter(clip, 'invert', val); });
    _bindSlider('ve-insp-f-blur', 'px', function(val) { _setFilter(clip, 'blur', val); });

    // Quick-look filter presets (square-icon card slider): set the whole filter object, then re-render.
    var fltPresets = document.querySelectorAll('[data-fltpreset]');
    for (var _fp = 0; _fp < fltPresets.length; _fp++) {
      fltPresets[_fp].addEventListener('click', function () {
        _applyFilterPreset(clip, this.getAttribute('data-fltpreset'));
        _render(clipId);
        _changed();
      });
    }
    // Preset card slider arrows (hover-only, edge-aware) — mirror the blend/transition nav.
    var fltNav = document.querySelectorAll('.ve-insp-fxarrow[data-fltnav]');
    for (var _fn = 0; _fn < fltNav.length; _fn++) {
      fltNav[_fn].addEventListener('click', function () {
        var vp = document.querySelector('.ve-insp-fltvp');
        if (vp) vp.scrollBy({ left: parseInt(this.getAttribute('data-dir'), 10) * 168, behavior: 'smooth' });
      });
    }
    var _fltvp = document.querySelector('.ve-insp-fltvp');
    if (_fltvp) {
      var _flp = document.querySelector('.ve-insp-fxarrow[data-fltnav][data-dir="-1"]');
      var _fln = document.querySelector('.ve-insp-fxarrow[data-fltnav][data-dir="1"]');
      _fltvp.addEventListener('scroll', function () { _updateArrowEdges(_fltvp, _flp, _fln); });
      setTimeout(function () { _updateArrowEdges(_fltvp, _flp, _fln); }, 0);
    }

    // Gelişmiş (advanced) filters expander — collapsed by default to keep the panel calm.
    var advBtn = document.getElementById('ve-flt-adv-toggle'), advBox = document.getElementById('ve-flt-adv');
    if (advBtn && advBox) advBtn.addEventListener('click', function () {
      var open = advBox.style.display === 'none';
      advBox.style.display = open ? '' : 'none';
      advBtn.classList.toggle('open', open);
    });

    var resetBtn = document.getElementById('ve-insp-f-reset');
    if (resetBtn) resetBtn.addEventListener('click', function() {
      clip.filters = {};
      _render(clipId);
      _changed();
    });

    // Speed — the timeline clip length scales INVERSELY with rate so the same footage stays on screen
    // (owner: a 4s clip at 0.5x = 8s, at 2x = 2s). sourceConsumed = duration * speed is kept constant,
    // so the clip visibly grows/shrinks in the track. Ripple: neighbouring clips can now overlap/shift
    // when a clip is sped up or slowed — that IS the intended NLE behaviour.
    _bindNum('ve-insp-speed', function(val) {
      var newSpeed = Math.max(0.1, Math.min(8, val));
      var oldSpeed = clip.speed || 1;
      if (oldSpeed > 0 && newSpeed > 0 && clip.duration > 0 && newSpeed !== oldSpeed) {
        clip.duration = Math.max(0.1, clip.duration * oldSpeed / newSpeed);
      }
      clip.speed = newSpeed;
      var el = _getMediaEl(clipId);
      if (el) el.playbackRate = clip.speed;
      if (window.__ccVideoEditor && window.__ccVideoEditor._veRecalcDuration) window.__ccVideoEditor._veRecalcDuration();
      _changed();
    });

    // Speed ramp preset
    var presetSel = document.getElementById('ve-insp-speed-preset');
    if (presetSel) {
      presetSel.addEventListener('change', function() {
        if (!window.VEKeyframes) return;
        var pk = presetSel.value;
        if (pk) {
          VEKeyframes.applySpeedPreset(clip, pk);
        } else {
          VEKeyframes.clearSpeedKeyframes(clip);
        }
        _changed();
        _render(clipId);
        show(clipId); // refresh inspector to show/hide graph
      });
    }

    // Speed ramp clear button
    var speedClearBtn = document.getElementById('ve-insp-speed-clear');
    if (speedClearBtn) {
      speedClearBtn.addEventListener('click', function() {
        if (window.VEKeyframes) VEKeyframes.clearSpeedKeyframes(clip);
        _changed();
        _render(clipId);
        show(clipId);
      });
    }

    // Draw speed ramp mini-graph
    _drawSpeedGraph(clip);

    _bindTransUI(cgRoot, clip);
    // "Tümünü göster" for blend modes (owner: blend mode needs it too)
    var blAll = document.querySelectorAll('[data-blall]');
    for (var _ba = 0; _ba < blAll.length; _ba++) {
      blAll[_ba].addEventListener('click', function () {
        var host = document.getElementById('ve-insp-dock') || _panel;
        if (host) _showAllBlendModes(host);
      });
    }

    // Volume
    _bindSlider('ve-insp-vol', '%', function(val) {
      clip.volume = val / 100;
      if (window.VEAudioEngine) VEAudioEngine.setClipVolume(clipId, clip.volume);
    });

    // 3-Band EQ
    _bindSlider('ve-insp-eq-low', 'dB', function(val) {
      if (!clip.eq) clip.eq = { low: 0, mid: 0, high: 0 };
      clip.eq.low = val;
      if (window.VEAudioEngine) VEAudioEngine.setClipEQ(clipId, 'low', val);
    });
    _bindSlider('ve-insp-eq-mid', 'dB', function(val) {
      if (!clip.eq) clip.eq = { low: 0, mid: 0, high: 0 };
      clip.eq.mid = val;
      if (window.VEAudioEngine) VEAudioEngine.setClipEQ(clipId, 'mid', val);
    });
    _bindSlider('ve-insp-eq-high', 'dB', function(val) {
      if (!clip.eq) clip.eq = { low: 0, mid: 0, high: 0 };
      clip.eq.high = val;
      if (window.VEAudioEngine) VEAudioEngine.setClipEQ(clipId, 'high', val);
    });

    // Denoise (AI)
    var dnOn = document.getElementById('ve-insp-dn-on');
    if (dnOn) dnOn.addEventListener('change', function() {
      if (!clip.denoise) clip.denoise = { enabled: false, mix: 100 };
      clip.denoise.enabled = dnOn.checked;
      if (dnOn.checked && window.VEDenoise && window.VEAudioEngine) {
        // ensureContext, not getContext: getContext never existed on VEAudioEngine, so this ternary
        // was always null and the checkbox saved state without ever creating the denoise node.
        var audioCtx = VEAudioEngine.ensureContext ? VEAudioEngine.ensureContext() : null;
        if (audioCtx) VEDenoise.createForClip(clipId, audioCtx, { mix: (clip.denoise.mix || 100) / 100 });
      } else if (!dnOn.checked && window.VEDenoise) {
        VEDenoise.disposeForClip(clipId);
      }
      _changed();
    });
    _bindSlider('ve-insp-dn-mix', '%', function(val) {
      if (!clip.denoise) clip.denoise = { enabled: false, mix: 100 };
      clip.denoise.mix = val;
      if (window.VEDenoise) {
        var inst = VEDenoise.getForClip(clipId);
        if (inst && inst.setMix) inst.setMix(val / 100);
      }
    });

    // AI BG Removal
    var bgrOn = document.getElementById('ve-insp-bgr-on');
    if (bgrOn) bgrOn.addEventListener('change', function() {
      if (!clip.bgRemoval) clip.bgRemoval = { enabled: false, method: 'mediapipe', threshold: 0.7, feather: 3 };
      clip.bgRemoval.enabled = bgrOn.checked;
      _changed();
    });
    var bgrMethod = document.getElementById('ve-insp-bgr-method');
    if (bgrMethod) bgrMethod.addEventListener('change', function() {
      if (!clip.bgRemoval) clip.bgRemoval = { enabled: false, method: 'mediapipe', threshold: 0.7, feather: 3 };
      clip.bgRemoval.method = bgrMethod.value;
      _changed();
    });
    _bindSlider('ve-insp-bgr-thresh', '%', function(val) {
      if (!clip.bgRemoval) clip.bgRemoval = { enabled: false, method: 'mediapipe', threshold: 0.7, feather: 3 };
      clip.bgRemoval.threshold = val / 100;
      _changed();
    });
    _bindSlider('ve-insp-bgr-feather', 'px', function(val) {
      if (!clip.bgRemoval) clip.bgRemoval = { enabled: false, method: 'mediapipe', threshold: 0.7, feather: 3 };
      clip.bgRemoval.feather = val;
      _changed();
    });

    // Face Tracker (AI)
    var faceTrackBtn = document.getElementById('ve-insp-face-track');
    if (faceTrackBtn) faceTrackBtn.addEventListener('click', function() {
      var tracker = new VEAdvancedFeatures.MotionTracker();
      var el = _getMediaEl(clipId);
      if (!el) {
        // Fallback: try VideoEditor's pool
        if (window.VideoEditor && VideoEditor.getState) {
          var st = VideoEditor.getState();
          if (st && st.videoPool) el = st.videoPool[clipId];
        }
      }
      if (!el) { if (typeof showToast === 'function') showToast('No video element found', 'error'); return; }
      faceTrackBtn.textContent = 'Tracking...';
      faceTrackBtn.disabled = true;
      tracker.trackFace(el, 0, {}, function(result) {
        faceTrackBtn.textContent = 'Track Faces';
        faceTrackBtn.disabled = false;
        if (result && result.frames) {
          clip._faceTrackData = result;
          if (typeof showToast === 'function') showToast('Face tracking complete: ' + result.frames.length + ' frames');
        } else {
          if (typeof showToast === 'function') showToast('Face tracking failed', 'error');
        }
      });
    });
    var faceZoomBtn = document.getElementById('ve-insp-face-zoom');
    if (faceZoomBtn) faceZoomBtn.addEventListener('click', function() {
      if (!clip._faceTrackData) { if (typeof showToast === 'function') showToast('Run face tracking first'); return; }
      var tracker = new VEAdvancedFeatures.MotionTracker();
      tracker._faceFrames = clip._faceTrackData.frames;
      var proj = window.VideoEditor && VideoEditor.getProject ? VideoEditor.getProject() : null;
      var pw = proj ? (proj.width || 1920) : 1920;
      var ph = proj ? (proj.height || 1080) : 1080;
      var zoomKf = tracker.faceToAutoZoom(clip._mediaWidth || pw, clip._mediaHeight || ph, pw, ph, {});
      if (zoomKf && window.VEKeyframes) {
        if (!clip.keyframes) clip.keyframes = {};
        clip.keyframes.x = zoomKf.x || clip.keyframes.x;
        clip.keyframes.y = zoomKf.y || clip.keyframes.y;
        clip.keyframes.scaleX = zoomKf.scale || clip.keyframes.scaleX;
        if (typeof showToast === 'function') showToast('Auto-zoom keyframes applied');
        _changed();
      }
    });

    // Chroma Key (Phase 12)
    var ckOn = document.getElementById('ve-insp-ck-on');
    if (ckOn) ckOn.addEventListener('change', function() {
      if (!clip.chromaKey) clip.chromaKey = { enabled: false, color: '#00b140', similarity: 0.4, smoothness: 0.1, spill: 0.5 };
      clip.chromaKey.enabled = ckOn.checked;
      _changed();
    });
    var ckColor = document.getElementById('ve-insp-ck-color');
    if (ckColor) ckColor.addEventListener('input', function() {
      if (!clip.chromaKey) clip.chromaKey = { enabled: false, color: '#00b140', similarity: 0.4, smoothness: 0.1, spill: 0.5 };
      clip.chromaKey.color = ckColor.value;
      _changed();
    });
    _bindSlider('ve-insp-ck-sim', '%', function(val) {
      if (!clip.chromaKey) clip.chromaKey = { enabled: false, color: '#00b140', similarity: 0.4, smoothness: 0.1, spill: 0.5 };
      clip.chromaKey.similarity = val / 100;
      _changed();
    });
    _bindSlider('ve-insp-ck-smooth', '%', function(val) {
      if (!clip.chromaKey) clip.chromaKey = { enabled: false, color: '#00b140', similarity: 0.4, smoothness: 0.1, spill: 0.5 };
      clip.chromaKey.smoothness = val / 100;
      _changed();
    });
    _bindSlider('ve-insp-ck-spill', '%', function(val) {
      if (!clip.chromaKey) clip.chromaKey = { enabled: false, color: '#00b140', similarity: 0.4, smoothness: 0.1, spill: 0.5 };
      clip.chromaKey.spill = val / 100;
      _changed();
    });

    // Background fit
    var bgFitSel = document.getElementById('ve-insp-bg-fit');
    if (bgFitSel) bgFitSel.addEventListener('change', function() {
      var proj = window.VideoEditor && VideoEditor.getProject ? VideoEditor.getProject() : null;
      if (proj) { proj.bgFit = bgFitSel.value; _changed(); }
    });
    var bgRemBtn = document.getElementById('ve-insp-bg-remove');
    if (bgRemBtn) bgRemBtn.addEventListener('click', function() {
      var proj = window.VideoEditor && VideoEditor.getProject ? VideoEditor.getProject() : null;
      if (proj) { proj._bgClipId = null; _changed(); _render(clipId); }
    });

    // Blend Mode (icon-card wizard)
    var blendCards = document.querySelectorAll('.ve-insp-trcard[data-blend]');
    for (var _bc = 0; _bc < blendCards.length; _bc++) {
      blendCards[_bc].addEventListener('click', function () {
        clip.blendMode = this.getAttribute('data-blend');
        var all = document.querySelectorAll('.ve-insp-trcard[data-blend]');
        for (var k = 0; k < all.length; k++) all[k].classList.toggle('active', all[k] === this);
        _changed();
      });
    }
    var blNav = document.querySelectorAll('.ve-insp-fxarrow[data-blnav]');
    for (var _bn = 0; _bn < blNav.length; _bn++) {
      blNav[_bn].addEventListener('click', function () {
        var vp = document.querySelector('.ve-insp-blvp');
        if (vp) vp.scrollBy({ left: parseInt(this.getAttribute('data-dir'), 10) * 168, behavior: 'smooth' });
      });
    }
    var _blvp = document.querySelector('.ve-insp-blvp');
    if (_blvp) {
      var _blp = document.querySelector('.ve-insp-fxarrow[data-blnav][data-dir="-1"]');
      var _bln = document.querySelector('.ve-insp-fxarrow[data-blnav][data-dir="1"]');
      _blvp.addEventListener('scroll', function () { _updateArrowEdges(_blvp, _blp, _bln); });
      setTimeout(function () { _updateArrowEdges(_blvp, _blp, _bln); }, 0);
    }

    // Color Grading — overhauled pro panel (levels/curves/wheels/LUT + WB/sat/scope).
    // Scope the binding to THIS panel so its ids never collide with a second CG panel (the modal).
    _bindCg(clip, cgRoot || document);
    // Style Transfer bindings removed (feature fully removed — owner 2026-07-13).
  }

  // ── Input binding helpers ──
  function _bindInput(id, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', function() { fn(el.value); });
  }

  function _bindNum(id, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', function() { fn(parseFloat(el.value) || 0); });
  }

  function VE_NS() { return window.__ccVideoEditor; }

  /* The grading object this panel edits: the clip, OR the selected power window, per the SHARED
     target both this panel and the LUT Browser read (VE._veGradeTarget). Owner 2026-07-17: "color
     grading'de vermek isterim çizdiğim yerlere".
     The fallback SHOUTS instead of quietly writing to `clip.colorGrading`. That field is deleted by
     the gradeNodes migration and the renderer no longer reads it, so the old silent fallback would
     have let every slider, curve and wheel edit a dead address while looking perfectly alive: the
     exact failure that has already cost this feature three rounds. It is unreachable in the shipped
     bundle (both files are children of the same `video` group, which is define-only at load), so if
     it ever fires, something is genuinely wrong and a console line is the cheapest way to find out. */
  function _cgObj(clip) {
    var VE = VE_NS();
    if (VE && VE._veGradeObj) return VE._veGradeObj(clip);
    console.warn('[VEInspector] VE._veGradeObj missing: grading the legacy clip.colorGrading field, ' +
      'which the node-chain renderer does NOT read. Edits here will not show.');
    if (!clip.colorGrading) clip.colorGrading = { enabled: true, preset: 'none' };
    return clip.colorGrading;
  }

  function _cgTargetLabel() {
    var VE = VE_NS();
    var sel = VE && VE._vePwSelected && VE._vePwSelected();
    if (VE && VE._veGradeTarget !== 'clip' && sel) return sel;
    return null;
  }

  function _ensureCG(clip) {
    var cg = _cgObj(clip);
    if (!cg.levels) cg.levels = { inBlack: 0, inWhite: 255, gamma: 1.0, outBlack: 0, outWhite: 255 };
    if (!cg.wb) cg.wb = { temp: 0, tint: 0 };
    if (!cg.sat) cg.sat = { saturation: 100, vibrance: 0 };
    if (cg.opacity == null) cg.opacity = 100;
    if (!cg.curves) cg.curves = {};
    if (!cg.wheels) cg.wheels = { shadows: { r: 0, g: 0, b: 0 }, midtones: { r: 0, g: 0, b: 0 }, highlights: { r: 0, g: 0, b: 0 } };
  }

  // ── Filters (basic CSS-filter adjustments) — quick-look presets + grouped sliders + sepia/gray/invert ──
  var _FILTER_DEFAULTS = { brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, sepia: 0, grayscale: 0, invert: 0 };
  var _FILTER_PRESETS = {
    'none':     {},
    'vivid':    { contrast: 115, saturation: 140, brightness: 104 },
    'warm':     { saturation: 112, hue: -8, sepia: 16, brightness: 103 },
    'cool':     { saturation: 106, hue: 12, contrast: 105 },
    'muted':    { saturation: 72, contrast: 96, brightness: 101 },
    'faded':    { contrast: 82, saturation: 85, brightness: 108, sepia: 8 },
    'bw':       { grayscale: 100, contrast: 116 },
    'dramatic': { contrast: 138, saturation: 122, brightness: 96 }
  };
  function _filtersSection(clip) {
    var f = clip.filters || {};
    // Only surface the advanced (sepia/gray/invert) group when one is actually in use — keeps the
    // default view clean (owner: the flat 8-slider + labels layout was too cluttered).
    var advOn = (f.sepia && f.sepia > 0) || (f.grayscale && f.grayscale > 0) || (f.invert && f.invert > 0);
    // Quick-look presets = square-icon card slider (owner: küçük kare-ikonlu sliderlı bar, chip yığını değil).
    var presets = [['none', 'None', 'ban'], ['vivid', 'Vibrant', 'zap'], ['warm', 'Warm', 'sun'], ['cool', 'Cool', 'snowflake'], ['muted', 'Pale', 'cloud'], ['faded', 'Faded', 'sunset'], ['bw', 'B/W', 'contrast'], ['dramatic', 'Dramatic', 'flame']];
    var curP = f._preset || 'none';
    var cards = '';
    presets.forEach(function (p) {
      cards += '<button class="ve-insp-trcard' + (curP === p[0] ? ' active' : '') + '" data-fltpreset="' + p[0] + '" title="' + p[1] + '">' +
        '<span class="ve-insp-trcard-ic">' + _icon(p[2], 15) + '</span><span class="ve-insp-trcard-lb">' + p[1] + '</span></button>';
    });
    var chips = '<div class="ve-insp-fxnav">' +
      '<button class="ve-insp-fxarrow" data-fltnav="1" data-dir="-1" aria-label="Previous">' + _icon('chevron-left', 15) + '</button>' +
      '<div class="ve-insp-fxviewport ve-insp-fltvp"><div class="ve-insp-trrow">' + cards + '</div></div>' +
      '<button class="ve-insp-fxarrow" data-fltnav="1" data-dir="1" aria-label="Next">' + _icon('chevron-right', 15) + '</button></div>';
    return _accOpen('sun', 'Filters') + chips +
      _filterSlider('Brightness', 've-insp-f-bright', f.brightness != null ? f.brightness : 100, 0, 200, '%') +
      _filterSlider('Contrast', 've-insp-f-contrast', f.contrast != null ? f.contrast : 100, 0, 200, '%') +
      _filterSlider('Saturation', 've-insp-f-sat', f.saturation != null ? f.saturation : 100, 0, 200, '%') +
      _filterSlider('Hue', 've-insp-f-hue', f.hue != null ? f.hue : 0, -180, 180, '°') +
      _filterSlider('Blur', 've-insp-f-blur', f.blur != null ? f.blur : 0, 0, 20, 'px') +
      '<button class="ve-flt-advbtn' + (advOn ? ' open' : '') + '" id="ve-flt-adv-toggle">Advanced' + _icon('chevron-down', 12) + '</button>' +
      '<div class="ve-flt-adv" id="ve-flt-adv"' + (advOn ? '' : ' style="display:none"') + '>' +
        _filterSlider('Sepia', 've-insp-f-sepia', f.sepia != null ? f.sepia : 0, 0, 100, '%') +
        _filterSlider('Grayscale', 've-insp-f-gray', f.grayscale != null ? f.grayscale : 0, 0, 100, '%') +
        _filterSlider('Invert', 've-insp-f-invert', f.invert != null ? f.invert : 0, 0, 100, '%') +
      '</div>' +
      '<div class="ve-insp-row"><button class="ve-insp-btn" id="ve-insp-f-reset">' + _icon('rotate-ccw', 12) + ' Reset filters</button></div>' +
    _accClose();
  }
  function _applyFilterPreset(clip, id) {
    if (id === 'none') { clip.filters = { _preset: 'none' }; return; }
    var p = _FILTER_PRESETS[id]; if (!p) return;
    var nf = { _preset: id };
    for (var k in _FILTER_DEFAULTS) nf[k] = (p[k] != null) ? p[k] : _FILTER_DEFAULTS[k];
    clip.filters = nf;
  }

  // ═══════════════════════════════════════════════════════════
  //  Color Grading PRO panel (owner overhaul 2026-07-13):
  //  sub-tabbed Levels / Curves / Wheels / LUT + WB/Sat + scope,
  //  surfacing the full ve-color-grading engine that was already built.
  // ═══════════════════════════════════════════════════════════
  var _cgTab = 'basic';    // basic | curves | wheels | lut
  var _cgCurveCh = 'rgb';  // rgb | r | g | b
  var _CG_LUT_FALLBACK = ['cinematic', 'teal-orange', 'warm', 'cool', 'vintage', 'noir', 'vivid'];
  function _cgLutLabel(id) { return String(id).replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function _cgPresetLabel(n) { return n === 'none' ? 'None' : _cgLutLabel(n); }

  function _cgSection(clip) {
    _ensureCG(clip);
    var cg = _cgObj(clip);
    var op = cg.opacity != null ? cg.opacity : 100;
    var head =
      '<div class="ve-cg-head">' +
        '<label class="ve-cg-en"><input type="checkbox" id="ve-cg-on"' + (cg.enabled ? ' checked' : '') + '"><span>Open</span></label>' +
        '<div class="ve-cg-hbtns">' +
          '<button class="ve-cg-hbtn' + (cg._bypass ? ' active' : '') + '" id="ve-cg-ba" title="Before / After">' + _icon('eye', 13) + '</button>' +
          '<button class="ve-cg-hbtn" id="ve-cg-reset" title="Reset all">' + _icon('rotate-ccw', 13) + '</button>' +
        '</div>' +
      '</div>' +
      '<canvas id="ve-cg-scope" class="ve-cg-scope" width="248" height="64"></canvas>' +
      '<div class="ve-cg-opac"><span class="ve-insp-label">Intensity</span>' +
        '<input type="range" class="ve-insp-slider" id="ve-cg-opacity" min="0" max="100" value="' + op + '">' +
        '<span class="ve-insp-slider-val" id="ve-cg-opacity-val">' + op + '%</span></div>';
    var tabs = [['basic', 'Basic'], ['curves', 'Curves'], ['wheels', 'Wheels'], ['lut', 'LUT']];
    var tabBar = '<div class="ve-cg-tabs">';
    tabs.forEach(function (t) { tabBar += '<button class="ve-cg-tab' + (_cgTab === t[0] ? ' active' : '') + '" data-cgtab="' + t[0] + '">' + t[1] + '</button>'; });
    tabBar += '</div>';
    var _tl = _cgTargetLabel();
    // The header states WHERE this grade lands. Without it the panel silently edits a window while
    // looking exactly like it is editing the clip.
    var tgtBar = '<div class="ve-cg-target">' +
      '<button class="ve-cg-chip"' + (_tl ? '' : ' on') + '" data-cgtgt="clip">Entire clip</button>' +
      (_tl ? '<button class="ve-cg-chip on" data-cgtgt="win">' +
        '<i class="ve-cg-dot" style="background:' + _tl.color + '"></i>' + _tl.label + '</button>' : '') +
      '</div>';
    return _accOpen('palette', 'Color Grading') +
      tgtBar + head + tabBar +
      '<div class="ve-cg-body" id="ve-cg-body">' + _cgTabBody(cg) + '</div>' +
      _accClose();
  }

  function _cgTabBody(cg) {
    if (_cgTab === 'curves') return _cgCurves(cg);
    if (_cgTab === 'wheels') return _cgWheels(cg);
    if (_cgTab === 'lut') return _cgLut(cg);
    return _cgBasic(cg);
  }

  function _cgBasic(cg) {
    var lv = cg.levels, wb = cg.wb, sat = cg.sat;
    // Core = Preset + In/White/Gamma. The rest (out-levels, white balance, saturation) collapse under
    // "Gelişmiş" so the default Temel view is calm (owner: "temel çok karışık, biraz toparla").
    var advOn = (lv.outBlack) || (lv.outWhite != null && lv.outWhite !== 255) || wb.temp || wb.tint ||
      (sat.saturation != null && sat.saturation !== 100) || sat.vibrance;
    var h = '<div class="ve-insp-row"><span class="ve-insp-label">Preset</span><select class="ve-insp-select" id="ve-cg-preset">';
    VEColorGrading.PRESET_NAMES.forEach(function (n) { h += '<option value="' + n + '"' + (n === (cg.preset || 'none') ? ' selected' : '') + '>' + _cgPresetLabel(n) + '</option>'; });
    h += '</select></div>';
    h += _filterSlider('In Black', 've-cg-inb', lv.inBlack || 0, 0, 255, '') +
      _filterSlider('In White', 've-cg-inw', lv.inWhite != null ? lv.inWhite : 255, 0, 255, '') +
      _filterSlider('Gamma', 've-cg-gamma', Math.round((lv.gamma || 1) * 100), 20, 300, '%');
    h += '<button class="ve-flt-advbtn' + (advOn ? ' open' : '') + '" id="ve-cg-advtoggle">Advanced' + _icon('chevron-down', 12) + '</button>' +
      '<div class="ve-flt-adv" id="ve-cg-adv"' + (advOn ? '' : ' style="display:none"') + '>' +
        _filterSlider('Out Black', 've-cg-outb', lv.outBlack || 0, 0, 255, '') +
        _filterSlider('Out White', 've-cg-outw', lv.outWhite != null ? lv.outWhite : 255, 0, 255, '') +
        '<div class="ve-cg-grp">White Balance</div>' +
        _filterSlider('Temp', 've-cg-temp', wb.temp || 0, -100, 100, '') +
        _filterSlider('Tint', 've-cg-tint', wb.tint || 0, -100, 100, '') +
        '<div class="ve-cg-grp">Color</div>' +
        _filterSlider('Saturation', 've-cg-sat', sat.saturation != null ? sat.saturation : 100, 0, 200, '%') +
        _filterSlider('Vibrance', 've-cg-vib', sat.vibrance || 0, -100, 100, '') +
      '</div>';
    return h;
  }

  function _cgCurves(cg) {
    var chs = [['rgb', 'RGB'], ['r', 'R'], ['g', 'G'], ['b', 'B']];
    var sel = '<div class="ve-cg-chsel">';
    chs.forEach(function (c) { sel += '<button class="ve-cg-ch ve-cg-ch-' + c[0] + (_cgCurveCh === c[0] ? ' active' : '') + '" data-cgch="' + c[0] + '">' + c[1] + '</button>'; });
    sel += '</div>';
    return sel +
      '<canvas id="ve-cg-curve" class="ve-cg-curve" width="248" height="200"></canvas>' +
      '<div class="ve-cg-hint">Click: add point · drag · double-click: delete</div>' +
      '<button class="ve-insp-btn" id="ve-cg-curve-reset">' + _icon('rotate-ccw', 12) + ' Reset curve</button>';
  }

  function _cgWheels() {
    var zones = [['shadows', 'Shadows'], ['midtones', 'Medium'], ['highlights', 'Highlights']];
    var h = '<div class="ve-cg-wheels">';
    zones.forEach(function (z) {
      h += '<div class="ve-cg-wheel">' +
        '<canvas class="ve-cg-pad" data-cgzone="' + z[0] + '" width="132" height="132"></canvas>' +
        '<span class="ve-cg-wlbl">' + z[1] + '</span></div>';
    });
    h += '</div><button class="ve-insp-btn" id="ve-cg-wheels-reset">' + _icon('rotate-ccw', 12) + ' Reset wheels</button>';
    return h;
  }

  function _cgLut(cg) {
    var lib = (window.VEAdvancedFeatures && VEAdvancedFeatures.LUT_LIBRARY) || null;
    var ids = lib ? Object.keys(lib) : _CG_LUT_FALLBACK;
    var lbl = function (id) { return lib && lib[id] && lib[id].name ? lib[id].name : _cgLutLabel(id); };
    var cur = cg._customLUT ? '__custom' : (cg.lutId || '');
    var grid = '<div class="ve-cg-lutgrid">' +
      '<button class="ve-cg-lutcard' + (!cur ? ' active' : '') + '" data-lut="">None</button>';
    ids.forEach(function (id) { grid += '<button class="ve-cg-lutcard' + (cur === id ? ' active' : '') + '" data-lut="' + id + '">' + _esc(lbl(id)) + '</button>'; });
    grid += (cur === '__custom' ? '<button class="ve-cg-lutcard active" data-lut="__custom">Custom .cube</button>' : '') + '</div>';
    var it = cg.lutIntensity != null ? Math.round(cg.lutIntensity * 100) : 100;
    return grid +
      '<button class="ve-insp-btn" id="ve-cg-lut-import">' + _icon('upload', 12) + ' Import .cube</button>' +
      '<input type="file" id="ve-cg-lut-file" accept=".cube,.CUBE" style="display:none">' +
      _filterSlider('Intensity', 've-cg-lut-int', it, 0, 100, '%');
  }

  // ── HSV→RGB (h,s,v 0..1) → [0-255] ──
  function _cgHsv2rgb(h, s, v) {
    var i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s), r, g, b;
    switch (i % 6) { case 0: r=v;g=t;b=p;break; case 1: r=q;g=v;b=p;break; case 2: r=p;g=v;b=t;break; case 3: r=p;g=q;b=v;break; case 4: r=t;g=p;b=v;break; default: r=v;g=p;b=q; }
    return [Math.round(r*255), Math.round(g*255), Math.round(b*255)];
  }

  function _cgRerenderBody(clip, root) {
    var R = root || document;
    var body = R.querySelector('#ve-cg-body');
    if (!body) return;
    body.innerHTML = _cgTabBody(_cgObj(clip));
    _cgBindBody(clip, R);
  }

  function _bindCg(clip, root) {
    _ensureCG(clip);
    var R = root || document;
    /* Re-render THIS panel only. The CG section exists in up to three places at once (docked
       inspector, floating inspector, the modal), all sharing ids like #ve-cg-body. A modal reset or
       target switch used to call renderInto(dock), so the modal never updated. */
    function _cgReRenderPanel() {
      if (R !== document && R.classList && R.classList.contains('ve-cgm')) {
        var b = R.querySelector('.ve-cgm-body');
        if (b) { b.innerHTML = _cgSection(clip); _bindCg(clip, R); }
      } else {
        renderInto(_dockHost, _currentClipId);
      }
    }
    // The grade being edited is whatever the SHARED target says (clip, or the selected power
    // window). Reading clip.colorGrading directly here would grade the whole clip while the header
    // said "Kare 1".
    var cg = _cgObj(clip);
    var on = R.querySelector('#ve-cg-on');
    if (on) on.addEventListener('change', function () { cg.enabled = on.checked; _changed(); _cgDrawScope(clip, R); });
    var ba = R.querySelector('#ve-cg-ba');
    if (ba) ba.addEventListener('click', function () { cg._bypass = !cg._bypass; ba.classList.toggle('active', cg._bypass); _changed(); _cgDrawScope(clip, R); });
    var rst = R.querySelector('#ve-cg-reset');
    if (rst) rst.addEventListener('click', function () {
      var en = cg.enabled;
      if (VE_NS() && VE_NS()._veSetGradeObj) VE_NS()._veSetGradeObj(clip, { enabled: en, preset: 'none' });
      else clip.colorGrading = { enabled: en, preset: 'none' };
      _ensureCG(clip);
      _cgReRenderPanel();
    });
    _bindSlider('ve-cg-opacity', '%', function (v) { cg.opacity = v; _changed(); }, R);

    // Target chips: the SAME shared state the LUT Browser writes, so switching here switches there.
    var tgts = R.querySelectorAll('.ve-cg-chip');
    for (var ti = 0; ti < tgts.length; ti++) {
      tgts[ti].addEventListener('click', function () {
        var VE = VE_NS();
        if (VE) VE._veGradeTarget = this.getAttribute('data-cgtgt');
        // Every control is bound to the OLD grade object, so repaint THIS panel to rebind them,
        // then keep the other surfaces in sync with the shared target.
        _cgReRenderPanel();
        var lb = document.getElementById('ve-lut-browser');
        if (lb && VE && VE._veShowLutBrowser) { lb.remove(); VE._veShowLutBrowser(); }
        if (window.VEColorTools && VEColorTools.isOpen()) VEColorTools.refresh();
      });
    }

    var tabs = R.querySelectorAll('.ve-cg-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () {
        _cgTab = this.getAttribute('data-cgtab');
        var all = R.querySelectorAll('.ve-cg-tab');
        for (var j = 0; j < all.length; j++) all[j].classList.toggle('active', all[j].getAttribute('data-cgtab') === _cgTab);
        _cgRerenderBody(clip, R);
      });
    }
    _cgBindBody(clip, R);
    _cgDrawScope(clip, R);
  }

  function _cgBindBody(clip, root) {
    var R = root || document;
    // Every tab binds through the shared target, not the clip: half-converted would mean the
    // Curves tab edits a window while the Basic tab edits the clip.
    var cg = _cgObj(clip);
    if (_cgTab === 'basic') {
      var pr = R.querySelector('#ve-cg-preset');
      if (pr) pr.addEventListener('change', function () { cg.preset = pr.value; cg.enabled = true; var o = R.querySelector('#ve-cg-on'); if (o) o.checked = true; _changed(); _cgDrawScope(clip, R); });
      _bindSlider('ve-cg-inb', '', function (v) { cg.levels.inBlack = v; _changed(); _cgDrawScope(clip, R); }, R);
      _bindSlider('ve-cg-inw', '', function (v) { cg.levels.inWhite = v; _changed(); _cgDrawScope(clip, R); }, R);
      _bindSlider('ve-cg-gamma', '%', function (v) { cg.levels.gamma = v / 100; _changed(); _cgDrawScope(clip, R); }, R);
      _bindSlider('ve-cg-outb', '', function (v) { cg.levels.outBlack = v; _changed(); _cgDrawScope(clip, R); }, R);
      _bindSlider('ve-cg-outw', '', function (v) { cg.levels.outWhite = v; _changed(); _cgDrawScope(clip, R); }, R);
      _bindSlider('ve-cg-temp', '', function (v) { cg.wb.temp = v; _changed(); _cgDrawScope(clip, R); }, R);
      _bindSlider('ve-cg-tint', '', function (v) { cg.wb.tint = v; _changed(); _cgDrawScope(clip, R); }, R);
      _bindSlider('ve-cg-sat', '%', function (v) { cg.sat.saturation = v; _changed(); _cgDrawScope(clip, R); }, R);
      _bindSlider('ve-cg-vib', '', function (v) { cg.sat.vibrance = v; _changed(); _cgDrawScope(clip, R); }, R);
      var cgAdvBtn = R.querySelector('#ve-cg-advtoggle'), cgAdvBox = R.querySelector('#ve-cg-adv');
      if (cgAdvBtn && cgAdvBox) cgAdvBtn.addEventListener('click', function () {
        var open = cgAdvBox.style.display === 'none';
        cgAdvBox.style.display = open ? '' : 'none';
        cgAdvBtn.classList.toggle('open', open);
      });
    } else if (_cgTab === 'curves') {
      var chb = R.querySelectorAll('.ve-cg-ch');
      for (var i = 0; i < chb.length; i++) chb[i].addEventListener('click', function () {
        _cgCurveCh = this.getAttribute('data-cgch');
        var all = R.querySelectorAll('.ve-cg-ch');
        for (var j = 0; j < all.length; j++) all[j].classList.toggle('active', all[j].getAttribute('data-cgch') === _cgCurveCh);
        _cgDrawCurve(clip, R);
      });
      _cgWireCurve(clip, R);
      var cr = R.querySelector('#ve-cg-curve-reset');
      if (cr) cr.addEventListener('click', function () { delete cg.curves[_cgCurveCh]; _cgDrawCurve(clip, R); _changed(); _cgDrawScope(clip, R); });
      _cgDrawCurve(clip, R);
    } else if (_cgTab === 'wheels') {
      var pads = R.querySelectorAll('.ve-cg-pad');
      for (var k = 0; k < pads.length; k++) { _cgWireWheel(clip, pads[k], R); _cgDrawWheel(clip, pads[k]); }
      var wr = R.querySelector('#ve-cg-wheels-reset');
      if (wr) wr.addEventListener('click', function () {
        cg.wheels = { shadows: {r:0,g:0,b:0}, midtones: {r:0,g:0,b:0}, highlights: {r:0,g:0,b:0} };
        var p2 = R.querySelectorAll('.ve-cg-pad'); for (var q = 0; q < p2.length; q++) _cgDrawWheel(clip, p2[q]);
        _changed(); _cgDrawScope(clip, R);
      });
    } else if (_cgTab === 'lut') {
      var cards = R.querySelectorAll('.ve-cg-lutcard');
      for (var m = 0; m < cards.length; m++) cards[m].addEventListener('click', function () {
        var id = this.getAttribute('data-lut');
        if (id === '__custom') return;
        cg.lutId = id || null; if (!id) cg._customLUT = null;
        var all = R.querySelectorAll('.ve-cg-lutcard');
        for (var n = 0; n < all.length; n++) all[n].classList.toggle('active', all[n].getAttribute('data-lut') === (id || ''));
        cg.enabled = true; var o = R.querySelector('#ve-cg-on'); if (o) o.checked = true;
        _changed(); _cgDrawScope(clip, R);
      });
      _bindSlider('ve-cg-lut-int', '%', function (v) { cg.lutIntensity = v / 100; _changed(); _cgDrawScope(clip, R); }, R);
      var imp = R.querySelector('#ve-cg-lut-import'), file = R.querySelector('#ve-cg-lut-file');
      if (imp && file) {
        imp.addEventListener('click', function () { file.click(); });
        file.addEventListener('change', function () {
          var f = file.files && file.files[0]; if (!f) return;
          var rd = new FileReader();
          rd.onload = function () {
            try {
              if (window.VEAdvancedFeatures && VEAdvancedFeatures.parseCubeFile) {
                cg._customLUT = VEAdvancedFeatures.parseCubeFile(rd.result);
                cg.lutId = null; cg.enabled = true; _changed(); _cgRerenderBody(clip, R); _cgDrawScope(clip, R);
              }
            } catch (e) { if (typeof showToast === 'function') showToast('Failed to read LUT', 'error'); }
          };
          rd.readAsText(f);
        });
      }
    }
    /* Wire the slider FILL (--p) inside THIS root, not the dock. Hard-coding #ve-insp-dock here left
       the CG modal's (and the floating inspector's) range inputs with the CSS default --p:50%: the
       native thumb sat at the true value while the gold fill stayed frozen mid-track - the owner's
       "dot noktaları bambaşka yerlerde" screenshot. R is the same root every other query in this
       function already uses. */
    if (typeof _wireDockSliders === 'function') _wireDockSliders(R);
  }

  // ── Scope (RGB histogram of the current graded preview frame) ──
  var _cgScopeCv = null, _cgScopeCtx = null;
  function _cgScopeTmp(w, h) {
    if (!_cgScopeCv) { _cgScopeCv = document.createElement('canvas'); _cgScopeCtx = _cgScopeCv.getContext('2d', { willReadFrequently: true }); }
    if (_cgScopeCv.width !== w || _cgScopeCv.height !== h) { _cgScopeCv.width = w; _cgScopeCv.height = h; }
    return _cgScopeCtx;
  }
  function _cgDrawScope(clip, root) {
    var cv = (root || document).querySelector('#ve-cg-scope'); if (!cv) return;
    var ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.03)'; ctx.fillRect(0, 0, W, H);
    var src = null;
    try { var VE = window.__ccVideoEditor; if (VE && VE._veUi && VE._veUi.previewCanvas && VE._veUi.previewCanvas.width) src = VE._veUi.previewCanvas; } catch (e) {}
    if (!src) return;
    /* The old render sampled 120px wide (~8k px into 256 bins = ~30/bin), so single-bin spikes drew
       as scattered "dots in the wrong places" (owner's exact complaint), and bins 0/255 - dominated
       by the letterbox's pure black and clipped white, which say nothing about the footage - drew as
       giant clamped spikes. Denser sample + box smoothing + skip 0/255 + filled-area drawing reads
       like a real histogram instead of confetti. */
    var sw = 240, sh = Math.max(1, Math.round(sw * src.height / src.width));
    var tmp = _cgScopeTmp(sw, sh); var data;
    try { tmp.clearRect(0, 0, sw, sh); tmp.drawImage(src, 0, 0, sw, sh); data = tmp.getImageData(0, 0, sw, sh).data; } catch (e) { return; }
    var hR = new Uint32Array(256), hG = new Uint32Array(256), hB = new Uint32Array(256);
    for (var i = 0; i < data.length; i += 4) { hR[data[i]]++; hG[data[i+1]]++; hB[data[i+2]]++; }
    function _smooth(hh) {
      var out = new Float32Array(256);
      for (var b = 1; b < 255; b++) {
        var s = 0, n = 0;
        for (var k = -2; k <= 2; k++) { var j = b + k; if (j >= 1 && j <= 254) { s += hh[j]; n++; } }
        out[b] = s / n;
      }
      return out;
    }
    var sR = _smooth(hR), sG = _smooth(hG), sB = _smooth(hB), mx = 1;
    for (var b2 = 1; b2 < 255; b2++) { if (sR[b2] > mx) mx = sR[b2]; if (sG[b2] > mx) mx = sG[b2]; if (sB[b2] > mx) mx = sB[b2]; }
    // Degenerate frame (everything in the skipped 0/255 bins, e.g. pure black): normalizing to a
    // noise-floor max would light the whole scope. Below a real signal floor, show it empty.
    if (mx < Math.max(4, (sw * sh) * 0.0005)) return;
    ctx.globalCompositeOperation = 'lighter';
    var chans = [['rgba(255,70,70,', sR], ['rgba(70,235,120,', sG], ['rgba(90,150,255,', sB]];
    for (var c = 0; c < chans.length; c++) {
      var col = chans[c][0], hh2 = chans[c][1];
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (var x = 1; x < 255; x++) ctx.lineTo((x / 255) * W, H - Math.min(H, (hh2[x] / mx) * (H - 2)));
      ctx.lineTo(W, H); ctx.closePath();
      ctx.fillStyle = col + '.30)'; ctx.fill();
      ctx.strokeStyle = col + '.85)'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ── Curves editor ──
  function _cgCurvePts(cg) { var p = cg.curves && cg.curves[_cgCurveCh]; if (!p || p.length < 2) return [{ x: 0, y: 0 }, { x: 255, y: 255 }]; return p; }
  function _cgDrawCurve(clip, root) {
    var cv = (root || document).querySelector('#ve-cg-curve'); if (!cv) return;
    var ctx = cv.getContext('2d'), W = cv.width, H = cv.height, P = 12;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.02)'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g++) { var gx = P + (g / 4) * (W - 2 * P), gy = P + (g / 4) * (H - 2 * P); ctx.beginPath(); ctx.moveTo(gx, P); ctx.lineTo(gx, H - P); ctx.stroke(); ctx.beginPath(); ctx.moveTo(P, gy); ctx.lineTo(W - P, gy); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(P, H - P); ctx.lineTo(W - P, P); ctx.stroke(); ctx.setLineDash([]);
    var pts = _cgCurvePts(_cgObj(clip)).slice().sort(function (a, b) { return a.x - b.x; });
    function sx(x) { return P + (x / 255) * (W - 2 * P); } function sy(y) { return (H - P) - (y / 255) * (H - 2 * P); }
    var lut = VEColorGrading.buildLUT(pts);
    var col = _cgCurveCh === 'r' ? '#ff5a5a' : _cgCurveCh === 'g' ? '#5aff8c' : _cgCurveCh === 'b' ? '#5a9cff' : '#f2ff58';
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath();
    for (var x = 0; x <= 255; x += 2) { var X = sx(x), Y = sy(lut[x]); if (x === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); } ctx.stroke();
    for (var i = 0; i < pts.length; i++) { ctx.fillStyle = col; ctx.strokeStyle = '#0a0a0c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx(pts[i].x), sy(pts[i].y), 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  }
  function _cgWireCurve(clip, root) {
    var cv = (root || document).querySelector('#ve-cg-curve'); if (!cv || cv._cgWired) return; cv._cgWired = true;
    var W = cv.width, H = cv.height, P = 12, drag = -1;
    function toData(e) { var r = cv.getBoundingClientRect(); var mx = (e.clientX - r.left) * (W / r.width), my = (e.clientY - r.top) * (H / r.height); return { x: Math.max(0, Math.min(255, Math.round(((mx - P) / (W - 2 * P)) * 255))), y: Math.max(0, Math.min(255, Math.round((1 - ((my - P) / (H - 2 * P))) * 255))) }; }
    function arr() { var cg = _cgObj(clip); if (!cg.curves[_cgCurveCh] || cg.curves[_cgCurveCh].length < 2) cg.curves[_cgCurveCh] = [{ x: 0, y: 0 }, { x: 255, y: 255 }]; cg.curves[_cgCurveCh].sort(function (a, b) { return a.x - b.x; }); return cg.curves[_cgCurveCh]; }
    function nearest(d) { var a = arr(), bi = -1, bd = 1e9; for (var i = 0; i < a.length; i++) { var dx = a[i].x - d.x, dy = a[i].y - d.y, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; bi = i; } } return bd < 500 ? bi : -1; }
    cv.addEventListener('pointerdown', function (e) { var d = toData(e); var a = arr(); var idx = nearest(d); if (idx < 0) { a.push({ x: d.x, y: d.y }); a.sort(function (p, q) { return p.x - q.x; }); for (var i = 0; i < a.length; i++) if (a[i].x === d.x && a[i].y === d.y) { idx = i; break; } } drag = idx; try { cv.setPointerCapture(e.pointerId); } catch (er) {} _cgDrawCurve(clip, root); e.preventDefault(); });
    cv.addEventListener('pointermove', function (e) { if (drag < 0) return; var a = arr(); var d = toData(e); if (drag === 0 || drag === a.length - 1) { a[drag].y = d.y; } else { var lo = a[drag - 1].x + 1, hi = a[drag + 1].x - 1; a[drag].x = Math.max(lo, Math.min(hi, d.x)); a[drag].y = d.y; } _cgDrawCurve(clip, root); _changed(); });
    cv.addEventListener('pointerup', function () { if (drag >= 0) { drag = -1; _cgDrawScope(clip, root); } });
    cv.addEventListener('dblclick', function (e) { var a = arr(); var idx = nearest(toData(e)); if (idx > 0 && idx < a.length - 1) { a.splice(idx, 1); _cgDrawCurve(clip, root); _changed(); _cgDrawScope(clip, root); } });
  }

  // ── Color wheels (3-way) ──
  function _cgDrawWheel(clip, pad) {
    var ctx = pad.getContext('2d'), W = pad.width, H = pad.height, cx = W / 2, cy = H / 2, R = W / 2 - 8;
    ctx.clearRect(0, 0, W, H);
    for (var a = 0; a < 360; a += 4) {
      var a0 = a * Math.PI / 180, a1 = (a + 5) * Math.PI / 180, rgb = _cgHsv2rgb(a / 360, 1, 1);
      var grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      grd.addColorStop(0, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0)');
      grd.addColorStop(1, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',.85)');
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a1); ctx.closePath(); ctx.fillStyle = grd; ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    var w = _cgObj(clip).wheels[pad.getAttribute('data-cgzone')]; var nx = w.nx || 0, ny = w.ny || 0;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0a0a0c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx + nx * R, cy + ny * R, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  function _cgWireWheel(clip, pad, root) {
    if (pad._cgWired) return; pad._cgWired = true;
    var W = pad.width, H = pad.height, cx = W / 2, cy = H / 2, R = W / 2 - 8, zone = pad.getAttribute('data-cgzone'), dragging = false;
    function set(e) {
      var r = pad.getBoundingClientRect();
      var mx = (e.clientX - r.left) * (W / r.width) - cx, my = (e.clientY - r.top) * (H / r.height) - cy;
      var rad = Math.min(1, Math.sqrt(mx * mx + my * my) / R), ang = Math.atan2(my, mx), hue = ((ang * 180 / Math.PI) + 360) % 360;
      var rgb = _cgHsv2rgb(hue / 360, 1, 1), maxOff = 55, w = _cgObj(clip).wheels[zone];
      w.nx = mx / R; w.ny = my / R;
      w.r = ((rgb[0] - 128) / 128) * rad * maxOff; w.g = ((rgb[1] - 128) / 128) * rad * maxOff; w.b = ((rgb[2] - 128) / 128) * rad * maxOff;
      _cgDrawWheel(clip, pad); _changed();
    }
    pad.addEventListener('pointerdown', function (e) { dragging = true; try { pad.setPointerCapture(e.pointerId); } catch (er) {} set(e); e.preventDefault(); });
    pad.addEventListener('pointermove', function (e) { if (dragging) set(e); });
    pad.addEventListener('pointerup', function () { if (dragging) { dragging = false; _cgDrawScope(clip, root); } });
    pad.addEventListener('dblclick', function () { var w = _cgObj(clip).wheels[zone]; w.r = w.g = w.b = 0; w.nx = 0; w.ny = 0; _cgDrawWheel(clip, pad); _changed(); _cgDrawScope(clip, root); });
  }

  function _bindSlider(id, unit, fn, root) {
    var R = root || document;
    var el = R.querySelector('#' + id);
    var valEl = R.querySelector('#' + id + '-val');
    if (el) {
      el.addEventListener('input', function() {
        var v = parseFloat(el.value) || 0;
        if (valEl) valEl.textContent = v + unit;
        fn(v);
      });
    }
  }

  // ── Setters ──
  function _setTransform(clip, prop, val) {
    if (!clip.transform) clip.transform = { x: 0, y: 0, scale: 1, rotation: 0, flipH: false, flipV: false };
    clip.transform[prop] = val;
    _changed();
  }

  function _setFilter(clip, prop, val) {
    if (!clip.filters) clip.filters = {};
    clip.filters[prop] = val;
    clip.filters._preset = null;   // manual tweak → no preset is "active" anymore
    _changed();
  }

  function _getMediaEl(clipId) {
    if (window.VideoEditor && VideoEditor.getMediaElement) {
      return VideoEditor.getMediaElement(clipId);
    }
    return null;
  }

  var _undoPushTimer = null;
  function _changed() {
    // Recompute the project's total duration first — Start / Trim edits move a clip's end, and
    // without this the timeline keeps the OLD total, so playback stops at the previous end point
    // (owner bug: moving Start 3s→4s on a 3s clip still cut off at 6s instead of 7s).
    var _VE = window.__ccVideoEditor;
    if (_VE && _VE._veRecalcDuration) _VE._veRecalcDuration();
    if (window.VideoEditor) {
      if (VideoEditor.render) VideoEditor.render();
      // Also force preview canvas re-render so filter/speed/transition changes are visible
      if (VideoEditor.seek && VideoEditor.getProject) {
        var proj = VideoEditor.getProject();
        if (proj) VideoEditor.seek(proj.playheadTime);
      }
    }
    // Commit inspector edits to the undo stack (debounced: one snapshot per
    // control gesture, sliders fire per input tick). The stack holds post-edit
    // snapshots; without this push the newest snapshot predates ALL inspector
    // work, so the first Ctrl+Z jumped to the state before the clip existed.
    if (_undoPushTimer) clearTimeout(_undoPushTimer);
    _undoPushTimer = setTimeout(function () {
      _undoPushTimer = null;
      var VE = window.__ccVideoEditor;
      if (VE && VE._vePushUndo) VE._vePushUndo('inspector edit');
    }, 400);
  }

  // ── Public API ──
  function show(clipId) {
    _ensurePanel();
    _currentClipId = clipId;
    _visible = true;
    _panel.classList.add('ve-inspector--open');
    _render(clipId);
  }
    // ── Speed ramp mini-graph ──
  function _drawSpeedGraph(clip) {
    var canvas = document.getElementById('ve-insp-speed-graph');
    if (!canvas || !window.VEKeyframes) return;
    if (!VEKeyframes.hasKeyframes(clip, 'speed')) return;

    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(0, 0, w, h);

    // 1x baseline
    var maxSpeed = 8;
    var baselineY = h - (1 / maxSpeed) * h;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, baselineY);
    ctx.lineTo(w, baselineY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Speed curve
    ctx.strokeStyle = '#f2ff58';
    ctx.lineWidth = 2;
    ctx.beginPath();
    var dur = clip.duration || 1;
    for (var i = 0; i <= w; i++) {
      var localT = (i / w) * dur;
      var spd = VEKeyframes.evaluate(clip, 'speed', localT);
      var y = h - (Math.min(spd, maxSpeed) / maxSpeed) * h;
      if (i === 0) ctx.moveTo(i, y);
      else ctx.lineTo(i, y);
    }
    ctx.stroke();

    // Label
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '9px sans-serif';
    ctx.fillText('1x', 2, baselineY - 2);
  }

  function hide() {
    if (_panel) {
      _panel.classList.remove('ve-inspector--open');
    }
    _visible = false;
    _currentClipId = null;
  }

  function toggle(clipId) {
    if (_visible && _currentClipId === clipId) {
      hide();
    } else {
      show(clipId);
    }
  }

  function update() {
    if (_docked && _dockHost && _currentClipId) {
      var w = document.getElementById('ve-insp-dock');
      if (w) _render(_currentClipId, w);
      return;
    }
    if (_visible && _currentClipId) {
      _render(_currentClipId);
    }
  }

  function isOpen() {
    return _visible;
  }

  // ── Docked (right-panel) mode ──
  var _dockHidden = null;
  function _hideDockSiblings(host, wrap) {
    if (_dockHidden) return;
    _dockHidden = [];
    Array.prototype.forEach.call(host.children, function (c) {
      if (c === wrap) return;
      _dockHidden.push({ el: c, disp: c.style.display || '' });
      c.style.display = 'none';
    });
    var emp = document.getElementById('rp-empty');
    if (emp && emp.parentNode !== host) { _dockHidden.push({ el: emp, disp: emp.style.display || '' }); emp.style.display = 'none'; }
  }
  function _restoreDockSiblings() {
    if (!_dockHidden) return;
    _dockHidden.forEach(function (r) { if (r.el) r.el.style.display = r.disp; });
    _dockHidden = null;
  }
  // Set --p (fill %) on every inspector range so the custom volt-filled track renders correctly
  // in Chrome (webkit has no native ::-moz-range-progress). One delegated listener keeps it live.
  function _wireDockSliders(host) {
    if (!host) return;
    var upd = function (r) {
      var min = parseFloat(r.min); if (isNaN(min)) min = 0;
      var max = parseFloat(r.max); if (isNaN(max)) max = 100;
      var val = parseFloat(r.value); if (isNaN(val)) val = min;
      var p = (max > min) ? ((val - min) / (max - min) * 100) : 50;
      r.style.setProperty('--p', p + '%');
    };
    var ranges = host.querySelectorAll('input[type="range"]');
    for (var i = 0; i < ranges.length; i++) upd(ranges[i]);
    if (!host._veSliderWired) {
      host._veSliderWired = true;
      host.addEventListener('input', function (e) { if (e.target && e.target.type === 'range') upd(e.target); });
    }
  }

  function _ensureDockWrap(host) {
    var wrap = document.getElementById('ve-insp-dock');
    if (!wrap || wrap.parentNode !== host) {
      if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
      wrap = document.createElement('div'); wrap.id = 've-insp-dock'; wrap.className = 've-insp-dock';
      host.insertBefore(wrap, host.firstChild);
    }
    return wrap;
  }

  /* THE DOCK IS ONE SHELL AND IT MAY HOLD BORROWED NODES.
     A non-clip item kind (overlay object, subtitle) builds its Basic/Color tab by MOVING the real
     shared panel blocks (#rp-text, #rp-uni-fill, ...) into this wrap rather than cloning them - a
     clone kills the native handlers (see kb/editor/context.md §10). So every path that is about to
     replace `wrap.innerHTML` must first let the borrower take its nodes home, or the write DELETES
     them from the document and the control is gone from every object type for the rest of the
     session. That is the §4g failure, one innerHTML further along. */
  var _dockReleaseHooks = [];
  function onDockRelease(fn) { if (typeof fn === 'function' && _dockReleaseHooks.indexOf(fn) < 0) _dockReleaseHooks.push(fn); }
  function _fireDockRelease() {
    for (var i = 0; i < _dockReleaseHooks.length; i++) {
      try { _dockReleaseHooks[i](); } catch (e) { if (window.console) console.warn('[ve-inspector] dock release hook failed', e); }
    }
  }

  function renderInto(host, clipId) {
    if (!host || !_findClip(clipId)) return;
    _fireDockRelease();
    _docked = true; _dockHost = host; _currentClipId = clipId; _visible = true;
    _dockKey = 'clip'; if (_dockTabMem[_dockKey]) _dockTab = _dockTabMem[_dockKey];
    _dockRerender = function () { renderInto(host, clipId); };
    if (_panel) _panel.innerHTML = ''; // avoid duplicate ids with the floating panel
    var wrap = _ensureDockWrap(host);
    _hideDockSiblings(host, wrap);
    wrap.style.display = '';
    _render(clipId, wrap);
    _wireDockSliders(wrap);
  }

  /* Generic docked render for any OTHER timeline item (overlay object, subtitle cue, ...).
     Same shell, same section markup, same pill bar - only the sections differ, which is what keeps
     one docked properties panel in the product instead of three that drift. `_currentClipId` and
     `_visible` are deliberately NOT set: they address the MEDIA inspector, and setting them would
     let an unrelated caller (advanced-panels, update()) re-render a media clip over this panel. */
  function dockRender(host, opts) {
    if (!host || !opts) return null;
    _fireDockRelease();
    _docked = true; _dockHost = host;
    _dockKey = opts.key || 'item';
    _dockTab = _dockTabMem[_dockKey] || (opts.tabs && opts.tabs.length ? opts.tabs[0][0] : 'temel');
    _dockRerender = (typeof opts.rerender === 'function') ? opts.rerender : null;
    if (_panel) _panel.innerHTML = '';
    var wrap = _ensureDockWrap(host);
    _hideDockSiblings(host, wrap);
    wrap.style.display = '';
    wrap.innerHTML = opts.html || '';
    if (typeof opts.onBound === 'function') opts.onBound(wrap);
    _bindAccordions(wrap);
    _applyDockTabs(wrap, { tabs: opts.tabs, effects: false });
    _wireDockSliders(wrap);
    return wrap;
  }

  function hideDocked() {
    if (!_docked && !document.getElementById('ve-insp-dock')) return;
    _fireDockRelease();
    var wrap = document.getElementById('ve-insp-dock');
    if (wrap) { wrap.innerHTML = ''; wrap.style.display = 'none'; }
    _restoreDockSiblings();
    _docked = false; _dockHost = null; _dockRerender = null;
    if (_visible && !_panel) { _visible = false; _currentClipId = null; }
  }
  function isDocked() { return _docked; }

  // ── Expose ──
  /* THE COLOUR GRADING MODAL (owner 2026-07-17: "bu pencereye lut ver altına bu pencereye color
     grading de, onun için özel modal yap").

     Grading a window is a canvas activity: you are looking at the picture, not at a properties tab.
     So the full grading panel comes to the picture, floating and draggable, next to the LUT Browser.

     It reuses `_cgSection` + `_bindCg` EXACTLY, so this is the same panel with the same bindings
     writing through the same shared target. A second grading UI would be a second set of bugs, and
     the ids inside are unique per document, so the dock is closed first rather than letting two
     copies of #ve-cg-on fight over the same grade. */
  var _cgModal = null;

  function showCgModal(clipId) {
    var clip = _findClip(clipId || _currentClipId);
    if (!clip) { if (typeof showToast === 'function') showToast('Select a clip first', 'error'); return false; }
    if (_cgModal) { closeCgModal(); return false; }
    // Two live copies of the section would duplicate every id (#ve-cg-on, the curve canvas, the
    // wheels) and getElementById would bind the modal's controls to the dock's DOM.
    var hadDock = !!document.getElementById('ve-insp-dock');
    if (hadDock) hideDocked();

    _cgModal = document.createElement('div');
    _cgModal.id = 've-cg-modal';
    _cgModal.className = 've-cgm';
    _cgModal.innerHTML =
      '<div class="ve-cgm-head">' +
        '<span class="ve-cgm-title">' + _icon('palette', 13) + ' Color Grading</span>' +
        '<button class="ve-cgm-x" id="ve-cgm-pop" title="Open in separate window">' + _icon('external-link', 13) + '</button>' +
        '<button class="ve-cgm-x" id="ve-cgm-close" title="Close">' + _icon('x', 13) + '</button>' +
      '</div>' +
      '<div class="ve-cgm-body">' + _cgSection(clip) + '</div>';
    document.body.appendChild(_cgModal);
    if (!(window.VEFloat && window.VEFloat.restorePos(_cgModal, 'cgmodal'))) {
      _cgModal.style.left = '90px';
      _cgModal.style.top = '90px';
    }
    var hd = _cgModal.querySelector('.ve-cgm-head');
    if (window.VEFloat && hd && !VEFloat.isPopped(_cgModal)) window.VEFloat.drag(_cgModal, hd, 'cgmodal');
    _currentClipId = clip.id;
    _bindCg(clip, _cgModal);   // scope every query to the modal, not the inspector's duplicate ids
    var x = _cgModal.querySelector('#ve-cgm-close');
    if (x) x.addEventListener('click', function () { closeCgModal(); });
    var pop = _cgModal.querySelector('#ve-cgm-pop');
    if (pop) pop.addEventListener('click', function () {
      if (!window.VEFloat) return;
      if (VEFloat.isPopped(_cgModal)) { VEFloat.popIn(_cgModal); pop.innerHTML = _icon('external-link', 13); pop.title = 'Open in separate window'; }
      else { VEFloat.popOut(_cgModal, 'Color Grading'); pop.innerHTML = _icon('minimize-2', 13); pop.title = 'Undo'; }
    });
    return true;
  }

  function closeCgModal() {
    if (!_cgModal) return false;
    if (window.VEFloat && VEFloat.isPopped(_cgModal)) VEFloat.popIn(_cgModal);
    _cgModal.remove();
    _cgModal = null;
    return true;
  }

  function isCgModalOpen() { return !!_cgModal; }

  window.VEInspector = {
    show: show,
    hide: hide,
    toggle: toggle,
    update: update,
    isOpen: isOpen,
    renderInto: renderInto,
    dockRender: dockRender,
    onDockRelease: onDockRelease,
    hideDocked: hideDocked,
    isDocked: isDocked,
    /* The section markup + the transition/blend pickers are shared with the other item kinds, so
       they are lent out rather than re-typed there: one accordion shape, one transition card grid,
       one slider row in the whole docked panel. */
    ui: {
      accOpen: _accOpen,
      accClose: _accClose,
      slider: _filterSlider,
      icon: _icon,
      esc: _esc,
      fmt: _fmt,
      transCards: _transCards,
      durRow: _durRow,
      bindTransUI: _bindTransUI,
      bindSlider: _bindSlider,
      bindNum: _bindNum,
      bindInput: _bindInput,
      showAllTransitions: _showAllTransitions
    },
    showCgModal: showCgModal,
    closeCgModal: closeCgModal,
    isCgModalOpen: isCgModalOpen
  };
})();

// Modular skeleton hook (Faz 8) — ve-inspector is now a video loader module (modules/video/). Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-inspector', parent: 'video', title: 've-inspector', mount: function () {}, unmount: function () {} });
