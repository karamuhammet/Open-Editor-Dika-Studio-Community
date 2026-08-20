// ╔═══════════════════════════════════════════════════════════════╗
// ║  VE-KEYFRAMES — Keyframe Animation System                    ║
// ║  Phase 7: Property animation with interpolation              ║
// ╚═══════════════════════════════════════════════════════════════╝
(function() {
  'use strict';

  // ── Easing functions (0→1 input, 0→1 output) ──
  var EASINGS = {
    linear: function(t) { return t; },
    easeIn: function(t) { return t * t; },
    easeOut: function(t) { return t * (2 - t); },
    easeInOut: function(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; },
    easeInCubic: function(t) { return t * t * t; },
    easeOutCubic: function(t) { return (--t) * t * t + 1; },
    easeInOutCubic: function(t) { return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1; },
    hold: function(t) { return t >= 1 ? 1 : 0; },
    bounce: function(t) {
      var n1 = 7.5625, d1 = 2.75;
      if (t < 1 / d1) return n1 * t * t;
      if (t < 2 / d1) { t -= 1.5 / d1; return n1 * t * t + 0.75; }
      if (t < 2.5 / d1) { t -= 2.25 / d1; return n1 * t * t + 0.9375; }
      t -= 2.625 / d1; return n1 * t * t + 0.984375;
    },
    elastic: function(t) {
      if (t === 0 || t === 1) return t;
      var c4 = (2 * Math.PI) / 3;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },
    overshoot: function(t) {
      var c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
  };

  // Legacy ids that older UI surfaces stored (dash-case etc). Unknown names fall back to linear
  // inside resolveEasing; these map to the intended canonical function instead.
  var EASING_ALIASES = {
    'ease-in': 'easeIn',
    'ease-out': 'easeOut',
    'ease-in-out': 'easeInOut',
    'ease-io': 'easeInOut',
    'step': 'hold'
  };

  function resolveEasing(name) {
    if (name && EASINGS[name]) return EASINGS[name];
    if (name && EASING_ALIASES[name]) return EASINGS[EASING_ALIASES[name]];
    return EASINGS.linear;
  }

  // Cubic bezier segment (easing:'bezier' on the RIGHT keyframe of the segment, matching the
  // existing "segment easing lives on kfB" convention). Handles are RELATIVE offsets from their
  // keyframe: kfA.hOut = {dt,dv} (dt >= 0), kfB.hIn = {dt,dv} (dt <= 0). Missing handles default
  // to 1/3-span linear equivalents. dt is clamped so x(u) stays monotonic inside the segment.
  function _evalBezierSegment(kfA, kfB, localTime) {
    var tA = kfA.time, vA = kfA.value, tB = kfB.time, vB = kfB.value;
    var span = tB - tA;
    if (span <= 0) return vA;
    var third = span / 3;
    var hOut = kfA.hOut || { dt: third, dv: (vB - vA) / 3 };
    var hIn = kfB.hIn || { dt: -third, dv: (vA - vB) / 3 };
    var x1 = tA + Math.max(0, Math.min(span, hOut.dt));
    var y1 = vA + hOut.dv;
    var x2 = tB + Math.max(-span, Math.min(0, hIn.dt));
    var y2 = vB + hIn.dv;
    var lo = 0, hi = 1, u, mu, x;
    for (var i = 0; i < 24; i++) {
      u = (lo + hi) / 2;
      mu = 1 - u;
      x = mu * mu * mu * tA + 3 * mu * mu * u * x1 + 3 * mu * u * u * x2 + u * u * u * tB;
      if (x < localTime) lo = u; else hi = u;
    }
    u = (lo + hi) / 2;
    mu = 1 - u;
    return mu * mu * mu * vA + 3 * mu * mu * u * y1 + 3 * mu * u * u * y2 + u * u * u * vB;
  }

  // Animatable properties and their defaults
  var PROPERTIES = {
    x:        { min: -2000, max: 2000, default: 0, unit: 'px' },
    y:        { min: -2000, max: 2000, default: 0, unit: 'px' },
    scaleX:   { min: 0.01,  max: 5,    default: 1, unit: '' },
    scaleY:   { min: 0.01,  max: 5,    default: 1, unit: '' },
    rotation: { min: -360,  max: 360,  default: 0, unit: '°' },
    opacity:  { min: 0,     max: 1,    default: 1, unit: '' },
    volume:   { min: 0,     max: 2,    default: 1, unit: '' },
    speed:    { min: 0.1,   max: 8,    default: 1, unit: 'x' }
  };

  // ── Speed Ramp Presets ──
  var SPEED_PRESETS = {
    'smooth-slow': {
      label: 'Smooth Slow-Mo',
      keyframes: [
        { time: 0, value: 1, easing: 'easeInOut' },
        { time: 0.3, value: 0.25, easing: 'easeInOut' },
        { time: 0.7, value: 0.25, easing: 'easeInOut' },
        { time: 1, value: 1, easing: 'easeOut' }
      ]
    },
    'speed-up': {
      label: 'Speed Up',
      keyframes: [
        { time: 0, value: 1, easing: 'easeIn' },
        { time: 1, value: 4, easing: 'linear' }
      ]
    },
    'slow-down': {
      label: 'Slow Down',
      keyframes: [
        { time: 0, value: 4, easing: 'easeOut' },
        { time: 1, value: 1, easing: 'linear' }
      ]
    },
    'ramp-in-out': {
      label: 'Ramp In/Out',
      keyframes: [
        { time: 0, value: 1, easing: 'easeIn' },
        { time: 0.3, value: 3, easing: 'easeInOut' },
        { time: 0.7, value: 3, easing: 'easeInOut' },
        { time: 1, value: 1, easing: 'easeOut' }
      ]
    },
    'freeze': {
      label: 'Freeze Frame',
      keyframes: [
        { time: 0, value: 1, easing: 'linear' },
        { time: 0.4, value: 1, easing: 'linear' },
        { time: 0.41, value: 0.001, easing: 'linear' },
        { time: 0.6, value: 0.001, easing: 'linear' },
        { time: 0.61, value: 1, easing: 'linear' },
        { time: 1, value: 1, easing: 'linear' }
      ]
    }
  };

  /**
   * Initialize keyframes on a clip if not present.
   * clip.keyframes = { propertyName: [ { time, value, easing } ] }
   */
  function ensureKeyframes(clip) {
    var kfs = clip.keyframes;
    if (!kfs || typeof kfs !== 'object') { clip.keyframes = {}; return clip.keyframes; }
    if (Array.isArray(kfs)) {
      // Migration: some clip factories initialized keyframes as [] and one legacy writer used an
      // array of {property,time,value,easing}. Arrays lose named props on JSON serialize, so the
      // canonical shape is ALWAYS the object keyed by property. Convert in place.
      var obj = {};
      for (var i = 0; i < kfs.length; i++) {
        var e = kfs[i];
        if (!e || !e.property) continue;
        if (!obj[e.property]) obj[e.property] = [];
        obj[e.property].push({ time: e.time || 0, value: e.value, easing: e.easing || 'linear' });
      }
      for (var p in obj) _sortKeyframes(obj[p]);
      clip.keyframes = obj;
      return obj;
    }
    return kfs;
  }

  /**
   * Add a keyframe to a clip property.
   * If a keyframe already exists at that time, update it.
   */
  function addKeyframe(clip, property, time, value, easing) {
    var kfs = ensureKeyframes(clip);
    if (!kfs[property]) kfs[property] = [];
    var arr = kfs[property];
    easing = easing || 'linear';

    // Check if keyframe exists at this time (within 0.01s tolerance)
    for (var i = 0; i < arr.length; i++) {
      if (Math.abs(arr[i].time - time) < 0.01) {
        arr[i].value = value;
        arr[i].easing = easing;
        _sortKeyframes(arr);
        return arr[i];
      }
    }

    var kf = { time: time, value: value, easing: easing };
    arr.push(kf);
    _sortKeyframes(arr);
    return kf;
  }

  /**
   * Remove a keyframe from a clip property at a specific time.
   */
  function removeKeyframe(clip, property, time) {
    var kfs = ensureKeyframes(clip);
    if (!kfs[property]) return;
    kfs[property] = kfs[property].filter(function(kf) {
      return Math.abs(kf.time - time) >= 0.01;
    });
    if (kfs[property].length === 0) delete kfs[property];
  }

  /**
   * Get the interpolated value of a property at a given local time within the clip.
   * localTime is relative to clip start (0 = clip beginning).
   */
  function evaluate(clip, property, localTime) {
    var kfs = ensureKeyframes(clip);
    var arr = kfs[property];
    if (!arr || arr.length === 0) {
      return PROPERTIES[property] ? PROPERTIES[property].default : 0;
    }

    // Before first keyframe
    if (localTime <= arr[0].time) return arr[0].value;

    // After last keyframe
    if (localTime >= arr[arr.length - 1].time) return arr[arr.length - 1].value;

    // Find surrounding keyframes
    for (var i = 0; i < arr.length - 1; i++) {
      var kfA = arr[i];
      var kfB = arr[i + 1];
      if (localTime >= kfA.time && localTime <= kfB.time) {
        var span = kfB.time - kfA.time;
        if (span <= 0) return kfA.value;
        if (kfB.easing === 'bezier') return _evalBezierSegment(kfA, kfB, localTime);
        var t = (localTime - kfA.time) / span;
        var eased = resolveEasing(kfB.easing)(t);
        return kfA.value + (kfB.value - kfA.value) * eased;
      }
    }

    return arr[arr.length - 1].value;
  }

  /**
   * Evaluate all animated properties for a clip at a given global time.
   * Returns object with only properties that have keyframes.
   */
  function evaluateAll(clip, globalTime) {
    var kfs = ensureKeyframes(clip);
    var localTime = globalTime - clip.startTime;
    var result = {};
    for (var prop in kfs) {
      if (kfs[prop] && kfs[prop].length > 0) {
        result[prop] = evaluate(clip, prop, localTime);
      }
    }
    return result;
  }

  /**
   * Check if a clip has any keyframes for a given property.
   */
  function hasKeyframes(clip, property) {
    if (!clip.keyframes) return false;
    if (property) return clip.keyframes[property] && clip.keyframes[property].length > 0;
    for (var p in clip.keyframes) {
      if (clip.keyframes[p] && clip.keyframes[p].length > 0) return true;
    }
    return false;
  }

  /**
   * Get all keyframe times for a clip (sorted, deduplicated).
   * Used for rendering diamond indicators on clip.
   */
  function getAllKeyframeTimes(clip) {
    var times = {};
    var kfs = ensureKeyframes(clip);
    for (var prop in kfs) {
      if (!kfs[prop]) continue;
      for (var i = 0; i < kfs[prop].length; i++) {
        times[kfs[prop][i].time.toFixed(3)] = kfs[prop][i].time;
      }
    }
    var result = [];
    for (var k in times) result.push(times[k]);
    result.sort(function(a, b) { return a - b; });
    return result;
  }

  function _sortKeyframes(arr) {
    arr.sort(function(a, b) { return a.time - b.time; });
  }

  /**
   * Compute the local media time for a clip with speed keyframes.
   * Instead of simple `(time - startTime) * speed + trimStart`,
   * integrates the speed curve to find the correct media offset.
   *
   * @param {Object} clip — The clip object
   * @param {number} globalTime — Current timeline time
   * @returns {number} Media time to seek to (corresponds to source file position)
   */
  // ── Speed integral LUT ──
  // computeSpeedMappedTime used to re-integrate from 0 on EVERY call (per frame per clip, O(n^2)
  // over playback). The LUT integrates once per curve edit and answers lookups in O(1). The cache
  // is keyed by the clip object (WeakMap: undo/restore recreate clips, invalidating naturally) and
  // revalidated by a signature of the speed keyframes + duration, so direct mutations also refresh.
  var _lutCache = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;

  function _speedLUT(clip) {
    var kfs = clip.keyframes && clip.keyframes.speed;
    if (!kfs || kfs.length === 0) return null;
    var sig = JSON.stringify(kfs) + '|' + (clip.duration || 0);
    var entry = _lutCache ? _lutCache.get(clip) : null;
    if (entry && entry.sig === sig) return entry;
    var dur = Math.max(0.01, clip.duration || 0.01);
    var steps = Math.max(120, Math.min(20000, Math.ceil(dur * 240)));
    var dt = dur / steps;
    var lut = new Float64Array(steps + 1);
    var acc = 0;
    var prev = evaluate(clip, 'speed', 0);
    lut[0] = 0;
    for (var i = 1; i <= steps; i++) {
      var s = evaluate(clip, 'speed', i * dt);
      acc += (prev + s) * 0.5 * dt;
      lut[i] = acc;
      prev = s;
    }
    entry = { sig: sig, dt: dt, dur: dur, lut: lut, total: acc, lastSpeed: prev };
    if (_lutCache) _lutCache.set(clip, entry);
    return entry;
  }

  function computeSpeedMappedTime(clip, globalTime) {
    var elapsed = globalTime - clip.startTime;
    if (elapsed <= 0) return clip.trimStart || 0;

    var kfs = clip.keyframes && clip.keyframes.speed;
    if (!kfs || kfs.length === 0) {
      return elapsed * (clip.speed || 1) + (clip.trimStart || 0);
    }

    var L = _speedLUT(clip);
    var mediaOffset;
    if (elapsed >= L.dur) {
      mediaOffset = L.total + (elapsed - L.dur) * L.lastSpeed;
    } else {
      var idx = elapsed / L.dt;
      var i0 = Math.floor(idx);
      var frac = idx - i0;
      var a = L.lut[i0];
      var b = L.lut[Math.min(i0 + 1, L.lut.length - 1)];
      mediaOffset = a + (b - a) * frac;
    }
    return mediaOffset + (clip.trimStart || 0);
  }

  /**
   * Source media span the clip consumes (seconds of source footage).
   * With speed keyframes: the integral of speed over the clip. Without: duration * speed
   * (the same invariant _veSetClipSpeed uses). This is the conserved quantity when a
   * speed curve is applied: the clip's TIMELINE duration is derived from it, never edited freely.
   */
  function getSourceSpan(clip) {
    var kfs = clip.keyframes && clip.keyframes.speed;
    if (kfs && kfs.length) return _speedLUT(clip).total;
    return (clip.duration || 0) * (clip.speed || 1);
  }

  /**
   * Compute the effective playback rate at a given time for a clip.
   * Used for setting audio playbackRate in real-time.
   */
  function getSpeedAtTime(clip, globalTime) {
    var kfs = clip.keyframes && clip.keyframes.speed;
    if (!kfs || kfs.length === 0) return clip.speed || 1;
    var localTime = globalTime - clip.startTime;
    return evaluate(clip, 'speed', localTime);
  }

  /**
   * THE canonical speed-curve write path (panel, presets, programmatic ramps all come here).
   * speedKfs: [{time (seconds, current clip timebase), value, easing?, hOut?, hIn?}].
   *
   * Conserves the source span: after sanitizing + storing the curve, the clip's timeline duration
   * is re-derived so that the integral of speed over the clip equals the source footage consumed
   * (newDuration = span / avgSpeed), and keyframe times (plus bezier handle dt) are rescaled into
   * the new timebase. clip.speed collapses to 1 (the curve IS the speed). Passing an empty array
   * delegates to clearSpeedKeyframes.
   */
  function applySpeedCurve(clip, speedKfs) {
    if (!clip) return false;
    if (!speedKfs || speedKfs.length === 0) return clearSpeedKeyframes(clip);
    var range = PROPERTIES.speed;
    var S = getSourceSpan(clip);
    var curDur = Math.max(0.01, clip.duration || 0.01);
    var arr = [];
    for (var i = 0; i < speedKfs.length; i++) {
      var k = speedKfs[i];
      var kf = {
        time: Math.max(0, Math.min(curDur, k.time || 0)),
        value: Math.max(range.min, Math.min(range.max, k.value != null ? k.value : 1)),
        easing: k.easing || 'linear'
      };
      if (k.hOut) kf.hOut = { dt: k.hOut.dt, dv: k.hOut.dv };
      if (k.hIn) kf.hIn = { dt: k.hIn.dt, dv: k.hIn.dv };
      arr.push(kf);
    }
    _sortKeyframes(arr);
    var kfsObj = ensureKeyframes(clip);
    kfsObj.speed = arr;

    // Average speed over the CURRENT timebase, then derive the new duration. Rescaling every
    // keyframe time by newDur/curDur keeps the integral exactly equal to S (integral scales
    // linearly with a time rescale), so one pass is exact, no iteration needed.
    var L = _speedLUT(clip);
    var avg = Math.max(0.001, L.total / curDur);
    var newDur = Math.max(0.05, S / avg);
    var scale = newDur / curDur;
    if (Math.abs(scale - 1) > 1e-9) {
      for (var j = 0; j < arr.length; j++) {
        arr[j].time *= scale;
        if (arr[j].hOut) arr[j].hOut.dt *= scale;
        if (arr[j].hIn) arr[j].hIn.dt *= scale;
      }
    }
    clip.speed = 1;
    clip.duration = newDur;
    var VE = window.__ccVideoEditor;
    if (VE && VE._veRecalcDuration) VE._veRecalcDuration();
    return true;
  }

  /**
   * Apply a speed ramp preset to a clip.
   * Preset times are normalized (0–1), scaled to clip duration; duration is re-derived
   * by applySpeedCurve so the same footage stays on screen (matches the Rate field semantics).
   */
  function applySpeedPreset(clip, presetKey) {
    var preset = SPEED_PRESETS[presetKey];
    if (!preset) return false;
    var dur = Math.max(0.01, clip.duration || 0.01);
    var kfs = [];
    for (var i = 0; i < preset.keyframes.length; i++) {
      var pk = preset.keyframes[i];
      kfs.push({ time: pk.time * dur, value: pk.value, easing: pk.easing || 'linear' });
    }
    return applySpeedCurve(clip, kfs);
  }

  /**
   * Clear speed keyframes, reverting to constant 1x with the clip's true source length
   * (the span the curve was consuming is preserved, so no footage is lost or invented).
   */
  function clearSpeedKeyframes(clip) {
    var had = clip.keyframes && clip.keyframes.speed && clip.keyframes.speed.length;
    if (!had) {
      if (clip.keyframes && clip.keyframes.speed) delete clip.keyframes.speed;
      return true;
    }
    var S = getSourceSpan(clip);
    delete clip.keyframes.speed;
    clip.speed = 1;
    clip.duration = Math.max(0.05, S);
    var VE = window.__ccVideoEditor;
    if (VE && VE._veRecalcDuration) VE._veRecalcDuration();
    return true;
  }

  /**
   * Redistribute keyframes when a clip is split at localSplit (clip-local seconds).
   * Call AFTER rightClip was deep-cloned but while leftClip.keyframes still holds the
   * FULL original set. Each property keeps its keys on its own side, gets a boundary
   * keyframe carrying the evaluated value at the cut (so both halves render the same
   * values the whole clip did), and right-half times shift into the new local base.
   * Bezier handles on synthetic boundary keys are dropped (their segments changed).
   */
  function splitKeyframesAt(leftClip, rightClip, localSplit) {
    var src = ensureKeyframes(leftClip);
    if (!hasKeyframes(leftClip)) { rightClip.keyframes = {}; return; }
    var EPS = 0.011;
    var leftObj = {}, rightObj = {};
    for (var prop in src) {
      var arr = src[prop];
      if (!arr || !arr.length) continue;
      var v = evaluate(leftClip, prop, localSplit);
      var crossEasing = 'linear';
      for (var s = 0; s < arr.length - 1; s++) {
        if (arr[s].time < localSplit && arr[s + 1].time > localSplit) {
          crossEasing = arr[s + 1].easing === 'bezier' ? 'linear' : (arr[s + 1].easing || 'linear');
        }
      }
      var la = [], ra = [];
      var hasBefore = false, hasAfter = false, onCut = false;
      for (var i = 0; i < arr.length; i++) {
        var k = arr[i];
        var copy = { time: k.time, value: k.value, easing: k.easing || 'linear' };
        if (k.hOut) copy.hOut = { dt: k.hOut.dt, dv: k.hOut.dv };
        if (k.hIn) copy.hIn = { dt: k.hIn.dt, dv: k.hIn.dv };
        if (k.time <= localSplit - EPS) { hasBefore = true; la.push(copy); }
        else if (k.time >= localSplit + EPS) {
          hasAfter = true;
          copy.time = k.time - localSplit;
          ra.push(copy);
        } else {
          // keyframe sits on the cut: it becomes the boundary on both sides
          onCut = true;
          la.push({ time: localSplit, value: k.value, easing: k.easing === 'bezier' ? 'linear' : (k.easing || 'linear') });
          ra.push({ time: 0, value: k.value, easing: 'linear' });
        }
      }
      if (!onCut && hasAfter) la.push({ time: localSplit, value: v, easing: crossEasing });
      if (!onCut && hasBefore) ra.unshift({ time: 0, value: v, easing: 'linear' });
      if (la.length) { _sortKeyframes(la); leftObj[prop] = la; }
      if (ra.length) { _sortKeyframes(ra); rightObj[prop] = ra; }
    }
    leftClip.keyframes = leftObj;
    rightClip.keyframes = rightObj;
  }

  /**
   * Bulk-set one property's keyframe array (graph editor write path).
   * Sanitizes (sort, clamp value into the property range when known) and drops the
   * property key entirely when empty so hasKeyframes stays truthful.
   */
  function setPropertyKeyframes(clip, property, arr) {
    var kfsObj = ensureKeyframes(clip);
    if (!arr || arr.length === 0) { delete kfsObj[property]; return true; }
    var range = PROPERTIES[property];
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var k = arr[i];
      var kf = {
        time: Math.max(0, k.time || 0),
        value: range ? Math.max(range.min, Math.min(range.max, k.value)) : k.value,
        easing: k.easing || 'linear'
      };
      if (k.hOut) kf.hOut = { dt: k.hOut.dt, dv: k.hOut.dv };
      if (k.hIn) kf.hIn = { dt: k.hIn.dt, dv: k.hIn.dv };
      out.push(kf);
    }
    _sortKeyframes(out);
    kfsObj[property] = out;
    return true;
  }

  // Public API
  window.VEKeyframes = {
    EASINGS: EASINGS,
    EASING_ALIASES: EASING_ALIASES,
    PROPERTIES: PROPERTIES,
    SPEED_PRESETS: SPEED_PRESETS,
    resolveEasing: resolveEasing,
    ensureKeyframes: ensureKeyframes,
    addKeyframe: addKeyframe,
    removeKeyframe: removeKeyframe,
    setPropertyKeyframes: setPropertyKeyframes,
    evaluate: evaluate,
    evaluateAll: evaluateAll,
    hasKeyframes: hasKeyframes,
    getAllKeyframeTimes: getAllKeyframeTimes,
    computeSpeedMappedTime: computeSpeedMappedTime,
    getSpeedAtTime: getSpeedAtTime,
    getSourceSpan: getSourceSpan,
    splitKeyframesAt: splitKeyframesAt,
    applySpeedCurve: applySpeedCurve,
    applySpeedPreset: applySpeedPreset,
    clearSpeedKeyframes: clearSpeedKeyframes
  };
})();

// Modular skeleton hook (Faz 8) — ve-keyframes is now a video loader module (modules/video/). Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-keyframes', parent: 'video', title: 've-keyframes', mount: function () {}, unmount: function () {} });
