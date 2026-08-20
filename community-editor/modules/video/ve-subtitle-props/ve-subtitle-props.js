// ═══════════════════════════════════════════════════════════════════
//  VE-SUBTITLE-PROPS - compatibility shim (2026-08-12)
//  dika studio Video Editor - MirexSoft
//
//  This module used to render its OWN two-tab block (Style / Animation) pinned
//  above the right Properties panel, while a media clip got a proper docked,
//  tabbed inspector. A subtitle is a timeline item like any other, so its Style
//  and Animation are now two TABS of that one shell, rendered by
//  `ve-item-props` from the SAME catalogue modules this file called
//  (VESubtitleStyles / VESubtitleAnim). Nothing was reimplemented and nothing
//  was lost; the panel moved.
//
//  The file stays because four call sites in ve-subtitle-element.js and
//  right-panel.js address it by name, and because a second Style/Animation
//  block being BUILT (even hidden behind the dock) would put a duplicate set of
//  controls in the document for getElementById to find first.
// ═══════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  // Remove the legacy pinned block if an older session left one in the DOM.
  function hide() {
    var p = document.getElementById('ve-sub-props');
    if (p && p.parentNode) p.parentNode.removeChild(p);
  }

  window.VESubtitleProps = {
    // The docked panel renders Style + Animation itself, off the selection that
    // is about to be made; there is nothing to do here and rendering a second
    // copy is the whole thing this shim prevents.
    syncStyleAnim: function() { hide(); },
    hide: hide,
    refresh: function() { if (window.VEItemProps && VEItemProps.refresh) VEItemProps.refresh(); }
  };
})();

// Modular skeleton hook - ve-subtitle-props is a video loader module. Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-subtitle-props', parent: 'video', title: 've-subtitle-props', mount: function () {}, unmount: function () {} });
