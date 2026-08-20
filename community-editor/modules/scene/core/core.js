/* Module: scene/core — scene mode ENGINE (Faz 1): the SC.* implementations behind the SceneEditor
   facade. Normalizes a page into the locked _scene model, owns activate/deactivate + per-page save/load.
   Attaches to SC = window.__ccSceneEditor (created by scene.js). Flag-gated: only ever called for
   _productType==='scene' pages while ccFlag('scene') is on. See docs/frame-canvas-migration-plan.md. */
(function (global) {
  'use strict';
  var SC = global.__ccSceneEditor;
  if (!SC) return;

  // _frameId/_isFrame are already in CUSTOM_PROPS (photo-frame); add scene-only props. _ccFrame ≠ _isFrame
  // (the photo-frame tool) on purpose — the doc flags this collision. _sceneRole tags frame sub-parts.
  if (global.cc && cc.registerProps) cc.registerProps(['_ccFrame', '_sceneRole', '_isSleepThumb', '_componentId', '_scSticky']);

  var FRAME_DEFAULT = { w: 1080, h: 1080, bg: '#ffffff' };

  // Scene debug logger — OFF by default. Enable with `window.__scDebug = true` then filter the console by
  // "SCDBG" to capture multi-frame select/group/align traces. Lightweight + crash-proof. (scSnapshot() +
  // _scDumpFrames() always work regardless.)
  global._scLog = function () {
    if (global.__scDebug !== true) return;
    try { console.log.apply(console, ['%c[SCDBG]', 'color:#f2ff58'].concat([].slice.call(arguments))); } catch (e) {}
  };

  SC._seq = 0;
  SC._uid = function (p) { SC._seq++; return (p || 'fr') + '-' + Date.now().toString(36) + SC._seq.toString(36); };

  // Normalize a page into a valid _scene model (Faz 1 schema — LOCKED, see plan §7 Faz 1). Idempotent.
  SC.normalize = function (page) {
    if (!page._scene || !page._scene.frames || !page._scene.frames.length) {
      var w = page.w || FRAME_DEFAULT.w, h = page.h || FRAME_DEFAULT.h;
      page._scene = {
        schemaVersion: 1,
        world: { zoom: 1, panX: 0, panY: 0 },
        frames: [{
          id: SC._uid('fr'), x: 0, y: 0, w: w, h: h, label: 'Frame 1', bg: FRAME_DEFAULT.bg,
          json: { version: '5.3.1', objects: [] }, _sleeping: false, _thumb: null, _previewRev: 0
        }],
        frameGroups: [],
        freeElements: [],
        limits: { maxFrames: 200 }
      };
    }
    if (page._scene.schemaVersion == null) page._scene.schemaVersion = 1;
    if (!page._scene.world) page._scene.world = { zoom: 1, panX: 0, panY: 0 };
    if (!page._scene.freeElements) page._scene.freeElements = [];
    return page._scene;
  };

  // toggle a scene class on the canvas area so scene-only CSS (e.g. neutralizing the classic card-stage
  // drop-shadow/radius so the dotted backdrop reads edge-to-edge) applies only while scene mode is active.
  function _sceneAreaClass(on) {
    var area = document.getElementById('canvas-area') || document.querySelector('.canvas-area');
    if (area) area.classList.toggle('scene-active', !!on);
  }
  SC.activate = function () { SC._active = true; _sceneAreaClass(true); if (global.cc && cc.emit) cc.emit('scene:active', true); };
  SC.deactivate = function () { SC._active = false; _sceneAreaClass(false); if (global.cc && cc.emit) cc.emit('scene:active', false); };

  SC._pageById = function (id) {
    if (typeof pages === 'undefined') return null;
    for (var i = 0; i < pages.length; i++) if (pages[i]._pageId === id) return pages[i];
    return null;
  };

  // Render a scene page into the single fabric.Canvas (delegates to scene/world). Called by switchPage.
  SC.loadForPage = function (pageId) {
    var page = SC._pageById(pageId);
    if (!page) return;
    SC.normalize(page);
    if (typeof _scRenderWorld === 'function') _scRenderWorld(page);
  };

  // Persist the live canvas back into the page's _scene model.
  SC.saveForPage = function (pageId) {
    var page = SC._pageById(pageId);
    if (!page || !page._scene) return;
    if (typeof _scSerializeWorld === 'function') _scSerializeWorld(page);
  };

  // ── Faz N: MERGE classic pages → one scene (1 frame per page). Optional, gated behind ccFlag('sceneMerge'). ──
  function _isClassicPage(p) {
    return p && !p._scene && !p._slideDeck && !p._isBoard && p._productType !== 'video' && p._productType !== 'scene' &&
           !(typeof pageHasSlideDeck === 'function' && pageHasSlideDeck(p));
  }
  global._scMergeClassicPages = function () {
    if (typeof pages === 'undefined') return 0;
    // Page-sleep: merging consumes every classic page's json; hydrate slept ones first.
    if (typeof CCPageSleep !== 'undefined' && !CCPageSleep._mergeHydrating) {
      var _slp = [];
      pages.forEach(function (p, i) { if (p && p._slept && _isClassicPage(p)) _slp.push(i); });
      if (_slp.length) {
        CCPageSleep._mergeHydrating = true;
        var _left = _slp.length;
        _slp.forEach(function (i) {
          CCPageSleep.ensurePageHydrated(i, function () {
            if (--_left === 0) { CCPageSleep._mergeHydrating = false; global._scMergeClassicPages(); }
          });
        });
        return 0;
      }
    }
    var classic = pages.filter(_isClassicPage);
    if (!classic.length) { if (typeof showToast === 'function') showToast('No classic page to merge'); return 0; }
    if (typeof saveCurrentPage === 'function') saveCurrentPage();
    var x = 0, GAP = 120, frames = [];
    classic.forEach(function (p) {
      var w = p.w || 1080, h = p.h || 1080;
      // Page-sleep: read the parked json for a slept page (no-op when off).
      var _pj = (typeof _psJsonForSave === 'function') ? _psJsonForSave(p) : p.json;
      var objs = (_pj && _pj.objects ? _pj.objects : []).map(function (j) {
        var c = JSON.parse(JSON.stringify(j)); c.left = (c.left || 0) + x; c.top = (c.top || 0) + 0; delete c.clipPath; return c;
      });
      frames.push({ id: SC._uid('fr'), x: x, y: 0, w: w, h: h, label: p.label || ('Frame ' + (frames.length + 1)),
        bg: p.bg || '#ffffff', json: { version: '5.3.1', objects: objs }, _sleeping: false, _thumb: null, _previewRev: 0 });
      x += w + GAP;
    });
    var scenePage = {
      _pageId: 'pg-merge-' + Date.now().toString(36), _productType: 'scene', w: 1080, h: 1080,
      label: 'Unified Canvas', bg: '#ffffff',
      _scene: { schemaVersion: 1, world: { zoom: 1, panX: 0, panY: 0 }, frames: frames, frameGroups: [], freeElements: [], limits: { maxFrames: 500 } }
    };
    pages.push(scenePage);
    if (typeof switchPage === 'function') switchPage(pages.length - 1);
    if (typeof showToast === 'function') showToast(frames.length + ' page merged to single canvas');
    return frames.length;
  };

  if (global.cc && cc.modules) {
    cc.modules.register({ id: 'core', parent: 'scene', title: 'scene: core', mount: function () {}, unmount: function () {} });
  }
})(window);
