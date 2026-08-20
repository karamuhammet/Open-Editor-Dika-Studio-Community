/* Module: scene/templates — scene ENTRY + the scene-side hooks the Command Rail templates panel calls.
   The panel UI lives in the left-panel templates renderer (Command Rail). This module owns: the Single ⟷
   Infinite canvas MODE (a flag — the pill does NOT spawn pages; a scene page is created lazily the first
   time a template is added), scene page creation, and the "add a template/saved design as a frame on the
   infinite canvas" builders. See docs/frame-canvas-migration-plan.md. */
(function (global) {
  'use strict';
  var SC = global.__ccSceneEditor;
  if (!SC) return;

  if (global.__ccCanvasMode == null) global.__ccCanvasMode = 'single';

  // preset sizes used by responsive variants (_scVariantsAllSizes)
  var PRESETS = [
    { label: 'Square', w: 1080, h: 1080 }, { label: 'Portrait', w: 1080, h: 1350 },
    { label: 'Story', w: 1080, h: 1920 }, { label: 'Landscape', w: 1920, h: 1080 }, { label: 'A4', w: 595, h: 842 }
  ];

  function _curPage() { return (typeof pages !== 'undefined' && typeof currentPageIndex !== 'undefined') ? pages[currentPageIndex] : null; }
  function _searchVal() { var el = document.getElementById('tpl-search-input'); return el ? el.value : ''; }
  function _scene() {
    if (SC._curScene) { var s = SC._curScene(); if (s) return s; }
    if (typeof _curScene === 'function') { var s2 = _curScene(); if (s2) return s2; }
    var p = _curPage(); return p && p._scene ? p._scene : null;
  }
  function _reRender() { if (typeof renderTemplatesPanel === 'function') renderTemplatesPanel('flyout-tpl-grid', _searchVal()); }
  function _firstPageOfType(wantScene) {
    if (typeof pages === 'undefined') return -1;
    for (var i = 0; i < pages.length; i++) { var isScene = pages[i]._productType === 'scene'; if (wantScene ? isScene : !isScene) return i; }
    return -1;
  }

  // ── create a new infinite-canvas (scene) page ──
  global._scNewScenePage = function () {
    if (typeof saveCurrentPage === 'function') saveCurrentPage();
    var pid = 'pg-' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    var n = 1; for (var i = 0; i < pages.length; i++) if (pages[i]._productType === 'scene') n++;
    pages.push({ _pageId: pid, _productType: 'scene', w: 1080, h: 1080, label: 'Canvas ' + n, bg: '#ffffff' });
    switchPage(pages.length - 1);
  };

  // create a brand-new infinite page from scratch (Add-page menu) — enables the scene feature + sets the
  // mode so the page actually renders as a scene, not just an empty classic page.
  global._scCreateInfinitePage = function () {
    _enableSceneFlags();
    global.__ccCanvasMode = 'infinite';
    if (typeof _scNewScenePage === 'function') _scNewScenePage();
  };

  // make sure we're ON an infinite (scene) page before adding a frame. If the current page IS a scene,
  // add there; otherwise open a NEW infinite page (LAZY — first add in Infinite mode auto-creates it).
  // (Owner: adding in Infinite mode must auto-open an infinite page — do NOT hijack to the first existing
  // scene page / the first-opened single page.)
  function _ensureScenePage() {
    var cur = _curPage();
    if (cur && cur._productType === 'scene') return _scene();
    if (typeof _scNewScenePage === 'function') _scNewScenePage();
    return _scene();
  }

  // next frame position: a horizontal row to the right of the rightmost frame
  function _nextPos() {
    var sc = _scene();
    if (!sc || !sc.frames.length) return { x: 0, y: 0 };
    var maxR = -Infinity, topY = sc.frames[0].y;
    sc.frames.forEach(function (f) { if (f.x + f.w > maxR) maxR = f.x + f.w; });
    return { x: maxR + 80, y: topY };
  }

  function _focusNewFrame(fr, w, h) {
    if (!global.canvas) return;
    var z = canvas.getZoom() || 1;
    canvas.setViewportTransform([z, 0, 0, z, canvas.getWidth() / 2 - (fr.x + w / 2) * z, canvas.getHeight() / 2 - (fr.y + h / 2) * z]);
    canvas.requestRenderAll();
    if (typeof _scScheduleSleep === 'function') _scScheduleSleep();
  }

  // when a scene page was just lazily created it carries one auto empty "Frame 1"; drop it so the first
  // added template becomes the only frame (no stray empty frame next to it).
  function _dropLoneEmptyFrame() {
    var sc = _scene();
    if (sc && sc.frames.length === 1) {
      var f0 = sc.frames[0];
      if ((!f0.json || !f0.json.objects || !f0.json.objects.length) && typeof _scRemoveFrame === 'function') _scRemoveFrame(f0.id);
    }
  }

  // add an empty sized frame
  global._scAddPresetFrame = function (w, h, label) {
    _ensureScenePage();
    if (typeof _scAddFrame !== 'function') return null;
    var p = _nextPos();
    var fr = _scAddFrame(p.x, p.y, w, h, { label: label });
    if (fr) _focusNewFrame(fr, w, h);
    return fr;
  };

  // create a reflowed variant of a frame in every OTHER preset size (responsive: 1 design → all platforms)
  global._scVariantsAllSizes = function (srcId) {
    var sc = _scene(); if (!sc) return 0;
    var src = SC._findFrame ? SC._findFrame(sc, srcId) : null; if (!src) return 0;
    var n = 0;
    PRESETS.forEach(function (p) {
      if (p.w === src.w && p.h === src.h) return;
      if (typeof _scCreateVariant === 'function') { _scCreateVariant(srcId, p.w, p.h, src.label + ' · ' + p.label); n++; }
    });
    if (typeof showToast === 'function') showToast(n + ' platform variant generated');
    return n;
  };

  // turn the scene flags ON and PERSIST them so the feature stays enabled across reloads (no console).
  function _enableSceneFlags() {
    window.CC_FLAGS = window.CC_FLAGS || {};
    CC_FLAGS.scene = true; CC_FLAGS.sceneSleep = true; CC_FLAGS.sceneExport = true;
    if (typeof ccFlag !== 'function') window.ccFlag = function (k) { return !!CC_FLAGS[k]; };
    try {
      var f = JSON.parse(localStorage.getItem('cc_flags') || '{}');
      f.scene = true; f.sceneSleep = true; f.sceneExport = true;
      localStorage.setItem('cc_flags', JSON.stringify(f));
    } catch (e) {}
  }

  // ── Single ⟷ Infinite (the Command Rail pill calls these). These DO NOT create pages — they only set
  //    the mode + switch to an EXISTING page of that kind. The scene page is created lazily on the first
  //    template add. (owner: "o düğmeyle yeni sayfa açtırma" — the button must not spawn pages.) ──
  global._scEnterInfinite = function () {
    _enableSceneFlags();
    global.__ccCanvasMode = 'infinite';
    // pill only sets the MODE — it does NOT navigate or create a page (owner: "o düğmeyle yeni sayfa
    // açtırma"). The infinite page is opened lazily on the first add (_ensureScenePage); the
    // Add-page menu is how you make or reach one.
    _reRender();
  };
  global._scExitToSingle = function () {
    global.__ccCanvasMode = 'single';
    var cur = _curPage();
    if (cur && cur._productType === 'scene') {
      var idx = _firstPageOfType(false);
      if (idx >= 0 && typeof switchPage === 'function') switchPage(idx);
      else if (typeof addPage === 'function') addPage();
    }
    _reRender();
  };

  /* The zoom HUD's canvas-mode indicator (Single/Infinite/Slide/Video) was REMOVED 2026-08-08
     (owner: "en soldaki sayfa iconunada gerek yok"). Its writer went with it rather than being
     left pointing at an element that no longer exists: the page tabs already say which page you
     are on, and a writer with no target is the ghost code this project forbids. */

  // ── add a Post template as a frame WITH its real content (scratch-render the imperative builder) ──
  global._scAddTemplateFrame = function (key, productType) {
    _ensureScenePage();
    if (typeof TEMPLATE_REGISTRY === 'undefined' || !global.fabric) return null;
    var reg = TEMPLATE_REGISTRY[key]; if (!reg || typeof reg.fn !== 'function') return null;
    var cfg = (typeof PRODUCT_TYPES !== 'undefined' && PRODUCT_TYPES[productType]) || { w: 700, h: 400 };
    var tw = cfg.w, th = cfg.h;
    var _oc = global.canvas, _ocw = global.CW, _och = global.CH;   // builders read globals canvas/CW/CH
    var objs = [], bg = '#ffffff';
    try {
      var tmp = new fabric.StaticCanvas(null, { width: tw, height: th });
      global.canvas = tmp; global.CW = tw; global.CH = th;
      reg.fn();                                                    // .fn() (not applyTemplate) → no canvas.clear on the live scene
      tmp.renderAll();
      var cp = (global.cc && cc.customProps) ? cc.customProps() : undefined;
      objs = tmp.getObjects().map(function (o) { var j = o.toObject(cp); delete j.clipPath; return j; });
      bg = tmp.backgroundColor || '#ffffff';
      tmp.dispose();
    } catch (e) {
      if (typeof showToast === 'function') showToast('Template could not be added as frame');
    } finally {
      global.canvas = _oc; global.CW = _ocw; global.CH = _och;     // ALWAYS restore the live globals
    }
    _dropLoneEmptyFrame();   // first template replaces the auto-created empty "Frame 1"
    var p = _nextPos();
    var made = null;
    // objs are in template-LOCAL coords (the builder renders at 0,0..tw,th) → seed the CCFrame directly.
    fabric.util.enlivenObjects(objs, function (enlivened) {
      made = (typeof _scAddFrame === 'function') ? _scAddFrame(p.x, p.y, tw, th, { label: reg.name, bg: bg, objects: enlivened }) : null;
      if (made) { _focusNewFrame(made, tw, th); if (typeof showToast === 'function') showToast(reg.name + ' → frame'); }
    });
    return made;
  };

  // ── add a SAVED template (which already carries json.objects in canvas-LOCAL coords) as a frame ──
  global._scAddSavedFrame = function (tpl) {
    _ensureScenePage();
    if (!tpl || !tpl.json) return null;
    var tw = tpl.canvasWidth || 700, th = tpl.canvasHeight || 400;
    _dropLoneEmptyFrame();
    var p = _nextPos();
    var objs = (tpl.json.objects || []).map(function (o) { var j = JSON.parse(JSON.stringify(o)); delete j.clipPath; return j; });
    var made = null;
    fabric.util.enlivenObjects(objs, function (enlivened) {
      made = (typeof _scAddFrame === 'function') ? _scAddFrame(p.x, p.y, tw, th, { label: tpl.name, bg: tpl.bg || '#ffffff', objects: enlivened }) : null;
      if (made) { _focusNewFrame(made, tw, th); if (typeof showToast === 'function') showToast(tpl.name + ' → frame'); }
    });
    return made;
  };

  if (global.cc && cc.on) {
    // keep the canvas-mode flag in sync with reality + re-render the Command Rail (pill state + card verb)
    cc.on('scene:active', function (on) {
      global.__ccCanvasMode = on ? 'infinite' : 'single';
      if ((global.activeTemplateMode || 'post') === 'post') _reRender();
    });
  }

  if (global.cc && cc.modules) {
    cc.modules.register({ id: 'templates', parent: 'scene', title: 'scene: templates', mount: function () {}, unmount: function () {} });
  }
})(window);
