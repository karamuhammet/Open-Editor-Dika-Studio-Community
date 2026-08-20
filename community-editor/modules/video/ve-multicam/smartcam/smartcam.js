/* VE SmartCam — one 16:9 shot becomes ONE story frame with N stacked cameras.
   Plan: docs/smartcam-plan.md

   WHAT THIS IS, and what it is NOT (owner, 2026-07-17, after I got it wrong twice):
     SmartCam COMPOSITES. Multicam CUTS. They are different features and must not share a model.
     A 16:9 podcast with two people becomes a 9:16 story where speaker A is the TOP HALF and
     speaker B is the BOTTOM HALF, both visible at once, 50/50. Nothing is cut; nothing switches.
     The first two cuts of this file built it on mcAngles/_veMcSwitchAngle, which is why it kept
     coming out as "the multicam monitor again".

   THE MODEL:
     clip.scLayout = { mode:'grid', layoutId, rows:[ { share, cells:[ {crop, label, share} ] } ] }
     - ROWS split the output HEIGHT; CELLS split their row's WIDTH. Every arrangement falls out of
       that one shape: [[1],[1]] üst/alt · [[1,1]] sol/sağ · [[1,1],[1,1]] 2x2 · [[1],[1,1]] 1+2.
       A single axis cannot express "2 üst 2 alt", which is why this replaced stack-v/stack-h.
     - Each cell's crop is aspect-locked to ITS OWN SLOT, NOT to the whole frame. Two cameras
       top/bottom in 9:16 -> each slot 1080x960 (nearly square). 2x2 in 16:9 -> each slot 960x540.
       Lock to the slot and _veFitRect's equal-ratio case fills it exactly (S0.1, worst error
       4.5e-13 px). Lock to the frame instead and every cell letterboxes.
     - Plain nested objects, no arrays hanging off the clip: _veCloneClip copies top-level ARRAYS
       BY REFERENCE, so `rows` lives inside scLayout, never as clip.scRows.

   THE SURFACES:
     - The CANVAS is the workspace. Each cell is a real fabric.Rect the user drags and resizes
       with the editor's own controls. Fabric already ships drag, corner handles, snapping and
       keyboard nudge; rebuilding any of that inside a modal was pure waste.
     - The PANEL is an output view: which cameras, their heights, and what it will look like.
       Draggable, resizable and pop-out-able exactly like the multicam monitor, because the owner
       uses two screens and asked for the same affordances by name.

   OUTPUT NEVER OVERWRITES: "yeni çıktıyı kaydet diyince üstüne yazmasın". Apply builds a NEW clip
   carrying scLayout and lands it on a track of a NEW page at the target size. The source clip and
   the source page are untouched. */
(function () {
  'use strict';

  var _p = null;
  var _open = false;
  var _clipId = null;
  var _cams = [];           // [{ crop:{x,y,w,h}, label, share }]
  var _sel = 0;
  var _layoutId = null;      // chosen preset; null = pick the orientation's default
  var _target = { w: 1080, h: 1920 };
  var _rects = [];
  var _raf = null;
  var _syncing = false;
  var _win = null;
  var GEOM_KEY = 'cc_sc_geom';

  var COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#6366f1'];

  var PRESETS = [
    { id: '9:16', label: '9:16 Story', w: 1080, h: 1920 },
    { id: '4:5', label: '4:5 Portrait', w: 864, h: 1080 },
    { id: '1:1', label: '1:1 Square', w: 1080, h: 1080 },
    { id: '16:9', label: '16:9 Landscape', w: 1920, h: 1080 }
  ];

  // A layout is a list of ROWS; each row is a list of CELL weights. Every arrangement the owner
  // asked for falls out of this one shape, including the uneven ones a single axis cannot express.
  //   [[1],[1]] = üst/alt   ·   [[1,1]] = sol/sağ   ·   [[1,1],[1,1]] = 2x2   ·   [[1],[1,1]] = 1+2
  // Keyed by camera count because the valid options genuinely differ per count.
  var LAYOUTS = {
    1: [{ id: 'full', name: 'Single camera', rows: [[1]] }],
    2: [{ id: 'v', name: 'Top / Bottom', rows: [[1], [1]] },
        { id: 'h', name: 'Left / Right', rows: [[1, 1]] }],
    3: [{ id: 'v', name: '3 Rows', rows: [[1], [1], [1]] },
        { id: 'h', name: '3 Columns', rows: [[1, 1, 1]] },
        { id: '1+2', name: '1 Top / 2 Bottom', rows: [[1], [1, 1]] },
        { id: '2+1', name: '2 Top / 1 Bottom', rows: [[1, 1], [1]] }],
    4: [{ id: '2x2', name: '2x2 Grid', rows: [[1, 1], [1, 1]] },
        { id: 'v', name: '4 Rows', rows: [[1], [1], [1], [1]] },
        { id: 'h', name: '4 Columns', rows: [[1, 1, 1, 1]] },
        { id: '1+3', name: '1 Top / 3 Bottom', rows: [[1], [1, 1, 1]] }]
  };

  function _VE() { return window.__ccVideoEditor; }
  function _icon(n, s) { var VE = _VE(); return (VE && VE._veIcon) ? VE._veIcon(n, s || 14) : ''; }
  function _toast(m, t) { if (typeof showToast === 'function') showToast(m, t); }
  function _cvs() { return (typeof canvas !== 'undefined') ? canvas : null; }

  function _pickClip() {
    var VE = _VE();
    var sel = VE._veSelectedClips || [];
    if (!sel.length) return null;
    var clip = VE._findClipById(sel[0]);
    return (clip && clip.type === 'video') ? clip : null;
  }

  // The video is blitted onto the Fabric canvas at CW x CH, so canvas space IS source space and a
  // box maps to a normalized crop by plain division. No second coordinate system.
  function _canvasSize() {
    var VE = _VE();
    var cw = (typeof CW !== 'undefined' && CW) || (VE._veUi && VE._veUi.previewCanvas && VE._veUi.previewCanvas.width) || 1920;
    var ch = (typeof CH !== 'undefined' && CH) || (VE._veUi && VE._veUi.previewCanvas && VE._veUi.previewCanvas.height) || 1080;
    return { w: cw, h: ch };
  }

  function _ratioName() {
    var m = PRESETS.filter(function (p) { return Math.abs(p.w / p.h - _target.w / _target.h) < 1e-6; })[0];
    return m ? m.id : (_target.w + 'x' + _target.h);
  }

  // ── layout ─────────────────────────────────────────────────────────────────
  function _horiz() { return _target.w > _target.h; }

  function _options() { return LAYOUTS[Math.min(_cams.length, 4)] || LAYOUTS[1]; }

  // Default per orientation: a portrait output wants rows, a landscape one wants columns, and four
  // cameras want a 2x2 grid in either. The user can override; this is only the starting guess.
  function _defaultId() {
    var o = _options();
    var want = _cams.length === 4 ? '2x2' : (_horiz() ? 'h' : 'v');
    return (o.filter(function (x) { return x.id === want; })[0] || o[0]).id;
  }

  function _layoutDef() {
    var o = _options();
    return o.filter(function (x) { return x.id === _layoutId; })[0] || o[0];
  }

  // Where does camera i land in the output, as fractions? This is the single source of truth for
  // the band ratio, the preview and the exported layout: one function, so they cannot disagree.
  function _slots() {
    var def = _layoutDef();
    var rows = def.rows, out = [], i, j;
    var rSum = 0;
    for (i = 0; i < rows.length; i++) rSum += 1;
    var fy = 0;
    for (i = 0; i < rows.length; i++) {
      var rShare = (_rowShare(i) != null) ? _rowShare(i) : (1 / rows.length);
      var fh = (i === rows.length - 1) ? (1 - fy) : rShare;
      var cells = rows[i], cCount = cells.length, fx = 0;
      for (j = 0; j < cCount; j++) {
        var cw = _cellShare(i, j);
        var fw = (j === cCount - 1) ? (1 - fx) : cw;
        out.push({ fx: fx, fy: fy, fw: fw, fh: fh, row: i, col: j });
        fx += fw;
      }
      fy += fh;
    }
    return out;
  }

  // Both axes are user-editable: drag a seam in the preview, or type into a camera's % field.
  var _rowShares = null;      // per ROW: fraction of the output height
  var _cellShares = null;     // per ROW: array of each cell's fraction of that row's width
  function _rowShare(i) {
    var rows = _layoutDef().rows;
    if (!_rowShares || _rowShares.length !== rows.length) {
      _rowShares = rows.map(function () { return 1 / rows.length; });
    }
    return _rowShares[i];
  }
  function _cellShare(r, c) {
    var rows = _layoutDef().rows;
    if (!_cellShares || _cellShares.length !== rows.length) {
      _cellShares = rows.map(function (row) {
        return row.map(function () { return 1 / row.length; });
      });
    }
    if (!_cellShares[r] || _cellShares[r].length !== rows[r].length) {
      _cellShares[r] = rows[r].map(function () { return 1 / rows[r].length; });
    }
    return _cellShares[r][c];
  }
  function _rowOf(camIdx) { var sl = _slots(); return sl[camIdx] ? sl[camIdx].row : 0; }
  function _colOf(camIdx) { var sl = _slots(); return sl[camIdx] ? sl[camIdx].col : 0; }

  // A cell's box is locked to ITS SLOT, never to the output frame. Two cameras top/bottom in 9:16
  // -> each slot is 1080x960 (nearly square). 2x2 in 16:9 -> each slot is 960x540 (16:9 again).
  // Lock to the slot and _veFitRect fills it exactly; lock to the frame and every cell letterboxes.
  function _bandRatio(i) {
    var sl = _slots()[i];
    if (!sl) return _target.w / _target.h;
    return (_target.w * sl.fw) / (_target.h * sl.fh);
  }

  function _boxAt(cx, cy, scale, i) {
    var c = _canvasSize();
    var tr = _bandRatio(i), sr = c.w / c.h;
    var w, h;
    if (tr <= sr) { h = scale; w = (h * c.h * tr) / c.w; }
    else { w = scale; h = (w * c.w / tr) / c.h; }
    if (w > 1) { h /= w; w = 1; }
    if (h > 1) { w /= h; h = 1; }
    var x = Math.min(Math.max(cx - w / 2, 0), 1 - w);
    var y = Math.min(Math.max(cy - h / 2, 0), 1 - h);
    return { x: x, y: y, w: w, h: h };
  }

  // Every box is locked to the OLD band ratio the moment the target or a share changes.
  function _refitAll() {
    _cams.forEach(function (cam, i) {
      var cx = cam.crop.x + cam.crop.w / 2, cy = cam.crop.y + cam.crop.h / 2;
      cam.crop = _boxAt(cx, cy, Math.max(cam.crop.w, cam.crop.h), i);
    });
  }

  // ── boxes on the canvas ────────────────────────────────────────────────────
  function _clearRects() {
    var cvs = _cvs();
    if (!cvs) { _rects = []; return; }
    _syncing = true;
    _rects.forEach(function (r) { try { cvs.remove(r); } catch (e) {} });
    _rects = [];
    cvs.discardActiveObject();
    cvs.requestRenderAll();
    _syncing = false;
  }

  function _buildRects() {
    var cvs = _cvs();
    if (!cvs || typeof fabric === 'undefined') return;
    _clearRects();
    var c = _canvasSize();
    _syncing = true;
    _cams.forEach(function (cam, i) {
      var col = COLORS[i % COLORS.length];
      var r = new fabric.Rect({
        left: cam.crop.x * c.w, top: cam.crop.y * c.h,
        width: cam.crop.w * c.w, height: cam.crop.h * c.h,
        fill: 'rgba(0,0,0,0.001)',     // not 'transparent': a fully transparent fill is not hit-testable
        stroke: col, strokeWidth: 3, strokeUniform: true,
        cornerColor: col, cornerStrokeColor: '#000', cornerSize: 11,
        cornerStyle: 'circle', transparentCorners: false, borderColor: col,
        hasRotatingPoint: false, lockRotation: true, lockSkewingX: true, lockSkewingY: true,
        objectCaching: false,
        // Transient marker, same idiom as the crop tool's _isCropRect and the guides. history.js
        // filters these out of every snapshot and excludeFromExport keeps them out of rendered
        // output. Without BOTH, a camera box gets baked into the saved file.
        excludeFromExport: true,
        _isScCam: true, _scIdx: i
      });
      r.setControlsVisibility({ mt: false, mb: false, ml: false, mr: false, mtr: false });
      cvs.add(r);
      _rects.push(r);
    });
    if (_rects[_sel]) cvs.setActiveObject(_rects[_sel]);
    cvs.requestRenderAll();
    _syncing = false;
  }

  // Fabric's corner drag is free-form even with the side controls hidden, so we take the drag's
  // CENTRE and SIZE and re-derive a band-locked box, then snap the rect back to it. That snap is
  // what the user sees as "the ratio holds".
  function _readRect(i) {
    var r = _rects[i], cam = _cams[i];
    if (!r || !cam) return;
    var c = _canvasSize();
    var w = r.width * r.scaleX, h = r.height * r.scaleY;
    cam.crop = _boxAt((r.left + w / 2) / c.w, (r.top + h / 2) / c.h, Math.max(w / c.w, h / c.h), i);
    _syncRect(i);
  }

  function _syncRect(i) {
    var r = _rects[i], cam = _cams[i];
    if (!r || !cam) return;
    var c = _canvasSize();
    _syncing = true;
    r.set({ left: cam.crop.x * c.w, top: cam.crop.y * c.h,
            width: cam.crop.w * c.w, height: cam.crop.h * c.h, scaleX: 1, scaleY: 1 });
    r.setCoords();
    var cvs = _cvs();
    if (cvs) cvs.requestRenderAll();
    _syncing = false;
  }

  function _onModified(e) {
    if (_syncing || !_open) return;
    var o = e && (e.target || (e.transform && e.transform.target));
    if (!o || !o._isScCam) return;
    _readRect(o._scIdx);
    _sel = o._scIdx;
    _render();
  }

  function _onSelected(e) {
    if (!_open) return;
    var o = e && (e.selected ? e.selected[0] : e.target);
    if (!o || !o._isScCam) return;
    _sel = o._scIdx;
    _render();
  }

  // ── the layout object ──────────────────────────────────────────────────────
  function _layout() {
    var def = _layoutDef(), rows = def.rows, out = [], n = 0;
    for (var i = 0; i < rows.length; i++) {
      var cells = [];
      for (var j = 0; j < rows[i].length; j++) {
        var cam = _cams[n++];
        if (!cam) continue;
        cells.push({ crop: { x: cam.crop.x, y: cam.crop.y, w: cam.crop.w, h: cam.crop.h },
                     label: cam.label, share: _cellShare(i, j) });
      }
      if (cells.length) out.push({ share: _rowShare(i), cells: cells });
    }
    return { mode: 'grid', layoutId: def.id, rows: out };
  }

  // ── preview: the real composite, drawn the way the compositor will ─────────
  function _renderPreview() {
    var pv = _p && _p.querySelector('#ve-sc-preview');
    var wrap = _p && _p.querySelector('.ve-sc-pvwrap');
    if (!pv || !wrap) return;
    // MEASURE the wrapper. The first cut hardcoded maxW:150, so the composite stayed a postage
    // stamp no matter how big the panel was dragged.
    var pad = 16;
    var availW = Math.max(40, wrap.clientWidth - pad), availH = Math.max(40, wrap.clientHeight - pad);
    var tr = _target.w / _target.h;
    var pw = availW, ph = pw / tr;
    if (ph > availH) { ph = availH; pw = ph * tr; }
    pw = Math.round(pw); ph = Math.round(ph);
    if (pw < 8 || ph < 8) return;
    if (pv.width !== pw || pv.height !== ph) { pv.width = pw; pv.height = ph; }
    pv.style.width = pw + 'px'; pv.style.height = ph + 'px';
    var x = pv.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, pw, ph);
    var VE = _VE();
    var src = VE._veUi && VE._veUi.previewCanvas;
    if (!src || !src.width) return;
    // Reuse the SHIPPING compositor rather than re-implementing the grid, or preview and render
    // drift apart the first time either changes.
    var fake = { type: 'video', fit: 'cover', scLayout: _layout(), _mediaWidth: src.width, _mediaHeight: src.height };
    try { VE._veDrawClipFitted(x, fake, src, pw, ph); } catch (e) {}
    // outline each slot in its camera's colour; the selected one thicker
    var sl = _slots();
    _cams.forEach(function (cam, i) {
      var o = sl[i];
      if (!o) return;
      x.strokeStyle = COLORS[i % COLORS.length];
      x.lineWidth = (i === _sel) ? 2.5 : 1;
      x.strokeRect(o.fx * pw + 1, o.fy * ph + 1, o.fw * pw - 2, o.fh * ph - 2);
    });
    // Draw the seams. A draggable edge the user cannot see is a feature that does not exist.
    var rows = _layoutDef().rows, fy = 0;
    x.strokeStyle = 'rgba(255,255,255,.85)';
    x.lineWidth = 1;
    for (var ri = 0; ri < rows.length; ri++) {
      var fh = _rowShare(ri), fx = 0;
      for (var ci = 0; ci < rows[ri].length - 1; ci++) {
        fx += _cellShare(ri, ci);
        _seamMark(x, fx * pw, (fy + fh / 2) * ph, false);
      }
      fy += fh;
      if (ri < rows.length - 1) _seamMark(x, pw / 2, fy * ph, true);
    }
  }

  // ── seam dragging ──────────────────────────────────────────────────────────
  // One mechanism for both axes, and the reason there is no forest of number fields in a 268px
  // panel: grab the line between two slots and move it. Every NLE works this way, so nothing has
  // to be taught. HORIZONTAL seams move row heights; VERTICAL seams move cell widths inside a row.
  var _seam = null;
  var HIT = 6;                 // px of grab tolerance either side of a seam

  // Which seam is under (px, py), in preview-canvas pixels?
  function _seamAt(px, py, pw, ph) {
    var rows = _layoutDef().rows, fy = 0, i, j;
    for (i = 0; i < rows.length; i++) {
      var fh = _rowShare(i);
      // vertical seams inside THIS row (only while the pointer is within the row's band)
      if (py >= fy * ph && py <= (fy + fh) * ph) {
        var fx = 0;
        for (j = 0; j < rows[i].length - 1; j++) {
          fx += _cellShare(i, j);
          if (Math.abs(px - fx * pw) <= HIT) return { type: 'col', row: i, idx: j };
        }
      }
      fy += fh;
      // horizontal seam BELOW this row
      if (i < rows.length - 1 && Math.abs(py - fy * ph) <= HIT) return { type: 'row', idx: i };
    }
    return null;
  }

  // Move a seam to a fraction: the two slots it separates absorb the change, everything else on
  // that axis holds still. Dragging the middle seam of three rows must not move the outer two.
  function _moveSeam(seam, frac) {
    var arr = seam.type === 'row' ? _rowShares : _cellShares[seam.row];
    if (!arr) return;
    var i = seam.idx;
    var before = 0, k;
    for (k = 0; k < i; k++) before += arr[k];
    var pair = arr[i] + arr[i + 1];
    var first = Math.min(Math.max(frac - before, 0.05), pair - 0.05);
    arr[i] = first;
    arr[i + 1] = pair - first;
  }

  function _bindSeams() {
    var pv = _p.querySelector('#ve-sc-preview');
    if (!pv) return;
    pv.addEventListener('mousemove', function (e) {
      if (_seam) return;
      var r = pv.getBoundingClientRect();
      var hit = _seamAt(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
      pv.style.cursor = hit ? (hit.type === 'row' ? 'ns-resize' : 'ew-resize') : 'default';
    });
    pv.addEventListener('mousedown', function (e) {
      var r = pv.getBoundingClientRect();
      var hit = _seamAt(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
      if (!hit) return;
      _rowShare(0); _cellShare(0, 0);          // make sure both arrays exist before we mutate them
      _seam = hit;
      e.preventDefault();
      function mv(ev) {
        var b = pv.getBoundingClientRect();
        var frac = _seam.type === 'row' ? (ev.clientY - b.top) / b.height : (ev.clientX - b.left) / b.width;
        _moveSeam(_seam, Math.min(Math.max(frac, 0), 1));
        _renderPreview();
      }
      function up() {
        document.removeEventListener('mousemove', mv);
        document.removeEventListener('mouseup', up);
        _seam = null;
        // Re-lock on RELEASE, not on every mousemove: rebuilding N fabric.Rects per frame makes the
        // drag stutter, and the boxes are not what the user is looking at while dragging a seam.
        _refitAll();
        _buildRects();
        _render();
      }
      document.addEventListener('mousemove', mv);
      document.addEventListener('mouseup', up);
    });
  }

  // A short dashed grip at the seam's midpoint: enough to read as "this line moves", quiet enough
  // not to fight the picture.
  function _seamMark(x, cx, cy, horiz) {
    var L = 9;
    x.save();
    x.setLineDash([3, 3]);
    x.beginPath();
    if (horiz) { x.moveTo(cx - L, cy); x.lineTo(cx + L, cy); }
    else { x.moveTo(cx, cy - L); x.lineTo(cx, cy + L); }
    x.stroke();
    x.restore();
  }

  function _renderLayouts() {
    var host = _p && _p.querySelector('#ve-sc-lay');
    if (!host) return;
    var opts = _options();
    host.innerHTML = '';
    // One camera has one possible arrangement; a chooser would be a control that does nothing.
    host.style.display = opts.length < 2 ? 'none' : 'flex';
    if (opts.length < 2) return;
    var cur = _layoutDef().id;
    opts.forEach(function (o) {
      var b = document.createElement('button');
      b.className = 've-sc-lay' + (o.id === cur ? ' is-on' : '');
      b.dataset.lay = o.id; b.title = o.name;
      // The chip IS a miniature of the arrangement: a name like "1+2" has to be decoded, a picture
      // does not.
      var g = document.createElement('i');
      o.rows.forEach(function (row) {
        var r = document.createElement('u');
        row.forEach(function () { r.appendChild(document.createElement('s')); });
        g.appendChild(r);
      });
      b.appendChild(g);
      host.appendChild(b);
    });
  }

  function _renderCams() {
    var list = _p && _p.querySelector('#ve-sc-cams');
    if (!list) return;
    list.innerHTML = '';
    _cams.forEach(function (cam, i) {
      var row = document.createElement('div');
      row.className = 've-sc-cam' + (i === _sel ? ' is-sel' : '');
      row.dataset.idx = String(i);
      // Name the SLOT, not the index: a number tells the user nothing about where the camera
      // lands. Derived from the real slot rectangle, so it stays true for every arrangement
      // including the uneven ones.
      var pos = _slotName(i);
      row.innerHTML =
        '<i class="ve-sc-dot"></i>' +
        '<span class="ve-sc-pos">' + pos + '</span>' +
        '<input class="ve-sc-name" data-idx="' + i + '" spellcheck="false">' +
        '<label class="ve-sc-share"><input data-idx="' + i + '" type="number" min="5" max="95" step="5"><b>%</b></label>' +
        '<button class="ve-sc-x" data-del="' + i + '" title="Delete camera">' + _icon('x', 11) + '</button>';
      // the selected row's marker bar is currentColor, so the row IS its camera's colour
      row.style.color = COLORS[i % COLORS.length];
      row.querySelector('.ve-sc-dot').style.background = COLORS[i % COLORS.length];
      row.querySelector('.ve-sc-name').style.color = 'var(--text, #ededf0)';
      row.querySelector('.ve-sc-pos').style.color = '';
      row.querySelector('.ve-sc-name').value = cam.label;
      var _rr = _rowOf(i), _rows = _layoutDef().rows;
      var _isW = _rows[_rr].length > 1;
      var inp = row.querySelector('.ve-sc-share input');
      inp.value = Math.round((_isW ? _cellShare(_rr, _colOf(i)) : _rowShare(_rr)) * 100);
      // Say WHICH axis the number is, or "50%" on a 2x2 camera is ambiguous between its half-width
      // and its half-height.
      row.querySelector('.ve-sc-share b').textContent = _isW ? '%G' : '%Y';
      row.querySelector('.ve-sc-share').title = _isW ? 'Width share in row' : 'Row height';
      if (!_isW && _rows.length < 2) inp.disabled = true;
      list.appendChild(row);
    });
    var add = _p.querySelector('#ve-sc-add');
    if (add) add.disabled = _cams.length >= 4;   // beyond 4 bands a face is unreadable on a phone
  }

  function _render() { _renderLayouts(); _renderCams(); _renderPreview(); _status(); }

  // "ÜST/ALT", "SOL/SAĞ", "SOL ÜST"... read off the actual slot rect, never off the index.
  function _slotName(i) {
    var sl = _slots(), o = sl[i];
    if (!o) return String(i + 1);
    var rows = _layoutDef().rows;
    var vert = rows.length > 1, horz = rows[o.row].length > 1;
    var v = !vert ? '' : (rows.length === 2 ? (o.row === 0 ? 'TOP' : 'ALT') : String(o.row + 1) + '.');
    var h = !horz ? '' : (rows[o.row].length === 2 ? (o.col === 0 ? 'SOL' : 'RIGHT') : String(o.col + 1));
    return (v && h) ? (h + ' ' + v) : (v || h || 'TAM');
  }

  function _status() {
    var s = _p && _p.querySelector('#ve-sc-status');
    if (!s) return;
    s.textContent = _cams.length + ' kamera · ' + _layoutDef().name + ' · ' + _ratioName();
    var out = _p.querySelector('#ve-sc-out');
    if (out) out.innerHTML = _icon('check', 13) + ' ' + _ratioName() + ' create output';
  }

  // ── cameras ────────────────────────────────────────────────────────────────
  function _addCam() {
    if (_cams.length >= 4) return;
    _cams.push({ crop: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, label: 'Kamera ' + (_cams.length + 1) });
    // The valid arrangements depend on the COUNT, so the old choice may not exist any more (there
    // is no 2x2 for three cameras). Fall back to the new count's default.
    _rowShares = null; _cellShares = null; _layoutId = null; _layoutId = _defaultId();
    _cams.forEach(function (c, i) {
      var cx = c.crop.x + c.crop.w / 2, cy = c.crop.y + c.crop.h / 2;
      c.crop = _boxAt(cx, cy, 0.55, i);
    });
    _sel = _cams.length - 1;
    _buildRects();
    _render();
  }

  function _delCam(i) {
    if (_cams.length <= 1) { _toast('At least one camera required', 'error'); return; }
    _cams.splice(i, 1);
    _cams.forEach(function (c, n) { if (/^Kamera \d+$/.test(c.label)) c.label = 'Kamera ' + (n + 1); });
    _rowShares = null; _cellShares = null; _layoutId = null; _layoutId = _defaultId();
    _refitAll();
    _sel = Math.min(_sel, _cams.length - 1);
    _buildRects();
    _render();
  }

  // The % edits whichever axis this camera's slot can actually vary on: its CELL WIDTH when it
  // shares a row, its ROW HEIGHT when it is alone in one. Offering a control that cannot move
  // anything (a lone cell's "width" is always 100) would be a lie.
  function _setShare(i, pct) {
    var rows = _layoutDef().rows;
    var r = _rowOf(i), c = _colOf(i);
    var v = Math.min(Math.max(pct / 100, 0.05), 0.95);
    if (rows[r].length > 1) _spread(_cellShares[r], c, v);
    else if (rows.length > 1) { _rowShare(0); _spread(_rowShares, r, v); }
    else return;
    _refitAll();                                    // every slot changed shape, so every box re-locks
    _buildRects();
    _render();
  }

  // Set arr[i] = v and rescale the REST to fill 1-v, keeping their relative proportions. Pushing
  // the top row to 60% must not silently reshuffle the other two rows against each other.
  function _spread(arr, i, v) {
    if (!arr || arr.length < 2) return;
    var rest = 0;
    arr.forEach(function (x, n) { if (n !== i) rest += x; });
    if (rest <= 0) return;
    var want = 1 - v;
    for (var n = 0; n < arr.length; n++) arr[n] = (n === i) ? v : arr[n] / rest * want;
  }

  function _select(i) {
    if (!_cams[i]) return;
    _sel = i;
    var cvs = _cvs();
    if (cvs && _rects[i]) { _syncing = true; cvs.setActiveObject(_rects[i]); cvs.requestRenderAll(); _syncing = false; }
    _render();
  }

  // ── output: a NEW clip on a NEW page. The source is never touched. ─────────
  function _output() {
    var VE = _VE();
    var clip = VE._findClipById(_clipId);
    if (!clip) { _toast('Clip not found', 'error'); return false; }
    if (!_cams.length) { _toast('At least one camera required', 'error'); return false; }

    // Snapshot BEFORE switching: switchPage saves and swaps the live project out from under us.
    var copy = VE._veCloneClip(clip);
    copy.id = VE._veUid ? VE._veUid('clip') : ('clip-' + Math.random().toString(36).slice(2));
    copy.scLayout = _layout();
    delete copy.crop;                      // the layout owns the framing now
    copy.fit = 'cover';
    copy.startTime = 0;
    // Name it after WHO is in it, not the source file. The timeline label falls back to clip.name
    // for anything the SmartCam branch does not cover, and "6TLpqcB1...mp4" says nothing.
    copy.name = _cams.map(function (c) { return c.label; }).join(' · ');

    if (typeof pages === 'undefined' || typeof switchPage !== 'function' || typeof saveCurrentPage !== 'function') {
      _toast('Page system not found', 'error'); return false;
    }
    _exit();                               // the boxes must not travel to the new page
    var nCams = _cams.length;

    // DO NOT try to land the clip AFTER switchPage. Two measured reasons:
    //   1. switchPage is not synchronous for a video page (it activates, then loads the page's
    //      project), so an immediate push lands on the OLD page's project and is then replaced.
    //   2. You cannot detect the swap by identity either: _veRestoreProject MUTATES the singleton
    //      VE._veProject IN PLACE (`VE._veProject.tracks = ...`, project.js:184), so
    //      `proj === oldProj` is true forever and a poll on it never fires.
    // So the race is not waited out, it is removed: write the page's project BEFORE switching.
    // _veLoadForPage reads VE._vePageProjects[pageId] (falling back to page._videoProject) and
    // restores it, which is exactly the shape below.
    saveCurrentPage();

    var page = { json: null, bg: '#000000', label: 'SmartCam ' + _ratioName(),
                 w: _target.w, h: _target.h, _productType: 'video' };
    page._pageId = 'pg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
    var newIdx = pages.length;
    pages.push(page);

    // Build the project in the EXACT shape _veRestoreProject expects. Three things were wrong when
    // this was hand-rolled from memory, and all three were silent:
    //   1. no poolMeta      -> restore rebuilds the videoPool from saved.poolMeta ONLY, so the clip
    //                          had no <video> element and the page rendered BLACK while the
    //                          timeline thumbnails (which come from the clip, not the pool) looked fine.
    //   2. track.name       -> the real field is 'label'. The track header read "undefined".
    //   3. one track        -> _veBuildDefaultTracks makes FOUR. One is not what a new page looks like.
    var srcEl = (VE._vePlayback && VE._vePlayback.videoPool) ? VE._vePlayback.videoPool[clip.id] : null;
    var poolMeta = {};
    var mediaSrc = (srcEl && (srcEl.src || srcEl.currentSrc)) || copy.src;
    if (mediaSrc) {
      poolMeta[copy.id] = {
        src: mediaSrc,
        type: 'video',
        // Keep the SOURCE's media id: the blob is already in IndexedDB under it, and minting a
        // fresh one would orphan the bytes and re-upload the same file.
        mediaId: VE._veSourceIdFor ? VE._veSourceIdFor(copy, srcEl, copy.id) : ('vem-' + copy.id)
      };
    }

    var tracks = [];
    for (var ti = 0; ti < 4; ti++) {
      tracks.push({ id: VE._veUid ? VE._veUid('t') : ('t-' + Date.now() + '-' + ti),
                    label: 'Track ' + (ti + 1), type: 'video',
                    muted: false, locked: false, solo: false, collapsed: false, clips: [] });
    }
    tracks[0].clips.push(copy);

    var proj = {
      // The aspect is PER PAGE and already plumbed: events.js:142 activates VideoCanvas with
      // VE._veProject.aspectRatio, and project.js serializes (:163) and restores (:188) it. So the
      // page's size is set by this ONE field, not by reaching into VideoCanvas._ar. Without it,
      // enforceDimensions re-derives from the stale 16:9 on every render and forces the page back
      // to 1920x1080 (measured: that is exactly what happened).
      aspectRatio: _ratioKey(),
      duration: copy.duration || 0,
      playheadTime: 0,
      zoom: VE.PX_PER_SEC_DEFAULT,
      bgColor: '#000000',
      bgGradient: null,
      bgImage: null,
      bgFit: 'cover',
      _bgClipId: null,
      undoStack: [],
      undoIdx: -1,
      selectedClips: [copy.id],
      poolMeta: poolMeta,
      tracks: tracks
    };

    // Publish it BOTH ways before switching. _veLoadForPage reads VE._vePageProjects[pageId] and
    // falls back to page._videoProject (the reload path), so writing only one leaves the project
    // findable in this session and gone after a refresh.
    VE._vePageProjects = VE._vePageProjects || {};
    VE._vePageProjects[page._pageId] = proj;
    page._videoProject = proj;

    switchPage(newIdx, true);              // restores the project above, aspect and all
    _toast(nCams + ' camera ' + _ratioName() + ' output added to new page');
    return true;
  }

  // VideoCanvas keys its size table by aspect STRING ('9:16' -> 1080x1920), so hand it the key it
  // knows rather than a size it would have to reverse-engineer.
  function _ratioKey() {
    var m = PRESETS.filter(function (p) { return Math.abs(p.w / p.h - _target.w / _target.h) < 1e-6; })[0];
    return m ? m.id : '16:9';
  }

  // ── shell: draggable + resizable + pop-out, mirroring the multicam monitor ─
  function _savePos() {
    if (!_p || _p.classList.contains('is-popped')) return;
    try {
      localStorage.setItem(GEOM_KEY, JSON.stringify({
        l: parseInt(_p.style.left, 10) || 0, t: parseInt(_p.style.top, 10) || 0,
        w: _p.offsetWidth, h: _p.offsetHeight
      }));
    } catch (e) {}
  }

  function _restorePos() {
    var g = null;
    try { g = JSON.parse(localStorage.getItem(GEOM_KEY) || 'null'); } catch (e) {}
    if (!g || !(g.w > 200) || !(g.h > 150)) return false;
    _p.style.width = Math.min(g.w, window.innerWidth - 16) + 'px';
    _p.style.height = Math.min(g.h, window.innerHeight - 16) + 'px';
    _p.style.left = Math.max(0, Math.min(window.innerWidth - 120, g.l)) + 'px';
    _p.style.top = Math.max(0, Math.min(window.innerHeight - 60, g.t)) + 'px';
    return true;
  }

  function _center() {
    var w = _p.offsetWidth || 300, h = _p.offsetHeight || 480;
    _p.style.left = Math.max(8, window.innerWidth - w - 24) + 'px';
    _p.style.top = Math.max(8, Math.round((window.innerHeight - h) / 2)) + 'px';
  }

  function _initDrag() {
    var head = _p.querySelector('.ve-sc-head');
    if (!head) return;
    head.addEventListener('mousedown', function (e) {
      if (_p.classList.contains('is-popped')) return;      // the OS moves a real window
      if (e.target.closest('button, select, input')) return;
      var sx = e.clientX, sy = e.clientY;
      var sl = parseInt(_p.style.left, 10) || 0, st = parseInt(_p.style.top, 10) || 0;
      function mv(ev) {
        _p.style.left = Math.max(0, Math.min(window.innerWidth - 80, sl + ev.clientX - sx)) + 'px';
        _p.style.top = Math.max(0, Math.min(window.innerHeight - 40, st + ev.clientY - sy)) + 'px';
      }
      function up() {
        document.removeEventListener('mousemove', mv);
        document.removeEventListener('mouseup', up);
        _savePos();
      }
      document.addEventListener('mousemove', mv);
      document.addEventListener('mouseup', up);
      e.preventDefault();
    });
    // ResizeObserver measured 0 callbacks for a CSS `resize` grip on the monitor; mouseup is what
    // actually fires. Same grip, same fix.
    _p.addEventListener('mouseup', function () { _savePos(); });
  }

  function _syncPopBtn() {
    var b = _p && _p.querySelector('#ve-sc-pop');
    if (!b) return;
    var out = !!(_win && !_win.closed);
    b.innerHTML = _icon(out ? 'minimize-2' : 'external-link', 14);
    b.title = out ? 'Dock to this window' : 'Open in separate window (dual monitor)';
  }

  function _popOut() {
    if (_win && !_win.closed) { _win.focus(); return; }
    var w = window.open('', 'ccSmartCam', 'width=360,height=760,menubar=no,toolbar=no,location=no');
    if (!w) { _toast('Browser blocked new window', 'error'); return; }
    var d = w.document;
    d.write('<!doctype html><html><head><meta charset="utf-8"><title>SmartCam</title></head><body></body></html>');
    d.close();
    Array.prototype.forEach.call(
      document.querySelectorAll('link[rel="stylesheet"], style'),
      function (n) { try { d.head.appendChild(n.cloneNode(true)); } catch (e) {} }
    );
    d.body.style.cssText = 'margin:0;padding:0;background:#1b1b1f;overflow:hidden;';
    _savePos();
    _p.classList.add('is-popped');
    // Drop the inline geometry: it was written for the floating panel and inline styles beat
    // class rules, so leaving it makes .is-popped's "fill the window" never apply.
    _p.style.width = ''; _p.style.height = ''; _p.style.left = ''; _p.style.top = '';
    d.body.appendChild(d.adoptNode(_p));
    w.addEventListener('beforeunload', function () { _popIn(); });
    _win = w;
    // rAF is throttled to ~0 in a background window, so the preview must be driven by the window
    // that is actually visible. Same bug the monitor's popped-out cells had.
    if (_open) { if (_raf) cancelAnimationFrame(_raf); _tick(); }
    _syncPopBtn();
  }

  function _popIn() {
    if (!_p) return;
    _win = null;
    _p.classList.remove('is-popped');
    document.body.appendChild(document.adoptNode(_p));
    if (!_restorePos()) _center();
    if (_open) { if (_raf) cancelAnimationFrame(_raf); _tick(); }
    _syncPopBtn();
  }

  function _rafWin() { return (_win && !_win.closed) ? _win : window; }

  function _build() {
    if (_p) return;
    _p = document.createElement('div');
    _p.className = 've-sc';
    _p.id = 've-sc-panel';
    _p.innerHTML =
      '<div class="ve-sc-head">' +
        '<span class="ve-sc-title">' + _icon('layout', 13) + 'SmartCam</span>' +
        '<div class="ve-sc-head-r">' +
          '<button class="ve-sc-icon" id="ve-sc-pop"></button>' +
          '<button class="ve-sc-icon" id="ve-sc-close" title="Close">' + _icon('x', 14) + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="ve-sc-bar">' +
        '<select id="ve-sc-target" class="ve-sc-sel" title="Output ratio"></select>' +
        '<div class="ve-sc-lays" id="ve-sc-lay"></div>' +
        '<button class="ve-sc-ghost" id="ve-sc-add" title="Add camera">' + _icon('plus', 12) + '</button>' +
      '</div>' +
      '<div class="ve-sc-cams" id="ve-sc-cams"></div>' +
      '<div class="ve-sc-pvwrap"><canvas id="ve-sc-preview" class="ve-sc-pv"></canvas></div>' +
      '<div class="ve-sc-foot">' +
        '<span class="ve-sc-foot-i" id="ve-sc-status"></span>' +
        '<button class="ve-sc-btn is-primary" id="ve-sc-out"></button>' +
      '</div>' +
      '<i class="ve-sc-grip"></i>';
    document.body.appendChild(_p);

    var tsel = _p.querySelector('#ve-sc-target');
    PRESETS.forEach(function (p) {
      var o = document.createElement('option');
      o.value = p.id; o.textContent = p.label; tsel.appendChild(o);
    });

    _p.querySelector('#ve-sc-close').addEventListener('click', hide);
    _p.querySelector('#ve-sc-pop').addEventListener('click', function () {
      (_win && !_win.closed) ? _popIn() : _popOut();
    });
    _p.querySelector('#ve-sc-add').addEventListener('click', _addCam);
    _p.querySelector('#ve-sc-out').addEventListener('click', function () { if (_output()) hide(); });
    tsel.addEventListener('change', function () {
      var p = PRESETS.filter(function (x) { return x.id === tsel.value; })[0];
      if (!p) return;
      _target = { w: p.w, h: p.h };
      // A layout picked for a portrait output is usually wrong for a landscape one, so the
      // orientation's default is re-applied rather than silently kept.
      _layoutId = _defaultId(); _rowShares = null; _cellShares = null;
      _refitAll();
      _buildRects();
      _render();
    });

    _p.querySelector('#ve-sc-lay').addEventListener('click', function (e) {
      var b = e.target.closest('[data-lay]');
      if (!b) return;
      _layoutId = b.dataset.lay;
      _rowShares = null; _cellShares = null;                 // a different arrangement has different rows
      _refitAll();
      _buildRects();
      _render();
    });

    var cams = _p.querySelector('#ve-sc-cams');
    cams.addEventListener('click', function (e) {
      var d = e.target.closest('[data-del]');
      if (d) { _delCam(Number(d.dataset.del)); return; }
      if (e.target.closest('input')) return;
      var row = e.target.closest('.ve-sc-cam');
      if (row) _select(Number(row.dataset.idx));
    });
    cams.addEventListener('input', function (e) {
      var t = e.target;
      if (t.classList.contains('ve-sc-name')) {
        var i = Number(t.dataset.idx);
        _cams[i].label = t.value || ('Kamera ' + (i + 1));
      }
    });
    cams.addEventListener('change', function (e) {
      var t = e.target;
      if (t.type === 'number' && t.dataset.idx != null) _setShare(Number(t.dataset.idx), Number(t.value) || 50);
    });

    _bindSeams();
    _initDrag();
    _syncPopBtn();
  }

  // ── mode ───────────────────────────────────────────────────────────────────
  function show() {
    var VE = _VE();
    if (!VE || !VE._veIsActive || !VE._veIsActive()) { _toast('First open the video editor', 'error'); return; }
    var clip = _pickClip();
    if (!clip) { _toast('First select a video clip', 'error'); return; }
    _clipId = clip.id;

    var c = _canvasSize();
    _target = (c.w >= c.h) ? { w: 1080, h: 1920 } : { w: c.w, h: c.h };

    _build();
    var tsel = _p.querySelector('#ve-sc-target');
    var match = PRESETS.filter(function (p) { return Math.abs(p.w / p.h - _target.w / _target.h) < 1e-6; })[0];
    if (match) tsel.value = match.id; else { _target = { w: 1080, h: 1920 }; tsel.value = '9:16'; }

    _cams = []; _layoutId = null; _rowShares = null; _cellShares = null;
    var L = clip.scLayout;
    if (L && L.rows && L.rows.length) {
      L.rows.forEach(function (row) {
        (row.cells || []).forEach(function (cell) {
          _cams.push({ crop: { x: cell.crop.x, y: cell.crop.y, w: cell.crop.w, h: cell.crop.h },
                       label: cell.label || ('Kamera ' + (_cams.length + 1)) });
        });
      });
      _layoutId = L.layoutId || null;
      var rs = L.rows.map(function (r) { return +r.share; });
      if (rs.every(function (x) { return isFinite(x) && x > 0; })) _rowShares = rs;
      var cs = L.rows.map(function (r) { return (r.cells || []).map(function (c) { return +c.share; }); });
      if (cs.every(function (a) { return a.length && a.every(function (x) { return isFinite(x) && x > 0; }); })) _cellShares = cs;
    } else if (L && L.cells && L.cells.length) {          // the pre-grid shape
      L.cells.forEach(function (cell, i) {
        _cams.push({ crop: { x: cell.crop.x, y: cell.crop.y, w: cell.crop.w, h: cell.crop.h },
                     label: cell.label || ('Kamera ' + (i + 1)) });
      });
    }
    if (!_cams.length) {
      _cams = [{ crop: null, label: 'Camera 1' }, { crop: null, label: 'Camera 2' }];
    }
    if (!_layoutId || !_options().filter(function (o) { return o.id === _layoutId; }).length) {
      _layoutId = _defaultId();
    }
    if (!_cams[0].crop) { _cams[0].crop = _boxAt(0.28, 0.5, 0.62, 0); _cams[1].crop = _boxAt(0.72, 0.5, 0.62, 1); }
    _sel = 0;

    var cvs = _cvs();
    if (cvs) {
      cvs.on('object:modified', _onModified);
      cvs.on('selection:created', _onSelected);
      cvs.on('selection:updated', _onSelected);
    }
    _buildRects();
    _p.style.display = 'flex';
    if (!_p.classList.contains('is-popped') && !_restorePos()) _center();
    _open = true;
    _render();
    if (_raf) cancelAnimationFrame(_raf);
    _tick();
  }

  var _lastT = -1;
  function _tick() {
    if (!_open) return;
    var VE = _VE();
    var t = VE && VE._veProject ? VE._veProject.playheadTime : 0;
    if (Math.abs(t - _lastT) > 0.03) { _lastT = t; _renderPreview(); }
    _raf = _rafWin().requestAnimationFrame(_tick);
  }

  function _exit() {
    if (_raf) { try { _rafWin().cancelAnimationFrame(_raf); } catch (e) {} _raf = null; }
    var cvs = _cvs();
    if (cvs) {
      cvs.off('object:modified', _onModified);
      cvs.off('selection:created', _onSelected);
      cvs.off('selection:updated', _onSelected);
    }
    _clearRects();
    _open = false;
  }

  function hide() {
    _exit();
    if (_win && !_win.closed) { _popIn(); try { _win.close(); } catch (e) {} _win = null; }
    if (_p) _p.style.display = 'none';
  }

  function toggle() { _open ? hide() : show(); }

  window.VESmartCam = {
    show: show, hide: hide, toggle: toggle,
    isOpen: function () { return _open; },
    popOut: _popOut, popIn: _popIn,
    isPopped: function () { return !!(_win && !_win.closed); },
    _cams: function () { return _cams; },
    _rects: function () { return _rects; },
    _target: function () { return _target; },
    _setTarget: function (w, h) { _target = { w: w, h: h }; _refitAll(); _buildRects(); _render(); },
    _boxAt: _boxAt,
    _bandRatio: _bandRatio,
    _slots: _slots,
    _seamAt: _seamAt,
    _moveSeam: _moveSeam,
    _rowShares: function () { return _rowShares; },
    _cellShares: function () { return _cellShares; },
    _slotName: _slotName,
    _options: _options,
    _setLayout: function (id) { _layoutId = id; _rowShares = null; _cellShares = null; _refitAll(); _buildRects(); _render(); },
    _layoutId: function () { return _layoutDef().id; },
    _layout: _layout,
    _readRect: _readRect,
    _setShare: _setShare,
    _addCam: _addCam,
    _select: _select,
    _output: _output
  };
})();
