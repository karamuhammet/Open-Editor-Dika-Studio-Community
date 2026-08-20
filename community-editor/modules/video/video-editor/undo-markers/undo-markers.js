/* Module: video/video-editor/undo-markers — UNDO + MARKERS — undo/redo stack and the marker system.
   Part of the video-editor group (decomposed from the 7695-line IIFE). Functions hang off the
   shared namespace VE (window.__ccVideoEditor, created by the parent); cross-module refs resolve
   through VE at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VE = window.__ccVideoEditor;
  if (!VE) return;

  // scan-3000 H21: snapshots strip the heavy per-clip payloads (up to 40 JPEG
  // data URLs in _thumbCache + waveform per clip); with MAX_UNDO 80 these were
  // multi-hundred-MB steady state in long sessions. Thumbs are cosmetic and
  // regenerate; the clone path (clips.js) already strips the same keys.
  function _veSnapshotTracks() {
    return JSON.stringify(VE._veProject.tracks, function (k, v) {
      if (k === '_thumbCache' || k === '_waveformUrl' || k === '_mediaInfo' || k === '_file'
          || k === '_filmstripCache' || k === '_filmstripPending' || k === '_filmstripOrder' || k === '_filmstripRequestToken') return undefined;
      return v;
    });
  }

  VE._vePushUndo = function (label) {
    var snapshot = _veSnapshotTracks();
    // Avoid duplicate snapshots
    if (VE._veUndoStack.length > 0 && VE._veUndoStack[VE._veUndoIdx] &&
        VE._veUndoStack[VE._veUndoIdx].snapshot === snapshot) return;

    var cmd = {
      label: label || 'edit',
      snapshot: snapshot,
      playheadTime: VE._veProject.playheadTime,
      selectedClips: VE._veSelectedClips.slice(),
      timestamp: Date.now()
    };

    if (VE._veUndoGroupName) {
      VE._veUndoGroupCmds.push(cmd);
      return; // don't push until endGroup
    }

    if (VE._veUndoIdx < VE._veUndoStack.length - 1) {
      VE._veUndoStack = VE._veUndoStack.slice(0, VE._veUndoIdx + 1);
    }
    VE._veUndoStack.push(cmd);
    if (VE._veUndoStack.length > VE.MAX_UNDO) VE._veUndoStack.shift();
    VE._veUndoIdx = VE._veUndoStack.length - 1;
  };

  VE._veBeginUndoGroup = function (name) {
    VE._veUndoGroupName = name || 'group';
    VE._veUndoGroupCmds = [];
    // Snapshot before the group starts
    VE._veUndoGroupCmds.push({
      label: VE._veUndoGroupName + ' (before)',
      snapshot: _veSnapshotTracks(),
      playheadTime: VE._veProject.playheadTime,
      selectedClips: VE._veSelectedClips.slice(),
      timestamp: Date.now()
    });
  };

  VE._veEndUndoGroup = function () {
    if (!VE._veUndoGroupName) return;
    var finalCmd = {
      label: VE._veUndoGroupName,
      snapshot: _veSnapshotTracks(),
      playheadTime: VE._veProject.playheadTime,
      selectedClips: VE._veSelectedClips.slice(),
      timestamp: Date.now(),
      // Store the 'before' snapshot for proper undo
      _beforeSnapshot: VE._veUndoGroupCmds.length > 0 ? VE._veUndoGroupCmds[0].snapshot : null
    };
    VE._veUndoGroupName = null;
    VE._veUndoGroupCmds = [];

    if (VE._veUndoIdx < VE._veUndoStack.length - 1) {
      VE._veUndoStack = VE._veUndoStack.slice(0, VE._veUndoIdx + 1);
    }
    VE._veUndoStack.push(finalCmd);
    if (VE._veUndoStack.length > VE.MAX_UNDO) VE._veUndoStack.shift();
    VE._veUndoIdx = VE._veUndoStack.length - 1;
  };

  VE._veAddMarker = function (time, label, opts) {
    if (!VE._veProject.markers) VE._veProject.markers = [];
    opts = opts || {};
    var marker = {
      id: 'mk-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      time: time != null ? time : VE._veProject.playheadTime,
      label: label || 'Marker ' + (VE._veProject.markers.length + 1),
      color: opts.color || VE._veMarkerColors[VE._veProject.markers.length % VE._veMarkerColors.length],
      type: opts.type || 'point',     // 'point' | 'range' | 'chapter' | 'todo'
      endTime: opts.endTime || null,  // for range markers
      note: opts.note || '',          // detailed description
      done: false                     // for todo markers
    };
    VE._veProject.markers.push(marker);
    VE._veProject.markers.sort(function(a, b) { return a.time - b.time; });
    VE._vePushUndo('add marker');
    VE._veRender();
    return marker;
  };

  VE._veAddRangeMarker = function (startTime, endTime, label) {
    return VE._veAddMarker(startTime, label || 'Region', {
      type: 'range',
      endTime: endTime,
      color: '#4fc3f7'
    });
  };

  VE._veAddChapterMarker = function (time, label) {
    return VE._veAddMarker(time, label || 'Chapter', {
      type: 'chapter',
      color: '#81c784'
    });
  };

  VE._veToggleTodoMarker = function (markerId) {
    if (!VE._veProject.markers) return;
    var marker = VE._veProject.markers.filter(function(m) { return m.id === markerId; })[0];
    if (marker && marker.type === 'todo') {
      marker.done = !marker.done;
      VE._veRender();
    }
  };

  VE._veDeleteMarker = function (markerId) {
    if (!VE._veProject.markers) return;
    VE._veProject.markers = VE._veProject.markers.filter(function(m) { return m.id !== markerId; });
    VE._vePushUndo();
    VE._veRender();
  };

  VE._veSeekToPrevMarker = function () {
    if (!VE._veProject.markers || !VE._veProject.markers.length) return;
    var t = VE._veProject.playheadTime;
    for (var i = VE._veProject.markers.length - 1; i >= 0; i--) {
      if (VE._veProject.markers[i].time < t - 0.05) {
        VE._veSeek(VE._veProject.markers[i].time);
        return;
      }
    }
  };

  VE._veSeekToNextMarker = function () {
    if (!VE._veProject.markers || !VE._veProject.markers.length) return;
    var t = VE._veProject.playheadTime;
    for (var i = 0; i < VE._veProject.markers.length; i++) {
      if (VE._veProject.markers[i].time > t + 0.05) {
        VE._veSeek(VE._veProject.markers[i].time);
        return;
      }
    }
  };

  VE._veShowMarkerMenu = function (marker, e) {
    var old = document.getElementById('ve-marker-menu');
    if (old) old.remove();
    var menu = document.createElement('div');
    menu.id = 've-marker-menu';
    menu.className = 've-ctx-menu';
    var typeLabel = marker.type === 'chapter' ? ' (Chapter)' : marker.type === 'todo' ? ' (Todo)' : marker.type === 'range' ? ' (Range)' : '';
    menu.innerHTML =
      '<div class="ve-ctx-item" data-action="rename">Rename</div>' +
      '<div class="ve-ctx-item" data-action="note">Edit Note</div>' +
      '<div class="ve-ctx-item" data-action="type">Type: ' + (marker.type || 'point') + typeLabel + '</div>' +
      '<div class="ve-ctx-item" data-action="color">Change Color</div>' +
      (marker.type === 'todo' ? '<div class="ve-ctx-item" data-action="toggle-done">' + (marker.done ? 'Mark Incomplete' : 'Mark Done') + '</div>' : '') +
      '<div class="ve-ctx-item ve-ctx-danger" data-action="delete">Delete</div>';
    menu.style.cssText = 'position:fixed;left:' + e.clientX + 'px;top:' + e.clientY + 'px;z-index:10002';
    menu.addEventListener('click', function(ev) {
      var item = ev.target.closest('[data-action]');
      if (!item) return;
      var action = item.getAttribute('data-action');
      if (action === 'rename') {
        var newLabel = prompt('Marker label:', marker.label);
        if (newLabel !== null) { marker.label = newLabel; VE._veRender(); }
      } else if (action === 'note') {
        var newNote = prompt('Marker note:', marker.note || '');
        if (newNote !== null) { marker.note = newNote; VE._veRender(); }
      } else if (action === 'type') {
        var types = ['point', 'range', 'chapter', 'todo'];
        var curIdx = types.indexOf(marker.type || 'point');
        marker.type = types[(curIdx + 1) % types.length];
        if (marker.type === 'range' && !marker.endTime) {
          marker.endTime = marker.time + 5; // default 5s range
        }
        VE._veRender();
      } else if (action === 'color') {
        var idx = VE._veMarkerColors.indexOf(marker.color);
        marker.color = VE._veMarkerColors[(idx + 1) % VE._veMarkerColors.length];
        VE._veRender();
      } else if (action === 'toggle-done') {
        VE._veToggleTodoMarker(marker.id);
      } else if (action === 'delete') {
        VE._veDeleteMarker(marker.id);
      }
      menu.remove();
    });
    document.body.appendChild(menu);
    setTimeout(function() {
      document.addEventListener('click', function remove() {
        menu.remove();
        document.removeEventListener('click', remove);
      }, { once: true });
    }, 50);
  };

  // After a snapshot restore the track/clip objects are brand-new JSON: media
  // pool elements survive (keyed by clip id) but the audio engine still holds
  // connections for the OLD clip objects. Reconnect, same as _veRestoreProject.
  // A pool entry released on delete (H16) is lazily REBUILT from clip.src so
  // undoing a delete brings the media back playable.
  VE._veReconnectAfterRestore = function () {
    VE._veProject.tracks.forEach(function (track) {
      track.clips.forEach(function (clip) {
        if (clip.type !== 'video' && clip.type !== 'audio') return;
        var el = VE._vePlayback.videoPool[clip.id];
        /* M2 (export plan): rebuilding from `clip.src` alone resurrects a CORPSE across a reload -
           a blob: URL minted in a previous session is dead, so undoing a delete brought the clip
           back as black picture and silent audio. Prefer the durable library URL, and when all we
           have is a blob:, re-link the real bytes from IndexedDB exactly like _veRestoreProject. */
        var _srcNow = (clip._ccAssetUrl || clip.src) || null;
        if (!el && _srcNow) {
          el = document.createElement(clip.type === 'audio' ? 'audio' : 'video');
          el.preload = 'auto';
          el.muted = clip.type !== 'audio';
          VE._veSetMediaSrc(el, _srcNow);   // S5/M1
          if (clip._ccMediaId && el.setAttribute) el.setAttribute('data-cc-media-id', clip._ccMediaId);
          VE._vePlayback.videoPool[clip.id] = el;
          if (_srcNow.indexOf('blob:') === 0 && clip._ccMediaId && window.VEPersistence && VEPersistence.loadMedia) {
            (function (elem, cl) {
              VEPersistence.loadMedia(cl._ccMediaId).then(function (blob) {
                if (!blob) return;
                try {
                  var fresh = URL.createObjectURL(blob);
                  elem.src = fresh; cl.src = fresh;
                  if (elem.load) elem.load();
                } catch (e) { /* keep whatever we had */ }
              }).catch(function () {});
            })(el, clip);
          }
        }
        if (el && window.VEAudioEngine) VEAudioEngine.connectClip(clip.id, el, track.id, clip.volume);
      });
    });

    /* Undo/redo does `VE._veProject.tracks = JSON.parse(snapshot)`: EVERY clip object is replaced.
       Ids survive, object identity does not. This function already existed to re-attach the audio
       engine to the new objects, which means the authors knew - but every OTHER open surface was
       left holding the dead ones.

       Measured before this: with the colour toolbar open, one Ctrl+Z left it showing the pre-undo
       chain, and every subsequent edit went into a clip that is no longer in the project. The
       inspector's Color Grading panel has the same disease through its bound closures (`_bindCg`
       captures `cg` at render time), so it must repaint, not just re-resolve.

       Panels that resolve by id on every access do not need this; repainting them is still correct
       because their CONTENTS (counts, chips, the node list) are now stale. */
    var _live = VE._veSelectedClips && VE._veSelectedClips.length
      ? (VE._findClipById ? VE._findClipById(VE._veSelectedClips[0]) : null) : null;

    if (window.VEPowerWindows && VEPowerWindows.isOpen()) {
      if (_live) VEPowerWindows.open(_live);   // re-targets by id; no-op if already on this clip
      else VEPowerWindows.close();             // the clip an undo removed cannot keep being edited
    }
    if (window.VEColorTools && VEColorTools.isOpen()) VEColorTools.refresh();
    // Re-render, do not just re-resolve: the CG panel's sliders/curves/wheels are bound in closures
    // that captured the OLD grade object, and only a repaint rebinds them.
    if (window.VEInspector && _live) {
      if (VEInspector.isCgModalOpen && VEInspector.isCgModalOpen()) {
        VEInspector.closeCgModal(); VEInspector.showCgModal(_live.id);
      }
      if (VEInspector.isOpen && VEInspector.isOpen()) VEInspector.show(_live.id);
    }
    var _lb = document.getElementById('ve-lut-browser');
    if (_lb && VE._veShowLutBrowser) { _lb.remove(); VE._veShowLutBrowser(); }

    /* Same disease, cue half: a snapshot restore can remove the very cues that are selected, and a
       dead id in `_veSelectedCues` aims the trash button and Del at nothing while the on-canvas
       Textbox proxy keeps showing a cue that is no longer in the project. Prune the ids, then drop
       the proxy if the cue it edits is gone. */
    if (VE._veSelectedCues && VE._veSelectedCues.length && VE._veFindCueById) {
      VE._veSelectedCues = VE._veSelectedCues.filter(function (id) { return !!VE._veFindCueById(id); });
    }
    var _pxCue = (window.VESubtitleElement && VESubtitleElement.getSelectedCueId) ? VESubtitleElement.getSelectedCueId() : null;
    if (_pxCue && VE._veFindCueById && !VE._veFindCueById(_pxCue)) {
      VESubtitleElement.deselect(true);
      VE._veSelectedCueId = null;
      VE._veSelectedSubtitleTrackId = null;
    }
    if (VE._veSelectedCueId && VE._veFindCueById && !VE._veFindCueById(VE._veSelectedCueId)) {
      VE._veSelectedCueId = null;
    }
    /* The left subtitle panel addresses cues by ROW INDEX (`data-idx`), so a restore that changes the
       cue list leaves every one of its play / split / merge / delete buttons pointing at a different
       cue than the row they sit on. Repaint, do not just re-resolve. */
    if (window.VESubtitlePanel && VESubtitlePanel.isOpen && VESubtitlePanel.isOpen() && VESubtitlePanel.render) {
      VESubtitlePanel.render();
    }
  };

  VE._veUndo = function () {
    if (VE._veUndoIdx <= 0) return;
    var currentCmd = VE._veUndoStack[VE._veUndoIdx];
    VE._veUndoIdx--;
    var cmd = VE._veUndoStack[VE._veUndoIdx];
    // For grouped commands, restore the 'before' snapshot
    var snapshot = (currentCmd && currentCmd._beforeSnapshot) || cmd.snapshot;
    VE._veProject.tracks = JSON.parse(snapshot);
    if (cmd.playheadTime != null) VE._veProject.playheadTime = cmd.playheadTime;
    if (cmd.selectedClips) VE._veSelectedClips = cmd.selectedClips.slice();
    VE._veReconnectAfterRestore();
    VE._veRecalcDuration();
    VE._veRender();
    VE._veRenderPreviewFrame();
  };

  VE._veRedo = function () {
    if (VE._veUndoIdx >= VE._veUndoStack.length - 1) return;
    VE._veUndoIdx++;
    var cmd = VE._veUndoStack[VE._veUndoIdx];
    VE._veProject.tracks = JSON.parse(cmd.snapshot);
    if (cmd.playheadTime != null) VE._veProject.playheadTime = cmd.playheadTime;
    if (cmd.selectedClips) VE._veSelectedClips = cmd.selectedClips.slice();
    VE._veReconnectAfterRestore();
    VE._veRecalcDuration();
    VE._veRender();
    VE._veRenderPreviewFrame();
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'undo-markers', parent: 'video.video-editor', title: 'video-editor: undo-markers', mount: function () {}, unmount: function () {} });
  }
})();
