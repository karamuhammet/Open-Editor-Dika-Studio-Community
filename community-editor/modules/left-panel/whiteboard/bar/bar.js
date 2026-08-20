/* Module: left-panel/whiteboard/bar — Floating board toolbar (build/drag/destroy/highlight/zen).
   Part of the whiteboard group (decomposed from the 1237-line IIFE). Functions hang off the
   shared namespace WB (window.__ccWhiteboard, created by the parent); cross-module refs resolve
   through WB at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var WB = window.__ccWhiteboard;
  if (!WB) return;

  WB.buildBar = function () {
    if (WB._barEl) WB._barEl.remove();
    var bar = document.createElement('div');
    bar.id = 'wb-floating-bar';
    if (WB._barCollapsed) bar.classList.add('wb-bar-collapsed');

    /* ── Drag handle (vertical grip dots) — grab to move the bar ── */
    var handle = document.createElement('span');
    handle.className = 'wb-bar-handle';
    handle.title = 'Drag to move the bar';
    handle.innerHTML = '<svg width="8" height="20" viewBox="0 0 8 20" fill="currentColor">' +
      '<circle cx="2" cy="3" r="1.3"/><circle cx="6" cy="3" r="1.3"/>' +
      '<circle cx="2" cy="10" r="1.3"/><circle cx="6" cy="10" r="1.3"/>' +
      '<circle cx="2" cy="17" r="1.3"/><circle cx="6" cy="17" r="1.3"/></svg>';
    bar.appendChild(handle);

    /* ── Collapsible tools container ── */
    var tools = document.createElement('span');
    tools.className = 'wb-bar-tools';

    WB.TOOLS.forEach(function (t) {
      if (t === null) {
        var sep = document.createElement('span');
        sep.className = 'wb-sep';
        tools.appendChild(sep);
        return;
      }
      var btn = document.createElement('button');
      btn.className = 'wb-fbtn';
      btn.setAttribute('data-tool', t.id);
      btn.title = t.label;
      btn.innerHTML = t.icon + '<span class="wb-key">' + t.key + '</span>';
      if (t.id === WB.wbTool) btn.classList.add('active');
      btn.onclick = function () { WB.setWbTool(t.id); };
      tools.appendChild(btn);
    });

    /* ── Zen Mode button ── */
    var zenSep = document.createElement('span');
    zenSep.className = 'wb-sep';
    tools.appendChild(zenSep);
    var zenBtn = document.createElement('button');
    zenBtn.className = 'wb-fbtn wb-zen-btn' + (WB._zenMode ? ' active' : '');
    zenBtn.id = 'wb-zen-btn';
    zenBtn.title = 'Zen Mode (Z)';
    zenBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>' +
      '<span class="wb-key">Z</span>';
    zenBtn.onclick = function () { WB.toggleZenMode(); };
    tools.appendChild(zenBtn);

    var zoomSep = document.createElement('span');
    zoomSep.className = 'wb-sep';
    tools.appendChild(zoomSep);
    var zoomLabel = document.createElement('span');
    zoomLabel.id = 'wb-zoom-label';
    zoomLabel.style.cssText = 'font-size:11px;color:var(--text-dim);min-width:36px;text-align:center;';
    zoomLabel.textContent = '100%';
    tools.appendChild(zoomLabel);

    bar.appendChild(tools);

    /* ── Collapse / expand toggle ── */
    var collapseBtn = document.createElement('button');
    collapseBtn.className = 'wb-fbtn wb-bar-collapse';
    collapseBtn.title = 'Collapse / expand bar';
    collapseBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
    collapseBtn.onclick = function () {
      WB._barCollapsed = !WB._barCollapsed;
      bar.classList.toggle('wb-bar-collapsed', WB._barCollapsed);
    };
    bar.appendChild(collapseBtn);

    document.body.appendChild(bar);
    WB._barEl = bar;
    WB._setupBarDrag(bar, handle);
    if (WB._barPos) { bar.style.left = WB._barPos.x + 'px'; bar.style.top = WB._barPos.y + 'px'; bar.style.bottom = 'auto'; bar.style.transform = 'none'; }

    /* Hover the pencil button → show the brush size/color popover */
    var drawBtn = tools.querySelector('[data-tool="draw"]');
    if (drawBtn) {
      drawBtn.addEventListener('mouseenter', function () { WB._showBrushPopover(drawBtn); });
      drawBtn.addEventListener('mouseleave', WB._hideBrushPopoverSoon);
    }
  };

  WB._setupBarDrag = function (bar, handle) {
    var sx, sy, sl, st, dragging = false;
    function onMove(e) {
      if (!dragging) return;
      var nl = sl + (e.clientX - sx), nt = st + (e.clientY - sy);
      nl = Math.max(4, Math.min(window.innerWidth  - bar.offsetWidth  - 4, nl));
      nt = Math.max(4, Math.min(window.innerHeight - bar.offsetHeight - 4, nt));
      bar.style.left = nl + 'px'; bar.style.top = nt + 'px';
      bar.style.bottom = 'auto'; bar.style.transform = 'none';
      WB._barPos = { x: nl, y: nt };
    }
    function onUp() { dragging = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
    handle.addEventListener('mousedown', function (e) {
      e.preventDefault();
      var r = bar.getBoundingClientRect();
      bar.style.left = r.left + 'px'; bar.style.top = r.top + 'px';
      bar.style.bottom = 'auto'; bar.style.transform = 'none';
      dragging = true; sx = e.clientX; sy = e.clientY; sl = r.left; st = r.top;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  };

  WB.toggleZenMode = function () {
    WB._zenMode = !WB._zenMode;
    document.body.classList.toggle('wb-zen', WB._zenMode);
    var btn = document.getElementById('wb-zen-btn');
    if (btn) btn.classList.toggle('active', WB._zenMode);

    /* resize canvas after transition */
    setTimeout(function () {
      if (!window.wbActive) return;
      var s = WB.areaSize();
      canvas.setWidth(s.w);
      canvas.setHeight(s.h);
      var stage = document.getElementById('card-stage');
      if (stage) {
        stage.style.width  = s.w + 'px';
        stage.style.height = s.h + 'px';
      }
      canvas.renderAll();
    }, 280);
  };

  WB.destroyBar = function () {
    WB._destroyBrushPopover();
    if (WB._barEl) { WB._barEl.remove(); WB._barEl = null; }
  };

  WB.highlightBar = function (tool) {
    if (!WB._barEl) return;
    WB._barEl.querySelectorAll('.wb-fbtn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tool') === tool);
    });
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'bar', parent: 'left-panel.whiteboard', title: 'whiteboard: bar', mount: function () {}, unmount: function () {} });
  }
})();
