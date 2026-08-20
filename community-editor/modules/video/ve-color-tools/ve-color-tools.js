/* Module: video/ve-color-tools — THE FLOATING COLOUR TOOLBAR.

   Owner 2026-07-17: "ben ekranda nerede çizgi çekeceğim, LUT browser'ı açtığımda tool menüsü yok",
   "yüzen harici tool menüsü geliştir istediğimiz yere çekip koyalım".

   Local grading is a CANVAS activity: you draw a shape on the picture, so its tools belong over the
   picture, draggable, not buried in a properties tab. That is why the Power Windows list was taken
   OUT of the inspector and lives here.

   This is the tool palette only. The windows themselves (data, render, canvas shapes) are
   VEPowerWindows; the grade per window is the LUT browser. This file owns no grading logic. */
(function () {
  'use strict';

  var _p = null, _disposers = [];
  var TOOL = 'select';
  var _docked = false;
  try { _docked = localStorage.getItem('cc.float.colortools.docked') === '1'; } catch (e) {}

  function _VE() { return window.__ccVideoEditor; }
  function _PW() { return window.VEPowerWindows; }
  function _isPopped() { return !!(window.VEFloat && _p && VEFloat.isPopped(_p)); }

  function _icon(n, s) {
    var VE = _VE();
    if (VE && VE._veIcon) return VE._veIcon(n, s || 15);
    if (typeof getIcon === 'function') return getIcon(n, s || 15) || '';
    return '';
  }

  /* The selected clip is the one being graded. Without one there is nothing to draw a window on, so
     the toolbar says so rather than silently doing nothing when a tool is clicked.

     `_veSelectedClips` (an ARRAY of ids) + `_findClipById` are what the editor actually uses, in 12
     and 5 files. An earlier draft of this read `VE._veSelectedClipId`, which does not exist and is
     never assigned anywhere: the toolbar would have reported "select a clip first" forever, on
     every clip. */
  function _clip() {
    var VE = _VE();
    if (!VE || !VE._veSelectedClips || !VE._veSelectedClips.length) return null;
    return VE._findClipById ? VE._findClipById(VE._veSelectedClips[0]) : null;
  }

  /* The tools Resolve actually offers, not two shapes. The owner's reference frames show a linear
     window, a circle with softness rings, a POLYGON with vertex handles and a BEZIER traced around
     a person: "burada daire kare çizme yok, farklı araçlar var, kalem aracı, seçim aracı, pen
     toollar çok".

     pen / curvature / freeform are the three modes of the editor's EXISTING pen (canvas/tools/
     pen-tools/), armed through PW.drawPath. No second pen was written. */
  var TOOLS = [
    { id: 'select',    icon: 'mouse-pointer-2', label: 'Select',    hint: 'Select and move windows' },
    { id: 'pen',       icon: 'pen-tool',        label: 'Pen',  hint: 'Bezier window: click and drag to curve; return to first point to close' },
    { id: 'curvature', icon: 'spline',          label: 'Curve',   hint: 'Curve window: just add points, it automatically fits the curve' },
    { id: 'freeform',  icon: 'lasso',           label: 'Free', hint: 'Free-draw window: hold and draw' },
    { id: 'rect',      icon: 'square',          label: 'Square',   hint: 'Rectangle window' },
    { id: 'ellipse',   icon: 'circle',          label: 'Circle',  hint: 'Ellipse window' },
    { id: 'linear',    icon: 'move-vertical',   label: 'Linear', hint: 'Linear transition window: full in one direction, zero in the opposite; softness opens the transition band' }
  ];
  /* Tracking UI switch (owner 2026-07-18: "takip düğmesini şimdilik gizle, çok vaktimi yedi").
     false = the "Bu pencereyi takip et" button and the points checkbox are HIDDEN; the engine
     (trackRegion, _vePwTrackOffset, keyframes) stays intact and already-tracked windows still show
     ONLY "Takibi bırak" as an escape hatch. Flip to true to re-enable the full tracking UI. */
  var TRACK_UI = false;

  var PEN_MODES = { pen: 1, curvature: 1, freeform: 1 };
  var SHAPE_NAMES = { ellipse: 'Circle', rect: 'Square', linear: 'Linear', pen: 'Pen', curve: 'Curve', freeform: 'Free' };
  function _shapeName(s) { return SHAPE_NAMES[s] || 'Square'; }

  // HTML-escape a user-typed name before it lands in markup (a node named "<b>" or with a quote
  // would otherwise corrupt the row or the input attribute).
  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _html() {
    var PW = _PW();
    var wins = PW ? PW.windows() : [];
    var sel = PW ? PW.selected() : -1;
    var h = '<div class="ve-ct-head">' +
        '<span class="ve-ct-title">' + _icon('palette', 13) + ' Color Tools</span>' +
        // Dock (owner 2026-07-17): Resolve's Window palette is a fixed part of the Color page, not a
        // floating box. Floating is right while you are drawing on the picture and wrong while you
        // are working down a node list, so this is a toggle rather than a decision made for you.
        '<button class="ve-ct-x" data-act="dock" title="' + (_docked ? 'Release' : 'Dock to right panel') + '">' +
          _icon(_docked ? 'pin-off' : 'pin', 13) + '</button>' +
        '<button class="ve-ct-x" data-act="popout" title="' + (_isPopped() ? 'Undo' : 'Open in separate window') + '">' +
          _icon(_isPopped() ? 'minimize-2' : 'external-link', 13) + '</button>' +
        '<button class="ve-ct-x" data-act="close" title="Close">' + _icon('x', 13) + '</button>' +
      '</div>' +
      '<div class="ve-ct-tools">';
    for (var i = 0; i < TOOLS.length; i++) {
      var t = TOOLS[i];
      h += '<button class="ve-ct-t' + (TOOL === t.id ? ' on' : '') + '" data-tool="' + t.id + '" ' +
        'title="' + t.hint + '">' + _icon(t.icon, 15) + '<span>' + t.label + '</span></button>';
    }
    h += '</div>';

    /* THE NODE CHAIN. This is the management surface the owner asked about after seeing how Resolve
       and Premiere do it: neither puts masks on the timeline, both treat the grade as a property of
       the clip edited in a panel. This is that panel.

       The chain is SERIAL and displayed top-to-bottom in apply order, because order changes the
       picture (measured: desaturate-then-warm 169,121,73 vs warm-then-desaturate 130,130,130). That
       is why the reorder arrows exist and are not decoration. */
    var nodes = PW.nodes ? PW.nodes() : [];
    var ni = PW.nodeIndex ? PW.nodeIndex() : 0;
    h += '<div class="ve-ct-sec">' +
        '<div class="ve-ct-sec-h">Node chain <span class="ve-ct-n">' + nodes.length + '</span>' +
          '<button class="ve-ct-b" data-act="nodeadd" title="Add node to entire frame">' + _icon('plus', 12) + '</button>' +
        '</div>' +
        '<div class="ve-ct-list">';
    if (!nodes.length) {
      h += '<div class="ve-ct-empty">Select a video clip.</div>';
    } else {
      for (var n = 0; n < nodes.length; n++) {
        var nd = nodes[n], nw = (nd.windows || []).length;
        h += '<div class="ve-ct-row' + (n === ni ? ' on' : '') + '" data-node="' + n + '">' +
          '<span class="ve-ct-num">' + (n + 1) + '</span>' +
          '<span class="ve-ct-nm">' +
            '<b class="ve-ct-nmtext" data-node="' + n + '" title="Double-click to rename">' +
              _esc(nd.name || ('Node ' + (n + 1))) + '</b>' +
            '<i class="ve-ct-sub">' + (nw ? nw + ' pencere' : 'entire frame') + '</i></span>' +
          '<button class="ve-ct-b" data-act="nodeup" data-node="' + n + '" title="Move up"' +
            (n === 0 ? ' disabled' : '') + '>' + _icon('chevron-up', 11) + '</button>' +
          '<button class="ve-ct-b" data-act="nodedown" data-node="' + n + '" title="Move down"' +
            (n === nodes.length - 1 ? ' disabled' : '') + '>' + _icon('chevron-down', 11) + '</button>' +
          '<button class="ve-ct-b"' + (nd.enabled === false ? '' : ' on') + '" data-act="nodeon" data-node="' + n + '" title="Open / close">' +
            _icon(nd.enabled === false ? 'eye-off' : 'eye', 12) + '</button>' +
          '<button class="ve-ct-b ve-ct-del" data-act="nodedel" data-node="' + n + '" title="Delete">' + _icon('trash-2', 12) + '</button>' +
          '</div>';
      }
    }
    h += '</div></div>';

    // The selected node's windows. A node with none grades the whole frame, which is Resolve's rule
    // and worth saying out loud rather than showing an empty list that looks broken.
    h += '<div class="ve-ct-sec">' +
        '<div class="ve-ct-sec-h">Windows <span class="ve-ct-n">' + wins.length + '</span></div>' +
        '<div class="ve-ct-list">';
    if (!wins.length) {
      h += '<div class="ve-ct-empty">This node is applied to the entire frame.<br>Select a tool and draw.</div>';
    } else {
      for (var k = 0; k < wins.length; k++) {
        var w = wins[k];
        var _nm = w.name || (_shapeName(w.shape) + ' ' + (k + 1));
        var _t = (w.tDur != null) ? '<i class="ve-ct-sub">' + (w.tStart || 0) + '-' + ((w.tStart || 0) + w.tDur) + 'sn</i>' : '';
        h += '<div class="ve-ct-row' + (k === sel ? ' on' : '') + '" data-i="' + k + '">' +
          '<span class="ve-ct-dot" style="background:' + PW.colorOf(k) + '"></span>' +
          '<span class="ve-ct-nm">' + _nm + _t + '</span>' +
          '<button class="ve-ct-b"' + (w.invert ? ' on' : '') + '" data-act="invert" data-i="' + k + '" title="Flip">' + _icon('flip-horizontal', 12) + '</button>' +
          '<button class="ve-ct-b"' + (w.enabled === false ? '' : ' on') + '" data-act="enable" data-i="' + k + '" title="Open / close">' + _icon(w.enabled === false ? 'eye-off' : 'eye', 12) + '</button>' +
          '<button class="ve-ct-b ve-ct-del" data-act="del" data-i="' + k + '" title="Delete">' + _icon('trash-2', 12) + '</button>' +
          '</div>';
      }
    }
    h += '</div></div>';

    // Per-window controls. Only for the selected window: a slider that silently applies to "whatever
    // was last clicked" is worse than no slider.
    var w2 = wins[sel];
    if (w2) {
      var _timed = w2.tDur != null;
      var _tracked = PW && PW.isTracked && PW.isTracked(sel);
      h += '<div class="ve-ct-sec">' +
        '<div class="ve-ct-sec-h">Selected window</div>' +
        // Rename (owner: "isimlendirmemiz vs olsun").
        '<input class="ve-ct-name-in" id="ve-ct-name" value="' +
          _esc(w2.name || _shapeName(w2.shape) + ' ' + (sel + 1)) + '" placeholder="Name">' +
        '<label class="ve-ct-f"><span>Softness</span>' +
          '<input type="range" id="ve-ct-soft" min="0" max="100" value="' +
            Math.round((w2.softness != null ? w2.softness : 0.3) * 100) + '"></label>' +
        // Timing (owner: "5 saniye tutarım 10 saniye tutarım"). Off = the grade holds for the whole
        // clip; on = only inside [Başlangıç, Başlangıç+Süre], in clip-relative seconds.
        '<label class="ve-ct-f ve-ct-timed"><span>Timed</span>' +
          '<input type="checkbox" id="ve-ct-timed"' + (_timed ? ' checked' : '') + '></label>' +
        (_timed ?
          '<div class="ve-ct-time">' +
            '<label>Start<input type="number" id="ve-ct-tstart" min="0" step="0.1" value="' + (w2.tStart || 0) + '"><i>sn</i></label>' +
            '<label>Duration<input type="number" id="ve-ct-tdur" min="0.1" step="0.1" value="' + w2.tDur + '"><i>sn</i></label>' +
          '</div>' : '') +
        // Tracking: follow the subject the window sits on (owner). One-time offline analysis, then
        // playback just interpolates keyframes -> no per-frame cost.
        // Per-vertex editing: only meaningful on a drawn PATH window (rect/ellipse/linear have no
        // anchors); toggles anchor handles on the canvas shape.
        (w2.geom && w2.geom.d ?
          '<button class="ve-ct-wide"' + (PW && PW.isVertexMode && PW.isVertexMode() ? ' on' : '') + '" data-act="vertex">' +
            _icon('spline', 13) + ' Edit points</button>' : '') +
        // Tracking UI is flag-gated (TRACK_UI): hidden by owner call, but an ALREADY-tracked window
        // still gets "Takibi bırak" so old projects have an escape hatch.
        ((TRACK_UI || _tracked) ?
          '<button class="ve-ct-wide"' + (_tracked ? ' on' : '') + '" data-act="track">' +
            _icon('crosshair', 13) + ' ' +
            (_tracked ? 'Unfollow' : 'Follow this window') + '</button>' : '') +
        // Show the feature points the tracker locked onto: watching the dots ride the subject is the
        // visible answer to the owner's "what is it tracking?". Only meaningful once tracked.
        ((TRACK_UI && _tracked) ?
          '<label class="ve-ct-f ve-ct-timed"><span>Show tracking points</span>' +
            '<input type="checkbox" id="ve-ct-pts"' + ((PW && PW.pointsShown && PW.pointsShown() !== false) ? ' checked' : '') + '></label>' : '') +
        '<button class="ve-ct-wide" data-act="lut">' + _icon('palette', 13) + ' Bu pencereye LUT ver</button>' +
        // A LUT is one field of a grade; this is the rest of it (levels, curves, wheels, WB, sat).
        // Both write through the same shared target, so they always land on the same node.
        '<button class="ve-ct-wide" data-act="cg">' + _icon('sliders', 13) + ' Color this window</button>' +
        '</div>';
    }

    h += '<div class="ve-ct-foot">' +
        '<button class="ve-ct-wide"' + (PW && PW.isMatte() ? ' on' : '') + '" data-act="matte" ' +
          'title="Show mask: you can only judge the feather by looking at the mask">' +
          _icon('contrast', 13) + ' Maske</button>' +
      '</div>';
    return h;
  }

  function _paint() {
    if (!_p) return;
    _p.innerHTML = _html();
    _p.classList.toggle('is-docked', _docked);
    var head = _p.querySelector('.ve-ct-head');
    // Docked OR popped panels are placed by CSS, so binding drag would let a drag write inline
    // left/top that silently wins over the layout and leaves the panel half-attached.
    if (!_docked && !_isPopped() && window.VEFloat && head) _disposers.push(window.VEFloat.drag(_p, head, 'colortools'));
  }

  function _place() {
    if (!_p) return;
    if (_docked) {
      // Hand positioning back to CSS: stale inline left/top from a previous float would otherwise
      // pin the docked panel wherever it last happened to be dragged.
      _p.style.left = _p.style.top = _p.style.right = _p.style.bottom = '';
      return;
    }
    if (!(window.VEFloat && window.VEFloat.restorePos(_p, 'colortools'))) {
      _p.style.left = Math.max(12, window.innerWidth - 250) + 'px';
      _p.style.top = '96px';
    }
  }

  function _setDocked(on) {
    _docked = !!on;
    try { localStorage.setItem('cc.float.colortools.docked', _docked ? '1' : '0'); } catch (e) {}
    for (var i = 0; i < _disposers.length; i++) { try { _disposers[i](); } catch (e) {} }
    _disposers = [];
    _place();
    _paint();
  }

  function _setTool(id) {
    var PW = _PW(), c = _clip();
    if (!PW || !c) { _toast('Select a video clip first'); TOOL = 'select'; _paint(); return; }
    // Switching tools always cancels an armed pen, or the pen stays live under the next tool and
    // the next canvas click silently makes a window nobody asked for.
    if (PW.isDrawing()) PW.cancelDraw();
    TOOL = id;
    // Any drawing tool implies edit mode: the shapes must be on the canvas to be drawn or grabbed.
    if (!PW.isOpen()) PW.open(c);

    if (PEN_MODES[id]) {
      // The window is born when the user FINISHES the path, so the tool stays armed and lit until
      // then. power-windows disarms itself on completion and calls back here.
      PW.drawPath(id);
      _toast(id === 'freeform' ? 'Press and hold to draw' : 'Place points, close by returning to the first point');
      _paint();
      return;
    }
    if (id === 'rect' || id === 'ellipse' || id === 'linear') {
      var i = PW.add();
      // A fresh linear window opens with a mid band so the gradient is visible immediately (softness
      // 0 would be a hard split that reads like a plain rect).
      if (i >= 0) PW.set(i, id === 'linear' ? { shape: id, softness: 0.5 } : { shape: id });
      // Back to select immediately: the new window is already on the canvas and the very next thing
      // anyone does is drag it. A tool that stays armed would spawn a second window on that drag.
      TOOL = 'select';
    }
    _paint();
  }

  function _toast(m) { if (typeof showToast === 'function') showToast(m); }

  function _onClick(e) {
    var t = e.target.closest ? e.target.closest('[data-act],[data-tool],[data-node],.ve-ct-row') : null;
    if (!t) return;
    var PW = _PW();
    var act = t.getAttribute('data-act');
    var tool = t.getAttribute('data-tool');
    var i = t.getAttribute('data-i');
    i = i == null ? -1 : +i;
    var nx = t.getAttribute('data-node');
    nx = nx == null ? -1 : +nx;

    if (tool) { _setTool(tool); return; }
    if (act === 'nodeadd') { PW && PW.addNode(false); _paint(); return; }
    if (nx >= 0 && PW) {
      if (act === 'nodeup')      { PW.moveNode(nx, nx - 1); _paint(); return; }
      if (act === 'nodedown')    { PW.moveNode(nx, nx + 1); _paint(); return; }
      if (act === 'nodeon')      { PW.setNode(nx, { enabled: PW.nodes()[nx].enabled === false }); _paint(); return; }
      if (act === 'nodedel')     { PW.removeNode(nx); _paint(); return; }
      if (!act)                  { PW.selectNode(nx); _paint(); return; }
    }
    if (act === 'close') { CT.close(); return; }
    if (act === 'dock') { _setDocked(!_docked); return; }
    if (act === 'popout') {
      if (window.VEFloat && _p) {
        // Pop-out and dock are mutually exclusive: undock first so the layout classes do not fight.
        if (VEFloat.isPopped(_p)) VEFloat.popIn(_p);
        else { if (_docked) _setDocked(false); VEFloat.popOut(_p, 'Color Tools'); }
        _paint();
      }
      return;
    }
    if (act === 'matte') { PW && PW.setMatte(!PW.isMatte()); _paint(); return; }
    if (act === 'lut') {
      var VE = _VE();
      if (VE && VE._veShowLutBrowser) VE._veShowLutBrowser();
      return;
    }
    if (act === 'cg') {
      var c = _clip();
      if (!c) { _toast('Select a video clip first'); return; }
      if (window.VEInspector && VEInspector.showCgModal) VEInspector.showCgModal(c.id);
      return;
    }
    if (act === 'track') {
      var PW3 = _PW(); if (!PW3) return;
      var si = PW3.selected(); if (si < 0) return;
      if (PW3.isTracked(si)) PW3.untrack(si); else PW3.track(si);
      _paint();
      return;
    }
    if (act === 'vertex') {
      var PW4 = _PW();
      if (PW4 && PW4.vertexMode) PW4.vertexMode();
      _paint();
      return;
    }
    if (!PW || i < 0) return;
    var w = PW.windows()[i];
    if (!w) return;
    if (act === 'del') PW.remove(i);
    else if (act === 'invert') PW.set(i, { invert: !w.invert });
    else if (act === 'enable') PW.set(i, { enabled: w.enabled === false });
    else PW.select(i);
    _paint();
  }

  function _onInput(e) {
    var PW = _PW();
    if (!PW) return;
    var i = PW.selected();
    if (i < 0) return;
    var id = e.target.id;
    // All quiet: these fire per keystroke / per drag-pixel, so they update data + preview but never
    // rebuild the toolbar DOM (which would drop focus from the field being edited).
    if (id === 've-ct-soft') PW.set(i, { softness: (+e.target.value) / 100 }, true);
    else if (id === 've-ct-name') PW.set(i, { name: e.target.value }, true);
    else if (id === 've-ct-tstart') PW.set(i, { tStart: Math.max(0, +e.target.value || 0) }, true);
    else if (id === 've-ct-tdur') PW.set(i, { tDur: Math.max(0.1, +e.target.value || 0.1) }, true);
  }

  function _onChange(e) {
    var PW = _PW();
    if (!PW) return;
    var i = PW.selected();
    if (i < 0) return;
    if (e.target.id === 've-ct-timed') {
      // On: give it a default range (whole clip is the current behaviour, so start 0 and a sensible
      // 5s the owner can then edit). Off: clear the bounds -> back to whole-clip.
      if (e.target.checked) PW.set(i, { tStart: 0, tDur: 5 });
      else PW.set(i, { tStart: undefined, tDur: undefined });
      _paint();
    } else if (e.target.id === 've-ct-pts') {
      if (PW.showPoints) PW.showPoints(e.target.checked);
    }
  }

  /* Double-click a node's name to rename it in place. The name field has always been rendered
     (nd.name) but nothing WROTE it - this is the missing writer. Swaps the label for an input,
     commits on Enter/blur, cancels on Escape, and repaints so the row shows the new name. */
  function _onDbl(e) {
    var b = e.target.closest ? e.target.closest('.ve-ct-nmtext') : null;
    if (!b) return;
    var PW = _PW();
    if (!PW || !PW.setNode) return;
    var ni = +b.getAttribute('data-node');
    var nodes = PW.nodes ? PW.nodes() : [];
    if (!nodes[ni]) return;
    e.preventDefault();
    var cur = nodes[ni].name || ('Node ' + (ni + 1));
    var inp = document.createElement('input');
    inp.className = 've-ct-nm-edit';
    inp.value = cur;
    b.replaceWith(inp);
    inp.focus();
    inp.select();
    var done = false;
    function commit(save) {
      if (done) return; done = true;
      if (save) {
        var v = inp.value.trim();
        PW.setNode(ni, { name: v || undefined });   // blank -> fall back to the default "Node N"
      }
      _paint();
    }
    inp.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); commit(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); commit(false); }
    });
    inp.addEventListener('blur', function () { commit(true); });
    // The row's click handler must not fire "select node" from the click that lands inside the input.
    inp.addEventListener('click', function (ev) { ev.stopPropagation(); });
    inp.addEventListener('dblclick', function (ev) { ev.stopPropagation(); });
  }

  var CT = {
    isOpen: function () { return !!_p; },

    open: function () {
      if (_p) return true;
      _p = document.createElement('div');
      _p.id = 've-color-tools';
      _p.className = 've-ct';
      document.body.appendChild(_p);
      _place();
      _paint();
      _p.addEventListener('click', _onClick);
      _p.addEventListener('input', _onInput);
      _p.addEventListener('change', _onChange);   // the "Zamanla" checkbox
      _p.addEventListener('dblclick', _onDbl);     // rename a node inline
      var c = _clip();
      if (c && _PW()) { _PW().open(c); _paint(); }
      return true;
    },

    close: function () {
      if (!_p) return false;
      // Bring it home before removing, so a leftover popup window is not left pointing at a dead node.
      if (window.VEFloat && VEFloat.isPopped(_p)) VEFloat.popIn(_p);
      for (var i = 0; i < _disposers.length; i++) { try { _disposers[i](); } catch (e) {} }
      _disposers = [];
      // Close the window editor too, or its boxes stay on the canvas with no toolbar to remove them.
      if (_PW() && _PW().isOpen()) _PW().close();
      _p.remove(); _p = null; TOOL = 'select';
      return true;
    },

    toggle: function () { return _p ? CT.close() : CT.open(); },
    refresh: function () { if (_p) _paint(); }
  };

  window.VEColorTools = CT;

  if (window.cc && cc.modules) cc.modules.register({
    id: 've-color-tools', parent: 'video',
    title: 've-color-tools', mount: function () {}, unmount: function () { CT.close(); }
  });
})();
