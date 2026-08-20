/* ============================================================
   Smart alignment guides (Fabric.js) — Canva-style snapping
   Expects: fabric, global canvas / backCanvas, CW/CH (fallbacks),
   getActiveCanvas() for extra canvas wiring in split mode.
   ============================================================ */

(function () {
  'use strict';

  var THRESHOLD = 5;
  var DASH = [5, 5];

  function getGuideStroke() {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue('--gold').trim();
      if (v) return v;
    } catch (e) {}
    return '#f2ff58';
  }

  function canvasSize(cvs) {
    var w = typeof cvs.getWidth === 'function' ? cvs.getWidth() : (typeof CW !== 'undefined' ? CW : 700);
    var h = typeof cvs.getHeight === 'function' ? cvs.getHeight() : (typeof CH !== 'undefined' ? CH : 400);
    return { w: w, h: h };
  }

  function bounds(obj) {
    var br = obj.getBoundingRect(true, true);
    return {
      left: br.left,
      top: br.top,
      right: br.left + br.width,
      bottom: br.top + br.height,
      width: br.width,
      height: br.height,
      cx: br.left + br.width / 2,
      cy: br.top + br.height / 2,
    };
  }

  function isGuideObject(o) {
    return o && o.isSmartGuide;
  }

  function clearGuides(cvs) {
    if (!cvs) return;
    if (cvs._smartGuideLines && cvs._smartGuideLines.length) {
      cvs._smartGuideLines.forEach(function (line) {
        try { cvs.remove(line); } catch (e) {}
      });
    }
    cvs._smartGuideLines = [];
    var stray = cvs.getObjects().filter(function (o) { return o.isSmartGuide; });
    for (var i = 0; i < stray.length; i++) {
      try { cvs.remove(stray[i]); } catch (e) {}
    }
  }

  function pushGuide(cvs, x1, y1, x2, y2) {
    var line = new fabric.Line([x1, y1, x2, y2], {
      stroke: getGuideStroke(),
      strokeWidth: 1,
      strokeDashArray: DASH.slice(),
      selectable: false,
      evented: false,
      objectCaching: false,
      excludeFromExport: true,
    });
    line.isSmartGuide = true;
    cvs.add(line);
    if (!cvs._smartGuideLines) cvs._smartGuideLines = [];
    cvs._smartGuideLines.push(line);
  }

  function otherObjects(cvs, target) {
    return cvs.getObjects().filter(function (o) {
      return o !== target && !isGuideObject(o) && o.visible !== false;
    });
  }

  function collectStaticBounds(cvs, target) {
    var list = [];
    otherObjects(cvs, target).forEach(function (o) {
      list.push(bounds(o));
    });
    return list;
  }

  function bestEdgeSnap(edgeCoord, candidates) {
    var best = null;
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i].v;
      var d = Math.abs(edgeCoord - c);
      if (d <= THRESHOLD && (!best || d < best.d)) {
        best = { d: d, v: c };
      }
    }
    return best;
  }

  function pickHorizontalSnap(B, xc) {
    var opts = [
      { snap: bestEdgeSnap(B.left, xc), kind: 'left' },
      { snap: bestEdgeSnap(B.right, xc), kind: 'right' },
      { snap: bestEdgeSnap(B.cx, xc), kind: 'cx' },
    ];
    var best = null;
    opts.forEach(function (o) {
      if (!o.snap) return;
      if (!best || o.snap.d < best.snap.d) best = { snap: o.snap, kind: o.kind };
    });
    if (!best) return null;
    var v = best.snap.v;
    if (best.kind === 'left') return { d: best.snap.d, v: v, delta: v - B.left, kind: 'left' };
    if (best.kind === 'right') return { d: best.snap.d, v: v, delta: v - B.right, kind: 'right' };
    return { d: best.snap.d, v: v, delta: v - B.cx, kind: 'cx' };
  }

  function pickVerticalSnap(B, yc) {
    var opts = [
      { snap: bestEdgeSnap(B.top, yc), kind: 'top' },
      { snap: bestEdgeSnap(B.bottom, yc), kind: 'bottom' },
      { snap: bestEdgeSnap(B.cy, yc), kind: 'cy' },
    ];
    var best = null;
    opts.forEach(function (o) {
      if (!o.snap) return;
      if (!best || o.snap.d < best.snap.d) best = { snap: o.snap, kind: o.kind };
    });
    if (!best) return null;
    var v = best.snap.v;
    if (best.kind === 'top') return { d: best.snap.d, v: v, delta: v - B.top, kind: 'top' };
    if (best.kind === 'bottom') return { d: best.snap.d, v: v, delta: v - B.bottom, kind: 'bottom' };
    return { d: best.snap.d, v: v, delta: v - B.cy, kind: 'cy' };
  }

  function equalSpacingHorizontal(B, staticBoxes, w, h) {
    if (!staticBoxes.length) return null;
    var leftN = null;
    var rightN = null;
    staticBoxes.forEach(function (b) {
      if (b.right <= B.left + THRESHOLD) {
        if (!leftN || b.right > leftN.right) leftN = b;
      }
      if (b.left >= B.right - THRESHOLD) {
        if (!rightN || b.left < rightN.left) rightN = b;
      }
    });
    if (!leftN || !rightN) return null;
    var span = rightN.left - leftN.right;
    var inner = span - B.width;
    if (inner < 0) return null;
    var idealLeft = leftN.right + inner / 2;
    if (Math.abs(B.left - idealLeft) > THRESHOLD) return null;
    return {
      deltaX: idealLeft - B.left,
      guides: [
        { x1: leftN.cx, y1: 0, x2: leftN.cx, y2: h },
        { x1: rightN.cx, y1: 0, x2: rightN.cx, y2: h },
      ],
    };
  }

  function equalSpacingVertical(B, staticBoxes, w, h) {
    if (!staticBoxes.length) return null;
    var topN = null;
    var botN = null;
    staticBoxes.forEach(function (b) {
      if (b.bottom <= B.top + THRESHOLD) {
        if (!topN || b.bottom > topN.bottom) topN = b;
      }
      if (b.top >= B.bottom - THRESHOLD) {
        if (!botN || b.top < botN.top) botN = b;
      }
    });
    if (!topN || !botN) return null;
    var span = botN.top - topN.bottom;
    var inner = span - B.height;
    if (inner < 0) return null;
    var idealTop = topN.bottom + inner / 2;
    if (Math.abs(B.top - idealTop) > THRESHOLD) return null;
    return {
      deltaY: idealTop - B.top,
      guides: [
        { x1: 0, y1: topN.cy, x2: w, y2: topN.cy },
        { x1: 0, y1: botN.cy, x2: w, y2: botN.cy },
      ],
    };
  }

  function onObjectMoving(opt) {
    if (window.__ccSnapOff) return;        // infinite-canvas toolbar "Yapışma" toggle (T8 / A9)
    var target = opt.target;
    if (!target || isGuideObject(target)) return;

    var cvs = target.canvas;
    if (!cvs) return;

    var sz = canvasSize(cvs);
    var w = sz.w;
    var h = sz.h;

    clearGuides(cvs);

    var staticBoxes = collectStaticBounds(cvs, target);

    target.setCoords();
    var B = bounds(target);

    var xc = [];
    var yc = [];

    xc.push({ v: w / 2 });
    yc.push({ v: h / 2 });

    staticBoxes.forEach(function (b) {
      xc.push({ v: b.left });
      xc.push({ v: b.right });
      xc.push({ v: b.cx });
      yc.push({ v: b.top });
      yc.push({ v: b.bottom });
      yc.push({ v: b.cy });
    });

    var snapPickX = pickHorizontalSnap(B, xc);
    var snapPickY = pickVerticalSnap(B, yc);
    var eqH = equalSpacingHorizontal(B, staticBoxes, w, h);
    var eqV = equalSpacingVertical(B, staticBoxes, w, h);

    var dX = 0;
    var dY = 0;
    var useEqH = false;
    var useEqV = false;

    if (eqH && snapPickX) {
      if (Math.abs(eqH.deltaX) <= Math.abs(snapPickX.delta)) {
        dX = eqH.deltaX;
        useEqH = true;
      } else {
        dX = snapPickX.delta;
      }
    } else if (eqH) {
      dX = eqH.deltaX;
      useEqH = true;
    } else if (snapPickX) {
      dX = snapPickX.delta;
    }

    if (eqV && snapPickY) {
      if (Math.abs(eqV.deltaY) <= Math.abs(snapPickY.delta)) {
        dY = eqV.deltaY;
        useEqV = true;
      } else {
        dY = snapPickY.delta;
      }
    } else if (eqV) {
      dY = eqV.deltaY;
      useEqV = true;
    } else if (snapPickY) {
      dY = snapPickY.delta;
    }

    if (dX !== 0 || dY !== 0) {
      target.set({
        left: target.left + dX,
        top: target.top + dY,
      });
      target.setCoords();
      B = bounds(target);
    }

    function alignedX(kind, v) {
      if (kind === 'left') return Math.abs(B.left - v) < 0.5;
      if (kind === 'right') return Math.abs(B.right - v) < 0.5;
      return Math.abs(B.cx - v) < 0.5;
    }

    function alignedY(kind, v) {
      if (kind === 'top') return Math.abs(B.top - v) < 0.5;
      if (kind === 'bottom') return Math.abs(B.bottom - v) < 0.5;
      return Math.abs(B.cy - v) < 0.5;
    }

    if (snapPickX && !useEqH && alignedX(snapPickX.kind, snapPickX.v)) {
      pushGuide(cvs, snapPickX.v, 0, snapPickX.v, h);
    }
    if (useEqH && eqH) {
      eqH.guides.forEach(function (g) {
        pushGuide(cvs, g.x1, g.y1, g.x2, g.y2);
      });
    }

    if (snapPickY && !useEqV && alignedY(snapPickY.kind, snapPickY.v)) {
      pushGuide(cvs, 0, snapPickY.v, w, snapPickY.v);
    }
    if (useEqV && eqV) {
      eqV.guides.forEach(function (g) {
        pushGuide(cvs, g.x1, g.y1, g.x2, g.y2);
      });
    }

    cvs.requestRenderAll();
  }

  function wireCanvas(cvs) {
    if (!cvs || cvs._smartGuidesWired) return;
    cvs._smartGuidesWired = true;
    cvs._smartGuideLines = [];

    cvs.on('object:moving', onObjectMoving);
    cvs.on('object:modified', function () {
      clearGuides(cvs);
      cvs.requestRenderAll();
    });
    cvs.on('mouse:up', function () {
      clearGuides(cvs);
      cvs.requestRenderAll();
    });
    cvs.on('selection:cleared', function () {
      clearGuides(cvs);
      cvs.requestRenderAll();
    });
    cvs.on('object:scaling', function () {
      clearGuides(cvs);
    });
  }

  function tryWireAllCanvases() {
    if (typeof canvas !== 'undefined' && canvas) wireCanvas(canvas);
    if (typeof backCanvas !== 'undefined' && backCanvas) wireCanvas(backCanvas);
    if (typeof getActiveCanvas === 'function') {
      var ac = getActiveCanvas();
      if (ac && ac !== canvas && ac !== (typeof backCanvas !== 'undefined' ? backCanvas : null)) {
        wireCanvas(ac);
      }
    }
  }

  window.initSmartGuides = function initSmartGuides() {
    if (typeof fabric === 'undefined') return;

    tryWireAllCanvases();

    if (!window._smartGuidesObserver && typeof MutationObserver !== 'undefined') {
      // scan-3000 M-M3: body-wide observer fired tryWireAllCanvases on EVERY
      // DOM mutation (panel rebuilds, toasts, timeline renders). Debounced to
      // a 200ms trailing call; wiring new canvases a beat later is invisible.
      var _sgDebounce = null;
      window._smartGuidesObserver = new MutationObserver(function () {
        if (_sgDebounce) clearTimeout(_sgDebounce);
        _sgDebounce = setTimeout(tryWireAllCanvases, 200);
      });
      window._smartGuidesObserver.observe(document.body, { childList: true, subtree: true });
    }
  };
})();

// Faz 8: loads as a canvas-tool module AFTER DOMContentLoaded has fired, so self-init on the
// sticky cc:canvas-ready event (replayed to late modules) instead of the already-passed DOM event.
if (window.cc && cc.on) cc.on('cc:canvas-ready', function () { setTimeout(function () { cc.safe('canvas.tools.smart-guides', initSmartGuides); }, 500); });
else document.addEventListener('DOMContentLoaded', function () { setTimeout(initSmartGuides, 500); });

// Modular skeleton hook (Faz 8) — smart-guides is now a canvas TOOL loader module (modules/canvas/tools/).
if (window.cc && cc.modules) cc.modules.register({ id: 'smart-guides', parent: 'canvas.tools', title: 'Smart guides', mount: function () {}, unmount: function () {} });
