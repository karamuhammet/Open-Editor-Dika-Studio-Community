/* Module: left-panel/templates/designs/logo — logo templates + thumbs
   FLAT sub-module of designs — functions stay window globals (siblings + the parent
   call them at runtime; load order is irrelevant). Split from the 2290-line FLAT file. */

function tplLogoMinimal() {
  var co = userInfo.company || 'BRAND';
  var initial = (co[0] || 'B').toUpperCase();
  canvas.setBackgroundColor('#ffffff', canvas.renderAll.bind(canvas));
  add(new fabric.Circle({ left: CW / 2, top: CH * 0.35, radius: CW * 0.18, fill: '#2d3436', originX: 'center', originY: 'center', selectable: true, evented: true }));
  add(new fabric.IText(initial, { left: CW / 2, top: CH * 0.35, fontFamily: 'Georgia', fontSize: CW * 0.16, fill: '#ffffff', fontWeight: '700', textAlign: 'center', originX: 'center', originY: 'center', selectable: true, evented: true }));
  add(new fabric.Rect({ left: CW * 0.3, top: CH * 0.62, width: CW * 0.4, height: 1, fill: '#e0e0e0', selectable: true, evented: true }));
  add(new fabric.IText(co.toUpperCase(), { left: CW / 2, top: CH * 0.7, fontFamily: 'Arial', fontSize: CW * 0.055, fill: '#2d3436', fontWeight: '700', textAlign: 'center', originX: 'center', charSpacing: 150, selectable: true, evented: true }));
}

function tplLogoMonogram() {
  var co = userInfo.company || 'BRAND STUDIO';
  var words = co.split(' ');
  var i1 = (words[0] || 'B')[0].toUpperCase();
  var i2 = (words.length > 1 ? words[1] : words[0])[0].toUpperCase();
  canvas.setBackgroundColor('#1a1a2e', canvas.renderAll.bind(canvas));
  add(new fabric.Circle({ left: CW / 2, top: CH * 0.42, radius: CW * 0.22, fill: 'transparent', stroke: 'rgba(255,255,255,0.15)', strokeWidth: 2, originX: 'center', originY: 'center', selectable: true, evented: true }));
  add(new fabric.IText(i1, { left: CW * 0.42, top: CH * 0.3, fontFamily: 'Georgia', fontSize: CW * 0.22, fill: '#ffffff', fontWeight: '700', selectable: true, evented: true }));
  add(new fabric.IText(i2, { left: CW * 0.52, top: CH * 0.38, fontFamily: 'Georgia', fontSize: CW * 0.22, fill: '#f2ff58', fontWeight: '700', opacity: 0.75, selectable: true, evented: true }));
  add(new fabric.IText(co.toUpperCase(), { left: CW / 2, top: CH * 0.76, fontFamily: 'Arial', fontSize: CW * 0.035, fill: 'rgba(255,255,255,0.5)', textAlign: 'center', originX: 'center', charSpacing: 200, selectable: true, evented: true }));
}

function tplLogoBadge() {
  var co = userInfo.company || 'COFFEE HOUSE';
  canvas.setBackgroundColor('#f5f0eb', canvas.renderAll.bind(canvas));
  add(new fabric.Circle({ left: CW / 2, top: CH * 0.42, radius: CW * 0.24, fill: 'transparent', stroke: '#2d3436', strokeWidth: 3, originX: 'center', originY: 'center', selectable: true, evented: true }));
  add(new fabric.Circle({ left: CW / 2, top: CH * 0.42, radius: CW * 0.2, fill: 'transparent', stroke: '#2d3436', strokeWidth: 1, originX: 'center', originY: 'center', selectable: true, evented: true }));
  add(new fabric.IText(co.toUpperCase(), { left: CW / 2, top: CH * 0.42, fontFamily: 'Georgia', fontSize: CW * 0.05, fill: '#2d3436', fontWeight: '700', textAlign: 'center', originX: 'center', originY: 'center', charSpacing: 60, selectable: true, evented: true }));
  add(new fabric.Circle({ left: CW / 2 - CW * 0.1, top: CH * 0.42, radius: 3, fill: '#2d3436', originX: 'center', originY: 'center', selectable: true, evented: true }));
  add(new fabric.Circle({ left: CW / 2 + CW * 0.1, top: CH * 0.42, radius: 3, fill: '#2d3436', originX: 'center', originY: 'center', selectable: true, evented: true }));
  add(new fabric.IText('EST. 2024', { left: CW / 2, top: CH * 0.52, fontFamily: 'Arial', fontSize: CW * 0.028, fill: '#888', textAlign: 'center', originX: 'center', charSpacing: 150, selectable: true, evented: true }));
  add(new fabric.IText('PREMIUM QUALITY', { left: CW / 2, top: CH * 0.78, fontFamily: 'Arial', fontSize: CW * 0.03, fill: '#aaa', textAlign: 'center', originX: 'center', charSpacing: 200, selectable: true, evented: true }));
}

function tplLogoModern() {
  var co = userInfo.company || 'NEXUS';
  canvas.setBackgroundColor('#ffffff', canvas.renderAll.bind(canvas));
  add(new fabric.Polygon(
    [{ x: 0, y: -50 }, { x: 50, y: 0 }, { x: 0, y: 50 }, { x: -50, y: 0 }],
    { left: CW * 0.35, top: CH * 0.32, fill: '#e74c3c', originX: 'center', originY: 'center', scaleX: CW / 350, scaleY: CW / 350, selectable: true, evented: true }
  ));
  add(new fabric.Polygon(
    [{ x: 0, y: -25 }, { x: 25, y: 0 }, { x: 0, y: 25 }, { x: -25, y: 0 }],
    { left: CW * 0.48, top: CH * 0.38, fill: '#3498db', originX: 'center', originY: 'center', scaleX: CW / 350, scaleY: CW / 350, opacity: 0.85, selectable: true, evented: true }
  ));
  add(new fabric.IText(co.toUpperCase(), { left: CW / 2, top: CH * 0.6, fontFamily: 'Arial', fontSize: CW * 0.09, fill: '#2c3e50', fontWeight: '700', textAlign: 'center', originX: 'center', charSpacing: 80, selectable: true, evented: true }));
  add(new fabric.IText('Innovation Forward', { left: CW / 2, top: CH * 0.72, fontFamily: 'Georgia', fontSize: CW * 0.038, fill: '#95a5a6', fontStyle: 'italic', textAlign: 'center', originX: 'center', selectable: true, evented: true }));
}

function drawThumbLogoMinimal(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  var co = userInfo.company || 'BRAND';
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, tw, th);
  ctx.fillStyle = '#2d3436';
  ctx.beginPath(); ctx.arc(tw / 2, th * 0.38, th * 0.22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 16px Georgia'; ctx.textAlign = 'center';
  ctx.fillText((co[0] || 'B').toUpperCase(), tw / 2, th * 0.44);
  ctx.fillStyle = '#e0e0e0'; ctx.fillRect(tw * 0.3, th * 0.62, tw * 0.4, 1);
  ctx.fillStyle = '#2d3436'; ctx.font = 'bold 7px Arial';
  ctx.fillText(co.toUpperCase(), tw / 2, th * 0.76);
  ctx.textAlign = 'left';
}

function drawThumbLogoMonogram(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  var co = userInfo.company || 'BRAND STUDIO';
  var words = co.split(' ');
  var i1 = (words[0] || 'B')[0].toUpperCase();
  var i2 = (words.length > 1 ? words[1] : words[0])[0].toUpperCase();
  ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, tw, th);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(tw / 2, th * 0.42, th * 0.28, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 22px Georgia';
  ctx.fillText(i1, tw * 0.35, th * 0.48);
  ctx.fillStyle = '#f2ff58'; ctx.globalAlpha = 0.75;
  ctx.fillText(i2, tw * 0.48, th * 0.52);
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '5px Arial'; ctx.textAlign = 'center';
  ctx.fillText(co.toUpperCase(), tw / 2, th * 0.82);
  ctx.textAlign = 'left';
}

function drawThumbLogoBadge(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  var co = userInfo.company || 'COFFEE HOUSE';
  ctx.fillStyle = '#f5f0eb'; ctx.fillRect(0, 0, tw, th);
  ctx.strokeStyle = '#2d3436'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(tw / 2, th * 0.42, th * 0.3, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.arc(tw / 2, th * 0.42, th * 0.24, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#2d3436'; ctx.font = 'bold 7px Georgia'; ctx.textAlign = 'center';
  ctx.fillText(co.toUpperCase(), tw / 2, th * 0.45);
  ctx.fillStyle = '#888'; ctx.font = '5px Arial';
  ctx.fillText('EST. 2024', tw / 2, th * 0.56);
  ctx.textAlign = 'left';
}

function drawThumbLogoModern(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  var co = userInfo.company || 'NEXUS';
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, tw, th);
  ctx.fillStyle = '#e74c3c';
  ctx.save(); ctx.translate(tw * 0.35, th * 0.32); ctx.rotate(Math.PI / 4);
  ctx.fillRect(-10, -10, 20, 20); ctx.restore();
  ctx.fillStyle = '#3498db'; ctx.globalAlpha = 0.85;
  ctx.save(); ctx.translate(tw * 0.48, th * 0.35); ctx.rotate(Math.PI / 4);
  ctx.fillRect(-6, -6, 12, 12); ctx.restore();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#2c3e50'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center';
  ctx.fillText(co.toUpperCase(), tw / 2, th * 0.68);
  ctx.fillStyle = '#95a5a6'; ctx.font = 'italic 6px Georgia';
  ctx.fillText('Innovation Forward', tw / 2, th * 0.82);
  ctx.textAlign = 'left';
}

if (window.cc && cc.modules) cc.modules.register({ id: 'logo', parent: 'left-panel.templates.designs', title: 'designs: logo', mount: function () {}, unmount: function () {} });
