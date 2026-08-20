/* ═══════════════════════════════════════════════════════════════
   VE Text Templates — Motion graphics template browser
   Faz 4 — Lower thirds, title cards, end screens, callouts
   ═══════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  var _panel = null;
  var _isOpen = false;
  var _activeCategory = 'all';

  var TEMPLATES = [
    // Lower Thirds
    { id: 'lt-minimal',    label: 'Minimal',       cat: 'lower',   preview: 'lt', anim: 'slideUp',
      elements: [{ type: 'text', text: 'John Smith', x: 40, y: 340, fontSize: 22, fontWeight: 'bold', fill: '#ffffff' },
                 { type: 'text', text: 'Creative Director', x: 40, y: 368, fontSize: 14, fill: '#aaaaaa' },
                 { type: 'rect', x: 30, y: 332, w: 4, h: 52, fill: '#f2ff58' }] },
    { id: 'lt-bold',       label: 'Bold Bar',      cat: 'lower',   preview: 'lt', anim: 'fadeIn',
      elements: [{ type: 'rect', x: 0, y: 320, w: 500, h: 80, fill: 'rgba(0,0,0,0.75)' },
                 { type: 'text', text: 'SPEAKER NAME', x: 30, y: 348, fontSize: 24, fontWeight: 'bold', fill: '#ffffff' },
                 { type: 'text', text: 'Title goes here', x: 30, y: 378, fontSize: 14, fill: '#f2ff58' }] },
    { id: 'lt-gradient',   label: 'Gradient Bar',  cat: 'lower',   preview: 'lt', anim: 'slideUp',
      elements: [{ type: 'rect', x: 0, y: 330, w: 350, h: 60, fill: '#f2ff58', opacity: 0.9, radius: 0 },
                 { type: 'text', text: 'Your Name', x: 20, y: 352, fontSize: 20, fontWeight: 'bold', fill: '#0b0b0d' },
                 { type: 'text', text: 'Subtitle', x: 20, y: 375, fontSize: 12, fill: '#333' }] },
    { id: 'lt-split',      label: 'Split Line',    cat: 'lower',   preview: 'lt', anim: 'slideUp',
      elements: [{ type: 'line', x1: 30, y1: 360, x2: 300, y2: 360, stroke: '#f2ff58', lineWidth: 2 },
                 { type: 'text', text: 'NAME', x: 30, y: 348, fontSize: 18, fontWeight: 'bold', fill: '#ffffff' },
                 { type: 'text', text: 'Position', x: 30, y: 376, fontSize: 13, fill: '#aaaaaa' }] },
    { id: 'lt-animated',   label: 'Animated Line', cat: 'lower',   preview: 'lt', anim: 'typewriter',
      elements: [{ type: 'rect', x: 30, y: 330, w: 250, h: 3, fill: '#f2ff58' },
                 { type: 'text', text: 'Name Here', x: 30, y: 350, fontSize: 20, fontWeight: 'bold', fill: '#ffffff' },
                 { type: 'text', text: 'Role', x: 30, y: 375, fontSize: 12, fill: '#888' }] },

    // Title Cards
    { id: 'tc-centered',   label: 'Centered',      cat: 'title',   preview: 'tc', anim: 'scaleIn',
      elements: [{ type: 'text', text: 'TITLE', x: 'center', y: 180, fontSize: 48, fontWeight: 'bold', fill: '#ffffff', align: 'center' },
                 { type: 'text', text: 'Subtitle goes here', x: 'center', y: 230, fontSize: 18, fill: '#aaaaaa', align: 'center' }] },
    { id: 'tc-cinematic',  label: 'Cinematic',     cat: 'title',   preview: 'tc', anim: 'fadeIn',
      elements: [{ type: 'rect', x: 0, y: 0, w: '100%', h: '100%', fill: 'rgba(0,0,0,0.6)' },
                 { type: 'text', text: 'EPIC TITLE', x: 'center', y: 170, fontSize: 56, fontWeight: 'bold', fill: '#ffffff', letterSpacing: 8, align: 'center' },
                 { type: 'line', x1: '30%', y1: 220, x2: '70%', y2: 220, stroke: '#f2ff58', lineWidth: 2 },
                 { type: 'text', text: 'A short tagline', x: 'center', y: 240, fontSize: 16, fill: '#ccc', align: 'center' }] },
    { id: 'tc-glitch',     label: 'Glitch',        cat: 'title',   preview: 'tc', anim: 'glitch',
      elements: [{ type: 'text', text: 'GLITCH', x: 'center', y: 190, fontSize: 52, fontWeight: 'bold', fill: '#ff0040', align: 'center' },
                 { type: 'text', text: 'GLITCH', x: 'center', y: 192, fontSize: 52, fontWeight: 'bold', fill: '#00ffff', align: 'center', opacity: 0.5 }] },
    { id: 'tc-typewriter', label: 'Typewriter',    cat: 'title',   preview: 'tc', anim: 'typewriter',
      elements: [{ type: 'text', text: 'Type your title...', x: 'center', y: 195, fontSize: 32, fill: '#ffffff', fontFamily: 'Courier New', align: 'center' }] },
    { id: 'tc-parallax',   label: 'Parallax',      cat: 'title',   preview: 'tc', anim: 'slideUp',
      elements: [{ type: 'text', text: 'BIG', x: 'center', y: 160, fontSize: 72, fontWeight: 'bold', fill: 'rgba(255,255,255,0.1)', align: 'center' },
                 { type: 'text', text: 'SMALL', x: 'center', y: 210, fontSize: 24, fontWeight: 'bold', fill: '#ffffff', align: 'center' }] },

    // End Screens
    { id: 'es-subscribe',  label: 'Subscribe CTA', cat: 'end',     preview: 'es', anim: 'scaleIn',
      elements: [{ type: 'rect', x: 'center', y: 160, w: 200, h: 50, fill: '#ef4444', radius: 25 },
                 { type: 'text', text: 'SUBSCRIBE', x: 'center', y: 180, fontSize: 20, fontWeight: 'bold', fill: '#ffffff', align: 'center' },
                 { type: 'text', text: 'Thanks for watching!', x: 'center', y: 240, fontSize: 16, fill: '#aaaaaa', align: 'center' }] },
    { id: 'es-social',     label: 'Social Links',  cat: 'end',     preview: 'es', anim: 'fadeIn',
      elements: [{ type: 'text', text: 'Follow Me', x: 'center', y: 150, fontSize: 28, fontWeight: 'bold', fill: '#ffffff', align: 'center' },
                 { type: 'text', text: '@username', x: 'center', y: 200, fontSize: 20, fill: '#f2ff58', align: 'center' },
                 { type: 'text', text: 'YouTube • Instagram • TikTok', x: 'center', y: 240, fontSize: 14, fill: '#888', align: 'center' }] },
    { id: 'es-credits',    label: 'Credits Roll',  cat: 'end',     preview: 'es', anim: 'slideUp',
      elements: [{ type: 'text', text: 'CREDITS', x: 'center', y: 100, fontSize: 24, fontWeight: 'bold', fill: '#f2ff58', align: 'center' },
                 { type: 'text', text: 'Directed by\nYour Name\n\nEdited by\nYour Name\n\nMusic by\nArtist', x: 'center', y: 160, fontSize: 16, fill: '#ccc', align: 'center', lineHeight: 1.6 }] },

    // Callouts
    { id: 'co-bubble',     label: 'Speech Bubble', cat: 'callout', preview: 'co', anim: 'bounceIn',
      elements: [{ type: 'rect', x: 60, y: 120, w: 260, h: 70, fill: '#ffffff', radius: 16 },
                 { type: 'text', text: 'Your text here', x: 80, y: 152, fontSize: 16, fill: '#0b0b0d' }] },
    { id: 'co-arrow',      label: 'Arrow Label',   cat: 'callout', preview: 'co', anim: 'slideUp',
      elements: [{ type: 'line', x1: 100, y1: 200, x2: 200, y2: 150, stroke: '#f2ff58', lineWidth: 3 },
                 { type: 'text', text: 'Look here!', x: 205, y: 148, fontSize: 14, fontWeight: 'bold', fill: '#f2ff58' }] },
    { id: 'co-highlight',  label: 'Highlight Box', cat: 'callout', preview: 'co', anim: 'fadeIn',
      elements: [{ type: 'rect', x: 80, y: 140, w: 300, h: 60, fill: 'rgba(242, 255, 88,0.15)', stroke: '#f2ff58', strokeWidth: 2, radius: 8 },
                 { type: 'text', text: 'Important note!', x: 100, y: 168, fontSize: 16, fontWeight: 'bold', fill: '#f2ff58' }] },

    // Social
    { id: 'so-ig',         label: 'IG Handle',     cat: 'social',  preview: 'so', anim: 'slideUp',
      elements: [{ type: 'rect', x: 30, y: 350, w: 180, h: 36, fill: 'rgba(0,0,0,0.7)', radius: 18 },
                 { type: 'text', text: '📷 @username', x: 48, y: 370, fontSize: 14, fill: '#ffffff' }] },
    { id: 'so-yt',         label: 'YT Subscribe',  cat: 'social',  preview: 'so', anim: 'bounceIn',
      elements: [{ type: 'rect', x: 'center', y: 330, w: 160, h: 40, fill: '#ef4444', radius: 4 },
                 { type: 'text', text: '▶ SUBSCRIBE', x: 'center', y: 354, fontSize: 14, fontWeight: 'bold', fill: '#fff', align: 'center' }] },
    { id: 'so-tiktok',     label: 'TikTok Follow', cat: 'social',  preview: 'so', anim: 'scaleIn',
      elements: [{ type: 'rect', x: 'center', y: 330, w: 140, h: 40, fill: '#000000', radius: 6, stroke: '#ff0050', strokeWidth: 2 },
                 { type: 'text', text: '♪ Follow', x: 'center', y: 354, fontSize: 14, fontWeight: 'bold', fill: '#ffffff', align: 'center' }] }
  ];

  var CATEGORIES = [
    { id: 'all',     label: 'All' },
    { id: 'lower',   label: 'Lower Thirds' },
    { id: 'title',   label: 'Title Cards' },
    { id: 'end',     label: 'End Screens' },
    { id: 'callout', label: 'Callouts' },
    { id: 'social',  label: 'Social' }
  ];

  function _icon(name, sz) {
    if (typeof getIcon === 'function') { var r = getIcon(name, sz || 14); if (r) return r; }
    return '';
  }

  // ── Draw template thumbnail ──
  function _drawThumb(cvs, template) {
    var ctx = cvs.getContext('2d');
    var w = cvs.width, h = cvs.height;
    var sx = w / 480, sy = h / 400;

    ctx.clearRect(0, 0, w, h);
    // Dark background
    ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, w, h);

    template.elements.forEach(function(el) {
      ctx.save();
      var ex = typeof el.x === 'string' ? w / 2 : el.x * sx;
      var ey = el.y * sy;

      if (el.type === 'rect') {
        ctx.fillStyle = el.fill || '#fff';
        ctx.globalAlpha = el.opacity || 1;
        var rw = (typeof el.w === 'string' ? w : el.w * sx);
        var rh = (typeof el.h === 'string' ? h : el.h * sy);
        var rx = typeof el.x === 'string' ? (w - rw) / 2 : el.x * sx;
        ctx.fillRect(rx, ey, rw, rh);
        if (el.stroke) { ctx.strokeStyle = el.stroke; ctx.lineWidth = (el.strokeWidth || 1) * sx; ctx.strokeRect(rx, ey, rw, rh); }
      } else if (el.type === 'text') {
        ctx.fillStyle = el.fill || '#fff';
        ctx.globalAlpha = el.opacity || 1;
        ctx.font = (el.fontWeight ? el.fontWeight + ' ' : '') + Math.max(7, Math.round((el.fontSize || 14) * sx)) + 'px sans-serif';
        ctx.textAlign = el.align || 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(el.text.split('\n')[0], ex, ey);
      } else if (el.type === 'line') {
        ctx.strokeStyle = el.stroke || '#fff';
        ctx.lineWidth = (el.lineWidth || 1) * sx;
        ctx.beginPath();
        ctx.moveTo((typeof el.x1 === 'string' ? w * 0.3 : el.x1 * sx), el.y1 * sy);
        ctx.lineTo((typeof el.x2 === 'string' ? w * 0.7 : el.x2 * sx), el.y2 * sy);
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  function _buildPanel() {
    if (_panel) return _panel;
    _panel = document.createElement('div');
    _panel.className = 've-text-templates';
    _panel.style.cssText = 'position:fixed;top:80px;left:60px;width:360px;max-height:540px;' +
      'background:var(--surface2,#1b1b1f);border:1px solid var(--border,#27272d);border-radius:10px;' +
      'box-shadow:0 8px 32px rgba(0,0,0,.55);z-index:10050;display:none;flex-direction:column;overflow:hidden;';

    var html = '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--border,#27272d);">' +
      '<span style="color:var(--text,#ededf0);font-weight:600;font-size:13px;">' + _icon('type', 16) + ' Text Templates</span>' +
      '<button id="ve-txttpl-close" style="background:none;border:none;color:var(--text-dim,#888);cursor:pointer;font-size:16px;">✕</button></div>';

    // Tabs
    html += '<div style="display:flex;gap:2px;padding:6px 8px;overflow-x:auto;border-bottom:1px solid var(--border,#27272d);">';
    CATEGORIES.forEach(function(c) {
      html += '<button class="ve-txttpl-tab" data-cat="' + c.id + '" ' +
        'style="padding:4px 8px;border-radius:6px;border:none;font-size:10px;cursor:pointer;white-space:nowrap;' +
        'background:' + (c.id === 'all' ? 'var(--gold,#f2ff58)' : 'var(--surface3,#232328)') + ';' +
        'color:' + (c.id === 'all' ? '#0b0b0d' : 'var(--text-dim,#888)') + ';">' + c.label + '</button>';
    });
    html += '</div>';

    // Grid
    html += '<div id="ve-txttpl-grid" class="ve-panel-scroll" style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;padding:10px;overflow-y:auto;flex:1;max-height:400px;"></div>';

    _panel.innerHTML = html;
    document.body.appendChild(_panel);

    _panel.querySelector('#ve-txttpl-close').addEventListener('click', _hide);
    _panel.addEventListener('click', function(e) {
      var tab = e.target.closest('.ve-txttpl-tab');
      if (tab) {
        _activeCategory = tab.dataset.cat;
        _panel.querySelectorAll('.ve-txttpl-tab').forEach(function(t) {
          var active = t.dataset.cat === _activeCategory;
          t.style.background = active ? 'var(--gold,#f2ff58)' : 'var(--surface3,#232328)';
          t.style.color = active ? '#0b0b0d' : 'var(--text-dim,#888)';
        });
        _renderGrid();
      }
    });

    _renderGrid();
    if (window.VEPanelHelpers) VEPanelHelpers.decorate(_panel);
    return _panel;
  }

  function _renderGrid() {
    var container = _panel.querySelector('#ve-txttpl-grid');
    if (!container) return;
    container.innerHTML = '';

    var filtered = _activeCategory === 'all' ? TEMPLATES : TEMPLATES.filter(function(t) { return t.cat === _activeCategory; });

    filtered.forEach(function(tpl) {
      var card = document.createElement('div');
      card.className = 've-txttpl-card';
      card.style.cssText = 'cursor:pointer;border-radius:8px;overflow:hidden;border:2px solid transparent;' +
        'background:var(--surface3,#232328);transition:border-color .15s;';

      var cvs = document.createElement('canvas');
      cvs.width = 160; cvs.height = 90;
      cvs.style.cssText = 'width:100%;height:auto;display:block;';
      _drawThumb(cvs, tpl);

      var lbl = document.createElement('div');
      lbl.style.cssText = 'font-size:10px;color:var(--text,#ededf0);text-align:center;padding:4px 2px;';
      lbl.textContent = tpl.label;

      card.appendChild(cvs);
      card.appendChild(lbl);

      card.addEventListener('mouseenter', function() { card.style.borderColor = 'var(--gold,#f2ff58)'; });
      card.addEventListener('mouseleave', function() { card.style.borderColor = 'transparent'; });
      card.addEventListener('click', function() { _addTemplate(tpl); });

      container.appendChild(card);
    });
  }

  // ── Add template as text overlay on Fabric.js canvas ──
  function _addTemplate(tpl) {
    if (typeof canvas === 'undefined' || !canvas) {
      if (typeof showToast === 'function') showToast('Canvas not ready', 'error');
      return;
    }

    var mainText = '';
    tpl.elements.forEach(function(el) { if (el.type === 'text' && !mainText) mainText = el.text; });

    // Create Fabric.js textbox on canvas — the overlay sync in video-editor.js
    // will auto-create a timeline clip when the object is added
    var textObj = new fabric.Textbox(mainText || tpl.label, {
      left: 80,
      top: 260,
      width: 350,
      fontSize: 24,
      fontWeight: 'bold',
      fill: '#ffffff',
      fontFamily: 'Inter, sans-serif',
      textAlign: 'left',
      shadow: 'rgba(0,0,0,0.5) 2px 2px 4px',
      _veTextTemplate: tpl.id,
      _veAnim: tpl.anim || 'fadeIn'
    });

    canvas.add(textObj);
    canvas.setActiveObject(textObj);
    canvas.renderAll();

    if (typeof showToast === 'function') showToast('Text added: ' + tpl.label);
  }

  function _show() { _buildPanel().style.display = 'flex'; _isOpen = true; }
  function _hide() { if (_panel) _panel.style.display = 'none'; _isOpen = false; }
  function _toggle() { _isOpen ? _hide() : _show(); }

  window.VETextTemplates = {
    show: _show, hide: _hide, toggle: _toggle,
    isOpen: function() { return _isOpen; },
    TEMPLATES: TEMPLATES,
    addTemplate: _addTemplate
  };
})();

// Modular skeleton hook (Faz 8) — ve-text-templates is now a video loader module (modules/video/). Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-text-templates', parent: 'video', title: 've-text-templates', mount: function () {}, unmount: function () {} });
