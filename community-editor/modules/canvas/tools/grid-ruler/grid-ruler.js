/* ============================================================
   Pixel grid overlay + ruler labels (Fabric.js)
   Expects: fabric, canvas, backCanvas (optional), CW, CH,
   getActiveCanvas (optional, for consistency with app)
   ============================================================ */

(function () {
  'use strict';

  window.gridVisible = false;

  var MINOR = 25;
  var MAJOR = 100;

  var lastDimsByCanvas = new WeakMap();
  var wired = new WeakSet();
  var resizeObserver = null;
  var rafResize = 0;

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

  function gridProps(extra) {
    var o = {
      selectable: false,
      evented: false,
      excludeFromExport: true,
      _isGridLine: true,
      objectCaching: false,
    };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) o[k] = extra[k];
      }
    }
    return o;
  }

  function labelFillColor() {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue('--text').trim();
      if (v) return v;
    } catch (e) {}
    return 'rgba(255,255,255,0.42)';
  }

  function removeGridFromCanvas(cvs) {
    if (!cvs || !cvs.getObjects) return;
    cvs.getObjects()
      .filter(function (o) {
        return o && o._isGridLine;
      })
      .forEach(function (o) {
        try {
          cvs.remove(o);
        } catch (e) {}
      });
  }

  function sendGridToBack(cvs) {
    if (!cvs || !cvs.getObjects) return;
    cvs.getObjects().forEach(function (o) {
      if (o && o._isGridLine) cvs.sendToBack(o);
    });
    cvs.requestRenderAll();
  }

  function addGridToCanvas(cvs) {
    if (!cvs || typeof fabric === 'undefined') return;
    var sz = sizeOf(cvs);
    var W = sz.w;
    var H = sz.h;
    var toAdd = [];
    var labelFill = labelFillColor();
    var font = 'system-ui, Segoe UI, sans-serif';

    function pushLine(x1, y1, x2, y2, major) {
      toAdd.push(
        new fabric.Line([x1, y1, x2, y2], gridProps({
          stroke: major ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
          strokeWidth: 0.5,
        }))
      );
    }

    var x;
    for (x = 0; x <= W; x += MINOR) {
      pushLine(x, 0, x, H, x % MAJOR === 0);
    }

    var y;
    for (y = 0; y <= H; y += MINOR) {
      pushLine(0, y, W, y, y % MAJOR === 0);
    }

    for (x = MAJOR; x < W; x += MAJOR) {
      toAdd.push(
        new fabric.Text(String(x), gridProps({
          left: x,
          top: 3,
          originX: 'center',
          originY: 'top',
          fontSize: 9,
          fontFamily: font,
          fill: labelFill,
          fontWeight: '500',
        }))
      );
    }

    for (y = MAJOR; y < H; y += MAJOR) {
      toAdd.push(
        new fabric.Text(String(y), gridProps({
          left: 4,
          top: y,
          originX: 'left',
          originY: 'center',
          fontSize: 9,
          fontFamily: font,
          fill: labelFill,
          fontWeight: '500',
        }))
      );
    }

    toAdd.forEach(function (obj) {
      cvs.add(obj);
    });
    sendGridToBack(cvs);

    lastDimsByCanvas.set(cvs, { w: W, h: H });
  }

  function rebuildAllGrids() {
    if (!window.gridVisible) return;
    canvasList().forEach(function (cvs) {
      removeGridFromCanvas(cvs);
      addGridToCanvas(cvs);
    });
  }

  function scheduleResizeCheck() {
    if (!window.gridVisible) return;
    if (rafResize) cancelAnimationFrame(rafResize);
    rafResize = requestAnimationFrame(function () {
      rafResize = 0;
      var need = false;
      canvasList().forEach(function (cvs) {
        var sz = sizeOf(cvs);
        var prev = lastDimsByCanvas.get(cvs);
        if (!prev || prev.w !== sz.w || prev.h !== sz.h) need = true;
      });
      if (need) rebuildAllGrids();
    });
  }

  function setGridUiActive(on) {
    var g = document.getElementById('gear-toggle-grid');
    var c = document.getElementById('ctx-toggle-grid');
    if (g) g.classList.toggle('active', on);
    if (c) c.classList.toggle('active', on);
  }

  function setGridVisible(on) {
    window.gridVisible = !!on;
    setGridUiActive(window.gridVisible);

    canvasList().forEach(function (cvs) {
      removeGridFromCanvas(cvs);
      if (window.gridVisible) addGridToCanvas(cvs);
      else cvs.requestRenderAll();
    });
  }

  window.toggleGridOverlay = function toggleGridOverlay() {
    setGridVisible(!window.gridVisible);
  };

  function wireCanvas(cvs) {
    if (!cvs || wired.has(cvs)) return;
    wired.add(cvs);
    cvs.on('object:added', function (opt) {
      if (!window.gridVisible) return;
      var target = opt && opt.target;
      if (target && target._isGridLine) return;
      sendGridToBack(cvs);
      scheduleResizeCheck();
    });
  }

  function tryWireBackCanvas() {
    if (typeof backCanvas === 'undefined' || !backCanvas) return;
    wireCanvas(backCanvas);
    if (window.gridVisible && !backCanvas.getObjects().some(function (o) {
      return o && o._isGridLine;
    })) {
      addGridToCanvas(backCanvas);
    }
  }

  function injectGearButton() {
    var drop = document.getElementById('gear-dropdown');
    if (!drop || document.getElementById('gear-toggle-grid')) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gear-item';
    btn.id = 'gear-toggle-grid';
    btn.textContent = 'Toggle Grid';
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      window.toggleGridOverlay();
    });

    var seps = drop.querySelectorAll('.gear-sep');
    var lastSep = seps[seps.length - 1];
    if (lastSep && lastSep.parentNode === drop) {
      drop.insertBefore(btn, lastSep);
    } else {
      drop.appendChild(btn);
    }
  }

  function injectCtxItem() {
    var menu = document.getElementById('ctx-menu');
    if (!menu || document.getElementById('ctx-toggle-grid')) return;

    var sep = document.createElement('div');
    sep.className = 'ctx-sep';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ctx-item';
    btn.id = 'ctx-toggle-grid';
    btn.textContent = 'Toggle Grid';
    btn.addEventListener('click', function () {
      if (typeof window.toggleGridOverlay === 'function') window.toggleGridOverlay();
    });

    menu.appendChild(sep);
    menu.appendChild(btn);
  }

  function onKeyDown(e) {
    var editable = e.target && e.target.matches && e.target.matches('input, textarea, select, [contenteditable="true"]');
    if (editable) return;

    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
    if (e.code !== 'Quote' && e.key !== "'" && e.key !== '"') return;

    e.preventDefault();
    window.toggleGridOverlay();
  }

  function setupResizeObserver() {
    if (typeof ResizeObserver === 'undefined') return;
    var root = document.getElementById('card-stage');
    if (!root) {
      var el = document.getElementById('card');
      root = el ? el.parentElement : null;
    }
    if (!root) return;
    if (resizeObserver) {
      try {
        resizeObserver.disconnect();
      } catch (e) {}
    }
    resizeObserver = new ResizeObserver(function () {
      scheduleResizeCheck();
    });
    resizeObserver.observe(root);
  }

  function onTabSplitClick() {
    setTimeout(tryWireBackCanvas, 0);
    setTimeout(tryWireBackCanvas, 200);
  }

  function onOrient() {
    setTimeout(function () {
      lastDimsByCanvas = new WeakMap();
      scheduleResizeCheck();
    }, 0);
  }

  function initGridRuler() {
    injectGearButton();
    injectCtxItem();
    setGridUiActive(window.gridVisible);

    if (typeof canvas !== 'undefined' && canvas) wireCanvas(canvas);

    document.addEventListener('keydown', onKeyDown);

    document.addEventListener('click', function (e) {
      if (e.target && e.target.id === 'tab-split') onTabSplitClick();
    }, true);

    var orientH = document.getElementById('orient-h');
    var orientV = document.getElementById('orient-v');
    if (orientH) orientH.addEventListener('click', onOrient);
    if (orientV) orientV.addEventListener('click', onOrient);

    setupResizeObserver();
  }

  // Faz 8: canvas-tool module loads after DOMContentLoaded → self-init on sticky cc:canvas-ready.
  if (window.cc && cc.on) cc.on('cc:canvas-ready', function () { cc.safe('canvas.tools.grid-ruler', initGridRuler); });
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initGridRuler);
  else initGridRuler();
})();

// Modular skeleton hook (Faz 8) — grid-ruler is now a canvas TOOL loader module (modules/canvas/tools/).
if (window.cc && cc.modules) cc.modules.register({ id: 'grid-ruler', parent: 'canvas.tools', title: 'Grid & ruler', mount: function () {}, unmount: function () {} });
