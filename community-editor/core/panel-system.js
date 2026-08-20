/* ============================================================
   dika studio core — panel system (left rail + flyout).
   FAZ 0: PASSIVE. It only RECORDS panel modules that register;
   the existing app.js rail/flyout (openFlyout/closeFlyout) still
   drives the UI, so nothing changes yet. A later phase makes this
   the single source of truth for the rail/flyout and retires the
   hardcoded `if (tab === '…')` chains in app.js.
   ============================================================ */
(function (global) {
  'use strict';
  var cc = global.cc || (global.cc = {});
  var _panels = {};

  cc.panels = {
    register: function (def) {
      if (!def || !def.id) { console.warn('[cc.panels] register() needs an id'); return null; }
      _panels[def.id] = def;
      if (cc.emit) cc.emit('panel:registered', def);
      return def;
    },
    get: function (id) { return _panels[id] || null; },
    all: function () { return Object.keys(_panels).map(function (k) { return _panels[k]; }); }
  };

  global.cc = cc;
})(window);
