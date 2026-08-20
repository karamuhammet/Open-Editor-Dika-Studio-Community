/* ============================================================
   dika studio – Bulk export from CSV (PNG / WebP / PDF)
   Downloads files individually to avoid Windows SmartScreen issues.
   P0.5 (2026-07-18): rows are applied to CLONED JSON and rendered
   OFFSCREEN via core/render-part.js (renderPart) — the live canvas
   is never touched anymore (the old per-row loadFromJSON hijack +
   restore machinery is gone). Traversal comes from CCBulk; the
   text-only role/substring replacement semantics stay LOCAL and
   unchanged on purpose (no currency logic here, unlike the wizard).
   Globals: canvas, CW, CH, userInfo, currentFace, dualSideEnabled,
   frontJSON, backJSON, frontBG, backBG, CUSTOM_PROPS, wizSettings
   ============================================================ */

var BULK_EXPORT_COLUMNS = ['name', 'title', 'company', 'email', 'phone', 'website'];
var bulkExportParsedRows = [];
var _bulkEmailVerify = null;

function parseCSV(text) {
  var rows = [];
  var row = [];
  var cur = '';
  var i = 0;
  var inQuotes = false;

  function pushCell() {
    row.push(cur);
    cur = '';
  }
  function pushRow() {
    if (row.length === 1 && row[0] === '' && rows.length === 0) return;
    rows.push(row);
    row = [];
  }

  while (i < text.length) {
    var c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cur += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      pushCell();
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      pushCell();
      pushRow();
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  pushCell();
  if (row.length > 1 || (row.length === 1 && row[0] !== '')) pushRow();

  if (rows.length === 0) return [];

  var header = rows[0].map(function (h) {
    return String(h || '').trim().replace(/^\uFEFF/, '').toLowerCase();
  });
  var out = [];
  for (var r = 1; r < rows.length; r++) {
    var cells = rows[r];
    var obj = {};
    for (var c = 0; c < BULK_EXPORT_COLUMNS.length; c++) {
      var key = BULK_EXPORT_COLUMNS[c];
      var idx = header.indexOf(key);
      obj[key] = idx >= 0 && cells[idx] != null ? String(cells[idx]).trim() : '';
    }
    out.push(obj);
  }
  return out;
}

function slugifyFilename(s) {
  var base = (s || 'card').replace(/[^\w\-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return base || 'card';
}

function dpiToMultiplier(dpi) {
  // Match single-page export (which uses dpi/72). The old 1/2/3/6 steps under-scaled bulk
  // exports — e.g. 300 DPI gave 3x instead of ~4.17x, so bulk output was lower-res.
  return Math.max(1, (dpi || 72) / 72);
}

function getJsPdfConstructor() {
  if (typeof jspdf !== 'undefined' && jspdf.jsPDF) return jspdf.jsPDF;
  if (typeof jsPDF !== 'undefined') return jsPDF;
  return null;
}

function getPdfPageGeometry() {
  var wiz = typeof wizSettings !== 'undefined' ? wizSettings : {};
  var isV = wiz.orientation === 'vertical';
  var orientation = isV ? 'portrait' : 'landscape';
  var cardW = isV ? 2 : 3.5;
  var cardH = isV ? 3.5 : 2;
  return { orientation: orientation, cardW: cardW, cardH: cardH };
}

function downloadDataURL(dataUrl, filename) {
  var a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function delayMs(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

function updateBulkProgress(current, total) {
  var prog = document.getElementById('bulk-progress-text');
  if (prog) prog.textContent = 'Exporting ' + current + ' / ' + total + '...';
  var bar = document.getElementById('bulk-progress-bar-gen');
  if (bar) bar.style.width = Math.round((current / total) * 100) + '%';
}

async function downloadBulkFiles(files) {
  if ('showDirectoryPicker' in window) {
    try {
      var dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        var fileHandle = await dirHandle.getFileHandle(f.name, { create: true });
        var writable = await fileHandle.createWritable();
        var blob = f.blob || await (await fetch(f.dataUrl)).blob();
        await writable.write(blob);
        await writable.close();
        updateBulkProgress(i + 1, files.length);
      }
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false;
    }
  }

  for (var j = 0; j < files.length; j++) {
    downloadDataURL(files[j].dataUrl, files[j].name);
    if (j < files.length - 1) await delayMs(600);
    updateBulkProgress(j + 1, files.length);
  }
  return true;
}

/* Same replacement semantics as the old live-canvas applyRowReplacements, but on
   CLONED page JSON: role match (_dfField / legacy _fieldRole) wins; if NO object had a
   role value, fall back to substring find/replace of the current userInfo values.
   Text objects only, groups recursed (CCBulk.walkJsonObjects). */
function applyRowReplacementsJson(json, row) {
  var usedFieldRole = false;
  function eachText(fn) {
    CCBulk.walkJsonObjects((json && json.objects) || [], function (o) {
      if (o && (o.type === 'i-text' || o.type === 'text' || o.type === 'textbox')) fn(o);
    });
  }
  eachText(function (t) {
    var role = t._dfField || t._fieldRole;
    if (role) {
      var raw = row[role];
      if (raw == null || raw === '') raw = row[String(role).toLowerCase()];
      if (raw != null && String(raw) !== '') {
        t.text = String(raw);
        usedFieldRole = true;
      }
    }
  });

  if (!usedFieldRole) {
    BULK_EXPORT_COLUMNS.forEach(function (key) {
      var from = userInfo[key];
      if (from == null || String(from).trim() === '') return;
      from = String(from);
      var to = row[key] != null ? String(row[key]) : '';
      eachText(function (t) {
        if (t.text && t.text.indexOf(from) !== -1) {
          t.text = t.text.split(from).join(to);
        }
      });
    });
  }
}

/* Offscreen row render: clone the face template, apply the row, renderPart it. */
function renderBulkFace(templateJson, bg, row, format, multiplier) {
  var data = JSON.parse(JSON.stringify(templateJson));
  applyRowReplacementsJson(data, row);
  return renderPart(
    { kind: 'page', json: data, w: typeof CW !== 'undefined' ? CW : undefined, h: typeof CH !== 'undefined' ? CH : undefined, bg: bg },
    { format: format, multiplier: multiplier }
  );
}

function bulkExportSetStep(wrap, step) {
  var s1 = wrap.querySelector('#bulk-wiz-step1');
  var s2 = wrap.querySelector('#bulk-wiz-step2');
  var s3 = wrap.querySelector('#bulk-wiz-step3');
  if (s1) s1.style.display = step === 1 ? '' : 'none';
  if (s2) s2.style.display = step === 2 ? '' : 'none';
  if (s3) s3.style.display = step === 3 ? '' : 'none';
}

function bulkExportUpdateContinueBtn(wrap) {
  var consent = wrap.querySelector('#bulk-consent-check');
  var btn = wrap.querySelector('#bulk-continue-csv-btn');
  if (!consent || !btn) return;
  var emailOk = _bulkEmailVerify && _bulkEmailVerify.isVerified();
  btn.disabled = !(consent.checked && emailOk);
}

function bulkExportSetDpiUI(wrap, dpi) {
  wrap.querySelectorAll('.bulk-dpi-btn').forEach(function (b) {
    var d = parseInt(b.getAttribute('data-dpi'), 10);
    b.classList.toggle('active', d === dpi);
  });
  var hid = wrap.querySelector('#bulk-export-dpi');
  if (hid) hid.value = String(dpi);
}

function ensureBulkExportModal() {
  var existing = document.getElementById('bulk-export-modal');
  if (existing) return existing;

  var wrap = document.createElement('div');
  wrap.id = 'bulk-export-modal';
  wrap.className = 'modal hidden';
  wrap.setAttribute('style', 'z-index:12000');
  wrap.innerHTML =
    '<div class="modal-veil" data-bulk-close="1"></div>' +
    '<div class="modal-box" style="max-width:520px;background:var(--surface);border:1px solid var(--border);color:var(--text)">' +
      '<button type="button" class="modal-close" data-bulk-close="1" aria-label="Close">✕</button>' +
      '<div class="modal-form-wrap" style="padding:20px 22px">' +

        '<div id="bulk-wiz-step1">' +
          '<div class="mform-title" style="color:var(--text)">Bulk Export</div>' +
          '<p class="mform-sub" style="margin-top:8px;line-height:1.5">Verify your email and confirm consent before uploading your CSV.</p>' +
          '<input type="text" class="mform-input" id="bulk-info-name" placeholder="Name" style="margin-top:12px" />' +
          '<input type="email" class="mform-input" id="bulk-info-email" placeholder="Email *" />' +
          '<input type="text" class="mform-input" id="bulk-info-company" placeholder="Company" />' +
          '<div id="bulk-verify-container" style="margin-top:8px"></div>' +
          '<div class="wiz-checkbox-row" style="margin-top:10px;margin-bottom:12px">' +
            '<input type="checkbox" id="bulk-consent-check" />' +
            '<label for="bulk-consent-check" style="font-size:11px;line-height:1.4">I agree to the processing of my data in accordance with the Privacy Policy.</label>' +
          '</div>' +
          '<button type="button" class="mform-dl-btn" id="bulk-continue-csv-btn" disabled>Continue to CSV Upload</button>' +
        '</div>' +

        '<div id="bulk-wiz-step2" style="display:none">' +
          '<div class="mform-title" style="color:var(--text)">CSV &amp; options</div>' +
          '<p class="mform-sub" style="margin-top:8px;line-height:1.5">Upload a CSV with columns: name, title, company, email, phone, website</p>' +
          '<button type="button" class="mform-input" id="bulk-back-step1-btn" style="margin-top:8px;padding:8px 12px;cursor:pointer;background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:12px;width:auto">← Back</button>' +
          '<input type="file" id="bulk-csv-input" accept=".csv,text/csv" class="mform-input" style="margin-top:12px;padding:8px" />' +
          '<div id="bulk-preview-wrap" style="display:none;margin-top:14px">' +
            '<div class="ptitle" style="margin-bottom:8px;color:var(--text-dim)">Preview</div>' +
            '<div style="overflow:auto;max-height:160px;border:1px solid var(--border);border-radius:8px;background:var(--bg-elevated)">' +
              '<table id="bulk-preview-table" style="width:100%;border-collapse:collapse;font-size:12px"></table>' +
            '</div>' +
            '<p id="bulk-preview-more" style="margin-top:8px;font-size:11px;color:var(--text-dim)"></p>' +
          '</div>' +
          '<div class="export-options" style="margin-top:16px">' +
            '<div class="export-opt-group">' +
              '<span class="export-opt-label">Format</span>' +
              '<select class="mform-input" id="bulk-export-format" style="margin-top:6px;padding:8px">' +
                '<option value="png">PNG</option>' +
                '<option value="pdf">PDF</option>' +
                '<option value="webp">WebP</option>' +
              '</select>' +
            '</div>' +
            '<div class="export-opt-group" style="margin-top:12px">' +
              '<span class="export-opt-label">DPI</span>' +
              '<input type="hidden" id="bulk-export-dpi" value="300" />' +
              '<div class="export-format-row" style="margin-top:6px">' +
                '<button type="button" class="export-format-btn dpi-btn bulk-dpi-btn" data-dpi="72">72</button>' +
                '<button type="button" class="export-format-btn dpi-btn bulk-dpi-btn" data-dpi="150">150</button>' +
                '<button type="button" class="export-format-btn dpi-btn bulk-dpi-btn active" data-dpi="300">300</button>' +
                '<button type="button" class="export-format-btn dpi-btn bulk-dpi-btn" data-dpi="600">600</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div style="margin-top:16px">' +
            '<div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden">' +
              '<div id="bulk-progress-bar" style="height:100%;width:0%;background:var(--gold);transition:width .2s ease"></div>' +
            '</div>' +
            '<p id="bulk-progress-label" style="margin-top:8px;font-size:11px;color:var(--text-dim)"></p>' +
          '</div>' +
          '<button type="button" class="mform-dl-btn" id="bulk-generate-btn" style="margin-top:18px">Download All</button>' +
        '</div>' +

        '<div id="bulk-wiz-step3" style="display:none">' +
          '<div class="mform-title" style="color:var(--text)">Exporting…</div>' +
          '<p class="mform-sub" style="margin-top:8px;line-height:1.5">Your files are being prepared. If prompted, select a folder to save all files directly.</p>' +
          '<div style="margin-top:16px">' +
            '<div id="bulk-progress-text" style="font-size:12px;color:var(--text-dim);margin-bottom:6px">Preparing...</div>' +
            '<div style="height:4px;background:var(--surface2);border-radius:4px;overflow:hidden">' +
              '<div id="bulk-progress-bar-gen" style="height:100%;background:var(--gold);width:0%;transition:width 0.3s"></div>' +
            '</div>' +
            '<p id="bulk-progress-label-gen" style="margin-top:8px;font-size:11px;color:var(--text-dim)"></p>' +
          '</div>' +
        '</div>' +

      '</div>' +
    '</div>';

  document.body.appendChild(wrap);

  wrap.addEventListener('click', function (e) {
    if (e.target && e.target.getAttribute('data-bulk-close') === '1') {
      closeBulkExportModal();
    }
  });

  // Email verification
  var bulkVerifyContainer = wrap.querySelector('#bulk-verify-container');
  if (bulkVerifyContainer && typeof DikaEmailVerify !== 'undefined') {
    _bulkEmailVerify = DikaEmailVerify.buildUI(bulkVerifyContainer, {
      idPrefix: 'bulk-ev',
      emailInputId: 'bulk-info-email',
      onVerified: function () {
        bulkExportUpdateContinueBtn(wrap);
      },
    });
  }

  var consentEl = wrap.querySelector('#bulk-consent-check');
  if (consentEl) {
    consentEl.addEventListener('change', function () {
      bulkExportUpdateContinueBtn(wrap);
    });
  }

  wrap.querySelector('#bulk-continue-csv-btn').addEventListener('click', function () {
    bulkExportSetStep(wrap, 2);
  });

  wrap.querySelector('#bulk-back-step1-btn').addEventListener('click', function () {
    bulkExportSetStep(wrap, 1);
  });

  wrap.querySelectorAll('.bulk-dpi-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      var dpi = parseInt(b.getAttribute('data-dpi'), 10);
      bulkExportSetDpiUI(wrap, dpi);
    });
  });

  var fileInput = wrap.querySelector('#bulk-csv-input');
  fileInput.addEventListener('change', function () {
    var f = fileInput.files && fileInput.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        bulkExportParsedRows = parseCSV(String(reader.result || ''));
        renderBulkPreview(wrap);
      } catch (err) {
        bulkExportParsedRows = [];
        if (typeof showToast === 'function') showToast('Could not read CSV.', 'error');
      }
    };
    reader.readAsText(f);
  });

  wrap.querySelector('#bulk-generate-btn').addEventListener('click', runBulkGenerate);

  return wrap;
}

function renderBulkPreview(wrap) {
  var previewWrap = wrap.querySelector('#bulk-preview-wrap');
  var table = wrap.querySelector('#bulk-preview-table');
  var moreEl = wrap.querySelector('#bulk-preview-more');
  if (!previewWrap || !table) return;

  if (bulkExportParsedRows.length === 0) {
    previewWrap.style.display = 'none';
    if (typeof showToast === 'function') showToast('No data rows found in CSV.', 'error');
    return;
  }

  previewWrap.style.display = '';

  var show = bulkExportParsedRows.slice(0, 5);
  var headers = BULK_EXPORT_COLUMNS;

  var thead = '<thead><tr>';
  headers.forEach(function (h) {
    thead += '<th style="text-align:left;padding:8px;border-bottom:1px solid var(--border);color:var(--gold)">' + h + '</th>';
  });
  thead += '</tr></thead>';

  var tbody = '<tbody>';
  show.forEach(function (row) {
    tbody += '<tr>';
    headers.forEach(function (h) {
      var cell = (row[h] || '').replace(/</g, '&lt;');
      tbody += '<td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text)">' + cell + '</td>';
    });
    tbody += '</tr>';
  });
  tbody += '</tbody>';

  table.innerHTML = thead + tbody;

  var rest = bulkExportParsedRows.length - show.length;
  if (rest > 0) {
    moreEl.textContent = 'and ' + rest + ' more';
    moreEl.style.display = '';
  } else {
    moreEl.textContent = '';
    moreEl.style.display = 'none';
  }
}

function openBulkExportModal() {
  var gear = document.getElementById('gear-dropdown');
  if (gear) gear.classList.remove('show');

  if (typeof saveCurrentPage === 'function') saveCurrentPage();

  var modal = ensureBulkExportModal();
  modal.classList.remove('hidden');

  var titleEl = modal.querySelector('.mform-title');
  if (titleEl && typeof getProductExportLabel === 'function') {
    titleEl.textContent = 'Bulk ' + getProductExportLabel().replace('Get My ', '');
  }

  bulkExportSetStep(modal, 1);
  if (_bulkEmailVerify) _bulkEmailVerify.reset();
  bulkExportUpdateContinueBtn(modal);
  bulkExportSetDpiUI(modal, 300);

  var fmt = modal.querySelector('#bulk-export-format');
  if (fmt) fmt.value = 'png';

  var bar = modal.querySelector('#bulk-progress-bar');
  var barG = modal.querySelector('#bulk-progress-bar-gen');
  var lbl = modal.querySelector('#bulk-progress-label');
  var lblG = modal.querySelector('#bulk-progress-label-gen');
  if (bar) bar.style.width = '0%';
  if (barG) barG.style.width = '0%';
  if (lbl) lbl.textContent = '';
  if (lblG) lblG.textContent = '';

  var fileInput = modal.querySelector('#bulk-csv-input');
  if (fileInput) fileInput.value = '';
  bulkExportParsedRows = [];
  var previewWrap = modal.querySelector('#bulk-preview-wrap');
  if (previewWrap) previewWrap.style.display = 'none';
}

function closeBulkExportModal() {
  var modal = document.getElementById('bulk-export-modal');
  if (modal) modal.classList.add('hidden');
}

async function runBulkGenerate() {
  if (bulkExportParsedRows.length === 0) {
    if (typeof showToast === 'function') showToast('Upload a CSV with at least one data row.', 'error');
    return;
  }
  if (typeof CCBulk === 'undefined' || typeof renderPart !== 'function') {
    if (typeof showToast === 'function') showToast('Render engine not loaded. Refresh the page and try again.', 'error');
    return;
  }

  var modal = document.getElementById('bulk-export-modal');
  var formatSel = modal ? modal.querySelector('#bulk-export-format') : null;
  var format = formatSel ? String(formatSel.value || 'png').toLowerCase() : 'png';
  var dpiEl = modal ? modal.querySelector('#bulk-export-dpi') : null;
  var dpi = dpiEl ? parseInt(dpiEl.value, 10) : 300;
  if (isNaN(dpi)) dpi = 300;
  var multiplier = dpiToMultiplier(dpi);

  if (format === 'pdf') {
    var PDFCtor = getJsPdfConstructor();
    if (!PDFCtor) {
      if (typeof showToast === 'function') showToast('PDF library not loaded. Refresh the page and try again.', 'error');
      return;
    }
  }

  var bar = modal ? modal.querySelector('#bulk-progress-bar') : null;
  var lbl = modal ? modal.querySelector('#bulk-progress-label') : null;
  var barGen = modal ? modal.querySelector('#bulk-progress-bar-gen') : null;
  var lblGen = modal ? modal.querySelector('#bulk-progress-label-gen') : null;
  var btn = modal ? modal.querySelector('#bulk-generate-btn') : null;

  function setProgress(pct, text) {
    var w = Math.round(pct) + '%';
    if (bar) bar.style.width = w;
    if (barGen) barGen.style.width = w;
    if (lbl) lbl.textContent = text;
    if (lblGen) lblGen.textContent = text;
  }

  if (btn) btn.disabled = true;
  if (modal) bulkExportSetStep(modal, 3);

  var props = typeof CUSTOM_PROPS !== 'undefined' ? CUSTOM_PROPS : ['selectable', 'evented', 'id', 'qrUrl', 'qrFg', 'qrBg', 'isQR'];

  if (typeof saveCurrentPage === 'function') saveCurrentPage();

  if (currentFace === 'front') {
    frontJSON = canvas.toJSON(props);
    frontBG = canvas.backgroundColor;
  } else {
    backJSON = canvas.toJSON(props);
    backBG = canvas.backgroundColor;
  }

  var templateFront = JSON.parse(JSON.stringify(frontJSON));
  var templateBack = backJSON ? JSON.parse(JSON.stringify(backJSON)) : null;
  var templateFrontBG = frontBG;
  var templateBackBG = backBG;

  var hasDual = dualSideEnabled && templateBack;
  var totalSteps = bulkExportParsedRows.length;
  var step = 0;

  var imgExt = format === 'webp' ? 'webp' : 'png';
  var PDF = format === 'pdf' ? getJsPdfConstructor() : null;
  var geom = format === 'pdf' ? getPdfPageGeometry() : null;

  var filesToDownload = [];

  try {
    for (var i = 0; i < bulkExportParsedRows.length; i++) {
      var row = bulkExportParsedRows[i];
      var slug = slugifyFilename(row.name || row.email || 'card-' + (i + 1));

      if (format === 'pdf') {
        var frontURL = await renderBulkFace(templateFront, templateFrontBG, row, 'png', multiplier);
        if (!frontURL) throw new Error('Row ' + (i + 1) + ' render failed.');

        var doc = new PDF({
          orientation: geom.orientation,
          unit: 'in',
          format: [geom.cardW, geom.cardH],
        });
        doc.setProperties({
          title: 'Business Card - ' + (row.name || 'dika studio'),
          subject: 'Business Card Export',
          author: 'dika studio by Mirex Agency',
          creator: 'dika studio Business Card Maker',
        });
        doc.addImage(frontURL, 'PNG', 0, 0, geom.cardW, geom.cardH);

        if (hasDual) {
          var backURL = await renderBulkFace(templateBack, templateBackBG, row, 'png', multiplier);
          if (!backURL) throw new Error('Row ' + (i + 1) + ' render failed.');
          doc.addPage([geom.cardW, geom.cardH], geom.orientation);
          doc.addImage(backURL, 'PNG', 0, 0, geom.cardW, geom.cardH);
        }

        var pdfBlob = doc.output('blob');
        var pdfUrl = URL.createObjectURL(pdfBlob);
        filesToDownload.push({ name: slug + '.pdf', dataUrl: pdfUrl, blob: pdfBlob });
      } else {
        var frontDataUrl = await renderBulkFace(templateFront, templateFrontBG, row, format, multiplier);
        if (!frontDataUrl) throw new Error('Row ' + (i + 1) + ' render failed.');
        filesToDownload.push({ name: slug + '-front.' + imgExt, dataUrl: frontDataUrl, blob: null });

        if (hasDual) {
          var backDataUrl = await renderBulkFace(templateBack, templateBackBG, row, format, multiplier);
          if (!backDataUrl) throw new Error('Row ' + (i + 1) + ' render failed.');
          filesToDownload.push({ name: slug + '-back.' + imgExt, dataUrl: backDataUrl, blob: null });
        }
      }

      step++;
      setProgress((step / totalSteps) * 100, 'Generating ' + step + ' / ' + totalSteps + ' cards...');
    }

    var progText = document.getElementById('bulk-progress-text');
    if (progText) progText.textContent = 'Starting download...';
    await downloadBulkFiles(filesToDownload);

    filesToDownload.forEach(function (f) {
      if (f.dataUrl && f.dataUrl.indexOf('blob:') === 0) {
        try { URL.revokeObjectURL(f.dataUrl); } catch (ignore) {}
      }
    });
  } finally {
    if (modal) bulkExportSetStep(modal, 2);
    if (btn) btn.disabled = false;
    setProgress(100, 'Done: ' + totalSteps + ' cards downloaded.');
    if (typeof showToast === 'function') showToast('All cards downloaded.', 'info');
  }
}

function injectBulkExportGearItem() {
  var gearDrop = document.getElementById('gear-dropdown');
  if (!gearDrop || gearDrop.querySelector('[data-bulk-export-btn]')) return;

  var sep = document.createElement('div');
  sep.className = 'gear-sep';

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'gear-item';
  btn.setAttribute('data-bulk-export-btn', '1');
  btn.textContent = typeof getProductExportLabel === 'function'
    ? 'Bulk ' + getProductExportLabel().replace('Get My ', '')
    : 'Bulk Export';
  btn.addEventListener('click', function () {
    openBulkExportModal();
  });

  gearDrop.appendChild(sep);
  gearDrop.appendChild(btn);
}

function initBulkExport() {
  injectBulkExportGearItem();
}

// Faz 8: export module loads after DOMContentLoaded → self-init on sticky cc:canvas-ready.
if (window.cc && cc.on) cc.on('cc:canvas-ready', function () { cc.safe('export.bulk-export', initBulkExport); });
else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initBulkExport);
else initBulkExport();

// Modular skeleton hook (Faz 8) — bulk-export is now an export loader module (modules/export/).
if (window.cc && cc.modules) cc.modules.register({ id: 'bulk-export', parent: 'export', title: 'Bulk export', mount: function () {}, unmount: function () {} });
