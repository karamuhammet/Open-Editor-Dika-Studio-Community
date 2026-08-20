/* Module: video/video-editor/export — EXPORT — the export modal + WebCodecs export pipeline + command registration.
   Part of the video-editor group (decomposed from the 7695-line IIFE). Functions hang off the
   shared namespace VE (window.__ccVideoEditor, created by the parent); cross-module refs resolve
   through VE at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VE = window.__ccVideoEditor;
  if (!VE) return;

  VE._veShowExportModal = function () {
    var old = document.getElementById('ve-export-overlay');
    /* X7 (export plan): removing the overlay while a run is live orphans the nodes the running export
       still writes progress into - the new modal shows step 1 and an idle Export button while an
       export is genuinely encoding, so the user starts a second one (X1 then refuses it, and they
       conclude the app is broken). If a run is live, bring its own UI back instead of building a new
       one; the minimize path already knows how to do that. */
    if (VE._veExporting) {
      if (old) { VE._veExportExpand(); return; }
      if (typeof showToast === 'function') showToast('An export is already running', 'error');
      return;
    }
    if (old) old.remove();

    // Ensure duration is up to date
    if (typeof VE._veRecalcDuration === 'function') VE._veRecalcDuration();
    var dur = Math.max(VE._veProject.duration || 0, 0.1);
    var currentStep = 0;

    /* What the timeline's footage can actually deliver. Same source as the export-manager sheet
       (VE._veSourceProfile), so the two dialogs cannot describe the same project differently. */
    var _sp = (typeof VE._veSourceProfile === 'function') ? VE._veSourceProfile() : null;
    var _spShort = (_sp && _sp.shortSide) || 0;
    var _spRate = (_sp && _sp.bitrate) || 0;   // refreshed once _veEnsureSourceBytes resolves
    var _cwv = (typeof CW !== 'undefined' && CW) ? CW : 1920;
    var _chv = (typeof CH !== 'undefined' && CH) ? CH : 1080;
    var _spDetail = _spShort || Math.min(_cwv, _chv);
    /* The real bits-per-pixel, from VE._veProbeSourceSize -> VESizeProbe: the SOURCE clip measured
       entirely inside a Worker. It touches no canvas, no video element and no editor state, which
       is exactly what its predecessor got wrong (Part 7). */
    var _measured = null, _measuring = false, _measuringPct = 0, _probeCache = {};

    /* ── Platform preset ──
       This lived in the markup as a card grid hardcoded to '' since it was written, so wizard step 1
       was permanently blank. It is a dropdown rather than cards for the same reason the other sheet
       is: as cards there was no way to UNDO a choice, and "None" is a state a select has for free.
       Options come from the single sourced table in the engine, shared by both dialogs. */
    var platformHTML = '<option value="">None</option>' +
      ((window.VEWebCodecsExport && VEWebCodecsExport.EXPORT_PLATFORMS) || [])
      .map(function (pl) {
        return '<option value="' + pl.id + '">' + pl.label + ' · ' + pl.hint + '</option>';
      }).join('');

    /* Resolution options. A tier the footage cannot fill is labelled as the upscale it is, and the
       source's own resolution is offered when it differs from the canvas: "Canvas" follows CW/CH,
       which is only the same thing when the video set the canvas in the first place. */
    var _resHTML = '<option value="canvas" selected>Canvas (recommended) — ' + _cwv + '×' + _chv + '</option>';
    var _spListed = !!(_spShort && _spShort !== Math.min(_cwv, _chv));
    if (_spListed) {
      _resHTML += '<option value="' + _spShort + '">Source — ' + _sp.width + '×' + _sp.height + ' video</option>';
    }
    [['480', '480p'], ['720', '720p'], ['1080', '1080p Full HD'], ['1440', '1440p QHD'], ['2160', '4K Ultra HD']]
      .forEach(function (t) {
        if (_spListed && String(_spShort) === t[0]) return;   // already listed as Source
        var up = parseInt(t[0], 10) > _spDetail;
        _resHTML += '<option value="' + t[0] + '">' + t[1] +
                    (up ? ' — upscale from ' + _spDetail + 'p' : '') + '</option>';
      });

    var overlay = document.createElement('div');
    overlay.id = 've-export-overlay';
    overlay.className = 've-export-overlay';
    overlay.innerHTML =
      '<div class="ve-export-modal" id="ve-export-modal-inner">' +
        '<div class="ve-export-header">' +
          '<h3>' + VE._veIcon('download', 16) + ' Export Video</h3>' +
          '<div style="display:flex;align-items:center;gap:4px;">' +
            '<button class="ve-export-close" id="ve-export-minimize" title="Minimize to floating popup">' + VE._veIcon('minus', 14) + '</button>' +
            '<button class="ve-export-close" id="ve-export-close">&times;</button>' +
          '</div>' +
        '</div>' +
        // Wizard steps
        '<div class="ve-wiz-steps">' +
          '<div class="ve-wiz-step active" data-step="0"><span class="ve-wiz-num">1</span> Preset</div>' +
          '<div class="ve-wiz-step" data-step="1"><span class="ve-wiz-num">2</span> Settings</div>' +
          '<div class="ve-wiz-step" data-step="2"><span class="ve-wiz-num">3</span> Export</div>' +
        '</div>' +
        // Step 0: Platform Presets
        '<div class="ve-wiz-panel active" data-panel="0">' +
          '<div style="font-size:12px;color:var(--text-dim);margin-bottom:10px;">Choose a preset or skip to customize manually</div>' +
          '<div class="ve-export-row"><label>Platform</label>' +
            '<select id="ve-export-platform" class="ve-export-select">' + platformHTML + '</select></div>' +
          '<div id="ve-platform-warn"></div>' +
        '</div>' +
        // Step 1: Settings
        '<div class="ve-wiz-panel" data-panel="1">' +
          // scan-3000 C8: only MP4 has a real encoder (WebCodecs). The other
          // four options were dead ends ("Encoder not available") at the end
          // of the wizard; re-add them WITH their encoders, never before.
          '<div class="ve-export-row"><label>Format</label>' +
            '<select id="ve-export-format" class="ve-export-select">' +
              '<option value="mp4" selected>MP4 (H.264)</option>' +
            '</select></div>' +
          '<div class="ve-export-row"><label>Resolution</label>' +
            '<select id="ve-export-quality" class="ve-export-select">' + _resHTML + '</select></div>' +
          '<div class="ve-export-row"><label>FPS</label>' +
            '<select id="ve-export-fps" class="ve-export-select">' +
              '<option value="24">24 fps (Film)</option>' +
              '<option value="30" selected>30 fps</option>' +
              '<option value="60">60 fps (Smooth)</option>' +
            '</select></div>' +
          '<div class="ve-export-row"><label>Preset</label>' +
            '<select id="ve-export-preset" class="ve-export-select">' +
              '<option value="draft">Draft (Fast)</option>' +
              '<option value="standard" selected>Standard</option>' +
              '<option value="high">High Quality</option>' +
            '</select></div>' +
          /* Only when there is a video source we could measure: with nothing to measure this would
             be a switch that does nothing. The summary card below spells out what it did. */
          (_spRate ?
            '<div class="ve-export-row"><label>Original</label>' +
              '<label class="ve-export-audio-toggle" style="display:flex;align-items:center;gap:8px;cursor:pointer;">' +
                '<input type="checkbox" id="ve-export-source-cap"' + (VE._veExportSourceCap === false ? '' : ' checked') +
                  ' style="accent-color:var(--gold);width:16px;height:16px;">' +
                '<span style="font-size:12px;color:var(--text);">Match the original\'s quality</span>' +
              '</label></div>' : '') +
          // scan-3000 C8: ffmpeg/legacy encoders do not exist; listing them
          // (even disabled) implied fallbacks that were never real.
          '<div class="ve-export-row"><label>Encoder</label>' +
            '<select id="ve-export-encoder" class="ve-export-select">' +
              '<option value="auto" selected>Auto (Best Available)</option>' +
              '<option value="webcodecs"' + (VE._veHasWebCodecs() ? '' : ' disabled') + '>WebCodecs (HW)' + (VE._veHasWebCodecs() ? '' : ' \u2014 N/A') + '</option>' +
            '</select></div>' +
          (VE._veProjectHasAudio() ?
            '<div class="ve-export-row" id="ve-export-audio-row"><label>Audio</label>' +
              '<label class="ve-export-audio-toggle" style="display:flex;align-items:center;gap:8px;cursor:pointer;">' +
                '<input type="checkbox" id="ve-export-include-audio" checked style="accent-color:var(--gold);width:16px;height:16px;">' +
                '<span style="font-size:12px;color:var(--text);">Include audio tracks</span>' +
              '</label></div>' : '') +
          '<div class="ve-export-row"><label>Range</label>' +
            '<div style="display:flex;align-items:center;gap:4px;">' +
            '<input type="number" class="ve-export-input" id="ve-export-range-start" value="0" min="0" step="0.1" style="width:56px">' +
            '<span style="color:var(--text-dim);font-size:11px;">to</span>' +
            '<input type="number" class="ve-export-input" id="ve-export-range-end" value="' + dur.toFixed(1) + '" min="0" step="0.1" style="width:56px">' +
            '<span style="color:var(--text-dim);font-size:11px;">sec</span></div></div>' +
        '</div>' +
        // Step 2: Export / Progress
        '<div class="ve-wiz-panel" data-panel="2">' +
          '<div class="ve-export-summary" id="ve-export-summary"></div>' +
          '<div id="ve-export-progress" class="ve-export-progress" style="display:none;">' +
            '<div class="ve-export-progress-track"><div class="ve-export-progress-bar" id="ve-export-progress-bar"></div></div>' +
            '<div class="ve-export-progress-text"><span id="ve-export-progress-text">Ready to export</span><span class="ve-pct" id="ve-export-pct"></span></div>' +
          '</div>' +
        '</div>' +
        // Footer. scan-3000 H28: the Thumb + Pause buttons had literally empty
        // handlers (their features were removed); rendered-but-dead UI is out.
        '<div class="ve-export-footer">' +
          '<div class="ve-export-footer-left"></div>' +
          '<div class="ve-export-footer-right">' +
            '<button class="ve-export-btn ve-export-btn--secondary" id="ve-export-back" style="display:none">' +
              VE._veIcon('arrow-left', 12) + ' Back</button>' +
            '<button class="ve-export-btn ve-export-btn--danger" id="ve-export-cancel" style="display:none">' +
              VE._veIcon('x', 12) + ' Cancel</button>' +
            '<button class="ve-export-btn ve-export-btn--primary" id="ve-export-next">' +
              'Next ' + VE._veIcon('arrow-right', 12) + '</button>' +
            '<button class="ve-export-btn ve-export-btn--primary" id="ve-export-start" style="display:none">' +
              VE._veIcon('download', 12) + ' Export</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    // ── Wizard Navigation ──
    var steps = overlay.querySelectorAll('.ve-wiz-step');
    var panels = overlay.querySelectorAll('.ve-wiz-panel');
    var nextBtn = document.getElementById('ve-export-next');
    var backBtn = document.getElementById('ve-export-back');
    var startBtn = document.getElementById('ve-export-start');
    var cancelBtn = document.getElementById('ve-export-cancel');

    function goToStep(n) {
      currentStep = n;
      steps.forEach(function(s, i) {
        s.classList.toggle('active', i === n);
        if (i < n) s.classList.add('done'); else s.classList.remove('done');
      });
      panels.forEach(function(p, i) { p.classList.toggle('active', i === n); });
      // Button visibility
      backBtn.style.display = n > 0 ? '' : 'none';
      nextBtn.style.display = n < 2 ? '' : 'none';
      startBtn.style.display = n === 2 ? '' : 'none';
      // Update summary on step 2
      if (n === 2) _updateSummary();
    }

    // Step clicks
    steps.forEach(function(s) {
      s.addEventListener('click', function() {
        var target = parseInt(s.dataset.step, 10);
        if (target <= currentStep + 1) goToStep(target);
      });
    });

    nextBtn.addEventListener('click', function() { if (currentStep < 2) goToStep(currentStep + 1); });
    backBtn.addEventListener('click', function() { if (currentStep > 0) goToStep(currentStep - 1); });

    // Close
    document.getElementById('ve-export-close').addEventListener('click', function() { overlay.remove(); });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

    /* ── Platform preset ──
       Fills in resolution + frame rate from the platform's own published spec and REPORTS what the
       preset could not do. It cannot set the aspect ratio: the export frame always follows the
       working canvas, which is why the old aspect picker was removed in favour of a read-only fact,
       so a vertical platform on a landscape canvas warns instead of shipping the wrong shape.

       "None" clears the advice and leaves resolution and frame rate alone. Undoing a choice must not
       silently rewrite them to something the user never picked. */
    var platformSel = document.getElementById('ve-export-platform');
    var platformWarn = document.getElementById('ve-platform-warn');
    if (platformSel) {
      platformSel.addEventListener('change', function() {
        if (platformWarn) platformWarn.innerHTML = '';
        if (!platformSel.value) return;
        var adv = (window.VEWebCodecsExport && VEWebCodecsExport.platformAdvice)
          ? VEWebCodecsExport.platformAdvice(platformSel.value,
              (typeof CW !== 'undefined' && CW) || 1920,
              (typeof CH !== 'undefined' && CH) || 1080, dur, _spShort)
          : null;
        if (adv) {
          var qs = document.getElementById('ve-export-quality');
          var fs = document.getElementById('ve-export-fps');
          if (qs) qs.value = adv.quality;
          if (fs) fs.value = String(adv.fps);
          if (platformWarn) {
            platformWarn.innerHTML = adv.warnings.length
              ? '<div class="ve-platform-warn-box">' + VE._veIcon('alert-triangle', 13) + ' ' +
                adv.warnings.join('<br>') + '</div>'
              : '<div class="ve-platform-ok-box">' + VE._veIcon('check', 13) + ' ' +
                adv.platform.label + ': ' +
                (adv.quality === 'canvas' ? 'canvas size' : adv.quality + 'p') +
                ' at ' + adv.fps + ' fps, and this canvas is already ' + adv.platform.aspectLabel + '.</div>';
          }
          _updateSummary();
        }
        _updateEst();
        // Auto-advance to step 1. A warning is exactly the case NOT to rush past, so it stays put.
        if (!adv || !adv.warnings.length) setTimeout(function() { goToStep(1); }, 250);
      });
    }

    // ── Export click ──
    startBtn.addEventListener('click', function() {
      var fmt      = document.getElementById('ve-export-format').value;
      var quality  = document.getElementById('ve-export-quality').value;
      // Aspect is no longer a picker: output is derived from the working canvas
      // (CW×CH) inside computeExportDimensions. We still forward the current
      // canvas aspect key for labelling / bitrate.
      var aspect   = (window.VideoCanvas && VideoCanvas.getAspectRatio) ? VideoCanvas.getAspectRatio() : ((VE._veProject && VE._veProject.aspectRatio) || '');
      var fps      = parseInt(document.getElementById('ve-export-fps').value, 10) || 30;
      var encoder  = document.getElementById('ve-export-encoder').value;
      var preset   = document.getElementById('ve-export-preset').value || 'standard';
      var rangeS   = parseFloat(document.getElementById('ve-export-range-start').value) || 0;
      var rangeE   = parseFloat(document.getElementById('ve-export-range-end').value) || dur;

      // Show progress UI
      var progressEl = document.getElementById('ve-export-progress');
      if (progressEl) progressEl.style.display = '';
      startBtn.style.display = 'none';
      backBtn.style.display = 'none';
      cancelBtn.style.display = '';

      var pt  = document.getElementById('ve-export-progress-text');
      var bar = document.getElementById('ve-export-progress-bar');
      var pct = document.getElementById('ve-export-pct');

      // Determine encoder path
      var useWebCodecs = (encoder === 'webcodecs') ||
                         (encoder === 'auto' && VE._veHasWebCodecs());

      if (useWebCodecs && fmt === 'mp4') {
        VE._veStartWebCodecsExport({
          quality: quality, aspect: aspect, fps: fps, preset: preset,
          startTime: rangeS, endTime: rangeE,
          progressText: pt, progressBar: bar, progressPct: pct,
          startBtn: startBtn, backBtn: backBtn,
          cancelBtn: cancelBtn
        });
      } else {
        if (pt) pt.textContent = 'Encoder not available for ' + fmt.toUpperCase();
      }
    });

    // Cancel button
    cancelBtn.addEventListener('click', function() {
      if (VE._veExportHandle) { VE._veExportHandle.cancel(); VE._veExportHandle = null; }
      VE._veExporting = false;
      VE._veDisposeExportSnapshot();
      startBtn.style.display = '';
      startBtn.disabled = false;
      startBtn.innerHTML = VE._veIcon('download', 12) + ' Export';
      cancelBtn.style.display = 'none';
      backBtn.style.display = '';
      var pt = document.getElementById('ve-export-progress-text');
      if (pt) pt.textContent = 'Cancelled';
    });

    // ── Update summary card on step 2 ──
    function _updateSummary() {
      var el = document.getElementById('ve-export-summary');
      if (!el) return;
      var fmt = document.getElementById('ve-export-format').value;
      var q = document.getElementById('ve-export-quality').value;
      var aspect = (window.VideoCanvas && VideoCanvas.getAspectRatio) ? VideoCanvas.getAspectRatio() : ((VE._veProject && VE._veProject.aspectRatio) || '');
      var fps = document.getElementById('ve-export-fps').value;
      var rangeS = parseFloat(document.getElementById('ve-export-range-start').value) || 0;
      var rangeE = parseFloat(document.getElementById('ve-export-range-end').value) || dur;
      var d = rangeE - rangeS;
      // Estimate file size based on bitrate
      var dim = (window.VEWebCodecsExport && VEWebCodecsExport.computeExportDimensions)
        ? VEWebCodecsExport.computeExportDimensions(q, aspect)
        : { br: 5000000 };
      /* With constant quality there is no fixed rate, so `bitrate x duration` would print the
         FALLBACK ceiling and be wrong by several times. The honest form is a range: the same QP on a
         locked-off interview and on confetti differ by more than 4x, and a 51 minute shoot deserves
         to know roughly what is coming BEFORE it waits 25 minutes for it. */
      var presetSel = document.getElementById('ve-export-preset');
      var presetVal = (presetSel && presetSel.value) || 'standard';
      var estMB = '', estNote = '';
      if (window.VEWebCodecsExport && VEWebCodecsExport.estimateQualitySize && dim.w && dim.h) {
        // The checkbox feeds VE._veExportSourceCap, which the LAUNCHER also reads, so this estimate
        // and the QP the encoder finally receives are the same decision.
        var capBox = document.getElementById('ve-export-source-cap');
        if (capBox) VE._veExportSourceCap = !!capBox.checked;
        var srcBr = (VE._veExportSourceCap === false) ? 0 : _spRate;
        // ONE number, and honestly labelled an estimate: the model cannot know this project's
        // content, which is worth several times over (see ve-webcodecs-export.js).
        // Audio is part of the file and the probe cannot see it (it encodes video with no muxer):
        // 128 kbps over 51 minutes is 49 MB, which was simply missing from this number.
        // Read the checkbox HERE. `audioCheck` is declared further down for the summary row, and
        // `var` hoisting made it `undefined` at this point, so unticking audio still counted it.
        var _acBox = document.getElementById('ve-export-include-audio');
        var wantAudioEst = _acBox ? _acBox.checked : VE._veProjectHasAudio();
        var es = VEWebCodecsExport.estimateQualitySize(dim.w, dim.h, fps, d, presetVal, srcBr, _measured, wantAudioEst);
        if (es.bytes > 0) {
          // A measured figure accurate to ~8% deserves a decimal below 100 MB.
          var unit = function (b) {
            var mb = b / 1048576;
            if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
            return (mb < 100 ? mb.toFixed(1) : mb.toFixed(0)) + ' MB';
          };
          estMB = unit(es.bytes) + (es.targetBitrate ? ' (target)' : (es.measured ? ' (measured)' : ' (estimate)'));
        }
        /* Plain language, deliberately: megabits and quantisers are our problem, not the user's.
           The QP numbers still go to the console. Same wording source as the other dialog. */
        if (_measuring) estMB = 'measuring… ' + (_measuringPct ? _measuringPct + '%' : '');
        if (es.capped) {
          estNote = 'Your original video was already compressed, so exporting it at full quality would ' +
                    'only make a bigger file of the same picture. This keeps the export ' +
                    VEWebCodecsExport.headroomPhrase(es.headroom) + '.';
        } else if (!srcBr) {
          // Same missing sentence as the other dialog: an uncapped export must say it is uncapped.
          estNote = (VE._veExportSourceCap === false)
            ? 'Quality matching is off, so this export is not tied to your original\'s size and can come out considerably larger.'
            : 'Your original could not be measured, so this export is NOT limited to its size and may come out considerably larger.';
        } else if (dim.w && dim.h && Math.min(dim.w, dim.h) > _spDetail) {
          estNote = 'Your video is only ' + _spDetail + 'p, so this setting stretches it to fit. ' +
                    'The file gets bigger; the picture does not.';
        }
      } else {
        var estBytes = dim.br * d / 8;
        estMB = estBytes > 0 ? (estBytes / 1048576).toFixed(1) + ' MB' : '';
      }
      var qLabels = { 'canvas': 'Canvas', '480': '480p', '720': '720p', '1080': '1080p FHD', '1440': '1440p QHD', '2160': '4K UHD' };
      // The Source entry is a bare short side (e.g. 360) and is not on the ladder, so it has no fixed
      // label; without this the summary printed "Kalite: 360".
      if (!qLabels[q] && /^\d+$/.test(String(q))) qLabels[q] = 'Source ' + q + 'p';
      var fmtLabels = { 'mp4': 'MP4', 'webm': 'WebM', 'gif': 'GIF', 'audio': 'WAV', 'sequence': 'Image ZIP' };
      // scan-3000 C8: no fake fallback labels; without WebCodecs the summary
      // says so honestly (the export button path reports the same).
      var encoder = VE._veHasWebCodecs() ? 'WebCodecs (HW)' : 'Unsupported (No WebCodecs)';
      // Audio status
      var audioCheck = document.getElementById('ve-export-include-audio');
      var audioLabel = audioCheck ? (audioCheck.checked ? 'Yes' : 'No') : (VE._veProjectHasAudio() ? 'Yes' : 'No audio');
      el.innerHTML =
        '<div class="ve-export-summary-title">' + VE._veIcon('info', 14) + ' Export Summary</div>' +
        '<div class="ve-export-summary-grid">' +
          '<div class="ve-export-summary-item">Format: <span>' + (fmtLabels[fmt] || fmt) + '</span></div>' +
          '<div class="ve-export-summary-item">Kalite: <span>' + (qLabels[q] || q) + '</span></div>' +
          '<div class="ve-export-summary-item">Resolution: <span>' + (dim.w && dim.h ? dim.w + '×' + dim.h : '—') + '</span></div>' +
          '<div class="ve-export-summary-item">FPS: <span>' + fps + '</span></div>' +
          '<div class="ve-export-summary-item">Duration: <span>' + VE._veFormatTime(d) + '</span></div>' +
          '<div class="ve-export-summary-item">Est. Size: <span>' + (estMB || '—') + '</span></div>' +
          '<div class="ve-export-summary-item">Tracks: <span>' + VE._veProject.tracks.length + '</span></div>' +
          '<div class="ve-export-summary-item">Encoder: <span>' + encoder + '</span></div>' +
          '<div class="ve-export-summary-item">Audio: <span>' + audioLabel + '</span></div>' +
        '</div>' +
        (estNote ? '<div class="ve-export-summary-note">' + estNote + '</div>' : '');
    }

    // ── Estimate update ──
    var qualSel = document.getElementById('ve-export-quality');
    var fpsSel = document.getElementById('ve-export-fps');

    function _updateEst() {
      var rangeEnd = parseFloat(document.getElementById('ve-export-range-end').value) || dur;
      var rangeStart = parseFloat(document.getElementById('ve-export-range-start').value) || 0;
      var d = rangeEnd - rangeStart;
      var info = document.getElementById('ve-export-dur-info');
      if (info) info.textContent = VE._veFormatTime(d);
    }

    if (qualSel) qualSel.addEventListener('change', _updateEst);
    if (fpsSel) fpsSel.addEventListener('change', _updateEst);
    /* The size estimate now depends on the PRESET too (it selects the QP), and the summary was only
       ever refreshed on reaching step 2. Without this, changing Preset silently left a stale figure
       on screen, which is worse than no figure. */
    var _presetSel = document.getElementById('ve-export-preset');
    var _capSel = document.getElementById('ve-export-source-cap');

    /* Measure in the Worker. Cached per resolution+fps+preset, debounced, superseded by the newest
       request. Every expensive step is on the other side of a postMessage, so this cannot stall the
       editor however long it takes. */
    var _probeSeq = 0, _probeTimer = null;
    function _measure() {
      if (!VE._veProbeSourceSize || !window.VESizeProbe || !VESizeProbe.isAvailable()) return;
      var q = (qualSel && qualSel.value) || 'canvas';
      var f = parseInt((fpsSel && fpsSel.value) || 30, 10);
      var pr = (_presetSel && _presetSel.value) || 'standard';
      var key = q + '|' + f + '|' + pr;
      if (_probeCache[key]) {
        // Same cache-hit gap as the other dialog: the global the launcher reads must be set here too.
        _measured = _probeCache[key]; VE._veExportMeasured = _measured;
        _measuring = false; _updateSummary(); return;
      }
      clearTimeout(_probeTimer);
      _measured = null; _measuring = true; _measuringPct = 0; _updateSummary();
      var seq = ++_probeSeq;
      _probeTimer = setTimeout(function () {
        VE._veProbeSourceSize({
          quality: q, fps: f, preset: pr,
          aspect: (window.VideoCanvas && VideoCanvas.getAspectRatio) ? VideoCanvas.getAspectRatio() : (VE._veProject.aspectRatio || ''),
          onProgress: function (p) {
            if (seq !== _probeSeq) return;
            var pc = Math.round(p * 100);
            if (pc - _measuringPct < 10 && pc < 100) return;
            _measuringPct = pc; _updateSummary();
          }
        }).then(function (m) {
          _probeCache[key] = m;
          if (seq !== _probeSeq) return;
          _measuring = false; _measured = m; VE._veExportMeasured = m;
          _updateSummary();
        })['catch'](function (e) {
          if (seq !== _probeSeq) return;
          _measuring = false;
          if (e && e.message !== 'aborted') console.warn('[VE export] size probe skipped:', e && e.message);
          _updateSummary();
        });
      }, 350);
    }

    function _settingsChanged() {
      if (_capSel) VE._veExportSourceCap = !!_capSel.checked;
      _measured = null; VE._veExportMeasured = null;
      _measure();
      _updateSummary();
    }
    [_presetSel, qualSel, fpsSel, _capSel, document.getElementById('ve-export-include-audio')]
      .forEach(function (el) { if (el) el.addEventListener('change', _settingsChanged); });
    /* Byte sizes first: a project reloaded from IndexedDB has no `clip._file`, the source bitrate
       reads 0, and the quality cap then silently does nothing at all. */
    (VE._veEnsureSourceBytes ? VE._veEnsureSourceBytes() : Promise.resolve()).then(function () {
      var sp2 = VE._veSourceProfile();
      _spRate = (sp2 && sp2.bitrate) || 0;
      _updateSummary();
      _measure();
    });

    // ── Minimize button handler ──
    var minimizeBtn = document.getElementById('ve-export-minimize');
    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', function() { VE._veExportMinimize(); });
    }
  };

  /* opts.width/opts.height = the EXPORT frame size (plan 1.2).
     The snapshot used to be built at project size and the finished composite was then stretched to
     the export size with one drawImage, so a "4K" export was a 1080p render blown up: subtitles,
     text, grading and feathers all rasterised at 1080p. Fabric object coordinates live in PROJECT
     space, so the canvas cannot simply be made bigger; the supported way (already used by every
     other export path in this app) is a zoom/viewport scale, which moves and scales every object
     together. `enableRetinaScaling:false` stays mandatory or a high-DPR monitor doubles it again. */
  VE._veCreateExportSnapshot = function (callback, opts) {
    opts = opts || {};
    var projW = CW || 1920;
    var projH = CH || 1080;
    var outW = opts.width || projW;
    var outH = opts.height || projH;
    var scale = Math.min(outW / projW, outH / projH);
    if (!isFinite(scale) || scale <= 0) scale = 1;

    // Gather extra properties for JSON round-trip
    var extraProps = (typeof CUSTOM_PROPS !== 'undefined' ? CUSTOM_PROPS.slice() : []);
    VE._VE_CLONE_PROPS.forEach(function(p) {
      if (extraProps.indexOf(p) === -1) extraProps.push(p);
    });

    // Snapshot only overlay objects (those with _veClipId)
    var overlayObjs = [];
    if (typeof canvas !== 'undefined' && canvas) {
      canvas.getObjects().forEach(function(obj) {
        if (obj._veClipId) overlayObjs.push(obj);
      });
    }

    // Create a minimal JSON with only overlay objects
    var snapshotJson = {
      version: '5.3.1',
      objects: overlayObjs.map(function(obj) { return obj.toObject(extraProps); })
    };

    // Create static canvas (offscreen, no DOM insertion) AT EXPORT SIZE
    var sc = new fabric.StaticCanvas(null, {
      width: Math.round(projW * scale),
      height: Math.round(projH * scale),
      enableRetinaScaling: false  // consistent pixel dimensions for export
    });
    // One zoom for the whole scene: overlays keep their project coordinates and are drawn at the
    // export resolution instead of being upscaled afterwards.
    if (scale !== 1) sc.setZoom(scale);

    // Set preview canvas as backgroundImage so video frames appear. The canvas may now be at EXPORT
    // resolution (see _veExportPreviewSize), so map it explicitly onto the project coordinate space
    // the zoom above works in: object space is always projW x projH, whatever the bitmap size is.
    var _pvs = VE._veUi.previewCanvas;
    var bgImg = new fabric.Image(_pvs, {
      left: 0, top: 0, originX: 'left', originY: 'top',
      objectCaching: false
    });
    bgImg.scaleX = projW / ((_pvs && _pvs.width) || projW);
    bgImg.scaleY = projH / ((_pvs && _pvs.height) || projH);
    sc.backgroundImage = bgImg;
    sc.backgroundColor = '';

    // Load overlay objects into the static canvas
    fabric.util.enlivenObjects(snapshotJson.objects, function(enlivenedObjs) {
      enlivenedObjs.forEach(function(obj) { sc.add(obj); });
      /* No overlay objects means the snapshot's renderAll would copy the preview canvas and draw
         nothing on it. The compositor checks this flag per frame to skip the whole Fabric hop. */
      VE._veExportSnapshotEmpty = enlivenedObjs.length === 0;
      /* S6 (export plan): the snapshot re-loads every overlay image BY URL. A revoked blob:, a 403 or
         an expired presigned link yields a fabric.Image with no backing element - it renders as
         nothing, and the export finished happily with a hole where the logo was. fabric gives us no
         failure callback, so check the result. */
      var _missing = enlivenedObjs.filter(function (o) {
        return o && o.type === 'image' && !o.getElement();
      }).length;
      if (_missing) {
        console.warn('[VE export] ' + _missing + ' overlay image(s) failed to load into the snapshot');
        if (typeof showToast === 'function') {
          showToast(_missing + ' overlay image(s) could not be loaded and will be missing from the export', 'error');
        }
      }
      callback(sc, bgImg);
    }, '', function(json, obj) {
      // reviver: copy custom VE props that may not survive JSON round-trip
      VE._VE_CLONE_PROPS.forEach(function(p) {
        if (json[p] !== undefined) obj[p] = json[p];
      });
    });
  };

  /* X2 (export plan): freeze the TRACK DATA for the run, not just the Fabric objects.

     `_veCreateExportSnapshot` isolates overlays so the user can keep designing, and that was sold as
     "keep working while it exports". It was only half true: every frame re-read the LIVE
     `VE._veProject.tracks`, so dragging a clip, trimming it, deleting it or touching a grade in the
     middle of a run rewrote the film from that frame on. The user was invited to do exactly the thing
     that corrupts the file.

     A shallow JSON clone is the whole fix: ids still match the pool and the frame sources, but every
     value the compositor reads is the one that existed when Export was pressed. `_file` is re-attached
     by reference afterwards because a Blob does not survive JSON and the decoder prefers it. */
  VE._veFreezeTracksForExport = function () {
    var live = VE._veProject.tracks || [];
    var frozen = JSON.parse(JSON.stringify(live, function (k, v) {
      if (k === '_thumbCache' || k === '_waveformUrl' || k === '_file' || k === '_mediaInfo'
          || k === '_filmstripCache' || k === '_filmstripPending' || k === '_filmstripOrder' || k === '_filmstripRequestToken') return undefined;
      return v;
    }));
    var byId = {};
    live.forEach(function (t) { ((t && t.clips) || []).forEach(function (c) { if (c && c.id) byId[c.id] = c; }); });
    frozen.forEach(function (t) {
      ((t && t.clips) || []).forEach(function (c) {
        var src = byId[c.id];
        if (src && src._file) c._file = src._file;
      });
    });
    return frozen;
  };

  /** The track list every export stage must read: the frozen one while a run is active. */
  VE._veExportTracksNow = function () {
    return VE._veExportTracks || VE._veProject.tracks;
  };

  /* ─── WHAT THE TIMELINE'S VIDEO ACTUALLY CARRIES ──────────────────────────────────────────────
     Two things need this and neither could ask for it before:

       1. the resolution list, which offered 4K next to 720p with no hint that a 640x360 timeline
          cannot fill either of them. The owner exported a 51 minute 4K file (14 GB, then 29 GB
          after the ladder was raised) from 640x360 footage, and nothing in the UI said the extra
          pixels were invented.
       2. the source-aware quality cap (VEWebCodecsExport.sourceAdaptedQp), which needs the
          source's bit density to know when QP18 is spending bits on compression artifacts.

     `bitrate` is the MOST DEMANDING video clip, not an average: relaxing quality to suit the
     softest clip on the timeline would damage the sharpest one. `shortSide` is the LARGEST video's
     short side, for the same reason in the other direction.

     What we can measure is `clip._file` (every import path passes a real File/Blob, including the
     recorder and the library fetch). A clip whose bytes we cannot see contributes nothing rather
     than a guess, and a timeline with no measurable clip returns bitrate 0 = "do not cap". */
  /* Resolve how many BYTES each video clip's media actually is, for clips that no longer carry a
     `_file`. Every project reloaded from IndexedDB is in that state, and it was silently fatal: the
     source bitrate came out 0, so the quality cap did nothing at all and "Fast" produced a file
     larger than its own source with nothing on screen saying why.

     Three ways to get a size, cheapest first, and none of them disturbs playback:
       1. `_file`, when the clip was imported this session
       2. a `blob:` URL - fetching it is a local memory read, no network
       3. an http(s) URL - a HEAD request, so we read Content-Length instead of the file

     Reading `el.currentSrc` off the pool element is a property read, not a seek: it changes nothing
     and costs nothing. That is a different thing from what the deleted probe did to the pool, and
     the distinction is the point - inspecting shared state is fine, MUTATING it is not.

     Best effort throughout: a clip we cannot size simply stays unmeasured, and the UI says the cap
     is off rather than pretending it is on. */
  VE._veEnsureSourceBytes = function () {
    var jobs = [];
    ((VE._veProject && VE._veProject.tracks) || []).forEach(function (t) {
      ((t && t.clips) || []).forEach(function (cl) {
        if (!cl || cl.type !== 'video') return;
        /* `_srcBytesFailed` used to latch for the whole session: one revoked blob URL, one HEAD
           without Content-Length, and the clip stayed "unmeasurable" forever, which silently means
           NO QUALITY CAP with nothing on screen to say so. Retry on every fresh resolve; the cost
           is one local read or one HEAD. */
        if ((cl._file && cl._file.size) || cl._srcBytes) return;
        cl._srcBytesFailed = false;
        var el = VE._vePlayback && VE._vePlayback.videoPool[cl.id];
        var src = cl.src || (el && (el.currentSrc || el.src));
        if (!src) { cl._srcBytesFailed = true; return; }
        var p;
        if (/^blob:/i.test(src)) {
          p = fetch(src).then(function (r) { return r.blob(); }).then(function (b) { cl._srcBytes = b.size; });
        } else {
          p = fetch(src, { method: 'HEAD' }).then(function (r) {
            var len = parseInt(r.headers.get('content-length') || '0', 10);
            if (len > 0) cl._srcBytes = len; else throw new Error('no-content-length');
          });
        }
        jobs.push(p['catch'](function () { cl._srcBytesFailed = true; }));
      });
    });
    return jobs.length ? Promise.all(jobs) : Promise.resolve();
  };

  VE._veSourceProfile = function () {
    var tracks = (VE._veProject && VE._veProject.tracks) || [];
    var maxRate = 0, maxPx = 0, w = 0, h = 0, videoClips = 0, measured = 0;
    var heaviest = null;   // the clip the size probe should sample: the most demanding one
    for (var t = 0; t < tracks.length; t++) {
      var clips = (tracks[t] && tracks[t].clips) || [];
      for (var c = 0; c < clips.length; c++) {
        var cl = clips[c];
        if (!cl || cl.type !== 'video') continue;
        videoClips++;
        var px = (cl._mediaWidth || 0) * (cl._mediaHeight || 0);
        // The probe needs SOME clip to sample even when no byte size could be resolved: measuring
        // the encoding cost does not need the source's file size, only its pixels.
        if (px > maxPx) { maxPx = px; w = cl._mediaWidth; h = cl._mediaHeight; if (!heaviest) heaviest = cl; }
        // `_srcBytes` is filled in by _veEnsureSourceBytes for clips that have no `_file`. Without
        // it a project reloaded from IndexedDB reports bitrate 0, the quality cap silently does
        // NOTHING, and "Fast" runs at a flat QP with no relationship to the source at all: that is
        // how a 168 MB source came back as a 450 MB "low quality" export.
        var bytes = (cl._file && cl._file.size) || cl._srcBytes || 0;
        // _srcDuration is the media's own length; `duration` is the trimmed length on the timeline,
        // and dividing bytes by the trimmed length would report a wildly inflated bitrate.
        var d = cl._srcDuration || cl.duration || 0;
        if (bytes > 0 && d > 0) {
          measured++;
          var br = bytes * 8 / d;
          if (br > maxRate) { maxRate = br; heaviest = cl; }   // a sized clip beats the pixel fallback
        }
      }
    }
    if (!videoClips) return null;
    return {
      bitrate: maxRate,                                    // bits/sec, 0 = unmeasurable
      width: w || 0, height: h || 0,
      shortSide: (w && h) ? Math.min(w, h) : 0,
      clips: videoClips, measured: measured,
      // The clip VESizeProbe samples. Its BLOB is all that leaves the editor; the probe never
      // reads the pool element this clip is playing through.
      clip: heaviest
    };
  };

  /* The user's opt-out, shared by both export dialogs and by the launcher, so the estimate on screen
     and the QP the encoder receives are always derived from the same answer. Default ON: the case it
     fixes (a re-encode several times the size of its own source, at the same resolution, with no
     visible gain) is the common one, and it is reported in the UI rather than applied silently. */
  VE._veExportSourceCap = (VE._veExportSourceCap !== false);

  VE._veExportSourceBitrate = function () {
    if (VE._veExportSourceCap === false) return 0;
    var sp = VE._veSourceProfile();
    return (sp && sp.bitrate) || 0;
  };

  /* ─── SIZE MEASUREMENT, THE NON-DESTRUCTIVE ONE ───────────────────────────────────────────────
     The first probe rendered its frames by driving the LIVE editor and had to be deleted: it
     resized `VE._veUi.previewCanvas` to the export size, took over the shared export state, seeked
     the video pool and moved the playhead, automatically, the moment a dialog opened. The canvas
     stuttered and the video broke (docs/…-plan.md Part 7).

     This picks the timeline's most demanding video clip and hands its BLOB to `VESizeProbe`, which
     demuxes, decodes, draws and encodes entirely in a Worker. Nothing here reads or writes anything
     the editor owns: no canvas, no pool element, no playhead, no VE flag. The only thing that
     crosses the boundary is a Blob and a number.

     It measures at the preset's BASE quantiser, because the quality cap's decision depends on the
     measurement and the measurement would otherwise depend on the cap. `estimateQualitySize` scales
     the result along the QP axis afterwards, which is legitimate (4.5-5.35 QP per halving) in a way
     that scaling across resolutions is not. */
  VE._veProbeSourceSize = function (o) {
    o = o || {};
    if (!window.VESizeProbe || !VESizeProbe.isAvailable()) return Promise.reject(new Error('unsupported'));
    if (!window.VEWebCodecsExport) return Promise.reject(new Error('no-engine'));

    var sp = VE._veSourceProfile();
    if (!sp || !sp.clip) return Promise.reject(new Error('no-source'));

    var fps = parseInt(o.fps, 10) || 30;
    var dim = VEWebCodecsExport.computeExportDimensions(o.quality, o.aspect);
    if (!dim.w || !dim.h) return Promise.reject(new Error('bad-dimensions'));

    var preset = o.preset || 'standard';
    var baseQp = VEWebCodecsExport.PRESET_QP[preset] != null
      ? VEWebCodecsExport.PRESET_QP[preset] : VEWebCodecsExport.PRESET_QP.standard;

    return VEWebCodecsExport.checkCodecSupport(
      VEWebCodecsExport.buildVideoConfig(o.quality, fps, o.aspect), !VE._veNoConstantQuality
    ).then(function (probe) {
      if (!probe.supported) throw new Error('no-encoder');
      var qpOpt = VEWebCodecsExport.qpFor(probe.codec, preset, baseQp);
      /* Sampling budget, same shape the export's own reasoning uses: more windows for a longer
         source so it is sampled across its whole length, fewer when each frame is expensive.
         Capped at 12 - past that the seeks cost more than the accuracy is worth. */
      var mediaSecs = sp.clip._srcDuration || sp.clip.duration || 0;
      var windows = mediaSecs < 4 ? 1 : Math.max(4, Math.min(12,
        Math.min(Math.round(mediaSecs / 240), Math.round(24e6 / (dim.w * dim.h)))));
      return VESizeProbe.measure({
        clip: sp.clip,
        mediaSeconds: mediaSecs,
        width: dim.w, height: dim.h, fps: fps,
        codec: probe.codec, accel: probe.accel, bitrate: dim.br,
        gop: fps,                                   // matches the export's gopSize
        qp: (probe.bitrateMode === 'quantizer') ? qpOpt.qp : null,
        qpKey: qpOpt.key,
        windows: windows, winFrames: fps,
        onProgress: o.onProgress
      }).then(function (m) {
        m.qp = baseQp;                              // the H.264-scale QP the estimate reasons in
        return m;
      });
    });
  };

  /* Everything the export draws that came from another origin. Used only to NAME the offenders when
     the taint probe fires, so the message points at a file the user recognises. */
  VE._veListRemoteSources = function () {
    var out = [];
    function note(name, src) {
      if (!src || !/^https?:/i.test(src)) return;
      if (src.indexOf(location.origin + '/') === 0) return;
      var label = name || src.split('/').pop().split('?')[0] || src;
      if (out.indexOf(label) === -1) out.push(label);
    }
    (VE._veProject.tracks || []).forEach(function (t) {
      ((t && t.clips) || []).forEach(function (c) {
        var el = VE._vePlayback.videoPool[c.id];
        note(c.name || c.fileName, (el && (el.currentSrc || el.src)) || c.src);
      });
    });
    try {
      if (typeof canvas !== 'undefined' && canvas) {
        canvas.getObjects().forEach(function (o) {
          if (o && o._veClipId && (o.getSrc || o._videoSrc)) {
            note(o._customName, (o.getSrc && o.getSrc()) || o._videoSrc);
          }
        });
      }
    } catch (e) { /* naming is best-effort */ }
    return out;
  };

  /* M3 (export plan): media that has not finished loading used to be SKIPPED, per frame, in silence.
     Both skips read the same way to the user - a black hole in the picture - and both are reachable
     without doing anything wrong: after a reload the pool's blob: URLs are re-linked from IndexedDB
     asynchronously, and a remote (S3) clip is still downloading. Hitting Export in that window
     exported black opening frames and reported success.

     So: wait for every clip's element to hold real data before anything reads it, with a deadline,
     and NAME whatever never arrived instead of dropping it quietly. Resolves with the list of clips
     that stayed unready; the caller warns and proceeds (a partial file the user was told about beats
     a refusal, and beats a silent black hole). */
  VE._veAwaitExportMediaReady = function (timeoutMs) {
    var deadline = timeoutMs || 15000;
    var pending = [];
    var notReady = [];

    function ready(el, isVideo) {
      if (!el) return false;
      if (isVideo) return el.readyState >= 2 && el.videoWidth > 0;
      return el.readyState >= 2;
    }

    VE._veProject.tracks.forEach(function (track) {
      track.clips.forEach(function (clip) {
        if (clip.type !== 'video' && clip.type !== 'audio') return;
        var el = VE._vePlayback.videoPool[clip.id];
        var name = clip.name || clip.fileName || clip.id;
        if (!el || !(el.src || el.currentSrc)) { notReady.push(name); return; }
        // M4: a clip still carrying the 5 s placeholder is not ready either, however loaded its
        // element looks - exporting now would bake the placeholder length into the file.
        if (ready(el, clip.type === 'video') && !clip._veDurationProvisional) return;
        // readyState 0 with a src can mean load() was never called (a re-linked element).
        if (el.readyState === 0 && el.load) { try { el.load(); } catch (e) {} }
        pending.push(new Promise(function (resolve) {
          var done = false;
          var finish = function (ok) {
            if (done) return; done = true;
            el.removeEventListener('loadeddata', onOk);
            el.removeEventListener('canplay', onOk);
            el.removeEventListener('error', onErr);
            if (!ok) notReady.push(name);
            resolve();
          };
          var onOk = function () { if (ready(el, clip.type === 'video')) finish(true); };
          var onErr = function () { finish(false); };
          el.addEventListener('loadeddata', onOk);
          el.addEventListener('canplay', onOk);
          el.addEventListener('error', onErr);
          setTimeout(function () { finish(ready(el, clip.type === 'video')); }, deadline);
        }));
      });
    });

    if (!pending.length) return Promise.resolve(notReady);
    return Promise.all(pending).then(function () { return notReady; });
  };

  /* PHASE 2: one sequential decoder per video clip, opened at export start and closed with the
     snapshot. Best-effort by design: a clip that cannot be opened is simply absent from the map and
     falls back to the element-seek path, so a codec Mediabunny cannot read never fails an export. */
  VE._veOpenExportFrameSources = function () {
    VE._veExportFrameSources = {};
    if (!window.VEFrameSource || !VEFrameSource.isAvailable()) return Promise.resolve(0);
    var jobs = [];
    VE._veExportTracksNow().forEach(function (track) {
      track.clips.forEach(function (clip) {
        if (clip.type !== 'video') return;
        var el = VE._vePlayback.videoPool[clip.id];
        if (!el) return;
        jobs.push(VEFrameSource.create(clip, el).then(function (src) {
          if (src) VE._veExportFrameSources[clip.id] = src;
        })['catch'](function () {}));
      });
    });
    return Promise.all(jobs).then(function () {
      var n = Object.keys(VE._veExportFrameSources).length;
      console.info('[VE export] sequential decode active for ' + n + ' clip(s)' + (n ? '' : ' (element-seek fallback)'));
      return n;
    });
  };

  VE._veCloseExportFrameSources = function () {
    var map = VE._veExportFrameSources || {};
    Object.keys(map).forEach(function (id) { try { map[id].close(); } catch (e) {} });
    VE._veExportFrameSources = {};
    // Drop the per-frame overrides so the live preview goes back to its elements. Both lists: the
    // frozen clips carry the overrides, the live ones can too from an earlier run.
    [VE._veExportTracks, VE._veProject && VE._veProject.tracks].forEach(function (list) {
      if (!list) return;
      list.forEach(function (t) {
        ((t && t.clips) || []).forEach(function (c) { if (c._ccFrameOverride) c._ccFrameOverride = null; });
      });
    });
  };

  VE._veDisposeExportSnapshot = function () {
    VE._veCloseExportFrameSources();
    VE._veExportTracks = null;       // X2: back to the live timeline
    VE._veExportCanvasSize = null;   // S4: overlays follow the live canvas again

    // X5: thumbnails deferred during the run. Now that no one else is seeking the pool elements,
    // regenerate them so the timeline is not left with blank strips.
    var _tq = VE._veThumbQueueWhileExporting;
    if (_tq && _tq.length) {
      VE._veThumbQueueWhileExporting = [];
      var _seen = {};
      _tq.forEach(function (job) {
        if (!job.clipId || _seen[job.clipId]) return;
        _seen[job.clipId] = true;
        var c = VE._findClipById && VE._findClipById(job.clipId);
        var el = VE._vePlayback.videoPool[job.clipId];
        if (c && el && VE._veGenerateThumbnails) VE._veGenerateThumbnails(c, el);
      });
    }

    // X4: the user left the video page mid-run, so the subsystem teardown was deferred. Do it now
    // that nothing is reading them; if they came back, VE._veActive is true and it is not ours to do.
    if (VE._veDisposeAfterExport) {
      VE._veDisposeAfterExport = false;
      if (!VE._veActive) {
        if (window.VEPerformance) VEPerformance.destroy();
        if (window.VEAudioAdvanced) VEAudioAdvanced.dispose();
        if (window.VEAdvancedFeatures) VEAdvancedFeatures.dispose();
      }
    }

    // X3: put the playhead back where the user left it. Every terminal path (done / error / cancel)
    // comes through here, which is why the restore belongs here and not at the end of the loop.
    if (VE._veExportPrevPlayhead != null) {
      var _ph = VE._veExportPrevPlayhead;
      VE._veExportPrevPlayhead = null;
      VE._veProject.playheadTime = _ph;
    }
    if (VE._veExportStaticCanvas) {
      VE._veExportStaticCanvas.dispose();
      VE._veExportStaticCanvas = null;
    }
    VE._veExportBgImg = null;

    // 1.2: hand the preview surface back to the editor at project resolution. Every terminal path
    // (done / error / cancel) comes through here, so this is the single restore point.
    if (VE._veExportPreviewSize) {
      var prev = VE._veExportPrevPreviewSize;
      VE._veExportPreviewSize = null;
      VE._veExportPrevPreviewSize = null;
      try {
        var pv = VE._veUi.previewCanvas;
        if (pv && prev) {
          pv.width = prev.w;
          pv.height = prev.h;
          if (VE._veUi.previewFabricImg) {
            VE._veUi.previewFabricImg.width = prev.w;
            VE._veUi.previewFabricImg.height = prev.h;
            VE._veUi.previewFabricImg.dirty = true;
          }
        }
        // Writing width/height wipes the bitmap, so redraw the current frame.
        if (VE._veActive && VE._veRenderPreviewFrame) VE._veRenderPreviewFrame();
      } catch (e) { /* restore is best-effort */ }
    }
  };

  /* The media-local time a clip must show at timeline `time`. ONE definition, used both by the
     per-frame render and by the prefetch primer below: if these two ever computed the instant
     differently the decoder would prefetch frames the renderer never asks for (measured: a 1-frame
     offset on 1/3 of the frames and a 6x slowdown while the window thrashed). */
  VE._veClipLocalTime = function (clip, time, el) {
    var hasKf = window.VEKeyframes && VEKeyframes.hasKeyframes(clip, 'speed');
    var local = hasKf
      ? VEKeyframes.computeSpeedMappedTime(clip, time)
      : (time - clip.startTime) * (clip.speed || 1) + (clip.trimStart || 0);
    return VE._veLoopLocalTime(local, clip, el);
  };

  /* Hand every open frame source the EXACT instants this export will ask for, so the worker can
     decode a window ahead instead of round-tripping per frame. */
  VE._vePrimeExportFrameSources = function (startTime, fps, totalFrames) {
    var map = VE._veExportFrameSources || {};
    var ids = Object.keys(map);
    if (!ids.length) return;
    var byId = {};
    ids.forEach(function (id) { byId[id] = []; });
    VE._veExportTracksNow().forEach(function (track) {
      track.clips.forEach(function (clip) {
        var src = map[clip.id];
        if (!src || !src.prime) return;
        var el = VE._vePlayback.videoPool[clip.id];
        var end = clip.startTime + clip.duration;
        for (var i = 0; i < totalFrames; i++) {
          var t = startTime + i / fps;
          if (t < clip.startTime || t >= end) continue;
          byId[clip.id].push(VE._veClipLocalTime(clip, t, el));
        }
      });
    });
    ids.forEach(function (id) { if (map[id].prime && byId[id].length) map[id].prime(byId[id]); });
  };

  /* Half of one exported frame, in seconds. VE._veExportFps is stamped when an export starts; the
     30 fps fallback keeps any other caller of _veExportRenderFrame on the old behaviour. */
  function _veSeekEpsilon() {
    var fps = VE._veExportFps || 30;
    return 0.5 / (fps > 0 ? fps : 30);
  }

  /* Phase 1 of the export plan: per-stage timing. Every estimate about "where does export time go"
     was a guess, and the rewrite phases (decode via VideoDecoder, GPU compositor, worker) are only
     worth their risk if the stage they attack is actually the expensive one. Costs one
     performance.now() pair per stage per frame. */
  VE._veExportProfileReset = function () {
    VE._veExportProfile = { frames: 0, seekMs: 0, compositeMs: 0, encodeMs: 0, muxMs: 0, audioMs: 0, snapshotMs: 0 };
  };
  VE._veExportProfileSummary = function () {
    var p = VE._veExportProfile;
    if (!p || !p.frames) return '';
    var total = p.seekMs + p.compositeMs + p.encodeMs;
    if (total <= 0) return '';
    var pct = function (v) { return Math.round((v / total) * 100) + '%'; };
    return 'decode ' + pct(p.seekMs) + ' · composite ' + pct(p.compositeMs) + ' · encode ' + pct(p.encodeMs) +
           ' · ' + (total / p.frames).toFixed(1) + ' ms/frame';
  };
  VE._veExportProfileReset();

  VE._veExportRenderFrame = function (exportCanvas, exportCtx, w, h, time) {
    var origPlaying = VE._vePlayback.playing;

    // Use the ORIGINAL preview canvas at project resolution — do NOT swap to
    // the export canvas. This keeps overlay objects at correct positions since
    // the Fabric canvas dimensions match the preview canvas.
    VE._vePlayback.playing = false;
    VE._veProject.playheadTime = time;

    // Pre-seek all active video elements and wait for seeks to complete
    // before drawing — video seeks are async, drawing immediately would
    // capture stale frames causing freeze/stutter in output.
    var seekPromises = [];

    /* T5 (export plan): a cross-clip transition draws the NEIGHBOUR clip underneath, and the
       neighbour is by definition not active at `time` - so the pre-seek loop below never touched it.
       preview-render writes `_nbEl.currentTime = _nbT` and calls drawImage on the very next line,
       which cannot have decoded yet: every transition in every export blended against whatever frame
       that element happened to hold. Seek the neighbours here, and AWAIT them like everything else.
       The instant is fixed per neighbour (last frame for an IN, first frame for an OUT), so this
       costs one seek per neighbour per run in practice, not one per frame. */
    function _prepTransitionNeighbour(track, clip) {
      if (!clip.transitions) return;
      var wantsIn = clip.transitions['in'] && clip.transitions['in'].type && clip.transitions['in'].type !== 'none';
      var wantsOut = clip.transitions.out && clip.transitions.out.type && clip.transitions.out.type !== 'none';
      if (!wantsIn && !wantsOut) return;
      var sorted = track.clips.slice().sort(function (a, b) { return a.startTime - b.startTime; });
      var idx = -1;
      for (var i = 0; i < sorted.length; i++) { if (sorted[i].id === clip.id) { idx = i; break; } }
      if (idx < 0) return;
      var clipEnd = clip.startTime + clip.duration;
      var jobs = [];
      if (wantsIn && idx > 0) {
        var prev = sorted[idx - 1];
        if (prev.type === 'video' && Math.abs((prev.startTime + prev.duration) - clip.startTime) < 0.15) {
          jobs.push({ clip: prev, t: prev.duration * (prev.speed || 1) + (prev.trimStart || 0) });
        }
      }
      if (wantsOut && idx < sorted.length - 1) {
        var nxt = sorted[idx + 1];
        if (nxt.type === 'video' && Math.abs(clipEnd - nxt.startTime) < 0.15) {
          jobs.push({ clip: nxt, t: nxt.trimStart || 0 });
        }
      }
      jobs.forEach(function (job) {
        var nbEl = VE._vePlayback.videoPool[job.clip.id];
        if (!nbEl || !nbEl.videoWidth) return;
        var target = Math.max(0, Math.min(job.t, (nbEl.duration || job.t) - 0.05));
        if (Math.abs(nbEl.currentTime - target) <= _veSeekEpsilon()) return;   // already there
        seekPromises.push(new Promise(function (resolve) {
          var done = false;
          var ok = function () { if (done) return; done = true; nbEl.removeEventListener('seeked', ok); resolve(); };
          nbEl.addEventListener('seeked', ok);
          nbEl.currentTime = target;
          setTimeout(function () { if (!done) { done = true; nbEl.removeEventListener('seeked', ok); resolve(); } }, 3000);
        }));
      });
    }

    VE._veExportTracksNow().forEach(function(track) {
      // OWNER BUG 2026-07-25: this used to `if (track.muted) return;`. `muted` is an AUDIO property.
      // The compositor only honours it for audio tracks (preview-render.js:809 checks
      // `track.muted && track.type === 'audio'`), so a muted VIDEO track is still DRAWN - but its
      // frames were never seeked or decoded here, so every frame reused the last picture that
      // happened to be in the element. Muting track 1 to add a dub therefore exported a stuttering,
      // frozen video, and unmuting "fixed" it. Frame preparation is a video concern: never skip it
      // because someone silenced the track.
      track.clips.forEach(function(clip) {
        var clipEnd = clip.startTime + clip.duration;
        if (time < clip.startTime || time >= clipEnd) return;
        if (clip.type !== 'video') return;
        var videoEl = VE._vePlayback.videoPool[clip.id];
        /* X6 (export plan): this guard is correct - you cannot draw an element with no frame - but it
           was SILENT and it is sticky. A presigned URL that expires mid-run, or any decode error,
           zeroes `videoWidth` and every remaining frame takes this branch: the clip vanishes from the
           second half of the film and the export still ends on a green tick. Record it once and let
           the completion handler say so. */
        if (!videoEl || !videoEl.videoWidth) {
          if (VE._veExporting) {
            VE._veExportFrameFailures = VE._veExportFrameFailures || {};
            var _fkey = clip.id;
            if (!VE._veExportFrameFailures[_fkey]) {
              VE._veExportFrameFailures[_fkey] = clip.name || clip.fileName || clip.id;
              console.warn('[VE export] clip has no decodable frame, dropping it from here on:',
                           VE._veExportFrameFailures[_fkey],
                           videoEl && videoEl.error ? ('media error ' + videoEl.error.code) : 'no element');
            }
          }
          return;
        }

        _prepTransitionNeighbour(track, clip);   // T5

        var localTime = VE._veClipLocalTime(clip, time, videoEl);

        // PHASE 2: sequential decode. When a frame source was opened for this clip, pull the frame
        // that covers localTime instead of seeking the element. The profiler measured seek-per-frame
        // at 89% of export wall time; this is the fix for that number, not a micro-optimisation.
        // Any failure returns null and we fall through to the element-seek path below, so an
        // undecodable container never breaks an export.
        var _fs = VE._veExportFrameSources && VE._veExportFrameSources[clip.id];
        if (_fs) {
          seekPromises.push(_fs.frameAt(localTime).then(function (cv) {
            clip._ccFrameOverride = cv || null;
            if (!cv) {
              // Decoder gave nothing for this timestamp: fall back to the element for this frame.
              if (Math.abs(videoEl.currentTime - localTime) > _veSeekEpsilon()) {
                return new Promise(function (resolve) {
                  var d = false;
                  var ok = function () { if (d) return; d = true; videoEl.removeEventListener('seeked', ok); resolve(); };
                  videoEl.addEventListener('seeked', ok);
                  videoEl.currentTime = localTime;
                  setTimeout(function () { if (!d) { d = true; videoEl.removeEventListener('seeked', ok); resolve(); } }, 3000);
                });
              }
            }
          })['catch'](function () { clip._ccFrameOverride = null; }));
          return;
        }

        // Only seek if not already at the target time.
        // T1: the threshold was a fixed 0.02 s, but the frame step at 60 fps is 0.0167 s (and at
        // 30 fps with clip.speed 0.5 it is also 0.0167), so consecutive frames fell inside the
        // window, the seek was skipped and the SAME picture was encoded twice. A "60 fps" export
        // therefore contained 30 fps of distinct frames. Half a frame is the correct tolerance.
        if (Math.abs(videoEl.currentTime - localTime) > _veSeekEpsilon()) {
          seekPromises.push(new Promise(function(resolve) {
            var done = false;
            var onSeeked = function() {
              if (done) return;
              done = true;
              videoEl.removeEventListener('seeked', onSeeked);
              resolve();
            };
            videoEl.addEventListener('seeked', onSeeked);
            videoEl.currentTime = localTime;
            /* Anti-hang backstop ONLY (was 300ms, which fired mid-seek under main-thread load and
               captured a stale / half-decoded frame = the export micro-stutter). 'seeked' is the real
               frame-ready signal; 3s is long enough that a normal-but-slow seek always resolves first.

               T2: when it DOES fire, the compositor draws whatever the element currently holds - the
               wrong picture, silently, and the export still ends on a green tick. It is a backstop,
               not a success path, so say so. */
            setTimeout(function() {
              if (!done) {
                done = true;
                videoEl.removeEventListener('seeked', onSeeked);
                if (VE._veExporting) {
                  VE._veExportFrameFailures = VE._veExportFrameFailures || {};
                  var _tkey = 'seek:' + clip.id;
                  if (!VE._veExportFrameFailures[_tkey]) {
                    VE._veExportFrameFailures[_tkey] = (clip.name || clip.fileName || clip.id) + ' (slow seek)';
                    console.warn('[VE export] seek backstop fired; that frame shows a stale picture:',
                                 clip.name || clip.id, 'at', localTime);
                  }
                }
                resolve();
              }
            }, 3000);
          }));
        }
      });
    });

    function renderAndRestore() {
      var _t0 = performance.now();
      /* R7: the snapshot can be disposed (cancel, error, the user leaving) while this frame's seeks
         were still in flight. The old code then fell through to the LIVE Fabric canvas and quietly
         composited whatever the user was looking at into the file. If the run is over, this frame is
         not wanted by anyone. */
      if (!VE._veExporting) return;
      /* X2: preview-render reads VE._veProject.tracks directly. Point it at the frozen list for the
         duration of this SYNCHRONOUS render only - never across an await, or the editor's own render
         loop could paint the frozen data. */
      var _liveTracks = VE._veProject.tracks;
      if (VE._veExportTracks) VE._veProject.tracks = VE._veExportTracks;
      try {
      // 1. Draw video frames onto the preview canvas (project res).
      //    skipFabricSync=true so the live Fabric canvas is NOT touched —
      //    the user may be on a different page working on another design.
      VE._veRenderPreviewFrame(true);

      // 2. Composite: use the snapshot StaticCanvas if available,
      //    otherwise fall back to the live Fabric canvas.
      var srcEl = null;
      if (VE._veExportStaticCanvas) {
        /* The Fabric hop looks like a copy worth eliminating and it is NOT. Keeping the reasoning
           because the shortcut is obvious and wrong.

           When the snapshot holds no overlay objects, `renderAll()` copies the whole preview canvas
           into `lowerCanvasEl` and draws nothing on it: a full 33 MB blit at 4K for a pixel-identical
           picture. So: encode straight from the preview canvas instead. Measured result, same
           project, only this guard differing:

               encode from previewCanvas   frame 0 decodes as source frame 16   WRONG
               keep the Fabric hop         frame 0 decodes as source frame 0    correct

           The compositor writes the preview canvas on EVERY frame. `new VideoFrame(previewCanvas)`
           does not reliably observe the writes for the frame it is supposed to capture, so the first
           frame samples the surface in a state nobody asked for. The Fabric hop was providing
           isolation between the surface the compositor writes and the surface the encoder reads, by
           accident, and that isolation is load-bearing.

           It only reproduced after a previous export in the same session, which is exactly the kind
           of bug that ships: a clean-page A/B showed both paths correct.

           The export-canvas copy below IS safe to elide, because `lowerCanvasEl` is written
           synchronously by renderAll and nothing else touches it between frames. */
        VE._veSyncOverlayVisibility(time, VE._veExportStaticCanvas);
        if (VE._veExportBgImg) VE._veExportBgImg.dirty = true;
        VE._veExportStaticCanvas.renderAll();
        srcEl = VE._veExportStaticCanvas.lowerCanvasEl;
      } else if (typeof canvas !== 'undefined' && canvas) {
        /* Fallback: live Fabric canvas (user must stay on the video page).

           S7: reading `lowerCanvasEl` directly bypasses the ONE thing that keeps editor furniture out
           of a render - `excludeFromExport`, which fabric only honours in toDataURL/toCanvasElement.
           So every power-window outline, SmartCam box, guide and the subtitle editing proxy was
           burned into the video whenever the snapshot was unavailable. Hide them for the blit and put
           them back; the objects are not touched, only their `visible` flag for one synchronous
           render the user never sees. */
        VE._veSyncOverlayVisibility(time);
        if (VE._veUi.previewFabricImg) VE._veUi.previewFabricImg.dirty = true;
        var _hidden = [];
        try {
          canvas.getObjects().forEach(function (o) {
            if (o && o.excludeFromExport && o.visible !== false) { o.visible = false; _hidden.push(o); }
          });
        } catch (e) { /* hiding is best-effort */ }
        canvas.renderAll();
        srcEl = canvas.lowerCanvasEl;
        // Restore BEFORE the blit would be wrong (the blit reads the bitmap we just rendered), so the
        // copy below happens first and the flags come back at the end of this function.
        renderAndRestore._unhide = _hidden;
      }

      /* COPY ELIMINATION, the export-canvas hop.

         Since fix 1.2 the compositor already runs AT export resolution, so this drawImage is an
         identity copy: same source size, same destination size, 33 MB moved at 4K to produce the
         same bitmap. Publish the surface we finished on instead and let the encoder read it
         directly (ve-webcodecs-export reads `opts.frameCanvas()`).

         The copy stays for the case it was written for: a source that is NOT already at export size
         (the live-canvas fallback, which renders at project resolution). */
      VE._veExportFrameCanvas = null;
      if (srcEl && srcEl.width > 0 && srcEl.height > 0) {
        if (srcEl.width === w && srcEl.height === h && !VE._veNoCopyElision) {
          VE._veExportFrameCanvas = srcEl;          // no copy at all
        } else {
          exportCtx.clearRect(0, 0, w, h);
          exportCtx.drawImage(srcEl, 0, 0, srcEl.width, srcEl.height, 0, 0, w, h);
        }
      }

      /* S5: one taint probe, on the first composited frame only. A cross-origin picture with no CORS
         grant poisons the canvas, and the FIRST symptom used to be `new VideoFrame(canvas)` throwing a
         bare `SecurityError` one line later - a dead stop naming nothing. Ask the canvas here, where
         we still know which sources are remote, and fail with their names. */
      if (VE._veExportTaintChecked !== true) {
        VE._veExportTaintChecked = true;
        try {
          // Probe the surface the ENCODER will read. With the copy eliminated that is no longer
          // always the export canvas, and probing an empty canvas would always pass.
          var _probeEl = VE._veExportFrameCanvas || exportCanvas;
          _probeEl.getContext('2d').getImageData(0, 0, 1, 1);
        } catch (e) {
          var offenders = VE._veListRemoteSources();
          throw new Error('Export blocked: cross-origin media without CORS taints the frame' +
            (offenders.length ? ' (' + offenders.slice(0, 3).join(', ') + ')' : '') +
            '. Re-upload it to your own library and export again.');
        }
      }
      VE._vePlayback.playing = origPlaying;
      } finally {
        VE._veProject.tracks = _liveTracks;
        // S7: give the editor its furniture back now that the bitmap has been copied.
        if (renderAndRestore._unhide) {
          renderAndRestore._unhide.forEach(function (o) { o.visible = true; });
          renderAndRestore._unhide = null;
        }
      }
      if (VE._veExportProfile) {
        VE._veExportProfile.compositeMs += performance.now() - _t0;
        VE._veExportProfile.frames++;
      }
    }

    if (seekPromises.length === 0) {
      renderAndRestore();
      return; // synchronous — no Promise needed
    }

    // Return Promise so the frame loop awaits all seeks. The wait IS the decode cost on this
    // pipeline (seek per frame), so it is measured as such.
    var _tSeek = performance.now();
    return Promise.all(seekPromises).then(function () {
      if (VE._veExportProfile) VE._veExportProfile.seekMs += performance.now() - _tSeek;
      renderAndRestore();
    });
  };

  VE._veStartWebCodecsExport = function (o) {
    if (!window.VEWebCodecsExport || !VEWebCodecsExport.isSupported()) {
      if (o.progressText) o.progressText.textContent = 'WebCodecs not available';
      return;
    }

    // X1: there are TWO front-ends onto this engine (the export modal and the export-manager sheet),
    // and neither guarded the engine itself. A second start overwrote _veExportHandle and the
    // snapshot (leaking the first) while both loops seeked the SAME pool elements, so both files came
    // out garbage. One export at a time, and say so.
    /* Resolve the source byte sizes before anything reads _veExportSourceBitrate(). Without this an
       export started straight from a keyboard shortcut (no dialog opened, so nothing resolved them)
       would run with the quality cap silently disabled. */
    /* Wait for the byte sizes ONCE per call, tracked on the options object rather than a global.
       The global version recorded "someone has bounced" rather than "the bytes are known": a second
       export arriving inside that window read `true`, skipped resolving entirely and ran with the
       cap disabled, and a synchronous throw left it stuck `true` so the NEXT export skipped it too. */
    if (!o._srcBytesResolved && VE._veEnsureSourceBytes) {
      o._srcBytesResolved = true;
      Promise.resolve()
        .then(function () { return VE._veEnsureSourceBytes(); })
        ['catch'](function (e) { console.warn('[VE export] source size resolve failed:', e && e.message); })
        .then(function () { VE._veStartWebCodecsExport(o); });
      return;
    }

    if (VE._veExporting) {
      if (o.progressText) o.progressText.textContent = 'An export is already running';
      if (typeof showToast === 'function') showToast('An export is already running', 'error');
      return;
    }

    // Pause playback before export
    if (VE._vePlayback.playing) VE._vePause();

    // S1 (second half): renderTrack now draws a selected subtitle track while exporting, which is
    // right for the snapshot (the proxy Textbox is excludeFromExport, so it is not in there). The
    // live-canvas FALLBACK path would draw both, so drop the selection for the run: the proxy is an
    // editing affordance, not content.
    try {
      if (window.VESubtitleElement && VESubtitleElement.getSelectedTrackId &&
          VESubtitleElement.getSelectedTrackId() && VESubtitleElement.deselect) {
        VESubtitleElement.deselect();
      }
    } catch (e) { /* selection is best-effort */ }
    VE._veExportCancelRequested = false; // fresh run: clear any stale stop request
    VE._veExportTaintChecked = false;    // S5: probe the canvas once per run, not once per session
    VE._veExportFrameFailures = {};      // X6: clips that stopped decoding partway through
    VE._veExportAudioSupported = true;   // A6: until the AAC probe says otherwise
    VE._veExportSnapshotEmpty = false;   // copy elimination: set when the snapshot is built
    VE._veExportFrameCanvas = null;

    var duration = (o.endTime || VE._veProject.duration) - (o.startTime || 0);
    if (duration <= 0) {
      if (o.progressText) o.progressText.textContent = 'Invalid export range';
      return;
    }

    // Build config & probe codec support
    var config = VEWebCodecsExport.buildVideoConfig(o.quality, o.fps, o.aspect);

    // M3: nothing may read a media element before it holds data. This runs BEFORE the audio mixdown
    // too, because the offline renderer reads the same elements.
    if (o.progressText) o.progressText.textContent = 'Waiting for media\u2026';
    VE._veAwaitExportMediaReady().then(function (notReady) {
      if (notReady.length && typeof showToast === 'function') {
        showToast(notReady.length + ' clip(s) not loaded and will be missing from the export: ' +
                  notReady.slice(0, 3).join(', '), 'error');
      }
      if (notReady.length) console.warn('[VE export] media never became ready:', notReady);

      // X2: from here on every stage reads the frozen list, so editing the timeline mid-run changes
      // the project but not the file being written.
      VE._veExportTracks = VE._veFreezeTracksForExport();
      // X3: the frame loop writes the playhead every frame and used to leave it wherever the export
      // stopped. Remember where the user actually was.
      VE._veExportPrevPlayhead = VE._veProject.playheadTime;
      // S4: overlay transition geometry is a fraction of the canvas; pin it for the run so leaving
      // the page cannot change it mid-file.
      VE._veExportCanvasSize = { w: (typeof CW !== 'undefined' && CW) || 1920,
                                 h: (typeof CH !== 'undefined' && CH) || 1080 };

    if (o.progressText) o.progressText.textContent = 'Checking codec support\u2026';

    // `_veNoConstantQuality` is the A/B guard: set it true and this reproduces today's
    // constant-bitrate behaviour exactly. Every optimisation in this file has one, because a guard
    // is what exposed the frame-0 bug that a clean-page test said did not exist.
    VEWebCodecsExport.checkCodecSupport(config, !VE._veNoConstantQuality).then(function(probe) {
      if (!probe.supported) {
        // 0c: the old message named no cause. After the level ladder, reaching here means this
        // machine really has no encoder for that frame size at any profile/level, hardware or
        // software. Say which size failed and what to do instead of a dead end.
        var _d = VEWebCodecsExport.computeExportDimensions(o.quality, o.aspect);
        var _msg = 'This machine cannot encode ' + _d.w + '×' + _d.h + '. Try a lower resolution.';
        if (o.progressText) o.progressText.textContent = _msg;
        if (typeof showToast === 'function') showToast(_msg, 'error');
        VE._veExportResetUI(o);
        return;
      }

      var dim = VEWebCodecsExport.computeExportDimensions(o.quality, o.aspect);

      // Scale bitrate based on preset and fps
      var bitrateMultiplier = 1;
      if (o.preset === 'high') bitrateMultiplier = 2;
      else if (o.preset === 'draft') bitrateMultiplier = 0.5;
      if (o.fps >= 60) bitrateMultiplier *= 1.5;
      var exportBitrate = Math.round(dim.br * bitrateMultiplier);

      // Check if audio should be included
      var audioCheck = document.getElementById('ve-export-include-audio');
      var wantAudio = VE._veProjectHasAudio() && (!audioCheck || audioCheck.checked);

      // Render audio offline if requested
      var audioPromise;
      if (wantAudio && window.VEAudioAdvanced && VEAudioAdvanced.renderOffline) {
        if (o.progressText) o.progressText.textContent = 'Rendering audio\u2026';
        // A1: the render window starts at o.startTime. Without it the offline graph scheduled every
        // clip on the ABSOLUTE timeline, so a 10s..20s range export shipped picture from 0:10 with
        // sound from 0:00. A5: clip failures are collected instead of swallowed, so 0c can warn.
        VE._veExportAudioFailures = [];
        audioPromise = VEAudioAdvanced.renderOffline(VE._veExportTracksNow(), duration, {
          sampleRate: 48000, channels: 2, videoPool: VE._vePlayback.videoPool,
          startTime: o.startTime || 0,
          // A8: the export must honour solo + master volume/mute exactly like playback does.
          masterVolume: (VE._veMasterVol != null ? VE._veMasterVol : 1),
          masterMuted: !!VE._veMasterMuted,
          onClipFailure: function (clip, reason) {
            VE._veExportAudioFailures.push({ name: (clip && (clip.name || clip.fileName)) || 'clip', reason: reason });
            console.warn('[VE export] clip audio skipped:', (clip && clip.name) || clip, reason);
          }
        }).catch(function (err) {
          // Swallowed to null and never printed anywhere: a mixdown that ran out of memory and an
          // AAC config the encoder refused produced the identical bare "NO AUDIO" in the UI.
          VE._veExportAudioFailures.push({ name: 'audio mixdown', reason: (err && err.message) || 'render-failed' });
          console.warn('[VE export] audio mixdown failed:', (err && err.message) || err);
          return null;
        });
      } else {
        // Recorded, not silent: this branch also produces a file with no audio, and it used to leave
        // `_veExportAudioFailures` empty so the toast fell back to a generic sentence.
        if (wantAudio) {
          VE._veExportAudioFailures = VE._veExportAudioFailures || [];
          VE._veExportAudioFailures.push({ name: 'audio', reason: 'the offline mixer is unavailable' });
        }
        audioPromise = Promise.resolve(null);
      }

      /* A6: prove there is an AAC encoder for this material BEFORE the muxer is built, because the
         muxer declares its audio track at construction. Asking afterwards (as the old code did)
         could only ever produce a file with a declared-but-empty AAC track: players report "has
         audio" and play silence, and the export still reported success. */
      audioPromise = audioPromise.then(function (buf) {
        if (!buf) return buf;
        // Probe at the SAME rate the encode will use: the audio bitrate now follows the preset and
        // the source, so probing 128k and then encoding 64k would test a config we never build.
        var _aacRate = VEWebCodecsExport.audioBitrateFor(o.preset || 'standard', VE._veExportSourceBitrate());
        return VEWebCodecsExport.probeAudioSupport(buf.sampleRate, buf.numberOfChannels, _aacRate)
          .then(function (ok) {
            VE._veExportAudioSupported = ok;
            if (!ok) {
              VE._veExportAudioFailures = VE._veExportAudioFailures || [];
              /* Name the BITRATE too. This message only ever said the sample rate, which is why a
                 rejected 68,656 bps request looked like a mysterious codec problem for days. */
              VE._veExportAudioFailures.push({ name: 'audio track',
                reason: 'no AAC encoder at ' + buf.sampleRate + ' Hz / ' + Math.round(_aacRate / 1000) + ' kbps' });
              console.warn('[VE export] AAC unsupported: ' + buf.sampleRate + ' Hz, ' + _aacRate + ' bps');
            }
            return buf;
          });
      });

      audioPromise.then(function(audioBuffer) {
        // Stop was clicked during the codec-check / audio-render window, before an encoder handle
        // existed to cancel. Honour it here instead of starting the encode.
        if (VE._veExportCancelRequested) { VE._veExportCancelRequested = false; VE._veExportResetUI(o); return; }
        VE._veExporting = true;
        VE._veExportFps = parseInt(o.fps, 10) || 30;   // T1: drives the half-frame seek tolerance
        if (o.progressText) o.progressText.textContent = 'Preparing canvas snapshot\u2026';
        if (o.progressBar) o.progressBar.style.width = '0%';

        // PHASE 2: open one sequential frame source per video clip. Each one demuxes + decodes with
        // Mediabunny instead of seeking an element per frame. Opening is best-effort and parallel;
        // a clip whose container Mediabunny cannot read simply keeps the old seek path.
        var _fsPromise = VE._veOpenExportFrameSources();

        // R2: prepare a disk (OPFS) writer BEFORE the encode so the muxer can stream to it instead
        // of holding the whole MP4 in RAM. Resolves to null when OPFS/StreamTarget is unavailable,
        // in which case startExport keeps the old in-memory path.
        var _fname = (VE._veProject.name || 'dika-video') + '.mp4';
        var _diskPromise = VEWebCodecsExport.createDiskTarget
          ? VEWebCodecsExport.createDiskTarget(_fname)['catch'](function () { return null; })
          : Promise.resolve(null);

        // Create an offscreen StaticCanvas snapshot so the user can freely
        // switch pages and work while the export runs in the background.
        // 1.2: run the WHOLE composite at export resolution. The compositor sizes itself from the
        // preview canvas bitmap (preview-render.js reads pvs.width/height), so lifting that surface
        // to the export size makes the video pixels genuinely 4K instead of a 1080p upscale.
        // _veSyncPreviewSize is a no-op while _veExportPreviewSize is set, so nothing pulls it back.
        try {
          var _pv = VE._veUi.previewCanvas;
          if (_pv && (_pv.width !== dim.w || _pv.height !== dim.h)) {
            VE._veExportPrevPreviewSize = { w: _pv.width, h: _pv.height };
            VE._veExportPreviewSize = { w: dim.w, h: dim.h };
            _pv.width = dim.w;
            _pv.height = dim.h;
            if (VE._veUi.previewFabricImg) {
              VE._veUi.previewFabricImg.width = dim.w;
              VE._veUi.previewFabricImg.height = dim.h;
              VE._veUi.previewFabricImg.dirty = true;
            }
          }
        } catch (e) { VE._veExportPreviewSize = null; }

        /* S9: the snapshot canvas MEASURES text when it enlivens the objects, and a custom font that
         has not finished loading measures at the fallback face - the exported text then wraps and
         sits differently from what is on screen. One await, once per run. */
      (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve())
        ['catch'](function () {})
        .then(function () {

      // 1.2: build the snapshot AT THE EXPORT SIZE so overlays/subtitles are not upscaled.
        VE._veCreateExportSnapshot(function(sc, bgImg) {
          VE._veExportStaticCanvas = sc;
          VE._veExportBgImg = bgImg;
          if (o.progressText) o.progressText.textContent = 'Encoding\u2026';

        Promise.all([_diskPromise, _fsPromise]).then(function (_res) {
        var diskTarget = _res[0];
        if (VE._veExportCancelRequested) {
          VE._veExportCancelRequested = false;
          if (diskTarget && diskTarget.abort) diskTarget.abort();
          VE._veExporting = false; VE._veExportResetUI(o); return;
        }
        /* PHASE 4: hand the decoders the exact frame instants this run will ask for. Without this the
           worker source has to guess a window from the instants it has already seen, which both lags
           the first frames and mis-rounds them (measured: 19.2 ms/frame and 1/3 of the frames one
           step early). `Math.ceil` matches the encoder's own totalFrames. */
        try {
          VE._vePrimeExportFrameSources(o.startTime || 0, VE._veExportFps, Math.ceil(duration * VE._veExportFps));
        } catch (e) { console.warn('[VE export] prefetch prime skipped:', e && e.message); }
        VE._veExportHandle = VEWebCodecsExport.startExport({
          width:     dim.w,
          height:    dim.h,
          fps:       o.fps,
          bitrate:   exportBitrate,
          codec:     probe.codec,
          hardwareAcceleration: probe.accel || 'prefer-hardware',
          diskTarget: diskTarget,
          profile: (VE._veExportProfileReset(), VE._veExportProfile),   // phase 1: per-stage timing
          /* Keyframe every 2 seconds, not every 1. MEASURED on this pipeline, identical frames and
             identical QP24, only the interval changed:

                 high-motion footage   1s 1562.6 KB -> 2s 1513.6 KB   =  3.1% smaller
                 low-motion footage    1s  139.9 KB -> 2s   75.2 KB   = 46.2% smaller

             A keyframe is a whole picture; on material that barely moves it is nearly the entire
             file, and dika studio output is full of exactly that (slideshows, screen recordings,
             titles over a still). 4 seconds saves 61.8% on the same clip but makes scrubbing
             visibly coarse, so 2 is where this stops. Nothing changes for busy footage, which is
             also where nobody was complaining. */
          gopSize:   o.fps * 2,
          duration:  duration,
          startTime: o.startTime || 0,
          filename:  _fname,
          /* Constant quality: the encoder holds a quality level instead of a bitrate, so an easy
             shot costs little and a hard one is never capped. `bitrateMode` is whatever the probe
             could actually get (null = no quantizer support here, and the run behaves as before).
             `preset` selects the QP: high 18 / standard 20 / draft 24. */
          bitrateMode: probe.bitrateMode || null,
          preset: o.preset || 'standard',
          /* The source-aware ceiling, resolved HERE rather than in either dialog. Both front-ends
             reach the engine through this one function, and the two things I fixed in one dialog
             and missed in the other (the size estimate, then the preset id) both went wrong exactly
             because a per-dialog copy existed. `VE._veExportSourceCap === false` is the user's
             opt-out; 0 means "nothing measurable, do not cap". */
          sourceBitrate: VE._veExportSourceBitrate(),
          // The audio the user ASKED for, so a failed mixdown cannot silently change the video's
          // quantiser and make the file disagree with the estimate that promised it.
          capIncludesAudio: wantAudio,
          /* The dialog's own measurement, so the quality cap the file gets is the one the number on
             screen was computed from. Null (no probe, or probe failed) is the model path. */
          measuredBpp: VE._veExportMeasured || null,
          audioBuffer: audioBuffer,
          audioSupported: VE._veExportAudioSupported,   // A6: proved before the muxer was built
          // Copy elimination: the encoder reads whatever surface the composite finished on.
          frameCanvas: function () { return VE._veExportFrameCanvas; },

          renderFrame: VE._veExportRenderFrame,

        /* After the last frame the bar reads 100% but the file is not finished: audio drains, the
           moov atom is written, and a streamed file is read back off disk. Saying so is the
           difference between "nearly there" and "this has hung". */
        onStage: function (text) {
          if (o.progressText) o.progressText.textContent = text;
          if (o.progressPct) o.progressPct.textContent = '100%';
        },

        onProgress: function(pct, frame, total, eta, projectedBytes) {
          if (o.progressBar) o.progressBar.style.width = (pct * 100).toFixed(1) + '%';
          if (o.progressPct) o.progressPct.textContent = (pct * 100).toFixed(0) + '%';
          var etaStr = eta < 60 ? Math.ceil(eta) + 's' : Math.ceil(eta / 60) + 'm';
          /* Once enough of the file exists there is nothing left to predict: show the size projected
             from the file itself. Held back to 40% because a projection from the opening seconds is
             a projection of the opening seconds. Measured convergence on a 10 s clip that finished
             at 7.13 MB: 10% -> 11.75, 25% -> 11.42, 50% -> 8.65, 75% -> 6.29, 99% -> 6.83. The
             pre-export probe samples four windows across the WHOLE range and is the better number
             until then, which is why it stays on screen instead of being replaced immediately. */
          var sizeStr = '';
          if (projectedBytes > 0 && pct >= 0.4) {
            var projMB = projectedBytes / 1048576;
            sizeStr = '  \u2022  ~' + (projMB >= 1024 ? (projMB / 1024).toFixed(1) + ' GB'
                                                 : (projMB < 100 ? projMB.toFixed(1) : projMB.toFixed(0)) + ' MB');
          }
          if (o.progressText) o.progressText.textContent =
            'Frame ' + frame + '/' + total + '  \u2022  ETA ' + etaStr + sizeStr;
          VE._veExportPipSync();
        },

        onComplete: function(blob, stats) {
          VE._veExporting = false;
          VE._veExportHandle = null;
          VE._veDisposeExportSnapshot();
          VEWebCodecsExport.downloadBlob(blob, stats.filename);

          if (o.progressBar) o.progressBar.style.width = '100%';
          if (o.progressPct) o.progressPct.textContent = '100%';
          // 0c: an export that lost its audio (CORS-blocked clip, unsupported AAC, failed mixdown)
          // used to finish with a green tick and "Audio: Yes". Report it where the user is looking.
          var fails = VE._veExportAudioFailures || [];
          var audioTag = stats.hasAudio ? ' \u2022 Audio' : (wantAudio ? ' \u2022 NO AUDIO' : '');
          var profSummary = VE._veExportProfileSummary ? VE._veExportProfileSummary() : '';
          if (o.progressText) o.progressText.textContent =
            'Done • ' + (stats.fileSize / 1048576).toFixed(1) + ' MB • ' +
            stats.speed + ' • ' + stats.codec + (stats.rateMode ? ' ' + stats.rateMode : '') + audioTag +
            (profSummary ? '  |  ' + profSummary : '');
          if (profSummary) console.info('[VE export] ' + profSummary +
            ' (frames ' + VE._veExportProfile.frames + ', ' + stats.resolution + ', ' + stats.codec +
            (stats.streamedToDisk ? ', streamed to disk' : ', in memory') + ')');
          // X6: a clip that stopped decoding partway through is missing from the rest of the file.
          var _vfails = Object.keys(VE._veExportFrameFailures || {}).map(function (k) {
            return VE._veExportFrameFailures[k];
          });
          if (_vfails.length && typeof showToast === 'function') {
            showToast(_vfails.length + ' clip(s) stopped decoding and are missing from part of the video: ' +
                      _vfails.slice(0, 3).join(', '), 'error');
          }
          if (typeof showToast === 'function') {
            if (wantAudio && !stats.hasAudio) {
              /* `audioSkipReason` is null on the whole "the track was never declared" path, so this
                 fell back to a generic sentence and the actual cause (recorded in
                 _veExportAudioFailures) was never shown to anyone. */
              var _why = stats.audioSkipReason || (fails.length && fails[0].reason) || 'audio could not be encoded';
              showToast('Video exported WITHOUT audio: ' + _why, 'error');
            } else if (fails.length) {
              showToast(fails.length + ' clip(s) exported without sound: ' + fails[0].name + ' (' + fails[0].reason + ')', 'error');
            }
          }
          // Show start button as "Done", hide cancel/pause
          if (o.startBtn) {
            o.startBtn.style.display = '';
            o.startBtn.disabled = false;
            o.startBtn.innerHTML = VE._veIcon('check', 12) + ' Done';
          }
          if (o.cancelBtn) o.cancelBtn.style.display = 'none';
          if (o.pauseBtn)  o.pauseBtn.style.display  = 'none';
          if (o.backBtn)   o.backBtn.style.display    = '';
          if (o.onDone) o.onDone(true);
        },

        onError: function(err) {
          VE._veExporting = false;
          VE._veExportHandle = null;
          VE._veDisposeExportSnapshot();
          var msg = err && err.message ? err.message : 'Export failed';
          if (o.progressText) o.progressText.textContent = msg;
          VE._veExportResetUI(o);
        }
      });
      }); // end _diskPromise.then
      }, { width: dim.w, height: dim.h }); // end VE._veCreateExportSnapshot (built at export size)
        }); // end document.fonts.ready (S9)
      }); // end audioPromise.then
    }).catch(function(err) {
      if (o.progressText) o.progressText.textContent = 'Codec check failed';
      VE._veExportResetUI(o);
    });

    })['catch'](function (err) {   // M3 media wait
      console.warn('[VE export] media readiness check failed:', err && err.message);
      if (o.progressText) o.progressText.textContent = 'Media check failed';
      VE._veExportResetUI(o);
    });
  };

  VE._veExportResetUI = function (o) {
    if (o.startBtn) {
      o.startBtn.style.display = '';
      o.startBtn.disabled = false;
      o.startBtn.innerHTML = VE._veIcon('download', 12) + ' Export';
    }
    if (o.cancelBtn) o.cancelBtn.style.display = 'none';
    if (o.pauseBtn)  o.pauseBtn.style.display  = 'none';
    if (o.backBtn)   o.backBtn.style.display    = '';
    if (o.onDone) o.onDone(false);
  };

  VE._veExportMinimize = function () {
    var overlay = document.getElementById('ve-export-overlay');
    if (!overlay) return;
    overlay.style.display = 'none';

    // Create or reuse PiP popup
    if (!VE._veExportPip) {
      VE._veExportPip = document.createElement('div');
      VE._veExportPip.id = 've-export-pip';
      VE._veExportPip.className = 've-export-pip';
      VE._veExportPip.innerHTML =
        '<div class="ve-pip-header">' +
          '<span class="ve-pip-title">' + VE._veIcon('download', 12) + ' Exporting...</span>' +
          '<div class="ve-pip-actions">' +
            '<button class="ve-pip-btn" id="ve-pip-expand" title="Expand">' + VE._veIcon('maximize-2', 12) + '</button>' +
            '<button class="ve-pip-btn ve-pip-btn--danger" id="ve-pip-cancel" title="Cancel">' + VE._veIcon('x', 12) + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="ve-pip-progress-track">' +
          '<div class="ve-pip-progress-bar" id="ve-pip-progress-bar"></div>' +
        '</div>' +
        '<div class="ve-pip-text" id="ve-pip-text">Preparing...</div>';
      document.body.appendChild(VE._veExportPip);

      // Expand button restores the modal
      document.getElementById('ve-pip-expand').addEventListener('click', function() {
        VE._veExportExpand();
      });

      // Cancel from PiP
      document.getElementById('ve-pip-cancel').addEventListener('click', function() {
        if (VE._veExportHandle) { VE._veExportHandle.cancel(); VE._veExportHandle = null; }
        VE._veExporting = false;
        VE._veDisposeExportSnapshot();
        VE._veExportPipClose();
        var pt = document.getElementById('ve-export-progress-text');
        if (pt) pt.textContent = 'Cancelled';
        var sb = document.getElementById('ve-export-start');
        if (sb) { sb.disabled = false; sb.style.display = ''; sb.innerHTML = VE._veIcon('download', 12) + ' Export'; }
        var cb = document.getElementById('ve-export-cancel');
        if (cb) cb.style.display = 'none';
        var pb = document.getElementById('ve-export-pause');
        if (pb) pb.style.display = 'none';
        var bb = document.getElementById('ve-export-back');
        if (bb) bb.style.display = '';
        // Restore overlay
        if (overlay) {
          overlay.style.display = 'flex';
        }
      });
    }

    VE._veExportPip.style.display = 'block';
    // Sync current progress
    VE._veExportPipSync();
  };

  VE._veExportExpand = function () {
    var overlay = document.getElementById('ve-export-overlay');
    if (overlay) overlay.style.display = 'flex';
    if (VE._veExportPip) VE._veExportPip.style.display = 'none';
  };

  VE._veExportPipClose = function () {
    if (VE._veExportPip) {
      VE._veExportPip.style.display = 'none';
    }
  };

  /* R1: this function re-schedules ITSELF on rAF and was ALSO called from onProgress on every
     encoded frame, so every frame started another self-perpetuating chain. A few thousand frames in,
     thousands of callbacks were running per animation frame and a long export ground the tab down.
     Now there is exactly one chain: the flag makes re-entry a no-op update, and the chain stops
     itself when the PiP is hidden. */
  VE._veExportPipSync = function () {
    if (!VE._veExportPip || VE._veExportPip.style.display === 'none') { VE._vePipSyncRunning = false; return; }
    var modalBar = document.getElementById('ve-export-progress-bar');
    var modalText = document.getElementById('ve-export-progress-text');
    var pipBar = document.getElementById('ve-pip-progress-bar');
    var pipText = document.getElementById('ve-pip-text');
    if (modalBar && pipBar) pipBar.style.width = modalBar.style.width;
    if (modalText && pipText) pipText.textContent = modalText.textContent;
    // Keep exactly ONE sync loop alive while the PiP is visible.
    if (VE._vePipSyncRunning) return;
    VE._vePipSyncRunning = true;
    var tick = function () {
      if (!VE._veExportPip || VE._veExportPip.style.display === 'none') { VE._vePipSyncRunning = false; return; }
      var mb = document.getElementById('ve-export-progress-bar');
      var mt = document.getElementById('ve-export-progress-text');
      var pb = document.getElementById('ve-pip-progress-bar');
      var pt = document.getElementById('ve-pip-text');
      if (mb && pb) pb.style.width = mb.style.width;
      if (mt && pt) pt.textContent = mt.textContent;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  VE._veRegisterCommands = function () {
    if (typeof registerCommand !== 'function') return;

    // ── JKL Playback (industry standard) ──
    var _jklSpeed = 0; // -3,-2,-1,0,1,2,3
    function _veJKL_J() {
      _jklSpeed = Math.max(-3, _jklSpeed - 1);
      if (_jklSpeed === 0) { VE._vePause(); return; }
      VE._vePlayback.speed = Math.pow(2, Math.abs(_jklSpeed) - 1) * (_jklSpeed > 0 ? 1 : -1);
      if (!VE._vePlayback.playing) VE._vePlay();
    }
    function _veJKL_K() { _jklSpeed = 0; VE._vePause(); }
    function _veJKL_L() {
      _jklSpeed = Math.min(3, _jklSpeed + 1);
      if (_jklSpeed === 0) { VE._vePause(); return; }
      VE._vePlayback.speed = Math.pow(2, Math.abs(_jklSpeed) - 1) * (_jklSpeed > 0 ? 1 : -1);
      if (!VE._vePlayback.playing) VE._vePlay();
    }

    var cmds = [
      { id: 've-play-pause', label: 'Video: Play/Pause', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'Space', fn: VE._veTogglePlay },
      { id: 've-split', label: 'Video: Split at Playhead', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'S', fn: VE._veSplitAtPlayhead },
      { id: 've-delete', label: 'Video: Delete Selected', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'Delete', fn: VE._veDeleteSelected },
      { id: 've-copy', label: 'Video: Copy Clips', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'Ctrl+C', fn: VE._veCopySelected },
      { id: 've-paste', label: 'Video: Paste Clips', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'Ctrl+V', fn: VE._vePasteClips },
      { id: 've-undo', label: 'Video: Undo', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'Ctrl+Z', fn: VE._veUndo },
      { id: 've-redo', label: 'Video: Redo', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'Ctrl+Y', fn: VE._veRedo },
      { id: 've-prev-frame', label: 'Video: Previous Frame', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'ArrowLeft', fn: function() { VE._veSeek(VE._veFindPrevClipBoundary(VE._veProject.playheadTime)); } },
      { id: 've-next-frame', label: 'Video: Next Frame', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'ArrowRight', fn: function() { VE._veSeek(VE._veFindNextClipBoundary(VE._veProject.playheadTime)); } },
      { id: 've-zoom-in', label: 'Video: Zoom In Timeline', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: '=', fn: function() { VE._veSetZoom(VE._veProject.zoom + 10); } },
      { id: 've-zoom-out', label: 'Video: Zoom Out Timeline', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: '-', fn: function() { VE._veSetZoom(VE._veProject.zoom - 10); } },
      { id: 've-export', label: 'Video: Export', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'Ctrl+Shift+E', fn: VE._veShowExportModal },
      { id: 've-add-media', label: 'Video: Add Media', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'Ctrl+I', fn: VE._veOpenFilePicker },
      { id: 've-media-browser', label: 'Video: Media Browser', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'Alt+8', fn: function() { if (window.VEMediaBrowser) VEMediaBrowser.toggle(); else if (window.VEMediaGallery) VEMediaGallery.toggle(); } },
      { id: 've-toggle-high-contrast', label: 'Video: Toggle High Contrast', category: 'Video Editor', contexts: ['video-editor'], fn: function() { if (window.VEAccessibility) VEAccessibility.setHighContrast(!VEAccessibility.isHighContrast()); } },
      { id: 've-toggle-reduced-motion', label: 'Video: Toggle Reduced Motion', category: 'Video Editor', contexts: ['video-editor'], fn: function() { if (window.VEAccessibility) VEAccessibility.setReducedMotion(!VEAccessibility.isReducedMotion()); } },
      // ── Phase 1: Timeline Engine Commands ──
      { id: 've-razor-tool', label: 'Video: Razor Tool', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'C', fn: VE._veToggleRazorMode },
      { id: 've-through-cut', label: 'Video: Through Cut (All Tracks)', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'Ctrl+Shift+X', fn: VE._veThroughCut },
      { id: 've-snap-toggle', label: 'Video: Toggle Snap', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'N', fn: VE._veToggleSnap },
      { id: 've-jkl-j', label: 'Video: Reverse Playback (J)', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'J', fn: _veJKL_J },
      { id: 've-jkl-k', label: 'Video: Stop Playback (K)', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'K', fn: _veJKL_K },
      { id: 've-jkl-l', label: 'Video: Forward Playback (L)', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'L', fn: _veJKL_L },
      { id: 've-frame-back', label: 'Video: 1 Frame Back', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: ',', fn: function() { VE._veSeek(Math.max(0, VE._veProject.playheadTime - 1/30)); } },
      { id: 've-frame-fwd', label: 'Video: 1 Frame Forward', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: '.', fn: function() { VE._veSeek(VE._veProject.playheadTime + 1/30); } },
      { id: 've-10frame-back', label: 'Video: 10 Frames Back', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'Shift+,', fn: function() { VE._veSeek(Math.max(0, VE._veProject.playheadTime - 10/30)); } },
      { id: 've-10frame-fwd', label: 'Video: 10 Frames Forward', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'Shift+.', fn: function() { VE._veSeek(VE._veProject.playheadTime + 10/30); } },
      { id: 've-goto-start', label: 'Video: Go to Start', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'Home', fn: function() { VE._veSeek(0); } },
      { id: 've-goto-end', label: 'Video: Go to End', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'End', fn: function() { VE._veSeek(VE._veProject.duration); } },
      { id: 've-selection-tool', label: 'Video: Selection Tool', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'V', fn: function() { if (VE._veRazorMode) VE._veToggleRazorMode(); } },
      { id: 've-add-marker', label: 'Video: Add Marker', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'M', fn: function() { VE._veAddMarker(); } },
      { id: 've-prev-marker', label: 'Video: Previous Marker', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'Shift+M', fn: VE._veSeekToPrevMarker },
      { id: 've-next-marker', label: 'Video: Next Marker', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'Alt+M', fn: VE._veSeekToNextMarker },
      { id: 've-duplicate', label: 'Video: Duplicate Selected', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'Ctrl+D', fn: VE._veDuplicateSelected },
      { id: 've-move-clip-up', label: 'Video: Move Clip Up', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'Alt+ArrowUp', fn: function() { VE._veMoveClipTrack(-1); } },
      { id: 've-move-clip-down', label: 'Video: Move Clip Down', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'Alt+ArrowDown', fn: function() { VE._veMoveClipTrack(1); } },
      // ── New feature shortcuts ──
      { id: 've-scene-detect', label: 'Video: Scene Detection', description: 'Analyze video for scene cuts and add markers', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'Ctrl+Shift+J', fn: function() { var btn = document.getElementById('ve-btn-scene-detect'); if (btn) btn.click(); } },
      { id: 've-stabilize', label: 'Video: Stabilize Clip', description: 'Analyze and stabilize shaky video', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'Ctrl+Shift+B', fn: function() { var btn = document.getElementById('ve-btn-stabilize'); if (btn) btn.click(); } },
      { id: 've-multicam', label: 'Video: Multi-Cam Monitor', description: 'Open multi-cam monitor (live cutting)', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'Ctrl+Shift+M', fn: function () { if (window.VEMulticamMonitor) VEMulticamMonitor.toggle(); } },
      { id: 've-multicam-create', label: 'Video: Create Multi-Cam Source', description: 'Combine selected clips into a single multi-cam clip', category: 'Video Editor', contexts: ['video-editor'], fn: function () { if (window.VEMulticam) VEMulticam.showCreate(); } },
      { id: 've-lut-browser', label: 'Video: LUT Browser', description: 'Open color grading LUT browser', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'Ctrl+Shift+L', fn: function () { VE._veShowLutBrowser(); } },
      { id: 've-color-tools', label: 'Video: Color Tools', description: 'Floating color tools menu: draw power window, mask, LUT target', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'Ctrl+Shift+W', fn: function () { if (window.VEColorTools) VEColorTools.toggle(); } },
      { id: 've-plugin-manager', label: 'Video: Plugin Manager', description: 'Open plugin management panel', category: 'Video Editor', contexts: ['video-editor'], defaultShortcut: 'Ctrl+Shift+K', fn: VE._veShowPluginManager }
    ];

    cmds.forEach(function(cmd) {
      try { registerCommand(cmd); } catch (e) { /* command may already exist */ }
    });
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'export', parent: 'video.video-editor', title: 'video-editor: export', mount: function () {}, unmount: function () {} });
  }
})();
