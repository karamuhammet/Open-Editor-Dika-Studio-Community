/* ═══════════════════════════════════════════════════════════════
   VE Effects Library — Categorized effects browser panel
   Faz 3 — Drag-drop effects onto clips, search, badges
   ═══════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  var _panel = null;
  var _isOpen = false;
  var _activeCategory = 'all';
  var _searchQuery = '';

  var EFFECTS = [
    // Color
    { id: 'lut',            label: 'LUT',             cat: 'color',   icon: 'layers',    desc: '3D lookup table' },
    { id: 'sepia',          label: 'Sepia',           cat: 'color',   icon: 'sun',       desc: 'Warm vintage tone' },
    { id: 'bw',             label: 'Black & White',   cat: 'color',   icon: 'contrast',  desc: 'Desaturate' },
    { id: 'invert',         label: 'Invert Colors',   cat: 'color',   icon: 'refresh-cw',desc: 'Negative image' },

    // Blur & Sharpen
    { id: 'blur',           label: 'Gaussian Blur',   cat: 'blur',    icon: 'droplet',   desc: 'Soft blur' },
    { id: 'motion-blur',    label: 'Motion Blur',     cat: 'blur',    icon: 'wind',      desc: 'Directional blur' },
    { id: 'sharpen',        label: 'Sharpen',         cat: 'blur',    icon: 'zap',       desc: 'Edge enhance' },

    // Distortion
    { id: 'glitch-fx',      label: 'Glitch',          cat: 'distort', icon: 'zap-off',   desc: 'Digital artifact' },
    { id: 'pixelate-fx',    label: 'Pixelate',        cat: 'distort', icon: 'grid',      desc: 'Block mosaic' },

    // AI
    // ALPHA / HIDDEN (owner 2026-07-18): bg-removal + face-track are demo quality (see the module
    // headers in ve-bg-removal.js / motion-tracking.js). Cards removed from the catalog until their
    // WebGPU / Tasks Vision rebuilds; re-add the two entries below to resurface.
    // { id: 'bg-removal',  label: 'BG Removal',      cat: 'ai',      icon: 'scissors',  desc: 'AI background remove' },
    { id: 'denoise',        label: 'Audio Denoise',   cat: 'ai',      icon: 'mic-off',   desc: 'RNNoise noise gate' },
    { id: 'auto-subtitle',  label: 'Auto Subtitles',  cat: 'ai',      icon: 'type',      desc: 'Whisper transcription' },
    // { id: 'face-track',  label: 'Face Tracker',    cat: 'ai',      icon: 'user',      desc: 'MediaPipe face mesh' },

    // Keying
    { id: 'chroma-key',     label: 'Chroma Key',      cat: 'keying',  icon: 'droplet',   desc: 'Green screen removal' },
    { id: 'mask',           label: 'Mask',            cat: 'keying',  icon: 'crop',      desc: 'Alpha mask shape' },

    // Audio
    { id: 'reverb',         label: 'Reverb',          cat: 'audio',   icon: 'volume-2',  desc: 'Room/hall/cathedral' },
    { id: 'compressor',     label: 'Compressor',      cat: 'audio',   icon: 'minimize-2',desc: 'Dynamic compression' },
    { id: 'eq',             label: 'Equalizer',       cat: 'audio',   icon: 'sliders',   desc: '8-band parametric' },
    { id: 'ducking',        label: 'Auto Duck',       cat: 'audio',   icon: 'volume-1',  desc: 'Sidechain compression' },
    { id: 'deesser',        label: 'De-Esser',        cat: 'audio',   icon: 'mic',       desc: 'Sibilance reduction' }
  ];

  var CATEGORIES = [
    { id: 'all',     label: 'All',           icon: 'grid' },
    { id: 'color',   label: 'Color',         icon: 'palette' },
    { id: 'blur',    label: 'Blur/Sharpen',  icon: 'droplet' },
    { id: 'distort', label: 'Distortion',    icon: 'zap' },
    { id: 'ai',      label: 'AI',            icon: 'cpu' },
    { id: 'keying',  label: 'Keying',        icon: 'scissors' },
    { id: 'audio',   label: 'Audio',         icon: 'headphones' }
  ];

  function _icon(name, sz) {
    if (typeof getIcon === 'function') { var r = getIcon(name, sz || 14); if (r) return r; }
    return '';
  }

  function _buildPanel() {
    if (_panel) return _panel;
    _panel = document.createElement('div');
    _panel.className = 've-effects-lib';
    _panel.style.cssText = 'position:fixed;top:80px;left:60px;width:300px;max-height:540px;' +
      'background:var(--surface2,#1b1b1f);border:1px solid var(--border,#27272d);border-radius:10px;' +
      'box-shadow:0 8px 32px rgba(0,0,0,.55);z-index:10050;display:none;flex-direction:column;overflow:hidden;';

    // Header
    var html = '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--border,#27272d);">' +
      '<span style="color:var(--text,#ededf0);font-weight:600;font-size:13px;">' + _icon('layers', 16) + ' Effects Library</span>' +
      '<button id="ve-efx-close" style="background:none;border:none;color:var(--text-dim,#888);cursor:pointer;font-size:16px;">✕</button></div>';

    // Search
    html += '<div style="padding:6px 10px;border-bottom:1px solid var(--border,#27272d);">' +
      '<input id="ve-efx-search" placeholder="Search effects..." style="width:100%;padding:6px 10px;border-radius:6px;border:1px solid var(--border);' +
      'background:var(--surface3);color:var(--text);font-size:11px;outline:none;box-sizing:border-box;"></div>';

    // Category tabs
    html += '<div class="ve-efx-tabs" style="display:flex;gap:2px;padding:6px 8px;overflow-x:auto;border-bottom:1px solid var(--border,#27272d);">';
    CATEGORIES.forEach(function(c) {
      html += '<button class="ve-efx-tab" data-cat="' + c.id + '" ' +
        'style="padding:4px 8px;border-radius:6px;border:none;font-size:10px;cursor:pointer;white-space:nowrap;' +
        'background:' + (c.id === 'all' ? 'var(--gold,#f2ff58)' : 'var(--surface3,#232328)') + ';' +
        'color:' + (c.id === 'all' ? '#0b0b0d' : 'var(--text-dim,#888)') + ';">' + c.label + '</button>';
    });
    html += '</div>';

    // List
    html += '<div id="ve-efx-list" class="ve-panel-scroll" style="overflow-y:auto;flex:1;max-height:370px;padding:6px;"></div>';

    _panel.innerHTML = html;
    document.body.appendChild(_panel);

    // Events
    _panel.querySelector('#ve-efx-close').addEventListener('click', _hide);

    _panel.querySelector('#ve-efx-search').addEventListener('input', function() {
      _searchQuery = this.value.toLowerCase();
      _renderList();
    });

    _panel.addEventListener('click', function(e) {
      var tab = e.target.closest('.ve-efx-tab');
      if (tab) {
        _activeCategory = tab.dataset.cat;
        _panel.querySelectorAll('.ve-efx-tab').forEach(function(t) {
          var active = t.dataset.cat === _activeCategory;
          t.style.background = active ? 'var(--gold,#f2ff58)' : 'var(--surface3,#232328)';
          t.style.color = active ? '#0b0b0d' : 'var(--text-dim,#888)';
        });
        _renderList();
      }
    });

    _renderList();
    if (window.VEPanelHelpers) VEPanelHelpers.decorate(_panel);
    return _panel;
  }

  // ── Check if an effect is active on a clip ──
  var FILTER_EFFECTS = { 'sepia': 'sepia', 'bw': 'saturation', 'invert': 'invert', 'blur': 'blur' };
  var PIXEL_EFFECTS = ['sharpen', 'pixelate-fx', 'glitch-fx', 'motion-blur'];
  var SUBSYSTEM_MAP = {
    'chroma-key': 'chromaKey',
    'bg-removal': 'bgRemoval', 'denoise': 'denoise'
  };

  function _isEffectActive(clip, effectId) {
    if (!clip) return false;
    // CSS filter effects
    if (effectId === 'sepia') return clip.filters && clip.filters.sepia > 0;
    if (effectId === 'bw') return clip.filters && clip.filters.saturation === 0;
    if (effectId === 'invert') return clip.filters && clip.filters.invert > 0;
    if (effectId === 'blur') return clip.filters && clip.filters.blur > 0;
    // Pixel effects + complex effects in clip.effects[]
    if (clip.effects && clip.effects.length) {
      for (var i = 0; i < clip.effects.length; i++) {
        if (clip.effects[i].id === effectId && clip.effects[i].enabled) return true;
      }
    }
    // Subsystem flags
    var sub = SUBSYSTEM_MAP[effectId];
    if (sub && clip[sub] && clip[sub].enabled) return true;
    return false;
  }

  function _getTargetClip() {
    if (!window.VideoEditor) return null;
    var clipIds = VideoEditor.getSelectedClips ? VideoEditor.getSelectedClips() : [];
    if (clipIds && clipIds.length > 0) {
      return VideoEditor.findClipById ? VideoEditor.findClipById(clipIds[0]) : null;
    }
    // Fallback: bg clip or first video/image
    var proj = VideoEditor.getProject ? VideoEditor.getProject() : null;
    if (!proj || !proj.tracks) return null;
    var fallbackId = proj._bgClipId || null;
    if (!fallbackId) {
      for (var t = 0; t < proj.tracks.length && !fallbackId; t++) {
        for (var ci = 0; ci < proj.tracks[t].clips.length && !fallbackId; ci++) {
          var cl = proj.tracks[t].clips[ci];
          if (cl.type === 'video' || cl.type === 'image') fallbackId = cl.id;
        }
      }
    }
    return fallbackId && VideoEditor.findClipById ? VideoEditor.findClipById(fallbackId) : null;
  }

  function _getTargetClipIds() {
    if (!window.VideoEditor) return [];
    var clipIds = VideoEditor.getSelectedClips ? VideoEditor.getSelectedClips() : [];
    if (clipIds && clipIds.length > 0) return clipIds;
    var proj = VideoEditor.getProject ? VideoEditor.getProject() : null;
    if (!proj || !proj.tracks) return [];
    var fallbackId = proj._bgClipId || null;
    if (!fallbackId) {
      for (var t = 0; t < proj.tracks.length && !fallbackId; t++) {
        for (var ci = 0; ci < proj.tracks[t].clips.length && !fallbackId; ci++) {
          var cl = proj.tracks[t].clips[ci];
          if (cl.type === 'video' || cl.type === 'image') fallbackId = cl.id;
        }
      }
    }
    return fallbackId ? [fallbackId] : [];
  }

  function _renderList() {
    if (!_panel) return; // effects can be applied from other panels (e.g. the clip inspector) while this library panel is closed
    var container = _panel.querySelector('#ve-efx-list');
    if (!container) return;
    container.innerHTML = '';

    var targetClip = _getTargetClip();

    var filtered = EFFECTS.filter(function(fx) {
      if (_activeCategory !== 'all' && fx.cat !== _activeCategory) return false;
      if (_searchQuery && fx.label.toLowerCase().indexOf(_searchQuery) < 0 && fx.desc.toLowerCase().indexOf(_searchQuery) < 0) return false;
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = '<div style="text-align:center;color:var(--text-dim);padding:30px;font-size:12px;">No effects found</div>';
      return;
    }

    filtered.forEach(function(fx) {
      var isActive = _isEffectActive(targetClip, fx.id);
      var row = document.createElement('div');
      row.className = 've-efx-item';
      row.draggable = true;
      row.dataset.effectId = fx.id;
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;' +
        'cursor:pointer;transition:background .12s,border-color .12s;margin-bottom:2px;' +
        'border:1.5px solid ' + (isActive ? 'var(--gold,#f2ff58)' : 'transparent') + ';' +
        'background:' + (isActive ? 'rgba(242, 255, 88,0.08)' : 'transparent') + ';';

      var badgeHtml = isActive
        ? '<div style="flex-shrink:0;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:600;' +
          'background:var(--gold,#f2ff58);color:#0b0b0d;">ON</div>'
        : '<div style="flex-shrink:0;font-size:9px;color:var(--text-dim);text-transform:uppercase;opacity:.5;">' + fx.cat + '</div>';

      row.innerHTML = '<div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;' +
        'border-radius:8px;background:' + (isActive ? 'rgba(242, 255, 88,0.15)' : 'var(--surface3,#232328)') + ';flex-shrink:0;">' + _icon(fx.icon, 16) + '</div>' +
        '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:11px;color:var(--text,#ededf0);font-weight:500;">' + fx.label + '</div>' +
        '<div style="font-size:9px;color:var(--text-dim,#888);">' + fx.desc + '</div></div>' +
        badgeHtml;

      row.addEventListener('mouseenter', function() {
        if (!isActive) row.style.background = 'var(--surface3,#232328)';
      });
      row.addEventListener('mouseleave', function() {
        row.style.background = isActive ? 'rgba(242, 255, 88,0.08)' : 'transparent';
      });

      // Single-click → toggle (apply or remove)
      row.addEventListener('click', function(e) {
        if (e.target.closest('.ve-efx-tab') || e.target.closest('#ve-efx-search')) return;
        if (isActive) {
          _removeEffect(fx.id);
        } else {
          _applyEffect(fx.id);
        }
      });

      // Drag
      row.addEventListener('dragstart', function(e) {
        e.dataTransfer.setData('text/plain', 've-effect:' + fx.id);
        e.dataTransfer.effectAllowed = 'copy';
      });

      container.appendChild(row);
    });
  }

  // ── Remove effect from selected clips ──
  function _removeEffect(effectId) {
    var clipIds = _getTargetClipIds();
    if (!clipIds.length) return;
    var removed = false;

    clipIds.forEach(function(clipId) {
      var clip = VideoEditor.findClipById ? VideoEditor.findClipById(clipId) : null;
      if (!clip) return;

      // CSS filter effects → reset to default
      if (effectId === 'sepia' && VideoEditor.setFilter) {
        VideoEditor.setFilter(clipId, 'sepia', 0);
        removed = true;
      } else if (effectId === 'bw' && VideoEditor.setFilter) {
        VideoEditor.setFilter(clipId, 'saturation', 100); // restore full saturation
        removed = true;
      } else if (effectId === 'invert' && VideoEditor.setFilter) {
        VideoEditor.setFilter(clipId, 'invert', 0);
        removed = true;
      } else if (effectId === 'blur' && VideoEditor.setFilter) {
        VideoEditor.setFilter(clipId, 'blur', 0);
        removed = true;
      } else {
        // Remove from clip.effects[]
        if (clip.effects) {
          var before = clip.effects.length;
          clip.effects = clip.effects.filter(function(e) { return e.id !== effectId; });
          if (clip.effects.length < before) removed = true;
        }
        // Disable subsystem flags
        var sub = SUBSYSTEM_MAP[effectId];
        if (sub && clip[sub]) { clip[sub].enabled = false; removed = true; }
      }
    });

    if (removed) {
      if (VideoEditor.render) VideoEditor.render();
      if (VideoEditor.renderPreview) VideoEditor.renderPreview();
      if (typeof showToast === 'function') {
        var fx = null;
        for (var i = 0; i < EFFECTS.length; i++) { if (EFFECTS[i].id === effectId) { fx = EFFECTS[i]; break; } }
        showToast('Effect removed: ' + (fx ? fx.label : effectId), 'info');
      }
    }
    _renderList(); // refresh active states
  }

  // ── Apply effect to selected clips ──
  function _applyEffect(effectId) {
    var fx = null;
    for (var i = 0; i < EFFECTS.length; i++) {
      if (EFFECTS[i].id === effectId) { fx = EFFECTS[i]; break; }
    }
    if (!fx) return;

    var applied = false;
    if (window.VideoEditor) {
      var clipIds = _getTargetClipIds();
      if (!clipIds.length) {
        if (typeof showToast === 'function') showToast('Add a video or image first', 'warning');
        return;
      }
      clipIds.forEach(function(clipId) {
        var clip = VideoEditor.findClipById ? VideoEditor.findClipById(clipId) : null;
        if (!clip) return;
        applied = true;

        // Filter-type effects → use setFilter API (CSS filters)
        if (effectId === 'sepia' && VideoEditor.setFilter) {
          VideoEditor.setFilter(clipId, 'sepia', 100);
        } else if (effectId === 'bw' && VideoEditor.setFilter) {
          VideoEditor.setFilter(clipId, 'saturation', 0);
        } else if (effectId === 'invert' && VideoEditor.setFilter) {
          VideoEditor.setFilter(clipId, 'invert', 100);
        } else if (effectId === 'blur' && VideoEditor.setFilter) {
          VideoEditor.setFilter(clipId, 'blur', 5);
        } else if (effectId === 'sharpen' || effectId === 'pixelate-fx' || effectId === 'glitch-fx' || effectId === 'motion-blur') {
          // Pixel-level effects → stored in clip.effects[] for canvas processing
          if (!clip.effects) clip.effects = [];
          if (!clip.effects.some(function(e) { return e.id === effectId; })) {
            var params = {};
            if (effectId === 'sharpen') params = { amount: 50 };
            if (effectId === 'pixelate-fx') params = { size: 8 };
            if (effectId === 'glitch-fx') params = { intensity: 0.3 };
            if (effectId === 'motion-blur') params = { angle: 0, distance: 10 };
            clip.effects.push({ id: effectId, enabled: true, params: params });
          }
        } else {
          // Complex effects → store on clip object directly
          if (!clip.effects) clip.effects = [];
          if (!clip.effects.some(function(e) { return e.id === effectId; })) {
            clip.effects.push({ id: effectId, enabled: true, params: {} });
          }
          // Enable specific subsystem integrations
          if (effectId === 'chroma-key') { clip.chromaKey = clip.chromaKey || { enabled: true, color: '#00ff00', similarity: 0.4, smoothness: 0.1, spill: 0.1 }; clip.chromaKey.enabled = true; }
          if (effectId === 'bg-removal') { clip.bgRemoval = clip.bgRemoval || { enabled: true, method: 'mediapipe' }; clip.bgRemoval.enabled = true; }
          if (effectId === 'denoise') {
            clip.denoise = clip.denoise || { enabled: true, mix: 80 };
            clip.denoise.enabled = true;
            // Actually create the RNNoise node: flipping the flag alone never touched the engine
            // (mix is stored 0-100 like the inspector's slider, createForClip takes 0-1).
            if (window.VEDenoise && window.VEAudioEngine && VEAudioEngine.ensureContext) {
              var _dnAc = VEAudioEngine.ensureContext();
              if (_dnAc) VEDenoise.createForClip(clipId, _dnAc, { mix: (clip.denoise.mix || 100) / 100 });
            }
          }
          // Audio effects via VEAudioEngine
          if (fx.cat === 'audio' && window.VEAudioEngine) {
            if (effectId === 'reverb' && VEAudioEngine.setReverb) VEAudioEngine.setReverb(clipId, 'hall', 0.5);
            if (effectId === 'compressor' && VEAudioEngine.setCompressor) VEAudioEngine.setCompressor(clipId, { threshold: -18, ratio: 4, attack: 0.01, release: 0.1 });
            if (effectId === 'eq' && VEAudioEngine.setClipEQ) { VEAudioEngine.setClipEQ(clipId, 'low', 0); VEAudioEngine.setClipEQ(clipId, 'mid', 0); VEAudioEngine.setClipEQ(clipId, 'high', 0); }
          }
        }
      });
      if (VideoEditor.render) VideoEditor.render();
      if (VideoEditor.renderPreview) VideoEditor.renderPreview();
    }
    if (applied && typeof showToast === 'function') showToast('Effect applied: ' + fx.label);
    _renderList(); // refresh active states
  }

  function _show() { _buildPanel().style.display = 'flex'; _isOpen = true; }
  function _hide() { if (_panel) _panel.style.display = 'none'; _isOpen = false; }
  function _toggle() { _isOpen ? _hide() : _show(); }

  window.VEEffectsLibrary = {
    show: _show, hide: _hide, toggle: _toggle,
    isOpen: function() { return _isOpen; },
    applyEffect: _applyEffect,
    removeEffect: _removeEffect,
    isEffectActive: _isEffectActive,
    refreshList: _renderList,
    EFFECTS: EFFECTS
  };
})();

// Modular skeleton hook (Faz 8) — ve-effects-library is now a video loader module (modules/video/). Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-effects-library', parent: 'video', title: 've-effects-library', mount: function () {}, unmount: function () {} });
