/* Module group: shared — cross-cutting modules reused across panels (Faz 6, §2B.1).
   Unlike left-panel/right-panel (feature groups), shared/ holds panel-AGNOSTIC modules that
   many areas call — e.g. color-picker (right-panel swatches, brush, gradient, fills). The
   group parent just registers itself with the cc.* skeleton; the children self-init + register
   under it. "Build once, use everywhere." */
(function () {
  'use strict';
  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'shared', title: 'Shared', icon: 'package', mount: function () {}, unmount: function () {} });
  }
})();
