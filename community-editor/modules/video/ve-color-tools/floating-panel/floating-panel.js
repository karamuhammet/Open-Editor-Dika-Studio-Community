/* Module: video/ve-color-tools/floating-panel — the floating panel shell: drag, snap, persist.

   WHY THIS EXISTS: the multicam monitor has a drag implementation (monitor.js:518) and SmartCam has
   a SECOND copy of the same code (smartcam.js:730). The colour toolbar and the LUT browser needed
   the same behaviour, which would have made four copies of one 20-line idiom. This is that idiom,
   once.

   Not retrofitted onto monitor.js / smartcam.js: those work today, and rewiring two shipped panels
   is a shared-seam change that needs the owner's call. Flagged in docs/power-windows-plan.md. New
   surfaces use this; the old two keep their copies until that call is made. */
(function () {
  'use strict';

  var VEFloat = {
    /* Make `panel` draggable by `handle`, clamped to the viewport, position remembered under `key`.
       Returns a dispose function: a floating panel that outlives its surface is how transient UI
       becomes a bug. */
    drag: function (panel, handle, key) {
      if (!panel || !handle) return function () {};
      var onDown = function (e) {
        if (e.target.closest && e.target.closest('button, input, select, textarea, a')) return;
        var sx = e.clientX, sy = e.clientY;
        var sl = parseInt(panel.style.left, 10) || panel.getBoundingClientRect().left;
        var st = parseInt(panel.style.top, 10) || panel.getBoundingClientRect().top;
        // Anchoring by left/top only: a panel positioned with `right` would jump the moment the
        // first drag writes `left`, because both would then apply.
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        function mv(ev) {
          panel.style.left = Math.max(0, Math.min(window.innerWidth - 60, sl + ev.clientX - sx)) + 'px';
          panel.style.top = Math.max(0, Math.min(window.innerHeight - 40, st + ev.clientY - sy)) + 'px';
        }
        function up() {
          document.removeEventListener('mousemove', mv);
          document.removeEventListener('mouseup', up);
          VEFloat.savePos(panel, key);
        }
        document.addEventListener('mousemove', mv);
        document.addEventListener('mouseup', up);
        e.preventDefault();
      };
      handle.addEventListener('mousedown', onDown);
      handle.style.cursor = 'move';
      return function () { handle.removeEventListener('mousedown', onDown); };
    },

    savePos: function (panel, key) {
      if (!key) return;
      try {
        localStorage.setItem('cc.float.' + key, JSON.stringify({
          l: parseInt(panel.style.left, 10) || 0,
          t: parseInt(panel.style.top, 10) || 0,
          w: parseInt(panel.style.width, 10) || 0,
          h: parseInt(panel.style.height, 10) || 0
        }));
      } catch (e) {}
    },

    /* Restore, but only onto a screen the panel can actually be seen on. A position saved on a wide
       monitor puts the panel off-screen on a laptop, where it is unreachable AND undraggable because
       its handle is outside the viewport. */
    restorePos: function (panel, key) {
      if (!key) return false;
      var v;
      try { v = JSON.parse(localStorage.getItem('cc.float.' + key) || 'null'); } catch (e) { return false; }
      if (!v) return false;
      var l = Math.max(0, Math.min(window.innerWidth - 60, v.l));
      var t = Math.max(0, Math.min(window.innerHeight - 40, v.t));
      panel.style.left = l + 'px';
      panel.style.top = t + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      if (v.w > 0) panel.style.width = Math.min(v.w, window.innerWidth - l) + 'px';
      if (v.h > 0) panel.style.height = Math.min(v.h, window.innerHeight - t) + 'px';
      return true;
    },

    /* Persist a size the user set with a CSS `resize` grip. ResizeObserver is the obvious hook and
       the wrong one: it also fires for layout-driven resizes, which would overwrite the user's
       chosen size with an incidental one. The grip is dragged with a mouse, so mouseup is the
       trigger. */
    persistResize: function (panel, key) {
      var onUp = function () { VEFloat.savePos(panel, key); };
      panel.addEventListener('mouseup', onUp);
      return function () { panel.removeEventListener('mouseup', onUp); };
    },

    /* POP OUT into a real second window, the SmartCam monitor idiom (owner: "pencere açma butonu
       ver, smartcam modalındaki gibi"). adoptNode moves the LIVE panel across documents without
       re-creating it, so every listener keeps working in the same JS context; the stylesheets are
       cloned so it looks identical. One implementation, shared by the LUT browser, Colour Grading
       and Renk Araçları, rather than three copies. */
    isPopped: function (panel) { return !!(panel && panel.__popWin && !panel.__popWin.closed); },

    popOut: function (panel, title) {
      if (!panel) return null;
      if (VEFloat.isPopped(panel)) { try { panel.__popWin.focus(); } catch (e) {} return panel.__popWin; }
      var w = window.open('', '', 'width=520,height=700,menubar=no,toolbar=no,location=no');
      if (!w) return null;
      var d = w.document;
      d.write('<!doctype html><html><head><meta charset="utf-8"><title>' + (title || 'dika studio') + '</title></head><body></body></html>');
      d.close();
      Array.prototype.forEach.call(document.querySelectorAll('link[rel="stylesheet"], style'),
        function (n) { try { d.head.appendChild(n.cloneNode(true)); } catch (e) {} });
      d.body.style.cssText = 'margin:0;padding:0;background:#131316;overflow:auto;';
      // Stash and strip the floating inline geometry: inline styles beat the .is-popped rule, so
      // leaving them would keep the panel at its old corner size inside the new window.
      panel.__popPrev = { left: panel.style.left, top: panel.style.top, right: panel.style.right,
                          bottom: panel.style.bottom, width: panel.style.width, height: panel.style.height };
      panel.classList.add('is-popped');
      panel.style.left = panel.style.top = panel.style.right = panel.style.bottom = panel.style.width = panel.style.height = '';
      d.body.appendChild(d.adoptNode(panel));
      w.addEventListener('beforeunload', function () { VEFloat.popIn(panel); });
      panel.__popWin = w;
      return w;
    },

    popIn: function (panel) {
      if (!panel) return;
      var w = panel.__popWin; panel.__popWin = null;
      panel.classList.remove('is-popped');
      try { if (!document.body.contains(panel)) document.body.appendChild(document.adoptNode(panel)); } catch (e) {}
      var p = panel.__popPrev || {};
      panel.style.left = p.left || ''; panel.style.top = p.top || '';
      panel.style.right = p.right || ''; panel.style.bottom = p.bottom || '';
      panel.style.width = p.width || ''; panel.style.height = p.height || '';
      if (w && !w.closed) { try { w.close(); } catch (e) {} }
    }
  };

  window.VEFloat = VEFloat;

  if (window.cc && cc.modules) cc.modules.register({
    id: 'floating-panel', parent: 'video.ve-color-tools',
    title: 'floating-panel', mount: function () {}, unmount: function () {}
  });
})();
