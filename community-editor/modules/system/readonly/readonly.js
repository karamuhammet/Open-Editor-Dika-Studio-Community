/* ============================================================
   system/readonly — THE read-only mode of the editor. One module owns it.

   Why it exists: `portal-bridge _pbApplyPermissions({canEdit:false})` only set
   `canvas.selection = false` plus `selectable/evented = false` on the objects that existed AT THAT
   MOMENT. Toolbars, both side panels, keyboard shortcuts, page add/delete and every object created
   afterwards stayed fully interactive, so a person invited as a VIEWER could type, drag and delete.
   Nothing persisted (remote autosave is off for a shared session), but the UI lied about what they
   were allowed to do.

   Design rules that must survive any edit:
   - ONE switch. `window.__ccReadOnly` + `CCReadOnly.enable()/disable()`. Never scatter
     `if (canEdit)` checks through modules again; that scattering IS how the half-lock happened.
   - DENY BY DEFAULT. Interaction is swallowed at capture phase unless its target sits inside the
     ALLOW list below. A module that ships next month therefore cannot silently re-open a write path.
   - THREE independent layers, because any one of them can be bypassed:
       (a) canvas lock  - selection off, skipTargetFind, per-object lock + an `object:added` hook so
                          a NEW object inherits the lock,
       (b) DOM lock     - capture-phase interception + a CSS class that HIDES the write surfaces
                          (a greyed-out panel that does nothing is still a lie),
       (c) function lock- the document-mutating globals are wrapped, so a programmatic caller (AI,
                          radial menu, drag-drop, a slide-strip button) fails closed too.
   - REVERSIBLE IN ONE CALL. Everything wrapped keeps its original; `disable()` puts it all back.
     When co-editing lands, an `edit`-role grantee leaves read-only with `CCReadOnly.disable()`.
   - It never touches the DOCUMENT. Read-only is about input, not about content.
   ============================================================ */
(function () {
  'use strict';

  var MSG = 'View-only access. You cannot edit this project.';

  var ON = false;
  var WHY = '';
  var _prevCanvas = null;   // canvas flags captured at enable()
  var _wraps = [];          // [{ name, orig }]
  var _binds = [];          // [[target, type, fn, capture]]
  var _watch = null;
  var _toastT = null;
  var _lastNotice = 0;
  var _canvasHooks = null;

  /* Interactive surfaces that stay LIVE in read-only: navigation, zoom, playback, presence.
     Anything not matched here is blocked. `CCReadOnly.allow('#sel')` extends it at runtime. */
  var ALLOW = [
    // presence / session chrome
    '#cc-collab-bar', '#cc-collab-roster', '#cc-collab-syncbar', '#cc-collab-overlay',
    '#cc-guest-bar', '#cc-guest-error', '#cc-shared-loading', '#cc-ro-toast',
    // topbar leftovers that only navigate
    '.dika-logo', '#size-badge',
    // the canvas itself: what happens there is governed by the canvas lock, not by this list,
    // otherwise panning and the zoom gestures would die with it
    '#card-stage-container', '.pan-overlay', '.zoom-pill',
    /* page / slide NAVIGATION only. `#slide-strip-host` used to be allowed whole, which was a real
       hole: the deck's action cluster lives inside it, so a viewer could add a slide and write speaker
       notes. The strip (cards + arrows) navigates; `.sd-act-preview` opens presentation mode, which
       reads. Everything else in `.sd-actions` writes and is hidden by the CSS half. */
    '.page-tab', '.pg-group-chip', '.pg-quicknav-btn', '#page-preview-btn', '.sd-strip', '.sd-act-preview',
    // video: transport and the ruler only. Clips, track headers and the edit tools are not here.
    '.ve-tb-center', '.ve-ruler', '#ve-btn-fullscreen', '#ve-rate-select'
  ];

  /* Document-mutating globals. Wrapped, never deleted. `setCustomCanvasSize` and `loadCardData` are
     deliberately ABSENT: the shared document's own load path calls them, and guarding them would
     open a project at the wrong size or not at all. */
  var GUARD = [
    'addToCenter', 'delSelected', 'addPage', 'removePage', 'duplicatePage',
    'newBlankCanvas', 'saveAsTemplate', 'importCardFile', 'saveCardFile',
    'undo', 'redo', 'toggleShareMenu', 'ctxAction', 'applySavedTemplate'
  ];

  /* Keys that still do something useful while viewing. Everything else is stopped BEFORE
     shortcuts.js sees it (this listener is bound on `window` capture, which runs first). */
  var KEY_OK = {
    Escape: 1, Tab: 1, ' ': 1, Spacebar: 1, Enter: 0,
    ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1,
    Home: 1, End: 1, PageUp: 1, PageDown: 1,
    F5: 1, F11: 1, F12: 1
  };
  /* Ctrl/Cmd combos the app uses destructively. Everything else with a modifier (copy, select-all,
     browser find, reload, print) is left alone on purpose: a viewer keeps their browser. */
  var CTRL_BLOCK = { z: 1, y: 1, x: 1, v: 1, d: 1, s: 1, g: 1, b: 1, i: 1, u: 1, e: 1, k: 1, j: 1 };

  // ── helpers ───────────────────────────────────────────────
  function el(node) {
    if (!node) return null;
    return node.nodeType === 1 ? node : (node.parentElement || null);
  }

  function allowed(node) {
    var n = el(node);
    if (!n || !n.closest) return false;
    for (var i = 0; i < ALLOW.length; i++) {
      try { if (n.closest(ALLOW[i])) return true; } catch (e) {}
    }
    return false;
  }

  function isTypingField(node) {
    var n = el(node);
    if (!n) return false;
    var t = (n.tagName || '').toLowerCase();
    return t === 'input' || t === 'textarea' || t === 'select' || n.isContentEditable === true;
  }

  function notice(msg) {
    var now = new Date().getTime();
    if (now - _lastNotice < 2500) return;   // one voice, not a stutter
    _lastNotice = now;
    var t = document.getElementById('cc-ro-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'cc-ro-toast';
      t.className = 'cc-ro-toast';
      t.setAttribute('role', 'status');
      document.body.appendChild(t);
    }
    t.textContent = msg || MSG;
    t.classList.add('is-on');
    if (_toastT) clearTimeout(_toastT);
    _toastT = setTimeout(function () { t.classList.remove('is-on'); }, 2600);
  }

  function bind(target, type, fn, capture) {
    target.addEventListener(type, fn, capture);
    _binds.push([target, type, fn, capture]);
  }

  function unbindAll() {
    for (var i = 0; i < _binds.length; i++) {
      try { _binds[i][0].removeEventListener(_binds[i][1], _binds[i][2], _binds[i][3]); } catch (e) {}
    }
    _binds = [];
  }

  // ── (a) canvas lock ───────────────────────────────────────
  function lockObject(o) {
    if (!o) return;
    o.selectable = false;
    o.evented = false;
    o.editable = false;
    o.hasControls = false;
    o.hasBorders = false;
    o.lockMovementX = true;
    o.lockMovementY = true;
    o.lockRotation = true;
    o.lockScalingX = true;
    o.lockScalingY = true;
  }

  function canvasNow() {
    if (typeof window.getActiveCanvas === 'function') {
      try { return window.getActiveCanvas(); } catch (e) {}
    }
    return (typeof window.canvas !== 'undefined') ? window.canvas : null;
  }

  function applyCanvasLock() {
    var cv = canvasNow();
    if (!cv) return;
    cv.selection = false;
    cv.skipTargetFind = true;
    cv.isDrawingMode = false;
    cv.defaultCursor = 'default';
    cv.hoverCursor = 'default';
    try { cv.forEachObject(lockObject); } catch (e) {}
    if (cv.getActiveObject && cv.getActiveObject()) {
      try { cv.discardActiveObject(); } catch (e) {}
    }
    if (!_canvasHooks) {
      _canvasHooks = {
        cv: cv,
        added: function (e) { lockObject(e && e.target); },
        sel: function () { try { cv.discardActiveObject(); cv.requestRenderAll(); } catch (er) {} }
      };
      cv.on('object:added', _canvasHooks.added);
      cv.on('selection:created', _canvasHooks.sel);
      cv.on('selection:updated', _canvasHooks.sel);
    }
    try { cv.requestRenderAll(); } catch (e) {}
  }

  function releaseCanvasLock() {
    var cv = (_canvasHooks && _canvasHooks.cv) || canvasNow();
    if (_canvasHooks && _canvasHooks.cv) {
      try {
        _canvasHooks.cv.off('object:added', _canvasHooks.added);
        _canvasHooks.cv.off('selection:created', _canvasHooks.sel);
        _canvasHooks.cv.off('selection:updated', _canvasHooks.sel);
      } catch (e) {}
    }
    _canvasHooks = null;
    if (!cv || !_prevCanvas) return;
    cv.selection = _prevCanvas.selection;
    cv.skipTargetFind = _prevCanvas.skipTargetFind;
    cv.defaultCursor = _prevCanvas.defaultCursor;
    cv.hoverCursor = _prevCanvas.hoverCursor;
    try {
      cv.forEachObject(function (o) {
        o.selectable = true; o.evented = true;
        o.hasControls = true; o.hasBorders = true;
        o.lockMovementX = false; o.lockMovementY = false;
        o.lockRotation = false; o.lockScalingX = false; o.lockScalingY = false;
      });
      cv.requestRenderAll();
    } catch (e) {}
  }

  // ── (b) DOM lock ──────────────────────────────────────────
  function swallow(e) {
    if (!ON) return;
    if (allowed(e.target)) return;
    e.stopImmediatePropagation();
    e.stopPropagation();
    if (e.type === 'contextmenu' || e.type === 'dragstart' || e.type === 'dblclick') e.preventDefault();
    if (e.type === 'mousedown' || e.type === 'pointerdown') notice(MSG);
  }

  // Data entering the document from outside never has an allowed target: always refused.
  function swallowHard(e) {
    if (!ON) return;
    e.stopImmediatePropagation();
    e.stopPropagation();
    e.preventDefault();
    if (e.type === 'drop' || e.type === 'paste') notice(MSG);
  }

  function onKey(e) {
    if (!ON) return;
    // typing inside an allowed surface (roster search, a comment box later) stays typing
    if (isTypingField(e.target) && allowed(e.target)) return;
    var k = e.key;
    if (e.ctrlKey || e.metaKey) {
      var low = (k || '').toLowerCase();
      if (!CTRL_BLOCK[low]) return;
      if (low === 's') e.preventDefault();   // else the browser's Save Page dialog opens instead
      e.stopImmediatePropagation();
      e.stopPropagation();
      notice(MSG);
      return;
    }
    if (e.altKey) { e.stopImmediatePropagation(); e.stopPropagation(); return; }
    if (KEY_OK[k]) return;
    e.stopImmediatePropagation();
    e.stopPropagation();
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); notice(MSG); }
  }

  // ── (c) function lock ─────────────────────────────────────
  function wrapGlobals() {
    for (var i = 0; i < GUARD.length; i++) {
      var name = GUARD[i];
      if (typeof window[name] !== 'function' || window[name].__ccRO) continue;
      _wraps.push({ name: name, orig: window[name] });
      window[name] = (function (fn) {
        function guarded() {
          if (ON) { notice(MSG); return undefined; }
          return fn.apply(this, arguments);
        }
        guarded.__ccRO = true;
        return guarded;
      })(window[name]);
    }
  }

  function unwrapGlobals() {
    for (var i = _wraps.length - 1; i >= 0; i--) {
      if (window[_wraps[i].name] && window[_wraps[i].name].__ccRO) window[_wraps[i].name] = _wraps[i].orig;
    }
    _wraps = [];
  }

  // ── public API ────────────────────────────────────────────
  function enable(why) {
    if (ON) return true;
    var cv = canvasNow();
    _prevCanvas = cv ? {
      selection: cv.selection,
      skipTargetFind: cv.skipTargetFind,
      defaultCursor: cv.defaultCursor,
      hoverCursor: cv.hoverCursor
    } : null;

    ON = true;
    WHY = why || 'shared';
    window.__ccReadOnly = true;
    document.body.classList.add('cc-readonly');
    document.body.setAttribute('data-cc-readonly', WHY);

    applyCanvasLock();
    wrapGlobals();

    // window capture runs before document capture, which is where shortcuts.js binds.
    bind(window, 'keydown', onKey, true);
    ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'dragstart'].forEach(function (t) {
      bind(window, t, swallow, true);
    });
    ['drop', 'dragover', 'paste', 'cut'].forEach(function (t) {
      bind(window, t, swallowHard, true);
    });

    // A module can re-open the canvas (video activate, scene enter, a page switch rebuilding objects).
    // A cheap re-assert is the only thing that survives all of them without a hook per subsystem.
    _watch = setInterval(applyCanvasLock, 1000);

    // Both side panels just left the layout; let the canvas re-fit into the space.
    setTimeout(function () {
      try { window.dispatchEvent(new Event('resize')); } catch (e) {}
      if (typeof window.resetView === 'function') { try { window.resetView(); } catch (e) {} }
    }, 60);

    if (window.cc && cc.emit) { try { cc.emit('cc:readonly', { on: true, reason: WHY }); } catch (e) {} }
    return true;
  }

  function disable() {
    if (!ON) return false;
    ON = false;
    window.__ccReadOnly = false;
    document.body.classList.remove('cc-readonly');
    document.body.removeAttribute('data-cc-readonly');
    if (_watch) { clearInterval(_watch); _watch = null; }
    unbindAll();
    unwrapGlobals();
    releaseCanvasLock();
    _prevCanvas = null;
    setTimeout(function () { try { window.dispatchEvent(new Event('resize')); } catch (e) {} }, 60);
    if (window.cc && cc.emit) { try { cc.emit('cc:readonly', { on: false, reason: WHY }); } catch (e) {} }
    WHY = '';
    return true;
  }

  window.CCReadOnly = {
    enable: enable,
    disable: disable,
    active: function () { return ON; },
    reason: function () { return WHY; },
    notice: notice,
    /** Let another module keep ONE of its surfaces interactive (e.g. the comment layer, later). */
    allow: function (sel) { if (sel && ALLOW.indexOf(sel) < 0) ALLOW.push(sel); }
  };

  /* Self-arming. A guest (`?view=`) is always read-only; a grantee (`?shared=`) is read-only unless
     their grant says `edit`. `__ccReadOnlyWanted` is guest-view's fallback flag for the case where it
     asked before this module had loaded. */
  function shouldArm() {
    if (window.__ccReadOnlyWanted) return true;
    if (!window.__ccGuestView) return false;
    var meta = window.__ccSharedMeta;
    var role = (meta && meta.role) || window.__ccSharedRole || 'view';
    /* This runs at `cc:canvas-ready`, which is BEFORE the grant fetch resolves, so `role` is still
       'view' here even for an `edit` grantee. That is correct TODAY: co-editing is not built, so an
       edit grantee who could type would be writing into a document that never syncs and never saves,
       which is a worse lie than the lock. When the Yjs binding lands, the ONE seam that opens it is
       `CCReadOnly.disable()` once the room reports an editable session. Do not weaken the default. */
    return role !== 'edit';
  }

  function arm() {
    if (!shouldArm()) return;
    enable(window.__ccGuestView && String(window.__ccGuestView).indexOf('shared:') === 0 ? 'shared' : 'guest');
  }

  if (window.cc && cc.on) {
    cc.on('cc:canvas-ready', function () { cc.safe('system.readonly', arm); });
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arm);
  } else {
    arm();
  }

  if (window.cc && cc.modules) {
    cc.modules.register({
      id: 'readonly',
      parent: 'system',
      title: 'Read-only mode',
      mount: function () {},
      unmount: function () { disable(); }
    });
  }
})();
