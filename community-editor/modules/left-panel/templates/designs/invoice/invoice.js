/* Module: left-panel/templates/designs/invoice — invoice helpers + US/UK/EU invoice templates
   FLAT sub-module of designs — functions stay window globals (siblings + the parent
   call them at runtime; load order is irrelevant). Split from the 2290-line FLAT file. */

function _invoiceVal(value, fallback) {
  var str = (value == null) ? '' : String(value);
  str = str.replace(/\s+/g, ' ').trim();
  return str || fallback;
}

function _invoiceMerge(base, ext) {
  var out = {};
  var k;
  for (k in base) out[k] = base[k];
  for (k in ext) out[k] = ext[k];
  return out;
}

function _invoiceAddText(text, opts) {
  var base = {
    left: 0,
    top: 0,
    width: 120,
    fontFamily: 'Arial',
    fontSize: 12,
    fontWeight: '400',
    fill: '#12131a',
    selectable: true,
    evented: true,
    lineHeight: 1.18,
    splitByGrapheme: false
  };
  add(new fabric.Textbox(String(text), _invoiceMerge(base, opts || {})));
}

function _invoiceAddRect(opts) {
  add(new fabric.Rect(_invoiceMerge({
    left: 0,
    top: 0,
    width: 10,
    height: 10,
    fill: '#ffffff',
    rx: 0,
    ry: 0,
    selectable: true,
    evented: true
  }, opts || {})));
}

function _invoiceAddLine(x1, y1, x2, y2, stroke, strokeWidth) {
  add(new fabric.Line([x1, y1, x2, y2], {
    stroke: stroke || '#dde1ea',
    strokeWidth: strokeWidth || 1,
    selectable: true,
    evented: true
  }));
}

function _invoiceDrawTable(columns, rows, startY, rowHeight, palette, rightCols) {
  var i, j, rowY, alignRight, value, col;
  rightCols = rightCols || {};
  _invoiceAddRect({ left: 40, top: startY, width: CW - 80, height: rowHeight, fill: palette.headerBg, rx: 14, ry: 14 });
  for (i = 0; i < columns.length; i++) {
    col = columns[i];
    _invoiceAddText(col.label, {
      left: col.x,
      top: startY + 12,
      width: col.w - 4,
      fontSize: 11,
      fontWeight: '700',
      fill: palette.headerText,
      textAlign: rightCols[col.key] ? 'right' : 'left'
    });
  }

  for (i = 0; i < rows.length; i++) {
    rowY = startY + rowHeight + (i * rowHeight);
    _invoiceAddRect({
      left: 40,
      top: rowY + 2,
      width: CW - 80,
      height: rowHeight - 4,
      fill: i % 2 === 0 ? palette.rowA : palette.rowB,
      rx: 10,
      ry: 10
    });
    for (j = 0; j < columns.length; j++) {
      col = columns[j];
      alignRight = !!rightCols[col.key];
      value = rows[i][col.key] || '';
      _invoiceAddText(value, {
        left: col.x,
        top: rowY + 12,
        width: col.w - 4,
        fontSize: col.key === 'desc' ? 12 : 11,
        fontWeight: col.key === 'desc' ? '700' : '400',
        fill: palette.bodyText,
        textAlign: alignRight ? 'right' : 'left'
      });
    }
  }
}

function tplInvoiceUsClean() {
  var co = _invoiceVal(userInfo.company, 'North Harbor Studio');
  var person = _invoiceVal(userInfo.name, 'Morgan Lee');
  var email = _invoiceVal(userInfo.email, 'billing@northrbor.example');
  var phone = _invoiceVal(userInfo.phone, '+1 (415) 555-0198');
  var site = _invoiceVal(userInfo.website, 'www.northharborstudio.com');
  var addr = _invoiceVal(userInfo.address, '120 Madison Ave\nNew York, NY 10016');
  var palette = {
    ink: '#111827',
    accent: '#f2ff58',
    soft: '#f4f5f8',
    soft2: '#eef1f6',
    line: '#d7dce5'
  };
  var rows = [
    { desc: 'Brand strategy workshop', qty: '1', rate: '$1,250.00', tax: '$0.00', total: '$1,250.00' },
    { desc: 'Invoice layout design system', qty: '1', rate: '$820.00', tax: '$0.00', total: '$820.00' },
    { desc: 'Production support', qty: '6h', rate: '$95.00', tax: '$0.00', total: '$570.00' }
  ];
  var cols = [
    { key: 'desc', label: 'Description', x: 54, w: 230 },
    { key: 'qty', label: 'Qty', x: 292, w: 48 },
    { key: 'rate', label: 'Rate', x: 348, w: 76 },
    { key: 'tax', label: 'Tax', x: 432, w: 60 },
    { key: 'total', label: 'Amount', x: 500, w: 44 }
  ];
  canvas.setBackgroundColor('#ffffff', canvas.renderAll.bind(canvas));
  _invoiceAddRect({ left: 40, top: 36, width: CW - 80, height: 92, fill: palette.ink, rx: 26, ry: 26 });
  _invoiceAddText(co, { left: 58, top: 56, width: 250, fontSize: 24, fontWeight: '700', fill: '#ffffff' });
  _invoiceAddText('Creative studio billing', { left: 58, top: 90, width: 180, fontSize: 12, fill: 'rgba(255,255,255,0.75)' });
  _invoiceAddText('INVOICE', { left: CW - 220, top: 54, width: 150, fontSize: 30, fontWeight: '700', fill: '#ffffff', textAlign: 'right' });
  _invoiceAddText('INV-2026-0148', { left: CW - 220, top: 90, width: 150, fontSize: 12, fill: palette.accent, textAlign: 'right' });

  _invoiceAddText('Bill from', { left: 40, top: 158, width: 100, fontSize: 11, fontWeight: '700', fill: '#7b8190' });
  _invoiceAddText(person + '\n' + co + '\n' + addr + '\n' + email + '\n' + phone + '\n' + site, {
    left: 40, top: 180, width: 210, fontSize: 12, fill: palette.ink, lineHeight: 1.32
  });
  _invoiceAddText('Bill to', { left: 278, top: 158, width: 100, fontSize: 11, fontWeight: '700', fill: '#7b8190' });
  _invoiceAddText('Hudson Retail Co.\nAccounts Payable\n410 W 14th St\nNew York, NY 10014\nap@hudsonretail.com', {
    left: 278, top: 180, width: 165, fontSize: 12, fill: palette.ink, lineHeight: 1.32
  });

  _invoiceAddRect({ left: 450, top: 160, width: 105, height: 114, fill: palette.soft, rx: 18, ry: 18 });
  _invoiceAddText('Issue date', { left: 466, top: 178, width: 74, fontSize: 10, fontWeight: '700', fill: '#7b8190', textAlign: 'right' });
  _invoiceAddText('27 Mar 2026', { left: 466, top: 194, width: 74, fontSize: 12, fontWeight: '700', fill: palette.ink, textAlign: 'right' });
  _invoiceAddText('Due date', { left: 466, top: 224, width: 74, fontSize: 10, fontWeight: '700', fill: '#7b8190', textAlign: 'right' });
  _invoiceAddText('10 Apr 2026', { left: 466, top: 240, width: 74, fontSize: 12, fontWeight: '700', fill: palette.ink, textAlign: 'right' });

  _invoiceDrawTable(cols, rows, 300, 42, {
    headerBg: palette.ink,
    headerText: '#ffffff',
    rowA: '#fbfbfd',
    rowB: palette.soft,
    bodyText: palette.ink
  }, { qty: true, rate: true, tax: true, total: true });

  _invoiceAddRect({ left: 40, top: 512, width: 250, height: 122, fill: palette.soft, rx: 20, ry: 20 });
  _invoiceAddText('Payment notes', { left: 58, top: 532, width: 120, fontSize: 12, fontWeight: '700', fill: palette.ink });
  _invoiceAddText('Please pay by ACH transfer.\nRef: INV-2026-0148\nBank: North Harbor Studio\nRouting: 031100209', {
    left: 58, top: 560, width: 210, fontSize: 11, fill: '#596173', lineHeight: 1.35
  });

  _invoiceAddRect({ left: 340, top: 512, width: 215, height: 152, fill: palette.ink, rx: 22, ry: 22 });
  _invoiceAddText('Subtotal', { left: 362, top: 534, width: 90, fontSize: 12, fill: 'rgba(255,255,255,0.72)' });
  _invoiceAddText('$2,640.00', { left: 430, top: 534, width: 100, fontSize: 12, fontWeight: '700', fill: '#ffffff', textAlign: 'right' });
  _invoiceAddText('Sales tax', { left: 362, top: 565, width: 90, fontSize: 12, fill: 'rgba(255,255,255,0.72)' });
  _invoiceAddText('$0.00', { left: 430, top: 565, width: 100, fontSize: 12, fontWeight: '700', fill: '#ffffff', textAlign: 'right' });
  _invoiceAddLine(362, 600, 530, 600, 'rgba(255,255,255,0.14)', 1);
  _invoiceAddText('Total due', { left: 362, top: 614, width: 90, fontSize: 13, fontWeight: '700', fill: '#ffffff' });
  _invoiceAddText('$2,640.00', { left: 410, top: 610, width: 120, fontSize: 24, fontWeight: '700', fill: palette.accent, textAlign: 'right' });

  _invoiceAddText('Thank you for your business. Payment terms: Net 14.', {
    left: 40, top: CH - 54, width: CW - 80, fontSize: 11, fill: '#7b8190', textAlign: 'center'
  });
}

function tplInvoiceUkVat() {
  var co = _invoiceVal(userInfo.company, 'Thames Atelier Ltd');
  var person = _invoiceVal(userInfo.name, 'Amelia Hart');
  var email = _invoiceVal(userInfo.email, 'accounts@thamesatelier.co.uk');
  var phone = _invoiceVal(userInfo.phone, '+44 20 7946 0018');
  var site = _invoiceVal(userInfo.website, 'www.thamesatelier.co.uk');
  var addr = _invoiceVal(userInfo.address, '14 Clerkenwell Road\nLondon EC1M 5RF');
  var palette = {
    ink: '#151824',
    accent: '#f2ff58',
    slate: '#566074',
    soft: '#f3f5f8',
    soft2: '#eceff4',
    line: '#d8dde7'
  };
  var rows = [
    { desc: 'Quarterly brand consultancy', qty: '1', net: '£1,800.00', vat: '20%', gross: '£2,160.00' },
    { desc: 'Campaign copy and QA', qty: '1', net: '£540.00', vat: '20%', gross: '£648.00' },
    { desc: 'Template implementation support', qty: '4h', net: '£320.00', vat: '20%', gross: '£384.00' }
  ];
  var cols = [
    { key: 'desc', label: 'Item', x: 54, w: 244 },
    { key: 'qty', label: 'Qty', x: 304, w: 46 },
    { key: 'net', label: 'Net', x: 360, w: 70 },
    { key: 'vat', label: 'VAT', x: 438, w: 42 },
    { key: 'gross', label: 'Gross', x: 488, w: 56 }
  ];
  canvas.setBackgroundColor('#ffffff', canvas.renderAll.bind(canvas));
  _invoiceAddRect({ left: 40, top: 38, width: CW - 80, height: 16, fill: palette.accent, rx: 8, ry: 8 });
  _invoiceAddText('VAT INVOICE', { left: 40, top: 76, width: 180, fontSize: 30, fontWeight: '700', fill: palette.ink });
  _invoiceAddText(co, { left: CW - 220, top: 78, width: 180, fontSize: 22, fontWeight: '700', fill: palette.ink, textAlign: 'right' });
  _invoiceAddText(site, { left: CW - 220, top: 108, width: 180, fontSize: 11, fill: palette.slate, textAlign: 'right' });

  _invoiceAddRect({ left: 40, top: 148, width: 170, height: 132, fill: palette.soft, rx: 18, ry: 18 });
  _invoiceAddText('Supplier', { left: 58, top: 168, width: 100, fontSize: 11, fontWeight: '700', fill: '#7b8190' });
  _invoiceAddText(person + '\n' + co + '\n' + addr + '\n' + email + '\n' + phone + '\nVAT No: GB 223 4517 90', {
    left: 58, top: 192, width: 132, fontSize: 11, fill: palette.ink, lineHeight: 1.28
  });

  _invoiceAddRect({ left: 224, top: 148, width: 170, height: 132, fill: palette.soft, rx: 18, ry: 18 });
  _invoiceAddText('Customer', { left: 242, top: 168, width: 100, fontSize: 11, fontWeight: '700', fill: '#7b8190' });
  _invoiceAddText('Westbridge Property Group\nAttn: Finance Team\n45 Fitzroy Square\nLondon W1T 6EB\nVAT No: GB 918 2045 11', {
    left: 242, top: 192, width: 132, fontSize: 11, fill: palette.ink, lineHeight: 1.28
  });

  _invoiceAddRect({ left: 408, top: 148, width: 147, height: 132, fill: palette.ink, rx: 18, ry: 18 });
  _invoiceAddText('Invoice no', { left: 428, top: 170, width: 107, fontSize: 10, fontWeight: '700', fill: 'rgba(255,255,255,0.68)', textAlign: 'right' });
  _invoiceAddText('UK-2026-031', { left: 428, top: 185, width: 107, fontSize: 13, fontWeight: '700', fill: '#ffffff', textAlign: 'right' });
  _invoiceAddText('Tax point', { left: 428, top: 212, width: 107, fontSize: 10, fontWeight: '700', fill: 'rgba(255,255,255,0.68)', textAlign: 'right' });
  _invoiceAddText('27 Mar 2026', { left: 428, top: 227, width: 107, fontSize: 13, fontWeight: '700', fill: '#ffffff', textAlign: 'right' });
  _invoiceAddText('Due date', { left: 428, top: 254, width: 107, fontSize: 10, fontWeight: '700', fill: 'rgba(255,255,255,0.68)', textAlign: 'right' });
  _invoiceAddText('10 Apr 2026', { left: 428, top: 269, width: 107, fontSize: 13, fontWeight: '700', fill: palette.accent, textAlign: 'right' });

  _invoiceDrawTable(cols, rows, 316, 42, {
    headerBg: palette.ink,
    headerText: '#ffffff',
    rowA: '#fbfcfe',
    rowB: palette.soft,
    bodyText: palette.ink
  }, { qty: true, net: true, vat: true, gross: true });

  _invoiceAddRect({ left: 40, top: 512, width: 242, height: 148, fill: '#ffffff', stroke: palette.line, strokeWidth: 1, rx: 18, ry: 18 });
  _invoiceAddText('Remittance details', { left: 60, top: 534, width: 132, fontSize: 12, fontWeight: '700', fill: palette.ink });
  _invoiceAddText('Bank: HSBC UK\nSort code: 40-15-22\nAccount: 50021984\nReference: UK-2026-031', {
    left: 60, top: 564, width: 182, fontSize: 11, fill: palette.slate, lineHeight: 1.35
  });

  _invoiceAddRect({ left: 304, top: 512, width: 251, height: 184, fill: palette.soft2, rx: 20, ry: 20 });
  _invoiceAddText('Net total', { left: 326, top: 536, width: 100, fontSize: 12, fill: palette.slate });
  _invoiceAddText('£2,660.00', { left: 430, top: 532, width: 103, fontSize: 12, fontWeight: '700', fill: palette.ink, textAlign: 'right' });
  _invoiceAddText('VAT 20%', { left: 326, top: 568, width: 100, fontSize: 12, fill: palette.slate });
  _invoiceAddText('£532.00', { left: 430, top: 564, width: 103, fontSize: 12, fontWeight: '700', fill: palette.ink, textAlign: 'right' });
  _invoiceAddLine(326, 602, 533, 602, palette.line, 1);
  _invoiceAddText('Amount due', { left: 326, top: 618, width: 100, fontSize: 13, fontWeight: '700', fill: palette.ink });
  _invoiceAddText('£3,192.00', { left: 394, top: 612, width: 139, fontSize: 26, fontWeight: '700', fill: palette.ink, textAlign: 'right' });
  _invoiceAddText('This invoice includes all information required for a full UK VAT invoice.', {
    left: 326, top: 660, width: 207, fontSize: 10, fill: palette.slate, lineHeight: 1.3
  });
}

function tplInvoiceEuModern() {
  var co = _invoiceVal(userInfo.company, 'Atelier Nord GmbH');
  var person = _invoiceVal(userInfo.name, 'Sofia Klein');
  var email = _invoiceVal(userInfo.email, 'finance@ateliernord.eu');
  var phone = _invoiceVal(userInfo.phone, '+49 30 5557 204');
  var site = _invoiceVal(userInfo.website, 'www.ateliernord.eu');
  var addr = _invoiceVal(userInfo.address, 'Torstrasse 118\n10119 Berlin\nGermany');
  var palette = {
    ink: '#111827',
    accent: '#f2ff58',
    soft: '#f6f7fb',
    soft2: '#eef2f7',
    line: '#d9dee8',
    green: '#1f9d7a'
  };
  var rows = [
    { desc: 'UX audit and accessibility review', unit: '1', price: '€1,450.00', vat: '19%', total: '€1,725.50' },
    { desc: 'Invoice template localisation', unit: '1', price: '€760.00', vat: '19%', total: '€904.40' },
    { desc: 'Launch support', unit: '3h', price: '€85.00', vat: '19%', total: '€303.45' }
  ];
  var cols = [
    { key: 'desc', label: 'Service', x: 54, w: 252 },
    { key: 'unit', label: 'Unit', x: 314, w: 42 },
    { key: 'price', label: 'Net', x: 366, w: 70 },
    { key: 'vat', label: 'VAT', x: 444, w: 44 },
    { key: 'total', label: 'Total', x: 496, w: 48 }
  ];
  canvas.setBackgroundColor('#f7f7f5', canvas.renderAll.bind(canvas));
  _invoiceAddRect({ left: 40, top: 36, width: 12, height: 92, fill: palette.accent, rx: 6, ry: 6 });
  _invoiceAddText('INVOICE', { left: 68, top: 44, width: 180, fontSize: 30, fontWeight: '700', fill: palette.ink });
  _invoiceAddText('EU-2026-208', { left: 68, top: 82, width: 130, fontSize: 12, fontWeight: '700', fill: palette.green });
  _invoiceAddText(co, { left: 350, top: 48, width: 205, fontSize: 23, fontWeight: '700', fill: palette.ink, textAlign: 'right' });
  _invoiceAddText(site + '\n' + email + '\n' + phone, { left: 370, top: 82, width: 185, fontSize: 11, fill: '#667085', textAlign: 'right', lineHeight: 1.3 });

  _invoiceAddRect({ left: 40, top: 154, width: 250, height: 112, fill: '#ffffff', stroke: palette.line, strokeWidth: 1, rx: 18, ry: 18 });
  _invoiceAddText('Supplier', { left: 60, top: 174, width: 100, fontSize: 11, fontWeight: '700', fill: '#7b8190' });
  _invoiceAddText(person + '\n' + co + '\n' + addr + '\nVAT ID: DE 318445271', {
    left: 60, top: 198, width: 196, fontSize: 11, fill: palette.ink, lineHeight: 1.28
  });

  _invoiceAddRect({ left: 305, top: 154, width: 250, height: 112, fill: '#ffffff', stroke: palette.line, strokeWidth: 1, rx: 18, ry: 18 });
  _invoiceAddText('Customer', { left: 325, top: 174, width: 100, fontSize: 11, fontWeight: '700', fill: '#7b8190' });
  _invoiceAddText('Studio Bianchi SRL\nVia Palermo 28\n20121 Milano\nItaly\nVAT ID: IT 09123310152', {
    left: 325, top: 198, width: 190, fontSize: 11, fill: palette.ink, lineHeight: 1.28
  });

  _invoiceAddText('Issue date', { left: 40, top: 288, width: 80, fontSize: 10, fontWeight: '700', fill: '#7b8190' });
  _invoiceAddText('27 Mar 2026', { left: 40, top: 304, width: 80, fontSize: 12, fontWeight: '700', fill: palette.ink });
  _invoiceAddText('Due date', { left: 148, top: 288, width: 80, fontSize: 10, fontWeight: '700', fill: '#7b8190' });
  _invoiceAddText('12 Apr 2026', { left: 148, top: 304, width: 80, fontSize: 12, fontWeight: '700', fill: palette.ink });
  _invoiceAddText('Supply date', { left: 256, top: 288, width: 80, fontSize: 10, fontWeight: '700', fill: '#7b8190' });
  _invoiceAddText('27 Mar 2026', { left: 256, top: 304, width: 80, fontSize: 12, fontWeight: '700', fill: palette.ink });
  _invoiceAddText('Payment terms', { left: 364, top: 288, width: 90, fontSize: 10, fontWeight: '700', fill: '#7b8190' });
  _invoiceAddText('14 days bank transfer', { left: 364, top: 304, width: 140, fontSize: 12, fontWeight: '700', fill: palette.ink });

  _invoiceDrawTable(cols, rows, 338, 42, {
    headerBg: palette.ink,
    headerText: '#ffffff',
    rowA: '#ffffff',
    rowB: palette.soft,
    bodyText: palette.ink
  }, { unit: true, price: true, vat: true, total: true });

  _invoiceAddRect({ left: 40, top: 512, width: 250, height: 156, fill: palette.soft, rx: 20, ry: 20 });
  _invoiceAddText('VAT note', { left: 60, top: 534, width: 80, fontSize: 12, fontWeight: '700', fill: palette.ink });
  _invoiceAddText('Reverse charge not applied.\nVAT charged at German standard rate.\nIBAN: DE16 3704 0044 0532 0130 00\nSWIFT: COBADEFFXXX', {
    left: 60, top: 564, width: 202, fontSize: 11, fill: '#667085', lineHeight: 1.35
  });

  _invoiceAddRect({ left: 316, top: 512, width: 239, height: 178, fill: palette.ink, rx: 24, ry: 24 });
  _invoiceAddText('Net total', { left: 338, top: 534, width: 90, fontSize: 12, fill: 'rgba(255,255,255,0.7)' });
  _invoiceAddText('€2,465.00', { left: 438, top: 530, width: 95, fontSize: 12, fontWeight: '700', fill: '#ffffff', textAlign: 'right' });
  _invoiceAddText('VAT 19%', { left: 338, top: 566, width: 90, fontSize: 12, fill: 'rgba(255,255,255,0.7)' });
  _invoiceAddText('€468.35', { left: 438, top: 562, width: 95, fontSize: 12, fontWeight: '700', fill: '#ffffff', textAlign: 'right' });
  _invoiceAddLine(338, 600, 533, 600, 'rgba(255,255,255,0.14)', 1);
  _invoiceAddText('Total payable', { left: 338, top: 616, width: 100, fontSize: 13, fontWeight: '700', fill: '#ffffff' });
  _invoiceAddText('€2,933.35', { left: 390, top: 610, width: 143, fontSize: 26, fontWeight: '700', fill: palette.accent, textAlign: 'right' });
  _invoiceAddText('Please include the invoice number as the payment reference.', {
    left: 338, top: 656, width: 195, fontSize: 10, fill: 'rgba(255,255,255,0.68)', lineHeight: 1.3
  });
}

if (window.cc && cc.modules) cc.modules.register({ id: 'invoice', parent: 'left-panel.templates.designs', title: 'designs: invoice', mount: function () {}, unmount: function () {} });
