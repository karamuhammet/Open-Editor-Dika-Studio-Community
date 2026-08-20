/* Module: scene/frame-object — the CCFrame PRIMITIVE (Faz A). A REAL container: a fabric.Group subclass
   that IS a page/artboard holding N child objects (text/image/shape/group). Distinct on purpose from the
   generic GROUP feature (type 'group'): own type 'ccframe', own Layers icon, enter-to-edit (Faz B),
   children clipped to the artboard. This is the from-scratch "frame object" the owner asked for — NOT a
   plain rectangle. Defined UNCONDITIONALLY (no flag gate) so saved scenes round-trip; builders/usage are
   scene-mode only. Additive: nothing else references it yet (wired in Faz B-D).
   See docs/frame-canvas-migration-plan.md + scene-ui-rework memory. */
(function (global) {
  'use strict';
  var fabric = global.fabric;
  if (!fabric) return;

  // Only _isFrameBg needs global registration (so the artboard child keeps its flag through the group's
  // child serialization). _ccFrame is already registered by scene/core; label/frameBg are added
  // EXPLICITLY in CCFrame.toObject — so we DON'T register them globally (keeps zero serialize footprint
  // on normal/single-page objects, which never have these props anyway).
  if (global.cc && cc.registerProps) cc.registerProps(['_isFrameBg']);

  var BORDER = 'rgba(0,0,0,0.18)';
  var ACCENT = '#7c5cff';

  // the artboard background rect (child[0]) — defines the frame's fixed page bounds + bg colour.
  // No stroke (keeps the group bbox exact = w×h); the border is painted in _render.
  function _makeBg(w, h, bg) {
    return new fabric.Rect({
      left: 0, top: 0, width: w, height: h, originX: 'left', originY: 'top',
      fill: bg || '#ffffff', selectable: false, evented: false, _isFrameBg: true
    });
  }

  // CCFrame = fabric.Group subclass. children = [ bgRect, ...content ]. Content clipped to the artboard.
  fabric.CCFrame = fabric.util.createClass(fabric.Group, {
    type: 'ccframe',
    _ccFrame: true,
    hasRotatingPoint: false,
    lockRotation: true,
    subTargetCheck: false,        // default: ONE unit; enter-to-edit (Faz B) flips this on while inside
    objectCaching: false,         // editor: edits to children must re-render live (no stale group cache)

    initialize: function (objects, options, isAlreadyGrouped) {
      options = options || {};
      this.label = options.label || 'Frame 1';
      this.frameBg = options.frameBg || '#ffffff';
      this.callSuper('initialize', objects || [], options, isAlreadyGrouped);
      this._ensureClip();
    },

    // clip content to the artboard bounds (group-local coords → travels/scales with the frame)
    _ensureClip: function () {
      this.clipPath = new fabric.Rect({
        width: this.width, height: this.height, left: 0, top: 0, originX: 'center', originY: 'center'
      });
    },

    // paint the page border crisply AFTER children, without affecting the group bbox
    _render: function (ctx) {
      this.callSuper('_render', ctx);
      var w = this.width, h = this.height;
      ctx.save();
      ctx.strokeStyle = BORDER;
      ctx.lineWidth = 1 / ((this.scaleX || 1) * (this.canvas ? this.canvas.getZoom() : 1) || 1);
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    },

    toObject: function (propsToInclude) {
      return fabric.util.object.extend(this.callSuper('toObject', propsToInclude), {
        label: this.label,
        frameBg: this.frameBg,
        _ccFrame: true
      });
    }
  });

  // fabric.util.getKlass('ccframe') resolves to fabric.Ccframe (capitalize→camelize) on loadFromJSON —
  // alias so deserialization finds the class.
  fabric.Ccframe = fabric.CCFrame;

  // round-trip: enliven children, then rebuild as an ALREADY-GROUPED frame (3rd arg) so coords stay local.
  fabric.CCFrame.fromObject = function (object, callback) {
    fabric.util.enlivenObjects(object.objects || [], function (enlivened) {
      var opts = fabric.util.object.clone(object, true);
      delete opts.objects;
      callback(new fabric.CCFrame(enlivened, opts, true));
    });
  };
  fabric.CCFrame.async = true;

  // style a CCFrame as a live, selectable scene frame (corners, cursor, shadow). Shared by builder + draw.
  global._scStyleFrameObject = function (fr) {
    fr.set({
      selectable: true, evented: true, hoverCursor: 'move', lockRotation: true, hasRotatingPoint: false,
      cornerColor: ACCENT, cornerStyle: 'circle', cornerSize: 9, transparentCorners: false, borderColor: ACCENT,
      shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.28)', blur: 22, offsetX: 0, offsetY: 6 })
    });
    if (fr.setControlsVisibility) fr.setControlsVisibility({ mtr: false });
    return fr;
  };

  // place a frame so its CENTER sits at world (cx,cy) — origin-agnostic (group ops can flip origin).
  global._scPlaceFrameObject = function (fr, x, y, w, h) {
    fr.setPositionByOrigin(new fabric.Point((x || 0) + w / 2, (y || 0) + h / 2), 'center', 'center');
    fr.setCoords();
    return fr;
  };

  // world top-left + size of a live frame, independent of its origin / scale baking. Measure the ARTBOARD
  // bg child (exactly w×h, no stroke) — NOT the group bbox, whose floating-point bounds can round ~1px
  // larger and would drift the clean model size on every serialize.
  global._scFrameRect = function (fr) {
    var c = fr.getCenterPoint();
    var sx = fr.scaleX || 1, sy = fr.scaleY || 1;
    var bg = global._scFrameBgChild ? global._scFrameBgChild(fr) : null;
    var w = bg ? (bg.width * (bg.scaleX || 1) * sx) : (fr.width * sx);
    var h = bg ? (bg.height * (bg.scaleY || 1) * sy) : (fr.height * sy);
    return { x: Math.round(c.x - w / 2), y: Math.round(c.y - h / 2), w: Math.round(w), h: Math.round(h) };
  };

  // ── builder: create a CCFrame at world (x,y), size (w,h), with optional LOCAL-coord content ──
  // content objects use frame-local coords (0,0 = artboard top-left); the frame is then centered at (x,y).
  global._scMakeFrameObject = function (x, y, w, h, opts) {
    opts = opts || {};
    var kids = [_makeBg(w, h, opts.bg)].concat(opts.objects || []);
    var fr = new fabric.CCFrame(kids, { label: opts.label || 'Frame 1', frameBg: opts.bg || '#ffffff' });
    global._scStyleFrameObject(fr);
    global._scPlaceFrameObject(fr, x, y, w, h);
    return fr;
  };

  // a frame's CONTENT children (excludes the artboard bg)
  global._scFrameContent = function (fr) {
    if (!fr || !fr._objects) return [];
    return fr._objects.filter(function (o) { return !o._isFrameBg; });
  };

  // the artboard bg child of a frame (or null)
  global._scFrameBgChild = function (fr) {
    if (!fr || !fr._objects) return null;
    return fr._objects.filter(function (o) { return o._isFrameBg; })[0] || null;
  };

  // a child's LOCAL position within its frame (0,0 = artboard top-left); assumes frame scale 1.
  global._scChildLocal = function (child, fr) {
    return { x: child.left + fr.width / 2, y: child.top + fr.height / 2 };
  };

  // add a child into a frame at a LOCAL position (group-relative insert; does NOT grow the frame bounds).
  global._scAddLocalChild = function (fr, child, localX, localY) {
    child.set({ left: localX - fr.width / 2, top: localY - fr.height / 2 });
    fr.add(child); fr.dirty = true;
    return child;
  };

  if (global.cc && cc.modules) {
    cc.modules.register({ id: 'frame-object', parent: 'scene', title: 'scene: frame-object', mount: function () {}, unmount: function () {} });
  }
})(window);
