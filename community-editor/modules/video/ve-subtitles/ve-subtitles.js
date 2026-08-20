// ╔═══════════════════════════════════════════════════════════════╗
// ║  VE-SUBTITLES — WebVTT Subtitle/Caption System              ║
// ║  Phase 6: Parse, render, export subtitle cues                ║
// ╚═══════════════════════════════════════════════════════════════╝
(function() {
  'use strict';

  // ── WebVTT Parser ──
  function parseVTT(text) {
    var cues = [];
    var lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    var i = 0;
    // Skip WEBVTT header
    while (i < lines.length && lines[i].indexOf('WEBVTT') === -1) i++;
    i++; // skip WEBVTT line

    while (i < lines.length) {
      // Skip blank lines
      while (i < lines.length && lines[i].trim() === '') i++;
      if (i >= lines.length) break;

      var cueId = '';
      // Check if this line is a cue ID (doesn't contain -->)
      if (lines[i].indexOf('-->') === -1) {
        cueId = lines[i].trim();
        i++;
      }

      // Parse timestamp line
      if (i >= lines.length || lines[i].indexOf('-->') === -1) { i++; continue; }
      var timeParts = lines[i].split('-->');
      var startTime = _parseTimestamp(timeParts[0].trim());
      var endTime = _parseTimestamp(timeParts[1].trim().split(' ')[0]);
      i++;

      // Collect cue text
      var textLines = [];
      while (i < lines.length && lines[i].trim() !== '') {
        textLines.push(lines[i]);
        i++;
      }

      cues.push({
        id: cueId || ('cue-' + cues.length),
        startTime: startTime,
        endTime: endTime,
        text: textLines.join('\n'),
        style: {}
      });
    }
    return cues;
  }

  function _parseTimestamp(ts) {
    // HH:MM:SS.mmm or MM:SS.mmm
    var parts = ts.split(':');
    var seconds = 0;
    if (parts.length === 3) {
      seconds = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2]);
    } else if (parts.length === 2) {
      seconds = parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
    }
    return seconds;
  }

  // ── Get active cues at a given time ──
  function getActiveCues(cues, time) {
    var active = [];
    for (var i = 0; i < cues.length; i++) {
      if (time >= cues[i].startTime && time < cues[i].endTime) {
        active.push(cues[i]);
      }
    }
    return active;
  }

  // ── Render cues on canvas ──
  var _defaultStyle = {
    fontFamily: 'Arial, sans-serif',
    fontSize: 24,
    color: '#ffffff',
    bgColor: 'rgba(0,0,0,0.7)',
    padding: 6,
    position: 'bottom', // bottom, top, center
    maxWidth: 0.8       // fraction of canvas width
  };

  function renderCues(ctx, cues, time, w, h, styleOverride) {
    var active = getActiveCues(cues, time);
    if (!active.length) return;

    var style = {};
    for (var k in _defaultStyle) style[k] = _defaultStyle[k];
    if (styleOverride) {
      for (var k2 in styleOverride) style[k2] = styleOverride[k2];
    }

    ctx.save();
    ctx.font = style.fontSize + 'px ' + style.fontFamily;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    var maxW = w * style.maxWidth;
    var y;
    if (style.position === 'top') {
      y = style.padding * 2;
    } else if (style.position === 'center') {
      y = h / 2 - (active.length * (style.fontSize + style.padding)) / 2;
    } else {
      y = h - style.padding * 2 - active.length * (style.fontSize + style.padding * 2);
    }

    active.forEach(function(cue) {
      var lines = cue.text.split('\n');
      lines.forEach(function(line) {
        var textW = Math.min(ctx.measureText(line).width + style.padding * 2, maxW);
        var x = w / 2;

        // Background
        ctx.fillStyle = style.bgColor;
        var rx = x - textW / 2;
        ctx.fillRect(rx, y, textW, style.fontSize + style.padding * 2);

        // Text
        ctx.fillStyle = style.color;
        ctx.fillText(line, x, y + style.padding, maxW);

        y += style.fontSize + style.padding * 2 + 2;
      });
    });
    ctx.restore();
  }

  // ── Import VTT file ──
  function importVTT(callback) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.vtt,.srt';
    input.addEventListener('change', function() {
      if (!input.files || !input.files[0]) return;
      var reader = new FileReader();
      reader.onload = function() {
        var text = reader.result;
        // Basic SRT → VTT conversion
        if (input.files[0].name.toLowerCase().indexOf('.srt') !== -1) {
          text = 'WEBVTT\n\n' + text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
        }
        var cues = parseVTT(text);
        if (callback) callback(cues);
      };
      reader.readAsText(input.files[0]);
    });
    input.click();
  }

  // Public API
  window.VESubtitles = {
    parseVTT: parseVTT,
    getActiveCues: getActiveCues,
    renderCues: renderCues,
    importVTT: importVTT,
    defaultStyle: _defaultStyle
  };
})();

// Modular skeleton hook (Faz 8) — ve-subtitles is now a video loader module (modules/video/). Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-subtitles', parent: 'video', title: 've-subtitles', mount: function () {}, unmount: function () {} });
