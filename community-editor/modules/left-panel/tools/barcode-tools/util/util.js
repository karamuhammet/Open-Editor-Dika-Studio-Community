/* Module: left-panel/tools/barcode-tools/util — State persistence + small helpers (clone/merge/esc/icon/type checks).
   Part of the barcode-tools group (decomposed from the 1365-line IIFE). Functions hang off the
   shared namespace VBC (window.__ccBarcodeTools, created by the parent); cross-module refs resolve
   through VBC at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VBC = window.__ccBarcodeTools;
  if (!VBC) return;

  VBC._clone = function (obj) {
    return JSON.parse(JSON.stringify(obj));
  };

  VBC._loadState = function () {
    try {
      var raw = localStorage.getItem(VBC.STORAGE_KEY);
      if (!raw) return VBC._clone(VBC.DEFAULT_STATE);
      return VBC._mergeDeep(VBC._clone(VBC.DEFAULT_STATE), JSON.parse(raw) || {});
    } catch (e) {
      return VBC._clone(VBC.DEFAULT_STATE);
    }
  };

  VBC._saveState = function () {
    try { localStorage.setItem(VBC.STORAGE_KEY, JSON.stringify(VBC._state)); } catch (e) {}
  };

  VBC._mergeDeep = function (target, src) {
    var key;
    if (!src || typeof src !== 'object') return target;
    for (key in src) {
      if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
      if (src[key] && typeof src[key] === 'object' && !Array.isArray(src[key])) {
        target[key] = VBC._mergeDeep(target[key] && typeof target[key] === 'object' ? target[key] : {}, src[key]);
      } else {
        target[key] = src[key];
      }
    }
    return target;
  };

  VBC._esc = function (str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  VBC._icon = function (name, size) {
    size = size || 14;
    if (typeof getIcon === 'function') return getIcon(name, size);
    return '';
  };

  VBC._isTextObjectType = function (type) {
    return type === 'text' || type === 'i-text' || type === 'textbox';
  };

  VBC._isImageUrl = function (val) {
    return /^https?:\/\//i.test(String(val || '').trim());
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'util', parent: 'left-panel.tools.barcode-tools', title: 'barcode-tools: util', mount: function () {}, unmount: function () {} });
  }
})();
