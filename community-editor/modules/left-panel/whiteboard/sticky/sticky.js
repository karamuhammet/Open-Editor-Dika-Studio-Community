/* Module: left-panel/whiteboard/sticky — Sticky notes — create/make/edit/dblclick.
   Part of the whiteboard group (decomposed from the 1237-line IIFE). Functions hang off the
   shared namespace WB (window.__ccWhiteboard, created by the parent); cross-module refs resolve
   through WB at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var WB = window.__ccWhiteboard;
  if (!WB) return;

  WB.setupSticky = function () {
    canvas.selection = false;
    canvas.defaultCursor = 'crosshair';

    WB._handlers['mouse:down'] = function (opt) {
      if (opt.target) return;
      var p = WB.getPointer(opt);
      WB.addStickyNote(p.x, p.y);
      setTimeout(function () { WB.setWbTool('select'); }, 0);
    };

    Object.keys(WB._handlers).forEach(function (evt) { canvas.on(evt, WB._handlers[evt]); });
  };

  WB.addStickyNote = function (x, y) {
    var note = WB._makeSticky(x, y, 'Note');
    canvas.add(note);
    canvas.setActiveObject(note);
    canvas.renderAll();
    if (typeof snap === 'function') snap();
    WB._editSticky(note);                 // start typing right away
  };

  WB._makeSticky = function (x, y, str) {
    var W = 160, H = 160, pad = 16;
    var bg = new fabric.Rect({
      left: 0, top: 0, width: W, height: H, rx: 10, ry: 10,
      fill: WB.wbStickyColor, shadow: '3px 4px 12px rgba(0,0,0,0.28)',
      _isStickyBg: true
    });
    var corner = new fabric.Polygon(
      [{ x: W - 30, y: 0 }, { x: W, y: 0 }, { x: W, y: 30 }],
      { fill: 'rgba(0,0,0,0.10)', _isStickyCorner: true }
    );
    var text = new fabric.Textbox(str || 'Note', {
      left: pad, top: pad, width: W - pad * 2,
      fontSize: 16, fontFamily: 'Arial', fill: '#333333',
      // splitByGrapheme: hard-wrap even an unbroken run (long word/URL/CJK) at the box
      // width, so the text never runs past the note's right edge.
      textAlign: 'left', splitByGrapheme: true, _isStickyText: true
    });
    return new fabric.Group([bg, corner, text], {
      left: x - W / 2, top: y - H / 2, _isSticky: true, subTargetCheck: false
    });
  };

  // Shared "edit the text inside a WB group" flow. Works for BOTH a sticky note
  // (_isSticky, text child _isStickyText) and a shape-label group (_isTextGroup, text
  // child _isGroupText): ungroup -> enter editing on the text -> regroup on exit,
  // preserving whichever marker the group carried.
  WB._editSticky = function (group) {
    if (!group || (!group._isSticky && !group._isTextGroup)) return;
    var isTextGroup = !!group._isTextGroup;
    var items = group.getObjects();
    var text = items.filter(function (o) { return o._isStickyText || o._isGroupText; })[0];
    if (!text) return;
    group._restoreObjectsState();
    canvas.remove(group);
    items.forEach(function (o) { o.set({ selectable: true, evented: true }); canvas.add(o); });
    canvas.setActiveObject(text);
    text.enterEditing();
    if (text.selectAll) text.selectAll();
    canvas.renderAll();
    text.on('editing:exited', function _regroup() {
      text.off('editing:exited', _regroup);
      items.forEach(function (o) { canvas.remove(o); });
      var props = isTextGroup ? { _isTextGroup: true, subTargetCheck: false }
                              : { _isSticky: true, subTargetCheck: false };
      var g = new fabric.Group(items, props);
      canvas.add(g);
      canvas.setActiveObject(g);
      canvas.renderAll();
      if (typeof snap === 'function') snap();
    });
  };

  // Bug 6: the Text tool clicked ON a shape -> group the shape with a wrapped Textbox
  // and start typing immediately (reusing the sticky group/edit mechanism above). On
  // finishing (editing:exited) they stay grouped as a labeled shape; double-click
  // re-edits, normal ungroup exits the group. Returns true if it labeled the shape.
  WB.addShapeLabel = function (shape) {
    if (!shape) return false;
    if (shape._isBoardLine || shape._isSticky || shape._isTextGroup) return false;
    if (shape._isPattern || shape._isGridLine || shape._isGuide || shape.excludeFromExport) return false;
    if (shape.type === 'textbox' || shape.type === 'i-text' || shape.type === 'text') return false;
    var b = shape.getBoundingRect(true, true);   // absolute scene box
    var pad = 12;
    var w = Math.max(40, b.width - pad * 2);
    var text = new fabric.Textbox('Type here', {
      width: w, fontSize: 18, fontFamily: 'Arial', fill: '#333333',
      textAlign: 'center', splitByGrapheme: true, _isGroupText: true
    });
    text.set({ left: b.left + b.width / 2 - w / 2, top: b.top + b.height / 2 - (text.height || 0) / 2 });
    canvas.remove(shape);
    var g = new fabric.Group([shape, text], { _isTextGroup: true, subTargetCheck: false });
    canvas.add(g);
    canvas.setActiveObject(g);
    canvas.renderAll();
    WB._editSticky(g);   // ungroup + start typing right away, same as a fresh sticky
    return true;
  };

  WB._stickyDblClick = function (opt) {
    if (!window.wbActive) return;
    if (opt.target && (opt.target._isSticky || opt.target._isTextGroup)) WB._editSticky(opt.target);
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'sticky', parent: 'left-panel.whiteboard', title: 'whiteboard: sticky', mount: function () {}, unmount: function () {} });
  }
})();
