// ═══════════════════════════════════════════════════════════════════
//  VESharedMemory — SharedArrayBuffer support for zero-copy Worker I/O
//  dika studio Video Editor — MirexSoft
//  Requires COOP/COEP headers; fallback to postMessage + Transferable
// ═══════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  // ─── Constants ─────────────────────────────────────────────
  var SAB_HEADER_BYTES = 64;   // 16 Int32 slots for metadata/sync
  var SLOT_LOCK   = 0;  // Atomics lock (0 = free, 1 = locked)
  var SLOT_READY  = 1;  // frame data written flag (0 = empty, 1 = ready)
  var SLOT_WIDTH  = 2;
  var SLOT_HEIGHT = 3;
  var SLOT_LENGTH = 4;  // pixel data byte length
  var SLOT_SEQ    = 5;  // sequence number for freshness check

  // ─── Capability Detection ──────────────────────────────────

  var _sabSupported = (function() {
    try {
      if (typeof SharedArrayBuffer === 'undefined') return false;
      // Test actual creation (some browsers disable via headers)
      var test = new SharedArrayBuffer(1);
      return test.byteLength === 1;
    } catch (e) {
      return false;
    }
  })();

  var _coopCoepOk = (function() {
    try {
      return self.crossOriginIsolated === true;
    } catch (e) {
      return false;
    }
  })();

  /**
   * SharedFrameBuffer — double-buffered shared memory for frame data
   * Workers write pixel data directly; main thread reads without copy
   *
   * Memory layout:
   *  [0..63]  Header: 16 x Int32 (lock, ready, width, height, length, seq, ...)
   *  [64.. ]  Pixel data: RGBA Uint8ClampedArray
   */
  function SharedFrameBuffer(width, height) {
    this.width = width;
    this.height = height;
    this.pixelBytes = width * height * 4;
    this.totalBytes = SAB_HEADER_BYTES + this.pixelBytes;
    this.seq = 0;

    if (_sabSupported) {
      this.sab = new SharedArrayBuffer(this.totalBytes);
      this.header = new Int32Array(this.sab, 0, SAB_HEADER_BYTES / 4);
      this.pixels = new Uint8ClampedArray(this.sab, SAB_HEADER_BYTES, this.pixelBytes);
      this.header[SLOT_WIDTH] = width;
      this.header[SLOT_HEIGHT] = height;
      this.header[SLOT_LENGTH] = this.pixelBytes;
      this.mode = 'shared';
    } else {
      // Fallback: plain ArrayBuffer (must be transferred)
      this.sab = null;
      this.header = null;
      this.pixels = new Uint8ClampedArray(this.pixelBytes);
      this.mode = 'transfer';
    }
  }

  /**
   * Write pixel data into the shared buffer (Worker side)
   * @param {Uint8ClampedArray} data — RGBA pixel data
   */
  SharedFrameBuffer.prototype.write = function(data) {
    if (this.mode === 'shared') {
      // Acquire spinlock
      while (Atomics.compareExchange(this.header, SLOT_LOCK, 0, 1) !== 0) {
        // Spin — should be very brief since pixel copy is fast
      }
      // Copy pixels into shared buffer
      this.pixels.set(data.length <= this.pixelBytes ? data : data.subarray(0, this.pixelBytes));
      this.seq++;
      Atomics.store(this.header, SLOT_SEQ, this.seq);
      Atomics.store(this.header, SLOT_READY, 1);
      // Release lock
      Atomics.store(this.header, SLOT_LOCK, 0);
    } else {
      // Fallback: copy to internal buffer
      this.pixels.set(data.length <= this.pixelBytes ? data : data.subarray(0, this.pixelBytes));
      this.seq++;
    }
  };

  /**
   * Read pixel data from shared buffer (main thread side)
   * @returns {Uint8ClampedArray|null} — pixel data or null if not ready
   */
  SharedFrameBuffer.prototype.read = function() {
    if (this.mode === 'shared') {
      var ready = Atomics.load(this.header, SLOT_READY);
      if (!ready) return null;

      // Acquire lock
      while (Atomics.compareExchange(this.header, SLOT_LOCK, 0, 1) !== 0) {
        // Spin
      }
      // Read into local copy (or reference directly if safe)
      var result = new Uint8ClampedArray(this.pixelBytes);
      result.set(this.pixels);
      // Mark consumed
      Atomics.store(this.header, SLOT_READY, 0);
      Atomics.store(this.header, SLOT_LOCK, 0);
      return result;
    } else {
      return this.pixels;
    }
  };

  /**
   * Read directly without copy (zero-copy, reader must not hold reference)
   * Only valid in 'shared' mode. Caller must not modify the returned view.
   * @returns {Uint8ClampedArray|null}
   */
  SharedFrameBuffer.prototype.readDirect = function() {
    if (this.mode !== 'shared') return this.pixels;
    var ready = Atomics.load(this.header, SLOT_READY);
    if (!ready) return null;
    return this.pixels;
  };

  /**
   * Get the underlying SAB for passing to a Worker
   * @returns {SharedArrayBuffer|null}
   */
  SharedFrameBuffer.prototype.getBuffer = function() {
    return this.sab;
  };

  /**
   * Resize the buffer (re-allocates if needed)
   * @param {number} newW
   * @param {number} newH
   */
  SharedFrameBuffer.prototype.resize = function(newW, newH) {
    if (newW === this.width && newH === this.height) return;
    this.width = newW;
    this.height = newH;
    this.pixelBytes = newW * newH * 4;
    this.totalBytes = SAB_HEADER_BYTES + this.pixelBytes;

    if (_sabSupported) {
      this.sab = new SharedArrayBuffer(this.totalBytes);
      this.header = new Int32Array(this.sab, 0, SAB_HEADER_BYTES / 4);
      this.pixels = new Uint8ClampedArray(this.sab, SAB_HEADER_BYTES, this.pixelBytes);
      this.header[SLOT_WIDTH] = newW;
      this.header[SLOT_HEIGHT] = newH;
      this.header[SLOT_LENGTH] = this.pixelBytes;
    } else {
      this.pixels = new Uint8ClampedArray(this.pixelBytes);
    }
  };

  SharedFrameBuffer.prototype.dispose = function() {
    this.sab = null;
    this.header = null;
    this.pixels = null;
  };

  // ─── SharedWorkerBridge ────────────────────────────────────
  /**
   * Wraps a Worker with SharedArrayBuffer communication
   * Falls back to postMessage + Transferable when SAB unavailable
   */
  function SharedWorkerBridge(worker) {
    this.worker = worker;
    this._frameBuffers = {};  // name → SharedFrameBuffer
    this._callbacks = {};
    this._nextId = 0;

    var self = this;
    worker.addEventListener('message', function(e) {
      var msg = e.data;
      if (msg && msg._swbId !== undefined && self._callbacks[msg._swbId]) {
        var cb = self._callbacks[msg._swbId];
        delete self._callbacks[msg._swbId];
        cb(msg);
      }
    });
  }

  /**
   * Create or get a named SharedFrameBuffer and send it to the worker
   * @param {string} name — buffer name (e.g. 'input', 'output')
   * @param {number} w — width
   * @param {number} h — height
   * @returns {SharedFrameBuffer}
   */
  SharedWorkerBridge.prototype.createBuffer = function(name, w, h) {
    var existing = this._frameBuffers[name];
    if (existing && existing.width === w && existing.height === h) return existing;

    var buf = new SharedFrameBuffer(w, h);
    this._frameBuffers[name] = buf;

    // Notify worker about the shared buffer
    if (buf.mode === 'shared') {
      this.worker.postMessage({
        _swbType: 'shared-buffer',
        name: name,
        buffer: buf.sab,
        width: w,
        height: h,
        headerBytes: SAB_HEADER_BYTES
      });
    }

    return buf;
  };

  /**
   * Send pixel data to worker — zero-copy via SAB or Transferable fallback
   * @param {string} bufferName — target buffer name
   * @param {Uint8ClampedArray} data — pixel data
   * @param {Object} params — additional message params
   * @returns {Promise<Object>}
   */
  SharedWorkerBridge.prototype.sendFrame = function(bufferName, data, params) {
    var self = this;
    var buf = this._frameBuffers[bufferName];

    if (buf && buf.mode === 'shared') {
      // Zero-copy path: write directly to shared buffer
      buf.write(data);
      return new Promise(function(resolve) {
        var id = self._nextId++;
        self._callbacks[id] = resolve;
        self.worker.postMessage({
          _swbType: 'process-shared',
          _swbId: id,
          bufferName: bufferName,
          seq: buf.seq,
          params: params || {}
        });
      });
    } else {
      // Fallback: Transferable postMessage
      var copy = new Uint8ClampedArray(data);
      return new Promise(function(resolve) {
        var id = self._nextId++;
        self._callbacks[id] = resolve;
        self.worker.postMessage({
          _swbType: 'process-transfer',
          _swbId: id,
          data: copy,
          width: params ? params.width : 0,
          height: params ? params.height : 0,
          params: params || {}
        }, [copy.buffer]);
      });
    }
  };

  /**
   * Receive result frame from worker
   * In SAB mode: reads from an output shared buffer
   * In transfer mode: result comes via postMessage
   * @param {string} bufferName
   * @returns {Uint8ClampedArray|null}
   */
  SharedWorkerBridge.prototype.readResult = function(bufferName) {
    var buf = this._frameBuffers[bufferName];
    if (!buf) return null;
    return buf.read();
  };

  SharedWorkerBridge.prototype.getBuffer = function(name) {
    return this._frameBuffers[name] || null;
  };

  SharedWorkerBridge.prototype.dispose = function() {
    var names = Object.keys(this._frameBuffers);
    for (var i = 0; i < names.length; i++) {
      this._frameBuffers[names[i]].dispose();
    }
    this._frameBuffers = {};
    this._callbacks = {};
  };

  // ─── Worker-side helper (to be called inside Worker code) ──
  var _workerHelperCode = function() {
    var _sharedBuffers = {};

    self._swbOnMessage = function(e) {
      var msg = e.data;
      if (!msg || !msg._swbType) return false;

      if (msg._swbType === 'shared-buffer') {
        _sharedBuffers[msg.name] = {
          sab: msg.buffer,
          header: new Int32Array(msg.buffer, 0, msg.headerBytes / 4),
          pixels: new Uint8ClampedArray(msg.buffer, msg.headerBytes),
          width: msg.width,
          height: msg.height
        };
        return true;
      }

      if (msg._swbType === 'process-shared') {
        var buf = _sharedBuffers[msg.bufferName];
        if (buf) {
          // Read from shared buffer — data is already there
          var pixelData = buf.pixels;
          // Call user-defined processor
          if (self._swbProcess) {
            self._swbProcess(pixelData, buf.width, buf.height, msg.params, function(result) {
              // Write result back to output buffer if exists
              var outBuf = _sharedBuffers['output'];
              if (outBuf && result) {
                outBuf.pixels.set(result);
                Atomics.store(outBuf.header, 1, 1); // SLOT_READY
              }
              self.postMessage({ _swbId: msg._swbId, done: true });
            });
          }
        }
        return true;
      }

      if (msg._swbType === 'process-transfer') {
        if (self._swbProcess) {
          self._swbProcess(msg.data, msg.width, msg.height, msg.params, function(result) {
            var transfer = result ? [result.buffer] : [];
            self.postMessage({ _swbId: msg._swbId, data: result, done: true }, transfer);
          });
        }
        return true;
      }

      return false;
    };

    // Helper to get shared buffer reference
    self._swbGetBuffer = function(name) {
      return _sharedBuffers[name] || null;
    };
  };

  // ─── Public API ────────────────────────────────────────────

  window.VESharedMemory = {
    isSupported: _sabSupported,
    isCrossOriginIsolated: _coopCoepOk,

    /**
     * Check headers and log diagnostic info
     */
    diagnose: function() {
      var info = {
        sabSupported: _sabSupported,
        crossOriginIsolated: _coopCoepOk,
        mode: _sabSupported ? 'shared' : 'transfer',
        atomicsSupported: typeof Atomics !== 'undefined'
      };
      console.log('[VESharedMemory] Diagnostics:', info);
      if (!_coopCoepOk) {
        console.warn('[VESharedMemory] COOP/COEP headers not set. ' +
          'To enable SharedArrayBuffer, serve with:\n' +
          '  Cross-Origin-Opener-Policy: same-origin\n' +
          '  Cross-Origin-Embedder-Policy: require-corp\n' +
          'See: https://web.dev/cross-origin-isolation-guide/');
      }
      return info;
    },

    /**
     * Create a SharedFrameBuffer
     * @param {number} width
     * @param {number} height
     * @returns {SharedFrameBuffer}
     */
    createFrameBuffer: function(width, height) {
      return new SharedFrameBuffer(width, height);
    },

    /**
     * Create a SharedWorkerBridge wrapping an existing Worker
     * @param {Worker} worker
     * @returns {SharedWorkerBridge}
     */
    createBridge: function(worker) {
      return new SharedWorkerBridge(worker);
    },

    /**
     * Get the worker-side helper code as a string
     * Include this in your Worker's code via string concatenation
     * @returns {string}
     */
    getWorkerHelperCode: function() {
      return '(' + _workerHelperCode.toString() + ')();';
    },

    /**
     * Allocate a raw SharedArrayBuffer (utility)
     * Falls back to ArrayBuffer when SAB is unavailable
     * @param {number} byteLength
     * @returns {SharedArrayBuffer|ArrayBuffer}
     */
    allocate: function(byteLength) {
      if (_sabSupported) {
        return new SharedArrayBuffer(byteLength);
      }
      return new ArrayBuffer(byteLength);
    },

    SharedFrameBuffer: SharedFrameBuffer,
    SharedWorkerBridge: SharedWorkerBridge
  };

})();

// Modular skeleton hook (Faz 8) — ve-shared-memory is now a video loader module (modules/video/). Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-shared-memory', parent: 'video', title: 've-shared-memory', mount: function () {}, unmount: function () {} });
