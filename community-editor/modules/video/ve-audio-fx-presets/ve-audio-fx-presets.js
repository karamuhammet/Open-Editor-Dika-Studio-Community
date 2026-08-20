/* ═══════════════════════════════════════════════════════════════
   VE Audio FX Presets — Voice effects & audio preset panel
   Faz 5 — Telephone, Radio, Echo, Robot, Underwater, etc.
   ═══════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  var _panel = null;
  var _isOpen = false;
  var _previewTimeout = null;
  var _intensity = 1.0;          // 0-1 wet/dry mix for all FX
  var _currentPresetId = null;   // currently active preset id
  var _extraNodes = {};          // clipId → {oscs:[], dispose:fn}

  // ── Preset definitions ──
  // EQ bands: {f: frequency Hz, g: gain dB} — moderate values only!
  // comp: DynamicsCompressor params — gentle settings
  // reverb: {preset: name, wet: 0-1}
  // extra: 'delay'|'saturate'|'ringmod'|'deesser'|'noisegate' (built as chain node)
  var PRESETS = [
    { id: 'telephone',    label: 'Telephone',     icon: 'phone',        desc: 'Bandpass 300-3400Hz',
      eq: [{f:60,g:-18},{f:150,g:-12},{f:300,g:-2},{f:800,g:3},{f:1400,g:3},{f:2500,g:1},{f:3400,g:-3},{f:6000,g:-15}],
      reverb: null, comp: {threshold:-15,ratio:3,attack:0.005,release:0.15}, extra: null },
    { id: 'radio',        label: 'Radio',         icon: 'radio',        desc: 'AM radio vintage',
      eq: [{f:60,g:-14},{f:170,g:-8},{f:400,g:2},{f:1000,g:4},{f:2000,g:3},{f:4000,g:-4},{f:6000,g:-10},{f:12000,g:-16}],
      reverb: null, comp: {threshold:-18,ratio:4,attack:0.005,release:0.15}, extra: 'saturate' },
    { id: 'echo',         label: 'Echo',          icon: 'repeat',       desc: 'Hall reverb + delay',
      eq: [{f:100,g:-2},{f:700,g:1},{f:3000,g:-1}],
      reverb: {preset:'hall',wet:0.5}, comp: null, extra: 'delay' },
    { id: 'robot',        label: 'Robot',         icon: 'cpu',          desc: 'Ring modulation + metallic',
      eq: [{f:60,g:-4},{f:350,g:3},{f:700,g:4},{f:2000,g:3},{f:6000,g:2}],
      reverb: {preset:'plate',wet:0.2}, comp: {threshold:-14,ratio:6,attack:0.002,release:0.08}, extra: 'ringmod' },
    { id: 'underwater',   label: 'Underwater',    icon: 'droplet',      desc: 'Deep lowpass — muffled sub bass',
      eq: [{f:60,g:8},{f:150,g:5},{f:350,g:0},{f:500,g:-10},{f:1000,g:-20},{f:3000,g:-30},{f:6000,g:-36}],
      reverb: null, comp: {threshold:-18,ratio:3,attack:0.02,release:0.3}, extra: null },
    { id: 'bass-boost',   label: 'Bass Boost',    icon: 'volume-2',     desc: 'Low +10dB, warm',
      eq: [{f:60,g:8},{f:100,g:10},{f:170,g:6},{f:350,g:2},{f:700,g:0},{f:3000,g:-1}],
      reverb: null, comp: {threshold:-12,ratio:2.5,attack:0.01,release:0.2}, extra: null },
    { id: 'treble-boost', label: 'Treble Boost',  icon: 'volume-1',     desc: 'Air + presence',
      eq: [{f:170,g:-1},{f:2000,g:2},{f:4000,g:5},{f:6000,g:7},{f:8000,g:8},{f:12000,g:6}],
      reverb: null, comp: null, extra: null },
    { id: 'vocal-clarity',label: 'Vocal Clarity', icon: 'mic',          desc: 'Presence boost + de-ess',
      eq: [{f:60,g:-4},{f:170,g:-2},{f:350,g:1},{f:700,g:0},{f:2500,g:4},{f:4000,g:3},{f:6000,g:1},{f:12000,g:-1}],
      reverb: null, comp: {threshold:-20,ratio:2.5,attack:0.01,release:0.2}, extra: 'deesser' },
    { id: 'cinematic',    label: 'Cinematic',     icon: 'film',         desc: 'Cathedral reverb + warmth',
      eq: [{f:60,g:2},{f:170,g:2},{f:350,g:1},{f:700,g:-1},{f:2000,g:0},{f:6000,g:1},{f:12000,g:1}],
      reverb: {preset:'cathedral',wet:0.35}, comp: {threshold:-18,ratio:2,attack:0.02,release:0.3}, extra: null },
    { id: 'lofi',         label: 'Lo-Fi',         icon: 'disc',         desc: 'Vinyl feel + warmth',
      eq: [{f:60,g:2},{f:170,g:3},{f:350,g:1},{f:700,g:0},{f:2000,g:-3},{f:4000,g:-6},{f:8000,g:-10},{f:12000,g:-14}],
      reverb: {preset:'room',wet:0.15}, comp: {threshold:-16,ratio:3,attack:0.01,release:0.2}, extra: 'saturate' },
    { id: 'megaphone',    label: 'Megaphone',     icon: 'volume',       desc: 'Midrange peak + grit',
      eq: [{f:60,g:-16},{f:170,g:-10},{f:500,g:2},{f:1400,g:5},{f:2500,g:6},{f:4000,g:2},{f:6000,g:-5},{f:12000,g:-14}],
      reverb: null, comp: {threshold:-10,ratio:8,attack:0.002,release:0.05}, extra: 'saturate' },
    { id: 'whisper',      label: 'Whisper',       icon: 'wind',         desc: 'Soft + breathy + airy',
      eq: [{f:60,g:-8},{f:170,g:-5},{f:350,g:-2},{f:1400,g:1},{f:3000,g:3},{f:6000,g:3},{f:8000,g:2},{f:12000,g:2}],
      reverb: {preset:'room',wet:0.15}, comp: {threshold:-22,ratio:2,attack:0.02,release:0.3}, extra: null }
  ];

  function _icon(name, sz) {
    if (typeof getIcon === 'function') { var r = getIcon(name, sz || 14); if (r) return r; }
    return '';
  }

  // ── Build panel ──
  function _buildPanel() {
    if (_panel) return _panel;
    _panel = document.createElement('div');
    _panel.className = 've-audiofx-panel';
    _panel.style.cssText = 'position:fixed;top:80px;left:60px;width:320px;max-height:500px;' +
      'background:var(--surface2,#1b1b1f);border:1px solid var(--border,#27272d);border-radius:10px;' +
      'box-shadow:0 8px 32px rgba(0,0,0,.55);z-index:10050;display:none;flex-direction:column;overflow:hidden;';

    var html = '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--border,#27272d);">' +
      '<span style="color:var(--text,#ededf0);font-weight:600;font-size:13px;">' + _icon('headphones', 16) + ' Audio FX Presets</span>' +
      '<button id="ve-audiofx-close" style="background:none;border:none;color:var(--text-dim,#888);cursor:pointer;font-size:16px;">✕</button></div>';

    html += '<div style="padding:8px 14px;border-bottom:1px solid var(--border,#27272d);">' +
      '<div style="display:flex;gap:6px;align-items:center;">' +
      '<button id="ve-audiofx-reset" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface3);color:var(--text-dim);font-size:11px;cursor:pointer;">' + _icon('x', 12) + ' Reset</button>' +
      '<div style="flex:1;display:flex;align-items:center;gap:6px;">' +
      '<span style="font-size:10px;color:var(--text-dim);white-space:nowrap;">Intensity</span>' +
      '<input id="ve-audiofx-intensity" type="range" min="0" max="100" value="100" style="flex:1;height:4px;accent-color:var(--gold,#f2ff58);cursor:pointer;">' +
      '<span id="ve-audiofx-intensity-val" style="font-size:10px;color:var(--text);min-width:28px;text-align:right;">100%</span>' +
      '</div></div></div>';

    html += '<div id="ve-audiofx-grid" class="ve-panel-scroll" style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;padding:10px;overflow-y:auto;flex:1;max-height:380px;">';
    PRESETS.forEach(function(p) {
      html += '<div class="ve-audiofx-card" data-preset="' + p.id + '" ' +
        'style="display:flex;align-items:center;gap:8px;padding:10px;border-radius:8px;' +
        'border:1px solid var(--border,#27272d);background:var(--surface3,#232328);cursor:pointer;transition:all .15s;">' +
        '<div style="font-size:20px;opacity:.7;">' + _icon(p.icon, 20) + '</div>' +
        '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:11px;color:var(--text,#ededf0);font-weight:500;">' + p.label + '</div>' +
        '<div style="font-size:9px;color:var(--text-dim,#888);margin-top:1px;">' + p.desc + '</div>' +
        '</div></div>';
    });
    html += '</div>';

    _panel.innerHTML = html;
    document.body.appendChild(_panel);

    // Events
    _panel.querySelector('#ve-audiofx-close').addEventListener('click', _hide);
    _panel.querySelector('#ve-audiofx-reset').addEventListener('click', function() { _removePreset(); });

    var intensitySlider = _panel.querySelector('#ve-audiofx-intensity');
    var intensityLabel = _panel.querySelector('#ve-audiofx-intensity-val');
    intensitySlider.addEventListener('input', function() {
      _intensity = parseInt(intensitySlider.value) / 100;
      intensityLabel.textContent = intensitySlider.value + '%';
      // Re-apply current preset at new intensity
      if (_currentPresetId) _applyPreset(_currentPresetId);
    });

    _panel.querySelector('#ve-audiofx-grid').addEventListener('click', function(e) {
      var card = e.target.closest('.ve-audiofx-card');
      if (card) _applyPreset(card.dataset.preset);
    });

    // Hover effects
    _panel.querySelector('#ve-audiofx-grid').addEventListener('mouseover', function(e) {
      var card = e.target.closest('.ve-audiofx-card');
      if (card) card.style.borderColor = 'var(--gold,#f2ff58)';
    });
    _panel.querySelector('#ve-audiofx-grid').addEventListener('mouseout', function(e) {
      var card = e.target.closest('.ve-audiofx-card');
      if (card) card.style.borderColor = 'var(--border,#27272d)';
    });

    if (window.VEPanelHelpers) VEPanelHelpers.decorate(_panel);
    return _panel;
  }

  // ── Map preset EQ bands to 8-band ParametricEQ settings ──
  // Default 8-band freqs: [60, 170, 350, 700, 1400, 3000, 6000, 12000]
  var _EQ_FREQS = [60, 170, 350, 700, 1400, 3000, 6000, 12000];
  function _presetEqToBands(presetEq) {
    var bands = [];
    for (var i = 0; i < _EQ_FREQS.length; i++) {
      bands.push({ freq: _EQ_FREQS[i], gain: 0 });
    }
    if (!presetEq) return bands;
    presetEq.forEach(function(b) {
      // Find nearest band index
      var bestIdx = 0, bestDist = Infinity;
      for (var j = 0; j < _EQ_FREQS.length; j++) {
        var dist = Math.abs(Math.log(b.f) - Math.log(_EQ_FREQS[j]));
        if (dist < bestDist) { bestDist = dist; bestIdx = j; }
      }
      bands[bestIdx] = { freq: b.f, gain: b.g };
    });
    return bands;
  }

  // ── Wrapper builders: create chain-insertable objects with getInput/getOutput ──
  // These are inserted INTO the chain BEFORE it's connected, so no feedback loops.

  function _makeSaturator(ctx, amount) {
    var input = ctx.createGain();
    var output = ctx.createGain();
    var shaper = ctx.createWaveShaper();
    var nSamples = 256;
    var curve = new Float32Array(nSamples);
    var k = Math.max(0.3, amount); // gentle saturation
    for (var i = 0; i < nSamples; i++) {
      var x = (i * 2) / nSamples - 1;
      curve[i] = (Math.PI + k) * x / (Math.PI + k * Math.abs(x));
    }
    shaper.curve = curve;
    shaper.oversample = '4x';
    // Gain compensation: waveshaper amplifies small signals by (π+k)/π
    // Compensate so wet path stays at unity
    var compensation = Math.PI / (Math.PI + k);
    // Wet/dry mix: input → shaper → compGain → wetGain → output
    //              input → dryGain → output
    var compGain = ctx.createGain();
    compGain.gain.value = compensation;
    var wet = ctx.createGain();
    wet.gain.value = 0.15; // subtle blend — shaper adds harmonics
    var dry = ctx.createGain();
    dry.gain.value = 0.85;
    input.connect(shaper);
    shaper.connect(compGain);
    compGain.connect(wet);
    wet.connect(output);
    input.connect(dry);
    dry.connect(output);
    return {
      getInput: function() { return input; },
      getOutput: function() { return output; },
      dispose: function() {
        try { input.disconnect(); shaper.disconnect(); compGain.disconnect(); wet.disconnect(); dry.disconnect(); output.disconnect(); } catch(e){}
      }
    };
  }

  function _makeDelay(ctx, time, feedback, wetMix) {
    var input = ctx.createGain();
    var output = ctx.createGain();
    var delay = ctx.createDelay(2.0);
    delay.delayTime.value = time;
    var fb = ctx.createGain();
    fb.gain.value = Math.min(feedback, 0.7); // cap feedback to prevent runaway
    var wet = ctx.createGain();
    wet.gain.value = wetMix;
    var dry = ctx.createGain();
    dry.gain.value = 0.75;
    // Dry path
    input.connect(dry);
    dry.connect(output);
    // Wet path: input → delay → wet → output, delay → fb → delay (feedback)
    input.connect(delay);
    delay.connect(wet);
    wet.connect(output);
    delay.connect(fb);
    fb.connect(delay); // feedback ONLY within the delay, not back to input
    return {
      getInput: function() { return input; },
      getOutput: function() { return output; },
      dispose: function() {
        try { input.disconnect(); delay.disconnect(); fb.disconnect(); wet.disconnect(); dry.disconnect(); output.disconnect(); } catch(e){}
      }
    };
  }

  function _makeRingMod(ctx, freq) {
    var input = ctx.createGain();
    var output = ctx.createGain();
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    // Ring mod: input × oscillator
    var modGain = ctx.createGain();
    modGain.gain.value = 0; // AudioParam modulated by osc
    osc.connect(modGain.gain);
    // Wet/dry — keep total ≤ 1.0
    var wet = ctx.createGain();
    wet.gain.value = 0.25;
    var dry = ctx.createGain();
    dry.gain.value = 0.75;
    input.connect(modGain);
    modGain.connect(wet);
    wet.connect(output);
    input.connect(dry);
    dry.connect(output);
    osc.start();
    return {
      _osc: osc,
      getInput: function() { return input; },
      getOutput: function() { return output; },
      dispose: function() {
        try { osc.stop(); } catch(e){}
        try { input.disconnect(); modGain.disconnect(); osc.disconnect(); wet.disconnect(); dry.disconnect(); output.disconnect(); } catch(e){}
      }
    };
  }

  // ── Dispose extra nodes for a clip ──
  function _disposeExtraNodes(clipId) {
    var entry = _extraNodes[clipId];
    if (!entry) return;
    if (entry.dispose) entry.dispose();
    delete _extraNodes[clipId];
  }

  // ── Apply preset to selected audio/video clip ──
  function _applyPreset(presetId) {
    var preset = null;
    for (var i = 0; i < PRESETS.length; i++) {
      if (PRESETS[i].id === presetId) { preset = PRESETS[i]; break; }
    }
    if (!preset) return;
    _currentPresetId = presetId;

    var applied = false;
    if (window.VideoEditor && VideoEditor.getSelectedClips) {
      var clipIds = VideoEditor.getSelectedClips();
      if (!clipIds || clipIds.length === 0) {
        if (typeof showToast === 'function') showToast('Select a clip first', 'warning');
        return;
      }
      clipIds.forEach(function(clipId) {
        var clip = VideoEditor.findClipById ? VideoEditor.findClipById(clipId) : null;
        if (!clip) return;
        if (clip.type !== 'video' && clip.type !== 'audio') {
          if (typeof showToast === 'function') showToast('Audio FX only applies to video/audio clips', 'warning');
          return;
        }
        applied = true;

        // Clean up previous FX for this clip
        _disposeExtraNodes(clipId);
        if (window.VEAudioAdvanced) VEAudioAdvanced.disposeClipChain(clipId);
        if (window.VEAudioEngine && VEAudioEngine.removeChain) VEAudioEngine.removeChain(clipId);

        // Store preset data on clip
        clip.audioFx = { preset: presetId, intensity: _intensity };

        // ── VEAudioAdvanced path: full chain with EQ, reverb, compressor ──
        if (window.VEAudioAdvanced && window.VEAudioEngine && VEAudioEngine.insertChain) {
          var settings = {};
          // EQ: map preset bands to 8-band parametric format, scaled by intensity
          if (preset.eq) {
            var scaledEq = _presetEqToBands(preset.eq);
            for (var b = 0; b < scaledEq.length; b++) {
              scaledEq[b].gain = Math.round(scaledEq[b].gain * _intensity * 10) / 10;
            }
            settings.eq = scaledEq;
          }
          // Reverb
          if (preset.reverb) {
            settings.reverb = { preset: preset.reverb.preset, mix: preset.reverb.wet * _intensity };
          }
          // Compressor (scale threshold toward 0 as intensity decreases)
          if (preset.comp) {
            settings.compressor = {
              threshold: preset.comp.threshold * _intensity,
              ratio: 1 + (preset.comp.ratio - 1) * _intensity,
              attack: preset.comp.attack,
              release: preset.comp.release
            };
          }
          // De-esser
          if (preset.extra === 'deesser') {
            settings.deEsser = { amount: 4 * _intensity, frequency: 6500 };
          }
          // Noise gate
          if (preset.extra === 'noisegate') {
            settings.noiseGate = { threshold: -40, attack: 0.01, release: 0.15 };
          }

          var chain = VEAudioAdvanced.createClipChain(clipId, settings);

          // Add extra effects as proper chain nodes (serial, no feedback loops)
          var ctx = VEAudioEngine.ensureContext ? VEAudioEngine.ensureContext() : null;
          if (ctx && preset.extra) {
            var extraNode = null;
            if (preset.extra === 'saturate') {
              extraNode = _makeSaturator(ctx, 1.5 * _intensity);
            } else if (preset.extra === 'delay') {
              extraNode = _makeDelay(ctx, 0.3, 0.35 * _intensity, 0.4 * _intensity);
            } else if (preset.extra === 'ringmod') {
              extraNode = _makeRingMod(ctx, 150);
            }
            if (extraNode) {
              chain.add('extra', extraNode, preset.extra);
              _extraNodes[clipId] = extraNode;
            }
          }

          VEAudioEngine.insertChain(clipId, chain);
          return; // done for this clip
        }

        // ── Fallback: basic 3-band EQ via VEAudioEngine ──
        if (window.VEAudioEngine && preset.eq) {
          preset.eq.forEach(function(band) {
            var g = Math.round(band.g * _intensity);
            if (band.f <= 300 && VEAudioEngine.setClipEQ) VEAudioEngine.setClipEQ(clipId, 'low', g);
            else if (band.f >= 3000 && VEAudioEngine.setClipEQ) VEAudioEngine.setClipEQ(clipId, 'high', g);
            else if (VEAudioEngine.setClipEQ) VEAudioEngine.setClipEQ(clipId, 'mid', g);
          });
        }
      });
      if (VideoEditor.render) VideoEditor.render();
    }
    if (applied && typeof showToast === 'function') showToast('Audio FX: ' + preset.label + ' (' + Math.round(_intensity * 100) + '%)');

    // Visual feedback
    _panel.querySelectorAll('.ve-audiofx-card').forEach(function(c) {
      var isActive = c.dataset.preset === presetId;
      c.style.background = isActive ? 'rgba(242, 255, 88,.1)' : 'var(--surface3,#232328)';
      c.style.borderColor = isActive ? 'var(--gold,#f2ff58)' : 'var(--border,#27272d)';
    });
  }

  function _removePreset() {
    _currentPresetId = null;
    if (window.VideoEditor && VideoEditor.getSelectedClips) {
      var clipIds = VideoEditor.getSelectedClips();
      if (clipIds && clipIds.length > 0) {
        clipIds.forEach(function(clipId) {
          var clip = VideoEditor.findClipById ? VideoEditor.findClipById(clipId) : null;
          if (clip) {
            delete clip.audioFx;
            _disposeExtraNodes(clipId);
            if (window.VEAudioAdvanced) VEAudioAdvanced.disposeClipChain(clipId);
            if (window.VEAudioEngine && VEAudioEngine.removeChain) VEAudioEngine.removeChain(clipId);
            if (window.VEAudioEngine && VEAudioEngine.setClipEQ) {
              VEAudioEngine.setClipEQ(clipId, 'low', 0);
              VEAudioEngine.setClipEQ(clipId, 'mid', 0);
              VEAudioEngine.setClipEQ(clipId, 'high', 0);
            }
          }
        });
        if (VideoEditor.render) VideoEditor.render();
      }
    }
    if (_panel) {
      _panel.querySelectorAll('.ve-audiofx-card').forEach(function(c) {
        c.style.background = 'var(--surface3,#232328)';
        c.style.borderColor = 'var(--border,#27272d)';
      });
    }
    if (typeof showToast === 'function') showToast('Audio FX removed');
  }

  function _show() { _buildPanel().style.display = 'flex'; _isOpen = true; }
  function _hide() { if (_panel) _panel.style.display = 'none'; _isOpen = false; }
  function _toggle() { _isOpen ? _hide() : _show(); }

  window.VEAudioFxPresets = {
    show: _show, hide: _hide, toggle: _toggle,
    isOpen: function() { return _isOpen; },
    applyPreset: _applyPreset,
    removePreset: _removePreset,
    PRESETS: PRESETS
  };
})();

// Modular skeleton hook (Faz 8) — ve-audio-fx-presets is now a video loader module (modules/video/). Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-audio-fx-presets', parent: 'video', title: 've-audio-fx-presets', mount: function () {}, unmount: function () {} });
