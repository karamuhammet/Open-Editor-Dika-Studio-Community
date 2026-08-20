/* Module group: canvas/tools — the canvas TOOLS sub-group (Faz 8, §2B.1). Drawing / selection /
   overlay tools (selection, pen, brush, eraser, fill, crop, perspective, polygon, smart-guides,
   alt-distance, grid-ruler, bleed-guides, …) live here as individual loader modules so one broken
   tool can't take the others — or the canvas engines — down. The sub-group parent just registers
   itself under 'canvas'; each tool self-registers under 'tools' and (if it needs setup) self-inits
   on the sticky cc:canvas-ready lifecycle event. */
(function () {
  'use strict';
  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'tools', parent: 'canvas', title: 'Canvas tools', icon: 'wrench', mount: function () {}, unmount: function () {} });
  }
})();
