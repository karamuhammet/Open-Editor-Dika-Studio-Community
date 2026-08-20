// ╔═══════════════════════════════════════════════════════════════╗
// ║  VE-TEXT-ANIMATION — Text Animation Presets & Motion Graphics║
// ║  Phase 8: Preset animations, motion templates                ║
// ╚═══════════════════════════════════════════════════════════════╝
(function() {
  'use strict';

  // ── Animation Presets ──
  // Each preset is a function(clip, options) that generates keyframes
  // options = { duration, delay, easing }
  var PRESETS = {
    fadeIn: function(clip, opts) {
      var d = opts.delay || 0;
      var dur = opts.duration || 0.5;
      var e = opts.easing || 'easeOut';
      _kf().addKeyframe(clip, 'opacity', d, 0, e);
      _kf().addKeyframe(clip, 'opacity', d + dur, 1, e);
    },
    fadeOut: function(clip, opts) {
      var d = opts.delay || 0;
      var dur = opts.duration || 0.5;
      var clipDur = clip.duration || 3;
      var e = opts.easing || 'easeIn';
      _kf().addKeyframe(clip, 'opacity', clipDur - dur - d, 1, e);
      _kf().addKeyframe(clip, 'opacity', clipDur - d, 0, e);
    },
    slideUp: function(clip, opts) {
      var d = opts.delay || 0;
      var dur = opts.duration || 0.6;
      var e = opts.easing || 'easeOut';
      _kf().addKeyframe(clip, 'y', d, 400, e);
      _kf().addKeyframe(clip, 'y', d + dur, 200, e);
      _kf().addKeyframe(clip, 'opacity', d, 0, e);
      _kf().addKeyframe(clip, 'opacity', d + dur, 1, e);
    },
    slideDown: function(clip, opts) {
      var d = opts.delay || 0;
      var dur = opts.duration || 0.6;
      var e = opts.easing || 'easeOut';
      _kf().addKeyframe(clip, 'y', d, 0, e);
      _kf().addKeyframe(clip, 'y', d + dur, 200, e);
      _kf().addKeyframe(clip, 'opacity', d, 0, e);
      _kf().addKeyframe(clip, 'opacity', d + dur, 1, e);
    },
    scaleIn: function(clip, opts) {
      var d = opts.delay || 0;
      var dur = opts.duration || 0.5;
      var e = opts.easing || 'easeOutCubic';
      _kf().addKeyframe(clip, 'scaleX', d, 0.01, e);
      _kf().addKeyframe(clip, 'scaleX', d + dur, 1, e);
      _kf().addKeyframe(clip, 'scaleY', d, 0.01, e);
      _kf().addKeyframe(clip, 'scaleY', d + dur, 1, e);
      _kf().addKeyframe(clip, 'opacity', d, 0, e);
      _kf().addKeyframe(clip, 'opacity', d + dur, 1, e);
    },
    bounceIn: function(clip, opts) {
      var d = opts.delay || 0;
      var dur = opts.duration || 0.8;
      var e = 'easeOut';
      _kf().addKeyframe(clip, 'scaleX', d, 0.3, e);
      _kf().addKeyframe(clip, 'scaleX', d + dur * 0.4, 1.1, e);
      _kf().addKeyframe(clip, 'scaleX', d + dur * 0.7, 0.95, e);
      _kf().addKeyframe(clip, 'scaleX', d + dur, 1, e);
      _kf().addKeyframe(clip, 'scaleY', d, 0.3, e);
      _kf().addKeyframe(clip, 'scaleY', d + dur * 0.4, 1.1, e);
      _kf().addKeyframe(clip, 'scaleY', d + dur * 0.7, 0.95, e);
      _kf().addKeyframe(clip, 'scaleY', d + dur, 1, e);
      _kf().addKeyframe(clip, 'opacity', d, 0, e);
      _kf().addKeyframe(clip, 'opacity', d + dur * 0.3, 1, e);
    },
    rotateIn: function(clip, opts) {
      var d = opts.delay || 0;
      var dur = opts.duration || 0.6;
      var e = opts.easing || 'easeOut';
      _kf().addKeyframe(clip, 'rotation', d, -90, e);
      _kf().addKeyframe(clip, 'rotation', d + dur, 0, e);
      _kf().addKeyframe(clip, 'opacity', d, 0, e);
      _kf().addKeyframe(clip, 'opacity', d + dur, 1, e);
    },
    blurIn: function(clip, opts) {
      var d = opts.delay || 0;
      var dur = opts.duration || 0.5;
      var e = opts.easing || 'easeOut';
      _kf().addKeyframe(clip, 'opacity', d, 0, e);
      _kf().addKeyframe(clip, 'opacity', d + dur, 1, e);
      _kf().addKeyframe(clip, 'scaleX', d, 1.3, e);
      _kf().addKeyframe(clip, 'scaleX', d + dur, 1, e);
      _kf().addKeyframe(clip, 'scaleY', d, 1.3, e);
      _kf().addKeyframe(clip, 'scaleY', d + dur, 1, e);
    },
    typewriter: function(clip, opts) {
      // Typewriter effect via opacity stepping + clip width reveal
      var d = opts.delay || 0;
      var dur = opts.duration || 1.5;
      var e = 'linear';
      _kf().addKeyframe(clip, 'opacity', d, 1, e);
      _kf().addKeyframe(clip, 'scaleX', d, 0.01, e);
      _kf().addKeyframe(clip, 'scaleX', d + dur, 1, e);
    }
  };

  // ── Motion Templates ──
  // Each template returns overlay creation instructions
  var TEMPLATES = {
    'lower-third': {
      label: 'Lower Third',
      description: 'Name + title bar at bottom',
      create: function(w, h) {
        return {
          objects: [
            { type: 'rect', left: 0, top: h * 0.78, width: w * 0.45, height: 4, fill: '#f2ff58' },
            { type: 'text', text: 'Name Here', left: 20, top: h * 0.8, fontSize: 22, fill: '#ffffff', fontWeight: 'bold' },
            { type: 'text', text: 'Title / Role', left: 20, top: h * 0.8 + 28, fontSize: 16, fill: '#cccccc' }
          ],
          animation: 'slideUp',
          duration: 4
        };
      }
    },
    'title-card': {
      label: 'Title Card',
      description: 'Centered title with subtitle',
      create: function(w, h) {
        return {
          objects: [
            { type: 'text', text: 'TITLE', left: w / 2, top: h * 0.4, fontSize: 48, fill: '#ffffff', fontWeight: 'bold', textAlign: 'center', originX: 'center' },
            { type: 'text', text: 'Subtitle goes here', left: w / 2, top: h * 0.4 + 60, fontSize: 20, fill: '#aaaaaa', textAlign: 'center', originX: 'center' }
          ],
          animation: 'fadeIn',
          duration: 5
        };
      }
    },
    'end-screen': {
      label: 'End Screen',
      description: 'Subscribe / follow CTA',
      create: function(w, h) {
        return {
          objects: [
            { type: 'text', text: 'Thanks for Watching!', left: w / 2, top: h * 0.35, fontSize: 36, fill: '#ffffff', fontWeight: 'bold', textAlign: 'center', originX: 'center' },
            { type: 'rect', left: w / 2 - 80, top: h * 0.55, width: 160, height: 40, rx: 8, fill: '#f2ff58' },
            { type: 'text', text: 'SUBSCRIBE', left: w / 2, top: h * 0.55 + 10, fontSize: 16, fill: '#0b0b0d', fontWeight: 'bold', textAlign: 'center', originX: 'center' }
          ],
          animation: 'scaleIn',
          duration: 6
        };
      }
    }
  };

  /**
   * Apply an animation preset to a clip.
   */
  function applyPreset(clip, presetName, options) {
    if (!PRESETS[presetName]) return;
    PRESETS[presetName](clip, options || {});
  }

  /**
   * Clear all keyframes from a clip.
   */
  function clearAnimation(clip) {
    clip.keyframes = {};
  }

  /**
   * Get list of available presets.
   */
  function getPresetNames() {
    return Object.keys(PRESETS);
  }

  /**
   * Get list of available templates.
   */
  function getTemplates() {
    var list = [];
    for (var key in TEMPLATES) {
      list.push({ id: key, label: TEMPLATES[key].label, description: TEMPLATES[key].description });
    }
    return list;
  }

  /**
   * Create a motion template.
   */
  function createTemplate(templateId, w, h) {
    var tpl = TEMPLATES[templateId];
    if (!tpl) return null;
    return tpl.create(w, h);
  }

  function _kf() { return window.VEKeyframes; }

  // Public API
  window.VETextAnimation = {
    PRESETS: PRESETS,
    TEMPLATES: TEMPLATES,
    applyPreset: applyPreset,
    clearAnimation: clearAnimation,
    getPresetNames: getPresetNames,
    getTemplates: getTemplates,
    createTemplate: createTemplate
  };
})();

// Modular skeleton hook (Faz 8) — ve-text-animation is now a video loader module (modules/video/). Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-text-animation', parent: 'video', title: 've-text-animation', mount: function () {}, unmount: function () {} });
