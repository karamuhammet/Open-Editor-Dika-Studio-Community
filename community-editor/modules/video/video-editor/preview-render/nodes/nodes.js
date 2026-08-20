/* Module: video/video-editor/preview-render/nodes — THE GRADE NODE CHAIN.

   Owner 2026-07-17, after asking how Resolve/Premiere manage this: a clip's grade is a CHAIN of
   nodes, applied in order. Node 1 might warm the whole frame, node 2 might darken only the sky,
   node 3 might lift only a face. That is the thing our single `clip.colorGrading` + flat
   `clip.powerWindows` could not express: there was exactly one full-frame grade and every window
   was independent of every other.

   THE MODEL
     node = { id, name, enabled, grade: {<colorGrading shape>}, windows: [<powerWindow>, ...] }
     - windows EMPTY   -> the node's grade applies to the WHOLE frame.
     - windows PRESENT -> the node's grade applies only inside them (their union).
   This is Resolve's rule, and it is why the grade sits on the NODE and not on each window: two
   windows on one node are one region getting one look.

   THE STORAGE DECISION, and the trap it avoids.
   `clip.gradeNodes` is the SINGLE SOURCE OF TRUTH once it exists. The tempting shortcut was to let
   node 0's `grade` BE the same object as `clip.colorGrading` so old readers keep working. That is an
   alias, and a clip survives four JSON round-trips (clone, serialize, undo snapshot, restore): the
   first one turns one shared object into TWO independent copies, after which the node chain and
   `colorGrading` drift apart silently and each blames the other. So migration COPIES, and the
   legacy fields are then dropped from the clip. There is exactly one place the grade lives. */
(function () {
  'use strict';
  var VE = window.__ccVideoEditor;
  if (!VE) return;

  var _uid = 0;
  function _nid() { return 'gn' + (Date.now() % 1e7) + '_' + (++_uid); }

  VE._veNewGradeNode = function (name, grade, windows) {
    return {
      id: _nid(),
      name: name || 'Node',
      enabled: true,
      grade: grade || { enabled: true, preset: 'none' },
      windows: windows || []
    };
  };

  /* Migrate a legacy clip once, in place, and return the chain.

     Legacy shape -> chain:
       clip.colorGrading      -> node "Temel"   (no windows = whole frame)
       clip.powerWindows[i]   -> node "<shape> i+1" carrying that ONE window and ITS grade
     That mapping is behaviour-preserving by construction: the old renderer did exactly this, a
     full-frame grade followed by one masked pass per window, in this order. */
  VE._veNodes = function (clip) {
    if (!clip) return [];
    if (clip.gradeNodes && clip.gradeNodes.length) return clip.gradeNodes;

    var nodes = [];
    var cg = clip.colorGrading;
    // Only carry the base grade over if it actually does something: an untouched clip should open
    // with one empty node, not with a node full of defaults nobody chose.
    if (cg && (cg.enabled || cg.lutId || cg.preset)) {
      nodes.push(VE._veNewGradeNode('Basic', JSON.parse(JSON.stringify(cg)), []));
    }
    var pws = clip.powerWindows || [];
    for (var i = 0; i < pws.length; i++) {
      var w = JSON.parse(JSON.stringify(pws[i]));
      var g = w.grade || { enabled: true };
      delete w.grade;   // the grade moves to the NODE: that is the whole point of the chain
      var n = VE._veNewGradeNode(VE._vePwName(w.shape) + ' ' + (i + 1), g, [w]);
      n.enabled = w.enabled !== false;
      nodes.push(n);
    }
    if (!nodes.length) nodes.push(VE._veNewGradeNode('Basic', { enabled: true, preset: 'none' }, []));

    clip.gradeNodes = nodes;
    // Drop the legacy fields. Keeping them would leave two writable homes for one grade, and the
    // next JSON round-trip would make them independent and let them disagree forever.
    delete clip.colorGrading;
    delete clip.powerWindows;
    return nodes;
  };

  var PW_NAMES = { ellipse: 'Circle', rect: 'Square', pen: 'Pen', curve: 'Curve', freeform: 'Free' };
  VE._vePwName = function (s) { return PW_NAMES[s] || 'Square'; };

  VE._veNodeAdd = function (clip, withWindow) {
    var nodes = VE._veNodes(clip);
    var n = VE._veNewGradeNode('Node ' + (nodes.length + 1), { enabled: true, preset: 'none' }, []);
    if (withWindow) {
      n.windows = [VE._veNewWindow()];
      n.name = 'Frame ' + (nodes.length + 1);
    }
    nodes.push(n);
    return nodes.length - 1;
  };

  VE._veNewWindow = function () {
    return {
      id: 'pw' + (Date.now() % 1e7) + '_' + (++_uid),
      shape: 'rect',
      geom: { x: 0.33, y: 0.33, w: 0.34, h: 0.34 },
      softness: 0.3, invert: false, enabled: true
    };
  };

  VE._veNodeRemove = function (clip, i) {
    var nodes = VE._veNodes(clip);
    if (!nodes[i]) return false;
    nodes.splice(i, 1);
    if (!nodes.length) nodes.push(VE._veNewGradeNode('Basic', { enabled: true, preset: 'none' }, []));
    return true;
  };

  /* Reorder. The chain is SERIAL, so order is not cosmetic: a desaturate before a LUT and the same
     desaturate after it are different pictures. */
  VE._veNodeMove = function (clip, from, to) {
    var nodes = VE._veNodes(clip);
    if (!nodes[from] || to < 0 || to >= nodes.length || from === to) return false;
    nodes.splice(to, 0, nodes.splice(from, 1)[0]);
    return true;
  };

  // How many nodes actually do something. This is what the timeline badge counts: a chain of
  // disabled nodes is not a graded clip.
  VE._veNodeActiveCount = function (clip) {
    if (!clip || !clip.gradeNodes) {
      // Don't migrate just to count: the timeline asks this for every clip on every render.
      var n = 0;
      if (clip && clip.colorGrading && clip.colorGrading.enabled) n++;
      n += (clip && clip.powerWindows ? clip.powerWindows.length : 0);
      return n;
    }
    var c = 0;
    for (var i = 0; i < clip.gradeNodes.length; i++) {
      var nd = clip.gradeNodes[i];
      if (nd.enabled === false) continue;
      if (nd.grade && (nd.grade.enabled || nd.grade.lutId)) c++;
    }
    return c;
  };

  VE._veNodeWindowCount = function (clip) {
    var w = 0;
    if (clip && clip.gradeNodes) {
      for (var i = 0; i < clip.gradeNodes.length; i++) w += (clip.gradeNodes[i].windows || []).length;
      return w;
    }
    return clip && clip.powerWindows ? clip.powerWindows.length : 0;
  };

  if (window.cc && cc.modules) cc.modules.register({
    id: 'nodes', parent: 'video.video-editor.preview-render',
    title: 'nodes', mount: function () {}, unmount: function () {}
  });
})();
