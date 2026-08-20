/* Module group: gallery/browser — the media-library BROWSE & ORGANIZE UI (the gallery panel itself):
   the panel shell (media-type tabs/search), folder UI, the media grid, and multi-select. These are
   sub-modules of the gallery group: the DATA lives in gallery/storage, media ENTERS via gallery/upload
   + gallery/stock, and goes to the canvas via gallery/canvas. This thin group parent just registers
   under left-panel.gallery; each browser child self-registers under left-panel.gallery.browser. */
(function () {
  'use strict';
  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'browser', parent: 'left-panel.gallery', title: 'Gallery: browser', mount: function () {}, unmount: function () {} });
  }
})();
