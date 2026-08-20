/* Module: scene/covers — portal-tags-page §8.4 sub-work + object COVER sync.
   Renders small WebP covers for DIRTY frames/slides (and TAGGED object crops) off
   the main canvas via temp StaticCanvases (same recipe as export/sleep), then hands
   each to an upload callback. Bounded per pass (CAP) + dirty-only (fr._previewRev vs
   fr._coverRev) + throttled by the caller (core/storage-remote.js), so a save never
   re-renders every frame. Keys-only land in designs.subThumbs server-side; bytes go
   to object storage. See docs/portal-tags-page-plan.md. */
(function (global) {
  'use strict';
  var TARGET_W = 400; // cover long-edge target (px) before ?w= re-resize on serve

  // Render a classic canvas JSON (slide / legacy page) to a webp dataURL.
  function _renderCanvasJson(json, w, h, bg, cb) {
    renderPartCb(
      { kind: 'page', json: json, w: w, h: h, bg: bg || (json && json.background) || '#ffffff' },
      { format: 'webp', fit: TARGET_W },
      cb
    );
  }

  // Render a single object's crop to a webp dataURL (tagged objects; reused at tag-time in Phase 9).
  global._ccRenderObjectCover = function (obj, cb) {
    renderPartCb({ kind: 'object', obj: obj }, { format: 'webp', fit: TARGET_W }, cb);
  };

  function _dataUrlToBlob(url) { return global.fetch(url).then(function (r) { return r.blob(); }); }

  /* Enumerate dirty frames/slides + tagged objects, render each (capped), upload via put(type,id,blob).
     put(type,id,blob) MUST return a Promise resolving to a truthy value on success. Bounded per pass by
     `cap`; overflow is deferred to the next pass (logged, never silently dropped). */
  global._ccUploadDirtyCovers = function (put, cap) {
    cap = cap || 4;
    var jobs = [];

    // dirty frames of the current scene
    try {
      var SC = global.__ccSceneEditor;
      var sc = SC && SC._curScene && SC._curScene();
      if (sc && sc.frames && typeof _scRenderFrameToDataURL === 'function') {
        sc.frames.forEach(function (fr) {
          if (fr._coverRev === fr._previewRev) return; // clean
          jobs.push({ type: 'frame', id: fr.id, rev: fr._previewRev, target: fr,
            render: function (cb) { _scRenderFrameToDataURL(fr, fr.w ? Math.min(1, TARGET_W / fr.w) : 0.4, cb); } });
        });
      }
    } catch (e) {}

    // dirty slides of the current slide deck
    try {
      var pages = global.pages || []; var pg = pages[global.currentPageIndex | 0]; var deck = pg && pg._slideDeck;
      if (deck && deck.enabled && deck.slides) {
        deck.slides.forEach(function (sl) {
          if (sl._coverRev === sl._previewRev) return;
          jobs.push({ type: 'slide', id: sl.id, rev: sl._previewRev, target: sl,
            render: function (cb) { _renderCanvasJson(sl.json, sl.w, sl.h, sl.bg, cb); } });
        });
      }
    } catch (e) {}

    // tagged objects live on the current canvas (Phase 9 UI feeds these)
    try {
      if (global.ccTagAssignments && global.canvas) {
        var asg = global.ccTagAssignments, live = {};
        canvas.getObjects().forEach(function (o) { if (o && o._ccId) live[o._ccId] = o; });
        Object.keys(asg).forEach(function (k) {
          if (k.indexOf('object:') !== 0) return;
          var cid = k.slice(7), o = live[cid]; if (!o || o._coverUploaded) return;
          jobs.push({ type: 'object', id: cid, target: o, render: function (cb) { global._ccRenderObjectCover(o, cb); } });
        });
      }
    } catch (e) {}

    if (!jobs.length) return;
    var batch = jobs.slice(0, cap);
    if (jobs.length > cap && typeof console !== 'undefined') console.info('[covers] ' + jobs.length + ' dirty; uploading ' + cap + ' this pass (rest next pass)');

    batch.forEach(function (job) {
      try {
        job.render(function (url) {
          if (!url || url.length < 40) return;
          _dataUrlToBlob(url)
            .then(function (blob) { return put(job.type, job.id, blob); })
            .then(function (ok) { if (ok !== false) { if (job.type === 'object') job.target._coverUploaded = true; else if (job.target) job.target._coverRev = job.rev; } })
            .catch(function () {});
        });
      } catch (e) {}
    });
  };

  if (global.cc && cc.modules) cc.modules.register({ id: 'covers', parent: 'scene', title: 'scene: covers', mount: function () {}, unmount: function () {} });
})(window);
