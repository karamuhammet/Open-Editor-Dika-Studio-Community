/* ===== Project package: media-inclusive .dikapack (docs/project-package-export-plan.md) =====
   (.ccproj is the same format under its pre-rename name and is still READ, never written.)

   A .dika/.dikapack file has always carried the project STRUCTURE and no media BYTES: video and
   audio live in this browser's IndexedDB, library images live behind an asset URL, and only
   drag-and-dropped images (base64 data URLs inside the page json) ever travelled. Opening such a file
   on another machine gave you the timeline and the clips with no picture.

   This module is the ONE owner of the media half of the package format: the assets/ layout, the
   assets.json schema, the collector, the writer and the reader. Both directions go through here on
   purpose - the 2026-08-02 page round-trip bug (kb/editor/context.md §8.13) was two hand-rolled copies
   of one field list drifting apart, and the half nobody re-read was the half that silently lost data.

   The archive itself is written and read by `zip-stream.js`, NOT JSZip: see the measurements in that
   file's header for why (JSZip grew the JS heap by 470 MB for a 180 MB archive, and its reader needs
   the whole package in memory before any entry can be touched).

   Rule that outranks convenience: never report a byte as packaged that was not. Anything that could
   not be collected becomes a record in assets.json carrying a REASON, counted on screen. */

(function (global) {
  'use strict';

  var ASSET_DIR = 'assets/';
  var INDEX_FILE = 'assets.json';

  /* D2 (docs/project-package-export-plan.md §7). Both write paths are memory-bounded now, so the
     threshold is about warning the user that a browser without File System Access has to hand the
     whole archive to the download layer at once, not about avoiding an OOM. */
  var LIMITS = {
    inlineImageMaxBytes: 12 * 1024 * 1024,     // bigger images stay a URL reference, with a reason
    fallbackWarnBytes: 512 * 1024 * 1024,      // no-streaming browsers: confirm first
    fetchConcurrency: 4
  };

  var MIME_EXT = {
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/x-matroska': 'mkv',
    'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
    'audio/ogg': 'ogg', 'audio/webm': 'weba', 'audio/mp4': 'm4a', 'audio/aac': 'aac',
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
    'image/svg+xml': 'svg', 'image/avif': 'avif'
  };

  function extFor(mime, kind) {
    var e = MIME_EXT[String(mime || '').toLowerCase()];
    if (e) return e;
    return kind === 'image' ? 'img' : 'bin';
  }

  function assetPath(mediaId, mime, kind) {
    return ASSET_DIR + mediaId + '.' + extFor(mime, kind);
  }

  /* Stable id for media referenced only by URL (images). djb2 over the URL, base36. Deterministic, so
     the same picture used on ten pages is packaged ONCE. */
  function hashId(prefix, str) {
    var h = 5381, s = String(str || '');
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return prefix + h.toString(36) + '-' + (s.length % 100000).toString(36);
  }

  function fmtBytes(n) {
    if (!n || n < 0) return '0 B';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  }

  /* ── json walking ───────────────────────────────────────────────────────────────────────────────
     A page can hold several independent fabric documents: the page json, the video overlay, every
     scene frame and every slide. Missing one means its pictures are not packaged, so the list of
     roots lives in ONE function. */
  function jsonRoots(page) {
    var roots = [];
    if (!page) return roots;
    if (page.json) roots.push(page.json);
    if (page._videoProject && page._videoProject.overlayJson) roots.push(page._videoProject.overlayJson);
    if (page._scene && page._scene.frames) {
      page._scene.frames.forEach(function (f) { if (f && f.json) roots.push(f.json); });
    }
    if (page._scene && page._scene.freeElements) roots.push({ objects: page._scene.freeElements });
    if (page._slideDeck && page._slideDeck.slides) {
      page._slideDeck.slides.forEach(function (s) { if (s && s.json) roots.push(s.json); });
    }
    return roots;
  }

  function walkJsonNodes(root, cb) {
    if (!root || typeof root !== 'object') return;
    if (root.backgroundImage && typeof root.backgroundImage === 'object') cb(root.backgroundImage);
    (function rec(list) {
      if (!list || !list.length) return;
      for (var i = 0; i < list.length; i++) {
        var o = list[i];
        if (!o || typeof o !== 'object') continue;
        cb(o);
        if (o.objects && o.objects.length) rec(o.objects);
      }
    })(root.objects);
  }

  function isPackableSrc(src) {
    if (!src || typeof src !== 'string') return false;
    if (src.indexOf('data:') === 0) return false;   // already inline, travels for free
    return /^https?:/i.test(src) || src.indexOf('blob:') === 0;
  }

  /* ── collect ────────────────────────────────────────────────────────────────────────────────────
     Walks the SERIALIZED pages (what is actually being written), not live editor state, so the
     package can never disagree with the json beside it. Returns Blob references: holding those is
     cheap because the browser owns the backing store. */
  function enumerateSources(pagesData) {
    var out = [], seen = {};
    (pagesData || []).forEach(function (page) {
      var pm = page && page._videoProject && page._videoProject.poolMeta;
      if (pm) {
        Object.keys(pm).forEach(function (clipId) {
          var meta = pm[clipId] || {};
          var mediaId = meta.mediaId || ('vem-' + clipId);
          if (seen[mediaId]) return;
          seen[mediaId] = true;
          out.push({ mediaId: mediaId, kind: meta.type === 'audio' ? 'audio' : 'video', srcRef: meta.src || '' });
        });
      }
      jsonRoots(page).forEach(function (root) {
        walkJsonNodes(root, function (o) {
          if (!isPackableSrc(o.src)) return;
          var mediaId = hashId('img-', o.src);
          if (seen[mediaId]) return;
          seen[mediaId] = true;
          out.push({ mediaId: mediaId, kind: 'image', srcRef: o.src, name: o._imageName || o._iconName || '' });
        });
      });
    });
    return out;
  }

  function collectMedia(pagesData, onProgress) {
    var items = [], missing = [];
    var pending = enumerateSources(pagesData);
    var done = 0, total = pending.length;

    return runPool(pending, LIMITS.fetchConcurrency, function (p) {
      return resolveBlob(p).then(function (blob) {
        done++; if (onProgress) onProgress(done, total);
        if (!blob) return;
        items.push({
          mediaId: p.mediaId, kind: p.kind, srcRef: p.srcRef,
          name: p.name || p.mediaId, mime: blob.type || '', bytes: blob.size, blob: blob
        });
      }).catch(function (e) {
        done++; if (onProgress) onProgress(done, total);
        missing.push({ mediaId: p.mediaId, kind: p.kind, srcRef: p.srcRef, missing: reasonOf(e, p) });
      });
    }).then(function () {
      var totalBytes = items.reduce(function (a, it) { return a + (it.bytes || 0); }, 0);
      return { items: items, missing: missing, totalBytes: totalBytes, count: items.length };
    });
  }

  function reasonOf(e, p) {
    var m = (e && e.message) || String(e || '');
    if (/^no-source/.test(m)) return 'no-source-recorded';
    if (p && p.srcRef && p.srcRef.indexOf('blob:') === 0) return 'session-url-expired';
    if (p && p.srcRef && /^https?:/i.test(p.srcRef)) return 'remote-unfetchable';
    return 'unreadable';
  }

  /* Where the bytes come from, in order:
       1. IndexedDB by mediaId  - the local store the video subsystem already maintains, and the only
          source that still works when the original URL is dead.
       2. the recorded src      - a same-origin asset URL, a public stock URL, or a blob: that happens
          to still be alive in this session.
     In production a library URL is a 1-hour presigned S3 link and therefore cross-origin, so this
     fetch can legitimately fail; that is a recorded reason, not a crash. */
  function resolveBlob(p) {
    var viaIdb = (p.kind !== 'image' && global.VEPersistence && VEPersistence.loadMedia)
      ? VEPersistence.loadMedia(p.mediaId).catch(function () { return null; })
      : Promise.resolve(null);

    return viaIdb.then(function (blob) {
      if (blob && blob.size) return blob;
      if (!p.srcRef) throw new Error('no-source');
      return fetch(p.srcRef).then(function (r) {
        if (!r.ok) throw new Error('http-' + r.status);
        return r.blob();
      });
    });
  }

  function runPool(list, limit, worker) {
    var idx = 0;
    function next() {
      if (idx >= list.length) return Promise.resolve();
      return worker(list[idx++]).then(next);
    }
    var lanes = [];
    for (var i = 0; i < Math.max(1, Math.min(limit, list.length)); i++) lanes.push(next());
    return Promise.all(lanes);
  }

  /* ── write ─────────────────────────────────────────────────────────────────────────────────────
     Returns the zip entries for the media half plus the assets index. Entry data stays a Blob all the
     way to the archive writer, which streams it chunk by chunk. */
  function buildAssetEntries(collected) {
    var entries = [], index = [];
    collected.items.forEach(function (it) {
      var path = assetPath(it.mediaId, it.mime, it.kind);
      entries.push({ name: path, data: it.blob });
      index.push({
        mediaId: it.mediaId, path: path, mime: it.mime, bytes: it.bytes,
        kind: it.kind, name: it.name, srcRef: it.srcRef
      });
    });
    collected.missing.forEach(function (m) {
      index.push({
        mediaId: m.mediaId, path: null, mime: '', bytes: 0,
        kind: m.kind, name: m.mediaId, srcRef: m.srcRef, missing: m.missing
      });
    });
    entries.push({ name: INDEX_FILE, data: JSON.stringify(index, null, 2) });
    return { entries: entries, index: index };
  }

  function canStream() {
    return typeof global.showSaveFilePicker === 'function';
  }

  /* THE ONLY place showSaveFilePicker is called, and it MUST be invoked synchronously from the click
     handler, before anything is awaited.

     The picker needs transient user activation. The first build called it where it felt natural - at
     the moment there was something to write, i.e. AFTER collecting the media - and every real click
     died with "Must be handling a user gesture to show a file picker", because reading IndexedDB and
     fetching images had already consumed the activation. The whole verification pass missed it for a
     precise reason worth remembering: the tests STUBBED this API, and a stub has no gesture rule, so
     the one constraint that only the real function enforces was the one thing never exercised.

     Picking first also fails better: cancelling costs nothing, instead of collecting a gigabyte and
     then throwing it away. */
  function pickTarget(filename) {
    if (!canStream()) return Promise.resolve(null);
    return global.showSaveFilePicker({
      suggestedName: filename,
      /* The NEW name first: the picker offers the first entry as the default. The old two stay so a
         person overwriting a file they exported before the rename can still see it in the dialog. */
      types: [{
        description: 'dika studio project package',
        accept: { 'application/zip': ['.dikapack', '.dika', '.ccproj', '.cardcraft'] }
      }]
    });
  }

  /* With a pre-picked target the archive streams straight to disk. Without one it is composed as a
     Blob from parts (media parts added BY REFERENCE, so that path is memory-safe too) and handed to
     the normal download. There is deliberately no late call to the picker here: a caller that did not
     pick during the gesture gets the working fallback, never a gesture error. */
  function writePackage(entries, filename, opts) {
    opts = opts || {};
    if (opts.target) {
      return opts.target.createWritable().then(function (writable) {
        return CCZipStream.writeZip(entries, CCZipStream.streamSink(writable, opts.onWriteProgress));
      });
    }
    return CCZipStream.writeZip(entries, CCZipStream.blobSink(opts.onWriteProgress)).then(function (res) {
      if (opts.download) opts.download(res.blob, filename);
      return res;
    });
  }

  function confirmLargeFallback(totalBytes, hasTarget) {
    if (hasTarget || totalBytes <= LIMITS.fallbackWarnBytes) return true;
    return global.confirm(
      'This browser cannot stream a file to disk, so the whole package (' + fmtBytes(totalBytes) + ') ' +
      'has to be handed to the download at once.\nA Chromium browser writes it straight to disk instead. Continue?');
  }

  /* ── read ──────────────────────────────────────────────────────────────────────────────────────
     openPackage parses only the central directory, so opening a 3 GB file is as cheap as a small one.
     Returns null when the file is not a readable STORE archive, letting the caller fall back. */
  function openPackage(file) {
    if (typeof CCZipStream === 'undefined') return Promise.resolve(null);
    return CCZipStream.openZip(file).catch(function () { return null; });
  }

  /* Entries are pulled ONE AT A TIME and handed straight to their destination, so a large package
     never exists in memory at once.

     Video and audio go into IndexedDB under the SAME mediaId the exporter read them from, and the
     poolMeta src is rewritten to a fresh object URL. That is deliberate: it re-enters the existing
     restore path (video-editor/project/project.js:310), which re-links a blob: source from IndexedDB
     by mediaId on every later reload. No parallel media system, and the media still works tomorrow.

     Images are inlined as data URLs, which is exactly how a drag-and-dropped image already persists
     in this app (gallery/canvas/drop/drop.js:222). One model for local images beats inventing a second
     one that would need its own re-link on every reload. */
  function applyAssets(pkg, pagesData, onProgress) {
    if (!pkg || !pkg.has(INDEX_FILE)) return Promise.resolve(null);

    return pkg.text(INDEX_FILE).then(function (txt) {
      var index;
      try { index = JSON.parse(txt) || []; } catch (e) { index = []; }

      var mediaUrls = {};     // mediaId -> fresh object URL (video/audio)
      var imageData = {};     // original src -> data URL
      var missing = index.filter(function (r) { return r && r.missing; })
        .map(function (r) { return { mediaId: r.mediaId, kind: r.kind, missing: r.missing, srcRef: r.srcRef }; });
      var usable = index.filter(function (r) { return r && r.path && !r.missing; });
      var applied = 0, skipped = 0, done = 0;

      return usable.reduce(function (chain, rec) {
        return chain.then(function () {
          done++;
          if (onProgress) onProgress(done, usable.length);
          if (!pkg.has(rec.path)) { missing.push({ mediaId: rec.mediaId, kind: rec.kind, missing: 'entry-not-in-package' }); return; }

          return pkg.blob(rec.path).then(function (raw) {
            // The archive entry has no mime of its own; restore the recorded one so <video>/<img> can
            // actually play it. blob.slice keeps this a view of the file, it does not copy.
            var blob = rec.mime ? raw.slice(0, raw.size, rec.mime) : raw;

            if (rec.kind === 'image') {
              if (blob.size > LIMITS.inlineImageMaxBytes) {
                skipped++;
                missing.push({ mediaId: rec.mediaId, kind: 'image', missing: 'image-too-large-to-inline' });
                return;
              }
              return blobToDataUrl(blob).then(function (durl) { imageData[rec.srcRef] = durl; applied++; });
            }

            var save = (global.VEPersistence && VEPersistence.saveMedia)
              ? VEPersistence.saveMedia(rec.mediaId, blob).catch(function () {})
              : Promise.resolve();
            return save.then(function () {
              try { mediaUrls[rec.mediaId] = URL.createObjectURL(blob); applied++; }
              catch (e) { missing.push({ mediaId: rec.mediaId, kind: rec.kind, missing: 'object-url-failed' }); }
            });
          }).catch(function () {
            missing.push({ mediaId: rec.mediaId, kind: rec.kind, missing: 'entry-unreadable' });
          });
        });
      }, Promise.resolve()).then(function () {
        relinkPages(pagesData, mediaUrls, imageData);
        return { applied: applied, skipped: skipped, missing: missing, total: index.length };
      });
    });
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error('read-failed')); };
      fr.readAsDataURL(blob);
    });
  }

  /* Point the restored project at the media we just unpacked.

     `_ccAssetUrl` MUST be cleared: it means "these bytes already are a library asset, never upload
     them again" (kb/editor/context.md §8.11). Left in place it would point at the SENDER's asset URL,
     which the recipient may not be allowed to read, and _veSerializeProject would then keep writing
     that foreign URL back into poolMeta and skip persisting the bytes we just imported. */
  function relinkPages(pagesData, mediaUrls, imageData) {
    var hasMedia = Object.keys(mediaUrls).length > 0;
    var hasImages = Object.keys(imageData).length > 0;
    if (!hasMedia && !hasImages) return;

    (pagesData || []).forEach(function (page) {
      var vp = page && page._videoProject;
      if (hasMedia && vp) {
        var pm = vp.poolMeta || {};
        Object.keys(pm).forEach(function (clipId) {
          var meta = pm[clipId];
          if (!meta) return;
          var url = mediaUrls[meta.mediaId || ('vem-' + clipId)];
          if (url) meta.src = url;
        });
        (vp.tracks || []).forEach(function (t) {
          ((t && t.clips) || []).forEach(function (c) {
            if (!c) return;
            var url = mediaUrls[c._ccMediaId];
            if (!url) return;
            c.src = url;
            c._ccAssetUrl = null;
          });
        });
      }
      if (hasImages) {
        jsonRoots(page).forEach(function (root) {
          walkJsonNodes(root, function (o) {
            var durl = imageData[o.src];
            if (durl) o.src = durl;
          });
        });
      }
    });
  }

  global.CCProjectPackage = {
    ASSET_DIR: ASSET_DIR,
    INDEX_FILE: INDEX_FILE,
    LIMITS: LIMITS,
    enumerateSources: enumerateSources,
    collectMedia: collectMedia,
    buildAssetEntries: buildAssetEntries,
    pickTarget: pickTarget,
    writePackage: writePackage,
    openPackage: openPackage,
    applyAssets: applyAssets,
    confirmLargeFallback: confirmLargeFallback,
    canStream: canStream,
    fmtBytes: fmtBytes,
    assetPath: assetPath
  };

  if (global.cc && cc.modules) {
    cc.modules.register({
      id: 'project-package', parent: 'export', title: 'Project package (media)',
      mount: function () {}, unmount: function () {}
    });
  }
})(window);
