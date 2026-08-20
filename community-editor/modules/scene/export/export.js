/* Module: scene/export — frame-based EXPORT pipeline (Faz 6). Renders each frame (bg + content) off the
   main canvas via a temp StaticCanvas (same recipe as the sleep thumbnail, but full-res), then downloads
   one frame as PNG or all frames as a ZIP (JSZip). Independent of the legacy export dialog. Gated behind
   ccFlag('sceneExport'). See docs/frame-canvas-migration-plan.md. */
(function (global) {
  'use strict';
  var SC = global.__ccSceneEditor;
  if (!SC) return;

  function _download(href, filename) {
    var a = document.createElement('a');
    a.href = href; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
  }
  function _safeName(s) { return String(s || 'frame').replace(/[^\w.\- ]+/g, '').trim().replace(/\s+/g, '-') || 'frame'; }

  // Render ONE frame to a PNG dataURL at `scale`. frame.json is the serialized CCFrame (new) or a flat
  // world-coord content array (legacy).
  global._scRenderFrameToDataURL = function (frame, scale, cb) {
    scale = scale || 1;
    // serialize live content if this is the current frame (so a just-edited frame exports fresh)
    if (SC._curScene) { var sc = SC._curScene(); if (sc && sc.frames.indexOf(frame) >= 0 && typeof _scSerializeFrame === 'function' && !frame._sleeping) _scSerializeFrame(frame); }
    // Unified render core (core/render-part.js) handles the CCFrame vs flat-objects paths + world offset.
    renderPartCb(
      { kind: 'frame', json: frame.json, w: frame.w, h: frame.h, bg: frame.bg || '#ffffff', x: frame.x, y: frame.y },
      { format: 'png', scale: scale },
      cb
    );
  };

  global._scExportFrame = function (frameId, scale) {
    var sc = SC._curScene && SC._curScene(); if (!sc) return;
    var fr = SC._findFrame(sc, frameId); if (!fr) return;
    if (global.CCTags) {
      if (CCTags.fire) CCTags.fire('export', { type: 'frame', id: frameId });        // G4 automation rules
      if (CCTags._bumpDownload) CCTags._bumpDownload({ type: 'frame', id: frameId }); // G5 download counter
    }
    _scRenderFrameToDataURL(fr, scale || 1, function (url) { _download(url, _safeName(fr.label) + '.png'); });
  };

  // (Removed export-import-manager-plan Phase 12 sweep: the unwired global._scExportAllFramesZip is
  // superseded by CCWorksBrowser's part-aware bulk export — select the frames there → one ZIP.)

  global._scExportEnabled = function () { return typeof ccFlag === 'function' && ccFlag('sceneExport'); };

  if (global.cc && cc.modules) {
    cc.modules.register({ id: 'export', parent: 'scene', title: 'scene: export', mount: function () {}, unmount: function () {} });
  }
})(window);
