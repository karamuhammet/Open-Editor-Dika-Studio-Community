/* ═══════════════════════════════════════════════════════════
   Module: left-panel/text — the Text panel.
   Hosts isolated sub-modules (styles, pairings, effects, dynamic,
   quickadd), each in its own folder with its own JS/CSS. The panel's
   HTML scaffold lives in index.html (its contact/social drill-ins are
   wired by app.js), so each sub-module just wires + renders its slice.
   A broken sub-module stays isolated; the other tabs keep working.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (!window.cc || !cc.modules) { console.warn('[text] cc skeleton missing'); return; }

  function mountSubs() {
    cc.modules.children('left-panel.text').forEach(function (c) { cc.modules.mount(c.fullId); });
  }

  // app.js openFlyout('text') calls this; (re)mount sub-modules + refresh the gallery on open.
  window.initTextPanel = function () {
    mountSubs();
    if (typeof window.renderTextStyleGallery === 'function') window.renderTextStyleGallery();
  };

  cc.modules.register({
    id: 'text', parent: 'left-panel',
    parent: 'left-panel',
    title: 'Text',
    icon: 'type',
    mount: mountSubs,
    unmount: function () {}
  });

  if (cc.on) cc.on('modules:ready', mountSubs);
})();
