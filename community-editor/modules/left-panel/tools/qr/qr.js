/* Sub-module: left-panel/tools/qr — QR Studio wizard (structured QR: URL / Wi-Fi / vCard / …).
   Extracted VERBATIM from app.js section 10b. Rendered lazily by the gallery module's
   openToolGenerator('qrcode') via window.renderQrToolPanel — no load-time work here.
   Uses the SHARED encoders generateQRImage / generateQRSvg (kept global in app.js because
   canvas QR-object render + bulk-builder.js also call them) plus global getIcon / fabric /
   canvas / snap / showToast / getCanvasCenter / jsPDF. Only renderQrToolPanel is exposed;
   every _qr* helper stays private to this closure. */
(function () {
  'use strict';
  // ── 10b. QR Studio — structured content wizard (URL / Wi-Fi / vCard / …) ──
  var _QR_KINDS = [
    { id: 'url', label: 'Website / URL' },
    { id: 'text', label: 'Plain text' },
    { id: 'wifi', label: 'Wi-Fi network' },
    { id: 'vcard', label: 'Contact (vCard)' },
    { id: 'email', label: 'Email' },
    { id: 'sms', label: 'SMS' },
    { id: 'tel', label: 'Phone' },
    { id: 'geo', label: 'Location (geo)' }
  ];
  var _qrState = { kind: 'url', fg: '#000000', bg: '#ffffff', ecc: 'M' };
  var _qrExportCloser = null, _qrExportKey = null;

  function _qrEsc(v) { return String(v == null ? '' : v); }
  function _qrAttr(v) { return _qrEsc(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  function _qrEnsureUrl(u) { u = _qrEsc(u).trim(); if (!u) return ''; return /^[a-z][\w+.-]*:/i.test(u) ? u : ('https://' + u); }
  function _qrWifiEsc(v) { return _qrEsc(v).replace(/([\\;,:"])/g, '\\$1'); }
  function _qrBuildPayload(qr) {
    qr = qr || {};
    var k = qr.kind || 'url';
    if (k === 'url') return _qrEnsureUrl(qr.url);
    if (k === 'wifi') {
      if (!qr.wifiSsid) return '';
      var enc = qr.wifiEnc || 'WPA';
      return 'WIFI:T:' + (enc === 'none' ? 'nopass' : enc) + ';S:' + _qrWifiEsc(qr.wifiSsid) + ';' +
        (enc === 'none' ? '' : 'P:' + _qrWifiEsc(qr.wifiPass) + ';') + (qr.wifiHidden ? 'H:true;' : '') + ';';
    }
    if (k === 'email') {
      if (!qr.emailTo) return '';
      var qp = [];
      if (qr.emailSub) qp.push('subject=' + encodeURIComponent(qr.emailSub));
      if (qr.emailBody) qp.push('body=' + encodeURIComponent(qr.emailBody));
      return 'mailto:' + _qrEsc(qr.emailTo) + (qp.length ? '?' + qp.join('&') : '');
    }
    if (k === 'sms') return qr.smsNo ? ('SMSTO:' + _qrEsc(qr.smsNo) + (qr.smsMsg ? ':' + _qrEsc(qr.smsMsg) : '')) : '';
    if (k === 'tel') return qr.telNo ? ('tel:' + _qrEsc(qr.telNo)) : '';
    if (k === 'geo') return (qr.geoLat || qr.geoLng) ? ('geo:' + _qrEsc(qr.geoLat || '0') + ',' + _qrEsc(qr.geoLng || '0')) : '';
    if (k === 'vcard') {
      if (!(qr.vcName || qr.vcOrg || qr.vcPhone || qr.vcEmail || qr.vcUrl)) return '';
      var L = ['BEGIN:VCARD', 'VERSION:3.0'];
      if (qr.vcName) { L.push('FN:' + _qrEsc(qr.vcName)); L.push('N:' + _qrEsc(qr.vcName) + ';;;;'); }
      if (qr.vcOrg) L.push('ORG:' + _qrEsc(qr.vcOrg));
      if (qr.vcPhone) L.push('TEL;TYPE=CELL:' + _qrEsc(qr.vcPhone));
      if (qr.vcEmail) L.push('EMAIL:' + _qrEsc(qr.vcEmail));
      if (qr.vcUrl) L.push('URL:' + _qrEnsureUrl(qr.vcUrl));
      L.push('END:VCARD');
      return L.join('\n');
    }
    return _qrEsc(qr.text);
  }
  function _qrf(key, label, val, ph, type) {
    return '<label class="bc-fld"><span class="bc-flbl">' + label + '</span><input class="bc-input" data-qr="' + key + '" id="qr-f-' + key + '" type="' + (type || 'text') + '" value="' + _qrAttr(val || '') + '" placeholder="' + _qrAttr(ph || '') + '"></label>';
  }
  function _qrFieldsMarkup(qr) {
    qr = qr || {};
    var k = qr.kind || 'url';
    if (k === 'url') return _qrf('url', 'URL', qr.url, 'example.com');
    if (k === 'text') return _qrf('text', 'Text', qr.text, 'Anything you like');
    if (k === 'wifi') {
      var enc = qr.wifiEnc || 'WPA';
      return '<div class="bc-grid2">' + _qrf('wifiSsid', 'Network (SSID)', qr.wifiSsid, 'MyWiFi') +
        '<label class="bc-fld"><span class="bc-flbl">Security</span><select class="bc-input" data-qr="wifiEnc" id="qr-f-wifiEnc">' +
          '<option value="WPA"' + (enc === 'WPA' ? ' selected' : '') + '>WPA/WPA2</option>' +
          '<option value="WEP"' + (enc === 'WEP' ? ' selected' : '') + '>WEP</option>' +
          '<option value="none"' + (enc === 'none' ? ' selected' : '') + '>None</option>' +
        '</select></label></div>' +
        (enc === 'none' ? '' : _qrf('wifiPass', 'Password', qr.wifiPass, '••••••••')) +
        '<label class="bc-check"><input type="checkbox" data-qr="wifiHidden" id="qr-f-wifiHidden"' + (qr.wifiHidden ? ' checked' : '') + '><span>Hidden network</span></label>';
    }
    if (k === 'email') return _qrf('emailTo', 'To', qr.emailTo, 'name@example.com', 'email') + _qrf('emailSub', 'Subject', qr.emailSub, '') + _qrf('emailBody', 'Body', qr.emailBody, '');
    if (k === 'sms') return _qrf('smsNo', 'Number', qr.smsNo, '+1 555 0100', 'tel') + _qrf('smsMsg', 'Message', qr.smsMsg, '');
    if (k === 'tel') return _qrf('telNo', 'Number', qr.telNo, '+1 555 0100', 'tel');
    if (k === 'geo') return '<div class="bc-grid2">' + _qrf('geoLat', 'Latitude', qr.geoLat, '41.0082') + _qrf('geoLng', 'Longitude', qr.geoLng, '28.9784') + '</div>';
    if (k === 'vcard') return _qrf('vcName', 'Full name', qr.vcName, 'Jane Doe') + '<div class="bc-grid2">' + _qrf('vcOrg', 'Company', qr.vcOrg, '') + _qrf('vcPhone', 'Phone', qr.vcPhone, '', 'tel') + '</div>' + _qrf('vcEmail', 'Email', qr.vcEmail, '', 'email') + _qrf('vcUrl', 'Website', qr.vcUrl, '');
    return '';
  }
  function _qrIcon(name, size) { return (typeof getIcon === 'function') ? getIcon(name, size) : ''; }
  function _qrReadDom() {
    var ks = document.getElementById('qr-kind'); if (ks) _qrState.kind = ks.value;
    var box = document.getElementById('qr-fields');
    if (box) Array.prototype.forEach.call(box.querySelectorAll('[data-qr]'), function (el) {
      var key = el.getAttribute('data-qr');
      _qrState[key] = (el.type === 'checkbox') ? !!el.checked : el.value;
    });
    var fg = document.getElementById('qr-fg'); if (fg) _qrState.fg = fg.value;
    var bg = document.getElementById('qr-bg'); if (bg) _qrState.bg = bg.value;
    var ec = document.getElementById('qr-ecc'); if (ec) _qrState.ecc = ec.value;
  }
  function _qrRefresh() {
    _qrReadDom();
    var payload = _qrBuildPayload(_qrState);
    var enc = document.getElementById('qr-encoded'); if (enc) enc.value = payload;
    var swfg = document.getElementById('qr-sw-fg'); if (swfg) swfg.style.background = _qrState.fg;
    var swbg = document.getElementById('qr-sw-bg'); if (swbg) swbg.style.background = _qrState.bg;
    var img = document.getElementById('qr-preview-img');
    var empty = document.getElementById('qr-preview-empty');
    if (img) {
      if (payload) {
        try { img.src = generateQRImage(payload, _qrState.fg, _qrState.bg, 320, _qrState.ecc); img.style.display = ''; if (empty) empty.style.display = 'none'; }
        catch (e) { img.style.display = 'none'; if (empty) { empty.style.display = ''; empty.textContent = 'Content too long for one QR'; } }
      } else { img.style.display = 'none'; if (empty) { empty.style.display = ''; empty.textContent = 'Fill the fields to preview'; } }
    }
  }
  function _qrBindFields() {
    var box = document.getElementById('qr-fields');
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('[data-qr]'), function (el) {
      el.addEventListener('input', _qrRefresh);
      el.addEventListener('change', _qrRefresh);
    });
  }
  function _qrAddToCanvas() {
    _qrReadDom();
    var payload = _qrBuildPayload(_qrState);
    if (!payload) {
      var first = document.querySelector('#qr-fields [data-qr]');
      if (first && first.focus) first.focus();
      if (typeof showToast === 'function') showToast('Fill the QR content first', 'error');
      return;
    }
    // High-resolution source so the QR stays sharp when the design is exported / printed.
    var dataUrl = generateQRImage(payload, _qrState.fg, _qrState.bg, 1280, _qrState.ecc);
    fabric.Image.fromURL(dataUrl, function (img) {
      img.set({ isQR: true, qrUrl: payload, qrFg: _qrState.fg, qrBg: _qrState.bg });
      img.scaleToWidth(140);
      var c = (typeof getCanvasCenter === 'function') ? getCanvasCenter() : { x: 200, y: 200 };
      img.set({ left: c.x - 70, top: c.y - 70 });
      canvas.add(img);
      canvas.setActiveObject(img);
      canvas.renderAll();
      if (typeof snap === 'function') snap();
      if (typeof showToast === 'function') showToast('QR code added to canvas');
    });
  }
  function _qrDownloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }
  // Export the current QR as a print-ready PNG (high-res), SVG (vector) or PDF.
  function _qrExport(format) {
    _qrReadDom();
    var payload = _qrBuildPayload(_qrState);
    if (!payload) { if (typeof showToast === 'function') showToast('Fill the QR content first', 'error'); return; }
    var base = 'qr-' + (_qrState.kind || 'code');
    try {
      if (format === 'svg') {
        _qrDownloadBlob(new Blob([generateQRSvg(payload, _qrState.fg, _qrState.bg, _qrState.ecc)], { type: 'image/svg+xml' }), base + '.svg');
      } else if (format === 'pdf') {
        var PDF = (typeof jspdf !== 'undefined' && jspdf.jsPDF) ? jspdf.jsPDF : (typeof jsPDF !== 'undefined' ? jsPDF : null);
        if (!PDF) throw new Error('PDF library is not available.');
        var mm = 40, pad = 6;
        var doc = new PDF({ orientation: 'p', unit: 'mm', format: [mm + pad * 2, mm + pad * 2] });
        doc.addImage(generateQRImage(payload, _qrState.fg, _qrState.bg, 2048, _qrState.ecc), 'PNG', pad, pad, mm, mm);
        doc.save(base + '.pdf');
      } else {
        var a = document.createElement('a');
        a.href = generateQRImage(payload, _qrState.fg, _qrState.bg, 2048, _qrState.ecc);
        a.download = base + '.png'; a.click();
      }
      if (typeof showToast === 'function') showToast(String(format).toUpperCase() + ' exported');
    } catch (e) {
      if (typeof showToast === 'function') showToast(e && e.message ? e.message : 'Export failed', 'error');
    }
  }
  function _qrBindPanel() {
    var kindSel = document.getElementById('qr-kind');
    if (kindSel) kindSel.addEventListener('change', function () {
      _qrReadDom();
      _qrState.kind = this.value;
      var box = document.getElementById('qr-fields');
      if (box) box.innerHTML = _qrFieldsMarkup(_qrState);
      _qrBindFields();
      _qrRefresh();
    });
    _qrBindFields();
    ['qr-fg', 'qr-bg', 'qr-ecc'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) { el.addEventListener('input', _qrRefresh); el.addEventListener('change', _qrRefresh); }
    });
    var addBtn = document.getElementById('qr-add');
    if (addBtn) addBtn.addEventListener('click', _qrAddToCanvas);

    // Export dropdown (PNG / SVG / PDF) — print-ready output
    var et = document.getElementById('qr-export-btn');
    var em = document.getElementById('qr-export-menu');
    if (_qrExportCloser) { document.removeEventListener('click', _qrExportCloser); document.removeEventListener('keydown', _qrExportKey); _qrExportCloser = _qrExportKey = null; }
    if (et && em) {
      var qrCloseMenu = function () { em.setAttribute('hidden', ''); et.classList.remove('bc-open'); et.setAttribute('aria-expanded', 'false'); };
      et.addEventListener('click', function (e) {
        e.stopPropagation();
        if (em.hasAttribute('hidden')) { em.removeAttribute('hidden'); et.classList.add('bc-open'); et.setAttribute('aria-expanded', 'true'); }
        else qrCloseMenu();
      });
      em.querySelectorAll('.bc-export-item').forEach(function (it) {
        it.addEventListener('click', function (e) { e.stopPropagation(); qrCloseMenu(); _qrExport(this.getAttribute('data-fmt')); });
      });
      _qrExportCloser = function () { qrCloseMenu(); };
      _qrExportKey = function (e) { if (e.key === 'Escape') qrCloseMenu(); };
      document.addEventListener('click', _qrExportCloser);
      document.addEventListener('keydown', _qrExportKey);
    }
  }
  function renderQrToolPanel(content) {
    if (!content) return;
    // Preload jsPDF (~350KB) when the QR panel opens — QR has an independent "download PDF" that does NOT go
    // through the export modal; removed from index.html boot (editor-perf B3). Fire-and-forget, ready by click.
    if (window.cc && cc.requireLib) cc.requireLib('js/vendor/jspdf.umd.min.js').catch(function () {});
    var ecc = _qrState.ecc || 'M';
    content.innerHTML =
      '<div class="bc-studio">' +
        '<div class="bc-head">' + _qrIcon('qrcode', 18) + '<span class="bc-head-t">QR studio</span><span class="bc-badge">enterprise</span></div>' +
        '<div class="bc-single">' +
          '<div class="bc-preview"><div class="qr-preview-frame"><img id="qr-preview-img" alt="QR preview"><div class="qr-preview-empty" id="qr-preview-empty">Fill the fields to preview</div></div></div>' +
          '<label class="bc-fld"><span class="bc-flbl">QR content</span><select class="bc-input" id="qr-kind">' +
            _QR_KINDS.map(function (o) { return '<option value="' + o.id + '"' + (o.id === (_qrState.kind || 'url') ? ' selected' : '') + '>' + o.label + '</option>'; }).join('') +
          '</select></label>' +
          '<div id="qr-fields">' + _qrFieldsMarkup(_qrState) + '</div>' +
          '<div class="bc-vwrap bc-vwrap-ro"><input class="bc-input" id="qr-encoded" readonly placeholder="Encoded payload appears here"></div>' +
          '<div class="bc-acc"><button type="button" class="bc-acc-head" onclick="this.parentElement.classList.toggle(\'bc-open\')">' +
            _qrIcon('palette', 15) + '<span class="bc-acc-t">Colors</span><span class="bc-sw-prev"><span class="bc-sw" id="qr-sw-fg" style="background:' + _qrAttr(_qrState.fg) + '"></span><span class="bc-sw" id="qr-sw-bg" style="background:' + _qrAttr(_qrState.bg) + '"></span></span></button>' +
            '<div class="bc-acc-body"><div class="bc-grid2">' +
              '<label class="bc-fld"><span class="bc-flbl">Foreground</span><input type="color" class="bc-color" id="qr-fg" value="' + _qrAttr(_qrState.fg) + '"></label>' +
              '<label class="bc-fld"><span class="bc-flbl">Background</span><input type="color" class="bc-color" id="qr-bg" value="' + _qrAttr(_qrState.bg) + '"></label>' +
            '</div></div></div>' +
          '<div class="bc-acc"><button type="button" class="bc-acc-head" onclick="this.parentElement.classList.toggle(\'bc-open\')">' +
            _qrIcon('settings-2', 15) + '<span class="bc-acc-t">Advanced</span><span class="bc-acc-hint">error correction</span><span class="bc-acc-arr">' + _qrIcon('chevron-down', 15) + '</span></button>' +
            '<div class="bc-acc-body"><label class="bc-fld"><span class="bc-flbl">Error correction</span><select class="bc-input" id="qr-ecc">' +
              ['L', 'M', 'Q', 'H'].map(function (v) { var lab = { L: 'Low (7%)', M: 'Medium (15%)', Q: 'Quartile (25%)', H: 'High (30%)' }[v]; return '<option value="' + v + '"' + (v === ecc ? ' selected' : '') + '>' + lab + '</option>'; }).join('') +
            '</select></label></div></div>' +
          '<button type="button" class="bc-btn-primary" id="qr-add">' + _qrIcon('plus', 15) + ' Add to canvas</button>' +
          '<div class="bc-export-wrap" style="display:flex">' +
            '<button type="button" class="bc-btn bc-export-toggle" id="qr-export-btn" style="width:100%" aria-haspopup="true" aria-expanded="false">' + _qrIcon('download', 14) + ' Export' + _qrIcon('chevron-down', 13) + '</button>' +
            '<div class="bc-export-menu" id="qr-export-menu" hidden>' +
              '<button type="button" class="bc-export-item" data-fmt="png">' + _qrIcon('image', 14) + ' PNG image</button>' +
              '<button type="button" class="bc-export-item" data-fmt="svg">' + _qrIcon('shapes', 14) + ' SVG vector</button>' +
              '<button type="button" class="bc-export-item" data-fmt="pdf">' + _qrIcon('file-text', 14) + ' PDF document</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    _qrBindPanel();
    _qrRefresh();
  }
  // External entry point: the gallery generator hub calls window.renderQrToolPanel(content).
  window.renderQrToolPanel = renderQrToolPanel;

  // Modular skeleton hook (Faz 2): QR Studio is a sub-module of the tools panel hub.
  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'qr', parent: 'left-panel.tools', title: 'QR Studio', mount: function () {}, unmount: function () {} });
  }
})();
