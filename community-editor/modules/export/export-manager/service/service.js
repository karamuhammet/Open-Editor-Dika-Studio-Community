/* Module: export/export-manager/service — ExportService: the reusable export engine (render page →
   dataURL, PNG/SVG/PDF/ZIP/PSD/project export + import). MODULE-PATTERN: `var ExportService =
   (function(){…return{…}})();` — a global object; siblings (the Manager UI, import-export) call it at
   runtime so load order is irrelevant. Split from the 1653-line export-manager.js. */

/* ── Reusable Export Services ──────────────────────────────── */

var ExportService = (function () {

  /* Render a single part (page / slide / scene frame / board) to a dataURL via the unified render core
     (core/render-part.js). Part-aware source so scene/slide pages render real content, not a blank json. */
  function renderPage(pageIndex, format, dpi, opts) {
    opts = opts || {};
    var page = (typeof pages !== 'undefined') ? pages[pageIndex] : null;
    if (!page) return Promise.resolve(null);
    // Page-sleep: hydrate a slept page first (single chokepoint for every per-index render:
    // thumbs, ZIP/PDF loops, excel, social, works, portal). LRU re-evicts later.
    if (page._slept && typeof _psHydratePage === 'function') {
      return new Promise(function (resolve) {
        _psHydratePage(pageIndex, function () { renderPage(pageIndex, format, dpi, opts).then(resolve); });
      });
    }
    var src = (typeof resolvePartSource === 'function') ? resolvePartSource(page)
            : { kind: 'page', json: page.json, w: page.w, h: page.h, bg: page.bg };
    if (!src || (src.kind !== 'frame' && !src.json)) return Promise.resolve(null);
    var ropts = { format: format || 'png', dpi: dpi || 300 };
    if (opts.transparent) ropts.transparent = true;
    if (typeof opts.quality === 'number') ropts.quality = opts.quality;
    if (opts.out) ropts.out = opts.out;                                  // 'blob' → async toBlob encode path
    if (opts.retina === false) ropts.retina = false;                    // export at exactly dpi× (no monitor-DPR blow-up)
    if (typeof opts.onProgress === 'function') ropts.onProgress = opts.onProgress;
    return renderPart(
      { kind: src.kind, json: src.json, w: src.w, h: src.h, bg: (src.bg != null ? src.bg : page.bg), x: src.x, y: src.y },
      ropts
    );
  }

  /* Render a single part to an SVG string via the unified render core. */
  function renderPageSVG(pageIndex) {
    var page = (typeof pages !== 'undefined') ? pages[pageIndex] : null;
    if (!page) return Promise.resolve(null);
    if (page._slept && typeof _psHydratePage === 'function') {   // page-sleep: hydrate first
      return new Promise(function (resolve) {
        _psHydratePage(pageIndex, function () { renderPageSVG(pageIndex).then(resolve); });
      });
    }
    var src = (typeof resolvePartSource === 'function') ? resolvePartSource(page)
            : { kind: 'page', json: page.json, w: page.w, h: page.h, bg: page.bg };
    if (!src || (src.kind !== 'frame' && !src.json)) return Promise.resolve(null);
    return renderPart(
      { kind: src.kind, json: src.json, w: src.w, h: src.h, bg: (src.bg != null ? src.bg : page.bg), x: src.x, y: src.y },
      { out: 'svg' }
    );
  }

  /* Check if page has raster-heavy content (images, filters etc.) */
  function pageHasRasterContent(pageIndex) {
    var page = (typeof pages !== 'undefined') ? pages[pageIndex] : null;
    if (!page || !page.json) return false;
    var objs = page.json.objects || [];
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i];
      if (o.type === 'image') return true;
      if (o.filters && o.filters.length > 0) return true;
      if (o.type === 'group') return true; // complex groups may have raster
    }
    return false;
  }

  /* Lifecycle-email Faz 2: "design downloaded" beacon. These two helpers are the export-manager's
     central render-download choke; every rendered image/PDF export lands here, so one call marks the
     download. Rapid multi-file exports collapse to one count server-side (5s dedupe window). No-op in the
     standalone editor; never throws into the export path. */
  function _ccBeaconDownload(format) {
    try { if (window.CCRemote && CCRemote.beaconDownload) CCRemote.beaconDownload({ via: 'export-manager', format: format || 'png' }); } catch (e) {}
  }
  function _fmtFromName(filename) { var p = String(filename || '').split('.'); return p.length > 1 ? p.pop().toLowerCase() : 'png'; }
  /* Export-event beacon (project / part export) — export-import-manager-plan Phase 9 data integration. */
  function _ccBeaconExport(format) {
    // The default names the FORMAT, and it follows the extension: callers pass 'dika' / 'dikapack'
    // derived from what was actually written. It used to be a misspelling of the old product name,
    // which meant the analytics key and the file extension disagreed about what a format was called.
    try { if (window.CCRemote && CCRemote.beaconExport) CCRemote.beaconExport({ format: format || 'dika' }); } catch (e) {}
  }

  /* Download a dataURL as file */
  function downloadDataURL(dataUrl, filename) {
    var a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    _ccBeaconDownload(_fmtFromName(filename));
  }

  /* Download a blob */
  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    _ccBeaconDownload(_fmtFromName(filename));
  }

  /* Get jsPDF constructor */
  function getJsPDF() {
    return (typeof jspdf !== 'undefined') ? jspdf.jsPDF : (typeof jsPDF !== 'undefined' ? jsPDF : null);
  }

  /* DataURL → Blob */
  function dataURLtoBlob(dataURL) {
    var parts = dataURL.split(',');
    var mime = parts[0].match(/:(.*?);/)[1];
    var b64 = atob(parts[1]);
    var arr = new Uint8Array(b64.length);
    for (var i = 0; i < b64.length; i++) arr[i] = b64.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  /* Safe filename */
  function safeName(str) {
    return (str || 'page').replace(/[^\w\-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'page';
  }

  /* Format extension map */
  var FORMAT_EXT = {
    png: '.png', jpeg: '.jpg', webp: '.webp', svg: '.svg', pdf: '.pdf', psd: '.psd'
  };

  /* ── Single Page Export ──────────────────────────────── */

  function exportPageAsImage(pageIndex, format, dpi, opts) {
    opts = opts || {};
    var fmt = format === 'jpg' ? 'jpeg' : format;
    var page = pages[pageIndex];
    var name = safeName(page ? page.label : 'page-' + (pageIndex + 1));
    var ext = FORMAT_EXT[fmt] || '.png';

    // Render straight to a Blob via the async toBlob path (no main-thread toDataURL freeze at high DPI),
    // exactly at dpi× (retina:false, so the file matches the shown dimensions and huge DPRs can't OOM).
    var ropts = { out: 'blob', retina: false, transparent: !!opts.transparent };
    if (typeof opts.quality === 'number') ropts.quality = opts.quality;
    if (typeof opts.onProgress === 'function') ropts.onProgress = opts.onProgress;
    return renderPage(pageIndex, fmt, dpi, ropts).then(function (blob) {
      if (!blob) throw new Error('Failed to render page');
      downloadBlob(blob, name + ext);
      return { success: true, filename: name + ext };
    });
  }

  function exportPageAsSVG(pageIndex) {
    var page = pages[pageIndex];
    var name = safeName(page ? page.label : 'page-' + (pageIndex + 1));

    return renderPageSVG(pageIndex).then(function (svg) {
      if (!svg) throw new Error('Failed to render SVG');
      var blob = new Blob([svg], { type: 'image/svg+xml' });
      downloadBlob(blob, name + '.svg');
      return { success: true, filename: name + '.svg' };
    });
  }

  function exportPageAsPDF(pageIndex, dpi, opts) {
    opts = opts || {};
    var PDF = getJsPDF();
    if (!PDF) throw new Error('jsPDF not available');

    var page = pages[pageIndex];
    var name = safeName(page ? page.label : 'page-' + (pageIndex + 1));
    var pageW = page ? page.w || CW : CW;
    var pageH = page ? page.h || CH : CH;

    // Use inches: convert from px at 72dpi base
    var wInch = pageW / 72;
    var hInch = pageH / 72;
    var orientation = wInch > hInch ? 'landscape' : 'portrait';

    var _pdfRopts = {};
    if (typeof opts.onProgress === 'function') _pdfRopts.onProgress = opts.onProgress;
    return renderPage(pageIndex, 'png', dpi, _pdfRopts).then(function (dataURL) {
      if (!dataURL) throw new Error('Failed to render page');
      var doc = new PDF({ orientation: orientation, unit: 'in', format: [wInch, hInch] });
      doc.setProperties({ title: name, creator: 'dika studio' });
      doc.addImage(dataURL, 'PNG', 0, 0, wInch, hInch);
      doc.save(name + '.pdf');
      return { success: true, filename: name + '.pdf' };
    });
  }

  /* ── Multi-Page PDF ──────────────────────────────── */

  function exportMultiPagePDF(pageIndices, dpi, filename) {
    var PDF = getJsPDF();
    if (!PDF) throw new Error('jsPDF not available');

    var fname = safeName(filename || 'export') + '.pdf';
    var doc = null;

    return pageIndices.reduce(function (chain, pi, idx) {
      return chain.then(function () {
        var page = pages[pi];
        var pw = page ? page.w || CW : CW;
        var ph = page ? page.h || CH : CH;
        var wInch = pw / 72;
        var hInch = ph / 72;
        var ori = wInch > hInch ? 'landscape' : 'portrait';

        return renderPage(pi, 'png', dpi).then(function (dataURL) {
          if (!dataURL) return;
          if (idx === 0) {
            doc = new PDF({ orientation: ori, unit: 'in', format: [wInch, hInch] });
            doc.setProperties({ title: fname, creator: 'dika studio' });
          } else {
            doc.addPage([wInch, hInch], ori);
          }
          doc.addImage(dataURL, 'PNG', 0, 0, wInch, hInch);
        });
      });
    }, Promise.resolve()).then(function () {
      if (doc) {
        doc.save(fname);
        return { success: true, filename: fname };
      }
      throw new Error('No pages rendered');
    });
  }

  /* ── ZIP Bundle Export ──────────────────────────────── */

  function exportPagesAsZIP(pageIndices, format, dpi, zipName) {
    if (typeof JSZip === 'undefined') {
      showToast('JSZip library not loaded', 'error');
      return Promise.reject(new Error('JSZip not available'));
    }

    var fmt = format === 'jpg' ? 'jpeg' : format;
    var ext = FORMAT_EXT[fmt] || '.png';
    var zip = new JSZip();
    var name = safeName(zipName || 'export');

    return pageIndices.reduce(function (chain, pi, idx) {
      return chain.then(function () {
        var page = pages[pi];
        var label = safeName(page ? page.label : 'page-' + (pi + 1));

        if (fmt === 'svg') {
          return renderPageSVG(pi).then(function (svg) {
            // renderPart resolves null when the SVG could not be sanitized (see core/render-part.js).
            // Skipping silently would hand back a zip that is quietly missing a page.
            if (svg) zip.file(label + '.svg', svg);
            else console.warn('[export] SVG skipped for "' + label + '" — could not be sanitized');
          });
        }

        return renderPage(pi, fmt, dpi).then(function (dataURL) {
          if (dataURL) {
            var b64 = dataURL.split(',')[1];
            zip.file(label + ext, b64, { base64: true });
          }
        });
      });
    }, Promise.resolve()).then(function () {
      return zip.generateAsync({ type: 'blob' });
    }).then(function (blob) {
      downloadBlob(blob, name + '.zip');
      return { success: true, filename: name + '.zip' };
    });
  }

  /* ── PSD Export (True layered, RLE compressed) ────── */

  /* PSD export raster budget (export-import-manager-plan Phase 5 — "raise the PSD DPI cap safely").
     A flat 150-DPI cap was both too low for small pages and still unsafe for huge ones. Instead we
     allow up to PSD_MAX_DPI but clamp the effective DPI so the rasterized page stays under a
     per-layer megapixel budget: small/A4/card pages export at full quality, giant canvases are
     scaled down before they can blow up memory. */
  var PSD_MAX_DPI = 300;         // was 150
  var PSD_MAX_MEGAPIXELS = 30;   // ~30 MP per layer (≈120 MB RGBA) safety ceiling
  function _psdEffectiveDpi(reqDpi, pageW, pageH) {
    var d = Math.min(reqDpi || 300, PSD_MAX_DPI);
    var w = pageW || CW, h = pageH || CH;
    var mult = d / 72;
    var mp = (w * mult) * (h * mult) / 1e6;
    if (mp > PSD_MAX_MEGAPIXELS && w > 0 && h > 0) {
      mult = Math.sqrt((PSD_MAX_MEGAPIXELS * 1e6) / (w * h));
      d = Math.max(72, Math.round(mult * 72));
    }
    return d;
  }

  /* Determine a human-readable layer name from a Fabric object */
  function _layerName(obj, idx) {
    if (obj._isMyShapeAsset || obj._isBrushShape) {
      return obj._customName || obj._myShapeDisplayName || 'Shape ' + (idx + 1);
    }
    if (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox') {
      var txt = (obj.text || '').substring(0, 30);
      return txt || 'Text ' + (idx + 1);
    }
    if (obj.type === 'image') {
      if (obj.isQR) return 'QR Code';
      if (obj._isChart) return 'Chart';
      if (obj._isEffect) return 'Blur (' + (obj._fxPreset || 'mesh') + ')';
      return obj._imageName || 'Image ' + (idx + 1);
    }
    if (obj.type === 'group') {
      return obj._groupName || 'Group (' + (obj.objects ? obj.objects.length : 0) + ')';
    }
    if (obj.type === 'rect') return 'Rectangle';
    if (obj.type === 'circle' || obj.type === 'ellipse') return 'Ellipse';
    if (obj.type === 'triangle') return 'Triangle';
    if (obj.type === 'polygon') return 'Polygon';
    if (obj.type === 'line') return 'Line';
    if (obj.type === 'path') return obj._iconName || 'Path';
    return (obj.type || 'Layer') + ' ' + (idx + 1);
  }

  /* ── ag-psd (MIT): PRIMARY PSD writer + PSD reader. The built-in _writePSD stays a bounded fallback
     for when the CDN is unavailable (rule 13 style), so PSD export never breaks. ────────────────── */
  var _agPsdLib = null, _agPsdLoading = null;
  function _ensureAgPsd() {
    if (_agPsdLib) return Promise.resolve(_agPsdLib);
    if (typeof window !== 'undefined' && window.agPsd) { _agPsdLib = window.agPsd; return Promise.resolve(_agPsdLib); }
    if (_agPsdLoading) return _agPsdLoading;
    if (!(window.cc && cc.requireLib)) return Promise.resolve(null);
    _agPsdLoading = cc.requireLib('js/vendor/ag-psd-bundle.js')
      .then(function () { _agPsdLib = (typeof window !== 'undefined') ? (window.agPsd || null) : null; return _agPsdLib; })
      .catch(function () { return null; });
    return _agPsdLoading;
  }
  function _imageDataToCanvas(imgData, w, h) {
    var c = document.createElement('canvas');
    c.width = (imgData && imgData.width) || w || 1;
    c.height = (imgData && imgData.height) || h || 1;
    if (imgData) c.getContext('2d').putImageData(imgData, 0, 0);
    return c;
  }

  var _TEXT_TYPES = { 'i-text': 1, 'text': 1, 'textbox': 1 };
  function _isTextType(o) { return !!(o && _TEXT_TYPES[o.type]); }

  /* fabric fill (hex / rgb()/rgba()) → {r,g,b} for an ag-psd type layer. */
  function _fillToRgb(fill) {
    var d = { r: 0, g: 0, b: 0 };
    if (typeof fill !== 'string' || !fill) return d;
    var s = fill.trim();
    var m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) {
      var hx = m[1];
      if (hx.length === 3) hx = hx[0] + hx[0] + hx[1] + hx[1] + hx[2] + hx[2];
      return { r: parseInt(hx.slice(0, 2), 16), g: parseInt(hx.slice(2, 4), 16), b: parseInt(hx.slice(4, 6), 16) };
    }
    var rm = s.match(/rgba?\(([^)]+)\)/i);
    if (rm) { var p = rm[1].split(','); return { r: Math.round(+p[0] || 0), g: Math.round(+p[1] || 0), b: Math.round(+p[2] || 0) }; }
    return d;
  }

  /* "Poppins, sans-serif" → "Poppins" (first family, quotes stripped) for the PSD font name. */
  function _psFontName(family) {
    if (typeof family !== 'string' || !family) return 'ArialMT';
    return family.split(',')[0].replace(/['"]/g, '').trim() || 'ArialMT';
  }

  /* Build an ag-psd EDITABLE type-layer descriptor from an ENLIVENED fabric text object. Returns null
     (→ caller keeps the rasterised layer) for rotated/skewed/empty text, which can't be placed reliably
     as point text. multiplier scales base px → PSD px. */
  function _agTextDescriptor(to, mult) {
    if (!to) return null;
    // A Photoshop point-text type layer does NOT auto-wrap. A fabric Textbox stores its text UNWRAPPED
    // (line breaks are computed at render), so feeding the raw string would render one long line that
    // spills far outside the box. Use the object's ACTUAL wrapped lines (textLines) joined by newlines so
    // the type layer breaks exactly where the editor does.
    var str;
    if (to.type === 'textbox' && Array.isArray(to.textLines) && to.textLines.length) {
      // Trailing whitespace on a wrapped line shifts centered/right text off-centre in Photoshop — trim it.
      str = to.textLines.map(function (l) { return String(l).replace(/\s+$/, ''); }).join('\n');
    } else {
      str = (typeof to.text === 'string') ? to.text : '';
    }
    if (!str) return null;
    if (to.setCoords) to.setCoords();
    // The FULL object transform (scale + rotation + position) carries all sizing, so even a rotated or
    // scaled text (e.g. grouped watermark text) stays an editable type layer. fontSize is the RAW point
    // size; the PSD is written at 72 PPI (see _writeAg) so points == pixels and the transform's scale
    // (×mult) sets the true on-canvas size. This kills the old bug where fontSize was ALSO multiplied by
    // mult AND re-scaled by the document resolution, blowing text up ~DPI/72× until it overflowed.
    var fs = to.fontSize || 16;
    var talign = to.textAlign || 'left';
    var justMap = { left: 'left', center: 'center', right: 'right', justify: 'justifyLeft' };
    var style = {
      font: { name: _psFontName(to.fontFamily) },
      fontSize: Math.max(1, Math.round(fs)),
      autoLeading: false,
      leading: Math.max(1, Math.round(fs * (to.lineHeight || 1.16))),   // match the editor's line spacing
      fillColor: _fillToRgb(to.fill),
      fauxBold: (to.fontWeight === 'bold' || (+to.fontWeight >= 600)),
      fauxItalic: (to.fontStyle === 'italic' || to.fontStyle === 'oblique')
    };
    var para = { justification: justMap[talign] || 'left' };
    var ang = (((to.angle || 0) % 360) + 360) % 360;
    if ((ang < 0.01 || ang > 359.99) && !to.skewX && !to.skewY) {
      // Axis-aligned: anchor the type to the GLYPH bounding box — the exact box the (correct) raster uses —
      // instead of the looser text-box geometry, so the editable text sits ON the pixels. The transform
      // carries the object's scale; fontSize is raw (72 PPI ⇒ points == px).
      var br = to.getBoundingRect(true, true);
      var effFs = fs * (to.scaleY || 1);
      var tyBase = br.top + effFs * 0.76;   // first-line baseline ≈ glyph top + cap/ascent
      var txBase = (talign === 'center') ? (br.left + br.width / 2)
                 : (talign === 'right') ? (br.left + br.width) : br.left;
      return {
        text: str,
        transform: [(to.scaleX || 1) * mult, 0, 0, (to.scaleY || 1) * mult, txBase * mult, tyBase * mult],
        style: style, paragraphStyle: para
      };
    }
    // Rotated / skewed → full transform matrix (scale + rotation + position) + box-derived baseline.
    var m = to.calcTransformMatrix();            // [a,b,c,d,e,f] local-center → canvas px
    var W = to.width || 0, H = to.height || 0;
    var anchorX = (talign === 'center') ? 0 : (talign === 'right' ? (W / 2) : (-W / 2));
    var baseline = fabric.util.transformPoint(new fabric.Point(anchorX, -H / 2 + fs * 0.8), m);
    return {
      text: str,
      transform: [m[0] * mult, m[1] * mult, m[2] * mult, m[3] * mult, baseline.x * mult, baseline.y * mult],
      style: style, paragraphStyle: para
    };
  }

  /* Render ONE object for the PSD. Key: the raster is sized to the object's OWN bounds, so anything the
     object was scaled PAST the canvas edge is captured too (fixes the "cut like a ruler" crop) — the layer
     is then placed at left/top, which may sit beyond the document. Also produces the editable text/vector
     descriptor (kind 'text' | 'shape') and lifts object opacity to layer opacity. Resolves
     { canvas, left, top, text, vector, opacity }; a pathologically huge object falls back to a doc-clipped
     imageData at 0,0 so it can't blow up memory. */
  function _renderObjLayer(objJson, baseW, baseH, multiplier, kind) {
    return new Promise(function (resolve) {
      var tmpC = new fabric.StaticCanvas(null, { width: Math.max(1, baseW), height: Math.max(1, baseH), enableRetinaScaling: false });
      tmpC.loadFromJSON({ version: '5.3.0', objects: [objJson] }, function () {
        var to = tmpC.getObjects()[0];
        if (!to) { try { tmpC.dispose(); } catch (e) {} resolve({}); return; }
        // Object opacity → PSD LAYER opacity (Photoshop re-renders type/vector layers at full opacity, so a
        // baked-in approach is ignored). Render full-opacity too, so opacity is applied exactly once.
        var op = (typeof to.opacity === 'number') ? to.opacity : 1;
        if (op < 1) to.set('opacity', 1);
        if (to.setCoords) to.setCoords();
        var text = null, vector = null;
        if (kind === 'text') { try { text = _agTextDescriptor(to, multiplier); } catch (e) {} }
        else if (kind === 'shape') { try { vector = _shapeToVectorLayer(to, multiplier); } catch (e) {} }

        var br = to.getBoundingRect(true, true);   // absolute AABB in base px
        var pad = 2;
        var bx = Math.floor(br.left - pad), by = Math.floor(br.top - pad);
        var bw = Math.max(1, Math.ceil(br.width + pad * 2)), bh = Math.max(1, Math.ceil(br.height + pad * 2));
        var rw = Math.round(bw * multiplier), rh = Math.round(bh * multiplier);

        if (rw > 16000 || rh > 16000 || rw * rh > 180000000) {
          // Only a pathologically huge object falls back to a doc-clipped raster (overflow lost) to dodge OOM.
          tmpC.renderAll();
          var elc = tmpC.toCanvasElement(multiplier);
          var cc = document.createElement('canvas'); cc.width = Math.round(baseW * multiplier); cc.height = Math.round(baseH * multiplier);
          var cctx = cc.getContext('2d'); cctx.drawImage(elc, 0, 0, cc.width, cc.height);
          var idc = cctx.getImageData(0, 0, cc.width, cc.height);
          try { tmpC.dispose(); } catch (e) {}
          resolve({ imageData: idc, text: text, vector: vector, opacity: op });
          return;
        }

        // Resize the temp canvas to the object's bbox and shift the object into frame, then rasterise.
        tmpC.setWidth(bw); tmpC.setHeight(bh);
        to.set({ left: (to.left || 0) - bx, top: (to.top || 0) - by });
        to.setCoords();
        tmpC.renderAll();
        var el = tmpC.toCanvasElement(multiplier);
        try { tmpC.dispose(); } catch (e) {}
        resolve({ canvas: el, left: Math.round(bx * multiplier), top: Math.round(by * multiplier), text: text, vector: vector, opacity: op });
      });
    });
  }

  /* Bottom "Arka Plan" layer filled with the part's solid background colour (skipped for transparent/
     gradient/pattern backgrounds — the merged composite still carries those). */
  function _prependBgLayer(children, color, w, h) {
    if (typeof color !== 'string' || !color) return;
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var ctx = c.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, w, h);
    children.unshift({ name: 'Background', canvas: c });
  }

  var _SHAPE_TYPES = { rect: 1, circle: 1, ellipse: 1, triangle: 1, polygon: 1, polyline: 1 };
  function _isShapeType(o) { return !!(o && _SHAPE_TYPES[o.type]); }

  /* Analytic fabric shape → PSD vector-path knots, in DOCUMENT PIXELS. Each knot is
     [inCtrlX, inCtrlY, anchorX, anchorY, outCtrlX, outCtrlY] (ag-psd BezierKnot.points). The object's
     own transform matrix bakes in position / rotation / scale, so vector shapes survive transforms. */
  function _shapeKnots(to, mult) {
    var m = to.calcTransformMatrix();
    var K = 0.5522847498307936; // circle→bezier control ratio
    function A(lx, ly) { var p = fabric.util.transformPoint(new fabric.Point(lx, ly), m); return { x: p.x * mult, y: p.y * mult }; }
    function knot(inC, an, outC) { return [inC.x, inC.y, an.x, an.y, outC.x, outC.y]; }
    function straight(an) { return knot(an, an, an); }
    var t = to.type, w = to.width || 0, h = to.height || 0;

    if (t === 'rect') {
      var rx = Math.max(0, Math.min(to.rx || 0, w / 2));
      var ry = Math.max(0, Math.min(to.ry || 0, h / 2));
      var x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2;
      if (rx <= 0 && ry <= 0) {
        return [straight(A(x0, y0)), straight(A(x1, y0)), straight(A(x1, y1)), straight(A(x0, y1))];
      }
      var kx = rx * K, ky = ry * K;
      var a1 = A(x0 + rx, y0), a1in = A(x0 + rx - kx, y0);
      var a2 = A(x1 - rx, y0), a2out = A(x1 - rx + kx, y0);
      var a3 = A(x1, y0 + ry), a3in = A(x1, y0 + ry - ky);
      var a4 = A(x1, y1 - ry), a4out = A(x1, y1 - ry + ky);
      var a5 = A(x1 - rx, y1), a5in = A(x1 - rx + kx, y1);
      var a6 = A(x0 + rx, y1), a6out = A(x0 + rx - kx, y1);
      var a7 = A(x0, y1 - ry), a7in = A(x0, y1 - ry + ky);
      var a8 = A(x0, y0 + ry), a8out = A(x0, y0 + ry - ky);
      return [knot(a1in, a1, a1), knot(a2, a2, a2out), knot(a3in, a3, a3), knot(a4, a4, a4out),
              knot(a5in, a5, a5), knot(a6, a6, a6out), knot(a7in, a7, a7), knot(a8, a8, a8out)];
    }
    if (t === 'ellipse' || t === 'circle') {
      var erx = (t === 'circle') ? (to.radius || 0) : (to.rx || 0);
      var ery = (t === 'circle') ? (to.radius || 0) : (to.ry || 0);
      if (erx <= 0 || ery <= 0) return null;
      var hx = erx * K, hy = ery * K;
      var R = A(erx, 0), B = A(0, ery), L = A(-erx, 0), T = A(0, -ery);
      return [
        knot(A(erx, -hy), R, A(erx, hy)),
        knot(A(hx, ery), B, A(-hx, ery)),
        knot(A(-erx, hy), L, A(-erx, -hy)),
        knot(A(-hx, -ery), T, A(hx, -ery))
      ];
    }
    if (t === 'triangle') {
      return [straight(A(-w / 2, h / 2)), straight(A(0, -h / 2)), straight(A(w / 2, h / 2))];
    }
    if (t === 'polygon' || t === 'polyline') {
      var pts = to.points; if (!pts || pts.length < 2) return null;
      var off = to.pathOffset || { x: 0, y: 0 };
      return pts.map(function (p) { return straight(A(p.x - off.x, p.y - off.y)); });
    }
    return null;
  }

  /* Build an ag-psd EDITABLE vector shape layer (vectorMask + solid vectorFill) from an enlivened
     analytic shape. Only SOLID-fill, UNSTROKED shapes qualify — stroked / gradient / pattern / path /
     line shapes return null and stay rasterised so nothing loses fidelity. */
  function _shapeToVectorLayer(to, mult) {
    if (!_isShapeType(to)) return null;
    if (typeof to.fill !== 'string' || !to.fill || to.fill === 'transparent') return null;
    if (to.stroke && (to.strokeWidth || 0) > 0) return null;
    var knots = _shapeKnots(to, mult);
    if (!knots || knots.length < 2) return null;
    return {
      vectorMask: { paths: [{ open: (to.type === 'polyline'), knots: knots, fillRule: 'even-odd' }] },
      vectorFill: { type: 'color', color: _fillToRgb(to.fill) }
    };
  }

  // Flat layerPlan (with group start/end markers) → ag-psd nested children. layerResults[i] carries the
  // rasterised imageData plus optional editable extras (text type layer / vector shape). When extras is
  // false (fallback pass) only the raster canvas is written, so a rejected descriptor never breaks export.
  function _layerPlanToAgPsdChildren(layerPlan, layerResults, extras, w, h) {
    var root = [], stack = [root];
    layerPlan.forEach(function (item, i) {
      var top = stack[stack.length - 1];
      if (item.isGroupStart) { var g = { name: item.name || 'Group', opened: true, children: [] }; top.push(g); stack.push(g.children); }
      else if (item.isGroupEnd) { if (stack.length > 1) stack.pop(); }
      else if (item.isLayer) {
        var res = layerResults[i] || {};
        var layer = { name: item.name || 'Layer' };
        if (res.canvas) {
          // Full-extent raster placed at its true doc position (left/top may be negative / past the edge),
          // so content the object pushed beyond the canvas is preserved — no "cut like a ruler" crop.
          layer.canvas = res.canvas; layer.left = res.left || 0; layer.top = res.top || 0;
        } else {
          layer.canvas = _imageDataToCanvas(res.imageData, w, h); // doc-clipped fallback (pathologically huge obj)
        }
        // Opacity was lifted off the pixels into the layer, so it is applied exactly once here.
        if (typeof res.opacity === 'number' && res.opacity < 1) layer.opacity = res.opacity;
        // Editable text (type layer) + vector shape descriptors on top of the correct full-extent raster,
        // so the text stays editable in Photoshop. (Photoshop re-renders type from font metrics, which can
        // sit a hair off the raster — the trade-off for editability.)
        if (extras && res.text) layer.text = res.text;
        if (extras && res.vector) {
          if (res.vector.vectorMask) layer.vectorMask = res.vector.vectorMask;
          if (res.vector.vectorFill) layer.vectorFill = res.vector.vectorFill;
        }
        top.push(layer);
      }
    });
    return root;
  }

  /* Flatten ONE group's children to standalone objects with ABSOLUTE transforms. Uses fabric's OWN
     ungroup math (_restoreObjectsState) instead of hand-rolled matrix math — the manual version placed
     the child's top-left where its centre should go, shifting rotated / scaled group children diagonally.
     Absolute left/top/scale/angle/skew are copied onto the ORIGINAL child JSON so text/styles survive. */
  function _flattenGroupChildren(groupObj) {
    return new Promise(function (resolve) {
      var tmp = new fabric.StaticCanvas(null, { width: 10, height: 10, enableRetinaScaling: false });
      tmp.loadFromJSON({ version: '5.3.0', objects: [groupObj] }, function () {
        var g = tmp.getObjects()[0], out = [], src = groupObj.objects || [];
        if (g && typeof g.getObjects === 'function') {
          var kids = g.getObjects().slice();
          try { if (typeof g._restoreObjectsState === 'function') g._restoreObjectsState(); } catch (e) {}
          kids.forEach(function (child, i) {
            var co;
            try { co = JSON.parse(JSON.stringify(src[i] || {})); } catch (e) { co = {}; }
            co.left = child.left; co.top = child.top;
            co.originX = child.originX; co.originY = child.originY;
            co.angle = child.angle; co.scaleX = child.scaleX; co.scaleY = child.scaleY;
            co.skewX = child.skewX || 0; co.skewY = child.skewY || 0;
            co.flipX = !!child.flipX; co.flipY = !!child.flipY;
            co.opacity = (co.opacity == null ? 1 : co.opacity) * (groupObj.opacity == null ? 1 : groupObj.opacity);
            out.push({ obj: co, name: _layerName(src[i] || child, i), isText: _isTextType(co), isShape: _isShapeType(co) });
          });
        }
        try { tmp.dispose(); } catch (e) {}
        resolve(out);
      });
    });
  }

  /* Build the flat layerPlan (with group open/close markers), enlivening each group for correct child
     positions. Async because group enliven is async. */
  function _buildLayerPlan(objs) {
    var plan = [];
    return objs.reduce(function (chain, obj, idx) {
      return chain.then(function () {
        if (obj.type === 'group' && obj.objects && obj.objects.length > 0) {
          var gName = obj._groupName || 'Group (' + obj.objects.length + ')';
          plan.push({ isGroupStart: true, name: gName });
          return _flattenGroupChildren(obj).then(function (children) {
            children.forEach(function (c) { plan.push({ obj: c.obj, name: c.name, isLayer: true, isText: c.isText, isShape: c.isShape }); });
            plan.push({ isGroupEnd: true, name: gName });
          });
        }
        plan.push({ obj: obj, name: _layerName(obj, idx), isLayer: true, isText: _isTextType(obj), isShape: _isShapeType(obj) });
      });
    }, Promise.resolve()).then(function () { return plan; });
  }

  function exportPageAsPSD(pageIndex, dpi) {
    var page = pages[pageIndex];
    if (!page || !page.json) return Promise.reject(new Error('No page data'));
    var name = safeName(page.label || 'page-' + (pageIndex + 1));
    var effectiveDpi = _psdEffectiveDpi(dpi, page.w || CW, page.h || CH);
    var multiplier = effectiveDpi / 72;
    var pageW = Math.round((page.w || CW) * multiplier);
    var pageH = Math.round((page.h || CH) * multiplier);
    var _psdSrc = (typeof resolvePartSource === 'function') ? resolvePartSource(page) : null;
    var bgColor = (_psdSrc && _psdSrc.bg != null) ? _psdSrc.bg : page.bg;   // → bottom "Arka Plan" layer

    // Exclude UI/helper objects (guides, grid lines, crop/perspective handles, excludeFromExport)
    // so they don't become real PSD layers. Page-sleep: resolvePartSource already returns the
    // hydrated json for a slept page, so read objects from it (falls back to page.json).
    var _psdJson = (_psdSrc && _psdSrc.json) || page.json;
    var objs = ((_psdJson && _psdJson.objects) || []).filter(function (o) {
      return o && !o.excludeFromExport && !o._isGuide && !o.isSmartGuide && !o._isGridLine &&
        !o._isPerspHandle && !o._isPerspOutline && !o._isPeHandle && !o._isPeOutline &&
        !o._isCropDim && !o._isCropGrid && !o._isCropRect && !o._isSelPreview &&
        !o._isPaintCursor && !o._isPaintSelPreview;
    });
    if (objs.length === 0) return Promise.reject(new Error('Page has no objects'));

    // Build the layer plan. Groups are enlivened so each child's transform is ABSOLUTE (fabric's own
    // ungroup math) — the previous hand-rolled matrix math shifted rotated/scaled group children.
    return _buildLayerPlan(objs).then(function (layerPlan) {

    // Every object renders at its FULL extent (unclipped) as a raster layer, so content scaled past the
    // page edge survives. Text/analytic shapes also carry an editable descriptor (kind 'text'/'shape').
    var baseW = page.w || CW, baseH = page.h || CH;
    var renderPromises = layerPlan.map(function (item) {
      if (!item.isLayer) return Promise.resolve({});
      var kind = item.isText ? 'text' : (item.isShape ? 'shape' : 'raster');
      return _renderObjLayer(item.obj, baseW, baseH, multiplier, kind);
    });

    var mergedPromise = renderPage(pageIndex, 'png', effectiveDpi).then(function (dataURL) {
      if (!dataURL) return null;
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () {
          var c = document.createElement('canvas');
          c.width = pageW; c.height = pageH;
          var ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, pageW, pageH);
          resolve(ctx.getImageData(0, 0, pageW, pageH));
        };
        img.src = dataURL;
      });
    });

    return Promise.all([Promise.all(renderPromises), mergedPromise, _ensureAgPsd()]).then(function (results) {
      var layerResults = results[0];
      var mergedImage = results[1];
      var agPsd = results[2];

      var blob = null, engine = 'builtin';
      if (agPsd && typeof agPsd.writePsd === 'function') {
        var _writeAg = function (extras) {
          var children = _layerPlanToAgPsdChildren(layerPlan, layerResults, extras, pageW, pageH);
          _prependBgLayer(children, bgColor, pageW, pageH);
          var abuf = agPsd.writePsd({
            width: pageW, height: pageH, children: children,
            canvas: _imageDataToCanvas(mergedImage, pageW, pageH),
            // Force 72 PPI so type layers treat points as pixels (see _agTextDescriptor).
            imageResources: { resolutionInfo: {
              horizontalResolution: 72, horizontalResolutionUnit: 'PPI', widthUnit: 'Inches',
              verticalResolution: 72, verticalResolutionUnit: 'PPI', heightUnit: 'Inches'
            } }
          });
          return new Blob([abuf], { type: 'image/vnd.adobe.photoshop' });
        };
        try { blob = _writeAg(true); engine = 'ag-psd'; }
        catch (e) {
          // A malformed type/vector descriptor can make ag-psd throw — retry with raster-only layers
          // (still ag-psd, still the bg layer) before dropping to the built-in writer.
          try { blob = _writeAg(false); engine = 'ag-psd'; }
          catch (e2) { blob = null; }
        }
      }
      if (!blob) {
        // Built-in writer expects a doc-sized ImageData per layer — composite each full-extent raster
        // (or reuse the clipped one) onto a doc canvas at its position.
        var layerImages = layerResults.map(function (r) {
          if (!r) return null;
          if (r.imageData) return r.imageData;
          if (r.canvas) {
            var dc = document.createElement('canvas'); dc.width = pageW; dc.height = pageH;
            var dctx = dc.getContext('2d');
            try { dctx.drawImage(r.canvas, r.left || 0, r.top || 0); } catch (e) {}
            return dctx.getImageData(0, 0, pageW, pageH);
          }
          return null;
        });
        var psdBuffer = _writePSD(pageW, pageH, layerPlan, layerImages, mergedImage);
        blob = new Blob([psdBuffer], { type: 'application/octet-stream' });
        engine = 'builtin';
      }
      downloadBlob(blob, name + '.psd');

      var layerCount = layerPlan.filter(function (l) { return l.isLayer; }).length;
      showToast('PSD exported with ' + layerCount + ' layers!', 'success');
      return { success: true, filename: name + '.psd', layered: true, layers: layerCount, engine: engine };
    });
    }); // _buildLayerPlan
  }

  /* ── PPTX deck export (PptxGenJS, MIT) ──────────────── */
  var _pptxLib = null, _pptxLoading = null;
  function _ensurePptx() {
    if (_pptxLib) return Promise.resolve(_pptxLib);
    if (typeof window !== 'undefined' && window.PptxGenJS) { _pptxLib = window.PptxGenJS; return Promise.resolve(_pptxLib); }
    if (_pptxLoading) return _pptxLoading;
    if (!(window.cc && cc.requireLib)) return Promise.resolve(null);
    _pptxLoading = cc.requireLib('js/vendor/pptxgen.bundle.js')
      .then(function () { _pptxLib = (typeof window !== 'undefined') ? (window.PptxGenJS || null) : null; return _pptxLib; })
      .catch(function () { return null; });
    return _pptxLoading;
  }

  // Export a slide-deck page (or any page) to a .pptx: one PowerPoint slide per inner slide, each a
  // full-bleed rendered image. Deck geometry drives the PPTX layout size.
  function exportDeckAsPPTX(pageIndex) {
    var page = pages[pageIndex];
    if (!page) return Promise.reject(new Error('No page data'));
    var name = safeName(page.label || 'deck');
    var slides = (page._slideDeck && page._slideDeck.slides && page._slideDeck.slides.length)
      ? page._slideDeck.slides.map(function (sl) { return { kind: 'slide', json: sl.json, w: sl.w, h: sl.h, bg: sl.bg }; })
      : [ (typeof resolvePartSource === 'function') ? resolvePartSource(page) : { kind: 'page', json: page.json, w: page.w, h: page.h, bg: page.bg } ];
    return _ensurePptx().then(function (P) {
      if (!P) throw new Error('PPTX library unavailable');
      var pptx = new P();
      var first = slides[0] || {};
      var wIn = Math.max(1, (first.w || CW) / 96), hIn = Math.max(1, (first.h || CH) / 96);
      pptx.defineLayout({ name: 'CC', width: wIn, height: hIn }); pptx.layout = 'CC';
      var chain = Promise.resolve();
      slides.forEach(function (it) {
        chain = chain.then(function () {
          return renderPart({ kind: it.kind, json: it.json, w: it.w, h: it.h, bg: it.bg, x: it.x, y: it.y }, { format: 'png', dpi: 150 }).then(function (url) {
            var s = pptx.addSlide();
            if (url) s.addImage({ data: url, x: 0, y: 0, w: wIn, h: hIn });
          });
        });
      });
      return chain.then(function () {
        return pptx.write('blob').then(function (blob) {
          downloadBlob(blob, name + '.pptx');
          showToast(slides.length + ' slide PPTX exported', 'success');
          return { success: true, filename: name + '.pptx', slides: slides.length };
        });
      });
    });
  }

  /* ── PackBits RLE Compression ──────────────────────── */

  function _packBitsRow(src) {
    var out = [];
    var i = 0;
    var n = src.length;
    while (i < n) {
      var runStart = i;
      var val = src[i];
      while (i < n && i - runStart < 128 && src[i] === val) i++;
      var runLen = i - runStart;
      if (runLen > 2) {
        out.push((-(runLen - 1)) & 0xFF);
        out.push(val);
      } else {
        i = runStart;
        var litStart = i;
        while (i < n && i - litStart < 128) {
          if (i + 2 < n && src[i] === src[i + 1] && src[i] === src[i + 2]) break;
          i++;
        }
        var litLen = i - litStart;
        if (litLen === 0) { i++; litLen = 1; }
        out.push(litLen - 1);
        for (var j = litStart; j < litStart + litLen; j++) out.push(src[j]);
      }
    }
    return new Uint8Array(out);
  }

  function _rleCompressChannel(rawChannel, bw, bh) {
    var compressedRows = [];
    var totalCompressed = 0;
    for (var y = 0; y < bh; y++) {
      var row = rawChannel.subarray(y * bw, (y + 1) * bw);
      var compressed = _packBitsRow(row);
      compressedRows.push(compressed);
      totalCompressed += compressed.length;
    }
    // Buffer: compression(2) + rowByteCounts(bh*2) + compressed data
    var bufSize = 2 + bh * 2 + totalCompressed;
    var buf = new ArrayBuffer(bufSize);
    var view = new DataView(buf);
    var bytes = new Uint8Array(buf);
    var off = 0;
    view.setUint16(off, 1); off += 2; // compression = RLE
    for (var y = 0; y < bh; y++) {
      view.setUint16(off, compressedRows[y].length); off += 2;
    }
    for (var y = 0; y < bh; y++) {
      bytes.set(compressedRows[y], off);
      off += compressedRows[y].length;
    }
    return buf;
  }

  /* ── Minimal PSD Binary Writer ─────────────────────
     Writes a valid Adobe PSD file with:
     - Multiple layers (each with RLE-compressed RGBA channel data)
     - Group folders via section divider markers
     - Merged composite image (RLE compressed)
     Supports Photoshop CS2+ reading.
     ──────────────────────────────────────────────── */

  function _writePSD(w, h, layerPlan, layerImages, mergedImage) {
    var layerRecords = [];
    var channelDataBuffers = []; // Array of [ArrayBuffer×4] per layer

    layerPlan.forEach(function (item, planIdx) {
      if (item.isGroupStart) {
        layerRecords.push(_makeGroupStartRecord(item.name));
        channelDataBuffers.push(_makeEmptyChannelData());
      } else if (item.isGroupEnd) {
        layerRecords.push(_makeGroupEndRecord(item.name));
        channelDataBuffers.push(_makeEmptyChannelData());
      } else if (item.isLayer) {
        var imgData = layerImages[planIdx];
        if (!imgData) {
          layerRecords.push(_makeLayerRecord(item.name, 0, 0, 1, 1));
          channelDataBuffers.push(_makeEmptyChannelData());
        } else {
          var bbox = _findBBox(imgData);
          layerRecords.push(_makeLayerRecord(item.name, bbox.top, bbox.left, bbox.bottom, bbox.right));
          channelDataBuffers.push(_extractChannelData(imgData, bbox));
        }
      }
    });

    var layerCount = layerRecords.length;
    var layerInfoBuf = _buildLayerInfo(layerRecords, channelDataBuffers, layerCount);
    var mergedBuf = _buildMergedImageData(mergedImage, w, h);

    var headerSize = 26;
    var colorModeSize = 4;
    var imageResourcesSize = 4;
    var layerMaskSize = 4 + layerInfoBuf.byteLength;
    var totalSize = headerSize + colorModeSize + imageResourcesSize + layerMaskSize + mergedBuf.byteLength;

    var buf = new ArrayBuffer(totalSize);
    var view = new DataView(buf);
    var offset = 0;

    // 1. File Header (26 bytes)
    _writeStr(view, offset, '8BPS'); offset += 4;
    view.setUint16(offset, 1); offset += 2;
    offset += 6; // Reserved
    view.setUint16(offset, 4); offset += 2; // Channels (RGBA)
    view.setUint32(offset, h); offset += 4;
    view.setUint32(offset, w); offset += 4;
    view.setUint16(offset, 8); offset += 2; // Bits per channel
    view.setUint16(offset, 3); offset += 2; // Color mode (RGB)

    // 2. Color Mode Data
    view.setUint32(offset, 0); offset += 4;

    // 3. Image Resources
    view.setUint32(offset, 0); offset += 4;

    // 4. Layer and Mask Info
    view.setUint32(offset, layerInfoBuf.byteLength); offset += 4;
    new Uint8Array(buf, offset, layerInfoBuf.byteLength).set(new Uint8Array(layerInfoBuf));
    offset += layerInfoBuf.byteLength;

    // 5. Merged Image Data
    new Uint8Array(buf, offset, mergedBuf.byteLength).set(new Uint8Array(mergedBuf));
    offset += mergedBuf.byteLength;

    return buf;
  }

  function _writeStr(view, offset, str) {
    for (var i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  function _writePascalString(view, offset, str, padTo) {
    var len = Math.min(str.length, 255);
    view.setUint8(offset, len);
    for (var i = 0; i < len; i++) view.setUint8(offset + 1 + i, str.charCodeAt(i));
    var totalLen = 1 + len;
    while (totalLen % padTo !== 0) { view.setUint8(offset + totalLen, 0); totalLen++; }
    return totalLen;
  }

  function _findBBox(imgData) {
    var w = imgData.width;
    var h = imgData.height;
    var data = imgData.data;
    var top = h, left = w, bottom = 0, right = 0;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 0) {
          if (y < top) top = y;
          if (y > bottom) bottom = y;
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
    }
    if (top > bottom) { top = 0; left = 0; bottom = 1; right = 1; }
    else { bottom++; right++; }
    return { top: top, left: left, bottom: bottom, right: right };
  }

  /* Extract RGBA channels from bbox and RLE-compress each.
     Returns array of 4 ArrayBuffers [A, R, G, B]. */
  function _extractChannelData(imgData, bbox) {
    var data = imgData.data;
    var fullW = imgData.width;
    var bw = bbox.right - bbox.left;
    var bh = bbox.bottom - bbox.top;
    if (bw <= 0 || bh <= 0) return _makeEmptyChannelData();

    var rawA = new Uint8Array(bw * bh);
    var rawR = new Uint8Array(bw * bh);
    var rawG = new Uint8Array(bw * bh);
    var rawB = new Uint8Array(bw * bh);

    for (var y = bbox.top; y < bbox.bottom; y++) {
      for (var x = bbox.left; x < bbox.right; x++) {
        var si = (y * fullW + x) * 4;
        var di = (y - bbox.top) * bw + (x - bbox.left);
        rawR[di] = data[si];
        rawG[di] = data[si + 1];
        rawB[di] = data[si + 2];
        rawA[di] = data[si + 3];
      }
    }

    return [
      _rleCompressChannel(rawA, bw, bh),
      _rleCompressChannel(rawR, bw, bh),
      _rleCompressChannel(rawG, bw, bh),
      _rleCompressChannel(rawB, bw, bh)
    ];
  }

  function _makeLayerRecord(name, top, left, bottom, right) {
    return { name: name, top: top, left: left, bottom: bottom, right: right, isGroup: false, groupType: 0 };
  }

  function _makeGroupStartRecord(name) {
    return { name: name, top: 0, left: 0, bottom: 0, right: 0, isGroup: true, groupType: 0 };
  }

  function _makeGroupEndRecord(name) {
    return { name: '</Layer group>', top: 0, left: 0, bottom: 0, right: 0, isGroup: true, groupType: 3 };
  }

  /* Returns array of 4 ArrayBuffers, each 2 bytes (compression=0, 0 pixels) */
  function _makeEmptyChannelData() {
    return [new ArrayBuffer(2), new ArrayBuffer(2), new ArrayBuffer(2), new ArrayBuffer(2)];
  }

  function _buildLayerInfo(records, channelDatas, layerCount) {
    // Compute each layer record's byte size
    var recordSizes = records.map(function (rec) {
      var nameLen = Math.min(rec.name.length, 255);
      var pascalLen = 1 + nameLen;
      while (pascalLen % 4 !== 0) pascalLen++;

      var additionalSections = 0;
      if (rec.isGroup) additionalSections += 16; // lsct
      var uniNameLen = rec.name.length;
      var uniSectionLen = 8 + 4 + 4 + uniNameLen * 2;
      if (uniSectionLen % 2 !== 0) uniSectionLen++;
      additionalSections += uniSectionLen;

      var extraDataSize = 4 + 4 + pascalLen + additionalSections;
      var nChan = 4;
      return 16 + 2 + (nChan * 6) + 4 + 4 + 1 + 1 + 1 + 1 + 4 + extraDataSize;
    });

    // Sum per-layer channel data sizes (array of 4 buffers each)
    var channelDataTotalSizes = channelDatas.map(function (chans) {
      var total = 0;
      for (var c = 0; c < chans.length; c++) total += chans[c].byteLength;
      return total;
    });

    var layerInfoLen = 2;
    recordSizes.forEach(function (s) { layerInfoLen += s; });
    channelDataTotalSizes.forEach(function (s) { layerInfoLen += s; });
    var layerInfoPad = (layerInfoLen % 2 !== 0) ? 1 : 0;
    layerInfoLen += layerInfoPad;

    var totalLen = 4 + layerInfoLen + 4;
    var buf = new ArrayBuffer(totalLen);
    var view = new DataView(buf);
    var off = 0;

    view.setUint32(off, layerInfoLen); off += 4;
    view.setInt16(off, -layerCount); off += 2;

    // Write layer records
    records.forEach(function (rec, idx) {
      var nChan = 4;
      var chans = channelDatas[idx]; // [A, R, G, B] ArrayBuffers

      view.setInt32(off, rec.top); off += 4;
      view.setInt32(off, rec.left); off += 4;
      view.setInt32(off, rec.bottom); off += 4;
      view.setInt32(off, rec.right); off += 4;

      view.setUint16(off, nChan); off += 2;

      // Channel info with per-channel sizes
      var chanIds = [-1, 0, 1, 2];
      chanIds.forEach(function (cid, cIdx) {
        view.setInt16(off, cid); off += 2;
        view.setUint32(off, chans[cIdx].byteLength); off += 4;
      });

      _writeStr(view, off, '8BIM'); off += 4;
      _writeStr(view, off, 'norm'); off += 4;
      view.setUint8(off, 255); off += 1; // Opacity
      view.setUint8(off, 0); off += 1;   // Clipping
      view.setUint8(off, 0); off += 1;   // Flags
      view.setUint8(off, 0); off += 1;   // Filler

      var nameStr = rec.name;
      var nameLen = Math.min(nameStr.length, 255);
      var pascalLen = 1 + nameLen;
      while (pascalLen % 4 !== 0) pascalLen++;

      var additionalSections = 0;
      if (rec.isGroup) additionalSections += 16;
      var uniNameLen = nameStr.length;
      var uniSectionLen = 8 + 4 + 4 + uniNameLen * 2;
      if (uniSectionLen % 2 !== 0) uniSectionLen++;
      additionalSections += uniSectionLen;

      view.setUint32(off, 4 + 4 + pascalLen + additionalSections); off += 4;

      // Layer mask data length = 0
      view.setUint32(off, 0); off += 4;
      // Blending ranges length = 0
      view.setUint32(off, 0); off += 4;

      off += _writePascalString(view, off, nameStr, 4);

      if (rec.isGroup) {
        _writeStr(view, off, '8BIM'); off += 4;
        _writeStr(view, off, 'lsct'); off += 4;
        view.setUint32(off, 4); off += 4;
        view.setUint32(off, rec.groupType); off += 4;
      }

      // Unicode layer name (luni)
      _writeStr(view, off, '8BIM'); off += 4;
      _writeStr(view, off, 'luni'); off += 4;
      var uniDataLen = 4 + uniNameLen * 2;
      if (uniDataLen % 2 !== 0) uniDataLen++;
      view.setUint32(off, uniDataLen); off += 4;
      view.setUint32(off, uniNameLen); off += 4;
      for (var ci = 0; ci < uniNameLen; ci++) {
        view.setUint16(off, nameStr.charCodeAt(ci)); off += 2;
      }
      if ((uniNameLen * 2) % 2 !== 0) { view.setUint8(off, 0); off += 1; }
    });

    // Write channel image data for each layer
    channelDatas.forEach(function (chans) {
      for (var c = 0; c < chans.length; c++) {
        var cd = chans[c];
        new Uint8Array(buf, off, cd.byteLength).set(new Uint8Array(cd));
        off += cd.byteLength;
      }
    });

    if (layerInfoPad) { view.setUint8(off, 0); off += 1; }

    // Global layer mask info length = 0
    view.setUint32(off, 0); off += 4;

    return buf;
  }

  function _buildMergedImageData(mergedImage, w, h) {
    if (!mergedImage) {
      // Fallback: raw uncompressed empty
      var emptyBuf = new ArrayBuffer(2 + w * h * 4);
      new DataView(emptyBuf).setUint16(0, 0);
      return emptyBuf;
    }

    var data = mergedImage.data;
    var pixelCount = w * h;

    // Extract planar channels
    var rawR = new Uint8Array(pixelCount);
    var rawG = new Uint8Array(pixelCount);
    var rawB = new Uint8Array(pixelCount);
    var rawA = new Uint8Array(pixelCount);
    for (var i = 0; i < pixelCount; i++) {
      rawR[i] = data[i * 4];
      rawG[i] = data[i * 4 + 1];
      rawB[i] = data[i * 4 + 2];
      rawA[i] = data[i * 4 + 3];
    }

    // RLE compress each channel
    var channels = [rawR, rawG, rawB, rawA];
    var compressedChannels = [];
    var totalRows = h * 4;
    var allRowCounts = [];
    var totalCompressedSize = 0;

    channels.forEach(function (raw) {
      var chanRows = [];
      for (var y = 0; y < h; y++) {
        var row = raw.subarray(y * w, (y + 1) * w);
        var compressed = _packBitsRow(row);
        chanRows.push(compressed);
        allRowCounts.push(compressed.length);
        totalCompressedSize += compressed.length;
      }
      compressedChannels.push(chanRows);
    });

    // Buffer: compression(2) + rowByteCounts(totalRows*2) + compressed data
    var bufSize = 2 + totalRows * 2 + totalCompressedSize;
    var buf = new ArrayBuffer(bufSize);
    var view = new DataView(buf);
    var bytes = new Uint8Array(buf);
    var off = 0;

    view.setUint16(off, 1); off += 2; // compression = RLE

    // Row byte counts for ALL channels
    for (var rc = 0; rc < allRowCounts.length; rc++) {
      view.setUint16(off, allRowCounts[rc]); off += 2;
    }

    // Compressed data for all channels
    compressedChannels.forEach(function (chanRows) {
      chanRows.forEach(function (row) {
        bytes.set(row, off);
        off += row.length;
      });
    });

    return buf;
  }

  /* ── Full Project Export (.dika structure / .dikapack with media) ──── */

  function exportProject(format, opts) {
    opts = opts || {};
    // Page-sleep: a project FILE must carry the full json of slept pages (it leaves the
    // browser; markers would be dead references). Prefetch, then re-run.
    if (typeof CCPageSleep !== 'undefined' && CCPageSleep.hasSlept() && !CCPageSleep._exporting) {
      CCPageSleep._exporting = true;
      CCPageSleep.prefetchForSave(function () {
        try { exportProject(format, opts); } finally { CCPageSleep._exporting = false; CCPageSleep.releaseSaveMap(); }
      });
      return;
    }
    if (typeof saveCurrentPage === 'function') saveCurrentPage();
    /* `format` is the CALLER'S word for "with media or not" and is deliberately left as the legacy
       token: it is passed in from the export UI and from desktop.js, and renaming a parameter value
       is a second change with its own risk. The EXTENSION it maps to is what the user sees. */
    var _fmt = (window.CCEdition && CCEdition.formats) || { project: '.dika', package: '.dikapack' };
    var ext = (format === 'ccproj' || format === 'package') ? _fmt.package : _fmt.project;

    var pagesData = [];
    if (typeof pages !== 'undefined' && Array.isArray(pages)) {
      pagesData = pages.map(function (p, idx) {
        // Lossless, part-aware (keeps _scene / _slideDeck / _videoProject / _productType). The old mapper
        // dropped them, so re-importing a mixed project silently destroyed scenes / slide decks / videos.
        var pl = (typeof pageToPayload === 'function')
          ? pageToPayload(p)
          : { json: p.json, bg: p.bg, label: p.label, w: p.w, h: p.h, _isBoard: p._isBoard, _isWfBoard: p._isWfBoard, _pageId: p._pageId, groupId: p.groupId, _productType: p._productType, _scene: p._scene, _slideDeck: p._slideDeck, _videoProject: p._videoProject };
        pl.order = idx;
        return pl;
      });
    }

    var manifest = {
      schemaVersion: 4,
      appVersion: '2.0.0',
      app: 'dika studio',
      exportTimestamp: Date.now(),
      exportDate: new Date().toISOString(),
      pageCount: pagesData.length,
      groupCount: (typeof pageGroups !== 'undefined') ? pageGroups.length : 0,
      hasAssets: false,
      fonts: _collectUsedFonts()
    };

    var data = {
      manifest: manifest,
      project: {
        activeProduct: typeof activeProduct !== 'undefined' ? activeProduct : 'card',
        CW: typeof CW !== 'undefined' ? CW : 700,
        CH: typeof CH !== 'undefined' ? CH : 400,
        userInfo: Object.assign({}, typeof userInfo !== 'undefined' ? userInfo : {}),
        settings: {
          orientation: typeof wizSettings !== 'undefined' ? wizSettings.orientation : 'horizontal',
          corners: typeof wizSettings !== 'undefined' ? wizSettings.corners : 'sharp',
          sides: typeof wizSettings !== 'undefined' ? wizSettings.sides : 'single',
          canvasWidth: typeof CW !== 'undefined' ? CW : 700,
          canvasHeight: typeof CH !== 'undefined' ? CH : 400
        },
        template: typeof selectedTpl !== 'undefined' ? selectedTpl : null
      },
      groups: typeof pageGroups !== 'undefined' ? pageGroups.slice() : [],
      pages: pagesData,
      tags: (typeof window !== 'undefined' && window.ccTags) ? window.ccTags.slice() : [],
      tagGroups: (typeof window !== 'undefined' && window.ccTagGroups) ? window.ccTagGroups.slice() : [],
      tagAssignments: (typeof window !== 'undefined' && window.ccTagAssignments) ? window.ccTagAssignments : {}
    };

    if (typeof JSZip !== 'undefined') {
      // ZIP-based package
      var zip = new JSZip();

      var filename = _projectFilename() + ext;

      function _structureFiles() {
        var files = [
          { name: 'manifest.json', data: JSON.stringify(manifest, null, 2) },
          { name: 'project.json', data: JSON.stringify(data.project, null, 2) },
          { name: 'groups.json', data: JSON.stringify(data.groups, null, 2) },
          { name: 'tags.json', data: JSON.stringify({ tags: data.tags, tagGroups: data.tagGroups, tagAssignments: data.tagAssignments }, null, 2) }
        ];
        pagesData.forEach(function (p, i) {
          files.push({ name: 'pages/page-' + i + '.json', data: JSON.stringify(p, null, 2) });
        });
        return files;
      }

      function _ok(res, assetsReport) {
        _ccBeaconExport(ext.replace('.', '')); // P9: project-export event beacon
        showToast('Project exported!', 'success');
        return {
          success: true, streamed: !!(res && res.streamed), bytes: (res && res.bytes) || 0,
          assets: assetsReport || null
        };
      }

      // Structure-only export: unchanged behaviour, one click, straight download.
      if (!opts.withMedia || typeof CCProjectPackage === 'undefined') {
        _structureFiles().forEach(function (f) { zip.file(f.name, f.data); });
        return zip.generateAsync({ type: 'blob' }).then(function (blob) {
          downloadBlob(blob, filename);
          return _ok({ streamed: false, bytes: blob.size }, null);
        });
      }

      /* Media-inclusive package. Written by the streaming STORE writer rather than JSZip: measured
         2026-08-02, JSZip grew the JS heap by 470 MB for a 180 MB archive because it materializes
         each Blob entry, which puts a real project into the ~512 MB single-artifact wall. Details and
         numbers in project-package/zip-stream/zip-stream.js. */
      return CCProjectPackage.collectMedia(pagesData, opts.onCollectProgress).then(function (collected) {
        // opts.target is the file handle the CALLER picked during the click, before any await; the
        // picker cannot be opened from here because the user gesture is long gone by now.
        if (!CCProjectPackage.confirmLargeFallback(collected.totalBytes, !!opts.target)) return { success: false, cancelled: true };
        manifest.schemaVersion = 5;
        manifest.hasAssets = true;
        manifest.assetCount = collected.count;
        manifest.assetBytes = collected.totalBytes;
        manifest.assetMissing = collected.missing.length;

        var built = CCProjectPackage.buildAssetEntries(collected);
        var entries = _structureFiles().concat(built.entries);
        return CCProjectPackage.writePackage(entries, filename, {
          target: opts.target,
          onWriteProgress: opts.onWriteProgress,
          download: downloadBlob
        }).then(function (res) { return _ok(res, collected); });
      });
    }

    // Fallback: single JSON file
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(blob, _projectFilename() + ext);
    _ccBeaconExport(ext.replace('.', '')); // P9: project-export event beacon
    showToast('Project exported!', 'success');
    return Promise.resolve({ success: true });
  }

  /* THE FILE'S NAME, not its extension - and it was the half the rename missed. Every exported
     project was called `cardcraft-<who>-<when>`, so the one artifact a person hands to somebody else
     carried the retired name in plain sight even after the extension changed. Caught by
     tools/_rename-proof.mjs, which reads the name off the download rather than trusting the label. */
  function _projectFilename() {
    var name = 'dika';
    if (typeof userInfo !== 'undefined' && (userInfo.company || userInfo.name)) {
      name += '-' + safeName(userInfo.company || userInfo.name);
    }
    name += '-' + Date.now();
    return name;
  }

  function _collectUsedFonts() {
    var fonts = [];
    if (typeof pages === 'undefined') return fonts;
    var seen = {};
    pages.forEach(function (p) {
      // Page-sleep: read the parked json for a slept page (no-op when sleep is off).
      var _pj = (typeof _psJsonForSave === 'function') ? _psJsonForSave(p) : p.json;
      if (!_pj || !_pj.objects) return;
      _pj.objects.forEach(function (o) {
        if (o.fontFamily && !seen[o.fontFamily]) {
          seen[o.fontFamily] = true;
          fonts.push(o.fontFamily);
        }
      });
    });
    return fonts;
  }

  /* ── Import ──────────────────────────────────────── */

  /* A media package must never be read into memory to find out what it is. `openPackage` parses only
     the archive's central directory (a few KB from the end of the file), so a 3 GB package is opened
     as cheaply as a small one and its entries are handed out as slices of the file on disk. Anything
     that is not one of our packages falls through to the original FileReader + JSZip route, which is
     correct there because a structure-only file is small. */
  function importProject(file, opts) {
    opts = opts || {};
    var name = (file && file.name) || '';
    /* The pattern is BUILT from CCEdition.formats.readable, so a format added there is understood
       here without a second list to keep in step. The literal is the fallback for a page that
       somehow loaded without edition.js, and it names every extension this app has ever written. */
    var projectRe = (window.CCEdition && CCEdition.formats && CCEdition.formats.projectFileRe) ||
      /\.(dika|dikapack|cardcraft|ccproj)$/i;
    if (typeof CCProjectPackage !== 'undefined' && projectRe.test(name)) {
      return CCProjectPackage.openPackage(file).then(function (pkg) {
        if (pkg && pkg.has(CCProjectPackage.INDEX_FILE)) return _importFromPackage(pkg, opts);
        return _importLegacy(file, opts);
      });
    }
    return _importLegacy(file, opts);
  }

  /* Reads a v5 package: structure entries first, then the media, then the restore. Assets are applied
     BEFORE `_restoreProject` so the video subsystem's existing re-link path finds real media instead
     of a dead cross-session URL. */
  function _importFromPackage(pkg, opts) {
    function readOr(name, fallback) {
      return pkg.has(name) ? pkg.text(name) : Promise.resolve(fallback);
    }
    return Promise.all([readOr('project.json', '{}'), readOr('groups.json', '[]'), readOr('tags.json', 'null')])
      .then(function (res) {
        var project = JSON.parse(res[0] || '{}');
        var groups = JSON.parse(res[1] || '[]');
        var tagsData = JSON.parse(res[2] || 'null');

        // Numeric order, never a string sort: 'page-10' sorts BEFORE 'page-2' lexically, which would
        // silently shuffle any project with ten or more pages.
        var pageNames = pkg.names.filter(function (n) { return /^pages\/page-\d+\.json$/.test(n); })
          .sort(function (a, b) {
            return parseInt(a.match(/(\d+)\.json$/)[1], 10) - parseInt(b.match(/(\d+)\.json$/)[1], 10);
          });

        var pagesData = [];
        return pageNames.reduce(function (chain, n) {
          return chain.then(function () {
            return pkg.text(n).then(function (t) { pagesData.push(JSON.parse(t)); });
          });
        }, Promise.resolve()).then(function () {
          return CCProjectPackage.applyAssets(pkg, pagesData, opts.onAssetProgress);
        }).then(function (assetReport) {
          _restoreProject(project, groups, pagesData);
          if (tagsData && typeof applyRestoredTags === 'function') applyRestoredTags(tagsData);
          return { success: true, type: 'project-v5-package', pages: pagesData.length, assets: assetReport };
        });
      });
  }

  /* "Is this one of our zipped project files?" asked in ONE place. It was two hand-written
     `endsWith` pairs, and a pair like that is exactly what gets missed when a format is added. */
  function _isProjectPackageName(name) {
    var re = (window.CCEdition && CCEdition.formats && CCEdition.formats.projectFileRe) ||
      /\.(dika|dikapack|cardcraft|ccproj)$/i;
    return re.test(String(name || ''));
  }

  function _importLegacy(file, opts) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();

      reader.onload = function (ev) {
        try {
          // Try as ZIP first
          if (typeof JSZip !== 'undefined' && _isProjectPackageName(file.name)) {
            JSZip.loadAsync(ev.target.result).then(function (zip) {
              // ZIP-based package
              var manifestFile = zip.file('manifest.json');
              if (manifestFile) {
                return _importFromZip(zip, opts).then(resolve).catch(function () {
                  // Fallback: try as JSON
                  _importFromJSON(ev.target.result, resolve, reject);
                });
              }
              // Not our ZIP format — try as JSON
              _importFromJSON(ev.target.result, resolve, reject);
            }).catch(function () {
              // Not a ZIP — try as JSON
              _importFromJSON(ev.target.result, resolve, reject);
            });
            return;
          }

          _importFromJSON(ev.target.result, resolve, reject);
        } catch (e) {
          reject(e);
        }
      };

      reader.onerror = function () { reject(new Error('File read failed')); };

      if (_isProjectPackageName(file.name)) {
        reader.readAsArrayBuffer(file);
      } else {
        reader.readAsText(file);
      }
    });
  }

  function _importFromJSON(data, resolve, reject) {
    try {
      var text = typeof data === 'string' ? data : new TextDecoder().decode(data);
      var json = JSON.parse(text);

      // v3 project format
      if (json.manifest && json.manifest.schemaVersion >= 3) {
        _restoreProject(json.project, json.groups, json.pages);
        if (typeof applyRestoredTags === 'function') applyRestoredTags(json);
        resolve({ success: true, type: 'project', pages: (json.pages || []).length });
        return;
      }

      // v2 structure format (existing)
      if (json.version === 2 || json.pages) {
        if (typeof loadCardData === 'function') {
          loadCardData(json);
          resolve({ success: true, type: 'dika-v2', pages: (json.pages || []).length });
          return;
        }
      }

      // Legacy single-page
      if (typeof loadCardData === 'function') {
        loadCardData(json);
        resolve({ success: true, type: 'legacy' });
        return;
      }

      reject(new Error('Unsupported format'));
    } catch (e) {
      reject(e);
    }
  }

  function _importFromZip(zip, opts) {
    opts = opts || {};
    return Promise.all([
      zip.file('project.json') ? zip.file('project.json').async('text') : Promise.resolve('{}'),
      zip.file('groups.json') ? zip.file('groups.json').async('text') : Promise.resolve('[]'),
      zip.file('tags.json') ? zip.file('tags.json').async('text') : Promise.resolve('null')
    ]).then(function (results) {
      var project = JSON.parse(results[0]);
      var groups = JSON.parse(results[1]);
      var tagsData = JSON.parse(results[2]);

      // Load pages from pages/ folder
      var pageFiles = [];
      zip.folder('pages').forEach(function (path, file) {
        pageFiles.push({ path: path, file: file });
      });

      // Numeric, not lexical: `localeCompare` puts 'page-10.json' BEFORE 'page-2.json', so any project
      // with ten or more pages imported with its pages silently shuffled. Files that do not match the
      // pattern keep their original relative position rather than being dropped.
      pageFiles.sort(function (a, b) {
        var ai = (a.path.match(/(\d+)\.json$/) || [])[1];
        var bi = (b.path.match(/(\d+)\.json$/) || [])[1];
        if (ai === undefined || bi === undefined) return a.path.localeCompare(b.path);
        return parseInt(ai, 10) - parseInt(bi, 10);
      });

      return Promise.all(pageFiles.map(function (pf) {
        return pf.file.async('text').then(function (t) { return JSON.parse(t); });
      })).then(function (pagesData) {
        // Structure-only route. A media package never reaches here: importProject detects it from the
        // archive's central directory and takes the streaming path, precisely so the whole file is
        // never loaded into memory just to read a few json entries.
        _restoreProject(project, groups, pagesData);
        if (tagsData && typeof applyRestoredTags === 'function') applyRestoredTags(tagsData);
        return { success: true, type: 'project-v4-zip', pages: pagesData.length, assets: null };
      });
    });
  }

  function _restoreProject(project, groups, pagesData) {
    // Restore product type
    if (project.activeProduct && typeof setProductType === 'function') {
      setProductType(project.activeProduct);
    }

    // Restore canvas dimensions
    if (project.CW) { CW = project.CW; canvas.setWidth(CW); }
    if (project.CH) { CH = project.CH; canvas.setHeight(CH); }

    // Restore settings
    if (project.settings && typeof wizSettings !== 'undefined') {
      wizSettings.orientation = project.settings.orientation || 'horizontal';
      wizSettings.corners = project.settings.corners || 'sharp';
      wizSettings.sides = project.settings.sides || 'single';
      if (typeof setCardCorners === 'function') setCardCorners(wizSettings.corners);
    }

    // Restore userInfo
    if (project.userInfo && typeof userInfo !== 'undefined') {
      Object.assign(userInfo, project.userInfo);
      if (typeof syncUserInfoUI === 'function') syncUserInfoUI();
    }

    // Restore template
    if (project.template && typeof selectedTpl !== 'undefined') {
      selectedTpl = project.template;
    }

    // Restore pages
    if (typeof pages !== 'undefined' && Array.isArray(pagesData)) {
      pages.length = 0;
      pagesData.forEach(function (p) {
        // Restore the FULL part-aware payload (scene / slide deck / video / board), not a stripped page.
        pages.push((typeof normalizeRestoredPage === 'function')
          ? normalizeRestoredPage(p, { CW: CW, CH: CH })
          : { json: p.json, bg: p.bg || '#ffffff', label: p.label || 'Page', w: p.w || CW, h: p.h || CH, _isBoard: p._isBoard || false, _isWfBoard: p._isWfBoard || false, _pageId: p._pageId || null, groupId: p.groupId || null, _productType: p._productType || null, _scene: p._scene || null, _slideDeck: p._slideDeck || null, _videoProject: p._videoProject || null });
      });
    }

    // Restore groups
    if (typeof pageGroups !== 'undefined' && Array.isArray(groups)) {
      pageGroups.length = 0;
      groups.forEach(function (g) { pageGroups.push(g); });
      if (typeof _pgNextGroupId !== 'undefined') {
        _pgNextGroupId = pageGroups.reduce(function (mx, g) {
          var n = parseInt((g.id || '').replace('grp-', ''), 10);
          return isNaN(n) ? mx : Math.max(mx, n + 1);
        }, 1);
      }
    }

    // Ensure page IDs
    pages.forEach(function (p) {
      if (!p._pageId && typeof _pgEnsurePageId === 'function') _pgEnsurePageId(p);
    });

    if (typeof renderPageTabs === 'function') renderPageTabs();
    // -1 and forceReload, NOT 0 — this is the same idiom autosave.js:675 and import-export.js:210
    // already use, and this path was the one place that diverged. `switchPage` early-returns when
    // `index === currentPageIndex && !forceReload` (pages.js:541), so `switchPage(0)` right after
    // `currentPageIndex = 0` did NOTHING: the imported page 0 was never loaded onto the canvas (the
    // "blank/black canvas after import" report). Worse, the canvas kept the PREVIOUS document, so the
    // first later page change ran `saveCurrentPage()` and wrote that stale canvas over the freshly
    // imported page 1 — the "first page is always overwritten" report. Both symptoms, one cause.
    // -1 additionally makes that `saveCurrentPage()` a no-op, since `pages[-1]` is undefined
    // (guarded at pages.js:490), so nothing can be clobbered on the way in.
    currentPageIndex = -1;
    if (typeof switchPage === 'function') switchPage(0, true);
    if (typeof applyView === 'function') setTimeout(applyView, 100);
  }

  function importImage(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (ev) {
        fabric.Image.fromURL(ev.target.result, function (img) {
          if (!img) { reject(new Error('Failed to load image')); return; }
          var scale = Math.min((CW * 0.8) / img.width, (CH * 0.8) / img.height, 1);
          img.set({ scaleX: scale, scaleY: scale, left: CW / 2, top: CH / 2, originX: 'center', originY: 'center' });
          canvas.add(img);
          canvas.setActiveObject(img);
          canvas.renderAll();
          resolve({ success: true, type: 'image' });
        });
      };
      reader.onerror = function () { reject(new Error('File read failed')); };
      reader.readAsDataURL(file);
    });
  }

  function importSVG(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (ev) {
        var svgText = ev.target.result;
        if (typeof window._sanitizeSVG === 'function') {
          svgText = window._sanitizeSVG(svgText);
          if (!svgText) { reject(new Error('SVG sanitization failed — file may contain unsafe content')); return; }
        }
        fabric.loadSVGFromString(svgText, function (objects, options) {
          var group = fabric.util.groupSVGElements(objects, options);
          var scale = Math.min((CW * 0.8) / group.width, (CH * 0.8) / group.height, 1);
          group.set({ scaleX: scale, scaleY: scale, left: CW / 2, top: CH / 2, originX: 'center', originY: 'center' });
          canvas.add(group);
          canvas.setActiveObject(group);
          canvas.renderAll();
          resolve({ success: true, type: 'svg' });
        });
      };
      reader.onerror = function () { reject(new Error('File read failed')); };
      reader.readAsText(file);
    });
  }

  // export-import-manager-plan Phase 11 — PSD import via ag-psd readPsd: each visible leaf layer's canvas
  // becomes a fabric.Image placed at its PSD position. Nested group layers are flattened to leaves.
  function importPSD(file) {
    return _ensureAgPsd().then(function (agPsd) {
      if (!agPsd || typeof agPsd.readPsd !== 'function') throw new Error('PSD reader could not be loaded');
      return file.arrayBuffer().then(function (buf) {
        var psd = agPsd.readPsd(buf, { skipThumbnail: true, skipLinkedFilesData: true });
        if (typeof canvas === 'undefined' || !canvas) throw new Error('No canvas');
        var leaves = [];
        (function walk(nodes) {
          (nodes || []).forEach(function (n) {
            if (n.children && n.children.length) walk(n.children);
            else if (!n.hidden && (n.canvas || n.imageData)) leaves.push(n);
          });
        })(psd.children || []);
        if (!leaves.length) throw new Error('PSD layer not found');
        var pending = leaves.length, added = 0;
        return new Promise(function (resolve) {
          leaves.forEach(function (layer) {
            var lc = layer.canvas;
            if (!lc && layer.imageData) { lc = document.createElement('canvas'); lc.width = layer.imageData.width; lc.height = layer.imageData.height; lc.getContext('2d').putImageData(layer.imageData, 0, 0); }
            if (!lc) { if (--pending === 0) resolve({ success: true, type: 'psd', layers: added, filename: file.name }); return; }
            fabric.Image.fromURL(lc.toDataURL('image/png'), function (img) {
              if (img) { img.set({ left: layer.left || 0, top: layer.top || 0, name: layer.name || 'Layer' }); canvas.add(img); added++; }
              if (--pending === 0) { canvas.renderAll(); resolve({ success: true, type: 'psd', layers: added, filename: file.name }); }
            });
          });
        });
      });
    });
  }

  /* export-import-manager-plan Phase 11 — PDF import (pdf.js, Apache-2.0). Lazy-loads the UMD build +
     its worker, renders each page to a canvas, and adds it as a fabric.Image. Capped at 20 pages. */
  var _pdfjsLib = null, _pdfjsLoading = null;
  function _ensurePdfJs() {
    if (_pdfjsLib) return Promise.resolve(_pdfjsLib);
    if (typeof window !== 'undefined' && window.pdfjsLib) { _pdfjsLib = window.pdfjsLib; return Promise.resolve(_pdfjsLib); }
    if (_pdfjsLoading) return _pdfjsLoading;
    if (!(window.cc && cc.requireLib)) return Promise.resolve(null);
    /* VENDORED, like every other library this build loads on demand. pdf.js is TWO files, and the
       second one is easy to forget: the worker is a separate script, so vendoring only `pdf.min.js`
       would leave the parser fetching its own engine from a CDN and importing PDFs would still need
       the network. Both live in js/vendor now. */
    var B = 'js/vendor/';
    _pdfjsLoading = cc.requireLib(B + 'pdf.min.js').then(function () {
      var lib = (typeof window !== 'undefined') ? (window.pdfjsLib || null) : null;
      if (lib && lib.GlobalWorkerOptions) {
        /* The blob shim existed because the worker was CROSS-ORIGIN: a cross-origin worker script
           cannot be passed to new Worker() directly, it hangs. A same-origin file needs none of
           that, so the worker path is handed over as-is. */
        lib.GlobalWorkerOptions.workerSrc = B + 'pdf.worker.min.js';
      }
      _pdfjsLib = lib; return lib;
    }).catch(function () { return null; });
    return _pdfjsLoading;
  }
  function importPDF(file) {
    return _ensurePdfJs().then(function (pdfjsLib) {
      if (!pdfjsLib || !pdfjsLib.getDocument) throw new Error('Failed to load PDF reader');
      return file.arrayBuffer().then(function (buf) {
        return pdfjsLib.getDocument({ data: buf }).promise.then(function (pdf) {
          if (typeof canvas === 'undefined' || !canvas) throw new Error('No canvas');
          var n = Math.min(pdf.numPages || 1, 20), chain = Promise.resolve(), added = 0;
          for (var i = 1; i <= n; i++) {
            (function (pageNum) {
              chain = chain.then(function () {
                return pdf.getPage(pageNum).then(function (page) {
                  var vp = page.getViewport({ scale: 2 });
                  var c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
                  return page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise.then(function () {
                    return new Promise(function (res) {
                      fabric.Image.fromURL(c.toDataURL('image/png'), function (img) {
                        if (img) {
                          var sc = Math.min((CW * 0.8) / img.width, (CH * 0.8) / img.height, 1);
                          img.set({ scaleX: sc, scaleY: sc, left: CW / 2, top: CH / 2 + (pageNum - 1) * 24, originX: 'center', originY: 'center', name: 'PDF ' + pageNum });
                          canvas.add(img); added++;
                        }
                        res();
                      });
                    });
                  });
                });
              });
            })(i);
          }
          return chain.then(function () { canvas.renderAll(); return { success: true, type: 'pdf', pages: added, filename: file.name }; });
        });
      });
    });
  }

  return {
    renderPage: renderPage,
    renderPageSVG: renderPageSVG,
    pageHasRasterContent: pageHasRasterContent,
    downloadDataURL: downloadDataURL,
    downloadBlob: downloadBlob,
    dataURLtoBlob: dataURLtoBlob,
    safeName: safeName,
    FORMAT_EXT: FORMAT_EXT,
    PSD_MAX_DPI: PSD_MAX_DPI,
    _psdEffectiveDpi: _psdEffectiveDpi,
    exportPageAsImage: exportPageAsImage,
    exportPageAsSVG: exportPageAsSVG,
    exportPageAsPDF: exportPageAsPDF,
    exportPageAsPSD: exportPageAsPSD,
    exportMultiPagePDF: exportMultiPagePDF,
    exportPagesAsZIP: exportPagesAsZIP,
    exportDeckAsPPTX: exportDeckAsPPTX,
    exportProject: exportProject,
    projectFilename: _projectFilename,   // the UI needs the name to pre-pick a save target in-gesture
    importProject: importProject,
    importImage: importImage,
    importSVG: importSVG,
    importPSD: importPSD,
    importPDF: importPDF
  };
})();

// Expose for quick import (import-export.js)
window._exportManagerImport = ExportService.importProject;

if (window.cc && cc.modules) cc.modules.register({ id: 'service', parent: 'export.export-manager', title: 'export-manager: service', mount: function () {}, unmount: function () {} });
