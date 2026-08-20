/* Module: shared/color-picker/panel — PANEL shell + integration — builds/wires the #rp-color-wrap DOM, applies the chosen colour to the active object/target, open/close, float-toolbar button, and the right-panel swatch buttons (initColorSwatchButtons/syncColorSwatches).
   Part of the color-picker group (decomposed from the 1698-line IIFE). All functions hang
   off the shared namespace CP (window.__ccColorPicker, created by the parent); cross-module
   references resolve through CP at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var CP = window.__ccColorPicker;
  if (!CP) return;

  CP.buildColorPanelHTML = function () {
    var html = '';
    html += '<div class="cp-header">';
    html += '<button class="cp-back-btn" id="cp-back-btn" title="Back">';
    html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
    html += '</button>';
    html += '<span class="cp-header-title">Color</span>';
    html += '</div>';
    html += '<div class="cp-tab-bar">';
    html += '<button class="cp-tab active" data-cp-tab="solid">Solid Color</button>';
    html += '<button class="cp-tab" data-cp-tab="gradient">Gradient</button>';
    html += '<button class="cp-tab" data-cp-tab="image">Image</button>';
    html += '</div>';
    html += '<div class="cp-solid-wrap" id="cp-solid-wrap">';
    html += '<div class="cp-section">';
    html += '<div class="cp-section-title">Document Colors</div>';
    html += '<div class="cp-swatches" id="cp-doc-colors-row">';
    html += '<button class="cp-add-color-btn" id="cp-add-color-btn" title="Pick a color"><span>+</span></button>';
    html += '<span id="cp-doc-colors" style="display:contents"></span>';
    html += '</div>';
    html += '</div>';
    html += '<div class="cp-picker-area" id="cp-picker-area" style="display:none">';
    html += '<div class="cp-spectrum-wrap"><canvas class="cp-spectrum" id="cp-spectrum" width="220" height="150"></canvas><div class="cp-spectrum-cursor" id="cp-spectrum-cursor"></div></div>';
    html += '<div class="cp-hue-wrap"><canvas class="cp-hue-bar" id="cp-hue-bar" width="220" height="14"></canvas><div class="cp-hue-cursor" id="cp-hue-cursor"></div></div>';
    html += '<div class="cp-hex-row"><div class="cp-hex-preview" id="cp-hex-preview"></div><input type="text" class="cp-hex-input" id="cp-hex-input" maxlength="7" value="#ffffff"><button class="cp-eyedropper-btn" id="cp-eyedropper-btn" title="Eyedropper"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4Z"/></svg></button></div>';
    html += '</div>';
    html += '<div class="cp-section"><div class="cp-section-title">Photo Colors</div><div class="cp-swatches" id="cp-photo-colors"></div></div>';
    html += '<div class="cp-section"><div class="cp-section-title">Default Colors</div><div class="cp-swatches" id="cp-default-colors"></div></div>';
    html += '</div>';
    html += '<div class="cp-gradient-wrap" id="cp-gradient-wrap" style="display:none">';
    html += '<div class="cp-grad-preview-shell">';
    html += '<div class="cp-grad-toolbar"><div class="cp-grad-type-wrap"><button type="button" class="cp-grad-type-btn" id="cp-grad-type-btn"><span id="cp-grad-type-label">Linear</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button><div class="cp-grad-type-menu" id="cp-grad-type-menu"></div></div><div class="cp-grad-toolbar-actions"><button type="button" class="cp-grad-tool-btn" id="cp-grad-flip-btn" title="Flip gradient"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3l4 4-4 4"/><path d="M3 7h18"/><path d="M7 21l-4-4 4-4"/><path d="M21 17H3"/></svg></button><button type="button" class="cp-grad-tool-btn" id="cp-grad-rotate-btn" title="Rotate gradient"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 11a8 8 0 1 0 2.3 5.7"/><polyline points="20 4 20 11 13 11"/></svg></button></div></div>';
    html += '<div class="cp-grad-track-shell" id="cp-grad-track-shell"><div class="cp-grad-track" id="cp-grad-track"></div><div class="cp-grad-stops-layer" id="cp-grad-stops-layer"></div></div>';
    html += '</div>';
    html += '<div class="cp-section cp-grad-stops-section"><div class="cp-section-title">Stops</div><div class="cp-grad-stops-list" id="cp-grad-stops-list"></div></div>';
    html += '<div class="cp-grad-stop-picker" id="cp-grad-stop-picker" style="display:none">';
    html += '<div class="cp-spectrum-wrap"><canvas class="cp-spectrum" id="gp-spectrum" width="220" height="150"></canvas><div class="cp-spectrum-cursor" id="gp-spectrum-cursor"></div></div>';
    html += '<div class="cp-hue-wrap"><canvas class="cp-hue-bar" id="gp-hue-bar" width="220" height="14"></canvas><div class="cp-hue-cursor" id="gp-hue-cursor"></div></div>';
    html += '<div class="cp-hex-row"><div class="cp-hex-preview" id="gp-hex-preview"></div><input type="text" class="cp-hex-input" id="gp-hex-input" maxlength="7" value="#ffffff"><button class="cp-eyedropper-btn" id="gp-eyedropper-btn" title="Eyedropper"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4Z"/></svg></button></div>';
    html += '</div>';
    html += '<div class="cp-section"><div class="cp-section-title">Gradient Presets</div><div class="cp-grad-presets" id="cp-grad-presets"></div></div>';
    html += '</div>';
    /* IMAGE fill. Built from the SHIPPED background-panel vocabulary (.rpf-bg-drop / .rpf-bg-choose
       / .rpf-bg-remove / .rpf-seg) rather than a second look for the same job, so a picture on a
       shape reads the same as a picture on the page. */
    html += '<div class="cp-image-wrap" id="cp-image-wrap" style="display:none">';
    html += '<div class="cp-section">';
    html += '<div class="cp-section-title">Image</div>';
    html += '<div class="rpf-bg-drop" id="cp-img-drop"><div class="rpf-bg-dropbtns">';
    html += '<button type="button" class="rpf-bg-choose" id="cp-img-choose"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Choose media…</button>';
    html += '</div></div>';
    html += '<input type="file" id="cp-img-file" accept="image/*" style="display:none">';
    html += '</div>';
    html += '<div class="cp-section"><div class="cp-section-title">Fit</div>';
    html += '<div class="rpf-seg" id="cp-img-fit">';
    html += '<button type="button" data-imgfit="cover" class="on" title="Fill">Fill</button>';
    html += '<button type="button" data-imgfit="contain" title="Fit">Fit</button>';
    html += '<button type="button" data-imgfit="tile" title="Tile">Tile</button>';
    html += '</div></div>';
    html += '<div class="cp-section"><button type="button" class="rpf-bg-remove" id="cp-img-remove">Remove image</button></div>';
    html += '</div>';
    return html;
  };

  CP.initColorPanel = function () {
    var rpanel = document.getElementById('rpanel');
    if (!rpanel || document.getElementById('rp-color-wrap')) return;
    var wrap = document.createElement('div');
    wrap.id = 'rp-color-wrap';
    wrap.className = 'rp-color-wrap';
    wrap.style.display = 'none';
    wrap.innerHTML = CP.buildColorPanelHTML();
    rpanel.appendChild(wrap);
    CP.wireColorPanel();
    CP.renderDefaultColors();
    CP.renderGradientTypeMenu();
    CP.renderGradientPresets();
    CP.drawHueBar();
  };

  CP.wireColorPanel = function () {
    var backBtn = document.getElementById('cp-back-btn');
    if (backBtn) backBtn.addEventListener('click', CP.closeColorPanel);

    var addBtn = document.getElementById('cp-add-color-btn');
    var pickerArea = document.getElementById('cp-picker-area');
    if (addBtn && pickerArea) {
      addBtn.addEventListener('click', function () {
        var open = pickerArea.style.display !== 'none';
        pickerArea.style.display = open ? 'none' : '';
        addBtn.classList.toggle('open', !open);
        if (!open) {
          CP.drawSpectrum();
          CP.drawHueBar();
          CP.updateHexInput();
        }
      });
    }

    var tabBar = document.querySelector('.cp-tab-bar');
    if (tabBar) {
      tabBar.addEventListener('click', function (e) {
        var btn = e.target.closest('.cp-tab');
        if (!btn) return;
        var tab = btn.dataset.cpTab;
        if (tab === 'gradient' && !CP.canUseGradientTarget(CP._cpTarget)) return;
        if (tab === 'image' && !CP.canUseImageTarget(CP._cpTarget)) return;
        CP._cpTab = tab;
        CP.syncPickerTabState();
      });
    }

    var specCanvas = document.getElementById('cp-spectrum');
    if (specCanvas) {
      specCanvas.addEventListener('mousedown', function (e) {
        CP._draggingSV = true;
        CP.pickSV(e);
      });
      document.addEventListener('mousemove', function (e) {
        if (CP._draggingSV) CP.pickSV(e);
      });
      document.addEventListener('mouseup', function () {
        CP._draggingSV = false;
      });
    }

    var hueBar = document.getElementById('cp-hue-bar');
    if (hueBar) {
      hueBar.addEventListener('mousedown', function (e) {
        CP._draggingHue = true;
        CP.pickHue(e);
      });
      document.addEventListener('mousemove', function (e) {
        if (CP._draggingHue) CP.pickHue(e);
      });
      document.addEventListener('mouseup', function () {
        CP._draggingHue = false;
      });
    }

    var hexInput = document.getElementById('cp-hex-input');
    if (hexInput) {
      hexInput.addEventListener('change', function () {
        var value = CP.normalizeHexColor(hexInput.value);
        CP.setColorFromHex(value);
        CP.applyCurrentColor();
      });
    }

    var eyeBtn = document.getElementById('cp-eyedropper-btn');
    if (eyeBtn) {
      eyeBtn.addEventListener('click', function () {
        if (!window.EyeDropper) {
          if (typeof showToast === 'function') showToast('Eyedropper not supported in this browser');
          return;
        }
        var ed = new window.EyeDropper();
        ed.open().then(function (res) {
          CP.setColorFromHex(res.sRGBHex);
          CP.applyCurrentColor();
        }).catch(function () {});
      });
    }

    CP.wireGradientPanel();
    CP.wireImageFillPanel();
  };

  /* ── Image fill tab ── */
  CP._imgFillState = { src: '', fit: 'cover' };

  /* Every object a fill write should land on. rpFillTargets (right-panel.js) is THE resolver for
     that question - a multi-selection wrapper is thrown away on deselect and a group paints through
     its children - so this delegates rather than keeping a second copy of the rule. The inline
     fallback is only for the standalone editor, where the right panel may not be loaded. */
  CP.fillTargets = function () {
    if (typeof rpFillTargets === 'function') return rpFillTargets();
    var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
    var obj = cvs ? cvs.getActiveObject() : null;
    if (!obj) return [];
    if (obj.type === 'activeSelection' && obj.getObjects) return obj.getObjects() || [];
    if (obj.type === 'group' && obj._objects && obj._objects.length) return obj._objects;
    return [obj];
  };
  CP.imageFillTargets = function () { return CP.fillTargets(); };

  CP.applyImageFill = function () {
    if (!CP.canUseImageTarget(CP._cpTarget)) return;
    var st = CP._imgFillState;
    if (!st.src) return;
    var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
    var targets = CP.imageFillTargets();
    if (!targets.length) return;
    var left = targets.length;
    targets.forEach(function (t) {
      CP.applyImageFillToTarget(t, st.src, st.fit, function (ok) {
        left--;
        if (!ok && typeof showToast === 'function') showToast('Image could not be loaded');
        if (left <= 0) {
          var act = cvs && cvs.getActiveObject();
          if (act) act.dirty = true;
          if (cvs) cvs.requestRenderAll();
          if (typeof snap === 'function') snap();
          CP.syncImageFillUi();
          if (typeof syncFill === 'function' && act) syncFill(act);
        }
      });
    });
  };

  CP.removeImageFill = function () {
    var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
    var targets = CP.imageFillTargets();
    if (!targets.length) return;
    targets.forEach(function (t) {
      CP.clearImageFillForObject(t);
      // Back to the last solid the object had, not to a hardcoded colour: _rpfLastFill is what the
      // Fill segment's own "none -> solid" path already restores.
      t.set('fill', (typeof t._rpfLastFill === 'string' && t._rpfLastFill) || '#cccccc');
      t.dirty = true;
    });
    CP._imgFillState.src = '';
    if (cvs) cvs.requestRenderAll();
    if (typeof snap === 'function') snap();
    CP.syncImageFillUi();
    var act = cvs && cvs.getActiveObject();
    if (typeof syncFill === 'function' && act) syncFill(act);
  };

  CP.syncImageFillUi = function () {
    var drop = document.getElementById('cp-img-drop');
    var seg = document.getElementById('cp-img-fit');
    var rm = document.getElementById('cp-img-remove');
    var st = CP._imgFillState;
    if (drop) {
      // .has-img swaps the checkerboard for the picture itself (right-panel.css), the same way the
      // page background's drop zone previews its own image.
      drop.classList.toggle('has-img', !!st.src);
      drop.style.backgroundImage = st.src ? 'url("' + st.src + '")' : '';
    }
    if (seg) {
      var bts = seg.querySelectorAll('button');
      for (var i = 0; i < bts.length; i++) bts[i].classList.toggle('on', bts[i].getAttribute('data-imgfit') === st.fit);
    }
    if (rm) rm.style.display = st.src ? '' : 'none';
  };

  CP.wireImageFillPanel = function () {
    var chooseBtn = document.getElementById('cp-img-choose');
    var fileInp = document.getElementById('cp-img-file');
    if (chooseBtn && fileInp) chooseBtn.addEventListener('click', function () { fileInp.click(); });
    if (fileInp) {
      fileInp.addEventListener('change', function (e) {
        var f = e.target.files && e.target.files[0];
        e.target.value = '';                       // same file twice must still fire a change
        if (!f) return;
        var rd = new FileReader();
        rd.onload = function (ev) {
          CP._imgFillState.src = ev.target.result;  // a data URL, so the pattern canvas never taints
          CP.applyImageFill();
        };
        rd.readAsDataURL(f);
      });
    }
    var seg = document.getElementById('cp-img-fit');
    if (seg) {
      seg.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('button[data-imgfit]') : null;
        if (!b) return;
        CP._imgFillState.fit = b.getAttribute('data-imgfit');
        CP.syncImageFillUi();
        if (CP._imgFillState.src) CP.applyImageFill();
      });
    }
    var rm = document.getElementById('cp-img-remove');
    if (rm) rm.addEventListener('click', function () { CP.removeImageFill(); });
  };

  CP.getActiveColorTargetObject = function () {
    var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
    var obj = cvs ? cvs.getActiveObject() : null;
    if (!obj) return null;
    if ((CP._cpTarget === 'fill' || CP._cpTarget === 'wbFill' || CP._cpTarget === 'textFill') && obj.type === 'group' && obj._objects && obj._objects.length > 0) {
      return obj._objects[0];
    }
    return obj;
  };

  CP.clearGradientStateForObject = function (obj) {
    if (!obj) return;
    delete obj._ccGradientState;
  };

  CP.applyCurrentColor = function () {
    var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
    var obj = cvs ? cvs.getActiveObject() : null;

    /* AI Post colour slot. Object-free like the QR and bucket targets above, so it belongs up here:
       placed lower down it never ran, because the object-dependent code in between bails when
       nothing is selected on the canvas (measured: the picker opened, the callback never fired).
       The chat panel cannot host this picker at all, since it mounts into #rpanel and hides the
       right panel's other views; this is the sanctioned bridge instead of a second picker. */
    if (CP._cpTarget === 'aiPost') {
      var _aia = window.__ccAI;
      if (_aia && typeof _aia._postSetColor === 'function') _aia._postSetColor(CP._cpColor);
      CP.updateSwatchButton();
      return;
    }
    /* Generic "write this colour into that input" target. Object-free, so it belongs up here with
       the other object-free targets. It exists because rpfOpenPalette's wheel button fell back to
       `input.click()` whenever a call site passed no full-panel target - and clicking a
       display:none <input type="color"> pops CHROME's own picker in the top-left corner of the
       screen, which is what the owner photographed. Every '' call site (shadow colour, text-effect
       stroke, background overlay, remove-colour, duotone) had the same hole. */
    if (CP._cpTarget === 'input') {
      var _gi = document.getElementById(CP._cpInputId || '');
      if (_gi) {
        _gi.value = CP._cpColor;
        _gi.dispatchEvent(new Event('input', { bubbles: true }));
        _gi.dispatchEvent(new Event('change', { bubbles: true }));
      }
      CP.updateSwatchButton();
      return;
    }
    if (CP._cpTarget === 'qrColor') {
      var qrInp = document.getElementById('p-qr-color');
      if (qrInp) {
        qrInp.value = CP._cpColor;
        if (typeof updateQRColor === 'function') updateQRColor();
      }
      CP.updateSwatchButton();
      return;
    }
    if (CP._cpTarget === 'qrBg') {
      var qrBg = document.getElementById('p-qr-bg');
      if (qrBg) {
        qrBg.value = CP._cpColor;
        if (typeof updateQRColor === 'function') updateQRColor();
      }
      CP.updateSwatchButton();
      return;
    }
    if (CP._cpTarget === 'bucketFill') {
      if (typeof window._bucketFillToolSetColor === 'function') window._bucketFillToolSetColor(CP._cpColor);
      CP.updateSwatchButton();
      return;
    }
    if (CP._cpTarget === 'wbBrush') {
      if (typeof window._wbSetBrushColor === 'function') window._wbSetBrushColor(CP._cpColor);
      CP.updateSwatchButton();
      return;
    }
    if (CP._cpTarget === 'gradBg1' || CP._cpTarget === 'gradBg2') {
      var gInpId = CP._cpTarget === 'gradBg1' ? 'grad-bg-color-1' : 'grad-bg-color-2';
      var gInp = document.getElementById(gInpId);
      if (gInp) gInp.value = CP._cpColor;
      CP.updateSwatchButton();
      return;
    }
    if (CP._cpTarget === 'pageBg') {                        // canvas background (solid)
      // Route through rpfSetCanvasBg (the video-aware bg bridge) so in video mode this
      // writes _veProject.bgColor / re-renders the compositor instead of clobbering the
      // live video preview (which IS the fabric backgroundColor), and the bg swatch/hex/
      // recent stay in sync. Keep the direct path as a fallback if the bridge is absent.
      var _bgIn = document.getElementById('p-bg-color'); if (_bgIn) _bgIn.value = CP._cpColor;
      if (typeof rpfSetCanvasBg === 'function') {
        rpfSetCanvasBg(CP._cpColor);
      } else if (cvs) {
        if (cvs.backgroundImage) cvs.setBackgroundImage(null, function () {});
        cvs.setBackgroundColor(CP._cpColor, cvs.renderAll.bind(cvs));
        if (typeof pages !== 'undefined' && typeof currentPageIndex !== 'undefined' && pages[currentPageIndex]) pages[currentPageIndex].bg = CP._cpColor;
      }
      CP.updateSwatchButton();
      return;
    }
    if (!obj) {
      CP.updateSwatchButton();
      return;
    }

    function applySolidToTarget(targetObj) {
      if (!targetObj) return;
      if (CP._cpTarget === 'textFill' || CP._cpTarget === 'fill' || CP._cpTarget === 'wbFill') {
        CP.clearGradientStateForObject(targetObj);
        if (CP.clearImageFillForObject) CP.clearImageFillForObject(targetObj);  // a fill has one kind
        targetObj.set('fill', CP._cpColor);
      }
      else if (CP._cpTarget === 'stroke' || CP._cpTarget === 'imgStroke' || CP._cpTarget === 'wbStroke') targetObj.set('stroke', CP._cpColor);
      // Clip background. On a frame this is the SHAPE child's own fill, so it covers the whole
      // shape under the image at any fit; the right panel owns that branching.
      else if (CP._cpTarget === 'clipBg') {
        if (typeof _rpApplyClipBg === 'function') _rpApplyClipBg(CP._cpColor);
        else { targetObj.set('backgroundColor', CP._cpColor); targetObj.dirty = true; }
      }
    }

    /* A fill/stroke colour has to reach the real objects: a group paints through its children, and
       a multi-selection wrapper is discarded on deselect (measured 2026-08-07 - a colour picked
       over two texts changed neither of them). This used to unwrap the group case only. */
    if (CP._cpTarget === 'textFill' || CP._cpTarget === 'fill' || CP._cpTarget === 'wbFill' ||
        CP._cpTarget === 'stroke' || CP._cpTarget === 'wbStroke') {
      CP.fillTargets().forEach(function (t) { applySolidToTarget(t); t.dirty = true; });
      obj.dirty = true;
    } else {
      applySolidToTarget(obj);
      obj.dirty = true;
    }

    if (CP._cpTarget === 'teStroke') {
      var teInp = document.getElementById('te-stroke-color');
      if (teInp) {
        teInp.value = CP._cpColor;
        if (typeof updateTextStroke === 'function') updateTextStroke();
      }
    } else if (CP._cpTarget === 'teShadow') {
      var tsInp = document.getElementById('te-shadow-color');
      if (tsInp) {
        tsInp.value = CP._cpColor;
        if (typeof updateTextShadow === 'function') updateTextShadow();
      }
    }


    if (cvs) cvs.renderAll();
    CP.updateSwatchButton();
  };

  CP.updateSwatchButton = function () {
    var map = {
      textFill: 'cp-swatch-p-color',
      fill: 'cp-swatch-p-fill',
      stroke: 'cp-swatch-p-stroke',
      qrColor: 'cp-swatch-p-qr-color',
      qrBg: 'cp-swatch-p-qr-bg',
      imgStroke: 'cp-swatch-p-img-stroke',
      bucketFill: 'bucket-fill-swatch',
      wbFill: 'cp-swatch-p-wb-fill',
      wbStroke: 'cp-swatch-p-wb-stroke',
      teStroke: 'cp-swatch-te-stroke-color',
      teShadow: 'cp-swatch-te-shadow-color',
      gradBg1: 'grad-bg-swatch-1',
      gradBg2: 'grad-bg-swatch-2'
    };
    var id = map[CP._cpTarget];
    var btn = id ? document.getElementById(id) : null;
    if (!btn) return;
    if (CP._cpTab === 'gradient' && CP.canUseGradientTarget(CP._cpTarget)) {
      btn.style.background = CP.buildSwatchPreviewBackground(CP._gradState);
      btn.dataset.color = CP.getSelectedStop().color;
      btn.dataset.gradient = JSON.stringify(CP.cloneGradientState(CP._gradState));
      return;
    }
    btn.style.background = CP._cpColor;
    btn.dataset.color = CP._cpColor;
    btn.dataset.gradient = '';
  };

  CP.syncPickerTabState = function () {
    var solidWrap = document.getElementById('cp-solid-wrap');
    var gradWrap = document.getElementById('cp-gradient-wrap');
    var imgWrap = document.getElementById('cp-image-wrap');
    document.querySelectorAll('.cp-tab').forEach(function (tab) {
      tab.classList.toggle('active', tab.dataset.cpTab === CP._cpTab);
    });
    if (solidWrap) solidWrap.style.display = CP._cpTab === 'solid' ? '' : 'none';
    if (gradWrap) gradWrap.style.display = CP._cpTab === 'gradient' ? '' : 'none';
    if (imgWrap) imgWrap.style.display = CP._cpTab === 'image' ? '' : 'none';
    if (CP._cpTab === 'gradient') {
      CP.renderGradientUi();
      CP.openGradStopPicker(CP.getSelectedStop().id, true);
    }
    if (CP._cpTab === 'image') CP.syncImageFillUi();
    CP.updateSwatchButton();
  };

  /* opts.tab ('solid' | 'gradient') lets a caller land on the editor its BUTTON promised. Optional
     and backwards-compatible: every existing caller passes two arguments and keeps the derived tab. */
  CP.openColorPanel = function (target, currentColor, opts) {
    CP._cpTarget = target;
    // opts.inputId pairs with the 'input' target above: which field the chosen colour lands in.
    CP._cpInputId = (opts && opts.inputId) || '';
    CP.initColorPanel();

    /* A close() that is still animating owns a pending timer whose only job is to hide this panel.
       Re-opening inside those 200 ms used to leave it armed, so it fired AFTER the lines below had
       hidden every other view: all four wraps ended up display:none and the right panel went blank
       with the Back button and the tab bar both inside the hidden parts, i.e. no way out but F5.
       Measured + written up as F4 in docs/editor-selection-textcase-colorpanel-fixes-2026-08-07.md.
       Cancelled here, and the timer re-checks for itself in closeColorPanel. */
    if (CP._cpCloseTimer) { clearTimeout(CP._cpCloseTimer); CP._cpCloseTimer = 0; }

    var wrap = document.getElementById('rp-color-wrap');
    var propWrap = document.getElementById('rp-properties-wrap');
    var layoutWrap = document.getElementById('rp-layout-wrap');
    var layersWrap = document.getElementById('rp-layers-wrap');
    var tabBar = document.getElementById('rp-tab-bar');

    /* No panel to show (initColorPanel could not build it). Leave the right panel on Properties
       instead of hiding everything: a surface with nothing on it is indistinguishable from a
       broken app, and hiding the tab bar removes the only control that could bring it back. */
    if (!wrap) {
      if (tabBar) tabBar.style.display = '';
      if (typeof switchRpTab === 'function') switchRpTab('properties');
      else if (propWrap) propWrap.style.display = '';
      return;
    }

    /* Self-heal: this panel must be a DIRECT child of #rpanel. initRpTabs sweeps every remaining
       rp-* child into #rp-properties-wrap, and whichever of the two polling inits happens to win
       decides whether it catches this one - when it does, the lines below hide the properties wrap
       and take the colour panel down with it (measured 2026-08-07). Cheap to check, and it also
       repairs a page that is already in that state. */
    var rpanelEl = document.getElementById('rpanel');
    if (rpanelEl && wrap.parentElement !== rpanelEl) rpanelEl.appendChild(wrap);

    if (propWrap) propWrap.style.display = 'none';
    if (layoutWrap) layoutWrap.style.display = 'none';
    if (layersWrap) layersWrap.style.display = 'none';
    if (tabBar) tabBar.style.display = 'none';
    var boardWrap = document.getElementById('rp-board');
    if (boardWrap) boardWrap.style.display = 'none';

    wrap.style.display = '';
    wrap.classList.remove('cp-slide-in');
    void wrap.offsetWidth;
    wrap.classList.add('cp-slide-in');

    var targetObj = CP.getActiveColorTargetObject();
    var gradientState = CP.canUseGradientTarget(target) ? CP.parseGradientStateFromObject(targetObj) : null;
    if (target === 'pageBg' && !gradientState) {            // parse an existing canvas-bg gradient
      var _pbcvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
      if (_pbcvs && _pbcvs.backgroundColor && typeof _pbcvs.backgroundColor === 'object' && _pbcvs.backgroundColor.colorStops) {
        gradientState = CP.parseGradientStateFromObject({ fill: _pbcvs.backgroundColor });
      }
    }
    if (gradientState) {
      CP._gradState = CP.cloneGradientState(gradientState);
      CP._gradSelectedStopId = CP._gradState.stops[0].id;
    } else {
      CP._gradState = CP.cloneGradientState({
        type: 'linear',
        angle: 90,
        stops: [
          { id: 1, offset: 0, color: CP.normalizeHexColor(currentColor || '#f2ff58'), opacity: 100 },
          { id: 2, offset: 100, color: '#6c63ff', opacity: 100 }
        ]
      });
      CP._gradSelectedStopId = CP._gradState.stops[0].id;
    }

    if (currentColor && typeof currentColor === 'string') CP.setColorFromHex(currentColor);

    /* Which tab to land on. A caller that pressed a specific fill type says so through opts.tab:
       the "Gradyan" button used to open the SOLID tab, because the tab was derived from the
       object's CURRENT fill and a solid object has no gradient state - so the one control whose
       whole job is "make this a gradient" showed the wrong editor. Callers that do not ask keep
       the derived behaviour, and a request the target cannot honour is dropped, not obeyed. */
    var imageState = CP.canUseImageTarget(target) ? CP.parseImageFillFromObject(targetObj) : null;
    CP._imgFillState = imageState ? { src: imageState.src, fit: imageState.fit } : { src: '', fit: 'cover' };

    var wantTab = (opts && opts.tab) || '';
    if (wantTab === 'gradient' && !CP.canUseGradientTarget(target)) wantTab = '';
    if (wantTab === 'image' && !CP.canUseImageTarget(target)) wantTab = '';
    CP._cpTab = wantTab ||
      (imageState ? 'image' : (gradientState && CP.canUseGradientTarget(target) ? 'gradient' : 'solid'));
    var gradTab = document.querySelector('.cp-tab[data-cp-tab="gradient"]');
    if (gradTab) gradTab.style.display = CP.canUseGradientTarget(target) ? '' : 'none';
    var imgTab = document.querySelector('.cp-tab[data-cp-tab="image"]');
    if (imgTab) imgTab.style.display = CP.canUseImageTarget(target) ? '' : 'none';

    var pickerArea = document.getElementById('cp-picker-area');
    var addBtn = document.getElementById('cp-add-color-btn');
    if (pickerArea) pickerArea.style.display = 'none';
    if (addBtn) addBtn.classList.remove('open');

    CP.drawSpectrum();
    CP.drawHueBar();
    CP.updateHexInput();
    CP.renderDocumentColors();
    CP.renderPhotoColors();
    CP.renderGradientPresets();
    CP.renderGradientUi();
    CP.syncPickerTabState();

    /* Asked for the gradient editor on an object that has none yet: commit the default gradient so
       the canvas matches what the panel is showing. Without this the editor displays a gradient the
       object does not have until the user happens to drag a stop, and pressing Back leaves the fill
       segment reading "gradient" over a solid fill. Only when the tab was REQUESTED - never when it
       was derived from an existing gradient, which is already on the object. */
    if (wantTab === 'gradient' && !gradientState && typeof CP.applyGradient === 'function') {
      CP.applyGradient();
      if (typeof snap === 'function') snap();
    }
  };

  CP.closeColorPanel = function () {
    var wrap = document.getElementById('rp-color-wrap');
    var tabBar = document.getElementById('rp-tab-bar');

    if (CP._cpCloseTimer) { clearTimeout(CP._cpCloseTimer); CP._cpCloseTimer = 0; }
    if (wrap) {
      wrap.classList.remove('cp-slide-in');
      wrap.classList.add('cp-slide-out');
      CP._cpCloseTimer = setTimeout(function () {
        CP._cpCloseTimer = 0;
        // Re-opened while we were animating out: what is on screen now is a NEW panel, and hiding
        // it here is exactly the blank-right-panel bug. cp-slide-in is only ever re-added by
        // openColorPanel, so its presence is the reliable "somebody re-opened me" signal.
        if (wrap.classList.contains('cp-slide-in')) return;
        wrap.style.display = 'none';
        wrap.classList.remove('cp-slide-out');
      }, 200);
    }

    if (tabBar) tabBar.style.display = '';

    var activeTab = document.querySelector('#rp-tab-bar .rp-tab.active');
    var tabName = activeTab ? activeTab.dataset.rpTab : 'properties';
    if (typeof switchRpTab === 'function') switchRpTab(tabName);
    else {
      var propWrap = document.getElementById('rp-properties-wrap');
      if (propWrap) propWrap.style.display = '';
    }

    if (typeof syncRightPanel === 'function') syncRightPanel();
    if (typeof snap === 'function') snap();
  };

  CP.addFloatTBColorButton = function () {
    var floatTB = document.getElementById('float-tb');
    if (!floatTB || document.getElementById('ft-color-btn')) return;
    var dupBtn = floatTB.querySelector('button');
    if (!dupBtn) return;

    var colorBtn = document.createElement('button');
    colorBtn.id = 'ft-color-btn';
    colorBtn.title = 'Color';
    colorBtn.innerHTML = typeof getIcon === 'function' ? getIcon('droplet', 15) : 'Color';
    colorBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
      var obj = cvs ? cvs.getActiveObject() : null;
      if (!obj) return;
      var isText = obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox';
      var target = isText ? 'textFill' : 'fill';
      var current = '#ffffff';
      if (isText) current = typeof obj.fill === 'string' ? obj.fill : '#ffffff';
      else if (obj.type === 'group' && obj._objects && obj._objects.length > 0) current = typeof obj._objects[0].fill === 'string' ? obj._objects[0].fill : '#000000';
      else current = typeof obj.fill === 'string' ? obj.fill : '#000000';
      if (typeof switchRpTab === 'function') switchRpTab('properties');
      CP.openColorPanel(target, current);
    });

    dupBtn.parentNode.insertBefore(colorBtn, dupBtn.nextSibling);
  };

  CP.replaceColorInput = function (inputId, swatchId, target) {
    var inp = document.getElementById(inputId);
    if (!inp || document.getElementById(swatchId)) return;
    var swatch = document.createElement('div');
    swatch.className = 'cp-swatch-btn';
    swatch.id = swatchId;
    swatch.style.background = inp.value || '#ffffff';
    swatch.dataset.color = inp.value || '#ffffff';
    swatch.title = 'Choose color';
    swatch.addEventListener('click', function () {
      CP.openColorPanel(target, swatch.dataset.color);
    });
    inp.parentNode.insertBefore(swatch, inp);
    inp.style.display = 'none';
  };

  CP.observeForTextEffectInputs = function () {
    var rpText = document.getElementById('rp-text');
    if (!rpText) return;
    function tryReplace() {
      CP.replaceColorInput('te-stroke-color', 'cp-swatch-te-stroke-color', 'teStroke');
      CP.replaceColorInput('te-shadow-color', 'cp-swatch-te-shadow-color', 'teShadow');
    }
    tryReplace();
    var mo = new MutationObserver(function () { tryReplace(); });
    mo.observe(rpText, { childList: true, subtree: true });
  };

  CP.initColorSwatchButtons = function () {
    CP.replaceColorInput('p-color', 'cp-swatch-p-color', 'textFill');
    CP.replaceColorInput('p-fill', 'cp-swatch-p-fill', 'fill');
    CP.replaceColorInput('p-stroke', 'cp-swatch-p-stroke', 'stroke');
    CP.replaceColorInput('p-qr-color', 'cp-swatch-p-qr-color', 'qrColor');
    CP.replaceColorInput('p-qr-bg', 'cp-swatch-p-qr-bg', 'qrBg');
    CP.replaceColorInput('p-img-stroke', 'cp-swatch-p-img-stroke', 'imgStroke');
    CP.replaceColorInput('p-wb-fill', 'cp-swatch-p-wb-fill', 'wbFill');
    CP.replaceColorInput('p-wb-stroke', 'cp-swatch-p-wb-stroke', 'wbStroke');
    CP.observeForTextEffectInputs();
  };

  CP.syncColorSwatches = function () {
    var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
    var obj = cvs ? cvs.getActiveObject() : null;
    if (!obj) return;

    function syncBtn(id, color, gradientState) {
      var btn = document.getElementById(id);
      if (!btn) return;
      if (gradientState) {
        btn.style.background = CP.buildSwatchPreviewBackground(gradientState);
        btn.dataset.gradient = JSON.stringify(CP.cloneGradientState(gradientState));
        btn.dataset.color = color || '#ffffff';
      } else if (color) {
        btn.style.background = color;
        btn.dataset.color = color;
        btn.dataset.gradient = '';
      }
    }

    var isText = obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox';
    var isPath = obj.type === 'path';
    var isGroup = obj.type === 'group';
    var isShape = obj.type === 'rect' || obj.type === 'circle' || obj.type === 'ellipse' || obj.type === 'triangle' || obj.type === 'polygon' || isPath || isGroup;
    var isImage = obj.type === 'image';

    if (isText) {
      var textGrad = CP.parseGradientStateFromObject(obj);
      var textColor = typeof obj.fill === 'string' ? CP.normalizeHexColor(obj.fill) : '#ffffff';
      syncBtn('cp-swatch-p-color', textColor, textGrad);
    }

    if (isShape) {
      var fillTarget = isGroup && obj._objects && obj._objects.length > 0 ? obj._objects[0] : obj;
      var fillGrad = CP.parseGradientStateFromObject(fillTarget);
      var fillVal = typeof fillTarget.fill === 'string' ? CP.normalizeHexColor(fillTarget.fill) : '#000000';
      syncBtn('cp-swatch-p-fill', fillVal, fillGrad);
      var strokeVal = typeof fillTarget.stroke === 'string' ? CP.normalizeHexColor(fillTarget.stroke) : '#000000';
      syncBtn('cp-swatch-p-stroke', strokeVal, null);
    }

    if (isImage) {
      var imgStroke = typeof obj.stroke === 'string' ? CP.normalizeHexColor(obj.stroke) : '#000000';
      syncBtn('cp-swatch-p-img-stroke', imgStroke, null);
    }

    if (obj.isQR) {
      var qrI = document.getElementById('p-qr-color');
      var qrB = document.getElementById('p-qr-bg');
      if (qrI) syncBtn('cp-swatch-p-qr-color', qrI.value, null);
      if (qrB) syncBtn('cp-swatch-p-qr-bg', qrB.value, null);
    }

    if (obj._isBoard || obj._isStickyNote || obj._isBoardLine) {
      var wbTarget = isGroup && obj._objects && obj._objects.length > 0 ? obj._objects[0] : obj;
      var wbGrad = CP.parseGradientStateFromObject(wbTarget);
      var wbFill = typeof wbTarget.fill === 'string' ? CP.normalizeHexColor(wbTarget.fill) : '#000000';
      syncBtn('cp-swatch-p-wb-fill', wbFill, wbGrad);
      var wbStroke = typeof wbTarget.stroke === 'string' ? CP.normalizeHexColor(wbTarget.stroke) : '#000000';
      syncBtn('cp-swatch-p-wb-stroke', wbStroke, null);
    }

    var teS = document.getElementById('te-stroke-color');
    var teSh = document.getElementById('te-shadow-color');
    if (teS) syncBtn('cp-swatch-te-stroke-color', teS.value, null);
    if (teSh) syncBtn('cp-swatch-te-shadow-color', teSh.value, null);
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'panel', parent: 'shared.color-picker', title: 'Color Picker: panel', mount: function () {}, unmount: function () {} });
  }
})();
