/* Module group: video — the CapCut-style video editor subsystem (Faz 8). video-editor (orchestrator)
   + video-canvas + 35 ve-* engines (audio, keyframes, transitions, effects, media, export, …).
   34/37 are define-only at load (they attach VE* namespaces to window); video-editor._veInit
   orchestrates VEX.init() at RUNTIME when the editor opens — so load ORDER is irrelevant (the
   alphabetical child order build-manifest produces is fine). Top-level group; each engine
   self-registers under 'video' for fault isolation. */
(function () {
  'use strict';
  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'video', title: 'Video editor', icon: 'video', mount: function () {}, unmount: function () {} });
  }
})();
