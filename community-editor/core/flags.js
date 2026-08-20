/* core/flags.js — central feature flags. Default OFF for in-progress work.
   Loaded as an early <script> in index.html (before the engine block). Read with ccFlag('key').
   Toggle in dev via: localStorage.cc_flags = JSON.stringify({ scene:true }); then reload.
   Part of the frame-canvas (scene) migration — see docs/frame-canvas-migration-plan.md (Faz 0). */
(function (global) {
  'use strict';
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem('cc_flags') || '{}'); } catch (e) {}
  var CC_FLAGS = {
    scene:        saved.scene        === true,  // master switch for the scene (infinite-canvas) page-type
    sceneSleep:   saved.sceneSleep   === true,  // Faz 4 sub-flag — sleep-mode virtualization
    sceneExport:  saved.sceneExport  === true,  // Faz 6 sub-flag — frame-based export pipeline
    sceneMerge:   saved.sceneMerge   === true   // Faz N sub-flag — classic page → 1-frame scene merge
  };
  global.CC_FLAGS = CC_FLAGS;
  global.ccFlag = function (k) { return !!CC_FLAGS[k]; };
})(window);
