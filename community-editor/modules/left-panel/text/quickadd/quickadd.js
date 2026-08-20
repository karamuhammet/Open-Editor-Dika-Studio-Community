/* ═══════════════════════════════════════════════════════════
   Sub-module: left-panel/text/quickadd — "Add a text box / subheading"
   buttons + the T text tool (click canvas to add/edit text inline).
   Wires #txp-add-text, #tool-subheading. Depends on cc.*.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (!window.cc || !cc.modules) { console.warn('[text.quickadd] cc skeleton missing'); return; }

  function _cv() { return (window.cc && cc.rawCanvas) ? cc.rawCanvas() : (typeof canvas !== 'undefined' ? canvas : null); }
  function _scale() { return (window.cc && cc.scale) ? cc.scale() : 1; }
  function _isTextObj(o) { return o && (o.type === 'i-text' || o.type === 'textbox' || o.type === 'text'); }

  function _addPlainTextBox() {
    if (typeof fabric === 'undefined') return;
    var s = _scale();
    var tb = new fabric.Textbox('Your text here', {
      fontFamily: 'DM Sans', fontSize: Math.round(20 * s), fill: '#ffffff', width: Math.round(220 * s), textAlign: 'left'
    });
    try { tb.set('width', Math.max(60, Math.ceil(tb.calcTextWidth()) + 8)); } catch (e) {}
    cc.addToCenter(tb);
    try { var c = _cv(); if (c) { c.setActiveObject(tb); tb.enterEditing && tb.enterEditing(); tb.selectAll && tb.selectAll(); c.requestRenderAll(); } } catch (e) {}
  }

  function _addSubheading() {
    if (typeof fabric === 'undefined') return;
    var s = _scale();
    var tb = new fabric.Textbox('Subheading', { fontFamily: 'DM Sans', fontSize: Math.round(20 * s), fontWeight: '600', fill: '#ffffff', width: Math.round(240 * s) });
    try { tb.set('width', Math.max(60, Math.ceil(tb.calcTextWidth()) + 8)); } catch (e) {}
    cc.addToCenter(tb);
  }

  // ── Text tool (T key): click the canvas to add/edit text inline ──
  var _textToolOn = false, _textToolBound = false;
  function _setTextToolCursor(on) {
    var c = _cv();
    if (c) { c.defaultCursor = on ? 'text' : 'default'; c.hoverCursor = on ? 'text' : 'move'; }
  }
  function activateTextTool() {
    var c = _cv();
    if (!c) return;
    _bindTextTool();
    _textToolOn = true;
    _setTextToolCursor(true);
    c.discardActiveObject();
    c.requestRenderAll();
    cc.toast('Text tool — click the canvas to add text, or click a text to edit');
  }
  function _deactivateTextTool() { _textToolOn = false; _setTextToolCursor(false); }
  function _enterEdit(t) { setTimeout(function () { if (t.enterEditing) t.enterEditing(); if (t.selectAll) t.selectAll(); var c = _cv(); if (c) c.requestRenderAll(); }, 0); }
  function _textToolDown(opt) {
    if (!_textToolOn) return;
    var c = _cv(); if (!c) return;
    var target = opt.target, p = c.getPointer(opt.e);
    _deactivateTextTool();
    if (target && _isTextObj(target)) {            // single-click an existing text → edit it
      c.setActiveObject(target);
      _enterEdit(target);
      return;
    }
    var s = _scale();                              // empty/other → new empty text
    var t = new fabric.IText('', { left: p.x, top: p.y, originX: 'left', originY: 'top', fontFamily: 'DM Sans', fontSize: Math.round(24 * s), fill: '#ffffff' });
    t._txpFresh = true;
    c.add(t);
    c.setActiveObject(t);
    _enterEdit(t);
  }
  function _textToolExit(opt) {
    var t = opt && opt.target;
    if (t && t._txpFresh) { t._txpFresh = false; var c = _cv(); if ((!t.text || !t.text.trim()) && c) { c.remove(t); c.requestRenderAll(); } }
  }
  function _bindTextTool() {
    var c = _cv();
    if (_textToolBound || !c) return;
    _textToolBound = true;
    c.on('mouse:down', _textToolDown);
    c.on('text:editing:exited', _textToolExit);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && _textToolOn) _deactivateTextTool(); });
  }

  var _mounted = false;
  function mount() {
    if (_mounted) return; _mounted = true;
    var addBtn = document.getElementById('txp-add-text');
    if (addBtn) addBtn.addEventListener('click', _addPlainTextBox);
    var subBtn = document.getElementById('tool-subheading');
    if (subBtn) subBtn.addEventListener('click', _addSubheading);
    _bindTextTool();
  }

  window.activateTextTool = activateTextTool;

  cc.modules.register({ id: 'quickadd', parent: 'left-panel.text', title: 'Quick add', mount: mount, unmount: function () {} });
})();
