/* VE Camera Recorder — put a camera on a tripod, hit record, get a clip on the timeline.
   R0: module skeleton + panel shell.

   DELIBERATELY SEPARATE from the multicam monitor (owner: "cam monitor ile birleştirme").
   No shared state with it. The recorder PRODUCES clips; multicam CONSUMES clips. They meet on
   the timeline and nowhere else.

   Scope is a single local camera. Not multi-camera capture: no browser product was found that
   records 3-4 independent local cameras to separate files (the ones taking several local
   cameras are live switchers, not recorders). Not an OBS rival either: Loom's own engineers
   hit browser CPU/quality ceilings past 720p/1080p and shipped a native app instead.

   Plan + evidence: docs/camera-recorder-plan.md */
(function () {
  'use strict';

  var _p = null;
  var _open = false;
  var _stream = null;      // live preview stream
  var _devices = { video: [], audio: [] };
  var _sel = { video: '', audio: '', w: 1280, h: 720, fps: 30 };
  var _granted = false;
  var _busy = false;
  var PREF_KEY = 'cc_rec_prefs';

  // recording state
  var _rec = null;   // { muxer, vEnc, aEnc, reader, aReader, t0, frames, dropped, stop() }
  var _tick = null;

  function _VE() { return window.__ccVideoEditor; }
  function _icon(n, s) { return (typeof getIcon === 'function' && getIcon(n, s || 14)) || ''; }
  function _toast(m, t) { if (typeof showToast === 'function') showToast(m, t); }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function _supported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
              window.MediaStreamTrackProcessor && window.VideoEncoder);
  }

  function _loadPrefs() {
    try {
      var p = JSON.parse(localStorage.getItem(PREF_KEY) || 'null');
      if (p) {
        _sel.video = p.video || ''; _sel.audio = p.audio || '';
        _sel.w = p.w || 1280; _sel.h = p.h || 720; _sel.fps = p.fps || 30;
      }
    } catch (e) {}
  }
  function _savePrefs() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(_sel)); } catch (e) {}
  }

  /* Device labels are EMPTY until one permission grant — deliberately, to stop fingerprinting.
     So the picker cannot be built from enumerateDevices() alone: we must open a stream once,
     then enumerate. This is the documented flow, not a workaround. */
  function _enumerate() {
    return navigator.mediaDevices.enumerateDevices().then(function (list) {
      _devices.video = list.filter(function (d) { return d.kind === 'videoinput'; });
      _devices.audio = list.filter(function (d) { return d.kind === 'audioinput'; });
      return _devices;
    });
  }

  function _stopStream() {
    if (!_stream) return;
    _stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
    _stream = null;
  }

  /* Two different rules, on purpose:

     SIZE/FPS use `ideal` — `exact` rejects outright when a camera cannot hit the combination,
     so a 720p webcam asked for 1080p would just fail. `ideal` gives the closest mode and we
     report what we actually got.

     deviceId uses `exact` — and this is NOT symmetric. With `ideal`, if the chosen camera
     cannot be opened (Windows locks a camera to one consumer, so NVIDIA Broadcast / Zoom / OBS
     holding it is enough), Chrome silently substitutes a DIFFERENT camera. The user picks Camo
     and gets NVIDIA Broadcast, with no error. Picking a device is an instruction, not a
     preference: honour it or say why. */
  function _open_(devId, audId) {
    var v = { width: { ideal: _sel.w }, height: { ideal: _sel.h }, frameRate: { ideal: _sel.fps } };
    if (devId) v.deviceId = { exact: devId };
    var a = audId ? { deviceId: { exact: audId } } : true;
    return navigator.mediaDevices.getUserMedia({ video: v, audio: a });
  }

  var BUSY_HINT = 'Another application might be using it (NVIDIA Broadcast, Zoom, Teams, OBS, Camo Studio). ' +
                  'Windows locks a camera to a single application: close that application and try again.';

  function _errText(e) {
    var n = (e && e.name) || '';
    if (n === 'NotAllowedError') return 'Camera permission not granted. Grant permission from the camera icon in the address bar and try again.';
    if (n === 'NotFoundError') return 'Camera not found. Plug in the device and try again.';
    if (n === 'NotReadableError') return 'Could not access the camera. ' + BUSY_HINT;
    if (n === 'OverconstrainedError') {
      // With deviceId:exact this is the "your camera could not be opened" case, not a
      // resolution complaint. Saying "bu ayarı desteklemiyor" here would be a lie.
      if (e && e.constraint === 'deviceId') return 'The selected camera could not be opened. ' + BUSY_HINT;
      return 'The camera does not support this resolution.';
    }
    return 'Could not open camera: ' + ((e && e.message) || n || 'unknown error');
  }

  /* Why the empty state says what it says: MediaStreamTrackProcessor + VideoEncoder are the
     two APIs this recorder is built on (WebCodecs, not MediaRecorder — see the plan). Firefox
     has neither; Safari got WebCodecs in 18 but not the track processor. Chrome-only is a
     stated scope, not an accident, so the panel says so rather than failing later. */
  function _build() {
    if (_p) return _p;
    _p = document.createElement('div');
    _p.className = 've-rec';
    _p.id = 've-recorder';
    _p.innerHTML =
      '<div class="ve-rec-head">' +
        '<span class="ve-rec-title">' + _icon('video', 15) + ' <b>Camera Recording</b></span>' +
        '<button class="ve-rec-x" id="ve-rec-x" title="Close">' + _icon('x', 14) + '</button>' +
      '</div>' +
      '<div class="ve-rec-body" id="ve-rec-body"></div>' +
      '<div class="ve-rec-help" id="ve-rec-help">' +
        '<div class="ve-rec-help-box">' +
          '<div class="ve-rec-help-head">' +
            '<span>' + _icon('help-circle', 14) + ' <b>How to connect your camera?</b></span>' +
            '<button class="ve-rec-x" id="ve-rec-help-x" title="Close">' + _icon('x', 14) + '</button>' +
          '</div>' +
          '<div class="ve-rec-h-tabs">' +
            Object.keys(HELP).map(function (k) {
              return '<button class="ve-rec-h-tab' + (k === 'android' ? ' is-on' : '') + '" data-t="' + k + '">' +
                HELP[k].label + '</button>';
            }).join('') +
          '</div>' +
          '<div class="ve-rec-help-body" id="ve-rec-help-body"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(_p);
    _p.querySelector('#ve-rec-x').addEventListener('click', hide);
    _p.querySelector('#ve-rec-help-x').addEventListener('click', _closeHelp);
    _p.querySelector('#ve-rec-help').addEventListener('click', function (e) {
      if (e.target.id === 've-rec-help') _closeHelp();   // click the backdrop to dismiss
    });
    _p.querySelectorAll('.ve-rec-h-tab').forEach(function (b) {
      b.addEventListener('click', function () { _helpTab = b.dataset.t; _renderHelp(); });
    });
    if (window.VEPanelHelpers && VEPanelHelpers.decorate) VEPanelHelpers.decorate(_p);
    return _p;
  }

  function _body() { return _p && _p.querySelector('#ve-rec-body'); }

  /* ── Help: how do I get my phone/camera into this list? ──
     Everything below is from the sourced research pass (docs/multicam-phase2-plan.md §4),
     not invented: vendor docs, Microsoft's own page, and measured constraints. If a claim
     here cannot be traced back to that, it does not belong on this screen. */
  var _helpTab = 'android';

  var HELP = {
    android: {
      label: 'Android',
      html:
        '<div class="ve-rec-h-best">' + _icon('check-circle', 13) +
          '<div><b>If you are using Windows 11: no installation required</b>' +
          '<span>Microsoft\'s own feature, free. Your phone is added system-wide as a normal camera.</span></div></div>' +
        '<ol class="ve-rec-h-steps">' +
          '<li>On your phone, update the <b>Link to Windows</b> app.</li>' +
          '<li>On your PC, open the <b>Phone Link</b> app and pair your phone.</li>' +
          '<li>On your PC, go to <b>Settings > Bluetooth & devices > Mobile devices</b>, ' +
              '<b>Manage connected camera</b> option.</li>' +
          '<li>Close and reopen this panel. Your phone will appear in the camera list.</li>' +
        '</ol>' +
        '<p class="ve-rec-h-warn">' + _icon('alert-triangle', 12) +
          ' This feature works <b>only over WiFi</b>, no cable option. Phone and PC must be on the same network ' +
          '(PC can be on Ethernet, no problem). <b>Android 10 or higher</b> required.</p>' +
        '<div class="ve-rec-h-alt"><b>If you\'re on Windows 10 or it doesn\'t work</b>' +
          '<p>You need to install an app. <b>DroidCam</b>, <b>Iriun</b>, or <b>Camo</b>: all are installed on phone + PC ' +
          'and turn your phone into a virtual camera. They work with cable or WiFi.</p></div>'
    },
    iphone: {
      label: 'iPhone',
      html:
        '<div class="ve-rec-h-bad">' + _icon('x-circle', 13) +
          '<div><b>There is no built-in way on Windows</b>' +
          '<span>Windows 11\'s "Connected camera" feature doesn\'t support iPhone, only Android. ' +
          'Apple\'s own solution (Continuity Camera) only works on Mac. Even if you plug in a cable, Windows won\'t see the iPhone ' +
          'as a camera, it only accesses photos.</span></div></div>' +
        '<p class="ve-rec-h-lead">You need to install an app. All are installed on iPhone + PC:</p>' +
        '<ul class="ve-rec-h-apps">' +
          '<li><b>Camo</b> <em>(recommended)</em><span>Free version 720p30, Pro version 4K/60. ' +
            'Chrome compatibility is clearly stated in the manufacturer\'s own documentation.</span></li>' +
          '<li><b>iVCam</b><span>Free version watermarked, supports USB and WiFi.</span></li>' +
          '<li><b>EpocCam</b> <span>Elgato\'s app.</span></li>' +
          '<li><b>Iriun</b><span>Up to 4K, free version has watermark.</span></li>' +
        '</ul>' +
        '<ol class="ve-rec-h-steps">' +
          '<li>Install the app on both iPhone and PC.</li>' +
          '<li>Run the app on the PC once (it installs the virtual camera driver).</li>' +
          '<li>Connect the iPhone with a <b>USB cable</b> and open the app on the phone.</li>' +
          '<li>Close and reopen this panel. The app\'s name will appear in the camera list.</li>' +
        '</ol>' +
        '<p class="ve-rec-h-warn">' + _icon('zap', 12) +
          ' <b>Prefer the cable.</b> The manufacturers\' own documentation says this: latency on WiFi ' +
          'increases significantly (measured up to about 1 second at 4K).</p>'
    },
    camera: {
      label: 'Camera / DSLR',
      html:
        '<p class="ve-rec-h-lead">There are two ways to connect a mirrorless, DSLR or action camera:</p>' +
        '<ol class="ve-rec-h-steps">' +
          '<li><b>Capture card</b><br>' +
            'Plug the camera\'s <b>HDMI</b> output into the card, and connect the card to the PC via USB. No driver needed, ' +
            'Windows recognizes it directly as a camera and it appears in the list. Latency approx. 50-100ms. ' +
            'Brand-name options like Elgato Cam Link or much cheaper generic cards will work.</li>' +
          '<li><b>Manufacturer\'s webcam software</b><br>' +
            'Canon, Sony, Nikon, Fujifilm and GoPro have their own free "webcam utility" programs. ' +
            'You connect the camera via USB, the program turns it into a virtual camera.</li>' +
        '</ol>' +
        '<p class="ve-rec-h-warn">' + _icon('alert-triangle', 12) +
          ' With the capture card method, the camera must provide <b>clean HDMI</b> output, otherwise ' +
          'on-screen menus and frames will also appear in the image. From the camera settings, enable "clean HDMI" ' +
          'or the "turn off info display" option.</p>' +
        '<div class="ve-rec-h-alt"><b>Standard webcam</b>' +
          '<p>USB webcams already work driver-free, they appear in the list when plugged in.</p></div>'
    },
    trouble: {
      label: 'Having trouble?',
      html:
        '<ul class="ve-rec-h-apps ve-rec-h-tr">' +
          '<li><b>I selected the camera but a different camera opens / doesn\'t open</b>' +
            '<span>Windows locks a camera to <b>a single app</b>. NVIDIA Broadcast, Zoom, Teams, OBS ' +
            'or if the camera\'s own app is open, the browser cannot access that camera. Those apps ' +
            '<b>fully exit from system tray</b> (closing the window is not enough) and try again.</span></li>' +
          '<li><b>Device list is empty or names not showing</b>' +
            '<span>The browser hides camera names until you give permission. Click "Connect Camera" and when you grant permission ' +
            'the names will populate.</span></li>' +
          '<li><b>I connected my phone but it\'s not in the list</b>' +
            '<span>Make sure you\'ve run the PC side app once: it installs the virtual camera driver ' +
            'Then close and reopen this panel, or refresh the page.</span></li>' +
          '<li><b>Can I connect via Bluetooth?</b>' +
            '<span><b>No.</b> Bluetooth\'s actual speed is insufficient even for 720p video, and there\'s no ' +
            'existing working Bluetooth camera path. Use cable or WiFi.</span></li>' +
          '<li><b>Video stutters / drops frames</b>' +
            '<span>Try <b>cable</b> instead of WiFi, lower the resolution, and make sure no other app is using the camera ' +
            'in the background.</span></li>' +
        '</ul>'
    }
  };

  function _renderHelp() {
    var host = _p.querySelector('#ve-rec-help-body');
    if (!host) return;
    host.innerHTML = HELP[_helpTab].html;
    _p.querySelectorAll('.ve-rec-h-tab').forEach(function (b) {
      b.classList.toggle('is-on', b.dataset.t === _helpTab);
    });
  }

  function _openHelp() {
    var el = _p.querySelector('#ve-rec-help');
    if (!el) return;
    _renderHelp();
    el.style.display = 'flex';
  }
  function _closeHelp() {
    var el = _p && _p.querySelector('#ve-rec-help');
    if (el) el.style.display = 'none';
  }

  function _state(icon, title, msg, btnLabel, btnFn, extraClass) {
    var b = _body();
    if (!b) return;
    b.innerHTML =
      '<div class="ve-rec-state' + (extraClass ? ' ' + extraClass : '') + '">' + _icon(icon, 26) +
        '<b>' + _esc(title) + '</b>' +
        '<span>' + _esc(msg) + '</span>' +
        (btnLabel ? '<button class="ve-rec-btn is-go" id="ve-rec-cta">' + _esc(btnLabel) + '</button>' : '') +
      '</div>';
    if (btnLabel && btnFn) b.querySelector('#ve-rec-cta').addEventListener('click', btnFn);
  }

  function _renderIntro() {
    if (!_supported()) {
      _state('alert-triangle', 'This browser does not support',
        'Camera recording requires Chrome or Edge.');
      return;
    }
    _state('camera', 'Camera recording',
      'Set up the camera on a tripod, record, and the clip will drop directly onto the timeline. We need camera permission to start.',
      'Connect Camera', _connect);
  }

  function _connect() {
    if (_busy) return;
    _busy = true;
    _state('loader', 'Camera opening', 'The browser will ask for permission.');
    var hadPref = !!_sel.video;
    _open_(_sel.video, _sel.audio)
      ['catch'](function (e) {
        // Now that deviceId is `exact`, a remembered device that has since been unplugged (or
        // is busy) would dead-end the panel. On FIRST connect, fall back to the default camera
        // rather than stranding the user — but only here, never when they explicitly pick one.
        if (hadPref && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError')) {
          _sel.video = ''; _sel.audio = '';
          _savePrefs();
          return _open_('', '');
        }
        throw e;
      })
      .then(function (s) {
        _stream = s;
        _granted = true;
        return _enumerate();
      })
      .then(function () { _busy = false; _renderStudio(); })
      ['catch'](function (e) {
        _busy = false;
        _state('camera-off', 'Camera could not be opened', _errText(e), 'Try again', _connect);
      });
  }

  /* Switch device / mode: tear the old stream down FIRST. Windows locks a camera to one
     consumer, so re-opening before stopping can fail with NotReadableError against ourselves. */
  function _reopen() {
    if (_busy) return;
    _busy = true;
    _stopStream();
    _open_(_sel.video, _sel.audio)
      .then(function (s) { _stream = s; _busy = false; _savePrefs(); _renderStudio(); })
      ['catch'](function (e) {
        _busy = false;
        _state('camera-off', 'Camera could not be opened', _errText(e), 'Try again', _connect);
      });
  }

  /* Level meter. A tripod recorder's worst failure is a 20-minute take with a dead mic, and
     the only defence is showing the user it is alive BEFORE they walk away. Its own tiny
     AudioContext: VEAudioEngine's graph belongs to the timeline, and borrowing it would tangle
     the recorder into a shared seam for a decoration. */
  var _meter = null;
  function _startMeter() {
    _stopMeter();
    if (!_stream || !_stream.getAudioTracks().length) return;
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      // A fresh AudioContext starts suspended without a user gesture, and a suspended context's
      // analyser reports pure silence — which would have shown a dead-mic warning on a live mic.
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
      var src = ctx.createMediaStreamSource(_stream);
      var an = ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      var buf = new Uint8Array(an.fftSize);
      // RMS off the WAVEFORM, not an average of frequency bins. Measured: averaging bins reads
      // 0.077 for a loud tone vs 0.063 for pure silence — indistinguishable, because one loud
      // bin is drowned by hundreds of empty ones. Waveform RMS reads 0 for silence, which is
      // the entire point of a dead-mic warning.
      // setInterval, not rAF: rAF is throttled to a standstill in a background tab (measured
      // elsewhere in this editor), and a meter that freezes would then claim the mic is dead.
      _meter = { ctx: ctx, silentMs: 0 };
      _meter.iv = setInterval(function () {
        if (!_meter) return;
        an.getByteTimeDomainData(buf);
        var sum = 0;
        for (var i = 0; i < buf.length; i++) {
          var v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        var lvl = Math.min(1, Math.sqrt(sum / buf.length) * 3);
        var bar = _p && _p.querySelector('#ve-rec-lvl-fill');
        if (bar) bar.style.width = Math.round(lvl * 100) + '%';
        _meter.silentMs = lvl < 0.02 ? _meter.silentMs + 50 : 0;
        var warn = _p && _p.querySelector('#ve-rec-lvl-warn');
        if (warn) warn.style.display = _meter.silentMs > 2000 ? '' : 'none';
      }, 50);
    } catch (e) { _meter = null; }
  }
  function _stopMeter() {
    if (!_meter) return;
    if (_meter.iv) clearInterval(_meter.iv);
    try { _meter.ctx.close(); } catch (e) {}
    _meter = null;
  }

  function _fmtMode() {
    if (!_stream) return '';
    var t = _stream.getVideoTracks()[0];
    if (!t || !t.getSettings) return '';
    var s = t.getSettings();
    return (s.width || '?') + '×' + (s.height || '?') + ' · ' + Math.round(s.frameRate || 0) + 'fps';
  }

  /* Offer only modes the camera actually claims (getCapabilities), so the dropdown cannot
     promise 1080p60 to a 720p30 webcam. */
  function _modeOptions() {
    var out = [];
    var caps = null;
    var t = _stream && _stream.getVideoTracks()[0];
    if (t && t.getCapabilities) { try { caps = t.getCapabilities(); } catch (e) {} }
    var maxW = (caps && caps.width && caps.width.max) || 1920;
    var maxH = (caps && caps.height && caps.height.max) || 1080;
    var maxF = (caps && caps.frameRate && caps.frameRate.max) || 30;
    [[640, 360], [1280, 720], [1920, 1080], [3840, 2160]].forEach(function (r) {
      if (r[0] > maxW || r[1] > maxH) return;
      [30, 60].forEach(function (f) {
        if (f > maxF + 0.5) return;
        out.push({ w: r[0], h: r[1], fps: f });
      });
    });
    if (!out.length) out.push({ w: _sel.w, h: _sel.h, fps: _sel.fps });
    return out;
  }

  function _renderStudio() {
    var b = _body();
    if (!b || !_stream) return;
    var vt = _stream.getVideoTracks()[0];
    var at = _stream.getAudioTracks()[0];
    if (vt && vt.getSettings) _sel.video = vt.getSettings().deviceId || _sel.video;
    if (at && at.getSettings) _sel.audio = at.getSettings().deviceId || _sel.audio;

    var modes = _modeOptions();
    var curKey = _sel.w + 'x' + _sel.h + '@' + _sel.fps;

    b.innerHTML =
      '<div class="ve-rec-prev"><video id="ve-rec-video" autoplay muted playsinline></video>' +
        '<span class="ve-rec-mode" id="ve-rec-mode"></span></div>' +
      '<div class="ve-rec-row">' +
        '<label>' + _icon('camera', 11) + ' Kamera' +
          '<button class="ve-rec-i" id="ve-rec-help-btn" title="How to connect your phone or camera?" aria-label="Camera connection help">i</button>' +
        '</label>' +
        '<select class="ve-rec-sel" id="ve-rec-cam">' +
          _devices.video.map(function (d, i) {
            return '<option value="' + _esc(d.deviceId) + '"' + (d.deviceId === _sel.video ? ' selected' : '') + '>' +
              _esc(d.label || ('Kamera ' + (i + 1))) + '</option>';
          }).join('') +
        '</select>' +
      '</div>' +
      '<div class="ve-rec-row">' +
        '<label>' + _icon('mic', 11) + ' Mikrofon</label>' +
        '<select class="ve-rec-sel" id="ve-rec-mic">' +
          _devices.audio.map(function (d, i) {
            return '<option value="' + _esc(d.deviceId) + '"' + (d.deviceId === _sel.audio ? ' selected' : '') + '>' +
              _esc(d.label || ('Mikrofon ' + (i + 1))) + '</option>';
          }).join('') +
        '</select>' +
      '</div>' +
      '<div class="ve-rec-row">' +
        '<label>' + _icon('maximize', 11) + ' Kalite</label>' +
        '<select class="ve-rec-sel" id="ve-rec-mode-sel">' +
          modes.map(function (m) {
            var k = m.w + 'x' + m.h + '@' + m.fps;
            return '<option value="' + k + '"' + (k === curKey ? ' selected' : '') + '>' +
              m.h + 'p' + m.fps + '</option>';
          }).join('') +
        '</select>' +
      '</div>' +
      '<div class="ve-rec-lvl"><span class="ve-rec-lvl-track"><span class="ve-rec-lvl-fill" id="ve-rec-lvl-fill"></span></span></div>' +
      '<p class="ve-rec-note is-warn" id="ve-rec-lvl-warn" style="display:none">' +
        'No sound from microphone. Wrong device may be selected.</p>' +
      '<p class="ve-rec-note" id="ve-rec-note"></p>' +
      '<div class="ve-rec-foot">' +
        '<button class="ve-rec-btn is-rec" id="ve-rec-go">' + _icon('circle', 12) + ' Start recording</button>' +
      '</div>';

    var v = b.querySelector('#ve-rec-video');
    v.srcObject = _stream;

    b.querySelector('#ve-rec-cam').addEventListener('change', function (e) {
      _sel.video = e.target.value; _reopen();
    });
    b.querySelector('#ve-rec-mic').addEventListener('change', function (e) {
      _sel.audio = e.target.value; _reopen();
    });
    b.querySelector('#ve-rec-mode-sel').addEventListener('change', function (e) {
      var m = e.target.value.split(/[x@]/);
      _sel.w = parseInt(m[0], 10); _sel.h = parseInt(m[1], 10); _sel.fps = parseInt(m[2], 10);
      _reopen();
    });
    b.querySelector('#ve-rec-go').addEventListener('click', _startRec);
    var hb = b.querySelector('#ve-rec-help-btn');
    if (hb) hb.addEventListener('click', _openHelp);

    _paintMode();
    _startMeter();
    _savePrefs();
  }

  /* Show what we ASKED for vs what we GOT. A webcam that caps at 720p30 will silently hand
     back 720p30 for a 1080p request (because we ask with `ideal`), and the user deserves to
     see that rather than believe they recorded 1080p. */
  function _paintMode() {
    var el = _p && _p.querySelector('#ve-rec-mode');
    var note = _p && _p.querySelector('#ve-rec-note');
    if (el) el.textContent = _fmtMode();
    if (!note || !_stream) return;
    var t = _stream.getVideoTracks()[0];
    var s = (t && t.getSettings && t.getSettings()) || {};
    var askedH = _sel.h, gotH = s.height || 0;
    var askedF = _sel.fps, gotF = Math.round(s.frameRate || 0);
    if (gotH && (gotH !== askedH || Math.abs(gotF - askedF) > 1)) {
      note.className = 've-rec-note is-warn';
      note.textContent = 'Kamera ' + askedH + 'p' + askedF + ' veremedi, ' + gotH + 'p' + gotF +
        ' opened with. Recording will be made with these values.';
    } else {
      note.className = 've-rec-note';
      note.textContent = 'Camera indicator is mandatory by browser and Windows, cannot be hidden.';
    }
  }

  /* ── R3: the recording engine ──
     WebCodecs, not MediaRecorder: MediaRecorder's whole control surface is a bitrate *hint*
     (no CRF, no preset, no encoder choice) and it drops frames silently under load.

     THE one thing export does not have to solve: a live camera cannot be throttled.
     Backpressure does not cross the MediaStreamTrack boundary, so if the encoder falls behind
     we must drop frames OURSELVES and, unlike MediaRecorder, say how many. */
  var MAX_QUEUE = 2;   // Chrome's own live sample drops above this

  function _bitrateFor(w, h, fps) {
    // Rough but honest: ~0.1 bits per pixel per frame, floor 1.5Mbps, ceiling 24Mbps.
    var bpp = 0.1;
    return Math.max(1500000, Math.min(24000000, Math.round(w * h * fps * bpp)));
  }

  /* R5: stage the take in OPFS instead of RAM.
     Accumulating in memory is the documented OOM path: ~1.35 GB for one 1080p hour at Chrome's
     default bitrate, and two Firefox bug reports of tabs eating all system RAM this way. The
     vendored mp4-muxer already ships FileSystemWritableFileStreamTarget, so this needs no new
     library — the muxer writes through to disk as it goes.
     `fastStart: false` is REQUIRED here: 'in-memory' defeats the entire point by holding
     everything to rewrite the header at the end. With false, moov lands at the tail, which is
     fine for a local file we hand straight to the importer. */
  function _base() {
    var b = document.querySelector('base');
    return (b && b.href) || (location.origin + location.pathname.replace(/[^/]*$/, ''));
  }
  function _workerUrl() {
    return new URL('modules/video/ve-recorder/ve-recorder.worker.js', _base()).href;
  }

  /* R9: write through a Worker using createSyncAccessHandle — in-place writes, no temp file,
     no rename-on-close. Measured on the old createWritable() path: 0 bytes on disk until
     close(), so a tab-kill lost the take. Here flush() is a genuine checkpoint.
     Falls back to createWritable (memory-safe but crash-unsafe), then to RAM. */
  function _opfsWriter(name) {
    if (!(navigator.storage && navigator.storage.getDirectory) || !Mp4Muxer.StreamTarget) {
      return Promise.resolve(null);
    }
    return new Promise(function (resolve) {
      var w;
      try { w = new Worker(_workerUrl()); } catch (e) { resolve(null); return; }
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
            worker: w,
            name: name,
            // The muxer seeks backwards to patch box sizes, so position matters.
            target: new Mp4Muxer.StreamTarget({
              onData: function (data, position) {
                // Copy: the muxer reuses its buffer, and we transfer ownership away.
                var copy = new Uint8Array(data);
                w.postMessage({ type: 'write', data: copy, position: position }, [copy.buffer]);
              }
            }),
            flush: function () { w.postMessage({ type: 'flush' }); },
            close: function () {
              return new Promise(function (res) { pendingClose = res; w.postMessage({ type: 'close' }); });
            }
          });
          return;
        }
        if (m.type === 'closed') { if (pendingClose) { pendingClose(m.size); pendingClose = null; } return; }
        if (m.type === 'error') {
          if (!settled) { settled = true; clearTimeout(t); resolve(null); }
          else _toast('Disk write error: ' + m.message, 'error');
        }
      };
      w.onerror = function () {
        if (settled) return; settled = true; clearTimeout(t);
        resolve(null);
      };
      w.postMessage({ type: 'open', name: name });
    });
  }

  /* R6: a countdown before rolling. Not decoration — a tripod recorder is used by someone who
     has to walk back to their chair, and hitting record then scrambling is the whole problem. */
  function _countdown(n, done) {
    var b = _body();
    if (!b) { done(); return; }
    b.innerHTML = '<div class="ve-rec-count"><span id="ve-rec-num">' + n + '</span></div>';
    var el = b.querySelector('#ve-rec-num');
    var t = setInterval(function () {
      n--;
      if (n <= 0) { clearInterval(t); done(); return; }
      if (el) { el.textContent = n; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; }
    }, 1000);
  }

  function _startRec() {
    if (_rec || !_stream) return;
    var vt = _stream.getVideoTracks()[0];
    if (!vt) { _toast('No camera stream', 'error'); return; }
    if (!window.Mp4Muxer || !Mp4Muxer.Muxer) { _toast('mp4-muxer not loaded', 'error'); return; }
    _stopMeter();   // the meter's own context is only for the preview; recording owns the track now
    _countdown(3, function () {
      _state('loader', 'Preparing', 'Allocating recording space.');
      _opfsWriter('cc-take-' + Date.now() + '.mp4').then(function (opfs) {
        if (!_stream) return;   // panel closed during the countdown
        _startRec2(vt, opfs);
      });
    });
  }

  /* R8: Mediabunny path.
     mp4-muxer's own author deprecated it in favour of Mediabunny, and Mediabunny is a better
     fit besides: MediaStreamVideoTrackSource takes a live track DIRECTLY, which deletes the
     MediaStreamTrackProcessor bridge, the manual VideoEncoder/AudioEncoder wiring and our
     hand-rolled encodeQueueSize frame dropping. Roughly 90 lines become 15.
     mp4-muxer stays as the fallback: it is proven, already loaded, and Mediabunny is ESM so it
     resolves a tick later than the classic scripts. */
  function _startRecMB(vt, at, w, h, fps, opfs) {
    var MB = window.Mediabunny;
    var st = { frames: 0, dropped: 0, t0: 0, stopping: false, w: w, h: h, fps: fps,
               hasAudio: !!at, opfs: opfs, mb: true };

    var target;
    if (opfs) {
      // Mediabunny's StreamTarget wants a WritableStream of {type,data,position} chunks.
      var ws = new WritableStream({
        write: function (chunk) {
          var copy = new Uint8Array(chunk.data);
          opfs.worker.postMessage({ type: 'write', data: copy, position: chunk.position }, [copy.buffer]);
        }
      });
      target = new MB.StreamTarget(ws);
    } else {
      target = new MB.BufferTarget();
    }

    var output = new MB.Output({ format: new MB.Mp4OutputFormat(), target: target });
    var vCfg = { codec: 'avc', bitrate: _bitrateFor(w, h, fps), keyFrameInterval: 2 };
    // Mediabunny owns the pacing; we only count what it reports.
    vCfg.onEncodedPacket = function () { st.frames++; };
    var vSrc = new MB.MediaStreamVideoTrackSource(vt, vCfg);
    output.addVideoTrack(vSrc);
    if (at) output.addAudioTrack(new MB.MediaStreamAudioTrackSource(at, { codec: 'aac', bitrate: 128000 }));

    st.output = output;
    st.vSrc = vSrc;
    _rec = st;
    output.start().then(function () {
      st.t0 = performance.now();
      _renderRecording();
      _paintRecTime();
      _tick = setInterval(_paintRecTime, 200);
      if (opfs) st.ckpt = setInterval(function () { opfs.flush(); }, 5000);
    })['catch'](_failRec);
  }

  function _startRec2(vt, opfs) {
    var s = vt.getSettings();
    var w = (s.width || _sel.w) & ~1;         // encoders want even dimensions
    var h = (s.height || _sel.h) & ~1;
    var fps = Math.round(s.frameRate || _sel.fps) || 30;
    var at = _stream.getAudioTracks()[0];

    if (window.Mediabunny && window.Mediabunny.Output && window.Mediabunny.MediaStreamVideoTrackSource) {
      return _startRecMB(vt, at, w, h, fps, opfs);
    }

    // Fall back to RAM only if OPFS is unavailable, and say so rather than pretending.
    var target = opfs ? opfs.target : new Mp4Muxer.ArrayBufferTarget();
    var mOpts = {
      target: target,
      video: { codec: 'avc', width: w, height: h },
      fastStart: opfs ? false : 'in-memory',
      // A live camera's first timestamp is whenever the track happened to start, not zero.
      firstTimestampBehavior: 'offset'
    };
    if (at) {
      var as = at.getSettings();
      mOpts.audio = { codec: 'aac', sampleRate: as.sampleRate || 48000,
                      numberOfChannels: as.channelCount || 1 };
    }
    var muxer = new Mp4Muxer.Muxer(mOpts);

    var st = { muxer: muxer, target: target, opfs: opfs, frames: 0, dropped: 0, t0: 0,
               stopping: false, w: w, h: h, fps: fps, hasAudio: !!at, bytes: 0 };

    st.vEnc = new VideoEncoder({
      output: function (chunk, meta) { try { muxer.addVideoChunk(chunk, meta); } catch (e) {} },
      error: function (e) { _failRec(e); }
    });
    st.vEnc.configure({
      codec: 'avc1.42003e', width: w, height: h,
      bitrate: _bitrateFor(w, h, fps), framerate: fps,
      hardwareAcceleration: 'prefer-hardware',   // a hint, never a guarantee
      avc: { format: 'avc' }
    });

    if (at) {
      st.aEnc = new AudioEncoder({
        output: function (chunk, meta) { try { muxer.addAudioChunk(chunk, meta); } catch (e) {} },
        error: function (e) { _failRec(e); }
      });
      st.aEnc.configure({
        codec: 'mp4a.40.2',
        sampleRate: mOpts.audio.sampleRate,
        numberOfChannels: mOpts.audio.numberOfChannels,
        bitrate: 128000
      });
    }

    _rec = st;
    st.t0 = performance.now();

    // video pump
    var vProc = new MediaStreamTrackProcessor({ track: vt });
    st.vReader = vProc.readable.getReader();
    (function pumpV() {
      st.vReader.read().then(function (res) {
        if (res.done || st.stopping) return;
        var frame = res.value;
        // The live-capture rule: if the encoder is behind, throw the frame away rather than
        // queue it forever. Counting them is the difference between honest and MediaRecorder.
        if (st.vEnc.encodeQueueSize > MAX_QUEUE) { st.dropped++; frame.close(); }
        else {
          try { st.vEnc.encode(frame, { keyFrame: st.frames % (fps * 2) === 0 }); st.frames++; }
          catch (e) { st.dropped++; }
          frame.close();
        }
        pumpV();
      })['catch'](function () {});
    })();

    // audio pump
    if (at && st.aEnc) {
      var aProc = new MediaStreamTrackProcessor({ track: at });
      st.aReader = aProc.readable.getReader();
      (function pumpA() {
        st.aReader.read().then(function (res) {
          if (res.done || st.stopping) return;
          var data = res.value;
          try { st.aEnc.encode(data); } catch (e) {}
          data.close();
          pumpA();
        })['catch'](function () {});
      })();
    }

    _renderRecording();
    _paintRecTime();                              // paint immediately; the interval only refreshes
    _tick = setInterval(_paintRecTime, 200);
    // Checkpoint every 5s. With sync access handles this genuinely lands bytes on disk, so a
    // crash costs at most the last few seconds instead of the whole take.
    if (opfs) st.ckpt = setInterval(function () { opfs.flush(); }, 5000);
  }

  function _failRec(e) {
    _stopPumps();
    _rec = null;
    if (_tick) { clearInterval(_tick); _tick = null; }
    _state('alert-triangle', 'Recording failed', (e && e.message) || 'Encoder error',
      'Go back', _renderStudio);
  }

  function _stopPumps() {
    if (!_rec) return;
    _rec.stopping = true;
    try { _rec.vReader && _rec.vReader.cancel(); } catch (e) {}
    try { _rec.aReader && _rec.aReader.cancel(); } catch (e) {}
  }

  // Mediabunny owns its own encode loop, so stopping is just finalize().
  function _stopRecMB() {
    var st = _rec;
    st.stopping = true;
    if (_tick) { clearInterval(_tick); _tick = null; }
    if (st.ckpt) { clearInterval(st.ckpt); st.ckpt = null; }
    _state('loader', 'Completing recording', 'Writing video, this may take a few seconds.');
    var secs = (performance.now() - st.t0) / 1000;
    st.output.finalize().then(function () {
      _rec = null;
      if (st.opfs) {
        return st.opfs.close().then(function () {
          try { st.opfs.worker.terminate(); } catch (e) {}
          return navigator.storage.getDirectory()
            .then(function (root) { return root.getFileHandle(st.opfs.name); })
            .then(function (fh) { return fh.getFile(); })
            .then(function (file) { _onRecorded(file, st, secs); });
        });
      }
      _onRecorded(new Blob([st.output.target.buffer], { type: 'video/mp4' }), st, secs);
    })['catch'](_failRec);
  }

  function _stopRec() {
    if (!_rec || _rec.stopping) return;
    if (_rec.mb) return _stopRecMB();
    var st = _rec;
    _stopPumps();
    if (_tick) { clearInterval(_tick); _tick = null; }
    if (st.ckpt) { clearInterval(st.ckpt); st.ckpt = null; }
    _state('loader', 'Completing recording', 'Writing video, this may take a few seconds.');

    var jobs = [st.vEnc.flush()];
    if (st.aEnc) jobs.push(st.aEnc.flush());
    Promise.all(jobs).then(function () {
      st.muxer.finalize();
      try { st.vEnc.close(); } catch (e) {}
      try { st.aEnc && st.aEnc.close(); } catch (e) {}
      var secs = (performance.now() - st.t0) / 1000;
      _rec = null;

      // OPFS path: bytes were written in place as we went. Close flushes + reports the size,
      // then we read the file back through a normal handle.
      if (st.opfs) {
        return st.opfs.close().then(function () {
          try { st.opfs.worker.terminate(); } catch (e) {}
          return navigator.storage.getDirectory()
            .then(function (root) { return root.getFileHandle(st.opfs.name); })
            .then(function (fh) { return fh.getFile(); })
            .then(function (file) { _onRecorded(file, st, secs); });
        });
      }
      _onRecorded(new Blob([st.target.buffer], { type: 'video/mp4' }), st, secs);
    })['catch'](_failRec);
  }

  var _lastTake = null;

  /* R4: the take lands on the timeline.
     Reuse _veImportFileCore — it already builds the clip, the videoPool entry, the thumbnails
     and the waveform, and it is the same path a dropped file takes. Hand-rolling clip creation
     here would be a second, drifting copy of all that. */
  function _stamp() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
           p(d.getHours()) + '-' + p(d.getMinutes()) + '-' + p(d.getSeconds());
  }

  function _landOnTimeline(take) {
    var VE = _VE();
    // take.blob is either an OPFS File (already on disk) or an in-memory Blob fallback.
    var file = new File([take.blob], 'Recording ' + _stamp() + '.mp4', { type: 'video/mp4' });

    // First free video track, else a new one — never silently overwrite someone's work.
    var track = null;
    var tracks = VE._veProject.tracks;
    for (var i = 0; i < tracks.length; i++) {
      if (tracks[i].type !== 'audio' && !tracks[i].locked) { track = tracks[i]; break; }
    }
    if (!track) { VE._veAddTrack('video'); track = tracks[tracks.length - 1]; }

    // Land it after whatever is already on that track, so nothing is clobbered.
    var end = 0;
    track.clips.forEach(function (c) { end = Math.max(end, c.startTime + c.duration); });

    VE._veImportFileCore(file, track, end, null, take.secs);
    return true;
  }

  function _onRecorded(blob, st, secs) {
    var mb = (blob.size / 1048576).toFixed(1);
    _lastTake = { blob: blob, w: st.w, h: st.h, fps: st.fps, secs: secs,
                  frames: st.frames, dropped: st.dropped, onDisk: !!st.opfs };
    var landed = false;
    try { landed = _landOnTimeline(_lastTake); }
    catch (e) { landed = false; _lastTake.landErr = (e && e.message) || String(e); }

    var msg = Math.round(secs) + ' sec · ' + mb + ' MB · ' + st.frames + ' frames' +
      (st.dropped ? ' · ' + st.dropped + ' frame skipped' : '');
    if (landed) {
      _state('check-circle', 'in recording timeline', msg + '. Clip added and ready to edit.',
        'New recording', _renderStudio);
      _toast('Added to recording timeline');
    } else {
      // The bytes exist; refusing to lose them is more important than a tidy flow.
      _state('alert-triangle', 'Could not add clip',
        msg + '. The recording is preserved; you can download it as a file.', 'Download file', function () {
          var a = document.createElement('a');
          a.href = URL.createObjectURL(_lastTake.blob);
          a.download = 'Recording ' + _stamp() + '.mp4';
          a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
        });
    }
  }

  function _paintRecTime() {
    if (!_rec || !_p) return;
    var el = _p.querySelector('#ve-rec-timer');
    var dr = _p.querySelector('#ve-rec-drop');
    var sz = _p.querySelector('#ve-rec-size');
    var secs = (performance.now() - _rec.t0) / 1000;
    var m = Math.floor(secs / 60), s = Math.floor(secs % 60);
    if (el) el.textContent = m + ':' + (s < 10 ? '0' : '') + s;
    if (dr) {
      dr.style.display = _rec.dropped ? '' : 'none';
      dr.textContent = _rec.dropped + ' frame skipped (encoder couldn\'t keep up)';
    }
    // Estimated from the configured bitrate: the muxer streams to disk, so there is no buffer
    // to measure. Honest label ("~") rather than a fake exact number.
    if (sz) {
      var est = (_bitrateFor(_rec.w, _rec.h, _rec.fps) / 8) * secs / 1048576;
      sz.textContent = '~' + (est < 10 ? est.toFixed(1) : Math.round(est)) + ' MB' +
        (_rec.opfs ? ' · writing to disk' : ' · bellekte');
    }
  }

  function _renderRecording() {
    var b = _body();
    if (!b) return;
    b.innerHTML =
      '<div class="ve-rec-prev"><video id="ve-rec-video" autoplay muted playsinline></video>' +
        '<span class="ve-rec-live">' + _icon('circle', 9) + ' REC</span>' +
        '<span class="ve-rec-mode" id="ve-rec-timer">0:00</span>' +
        '<span class="ve-rec-size" id="ve-rec-size"></span></div>' +
      '<p class="ve-rec-note is-warn" id="ve-rec-drop" style="display:none"></p>' +
      '<p class="ve-rec-note">If you close, recording stops and the clip will still be added.</p>' +
      '<div class="ve-rec-foot">' +
        '<button class="ve-rec-btn is-stop" id="ve-rec-stop">' + _icon('square', 12) + ' Durdur</button>' +
      '</div>';
    var v = b.querySelector('#ve-rec-video');
    if (v && _stream) v.srcObject = _stream;
    b.querySelector('#ve-rec-stop').addEventListener('click', _stopRec);
  }

  function show() {
    var VE = _VE();
    if (!VE || !VE._veIsActive || !VE._veIsActive()) {
      _toast('First open the video editor', 'error');
      return;
    }
    _loadPrefs();
    _build();
    _p.style.display = 'flex';
    _open = true;
    if (_granted && _stream) _renderStudio();
    else _renderIntro();
  }

  function hide() {
    // Closing mid-record would throw the take away silently. Stop it properly instead — the
    // bytes are already encoded, losing them to a stray click would be inexcusable.
    if (_rec && !_rec.stopping) { _stopRec(); return; }
    _open = false;
    if (_p) _p.style.display = 'none';
    if (_tick) { clearInterval(_tick); _tick = null; }
    _stopMeter();
    // Release the camera on close: the in-use indicator staying lit while the panel is shut
    // reads as spyware, and Windows locks the device to one consumer anyway.
    _stopStream();
  }

  function toggle() { _open ? hide() : show(); }

  window.VERecorder = {
    show: show, hide: hide, toggle: toggle,
    isOpen: function () { return _open; },
    isSupported: _supported,
    // test/debug surface
    _connect: _connect,
    _stream: function () { return _stream; },
    _devices: function () { return _devices; },
    _sel: function () { return _sel; },
    _lastTake: function () { return _lastTake; }
  };
})();

// Modular skeleton hook — ve-recorder is a video loader module. Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-recorder', parent: 'video', title: 've-recorder', mount: function () {}, unmount: function () {} });
