/* Module: video/video-editor/clips — CLIP OPS — split/cut/delete/duplicate/move/drag/trim, snap, copy/paste, overlap finding.
   Part of the video-editor group (decomposed from the 7695-line IIFE). Functions hang off the
   shared namespace VE (window.__ccVideoEditor, created by the parent); cross-module refs resolve
   through VE at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VE = window.__ccVideoEditor;
  if (!VE) return;

  /* THE clip -> bytes resolver. It lived inside ve-dubbing (as `resolveClipMedia`) because dubbing
     was the only thing that needed a clip's actual FILE rather than a playable URL; it is here now
     so "download this clip" and "dub this clip" cannot drift into two answers to one question.
     Tries every known source in order and, if all fail, rejects with a DIAGNOSTIC naming each
     source's outcome, so a residual failure names the real cause instead of "Failed to fetch":
       file  = the in-memory File kept at import (freshest)
       idb   = the durable IndexedDB blob (VEPersistence.loadMedia), survives reload
       pool  = the LIVE playback element's src (alive even when clip.src is a revoked blob:)
       src   = clip.src
       asset = the library asset URL (_ccAssetUrl) */
  VE._veClipMediaBlob = function (clip) {
    if (!clip) return Promise.reject(new Error('No clip.'));
    var pool = VE._vePlayback && VE._vePlayback.videoPool;
    var poolEl = pool && pool[clip.id];
    function toBlob(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); }
    var attempts = [
      ['file',  function () { return (clip._file && clip._file.size) ? Promise.resolve(clip._file) : Promise.reject(new Error('none')); }],
      ['idb',   function () { return (clip._ccMediaId && window.VEPersistence && VEPersistence.loadMedia) ? VEPersistence.loadMedia(clip._ccMediaId).then(function (b) { if (b && b.size) return b; throw new Error('not saved'); }) : Promise.reject(new Error('no mediaId')); }],
      ['pool',  function () { return (poolEl && poolEl.src) ? fetch(poolEl.src).then(toBlob) : Promise.reject(new Error('none')); }],
      ['src',   function () { return clip.src ? fetch(clip.src).then(toBlob) : Promise.reject(new Error('none')); }],
      ['asset', function () { return clip._ccAssetUrl ? fetch(clip._ccAssetUrl).then(toBlob) : Promise.reject(new Error('none')); }]
    ];
    var notes = [], i = 0;
    function next() {
      if (i >= attempts.length) return Promise.reject(new Error('Could not resolve clip media [' + notes.join(' · ') + ']'));
      var name = attempts[i][0], run = attempts[i][1]; i++;
      return run().then(function (b) { if (b && b.size) return b; notes.push(name + ':empty'); return next(); },
        function (err) { notes.push(name + ':' + (err && err.message ? err.message : err)); return next(); });
    }
    return next();
  };

  /* The extension follows the BYTES, never the wish. A Deepgram cue line comes back as WAV and an
     ElevenLabs one as MP3, so naming every download ".mp3" would hand somebody a file whose name
     lies about what is inside it - and some players refuse it on that basis alone. */
  var _VE_MEDIA_EXT = {
    'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav',
    'audio/wave': '.wav', 'audio/ogg': '.ogg', 'audio/webm': '.weba', 'audio/aac': '.aac',
    'audio/mp4': '.m4a', 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov'
  };
  VE._veClipDownloadName = function (clip, blob) {
    var type = String((blob && blob.type) || '').split(';')[0].toLowerCase();
    var ext = _VE_MEDIA_EXT[type] || (clip && clip.type === 'audio' ? '.mp3' : '.mp4');
    var base = (clip && (clip.name || clip.label)) || '';
    // A dubbing clip already knows what it IS, and "Dubbing Voice 3" is a better filename than the
    // generated clip id somebody would otherwise have to rename by hand.
    if (!base && clip && clip.dubbing) {
      base = 'dub-' + (clip.dubbing.targetLanguage || 'audio') + (clip.dubbing.speakerId ? '-' + clip.dubbing.speakerId : '');
    }
    if (!base) base = (clip && clip.type === 'audio' ? 'audio' : 'clip') + '-' + Math.round(((clip && clip.startTime) || 0) * 1000);
    base = base.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'audio';
    return base + ext;
  };

  /* Right-click a clip on the timeline -> save its media. Owner 2026-08-11: a dub could be produced
     and heard and there was no way to get the file out of the editor at all. */
  VE._veDownloadClipMedia = function (clipId) {
    var clip = null;
    (VE._veProject.tracks || []).forEach(function (t) {
      (t.clips || []).forEach(function (c) { if (c.id === clipId) clip = c; });
    });
    if (!clip) { if (VE._veToast) VE._veToast('Clip not found'); return; }
    if (VE._veToast) VE._veToast('Preparing the file…');
    return VE._veClipMediaBlob(clip).then(function (blob) {
      var name = VE._veClipDownloadName(clip, blob);
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoked on a timer, not immediately: Chrome starts the save AFTER the click returns, and
      // revoking in the same tick cancels the download with no error anywhere.
      setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 60000);
      if (VE._veToast) VE._veToast('Downloaded ' + name);
      return name;
    }).catch(function (err) {
      if (VE._veToast) VE._veToast('Could not download: ' + ((err && err.message) || 'unknown'));
      throw err;
    });
  };

  VE._veHasOverlap = function (track, start, dur, excludeId) {
    var end = start + dur;
    for (var i = 0; i < track.clips.length; i++) {
      var c = track.clips[i];
      if (excludeId && c.id === excludeId) continue;
      if (start < c.startTime + c.duration && end > c.startTime) return true;
    }
    return false;
  };

  VE._veFindNonOverlapTrack = function (start, dur, excludeId, preferType) {
    for (var i = 0; i < VE._veProject.tracks.length; i++) {
      var t = VE._veProject.tracks[i];
      if (preferType && t.type !== preferType) continue;
      if (!preferType && t.type === 'audio') continue; // legacy: default skips audio
      if (!VE._veHasOverlap(t, start, dur, excludeId)) return t;
    }
    return null;
  };

  VE._veFindEmptyTrack = function (preferType) {
    for (var i = 0; i < VE._veProject.tracks.length; i++) {
      var t = VE._veProject.tracks[i];
      if (preferType && t.type !== preferType) continue;
      if (!preferType && t.type === 'audio') continue; // legacy: default skips audio
      if (t.clips.length === 0) return t;
    }
    return null;
  };

  VE._veEnsureAudioTrack = function () {
    for (var i = 0; i < VE._veProject.tracks.length; i++) {
      if (VE._veProject.tracks[i].type === 'audio') return VE._veProject.tracks[i];
    }
    // No audio track — create one
    var t = {
      id: VE._veUid('a'),
      label: 'Audio ' + (VE._veProject.tracks.length + 1),
      type: 'audio',
      muted: false,
      locked: false,
      solo: false,
      collapsed: false,
      clips: []
    };
    VE._veProject.tracks.push(t);
    return t;
  };

  VE._veSplitAtPlayhead = function () {
    var time = VE._veProject.playheadTime;
    var didSplit = false;
    var overlayCloneTasks = []; // {rightClip, origClipId}

    // Determine which clips to split:
    // If clips are selected, only split those; otherwise split all clips at playhead
    var selectedSet = {};
    var hasSelection = VE._veSelectedClips.length > 0;
    if (hasSelection) {
      VE._veSelectedClips.forEach(function(id) { selectedSet[id] = true; });
    }

    VE._veProject.tracks.forEach(function(track) {
      if (track.locked) return;
      for (var i = track.clips.length - 1; i >= 0; i--) {
        var clip = track.clips[i];

        // If there's a selection, only split selected clips
        if (hasSelection && !selectedSet[clip.id]) continue;

        var clipEnd = clip.startTime + clip.duration;
        if (time > clip.startTime + VE.MIN_CLIP_DURATION && time < clipEnd - VE.MIN_CLIP_DURATION) {
          var leftDur = time - clip.startTime;
          var rightDur = clip.duration - leftDur;

          // With a speed curve the media consumed up to the cut is the INTEGRAL of the
          // curve, not leftDur * speed. Both computed BEFORE duration is mutated (the
          // speed LUT is keyed on the clip's current duration).
          var _hasSpeedKf = window.VEKeyframes && VEKeyframes.hasKeyframes(clip, 'speed');
          var mediaConsumed = _hasSpeedKf
            ? (VEKeyframes.computeSpeedMappedTime(clip, time) - (clip.trimStart || 0))
            : leftDur * clip.speed;
          var totalSpan = _hasSpeedKf
            ? VEKeyframes.getSourceSpan(clip)
            : clip.duration * clip.speed;

          var rightClip = VE._veCloneClip(clip);
          rightClip.id = VE._veUid('clip');
          rightClip.startTime = time;
          rightClip.duration = rightDur;
          rightClip.trimStart = clip.trimStart + mediaConsumed;

          clip.duration = leftDur;
          clip.trimEnd = clip.trimEnd + (totalSpan - mediaConsumed);

          // Redistribute keyframes (all properties): each half keeps its side, boundary
          // keys carry the evaluated value at the cut, right-half times rebase to 0.
          if (window.VEKeyframes && VEKeyframes.hasKeyframes(clip)) {
            VEKeyframes.splitKeyframesAt(clip, rightClip, leftDur);
          }

          track.clips.splice(i + 1, 0, rightClip);
          didSplit = true;

          // For overlay clips: need to duplicate the fabric.js object
          if (clip.type === 'overlay') {
            overlayCloneTasks.push({ rightClip: rightClip, origClipId: clip.id });
          }
          // For video clips: share the same video element in pool
          if (clip.type === 'video' && VE._vePlayback.videoPool[clip.id]) {
            var origVid = VE._vePlayback.videoPool[clip.id];
            var newVid = origVid.cloneNode(true);
            newVid.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
            document.body.appendChild(newVid);
            VE._vePlayback.videoPool[rightClip.id] = newVid;
            // Connect to audio engine
            if (window.VEAudioEngine) {
              VEAudioEngine.connectClip(rightClip.id, newVid, track.id, rightClip.volume);
            }
          }
          // For audio clips: clone the audio element for the right half
          if (clip.type === 'audio' && VE._vePlayback.videoPool[clip.id]) {
            var origAudio = VE._vePlayback.videoPool[clip.id];
            var newAudio = origAudio.cloneNode(true);
            newAudio.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
            document.body.appendChild(newAudio);
            VE._vePlayback.videoPool[rightClip.id] = newAudio;
            // Connect to audio engine
            if (window.VEAudioEngine) {
              VEAudioEngine.connectClip(rightClip.id, newAudio, track.id, rightClip.volume);
            }
          }
        }
      }
    });
    // Clone fabric.js objects for split overlay clips (shared helper: split/duplicate/paste)
    if (overlayCloneTasks.length) {
      overlayCloneTasks.forEach(function(task) {
        VE._veCloneOverlayObject(task.origClipId, task.rightClip.id);
      });
    }
    if (didSplit) {
      VE._vePushUndo();
      VE._veRecalcDuration();
      VE._veRender();
    }
  };

  VE._veThroughCut = function () {
    // Temporarily clear selection to force split-all behavior
    var savedSelection = VE._veSelectedClips.slice();
    VE._veSelectedClips = [];
    VE._veSplitAtPlayhead();
    VE._veSelectedClips = savedSelection;
  };

  VE._veToggleRazorMode = function () {
    VE._veRazorMode = !VE._veRazorMode;
    var container = VE._veUi.tracksContainer;
    if (container) {
      container.style.cursor = VE._veRazorMode ? 'crosshair' : '';
    }
    // Update toolbar razor indicator
    var btn = VE._veUi.host && VE._veUi.host.querySelector('.ve-razor-btn');
    if (btn) {
      if (VE._veRazorMode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
  };

  VE._veRazorClick = function (e) {
    if (!VE._veRazorMode) return false;
    var container = VE._veUi.tracksContainer;
    if (!container) return false;
    var rect = container.getBoundingClientRect();
    var scrollLeft = container.scrollLeft || 0;
    var clickX = e.clientX - rect.left + scrollLeft;
    var clickTime = clickX / VE._veProject.zoom;

    // Find which track was clicked
    var relY = e.clientY - rect.top + (container.parentElement ? container.parentElement.scrollTop : 0);
    var trackIdx = Math.floor(relY / VE.TRACK_HEIGHT);
    trackIdx = Math.max(0, Math.min(trackIdx, VE._veProject.tracks.length - 1));
    var track = VE._veProject.tracks[trackIdx];
    if (!track || track.locked) return true;

    // Find clip under click
    var didSplit = false;
    for (var i = track.clips.length - 1; i >= 0; i--) {
      var clip = track.clips[i];
      var clipEnd = clip.startTime + clip.duration;
      if (clickTime > clip.startTime + VE.MIN_CLIP_DURATION && clickTime < clipEnd - VE.MIN_CLIP_DURATION) {
        // Temporarily set playhead to click position and split
        var savedTime = VE._veProject.playheadTime;
        var savedSelection = VE._veSelectedClips.slice();
        VE._veProject.playheadTime = clickTime;
        VE._veSelectedClips = [clip.id];
        VE._veSplitAtPlayhead();
        VE._veProject.playheadTime = savedTime;
        VE._veSelectedClips = savedSelection;
        didSplit = true;
        break;
      }
    }
    return true; // consumed the click
  };

  // scan-3000 H16: release a deleted clip's pool media element (the decoder-
  // backed <video>/<audio> held the full blob for the whole session). SAFE:
  // duplicated clips share one element (skip release while a twin remains),
  // blob URLs are NOT revoked here (they may be owned by the media gallery,
  // and an undo rebuilds the pool element from clip.src which must stay
  // alive), and undo/redo lazily recreates missing elements (undo-markers).
  VE._veReleasePoolEntry = function (clipId) {
    var pool = VE._vePlayback && VE._vePlayback.videoPool;
    if (!pool || !pool[clipId]) return;
    var el = pool[clipId];
    delete pool[clipId];
    for (var k in pool) { if (pool[k] === el) return; } // a duplicate still uses it
    try {
      if (el.pause) el.pause();
      el.removeAttribute('src');
      if (el.load) el.load();
      if (el.parentNode) el.parentNode.removeChild(el);
    } catch (e) { /* release is best-effort */ }
  };

  // When a deletion just emptied the background slot, promote the earliest
  // remaining video clip so the preview keeps a cover-fit background. Only the
  // delete paths call this (never the inspector's explicit "clear bg" action),
  // so a user-chosen empty background stays empty.
  VE._vePromoteBgClip = function () {
    if (VE._veProject._bgClipId) return;
    var best = null;
    VE._veProject.tracks.forEach(function (track) {
      track.clips.forEach(function (c) {
        if (c.type !== 'video') return;
        if (!best || c.startTime < best.startTime) best = c;
      });
    });
    if (best) {
      VE._veProject._bgClipId = best.id;
      VE._veProject.bgFit = VE._veProject.bgFit || 'cover';
    }
  };

  /* Remove every selected subtitle cue. Cues are the SECOND kind of timeline selection and they were
     missing from the one delete function every door funnels into (the timeline trash button, the
     Del key, the context menu's Delete), so all three silently did nothing to a subtitle - the only
     way to delete one was the canvas toolbar, which works by removing the Textbox proxy. Locked
     tracks are skipped, matching the clip half. Returns how many cues actually went. */
  VE._veRemoveSelectedCues = function () {
    var ids = (VE._veSelectedCues || []).slice();
    // A cue selected on the CANVAS (the live proxy) is the same selection expressed on the other
    // surface; include it so Delete works whichever one the user clicked.
    if (!ids.length && VE._veSelectedCueId) ids = [VE._veSelectedCueId];
    if (!ids.length) return 0;
    var removed = 0;
    VE._veProject.tracks.forEach(function (track) {
      if (track.locked || !track.cues || !track.cues.length) return;
      var before = track.cues.length;
      track.cues = track.cues.filter(function (c) { return ids.indexOf(c.id) === -1; });
      removed += before - track.cues.length;
    });
    VE._veSelectedCues = [];
    // Drop the proxy through the SILENT path: the loud one would re-enter object:removed ->
    // _deleteCueFromProxy and remove a second cue.
    if (window.VESubtitleElement && VESubtitleElement.deselect) VESubtitleElement.deselect(true);
    VE._veSelectedCueId = null;
    VE._veSelectedSubtitleTrackId = null;
    return removed;
  };

  VE._veDeleteSelected = function () {
    var removedCues = VE._veRemoveSelectedCues();
    if (!VE._veSelectedClips.length) {
      if (removedCues) {
        VE._vePushUndo();
        VE._veRecalcDuration();
        VE._veRender();
        if (typeof VE._veRenderPreviewFrame === 'function') VE._veRenderPreviewFrame();
        if (window.VESubtitlePanel && VESubtitlePanel.isOpen && VESubtitlePanel.isOpen()) VESubtitlePanel.render();
      }
      return;
    }
    var removedClips = VE._veSelectedClips.slice();
    removedClips.forEach(function (clipId) {
      var pendingSource = VE._veFilmstripSources && VE._veFilmstripSources[clipId];
      if (pendingSource) {
        Promise.resolve(pendingSource).then(function (source) { if (source && source.close) source.close(); }).catch(function () {});
        delete VE._veFilmstripSources[clipId];
      }
      if (VE._veFilmstripQueues) delete VE._veFilmstripQueues[clipId];
    });

    // Overlay clips (text/shape/etc.) are backed by a REAL fabric object on the
    // shared canvas. Deleting the clip from the timeline must also remove that
    // object, or the element stays on the canvas (owner: track<->canvas delete
    // must stay in sync). Remove them under histLocked so overlay.js object:removed
    // skips (this function already removes the clips below - no double work).
    var _cvsDel = (typeof canvas !== 'undefined') ? canvas : null;
    if (_cvsDel && _cvsDel.getObjects) {
      var _objsDel = _cvsDel.getObjects().filter(function (o) { return o._veClipId && removedClips.indexOf(o._veClipId) >= 0; });
      if (_objsDel.length) {
        var _hlPrev = (typeof histLocked !== 'undefined') ? histLocked : false;
        if (typeof histLocked !== 'undefined') histLocked = true;
        try { _cvsDel.discardActiveObject(); _objsDel.forEach(function (o) { _cvsDel.remove(o); }); } catch (e) {}
        if (typeof histLocked !== 'undefined') histLocked = _hlPrev;
        _cvsDel.requestRenderAll();
      }
    }
    // Clear background reference if bg clip is being deleted
    var bgWasDeleted = false;
    if (VE._veProject._bgClipId && removedClips.indexOf(VE._veProject._bgClipId) !== -1) {
      VE._veProject._bgClipId = null;
      bgWasDeleted = true;
    }

    // Collect gap info before deletion for ripple mode
    var rippleGaps = [];
    if (VE._veEditMode === 'ripple') {
      VE._veProject.tracks.forEach(function(track) {
        if (track.locked) return;
        track.clips.forEach(function(c) {
          if (VE._veSelectedClips.indexOf(c.id) >= 0) {
            rippleGaps.push({ trackId: track.id, start: c.startTime, duration: c.duration });
          }
        });
      });
    }

    VE._veProject.tracks.forEach(function(track) {
      if (track.locked) return;
      track.clips = track.clips.filter(function(c) {
        return VE._veSelectedClips.indexOf(c.id) === -1;
      });
    });

    // Ripple mode: shift subsequent clips left to fill gaps
    if (VE._veEditMode === 'ripple') {
      rippleGaps.forEach(function(gap) {
        VE._veProject.tracks.forEach(function(track) {
          if (track.id !== gap.trackId) return;
          track.clips.forEach(function(c) {
            if (c.startTime >= gap.start + gap.duration) {
              c.startTime = Math.max(0, c.startTime - gap.duration);
            }
          });
        });
      });
    }

    // Plugin hook: onClipRemove (Phase 17)
    if (window.VEPluginSystem) {
      removedClips.forEach(function(id) {
        VEPluginSystem.runHook('onClipRemove', { clipId: id });
      });
    }
    VE._veSelectedClips = [];
    removedClips.forEach(function (id) { VE._veReleasePoolEntry(id); });
    if (bgWasDeleted) VE._vePromoteBgClip();
    VE._vePushUndo();
    VE._veRecalcDuration();
    VE._veRender();
    // Repaint the RAW preview canvas. Deleting a clip changes what composites at the playhead -
    // especially the fill background, which _vePromoteBgClip just re-pointed to the next remaining
    // clip. _veRender() only rebuilds the timeline UI, never the preview bitmap, and with no
    // dimension change the bitmap is not auto-cleared, so the deleted clip's last frame would stay
    // frozen as a stale "poster" (owner: bg must follow the tracks dynamically). Mirrors the
    // set/remove-bg context actions (binding.js), which already repaint after touching _bgClipId.
    if (typeof VE._veRenderPreviewFrame === 'function') VE._veRenderPreviewFrame();
    if (removedCues && window.VESubtitlePanel && VESubtitlePanel.isOpen && VESubtitlePanel.isOpen()) VESubtitlePanel.render();
  };

  VE._veDuplicateSelected = function () {
    if (!VE._veSelectedClips.length) return;
    VE._veProject.tracks.forEach(function(track) {
      var toAdd = [];
      track.clips.forEach(function(clip) {
        if (VE._veSelectedClips.indexOf(clip.id) >= 0) {
          var dup = VE._veCloneClip(clip);
          var origId = clip.id;
          dup.id = VE._veUid('clip');
          dup.startTime = clip.startTime + clip.duration + 0.1;

          // Overlay clips are backed by a fabric object on the shared canvas; clone it too, or the
          // duplicate's time range renders empty (owner: duplicated text had no canvas element).
          // Same requirement split already handles, via the shared helper.
          if (clip.type === 'overlay') VE._veCloneOverlayObject(origId, dup.id);

          // Clone videoPool entry — share the same <video>/<audio> element
          // so the duplicate can render frames (otherwise player shows black)
          var origEl = VE._vePlayback.videoPool[origId];
          if (origEl) {
            // Create a NEW media element pointing to the same source
            // so each clip can seek independently
            var newEl = document.createElement(origEl.tagName.toLowerCase());
            newEl.preload = 'auto';
            newEl.muted = true;
            newEl.src = origEl.src;
            // Append to DOM (offscreen) — browsers may not buffer video elements
            // that aren't in the document, causing readyState to stay at 0
            newEl.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
            document.body.appendChild(newEl);
            VE._vePlayback.videoPool[dup.id] = newEl;
            // Re-render when the new element is ready to draw
            (function(_dupEl) {
              _dupEl.addEventListener('canplay', function() {
                VE._veRenderPreviewFrame();
              }, { once: true });
            })(newEl);
          }

          toAdd.push({ clip: dup, srcTrack: track, origId: origId });
        }
      });
      toAdd.forEach(function(item) {
        if (!VE._veHasOverlap(item.srcTrack, item.clip.startTime, item.clip.duration, null)) {
          item.srcTrack.clips.push(item.clip);
        } else {
          var alt = VE._veFindNonOverlapTrack(item.clip.startTime, item.clip.duration, null);
          if (alt) alt.clips.push(item.clip);
          else item.srcTrack.clips.push(item.clip); // fallback
        }
      });
    });
    VE._vePushUndo();
    VE._veRecalcDuration();
    VE._veRender();
  };

  VE._veMoveClipTrack = function (direction) {
    if (!VE._veSelectedClips.length) return;
    var tracks = VE._veProject.tracks;
    for (var ti = 0; ti < tracks.length; ti++) {
      var track = tracks[ti];
      for (var ci = track.clips.length - 1; ci >= 0; ci--) {
        var clip = track.clips[ci];
        if (VE._veSelectedClips.indexOf(clip.id) >= 0) {
          var targetIdx = ti + direction;
          if (targetIdx < 0 || targetIdx >= tracks.length) return;
          if (VE._veHasOverlap(tracks[targetIdx], clip.startTime, clip.duration, clip.id)) return;
          track.clips.splice(ci, 1);
          tracks[targetIdx].clips.push(clip);
        }
      }
    }
    VE._vePushUndo();
    VE._veRender();
  };

  VE._veCloneClip = function (clip) {
    var c = {};
    for (var k in clip) {
      if (clip.hasOwnProperty(k)) {
        if (k === '_filmstripCache' || k === '_filmstripPending' || k === '_filmstripOrder' || k === '_filmstripRequestToken') {
          continue;
        } else if (k === '_thumbCache') {
          c[k] = clip[k] ? clip[k].slice() : [];
        } else if (Array.isArray(clip[k])) {
          /* EVERY array gets deep-cloned, not just a named few.

             This branch used to skip arrays entirely and fall through to `c[k] = clip[k]`, i.e. copy
             BY REFERENCE, so both halves of a split shared the same array objects: drag a window on
             the left half and it moved on the right half too, and one undo reverted both.

             It was first patched by naming `gradeNodes`/`powerWindows`. That was the wrong shape of
             fix: `clip.effects` (an array of {id, enabled, params}) has the SAME bug and was left
             aliased (measured: toggling an effect on one half toggled it on the other), and
             `clip.keyframes` has it too whenever clip-edit.js:154 builds it as an array rather than
             the object ve-keyframes.js:80 builds. A list you must remember to extend is a list the
             next field will be missing from, so the rule is now structural instead.

             JSON round-trips an array of primitives to itself, so this is also correct for string
             arrays; the catch is for anything non-serialisable (circular refs), which falls back to
             the old shallow copy rather than losing the field. */
          try { c[k] = JSON.parse(JSON.stringify(clip[k])); }
          catch (e) { c[k] = clip[k].slice(); }
        } else if (clip[k] && typeof clip[k] === 'object' && !(clip[k] instanceof HTMLElement)) {
          // Deep clone nested plain objects (filters, transitions, transform, eq, chromaKey, etc.)
          c[k] = JSON.parse(JSON.stringify(clip[k]));
        } else {
          c[k] = clip[k];
        }
      }
    }
    return c;
  };

  /* Clone the fabric object backing an overlay clip onto the shared canvas and re-link it to a NEW
     clip id. An overlay clip is a fabric object + a timeline clip joined by _veClipId, so ANY op
     that copies the clip (split, duplicate, paste) must also copy its fabric object, or the copy's
     time range renders EMPTY on canvas (owner: duplicated text had no canvas element). _veClipId is
     set BEFORE canvas.add so overlay.js object:added sees it already-linked and does NOT mint a
     second clip. Cached filter/transition state is dropped so the copy re-derives its own. Async
     (fabric clone uses a callback). Requires the source object to still be on canvas. */
  VE._veCloneOverlayObject = function (origClipId, newClipId) {
    if (typeof canvas === 'undefined' || !canvas) return;
    var srcObj = null;
    canvas.getObjects().forEach(function (obj) {
      if (obj._veClipId === origClipId) srcObj = obj;
    });
    if (!srcObj) return;
    srcObj.clone(function (cloned) {
      cloned._veClipId = newClipId;
      delete cloned._veLastFilterKey;
      delete cloned._veOrigRender;
      delete cloned._veFilterCSS;
      delete cloned._veOrigSaved;
      delete cloned._veTransActive;
      canvas.add(cloned);
      canvas.renderAll();
    });
  };

  VE._veStartClipDrag = function (e, clip, track) {
    if (track.locked) return;
    var startX = e.clientX;
    var startY = e.clientY;
    var origStart = clip.startTime;
    var origTrackId = track.id;
    var moved = false;

    /* Group drag: when the grabbed clip is part of a multi-selection, move EVERY selected clip by
       the SAME time delta so the block moves as one (owner: "toplu seçip kaydırmak"). A single
       selection keeps the original behaviour, including vertical cross-track move. `clip` is the
       primary (drives the delta). Locked / vanished clips are skipped. */
    var isGroup = VE._veSelectedClips.length > 1 && VE._veSelectedClips.indexOf(clip.id) >= 0;
    var group = [];          // [{ clip, origStart, origTrackIdx }]
    var groupIdSet = {};     // id -> true, for overlap exclusion within the group
    var minOrigStart = Infinity, minOrigTrackIdx = Infinity, maxOrigTrackIdx = -Infinity;
    var primaryOrigTrackIdx = VE._veProject.tracks.indexOf(track);
    var _grpLastTrackDelta = 0, _grpLastDt = 0;
    if (isGroup) {
      VE._veSelectedClips.forEach(function (id) {
        var c = VE._findClipById(id);
        if (!c) return;
        var t = VE._veFindTrackByClip(id);
        if (!t || t.locked) return;
        var ti = VE._veProject.tracks.indexOf(t);
        group.push({ clip: c, origStart: c.startTime, origTrackIdx: ti });
        groupIdSet[id] = true;
        if (c.startTime < minOrigStart) minOrigStart = c.startTime;
        if (ti < minOrigTrackIdx) minOrigTrackIdx = ti;
        if (ti > maxOrigTrackIdx) maxOrigTrackIdx = ti;
      });
      if (group.length < 2) isGroup = false; // nothing left to group after filtering
    }
    // A plain click (no modifier) on an already-multi-selected clip that does NOT become a drag
    // collapses the selection to just that clip on mouseup (standard NLE behaviour).
    var collapseOnClick = isGroup && !e.ctrlKey && !e.shiftKey;

    // Overlap test that excludes the WHOLE dragged group (they move together, so they never collide
    // with each other); true if start..start+dur hits any NON-group clip on that track.
    function _overlapSet(trk, start, dur) {
      var end = start + dur;
      for (var i = 0; i < trk.clips.length; i++) {
        var c = trk.clips[i];
        if (groupIdSet[c.id]) continue;
        if (start < c.startTime + c.duration && end > c.startTime) return true;
      }
      return false;
    }

    // Validate a candidate group move (trackDelta td, time-delta gdt): every clip must land on an
    // existing, unlocked track with no overlap against NON-group clips. Formation is rigid (uniform
    // deltas), so group clips never collide with each other.
    function _grpValid(td, gdt) {
      var tracks = VE._veProject.tracks;
      for (var i = 0; i < group.length; i++) {
        var trk = tracks[group[i].origTrackIdx + td];
        if (!trk || trk.locked) return false;
        if (_overlapSet(trk, Math.max(0, group[i].origStart + gdt), group[i].clip.duration)) return false;
      }
      return true;
    }
    // Place the group at (td, gdt) computed from the ORIGINAL snapshot: pull every group clip out of
    // all tracks, then drop each onto its target lane. Clip order within a track is irrelevant.
    function _grpPlace(td, gdt) {
      var tracks = VE._veProject.tracks;
      for (var t = 0; t < tracks.length; t++) {
        tracks[t].clips = tracks[t].clips.filter(function (c) { return !groupIdSet[c.id]; });
      }
      for (var i = 0; i < group.length; i++) {
        group[i].clip.startTime = Math.max(0, group[i].origStart + gdt);
        tracks[group[i].origTrackIdx + td].clips.push(group[i].clip);
      }
    }

    function onMove(ev) {
      var dx = ev.clientX - startX;
      var dy = ev.clientY - startY;
      moved = true;
      var dt = dx / VE._veProject.zoom;

      if (isGroup) {
        var tracks = VE._veProject.tracks;
        // Horizontal delta, clamped so no clip crosses 0 (relative spacing = formation preserved).
        var effDt = dt;
        if (minOrigStart + effDt < 0) effDt = -minOrigStart;
        // Vertical: one uniform track-index delta from the PRIMARY clip's pointer row, so the whole
        // group can be dragged UP/DOWN across track lanes (owner: move to track1/track2/track3 rows).
        // Clamped so the block never leaves the track list.
        var trackDelta = _grpLastTrackDelta;
        var cont = VE._veUi.tracksContainer;
        if (cont && primaryOrigTrackIdx >= 0) {
          var crect = cont.getBoundingClientRect();
          var crelY = ev.clientY - crect.top + (cont.parentElement ? cont.parentElement.scrollTop : 0);
          var tgtIdx = Math.max(0, Math.min(Math.floor(crelY / VE.TRACK_HEIGHT), tracks.length - 1));
          trackDelta = tgtIdx - primaryOrigTrackIdx;
        }
        trackDelta = Math.max(-minOrigTrackIdx, Math.min(trackDelta, (tracks.length - 1) - maxOrigTrackIdx));
        // Prefer the full 2-D move; if a lane/overlap blocks it, fall back so one axis never freezes
        // the other (still all-or-nothing per axis, so the group keeps its shape).
        if (_grpValid(trackDelta, effDt)) { _grpPlace(trackDelta, effDt); _grpLastTrackDelta = trackDelta; _grpLastDt = effDt; }
        else if (_grpValid(_grpLastTrackDelta, effDt)) { _grpPlace(_grpLastTrackDelta, effDt); _grpLastDt = effDt; }
        else if (_grpValid(trackDelta, _grpLastDt)) { _grpPlace(trackDelta, _grpLastDt); _grpLastTrackDelta = trackDelta; }
        VE._veRecalcDuration();
        VE._veRender();
        return;
      }

      // ── single-clip drag (unchanged) ──
      // Horizontal: time shift (prevent overlap on current track)
      var candidateStart = Math.max(0, VE._veSnapTime(origStart + dt, clip));
      var curTrack = VE._veFindTrackByClip(clip.id);
      if (curTrack && !VE._veHasOverlap(curTrack, candidateStart, clip.duration, clip.id)) {
        clip.startTime = candidateStart;
      }

      // Vertical: cross-track move
      if (Math.abs(dy) > VE.TRACK_HEIGHT / 2) {
        var container = VE._veUi.tracksContainer;
        if (container) {
          var rect = container.getBoundingClientRect();
          var relY = ev.clientY - rect.top + container.parentElement.scrollTop;
          var targetIdx = Math.floor(relY / VE.TRACK_HEIGHT);
          targetIdx = Math.max(0, Math.min(targetIdx, VE._veProject.tracks.length - 1));
          var targetTrack = VE._veProject.tracks[targetIdx];
          if (targetTrack && targetTrack.id !== origTrackId && !targetTrack.locked) {
            // Only move if no overlap on target track
            if (!VE._veHasOverlap(targetTrack, clip.startTime, clip.duration, clip.id)) {
              var srcTrack = VE._veFindTrackByClip(clip.id);
              if (srcTrack) {
                srcTrack.clips = srcTrack.clips.filter(function(c) { return c.id !== clip.id; });
                targetTrack.clips.push(clip);
                origTrackId = targetTrack.id;
              }
            }
          }
        }
      }

      VE._veRecalcDuration();
      VE._veRender();
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      VE._veClearSnapGuides();
      if (moved) {
        VE._vePushUndo();
      } else if (collapseOnClick) {
        // plain click, no drag → collapse the group to just this clip
        VE._veSelectedClips = [clip.id];
        VE._veRender();
        if (clip.type === 'overlay' && VE._veSelectOverlayObject) VE._veSelectOverlayObject(clip.id);
      }
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  VE._veFindTrackByClip = function (clipId) {
    for (var i = 0; i < VE._veProject.tracks.length; i++) {
      for (var j = 0; j < VE._veProject.tracks[i].clips.length; j++) {
        if (VE._veProject.tracks[i].clips[j].id === clipId) return VE._veProject.tracks[i];
      }
    }
    return null;
  };

  VE._findClipById = function (clipId) {
    for (var i = 0; i < VE._veProject.tracks.length; i++) {
      for (var j = 0; j < VE._veProject.tracks[i].clips.length; j++) {
        if (VE._veProject.tracks[i].clips[j].id === clipId) return VE._veProject.tracks[i].clips[j];
      }
    }
    return null;
  };

  VE._veSnapTime = function (time, excludeClip) {
    if (!VE._veSnapEnabled) return time;
    var snapPoints = [0];
    VE._veProject.tracks.forEach(function(track) {
      track.clips.forEach(function(c) {
        if (excludeClip && c.id === excludeClip.id) return;
        snapPoints.push(c.startTime);
        snapPoints.push(c.startTime + c.duration);
      });
    });
    // Snap to playhead
    snapPoints.push(VE._veProject.playheadTime);
    // Snap to markers
    if (VE._veProject.markers) {
      VE._veProject.markers.forEach(function(m) { snapPoints.push(m.time); });
    }

    var threshold = VE.SNAP_THRESHOLD / VE._veProject.zoom;
    var bestDist = Infinity;
    var bestPoint = time;
    for (var i = 0; i < snapPoints.length; i++) {
      var dist = Math.abs(time - snapPoints[i]);
      if (dist < threshold && dist < bestDist) {
        bestDist = dist;
        bestPoint = snapPoints[i];
      }
    }

    // Show/hide snap guide line
    VE._veClearSnapGuides();
    if (bestPoint !== time) {
      VE._veShowSnapGuide(bestPoint);
    }
    return bestPoint;
  };

  VE._veShowSnapGuide = function (time) {
    var container = VE._veUi.tracksContainer;
    if (!container) return;
    var px = Math.round(time * VE._veProject.zoom);
    var guide = document.createElement('div');
    guide.className = 've-snap-guide';
    guide.style.cssText = 'position:absolute;left:' + px + 'px;top:0;bottom:0;width:1px;' +
      'background:var(--gold,#f2ff58);opacity:0.7;pointer-events:none;z-index:100;';
    container.appendChild(guide);
    VE._veSnapGuides.push(guide);
  };

  VE._veClearSnapGuides = function () {
    VE._veSnapGuides.forEach(function(g) { if (g.parentNode) g.parentNode.removeChild(g); });
    VE._veSnapGuides = [];
  };

  VE._veToggleSnap = function () {
    VE._veSnapEnabled = !VE._veSnapEnabled;
    if (!VE._veSnapEnabled) VE._veClearSnapGuides();
    // Update toolbar snap indicator if it exists
    var indicator = VE._veUi.host && VE._veUi.host.querySelector('.ve-snap-indicator');
    if (indicator) {
      indicator.textContent = VE._veSnapEnabled ? 'Snap: ON' : 'Snap: OFF';
      indicator.style.opacity = VE._veSnapEnabled ? '1' : '0.4';
    }
  };

  VE._veCopySelected = function () {
    VE._veClipboard = [];
    VE._veProject.tracks.forEach(function(track) {
      track.clips.forEach(function(c) {
        if (VE._veSelectedClips.indexOf(c.id) >= 0) {
          VE._veClipboard.push({ clip: VE._veCloneClip(c), trackId: track.id });
        }
      });
    });
  };

  VE._vePasteClips = function () {
    if (!VE._veClipboard.length) return;
    var baseTime = VE._veProject.playheadTime;
    var minStart = Infinity;
    VE._veClipboard.forEach(function(item) {
      if (item.clip.startTime < minStart) minStart = item.clip.startTime;
    });
    VE._veClipboard.forEach(function(item) {
      var newClip = VE._veCloneClip(item.clip);
      var origId = item.clip.id;
      newClip.id = VE._veUid('clip');
      newClip.startTime = baseTime + (item.clip.startTime - minStart);
      var target = VE._veProject.tracks.filter(function(t) { return t.id === item.trackId; })[0];
      if (!target) target = VE._veProject.tracks[0];
      if (target && VE._veHasOverlap(target, newClip.startTime, newClip.duration, null)) {
        var alt = VE._veFindNonOverlapTrack(newClip.startTime, newClip.duration, null);
        if (alt) target = alt;
      }
      if (target) {
        // Insert mode (Phase 10): push subsequent clips right
        if (VE._veEditMode === 'insert') {
          target.clips.forEach(function(c) {
            if (c.startTime >= newClip.startTime) {
              c.startTime += newClip.duration;
            }
          });
        }
        target.clips.push(newClip);
        // Overlay: clone the backing fabric object (same as duplicate/split) or the pasted clip
        // renders nothing. Needs the source object still on canvas (the common copy-then-paste case).
        if (newClip.type === 'overlay') {
          VE._veCloneOverlayObject(origId, newClip.id);
        } else {
          // Video/audio: give the paste its own pooled media element sharing the source, so it
          // renders/plays instead of showing black (paste previously created no pool entry at all).
          var _srcEl = VE._vePlayback.videoPool[origId];
          if (_srcEl && _srcEl.src) {
            var _newEl = document.createElement(_srcEl.tagName.toLowerCase());
            _newEl.preload = 'auto'; _newEl.muted = true; _newEl.src = _srcEl.src;
            _newEl.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
            document.body.appendChild(_newEl);
            VE._vePlayback.videoPool[newClip.id] = _newEl;
            if (window.VEAudioEngine && VEAudioEngine.connectClip) VEAudioEngine.connectClip(newClip.id, _newEl, target.id, newClip.volume);
            (function (_e) { _e.addEventListener('canplay', function () { VE._veRenderPreviewFrame(); }, { once: true }); })(_newEl);
          }
        }
      }
    });
    VE._vePushUndo();
    VE._veRecalcDuration();
    VE._veRender();
  };

  // Neighbour that shares this edge, i.e. sits flush against it. Rolling only makes sense on a
  // real cut point; a clip with a gap next to it is an ordinary trim.
  VE._veFindRollNeighbour = function (clip, track, side) {
    var edge = side === 'left' ? clip.startTime : clip.startTime + clip.duration;
    var eps = 0.002;
    for (var i = 0; i < track.clips.length; i++) {
      var c = track.clips[i];
      if (c.id === clip.id) continue;
      var other = side === 'left' ? c.startTime + c.duration : c.startTime;
      if (Math.abs(other - edge) < eps) return c;
    }
    return null;
  };

  VE._veStartTrim = function (e, clip, track, side) {
    if (track.locked) return;
    e.preventDefault();
    e.stopPropagation();
    var startX = e.clientX;
    var origStart = clip.startTime;
    var origDuration = clip.duration;
    var origTrimStart = clip.trimStart;
    var origTrimEnd = clip.trimEnd;

    // ── Rolling edit: Alt + drag a shared edge ──
    // Live cutting always lands a bit early or late; rolling the boundary is the standard
    // cleanup and we had none — dragging a cut point just gapped it. Alt keeps this additive:
    // a plain drag behaves exactly as before. Same "Alt = the other thing" idiom as the
    // monitor's Alt+click (switch without cutting).
    var rollWith = e.altKey ? VE._veFindRollNeighbour(clip, track, side) : null;
    if (rollWith) {
      var nOrigStart = rollWith.startTime;
      var nOrigDur = rollWith.duration;
      var nOrigTrimStart = rollWith.trimStart;
      var nOrigTrimEnd = rollWith.trimEnd;

      // How far the boundary may travel each way before something runs out. Sign convention:
      // dt > 0 moves the boundary right (later in time).
      function _rollLimits() {
        // `left` side: `clip` is the RIGHT half, `rollWith` is the LEFT half.
        var right = side === 'left' ? clip : rollWith;
        var left = side === 'left' ? rollWith : clip;
        var rSpeed = right.speed || 1, lSpeed = left.speed || 1;
        // Boundary right: left grows (needs its trimEnd headroom), right shrinks.
        var maxRight = Math.min(
          (left.trimEnd || 0) / lSpeed,                       // media left at the left clip's tail
          Math.max(0, right.duration - VE.MIN_CLIP_DURATION)  // right must stay alive
        );
        // Boundary left: right grows (needs its trimStart headroom), left shrinks.
        var maxLeft = Math.min(
          (right.trimStart || 0) / rSpeed,
          Math.max(0, left.duration - VE.MIN_CLIP_DURATION)
        );
        return { maxRight: Math.max(0, maxRight), maxLeft: Math.max(0, maxLeft) };
      }
      var lim = _rollLimits();

      function onRollMove(ev) {
        var dt = (ev.clientX - startX) / VE._veProject.zoom;
        if (dt > lim.maxRight) dt = lim.maxRight;
        if (dt < -lim.maxLeft) dt = -lim.maxLeft;
        if (side === 'left') {
          // clip = right half, rollWith = left half
          clip.startTime = origStart + dt;
          clip.duration = origDuration - dt;
          clip.trimStart = origTrimStart + dt * (clip.speed || 1);
          rollWith.duration = nOrigDur + dt;
          rollWith.trimEnd = Math.max(0, nOrigTrimEnd - dt * (rollWith.speed || 1));
        } else {
          // clip = left half, rollWith = right half
          clip.duration = origDuration + dt;
          clip.trimEnd = Math.max(0, origTrimEnd - dt * (clip.speed || 1));
          rollWith.startTime = nOrigStart + dt;
          rollWith.duration = nOrigDur - dt;
          rollWith.trimStart = nOrigTrimStart + dt * (rollWith.speed || 1);
        }
        VE._veRender();
      }

      function onRollUp() {
        document.removeEventListener('mousemove', onRollMove);
        document.removeEventListener('mouseup', onRollUp);
        [clip, rollWith].forEach(function (c) {
          if (c.type === 'video' && VE._vePlayback.videoPool[c.id]) {
            VE._veGenerateThumbnails(c, VE._vePlayback.videoPool[c.id]);
          }
        });
        VE._veRenderPreviewFrame && VE._veRenderPreviewFrame();
        VE._vePushUndo();
      }

      document.addEventListener('mousemove', onRollMove);
      document.addEventListener('mouseup', onRollUp);
      return;
    }

    function onMove(ev) {
      var dx = ev.clientX - startX;
      var dt = dx / VE._veProject.zoom;
      if (side === 'left') {
        var newStart = Math.max(0, origStart + dt);
        var newDuration = origDuration - (newStart - origStart);
        if (newDuration < VE.MIN_CLIP_DURATION) return;
        if (VE._veHasOverlap(track, newStart, newDuration, clip.id)) return;
        clip.startTime = newStart;
        clip.duration = newDuration;
        clip.trimStart = origTrimStart + (newStart - origStart) * clip.speed;
      } else {
        var newDur = Math.max(VE.MIN_CLIP_DURATION, origDuration + dt);
        // Cap extension at source duration (prevent extending past actual media length)
        var srcDur = clip._srcDuration || 0;
        if (srcDur > 0 && clip.speed > 0) {
          var maxDur = (srcDur - (clip.trimStart || 0)) / clip.speed;
          if (newDur > maxDur) newDur = maxDur;
        }
        if (VE._veHasOverlap(track, clip.startTime, newDur, clip.id)) return;
        clip.duration = newDur;
        clip.trimEnd = Math.max(0, origTrimEnd - (newDur - origDuration) * clip.speed);
      }
      VE._veRecalcDuration();
      VE._veRender();
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);

      // Ripple mode: shift subsequent clips to fill/compensate for trimmed duration
      if (VE._veEditMode === 'ripple') {
        var durChange = clip.duration - origDuration;
        if (Math.abs(durChange) > 0.001) {
          track.clips.forEach(function(c) {
            if (c.id === clip.id) return;
            if (c.startTime > clip.startTime) {
              c.startTime = Math.max(0, c.startTime + durChange);
            }
          });
        }
      }

      // Regenerate thumbnails after trim/extend (loop-aware)
      if (clip.type === 'video' && VE._vePlayback.videoPool[clip.id]) {
        VE._veGenerateThumbnails(clip, VE._vePlayback.videoPool[clip.id]);
      }
      VE._vePushUndo();
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'clips', parent: 'video.video-editor', title: 'video-editor: clips', mount: function () {}, unmount: function () {} });
  }
})();
