/* ============================================================
   dika studio core — BOOT (editor display bootstrap). Extracted from wizard.js `_bootDirectEditor`
   (Faz 8). The OLD business-card startup wizard is being retired, but THIS was the live boot path
   living inside it: it hides the legacy landing/wizard overlays and brings up a blank editor —
   sets the product to custom 1000×1000, inits pages + the structure panel, and nudges the
   shortcuts/gear/templates that may not have self-inited yet. Every dependency is typeof-guarded
   (the modules also self-init on cc:canvas-ready), so missing pieces degrade gracefully.

   Self-boots at load, exactly as the old wizard.js `initWizard()` → `_bootDirectEditor()` did
   (the inner setTimeout defers DOM work until after app.js initApp has built the canvas).
   selectedTpl / activeProduct / userInfo are app.js §1 globals (resolved at the setTimeout's runtime).
   ============================================================ */
var _wizDirectBootDone = false;
function _bootDirectEditor() {
  if (_wizDirectBootDone) return;
  _wizDirectBootDone = true;
  setTimeout(function () {
    var landing = document.getElementById('landing');
    if (landing) landing.classList.add('hidden');
    var wiz = document.getElementById('wizard');
    if (wiz) wiz.classList.add('hidden');

    selectedTpl = 'blank';
    activeProduct = 'custom';
    if (typeof setProductType === 'function') setProductType('custom');
    if (typeof setCustomCanvasSize === 'function') setCustomCanvasSize(1000, 1000);

    if (typeof initPages === 'function' && (typeof pages === 'undefined' || !pages.length)) {
      initPages();
    }
    if (typeof applyView === 'function') applyView();
    if (typeof initStructurePanel === 'function') initStructurePanel();
    if (typeof initShortcuts === 'function') initShortcuts();
    if (typeof initGearMenu === 'function') initGearMenu();
    if (typeof renderTemplateCategoryCards === 'function') {
      renderTemplateCategoryCards('flyout-tpl-grid');
    }
  }, 30);
}
_bootDirectEditor();
