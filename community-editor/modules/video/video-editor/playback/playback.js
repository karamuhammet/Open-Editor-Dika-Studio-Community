/* Module: video/video-editor/playback — PLAYBACK — seek, frame cache (LRU), frame-accurate seek, volumes, play/pause loop.
   Part of the video-editor group (decomposed from the 7695-line IIFE). Functions hang off the
   shared namespace VE (window.__ccVideoEditor, created by the parent); cross-module refs resolve
   through VE at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VE = window.__ccVideoEditor;
  if (!VE) return;

  VE._veSeek = function (time) {
    VE._veProject.playheadTime = Math.max(0, Math.min(time, VE._veProject.duration || 9999));
    VE._veUpdatePlayhead();
    VE._veUpdateTimeDisplay();
    VE._veRenderPreviewFrame();
    // Seek audio elements to match
    if (window.VEAudioEngine) VEAudioEngine.seekAll(VE._veProject.tracks, VE._veProject.playheadTime);
    // Plugin hook: onSeek
    if (window.VEPluginSystem) VEPluginSystem.runHook('onSeek', { time: VE._veProject.playheadTime });
  };

  VE._veLRUGet = function (key) {
    var node = VE._veLRUMap[key];
    if (!node) return undefined;
    // Move to head (most recently used)
    if (node !== VE._veLRUHead) {
      // Remove from current position
      if (node.prev) node.prev.next = node.next;
      if (node.next) node.next.prev = node.prev;
      if (node === VE._veLRUTail) VE._veLRUTail = node.prev;
      // Insert at head
      node.prev = null;
      node.next = VE._veLRUHead;
      if (VE._veLRUHead) VE._veLRUHead.prev = node;
      VE._veLRUHead = node;
      if (!VE._veLRUTail) VE._veLRUTail = node;
    }
    return node.value;
  };

  VE._veLRUPut = function (key, value) {
    if (VE._veLRUMap[key]) {
      // Update existing
      VE._veLRUMap[key].value = value;
      VE._veLRUGet(key); // move to head
      return;
    }
    // Evict if at capacity
    while (VE._veLRUSize >= VE._veLRUMaxSize && VE._veLRUTail) {
      var evicted = VE._veLRUTail;
      VE._veLRUTail = evicted.prev;
      if (VE._veLRUTail) VE._veLRUTail.next = null;
      else VE._veLRUHead = null;
      // Release GPU memory if ImageBitmap
      if (evicted.value && typeof evicted.value.close === 'function') {
        evicted.value.close();
      }
      delete VE._veLRUMap[evicted.key];
      VE._veLRUSize--;
    }
    // Insert new node at head
    var node = { key: key, value: value, prev: null, next: VE._veLRUHead };
    if (VE._veLRUHead) VE._veLRUHead.prev = node;
    VE._veLRUHead = node;
    if (!VE._veLRUTail) VE._veLRUTail = node;
    VE._veLRUMap[key] = node;
    VE._veLRUSize++;
  };

  VE._veLRUClear = function () {
    var node = VE._veLRUHead;
    while (node) {
      if (node.value && typeof node.value.close === 'function') {
        node.value.close();
      }
      node = node.next;
    }
    VE._veLRUHead = null;
    VE._veLRUTail = null;
    VE._veLRUMap = {};
    VE._veLRUSize = 0;
  };

  VE._veHasWebCodecs = function () {
    return typeof VideoEncoder !== 'undefined' &&
           typeof VideoFrame !== 'undefined' &&
           !!(window.Mp4Muxer && Mp4Muxer.Muxer);
  };

  VE._veBuildKeyframeIndex = function (clipId) {
    if (VE._veKeyframeIndex[clipId]) return; // already indexed
    if (!VE._veHasWebCodecs()) return;       // no WebCodecs

    var videoEl = VE._vePlayback.videoPool[clipId];
    if (!videoEl || !videoEl.src) return;

    VE._veKeyframeIndex[clipId] = { status: 'pending', frames: [] };
    // TODO: Implement with mp4box.js or WebCodecs demux in Sprint 2 (Codec Pipeline)
    // For now, create approximate keyframe index from video duration
    var duration = videoEl.duration || 0;
    if (!isFinite(duration)) return;

    var keyframeInterval = 2; // typical GOP = 2 seconds
    var frames = [];
    for (var t = 0; t < duration; t += keyframeInterval) {
      frames.push({ pts: VE._veToPTS(t), time: t, isKeyframe: true });
    }
    VE._veKeyframeIndex[clipId] = { status: 'ready', frames: frames };
  };

  VE._veFrameAccurateSeek = function (videoEl, targetTime, clipId, callback) {
    if (!VE._veHasWebCodecs() || !VE._veKeyframeIndex[clipId] || VE._veKeyframeIndex[clipId].status !== 'ready') {
      // Standard HTML5 seek fallback
      videoEl.currentTime = targetTime;
      if (callback) {
        videoEl.addEventListener('seeked', function onSeeked() {
          videoEl.removeEventListener('seeked', onSeeked);
          callback();
        }, { once: true });
      }
      return;
    }

    // Find nearest keyframe before target
    var index = VE._veKeyframeIndex[clipId];
    var nearestKF = 0;
    for (var i = index.frames.length - 1; i >= 0; i--) {
      if (index.frames[i].time <= targetTime) {
        nearestKF = index.frames[i].time;
        break;
      }
    }

    // Check frame cache first
    var cacheKey = clipId + '_' + Math.round(targetTime * 1000);
    var cached = VE._veLRUGet(cacheKey);
    if (cached) {
      if (callback) callback(cached);
      return;
    }

    // Seek to keyframe, then decode forward frame-by-frame
    // Full implementation requires WebCodecs decoder pipeline (Sprint 2)
    videoEl.currentTime = nearestKF;
    videoEl.addEventListener('seeked', function onSeeked() {
      videoEl.removeEventListener('seeked', onSeeked);
      // For now, standard seek to target after keyframe seek
      if (Math.abs(videoEl.currentTime - targetTime) > 0.05) {
        videoEl.currentTime = targetTime;
        videoEl.addEventListener('seeked', function onFinal() {
          videoEl.removeEventListener('seeked', onFinal);
          if (callback) callback();
        }, { once: true });
      } else {
        if (callback) callback();
      }
    }, { once: true });
  };

  VE._veEvictFrameCache = function () {
    // LRU auto-evicts on put; this is a no-op for backwards compat
  };

  VE._veFindPrevClipBoundary = function (time) {
    var best = -1;
    VE._veProject.tracks.forEach(function(track) {
      track.clips.forEach(function(clip) {
        var s = clip.startTime;
        var e = clip.startTime + clip.duration;
        if (s < time - 0.01 && s > best) best = s;
        if (e < time - 0.01 && e > best) best = e;
      });
    });
    return best >= 0 ? best : Math.max(0, time - 1 / 30);
  };

  VE._veFindNextClipBoundary = function (time) {
    var best = Infinity;
    VE._veProject.tracks.forEach(function(track) {
      track.clips.forEach(function(clip) {
        var s = clip.startTime;
        var e = clip.startTime + clip.duration;
        if (s > time + 0.01 && s < best) best = s;
        if (e > time + 0.01 && e < best) best = e;
      });
    });
    return best < Infinity ? best : Math.min(VE._veProject.duration, time + 1 / 30);
  };

  VE._veApplyVolumes = function () {
    // When VEAudioEngine is available, control audio through Web Audio API gain nodes
    var engine = window.VEAudioEngine || null;
    if (engine) {
      engine.setMasterVolume(VE._veMasterMuted ? 0 : VE._veMasterVol);
      // applySolo handles mute, solo, AND track.volume in one pass
      engine.applySolo(VE._veProject.tracks);
    }

    // Element pass. With the engine present it covers ONLY clips that never reached the graph (a
    // rebuilt element, a refused createMediaElementSource): those still play straight out of their
    // own element, where no track gain can reach them, so mute and solo would be ignored on exactly
    // the clip that looks broken. A clip that IS in the graph is skipped, or the track volume would
    // be applied twice. Without the engine this is the whole mixer, unchanged.
    var hasSolo = false;
    VE._veProject.tracks.forEach(function(t) { if (t.solo) hasSolo = true; });

    VE._veProject.tracks.forEach(function(track) {
      var trackVol = (track.volume != null ? track.volume : 1);
      var trackMuted = track.muted || (hasSolo && !track.solo);
      var effectiveVol = VE._veMasterMuted ? 0 : Math.min(1, VE._veMasterVol * trackVol);
      if (trackMuted) effectiveVol = 0;

      track.clips.forEach(function(clip) {
        if (clip.type !== 'video' && clip.type !== 'audio') return;
        if (engine && engine.hasClip(clip.id)) return;
        if (clip.dubbing && clip.dubbing.mode === 'cue') {
          var windowStart = VE._veProject.playheadTime - 300;
          var windowEnd = VE._veProject.playheadTime + 300;
          if (clip.startTime + clip.duration < windowStart || clip.startTime > windowEnd) return;
        }
        var el = VE._vePlayback.videoPool[clip.id];
        if (el) {
          var clipVol = clip.volume != null ? clip.volume : 1;
          el.volume = Math.min(1, Math.max(0, effectiveVol * clipVol));
          el.muted = effectiveVol === 0;
        }
      });
    });
  };

  VE._veConnectAllClipsToAudio = function () {
    if (!window.VEAudioEngine) return;
    VE._veProject.tracks.forEach(function(track) {
      track.clips.forEach(function(clip) {
        if (clip.type !== 'video' && clip.type !== 'audio') return;
        var el = VE._vePlayback.videoPool[clip.id];
        if (!el) return;
        if (!VEAudioEngine.hasClip(clip.id)) {
          VEAudioEngine.connectClip(clip.id, el, track.id, clip.volume);
          // Restore EQ settings from clip data
          if (clip.eq) {
            if (clip.eq.low)  VEAudioEngine.setClipEQ(clip.id, 'low', clip.eq.low);
            if (clip.eq.mid)  VEAudioEngine.setClipEQ(clip.id, 'mid', clip.eq.mid);
            if (clip.eq.high) VEAudioEngine.setClipEQ(clip.id, 'high', clip.eq.high);
          }
        }
      });
    });
  };

  VE._vePlay = function () {
    if (VE._vePlayback.playing) return;
    VE._vePlayback.playing = true;
    VE._vePlayback.lastFrameTime = performance.now();

    // Initialize audio engine and connect all clips
    if (window.VEAudioEngine) {
      VEAudioEngine.ensureContext();
      VEAudioEngine.resumeContext();
      VE._veConnectAllClipsToAudio();
      VEAudioEngine.applySolo(VE._veProject.tracks);
    }
    // Start LUFS metering during playback
    if (window.VEAudioAdvanced && VEAudioAdvanced.MasterBus) {
      VEAudioAdvanced.MasterBus.startMetering();
    }
    VE._veApplyVolumes();

    // Start active video elements playing (muted — audio handled by VEAudioEngine)
    var _playTime = VE._veProject.playheadTime;
    VE._veProject.tracks.forEach(function(track) {
      if (track.muted) return;
      track.clips.forEach(function(clip) {
        if (clip.type !== 'video') return;
        var el = VE._vePlayback.videoPool[clip.id];
        if (!el) return;
        el.muted = true;
        var clipEnd = clip.startTime + clip.duration;
        if (_playTime >= clip.startTime && _playTime < clipEnd) {
          var hasSpeedKf = window.VEKeyframes && VEKeyframes.hasKeyframes(clip, 'speed');
          var localTime = hasSpeedKf
            ? VEKeyframes.computeSpeedMappedTime(clip, _playTime)
            : (_playTime - clip.startTime) * (clip.speed || 1) + (clip.trimStart || 0);
          localTime = VE._veLoopLocalTime(localTime, clip, el);
          el.currentTime = localTime;
          el.playbackRate = hasSpeedKf ? 1 : ((VE._vePlayback.speed || 1) * (clip.speed || 1));
          el.play().catch(function() {});
        } else {
          el.pause();
        }
      });
    });
    VE._vePlayback.rafId = requestAnimationFrame(VE._vePlaybackLoop);
    VE._veUpdatePlayButton();
    // Show waveform bar during playback
    if (VE._veUi.waveformBar) VE._veUi.waveformBar.style.display = 'flex';
    // Plugin hook: onPlay
    if (window.VEPluginSystem) VEPluginSystem.runHook('onPlay', { time: VE._veProject.playheadTime });
    if (window.VEAccessibility) VEAccessibility.announce('Playing');
  };

  VE._vePause = function () {
    VE._vePlayback.playing = false;
    if (VE._vePlayback.rafId) {
      cancelAnimationFrame(VE._vePlayback.rafId);
      VE._vePlayback.rafId = null;
    }
    // Pause all audio elements
    if (window.VEAudioEngine) VEAudioEngine.pauseAll();
    // Pause all video pool elements
    Object.keys(VE._vePlayback.videoPool).forEach(function(id) {
      var el = VE._vePlayback.videoPool[id];
      if (el && !el.paused) el.pause();
    });
    VE._veUpdatePlayButton();
    // Hide waveform bar when paused
    if (VE._veUi.waveformBar) VE._veUi.waveformBar.style.display = 'none';
    // Plugin hook: onPause
    if (window.VEAccessibility) VEAccessibility.announce('Paused at ' + VE._veFormatTime(VE._veProject.playheadTime));
    if (window.VEPluginSystem) VEPluginSystem.runHook('onPause', { time: VE._veProject.playheadTime });
  };

  VE._veTogglePlay = function () {
    if (VE._vePlayback.playing) VE._vePause(); else VE._vePlay();
  };

  VE._vePlaybackLoop = function (now) {
    if (!VE._vePlayback.playing) return;
    // Frame skip: maintain target FPS under load
    if (window.VEPerformance && VEPerformance.FrameSkipManager.shouldRender(now) === false) {
      VE._vePlayback.rafId = requestAnimationFrame(VE._vePlaybackLoop);
      return;
    }
    var delta = (now - VE._vePlayback.lastFrameTime) / 1000 * VE._vePlayback.speed;
    VE._vePlayback.lastFrameTime = now;
    VE._veProject.playheadTime += delta;

    if (VE._veProject.duration > 0 && VE._veProject.playheadTime >= VE._veProject.duration) {
      if (VE._vePlayback.loop) {
        VE._veProject.playheadTime = 0;
        // Reset audio positions on loop
        if (window.VEAudioEngine) VEAudioEngine.seekAll(VE._veProject.tracks, 0);
      } else {
        VE._veProject.playheadTime = 0;
        VE._vePause();
        VE._veSeek(0);
        return;
      }
    }

    VE._veUpdatePlayhead();
    VE._veUpdateTimeDisplay();
    VE._veRenderPreviewFrame();
    VE._veRenderWaveform();
    VE._veAutoScrollPlayhead();

    // Sync audio playback with video timeline
    if (window.VEAudioEngine) {
      VEAudioEngine.syncPlayback(VE._veProject.tracks, VE._veProject.playheadTime, true);
    }

    // Update audio playbackRate for speed ramps + clip gain for volume keyframes
    if (window.VEKeyframes) {
      var _phT = VE._veProject.playheadTime;
      VE._veProject.tracks.forEach(function(track) {
        track.clips.forEach(function(clip) {
          var el = VE._vePlayback.videoPool[clip.id];
          if (el && VEKeyframes.hasKeyframes(clip, 'speed')) {
            var spd = VEKeyframes.getSpeedAtTime(clip, _phT);
            if (Math.abs(el.playbackRate - spd) > 0.01) {
              el.playbackRate = Math.max(0.1, Math.min(8, spd));
            }
          }
          if (VEKeyframes.hasKeyframes(clip, 'volume') &&
              _phT >= clip.startTime && _phT < clip.startTime + clip.duration) {
            // Keyframed volume REPLACES clip.volume while inside the clip (same absolute
            // semantics as every other keyframed property).
            var vol = Math.max(0, Math.min(2, VEKeyframes.evaluate(clip, 'volume', _phT - clip.startTime)));
            if (window.VEAudioEngine && VEAudioEngine.setClipVolume) VEAudioEngine.setClipVolume(clip.id, vol);
            else el.volume = Math.min(1, vol);
          }
        });
      });
    }

    VE._vePlayback.rafId = requestAnimationFrame(VE._vePlaybackLoop);
  };

  VE._veUpdatePlayButton = function () {
    var btn = document.getElementById('ve-btn-play');
    if (!btn) return;
    btn.innerHTML = VE._veIcon(VE._vePlayback.playing ? 'pause' : 'play');
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'playback', parent: 'video.video-editor', title: 'video-editor: playback', mount: function () {}, unmount: function () {} });
  }
})();
