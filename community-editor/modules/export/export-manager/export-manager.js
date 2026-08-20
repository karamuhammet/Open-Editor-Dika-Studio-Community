/* ============================================================
   dika studio – Export / Import Manager
   Full project-aware export/import with group support,
   multi-format page export, batch operations, and ZIP/PSD.
   ============================================================ */

/* ── Export / Import Manager Modal ─────────────────────────── */

var ExportManager = (function () {

  /* THE FILE FORMATS COME FROM ONE PLACE (core/edition.js). The literal below is the fallback for a
     page that somehow loaded without it, and it must stay in step with that table; everything the
     user reads on this screen is built from these values rather than typed out per button, which is
     what made the last rename a hunt through thirty string literals. */
  var _EXT = (window.CCEdition && CCEdition.formats) || {
    project: '.dika', package: '.dikapack',
    readable: ['.dika', '.dikapack', '.cardcraft', '.ccproj', '.json'],
    accept: '.dika,.dikapack,.cardcraft,.ccproj,.json'
  };

  var _modal = null;
  var _currentSection = 'page'; // page | selected | group | project | social | import
  var _socialPlatform = ''; // preselected platform when opened from a share tile

  function open(section) {
    // Preload jsPDF (~350KB) + bwip-js (~1MB) when the export modal opens — both removed from index.html boot
    // (editor-perf B3). Fire-and-forget: ready before the user clicks Export (sync render in service.js).
    if (window.cc && cc.requireLib) {
      cc.requireLib('js/vendor/jspdf.umd.min.js').catch(function () {});
      cc.requireLib('js/vendor/bwip-js-min.js').catch(function () {});
    }
    _currentSection = section || 'page';
    if (_modal) { _modal.remove(); _modal = null; }
    _modal = _buildModal();
    document.body.appendChild(_modal);
    _switchSection(_currentSection);
    // Close gear dropdown
    var gd = document.getElementById('gear-dropdown');
    if (gd) gd.classList.remove('show');
  }

  function close() {
    _hideProgress(true);
    if (_modal) { _modal.remove(); _modal = null; }
  }

  /* ── Modal-wide export progress (percentage ring + bar) ──────
     One overlay pinned over the whole .em-modal. Real milestones arrive via renderPart's onProgress
     (0..1); between those atomic render/encode steps a gentle trickle keeps the ring moving so it never
     looks frozen. Monotonic + capped < 100 until _hideProgress snaps it to 100 and fades out. */
  var _prog = { el: null, raf: 0, cur: 0, target: 0, done: false };
  var _PROG_C = 326.726; // 2·π·r, r = 52 (matches the CSS stroke-dasharray)

  function _showProgress(label) {
    _hideProgress(true);
    if (!_modal) return;
    var modalEl = _modal.querySelector('.em-modal');
    if (!modalEl) return;
    var ov = document.createElement('div');
    ov.className = 'em-prog-overlay';
    ov.innerHTML =
      '<div class="em-prog-card">' +
        '<div class="em-prog-ring">' +
          '<svg viewBox="0 0 120 120" aria-hidden="true">' +
            '<circle class="em-prog-track" cx="60" cy="60" r="52"></circle>' +
            '<circle class="em-prog-fill" cx="60" cy="60" r="52"></circle>' +
          '</svg>' +
          '<div class="em-prog-pct" id="em-prog-pct">0<span>%</span></div>' +
        '</div>' +
        '<div class="em-prog-label" id="em-prog-label"></div>' +
        '<div class="em-prog-bar"><div class="em-prog-bar-fill" id="em-prog-bar-fill"></div></div>' +
      '</div>';
    modalEl.appendChild(ov);
    _prog.el = ov; _prog.cur = 0; _prog.target = 8; _prog.done = false;
    var lb = ov.querySelector('#em-prog-label'); if (lb) lb.textContent = label || 'Exporting…';
    if (_prog.raf) cancelAnimationFrame(_prog.raf);
    _progTick();
  }

  function _setProgress(pct, label) {
    if (!_prog.el) return;
    if (typeof pct === 'number') _prog.target = Math.max(_prog.target, Math.min(99, pct)); // monotonic, capped < 100
    if (label) { var lb = _prog.el.querySelector('#em-prog-label'); if (lb) lb.textContent = label; }
  }

  function _progApply(v) {
    if (!_prog.el) return;
    var pctEl = _prog.el.querySelector('#em-prog-pct');
    var fill = _prog.el.querySelector('.em-prog-fill');
    var bar = _prog.el.querySelector('#em-prog-bar-fill');
    if (pctEl) pctEl.innerHTML = Math.round(v) + '<span>%</span>';
    if (fill) fill.style.strokeDashoffset = (_PROG_C * (1 - v / 100)).toFixed(1);
    if (bar) bar.style.width = v + '%';
  }

  function _progTick() {
    if (!_prog.el) return;
    if (!_prog.done && _prog.target - _prog.cur < 0.5 && _prog.target < 90) {
      _prog.target = Math.min(90, _prog.target + 0.25); // idle trickle so the ring keeps advancing
    }
    _prog.cur += (_prog.target - _prog.cur) * 0.14;
    if (_prog.cur > _prog.target) _prog.cur = _prog.target;
    _progApply(_prog.cur);
    _prog.raf = requestAnimationFrame(_progTick);
  }

  function _hideProgress(instant) {
    if (_prog.raf) { cancelAnimationFrame(_prog.raf); _prog.raf = 0; }
    var el = _prog.el; _prog.el = null; _prog.done = true; _prog.cur = 0; _prog.target = 0;
    if (!el) return;
    if (instant) { if (el.parentNode) el.parentNode.removeChild(el); return; }
    var pctEl = el.querySelector('#em-prog-pct'); if (pctEl) pctEl.innerHTML = '100<span>%</span>';
    var fill = el.querySelector('.em-prog-fill'); if (fill) fill.style.strokeDashoffset = '0';
    var bar = el.querySelector('#em-prog-bar-fill'); if (bar) bar.style.width = '100%';
    el.classList.add('em-prog-complete');
    setTimeout(function () {
      el.classList.add('em-prog-out');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
    }, 420);
  }

  function _esc(str) {
    var d = document.createElement('span');
    d.textContent = str;
    return d.innerHTML;
  }

  function _buildModal() {
    var overlay = document.createElement('div');
    overlay.className = 'em-overlay';
    overlay.onclick = function (e) { if (e.target === overlay) close(); };
    // Escape closes
    overlay.tabIndex = -1;
    overlay.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    var modal = document.createElement('div');
    modal.className = 'em-modal';

    // Header
    var header = document.createElement('div');
    header.className = 'em-header';
    header.innerHTML =
      '<span class="em-title">' + (typeof getIcon === 'function' ? getIcon('share', 16) : '') + ' Export &amp; Share</span>' +
      '<button class="em-close" title="Close" aria-label="Close">&times;</button>';
    header.querySelector('.em-close').onclick = close;
    modal.appendChild(header);

    // Body = left nav rail + right stage
    var body = document.createElement('div');
    body.className = 'em-body';

    var rail = document.createElement('div');
    rail.className = 'em-rail';
    var tabs = [
      { id: 'page', label: 'Download', icon: 'download' },
      { id: 'selected', label: 'Selected', icon: 'layers' },
      { id: 'group', label: 'Group', icon: 'folder' },
      { id: 'project', label: 'Project', icon: 'package' },
      { id: 'social', label: 'Social media', icon: 'share' },
      { id: 'import', label: 'Import', icon: 'upload' }
    ];
    tabs.forEach(function (t) {
      var btn = document.createElement('button');
      btn.className = 'em-rail-tab';
      btn.dataset.section = t.id;
      btn.innerHTML = (typeof getIcon === 'function' && t.icon ? getIcon(t.icon, 17) : '') + '<span class="em-rail-label">' + t.label + '</span>';
      btn.onclick = function () { _switchSection(t.id); };
      rail.appendChild(btn);
    });
    var spacer = document.createElement('div'); spacer.className = 'em-rail-spacer'; rail.appendChild(spacer);
    var note = document.createElement('div'); note.className = 'em-rail-note';
    note.textContent = 'Select a piece, choose the format, download. Video pages give MP4.';
    rail.appendChild(note);
    body.appendChild(rail);

    var stage = document.createElement('div');
    stage.className = 'em-stage';
    stage.id = 'em-content';
    body.appendChild(stage);

    modal.appendChild(body);
    overlay.appendChild(modal);
    return overlay;
  }

  function _switchSection(id) {
    _currentSection = id;
    // Update rail active state
    if (_modal) {
      _modal.querySelectorAll('.em-rail-tab').forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.section === id);
      });
    }

    var stage = document.getElementById('em-content');
    if (!stage) return;
    stage.innerHTML = '';

    // 'page' (still image OR video) renders a full-height two-pane split (big preview + settings)
    // directly into the stage; the other sections render single-column inside a scrollable pane.
    var target = stage;
    if (id !== 'page') {
      var pane = document.createElement('div');
      pane.className = 'em-pane';
      stage.appendChild(pane);
      target = pane;
    }

    switch (id) {
      case 'page': _renderPageSection(target); break;
      case 'selected': _renderSelectedSection(target); break;
      case 'group': _renderGroupSection(target); break;
      case 'project': _renderProjectSection(target); break;
      case 'social': _renderSocialSection(target); break;
      case 'import': _renderImportSection(target); break;
    }
  }

  /* ── SECTION: Current Page ────────────────────── */

  // Render any part's live preview into the big #em-preview-frame via renderPart (part-aware).
  function _emThumb(page) {
    if (typeof renderPart !== 'function' || typeof resolvePartSource !== 'function') return;
    var src = resolvePartSource(page); if (!src) return;
    renderPart(
      { kind: src.kind, json: src.json, w: (src.w || page.w || CW), h: (src.h || page.h || CH), bg: (src.bg != null ? src.bg : page.bg), x: src.x, y: src.y },
      { format: 'webp', fit: 720 }
    ).then(function (url) {
      var t = document.getElementById('em-preview-frame');
      if (t) t.innerHTML = url ? '<img src="' + url + '" alt="">' : '<div class="em-preview-empty">No preview</div>';
    });
  }

  // CapCut-style Video export: MP4 via the deterministic NLE WebCodecs engine
  // (window.__ccVideoEditor._veStartWebCodecsExport, Phase-6 hardened). Two-pane: big preview + settings.
  function _renderVideoMode(container, page) {
    var VE = window.__ccVideoEditor;   // the video-editor namespace is NOT a global `VE`; it lives here.
    var wc = window.VEWebCodecsExport;
    var haveVE = !!(VE && VE._veProject);
    var supported = wc && typeof wc.isSupported === 'function' && wc.isSupported();
    var label = _esc(page.label || 'Video');

    if (!supported || !haveVE) {
      container.innerHTML =
        '<div class="em-split">' +
          '<div class="em-preview"><div class="em-preview-frame" id="em-preview-frame"><div class="em-preview-sk"></div></div></div>' +
          '<div class="em-settings"><div class="em-settings-scroll">' +
            '<div class="em-sec-label">Video</div>' +
            '<p class="em-empty">' + (!supported
              ? 'This browser does not support WebCodecs video export. Try Chrome or Edge.'
              : 'Video engine not ready. Open the video page and try again.') + '</p>' +
          '</div></div>' +
        '</div>';
      _emThumb(page);
      return;
    }

    if (typeof VE._veRecalcDuration === 'function') { try { VE._veRecalcDuration(); } catch (e) {} }
    var dur = Math.max((VE._veProject && VE._veProject.duration) || 0, 0.1);
    var durStr = dur < 60 ? dur.toFixed(1) + ' sn' : Math.floor(dur / 60) + ':' + ('0' + Math.round(dur % 60)).slice(-2);
    var hasAudio = typeof VE._veProjectHasAudio === 'function' && VE._veProjectHasAudio();

    /* `canvas` exports at the EXACT working canvas size, which is what the imported video set it to
       when the track was empty. It existed in the other export dialog and not here, so the panel the
       owner actually uses could not produce a file at the source's own resolution: a 1440x1080 shoot
       had to be forced up to 4K or down to 1080p, both of which resample the picture for no reason.
       Listed first and marked recommended, same as the other dialog. */
    var _cw = (typeof CW !== 'undefined' && CW) ? CW : 1920;
    var _ch = (typeof CH !== 'undefined' && CH) ? CH : 1080;

    /* The detail ceiling of this timeline, and the reason the list below is not just five numbers.
       The owner exported a 51 minute 4K file twice (14 GB, then 29 GB) from 640x360 footage. Both
       were upscales: there was never any 4K information to encode, and nothing on this screen said
       so. A tier above what the source can fill is now labelled as the upscale it is, and the
       source's own resolution is offered as a first-class choice (it was not the same thing as
       "Original", which follows the CANVAS: those two only coincide when the video set the canvas). */
    var _srcProfile = (VE && typeof VE._veSourceProfile === 'function') ? VE._veSourceProfile() : null;   // refreshed once the byte sizes resolve
    var _srcShort = (_srcProfile && _srcProfile.shortSide) || 0;
    var _srcW = (_srcProfile && _srcProfile.width) || 0, _srcH = (_srcProfile && _srcProfile.height) || 0;
    var _detail = _srcShort || Math.min(_cw, _ch);
    var _srcRate = (_srcProfile && _srcProfile.bitrate) || 0;   // bits/sec, 0 = nothing measurable

    var RES = [{ id: 'canvas', label: 'Original', desc: _cw + '×' + _ch + ' (canvas, recommended)' }];
    var _srcListed = !!(_srcShort && _srcShort !== Math.min(_cw, _ch));
    if (_srcListed) RES.push({ id: String(_srcShort), label: 'Source', desc: _srcW + '×' + _srcH + ' video' });
    [{ id: '720', label: '720p', desc: 'HD' }, { id: '1080', label: '1080p', desc: 'Full HD' },
     { id: '1440', label: '1440p', desc: '2K' }, { id: '2160', label: '4K', desc: 'Ultra HD' }
    ].forEach(function (t) {
      // Skip a ladder tier only when the Source entry above already IS that tier, never when the
      // source merely happens to match the canvas (that would silently drop 720p from the list).
      if (_srcListed && String(_srcShort) === t.id) return;
      var up = parseInt(t.id, 10) > _detail;
      RES.push({ id: t.id, label: t.label, desc: up ? ('upscale from ' + _detail + 'p, no extra detail') : t.desc });
    });
    // Aspect is REPORTED, not chosen: the export frame always follows the canvas (see _aspectLabel).
    var _aspectLabel = function () {
      var w = (typeof CW !== 'undefined' && CW) ? CW : 1920;
      var h = (typeof CH !== 'undefined' && CH) ? CH : 1080;
      var g = function (a, b) { return b ? g(b, a % b) : a; };
      var d = g(w, h) || 1;
      var ratio = (w / d) + ':' + (h / d);
      if ((w / d) > 40 || (h / d) > 40) ratio = (w / h).toFixed(2) + ':1';   // odd sizes: no silly 1920:1081
      return ratio + ' (canvas ' + w + '×' + h + ')';
    };
    var PRE = [{ id: 'high', label: 'High' }, { id: 'recommended', label: 'Recommended' }, { id: 'draft', label: 'Fast' }];

    var selRes = 'canvas', selAsp = (VE._veProject.aspectRatio || '16:9'), selFps = '30', selPre = 'recommended';
    /* The real bits-per-pixel of this project, from VE._veProbeSourceSize -> VESizeProbe, which
       measures the SOURCE clip entirely inside a Worker. Nothing it does touches the canvas, the
       video pool or the playhead; the predecessor did all three and had to be deleted (Part 7).
       While it is in flight the modelled number stays on screen labelled "estimate". */
    var _measured = null, _measuring = false, _measuringPct = 0, _probeCache = {};
    var FPS = [{ id: '24', label: '24 fps' }, { id: '30', label: '30 fps' }, { id: '60', label: '60 fps' }];
    var defName = (VE._veProject && VE._veProject.name) ? VE._veProject.name : 'dika-video';
    /* Platform presets, from the SAME sourced table the export modal uses
       (VEWebCodecsExport.EXPORT_PLATFORMS), so the two dialogs cannot drift into two different sets
       of "what YouTube wants". */
    /* A dropdown, not a card grid. As cards there was no way to UNDO a choice: clicking YouTube set
       the resolution and frame rate and left a selected card with no way back except reopening the
       dialog. A select has a "None" state by construction, and it is one control instead of four,
       matching every other field here. */
    var _platOpts = '<option value="">None</option>' +
      ((wc && wc.EXPORT_PLATFORMS) || []).map(function (pl) {
        return '<option value="' + pl.id + '">' + pl.label + ' · ' + pl.hint + '</option>';
      }).join('');

    var _opt = function (items, sel) {
      return items.map(function (it) {
        return '<option value="' + it.id + '"' + (it.id === sel ? ' selected' : '') + '>' + (it.desc ? (it.label + ' · ' + it.desc) : it.label) + '</option>';
      }).join('');
    };

    // CapCut-style: stacked dropdown fields on the right, big preview on the left.
    container.innerHTML =
      '<div class="em-split">' +
        '<div class="em-preview">' +
          '<div class="em-preview-frame" id="em-preview-frame"><div class="em-preview-sk"></div></div>' +
          '<div class="em-preview-chip"><b>' + label + '</b><span class="em-chip-dim" id="em-vchip">MP4 · ' + durStr + '</span></div>' +
        '</div>' +
        '<div class="em-settings">' +
          '<div class="em-settings-scroll">' +
            '<div class="em-field"><label class="em-field-label" for="em-vname">Ad</label>' +
              '<input type="text" class="em-input" id="em-vname" spellcheck="false" value=""></div>' +
            '<div class="em-field"><label class="em-field-label" for="em-vplat">Platform</label>' +
              '<select class="em-select" id="em-vplat">' + _platOpts + '</select>' +
              '<div id="em-plat-advice"></div></div>' +
            '<div class="em-field"><label class="em-field-label" for="em-vres">Resolution</label>' +
              '<select class="em-select" id="em-vres">' + _opt(RES, selRes) + '</select></div>' +
            '<div class="em-field"><label class="em-field-label" for="em-vpre">Kalite</label>' +
              '<select class="em-select" id="em-vpre">' + _opt(PRE, selPre) + '</select></div>' +
            '<div class="em-field"><label class="em-field-label" for="em-vfps">Frame rate</label>' +
              '<select class="em-select" id="em-vfps">' + _opt(FPS, selFps) + '</select></div>' +
            /* Rendered UNCONDITIONALLY. It used to be gated on `_srcRate`, which is 0 at this
               point on any project reloaded from IndexedDB (the byte sizes resolve a moment later),
               so the control silently did not exist on exactly the projects where the cap matters,
               and a flag left false by an earlier dialog could never be turned back on. Verified at
               runtime: `checkbox: false` while the source resolved to 13.4 Mbps right after. It is
               disabled below when the source truly cannot be measured. */
            '<div class="em-field"><label class="em-opt-row em-check-row">' +
              '<span class="em-opt-label">Match the original\'s quality</span>' +
              '<input type="checkbox" id="em-vsrccap"' + (VE._veExportSourceCap === false ? '' : ' checked') + '></label></div>' +
            // 1.4 (export plan): this used to be an aspect-ratio SELECT, but computeExportDimensions
            // derives the frame from the canvas (CW/CH) and never read the argument, so picking 9:16
            // changed nothing. The output aspect IS the canvas aspect by design, so show it as a
            // read-only fact instead of a control that does not control anything.
            '<div class="em-field"><label class="em-field-label">En-boy</label>' +
              '<div class="em-vprog-text" id="em-vasp-info" style="margin:0">' + _aspectLabel() + '</div></div>' +
            (hasAudio ? '<div class="em-field"><label class="em-opt-row em-check-row"><span class="em-opt-label">Include audio</span><input type="checkbox" id="ve-export-include-audio" checked></label></div>' : '') +
          '</div>' +
          '<div class="em-settings-foot">' +
            '<div class="em-vprog-text" id="em-vest" style="margin:0 0 10px">MP4 · H.264 · ' + durStr + '</div>' +
            '<div class="em-vprog" id="em-vprog" style="display:none"><div class="em-vprog-track"><div class="em-vprog-fill" id="em-vprog-fill"></div></div><div class="em-vprog-text" id="em-vprog-text">Preparing…</div></div>' +
            '<button class="em-export-btn" id="em-vexport">' + (typeof getIcon === 'function' ? getIcon('download', 15) : '') + ' Download Video (MP4)</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    var nmEl = document.getElementById('em-vname'); if (nmEl) nmEl.value = defName; // set via JS (no attr-escaping)
    _emThumb(page);

    /* Measure in the Worker. Cached per resolution+fps+preset, because a measurement is only valid
       at the frame size and frame rate it was taken at. Debounced so a burst of dropdown changes
       does not start three probes, and superseded by the newest request. Nothing here can stall the
       UI: every expensive step is on the other side of a postMessage. */
    var _probeSeq = 0, _probeTimer = null;
    function _measure() {
      if (!VE._veProbeSourceSize || !window.VESizeProbe || !VESizeProbe.isAvailable()) return;
      var key = selRes + '|' + selFps + '|' + selPre;
      if (_probeCache[key]) {
        // VE._veExportMeasured too: setting only the local left the screen saying "(measured)"
        // while the encoder ran the model path, i.e. two different files again.
        _measured = _probeCache[key]; VE._veExportMeasured = _measured;
        _measuring = false; _est(); return;
      }
      clearTimeout(_probeTimer);
      _measured = null; _measuring = true; _measuringPct = 0; _est();
      var seq = ++_probeSeq;
      _probeTimer = setTimeout(function () {
        VE._veProbeSourceSize({
          quality: selRes, fps: parseInt(selFps, 10), aspect: selAsp, preset: selPre,
          onProgress: function (p) {
            if (seq !== _probeSeq) return;
            var pc = Math.round(p * 100);
            if (pc - _measuringPct < 10 && pc < 100) return;
            _measuringPct = pc; _est();
          }
        }).then(function (m) {
          _probeCache[key] = m;
          if (seq !== _probeSeq) return;
          _measuring = false; _measured = m;
          VE._veExportMeasured = m;      // the launcher passes this to the encoder
          console.info('[VE export] measured ' + m.bpp.toFixed(4) + ' bpp at ' + m.w + '×' + m.h +
                       ' QP' + m.qp + ' over ' + m.frames + ' frames (worker, source clip)');
          _est();
        })['catch'](function (e) {
          if (seq !== _probeSeq) return;
          _measuring = false;
          if (e && e.message !== 'aborted') console.warn('[VE export] size probe skipped:', e && e.message);
          _est();
        });
      }, 350);
    }

    function _sync() {
      var r = document.getElementById('em-vres'); if (r) selRes = r.value;
      var p = document.getElementById('em-vpre'); if (p) selPre = p.value;
      var f = document.getElementById('em-vfps'); if (f) selFps = f.value;
      var sc = document.getElementById('em-vsrccap');
      // The launcher (VE._veExportSourceBitrate) reads this same flag, so the estimate on screen
      // and the QP the encoder gets can never disagree.
      if (sc) VE._veExportSourceCap = !!sc.checked;
      // Resolution / fps / preset invalidate the measurement; the audio and cap toggles do not
      // change a single encoded pixel, so _measure's cache answers those instantly.
      _measured = null; VE._veExportMeasured = null;
      _measure();
      _est();
    }
    // ve-export-include-audio too: dropping the audio track changes the size by 128 kbps x duration,
    // which on a long export is tens of megabytes.
    ['em-vres', 'em-vpre', 'em-vfps', 'em-vsrccap', 've-export-include-audio'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.addEventListener('change', _sync);
    });

    /* Picking a platform fills in resolution + frame rate and reports what it could NOT do. The
       export frame follows the canvas aspect and nothing here can change that, so a vertical
       platform on a landscape canvas says so instead of quietly producing the wrong shape.
       Choosing "None" clears the advice and leaves the settings alone: undoing the choice must not
       silently rewrite resolution and frame rate to something the user never picked. */
    var _advEl = document.getElementById('em-plat-advice');
    var _platSel = document.getElementById('em-vplat');
    if (_platSel) _platSel.addEventListener('change', function () {
      if (_advEl) _advEl.innerHTML = '';
      if (!_platSel.value) return;
      var cw = (typeof CW !== 'undefined' && CW) ? CW : 1920;
      var ch = (typeof CH !== 'undefined' && CH) ? CH : 1080;
      // _srcShort: a platform tier must not be picked above what the footage can fill either.
      var adv = wc.platformAdvice(_platSel.value, cw, ch, dur, _srcShort);
      if (!adv) return;
      var r = document.getElementById('em-vres'); if (r) r.value = adv.quality;
      var f = document.getElementById('em-vfps'); if (f) f.value = String(adv.fps);
      _sync();
      if (_advEl) {
        _advEl.innerHTML = adv.warnings.length
          ? '<div class="em-plat-warn">' + adv.warnings.join('<br>') + '</div>'
          : '<div class="em-plat-ok">' + adv.platform.label + ': ' +
            (adv.quality === 'canvas' ? 'original size' : adv.quality + 'p') +
            ' at ' + adv.fps + ' fps, and this canvas is already ' + adv.platform.aspectLabel + '.</div>';
      }
    });

    function _est() {
      if (!wc.computeExportDimensions) return;
      var dim = wc.computeExportDimensions(selRes, selAsp);
      /* The export encodes at constant QUALITY now, so `bitrate x duration` is not an estimate, it
         is the fallback CEILING and it was printing roughly twice the real figure (a 51 minute 4K
         project read "~29362.9 MB"). There is no single right number under constant quality: the
         same QP on a locked-off interview and on confetti differ by more than 4x, so this prints a
         range and says so. The export MODAL got this treatment already; this is the second
         front-end, which is exactly the sort of thing that gets fixed once and missed once. */
      var sizeText, note = '';
      if (wc.estimateQualitySize) {
        // Same source bitrate the launcher will use, honouring the checkbox.
        var srcBr = (VE._veExportSourceCap === false) ? 0 : _srcRate;
        /* ONE number, not a range, and honestly labelled an estimate: the model cannot know this
           project's content, which is worth several times over. A range wide enough to cover that
           was unusable, and a probe accurate enough to replace it cost the user's canvas. */
        // Audio is a real part of the file and was missing from this number: 128 kbps over 51
        // minutes is 49 MB. The probe encodes video only, so it has to be added here.
        var _ac = document.getElementById('ve-export-include-audio');
        var wantAudio = hasAudio && (!_ac || _ac.checked);
        var es = wc.estimateQualitySize(dim.w, dim.h, selFps, dur, selPre, srcBr, _measured, wantAudio);
        // A measured figure accurate to ~8% deserves a decimal below 100 MB: rounding 3.19 to "3 MB"
        // threw away more precision than the measurement itself has.
        var unit = function (b) {
          var mb = b / 1048576;
          if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
          return (mb < 100 ? mb.toFixed(1) : mb.toFixed(0)) + ' MB';
        };
        /* Say where the number came from: a rate the encoder is actually targeting, a sample
           encode of the source, or the model. The word has to be earned - and when it says
           "measured" and the file misses, that is a bug in the number, not in the label. */
        sizeText = unit(es.bytes) + (es.targetBitrate ? ' (target)' : (es.measured ? ' (measured)' : ' (estimate)'));
        if (_measuring) sizeText = 'measuring… ' + (_measuringPct ? _measuringPct + '%' : '');
        /* Say WHY, with the numbers. A quality target that quietly moved is the kind of thing that
           reads as a bug the first time someone notices it in the console. */
        /* Plain language, deliberately. This said "your source is 0.46 Mbps, so the target moves
           from QP20 to QP31" and the owner was right that nobody reads that. Megabits and quantisers
           are our problem, not the user's; the QP numbers still go to the console for us. */
        if (es.capped) {
          note = 'Your original video was already compressed, so exporting it at full quality would ' +
                 'only make a bigger file of the same picture. This keeps the export ' +
                 wc.headroomPhrase(es.headroom) + '. Untick if you want the highest setting anyway.';
        } else if (!srcBr) {
          /* THE MISSING SENTENCE. Nothing distinguished "the cap is holding your file near its
             original size" from "we could not measure your original, so there is no cap at all" -
             the second case is what wrote a 390 MB file from a 168 MB source, and the screen said
             nothing. Now it says it, and says which of the two reasons it is. */
          note = (VE._veExportSourceCap === false)
            ? 'Quality matching is off, so this export is not tied to your original\'s size and can ' +
              'come out considerably larger. Tick "Match the original\'s quality" to bound it.'
            : 'Your original could not be measured, so this export is NOT limited to its size and ' +
              'may come out considerably larger. Re-importing the video restores the limit.';
        } else if (parseInt(selRes, 10) > _detail || (selRes === 'canvas' && Math.min(dim.w, dim.h) > _detail)) {
          note = 'Your video is only ' + _detail + 'p, so this setting stretches it to fit. ' +
                 'The file gets bigger; the picture does not.';
        }
      } else {
        var mult = selPre === 'high' ? 2 : (selPre === 'draft' ? 0.5 : 1); if (+selFps >= 60) mult *= 1.5;
        sizeText = '~' + ((dim.br * mult * dur) / 8 / 1048576).toFixed(1) + ' MB';
      }
      var el = document.getElementById('em-vest');
      if (el) {
        el.textContent = 'MP4 · H.264 · ' + dim.w + '×' + dim.h + ' · ' + durStr + ' · ' + sizeText;
        if (note) {
          var n = document.createElement('div');
          n.className = 'em-vest-note';
          n.textContent = note;
          el.appendChild(n);
        }
      }
      var chip = document.getElementById('em-vchip');
      if (chip) chip.textContent = dim.w + '×' + dim.h + ' · ' + durStr;
    }
    _est();      // first paint: without this the line kept its static markup and showed no size
    /* Resolve the source's byte size FIRST. A project reloaded from IndexedDB has no `clip._file`,
       so the source bitrate reads 0 and the quality cap silently does nothing at all; the estimate
       and the export would both run uncapped without a word on screen. Cheap (a blob read or a HEAD
       request) and it re-renders when it lands. */
    (VE._veEnsureSourceBytes ? VE._veEnsureSourceBytes() : Promise.resolve()).then(function () {
      _srcProfile = (VE && typeof VE._veSourceProfile === 'function') ? VE._veSourceProfile() : null;
      _srcRate = (_srcProfile && _srcProfile.bitrate) || 0;
      /* Nothing measurable = nothing to match. Disable the control rather than leave a switch that
         looks live and silently does nothing, which is what the whole cap did on reloaded projects. */
      var _cb = document.getElementById('em-vsrccap');
      if (_cb && !_srcRate) {
        _cb.checked = false; _cb.disabled = true;
        var _row = _cb.closest('.em-opt-row');
        if (_row) _row.title = 'The original could not be measured, so its size cannot be matched.';
      }
      _est();
      _measure();   // the real number then arrives from the worker, without the editor noticing
    });

    // Reset the İndir button from its "exporting / stop" state back to the original label.
    function _emResetVexport(b) {
      b._emExporting = false;
      b.disabled = false;
      b.classList.remove('em-exporting');
      b.removeAttribute('title');
      if (b._emOrigHtml) b.innerHTML = b._emOrigHtml;
    }

    document.getElementById('em-vexport').onclick = function () {
      var btn = this;
      // Second click while exporting = STOP: cancel the encode + tear down, mirroring the export
      // wizard's Cancel (export.js). The button deliberately stays enabled to act as the stop control
      // (the old code disabled it and re-enabled it after a flat 4s, so long exports lost feedback and
      // a re-click could start a second concurrent export).
      if (btn._emExporting) {
        if (VE._veExportHandle) { VE._veExportHandle.cancel(); VE._veExportHandle = null; }
        else { VE._veExportCancelRequested = true; } // stop requested before the encoder handle exists
        VE._veExporting = false;
        if (typeof VE._veDisposeExportSnapshot === 'function') VE._veDisposeExportSnapshot();
        var prog0 = document.getElementById('em-vprog'); if (prog0) prog0.style.display = 'none';
        _emResetVexport(btn);
        return;
      }
      var nm = document.getElementById('em-vname');
      if (nm && nm.value.trim() && VE._veProject) VE._veProject.name = nm.value.trim(); // typed name → the MP4 filename
      var prog = document.getElementById('em-vprog'); if (prog) prog.style.display = '';
      // Swap the button into "exporting" mode: a stop icon + a live percent span (fed by onProgress).
      if (!btn._emOrigHtml) btn._emOrigHtml = btn.innerHTML;
      btn._emExporting = true;
      btn.classList.add('em-exporting');
      btn.title = 'Stop export';
      btn.innerHTML = (typeof getIcon === 'function' ? getIcon('circle-stop', 15) : '■') + ' <span id="em-vexport-pct">0%</span>';
      try {
        VE._veStartWebCodecsExport({
          quality: selRes, fps: parseInt(selFps, 10), aspect: selAsp, preset: selPre,
          startTime: 0, endTime: VE._veProject.duration,
          progressBar: document.getElementById('em-vprog-fill'),
          progressText: document.getElementById('em-vprog-text'),
          progressPct: document.getElementById('em-vexport-pct'),
          onDone: function () { _emResetVexport(btn); } // complete / cancel / error → button back to normal
        });
        if (typeof CCRemote !== 'undefined' && CCRemote.beaconExport) { try { CCRemote.beaconExport({ format: 'mp4' }); } catch (e) {} }
      } catch (e) {
        if (typeof showToast === 'function') showToast('Video export could not be started: ' + e.message, 'error');
        _emResetVexport(btn);
      }
    };
  }

  function _renderPageSection(container) {
    var page = pages[currentPageIndex];
    if (!page) { container.innerHTML = '<p class="em-empty">No active page</p>'; return; }

    // Phase 13 — a video page gets the CapCut-style Video export mode (MP4 via the NLE WebCodecs engine),
    // not the still-image format grid.
    if (page._productType === 'video') { _renderVideoMode(container, page); return; }

    var src = (typeof resolvePartSource === 'function') ? resolvePartSource(page)
            : { kind: 'page', json: page.json, w: page.w, h: page.h, bg: page.bg };
    var baseW = (src && src.w) || page.w || CW;
    var baseH = (src && src.h) || page.h || CH;
    var hasRaster = ExportService.pageHasRasterContent(currentPageIndex);
    var label = _esc(page.label || 'Page ' + (currentPageIndex + 1));
    var PSD_CAP = (typeof ExportService.PSD_MAX_DPI === 'number') ? ExportService.PSD_MAX_DPI : 150;

    container.innerHTML =
      '<div class="em-split">' +
        '<div class="em-preview">' +
          '<div class="em-preview-frame" id="em-preview-frame"><div class="em-preview-sk"></div></div>' +
          '<div class="em-preview-chip"><b>' + label + '</b><span class="em-chip-dim" id="em-dim-readout">' + baseW + ' × ' + baseH + ' px</span></div>' +
        '</div>' +
        '<div class="em-settings">' +
          '<div class="em-settings-scroll">' +
            '<div class="em-sec-label">Format</div>' +
            '<div class="em-format-grid" id="em-fmt-grid"></div>' +
            '<div class="em-sec-label">Options</div>' +
            '<div class="em-options" id="em-options">' +
              '<div class="em-opt-row" id="em-dpi-row">' +
                '<span class="em-opt-label">Resolution</span>' +
                '<div class="em-dpi-btns" id="em-dpi-btns">' +
                  '<button class="em-dpi-btn" data-dpi="72">72</button>' +
                  '<button class="em-dpi-btn" data-dpi="150">150</button>' +
                  '<button class="em-dpi-btn active" data-dpi="300">300</button>' +
                  '<button class="em-dpi-btn" data-dpi="600">600</button>' +
                  '<input type="number" class="em-dpi-custom" id="em-dpi-custom" placeholder="Custom" min="1" max="2000" aria-label="Custom DPI">' +
                '</div>' +
              '</div>' +
              '<label class="em-opt-row em-check-row" id="em-transp-row"><span class="em-opt-label">Transparent background</span><input type="checkbox" id="em-transparent"></label>' +
              '<div class="em-opt-row" id="em-quality-row"><span class="em-opt-label">Kalite</span><input type="range" id="em-quality" class="em-range" min="50" max="100" value="92"><span class="em-range-val" id="em-quality-val">92</span></div>' +
            '</div>' +
          '</div>' +
          '<div class="em-settings-foot">' +
            '<div id="em-fmt-note" style="margin:0 0 8px;color:var(--warn,#ffb020);font-size:11px;min-height:0"></div>' +
            '<button class="em-export-btn" id="em-do-export">' + (typeof getIcon === 'function' ? getIcon('download', 15) : '') + ' Download</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    // Live preview of the actual part (fixes the blank scene/slide preview via resolvePartSource).
    if (typeof renderPart === 'function' && src) {
      renderPart(
        { kind: src.kind, json: src.json, w: baseW, h: baseH, bg: (src.bg != null ? src.bg : page.bg), x: src.x, y: src.y },
        { format: 'webp', fit: 720 }
      ).then(function (url) {
        var t = document.getElementById('em-preview-frame');
        if (t && url) t.innerHTML = '<img src="' + url + '" alt="">';
        else if (t) t.innerHTML = '<div class="em-preview-empty">No preview</div>';
      });
    }

    var grid = document.getElementById('em-fmt-grid');
    var formats = [
      { id: 'png', label: 'PNG', desc: 'High quality, transparency' },
      { id: 'jpeg', label: 'JPG', desc: 'Compressed, small' },
      { id: 'webp', label: 'WebP', desc: 'Modern web' },
      { id: 'svg', label: 'SVG', desc: 'Vector', warn: hasRaster },
      { id: 'pdf', label: 'PDF', desc: 'Print-ready' },
      { id: 'psd', label: 'PSD', desc: 'Layered Photoshop' }
    ];
    if (typeof pageHasSlideDeck === 'function' && pageHasSlideDeck(page)) formats.push({ id: 'pptx', label: 'PPTX', desc: 'PowerPoint deck' });

    var _prefs = {};
    try { _prefs = JSON.parse(localStorage.getItem('cc_export_prefs') || '{}') || {}; } catch (e) {}
    var selectedFmt = _prefs.fmt || 'png';
    var selectedDPI = _prefs.dpi || 300;

    var MAX_DPI = 2000; // hard ceiling — beyond this a full-page raster risks an out-of-memory crash
    function _dpi() {
      var c = document.getElementById('em-dpi-custom');
      var cv = c && c.value ? parseInt(c.value, 10) : 0;
      var d = (cv && cv > 0) ? cv : selectedDPI;
      return Math.max(1, Math.min(MAX_DPI, d));
    }
    function _updateReadout() {
      var ro = document.getElementById('em-dim-readout');
      if (!ro) return;
      if (selectedFmt === 'pptx') { ro.textContent = 'PowerPoint deck (1 page per slide)'; return; }
      var isVector = (selectedFmt === 'svg');
      if (isVector) { ro.textContent = baseW + ' × ' + baseH + ' px (vector, no DPI)'; return; }
      var d = _dpi();
      if (selectedFmt === 'psd' && d > PSD_CAP) d = PSD_CAP; // real cap, surfaced (no silent clamp)
      var m = d / 72;
      ro.textContent = Math.round(baseW * m) + ' × ' + Math.round(baseH * m) + ' px @ ' + d + ' DPI';
    }
    function _updateVisibility() {
      var isVector = (selectedFmt === 'svg' || selectedFmt === 'pptx');
      var dpiRow = document.getElementById('em-dpi-row');
      var transpRow = document.getElementById('em-transp-row');
      var qualRow = document.getElementById('em-quality-row');
      var note = document.getElementById('em-fmt-note');
      if (dpiRow) dpiRow.style.display = isVector ? 'none' : '';       // fix: SVG no longer shows an ignored DPI
      if (transpRow) transpRow.style.display = (selectedFmt === 'png' || selectedFmt === 'webp') ? '' : 'none';
      if (qualRow) qualRow.style.display = (selectedFmt === 'jpeg' || selectedFmt === 'webp') ? '' : 'none';
      if (note) note.textContent = (selectedFmt === 'psd' && _dpi() > PSD_CAP) ? ('PSD ' + PSD_CAP + ' Limited to DPI') : '';
      _updateReadout();
    }

    formats.forEach(function (f) {
      var card = document.createElement('button');
      card.className = 'em-fmt-card' + (f.id === selectedFmt ? ' active' : '');
      card.dataset.fmt = f.id;
      card.innerHTML =
        '<span class="em-fmt-label">' + f.label + '</span>' +
        '<span class="em-fmt-desc">' + f.desc + '</span>' +
        (f.warn ? '<span class="em-fmt-warn">⚠ Raster content</span>' : '');
      card.onclick = function () {
        selectedFmt = f.id;
        grid.querySelectorAll('.em-fmt-card').forEach(function (c) {
          c.classList.toggle('active', c.dataset.fmt === f.id);
        });
        _updateVisibility();
      };
      grid.appendChild(card);
    });

    document.querySelectorAll('#em-dpi-btns .em-dpi-btn').forEach(function (btn) {
      btn.onclick = function () {
        selectedDPI = parseInt(btn.dataset.dpi, 10);
        var c = document.getElementById('em-dpi-custom');
        if (c) c.value = '';
        document.querySelectorAll('#em-dpi-btns .em-dpi-btn').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        _updateVisibility();
      };
    });
    var customEl = document.getElementById('em-dpi-custom');
    if (customEl) customEl.addEventListener('input', function () {
      if (parseInt(customEl.value, 10) > MAX_DPI) customEl.value = String(MAX_DPI); // clamp typed value to the ceiling
      if (customEl.value) document.querySelectorAll('#em-dpi-btns .em-dpi-btn').forEach(function (b) { b.classList.remove('active'); });
      _updateVisibility();
    });
    var qEl = document.getElementById('em-quality');
    var qVal = document.getElementById('em-quality-val');
    if (qEl) qEl.addEventListener('input', function () { if (qVal) qVal.textContent = qEl.value; });

    // Restore saved download settings (format is already applied to the active card via selectedFmt).
    document.querySelectorAll('#em-dpi-btns .em-dpi-btn').forEach(function (b) { b.classList.toggle('active', parseInt(b.dataset.dpi, 10) === selectedDPI); });
    if (_prefs.transparent) { var trEl = document.getElementById('em-transparent'); if (trEl) trEl.checked = true; }
    if (typeof _prefs.quality === 'number' && qEl) { qEl.value = Math.round(_prefs.quality * 100); if (qVal) qVal.textContent = qEl.value; }

    _updateVisibility();

    document.getElementById('em-do-export').onclick = function () {
      var btn = this;
      btn.disabled = true;
      var orig = btn.innerHTML;

      var dpi = _dpi();
      var transEl = document.getElementById('em-transparent');
      var transparent = !!(transEl && transEl.checked);
      var qEl2 = document.getElementById('em-quality');
      var quality = qEl2 ? (parseInt(qEl2.value, 10) / 100) : 0.92;

      // Save download settings as the default for next time.
      try { localStorage.setItem('cc_export_prefs', JSON.stringify({ fmt: selectedFmt, dpi: dpi, transparent: transparent, quality: quality })); } catch (e) {}

      _showProgress('Exporting…');
      var onProg = function (p) { _setProgress(Math.round(p * 100)); };

      var promise;
      switch (selectedFmt) {
        case 'svg':
          _setProgress(35, 'Preparing vector…');
          promise = ExportService.exportPageAsSVG(currentPageIndex);
          break;
        case 'pdf':
          _setProgress(12, 'Preparing PDF…');
          promise = ExportService.exportPageAsPDF(currentPageIndex, dpi, { onProgress: onProg });
          break;
        case 'psd':
          _setProgress(18, 'Creating PSD layers…');
          promise = ExportService.exportPageAsPSD(currentPageIndex, dpi);
          break;
        case 'pptx':
          _setProgress(18, 'Preparing PowerPoint deck…');
          promise = ExportService.exportDeckAsPPTX(currentPageIndex);
          break;
        default:
          _setProgress(12, 'Creating image…');
          promise = ExportService.exportPageAsImage(currentPageIndex, selectedFmt, dpi, { transparent: transparent, quality: quality, onProgress: onProg });
      }

      promise.then(function (r) {
        _hideProgress();
        btn.disabled = false; btn.innerHTML = orig;
        if (typeof showToast === 'function') showToast((r && r.filename ? r.filename : 'File') + ' downloaded', 'success');
      }).catch(function (e) {
        _hideProgress(true);
        btn.disabled = false; btn.innerHTML = orig;
        if (typeof showToast === 'function') showToast('Export failed: ' + e.message, 'error');
      });
    };
  }

  /* ── SECTION: Selected Pages ──────────────────── */

  function _renderSelectedSection(container) {
    var selIndices = typeof _pgSelectedIndices === 'function' ? _pgSelectedIndices() : [];

    // Visual-first page grid: thumbnail cards + checkbox multi-select + search + select-all.
    container.innerHTML =
      '<div class="em-sel-toolbar">' +
        '<input type="text" class="em-search" id="em-page-search" placeholder="Search pages..." autocomplete="off">' +
        '<button class="em-tool-btn" id="em-sel-all" title="Select all">☑</button>' +
        '<button class="em-tool-btn" id="em-desel-all" title="Deselect all">☐</button>' +
      '</div>' +
      '<div class="em-sel-count" id="em-sel-count"></div>' +
      '<div class="em-thumb-grid" id="em-page-list"></div>' +
      '<div class="em-sel-options" id="em-sel-options" style="display:none"></div>';

    var list = document.getElementById('em-page-list');
    var searchInput = document.getElementById('em-page-search');
    var countEl = document.getElementById('em-sel-count');

    // Build thumbnail cards (lazy renderPart preview per part).
    pages.forEach(function (p, idx) {
      var card = document.createElement('label');
      card.className = 'em-pcard';
      card.dataset.name = (p.label || 'Page ' + (idx + 1)).toLowerCase();
      var isPreSelected = selIndices.indexOf(idx) !== -1;
      card.innerHTML =
        '<input type="checkbox" class="em-page-cb" data-idx="' + idx + '" value="' + idx + '"' + (isPreSelected ? ' checked' : '') + '>' +
        '<span class="em-pcard-check">✓</span>' +
        '<div class="em-pcard-thumb"><div class="em-thumb-sk"></div></div>' +
        '<span class="em-pcard-label">' + _esc(p.label || 'Page ' + (idx + 1)) + '</span>' +
        '<span class="em-pcard-dim">' + (p.w || CW) + '×' + (p.h || CH) + '</span>';
      list.appendChild(card);

      if (typeof renderPart === 'function' && typeof resolvePartSource === 'function') {
        var src = resolvePartSource(p);
        if (src) {
          renderPart(
            { kind: src.kind, json: src.json, w: (src.w || p.w || CW), h: (src.h || p.h || CH), bg: (src.bg != null ? src.bg : p.bg), x: src.x, y: src.y },
            { format: 'webp', fit: 180 }
          ).then(function (url) {
            var t = card.querySelector('.em-pcard-thumb');
            if (t) t.innerHTML = url ? '<img src="' + url + '" alt="">' : '<div class="em-thumb-empty">—</div>';
          });
        }
      }
    });

    searchInput.addEventListener('input', function () {
      var q = searchInput.value.toLowerCase().trim();
      list.querySelectorAll('.em-pcard').forEach(function (row) {
        row.style.display = (!q || row.dataset.name.indexOf(q) !== -1) ? '' : 'none';
      });
    });

    document.getElementById('em-sel-all').onclick = function () {
      list.querySelectorAll('.em-pcard:not([style*="display: none"]) .em-page-cb').forEach(function (cb) { cb.checked = true; });
      _refreshSelOptions();
    };
    document.getElementById('em-desel-all').onclick = function () {
      list.querySelectorAll('.em-page-cb').forEach(function (cb) { cb.checked = false; });
      _refreshSelOptions();
    };

    function _refreshSelOptions() {
      var checked = list.querySelectorAll('.em-page-cb:checked');
      list.querySelectorAll('.em-pcard').forEach(function (card) { card.classList.toggle('sel', card.querySelector('.em-page-cb').checked); });
      if (countEl) countEl.textContent = checked.length ? (checked.length + ' pages selected') : 'Select pages to export';
      var opts = document.getElementById('em-sel-options');
      if (checked.length > 0) {
        opts.style.display = '';
        _buildBatchExportOptions(opts, function () {
          return Array.from(list.querySelectorAll('.em-page-cb:checked')).map(function (cb) {
            return parseInt(cb.value, 10);
          });
        });
      } else {
        opts.style.display = 'none';
      }
    }

    list.addEventListener('change', _refreshSelOptions);
    _refreshSelOptions();
  }

  function _buildBatchExportOptions(container, getIndices) {
    container.innerHTML =
      '<div class="em-subsection">Export As</div>' +
      '<div class="em-batch-btns">' +
        '<button class="em-batch-btn" data-mode="zip-png">ZIP (PNG)</button>' +
        '<button class="em-batch-btn" data-mode="zip-jpg">ZIP (JPG)</button>' +
        '<button class="em-batch-btn" data-mode="zip-webp">ZIP (WebP)</button>' +
        '<button class="em-batch-btn" data-mode="zip-svg">ZIP (SVG)</button>' +
        '<button class="em-batch-btn" data-mode="pdf">Combined PDF</button>' +
        '<button class="em-batch-btn" data-mode="individual">Individual Files</button>' +
      '</div>' +
      '<div class="em-opt-row">' +
        '<span class="em-opt-label">DPI</span>' +
        '<div class="em-dpi-btns" id="em-sel-dpi">' +
          '<button class="em-dpi-btn" data-dpi="150">150</button>' +
          '<button class="em-dpi-btn active" data-dpi="300">300</button>' +
          '<button class="em-dpi-btn" data-dpi="600">600</button>' +
        '</div>' +
      '</div>';

    var selDPI = 300;
    container.querySelectorAll('#em-sel-dpi .em-dpi-btn').forEach(function (btn) {
      btn.onclick = function () {
        selDPI = parseInt(btn.dataset.dpi, 10);
        container.querySelectorAll('#em-sel-dpi .em-dpi-btn').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
      };
    });

    container.querySelectorAll('.em-batch-btn').forEach(function (btn) {
      btn.onclick = function () {
        var indices = getIndices();
        if (indices.length === 0) { showToast('No pages selected', 'error'); return; }

        btn.disabled = true;
        var origText = btn.textContent;
        btn.textContent = 'Exporting...';

        var mode = btn.dataset.mode;
        var promise;

        if (mode === 'pdf') {
          promise = ExportService.exportMultiPagePDF(indices, selDPI, 'selected-pages');
        } else if (mode === 'individual') {
          // Download each page as PNG sequentially
          promise = indices.reduce(function (chain, pi) {
            return chain.then(function () {
              return ExportService.exportPageAsImage(pi, 'png', selDPI);
            });
          }, Promise.resolve()).then(function () { return { success: true }; });
        } else if (mode.startsWith('zip-')) {
          var fmt = mode.replace('zip-', '');
          if (fmt === 'jpg') fmt = 'jpeg';
          promise = ExportService.exportPagesAsZIP(indices, fmt, selDPI, 'selected-pages');
        } else {
          promise = Promise.resolve({ success: true });
        }

        promise.then(function () {
          btn.textContent = '✓ Done!';
          setTimeout(function () { btn.disabled = false; btn.textContent = origText; }, 2000);
        }).catch(function (e) {
          btn.textContent = 'Failed';
          showToast('Export failed: ' + e.message, 'error');
          setTimeout(function () { btn.disabled = false; btn.textContent = origText; }, 2000);
        });
      };
    });
  }

  /* ── SECTION: Group Export ─────────────────────── */

  function _renderGroupSection(container) {
    if (typeof pageGroups === 'undefined' || pageGroups.length === 0) {
      container.innerHTML = '<p class="em-empty">No groups created yet.</p>' +
        '<p class="em-hint">Right-click page tabs to create groups.</p>';
      return;
    }

    container.innerHTML =
      '<div class="em-section-header"><span>Select a group to export</span></div>' +
      '<div class="em-group-list" id="em-group-list"></div>' +
      '<div id="em-group-actions" style="display:none"></div>';

    var list = document.getElementById('em-group-list');
    var selectedGroupId = null;

    pageGroups.forEach(function (g) {
      var gPages = [];
      pages.forEach(function (p, idx) { if (p.groupId === g.id) gPages.push(idx); });
      if (gPages.length === 0) return;

      var row = document.createElement('button');
      row.className = 'em-group-row';
      row.dataset.gid = g.id;
      row.innerHTML =
        '<span class="em-gr-dot" style="background:' + g.color + '"></span>' +
        '<span class="em-gr-name">' + _esc(g.name) + '</span>' +
        '<span class="em-gr-count">' + gPages.length + ' pages</span>';
      row.onclick = function () {
        selectedGroupId = g.id;
        list.querySelectorAll('.em-group-row').forEach(function (r) {
          r.classList.toggle('active', r.dataset.gid === g.id);
        });
        var acts = document.getElementById('em-group-actions');
        acts.style.display = '';
        _buildBatchExportOptions(acts, function () {
          return gPages;
        });
      };
      list.appendChild(row);
    });
  }

  /* ── SECTION: Project Export ───────────────────── */

  function _renderProjectSection(container) {
    var pageCount = pages.length;
    var groupCount = typeof pageGroups !== 'undefined' ? pageGroups.length : 0;

    container.innerHTML =
      '<div class="em-section-header">' +
        '<span class="em-proj-title">Full Project Export</span>' +
      '</div>' +
      '<div class="em-proj-info">' +
        '<div class="em-pi-row"><span>Pages</span><span>' + pageCount + '</span></div>' +
        '<div class="em-pi-row"><span>Groups</span><span>' + groupCount + '</span></div>' +
        '<div class="em-pi-row"><span>Format</span><span>' + _EXT.project + ' (ZIP package)</span></div>' +
      '</div>' +
      // The old copy here claimed this "exports everything ... and content", which was never true: the
      // structure-only file references media it does not contain, so on another machine the timeline
      // restores with no picture. Say which of the two things each button actually does.
      '<p class="em-hint">Structure only: pages, groups, settings and metadata. Video, audio and library ' +
      'images stay as references, so they will be missing on another device.</p>' +
      '<div class="em-proj-btns">' +
        '<button class="em-export-btn" id="em-proj-dika">Export ' + _EXT.project + '</button>' +
        '<button class="em-export-btn em-btn-secondary" id="em-proj-json">Export as JSON</button>' +
      '</div>' +
      '<div class="em-section-header" style="margin-top:18px"><span class="em-proj-title">Share with someone else</span></div>' +
      '<p class="em-hint">Packages the media INSIDE the file (video, audio and library images), so it ' +
      'opens complete on any machine. Large projects produce large files.</p>' +
      '<div class="em-proj-btns">' +
        '<button class="em-export-btn" id="em-proj-package">Export with media (' + _EXT.package + ')</button>' +
      '</div>' +
      '<div class="em-import-status" id="em-pkg-status"></div>';

    document.getElementById('em-proj-dika').onclick = function () {
      var btn = this;
      btn.disabled = true; btn.textContent = 'Packaging...';
      ExportService.exportProject('project').then(function () {
        btn.textContent = '✓ Exported!';
        setTimeout(function () { btn.disabled = false; btn.textContent = 'Export ' + _EXT.project; }, 2000);
      }).catch(function (e) {
        btn.textContent = 'Failed';
        showToast('Export failed: ' + e.message, 'error');
        setTimeout(function () { btn.disabled = false; btn.textContent = 'Export ' + _EXT.project; }, 2000);
      });
    };

    document.getElementById('em-proj-package').onclick = function () {
      var btn = this, st = document.getElementById('em-pkg-status');
      var label = 'Export with media (' + _EXT.package + ')';
      function _stat(cls, html) { if (st) st.innerHTML = '<span class="' + cls + '">' + html + '</span>'; }
      function _reset(text, ms) {
        btn.textContent = text || label;
        setTimeout(function () { btn.disabled = false; btn.textContent = label; }, ms || 2500);
      }

      /* The save dialog must be opened HERE, synchronously inside the click, before anything is
         awaited: showSaveFilePicker needs transient user activation and collecting the media consumes
         it ("Must be handling a user gesture to show a file picker"). Cancelling now also costs
         nothing, instead of packaging a gigabyte and then discarding it. */
      var picking;
      try {
        picking = CCProjectPackage.pickTarget(ExportService.projectFilename() + _EXT.package);
      } catch (e) {
        picking = Promise.reject(e);
      }

      btn.disabled = true;
      btn.textContent = 'Collecting media...';
      _stat('em-status-loading', 'Reading media…');

      picking.then(function (target) {
        return ExportService.exportProject('ccproj', {
          withMedia: true,
          target: target,
          onCollectProgress: function (done, total) {
            btn.textContent = 'Collecting ' + done + '/' + total + '...';
          },
          onWriteProgress: function (written) {
            btn.textContent = 'Writing ' + CCProjectPackage.fmtBytes(written) + '...';
            _stat('em-status-loading', 'Streaming to disk… ' + CCProjectPackage.fmtBytes(written));
          }
        });
      }).then(function (res) {
        if (res && res.cancelled) { _stat('em-status-err', 'Cancelled'); _reset('Cancelled'); return; }
        var a = res.assets || { count: 0, totalBytes: 0, missing: [] };
        // Report what was NOT packaged. A silent omission reads as "everything was included".
        var msg = '✓ ' + a.count + ' media file(s), ' + CCProjectPackage.fmtBytes(a.totalBytes);
        if (!res.streamed) msg += ' (built in memory)';
        if (a.missing && a.missing.length) {
          var reasons = {};
          a.missing.forEach(function (m) { reasons[m.missing] = (reasons[m.missing] || 0) + 1; });
          msg += '<br><b>' + a.missing.length + ' could not be included:</b> ' +
            Object.keys(reasons).map(function (k) { return k + ' x' + reasons[k]; }).join(', ');
          _stat('em-status-err', msg);
        } else {
          _stat('em-status-ok', msg);
        }
        _reset('✓ Exported!');
      }).catch(function (e) {
        if (e && e.name === 'AbortError') { _stat('em-status-err', 'Cancelled'); _reset('Cancelled'); return; }
        _stat('em-status-err', '✗ ' + (e.message || e));
        showToast('Package export failed: ' + (e.message || e), 'error');
        _reset('Failed');
      });
    };

    document.getElementById('em-proj-json').onclick = function () {
      // Use existing exportCardFile for backward compat JSON
      if (typeof exportCardFile === 'function') exportCardFile();
    };
  }

  /* ── SECTION: Import ──────────────────────────── */

  function _renderImportSection(container) {
    container.innerHTML =
      '<div class="em-section-header"><span>Import</span></div>' +
      '<div class="em-import-zones">' +
        '<div class="em-import-zone" id="em-import-project">' +
          '<div class="em-iz-icon">📦</div>' +
          '<div class="em-iz-title">Open Project</div>' +
          '<div class="em-iz-desc">' + _EXT.readable.join(', ') + '</div>' +
        '</div>' +
        '<div class="em-import-zone" id="em-import-image">' +
          '<div class="em-iz-icon">🖼</div>' +
          '<div class="em-iz-title">Add to Canvas</div>' +
          '<div class="em-iz-desc">PNG, JPG, WebP, SVG, PSD, PDF</div>' +
        '</div>' +
      '</div>' +
      '<div class="em-import-status" id="em-import-status"></div>';

    var status = document.getElementById('em-import-status');
    function _stat(html) { if (status) status.innerHTML = html; }

    function _importProjectFile(file) {
      if (!file) return;
      _stat('<span class="em-status-loading">Importing…</span>');
      ExportService.importProject(file, {
        onAssetProgress: function (done, total) {
          _stat('<span class="em-status-loading">Unpacking media ' + done + '/' + total + '…</span>');
        }
      }).then(function (r) {
        var msg = '✓ ' + (r.pages || 0) + ' pages imported (' + r.type + ')';
        // A package that silently restored fewer media than it carries is the failure mode this
        // whole feature exists to remove, so the count is always stated, not only on success.
        if (r.assets) {
          msg += '<br>' + r.assets.applied + ' media file(s) restored';
          if (r.assets.missing && r.assets.missing.length) msg += ', ' + r.assets.missing.length + ' missing';
        }
        _stat('<span class="' + ((r.assets && r.assets.missing.length) ? 'em-status-err' : 'em-status-ok') + '">' + msg + '</span>');
        showToast('Project imported', 'success');
        setTimeout(close, r.assets ? 3000 : 1500);
      }).catch(function (e) { _stat('<span class="em-status-err">✗ ' + e.message + '</span>'); showToast('Import failed: ' + e.message, 'error'); });
    }

    function _importCanvasFiles(fileList) {
      var files = Array.prototype.slice.call(fileList || []).filter(Boolean);
      if (!files.length) return;
      _stat('<span class="em-status-loading">' + files.length + ' file adding…</span>');
      files.reduce(function (chain, file) {
        return chain.then(function () {
          var n = (file.name || '').toLowerCase();
          if (n.endsWith('.psd') && ExportService.importPSD) return ExportService.importPSD(file);
          if ((file.type === 'application/pdf' || n.endsWith('.pdf')) && ExportService.importPDF) return ExportService.importPDF(file);
          if (file.type === 'image/svg+xml' || n.endsWith('.svg')) return ExportService.importSVG(file);
          return ExportService.importImage(file);
        });
      }, Promise.resolve()).then(function () {
        _stat('<span class="em-status-ok">✓ ' + files.length + ' file added to canvas</span>');
        showToast(files.length + ' file added', 'success');
        setTimeout(close, 1500);
      }).catch(function (e) { _stat('<span class="em-status-err">✗ ' + e.message + '</span>'); });
    }

    function _pick(accept, multiple, cb) {
      var input = document.createElement('input');
      input.type = 'file'; input.accept = accept; if (multiple) input.multiple = true;
      input.onchange = function (e) { cb(e.target.files); };
      input.click();
    }

    // Real drag-and-drop + click-to-browse for a zone (fixes the old onclick-only "fake drop-zone" bug).
    function _wireZone(el, accept, multiple, onFiles) {
      if (!el) return;
      el.onclick = function () { _pick(accept, multiple, onFiles); };
      el.addEventListener('dragover', function (e) { e.preventDefault(); el.classList.add('em-iz-over'); });
      el.addEventListener('dragleave', function () { el.classList.remove('em-iz-over'); });
      el.addEventListener('drop', function (e) {
        e.preventDefault(); el.classList.remove('em-iz-over');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      });
    }

    _wireZone(document.getElementById('em-import-project'), _EXT.accept, false, function (files) { _importProjectFile(files[0]); });
    _wireZone(document.getElementById('em-import-image'), 'image/png,image/jpeg,image/webp,image/svg+xml,.psd,application/pdf,.pdf', true, _importCanvasFiles);
  }

  /* ── SECTION: Social publish (docs/social-publishing-plan.md, Phase 6) ──
     The heavy UI lives in the export/social-publish module (window.SocialPublish); this section
     just hosts it and passes the preselected platform. */
  function _renderSocialSection(container) {
    if (window.SocialPublish && typeof SocialPublish.renderSection === 'function') {
      SocialPublish.renderSection(container, { platform: _socialPlatform });
    } else {
      container.innerHTML = '<div style="padding:16px;font-size:13px;opacity:.7">Social sharing module could not be loaded.</div>';
    }
  }
  // Open the modal straight to the social section, preselecting a platform (from a share tile).
  function openSocial(platform) { _socialPlatform = platform || ''; open('social'); }

  return { open: open, close: close, openSocial: openSocial };
})();

/* ── Wire into gear menu ──────────────────────────────────── */
/* The "Export / Import Manager" button is statically placed in gear-dropdown in index.html.
   ExportManager.open('page') is called from there. No dynamic injection needed. */

// Modular skeleton hook (Faz 8) — export-manager is now an export loader module (modules/export/).
if (window.cc && cc.modules) cc.modules.register({ id: 'export-manager', parent: 'export', title: 'Export manager', mount: function () {}, unmount: function () {} });
