/* Module: video/video-editor/multicam — MULTI-CAM — the angle model + the angle-switch primitive.
   Part of the video-editor group. Functions hang off the shared namespace VE
   (window.__ccVideoEditor, created by the parent); cross-module refs resolve through VE at call
   time, so sibling load order does not matter.

   A multicam clip is a NORMAL type:'video' clip. Everything keys off `mcAngles`, never off a new
   clip.type — the same rule the subtitle system settled on (render.js migrates legacy
   type:'subtitle' tracks away because "everything subtitle keys off cues, not the type"). Minting
   a type here would make the clip invisible to 66 hardcoded type==='video' gates, nearly all of
   which fail silently. Staying type:'video' is what makes split, undo, reload, thumbnails,
   duplicate, background-set and every inspector section keep working untouched.

   Angle SOURCES are parked in the pool under 'mcsrc:'+srcId. No clip.id can equal that key, so
   _veReleasePoolEntry (clips.js) can never destroy them, while poolMeta's key-agnostic loop
   (project.js) still persists their blobs.

   Plan: docs/multicam-rebuild-plan-v2.md */
(function () {
  'use strict';
  var VE = window.__ccVideoEditor;
  if (!VE) return;

  var MCSRC = 'mcsrc:';
  var OFFSCREEN = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';

  // srcId → File. Runtime only, deliberately NOT inside mcAngles: angle values cross four JSON
  // round-trips (clone, serialize, undo snapshot, restore) so they must stay JSON primitives, and
  // a File would silently become {}. Mirrors clip._file, which is itself never serialized.
  VE._veMcSrcFiles = VE._veMcSrcFiles || {};

  function _pool() {
    return (VE._vePlayback && VE._vePlayback.videoPool) || null;
  }

  function _findClipAndTrack(clipId) {
    var tracks = (VE._veProject && VE._veProject.tracks) || [];
    for (var i = 0; i < tracks.length; i++) {
      for (var j = 0; j < tracks[i].clips.length; j++) {
        if (tracks[i].clips[j].id === clipId) return { clip: tracks[i].clips[j], track: tracks[i] };
      }
    }
    return null;
  }

  VE._veMcSrcKey = function (srcId) { return MCSRC + srcId; };

  VE._veMcIsMulticam = function (clip) {
    return !!(clip && clip.mcAngles && typeof clip.mcAngles === 'object' &&
              !Array.isArray(clip.mcAngles) && Object.keys(clip.mcAngles).length > 0);
  };

  VE._veMcAngleCount = function (clip) {
    return VE._veMcIsMulticam(clip) ? Object.keys(clip.mcAngles).length : 0;
  };

  VE._veMcGetAngle = function (clip, idx) {
    if (!VE._veMcIsMulticam(clip)) return null;
    return clip.mcAngles[String(idx)] || null;
  };

  VE._veMcActiveAngle = function (clip) {
    return VE._veMcGetAngle(clip, clip.mcActive || 0);
  };

  // Park an angle source: an idle element, never played, that keeps the blob alive and is the
  // thing cloned on switch. `file` is optional and rides the runtime map, not the angle.
  VE._veMcParkSource = function (srcId, mediaEl, file) {
    var pool = _pool();
    if (!pool || !srcId || !mediaEl) return false;
    if (file) VE._veMcSrcFiles[srcId] = file;
    var key = MCSRC + srcId;
    if (pool[key] === mediaEl) return true;
    mediaEl.style.cssText = OFFSCREEN;
    mediaEl.muted = true;
    try { mediaEl.pause(); } catch (e) {}
    if (!mediaEl.parentNode) document.body.appendChild(mediaEl);
    pool[key] = mediaEl;
    return true;
  };

  VE._veMcGetSource = function (srcId) {
    var pool = _pool();
    return (pool && pool[MCSRC + srcId]) || null;
  };

  // Convention, which the sync engine (Phase C) must agree with: angle.offset is where this
  // angle's media 0:00 sits on the shared sync axis. A clip's position on that axis is
  // (trimStart + activeAngle.offset); switching must preserve it, so the same real moment stays
  // under the playhead.
  VE._veMcTrimForAngle = function (clip, fromAngle, toAngle) {
    var next = (clip.trimStart || 0) +
               ((fromAngle && fromAngle.offset) || 0) -
               ((toAngle && toAngle.offset) || 0);
    if (next < 0) next = 0;
    var srcDur = toAngle && toAngle.srcDuration;
    if (srcDur && next + (clip.duration || 0) > srcDur) {
      next = Math.max(0, srcDur - (clip.duration || 0));
    }
    return next;
  };

  // THE primitive: make angle `idx` the live one for `clipId`.
  VE._veMcSwitchAngle = function (clipId, idx) {
    var hit = _findClipAndTrack(clipId);
    if (!hit) return false;
    var clip = hit.clip;
    if (!VE._veMcIsMulticam(clip)) return false;

    var toAngle = VE._veMcGetAngle(clip, idx);
    if (!toAngle) return false;
    var srcEl = VE._veMcGetSource(toAngle.srcId);
    if (!srcEl) return false;

    var pool = _pool();
    if (!pool) return false;
    var fromAngle = VE._veMcActiveAngle(clip);

    // Tear down the live element first. disconnectClip must FORGET the node, or the connectClip
    // below is swallowed by its `connected` guard and the new element is silently never wired.
    if (window.VEAudioEngine) VEAudioEngine.disconnectClip(clip.id);
    if (pool[clip.id]) VE._veReleasePoolEntry(clip.id);

    // Clone; never hand out the parked source itself. An element may be passed to
    // createMediaElementSource only once (Web Audio spec), so the parked one stays untouched and
    // reusable for every future switch.
    var newEl = srcEl.cloneNode(true);
    newEl.style.cssText = OFFSCREEN;
    newEl.muted = true;
    document.body.appendChild(newEl);
    pool[clip.id] = newEl;

    // clip.src/_file must keep pointing at the ACTIVE angle: _veReconnectAfterRestore rebuilds
    // the pool from clip.src (undo AND reload), and _veProjectHasAudio gates the entire export
    // audio path on _file.
    clip.src = toAngle.src || srcEl.src || srcEl.currentSrc || clip.src;
    if (VE._veMcSrcFiles[toAngle.srcId]) clip._file = VE._veMcSrcFiles[toAngle.srcId];
    clip.trimStart = VE._veMcTrimForAngle(clip, fromAngle, toAngle);
    clip.mcActive = idx;

    if (window.VEAudioEngine) {
      VEAudioEngine.connectClip(clip.id, newEl, hit.track.id, clip.volume);
    }
    if (VE._veGenerateThumbnails) VE._veGenerateThumbnails(clip, newEl);
    return true;
  };

  // Every clip that belongs to the same multicam source.
  VE._veMcSiblings = function (groupId) {
    var out = [];
    if (!groupId) return out;
    (VE._veProject.tracks || []).forEach(function (t) {
      t.clips.forEach(function (c) { if (c.mcGroupId === groupId) out.push(c); });
    });
    return out;
  };

  // Rename / reorder / hide angles across a WHOLE multicam group.
  //   order  : array of OLD indices in their new order, e.g. [2,0,1] means "angle 2 becomes 1"
  //   labels : { oldIdx: 'name' }   (optional, omitted keys keep their label)
  //   hidden : { oldIdx: true }     (optional, display-only)
  //
  // THE TRAP this function exists to contain: mcAngles keys ARE the angle numbers the 1-9 keys
  // address, and mcActive is one of those keys. Reordering one clip's angles without remapping
  // every SIBLING's mcActive would silently repoint every other cut at the wrong camera — a
  // 13-cut edit would scramble with no error. So the remap is applied to the whole group, and
  // each sibling's mcActive travels through the same map.
  VE._veMcReorderAngles = function (groupId, order, labels, hidden) {
    var sibs = VE._veMcSiblings(groupId);
    if (!sibs.length || !order || !order.length) return false;
    labels = labels || {};
    hidden = hidden || {};

    var map = {};                                    // oldIdx -> newIdx
    order.forEach(function (oldIdx, newIdx) { map[String(oldIdx)] = newIdx; });

    sibs.forEach(function (c) {
      if (!VE._veMcIsMulticam(c)) return;
      var old = c.mcAngles, next = {};
      order.forEach(function (oldIdx, newIdx) {
        var a = old[String(oldIdx)];
        if (!a) return;
        // Rebuilt field by field: angle values must stay JSON primitives (they cross four
        // JSON round-trips), so never carry anything but these across.
        next[String(newIdx)] = {
          srcId: a.srcId,
          label: labels[String(oldIdx)] != null ? String(labels[String(oldIdx)]) : a.label,
          offset: a.offset || 0,
          srcDuration: a.srcDuration || 0,
          src: a.src,
          hidden: !!hidden[String(oldIdx)]
        };
      });
      c.mcAngles = next;
      var act = String(c.mcActive || 0);
      c.mcActive = map[act] != null ? map[act] : 0;
    });
    return true;
  };

  // Flatten: drop the angle set, keep the active angle's media. Premiere's Flatten.
  // This is purely SUBTRACTIVE — clip.src / _file / trimStart / the pooled element already
  // point at the active angle (invariant: clip.src stays truthful), so the clip is already a
  // perfectly ordinary video clip and flattening just removes what made it multicam.
  // Idle angle sources are left parked: a sibling cut may still be using them, and any that
  // nothing references are released with the project rather than guessed at here.
  VE._veMcFlatten = function (clipId) {
    var clip = VE._findClipById(clipId);
    if (!clip || !VE._veMcIsMulticam(clip)) return false;
    var a = VE._veMcActiveAngle(clip);
    if (a && a.label) clip.name = a.label;
    delete clip.mcAngles;
    delete clip.mcActive;
    delete clip.mcGroupId;
    return true;
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'multicam', parent: 'video.video-editor', title: 'video-editor: multicam', mount: function () {}, unmount: function () {} });
  }
})();
