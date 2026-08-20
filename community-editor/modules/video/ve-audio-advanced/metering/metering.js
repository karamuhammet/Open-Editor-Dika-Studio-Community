/* Module: video/ve-audio-advanced/metering — LUFS metering + loudness normalization.
   Part of the ve-audio-advanced group (decomposed from the 1696-line IIFE). Functions hang off the
   shared namespace VAA (window.__ccVEAudioAdvanced, created by the parent); cross-module refs resolve
   through VAA at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VAA = window.__ccVEAudioAdvanced;
  if (!VAA) return;

  VAA.LUFSMeter = function (ctx) {
    this._ctx = ctx || VAA._getCtx();
    this._input = this._ctx.createGain();
    this._output = this._ctx.createGain();
    this._useWorklet = false;
    this._workletNode = null;

    // Measurement state
    this._momentary = -Infinity;  // 400ms window
    this._shortTerm = -Infinity;  // 3s window
    this._integrated = -Infinity; // full duration
    this._truePeak = -Infinity;
    this._range = 0;
    this._running = false;
    this._intervalId = null;

    // Pass-through
    this._input.connect(this._output);

    // Try AudioWorklet path
    if (VAA._workletsLoaded) {
      try {
        this._workletNode = new AudioWorkletNode(this._ctx, 'lufs-processor');
        this._input.connect(this._workletNode);
        // Worklet output is not audible — it's for measurement only
        var self = this;
        this._workletNode.port.onmessage = function(e) {
          if (e.data) {
            if (e.data.momentary !== undefined) self._momentary = e.data.momentary;
            if (e.data.shortTerm !== undefined) self._shortTerm = e.data.shortTerm;
          }
        };
        this._useWorklet = true;
      } catch (e) {
        console.warn('[VAA.LUFSMeter] Worklet VAA.init failed, using fallback:', e);
        this._useWorklet = false;
      }
    }

    // Fallback: K-weighting filters + AnalyserNode + polling
    if (!this._useWorklet) {
      // K-weighting pre-filters (2 stages)
      this._kFilter1 = this._ctx.createBiquadFilter();
      this._kFilter1.type = 'highshelf';
      this._kFilter1.frequency.value = 1500;
      this._kFilter1.gain.value = 4;

      this._kFilter2 = this._ctx.createBiquadFilter();
      this._kFilter2.type = 'highpass';
      this._kFilter2.frequency.value = 38;
      this._kFilter2.Q.value = 0.5;

      this._analyser = this._ctx.createAnalyser();
      this._analyser.fftSize = 2048;
      this._analyser.smoothingTimeConstant = 0;
      this._timeData = new Float32Array(2048);

      this._input.connect(this._kFilter1);
      this._kFilter1.connect(this._kFilter2);
      this._kFilter2.connect(this._analyser);

      // Gated measurement accumulator
      this._blocks = [];
      this._maxBlocks = 1000;
    }
  };

  VAA.LUFSMeter.prototype = {
    getInput: function() { return this._input; },
    getOutput: function() { return this._output; },

    start: function() {
      if (this._running) return;
      this._running = true;
      // Worklet runs automatically — no polling needed
      if (this._useWorklet) return;
      this._blocks = [];
      var self = this;
      // Measure every 100ms
      this._intervalId = setInterval(function() {
        self._measure();
      }, 100);
    },

    stop: function() {
      this._running = false;
      if (this._intervalId) {
        clearInterval(this._intervalId);
        this._intervalId = null;
      }
    },

    _measure: function() {
      if (this._useWorklet) return; // worklet handles this
      this._analyser.getFloatTimeDomainData(this._timeData);

      // Calculate mean square
      var sum = 0;
      var peak = 0;
      for (var i = 0; i < this._timeData.length; i++) {
        var s = this._timeData[i];
        sum += s * s;
        var abs = Math.abs(s);
        if (abs > peak) peak = abs;
      }
      var meanSquare = sum / this._timeData.length;

      // True peak (simplified — for proper 4x oversampling, use AudioWorklet)
      var truePeakLin = peak;
      var truePeakDb = 20 * Math.log10(Math.max(truePeakLin, 1e-10));
      if (truePeakDb > this._truePeak) this._truePeak = truePeakDb;

      // Momentary LUFS (400ms ≈ 4 blocks)
      var power = meanSquare > 0 ? meanSquare : 1e-20;
      this._blocks.push({ power: power, time: Date.now() });

      // Trim old blocks
      if (this._blocks.length > this._maxBlocks) {
        this._blocks = this._blocks.slice(-this._maxBlocks);
      }

      // Momentary (last 400ms ≈ last 4 readings at 100ms interval)
      this._momentary = this._calcLUFS(this._blocks.slice(-4));

      // Short-term (last 3s ≈ last 30 readings)
      this._shortTerm = this._calcLUFS(this._blocks.slice(-30));

      // Integrated (all blocks, with absolute gating at -70 LUFS)
      this._integrated = this._calcIntegratedLUFS();
    },

    _calcLUFS: function(blocks) {
      if (!blocks.length) return -Infinity;
      var sum = 0;
      for (var i = 0; i < blocks.length; i++) sum += blocks[i].power;
      var avgPower = sum / blocks.length;
      return -0.691 + 10 * Math.log10(Math.max(avgPower, 1e-20));
    },

    _calcIntegratedLUFS: function() {
      if (!this._blocks.length) return -Infinity;

      // Step 1: Absolute gate at -70 LUFS
      var absThreshold = -70;
      var gatedBlocks = [];
      for (var i = 0; i < this._blocks.length; i++) {
        var blockLUFS = -0.691 + 10 * Math.log10(Math.max(this._blocks[i].power, 1e-20));
        if (blockLUFS > absThreshold) gatedBlocks.push(this._blocks[i]);
      }

      if (!gatedBlocks.length) return -Infinity;

      // Step 2: Relative gate at -10 LU below ungated average
      var ungatedLUFS = this._calcLUFS(gatedBlocks);
      var relThreshold = ungatedLUFS - 10;

      var finalBlocks = [];
      for (var j = 0; j < gatedBlocks.length; j++) {
        var bLUFS = -0.691 + 10 * Math.log10(Math.max(gatedBlocks[j].power, 1e-20));
        if (bLUFS > relThreshold) finalBlocks.push(gatedBlocks[j]);
      }

      return this._calcLUFS(finalBlocks);
    },

    getMomentary: function() { return this._momentary; },
    getShortTerm: function() { return this._shortTerm; },
    getIntegrated: function() { return this._integrated; },
    getTruePeak: function() { return this._truePeak; },

    getAll: function() {
      return {
        momentary: this._momentary,
        shortTerm: this._shortTerm,
        integrated: this._integrated,
        truePeak: this._truePeak
      };
    },

    /**
     * Calculate gain to hit target LUFS
     * @param {number} targetLUFS — e.g. -14 for streaming
     * @returns {number} gain in dB
     */
    calcNormalizeGain: function(targetLUFS) {
      if (this._integrated === -Infinity) return 0;
      return targetLUFS - this._integrated;
    },

    reset: function() {
      this._blocks = [];
      this._momentary = -Infinity;
      this._shortTerm = -Infinity;
      this._integrated = -Infinity;
      this._truePeak = -Infinity;
    },

    dispose: function() {
      this.stop();
      try {
        this._input.disconnect();
        this._output.disconnect();
        if (this._useWorklet && this._workletNode) {
          this._workletNode.port.onmessage = null;
          this._workletNode.disconnect();
        }
        if (this._kFilter1) this._kFilter1.disconnect();
        if (this._kFilter2) this._kFilter2.disconnect();
        if (this._analyser) this._analyser.disconnect();
      } catch (e) {}
    }
  };

  VAA.normalizeToLUFS = function (buffer, targetLUFS) {
    targetLUFS = targetLUFS || -14;
    var channels = buffer.numberOfChannels;
    var length = buffer.length;

    // Measure current LUFS (simplified — K-weighted RMS)
    var sum = 0;
    for (var ch = 0; ch < channels; ch++) {
      var data = buffer.getChannelData(ch);
      for (var i = 0; i < length; i++) {
        sum += data[i] * data[i];
      }
    }
    var meanSquare = sum / (length * channels);
    var currentLUFS = -0.691 + 10 * Math.log10(Math.max(meanSquare, 1e-20));

    if (currentLUFS === -Infinity) return buffer; // silence

    var gainDB = targetLUFS - currentLUFS;
    var gainLinear = Math.pow(10, gainDB / 20);

    // Limit gain to prevent clipping
    gainLinear = Math.min(gainLinear, 10); // max +20dB

    // Apply gain
    var ctx = VAA._getCtx();
    var newBuffer = ctx.createBuffer(channels, length, buffer.sampleRate);
    for (var c = 0; c < channels; c++) {
      var src = buffer.getChannelData(c);
      var dst = newBuffer.getChannelData(c);
      for (var j = 0; j < length; j++) {
        dst[j] = Math.max(-1, Math.min(1, src[j] * gainLinear));
      }
    }

    return newBuffer;
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'metering', parent: 'video.ve-audio-advanced', title: 've-audio-advanced: metering', mount: function () {}, unmount: function () {} });
  }
})();
