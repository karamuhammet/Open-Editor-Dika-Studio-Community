/* Module: left-panel/templates/designs/card-thumbs — business-card thumbnail drawers (drawThumb*)
   FLAT sub-module of designs — functions stay window globals (siblings + the parent
   call them at runtime; load order is irrelevant). Split from the 2290-line FLAT file. */

function drawThumbBlank(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  ctx.fillStyle = '#eceef2';
  ctx.fillRect(0, 0, tw, th);
  var pad = Math.min(tw, th) * 0.1;
  var rw = tw - pad * 2;
  var rh = th - pad * 2;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(pad, pad, rw, rh);
  ctx.strokeStyle = '#b8bcc6';
  ctx.lineWidth = 0.75;
  ctx.setLineDash([3, 3]);
  ctx.strokeRect(pad + 0.5, pad + 0.5, rw - 1, rh - 1);
  ctx.setLineDash([]);
  var cx = tw / 2;
  var cy = th * 0.44;
  ctx.strokeStyle = '#9ca3af';
  ctx.lineWidth = 1.2;
  var arm = 9;
  ctx.beginPath();
  ctx.moveTo(cx - arm, cy);
  ctx.lineTo(cx + arm, cy);
  ctx.moveTo(cx, cy - arm);
  ctx.lineTo(cx, cy + arm);
  ctx.stroke();
  ctx.fillStyle = '#6b7280';
  ctx.font = '600 7px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Blank', cx, th * 0.78);
  ctx.textAlign = 'left';
}

function drawThumbNoir(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  var n = (userInfo.name || 'John Doe').toUpperCase();
  var t = userInfo.title || 'Creative Director';
  var e = userInfo.email || 'hello@studio.com';
  var ph = userInfo.phone || '+1 555 234 5678';

  ctx.fillStyle = '#0d0d0d'; ctx.fillRect(0, 0, tw, th);
  ctx.fillStyle = '#f2ff58'; ctx.fillRect(tw * 0.06, th * 0.1, 2, th * 0.8);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.fillText(n, tw * 0.1, th * 0.28);
  ctx.fillStyle = '#f2ff58'; ctx.font = '7px sans-serif'; ctx.fillText(t, tw * 0.1, th * 0.42);
  ctx.fillStyle = '#555'; ctx.font = '6px sans-serif'; ctx.fillText(e, tw * 0.1, th * 0.62);
  ctx.fillText(ph, tw * 0.1, th * 0.75);
  ctx.fillStyle = '#181818'; ctx.fillRect(tw * 0.72, th * 0.35, tw * 0.22, tw * 0.22);
}

function drawThumbStudio(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  var n = userInfo.name || 'Jane Smith';
  var t = userInfo.title || 'Brand Strategist';
  var e = userInfo.email || 'jane@studio.io';
  var co = userInfo.company || 'BRAND STUDIO';

  ctx.fillStyle = '#f9f6f1'; ctx.fillRect(0, 0, tw, th);
  ctx.fillStyle = '#111'; ctx.font = 'bold 11px serif'; ctx.fillText(n, tw * 0.06, th * 0.32);
  ctx.fillStyle = '#999'; ctx.font = '7px sans-serif'; ctx.fillText(t, tw * 0.06, th * 0.46);
  ctx.strokeStyle = '#ddd'; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(tw * 0.06, th * 0.54); ctx.lineTo(tw * 0.5, th * 0.54); ctx.stroke();
  ctx.fillStyle = '#666'; ctx.font = '6px sans-serif'; ctx.fillText(e, tw * 0.06, th * 0.68);
  ctx.fillStyle = '#111'; ctx.fillRect(0, th * 0.86, tw, th * 0.14);
  ctx.fillStyle = '#fff'; ctx.font = '7px sans-serif'; ctx.fillText(co.toUpperCase(), tw * 0.06, th * 0.94);
}

function drawThumbBold(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  var parts = (userInfo.name || 'Alex Morgan').split(' ');
  var first = parts[0] || 'Alex', last = parts.slice(1).join(' ') || 'Morgan';
  var t = userInfo.title || 'Full Stack Developer';
  var e = userInfo.email || 'alex@dev.io';

  ctx.fillStyle = '#023e8a'; ctx.fillRect(0, 0, tw * 0.42, th);
  ctx.fillStyle = '#f9f6f1'; ctx.fillRect(tw * 0.42, 0, tw * 0.58, th);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.font = 'bold 42px sans-serif'; ctx.fillText(first[0] || 'A', tw * 0.12, th * 0.72);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.fillText(first.toUpperCase(), tw * 0.06, th * 0.3);
  ctx.fillStyle = '#90e0ef'; ctx.fillText(last.toUpperCase(), tw * 0.06, th * 0.44);
  ctx.fillStyle = '#023e8a'; ctx.font = 'bold 7px sans-serif'; ctx.fillText(t, tw * 0.48, th * 0.3);
  ctx.fillStyle = '#888'; ctx.font = '6px sans-serif'; ctx.fillText(e, tw * 0.48, th * 0.5);
}

function drawThumbArch(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  var co = userInfo.company || 'STUDIO.CO';
  var n = userInfo.name || 'Morgan Lee';

  ctx.fillStyle = '#f0ece4'; ctx.fillRect(0, 0, tw, th);
  ctx.strokeStyle = '#ccc'; ctx.lineWidth = 0.3;
  for (var x = 0; x < tw; x += 15) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, th); ctx.stroke(); }
  for (var y = 0; y < th; y += 15) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(tw, y); ctx.stroke(); }
  ctx.fillStyle = '#2c2c2c'; ctx.font = 'bold 10px sans-serif'; ctx.fillText(co.toUpperCase(), tw * 0.06, th * 0.3);
  ctx.fillStyle = '#888'; ctx.font = '7px sans-serif'; ctx.fillText(n, tw * 0.06, th * 0.5);
  ctx.fillStyle = '#2c2c2c';
  ctx.beginPath(); ctx.arc(tw * 0.85, th * 0.78, th * 0.15, 0, Math.PI * 2); ctx.fill();
}

function drawThumbMinimal(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  var n = userInfo.name || 'Sarah Chen';
  var t = userInfo.title || 'Product Designer';
  var e = userInfo.email || 'sarah@minimal.co';

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, tw, th);
  ctx.fillStyle = '#111'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(n, tw / 2, th * 0.35);
  ctx.fillStyle = '#999'; ctx.font = '7px sans-serif'; ctx.fillText(t, tw / 2, th * 0.5);
  ctx.strokeStyle = '#ddd'; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(tw * 0.3, th * 0.58); ctx.lineTo(tw * 0.7, th * 0.58); ctx.stroke();
  ctx.fillStyle = '#666'; ctx.font = '6px sans-serif'; ctx.fillText(e, tw / 2, th * 0.72);
  ctx.textAlign = 'left';
}

function drawThumbLuxe(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  var n = (userInfo.name || 'Victoria Blake').toUpperCase();
  var t = userInfo.title || 'Managing Director';
  var e = userInfo.email || 'victoria@luxe.com';

  ctx.fillStyle = '#0a0a12'; ctx.fillRect(0, 0, tw, th);
  ctx.strokeStyle = '#f2ff58'; ctx.lineWidth = 0.8;
  ctx.strokeRect(tw * 0.05, th * 0.06, tw * 0.9, th * 0.88);
  ctx.fillStyle = '#f2ff58'; ctx.font = 'bold 10px serif'; ctx.textAlign = 'center';
  ctx.fillText(n, tw / 2, th * 0.38);
  ctx.fillStyle = '#888'; ctx.font = '7px sans-serif'; ctx.fillText(t, tw / 2, th * 0.52);
  ctx.fillStyle = '#555'; ctx.font = '6px sans-serif'; ctx.fillText(e, tw / 2, th * 0.72);
  ctx.textAlign = 'left';
}

function drawThumbTechCircuit(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  var n = (userInfo.name || 'David Chen').toUpperCase();
  var t = userInfo.title || 'Software Engineer';

  ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, tw, th);

  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(5, 15); ctx.lineTo(30, 15); ctx.lineTo(30, 35); ctx.lineTo(55, 35); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(120, 10); ctx.lineTo(120, 30); ctx.lineTo(155, 30); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(140, 60); ctx.lineTo(140, 80); ctx.lineTo(165, 80); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(5, 70); ctx.lineTo(25, 70); ctx.lineTo(25, 90); ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  [[5, 15], [30, 15], [30, 35], [55, 35], [120, 10], [120, 30], [155, 30], [140, 80], [165, 80]].forEach(function(p) {
    ctx.beginPath(); ctx.arc(p[0], p[1], 2, 0, Math.PI * 2); ctx.fill();
  });

  ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.fillText(n, tw * 0.06, th * 0.42);
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '7px sans-serif'; ctx.fillText(t, tw * 0.06, th * 0.56);
}

function drawThumbOrganicBlob(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  var n = (userInfo.name || 'Emma Taylor').toUpperCase();
  var t = userInfo.title || 'Creative Director';

  ctx.fillStyle = '#2d6a4f'; ctx.fillRect(0, 0, tw, th);

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.moveTo(120, 20); ctx.bezierCurveTo(140, 5, 165, 10, 170, 30);
  ctx.bezierCurveTo(175, 50, 160, 65, 140, 60);
  ctx.bezierCurveTo(120, 55, 110, 35, 120, 20);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.moveTo(140, 55); ctx.bezierCurveTo(155, 50, 170, 60, 168, 75);
  ctx.bezierCurveTo(166, 90, 150, 95, 138, 85);
  ctx.bezierCurveTo(126, 75, 130, 60, 140, 55);
  ctx.fill();

  ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.fillText(n, tw * 0.06, th * 0.38);
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '7px sans-serif'; ctx.fillText(t, tw * 0.06, th * 0.52);

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  [th * 0.66, th * 0.78, th * 0.9].forEach(function(y) {
    ctx.beginPath(); ctx.arc(tw * 0.08, y, 2.5, 0, Math.PI * 2); ctx.fill();
  });
}

function drawThumbFloralElegant(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  var n = userInfo.name || 'Olivia Rose';
  var t = userInfo.title || 'Floral Designer';

  ctx.fillStyle = '#5c374c'; ctx.fillRect(0, 0, tw, th);

  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.moveTo(130, 20); ctx.bezierCurveTo(140, 5, 155, 5, 160, 20);
  ctx.bezierCurveTo(165, 35, 150, 40, 140, 35);
  ctx.bezierCurveTo(130, 30, 125, 25, 130, 20);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(148, 22); ctx.bezierCurveTo(155, 10, 170, 12, 172, 25);
  ctx.bezierCurveTo(174, 38, 160, 42, 152, 35);
  ctx.bezierCurveTo(144, 28, 144, 26, 148, 22);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(145, 35); ctx.lineTo(145, 55); ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  [[128, 12], [135, 8], [132, 15], [165, 14], [160, 8]].forEach(function(p) {
    ctx.beginPath(); ctx.arc(p[0], p[1], 2, 0, Math.PI * 2); ctx.fill();
  });

  ctx.fillStyle = '#fff'; ctx.font = 'italic 11px serif'; ctx.fillText(n, tw * 0.06, th * 0.38);
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '7px sans-serif'; ctx.fillText(t, tw * 0.06, th * 0.52);
}

function drawThumbRestaurant(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  var n = userInfo.name || 'Marco Rossi';
  var co = userInfo.company || 'LA TRATTORIA';

  ctx.fillStyle = '#8b2500'; ctx.fillRect(0, 0, tw, th);

  ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(tw * 0.8, th * 0.6, th * 0.25, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(tw * 0.8, th * 0.6, th * 0.17, 0, Math.PI * 2); ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(tw * 0.65, th * 0.3); ctx.lineTo(tw * 0.65, th * 0.85); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(tw * 0.65 - 3, th * 0.3); ctx.lineTo(tw * 0.65 - 3, th * 0.45); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(tw * 0.65 + 3, th * 0.3); ctx.lineTo(tw * 0.65 + 3, th * 0.45); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(tw * 0.95, th * 0.3); ctx.lineTo(tw * 0.95, th * 0.85); ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '6px sans-serif'; ctx.fillText(co.toUpperCase(), tw * 0.06, th * 0.2);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.fillText(n, tw * 0.06, th * 0.38);

  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(0, th * 0.86, tw, th * 0.14);
}

function drawThumbLoyaltyCard(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  var co = userInfo.company || 'CAFE DELIGHTS';

  ctx.fillStyle = '#3b2f2f'; ctx.fillRect(0, 0, tw, th);

  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 0.8;
  ctx.strokeRect(tw * 0.04, th * 0.06, tw * 0.92, th * 0.88);

  ctx.fillStyle = '#fff'; ctx.font = 'bold 9px serif'; ctx.textAlign = 'center';
  ctx.fillText(co.toUpperCase(), tw / 2, th * 0.22);
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '6px sans-serif';
  ctx.fillText('LOYALTY CARD', tw / 2, th * 0.34);

  var stampY = th * 0.55;
  var stampR = 5;
  var startX = tw * 0.12;
  var spacing = (tw * 0.76) / 8;
  for (var i = 0; i < 9; i++) {
    var sx = startX + i * spacing;
    ctx.beginPath(); ctx.arc(sx, stampY, stampR, 0, Math.PI * 2);
    if (i < 3) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 0.6; ctx.stroke();
    }
  }

  ctx.fillStyle = '#fff'; ctx.font = 'bold 7px sans-serif';
  ctx.fillText('FREE DRINK!', tw / 2, th * 0.82);
  ctx.textAlign = 'left';
}

function drawThumbCorporateModern(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  var n = (userInfo.name || 'James Walker').toUpperCase();
  var t = userInfo.title || 'CEO';

  ctx.fillStyle = '#1b263b'; ctx.fillRect(0, 0, tw, th);

  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.translate(tw * 0.7, -10);
  ctx.rotate(-0.35);
  ctx.fillRect(0, 0, 25, th * 1.5);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(35, 0, 15, th * 1.5);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(58, 0, 8, th * 1.5);
  ctx.restore();

  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
  ctx.strokeRect(tw * 0.06, th * 0.12, tw * 0.16, tw * 0.16);

  ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.fillText(n, tw * 0.06, th * 0.58);
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '6px sans-serif'; ctx.fillText(t, tw * 0.06, th * 0.72);
}

function drawThumbQRFocus(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  var n = (userInfo.name || 'Sarah Park').toUpperCase();
  var t = userInfo.title || 'Digital Strategist';

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, tw, th);
  ctx.fillStyle = '#e05535';  // accent color for QR Focus
  ctx.fillRect(0, 0, tw, 4);
  ctx.fillRect(0, th - 4, tw, 4);
  ctx.fillRect(0, 0, 4, th);

  ctx.fillStyle = '#1a1a1a'; ctx.font = 'bold 8px sans-serif'; ctx.fillText(n, tw * 0.06, th * 0.28);
  ctx.fillStyle = '#666'; ctx.font = '6px sans-serif'; ctx.fillText(t, tw * 0.06, th * 0.42);

  ctx.fillStyle = '#e05535'; ctx.fillRect(tw * 0.06, th * 0.5, tw * 0.2, 1);

  ctx.strokeStyle = '#ddd'; ctx.lineWidth = 0.5;
  ctx.strokeRect(tw * 0.6, th * 0.2, tw * 0.3, tw * 0.3);
  ctx.fillStyle = '#f5f5f5'; ctx.fillRect(tw * 0.6, th * 0.2, tw * 0.3, tw * 0.3);
  ctx.fillStyle = '#bbb'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('QR', tw * 0.75, th * 0.2 + tw * 0.17);
  ctx.textAlign = 'left';

  ctx.fillStyle = '#fafafa'; ctx.fillRect(0, th * 0.86, tw, th * 0.14);
}

function drawThumbSocialMedia(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  var n = (userInfo.name || 'Alex Rivera').toUpperCase();
  var t = userInfo.title || 'Social Media Manager';

  ctx.fillStyle = '#6c3483'; ctx.fillRect(0, 0, tw, th);
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(0, th * 0.78, tw, th * 0.22);

  ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.fillText(n, tw * 0.06, th * 0.3);
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '7px sans-serif'; ctx.fillText(t, tw * 0.06, th * 0.44);

  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(tw * 0.06, th * 0.52, tw * 0.2, 1);

  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  var iconX = [tw * 0.1, tw * 0.3, tw * 0.5];
  iconX.forEach(function(x) {
    ctx.beginPath(); ctx.arc(x, th * 0.88, 5, 0, Math.PI * 2); ctx.fill();
  });

  ctx.fillStyle = '#fff'; ctx.font = 'bold 5px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('f', iconX[0], th * 0.9);
  ctx.fillText('\uD83D\uDCF7', iconX[1], th * 0.9);
  ctx.fillText('X', iconX[2], th * 0.9);
  ctx.textAlign = 'left';
}

function drawThumbExecutive(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  var n = (userInfo.name || 'Richard Blake').toUpperCase();
  var t = userInfo.title || 'Chief Executive Officer';
  var co = userInfo.company || 'EXECUTIVE GROUP';

  ctx.fillStyle = '#1a1f3c'; ctx.fillRect(0, 0, tw, th);

  ctx.strokeStyle = 'rgba(201,168,85,0.5)'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(tw * 0.82, 0);
  ctx.quadraticCurveTo(tw, th * 0.3, tw * 0.92, th * 0.55);
  ctx.quadraticCurveTo(tw * 0.84, th * 0.8, tw, th);
  ctx.stroke();

  ctx.fillStyle = '#c9a855'; ctx.font = '6px sans-serif'; ctx.fillText(co.toUpperCase(), tw * 0.08, th * 0.18);

  ctx.strokeStyle = '#c9a855'; ctx.lineWidth = 0.8;
  ctx.save();
  ctx.translate(tw * 0.1, th * 0.32);
  ctx.rotate(Math.PI / 4);
  ctx.strokeRect(-5, -5, 10, 10);
  ctx.restore();

  ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.fillText(n, tw * 0.08, th * 0.54);
  ctx.fillStyle = '#8a90a8'; ctx.font = '6px sans-serif'; ctx.fillText(t, tw * 0.08, th * 0.66);

  ctx.strokeStyle = 'rgba(201,168,85,0.4)'; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(tw * 0.08, th * 0.72); ctx.lineTo(tw * 0.5, th * 0.72); ctx.stroke();

  ctx.fillStyle = '#c9a855';
  [th * 0.8, th * 0.88, th * 0.96].forEach(function(y) {
    ctx.beginPath(); ctx.arc(tw * 0.1, y, 2, 0, Math.PI * 2); ctx.fill();
  });
}

function drawThumbRedwave(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  var n = (userInfo.name || 'Michael Davis').toUpperCase();
  var t = userInfo.title || 'Marketing Director';

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, tw, th);

  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(0, th);
  ctx.lineTo(tw * 0.12, th);
  ctx.quadraticCurveTo(tw * 0.22, th * 0.75, tw * 0.2, th * 0.5);
  ctx.quadraticCurveTo(tw * 0.18, th * 0.2, tw * 0.26, 0);
  ctx.closePath(); ctx.fill();

  ctx.fillStyle = '#1a1a1a'; ctx.font = 'bold 9px sans-serif'; ctx.fillText(n, tw * 0.32, th * 0.38);
  ctx.fillStyle = '#666'; ctx.font = '6px sans-serif'; ctx.fillText(t, tw * 0.32, th * 0.5);

  ctx.fillStyle = '#dc2626'; ctx.fillRect(tw * 0.32, th * 0.56, tw * 0.15, 1.5);

  ctx.fillStyle = '#dc2626';
  [th * 0.68, th * 0.78, th * 0.88].forEach(function(y) {
    ctx.beginPath(); ctx.arc(tw * 0.34, y, 2, 0, Math.PI * 2); ctx.fill();
  });
}

function drawThumbDarkgold(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  var n = (userInfo.name || 'Dr. Alexander Hunt').toUpperCase();
  var co = userInfo.company || 'PREMIER CORP';

  ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, tw, th);

  ctx.strokeStyle = 'rgba(201,168,85,0.4)'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, th);
  ctx.quadraticCurveTo(tw * 0.3, th * 0.7, tw * 0.5, th * 0.5);
  ctx.quadraticCurveTo(tw * 0.7, th * 0.3, tw, th * 0.25);
  ctx.stroke();

  ctx.fillStyle = '#c9a855';
  var cx = tw / 2, cy = th * 0.18;
  [[0, -6], [6, 0], [0, 6], [-6, 0]].forEach(function(d) {
    ctx.save();
    ctx.translate(cx + d[0], cy + d[1]);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
  });

  ctx.fillStyle = '#c9a855'; ctx.font = '6px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(co.toUpperCase(), tw / 2, th * 0.38);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif';
  ctx.fillText(n, tw / 2, th * 0.56);
  ctx.textAlign = 'left';

  ctx.fillStyle = '#1a1a1a'; ctx.fillRect(tw * 0.78, th * 0.72, tw * 0.15, tw * 0.15);
  ctx.fillStyle = '#333'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('QR', tw * 0.855, th * 0.72 + tw * 0.09);
  ctx.textAlign = 'left';
}

function drawThumbNavywhite(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  var n = (userInfo.name || 'Matthew Grant').toUpperCase();
  var co = userInfo.company || 'BRAND CO';
  var initials = (userInfo.name || 'Matthew Grant').split(' ').map(function(p) { return p[0]; }).join('').substring(0, 2);

  ctx.fillStyle = '#1e2d4f'; ctx.fillRect(0, 0, tw, th);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, th * 0.55, tw, th * 0.45);
  ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(0, th * 0.52, tw, th * 0.06);

  ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.font = 'bold 28px serif';
  ctx.textAlign = 'center'; ctx.fillText(initials.toUpperCase(), tw / 2, th * 0.35);

  ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif';
  ctx.fillText(co.toUpperCase(), tw / 2, th * 0.42);

  ctx.fillStyle = '#1e2d4f'; ctx.font = 'bold 7px sans-serif';
  ctx.fillText(n, tw / 2, th * 0.7);
  ctx.fillStyle = '#888'; ctx.font = '6px sans-serif';
  ctx.fillText(userInfo.email || 'matt@brandco.com', tw / 2, th * 0.82);
  ctx.textAlign = 'left';
}

function drawThumbBwmodern(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  var n = (userInfo.name || 'Daniel Stark').toUpperCase();
  var co = userInfo.company || 'MODERN STUDIO';

  ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, tw, th);

  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(0, th * 0.3); ctx.quadraticCurveTo(tw * 0.5, th * 0.1, tw, th * 0.25); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, th * 0.5); ctx.quadraticCurveTo(tw * 0.5, th * 0.35, tw, th * 0.45); ctx.stroke();

  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
  ctx.beginPath();
  var hx = tw * 0.1, hy = th * 0.3;
  ctx.moveTo(hx + 8, hy); ctx.lineTo(hx + 16, hy + 5);
  ctx.lineTo(hx + 16, hy + 15); ctx.lineTo(hx + 8, hy + 20);
  ctx.lineTo(hx, hy + 15); ctx.lineTo(hx, hy + 5);
  ctx.closePath(); ctx.stroke();

  ctx.fillStyle = '#fff'; ctx.font = 'bold 6px sans-serif'; ctx.fillText(co.toUpperCase(), tw * 0.06, th * 0.62);

  ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(tw * 0.52, th * 0.15, 0.8, th * 0.7);

  ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.fillText(n, tw * 0.56, th * 0.32);
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '6px sans-serif';
  ctx.fillText(userInfo.title || 'Creative Technologist', tw * 0.56, th * 0.44);
}

function drawThumbSlategray(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  var n = (userInfo.name || 'Anna Prescott').toUpperCase();
  var co = userInfo.company || 'SLATE CORP';

  ctx.fillStyle = '#2d3748'; ctx.fillRect(0, 0, tw, th);

  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(tw * 0.04, th * 0.94); ctx.arcTo(tw * 0.04, th * 0.06, tw * 0.96, th * 0.06, 5);
  ctx.arcTo(tw * 0.96, th * 0.06, tw * 0.96, th * 0.94, 5);
  ctx.arcTo(tw * 0.96, th * 0.94, tw * 0.04, th * 0.94, 5);
  ctx.arcTo(tw * 0.04, th * 0.94, tw * 0.04, th * 0.06, 5);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath(); ctx.arc(tw / 2, th * 0.2, 9, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.arc(tw / 2, th * 0.2, 9, 0, Math.PI * 2); ctx.stroke();

  ctx.fillStyle = '#fff'; ctx.font = 'bold 10px serif'; ctx.textAlign = 'center';
  ctx.fillText((co[0] || 'A').toUpperCase(), tw / 2, th * 0.24);

  ctx.fillStyle = '#fff'; ctx.font = 'bold 6px sans-serif';
  ctx.fillText(co.toUpperCase(), tw / 2, th * 0.42);

  ctx.fillStyle = '#fff'; ctx.font = 'bold 7px sans-serif';
  ctx.fillText(n, tw / 2, th * 0.62);
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '6px sans-serif';
  ctx.fillText(userInfo.email || 'anna@slatecorp.com', tw / 2, th * 0.76);
  ctx.textAlign = 'left';

  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.beginPath();
  ctx.moveTo(tw, th * 0.7); ctx.lineTo(tw, th); ctx.lineTo(tw * 0.7, th);
  ctx.closePath(); ctx.fill();
}

function drawThumbBlankGeneric(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(0, 0, tw, th);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(8, 8, tw - 16, th - 16);
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 0.8;
  ctx.setLineDash([3, 3]);
  ctx.strokeRect(8, 8, tw - 16, th - 16);
  ctx.setLineDash([]);
  ctx.strokeStyle = '#aaa';
  ctx.lineWidth = 2;
  var cx = tw / 2, cy = th / 2;
  ctx.beginPath();
  ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy);
  ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8);
  ctx.stroke();
  ctx.fillStyle = '#888';
  ctx.font = '600 6px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Blank', cx, th * 0.85);
  ctx.textAlign = 'left';
}

function drawThumbInvoiceUsClean(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, tw, th);
  ctx.fillStyle = '#111827'; ctx.fillRect(6, 6, tw - 12, 20);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 8px Arial'; ctx.fillText('INVOICE', tw - 50, 19);
  ctx.fillStyle = '#f4f5f8'; ctx.fillRect(6, 34, tw * 0.42, 26);
  ctx.fillRect(tw * 0.54, 34, tw * 0.28, 22);
  ctx.fillStyle = '#111827'; ctx.fillRect(6, 74, tw - 12, 12);
  ctx.fillStyle = '#eef1f6'; ctx.fillRect(6, 88, tw - 12, 12);
  ctx.fillRect(6, 102, tw - 12, 12);
  ctx.fillStyle = '#111827'; ctx.fillRect(tw * 0.58, 122, tw * 0.24, 36);
  ctx.fillStyle = '#f2ff58'; ctx.fillRect(tw * 0.66, 145, tw * 0.1, 4);
}

function drawThumbInvoiceUkVat(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, tw, th);
  ctx.fillStyle = '#f2ff58'; ctx.fillRect(6, 6, tw - 12, 6);
  ctx.fillStyle = '#151824'; ctx.font = 'bold 9px Arial'; ctx.fillText('VAT INVOICE', 6, 28);
  ctx.fillStyle = '#f3f5f8'; ctx.fillRect(6, 38, tw * 0.31, 34);
  ctx.fillRect(tw * 0.39, 38, tw * 0.31, 34);
  ctx.fillStyle = '#151824'; ctx.fillRect(tw * 0.73, 38, tw * 0.21, 34);
  ctx.fillRect(6, 92, tw - 12, 12);
  ctx.fillStyle = '#f3f5f8'; ctx.fillRect(6, 106, tw - 12, 12);
  ctx.fillRect(6, 120, tw - 12, 12);
  ctx.fillStyle = '#eceff4'; ctx.fillRect(tw * 0.56, 144, tw * 0.38, 24);
}

function drawThumbInvoiceEuModern(canvasEl) {
  var tw = canvasEl.width / 2, th = canvasEl.height / 2;
  var ctx = canvasEl.getContext('2d');
  ctx.scale(2, 2);
  ctx.fillStyle = '#f7f7f5'; ctx.fillRect(0, 0, tw, th);
  ctx.fillStyle = '#f2ff58'; ctx.fillRect(6, 6, 5, 24);
  ctx.fillStyle = '#111827'; ctx.font = 'bold 9px Arial'; ctx.fillText('INVOICE', 16, 22);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(6, 38, tw * 0.42, 30);
  ctx.fillRect(tw * 0.5, 38, tw * 0.42, 30);
  ctx.fillStyle = '#111827'; ctx.fillRect(6, 90, tw - 12, 12);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(6, 104, tw - 12, 12);
  ctx.fillStyle = '#f6f7fb'; ctx.fillRect(6, 118, tw - 12, 12);
  ctx.fillStyle = '#111827'; ctx.fillRect(tw * 0.58, 142, tw * 0.26, 26);
  ctx.fillStyle = '#f2ff58'; ctx.fillRect(tw * 0.66, 158, tw * 0.1, 4);
}

if (window.cc && cc.modules) cc.modules.register({ id: 'card-thumbs', parent: 'left-panel.templates.designs', title: 'designs: card-thumbs', mount: function () {}, unmount: function () {} });
