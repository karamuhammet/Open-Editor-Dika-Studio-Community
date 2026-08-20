/* Module: video/video-editor/project — PROJECT — init, default tracks, serialize/restore, per-page save/load, duration.
   Part of the video-editor group (decomposed from the 7695-line IIFE). Functions hang off the
   shared namespace VE (window.__ccVideoEditor, created by the parent); cross-module refs resolve
   through VE at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VE = window.__ccVideoEditor;
  if (!VE) return;

  VE._veInit = function () {
    if (VE._veUi.host) return; // already initialized
    VE._veBuildTimelineHTML();
    VE._veBuildPreviewCanvas();
    VE._veBuildDefaultTracks();
    VE._veBindEvents();
    VE._veBindOverlaySync();
    VE._veRender();

    // Initialize Performance Module
    if (window.VEPerformance) {
      VEPerformance.init();
      console.log('[VE] Performance module initialized');
    }
    // Initialize Advanced Audio
    if (window.VEAudioAdvanced) {
      VEAudioAdvanced.init();
      console.log('[VE] Audio Advanced module initialized');
    }
    // Initialize Advanced Features
    if (window.VEAdvancedFeatures) {
      VEAdvancedFeatures.init();
      console.log('[VE] Advanced Features module initialized');
    }
    // Initialize Accessibility
    if (window.VEAccessibility) {
      VEAccessibility.init();
      console.log('[VE] Accessibility module initialized');
    }
  };

  VE._veBuildDefaultTracks = function () {
    if (VE._veProject.tracks.length) return;
    VE._veProject.tracks = [
      { id: VE._veUid('t'), label: 'Track 1', type: 'video', muted: false, locked: false, solo: false, collapsed: false, clips: [] },
      { id: VE._veUid('t'), label: 'Track 2', type: 'video', muted: false, locked: false, solo: false, collapsed: false, clips: [] },
      { id: VE._veUid('t'), label: 'Track 3', type: 'video', muted: false, locked: false, solo: false, collapsed: false, clips: [] },
      { id: VE._veUid('t'), label: 'Track 4', type: 'video', muted: false, locked: false, solo: false, collapsed: false, clips: [] }
    ];
  };

  /* ── media SOURCE identity ────────────────────────────────────────────────────────────────────
     videoPool is keyed per CLIP, but the bytes a clip points at are a SOURCE that several clips
     legitimately share: the two halves of a split, the same file dropped twice, a multicam angle.
     Persistence used to key off the clip and guard with an expando (el._ccMediaPersisted), which is
     what filled the media library with dozens of copies of one video: cloneNode(true) copies a
     <video>'s attributes but NOT its expandos, so every cut looked like brand-new media, and every
     reload rebuilt the pool from scratch, so each save re-uploaded the same bytes under a fresh
     random key (presign mints a uuid key per call, so nothing could ever collide server-side).
     Both the IndexedDB blob key and the media-library upload now dedupe on this source id. */
  VE._veSourcePersisted = VE._veSourcePersisted || {};   // mediaId -> true, once per session

  function _veIndexClipsById() {
    var map = {};
    (VE._veProject.tracks || []).forEach(function (t) {
      ((t && t.clips) || []).forEach(function (c) { if (c && c.id) map[c.id] = c; });
    });
    return map;
  }

  /* Resolution order is load-bearing:
       clip._ccMediaId   the truth. Serialized with the track (so it survives a reload) and copied onto
                         a split's right half by _veCloneClip.
       data-cc-media-id  for pool entries with NO clip: multicam parks angle sources under 'mcsrc:'+srcId
                         (multicam.js) and relies on this loop to persist them. Also the reason a split
                         inherits the id for free, since cloneNode(true) copies attributes.
       'vem-'+clipId     legacy projects saved before this id existed. Their IndexedDB blob already sits
                         under that key, and _veRestoreProject stamps it onto the clip, so they migrate
                         in place instead of orphaning the blob. */
  VE._veSourceIdFor = function (clip, el, clipId) {
    if (clip && clip._ccMediaId) return clip._ccMediaId;
    if (el && el.getAttribute) {
      var attr = el.getAttribute('data-cc-media-id');
      if (attr) return attr;
    }
    return 'vem-' + clipId;
  };

  /* Mint a source id and stamp it on a freshly created media element; the importer puts the same id on
     the clip. assetUrl is set when the bytes ALREADY are a media-library asset (e.g. a gallery entry
     uploaded by _galBridgeVideo), which is what stops the library round-trip from re-uploading them. */
  VE._veTagMediaSource = function (el, assetUrl) {
    var mediaId = 'vem-' + VE._veUid('src');
    if (el && el.setAttribute) el.setAttribute('data-cc-media-id', mediaId);
    if (el && assetUrl) el._ccAssetUrl = assetUrl;
    return mediaId;
  };

  /* Durable mediaId -> library-asset URL map (localStorage). clip._ccAssetUrl only reaches the saved
     doc if an autosave serialize happens to run AFTER the async upload resolves; reloading before that
     lost the stamp, so EVERY new session treated the same bytes as unseen media and uploaded one more
     copy to the org library (the "aynı video tekrar tekrar kayıt oluyor" duplicates, one per F5).
     This map survives the reload regardless of autosave timing: a source uploads once, ever. */
  var ASSET_URL_LS_KEY = 'cc_ve_asset_urls';
  function _veAssetUrlMapRead() {
    try { return JSON.parse(localStorage.getItem(ASSET_URL_LS_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function _veAssetUrlRemember(mediaId, url) {
    if (!mediaId || !url) return;
    try {
      var map = _veAssetUrlMapRead();
      map[mediaId] = url;
      var keys = Object.keys(map);
      if (keys.length > 400) keys.slice(0, keys.length - 400).forEach(function (k) { delete map[k]; });
      localStorage.setItem(ASSET_URL_LS_KEY, JSON.stringify(map));
    } catch (e) { /* quota/private mode: the per-session guards still apply */ }
  }

  /* An upload landed: remember the durable URL on every clip AND pool element sharing that source, so
     the next serialize persists it and neither a reload nor a later split re-uploads the same bytes. */
  VE._veStampAssetUrl = function (mediaId, url) {
    _veAssetUrlRemember(mediaId, url);
    (VE._veProject.tracks || []).forEach(function (t) {
      ((t && t.clips) || []).forEach(function (c) { if (c && c._ccMediaId === mediaId) c._ccAssetUrl = url; });
    });
    var pool = VE._vePlayback.videoPool;
    Object.keys(pool).forEach(function (k) {
      var e = pool[k];
      if (e && e.getAttribute && e.getAttribute('data-cc-media-id') === mediaId) e._ccAssetUrl = url;
    });
  };

  /* S5 / M1 (export plan): assign a media element's src through here, never directly.

     A cross-origin `<video>` with no `crossOrigin` attribute paints fine but TAINTS every canvas it
     is drawn into, and a tainted canvas makes `new VideoFrame(canvas)` throw `SecurityError` - the
     export dies at frame 0 with a raw browser message. The same missing header is why remote clips
     exported picture but no sound: the offline mixdown reaches the bytes with `fetch`, which needs
     CORS even though `drawImage` does not.

     `anonymous` is not free. A host that does not send `Access-Control-Allow-Origin` REFUSES a
     CORS-tagged request outright, so demanding it unconditionally would turn "tainted but visible"
     into "nothing at all". Ask for it, and if that load fails, retry once untagged: worst case we
     are exactly where we were before, best case the export and the audio both work. */
  VE._veSetMediaSrc = function (el, src) {
    if (!el || !src) return el;
    var remote = /^https?:/i.test(src) && src.indexOf(location.origin + '/') !== 0;
    if (!remote) { el.src = src; return el; }
    var retried = false;
    el.addEventListener('error', function onErr() {
      if (retried) return;
      retried = true;
      el.removeEventListener('error', onErr);
      console.warn('[VE] CORS media load failed, retrying untagged (canvas will be tainted):', src);
      el.removeAttribute('crossorigin');
      el.src = src;
      if (el.load) el.load();
    });
    el.crossOrigin = 'anonymous';   // must be set BEFORE src or the browser ignores it
    el.src = src;
    return el;
  };

  VE._veSerializeProject = function () {
    // Deep-clone tracks, stripping DOM refs but keeping src URLs
    var tracksCopy = JSON.parse(JSON.stringify(VE._veProject.tracks, function (key, value) {
      if (key === '_filmstripCache' || key === '_filmstripPending' || key === '_filmstripOrder' || key === '_filmstripRequestToken'
          || key === '_waveformUrl' || key === '_thumbCache' || key === '_mediaInfo' || key === '_file') return undefined;
      return value;
    }));
    // Capture videoPool metadata (src URL per clip for re-hydration) AND persist each media blob to
    // IndexedDB so it survives a reload — blob: object URLs are session-only, so without this the tracks
    // restore but the media is dead. Fire-and-forget: the URL is alive now, so fetch its blob and stash it
    // under a stable mediaId; by the next reload the write has landed (idempotent put by id).
    var poolMeta = {};
    var clipById = _veIndexClipsById();
    var lsAssetUrls = _veAssetUrlMapRead();   // read once per serialize, not per pool entry
    Object.keys(VE._vePlayback.videoPool).forEach(function(clipId) {
      var el = VE._vePlayback.videoPool[clipId];
      if (!el || !el.src) return;
      var clip = clipById[clipId] || null;
      var mediaId = VE._veSourceIdFor(clip, el, clipId);
      var assetUrl = (clip && clip._ccAssetUrl) || el._ccAssetUrl || null;
      if (!assetUrl && lsAssetUrls[mediaId]) {
        // The upload landed in an EARLIER session but its stamp never got persisted
        // (reload beat the autosave). Adopt the durable URL instead of re-uploading.
        assetUrl = lsAssetUrls[mediaId];
        if (clip) clip._ccAssetUrl = assetUrl;
        el._ccAssetUrl = assetUrl;
      }
      // Prefer a DURABLE S3 URL once uploaded (survives reload AND other devices — the Canva/Figma media
      // layer); fall back to the live blob URL until the async upload lands. Restore loads a durable URL
      // directly (same-origin /api/assets/blob) and only reaches for the IndexedDB copy when src is a blob.
      poolMeta[clipId] = { src: assetUrl || el.src, type: el.tagName.toLowerCase(), mediaId: mediaId };
      if (el.src.indexOf('blob:') !== 0) return;      // already a durable/remote src — nothing to persist
      if (assetUrl) return;                           // these bytes ARE a library asset already
      if (VE._veSourcePersisted[mediaId]) return;     // this SOURCE is already in flight or done
      VE._veSourcePersisted[mediaId] = true;          // fetch the bytes ONCE per source, then persist to both stores
      try {
        fetch(el.src).then(function (r) { return r.blob(); }).then(function (b) {
          if (!b) return;
          if (window.VEPersistence && VEPersistence.saveMedia) VEPersistence.saveMedia(mediaId, b);   // same-browser fallback
          if (window.CCAssets && CCAssets.active && CCAssets.uploadBlob) {                             // durable S3 (cross-device)
            // Name it after the real file. The old 've-'+clipId made every row an unrecognizable id.
            var name = (clip && (clip.fileName || clip.name)) || mediaId;
            CCAssets.uploadBlob(b, { mime: b.type, name: name })
              .then(function (res) { if (res && res.url) VE._veStampAssetUrl(mediaId, res.url); })
              .catch(function () {});
          }
        }).catch(function () {});
      } catch (e) { /* ignore */ }
    });
    // Capture overlay objects from Fabric.js canvas
    var overlayJson = null;
    if (typeof canvas !== 'undefined' && canvas && canvas.toJSON) {
      overlayJson = canvas.toJSON(typeof CUSTOM_PROPS !== 'undefined' ? CUSTOM_PROPS : []);
    }
    return {
      tracks: tracksCopy,
      duration: VE._veProject.duration,
      playheadTime: VE._veProject.playheadTime,
      zoom: VE._veProject.zoom,
      aspectRatio: VE._veProject.aspectRatio,
      customW: VE._veProject.customW || null,
      customH: VE._veProject.customH || null,
      bgColor: VE._veProject.bgColor,
      bgGradient: VE._veProject.bgGradient || null,
      bgImage: VE._veProject.bgImage || null,
      _bgClipId: VE._veProject._bgClipId,
      bgFit: VE._veProject.bgFit,
      poolMeta: poolMeta,
      overlayJson: overlayJson
    };
  };

  VE._veCloseFilmstripSources = function () {
    var sources = VE._veFilmstripSources || {};
    Object.keys(sources).forEach(function (id) {
      Promise.resolve(sources[id]).then(function (source) { if (source && source.close) source.close(); }).catch(function () {});
    });
    VE._veFilmstripSources = {};
    VE._veFilmstripQueues = {};
  };

  VE._veRestoreProject = function (saved) {
    if (!saved) return;
    VE._veCloseFilmstripSources();
    VE._veRestoring = true;
    VE._vePause();

    // Restore project data — deep-clone tracks to avoid shared-reference
    // mutations between VE._veProject.tracks and VE._vePageProjects[pageId].tracks.
    VE._veProject.tracks = saved.tracks ? JSON.parse(JSON.stringify(saved.tracks)) : [];
    VE._veProject.duration = saved.duration || 0;
    VE._veProject.playheadTime = saved.playheadTime || 0;
    VE._veProject.zoom = saved.zoom || VE.PX_PER_SEC_DEFAULT;
    VE._veProject.aspectRatio = saved.aspectRatio || '16:9';
    VE._veProject.customW = saved.customW || null;
    VE._veProject.customH = saved.customH || null;
    VE._veProject.bgColor = saved.bgColor || '#000000';
    VE._veProject.bgGradient = saved.bgGradient || null;
    VE._veProject.bgImage = saved.bgImage || null;
    VE._veProject._bgClipId = saved._bgClipId || null;
    VE._veProject.bgFit = saved.bgFit || 'cover';
    VE._veUndoStack = saved.undoStack || [];
    VE._veUndoIdx = saved.undoIdx != null ? saved.undoIdx : -1;
    // Migrate old undo format (plain strings) to new command objects
    for (var ui = 0; ui < VE._veUndoStack.length; ui++) {
      if (typeof VE._veUndoStack[ui] === 'string') {
        VE._veUndoStack[ui] = { label: 'legacy', snapshot: VE._veUndoStack[ui], timestamp: 0 };
      }
    }
    VE._veSelectedClips = saved.selectedClips || [];

    // Rebuild videoPool — re-create <video>/<audio> elements from stored src URLs
    // Only works for same-session Object URLs; cross-session will be dead links
    var oldPool = VE._vePlayback.videoPool;
    VE._vePlayback.videoPool = {};
    if (saved.poolMeta) {
      var restoredClips = _veIndexClipsById();
      Object.keys(saved.poolMeta).forEach(function(clipId) {
        var meta = saved.poolMeta[clipId];
        // Carry the SOURCE id back onto the clip. Legacy projects have no clip._ccMediaId and their blob
        // already sits in IndexedDB under meta.mediaId ('vem-'+clipId), so adopting it here migrates them
        // in place; minting a fresh id instead would orphan the blob and re-upload the file once more.
        var restoredClip = restoredClips[clipId];
        if (restoredClip && !restoredClip._ccMediaId && meta.mediaId) restoredClip._ccMediaId = meta.mediaId;
        // Check if existing element still exists
        /* M2 (export plan): keep `clip.src` TRUTHFUL. The serialize keeps whatever `src` the clip had
           when it was saved, which after a reload is a previous session's blob: URL - dead. The live
           URL was only ever written to the ELEMENT, so every reader that rebuilds from the clip
           instead of the pool got the corpse: `_veReconnectAfterRestore` rebuilds a released element
           from `clip.src` (undo a delete after a reload = black picture, silent audio), and the
           dubbing / waveform / multicam paths read it as a fallback. One stamp fixes all of them. */
        if (restoredClip && meta.src) restoredClip.src = meta.src;
        if (oldPool[clipId] && oldPool[clipId].src === meta.src) {
          VE._vePlayback.videoPool[clipId] = oldPool[clipId];
        } else {
          var el = document.createElement(meta.type === 'audio' ? 'audio' : 'video');
          el.preload = 'auto';
          VE._veSetMediaSrc(el, meta.src);   // S5/M1: CORS-tagged when remote, with an untagged retry
          // Re-stamp the source id: this element is brand new, so without it the next save would treat a
          // reloaded blob: as unseen media and upload a second copy. Also covers pool entries with no clip
          // (multicam 'mcsrc:' angle sources), which have no other place to carry their identity.
          if (meta.mediaId) el.setAttribute('data-cc-media-id', meta.mediaId);
          VE._vePlayback.videoPool[clipId] = el;
          // Cross-session blob: URLs are dead — re-link the real media from IndexedDB by mediaId (async).
          // The element already exists (so the audio-engine connect below binds to it); once the blob loads
          // we swap in a fresh object URL and reload, and the MediaElementSource follows the element.
          if (meta.mediaId && meta.src && meta.src.indexOf('blob:') === 0 && window.VEPersistence && VEPersistence.loadMedia) {
            (function (elem, clip) {
              VEPersistence.loadMedia(meta.mediaId).then(function (blob) {
                if (!blob) return;
                try {
                  var fresh = URL.createObjectURL(blob);
                  elem.src = fresh;
                  if (clip) clip.src = fresh;   // M2: the clip follows the element, never lags it
                  if (elem.load) elem.load();
                } catch (e) { /* keep dead src */ }
              }).catch(function () {});
            })(el, restoredClip);
          }
        }
      });
    }

    // Reconnect all clips to audio engine after pool rebuild
    if (window.VEAudioEngine) {
      VE._veProject.tracks.forEach(function(track) {
        track.clips.forEach(function(clip) {
          if (clip.type !== 'video' && clip.type !== 'audio') return;
          var el = VE._vePlayback.videoPool[clip.id];
          if (el) VEAudioEngine.connectClip(clip.id, el, track.id, clip.volume);
        });
      });
    }

    // Restore overlay objects on Fabric.js canvas
    if (saved.overlayJson && typeof canvas !== 'undefined' && canvas) {
      canvas.loadFromJSON(saved.overlayJson, function() {
        VE._veAttachPreviewBg();
        canvas.renderAll();
        VE._veRestoring = false;
      });
    } else {
      if (typeof canvas !== 'undefined' && canvas) {
        canvas.clear();
        VE._veAttachPreviewBg();
        canvas.renderAll();
      }
      VE._veRestoring = false;
    }

    VE._veRecalcDuration();
    VE._veRender();
  };

  VE._veResetToFresh = function () {
    VE._vePause();
    VE._veCloseFilmstripSources();
    VE._veProject.tracks = [];
    VE._veProject.duration = 0;
    VE._veProject.playheadTime = 0;
    VE._veProject.zoom = VE.PX_PER_SEC_DEFAULT;
    VE._veProject.aspectRatio = '16:9';
    VE._veProject.customW = null;
    VE._veProject.customH = null;
    VE._veProject.bgColor = '#000000';
    VE._veProject.bgGradient = null;
    VE._veProject.bgImage = null;
    VE._veUndoStack = [];
    VE._veUndoIdx = -1;
    VE._veSelectedClips = [];
    VE._veSelectedCues = [];
    VE._veSelectedCueId = null;
    VE._veSelectedSubtitleTrackId = null;
    VE._vePlayback.videoPool = {};
    VE._veBuildDefaultTracks();
    if (typeof canvas !== 'undefined' && canvas) {
      VE._veRestoring = true;
      canvas.clear();
      VE._veAttachPreviewBg();
      canvas.renderAll();
      VE._veRestoring = false
      canvas.renderAll();
      VE._veRestoring = false;
    }
    VE._veRender();
  };

  // Bridge the video project INTO the persisted doc. Historically _veSaveForPage wrote ONLY to the in-memory
  // VE._vePageProjects map (reset on every reload), while the saved doc's page._videoProject was NEVER written
  // → 100% clip loss on reload. Now the serialized project is also stamped onto the page object so
  // buildAutosavePayload persists it, and _veLoadForPage restores from the doc when the memory map is empty.
  function _veFindPage(pageId) {
    if (typeof pages === 'undefined' || !pages || !pages.length) return null;
    for (var i = 0; i < pages.length; i++) if (pages[i] && pages[i]._pageId === pageId) return pages[i];
    return null;
  }
  // Count clips across a serialized project — feeds the source-level don't-regress guard below.
  function _veCountClips(proj) {
    var n = 0, tr = (proj && proj.tracks) || [];
    for (var i = 0; i < tr.length; i++) n += ((tr[i] || {}).clips || []).length;
    return n;
  }
  VE._veSaveForPage = function (pageId) {
    if (!pageId) return;
    // Undo and selection are session UI state. Keep them in memory per page,
    // never inside remote project JSON where large subtitle jobs multiply payload size.
    VE._vePageHistories = VE._vePageHistories || {};
    VE._vePageHistories[pageId] = {
      undoStack: VE._veUndoStack.slice(),
      undoIdx: VE._veUndoIdx,
      selectedClips: VE._veSelectedClips.slice()
    };
    var proj = VE._veSerializeProject();
    var pg = _veFindPage(pageId);
    // SOURCE-LEVEL don't-regress (the real reload-wipe fix). saveCurrentPage() calls this on EVERY autosave,
    // BEFORE the payload guard runs — so if the live project is momentarily EMPTY (the lazy activate/restore
    // window, or shared-canvas clear/loadFromJSON churn firing a quick-save), an unconditional write here
    // overwrites a page that HAS clips with an empty project, and the payload guard is too late to undo the
    // in-memory corruption. Rule: never overwrite a non-empty video page with 0 clips, and never write while
    // mid-transition. Partial edits (fewer clips, not zero) and a genuinely-new empty page still persist.
    var freshClips = _veCountClips(proj);
    if (freshClips === 0 && (VE._veRestoring || VE._veSwitching || (pg && pg._videoProject && _veCountClips(pg._videoProject) > 0))) {
      return;
    }
    VE._vePageProjects[pageId] = proj;
    if (pg) { pg._videoProject = proj; pg._productType = 'video'; }
  };

  VE._veLoadForPage = function (pageId) {
    if (!pageId) { VE._veResetToFresh(); VE._vePageLoadedForActivation = true; return; }
    var saved = VE._vePageProjects[pageId];
    if (!saved) {                                    // after a reload the in-memory map is empty → use the persisted doc
      var pg = _veFindPage(pageId);
      if (pg && pg._videoProject) { saved = pg._videoProject; VE._vePageProjects[pageId] = saved; }
    }
    if (saved) {
      VE._veRestoreProject(saved);
      var history = VE._vePageHistories && VE._vePageHistories[pageId];
      if (history) {
        VE._veUndoStack = history.undoStack || [];
        VE._veUndoIdx = history.undoIdx != null ? history.undoIdx : -1;
        VE._veSelectedClips = history.selectedClips || [];
      }
    } else {
      VE._veResetToFresh();
    }
    VE._vePageLoadedForActivation = true;
  };

  VE._veHasProjectForPage = function (pageId) {
    return !!VE._vePageProjects[pageId];
  };

  /* Cues count towards the duration as well as clips. They did not, and `_veSeek` CLAMPS to the
     duration, so a subtitle cue that ended after the last clip was unreachable: the playhead
     stopped short of it, `getActiveCues` came back empty, the on-canvas Textbox proxy was never
     created and both Delete doors (Del key, timeline trash) then had nothing to act on. Dragging a
     cue past the end had the same effect one frame later, because the drag calls this on every
     mousemove. */
  VE._veRecalcDuration = function () {
    var maxEnd = 0;
    VE._veProject.tracks.forEach(function(track) {
      track.clips.forEach(function(clip) {
        var end = clip.startTime + clip.duration;
        if (end > maxEnd) maxEnd = end;
      });
      (track.cues || []).forEach(function(cue) {
        var cEnd = cue.endTime || cue.startTime || 0;
        if (cEnd > maxEnd) maxEnd = cEnd;
      });
    });
    VE._veProject.duration = maxEnd;
  };

  /* A2 (export plan): this gate decides whether the export offers audio at all, and it used to key
     off `clip._file`. The undo snapshot deliberately strips `_file` (undo-markers.js), and
     `_audioBuffer` / `_objectUrl` are never assigned to a clip anywhere, so ONE Ctrl+Z made every
     later export silently mute with the checkbox gone. The real question is "does this clip have a
     decodable source", which the playback pool answers: the offline renderer reads exactly that
     element (`_scheduleClipOffline` uses `el.src || el.currentSrc`). Keep `_file` as a fallback for
     clips whose element has not landed in the pool yet. */
  VE._veProjectHasAudio = function () {
    if (!VE._veProject || !VE._veProject.tracks) return false;
    var pool = (VE._vePlayback && VE._vePlayback.videoPool) || {};
    for (var i = 0; i < VE._veProject.tracks.length; i++) {
      var track = VE._veProject.tracks[i];
      if (track.muted) continue;
      for (var j = 0; j < track.clips.length; j++) {
        var clip = track.clips[j];
        if (clip.type === 'audio') return true;
        if (clip.type !== 'video') continue;
        var el = pool[clip.id];
        if (el && (el.src || el.currentSrc)) return true;
        if (clip._file || clip.src) return true;
      }
    }
    return false;
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'project', parent: 'video.video-editor', title: 'video-editor: project', mount: function () {}, unmount: function () {} });
  }
})();
