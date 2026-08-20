/* Module: left-panel/tools — the Tools rail-tab hub.
   The Tools panel is a HUB, not a monolithic blob: its flyout HTML lives in index.html
   and its behaviour is provided by already-separate, self-isolating files loaded as
   <script> (selection-tools.js, brush-tool.js, brush-eraser.js, pen-tools.js,
   fill-bucket.js, crop-tool.js, barcode-tools.js, perspective-mockup.js) plus the
   gallery module's openToolGenerator. This module owns the QR Studio wizard sub-module
   (tools/qr) and registers the panel with the cc.* skeleton for registry completeness +
   error-boundary. No load-time work — openFlyout('tools') just toggles the declarative
   flyout section; the tool files self-wire lazily on activation. */
(function () {
  'use strict';
  if (window.cc && cc.modules) {
    cc.modules.register({
      id: 'tools', parent: 'left-panel',
      parent: 'left-panel',
      title: 'Tools',
      icon: 'wrench',
      mount: function () {},
      unmount: function () {},
    });
  }
})();
