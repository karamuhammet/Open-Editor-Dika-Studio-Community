/* ============================================================
   dika studio – Wireframe Module
   Provides wireframe page templates and UI block elements.
   Loaded AFTER whiteboard.js, BEFORE bulk-export.js.
   ============================================================ */

// ─── Template Categories ─────────────────────────────────────
var WF_TEMPLATE_CATEGORIES = [
  { id: 'home',           label: 'Home',            icon: 'wireframe', desc: 'Landing page layouts' },
  { id: 'about',          label: 'About Us',        icon: 'wireframe', desc: 'Team & company pages' },
  { id: 'project',        label: 'Project',         icon: 'wireframe', desc: 'Portfolio & case study' },
  { id: 'contact',        label: 'Contact',         icon: 'wireframe', desc: 'Contact & map pages' },
  { id: 'services',       label: 'Services',        icon: 'wireframe', desc: 'Service listing pages' },
  { id: 'singleService',  label: 'Single Service',  icon: 'wireframe', desc: 'Detail service pages' },
  { id: 'lp-corporate',   label: 'Landing – Corporate', icon: 'wireframe', desc: 'Corporate landing pages' },
  { id: 'lp-restaurant',  label: 'Landing – Restaurant', icon: 'wireframe', desc: 'Restaurant & café pages' },
  { id: 'lp-portfolio',   label: 'Landing – Portfolio', icon: 'wireframe', desc: 'Portfolio & showcase pages' }
];

// ─── Element Categories ──────────────────────────────────────
var WF_ELEMENT_CATEGORIES = [
  { id: 'header',   label: 'Header',   icon: 'wireframe', desc: 'Navigation bars' },
  { id: 'footer',   label: 'Footer',   icon: 'wireframe', desc: 'Page footers' },
  { id: 'buttons',  label: 'Buttons',  icon: 'wireframe', desc: 'CTA & action buttons' },
  { id: 'hero',     label: 'Hero',     icon: 'wireframe', desc: 'Hero / banner sections' },
  { id: 'faq',      label: 'FAQ',      icon: 'wireframe', desc: 'Question & answer blocks' },
  { id: 'form',     label: 'Form',     icon: 'wireframe', desc: 'Input forms' },
  { id: 'content',  label: 'Content',  icon: 'wireframe', desc: 'Text & media blocks' },
  { id: 'gallery',  label: 'Gallery',  icon: 'wireframe', desc: 'Image grid sections' },
  { id: 'features', label: 'Features', icon: 'wireframe', desc: 'Feature cards / lists' },
  { id: 'pricing',  label: 'Pricing',  icon: 'wireframe', desc: 'Pricing table blocks' }
];

// ─── Wireframe Style Constants ───────────────────────────────
var WF = {
  bgPage:      '#FFFFFF',
  bgSection:   '#F3F4F6',
  bgCard:      '#E5E7EB',
  border:      '#D1D5DB',
  textDark:    '#374151',
  textMid:     '#6B7280',
  textLight:   '#9CA3AF',
  accent:      '#3B82F6',
  radius:      6
};

// ─── Helper: stamp wireframe custom props on all objs ────────
function _wfStamp(objs, wfType) {
  objs.forEach(function(o) {
    o.set({ _isWireframe: true, _wfType: wfType || 'element' });
  });
  return objs;
}

// ─── Helper: create rect shortcut ────────────────────────────
function _wfRect(opts) {
  return new fabric.Rect(Object.assign({
    fill: WF.bgSection, stroke: WF.border, strokeWidth: 1,
    rx: WF.radius, ry: WF.radius, selectable: true
  }, opts));
}

function _wfText(txt, opts) {
  return new fabric.IText(txt, Object.assign({
    fontSize: 14, fill: WF.textDark, fontFamily: 'DM Sans',
    selectable: true
  }, opts));
}

function _wfLine(coords, opts) {
  return new fabric.Line(coords, Object.assign({
    stroke: WF.border, strokeWidth: 1, selectable: false
  }, opts));
}

// ═════════════════════════════════════════════════════════════
// PART G: INIT — hook into canvas events for layers refresh
// ═════════════════════════════════════════════════════════════

(function _wireframeInit() {
  // Wait for canvas to be ready
  var _wfInitInterval = setInterval(function() {
    // Faz 8: initRpTabs() → buildLayoutPanelHTML()/wireLayoutPanel() now live in the layout
    // loader module (modules/canvas/layout/), which loads after canvas is ready — so wait for it
    // too, else initRpTabs throws "buildLayoutPanelHTML is not defined" in the race window.
    if (typeof canvas !== 'undefined' && canvas && canvas.on && typeof buildLayoutPanelHTML === 'function' && typeof initRpTabs === 'function') {
      clearInterval(_wfInitInterval);

      // Apply active brand set to WF constants on init
      if (typeof getActiveBrandSet === 'function') {
        var _initBrand = getActiveBrandSet();
        if (_initBrand) {
          WF.bgPage = _initBrand.colors.body;
          WF.accent = _initBrand.colors.primary;
          WF.textDark = _initBrand.colors.text;
        }
      }

      // Init right panel tabs
      initRpTabs();
      updateRpTabBarVisibility();

      // Refresh layers on canvas changes
      canvas.on('object:added', function() {
        if (document.getElementById('rp-layers-wrap') && document.getElementById('rp-layers-wrap').style.display !== 'none') {
          refreshInlineLayers();
        }
      });
      canvas.on('object:removed', function() {
        if (document.getElementById('rp-layers-wrap') && document.getElementById('rp-layers-wrap').style.display !== 'none') {
          refreshInlineLayers();
        }
      });
      canvas.on('object:modified', function() {
        if (document.getElementById('rp-layers-wrap') && document.getElementById('rp-layers-wrap').style.display !== 'none') {
          refreshInlineLayers();
        }
      });
      canvas.on('selection:created', function() {
        if (document.getElementById('rp-layers-wrap') && document.getElementById('rp-layers-wrap').style.display !== 'none') {
          refreshInlineLayers();
        }
      });
      canvas.on('selection:updated', function() {
        if (document.getElementById('rp-layers-wrap') && document.getElementById('rp-layers-wrap').style.display !== 'none') {
          refreshInlineLayers();
        }
      });
      canvas.on('selection:cleared', function() {
        if (document.getElementById('rp-layers-wrap') && document.getElementById('rp-layers-wrap').style.display !== 'none') {
          refreshInlineLayers();
        }
      });
    }
  }, 100);
})();

// Modular skeleton hook (Faz 8) — wireframe is now a loader module (modules/canvas/).
if (window.cc && cc.modules) cc.modules.register({ id: 'wireframe', parent: 'canvas', title: 'Wireframe mode', mount: function () {}, unmount: function () {} });
