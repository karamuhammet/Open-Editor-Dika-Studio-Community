/* ═══════════════════════════════════════════════════════════
   Module: charts — Chart.js panel + editable canvas charts.
   Faz 1 PILOT — migrated from js/charts.js. Depends on cc.* for app
   services (canvas, snap, addToCenter, toast) and on the vendor globals
   Chart (Chart.js) + fabric. Owns its flyout HTML (injected below), its
   CSS (charts.css), and all chart logic. Re-exposes the same window.*
   entry points the rest of the app already calls (renderChartCategoryCards,
   addChartToCanvas, syncChartPanel, _restoreChartsAfterLoad), so nothing
   else had to change. Right-panel #p-chart-* inputs stay in index.html.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── cc-aware helpers (modules depend on cc.*, with a safe fallback) ──
  function _cvs() {
    if (window.cc && cc.canvas) return cc.canvas();
    return (typeof getActiveCanvas === 'function') ? getActiveCanvas() : (typeof canvas !== 'undefined' ? canvas : null);
  }
  function _toast(m) { if (window.cc && cc.toast) return cc.toast(m); if (typeof showToast === 'function') showToast(m); }
  function _snap() { if (window.cc && cc.snap) return cc.snap(); if (typeof snap === 'function') snap(); }
  function _add(o) {
    if (window.cc && cc.addToCenter) return cc.addToCenter(o);
    if (typeof addToCenter === 'function') return addToCenter(o);
    var c = _cvs(); if (c) { c.add(o); c.setActiveObject(o); c.renderAll(); _snap(); }
  }

  // ── Default Data Templates ──────────────────────────────────
  var CHART_DEFAULTS = {
    pie: {
      labels: ['Red', 'Blue', 'Yellow', 'Green'],
      data:   [30, 25, 25, 20],
      colors: ['#f5c2e7', '#89b4fa', '#f9e2af', '#94e2d5']
    },
    doughnut: {
      labels: ['Desktop', 'Mobile', 'Tablet'],
      data:   [55, 35, 10],
      colors: ['#cba6f7', '#fab387', '#94e2d5']
    },
    bar: {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
      data:   [40, 55, 30, 70, 45],
      colors: ['#f5c2e7', '#89b4fa', '#f9e2af', '#94e2d5', '#cba6f7']
    },
    horizontalBar: {
      labels: ['Sales', 'Marketing', 'Dev', 'Design'],
      data:   [65, 45, 80, 50],
      colors: ['#fab387', '#f5c2e7', '#89b4fa', '#94e2d5']
    },
    line: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      data:   [10, 25, 15, 35, 20],
      colors: ['#89b4fa']
    },
    radar: {
      labels: ['Speed', 'Power', 'Range', 'Armor', 'Magic'],
      data:   [80, 60, 70, 50, 90],
      colors: ['rgba(137,180,250,0.4)']
    },
    polarArea: {
      labels: ['A', 'B', 'C', 'D', 'E'],
      data:   [30, 40, 20, 50, 35],
      colors: ['#f5c2e7', '#89b4fa', '#f9e2af', '#94e2d5', '#cba6f7']
    }
  };

  // SVG preview thumbnails for each chart type (monochrome gold theme)
  var CHART_THUMBS = {
    pie:           '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="18" stroke="var(--border2)" stroke-width="1"/><path d="M24 6A18 18 0 0 1 42 24L24 24Z" fill="var(--gold)" opacity="0.85"/><path d="M42 24A18 18 0 0 1 14.4 39.6L24 24Z" fill="var(--gold)" opacity="0.55"/><path d="M14.4 39.6A18 18 0 0 1 6 24L24 24Z" fill="var(--gold)" opacity="0.35"/><path d="M6 24A18 18 0 0 1 24 6L24 24Z" fill="var(--gold)" opacity="0.2"/></svg>',
    doughnut:      '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="18" stroke="var(--border2)" stroke-width="1"/><path d="M24 6A18 18 0 0 1 42 24L24 24Z" fill="var(--gold)" opacity="0.85"/><path d="M42 24A18 18 0 0 1 10 38L24 24Z" fill="var(--gold)" opacity="0.5"/><path d="M10 38A18 18 0 0 1 24 6L24 24Z" fill="var(--gold)" opacity="0.25"/><circle cx="24" cy="24" r="9" fill="var(--surface2)"/></svg>',
    bar:           '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="28" width="7" height="14" rx="1.5" fill="var(--gold)" opacity="0.35"/><rect x="14" y="18" width="7" height="24" rx="1.5" fill="var(--gold)" opacity="0.55"/><rect x="23" y="24" width="7" height="18" rx="1.5" fill="var(--gold)" opacity="0.7"/><rect x="32" y="10" width="7" height="32" rx="1.5" fill="var(--gold)" opacity="0.9"/></svg>',
    horizontalBar: '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="5" width="30" height="7" rx="1.5" fill="var(--gold)" opacity="0.7"/><rect x="6" y="14" width="22" height="7" rx="1.5" fill="var(--gold)" opacity="0.45"/><rect x="6" y="23" width="36" height="7" rx="1.5" fill="var(--gold)" opacity="0.9"/><rect x="6" y="32" width="26" height="7" rx="1.5" fill="var(--gold)" opacity="0.55"/></svg>',
    line:          '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><polyline points="6,36 14,22 22,30 30,14 42,20" stroke="var(--gold)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="36" r="2" fill="var(--gold)"/><circle cx="14" cy="22" r="2" fill="var(--gold)"/><circle cx="22" cy="30" r="2" fill="var(--gold)"/><circle cx="30" cy="14" r="2" fill="var(--gold)"/><circle cx="42" cy="20" r="2" fill="var(--gold)"/></svg>',
    radar:         '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><polygon points="24,6 42,18 36,40 12,40 6,18" stroke="var(--border2)" stroke-width="1" fill="none"/><polygon points="24,12 36,20 32,34 16,34 12,20" stroke="var(--gold)" stroke-width="1.5" fill="var(--gold)" fill-opacity="0.15"/></svg>',
    polarArea:     '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 24L24 4A20 20 0 0 1 38 10Z" fill="var(--gold)" opacity="0.8"/><path d="M24 24L38 10A20 20 0 0 1 44 24Z" fill="var(--gold)" opacity="0.6"/><path d="M24 24L44 24A20 20 0 0 1 38 38Z" fill="var(--gold)" opacity="0.45"/><path d="M24 24L38 38A20 20 0 0 1 24 44Z" fill="var(--gold)" opacity="0.3"/><path d="M24 24L24 44A20 20 0 0 1 4 24Z" fill="var(--gold)" opacity="0.2"/><path d="M24 24L4 24A20 20 0 0 1 24 4Z" fill="var(--gold)" opacity="0.65"/></svg>'
  };

  var CHART_LABELS = {
    pie: 'Pie', doughnut: 'Doughnut', bar: 'Bar', horizontalBar: 'Horizontal Bar',
    line: 'Line', radar: 'Radar', polarArea: 'Polar Area'
  };

  // ── Offscreen Canvas for Chart.js Rendering ─────────────────
  var _offCanvas = document.createElement('canvas');

  // ── This module's flyout panel HTML (injected into the section shell) ──
  var FLYOUT_HTML =
    '<div class="flyout-section-title">Charts</div>' +
    '<div id="chart-type-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px"></div>';
  function _injectFlyout() {
    var sec = document.querySelector('.flyout-section[data-section="charts"]');
    if (sec && !document.getElementById('chart-type-grid')) sec.innerHTML = FLYOUT_HTML;
  }

  // ── Flyout: Render chart type category cards ────────────────
  window.renderChartCategoryCards = function () {
    _injectFlyout();
    var grid = document.getElementById('chart-type-grid');
    if (!grid) return;
    grid.innerHTML = '';

    var types = ['pie', 'doughnut', 'bar', 'horizontalBar', 'line', 'radar', 'polarArea'];
    types.forEach(function (type) {
      var card = document.createElement('div');
      card.className = 'chart-type-card';
      card.innerHTML =
        '<div class="chart-type-thumb">' + (CHART_THUMBS[type] || '') + '</div>' +
        '<div class="chart-type-label">' + (CHART_LABELS[type] || type) + '</div>';
      card.addEventListener('click', function () { window.addChartToCanvas(type); });
      grid.appendChild(card);
    });
  };

  // ── Render multiplier for high-DPI clarity ─────────────────
  var RENDER_MULT = 4;

  // ── Build Chart.js configuration ────────────────────────────
  function buildChartConfig(chartType, chartData, chartOptions) {
    var realType = chartType === 'horizontalBar' ? 'bar' : chartType;
    var isHorizontal = chartType === 'horizontalBar';
    var m = RENDER_MULT;
    var legendFontSize = (chartOptions.legendFontSize || 13) * m;
    var labelFontSize = (chartOptions.labelFontSize || 12) * m;
    var titleFontSize = (chartOptions.titleFontSize || 16) * m;

    var datasets = [{
      label: chartOptions.datasetLabel || '',
      data: chartData.data.slice(),
      backgroundColor: chartData.colors.slice(),
      borderColor: (realType === 'line' || realType === 'radar') ? chartData.colors[0] : (chartOptions.bgColor === 'transparent' ? 'rgba(0,0,0,0.15)' : chartOptions.bgColor || '#1e1e2e'),
      borderWidth: (realType === 'line' || realType === 'radar') ? 2.5 * m : 1 * m,
      pointBackgroundColor: chartData.colors[0],
      pointRadius: (realType === 'line' || realType === 'radar') ? 4 * m : undefined,
      fill: realType === 'radar'
    }];

    return {
      type: realType,
      data: {
        labels: chartData.labels.slice(),
        datasets: datasets
      },
      options: {
        indexAxis: isHorizontal ? 'y' : 'x',
        responsive: false,
        animation: false,
        plugins: {
          title: {
            display: !!(chartOptions.datasetLabel),
            text: chartOptions.datasetLabel || '',
            color: '#cdd6f4',
            font: { size: titleFontSize, weight: '600' },
            padding: { top: 6 * m, bottom: 8 * m }
          },
          legend: {
            display: chartOptions.legendShow !== false,
            position: chartOptions.legendPos || 'top',
            labels: {
              color: '#cdd6f4',
              font: { size: legendFontSize },
              boxWidth: 14 * m,
              boxHeight: 14 * m,
              padding: 10 * m
            }
          }
        },
        scales: (realType === 'pie' || realType === 'doughnut' || realType === 'polarArea') ? {} : {
          x: { ticks: { color: '#a6adc8', font: { size: labelFontSize } }, grid: { color: 'rgba(166,173,200,0.15)' } },
          y: { ticks: { color: '#a6adc8', font: { size: labelFontSize } }, grid: { color: 'rgba(166,173,200,0.15)' } }
        }
      },
      plugins: [{
        id: 'customBg',
        beforeDraw: function (chart) {
          var bg = chartOptions.bgColor || '#1e1e2e';
          if (bg === 'transparent') return;
          var ctx = chart.ctx;
          ctx.save();
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, chart.width, chart.height);
          ctx.restore();
        }
      }]
    };
  }

  // ── Render chart to offscreen canvas → return base64 ────────
  function renderChartToBase64(chartType, chartData, chartOptions, w, h) {
    var m = RENDER_MULT;
    _offCanvas.width = w * m;
    _offCanvas.height = h * m;
    var ctx = _offCanvas.getContext('2d');
    ctx.clearRect(0, 0, _offCanvas.width, _offCanvas.height);

    var cfg = buildChartConfig(chartType, chartData, chartOptions);
    var inst = new Chart(ctx, cfg);
    var base64 = _offCanvas.toDataURL('image/png');
    inst.destroy();
    return base64;
  }

  // ── Add Chart to Fabric Canvas ──────────────────────────────
  window.addChartToCanvas = function (type) {
    var def = CHART_DEFAULTS[type] || CHART_DEFAULTS.pie;
    var chartW = 400;
    var chartH = (type === 'pie' || type === 'doughnut' || type === 'radar' || type === 'polarArea') ? 400 : 300;
    var chartData = {
      labels: def.labels.slice(),
      data:   def.data.slice(),
      colors: def.colors.slice()
    };
    var chartOptions = { legendShow: true, legendPos: 'top', bgColor: '#1e1e2e', legendFontSize: 13, labelFontSize: 12, datasetLabel: CHART_LABELS[type] || type, titleFontSize: 16 };

    var base64 = renderChartToBase64(type, chartData, chartOptions, chartW, chartH);

    fabric.Image.fromURL(base64, function (img) {
      img.set({
        scaleX: chartW / img.width,
        scaleY: chartH / img.height,
        _isChart: true,
        _chartType: type,
        _chartData: JSON.stringify(chartData),
        _chartOptions: JSON.stringify(chartOptions),
        _chartW: chartW,
        _chartH: chartH
      });
      _add(img);
      _toast(CHART_LABELS[type] + ' chart added');
    }, { crossOrigin: 'anonymous' });
  };

  // ── Sync chart right panel ──────────────────────────────────
  window.syncChartPanel = function (obj) {
    if (!obj || !obj._isChart) return;

    var chartData, chartOptions;
    try { chartData = JSON.parse(obj._chartData); } catch (e) { chartData = CHART_DEFAULTS[obj._chartType] || CHART_DEFAULTS.pie; }
    try { chartOptions = JSON.parse(obj._chartOptions); } catch (e) { chartOptions = {}; }

    // Type
    var pType = document.getElementById('p-chart-type');
    if (pType) pType.value = obj._chartType || 'pie';

    // Dataset label
    var pDatasetLabel = document.getElementById('p-chart-dataset-label');
    if (pDatasetLabel) pDatasetLabel.value = chartOptions.datasetLabel || '';
    var pTitleFont = document.getElementById('p-chart-title-font');
    if (pTitleFont) pTitleFont.value = chartOptions.titleFontSize || 16;

    // Size
    var pW = document.getElementById('p-chart-w');
    var pH = document.getElementById('p-chart-h');
    if (pW) pW.value = obj._chartW || 400;
    if (pH) pH.value = obj._chartH || 300;

    // Background
    var pBg = document.getElementById('p-chart-bg');
    var pBgTransparent = document.getElementById('p-chart-bg-transparent');
    var bgVal = chartOptions.bgColor || '#1e1e2e';
    var isTransparent = bgVal === 'transparent';
    if (pBg) { pBg.value = isTransparent ? '#1e1e2e' : bgVal; pBg.disabled = isTransparent; }
    if (pBgTransparent) pBgTransparent.checked = isTransparent;

    // Legend
    var pLegend = document.getElementById('p-chart-legend');
    var pLegendPos = document.getElementById('p-chart-legend-pos');
    var pLegendFont = document.getElementById('p-chart-legend-font');
    var pLabelFont = document.getElementById('p-chart-label-font');
    if (pLegend) pLegend.checked = chartOptions.legendShow !== false;
    if (pLegendPos) pLegendPos.value = chartOptions.legendPos || 'top';
    if (pLegendFont) pLegendFont.value = chartOptions.legendFontSize || 13;
    if (pLabelFont) pLabelFont.value = chartOptions.labelFontSize || 12;

    // Data rows
    _buildDataRows(chartData);
  };

  // ── Build data rows inside the panel ────────────────────────
  function _buildDataRows(chartData) {
    var container = document.getElementById('chart-data-rows');
    if (!container) return;
    container.innerHTML = '';
    var labels = chartData.labels || [];
    var data = chartData.data || [];
    var colors = chartData.colors || [];

    for (var i = 0; i < labels.length; i++) {
      _addDataRowDOM(container, i, colors[i] || '#cccccc', labels[i] || '', data[i] || 0);
    }
  }

  function _addDataRowDOM(container, idx, color, label, value) {
    var row = document.createElement('div');
    row.className = 'chart-data-row';
    row.dataset.idx = idx;
    row.innerHTML =
      '<input type="color" class="cdr-color" value="' + (color || '#cccccc') + '" title="Color">' +
      '<input type="text" class="cdr-label" value="' + _escHtml(label) + '" placeholder="Label">' +
      '<input type="number" class="cdr-value" value="' + (value || 0) + '" min="0" step="1">' +
      '<button class="cdr-del" title="Remove">&times;</button>';

    // Inline event handlers
    row.querySelector('.cdr-color').addEventListener('input', function () { _onDataChange(); });
    row.querySelector('.cdr-label').addEventListener('input', function () { _onDataChange(); });
    row.querySelector('.cdr-value').addEventListener('input', function () { _onDataChange(); });
    row.querySelector('.cdr-del').addEventListener('click', function () {
      row.remove();
      _onDataChange();
    });

    container.appendChild(row);
  }

  function _escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Collect data from DOM rows → update object → rerender ───
  function _onDataChange() {
    var cvs = _cvs();
    var obj = cvs && cvs.getActiveObject();
    if (!obj || !obj._isChart) return;

    var rows = document.querySelectorAll('#chart-data-rows .chart-data-row');
    var labels = [], data = [], colors = [];
    rows.forEach(function (row) {
      labels.push(row.querySelector('.cdr-label').value);
      data.push(parseFloat(row.querySelector('.cdr-value').value) || 0);
      colors.push(row.querySelector('.cdr-color').value);
    });

    var chartData = { labels: labels, data: data, colors: colors };
    obj._chartData = JSON.stringify(chartData);
    _rerenderChart(obj);
  }

  // ── Re-render chart on the fabric image ─────────────────────
  function _rerenderChart(obj) {
    if (!obj || !obj._isChart) return;

    var chartData, chartOptions;
    try { chartData = JSON.parse(obj._chartData); } catch (e) { return; }
    try { chartOptions = JSON.parse(obj._chartOptions); } catch (e) { chartOptions = {}; }

    var w = obj._chartW || 400;
    var h = obj._chartH || 300;
    var base64 = renderChartToBase64(obj._chartType, chartData, chartOptions, w, h);

    obj.setSrc(base64, function () {
      obj.set({
        scaleX: w / obj.width,
        scaleY: h / obj.height
      });
      obj.dirty = true;
      var cvs = _cvs();
      if (cvs) cvs.renderAll();
      _snap();
    }, { crossOrigin: 'anonymous' });
  }

  // ── Init property bindings (called once when the module loads) ─
  function initChartPropertyBindings() {
    // Type change
    var pType = document.getElementById('p-chart-type');
    if (pType) {
      pType.addEventListener('change', function () {
        var cvs = _cvs();
        var obj = cvs && cvs.getActiveObject();
        if (!obj || !obj._isChart) return;

        var newType = pType.value;
        var oldData;
        try { oldData = JSON.parse(obj._chartData); } catch (e) { oldData = null; }

        // If switching to a drastically different type, use defaults but keep user data count
        var def = CHART_DEFAULTS[newType] || CHART_DEFAULTS.pie;
        if (!oldData) oldData = { labels: def.labels.slice(), data: def.data.slice(), colors: def.colors.slice() };

        // Ensure enough colors for the data
        while (oldData.colors.length < oldData.data.length) {
          oldData.colors.push(def.colors[oldData.colors.length % def.colors.length] || '#cccccc');
        }

        obj._chartType = newType;
        obj._chartData = JSON.stringify(oldData);

        // Update dataset label to new type name
        var chartOptions;
        try { chartOptions = JSON.parse(obj._chartOptions); } catch (e) { chartOptions = {}; }
        chartOptions.datasetLabel = CHART_LABELS[newType] || newType;
        obj._chartOptions = JSON.stringify(chartOptions);
        var pDatasetLabel = document.getElementById('p-chart-dataset-label');
        if (pDatasetLabel) pDatasetLabel.value = chartOptions.datasetLabel;

        // Adjust size for round charts
        var isRound = (newType === 'pie' || newType === 'doughnut' || newType === 'radar' || newType === 'polarArea');
        if (isRound && obj._chartW !== obj._chartH) {
          var size = Math.max(obj._chartW, obj._chartH);
          obj._chartW = size;
          obj._chartH = size;
          var pW = document.getElementById('p-chart-w');
          var pH = document.getElementById('p-chart-h');
          if (pW) pW.value = size;
          if (pH) pH.value = size;
        }

        _rerenderChart(obj);
        _buildDataRows(oldData);
      });
    }

    // Background color
    var pBg = document.getElementById('p-chart-bg');
    if (pBg) {
      pBg.addEventListener('input', function () { _updateOptions(); });
    }
    var pBgTransparent = document.getElementById('p-chart-bg-transparent');
    if (pBgTransparent) {
      pBgTransparent.addEventListener('change', function () {
        var bgInput = document.getElementById('p-chart-bg');
        if (bgInput) bgInput.disabled = pBgTransparent.checked;
        _updateOptions();
      });
    }

    // Legend toggle
    var pLegend = document.getElementById('p-chart-legend');
    if (pLegend) {
      pLegend.addEventListener('change', function () { _updateOptions(); });
    }

    // Legend position
    var pLegendPos = document.getElementById('p-chart-legend-pos');
    if (pLegendPos) {
      pLegendPos.addEventListener('change', function () { _updateOptions(); });
    }

    // Legend font size
    var pLegendFont = document.getElementById('p-chart-legend-font');
    if (pLegendFont) {
      pLegendFont.addEventListener('change', function () { _updateOptions(); });
    }

    // Label font size
    var pLabelFont = document.getElementById('p-chart-label-font');
    if (pLabelFont) {
      pLabelFont.addEventListener('change', function () { _updateOptions(); });
    }

    // Dataset label
    var pDatasetLabel = document.getElementById('p-chart-dataset-label');
    if (pDatasetLabel) {
      pDatasetLabel.addEventListener('input', function () { _updateOptions(); });
    }

    // Title font size
    var pTitleFont = document.getElementById('p-chart-title-font');
    if (pTitleFont) {
      pTitleFont.addEventListener('change', function () { _updateOptions(); });
    }

    // Size W
    var pW = document.getElementById('p-chart-w');
    if (pW) {
      pW.addEventListener('change', function () { _updateSize(); });
    }

    // Size H
    var pH = document.getElementById('p-chart-h');
    if (pH) {
      pH.addEventListener('change', function () { _updateSize(); });
    }

    // Add data row
    var addBtn = document.getElementById('chart-add-row');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        var container = document.getElementById('chart-data-rows');
        if (!container) return;
        var idx = container.children.length;
        var palette = ['#f5c2e7','#89b4fa','#f9e2af','#94e2d5','#cba6f7','#fab387','#b4befe'];
        _addDataRowDOM(container, idx, palette[idx % palette.length], 'Item ' + (idx + 1), 25);
        _onDataChange();
      });
    }

    // Re-render button
    var rerenderBtn = document.getElementById('chart-rerender-btn');
    if (rerenderBtn) {
      rerenderBtn.addEventListener('click', function () {
        var cvs = _cvs();
        var obj = cvs && cvs.getActiveObject();
        if (obj && obj._isChart) _rerenderChart(obj);
      });
    }
  }

  function _updateOptions() {
    var cvs = _cvs();
    var obj = cvs && cvs.getActiveObject();
    if (!obj || !obj._isChart) return;

    var chartOptions;
    try { chartOptions = JSON.parse(obj._chartOptions); } catch (e) { chartOptions = {}; }

    var pBg = document.getElementById('p-chart-bg');
    var pBgTransparent = document.getElementById('p-chart-bg-transparent');
    var pLegend = document.getElementById('p-chart-legend');
    var pLegendPos = document.getElementById('p-chart-legend-pos');

    chartOptions.bgColor = (pBgTransparent && pBgTransparent.checked) ? 'transparent' : (pBg ? pBg.value : '#1e1e2e');
    chartOptions.legendShow = pLegend ? pLegend.checked : true;
    chartOptions.legendPos = pLegendPos ? pLegendPos.value : 'top';

    var pLegendFont = document.getElementById('p-chart-legend-font');
    var pLabelFont = document.getElementById('p-chart-label-font');
    chartOptions.legendFontSize = parseInt(pLegendFont ? pLegendFont.value : 13) || 13;
    chartOptions.labelFontSize = parseInt(pLabelFont ? pLabelFont.value : 12) || 12;

    var pDatasetLabel = document.getElementById('p-chart-dataset-label');
    chartOptions.datasetLabel = pDatasetLabel ? pDatasetLabel.value : '';

    var pTitleFont = document.getElementById('p-chart-title-font');
    chartOptions.titleFontSize = parseInt(pTitleFont ? pTitleFont.value : 16) || 16;

    obj._chartOptions = JSON.stringify(chartOptions);
    _rerenderChart(obj);
  }

  function _updateSize() {
    var cvs = _cvs();
    var obj = cvs && cvs.getActiveObject();
    if (!obj || !obj._isChart) return;

    var pW = document.getElementById('p-chart-w');
    var pH = document.getElementById('p-chart-h');
    var w = parseInt(pW ? pW.value : 400) || 400;
    var h = parseInt(pH ? pH.value : 300) || 300;
    w = Math.max(100, Math.min(2000, w));
    h = Math.max(100, Math.min(2000, h));

    obj._chartW = w;
    obj._chartH = h;
    _rerenderChart(obj);
  }

  // ── Scaling quality (object:modified rerender), across all canvases ─
  function _initScaleRerender() {
    var hook = function (cvs) {
      if (!cvs) return;
      cvs.on('object:modified', function (e) {
        var obj = e.target;
        if (!obj || !obj._isChart) return;
        var newW = Math.round(obj.width * obj.scaleX);
        var newH = Math.round(obj.height * obj.scaleY);
        if (newW > 50 && newH > 50) {
          obj._chartW = newW;
          obj._chartH = newH;
          _rerenderChart(obj);
        }
      });
    };
    if (window.cc && cc.canvases) cc.canvases().forEach(hook);
    else { if (typeof canvas !== 'undefined') hook(canvas); if (typeof backCanvas !== 'undefined' && backCanvas) hook(backCanvas); }
  }

  // ── Restore charts after loadFromJSON ───────────────────────
  window._restoreChartsAfterLoad = function (cvs) {
    if (!cvs) return;
    cvs.getObjects().forEach(function (obj) {
      if (obj._isChart && obj._chartData) {
        _rerenderChart(obj);
      }
    });
  };

  // ── Module boot ─────────────────────────────────────────────
  // CUSTOM_PROPS is sacred — ensure this module's serialized props (idempotent).
  if (window.cc && cc.registerProps) cc.registerProps(['_isChart', '_chartType', '_chartData', '_chartOptions', '_chartW', '_chartH']);

  _injectFlyout();
  initChartPropertyBindings();
  _initScaleRerender();
  // if the charts panel happens to be open already, fill the grid
  var openSec = document.querySelector('.flyout-section[data-section="charts"].active');
  if (openSec) window.renderChartCategoryCards();

  // Plug into the skeleton: error boundary + health + future panel-system.
  if (window.cc && cc.modules) {
    cc.modules.register({
      id: 'charts', parent: 'left-panel',
      parent: 'left-panel',
      title: 'Charts',
      icon: 'bar-chart-3',
      mount: function () { _injectFlyout(); window.renderChartCategoryCards(); },
      unmount: function () {}
    });
  }
})();
