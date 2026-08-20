/* ============================================================
   dika studio core — document QUERY API (Faz 7, enterprise backbone).

   The READ half of the AI/MCP bridge (cc.actions is the WRITE half). Token-efficient,
   serializable views of the canvas so the AI/MCP can reason about the current state BEFORE
   choosing an action — read scene → pick action from cc.actions.list() → cc.actions.run().
   No mutation. An MCP server exposes cc.query.scene()/selection()/summary() as resources.
   ============================================================ */
(function (global) {
  'use strict';
  var cc = global.cc || (global.cc = {});

  function activeCanvas() { return (typeof getActiveCanvas === 'function') ? getActiveCanvas() : global.canvas; }
  function round(n) { return (typeof n === 'number') ? Math.round(n) : n; }

  // Skip non-content helpers (grid lines, smart guides, crop/perspective overlays, paint cursors).
  function isContent(o) {
    return o && !o._isGridLine && !o.isSmartGuide && !o._isGuide && !o._isCropDim && !o._isCropGrid &&
      !o._isCropRect && !o._isSelPreview && !o._isPerspHandle && !o._isPerspOutline && !o._isPaintOverlay &&
      !o._isPaintCursor && !o._isWbLabel;
  }

  // A compact, AI-friendly description of one object (NOT the full fabric JSON).
  function describe(o, i) {
    var d = {
      index: i, type: o.type,
      opacity: round((o.opacity == null ? 1 : o.opacity) * 100) / 100,
      x: round(o.left), y: round(o.top),
      w: round(o.getScaledWidth ? o.getScaledWidth() : o.width),
      h: round(o.getScaledHeight ? o.getScaledHeight() : o.height)
    };
    if (o.angle) d.angle = round(o.angle);
    if (/text|textbox/i.test(o.type)) { d.kind = 'text'; d.text = o.text; d.fontSize = round(o.fontSize); d.fontFamily = o.fontFamily; d.fill = typeof o.fill === 'string' ? o.fill : 'gradient'; }
    else if (o.type === 'image') { d.kind = o.isQR ? 'qr' : (o._isChart ? 'chart' : (o._isEffect ? 'blur' : 'image')); if (o.isQR && o.qrUrl) d.qrUrl = o.qrUrl; if (o._isEffect) d.blurPreset = o._fxPreset; }
    else { d.kind = 'shape'; d.fill = typeof o.fill === 'string' ? o.fill : 'gradient'; if (o.stroke) d.stroke = o.stroke; }
    if (o._fieldRole) d.fieldRole = o._fieldRole;
    if (o._dfField) d.designField = o._dfField;
    return d;
  }

  function scene() {
    var c = activeCanvas();
    if (!c) return { ok: false, error: 'no canvas', objects: [] };
    var objs = c.getObjects().filter(isContent);
    return {
      ok: true,
      canvas: { width: round(c.getWidth()), height: round(c.getHeight()) },
      page: (typeof currentPageIndex !== 'undefined' ? currentPageIndex + 1 : 1),
      pageCount: (typeof pages !== 'undefined' && pages && pages.length) ? pages.length : 1,
      count: objs.length,
      objects: objs.map(describe)
    };
  }

  function selection() {
    var c = activeCanvas(); if (!c) return null;
    var o = c.getActiveObject(); if (!o) return null;
    if (o.type === 'activeSelection' && o._objects) {
      return { type: 'multi', count: o._objects.length, objects: o._objects.map(describe) };
    }
    return describe(o, c.getObjects().filter(isContent).indexOf(o));
  }

  // One-line human/AI summary, e.g. "Page 1 (1000×1000): 3 text, 1 shape, 1 qr".
  function summary() {
    var s = scene();
    if (!s.ok) return 'No canvas.';
    var by = {};
    s.objects.forEach(function (o) { by[o.kind] = (by[o.kind] || 0) + 1; });
    var parts = Object.keys(by).map(function (k) { return by[k] + ' ' + k; });
    return 'Page ' + s.page + ' (' + s.canvas.width + '×' + s.canvas.height + '): ' +
      (parts.length ? parts.join(', ') : 'empty');
  }

  cc.query = { scene: scene, selection: selection, summary: summary, describe: describe };
  global.cc = cc;
})(window);
