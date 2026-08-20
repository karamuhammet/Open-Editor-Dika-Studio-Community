/* ═══════════════════════════════════════════════════════════════
   VE Audio Mixer — Track fader board with VU meters
   Faz 1 — Vertical faders, pan knobs, VU meters, master bus
   ═══════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  var _panel = null;
  var _isOpen = false;
  var _vuAnimFrame = null;
  var _vuCanvases = [];

  function _icon(name, sz) {
    if (typeof getIcon === 'function') { var r = getIcon(name, sz || 14); if (r) return r; }
    return '';
  }

  function _buildPanel() {
    if (_panel) return _panel;
    _panel = document.createElement('div');
    _panel.className = 've-audio-mixer';
    _panel.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);' +
      'min-width:400px;max-width:800px;height:280px;' +
      'background:var(--surface2,#1b1b1f);border:1px solid var(--border,#27272d);border-radius:10px;' +
      'box-shadow:0 8px 32px rgba(0,0,0,.55);z-index:10050;display:none;flex-direction:column;overflow:hidden;';

    var html = '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;border-bottom:1px solid var(--border,#27272d);flex-shrink:0;">' +
      '<span style="color:var(--text,#ededf0);font-weight:600;font-size:13px;">' + _icon('sliders', 16) + ' Audio Mixer</span>' +
      '<button id="ve-mixer-close" style="background:none;border:none;color:var(--text-dim,#888);cursor:pointer;font-size:16px;">✕</button></div>';

    html += '<div id="ve-mixer-tracks" style="display:flex;flex:1;overflow-x:auto;padding:8px;gap:2px;align-items:stretch;"></div>';

    _panel.innerHTML = html;
    document.body.appendChild(_panel);

    _panel.querySelector('#ve-mixer-close').addEventListener('click', _hide);

    if (window.VEPanelHelpers) VEPanelHelpers.decorate(_panel);
    return _panel;
  }

  // ── Render mixer strips for current project tracks ──
  function _renderStrips() {
    var container = _panel.querySelector('#ve-mixer-tracks');
    if (!container) return;
    container.innerHTML = '';
    _vuCanvases = [];

    var tracks = [];
    if (window.VideoEditor && VideoEditor.getProject) {
      var proj = VideoEditor.getProject();
      if (proj && proj.tracks) tracks = proj.tracks;
    }
    if (tracks.length === 0) {
      container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;flex:1;color:var(--text-dim);font-size:12px;">No tracks. Import media to see mixer.</div>';
      return;
    }

    // Track strips
    tracks.forEach(function(track, idx) {
      container.appendChild(_createStrip(track, idx, false));
    });

    // Separator
    var sep = document.createElement('div');
    sep.style.cssText = 'width:1px;background:var(--gold,#f2ff58);margin:0 6px;flex-shrink:0;opacity:.3;';
    container.appendChild(sep);

    // Master strip — seed the fader from the canonical master volume so the mixer opens
    // showing the real level, not a hardcoded 100%.
    var _mVE = window.__ccVideoEditor;
    var _mVol = _mVE && _mVE._veMasterVol != null ? _mVE._veMasterVol : 1;
    container.appendChild(_createStrip({ label: 'MASTER', volume: _mVol, muted: false, solo: false }, -1, true));

    // Start VU animation
    _startVU();
  }

  function _createStrip(track, idx, isMaster) {
    var strip = document.createElement('div');
    strip.className = 've-mixer-strip';
    strip.dataset.trackIdx = idx;
    strip.style.cssText = 'display:flex;flex-direction:column;align-items:center;width:64px;min-width:64px;' +
      'padding:6px 4px;background:' + (isMaster ? 'rgba(242, 255, 88,.06)' : 'var(--surface3,#232328)') + ';' +
      'border-radius:6px;gap:4px;';

    // Label
    var label = track.label || (track.type === 'video' ? 'V' + (idx + 1) : 'A' + (idx + 1));
    var labelEl = document.createElement('div');
    labelEl.style.cssText = 'font-size:9px;color:' + (isMaster ? 'var(--gold,#f2ff58)' : 'var(--text-dim,#888)') + ';font-weight:600;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;';
    labelEl.textContent = String(label).slice(0, 120);
    strip.appendChild(labelEl);

    // VU Meter canvas
    var vuCvs = document.createElement('canvas');
    vuCvs.width = 20; vuCvs.height = 120;
    vuCvs.style.cssText = 'width:20px;height:120px;border-radius:3px;background:#0a0a0a;';
    vuCvs._trackIdx = idx;
    vuCvs._isMaster = isMaster;
    _vuCanvases.push(vuCvs);

    // Fader + VU side by side
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:4px;align-items:center;flex:1;';

    var fader = document.createElement('input');
    fader.type = 'range';
    fader.min = '0'; fader.max = '200'; fader.value = String(Math.round((track.volume != null ? track.volume : 1) * 100));
    fader.style.cssText = 'writing-mode:vertical-lr;direction:rtl;height:120px;width:18px;accent-color:var(--gold,#f2ff58);cursor:pointer;';
    fader.addEventListener('input', function() {
      var vol = parseInt(fader.value) / 100;
      if (isMaster) {
        // Persist to the canonical master state + re-assert via the ONE sync path, exactly like
        // the toolbar master slider (render.js). The old code wrote the live gain node directly and
        // left VE._veMasterVol stale, so the next _veApplyVolumes (Play, another mute/solo, track
        // props) overwrote the mixer's edit back to the old value.
        var _ve = window.__ccVideoEditor;
        if (_ve) { _ve._veMasterVol = vol; _ve._veMasterMuted = false; }
        if (_ve && typeof _ve._veApplyVolumes === 'function') _ve._veApplyVolumes();
        else if (window.VEAudioEngine && VEAudioEngine.setMasterVolume) VEAudioEngine.setMasterVolume(vol);
      } else {
        if (window.VideoEditor && VideoEditor.getProject) {
          var proj = VideoEditor.getProject();
          if (proj && proj.tracks && proj.tracks[idx]) {
            proj.tracks[idx].volume = vol;
            var tid = proj.tracks[idx].id;
            if (window.VEAudioEngine && VEAudioEngine.setTrackVolume) VEAudioEngine.setTrackVolume(tid, vol);
          }
        }
      }
      valLabel.textContent = fader.value + '%';
    });

    row.appendChild(fader);
    row.appendChild(vuCvs);
    strip.appendChild(row);

    // Volume value
    var valLabel = document.createElement('div');
    valLabel.style.cssText = 'font-size:9px;color:var(--text-dim);';
    valLabel.textContent = fader.value + '%';
    strip.appendChild(valLabel);

    // Pan knob
    var panRow = document.createElement('div');
    panRow.style.cssText = 'display:flex;align-items:center;gap:2px;';
    var panLbl = document.createElement('span');
    panLbl.style.cssText = 'font-size:8px;color:var(--text-dim);';
    panLbl.textContent = 'L';
    panRow.appendChild(panLbl);
    var panSlider = document.createElement('input');
    panSlider.type = 'range'; panSlider.min = '-100'; panSlider.max = '100'; panSlider.value = '0';
    panSlider.style.cssText = 'width:44px;height:12px;accent-color:var(--gold,#f2ff58);';
    panSlider.addEventListener('input', function() {
      var panVal = parseInt(panSlider.value) / 100;
      if (!isMaster && window.VideoEditor && VideoEditor.getProject) {
        var proj = VideoEditor.getProject();
        var tid = (proj && proj.tracks && proj.tracks[idx]) ? proj.tracks[idx].id : null;
        if (tid && window.VEAudioEngine) {
          // Ensure AudioContext is active (user gesture context)
          VEAudioEngine.ensureContext();
          VEAudioEngine.resumeContext();
          VEAudioEngine._setPan(tid, panVal);
        }
      }
    });
    panRow.appendChild(panSlider);
    var panRbl = document.createElement('span');
    panRbl.style.cssText = 'font-size:8px;color:var(--text-dim);';
    panRbl.textContent = 'R';
    panRow.appendChild(panRbl);
    strip.appendChild(panRow);

    // Mute / Solo buttons
    if (!isMaster) {
      var btns = document.createElement('div');
      btns.style.cssText = 'display:flex;gap:3px;';

      var muteBtn = document.createElement('button');
      muteBtn.textContent = 'M';
      muteBtn.style.cssText = 'width:22px;height:18px;border-radius:3px;border:none;font-size:9px;font-weight:700;cursor:pointer;' +
        'background:' + (track.muted ? '#ef4444' : 'var(--surface,#131316)') + ';color:' + (track.muted ? '#fff' : 'var(--text-dim)') + ';';
      muteBtn.addEventListener('click', function() {
        if (window.VideoEditor && VideoEditor.getProject) {
          var proj = VideoEditor.getProject();
          if (proj && proj.tracks && proj.tracks[idx]) {
            proj.tracks[idx].muted = !proj.tracks[idx].muted;
            muteBtn.style.background = proj.tracks[idx].muted ? '#ef4444' : 'var(--surface,#131316)';
            muteBtn.style.color = proj.tracks[idx].muted ? '#fff' : 'var(--text-dim)';
            // Apply to audio engine
            var tid = proj.tracks[idx].id;
            if (window.VEAudioEngine) {
              if (VEAudioEngine.applySolo) VEAudioEngine.applySolo(proj.tracks);
              else if (VEAudioEngine.setTrackMuted) VEAudioEngine.setTrackMuted(tid, proj.tracks[idx].muted);
            }
          }
        }
      });

      var soloBtn = document.createElement('button');
      soloBtn.textContent = 'S';
      soloBtn.style.cssText = 'width:22px;height:18px;border-radius:3px;border:none;font-size:9px;font-weight:700;cursor:pointer;' +
        'background:' + (track.solo ? '#eab308' : 'var(--surface,#131316)') + ';color:' + (track.solo ? '#000' : 'var(--text-dim)') + ';';
      soloBtn.addEventListener('click', function() {
        if (window.VideoEditor && VideoEditor.getProject) {
          var proj = VideoEditor.getProject();
          if (proj && proj.tracks && proj.tracks[idx]) {
            proj.tracks[idx].solo = !proj.tracks[idx].solo;
            soloBtn.style.background = proj.tracks[idx].solo ? '#eab308' : 'var(--surface,#131316)';
            soloBtn.style.color = proj.tracks[idx].solo ? '#000' : 'var(--text-dim)';
            // Apply solo/mute state to audio engine
            if (window.VEAudioEngine && VEAudioEngine.applySolo) {
              VEAudioEngine.applySolo(proj.tracks);
            }
          }
        }
      });

      btns.appendChild(muteBtn);
      btns.appendChild(soloBtn);
      strip.appendChild(btns);
    }

    return strip;
  }

  // ── VU Meter animation loop ──
  var _vuPeaks = {};   // peak hold per canvas index
  var _vuSmooth = {};  // smoothed level per canvas index

  function _startVU() {
    if (_vuAnimFrame) cancelAnimationFrame(_vuAnimFrame);

    // Get master level from analyser frequency data
    function _getMasterLevel() {
      if (!window.VEAudioEngine) return 0;
      var data = VEAudioEngine.getFrequencyData ? VEAudioEngine.getFrequencyData() : null;
      if (!data || !data.length) return 0;
      var sum = 0;
      for (var i = 0; i < data.length; i++) sum += data[i];
      return (sum / data.length) / 255;
    }

    // Check if VE is playing
    function _isPlaying() {
      if (window.VideoEditor && VideoEditor.getProject) {
        var proj = VideoEditor.getProject();
        if (proj && proj._isPlaying) return true;
      }
      // Fallback: check playback state via internal access
      try {
        var proj = window.VideoEditor && VideoEditor.getProject ? VideoEditor.getProject() : null;
        // The playback loop sets _vePlayback.playing but we can't access it directly.
        // Check if there are any un-paused media elements in the audio engine
        if (window.VEAudioEngine && VEAudioEngine.getAnalyser && VEAudioEngine.getAnalyser()) {
          var analyser = VEAudioEngine.getAnalyser();
          if (analyser && analyser.context && analyser.context.state === 'running') {
            // If analyser has signal, assume playing
            var d = VEAudioEngine.getFrequencyData ? VEAudioEngine.getFrequencyData() : null;
            if (d) { var s = 0; for (var k = 0; k < d.length; k++) s += d[k]; if (s > 50) return true; }
          }
        }
      } catch(e) {}
      return false;
    }

    function draw() {
      var masterLevel = _getMasterLevel();
      var playing = masterLevel > 0.01 || _isPlaying();

      _vuCanvases.forEach(function(cvs, ci) {
        var ctx = cvs.getContext('2d');
        var w = cvs.width, h = cvs.height;
        ctx.clearRect(0, 0, w, h);

        var level = 0;
        if (cvs._isMaster) {
          level = masterLevel;
        } else {
          // Per-track: use real analyser data from audio engine
          if (window.VideoEditor && VideoEditor.getProject) {
            var proj = VideoEditor.getProject();
            if (proj && proj.tracks && proj.tracks[cvs._trackIdx]) {
              var t = proj.tracks[cvs._trackIdx];
              if (window.VEAudioEngine && VEAudioEngine.getTrackLevel) {
                level = VEAudioEngine.getTrackLevel(t.id);
              }
            }
          }
        }

        // Smooth the level for nice animation
        if (!_vuSmooth[ci]) _vuSmooth[ci] = 0;
        _vuSmooth[ci] += (level - _vuSmooth[ci]) * 0.3;
        var smoothLevel = _vuSmooth[ci];

        // Peak hold
        if (!_vuPeaks[ci]) _vuPeaks[ci] = { val: 0, time: 0 };
        if (smoothLevel > _vuPeaks[ci].val) { _vuPeaks[ci].val = smoothLevel; _vuPeaks[ci].time = Date.now(); }
        if (Date.now() - _vuPeaks[ci].time > 800) { _vuPeaks[ci].val *= 0.95; }

        var barH = h * Math.min(smoothLevel, 1);
        var y = h - barH;

        // Gradient: green → yellow → red
        var grad = ctx.createLinearGradient(0, h, 0, 0);
        grad.addColorStop(0, '#22c55e');
        grad.addColorStop(0.6, '#eab308');
        grad.addColorStop(0.85, '#ef4444');
        ctx.fillStyle = grad;
        ctx.fillRect(2, y, w - 4, barH);

        // Peak hold line
        if (_vuPeaks[ci].val > 0.05) {
          var peakY = h - h * Math.min(_vuPeaks[ci].val, 1);
          ctx.fillStyle = _vuPeaks[ci].val > 0.85 ? '#ef4444' : 'var(--gold,#f2ff58)';
          ctx.fillRect(1, peakY, w - 2, 2);
        }

        // Grid lines
        ctx.strokeStyle = 'rgba(255,255,255,.08)';
        ctx.lineWidth = 0.5;
        for (var g = 0; g < 5; g++) {
          var gy = h * g / 5;
          ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
        }
      });
      _vuAnimFrame = requestAnimationFrame(draw);
    }
    draw();
  }

  function _stopVU() {
    if (_vuAnimFrame) { cancelAnimationFrame(_vuAnimFrame); _vuAnimFrame = null; }
  }

  function _show() {
    var p = _buildPanel();
    p.style.display = 'flex';
    _isOpen = true;
    _renderStrips();
  }

  function _hide() {
    if (_panel) _panel.style.display = 'none';
    _isOpen = false;
    _stopVU();
  }

  function _toggle() { _isOpen ? _hide() : _show(); }

  window.VEAudioMixer = {
    show: _show, hide: _hide, toggle: _toggle,
    isOpen: function() { return _isOpen; },
    refresh: _renderStrips
  };
})();

// Modular skeleton hook (Faz 8) — ve-audio-mixer is now a video loader module (modules/video/). Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-audio-mixer', parent: 'video', title: 've-audio-mixer', mount: function () {}, unmount: function () {} });
