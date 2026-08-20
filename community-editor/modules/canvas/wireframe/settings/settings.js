/* wireframe/settings — WF global settings modal + custom CSS. Split from the 2652-line wireframe.js (decomposition).
   FLAT sub-module: functions stay window globals (the wireframe init + each other call them at runtime).
   Registers under canvas.wireframe. NOTE: wireframe is a paused/hidden feature — load-level verified. */

// ═════════════════════════════════════════════════════════════
// PART F: GLOBAL WIREFRAME SETTINGS MODAL
// ═════════════════════════════════════════════════════════════

// ─── Typography Settings Storage ─────────────────────────────
var WF_TYPO_DEFAULTS = {
  h1: { family: 'DM Sans', size: 36, weight: 'bold' },
  h2: { family: 'DM Sans', size: 28, weight: 'bold' },
  h3: { family: 'DM Sans', size: 22, weight: 'bold' },
  h4: { family: 'DM Sans', size: 18, weight: 'bold' },
  h5: { family: 'DM Sans', size: 16, weight: '600' },
  h6: { family: 'DM Sans', size: 14, weight: '600' },
  body: { family: 'DM Sans', size: 14, weight: 'normal' },
  small: { family: 'DM Sans', size: 11, weight: 'normal' }
};

function _getWfTypoSettings() {
  try {
    var raw = localStorage.getItem('cc_wf_typo');
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return JSON.parse(JSON.stringify(WF_TYPO_DEFAULTS));
}

function _saveWfTypoSettings(typo) {
  try { localStorage.setItem('cc_wf_typo', JSON.stringify(typo)); } catch(e) {}
}

function openWfSettings() {
  var existing = document.getElementById('wf-settings-modal');
  if (existing) existing.remove();

  var typo = _getWfTypoSettings();

  // Build typography accordion items
  var typoHtml = '';
  var tags = [
    { key: 'h1', label: 'H1 – Main Heading' },
    { key: 'h2', label: 'H2 – Section Heading' },
    { key: 'h3', label: 'H3 – Sub Heading' },
    { key: 'h4', label: 'H4 – Card Heading' },
    { key: 'h5', label: 'H5 – Small Heading' },
    { key: 'h6', label: 'H6 – Mini Heading' },
    { key: 'body', label: 'Body Text' },
    { key: 'small', label: 'Small / Caption' }
  ];

  tags.forEach(function(tag) {
    var t = typo[tag.key] || WF_TYPO_DEFAULTS[tag.key];
    var isOpen = tag.key === 'h1' ? ' open' : '';
    typoHtml +=
      '<div class="rp-accordion' + isOpen + '" data-accordion="wf-typo-' + tag.key + '">' +
        '<div class="rp-accordion-header" onclick="this.parentElement.classList.toggle(\'open\')">' +
          '<span class="rp-accordion-title" style="font-size:12px">' + tag.label + '</span>' +
          '<span class="rp-accordion-arrow">&#9662;</span>' +
        '</div>' +
        '<div class="rp-accordion-body" style="padding:6px 0">' +
          '<div class="prow" style="flex-direction:column;align-items:flex-start;gap:4px">' +
            '<span class="plabel" style="font-size:10px">Font Family</span>' +
            '<input type="text" id="wf-typo-' + tag.key + '-family" value="' + (t.family || 'DM Sans') + '" placeholder="Font family" class="pinput pinput-full" style="font-size:11px;height:28px">' +
          '</div>' +
          '<div style="display:flex;gap:8px;margin-top:4px">' +
            '<div style="flex:1"><span class="plabel" style="font-size:10px">Size</span>' +
              '<input type="number" id="wf-typo-' + tag.key + '-size" value="' + (t.size || 14) + '" min="8" max="120" class="pinput pinput-sm" style="width:100%">' +
            '</div>' +
            '<div style="flex:1"><span class="plabel" style="font-size:10px">Weight</span>' +
              '<select id="wf-typo-' + tag.key + '-weight" class="pinput" style="width:100%;font-size:11px;height:28px;background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:5px">' +
                '<option value="normal"' + (t.weight === 'normal' ? ' selected' : '') + '>Normal</option>' +
                '<option value="500"' + (t.weight === '500' ? ' selected' : '') + '>Medium</option>' +
                '<option value="600"' + (t.weight === '600' ? ' selected' : '') + '>Semi-Bold</option>' +
                '<option value="bold"' + (t.weight === 'bold' ? ' selected' : '') + '>Bold</option>' +
              '</select>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  });

  var overlay = document.createElement('div');
  overlay.id = 'wf-settings-modal';
  overlay.className = 'wf-settings-overlay';
  overlay.innerHTML =
    '<div class="wf-settings-box" style="max-height:80vh;display:flex;flex-direction:column">' +
      '<div class="wf-settings-header">' +
        '<span>Wireframe Settings</span>' +
        '<button class="wf-settings-close" onclick="closeWfSettings()">✕</button>' +
      '</div>' +
      '<div class="wf-settings-tabs">' +
        '<button class="wf-stab active" data-wf-stab="text" onclick="switchWfSettingsTab(\'text\')">Text</button>' +
        '<button class="wf-stab" data-wf-stab="buttons" onclick="switchWfSettingsTab(\'buttons\')">Buttons</button>' +
        '<button class="wf-stab" data-wf-stab="typography" onclick="switchWfSettingsTab(\'typography\')">Typography</button>' +
      '</div>' +
      '<div class="wf-settings-body" style="overflow-y:auto;flex:1">' +
        '<div class="wf-stab-content active" data-wf-stab-content="text">' +
          '<div class="prow"><span class="plabel">Text Color</span><input type="color" id="wf-set-text-color" value="' + WF.textDark + '" class="pinput" style="width:36px;height:28px;padding:2px"></div>' +
          '<div class="prow"><span class="plabel">Heading Size</span><input type="number" id="wf-set-heading-size" value="28" min="12" max="72" class="pinput pinput-sm"></div>' +
          '<div class="prow"><span class="plabel">Body Size</span><input type="number" id="wf-set-body-size" value="14" min="8" max="36" class="pinput pinput-sm"></div>' +
        '</div>' +
        '<div class="wf-stab-content" data-wf-stab-content="buttons">' +
          '<div class="prow"><span class="plabel">Button Color</span><input type="color" id="wf-set-btn-color" value="' + WF.accent + '" class="pinput" style="width:36px;height:28px;padding:2px"></div>' +
          '<div class="prow"><span class="plabel">Button Radius</span><input type="number" id="wf-set-btn-radius" value="6" min="0" max="30" class="pinput pinput-sm"></div>' +
        '</div>' +
        '<div class="wf-stab-content" data-wf-stab-content="typography">' +
          '<div style="padding:4px 0;font-size:11px;color:var(--text-dim);margin-bottom:6px">Set font family, size and weight per heading level. Click Apply to update all wireframe text.</div>' +
          typoHtml +
        '</div>' +
      '</div>' +
      '<div class="wf-settings-footer">' +
        '<button class="wiz-btn" style="width:100%;padding:10px" onclick="applyWfGlobalSettings()">Apply to Current Page</button>' +
      '</div>' +
    '</div>';

  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closeWfSettings();
  });

  document.body.appendChild(overlay);
}

function closeWfSettings() {
  var el = document.getElementById('wf-settings-modal');
  if (el) el.remove();
}

function switchWfSettingsTab(tab) {
  document.querySelectorAll('.wf-stab').forEach(function(b) {
    b.classList.toggle('active', b.dataset.wfStab === tab);
  });
  document.querySelectorAll('.wf-stab-content').forEach(function(c) {
    c.classList.toggle('active', c.dataset.wfStabContent === tab);
  });
}

function applyWfGlobalSettings() {
  var textColor = document.getElementById('wf-set-text-color');
  var headingSize = document.getElementById('wf-set-heading-size');
  var bodySize = document.getElementById('wf-set-body-size');
  var btnColor = document.getElementById('wf-set-btn-color');
  var btnRadius = document.getElementById('wf-set-btn-radius');

  // Collect typography settings from the modal
  var typo = _getWfTypoSettings();
  var tags = ['h1','h2','h3','h4','h5','h6','body','small'];
  tags.forEach(function(tag) {
    var fam = document.getElementById('wf-typo-' + tag + '-family');
    var sz = document.getElementById('wf-typo-' + tag + '-size');
    var wt = document.getElementById('wf-typo-' + tag + '-weight');
    if (fam || sz || wt) {
      typo[tag] = {
        family: fam ? fam.value.trim() || 'DM Sans' : typo[tag].family,
        size: sz ? parseInt(sz.value) || WF_TYPO_DEFAULTS[tag].size : typo[tag].size,
        weight: wt ? wt.value : typo[tag].weight
      };
    }
  });
  _saveWfTypoSettings(typo);

  canvas.getObjects().forEach(function(obj) {
    if (!obj._isWireframe) return;
    if (obj.type === 'group' && obj._objects) {
      obj._objects.forEach(function(child) {
        _applyWfSettingsToObj(child, textColor, headingSize, bodySize, btnColor, btnRadius);
        _applyWfTypoToObj(child, typo);
      });
      obj.dirty = true;
    } else {
      _applyWfSettingsToObj(obj, textColor, headingSize, bodySize, btnColor, btnRadius);
      _applyWfTypoToObj(obj, typo);
    }
  });

  canvas.renderAll();
  if (typeof snap === 'function') snap();
  closeWfSettings();
}

function _applyWfTypoToObj(obj, typo) {
  if (obj.type !== 'i-text' && obj.type !== 'text' && obj.type !== 'textbox') return;
  var fs = obj.fontSize || 14;
  // Classify text by current size into tag category
  var tag;
  if (fs >= 34)      tag = 'h1';
  else if (fs >= 26) tag = 'h2';
  else if (fs >= 20) tag = 'h3';
  else if (fs >= 17) tag = 'h4';
  else if (fs >= 15) tag = 'h5';
  else if (fs >= 13) tag = 'body';
  else               tag = 'small';

  var t = typo[tag];
  if (!t) return;
  if (t.family) obj.set('fontFamily', t.family);
  if (t.size) obj.set('fontSize', t.size);
  if (t.weight) obj.set('fontWeight', t.weight);
}

function _applyWfSettingsToObj(obj, textColor, headingSize, bodySize, btnColor, btnRadius) {
  // Text objects
  if (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox') {
    if (obj.fill !== '#FFFFFF' && obj.fill !== 'white') {
      if (textColor) obj.set('fill', textColor.value);
    }
    if (obj.fontSize >= 20 && headingSize) {
      obj.set('fontSize', parseInt(headingSize.value));
    } else if (obj.fontSize < 20 && bodySize) {
      obj.set('fontSize', parseInt(bodySize.value));
    }
  }

  // Button-like rects (accent-colored)
  if (obj.type === 'rect' && obj.fill === WF.accent) {
    if (btnColor) obj.set('fill', btnColor.value);
    if (btnRadius) {
      var r = parseInt(btnRadius.value);
      obj.set({ rx: r, ry: r });
    }
  }
}


// ═════════════════════════════════════════════════════════════
// PART F-2: CUSTOM CSS FOR WIREFRAME ELEMENTS
// ═════════════════════════════════════════════════════════════

var _WF_CSS_MAP = {
  'opacity':          function(obj, v) { var n = parseFloat(v); if (!isNaN(n)) obj.set('opacity', Math.max(0, Math.min(1, n))); },
  'border-radius':    function(obj, v) { var n = parseInt(v); if (!isNaN(n)) { obj.set({ rx: n, ry: n }); } },
  'border':           function(obj, v) {
    var m = v.match(/([\d.]+)px\s+(\w+)\s+(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|\w+)/);
    if (m) { obj.set({ strokeWidth: parseFloat(m[1]), stroke: m[3] }); }
  },
  'border-color':     function(obj, v) { obj.set('stroke', v.trim()); },
  'border-width':     function(obj, v) { var n = parseFloat(v); if (!isNaN(n)) obj.set('strokeWidth', n); },
  'background-color': function(obj, v) { obj.set('fill', v.trim()); },
  'background':       function(obj, v) { if (v.trim().match(/^(#|rgb)/)) obj.set('fill', v.trim()); },
  'color':            function(obj, v) { if (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox') obj.set('fill', v.trim()); },
  'font-size':        function(obj, v) { var n = parseInt(v); if (!isNaN(n) && (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox')) obj.set('fontSize', n); },
  'font-family':      function(obj, v) { if (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox') obj.set('fontFamily', v.trim().replace(/['"]/g, '')); },
  'font-weight':      function(obj, v) { if (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox') obj.set('fontWeight', v.trim()); },
  'letter-spacing':   function(obj, v) { var n = parseFloat(v); if (!isNaN(n) && (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox')) obj.set('charSpacing', n * 10); },
  'box-shadow':       function(obj, v) {
    var m = v.match(/([-\d.]+)px\s+([-\d.]+)px\s+([-\d.]+)px\s*([-\d.]*px)?\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))?/);
    if (m) {
      var color = m[5] || 'rgba(0,0,0,0.3)';
      obj.set('shadow', new fabric.Shadow({ offsetX: parseFloat(m[1]), offsetY: parseFloat(m[2]), blur: parseFloat(m[3]), color: color }));
    }
  },
  'text-shadow':      function(obj, v) {
    var m = v.match(/([-\d.]+)px\s+([-\d.]+)px\s+([-\d.]+)px\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))?/);
    if (m && (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox')) {
      obj.set('shadow', new fabric.Shadow({ offsetX: parseFloat(m[1]), offsetY: parseFloat(m[2]), blur: parseFloat(m[3]), color: m[4] || 'rgba(0,0,0,0.3)' }));
    }
  }
};

function applyWfCustomCss() {
  var textarea = document.getElementById('p-wf-css');
  if (!textarea) return;
  var css = textarea.value.trim();
  if (!css) return;

  var obj = canvas.getActiveObject();
  if (!obj) return;

  // Parse CSS declarations
  var declarations = css.split(';').filter(function(d) { return d.trim(); });

  function _applyCssToObj(target) {
    declarations.forEach(function(decl) {
      var parts = decl.split(':');
      if (parts.length < 2) return;
      var prop = parts[0].trim().toLowerCase();
      var val = parts.slice(1).join(':').trim();
      if (_WF_CSS_MAP[prop]) {
        _WF_CSS_MAP[prop](target, val);
      }
    });
  }

  if (obj.type === 'group' && obj._objects) {
    obj._objects.forEach(function(child) { _applyCssToObj(child); });
    obj.dirty = true;
  } else {
    _applyCssToObj(obj);
  }

  // Store custom CSS on the object for persistence
  obj._wfCustomCss = css;

  canvas.renderAll();
  if (typeof snap === 'function') snap();
  if (typeof showToast === 'function') showToast('CSS applied');
}

function loadWfCustomCss(obj) {
  var textarea = document.getElementById('p-wf-css');
  if (!textarea) return;
  textarea.value = (obj && obj._wfCustomCss) ? obj._wfCustomCss : '';
}



if (window.cc && cc.modules) cc.modules.register({ id: 'settings', parent: 'canvas.wireframe', title: 'Wireframe: settings', mount: function(){}, unmount: function(){} });
