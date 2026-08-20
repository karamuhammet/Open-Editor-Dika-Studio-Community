/* Module group: shared/fonts — the font subsystem (Faz 8). Custom font upload/management
   (font-manager, IndexedDB) + Google Fonts integration (google-fonts). Grouped so the whole
   font stack is one fault-isolated unit shared across the text features. The sub-group parent
   registers under 'shared'; each font module self-registers under 'fonts'. */
(function () {
  'use strict';
  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'fonts', parent: 'shared', title: 'Fonts', icon: 'type', mount: function () {}, unmount: function () {} });
  }
})();
