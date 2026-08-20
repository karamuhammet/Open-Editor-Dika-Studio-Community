/* Module: video/video-editor/events/binding — the master event-binding pass + ruler seek
   Sub-module of events — functions hang off VE (window.__ccVideoEditor, created by the
   video-editor parent); refs resolve through VE at call time, so load order is irrelevant.
   Split from the 1289-line events child. */

(function () {
  'use strict';
  var VE = window.__ccVideoEditor;
  if (!VE) return;

  VE._veBindEvents = function () {
    // Toolbar buttons
    var btnPlay = document.getElementById('ve-btn-play');
    if (btnPlay) btnPlay.addEventListener('click', VE._veTogglePlay);

    var btnPrev = document.getElementById('ve-btn-prev-frame');
    if (btnPrev) btnPrev.addEventListener('click', function() { VE._veSeek(VE._veFindPrevClipBoundary(VE._veProject.playheadTime)); });

    var btnNext = document.getElementById('ve-btn-next-frame');
    if (btnNext) btnNext.addEventListener('click', function() { VE._veSeek(VE._veFindNextClipBoundary(VE._veProject.playheadTime)); });

    var btnSplit = document.getElementById('ve-btn-split');
    if (btnSplit) btnSplit.addEventListener('click', VE._veSplitAtPlayhead);

    var btnEditMode = document.getElementById('ve-btn-edit-mode');
    if (btnEditMode) {
      btnEditMode.addEventListener('click', function() {
        var modes = ['normal', 'ripple', 'insert'];
        var labels = { normal: 'N', ripple: 'R', insert: 'I' };
        var titles = { normal: 'Normal mode', ripple: 'Ripple mode (shift clips on delete)', insert: 'Insert mode (push clips on add)' };
        var idx = modes.indexOf(VE._veEditMode);
        VE._veEditMode = modes[(idx + 1) % modes.length];
        var lbl = btnEditMode.querySelector('.ve-edit-mode-label');
        if (lbl) lbl.textContent = labels[VE._veEditMode] || 'N';
        btnEditMode.title = titles[VE._veEditMode] || 'Normal mode';
        btnEditMode.classList.toggle('active', VE._veEditMode !== 'normal');
      });
    }

    var btnDelete = document.getElementById('ve-btn-delete');
    if (btnDelete) btnDelete.addEventListener('click', VE._veDeleteSelected);

    var btnDuplicate = document.getElementById('ve-btn-duplicate');
    if (btnDuplicate) btnDuplicate.addEventListener('click', VE._veDuplicateSelected);

    var btnBringFront = document.getElementById('ve-btn-bring-front');
    if (btnBringFront) btnBringFront.addEventListener('click', function() { VE._veMoveClipTrack(-1); });

    var btnSendBack = document.getElementById('ve-btn-send-back');
    if (btnSendBack) btnSendBack.addEventListener('click', function() { VE._veMoveClipTrack(1); });

    // Preview controls (Phase 5)
    var btnSeekBack = document.getElementById('ve-btn-seek-back');
    if (btnSeekBack) btnSeekBack.addEventListener('click', function() {
      VE._veSeek(Math.max(0, VE._veProject.playheadTime - 5));
    });
    var btnSeekFwd = document.getElementById('ve-btn-seek-fwd');
    if (btnSeekFwd) btnSeekFwd.addEventListener('click', function() {
      VE._veSeek(Math.min(VE._veProject.duration, VE._veProject.playheadTime + 5));
    });
    var btnLoop = document.getElementById('ve-btn-loop');
    if (btnLoop) {
      btnLoop.addEventListener('click', function() {
        VE._vePlayback.loop = !VE._vePlayback.loop;
        btnLoop.classList.toggle('active', VE._vePlayback.loop);
      });
    }
    var rateSelect = document.getElementById('ve-rate-select');
    if (rateSelect) {
      rateSelect.addEventListener('change', function() {
        VE._vePlayback.speed = parseFloat(rateSelect.value) || 1;
      });
    }
    /* Fullscreen preview. The button used to just call requestFullscreen() and stop there, which
       produced a small picture in the top-left corner of a black screen: the element fills the
       screen, but the Fabric canvas inside keeps its fixed project-resolution pixel size and its
       top-left flow position. The canvas cannot be stretched with CSS (its pixel size IS the render
       resolution), so it is centred by CSS and SCALED here, where the intrinsic size is known. */
    function _veFitFullscreen() {
      var stage = document.getElementById('card-stage');
      if (!stage) return;
      var wrap = stage.querySelector('.canvas-container');
      if (!wrap) return;
      if (document.fullscreenElement !== stage) { wrap.style.transform = ''; return; }
      var cw = wrap.offsetWidth, ch = wrap.offsetHeight;
      if (!cw || !ch) return;
      // Contain, never crop, and never upscale past a sane limit on a tiny canvas.
      var scale = Math.min(window.innerWidth / cw, window.innerHeight / ch);
      if (!isFinite(scale) || scale <= 0) scale = 1;
      wrap.style.transform = 'scale(' + scale + ')';
    }
    VE._veFitFullscreen = _veFitFullscreen;

    if (!VE._veFsBound) {
      VE._veFsBound = true;
      document.addEventListener('fullscreenchange', _veFitFullscreen);
      window.addEventListener('resize', function () {
        if (document.fullscreenElement) _veFitFullscreen();
      });
    }

    var btnFullscreen = document.getElementById('ve-btn-fullscreen');
    if (btnFullscreen) {
      btnFullscreen.addEventListener('click', function() {
        // Fullscreen the card-stage (which contains the Fabric canvas with video backgroundImage)
        var previewEl = document.getElementById('card-stage') || document.getElementById('card-stage-container');
        if (!previewEl) return;
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          previewEl.requestFullscreen().then(_veFitFullscreen).catch(function() {});
        }
      });
    }

    var programMonitor = document.getElementById('ve-btn-program-monitor');
    if (programMonitor) programMonitor.addEventListener('click', VE._veOpenProgramMonitor);

    var timelineFocus = document.getElementById('ve-btn-timeline-focus');
    if (timelineFocus) timelineFocus.addEventListener('click', VE._veToggleTimelineFocus);

    // Zoom
    var zoomIn = document.getElementById('ve-zoom-in');
    if (zoomIn) zoomIn.addEventListener('click', function() { VE._veSetZoom(VE._veProject.zoom * 1.25); });

    var zoomOut = document.getElementById('ve-zoom-out');
    if (zoomOut) zoomOut.addEventListener('click', function() { VE._veSetZoom(VE._veProject.zoom / 1.25); });

    var zoomFit = document.getElementById('ve-zoom-fit');
    if (zoomFit) zoomFit.addEventListener('click', VE._veFitProjectZoom);

    var followPlayhead = document.getElementById('ve-follow-playhead');
    if (followPlayhead) followPlayhead.addEventListener('click', function() {
      VE._veSetViewportMode('follow');
      if (typeof VE._veAutoScrollPlayhead === 'function') VE._veAutoScrollPlayhead(true);
    });
    if (typeof VE._veSetViewportMode === 'function') VE._veSetViewportMode(VE._veViewportMode);

    var exportBtn = document.getElementById('ve-btn-export');
    if (exportBtn) exportBtn.addEventListener('click', function() {
      VE._veShowExportModal();
    });

    // ── New toolbar button bindings ──
    var btnRazor = document.getElementById('ve-btn-razor');
    if (btnRazor) btnRazor.addEventListener('click', function() { VE._veToggleRazorMode(); });

    var btnSnap = document.getElementById('ve-btn-snap');
    if (btnSnap) btnSnap.addEventListener('click', function() { VE._veToggleSnap(); });

    // ── Tools dropdown toggle ──
    var toolsTrigger = document.getElementById('ve-tools-trigger');
    var toolsMenu = document.getElementById('ve-tools-menu');
    if (toolsTrigger && toolsMenu) {
      var _veCloseToolsMenu = function() {
        toolsMenu.classList.remove('ve-tools-menu--open');
        toolsTrigger.classList.remove('ve-tools-trigger--open');
      };
      var _vePositionToolsMenu = function() {
        var rect = toolsTrigger.getBoundingClientRect();
        toolsMenu.style.position = 'fixed';
        toolsMenu.style.left = Math.max(6, rect.right - 260) + 'px';
        // Open upward: pin the menu's bottom just above the trigger.
        toolsMenu.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
        toolsMenu.style.top = 'auto';
        // Cap height to the space above the trigger so it never runs off the
        // top of the viewport, and force internal scroll for the overflow.
        toolsMenu.style.maxHeight = Math.max(160, rect.top - 18) + 'px';
        toolsMenu.style.overflowY = 'auto';
      };
      toolsTrigger.addEventListener('click', function(e) {
        e.stopPropagation();
        var willOpen = !toolsMenu.classList.contains('ve-tools-menu--open');
        if (willOpen) {
          // Portal the menu to <body> so position:fixed is resolved against the
          // viewport (a transformed ancestor on the timeline/canvas would break
          // fixed coords) AND so it escapes the canvas-area wheel-block that was
          // eating its scroll. Listeners stay attached to the node, so they move
          // with it.
          if (toolsMenu.parentNode !== document.body) document.body.appendChild(toolsMenu);
          toolsMenu.classList.add('ve-tools-menu--open');
          toolsTrigger.classList.add('ve-tools-trigger--open');
          _vePositionToolsMenu();
        } else {
          _veCloseToolsMenu();
        }
      });
      // Close dropdown when clicking a menu item
      toolsMenu.addEventListener('click', function(e) {
        if (e.target.closest('.ve-tools-item')) _veCloseToolsMenu();
      });
      // Close on any press outside the menu/trigger (left OR right button), so a
      // plain click or a right-click anywhere dismisses it.
      var _veCloseTools = function(e) {
        if (toolsTrigger.contains(e.target) || toolsMenu.contains(e.target)) return;
        _veCloseToolsMenu();
      };
      document.addEventListener('mousedown', _veCloseTools);
      document.addEventListener('contextmenu', _veCloseTools);
      // Reposition while open if the window resizes.
      window.addEventListener('resize', function() {
        if (toolsMenu.classList.contains('ve-tools-menu--open')) _vePositionToolsMenu();
      });
    }

    var btnMarker = document.getElementById('ve-btn-marker');
    if (btnMarker) btnMarker.addEventListener('click', function() {
      VE._veAddMarker(VE._veProject.playheadTime, 'Marker');
      VE._veRender();
    });

    // Video Scopes: the panel owns its own DOM, geometry, drag, resize and pop-out (like the
    // multicam monitor), so this is a plain toggle. The previous handler built a host div here and
    // hand-styled it inline, which is why the panel could never be dragged or popped out.
    var btnScopes = document.getElementById('ve-btn-scopes');
    if (btnScopes) btnScopes.addEventListener('click', function() {
      if (!window.VEAdvancedFeatures || !VEAdvancedFeatures.toggleScopes) return;
      VEAdvancedFeatures.toggleScopes();
      btnScopes.classList.toggle('active', !!VEAdvancedFeatures.isScopesOpen());
    });

    var btnEffects = document.getElementById('ve-btn-effects');
    if (btnEffects) btnEffects.addEventListener('click', function() {
      if (VE._veSelectedClips.length === 1 && window.VEInspector) {
        VEInspector.toggle(VE._veSelectedClips[0]);
      } else if (VE._veSelectedClips.length === 0) {
        if (typeof showToast === 'function') showToast('Select a clip first');
      }
    });

    var btnMediaBrowser = document.getElementById('ve-btn-media-browser');
    if (btnMediaBrowser) btnMediaBrowser.addEventListener('click', function() {
      if (window.VEMediaBrowser) {
        VEMediaBrowser.toggle();
      } else if (window.VEMediaGallery) {
        VEMediaGallery.toggle();
      } else {
        VE._veOpenFilePicker();
      }
    });

    // ── Scene Detection button ──
    var btnSceneDetect = document.getElementById('ve-btn-scene-detect');
    if (btnSceneDetect) btnSceneDetect.addEventListener('click', function() {
      if (!window.VEAdvancedFeatures || !VEAdvancedFeatures.SceneDetector) {
        if (typeof showToast === 'function') showToast('Scene detection not available', 'error');
        return;
      }
      // Find first selected video clip, or first video clip in project
      var targetClip = null;
      if (VE._veSelectedClips.length) {
        targetClip = VE._findClipById(VE._veSelectedClips[0]);
      }
      if (!targetClip || targetClip.type !== 'video') {
        VE._veProject.tracks.forEach(function(t) {
          t.clips.forEach(function(c) { if (!targetClip && c.type === 'video') targetClip = c; });
        });
      }
      if (!targetClip) { if (typeof showToast === 'function') showToast('No video clip found'); return; }
      var videoEl = VE._vePlayback.videoPool[targetClip.id];
      if (!videoEl) { if (typeof showToast === 'function') showToast('Video not loaded'); return; }
      btnSceneDetect.classList.add('active');
      if (typeof showToast === 'function') showToast('Detecting scenes...');
      var detector = new VEAdvancedFeatures.SceneDetector({ threshold: 30, minSceneLength: 0.5 });
      detector.analyzeVideo(videoEl, function(scenes) {
        btnSceneDetect.classList.remove('active');
        if (!scenes || !scenes.length) { if (typeof showToast === 'function') showToast('No scene cuts detected'); return; }
        // Add chapter markers at each scene boundary
        scenes.forEach(function(scene, idx) {
          if (idx > 0) {
            VE._veAddMarker(scene.start, 'Scene ' + (idx + 1), { type: 'chapter', color: '#81c784' });
          }
        });
        if (typeof showToast === 'function') showToast(scenes.length + ' scenes detected — markers added');
        VE._veRender();
      });
    });

    // ── Silence cut button (detect -> range markers -> one-click cut; ve-silence-cut) ──
    var btnSilence = document.getElementById('ve-btn-silence-cut');
    if (btnSilence) btnSilence.addEventListener('click', function() {
      if (!window.VESilenceCut) {
        if (typeof showToast === 'function') showToast('Silence tool could not be loaded', 'error');
        return;
      }
      VESilenceCut.run();
    });

    // ── Stabilize button ──
    var btnStabilize = document.getElementById('ve-btn-stabilize');
    if (btnStabilize) btnStabilize.addEventListener('click', function() {
      if (!window.VEAdvancedFeatures || !VEAdvancedFeatures.VideoStabilizer) {
        if (typeof showToast === 'function') showToast('Stabilization not available', 'error');
        return;
      }
      if (!VE._veSelectedClips.length) { if (typeof showToast === 'function') showToast('Select a video clip first'); return; }
      var clip = VE._findClipById(VE._veSelectedClips[0]);
      if (!clip || clip.type !== 'video') { if (typeof showToast === 'function') showToast('Select a video clip'); return; }
      var videoEl = VE._vePlayback.videoPool[clip.id];
      if (!videoEl) { if (typeof showToast === 'function') showToast('Video not loaded'); return; }
      btnStabilize.classList.add('active');
      if (typeof showToast === 'function') showToast('Analyzing motion for stabilization...');
      var stabilizer = new VEAdvancedFeatures.VideoStabilizer({ smoothing: 10, cropZoom: 1.1 });
      stabilizer.analyze(videoEl, function(frameCount) {
        btnStabilize.classList.remove('active');
        if (frameCount > 0) {
          clip._stabilizer = stabilizer;
          clip._stabilized = true;
          if (typeof showToast === 'function') showToast('Stabilization ready: ' + frameCount + ' frames analyzed');
        } else {
          if (typeof showToast === 'function') showToast('Stabilization analysis failed', 'error');
        }
        VE._veRender();
      });
    });

    // ── Camera Recorder (its own module; deliberately not wired to the multicam monitor) ──
    var btnRecorder = document.getElementById('ve-btn-recorder');
    if (btnRecorder) btnRecorder.addEventListener('click', function() {
      if (window.VERecorder) VERecorder.toggle();
    });

    // ── Multi-Cam ──
    var btnMcCreate = document.getElementById('ve-btn-mc-create');
    if (btnMcCreate) btnMcCreate.addEventListener('click', function() {
      if (window.VEMulticam) VEMulticam.showCreate();
    });

    var btnMcMonitor = document.getElementById('ve-btn-mc-monitor');
    if (btnMcMonitor) btnMcMonitor.addEventListener('click', function() {
      if (window.VEMulticamMonitor) VEMulticamMonitor.toggle();
    });

    // ── SmartCam: one shot, N virtual cameras (docs/smartcam-plan.md) ──
    var btnSmartCam = document.getElementById('ve-btn-smartcam');
    if (btnSmartCam) btnSmartCam.addEventListener('click', function() {
      if (window.VESmartCam) VESmartCam.toggle();
    });

    // ── LUT Browser button ──
    var btnLutBrowser = document.getElementById('ve-btn-lut-browser');
    if (btnLutBrowser) btnLutBrowser.addEventListener('click', function() {
      VE._veShowLutBrowser();
    });

    // ── Renk Araçları: the floating toolbar for local grading (power windows) ──
    var btnColorTools = document.getElementById('ve-btn-color-tools');
    if (btnColorTools) btnColorTools.addEventListener('click', function () {
      if (window.VEColorTools) VEColorTools.toggle();
    });

    // ── Plugin Manager button ──
    var btnPlugins = document.getElementById('ve-btn-plugins');
    if (btnPlugins) btnPlugins.addEventListener('click', function() {
      VE._veShowPluginManager();
    });

    // ── Transitions Browser (Faz 2) ──
    var btnTransBrowser = document.getElementById('ve-btn-transitions-browser');
    if (btnTransBrowser) btnTransBrowser.addEventListener('click', function() {
      if (window.VETransitionsBrowser) VETransitionsBrowser.toggle();
    });

    // ── Effects Library (Faz 3) ──
    var btnEffectsLib = document.getElementById('ve-btn-effects-lib');
    if (btnEffectsLib) btnEffectsLib.addEventListener('click', function() {
      if (window.VEEffectsLibrary) VEEffectsLibrary.toggle();
    });

    // ── Text Templates (Faz 4) ──
    var btnTextTpl = document.getElementById('ve-btn-text-templates');
    if (btnTextTpl) btnTextTpl.addEventListener('click', function() {
      if (window.VETextTemplates) VETextTemplates.toggle();
    });

    // ── Audio Mixer (Faz 1) ──
    var btnAudioMixer = document.getElementById('ve-btn-audio-mixer');
    if (btnAudioMixer) btnAudioMixer.addEventListener('click', function() {
      if (window.VEAudioMixer) VEAudioMixer.toggle();
    });

    // ── Audio FX Presets (Faz 5) ──
    var btnAudioFx = document.getElementById('ve-btn-audio-fx');
    if (btnAudioFx) btnAudioFx.addEventListener('click', function() {
      if (window.VEAudioFxPresets) VEAudioFxPresets.toggle();
    });

    // ── Auto Subtitle (AI, on-device Whisper) ──
    var btnAutoSub = document.getElementById('ve-btn-auto-subtitle');
    if (btnAutoSub) btnAutoSub.addEventListener('click', function() {
      if (window.VEAutoSubtitle) VEAutoSubtitle.showModal();
    });

    // Seslendirme (TTS) and Dublaj are SEPARATE panels (owner: modları ayır). BOTH live in the Tools
    // menu now (owner: "ikisini de ekle oraya"); Dublaj is also on a clip's right-click + inspector.
    var btnTts = document.getElementById('ve-btn-dublaj');
    if (btnTts) btnTts.addEventListener('click', function() { if (window.VEDubbing) VEDubbing.showTts(); });
    var btnDub = document.getElementById('ve-btn-dublaj-video');
    if (btnDub) btnDub.addEventListener('click', function() { if (window.VEDubbing) VEDubbing.showDublaj(); });

    // ── Speed Curve (Faz 7) ──
    var btnSpeedCurve = document.getElementById('ve-btn-speed-curve');
    if (btnSpeedCurve) btnSpeedCurve.addEventListener('click', function() {
      if (window.VESpeedCurve) VESpeedCurve.toggle();
    });

    // ── Keyframe Graph Editor (Faz 8) ──
    var btnKFEditor = document.getElementById('ve-btn-keyframe-editor');
    if (btnKFEditor) btnKFEditor.addEventListener('click', function() {
      if (window.VEKeyframeEditor) VEKeyframeEditor.toggle();
    });

    // ── Adjustment Layer (Faz 9) ──
    var btnAdjLayer = document.getElementById('ve-btn-adjustment-layer');
    if (btnAdjLayer) btnAdjLayer.addEventListener('click', function() {
      if (window.VEAdjustmentLayer) VEAdjustmentLayer.toggle();
    });

    // Ruler click → seek
    if (VE._veUi.ruler) {
      VE._veUi.ruler.addEventListener('mousedown', function(e) {
        VE._veRulerSeek(e);
        function onMove(ev) { VE._veRulerSeek(ev); }
        function onUp() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    }

    // Playhead drag
    if (VE._veUi.playhead) {
      VE._veUi.playhead.addEventListener('mousedown', function(e) {
        e.stopPropagation();
        function onMove(ev) { VE._veRulerSeek(ev); }
        function onUp() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    }

    // Resize handle (drag to resize panel)
    if (VE._veUi.resizeHandle) {
      VE._veUi.resizeHandle.addEventListener('mousedown', function(e) {
        e.preventDefault();
        var startY = e.clientY;
        var startH = VE._veUi.panelHeight;

        function onMove(ev) {
          var dy = startY - ev.clientY;
          var newH = Math.max(VE.MIN_PANEL_HEIGHT, Math.min(window.innerHeight * 0.6, startH + dy));
          VE._veUi.panelHeight = newH;
          VE._veUi.host.style.height = newH + 'px';
          VE._veSyncLayoutPadding();
        }

        function onUp() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    }

    // Ctrl+Scroll for zoom on timeline
    var scrollWrap = document.getElementById('ve-scroll-wrap');
    if (scrollWrap) {
      scrollWrap.addEventListener('wheel', function(e) {
        if (e.ctrlKey) {
          e.preventDefault();
          VE._veSetZoom(VE._veProject.zoom * (e.deltaY > 0 ? (1 / 1.12) : 1.12), e.clientX);
        } else if (typeof VE._veSetViewportMode === 'function') {
          VE._veSetViewportMode('free');
        }
      }, { passive: false });
      scrollWrap.addEventListener('pointerdown', function () {
        if (typeof VE._veSetViewportMode === 'function') VE._veSetViewportMode('free');
      });
    }

    // Click on empty track area → deselect clips OR start marquee selection
    if (VE._veUi.tracksContainer) {
      VE._veUi.tracksContainer.addEventListener('mousedown', function(e) {
        // A cue segment stops propagation itself, so this is belt-and-braces: a marquee must never
        // start from a press ON a segment, or the press would both drag the cue and rubber-band.
        if (!e.target.closest('.ve-clip') && !e.target.closest('.ve-cue-seg')) {
          // Razor mode: split at click position
          if (VE._veRazorMode) {
            VE._veRazorClick(e);
            return;
          }
          // Start marquee rubber band selection
          var container = VE._veUi.tracksContainer;
          var rect = container.getBoundingClientRect();
          var startX = e.clientX;
          var startY = e.clientY;
          var marquee = document.createElement('div');
          marquee.className = 've-marquee';
          marquee.style.cssText = 'position:fixed;border:1px solid var(--gold,#f2ff58);' +
            'background:rgba(242, 255, 88,0.1);pointer-events:none;z-index:101;display:none;';
          document.body.appendChild(marquee);
          var moved = false;

          function onMove(ev) {
            moved = true;
            var x1 = Math.min(startX, ev.clientX);
            var y1 = Math.min(startY, ev.clientY);
            var x2 = Math.max(startX, ev.clientX);
            var y2 = Math.max(startY, ev.clientY);
            marquee.style.display = 'block';
            marquee.style.left = x1 + 'px';
            marquee.style.top = y1 + 'px';
            marquee.style.width = (x2 - x1) + 'px';
            marquee.style.height = (y2 - y1) + 'px';
          }

          function onUp(ev) {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            marquee.remove();

            var clearedSubtitle = false;
            if (window.VESubtitleElement && VESubtitleElement.deselect) {
              clearedSubtitle = VESubtitleElement.deselect(true);
            } else if (VE._veSelectedCueId || VE._veSelectedSubtitleTrackId) {
              VE._veSelectedCueId = null;
              VE._veSelectedSubtitleTrackId = null;
              clearedSubtitle = true;
            }
            if (clearedSubtitle && window.VESubtitlePanel && VESubtitlePanel.syncSelection) {
              VESubtitlePanel.syncSelection(null, null);
            }

            if (moved) {
              // Find all clips within the marquee rectangle
              var x1 = Math.min(startX, ev.clientX) - rect.left + (container.scrollLeft || 0);
              var x2 = Math.max(startX, ev.clientX) - rect.left + (container.scrollLeft || 0);
              var y1 = Math.min(startY, ev.clientY) - rect.top + (container.parentElement ? container.parentElement.scrollTop : 0);
              var y2 = Math.max(startY, ev.clientY) - rect.top + (container.parentElement ? container.parentElement.scrollTop : 0);
              var timeStart = x1 / VE._veProject.zoom;
              var timeEnd = x2 / VE._veProject.zoom;
              var trackStart = Math.floor(y1 / VE.TRACK_HEIGHT);
              var trackEnd = Math.floor(y2 / VE.TRACK_HEIGHT);

              var selected = [];
              // Subtitle CUES are swept by the same rectangle. They were not, so a rubber band drawn
              // over a subtitle lane came back with nothing selected (owner: "tut çek yap toplu
              // seçemiyorum"). Same hit test as a clip: overlap in time, inside the lane range.
              var selectedCues = [];
              VE._veProject.tracks.forEach(function(track, tIdx) {
                if (tIdx < trackStart || tIdx > trackEnd) return;
                track.clips.forEach(function(c) {
                  var cs = c.startTime;
                  var ce = c.startTime + c.duration;
                  if (ce > timeStart && cs < timeEnd) {
                    selected.push(c.id);
                  }
                });
                (track.cues || []).forEach(function(cue) {
                  var qs = cue.startTime || 0;
                  var qe = cue.endTime || qs;
                  if (qe > timeStart && qs < timeEnd) selectedCues.push(cue.id);
                });
              });
              // One kind at a time: a mixed bag would make Delete ambiguous. Cues win when the band
              // caught any, because a subtitle lane holds nothing else.
              if (selectedCues.length) {
                VE._veSelectedClips = [];
                VE._veSelectedCues = selectedCues;
                if (selectedCues.length === 1) {
                  var hit = VE._veFindCueById(selectedCues[0]);
                  if (hit && window.VESubtitleElement && VESubtitleElement.selectTrack) VESubtitleElement.selectTrack(hit.track, hit.cue.id);
                }
              } else {
                VE._veSelectedClips = selected;
                VE._veSelectedCues = [];
              }
            } else {
              // Simple click on empty → deselect
              VE._veSelectedClips = [];
              VE._veSelectedCues = [];
            }
            if (window.VEInspector) { VEInspector.hide(); if (VEInspector.hideDocked) VEInspector.hideDocked(); }
            VE._veRender();
          }

          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        }
      });
    }

    // Global drag-drop on host
    if (VE._veUi.host) {
      VE._veUi.host.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      });
      VE._veUi.host.addEventListener('drop', function(e) {
        e.preventDefault();
        // Drop on host (not on a specific track) → use first video track
        if (!e.target.closest('.ve-track-lane')) {
          var firstTrack = VE._veProject.tracks[0];
          if (firstTrack) VE._veHandleDrop(e, firstTrack);
        }
      });

      // Right-click context menu on timeline host
      VE._veUi.host.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        e.stopPropagation();

        var old = document.getElementById('ve-ctx-menu');
        if (old) old.remove();

        var clipEl = e.target.closest('.ve-clip');
        var cueEl = clipEl ? null : e.target.closest('.ve-cue-seg');
        var clipId = null;
        var cueId = null;

        if (clipEl) {
          clipId = clipEl.getAttribute('data-clip-id');
          if (VE._veSelectedClips.indexOf(clipId) === -1) {
            VE._veSelectedClips = [clipId];
            VE._veRender();
          }
        } else if (cueEl) {
          // A cue segment had NO context menu at all: right-clicking a subtitle opened the generic
          // timeline menu, which offers nothing that touches a cue. The segment's own mousedown
          // already claimed the selection (and kept an existing group), so only re-render if this
          // press had to take it.
          cueId = cueEl.getAttribute('data-cue-id');
          if (!VE._veCueSelected(cueId)) {
            VE._veSetCueSelection([cueId], cueId, cueEl.getAttribute('data-track-id'));
            VE._veRender();
          }
        }

        var menu = document.createElement('div');
        menu.id = 've-ctx-menu';
        menu.className = 've-ctx-menu';

        var cueItems = '';
        if (cueId) {
          var _ctxHit = VE._veFindCueById(cueId);
          var _cueCount = (VE._veSelectedCues || []).length || 1;
          var _ph = VE._veProject.playheadTime;
          var _canSplit = !!(_ctxHit && _ph > _ctxHit.cue.startTime + 0.05 && _ph < (_ctxHit.cue.endTime || 0) - 0.05);
          var _canMerge = !!(_ctxHit && _ctxHit.track.cues[_ctxHit.index + 1]);
          var _cueLocked = !!(_ctxHit && _ctxHit.track.locked);
          cueItems =
            '<div class="ve-ctx-label">' + (_cueCount > 1 ? (_cueCount + ' subtitles') : 'Subtitle') + '</div>' +
            '<button class="ve-ctx-item" data-action="cue-edit">' + VE._veIcon('captions', 14) + ' Edit text</button>' +
            (_cueCount === 1 && _canSplit && !_cueLocked ? '<button class="ve-ctx-item" data-action="cue-split">' + VE._veIcon('scissors', 14) + ' Split at playhead</button>' : '') +
            (_cueCount === 1 && _canMerge && !_cueLocked ? '<button class="ve-ctx-item" data-action="cue-merge">' + VE._veIcon('git-merge', 14) + ' Merge with next</button>' : '') +
            (_cueCount === 1 && !_cueLocked ? '<button class="ve-ctx-item" data-action="cue-duplicate">' + VE._veIcon('copy', 14) + ' Duplicate</button>' : '') +
            '<button class="ve-ctx-item" data-action="cue-select-track">' + VE._veIcon('layers', 14) + ' Select all on this track</button>' +
            '<div class="ve-ctx-divider"></div>' +
            '<button class="ve-ctx-item ve-ctx-danger" data-action="cue-delete">' + VE._veIcon('trash-2', 14) + ' Delete' + (_cueCount > 1 ? (' (' + _cueCount + ')') : '') + '</button>' +
            '<div class="ve-ctx-divider"></div>';
        }

        var clipItems = '';
        if (clipId) {
          // Find the clip object to check type
          var _ctxClip = null;
          VE._veProject.tracks.forEach(function(t) {
            t.clips.forEach(function(c) { if (c.id === clipId) _ctxClip = c; });
          });
          var isMediaClip = _ctxClip && (_ctxClip.type === 'video' || (_ctxClip.type === 'overlay' && _ctxClip._fabricType === 'image'));
          var isBgClip = VE._veProject._bgClipId === clipId;

          // Multi-cam: both Premiere and Resolve put "change this cut's angle" and Flatten on
          // the timeline clip's context menu, so that is where hands reach for it. Keys off
          // mcAngles, never a clip type.
          if (_ctxClip && _ctxClip.mcAngles) {
            var _mcAct = _ctxClip.mcActive || 0;
            Object.keys(_ctxClip.mcAngles).sort(function (a, b) { return (+a) - (+b); })
              .forEach(function (k) {
                var ang = _ctxClip.mcAngles[k] || {};
                clipItems += '<button class="ve-ctx-item" data-action="mc-angle" data-mc="' + k + '">' +
                  VE._veIcon((+k) === _mcAct ? 'check' : 'video', 14) + ' ' +
                  VE._esc(ang.label || ('Kamera ' + ((+k) + 1))) + '</button>';
              });
            clipItems += '<button class="ve-ctx-item" data-action="mc-flatten">' +
                VE._veIcon('layers', 14) + ' Multi-Cam: Flatten</button>' +
              '<div class="ve-ctx-divider"></div>';
          }

          /* SAVE THE FILE. A clip carrying real media (an import, a recording, a generated dub) had
             no way out of the editor at all: it could be heard and never kept. Offered only when
             the clip HAS media - an overlay clip is a fabric object, there is no file behind it. */
          var _ctxHasMedia = !!(_ctxClip && (_ctxClip.type === 'audio' || _ctxClip.type === 'video'));
          if (_ctxHasMedia) {
            clipItems += '<button class="ve-ctx-item" data-action="download-media">' + VE._veIcon('download', 14) +
              (_ctxClip.type === 'audio' ? ' Download audio' : ' Download video') + '</button>';
          }
          clipItems +=
            '<button class="ve-ctx-item" data-action="inspector">' + VE._veIcon('sliders', 14) + ' Inspector</button>' +
            '<button class="ve-ctx-item" data-action="split">' + VE._veIcon('scissors', 14) + ' Split</button>' +
            '<button class="ve-ctx-item" data-action="copy">' + VE._veIcon('copy', 14) + ' Copy</button>' +
            '<button class="ve-ctx-item" data-action="paste">' + VE._veIcon('clipboard', 14) + ' Paste</button>' +
            '<button class="ve-ctx-item" data-action="delete">' + VE._veIcon('trash-2', 14) + ' Delete</button>' +
            '<div class="ve-ctx-divider"></div>';

          // Background options for video / image clips
          if (isMediaClip) {
            if (isBgClip) {
              clipItems +=
                '<button class="ve-ctx-item" data-action="remove-bg">' + VE._veIcon('x-circle', 14) + ' Remove from Background</button>' +
                '<div class="ve-ctx-divider"></div>';
            } else {
              clipItems += '<button class="ve-ctx-item" data-action="set-bg">' + VE._veIcon('image', 14) + ' Set as Background</button>' +
                '<div class="ve-ctx-divider"></div>';
            }
          }

          clipItems +=
            '<button class="ve-ctx-item" data-action="detach-audio">Detach Audio</button>' +
            '<button class="ve-ctx-item" data-action="flip-h">' + VE._veIcon('flip-horizontal', 14) + ' Flip Horizontal</button>' +
            '<button class="ve-ctx-item" data-action="flip-v">' + VE._veIcon('flip-vertical', 14) + ' Flip Vertical</button>' +
            '<button class="ve-ctx-item" data-action="rotate-cw">' + VE._veIcon('rotate-cw', 14) + ' Rotate 90&deg;</button>' +
            '<div class="ve-ctx-divider"></div>' +
            '<div class="ve-ctx-label">Speed</div>' +
            '<div class="ve-ctx-speed-row">' +
              '<button class="ve-ctx-speed" data-speed="0.5">0.5x</button>' +
              '<button class="ve-ctx-speed" data-speed="1">1x</button>' +
              '<button class="ve-ctx-speed" data-speed="1.5">1.5x</button>' +
              '<button class="ve-ctx-speed" data-speed="2">2x</button>' +
            '</div>' +
            '<div class="ve-ctx-divider"></div>' +
            '<button class="ve-ctx-item" data-action="trans-in">' + VE._veIcon('arrow-right-circle', 14) + ' Transition In…</button>' +
            '<button class="ve-ctx-item" data-action="trans-out">' + VE._veIcon('arrow-left-circle', 14) + ' Transition Out…</button>' +
            '<div class="ve-ctx-divider"></div>';

          // AI features submenu (only for video clips)
          if (_ctxClip && _ctxClip.type === 'video') {
            var _hasBGR = window.VEBGRemoval;
            var _hasDN = window.VEDenoise;
            var _hasFT = window.VEAdvancedFeatures && VEAdvancedFeatures.MotionTracker;
            if (_hasBGR || _hasDN || _hasFT) {
              clipItems += '<div class="ve-ctx-label">AI Tools</div>';
              if (_hasBGR) {
                var _bgrActive = _ctxClip.bgRemoval && _ctxClip.bgRemoval.enabled;
                clipItems += '<button class="ve-ctx-item" data-action="toggle-bgr">' + VE._veIcon('user-x', 14) + (_bgrActive ? ' Disable BG Removal' : ' Enable BG Removal') + '</button>';
              }
              if (_hasDN) {
                var _dnActive = _ctxClip.denoise && _ctxClip.denoise.enabled;
                clipItems += '<button class="ve-ctx-item" data-action="toggle-denoise">' + VE._veIcon('volume-x', 14) + (_dnActive ? ' Disable Denoise' : ' Enable Denoise') + '</button>';
              }
              if (_hasFT) {
                clipItems += '<button class="ve-ctx-item" data-action="face-track">' + VE._veIcon('scan-face', 14) + ' Face Track (AI)</button>';
              }
              clipItems += '<div class="ve-ctx-divider"></div>';
            }
          }

          // Subtitle entry (video clips): opens the auto-subtitle modal.
          if (_ctxClip && _ctxClip.type === 'video' && window.VEAutoSubtitle) {
            clipItems += '<button class="ve-ctx-item" data-action="auto-subtitle">' + VE._veIcon('captions', 14) + ' Auto Subtitle (AI)</button>' +
              '<div class="ve-ctx-divider"></div>';
          }
          // Dublaj entry (video clips): opens the DUBLAJ-only panel (no text field) — it re-voices the
          // clip's own audio into another language. TTS/Seslendirme is the separate Tools entry.
          if (_ctxClip && _ctxClip.type === 'video' && window.VEDubbing) {
            clipItems += '<button class="ve-ctx-item" data-action="dublaj">' + VE._veIcon('mic', 14) + ' Dubbing (AI)</button>' +
              '<div class="ve-ctx-divider"></div>';
          }
        }

        var generalItems = '';
        if (!clipId && !cueId) {
          generalItems += '<button class="ve-ctx-item ve-ctx-danger" data-action="reset-all">' + VE._veIcon('refresh-cw', 14) + ' Reset All Tracks</button>' +
            '<div class="ve-ctx-divider"></div>';
        }
        generalItems +=
          '<button class="ve-ctx-item" data-action="add-comment">' + VE._veIcon('message-square', 14) + ' Add Comment</button>' +
          '<button class="ve-ctx-item" data-action="keyboard-shortcuts">' + VE._veIcon('keyboard', 14) + ' Keyboard Shortcuts</button>' +
          '<button class="ve-ctx-item" data-action="toggle-grid">' + VE._veIcon('grid', 14) + ' Toggle Grid</button>';

        menu.innerHTML = cueItems + clipItems + generalItems;
        // Position at the cursor first (invisible), then clamp to the viewport.
        menu.style.cssText = 'position:fixed;left:' + e.clientX + 'px;top:' + e.clientY + 'px;z-index:10003;visibility:hidden';
        document.body.appendChild(menu);
        // Flip/clamp so the menu never spills off-screen (bottom -> open
        // upward, right -> shift left). Also cap height + scroll if the menu
        // is taller than the viewport.
        (function() {
          var pad = 8;
          var vw = window.innerWidth, vh = window.innerHeight;
          var mw = menu.offsetWidth, mh = menu.offsetHeight;
          var left = e.clientX, top = e.clientY;
          if (left + mw + pad > vw) left = Math.max(pad, e.clientX - mw);
          if (left < pad) left = pad;
          if (mh + pad * 2 > vh) {
            // Taller than the screen: pin to top and scroll internally.
            top = pad;
            menu.style.maxHeight = (vh - pad * 2) + 'px';
            menu.style.overflowY = 'auto';
          } else if (top + mh + pad > vh) {
            // Overflows bottom: open upward from the cursor.
            top = Math.max(pad, e.clientY - mh);
          }
          menu.style.left = left + 'px';
          menu.style.top = top + 'px';
          menu.style.visibility = 'visible';
        })();

        menu.addEventListener('click', function(ev) {
          var btn = ev.target.closest('[data-action]');
          var speedBtn = ev.target.closest('[data-speed]');
          if (btn) {
            var action = btn.getAttribute('data-action');
            if (action === 'mc-angle' && clipId) {
              // Switch this cut's angle, no new cut. Same primitive the monitor and the
              // inspector use — one angle-switch code path, not three.
              VE._veBeginUndoGroup && VE._veBeginUndoGroup('Change angle');
              VE._veMcSwitchAngle(clipId, parseInt(btn.getAttribute('data-mc'), 10));
              VE._veEndUndoGroup && VE._veEndUndoGroup();
              VE._veRender();
              VE._veRenderPreviewFrame && VE._veRenderPreviewFrame();
              if (window.VEMulticamMonitor && VEMulticamMonitor.isOpen()) VEMulticamMonitor.refresh();
            }
            else if (action === 'mc-flatten' && clipId) {
              VE._veBeginUndoGroup && VE._veBeginUndoGroup('Flatten multi-cam');
              var _flat = VE._veMcFlatten(clipId);
              VE._veEndUndoGroup && VE._veEndUndoGroup();
              VE._veRender();
              if (_flat && typeof showToast === 'function') showToast('Multi-cam flattened');
            }
            else if (action === 'download-media' && clipId) {
              // The resolver + the naming live in the clips module (VE._veClipMediaBlob), so the
              // menu only names the intent. It resolves asynchronously and reports its own outcome.
              if (VE._veDownloadClipMedia) VE._veDownloadClipMedia(clipId);
            }
            else if (action === 'inspector' && clipId) {
              if (window.VEInspector) VEInspector.toggle(clipId);
            }
            else if (action === 'auto-subtitle') {
              if (window.VEAutoSubtitle) VEAutoSubtitle.showModal();
            }
            else if (action === 'dublaj') {
              if (window.VEDubbing) VEDubbing.showDublaj();
            }
            // ── Subtitle cue actions. Split / merge route into VESubtitlePanel's own cue operations
            // (the ONE implementation of each) rather than a second copy living here.
            else if (action === 'cue-edit' && cueId) {
              var _eh = VE._veFindCueById(cueId);
              if (_eh) {
                if (window.VESubtitleElement && VESubtitleElement.selectTrack) VESubtitleElement.selectTrack(_eh.track, _eh.cue.id);
                if (typeof _sdShowSubtitlePanel === 'function') _sdShowSubtitlePanel(_eh.track.id);
                else if (window.VESubtitlePanel && VESubtitlePanel.setTrack) VESubtitlePanel.setTrack(_eh.track.id);
              }
            }
            else if (action === 'cue-split' && cueId) {
              var _sh = VE._veFindCueById(cueId);
              if (_sh && window.VESubtitlePanel && VESubtitlePanel.splitCue) {
                VESubtitlePanel.splitCue(_sh.track, _sh.index, VE._veProject.playheadTime);
                VE._veRender();
              }
            }
            else if (action === 'cue-merge' && cueId) {
              var _mh = VE._veFindCueById(cueId);
              if (_mh && window.VESubtitlePanel && VESubtitlePanel.mergeCue) {
                VESubtitlePanel.mergeCue(_mh.track, _mh.index);
                VE._veSetCueSelection([_mh.cue.id], _mh.cue.id, _mh.track.id);
                VE._veRender();
              }
            }
            else if (action === 'cue-duplicate' && cueId) {
              var _dh = VE._veFindCueById(cueId);
              if (_dh && !_dh.track.locked) {
                var _src = _dh.cue;
                var _len = (_src.endTime || 0) - (_src.startTime || 0);
                var _dup = { id: VE._veUid('cue'), startTime: (_src.endTime || 0), endTime: (_src.endTime || 0) + (_len || 2), text: _src.text, style: _src.style ? JSON.parse(JSON.stringify(_src.style)) : {} };
                _dh.track.cues.splice(_dh.index + 1, 0, _dup);
                VE._veSetCueSelection([_dup.id], _dup.id, _dh.track.id);
                VE._vePushUndo();
                VE._veRecalcDuration();
                VE._veRender();
                if (window.VESubtitlePanel && VESubtitlePanel.isOpen && VESubtitlePanel.isOpen()) VESubtitlePanel.render();
              }
            }
            else if (action === 'cue-select-track' && cueId) {
              var _th = VE._veFindCueById(cueId);
              if (_th) {
                VE._veSetCueSelection((_th.track.cues || []).map(function (c) { return c.id; }), null, _th.track.id);
                if (window.VESubtitleElement && VESubtitleElement.deselect) {
                  var _keep = VE._veSelectedCues.slice();
                  VESubtitleElement.deselect(true);
                  VE._veSelectedCues = _keep;
                }
                VE._veRender();
              }
            }
            else if (action === 'cue-delete') VE._veDeleteSelected();
            else if (action === 'split') VE._veSplitAtPlayhead();
            else if (action === 'copy') VE._veCopySelected();
            else if (action === 'paste') VE._vePasteClips();
            else if (action === 'delete') VE._veDeleteSelected();
            else if (action === 'detach-audio' && clipId) VE._veDetachAudio(clipId);
            else if (action === 'flip-h' && clipId) VE._veFlipClip(clipId, 'h');
            else if (action === 'flip-v' && clipId) VE._veFlipClip(clipId, 'v');
            else if (action === 'rotate-cw' && clipId) VE._veRotateClip(clipId, 90);
            else if (action === 'add-comment') {
              if (typeof window.enterCommentMode === 'function') window.enterCommentMode();
              else if (typeof window.toggleCommentPanel === 'function') window.toggleCommentPanel();
            }
            else if (action === 'keyboard-shortcuts') {
              if (typeof showShortcutsModal === 'function') showShortcutsModal();
            }
            else if (action === 'toggle-grid') {
              if (typeof window.toggleGridOverlay === 'function') window.toggleGridOverlay();
            }
            else if (action === 'reset-all') {
              menu.remove();
              if (typeof showCustomConfirm === 'function') {
                showCustomConfirm('Reset video editor? All tracks and clips will be cleared.', function () {
                  VE._veResetToFresh();
                  if (typeof showToast === 'function') showToast('Video editor reset');
                });
              }
              return;
            }
            else if (action === 'trans-in' && clipId) {
              if (window.VETransitions && VETransitions.showTransitionPicker) {
                VETransitions.showTransitionPicker(clipId, 'in', function(type, dur) {
                  VE._veSetTransition(clipId, 'in', type, dur);
                });
              }
            }
            else if (action === 'trans-out' && clipId) {
              if (window.VETransitions && VETransitions.showTransitionPicker) {
                VETransitions.showTransitionPicker(clipId, 'out', function(type, dur) {
                  VE._veSetTransition(clipId, 'out', type, dur);
                });
              }
            }
            else if (action === 'set-bg' && clipId) {
              VE._veProject._bgClipId = clipId;
              VE._veProject.bgFit = VE._veProject.bgFit || 'cover';
              VE._vePushUndo();
              VE._veRenderPreviewFrame();
              VE._veRender();
            }
            else if (action === 'remove-bg' && clipId) {
              VE._veProject._bgClipId = null;
              VE._vePushUndo();
              VE._veRenderPreviewFrame();
              VE._veRender();
            }
            else if (action === 'toggle-bgr' && clipId) {
              var _bgrClip = VE._findClipById(clipId);
              if (_bgrClip) {
                if (!_bgrClip.bgRemoval) _bgrClip.bgRemoval = { enabled: false, method: 'mediapipe', threshold: 0.7, feather: 3 };
                _bgrClip.bgRemoval.enabled = !_bgrClip.bgRemoval.enabled;
                VE._veRenderPreviewFrame();
                VE._veRender();
                if (typeof showToast === 'function') showToast('BG Removal ' + (_bgrClip.bgRemoval.enabled ? 'enabled' : 'disabled'));
              }
            }
            else if (action === 'toggle-denoise' && clipId) {
              var _dnClip = VE._findClipById(clipId);
              if (_dnClip) {
                if (!_dnClip.denoise) _dnClip.denoise = { enabled: false, mix: 100 };
                _dnClip.denoise.enabled = !_dnClip.denoise.enabled;
                if (_dnClip.denoise.enabled && window.VEDenoise && window.VEAudioEngine) {
                  // ensureContext, not getContext: getContext never existed (same dead ternary as
                  // the inspector's checkbox had).
                  var _dnCtx = VEAudioEngine.ensureContext ? VEAudioEngine.ensureContext() : null;
                  if (_dnCtx) VEDenoise.createForClip(clipId, _dnCtx, { mix: (_dnClip.denoise.mix || 100) / 100 });
                } else if (!_dnClip.denoise.enabled && window.VEDenoise) {
                  VEDenoise.disposeForClip(clipId);
                }
                if (typeof showToast === 'function') showToast('Denoise ' + (_dnClip.denoise.enabled ? 'enabled' : 'disabled'));
              }
            }
            else if (action === 'face-track' && clipId) {
              var _ftClip = VE._findClipById(clipId);
              var _ftEl = VE._vePlayback.videoPool[clipId];
              if (_ftClip && _ftEl && window.VEAdvancedFeatures) {
                var _ftTracker = new VEAdvancedFeatures.MotionTracker();
                if (typeof showToast === 'function') showToast('Face tracking started...');
                _ftTracker.trackFace(_ftEl, 0, {}, function(result) {
                  if (result && result.frames) {
                    _ftClip._faceTrackData = result;
                    if (typeof showToast === 'function') showToast('Face tracking complete: ' + result.frames.length + ' frames');
                  } else {
                    if (typeof showToast === 'function') showToast('Face tracking failed', 'error');
                  }
                });
              }
            }
            menu.remove();
          }
          if (speedBtn && clipId) {
            var spd = parseFloat(speedBtn.getAttribute('data-speed'));
            VE._veSetClipSpeed(clipId, spd);
            menu.remove();
          }

        });

        // Close on the next press anywhere OUTSIDE the menu (left or right
        // button). Capture phase so timeline handlers that stopPropagation on
        // click/mousedown can't swallow it, and a plain left-click over the
        // track region still dismisses the menu. Presses inside the menu are
        // ignored here so the item handlers above still run.
        setTimeout(function() {
          var closeCtx = function(ev) {
            if (menu.contains(ev.target)) return;
            menu.remove();
            document.removeEventListener('mousedown', closeCtx, true);
            document.removeEventListener('contextmenu', closeCtx, true);
            window.removeEventListener('blur', closeCtx);
          };
          document.addEventListener('mousedown', closeCtx, true);
          document.addEventListener('contextmenu', closeCtx, true);
          window.addEventListener('blur', closeCtx);
        }, 0);
      });
    }
  };

  VE._veRulerSeek = function (e) {
    var scrollWrap = document.getElementById('ve-scroll-wrap');
    if (!scrollWrap) return;
    var rect = scrollWrap.getBoundingClientRect();
    var x = e.clientX - rect.left + scrollWrap.scrollLeft;
    var time = Math.max(0, x / VE._veProject.zoom);
    VE._veSeek(time);
  };

  if (window.cc && cc.modules) cc.modules.register({ id: 'binding', parent: 'video.video-editor.events', title: 'events: binding', mount: function () {}, unmount: function () {} });
})();
