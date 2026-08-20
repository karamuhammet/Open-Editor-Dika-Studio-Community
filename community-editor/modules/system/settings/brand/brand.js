/* Module: system/settings/brand — BRAND SETS — brand fonts/colours/logo model + editor, apply-to-object.
   Part of the settings group (decomposed from the 2763-line IIFE). Functions hang off the
   shared namespace SS (window.__ccSettings, created by the parent); cross-module refs resolve
   through SS at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var SS = window.__ccSettings;
  if (!SS) return;

  SS._getBrandSets = function () {
    try {
      var raw = localStorage.getItem(SS.BRAND_SETS_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  };

  SS._saveBrandSets = function (sets) {
    try { localStorage.setItem(SS.BRAND_SETS_KEY, JSON.stringify(sets)); } catch (e) {}
    // convergence: mirror brand sets to the account DB so the panel's "Markam" page sees them
    try { if (window.CCRemote && CCRemote.active) CCRemote.setSetting('brandsets', sets); } catch (e) {}
  };

  SS.getActiveBrandSet = function () {
    var sets = SS._getBrandSets();
    for (var i = 0; i < sets.length; i++) {
      if (sets[i].active) return sets[i];
    }
    return null;
  };

  SS._newBrandSet = function (name) {
    return {
      id: 'bs_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name: name || 'New Brand',
      active: false,
      colors: { body: '#FFFFFF', primary: '#3B82F6', text: '#374151' },
      font: { family: 'DM Sans', size: 14, hSize: 24 },
      logo: ''
    };
  };

  SS.buildBrandSetSection = function () {
    var sets = SS._getBrandSets();
    var html = '<div class="settings-section-title">Brand Sets</div>' +
      '<p style="color:var(--text-dim);font-size:13px;margin-bottom:16px">' +
        'Create brand kits with colours, typography &amp; logo. The <strong>active</strong> set is applied to all wireframe templates.' +
      '</p>';

    // new set button
    html += '<button class="sbtn" id="bs-add-new" style="margin-bottom:16px;padding:8px 16px;width:auto;height:auto;font-size:12px">' +
      '+ New Brand Set</button>';

    if (!sets.length) {
      html += '<div style="color:var(--text-faint);font-size:12px;padding:20px 0;text-align:center">No brand sets yet. Click the button above to create one.</div>';
    } else {
      html += '<div id="bs-list" class="bs-list">';
      sets.forEach(function(s) {
        var activeCls = s.active ? ' bs-card-active' : '';
        html += '<div class="bs-card' + activeCls + '" data-bs-id="' + SS.escAttr(s.id) + '">' +
          '<div class="bs-card-head">' +
            '<div class="bs-card-colors">' +
              '<span class="bs-swatch" style="background:' + SS.escAttr(s.colors.body) + ';border:1px solid var(--border)"></span>' +
              '<span class="bs-swatch" style="background:' + SS.escAttr(s.colors.primary) + '"></span>' +
              '<span class="bs-swatch" style="background:' + SS.escAttr(s.colors.text) + '"></span>' +
            '</div>' +
            '<div class="bs-card-info">' +
              '<span class="bs-card-name">' + SS.escAttr(s.name) + '</span>' +
              '<span class="bs-card-font" style="font-family:\'' + SS.escAttr(s.font.family) + '\',sans-serif">' + SS.escAttr(s.font.family) + ' ' + s.font.size + '/' + s.font.hSize + '</span>' +
            '</div>' +
            '<div class="bs-card-actions">' +
              // scan-3000 H30: Activate only applies brand colors/fonts to
              // WIREFRAME objects (_applyActiveBrandToWF) and to scene frames
              // behind the scene flag. While both consumers are paused the
              // button visibly did nothing; show it only when a consumer is
              // live. (The real brand system is the portal "Markalar" layer.)
              ((typeof ccFlag === 'function' && ccFlag('scene'))
                ? (s.active
                    ? '<span class="bs-badge-active">Active</span>'
                    : '<button class="bs-btn-activate" data-bs-id="' + SS.escAttr(s.id) + '" title="Set active">Activate</button>')
                : '') +
              '<button class="bs-btn-edit" data-bs-id="' + SS.escAttr(s.id) + '" title="Edit">&#9998;</button>' +
              '<button class="bs-btn-del" data-bs-id="' + SS.escAttr(s.id) + '" title="Delete">&times;</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
    }

    return html;
  };

  SS.wireBrandSetHandlers = function () {
    // Add new
    var addBtn = document.getElementById('bs-add-new');
    if (addBtn) {
      addBtn.onclick = function() { SS._openBrandSetEditor(null); };
    }

    // Activate / Edit / Delete
    document.querySelectorAll('.bs-btn-activate').forEach(function(btn) {
      btn.onclick = function() {
        var id = btn.dataset.bsId;
        var sets = SS._getBrandSets();
        sets.forEach(function(s) { s.active = (s.id === id); });
        SS._saveBrandSets(sets);
        SS._applyActiveBrandToWF();
        SS._refreshBrandUI();
      };
    });
    document.querySelectorAll('.bs-btn-edit').forEach(function(btn) {
      btn.onclick = function() {
        var id = btn.dataset.bsId;
        var sets = SS._getBrandSets();
        var s = sets.find(function(x) { return x.id === id; });
        if (s) SS._openBrandSetEditor(s);
      };
    });
    document.querySelectorAll('.bs-btn-del').forEach(function(btn) {
      btn.onclick = function() {
        var id = btn.dataset.bsId;
        var sets = SS._getBrandSets().filter(function(x) { return x.id !== id; });
        SS._saveBrandSets(sets);
        SS._refreshBrandUI();
        if (typeof showToast === 'function') showToast('Brand set deleted');
      };
    });
  };

  SS._refreshBrandUI = function () {
    var ct = document.getElementById('settings-content');
    if (ct) {
      ct.innerHTML = SS.buildBrandSetSection();
      SS.wireBrandSetHandlers();
    }
  };

  SS._openBrandSetEditor = function (existing) {
    var isNew = !existing;
    var s = existing ? JSON.parse(JSON.stringify(existing)) : SS._newBrandSet();

    // Build font options
    var fontOpts = '';
    SS.BRAND_FONTS.forEach(function(f) {
      fontOpts += '<option value="' + SS.escAttr(f) + '"' + (s.font.family === f ? ' selected' : '') + '>' + SS.escAttr(f) + '</option>';
    });

    var overlay = document.createElement('div');
    overlay.id = 'bs-editor-overlay';
    overlay.className = 'bs-editor-overlay';

    overlay.innerHTML =
      '<div class="bs-editor-box">' +
        '<div class="bs-editor-header">' +
          '<span>' + (isNew ? 'New Brand Set' : 'Edit: ' + SS.escAttr(s.name)) + '</span>' +
          '<button class="bs-editor-close" id="bs-editor-close">&times;</button>' +
        '</div>' +

        '<div class="bs-editor-body">' +
          // Name field
          '<div class="settings-field" style="margin-bottom:14px">' +
            '<label class="settings-label">Set Name</label>' +
            '<input class="settings-input" id="bs-ed-name" value="' + SS.escAttr(s.name) + '">' +
          '</div>' +

          // ── Accordion: Colors ──
          '<div class="bs-acc">' +
            '<button class="bs-acc-toggle active" data-acc="colors">' +
              '<span>&#9658; Colour Palette</span>' +
            '</button>' +
            '<div class="bs-acc-panel" id="bs-acc-colors" style="display:block">' +
              SS._brandColorRow('Body Background', 'bs-col-body', s.colors.body) +
              SS._brandColorRow('Primary / Accent', 'bs-col-primary', s.colors.primary) +
              SS._brandColorRow('Text', 'bs-col-text', s.colors.text) +
            '</div>' +
          '</div>' +

          // ── Accordion: Typography ──
          '<div class="bs-acc">' +
            '<button class="bs-acc-toggle" data-acc="typo">' +
              '<span>&#9658; Typography</span>' +
            '</button>' +
            '<div class="bs-acc-panel" id="bs-acc-typo" style="display:none">' +
              '<div class="settings-field">' +
                '<label class="settings-label">Font Family</label>' +
                '<select class="settings-input" id="bs-font-family">' + fontOpts + '</select>' +
              '</div>' +
              '<div style="display:flex;gap:10px">' +
                '<div class="settings-field" style="flex:1">' +
                  '<label class="settings-label">Body Size (px)</label>' +
                  '<input class="settings-input" type="number" id="bs-font-size" min="8" max="72" value="' + s.font.size + '">' +
                '</div>' +
                '<div class="settings-field" style="flex:1">' +
                  '<label class="settings-label">Heading Size (px)</label>' +
                  '<input class="settings-input" type="number" id="bs-font-hsize" min="12" max="120" value="' + s.font.hSize + '">' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +

          // ── Accordion: Logo ──
          '<div class="bs-acc">' +
            '<button class="bs-acc-toggle" data-acc="logo">' +
              '<span>&#9658; Logo</span>' +
            '</button>' +
            '<div class="bs-acc-panel" id="bs-acc-logo" style="display:none">' +
              '<div class="settings-field">' +
                '<label class="settings-label">Upload Logo</label>' +
                '<input type="file" accept="image/*" id="bs-logo-file" style="font-size:12px;color:var(--text-dim)">' +
              '</div>' +
              '<div id="bs-logo-preview" style="margin-top:8px">' +
                (s.logo ? '<img src="' + SS.escAttr(s.logo) + '" style="max-width:120px;max-height:60px;border-radius:4px;border:1px solid var(--border)">' : '<span style="font-size:11px;color:var(--text-faint)">No logo uploaded</span>') +
              '</div>' +
            '</div>' +
          '</div>' +

        '</div>' + // end body

        '<div class="bs-editor-footer">' +
          '<button class="sbtn" id="bs-ed-save" style="padding:10px 24px;width:auto;height:auto;font-size:13px">' + (isNew ? 'Create' : 'Save') + '</button>' +
          '<button class="sbtn" id="bs-ed-cancel" style="padding:10px 24px;width:auto;height:auto;font-size:13px;background:var(--surface2);color:var(--text-dim)">Cancel</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    // Accordion toggles
    overlay.querySelectorAll('.bs-acc-toggle').forEach(function(tog) {
      tog.onclick = function() {
        var tgt = tog.dataset.acc;
        var panel = document.getElementById('bs-acc-' + tgt);
        if (!panel) return;
        var isOpen = panel.style.display !== 'none';
        panel.style.display = isOpen ? 'none' : 'block';
        tog.classList.toggle('active', !isOpen);
      };
    });

    // Color picker → hex label sync
    overlay.querySelectorAll('.bs-color-picker').forEach(function(picker) {
      picker.oninput = function() {
        var hex = picker.parentElement.querySelector('.bs-color-hex');
        if (hex) hex.textContent = picker.value;
      };
    });

    // Logo file handler
    var logoFile = document.getElementById('bs-logo-file');
    var _tempLogo = s.logo || '';
    if (logoFile) {
      logoFile.onchange = function() {
        if (!logoFile.files || !logoFile.files[0]) return;
        var reader = new FileReader();
        reader.onload = function(e) {
          _tempLogo = e.target.result;
          var prev = document.getElementById('bs-logo-preview');
          if (prev) prev.innerHTML = '<img src="' + SS.escAttr(_tempLogo) + '" style="max-width:120px;max-height:60px;border-radius:4px;border:1px solid var(--border)">';
        };
        reader.readAsDataURL(logoFile.files[0]);
      };
    }

    // Close
    var closeEditor = function() { overlay.remove(); };
    document.getElementById('bs-editor-close').onclick = closeEditor;
    document.getElementById('bs-ed-cancel').onclick = closeEditor;

    // Save
    document.getElementById('bs-ed-save').onclick = function() {
      var nameVal = (document.getElementById('bs-ed-name').value || '').trim();
      if (!nameVal) { if (typeof showToast === 'function') showToast('Name is required'); return; }

      s.name = nameVal;
      s.colors.body = document.getElementById('bs-col-body').value;
      s.colors.primary = document.getElementById('bs-col-primary').value;
      s.colors.text = document.getElementById('bs-col-text').value;
      s.font.family = document.getElementById('bs-font-family').value;
      s.font.size = parseInt(document.getElementById('bs-font-size').value) || 14;
      s.font.hSize = parseInt(document.getElementById('bs-font-hsize').value) || 24;
      s.logo = _tempLogo;

      var sets = SS._getBrandSets();
      if (isNew) {
        sets.push(s);
      } else {
        for (var i = 0; i < sets.length; i++) {
          if (sets[i].id === s.id) { sets[i] = s; break; }
        }
      }
      SS._saveBrandSets(sets);
      closeEditor();
      SS._refreshBrandUI();
      if (typeof showToast === 'function') showToast(isNew ? 'Brand set created' : 'Brand set saved');
    };
  };

  SS._brandColorRow = function (label, id, value) {
    return '<div class="bs-color-row">' +
      '<label class="settings-label" style="flex:1">' + label + '</label>' +
      '<input type="color" id="' + id + '" value="' + SS.escAttr(value) + '" class="bs-color-picker">' +
      '<span class="bs-color-hex" style="font-size:11px;color:var(--text-faint);min-width:60px">' + SS.escAttr(value) + '</span>' +
    '</div>';
  };

  SS._applyActiveBrandToWF = function () {
    var brand = SS.getActiveBrandSet();
    if (!brand) return;

    // Capture old WF values before overriding (so we can match existing objects)
    var oldAccent = (typeof WF !== 'undefined') ? WF.accent : '#3B82F6';
    var oldBgPage = (typeof WF !== 'undefined') ? WF.bgPage : '#FFFFFF';

    // Update WF constants
    if (typeof WF !== 'undefined') {
      WF.bgPage = brand.colors.body;
      WF.accent = brand.colors.primary;
      WF.textDark = brand.colors.text;
    }

    // Apply to existing wireframe objects on canvas
    if (typeof canvas === 'undefined' || !canvas) return;
    canvas.getObjects().forEach(function(obj) {
      if (!obj._isWireframe) return;
      if (obj.type === 'group' && obj._objects) {
        obj._objects.forEach(function(child) { SS._applyBrandToObj(child, brand, oldAccent, oldBgPage); });
        // Replace logo placeholder with brand logo if available
        if (brand.logo) SS._replaceBrandLogo(obj, brand);
        obj.dirty = true;
      } else {
        SS._applyBrandToObj(obj, brand, oldAccent, oldBgPage);
      }
    });
    canvas.renderAll();
    if (typeof saveState === 'function') saveState();

    // Re-render template thumbnails with brand colors
    if (typeof renderTemplateCategoryCards === 'function') {
      renderTemplateCategoryCards('flyout-tpl-grid');
    }
  };

  SS._replaceBrandLogo = function (group, brand) {
    if (!brand.logo || !group._objects) return;
    // Find the logo placeholder: a Circle that sits near a text "A" or "✦"
    var logoCircle = null;
    var logoText = null;
    var children = group._objects;
    for (var i = 0; i < children.length; i++) {
      var c = children[i];
      if (c.type === 'circle' && c.radius && c.radius <= 20) {
        // Check if next text is a logo marker
        for (var j = 0; j < children.length; j++) {
          var t = children[j];
          if ((t.type === 'i-text' || t.type === 'text') && (t.text === 'A' || t.text === '✦') && t.fontSize <= 14) {
            var dist = Math.abs(t.left - c.left) + Math.abs(t.top - c.top);
            if (dist < 60) {
              logoCircle = c;
              logoText = t;
              break;
            }
          }
        }
        if (logoCircle) break;
      }
    }
    if (!logoCircle) return;

    // Load brand logo image and replace the circle+text
    fabric.Image.fromURL(brand.logo, function(img) {
      if (!img) return;
      var sz = logoCircle.radius * 2;
      img.scaleToWidth(sz);
      img.scaleToHeight(sz);
      img.set({
        left: logoCircle.left,
        top: logoCircle.top,
        _isWireframe: true,
        _wfBrandLogo: true
      });
      // Remove old circle and text
      group.removeWithUpdate(logoCircle);
      if (logoText) group.removeWithUpdate(logoText);
      group.addWithUpdate(img);
      group.dirty = true;
      if (typeof canvas !== 'undefined' && canvas) canvas.renderAll();
    }, { crossOrigin: 'anonymous' });
  };

  SS._applyBrandToObj = function (obj, brand, oldAccent, oldBgPage) {
    // Text objects
    if (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox') {
      if (obj.fill !== '#FFFFFF' && obj.fill !== 'white') {
        obj.set('fill', brand.colors.text);
      }
      if (brand.font.family) obj.set('fontFamily', brand.font.family);
      if (obj.fontSize >= 20) {
        obj.set('fontSize', brand.font.hSize);
      } else {
        obj.set('fontSize', brand.font.size);
      }
    }
    // Accent-colored rects (buttons) — match current WF accent
    if (obj.type === 'rect' && obj.fill === oldAccent) {
      obj.set('fill', brand.colors.primary);
    }
    // Background rects (body bg)
    if (obj.type === 'rect' && obj.fill === oldBgPage) {
      obj.set('fill', brand.colors.body);
    }
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'brand', parent: 'system.settings', title: 'settings: brand', mount: function () {}, unmount: function () {} });
  }
})();
