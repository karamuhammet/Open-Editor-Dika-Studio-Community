/* Module group: system — app-level infrastructure & chrome (Faz 8). Keyboard (keyboard-manager +
   shortcuts), settings, tutorial/onboarding, comments. Not canvas, not a rail panel — the app's
   system layer. Top-level group; each module self-registers under 'system' and self-inits on the
   sticky cc:canvas-ready event. */
(function () {
  'use strict';
  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'system', title: 'System', icon: 'settings', mount: function () {}, unmount: function () {} });
  }
})();
