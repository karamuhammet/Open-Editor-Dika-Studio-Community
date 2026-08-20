/* Module: video/ve-audio-advanced/processors — DSP nodes — EQ, chain, compressor, gate, fade, pan, reverb, ducker, de-esser.
   Part of the ve-audio-advanced group (decomposed from the 1696-line IIFE). Functions hang off the
   shared namespace VAA (window.__ccVEAudioAdvanced, created by the parent); cross-module refs resolve
   through VAA at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VAA = window.__ccVEAudioAdvanced;
  if (!VAA) return;

  VAA.ParametricEQ = function (ctx) {
    this._ctx = ctx || VAA._getCtx();
    this._bands = [];
    this._input = this._ctx.createGain();
    this._output = this._ctx.createGain();
    this._input.gain.value = 1;
    this._output.gain.value = 1;

    // Default 8-band configuration
    var defaults = [
      { freq: 60,    type: 'highpass',  gain: 0, Q: 0.707 },
      { freq: 170,   type: 'lowshelf',  gain: 0, Q: 0.707 },
      { freq: 350,   type: 'peaking',   gain: 0, Q: 1.0 },
      { freq: 700,   type: 'peaking',   gain: 0, Q: 1.0 },
      { freq: 1400,  type: 'peaking',   gain: 0, Q: 1.0 },
      { freq: 3000,  type: 'peaking',   gain: 0, Q: 1.0 },
      { freq: 6000,  type: 'highshelf', gain: 0, Q: 0.707 },
      { freq: 12000, type: 'lowpass',   gain: 0, Q: 0.707 }
    ];

    var prev = this._input;
    for (var i = 0; i < defaults.length; i++) {
      var d = defaults[i];
      var filter = this._ctx.createBiquadFilter();
      filter.type = d.type;
      filter.frequency.value = d.freq;
      filter.Q.value = d.Q;
      filter.gain.value = d.gain;

      prev.connect(filter);
      this._bands.push({
        filter: filter,
        enabled: true,
        freq: d.freq,
        type: d.type,
        gain: d.gain,
        Q: d.Q
      });
      prev = filter;
    }
    prev.connect(this._output);
  };

  VAA.ParametricEQ.prototype = {
    getInput: function() { return this._input; },
    getOutput: function() { return this._output; },

    setBand: function(index, params) {
      if (index < 0 || index >= this._bands.length) return;
      var band = this._bands[index];
      var f = band.filter;

      if (params.freq !== undefined) { f.frequency.value = params.freq; band.freq = params.freq; }
      if (params.gain !== undefined) { f.gain.value = Math.max(-24, Math.min(24, params.gain)); band.gain = params.gain; }
      if (params.Q !== undefined) { f.Q.value = Math.max(0.1, Math.min(18, params.Q)); band.Q = params.Q; }
      if (params.type !== undefined) { f.type = params.type; band.type = params.type; }
      if (params.enabled !== undefined) {
        band.enabled = params.enabled;
        // Bypass by setting gain to 0 for peaking/shelf, or disconnecting
        if (!params.enabled && (band.type === 'peaking' || band.type === 'lowshelf' || band.type === 'highshelf')) {
          f.gain.value = 0;
        } else if (params.enabled) {
          f.gain.value = band.gain;
        }
      }
    },

    getBand: function(index) {
      if (index < 0 || index >= this._bands.length) return null;
      var b = this._bands[index];
      return { freq: b.freq, gain: b.gain, Q: b.Q, type: b.type, enabled: b.enabled };
    },

    getBandCount: function() { return this._bands.length; },

    /**
     * Get frequency response for visualization
     * @param {Float32Array} frequencies — array of frequencies to check
     * @returns {{magResponse: Float32Array, phaseResponse: Float32Array}}
     */
    getFrequencyResponse: function(frequencies) {
      var len = frequencies.length;
      var magTotal = new Float32Array(len);
      var phaseTotal = new Float32Array(len);
      var mag = new Float32Array(len);
      var phase = new Float32Array(len);

      // Initialize to 1 (0 dB)
      for (var i = 0; i < len; i++) magTotal[i] = 1;

      for (var b = 0; b < this._bands.length; b++) {
        if (!this._bands[b].enabled) continue;
        this._bands[b].filter.getFrequencyResponse(frequencies, mag, phase);
        for (var j = 0; j < len; j++) {
          magTotal[j] *= mag[j];
          phaseTotal[j] += phase[j];
        }
      }

      return { magResponse: magTotal, phaseResponse: phaseTotal };
    },

    reset: function() {
      for (var i = 0; i < this._bands.length; i++) {
        this._bands[i].filter.gain.value = 0;
        this._bands[i].gain = 0;
      }
    },

    toJSON: function() {
      var arr = [];
      for (var i = 0; i < this._bands.length; i++) {
        var b = this._bands[i];
        arr.push({ freq: b.freq, gain: b.gain, Q: b.Q, type: b.type, enabled: b.enabled });
      }
      return arr;
    },

    fromJSON: function(arr) {
      if (!arr || !arr.length) return;
      for (var i = 0; i < Math.min(arr.length, this._bands.length); i++) {
        this.setBand(i, arr[i]);
      }
    },

    dispose: function() {
      try {
        this._input.disconnect();
        this._output.disconnect();
        for (var i = 0; i < this._bands.length; i++) {
          this._bands[i].filter.disconnect();
        }
      } catch (e) {}
      this._bands = [];
    }
  };

  VAA.AudioChain = function (ctx) {
    this._ctx = ctx || VAA._getCtx();
    this._input = this._ctx.createGain();
    this._output = this._ctx.createGain();
    this._processors = []; // [{id, node, type, enabled}]
    this._input.connect(this._output);
  };

  VAA.AudioChain.prototype = {
    getInput: function() { return this._input; },
    getOutput: function() { return this._output; },

    /**
     * Add a processor to the chain
     * @param {string} id — unique identifier
     * @param {AudioNode|Object} processor — must have getInput()/getOutput() or be an AudioNode
     * @param {string} type — processor type name
     * @returns {boolean}
     */
    add: function(id, processor, type) {
      // Check for duplicate
      for (var i = 0; i < this._processors.length; i++) {
        if (this._processors[i].id === id) return false;
      }

      this._processors.push({
        id: id,
        node: processor,
        type: type || 'unknown',
        enabled: true
      });

      this._rebuild();
      return true;
    },

    remove: function(id) {
      var idx = -1;
      for (var i = 0; i < this._processors.length; i++) {
        if (this._processors[i].id === id) { idx = i; break; }
      }
      if (idx === -1) return false;

      var proc = this._processors[idx];
      try {
        var n = proc.node;
        if (n.disconnect) n.disconnect();
        else if (n.getInput) { n.getInput().disconnect(); n.getOutput().disconnect(); }
      } catch (e) {}

      this._processors.splice(idx, 1);
      this._rebuild();
      return true;
    },

    setEnabled: function(id, enabled) {
      for (var i = 0; i < this._processors.length; i++) {
        if (this._processors[i].id === id) {
          this._processors[i].enabled = enabled;
          this._rebuild();
          return true;
        }
      }
      return false;
    },

    getProcessor: function(id) {
      for (var i = 0; i < this._processors.length; i++) {
        if (this._processors[i].id === id) return this._processors[i].node;
      }
      return null;
    },

    _rebuild: function() {
      // Disconnect everything
      try { this._input.disconnect(); } catch (e) {}
      for (var i = 0; i < this._processors.length; i++) {
        var n = this._processors[i].node;
        try {
          if (n.disconnect) n.disconnect();
          else if (n.getOutput) n.getOutput().disconnect();
        } catch (e) {}
      }

      // Rebuild chain: input → [enabled processors] → output
      var prev = this._input;
      for (var j = 0; j < this._processors.length; j++) {
        if (!this._processors[j].enabled) continue;
        var node = this._processors[j].node;

        var inp = (node.getInput) ? node.getInput() : node;
        var out = (node.getOutput) ? node.getOutput() : node;

        prev.connect(inp);
        prev = out;
      }
      prev.connect(this._output);
    },

    getProcessorList: function() {
      var list = [];
      for (var i = 0; i < this._processors.length; i++) {
        var p = this._processors[i];
        list.push({ id: p.id, type: p.type, enabled: p.enabled });
      }
      return list;
    },

    dispose: function() {
      try { this._input.disconnect(); } catch (e) {}
      try { this._output.disconnect(); } catch (e) {}
      for (var i = 0; i < this._processors.length; i++) {
        var n = this._processors[i].node;
        try {
          if (n.dispose) n.dispose();
          else if (n.disconnect) n.disconnect();
        } catch (e) {}
      }
      this._processors = [];
    }
  };

  VAA.Compressor = function (ctx, params) {
    this._ctx = ctx || VAA._getCtx();
    this._input = this._ctx.createGain();
    this._output = this._ctx.createGain();
    this._useWorklet = false;
    this._workletNode = null;
    this._gainReduction = 0;

    this._params = {
      threshold: -24,
      ratio: 4,
      attack: 0.003,
      release: 0.25,
      knee: 6,
      makeupGain: 0,
      autoMakeup: true
    };

    if (params) {
      if (params.threshold !== undefined) this._params.threshold = Math.max(-60, Math.min(0, params.threshold));
      if (params.ratio !== undefined) this._params.ratio = Math.max(1, Math.min(20, params.ratio));
      if (params.attack !== undefined) this._params.attack = Math.max(0.0003, Math.min(0.1, params.attack));
      if (params.release !== undefined) this._params.release = Math.max(0.05, Math.min(1, params.release));
      if (params.knee !== undefined) this._params.knee = Math.max(0, Math.min(12, params.knee));
      if (params.makeupGain !== undefined) this._params.makeupGain = params.makeupGain;
      if (params.autoMakeup !== undefined) this._params.autoMakeup = params.autoMakeup;
    }

    // Try AudioWorklet path
    if (VAA._workletsLoaded) {
      try {
        var mg = this._params.makeupGain;
        if (this._params.autoMakeup) {
          mg = Math.abs(this._params.threshold) * (1 - 1 / this._params.ratio) * 0.5;
          mg = Math.max(0, Math.min(24, mg));
        }
        this._workletNode = new AudioWorkletNode(this._ctx, 'compressor-processor', {
          parameterData: {
            threshold: this._params.threshold,
            ratio: this._params.ratio,
            attack: this._params.attack,
            release: this._params.release,
            knee: this._params.knee,
            makeupGain: mg
          }
        });
        this._input.connect(this._workletNode);
        this._workletNode.connect(this._output);
        var self = this;
        this._workletNode.port.onmessage = function(e) {
          if (e.data && e.data.gainReduction !== undefined) {
            self._gainReduction = e.data.gainReduction;
          }
        };
        this._useWorklet = true;
      } catch (e) {
        console.warn('[VAA.Compressor] Worklet VAA.init failed, using DynamicsCompressorNode:', e);
        this._useWorklet = false;
      }
    }

    // Fallback: native DynamicsCompressorNode
    if (!this._useWorklet) {
      this._comp = this._ctx.createDynamicsCompressor();
      this._makeupGain = this._ctx.createGain();
      this._input.connect(this._comp);
      this._comp.connect(this._makeupGain);
      this._makeupGain.connect(this._output);
      this._applyParams();
    }
  };

  VAA.Compressor.prototype = {
    getInput: function() { return this._input; },
    getOutput: function() { return this._output; },

    setParams: function(params) {
      if (params.threshold !== undefined) this._params.threshold = Math.max(-60, Math.min(0, params.threshold));
      if (params.ratio !== undefined) this._params.ratio = Math.max(1, Math.min(20, params.ratio));
      if (params.attack !== undefined) this._params.attack = Math.max(0.0003, Math.min(0.1, params.attack));
      if (params.release !== undefined) this._params.release = Math.max(0.05, Math.min(1, params.release));
      if (params.knee !== undefined) this._params.knee = Math.max(0, Math.min(12, params.knee));
      if (params.makeupGain !== undefined) this._params.makeupGain = params.makeupGain;
      if (params.autoMakeup !== undefined) this._params.autoMakeup = params.autoMakeup;
      this._applyParams();
    },

    _applyParams: function() {
      if (this._useWorklet && this._workletNode) {
        var p = this._workletNode.parameters;
        p.get('threshold').value = this._params.threshold;
        p.get('ratio').value = this._params.ratio;
        p.get('attack').value = this._params.attack;
        p.get('release').value = this._params.release;
        p.get('knee').value = this._params.knee;
        var mg = this._params.makeupGain;
        if (this._params.autoMakeup) {
          mg = Math.abs(this._params.threshold) * (1 - 1 / this._params.ratio) * 0.5;
          mg = Math.max(0, Math.min(24, mg));
        }
        p.get('makeupGain').value = mg;
        return;
      }
      // Fallback path
      if (!this._comp) return;
      var c = this._comp;
      c.threshold.value = this._params.threshold;
      c.ratio.value = this._params.ratio;
      c.attack.value = this._params.attack;
      c.release.value = this._params.release;
      c.knee.value = this._params.knee;

      // Auto makeup gain: compensate for gain reduction
      var mg = this._params.makeupGain;
      if (this._params.autoMakeup) {
        // Approximate: half the threshold / ratio difference
        mg = Math.abs(this._params.threshold) * (1 - 1 / this._params.ratio) * 0.5;
        mg = Math.max(0, Math.min(24, mg));
      }
      this._makeupGain.gain.value = Math.pow(10, mg / 20); // dB to linear
    },

    getReduction: function() {
      if (this._useWorklet) return -this._gainReduction;
      return this._comp ? this._comp.reduction : 0; // negative dB
    },

    getParams: function() {
      return {
        threshold: this._params.threshold,
        ratio: this._params.ratio,
        attack: this._params.attack,
        release: this._params.release,
        knee: this._params.knee,
        makeupGain: this._params.makeupGain,
        autoMakeup: this._params.autoMakeup
      };
    },

    toJSON: function() { return this.getParams(); },
    fromJSON: function(params) { if (params) this.setParams(params); },

    dispose: function() {
      try {
        this._input.disconnect();
        this._output.disconnect();
        if (this._useWorklet && this._workletNode) {
          this._workletNode.port.onmessage = null;
          this._workletNode.disconnect();
        }
        if (this._comp) this._comp.disconnect();
        if (this._makeupGain) this._makeupGain.disconnect();
      } catch (e) {}
    }
  };

  VAA.NoiseGate = function (ctx, params) {
    this._ctx = ctx || VAA._getCtx();
    this._input = this._ctx.createGain();
    this._output = this._ctx.createGain();
    this._useWorklet = false;
    this._workletNode = null;

    this._params = {
      threshold: -40, // dB
      attack: 0.001,  // seconds
      hold: 0.05,     // seconds
      release: 0.05   // seconds
    };

    this._isOpen = false;
    this._holdTimer = null;
    this._rafId = null;

    if (params) {
      if (params.threshold !== undefined) this._params.threshold = params.threshold;
      if (params.attack !== undefined) this._params.attack = params.attack;
      if (params.hold !== undefined) this._params.hold = params.hold;
      if (params.release !== undefined) this._params.release = params.release;
    }

    // Try AudioWorklet path
    if (VAA._workletsLoaded) {
      try {
        this._workletNode = new AudioWorkletNode(this._ctx, 'noise-gate-processor', {
          parameterData: {
            threshold: this._params.threshold,
            attack: this._params.attack,
            hold: this._params.hold,
            release: this._params.release
          }
        });
        this._input.connect(this._workletNode);
        this._workletNode.connect(this._output);
        this._useWorklet = true;
      } catch (e) {
        console.warn('[VAA.NoiseGate] Worklet VAA.init failed, using fallback:', e);
        this._useWorklet = false;
      }
    }

    // Fallback: AnalyserNode + GainNode + rAF polling
    if (!this._useWorklet) {
      this._gateGain = this._ctx.createGain();
      this._analyser = this._ctx.createAnalyser();
      this._analyser.fftSize = 256;
      this._analyserData = new Float32Array(128);

      this._input.connect(this._analyser);
      this._input.connect(this._gateGain);
      this._gateGain.connect(this._output);

      // Start monitoring
      this._startMonitor();
    }
  };

  VAA.NoiseGate.prototype = {
    getInput: function() { return this._input; },
    getOutput: function() { return this._output; },

    _startMonitor: function() {
      var self = this;
      function tick() {
        self._analyser.getFloatFrequencyData(self._analyserData);
        // Calculate RMS level in dB
        var sum = 0;
        for (var i = 0; i < self._analyserData.length; i++) {
          var v = Math.pow(10, self._analyserData[i] / 20);
          sum += v * v;
        }
        var rms = Math.sqrt(sum / self._analyserData.length);
        var dbLevel = 20 * Math.log10(Math.max(rms, 1e-10));

        var now = self._ctx.currentTime;

        if (dbLevel >= self._params.threshold) {
          // Signal above threshold — open gate
          if (!self._isOpen) {
            self._isOpen = true;
            self._gateGain.gain.cancelScheduledValues(now);
            self._gateGain.gain.linearRampToValueAtTime(1.0, now + self._params.attack);
          }
          // Reset hold timer
          if (self._holdTimer) { clearTimeout(self._holdTimer); self._holdTimer = null; }
        } else if (self._isOpen) {
          // Signal below threshold — start hold, then close
          if (!self._holdTimer) {
            self._holdTimer = setTimeout(function() {
              self._isOpen = false;
              var t = self._ctx.currentTime;
              self._gateGain.gain.cancelScheduledValues(t);
              self._gateGain.gain.linearRampToValueAtTime(0.0001, t + self._params.release);
              self._holdTimer = null;
            }, self._params.hold * 1000);
          }
        }

        self._rafId = requestAnimationFrame(tick);
      }
      this._rafId = requestAnimationFrame(tick);
    },

    setParams: function(params) {
      if (params.threshold !== undefined) this._params.threshold = Math.max(-80, Math.min(0, params.threshold));
      if (params.attack !== undefined) this._params.attack = Math.max(0.0001, Math.min(0.05, params.attack));
      if (params.hold !== undefined) this._params.hold = Math.max(0.001, Math.min(0.5, params.hold));
      if (params.release !== undefined) this._params.release = Math.max(0.005, Math.min(0.2, params.release));
      // Update worklet params if active
      if (this._useWorklet && this._workletNode) {
        var p = this._workletNode.parameters;
        p.get('threshold').value = this._params.threshold;
        p.get('attack').value = this._params.attack;
        p.get('hold').value = this._params.hold;
        p.get('release').value = this._params.release;
      }
    },

    getParams: function() { return { threshold: this._params.threshold, attack: this._params.attack, hold: this._params.hold, release: this._params.release }; },
    isGateOpen: function() { return this._isOpen; },
    toJSON: function() { return this.getParams(); },
    fromJSON: function(p) { if (p) this.setParams(p); },

    dispose: function() {
      if (this._rafId) cancelAnimationFrame(this._rafId);
      if (this._holdTimer) clearTimeout(this._holdTimer);
      try {
        this._input.disconnect();
        this._output.disconnect();
        if (this._useWorklet && this._workletNode) {
          this._workletNode.disconnect();
        }
        if (this._gateGain) this._gateGain.disconnect();
        if (this._analyser) this._analyser.disconnect();
      } catch (e) {}
    }
  };

  VAA.FadeEnvelope = function (ctx) {
    this._ctx = ctx || VAA._getCtx();
    this._gain = this._ctx.createGain();
    this._gain.gain.value = 1;
  };

  VAA.FadeEnvelope.prototype = {
    getInput: function() { return this._gain; },
    getOutput: function() { return this._gain; },

    /**
     * Apply fade envelope to a time range
     * @param {number} startTime — when clip starts (AudioContext time)
     * @param {number} duration — clip duration
     * @param {number} fadeIn — fade in duration (seconds)
     * @param {number} fadeOut — fade out duration (seconds)
     * @param {string} curve — 'linear', 'exponential', 'sCurve'
     */
    apply: function(startTime, duration, fadeIn, fadeOut, curve) {
      var g = this._gain.gain;
      g.cancelScheduledValues(startTime);

      var endTime = startTime + duration;
      curve = curve || 'linear';

      // Start
      if (fadeIn > 0) {
        g.setValueAtTime(0.0001, startTime);
        if (curve === 'exponential') {
          g.exponentialRampToValueAtTime(1.0, startTime + fadeIn);
        } else {
          g.linearRampToValueAtTime(1.0, startTime + fadeIn);
        }
      } else {
        g.setValueAtTime(1.0, startTime);
      }

      // Hold at 1
      if (fadeOut > 0) {
        var fadeOutStart = endTime - fadeOut;
        if (fadeOutStart > startTime + fadeIn) {
          g.setValueAtTime(1.0, fadeOutStart);
        }
        if (curve === 'exponential') {
          g.exponentialRampToValueAtTime(0.0001, endTime);
        } else {
          g.linearRampToValueAtTime(0.0001, endTime);
        }
      }
    },

    /**
     * Apply crossfade between two clips
     * @param {VAA.FadeEnvelope} otherEnv — the other clip's envelope
     * @param {number} crossfadeStart — when crossfade starts
     * @param {number} crossfadeDuration — crossfade length
     */
    crossfade: function(otherEnv, crossfadeStart, crossfadeDuration) {
      var g1 = this._gain.gain;
      var g2 = otherEnv._gain.gain;

      // Equal-power crossfade
      g1.setValueAtTime(1.0, crossfadeStart);
      g1.linearRampToValueAtTime(0.0001, crossfadeStart + crossfadeDuration);

      g2.setValueAtTime(0.0001, crossfadeStart);
      g2.linearRampToValueAtTime(1.0, crossfadeStart + crossfadeDuration);
    },

    reset: function() {
      this._gain.gain.cancelScheduledValues(0);
      this._gain.gain.value = 1;
    },

    dispose: function() {
      try { this._gain.disconnect(); } catch (e) {}
    }
  };

  VAA.StereoPan = function (ctx) {
    this._ctx = ctx || VAA._getCtx();
    if (this._ctx.createStereoPanner) {
      this._panner = this._ctx.createStereoPanner();
      this._panner.pan.value = 0;
    } else {
      // Fallback: use ChannelMerger + Splitter
      this._panner = this._ctx.createGain();
    }
  };

  VAA.StereoPan.prototype = {
    getInput: function() { return this._panner; },
    getOutput: function() { return this._panner; },

    setPan: function(value) {
      // -1 (left) to +1 (right)
      value = Math.max(-1, Math.min(1, value));
      if (this._panner.pan) {
        this._panner.pan.value = value;
      }
    },

    getPan: function() {
      return this._panner.pan ? this._panner.pan.value : 0;
    },

    dispose: function() {
      try { this._panner.disconnect(); } catch (e) {}
    }
  };

  VAA.ReverbEngine = function (ctx) {
    this._ctx = ctx || VAA._getCtx();
    this._input = this._ctx.createGain();
    this._output = this._ctx.createGain();
    this._dry = this._ctx.createGain();
    this._wet = this._ctx.createGain();
    this._convolver = this._ctx.createConvolver();

    this._dry.gain.value = 1;
    this._wet.gain.value = 0.3;

    // Dry path
    this._input.connect(this._dry);
    this._dry.connect(this._output);

    // Wet path
    this._input.connect(this._convolver);
    this._convolver.connect(this._wet);
    this._wet.connect(this._output);

    this._currentPreset = null;
  };

  VAA.ReverbEngine.prototype = {
    getInput: function() { return this._input; },
    getOutput: function() { return this._output; },

    /**
     * Generate an impulse response algorithmically
     * @param {number} duration — IR duration in seconds
     * @param {number} decay — decay time multiplier
     * @param {number} damping — high-frequency damping (0-1)
     */
    generateIR: function(duration, decay, damping) {
      var ctx = this._ctx;
      var sampleRate = ctx.sampleRate;
      var length = Math.floor(sampleRate * duration);
      var buffer = ctx.createBuffer(2, length, sampleRate);

      for (var ch = 0; ch < 2; ch++) {
        var data = buffer.getChannelData(ch);
        for (var i = 0; i < length; i++) {
          var t = i / sampleRate;
          // Exponential decay
          var envelope = Math.exp(-t / decay * 3);
          // Random noise
          var noise = Math.random() * 2 - 1;
          // High-frequency damping (simple low-pass via averaging)
          if (i > 0 && damping > 0) {
            noise = noise * (1 - damping) + data[i - 1] * damping;
          }
          data[i] = noise * envelope;
        }
      }

      this._convolver.buffer = buffer;
    },

    setPreset: function(name) {
      var preset = VAA.ReverbEngine.PRESETS[name];
      if (!preset) return false;
      this._currentPreset = name;
      var duration = preset.decay * 1.5;
      this.generateIR(duration, preset.decay, preset.damping);
      return true;
    },

    setMix: function(wetAmount) {
      // 0 = fully dry, 1 = fully wet
      wetAmount = Math.max(0, Math.min(1, wetAmount));
      this._wet.gain.value = wetAmount;
      this._dry.gain.value = 1 - wetAmount * 0.5; // Don't fully cut dry
    },

    getMix: function() { return this._wet.gain.value; },
    getPreset: function() { return this._currentPreset; },

    toJSON: function() { return { preset: this._currentPreset, mix: this._wet.gain.value }; },
    fromJSON: function(data) {
      if (!data) return;
      if (data.preset) this.setPreset(data.preset);
      if (data.mix !== undefined) this.setMix(data.mix);
    },

    dispose: function() {
      try {
        this._input.disconnect();
        this._dry.disconnect();
        this._wet.disconnect();
        this._convolver.disconnect();
        this._output.disconnect();
      } catch (e) {}
    }
  };

  VAA.AudioDucker = function (ctx) {
    this._ctx = ctx || VAA._getCtx();
    this._sidechainInput = this._ctx.createGain(); // Connect narration here
    this._targetInput = this._ctx.createGain();    // Music goes through here
    this._targetGain = this._ctx.createGain();     // The ducking gain node
    this._output = this._ctx.createGain();
    this._analyser = this._ctx.createAnalyser();
    this._analyser.fftSize = 256;
    this._analyserData = new Float32Array(128);

    // Sidechain analysis (not audible)
    this._sidechainInput.connect(this._analyser);

    // Target signal path
    this._targetInput.connect(this._targetGain);
    this._targetGain.connect(this._output);

    this._params = {
      threshold: -30,   // dB — when sidechain exceeds this, duck starts
      duckLevel: -12,   // dB — how much to reduce target
      attack: 0.05,     // seconds
      release: 0.2      // seconds
    };

    this._isDucking = false;
    this._rafId = null;
  };

  VAA.AudioDucker.prototype = {
    getSidechainInput: function() { return this._sidechainInput; },
    getTargetInput: function() { return this._targetInput; },
    getOutput: function() { return this._output; },

    start: function() {
      var self = this;
      function tick() {
        self._analyser.getFloatFrequencyData(self._analyserData);
        var sum = 0;
        for (var i = 0; i < self._analyserData.length; i++) {
          var v = Math.pow(10, self._analyserData[i] / 20);
          sum += v * v;
        }
        var rms = Math.sqrt(sum / self._analyserData.length);
        var dbLevel = 20 * Math.log10(Math.max(rms, 1e-10));
        var now = self._ctx.currentTime;

        if (dbLevel > self._params.threshold) {
          if (!self._isDucking) {
            self._isDucking = true;
            var duckGain = Math.pow(10, self._params.duckLevel / 20);
            self._targetGain.gain.cancelScheduledValues(now);
            self._targetGain.gain.linearRampToValueAtTime(duckGain, now + self._params.attack);
          }
        } else {
          if (self._isDucking) {
            self._isDucking = false;
            self._targetGain.gain.cancelScheduledValues(now);
            self._targetGain.gain.linearRampToValueAtTime(1.0, now + self._params.release);
          }
        }

        self._rafId = requestAnimationFrame(tick);
      }
      this._rafId = requestAnimationFrame(tick);
    },

    stop: function() {
      if (this._rafId) cancelAnimationFrame(this._rafId);
      this._rafId = null;
    },

    setParams: function(params) {
      if (params.threshold !== undefined) this._params.threshold = params.threshold;
      if (params.duckLevel !== undefined) this._params.duckLevel = params.duckLevel;
      if (params.attack !== undefined) this._params.attack = params.attack;
      if (params.release !== undefined) this._params.release = params.release;
    },

    getParams: function() { return { threshold: this._params.threshold, duckLevel: this._params.duckLevel, attack: this._params.attack, release: this._params.release }; },
    isDucking: function() { return this._isDucking; },
    toJSON: function() { return this.getParams(); },
    fromJSON: function(p) { if (p) this.setParams(p); },

    dispose: function() {
      this.stop();
      try {
        this._sidechainInput.disconnect();
        this._targetInput.disconnect();
        this._targetGain.disconnect();
        this._analyser.disconnect();
        this._output.disconnect();
      } catch (e) {}
    }
  };

  VAA.DeEsser = function (ctx) {
    this._ctx = ctx || VAA._getCtx();
    this._input = this._ctx.createGain();
    this._output = this._ctx.createGain();

    // Band-split: extract sibilant range (4-8 kHz)
    this._bandpass = this._ctx.createBiquadFilter();
    this._bandpass.type = 'bandpass';
    this._bandpass.frequency.value = 6000;
    this._bandpass.Q.value = 1.5;

    // VAA.Compressor on the sibilant band
    this._comp = this._ctx.createDynamicsCompressor();
    this._comp.threshold.value = -20;
    this._comp.ratio.value = 8;
    this._comp.attack.value = 0.001;
    this._comp.release.value = 0.05;
    this._comp.knee.value = 3;

    // The main signal path uses a notch to reduce sibilance when detected
    this._notch = this._ctx.createBiquadFilter();
    this._notch.type = 'peaking';
    this._notch.frequency.value = 6000;
    this._notch.Q.value = 2;
    this._notch.gain.value = 0; // Will be modulated

    this._input.connect(this._notch);
    this._notch.connect(this._output);

    // Sidechain: bandpass → comp (for detection/metering only)
    this._input.connect(this._bandpass);
    this._bandpass.connect(this._comp);
    // comp output is unused for audio — we just read reduction

    this._amount = 6; // dB of sibilance reduction
    this._rafId = null;
  };

  VAA.DeEsser.prototype = {
    getInput: function() { return this._input; },
    getOutput: function() { return this._output; },

    start: function() {
      var self = this;
      function tick() {
        // Read compressor reduction to modulate the notch
        var reduction = self._comp.reduction; // negative dB
        if (reduction < -1) {
          // Sibilance detected — apply notch gain reduction
          self._notch.gain.value = Math.max(-self._amount, reduction * 0.5);
        } else {
          self._notch.gain.value = 0;
        }
        self._rafId = requestAnimationFrame(tick);
      }
      this._rafId = requestAnimationFrame(tick);
    },

    stop: function() {
      if (this._rafId) cancelAnimationFrame(this._rafId);
      this._rafId = null;
    },

    setAmount: function(db) { this._amount = Math.max(0, Math.min(12, db)); },
    setFrequency: function(freq) { this._bandpass.frequency.value = freq; this._notch.frequency.value = freq; },

    getAmount: function() { return this._amount; },
    getReduction: function() { return this._comp.reduction; },
    toJSON: function() { return { amount: this._amount, frequency: this._bandpass.frequency.value }; },
    fromJSON: function(p) { if (p) { if (p.amount !== undefined) this.setAmount(p.amount); if (p.frequency !== undefined) this.setFrequency(p.frequency); } },

    dispose: function() {
      this.stop();
      try { this._input.disconnect(); this._notch.disconnect(); this._bandpass.disconnect(); this._comp.disconnect(); this._output.disconnect(); } catch (e) {}
    }
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'processors', parent: 'video.ve-audio-advanced', title: 've-audio-advanced: processors', mount: function () {}, unmount: function () {} });
  }
})();
