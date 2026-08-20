/* core/view.js — canvas view: zoom + pan. Moved VERBATIM from js/app.js section 3 (Faz 3).
   applyView (re-applies the stage transform, ~26 callers), zoomBy / resetView (zoom-pill +
   shortcuts) and initZoomAndPan (init wiring). Kept flat global, loaded BEFORE app.js so the
   functions stay global and app.js initApp() still calls applyView() + initZoomAndPan().
   State (viewZoom/panX/panY, line ~46), CW/CH, splitMode, updateFloatTB, VideoCanvas remain
   app.js/other globals resolved at call time (also read by grid-layout/slide-deck/video-canvas). */
function applyView() {
  /* Selection chrome is drawn in CANVAS pixels while this function zooms the stage with a CSS
     transform, so handles and the rotate/move buttons shrink with the artwork (measured: 7.5px at
     the default 75%, 2.5px at the 25% minimum, hit area included). Compensate FIRST, before every
     early return below: whiteboard and scene return early because they zoom through fabric's own
     viewportTransform, and those are already screen-constant, so they must reset the factor to 1
     rather than keep whatever the last card page left behind. */
  if (typeof _ccApplyControlScale === 'function') {
    var _ownViewport = !!window.wbActive ||
      !!(window.SceneEditor && typeof SceneEditor.isActive === 'function' && SceneEditor.isActive());
    _ccApplyControlScale(_ownViewport ? 1 : (1 / (viewZoom || 1)));
  }
  var stage = document.getElementById('card-stage');
  if (!stage) return;
  if (window.wbActive) return;
  if (window.SceneEditor && SceneEditor.isActive()) return;  // scene owns its own viewport (frame-canvas)
  // Guard: enforce video canvas dimensions before applying view — ONLY in genuine video mode.
  // If VideoCanvas is left stale-active on a non-video page (a slide page sits right after a video
  // page in some documents), enforceDimensions() would otherwise hijack CW/CH to the video aspect
  // ratio on EVERY applyView. Zooming a 1600x900 slide then snapped it to the video ratio (a square
  // when the last video AR was 1:1) until an F5 reload. activeProduct is 'video' only in real video
  // mode, so this keeps enforcement working there and inert everywhere else.
  if (activeProduct === 'video' && typeof VideoCanvas !== 'undefined' && VideoCanvas.enforceDimensions) {
    VideoCanvas.enforceDimensions();
  }
  stage.style.width = CW + 'px';
  stage.style.height = CH + 'px';

  if (splitMode) return;

  var container = document.getElementById('card-stage-container');
  var isVideo = activeProduct === 'video' && typeof VideoCanvas !== 'undefined' && VideoCanvas.isActive && VideoCanvas.isActive();

  if (isVideo && container) {
    // Video mode: move scale() from container to stage so the container's
    // layout box matches the VISUAL size. Without this, the 1920px layout
    // box overflows canvas-area's overflow:hidden, clipping the canvas.
    var vw = Math.round(CW * viewZoom);
    var vh = Math.round(CH * viewZoom);
    container.style.width = vw + 'px';
    container.style.height = vh + 'px';
    container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.style.transform = 'translate(' + panX + 'px,' + panY + 'px)';
    stage.style.position = 'absolute';
    stage.style.left = '0';
    stage.style.top = '0';
    stage.style.transform = 'scale(' + viewZoom + ')';
    stage.style.transformOrigin = '0 0';
  } else if (container) {
    // Normal mode: scale on container, clear any video-mode overrides
    container.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + viewZoom + ')';
    container.style.width = '';
    container.style.height = '';
    container.style.position = '';
    container.style.overflow = '';
    stage.style.position = '';
    stage.style.left = '';
    stage.style.top = '';
    stage.style.transform = '';
    stage.style.transformOrigin = '';
  } else {
    stage.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + viewZoom + ')';
  }

  var zoomLabel = document.getElementById('zoom-label');
  if (zoomLabel) zoomLabel.textContent = Math.round(viewZoom * 100) + '%';
  updateFloatTB();
}

/* ── THE zoom range and THE step ─────────────────────────────────────────────────────────────
   One clamp, one step rule, three callers (the two buttons and the wheel). The floor is 5%: a
   full spread or a large board is unreadable at the old 25%.
   The step is PROPORTIONAL, not additive. A fixed +0.1 is a 40% jump at the bottom of the range
   and a 4% nudge at the top, and it would take a click from 25% straight past 15% to 5%; a
   multiplicative step feels identical everywhere and lands on every sane value in between. */
var CC_ZOOM_MIN = 0.05, CC_ZOOM_MAX = 2.5;
function _ccClampZoom(z) { return Math.max(CC_ZOOM_MIN, Math.min(CC_ZOOM_MAX, z || CC_ZOOM_MIN)); }
function _ccZoomStep(d) { return _ccClampZoom(viewZoom * Math.exp(d * 2)); }

function zoomBy(d) {
  viewZoom = _ccZoomStep(d);
  applyView();
  if (typeof _ccZoomHudWake === 'function') _ccZoomHudWake();
}

function resetView() {
  viewZoom = 0.75;
  panX = 0;
  panY = 0;
  applyView();
}

/* ── The zoom HUD: drag to move, fade while idle ─────────────────────────────────────────────
   Position is written INLINE and !important, because two other modules force `bottom` on this
   element (the slide strip lifts it above the deck, scene mode pins it right). A dragged HUD
   that then has `bottom` forced back on it while `top` is set would stretch to fill the gap,
   since its height is auto. */
var CC_ZOOM_POS_KEY = 'cc_zoom_hud_pos';
/* localStorage is measured FULL on a real working machine (5120 KB of 5 MB, `dika_versions__*`
   alone is most of it), and a full quota rejects a 25-byte write exactly like a 5 MB one. Writing
   only there would have made the dragged position a feature that silently never persists. sessionStorage
   has its own quota and survives a reload; it dies with the tab, which is the honest ceiling here. */
function _ccHudRead(k) {
  try { var v = localStorage.getItem(k); if (v) return v; } catch (e) {}
  try { return sessionStorage.getItem(k); } catch (e) {}
  return null;
}
function _ccHudWrite(k, v) {
  try { localStorage.setItem(k, v); return true; } catch (e) {}
  try { sessionStorage.setItem(k, v); return true; } catch (e) {}
  return false;
}
function _ccZoomPillPlace(x, y) {
  var pill = document.getElementById('zoom-pill');
  if (!pill) return;
  var p = pill.offsetParent || document.body;
  x = Math.max(0, Math.min(Math.max(0, p.clientWidth - pill.offsetWidth), x));
  y = Math.max(0, Math.min(Math.max(0, p.clientHeight - pill.offsetHeight), y));
  pill.style.setProperty('left', x + 'px', 'important');
  pill.style.setProperty('top', y + 'px', 'important');
  pill.style.setProperty('right', 'auto', 'important');
  pill.style.setProperty('bottom', 'auto', 'important');
  pill.style.setProperty('transform', 'none', 'important');
  pill._ccPos = { x: x, y: y };
}
function _ccInitZoomHud() {
  var pill = document.getElementById('zoom-pill');
  if (!pill || pill._ccHud) return;
  pill._ccHud = true;

  /* Idle fade. Any activity anywhere in the editor counts as "we are working", not only a move
     over the canvas: someone reading the right panel has not left the room. */
  var idleTimer = null;
  window._ccZoomHudWake = function () {
    pill.classList.remove('zp-idle');
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { pill.classList.add('zp-idle'); }, 2600);
  };
  ['pointermove', 'pointerdown', 'wheel', 'keydown'].forEach(function (ev) {
    document.addEventListener(ev, window._ccZoomHudWake, { passive: true });
  });
  _ccZoomHudWake();

  // Restore where the user last left it, re-clamped: a window that shrank must not hide it.
  try {
    var saved = JSON.parse(_ccHudRead(CC_ZOOM_POS_KEY) || 'null');
    if (saved && typeof saved.x === 'number') setTimeout(function () { _ccZoomPillPlace(saved.x, saved.y); }, 0);
  } catch (e) {}
  window.addEventListener('resize', function () { if (pill._ccPos) _ccZoomPillPlace(pill._ccPos.x, pill._ccPos.y); });

  /* Drag from ANYWHERE on the bar, buttons included: a separate grip on a 27px-wide control is
     a target nobody can hit. A press only becomes a drag past 4px, so a click stays a click. */
  var sx = 0, sy = 0, ox = 0, oy = 0, moved = false, dragging = false;
  pill.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    var r = pill.getBoundingClientRect();
    var p = pill.offsetParent ? pill.offsetParent.getBoundingClientRect() : { left: 0, top: 0 };
    ox = r.left - p.left; oy = r.top - p.top;
    sx = e.clientX; sy = e.clientY; moved = false; dragging = true;
    try { pill.setPointerCapture(e.pointerId); } catch (e2) {}
  });
  pill.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - sx, dy = e.clientY - sy;
    if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    moved = true;
    pill.classList.add('zp-drag');
    _ccZoomPillPlace(ox + dx, oy + dy);
  });
  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    pill.classList.remove('zp-drag');
    try { pill.releasePointerCapture(e.pointerId); } catch (e2) {}
    if (moved && pill._ccPos) _ccHudWrite(CC_ZOOM_POS_KEY, JSON.stringify(pill._ccPos));
    setTimeout(function () { moved = false; }, 0);   // after the click this pointerup will fire
  }
  pill.addEventListener('pointerup', endDrag);
  pill.addEventListener('pointercancel', endDrag);
  // A drag that happens to end over + or - must not also press it.
  pill.addEventListener('click', function (e) {
    if (moved) { e.stopPropagation(); e.preventDefault(); }
  }, true);
}

function initZoomAndPan() {
  var area = document.getElementById('canvas-area');
  if (!area) return;
  var panOverlay = document.getElementById('pan-overlay');
  _ccInitZoomHud();

  area.addEventListener('wheel', function (e) {
    if (splitMode || window.wbActive) return;
    if (window.SceneEditor && SceneEditor.isActive()) return;  // scene uses its own fabric wheel-zoom
    // BUG6 fix: In video mode, allow native scroll on the track/timeline bar
    if (typeof VideoEditor !== 'undefined' && VideoEditor.isActive && VideoEditor.isActive()) {
      if (e.target.closest && (
        e.target.closest('.ve-scroll-wrap') ||
        e.target.closest('.ve-timeline-body') ||
        e.target.closest('.ve-track-headers') ||
        e.target.closest('.ve-ruler')
      )) return;
    }
    e.preventDefault();
    viewZoom = _ccZoomStep(e.deltaY > 0 ? -0.06 : 0.06);
    applyView();
  }, { passive: false });

  document.addEventListener('keydown', function (e) {
    if (e.code === 'Space' && !e.target.matches('input,textarea,select,[contenteditable]')) {
      // Don't intercept spacebar when editing text on canvas
      var _aObj = canvas && canvas.getActiveObject ? canvas.getActiveObject() : null;
      if (_aObj && _aObj.isEditing) return;
      e.preventDefault();
      if (!spaceDown) {
        spaceDown = true;
        if (panOverlay) panOverlay.classList.add('active');
        else area.style.cursor = 'grab';
      }
    }
  });

  document.addEventListener('keyup', function (e) {
    if (e.code === 'Space') {
      spaceDown = false;
      isPanning = false;
      if (panOverlay) {
        panOverlay.classList.remove('active', 'grabbing');
      } else {
        area.style.cursor = '';
      }
    }
  });

  window.addEventListener('blur', function () {
    if (spaceDown || isPanning) {
      spaceDown = false;
      isPanning = false;
      if (panOverlay) panOverlay.classList.remove('active', 'grabbing');
      else area.style.cursor = '';
    }
  });

  if (panOverlay) {
    panOverlay.addEventListener('mousedown', function (e) {
      if (e.button === 0) {
        isPanning = true;
        lastPan = { x: e.clientX, y: e.clientY };
        panOverlay.classList.add('grabbing');
      }
    });
    panOverlay.addEventListener('mousemove', function (e) {
      if (!isPanning) return;
      panX += e.clientX - lastPan.x;
      panY += e.clientY - lastPan.y;
      lastPan = { x: e.clientX, y: e.clientY };
      applyView();
    });
    window.addEventListener('mouseup', function () {
      if (isPanning) {
        isPanning = false;
        if (panOverlay) panOverlay.classList.remove('grabbing');
      }
    });
  } else {
    area.addEventListener('mousedown', function (e) {
      if (spaceDown || e.button === 1) {
        isPanning = true;
        lastPan = { x: e.clientX, y: e.clientY };
        area.style.cursor = 'grabbing';
        e.preventDefault();
      }
    });
    document.addEventListener('mousemove', function (e) {
      if (!isPanning) return;
      panX += e.clientX - lastPan.x;
      panY += e.clientY - lastPan.y;
      lastPan = { x: e.clientX, y: e.clientY };
      applyView();
    });
    document.addEventListener('mouseup', function () {
      if (isPanning) {
        isPanning = false;
        area.style.cursor = spaceDown ? 'grab' : '';
      }
    });
  }

  // Middle-click pan
  area.addEventListener('mousedown', function (e) {
    if (e.button === 1) {
      e.preventDefault();
      isPanning = true;
      lastPan = { x: e.clientX, y: e.clientY };
      if (panOverlay) panOverlay.classList.add('active', 'grabbing');
      else area.style.cursor = 'grabbing';
    }
  });
  area.addEventListener('mousemove', function (e) {
    if (isPanning && !spaceDown && e.buttons === 4) {
      panX += e.clientX - lastPan.x;
      panY += e.clientY - lastPan.y;
      lastPan = { x: e.clientX, y: e.clientY };
      applyView();
    }
  });
  window.addEventListener('mouseup', function (e) {
    if (e.button === 1) {
      isPanning = false;
      if (panOverlay) panOverlay.classList.remove('active', 'grabbing');
      else area.style.cursor = '';
    }
  });

  function resetPanState() {
    spaceDown = false;
    isPanning = false;
    if (panOverlay) panOverlay.classList.remove('active', 'grabbing');
    else if (area) area.style.cursor = '';
  }

  window.addEventListener('blur', resetPanState);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) resetPanState();
  });

  var zoomInBtn = document.getElementById('zoom-in');
  var zoomOutBtn = document.getElementById('zoom-out');
  var resetBtn = document.getElementById('zoom-reset');
  if (zoomInBtn) zoomInBtn.addEventListener('click', function () { zoomBy(0.1); });
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', function () { zoomBy(-0.1); });
  if (resetBtn) resetBtn.addEventListener('click', resetView);
}

// ── Modular skeleton hook (Faz 6) — view is now a canvas-engine loader module
// (modules/canvas/view/). Self-inits applyView() + initZoomAndPan() on the sticky cc:canvas-ready
// event (inside cc.safe); app.js's initApp() calls are removed. The other ~20 callers
// (zoom pill onclick, shortcuts, pages/import/autosave/templates/...) are all RUNTIME, so they
// resolve applyView/zoomBy/resetView fine once this module has self-initialised. State vars
// viewZoom/panX/panY + CW/CH + updateFloatTB stay app.js globals resolved at call time.
if (window.cc && cc.on) {
  cc.on('cc:canvas-ready', function () {
    cc.safe('canvas.view.init', function () {
      if (typeof applyView === 'function') applyView();
      if (typeof initZoomAndPan === 'function') initZoomAndPan();
    });
  });
}
if (window.cc && cc.modules) {
  cc.modules.register({ id: 'view', parent: 'canvas', title: 'View (zoom/pan)', mount: function () {}, unmount: function () {} });
}
