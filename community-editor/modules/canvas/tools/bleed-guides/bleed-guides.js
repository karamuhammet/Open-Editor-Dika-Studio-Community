/* ============================================================
   Bleed & safe-zone print guides (Fabric.js)
   Expects: fabric, canvas, backCanvas (optional), CW, CH,
   getActiveCanvas from app.js
   ============================================================ */

(function () {
  'use strict';

  var BLEED_PX = 21;
  var SAFE_PX = 35;
  var DASH = [7, 5];

  var printGuidesOn = false;
  var lastDims = { w: 0, h: 0 };

  function guideProps(extra) {
    var o = {
      selectable: false,
      evented: false,
      excludeFromExport: true,
      _isGuide: true,
      objectCaching: false,
    };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) o[k] = extra[k];
      }
    }
    return o;
  }

  function canvasList() {
    var list = [];
    if (typeof canvas !== 'undefined' && canvas) list.push(canvas);
    if (typeof backCanvas !== 'undefined' && backCanvas) list.push(backCanvas);
    return list;
  }

  function sizeOf(cvs) {
    var w = cvs.getWidth ? cvs.getWidth() : (typeof CW !== 'undefined' ? CW : 700);
    var h = cvs.getHeight ? cvs.getHeight() : (typeof CH !== 'undefined' ? CH : 400);
    return { w: w, h: h };
  }

  function removePrintGuides(cvs) {
    if (!cvs || !cvs.getObjects) return;
    cvs.getObjects()
      .filter(function (o) {
        return o && o._isGuide;
      })
      .forEach(function (o) {
        try {
          cvs.remove(o);
        } catch (e) {}
      });
  }

  function addPrintGuidesToCanvas(cvs) {
    if (!cvs) return;
    var sz = sizeOf(cvs);
    var W = sz.w;
    var H = sz.h;
    var b = BLEED_PX;
    var s = SAFE_PX;

    var bleedRect = new fabric.Rect(
      guideProps({
        left: b,
        top: b,
        width: Math.max(0, W - b * 2),
        height: Math.max(0, H - b * 2),
        fill: '',
        stroke: '#e53935',
        strokeWidth: 1.25,
        strokeDashArray: DASH.slice(),
      })
    );

    var safeRect = new fabric.Rect(
      guideProps({
        left: s,
        top: s,
        width: Math.max(0, W - s * 2),
        height: Math.max(0, H - s * 2),
        fill: '',
        stroke: '#43a047',
        strokeWidth: 1.25,
        strokeDashArray: DASH.slice(),
      })
    );

    var cx = W / 2;
    var cy = H / 2;
    var crossV = new fabric.Line([cx, 0, cx, H], guideProps({
      stroke: 'rgba(255,255,255,0.12)',
      strokeWidth: 1,
    }));
    var crossH = new fabric.Line([0, cy, W, cy], guideProps({
      stroke: 'rgba(255,255,255,0.12)',
      strokeWidth: 1,
    }));

    var labelBleed = new fabric.Text('BLEED', guideProps({
      left: b + 4,
      top: b + 2,
      fontSize: 10,
      fontFamily: 'system-ui, Segoe UI, sans-serif',
      fill: 'rgba(229,57,53,0.95)',
      fontWeight: '600',
    }));

    var labelSafe = new fabric.Text('SAFE ZONE', guideProps({
      left: s + 4,
      top: s + 2,
      fontSize: 10,
      fontFamily: 'system-ui, Segoe UI, sans-serif',
      fill: 'rgba(67,160,71,0.95)',
      fontWeight: '600',
    }));

    [bleedRect, safeRect, crossV, crossH, labelBleed, labelSafe].forEach(function (obj) {
      cvs.add(obj);
    });

    bringGuidesToFront(cvs);
  }

  function bringGuidesToFront(cvs) {
    if (!cvs || !cvs.getObjects) return;
    cvs.getObjects().forEach(function (o) {
      if (o && o._isGuide) cvs.bringToFront(o);
    });
    cvs.requestRenderAll();
  }

  function refreshIfDimensionsChanged() {
    if (!printGuidesOn) return;
    var cvs = typeof canvas !== 'undefined' && canvas ? canvas : null;
    if (!cvs) return;
    var sz = sizeOf(cvs);
    if (sz.w !== lastDims.w || sz.h !== lastDims.h) {
      lastDims = { w: sz.w, h: sz.h };
      canvasList().forEach(function (c) {
        removePrintGuides(c);
        addPrintGuidesToCanvas(c);
      });
    }
  }

  function setPrintGuidesActive(on) {
    if (on && !isCurrentProductPrintable()) on = false;
    printGuidesOn = !!on;
    var btn = document.getElementById('gear-toggle-print-guides');
    if (btn) btn.classList.toggle('active', printGuidesOn);

    canvasList().forEach(function (c) {
      removePrintGuides(c);
      if (printGuidesOn) addPrintGuidesToCanvas(c);
      else c.requestRenderAll();
    });

    if (printGuidesOn) {
      var sz = sizeOf(canvas);
      lastDims = { w: sz.w, h: sz.h };
    }
  }

  var PRINT_PRODUCTS = { card: true, cv: true };

  function isCurrentProductPrintable() {
    var product = typeof activeProduct !== 'undefined' ? activeProduct : 'card';
    return !!PRINT_PRODUCTS[product];
  }

  function togglePrintGuides() {
    if (!isCurrentProductPrintable()) {
      if (typeof showToast === 'function') {
        showToast('Bleed guides are for print products only', 'info');
      }
      setPrintGuidesActive(false);
      return;
    }
    setPrintGuidesActive(!printGuidesOn);
  }

  var wired = new WeakSet();
  function wireCanvas(cvs) {
    if (!cvs || wired.has(cvs)) return;
    wired.add(cvs);
    cvs.on('object:added', function (opt) {
      if (!printGuidesOn) return;
      var target = opt && opt.target;
      if (target && target._isGuide) return;
      bringGuidesToFront(cvs);
      refreshIfDimensionsChanged();
    });
  }

  function tryWireBackCanvas() {
    if (typeof backCanvas === 'undefined' || !backCanvas) return;
    wireCanvas(backCanvas);
    if (printGuidesOn && !backCanvas.getObjects().some(function (o) {
      return o && o._isGuide;
    })) {
      addPrintGuidesToCanvas(backCanvas);
    }
  }

  function injectGearButton() {
    var drop = document.getElementById('gear-dropdown');
    if (!drop || document.getElementById('gear-toggle-print-guides')) return;

    var sep = document.createElement('div');
    sep.className = 'gear-sep';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gear-item';
    btn.id = 'gear-toggle-print-guides';
    btn.textContent = 'Toggle Print Guides';
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      togglePrintGuides();
    });

    var resetBtn = drop.querySelector('.gear-item[onclick*="resetWizard"]');
    if (resetBtn && resetBtn.parentNode) {
      resetBtn.parentNode.insertBefore(sep, resetBtn);
      resetBtn.parentNode.insertBefore(btn, resetBtn);
    } else {
      drop.appendChild(sep);
      drop.appendChild(btn);
    }
  }

  function onTabSplitClick() {
    setTimeout(tryWireBackCanvas, 0);
    setTimeout(tryWireBackCanvas, 200);
  }

  window.initBleedGuides = function initBleedGuides() {
    injectGearButton();
    if (typeof canvas !== 'undefined' && canvas) wireCanvas(canvas);

    document.addEventListener('click', function (e) {
      var t = e.target;
      if (t && t.id === 'tab-split') onTabSplitClick();
    }, true);

    var orientH = document.getElementById('orient-h');
    var orientV = document.getElementById('orient-v');
    function onOrient() {
      setTimeout(function () {
        if (!printGuidesOn) return;
        lastDims = { w: 0, h: 0 };
        refreshIfDimensionsChanged();
      }, 0);
    }
    if (orientH) orientH.addEventListener('click', onOrient);
    if (orientV) orientV.addEventListener('click', onOrient);
  };

  // Faz 8: canvas-tool module loads after DOMContentLoaded → self-init on sticky cc:canvas-ready
  // (an immediate init at module-load could race the canvas not being ready yet).
  if (window.cc && cc.on) cc.on('cc:canvas-ready', function () { cc.safe('canvas.tools.bleed-guides', window.initBleedGuides); });
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', window.initBleedGuides);
  else window.initBleedGuides();
})();

// Modular skeleton hook (Faz 8) — bleed-guides is now a canvas TOOL loader module (modules/canvas/tools/).
if (window.cc && cc.modules) cc.modules.register({ id: 'bleed-guides', parent: 'canvas.tools', title: 'Bleed guides', mount: function () {}, unmount: function () {} });
