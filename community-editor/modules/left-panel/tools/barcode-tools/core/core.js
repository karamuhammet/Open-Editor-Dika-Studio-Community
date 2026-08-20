/* Module: left-panel/tools/barcode-tools/core — Barcode engine — type catalog, validation, bwip options, render to canvas/svg/dataurl/fabric.
   Part of the barcode-tools group (decomposed from the 1365-line IIFE). Functions hang off the
   shared namespace VBC (window.__ccBarcodeTools, created by the parent); cross-module refs resolve
   through VBC at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VBC = window.__ccBarcodeTools;
  if (!VBC) return;

  VBC.isBarcodeObject = function (obj) {
    return !!(obj && (obj._ccType === 'barcode' || obj._barcodeType || obj._barcodeValue));
  };

  VBC._barcodeTypes = function () {
    return [
      // 1D · Linear
      { id: 'code128', label: 'Code 128', group: '1D · Linear', placeholder: 'SKU-2026-001', help: 'Letters, numbers and symbols.' },
      { id: 'code39', label: 'Code 39', group: '1D · Linear', placeholder: 'PART-A12', help: 'Uppercase, digits, a few symbols.' },
      { id: 'code93', label: 'Code 93', group: '1D · Linear', placeholder: 'PART-A12', help: 'Compact alphanumeric.' },
      { id: 'ean13', label: 'EAN-13', group: '1D · Linear', placeholder: '123456789012', help: 'Retail · 12 or 13 digits.' },
      { id: 'ean8', label: 'EAN-8', group: '1D · Linear', placeholder: '1234567', help: 'Small retail · 7 or 8 digits.' },
      { id: 'upca', label: 'UPC-A', group: '1D · Linear', placeholder: '12345678901', help: 'US retail · 11 or 12 digits.' },
      { id: 'upce', label: 'UPC-E', group: '1D · Linear', placeholder: '1234565', help: 'Compact UPC · 6–8 digits.' },
      { id: 'interleaved2of5', label: 'ITF (2 of 5)', group: '1D · Linear', placeholder: '1234567890', help: 'Even count of digits.' },
      { id: 'itf14', label: 'ITF-14', group: '1D · Linear', placeholder: '1234567890123', help: 'Shipping carton · 13–14 digits.' },
      { id: 'rationalizedCodabar', label: 'Codabar', group: '1D · Linear', placeholder: 'A12345B', help: 'Libraries, blood banks.' },
      { id: 'msi', label: 'MSI Plessey', group: '1D · Linear', placeholder: '1234567', help: 'Inventory · digits only.' },
      { id: 'code11', label: 'Code 11', group: '1D · Linear', placeholder: '123-4567', help: 'Telecom · digits and dash.' },
      { id: 'pharmacode', label: 'Pharmacode', group: '1D · Linear', placeholder: '117480', help: 'Pharma · number 3–131070.' },
      // 2D · Matrix  (QR Code lives in its own dedicated "QR Code" tool, not here)
      { id: 'datamatrix', label: 'Data Matrix', group: '2D · Matrix', dim2: true, placeholder: 'BOX-24-A', help: 'Compact 2D for small labels.' },
      { id: 'pdf417', label: 'PDF417', group: '2D · Matrix', dim2: true, placeholder: 'ORDER-2026-0001', help: 'Dense stacked code.' },
      { id: 'micropdf417', label: 'Micro PDF417', group: '2D · Matrix', dim2: true, placeholder: 'ABC123', help: 'Smaller PDF417.' },
      { id: 'azteccode', label: 'Aztec', group: '2D · Matrix', dim2: true, placeholder: 'TICKET-9921', help: 'Transit tickets, no quiet zone.' },
      { id: 'maxicode', label: 'MaxiCode', group: '2D · Matrix', dim2: true, placeholder: '999999999840012', help: 'UPS shipping.' },
      // GS1
      { id: 'gs1-128', label: 'GS1-128', group: 'GS1', placeholder: '(01)09501101020917', help: 'GS1 application identifiers.' },
      { id: 'gs1datamatrix', label: 'GS1 Data Matrix', group: 'GS1', dim2: true, placeholder: '(01)09501101020917', help: 'GS1 AIs in 2D.' },
      { id: 'databaromni', label: 'GS1 DataBar', group: 'GS1', placeholder: '(01)09501101020917', help: 'Small GS1 items.' },
      { id: 'databarexpanded', label: 'DataBar Expanded', group: 'GS1', placeholder: '(01)09501101020917', help: 'GS1 with extra data.' },
      // Postal
      { id: 'royalmail', label: 'Royal Mail', group: 'Postal', placeholder: 'LE28HS9Z', help: 'UK postal.' },
      { id: 'auspost', label: 'Australia Post', group: 'Postal', placeholder: '5956439111ABA', help: 'AU postal.' },
      { id: 'japanpost', label: 'Japan Post', group: 'Postal', placeholder: '6540123789-A-K-Z', help: 'JP postal.' },
      { id: 'kix', label: 'KIX (NL)', group: 'Postal', placeholder: '1231FZ13XHS', help: 'Netherlands postal.' },
      { id: 'onecode', label: 'USPS IMb', group: 'Postal', placeholder: '0123456709498765432101234', help: 'US Intelligent Mail.' },
      { id: 'postnet', label: 'POSTNET', group: 'Postal', placeholder: '12345', help: 'US ZIP.' }
    ];
  };

  VBC._barcodeMeta = function (type) {
    var list = VBC._barcodeTypes();
    for (var i = 0; i < list.length; i++) if (list[i].id === type) return list[i];
    return list[0];
  };

  VBC._normalizeBcid = function (type) {
    var t = String(type == null ? 'code128' : type).trim();
    var known = VBC._barcodeTypes();
    for (var i = 0; i < known.length; i++) if (known[i].id === t) return t;
    var lc = t.toLowerCase();   // legacy aliases
    if (lc === 'ean-13') return 'ean13';
    if (lc === 'upc-a') return 'upca';
    if (lc === 'data-matrix') return 'datamatrix';
    if (lc === 'pdf-417') return 'pdf417';
    if (lc === 'codabar') return 'rationalizedCodabar';
    return 'code128';
  };

  VBC._validateBarcode = function (type, value) {
    var t = VBC._normalizeBcid(type);
    var raw = String(value || '').trim();
    if (!raw) return { ok: false, message: 'Value is required.' };
    if (t === 'ean13' && !/^\d{12,13}$/.test(raw)) return { ok: false, message: 'EAN-13 requires 12 or 13 digits.' };
    if (t === 'ean8' && !/^\d{7,8}$/.test(raw)) return { ok: false, message: 'EAN-8 requires 7 or 8 digits.' };
    if (t === 'upca' && !/^\d{11,12}$/.test(raw)) return { ok: false, message: 'UPC-A requires 11 or 12 digits.' };
    if (t === 'upce' && !/^\d{6,8}$/.test(raw)) return { ok: false, message: 'UPC-E requires 6 to 8 digits.' };
    return { ok: true, value: raw };
  };

  VBC._needsCheckDigit = function (type, value) {
    var t = VBC._normalizeBcid(type), v = String(value || '');
    if (t === 'ean13') return v.length === 12;
    if (t === 'upca') return v.length === 11;
    if (t === 'ean8') return v.length === 7;
    return false;
  };

  VBC._cleanHex = function (color) {
    return String(color || '#000000').replace('#', '');
  };

  VBC._isTwoDimensionalBcid = function (bcid) {
    var known = VBC._barcodeTypes();
    for (var i = 0; i < known.length; i++) if (known[i].id === bcid) return !!known[i].dim2;
    return false;
  };

  VBC._isSquareMatrixBcid = function (bcid) {
    return /^(datamatrix|gs1datamatrix|azteccode|maxicode)$/.test(String(bcid || ''));
  };

  VBC._buildBwipOptions = function (opts, scaleOverride) {
    var single = opts || {};
    var bcid = VBC._normalizeBcid(single.type);
    var scale = scaleOverride ? Math.max(1, scaleOverride) : Math.max(1, parseInt(single.scale, 10) || 2);
    var rawHeight = Math.max(4, parseInt(single.height, 10) || 28);
    var isTwoDimensional = VBC._isTwoDimensionalBcid(bcid);
    // NOTE: bwip's `width` option is the symbol width in millimetres — passing it
    // squeezes 1D bars horizontally (poor quality / scannability), so we never set
    // it and let bwip derive the natural data-driven width. `scale` controls density.
    var o = {
      bcid: bcid,
      text: String(single.value || ''),
      scale: scale,
      // The panel stores a friendly visual height; bwip expects compact module
      // units for 1D symbologies, so we normalize to avoid square-looking output.
      height: isTwoDimensional ? rawHeight : Math.max(2, Math.round(rawHeight / 4)),
      includetext: single.humanReadable !== false && !VBC._isSquareMatrixBcid(bcid),
      textxalign: 'center',
      paddingwidth: Math.max(0, parseInt(single.padding, 10) || 8),
      paddingheight: Math.max(0, parseInt(single.padding, 10) || 8),
      backgroundcolor: single.transparentBackground ? undefined : VBC._cleanHex(single.backgroundColor || '#ffffff'),
      barcolor: VBC._cleanHex(single.lineColor || '#111111')
    };
    // Square matrix codes (DataMatrix, Aztec, MaxiCode) size from data + scale;
    // a forced height distorts them, so let bwip keep the native 1:1 module grid.
    if (VBC._isSquareMatrixBcid(bcid)) { delete o.height; }
    return o;
  };

  VBC._normalizeSvg = function (svg) {
    var raw = String(svg || '');
    if (!raw) return raw;
    var openTag = raw.match(/<svg\b([^>]*)>/i);
    if (!openTag) return raw;
    var attrs = openTag[1] || '';
    var widthMatch = attrs.match(/\bwidth="([\d.]+)(?:px)?"/i);
    var heightMatch = attrs.match(/\bheight="([\d.]+)(?:px)?"/i);
    var viewBoxMatch = attrs.match(/\bviewBox="([^"]+)"/i);
    var width = widthMatch ? parseFloat(widthMatch[1]) : 0;
    var height = heightMatch ? parseFloat(heightMatch[1]) : 0;
    if ((!width || !height) && viewBoxMatch) {
      var vb = String(viewBoxMatch[1]).trim().split(/\s+/);
      if (vb.length === 4) {
        if (!width) width = parseFloat(vb[2]) || 0;
        if (!height) height = parseFloat(vb[3]) || 0;
      }
    }
    if (!width) width = 320;
    if (!height) height = 160;
    var newTag = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="xMidYMid meet">';
    return raw.replace(/<svg\b[^>]*>/i, newTag);
  };

  VBC._renderBarcodeCanvas = function (opts, scaleOverride) {
    if (typeof document === 'undefined' || typeof bwipjs === 'undefined' || !bwipjs || typeof bwipjs.toCanvas !== 'function') {
      throw new Error('Barcode canvas renderer is not available.');
    }
    var renderCanvas = document.createElement('canvas');
    bwipjs.toCanvas(renderCanvas, VBC._buildBwipOptions(opts, scaleOverride));
    return renderCanvas;
  };

  VBC._renderBarcodeHiRes = function (opts, targetPx) {
    var probe = VBC._renderBarcodeCanvas(opts);
    var userScale = Math.max(1, parseInt((opts || {}).scale, 10) || 2);
    var modules = Math.max(1, probe.width / userScale);
    var outScale = Math.min(40, Math.max(userScale, Math.ceil((targetPx || 1600) / modules)));
    return VBC._renderBarcodeCanvas(opts, outScale);
  };

  VBC._renderBarcodeDataUrl = function (opts) {
    return VBC._renderBarcodeCanvas(opts).toDataURL('image/png');
  };

  VBC._buildBarcodeFabricObject = function (opts, done) {
    try {
      var renderCanvas = VBC._renderBarcodeHiRes(opts, 1600);
      fabric.Image.fromURL(renderCanvas.toDataURL('image/png'), function (barcodeObj) {
        if (!barcodeObj) return done(new Error('Could not create barcode object.'));
        barcodeObj.set({
          objectCaching: false,
          _ccType: 'barcode',
          _barcodeType: VBC._normalizeBcid(opts.type),
          _barcodeValue: String(opts.value || ''),
          _barcodeHumanReadable: opts.humanReadable !== false,
          _barcodeSource: opts._source || 'single',
          _barcodeRowIndex: opts._rowIndex != null ? opts._rowIndex : null,
          _barcodeLineColor: opts.lineColor || '#111111',
          _barcodeBackgroundColor: opts.backgroundColor || '#ffffff'
        });
        if (opts.createFieldAware) barcodeObj._dfField = 'barcode_value';
        done(null, barcodeObj);
      }, { crossOrigin: 'anonymous' });
    } catch (e) {
      return done(e);
    }
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'core', parent: 'left-panel.tools.barcode-tools', title: 'barcode-tools: core', mount: function () {}, unmount: function () {} });
  }
})();
