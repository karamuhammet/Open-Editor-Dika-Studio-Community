/* ============================================================
   dika studio core — PAGE TABS + canvas-size panel + drill-in nav. Extracted from app.js §20
   (Faz 8 core slimming). Flat global before app.js: initFaceTabs/initCanvasSizePanel (initApp calls
   them) + updateCanvasSizePanel + the text/bg/pat drill-in nav helpers (called by the text/background
   modules) stay window globals. _canvasUnit/_unitFactors/_TEXT_DRILLS state moves with them.
   ============================================================ */

// ── 20. Page Tab Init ────────────────────────────────────────
function initFaceTabs() {
  if (typeof renderPageTabs === 'function') renderPageTabs();
}

// ── 21a. Canvas Size Panel (Right Panel) ─────────────────────

// Unit conversion helpers (96 DPI basis)
var _canvasUnit = 'px';
var _unitFactors = { px: 1, mm: 96 / 25.4, cm: 96 / 2.54, 'in': 96 };

function _pxToUnit(px, unit) {
  return Math.round((px / _unitFactors[unit || _canvasUnit]) * 100) / 100;
}
function _unitToPx(val, unit) {
  return Math.round(val * _unitFactors[unit || _canvasUnit]);
}

function initCanvasSizePanel() {
  var presetSel = document.getElementById('rp-size-preset');
  var wInput = document.getElementById('rp-canvas-w');
  var hInput = document.getElementById('rp-canvas-h');
  var applyBtn = document.getElementById('rp-apply-size');
  if (!presetSel || !wInput || !hInput || !applyBtn) return;

  // ── Unit dropdown ──
  var unitWrap = document.getElementById('rp-canvas-unit-wrap');
  if (unitWrap && !unitWrap._unitBuilt) {
    unitWrap._unitBuilt = true;
    var sel = document.createElement('select');
    sel.id = 'rp-canvas-unit';
    sel.className = 'mform-input';
    sel.style.cssText = 'height:28px;font-size:10px;width:100%;padding:0 2px;text-align:center';
    var units = [
      { v: 'px', t: 'px' },
      { v: 'mm', t: 'mm' },
      { v: 'cm', t: 'cm' },
      { v: 'in', t: 'inch' }
    ];
    units.forEach(function(u) {
      var o = document.createElement('option');
      o.value = u.v;
      o.textContent = u.t;
      sel.appendChild(o);
    });
    sel.value = _canvasUnit;
    sel.addEventListener('change', function() {
      _canvasUnit = sel.value;
      _refreshUnitInputs();
    });
    unitWrap.appendChild(sel);
  }

  if (typeof PRESET_GROUPS !== 'undefined') {
    PRESET_GROUPS.forEach(function (group) {
      var optg = document.createElement('optgroup');
      optg.label = group.group;
      group.presets.forEach(function (p) {
        var opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name + ' (' + p.w + '×' + p.h + ')';
        optg.appendChild(opt);
      });
      presetSel.appendChild(optg);
    });
  }

  _refreshUnitInputs();

  applyBtn.addEventListener('click', function () {
    var wRaw = parseFloat(wInput.value);
    var hRaw = parseFloat(hInput.value);
    if (isNaN(wRaw) || isNaN(hRaw)) return;
    var w = _unitToPx(wRaw);
    var h = _unitToPx(hRaw);
    if (w < 50) w = 50;
    if (h < 50) h = 50;
    // Video mode: route through VideoCanvas so enforceDimensions doesn't revert it.
    if (typeof activeProduct !== 'undefined' && activeProduct === 'video' && window.VideoCanvas && VideoCanvas.setCustomSize) {
      VideoCanvas.setCustomSize(w, h);
      return;
    }
    if (typeof setCustomCanvasSize === 'function') {
      setCustomCanvasSize(w, h);
      updateCanvasSizePanel();
    }
  });

  presetSel.addEventListener('change', function () {
    var name = presetSel.value;
    if (!name || typeof SOCIAL_PRESETS === 'undefined' || !SOCIAL_PRESETS[name]) return;
    var p = SOCIAL_PRESETS[name];
    wInput.value = p.w;
    hInput.value = p.h;
    if (typeof activeProduct !== 'undefined' && activeProduct === 'video' && window.VideoCanvas && VideoCanvas.setCustomSize) {
      VideoCanvas.setCustomSize(p.w, p.h);
      return;
    }
    if (typeof setCustomCanvasSize === 'function') {
      setCustomCanvasSize(p.w, p.h);
      updateCanvasSizePanel();
    }
  });

  updateCanvasSizePanel();
}

function _refreshUnitInputs() {
  var wInput = document.getElementById('rp-canvas-w');
  var hInput = document.getElementById('rp-canvas-h');
  if (wInput) {
    wInput.value = _pxToUnit(CW);
    wInput.step = (_canvasUnit === 'px') ? '1' : '0.1';
  }
  if (hInput) {
    hInput.value = _pxToUnit(CH);
    hInput.step = (_canvasUnit === 'px') ? '1' : '0.1';
  }
}

function updateCanvasSizePanel() {
  var section = document.getElementById('rp-canvas-size');
  if (!section) return;

  var isCard = (typeof activeProduct !== 'undefined') && activeProduct === 'card';
  // Video mode CAN change its canvas size now (routed through VideoCanvas.setCustomSize),
  // so no longer force-hidden here (owner). Selection logic still hides it when an
  // object/clip is selected; it shows in the no-selection state.
  section.style.display = (isCard || window.wbActive) ? 'none' : '';

  _refreshUnitInputs();

  var unitSel = document.getElementById('rp-canvas-unit');
  if (unitSel) unitSel.value = _canvasUnit;

  var presetSel = document.getElementById('rp-size-preset');
  if (presetSel && typeof SOCIAL_PRESETS !== 'undefined') {
    var matched = '';
    var keys = Object.keys(SOCIAL_PRESETS);
    for (var i = 0; i < keys.length; i++) {
      if (SOCIAL_PRESETS[keys[i]].w === CW && SOCIAL_PRESETS[keys[i]].h === CH) {
        matched = keys[i];
        break;
      }
    }
    presetSel.value = matched;
  }

  // Show wireframe board height presets when in wireframe mode
  var wfPresets = document.getElementById('rp-wf-board-presets');
  if (wfPresets) {
    var isWf = (typeof activeProduct !== 'undefined') && activeProduct === 'wireframe';
    wfPresets.style.display = isWf ? '' : 'none';
  }
}

// ── Custom Modal Utilities — MOVED to core/modals.js (Faz 3, core slimming).
//   showCustomConfirm / showCustomPrompt / showCustomAlert are global there (index.html <script>).

// ── 21b. Device Mockups — EXTRACTED to modules/left-panel/tools/mockups/mockups.js (Faz 2 tools).
//   window.initMockups lives there now; gallery openToolGenerator('mockups') drives it.

// ── 20b. Background Drill-In Navigation ──────────────────────

// Text section drill-in (Contact / Social)
var _TEXT_DRILLS = ['contact', 'social', 'pairings', 'effects', 'dynamic'];
function textDrillIn(which) {
  var mainView = document.getElementById('text-main-view');
  if (mainView) mainView.style.display = 'none';
  _TEXT_DRILLS.forEach(function (d) {
    var el = document.getElementById('text-drill-' + d);
    if (el) el.style.display = (d === which) ? '' : 'none';
  });
}

function textDrillBack() {
  var mainView = document.getElementById('text-main-view');
  if (mainView) mainView.style.display = '';
  _TEXT_DRILLS.forEach(function (d) {
    var el = document.getElementById('text-drill-' + d);
    if (el) el.style.display = 'none';
  });
}

function bgDrillIn(which) {
  var catView = document.getElementById('bg-cat-view');
  var drillFx = document.getElementById('bg-drill-effects');
  var drillPat = document.getElementById('bg-drill-patterns');
  var drillGrid = document.getElementById('bg-drill-grid');
  if (catView) catView.style.display = 'none';
  if (drillFx) drillFx.style.display = (which === 'effects') ? '' : 'none';
  if (drillPat) drillPat.style.display = (which === 'patterns') ? '' : 'none';
  if (drillGrid) drillGrid.style.display = (which === 'grid') ? '' : 'none';
  // Reset patterns sub-views when entering patterns
  if (which === 'patterns') {
    var pcv = document.getElementById('pat-cat-view');
    var pdt = document.getElementById('pat-drill-text');
    var pds = document.getElementById('pat-drill-svg');
    if (pcv) pcv.style.display = '';
    if (pdt) pdt.style.display = 'none';
    if (pds) pds.style.display = 'none';
  }
  // The effects menu renders lazily: every thumbnail is procedurally painted
  // (the glass ones run a displacement pass), so only pay for them when the
  // drill-in is actually opened. Always land on the effect list, not on
  // whichever style grid was open last time.
  if (which === 'effects') {
    if (typeof window.effectsRenderPanel === 'function') window.effectsRenderPanel();
    if (typeof window.fxBackToEffects === 'function') window.fxBackToEffects();
  }
}

function bgDrillBack() {
  var catView = document.getElementById('bg-cat-view');
  var drillFx = document.getElementById('bg-drill-effects');
  var drillPat = document.getElementById('bg-drill-patterns');
  var drillGrid = document.getElementById('bg-drill-grid');
  if (catView) catView.style.display = '';
  if (drillFx) drillFx.style.display = 'none';
  if (drillPat) drillPat.style.display = 'none';
  if (drillGrid) drillGrid.style.display = 'none';
}

function patDrillIn(which) {
  var pcv = document.getElementById('pat-cat-view');
  var pdt = document.getElementById('pat-drill-text');
  var pds = document.getElementById('pat-drill-svg');
  var pdi = document.getElementById('pat-drill-icon');
  var pdim = document.getElementById('pat-drill-image');
  if (pcv) pcv.style.display = 'none';
  if (pdt) pdt.style.display = (which === 'text-pattern') ? '' : 'none';
  if (pds) pds.style.display = (which === 'svg-patterns') ? '' : 'none';
  if (pdi) pdi.style.display = (which === 'icon-pattern') ? '' : 'none';
  if (pdim) pdim.style.display = (which === 'image-pattern') ? '' : 'none';
}

function patDrillBack() {
  var pcv = document.getElementById('pat-cat-view');
  var pdt = document.getElementById('pat-drill-text');
  var pds = document.getElementById('pat-drill-svg');
  var pdi = document.getElementById('pat-drill-icon');
  var pdim = document.getElementById('pat-drill-image');
  if (pcv) pcv.style.display = '';
  if (pdt) pdt.style.display = 'none';
  if (pds) pds.style.display = 'none';
  if (pdi) pdi.style.display = 'none';
  if (pdim) pdim.style.display = 'none';
}

// ── 20c–20e. Background patterns → extracted to modules/left-panel/background/background.js (Faz 2) ──

