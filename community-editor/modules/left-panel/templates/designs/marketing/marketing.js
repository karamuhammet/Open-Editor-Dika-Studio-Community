/* Module: left-panel/templates/designs/marketing — social/story/banner/email templates + thumbs
   FLAT sub-module of designs — functions stay window globals (siblings + the parent
   call them at runtime; load order is irrelevant). Split from the 2290-line FLAT file. */

function tplSocialQuote() {
  var n = userInfo.name || 'Your Name';
  canvas.setBackgroundColor('#1a535c', canvas.renderAll.bind(canvas));
  add(new fabric.IText('\u201C', { left: CW * 0.08, top: CH * 0.08, fontFamily: 'Georgia', fontSize: CW * 0.25, fill: 'rgba(255,255,255,0.12)', selectable: true, evented: true }));
  add(new fabric.IText('Your inspiring quote\ngoes right here.', { left: CW / 2, top: CH * 0.38, fontFamily: 'Georgia', fontSize: CW * 0.055, fill: '#ffffff', fontStyle: 'italic', textAlign: 'center', originX: 'center', lineHeight: 1.5, selectable: true, evented: true }));
  add(new fabric.Rect({ left: CW / 2 - CW * 0.05, top: CH * 0.58, width: CW * 0.1, height: 3, fill: '#f2ff58', selectable: true, evented: true }));
  add(new fabric.IText('\u2014 ' + n.toUpperCase(), { left: CW / 2, top: CH * 0.64, fontFamily: 'Arial', fontSize: CW * 0.028, fill: 'rgba(255,255,255,0.7)', textAlign: 'center', originX: 'center', charSpacing: 100, selectable: true, evented: true }));
}

function tplSocialPromo() {
  var co = userInfo.company || 'Your Brand';
  canvas.setBackgroundColor('#e74c3c', canvas.renderAll.bind(canvas));
  add(new fabric.IText('50%\nOFF', { left: CW / 2, top: CH * 0.22, fontFamily: 'Arial', fontSize: CW * 0.16, fill: '#ffffff', fontWeight: '700', textAlign: 'center', originX: 'center', lineHeight: 1.1, selectable: true, evented: true }));
  add(new fabric.Rect({ left: CW * 0.2, top: CH * 0.55, width: CW * 0.6, height: 3, fill: 'rgba(255,255,255,0.4)', selectable: true, evented: true }));
  add(new fabric.IText('LIMITED TIME OFFER', { left: CW / 2, top: CH * 0.62, fontFamily: 'Arial', fontSize: CW * 0.04, fill: 'rgba(255,255,255,0.9)', textAlign: 'center', originX: 'center', charSpacing: 120, selectable: true, evented: true }));
  add(new fabric.Rect({ left: CW * 0.25, top: CH * 0.74, width: CW * 0.5, height: CH * 0.07, fill: '#ffffff', rx: 6, ry: 6, selectable: true, evented: true }));
  add(new fabric.IText('SHOP NOW', { left: CW / 2, top: CH * 0.76, fontFamily: 'Arial', fontSize: CW * 0.035, fill: '#e74c3c', fontWeight: '700', textAlign: 'center', originX: 'center', selectable: true, evented: true }));
  add(new fabric.IText(co.toUpperCase(), { left: CW / 2, top: CH * 0.9, fontFamily: 'Arial', fontSize: CW * 0.025, fill: 'rgba(255,255,255,0.6)', textAlign: 'center', originX: 'center', charSpacing: 100, selectable: true, evented: true }));
}

function tplSocialMinimal() {
  var co = userInfo.company || 'Your Brand';
  var w = userInfo.website || 'www.yourbrand.com';
  canvas.setBackgroundColor('#f8f9fa', canvas.renderAll.bind(canvas));
  add(new fabric.Rect({ left: 0, top: 0, width: CW, height: CH * 0.015, fill: '#2d3436', selectable: true, evented: true }));
  add(new fabric.IText(co.toUpperCase(), { left: CW / 2, top: CH * 0.12, fontFamily: 'Arial', fontSize: CW * 0.05, fill: '#2d3436', fontWeight: '700', textAlign: 'center', originX: 'center', charSpacing: 100, selectable: true, evented: true }));
  add(new fabric.Rect({ left: CW * 0.35, top: CH * 0.2, width: CW * 0.3, height: 1, fill: '#ddd', selectable: true, evented: true }));
  add(new fabric.IText('Your Message\nGoes Here', { left: CW / 2, top: CH * 0.4, fontFamily: 'Georgia', fontSize: CW * 0.065, fill: '#333', textAlign: 'center', originX: 'center', lineHeight: 1.4, selectable: true, evented: true }));
  add(new fabric.IText('Share something meaningful', { left: CW / 2, top: CH * 0.6, fontFamily: 'Arial', fontSize: CW * 0.03, fill: '#999', textAlign: 'center', originX: 'center', selectable: true, evented: true }));
  add(new fabric.Rect({ left: 0, top: CH * 0.88, width: CW, height: CH * 0.12, fill: '#2d3436', selectable: true, evented: true }));
  add(new fabric.IText(w, { left: CW / 2, top: CH * 0.92, fontFamily: 'Arial', fontSize: CW * 0.025, fill: 'rgba(255,255,255,0.7)', textAlign: 'center', originX: 'center', selectable: true, evented: true }));
}

function drawThumbSocialQuote(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  ctx.fillStyle = '#1a535c'; ctx.fillRect(0, 0, tw, th);
  ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.font = 'bold 40px Georgia';
  ctx.fillText('\u201C', tw * 0.06, th * 0.4);
  ctx.fillStyle = '#fff'; ctx.font = 'italic 8px Georgia'; ctx.textAlign = 'center';
  ctx.fillText('Your inspiring quote', tw / 2, th * 0.5);
  ctx.fillStyle = '#f2ff58'; ctx.fillRect(tw / 2 - 8, th * 0.62, 16, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '5px Arial';
  ctx.fillText('\u2014 YOUR NAME', tw / 2, th * 0.76);
  ctx.textAlign = 'left';
}

function drawThumbSocialPromo(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  ctx.fillStyle = '#e74c3c'; ctx.fillRect(0, 0, tw, th);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 18px Arial'; ctx.textAlign = 'center';
  ctx.fillText('50%', tw / 2, th * 0.35);
  ctx.fillText('OFF', tw / 2, th * 0.52);
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '5px Arial';
  ctx.fillText('LIMITED TIME OFFER', tw / 2, th * 0.7);
  ctx.fillStyle = '#fff'; ctx.fillRect(tw * 0.25, th * 0.78, tw * 0.5, th * 0.1);
  ctx.fillStyle = '#e74c3c'; ctx.font = 'bold 5px Arial';
  ctx.fillText('SHOP NOW', tw / 2, th * 0.86);
  ctx.textAlign = 'left';
}

function drawThumbSocialMinimal(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  ctx.fillStyle = '#f8f9fa'; ctx.fillRect(0, 0, tw, th);
  ctx.fillStyle = '#2d3436'; ctx.fillRect(0, 0, tw, 2);
  ctx.fillStyle = '#2d3436'; ctx.font = 'bold 7px Arial'; ctx.textAlign = 'center';
  ctx.fillText('YOUR BRAND', tw / 2, th * 0.22);
  ctx.fillStyle = '#ddd'; ctx.fillRect(tw * 0.35, th * 0.3, tw * 0.3, 0.5);
  ctx.fillStyle = '#333'; ctx.font = '8px Georgia';
  ctx.fillText('Your Message', tw / 2, th * 0.52);
  ctx.fillStyle = '#2d3436'; ctx.fillRect(0, th * 0.85, tw, th * 0.15);
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '4px Arial';
  ctx.fillText('www.yourbrand.com', tw / 2, th * 0.94);
  ctx.textAlign = 'left';
}

function tplStoryGradient() {
  var co = userInfo.company || 'Your Brand';
  canvas.setBackgroundColor('#6c3483', canvas.renderAll.bind(canvas));
  add(new fabric.Rect({ left: 0, top: 0, width: CW, height: CH * 0.4, fill: 'rgba(0,0,0,0.15)', selectable: true, evented: true }));
  add(new fabric.Rect({ left: 0, top: CH * 0.7, width: CW, height: CH * 0.3, fill: 'rgba(0,0,0,0.2)', selectable: true, evented: true }));
  add(new fabric.IText('YOUR\nSTORY', { left: CW / 2, top: CH * 0.35, fontFamily: 'Arial', fontSize: CW * 0.14, fill: '#ffffff', fontWeight: '700', textAlign: 'center', originX: 'center', lineHeight: 1.2, charSpacing: 60, selectable: true, evented: true }));
  add(new fabric.Rect({ left: CW / 2 - CW * 0.08, top: CH * 0.5, width: CW * 0.16, height: 3, fill: '#f2ff58', selectable: true, evented: true }));
  add(new fabric.IText('Tap to learn more', { left: CW / 2, top: CH * 0.55, fontFamily: 'Arial', fontSize: CW * 0.035, fill: 'rgba(255,255,255,0.7)', textAlign: 'center', originX: 'center', selectable: true, evented: true }));
  add(new fabric.IText(co.toUpperCase(), { left: CW / 2, top: CH * 0.88, fontFamily: 'Arial', fontSize: CW * 0.03, fill: 'rgba(255,255,255,0.5)', textAlign: 'center', originX: 'center', charSpacing: 150, selectable: true, evented: true }));
}

function tplStoryBold() {
  var co = userInfo.company || 'Your Brand';
  canvas.setBackgroundColor('#0a0a0a', canvas.renderAll.bind(canvas));
  add(new fabric.IText(co.toUpperCase(), { left: CW * 0.1, top: CH * 0.04, fontFamily: 'Arial', fontSize: CW * 0.03, fill: 'rgba(255,255,255,0.3)', charSpacing: 100, selectable: true, evented: true }));
  add(new fabric.IText('MAKE\nIT\nBOLD', { left: CW * 0.1, top: CH * 0.25, fontFamily: 'Arial', fontSize: CW * 0.18, fill: '#ffffff', fontWeight: '700', lineHeight: 1.1, selectable: true, evented: true }));
  add(new fabric.Rect({ left: CW * 0.1, top: CH * 0.58, width: CW * 0.25, height: 4, fill: '#e74c3c', selectable: true, evented: true }));
  add(new fabric.IText('Your subtitle message\ngoes right here', { left: CW * 0.1, top: CH * 0.63, fontFamily: 'Arial', fontSize: CW * 0.04, fill: 'rgba(255,255,255,0.6)', lineHeight: 1.5, selectable: true, evented: true }));
  add(new fabric.IText('SWIPE UP', { left: CW / 2, top: CH * 0.9, fontFamily: 'Arial', fontSize: CW * 0.03, fill: 'rgba(255,255,255,0.4)', textAlign: 'center', originX: 'center', charSpacing: 150, selectable: true, evented: true }));
}

function drawThumbStoryGradient(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  ctx.fillStyle = '#6c3483'; ctx.fillRect(0, 0, tw, th);
  ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(0, 0, tw, th * 0.4);
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(0, th * 0.7, tw, th * 0.3);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center';
  ctx.fillText('YOUR', tw / 2, th * 0.4);
  ctx.fillText('STORY', tw / 2, th * 0.54);
  ctx.fillStyle = '#f2ff58'; ctx.fillRect(tw / 2 - 10, th * 0.62, 20, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '5px Arial';
  ctx.fillText('Tap to learn more', tw / 2, th * 0.74);
  ctx.textAlign = 'left';
}

function drawThumbStoryBold(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, tw, th);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Arial';
  ctx.fillText('MAKE', tw * 0.1, th * 0.35);
  ctx.fillText('IT', tw * 0.1, th * 0.5);
  ctx.fillText('BOLD', tw * 0.1, th * 0.65);
  ctx.fillStyle = '#e74c3c'; ctx.fillRect(tw * 0.1, th * 0.72, tw * 0.2, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '5px Arial'; ctx.textAlign = 'center';
  ctx.fillText('SWIPE UP', tw / 2, th * 0.92);
  ctx.textAlign = 'left';
}

function tplBannerClean() {
  var co = userInfo.company || 'Your Company';
  var w = userInfo.website || 'www.yoursite.com';
  canvas.setBackgroundColor('#ffffff', canvas.renderAll.bind(canvas));
  add(new fabric.Rect({ left: 0, top: 0, width: CW, height: 5, fill: '#2c3e50', selectable: true, evented: true }));
  add(new fabric.IText(co.toUpperCase(), { left: CW * 0.06, top: CH * 0.2, fontFamily: 'Arial', fontSize: 28, fill: '#2c3e50', fontWeight: '700', charSpacing: 60, selectable: true, evented: true }));
  add(new fabric.IText('Your professional tagline goes here', { left: CW * 0.06, top: CH * 0.4, fontFamily: 'Georgia', fontSize: 16, fill: '#777', fontStyle: 'italic', selectable: true, evented: true }));
  add(new fabric.Rect({ left: CW * 0.06, top: CH * 0.58, width: CW * 0.15, height: 2, fill: '#2c3e50', selectable: true, evented: true }));
  add(new fabric.IText(w, { left: CW * 0.06, top: CH * 0.68, fontFamily: 'Arial', fontSize: 13, fill: '#aaa', selectable: true, evented: true }));
  add(new fabric.Rect({ left: CW * 0.7, top: CH * 0.15, width: CW * 0.24, height: CH * 0.7, fill: '#f5f5f5', rx: 4, ry: 4, selectable: true, evented: true }));
  add(new fabric.IText('YOUR\nIMAGE', { left: CW * 0.82, top: CH * 0.42, fontFamily: 'Arial', fontSize: 14, fill: '#ccc', textAlign: 'center', originX: 'center', originY: 'center', lineHeight: 1.4, selectable: true, evented: true }));
}

function tplBannerBold() {
  var co = userInfo.company || 'Your Company';
  canvas.setBackgroundColor('#2c3e50', canvas.renderAll.bind(canvas));
  add(new fabric.Rect({ left: CW * 0.75, top: -CH * 0.2, width: CW * 0.4, height: CH * 1.4, fill: 'rgba(255,255,255,0.08)', angle: -15, selectable: true, evented: true }));
  add(new fabric.Rect({ left: CW * 0.85, top: -CH * 0.2, width: CW * 0.15, height: CH * 1.4, fill: 'rgba(255,255,255,0.05)', angle: -15, selectable: true, evented: true }));
  add(new fabric.IText('WELCOME', { left: CW * 0.06, top: CH * 0.18, fontFamily: 'Arial', fontSize: 42, fill: '#ffffff', fontWeight: '700', charSpacing: 80, selectable: true, evented: true }));
  add(new fabric.IText('Your message to the world', { left: CW * 0.06, top: CH * 0.44, fontFamily: 'Georgia', fontSize: 18, fill: 'rgba(255,255,255,0.7)', fontStyle: 'italic', selectable: true, evented: true }));
  add(new fabric.Rect({ left: CW * 0.06, top: CH * 0.62, width: CW * 0.12, height: 3, fill: '#e74c3c', selectable: true, evented: true }));
  add(new fabric.IText(co.toUpperCase(), { left: CW * 0.06, top: CH * 0.74, fontFamily: 'Arial', fontSize: 12, fill: 'rgba(255,255,255,0.5)', charSpacing: 100, selectable: true, evented: true }));
}

function drawThumbBannerClean(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, tw, th);
  ctx.fillStyle = '#2c3e50'; ctx.fillRect(0, 0, tw, 2);
  ctx.fillStyle = '#2c3e50'; ctx.font = 'bold 9px Arial';
  ctx.fillText('YOUR COMPANY', tw * 0.06, th * 0.35);
  ctx.fillStyle = '#777'; ctx.font = 'italic 6px Georgia';
  ctx.fillText('Your tagline goes here', tw * 0.06, th * 0.55);
  ctx.fillStyle = '#f5f5f5'; ctx.fillRect(tw * 0.68, th * 0.15, tw * 0.26, th * 0.7);
  ctx.fillStyle = '#ccc'; ctx.font = '6px Arial'; ctx.textAlign = 'center';
  ctx.fillText('IMAGE', tw * 0.81, th * 0.54);
  ctx.textAlign = 'left';
}

function drawThumbBannerBold(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  ctx.fillStyle = '#2c3e50'; ctx.fillRect(0, 0, tw, th);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.save(); ctx.translate(tw * 0.75, -5); ctx.rotate(-0.25);
  ctx.fillRect(0, 0, tw * 0.3, th * 1.5); ctx.restore();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Arial';
  ctx.fillText('WELCOME', tw * 0.06, th * 0.38);
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = 'italic 6px Georgia';
  ctx.fillText('Your message to the world', tw * 0.06, th * 0.56);
  ctx.fillStyle = '#e74c3c'; ctx.fillRect(tw * 0.06, th * 0.68, tw * 0.12, 2);
}

/* ── EMAIL templates — full email bodies (600×900), professional ready-made layouts ── */

function tplEmailNewsletter() {
  var co = userInfo.company || 'STUDIO';
  var w = userInfo.website || 'www.studio.co';
  canvas.setBackgroundColor('#ffffff', canvas.renderAll.bind(canvas));
  add(new fabric.Rect({ left: 0, top: 0, width: CW, height: 290, fill: '#13243d', selectable: true, evented: true }));
  add(new fabric.Circle({ left: CW - 70, top: -90, radius: 150, fill: 'rgba(201,162,39,0.16)', selectable: true, evented: true }));
  add(new fabric.Circle({ left: CW - 30, top: 60, radius: 90, fill: 'rgba(201,162,39,0.10)', selectable: true, evented: true }));
  add(new fabric.Circle({ left: CW - 170, top: 20, radius: 6, fill: '#c9a227', selectable: true, evented: true }));
  add(new fabric.Circle({ left: CW - 120, top: 200, radius: 4, fill: 'rgba(255,255,255,0.4)', selectable: true, evented: true }));
  add(new fabric.IText(co.toUpperCase(), { left: 56, top: 54, fontFamily: 'Unbounded', fontSize: 15, fill: '#ffffff', fontWeight: '700', charSpacing: 140, selectable: true, evented: true }));
  add(new fabric.IText('ISSUE 12  ·  JUNE', { left: 56, top: 120, fontFamily: 'DM Sans', fontSize: 11, fill: '#c9a227', charSpacing: 200, selectable: true, evented: true }));
  add(new fabric.IText('The Monthly Edit', { left: 54, top: 144, fontFamily: 'Playfair Display', fontSize: 44, fill: '#ffffff', fontWeight: '700', selectable: true, evented: true }));
  add(new fabric.IText('Design, ideas & what we’re reading.', { left: 56, top: 220, fontFamily: 'Cormorant Garamond', fontSize: 19, fill: 'rgba(255,255,255,0.72)', fontStyle: 'italic', selectable: true, evented: true }));
  add(new fabric.IText('FEATURED', { left: 56, top: 330, fontFamily: 'DM Sans', fontSize: 10, fill: '#c9a227', fontWeight: '700', charSpacing: 220, selectable: true, evented: true }));
  add(new fabric.Textbox('Designing calm into a noisy world', { left: 56, top: 350, width: CW - 112, fontFamily: 'Playfair Display', fontSize: 29, fill: '#13243d', fontWeight: '700', lineHeight: 1.1, selectable: true, evented: true }));
  add(new fabric.Textbox('Restraint is the new luxury. This month, how the best teams strip back to let the work breathe — and why it quietly converts better, too.', { left: 56, top: 428, width: CW - 112, fontFamily: 'DM Sans', fontSize: 13.5, fill: '#5a6472', lineHeight: 1.7, selectable: true, evented: true }));
  add(new fabric.IText('Read the story  →', { left: 56, top: 512, fontFamily: 'DM Sans', fontSize: 13, fill: '#c9a227', fontWeight: '700', selectable: true, evented: true }));
  add(new fabric.Rect({ left: 56, top: 560, width: CW - 112, height: 1, fill: '#ece7dd', selectable: true, evented: true }));
  add(new fabric.Rect({ left: CW / 2, top: 560, width: 9, height: 9, fill: '#c9a227', angle: 45, originX: 'center', originY: 'center', selectable: true, evented: true }));
  add(new fabric.IText('ALSO IN THIS ISSUE', { left: 56, top: 588, fontFamily: 'DM Sans', fontSize: 10, fill: '#9aa3af', fontWeight: '700', charSpacing: 170, selectable: true, evented: true }));
  add(new fabric.Rect({ left: 59, top: 625, width: 7, height: 7, fill: '#c9a227', angle: 45, originX: 'center', originY: 'center', selectable: true, evented: true }));
  add(new fabric.IText('The five fonts we keep coming back to', { left: 78, top: 614, fontFamily: 'Cormorant Garamond', fontSize: 20, fill: '#13243d', fontWeight: '600', selectable: true, evented: true }));
  add(new fabric.Rect({ left: 59, top: 663, width: 7, height: 7, fill: '#c9a227', angle: 45, originX: 'center', originY: 'center', selectable: true, evented: true }));
  add(new fabric.IText('A studio tour: where the work happens', { left: 78, top: 652, fontFamily: 'Cormorant Garamond', fontSize: 20, fill: '#13243d', fontWeight: '600', selectable: true, evented: true }));
  add(new fabric.Rect({ left: 56, top: 710, width: 210, height: 52, fill: '#13243d', selectable: true, evented: true }));
  add(new fabric.IText('Read the full issue  →', { left: 161, top: 727, fontFamily: 'DM Sans', fontSize: 13, fill: '#ffffff', fontWeight: '700', textAlign: 'center', originX: 'center', selectable: true, evented: true }));
  add(new fabric.Rect({ left: 0, top: 812, width: CW, height: 88, fill: '#f6f2ea', selectable: true, evented: true }));
  add(new fabric.Circle({ left: 56, top: 836, radius: 13, fill: '#13243d', selectable: true, evented: true }));
  add(new fabric.Circle({ left: 90, top: 836, radius: 13, fill: '#13243d', selectable: true, evented: true }));
  add(new fabric.Circle({ left: 124, top: 836, radius: 13, fill: '#13243d', selectable: true, evented: true }));
  add(new fabric.IText(co + '  ·  ' + w, { left: 56, top: 872, fontFamily: 'DM Sans', fontSize: 10.5, fill: '#8a93a0', selectable: true, evented: true }));
  add(new fabric.IText('Unsubscribe', { left: CW - 116, top: 872, fontFamily: 'DM Sans', fontSize: 10.5, fill: '#aeb4bd', selectable: true, evented: true }));
}

function tplEmailPromo() {
  var co = userInfo.company || 'YOUR BRAND';
  canvas.setBackgroundColor('#fff7f4', canvas.renderAll.bind(canvas));
  add(new fabric.Rect({ left: 0, top: 0, width: CW, height: 56, fill: '#1b1b1f', selectable: true, evented: true }));
  add(new fabric.IText(co.toUpperCase(), { left: CW / 2, top: 21, fontFamily: 'Unbounded', fontSize: 14, fill: '#ffffff', fontWeight: '700', textAlign: 'center', originX: 'center', charSpacing: 140, selectable: true, evented: true }));
  add(new fabric.Rect({ left: 0, top: 56, width: CW, height: 420, fill: '#ef5b3b', selectable: true, evented: true }));
  add(new fabric.Circle({ left: -70, top: 320, radius: 130, fill: 'rgba(255,255,255,0.10)', selectable: true, evented: true }));
  add(new fabric.Circle({ left: CW - 90, top: 70, radius: 80, fill: 'rgba(255,255,255,0.08)', selectable: true, evented: true }));
  add(new fabric.Rect({ left: CW / 2, top: 235, width: 150, height: 150, fill: 'rgba(255,255,255,0.12)', angle: 45, originX: 'center', originY: 'center', selectable: true, evented: true }));
  add(new fabric.IText('SUMMER SALE', { left: CW / 2, top: 104, fontFamily: 'DM Sans', fontSize: 14, fill: 'rgba(255,255,255,0.9)', fontWeight: '700', textAlign: 'center', originX: 'center', charSpacing: 240, selectable: true, evented: true }));
  add(new fabric.IText('30%', { left: CW / 2, top: 150, fontFamily: 'Unbounded', fontSize: 110, fill: '#ffffff', fontWeight: '700', textAlign: 'center', originX: 'center', selectable: true, evented: true }));
  add(new fabric.IText('OFF EVERYTHING', { left: CW / 2, top: 300, fontFamily: 'DM Sans', fontSize: 15, fill: '#ffffff', fontWeight: '700', textAlign: 'center', originX: 'center', charSpacing: 120, selectable: true, evented: true }));
  add(new fabric.IText('Ends Sunday at midnight', { left: CW / 2, top: 330, fontFamily: 'Cormorant Garamond', fontSize: 17, fill: 'rgba(255,255,255,0.85)', fontStyle: 'italic', textAlign: 'center', originX: 'center', selectable: true, evented: true }));
  add(new fabric.Rect({ left: CW / 2 - 120, top: 386, width: 240, height: 56, fill: '#1b1b1f', rx: 28, ry: 28, selectable: true, evented: true }));
  add(new fabric.IText('SHOP THE SALE', { left: CW / 2, top: 405, fontFamily: 'DM Sans', fontSize: 14, fill: '#ffffff', fontWeight: '700', textAlign: 'center', originX: 'center', charSpacing: 80, selectable: true, evented: true }));
  add(new fabric.IText('FAN FAVOURITES', { left: 40, top: 510, fontFamily: 'DM Sans', fontSize: 11, fill: '#1b1b1f', fontWeight: '700', charSpacing: 160, selectable: true, evented: true }));
  var px = [40, 312];
  for (var i = 0; i < 2; i++) {
    var bx = px[i];
    add(new fabric.Rect({ left: bx, top: 540, width: 248, height: 230, fill: '#ffffff', rx: 10, ry: 10, stroke: '#f1ddd5', strokeWidth: 1, selectable: true, evented: true }));
    add(new fabric.Rect({ left: bx + 24, top: 564, width: 200, height: 130, fill: '#ffe7df', rx: 8, ry: 8, selectable: true, evented: true }));
    add(new fabric.Rect({ left: bx + 98, top: 600, width: 52, height: 56, fill: '#ef5b3b', rx: 6, ry: 6, selectable: true, evented: true }));
    add(new fabric.Path('M 0 12 C 0 -4 24 -4 24 12', { left: bx + 102, top: 588, fill: '', stroke: '#ef5b3b', strokeWidth: 4, selectable: true, evented: true }));
    add(new fabric.IText('Bestseller No. ' + (i + 1), { left: bx + 24, top: 706, fontFamily: 'DM Sans', fontSize: 14, fill: '#1b1b1f', fontWeight: '700', selectable: true, evented: true }));
    add(new fabric.IText('$69', { left: bx + 24, top: 730, fontFamily: 'DM Sans', fontSize: 13, fill: '#9aa3af', linethrough: true, selectable: true, evented: true }));
    add(new fabric.IText('$48', { left: bx + 64, top: 730, fontFamily: 'DM Sans', fontSize: 14, fill: '#ef5b3b', fontWeight: '700', selectable: true, evented: true }));
  }
  add(new fabric.Rect({ left: 0, top: 812, width: CW, height: 88, fill: '#1b1b1f', selectable: true, evented: true }));
  add(new fabric.IText('Use code  SUMMER30  at checkout', { left: CW / 2, top: 838, fontFamily: 'DM Sans', fontSize: 12.5, fill: '#ffffff', fontWeight: '700', textAlign: 'center', originX: 'center', charSpacing: 40, selectable: true, evented: true }));
  add(new fabric.IText('No longer want these? Unsubscribe', { left: CW / 2, top: 866, fontFamily: 'DM Sans', fontSize: 10, fill: 'rgba(255,255,255,0.5)', textAlign: 'center', originX: 'center', selectable: true, evented: true }));
}

function tplEmailWelcome() {
  var co = userInfo.company || 'Your Company';
  var n = (userInfo.name || 'there').split(' ')[0];
  canvas.setBackgroundColor('#f1f8f5', canvas.renderAll.bind(canvas));
  add(new fabric.Rect({ left: 0, top: 0, width: CW, height: 308, fill: '#0f8f76', selectable: true, evented: true }));
  add(new fabric.Circle({ left: 56, top: 70, radius: 9, fill: 'rgba(255,255,255,0.16)', selectable: true, evented: true }));
  add(new fabric.Circle({ left: CW - 84, top: 54, radius: 12, fill: 'rgba(255,255,255,0.12)', selectable: true, evented: true }));
  add(new fabric.Circle({ left: CW - 120, top: 226, radius: 6, fill: 'rgba(255,255,255,0.18)', selectable: true, evented: true }));
  add(new fabric.Circle({ left: 96, top: 236, radius: 5, fill: 'rgba(255,255,255,0.14)', selectable: true, evented: true }));
  add(new fabric.Rect({ left: 124, top: 122, width: 16, height: 16, fill: 'rgba(255,255,255,0.14)', angle: 45, selectable: true, evented: true }));
  add(new fabric.Rect({ left: CW - 112, top: 124, width: 13, height: 13, fill: 'rgba(255,255,255,0.12)', angle: 45, selectable: true, evented: true }));
  add(new fabric.Rect({ left: 206, top: 250, width: 10, height: 10, fill: 'rgba(255,255,255,0.16)', angle: 45, selectable: true, evented: true }));
  add(new fabric.IText(co.toUpperCase(), { left: CW / 2, top: 42, fontFamily: 'Unbounded', fontSize: 13, fill: 'rgba(255,255,255,0.92)', fontWeight: '700', textAlign: 'center', originX: 'center', charSpacing: 180, selectable: true, evented: true }));
  add(new fabric.Circle({ left: CW / 2, top: 158, radius: 46, fill: '#ffffff', originX: 'center', originY: 'center', selectable: true, evented: true }));
  add(new fabric.IText(co.charAt(0).toUpperCase(), { left: CW / 2, top: 158, fontFamily: 'Playfair Display', fontSize: 40, fill: '#0f8f76', fontWeight: '700', textAlign: 'center', originX: 'center', originY: 'center', selectable: true, evented: true }));
  add(new fabric.IText('WELCOME TO THE TEAM', { left: CW / 2, top: 234, fontFamily: 'DM Sans', fontSize: 11, fill: 'rgba(255,255,255,0.85)', fontWeight: '700', textAlign: 'center', originX: 'center', charSpacing: 160, selectable: true, evented: true }));
  add(new fabric.IText('Welcome aboard, ' + n + '!', { left: CW / 2, top: 340, fontFamily: 'Playfair Display', fontSize: 32, fill: '#10362d', fontWeight: '700', textAlign: 'center', originX: 'center', selectable: true, evented: true }));
  add(new fabric.IText("We're thrilled to have you here.", { left: CW / 2, top: 388, fontFamily: 'Cormorant Garamond', fontSize: 19, fill: '#5d736c', fontStyle: 'italic', textAlign: 'center', originX: 'center', selectable: true, evented: true }));
  var steps = [
    ['1', 'Complete your profile', 'Add a photo and a few details so your teammates recognise you.'],
    ['2', 'Explore your dashboard', 'Everything you need lives in one calm, organised place.'],
    ['3', 'Invite your teammates', "It's better together — bring the whole crew on board."]
  ];
  for (var i = 0; i < 3; i++) {
    var y = 438 + i * 104;
    add(new fabric.Rect({ left: 48, top: y, width: CW - 96, height: 88, fill: '#ffffff', rx: 14, ry: 14, stroke: '#dfeee8', strokeWidth: 1, selectable: true, evented: true }));
    add(new fabric.Circle({ left: 92, top: y + 44, radius: 20, fill: '#e4f3ee', originX: 'center', originY: 'center', selectable: true, evented: true }));
    add(new fabric.IText(steps[i][0], { left: 92, top: y + 44, fontFamily: 'DM Sans', fontSize: 16, fill: '#0f8f76', fontWeight: '700', textAlign: 'center', originX: 'center', originY: 'center', selectable: true, evented: true }));
    add(new fabric.IText(steps[i][1], { left: 132, top: y + 22, fontFamily: 'DM Sans', fontSize: 15, fill: '#10362d', fontWeight: '700', selectable: true, evented: true }));
    add(new fabric.Textbox(steps[i][2], { left: 132, top: y + 46, width: 392, fontFamily: 'DM Sans', fontSize: 12, fill: '#6b807a', lineHeight: 1.4, selectable: true, evented: true }));
  }
  add(new fabric.Rect({ left: CW / 2 - 110, top: 772, width: 220, height: 54, fill: '#0f8f76', rx: 27, ry: 27, originX: 'left', selectable: true, evented: true }));
  add(new fabric.IText('Get started  →', { left: CW / 2, top: 790, fontFamily: 'DM Sans', fontSize: 14, fill: '#ffffff', fontWeight: '700', textAlign: 'center', originX: 'center', selectable: true, evented: true }));
  add(new fabric.IText('Need a hand? Just reply — a real human answers.', { left: CW / 2, top: 852, fontFamily: 'DM Sans', fontSize: 11.5, fill: '#8a9a94', textAlign: 'center', originX: 'center', selectable: true, evented: true }));
  add(new fabric.IText(co + '   ·   Unsubscribe', { left: CW / 2, top: 876, fontFamily: 'DM Sans', fontSize: 10, fill: '#aebbb5', textAlign: 'center', originX: 'center', selectable: true, evented: true }));
}

function tplEmailAnnounce() {
  var co = userInfo.company || 'Your Company';
  canvas.setBackgroundColor('#ffffff', canvas.renderAll.bind(canvas));
  add(new fabric.IText(co, { left: 48, top: 22, fontFamily: 'Unbounded', fontSize: 14, fill: '#171033', fontWeight: '700', selectable: true, evented: true }));
  add(new fabric.IText('PRODUCT NEWS', { left: CW - 48, top: 26, fontFamily: 'DM Sans', fontSize: 10.5, fill: '#9a92b8', fontWeight: '700', textAlign: 'right', originX: 'right', charSpacing: 120, selectable: true, evented: true }));
  add(new fabric.Rect({ left: 0, top: 56, width: CW, height: 344, fill: '#171033', selectable: true, evented: true }));
  add(new fabric.Circle({ left: -70, top: 300, radius: 140, fill: 'rgba(108,92,231,0.28)', selectable: true, evented: true }));
  add(new fabric.Circle({ left: CW - 90, top: 70, radius: 110, fill: 'rgba(108,92,231,0.22)', selectable: true, evented: true }));
  add(new fabric.IText('INTRODUCING', { left: 48, top: 104, fontFamily: 'DM Sans', fontSize: 12, fill: '#a89cf0', fontWeight: '700', charSpacing: 160, selectable: true, evented: true }));
  add(new fabric.Textbox('Meet the all-new Workspace', { left: 48, top: 132, width: 380, fontFamily: 'Playfair Display', fontSize: 36, fill: '#ffffff', fontWeight: '700', lineHeight: 1.1, selectable: true, evented: true }));
  add(new fabric.Textbox('Rebuilt from the ground up — faster, calmer, and designed around how you actually work.', { left: 48, top: 232, width: 330, fontFamily: 'DM Sans', fontSize: 13, fill: 'rgba(255,255,255,0.72)', lineHeight: 1.55, selectable: true, evented: true }));
  add(new fabric.Rect({ left: 60, top: 312, width: 480, height: 244, fill: '#241a4d', rx: 16, ry: 16, stroke: 'rgba(255,255,255,0.10)', strokeWidth: 1, selectable: true, evented: true }));
  add(new fabric.Circle({ left: 86, top: 336, radius: 4, fill: '#ff5f56', originX: 'center', originY: 'center', selectable: true, evented: true }));
  add(new fabric.Circle({ left: 102, top: 336, radius: 4, fill: '#ffbd2e', originX: 'center', originY: 'center', selectable: true, evented: true }));
  add(new fabric.Circle({ left: 118, top: 336, radius: 4, fill: '#27c93f', originX: 'center', originY: 'center', selectable: true, evented: true }));
  add(new fabric.Line([60, 352, 540, 352], { stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1, selectable: true, evented: true }));
  add(new fabric.Rect({ left: 80, top: 372, width: 132, height: 162, fill: '#312455', rx: 10, ry: 10, selectable: true, evented: true }));
  for (var s = 0; s < 4; s++) { add(new fabric.Rect({ left: 96, top: 392 + s * 26, width: 100, height: 8, fill: 'rgba(255,255,255,0.16)', rx: 4, ry: 4, selectable: true, evented: true })); }
  add(new fabric.Rect({ left: 232, top: 372, width: 288, height: 60, fill: '#6c5ce7', rx: 10, ry: 10, selectable: true, evented: true }));
  add(new fabric.Rect({ left: 232, top: 448, width: 200, height: 9, fill: 'rgba(255,255,255,0.20)', rx: 4, ry: 4, selectable: true, evented: true }));
  add(new fabric.Rect({ left: 232, top: 470, width: 288, height: 9, fill: 'rgba(255,255,255,0.12)', rx: 4, ry: 4, selectable: true, evented: true }));
  add(new fabric.Rect({ left: 232, top: 492, width: 250, height: 9, fill: 'rgba(255,255,255,0.12)', rx: 4, ry: 4, selectable: true, evented: true }));
  add(new fabric.Rect({ left: 232, top: 514, width: 160, height: 9, fill: 'rgba(255,255,255,0.12)', rx: 4, ry: 4, selectable: true, evented: true }));
  var feats = [
    ['Redesigned dashboard', 'A cleaner home that puts the day ahead front and centre.'],
    ['2× faster everywhere', 'Pages load instantly, so nothing stands between you and the work.'],
    ['Built-in collaboration', 'Share, comment and ship together without leaving the app.']
  ];
  for (var i = 0; i < 3; i++) {
    var y = 588 + i * 70;
    add(new fabric.Rect({ left: 48, top: y, width: 46, height: 46, fill: '#efeafe', rx: 12, ry: 12, selectable: true, evented: true }));
    if (i === 0) {
      add(new fabric.Rect({ left: 61, top: y + 14, width: 8, height: 8, fill: '#6c5ce7', rx: 2, ry: 2, selectable: true, evented: true }));
      add(new fabric.Rect({ left: 73, top: y + 14, width: 8, height: 8, fill: '#6c5ce7', rx: 2, ry: 2, selectable: true, evented: true }));
      add(new fabric.Rect({ left: 61, top: y + 26, width: 8, height: 8, fill: '#6c5ce7', rx: 2, ry: 2, selectable: true, evented: true }));
      add(new fabric.Rect({ left: 73, top: y + 26, width: 8, height: 8, fill: '#6c5ce7', rx: 2, ry: 2, selectable: true, evented: true }));
    } else if (i === 1) {
      add(new fabric.Path('M 8 0 L 0 12 L 6 12 L 3 22 L 15 8 L 8 8 Z', { left: 62, top: y + 12, fill: '#6c5ce7', selectable: true, evented: true }));
    } else {
      add(new fabric.Circle({ left: 64, top: y + 17, radius: 7, fill: '#6c5ce7', selectable: true, evented: true }));
      add(new fabric.Circle({ left: 73, top: y + 21, radius: 7, fill: 'rgba(108,92,231,0.45)', selectable: true, evented: true }));
    }
    add(new fabric.IText(feats[i][0], { left: 112, top: y + 4, fontFamily: 'DM Sans', fontSize: 15, fill: '#171033', fontWeight: '700', selectable: true, evented: true }));
    add(new fabric.Textbox(feats[i][1], { left: 112, top: y + 25, width: 400, fontFamily: 'DM Sans', fontSize: 12, fill: '#6b7280', lineHeight: 1.4, selectable: true, evented: true }));
  }
  add(new fabric.Rect({ left: 48, top: 800, width: 224, height: 52, fill: '#6c5ce7', rx: 26, ry: 26, selectable: true, evented: true }));
  add(new fabric.IText('Explore what’s new  →', { left: 160, top: 817, fontFamily: 'DM Sans', fontSize: 14, fill: '#ffffff', fontWeight: '700', textAlign: 'center', originX: 'center', selectable: true, evented: true }));
  add(new fabric.Line([48, 874, CW - 48, 874], { stroke: '#ececf3', strokeWidth: 1, selectable: true, evented: true }));
  add(new fabric.IText(co + '   ·   You signed up for product updates.   ·   Unsubscribe', { left: 48, top: 882, fontFamily: 'DM Sans', fontSize: 10, fill: '#aeb4bd', selectable: true, evented: true }));
}

function tplEmailCorporate() {
  var co = userInfo.company || 'Your Company';
  var n = userInfo.name || 'Alexandra Hale';
  var t = userInfo.title || 'Managing Director';
  var w = userInfo.website || 'www.yoursite.com';
  canvas.setBackgroundColor('#fbfaf7', canvas.renderAll.bind(canvas));
  add(new fabric.Rect({ left: 0, top: 0, width: CW, height: 8, fill: '#1a1a1a', selectable: true, evented: true }));
  add(new fabric.Rect({ left: 0, top: 8, width: CW, height: 2, fill: '#b08d2d', selectable: true, evented: true }));
  add(new fabric.Circle({ left: CW / 2, top: 86, radius: 36, fill: 'rgba(176,141,45,0.06)', stroke: '#b08d2d', strokeWidth: 1.5, originX: 'center', originY: 'center', selectable: true, evented: true }));
  add(new fabric.Circle({ left: CW / 2, top: 86, radius: 29, fill: '', stroke: 'rgba(176,141,45,0.5)', strokeWidth: 0.75, originX: 'center', originY: 'center', selectable: true, evented: true }));
  add(new fabric.IText(co.charAt(0).toUpperCase(), { left: CW / 2, top: 86, fontFamily: 'Playfair Display', fontSize: 34, fill: '#1a1a1a', fontWeight: '700', textAlign: 'center', originX: 'center', originY: 'center', selectable: true, evented: true }));
  add(new fabric.IText(co.toUpperCase(), { left: CW / 2, top: 146, fontFamily: 'Playfair Display', fontSize: 23, fill: '#1a1a1a', fontWeight: '700', textAlign: 'center', originX: 'center', charSpacing: 120, selectable: true, evented: true }));
  add(new fabric.Rect({ left: CW / 2 - 30, top: 186, width: 60, height: 2, fill: '#b08d2d', originX: 'left', selectable: true, evented: true }));
  add(new fabric.IText('A NOTE FOR OUR CLIENTS', { left: CW / 2, top: 200, fontFamily: 'DM Sans', fontSize: 10, fill: '#9a8f78', fontWeight: '700', textAlign: 'center', originX: 'center', charSpacing: 200, selectable: true, evented: true }));
  add(new fabric.IText('Dear valued client,', { left: 64, top: 262, fontFamily: 'Cormorant Garamond', fontSize: 20, fill: '#1a1a1a', fontStyle: 'italic', selectable: true, evented: true }));
  add(new fabric.Textbox('Thank you for the trust you place in us. As we continue to grow, our commitment remains unchanged — to deliver work of genuine craft and to stand beside you at every step of the journey.', { left: 64, top: 304, width: CW - 128, fontFamily: 'Cormorant Garamond', fontSize: 17, fill: '#3a3a3a', lineHeight: 1.55, selectable: true, evented: true }));
  add(new fabric.Textbox('It would be our privilege to continue serving you in the year ahead. Should you wish to speak with us, our door is always open.', { left: 64, top: 410, width: CW - 128, fontFamily: 'Cormorant Garamond', fontSize: 17, fill: '#3a3a3a', lineHeight: 1.55, selectable: true, evented: true }));
  add(new fabric.IText('With our sincere regards,', { left: 64, top: 506, fontFamily: 'Cormorant Garamond', fontSize: 16, fill: '#3a3a3a', fontStyle: 'italic', selectable: true, evented: true }));
  add(new fabric.Path('M 0 22 C 26 -8 44 28 70 6 C 92 -10 110 18 138 2 C 150 -4 160 6 168 4', { left: 64, top: 536, fill: '', stroke: '#b08d2d', strokeWidth: 2, selectable: true, evented: true }));
  add(new fabric.IText(n, { left: 64, top: 576, fontFamily: 'Playfair Display', fontSize: 19, fill: '#1a1a1a', fontWeight: '700', selectable: true, evented: true }));
  add(new fabric.IText(t + '  ·  ' + co, { left: 64, top: 606, fontFamily: 'DM Sans', fontSize: 12, fill: '#8a8a8a', charSpacing: 30, selectable: true, evented: true }));
  add(new fabric.Rect({ left: 64, top: 660, width: 168, height: 48, fill: '#1a1a1a', selectable: true, evented: true }));
  add(new fabric.IText('CONTACT US', { left: 148, top: 676, fontFamily: 'DM Sans', fontSize: 12, fill: '#ffffff', fontWeight: '700', textAlign: 'center', originX: 'center', charSpacing: 120, selectable: true, evented: true }));
  add(new fabric.Rect({ left: 0, top: 812, width: CW, height: 88, fill: '#1a1a1a', selectable: true, evented: true }));
  add(new fabric.Rect({ left: 0, top: 812, width: CW, height: 2, fill: '#b08d2d', selectable: true, evented: true }));
  add(new fabric.IText(co, { left: CW / 2, top: 836, fontFamily: 'Playfair Display', fontSize: 14, fill: '#e9dcc0', fontWeight: '700', textAlign: 'center', originX: 'center', charSpacing: 60, selectable: true, evented: true }));
  add(new fabric.IText(w + '   ·   +1 (555) 000 0000', { left: CW / 2, top: 860, fontFamily: 'DM Sans', fontSize: 11, fill: 'rgba(255,255,255,0.6)', textAlign: 'center', originX: 'center', selectable: true, evented: true }));
  add(new fabric.IText('Unsubscribe', { left: CW / 2, top: 880, fontFamily: 'DM Sans', fontSize: 9.5, fill: 'rgba(255,255,255,0.4)', textAlign: 'center', originX: 'center', selectable: true, evented: true }));
}

function drawThumbEmailNewsletter(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2, x = canvasEl.getContext('2d'); x.scale(2, 2);
  function diamond(cx, cy, r, col) { x.save(); x.translate(cx, cy); x.rotate(Math.PI / 4); x.fillStyle = col; x.fillRect(-r, -r, r * 2, r * 2); x.restore(); }
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, tw, th);
  x.fillStyle = '#13243d'; x.fillRect(0, 0, tw, 58);
  x.fillStyle = 'rgba(201,162,39,0.18)'; x.beginPath(); x.arc(tw - 8, -2, 26, 0, 6.3); x.fill();
  x.fillStyle = 'rgba(201,162,39,0.12)'; x.beginPath(); x.arc(tw - 2, 20, 15, 0, 6.3); x.fill();
  x.fillStyle = '#ffffff'; x.font = 'bold 5px Arial'; x.fillText('STUDIO', 10, 18);
  x.fillStyle = '#c9a227'; x.font = '3.5px Arial'; x.fillText('ISSUE 12 · JUNE', 10, 30);
  x.fillStyle = '#ffffff'; x.font = 'bold 11px Georgia'; x.fillText('The Monthly', 9, 44); x.fillText('Edit', 9, 55);
  x.fillStyle = '#c9a227'; x.font = 'bold 3px Arial'; x.fillText('FEATURED', 10, 74);
  x.fillStyle = '#13243d'; x.font = 'bold 7px Georgia'; x.fillText('Designing calm', 10, 86); x.fillText('into the noise', 10, 95);
  x.fillStyle = '#c2c8d0'; x.fillRect(10, 102, tw - 20, 1.6); x.fillRect(10, 107, tw - 20, 1.6); x.fillRect(10, 112, tw - 40, 1.6);
  x.fillStyle = '#c9a227'; x.font = 'bold 3.5px Arial'; x.fillText('Read the story →', 10, 124);
  x.strokeStyle = '#ece7dd'; x.lineWidth = 1; x.beginPath(); x.moveTo(10, 134); x.lineTo(tw - 10, 134); x.stroke();
  diamond(tw / 2, 134, 2, '#c9a227');
  x.fillStyle = '#9aa3af'; x.font = 'bold 3px Arial'; x.fillText('ALSO IN THIS ISSUE', 10, 144);
  diamond(12, 151, 1.6, '#c9a227'); x.fillStyle = '#13243d'; x.font = '4.5px Georgia'; x.fillText('The five fonts we love', 18, 153);
  diamond(12, 160, 1.6, '#c9a227'); x.fillStyle = '#13243d'; x.font = '4.5px Georgia'; x.fillText('A tour of the studio', 18, 162);
  x.fillStyle = '#f6f2ea'; x.fillRect(0, th - 10, tw, 10);
  x.fillStyle = '#13243d'; x.beginPath(); x.arc(12, th - 5, 2.2, 0, 6.3); x.fill(); x.beginPath(); x.arc(19, th - 5, 2.2, 0, 6.3); x.fill(); x.beginPath(); x.arc(26, th - 5, 2.2, 0, 6.3); x.fill();
}

function drawThumbEmailPromo(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2, x = canvasEl.getContext('2d'); x.scale(2, 2);
  x.fillStyle = '#fff7f4'; x.fillRect(0, 0, tw, th);
  x.fillStyle = '#1b1b1f'; x.fillRect(0, 0, tw, 11);
  x.fillStyle = '#ffffff'; x.font = 'bold 4px Arial'; x.textAlign = 'center'; x.fillText('YOUR BRAND', tw / 2, 8);
  x.fillStyle = '#ef5b3b'; x.fillRect(0, 11, tw, 86);
  x.fillStyle = 'rgba(255,255,255,0.12)'; x.beginPath(); x.arc(8, 92, 22, 0, 6.3); x.fill(); x.beginPath(); x.arc(tw - 8, 22, 15, 0, 6.3); x.fill();
  x.save(); x.translate(tw / 2, 56); x.rotate(Math.PI / 4); x.fillStyle = 'rgba(255,255,255,0.14)'; x.fillRect(-16, -16, 32, 32); x.restore();
  x.fillStyle = 'rgba(255,255,255,0.92)'; x.font = 'bold 4px Arial'; x.fillText('S U M M E R   S A L E', tw / 2, 28);
  x.fillStyle = '#ffffff'; x.font = 'bold 26px Arial'; x.fillText('30%', tw / 2, 64);
  x.font = 'bold 5px Arial'; x.fillText('OFF EVERYTHING', tw / 2, 76);
  x.fillStyle = 'rgba(255,255,255,0.9)'; x.font = 'italic 5px Georgia'; x.fillText('Ends Sunday at midnight', tw / 2, 86);
  x.fillStyle = '#1b1b1f'; if (x.roundRect) { x.beginPath(); x.roundRect(tw / 2 - 26, 90, 52, 11, 5.5); x.fill(); } else x.fillRect(tw / 2 - 26, 90, 52, 11);
  x.fillStyle = '#ffffff'; x.font = 'bold 4px Arial'; x.fillText('SHOP THE SALE', tw / 2, 97);
  x.textAlign = 'left';
  x.fillStyle = '#1b1b1f'; x.font = 'bold 3.5px Arial'; x.fillText('FAN FAVOURITES', 9, 112);
  var cx = [8, 62];
  for (var i = 0; i < 2; i++) {
    var bx = cx[i];
    x.fillStyle = '#ffffff'; x.strokeStyle = '#f1ddd5'; x.lineWidth = 1;
    if (x.roundRect) { x.beginPath(); x.roundRect(bx, 118, 50, 46, 3); x.fill(); x.stroke(); } else { x.fillRect(bx, 118, 50, 46); x.strokeRect(bx, 118, 50, 46); }
    x.fillStyle = '#ffe7df'; x.fillRect(bx + 6, 123, 38, 24);
    x.fillStyle = '#ef5b3b'; x.fillRect(bx + 19, 132, 12, 11);
    x.strokeStyle = '#ef5b3b'; x.lineWidth = 1; x.beginPath(); x.arc(bx + 25, 132, 4, Math.PI, 0); x.stroke();
    x.fillStyle = '#9aa3af'; x.font = '4px Arial'; x.fillText('$69', bx + 6, 157); x.beginPath(); x.moveTo(bx + 6, 155.5); x.lineTo(bx + 16, 155.5); x.strokeStyle = '#9aa3af'; x.stroke();
    x.fillStyle = '#ef5b3b'; x.font = 'bold 4.5px Arial'; x.fillText('$48', bx + 22, 157);
  }
  x.fillStyle = '#1b1b1f'; x.fillRect(0, th - 12, tw, 12);
  x.fillStyle = '#ffffff'; x.font = 'bold 3.5px Arial'; x.textAlign = 'center'; x.fillText('USE CODE  SUMMER30', tw / 2, th - 5); x.textAlign = 'left';
}

function drawThumbEmailWelcome(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2, x = canvasEl.getContext('2d'); x.scale(2, 2);
  function diamond(cx, cy, r, col) { x.save(); x.translate(cx, cy); x.rotate(Math.PI / 4); x.fillStyle = col; x.fillRect(-r, -r, r * 2, r * 2); x.restore(); }
  x.fillStyle = '#f1f8f5'; x.fillRect(0, 0, tw, th);
  x.fillStyle = '#0f8f76'; x.fillRect(0, 0, tw, 62);
  x.fillStyle = 'rgba(255,255,255,0.16)'; x.beginPath(); x.arc(14, 16, 2.4, 0, 6.3); x.fill(); x.beginPath(); x.arc(tw - 16, 12, 3, 0, 6.3); x.fill(); x.beginPath(); x.arc(tw - 22, 48, 1.8, 0, 6.3); x.fill();
  diamond(26, 26, 1.8, 'rgba(255,255,255,0.16)'); diamond(tw - 24, 28, 1.6, 'rgba(255,255,255,0.14)');
  x.fillStyle = '#ffffff'; x.beginPath(); x.arc(tw / 2, 30, 10, 0, 6.3); x.fill();
  x.fillStyle = '#0f8f76'; x.font = 'bold 11px Georgia'; x.textAlign = 'center'; x.fillText('S', tw / 2, 34);
  x.fillStyle = 'rgba(255,255,255,0.9)'; x.font = 'bold 3px Arial'; x.fillText('WELCOME TO THE TEAM', tw / 2, 52);
  x.fillStyle = '#10362d'; x.font = 'bold 9px Georgia'; x.fillText('Welcome aboard!', tw / 2, 76);
  x.fillStyle = '#5d736c'; x.font = 'italic 5px Georgia'; x.fillText("We're thrilled to have you.", tw / 2, 86); x.textAlign = 'left';
  for (var i = 0; i < 3; i++) {
    var y = 94 + i * 24;
    x.fillStyle = '#ffffff'; x.strokeStyle = '#dfeee8'; x.lineWidth = 1;
    if (x.roundRect) { x.beginPath(); x.roundRect(8, y, tw - 16, 20, 3); x.fill(); x.stroke(); } else { x.fillRect(8, y, tw - 16, 20); x.strokeRect(8, y, tw - 16, 20); }
    x.fillStyle = '#e4f3ee'; x.beginPath(); x.arc(19, y + 10, 5, 0, 6.3); x.fill();
    x.fillStyle = '#0f8f76'; x.font = 'bold 5px Arial'; x.textAlign = 'center'; x.fillText(String(i + 1), 19, y + 12); x.textAlign = 'left';
    x.fillStyle = '#10362d'; x.fillRect(30, y + 5, 44, 3);
    x.fillStyle = '#c7d6d0'; x.fillRect(30, y + 11, tw - 40, 2); x.fillRect(30, y + 15, tw - 52, 2);
  }
  x.fillStyle = '#0f8f76'; if (x.roundRect) { x.beginPath(); x.roundRect(tw / 2 - 26, 168, 52, 11, 5.5); x.fill(); } else x.fillRect(tw / 2 - 26, 168, 52, 11);
  x.fillStyle = '#ffffff'; x.font = 'bold 4px Arial'; x.textAlign = 'center'; x.fillText('GET STARTED →', tw / 2, 175); x.textAlign = 'left';
}

function drawThumbEmailAnnounce(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2, x = canvasEl.getContext('2d'); x.scale(2, 2);
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, tw, th);
  x.fillStyle = '#171033'; x.font = 'bold 5px Arial'; x.fillText('COMPANY', 9, 9);
  x.fillStyle = '#9a92b8'; x.font = 'bold 3px Arial'; x.textAlign = 'right'; x.fillText('PRODUCT NEWS', tw - 9, 9); x.textAlign = 'left';
  x.fillStyle = '#171033'; x.fillRect(0, 12, tw, 70);
  x.fillStyle = 'rgba(108,92,231,0.30)'; x.beginPath(); x.arc(4, 78, 28, 0, 6.3); x.fill();
  x.fillStyle = 'rgba(108,92,231,0.22)'; x.beginPath(); x.arc(tw - 6, 26, 22, 0, 6.3); x.fill();
  x.fillStyle = '#a89cf0'; x.font = 'bold 3px Arial'; x.fillText('INTRODUCING', 9, 28);
  x.fillStyle = '#ffffff'; x.font = 'bold 8px Georgia'; x.fillText('Meet the all-', 9, 40); x.fillText('new Workspace', 9, 50);
  x.fillStyle = '#241a4d'; if (x.roundRect) { x.beginPath(); x.roundRect(12, 60, 96, 48, 4); x.fill(); } else x.fillRect(12, 60, 96, 48);
  x.fillStyle = '#ff5f56'; x.beginPath(); x.arc(18, 66, 1.4, 0, 6.3); x.fill();
  x.fillStyle = '#ffbd2e'; x.beginPath(); x.arc(23, 66, 1.4, 0, 6.3); x.fill();
  x.fillStyle = '#27c93f'; x.beginPath(); x.arc(28, 66, 1.4, 0, 6.3); x.fill();
  x.fillStyle = '#312455'; x.fillRect(17, 72, 26, 32);
  x.fillStyle = 'rgba(255,255,255,0.16)'; x.fillRect(20, 76, 20, 2); x.fillRect(20, 81, 20, 2); x.fillRect(20, 86, 20, 2); x.fillRect(20, 91, 20, 2);
  x.fillStyle = '#6c5ce7'; x.fillRect(47, 72, 56, 12);
  x.fillStyle = 'rgba(255,255,255,0.20)'; x.fillRect(47, 88, 40, 2);
  x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(47, 93, 56, 2); x.fillRect(47, 98, 48, 2);
  for (var i = 0; i < 3; i++) {
    var y = 116 + i * 16;
    x.fillStyle = '#efeafe'; if (x.roundRect) { x.beginPath(); x.roundRect(9, y, 11, 11, 2.5); x.fill(); } else x.fillRect(9, y, 11, 11);
    x.fillStyle = '#6c5ce7'; x.fillRect(12.5, y + 3.5, 4, 4);
    x.fillStyle = '#171033'; x.fillRect(26, y + 1, 40, 3);
    x.fillStyle = '#cfd2da'; x.fillRect(26, y + 6, tw - 36, 2);
  }
  x.fillStyle = '#6c5ce7'; if (x.roundRect) { x.beginPath(); x.roundRect(9, 168, 58, 11, 5.5); x.fill(); } else x.fillRect(9, 168, 58, 11);
  x.fillStyle = '#ffffff'; x.font = 'bold 3.5px Arial'; x.textAlign = 'center'; x.fillText("EXPLORE WHAT'S NEW", 38, 175); x.textAlign = 'left';
}

function drawThumbEmailCorporate(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2, x = canvasEl.getContext('2d'); x.scale(2, 2);
  x.fillStyle = '#fbfaf7'; x.fillRect(0, 0, tw, th);
  x.fillStyle = '#1a1a1a'; x.fillRect(0, 0, tw, 3);
  x.fillStyle = '#b08d2d'; x.fillRect(0, 3, tw, 1);
  x.strokeStyle = '#b08d2d'; x.lineWidth = 1; x.beginPath(); x.arc(tw / 2, 18, 8, 0, 6.3); x.stroke();
  x.fillStyle = '#1a1a1a'; x.font = 'bold 8px Georgia'; x.textAlign = 'center'; x.fillText('Y', tw / 2, 21);
  x.font = 'bold 6px Georgia'; x.fillText('YOUR COMPANY', tw / 2, 36);
  x.fillStyle = '#b08d2d'; x.fillRect(tw / 2 - 7, 41, 14, 1);
  x.fillStyle = '#9a8f78'; x.font = 'bold 2.5px Arial'; x.fillText('A NOTE FOR OUR CLIENTS', tw / 2, 48); x.textAlign = 'left';
  x.fillStyle = '#1a1a1a'; x.font = 'italic 5px Georgia'; x.fillText('Dear valued client,', 10, 60);
  x.fillStyle = '#cfcabf'; x.fillRect(10, 66, tw - 20, 2); x.fillRect(10, 71, tw - 20, 2); x.fillRect(10, 76, tw - 28, 2);
  x.fillRect(10, 85, tw - 20, 2); x.fillRect(10, 90, tw - 32, 2);
  x.fillStyle = '#1a1a1a'; x.font = 'italic 4px Georgia'; x.fillText('With our sincere regards,', 10, 104);
  x.strokeStyle = '#b08d2d'; x.lineWidth = 1; x.beginPath(); x.moveTo(10, 118); x.bezierCurveTo(20, 108, 28, 124, 40, 113); x.bezierCurveTo(50, 106, 58, 118, 70, 111); x.stroke();
  x.fillStyle = '#1a1a1a'; x.font = 'bold 6px Georgia'; x.fillText('Alexandra Hale', 10, 130);
  x.fillStyle = '#8a8a8a'; x.font = '3.5px Arial'; x.fillText('Managing Director · Your Company', 10, 138);
  x.fillStyle = '#1a1a1a'; x.fillRect(10, 145, 40, 11);
  x.fillStyle = '#ffffff'; x.font = 'bold 3.5px Arial'; x.textAlign = 'center'; x.fillText('CONTACT US', 30, 152); x.textAlign = 'left';
  x.fillStyle = '#1a1a1a'; x.fillRect(0, th - 14, tw, 14);
  x.fillStyle = '#b08d2d'; x.fillRect(0, th - 14, tw, 1);
  x.fillStyle = '#e9dcc0'; x.font = 'bold 4px Georgia'; x.textAlign = 'center'; x.fillText('YOUR COMPANY', tw / 2, th - 8);
  x.fillStyle = 'rgba(255,255,255,0.55)'; x.font = '3px Arial'; x.fillText('www.yoursite.com · +1 (555) 000 0000', tw / 2, th - 3); x.textAlign = 'left';
}

if (window.cc && cc.modules) cc.modules.register({ id: 'marketing', parent: 'left-panel.templates.designs', title: 'designs: marketing', mount: function () {}, unmount: function () {} });
