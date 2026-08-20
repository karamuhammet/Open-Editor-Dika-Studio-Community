/* ============================================================
   dika studio – Video Editor Audio Engine
   Web Audio API manager for real-time audio playback.
   Loaded BEFORE video-editor.js.
   Public API: window.VEAudioEngine
   ============================================================ */
(function() {
  'use strict';

  // ── State ─────────────────────────────────────────────────
  var _ctx = null;                // AudioContext
  var _masterGain = null;         // GainNode – master output
  var _analyser = null;           // AnalyserNode – master spectrum
  var _trackGains = {};           // trackId → GainNode
  var _trackPanners = {};         // trackId → StereoPannerNode
  var _trackAnalysers = {};       // trackId → { analyser, data }
  var _clipNodes  = {};           // clipId → { source, gain, eqLow, eqMid, eqHigh, element, connected }
  var _masterVolume = 1.0;
  var _initialized = false;
  var _analyserData = null;       // Uint8Array for frequency data

  // ── Lazy AudioContext (must follow user gesture) ──────────
  function _ensureContext() {
    if (_ctx) return _ctx;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      _ctx = new AC();
      _masterGain = _ctx.createGain();
      _masterGain.gain.value = _masterVolume;

      // Analyser node: masterGain → analyser → destination
      _analyser = _ctx.createAnalyser();
      _analyser.fftSize = 256;
      _analyser.smoothingTimeConstant = 0.8;
      _analyserData = new Uint8Array(_analyser.frequencyBinCount);

      _masterGain.connect(_analyser);
      _analyser.connect(_ctx.destination);
      _initialized = true;
    } catch (e) {
      console.warn('[VEAudioEngine] Cannot create AudioContext:', e);
    }
    return _ctx;
  }

  // ── Resume context (Chrome autoplay policy) ───────────────
  function _resumeContext() {
    if (_ctx && _ctx.state === 'suspended') {
      _ctx.resume().catch(function() {});
    }
  }

  // ── Track gain management ─────────────────────────────────
  function _ensureTrackGain(trackId) {
    if (_trackGains[trackId]) return _trackGains[trackId];
    if (!_ensureContext()) return null;
    var gain = _ctx.createGain();
    gain.gain.value = 1.0;

    // Per-track analyser for VU metering
    var tAnalyser = _ctx.createAnalyser();
    tAnalyser.fftSize = 256;
    tAnalyser.smoothingTimeConstant = 0.8;
    _trackAnalysers[trackId] = { analyser: tAnalyser, data: new Uint8Array(tAnalyser.frequencyBinCount) };

    // Chain: gain → panner → trackAnalyser → masterGain
    if (_ctx.createStereoPanner) {
      var panner = _ctx.createStereoPanner();
      panner.pan.value = 0;
      gain.connect(panner);
      panner.connect(tAnalyser);
      tAnalyser.connect(_masterGain);
      _trackPanners[trackId] = panner;
    } else {
      gain.connect(tAnalyser);
      tAnalyser.connect(_masterGain);
    }
    _trackGains[trackId] = gain;
    return gain;
  }

  // ── Re-route a live clip onto another track's gain ────────
  // A clip's track is decided ONCE, at connect time, but the timeline lets it move between tracks
  // (cross-track drag, group drag). Without this the node keeps feeding the gain of the track it
  // was born on, so muting the track it now sits on leaves it audible while muting the old, often
  // empty, track silences it. The only edge into a track gain is clipGain → trackGain (an inserted
  // FX chain sits BEFORE clipGain), so re-routing is one disconnect + one connect.
  function _reparentClip(clipId, trackId) {
    var node = _clipNodes[clipId];
    if (!node || !node.gain || !trackId || node.trackId === trackId) return false;
    var newGain = _ensureTrackGain(trackId);
    if (!newGain) return false;
    try {
      node.gain.disconnect();
      node.gain.connect(newGain);
      node.trackId = trackId;
    } catch (e) { return false; }
    return true;
  }

  // ── Connect a media element to the audio graph ────────────
  function connectClip(clipId, mediaElement, trackId, volume) {
    if (!_ensureContext()) return;
    // Already in the graph: reconcile rather than return blindly. Same element = only the track can
    // have changed. A DIFFERENT element means the clip's media was rebuilt, and createMediaElementSource
    // may be called once per element, so the old node must be forgotten before a new source is made.
    var existing = _clipNodes[clipId];
    if (existing && existing.connected) {
      if (existing.element === mediaElement) { _reparentClip(clipId, trackId); return; }
      disconnectClip(clipId);
    }

    var trackGain = _ensureTrackGain(trackId);
    if (!trackGain) return;

    try {
      var source = _ctx.createMediaElementSource(mediaElement);
      // From here the graph owns the level, so the element is a pure source. Without this a clip
      // that was silenced while OUTSIDE the graph (element pass in _veApplyVolumes) would keep
      // feeding it silence after joining.
      try { mediaElement.volume = 1; } catch (ve) {}

      var clipGain = _ctx.createGain();
      clipGain.gain.value = typeof volume === 'number' ? volume : 1.0;

      // If VEAudioAdvanced 8-band EQ is available, skip 3-band EQ to avoid double processing
      if (window.VEAudioAdvanced) {
        source.connect(clipGain);
        clipGain.connect(trackGain);

        _clipNodes[clipId] = {
          source: source,
          gain: clipGain,
          eqLow: null,
          eqMid: null,
          eqHigh: null,
          element: mediaElement,
          trackId: trackId,
          connected: true
        };
      } else {
        // 3-band EQ fallback: lowshelf → peaking → highshelf
        var eqLow = _ctx.createBiquadFilter();
        eqLow.type = 'lowshelf';
        eqLow.frequency.value = 320;
        eqLow.gain.value = 0;

        var eqMid = _ctx.createBiquadFilter();
        eqMid.type = 'peaking';
        eqMid.frequency.value = 1000;
        eqMid.Q.value = 0.5;
        eqMid.gain.value = 0;

        var eqHigh = _ctx.createBiquadFilter();
        eqHigh.type = 'highshelf';
        eqHigh.frequency.value = 3200;
        eqHigh.gain.value = 0;

        // Chain: source → eqLow → eqMid → eqHigh → clipGain → trackGain
        source.connect(eqLow);
        eqLow.connect(eqMid);
        eqMid.connect(eqHigh);
        eqHigh.connect(clipGain);
        clipGain.connect(trackGain);

        _clipNodes[clipId] = {
          source: source,
          gain: clipGain,
          eqLow: eqLow,
          eqMid: eqMid,
          eqHigh: eqHigh,
          element: mediaElement,
          trackId: trackId,
          connected: true
        };
      }
    } catch (e) {
      // MediaElementSource already created for this element
      if (e.name === 'InvalidStateError' && _clipNodes[clipId]) {
        _clipNodes[clipId].connected = true;
        return;
      }
      console.warn('[VEAudioEngine] connectClip error:', e);
    }
  }

  // ── Disconnect a clip from the audio graph ────────────────
  // Tears the node down fully and FORGETS it. The delete is load-bearing:
  // createMediaElementSource may be called only once per element (Web Audio spec),
  // so a clip whose element is rebuilt must reach connectClip with no surviving
  // node, or the `connected` guard above swallows the new element silently.
  function disconnectClip(clipId) {
    var node = _clipNodes[clipId];
    if (!node) return;
    // Inlined instead of calling removeChain(): that one reconnects source → gain,
    // which is the opposite of tearing down.
    if (node._fxChain) {
      try { node._fxChain.getOutput().disconnect(); } catch (e) {}
      try { node._fxChain.dispose(); } catch (e) {}
      delete node._fxChain;
    }
    try {
      if (node.source) node.source.disconnect();
      if (node.eqLow) node.eqLow.disconnect();
      if (node.eqMid) node.eqMid.disconnect();
      if (node.eqHigh) node.eqHigh.disconnect();
      if (node.gain) node.gain.disconnect();
    } catch (e) {}
    delete _clipNodes[clipId];
  }

  // ── Set clip volume ───────────────────────────────────────
  function setClipVolume(clipId, vol) {
    var node = _clipNodes[clipId];
    if (node && node.gain) {
      node.gain.gain.value = Math.max(0, Math.min(vol, 2));
    }
  }

  // ── Set track volume ──────────────────────────────────────
  function setTrackVolume(trackId, vol) {
    var g = _trackGains[trackId];
    if (g) g.gain.value = Math.max(0, Math.min(vol, 2));
  }

  // ── Mute/unmute a track ───────────────────────────────────
  function setTrackMuted(trackId, muted) {
    var g = _trackGains[trackId];
    if (g) g.gain.value = muted ? 0 : 1.0;
  }

  // ── Solo handling: pass soloed trackIds, mute all others ──
  // Also applies track.volume so gain reflects actual level, not just 1.0
  function applySolo(tracks) {
    var hasSolo = false;
    var soloIds = {};
    for (var i = 0; i < tracks.length; i++) {
      if (tracks[i].solo) {
        hasSolo = true;
        soloIds[tracks[i].id] = true;
      }
      // THE reconciliation point: every mute / solo / track-volume change comes through here with
      // the live track list, so this is where routing catches up with clips that changed track.
      var _cl = tracks[i].clips || [];
      for (var k = 0; k < _cl.length; k++) _reparentClip(_cl[k].id, tracks[i].id);
    }
    for (var j = 0; j < tracks.length; j++) {
      var t = tracks[j];
      var g = _trackGains[t.id];
      if (!g) continue;
      var vol = Math.max(0, Math.min(t.volume != null ? t.volume : 1, 2));
      if (t.muted || (hasSolo && !soloIds[t.id])) {
        g.gain.value = 0;
      } else {
        g.gain.value = vol;
      }
    }
  }

  // ── Pan per track ─────────────────────────────────────────
  function _setPan(trackId, panValue) {
    // panValue: -1 (left) to +1 (right)
    var panner = _trackPanners[trackId];
    if (panner && panner.pan) {
      panner.pan.value = Math.max(-1, Math.min(1, panValue));
    }
  }

  // ── Master volume ─────────────────────────────────────────
  function setMasterVolume(vol) {
    _masterVolume = Math.max(0, Math.min(vol, 2));
    if (_masterGain) _masterGain.gain.value = _masterVolume;
  }

  function getMasterVolume() {
    return _masterVolume;
  }

  // ── Play active clips at given time ───────────────────────
  function syncPlayback(tracks, playheadTime, playing) {
    if (!_ctx) return;
    _resumeContext();

    for (var ti = 0; ti < tracks.length; ti++) {
      var track = tracks[ti];
      for (var ci = 0; ci < track.clips.length; ci++) {
        var clip = track.clips[ci];
        // Only handle video & audio clips (not overlay)
        if (clip.type !== 'video' && clip.type !== 'audio') continue;
        var clipEnd = clip.startTime + clip.duration;
        var isActive = playheadTime >= clip.startTime && playheadTime < clipEnd;
        var node = _clipNodes[clip.id];
        if ((!node || !node.element) && isActive && playing && window.VideoEditor && VideoEditor._vePlayback) {
          var media = VideoEditor._vePlayback.videoPool[clip.id];
          if (media) {
            connectClip(clip.id, media, track.id, clip.volume);
            // applySolo, NOT setTrackVolume: raising the gain to track.volume here un-mutes a track
            // the moment a later clip on it joins the graph, which is how a muted track came back
            // to life on its second clip. Mute and solo have to survive a lazy connect.
            applySolo(tracks);
            node = _clipNodes[clip.id];
          }
        }
        if (!node || !node.element) continue;

        if (isActive && playing) {
          var localTime = (playheadTime - clip.startTime) * (clip.speed || 1) + (clip.trimStart || 0);
          var el = node.element;

          // Sync playback rate
          if (el.playbackRate !== (clip.speed || 1)) {
            el.playbackRate = clip.speed || 1;
          }

          // Unmute for audio output
          el.muted = false;

          // Seek if drifted too far
          if (Math.abs(el.currentTime - localTime) > 0.15) {
            el.currentTime = localTime;
          }

          // Ensure playing
          if (el.paused) {
            el.play().catch(function() {});
          }
        } else {
          // Not active or paused — pause the element
          if (node.element && !node.element.paused) {
            node.element.pause();
          }
        }
      }
    }
  }

  // ── EQ per clip ────────────────────────────────────────────
  // band: 'low' | 'mid' | 'high', gain: dB (-12 to +12)
  function setClipEQ(clipId, band, gain) {
    var node = _clipNodes[clipId];
    if (!node) return;
    var g = Math.max(-12, Math.min(12, gain));
    if (band === 'low' && node.eqLow) node.eqLow.gain.value = g;
    else if (band === 'mid' && node.eqMid) node.eqMid.gain.value = g;
    else if (band === 'high' && node.eqHigh) node.eqHigh.gain.value = g;
  }

  function getClipEQ(clipId) {
    var node = _clipNodes[clipId];
    if (!node) return { low: 0, mid: 0, high: 0 };
    return {
      low:  node.eqLow  ? node.eqLow.gain.value  : 0,
      mid:  node.eqMid  ? node.eqMid.gain.value  : 0,
      high: node.eqHigh ? node.eqHigh.gain.value : 0
    };
  }

  // ── Analyser data ─────────────────────────────────────────
  function getFrequencyData() {
    if (!_analyser || !_analyserData) return null;
    _analyser.getByteFrequencyData(_analyserData);
    return _analyserData;
  }

  function getTimeDomainData() {
    if (!_analyser || !_analyserData) return null;
    _analyser.getByteTimeDomainData(_analyserData);
    return _analyserData;
  }

  function getAnalyser() {
    return _analyser;
  }

  // ── Per-track level (0..1) from track analyser ────────────
  function getTrackLevel(trackId) {
    var ta = _trackAnalysers[trackId];
    if (!ta || !ta.analyser) return 0;
    ta.analyser.getByteFrequencyData(ta.data);
    var sum = 0;
    for (var i = 0; i < ta.data.length; i++) sum += ta.data[i];
    return (sum / ta.data.length) / 255;
  }

  // ── Pause all audio elements ──────────────────────────────
  function pauseAll() {
    var keys = Object.keys(_clipNodes);
    for (var i = 0; i < keys.length; i++) {
      var node = _clipNodes[keys[i]];
      if (node && node.element && !node.element.paused) {
        node.element.pause();
      }
    }
  }

  // ── Seek all active clips ─────────────────────────────────
  function seekAll(tracks, playheadTime) {
    for (var ti = 0; ti < tracks.length; ti++) {
      var track = tracks[ti];
      for (var ci = 0; ci < track.clips.length; ci++) {
        var clip = track.clips[ci];
        if (clip.type !== 'video' && clip.type !== 'audio') continue;
        var node = _clipNodes[clip.id];
        if (!node || !node.element) continue;

        var clipEnd = clip.startTime + clip.duration;
        var isActive = playheadTime >= clip.startTime && playheadTime < clipEnd;

        if (isActive) {
          var localTime = (playheadTime - clip.startTime) * (clip.speed || 1) + (clip.trimStart || 0);
          node.element.currentTime = localTime;
        }
      }
    }
  }

  // ── Cleanup ───────────────────────────────────────────────
  function dispose() {
    pauseAll();
    var keys = Object.keys(_clipNodes);
    for (var i = 0; i < keys.length; i++) {
      disconnectClip(keys[i]);
    }
    _clipNodes = {};
    _trackGains = {};
    _trackPanners = {};
    _trackAnalysers = {};
    if (_ctx && _ctx.state !== 'closed') {
      _ctx.close().catch(function() {});
    }
    _ctx = null;
    _masterGain = null;
    _initialized = false;
  }

  // ── Has clip node? ────────────────────────────────────────
  function hasClip(clipId) {
    return !!_clipNodes[clipId];
  }

  // ── Insert an audio processing chain (FX presets) ─────────
  // Disconnects source from existing path, inserts chain between source and gain.
  function insertChain(clipId, chain) {
    var node = _clipNodes[clipId];
    if (!node || !node.source || !chain) return false;
    // Remove any existing FX chain first
    removeChain(clipId);
    try { node.source.disconnect(); } catch (e) {}
    if (node.eqLow) { try { node.eqLow.disconnect(); } catch (e) {} }
    if (node.eqMid) { try { node.eqMid.disconnect(); } catch (e) {} }
    if (node.eqHigh) { try { node.eqHigh.disconnect(); } catch (e) {} }
    // source → chain → gain
    node.source.connect(chain.getInput());
    chain.getOutput().connect(node.gain);
    node._fxChain = chain;
    return true;
  }

  // ── Remove FX chain, reconnect source directly to gain ────
  function removeChain(clipId) {
    var node = _clipNodes[clipId];
    if (!node || !node._fxChain) return false;
    var chain = node._fxChain;
    try { node.source.disconnect(); } catch (e) {}
    try { chain.getOutput().disconnect(); } catch (e) {}
    chain.dispose();
    // Reconnect: source → gain (simple path)
    node.source.connect(node.gain);
    delete node._fxChain;
    return true;
  }

  // ── Public API ────────────────────────────────────────────
  window.VEAudioEngine = {
    ensureContext:    _ensureContext,
    resumeContext:    _resumeContext,
    connectClip:      connectClip,
    disconnectClip:   disconnectClip,
    hasClip:          hasClip,
    insertChain:      insertChain,
    removeChain:      removeChain,
    setClipVolume:    setClipVolume,
    setTrackVolume:   setTrackVolume,
    setTrackMuted:    setTrackMuted,
    applySolo:        applySolo,
    setMasterVolume:  setMasterVolume,
    getMasterVolume:  getMasterVolume,
    syncPlayback:     syncPlayback,
    pauseAll:         pauseAll,
    seekAll:          seekAll,
    dispose:          dispose,
    getFrequencyData: getFrequencyData,
    getTimeDomainData:getTimeDomainData,
    getAnalyser:      getAnalyser,
    getTrackLevel:    getTrackLevel,
    setClipEQ:        setClipEQ,
    getClipEQ:        getClipEQ,
    _setPan:          _setPan
  };

})();

// Modular skeleton hook (Faz 8) — ve-audio-engine is now a video loader module (modules/video/). Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-audio-engine', parent: 'video', title: 've-audio-engine', mount: function () {}, unmount: function () {} });
