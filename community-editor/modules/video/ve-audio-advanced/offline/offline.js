/* Module: video/ve-audio-advanced/offline — Offline render + WAV encode.
   Part of the ve-audio-advanced group (decomposed from the 1696-line IIFE). Functions hang off the
   shared namespace VAA (window.__ccVEAudioAdvanced, created by the parent); cross-module refs resolve
   through VAA at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VAA = window.__ccVEAudioAdvanced;
  if (!VAA) return;

  /* opts.startTime (plan A1) — the render window starts HERE on the timeline, not at 0. The offline
     graph schedules every clip on an absolute axis, so a range export (10s..20s) used to give picture
     from 0:10 with sound from 0:00. Every clip is now shifted by -startTime, clipped to the window,
     and a clip that starts before the window seeks into its own buffer by the lead.
     opts.onClipFailure(clip, reason) (plan A5) — a clip whose audio cannot be fetched/decoded is no
     longer swallowed; the caller can warn instead of shipping a silent video with a green tick. */
  VAA.renderOffline = function (tracks, duration, opts) {
    opts = opts || {};
    var sampleRate = opts.sampleRate || 44100;
    var channels = opts.channels || 2;
    var rangeStart = Math.max(0, opts.startTime || 0);
    var rangeEnd = rangeStart + duration;

    if (duration <= 0) return Promise.reject(new Error('Duration must be > 0'));

    var offlineCtx = new OfflineAudioContext(channels, Math.ceil(sampleRate * duration), sampleRate);

    VAA._offlineDecodeCache = {};   // A4: src -> decode promise, for THIS mixdown only

    var clipPromises = [];

    /* A8 (export plan): playback routes every track through VEAudioEngine.applySolo + a master gain
       (playback.js _veApplyVolumes), but this renderer only ever looked at `track.muted`. Solo a VO
       track, hear only the VO, then export everything. Master mute/volume were ignored too. Mirror
       both here so what you HEAR is what you GET. */
    var hasSolo = false;
    for (var si = 0; si < tracks.length; si++) { if (tracks[si].solo) { hasSolo = true; break; } }
    var masterVol = (opts.masterVolume != null) ? opts.masterVolume : 1;
    if (opts.masterMuted) masterVol = 0;
    if (masterVol <= 0) {
      // Everything is muted: render silence rather than decoding every clip for nothing.
      return offlineCtx.startRendering();
    }

    // For each track, for each audio/video clip, schedule playback
    for (var ti = 0; ti < tracks.length; ti++) {
      var track = tracks[ti];
      if (track.muted) continue;
      if (hasSolo && !track.solo) continue;
      var trackVol = (track.volume != null ? track.volume : 1) * masterVol;

      for (var ci = 0; ci < track.clips.length; ci++) {
        var clip = track.clips[ci];
        if (clip.type !== 'video' && clip.type !== 'audio') continue;

        // Outside the render window entirely — nothing to schedule, and no failure to report.
        var _cs = clip.startTime || 0;
        var _ce = _cs + (clip.duration || 0);
        if (_ce <= rangeStart || _cs >= rangeEnd) continue;

        // Get the audio element from the video pool
        var el = null;
        var _pool = opts.videoPool || (window._vePlayback && window._vePlayback.videoPool) || null;
        if (_pool) {
          el = _pool[clip.id];
        }
        if (!el) { if (opts.onClipFailure) opts.onClipFailure(clip, 'no-media-element'); continue; }

        // Create a promise that decodes + schedules this clip
        clipPromises.push(VAA._scheduleClipOffline(offlineCtx, clip, el, trackVol, rangeStart, rangeEnd, opts.onClipFailure));
      }
    }

    return Promise.all(clipPromises).then(function() {
      if (opts.onProgress) opts.onProgress(0.1);
      return offlineCtx.startRendering();
    }).then(function(renderedBuffer) {
      if (opts.onProgress) opts.onProgress(1.0);
      VAA._offlineDecodeCache = null;   // A4: the per-source decodes die with the mixdown
      return renderedBuffer;
    })['catch'](function (err) {
      VAA._offlineDecodeCache = null;
      throw err;
    });
  };

  /* A4 (export plan): one decode per SOURCE, not per clip.

     Every clip fetched its file and ran `decodeAudioData` on it independently. Cutting a 10 minute
     interview into 20 pieces therefore downloaded and decoded that same file 20 times, and held 20
     copies of the decoded PCM alive at once (48 kHz stereo float is ~23 MB per minute, so ~4.6 GB for
     that one example). Clips legitimately share bytes - the two halves of a split, a file dropped
     twice, a multicam angle - and `AudioBuffer` is read-only here, so one decode can serve them all.

     The cache lives for ONE mixdown: it is keyed by src within a render, and dropped when the render
     resolves, so nothing outlives the export it was built for. */
  VAA._offlineDecodeCache = null;

  function _decodeOnce(offlineCtx, src) {
    var cache = VAA._offlineDecodeCache;
    if (cache && cache[src]) return cache[src];
    var job = fetch(src).then(function (resp) {
      if (!resp.ok) throw new Error('http-' + resp.status);
      return resp.arrayBuffer();
    }).then(function (arrayBuf) {
      return offlineCtx.decodeAudioData(arrayBuf);
    });
    if (cache) cache[src] = job;
    return job;
  }

  VAA._scheduleClipOffline = function (offlineCtx, clip, mediaElement, trackVol, rangeStart, rangeEnd, onFailure) {
    rangeStart = rangeStart || 0;
    if (rangeEnd == null) rangeEnd = Infinity;
    return new Promise(function(resolve) {
      // Try to get the audio source via fetch + decodeAudioData
      var src = mediaElement.src || mediaElement.currentSrc;
      if (!src) { if (onFailure) onFailure(clip, 'no-src'); resolve(); return; }

      _decodeOnce(offlineCtx, src).then(function(audioBuffer) {
        var source = offlineCtx.createBufferSource();
        source.buffer = audioBuffer;

        // Gain for clip volume
        var gain = offlineCtx.createGain();
        gain.gain.value = (clip.volume != null ? clip.volume : 1) * trackVol;

        /* A9 (export plan): per-clip EQ existed only during playback. The inspector's three sliders
           write `clip.eq`, `VEAudioEngine.connectClip` builds lowshelf/peaking/highshelf around the
           live element, and this renderer knew nothing about any of it - so an export sounded
           different from the preview the user tuned. Same three filters, same frequencies and Q as
           ve-audio-engine.js:115-129; anything else here would be a second, drifting EQ. */
        var head = source;
        var _eq = clip.eq;
        if (_eq && (_eq.low || _eq.mid || _eq.high)) {
          var clampDb = function (v) { return Math.max(-12, Math.min(12, v || 0)); };
          var lo = offlineCtx.createBiquadFilter();
          lo.type = 'lowshelf'; lo.frequency.value = 320; lo.gain.value = clampDb(_eq.low);
          var mid = offlineCtx.createBiquadFilter();
          mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 0.5; mid.gain.value = clampDb(_eq.mid);
          var hi = offlineCtx.createBiquadFilter();
          hi.type = 'highshelf'; hi.frequency.value = 3200; hi.gain.value = clampDb(_eq.high);
          head.connect(lo); lo.connect(mid); mid.connect(hi);
          head = hi;
        }

        /* Still live-only, and now SAID so instead of silently differing: denoise and the audio-FX
           presets run through AudioWorklet processors that an OfflineAudioContext in this build does
           not host. The user hears them in the preview and will not hear them in the file. */
        if (onFailure) {
          if (clip.denoise && clip.denoise.enabled) onFailure(clip, 'denoise is preview-only, not in the export');
          if (clip.audioFx && clip.audioFx.preset) onFailure(clip, 'audio FX preset "' + clip.audioFx.preset + '" is preview-only, not in the export');
        }

        head.connect(gain);
        gain.connect(offlineCtx.destination);

        var trimStart = clip.trimStart || 0;
        var clipStart = clip.startTime || 0;
        var clipDur = clip.duration || 0;
        // A1 window clipping: `lead` = wall seconds of this clip that fall BEFORE the render window,
        // `playWall` = wall seconds actually inside it, `whenToStart` = context time relative to the
        // window (not to the timeline). All automation below is expressed in the same window frame.
        var lead = Math.max(0, rangeStart - clipStart);
        var playWall = Math.min(clipStart + clipDur, rangeEnd) - Math.max(clipStart, rangeStart);
        if (!(playWall > 0)) { resolve(); return; }
        var whenToStart = Math.max(0, clipStart - rangeStart);
        var K = window.VEKeyframes;
        var hasSpeedKf = K && K.hasKeyframes && K.hasKeyframes(clip, 'speed');

        // Volume keyframes: automate the clip gain along the curve (REPLACES clip.volume,
        // matching the live playback semantics). 50ms linear-ramp grid like the speed curve.
        if (K && K.hasKeyframes && K.hasKeyframes(clip, 'volume')) {
          var vsteps = Math.max(2, Math.ceil(Math.max(0.01, playWall) / 0.05));
          gain.gain.setValueAtTime(Math.max(0, K.evaluate(clip, 'volume', lead)) * trackVol, whenToStart);
          for (var vi = 1; vi <= vsteps; vi++) {
            var vt = vi / vsteps * playWall;
            gain.gain.linearRampToValueAtTime(Math.max(0, K.evaluate(clip, 'volume', lead + vt)) * trackVol, whenToStart + vt);
          }
        }

        // NOTE start(when, offset, duration): offset and duration are BUFFER-time seconds
        // (Web Audio spec), independent of playbackRate. A clip occupying clip.duration
        // wall seconds consumes duration*speed buffer seconds (or the curve integral).
        var startOffset, startSpan;
        if (hasSpeedKf) {
          // Speed curve: automate playbackRate along the curve so exported audio matches
          // the ramped video. AudioParam automation runs in context (wall) time and the
          // curve in clip-local timeline time; both advance 1:1. Sampled linear ramps
          // approximate eased/bezier/hold segments (50ms grid).
          var steps = Math.max(2, Math.ceil(Math.max(0.01, playWall) / 0.05));
          var p = source.playbackRate;
          p.setValueAtTime(K.getSpeedAtTime(clip, clipStart + lead), whenToStart);
          for (var i = 1; i <= steps; i++) {
            var t = i / steps * playWall;
            p.linearRampToValueAtTime(K.getSpeedAtTime(clip, clipStart + lead + t), whenToStart + t);
          }
          // Buffer offset/span come from the speed INTEGRAL, so a window that starts mid-ramp still
          // lands on the right source sample (computeSpeedMappedTime already folds trimStart in).
          var offA = K.computeSpeedMappedTime ? K.computeSpeedMappedTime(clip, clipStart + lead) : trimStart;
          var offB = K.computeSpeedMappedTime
            ? K.computeSpeedMappedTime(clip, clipStart + lead + playWall)
            : trimStart + K.getSourceSpan(clip);
          startOffset = offA;
          startSpan = Math.max(0.01, offB - offA);
        } else {
          var speed = clip.speed || 1;
          source.playbackRate.value = speed;
          // Was clip.duration / speed: at 2x the audio died a quarter of the way through
          // the clip, at 0.5x it bled past the cut. Buffer content = wall duration * speed.
          startOffset = trimStart + lead * speed;
          startSpan = playWall * speed;
        }

        // A3: the compositor LOOPS the picture when a clip outlives its source
        // (VE._veLoopLocalTime wraps to trimStart), but the audio just stopped at the source end.
        // Same loop points here, and the initial offset wraps the same way.
        var bufDur = audioBuffer.duration || 0;
        var loopStart = trimStart;
        var loopLen = Math.max(0, bufDur - loopStart);
        if (loopLen > 0.01 && startSpan > loopLen + 0.001) {
          source.loop = true;
          source.loopStart = loopStart;
          source.loopEnd = bufDur;
          if (startOffset > bufDur) startOffset = loopStart + ((startOffset - loopStart) % loopLen);
        }
        source.start(whenToStart, startOffset, startSpan);
        resolve();
      }).catch(function(err) {
        // A5: no longer a silent skip. The caller decides whether to warn or abort.
        if (onFailure) onFailure(clip, (err && err.message) || 'decode-failed');
        resolve();
      });
    });
  };

  VAA.audioBufferToWav = function (buffer) {
    var numChannels = buffer.numberOfChannels;
    var sampleRate = buffer.sampleRate;
    var length = buffer.length;
    var bytesPerSample = 2; // 16-bit
    var blockSize = numChannels * bytesPerSample;
    var dataSize = length * blockSize;
    var headerSize = 44;
    var arrayBuffer = new ArrayBuffer(headerSize + dataSize);
    var view = new DataView(arrayBuffer);

    // RIFF header
    VAA._writeString(view, 0, 'RIFF');
    view.setUint32(4, headerSize + dataSize - 8, true);
    VAA._writeString(view, 8, 'WAVE');

    // fmt chunk
    VAA._writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // chunk size
    view.setUint16(20, 1, true);  // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockSize, true);
    view.setUint16(32, blockSize, true);
    view.setUint16(34, 16, true); // bits per sample

    // data chunk
    VAA._writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Interleave channels and write samples
    var channels = [];
    for (var ch = 0; ch < numChannels; ch++) {
      channels.push(buffer.getChannelData(ch));
    }

    var offset = 44;
    for (var i = 0; i < length; i++) {
      for (var c = 0; c < numChannels; c++) {
        var sample = Math.max(-1, Math.min(1, channels[c][i]));
        var int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, int16, true);
        offset += 2;
      }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  };

  VAA._writeString = function (view, offset, str) {
    for (var i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'offline', parent: 'video.ve-audio-advanced', title: 've-audio-advanced: offline', mount: function () {}, unmount: function () {} });
  }
})();
