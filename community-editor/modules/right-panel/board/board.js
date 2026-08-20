/* Sub-module: right-panel/board — whiteboard property panel (Faz 6b-2, first sub-module).
   Owns syncBoardPanel (board object → #p-board-* inputs), initBoardPropertyBindings (wire
   those inputs) + updateWbNameLabel. Self-inits its bindings on the sticky cc:canvas-ready
   event INSIDE cc.safe → if this section throws, the parent right-panel + sibling sections
   keep working. The parent delegates board sync to window.syncBoardPanel (also via cc.safe).
   Shared helper toHex + generic bindings stay in the parent. */
function syncBoardPanel(obj) {
  if (!obj) return;
  var stroke = obj.stroke || (obj._objects && obj._objects[0] ? obj._objects[0].stroke : '') || '#ffffff';
  var fill = '#f2ff58';
  if (obj.type === 'group' && obj._objects && obj._objects.length) {
    fill = typeof obj._objects[0].fill === 'string' ? obj._objects[0].fill : '#f2ff58';
  } else if (typeof obj.fill === 'string') {
    fill = obj.fill;
  }
  var sw = obj.strokeWidth || (obj._objects && obj._objects[0] ? obj._objects[0].strokeWidth : 0) || 0;
  var dash = 'solid';
  var d = obj.strokeDashArray || [];
  if (d.length === 2 && d[0] >= 5) dash = 'dashed';
  if (d.length === 2 && d[0] <= 3) dash = 'dotted';
  var rx = obj.rx || 0;
  var op = Math.round((obj.opacity == null ? 1 : obj.opacity) * 100);

  var el;
  el = document.getElementById('p-wb-name');    if (el) el.value = obj._wbName || '';
  el = document.getElementById('p-wb-stroke');  if (el) el.value = toHex(stroke);
  el = document.getElementById('p-wb-fill');    if (el) el.value = toHex(fill === 'transparent' ? '#000000' : fill);
  el = document.getElementById('p-wb-strokew'); if (el) el.value = sw;
  el = document.getElementById('p-wb-dash');    if (el) el.value = dash;
  el = document.getElementById('p-wb-radius');  if (el) el.value = rx;
  el = document.getElementById('p-wb-op');      if (el) el.value = op;
  el = document.getElementById('p-wb-op-val');  if (el) el.textContent = op + '%';

  var linkSel = document.getElementById('p-wb-link');
  if (linkSel && typeof pages !== 'undefined') {
    var curr = obj._wbLink || '';
    linkSel.innerHTML = '<option value="">None</option>';
    pages.forEach(function (pg, i) {
      var opt = document.createElement('option');
      opt.value = '' + i;
      opt.textContent = pg.label || ('Page ' + (i + 1));
      if ('' + i === curr) opt.selected = true;
      linkSel.appendChild(opt);
    });
  }
}

function initBoardPropertyBindings() {
  function getObj() { return canvas.getActiveObject(); }

  var nameEl = document.getElementById('p-wb-name');
  if (nameEl) nameEl.addEventListener('input', function () {
    var o = getObj(); if (!o) return;
    o._wbName = nameEl.value;
    updateWbNameLabel(o);
    canvas.renderAll();
  });

  var strokeEl = document.getElementById('p-wb-stroke');
  if (strokeEl) strokeEl.addEventListener('input', function () {
    var o = getObj(); if (!o) return;
    if (o.type === 'group' && o._objects) {
      o._objects.forEach(function (c) { c.set('stroke', strokeEl.value); });
    } else { o.set('stroke', strokeEl.value); }
    canvas.renderAll(); snap();
  });

  var fillEl = document.getElementById('p-wb-fill');
  if (fillEl) fillEl.addEventListener('input', function () {
    var o = getObj(); if (!o) return;
    if (o.type === 'group' && o._objects) {
      o._objects.forEach(function (c) { c.set('fill', fillEl.value); });
    } else { o.set('fill', fillEl.value); }
    canvas.renderAll(); snap();
  });

  var swEl = document.getElementById('p-wb-strokew');
  if (swEl) swEl.addEventListener('input', function () {
    var o = getObj(); if (!o) return;
    var v = parseInt(swEl.value, 10) || 0;
    if (o.type === 'group' && o._objects) {
      o._objects.forEach(function (c) { c.set('strokeWidth', v); });
    } else { o.set('strokeWidth', v); }
    canvas.renderAll(); snap();
  });

  var dashEl = document.getElementById('p-wb-dash');
  if (dashEl) dashEl.addEventListener('change', function () {
    var o = getObj(); if (!o) return;
    var arr = [];
    if (dashEl.value === 'dashed') arr = [8, 4];
    else if (dashEl.value === 'dotted') arr = [2, 4];
    if (o.type === 'group' && o._objects) {
      o._objects.forEach(function (c) { c.set('strokeDashArray', arr.length ? arr : null); });
    } else { o.set('strokeDashArray', arr.length ? arr : null); }
    canvas.renderAll(); snap();
  });

  var radiusEl = document.getElementById('p-wb-radius');
  if (radiusEl) radiusEl.addEventListener('input', function () {
    var o = getObj(); if (!o) return;
    var v = parseInt(radiusEl.value, 10) || 0;
    o.set({ rx: v, ry: v }); canvas.renderAll(); snap();
  });

  var opEl = document.getElementById('p-wb-op');
  var opValEl = document.getElementById('p-wb-op-val');
  if (opEl) opEl.addEventListener('input', function () {
    var o = getObj(); if (!o) return;
    var v = parseInt(opEl.value, 10);
    o.set('opacity', v / 100);
    if (opValEl) opValEl.textContent = v + '%';
    canvas.renderAll(); snap();
  });

  var linkSel = document.getElementById('p-wb-link');
  if (linkSel) linkSel.addEventListener('change', function () {
    var o = getObj(); if (!o) return;
    o._wbLink = linkSel.value || '';
    canvas.renderAll();
  });

  var linkSearch = document.getElementById('p-wb-link-search');
  if (linkSearch && linkSel) {
    linkSearch.addEventListener('input', function () {
      var q = linkSearch.value.toLowerCase();
      var opts = linkSel.querySelectorAll('option');
      opts.forEach(function (opt) {
        if (!opt.value) { opt.style.display = ''; return; }
        opt.style.display = opt.textContent.toLowerCase().indexOf(q) >= 0 ? '' : 'none';
      });
    });
  }

  var btnFront = document.getElementById('p-wb-to-front');
  if (btnFront) btnFront.onclick = function () { var o = getObj(); if (o) { canvas.bringToFront(o); canvas.renderAll(); snap(); } };
  var btnFwd = document.getElementById('p-wb-forward');
  if (btnFwd) btnFwd.onclick = function () { var o = getObj(); if (o) { canvas.bringForward(o); canvas.renderAll(); snap(); } };
  var btnBwd = document.getElementById('p-wb-backward');
  if (btnBwd) btnBwd.onclick = function () { var o = getObj(); if (o) { canvas.sendBackwards(o); canvas.renderAll(); snap(); } };
  var btnBack = document.getElementById('p-wb-to-back');
  if (btnBack) btnBack.onclick = function () { var o = getObj(); if (o) { canvas.sendToBack(o); canvas.renderAll(); snap(); } };

  canvas.on('mouse:dblclick', function (opt) {
    if (!opt.target) return;
    // Double-click audio object → play/pause
    if (opt.target._isAudioMedia && opt.target._audioSrc) {
      _ccToggleAudioPlayback(opt.target);
      return;
    }
    if (!window.wbActive) return;
    if (opt.target._wbLink) {
      var idx = parseInt(opt.target._wbLink, 10);
      if (!isNaN(idx) && typeof switchPage === 'function') switchPage(idx);
    }
  });

  canvas.on('object:moving', function (opt) {
    if (!window.wbActive || !opt.target || !opt.target._wbName) return;
    updateWbNameLabel(opt.target);
  });
  canvas.on('object:scaling', function (opt) {
    if (!window.wbActive || !opt.target || !opt.target._wbName) return;
    updateWbNameLabel(opt.target);
  });
  canvas.on('object:rotating', function (opt) {
    if (!window.wbActive || !opt.target || !opt.target._wbName) return;
    updateWbNameLabel(opt.target);
  });
}

function updateWbNameLabel(obj) {
  if (!obj) return;
  var existing = null;
  canvas.getObjects().forEach(function (o) {
    if (o._isWbLabel && o._wbLabelFor === obj) existing = o;
  });
  if (!obj._wbName) {
    if (existing) canvas.remove(existing);
    return;
  }
  var b = obj.getBoundingRect();
  if (existing) {
    existing.set({ text: obj._wbName, left: b.left + 2, top: b.top - 14 });
  } else {
    var lbl = new fabric.Text(obj._wbName, {
      left: b.left + 2, top: b.top - 14,
      fontSize: 10, fontFamily: 'DM Sans, sans-serif',
      fill: 'rgba(255,255,255,0.5)',
      selectable: false, evented: false,
      _isWbLabel: true, _wbLabelFor: obj
    });
    canvas.add(lbl);
  }
}

// Self-init this section's bindings when the app signals canvas-ready (sticky → fires even if
// this child module loads after the event). Wrapped so a board-binding failure is isolated.
if (window.cc && cc.on) {
  cc.on('cc:canvas-ready', function () {
    cc.safe('right-panel.board.init', function () {
      if (typeof initBoardPropertyBindings === 'function') initBoardPropertyBindings();
    });
  });
}
if (window.cc && cc.modules) {
  cc.modules.register({ id: 'board', parent: 'right-panel', title: 'Board props', mount: function () {}, unmount: function () {} });
}
