/* core/qr-encode.js — shared QR encoders (raster PNG data-URL + true-vector SVG).
   Moved VERBATIM from js/app.js (Faz 3, cautious core slimming). Self-contained: the only
   dependency is the global `qrcode` library (qrcode-generator, loaded in index.html BEFORE
   the core scripts); each function builds its own offscreen <canvas> and touches no app
   state or fabric canvas. Kept as flat top-level globals (NOT an IIFE) so all existing
   callers keep working unchanged: the canvas QR-object render (app.js), bulk-builder.js,
   and the QR Studio module (modules/left-panel/tools/qr) all call these as globals.
   Always-loaded <script> (not a loader module) → no load-order risk; callers fire lazily. */

function generateQRImage(url, fg, bg, size, ecc) {
  url = url || 'https://example.com';
  fg = fg || '#000000';
  bg = bg || '#ffffff';
  size = size || 140;
  var qr = qrcode(0, (ecc === 'L' || ecc === 'Q' || ecc === 'H') ? ecc : 'M');
  qr.addData(url);
  qr.make();
  var mc = qr.getModuleCount();
  var cs = Math.floor(size / mc);
  var total = cs * mc;
  var cvs = document.createElement('canvas');
  cvs.width = total;
  cvs.height = total;
  var ctx = cvs.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, total, total);
  for (var r = 0; r < mc; r++) {
    for (var c = 0; c < mc; c++) {
      if (qr.isDark(r, c)) {
        ctx.fillStyle = fg;
        ctx.fillRect(c * cs, r * cs, cs, cs);
      }
    }
  }
  return cvs.toDataURL();
}

// True vector QR (crisp at any print size). Horizontal run-length rects keep it compact.
function generateQRSvg(url, fg, bg, ecc, margin) {
  url = url || 'https://example.com';
  fg = fg || '#000000';
  bg = bg || '#ffffff';
  margin = (margin == null) ? 2 : margin;
  var qr = qrcode(0, (ecc === 'L' || ecc === 'Q' || ecc === 'H') ? ecc : 'M');
  qr.addData(url);
  qr.make();
  var mc = qr.getModuleCount();
  var dim = mc + margin * 2;
  var rects = '';
  for (var r = 0; r < mc; r++) {
    var runStart = -1;
    for (var c = 0; c <= mc; c++) {
      var dark = c < mc && qr.isDark(r, c);
      if (dark && runStart < 0) { runStart = c; }
      else if (!dark && runStart >= 0) {
        rects += '<rect x="' + (runStart + margin) + '" y="' + (r + margin) + '" width="' + (c - runStart) + '" height="1"/>';
        runStart = -1;
      }
    }
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + ' ' + dim + '" shape-rendering="crispEdges">' +
    '<rect width="' + dim + '" height="' + dim + '" fill="' + bg + '"/>' +
    '<g fill="' + fg + '">' + rects + '</g></svg>';
}

// Faz 6 — shared loader module (moved from core/). Pure function library, no init;
// runtime callers resolve it once loaded. Register for the module registry + error boundary.
if (window.cc && cc.modules) {
  cc.modules.register({ id: 'qr-encode', parent: 'shared', title: 'QR encoders', mount: function () {}, unmount: function () {} });
}
