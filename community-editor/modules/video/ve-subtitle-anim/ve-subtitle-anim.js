// ═══════════════════════════════════════════════════════════════════
//  VE-SUBTITLE-ANIM - Animation presets for the subtitle element (Phase 7)
//  dika studio Video Editor - MirexSoft
//  Renders the "Animasyon" tab: None + 3 presets (Karaoke word-highlight,
//  Word-by-word pop-in, Typewriter). Clicking sets track.animationId; the
//  renderer (_renderAnimated) draws it. Karaoke/pop-in use per-word timing:
//  cue.words when present, else an even distribution. Selecting karaoke
//  requests a word-timestamp pass when the Whisper backend is reachable
//  (best-effort; the even distribution is the fallback).
// ═══════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  /* `group` decides which heading a preset sits under and mirrors the renderer's own two families
     (VESubtitleElement.BLOCK_ANIMS / WORD_ANIMS): an ENTRANCE moves the whole cue, a WORD preset is
     driven by per-word timing. Adding a preset is one row here plus one entry in the renderer's map. */
  var ANIMS = [
    { id: 'none',        label: 'None',       icon: 'ban',            group: 'basic', needsWords: false },
    { id: 'typewriter',  label: 'Typewriter', icon: 'type',           group: 'basic', needsWords: false },

    { id: 'fade',        label: 'Fade',       icon: 'sun',            group: 'in',    needsWords: false },
    { id: 'slideup',     label: 'Slide up',   icon: 'arrow-up',       group: 'in',    needsWords: false },
    { id: 'slidedown',   label: 'Slide down', icon: 'arrow-down',     group: 'in',    needsWords: false },
    { id: 'slidein',     label: 'Slide in',   icon: 'arrow-right',    group: 'in',    needsWords: false },
    { id: 'scalein',     label: 'Zoom',       icon: 'maximize-2',     group: 'in',    needsWords: false },
    { id: 'wipe',        label: 'Wipe',       icon: 'chevrons-right', group: 'in',    needsWords: false },

    { id: 'karaoke',     label: 'Karaoke',    icon: 'mic',            group: 'word',  needsWords: true },
    { id: 'karaokefill', label: 'Karaoke fill', icon: 'highlighter',  group: 'word',  needsWords: true },
    { id: 'popin',       label: 'Pop-in',     icon: 'sparkles',       group: 'word',  needsWords: true },
    { id: 'bounce',      label: 'Bounce',     icon: 'zap',            group: 'word',  needsWords: true },
    { id: 'wordfade',    label: 'Word fade',  icon: 'droplet',        group: 'word',  needsWords: true }
  ];
  var GROUPS = [
    { key: 'basic', label: 'Basic' },
    { key: 'in',    label: 'Entrance' },
    { key: 'word',  label: 'Word by word' }
  ];

  function _icon(name, size) {
    if (window.__ccVideoEditor && window.__ccVideoEditor._veIcon) return window.__ccVideoEditor._veIcon(name, size || 16);
    if (typeof getIcon === 'function') { var r = getIcon(name, size || 16); if (r) return r; }
    return '';
  }

  // Best-effort word-timestamp pass. Only meaningful when the Whisper backend is
  // reachable (panel mode). Without it, the even-distribution fallback in
  // VESubtitleElement.getCueWords keeps the animation working.
  function _requestWordTimings(track) {
    // Deferred hook: a future word-level Whisper pass populates cue.words.
    // No-op today when the backend is not reachable; animations use the
    // even-distribution fallback so nothing is a ghost.
    if (window.VEAutoSubtitle && VEAutoSubtitle.requestWordTimings) {
      try { VEAutoSubtitle.requestWordTimings(track); } catch (e) {}
    }
  }

  function renderPanel(body, track, rerender) {
    if (!body) return;
    var cur = track.animationId || 'none';
    var html = '';
    for (var g = 0; g < GROUPS.length; g++) {
      var rows = ANIMS.filter(function(a) { return a.group === GROUPS[g].key; });
      if (!rows.length) continue;
      html += '<div class="ve-sp-lbl' + (g ? ' ve-sp-lbl--gap' : '') + '">' + GROUPS[g].label + '</div><div class="ve-sub-anim-grid">';
      for (var i = 0; i < rows.length; i++) {
        var a = rows[i];
        html += '<button class="ve-sub-anim-tile' + (a.id === cur ? ' active' : '') + '" data-anim="' + a.id + '">' +
          '<span class="ve-sub-anim-ico">' + _icon(a.icon, 18) + '</span>' +
          '<span class="ve-sub-anim-name">' + a.label + '</span>' +
          '</button>';
      }
      html += '</div>';
    }
    html += '<p class="ve-sub-anim-note">Entrance presets animate the whole subtitle in and out. Word-by-word presets follow per-word timing; when a cue has none, the duration is split evenly.</p>';
    body.innerHTML = html;

    var tiles = body.querySelectorAll('.ve-sub-anim-tile');
    for (var t = 0; t < tiles.length; t++) {
      tiles[t].onclick = (function(id) {
        return function() {
          track.animationId = id;
          var meta = ANIMS.filter(function(x) { return x.id === id; })[0];
          if (meta && meta.needsWords) _requestWordTimings(track);
          // Parity with the Style tab: picking an animation is an undoable edit.
          var VE = window.__ccVideoEditor;
          if (VE && VE._vePushUndo) VE._vePushUndo();
          if (rerender) rerender();
          renderPanel(body, track, rerender);
        };
      })(tiles[t].getAttribute('data-anim'));
    }
  }

  window.VESubtitleAnim = { renderPanel: renderPanel, ANIMS: ANIMS };
})();

// Modular skeleton hook - ve-subtitle-anim is a video loader module. Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-subtitle-anim', parent: 'video', title: 've-subtitle-anim', mount: function () {}, unmount: function () {} });
