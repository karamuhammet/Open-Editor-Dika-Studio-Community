/* Module: video/video-editor/preview-render/overlay — overlay sync, transition, visibility + selection
   Sub-module of preview-render — functions hang off VE (window.__ccVideoEditor, created by the
   video-editor parent); refs resolve through VE at call time, so load order is irrelevant.
   Split from the 1505-line preview-render child. */

(function () {
  'use strict';
  var VE = window.__ccVideoEditor;
  if (!VE) return;

  VE._veBuildOverlayFilterCSS = function (f) {
    if (!f) return '';
    var parts = [];
    if (f.brightness != null && f.brightness !== 100) parts.push('brightness(' + f.brightness + '%)');
    if (f.contrast != null && f.contrast !== 100) parts.push('contrast(' + f.contrast + '%)');
    if (f.saturation != null && f.saturation !== 100) parts.push('saturate(' + f.saturation + '%)');
    if (f.hue != null && f.hue !== 0) parts.push('hue-rotate(' + f.hue + 'deg)');
    if (f.blur != null && f.blur > 0) parts.push('blur(' + f.blur + 'px)');
    if (f.sepia != null && f.sepia > 0) parts.push('sepia(' + f.sepia + '%)');
    if (f.invert != null && f.invert > 0) parts.push('invert(' + f.invert + '%)');
    if (f.grayscale != null && f.grayscale > 0) parts.push('grayscale(' + f.grayscale + '%)');
    return parts.length ? parts.join(' ') : '';
  };

  VE._veBindOverlaySync = function () {
    if (VE._veOverlaySyncBound) return;
    if (typeof canvas === 'undefined' || !canvas) return;
    VE._veOverlaySyncBound = true;

    // When a Fabric.js object is added while video mode is active → create overlay clip
    canvas.on('object:added', function(e) {
      if (!VE._veActive || VE._veRestoring) return;
      // Global canvas restores (undo/redo, page-switch loadFromJSON) re-fire
      // object:added for every restored object; those are NOT new content and
      // must never become clips. histLocked is the app-wide restore flag - BUT
      // addToCenter also sets histLocked (to suppress its snap) for genuine user
      // adds; those set _ccAddingObject so they still create a clip here.
      if (typeof histLocked !== 'undefined' && histLocked && !window._ccAddingObject) return;
      var obj = e.target;
      if (!obj || obj._veClipId) return; // already linked

      // Skip the subtitle interaction proxy: it is a transient, export-excluded
      // selection handle owned by the captions track, never content/a clip.
      if (obj._isCCSubtitle) return;
      // Skip grid "+" button overlays — they are UI helpers, not content
      if (obj._isGridPlusBtn || obj._isGridHighlight) return;
      // Skip the pixel-grid/ruler tool's lines + labels and any other
      // non-interactive UI helper: they are not content and each one would
      // otherwise become its own clip on its own auto-created track.
      if (obj._isGridLine) return;
      // Skip SmartCam's camera boxes. They are a transient design aid that lives only while the
      // panel is open, not content. They CANNOT be caught by the excludeFromExport check below
      // because they must stay selectable and evented (the user drags them), which is exactly how
      // they leaked onto the timeline as two purple "Overlay" clips.
      if (obj._isScCam) return;
      // Power window shapes, same reason and same trap: the user drags them, so they are selectable
      // and evented and the check below cannot catch them either.
      if (obj._isPowerWindow) return;
      if (obj.excludeFromExport && !obj.selectable && !obj.evented) return;

      var clipId = VE._veUid('clip');
      obj._veClipId = clipId;

      // GridLayout → create per-cell clips so each cell is independently manageable
      if (obj._isGridLayout && obj._cells && obj._cells.length) {
        // Short 5s default per cell, not the full remaining timeline (see the
        // single-overlay note below).
        var gridDuration = 5;
        for (var ci = 0; ci < obj._cells.length; ci++) {
          var cellMeta = obj._cells[ci];
          var cellClipId = VE._veUid('clip');
          var cellClip = {
            id: cellClipId,
            type: 'overlay',
            name: 'Cell (' + (cellMeta.row + 1) + ',' + (cellMeta.col + 1) + ')',
            startTime: VE._veProject.playheadTime,
            duration: gridDuration,
            fabricObjectId: clipId,
            _fabricType: 'gridCell',
            _isGridCellClip: true,
            _gridParentClipId: clipId,
            _cellRow: cellMeta.row,
            _cellCol: cellMeta.col,
            _thumbCache: [],
            _waveformUrl: null,
            volume: 1,
            speed: 1,
            trimStart: 0,
            trimEnd: 0,
            filters: {},
            transitions: { in: null, out: null }
          };
          var cellTrack = VE._veFindNonOverlapTrack(cellClip.startTime, cellClip.duration, null);
          if (!cellTrack) {
            var vc = VE._veProject.tracks.filter(function(t) { return t.type !== 'audio'; }).length;
            VE._veProject.tracks.push({
              id: VE._veUid('v'), type: 'video',
              label: 'V' + (vc + 1),
              muted: false, locked: false, solo: false, collapsed: false, clips: []
            });
            cellTrack = VE._veProject.tracks[VE._veProject.tracks.length - 1];
          }
          if (cellTrack) cellTrack.clips.push(cellClip);
        }
        VE._veRecalcDuration();
        VE._veRender();
        return; // per-cell clips created, skip default single clip
      }

      // Check if this is a video media element (from gallery)
      var isVideoMedia = !!(obj._isVideoMedia && obj._videoSrc);

      var name = 'Overlay';
      if (isVideoMedia) {
        name = obj._videoName || 'Video';
      } else if (obj._isAnimatedGif || obj._isGif) {
        name = obj._gifTitle || 'GIF';
      } else if (obj._isSticker) {
        name = obj._stickerTitle || 'Sticker';
      } else if (obj._isEmoji) {
        name = 'Emoji';
      } else if (obj.type === 'textbox' || obj.type === 'i-text' || obj.type === 'text') {
        name = 'Text: ' + (obj.text || '').substring(0, 20);
      } else if (obj.type === 'image') {
        name = 'Image';
      } else if (obj.type === 'group') {
        name = obj._iconName ? 'Icon: ' + obj._iconName : 'Group';
      } else if (obj.type === 'path') {
        name = 'Shape';
      }

      // A newly added overlay element defaults to a short 5s clip, NOT the
      // project's remaining duration. On a long timeline (e.g. a 40min video or
      // music track) inheriting the full length stretched every added text/shape
      // across the whole project; the user wants a short block they trim/extend
      // manually. Mirrors _veImportImageAsClip's flat `duration: 5` (import.js).
      // (Video media below overrides this with the real media length.)
      var clipDuration = 5;

      // For video media: create a proper 'video' clip so playback engine handles it
      var _vePendingDurationFix = null;
      var _veDurUnknown = false;
      if (isVideoMedia) {
        var videoEl = obj._videoElement;
        if (videoEl && videoEl.duration && isFinite(videoEl.duration) && videoEl.duration > 0) {
          clipDuration = videoEl.duration;
        } else {
          // Duration not loaded yet. Use a small placeholder, NOT the project's
          // remaining duration: that would inherit e.g. an added music track's
          // length. The async metadata fix below corrects it to the real value.
          clipDuration = 5;
          _veDurUnknown = true;
          _vePendingDurationFix = videoEl || null;
        }
      }

      var clip = {
        id: clipId,
        type: isVideoMedia ? 'video' : 'overlay',
        name: name,
        src: isVideoMedia ? obj._videoSrc : undefined,
        startTime: VE._veProject.playheadTime,
        duration: clipDuration,
        _srcDuration: isVideoMedia ? clipDuration : 0,
        fabricObjectId: clipId,
        _fabricType: obj._isAnimatedGif || obj._isGif ? 'gif' : obj._isSticker ? 'sticker' : obj._isEmoji ? 'emoji' : obj.type,
        _thumbCache: [],
        _waveformUrl: null,
        volume: 1,
        speed: 1,
        trimStart: 0,
        trimEnd: 0,
        filters: {},
        transitions: { in: null, out: null }
      };

      // Register video element in playback pool
      if (isVideoMedia) {
        var poolVid = obj._videoElement;
        if (!poolVid) {
          // Create a fresh <video> element for the pool
          poolVid = document.createElement('video');
          poolVid.preload = 'auto';
          poolVid.muted = true;
          VE._veSetMediaSrc(poolVid, obj._videoSrc);   // S5/M1
          poolVid.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
          document.body.appendChild(poolVid);
        }
        VE._vePlayback.videoPool[clipId] = poolVid;
        // The fabric object may not carry _videoElement yet at object:added time
        // (it is attached after canvas.add). The pool element is the one that
        // actually loads, so point the async duration fix at it; when
        // _videoElement existed, poolVid IS that element, so this is a no-op.
        if (_veDurUnknown) _vePendingDurationFix = poolVid;
        // Connect to audio engine
        if (window.VEAudioEngine) {
          var _aTrack = VE._veFindNonOverlapTrack(clip.startTime, clip.duration, null);
          var _aTrackId = _aTrack ? _aTrack.id : (VE._veProject.tracks[0] ? VE._veProject.tracks[0].id : '');
          VEAudioEngine.connectClip(clipId, poolVid, _aTrackId, clip.volume);
        }
        // Generate thumbnails async
        VE._veGenerateThumbnails(clip, poolVid);

        // Auto-set as background if no bg clip assigned yet
        if (!VE._veProject._bgClipId) {
          VE._veProject._bgClipId = clipId;
          VE._veProject.bgFit = VE._veProject.bgFit || 'cover';
        }

        // Ensure video element is ready for preview rendering
        if (poolVid.readyState < 2) {
          poolVid.addEventListener('canplay', function _onReady() {
            poolVid.removeEventListener('canplay', _onReady);
            VE._veRenderPreviewFrame();
          });
        }
      }

      // Each new object gets its own track for vertical stacking
      var targetTrack = VE._veFindEmptyTrack();
      if (!targetTrack) {
        // Auto-create a new track
        var vCount = VE._veProject.tracks.filter(function(t) { return t.type !== 'audio'; }).length;
        VE._veProject.tracks.push({
          id: VE._veUid('v'),
          type: 'video',
          label: 'V' + (vCount + 1),
          muted: false,
          locked: false,
          solo: false,
          collapsed: false,
          clips: []
        });
        targetTrack = VE._veProject.tracks[VE._veProject.tracks.length - 1];
      }
      if (targetTrack) {
        targetTrack.clips.push(clip);
        VE._veRecalcDuration();
        VE._veRender();

        // Async fix: if video duration wasn't available yet, update clip once loaded
        if (_vePendingDurationFix && isVideoMedia) {
          (function(pVid, pClip) {
            /* M4 (export plan): until this resolves, `pClip.duration` is a 5 s PLACEHOLDER, not a
               measurement. Exporting inside that window baked the placeholder into the file - the
               clip simply ended early, with nothing anywhere saying why. Flag it so the export's
               media gate can wait for the real number instead of racing it. */
            pClip._veDurationProvisional = true;
            var _dcPrevDur = pClip.duration;
            var _fixDuration = function() {
              var newDur = pVid.duration;
              if (newDur && isFinite(newDur) && newDur > 0) {
                if (Math.abs(newDur - _dcPrevDur) > 0.1) {
                  _dcPrevDur = newDur;
                  pClip.duration = newDur;
                  pClip._srcDuration = newDur;
                  VE._veRecalcDuration();
                  VE._veRender();
                }
                pClip._veDurationProvisional = false;
              }
            };
            pVid.addEventListener('loadedmetadata', _fixDuration);
            pVid.addEventListener('durationchange', _fixDuration);
            // Safety timeout — check after a delay in case events already fired
            setTimeout(function() { _fixDuration(); }, 500);
            // Clean up listener after 10s
            setTimeout(function() {
              pVid.removeEventListener('durationchange', _fixDuration);
              pClip._veDurationProvisional = false;   // M4: stop blocking on a duration that never came
            }, 10000);
          })(_vePendingDurationFix, clip);
        }
      }
    });

    // When a Fabric.js object is removed → remove its overlay/video clip
    canvas.on('object:removed', function(e) {
      if (!VE._veActive || VE._veRestoring) return;
      // loadFromJSON clears the canvas first: those object:removed events are
      // part of a restore, not user deletions (see the added-handler note).
      if (typeof histLocked !== 'undefined' && histLocked) return;
      var obj = e.target;
      if (!obj || !obj._veClipId) return;
      var clipId = obj._veClipId;

      // GridLayout removal → remove all per-cell clips
      if (obj._isGridLayout) {
        VE._veProject.tracks.forEach(function(track) {
          track.clips = track.clips.filter(function(c) {
            return !c._isGridCellClip || c._gridParentClipId !== clipId;
          });
        });
        VE._veRecalcDuration();
        VE._veRender();
        return;
      }

      // Clean up video pool entry if exists
      if (VE._vePlayback.videoPool[clipId]) {
        delete VE._vePlayback.videoPool[clipId];
      }
      VE._veProject.tracks.forEach(function(track) {
        track.clips = track.clips.filter(function(c) { return c.id !== clipId; });
      });
      VE._veRecalcDuration();
      VE._veRender();
    });

    /* A user transform re-bases the transition's resting pose. Without this, a transition put the
       object back where it was when its snapshot was first taken, so every move/scale/rotate made
       after the playhead had once crossed the effect was silently undone on the next pass.
       An ActiveSelection reports the WRAPPER as the target and fabric keeps each member's left/top
       RELATIVE TO THE GROUP until the selection is dismissed, so a member is marked and rebased
       later - reading it now would write group coordinates into an object's resting pose. */
    canvas.on('object:modified', function (e) {
      if (!VE._veActive || VE._veRestoring) return;
      var t = e && e.target; if (!t) return;
      if (t.type === 'activeSelection' && t.getObjects) {
        t.getObjects().forEach(function (o) { if (o && o._veClipId) o._veNeedsRebase = true; });
        return;
      }
      if (t._veClipId && VE._veRebaseOverlayTransform) VE._veRebaseOverlayTransform(t);
    });
    // The group is gone and every member carries absolute coordinates again.
    function _veFlushRebase() {
      if (!VE._veActive) return;
      canvas.getObjects().forEach(function (o) {
        if (!o || !o._veNeedsRebase) return;
        o._veNeedsRebase = false;
        if (VE._veRebaseOverlayTransform) VE._veRebaseOverlayTransform(o);
      });
    }
    canvas.on('selection:cleared', _veFlushRebase);
    canvas.on('selection:updated', _veFlushRebase);

    // When user selects Fabric object, highlight its overlay clip in timeline
    canvas.on('selection:created', function(e) {
      if (!VE._veActive) return;
      var obj = e.selected && e.selected[0];
      if (obj && obj._veClipId) {
        // GridLayout: select all its cell clips
        if (obj._isGridLayout) {
          var cellIds = [];
          VE._veProject.tracks.forEach(function(t) { t.clips.forEach(function(c) {
            if (c._isGridCellClip && c._gridParentClipId === obj._veClipId) cellIds.push(c.id);
          }); });
          if (cellIds.length) { VE._veSelectedClips = cellIds; VE._veRender(); }
        } else if (VE._veSelectedClips.indexOf(obj._veClipId) === -1) {
          VE._veSelectedClips = [obj._veClipId];
          VE._veRender();
        }
      }
    });
    canvas.on('selection:updated', function(e) {
      if (!VE._veActive) return;
      var obj = e.selected && e.selected[0];
      if (obj && obj._veClipId) {
        if (obj._isGridLayout) {
          var cellIds = [];
          VE._veProject.tracks.forEach(function(t) { t.clips.forEach(function(c) {
            if (c._isGridCellClip && c._gridParentClipId === obj._veClipId) cellIds.push(c.id);
          }); });
          if (cellIds.length) { VE._veSelectedClips = cellIds; VE._veRender(); }
        } else if (VE._veSelectedClips.indexOf(obj._veClipId) === -1) {
          VE._veSelectedClips = [obj._veClipId];
          VE._veRender();
        }
      }
    });
  };

  /* THE RESTING POSE SNAPSHOT LIVES FOR ONE TRANSITION PASS, NOT FOREVER (fixed 2026-08-12).
     A transition MUTATES the fabric object (left/top/scale/angle/opacity) and puts it back from
     `_veOrig*` when the window ends. That snapshot was taken ONCE, on the first pass, and was never
     invalidated - so moving the object on the canvas afterwards was undone the next time the
     playhead crossed the transition, and the object teleported to where it had been minutes ago
     (owner: "canvasta kaydırdım, başlattım, ilk konumuna ışınlanıyor"). Measured: dragged to
     (800,600), replayed, landed back at (810,520).
     The restore now CLEARS the snapshot, so the next pass re-reads the object's real pose; and a
     drag made WHILE the offset is applied shifts the snapshot by the same delta instead of
     capturing an animated value as the resting one (`_veRebaseOverlayTransform`, called from
     `object:modified`). Note the restore is unconditional across all five properties even for a
     crossfade, which is why an opacity-only effect could move an object at all. */
  function _veClearTransBase(obj) {
    obj._veOrigSaved = false;
    obj._veAnimLeft = obj._veAnimTop = obj._veAnimScaleX = obj._veAnimScaleY = obj._veAnimAngle = obj._veAnimOpacity = null;
  }

  /* The user just transformed an object that is CURRENTLY wearing a transition offset. The values on
     screen are animated ones, so the delta they dragged is what must move the resting pose - taking
     the new absolute value would bake half an animation into the object's real position. */
  VE._veRebaseOverlayTransform = function (obj) {
    if (!obj || !obj._veClipId || !obj._veOrigSaved) return false;
    if (!obj._veTransActive || obj._veAnimLeft == null) { _veClearTransBase(obj); return true; }
    if (obj.left != null && obj._veAnimLeft != null) obj._veOrigLeft += (obj.left - obj._veAnimLeft);
    if (obj.top != null && obj._veAnimTop != null) obj._veOrigTop += (obj.top - obj._veAnimTop);
    if (obj._veAnimScaleX) obj._veOrigScaleX *= (obj.scaleX / obj._veAnimScaleX);
    if (obj._veAnimScaleY) obj._veOrigScaleY *= (obj.scaleY / obj._veAnimScaleY);
    if (obj._veAnimAngle != null) obj._veOrigAngle += ((obj.angle || 0) - obj._veAnimAngle);
    if (obj._veAnimOpacity) obj._veOrigOpacity *= ((obj.opacity != null ? obj.opacity : 1) / obj._veAnimOpacity);
    // The object keeps wearing the offset; only the pose it returns to moved.
    obj._veAnimLeft = obj.left; obj._veAnimTop = obj.top;
    obj._veAnimScaleX = obj.scaleX; obj._veAnimScaleY = obj.scaleY;
    obj._veAnimAngle = obj.angle || 0; obj._veAnimOpacity = obj.opacity != null ? obj.opacity : 1;
    return true;
  };

  VE._veApplyOverlayTransition = function (obj, clip, time) {
    if (!clip.transitions) {
      // Reset to defaults if no transitions
      if (obj._veTransActive) {
        obj.opacity = obj._veOrigOpacity != null ? obj._veOrigOpacity : 1;
        obj.scaleX = obj._veOrigScaleX != null ? obj._veOrigScaleX : obj.scaleX;
        obj.scaleY = obj._veOrigScaleY != null ? obj._veOrigScaleY : obj.scaleY;
        obj.angle = obj._veOrigAngle != null ? obj._veOrigAngle : 0;
        obj.left = obj._veOrigLeft != null ? obj._veOrigLeft : obj.left;
        obj.top = obj._veOrigTop != null ? obj._veOrigTop : obj.top;
        obj._veTransActive = false;
        _veClearTransBase(obj);
        obj.setCoords();
        return true;
      }
      return false;
    }

    // Save original values on first use
    if (!obj._veOrigSaved) {
      obj._veOrigOpacity = obj.opacity != null ? obj.opacity : 1;
      obj._veOrigScaleX = obj.scaleX;
      obj._veOrigScaleY = obj.scaleY;
      obj._veOrigAngle = obj.angle || 0;
      obj._veOrigLeft = obj.left;
      obj._veOrigTop = obj.top;
      obj._veOrigSaved = true;
    }

    var state = window.VETransitions ? VETransitions.getTransitionState(clip, time) : null;
    if (!state || (!state.inTransition && !state.outTransition)) {
      // No active transition — restore originals
      if (obj._veTransActive) {
        obj.opacity = obj._veOrigOpacity;
        obj.scaleX = obj._veOrigScaleX;
        obj.scaleY = obj._veOrigScaleY;
        obj.angle = obj._veOrigAngle;
        obj.left = obj._veOrigLeft;
        obj.top = obj._veOrigTop;
        obj._veTransActive = false;
        _veClearTransBase(obj);   // the pose is the object's own again until the next pass
        obj.setCoords();
        return true;
      }
      // Captured but never animated (the playhead never reached the window): a later move must not
      // be undone by a snapshot nobody used.
      if (obj._veOrigSaved) _veClearTransBase(obj);
      return false;
    }

    obj._veTransActive = true;
    var changed = false;

    // Determine active transition type + progress
    var tType, progress, isOut;
    if (state.inTransition && state.outTransition) {
      if (state.inProgress < 0.5) {
        tType = state.inType; progress = state.inProgress; isOut = false;
      } else {
        tType = state.outType; progress = state.outProgress; isOut = true;
      }
    } else if (state.inTransition) {
      tType = state.inType; progress = state.inProgress; isOut = false;
    } else {
      tType = state.outType; progress = state.outProgress; isOut = true;
    }

    // Easing
    var ep = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
    // Effective progress: for "in" ep goes 0→1 (appear), for "out" ep goes 0→1 (disappear)
    var origOp = obj._veOrigOpacity;
    var origSX = obj._veOrigScaleX;
    var origSY = obj._veOrigScaleY;
    var origAng = obj._veOrigAngle;
    var origL = obj._veOrigLeft;
    var origT = obj._veOrigTop;
    /* S4 (export plan): slide / push / curtain distances are a fraction of the canvas, and this read
       the LIVE globals. Switching to another page mid-export swaps CW/CH under the running render, so
       a transition that started at 1920 wide finished at 1080 wide - the geometry visibly jumps
       mid-file. The export freezes the project size for its run; use that when it is set. */
    var _frozen = window.__ccVideoEditor && window.__ccVideoEditor._veExportCanvasSize;
    var cw = _frozen ? _frozen.w : (typeof CW !== 'undefined' ? CW : 700);
    var ch = _frozen ? _frozen.h : (typeof CH !== 'undefined' ? CH : 400);

    switch (tType) {
      case 'crossfade':
      case 'fade-black':
      case 'fade-white':
        obj.opacity = isOut ? origOp * (1 - ep) : origOp * ep;
        changed = true;
        break;

      case 'flash':
        obj.opacity = isOut ? (ep > 0.7 ? origOp * (1 - (ep - 0.7) / 0.3) : origOp) : (ep < 0.3 ? origOp * (ep / 0.3) : origOp);
        changed = true;
        break;

      case 'dissolve':
        obj.opacity = isOut ? origOp * (1 - ep) : origOp * ep;
        changed = true;
        break;

      case 'wipe-left':
      case 'wipe-right':
      case 'wipe-up':
      case 'wipe-down':
      case 'iris-open':
      case 'iris-close':
      case 'diamond':
      case 'clock':
      case 'cover-left':
      case 'cover-right':
      case 'curtain':
        // For overlay objects, approximate wipes with opacity
        obj.opacity = isOut ? origOp * (1 - ep) : origOp * ep;
        changed = true;
        break;

      case 'slide-left':
        obj.left = isOut ? origL - cw * ep : origL + cw * (1 - ep);
        obj.opacity = origOp;
        changed = true;
        break;

      case 'slide-right':
        obj.left = isOut ? origL + cw * ep : origL - cw * (1 - ep);
        obj.opacity = origOp;
        changed = true;
        break;

      case 'slide-up':
        obj.top = isOut ? origT - ch * ep : origT + ch * (1 - ep);
        obj.opacity = origOp;
        changed = true;
        break;

      case 'slide-down':
        obj.top = isOut ? origT + ch * ep : origT - ch * (1 - ep);
        obj.opacity = origOp;
        changed = true;
        break;

      case 'push-left':
        obj.left = isOut ? origL - cw * ep : origL + cw * (1 - ep);
        changed = true;
        break;

      case 'push-right':
        obj.left = isOut ? origL + cw * ep : origL - cw * (1 - ep);
        changed = true;
        break;

      case 'zoom-in':
        var zs = isOut ? origSX * (1 + 0.5 * ep) : origSX * (0.3 + 0.7 * ep);
        var zsy = isOut ? origSY * (1 + 0.5 * ep) : origSY * (0.3 + 0.7 * ep);
        obj.scaleX = zs;
        obj.scaleY = zsy;
        obj.opacity = isOut ? origOp * (1 - ep) : origOp * ep;
        changed = true;
        break;

      case 'zoom-out':
        var zo = isOut ? origSX * (1 - 0.7 * ep) : origSX * (1.5 - 0.5 * ep);
        var zoy = isOut ? origSY * (1 - 0.7 * ep) : origSY * (1.5 - 0.5 * ep);
        obj.scaleX = zo;
        obj.scaleY = zoy;
        obj.opacity = isOut ? origOp * (1 - ep) : origOp * ep;
        changed = true;
        break;

      case 'zoom-rotate':
        var zr = isOut ? origSX * (1 - 0.7 * ep) : origSX * (0.3 + 0.7 * ep);
        var zry = isOut ? origSY * (1 - 0.7 * ep) : origSY * (0.3 + 0.7 * ep);
        obj.scaleX = zr;
        obj.scaleY = zry;
        obj.angle = isOut ? origAng + 90 * ep : origAng + 90 * (1 - ep);
        obj.opacity = isOut ? origOp * (1 - ep) : origOp * ep;
        changed = true;
        break;

      case 'zoom-bounce':
        var bt = progress;
        var s2 = 7.5625, p2 = 2.75;
        var bounced;
        if (isOut) {
          var t2 = 1 - bt;
          bounced = t2 < 1/p2 ? s2*t2*t2 : t2 < 2/p2 ? s2*(t2-=1.5/p2)*t2+0.75 : t2 < 2.5/p2 ? s2*(t2-=2.25/p2)*t2+0.9375 : s2*(t2-=2.625/p2)*t2+0.984375;
        } else {
          bounced = bt < 1/p2 ? s2*bt*bt : bt < 2/p2 ? s2*(bt-=1.5/p2)*bt+0.75 : bt < 2.5/p2 ? s2*(bt-=2.25/p2)*bt+0.9375 : s2*(bt-=2.625/p2)*bt+0.984375;
        }
        var bz = 0.5 + 0.5 * bounced;
        obj.scaleX = origSX * bz;
        obj.scaleY = origSY * bz;
        obj.opacity = isOut ? origOp * (1 - ep) : origOp * Math.min(1, progress * 2);
        changed = true;
        break;

      case 'spin-cw':
        obj.angle = isOut ? origAng + 360 * ep : origAng + 360 * (1 - ep);
        var ss = isOut ? 1 - 0.5 * ep : 0.5 + 0.5 * ep;
        obj.scaleX = origSX * ss;
        obj.scaleY = origSY * ss;
        obj.opacity = isOut ? origOp * (1 - ep) : origOp * ep;
        changed = true;
        break;

      case 'spin-ccw':
        obj.angle = isOut ? origAng - 360 * ep : origAng - 360 * (1 - ep);
        var ss3 = isOut ? 1 - 0.5 * ep : 0.5 + 0.5 * ep;
        obj.scaleX = origSX * ss3;
        obj.scaleY = origSY * ss3;
        obj.opacity = isOut ? origOp * (1 - ep) : origOp * ep;
        changed = true;
        break;

      case 'flip-x':
        var fx = ep < 0.5 ? (1 - ep * 2) : (ep * 2 - 1);
        obj.scaleX = origSX * Math.max(0.01, fx);
        obj.opacity = isOut ? origOp * (1 - ep) : origOp * ep;
        changed = true;
        break;

      case 'flip-y':
        var fy = ep < 0.5 ? (1 - ep * 2) : (ep * 2 - 1);
        obj.scaleY = origSY * Math.max(0.01, fy);
        obj.opacity = isOut ? origOp * (1 - ep) : origOp * ep;
        changed = true;
        break;

      case 'blur-in':
      case 'blur-out':
      case 'pixelate':
        // Fabric.js doesn't support blur natively — approximate with opacity
        obj.opacity = isOut ? origOp * (1 - ep) : origOp * ep;
        changed = true;
        break;

      case 'glitch':
        // Simulate glitch with random position jitter + opacity
        var intensity = isOut ? ep : (1 - ep);
        obj.left = origL + (Math.random() - 0.5) * intensity * 20;
        obj.top = origT + (Math.random() - 0.5) * intensity * 10;
        obj.opacity = isOut ? origOp * (1 - ep * 0.8) : origOp * Math.min(1, ep * 1.5);
        changed = true;
        break;

      case 'morph':
        var mScale = isOut ? (1 - 0.2 * ep) : (0.8 + 0.2 * ep);
        obj.scaleX = origSX * mScale;
        obj.scaleY = origSY * mScale;
        obj.angle = isOut ? origAng + 15 * ep : origAng + 15 * (1 - ep);
        obj.opacity = isOut ? origOp * (1 - ep) : origOp * ep;
        changed = true;
        break;

      case 'burn':
        obj.opacity = isOut ? origOp * (1 - ep) : origOp * ep;
        changed = true;
        break;

      case 'ripple':
        var wave = Math.sin(progress * Math.PI * 6) * (isOut ? ep : (1 - ep)) * 8;
        obj.left = origL + wave;
        obj.opacity = isOut ? origOp * (1 - ep) : origOp * ep;
        changed = true;
        break;

      case 'curtain':
        obj.scaleY = isOut ? origSY * (1 - ep) : origSY * ep;
        obj.top = isOut ? origT : origT + ch * (1 - ep);
        obj.opacity = origOp;
        changed = true;
        break;

      case 'ink-drop':
        var inkScale = isOut ? (1 + 2 * ep) : (3 - 2 * ep);
        obj.scaleX = origSX * inkScale;
        obj.scaleY = origSY * inkScale;
        obj.opacity = isOut ? origOp * Math.max(0, 1 - ep * 1.5) : origOp * Math.min(1, ep * 1.5);
        changed = true;
        break;

      case 'elastic':
        var t3 = isOut ? ep : (1 - ep);
        var elastic = t3 === 0 ? 0 : t3 === 1 ? 1 :
          -Math.pow(2, 10 * t3 - 10) * Math.sin((t3 * 10 - 10.75) * (2 * Math.PI / 3));
        var eScale = isOut ? (1 - elastic) : elastic;
        obj.scaleX = origSX * Math.max(0.01, eScale);
        obj.scaleY = origSY * Math.max(0.01, eScale);
        obj.opacity = isOut ? origOp * (1 - ep) : origOp * ep;
        changed = true;
        break;

      case 'swirl':
        var swirlAngle = (isOut ? ep : (1 - ep)) * 720;
        var swirlScale = isOut ? (1 - 0.8 * ep) : (0.2 + 0.8 * ep);
        obj.angle = origAng + swirlAngle;
        obj.scaleX = origSX * swirlScale;
        obj.scaleY = origSY * swirlScale;
        obj.opacity = isOut ? origOp * (1 - ep) : origOp * ep;
        changed = true;
        break;

      case 'squeeze':
        var sqX = isOut ? (1 - 0.8 * ep) : (0.2 + 0.8 * ep);
        var sqY = isOut ? (1 + 0.5 * ep) : (1.5 - 0.5 * ep);
        obj.scaleX = origSX * sqX;
        obj.scaleY = origSY * sqY;
        obj.opacity = isOut ? origOp * (1 - ep) : origOp * ep;
        changed = true;
        break;

      default:
        obj.opacity = isOut ? origOp * (1 - ep) : origOp * ep;
        changed = true;
    }

    if (changed) obj.setCoords();
    /* Remember what WE put on screen. If the user drags the object while it is wearing this offset,
       `_veRebaseOverlayTransform` needs the animated value to work out how far THEY moved it. */
    obj._veAnimLeft = obj.left; obj._veAnimTop = obj.top;
    obj._veAnimScaleX = obj.scaleX; obj._veAnimScaleY = obj.scaleY;
    obj._veAnimAngle = obj.angle || 0; obj._veAnimOpacity = obj.opacity != null ? obj.opacity : 1;
    return changed;
  };

  /* S3 (export plan): animated GIF overlays froze on frame 0 in every export.

     The live driver (`_gifRenderLoop`, left-panel/items) walks `obj._gifFrames` on a WALL-CLOCK rAF
     over the LIVE canvas. The export composites a SNAPSHOT canvas whose objects were re-enlivened
     from JSON: they have no decoded frames, no offscreen context and no driver, so they render
     whatever the still image was. A wall clock would be wrong here anyway - an export that takes 40 s
     to write 3 s of video must advance the GIF by 3 s, not 40. So the frame is derived from the
     TIMELINE time, which also makes the same export byte-identical twice. */
  function _veGifBind(obj, live) {
    if (obj._gifFrames) return true;
    if (!live || !live._gifFrames || !live._gifFrames.length) return false;
    obj._gifFrames = live._gifFrames;            // by reference: decoded RGBA stacks are large
    var off = document.createElement('canvas');
    var first = live._gifFrames[0].imageData;
    off.width = first.width; off.height = first.height;
    obj._gifOffCanvas = off;
    obj._gifOffCtx = off.getContext('2d');
    try { obj.setElement(off); } catch (e) { return false; }
    return true;
  }

  VE._veGifSyncToTime = function (c, time) {
    var live = (typeof canvas !== 'undefined' && canvas) ? canvas.getObjects() : [];
    var liveById = {};
    live.forEach(function (o) { if (o && o._veClipId) liveById[o._veClipId] = o; });
    c.getObjects().forEach(function (obj) {
      if (!obj || !obj._isAnimatedGif) return;
      if (!_veGifBind(obj, liveById[obj._veClipId])) return;
      var frames = obj._gifFrames;
      if (!obj._gifTotalMs) {
        var total = 0;
        for (var i = 0; i < frames.length; i++) total += (frames[i].delay || 100);
        obj._gifTotalMs = total || 100;
      }
      var ms = ((time * 1000) % obj._gifTotalMs + obj._gifTotalMs) % obj._gifTotalMs;
      var idx = 0, acc = 0;
      for (var j = 0; j < frames.length; j++) {
        acc += (frames[j].delay || 100);
        if (ms < acc) { idx = j; break; }
        idx = j;
      }
      if (obj._gifFrameIndex === idx && obj._gifPainted) return;
      obj._gifFrameIndex = idx;
      obj._gifPainted = true;
      try { obj._gifOffCtx.putImageData(frames[idx].imageData, 0, 0); obj.dirty = true; } catch (e) {}
    });
  };

  VE._veSyncOverlayVisibility = function (time, targetCanvas) {
    var c = targetCanvas || (typeof canvas !== 'undefined' ? canvas : null);
    if (!c) return;
    // S3: only for the export's snapshot canvas; the live canvas keeps its own rAF driver.
    if (targetCanvas) { try { VE._veGifSyncToTime(targetCanvas, time); } catch (e) { /* best effort */ } }
    var changed = false;
    // Build a map of overlay clipId → {active, clip}
    var activeMap = {};
    // Build per-cell visibility map for GridLayout objects
    var gridCellMap = {}; // gridParentClipId → { 'row-col' → active }
    // Also collect video clips that have fabricObjectId (they came from canvas, need hiding)
    var videoFabricMap = {};
    VE._veProject.tracks.forEach(function(track) {
      track.clips.forEach(function(clip) {
        if (clip.type === 'video' && clip.fabricObjectId) {
          videoFabricMap[clip.fabricObjectId] = true;
        }
      });
    });
    VE._veProject.tracks.forEach(function(track) {
      track.clips.forEach(function(clip) {
        if (clip.type !== 'overlay') return;
        var clipEnd = clip.startTime + clip.duration;
        var isActive = (time >= clip.startTime && time < clipEnd);
        if (clip._isGridCellClip) {
          if (!gridCellMap[clip._gridParentClipId]) gridCellMap[clip._gridParentClipId] = {};
          gridCellMap[clip._gridParentClipId][clip._cellRow + '-' + clip._cellCol] = isActive;
        } else {
          activeMap[clip.id] = { active: isActive, clip: clip };
        }
      });
    });
    c.getObjects().forEach(function(obj) {
      if (!obj._veClipId) return;

      // Video clips from canvas: always hide their fabric object (preview canvas renders the video)
      if (videoFabricMap[obj._veClipId]) {
        if (obj.visible) { obj.visible = false; changed = true; }
        return;
      }

      // Background overlay clip: hide fabric object (preview canvas renders it)
      if (VE._veProject._bgClipId && obj._veClipId === VE._veProject._bgClipId) {
        if (obj.visible) { obj.visible = false; changed = true; }
        return;
      }

      // GridLayout: per-cell visibility
      if (obj._isGridLayout) {
        var cellMap = gridCellMap[obj._veClipId];
        if (cellMap) {
          obj._veCellVisibility = cellMap;
          var anyActive = false;
          for (var k in cellMap) { if (cellMap[k]) { anyActive = true; break; } }
          if (obj.visible !== anyActive) { obj.visible = anyActive; changed = true; }
        } else {
          // No cell clips found — keep grid visible
          if (!obj.visible) { obj.visible = true; changed = true; }
        }
        obj.dirty = true;
        changed = true;
        return;
      }

      var info = activeMap[obj._veClipId];
      var shouldShow = info ? info.active : true;
      if (obj.visible !== shouldShow) {
        obj.visible = shouldShow;
        changed = true;
      }

      // When object becomes hidden, restore original transform values
      if (!shouldShow && obj._veOrigSaved) {
        obj.opacity = obj._veOrigOpacity != null ? obj._veOrigOpacity : 1;
        obj.scaleX = obj._veOrigScaleX != null ? obj._veOrigScaleX : obj.scaleX;
        obj.scaleY = obj._veOrigScaleY != null ? obj._veOrigScaleY : obj.scaleY;
        obj.angle = obj._veOrigAngle != null ? obj._veOrigAngle : 0;
        obj.left = obj._veOrigLeft != null ? obj._veOrigLeft : obj.left;
        obj.top = obj._veOrigTop != null ? obj._veOrigTop : obj.top;
        obj._veTransActive = false;
        obj._veOrigSaved = false;
        obj.setCoords();
        changed = true;
      }

      // Apply transition effects to overlay objects
      if (shouldShow && info && info.clip) {
        var tChanged = VE._veApplyOverlayTransition(obj, info.clip, time);
        if (tChanged) changed = true;
      }

      // Apply inspector filters to overlay objects on fabric canvas
      if (shouldShow && info && info.clip && info.clip.filters) {
        var cf = info.clip.filters;
        var filterKey = JSON.stringify(cf);
        if (obj._veLastFilterKey !== filterKey) {
          obj._veLastFilterKey = filterKey;
          // For fabric.Image: use built-in filters
          if (obj.type === 'image' && typeof obj.applyFilters === 'function') {
            var newFilters = [];
            if (cf.brightness != null && cf.brightness !== 100) {
              newFilters.push(new fabric.Image.filters.Brightness({ brightness: (cf.brightness - 100) / 100 }));
            }
            if (cf.contrast != null && cf.contrast !== 100) {
              newFilters.push(new fabric.Image.filters.Contrast({ contrast: (cf.contrast - 100) / 100 }));
            }
            if (cf.saturation != null && cf.saturation !== 100) {
              newFilters.push(new fabric.Image.filters.Saturation({ saturation: (cf.saturation - 100) / 100 }));
            }
            if (cf.hue != null && cf.hue !== 0) {
              newFilters.push(new fabric.Image.filters.HueRotation({ rotation: cf.hue / 180 }));
            }
            if (cf.blur != null && cf.blur > 0) {
              newFilters.push(new fabric.Image.filters.Blur({ blur: cf.blur / 20 }));
            }
            obj.filters = newFilters;
            obj.applyFilters();
          } else {
            // For shapes/text/paths: use canvas 2D filter override on render
            var cssFilter = VE._veBuildOverlayFilterCSS(cf);
            if (cssFilter) {
              obj._veFilterCSS = cssFilter;
              if (!obj._veOrigRender) {
                obj._veOrigRender = obj.render;
                obj.render = function(ctx) {
                  ctx.save();
                  ctx.filter = this._veFilterCSS || 'none';
                  this._veOrigRender(ctx);
                  ctx.restore();
                };
              }
            } else if (obj._veOrigRender) {
              obj.render = obj._veOrigRender;
              delete obj._veOrigRender;
              delete obj._veFilterCSS;
            }
          }
          obj.dirty = true;
          changed = true;
        }
      }

      // Apply keyframe animations to visible overlays
      if (shouldShow && info && info.clip && window.VEKeyframes && VEKeyframes.hasKeyframes(info.clip)) {
        var vals = VEKeyframes.evaluateAll(info.clip, time);
        if (vals.x != null) { obj.left = vals.x; changed = true; }
        if (vals.y != null) { obj.top = vals.y; changed = true; }
        if (vals.scaleX != null) { obj.scaleX = vals.scaleX; changed = true; }
        if (vals.scaleY != null) { obj.scaleY = vals.scaleY; changed = true; }
        if (vals.rotation != null) { obj.angle = vals.rotation; changed = true; }
        if (vals.opacity != null) { obj.opacity = vals.opacity; changed = true; }
        obj.setCoords();
      }
    });
    if (changed) c.renderAll();
  };

  VE._veSelectOverlayObject = function (clipId) {
    if (typeof canvas === 'undefined' || !canvas) return;

    // Handle grid cell clips — find parent grid and select it
    var cellClip = null;
    VE._veProject.tracks.forEach(function(track) {
      track.clips.forEach(function(c) {
        if (c.id === clipId && c._isGridCellClip) cellClip = c;
      });
    });
    if (cellClip) {
      var objs = canvas.getObjects();
      for (var j = 0; j < objs.length; j++) {
        if (objs[j]._veClipId === cellClip._gridParentClipId) {
          canvas.setActiveObject(objs[j]);
          canvas.renderAll();
          return;
        }
      }
      return;
    }

    var objs = canvas.getObjects();
    for (var i = 0; i < objs.length; i++) {
      if (objs[i]._veClipId === clipId) {
        canvas.setActiveObject(objs[i]);
        canvas.renderAll();
        return;
      }
    }
  };

  if (window.cc && cc.modules) cc.modules.register({ id: 'overlay', parent: 'video.video-editor.preview-render', title: 'preview-render: overlay', mount: function () {}, unmount: function () {} });
})();
