/* Module: video/video-editor/import - IMPORT - drop/file/image import, thumbnails, waveform, mini-timeline.
   Part of the video-editor group (decomposed from the 7695-line IIFE). Functions hang off the
   shared namespace VE (window.__ccVideoEditor, created by the parent); cross-module refs resolve
   through VE at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VE = window.__ccVideoEditor;
  if (!VE) return;

  VE._veHandleDrop = function (e, track) {
    var scrollWrap = document.getElementById('ve-scroll-wrap');
    var scrollLeft = scrollWrap ? scrollWrap.scrollLeft : 0;
    var rect = VE._veUi.tracksContainer ? VE._veUi.tracksContainer.getBoundingClientRect() : { left: 0 };
    var dropX = e.clientX - rect.left + scrollLeft;
    var dropTime = Math.max(0, dropX / VE._veProject.zoom);

    // Check for media gallery drag
    var mbId = e.dataTransfer && e.dataTransfer.getData('text/ve-media-id');
    if (mbId && (window.VEMediaBrowser || window.VEMediaGallery)) {
      var _mbMod = window.VEMediaBrowser || window.VEMediaGallery;
      var mbItem = _mbMod.getItemById(mbId);
      if (mbItem) {
        var mbFile = mbItem._file || mbItem.file;
        if (!mbFile && mbItem.blob) {
          try { mbFile = new File([new Blob([mbItem.blob], { type: mbItem.blobType })], mbItem.name, { type: mbItem.blobType }); } catch(e2) {}
        }
        if (mbFile) {
          VE._veImportFile(mbFile, track, dropTime);
          return;
        }
      }
    }

    // Check for left-panel image gallery drag
    var plainData = e.dataTransfer && e.dataTransfer.getData('text/plain');
    if (plainData) {
      try {
        var parsed = JSON.parse(plainData);

        // ── Video gallery entry drop ──
        if (parsed.type === 'video' && parsed.srcFolder !== undefined) {
          var vStore = typeof _galInit === 'function' ? _galInit() : null;
          var vEntry = { idbKey: parsed.idbKey, src: parsed.src, name: parsed.name };
          if (vStore) {
            var rawVEntry;
            if (parsed.srcFolder === '__recent' && vStore.recent) {
              rawVEntry = vStore.recent[parsed.imgIdx];
            } else if (vStore.folders) {
              var vf = vStore.folders.find(function(f) { return f.id === parsed.srcFolder; });
              rawVEntry = vf && vf.images && vf.images[parsed.imgIdx];
            }
            if (rawVEntry && typeof rawVEntry === 'object') vEntry = rawVEntry;
          }
          var vKey = vEntry.idbKey;
          var vSrc = vEntry.src;
          var vName = vEntry.name || 'video';
          var vDur = (typeof vEntry.duration === 'number' && vEntry.duration > 0) ? vEntry.duration : 0;
          var makeVideoFile = function(blob, mimeType) {
            var mt = mimeType || blob.type || 'video/mp4';
            var ext = mt.indexOf('webm') !== -1 ? '.webm' : (mt.indexOf('ogg') !== -1 ? '.ogg' : '.mp4');
            var base = vName.replace(/\.\w{1,5}$/, '');
            var f = new File([blob], base + ext, { type: mt });
            // This gallery entry is ALREADY a media-library asset. Carry its durable URL onto the File
            // so the clip records it and the save path does not file a second copy of bytes the library
            // already holds. NOTE the field drift: local entries say `remoteUrl`, portal-backed entries
            // say `_remoteUrl` (and their `src` IS the library URL) - only checking `remoteUrl` here is
            // what kept duplicating library videos dragged onto the timeline, one copy per add.
            var _ru = (typeof _galEntryRemoteUrl === 'function') ? _galEntryRemoteUrl(vEntry)
                      : (vEntry.remoteUrl || vEntry._remoteUrl || null);
            if (_ru) f._ccAssetUrl = _ru;
            return f;
          };
          var tryFetchUrl = function(url) {
            fetch(url).then(function(r) { return r.blob(); }).then(function(b) {
              VE._veImportFile(makeVideoFile(b, b.type), track, dropTime, vDur);
            }).catch(function() {
              if (typeof showToast === 'function') showToast('Failed to add video to timeline', 'error');
            });
          };
          if (vKey && typeof _ccVideoIdbGet === 'function') {
            _ccVideoIdbGet(vKey).then(function(blob) {
              if (blob) {
                VE._veImportFile(makeVideoFile(blob, blob.type), track, dropTime, vDur);
              } else if (vSrc) {
                tryFetchUrl(vSrc);
              }
            }).catch(function() { if (vSrc) tryFetchUrl(vSrc); });
          } else if (vSrc) {
            tryFetchUrl(vSrc);
          }
          return;
        }

        // ── Image gallery entry drop ──
        if (parsed.type === 'image' && parsed.srcFolder !== undefined && parsed.imgIdx !== undefined) {
          var store = typeof _galInit === 'function' ? _galInit() : null;
          if (store && store.folders) {
            var folder = store.folders.find(function(f) { return f.id === parsed.srcFolder; });
            if (folder && folder.images && folder.images[parsed.imgIdx]) {
              var dataUrl = folder.images[parsed.imgIdx];
              VE._veImportImageFromDataUrl(dataUrl, track, dropTime, 'Image');
              return;
            }
          }
        }
      } catch(ex) { /* not JSON or not gallery data */ }
    }

    // File system drop
    var files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length) return;

    for (var i = 0; i < files.length; i++) {
      VE._veImportFile(files[i], track, dropTime);
    }
  };

  VE._veImportFile = function (file, track, startTime, hintDuration, importOptions) {
    var isVideo = file.type && file.type.indexOf('video') === 0;
    var isAudio = file.type && file.type.indexOf('audio') === 0;
    var isImage = file.type && file.type.indexOf('image') === 0;

    if (!isVideo && !isAudio && !isImage) {
      if (importOptions && typeof importOptions.onError === 'function') importOptions.onError(new Error('Unsupported media type.'));
      return false;
    }

    // Image files → still clip (5s default)
    if (isImage) {
      VE._veImportImageAsClip(file, track, startTime);
      return true;
    }

    // Internal speech generators already return a validated PCM WAV/known audio blob. Sending every
    // cue through the heavyweight media probe made long dubbing depend on hundreds of unrelated
    // async validations and left the caller waiting for a callback that validation failures never
    // delivered. Trusted generated audio still goes through browser metadata/decode checks below.
    if (importOptions && importOptions.trustedGeneratedAudio && isAudio) {
      VE._veImportFileCore(file, track, startTime, null, hintDuration, importOptions);
      return true;
    }

    // ── Media Pipeline validation (Probe & Validation) ──
    if (window.VEMediaPipeline) {
      VEMediaPipeline.validate(file).then(function(result) {
        if (!result.valid) {
          if (window.VEErrorHandler) {
            VEErrorHandler.report('ImportError', result.message, { fileName: file.name });
          }
          console.warn('[VE] Import rejected:', result.message);
          if (importOptions && typeof importOptions.onError === 'function') importOptions.onError(new Error(result.message || 'Media validation failed.'));
          return;
        }
        // Log media info
        console.log('[VE] Import:', result.message);
        if (result.info.warnings.length) {
          console.warn('[VE] Warnings:', result.info.warnings.join('; '));
        }
        // Store file reference for proxy workflow
        VE._veImportFileCore(file, track, startTime, result.info, hintDuration, importOptions);
      }).catch(function(error) {
        if (importOptions && typeof importOptions.onError === 'function') importOptions.onError(error);
      });
      return true;
    }

    // Fallback: no media pipeline, import directly
    VE._veImportFileCore(file, track, startTime, null, hintDuration, importOptions);
    return true;
  };

  /* True while NO media clip (video/audio/image) exists on any track yet. Overlay clips (fabric
     objects mirrored onto the timeline) deliberately do not count: a text element already on the
     canvas must not block the first-video canvas-size adopt below. */
  VE._veIsTimelineEmptyOfMedia = function () {
    var tracks = (VE._veProject && VE._veProject.tracks) || [];
    for (var i = 0; i < tracks.length; i++) {
      var clips = tracks[i].clips || [];
      for (var j = 0; j < clips.length; j++) {
        var t = clips[j].type;
        if (t === 'video' || t === 'audio' || t === 'image') return false;
      }
    }
    return true;
  };

  VE._veImportFileCore = function (file, track, startTime, mediaInfo, hintDuration, importOptions) {
    var isVideo = file.type && file.type.indexOf('video') === 0;
    var isAudio = file.type && file.type.indexOf('audio') === 0;

    var url = (mediaInfo && mediaInfo._objectUrl) || URL.createObjectURL(file);
    // Always create a fresh media element - never reuse the pipeline's probe
    // element because it was loaded with preload='metadata' and often reports
    // wrong duration for blob URLs from IndexedDB.
    var mediaEl = document.createElement(isVideo ? 'video' : 'audio');
    mediaEl.preload = importOptions && importOptions.lazyMedia ? 'metadata' : 'auto';
    mediaEl.src = url;
    // One media SOURCE = one identity, minted here and carried by BOTH the clip (serialized, and copied
    // onto a split's right half by _veCloneClip) and the element (cloneNode copies attributes, expandos
    // it does not). The save path dedupes its IndexedDB write and its media-library upload on this, so
    // cutting a clip or reloading no longer files another copy of the same video. file._ccAssetUrl is set
    // by callers that already hold the bytes as a library asset - then we never upload at all.
    var presetAssetUrl = (file && file._ccAssetUrl) || null;
    var mediaId = VE._veTagMediaSource(mediaEl, presetAssetUrl);

    // ── FFmpeg fallback removed ──
    if (isVideo) {
      mediaEl.addEventListener('error', function _onDecodeError() {
        var me = mediaEl.error;
        var code = me ? me.code : 0;
        if (code === 3 || code === 4) {
          console.warn('[VE] Browser can\'t decode clip:', file.name, 'code:', code);
          if (window.VEErrorHandler) {
            VEErrorHandler.report('CodecError', 'Browser cannot decode: ' + file.name, { fileName: file.name });
          }
        }
      });
    }

    function _onMetadataReady() {
      // Measured BEFORE the clip is pushed: an empty timeline means this file defines the format.
      var wasEmptyTimeline = VE._veIsTimelineEmptyOfMedia();
      var dur = mediaEl.duration;
      // Guard against Infinity/NaN/0 - many WebM and screen-recorded MP4s
      // report incorrect duration at loadedmetadata; durationchange fixes it later
      if (!dur || !isFinite(dur) || dur <= 0) dur = 30; // generous fallback, durationchange will correct
      // If a hint duration was provided (e.g., stored in gallery entry)
      // and the browser duration differs significantly, trust the hint
      if (hintDuration && hintDuration > 0 && Math.abs(dur - hintDuration) > 1) {
        dur = hintDuration;
      }
      var clip = {
        id: VE._veUid('clip'),
        src: url,
        fileName: file.name,
        name: file.name.replace(/\.[^.]+$/, ''),
        type: isVideo ? 'video' : 'audio',
        startTime: startTime || 0,
        duration: dur,
        _srcDuration: dur,
        trimStart: 0,
        trimEnd: 0,
        volume: 1.0,
        speed: 1.0,
        filters: {},
        transitions: { in: null, out: null },
        _thumbCache: [],
        _waveformUrl: null,
        _mediaWidth: mediaEl.videoWidth || 0,
        _mediaHeight: mediaEl.videoHeight || 0,
        _ccMediaId: mediaId,
        _ccAssetUrl: presetAssetUrl,
        _file: file,
        _mediaInfo: mediaInfo || null
      };

      /* Dedicated generators may need an exact timeline window and provenance. Normal imports pass
         no options and retain existing behavior. Speed changes source-time consumption; duration
         remains timeline time, so audio and video export read same fit contract. */
      if (importOptions && clip.type === 'audio') {
        if (typeof importOptions.speed === 'number' && isFinite(importOptions.speed)) {
          clip.speed = Math.max(0.1, Math.min(8, importOptions.speed));
        }
        if (typeof importOptions.duration === 'number' && isFinite(importOptions.duration) && importOptions.duration > 0) {
          clip.duration = Math.min(importOptions.duration, dur / clip.speed);
          clip.trimEnd = Math.max(0, dur - clip.duration * clip.speed);
        }
        if (importOptions.dubbing) clip.dubbing = JSON.parse(JSON.stringify(importOptions.dubbing));
      }
      var generatedTimelineDuration = importOptions && typeof importOptions.duration === 'number'
        ? importOptions.duration
        : null;

      // Place on dropped track if no overlap, otherwise find another
      var targetTrack = track;
      var clipType = clip.type; // 'video' or 'audio'

      // Dedicated role tracks preserve exact caller placement. Ordinary imports keep single-track append behavior.
      if (clipType === 'audio') {
        var dedicatedAudioTrack = targetTrack && targetTrack.type === 'audio' && targetTrack.role;
        if (!dedicatedAudioTrack) {
          targetTrack = VE._veEnsureAudioTrack();
          // If clip overlaps existing clips, push it to the end of the track
          if (VE._veHasOverlap(targetTrack, clip.startTime, clip.duration, null)) {
            var trackEnd = 0;
            targetTrack.clips.forEach(function(c) {
              var ce = c.startTime + c.duration;
              if (ce > trackEnd) trackEnd = ce;
            });
            clip.startTime = trackEnd;
          }
        }
      } else {
        if (VE._veHasOverlap(targetTrack, clip.startTime, clip.duration, null)) {
          var alt = VE._veFindNonOverlapTrack(clip.startTime, clip.duration, null, 'video');
          if (alt) targetTrack = alt;
        }
      }
      targetTrack.clips.push(clip);
      if (importOptions && typeof importOptions.onClip === 'function') {
        try { importOptions.onClip(clip, targetTrack); } catch (callbackError) {
          console.warn('[VE import] onClip callback failed:', callbackError);
        }
      }

      // Insert mode (Phase 10): push subsequent clips right to make room
      if (VE._veEditMode === 'insert') {
        targetTrack.clips.forEach(function(c) {
          if (c.id !== clip.id && c.startTime >= clip.startTime) {
            c.startTime += clip.duration;
          }
        });
      }

      // Store media element in pool for playback
      VE._vePlayback.videoPool[clip.id] = mediaEl;

      // Auto-set first video as background
      if (isVideo && !VE._veProject._bgClipId) {
        VE._veProject._bgClipId = clip.id;
        VE._veProject.bgFit = VE._veProject.bgFit || 'cover';
      }

      // FIRST video on an empty timeline defines the canvas size (owner rule: track boşken eklenen
      // videonun boyutu canvas boyutu olur). The size is NOT necessarily known at this point: this
      // function also runs from the canplaythrough / 5s-timeout fallbacks below, and IndexedDB blob
      // URLs routinely reach it with videoWidth still 0 (that is what made a library video keep the
      // 16:9 canvas). So: read the element, fall back to the pipeline probe, else wait for the real
      // dimensions instead of skipping silently.
      if (isVideo && wasEmptyTimeline) {
        var _adoptTries = 0;
        var _adoptSize = function () {
          var vw = mediaEl.videoWidth || 0, vh = mediaEl.videoHeight || 0;
          var _st = mediaInfo && mediaInfo.streams && mediaInfo.streams[0];
          if ((!vw || !vh) && _st) { vw = _st.width || 0; vh = _st.height || 0; }
          if (!vw || !vh) return false;
          if (!clip._mediaWidth || !clip._mediaHeight) { clip._mediaWidth = vw; clip._mediaHeight = vh; }
          if (typeof VideoCanvas !== 'undefined' && VideoCanvas.adoptMediaSize && VideoCanvas.adoptMediaSize(vw, vh)) {
            VE._veSyncPreviewSize();
            if (VE._veRenderPreviewFrame) VE._veRenderPreviewFrame();
            if (typeof showToast === 'function') showToast('Canvas resized to the video: ' + CW + '×' + CH);
          }
          return true;
        };
        if (!_adoptSize()) {
          var _onDims = function () {
            if (_adoptSize() || ++_adoptTries > 20) {   // ~5s of retries, then give up quietly
              mediaEl.removeEventListener('loadedmetadata', _onDims);
              mediaEl.removeEventListener('resize', _onDims);
              mediaEl.removeEventListener('canplay', _onDims);
              return;
            }
            setTimeout(_onDims, 250);
          };
          mediaEl.addEventListener('loadedmetadata', _onDims);
          mediaEl.addEventListener('resize', _onDims);
          mediaEl.addEventListener('canplay', _onDims);
          setTimeout(_onDims, 250);
        }
      }

      // Ensure video is ready for preview rendering
      if (isVideo && mediaEl.readyState < 2) {
        mediaEl.addEventListener('canplay', function _onReady() {
          mediaEl.removeEventListener('canplay', _onReady);
          VE._veRenderPreviewFrame();
        });
      }

      // Attach error handler (Phase 21)
      if (window.VEErrorHandler) {
        VEErrorHandler.attachMediaErrorHandler(mediaEl, clip.id);
      }

      // Connect to audio engine for sound output
      if (window.VEAudioEngine && !(importOptions && importOptions.lazyMedia)) {
        VEAudioEngine.connectClip(clip.id, mediaEl, targetTrack.id, clip.volume);
      }

      // Register in media browser
      if (window.VEMediaBrowser) {
        VEMediaBrowser.addExternalItem(file, url, mediaEl);
      } else if (window.VEMediaGallery) {
        VEMediaGallery.addExternalItem(file, url, mediaEl);
      }

      // Plugin hook: onClipAdd (Phase 17)
      if (window.VEPluginSystem) VEPluginSystem.runHook('onClipAdd', { clip: clip, track: targetTrack });

      if (!(importOptions && importOptions.deferUi)) {
        VE._vePushUndo();
        VE._veRecalcDuration();
        VE._veRender();
      }

      // Generate thumbnails async - use pipeline when available
      if (isVideo) {
        if (window.VEFrameSource && VEFrameSource.isAvailable()) {
          // render.js requests only visible filmstrip tiles through a dedicated decoder.
          // Never seek the playback/export pool element for cosmetic thumbnails.
          clip._thumbCache = [];
        } else if (window.VEMediaPipeline) {
          VEMediaPipeline.generateThumbnails(clip, mediaEl, { zoom: VE._veProject.zoom || 50 })
            .then(function() { VE._veRender(); })
            .catch(function() { VE._veGenerateThumbnails(clip, mediaEl); });
        } else {
          VE._veGenerateThumbnails(clip, mediaEl);
        }
      }
      // Generate waveform - use pipeline when available
      if ((isAudio || (isVideo && clip.type === 'video')) && !(importOptions && importOptions.deferWaveform)) {
        if (window.VEMediaPipeline) {
          VEMediaPipeline.extractWaveform(url, { clipId: clip.id, stereo: false })
            .then(function(result) {
              clip._waveformUrl = result.waveformUrl;
              VE._veRender();
            })
            .catch(function() { if (isAudio) VE._veGenerateWaveform(clip, url); });
        } else if (isAudio) {
          VE._veGenerateWaveform(clip, url);
        }
      }

      // ── Duration fix: listen for durationchange to correct wrong initial duration ──
      // Many video formats (WebM, MP4 with moov at end, screen recordings) report
      // a wrong or partial duration at loadedmetadata. The real duration arrives
      // via subsequent durationchange events.
      (function(_dcMediaEl, _dcClip) {
        var _dcPrevDur = _dcClip.duration;
        var _dcHandler = function() {
          var newDur = _dcMediaEl.duration;
          if (newDur && isFinite(newDur) && newDur > 0 && Math.abs(newDur - _dcPrevDur) > 0.1) {
            _dcPrevDur = newDur;
            _dcClip._srcDuration = newDur;
            if (generatedTimelineDuration != null) {
              _dcClip.duration = Math.min(generatedTimelineDuration, newDur / (_dcClip.speed || 1));
              _dcClip.trimEnd = Math.max(0, newDur - _dcClip.duration * (_dcClip.speed || 1));
            } else {
              _dcClip.duration = newDur;
            }
            if (!(importOptions && importOptions.deferUi)) {
              VE._veRecalcDuration();
              VE._veRender();
            }
          }
        };
        _dcMediaEl.addEventListener('durationchange', _dcHandler);
        // Also check after a delay for elements that don't fire durationchange
        setTimeout(function() {
          _dcHandler();
          // Clean up after 60s - some formats take a long time to report real duration
          setTimeout(function() {
            _dcMediaEl.removeEventListener('durationchange', _dcHandler);
          }, 60000);
        }, 800);
      })(mediaEl, clip);
      if (importOptions && typeof importOptions.onReady === 'function') {
        try { importOptions.onReady(clip, targetTrack); } catch (readyError) {
          console.warn('[VE import] onReady callback failed:', readyError);
        }
      }
    }

    // Wait for the fresh element to load metadata with preload='auto'.
    // readyState >= 1 guard kept for edge cases (e.g., cached blob URLs).
    var _metaFired = false;
    var _onImportError = function() {
      if (_metaFired) return;
      _metaFired = true;
      if (importOptions && typeof importOptions.onError === 'function') {
        var mediaError = mediaEl.error;
        var error = new Error('Generated audio metadata could not be read' + (mediaError && mediaError.code ? ' (media code ' + mediaError.code + ')' : '') + '.');
        error.code = 'MEDIA_IMPORT_FAILED';
        importOptions.onError(error);
      }
    };
    mediaEl.addEventListener('error', _onImportError, { once: true });
    if (mediaEl.readyState >= 1) {
      _metaFired = true;
      _onMetadataReady();
    } else {
      var _onMeta = function() {
        if (_metaFired) return;
        _metaFired = true;
        mediaEl.removeEventListener('error', _onImportError);
        _onMetadataReady();
      };
      mediaEl.addEventListener('loadedmetadata', _onMeta);
      // Some blob URLs from IndexedDB skip loadedmetadata - use canplaythrough as fallback
      mediaEl.addEventListener('canplaythrough', _onMeta);
      // Last-resort timeout: if neither event fires within 5s, use hintDuration or fallback
      setTimeout(function() {
        if (!_metaFired) {
          _metaFired = true;
          _onMetadataReady();
        }
      }, 5000);
    }
  };

  VE._veImportImageAsClip = function (file, track, startTime) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    // Same source identity as video/audio: an image dropped on the timeline lands in the same pool and
    // the same save-time persist loop, so without it a split/reload re-files it too.
    var presetAssetUrl = (file && file._ccAssetUrl) || null;
    var mediaId = VE._veTagMediaSource(img, presetAssetUrl);
    img.onload = function() {
      var clip = {
        id: VE._veUid('clip'),
        src: url,
        fileName: file.name,
        name: file.name.replace(/\.[^.]+$/, ''),
        type: 'image',
        _ccMediaId: mediaId,
        _ccAssetUrl: presetAssetUrl,
        startTime: startTime || 0,
        duration: 5,
        trimStart: 0,
        trimEnd: 0,
        volume: 0,
        speed: 1.0,
        filters: {},
        transitions: { in: null, out: null },
        _thumbCache: [],
        _waveformUrl: null,
        _mediaWidth: img.naturalWidth || img.width,
        _mediaHeight: img.naturalHeight || img.height
      };

      var targetTrack = track;
      if (VE._veHasOverlap(targetTrack, clip.startTime, clip.duration, null)) {
        var alt = VE._veFindNonOverlapTrack(clip.startTime, clip.duration, null);
        if (alt) targetTrack = alt;
      }
      targetTrack.clips.push(clip);

      if (VE._veEditMode === 'insert') {
        targetTrack.clips.forEach(function(c) {
          if (c.id !== clip.id && c.startTime >= clip.startTime) {
            c.startTime += clip.duration;
          }
        });
      }

      // Store img element in video pool for preview rendering
      VE._vePlayback.videoPool[clip.id] = img;

      // Plugin hook
      if (window.VEPluginSystem) VEPluginSystem.runHook('onClipAdd', { clip: clip, track: targetTrack });

      // Generate thumbnail for timeline
      try {
        var tc = document.createElement('canvas');
        tc.width = 80; tc.height = 45;
        var tCtx = tc.getContext('2d');
        var scale = Math.min(80 / img.width, 45 / img.height);
        var tw = img.width * scale, th = img.height * scale;
        tCtx.drawImage(img, (80 - tw) / 2, (45 - th) / 2, tw, th);
        clip._thumbCache = [tc.toDataURL('image/jpeg', 0.6)];
      } catch (e) {}

      VE._vePushUndo();
      VE._veRecalcDuration();
      VE._veRender();
      if (typeof showToast === 'function') showToast('Image added as 5s clip');
    };
    img.onerror = function() {
      if (typeof showToast === 'function') showToast('Failed to load image', 'error');
    };
    img.src = url;
  };

  VE._veImportImageFromDataUrl = function (dataUrl, track, startTime, name) {
    var img = new Image();
    img.onload = function() {
      var clip = {
        id: VE._veUid('clip'),
        src: dataUrl,
        name: name || 'Image',
        type: 'image',
        startTime: startTime || 0,
        duration: 5,
        trimStart: 0,
        trimEnd: 0,
        volume: 0,
        speed: 1.0,
        filters: {},
        transitions: { in: null, out: null },
        _thumbCache: [],
        _waveformUrl: null,
        _mediaWidth: img.naturalWidth || img.width,
        _mediaHeight: img.naturalHeight || img.height
      };

      // Place on the specific dropped track
      if (VE._veHasOverlap(track, clip.startTime, clip.duration, null)) {
        var alt = VE._veFindNonOverlapTrack(clip.startTime, clip.duration, null);
        if (alt) track = alt;
      }
      track.clips.push(clip);
      VE._vePlayback.videoPool[clip.id] = img;

      // Generate thumbnail
      try {
        var tc = document.createElement('canvas');
        tc.width = 80; tc.height = 45;
        var tCtx = tc.getContext('2d');
        var scale = Math.min(80 / img.width, 45 / img.height);
        var tw = img.width * scale, th = img.height * scale;
        tCtx.drawImage(img, (80 - tw) / 2, (45 - th) / 2, tw, th);
        clip._thumbCache = [tc.toDataURL('image/jpeg', 0.6)];
      } catch (e) {}

      VE._vePushUndo();
      VE._veRecalcDuration();
      VE._veRender();
      VE._veRenderPreviewFrame();
    };
    img.onerror = function() {
      if (typeof showToast === 'function') showToast('Failed to load image', 'error');
    };
    img.src = dataUrl;
  };

  VE._veGenerateThumbnails = function (clip, videoEl) {
    /* X5 (export plan): this drives `currentTime` on the SAME pool element the export reads, and it
       fires from ordinary actions (importing media, splitting a clip, a multicam angle change) that
       the user is explicitly invited to do while an export runs in the background. Two seek loops on
       one element interleave, and the export's `seeked` handler cannot tell whose frame it got: the
       file ends up with thumbnail frames baked into it. Thumbnails are cosmetic and regenerate, so
       they simply wait. */
    if (VE._veExporting) {
      VE._veThumbQueueWhileExporting = VE._veThumbQueueWhileExporting || [];
      VE._veThumbQueueWhileExporting.push({ clipId: clip && clip.id });
      return;
    }
    // Calculate count based on pixel width to avoid stretching
    var clipPx = Math.max(4, Math.round(clip.duration * (VE._veProject.zoom || 50)));
    var thumbW = 80;
    var count = Math.min(40, Math.max(3, Math.ceil(clipPx / thumbW)));
    var thumbs = [];
    var generated = 0;
    var thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 80;
    thumbCanvas.height = 45;
    var tCtx = thumbCanvas.getContext('2d');
    // Loop-aware: wrap seek times that exceed source duration
    var srcDur = clip._srcDuration || (videoEl && isFinite(videoEl.duration) ? videoEl.duration : 0) || 0;

    function captureFrame(idx) {
      if (idx >= count) {
        clip._thumbCache = thumbs;
        VE._veRender();
        return;
      }
      var seekTime = (clip.duration / count) * (idx + 0.5);
      // Wrap seek time for looped clips
      if (srcDur > 0 && seekTime > srcDur) {
        var loopStart = clip.trimStart || 0;
        var loopLen = srcDur - loopStart;
        if (loopLen > 0) seekTime = loopStart + ((seekTime - loopStart) % loopLen);
      }
      videoEl.currentTime = Math.min(seekTime, (videoEl.duration || srcDur) - 0.05);
    }

    videoEl.addEventListener('seeked', function onSeeked() {
      if (generated >= count) {
        videoEl.removeEventListener('seeked', onSeeked);
        return;
      }
      try {
        tCtx.drawImage(videoEl, 0, 0, thumbCanvas.width, thumbCanvas.height);
        thumbs.push(thumbCanvas.toDataURL('image/jpeg', 0.5));
      } catch (ex) {
        thumbs.push('');
      }
      generated++;
      captureFrame(generated);
    });

    captureFrame(0);
  };

  VE._veRenderMiniTimeline = function () {
    if (!VE._veUi.host) return;
    var bar = VE._veUi.host.querySelector('.ve-mini-timeline');
    if (!bar) {
      // Create mini timeline bar (inserted below the ruler)
      bar = document.createElement('div');
      bar.className = 've-mini-timeline';
      bar.style.cssText = 'position:relative;height:18px;background:var(--surface,#131316);' +
        'border-top:1px solid rgba(255,255,255,.05);cursor:pointer;overflow:hidden;flex-shrink:0;';
      // Insert after toolbar, before ruler
      var toolbar = VE._veUi.host.querySelector('.ve-toolbar');
      if (toolbar && toolbar.nextSibling) {
        toolbar.parentNode.insertBefore(bar, toolbar.nextSibling);
      } else {
        VE._veUi.host.appendChild(bar);
      }
      // Click to seek
      bar.addEventListener('mousedown', function(e) {
        var rect = bar.getBoundingClientRect();
        var dur = VE._veProject.duration || 1;
        function seek(ev) {
          var x = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
          VE._veSeek(x * dur);
        }
        seek(e);
        function onMove(ev) { seek(ev); }
        function onUp() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    }

    // Render clip blocks
    var dur = VE._veProject.duration || 1;
    var w = bar.offsetWidth || 300;
    bar.innerHTML = '';

    // Track color palette
    var trackColors = ['#4fc3f7', '#81c784', '#ffb74d', '#e57373', '#ba68c8', '#f2ff58'];

    VE._veProject.tracks.forEach(function(track, tIdx) {
      var color = trackColors[tIdx % trackColors.length];
      track.clips.forEach(function(clip) {
        var left = (clip.startTime / dur) * w;
        var cw = Math.max(2, (clip.duration / dur) * w);
        var block = document.createElement('div');
        block.style.cssText = 'position:absolute;left:' + Math.round(left) + 'px;width:' +
          Math.round(cw) + 'px;top:' + (tIdx * 3) + 'px;height:3px;background:' + color +
          ';opacity:0.7;border-radius:1px;pointer-events:none;';
        bar.appendChild(block);
      });
    });

    // Viewport indicator
    var scrollWrap = VE._veUi.host.querySelector('.ve-scroll-wrap');
    if (scrollWrap) {
      var scrollLeft = scrollWrap.scrollLeft || 0;
      var visibleWidth = scrollWrap.clientWidth || w;
      var totalWidth = Math.max(1, VE._veProject.duration * VE._veProject.zoom);
      var vpLeft = (scrollLeft / totalWidth) * w;
      var vpWidth = Math.max(10, (visibleWidth / totalWidth) * w);
      var vp = document.createElement('div');
      vp.style.cssText = 'position:absolute;left:' + Math.round(vpLeft) + 'px;width:' +
        Math.round(vpWidth) + 'px;top:0;height:100%;border:1px solid rgba(255,255,255,.16);' +
        'background:rgba(255,255,255,.03);pointer-events:none;border-radius:2px;';
      bar.appendChild(vp);
    }

    // Playhead indicator
    var phPos = (VE._veProject.playheadTime / dur) * w;
    var ph = document.createElement('div');
    ph.style.cssText = 'position:absolute;left:' + Math.round(phPos) + 'px;top:0;width:1px;' +
      'height:100%;background:var(--gold,#f2ff58);pointer-events:none;';
    bar.appendChild(ph);

    // Marker flags on mini timeline
    if (VE._veProject.markers) {
      VE._veProject.markers.forEach(function(m) {
        var mx = Math.round((m.time / dur) * w);
        var mEl = document.createElement('div');
        mEl.style.cssText = 'position:absolute;left:' + mx + 'px;top:0;width:1px;height:100%;' +
          'background:' + (m.color || '#f2ff58') + ';opacity:0.5;pointer-events:none;';
        bar.appendChild(mEl);
      });
    }
  };

  /* THE WAVEFORM IS 200 BARS, SO IT DOES NOT NEED CD QUALITY AND IT DOES NOT NEED EVERY SAMPLE.
     Measured on this machine (tools/_ve-cost-probe.mjs) with the version that decoded at the device
     rate and summed every sample:
       peak walk over ten minutes of 48 kHz   31.8 ms   -> about 191 ms for an hour
       the same walk sampling 64 points a bar   0.5 ms
       PCM held for an hour of stereo 48 kHz   1.38 GB
     The walk was never the freeze. THE MEMORY IS THE RISK: an hour of stereo at the device rate is
     1.38 GB of float, allocated while the whole encoded file is also still in memory as the XHR
     response. Decoding into an 8 kHz context resamples on the way in and cuts that to about 230 MB,
     and 8 kHz is still forty times the resolution 200 bars can show. */
  VE._veGenerateWaveform = function (clip, url) {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      var audioCtx;
      try { audioCtx = new Ctx({ sampleRate: 8000 }); } catch (rateEx) { audioCtx = new Ctx(); }
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'arraybuffer';
      xhr.onload = function() {
        /* A video with no audio track, or one in a codec this build cannot decode, used to leave the
           context open for ever: there was no error callback at all, and a browser allows only a
           handful of them per page. */
        audioCtx.decodeAudioData(xhr.response, function(buffer) {
          var data = buffer.getChannelData(0);
          var step = Math.floor(data.length / 200);
          var stride = Math.max(1, Math.floor(step / 64));
          var peaks = [];
          for (var i = 0; i < 200; i++) {
            var sum = 0, taken = 0;
            for (var j = 0; j < step; j += stride) {
              sum += Math.abs(data[i * step + j]);
              taken++;
            }
            peaks.push(taken ? sum / taken : 0);
          }
          var max = Math.max.apply(null, peaks) || 1;

          var wCanvas = document.createElement('canvas');
          wCanvas.width = 400;
          wCanvas.height = 40;
          var wCtx = wCanvas.getContext('2d');
          wCtx.fillStyle = 'rgba(242, 255, 88,0.5)';
          for (var p = 0; p < peaks.length; p++) {
            var h = Math.round((peaks[p] / max) * 36);
            wCtx.fillRect(p * 2, 40 - h, 1.5, h || 1);
          }
          clip._waveformUrl = wCanvas.toDataURL();
          VE._veRender();
          audioCtx.close();
        }, function () {
          try { audioCtx.close(); } catch (closeEx) {}
        });
      };
      xhr.onerror = function () { try { audioCtx.close(); } catch (closeEx) {} };
      xhr.send();
    } catch (ex) { /* no audio context */ }
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'import', parent: 'video.video-editor', title: 'video-editor: import', mount: function () {}, unmount: function () {} });
  }
})();
