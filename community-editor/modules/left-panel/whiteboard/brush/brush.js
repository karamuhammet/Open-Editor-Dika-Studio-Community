/* Module: left-panel/whiteboard/brush — Brush colour + the hover settings popover.
   Part of the whiteboard group (decomposed from the 1237-line IIFE). Functions hang off the
   shared namespace WB (window.__ccWhiteboard, created by the parent); cross-module refs resolve
   through WB at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var WB = window.__ccWhiteboard;
  if (!WB) return;

  WB._setBrushColor = function (c) {
    WB._brushColor = c;
    if (canvas.freeDrawingBrush) canvas.freeDrawingBrush.color = c;
    if (WB._brushPopover) { var b = WB._brushPopover.querySelector('.wb-bp-custom'); if (b) b.style.background = c; }
  };

  WB._openBrushColorPicker = function () {
    if (typeof window.openColorPanel !== 'function') return;
    var rp = document.querySelector('.rpanel');
    if (rp) {
      WB._wbRpWasCollapsed = rp.classList.contains('rp-collapsed');
      rp.classList.remove('wb-hidden');     // board hides it
      rp.classList.remove('rp-collapsed');  // and it may be collapsed (width 1px)
      document.body.classList.remove('rp-panel-collapsed');
    }
    WB._wbBrushPickerOpen = true;
    if (WB._brushPopover) WB._brushPopover.style.display = 'none';
    window.openColorPanel('wbBrush', WB._brushColor);
    if (window.closeColorPanel && !window.closeColorPanel._wbWrapped) {
      var orig = window.closeColorPanel;
      window.closeColorPanel = function () {
        orig.apply(this, arguments);
        if (WB._wbBrushPickerOpen && window.wbActive) {
          WB._wbBrushPickerOpen = false;
          var rp2 = document.querySelector('.rpanel');
          if (rp2) {                          // restore the board's hidden/collapsed panel
            rp2.classList.add('wb-hidden');
            if (WB._wbRpWasCollapsed) { rp2.classList.add('rp-collapsed'); document.body.classList.add('rp-panel-collapsed'); }
          }
        }
      };
      window.closeColorPanel._wbWrapped = true;
    }
  };

  WB._ensureBrushPopover = function () {
    if (WB._brushPopover) return WB._brushPopover;
    var pop = document.createElement('div');
    pop.id = 'wb-brush-pop';
    pop.innerHTML =
      '<div class="wb-bp-row"><span class="wb-bp-lbl">Size</span>' +
        '<input type="range" min="1" max="40" value="' + WB._brushSize + '" class="wb-bp-size">' +
        '<span class="wb-bp-size-val">' + WB._brushSize + '</span></div>' +
      '<div class="wb-bp-row"><span class="wb-bp-lbl">Color</span>' +
        '<span class="wb-bp-swatches"></span>' +
        '<button type="button" class="wb-bp-custom" title="Custom color — open palette" style="background:' + WB._brushColor + '"></button></div>';
    var sw = pop.querySelector('.wb-bp-swatches');
    ['#ffffff', '#111111', '#ff5722', '#f2ff58', '#4caf50', '#2196f3', '#ffeb3b'].forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'wb-bp-sw'; b.style.background = c; b.title = c;
      b.onclick = function () { WB._setBrushColor(c); var ci = pop.querySelector('.wb-bp-color'); if (ci) ci.value = c; };
      sw.appendChild(b);
    });
    var sizeR = pop.querySelector('.wb-bp-size'), sizeV = pop.querySelector('.wb-bp-size-val');
    sizeR.addEventListener('input', function () {
      WB._brushSize = parseInt(this.value, 10) || 3;
      sizeV.textContent = WB._brushSize;
      if (canvas.freeDrawingBrush) canvas.freeDrawingBrush.width = WB._brushSize;
    });
    pop.querySelector('.wb-bp-custom').addEventListener('click', WB._openBrushColorPicker);
    pop.addEventListener('mouseenter', function () { if (WB._brushPopTimer) clearTimeout(WB._brushPopTimer); });
    pop.addEventListener('mouseleave', WB._hideBrushPopoverSoon);
    document.body.appendChild(pop);
    WB._brushPopover = pop;
    return pop;
  };

  WB._showBrushPopover = function (btn) {
    if (WB._brushPopTimer) clearTimeout(WB._brushPopTimer);
    var pop = WB._ensureBrushPopover();
    pop.style.display = 'block';
    var r = btn.getBoundingClientRect();
    var pw = pop.offsetWidth, ph = pop.offsetHeight;
    pop.style.left = Math.max(6, Math.min(window.innerWidth - pw - 6, r.left + r.width / 2 - pw / 2)) + 'px';
    pop.style.top = (r.top - ph - 8) + 'px';
  };

  WB._hideBrushPopoverSoon = function () {
    if (WB._brushPopTimer) clearTimeout(WB._brushPopTimer);
    WB._brushPopTimer = setTimeout(function () { if (WB._brushPopover) WB._brushPopover.style.display = 'none'; }, 220);
  };

  WB._destroyBrushPopover = function () {
    if (WB._brushPopTimer) { clearTimeout(WB._brushPopTimer); WB._brushPopTimer = null; }
    if (WB._brushPopover) { WB._brushPopover.remove(); WB._brushPopover = null; }
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'brush', parent: 'left-panel.whiteboard', title: 'whiteboard: brush', mount: function () {}, unmount: function () {} });
  }
})();
