// ═══════════════════════════════════════════════════════════════════
//  VE-SUBTITLE-STYLES - Static style presets for the subtitle element
//  dika studio Video Editor - MirexSoft
//  Renders the "Stiller" tab (Phase 4): a grid of None + 9 CapCut-adapted
//  presets. Clicking applies track.styleId via VESubtitleElement.applyStyle
//  and re-renders. The renderer (renderTrack) reads styleId to draw box /
//  outline / shadow. Preview tiles approximate each style with CSS.
// ═══════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  /* CSS preview per style key: an approximation of the canvas render, so the tile shows the thing it
     applies. A key with no entry falls back to plain white rather than rendering nothing. */
  var PREVIEW = {
    none:        'color:#fff;',
    boxdark:     'color:#fff;background:rgba(0,0,0,0.82);',
    boxwhite:    'color:#111;background:#fff;',
    outline:     'color:#fff;-webkit-text-stroke:1px #000;',
    outlinebold: 'color:#fff;-webkit-text-stroke:2px #000;font-weight:800;',
    accent:      'color:#f2ff58;text-shadow:0 1px 3px rgba(0,0,0,0.8);',
    highlight:   'color:#111;background:#f2ff58;',
    blue:        'color:#3b82f6;-webkit-text-stroke:0.5px #0b2a5b;',
    glow:        'color:#fff;background:rgba(0,0,0,0.7);-webkit-text-stroke:0.5px #f2ff58;',
    shadow:      'color:#fff;text-shadow:0 2px 6px rgba(0,0,0,0.9);',
    pill:        'color:#16161b;background:#f2ff58;border-radius:999px;padding:3px 11px;',
    boxoutline:  'color:#fff;background:rgba(0,0,0,0.32);box-shadow:inset 0 0 0 1px #fff;',
    banner:      'color:#fff;background:rgba(0,0,0,0.78);border-radius:1px;padding:4px 14px;',
    paper:       'color:#16161b;background:#f4f4f0;border-radius:1px;',
    neon:        'color:#fff;-webkit-text-stroke:0.5px #f2ff58;text-shadow:0 0 7px #f2ff58,0 0 14px rgba(242,255,88,0.6);',
    hardshadow:  'color:#fff;text-shadow:2px 2px 0 #000;',
    retro:       'color:#fff;text-shadow:2px 2px 0 #f2ff58;-webkit-text-stroke:0.4px #16161b;',
    underline:   'color:#fff;box-shadow:0 3px 0 -1px #f2ff58;text-shadow:0 1px 3px rgba(0,0,0,0.8);',
    mint:        'color:#5ef2c0;-webkit-text-stroke:0.6px #06382b;',
    pop:         'color:#fff;background:#ff3d7f;border-radius:999px;padding:3px 11px;'
  };

  function renderPanel(body, track, rerender) {
    if (!body) return;
    var El = window.VESubtitleElement;
    // The GROUPS are the source of order (VESubtitleElement.STYLE_GROUPS); STYLE_ORDER is derived from
    // them, so a new style is one entry in one place and both surfaces pick it up.
    var groups = (El && El.STYLE_GROUPS) || [{ label: '', keys: (El && El.STYLE_ORDER) || ['none'] }];
    var cur = track.styleId || 'none';
    var html = '';
    for (var g = 0; g < groups.length; g++) {
      html += '<div class="ve-sp-lbl' + (g ? ' ve-sp-lbl--gap' : '') + '">' + groups[g].label + '</div><div class="ve-sub-style-grid">';
      var keys = groups[g].keys;
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var active = (key === cur) ? ' active' : '';
        var prev = PREVIEW[key] || 'color:#fff;';
        // The `class` attribute used to be CLOSED before `active` was appended
        // (`class="ve-sub-style-tile"' + active + '"`), so the selected tile never got its ring and a
        // stray bare attribute was emitted instead. Nothing warns about that: the markup still parses.
        html += '<button class="ve-sub-style-tile' + active + '" data-style="' + key + '" title="' + key + '">' +
          '<span class="ve-sub-style-prev" style="' + prev + '">' + (key === 'none' ? 'Aa' : 'Text') + '</span>' +
          '</button>';
      }
      html += '</div>';
    }
    body.innerHTML = html;

    var tiles = body.querySelectorAll('.ve-sub-style-tile');
    for (var t = 0; t < tiles.length; t++) {
      tiles[t].onclick = (function(styleKey) {
        return function() {
          if (window.VESubtitleElement && VESubtitleElement.applyStyle) VESubtitleElement.applyStyle(track, styleKey);
          if (rerender) rerender();
          // re-render this panel to move the active ring + reflect the new text color
          renderPanel(body, track, rerender);
        };
      })(tiles[t].getAttribute('data-style'));
    }
  }

  window.VESubtitleStyles = { renderPanel: renderPanel, PREVIEW: PREVIEW };
})();

// Modular skeleton hook - ve-subtitle-styles is a video loader module. Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-subtitle-styles', parent: 'video', title: 've-subtitle-styles', mount: function () {}, unmount: function () {} });
