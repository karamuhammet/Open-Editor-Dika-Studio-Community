/* Module: canvas/tools/brush-tool/bar — Floating brush toolbar.
   Part of the brush-tool group (decomposed from the 1532-line IIFE). Functions hang off the
   shared namespace BT (window.__ccBrushTool, created by the parent); cross-module refs resolve
   through BT at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var BT = window.__ccBrushTool;
  if (!BT) return;

  BT._showFloatingBar = function () {
    if (BT._floatBar) { BT._floatBar.style.display = 'flex'; BT._updateBarState(); return; }

    var bar = document.createElement('div');
    bar.className = 'brush-float-bar';
    bar.id = 'brush-float-bar';

    /* ── Icon ── */
    bar.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>';

    /* ── Brush type selector ── */
    var typeWrap = document.createElement('div');
    typeWrap.className = 'bf-type-wrap';
    var types = [
      { id: 'normal', label: 'Normal' },
      { id: 'oil',    label: 'Oil' },
      { id: 'watercolor', label: 'Water' }
    ];
    types.forEach(function (t) {
      var btn = document.createElement('button');
      btn.className = 'bf-type-btn' + (BT._cfg.brushType === t.id ? ' active' : '');
      btn.dataset.type = t.id;
      btn.textContent = t.label;
      btn.onclick = function () {
        BT._cfg.brushType = t.id;
        typeWrap.querySelectorAll('.bf-type-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
      };
      typeWrap.appendChild(btn);
    });
    bar.appendChild(typeWrap);
    bar.appendChild(BT._mkDiv());

    /* ── Sliders ── */
    bar.appendChild(BT._mkSlider('Size', 'size', 1, 200, 'px'));
    bar.appendChild(BT._mkSlider('Hard', 'hardness', 0, 100, '%'));
    bar.appendChild(BT._mkSlider('Opa',  'opacity',  1, 100, '%'));
    bar.appendChild(BT._mkSlider('Flow', 'flow',     1, 100, '%'));
    bar.appendChild(BT._mkDiv());

    /* ── Color ── */
    var colorInp = document.createElement('input');
    colorInp.type = 'color';
    colorInp.className = 'bf-color';
    colorInp.value = BT._cfg.color;
    colorInp.title = 'Brush Color';
    colorInp.addEventListener('input', function () { BT._cfg.color = this.value; });
    bar.appendChild(colorInp);
    bar.appendChild(BT._mkDiv());

    /* ── Action buttons ── */
    var btnSel = document.createElement('button');
    btnSel.id = 'bf-btn-to-selection';
    btnSel.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" stroke-dasharray="4 2"/></svg> To Selection';
    btnSel.onclick = function () { BT._doConvertToSelection(); };
    bar.appendChild(btnSel);

    var btnShape = document.createElement('button');
    btnShape.id = 'bf-btn-to-shape';
    btnShape.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/></svg> To Shape';
    btnShape.onclick = function () { BT._doConvertToShape(); };
    bar.appendChild(btnShape);

    var btnSave = document.createElement('button');
    btnSave.id = 'bf-btn-save-paint';
    btnSave.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save';
    btnSave.title = 'Save paint as image on canvas';
    btnSave.onclick = function () { BT._doSavePaintAsImage(); };
    bar.appendChild(btnSave);

    var btnClear = document.createElement('button');
    btnClear.id = 'bf-btn-clear';
    btnClear.textContent = 'Clear';
    btnClear.onclick = function () { BT._doClear(); };
    bar.appendChild(btnClear);

    var btnExit = document.createElement('button');
    btnExit.className = 'bf-exit';
    btnExit.textContent = '✕';
    btnExit.title = 'Exit Paint Mode';
    btnExit.onclick = function () { BT.deactivateBrushTool(); };
    bar.appendChild(btnExit);

    document.body.appendChild(bar);
    BT._floatBar = bar;
    BT._updateBarState();
  };

  BT._hideFloatingBar = function () {
    if (BT._floatBar) BT._floatBar.style.display = 'none';
  };

  BT._updateBarState = function () {
    if (!BT._floatBar) return;
    var btnSel   = document.getElementById('bf-btn-to-selection');
    var btnShape = document.getElementById('bf-btn-to-shape');
    if (btnSel)   btnSel.disabled   = (BT._phase !== BT.PHASE_PAINT || !BT._hasPaint());
    if (btnShape) btnShape.disabled = (BT._phase !== BT.PHASE_SELECTION || !window._paintSelection);
    var btnSave = document.getElementById('bf-btn-save-paint');
    if (btnSave)  btnSave.disabled  = !BT._hasPaint();
  };

  BT._mkDiv = function () {
    var d = document.createElement('div');
    d.className = 'bf-divider';
    return d;
  };

  BT._mkSlider = function (label, key, min, max, unit) {
    var wrap = document.createElement('div');
    wrap.className = 'bf-slider-wrap';
    var lbl = document.createElement('span');
    lbl.className = 'bf-slider-label';
    lbl.textContent = label;
    wrap.appendChild(lbl);

    var inp = document.createElement('input');
    inp.type = 'range'; inp.className = 'bf-slider';
    inp.min = min; inp.max = max; inp.value = BT._cfg[key];

    var val = document.createElement('span');
    val.className = 'bf-slider-val';
    val.textContent = BT._cfg[key] + unit;

    inp.addEventListener('input', function () {
      BT._cfg[key] = parseInt(this.value, 10);
      val.textContent = BT._cfg[key] + unit;
    });
    wrap.appendChild(inp);
    wrap.appendChild(val);
    return wrap;
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'bar', parent: 'canvas.tools.brush-tool', title: 'brush-tool: bar', mount: function () {}, unmount: function () {} });
  }
})();
