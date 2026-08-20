/* Module: video/ve-media-pipeline/waveform — Audio waveform extraction / render / peaks + cache.
   Part of the ve-media-pipeline group (decomposed from the 1385-line IIFE). Functions hang off the
   shared namespace VMP (window.__ccVEMediaPipeline, created by the parent); cross-module refs resolve
   through VMP at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VMP = window.__ccVEMediaPipeline;
  if (!VMP) return;

  VMP._mpOpenWaveDB = function () {
    if (VMP._mpWaveDB) return Promise.resolve(VMP._mpWaveDB);
    return new Promise(function(resolve, reject) {
      var req = indexedDB.open(VMP._mpWaveDBName, 1);
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('waveforms')) {
          db.createObjectStore('waveforms', { keyPath: 'key' });
        }
      };
      req.onsuccess = function(e) { VMP._mpWaveDB = e.target.result; resolve(VMP._mpWaveDB); };
      req.onerror = function() { reject(new Error('Waveform DB failed')); };
    });
  };

  VMP.WaveformCache = {
    get: function(clipId) {
      return VMP._mpOpenWaveDB().then(function(db) {
        return new Promise(function(resolve) {
          var tx = db.transaction('waveforms', 'readonly');
          var req = tx.objectStore('waveforms').get(clipId);
          req.onsuccess = function() {
            resolve(req.result ? req.result : null);
          };
          req.onerror = function() { resolve(null); };
        });
      }).catch(function() { return null; });
    },

    put: function(clipId, peaksData, channels) {
      return VMP._mpOpenWaveDB().then(function(db) {
        return new Promise(function(resolve) {
          var tx = db.transaction('waveforms', 'readwrite');
          tx.objectStore('waveforms').put({
            key: clipId,
            peaks: peaksData,
            channels: channels || 1,
            ts: Date.now()
          });
          tx.oncomplete = function() { resolve(); };
          tx.onerror = function() { resolve(); };
        });
      }).catch(function() {});
    },

    invalidate: function(clipId) {
      return VMP._mpOpenWaveDB().then(function(db) {
        return new Promise(function(resolve) {
          var tx = db.transaction('waveforms', 'readwrite');
          tx.objectStore('waveforms').delete(clipId);
          tx.oncomplete = function() { resolve(); };
          tx.onerror = function() { resolve(); };
        });
      }).catch(function() {});
    },

    clear: function() {
      return VMP._mpOpenWaveDB().then(function(db) {
        return new Promise(function(resolve) {
          var tx = db.transaction('waveforms', 'readwrite');
          tx.objectStore('waveforms').clear();
          tx.oncomplete = function() { resolve(); };
          tx.onerror = function() { resolve(); };
        });
      }).catch(function() {});
    }
  };

  /* THE DECODE RATE IS THE WHOLE COST. Measured 2026-08-15 on the packaged Windows app with a real
     one hour file (tools/_ve-add-clip-probe.mjs): dropping an hour of video on the timeline froze the
     thread for 1.9 - 2.9 SECONDS in one block, and the profiler put 441 ms in the callback below.
     decodeAudioData decodes EVERY channel at the context's rate, so an hour of 48 kHz stereo is
     2 x 172.8 M floats = 1.38 GB allocated, walked, and then collected (350 ms of GC on its own).
     At 8 kHz the same hour is 230 MB and a sixth of the walk.
     Nothing visible is lost: the picture this produces is 400 px wide and 40 px tall, and the
     timeline draws at most a couple of hundred pixels per second of footage. What 48 kHz bought was
     detail below one pixel. */
  var WAVE_DECODE_HZ = 8000;

  VMP._mpExtractWaveform = function (url, opts) {
    opts = opts || {};
    var stereo = opts.stereo || false;

    return new Promise(function(resolve, reject) {
      var audioCtx;
      var Ctx = window.AudioContext || window.webkitAudioContext;
      try {
        /* A browser may refuse an unusual rate; falling back to its default keeps the waveform
           working rather than losing the feature to an optimisation. */
        try { audioCtx = new Ctx({ sampleRate: WAVE_DECODE_HZ }); }
        catch (rateErr) { audioCtx = new Ctx(); }
      } catch(e) {
        return reject(new Error('No AudioContext'));
      }
      /* PEAK RESOLUTION IS PINNED TO SECONDS, NOT TO SAMPLES. `samplesPerPixel: 128` meant 375 peaks
         per second at 48 kHz and would mean 62 at 8 kHz, which is a real loss at high zoom. Deriving
         it from the rate keeps ~250 peaks per second whatever the decode rate turns out to be, which
         is still more than the widest zoom can draw. */
      var samplesPerPixel = opts.samplesPerPixel ||
        Math.max(1, Math.round((audioCtx.sampleRate || WAVE_DECODE_HZ) / 250));

      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'arraybuffer';
      xhr.onload = function() {
        if (!xhr.response) { reject(new Error('Empty response')); return; }

        audioCtx.decodeAudioData(xhr.response, function(buffer) {
          var numChannels = stereo ? Math.min(buffer.numberOfChannels, 2) : 1;
          var allPeaks = [];

          for (var ch = 0; ch < numChannels; ch++) {
            var data = buffer.getChannelData(ch);
            var peaksCount = Math.ceil(data.length / samplesPerPixel);
            var peaks = new Float32Array(peaksCount * 2); // min + max per sample

            for (var i = 0; i < peaksCount; i++) {
              var start = i * samplesPerPixel;
              var end = Math.min(start + samplesPerPixel, data.length);
              var min = 0, max = 0;
              for (var j = start; j < end; j++) {
                if (data[j] < min) min = data[j];
                if (data[j] > max) max = data[j];
              }
              peaks[i * 2] = min;
              peaks[i * 2 + 1] = max;
            }
            allPeaks.push(peaks);
          }

          // Render waveform to canvas
          var waveformUrl = VMP._mpRenderWaveform(allPeaks, numChannels);

          /* Cache. The Float32Array goes in AS IT IS: IndexedDB structured-clones a typed array, so
             `Array.from` was building a second, boxed copy of every peak (92 ms of the import, and
             the memory behind it) purely to store the same numbers less efficiently. Its one reader,
             the dubbing waveform in render.js, indexes and reads `.length`, which a Float32Array
             answers identically - and rows written by the old code still read the same way. */
          if (opts.clipId) {
            VMP.WaveformCache.put(opts.clipId, {
              raw: allPeaks,
              samplesPerPixel: samplesPerPixel,
              sampleRate: buffer.sampleRate,
              duration: buffer.duration
            }, numChannels);
          }

          try { audioCtx.close(); } catch(e) {}

          resolve({
            peaks: allPeaks,
            channels: numChannels,
            waveformUrl: waveformUrl,
            duration: buffer.duration,
            sampleRate: buffer.sampleRate
          });
        }, function(err) {
          try { audioCtx.close(); } catch(e) {}
          reject(err || new Error('Audio decode failed'));
        });
      };
      xhr.onerror = function() { reject(new Error('Fetch failed')); };
      xhr.send();
    });
  };

  VMP._mpRenderWaveform = function (allPeaks, channels) {
    var canvasW = 400;
    var channelH = channels > 1 ? 20 : 40;
    var canvasH = channelH * channels;
    var wCanvas = document.createElement('canvas');
    wCanvas.width = canvasW;
    wCanvas.height = canvasH;
    var wCtx = wCanvas.getContext('2d');

    for (var ch = 0; ch < channels; ch++) {
      var peaks = allPeaks[ch];
      var peaksCount = peaks.length / 2;
      var yOffset = ch * channelH;
      var midY = yOffset + channelH / 2;

      // Find max amplitude for normalization
      var maxAmp = 0;
      for (var i = 0; i < peaksCount; i++) {
        var absMin = Math.abs(peaks[i * 2]);
        var absMax = Math.abs(peaks[i * 2 + 1]);
        if (absMin > maxAmp) maxAmp = absMin;
        if (absMax > maxAmp) maxAmp = absMax;
      }
      if (maxAmp === 0) maxAmp = 1;

      // Downsample peaks to fit canvas width
      var samplesPerBar = Math.max(1, Math.floor(peaksCount / canvasW));
      var barWidth = Math.max(1, canvasW / Math.min(peaksCount, canvasW));

      wCtx.fillStyle = 'rgba(242, 255, 88,0.5)';

      for (var x = 0; x < canvasW; x++) {
        var pIdx = Math.floor(x * peaksCount / canvasW);
        if (pIdx >= peaksCount) break;
        var pMin = peaks[pIdx * 2] / maxAmp;
        var pMax = peaks[pIdx * 2 + 1] / maxAmp;
        // Use absolute peak amplitude — bars grow upward from bottom
        var absAmp = Math.max(Math.abs(pMin), Math.abs(pMax));
        var barH = Math.max(1, Math.round(absAmp * (channelH - 2)));
        wCtx.fillRect(x, yOffset + channelH - barH, 1, barH);
      }
    }

    return wCanvas.toDataURL();
  };

  VMP._mpGetPeaksForZoom = function (rawPeaks, targetBars) {
    var rawCount = rawPeaks.length / 2;
    if (targetBars >= rawCount) return rawPeaks;

    var result = new Float32Array(targetBars * 2);
    var ratio = rawCount / targetBars;

    for (var i = 0; i < targetBars; i++) {
      var start = Math.floor(i * ratio);
      var end = Math.floor((i + 1) * ratio);
      var min = 0, max = 0;
      for (var j = start; j < end && j < rawCount; j++) {
        if (rawPeaks[j * 2] < min) min = rawPeaks[j * 2];
        if (rawPeaks[j * 2 + 1] > max) max = rawPeaks[j * 2 + 1];
      }
      result[i * 2] = min;
      result[i * 2 + 1] = max;
    }

    return result;
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'waveform', parent: 'video.ve-media-pipeline', title: 've-media-pipeline: waveform', mount: function () {}, unmount: function () {} });
  }
})();
