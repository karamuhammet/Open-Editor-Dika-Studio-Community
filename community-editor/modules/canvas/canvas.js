/* Module group: canvas — canvas ENGINES (Faz 6, §2B.1). Not a feature panel and not a shared
   utility: these are the canvas-level engines many features build on (element creation, view/
   zoom-pan, …). The group parent registers itself with the cc.* skeleton; each engine child
   self-inits on the sticky cc:canvas-ready lifecycle event and registers under this group. */
(function () {
  'use strict';
  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'canvas', title: 'Canvas engines', icon: 'frame', mount: function () {}, unmount: function () {} });
  }
})();
