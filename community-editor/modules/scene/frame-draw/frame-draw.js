/* Module: scene/frame-draw — the Frame tool's DRAW interaction (T2). When the toolbar's Frame tool is
   active (__scTool === 'frame'), click-drag on the canvas rubber-bands a new artboard, Figma-style:
   a live dashed preview follows the cursor → on mouse:up we create the frame via _scAddFrame at the
   drawn WORLD rect. A tiny drag (< MIN_DRAG screen px) is treated as a click and drops a default 1080²
   frame centred on the point. Holding Alt keeps the Frame tool armed to draw again; otherwise we snap
   back to Move. Scene-only — every handler bails unless the Frame tool is active. See toolbar plan §3.2. */
(function (global) {
  'use strict';
  var SC = global.__ccSceneEditor;
  if (!SC) return;

  var MIN_DRAG = 12;           // screen px under which a click → a default-size frame
  var DEFAULT = 1080;
  var _drawing = false, _sx = 0, _sy = 0, _preview = null, _ready = false;

  function _isFrameTool() { return !!(SC._active && global.__scTool === 'frame'); }

  function _makePreview(x, y) {
    var z = (global.canvas && canvas.getZoom && canvas.getZoom()) || 1;
    _preview = new fabric.Rect({
      left: x, top: y, width: 1, height: 1, originX: 'left', originY: 'top',
      fill: 'rgba(242, 255, 88,0.07)', stroke: '#f2ff58', strokeWidth: 1.5 / z,
      strokeDashArray: [6 / z, 4 / z], strokeUniform: true,
      selectable: false, evented: false, excludeFromExport: true, _scPreview: true
    });
    canvas.add(_preview);
  }
  function _updatePreview(ex, ey) {
    if (!_preview) return;
    _preview.set({ left: Math.min(_sx, ex), top: Math.min(_sy, ey), width: Math.max(1, Math.abs(ex - _sx)), height: Math.max(1, Math.abs(ey - _sy)) });
    _preview.setCoords();
    canvas.requestRenderAll();
  }
  function _killPreview() { if (_preview) { canvas.remove(_preview); _preview = null; } canvas.requestRenderAll(); }
  function _abort() { _drawing = false; _killPreview(); }

  global._scInitFrameDraw = function () {
    if (_ready || !global.canvas) return;
    _ready = true;
    var c = global.canvas;

    c.on('mouse:down', function (opt) {
      if (!_isFrameTool() || _drawing) return;
      var p = c.getPointer(opt.e);           // world coords (viewport-inverted)
      _drawing = true; _sx = p.x; _sy = p.y;
      _makePreview(_sx, _sy);
      if (opt.e && opt.e.preventDefault) opt.e.preventDefault();
    });
    c.on('mouse:move', function (opt) {
      if (!_drawing) return;
      if (!_isFrameTool()) { _abort(); return; }
      var p = c.getPointer(opt.e);
      _updatePreview(p.x, p.y);
    });
    c.on('mouse:up', function (opt) {
      if (!_drawing) return;
      _drawing = false;
      var wasFrameTool = _isFrameTool();
      var p = c.getPointer(opt.e), z = (c.getZoom && c.getZoom()) || 1;
      _killPreview();
      if (!wasFrameTool) return;
      var dxs = Math.abs(p.x - _sx) * z, dys = Math.abs(p.y - _sy) * z;
      var x, y, w, h;
      if (Math.max(dxs, dys) < MIN_DRAG) {   // a click → a default frame centred on the point
        w = DEFAULT; h = DEFAULT; x = _sx - w / 2; y = _sy - h / 2;
      } else {
        x = Math.min(_sx, p.x); y = Math.min(_sy, p.y); w = Math.abs(p.x - _sx); h = Math.abs(p.y - _sy);
      }
      if (typeof _scAddFrame === 'function') _scAddFrame(Math.round(x), Math.round(y), Math.round(w), Math.round(h), {});
      var alt = !!(opt.e && opt.e.altKey);
      if (!alt && typeof _scSetTool === 'function') _scSetTool('move');   // snap to Move (Alt keeps drawing)
    });
  };

  if (global.cc && cc.on) {
    cc.on('scene:active', function (on) { if (on) global._scInitFrameDraw(); else _abort(); });
  }
  if (global.cc && cc.modules) {
    cc.modules.register({ id: 'frame-draw', parent: 'scene', title: 'scene: frame-draw', mount: function () {}, unmount: function () {} });
  }
})(window);
