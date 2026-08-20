/* core/element-tools.js — element-creation engine (Add to canvas).
   Moved VERBATIM from js/app.js section 11 (Faz 3 core slimming). initElementTools wires the
   ~40 left-panel element buttons (#tool-rect / #tool-circle / #tool-heading / shapes …) and
   defines window.addToCenter — the shared "drop an object at the canvas centre" helper that
   ~23 callers use (brush, radial-menu, shortcuts, ai, charts, gallery, items, dynamic …).
   Kept flat global (NOT an IIFE) so initElementTools + addToCenter stay global exactly as
   before. Loaded as an always-loaded <script> BEFORE app.js, so app.js initApp() still calls
   initElementTools() (the buttons are wired at init, as before). All deps (canvas, fabric,
   getCanvasScale, getCanvasCenter, histLocked, snap) are app.js globals resolved at call time. */
function initElementTools() {
  function addToCenter(obj) {
    // Scene (frame-canvas): drop the object into the active frame (membership + clip) instead of the
    // viewport center. Flag-gated; falls back to classic if scene off / no active frame.
    if (typeof ccFlag === 'function' && ccFlag('scene') && window.SceneEditor && SceneEditor.isActive() &&
        typeof _scAddObjectToFrame === 'function' && _scAddObjectToFrame(obj)) {
      return;
    }
    var vpt = canvas.viewportTransform || [1,0,0,1,0,0];
    var zoom = canvas.getZoom() || 1;
    var cx = (canvas.getWidth() / 2 - vpt[4]) / zoom;
    var cy = (canvas.getHeight() / 2 - vpt[5]) / zoom;
    var w = obj.width || 100;
    var h = obj.height || 100;
    var sx = obj.scaleX || 1;
    var sy = obj.scaleY || 1;
    if (obj.originX === 'center' && obj.originY === 'center') {
      obj.set({ left: cx, top: cy });
    } else {
      obj.set({ left: cx - (w * sx) / 2, top: cy - (h * sy) / 2 });
    }
    // histLocked suppresses the auto-snap during the add (one clean undo step,
    // snap() runs explicitly below). But the video overlay bridge ALSO reads
    // histLocked to skip restore replays - so a plain user add in video mode
    // would wrongly be treated as a restore and never become a timeline clip.
    // _ccAddingObject marks THIS as a genuine user add so overlay.js still
    // creates the clip (owner: "text elements not added to the track list").
    histLocked = true;
    window._ccAddingObject = true;
    canvas.add(obj);
    canvas.setActiveObject(obj);
    window._ccAddingObject = false;
    histLocked = false;
    canvas.calcOffset();
    canvas.renderAll();
    snap();
  }
  window.addToCenter = addToCenter;

  // ── Shape factory (professional defaults, owner 2026-07-12) ──
  // Single source of truth for new-shape styling: solid neutral fill (no ugly
  // semi-transparent interior), no stroke, modest corner radius. Recolor is one
  // click in the right panel. Every shape below is built through _shapeBase so the
  // 16-shape roster stays visually consistent and clippable (image-in-shape).
  var SHAPE_FILL = '#C9CDD6';
  function _shapeBase(extra) {
    var base = { fill: SHAPE_FILL, strokeWidth: 0, opacity: 1, selectable: true, evented: true };
    if (extra) { for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) base[k] = extra[k]; } }
    return base;
  }
  function _regularPolygonPts(sides, radius, rotation) {
    var pts = [], rot = (typeof rotation === 'number') ? rotation : (-Math.PI / 2);
    for (var i = 0; i < sides; i++) {
      var a = (Math.PI * 2 * i / sides) + rot;
      pts.push({ x: radius + radius * Math.cos(a), y: radius + radius * Math.sin(a) });
    }
    return pts;
  }

  var toolHeading = document.getElementById('tool-heading');
  if (toolHeading) {
    toolHeading.addEventListener('click', function () {
      function makeHeading() {
        var s = getCanvasScale();
        var _hTb = new fabric.Textbox('Heading', {
          fontFamily: 'Unbounded', fontSize: Math.round(28 * s),
          fill: '#ffffff', fontWeight: '700',
          width: Math.round(300 * s),
        });
        // Fit the box to the text so it isn't a fixed-300 wide box (still manually resizable).
        try { _hTb.set('width', Math.max(40, Math.ceil(_hTb.calcTextWidth()) + 6)); } catch (e) {}
        addToCenter(_hTb);
      }
      // "Add a heading" uses Unbounded — a display font used nowhere else in the app, so on a
      // cold load its binary hasn't downloaded and the box would be measured with FALLBACK
      // metrics, leaving the frame mismatched with the glyphs. ("Add a subheading" never hits
      // this: its DM Sans is the panel UI font, already loaded.) Load the real font FIRST, then
      // create + measure, so the frame is correct on the very first add.
      if (document.fonts && typeof document.fonts.load === 'function') {
        document.fonts.load('700 16px "Unbounded"', 'Heading').then(makeHeading, makeHeading);
      } else {
        makeHeading();
      }
    });
  }

  var toolBody = document.getElementById('tool-body');
  if (toolBody) {
    toolBody.addEventListener('click', function () {
      var s = getCanvasScale();
      var _bTb = new fabric.Textbox('Body text', {
        fontFamily: 'DM Sans', fontSize: Math.round(14 * s),
        fill: '#ffffff', width: Math.round(200 * s),
      });
      try { _bTb.set('width', Math.max(40, Math.ceil(_bTb.calcTextWidth()) + 6)); } catch (e) {}
      addToCenter(_bTb);
    });
  }

  // ── Contact Text Presets ──
  (function initContactPresets() {
    var presetBtns = document.querySelectorAll('.contact-preset-btn');
    if (!presetBtns.length) return;

    // Set icons on preset buttons
    var icoMap = {
      'cp-ico-phone': 'phone', 'cp-ico-email': 'email',
      'cp-ico-web': 'globe', 'cp-ico-addr': 'mapPin', 'cp-ico-full': 'card',
      'cp-ico-linkedin': 'linkedin', 'cp-ico-instagram': 'instagram',
      'cp-ico-twitter': 'twitter', 'cp-ico-facebook': 'facebook',
      'cp-ico-social-set': 'social'
    };
    Object.keys(icoMap).forEach(function(id) {
      var el = document.getElementById(id);
      if (el) {
        var svg = (typeof ICONS !== 'undefined') ? ICONS[icoMap[id]] : null;
        if (svg) el.innerHTML = svg.replace(/width="\d+"/, 'width="14"').replace(/height="\d+"/, 'height="14"');
      }
    });

    function getProfile() {
      return (typeof userInfo !== 'undefined') ? userInfo : {};
    }

    // Map preset names to ICONS keys
    var presetIconMap = {
      phone: 'phone', email: 'email', website: 'globe', address: 'mapPin',
      linkedin: 'linkedin', instagram: 'instagram', twitter: 'twitter', facebook: 'facebook'
    };

    // Build a single icon+text row as a Fabric Group
    function buildIconTextRow(iconKey, text, yOffset) {
      var s = (typeof getCanvasScale === 'function') ? getCanvasScale() : 1;
      var fs = Math.round(12 * s);
      var tw = Math.round(180 * s);
      var icoSize = Math.round(14 * s);
      var svgStr = (typeof ICONS !== 'undefined' && ICONS[iconKey]) ? ICONS[iconKey] : null;
      if (!svgStr) {
        // fallback: just text
        return { obj: new fabric.Textbox(text, { fontFamily: 'DM Sans', fontSize: fs, fill: '#ffffff', left: 0, top: yOffset, width: tw }), h: Math.round(18 * s) };
      }
      // Make icon white
      svgStr = svgStr.replace(/width="\d+"/, 'width="' + icoSize + '"').replace(/height="\d+"/, 'height="' + icoSize + '"')
        .replace(/stroke="currentColor"/g, 'stroke="#ffffff"');
      return new Promise(function(resolve) {
        fabric.loadSVGFromString(svgStr, function(objects, options) {
          var ico = fabric.util.groupSVGElements(objects, options);
          ico.set({ left: 0, top: yOffset + 1, scaleX: s, scaleY: s });
          var txt = new fabric.Textbox(text, {
            fontFamily: 'DM Sans', fontSize: fs, fill: '#ffffff',
            left: Math.round(20 * s), top: yOffset, width: tw
          });
          resolve({ objs: [ico, txt], h: Math.max(Math.round(16 * s), txt.height || Math.round(18 * s)) });
        });
      });
    }

    // Build multi-line set (full-contact / social-set)
    function buildMultiRowGroup(rows, callback) {
      var allObjs = [];
      var y = 0;
      var pending = rows.length;
      var results = new Array(rows.length);

      rows.forEach(function(row, i) {
        var p = buildIconTextRow(row.icon, row.text, 0);
        if (p && typeof p.then === 'function') {
          p.then(function(res) {
            results[i] = res;
            pending--;
            if (pending === 0) assembleGroup();
          });
        } else {
          results[i] = { objs: [p.obj], h: p.h };
          pending--;
          if (pending === 0) assembleGroup();
        }
      });

      function assembleGroup() {
        var yOff = 0;
        var spacing = 6;
        results.forEach(function(res) {
          if (!res) return;
          var items = res.objs || [res.obj];
          items.forEach(function(o) { o.set({ top: o.top + yOff }); });
          allObjs = allObjs.concat(items);
          yOff += res.h + spacing;
        });
        callback(allObjs);
      }
    }

    presetBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var preset = btn.getAttribute('data-preset');
        var info = getProfile();

        // Multi-row sets
        if (preset === 'full-contact') {
          var contactRows = [
            { icon: 'phone', text: info.phone || '+1 (555) 000-0000' },
            { icon: 'email', text: info.email || 'email@example.com' },
            { icon: 'globe', text: info.website || 'www.example.com' },
            { icon: 'mapPin', text: info.address || '123 Main St, City' }
          ];
          buildMultiRowGroup(contactRows, function(objs) {
            var grp = new fabric.Group(objs, { left: 0, top: 0 });
            addToCenter(grp);
          });
          return;
        }
        if (preset === 'social-set') {
          var socialRows = [
            { icon: 'linkedin', text: info.linkedin || 'linkedin.com/in/username' },
            { icon: 'instagram', text: info.instagram || '@instagram' },
            { icon: 'twitter', text: info.twitter || '@twitter' },
            { icon: 'facebook', text: info.facebook || 'facebook.com/username' }
          ];
          buildMultiRowGroup(socialRows, function(objs) {
            var grp = new fabric.Group(objs, { left: 0, top: 0 });
            addToCenter(grp);
          });
          return;
        }

        // Single icon+text presets
        var textMap = {
          phone:     { text: info.phone || '+1 (555) 000-0000', role: 'phone' },
          email:     { text: info.email || 'email@example.com', role: 'email' },
          website:   { text: info.website || 'www.example.com', role: 'website' },
          address:   { text: info.address || '123 Main St, City', role: 'address' },
          linkedin:  { text: info.linkedin || 'linkedin.com/in/username', role: 'linkedin' },
          instagram: { text: info.instagram || '@username', role: 'instagram' },
          twitter:   { text: info.twitter || '@username', role: 'twitter' },
          facebook:  { text: info.facebook || 'facebook.com/username', role: 'facebook' }
        };

        var data = textMap[preset];
        if (!data) return;
        var iconKey = presetIconMap[preset];

        var p = buildIconTextRow(iconKey, data.text, 0);
        if (p && typeof p.then === 'function') {
          p.then(function(res) {
            var grp = new fabric.Group(res.objs, { left: 0, top: 0 });
            if (data.role) grp._fieldRole = data.role;
            addToCenter(grp);
          });
        } else {
          var obj = p.obj;
          if (data.role) obj._fieldRole = data.role;
          addToCenter(obj);
        }
      });
    });
  })();

  // ── Shapes (premium 16 roster, owner 2026-07-12) ──
  // All built through _shapeBase: solid neutral fill, no stroke. Rebuilt from the
  // old 32-shape set (16 non-premium shapes removed: wave, octagon, badge, ribbon,
  // crown, lightning, leaf, flame, droplet, sun, moon, spiral, shield, arch,
  // trapezoid, parallelogram). Every shape stays image-clippable (Ctrl+M).

  var toolRect = document.getElementById('tool-rect');
  if (toolRect) {
    toolRect.addEventListener('click', function () {
      addToCenter(new fabric.Rect(_shapeBase({ width: 200, height: 140, rx: 8, ry: 8 })));
    });
  }

  // Sharp rectangle (no corner radius) — owner request 2026-07-12.
  var toolSquare = document.getElementById('tool-square');
  if (toolSquare) {
    toolSquare.addEventListener('click', function () {
      addToCenter(new fabric.Rect(_shapeBase({ width: 150, height: 150, rx: 0, ry: 0 })));
    });
  }

  var toolCircle = document.getElementById('tool-circle');
  if (toolCircle) {
    toolCircle.addEventListener('click', function () {
      addToCenter(new fabric.Circle(_shapeBase({ radius: 70 })));
    });
  }

  var toolOval = document.getElementById('tool-oval');
  if (toolOval) {
    toolOval.addEventListener('click', function () {
      addToCenter(new fabric.Ellipse(_shapeBase({ rx: 90, ry: 58 })));
    });
  }

  var toolTriangle = document.getElementById('tool-triangle');
  if (toolTriangle) {
    toolTriangle.addEventListener('click', function () {
      addToCenter(new fabric.Triangle(_shapeBase({ width: 140, height: 124 })));
    });
  }

  var toolLine = document.getElementById('tool-line');
  if (toolLine) {
    toolLine.addEventListener('click', function () {
      var w = canvas.getWidth();
      addToCenter(new fabric.Rect(_shapeBase({ width: Math.min(w * 0.7, 420), height: 4, rx: 2, ry: 2 })));
    });
  }

  var toolArrow = document.getElementById('tool-arrow');
  if (toolArrow) {
    toolArrow.addEventListener('click', function () {
      addToCenter(new fabric.Path('M0 26 L74 26 L74 8 L120 42 L74 76 L74 58 L0 58 Z', _shapeBase()));
    });
  }

  var toolStar = document.getElementById('tool-star');
  if (toolStar) {
    toolStar.addEventListener('click', function () {
      var pts = [], spikes = 5, outer = 55, inner = 24;
      for (var i = 0; i < spikes * 2; i++) {
        var rad = i % 2 === 0 ? outer : inner;
        var ang = (Math.PI * i) / spikes - Math.PI / 2;
        pts.push({ x: outer + Math.cos(ang) * rad, y: outer + Math.sin(ang) * rad });
      }
      addToCenter(new fabric.Polygon(pts, _shapeBase()));
    });
  }

  var toolDiamond = document.getElementById('tool-diamond');
  if (toolDiamond) {
    toolDiamond.addEventListener('click', function () {
      addToCenter(new fabric.Rect(_shapeBase({ width: 100, height: 100, angle: 45, originX: 'center', originY: 'center' })));
    });
  }

  var toolPentagon = document.getElementById('tool-pentagon');
  if (toolPentagon) {
    toolPentagon.addEventListener('click', function () {
      addToCenter(new fabric.Polygon(_regularPolygonPts(5, 55), _shapeBase()));
    });
  }

  var toolHexagon = document.getElementById('tool-hexagon');
  if (toolHexagon) {
    toolHexagon.addEventListener('click', function () {
      addToCenter(new fabric.Polygon(_regularPolygonPts(6, 55), _shapeBase()));
    });
  }

  var toolHeart = document.getElementById('tool-heart');
  if (toolHeart) {
    toolHeart.addEventListener('click', function () {
      addToCenter(new fabric.Path('M50 88 C12 60 2 36 2 20 C2 8 11 0 22 0 C34 0 45 8 50 20 C55 8 66 0 78 0 C89 0 98 8 98 20 C98 36 88 60 50 88 Z', _shapeBase()));
    });
  }

  var toolBlob = document.getElementById('tool-blob');
  if (toolBlob) {
    toolBlob.addEventListener('click', function () {
      addToCenter(new fabric.Path('M56 3 C82 6 104 22 106 48 C108 74 92 96 66 104 C42 111 14 104 5 80 C-4 56 6 30 26 14 C36 6 46 2 56 3 Z', _shapeBase()));
    });
  }

  var toolCloudShape = document.getElementById('tool-cloud-shape');
  if (toolCloudShape) {
    toolCloudShape.addEventListener('click', function () {
      addToCenter(new fabric.Path('M25 62 A20 20 0 0 1 30 24 A26 26 0 0 1 72 20 A22 22 0 0 1 92 44 A18 18 0 0 1 82 72 L25 72 A20 20 0 0 1 25 62 Z', _shapeBase()));
    });
  }

  var toolCross = document.getElementById('tool-cross');
  if (toolCross) {
    toolCross.addEventListener('click', function () {
      addToCenter(new fabric.Path('M35 0 L65 0 L65 35 L100 35 L100 65 L65 65 L65 100 L35 100 L35 65 L0 65 L0 35 L35 35 Z', _shapeBase()));
    });
  }

  var toolRing = document.getElementById('tool-ring');
  if (toolRing) {
    toolRing.addEventListener('click', function () {
      addToCenter(new fabric.Path('M50 0 A50 50 0 1 0 50 100 A50 50 0 1 0 50 0 Z M50 28 A22 22 0 1 1 50 72 A22 22 0 1 1 50 28 Z', _shapeBase({ fillRule: 'evenodd' })));
    });
  }

  var toolFrame = document.getElementById('tool-frame');
  if (toolFrame) {
    toolFrame.addEventListener('click', function () {
      addToCenter(new fabric.Rect(_shapeBase({ width: 170, height: 120, rx: 10, ry: 10 })));
    });
  }

  var toolQR = document.getElementById('tool-qr');
  if (toolQR) {
    toolQR.addEventListener('click', function () {
      var urlInput = document.getElementById('flyout-qr-url');
      var fgInput = document.getElementById('flyout-qr-fg');
      var bgInput = document.getElementById('flyout-qr-bg');
      var url = (urlInput && urlInput.value.trim()) || 'https://example.com';
      var fg = (fgInput && fgInput.value) || '#000000';
      var bg = (bgInput && bgInput.value) || '#ffffff';
      fabric.Image.fromURL(generateQRImage(url, fg, bg), function (img) {
        var c = getCanvasCenter();
        img.set({ left: c.x - 70, top: c.y - 70 });
        img.scaleToWidth(140);
        img.qrUrl = url;
        img.qrFg = fg;
        img.qrBg = bg;
        img.isQR = true;
        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.renderAll();
      });
    });
  }

  // (The old #tool-image "Upload Logo / Media" button lived in the Icons flyout section, which
  //  was dissolved when Icons moved into Items 2026-07-25. The same upload is still reachable
  //  from the Media panel toolbar and the radial menu, both of which click #logo-file directly.)
  var logoFile = document.getElementById('logo-file');
  if (logoFile) {
    logoFile.addEventListener('change', function (e) {
      var files = e.target.files;
      if (!files || !files.length) return;
      // The input is `multiple`; import EVERY selected file, not just files[0].
      for (var i = 0; i < files.length; i++) {
        _handleImportedMediaFile(files[i]);
      }
      logoFile.value = '';
    });
  }

  var toolIcon = document.getElementById('tool-icon');
  if (toolIcon) {
    toolIcon.addEventListener('click', function () {
      var picker = document.getElementById('icon-picker');
      if (picker) picker.classList.add('show');
    });
  }

  var iconPicker = document.getElementById('icon-picker');
  if (iconPicker) {
    iconPicker.addEventListener('click', function (e) {
      if (e.target.id === 'icon-picker') e.target.classList.remove('show');
    });
  }
}

// ── Modular skeleton hook (Faz 6) — element-tools is now a canvas-engine loader module
// (modules/canvas/element-tools/). Self-inits initElementTools (which wires the ~40 element
// buttons AND exposes window.addToCenter) on the sticky cc:canvas-ready event, inside cc.safe;
// app.js's initApp() call is removed. addToCenter's ~23 callers are all runtime (post-load), so
// they resolve it fine once this module has self-initialised. Deps (canvas/fabric/getCanvasScale/
// getCanvasCenter/histLocked/snap) are app.js globals resolved at call time.
if (window.cc && cc.on) {
  cc.on('cc:canvas-ready', function () {
    cc.safe('canvas.element-tools.init', function () {
      if (typeof initElementTools === 'function') initElementTools();
    });
  });
}
if (window.cc && cc.modules) {
  cc.modules.register({ id: 'element-tools', parent: 'canvas', title: 'Element tools', mount: function () {}, unmount: function () {} });
}
