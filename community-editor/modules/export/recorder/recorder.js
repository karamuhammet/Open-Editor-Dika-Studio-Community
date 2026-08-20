/* ══════════════════════════════════════════════════════════════
   RECORDER — Screen, Camera, Audio & Screen+Camera Recording
   Chrome MediaRecorder API. Records to WebM, auto-imports to
   VE tracks & gallery.
   ════════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  // ── State ───────────────────────────────────────────────────
  var _rec = null;           // MediaRecorder instance
  var _chunks = [];
  var _stream = null;        // primary stream (screen or mic/cam)
  var _camStream = null;     // secondary camera stream (screen+camera mode)
  var _mode = null;          // 'audio' | 'camera' | 'screen' | 'screen-camera'
  var _startTime = 0;
  var _pausedTotal = 0;      // cumulative ms spent paused
  var _pauseStart = 0;       // timestamp when pause began
  var _timerIv = null;
  var _overlay = null;
  var _cleanupFn = null;     // extra cleanup for screen+camera compositing

  // Audio mixer state
  var _audioCtx = null;
  var _audioDest = null;
  var _audioNodes = [];      // sources + gain nodes to disconnect later

  // ── Helpers ─────────────────────────────────────────────────

  function _icon(name, sz) {
    return typeof getIcon === 'function' ? getIcon(name, sz || 18) : '';
  }

  function _toast(msg, type) {
    if (typeof showToast === 'function') showToast(msg, type);
  }

  function _fmt(sec) {
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function _genKey() {
    return 'rec_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function _pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function _supported() {
    return !!(navigator.mediaDevices && typeof MediaRecorder !== 'undefined');
  }

  // Build getDisplayMedia constraints.
  // preferCurrentTab:false → don't auto-select current tab.
  // surfaceSwitching:'include' → allow surface change mid-capture.
  // monitorTypeSurfaces:'include' → ensure full-screen option visible.
  function _displayOpts() {
    return {
      video: { cursor: 'always', frameRate: { ideal: 30 } },
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      preferCurrentTab: false,
      surfaceSwitching: 'include',
      monitorTypeSurfaces: 'include'
    };
  }

  // Pre-check permission via Permissions API. Returns 'granted'|'prompt'|'denied'|'unknown'.
  function _checkPerm(name) {
    if (navigator.permissions && navigator.permissions.query) {
      return navigator.permissions.query({ name: name }).then(function(r) {
        return r.state;
      }).catch(function() { return 'unknown'; });
    }
    return Promise.resolve('unknown');
  }

  // Brief overlay that creates a fresh user-gesture for getDisplayMedia.
  // Without this Chrome throttles the screen picker 5-10 seconds due to
  // transient activation expiry after the previous permission dialog.
  function _promptScreenPick(cb, onCancel) {
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:10200;background:rgba(0,0,0,0.55);' +
      'display:flex;align-items:center;justify-content:center;';

    var box = document.createElement('div');
    box.style.cssText = 'padding:24px 36px;background:var(--surface,#131316);' +
      'border:1px solid var(--border2,#35353c);border-radius:14px;text-align:center;' +
      'box-shadow:0 12px 48px rgba(0,0,0,0.6);';
    box.innerHTML =
      '<div style="color:var(--gold,#f2ff58);font-size:14px;font-weight:600;margin-bottom:12px;">' +
      _icon('check-circle', 18) + ' Mic / Camera ready</div>' +
      '<button id="rec-pick-screen-btn" style="padding:10px 28px;background:var(--gold,#f2ff58);' +
      'color:#0b0b0d;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;' +
      'transition:transform 0.1s;">' + _icon('monitor', 16) + '  Select Screen</button>' +
      '<div style="color:var(--text-dim,#888);font-size:11px;margin-top:10px;">or press Escape to cancel</div>';
    ov.appendChild(box);

    var done = false;
    function finish(action) {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey, true);
      if (ov.parentNode) ov.parentNode.removeChild(ov);
      if (action === 'pick') cb();
      else if (onCancel) onCancel();
    }

    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); finish('cancel'); }
    }
    document.addEventListener('keydown', onKey, true);

    document.body.appendChild(ov);

    var btn = document.getElementById('rec-pick-screen-btn');
    if (btn) {
      btn.addEventListener('click', function(e) { e.stopPropagation(); finish('pick'); });
      // Auto-focus so Enter also works
      btn.focus();
    }
    // Clicking overlay background = cancel
    ov.addEventListener('click', function(e) {
      if (e.target === ov) finish('cancel');
    });
  }

  function _mime(audioOnly) {
    if (audioOnly) {
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
      if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
      return '';
    }
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) return 'video/webm;codecs=vp9,opus';
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) return 'video/webm;codecs=vp8,opus';
    if (MediaRecorder.isTypeSupported('video/webm')) return 'video/webm';
    return '';
  }

  function _modeLabel(m) {
    switch (m) {
      case 'audio': return 'Audio';
      case 'camera': return 'Camera';
      case 'screen': return 'Screen';
      case 'screen-camera': return 'Screen + Camera';
      default: return 'Recording';
    }
  }

  // ── Audio Mixer ─────────────────────────────────────────────
  // Mixes N audio streams into 1 track via Web Audio API.
  // Each source gets a GainNode at 1/N to prevent clipping.

  function _mixAudio(streams) {
    var withAudio = [];
    for (var i = 0; i < streams.length; i++) {
      if (streams[i] && streams[i].getAudioTracks().length > 0) {
        withAudio.push(streams[i]);
      }
    }
    if (withAudio.length === 0) return null;
    if (withAudio.length === 1) return withAudio[0].getAudioTracks()[0];

    try {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      _audioDest = _audioCtx.createMediaStreamDestination();
      _audioNodes = [];
      var g = 1.0 / withAudio.length;
      for (var j = 0; j < withAudio.length; j++) {
        var src = _audioCtx.createMediaStreamSource(withAudio[j]);
        var gain = _audioCtx.createGain();
        gain.gain.value = g;
        src.connect(gain);
        gain.connect(_audioDest);
        _audioNodes.push(src, gain);
      }
      return _audioDest.stream.getAudioTracks()[0];
    } catch (e) {
      return withAudio[0].getAudioTracks()[0];
    }
  }

  function _cleanupAudio() {
    _audioNodes.forEach(function(n) { try { n.disconnect(); } catch (_) {} });
    _audioNodes = [];
    if (_audioCtx) { try { _audioCtx.close(); } catch (_) {} _audioCtx = null; _audioDest = null; }
  }

  // ══════════════════════════════════════════════════════════════
  //  RECORDING MODES
  // ══════════════════════════════════════════════════════════════

  // ── Audio (mic only) ────────────────────────────────────────

  function _startAudio() {
    if (!_supported()) { _toast('Recording not supported', 'error'); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function(s) {
      if (!s || !s.getAudioTracks().length) { _toast('No audio track', 'error'); return; }
      _mode = 'audio';
      _stream = s;
      _begin(s, true);
    }).catch(function(e) { _toast('Mic denied: ' + (e.message || e), 'error'); });
  }

  // ── Camera (webcam + mic) ───────────────────────────────────

  function _startCamera() {
    if (!_supported()) { _toast('Recording not supported', 'error'); return; }
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(function(s) {
      if (!s || !s.getVideoTracks().length) {
        if (s) s.getTracks().forEach(function(t) { t.stop(); });
        _toast('No camera', 'error'); return;
      }
      _mode = 'camera';
      _stream = s;
      _begin(s, false);
    }).catch(function(e) { _toast('Camera denied: ' + (e.message || e), 'error'); });
  }

  // ── Screen (+ mic) ─────────────────────────────────────────
  // Mic permission FIRST, screen picker SECOND.
  // If mic already granted → no dialog → screen picker fires instantly.
  // If mic dialog was shown → fresh click via _promptScreenPick → instant picker.

  function _startScreen() {
    if (!_supported() || !navigator.mediaDevices.getDisplayMedia) {
      _toast('Screen recording not supported', 'error'); return;
    }

    function doScreenPick(micStream) {
      navigator.mediaDevices.getDisplayMedia(_displayOpts()).then(function(screenStream) {
        if (!screenStream || !screenStream.getVideoTracks().length) {
          if (micStream) micStream.getTracks().forEach(function(t) { t.stop(); });
          _toast('No screen track', 'error'); return;
        }
        screenStream.getVideoTracks()[0].addEventListener('ended', function() {
          if (_rec && _rec.state !== 'inactive') _stop();
        });
        if (micStream) {
          var mixed = _mixAudio([micStream, screenStream]);
          var tracks = screenStream.getVideoTracks().slice();
          if (mixed) tracks.push(mixed);
          var combined = new MediaStream(tracks);
          _mode = 'screen';
          _stream = screenStream;
          _camStream = micStream;
          _begin(combined, false);
        } else {
          _mode = 'screen';
          _stream = screenStream;
          _begin(screenStream, false);
        }
      }).catch(function() {
        if (micStream) micStream.getTracks().forEach(function(t) { t.stop(); });
        _toast('Screen share cancelled', 'warning');
      });
    }

    _checkPerm('microphone').then(function(state) {
      var wasGranted = state === 'granted';

      navigator.mediaDevices.getUserMedia({ audio: true }).then(function(micStream) {
        if (wasGranted) {
          // Mic was already granted — no dialog shown — user activation still valid
          doScreenPick(micStream);
        } else {
          // Mic dialog was shown — user activation expired — need fresh click
          _promptScreenPick(
            function() { doScreenPick(micStream); },
            function() { micStream.getTracks().forEach(function(t) { t.stop(); }); }
          );
        }
      }).catch(function() {
        // Mic denied — screen only (getDisplayMedia is still in original activation for denied case)
        doScreenPick(null);
      });
    });
  }

  // ── Screen + Camera (PiP composite) ────────────────────────
  // Camera+mic FIRST, screen picker SECOND.
  // Same permission-check + fresh-click pattern as _startScreen.

  function _startScreenCamera() {
    if (!_supported() || !navigator.mediaDevices.getDisplayMedia) {
      _toast('Screen recording not supported', 'error'); return;
    }

    function doScreenPick(camStream) {
      navigator.mediaDevices.getDisplayMedia(_displayOpts()).then(function(screenStream) {
        if (!screenStream || !screenStream.getVideoTracks().length) {
          camStream.getTracks().forEach(function(t) { t.stop(); });
          _toast('No screen track', 'error'); return;
        }
        // Compositing canvas — screen full + camera circle PiP
        var screenTrack = screenStream.getVideoTracks()[0];
        var settings = screenTrack.getSettings();
        var sw = settings.width || 1920;
        var sh = settings.height || 1080;

        var cvs = document.createElement('canvas');
        cvs.width = sw; cvs.height = sh;
        var ctx = cvs.getContext('2d');

        // Hidden video elements — on-screen but invisible so Chrome doesn't throttle decoding
        var css = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:-1;';
        var screenVid = document.createElement('video');
        screenVid.srcObject = screenStream; screenVid.muted = true; screenVid.playsInline = true;
        screenVid.style.cssText = css; document.body.appendChild(screenVid);

        var camVid = document.createElement('video');
        camVid.srcObject = camStream; camVid.muted = true; camVid.playsInline = true;
        camVid.style.cssText = css; document.body.appendChild(camVid);

        var camW = Math.round(sw * 0.2);
        var camH = Math.round(sh * 0.2);
        var animId;

        function draw() {
          ctx.drawImage(screenVid, 0, 0, sw, sh);
          ctx.save();
          var cx = sw - camW - 20, cy = sh - camH - 20;
          var r = Math.min(camW, camH) / 2;
          ctx.beginPath();
          ctx.arc(cx + camW / 2, cy + camH / 2, r, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(camVid, cx, cy, camW, camH);
          ctx.restore();
          ctx.strokeStyle = 'rgba(242, 255, 88,0.5)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx + camW / 2, cy + camH / 2, r, 0, Math.PI * 2);
          ctx.stroke();
          animId = requestAnimationFrame(draw);
        }

        function cleanup() {
          cancelAnimationFrame(animId);
          screenVid.pause(); camVid.pause();
          screenVid.srcObject = null; camVid.srcObject = null;
          if (screenVid.parentNode) screenVid.parentNode.removeChild(screenVid);
          if (camVid.parentNode) camVid.parentNode.removeChild(camVid);
        }

        Promise.all([screenVid.play(), camVid.play()]).then(function() {
          draw();
          var canvasTrack = cvs.captureStream(30).getVideoTracks()[0];
          var mixed = _mixAudio([camStream, screenStream]);
          var finalTracks = [canvasTrack];
          if (mixed) finalTracks.push(mixed);
          var recordStream = new MediaStream(finalTracks);

          _mode = 'screen-camera';
          _stream = screenStream;
          _camStream = camStream;

          screenTrack.addEventListener('ended', function() {
            cleanup();
            if (_rec && _rec.state !== 'inactive') _stop();
          });

          _begin(recordStream, false, cleanup);
        }).catch(function(err) {
          cleanup();
          screenStream.getTracks().forEach(function(t) { t.stop(); });
          camStream.getTracks().forEach(function(t) { t.stop(); });
          _toast('Failed to start: ' + (err.message || err), 'error');
        });

      }).catch(function() {
        camStream.getTracks().forEach(function(t) { t.stop(); });
        _toast('Screen share cancelled', 'warning');
      });
    }

    // Check if camera+mic already granted
    Promise.all([_checkPerm('camera'), _checkPerm('microphone')]).then(function(results) {
      var allGranted = results[0] === 'granted' && results[1] === 'granted';

      navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(function(camStream) {
        if (allGranted) {
          // Both already granted — no dialog — user activation still valid
          doScreenPick(camStream);
        } else {
          // Dialog was shown — need fresh click for getDisplayMedia
          _promptScreenPick(
            function() { doScreenPick(camStream); },
            function() { camStream.getTracks().forEach(function(t) { t.stop(); }); }
          );
        }
      }).catch(function(err) {
        _toast('Camera/mic denied: ' + (err.message || err), 'error');
      });
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  CORE ENGINE
  // ══════════════════════════════════════════════════════════════

  function _begin(stream, audioOnly, extraCleanup) {
    if (!stream || !stream.getTracks().length) {
      _toast('No media tracks', 'error'); _cleanup(); return;
    }
    _chunks = [];
    _cleanupFn = extraCleanup || null;
    var mime = _mime(audioOnly);
    var opts = {};
    if (mime) opts.mimeType = mime;
    if (!audioOnly) opts.videoBitsPerSecond = 4000000;

    try { _rec = new MediaRecorder(stream, opts); }
    catch (e) { _toast('Cannot start: ' + e.message, 'error'); _cleanup(); return; }

    _rec.ondataavailable = function(e) {
      if (e.data && e.data.size > 0) _chunks.push(e.data);
    };

    var capturedMode = _mode;
    _rec.onstop = function() {
      var blob = new Blob(_chunks, { type: audioOnly ? 'audio/webm' : 'video/webm' });
      _chunks = [];
      if (_cleanupFn) { _cleanupFn(); _cleanupFn = null; }
      _cleanup();
      _handleResult(blob, audioOnly, capturedMode);
    };

    _rec.onerror = function(e) {
      _toast('Recording error: ' + (e.error ? e.error.message : 'unknown'), 'error');
      _cleanup();
    };

    _rec.start(1000);
    _startTime = Date.now();
    _pausedTotal = 0;
    _pauseStart = 0;
    _showOverlay(audioOnly);
    _toast('Recording started — ' + _modeLabel(_mode), 'success');
  }

  function _stop() {
    if (_rec && _rec.state !== 'inactive') _rec.stop();
  }

  function _pause() {
    if (_rec && _rec.state === 'recording') {
      _rec.pause();
      _pauseStart = Date.now();
      _updateOverlay('paused');
    }
  }

  function _resume() {
    if (_rec && _rec.state === 'paused') {
      _rec.resume();
      if (_pauseStart) _pausedTotal += Date.now() - _pauseStart;
      _pauseStart = 0;
      _updateOverlay('recording');
    }
  }

  function _cleanup() {
    if (_timerIv) { clearInterval(_timerIv); _timerIv = null; }
    _cleanupAudio();
    if (_stream) { _stream.getTracks().forEach(function(t) { t.stop(); }); _stream = null; }
    if (_camStream) { _camStream.getTracks().forEach(function(t) { t.stop(); }); _camStream = null; }
    _rec = null;
    _mode = null;
    _removeOverlay();
  }

  // ══════════════════════════════════════════════════════════════
  //  OVERLAY UI
  // ══════════════════════════════════════════════════════════════

  function _showOverlay(audioOnly) {
    _removeOverlay();
    // Inject pulse keyframe once
    if (!document.getElementById('rec-pulse-css')) {
      var st = document.createElement('style');
      st.id = 'rec-pulse-css';
      st.textContent = '@keyframes rec-pulse{0%,100%{opacity:1}50%{opacity:0.3}}';
      document.head.appendChild(st);
    }

    var ov = document.createElement('div');
    ov.id = 'rec-overlay';
    ov.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:10100;' +
      'display:flex;align-items:center;gap:10px;padding:8px 16px;' +
      'background:var(--surface,#131316);border:1px solid var(--border2,#35353c);' +
      'border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.6);color:var(--text,#ededf0);' +
      'font-family:"DM Sans",sans-serif;';

    // Red dot
    var dot = document.createElement('span');
    dot.className = 'rec-dot';
    dot.style.cssText = 'width:10px;height:10px;border-radius:50%;background:#e53e3e;flex-shrink:0;animation:rec-pulse 1.2s ease-in-out infinite;';
    ov.appendChild(dot);

    // Mode label
    var lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:12px;font-weight:600;color:var(--gold,#f2ff58);';
    lbl.textContent = _modeLabel(_mode);
    ov.appendChild(lbl);

    // Timer
    var tmr = document.createElement('span');
    tmr.id = 'rec-timer';
    tmr.style.cssText = 'font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;min-width:48px;';
    tmr.textContent = '00:00';
    ov.appendChild(tmr);

    // Pause/resume button
    var pauseBtn = document.createElement('button');
    pauseBtn.id = 'rec-pause-btn';
    pauseBtn.style.cssText = 'width:30px;height:30px;border-radius:8px;background:var(--surface2,#1b1b1f);' +
      'border:1px solid var(--border,#27272d);color:var(--text,#ededf0);cursor:pointer;' +
      'display:flex;align-items:center;justify-content:center;transition:all 0.12s;';
    pauseBtn.innerHTML = _icon('pause', 14);
    pauseBtn.title = 'Pause / Resume';
    pauseBtn.addEventListener('click', function() {
      if (_rec && _rec.state === 'recording') {
        _pause();
        pauseBtn.innerHTML = _icon('play', 14);
      } else if (_rec && _rec.state === 'paused') {
        _resume();
        pauseBtn.innerHTML = _icon('pause', 14);
      }
    });
    ov.appendChild(pauseBtn);

    // Stop button
    var stopBtn = document.createElement('button');
    stopBtn.style.cssText = 'width:30px;height:30px;border-radius:8px;background:#e53e3e;border:none;' +
      'color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.12s;';
    stopBtn.innerHTML = _icon('square', 14);
    stopBtn.title = 'Stop Recording';
    stopBtn.addEventListener('click', _stop);
    ov.appendChild(stopBtn);

    document.body.appendChild(ov);
    _overlay = ov;

    // Timer interval — accounts for paused time
    _timerIv = setInterval(function() {
      var el = document.getElementById('rec-timer');
      if (el && _rec && _rec.state !== 'inactive') {
        var pNow = _pauseStart ? (Date.now() - _pauseStart) : 0;
        var elapsed = (Date.now() - _startTime - _pausedTotal - pNow) / 1000;
        if (elapsed < 0) elapsed = 0;
        el.textContent = _fmt(elapsed);
      }
    }, 500);
  }

  function _updateOverlay(state) {
    var dot = _overlay ? _overlay.querySelector('.rec-dot') : null;
    if (!dot) return;
    if (state === 'paused') {
      dot.style.background = '#f59e0b';
      dot.style.animation = 'none';
    } else {
      dot.style.background = '#e53e3e';
      dot.style.animation = 'rec-pulse 1.2s ease-in-out infinite';
    }
  }

  function _removeOverlay() {
    if (_overlay && _overlay.parentNode) _overlay.parentNode.removeChild(_overlay);
    _overlay = null;
  }

  // ══════════════════════════════════════════════════════════════
  //  RESULT HANDLING
  // ══════════════════════════════════════════════════════════════

  function _handleResult(blob, audioOnly, capturedMode) {
    var now = new Date();
    var ds = now.getFullYear() + '-' + _pad2(now.getMonth() + 1) + '-' + _pad2(now.getDate()) +
      '_' + _pad2(now.getHours()) + '-' + _pad2(now.getMinutes()) + '-' + _pad2(now.getSeconds());
    var name = (_modeLabel(capturedMode) + '_' + ds + '.webm').replace(/\s+/g, '_');
    var url = URL.createObjectURL(blob);

    if (audioOnly) _saveAudio(blob, url, name);
    else _saveVideo(blob, url, name);
  }

  // ── Save Audio ──────────────────────────────────────────────

  function _saveAudio(blob, url, name) {
    var audio = document.createElement('audio');
    audio.preload = 'metadata';
    var done = false;

    function finish() {
      if (done) return;
      var dur = (audio.duration && isFinite(audio.duration)) ? audio.duration : 0;
      if (!isFinite(audio.duration) || audio.duration === 0) return; // wait
      done = true;

      var idbKey = _genKey();
      if (typeof _galIDBPut === 'function') _galIDBPut(idbKey, blob);

      // Gallery
      if (typeof _galInit === 'function') {
        var st = _galInit();
        if (!st.recent) st.recent = [];
        st.recent.unshift({
          type: 'audio', url: url, provider: 'recording', author: 'You',
          tags: 'recorded', duration: dur, idbKey: idbKey, _addedAt: Date.now()
        });
        if (typeof _galSave === 'function') _galSave(st);
      }

      // VE track import
      if (typeof VideoEditor !== 'undefined' && VideoEditor.isActive && VideoEditor.isActive()) {
        VideoEditor.importMediaFile(new File([blob], name, { type: blob.type }), dur);
      }

      _toast('Audio saved (' + _fmt(dur) + ')', 'success');
      if (typeof _refreshGalleryView === 'function') try { _refreshGalleryView(null); } catch (_) {}
    }

    audio.addEventListener('loadedmetadata', finish);
    audio.addEventListener('durationchange', finish);
    // Fallback — WebM often reports Infinity initially
    setTimeout(function() {
      if (!done) {
        done = true;
        var dur = (audio.duration && isFinite(audio.duration)) ? audio.duration : 0;
        var idbKey = _genKey();
        if (typeof _galIDBPut === 'function') _galIDBPut(idbKey, blob);
        if (typeof _galInit === 'function') {
          var st = _galInit();
          if (!st.recent) st.recent = [];
          st.recent.unshift({ type: 'audio', url: url, provider: 'recording', author: 'You',
            tags: 'recorded', duration: dur, idbKey: idbKey, _addedAt: Date.now() });
          if (typeof _galSave === 'function') _galSave(st);
        }
        if (typeof VideoEditor !== 'undefined' && VideoEditor.isActive && VideoEditor.isActive()) {
          VideoEditor.importMediaFile(new File([blob], name, { type: blob.type }), dur);
        }
        _toast('Audio saved', 'success');
        if (typeof _refreshGalleryView === 'function') try { _refreshGalleryView(null); } catch (_) {}
      }
    }, 3000);
    audio.src = url;
  }

  // ── Save Video ──────────────────────────────────────────────

  function _saveVideo(blob, url, name) {
    var vid = document.createElement('video');
    vid.preload = 'auto';
    vid.muted = true;
    vid.playsInline = true;
    vid.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(vid);
    var done = false;

    function finish() {
      if (done) return;
      var dur = (vid.duration && isFinite(vid.duration)) ? vid.duration : 0;
      if (!isFinite(vid.duration)) return; // wait for real value
      done = true;

      // Poster frame
      var vw = vid.videoWidth || 640, vh = vid.videoHeight || 360;
      var oc = document.createElement('canvas');
      oc.width = vw; oc.height = vh;
      var octx = oc.getContext('2d');
      octx.drawImage(vid, 0, 0, vw, vh);
      var poster = oc.toDataURL('image/jpeg', 0.8);

      // IDB
      var idbKey = _genKey();
      if (typeof _galIDBPut === 'function') _galIDBPut(idbKey, blob);

      // Gallery
      if (typeof _saveVideoToGallery === 'function') {
        _saveVideoToGallery(poster, url, name, idbKey, dur);
      }

      // VE track import
      if (typeof VideoEditor !== 'undefined' && VideoEditor.isActive && VideoEditor.isActive()) {
        VideoEditor.importMediaFile(new File([blob], name, { type: blob.type }), dur);
      }

      _toast('Video saved (' + _fmt(dur) + ')', 'success');
      vid.pause();
      try { vid.src = ''; } catch (_) {}
      if (vid.parentNode) vid.parentNode.removeChild(vid);
    }

    vid.addEventListener('loadeddata', finish);
    vid.addEventListener('durationchange', finish);

    // Fallback — 5s timeout for WebM Infinity duration
    setTimeout(function() {
      if (!done) {
        done = true;
        var dur = 0;
        var vw = vid.videoWidth || 640, vh = vid.videoHeight || 360;
        var oc = document.createElement('canvas');
        oc.width = vw; oc.height = vh;
        try { oc.getContext('2d').drawImage(vid, 0, 0, vw, vh); } catch (_) {}
        var poster = oc.toDataURL('image/jpeg', 0.8);
        var idbKey = _genKey();
        if (typeof _galIDBPut === 'function') _galIDBPut(idbKey, blob);
        if (typeof _saveVideoToGallery === 'function') _saveVideoToGallery(poster, url, name, idbKey, dur);
        if (typeof VideoEditor !== 'undefined' && VideoEditor.isActive && VideoEditor.isActive()) {
          VideoEditor.importMediaFile(new File([blob], name, { type: blob.type }), dur);
        }
        _toast('Video saved', 'success');
        vid.pause();
        try { vid.src = ''; } catch (_) {}
        if (vid.parentNode) vid.parentNode.removeChild(vid);
      }
    }, 5000);

    vid.addEventListener('error', function() {
      _toast('Failed to process recording', 'error');
      if (vid.parentNode) vid.parentNode.removeChild(vid);
    });

    vid.src = url;
  }

  // ══════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ══════════════════════════════════════════════════════════════

  window.DikaRecorder = {
    startAudio: _startAudio,
    startCamera: _startCamera,
    startScreen: _startScreen,
    startScreenCamera: _startScreenCamera,
    stop: _stop,
    pause: _pause,
    resume: _resume,
    isActive: function() { return !!(_rec && _rec.state !== 'inactive'); },
    supported: _supported
  };

})();

// Modular skeleton hook (Faz 8) — recorder is now an export loader module (modules/export/).
if (window.cc && cc.modules) cc.modules.register({ id: 'recorder', parent: 'export', title: 'Recorder', mount: function () {}, unmount: function () {} });
