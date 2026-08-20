/* Module: shared/color-picker/solid — SOLID picker — the saturation/value spectrum + hue bar canvases and their drag/hex sync (CP._hue/_sat/_val/_cpColor).
   Part of the color-picker group (decomposed from the 1698-line IIFE). All functions hang
   off the shared namespace CP (window.__ccColorPicker, created by the parent); cross-module
   references resolve through CP at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var CP = window.__ccColorPicker;
  if (!CP) return;

  CP.drawSpectrum = function () {
    var c = document.getElementById('cp-spectrum');
    if (!c) return;
    var ctx = c.getContext('2d');
    var w = c.width;
    var h = c.height;
    var hueRgb = CP.hsvToRgb(CP._hue, 1, 1);
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
    CP.updateSpectrumCursor();
  };

  CP.updateSpectrumCursor = function () {
    var cursor = document.getElementById('cp-spectrum-cursor');
    var c = document.getElementById('cp-spectrum');
    if (!cursor || !c) return;
    var rect = c.getBoundingClientRect();
    cursor.style.left = CP.cursorOffset(CP._sat, rect.width, cursor.offsetWidth) + 'px';
    cursor.style.top = CP.cursorOffset(1 - CP._val, rect.height, cursor.offsetHeight) + 'px';
    cursor.style.background = CP._cpColor;
  };

  CP.drawHueBar = function () {
    var c = document.getElementById('cp-hue-bar');
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
    CP.updateHueCursor();
  };

  CP.updateHueCursor = function () {
    var cursor = document.getElementById('cp-hue-cursor');
    var bar = document.getElementById('cp-hue-bar');
    if (!cursor || !bar) return;
    var rect = bar.getBoundingClientRect();
    cursor.style.left = CP.cursorOffset(CP._hue, rect.width, cursor.offsetWidth) + 'px';
    var rgb = CP.hsvToRgb(CP._hue, 1, 1);
    cursor.style.background = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
  };

  CP.pickSV = function (e) {
    var c = document.getElementById('cp-spectrum');
    if (!c) return;
    var rect = c.getBoundingClientRect();
    CP._sat = CP.clamp(e.clientX - rect.left, 0, rect.width) / rect.width;
    CP._val = 1 - CP.clamp(e.clientY - rect.top, 0, rect.height) / rect.height;
    CP._cpColor = CP.hsvToHex(CP._hue, CP._sat, CP._val);
    CP.updateSpectrumCursor();
    CP.updateHexInput();
    CP.applyCurrentColor();
  };

  CP.pickHue = function (e) {
    var c = document.getElementById('cp-hue-bar');
    if (!c) return;
    var rect = c.getBoundingClientRect();
    CP._hue = CP.clamp(e.clientX - rect.left, 0, rect.width) / rect.width;
    CP._cpColor = CP.hsvToHex(CP._hue, CP._sat, CP._val);
    CP.drawSpectrum();
    CP.updateHueCursor();
    CP.updateHexInput();
    CP.applyCurrentColor();
  };

  CP.setColorFromHex = function (hex) {
    CP._cpColor = CP.normalizeHexColor(hex);
    var rgb = CP.hexToRgb(CP._cpColor);
    var hsv = CP.rgbToHsv(rgb[0], rgb[1], rgb[2]);
    CP._hue = hsv[0];
    CP._sat = hsv[1];
    CP._val = hsv[2];
    CP.drawSpectrum();
    CP.updateHueCursor();
    CP.updateHexInput();
  };

  CP.updateHexInput = function () {
    var input = document.getElementById('cp-hex-input');
    if (input) input.value = CP._cpColor;
    var preview = document.getElementById('cp-hex-preview');
    if (preview) preview.style.background = CP._cpColor;
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'solid', parent: 'shared.color-picker', title: 'Color Picker: solid', mount: function () {}, unmount: function () {} });
  }
})();
