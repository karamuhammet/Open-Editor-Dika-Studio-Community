/* Sub-module: right-panel/qr — QR props (Faz 6b-2). Owns its #p-* slice;
   parent delegates sync via cc.safe; bindings self-init on cc:canvas-ready, fault-isolated. */

function syncQrProps(obj) {
  if (!obj) return;
    var pQrUrl = document.getElementById('p-qr-url');
    var pQrColor = document.getElementById('p-qr-color');
    var pQrBg = document.getElementById('p-qr-bg');
    if (pQrUrl) pQrUrl.value = obj.qrUrl || '';
    if (pQrColor) pQrColor.value = obj.qrFg || '#000000';
    if (pQrBg) pQrBg.value = obj.qrBg || '#ffffff';
}

if (window.cc && cc.on) {
  cc.on('cc:canvas-ready', function () {
    cc.safe('right-panel.qr.init', function () {
    });
  });
}
if (window.cc && cc.modules) {
  cc.modules.register({ id: 'qr', parent: 'right-panel', title: 'QR props', mount: function () {}, unmount: function () {} });
}
