/* Module: shared/color-picker/gradient — GRADIENT editor — type menu, stop track/rows, the per-stop colour picker (gp*), presets, and apply-to-object (CP._gradState/_gpHue…).
   Part of the color-picker group (decomposed from the 1698-line IIFE). All functions hang
   off the shared namespace CP (window.__ccColorPicker, created by the parent); cross-module
   references resolve through CP at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var CP = window.__ccColorPicker;
  if (!CP) return;

  CP.applyGradient = function () {
    if (!CP.canUseGradientTarget(CP._cpTarget)) return;
    var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
    var obj = cvs ? cvs.getActiveObject() : null;
    if (CP._cpTarget === 'pageBg') {                         // canvas background gradient
      // Video mode: store the gradient on the project (compositor paints it as the backdrop);
      // never touch the fabric backgroundColor, which IS the live video preview. Mirrors the
      // video branch in rpfBgApplyGradient (right-panel.js).
      var _VEg = window.__ccVideoEditor;
      if (_VEg && _VEg._veActive && _VEg._veProject) {
        var _vgs = CP.cloneGradientState(CP._gradState);
        _VEg._veProject.bgGradient = {
          type: _vgs.type, angle: _vgs.angle,
          stops: CP.normalizeStops(_vgs.stops).map(function (s) {
            return { offset: Number(s.offset) || 0, color: (CP.rgbaStringFromStop ? CP.rgbaStringFromStop(s) : s.color) };
          })
        };
        _VEg._veProject.bgImage = null;
        if (typeof _VEg._veRenderPreviewFrame === 'function') _VEg._veRenderPreviewFrame();
        CP.updateSwatchButton();
        return;
      }
      if (cvs && typeof fabric !== 'undefined') {
        var gst = CP.cloneGradientState(CP._gradState);
        var gw = cvs.getWidth(), gh = cvs.getHeight();
        var gstops = CP.normalizeStops(gst.stops).map(function (s) { return { offset: (Number(s.offset) || 0) / 100, color: (CP.rgbaStringFromStop ? CP.rgbaStringFromStop(s) : s.color) }; });
        var grad;
        if (gst.type === 'radial') {
          grad = new fabric.Gradient({ type: 'radial', gradientUnits: 'pixels', coords: { x1: gw / 2, y1: gh / 2, r1: 0, x2: gw / 2, y2: gh / 2, r2: Math.max(gw, gh) / 2 }, colorStops: gstops });
        } else {
          var grad_r = (gst.angle - 90) * Math.PI / 180, gcx = gw / 2, gcy = gh / 2, glen = Math.max(gw, gh) / 2;
          grad = new fabric.Gradient({ type: 'linear', gradientUnits: 'pixels', coords: { x1: gcx - Math.cos(grad_r) * glen, y1: gcy - Math.sin(grad_r) * glen, x2: gcx + Math.cos(grad_r) * glen, y2: gcy + Math.sin(grad_r) * glen }, colorStops: gstops });
        }
        if (cvs.backgroundImage) cvs.setBackgroundImage(null, function () {});
        cvs.setBackgroundColor(grad, cvs.renderAll.bind(cvs));
      }
      CP.updateSwatchButton();
      return;
    }
    if (!obj) return;
    // CP.fillTargets unwraps a group AND a multi-selection: a gradient picked over several objects
    // used to be written to the throwaway wrapper and lost on deselect.
    var _targets = (typeof CP.fillTargets === 'function') ? CP.fillTargets() : [obj];
    _targets.forEach(function (t) { CP.applyGradientToTarget(t, CP._gradState); t.dirty = true; });
    obj.dirty = true;
    if (cvs) cvs.renderAll();
    CP.updateSwatchButton();
  };

  CP.renderGradientTypeMenu = function () {
    var menu = document.getElementById('cp-grad-type-menu');
    if (!menu) return;
    var html = '';
    CP.GRADIENT_TYPES.forEach(function (item) {
      html += '<button type="button" class="cp-grad-type-option" data-grad-type="' + item.value + '">' +
        '<span class="cp-grad-type-check">' + (CP._gradState.type === item.value ? '&#10003;' : '') + '</span>' +
        '<span>' + item.label + '</span>' +
      '</button>';
    });
    menu.innerHTML = html;
    CP.syncGradientTypeMenu();
  };

  CP.syncGradientTypeMenu = function () {
    var label = document.getElementById('cp-grad-type-label');
    var menu = document.getElementById('cp-grad-type-menu');
    var btn = document.getElementById('cp-grad-type-btn');
    if (label) label.textContent = CP.getGradientTypeLabel(CP._gradState.type);
    if (menu) menu.classList.toggle('open', !!CP._gradTypeMenuOpen);
    if (btn) btn.classList.toggle('open', !!CP._gradTypeMenuOpen);
    if (!menu) return;
    menu.querySelectorAll('.cp-grad-type-option').forEach(function (option) {
      var active = option.dataset.gradType === CP._gradState.type;
      option.classList.toggle('active', active);
      var check = option.querySelector('.cp-grad-type-check');
      if (check) check.innerHTML = active ? '&#10003;' : '';
    });
  };

  CP.renderGradientTrackStops = function () {
    var layer = document.getElementById('cp-grad-stops-layer');
    if (!layer) return;
    var html = '';
    CP.normalizeStops(CP._gradState.stops).forEach(function (stop) {
      html += '<button type="button" class="cp-grad-stop-handle' + (stop.id === CP._gradSelectedStopId ? ' active' : '') + '" data-stop-id="' + stop.id + '" style="left:' + stop.offset + '%;">' +
        '<span class="cp-grad-stop-chip" style="background:' + CP.rgbaStringFromStop(stop) + ';"></span>' +
      '</button>';
    });
    layer.innerHTML = html;
  };

  CP.renderGradientStopRows = function () {
    var list = document.getElementById('cp-grad-stops-list');
    if (!list) return;
    var html = '';
    CP.normalizeStops(CP._gradState.stops).forEach(function (stop) {
      html += '<div class="cp-grad-stop-row' + (stop.id === CP._gradSelectedStopId ? ' active' : '') + '" data-stop-id="' + stop.id + '">' +
        '<input class="cp-grad-stop-offset" type="number" min="0" max="100" value="' + stop.offset + '">' +
        '<button type="button" class="cp-grad-stop-color" data-stop-id="' + stop.id + '">' +
          '<span class="cp-grad-stop-color-chip" style="background:' + CP.rgbaStringFromStop(stop) + ';"></span>' +
          '<span class="cp-grad-stop-color-label">' + CP.escapeHtml(stop.color.toUpperCase()) + '</span>' +
        '</button>' +
        '<input class="cp-grad-stop-opacity" type="number" min="0" max="100" value="' + stop.opacity + '">' +
        '<span class="cp-grad-stop-suffix">%</span>' +
        '<button type="button" class="cp-grad-stop-remove" data-stop-id="' + stop.id + '"' + (CP._gradState.stops.length <= 2 ? ' disabled' : '') + '>&#8722;</button>' +
      '</div>';
    });
    list.innerHTML = html;
  };

  CP.renderGradientUi = function () {
    var track = document.getElementById('cp-grad-track');
    var picker = document.getElementById('cp-grad-stop-picker');
    var style = CP.buildSwatchPreviewBackground(CP._gradState);
    if (track) track.style.background = style;
    CP.renderGradientTypeMenu();
    CP.renderGradientTrackStops();
    CP.renderGradientStopRows();
    if (CP._gradSelectedStopId && picker && picker.style.display !== 'none') {
      var stop = CP.getSelectedStop();
      CP.gpSetColorFromHex(stop.color);
    }
  };

  CP.findStopById = function (stopId) {
    var found = null;
    CP.normalizeStops(CP._gradState.stops).forEach(function (stop) {
      if (stop.id === stopId) found = stop;
    });
    return found;
  };

  CP.updateGradientStops = function (mutator) {
    var stops = CP.normalizeStops(CP._gradState.stops);
    mutator(stops);
    CP._gradState.stops = CP.normalizeStops(stops);
    CP.renderGradientUi();
    CP.applyGradient();
  };

  CP.setGradientStopOffset = function (stopId, offset) {
    CP.updateGradientStops(function (stops) {
      stops.forEach(function (stop) {
        if (stop.id === stopId) stop.offset = CP.clamp(offset, 0, 100);
      });
      CP._gradSelectedStopId = stopId;
    });
  };

  CP.setGradientStopColor = function (stopId, color) {
    CP.updateGradientStops(function (stops) {
      stops.forEach(function (stop) {
        if (stop.id === stopId) stop.color = CP.normalizeHexColor(color);
      });
      CP._gradSelectedStopId = stopId;
    });
  };

  CP.setGradientStopOpacity = function (stopId, opacity) {
    CP.updateGradientStops(function (stops) {
      stops.forEach(function (stop) {
        if (stop.id === stopId) stop.opacity = CP.clamp(opacity, 0, 100);
      });
      CP._gradSelectedStopId = stopId;
    });
  };

  CP.interpolateNewStop = function (offset) {
    var rgba = CP.colorPointAt(CP._gradState, CP.clamp(offset, 0, 100) / 100);
    return {
      id: CP._gradStopSeq++,
      offset: CP.clamp(Math.round(offset), 0, 100),
      color: CP.rgbToHex(rgba.r, rgba.g, rgba.b),
      opacity: CP.clamp(Math.round(rgba.a * 100), 0, 100)
    };
  };

  CP.addGradientStop = function (offset) {
    var stop = CP.interpolateNewStop(typeof offset === 'number' ? offset : 50);
    CP._gradSelectedStopId = stop.id;
    CP.updateGradientStops(function (stops) {
      stops.push(stop);
    });
    CP.openGradStopPicker(stop.id, true);
    return stop;
  };

  CP.removeGradientStop = function (stopId) {
    if (CP._gradState.stops.length <= 2) return;
    CP.updateGradientStops(function (stops) {
      var next = [];
      stops.forEach(function (stop) {
        if (stop.id !== stopId) next.push(stop);
      });
      stops.length = 0;
      next.forEach(function (stop) { stops.push(stop); });
    });
    if (!CP.findStopById(CP._gradSelectedStopId) && CP._gradState.stops.length) CP._gradSelectedStopId = CP._gradState.stops[0].id;
    CP.openGradStopPicker(CP._gradSelectedStopId, true);
  };

  CP.openGradStopPicker = function (stopId, forceOpen) {
    var picker = document.getElementById('cp-grad-stop-picker');
    if (!picker || !stopId) return;
    if (!forceOpen && CP._gradSelectedStopId === stopId && picker.style.display !== 'none') {
      picker.style.display = 'none';
      return;
    }
    CP._gradSelectedStopId = stopId;
    var stop = CP.getSelectedStop();
    CP.gpSetColorFromHex(stop.color);
    picker.style.display = '';
    CP.renderGradientUi();
  };

  CP.wireGradientPanel = function () {
    var typeBtn = document.getElementById('cp-grad-type-btn');
    if (typeBtn) {
      typeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        CP._gradTypeMenuOpen = !CP._gradTypeMenuOpen;
        CP.syncGradientTypeMenu();
      });
    }

    var typeMenu = document.getElementById('cp-grad-type-menu');
    if (typeMenu) {
      typeMenu.addEventListener('click', function (e) {
        var btn = e.target.closest('.cp-grad-type-option');
        if (!btn) return;
        CP._gradState.type = btn.dataset.gradType || 'linear';
        CP._gradTypeMenuOpen = false;
        CP.syncGradientTypeMenu();
        CP.renderGradientUi();
        CP.applyGradient();
      });
    }

    var flipBtn = document.getElementById('cp-grad-flip-btn');
    if (flipBtn) flipBtn.addEventListener('click', function () {
      CP._gradState.stops = CP.normalizeStops(CP._gradState.stops.map(function (stop) {
        return { id: stop.id, offset: 100 - stop.offset, color: stop.color, opacity: stop.opacity };
      }));
      CP.renderGradientUi();
      CP.applyGradient();
    });

    var rotateBtn = document.getElementById('cp-grad-rotate-btn');
    if (rotateBtn) rotateBtn.addEventListener('click', function () {
      CP._gradState.angle = ((CP._gradState.angle || 0) + 90) % 360;
      CP.renderGradientUi();
      CP.applyGradient();
    });

    var trackShell = document.getElementById('cp-grad-track-shell');
    if (trackShell) {
      trackShell.addEventListener('mousedown', function (e) {
        var handle = e.target.closest('.cp-grad-stop-handle');
        if (handle) {
          e.preventDefault();
          e.stopPropagation();
          CP._gradDraggingStopId = Number(handle.dataset.stopId) || 0;
          CP._gradSelectedStopId = CP._gradDraggingStopId;
          CP.openGradStopPicker(CP._gradSelectedStopId, true);
          CP.renderGradientUi();
          return;
        }
        var track = document.getElementById('cp-grad-track');
        if (!track) return;
        var rect = track.getBoundingClientRect();
        var stop = CP.addGradientStop(CP.clamp(Math.round(((e.clientX - rect.left) / Math.max(1, rect.width)) * 100), 0, 100));
        CP._gradDraggingStopId = stop && stop.id ? stop.id : 0;
      });
      document.addEventListener('mousemove', function (e) {
        if (!CP._gradDraggingStopId) return;
        var track = document.getElementById('cp-grad-track');
        if (!track) return;
        var rect = track.getBoundingClientRect();
        CP.setGradientStopOffset(CP._gradDraggingStopId, CP.clamp(Math.round(((e.clientX - rect.left) / Math.max(1, rect.width)) * 100), 0, 100));
      });
      document.addEventListener('mouseup', function () {
        CP._gradDraggingStopId = 0;
      });
    }

    var stopList = document.getElementById('cp-grad-stops-list');
    if (stopList) {
      stopList.addEventListener('click', function (e) {
        // Clicks on the offset/opacity NUMBER INPUTS must NOT trigger a re-render:
        // renderGradientUi() replaces list.innerHTML, which destroys the very input the
        // user is trying to edit → focus jumps to the first "0" stop and typing fails
        // (owner bug). Let those inputs focus + be edited; the 'change' handler commits them.
        if (e.target.closest('input')) return;
        // Handle the action buttons BEFORE any row-select re-render, so their target
        // node isn't detached by an intervening innerHTML swap.
        var colorBtn = e.target.closest('.cp-grad-stop-color');
        if (colorBtn) {
          CP.openGradStopPicker(Number(colorBtn.dataset.stopId) || CP._gradSelectedStopId, true);
          return;
        }
        var removeBtn = e.target.closest('.cp-grad-stop-remove');
        if (removeBtn) { CP.removeGradientStop(Number(removeBtn.dataset.stopId) || 0); return; }
        var row = e.target.closest('.cp-grad-stop-row');
        if (row) {
          CP._gradSelectedStopId = Number(row.dataset.stopId) || CP._gradSelectedStopId;
          CP.renderGradientUi();
        }
      });
      stopList.addEventListener('change', function (e) {
        var input = e.target;
        var row = input.closest('.cp-grad-stop-row');
        if (!row) return;
        var stopId = Number(row.dataset.stopId) || 0;
        if (!stopId) return;
        if (input.classList.contains('cp-grad-stop-offset')) CP.setGradientStopOffset(stopId, CP.clamp(parseInt(input.value, 10) || 0, 0, 100));
        else if (input.classList.contains('cp-grad-stop-opacity')) CP.setGradientStopOpacity(stopId, CP.clamp(parseInt(input.value, 10) || 0, 0, 100));
        else if (input.classList.contains('cp-grad-stop-hex')) CP.setGradientStopColor(stopId, CP.normalizeHexColor(input.value));
      });
    }

    CP.wireGradientStopPicker();

    document.addEventListener('click', function (e) {
      if (!CP._gradTypeMenuOpen) return;
      var typeWrap = document.querySelector('.cp-grad-type-wrap');
      if (typeWrap && !typeWrap.contains(e.target)) {
        CP._gradTypeMenuOpen = false;
        CP.syncGradientTypeMenu();
      }
    });
  };

  CP.wireGradientStopPicker = function () {
    var gpSpec = document.getElementById('gp-spectrum');
    if (gpSpec) {
      gpSpec.addEventListener('mousedown', function (e) {
        CP._gpDraggingSV = true;
        CP.gpPickSV(e);
      });
      document.addEventListener('mousemove', function (e) {
        if (CP._gpDraggingSV) CP.gpPickSV(e);
      });
      document.addEventListener('mouseup', function () {
        CP._gpDraggingSV = false;
      });
    }

    var gpHueBar = document.getElementById('gp-hue-bar');
    if (gpHueBar) {
      gpHueBar.addEventListener('mousedown', function (e) {
        CP._gpDraggingHue = true;
        CP.gpPickHue(e);
      });
      document.addEventListener('mousemove', function (e) {
        if (CP._gpDraggingHue) CP.gpPickHue(e);
      });
      document.addEventListener('mouseup', function () {
        CP._gpDraggingHue = false;
      });
    }

    var gpHexInput = document.getElementById('gp-hex-input');
    if (gpHexInput) {
      gpHexInput.addEventListener('change', function () {
        CP.gpSetColorFromHex(CP.normalizeHexColor(gpHexInput.value));
        CP.gpApplyColor();
      });
    }

    var gpEyeBtn = document.getElementById('gp-eyedropper-btn');
    if (gpEyeBtn) {
      gpEyeBtn.addEventListener('click', function () {
        if (!window.EyeDropper) {
          if (typeof showToast === 'function') showToast('Eyedropper not supported in this browser');
          return;
        }
        var ed = new window.EyeDropper();
        ed.open().then(function (res) {
          CP.gpSetColorFromHex(res.sRGBHex);
          CP.gpApplyColor();
        }).catch(function () {});
      });
    }
  };

  CP.gpDrawSpectrum = function () {
    var c = document.getElementById('gp-spectrum');
    if (!c) return;
    var ctx = c.getContext('2d');
    var w = c.width;
    var h = c.height;
    var hueRgb = CP.hsvToRgb(CP._gpHue, 1, 1);
    var hueColor = 'rgb(' + hueRgb[0] + ',' + hueRgb[1] + ',' + hueRgb[2] + ')';
    var gradH = ctx.createLinearGradient(0, 0, w, 0);
    gradH.addColorStop(0, '#ffffff');
    gradH.addColorStop(1, hueColor);
    ctx.fillStyle = gradH;
    ctx.fillRect(0, 0, w, h);
    var gradV = ctx.createLinearGradient(0, 0, 0, h);
    gradV.addColorStop(0, 'rgba(0,0,0,0)');
    gradV.addColorStop(1, '#000000');
    ctx.fillStyle = gradV;
    ctx.fillRect(0, 0, w, h);
    CP.gpUpdateSpectrumCursor();
  };

  CP.gpUpdateSpectrumCursor = function () {
    var cursor = document.getElementById('gp-spectrum-cursor');
    var c = document.getElementById('gp-spectrum');
    if (!cursor || !c) return;
    var rect = c.getBoundingClientRect();
    cursor.style.left = CP.cursorOffset(CP._gpSat, rect.width, cursor.offsetWidth) + 'px';
    cursor.style.top = CP.cursorOffset(1 - CP._gpVal, rect.height, cursor.offsetHeight) + 'px';
    cursor.style.background = CP.hsvToHex(CP._gpHue, CP._gpSat, CP._gpVal);
  };

  CP.gpDrawHueBar = function () {
    var c = document.getElementById('gp-hue-bar');
    if (!c) return;
    var ctx = c.getContext('2d');
    var w = c.width;
    var grad = ctx.createLinearGradient(0, 0, w, 0);
    for (var i = 0; i <= 6; i++) {
      var rgb = CP.hsvToRgb(i / 6, 1, 1);
      grad.addColorStop(i / 6, 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, c.height);
    CP.gpUpdateHueCursor();
  };

  CP.gpUpdateHueCursor = function () {
    var cursor = document.getElementById('gp-hue-cursor');
    var bar = document.getElementById('gp-hue-bar');
    if (!cursor || !bar) return;
    var rect = bar.getBoundingClientRect();
    cursor.style.left = CP.cursorOffset(CP._gpHue, rect.width, cursor.offsetWidth) + 'px';
    var rgb = CP.hsvToRgb(CP._gpHue, 1, 1);
    cursor.style.background = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
  };

  CP.gpPickSV = function (e) {
    var c = document.getElementById('gp-spectrum');
    if (!c) return;
    var rect = c.getBoundingClientRect();
    CP._gpSat = CP.clamp(e.clientX - rect.left, 0, rect.width) / rect.width;
    CP._gpVal = 1 - CP.clamp(e.clientY - rect.top, 0, rect.height) / rect.height;
    CP.gpUpdateSpectrumCursor();
    CP.gpUpdateHexInput();
    CP.gpApplyColor();
  };

  CP.gpPickHue = function (e) {
    var c = document.getElementById('gp-hue-bar');
    if (!c) return;
    var rect = c.getBoundingClientRect();
    CP._gpHue = CP.clamp(e.clientX - rect.left, 0, rect.width) / rect.width;
    CP.gpDrawSpectrum();
    CP.gpUpdateHueCursor();
    CP.gpUpdateHexInput();
    CP.gpApplyColor();
  };

  CP.gpSetColorFromHex = function (hex) {
    var rgb = CP.hexToRgb(CP.normalizeHexColor(hex));
    var hsv = CP.rgbToHsv(rgb[0], rgb[1], rgb[2]);
    CP._gpHue = hsv[0];
    CP._gpSat = hsv[1];
    CP._gpVal = hsv[2];
    CP.gpDrawSpectrum();
    CP.gpDrawHueBar();
    CP.gpUpdateHexInput();
  };

  CP.gpUpdateHexInput = function () {
    var hex = CP.hsvToHex(CP._gpHue, CP._gpSat, CP._gpVal);
    var inp = document.getElementById('gp-hex-input');
    if (inp) inp.value = hex;
    var preview = document.getElementById('gp-hex-preview');
    if (preview) preview.style.background = hex;
  };

  CP.gpApplyColor = function () {
    var stop = CP.getSelectedStop();
    if (!stop) return;
    CP.setGradientStopColor(stop.id, CP.hsvToHex(CP._gpHue, CP._gpSat, CP._gpVal));
  };

  CP.renderGradientPresets = function () {
    var wrap = document.getElementById('cp-grad-presets');
    if (!wrap) return;
    wrap.innerHTML = '';
    CP.GRADIENT_PRESETS.forEach(function (preset) {
      var s = document.createElement('button');
      s.type = 'button';
      s.className = 'cp-grad-swatch';
      s.style.background = CP.buildSwatchPreviewBackground(preset);
      s.addEventListener('click', function () {
        CP._gradState = CP.cloneGradientState(preset);
        CP._gradSelectedStopId = CP._gradState.stops[0].id;
        CP.renderGradientUi();
        CP.openGradStopPicker(CP._gradSelectedStopId, true);
        CP.applyGradient();
      });
      wrap.appendChild(s);
    });
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'gradient', parent: 'shared.color-picker', title: 'Color Picker: gradient', mount: function () {}, unmount: function () {} });
  }
})();
