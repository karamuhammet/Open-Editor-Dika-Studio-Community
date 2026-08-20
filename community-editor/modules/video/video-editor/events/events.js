/* Module: video/video-editor/events — EVENTS — zoom/track add, event binding, activate/deactivate, file picker, the keydown shortcuts.
   Part of the video-editor group (decomposed from the 7695-line IIFE). Functions hang off the
   shared namespace VE (window.__ccVideoEditor, created by the parent); cross-module refs resolve
   through VE at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VE = window.__ccVideoEditor;
  if (!VE) return;

  VE._veSetViewportMode = function (mode) {
    VE._veViewportMode = mode === 'free' ? 'free' : 'follow';
    var button = document.getElementById('ve-follow-playhead');
    if (button) {
      button.classList.toggle('is-free', VE._veViewportMode === 'free');
      button.setAttribute('aria-pressed', VE._veViewportMode === 'follow' ? 'true' : 'false');
      button.title = VE._veViewportMode === 'free' ? 'Resume Playhead Follow' : 'Playhead Follow On';
    }
  };

  VE._veSetZoom = function (val, anchorClientX) {
    var wrap = document.getElementById('ve-scroll-wrap');
    var oldZoom = Math.max(VE.PX_PER_SEC_MIN, VE._veProject.zoom || VE.PX_PER_SEC_DEFAULT);
    var anchorPx = wrap ? wrap.clientWidth / 2 : 0;
    if (wrap && typeof anchorClientX === 'number') anchorPx = Math.max(0, Math.min(wrap.clientWidth, anchorClientX - wrap.getBoundingClientRect().left));
    var anchorTime = wrap ? (wrap.scrollLeft + anchorPx) / oldZoom : VE._veProject.playheadTime;
    VE._veProject.zoom = Math.max(VE.PX_PER_SEC_MIN, Math.min(VE.PX_PER_SEC_MAX, val));
    if (VE._veUi.zoomSlider) VE._veUi.zoomSlider.value = VE._veProject.zoom;
    VE._veRender();
    if (wrap) {
      VE._veProgrammaticScroll = true;
      wrap.scrollLeft = Math.max(0, anchorTime * VE._veProject.zoom - anchorPx);
      requestAnimationFrame(function () { VE._veProgrammaticScroll = false; });
    }
  };

  VE._veFitProjectZoom = function () {
    var wrap = document.getElementById('ve-scroll-wrap');
    if (!wrap) return;
    var duration = Math.max(1, VE._veProject.duration || 0);
    VE._veSetZoom((Math.max(320, wrap.clientWidth) - 220) / (duration + 10));
    VE._veProgrammaticScroll = true;
    wrap.scrollLeft = 0;
    requestAnimationFrame(function () { VE._veProgrammaticScroll = false; });
    VE._veSetViewportMode('free');
  };

  VE._veAddTrack = function (type) {
    type = type || 'video';
    var count = VE._veProject.tracks.filter(function(t) { return t.type === type; }).length;
    var label = (type === 'video' ? 'V' : type === 'audio' ? 'A' : 'Sub') + (count + 1);
    var track = {
      id: VE._veUid(type === 'video' ? 'v' : type === 'audio' ? 'a' : 'sub'),
      type: type,
      label: label,
      muted: false,
      locked: false,
      solo: false,
      collapsed: false,
      clips: []
    };
    if (type === 'subtitle') {
      track.cues = [];
      track.subtitleStyle = {};
    }
    VE._veProject.tracks.push(track);
    VE._vePushUndo();
    VE._veRender();
    if (type === 'subtitle' && window.VESubtitles) {
      VESubtitles.importVTT(function(cues) {
        if (cues && cues.length) {
          track.cues = cues;
          VE._veRender();
        }
      });
    }
  };

  /* ═══ Adjustment layers ════════════════════════════════════════════════════════════════════════
     A strip on the timeline that grades everything composited BELOW it, for exactly its duration.

     Two decisions worth writing down:

     1. It is a real clip with `type: 'adjustment'` on a real track, not a side-channel. Every media
        path in this codebase gates on `type === 'video'` / `'audio'` / `'image'`, so an adjustment
        clip is invisible to all of them by construction: no pool element, no audio connection, no
        thumbnails, no seeking. (The multicam lesson was the opposite case - a new type that had to
        BEHAVE like video and broke 66 gates. This one must behave like nothing.)

     2. "Below" is literal, not a metaphor. The compositor draws clips in track order into one
        context, so everything drawn before this clip's track IS everything below it. The effects are
        applied at that exact point in the sequence (preview-render), which is why an adjustment on
        track 2 leaves track 3 untouched. */
  VE._veAddAdjustmentLayer = function (opts) {
    opts = opts || {};
    // Its own track, at the end of the list = on top of everything already there, which is where an
    // adjustment layer belongs and what "applies to all tracks below" then means.
    var track = {
      id: VE._veUid('adj'),
      type: 'adjustment',
      label: 'Adj' + (VE._veProject.tracks.filter(function (t) { return t.type === 'adjustment'; }).length + 1),
      muted: false, locked: false, solo: false, collapsed: false,
      clips: []
    };
    // Cover the playhead onward, defaulting to the rest of the project so it visibly does something
    // the moment it is added (a zero-length layer would look like nothing happened).
    var start = VE._veProject.playheadTime || 0;
    var dur = Math.max(1, (VE._veProject.duration || 0) - start);
    var clip = {
      id: VE._veUid('adj'),
      type: 'adjustment',
      name: opts.label || 'Adjustment',
      startTime: start,
      duration: dur,
      effects: opts.effects ? JSON.parse(JSON.stringify(opts.effects)) : {},
      opacity: opts.opacity != null ? opts.opacity : 1,
      color: opts.color || '#9b59b6',
      // Present so the shared clip paths (clone, trim, drag, serialize) find what they expect.
      trimStart: 0, trimEnd: 0, speed: 1, volume: 1,
      filters: {}, transitions: { in: null, out: null }
    };
    track.clips.push(clip);
    VE._veProject.tracks.push(track);
    VE._veRecalcDuration();
    VE._vePushUndo('add adjustment layer');
    VE._veRender();
    if (VE._veRenderPreviewFrame) VE._veRenderPreviewFrame();
    if (typeof showToast === 'function') showToast('Adjustment layer added', 'success');
    return clip.id;
  };

  VE._veUpdateAdjustmentLayer = function (id, patch) {
    var clip = VE._findClipById ? VE._findClipById(id) : null;
    if (!clip || clip.type !== 'adjustment' || !patch) return false;
    if (patch.effects) clip.effects = JSON.parse(JSON.stringify(patch.effects));
    if (patch.opacity != null) clip.opacity = patch.opacity;
    if (patch.name) clip.name = patch.name;
    // No undo push per slider tick: dragging a slider would bury the stack. The layer's creation is
    // the undoable step; its values are live-edited like every other inspector field.
    if (VE._veRenderPreviewFrame) VE._veRenderPreviewFrame();
    return true;
  };

  VE._veShowAddTrackMenu = function (button) {
    // Simple popup for adding track type
    var existing = document.getElementById('ve-add-track-popup');
    if (existing) { existing.remove(); return; }

    var popup = document.createElement('div');
    popup.id = 've-add-track-popup';
    popup.className = 've-add-track-popup';
    popup.innerHTML =
      '<button class="ve-popup-item" data-type="video">' + VE._veIcon('Film', 14) + ' Video Track</button>' +
      '<button class="ve-popup-item" data-type="audio">' + VE._veIcon('volume-2', 14) + ' Audio Track</button>' +
      // No dedicated "Subtitle Track" - subtitles live on normal tracks now
      // (owner 2026-07-13). Auto Subtitle (AI) adds cues to a normal track.
      (window.VEAutoSubtitle ? '<button class="ve-popup-item" data-action="auto-subtitle">' + VE._veIcon('sparkles', 14) + ' Auto Subtitle (AI)</button>' : '');
    popup.addEventListener('click', function(e) {
      var item = e.target.closest('[data-type]');
      if (item) {
        VE._veAddTrack(item.getAttribute('data-type'));
        popup.remove();
      }
      var aiBtn = e.target.closest('[data-action="auto-subtitle"]');
      if (aiBtn) {
        popup.remove();
        window.VEAutoSubtitle.showModal();
      }
    });

    var rect = button.getBoundingClientRect();
    popup.style.cssText = 'position:fixed;bottom:' + (window.innerHeight - rect.top + 4) + 'px;right:' + (window.innerWidth - rect.right) + 'px;z-index:10002';
    document.body.appendChild(popup);

    setTimeout(function() {
      document.addEventListener('click', function removePopup() {
        popup.remove();
        document.removeEventListener('click', removePopup);
      }, { once: true });
    }, 50);
  };

  VE._veActivate = function () {
    if (VE._veActive) return;

    // Initialize if needed (do this BEFORE setting VE._veActive
    // so a failure doesn't lock out future attempts)
    try {
      VE._veInit();
    } catch (e) {
      console.error('[VideoEditor] init failed:', e);
      return;
    }

    VE._veActive = true;

    // ── Per-page state isolation ─────────────────────────────
    // When activating on a page, ensure we load its saved project or start
    // fresh.  Without this, VE._veProject.tracks from a *previous* video page
    // would leak into the newly-activated page (the "duplicate tracklist" bug).
    // The pages.js arrival phase calls loadForPage() before activate() and sets
    // VE._vePageLoadedForActivation=true so we skip the redundant re-load here.
    // Manual activation (slide-deck.js prompt) skips loadForPage(), so this
    // block handles that case.
    if (VE._vePageLoadedForActivation) {
      VE._vePageLoadedForActivation = false;
    } else if (typeof pages !== 'undefined' && typeof currentPageIndex !== 'undefined' && pages[currentPageIndex]) {
      var _curPage = pages[currentPageIndex];
      if (typeof _pgEnsurePageId === 'function') _pgEnsurePageId(_curPage);
      var _pid = _curPage._pageId;
      if (_pid && VE._vePageProjects[_pid]) {
        VE._veRestoreProject(VE._vePageProjects[_pid]);
      } else {
        // Brand-new video page — start with an empty project
        VE._veResetToFresh();
      }
    }

    // Save previous state — only when entering from a NON-video product type.
    // When re-entering a video page (activeProduct already 'video'),
    // keep the old _vePrev values so deactivate can still restore correctly.
    var _currentProduct = (typeof activeProduct !== 'undefined') ? activeProduct : 'custom';
    if (_currentProduct !== 'video') {
      VE._vePrevProductType = _currentProduct;
      VE._vePrevCW = (typeof CW !== 'undefined') ? CW : 1000;
      VE._vePrevCH = (typeof CH !== 'undefined') ? CH : 1000;
    }

    // Backup current non-video canvas content (will be restored on deactivate)
    if (_currentProduct !== 'video' && typeof canvas !== 'undefined' && canvas && canvas.toJSON) {
      VE._veCanvasBackup = {
        json: canvas.toJSON(typeof CUSTOM_PROPS !== 'undefined' ? CUSTOM_PROPS : []),
        bg: canvas.backgroundColor
      };
    }

    // Set product type and canvas dimensions via VideoCanvas module
    if (typeof VideoCanvas !== 'undefined' && VideoCanvas.activate) {
      // A free (custom) size is stored as aspectRatio 'custom' + customW/customH on the
      // project (serialized/restored in project.js); re-apply it, else activate('custom')
      // would fall back to 1920x1080 because VideoCanvas' _customDims died with the reload.
      if (VE._veProject.aspectRatio === 'custom' && VE._veProject.customW && VE._veProject.customH && VideoCanvas.setCustomSize) {
        VideoCanvas.activate('16:9');
        VideoCanvas.setCustomSize(VE._veProject.customW, VE._veProject.customH);
      } else {
        VideoCanvas.activate(VE._veProject.aspectRatio || '16:9');
      }
    } else {
      if (typeof setProductType === 'function') setProductType('video');
    }

    // Mark current page as video and force-save correct dimensions
    if (typeof pages !== 'undefined' && typeof currentPageIndex !== 'undefined' && pages[currentPageIndex]) {
      pages[currentPageIndex]._productType = 'video';
      pages[currentPageIndex].w = CW;
      pages[currentPageIndex].h = CH;
    }

    // Clear canvas objects and set video preview as background
    if (typeof canvas !== 'undefined' && canvas) {
      canvas.clear();
    }

    // Attach offscreen preview canvas as Fabric backgroundImage
    VE._veSyncPreviewSize();
    VE._veAttachPreviewBg();
    if (typeof canvas !== 'undefined' && canvas) canvas.renderAll();

    // Add video-mode layout class to canvas-area
    var _caEl = document.getElementById('canvas-area');
    if (_caEl) _caEl.classList.add('ve-active');
    VE._veSyncLayoutPadding();

    // Re-fit zoom now that .ve-active padding is applied (initial _zoomToFit
    // inside activate() ran before the class was added, with wrong available height)
    if (typeof VideoCanvas !== 'undefined' && VideoCanvas.zoomToFit) {
      VideoCanvas.zoomToFit();
      if (typeof applyView === 'function') applyView();
    }

    // Block wheel scroll on canvas area in video mode (allow timeline scroll)
    if (_caEl && !_caEl._veWheelBlock) {
      _caEl._veWheelBlock = function(e) {
        // Allow wheel events inside the timeline scroll area AND inside any
        // scrollable video-mode popup (Tools menu / context menu), otherwise
        // the canvas wheel-block eats their internal scroll.
        if (e.target.closest && (
          e.target.closest('.ve-scroll-wrap') ||
          e.target.closest('.ve-track-headers') ||
          e.target.closest('.ve-tools-menu') ||
          e.target.closest('.ve-ctx-menu')
        )) return;
        e.preventDefault();
      };
      _caEl.addEventListener('wheel', _caEl._veWheelBlock, { passive: false });
    }

    // Prevent ALL scroll caused by Fabric.js hidden textarea during text editing
    if (!window._veScrollLock) {
      window._veScrollLock = function() {
        if (!VE._veActive) return;
        document.documentElement.scrollLeft = 0;
        document.documentElement.scrollTop = 0;
        document.body.scrollLeft = 0;
        document.body.scrollTop = 0;
        if (_caEl) { _caEl.scrollLeft = 0; _caEl.scrollTop = 0; }
        var stage = document.getElementById('card-stage');
        if (stage) { stage.scrollLeft = 0; stage.scrollTop = 0; }
        var stageC = document.getElementById('card-stage-container');
        if (stageC) { stageC.scrollLeft = 0; stageC.scrollTop = 0; }
        var cc = _caEl && _caEl.querySelector('.canvas-container');
        if (cc) { cc.scrollLeft = 0; cc.scrollTop = 0; }
      };
      document.addEventListener('scroll', window._veScrollLock, true);
    }

    // Show timeline
    if (VE._veUi.host) {
      VE._veUi.host.hidden = false;
      VE._veUi.host.setAttribute('aria-hidden', 'false');
      VE._veUi.host.style.display = '';
    }

    // Hide slide strip
    var slideStrip = document.getElementById('slide-strip-host');
    if (slideStrip) slideStrip.style.display = 'none';

    // Show export video button
    var vidExportBtn = document.getElementById('export-format-video');
    if (vidExportBtn) vidExportBtn.style.display = '';

    // Sync track header scroll with main scroll area
    VE._veBindScrollSync();

    VE._veRender();
    VE._veRenderPreviewFrame();

    // Hide the page-background controls: video mode owns the Fabric background
    // (the preview image), so those controls would paint over and lose the
    // video. rpfSyncBgPanel() is video-mode aware and hides them.
    if (typeof rpfSyncBgPanel === 'function') rpfSyncBgPanel();

    // Entering video mode with nothing selected: show Canvas size + the video
    // backdrop control so Properties is not empty (owner). syncRightPanel's
    // no-selection branch does not fire on activate, so trigger it here.
    if (typeof canvas !== 'undefined' && canvas && !canvas.getActiveObject()) {
      var _vcs = document.getElementById('rp-canvas-size'); if (_vcs) _vcs.style.display = '';
      if (typeof _veSyncBgSection === 'function') _veSyncBgSection();
    }

    // Start auto-save (Phase 18)
    if (window.VEPersistence) {
      VEPersistence.startAutoSave(function() { return VE._veProject; });
    }

    // Initialize accessibility (Phase 22)
    if (window.VEAccessibility) VEAccessibility.init();
  };

  VE._veDeactivate = function () {
    if (!VE._veActive) return;
    VE._veActive = false;

    VE._vePause();
    if (typeof VE._veCloseProgramMonitor === 'function') VE._veCloseProgramMonitor();

    /* X4 (export plan): an export keeps running when the user leaves the video page - that is the
       whole point of the offscreen snapshot - but the teardown below disposed the very subsystems it
       is still using. `VEAudioAdvanced.dispose()` closes the AudioContext the offline mixdown renders
       into, and `VEPerformance.destroy()` drops the caches the compositor reads, so switching pages
       mid-run produced a silent or truncated file with no error anywhere. The UI teardown still runs;
       only the subsystem disposal waits for the export to finish. */
    var _exporting = !!VE._veExporting;

    // Dispose accessibility (Phase 22)
    if (window.VEAccessibility) VEAccessibility.dispose();

    if (!_exporting) {
      // Dispose performance module
      if (window.VEPerformance) VEPerformance.destroy();

      // Dispose advanced audio
      if (window.VEAudioAdvanced) VEAudioAdvanced.dispose();

      // Dispose advanced features
      if (window.VEAdvancedFeatures) VEAdvancedFeatures.dispose();
    } else {
      console.info('[VE] leaving the video page while an export runs: subsystem disposal deferred');
      VE._veDisposeAfterExport = true;
    }

    // Stop auto-save (Phase 18)
    if (window.VEPersistence) VEPersistence.stopAutoSave();

    // Hide timeline
    if (VE._veUi.host) {
      VE._veUi.host.style.display = 'none';
      VE._veUi.host.hidden = true;
      VE._veUi.host.setAttribute('aria-hidden', 'true');
    }

    // Remove video-mode layout class
    var _caEl = document.getElementById('canvas-area');
    if (_caEl) {
      _caEl.classList.remove('ve-active');
      _caEl.classList.remove('ve-timeline-focus');
      _caEl.style.paddingBottom = '';
    }

    // Remove wheel scroll block
    if (_caEl && _caEl._veWheelBlock) {
      _caEl.removeEventListener('wheel', _caEl._veWheelBlock);
      _caEl._veWheelBlock = null;
    }

    // Remove scroll lock
    if (window._veScrollLock) {
      document.removeEventListener('scroll', window._veScrollLock, true);
      window._veScrollLock = null;
    }

    // Detach video preview background from Fabric canvas
    VE._veDetachPreviewBg();

    // Restore slide strip
    var slideStrip = document.getElementById('slide-strip-host');
    if (slideStrip) {
      if (typeof activeTemplateMode !== 'undefined' && activeTemplateMode === 'slide') {
        slideStrip.style.display = '';
      }
    }

    // Restore PRODUCT_TYPES.video and previous product type via VideoCanvas module
    if (typeof VideoCanvas !== 'undefined' && VideoCanvas.deactivate) {
      VideoCanvas.deactivate(VE._vePrevProductType, VE._vePrevCW, VE._vePrevCH);
    } else {
      // Fallback if VideoCanvas not loaded
      if (typeof PRODUCT_TYPES !== 'undefined' && PRODUCT_TYPES.video) {
        PRODUCT_TYPES.video.w = 1920;
        PRODUCT_TYPES.video.h = 1080;
      }
      if (VE._vePrevProductType && VE._vePrevProductType !== 'video' && typeof setProductType === 'function') {
        setProductType(VE._vePrevProductType);
      }
    }

    // Restore backed-up canvas content from before video mode
    if (VE._veCanvasBackup && typeof canvas !== 'undefined' && canvas) {
      VE._veRestoring = true;
      canvas.loadFromJSON(VE._veCanvasBackup.json, function() {
        canvas.setBackgroundColor(VE._veCanvasBackup.bg || '#ffffff', function() {
          canvas.renderAll();
          VE._veRestoring = false;
          VE._veCanvasBackup = null;
        });
      });
    } else if (typeof canvas !== 'undefined' && canvas) {
      // No backup — at least restore a white background
      canvas.setBackgroundColor('#ffffff', function() { canvas.renderAll(); });
    }

    // Hide video export button
    var vidExportBtn = document.getElementById('export-format-video');
    if (vidExportBtn) vidExportBtn.style.display = 'none';

    // Re-render page tabs to ensure they're correct
    if (typeof renderPageTabs === 'function') renderPageTabs();

    // Video mode hid the page-background controls; bring them back now that the
    // Fabric canvas is a normal design page again (async loadFromJSON above may
    // finish after this, so defer a tick).
    if (typeof _rpfRevealBgIfEmpty === 'function') setTimeout(_rpfRevealBgIfEmpty, 0);
  };

  VE._veIsActive = function () {
    return VE._veActive;
  };

  VE._veOpenFilePicker = function () {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*,audio/*';
    input.multiple = true;
    input.addEventListener('change', function() {
      if (!input.files || !input.files.length) return;
      var track = VE._veProject.tracks[0];
      var endTime = 0;
      track.clips.forEach(function(c) {
        var e = c.startTime + c.duration;
        if (e > endTime) endTime = e;
      });
      for (var i = 0; i < input.files.length; i++) {
        VE._veImportFile(input.files[i], track, endTime);
      }
    });
    input.click();
  };

  VE._veImportMediaFile = function (file, hintDuration) {
    var isAudio = file.type && file.type.indexOf('audio') === 0;
    var track;

    if (isAudio) {
      // For audio files, find or create an audio track
      track = VE._veEnsureAudioTrack();
    } else {
      // Find first existing video track with no clips, else create new
      track = null;
      for (var ti = 0; ti < VE._veProject.tracks.length; ti++) {
        var t = VE._veProject.tracks[ti];
        if (t.type === 'video' && t.clips.length === 0) { track = t; break; }
      }
      if (!track) {
        var count = VE._veProject.tracks.filter(function(t) { return t.type === 'video'; }).length;
        track = {
          id: VE._veUid('v'),
          type: 'video',
          label: 'V' + (count + 1),
          muted: false,
          locked: false,
          solo: false,
          collapsed: false,
          clips: []
        };
        VE._veProject.tracks.push(track);
      }
    }

    // Place clip at time 0 on its own track
    VE._veImportFile(file, track, 0, hintDuration);
  };

  document.addEventListener('keydown', function(e) {
    if (!VE._veActive) return;
    // Don't intercept if typing in an input/textarea
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    // Don't intercept when editing text on Fabric.js canvas
    var _veAObj = canvas && canvas.getActiveObject ? canvas.getActiveObject() : null;
    if (_veAObj && _veAObj.isEditing) return;

    var key = e.key;
    var ctrl = e.ctrlKey || e.metaKey;

    // Space → Play/Pause
    if (key === ' ' && !ctrl) {
      e.preventDefault();
      VE._veTogglePlay();
      return;
    }

    // S → Split at playhead
    if (key === 's' && !ctrl && !e.altKey) {
      e.preventDefault();
      VE._veSplitAtPlayhead();
      return;
    }

    // C → Toggle razor (blade) mode
    if (key === 'c' && !ctrl && !e.altKey) {
      e.preventDefault();
      if (typeof VE._veToggleRazorMode === 'function') VE._veToggleRazorMode();
      return;
    }

    // N → Toggle snapping
    if (key === 'n' && !ctrl && !e.altKey) {
      e.preventDefault();
      if (typeof VE._veToggleSnap === 'function') VE._veToggleSnap();
      return;
    }

    // Delete / Backspace → Delete selected (clips OR subtitle cues: both are timeline selections and
    // both belong to the one delete function). `_kmHandled` stops KeyboardManager running its own
    // design-canvas delete on the same press.
    if (key === 'Delete' || key === 'Backspace') {
      if (VE._veSelectedClips.length || (VE._veSelectedCues && VE._veSelectedCues.length)) {
        e.preventDefault();
        e._kmHandled = true;
        VE._veDeleteSelected();
        return;
      }
    }

    // Ctrl+C → Copy
    if (ctrl && key === 'c') {
      if (VE._veSelectedClips.length) {
        e.preventDefault();
        VE._veCopySelected();
        return;
      }
    }

    // Ctrl+V → Paste
    if (ctrl && key === 'v') {
      if (VE._veClipboard.length) {
        e.preventDefault();
        VE._vePasteClips();
        return;
      }
    }

    // Ctrl+Z → Undo
    if (ctrl && key === 'z' && !e.shiftKey) {
      e.preventDefault();
      VE._veUndo();
      return;
    }

    // Ctrl+Y or Ctrl+Shift+Z → Redo
    if ((ctrl && key === 'y') || (ctrl && e.shiftKey && key === 'Z')) {
      e.preventDefault();
      VE._veRedo();
      return;
    }

    // Left arrow → previous frame
    if (key === 'ArrowLeft' && !ctrl) {
      e.preventDefault();
      VE._veSeek(VE._veProject.playheadTime - 1 / 30);
      return;
    }

    // Right arrow → next frame
    if (key === 'ArrowRight' && !ctrl) {
      e.preventDefault();
      VE._veSeek(VE._veProject.playheadTime + 1 / 30);
      return;
    }

    // J → rewind, K → pause, L → forward (NLE standard). Bare keys only: with Alt/Ctrl held
    // these are OTHER shortcuts (Alt+K = add keyframe) and must fall through, not shuttle.
    if (key === 'j' && !ctrl && !e.altKey) {
      e.preventDefault();
      VE._vePlayback.speed = Math.max(0.25, VE._vePlayback.speed - 0.5);
      var sel = document.getElementById('ve-speed-select');
      if (sel) sel.value = VE._vePlayback.speed;
      if (!VE._vePlayback.playing) VE._vePlay();
      return;
    }
    if (key === 'k' && !ctrl && !e.altKey) {
      e.preventDefault();
      VE._vePause();
      return;
    }
    if (key === 'l' && !ctrl && !e.altKey) {
      e.preventDefault();
      VE._vePlayback.speed = Math.min(4, VE._vePlayback.speed + 0.5);
      var sel2 = document.getElementById('ve-speed-select');
      if (sel2) sel2.value = VE._vePlayback.speed;
      if (!VE._vePlayback.playing) VE._vePlay();
      return;
    }

    // + / = → Zoom in, - → Zoom out
    if ((key === '+' || key === '=') && !ctrl) {
      e.preventDefault();
      VE._veSetZoom(VE._veProject.zoom * 1.25);
      return;
    }
    if (key === '-' && !ctrl) {
      e.preventDefault();
      VE._veSetZoom(VE._veProject.zoom / 1.25);
      return;
    }

    // Escape → deselect
    if (key === 'Escape') {
      VE._veSelectedClips = [];
      VE._veSelectedCues = [];
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
      if (window.VEInspector) VEInspector.hide();
      VE._veRender();
    }

    // M → Add marker at playhead (Phase 9)
    if (key === 'm' && !ctrl && !e.altKey) {
      e.preventDefault();
      VE._veAddMarker();
      return;
    }

    // Ctrl+Left → previous marker, Ctrl+Right → next marker (Phase 9)
    if (ctrl && key === 'ArrowLeft') {
      e.preventDefault();
      VE._veSeekToPrevMarker();
      return;
    }
    if (ctrl && key === 'ArrowRight') {
      e.preventDefault();
      VE._veSeekToNextMarker();
      return;
    }

    // I → Toggle inspector on selected clip (Phase 11)
    if (key === 'i' && !ctrl && !e.altKey && VE._veSelectedClips.length === 1) {
      e.preventDefault();
      if (window.VEInspector) VEInspector.toggle(VE._veSelectedClips[0]);
      return;
    }

    // Shift+K → Keyframe Graph panel (K alone is JKL pause; shift-form is free because `key`
    // is not lowercased here). Alt+K → add a keyframe at the playhead for the graph's active property.
    if (!ctrl && e.shiftKey && !e.altKey && key === 'K') {
      e.preventDefault();
      if (window.VEKeyframeEditor) VEKeyframeEditor.toggle();
      return;
    }
    if (!ctrl && e.altKey && (key === 'k' || key === 'K')) {
      e.preventDefault();
      if (window.VEKeyframeEditor) VEKeyframeEditor.addAtPlayhead();
      return;
    }

    // Ctrl+Shift+J → Scene Detection
    if (ctrl && e.shiftKey && (key === 'J' || key === 'j')) {
      e.preventDefault();
      var btn = document.getElementById('ve-btn-scene-detect');
      if (btn) btn.click();
      return;
    }

    // Ctrl+Shift+B → Stabilize
    if (ctrl && e.shiftKey && (key === 'B' || key === 'b')) {
      e.preventDefault();
      var btn2 = document.getElementById('ve-btn-stabilize');
      if (btn2) btn2.click();
      return;
    }

    // Ctrl+Shift+M → Multi-Cam Monitor (kept on its familiar shortcut; the old shell panel
    // this used to open was removed once the real multicam shipped)
    if (ctrl && e.shiftKey && (key === 'M' || key === 'm')) {
      e.preventDefault();
      if (window.VEMulticamMonitor) VEMulticamMonitor.toggle();
      return;
    }

    // Ctrl+Shift+W -> Video Scopes. W for waveform; the scope-adjacent letters (S/C) are taken by
    // save and by the browser.
    if (ctrl && e.shiftKey && (key === 'W' || key === 'w')) {
      e.preventDefault();
      if (window.VEAdvancedFeatures && VEAdvancedFeatures.toggleScopes) VEAdvancedFeatures.toggleScopes();
      return;
    }

    // Ctrl+Shift+R → SmartCam designer (one shot, N virtual cameras). R for "reframe";
    // Ctrl+Shift+C/S are taken by the browser and by save.
    if (ctrl && e.shiftKey && (key === 'R' || key === 'r')) {
      e.preventDefault();
      if (window.VESmartCam) VESmartCam.toggle();
      return;
    }

    // Ctrl+Shift+L → LUT Browser
    if (ctrl && e.shiftKey && (key === 'L' || key === 'l')) {
      e.preventDefault();
      VE._veShowLutBrowser();
      return;
    }

    // Ctrl+Shift+K → Plugin Manager
    if (ctrl && e.shiftKey && (key === 'K' || key === 'k')) {
      e.preventDefault();
      VE._veShowPluginManager();
      return;
    }
  });

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'events', parent: 'video.video-editor', title: 'video-editor: events', mount: function () {}, unmount: function () {} });
  }
})();
