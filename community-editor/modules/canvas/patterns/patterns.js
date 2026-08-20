/* ============================================================
   dika studio — Patterns Module
   12 decorative SVG patterns users can overlay on their card.
   Supports color and opacity customisation.
   ============================================================ */

var PATTERNS = [
  { id: 'diagonal',    name: 'Diagonal Lines' },
  { id: 'grid',        name: 'Grid' },
  { id: 'dots',        name: 'Dots' },
  { id: 'diamonds',    name: 'Diamonds' },
  { id: 'waves',       name: 'Waves' },
  { id: 'stars',       name: 'Stars' },
  { id: 'crosshatch',  name: 'Crosshatch' },
  { id: 'checkers',    name: 'Checkerboard' },
  { id: 'triangles',   name: 'Triangles' },
  { id: 'hexagons',    name: 'Hexagons' },
  { id: 'circles',     name: 'Circles' },
  { id: 'halffade',    name: 'Half Fade' }
];

function patternSVG(id, color, scale) {
  var c = color || '#ffffff';
  var sc = scale || 1;
  var enc = encodeURIComponent;
  /* Scale works by multiplying the SVG viewBox dimensions */
  var s = function(base) { return Math.round(base * sc); };
  var svgMap = {
    diagonal: '<svg xmlns="http://www.w3.org/2000/svg" width="' + s(20) + '" height="' + s(20) + '"><line x1="0" y1="' + s(20) + '" x2="' + s(20) + '" y2="0" stroke="' + c + '" stroke-width="1.5"/></svg>',
    grid: '<svg xmlns="http://www.w3.org/2000/svg" width="' + s(24) + '" height="' + s(24) + '"><path d="M' + s(24) + ' 0H0v' + s(24) + '" fill="none" stroke="' + c + '" stroke-width="1"/></svg>',
    dots: '<svg xmlns="http://www.w3.org/2000/svg" width="' + s(16) + '" height="' + s(16) + '"><circle cx="' + s(8) + '" cy="' + s(8) + '" r="2" fill="' + c + '"/></svg>',
    diamonds: '<svg xmlns="http://www.w3.org/2000/svg" width="' + s(24) + '" height="' + s(24) + '"><path d="M' + s(12) + ' 0L' + s(24) + ' ' + s(12) + 'L' + s(12) + ' ' + s(24) + 'L0 ' + s(12) + 'Z" fill="none" stroke="' + c + '" stroke-width="1"/></svg>',
    waves: '<svg xmlns="http://www.w3.org/2000/svg" width="' + s(40) + '" height="' + s(12) + '"><path d="M0 ' + s(6) + 'C' + s(5) + ' 0 ' + s(10) + ' 0 ' + s(20) + ' ' + s(6) + 'S' + s(35) + ' ' + s(12) + ' ' + s(40) + ' ' + s(6) + '" fill="none" stroke="' + c + '" stroke-width="1.5"/></svg>',
    stars: '<svg xmlns="http://www.w3.org/2000/svg" width="' + s(28) + '" height="' + s(28) + '"><path d="M' + s(14) + ' 2l2.5 5.5L' + s(22) + ' 8.5l-4 4 1 5.5-5-3-5 3 1-5.5-4-4 5.5-1z" fill="' + c + '" opacity="0.7"/></svg>',
    crosshatch: '<svg xmlns="http://www.w3.org/2000/svg" width="' + s(20) + '" height="' + s(20) + '"><line x1="0" y1="' + s(20) + '" x2="' + s(20) + '" y2="0" stroke="' + c + '" stroke-width="1"/><line x1="0" y1="0" x2="' + s(20) + '" y2="' + s(20) + '" stroke="' + c + '" stroke-width="1"/></svg>',
    checkers: '<svg xmlns="http://www.w3.org/2000/svg" width="' + s(20) + '" height="' + s(20) + '"><rect width="' + s(10) + '" height="' + s(10) + '" fill="' + c + '"/><rect x="' + s(10) + '" y="' + s(10) + '" width="' + s(10) + '" height="' + s(10) + '" fill="' + c + '"/></svg>',
    triangles: '<svg xmlns="http://www.w3.org/2000/svg" width="' + s(24) + '" height="' + s(20) + '"><path d="M' + s(12) + ' 0L' + s(24) + ' ' + s(20) + 'H0Z" fill="none" stroke="' + c + '" stroke-width="1"/></svg>',
    hexagons: '<svg xmlns="http://www.w3.org/2000/svg" width="' + s(28) + '" height="' + s(24) + '"><path d="M' + s(14) + ' 0l' + s(12) + ' ' + s(7) + 'v' + s(10) + 'l-' + s(12) + ' ' + s(7) + 'L2 ' + s(17) + 'V' + s(7) + 'z" fill="none" stroke="' + c + '" stroke-width="1"/></svg>',
    circles: '<svg xmlns="http://www.w3.org/2000/svg" width="' + s(24) + '" height="' + s(24) + '"><circle cx="' + s(12) + '" cy="' + s(12) + '" r="8" fill="none" stroke="' + c + '" stroke-width="1"/></svg>',
    halffade: '<svg xmlns="http://www.w3.org/2000/svg" width="' + s(40) + '" height="' + s(40) + '"><defs><linearGradient id="hf" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="' + c + '" stop-opacity="0.6"/><stop offset="100%" stop-color="' + c + '" stop-opacity="0"/></linearGradient></defs><rect width="' + s(40) + '" height="' + s(40) + '" fill="url(%23hf)"/></svg>'
  };
  return svgMap[id] || svgMap.dots;
}

function patternDataURL(id, color, scale) {
  var svg = patternSVG(id, color, scale);
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

/* Create a Fabric.js pattern fill image for thumbnails */
function drawPatternThumb(canvasEl, id, color) {
  var ctx = canvasEl.getContext('2d');
  var w = canvasEl.width, h = canvasEl.height;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = '#f4f4f8';
  ctx.fillRect(0, 0, w, h);

  var img = new Image();
  img.onload = function () {
    var pat = ctx.createPattern(img, 'repeat');
    if (pat) {
      ctx.fillStyle = pat;
      ctx.globalAlpha = 0.45;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  };
  img.src = patternDataURL(id, color || '#8888cc');
}

/* Build the flyout grid */
function initPatternGrid() {
  var grid = document.getElementById('pattern-grid');
  if (!grid) return;
  grid.innerHTML = '';

  PATTERNS.forEach(function (p) {
    var card = document.createElement('div');
    card.className = 'pattern-card';
    card.title = p.name;
    card.dataset.patternId = p.id;

    var thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 140;
    thumbCanvas.height = 100;
    thumbCanvas.className = 'pattern-thumb';
    card.appendChild(thumbCanvas);

    var label = document.createElement('span');
    label.className = 'pattern-label';
    label.textContent = p.name;
    card.appendChild(label);

    card.addEventListener('click', function () {
      applyPatternToCanvas(p.id);
    });

    grid.appendChild(card);
    drawPatternThumb(thumbCanvas, p.id);
  });

  var opSlider = document.getElementById('pattern-opacity');
  var opVal = document.getElementById('pattern-opacity-val');
  if (opSlider) {
    opSlider.addEventListener('input', function () {
      if (opVal) opVal.textContent = opSlider.value + '%';
      updateActivePatternOverlay();
    });
  }

  var colorPick = document.getElementById('pattern-color');
  if (colorPick) {
    colorPick.addEventListener('input', function () {
      refreshPatternThumbs();
      updateActivePatternOverlay();
    });
  }

  var patternBlurEl = document.getElementById('pattern-blur');
  if (patternBlurEl) {
    patternBlurEl.oninput = function () {
      var blur = parseInt(patternBlurEl.value) || 0;
      var cvs = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : canvas;
      cvs.getObjects().forEach(function (obj) {
        if (obj._isPattern) {
          obj._patternBlur = blur;
          if (blur > 0) {
            obj.set('opacity', Math.max(0.1, (parseFloat(document.getElementById('pattern-opacity').value) || 80) / 100 - blur * 0.02));
          } else {
            obj.set('opacity', (parseFloat(document.getElementById('pattern-opacity').value) || 80) / 100);
          }
          obj.dirty = true;
        }
      });
      cvs.requestRenderAll();
    };
  }

  var spacingSlider = document.getElementById('pattern-spacing');
  var spacingVal = document.getElementById('pattern-spacing-val');
  if (spacingSlider) {
    spacingSlider.oninput = function () {
      var v = parseFloat(spacingSlider.value) || 1;
      if (spacingVal) spacingVal.textContent = v + 'x';
      updateActivePatternOverlay();
    };
  }
}

function refreshPatternThumbs() {
  var color = (document.getElementById('pattern-color') || {}).value || '#ffffff';
  var cards = document.querySelectorAll('.pattern-card');
  cards.forEach(function (card) {
    var id = card.dataset.patternId;
    var tc = card.querySelector('.pattern-thumb');
    if (tc) drawPatternThumb(tc, id, color);
  });
}

var _patternLoading = false;
function applyPatternToCanvas(patId) {
  if (_patternLoading) return;
  _patternLoading = true;
  var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
  var colorEl = document.getElementById('pattern-color');
  var opEl = document.getElementById('pattern-opacity');
  var spacEl = document.getElementById('pattern-spacing');
  var color = colorEl ? colorEl.value : '#ffffff';
  var opacity = opEl ? parseInt(opEl.value) / 100 : 0.3;
  var spacing = spacEl ? parseFloat(spacEl.value) || 1 : 1;

  removePatternOverlay(cvs);
  cvs.renderAll();

  var url = patternDataURL(patId, color, spacing);
  var img = new Image();
  img.onload = function () {
    var patFill = new fabric.Pattern({
      source: img,
      repeat: 'repeat'
    });

    var overlay = new fabric.Rect({
      left: 0,
      top: 0,
      width: cvs.getWidth(),
      height: cvs.getHeight(),
      fill: patFill,
      opacity: opacity,
      selectable: false,
      evented: false,
      lockMovementX: true,
      lockMovementY: true,
      lockScalingX: true,
      lockScalingY: true,
      lockRotation: true,
      hasControls: false,
      hoverCursor: 'default',
      id: '_pattern_overlay',
      _isPattern: true,
      _patternId: patId,
      _patternColor: color,
      _patternSpacing: spacing
    });

    cvs.add(overlay);
    cvs.renderAll();
    _patternLoading = false;
    if (typeof snap === 'function') snap();
  };
  img.onerror = function () { _patternLoading = false; };
  img.src = url;
}

function removePatternOverlay(cvs) {
  var objs = cvs.getObjects();
  for (var i = objs.length - 1; i >= 0; i--) {
    if (objs[i]._isPattern) {
      cvs.remove(objs[i]);
    }
  }
}

var _patternUpdateTimer = null;
function updateActivePatternOverlay() {
  if (_patternUpdateTimer) clearTimeout(_patternUpdateTimer);
  _patternUpdateTimer = setTimeout(function () {
    _patternUpdateTimer = null;
    if (_patternLoading) return;
    var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
    var objs = cvs.getObjects();
    var overlay = null;
    for (var i = 0; i < objs.length; i++) {
      if (objs[i]._isPattern) { overlay = objs[i]; break; }
    }
    if (!overlay) return;

    var colorEl = document.getElementById('pattern-color');
    var opEl = document.getElementById('pattern-opacity');
    var spacEl = document.getElementById('pattern-spacing');
    var color = colorEl ? colorEl.value : '#ffffff';
    var opacity = opEl ? parseInt(opEl.value) / 100 : 0.3;
    var spacing = spacEl ? parseFloat(spacEl.value) || 1 : 1;

    overlay.set('opacity', opacity);

    var needsPatternRebuild = (color !== overlay._patternColor) || (spacing !== overlay._patternSpacing);
    if (needsPatternRebuild) {
      var patId = overlay._patternId;
      var url = patternDataURL(patId, color, spacing);
      var img = new Image();
      img.onload = function () {
        if (!overlay.canvas) return;
        var patFill = new fabric.Pattern({
          source: img,
          repeat: 'repeat'
        });
        overlay.set('fill', patFill);
        overlay._patternColor = color;
        overlay._patternSpacing = spacing;
        overlay.dirty = true;
        cvs.renderAll();
      };
      img.src = url;
    } else {
      cvs.renderAll();
    }
  }, 80);
}

// Faz 8: canvas module loads after DOMContentLoaded → self-init on sticky cc:canvas-ready.
if (window.cc && cc.on) cc.on('cc:canvas-ready', function () { setTimeout(function () { cc.safe('canvas.patterns', initPatternGrid); }, 300); });
else document.addEventListener('DOMContentLoaded', function () { setTimeout(initPatternGrid, 300); });

// Modular skeleton hook (Faz 8) — patterns is now a canvas subsystem loader module (modules/canvas/).
if (window.cc && cc.modules) cc.modules.register({ id: 'patterns', parent: 'canvas', title: 'Patterns', mount: function () {}, unmount: function () {} });
