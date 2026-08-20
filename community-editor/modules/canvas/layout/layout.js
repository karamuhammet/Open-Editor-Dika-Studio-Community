/* ═══════════════════════════════════════════════════════════════
   Layout Panel — Position, Size, Rotation, Alignment, Flip
   Works in both Card and Board modes
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── helpers ────────────────────────────────────────────────── */
  /* Run `fn` with the object's origin temporarily normalized to top-left so
     that reading/writing o.left & o.top means the object's true top-left
     corner (in its parent's coordinate space). Restores the original origin
     afterwards, keeping the object visually fixed. Handles center-origin
     objects without jumps. */
  function _withTopLeftOrigin(o, fn) {
    var ox = o.originX, oy = o.originY;
    if (ox === 'left' && oy === 'top') { fn(); return; }
    var tl = o.getPointByOrigin('left', 'top');
    o.set({ originX: 'left', originY: 'top' });
    o.setPositionByOrigin(tl, 'left', 'top');
    try {
      fn();
    } finally {
      // restore original origin, keeping the (possibly new) top-left fixed
      var newTl = o.getPointByOrigin('left', 'top');
      o.set({ originX: ox, originY: oy });
      o.setPositionByOrigin(newTl, 'left', 'top');
    }
  }

  function ico(paths, size) {
    size = size || 14;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' + size + '" height="' + size +
      '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      paths + '</svg>';
  }

  var ALIGN_ICONS = {
    left:   ico('<line x1="4" y1="4" x2="4" y2="20"/><rect x="8" y="6" width="12" height="4" rx="1"/><rect x="8" y="14" width="8" height="4" rx="1"/>'),
    centerH: ico('<line x1="12" y1="2" x2="12" y2="22"/><rect x="5" y="6" width="14" height="4" rx="1"/><rect x="7" y="14" width="10" height="4" rx="1"/>'),
    right:  ico('<line x1="20" y1="4" x2="20" y2="20"/><rect x="4" y="6" width="12" height="4" rx="1"/><rect x="8" y="14" width="8" height="4" rx="1"/>'),
    top:    ico('<line x1="4" y1="4" x2="20" y2="4"/><rect x="6" y="8" width="4" height="12" rx="1"/><rect x="14" y="8" width="4" height="8" rx="1"/>'),
    centerV: ico('<line x1="2" y1="12" x2="22" y2="12"/><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="7" width="4" height="10" rx="1"/>'),
    bottom: ico('<line x1="4" y1="20" x2="20" y2="20"/><rect x="6" y="4" width="4" height="12" rx="1"/><rect x="14" y="8" width="4" height="8" rx="1"/>')
  };

  var DIST_ICONS = {
    distH: ico('<line x1="4" y1="4" x2="4" y2="20"/><line x1="20" y1="4" x2="20" y2="20"/><rect x="9" y="8" width="6" height="8" rx="1"/>'),
    distV: ico('<line x1="4" y1="4" x2="20" y2="4"/><line x1="4" y1="20" x2="20" y2="20"/><rect x="8" y="9" width="8" height="6" rx="1"/>')
  };

  var FLIP_ICONS = {
    flipH: ico('<polyline points="8 7 3 12 8 17"/><polyline points="16 7 21 12 16 17"/><line x1="3" y1="12" x2="21" y2="12" stroke-dasharray="2 3"/>'),
    flipV: ico('<polyline points="7 8 12 3 17 8"/><polyline points="7 16 12 21 17 16"/><line x1="12" y1="3" x2="12" y2="21" stroke-dasharray="2 3"/>')
  };
  var CHEV = ico('<path d="m6 9 6 6 6-6"/>', 13);

  /* ── dropdown menu (Distribute / Flip) — reuses the .rpf-menu look ─ */
  function _lpMenuOutside(e) {
    var m = document.getElementById('lp-menu');
    if (m && !m.contains(e.target)) { m.classList.remove('show'); document.removeEventListener('mousedown', _lpMenuOutside, true); }
  }
  function _lpMenu(anchor, items) {
    var m = document.getElementById('lp-menu');
    if (!m) { m = document.createElement('div'); m.id = 'lp-menu'; m.className = 'rpf-menu'; document.body.appendChild(m); }
    m.innerHTML = items.map(function (it, i) { return '<button type="button" class="lp-menu-item" data-i="' + i + '">' + it.icon + '<span>' + it.label + '</span></button>'; }).join('');
    m.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        var it = items[parseInt(b.getAttribute('data-i'), 10)];
        m.classList.remove('show'); document.removeEventListener('mousedown', _lpMenuOutside, true);
        if (it && it.fn) it.fn();
      });
    });
    var r = anchor.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 180)) + 'px';
    m.style.top = (r.bottom + 5) + 'px';
    m.style.minWidth = Math.round(r.width) + 'px';
    m.classList.add('show');
    setTimeout(function () { document.addEventListener('mousedown', _lpMenuOutside, true); }, 0);
  }

  /* ── build html ─────────────────────────────────────────────── */
  window.buildLayoutPanelHTML = function () {
    return '' +
      /* ── Position & Size (rpf-field language, matches the Properties tab) ── */
      '<div class="rpf-sec">' +
        '<div class="rpf-lab">Position &amp; size</div>' +
        '<div class="rpf-two">' +
          '<div class="rpf-field"><span class="lp-k">X</span><input id="lp-x" type="number" step="1"></div>' +
          '<div class="rpf-field"><span class="lp-k">Y</span><input id="lp-y" type="number" step="1"></div>' +
        '</div>' +
        '<div class="lp-wh">' +
          '<div class="rpf-field"><span class="lp-k">W</span><input id="lp-w" type="number" step="1" min="1"></div>' +
          '<button type="button" id="lp-lock" class="lp-lock on" title="Constrain proportions">' + ico('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 12h6"/>', 14) + '</button>' +
          '<div class="rpf-field"><span class="lp-k">H</span><input id="lp-h" type="number" step="1" min="1"></div>' +
        '</div>' +
        '<div class="rpf-field lp-rot-field"><span class="lp-k">Rotation</span><input id="lp-rot" type="number" step="1"><span class="rpf-pct">°</span></div>' +
      '</div>' +

      /* ── Alignment — multi-select ONLY (single objects use the Properties toolbar; toggled in syncLayoutPanel) ── */
      '<div class="rpf-sec" id="lp-align-sec" style="display:none">' +
        '<div class="rpf-lab">Align selection</div>' +
        '<div class="rpf-align">' +
          '<div class="rpf-seg">' +
            '<button type="button" data-lp-align="left" title="Align left">' + ALIGN_ICONS.left + '</button>' +
            '<button type="button" data-lp-align="centerH" title="Align center (H)">' + ALIGN_ICONS.centerH + '</button>' +
            '<button type="button" data-lp-align="right" title="Align right">' + ALIGN_ICONS.right + '</button>' +
          '</div>' +
          '<div class="rpf-seg">' +
            '<button type="button" data-lp-align="top" title="Align top">' + ALIGN_ICONS.top + '</button>' +
            '<button type="button" data-lp-align="centerV" title="Align middle (V)">' + ALIGN_ICONS.centerV + '</button>' +
            '<button type="button" data-lp-align="bottom" title="Align bottom">' + ALIGN_ICONS.bottom + '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      /* ── Arrange — Distribute + Flip as dropdowns ── */
      '<div class="rpf-sec">' +
        '<div class="rpf-lab">Arrange</div>' +
        '<div class="rpf-two">' +
          '<button type="button" class="rpf-field rpf-bg-dd lp-dd" id="lp-dist-btn" title="Distribute (3+ selected)"><span class="rpf-ic">' + DIST_ICONS.distH + '</span><span class="rpf-val">Distribute</span><span class="rpf-ch">' + CHEV + '</span></button>' +
          '<button type="button" class="rpf-field rpf-bg-dd lp-dd" id="lp-flip-btn" title="Flip"><span class="rpf-ic">' + FLIP_ICONS.flipH + '</span><span class="rpf-val">Flip</span><span class="rpf-ch">' + CHEV + '</span></button>' +
        '</div>' +
      '</div>';
  };

  /* ── wire events ────────────────────────────────────────────── */
  window.wireLayoutPanel = function () {
    var wrap = document.getElementById('rp-layout-wrap');
    if (!wrap) return;

    var lpX   = document.getElementById('lp-x');
    var lpY   = document.getElementById('lp-y');
    var lpW   = document.getElementById('lp-w');
    var lpH   = document.getElementById('lp-h');
    var lpRot = document.getElementById('lp-rot');
    var lpLock = document.getElementById('lp-lock');
    var _locked = true;

    /* lock toggle */
    if (lpLock) lpLock.addEventListener('click', function () {
      _locked = !_locked;
      lpLock.classList.toggle('on', _locked);
    });

    function cvs() { return (typeof getActiveCanvas === 'function') ? getActiveCanvas() : canvas; }

    function applyVal(field) {
      var c = cvs();
      var obj = c.getActiveObject();
      if (!obj) return;
      var v = parseFloat(field.value);
      if (isNaN(v)) return;

      if (field === lpRot) { obj.set('angle', v); }
      else {
        // X/Y/W/H all interpret values against the object's top-left corner,
        // so normalize origin first (center-origin objects would jump otherwise)
        _withTopLeftOrigin(obj, function () {
          if (field === lpX) { obj.set('left', v); }
          else if (field === lpY) { obj.set('top', v); }
          else if (field === lpW) {
            var curW = obj.getScaledWidth();
            if (curW <= 0) return;
            var ratio = v / curW;
            obj.set('scaleX', obj.scaleX * ratio);
            if (_locked) obj.set('scaleY', obj.scaleY * ratio);
          }
          else if (field === lpH) {
            var curH = obj.getScaledHeight();
            if (curH <= 0) return;
            var ratio = v / curH;
            obj.set('scaleY', obj.scaleY * ratio);
            if (_locked) obj.set('scaleX', obj.scaleX * ratio);
          }
        });
      }

      obj.setCoords();
      c.requestRenderAll();
      if (typeof snap === 'function') snap();
    }

    [lpX, lpY, lpW, lpH, lpRot].forEach(function (el) {
      if (!el) return;
      el.addEventListener('change', function () { applyVal(el); });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { applyVal(el); el.blur(); }
      });
    });

    /* ── alignment (works for single object relative to canvas, or multi-select relative to selection) ── */
    wrap.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-lp-align]');
      if (!btn) return;
      var c = cvs();
      var obj = c.getActiveObject();
      if (!obj) return;

      var key = btn.dataset.lpAlign;
      var cw, ch;

      if (window.wbActive) {
        cw = c.getWidth();
        ch = c.getHeight();
      } else {
        cw = typeof CARD_W !== 'undefined' ? CARD_W : c.getWidth();
        ch = typeof CARD_H !== 'undefined' ? CARD_H : c.getHeight();
      }

      if (obj.type === 'activeSelection') {
        // multi-select: align within the selection's own bounding box.
        // Work in selection-relative coords where the box spans
        // [-sel.width/2, +sel.width/2] × [-sel.height/2, +sel.height/2].
        var objs = obj.getObjects();
        var halfW = obj.width / 2;
        var halfH = obj.height / 2;
        objs.forEach(function (o) {
          // normalize child origin to left/top so o.left/o.top is its real
          // top-left in selection-relative space (handles center-origin objs)
          _withTopLeftOrigin(o, function () {
            var oW = o.getScaledWidth();
            var oH = o.getScaledHeight();
            switch (key) {
              case 'left':    o.set('left', -halfW); break;
              case 'right':   o.set('left', halfW - oW); break;
              case 'centerH': o.set('left', -oW / 2); break;
              case 'top':     o.set('top', -halfH); break;
              case 'bottom':  o.set('top', halfH - oH); break;
              case 'centerV': o.set('top', -oH / 2); break;
            }
          });
          o.setCoords();
        });
      } else {
        // single object: align to canvas / card area
        _withTopLeftOrigin(obj, function () {
          var oW = obj.getScaledWidth();
          var oH = obj.getScaledHeight();
          switch (key) {
            case 'left':    obj.set('left', 0); break;
            case 'right':   obj.set('left', cw - oW); break;
            case 'centerH': obj.set('left', (cw - oW) / 2); break;
            case 'top':     obj.set('top', 0); break;
            case 'bottom':  obj.set('top', ch - oH); break;
            case 'centerV': obj.set('top', (ch - oH) / 2); break;
          }
        });
      }
      obj.setCoords();
      c.requestRenderAll();
      if (typeof snap === 'function') snap();
      syncLayoutPanel();
    });

    /* ── distribute (Arrange dropdown → Horizontal / Vertical) — needs an active-selection of 3+ ── */
    function doDistribute(key) {
      var c = cvs();
      var sel = c.getActiveObject();
      if (!sel || sel.type !== 'activeSelection') return;
      var objs = sel.getObjects().slice();
      if (objs.length < 3) return;
      // Normalize every child to a top-left origin so .left/.top are true top-left corners in
      // selection-relative space throughout the loop, then restore origins afterwards.
      var _origins = objs.map(function (o) { return { o: o, ox: o.originX, oy: o.originY }; });
      objs.forEach(function (o) {
        if (o.originX === 'left' && o.originY === 'top') return;
        var tl = o.getPointByOrigin('left', 'top');
        o.set({ originX: 'left', originY: 'top' });
        o.setPositionByOrigin(tl, 'left', 'top');
      });

      var i;
      if (key === 'distH') {
        objs.sort(function (a, b) { return a.left - b.left; });
        var firstRight = objs[0].left + objs[0].getScaledWidth();
        var lastLeft = objs[objs.length - 1].left;
        var innerW = objs.slice(1, -1).reduce(function (s, o) { return s + o.getScaledWidth(); }, 0);
        var gapH = (lastLeft - firstRight - innerW) / (objs.length - 1);
        var cx = objs[0].left;
        for (i = 1; i < objs.length - 1; i++) {
          cx += objs[i - 1].getScaledWidth() + gapH;
          objs[i].set('left', cx);
          objs[i].setCoords();
        }
      } else {
        objs.sort(function (a, b) { return a.top - b.top; });
        var firstBottom = objs[0].top + objs[0].getScaledHeight();
        var lastTop = objs[objs.length - 1].top;
        var innerH = objs.slice(1, -1).reduce(function (s, o) { return s + o.getScaledHeight(); }, 0);
        var gapV = (lastTop - firstBottom - innerH) / (objs.length - 1);
        var cy = objs[0].top;
        for (i = 1; i < objs.length - 1; i++) {
          cy += objs[i - 1].getScaledHeight() + gapV;
          objs[i].set('top', cy);
          objs[i].setCoords();
        }
      }

      _origins.forEach(function (r) {
        if (r.o.originX === r.ox && r.o.originY === r.oy) return;
        var newTl = r.o.getPointByOrigin('left', 'top');
        r.o.set({ originX: r.ox, originY: r.oy });
        r.o.setPositionByOrigin(newTl, 'left', 'top');
        r.o.setCoords();
      });
      c.requestRenderAll();
      if (typeof snap === 'function') snap();
    }

    /* ── flip (Arrange dropdown → Horizontal / Vertical) ── */
    function doFlip(axis) {
      var c = cvs();
      var obj = c.getActiveObject();
      if (!obj) return;
      if (axis === 'x') obj.set('flipX', !obj.flipX);
      else obj.set('flipY', !obj.flipY);
      c.requestRenderAll();
      if (typeof snap === 'function') snap();
    }

    var distBtn = document.getElementById('lp-dist-btn');
    if (distBtn) distBtn.addEventListener('click', function () {
      if (distBtn.disabled) return;
      _lpMenu(distBtn, [
        { icon: DIST_ICONS.distH, label: 'Horizontal', fn: function () { doDistribute('distH'); } },
        { icon: DIST_ICONS.distV, label: 'Vertical', fn: function () { doDistribute('distV'); } }
      ]);
    });
    var flipBtn = document.getElementById('lp-flip-btn');
    if (flipBtn) flipBtn.addEventListener('click', function () {
      _lpMenu(flipBtn, [
        { icon: FLIP_ICONS.flipH, label: 'Horizontal', fn: function () { doFlip('x'); } },
        { icon: FLIP_ICONS.flipV, label: 'Vertical', fn: function () { doFlip('y'); } }
      ]);
    });
  };

  /* ── sync values from active object ────────────────────────── */
  window.syncLayoutPanel = function () {
    var c = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : (typeof canvas !== 'undefined' ? canvas : null);
    if (!c) return;
    var obj = c.getActiveObject();

    // Alignment lives here ONLY for multi-select (align objects to each other); single objects
    // use the Properties toolbar's canvas-align. Distribute needs 3+ selected.
    var _isSel = !!(obj && obj.type === 'activeSelection');
    var _selCount = _isSel && obj.getObjects ? obj.getObjects().length : 0;
    var alignSec = document.getElementById('lp-align-sec');
    if (alignSec) alignSec.style.display = _isSel ? '' : 'none';
    var distBtn = document.getElementById('lp-dist-btn');
    if (distBtn) distBtn.disabled = _selCount < 3;

    var lpX   = document.getElementById('lp-x');
    var lpY   = document.getElementById('lp-y');
    var lpW   = document.getElementById('lp-w');
    var lpH   = document.getElementById('lp-h');
    var lpRot = document.getElementById('lp-rot');

    if (!obj) {
      [lpX, lpY, lpW, lpH, lpRot].forEach(function (el) { if (el) el.value = ''; });
      return;
    }

    // show the true top-left corner (center-origin objects store center in left/top)
    var _tl = (obj.originX === 'left' && obj.originY === 'top')
      ? { x: obj.left, y: obj.top }
      : obj.getPointByOrigin('left', 'top');
    if (lpX)   lpX.value   = Math.round(_tl.x);
    if (lpY)   lpY.value   = Math.round(_tl.y);
    if (lpW)   lpW.value   = Math.round(obj.getScaledWidth());
    if (lpH)   lpH.value   = Math.round(obj.getScaledHeight());
    if (lpRot) lpRot.value = Math.round(obj.angle || 0);
  };

  /* ── keep layout panel in sync while moving/scaling/rotating ── */
  function hookCanvasEvents(c) {
    if (!c || c._layoutHooked) return;
    c._layoutHooked = true;
    ['object:moving', 'object:scaling', 'object:rotating', 'object:modified'].forEach(function (evt) {
      c.on(evt, function () {
        var wrap = document.getElementById('rp-layout-wrap');
        if (wrap && wrap.style.display !== 'none') syncLayoutPanel();
      });
    });
  }

  /* Hook onto canvas once it's ready (retry until canvas exists) */
  var _hookTimer = setInterval(function () {
    if (typeof canvas !== 'undefined' && canvas) {
      hookCanvasEvents(canvas);
      clearInterval(_hookTimer);
    }
  }, 200);

  /* Also hook artboard canvases when they appear. M-M4: the old strong Set
     retained EVERY canvas ever active for the app's lifetime (the 1s poller
     never stops); hookCanvasEvents already dedupes via c._layoutHooked, so no
     side table is needed at all — disposed canvases stay collectable. */
  setInterval(function () {
    if (typeof getActiveCanvas === 'function') {
      var c = getActiveCanvas();
      if (c && !c._layoutHooked) hookCanvasEvents(c);
    }
  }, 1000);

})();

// Modular skeleton hook (Faz 8) — layout is now a canvas subsystem loader module (modules/canvas/).
if (window.cc && cc.modules) cc.modules.register({ id: 'layout', parent: 'canvas', title: 'Layout panel', mount: function () {}, unmount: function () {} });
