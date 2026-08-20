/* ============================================================
   dika studio core — CANVAS GEOMETRY toggles. Extracted from app.js §4/5/6 (Faz 8 core slimming).

   Card corners, orientation, and dual-side toggles — small DOM/canvas-size helpers. Flat global
   script loaded BEFORE app.js so setCardCorners/setOrientation/updateSizeBadge/toggleDualSide stay
   window globals (UI/wizard call them). They read/mutate app.js §1 state (wizSettings, CW/CH,
   activeProduct, dualSideEnabled, pages, currentPageIndex, histLocked) + canvas at RUNTIME — all
   defined by call time, since app.js loads right after this. applyView() comes from core/view.js;
   pages helpers (saveCurrentPage/renderPageTabs/updateCanvasLabel/syncLegacyFaceGlobals) are guarded.
   ============================================================ */
// ── Card Corners ──
function setCardCorners(type) {
  wizSettings.corners = type;
  var sharpBtn = document.getElementById('shape-sharp');
  var roundedBtn = document.getElementById('shape-rounded');
  var stage = document.getElementById('card-stage');
  if (sharpBtn) sharpBtn.classList.toggle('active', type === 'sharp');
  if (roundedBtn) roundedBtn.classList.toggle('active', type === 'rounded');
  if (stage) stage.classList.toggle('rounded', type === 'rounded');
}

// ── Orientation ──
function setOrientation(orient) {
  wizSettings.orientation = orient;
  var orientH = document.getElementById('orient-h');
  var orientV = document.getElementById('orient-v');
  if (orientH) orientH.classList.toggle('active', orient === 'horizontal');
  if (orientV) orientV.classList.toggle('active', orient === 'vertical');
  if (activeProduct === 'card') {
    if (orient === 'horizontal') { CW = 700; CH = 400; }
    else { CW = 400; CH = 700; }
  }
  canvas.setWidth(CW);
  canvas.setHeight(CH);
  canvas.renderAll();
  applyView();
  updateSizeBadge();
}

function updateSizeBadge() {
  var b = document.getElementById('size-badge');
  if (!b) return;
  if (b._ccRenaming) return;            // don't clobber the inline rename in progress
  _wireBadgeRename(b);
  // Dimension label (kept as the hover tooltip so the size info is never lost).
  var cfg = typeof getProductConfig === 'function' ? getProductConfig() : null;
  var dim;
  if (activeProduct === 'card') {
    dim = wizSettings.orientation === 'horizontal' ? '3.5″ × 2″ Standard' : '2″ × 3.5″ Vertical';
  } else if (cfg) {
    dim = CW + ' × ' + CH + 'px — ' + cfg.label;
  } else {
    dim = CW + ' × ' + CH + 'px';
  }
  // Owner 2026-07-13: the badge LEADS with the work/document name (dblclick to rename); the size moves
  // to the tooltip. Falls back to the dimension label when the design has no name yet (or standalone).
  var name = (window.CCRemote && CCRemote.designTitle) ? CCRemote.designTitle : null;
  if (name) {
    b.textContent = name;
    b.title = dim + '  ·  double-click to rename';
    b.classList.add('is-doc-name');
  } else {
    b.textContent = dim;
    b.title = 'Double-click to rename';
    b.classList.remove('is-doc-name');
  }
}

// Inline rename of the current work via the size-badge (owner: dblclick to edit the name).
// contentEditable in place → Enter commits, Escape cancels, blur commits. CCRemote.rename persists it.
function _wireBadgeRename(b) {
  if (b._ccRenameWired) return;
  b._ccRenameWired = true;
  b.addEventListener('dblclick', function () {
    if (b._ccRenaming) return;
    b._ccRenaming = true;
    var prev = (window.CCRemote && CCRemote.designTitle) ? CCRemote.designTitle : (b.textContent || '');
    b.textContent = prev;
    b.setAttribute('contenteditable', 'true');
    b.classList.add('is-editing');
    b.focus();
    try { var rg = document.createRange(); rg.selectNodeContents(b); var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rg); } catch (e) {}
    function finish(save) {
      if (!b._ccRenaming) return;
      b._ccRenaming = false;
      b.removeAttribute('contenteditable');
      b.classList.remove('is-editing');
      b.onblur = null; b.onkeydown = null;
      var val = (b.textContent || '').trim();
      if (save && val && val !== prev && window.CCRemote && CCRemote.rename) CCRemote.rename(val);
      if (typeof updateSizeBadge === 'function') updateSizeBadge();
    }
    b.onblur = function () { finish(true); };
    b.onkeydown = function (e) {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    };
  });
}

// ── Dual Side Toggle (pages-aware) ──
function toggleDualSide(enable) {
  dualSideEnabled = enable;
  var singleBtn = document.getElementById('sides-single');
  var doubleBtn = document.getElementById('sides-double');
  if (singleBtn) singleBtn.classList.toggle('active', !enable);
  if (doubleBtn) doubleBtn.classList.toggle('active', enable);

  if (typeof pages !== 'undefined' && typeof saveCurrentPage === 'function') {
    if (enable && pages.length === 1) {
      pages.push({ json: null, bg: '#1a1a2e', label: 'Back' });
    } else if (!enable && pages.length >= 2) {
      var backPage = pages[1];
      if (backPage && backPage.label === 'Back') {
        if (currentPageIndex >= 1) {
          saveCurrentPage();
          currentPageIndex = 0;
          var pg = pages[0];
          // Page-sleep defensive (dual-side is 2 pages so pg[0] is never slept, but stay safe):
          // read parked json + un-sleep so subsequent saves see it. No-op when sleep is off.
          if (pg._slept && typeof CCPageSleep !== 'undefined') { pg.json = CCPageSleep.jsonForSave(pg); pg._slept = false; pg._sleptKey = null; }
          if (pg.json) {
            histLocked = true;
            canvas.loadFromJSON(pg.json, function () {
              canvas.renderAll();
              histLocked = false;
            });
          }
        }
        pages.splice(1, 1);
      }
    }
    if (typeof renderPageTabs === 'function') renderPageTabs();
    if (typeof updateCanvasLabel === 'function') updateCanvasLabel();
    if (typeof syncLegacyFaceGlobals === 'function') syncLegacyFaceGlobals();
  }
}

// switchFace() and updateCanvasLabel() are provided by pages.js
