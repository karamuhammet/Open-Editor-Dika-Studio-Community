/* Module: video/video-editor/render — TIMELINE RENDER — build the timeline HTML, ruler, track headers, clips, time display.
   Part of the video-editor group (decomposed from the 7695-line IIFE). Functions hang off the
   shared namespace VE (window.__ccVideoEditor, created by the parent); cross-module refs resolve
   through VE at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VE = window.__ccVideoEditor;
  if (!VE) return;

  VE._veBuildTimelineHTML = function () {
    var canvasArea = document.getElementById('canvas-area');
    if (!canvasArea) return;

    // Host container
    var host = document.createElement('div');
    host.id = 've-timeline-host';
    host.className = 've-timeline-host';
    host.style.display = 'none';
    host.hidden = true;
    host.setAttribute('aria-hidden', 'true');
    host.style.height = VE.DEFAULT_PANEL_HEIGHT + 'px';

    // ── Resize handle (top edge drag) ──
    var resizeHandle = document.createElement('div');
    resizeHandle.className = 've-resize-handle';
    host.appendChild(resizeHandle);
    VE._veUi.resizeHandle = resizeHandle;

    // ── Toolbar (Clideo-style: left=playback | center=time | right=tools) ──
    var toolbar = document.createElement('div');
    toolbar.className = 've-toolbar';
    toolbar.innerHTML =
      '<div class="ve-tb-left">' +
        '<button class="ve-tb-btn" id="ve-btn-split" title="Cut (S)">' + VE._veIcon('scissors') + '</button>' +
        '<button class="ve-tb-btn ve-razor-btn" id="ve-btn-razor" title="Razor Mode (C)">' + VE._veIcon('crop', 16) + '</button>' +
        '<button class="ve-tb-btn ve-edit-mode-btn" id="ve-btn-edit-mode" title="Edit Mode: Normal">' +
          '<span class="ve-edit-mode-label">N</span>' +
        '</button>' +
        '<button class="ve-tb-btn" id="ve-btn-snap" title="Toggle Snap (N)">' +
          '<span class="ve-snap-indicator" style="font-size:10px">Snap: ON</span>' +
        '</button>' +
        '<button class="ve-tb-btn" id="ve-btn-duplicate" title="Duplicate">' + VE._veIcon('copy') + '</button>' +
        '<button class="ve-tb-btn" id="ve-btn-bring-front" title="Bring Forward">' + VE._veIcon('chevron-up') + '</button>' +
        '<button class="ve-tb-btn" id="ve-btn-send-back" title="Send Backward">' + VE._veIcon('chevron-down') + '</button>' +
        '<button class="ve-tb-btn" id="ve-btn-delete" title="Delete (Del)">' + VE._veIcon('trash-2') + '</button>' +
      '</div>' +
      '<div class="ve-tb-center">' +
        '<button class="ve-tb-btn" id="ve-btn-seek-back" title="Seek -5s">' + VE._veIcon('rewind') + '</button>' +
        '<button class="ve-tb-btn" id="ve-btn-prev-frame" title="Previous Frame">' + VE._veIcon('skip-back') + '</button>' +
        '<button class="ve-tb-btn ve-tb-btn--play" id="ve-btn-play" title="Play/Pause (Space)">' + VE._veIcon('play') + '</button>' +
        '<button class="ve-tb-btn" id="ve-btn-next-frame" title="Next Frame">' + VE._veIcon('skip-forward') + '</button>' +
        '<button class="ve-tb-btn" id="ve-btn-seek-fwd" title="Seek +5s">' + VE._veIcon('fast-forward') + '</button>' +
        '<span class="ve-time-display"><span id="ve-time-current">0:00.00</span> / <span id="ve-time-total">0:00.00</span></span>' +
        '<button class="ve-tb-btn" id="ve-btn-loop" title="Toggle Loop">' + VE._veIcon('repeat') + '</button>' +
        '<select class="ve-rate-select" id="ve-rate-select" title="Playback Speed">' +
          '<option value="0.25">0.25x</option>' +
          '<option value="0.5">0.5x</option>' +
          '<option value="0.75">0.75x</option>' +
          '<option value="1" selected>1x</option>' +
          '<option value="1.5">1.5x</option>' +
          '<option value="2">2x</option>' +
          '<option value="3">3x</option>' +
        '</select>' +
        '<button class="ve-tb-btn" id="ve-btn-fullscreen" title="Fullscreen">' + VE._veIcon('maximize') + '</button>' +
        '<button class="ve-tb-btn" id="ve-btn-program-monitor" title="Open Program Monitor Window">' + VE._veIcon('external-link') + '</button>' +
        '<button class="ve-tb-btn" id="ve-btn-timeline-focus" title="Toggle Timeline Focus">' + VE._veIcon('panel-bottom') + '</button>' +
      '</div>' +
      '<div class="ve-tb-right">' +
        '<div class="ve-tools-dropdown">' +
          '<button class="ve-tb-btn ve-tools-trigger" id="ve-tools-trigger" title="Tools">' + VE._veIcon('settings', 14) + ' <span class="ve-tools-label">Tools</span> ' + VE._veIcon('chevron-down', 10) + '</button>' +
          '<div class="ve-tools-menu" id="ve-tools-menu">' +
            '<div class="ve-tools-section-label">Editing</div>' +
            '<button class="ve-tb-btn ve-tools-item" id="ve-btn-marker">' + VE._veIcon('flag', 14) + '<span>Add Marker</span><kbd>M</kbd></button>' +
            '<button class="ve-tb-btn ve-tools-item" id="ve-btn-speed-curve">' + VE._veIcon('activity', 14) + '<span>Speed Curve</span></button>' +
            '<button class="ve-tb-btn ve-tools-item" id="ve-btn-keyframe-editor">' + VE._veIcon('git-branch', 14) + '<span>Keyframe Graph</span><kbd>Shift+K</kbd></button>' +
            '<button class="ve-tb-btn ve-tools-item" id="ve-btn-adjustment-layer">' + VE._veIcon('layers', 14) + '<span>Adjustment Layer</span></button>' +
            '<button class="ve-tb-btn ve-tools-item" id="ve-btn-scene-detect">' + VE._veIcon('clapperboard', 14) + '<span>Scene Detection</span><kbd>Ctrl+Shift+J</kbd></button>' +
            '<button class="ve-tb-btn ve-tools-item" id="ve-btn-silence-cut">' + VE._veIcon('scissors', 14) + '<span>Cut Silences</span></button>' +
            '<button class="ve-tb-btn ve-tools-item" id="ve-btn-stabilize">' + VE._veIcon('shield', 14) + '<span>Stabilize</span><kbd>Ctrl+Shift+B</kbd></button>' +
            '<div class="ve-tools-section-label">Effects & Color</div>' +
            '<button class="ve-tb-btn ve-tools-item" id="ve-btn-effects">' + VE._veIcon('sliders', 14) + '<span>Effects & Filters</span></button>' +
            '<button class="ve-tb-btn ve-tools-item" id="ve-btn-effects-lib">' + VE._veIcon('sparkles', 14) + '<span>Effects Library</span></button>' +
            '<button class="ve-tb-btn ve-tools-item" id="ve-btn-transitions-browser">' + VE._veIcon('shuffle', 14) + '<span>Transitions</span></button>' +
            '<button class="ve-tb-btn ve-tools-item" id="ve-btn-lut-browser">' + VE._veIcon('palette', 14) + '<span>LUT Browser</span><kbd>Ctrl+Shift+L</kbd></button>' +
            '<button class="ve-tb-btn ve-tools-item" id="ve-btn-scopes">' + VE._veIcon('activity', 14) + '<span>Video Scopes</span><kbd>Ctrl+Shift+W</kbd></button>' +
            '<div class="ve-tools-section-label">Media & Audio</div>' +
            '<button class="ve-tb-btn ve-tools-item" id="ve-btn-media-browser">' + VE._veIcon('film', 14) + '<span>Media Browser</span></button>' +
            '<!-- Text Templates hidden - TODO: re-enable later -->' +
            '<button class="ve-tb-btn ve-tools-item" id="ve-btn-audio-mixer">' + VE._veIcon('music', 14) + '<span>Audio Mixer</span></button>' +
            '<button class="ve-tb-btn ve-tools-item" id="ve-btn-audio-fx">' + VE._veIcon('mic', 14) + '<span>Audio FX</span></button>' +
            '<button class="ve-tb-btn ve-tools-item" id="ve-btn-auto-subtitle">' + VE._veIcon('captions', 14) + '<span>Auto Subtitle (AI)</span></button>' +
            '<button class="ve-tb-btn ve-tools-item" id="ve-btn-dublaj">' + VE._veIcon('mic', 14) + '<span>Voiceover (AI)</span></button>' +
            '<button class="ve-tb-btn ve-tools-item" id="ve-btn-dublaj-video">' + VE._veIcon('globe', 14) + '<span>Dubbing (AI)</span></button>' +
            '<div class="ve-tools-section-label">Advanced</div>' +
            '<button class="ve-tb-btn ve-tools-item" id="ve-btn-recorder">' + VE._veIcon('camera', 14) + '<span>Camera Recording</span></button>' +
            '<button class="ve-tb-btn ve-tools-item" id="ve-btn-mc-create">' + VE._veIcon('video', 14) + '<span>Create Multi-Cam Source</span></button>' +
            '<button class="ve-tb-btn ve-tools-item" id="ve-btn-mc-monitor">' + VE._veIcon('monitor', 14) + '<span>Multi-Cam Monitor</span><kbd>Ctrl+Shift+M</kbd></button>' +
            '<button class="ve-tb-btn ve-tools-item" id="ve-btn-smartcam">' + VE._veIcon('crop', 14) + '<span>SmartCam (single shot, N cameras)</span><kbd>Ctrl+Shift+R</kbd></button>' +
            '<button class="ve-tb-btn ve-tools-item" id="ve-btn-color-tools">' + VE._veIcon('palette', 14) + '<span>Color Tools (power window)</span><kbd>Ctrl+Shift+W</kbd></button>' +
            '<button class="ve-tb-btn ve-tools-item" id="ve-btn-plugins">' + VE._veIcon('puzzle', 14) + '<span>Plugins</span><kbd>Ctrl+Shift+K</kbd></button>' +
          '</div>' +
        '</div>' +
        '<div class="ve-master-vol-wrap">' +
          '<button class="ve-tb-btn ve-master-vol-btn" id="ve-master-vol-btn" title="Master Volume">' + VE._veIcon('volume-2', 14) + '</button>' +
          '<div class="ve-master-vol-popup" id="ve-master-vol-popup">' +
            '<input type="range" class="ve-master-vol-slider" id="ve-master-vol" min="0" max="200" value="100" orient="vertical">' +
            '<span class="ve-master-vol-val" id="ve-master-vol-val">100%</span>' +
          '</div>' +
        '</div>' +
        '<button class="ve-tb-btn" id="ve-zoom-out" title="Zoom Out">' + VE._veIcon('zoom-out') + '</button>' +
        '<button class="ve-tb-btn" id="ve-zoom-fit" title="Fit Entire Project">' + VE._veIcon('scan') + '</button>' +
        '<button class="ve-tb-btn" id="ve-zoom-in" title="Zoom In">' + VE._veIcon('zoom-in') + '</button>' +
        '<button class="ve-tb-btn ve-follow-btn" id="ve-follow-playhead" title="Resume Playhead Follow">' + VE._veIcon('locate-fixed') + '</button>' +
        '<button class="ve-tb-btn ve-tb-btn-export" id="ve-btn-export" title="Export Video">' + VE._veIcon('download') + '</button>' +
      '</div>';
    host.appendChild(toolbar);
    VE._veUi.toolbar = toolbar;

    // ── Audio Waveform / Spectrum visualization ──
    var waveformBar = document.createElement('div');
    waveformBar.className = 've-waveform-bar';
    waveformBar.id = 've-waveform-bar';
    waveformBar.style.display = 'none';
    var wfCanvas = document.createElement('canvas');
    wfCanvas.id = 've-waveform-canvas';
    wfCanvas.className = 've-waveform-canvas';
    wfCanvas.width = 800;
    wfCanvas.height = 48;
    waveformBar.appendChild(wfCanvas);
    var wfToggle = document.createElement('button');
    wfToggle.className = 've-tb-btn ve-wf-mode-btn';
    wfToggle.title = 'Toggle spectrum/waveform';
    wfToggle.textContent = 'S';
    waveformBar.appendChild(wfToggle);
    host.appendChild(waveformBar);
    VE._veUi.waveformBar = waveformBar;
    VE._veUi.waveformCanvas = wfCanvas;
    VE._veUi.waveformCtx = wfCanvas.getContext('2d');
    VE._veUi.waveformMode = 'spectrum'; // 'spectrum' | 'waveform'
    wfToggle.addEventListener('click', function() {
      VE._veUi.waveformMode = VE._veUi.waveformMode === 'spectrum' ? 'waveform' : 'spectrum';
      wfToggle.textContent = VE._veUi.waveformMode === 'spectrum' ? 'S' : 'W';
    });

    // ── Timeline body (ruler + tracks scroll area) ──
    var body = document.createElement('div');
    body.className = 've-timeline-body';

    // Track headers column
    var headersCol = document.createElement('div');
    headersCol.className = 've-track-headers';
    headersCol.id = 've-track-headers';

    // Ruler + tracks scroll container
    var scrollWrap = document.createElement('div');
    scrollWrap.className = 've-scroll-wrap';
    scrollWrap.id = 've-scroll-wrap';

    // Content wrapper sized to the FULL ruler+tracks height. The playhead is
    // positioned against this (not the fixed-height viewport), so its line spans
    // every track and scrolls with the content instead of being cut off at the
    // last visible lane (owner: "4. trackte kesiliyor").
    var scrollContent = document.createElement('div');
    scrollContent.className = 've-scroll-content';
    scrollWrap.appendChild(scrollContent);

    var ruler = document.createElement('div');
    ruler.className = 've-ruler';
    ruler.id = 've-ruler';
    scrollContent.appendChild(ruler);
    VE._veUi.ruler = ruler;

    var tracksContainer = document.createElement('div');
    tracksContainer.className = 've-tracks';
    tracksContainer.id = 've-tracks';
    scrollContent.appendChild(tracksContainer);
    VE._veUi.tracksContainer = tracksContainer;

    // Playhead (spans ruler + tracks)
    var playhead = document.createElement('div');
    playhead.className = 've-playhead';
    playhead.id = 've-playhead';
    playhead.innerHTML = '<div class="ve-playhead-head"></div><div class="ve-playhead-line"></div>';
    scrollContent.appendChild(playhead);
    VE._veUi.playhead = playhead;

    body.appendChild(headersCol);
    body.appendChild(scrollWrap);
    host.appendChild(body);

    // Insert into DOM after page-tabs-bar
    var pageTabs = document.getElementById('page-tabs-bar');
    if (pageTabs) {
      canvasArea.insertBefore(host, pageTabs);
    } else {
      canvasArea.appendChild(host);
    }

    VE._veUi.host = host;
    VE._veUi.timeDisplay = document.getElementById('ve-time-current');
    VE._veUi.durationDisplay = document.getElementById('ve-time-total');

    // Wire master volume — after host is in DOM so getElementById works
    var masterVolSlider = document.getElementById('ve-master-vol');
    var masterVolBtn = document.getElementById('ve-master-vol-btn');
    var masterVolPopup = document.getElementById('ve-master-vol-popup');
    var masterVolVal = document.getElementById('ve-master-vol-val');
    if (masterVolBtn && masterVolPopup) {
      var _mvLeaveTimer = null;
      var _mvWrap = masterVolBtn.parentElement;
      _mvWrap.addEventListener('mouseenter', function() {
        clearTimeout(_mvLeaveTimer);
        masterVolPopup.classList.add('open');
      });
      _mvWrap.addEventListener('mouseleave', function() {
        _mvLeaveTimer = setTimeout(function() { masterVolPopup.classList.remove('open'); }, 400);
      });
      // Click button = toggle mute
      masterVolBtn.addEventListener('click', function() {
        VE._veMasterMuted = !VE._veMasterMuted;
        masterVolBtn.innerHTML = VE._veIcon(VE._veMasterMuted ? 'volume-x' : (VE._veMasterVol < 0.4 ? 'volume-1' : 'volume-2'), 14);
        VE._veApplyVolumes();
      });
    }
    if (masterVolSlider) {
      masterVolSlider.addEventListener('input', function() {
        var pct = parseInt(masterVolSlider.value, 10);
        VE._veMasterVol = pct / 100;
        VE._veMasterMuted = false;
        if (masterVolVal) masterVolVal.textContent = pct + '%';
        if (masterVolBtn) {
          masterVolBtn.innerHTML = VE._veIcon(VE._veMasterVol === 0 ? 'volume-x' : VE._veMasterVol < 0.4 ? 'volume-1' : 'volume-2', 14);
        }
        VE._veApplyVolumes();
      });
    }
  };

  VE._veIcon = function (name, size) {
    size = size || 16;
    // Try static ICONS map first
    if (typeof getIcon === 'function') {
      var result = getIcon(name, size);
      if (result) return result;
    }
    // Try Lucide library directly
    if (typeof lucide !== 'undefined' && lucide && lucide.icons) {
      var pascal = String(name || '').split('-').map(function(p) { return p ? p.charAt(0).toUpperCase() + p.slice(1) : ''; }).join('');
      var iconNode = lucide.icons[pascal];
      if (iconNode) {
        var paths = iconNode.map(function(node) {
          if (!node || !node.length) return '';
          var tag = node[0]; var attrs = node[1] || {};
          var chunks = [];
          Object.keys(attrs).forEach(function(key) { if (attrs[key] != null) chunks.push(key + '="' + attrs[key] + '"'); });
          return '<' + tag + (chunks.length ? ' ' + chunks.join(' ') : '') + '></' + tag + '>';
        }).join('');
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
      }
    }
    // Emoji fallback
    var map = {
      'play': '▶', 'pause': '⏸', 'skip-back': '⏮', 'skip-forward': '⏭',
      'scissors': '✂', 'trash-2': '🗑', 'lock': '🔒', 'unlock': '🔓',
      'download': '⬇', 'copy': '⧉', 'plus': '+', 'minus': '−'
    };
    return '<span style="font-size:' + size + 'px">' + (map[name] || '●') + '</span>';
  };

  VE._veRender = function () {
    if (!VE._veUi.host) return;
    var viewport = document.getElementById('ve-scroll-wrap');
    var savedScrollLeft = viewport ? viewport.scrollLeft : 0;
    var savedScrollTop = viewport ? viewport.scrollTop : 0;
    // Migrate any legacy dedicated subtitle track to a normal one BEFORE the
    // headers render (owner: no "Sub" track bar; subtitles live on normal tracks).
    // Idempotent; everything subtitle keys off `cues`, not the type, so safe.
    VE._veProject.tracks.forEach(function(track) {
      if (track.type === 'subtitle') {
        track.type = 'video';
        if (/^Sub /.test(track.label || '')) track.label = track.label.replace(/^Sub /, 'V');
      }
    });
    // Enforce correct dimensions whenever VE renders
    VE._veEnforceDimensions();
    VE._veRenderRuler();
    VE._veRenderTrackHeaders();
    VE._veRenderTracks();
    VE._veUpdatePlayhead();
    VE._veUpdateTimeDisplay();
    VE._veRenderMiniTimeline();
    if (viewport) {
      VE._veProgrammaticScroll = true;
      viewport.scrollLeft = savedScrollLeft;
      viewport.scrollTop = savedScrollTop;
      requestAnimationFrame(function () { VE._veProgrammaticScroll = false; });
    }
  };

  // Full timeline pixel width = the ruler's TICK extent (maxTime), not just the content
  // duration. The ruler draws ticks up to Math.max(duration+10, 30)s (see _veRenderRuler);
  // the tracks/lanes MUST span the same width, else scrolling right past the content duration
  // shows empty ground under the ruler ticks (the lane backgrounds/lines stop early). Both the
  // ruler and the tracks container read this single value so they can never drift apart.
  VE._veTimelineWidthPx = function () {
    var maxTime = Math.max((VE._veProject.duration || 0) + 10, 30);
    return Math.max(800, Math.round(maxTime * VE._veProject.zoom) + 200);
  };

  VE._veRenderRuler = function () {
    var ruler = VE._veUi.ruler;
    if (!ruler) return;
    var totalPx = VE._veTimelineWidthPx();
    ruler.style.width = totalPx + 'px';

    var step = VE._veRulerStep();
    var maxTime = Math.max(VE._veProject.duration + 10, 30);
    var zoom = VE._veProject.zoom;

    /* ONE parse instead of one createElement + one appendChild per tick. An hour of footage is 1,806
       ticks and two hours is 3,606, and this function runs on every _veRender - measured
       2026-08-15 with apps/editor/tools/_ve-timeline-cost-probe.mjs, it was the top frame at one hour.
       The markup is identical to what the loop built; only the number of DOM operations changed.
       _veFormatTime emits our own formatted clock, never anything a user typed. */
    var html = '';
    for (var t = 0; t <= maxTime; t += step) {
      html += '<div class="ve-ruler-tick" style="left:' + Math.round(t * zoom) + 'px">' +
        VE._veFormatTime(t) + '</div>';
    }
    ruler.innerHTML = html;

    /* THE MARKERS USED TO BE INSIDE THE TICK LOOP. Every marker was rebuilt, re-listened and
       re-appended once PER TICK: five markers on an hour-long project meant 9,030 elements and 18,060
       event listeners instead of five and ten. They stack at the same coordinates, so nothing looked
       wrong; it only showed up as time. PROVEN by counting, not by timing:
       apps/editor/tools/_ve-ruler-marker-proof.mjs. This block now runs once, after the ticks. */
    if (VE._veProject.markers) {
      VE._veProject.markers.forEach(function(marker) {
        // Range marker: show a highlighted region
        if (marker.type === 'range' && marker.endTime != null) {
          var rangeEl = document.createElement('div');
          rangeEl.className = 've-marker-range';
          var rangeLeft = Math.round(marker.time * VE._veProject.zoom);
          var rangeWidth = Math.round((marker.endTime - marker.time) * VE._veProject.zoom);
          rangeEl.style.cssText = 'position:absolute;left:' + rangeLeft + 'px;width:' + rangeWidth +
            'px;top:0;height:100%;background:' + (marker.color || '#4fc3f7') +
            ';opacity:0.15;pointer-events:none;z-index:1;';
          ruler.appendChild(rangeEl);
        }

        var flag = document.createElement('div');
        flag.className = 've-marker-flag' +
          (marker.type === 'chapter' ? ' ve-marker-flag--chapter' : '') +
          (marker.type === 'todo' ? ' ve-marker-flag--todo' : '') +
          (marker.done ? ' ve-marker-flag--done' : '');
        flag.style.left = Math.round(marker.time * VE._veProject.zoom) + 'px';
        flag.style.borderColor = marker.color || '#f2ff58';
        var typeIcon = marker.type === 'chapter' ? '§' : marker.type === 'todo' ? (marker.done ? '✓' : '☐') : '';
        flag.title = (typeIcon ? typeIcon + ' ' : '') + (marker.label || 'Marker') + (marker.note ? '\n' + marker.note : '');
        flag.setAttribute('data-marker-id', marker.id);
        flag.addEventListener('click', function(e) {
          e.stopPropagation();
          if (marker.type === 'todo') VE._veToggleTodoMarker(marker.id);
          VE._veSeek(marker.time);
        });
        flag.addEventListener('contextmenu', function(e) {
          e.preventDefault();
          e.stopPropagation();
          VE._veShowMarkerMenu(marker, e);
        });
        ruler.appendChild(flag);
      });
    }
  };

  VE._veRulerStep = function () {
    var z = VE._veProject.zoom;
    var steps = [0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600, 900];
    for (var i = 0; i < steps.length; i++) if (steps[i] * z >= 64) return steps[i];
    return 1800;
  };

  VE._veRenderTrackHeaders = function () {
    var el = document.getElementById('ve-track-headers');
    if (!el) return;
    el.innerHTML = '';

    // spacer for ruler height
    var spacer = document.createElement('div');
    spacer.className = 've-header-spacer';
    spacer.style.height = VE.RULER_HEIGHT + 'px';
    el.appendChild(spacer);

    VE._veProject.tracks.forEach(function(track) {
      var row = document.createElement('div');
      row.className = 've-track-header';
      row.style.height = (track._height || VE.TRACK_HEIGHT) + 'px';
      if (track._color) row.style.borderLeft = '3px solid ' + track._color;
      row.setAttribute('data-track-id', track.id);

      var displayTrackLabel = track.subtitleSetId && track.speakerOrdinal ? 'Speaker ' + track.speakerOrdinal : track.label;
      var hasCues = !!(track.type === 'subtitle' || (track.cues && track.cues.length));
      /* NO caption-visibility button here, deliberately (owner 2026-08-11: "tuş istemiyorum ...
         otomatik gösteriyordu"). Whether a track's captions are on screen is DERIVED, by
         `VESubtitleElement.captionsVisible`: a `captionVisible = false` written by dubbing or
         translation only holds while the replacement set really carries cues, so an empty or deleted
         destination self-heals and the subtitles come back on their own. A switch would be a second
         answer to a question that already answers itself. */
      row.innerHTML =
        '<span class="ve-track-label">' +
          (hasCues ? '<span class="ve-track-cc">' + VE._veIcon('captions', 12) + '</span>' : '') +
          displayTrackLabel +
        '</span>' +
        '<div class="ve-track-btns">' +
          (track.type === 'video' ? '<button class="ve-track-btn" data-action="subtitle-tools" title="Auto Subtitle (AI)">' + VE._veIcon('captions', 12) + '</button>' : '') +
          '<button class="ve-track-btn' + (track.muted ? ' active' : '') + '" data-action="mute" title="' + (track.muted ? 'Unmute' : 'Mute') + '">' +
            VE._veIcon(track.muted ? 'volume-x' : 'volume-2', 12) +
          '</button>' +
          '<button class="ve-track-btn' + (track.solo ? ' active' : '') + '" data-action="solo" title="Solo">' +
            '<span style="font-size:10px;font-weight:bold;">S</span>' +
          '</button>' +
          '<button class="ve-track-btn" data-action="lock" title="' + (track.locked ? 'Unlock' : 'Lock') + '">' +
            VE._veIcon(track.locked ? 'lock' : 'unlock', 12) +
          '</button>' +
        '</div>' +
        '<input type="range" class="ve-track-vol" data-action="volume" min="0" max="200" value="' + Math.round((track.volume != null ? track.volume : 1) * 100) + '" title="Track Volume">';

      row.addEventListener('click', function(e) {
        var btn = e.target.closest('[data-action]');
        if (!btn) {
          if (track.type === 'subtitle' || (track.cues && track.cues.length)) {
            if (window.VESubtitleElement && VESubtitleElement.selectTrack) VESubtitleElement.selectTrack(track);
            if (typeof _sdShowSubtitlePanel === 'function') _sdShowSubtitlePanel(track.id);
          }
          return;
        }
        if (btn.tagName === 'INPUT') return;
        var action = btn.getAttribute('data-action');
        if (action === 'subtitle-tools') {
          e.stopPropagation();
          if (track.cues && track.cues.length) {
            if (window.VESubtitleElement && VESubtitleElement.selectTrack) VESubtitleElement.selectTrack(track);
            if (typeof _sdShowSubtitlePanel === 'function') _sdShowSubtitlePanel(track.id);
          } else if (window.VEAutoSubtitle) VEAutoSubtitle.showModal();
          return;
        } else if (action === 'lock') {
          track.locked = !track.locked;
          VE._veRender();
        } else if (action === 'mute') {
          track.muted = !track.muted;
          VE._veApplyVolumes();
          VE._veRender();
        } else if (action === 'solo') {
          track.solo = !track.solo;
          VE._veApplyVolumes();
          VE._veRender();
        }
      });

      // Right-click track header → show Track Properties panel
      row.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        e.stopPropagation();
        VE._veShowTrackProperties(track, e);
      });

      // Double-click track header → show Track Properties panel
      row.addEventListener('dblclick', function(e) {
        e.preventDefault();
        VE._veShowTrackProperties(track, e);
      });

      var volSlider = row.querySelector('.ve-track-vol');
      if (volSlider) {
        volSlider.addEventListener('input', function(e) {
          var val = parseInt(e.target.value, 10) / 100;
          track.volume = val;
          VE._veApplyVolumes();
        });
      }

      el.appendChild(row);
    });
  };

  VE._veShowTrackProperties = function (track, evt) {
    var old = document.getElementById('ve-track-props');
    if (old) old.remove();

    var trackIdx = VE._veProject.tracks.indexOf(track);
    var clipCount = track.clips.length;
    var totalDur = 0;
    track.clips.forEach(function(c) { totalDur += c.duration; });

    var TRACK_COLORS = ['#f2ff58','#7ecfff','#90ee90','#ffb347','#dda0dd','#f0e68c','#87ceeb','#ff6b6b'];
    var curColor = track._color || TRACK_COLORS[trackIdx % TRACK_COLORS.length];

    var panel = document.createElement('div');
    panel.id = 've-track-props';
    panel.className = 've-track-props';

    var html = '<div class="ve-track-props-header">' +
      '<span>' + VE._veIcon('settings', 14) + ' Track Properties</span>' +
      '<button class="ve-insp-close" id="ve-tp-close" title="Close">' + VE._veIcon('x', 14) + '</button>' +
    '</div>' +
    '<div class="ve-track-props-body">' +
      '<div class="ve-insp-row"><span class="ve-insp-label">Label</span><input class="ve-insp-input" id="ve-tp-label" value="' + (track.label || '') + '"></div>' +
      '<div class="ve-insp-row"><span class="ve-insp-label">Type</span><span class="ve-insp-value">' + (track.type || 'video') + '</span></div>' +
      '<div class="ve-insp-row"><span class="ve-insp-label">Clips</span><span class="ve-insp-value">' + clipCount + '</span></div>' +
      '<div class="ve-insp-row"><span class="ve-insp-label">Total Dur.</span><span class="ve-insp-value">' + totalDur.toFixed(1) + 's</span></div>' +
      '<div class="ve-insp-row"><span class="ve-insp-label">Color</span><input type="color" class="ve-insp-input" id="ve-tp-color" value="' + curColor + '" style="width:50px;height:24px;padding:0;border:none;cursor:pointer;"></div>' +
      '<div class="ve-insp-row ve-insp-slider-row"><span class="ve-insp-label">Volume</span>' +
        '<input type="range" class="ve-insp-slider" id="ve-tp-vol" min="0" max="200" value="' + Math.round((track.volume != null ? track.volume : 1) * 100) + '">' +
        '<span class="ve-insp-slider-val" id="ve-tp-vol-val">' + Math.round((track.volume != null ? track.volume : 1) * 100) + '%</span>' +
      '</div>' +
      '<div class="ve-insp-row"><span class="ve-insp-label">Height</span>' +
        '<select class="ve-insp-select" id="ve-tp-height">' +
          '<option value="36"' + ((track._height || VE.TRACK_HEIGHT) === 36 ? ' selected' : '') + '>Compact</option>' +
          '<option value="48"' + ((track._height || VE.TRACK_HEIGHT) === 48 ? ' selected' : '') + '>Normal</option>' +
          '<option value="72"' + ((track._height || VE.TRACK_HEIGHT) === 72 ? ' selected' : '') + '>Tall</option>' +
          '<option value="96"' + ((track._height || VE.TRACK_HEIGHT) === 96 ? ' selected' : '') + '>Large</option>' +
        '</select></div>' +
      '<div class="ve-insp-row" style="justify-content:center;gap:6px;margin-top:8px;">' +
        '<button class="ve-insp-btn" id="ve-tp-mute">' + VE._veIcon(track.muted ? 'volume-x' : 'volume-2', 12) + (track.muted ? ' Unmute' : ' Mute') + '</button>' +
        '<button class="ve-insp-btn" id="ve-tp-lock">' + VE._veIcon(track.locked ? 'unlock' : 'lock', 12) + (track.locked ? ' Unlock' : ' Lock') + '</button>' +
        '<button class="ve-insp-btn" id="ve-tp-solo" style="' + (track.solo ? 'color:var(--gold);' : '') + '">S Solo</button>' +
      '</div>' +
      '<div class="ve-insp-row" style="justify-content:center;margin-top:4px;">' +
        '<button class="ve-insp-btn" id="ve-tp-delete" style="color:#ff6b6b;">' + VE._veIcon('trash-2', 12) + ' Delete Track</button>' +
      '</div>' +
    '</div>';

    panel.innerHTML = html;

    // Position near the click
    var x = evt.clientX || 100;
    var y = evt.clientY || 100;
    panel.style.cssText = 'position:fixed;left:' + Math.min(x, window.innerWidth - 280) + 'px;top:' + Math.min(y, window.innerHeight - 400) + 'px;z-index:10004;';
    document.body.appendChild(panel);

    // Make draggable
    var hdr = panel.querySelector('.ve-track-props-header');
    var _dx = 0, _dy = 0;
    hdr.addEventListener('mousedown', function(me) {
      if (me.target.closest('button')) return;
      me.preventDefault();
      _dx = me.clientX - panel.getBoundingClientRect().left;
      _dy = me.clientY - panel.getBoundingClientRect().top;
      function onMove(mv) { panel.style.left = (mv.clientX - _dx) + 'px'; panel.style.top = (mv.clientY - _dy) + 'px'; }
      function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // Bind events
    document.getElementById('ve-tp-close').addEventListener('click', function() { panel.remove(); });

    var labelInput = document.getElementById('ve-tp-label');
    if (labelInput) labelInput.addEventListener('change', function() { track.label = labelInput.value || track.label; VE._veRender(); });

    var colorInput = document.getElementById('ve-tp-color');
    if (colorInput) colorInput.addEventListener('input', function() { track._color = colorInput.value; VE._veRender(); });

    var volSlider = document.getElementById('ve-tp-vol');
    var volVal = document.getElementById('ve-tp-vol-val');
    function syncVolumeSlider() {
      if (!volSlider) return;
      var min = parseFloat(volSlider.min) || 0;
      var max = parseFloat(volSlider.max) || 100;
      var value = parseFloat(volSlider.value);
      if (!Number.isFinite(value)) value = min;
      var fill = max > min ? ((value - min) / (max - min)) * 100 : 0;
      volSlider.style.setProperty('--p', Math.max(0, Math.min(100, fill)) + '%');
      if (volVal) volVal.textContent = Math.round(value) + '%';
    }
    if (volSlider) {
      syncVolumeSlider();
      volSlider.addEventListener('input', function() {
        var v = parseInt(volSlider.value, 10);
        track.volume = v / 100;
        syncVolumeSlider();
        VE._veApplyVolumes();
      });
    }

    var heightSel = document.getElementById('ve-tp-height');
    if (heightSel) heightSel.addEventListener('change', function() {
      track._height = parseInt(heightSel.value, 10);
      VE._veRender();
    });

    document.getElementById('ve-tp-mute').addEventListener('click', function() {
      track.muted = !track.muted;
      VE._veApplyVolumes();
      VE._veRender(); panel.remove();
    });
    document.getElementById('ve-tp-lock').addEventListener('click', function() {
      track.locked = !track.locked;
      VE._veRender(); panel.remove();
    });
    document.getElementById('ve-tp-solo').addEventListener('click', function() {
      track.solo = !track.solo;
      VE._veApplyVolumes();
      VE._veRender(); panel.remove();
    });
    document.getElementById('ve-tp-delete').addEventListener('click', function() {
      if (track.clips.length > 0 && !confirm('Delete track "' + track.label + '" and its ' + track.clips.length + ' clip(s)?')) return;
      // Clear bg reference if any bg clip is on this track
      var bgWasDeleted = false;
      track.clips.forEach(function(c) {
        if (VE._veProject._bgClipId === c.id) { VE._veProject._bgClipId = null; bgWasDeleted = true; }
      });
      VE._veProject.tracks = VE._veProject.tracks.filter(function(t) { return t.id !== track.id; });
      track.clips.forEach(function(c) { if (VE._veReleasePoolEntry) VE._veReleasePoolEntry(c.id); }); // H16
      if (bgWasDeleted) VE._vePromoteBgClip();
      VE._vePushUndo();
      VE._veRecalcDuration();
      VE._veRender();
      panel.remove();
    });

    // Close on outside click
    setTimeout(function() {
      document.addEventListener('mousedown', function _tpClose(e) {
        if (!panel.contains(e.target)) {
          panel.remove();
          document.removeEventListener('mousedown', _tpClose);
        }
      });
    }, 100);
  };

  VE._veRenderTracks = function () {
    var container = VE._veUi.tracksContainer;
    if (!container) return;
    container.innerHTML = '';
    var totalPx = VE._veTimelineWidthPx();
    container.style.width = totalPx + 'px';
    var itemCount = 0;
    VE._veProject.tracks.forEach(function (candidate) {
      itemCount += (candidate.clips || []).length + (candidate.cues || []).length;
    });
    var renderWindow = null;
    if (VE._veProject.duration > 600 || itemCount > 400) {
      var scrollWrap = document.getElementById('ve-scroll-wrap');
      var zoom = Math.max(VE.PX_PER_SEC_MIN, VE._veProject.zoom || 1);
      var visibleStart = scrollWrap ? scrollWrap.scrollLeft / zoom : VE._veProject.playheadTime;
      var visibleEnd = scrollWrap ? (scrollWrap.scrollLeft + scrollWrap.clientWidth) / zoom : visibleStart + 60;
      renderWindow = {
        start: Math.max(0, visibleStart - 300),
        end: Math.min(VE._veProject.duration, visibleEnd + 300)
      };
    }

    function isInRenderWindow(start, end) {
      return !renderWindow || (start <= renderWindow.end && end >= renderWindow.start);
    }

    VE._veProject.tracks.forEach(function(track) {
      var lane = document.createElement('div');
      lane.className = 've-track-lane';
      lane.style.height = (track._height || VE.TRACK_HEIGHT) + 'px';
      lane.setAttribute('data-track-id', track.id);

      // Clips AND subtitle cue segments can share any track (owner: subtitles
      // drag onto whatever track you want, like video).
      (track.clips || []).forEach(function(clip) {
        if (!isInRenderWindow(clip.startTime || 0, (clip.startTime || 0) + (clip.duration || 0))) return;
        lane.appendChild(VE._veRenderClip(clip, track));
      });
      (track.cues || []).forEach(function(cue) {
        if (!isInRenderWindow(cue.startTime || 0, cue.endTime || cue.startTime || 0)) return;
        lane.appendChild(VE._veRenderCueSegment(cue, track));
      });

      // Drop zone for adding media
      lane.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        lane.classList.add('ve-track-lane--dragover');
      });
      lane.addEventListener('dragleave', function() {
        lane.classList.remove('ve-track-lane--dragover');
      });
      lane.addEventListener('drop', function(e) {
        e.preventDefault();
        lane.classList.remove('ve-track-lane--dragover');
        VE._veHandleDrop(e, track);
      });

      container.appendChild(lane);
    });
  };

  /* ── Cue selection helpers ────────────────────────────────────────────────
     `VE._veSelectedCues` (array of cue ids) is to a cue what `_veSelectedClips` is to a clip, and
     these three are its ONLY readers/writers outside the click handlers. Never test
     `_veSelectedCueId` alone for "is this cue selected": that field carries the SINGLE cue whose
     on-canvas Textbox proxy is live, which is a strictly narrower question. */
  VE._veCueSelected = function (cueId) {
    return !!cueId && ((VE._veSelectedCues || []).indexOf(cueId) >= 0 || VE._veSelectedCueId === cueId);
  };
  VE._veFindCueById = function (cueId) {
    if (!cueId) return null;
    var tracks = VE._veProject.tracks;
    for (var i = 0; i < tracks.length; i++) {
      var cues = tracks[i].cues || [];
      for (var j = 0; j < cues.length; j++) if (cues[j].id === cueId) return { track: tracks[i], cue: cues[j], index: j };
    }
    return null;
  };
  /* Take the timeline selection for CUES. Clips are dropped in the same breath (and the docked clip
     inspector with them): the trash button, the Del key and the context menu all read one selection
     state, so leaving a clip selected behind a cue click is how "Delete" ended up removing the video
     the user was not pointing at - or doing nothing at all when that clip's track was locked. */
  VE._veSetCueSelection = function (ids, primaryCueId, trackId) {
    VE._veSelectedCues = (ids || []).slice();
    if (VE._veSelectedClips.length) {
      VE._veSelectedClips = [];
      if (window.VEInspector) { VEInspector.hide(); if (VEInspector.hideDocked) VEInspector.hideDocked(); }
    }
    if (primaryCueId !== undefined) VE._veSelectedCueId = primaryCueId;
    if (trackId !== undefined) VE._veSelectedSubtitleTrackId = trackId;
  };

  // A subtitle cue rendered as a timeline segment (CapCut-style block). Position
  // and width come from the cue's start/end times. Clicking seeks + selects it.
  VE._veRenderCueSegment = function (cue, track) {
    var el = document.createElement('div');
    el.className = 've-cue-seg' + (VE._veCueSelected(cue.id) ? ' ve-cue-seg--selected' : '');
    el.setAttribute('data-cue-id', cue.id);
    el.setAttribute('data-track-id', track.id);
    var zoom = VE._veProject.zoom;
    var left = (cue.startTime || 0) * zoom;
    var width = Math.max(zoom < 2 ? 2 : 8, ((cue.endTime || 0) - (cue.startTime || 0)) * zoom);
    el.style.left = left + 'px';
    el.style.width = width + 'px';
    if (track._color) el.style.setProperty('--ve-speaker-color', track._color);
    var txt = (cue.text || '').replace(/\n/g, ' ')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    el.innerHTML =
      '<span class="ve-cue-seg-cc">' + VE._veIcon('captions', 11) + '</span>' +
      '<span class="ve-cue-seg-txt">' + txt + '</span>';
    el.title = (cue.text || '').replace(/\s+/g, ' ').trim();
    /* Modifier clicks mirror the CLIP handler 1:1 (ctrl = toggle, shift = range on this track,
       plain = collapse unless already part of the group), so the two segment kinds behave the same
       under the same hand. Right-click never starts a drag and never collapses an existing
       multi-selection, or the context menu's Delete would only ever remove one cue. */
    el.addEventListener('mousedown', function (e) {
      if (e.button === 2) {
        e.stopPropagation();
        if (!VE._veCueSelected(cue.id)) {
          VE._veSetCueSelection([cue.id], cue.id, track.id);
          VE._veRender();
        }
        return;
      }
      if (e.button !== 0) return;
      e.stopPropagation();

      var sel = (VE._veSelectedCues || []).slice();
      if (e.ctrlKey || e.metaKey) {
        var at = sel.indexOf(cue.id);
        if (at >= 0) sel.splice(at, 1); else sel.push(cue.id);
        VE._veSetCueSelection(sel, sel.length === 1 ? sel[0] : null, track.id);
        VE._veApplyCueSelectionToCanvas(track);
        VE._veRender();
        return;
      }
      if (e.shiftKey && sel.length) {
        var ids = (track.cues || []).map(function (c) { return c.id; });
        var anchor = -1;
        for (var s = sel.length - 1; s >= 0 && anchor === -1; s--) anchor = ids.indexOf(sel[s]);
        var to = ids.indexOf(cue.id);
        if (anchor >= 0 && to >= 0) {
          var lo = Math.min(anchor, to), hi = Math.max(anchor, to);
          for (var r = lo; r <= hi; r++) if (sel.indexOf(ids[r]) < 0) sel.push(ids[r]);
        } else {
          sel = [cue.id];
        }
        VE._veSetCueSelection(sel, sel.length === 1 ? sel[0] : null, track.id);
        VE._veApplyCueSelectionToCanvas(track);
        VE._veRender();
        return;
      }
      if (sel.indexOf(cue.id) === -1 || sel.length <= 1) {
        VE._veSetCueSelection([cue.id], cue.id, track.id);
      } else {
        // Keep the group intact so it can be dragged as one; a click that never becomes a drag
        // collapses to this cue on mouseup (standard NLE behaviour, same as _veStartClipDrag).
        VE._veSelectedCueId = cue.id;
        VE._veSelectedSubtitleTrackId = track.id;
      }
      // Mirror the selection in the subtitle panel (scrolls to + highlights the same cue):
      // the timeline segment and the panel row are the same object, so clicking one finds
      // it in the other.
      if (window.VESubtitlePanel && VESubtitlePanel.syncSelection) VESubtitlePanel.syncSelection(cue.id, track.id);
      VE._veStartCueDrag(e, cue, track);
    });
    return el;
  };

  /* The on-canvas Textbox proxy can only ever represent ONE cue, so a multi-selection must drop it
     rather than leave a stale box editing a cue that is no longer the only one selected. Called
     from every cue-selection change that does not go through the drag's mouseup. */
  VE._veApplyCueSelectionToCanvas = function (track) {
    var n = (VE._veSelectedCues || []).length;
    if (!window.VESubtitleElement) return;
    if (n === 1) {
      if (VESubtitleElement.selectTrack) VESubtitleElement.selectTrack(track, VE._veSelectedCues[0]);
    } else if (VESubtitleElement.deselect) {
      var keep = (VE._veSelectedCues || []).slice();
      VESubtitleElement.deselect(true);
      VE._veSelectedCues = keep;   // deselect() clears the single-cue fields, not the group
    }
  };

  // Cue drag, modeled 1:1 on VE._veStartClipDrag: updates position live every
  // mousemove and moves the cue between track lanes live (no teleport), pushes
  // undo on drop.
  VE._veStartCueDrag = function (e, cue, track) {
    if (track.locked) return;
    var startX = e.clientX, startY = e.clientY;
    var origStart = cue.startTime || 0;
    var dur = (cue.endTime || 0) - origStart;
    var srcTrack = track;
    var moved = false;

    /* Group drag: when the grabbed cue is one of several selected, every selected cue moves by the
       SAME time delta so the block keeps its formation (same rule as the clip group drag). Only the
       HORIZONTAL delta is grouped - a cross-track move stays a single-cue gesture, because moving a
       cue to another track re-homes it under that track's speaker/style defaults and doing that to a
       whole block silently rewrites how every one of them is drawn. Locked tracks are skipped. */
    var isGroup = (VE._veSelectedCues || []).length > 1 && VE._veCueSelected(cue.id);
    var group = [];   // [{ cue, track, origStart, dur }]
    var minOrigStart = Infinity;
    if (isGroup) {
      (VE._veSelectedCues || []).forEach(function (id) {
        var hit = VE._veFindCueById(id);
        if (!hit || hit.track.locked) return;
        var s = hit.cue.startTime || 0;
        group.push({ cue: hit.cue, track: hit.track, origStart: s, dur: (hit.cue.endTime || 0) - s });
        if (s < minOrigStart) minOrigStart = s;
      });
      if (group.length < 2) isGroup = false;
    }
    // A plain click on an already-grouped cue that never becomes a drag collapses to that cue.
    var collapseOnClick = isGroup && !e.ctrlKey && !e.shiftKey && !e.metaKey;

    function onMove(ev) {
      var dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      if (!moved) return;
      if (isGroup) {
        var gdt = dx / VE._veProject.zoom;
        if (minOrigStart + gdt < 0) gdt = -minOrigStart;   // clamp the whole block at 0
        for (var gi = 0; gi < group.length; gi++) {
          var g = group[gi];
          g.cue.startTime = Math.max(0, g.origStart + gdt);
          g.cue.endTime = g.cue.startTime + g.dur;
        }
        VE._veRecalcDuration();
        VE._veRender();
        return;
      }
      var ns = Math.max(0, origStart + dx / VE._veProject.zoom);
      cue.startTime = ns; cue.endTime = ns + dur;
      if (Math.abs(dy) > VE.TRACK_HEIGHT / 2) {
        var container = VE._veUi.tracksContainer;
        if (container) {
          var rect = container.getBoundingClientRect();
          var relY = ev.clientY - rect.top + (container.parentElement ? container.parentElement.scrollTop : 0);
          var targetIdx = Math.max(0, Math.min(Math.floor(relY / VE.TRACK_HEIGHT), VE._veProject.tracks.length - 1));
          var targetTrack = VE._veProject.tracks[targetIdx];
          if (targetTrack && targetTrack !== srcTrack && !targetTrack.locked) {
            var i = srcTrack.cues.indexOf(cue);
            if (i > -1) srcTrack.cues.splice(i, 1);
            if (!targetTrack.cues) targetTrack.cues = [];
            targetTrack.cues.push(cue);
            if (window.VESubtitleElement && VESubtitleElement.ensureTrackDefaults) VESubtitleElement.ensureTrackDefaults(targetTrack);
            srcTrack = targetTrack;
          }
        }
      }
      VE._veSelectedCueId = cue.id;
      VE._veSelectedSubtitleTrackId = srcTrack.id;
      VE._veRecalcDuration();
      VE._veRender();
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (moved) {
        if (isGroup) {
          var touched = {};
          for (var ui = 0; ui < group.length; ui++) touched[group[ui].track.id] = group[ui].track;
          Object.keys(touched).forEach(function (tid) {
            touched[tid].cues.sort(function (a, b) { return (a.startTime || 0) - (b.startTime || 0); });
          });
          if (VE._vePushUndo) VE._vePushUndo();
          VE._veRender();
          if (window.VESubtitlePanel && VESubtitlePanel.render && VESubtitlePanel.isOpen && VESubtitlePanel.isOpen()) VESubtitlePanel.render();
          return;
        }
        if (srcTrack.cues) srcTrack.cues.sort(function (a, b) { return (a.startTime || 0) - (b.startTime || 0); });
        if (VE._vePushUndo) VE._vePushUndo();
        // Pass the cue that was actually dragged. Without the id `selectTrack` resolves whatever
        // happens to be active at the playhead, so dragging cue B while the playhead sat inside
        // cue A put the editing box on A.
        if (window.VESubtitleElement && VESubtitleElement.selectTrack) VESubtitleElement.selectTrack(srcTrack, cue.id);
        if (window.VESubtitlePanel && VESubtitlePanel.setTrack) VESubtitlePanel.setTrack(srcTrack.id);
      } else {
        if (collapseOnClick) VE._veSetCueSelection([cue.id], cue.id, srcTrack.id);
        if (VE._veSeek) VE._veSeek(cue.startTime || 0);
        VE._veRender();
        // Same reason as above: the CLICKED cue is the one that gets the on-canvas box, never
        // "whatever the playhead is inside". A cue whose text is empty has no measurable box, so
        // selectTrack cannot build a proxy for it - the timeline selection above still stands and
        // both Delete doors read that, so the cue is never stuck un-deletable.
        if (window.VESubtitleElement && VESubtitleElement.selectTrack) VESubtitleElement.selectTrack(srcTrack, cue.id);
        // Clicking a cue auto-opens the left subtitle panel (owner).
        if (typeof _sdShowSubtitlePanel === 'function') _sdShowSubtitlePanel(srcTrack.id);
        else if (window.VESubtitlePanel && VESubtitlePanel.setTrack) VESubtitlePanel.setTrack(srcTrack.id);
      }
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  VE._veStaticWaveformUrl = function (peaks, color) {
    if (!Array.isArray(peaks) || !peaks.length) return null;
    var waveformCanvas = document.createElement('canvas');
    waveformCanvas.width = 400;
    waveformCanvas.height = 40;
    var ctx = waveformCanvas.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, 400, 40);
    ctx.fillStyle = color || '#d7a0cf';
    ctx.globalAlpha = 0.88;
    var step = 400 / peaks.length;
    for (var i = 0; i < peaks.length; i++) {
      var height = Math.max(1, Math.min(34, Number(peaks[i] || 0) * 34));
      ctx.fillRect(Math.floor(i * step), 40 - height, Math.max(1, Math.min(2, Math.floor(step * 0.42))), height);
    }
    return waveformCanvas.toDataURL('image/png');
  };

  VE._veCompactWaveformPeaks = function (rawPeaks) {
    if (!rawPeaks || !rawPeaks.length) return [];
    var pairData = rawPeaks.length % 2 === 0;
    var sampleCount = pairData ? Math.floor(rawPeaks.length / 2) : rawPeaks.length;
    var barCount = Math.min(240, Math.max(48, sampleCount));
    var compact = [];
    for (var bar = 0; bar < barCount; bar++) {
      var from = Math.floor(bar * sampleCount / barCount);
      var to = Math.max(from + 1, Math.floor((bar + 1) * sampleCount / barCount));
      var peak = 0;
      for (var sample = from; sample < to && sample < sampleCount; sample++) {
        if (pairData) peak = Math.max(peak, Math.abs(Number(rawPeaks[sample * 2] || 0)), Math.abs(Number(rawPeaks[sample * 2 + 1] || 0)));
        else peak = Math.max(peak, Math.abs(Number(rawPeaks[sample] || 0)));
      }
      compact.push(Math.round(Math.min(1, peak) * 1000) / 1000);
    }
    return compact;
  };

  VE._veDubbingWaveformQueue = VE._veDubbingWaveformQueue || [];
  VE._veDubbingWaveformPending = VE._veDubbingWaveformPending || {};
  VE._veDubbingWaveformActive = VE._veDubbingWaveformActive || 0;

  VE._veScheduleDubbingWaveformCheckpoint = function () {
    if (VE._veDubbingWaveformCheckpointTimer) return;
    VE._veDubbingWaveformCheckpointTimer = setTimeout(function () {
      VE._veDubbingWaveformCheckpointTimer = null;
      if (typeof saveCurrentPage === 'function') saveCurrentPage();
      if (typeof cc !== 'undefined' && cc.emit) cc.emit('action:ran', { id: 'video:dubbing-waveform-backfill' });
    }, 1800);
  };

  VE._veResolveDubbingWaveformSource = function (clip) {
    var media = VE._vePlayback && VE._vePlayback.videoPool && VE._vePlayback.videoPool[clip.id];
    var immediate = media && media.src || clip.src || clip._ccAssetUrl;
    if (immediate) return Promise.resolve({ url: immediate, revoke: false });
    if (clip._file && clip._file.size) return Promise.resolve({ url: URL.createObjectURL(clip._file), revoke: true });
    if (clip._ccMediaId && window.VEPersistence && VEPersistence.loadMedia) {
      return VEPersistence.loadMedia(clip._ccMediaId).then(function (blob) {
        if (!blob || !blob.size) throw new Error('Dubbing media is unavailable.');
        return { url: URL.createObjectURL(blob), revoke: true };
      });
    }
    return Promise.reject(new Error('Dubbing media is unavailable.'));
  };

  VE._veStoreDubbingWaveform = function (clip, rawPeaks, waveformUrl) {
    var compact = VE._veCompactWaveformPeaks(rawPeaks);
    if (!compact.length) return false;
    clip.dubbing = clip.dubbing || {};
    clip.dubbing.waveformPeaks = compact;
    clip._waveformUrl = VE._veStaticWaveformUrl(compact, '#d7a0cf') || waveformUrl || null;
    VE._veScheduleDubbingWaveformCheckpoint();
    return !!clip._waveformUrl;
  };

  VE._vePumpDubbingWaveforms = function () {
    while (VE._veDubbingWaveformActive < 2 && VE._veDubbingWaveformQueue.length) {
      (function (clip) {
        VE._veDubbingWaveformActive++;
        var cached = window.VEMediaPipeline && VEMediaPipeline.waveformCache && VEMediaPipeline.waveformCache.get
          ? VEMediaPipeline.waveformCache.get(clip.id).catch(function () { return null; })
          : Promise.resolve(null);
        cached.then(function (record) {
          var cachedRaw = record && record.peaks && record.peaks.raw && record.peaks.raw[0];
          if (cachedRaw && VE._veStoreDubbingWaveform(clip, cachedRaw, null)) return null;
          if (!window.VEMediaPipeline || !VEMediaPipeline.extractWaveform) throw new Error('Waveform pipeline is unavailable.');
          return VE._veResolveDubbingWaveformSource(clip).then(function (source) {
            return VEMediaPipeline.extractWaveform(source.url, { clipId: clip.id, stereo: false }).then(function (result) {
              var raw = result && result.peaks && result.peaks[0];
              VE._veStoreDubbingWaveform(clip, raw, result && result.waveformUrl);
            }).then(function () {
              if (source.revoke) URL.revokeObjectURL(source.url);
            }, function (error) {
              if (source.revoke) URL.revokeObjectURL(source.url);
              throw error;
            });
          });
        }).catch(function () {
          // Keep clip usable. A later render can retry after its IndexedDB media finishes restoring.
        }).then(function () {
          delete VE._veDubbingWaveformPending[clip.id];
          VE._veDubbingWaveformActive--;
          if (clip._waveformUrl && typeof VE._veRender === 'function') VE._veRender();
          VE._vePumpDubbingWaveforms();
        });
      })(VE._veDubbingWaveformQueue.shift());
    }
  };

  VE._veEnsureDubbingWaveform = function (clip) {
    if (!clip || !clip.dubbing || clip._waveformUrl || VE._veDubbingWaveformPending[clip.id]) return;
    if (clip.dubbing.waveformPeaks && clip.dubbing.waveformPeaks.length) {
      clip._waveformUrl = VE._veStaticWaveformUrl(clip.dubbing.waveformPeaks, '#d7a0cf');
      return;
    }
    VE._veDubbingWaveformPending[clip.id] = true;
    VE._veDubbingWaveformQueue.push(clip);
    VE._vePumpDubbingWaveforms();
  };

  VE._veRequestFilmstripTile = function (clip, sourceTime, cacheKey, imageEl, requestToken) {
    clip._filmstripPending = clip._filmstripPending || {};
    clip._filmstripCache = clip._filmstripCache || {};
    clip._filmstripOrder = clip._filmstripOrder || [];
    if (clip._filmstripPending[cacheKey] || clip._filmstripCache[cacheKey] || VE._veExporting) return;
    if (requestToken && clip._filmstripRequestToken !== requestToken) return;
    if (!window.VEFrameSource || !VEFrameSource.isAvailable()) return;
    clip._filmstripPending[cacheKey] = true;
    var media = VE._vePlayback && VE._vePlayback.videoPool && VE._vePlayback.videoPool[clip.id];
    var sourcePromise = VE._veFilmstripSources[clip.id];
    if (!sourcePromise) {
      sourcePromise = VEFrameSource.create(clip, media).then(function (source) { return source || null; });
      VE._veFilmstripSources[clip.id] = sourcePromise;
    }
    VE._veFilmstripQueues = VE._veFilmstripQueues || {};
    var previousRequest = VE._veFilmstripQueues[clip.id] || Promise.resolve();
    var queuedRequest = previousRequest.catch(function () {}).then(function () {
      if (requestToken && clip._filmstripRequestToken !== requestToken) return null;
      return sourcePromise;
    }).then(function (source) {
      if (!source) return null;
      if (requestToken && clip._filmstripRequestToken !== requestToken) return null;
      return source.frameAt(sourceTime);
    }).then(function (frame) {
      if (!frame) return;
      if (requestToken && clip._filmstripRequestToken !== requestToken) return;
      var canvas = document.createElement('canvas');
      canvas.width = 80; canvas.height = 45;
      var ctx = canvas.getContext('2d');
      if (!ctx) return;
      var fw = frame.videoWidth || frame.width || 1;
      var fh = frame.videoHeight || frame.height || 1;
      var scale = Math.max(80 / fw, 45 / fh);
      var dw = fw * scale, dh = fh * scale;
      ctx.drawImage(frame, (80 - dw) / 2, (45 - dh) / 2, dw, dh);
      var dataUrl = canvas.toDataURL('image/jpeg', 0.56);
      clip._filmstripCache[cacheKey] = dataUrl;
      clip._filmstripOrder.push(cacheKey);
      while (clip._filmstripOrder.length > 240) {
        var evicted = clip._filmstripOrder.shift();
        delete clip._filmstripCache[evicted];
      }
      if (imageEl && imageEl.isConnected) imageEl.src = dataUrl;
    });
    VE._veFilmstripQueues[clip.id] = queuedRequest.catch(function () {});
    VE._veFilmstripQueues[clip.id].then(function () { delete clip._filmstripPending[cacheKey]; });
  };

  VE._veRenderVirtualFilmstrip = function (clip, strip) {
    var wrap = document.getElementById('ve-scroll-wrap');
    var zoom = Math.max(VE.PX_PER_SEC_MIN, VE._veProject.zoom || 1);
    var clipLeft = (clip.startTime || 0) * zoom;
    var clipWidth = Math.max(4, (clip.duration || 0) * zoom);
    var viewportLeft = wrap ? wrap.scrollLeft : clipLeft;
    var viewportRight = wrap ? wrap.scrollLeft + wrap.clientWidth : clipLeft + Math.min(clipWidth, 800);
    var localLeft = Math.max(0, viewportLeft - clipLeft - 160);
    var localRight = Math.min(clipWidth, viewportRight - clipLeft + 160);
    if (localRight <= localLeft) return;
    var tileWidth = 80;
    var first = Math.max(0, Math.floor(localLeft / tileWidth));
    var last = Math.max(first, Math.ceil(localRight / tileWidth));
    var requestToken = Math.round(zoom * 100) / 100 + ':' + first + ':' + last;
    clip._filmstripRequestToken = requestToken;
    clip._filmstripCache = clip._filmstripCache || {};
    for (var tile = first; tile <= last; tile++) {
      var centerTimeline = Math.min(clip.duration || 0, (tile * tileWidth + tileWidth / 2) / zoom);
      var media = VE._vePlayback && VE._vePlayback.videoPool && VE._vePlayback.videoPool[clip.id];
      var absoluteTime = (clip.startTime || 0) + centerTimeline;
      var sourceTime = typeof VE._veClipLocalTime === 'function'
        ? VE._veClipLocalTime(clip, absoluteTime, media)
        : (clip.trimStart || 0) + centerTimeline * (clip.speed || 1);
      var cacheKey = Math.round(sourceTime * 4) / 4 + '@' + Math.round(zoom * 100) / 100;
      var img = document.createElement('img');
      img.className = 've-clip-thumb-img ve-clip-thumb-img--virtual';
      img.style.left = (tile * tileWidth) + 'px';
      img.style.width = Math.min(tileWidth, Math.max(1, clipWidth - tile * tileWidth)) + 'px';
      if (clip._filmstripCache[cacheKey]) img.src = clip._filmstripCache[cacheKey];
      else if (clip._thumbCache && clip._thumbCache.length) img.src = clip._thumbCache[tile % clip._thumbCache.length] || '';
      strip.appendChild(img);
      VE._veRequestFilmstripTile(clip, sourceTime, cacheKey, img, requestToken);
    }
  };

  VE._veRenderClip = function (clip, track) {
    var el = document.createElement('div');
    var isOverlay = clip.type === 'overlay';
    var isAdjustment = clip.type === 'adjustment';
    // Track role is lane metadata, not clip identity. A source/reference audio clip can
    // live on that lane; only generated clips carrying dubbing metadata get dub chrome.
    var isDubbingClip = clip.type === 'audio' && !!clip.dubbing;
    el.className = 've-clip' +
      (VE._veSelectedClips.indexOf(clip.id) >= 0 ? ' ve-clip--selected' : '') +
      (isOverlay ? ' ve-clip--overlay' : '') +
      (isDubbingClip ? ' ve-clip--dubbing' : '');
    el.setAttribute('data-clip-id', clip.id);

    var leftPx = Math.round(clip.startTime * VE._veProject.zoom);
    var widthPx = Math.max(4, Math.round(clip.duration * VE._veProject.zoom));
    el.style.left = leftPx + 'px';
    el.style.width = widthPx + 'px';
    if (isDubbingClip) el.style.setProperty('--ve-dub-speaker-color', track && track._color ? track._color : '#b698ff');

    /* Adjustment layer: a semi-transparent strip that reads as "this is not media". Without its own
       branch it fell through to the media path and rendered as an unlabelled grey block, which is
       exactly the kind of surface that looks broken. The count tells the user at a glance whether the
       layer is actually doing anything. */
    if (isAdjustment) {
      var _n = 0;
      if (clip.effects) {
        for (var _k in clip.effects) {
          if (!clip.effects.hasOwnProperty(_k)) continue;
          var _dv = (_k === 'gamma') ? 1 : 0;
          if (typeof clip.effects[_k] === 'number' && Math.abs(clip.effects[_k] - _dv) > 1e-6) _n++;
        }
      }
      el.style.background = 'repeating-linear-gradient(135deg, rgba(155,89,182,.34) 0 8px, rgba(230,126,34,.26) 8px 16px)';
      el.style.border = '1px solid rgba(155,89,182,.75)';
      var adjLabel = document.createElement('span');
      adjLabel.className = 've-clip-label';
      // clip.name is the UPLOADED FILE NAME (import.js / ve-media-browser / ve-media-gallery all set
      // name: file.name), so a file called `<img src=x onerror=...>.mp4` executed here. The editor is
      // served same-origin from apps/web, and a project carrying such a clip is opened by the other
      // side of collab / template sharing, which makes it stored XSS rather than self-XSS.
      // Every comparable label in the editor already escapes; these two lines were the exception.
      adjLabel.innerHTML = VE._veIcon('layers', 10) + ' ' + VE._esc(clip.name || 'Adjustment') +
        (_n ? ' <span style="opacity:.75">(' + _n + ')</span>' : ' <span style="opacity:.6">(off)</span>');
      el.appendChild(adjLabel);
      el.title = 'Adjustment layer: grades every track below it. Click to edit.';
    } else

    // Overlay clips: distinct color + icon based on fabric object type
    if (isOverlay) {
      var ovIcon = 'layers';
      if (clip._fabricType === 'gridCell') ovIcon = 'grid';
      else if (clip._fabricType === 'textbox' || clip._fabricType === 'i-text' || clip._fabricType === 'text') ovIcon = 'type';
      else if (clip._fabricType === 'gif') ovIcon = 'film';
      else if (clip._fabricType === 'sticker' || clip._fabricType === 'emoji') ovIcon = 'smile';
      else if (clip._fabricType === 'image') ovIcon = 'image';
      else if (clip._fabricType === 'path' || clip._fabricType === 'group') ovIcon = 'star';
      var label = document.createElement('span');
      label.className = 've-clip-label';
      label.innerHTML = VE._veIcon(ovIcon, 10) + ' ' + VE._esc(clip.name || 'Overlay'); // see the note above
      el.appendChild(label);
    } else {

    // Full-duration filmstrip. Only viewport tiles exist in DOM/cache; decoder is separate from
    // playback/export, so background thumbnails cannot seek either critical media element.
    if (clip.type === 'video') {
      var thumbStrip = document.createElement('div');
      thumbStrip.className = 've-clip-thumbs';
      VE._veRenderVirtualFilmstrip(clip, thumbStrip);
      el.appendChild(thumbStrip);
    }

    // Audio waveform — tile horizontally, never stretch
    if (isDubbingClip) VE._veEnsureDubbingWaveform(clip);
    if (clip.type === 'audio' && clip._waveformUrl) {
      if (isDubbingClip) {
        var dubWaveform = document.createElement('img');
        dubWaveform.className = 've-clip-waveform ve-clip-waveform--dubbing';
        dubWaveform.src = clip._waveformUrl;
        dubWaveform.alt = '';
        dubWaveform.draggable = false;
        el.appendChild(dubWaveform);
      } else {
        el.style.backgroundImage = 'url(' + clip._waveformUrl + ')';
        el.style.backgroundSize = '400px 80%';
        el.style.backgroundRepeat = 'repeat-x';
        el.style.backgroundPosition = 'left center';
      }
    }

    /* Grade badge. Resolve and Premiere both keep masks OFF the timeline (they are a property of the
       clip, managed in a panel) and put a single badge on the clip instead: Resolve a colour-wheel
       glyph, Premiere an fx. Without it a graded clip is indistinguishable from an ungraded one and
       the only way to find your work is to open every clip.
       Counts ACTIVE nodes: a chain of disabled nodes is not a graded clip. */
    if (VE._veNodeActiveCount) {
      var _gn = VE._veNodeActiveCount(clip);
      if (_gn > 0) {
        var gBadge = document.createElement('span');
        gBadge.className = 've-clip-grade';
        var _gw = VE._veNodeWindowCount ? VE._veNodeWindowCount(clip) : 0;
        gBadge.textContent = _gw > 0 ? ('◑ ' + _gn) : '◑';
        gBadge.title = _gn + ' color node' + (_gw > 0 ? ', ' + _gw + ' pencere' : '') +
          '\nClick to open Color Tools';
        gBadge.addEventListener('click', function (ev) {
          ev.stopPropagation();   // or the click also re-selects/moves the clip under it
          VE._veSelectedClips = [clip.id];
          if (window.VEColorTools && !VEColorTools.isOpen()) VEColorTools.open();
          else if (window.VEColorTools) VEColorTools.refresh();
        });
        el.appendChild(gBadge);
      }
    }

    // Multi-cam angle badge — a multicam clip is an ordinary video clip, so without this the
    // timeline gives no clue which angle a segment is showing (Premiere shows [MC n]).
    // Keys off mcAngles, never off a clip type.
    if (clip.mcAngles) {
      var mcBadge = document.createElement('span');
      mcBadge.className = 've-clip-mc';
      mcBadge.textContent = 'MC ' + ((clip.mcActive || 0) + 1);
      mcBadge.title = 'Multi-Cam: ' +
        ((clip.mcAngles[String(clip.mcActive || 0)] || {}).label || 'Kamera ' + ((clip.mcActive || 0) + 1));
      el.appendChild(mcBadge);
    }

    // SmartCam badge — a SmartCam clip is an ordinary video clip, so without this the timeline
    // gives no clue that this segment is a composite, or of whom. Keys off scLayout, never off a
    // clip type. Mirrors the multicam badge above.
    var _scCells = clip.scLayout && VE._veScBands ? VE._veScBands(clip) : null;
    if (_scCells && _scCells.length) {
      var scNames = [];
      (clip.scLayout.rows || []).forEach(function (r) {
        (r.cells || []).forEach(function (c) { scNames.push(c.label || ('Kamera ' + scNames.length)); });
      });
      if (!scNames.length && clip.scLayout.cells) {
        clip.scLayout.cells.forEach(function (c, i) { scNames.push(c.label || ('Kamera ' + (i + 1))); });
      }
      var scBadge = document.createElement('span');
      scBadge.className = 've-clip-sc';
      scBadge.textContent = 'SC ' + _scCells.length;
      scBadge.title = 'SmartCam: ' + scNames.join(' · ');
      el.appendChild(scBadge);
    }

    // Clip label
    var label = document.createElement('span');
    label.className = 've-clip-label';
    var labelText = clip.name || (clip.type === 'audio' ? '♪' : '');
    // Name the CAMERAS, not the source file: a SmartCam clip's identity is who is in it.
    if (_scCells && _scCells.length && scNames && scNames.length) labelText = scNames.join(' · ');
    if (VE._veProject._bgClipId === clip.id) labelText = '🖼 BG: ' + labelText;
    // Show loop indicator if clip extends beyond source duration
    if (clip.type === 'video' && clip._srcDuration && clip._srcDuration > 0) {
      var usedDur = clip.duration * (clip.speed || 1);
      if (usedDur > clip._srcDuration * 1.05) {
        var loopCount = Math.ceil(usedDur / clip._srcDuration);
        labelText += ' 🔁×' + loopCount;
      }
    }
    label.textContent = labelText;
    el.appendChild(label);

    } // end non-overlay

    // Trim handles
    var leftHandle = document.createElement('div');
    leftHandle.className = 've-clip-handle ve-clip-handle--left';
    el.appendChild(leftHandle);

    var rightHandle = document.createElement('div');
    rightHandle.className = 've-clip-handle ve-clip-handle--right';
    el.appendChild(rightHandle);

    // Apply CSS filters if set (only for non-overlay clips in timeline)
    if (!isOverlay) {
      var filterCSS = VE._veGetClipFilterCSS(clip);
      if (filterCSS) el.style.filter = filterCSS;
    }

    // Show transition indicator
    if (clip.transitions && clip.transitions.in && clip.transitions.in.type !== 'none') {
      var transIn = document.createElement('div');
      transIn.className = 've-clip-trans ve-clip-trans--in';
      transIn.title = clip.transitions.in.type;
      transIn.style.width = Math.max(4, Math.round((clip.transitions.in.duration || 0.5) * VE._veProject.zoom)) + 'px';
      el.appendChild(transIn);
    }
    if (clip.transitions && clip.transitions.out && clip.transitions.out.type !== 'none') {
      var transOut = document.createElement('div');
      transOut.className = 've-clip-trans ve-clip-trans--out';
      transOut.title = clip.transitions.out.type;
      transOut.style.width = Math.max(4, Math.round((clip.transitions.out.duration || 0.5) * VE._veProject.zoom)) + 'px';
      el.appendChild(transOut);
    }

    // Show transform indicator
    if (clip.transform && (clip.transform.flipH || clip.transform.flipV || clip.transform.rotation)) {
      var badge = document.createElement('div');
      badge.className = 've-clip-badge';
      var parts = [];
      if (clip.transform.rotation) parts.push(clip.transform.rotation + '\u00B0');
      if (clip.transform.flipH) parts.push('H');
      if (clip.transform.flipV) parts.push('V');
      badge.textContent = parts.join(' ');
      el.appendChild(badge);
    }

    // Show blend mode badge (Phase 13)
    if (clip.blendMode && clip.blendMode !== 'normal') {
      var blendBadge = document.createElement('div');
      blendBadge.className = 've-clip-badge ve-clip-badge--blend';
      blendBadge.textContent = clip.blendMode;
      el.appendChild(blendBadge);
    }

    // Show keyframe diamond indicators (click = select clip + seek to that keyframe)
    if (window.VEKeyframes && VEKeyframes.hasKeyframes(clip)) {
      var kfTimes = VEKeyframes.getAllKeyframeTimes(clip);
      kfTimes.forEach(function(t) {
        var diamond = document.createElement('div');
        diamond.className = 've-clip-keyframe';
        diamond.style.left = Math.round(t * VE._veProject.zoom) + 'px';
        diamond.title = 'Keyframe @ ' + t.toFixed(2) + 's';
        diamond.addEventListener('mousedown', function(e) {
          e.stopPropagation();
          VE._veSelectedClips = [clip.id];
          VE._veSeek(clip.startTime + t);
          VE._veRender();
        });
        el.appendChild(diamond);
      });
    }

    // ── Clip click → select ──
    el.addEventListener('mousedown', function(e) {
      if (e.target.classList.contains('ve-clip-handle--left') || e.target.classList.contains('ve-clip-handle--right')) {
        VE._veStartTrim(e, clip, track, e.target.classList.contains('ve-clip-handle--left') ? 'left' : 'right');
        return;
      }
      // Razor mode: split at click position instead of selecting
      if (VE._veRazorMode) {
        e.stopPropagation();
        VE._veRazorClick(e);
        return;
      }
      var clearedSubtitle = (VE._veSelectedCues || []).length > 0;
      // Selecting a CLIP drops the cue selection: one timeline selection kind at a time, so the
      // shared trash button and the Del key can never be aimed at the other one.
      VE._veSelectedCues = [];
      if (window.VESubtitleElement && VESubtitleElement.deselect) {
        clearedSubtitle = VESubtitleElement.deselect(true) || clearedSubtitle;
      } else if (VE._veSelectedCueId || VE._veSelectedSubtitleTrackId) {
        VE._veSelectedCueId = null;
        VE._veSelectedSubtitleTrackId = null;
        clearedSubtitle = true;
      }
      if (clearedSubtitle && window.VESubtitlePanel && VESubtitlePanel.syncSelection) {
        VESubtitlePanel.syncSelection(null, null);
      }
      // Right-click: preserve an existing multi-selection so the context-menu Delete can
      // bulk-remove ALL selected clips. Only collapse to this clip if it isn't already
      // selected (OS/NLE convention; matches the intent already in binding.js). Without this
      // the right-click's own mousedown reset _veSelectedClips to [clip.id], so Delete only
      // ever removed one clip. (Mirrors the cue handler's e.button guard above.)
      if (e.button === 2) {
        e.stopPropagation();
        if (VE._veSelectedClips.indexOf(clip.id) === -1) {
          VE._veSelectedClips = [clip.id];
          VE._veRender();
        } else if (clearedSubtitle) {
          VE._veRender();
        }
        return;
      }
      e.stopPropagation();
      if (e.ctrlKey) {
        // Ctrl+Click: toggle individual selection
        var idx = VE._veSelectedClips.indexOf(clip.id);
        if (idx >= 0) VE._veSelectedClips.splice(idx, 1);
        else VE._veSelectedClips.push(clip.id);
      } else if (e.shiftKey && VE._veSelectedClips.length > 0) {
        // Shift+Click: range select on same track
        var lastSelectedId = VE._veSelectedClips[VE._veSelectedClips.length - 1];
        var allClipIds = [];
        track.clips.forEach(function(c) { allClipIds.push(c.id); });
        var fromIdx = allClipIds.indexOf(lastSelectedId);
        var toIdx = allClipIds.indexOf(clip.id);
        if (fromIdx >= 0 && toIdx >= 0) {
          var lo = Math.min(fromIdx, toIdx);
          var hi = Math.max(fromIdx, toIdx);
          for (var ri = lo; ri <= hi; ri++) {
            if (VE._veSelectedClips.indexOf(allClipIds[ri]) < 0) {
              VE._veSelectedClips.push(allClipIds[ri]);
            }
          }
        } else {
          VE._veSelectedClips = [clip.id];
        }
      } else {
        // Plain click. Keep an existing multi-selection intact if this clip is part of it, so the
        // whole group can be dragged together (mirrors the right-click guard above; a click that
        // does not become a drag collapses to this clip on mouseup, in _veStartClipDrag).
        if (VE._veSelectedClips.indexOf(clip.id) === -1) {
          VE._veSelectedClips = [clip.id];
        }
      }
      VE._veRender();
      // Overlay clip → select the Fabric.js object on canvas too (its props show
      // via the normal object path). Media clip → dock its properties in the
      // right Properties panel (owner: single-click a video shows its settings).
      if (clip.type === 'adjustment') {
        // Its editor IS the adjustment panel; the media inspector has nothing to say about it.
        if (window.VEInspector && VEInspector.hideDocked) VEInspector.hideDocked();
        if (window.VEAdjustmentLayer) {
          VEAdjustmentLayer.setActiveLayer(clip.id);
          if (!VEAdjustmentLayer.isOpen()) VEAdjustmentLayer.show();
        }
      } else if (clip.type === 'overlay') {
        if (window.VEInspector && VEInspector.hideDocked) VEInspector.hideDocked();
        VE._veSelectOverlayObject(clip.id);
      } else {
        var _rpw = document.getElementById('rp-properties-wrap');
        if (_rpw && window.VEInspector && VEInspector.renderInto) VEInspector.renderInto(_rpw, clip.id);
        else if (window.VEInspector && VEInspector.isOpen()) VEInspector.show(clip.id);
      }
      VE._veStartClipDrag(e, clip, track);
    });

    // Double-click → open inspector panel (Phase 11)
    el.addEventListener('dblclick', function(e) {
      e.stopPropagation();
      if (window.VEInspector) VEInspector.toggle(clip.id);
    });

    // ── Power window bars (owner: "çizdiğimiz objeleri trackliste eklet özel öğe olarak") ──
    // Each drawn window is a timed item on its clip: coloured, named, click-to-manage in Renk
    // Araçları, and drag-to-retime for the ones the user scheduled ("5 saniye tutarım"). Positioned
    // in the CLIP's own pixel space (the strip is inside the clip element), so a window rides its
    // clip automatically. A whole-clip window (no tDur) spans the clip and is not draggable - there
    // is nothing to slide until it is given a duration.
    if (!isOverlay && clip.type === 'video' && clip.gradeNodes && clip.gradeNodes.length) {
      var _pz = VE._veProject.zoom;
      var strip = document.createElement('div');
      strip.className = 've-clip-pwstrip';
      var gi = 0, drew = false;
      clip.gradeNodes.forEach(function (nd, ni) {
        (nd.windows || []).forEach(function (win, wk) {
          var bar = document.createElement('div');
          bar.className = 've-clip-pwbar' + (win.enabled === false ? ' is-off' : '');
          bar.style.background = VE._vePwBarColor(gi);
          var s = win.tStart || 0;
          var timed = (win.tDur != null);
          var d = timed ? win.tDur : clip.duration;
          bar.style.left = Math.round(s * _pz) + 'px';
          bar.style.width = Math.max(6, Math.round(d * _pz)) + 'px';
          var nm = win.name || ((VE._vePwName ? VE._vePwName(win.shape) : 'Window') + ' ' + (gi + 1));
          var lbl = document.createElement('span');
          lbl.className = 've-clip-pwbar-lbl';
          lbl.textContent = nm;
          bar.appendChild(lbl);
          bar.title = nm + (timed ? '  ' + s.toFixed(1) + '-' + (s + d).toFixed(1) + 'sn' : '  (all clip)');
          // Edge handles: drag an edge to resize the window's time range (grabbing an edge of a
          // whole-clip window turns it into a timed one). The body drags to move the start.
          var hL = document.createElement('span'); hL.className = 've-clip-pwbar-h l';
          var hR = document.createElement('span'); hR.className = 've-clip-pwbar-h r';
          bar.appendChild(hL); bar.appendChild(hR);
          (function (nodeIdx, winIdx, w, canDrag) {
            bar.addEventListener('mousedown', function (e) {
              e.stopPropagation();   // never start the CLIP drag from a window bar
              VE._vePwBarSelect(clip.id, nodeIdx, winIdx);
              if (canDrag) VE._vePwBarDrag(e, clip, w, bar);
            });
            hL.addEventListener('mousedown', function (e) {
              e.stopPropagation();
              VE._vePwBarSelect(clip.id, nodeIdx, winIdx);
              VE._vePwBarResize(e, clip, w, bar, 'l');
            });
            hR.addEventListener('mousedown', function (e) {
              e.stopPropagation();
              VE._vePwBarSelect(clip.id, nodeIdx, winIdx);
              VE._vePwBarResize(e, clip, w, bar, 'r');
            });
          })(ni, wk, win, timed);
          strip.appendChild(bar);
          gi++; drew = true;
        });
      });
      if (drew) el.appendChild(strip);
    }

    return el;
  };

  // Stable palette for the timeline window bars, matching the Renk Araçları list dots.
  VE._vePwBarColor = function (i) {
    var C = ['#f2ff58', '#58d3ff', '#ff58a8', '#7dff58', '#ff9c58', '#b558ff', '#58ffd3', '#ff5858'];
    return C[i % C.length];
  };

  // Click a window bar -> select that clip + window and open Renk Araçları to manage it.
  VE._vePwBarSelect = function (clipId, nodeIdx, winIdx) {
    VE._veSelectedClips = [clipId];
    var clip = VE._findClipById ? VE._findClipById(clipId) : null;
    if (!clip) return;
    if (window.VEColorTools && !VEColorTools.isOpen()) VEColorTools.open();
    if (window.VEPowerWindows) {
      if (!VEPowerWindows.isOpen()) VEPowerWindows.open(clip);
      if (VEPowerWindows.selectNode) VEPowerWindows.selectNode(nodeIdx);
      if (VEPowerWindows.select) VEPowerWindows.select(winIdx);
    }
    if (window.VEColorTools && VEColorTools.isOpen()) VEColorTools.refresh();
  };

  // Drag a timed window bar to change its start (clip-relative seconds). Same px->sec mapping the
  // clip drag uses (dx / zoom). Clamped so the window stays inside its clip.
  VE._vePwBarDrag = function (e, clip, win, bar) {
    var z = VE._veProject.zoom, sx = e.clientX, origStart = win.tStart || 0;
    var dur = (win.tDur != null) ? win.tDur : clip.duration;
    function mv(ev) {
      var ns = Math.max(0, Math.min((clip.duration || dur) - dur, origStart + (ev.clientX - sx) / z));
      win.tStart = Math.round(ns * 100) / 100;
      bar.style.left = Math.round(win.tStart * z) + 'px';
      if (window.VEPowerWindows && VEPowerWindows.refreshUI) VEPowerWindows.refreshUI(clip);
      if (VE._veRenderPreviewFrame) VE._veRenderPreviewFrame();
    }
    function up() {
      document.removeEventListener('mousemove', mv);
      document.removeEventListener('mouseup', up);
      if (VE._vePushUndo) VE._vePushUndo('window retime');
      if (window.VEColorTools && VEColorTools.isOpen()) VEColorTools.refresh();
    }
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
    e.preventDefault();
  };

  /* Resize a window bar from an edge. `edge` = 'l' (move the start, keep the end) or 'r' (move the
     end, keep the start). Grabbing an edge of a WHOLE-CLIP window (no tDur) commits it to a timed
     window, because you have just given it a boundary. Minimum 0.2s so it can't collapse to nothing. */
  VE._vePwBarResize = function (e, clip, win, bar, edge) {
    var z = VE._veProject.zoom, sx = e.clientX, MIN = 0.2;
    var dur = clip.duration || 0;
    var s0 = win.tStart || 0;
    var e0 = (win.tDur != null) ? (s0 + win.tDur) : dur;   // effective end
    function apply(s, en) {
      s = Math.max(0, Math.min(dur - MIN, s));
      en = Math.max(s + MIN, Math.min(dur, en));
      win.tStart = Math.round(s * 100) / 100;
      win.tDur = Math.round((en - s) * 100) / 100;
      bar.style.left = Math.round(win.tStart * z) + 'px';
      bar.style.width = Math.max(6, Math.round(win.tDur * z)) + 'px';
      if (window.VEPowerWindows && VEPowerWindows.refreshUI) VEPowerWindows.refreshUI(clip);
      if (VE._veRenderPreviewFrame) VE._veRenderPreviewFrame();
    }
    function mv(ev) {
      var d = (ev.clientX - sx) / z;
      if (edge === 'l') apply(s0 + d, e0);   // move start
      else apply(s0, e0 + d);                // move end
    }
    function up() {
      document.removeEventListener('mousemove', mv);
      document.removeEventListener('mouseup', up);
      if (VE._vePushUndo) VE._vePushUndo('window resize');
      if (window.VEColorTools && VEColorTools.isOpen()) VEColorTools.refresh();
    }
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
    e.preventDefault();
  };

  VE._veUpdateTimeDisplay = function () {
    var fmt = VE._veTimecodeMode ? VE._veFormatTimecode : VE._veFormatTime;
    if (VE._veUi.timeDisplay) VE._veUi.timeDisplay.textContent = fmt(VE._veProject.playheadTime);
    if (VE._veUi.durationDisplay) VE._veUi.durationDisplay.textContent = fmt(VE._veProject.duration);
  };

  VE._veToggleTimecodeMode = function () {
    VE._veTimecodeMode = !VE._veTimecodeMode;
    VE._veUpdateTimeDisplay();
  };

  VE._veUpdatePlayhead = function () {
    // The one place every playhead move lands (seek, the playback tick, _veRender), so it is where the
    // on-canvas subtitle box is told to follow. It must never call back into _veRender.
    if (window.VESubtitleElement && VESubtitleElement.syncSelectionToTime) {
      try { VESubtitleElement.syncSelectionToTime(); } catch (e) {}
    }
    if (!VE._veUi.playhead) return;
    var px = Math.round(VE._veProject.playheadTime * VE._veProject.zoom);
    VE._veUi.playhead.style.transform = 'translateX(' + px + 'px)';
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'render', parent: 'video.video-editor', title: 'video-editor: render', mount: function () {}, unmount: function () {} });
  }
})();
