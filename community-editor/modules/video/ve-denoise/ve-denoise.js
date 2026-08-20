// ═══════════════════════════════════════════════════════════════════
//  VEDenoise — RNNoise-based Audio Noise Reduction
//  dika studio Video Editor — MirexSoft
//  Lazy-loads RNNoise WASM, runs via AudioWorklet
//  Fallback: simple spectral gate when WASM unavailable
// ═══════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  /* COMMUNITY EDITION, and this is a FINDING about upstream, not a port decision:
     the URL this module has always used is
       https://cdn.jsdelivr.net/npm/rnnoise-wasm@1.0.0/dist/rnnoise.wasm
     and `rnnoise-wasm@1.0.0` DOES NOT EXIST on npm. The only published version is
     `0.0.1-security`, a security placeholder with no files, so that request has been a 404 in the
     cloud editor too and denoise has always run on the spectral-gate fallback below. Nothing was
     broken by this fork; it was measured while vendoring.

     So: NULL, meaning "no WASM available, use the fallback", instead of a fetch that can only fail.
     `setWasmUrl(url)` is still exported, so a packager who has a real rnnoise build can point at a
     vendored copy and the WASM path lights up unchanged. */
  var RNNOISE_WASM_URL = null;
  var WORKLET_PATH = 'js/worklets/rnnoise-processor.js';

  var _wasmBytes = null;
  var _wasmLoading = false;
  var _workletRegistered = false;
  var _instances = {}; // clipId → DenoiseInstance

  // ─── WASM Loader ───────────────────────────────────────────

  function _loadWasm() {
    if (_wasmBytes) return Promise.resolve(_wasmBytes);
    if (_wasmLoading) {
      return new Promise(function(resolve) {
        var poll = setInterval(function() {
          if (_wasmBytes) { clearInterval(poll); resolve(_wasmBytes); }
        }, 100);
      });
    }
    if (!RNNOISE_WASM_URL) return Promise.resolve(null);   // fallback gate, deliberately (see above)
    _wasmLoading = true;
    return fetch(RNNOISE_WASM_URL)
      .then(function(resp) {
        if (!resp.ok) throw new Error('Failed to fetch RNNoise WASM: ' + resp.status);
        return resp.arrayBuffer();
      })
      .then(function(buf) {
        _wasmBytes = buf;
        _wasmLoading = false;
        console.log('[VEDenoise] RNNoise WASM loaded (' + Math.round(buf.byteLength / 1024) + ' KB)');
        return buf;
      })
      .catch(function(err) {
        _wasmLoading = false;
        console.warn('[VEDenoise] WASM load failed, will use fallback gate:', err.message);
        return null;
      });
  }

  function _registerWorklet(ctx) {
    if (_workletRegistered) return Promise.resolve();
    if (!ctx.audioWorklet || !ctx.audioWorklet.addModule) {
      return Promise.reject(new Error('AudioWorklet API not available'));
    }
    return ctx.audioWorklet.addModule(WORKLET_PATH).then(function() {
      _workletRegistered = true;
    });
  }

  // ─── DenoiseInstance ───────────────────────────────────────

  /**
   * Creates a denoise processor for a single clip
   * @param {AudioContext} ctx
   * @param {Object} opts — {mix, enabled, onVAD}
   */
  function DenoiseInstance(ctx, opts) {
    opts = opts || {};
    this._ctx = ctx;
    this._input = ctx.createGain();
    this._output = ctx.createGain();
    this._useWorklet = false;
    this._workletNode = null;
    this._mix = opts.mix != null ? opts.mix : 1.0;
    this._enabled = opts.enabled !== false;
    this._vadProb = 0;
    this._onVAD = opts.onVAD || null;
    this._disposed = false;

    // Direct passthrough initially
    this._input.connect(this._output);
  }

  DenoiseInstance.prototype = {
    getInput: function() { return this._input; },
    getOutput: function() { return this._output; },

    /**
     * Initialize the worklet node (async)
     * @returns {Promise}
     */
    init: function() {
      var self = this;
      return _registerWorklet(this._ctx).then(function() {
        if (self._disposed) return;
        // Create worklet node
        self._workletNode = new AudioWorkletNode(self._ctx, 'rnnoise-processor', {
          parameterData: {
            mix: self._mix,
            enabled: self._enabled ? 1 : 0
          }
        });

        // Wire: input → worklet → output (replace direct passthrough)
        self._input.disconnect();
        self._input.connect(self._workletNode);
        self._workletNode.connect(self._output);
        self._useWorklet = true;

        // Handle messages from worklet
        self._workletNode.port.onmessage = function(e) {
          if (e.data.type === 'request-wasm') {
            // Send WASM bytes to worklet
            if (_wasmBytes) {
              self._workletNode.port.postMessage({
                type: 'wasm-module',
                module: _wasmBytes
              });
            } else {
              _loadWasm().then(function(bytes) {
                if (bytes && self._workletNode) {
                  self._workletNode.port.postMessage({
                    type: 'wasm-module',
                    module: bytes
                  });
                }
              });
            }
          } else if (e.data.type === 'vad') {
            self._vadProb = e.data.probability || 0;
            if (self._onVAD) self._onVAD(self._vadProb);
          }
        };
      }).catch(function(err) {
        console.warn('[VEDenoise] Worklet init failed:', err.message);
        // Fallback: simple gain-based gate on main thread
        self._initFallback();
      });
    },

    _initFallback: function() {
      // Simple noise gate fallback using AnalyserNode
      this._analyser = this._ctx.createAnalyser();
      this._analyser.fftSize = 256;
      this._gateGain = this._ctx.createGain();

      this._input.disconnect();
      this._input.connect(this._analyser);
      this._input.connect(this._gateGain);
      this._gateGain.connect(this._output);

      this._analyserData = new Float32Array(128);
      var self = this;
      this._rafId = requestAnimationFrame(function tick() {
        if (self._disposed) return;
        if (!self._enabled) {
          self._gateGain.gain.value = 1;
        } else {
          self._analyser.getFloatFrequencyData(self._analyserData);
          var sum = 0;
          for (var i = 0; i < self._analyserData.length; i++) {
            var v = Math.pow(10, self._analyserData[i] / 20);
            sum += v * v;
          }
          var rms = Math.sqrt(sum / self._analyserData.length);
          var db = 20 * Math.log10(Math.max(rms, 1e-10));
          // Gate below -45 dB
          if (db < -45) {
            self._gateGain.gain.linearRampToValueAtTime(0.01, self._ctx.currentTime + 0.01);
          } else {
            self._gateGain.gain.linearRampToValueAtTime(1.0, self._ctx.currentTime + 0.005);
          }
        }
        self._rafId = requestAnimationFrame(tick);
      });
    },

    setMix: function(val) {
      this._mix = Math.max(0, Math.min(1, val));
      if (this._useWorklet && this._workletNode) {
        this._workletNode.parameters.get('mix').value = this._mix;
      }
    },

    getMix: function() { return this._mix; },

    setEnabled: function(val) {
      this._enabled = !!val;
      if (this._useWorklet && this._workletNode) {
        this._workletNode.parameters.get('enabled').value = val ? 1 : 0;
      }
    },

    isEnabled: function() { return this._enabled; },
    getVADProbability: function() { return this._vadProb; },

    toJSON: function() {
      return { mix: this._mix, enabled: this._enabled };
    },

    fromJSON: function(data) {
      if (!data) return;
      if (data.mix !== undefined) this.setMix(data.mix);
      if (data.enabled !== undefined) this.setEnabled(data.enabled);
    },

    dispose: function() {
      this._disposed = true;
      if (this._rafId) cancelAnimationFrame(this._rafId);
      try {
        this._input.disconnect();
        this._output.disconnect();
        if (this._workletNode) {
          this._workletNode.port.onmessage = null;
          this._workletNode.disconnect();
        }
        if (this._gateGain) this._gateGain.disconnect();
        if (this._analyser) this._analyser.disconnect();
      } catch (e) {}
    }
  };

  // ─── Clip Management ───────────────────────────────────────

  function createForClip(clipId, ctx, opts) {
    if (_instances[clipId]) {
      _instances[clipId].dispose();
    }
    var inst = new DenoiseInstance(ctx, opts);
    _instances[clipId] = inst;
    inst.init();
    return inst;
  }

  function getForClip(clipId) {
    return _instances[clipId] || null;
  }

  function disposeForClip(clipId) {
    if (_instances[clipId]) {
      _instances[clipId].dispose();
      delete _instances[clipId];
    }
  }

  function disposeAll() {
    for (var id in _instances) {
      _instances[id].dispose();
    }
    _instances = {};
  }

  // ─── Preload ───────────────────────────────────────────────

  function preload() {
    return _loadWasm();
  }

  // ─── Public API ────────────────────────────────────────────

  window.VEDenoise = {
    DenoiseInstance: DenoiseInstance,
    createForClip: createForClip,
    getForClip: getForClip,
    disposeForClip: disposeForClip,
    disposeAll: disposeAll,
    preload: preload,
    setWasmUrl: function(url) { RNNOISE_WASM_URL = url; }
  };

})();

// Modular skeleton hook (Faz 8) — ve-denoise is now a video loader module (modules/video/). Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-denoise', parent: 'video', title: 've-denoise', mount: function () {}, unmount: function () {} });
