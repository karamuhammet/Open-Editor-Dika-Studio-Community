/* cc-pptx-convert.js — full PPTX (Office) export, lazy-loaded on demand (owner 2026-07-12).
   Renders each slide's NON-text content to a pixel-accurate full-slide background image and
   overlays every top-level text object as a REAL editable PowerPoint text box, plus native
   slide transitions. Runs entirely in the browser (no server): uses the already-loaded fabric
   + JSZip globals. Element animations are NOT emitted in this phase (OOXML timing is fragile);
   our own project format keeps them losslessly. No em-dash (owner rule).
   API: window.CCPptxConvert.build(slides, { w, h, onProgress }) -> Promise<Blob>. */
(function () {
  'use strict';
  var EMU_W = 12192000, EMU_H = 6858000; // 16:9 slide in EMU
  var DEFAULT_BG = '#0d0d0d';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function color(fill) {
    if (!fill || fill === 'transparent' || fill === '') return null;
    if (typeof fill !== 'string') return null;
    fill = fill.trim();
    if (fill.charAt(0) === '#') { var h = fill.slice(1); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; return h.slice(0, 6).toUpperCase(); }
    var m = fill.match(/rgba?\(([^)]+)\)/);
    if (m) { var p = m[1].split(','); function hx(n) { n = Math.max(0, Math.min(255, Math.round(parseFloat(n)))); return ('0' + n.toString(16)).slice(-2); } return (hx(p[0]) + hx(p[1]) + hx(p[2])).toUpperCase(); }
    return 'FFFFFF';
  }

  function isText(o) { var t = o && o.type; return t === 'textbox' || t === 'text' || t === 'i-text'; }

  // ── package parts (static) ──
  function ctypes(n) {
    var s = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="png" ContentType="image/png"/>' +
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
      '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
      '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
      '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>';
    for (var i = 1; i <= n; i++) s += '<Override PartName="/ppt/slides/slide' + i + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>';
    return s + '</Types>';
  }
  function rootRels() { return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>'; }
  function presentation(n) {
    var lst = ''; for (var i = 1; i <= n; i++) lst += '<p:sldId id="' + (255 + i) + '" r:id="rIdS' + i + '"/>';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdM"/></p:sldMasterIdLst>' +
      '<p:sldIdLst>' + lst + '</p:sldIdLst>' +
      '<p:sldSz cx="' + EMU_W + '" cy="' + EMU_H + '" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>';
  }
  function presRels(n) {
    var s = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rIdM" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>' +
      '<Relationship Id="rIdT" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>';
    for (var i = 1; i <= n; i++) s += '<Relationship Id="rIdS' + i + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide' + i + '.xml"/>';
    return s + '</Relationships>';
  }
  function master() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      '<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="0D0D0D"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>' +
      '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>' +
      '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
      '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rIdL"/></p:sldLayoutIdLst></p:sldMaster>';
  }
  function masterRels() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rIdL" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
      '<Relationship Id="rIdT" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>';
  }
  function layout() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">' +
      '<p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>' +
      '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';
  }
  function layoutRels() { return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdM" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>'; }
  function theme() {
    var f = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
    var ln = '<a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="dika.studio"><a:themeElements>' +
      '<a:clrScheme name="dika.studio"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
      '<a:dk2><a:srgbClr val="0D0D0D"/></a:dk2><a:lt2><a:srgbClr val="F2F2F2"/></a:lt2>' +
      '<a:accent1><a:srgbClr val="F2FF58"/></a:accent1><a:accent2><a:srgbClr val="4F81BD"/></a:accent2><a:accent3><a:srgbClr val="9BBB59"/></a:accent3><a:accent4><a:srgbClr val="8064A2"/></a:accent4><a:accent5><a:srgbClr val="4BACC6"/></a:accent5><a:accent6><a:srgbClr val="F79646"/></a:accent6>' +
      '<a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink></a:clrScheme>' +
      '<a:fontScheme name="dika.studio"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
      '<a:fmtScheme name="dika.studio"><a:fillStyleLst>' + f + f + f + '</a:fillStyleLst><a:lnStyleLst>' + ln + ln + ln + '</a:lnStyleLst>' +
      '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
      '<a:bgFillStyleLst>' + f + f + f + '</a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>';
  }

  function transitionXml(tx) {
    if (!tx || !tx.preset || tx.preset === 'none') return '';
    var dir = { auto: 'l', left: 'l', right: 'r', up: 'u', down: 'd' }[tx.direction || 'auto'] || 'l';
    var el;
    switch (tx.preset) {
      case 'fade': el = '<p:fade/>'; break;
      case 'slide': case 'cover': el = '<p:cover dir="' + dir + '"/>'; break;
      case 'push': el = '<p:push dir="' + dir + '"/>'; break;
      case 'wipe': case 'slice': el = '<p:wipe dir="' + dir + '"/>'; break;
      case 'circle': el = '<p:circle/>'; break;
      case 'zoom': el = '<p:zoom/>'; break;
      default: el = '<p:fade/>'; break; // flip and anything unknown -> fade
    }
    return '<p:transition spd="med">' + el + '</p:transition>';
  }

  function textSp(id, t) {
    var lines = t.lines.length ? t.lines : [''];
    var body = lines.map(function (line) {
      var run = line ? '<a:r><a:rPr lang="en-US" sz="' + t.sz + '" b="' + (t.bold ? 1 : 0) + '" i="' + (t.italic ? 1 : 0) + '" dirty="0"><a:solidFill><a:srgbClr val="' + t.color + '"/></a:solidFill><a:latin typeface="' + esc(t.font) + '"/></a:rPr><a:t>' + esc(line) + '</a:t></a:r>' : '<a:endParaRPr lang="en-US" sz="' + t.sz + '"/>';
      return '<a:p><a:pPr algn="' + t.align + '"/>' + run + '</a:p>';
    }).join('');
    return '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="Text ' + id + '"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>' +
      '<p:spPr><a:xfrm' + (t.rot ? ' rot="' + t.rot + '"' : '') + '><a:off x="' + t.x + '" y="' + t.y + '"/><a:ext cx="' + t.w + '" cy="' + t.h + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>' +
      '<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0"></a:bodyPr><a:lstStyle/>' + body + '</p:txBody></p:sp>';
  }

  function slideXml(bgRid, texts, tx) {
    var shapes = '<p:pic><p:nvPicPr><p:cNvPr id="2" name="Background"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>' +
      '<p:blipFill><a:blip r:embed="' + bgRid + '"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>' +
      '<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + EMU_W + '" cy="' + EMU_H + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>';
    var id = 3;
    texts.forEach(function (t) { shapes += textSp(id++, t); });
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
      shapes + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>' + transitionXml(tx) + '</p:sld>';
  }
  function slideRels(imgIdx) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rIdImg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image' + imgIdx + '.png"/>' +
      '<Relationship Id="rIdL" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>';
  }

  // ── render one slide: background PNG (text hidden) + text-object descriptors ──
  function renderSlide(slide, W, H) {
    return new Promise(function (resolve) {
      var el = document.createElement('canvas');
      var sc = new fabric.StaticCanvas(el, { width: W, height: H, backgroundColor: slide.bg || DEFAULT_BG, enableRetinaScaling: false });
      function finish() {
        var sx = EMU_W / W, sy = EMU_H / H;
        var ptFactor = 960 / W; // slide is 960pt wide
        var texts = [];
        sc.getObjects().forEach(function (o) {
          if (!isText(o) || o.visible === false) return;
          var w = (o.width || 100) * (o.scaleX || 1);
          var h = (o.height || 30) * (o.scaleY || 1);
          var left = o.left || 0, top = o.top || 0;
          if (o.originX === 'center') left -= w / 2; else if (o.originX === 'right') left -= w;
          if (o.originY === 'center') top -= h / 2; else if (o.originY === 'bottom') top -= h;
          var effFont = (o.fontSize || 20) * (o.scaleY || 1);
          texts.push({
            x: Math.round(left * sx), y: Math.round(top * sy), w: Math.round(w * sx), h: Math.round(h * sy),
            rot: Math.round((o.angle || 0) * 60000),
            sz: Math.max(100, Math.round(effFont * ptFactor * 100)),
            color: color(o.fill) || 'FFFFFF',
            bold: /bold|[6789]00/.test(String(o.fontWeight || '')),
            italic: o.fontStyle === 'italic',
            align: { left: 'l', center: 'ctr', right: 'r', justify: 'just' }[o.textAlign || 'left'] || 'l',
            font: String(o.fontFamily || 'Arial').replace(/["']/g, ''),
            lines: String(o.text == null ? '' : o.text).split('\n')
          });
          o.visible = false; // hide text from the background raster
        });
        sc.renderAll();
        var url = null;
        try { url = sc.toDataURL({ format: 'png', multiplier: Math.min(2, 1600 / W) }); } catch (e) {}
        try { sc.dispose(); } catch (e) {}
        resolve({ bg: url, texts: texts });
      }
      if (slide.json) sc.loadFromJSON(slide.json, finish); else finish();
    });
  }

  function build(slides, opts) {
    opts = opts || {};
    var W = opts.w || 1600, H = opts.h || 900;
    var onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : function () {};
    if (typeof JSZip === 'undefined' || typeof fabric === 'undefined') return Promise.reject(new Error('JSZip/fabric not available'));
    var n = slides.length;
    var zip = new JSZip();
    zip.file('[Content_Types].xml', ctypes(n));
    zip.folder('_rels').file('.rels', rootRels());
    var ppt = zip.folder('ppt');
    ppt.file('presentation.xml', presentation(n));
    ppt.folder('_rels').file('presentation.xml.rels', presRels(n));
    ppt.folder('theme').file('theme1.xml', theme());
    ppt.folder('slideMasters').file('slideMaster1.xml', master());
    ppt.folder('slideMasters').folder('_rels').file('slideMaster1.xml.rels', masterRels());
    ppt.folder('slideLayouts').file('slideLayout1.xml', layout());
    ppt.folder('slideLayouts').folder('_rels').file('slideLayout1.xml.rels', layoutRels());
    var slidesF = ppt.folder('slides'), relsF = slidesF.folder('_rels'), mediaF = ppt.folder('media');

    var i = 0;
    function step() {
      if (i >= n) {
        onProgress(n, n, 'Packaging');
        return zip.generateAsync({ type: 'blob' });
      }
      var idx = i + 1, s = slides[i]; i++;
      onProgress(i, n, 'Rendering slide ' + idx);
      return renderSlide(s, W, H).then(function (res) {
        slidesF.file('slide' + idx + '.xml', slideXml('rIdImg', res.texts, { preset: s.transition, direction: s.transitionDirection }));
        relsF.file('slide' + idx + '.xml.rels', slideRels(idx));
        if (res.bg && res.bg.indexOf(',') >= 0) mediaF.file('image' + idx + '.png', res.bg.split(',')[1], { base64: true });
        return step();
      });
    }
    return Promise.resolve().then(step);
  }

  window.CCPptxConvert = { build: build, EMU_W: EMU_W, EMU_H: EMU_H };
})();
