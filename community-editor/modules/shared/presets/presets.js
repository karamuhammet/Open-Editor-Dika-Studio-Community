/* Shared module: presets — ONE look library for images AND video clips.

   Why it is shared rather than two features: an image's grade and a clip's grade are the SAME
   object shape run through the SAME `VEColorGrading.processImageData`, so a preset that carries a
   grade is already portable. The only thing that differs is the adjustment scale - a clip's
   `filters` are 100-centred (100 = untouched) and an image's `_ccImgAdjust` is 0-centred - so the
   store keeps the 100-CENTRED form as canonical (it is what the shipped preset tables already use)
   and converts at the image boundary. One conversion, in one place.

   PARTIAL BY DESIGN (owner): a preset may carry only Filters, only a LUT, only Curves, or the whole
   look. Nothing is implied - applying a preset touches exactly the parts it carries and leaves the
   rest of the object alone, so "warm skin" can sit on top of somebody's own curve.

   Storage is localStorage (`cc_presets`), the same place this editor already keeps recent colours
   and asset-url maps. The payload is plain JSON with a `v` field, so moving it to the account later
   is a transport change, not a format change. */
(function () {
  'use strict';

  var KEY = 'cc_presets';
  var VERSION = 1;
  var PARTS = ['filters', 'grade', 'lut', 'curves', 'film', 'effect'];
  var PART_LABEL = {
    filters: 'Filters', grade: 'Color grading', lut: 'LUT',
    curves: 'Curves', film: 'Film', effect: 'Effect'
  };
  // Which parts a given target can actually receive. Saying so up front is what stops a Film preset
  // being offered on a video clip, where fabric's filter classes do not exist at all.
  var PART_SUPPORT = {
    image: { filters: 1, grade: 1, lut: 1, curves: 1, film: 1, effect: 1 },
    video: { filters: 1, grade: 1, lut: 1, curves: 1, film: 0, effect: 0 }
  };
  var FILTER_KEYS = ['brightness', 'contrast', 'saturation', 'hue', 'blur', 'sepia', 'grayscale', 'invert'];
  var FILTER_NEUTRAL = { brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, sepia: 0, grayscale: 0, invert: 0 };

  var P = window.CCPresets = {};
  P.PARTS = PARTS;
  P.PART_LABEL = PART_LABEL;
  P.PART_SUPPORT = PART_SUPPORT;

  /* ── Storage: IndexedDB, with localStorage only as a last resort ───────────────────────────
     localStorage was the first choice and it is the WRONG one, measured on the owner's own
     browser: 5 MB already in use and a hard QuotaExceededError on a 50 KB probe, because one
     design's `dika_versions__*` history alone is 3.8 MB. A preset store that silently fails
     to save is worse than no preset store. IndexedDB is where this editor already keeps fonts and
     media, it has room for thumbnails, and the card grid is worth nothing without them.

     The API below stays SYNCHRONOUS on purpose: an in-memory cache is the source of truth for
     reads, and writes are mirrored to IndexedDB in the background. Making list()/get() async would
     have rippled through every caller for no gain. */
  var DB_NAME = 'dika-presets', STORE = 'presets', ROW = 'all';
  var _cache = null;          // null = not loaded yet
  var _dbP = null;

  function _db() {
    if (_dbP) return _dbP;
    /* Presets moved from `cardcraft-presets` with the rename (docs/dika-rename-plan.md P5). */
    var moved = (window.CCMigrate && CCMigrate.db)
      ? CCMigrate.db('cardcraft-presets', DB_NAME) : Promise.resolve(false);
    _dbP = moved.then(function () { return new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('no indexedDB'));
      var rq = indexedDB.open(DB_NAME, 1);
      rq.onupgradeneeded = function () {
        var db = rq.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { rej(rq.error); };
    }); });
    return _dbP;
  }
  function _idbGet() {
    return _db().then(function (db) {
      return new Promise(function (res) {
        var tx = db.transaction(STORE, 'readonly').objectStore(STORE).get(ROW);
        tx.onsuccess = function () { res(Array.isArray(tx.result) ? tx.result : []); };
        tx.onerror = function () { res([]); };
      });
    });
  }
  function _idbPut(list) {
    return _db().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction(STORE, 'readwrite');
        t.objectStore(STORE).put(list, ROW);
        t.oncomplete = function () { res(true); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }
  function _lsRead() {
    try { var r = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(r) ? r : []; }
    catch (e) { return []; }
  }
  function _read() {
    if (_cache) return _cache;
    // First synchronous read before the async load lands: serve whatever localStorage holds (an
    // older build wrote there) so the panel is never blank, then the load overwrites it.
    _cache = _lsRead();
    return _cache;
  }
  function _write(list) {
    _cache = list;
    _idbPut(list)['catch'](function () {
      /* IndexedDB refused (private mode, disabled storage). Fall back to localStorage WITHOUT
         thumbnails - the look is the value, the picture is the convenience - and say nothing if
         even that fails, because the in-memory copy still works for this session. */
      try { localStorage.setItem(KEY, JSON.stringify(list.map(_omitThumb))); } catch (e) {}
    });
    return true;
  }
  function _omitThumb(p) { var c = {}; for (var k in p) if (k !== 'thumb') c[k] = p[k]; return c; }

  P.ready = _idbGet().then(function (rows) {
    /* One-time adoption of anything an earlier build managed to squeeze into localStorage, so a
       preset saved before this change is not orphaned. */
    if (!rows.length) {
      var legacy = _lsRead();
      if (legacy.length) { rows = legacy; _idbPut(rows)['catch'](function () {}); }
    }
    _cache = rows;
    try { localStorage.removeItem(KEY); } catch (e) {}
    return rows;
  })['catch'](function () { _cache = _lsRead(); return _cache; });
  function _uid() { return 'ps-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function _clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

  /* ── What is selected right now ────────────────────────────────────────────────────────────
     ONE resolver. Every caller asks this instead of testing for a canvas image or a timeline clip
     itself, so "what does Apply apply to" has a single answer. */
  P.currentTarget = function () {
    var VE = window.__ccVideoEditor;
    if (VE && VE._veActive && VE._veSelectedClips && VE._veSelectedClips.length) {
      var id = VE._veSelectedClips[0];
      var clip = (typeof VE._veFindClip === 'function') ? VE._veFindClip(id) : null;
      if (clip) return { kind: 'video', clip: clip };
    }
    var c = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : null;
    var o = c && c.getActiveObject();
    if (o && o.type === 'image' && !o.isQR && !o._isChart && !o._isEffect) return { kind: 'image', obj: o };
    return null;
  };

  /* ── Capture ──────────────────────────────────────────────────────────────────────────────── */
  function _captureImage(o) {
    var a = o._ccImgAdjust || {};
    var g = o._ccGrade || null;
    var parts = {}, present = {};
    // 0-centred -> the canonical 100-centred form.
    var f = {
      brightness: 100 + (a.brightness || 0), contrast: 100 + (a.contrast || 0),
      saturation: 100 + (a.saturation || 0), hue: a.hue || 0,
      blur: a.blur || 0, sepia: a.sepia || 0, grayscale: a.grayscale || 0, invert: 0
    };
    if (!_isNeutralFilters(f) || (a.vibrance || 0)) {
      f.vibrance = a.vibrance || 0;
      parts.filters = f; present.filters = 1;
    }
    if (g && (g.levels || g.wb || g.sat || g.wheels)) {
      var grade = { levels: _clone(g.levels), wb: _clone(g.wb), sat: _clone(g.sat), wheels: _clone(g.wheels), opacity: g.opacity };
      if (!_isNeutralGrade(grade)) { parts.grade = grade; present.grade = 1; }
    }
    if (g && g.preset && g.preset !== 'none') { parts.lut = g.preset; present.lut = 1; }
    if (g && g.curves) { parts.curves = _clone(g.curves); present.curves = 1; if (g.desaturate) parts.curvesDesaturate = true; }
    if (a.film) { parts.film = a.film; present.film = 1; }
    var eff = { grain: a.grain || 0, pixelate: a.pixelate || 0, sharpen: a.sharpen || 0, gamma: a.gamma || 100, blend: o.globalCompositeOperation || 'source-over' };
    if (eff.grain || eff.pixelate || eff.sharpen || eff.gamma !== 100 || eff.blend !== 'source-over') { parts.effect = eff; present.effect = 1; }
    return { parts: parts, present: present };
  }

  function _captureVideo(clip) {
    var VE = window.__ccVideoEditor;
    var cf = clip.filters || {};
    var g = (VE && typeof VE._veGradeObj === 'function') ? VE._veGradeObj(clip) : (clip.colorGrading || null);
    var parts = {}, present = {};
    var f = {};
    FILTER_KEYS.forEach(function (k) { f[k] = (cf[k] != null) ? cf[k] : FILTER_NEUTRAL[k]; });
    if (!_isNeutralFilters(f)) { parts.filters = f; present.filters = 1; }
    if (g) {
      var grade = { levels: _clone(g.levels), wb: _clone(g.wb), sat: _clone(g.sat), wheels: _clone(g.wheels), opacity: g.opacity };
      if (!_isNeutralGrade(grade)) { parts.grade = grade; present.grade = 1; }
      if (g.preset && g.preset !== 'none') { parts.lut = g.preset; present.lut = 1; }
      if (g.curves) { parts.curves = _clone(g.curves); present.curves = 1; if (g.desaturate) parts.curvesDesaturate = true; }
    }
    return { parts: parts, present: present };
  }

  function _isNeutralFilters(f) {
    for (var i = 0; i < FILTER_KEYS.length; i++) {
      var k = FILTER_KEYS[i];
      if ((f[k] != null ? f[k] : FILTER_NEUTRAL[k]) !== FILTER_NEUTRAL[k]) return false;
    }
    return true;
  }
  function _isNeutralGrade(g) {
    var l = g.levels || {};
    if ((l.inBlack || 0) || (l.inWhite != null && l.inWhite !== 255) || (l.gamma || 1) !== 1 ||
        (l.outBlack || 0) || (l.outWhite != null && l.outWhite !== 255)) return false;
    var w = g.wb || {}; if (w.temp || w.tint) return false;
    var s = g.sat || {}; if ((s.saturation != null && s.saturation !== 100) || s.vibrance) return false;
    var wh = g.wheels || {}, zones = ['shadows', 'midtones', 'highlights'];
    for (var i = 0; i < zones.length; i++) { var v = wh[zones[i]] || {}; if (v.r || v.g || v.b) return false; }
    if (g.opacity != null && g.opacity !== 100) return false;
    return true;
  }

  /* What the CURRENT selection could be saved as. The dialog renders every part with this answer
     beside it, so a part with nothing in it reads "not set" rather than silently saving a neutral. */
  P.capture = function (target) {
    target = target || P.currentTarget();
    if (!target) return null;
    var cap = (target.kind === 'video') ? _captureVideo(target.clip) : _captureImage(target.obj);
    cap.kind = target.kind;
    return cap;
  };

  /* ── Thumbnail: the REAL object, not a stock swatch (owner decision) ───────────────────────── */
  P.thumbFor = function (target) {
    try {
      target = target || P.currentTarget();
      if (!target) return '';
      var el = null;
      if (target.kind === 'image') el = target.obj._element || target.obj._originalElement;
      else {
        var VE = window.__ccVideoEditor;
        var pool = VE && VE._vePlayback && VE._vePlayback.videoPool;
        el = pool && target.clip && pool[target.clip.id];
      }
      if (!el) return '';
      var W = 96, H = 60;
      var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      var ctx = cv.getContext('2d');
      var iw = el.naturalWidth || el.videoWidth || el.width || 1;
      var ih = el.naturalHeight || el.videoHeight || el.height || 1;
      var s = Math.max(W / iw, H / ih);
      ctx.drawImage(el, (W - iw * s) / 2, (H - ih * s) / 2, iw * s, ih * s);
      return cv.toDataURL('image/jpeg', 0.62);
    } catch (e) {
      // A cross-origin picture taints the canvas. No thumbnail is fine; a broken preset is not.
      return '';
    }
  };

  /* ── Store ────────────────────────────────────────────────────────────────────────────────── */
  P.list = function (filter) {
    var all = _read();
    if (!filter) return all;
    return all.filter(function (p) {
      if (filter.part && !(p.parts && p.parts[filter.part] != null)) return false;
      if (filter.kind && p.scope !== 'both' && p.scope !== filter.kind) return false;
      if (filter.q) {
        var q = String(filter.q).toLowerCase();
        if (String(p.name || '').toLowerCase().indexOf(q) < 0) return false;
      }
      return true;
    });
  };
  P.get = function (id) {
    var all = _read();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  };
  P.save = function (preset) {
    var all = _read();
    var p = {
      v: VERSION,
      id: preset.id || _uid(),
      name: String(preset.name || 'Untitled').slice(0, 60),
      scope: preset.scope || 'both',
      parts: preset.parts || {},
      thumb: preset.thumb || '',
      createdAt: preset.createdAt || new Date().toISOString()
    };
    var idx = -1;
    for (var i = 0; i < all.length; i++) if (all[i].id === p.id) { idx = i; break; }
    if (idx >= 0) all[idx] = p; else all.unshift(p);
    _write(all);
    return p;
  };
  P.remove = function (id) { _write(_read().filter(function (p) { return p.id !== id; })); };
  P.rename = function (id, name) {
    var all = _read();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) { all[i].name = String(name || '').slice(0, 60) || all[i].name; break; }
    _write(all);
  };
  P.exportAll = function () { return JSON.stringify({ v: VERSION, presets: _read() }, null, 2); };
  P.importJson = function (text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { return { ok: false, error: 'Not valid JSON' }; }
    var incoming = Array.isArray(data) ? data : (data && data.presets);
    if (!Array.isArray(incoming)) return { ok: false, error: 'No presets in that file' };
    var all = _read(), added = 0;
    incoming.forEach(function (p) {
      if (!p || !p.parts) return;
      // A fresh id on import: two people exporting from the same seed would otherwise overwrite
      // each other's edits on what they think are separate presets.
      all.unshift({ v: VERSION, id: _uid(), name: String(p.name || 'Imported').slice(0, 60),
        scope: p.scope || 'both', parts: p.parts, thumb: p.thumb || '', createdAt: new Date().toISOString() });
      added++;
    });
    _write(all);
    return { ok: true, added: added };
  };

  /* ── Apply ────────────────────────────────────────────────────────────────────────────────── */
  function _applyToImage(o, parts) {
    if (typeof _ccImgAdjust !== 'function' || typeof _ccGrade !== 'function' || typeof _ccImgApply !== 'function') return false;
    var a = _ccImgAdjust(o);
    if (parts.filters) {
      var f = parts.filters;
      // canonical 100-centred -> the image panel's 0-centred scale
      a.brightness = (f.brightness != null ? f.brightness : 100) - 100;
      a.contrast = (f.contrast != null ? f.contrast : 100) - 100;
      a.saturation = (f.saturation != null ? f.saturation : 100) - 100;
      a.hue = f.hue || 0;
      a.blur = f.blur || 0;
      a.sepia = f.sepia || 0;
      a.grayscale = f.grayscale || 0;
      if (f.vibrance != null) a.vibrance = f.vibrance;
      a.preset = 'custom';
    }
    if (parts.film != null) a.film = parts.film;
    if (parts.effect) {
      var e = parts.effect;
      a.grain = e.grain || 0; a.pixelate = e.pixelate || 0; a.sharpen = e.sharpen || 0;
      a.gamma = e.gamma != null ? e.gamma : 100;
      if (e.blend) o.set('globalCompositeOperation', e.blend);
    }
    if (parts.grade || parts.lut != null || parts.curves) {
      var g = _ccGrade(o);
      if (parts.grade) {
        var pg = parts.grade;
        if (pg.levels) g.levels = _clone(pg.levels);
        if (pg.wb) g.wb = _clone(pg.wb);
        if (pg.sat) g.sat = _clone(pg.sat);
        if (pg.wheels) g.wheels = _clone(pg.wheels);
        if (pg.opacity != null) g.opacity = pg.opacity;
      }
      if (parts.lut != null) g.preset = parts.lut;
      if (parts.curves) { g.curves = _clone(parts.curves); g.desaturate = !!parts.curvesDesaturate; }
      g.enabled = true;
    }
    _ccImgApply(o, { snap: true });
    if (typeof syncImageInspector === 'function') syncImageInspector(o);
    return true;
  }

  function _applyToVideo(clip, parts) {
    var VE = window.__ccVideoEditor;
    if (parts.filters) {
      clip.filters = clip.filters || {};
      FILTER_KEYS.forEach(function (k) { if (parts.filters[k] != null) clip.filters[k] = parts.filters[k]; });
      clip.filters._preset = 'custom';
    }
    if (parts.grade || parts.lut != null || parts.curves) {
      var g = (VE && typeof VE._veGradeObj === 'function') ? VE._veGradeObj(clip) : (clip.colorGrading = clip.colorGrading || {});
      if (parts.grade) {
        var pg = parts.grade;
        if (pg.levels) g.levels = _clone(pg.levels);
        if (pg.wb) g.wb = _clone(pg.wb);
        if (pg.sat) g.sat = _clone(pg.sat);
        if (pg.wheels) g.wheels = _clone(pg.wheels);
        if (pg.opacity != null) g.opacity = pg.opacity;
      }
      if (parts.lut != null) g.preset = parts.lut;
      if (parts.curves) { g.curves = _clone(parts.curves); g.desaturate = !!parts.curvesDesaturate; }
      g.enabled = true;
    }
    // Redraw through the video editor's own path; never poke the compositor directly.
    if (window.VideoEditor) {
      if (VideoEditor.render) VideoEditor.render();
      if (VideoEditor.seek && VideoEditor.getProject) {
        var proj = VideoEditor.getProject();
        if (proj) VideoEditor.seek(proj.playheadTime);
      }
    }
    if (window.VEInspector && VEInspector.update) VEInspector.update();
    return true;
  }

  /* Apply a preset, optionally only SOME of its parts (the library's per-part checkboxes).
     Parts the target cannot receive are skipped and REPORTED, never silently dropped. */
  P.apply = function (preset, target, onlyParts) {
    target = target || P.currentTarget();
    if (!preset || !target) return { ok: false, error: 'Nothing selected' };
    var support = PART_SUPPORT[target.kind] || {};
    var parts = {}, skipped = [];
    PARTS.forEach(function (k) {
      if (preset.parts[k] == null) return;
      if (onlyParts && onlyParts.indexOf(k) < 0) return;
      if (!support[k]) { skipped.push(PART_LABEL[k]); return; }
      parts[k] = preset.parts[k];
    });
    if (preset.parts.curvesDesaturate) parts.curvesDesaturate = true;
    if (!Object.keys(parts).length) return { ok: false, error: skipped.length ? (skipped.join(', ') + ' cannot be used here') : 'Nothing to apply' };
    var ok = (target.kind === 'video') ? _applyToVideo(target.clip, parts) : _applyToImage(target.obj, parts);
    return { ok: ok, skipped: skipped };
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'presets', parent: 'shared', title: 'Preset library', mount: function () {}, unmount: function () {} });
  }
})();
