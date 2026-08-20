/* Module: system/settings/rail — RAIL VISIBILITY — show/hide left-rail items.
   Part of the settings group (decomposed from the 2763-line IIFE). Functions hang off the
   shared namespace SS (window.__ccSettings, created by the parent); cross-module refs resolve
   through SS at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var SS = window.__ccSettings;
  if (!SS) return;

  SS._getRailVisibility = function () {
    try {
      var raw = localStorage.getItem(SS.RAIL_VIS_KEY);
      if (raw) return JSON.parse(raw);
    } catch(e) {}
    return {};
  };

  SS._saveRailVisibility = function (vis) {
    try { localStorage.setItem(SS.RAIL_VIS_KEY, JSON.stringify(vis)); } catch(e) {}
  };

  SS.applyRailVisibility = function () {
    var vis = SS._getRailVisibility();
    SS.RAIL_ITEMS.forEach(function(ri) {
      var el = document.querySelector('.rail-item[data-tab="' + ri.tab + '"]');
      if (el) {
        el.style.display = (vis[ri.tab] === false) ? 'none' : '';
      }
    });
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'rail', parent: 'system.settings', title: 'settings: rail', mount: function () {}, unmount: function () {} });
  }
})();
