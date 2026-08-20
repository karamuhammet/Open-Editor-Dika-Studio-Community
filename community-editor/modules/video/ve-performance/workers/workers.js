/* Module: video/ve-performance/workers — Katman 2 — worker pool + the filter worker code.
   Part of the ve-performance group (decomposed from the 1654-line IIFE). Functions hang off the
   shared namespace VEP (window.__ccVEPerformance, created by the parent); cross-module refs resolve
   through VEP at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VEP = window.__ccVEPerformance;
  if (!VEP) return;

  VEP.WorkerPool = {
    _workers: [],
    _queue: [],
    _busy: [],
    _maxWorkers: 4,
    _maxQueue: 64,
    _taskTimeoutMs: 30000,
    _initialized: false,
    _workerURL: null,
    _bridges: [],  // SharedWorkerBridge per worker (when SAB available)
    _useSAB: false,

    init: function(maxWorkers) {
      if (this._initialized) return;
      if (typeof Worker === 'undefined') return;

      this._maxWorkers = maxWorkers || Math.min(4, (navigator.hardwareConcurrency || 2));
      this._useSAB = window.VESharedMemory && VESharedMemory.isSupported;

      // Build worker code (include SAB helper if available)
      var sabHelper = this._useSAB && VESharedMemory.getWorkerHelperCode ? VESharedMemory.getWorkerHelperCode() : '';
      var code = sabHelper + '(' + VEP._filterWorkerCode.toString() + ')()';
      this._workerURL = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));

      for (var i = 0; i < this._maxWorkers; i++) {
        try {
          var w = new Worker(this._workerURL);
          this._workers.push(w);
          this._busy.push(false);
          // Create SAB bridge if supported
          if (this._useSAB) {
            this._bridges.push(VESharedMemory.createBridge(w));
          } else {
            this._bridges.push(null);
          }
        } catch (e) {
          console.warn('[VEPerformance] Worker creation failed:', e);
          break;
        }
      }

      this._initialized = this._workers.length > 0;
      if (this._useSAB) {
        console.log('[VEPerformance] SharedArrayBuffer mode enabled, ' + this._workers.length + ' workers');
      }
    },

    /**
     * Submit a pixel processing task
     * @param {Object} task — {type, data, width, height, params}
     * @returns {Promise<ImageData>}
     */
    submit: function(task, options) {
      var self = this;
      if (!self._initialized) return Promise.reject(new Error('VEP.WorkerPool not initialized'));
      options = options || {};
      if (!task || !task.type) return Promise.reject(new Error('Invalid worker task'));
      if (options.signal && options.signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));

      return new Promise(function(resolve, reject) {
        var workerIdx = self._findFreeWorker();
        if (workerIdx === -1) {
          if (self._queue.length >= self._maxQueue) {
            reject(new Error('VEP.WorkerPool queue limit reached'));
            return;
          }
          var queued = { task: task, resolve: resolve, reject: reject, signal: options.signal || null, onAbort: null };
          if (queued.signal) {
            queued.onAbort = function() {
              var at = self._queue.indexOf(queued);
              if (at !== -1) self._queue.splice(at, 1);
              reject(new DOMException('Aborted', 'AbortError'));
            };
            queued.signal.addEventListener('abort', queued.onAbort, { once: true });
          }
          self._queue.push(queued);
          return;
        }

        self._dispatch(workerIdx, task, resolve, reject, options.signal || null);
      });
    },

    _findFreeWorker: function() {
      for (var i = 0; i < this._busy.length; i++) {
        if (!this._busy[i]) return i;
      }
      return -1;
    },

    _dispatch: function(idx, task, resolve, reject, signal) {
      var self = this;
      self._busy[idx] = true;
      var worker = self._workers[idx];
      var settled = false;
      var timer = setTimeout(function() {
        finish(false, new Error('VEP.WorkerPool task timed out'), true);
      }, self._taskTimeoutMs);
      var onAbort = signal ? function() {
        finish(false, new DOMException('Aborted', 'AbortError'), true);
      } : null;
      if (signal && onAbort) signal.addEventListener('abort', onAbort, { once: true });

      function finish(ok, value, replaceWorker) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (signal && onAbort) signal.removeEventListener('abort', onAbort);
        if (replaceWorker) self._replaceWorker(idx);
        self._busy[idx] = false;
        if (ok) resolve(value); else reject(value);
        self._pumpNext(idx);
      }

      worker.onmessage = function(e) {
        finish(true, e.data, false);
      };

      worker.onerror = function(e) {
        finish(false, e, true);
      };

      // Transfer the pixel data buffer
      var transferList = [];
      if (task.data && task.data.buffer) {
        transferList.push(task.data.buffer);
      }

      try { worker.postMessage(task, transferList); }
      catch (e) { finish(false, e, true); }
    },

    _replaceWorker: function(idx) {
      try { if (this._bridges[idx]) this._bridges[idx].dispose(); } catch (e) {}
      try { this._workers[idx].terminate(); } catch (e) {}
      if (!this._initialized) return;
      try {
        var worker = new Worker(this._workerURL);
        this._workers[idx] = worker;
        this._bridges[idx] = this._useSAB ? VESharedMemory.createBridge(worker) : null;
      } catch (e) {
        console.warn('[VEPerformance] Worker restart failed:', e);
      }
    },

    _pumpNext: function(idx) {
      while (this._queue.length > 0) {
        var next = this._queue.shift();
        if (next.signal && next.onAbort) next.signal.removeEventListener('abort', next.onAbort);
        if (next.signal && next.signal.aborted) continue;
        this._dispatch(idx, next.task, next.resolve, next.reject, next.signal);
        return;
      }
    },

    _runSharedFrame: function(idx, bridge, imageData, chromaSettings, gradingSettings) {
      var self = this;
      self._busy[idx] = true;
      return new Promise(function(resolve, reject) {
        var settled = false;
        var timer = setTimeout(function() {
          if (settled) return;
          settled = true;
          self._replaceWorker(idx);
          self._busy[idx] = false;
          reject(new Error('VEP.WorkerPool shared task timed out'));
          self._pumpNext(idx);
        }, self._taskTimeoutMs);
        function finish(ok, value) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          self._busy[idx] = false;
          if (ok) resolve(value); else reject(value);
          self._pumpNext(idx);
        }
        bridge.createBuffer('input', imageData.width, imageData.height);
        bridge.createBuffer('output', imageData.width, imageData.height);
        bridge.sendFrame('input', imageData.data, {
          width: imageData.width,
          height: imageData.height,
          chroma: chromaSettings || null,
          grading: gradingSettings || null
        }).then(function(result) {
          var outBuf = bridge.getBuffer('output');
          if (outBuf) {
            var pixels = outBuf.read();
            if (pixels) return new ImageData(new Uint8ClampedArray(pixels), imageData.width, imageData.height);
          }
          if (result && result.data) return new ImageData(new Uint8ClampedArray(result.data), imageData.width, imageData.height);
          return null;
        }).then(function(value) { finish(true, value); }).catch(function(error) { finish(false, error); });
      });
    },

    /**
     * Process ImageData through chroma+grade in a worker
     */
    processPixels: function(imageData, chromaSettings, gradingSettings) {
      if (!this._initialized) {
        // Fallback: use VEP.SinglePassProcessor on main thread
        return Promise.resolve(null);
      }

      // SharedArrayBuffer path: zero-copy via shared buffer
      if (this._useSAB) {
        var workerIdx = this._findFreeWorker();
        if (workerIdx === -1) {
          // All workers busy, queue as normal
        } else {
          var bridge = this._bridges[workerIdx];
          if (bridge) {
            return this._runSharedFrame(workerIdx, bridge, imageData, chromaSettings, gradingSettings);
          }
        }
      }

      var task = {
        type: 'single-pass',
        data: new Uint8ClampedArray(imageData.data), // copy for transfer
        width: imageData.width,
        height: imageData.height,
        chroma: chromaSettings || null,
        grading: gradingSettings || null
      };

      return this.submit(task).then(function(result) {
        if (result && result.data) {
          return new ImageData(new Uint8ClampedArray(result.data), result.width, result.height);
        }
        return null;
      });
    },

    destroy: function() {
      while (this._queue.length) {
        var queued = this._queue.shift();
        if (queued.signal && queued.onAbort) queued.signal.removeEventListener('abort', queued.onAbort);
        queued.reject(new DOMException('Worker pool destroyed', 'AbortError'));
      }
      // Dispose SAB bridges
      for (var bi = 0; bi < this._bridges.length; bi++) {
        if (this._bridges[bi]) this._bridges[bi].dispose();
      }
      this._bridges = [];
      for (var i = 0; i < this._workers.length; i++) {
        this._workers[i].terminate();
      }
      this._workers = [];
      this._busy = [];
      this._initialized = false;
      if (this._workerURL) {
        URL.revokeObjectURL(this._workerURL);
        this._workerURL = null;
      }
    },

    getStats: function() {
      var busy = 0;
      for (var i = 0; i < this._busy.length; i++) if (this._busy[i]) busy++;
      return {
        totalWorkers: this._workers.length,
        busyWorkers: busy,
        queueLength: this._queue.length
      };
    }
  };

  VEP._filterWorkerCode = function () {
    self.onmessage = function(e) {
      var msg = e.data;

      if (msg.type === 'single-pass') {
        var data = msg.data;
        var w = msg.width;
        var h = msg.height;
        var chroma = msg.chroma;
        var grading = msg.grading;
        var pixelCount = w * h;

        // Chroma key params
        var hasChroma = chroma && chroma.enabled;
        var ckCb, ckCr, ckTol, ckSmooth, ckSpill;
        if (hasChroma) {
          var kc = chroma.keyColor || { r: 0, g: 255, b: 0 };
          ckCb = 128 - 0.168736 * kc.r - 0.331264 * kc.g + 0.5 * kc.b;
          ckCr = 128 + 0.5 * kc.r - 0.418688 * kc.g - 0.081312 * kc.b;
          ckTol = (chroma.tolerance || 40) / 100;
          ckSmooth = (chroma.smoothness || 10) / 100;
          ckSpill = (chroma.spillSuppression || 50) / 100;
        }

        // Grading LUTs (pre-built, passed from main thread)
        var hasGrading = grading && grading.enabled;
        var lutR = grading ? grading.lutR : null;
        var lutG = grading ? grading.lutG : null;
        var lutB = grading ? grading.lutB : null;

        // Process pixels
        for (var i = 0; i < pixelCount; i++) {
          var off = i << 2;
          var r = data[off], g = data[off+1], b = data[off+2], a = data[off+3];

          if (hasChroma && a > 0) {
            var pCb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
            var pCr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
            var dCb = pCb - ckCb;
            var dCr = pCr - ckCr;
            var dist = Math.sqrt(dCb * dCb + dCr * dCr) / 181.02;

            if (dist < ckTol) {
              a = 0;
            } else if (dist < ckTol + ckSmooth) {
              a = Math.round(((dist - ckTol) / ckSmooth) * 255);
            }

            if (a > 0 && ckSpill > 0) {
              var spillAmt = g - Math.max(r, b);
              if (spillAmt > 0) g = Math.round(g - spillAmt * ckSpill);
            }
          }

          if (hasGrading && a > 0 && lutR) {
            r = lutR[r]; g = lutG[g]; b = lutB[b];
          }

          data[off] = r; data[off+1] = g; data[off+2] = b; data[off+3] = a;
        }

        self.postMessage({ data: data, width: w, height: h }, [data.buffer]);
      }
    };
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'workers', parent: 'video.ve-performance', title: 've-performance: workers', mount: function () {}, unmount: function () {} });
  }
})();
