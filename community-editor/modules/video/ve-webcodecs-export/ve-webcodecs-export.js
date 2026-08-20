/**
 * VEWebCodecsExport — WebCodecs + mp4-muxer video encoding pipeline.
 *
 * Hardware-accelerated video encoding for the video editor export system.
 * Requires: WebCodecs API (Chrome 94+, Edge 94+, Safari 16.4+)
 *         + mp4-muxer vendor lib (window.Mp4Muxer)
 *
 * Public API: window.VEWebCodecsExport
 */
(function() {
  'use strict';

  // ─── Feature Detection ─────────────────────────────────────

  function getSupport() {
    return {
      videoEncoder: typeof VideoEncoder !== 'undefined',
      videoFrame:   typeof VideoFrame !== 'undefined',
      audioEncoder: typeof AudioEncoder !== 'undefined',
      muxer:        !!(window.Mp4Muxer && Mp4Muxer.Muxer)
    };
  }

  function isSupported() {
    var s = getSupport();
    return s.videoEncoder && s.videoFrame && s.muxer;
  }

  /* AAC bitrate for the muxed audio track. One constant because it is now read in four places: the
     support probe, the encoder config, the live size projection and the pre-export estimate. It was
     four copies of `128000`, and the estimate simply did not have one at all, which on a 51 minute
     export left 49 MB of real file out of the number the user was shown. */
  var AUDIO_BITRATE = 128000;

  // ─── Quality Presets ───────────────────────────────────────

  /* These are a quality CEILING, not a target: the encoder spends what the picture needs and stops.
     They were doubled 2026-07-25 after measuring, because the old ladder was capping quality AND, at
     4K, costing speed.

     Measured on demanding 4K content (per-frame noise, the case that actually needs bits):

         requested 20 Mbps   38.0 ms/frame   12.1 MB / 60 frames
         requested 40 Mbps   34.8 ms/frame   18.1 MB      <- the old ceiling
         requested 80 Mbps   23.2 ms/frame   23.6 MB      <- 33% FASTER and better

     Counter-intuitive and reproducible: at a low ceiling the hardware encoder works HARDER, because
     rate control has to fight to squeeze the frame into the budget. Give it room and it stops
     fighting. At 1080p and 720p the same change measured speed-neutral (7.4 -> 7.0 ms and 5.7 -> 5.9)
     and simply raised the quality headroom.

     Not raised further: 150 Mbps measured slower AND produced less data than 80 in two separate
     runs, i.e. something clamps up there. 80 is the top of the useful range on this hardware. */
  var PRESETS = {
    '480':  { w: 854,  h: 480,  br: 5000000 },
    '720':  { w: 1280, h: 720,  br: 10000000 },
    '1080': { w: 1920, h: 1080, br: 20000000 },
    '1440': { w: 2560, h: 1440, br: 40000000 },
    '2160': { w: 3840, h: 2160, br: 80000000 }
  };

  /* ─── Codec candidates: the LEVEL must follow the resolution ───────────────────────────────
     The list used to be three fixed strings pinned to H.264 level 4.0 (…0028) and 3.1 (…001f),
     whose frame ceilings are ~1920x1088 and ~1280x720. Every 1440p/2160p export therefore failed
     `isConfigSupported` on all three, fell through to a VP9 string pinned to level 1.0 (which also
     fails), and the UI printed "No supported codec found". Measured on a dev machine:
       2560x1440 -> avc1.640032 (High 5.0) OK      3840x2160 -> avc1.640033 (High 5.1) OK
       3840x2160 -> av01.0.12M.08 (AV1) OK         3840x2160 -> prefer-software OK
       VP9 -> unsupported at every level tried, and vp9-in-mp4 is the wrong pairing anyway.
     So: derive the level from macroblocks + macroblocks/second, then walk a real ladder. */
  var H264_LEVELS = [
    // [level_idc, maxFrameSizeMbs, maxMbsPerSecond]
    [0x1f, 3600, 108000],     // 3.1
    [0x20, 5120, 216000],     // 3.2
    [0x28, 8192, 245760],     // 4.0
    [0x29, 8192, 245760],     // 4.1
    [0x2a, 8704, 522240],     // 4.2
    [0x32, 22080, 589824],    // 5.0
    [0x33, 36864, 983040],    // 5.1
    [0x34, 36864, 2073600],   // 5.2
    [0x3c, 139264, 4177920],  // 6.0
    [0x3d, 139264, 8355840],  // 6.1
    [0x3e, 139264, 16711680]  // 6.2
  ];

  function _hex2(n) { return (n < 16 ? '0' : '') + n.toString(16); }

  function h264LevelFor(w, h, fps) {
    var mbs = Math.ceil(w / 16) * Math.ceil(h / 16);
    var mbps = mbs * (fps || 30);
    for (var i = 0; i < H264_LEVELS.length; i++) {
      if (mbs <= H264_LEVELS[i][1] && mbps <= H264_LEVELS[i][2]) return H264_LEVELS[i][0];
    }
    return H264_LEVELS[H264_LEVELS.length - 1][0];
  }

  /** Ordered codec strings to probe for this frame size: High then Main at the required level, then
   *  the next levels up (some drivers only advertise headroom levels), then AV1 as a real fallback. */
  function codecCandidates(w, h, fps) {
    var lv = h264LevelFor(w, h, fps);
    var out = ['avc1.64' + '00' + _hex2(lv), 'avc1.4d' + '00' + _hex2(lv)];
    for (var i = 0; i < H264_LEVELS.length; i++) {
      var up = H264_LEVELS[i][0];
      if (up > lv) out.push('avc1.64' + '00' + _hex2(up));
      if (out.length >= 5) break;
    }
    out.push('av01.0.12M.08');   // AV1, muxable into MP4, hardware on recent GPUs
    return out;
  }

  /** mp4-muxer video codec family from a WebCodecs codec string. AV1 used to fall into 'avc'. */
  function muxerFamily(codec) {
    if (codec.indexOf('av01') === 0) return 'av1';
    if (codec.indexOf('hev') === 0 || codec.indexOf('hvc') === 0) return 'hevc';
    if (codec.indexOf('vp0') === 0 || codec.indexOf('vp9') === 0) return 'vp9';
    return 'avc';
  }

  // ─── Dimension Calculator ──────────────────────────────────

  // Same ladder as PRESETS, for the "export at the canvas size" path. Kept in step with it by hand
  // because it keys off the short side rather than a preset name; if one moves, move both.
  function _brForShort(shortSide) {
    if (shortSide >= 2000) return 80000000;
    if (shortSide >= 1400) return 40000000;
    if (shortSide >= 1000) return 20000000;
    if (shortSide >= 700) return 10000000;
    return 5000000;
  }
  // Export dimensions are derived from the ACTUAL working canvas (CW/CH), not a
  // fixed 16:9 (owner: whatever format I work in, the output must match my canvas;
  // recommended = our canvas). `quality === 'canvas'` exports the exact CW×CH; the
  // named presets (480..2160) scale the canvas aspect to that short side so a
  // 9:16 reels project exports portrait, a 1:1 project exports square, etc.
  function computeExportDimensions(quality, aspectRatio) {
    var cw = (typeof CW !== 'undefined' && CW) ? CW : 1920;
    var ch = (typeof CH !== 'undefined' && CH) ? CH : 1080;
    var w, h;
    /* A bare number is a short side in pixels, so a caller can ask for the SOURCE video's own
       resolution (e.g. 360) without it having to be one of the five ladder tiers. The frame still
       follows the canvas aspect, because the composite does. */
    var numeric = (typeof quality === 'number') ? quality : (/^\d+$/.test(String(quality)) ? parseInt(quality, 10) : 0);
    if (quality === 'canvas' || (!PRESETS[quality] && !numeric)) {
      w = cw; h = ch;
      if (w % 2) w++; if (h % 2) h++;
      return { w: w, h: h, br: _brForShort(Math.min(cw, ch)) };
    }
    if (!PRESETS[quality]) {
      var s = Math.max(16, numeric);
      if (cw >= ch) { h = s; w = Math.round(h * cw / ch); }
      else { w = s; h = Math.round(w * ch / cw); }
      if (w % 2) w++; if (h % 2) h++;
      return { w: w, h: h, br: _brForShort(s) };
    }
    var shortSide = PRESETS[quality].h; // the "p" number = short side
    if (cw >= ch) { h = shortSide; w = Math.round(h * cw / ch); }   // landscape / square
    else { w = shortSide; h = Math.round(w * ch / cw); }            // portrait
    if (w % 2) w++;
    if (h % 2) h++;
    return { w: w, h: h, br: PRESETS[quality].br };
  }

  /* ─── Disk target (plan R2) ───────────────────────────────────────────────────────────────────
     The muxer used to write into an `ArrayBufferTarget` with `fastStart:'in-memory'`, and the result
     was then copied into a Blob: a 10 minute 4K/40Mbps export is about 3 GB held TWICE. The camera
     recorder already solved this: `StreamTarget` + a Worker writing through `createSyncAccessHandle`
     into OPFS, which writes in place with no temp file. We reuse that exact worker file, so there is
     no new module to register and nothing new to bundle. Falls back to RAM when OPFS is unavailable.
     `fastStart:false` is required with a stream target (moov lands at the tail, fine for a local
     file we hand straight to a download). */
  function _base() {
    var s = document.querySelector('script[src*="core/loader.js"], script[src*="modules.bundle.js"]');
    var href = (s && s.src) || location.href;
    return href.replace(/(core\/loader\.js|dist\/modules\.bundle\.js).*$/, '').replace(/[^/]*$/, '');
  }

  function createDiskTarget(name) {
    if (!(navigator.storage && navigator.storage.getDirectory) || !window.Mp4Muxer || !Mp4Muxer.StreamTarget) {
      return Promise.resolve(null);
    }
    var file = 'ccexport-' + Date.now() + '-' + String(name || 'video.mp4').replace(/[^\w.\-]+/g, '_');
    // Clear out previous runs here, where nothing can be mid-download (see _sweepOldDiskFiles).
    _sweepOldDiskFiles();
    return new Promise(function (resolve) {
      var w;
      try { w = new Worker(new URL('modules/video/ve-recorder/ve-recorder.worker.js', _base()).href); }
      catch (e) { resolve(null); return; }
      var settled = false;
      var t = setTimeout(function () {
        if (settled) return; settled = true;
        try { w.terminate(); } catch (e) {}
        resolve(null);
      }, 5000);
      var pendingClose = null;
      w.onmessage = function (ev) {
        var m = ev.data || {};
        if (m.type === 'ready') {
          if (settled) return; settled = true; clearTimeout(t);
          resolve({
            name: file,
            target: new Mp4Muxer.StreamTarget({
              onData: function (data, position) {
                var copy = new Uint8Array(data);   // the muxer reuses its buffer; we transfer ownership
                w.postMessage({ type: 'write', data: copy, position: position }, [copy.buffer]);
              }
            }),
            close: function () {
              return new Promise(function (res) { pendingClose = res; w.postMessage({ type: 'close' }); })
                .then(function (size) { try { w.terminate(); } catch (e) {} return size; });
            },
            abort: function () { try { w.postMessage({ type: 'close' }); } catch (e) {} try { w.terminate(); } catch (e) {} }
          });
          return;
        }
        if (m.type === 'closed') { if (pendingClose) { pendingClose(m.size); pendingClose = null; } return; }
        if (m.type === 'error') {
          console.warn('[VE export] disk writer error:', m.message);
          if (!settled) { settled = true; clearTimeout(t); resolve(null); }
        }
      };
      w.onerror = function () { if (settled) return; settled = true; clearTimeout(t); resolve(null); };
      w.postMessage({ type: 'open', name: file });
    });
  }

  /* Read the finished OPFS file back as a Blob.

     It used to schedule `removeEntry(name)` 120 seconds later, and that was a bug with a two minute
     fuse: the Blob handed to the browser is BACKED by that OPFS file, it is not a copy. A 221 MB
     export where the user is choosing a folder, or on a slow disk, or simply left alone for two
     minutes, had the file deleted out from under an in-flight download. Never delete a file you
     just handed to the user; the leftovers are swept at the START of the next export instead. */
  function _readDiskFile(name) {
    return navigator.storage.getDirectory()
      .then(function (root) { return root.getFileHandle(name); })
      .then(function (fh) { return fh.getFile(); });
  }

  /* Remove export files left in OPFS by PREVIOUS runs. Called before a new export opens its own
     file, which is the one moment when no download can be reading one of them. The timestamp is in
     the name (`ccexport-<Date.now()>-...`), so anything older than the window below is finished
     with; an unparseable name is left alone rather than guessed at. */
  var _DISK_KEEP_MS = 6 * 3600 * 1000;
  function _sweepOldDiskFiles() {
    if (!(navigator.storage && navigator.storage.getDirectory)) return Promise.resolve();
    return navigator.storage.getDirectory().then(function (root) {
      if (!root.entries) return null;
      var cutoff = Date.now() - _DISK_KEEP_MS;
      var it = root.entries();
      var stale = [];
      function scan() {
        return it.next().then(function (r) {
          if (r.done) return stale;
          var nm = r.value && r.value[0];
          var m = nm && /^ccexport-(\d+)-/.exec(nm);
          if (m && parseInt(m[1], 10) < cutoff) stale.push(nm);
          return scan();
        });
      }
      return scan().then(function (list) {
        return Promise.all(list.map(function (nm) {
          return root.removeEntry(nm)['catch'](function () {});
        }));
      });
    })['catch'](function () { /* housekeeping must never block an export */ });
  }

  /* Hand control back to the event loop WITHOUT paying a timer.

     `setTimeout(fn, 0)` is not "as soon as possible": in a visible tab Chrome aligns timer tasks to
     the compositor, so a loop that yields once per iteration runs at ONE ITERATION PER VSYNC.
     Measured on the video loop: 20.2 ms of wall clock per frame while decode + composite + encode
     together were 2.8 ms. A MessageChannel message is a task, not a timer: no clamp, no vsync
     alignment, and the UI still gets its turn in between. */
  var _yq = [];
  var _ych = (typeof MessageChannel !== 'undefined') ? new MessageChannel() : null;
  if (_ych) _ych.port1.onmessage = function () { var f = _yq.shift(); if (f) f(); };
  function _yield(fn) {
    if (!_ych) { setTimeout(fn, 0); return; }
    _yq.push(fn);
    _ych.port2.postMessage(0);
  }

  /* A6: is there actually an AAC encoder for this material? The muxer declares its audio track at
     construction, long before `encodeAudioToMuxer` runs, so asking afterwards was too late: an
     unsupported configuration produced an MP4 carrying a DECLARED BUT EMPTY AAC track, which most
     players show as "has audio" and play as silence. Ask first, declare second. */
  function probeAudioSupport(sampleRate, channels, audioBitrate) {
    if (typeof AudioEncoder === 'undefined') return Promise.resolve(false);
    return AudioEncoder.isConfigSupported({
      codec: 'mp4a.40.2',
      sampleRate: sampleRate,
      numberOfChannels: Math.min(channels || 2, 2),
      bitrate: audioBitrate || AUDIO_BITRATE
    }).then(function (r) { return !!(r && r.supported); })['catch'](function () { return false; });
  }

  // ─── Encoder Config Builder ────────────────────────────────

  /* ─── PLATFORM PRESETS ────────────────────────────────────────────────────────────────────────
     Every number below comes from the platform's own documentation; none is invented. Sources are
     named per entry so they can be re-checked when a platform changes its specs (only TikTok's page
     carried a visible date: June 2026).

     What a preset can and cannot do here matters. It sets RESOLUTION and FRAME RATE. It CANNOT set
     the aspect ratio, because the export frame always follows the working canvas: there used to be
     an aspect select in the export dialog that changed nothing, and it was replaced with a read-only
     fact for exactly that reason. So a TikTok preset on a 16:9 canvas cannot produce 9:16, and
     pretending otherwise would be the same lie in a new place. It WARNS instead. */
  var EXPORT_PLATFORMS = [
    {
      id: 'youtube', label: 'YouTube', hint: 'Landscape, up to 4K',
      maxShortSide: 2160, fps: 30, aspectW: 16, aspectH: 9, aspectLabel: '16:9',
      maxSeconds: 0,
      // support.google.com/youtube/answer/6375112 (16:9 default, up to 2160p) and /answer/1722171
      // (4K 35-45 Mbps, MP4 + H.264 High + 4:2:0, AAC-LC 48 kHz), which our output already matches.
      source: 'YouTube Help: video resolution + recommended upload encoding settings'
    },
    {
      id: 'yt-shorts', label: 'YouTube Shorts', hint: 'Vertical, max 1080p, 3 min',
      maxShortSide: 1080, fps: 30, aspectW: 9, aspectH: 16, aspectLabel: '9:16',
      maxSeconds: 180,
      // support.google.com/youtube/answer/10059070: "square or vertical", max 1080p, up to 3 minutes.
      source: 'YouTube Help: get started creating Shorts'
    },
    {
      id: 'ig-reels', label: 'Instagram Reels', hint: 'Vertical, min 720p / 30 fps',
      maxShortSide: 1080, fps: 30, aspectW: 9, aspectH: 16, aspectLabel: '9:16',
      maxSeconds: 0,
      // facebook.com/help/1038071743007909: aspect between 1.91:1 and 9:16, minimum 720 px, min 30 FPS.
      // Meta states MINIMUMS, not a recommended size; 1080x1920 is a third-party convention, so the
      // ceiling here is ours (1080p) and the 9:16 target is the vertical end of Meta's own range.
      source: 'Meta Help: reel size and aspect ratios'
    },
    {
      id: 'tiktok', label: 'TikTok', hint: 'Vertical, min 540x960',
      maxShortSide: 1080, fps: 30, aspectW: 9, aspectH: 16, aspectLabel: '9:16',
      maxSeconds: 0,
      // ads.tiktok.com/help/article/video-ads-specifications (June 2026): 9:16 vertical recommended,
      // minimum 540x960. NOTE: this is TikTok's ADS spec; their creator-upload page could not be read
      // programmatically, so the numbers are ads-sourced and the 1080p ceiling is ours.
      source: 'TikTok for Business: video ads specifications (ads spec, not the creator page)'
    }
  ];

  /* What a preset would actually do to THIS project, plus anything the user should know before
     pressing export. Pure: no DOM, both export front-ends call it. */
  function platformAdvice(platformId, cw, ch, durationSec, srcShort) {
    var p = null;
    for (var i = 0; i < EXPORT_PLATFORMS.length; i++) if (EXPORT_PLATFORMS[i].id === platformId) p = EXPORT_PLATFORMS[i];
    if (!p) return null;
    cw = cw || 1920; ch = ch || 1080;

    /* Never upscale. `computeExportDimensions` scales the canvas aspect to the chosen short side, so
       asking for 2160 on a 640x360 canvas would blow it up to 3840x2160 and invent detail that is not
       there. Pick the largest tier that can actually be FILLED, capped by the platform.
       The canvas is not the only limit: a 640x360 clip on a 1920x1080 canvas is already being
       upscaled by the composite, so the timeline's real detail ceiling wins when it is lower. */
    var canvasShort = Math.min(cw, ch);
    var detailShort = (srcShort && srcShort > 0 && srcShort < canvasShort) ? srcShort : canvasShort;
    var tiers = [2160, 1440, 1080, 720, 480];
    var quality = '480';
    for (var t = 0; t < tiers.length; t++) {
      if (tiers[t] <= p.maxShortSide && tiers[t] <= detailShort) { quality = String(tiers[t]); break; }
    }
    /* Below the smallest tier there is nothing on the ladder to pick, so ask for the exact size.
       'canvas' is only right when the CANVAS is what is small: a 360p clip on a 1080p canvas would
       otherwise come back as "use the whole canvas", which is the upscale this function exists to
       avoid. computeExportDimensions takes a bare short side for exactly this case. */
    if (detailShort < 480) quality = (detailShort === canvasShort) ? 'canvas' : String(detailShort);

    var warnings = [];
    var want = p.aspectW / p.aspectH, have = cw / ch;
    if (Math.abs(want - have) > 0.05) {
      warnings.push('This canvas is ' + _ratioLabel(cw, ch) + ' and ' + p.label + ' expects ' +
                    p.aspectLabel + '. The export always follows the canvas, so resize the canvas ' +
                    'first if you need ' + p.aspectLabel + '.');
    }
    if (p.maxSeconds && durationSec > p.maxSeconds) {
      warnings.push(p.label + ' accepts up to ' + Math.round(p.maxSeconds / 60) + ' minutes; this is ' +
                    Math.ceil(durationSec / 60) + '.');
    }
    /* detailShort, not canvasShort: the export is capped to what the footage can fill, so a 360p clip
       on a 1080p canvas ships a 360 px short side and the platform minimum is missed even though the
       canvas looks fine. Naming the actual limit is the point of the warning. */
    if (detailShort < 720 && (p.id === 'ig-reels' || p.id === 'tiktok')) {
      warnings.push(p.label + ' asks for at least 720 px on the short side; this export would be ' +
                    detailShort + ' px' + (detailShort < canvasShort ? ' (limited by the footage, not the canvas)' : '') + '.');
    }
    return { platform: p, quality: quality, fps: p.fps, warnings: warnings };
  }

  function _ratioLabel(w, h) {
    var g = function (a, b) { return b ? g(b, a % b) : a; };
    var d = g(w, h) || 1;
    if ((w / d) > 40 || (h / d) > 40) return (w / h).toFixed(2) + ':1';
    return (w / d) + ':' + (h / d);
  }

  /* ─── CONSTANT QUALITY ────────────────────────────────────────────────────────────────────────
     We used to tell the encoder "spend N megabits per second". It obeyed, whether the picture needed
     the bits or not, which is wrong at BOTH ends: an easy shot got padded with bits that changed
     nothing, and a hard shot hit the cap and got crushed. Measured, same content, 1080p:

         constant bitrate 20 Mbps   0.97 MB   48.02 dB     easy footage
         constant quality QP20      0.39 MB   47.63 dB     60% smaller, 0.4 dB apart

         constant bitrate 20 Mbps   4.17 MB   11.81 dB     hard footage (per-frame noise)
         constant quality QP20     76.60 MB   14.61 dB     2.8 dB BETTER, no cap to hit

     At 4K the same: CBR 80 Mbps 2.73 MB vs QP20 1.45 MB, at identical speed. And the 40 Mbps cap we
     shipped before this was measurably destroying frames: 14 of 90 were crushed past the point where
     a flat colour block could be read back.

     So a lower QP number is HIGHER quality, and the size follows the footage instead of the clock. */
  /* H.264 scale, the single source. `recommended` is the export MANAGER's id for the same middle
     preset the export MODAL calls `standard`; both front-ends feed the same engine, so both ids are
     listed rather than left to fall through to the default by luck. */
  var PRESET_QP = { draft: 24, standard: 20, recommended: 20, high: 18 };

  /* The QP scale is NOT the same across codecs: H.264 and HEVC are 0-51, AV1 is 0-63. The codec
     ladder really does fall through to AV1 on machines without an H.264 level for the frame size, so
     handing 20 to both would silently mean two different pictures. The per-frame option KEY differs
     too, and `muxerFamily` already classifies exactly these three families. One function, so there
     is never a second table to drift from this one. */
  function qpFor(codec, preset, qpOverride) {
    var base = (qpOverride != null && isFinite(qpOverride))
      ? qpOverride
      : (PRESET_QP[preset] != null ? PRESET_QP[preset] : PRESET_QP.standard);
    var fam = muxerFamily(codec);
    if (fam === 'av1') return { key: 'av1', qp: Math.round(base * 63 / 51) };
    if (fam === 'hevc') return { key: 'hevc', qp: base };
    if (fam === 'vp9') return { key: 'vp9', qp: Math.round(base * 63 / 51) };
    return { key: 'avc', qp: base };
  }

  /* ─── WHY THERE IS NO GOOD FORMULA, AND WHAT REPLACED IT ──────────────────────────────────────
     The first version used ONE bits-per-pixel figure for every frame size, fitted to a 4K
     measurement, and was wrong by 6x at 360p: a 51 minute 640x360 export was quoted "64 - 384 MB"
     and delivered 845.1 MB. Adding a resolution term helped. Measuring properly killed the idea.

     Everything below was measured through the REAL export pipeline (`VE._veProbeExportSize`, which
     is the same compositor, codec, quantiser and GOP the file gets), on a real 1080x1920 clip:

       QUANTISER, QP steps per halving of the rate:
         QP18 0.10242 bpp -> QP20 0.07529 -> QP24 0.04484      =>  4.5 and 5.35, so about 5.
         Not the textbook 6. QP_PER_HALVING is 5 because that is what the encoder does.

       RESOLUTION, same clip, same QP18:
         360x640   0.23396 bpp        720x1280   0.09566
         540x960   0.13417            1080x1920  0.10242   <- goes back UP
         That is not a power law. 1080 is the clip's NATIVE size (full detail, no resampling)
         while 540 and 720 are downscales, and a downscale is a low-pass filter that throws away
         exactly the high-frequency content that costs bits. The curve is U-shaped, and any single
         exponent fitted through it is wrong somewhere by 80%.

     So a measurement CANNOT be rescaled to other settings, and the model below cannot be made
     accurate. Both consequences are shipped honestly: the front-ends re-probe when the settings
     change (a probe is ~2 s), and this function is only the placeholder shown while that runs or
     when it cannot run at all. It is labelled "rough estimate" on screen, never "measured".

     The two anchors it IS fitted to are the two points confirmed against real finished files:
     0.416 bpp at 640x360 QP18 (the owner's 845.1 MB export) and 0.10242 at 1080x1920 QP18 (a
     7.13 MB export this probe predicted at 7.69 MB). It over-predicts in the middle of that range,
     which is the safe direction: promising a bigger file than arrives is the lesser failure. */
  var BPP_C = 1095;        // fitted to the two real-file-confirmed anchors
  var BPP_EXP = -0.638;    // ditto; NOT a law, see the U-shape above
  var BPP_QP_REF = 18;     // the QP both anchors were measured at
  var QP_PER_HALVING = 5;  // measured QP18->20->24 through the real pipeline

  function bppForFrame(w, h, qp) {
    var px = Math.max(1, (w || 0) * (h || 0));
    return BPP_C * Math.pow(px, BPP_EXP) * Math.pow(2, (BPP_QP_REF - qp) / QP_PER_HALVING);
  }

  /* ─── THE SOURCE IS THE CEILING ───────────────────────────────────────────────────────────────
     QP is a per-pixel FIDELITY target, not a quality one. It says "reproduce this input closely"
     and it obeys whether the input is a camera original or a heavily compressed download. That is
     exactly how a 640x360 source carrying 0.44 Mbps came back out at 2.19 Mbps: QP18 spent five
     times the source's own bitrate faithfully preserving that source encoder's blocking artifacts
     as if they were detail. The picture is not better for it. Nothing is in the output that was not
     in the input.

     So the target rate is capped relative to the source's own rate. The multiplier is PER PRESET,
     because the presets are the only place the user says how much they care:

         High         1.5x the source   preserve everything, generation-loss headroom included
         Recommended  1.0x              about the size it came in at
         Fast         0.6x              deliberately smaller than the source

     The first version used 1.5x for all three, and the owner caught what that means in practice: a
     160 MB source exported at the LOWEST setting still came out at 248 MB. "Fast" that produces a
     bigger file than the input is not a quality setting, it is a broken one. Now the ladder maps to
     something a person can predict without knowing what a quantiser is.

     The cap is on TOTAL bitrate, not on bits-per-pixel, because upscaling a 360p clip to 4K adds no
     information: the ceiling has to survive a resolution change. And it is a CEILING only - on a
     high-bitrate source the preset's own QP is already below it and nothing changes.

     Four rules keep this from becoming the quality-crusher it would be if done carelessly:
       - it can only RAISE qp (relax the target), never tighten it past the preset
       - it stops at QP_SOURCE_CEILING, so a broken 20 kbps source cannot drag an export to mush
       - no video source, or one we cannot measure, means no cap at all
       - both front-ends SHOW it with the numbers and can switch it off per export

     Known imprecision, in the safe direction: the source bitrate is derived from file bytes over
     duration, so it includes the audio track. That OVERSTATES the video rate by ~128 kbps, which
     makes the cap slightly more generous than it should be. Better than the reverse. */
  var SOURCE_HEADROOM = { draft: 0.6, standard: 1.0, recommended: 1.0, high: 1.5 };
  /* 38, not 34 and not the original 30. The ceiling exists so a broken source cannot drag an export
     to mush, but it kept firing BEFORE the target was reached and silently cancelling the promise on
     screen: at 640x360 the owner's Fast export needed QP36 to land under its own source and was
     clamped to 34. Only Fast on an already-poor source ever gets near 38; Recommended on the same
     material works out at QP32. */
  var QP_SOURCE_CEILING = 38;

  /* The AAC track is part of the budget, not an extra. Its rate follows the preset AND the source,
     for the same reason the video's does: on the owner's 0.44 Mbps source a flat 128 kbps audio
     track was 29% of the ENTIRE source file, 47 MB of a 51 minute export. Bounded below at 48 kbps,
     which is the practical floor for AAC-LC stereo, so a pathological source cannot produce a
     silent-sounding file. */
  /* AAC-LC bitrates the platform encoder will actually ACCEPT. Chrome on Windows goes through the
     Media Foundation AAC MFT, whose documented set is exactly these four values (12000/16000/20000/
     24000 bytes per second); anything else comes back `supported:false` from
     `AudioEncoder.isConfigSupported`.

     This is not a detail, it is a bug I shipped. Making the audio rate source-dependent produced
     68,656 bps for a 0.458 Mbps source at the Fast preset - 71% of the lowest value the encoder
     supports - so the probe said no, `includeAudio` went false, the muxer was built with no audio
     track at all, and the export came out SILENT while the estimate still counted 25 MB of audio.
     The old hardcoded 128000 was legal by accident; the floor of 48000 I replaced it with was half
     the real minimum. Any computed rate is now snapped DOWN onto this ladder, never below its
     bottom rung. */
  var AAC_BITRATES = [96000, 128000, 160000, 192000];
  var AUDIO_BY_PRESET = { draft: 96000, standard: 128000, recommended: 128000, high: 192000 };
  var AUDIO_MIN = 96000;

  function _snapAac(bps) {
    var out = AAC_BITRATES[0];
    for (var i = 0; i < AAC_BITRATES.length; i++) if (AAC_BITRATES[i] <= bps) out = AAC_BITRATES[i];
    return out;
  }

  function headroomFor(preset) {
    return SOURCE_HEADROOM[preset] != null ? SOURCE_HEADROOM[preset] : SOURCE_HEADROOM.standard;
  }

  function audioBitrateFor(preset, srcBitrate) {
    var want = AUDIO_BY_PRESET[preset] != null ? AUDIO_BY_PRESET[preset] : AUDIO_BY_PRESET.standard;
    if (!srcBitrate || !isFinite(srcBitrate) || srcBitrate <= 0) return want;
    var budget = srcBitrate * headroomFor(preset);
    return _snapAac(Math.min(want, Math.max(AUDIO_MIN, budget * 0.25)));
  }

  /* How to say a headroom multiplier to a person. Lives here rather than in either dialog so the
     two cannot end up describing the same setting differently, which is the mistake this file has
     already paid for twice. */
  function headroomPhrase(headroom) {
    if (headroom > 1.05) return 'a little larger than the original';
    if (headroom < 0.95) return 'smaller than the original';
    return 'about the same size as the original';
  }

  /* `measuredBase` is the REAL bits-per-pixel this project costs at `baseQp`, from VESizeProbe.
     It matters more than it looks. The cap used to decide with the MODEL while the size on screen
     came from the MEASUREMENT, and on content the model misreads, the promise broke silently:
     measured case, a clip whose real cost at QP24 was 0.419 bpp where the model said 0.075. The cap
     compared 2 Mbps against an 8 Mbps allowance, did nothing, and "Fast, 0.6x the source" shipped at
     0.86x. One number decides, and it is the measured one whenever there is one. */
  /* ─── WHEN A SIZE IS PROMISED, TARGET A RATE ──────────────────────────────────────────────────
     Researched 2026-07-26, and it settles an argument this file has been losing for days.

     Constant quality CANNOT promise a size. x264's own documentation says it plainly: "you cannot
     reliably estimate what the resulting bitrate for a given CRF will be, unless you know more about
     that source" - measured, CRF23 at 2160p ranged 10 to 25 Mbps across four clips
     (slhck.info/video/2017/02/24/crf-guide.html). HandBrake REMOVED its target-size feature and now
     recommends against size targeting altogether; DaVinci Resolve ships no size estimate at all;
     Premiere's and CapCut's are documented as often wrong (CapCut: 5.6 GB predicted, 1.3 GB
     delivered). Nobody predicts a constant-quality size well, because it is not predictable.

     What every tool that DOES promise a size uses is a target bitrate, with the standard formula
     (HandBrake / FFmpeg two-pass):

         video_bitrate = (target_bytes * 8 * (1 - overhead)) / duration - audio_bitrate

     So: when the user's setting is a statement about SIZE relative to their source - which is what
     the per-preset headroom is - stop guessing a quantiser that might land there and simply target
     the rate. Fast then IS 0.6x the source, not 0.6x if the quantiser cooperates.

     Constant quality still runs whenever there is no measurable source to be relative to, which is
     the case where nothing was promised and the encoder should spend what the picture needs. */
  var MUX_OVERHEAD = 0.02;   // container + index; the 1-5% practitioners reserve, at the low end

  function targetVideoBitrate(preset, srcBitrate, includeAudio) {
    if (!srcBitrate || !isFinite(srcBitrate) || srcBitrate <= 0) return 0;
    var total = srcBitrate * headroomFor(preset) * (1 - MUX_OVERHEAD);
    var audio = includeAudio ? audioBitrateFor(preset, srcBitrate) : 0;
    // Never below a floor: a pathological source must not produce an unplayable video track.
    return Math.max(120000, Math.round(total - audio));
  }

  function sourceAdaptedQp(baseQp, w, h, fps, srcBitrate, preset, includeAudio, measuredBase) {
    if (!srcBitrate || !isFinite(srcBitrate) || srcBitrate <= 0) return baseQp;
    var f = parseInt(fps, 10) || 30;
    /* A CAP must be driven by the PESSIMISTIC input, never the optimistic one. Letting the
       measurement replace the model outright meant a probe that read low - it samples one source
       clip, not the finished composite - could talk the cap out of firing entirely: measured on the
       owner's project, the estimate said 242 MB, the cap never engaged, and the file came out at
       390 MB with the base quantiser untouched. Whichever predicts the LARGER file wins, so the
       guard can only ever be too careful, never absent. */
    var bppBase = Math.max(measuredBase > 0 ? measuredBase : 0, bppForFrame(w, h, baseQp));
    var targetRate = (w || 0) * (h || 0) * f * bppBase;
    /* The headroom budgets the WHOLE FILE, so the audio track comes out of it before the video gets
       its share. Applying the multiplier to video alone and then muxing audio on top is how "Fast,
       0.6x the source" shipped at 1.01x: the video hit its 0.6 and 47 MB of AAC went on afterwards.
       A promise about file size has to be made about the file. */
    var allowed = srcBitrate * headroomFor(preset);
    if (includeAudio) allowed = Math.max(allowed * 0.25, allowed - audioBitrateFor(preset, srcBitrate));
    if (!targetRate || targetRate <= allowed) return baseQp;
    // QP_PER_HALVING is measured (5), not the textbook 6: asking for the wrong number of steps
    // means the cap lands somewhere other than where it says it does.
    var qp = baseQp + QP_PER_HALVING * Math.log(targetRate / allowed) / Math.LN2;
    return Math.min(QP_SOURCE_CEILING, Math.round(qp));
  }

  /* The QP this export will actually use: the preset, relaxed if the source cannot justify it.
     One function, so the estimate the user reads and the number the encoder receives can never
     be two different things (they were, for the size estimate, and it cost an 845 MB surprise). */
  function effectiveQp(preset, w, h, fps, srcBitrate, includeAudio, measuredBase) {
    var base = PRESET_QP[preset] != null ? PRESET_QP[preset] : PRESET_QP.standard;
    return sourceAdaptedQp(base, w, h, fps, srcBitrate, preset, includeAudio, measuredBase);
  }

  /* Is this measurement usable for these settings? The RESOLUTION axis is not scalable (the cost
     curve is U-shaped, see above), so a measurement only counts at the frame size and frame rate it
     was taken at. The QP axis IS scalable, measured at 4.5-5.35 steps per halving, which is what
     lets one probe at the base QP answer for a capped QP without measuring twice. */
  function _measuredFor(m, w, h, fps) {
    return !!(m && m.bpp > 0 && m.w === w && m.h === h && m.fps === (parseInt(fps, 10) || 30));
  }

  /* Size in bytes, as ONE number. There used to be a range here, and the owner was right to call it
     useless: a range wide enough to be honest about content is too wide to plan with, and it hides
     whether the number came from a model or from a measurement.

     `measuredBpp` is a `VESizeProbe.measure` result: the source clip re-encoded off the main thread
     at this export's own frame size, codec and GOP. It is used ONLY at the frame size and frame
     rate it was taken at, because the resolution curve is not rescalable (see above); silently
     converting a 1080p measurement into a 360p number would turn a measurement back into a guess
     while still calling itself measured. Mismatched or absent, this falls back to the model and
     says so in `measured: false`.

     `srcBitrate` is optional: 0 estimates the uncapped preset.

     `includeAudio` is NOT optional in practice and was missing, which is most of why a 51 minute
     export estimated at 110 MB arrived at 221 MB. The probe encodes video only (it runs without a
     muxer), so the AAC track was simply absent from the number: at AUDIO_BITRATE over 51 minutes
     that is 49 MB of the file, and on a long project it is the single largest correction. */
  function estimateQualitySize(w, h, fps, seconds, preset, srcBitrate, measuredBpp, includeAudio) {
    var base = PRESET_QP[preset] != null ? PRESET_QP[preset] : PRESET_QP.standard;
    var f = parseInt(fps, 10) || 30;
    /* The measurement is taken at the preset's BASE quantiser, so it feeds the cap decision first
       and then gets scaled to whatever quantiser the cap settled on. Measuring at the capped QP
       instead would need the cap to have already decided, which needs the measurement: the base-QP
       probe plus a QP-axis scale breaks that circle with one probe instead of two. */
    var measured = _measuredFor(measuredBpp, w, h, f);
    var qp = effectiveQp(preset, w, h, fps, srcBitrate, includeAudio, measured ? measuredBpp.bpp : 0);
    var secs = seconds || 0;
    var aRate = audioBitrateFor(preset, srcBitrate);

    /* With a measurable source the export targets a RATE, so the size is arithmetic rather than a
       prediction: this is the number the encoder is actually aiming at. Without one it falls back to
       the quality model, which is honestly labelled an estimate because it cannot be better. */
    var targetRate = targetVideoBitrate(preset, srcBitrate, includeAudio);
    var bpp, videoBytes;
    if (targetRate > 0) {
      videoBytes = targetRate * secs / 8;
      bpp = (w * h * f) ? targetRate / (w * h * f) : 0;
    } else {
      /* The SAME pessimistic rule the cap uses (see sourceAdaptedQp). It was applied to the cap
         decision and NOT to the size on screen, and that asymmetry inside one function is what
         produced the owner's 242 MB against a 390 MB file: the probe samples one source clip, not
         the finished composite, and it read 0.1019 bpp where the truth was 0.1923 - 53% of the real
         cost. The plain model would have said 0.1807, only 6% low. An estimate that can be beaten
         by the model it replaced is not an improvement, so whichever predicts the LARGER file wins.
         The measurement still leads wherever it reads HIGH, which is the case it was built for. */
      var modelled = bppForFrame(w, h, qp);
      bpp = measured
        ? Math.max(measuredBpp.bpp * Math.pow(2, (measuredBpp.qp - qp) / QP_PER_HALVING), modelled)
        : modelled;
      // Container + index, the same allowance the rate-target path already reserves.
      videoBytes = w * h * f * bpp * secs / 8 * (1 + MUX_OVERHEAD);
    }
    var audioBytes = includeAudio ? (aRate / 8 * secs) : 0;
    return {
      bytes: videoBytes + audioBytes,
      videoBytes: videoBytes, audioBytes: audioBytes, audioBitrate: aRate,
      bpp: bpp, qp: qp, baseQp: base, measured: measured,
      // `capped` now means "this export is size-targeted against your source", which is what the
      // note on screen is actually describing.
      capped: targetRate > 0 || qp > base,
      targetBitrate: targetRate,
      headroom: headroomFor(preset)
    };
  }

  function buildVideoConfig(quality, fps, aspectRatio) {
    var dim = computeExportDimensions(quality, aspectRatio);
    var f = parseInt(fps, 10) || 30;
    return {
      codec: codecCandidates(dim.w, dim.h, f)[0],   // level derived from the frame size, not fixed
      width: dim.w,
      height: dim.h,
      bitrate: dim.br,
      framerate: f,
      hardwareAcceleration: 'prefer-hardware',
      avc: { format: 'avc' }
    };
  }

  // ─── Codec Support Probe ───────────────────────────────────
  //  Walks H.264 profiles High→Main→Baseline, then VP9 fallback.

  /* Descending ladder: every candidate codec x every acceleration mode. `prefer-software` is a real
     safety net (measured working at 4K where a driver refuses hardware), so a machine without a 4K
     hardware encoder still exports instead of dying on "No supported codec found". */
  function checkCodecSupport(baseConfig, wantQuantizer) {
    var codecs = codecCandidates(baseConfig.width, baseConfig.height, baseConfig.framerate);
    var accels = ['prefer-hardware', 'no-preference', 'prefer-software'];
    /* Rate mode is the OUTER loop on purpose: we would rather have constant quality on a
       software encoder than constant bitrate on a hardware one, because the bitrate cap is what
       was visibly destroying frames. `null` = today's behaviour, and it is always the last resort,
       so a machine with no quantizer support exports exactly as it does now. */
    var modes = wantQuantizer === false ? [null] : ['quantizer', null];
    var attempts = [];
    for (var mi = 0; mi < modes.length; mi++) {
      for (var ci = 0; ci < codecs.length; ci++) {
        for (var ai = 0; ai < accels.length; ai++) attempts.push([codecs[ci], accels[ai], modes[mi]]);
      }
    }

    function tryAttempt(idx) {
      if (idx >= attempts.length) return Promise.resolve({ supported: false, config: null, codec: null, accel: null, bitrateMode: null });
      var codec = attempts[idx][0], accel = attempts[idx][1], mode = attempts[idx][2];
      var cfg = {};
      for (var k in baseConfig) cfg[k] = baseConfig[k];
      cfg.codec = codec;
      cfg.hardwareAcceleration = accel;
      if (mode) cfg.bitrateMode = mode; else delete cfg.bitrateMode;
      if (codec.indexOf('avc') === 0) cfg.avc = { format: 'avc' }; else delete cfg.avc;
      return VideoEncoder.isConfigSupported(cfg).then(function(r) {
        if (r && r.supported) return { supported: true, config: r.config || cfg, codec: codec, accel: accel, bitrateMode: mode };
        return tryAttempt(idx + 1);
      }).catch(function() {
        return tryAttempt(idx + 1);
      });
    }
    return tryAttempt(0);
  }

  // ─── Export Engine ─────────────────────────────────────────
  //
  //  opts.width, opts.height  — export pixel dimensions
  //  opts.fps                 — frame rate (default 30)
  //  opts.bitrate             — video bitrate
  //  opts.codec               — codec string (e.g. 'avc1.640028')
  //  opts.duration            — total export duration (seconds)
  //  opts.startTime           — export range start (seconds, default 0)
  //  opts.gopSize             — keyframe interval in frames (default fps*2)
  //  opts.filename            — output filename
  //  opts.renderFrame(canvas, ctx, w, h, time) — draw one frame; may return Promise
  //  opts.audioBuffer         — optional AudioBuffer to encode (from VEAudioAdvanced.renderOffline)
  //  opts.includeAudio        — boolean, whether to mux audio (default true if audioBuffer provided)
  //  opts.onProgress(pct, frame, total, eta, projectedBytes)
  //  opts.onStage(text)       — what is happening AFTER the frame loop (audio / mux / read-back)
  //  opts.onComplete(blob, stats)
  //  opts.onError(error)
  //
  //  Returns { cancel() }

  function startExport(opts) {
    if (!isSupported()) {
      if (opts.onError) opts.onError(new Error('WebCodecs or mp4-muxer not available'));
      return null;
    }

    var width       = opts.width;
    var height      = opts.height;
    var fps         = opts.fps || 30;
    var bitrate     = opts.bitrate || 10000000;
    var codec       = opts.codec || 'avc1.640028';
    var duration    = opts.duration;
    var startTime   = opts.startTime || 0;
    var gopSize     = opts.gopSize || (fps * 2);
    var filename    = opts.filename || 'export.mp4';
    var renderFrame = opts.renderFrame;
    var onProgress  = opts.onProgress || function() {};
    var onComplete  = opts.onComplete || function() {};
    var onError     = opts.onError || function() {};
    var audioBuffer = opts.audioBuffer || null;
    // A6: `audioSupported === false` means the caller probed AAC and it is not available here. Do not
    // declare a track we cannot fill; the caller reports the reason.
    var includeAudio = (audioBuffer && opts.audioSupported !== false) ? (opts.includeAudio !== false) : false;

    var totalFrames    = Math.ceil(duration * fps);
    var frameDurationUs = Math.round(1000000 / fps);
    var t0             = performance.now();
    var cancelled      = false;
    var encoder        = null;
    var muxer          = null;

    // Offscreen canvas for frame capture
    var offCanvas = document.createElement('canvas');
    offCanvas.width  = width;
    offCanvas.height = height;
    var offCtx = offCanvas.getContext('2d');

    // ── Muxer ──
    // R2: stream to disk when a disk target was prepared, else keep the old in-RAM path.
    var disk = opts.diskTarget || null;
    var target = disk ? disk.target : new Mp4Muxer.ArrayBufferTarget();
    var codecFamily = muxerFamily(codec);
    var muxerOpts = {
      target: target,
      video: { codec: codecFamily, width: width, height: height },
      fastStart: disk ? false : 'in-memory',
      firstTimestampBehavior: 'offset'
    };
    if (includeAudio) {
      muxerOpts.audio = {
        codec: 'aac',
        sampleRate: audioBuffer.sampleRate,
        numberOfChannels: Math.min(audioBuffer.numberOfChannels, 2)
      };
    }
    muxer = new Mp4Muxer.Muxer(muxerOpts);

    // ── Encoder ──
    /* Bytes actually written so far. Once the encode is running there is nothing left to estimate:
       the file's own rate is measurable, so the UI can stop showing a prediction and start showing
       a projection of the real thing. Video only, which is the honest thing to project from (audio
       is muxed at the end and is a known constant rate). */
    var videoBytes = 0, videoChunks = 0;
    encoder = new VideoEncoder({
      output: function(chunk, meta) {
        videoBytes += chunk.byteLength;
        videoChunks++;
        muxer.addVideoChunk(chunk, meta);
      },
      error: function(e) {
        // R5: without this the already-scheduled next frame ran straight into a closed encoder and
        // fired a SECOND error, so the user saw the wrong (later, more confusing) message.
        cancelled = true;
        cleanup();
        onError(e);
      }
    });

    var encCfg = {
      codec: codec,
      width: width,
      height: height,
      bitrate: bitrate,
      framerate: fps,
      // Use the acceleration mode the support probe actually accepted for THIS codec+size, not a
      // blanket 'prefer-hardware' (a 4K encode may only be available in software on some machines).
      hardwareAcceleration: opts.hardwareAcceleration || 'prefer-hardware'
    };
    if (codec.indexOf('avc') === 0) encCfg.avc = { format: 'avc' };
    /* Constant quality, when the probe found it supported. `bitrate` stays in the config because the
       spec still wants the field; in quantizer mode the encoder ignores it and follows the per-frame
       QP set below instead. When the probe fell back to null this is byte-for-byte today's path. */
    if (opts.bitrateMode) encCfg.bitrateMode = opts.bitrateMode;
    encoder.configure(encCfg);

    /* The per-frame quantizer, resolved once. `qpOpt.key` is the codec family's own option name
       (avc / av1 / hevc): both the QP SCALE and the option NAME differ by codec, and getting either
       wrong silently changes the picture rather than throwing. */
    var _presetId = opts.preset || 'standard';
    var _baseQp = PRESET_QP[_presetId] != null ? PRESET_QP[_presetId] : PRESET_QP.standard;
    // `opts.sourceBitrate` is the timeline's most demanding video source, in bits/sec, or 0/absent
    // for "do not cap". See sourceAdaptedQp: this is the only place the two ever get combined.
    // The audio track's share of the budget, resolved once and used by BOTH the encoder and the
    // live size projection, so the file and the number on screen cannot describe different files.
    var _audioRate = audioBitrateFor(_presetId, opts.sourceBitrate);
    /* The SAME measurement the dialog's estimate used, so the file and the number that promised it
       cannot be produced by two different decisions. `opts.measuredBpp` is a VESizeProbe result;
       absent, this is the model path exactly as before. */
    var _mb = opts.measuredBpp;
    var _mbUsable = _measuredFor(_mb, width, height, fps);
    /* `capIncludesAudio` is the user's INTENT, not the outcome. `includeAudio` goes false when the
       mixdown or the AAC encoder fails, and using that here made the export's quantiser differ from
       the one the dialog's estimate was computed with - the two numbers described different files. */
    var _capAudio = (opts.capIncludesAudio != null) ? !!opts.capIncludesAudio : includeAudio;
    var _useQp = effectiveQp(_presetId, width, height, fps, opts.sourceBitrate, _capAudio,
                             _mbUsable ? _mb.bpp : 0);

    /* SIZE-TARGETED MODE. When there is a measurable source the preset is a promise about size
       ("Fast = 0.6x your original"), and a quantiser cannot keep that promise - see
       targetVideoBitrate. Target the rate instead and the promise becomes arithmetic. Falls back to
       constant quality when there is nothing to be relative to. */
    var _targetRate = targetVideoBitrate(_presetId, opts.sourceBitrate, _capAudio);
    var qpOpt = (!_targetRate && opts.bitrateMode === 'quantizer')
      ? qpFor(codec, _presetId, _useQp) : null;
    /* NO QUANTISER AND NO SOURCE TO BE RELATIVE TO. This is the laptop-without-a-GPU case and it
       was the largest inflation path in the file. Measured: the software encoder does NOT support
       `bitrateMode: 'quantizer'` at ANY resolution, so on those machines constant quality is simply
       unavailable, and with no measurable source the rate target is unavailable too. The encoder
       then kept whatever `opts.bitrate` the coarse preset ladder handed it - 5 Mbps x 0.5 for a
       640x360 Fast export = 2.5 Mbps, which is 5.5x a 0.458 Mbps source.

       Aim at the rate the quantiser path WOULD have produced instead. Same model the estimate uses,
       so the three paths (quantiser, source-relative rate, and this) all target the same picture. */
    if (!_targetRate && !qpOpt) {
      var _modelRate = Math.round(width * height * fps * bppForFrame(width, height, _useQp));
      if (_modelRate > 0 && _modelRate < bitrate) {
        console.info('[VE export] no quantiser and no source: bitrate ' +
                     Math.round(bitrate / 1000) + ' -> ' + Math.round(_modelRate / 1000) +
                     ' kbps (modelled for QP' + _useQp + ')');
        bitrate = _modelRate;
        encCfg.bitrate = bitrate;
        try { encoder.configure(encCfg); }
        catch (e) { console.warn('[VE export] modelled bitrate rejected:', e && e.message); }
      }
    }

    if (_targetRate) {
      // Re-open the encoder on the rate instead of the quantiser. `variable` lets a hard shot borrow
      // from an easy one while the AVERAGE still lands on the target, which is the whole point.
      try {
        encoder.configure({
          codec: codec, width: width, height: height,
          bitrate: _targetRate, framerate: fps, bitrateMode: 'variable',
          hardwareAcceleration: opts.hardwareAcceleration || 'prefer-hardware',
          avc: (codec.indexOf('avc') === 0) ? { format: 'avc' } : undefined
        });
      } catch (e) {
        console.warn('[VE export] rate target rejected, staying on quality mode:', e && e.message);
        _targetRate = 0;
        qpOpt = (opts.bitrateMode === 'quantizer') ? qpFor(codec, _presetId, _useQp) : null;
      }
    }
    if (qpOpt) {
      console.info('[VE export] constant quality: ' + codec + ' ' + qpOpt.key + ' QP' + qpOpt.qp +
                   ' (preset ' + _presetId + ')' +
                   (_useQp > _baseQp
                     ? ' — relaxed from QP' + _baseQp + ': source carries ' +
                       (opts.sourceBitrate / 1e6).toFixed(2) + ' Mbps'
                     : ''));
    }
    if (_targetRate) {
      console.info('[VE export] size-targeted: ' + Math.round(_targetRate / 1000) + ' kbps video (' +
                   _presetId + ' = ' + headroomFor(_presetId) + 'x a ' +
                   (opts.sourceBitrate / 1e6).toFixed(2) + ' Mbps source, audio ' +
                   Math.round(_audioRate / 1000) + ' kbps)');
    }

    /* REVERTED 2026-07-26. Running the AAC encode concurrently with the video loop removed the
       31 second wait after 100%, and it also produced files with NO AUDIO on the owner's real
       project. Two encoders feeding one muxer while the video loop is mid-flight is not a trade
       worth making against a lost audio track: a slow export is an annoyance, a silent export is
       data loss. The encode is back in finalize(), and the stages after 100% now SAY what they are
       doing instead of showing a silent, finished-looking bar.

       If this is attempted again it needs a real reason for the failure first, not a retry. */

    /* What the export is doing AFTER the last frame. The bar hits 100% when the video is done, but
       the file is not: audio has to drain, the moov atom has to be written and a streamed file has
       to be read back. Reporting nothing there is what made a finished-looking export look hung. */
    function onStage(text) {
      if (opts.onStage) { try { opts.onStage(text); } catch (e) { /* reporting is best-effort */ } }
    }

    // ── Helpers ──
    function cleanup() {
      try { if (encoder && encoder.state !== 'closed') encoder.close(); } catch(e) {}
      // R2/R3: a cancelled or failed run must not leave the disk writer holding an OPFS handle.
      try { if (disk && disk.abort) disk.abort(); } catch (e) {}
      muxer = null;
      offCanvas = null;
      offCtx = null;
    }

    function finalize() {
      encoder.flush().then(function() {
        // R3: `cancel()` only ever set a flag, and finalize never looked at it. Pressing Stop while
        // the encoder was draining still muxed, still read the file back and still downloaded it.
        if (cancelled) { cleanup(); onError(new Error('Export cancelled')); return null; }
        encoder.close();

        /* The AAC track is encoded here, after the last frame. On a long project this is real time
           (measured: 611 ms per timeline minute, ~31 s for a 51 minute export), which is why the
           stage is now REPORTED - a silent 100% is what made it read as a hang. */
        onStage('Encoding audio…');
        var audioTask = includeAudio
          ? encodeAudioToMuxer(muxer, audioBuffer, _audioRate)
          : Promise.resolve();
        return audioTask.then(function(audioSkipReason) {
          if (cancelled) { cleanup(); onError(new Error('Export cancelled')); return; }
          onStage('Writing the file…');
          muxer.finalize();

          var elapsed = (performance.now() - t0) / 1000;
          var stats = function (size) {
            return {
              frames:     totalFrames,
              duration:   duration,
              fileSize:   size,
              elapsed:    elapsed,
              speed:      (duration / elapsed).toFixed(1) + 'x realtime',
              codec:      codec,
              // Which rate mode actually produced this file, so a support question can be answered
              // from a screenshot instead of a guess.
              rateMode:   _targetRate ? (Math.round(_targetRate / 1000) + ' kbps target')
                          : (opts.bitrateMode === 'quantizer' ? ('QP' + (qpOpt ? qpOpt.qp : '?')) : 'CBR'),
              resolution: width + '\u00d7' + height,
              fps:        fps,
              filename:   filename,
              // 0c: "Audio: Yes" used to be printed even when the AAC track came out empty.
              hasAudio:   includeAudio && !audioSkipReason,
              audioSkipReason: audioSkipReason || null,
              streamedToDisk: !!disk
            };
          };

          if (disk) {
            // Close the sync-access handle first, THEN read the finished file back.
            onStage('Preparing the download…');
            return disk.close().then(function () {
              return _readDiskFile(disk.name);
            }).then(function (file) {
              if (!file || !file.size) throw new Error('Export produced an empty file');
              onComplete(file, stats(file.size));
            });
          }

          var buffer = target.buffer;
          if (!buffer || !buffer.byteLength) throw new Error('Export produced an empty file');
          onComplete(new Blob([buffer], { type: 'video/mp4' }), stats(buffer.byteLength));
        });
      }).catch(function(e) {
        cleanup();
        onError(e);
      });
    }

    // ── Frame loop (non-blocking, but NOT timer-clamped) ──
    function processFrame(i) {
      if (cancelled) { cleanup(); onError(new Error('Export cancelled')); return; }
      if (i >= totalFrames) { finalize(); return; }

      var time = startTime + (i / fps);
      var result = renderFrame(offCanvas, offCtx, width, height, time);

      Promise.resolve(result).then(function() {
        // Phase 1 profiler: encode cost = VideoFrame construction + encode() (the render side is
        // measured inside _veExportRenderFrame, which knows how to split seek from composite).
        var _tEnc = performance.now();
        /* T6: this used to be `i * frameDurationUs` with frameDurationUs = round(1e6/fps). At 30 fps
           the step is stored as 33333 us when the true one is 33333.33, so the picture clock ran
           slow by a third of a microsecond per frame while the audio clock (computed from the
           sample position) stayed exact: a systematic A/V drift that grows with length - about 18 ms
           over 30 minutes, and worse at 29.97. Deriving each timestamp from the frame INDEX keeps the
           rounding error bounded at half a microsecond instead of letting it accumulate. */
        /* COPY ELIMINATION: encode from whatever surface the compositor finished on, not from a
           private canvas it was copied into.

           Measured on a real 4K export: FOUR full-frame copies per frame, 126.6 MB moved per frame,
           11.12 GB for three seconds of video. Two of those four are identity copies: since fix 1.2
           the compositor already works at export resolution, so copying its result into `offCanvas`
           at the same size does nothing but move 33 MB. `renderFrame` now reports the canvas it
           actually finished on (`opts.frameCanvas()`); when that is usable we encode straight from
           it. `offCanvas` stays as the fallback for every path that still needs a rescale. */
        var srcCanvas = offCanvas;
        if (opts.frameCanvas) {
          var cand = opts.frameCanvas();
          if (cand && cand.width === width && cand.height === height) srcCanvas = cand;
        }
        var frame = new VideoFrame(srcCanvas, {
          timestamp: Math.round(i * 1000000 / fps),
          duration: frameDurationUs
        });
        try {
          var encOpts = { keyFrame: (i % gopSize === 0) };
          if (qpOpt) encOpts[qpOpt.key] = { quantizer: qpOpt.qp };
          encoder.encode(frame, encOpts);
        } finally {
          frame.close();   // R6: never leak a GPU frame when encode() throws
        }
        if (opts.profile) opts.profile.encodeMs += performance.now() - _tEnc;

        // Progress
        var pct     = (i + 1) / totalFrames;
        var elapsed = (performance.now() - t0) / 1000;
        var eta     = elapsed / pct * (1 - pct);
        /* 5th argument: the finished size projected from the file itself, so the UI can stop showing
           a prediction once the real thing is measurable.

           Scaled by CHUNKS OUT, never by the loop's `pct`: the encoder runs behind the frame loop by
           its queue depth, so dividing by pct read the bytes of ~250 frames as if they were 288 and
           projected 6 MB for a file that finished at 7.13 MB. Audio is added at its configured
           constant rate because it is muxed at the end and would otherwise be missing from every
           projection. */
        var projected = 0;
        if (videoChunks > 0) {
          projected = videoBytes / videoChunks * totalFrames;
          if (includeAudio) projected += _audioRate / 8 * duration;
        }
        onProgress(pct, i + 1, totalFrames, eta, projected);

        // Backpressure. 0c: a stalled encoder used to wait on 'dequeue' forever with a frozen ETA
        // and no way to tell a slow machine from a dead pipeline. Give the wait a deadline and fail
        // with a real message instead of hanging.
        if (encoder.encodeQueueSize > 5) {
          var settled = false;
          var stallTimer = null;
          var onDeq = function() {
            if (settled) return; settled = true;
            clearTimeout(stallTimer);
            encoder.removeEventListener('dequeue', onDeq);
            _yield(function() { processFrame(i + 1); });
          };
          encoder.addEventListener('dequeue', onDeq);
          // A stalled encoder is a real failure mode, so this deadline stays a TIMER on purpose:
          // it must fire on wall-clock time even if the task queue is saturated.
          stallTimer = setTimeout(function() {
            if (settled) return; settled = true;
            encoder.removeEventListener('dequeue', onDeq);
            cleanup();
            onError(new Error('Encoder stalled at frame ' + (i + 1) + '/' + totalFrames + ' (queue ' + encoder.encodeQueueSize + ')'));
          }, 30000);
        } else {
          _yield(function() { processFrame(i + 1); });
        }
      }).catch(function(e) {
        cleanup();
        onError(e);
      });
    }

    // ── Start ──
    processFrame(0);

    return {
      cancel: function() { cancelled = true; }
    };
  }

  // ─── Audio Support ──────────────────────────────────────

  /**
   * Encode an AudioBuffer into the muxer using AudioEncoder (AAC).
   * Falls back gracefully if AudioEncoder is not available.
   *
   * Returns a Promise that resolves when all audio chunks are muxed.
   */
  /* 0c: this used to resolve() on every failure path, so a file with a DECLARED but empty AAC track
     still reported "Audio: Yes". It now resolves with a reason string ('' = audio really was encoded)
     and the caller decides what to tell the user. */
  function encodeAudioToMuxer(muxer, audioBuffer, audioBitrate) {
    if (typeof AudioEncoder === 'undefined') {
      return Promise.resolve('AudioEncoder unavailable in this browser');
    }

    return new Promise(function(resolve, reject) {
      var sampleRate = audioBuffer.sampleRate;
      var channels   = audioBuffer.numberOfChannels;

      var audioEncoder = new AudioEncoder({
        output: function(chunk, meta) {
          muxer.addAudioChunk(chunk, meta);
        },
        error: function(e) {
          // Non-fatal for the video, but no longer silent.
          try { audioEncoder.close(); } catch(_) {}
          resolve('audio encoder error: ' + ((e && e.message) || 'unknown'));
        }
      });

      var audioConfig = {
        codec: 'mp4a.40.2',     // AAC-LC
        sampleRate: sampleRate,
        numberOfChannels: Math.min(channels, 2),
        bitrate: audioBitrate || AUDIO_BITRATE
      };

      // Check support before configuring
      AudioEncoder.isConfigSupported(audioConfig).then(function(result) {
        if (!result.supported) { resolve('AAC not supported at ' + sampleRate + ' Hz'); return; }

        audioEncoder.configure(audioConfig);

        // Convert AudioBuffer → AudioData chunks (each ~1024 samples)
        var chunkSize = 1024;
        var totalSamples = audioBuffer.length;
        var outChannels = Math.min(channels, 2);

        // Build planar channel arrays (f32-planar = ch0 data then ch1 data)
        var channelArrays = [];
        for (var ch = 0; ch < outChannels; ch++) {
          channelArrays.push(audioBuffer.getChannelData(ch));
        }

        /* A7: this used to push EVERY chunk in one synchronous while-loop. A 10 minute mixdown is
           about 28,000 AudioData objects submitted before the encoder drains one, which pins the main
           thread for seconds and lets the encoder's queue grow without bound (the video path has had
           back-pressure since day one; the audio path never did). Same discipline here: submit,
           yield, and wait for 'dequeue' when the queue gets deep. */
        var processedSamples = 0;

        function pumpAudio() {
          if (processedSamples >= totalSamples) {
            audioEncoder.flush().then(function() {
              audioEncoder.close();
              resolve();
            })['catch'](function(e) {
              try { audioEncoder.close(); } catch(_) {}
              // 0c: this used to resolve() with no reason, which the caller reads as "audio encoded
              // fine". A failed flush means the tail of the audio is missing.
              resolve('audio flush failed: ' + ((e && e.message) || 'unknown'));
            });
            return;
          }

          var budget = 64;   // chunks per turn: enough to stay ahead, short enough not to block
          while (processedSamples < totalSamples && budget-- > 0) {
            var remaining = totalSamples - processedSamples;
            var thisChunkSize = Math.min(chunkSize, remaining);

            // Planar layout: [ch0 samples][ch1 samples]
            var planar = new Float32Array(thisChunkSize * outChannels);
            for (var ch = 0; ch < outChannels; ch++) {
              var src = channelArrays[ch];
              var offset = ch * thisChunkSize;
              for (var s = 0; s < thisChunkSize; s++) {
                planar[offset + s] = src[processedSamples + s];
              }
            }

            var audioData = new AudioData({
              format: 'f32-planar',
              sampleRate: sampleRate,
              numberOfFrames: thisChunkSize,
              numberOfChannels: outChannels,
              timestamp: Math.round(processedSamples / sampleRate * 1000000),
              data: planar
            });

            audioEncoder.encode(audioData);
            audioData.close();
            processedSamples += thisChunkSize;

            if (audioEncoder.encodeQueueSize > 32) break;
          }

          if (audioEncoder.encodeQueueSize > 32) {
            var settled = false;
            var onDeq = function () {
              if (settled) return; settled = true;
              audioEncoder.removeEventListener('dequeue', onDeq);
              _yield(pumpAudio);
            };
            audioEncoder.addEventListener('dequeue', onDeq);
            // Deadline so a wedged audio encoder cannot hang the export forever.
            setTimeout(function () {
              if (settled) return; settled = true;
              audioEncoder.removeEventListener('dequeue', onDeq);
              _yield(pumpAudio);
            }, 5000);
          } else {
            _yield(pumpAudio);
          }
        }

        pumpAudio();
      }).catch(function() {
        resolve(); // AAC not supported — skip
      });
    });
  }

  // ─── Download Helper ───────────────────────────────────────

  function downloadBlob(blob, filename) {
    var name = filename || 'export.mp4';
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    /* R9: a fixed 60 s timer is a guess about how long the browser needs to read the blob, and a 4K
       export is exactly the case where the guess is wrong (revoking early aborts the download with
       no message). Release when the page gets focus back - i.e. the save dialog is done - and keep a
       long timer only as the backstop for a browser that never fires focus.

       The focus release now also waits out a grace period. Alt-tabbing away DURING a long export and
       coming back fires focus while the browser may still be streaming a few hundred MB out of the
       blob, and revoking underneath that is the same class of bug as deleting the OPFS file was. */
    var clickedAt = Date.now();
    var released = false;
    var release = function () {
      if (released) return; released = true;
      window.removeEventListener('focus', onFocus);
      URL.revokeObjectURL(url);
    };
    var onFocus = function () {
      var wait = Math.max(2000, 30000 - (Date.now() - clickedAt));
      setTimeout(release, wait);
    };
    window.addEventListener('focus', onFocus);
    setTimeout(release, 600000);
  }

  // ─── Public API ────────────────────────────────────────────

  window.VEWebCodecsExport = {
    isSupported:             isSupported,
    getSupport:              getSupport,
    checkCodecSupport:       checkCodecSupport,
    buildVideoConfig:        buildVideoConfig,
    computeExportDimensions: computeExportDimensions,
    codecCandidates:         codecCandidates,
    h264LevelFor:            h264LevelFor,
    createDiskTarget:        createDiskTarget,
    probeAudioSupport:       probeAudioSupport,
    // The ONE yield. Exported because the size probe runs the same kind of loop and reached for
    // setTimeout(fn, 0), which is vsync-clamped in a visible tab and throttled to 1 Hz in a hidden
    // one: a 120-frame probe took two minutes in a background tab. See _yield.
    yieldSoon:               _yield,
    PRESET_QP:               PRESET_QP,
    EXPORT_PLATFORMS:        EXPORT_PLATFORMS,
    platformAdvice:          platformAdvice,
    qpFor:                   qpFor,
    bppForFrame:             bppForFrame,
    effectiveQp:             effectiveQp,
    SOURCE_HEADROOM:         SOURCE_HEADROOM,
    headroomFor:             headroomFor,
    headroomPhrase:          headroomPhrase,
    audioBitrateFor:         audioBitrateFor,
    QP_SOURCE_CEILING:       QP_SOURCE_CEILING,
    QP_PER_HALVING:          QP_PER_HALVING,
    estimateQualitySize:     estimateQualitySize,
    startExport:             startExport,
    encodeAudioToMuxer:      encodeAudioToMuxer,
    downloadBlob:            downloadBlob,
    PRESETS:                 PRESETS
  };
})();

// Modular skeleton hook (Faz 8) — ve-webcodecs-export is now a video loader module (modules/video/). Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-webcodecs-export', parent: 'video', title: 've-webcodecs-export', mount: function () {}, unmount: function () {} });
