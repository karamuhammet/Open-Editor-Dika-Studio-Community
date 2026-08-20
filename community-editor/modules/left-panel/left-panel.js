/* ═══════════════════════════════════════════════════════════
   Module: left-panel — the left rail/flyout AREA. Groups the panel
   feature modules (text, gallery, items, charts, …). For now the
   existing app.js rail/flyout still drives navigation; this node
   groups its children and mounts each through the registry's error
   boundary, so one broken feature stays isolated from the others.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (!window.cc || !cc.modules) { console.warn('[left-panel] cc skeleton missing'); return; }

  function mountChildren() {
    cc.modules.children('left-panel').forEach(function (c) { cc.modules.mount(c.fullId); });
  }

  cc.modules.register({
    id: 'left-panel',
    title: 'Left panel',
    icon: 'panel-left',
    mount: mountChildren,
    unmount: function () {}
  });

  // Once every module (and its children) has loaded, mount the feature modules.
  if (cc.on) cc.on('modules:ready', mountChildren);
})();
