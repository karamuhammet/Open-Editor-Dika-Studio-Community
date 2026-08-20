/* Module: left-panel/templates/designs/cv — CV/resume templates + thumbs
   FLAT sub-module of designs — functions stay window globals (siblings + the parent
   call them at runtime; load order is irrelevant). Split from the 2290-line FLAT file. */

function tplCvClean() {
  var n = userInfo.name || 'Your Name';
  var t = userInfo.title || 'Professional Title';
  var e = userInfo.email || 'email@example.com';
  var ph = userInfo.phone || '+1 (555) 000 0000';
  canvas.setBackgroundColor('#ffffff', canvas.renderAll.bind(canvas));
  add(new fabric.Rect({ left: 0, top: 0, width: CW * 0.32, height: CH, fill: '#2c3e50', selectable: true, evented: true }));
  add(new fabric.IText(n.toUpperCase(), { left: CW * 0.04, top: CH * 0.04, fontFamily: 'Arial', fontSize: 18, fill: '#ffffff', fontWeight: '700', charSpacing: 40, selectable: true, evented: true }));
  add(new fabric.IText(t, { left: CW * 0.04, top: CH * 0.08, fontFamily: 'Arial', fontSize: 11, fill: 'rgba(255,255,255,0.7)', selectable: true, evented: true }));
  add(new fabric.Rect({ left: CW * 0.04, top: CH * 0.115, width: CW * 0.24, height: 1, fill: 'rgba(255,255,255,0.3)', selectable: true, evented: true }));
  add(new fabric.IText('CONTACT', { left: CW * 0.04, top: CH * 0.14, fontFamily: 'Arial', fontSize: 10, fill: 'rgba(255,255,255,0.5)', charSpacing: 80, selectable: true, evented: true }));
  add(new fabric.IText(e, { left: CW * 0.04, top: CH * 0.175, fontFamily: 'Arial', fontSize: 10, fill: 'rgba(255,255,255,0.85)', selectable: true, evented: true }));
  add(new fabric.IText(ph, { left: CW * 0.04, top: CH * 0.21, fontFamily: 'Arial', fontSize: 10, fill: 'rgba(255,255,255,0.85)', selectable: true, evented: true }));
  add(new fabric.IText('SKILLS', { left: CW * 0.04, top: CH * 0.3, fontFamily: 'Arial', fontSize: 10, fill: 'rgba(255,255,255,0.5)', charSpacing: 80, selectable: true, evented: true }));
  add(new fabric.IText('Skill One\nSkill Two\nSkill Three', { left: CW * 0.04, top: CH * 0.34, fontFamily: 'Arial', fontSize: 10, fill: 'rgba(255,255,255,0.8)', lineHeight: 1.6, selectable: true, evented: true }));
  add(new fabric.IText('EXPERIENCE', { left: CW * 0.38, top: CH * 0.04, fontFamily: 'Arial', fontSize: 14, fill: '#2c3e50', fontWeight: '700', charSpacing: 60, selectable: true, evented: true }));
  add(new fabric.Rect({ left: CW * 0.38, top: CH * 0.07, width: CW * 0.55, height: 2, fill: '#2c3e50', selectable: true, evented: true }));
  add(new fabric.IText('Job Title \u2014 Company Name', { left: CW * 0.38, top: CH * 0.09, fontFamily: 'Arial', fontSize: 12, fill: '#333', fontWeight: '700', selectable: true, evented: true }));
  add(new fabric.IText('2020 \u2014 Present', { left: CW * 0.38, top: CH * 0.115, fontFamily: 'Arial', fontSize: 10, fill: '#999', selectable: true, evented: true }));
  add(new fabric.IText('Description of your role and achievements\nin this position.', { left: CW * 0.38, top: CH * 0.145, fontFamily: 'Arial', fontSize: 10, fill: '#666', lineHeight: 1.5, selectable: true, evented: true }));
  add(new fabric.IText('EDUCATION', { left: CW * 0.38, top: CH * 0.24, fontFamily: 'Arial', fontSize: 14, fill: '#2c3e50', fontWeight: '700', charSpacing: 60, selectable: true, evented: true }));
  add(new fabric.Rect({ left: CW * 0.38, top: CH * 0.27, width: CW * 0.55, height: 2, fill: '#2c3e50', selectable: true, evented: true }));
  add(new fabric.IText('Degree \u2014 University Name', { left: CW * 0.38, top: CH * 0.29, fontFamily: 'Arial', fontSize: 12, fill: '#333', fontWeight: '700', selectable: true, evented: true }));
  add(new fabric.IText('2016 \u2014 2020', { left: CW * 0.38, top: CH * 0.315, fontFamily: 'Arial', fontSize: 10, fill: '#999', selectable: true, evented: true }));
}

function tplCvModern() {
  var n = userInfo.name || 'Your Name';
  var t = userInfo.title || 'Professional Title';
  var e = userInfo.email || 'email@example.com';
  var ph = userInfo.phone || '+1 (555) 000 0000';
  var w = userInfo.website || 'www.yoursite.com';
  canvas.setBackgroundColor('#ffffff', canvas.renderAll.bind(canvas));
  add(new fabric.Rect({ left: 0, top: 0, width: CW, height: CH * 0.18, fill: '#e74c3c', selectable: true, evented: true }));
  add(new fabric.IText(n.toUpperCase(), { left: CW * 0.06, top: CH * 0.04, fontFamily: 'Arial', fontSize: 26, fill: '#ffffff', fontWeight: '700', charSpacing: 50, selectable: true, evented: true }));
  add(new fabric.IText(t, { left: CW * 0.06, top: CH * 0.09, fontFamily: 'Arial', fontSize: 13, fill: 'rgba(255,255,255,0.85)', selectable: true, evented: true }));
  add(new fabric.IText(e + '  |  ' + ph + '  |  ' + w, { left: CW * 0.06, top: CH * 0.135, fontFamily: 'Arial', fontSize: 9, fill: 'rgba(255,255,255,0.7)', selectable: true, evented: true }));
  add(new fabric.IText('EXPERIENCE', { left: CW * 0.06, top: CH * 0.22, fontFamily: 'Arial', fontSize: 14, fill: '#e74c3c', fontWeight: '700', charSpacing: 60, selectable: true, evented: true }));
  add(new fabric.Rect({ left: CW * 0.06, top: CH * 0.255, width: CW * 0.88, height: 1, fill: '#eee', selectable: true, evented: true }));
  add(new fabric.IText('Job Title \u2014 Company Name', { left: CW * 0.06, top: CH * 0.275, fontFamily: 'Arial', fontSize: 12, fill: '#333', fontWeight: '700', selectable: true, evented: true }));
  add(new fabric.IText('2020 \u2014 Present', { left: CW * 0.7, top: CH * 0.275, fontFamily: 'Arial', fontSize: 10, fill: '#999', selectable: true, evented: true }));
  add(new fabric.IText('Description of your role and key achievements.', { left: CW * 0.06, top: CH * 0.305, fontFamily: 'Arial', fontSize: 10, fill: '#666', selectable: true, evented: true }));
  add(new fabric.IText('EDUCATION', { left: CW * 0.06, top: CH * 0.39, fontFamily: 'Arial', fontSize: 14, fill: '#e74c3c', fontWeight: '700', charSpacing: 60, selectable: true, evented: true }));
  add(new fabric.Rect({ left: CW * 0.06, top: CH * 0.425, width: CW * 0.88, height: 1, fill: '#eee', selectable: true, evented: true }));
  add(new fabric.IText('Degree \u2014 University Name', { left: CW * 0.06, top: CH * 0.445, fontFamily: 'Arial', fontSize: 12, fill: '#333', fontWeight: '700', selectable: true, evented: true }));
  add(new fabric.IText('2016 \u2014 2020', { left: CW * 0.7, top: CH * 0.445, fontFamily: 'Arial', fontSize: 10, fill: '#999', selectable: true, evented: true }));
  add(new fabric.IText('SKILLS', { left: CW * 0.06, top: CH * 0.54, fontFamily: 'Arial', fontSize: 14, fill: '#e74c3c', fontWeight: '700', charSpacing: 60, selectable: true, evented: true }));
  add(new fabric.Rect({ left: CW * 0.06, top: CH * 0.575, width: CW * 0.88, height: 1, fill: '#eee', selectable: true, evented: true }));
  add(new fabric.IText('Skill One  \u2022  Skill Two  \u2022  Skill Three  \u2022  Skill Four', { left: CW * 0.06, top: CH * 0.6, fontFamily: 'Arial', fontSize: 11, fill: '#555', selectable: true, evented: true }));
}

function tplCvMinimal() {
  var n = userInfo.name || 'Your Name';
  var t = userInfo.title || 'Professional Title';
  var e = userInfo.email || 'email@example.com';
  var ph = userInfo.phone || '+1 (555) 000 0000';
  canvas.setBackgroundColor('#ffffff', canvas.renderAll.bind(canvas));
  add(new fabric.IText(n, { left: CW / 2, top: CH * 0.05, fontFamily: 'Georgia', fontSize: 36, fill: '#111', fontWeight: '700', textAlign: 'center', originX: 'center', selectable: true, evented: true }));
  add(new fabric.IText(t, { left: CW / 2, top: CH * 0.1, fontFamily: 'Arial', fontSize: 14, fill: '#999', textAlign: 'center', originX: 'center', charSpacing: 40, selectable: true, evented: true }));
  add(new fabric.IText(e + '  |  ' + ph, { left: CW / 2, top: CH * 0.14, fontFamily: 'Arial', fontSize: 10, fill: '#aaa', textAlign: 'center', originX: 'center', selectable: true, evented: true }));
  add(new fabric.Rect({ left: CW * 0.1, top: CH * 0.18, width: CW * 0.8, height: 1, fill: '#ddd', selectable: true, evented: true }));
  add(new fabric.IText('Experience', { left: CW * 0.1, top: CH * 0.22, fontFamily: 'Georgia', fontSize: 18, fill: '#333', fontWeight: '700', selectable: true, evented: true }));
  add(new fabric.IText('Job Title \u2014 Company', { left: CW * 0.1, top: CH * 0.27, fontFamily: 'Arial', fontSize: 12, fill: '#555', selectable: true, evented: true }));
  add(new fabric.IText('2020 \u2014 Present', { left: CW * 0.1, top: CH * 0.3, fontFamily: 'Arial', fontSize: 10, fill: '#aaa', selectable: true, evented: true }));
  add(new fabric.Rect({ left: CW * 0.1, top: CH * 0.36, width: CW * 0.8, height: 1, fill: '#eee', selectable: true, evented: true }));
  add(new fabric.IText('Education', { left: CW * 0.1, top: CH * 0.4, fontFamily: 'Georgia', fontSize: 18, fill: '#333', fontWeight: '700', selectable: true, evented: true }));
  add(new fabric.IText('Degree \u2014 University', { left: CW * 0.1, top: CH * 0.45, fontFamily: 'Arial', fontSize: 12, fill: '#555', selectable: true, evented: true }));
  add(new fabric.IText('2016 \u2014 2020', { left: CW * 0.1, top: CH * 0.48, fontFamily: 'Arial', fontSize: 10, fill: '#aaa', selectable: true, evented: true }));
}

function drawThumbCvClean(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, tw, th);
  ctx.fillStyle = '#2c3e50'; ctx.fillRect(0, 0, tw * 0.3, th);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 6px Arial'; ctx.fillText('NAME', 4, 14);
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '4px Arial'; ctx.fillText('Title', 4, 22);
  ctx.fillStyle = '#2c3e50'; ctx.font = 'bold 6px Arial'; ctx.fillText('EXPERIENCE', tw * 0.35, 14);
  ctx.fillStyle = '#2c3e50'; ctx.fillRect(tw * 0.35, 17, tw * 0.55, 1);
  ctx.fillStyle = '#666'; ctx.font = '4px Arial';
  ctx.fillText('Job Title \u2014 Company', tw * 0.35, 26);
  ctx.fillText('2020 \u2014 Present', tw * 0.35, 34);
}

function drawThumbCvModern(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, tw, th);
  ctx.fillStyle = '#e74c3c'; ctx.fillRect(0, 0, tw, th * 0.2);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 7px Arial'; ctx.fillText('YOUR NAME', 6, th * 0.12);
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '4px Arial'; ctx.fillText('Professional Title', 6, th * 0.18);
  ctx.fillStyle = '#e74c3c'; ctx.font = 'bold 5px Arial'; ctx.fillText('EXPERIENCE', 6, th * 0.32);
  ctx.fillStyle = '#eee'; ctx.fillRect(6, th * 0.35, tw - 12, 0.5);
  ctx.fillStyle = '#333'; ctx.font = '4px Arial'; ctx.fillText('Job Title \u2014 Company', 6, th * 0.44);
}

function drawThumbCvMinimal(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, tw, th);
  ctx.fillStyle = '#111'; ctx.font = 'bold 9px Georgia'; ctx.textAlign = 'center';
  ctx.fillText('Your Name', tw / 2, th * 0.2);
  ctx.fillStyle = '#999'; ctx.font = '5px Arial';
  ctx.fillText('Professional Title', tw / 2, th * 0.32);
  ctx.fillStyle = '#ddd'; ctx.fillRect(tw * 0.2, th * 0.4, tw * 0.6, 0.5);
  ctx.fillStyle = '#333'; ctx.font = 'bold 5px Georgia'; ctx.textAlign = 'left';
  ctx.fillText('Experience', tw * 0.15, th * 0.55);
  ctx.fillStyle = '#555'; ctx.font = '4px Arial';
  ctx.fillText('Job Title \u2014 Company', tw * 0.15, th * 0.66);
}

if (window.cc && cc.modules) cc.modules.register({ id: 'cv', parent: 'left-panel.templates.designs', title: 'designs: cv', mount: function () {}, unmount: function () {} });
