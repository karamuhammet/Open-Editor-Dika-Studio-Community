/* Sub-module: left-panel/tools/mockups — Device Mockups generator.
   Builds iPhone / MacBook / Browser / iPad / Android frame groups on the active canvas.
   Extracted VERBATIM from app.js section 21b. Lazy-only: the gallery module's
   openToolGenerator('mockups') creates a fresh #mockup-grid then calls window.initMockups
   to populate it (no load-time work — the old app.js init call was dead code and removed).
   Uses globals fabric / CW / CH / getActiveCanvas / canvas / snap. */
(function () {
  'use strict';
  // ── 21b. Device Mockups ──────────────────────────────────────
  function initMockups() {
    var grid = document.getElementById('mockup-grid');
    if (!grid) return;

    var mockups = [
      { id: 'iphone', label: 'iPhone', color: '#1a1a2e',
        draw: function(cvs, color) {
          var outer = new fabric.Rect({ width: 120, height: 220, rx: 16, ry: 16, fill: color || '#1a1a2e', stroke: '#444', strokeWidth: 2, originX: 'center', originY: 'center' });
          var screen = new fabric.Rect({ width: 100, height: 180, rx: 8, ry: 8, fill: '#000', originX: 'center', originY: 'center', top: -5 });
          var notch = new fabric.Rect({ width: 40, height: 6, rx: 3, ry: 3, fill: color || '#1a1a2e', originX: 'center', originY: 'center', top: -90 });
          var home = new fabric.Circle({ radius: 5, fill: '#333', originX: 'center', originY: 'center', top: 100 });
          return new fabric.Group([outer, screen, notch, home], { left: CW/2-60, top: CH/2-110, selectable: true, evented: true, _mockupType: 'iphone' });
        }
      },
      { id: 'macbook', label: 'MacBook', color: '#c0c0c0',
        draw: function(cvs, color) {
          var screen = new fabric.Rect({ width: 200, height: 130, rx: 6, ry: 6, fill: '#000', stroke: color || '#c0c0c0', strokeWidth: 6, originX: 'center', originY: 'center', top: -15 });
          var base = new fabric.Rect({ width: 230, height: 10, rx: 2, ry: 2, fill: color || '#c0c0c0', originX: 'center', originY: 'center', top: 58 });
          var hinge = new fabric.Rect({ width: 50, height: 4, rx: 2, ry: 2, fill: '#999', originX: 'center', originY: 'center', top: 52 });
          return new fabric.Group([screen, hinge, base], { left: CW/2-115, top: CH/2-70, selectable: true, evented: true, _mockupType: 'macbook' });
        }
      },
      { id: 'browser', label: 'Browser', color: '#2d2d3d',
        draw: function(cvs, color) {
          var frame = new fabric.Rect({ width: 220, height: 160, rx: 8, ry: 8, fill: color || '#2d2d3d', originX: 'center', originY: 'center' });
          var toolbar = new fabric.Rect({ width: 220, height: 24, rx: 8, ry: 0, fill: '#3d3d4d', originX: 'center', originY: 'center', top: -68 });
          var dot1 = new fabric.Circle({ radius: 3, fill: '#ff5f57', left: -96, top: -72 });
          var dot2 = new fabric.Circle({ radius: 3, fill: '#febc2e', left: -86, top: -72 });
          var dot3 = new fabric.Circle({ radius: 3, fill: '#28c840', left: -76, top: -72 });
          var content = new fabric.Rect({ width: 208, height: 120, fill: '#fff', originX: 'center', originY: 'center', top: 12 });
          return new fabric.Group([frame, toolbar, dot1, dot2, dot3, content], { left: CW/2-110, top: CH/2-80, selectable: true, evented: true, _mockupType: 'browser' });
        }
      },
      { id: 'ipad', label: 'iPad', color: '#1a1a2e',
        draw: function(cvs, color) {
          var outer = new fabric.Rect({ width: 170, height: 230, rx: 14, ry: 14, fill: color || '#1a1a2e', stroke: '#444', strokeWidth: 2, originX: 'center', originY: 'center' });
          var screen = new fabric.Rect({ width: 150, height: 200, rx: 4, ry: 4, fill: '#000', originX: 'center', originY: 'center' });
          return new fabric.Group([outer, screen], { left: CW/2-85, top: CH/2-115, selectable: true, evented: true, _mockupType: 'ipad' });
        }
      },
      { id: 'android', label: 'Android', color: '#1a1a2e',
        draw: function(cvs, color) {
          var outer = new fabric.Rect({ width: 115, height: 220, rx: 12, ry: 12, fill: color || '#1a1a2e', stroke: '#444', strokeWidth: 2, originX: 'center', originY: 'center' });
          var screen = new fabric.Rect({ width: 100, height: 190, rx: 6, ry: 6, fill: '#000', originX: 'center', originY: 'center', top: -5 });
          var cam = new fabric.Circle({ radius: 3, fill: '#333', originX: 'center', originY: 'center', top: -105 });
          return new fabric.Group([outer, screen, cam], { left: CW/2-58, top: CH/2-110, selectable: true, evented: true, _mockupType: 'android' });
        }
      }
    ];

    mockups.forEach(function (m) {
      var card = document.createElement('div');
      card.className = 'mockup-card';
      card.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;cursor:pointer;transition:all 0.15s;';

      var thumbCvs = document.createElement('canvas');
      thumbCvs.width = 80;
      thumbCvs.height = 60;
      thumbCvs.style.cssText = 'width:80px;height:60px;';
      var tctx = thumbCvs.getContext('2d');
      tctx.fillStyle = '#0d0d0d';
      tctx.fillRect(0, 0, 80, 60);

      tctx.fillStyle = m.color;
      if (m.id === 'iphone' || m.id === 'android') {
        tctx.beginPath(); tctx.roundRect(28, 5, 24, 50, 4); tctx.fill();
        tctx.fillStyle = '#000'; tctx.fillRect(30, 10, 20, 38);
      } else if (m.id === 'macbook') {
        tctx.fillStyle = '#555'; tctx.fillRect(15, 10, 50, 35);
        tctx.fillStyle = m.color; tctx.fillRect(10, 45, 60, 4);
      } else if (m.id === 'browser') {
        tctx.fillStyle = '#3d3d4d'; tctx.beginPath(); tctx.roundRect(10, 8, 60, 44, 4); tctx.fill();
        tctx.fillStyle = '#fff'; tctx.fillRect(12, 18, 56, 32);
      } else if (m.id === 'ipad') {
        tctx.beginPath(); tctx.roundRect(20, 5, 40, 50, 4); tctx.fill();
        tctx.fillStyle = '#000'; tctx.fillRect(23, 8, 34, 44);
      }

      card.appendChild(thumbCvs);

      var label = document.createElement('div');
      label.style.cssText = 'font-size:11px;color:var(--text);font-weight:500;';
      label.textContent = m.label;
      card.appendChild(label);

      card.onmouseenter = function () { card.style.borderColor = 'var(--gold)'; };
      card.onmouseleave = function () { card.style.borderColor = 'var(--border)'; };

      card.onclick = function () {
        var cvs = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : canvas;
        var obj = m.draw(cvs, m.color);
        cvs.add(obj);
        cvs.setActiveObject(obj);
        cvs.renderAll();
        if (typeof snap === 'function') snap();
      };

      grid.appendChild(card);
    });
  }
  // External entry point: the gallery generator hub calls window.initMockups() after it
  // creates a fresh #mockup-grid inside the Tools sub-view.
  window.initMockups = initMockups;

  // Modular skeleton hook (Faz 2): mockups is a sub-module of the tools panel hub.
  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'mockups', parent: 'left-panel.tools', title: 'Device Mockups', mount: function () {}, unmount: function () {} });
  }
})();
