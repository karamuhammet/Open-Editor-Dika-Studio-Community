/* Module: left-panel/templates/designs/card-builders — business-card template builders (tpl*)
   FLAT sub-module of designs — functions stay window globals (siblings + the parent
   call them at runtime; load order is irrelevant). Split from the 2290-line FLAT file. */

function tplBlank() {
  canvas.setBackgroundColor('#ffffff', canvas.renderAll.bind(canvas));
}

function tplNoir() {
  var n = userInfo.name || 'JOHN DOE', t = userInfo.title || 'Creative Director';
  var e = userInfo.email || 'hello@yourstudio.com', ph = userInfo.phone || '+1 (555) 234 5678';
  var w = userInfo.website || 'www.yourstudio.com';
  canvas.setBackgroundColor('#0d0d0d', canvas.renderAll.bind(canvas));
  add(new fabric.Rect({ left: 40, top: 40, width: 4, height: 320, fill: '#f2ff58' }));
  add(new fabric.IText(n.toUpperCase(), { left: 65, top: 55, fontFamily: 'Unbounded', fontSize: 24, fill: '#fff', fontWeight: '700', charSpacing: 70, _fieldRole: 'name' }));
  add(new fabric.IText(t, { left: 66, top: 96, fontFamily: 'DM Sans', fontSize: 13, fill: '#f2ff58', charSpacing: 20, _fieldRole: 'title' }));
  add(new fabric.Rect({ left: 65, top: 124, width: 130, height: 1, fill: '#2a2a2a' }));
  add(new fabric.IText(e, { left: 66, top: 148, fontFamily: 'DM Sans', fontSize: 11.5, fill: '#666', _fieldRole: 'email' }));
  add(new fabric.IText(ph, { left: 66, top: 172, fontFamily: 'DM Sans', fontSize: 11.5, fill: '#666', _fieldRole: 'phone' }));
  add(new fabric.IText(w, { left: 66, top: 196, fontFamily: 'DM Sans', fontSize: 11.5, fill: '#666', _fieldRole: 'website' }));
  add(new fabric.Rect({ left: 530, top: 130, width: 130, height: 130, fill: '#181818', rx: 6, ry: 6 }));
  add(new fabric.IText('YOUR\nLOGO', { left: 560, top: 170, fontFamily: 'Unbounded', fontSize: 13, fill: '#333', lineHeight: 1.4, textAlign: 'center' }));
}

function tplStudio() {
  var n = userInfo.name || 'Jane Smith', t = userInfo.title || 'Brand Strategist & Consultant';
  var e = userInfo.email || 'jane@brandstudio.io', ph = userInfo.phone || '+44 7700 900 123';
  var w = userInfo.website || 'www.brandstudio.io', co = userInfo.company || 'BRAND STUDIO';
  canvas.setBackgroundColor('#f9f6f1', canvas.renderAll.bind(canvas));
  add(new fabric.IText(n, { left: 58, top: 72, fontFamily: 'Playfair Display', fontSize: 38, fill: '#111', fontStyle: 'italic', _fieldRole: 'name' }));
  add(new fabric.IText(t, { left: 60, top: 128, fontFamily: 'Josefin Sans', fontSize: 12, fill: '#999', charSpacing: 40, _fieldRole: 'title' }));
  add(new fabric.Rect({ left: 60, top: 155, width: 220, height: 1, fill: '#ddd' }));
  add(new fabric.IText(e, { left: 60, top: 176, fontFamily: 'DM Sans', fontSize: 12, fill: '#666', _fieldRole: 'email' }));
  add(new fabric.IText(ph, { left: 60, top: 200, fontFamily: 'DM Sans', fontSize: 12, fill: '#666', _fieldRole: 'phone' }));
  add(new fabric.IText(w, { left: 60, top: 224, fontFamily: 'DM Sans', fontSize: 12, fill: '#aaa', _fieldRole: 'website' }));
  add(new fabric.Rect({ left: 0, top: 352, width: 700, height: 48, fill: '#111', selectable: true, evented: true }));
  add(new fabric.IText(co.toUpperCase(), { left: 58, top: 365, fontFamily: 'Josefin Sans', fontSize: 12, fill: '#fff', charSpacing: 60, _fieldRole: 'company' }));
  add(new fabric.IText('Creative Agency', { left: 480, top: 368, fontFamily: 'DM Sans', fontSize: 10, fill: '#888' }));
}

function tplBold() {
  var parts = (userInfo.name || 'Alex Morgan').split(' ');
  var first = parts[0] || 'Alex', last = parts.slice(1).join(' ') || 'Morgan';
  var t = userInfo.title || 'Full Stack Developer';
  var e = userInfo.email || 'alex@devstudio.io', ph = userInfo.phone || '+1 (555) 900 1234';
  var w = userInfo.website || 'github.com/alexmorgan';
  canvas.setBackgroundColor('#ffffff', canvas.renderAll.bind(canvas));
  add(new fabric.Rect({ left: 0, top: 0, width: 290, height: 400, fill: '#023e8a', selectable: true, evented: true }));
  add(new fabric.IText(first[0] || 'A', { left: 58, top: 100, fontFamily: 'Playfair Display', fontSize: 140, fill: 'rgba(255,255,255,.08)', fontWeight: '700', selectable: true, evented: true }));
  add(new fabric.IText(first.toUpperCase(), { left: 44, top: 68, fontFamily: 'Unbounded', fontSize: 26, fill: '#fff', fontWeight: '700', charSpacing: 60, _fieldRole: 'name' }));
  add(new fabric.IText(last.toUpperCase(), { left: 44, top: 106, fontFamily: 'Unbounded', fontSize: 22, fill: '#90e0ef', fontWeight: '700', charSpacing: 40 }));
  add(new fabric.Rect({ left: 44, top: 142, width: 60, height: 3, fill: 'rgba(255,255,255,.3)', selectable: true, evented: true }));
  add(new fabric.IText(t, { left: 44, top: 160, fontFamily: 'DM Sans', fontSize: 12, fill: 'rgba(255,255,255,.7)', _fieldRole: 'title' }));
  add(new fabric.IText(t, { left: 320, top: 70, fontFamily: 'DM Sans', fontSize: 14, fill: '#111', fontWeight: '600' }));
  add(new fabric.Rect({ left: 320, top: 98, width: 70, height: 3, fill: '#023e8a', selectable: true, evented: true }));
  add(new fabric.IText(e, { left: 320, top: 148, fontFamily: 'DM Sans', fontSize: 11.5, fill: '#555', _fieldRole: 'email' }));
  add(new fabric.IText(ph, { left: 320, top: 172, fontFamily: 'DM Sans', fontSize: 11.5, fill: '#555', _fieldRole: 'phone' }));
  add(new fabric.IText(w, { left: 320, top: 196, fontFamily: 'Space Mono', fontSize: 10, fill: '#023e8a', _fieldRole: 'website' }));
}

function tplArch() {
  var n = userInfo.name || 'Morgan Lee', t = userInfo.title || 'Senior Architect';
  var e = userInfo.email || 'morgan@studio.co', ph = userInfo.phone || '+1 555 789 0123';
  var co = userInfo.company || 'STUDIO.CO';
  canvas.setBackgroundColor('#f0ece4', canvas.renderAll.bind(canvas));
  for (var x = 0; x <= CW; x += 60) { add(new fabric.Line([x, 0, x, CH], { stroke: '#d4cfc6', strokeWidth: 0.5, selectable: true, evented: true, opacity: 0.7 })); }
  for (var y = 0; y <= CH; y += 60) { add(new fabric.Line([0, y, CW, y], { stroke: '#d4cfc6', strokeWidth: 0.5, selectable: true, evented: true, opacity: 0.7 })); }
  add(new fabric.IText(co.toUpperCase(), { left: 58, top: 72, fontFamily: 'Unbounded', fontSize: 30, fill: '#2c2c2c', fontWeight: '700', charSpacing: 30, _fieldRole: 'company' }));
  add(new fabric.IText('Architecture & Design', { left: 60, top: 118, fontFamily: 'Cormorant Garamond', fontSize: 18, fill: '#7a7268', fontStyle: 'italic' }));
  add(new fabric.Rect({ left: 58, top: 152, width: 300, height: 1, fill: '#b5b0a4' }));
  add(new fabric.IText(n, { left: 58, top: 172, fontFamily: 'Cormorant Garamond', fontSize: 22, fill: '#333', fontWeight: '600', _fieldRole: 'name' }));
  add(new fabric.IText(t, { left: 60, top: 204, fontFamily: 'DM Sans', fontSize: 11, fill: '#888', _fieldRole: 'title' }));
  add(new fabric.IText(e, { left: 58, top: 232, fontFamily: 'DM Sans', fontSize: 11, fill: '#888', _fieldRole: 'email' }));
  add(new fabric.IText(ph, { left: 58, top: 252, fontFamily: 'DM Sans', fontSize: 11, fill: '#888', _fieldRole: 'phone' }));
  add(new fabric.Circle({ left: 578, top: 300, radius: 56, fill: '#2c2c2c', selectable: true, evented: true }));
  add(new fabric.IText(co[0] || 'S', { left: 601, top: 316, fontFamily: 'Unbounded', fontSize: 26, fill: '#f0ece4', selectable: true, evented: true }));
}

function tplMinimal() {
  var n = userInfo.name || 'Sarah Chen', t = userInfo.title || 'Product Designer';
  var e = userInfo.email || 'sarah@minimal.co', ph = userInfo.phone || '+1 555 111 2222';
  var w = userInfo.website || 'www.minimal.co', co = userInfo.company || 'Minimal Co.';
  canvas.setBackgroundColor('#ffffff', canvas.renderAll.bind(canvas));
  add(new fabric.IText(n, { left: CW / 2, top: 100, fontFamily: 'Outfit', fontSize: 34, fill: '#111', fontWeight: '600', textAlign: 'center', originX: 'center', _fieldRole: 'name' }));
  add(new fabric.IText(t, { left: CW / 2, top: 148, fontFamily: 'DM Sans', fontSize: 14, fill: '#999', textAlign: 'center', originX: 'center', _fieldRole: 'title' }));
  add(new fabric.Rect({ left: CW / 2 - 40, top: 180, width: 80, height: 1, fill: '#ddd' }));
  add(new fabric.IText(e, { left: CW / 2, top: 208, fontFamily: 'DM Sans', fontSize: 12, fill: '#666', textAlign: 'center', originX: 'center', _fieldRole: 'email' }));
  add(new fabric.IText(ph, { left: CW / 2, top: 232, fontFamily: 'DM Sans', fontSize: 12, fill: '#666', textAlign: 'center', originX: 'center', _fieldRole: 'phone' }));
  add(new fabric.IText(w, { left: CW / 2, top: 256, fontFamily: 'DM Sans', fontSize: 11, fill: '#aaa', textAlign: 'center', originX: 'center', _fieldRole: 'website' }));
  add(new fabric.IText(co, { left: CW / 2, top: 340, fontFamily: 'Outfit', fontSize: 11, fill: '#ccc', fontWeight: '600', textAlign: 'center', originX: 'center', charSpacing: 80, _fieldRole: 'company' }));
}

function tplLuxe() {
  var n = userInfo.name || 'Victoria Blake', t = userInfo.title || 'Managing Director';
  var e = userInfo.email || 'victoria@luxe.com', ph = userInfo.phone || '+1 555 999 0000';
  var w = userInfo.website || 'www.luxe.com', co = userInfo.company || 'LUXE GROUP';
  canvas.setBackgroundColor('#0a0a12', canvas.renderAll.bind(canvas));
  add(new fabric.Rect({ left: 24, top: 24, width: CW - 48, height: CH - 48, fill: 'transparent', stroke: '#f2ff58', strokeWidth: 1.5, rx: 2, ry: 2, selectable: true, evented: true }));
  add(new fabric.IText('\u25C6', { left: CW / 2, top: 50, fontFamily: 'Arial', fontSize: 10, fill: '#f2ff58', textAlign: 'center', originX: 'center', selectable: true, evented: true }));
  add(new fabric.IText(n.toUpperCase(), { left: CW / 2, top: 100, fontFamily: 'Playfair Display', fontSize: 32, fill: '#f2ff58', fontWeight: '700', textAlign: 'center', originX: 'center', charSpacing: 80, _fieldRole: 'name' }));
  add(new fabric.IText(t, { left: CW / 2, top: 150, fontFamily: 'DM Sans', fontSize: 13, fill: '#888', textAlign: 'center', originX: 'center', charSpacing: 30, _fieldRole: 'title' }));
  add(new fabric.Rect({ left: CW / 2 - 50, top: 180, width: 100, height: 1, fill: '#f2ff58', opacity: 0.4 }));
  add(new fabric.IText(e, { left: CW / 2, top: 210, fontFamily: 'DM Sans', fontSize: 12, fill: '#666', textAlign: 'center', originX: 'center', _fieldRole: 'email' }));
  add(new fabric.IText(ph, { left: CW / 2, top: 236, fontFamily: 'DM Sans', fontSize: 12, fill: '#666', textAlign: 'center', originX: 'center', _fieldRole: 'phone' }));
  add(new fabric.IText(w, { left: CW / 2, top: 262, fontFamily: 'DM Sans', fontSize: 11, fill: '#555', textAlign: 'center', originX: 'center', _fieldRole: 'website' }));
  add(new fabric.IText(co.toUpperCase(), { left: CW / 2, top: 340, fontFamily: 'Josefin Sans', fontSize: 10, fill: '#f2ff58', textAlign: 'center', originX: 'center', charSpacing: 100, opacity: 0.6, _fieldRole: 'company' }));
}

function tplTechCircuit() {
  var n = userInfo.name || 'DAVID CHEN', t = userInfo.title || 'Software Engineer';
  var e = userInfo.email || 'david@techcorp.io', ph = userInfo.phone || '+1 (555) 800 4000';
  var w = userInfo.website || 'www.techcorp.io', co = userInfo.company || 'TECHCORP';
  canvas.setBackgroundColor('#1a1a2e', canvas.renderAll.bind(canvas));

  var circuitPaths = [
    'M 20 50 L 120 50 L 120 120 L 200 120',
    'M 20 150 L 80 150 L 80 200 L 160 200 L 160 280',
    'M 500 30 L 500 100 L 600 100 L 600 180',
    'M 450 300 L 550 300 L 550 250 L 650 250',
    'M 620 40 L 620 80 L 680 80',
    'M 400 350 L 500 350 L 500 380',
    'M 300 20 L 300 60 L 380 60',
    'M 650 300 L 650 370 L 690 370',
    'M 30 300 L 100 300 L 100 360',
    'M 180 340 L 250 340 L 250 390',
    'M 550 150 L 620 150 L 620 200 L 680 200',
    'M 400 80 L 480 80 L 480 40'
  ];

  circuitPaths.forEach(function(d) {
    add(new fabric.Path(d, {
      fill: '', stroke: 'rgba(255,255,255,0.25)', strokeWidth: 1.5,
      selectable: true, evented: true
    }));
  });

  var nodePosns = [
    [20, 50], [120, 50], [120, 120], [200, 120],
    [80, 150], [80, 200], [160, 200], [160, 280],
    [500, 30], [500, 100], [600, 100], [600, 180],
    [550, 300], [550, 250], [650, 250],
    [620, 40], [620, 80], [680, 80],
    [300, 20], [300, 60], [380, 60],
    [650, 300], [650, 370],
    [30, 300], [100, 300], [100, 360],
    [480, 80], [480, 40]
  ];

  nodePosns.forEach(function(pos) {
    add(new fabric.Circle({
      left: pos[0] - 3, top: pos[1] - 3, radius: 3,
      fill: 'rgba(255,255,255,0.35)', selectable: true, evented: true
    }));
  });

  add(new fabric.IText(n.toUpperCase(), { left: 60, top: 80, fontFamily: 'Unbounded', fontSize: 28, fill: '#ffffff', fontWeight: '700', charSpacing: 60, _fieldRole: 'name' }));
  add(new fabric.IText(t, { left: 62, top: 122, fontFamily: 'DM Sans', fontSize: 13, fill: 'rgba(255,255,255,0.85)', charSpacing: 20, _fieldRole: 'title' }));
  add(new fabric.Rect({ left: 60, top: 152, width: 120, height: 2, fill: 'rgba(255,255,255,0.4)', selectable: true, evented: true }));
  add(new fabric.IText(e, { left: 62, top: 178, fontFamily: 'DM Sans', fontSize: 12, fill: 'rgba(255,255,255,0.8)', _fieldRole: 'email' }));
  add(new fabric.IText(ph, { left: 62, top: 202, fontFamily: 'DM Sans', fontSize: 12, fill: 'rgba(255,255,255,0.8)', _fieldRole: 'phone' }));
  add(new fabric.IText(w, { left: 62, top: 226, fontFamily: 'DM Sans', fontSize: 12, fill: 'rgba(255,255,255,0.7)', _fieldRole: 'website' }));
  add(new fabric.IText(co.toUpperCase(), { left: 62, top: 340, fontFamily: 'Unbounded', fontSize: 11, fill: 'rgba(255,255,255,0.5)', charSpacing: 80, _fieldRole: 'company' }));
}

function tplOrganicBlob() {
  var n = userInfo.name || 'EMMA TAYLOR', t = userInfo.title || 'Creative Director';
  var e = userInfo.email || 'emma@studio.com', ph = userInfo.phone || '+1 (555) 600 7890';
  var w = userInfo.website || 'www.emmastudio.com', co = userInfo.company || 'EMMA STUDIO';
  canvas.setBackgroundColor('#2d6a4f', canvas.renderAll.bind(canvas));

  var blob1 = new fabric.Path(
    'M 0 60 C 20 -10 80 -20 120 20 C 160 60 170 120 130 160 C 90 200 20 180 0 130 C -20 80 -20 80 0 60 Z',
    { left: 480, top: 40, fill: 'rgba(255,255,255,0.12)', selectable: true, evented: true }
  );
  add(blob1);

  var blob2 = new fabric.Path(
    'M 0 40 C 30 -15 90 -10 110 30 C 130 70 110 130 70 150 C 30 170 -20 140 -10 90 C 0 60 -10 55 0 40 Z',
    { left: 540, top: 200, fill: 'rgba(255,255,255,0.08)', selectable: true, evented: true }
  );
  add(blob2);

  var blob3 = new fabric.Path(
    'M 0 30 C 15 -5 45 -10 60 15 C 75 40 65 80 40 90 C 15 100 -10 75 -5 45 C 0 30 -5 35 0 30 Z',
    { left: -20, top: 280, fill: 'rgba(255,255,255,0.10)', selectable: true, evented: true }
  );
  add(blob3);

  var blob4 = new fabric.Path(
    'M 0 25 C 10 0 40 -5 55 15 C 70 35 60 65 35 75 C 10 85 -10 60 0 25 Z',
    { left: 620, top: 320, fill: 'rgba(255,255,255,0.07)', selectable: true, evented: true }
  );
  add(blob4);

  add(new fabric.IText(n.toUpperCase(), { left: 60, top: 70, fontFamily: 'Unbounded', fontSize: 30, fill: '#ffffff', fontWeight: '700', charSpacing: 50, _fieldRole: 'name' }));
  add(new fabric.IText(t, { left: 62, top: 116, fontFamily: 'DM Sans', fontSize: 14, fill: 'rgba(255,255,255,0.85)', charSpacing: 20, _fieldRole: 'title' }));

  add(new fabric.Rect({ left: 60, top: 152, width: 100, height: 2, fill: 'rgba(255,255,255,0.4)', selectable: true, evented: true }));

  add(new fabric.Circle({ left: 52, top: 183, radius: 6, fill: 'rgba(255,255,255,0.5)', selectable: true, evented: true }));
  add(new fabric.IText(e, { left: 74, top: 178, fontFamily: 'DM Sans', fontSize: 12, fill: 'rgba(255,255,255,0.85)', _fieldRole: 'email' }));

  add(new fabric.Circle({ left: 52, top: 211, radius: 6, fill: 'rgba(255,255,255,0.5)', selectable: true, evented: true }));
  add(new fabric.IText(ph, { left: 74, top: 206, fontFamily: 'DM Sans', fontSize: 12, fill: 'rgba(255,255,255,0.85)', _fieldRole: 'phone' }));

  add(new fabric.Circle({ left: 52, top: 239, radius: 6, fill: 'rgba(255,255,255,0.5)', selectable: true, evented: true }));
  add(new fabric.IText(w, { left: 74, top: 234, fontFamily: 'DM Sans', fontSize: 12, fill: 'rgba(255,255,255,0.75)', _fieldRole: 'website' }));

  add(new fabric.IText(co.toUpperCase(), { left: 62, top: 340, fontFamily: 'Unbounded', fontSize: 10, fill: 'rgba(255,255,255,0.45)', charSpacing: 80, _fieldRole: 'company' }));
}

function tplFloralElegant() {
  var n = userInfo.name || 'Olivia Rose', t = userInfo.title || 'Floral Designer';
  var e = userInfo.email || 'olivia@bloom.co', ph = userInfo.phone || '+1 (555) 321 4567';
  var w = userInfo.website || 'www.bloom.co', co = userInfo.company || 'BLOOM';
  canvas.setBackgroundColor('#5c374c', canvas.renderAll.bind(canvas));

  var leaf1 = 'M 0 0 C 8 -30 35 -40 50 -20 C 65 0 50 25 30 30 C 10 35 -8 20 0 0 Z';
  var leaf2 = 'M 0 0 C -5 -20 -25 -35 -40 -20 C -55 -5 -45 20 -25 28 C -5 36 5 15 0 0 Z';
  var stem1 = 'M 0 0 C 10 -40 5 -80 -5 -110';
  var vine1 = 'M 0 0 C 20 -10 40 -25 50 -50 C 60 -75 50 -100 30 -110';

  add(new fabric.Path(leaf1, { left: 520, top: 60, fill: 'rgba(255,255,255,0.15)', selectable: true, evented: true }));
  add(new fabric.Path(leaf2, { left: 570, top: 80, fill: 'rgba(255,255,255,0.12)', selectable: true, evented: true }));
  add(new fabric.Path(leaf1, { left: 600, top: 50, fill: 'rgba(255,255,255,0.10)', selectable: true, evented: true, scaleX: 0.7, scaleY: 0.7 }));

  add(new fabric.Path(stem1, { left: 540, top: 100, fill: '', stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1.5, selectable: true, evented: true }));
  add(new fabric.Path(vine1, { left: 580, top: 110, fill: '', stroke: 'rgba(255,255,255,0.15)', strokeWidth: 1, selectable: true, evented: true }));

  var berryPositions = [[530, 30], [560, 25], [545, 15], [610, 35], [625, 45], [640, 30]];
  berryPositions.forEach(function(pos) {
    add(new fabric.Circle({ left: pos[0], top: pos[1], radius: 4, fill: 'rgba(255,255,255,0.25)', selectable: true, evented: true }));
  });

  add(new fabric.Path(leaf1, { left: 10, top: 320, fill: 'rgba(255,255,255,0.10)', selectable: true, evented: true, scaleX: 1.2, scaleY: 1.2, angle: 180 }));
  add(new fabric.Path(leaf2, { left: 70, top: 350, fill: 'rgba(255,255,255,0.08)', selectable: true, evented: true, scaleX: 1.0, scaleY: 1.0, angle: 180 }));
  add(new fabric.Path(stem1, { left: 40, top: 380, fill: '', stroke: 'rgba(255,255,255,0.15)', strokeWidth: 1, selectable: true, evented: true, angle: 180 }));

  var bottomBerries = [[20, 370], [50, 375], [35, 385], [80, 365]];
  bottomBerries.forEach(function(pos) {
    add(new fabric.Circle({ left: pos[0], top: pos[1], radius: 3, fill: 'rgba(255,255,255,0.2)', selectable: true, evented: true }));
  });

  add(new fabric.IText(n, { left: 60, top: 70, fontFamily: 'Playfair Display', fontSize: 36, fill: '#ffffff', fontStyle: 'italic', _fieldRole: 'name' }));
  add(new fabric.IText(t, { left: 62, top: 120, fontFamily: 'DM Sans', fontSize: 13, fill: 'rgba(255,255,255,0.8)', charSpacing: 30, _fieldRole: 'title' }));
  add(new fabric.Rect({ left: 60, top: 152, width: 180, height: 1, fill: 'rgba(255,255,255,0.35)', selectable: true, evented: true }));
  add(new fabric.IText(e, { left: 62, top: 178, fontFamily: 'DM Sans', fontSize: 12, fill: 'rgba(255,255,255,0.85)', _fieldRole: 'email' }));
  add(new fabric.IText(ph, { left: 62, top: 202, fontFamily: 'DM Sans', fontSize: 12, fill: 'rgba(255,255,255,0.85)', _fieldRole: 'phone' }));
  add(new fabric.IText(w, { left: 62, top: 226, fontFamily: 'DM Sans', fontSize: 12, fill: 'rgba(255,255,255,0.7)', _fieldRole: 'website' }));
  add(new fabric.IText(co.toUpperCase(), { left: 62, top: 340, fontFamily: 'Unbounded', fontSize: 11, fill: 'rgba(255,255,255,0.5)', charSpacing: 100, _fieldRole: 'company' }));
}

function tplRestaurant() {
  var n = userInfo.name || 'Marco Rossi', t = userInfo.title || 'Executive Chef';
  var e = userInfo.email || 'marco@latrattoria.com', ph = userInfo.phone || '+1 (555) 444 7890';
  var w = userInfo.website || 'www.latrattoria.com', co = userInfo.company || 'LA TRATTORIA';
  canvas.setBackgroundColor('#8b2500', canvas.renderAll.bind(canvas));

  var forkPath = 'M 0 0 L 0 60 M -6 0 L -6 18 Q -6 24 0 24 Q 6 24 6 18 L 6 0 M -3 0 L -3 18 M 3 0 L 3 18';
  add(new fabric.Path(forkPath, {
    left: 560, top: 60, fill: '', stroke: 'rgba(255,255,255,0.25)', strokeWidth: 1.5,
    selectable: true, evented: true, scaleX: 2, scaleY: 2
  }));

  var knifePath = 'M 0 0 L 0 60 M 0 0 C 12 5 12 20 0 24';
  add(new fabric.Path(knifePath, {
    left: 620, top: 60, fill: '', stroke: 'rgba(255,255,255,0.25)', strokeWidth: 1.5,
    selectable: true, evented: true, scaleX: 2, scaleY: 2
  }));

  add(new fabric.Circle({
    left: 540, top: 250, radius: 55,
    fill: '', stroke: 'rgba(255,255,255,0.15)', strokeWidth: 2,
    selectable: true, evented: true
  }));
  add(new fabric.Circle({
    left: 555, top: 265, radius: 40,
    fill: '', stroke: 'rgba(255,255,255,0.10)', strokeWidth: 1,
    selectable: true, evented: true
  }));

  add(new fabric.IText(co.toUpperCase(), { left: 60, top: 50, fontFamily: 'Playfair Display', fontSize: 12, fill: 'rgba(255,255,255,0.6)', charSpacing: 100, _fieldRole: 'company' }));
  add(new fabric.IText(n, { left: 60, top: 85, fontFamily: 'Unbounded', fontSize: 28, fill: '#ffffff', fontWeight: '700', _fieldRole: 'name' }));
  add(new fabric.IText(t, { left: 62, top: 126, fontFamily: 'DM Sans', fontSize: 14, fill: 'rgba(255,255,255,0.85)', charSpacing: 20, _fieldRole: 'title' }));
  add(new fabric.Rect({ left: 60, top: 160, width: 120, height: 2, fill: 'rgba(255,255,255,0.3)', selectable: true, evented: true }));
  add(new fabric.IText(e, { left: 62, top: 186, fontFamily: 'DM Sans', fontSize: 12, fill: 'rgba(255,255,255,0.85)', _fieldRole: 'email' }));
  add(new fabric.IText(ph, { left: 62, top: 210, fontFamily: 'DM Sans', fontSize: 12, fill: 'rgba(255,255,255,0.85)', _fieldRole: 'phone' }));
  add(new fabric.IText(w, { left: 62, top: 234, fontFamily: 'DM Sans', fontSize: 12, fill: 'rgba(255,255,255,0.7)', _fieldRole: 'website' }));

  add(new fabric.Rect({ left: 0, top: CH - 50, width: CW, height: 50, fill: 'rgba(0,0,0,0.2)', selectable: true, evented: true }));
  add(new fabric.IText(co.toUpperCase(), { left: 60, top: CH - 35, fontFamily: 'Unbounded', fontSize: 10, fill: 'rgba(255,255,255,0.6)', charSpacing: 80 }));
}

function tplLoyaltyCard() {
  var co = userInfo.company || 'CAFE DELIGHTS';
  canvas.setBackgroundColor('#3b2f2f', canvas.renderAll.bind(canvas));

  add(new fabric.Rect({ left: 20, top: 20, width: CW - 40, height: CH - 40, fill: '', stroke: 'rgba(255,255,255,0.3)', strokeWidth: 1.5, rx: 8, ry: 8, selectable: true, evented: true }));

  add(new fabric.IText(co.toUpperCase(), { left: CW / 2, top: 50, fontFamily: 'Playfair Display', fontSize: 28, fill: '#ffffff', fontWeight: '700', textAlign: 'center', originX: 'center', charSpacing: 60, _fieldRole: 'company' }));

  add(new fabric.IText('LOYALTY CARD', { left: CW / 2, top: 90, fontFamily: 'DM Sans', fontSize: 12, fill: 'rgba(255,255,255,0.7)', textAlign: 'center', originX: 'center', charSpacing: 120 }));

  add(new fabric.Rect({ left: CW / 2 - 40, top: 115, width: 80, height: 1, fill: 'rgba(255,255,255,0.3)', selectable: true, evented: true }));

  var stampStartX = CW / 2 - 200;
  var stampY = 175;
  var stampSpacing = 50;
  var totalStamps = 9;
  var filledStamps = 0;

  for (var i = 0; i < totalStamps; i++) {
    var cx = stampStartX + i * stampSpacing;
    if (i < filledStamps) {
      add(new fabric.Circle({ left: cx - 16, top: stampY - 16, radius: 16, fill: 'rgba(255,255,255,0.9)' }));
      add(new fabric.IText('\u2713', { left: cx, top: stampY - 4, fontFamily: 'Arial', fontSize: 16, fill: '#3b2f2f', textAlign: 'center', originX: 'center', originY: 'center' }));
    } else {
      add(new fabric.Circle({ left: cx - 16, top: stampY - 16, radius: 16, fill: '', stroke: 'rgba(255,255,255,0.5)', strokeWidth: 1.5 }));
      add(new fabric.IText(String(i + 1), { left: cx, top: stampY - 4, fontFamily: 'DM Sans', fontSize: 11, fill: 'rgba(255,255,255,0.4)', textAlign: 'center', originX: 'center', originY: 'center' }));
    }
  }

  var cupPath = 'M 0 0 L 3 30 Q 3 38 15 38 Q 27 38 27 30 L 30 0 Z M 30 6 C 36 6 40 14 36 20 C 34 24 30 24 30 20';
  add(new fabric.Path(cupPath, {
    left: CW / 2 + 170, top: stampY - 20, fill: 'rgba(255,255,255,0.9)', stroke: '',
    selectable: true, evented: true, scaleX: 1, scaleY: 1
  }));

  add(new fabric.IText('Collect 9 stamps and get your', { left: CW / 2, top: 230, fontFamily: 'DM Sans', fontSize: 13, fill: 'rgba(255,255,255,0.85)', textAlign: 'center', originX: 'center' }));
  add(new fabric.IText('FREE DRINK!', { left: CW / 2, top: 254, fontFamily: 'Unbounded', fontSize: 22, fill: '#ffffff', fontWeight: '700', textAlign: 'center', originX: 'center' }));

  add(new fabric.Rect({ left: CW / 2 - 40, top: 290, width: 80, height: 1, fill: 'rgba(255,255,255,0.3)', selectable: true, evented: true }));

  var phone = userInfo.phone || '+1 (555) 123 4567';
  var website = userInfo.website || 'www.cafedelights.com';
  add(new fabric.IText(phone + '  |  ' + website, { left: CW / 2, top: 310, fontFamily: 'DM Sans', fontSize: 10, fill: 'rgba(255,255,255,0.6)', textAlign: 'center', originX: 'center' }));

  add(new fabric.IText('Valid for dine-in orders only', { left: CW / 2, top: 355, fontFamily: 'DM Sans', fontSize: 9, fill: 'rgba(255,255,255,0.4)', fontStyle: 'italic', textAlign: 'center', originX: 'center' }));
}

function tplCorporateModern() {
  var n = userInfo.name || 'JAMES WALKER', t = userInfo.title || 'Chief Executive Officer';
  var e = userInfo.email || 'james@corpmain.com', ph = userInfo.phone || '+1 (555) 700 8000';
  var w = userInfo.website || 'www.corpmain.com', co = userInfo.company || 'CORPMAIN';
  canvas.setBackgroundColor('#1b263b', canvas.renderAll.bind(canvas));

  add(new fabric.Rect({ left: 480, top: -30, width: 80, height: 200, fill: 'rgba(255,255,255,0.12)', angle: -20, selectable: true, evented: true }));
  add(new fabric.Rect({ left: 540, top: -30, width: 40, height: 200, fill: 'rgba(255,255,255,0.08)', angle: -20, selectable: true, evented: true }));
  add(new fabric.Rect({ left: 600, top: -30, width: 20, height: 200, fill: 'rgba(255,255,255,0.06)', angle: -20, selectable: true, evented: true }));

  add(new fabric.Rect({ left: 420, top: 250, width: 60, height: 250, fill: 'rgba(255,255,255,0.08)', angle: -20, selectable: true, evented: true }));
  add(new fabric.Rect({ left: 500, top: 260, width: 30, height: 250, fill: 'rgba(255,255,255,0.05)', angle: -20, selectable: true, evented: true }));

  add(new fabric.Rect({ left: 50, top: 40, width: 70, height: 70, fill: '', stroke: 'rgba(255,255,255,0.6)', strokeWidth: 2, selectable: true, evented: true }));
  add(new fabric.IText(co[0] || 'C', { left: 72, top: 53, fontFamily: 'Unbounded', fontSize: 30, fill: '#ffffff', fontWeight: '700', selectable: true, evented: true }));

  add(new fabric.IText(n.toUpperCase(), { left: 50, top: 140, fontFamily: 'Unbounded', fontSize: 26, fill: '#ffffff', fontWeight: '700', charSpacing: 80, _fieldRole: 'name' }));
  add(new fabric.IText(t.toUpperCase(), { left: 52, top: 180, fontFamily: 'DM Sans', fontSize: 11, fill: 'rgba(255,255,255,0.7)', charSpacing: 60, _fieldRole: 'title' }));

  add(new fabric.Rect({ left: 50, top: 210, width: 100, height: 2, fill: 'rgba(255,255,255,0.5)', selectable: true, evented: true }));

  add(new fabric.IText(e, { left: 52, top: 238, fontFamily: 'DM Sans', fontSize: 12, fill: 'rgba(255,255,255,0.85)', _fieldRole: 'email' }));
  add(new fabric.IText(ph, { left: 52, top: 262, fontFamily: 'DM Sans', fontSize: 12, fill: 'rgba(255,255,255,0.85)', _fieldRole: 'phone' }));
  add(new fabric.IText(w, { left: 52, top: 286, fontFamily: 'DM Sans', fontSize: 12, fill: 'rgba(255,255,255,0.7)', _fieldRole: 'website' }));

  add(new fabric.IText(co.toUpperCase(), { left: 52, top: 350, fontFamily: 'Unbounded', fontSize: 10, fill: 'rgba(255,255,255,0.45)', charSpacing: 100, _fieldRole: 'company' }));
}

function tplQRFocus() {
  var n = userInfo.name || 'SARAH PARK', t = userInfo.title || 'Digital Strategist';
  var e = userInfo.email || 'sarah@digitalco.io', ph = userInfo.phone || '+1 (555) 200 9000';
  var w = userInfo.website || 'https://digitalco.io', co = userInfo.company || 'DIGITAL CO';
  canvas.setBackgroundColor('#ffffff', canvas.renderAll.bind(canvas));

  add(new fabric.Rect({ left: 0, top: 0, width: CW, height: 8, fill: '#e05535', selectable: true, evented: true }));
  add(new fabric.Rect({ left: 0, top: CH - 8, width: CW, height: 8, fill: '#e05535', selectable: true, evented: true }));

  add(new fabric.Rect({ left: 0, top: 0, width: 8, height: CH, fill: '#e05535', selectable: true, evented: true }));

  add(new fabric.IText(n.toUpperCase(), { left: 40, top: 40, fontFamily: 'Unbounded', fontSize: 22, fill: '#1a1a1a', fontWeight: '700', charSpacing: 50, _fieldRole: 'name' }));
  add(new fabric.IText(t, { left: 42, top: 74, fontFamily: 'DM Sans', fontSize: 13, fill: '#666', charSpacing: 20, _fieldRole: 'title' }));

  add(new fabric.Rect({ left: 40, top: 102, width: 80, height: 2, fill: '#e05535', selectable: true, evented: true }));

  add(new fabric.IText(e, { left: 42, top: 124, fontFamily: 'DM Sans', fontSize: 11, fill: '#555', _fieldRole: 'email' }));
  add(new fabric.IText(ph, { left: 42, top: 146, fontFamily: 'DM Sans', fontSize: 11, fill: '#555', _fieldRole: 'phone' }));
  add(new fabric.IText(w, { left: 42, top: 168, fontFamily: 'DM Sans', fontSize: 11, fill: '#e05535', _fieldRole: 'website' }));

  var qrUrl = userInfo.website || 'https://digitalco.io';
  try {
    fabric.Image.fromURL(generateQRImage(qrUrl, '#1a1a1a', '#ffffff', 160), function(img) {
      img.set({ left: 470, top: 80 });
      img.scaleToWidth(180);
      img.set({ selectable: true, evented: true, isQR: true, qrUrl: qrUrl, qrFg: '#1a1a1a', qrBg: '#ffffff' });
      canvas.add(img);
      canvas.renderAll();
    });
  } catch (ex) {
    add(new fabric.Rect({ left: 470, top: 80, width: 180, height: 180, fill: '#f0f0f0', rx: 4, ry: 4 }));
    add(new fabric.IText('QR', { left: 540, top: 150, fontFamily: 'Unbounded', fontSize: 24, fill: '#ccc', textAlign: 'center', originX: 'center' }));
  }

  add(new fabric.IText('SCAN TO CONNECT', { left: 560, top: 280, fontFamily: 'DM Sans', fontSize: 9, fill: '#999', textAlign: 'center', originX: 'center', charSpacing: 80 }));

  add(new fabric.Rect({ left: 0, top: CH - 50, width: CW, height: 50, fill: '#fafafa', selectable: true, evented: true }));
  add(new fabric.IText(co.toUpperCase(), { left: 42, top: CH - 36, fontFamily: 'Unbounded', fontSize: 11, fill: '#bbb', charSpacing: 80, _fieldRole: 'company' }));
}

function tplSocialMedia() {
  var n = userInfo.name || 'ALEX RIVERA', t = userInfo.title || 'Social Media Manager';
  var e = userInfo.email || 'alex@socialco.com', ph = userInfo.phone || '+1 (555) 333 8888';
  var w = userInfo.website || 'www.socialco.com', co = userInfo.company || 'SOCIAL CO';
  canvas.setBackgroundColor('#6c3483', canvas.renderAll.bind(canvas));

  add(new fabric.Rect({ left: 0, top: CH - 80, width: CW, height: 80, fill: 'rgba(0,0,0,0.2)', selectable: true, evented: true }));

  add(new fabric.IText(n.toUpperCase(), { left: 60, top: 60, fontFamily: 'Unbounded', fontSize: 30, fill: '#ffffff', fontWeight: '700', charSpacing: 60, _fieldRole: 'name' }));
  add(new fabric.IText(t, { left: 62, top: 106, fontFamily: 'DM Sans', fontSize: 14, fill: 'rgba(255,255,255,0.85)', charSpacing: 20, _fieldRole: 'title' }));

  add(new fabric.Rect({ left: 60, top: 140, width: 100, height: 2, fill: 'rgba(255,255,255,0.4)', selectable: true, evented: true }));

  add(new fabric.Circle({ left: 52, top: 170, radius: 5, fill: 'rgba(255,255,255,0.5)', selectable: true, evented: true }));
  add(new fabric.IText(e, { left: 72, top: 165, fontFamily: 'DM Sans', fontSize: 12, fill: 'rgba(255,255,255,0.85)', _fieldRole: 'email' }));

  add(new fabric.Circle({ left: 52, top: 198, radius: 5, fill: 'rgba(255,255,255,0.5)', selectable: true, evented: true }));
  add(new fabric.IText(ph, { left: 72, top: 193, fontFamily: 'DM Sans', fontSize: 12, fill: 'rgba(255,255,255,0.85)', _fieldRole: 'phone' }));

  add(new fabric.Circle({ left: 52, top: 226, radius: 5, fill: 'rgba(255,255,255,0.5)', selectable: true, evented: true }));
  add(new fabric.IText(w, { left: 72, top: 221, fontFamily: 'DM Sans', fontSize: 12, fill: 'rgba(255,255,255,0.75)', _fieldRole: 'website' }));

  var username = (userInfo.name || 'alexrivera').replace(/\s+/g, '').toLowerCase();
  var socials = [
    { icon: 'f', label: '/' + username, x: 60 },
    { icon: '\uD83D\uDCF7', label: '@' + username, x: 230 },
    { icon: 'X', label: '@' + username, x: 410 }
  ];

  socials.forEach(function(s) {
    add(new fabric.Circle({ left: s.x - 2, top: CH - 58, radius: 14, fill: 'rgba(255,255,255,0.15)', selectable: true, evented: true }));
    add(new fabric.IText(s.icon, { left: s.x + 12, top: CH - 52, fontFamily: 'Arial', fontSize: 13, fill: '#ffffff', textAlign: 'center', originX: 'center', selectable: true, evented: true }));
    add(new fabric.IText(s.label, { left: s.x + 34, top: CH - 52, fontFamily: 'DM Sans', fontSize: 11, fill: 'rgba(255,255,255,0.7)' }));
  });

  add(new fabric.IText(co.toUpperCase(), { left: CW - 60, top: 66, fontFamily: 'Unbounded', fontSize: 10, fill: 'rgba(255,255,255,0.4)', textAlign: 'right', originX: 'right', charSpacing: 60, angle: 90, _fieldRole: 'company' }));
}

function tplExecutive() {
  var n = userInfo.name || 'RICHARD BLAKE', t = userInfo.title || 'Chief Executive Officer';
  var e = userInfo.email || 'richard@execgroup.com', ph = userInfo.phone || '+1 (555) 900 1000';
  var w = userInfo.website || 'www.execgroup.com', co = userInfo.company || 'EXECUTIVE GROUP';
  var loc = 'New York, NY';
  canvas.setBackgroundColor('#1a1f3c', canvas.renderAll.bind(canvas));

  add(new fabric.Path(
    'M 580 0 Q 700 100 660 200 Q 620 300 700 400',
    { fill: '', stroke: '#c9a855', strokeWidth: 2.5, selectable: true, evented: true, opacity: 0.6 }
  ));
  add(new fabric.Path(
    'M 610 0 Q 720 120 680 220 Q 640 320 720 400',
    { fill: '', stroke: '#c9a855', strokeWidth: 1, selectable: true, evented: true, opacity: 0.3 }
  ));

  add(new fabric.IText(co.toUpperCase(), { left: 60, top: 40, fontFamily: 'Josefin Sans', fontSize: 11, fill: '#c9a855', charSpacing: 120, selectable: true, evented: true, _fieldRole: 'company' }));

  add(new fabric.Polygon(
    [{ x: 0, y: -14 }, { x: 14, y: 0 }, { x: 0, y: 14 }, { x: -14, y: 0 }],
    { left: 60, top: 80, fill: 'transparent', stroke: '#c9a855', strokeWidth: 1.5, selectable: true, evented: true }
  ));
  add(new fabric.Rect({ left: 67, top: 87, width: 12, height: 12, fill: '#c9a855', opacity: 0.3, angle: 45, selectable: true, evented: true }));

  add(new fabric.IText(n.toUpperCase(), { left: 60, top: 130, fontFamily: 'Unbounded', fontSize: 24, fill: '#ffffff', fontWeight: '700', charSpacing: 60, selectable: true, evented: true, _fieldRole: 'name' }));
  add(new fabric.IText(t, { left: 62, top: 170, fontFamily: 'DM Sans', fontSize: 12, fill: '#8a90a8', charSpacing: 20, selectable: true, evented: true, _fieldRole: 'title' }));

  add(new fabric.Line([60, 200, 300, 200], { stroke: '#c9a855', strokeWidth: 1, selectable: true, evented: true, opacity: 0.5 }));

  add(new fabric.Circle({ left: 52, top: 224, radius: 5, fill: '#c9a855', opacity: 0.7, selectable: true, evented: true }));
  add(new fabric.IText(ph, { left: 74, top: 220, fontFamily: 'DM Sans', fontSize: 11, fill: '#9ea3b8', selectable: true, evented: true, _fieldRole: 'phone' }));

  add(new fabric.Circle({ left: 52, top: 250, radius: 5, fill: '#c9a855', opacity: 0.7, selectable: true, evented: true }));
  add(new fabric.IText(e, { left: 74, top: 246, fontFamily: 'DM Sans', fontSize: 11, fill: '#9ea3b8', selectable: true, evented: true, _fieldRole: 'email' }));

  add(new fabric.Circle({ left: 52, top: 276, radius: 5, fill: '#c9a855', opacity: 0.7, selectable: true, evented: true }));
  add(new fabric.IText(w, { left: 74, top: 272, fontFamily: 'DM Sans', fontSize: 11, fill: '#9ea3b8', selectable: true, evented: true, _fieldRole: 'website' }));

  add(new fabric.Circle({ left: 52, top: 302, radius: 5, fill: '#c9a855', opacity: 0.7, selectable: true, evented: true }));
  add(new fabric.IText(loc, { left: 74, top: 298, fontFamily: 'DM Sans', fontSize: 11, fill: '#9ea3b8', selectable: true, evented: true }));
}

function tplRedwave() {
  var n = userInfo.name || 'MICHAEL DAVIS', t = userInfo.title || 'Marketing Director';
  var e = userInfo.email || 'michael@agency.com', ph = userInfo.phone || '+1 (555) 600 2000';
  var w = userInfo.website || 'www.agency.com', co = userInfo.company || 'AGENCY';
  canvas.setBackgroundColor('#ffffff', canvas.renderAll.bind(canvas));

  add(new fabric.Path(
    'M 0 0 L 0 400 L 80 400 Q 160 320 140 200 Q 120 80 180 0 Z',
    { left: 0, top: 0, fill: '#dc2626', selectable: true, evented: true }
  ));
  add(new fabric.Path(
    'M 0 0 L 0 400 L 60 400 Q 130 300 110 180 Q 90 60 150 0 Z',
    { left: 0, top: 0, fill: '#b91c1c', opacity: 0.3, selectable: true, evented: true }
  ));

  add(new fabric.Rect({ left: 220, top: 30, width: 40, height: 40, fill: 'transparent', stroke: '#dc2626', strokeWidth: 2, selectable: true, evented: true }));
  add(new fabric.IText(co[0] || 'A', { left: 230, top: 35, fontFamily: 'Unbounded', fontSize: 22, fill: '#dc2626', fontWeight: '700', selectable: true, evented: true }));
  add(new fabric.IText(co.toUpperCase(), { left: 275, top: 42, fontFamily: 'Josefin Sans', fontSize: 11, fill: '#333', charSpacing: 80, selectable: true, evented: true, _fieldRole: 'company' }));

  add(new fabric.IText(n.toUpperCase(), { left: 220, top: 110, fontFamily: 'Unbounded', fontSize: 26, fill: '#1a1a1a', fontWeight: '700', charSpacing: 50, selectable: true, evented: true, _fieldRole: 'name' }));
  add(new fabric.IText(t, { left: 222, top: 150, fontFamily: 'DM Sans', fontSize: 13, fill: '#666', charSpacing: 20, selectable: true, evented: true, _fieldRole: 'title' }));

  add(new fabric.Rect({ left: 220, top: 180, width: 80, height: 2, fill: '#dc2626', selectable: true, evented: true }));

  add(new fabric.Circle({ left: 212, top: 210, radius: 5, fill: '#dc2626', selectable: true, evented: true }));
  add(new fabric.IText(ph, { left: 232, top: 206, fontFamily: 'DM Sans', fontSize: 11, fill: '#555', selectable: true, evented: true, _fieldRole: 'phone' }));

  add(new fabric.Circle({ left: 212, top: 238, radius: 5, fill: '#dc2626', selectable: true, evented: true }));
  add(new fabric.IText(e, { left: 232, top: 234, fontFamily: 'DM Sans', fontSize: 11, fill: '#555', selectable: true, evented: true, _fieldRole: 'email' }));

  add(new fabric.Circle({ left: 212, top: 266, radius: 5, fill: '#dc2626', selectable: true, evented: true }));
  add(new fabric.IText(w, { left: 232, top: 262, fontFamily: 'DM Sans', fontSize: 11, fill: '#dc2626', selectable: true, evented: true, _fieldRole: 'website' }));
}

function tplDarkgold() {
  var n = userInfo.name || 'DR. ALEXANDER HUNT', t = userInfo.title || 'Senior Consultant';
  var e = userInfo.email || 'alexander@premiercorp.com', ph = userInfo.phone || '+1 (555) 777 3000';
  var w = userInfo.website || 'www.premiercorp.com', co = userInfo.company || 'PREMIER CORP';
  var loc = 'London, UK';
  canvas.setBackgroundColor('#0a0a0a', canvas.renderAll.bind(canvas));

  add(new fabric.Path(
    'M 0 400 Q 100 300 200 320 Q 350 350 500 200 Q 600 120 700 100',
    { fill: '', stroke: '#c9a855', strokeWidth: 2, selectable: true, evented: true, opacity: 0.5 }
  ));
  add(new fabric.Path(
    'M 0 400 Q 80 320 180 340 Q 330 365 480 230 Q 580 150 700 135',
    { fill: '', stroke: '#c9a855', strokeWidth: 1, selectable: true, evented: true, opacity: 0.25 }
  ));

  var dOff = 14;
  add(new fabric.Polygon([{ x: 0, y: -10 }, { x: 10, y: 0 }, { x: 0, y: 10 }, { x: -10, y: 0 }],
    { left: CW / 2 - dOff, top: 30, fill: '#c9a855', opacity: 0.8, selectable: true, evented: true }));
  add(new fabric.Polygon([{ x: 0, y: -10 }, { x: 10, y: 0 }, { x: 0, y: 10 }, { x: -10, y: 0 }],
    { left: CW / 2 + dOff, top: 30, fill: '#c9a855', opacity: 0.8, selectable: true, evented: true }));
  add(new fabric.Polygon([{ x: 0, y: -10 }, { x: 10, y: 0 }, { x: 0, y: 10 }, { x: -10, y: 0 }],
    { left: CW / 2, top: 30 - dOff, fill: '#c9a855', opacity: 0.8, selectable: true, evented: true }));
  add(new fabric.Polygon([{ x: 0, y: -10 }, { x: 10, y: 0 }, { x: 0, y: 10 }, { x: -10, y: 0 }],
    { left: CW / 2, top: 30 + dOff, fill: '#c9a855', opacity: 0.8, selectable: true, evented: true }));

  add(new fabric.IText(co.toUpperCase(), { left: CW / 2, top: 75, fontFamily: 'Josefin Sans', fontSize: 11, fill: '#c9a855', textAlign: 'center', originX: 'center', charSpacing: 100, selectable: true, evented: true, _fieldRole: 'company' }));
  add(new fabric.IText('Excellence in Every Detail', { left: CW / 2, top: 95, fontFamily: 'DM Sans', fontSize: 9, fill: '#666', textAlign: 'center', originX: 'center', charSpacing: 40, selectable: true, evented: true }));

  add(new fabric.Line([CW / 2 - 60, 118, CW / 2 + 60, 118], { stroke: '#c9a855', strokeWidth: 0.5, selectable: true, evented: true, opacity: 0.5 }));

  add(new fabric.IText(n.toUpperCase(), { left: CW / 2, top: 140, fontFamily: 'Unbounded', fontSize: 20, fill: '#ffffff', fontWeight: '700', textAlign: 'center', originX: 'center', charSpacing: 60, selectable: true, evented: true, _fieldRole: 'name' }));
  add(new fabric.IText(t, { left: CW / 2, top: 172, fontFamily: 'DM Sans', fontSize: 12, fill: '#888', textAlign: 'center', originX: 'center', charSpacing: 20, selectable: true, evented: true, _fieldRole: 'title' }));

  add(new fabric.IText(ph, { left: 60, top: 220, fontFamily: 'DM Sans', fontSize: 11, fill: '#999', selectable: true, evented: true, _fieldRole: 'phone' }));
  add(new fabric.IText(e, { left: 60, top: 244, fontFamily: 'DM Sans', fontSize: 11, fill: '#999', selectable: true, evented: true, _fieldRole: 'email' }));
  add(new fabric.IText(w, { left: 400, top: 220, fontFamily: 'DM Sans', fontSize: 11, fill: '#999', selectable: true, evented: true, _fieldRole: 'website' }));
  add(new fabric.IText(loc, { left: 400, top: 244, fontFamily: 'DM Sans', fontSize: 11, fill: '#999', selectable: true, evented: true }));

  add(new fabric.Rect({ left: 580, top: 300, width: 70, height: 70, fill: '#1a1a1a', rx: 4, ry: 4, stroke: '#333', strokeWidth: 1, selectable: true, evented: true }));
  add(new fabric.IText('QR', { left: 615, top: 325, fontFamily: 'Unbounded', fontSize: 14, fill: '#444', textAlign: 'center', originX: 'center', selectable: true, evented: true }));
}

function tplNavywhite() {
  var n = userInfo.name || 'MATTHEW GRANT', t = userInfo.title || 'Brand Director';
  var e = userInfo.email || 'matt@brandco.com', ph = userInfo.phone || '+1 (555) 400 5000';
  var w = userInfo.website || 'www.brandco.com', co = userInfo.company || 'BRAND CO';
  var initials = (n.split(' ').map(function(p) { return p[0]; }).join('') || 'MG').substring(0, 2);
  canvas.setBackgroundColor('#1e2d4f', canvas.renderAll.bind(canvas));

  add(new fabric.Rect({ left: 0, top: 220, width: CW, height: 180, fill: '#ffffff', selectable: true, evented: true }));

  add(new fabric.Rect({ left: 0, top: 210, width: CW, height: 20, fill: 'rgba(255,255,255,0.15)', selectable: true, evented: true }));

  add(new fabric.IText(initials.toUpperCase(), { left: CW / 2, top: 40, fontFamily: 'Playfair Display', fontSize: 80, fill: 'rgba(255,255,255,0.08)', fontWeight: '700', textAlign: 'center', originX: 'center', selectable: true, evented: true }));

  add(new fabric.IText(co.toUpperCase(), { left: CW / 2, top: 80, fontFamily: 'Unbounded', fontSize: 22, fill: '#ffffff', fontWeight: '700', textAlign: 'center', originX: 'center', charSpacing: 80, selectable: true, evented: true, _fieldRole: 'company' }));
  add(new fabric.IText('Strategic Brand Solutions', { left: CW / 2, top: 115, fontFamily: 'DM Sans', fontSize: 10, fill: 'rgba(255,255,255,0.6)', textAlign: 'center', originX: 'center', charSpacing: 40, selectable: true, evented: true }));

  add(new fabric.Rect({ left: CW / 2 - 30, top: 145, width: 60, height: 1.5, fill: 'rgba(255,255,255,0.4)', selectable: true, evented: true }));

  add(new fabric.IText(n.toUpperCase(), { left: CW / 2, top: 155, fontFamily: 'Josefin Sans', fontSize: 12, fill: 'rgba(255,255,255,0.9)', textAlign: 'center', originX: 'center', charSpacing: 60, selectable: true, evented: true, _fieldRole: 'name' }));
  add(new fabric.IText(t, { left: CW / 2, top: 178, fontFamily: 'DM Sans', fontSize: 10, fill: 'rgba(255,255,255,0.55)', textAlign: 'center', originX: 'center', selectable: true, evented: true, _fieldRole: 'title' }));

  add(new fabric.IText(n, { left: CW / 2, top: 245, fontFamily: 'Unbounded', fontSize: 14, fill: '#1e2d4f', fontWeight: '700', textAlign: 'center', originX: 'center', selectable: true, evented: true }));
  add(new fabric.IText(t, { left: CW / 2, top: 270, fontFamily: 'DM Sans', fontSize: 11, fill: '#777', textAlign: 'center', originX: 'center', selectable: true, evented: true }));

  add(new fabric.Rect({ left: CW / 2 - 40, top: 295, width: 80, height: 1, fill: '#ccc', selectable: true, evented: true }));

  add(new fabric.IText(e, { left: CW / 2, top: 310, fontFamily: 'DM Sans', fontSize: 10, fill: '#666', textAlign: 'center', originX: 'center', selectable: true, evented: true, _fieldRole: 'email' }));
  add(new fabric.IText(ph + '  |  ' + w, { left: CW / 2, top: 330, fontFamily: 'DM Sans', fontSize: 10, fill: '#888', textAlign: 'center', originX: 'center', selectable: true, evented: true }));
}

function tplBwmodern() {
  var n = userInfo.name || 'DANIEL STARK', t = userInfo.title || 'Creative Technologist';
  var e = userInfo.email || 'daniel@modernstudio.com', ph = userInfo.phone || '+1 (555) 300 7000';
  var w = userInfo.website || 'www.modernstudio.com', co = userInfo.company || 'MODERN STUDIO';
  canvas.setBackgroundColor('#1a1a2e', canvas.renderAll.bind(canvas));

  add(new fabric.Path(
    'M 0 80 Q 180 40 350 100 Q 520 160 700 60',
    { fill: '', stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1.5, selectable: true, evented: true }
  ));
  add(new fabric.Path(
    'M 0 140 Q 200 90 400 160 Q 580 220 700 130',
    { fill: '', stroke: 'rgba(255,255,255,0.06)', strokeWidth: 1, selectable: true, evented: true }
  ));
  add(new fabric.Path(
    'M 0 200 Q 160 160 340 210 Q 530 270 700 190',
    { fill: '', stroke: 'rgba(255,255,255,0.04)', strokeWidth: 1, selectable: true, evented: true }
  ));

  add(new fabric.Polygon(
    [{ x: 30, y: 0 }, { x: 60, y: 20 }, { x: 60, y: 60 }, { x: 30, y: 80 }, { x: 0, y: 60 }, { x: 0, y: 20 }],
    { left: 50, top: 50, fill: 'transparent', stroke: '#ffffff', strokeWidth: 2, selectable: true, evented: true }
  ));
  add(new fabric.Polygon(
    [{ x: 15, y: 0 }, { x: 30, y: 10 }, { x: 30, y: 30 }, { x: 15, y: 40 }, { x: 0, y: 30 }, { x: 0, y: 10 }],
    { left: 65, top: 70, fill: '#ffffff', opacity: 0.2, selectable: true, evented: true }
  ));

  add(new fabric.IText(co.toUpperCase(), { left: 50, top: 160, fontFamily: 'Unbounded', fontSize: 14, fill: '#ffffff', fontWeight: '700', charSpacing: 60, selectable: true, evented: true, _fieldRole: 'company' }));
  add(new fabric.IText('Design \u00B7 Strategy \u00B7 Technology', { left: 52, top: 185, fontFamily: 'DM Sans', fontSize: 9, fill: 'rgba(255,255,255,0.5)', charSpacing: 30, selectable: true, evented: true }));

  add(new fabric.Rect({ left: 370, top: 55, width: 1.5, height: 280, fill: 'rgba(255,255,255,0.15)', selectable: true, evented: true }));

  add(new fabric.IText(n.toUpperCase(), { left: 400, top: 60, fontFamily: 'Unbounded', fontSize: 20, fill: '#ffffff', fontWeight: '700', charSpacing: 50, selectable: true, evented: true, _fieldRole: 'name' }));
  add(new fabric.IText(t, { left: 402, top: 92, fontFamily: 'DM Sans', fontSize: 12, fill: 'rgba(255,255,255,0.7)', charSpacing: 20, selectable: true, evented: true, _fieldRole: 'title' }));

  add(new fabric.Rect({ left: 400, top: 120, width: 60, height: 2, fill: 'rgba(255,255,255,0.3)', selectable: true, evented: true }));

  add(new fabric.IText(ph, { left: 402, top: 148, fontFamily: 'DM Sans', fontSize: 11, fill: 'rgba(255,255,255,0.8)', selectable: true, evented: true, _fieldRole: 'phone' }));
  add(new fabric.IText(e, { left: 402, top: 172, fontFamily: 'DM Sans', fontSize: 11, fill: 'rgba(255,255,255,0.8)', selectable: true, evented: true, _fieldRole: 'email' }));
  add(new fabric.IText(w, { left: 402, top: 196, fontFamily: 'DM Sans', fontSize: 11, fill: 'rgba(255,255,255,0.6)', selectable: true, evented: true, _fieldRole: 'website' }));
}

function tplSlategray() {
  var n = userInfo.name || 'ANNA PRESCOTT', t = userInfo.title || 'Operations Manager';
  var e = userInfo.email || 'anna@slatecorp.com', ph = userInfo.phone || '+1 (555) 200 8000';
  var w = userInfo.website || 'www.slatecorp.com', co = userInfo.company || 'SLATE CORP';
  canvas.setBackgroundColor('#2d3748', canvas.renderAll.bind(canvas));

  add(new fabric.Rect({ left: 30, top: 30, width: CW - 60, height: CH - 60, fill: 'transparent', stroke: 'rgba(255,255,255,0.12)', strokeWidth: 1, rx: 12, ry: 12, selectable: true, evented: true }));

  add(new fabric.Circle({ left: CW / 2 - 28, top: 50, radius: 28, fill: 'rgba(255,255,255,0.1)', stroke: 'rgba(255,255,255,0.3)', strokeWidth: 1.5, selectable: true, evented: true }));
  add(new fabric.IText((co[0] || 'A').toUpperCase(), { left: CW / 2, top: 60, fontFamily: 'Playfair Display', fontSize: 28, fill: '#ffffff', fontWeight: '700', textAlign: 'center', originX: 'center', selectable: true, evented: true }));

  add(new fabric.IText(co.toUpperCase(), { left: CW / 2, top: 120, fontFamily: 'Unbounded', fontSize: 14, fill: '#ffffff', fontWeight: '700', textAlign: 'center', originX: 'center', charSpacing: 80, selectable: true, evented: true, _fieldRole: 'company' }));
  add(new fabric.IText('Reliable \u00B7 Professional \u00B7 Trusted', { left: CW / 2, top: 145, fontFamily: 'DM Sans', fontSize: 9, fill: 'rgba(255,255,255,0.5)', textAlign: 'center', originX: 'center', charSpacing: 30, selectable: true, evented: true }));

  add(new fabric.Line([CW / 2 - 50, 170, CW / 2 + 50, 170], { stroke: 'rgba(255,255,255,0.25)', strokeWidth: 1, selectable: true, evented: true }));

  add(new fabric.IText(n.toUpperCase(), { left: CW / 2, top: 190, fontFamily: 'Josefin Sans', fontSize: 18, fill: '#ffffff', fontWeight: '600', textAlign: 'center', originX: 'center', charSpacing: 60, selectable: true, evented: true, _fieldRole: 'name' }));
  add(new fabric.IText(t, { left: CW / 2, top: 220, fontFamily: 'DM Sans', fontSize: 12, fill: 'rgba(255,255,255,0.65)', textAlign: 'center', originX: 'center', charSpacing: 20, selectable: true, evented: true, _fieldRole: 'title' }));

  add(new fabric.IText(e, { left: CW / 2, top: 260, fontFamily: 'DM Sans', fontSize: 11, fill: 'rgba(255,255,255,0.8)', textAlign: 'center', originX: 'center', selectable: true, evented: true, _fieldRole: 'email' }));
  add(new fabric.IText(ph, { left: CW / 2, top: 284, fontFamily: 'DM Sans', fontSize: 11, fill: 'rgba(255,255,255,0.8)', textAlign: 'center', originX: 'center', selectable: true, evented: true, _fieldRole: 'phone' }));
  add(new fabric.IText(w, { left: CW / 2, top: 308, fontFamily: 'DM Sans', fontSize: 11, fill: 'rgba(255,255,255,0.6)', textAlign: 'center', originX: 'center', selectable: true, evented: true, _fieldRole: 'website' }));

  add(new fabric.Polygon(
    [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 80 }],
    { left: CW - 150, top: CH - 110, fill: 'rgba(255,255,255,0.06)', selectable: true, evented: true }
  ));
  add(new fabric.Polygon(
    [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 50 }],
    { left: CW - 110, top: CH - 80, fill: 'rgba(255,255,255,0.04)', selectable: true, evented: true }
  ));
}

function tplBlankGeneric() {
  canvas.setBackgroundColor('#ffffff', canvas.renderAll.bind(canvas));
}

if (window.cc && cc.modules) cc.modules.register({ id: 'card-builders', parent: 'left-panel.templates.designs', title: 'designs: card-builders', mount: function () {}, unmount: function () {} });
