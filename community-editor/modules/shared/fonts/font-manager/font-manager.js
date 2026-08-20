/* ============================================================
   dika studio – Font Manager
   Upload, organize, and manage custom fonts (TTF/OTF/WOFF/WOFF2).
   Stores fonts in IndexedDB. Integrates with google-fonts.js.
   ============================================================ */

(function () {
  'use strict';

  /* ── IndexedDB ─────────────────────────────────────────────── */
  var DB_NAME = 'DikaFontsDB';
  var DB_VERSION = 1;
  var STORE = 'fonts';

  /* The installed fonts moved from `CardCraftFontsDB` when the product name was retired. The copy
     runs before this open, never beside it (docs/dika-rename-plan.md P5). */
  function _renamed() {
    if (window.CCMigrate && CCMigrate.db) return CCMigrate.db('CardCraftFontsDB', DB_NAME);
    return Promise.resolve(false);
  }

  function openDB() {
    return _renamed().then(function () { return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    }); });
  }

  function dbGetAll() {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var store = tx.objectStore(STORE);
        var req = store.getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function dbPut(record) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        var store = tx.objectStore(STORE);
        var req = store.put(record);
        req.onsuccess = function () { resolve(); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function dbDelete(id) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        var store = tx.objectStore(STORE);
        var req = store.delete(id);
        req.onsuccess = function () { resolve(); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  /* ── In-Memory Font Registry ───────────────────────────────── */
  var customFonts = [];          // { id, name, category, data (ArrayBuffer as base64), format, dateAdded, tags }
  var loadedCustomFamilies = new Set();

  function generateId() {
    return 'cf_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  }

  function detectFormat(fileName) {
    var ext = (fileName || '').split('.').pop().toLowerCase();
    if (ext === 'ttf') return 'truetype';
    if (ext === 'otf') return 'opentype';
    if (ext === 'woff') return 'woff';
    if (ext === 'woff2') return 'woff2';
    return 'truetype';
  }

  function arrayBufferToBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var binary = '';
    for (var i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function base64ToArrayBuffer(b64) {
    var binary = atob(b64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  /* ── FontFace Loading ──────────────────────────────────────── */
  function loadCustomFontFace(fontRecord) {
    if (loadedCustomFamilies.has(fontRecord.name)) return Promise.resolve();

    var buffer = base64ToArrayBuffer(fontRecord.data);
    var face = new FontFace(fontRecord.name, buffer, {
      style: 'normal',
      weight: '100 900'
    });

    return face.load().then(function (loaded) {
      document.fonts.add(loaded);
      loadedCustomFamilies.add(fontRecord.name);
    });
  }

  function loadAllCustomFonts() {
    return dbGetAll().then(function (records) {
      customFonts = records.sort(function (a, b) { return a.name.localeCompare(b.name); });
      var promises = records.map(function (r) {
        return loadCustomFontFace(r).catch(function (err) {
          console.warn('Failed to load custom font:', r.name, err);
        });
      });
      return Promise.all(promises);
    });
  }

  /* ── Public API ────────────────────────────────────────────── */
  function addFont(file) {
    return new Promise(function (resolve, reject) {
      if (!file) return reject(new Error('No file'));
      var allowed = ['ttf', 'otf', 'woff', 'woff2'];
      var ext = file.name.split('.').pop().toLowerCase();
      if (allowed.indexOf(ext) === -1) return reject(new Error('Unsupported format. Use TTF, OTF, WOFF, or WOFF2.'));

      var reader = new FileReader();
      reader.onload = function () {
        var baseName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
        // Capitalize words
        baseName = baseName.replace(/\b\w/g, function (c) { return c.toUpperCase(); });

        // Check duplicate name
        var existingNames = customFonts.map(function (f) { return f.name.toLowerCase(); });
        if (existingNames.indexOf(baseName.toLowerCase()) >= 0) {
          baseName = baseName + ' (' + (customFonts.length + 1) + ')';
        }

        var record = {
          id: generateId(),
          name: baseName,
          category: 'Custom',
          data: arrayBufferToBase64(reader.result),
          format: detectFormat(file.name),
          dateAdded: Date.now(),
          tags: ''
        };

        loadCustomFontFace(record).then(function () {
          return dbPut(record);
        }).then(function () {
          customFonts.push(record);
          customFonts.sort(function (a, b) { return a.name.localeCompare(b.name); });
          refreshAllFontSelectors();
          resolve(record);
        }).catch(reject);
      };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsArrayBuffer(file);
    });
  }

  function removeFont(id) {
    var idx = customFonts.findIndex(function (f) { return f.id === id; });
    if (idx === -1) return Promise.resolve();
    var name = customFonts[idx].name;
    customFonts.splice(idx, 1);
    loadedCustomFamilies.delete(name);
    return dbDelete(id).then(function () {
      refreshAllFontSelectors();
    });
  }

  function renameFont(id, newName) {
    var font = customFonts.find(function (f) { return f.id === id; });
    if (!font || !newName || !newName.trim()) return Promise.resolve();
    newName = newName.trim();

    // Reload with new name
    loadedCustomFamilies.delete(font.name);
    font.name = newName;

    return loadCustomFontFace(font).then(function () {
      return dbPut(font);
    }).then(function () {
      customFonts.sort(function (a, b) { return a.name.localeCompare(b.name); });
      refreshAllFontSelectors();
    });
  }

  function updateFontTags(id, tags) {
    var font = customFonts.find(function (f) { return f.id === id; });
    if (!font) return Promise.resolve();
    font.tags = tags || '';
    return dbPut(font);
  }

  function updateFontCategory(id, category) {
    var font = customFonts.find(function (f) { return f.id === id; });
    if (!font) return Promise.resolve();
    font.category = category || 'Custom';
    return dbPut(font).then(function () {
      refreshAllFontSelectors();
    });
  }

  function getCustomFonts() {
    return customFonts.slice();
  }

  function findFontRecord(familyName) {
    var target = String(familyName || '').trim().toLowerCase();
    if (!target) return null;
    for (var i = 0; i < customFonts.length; i++) {
      if (String(customFonts[i].name || '').trim().toLowerCase() === target) return customFonts[i];
    }
    return null;
  }

  function getFontArrayBuffer(familyName) {
    var record = findFontRecord(familyName);
    if (!record || !record.data) return null;
    try {
      return base64ToArrayBuffer(record.data);
    } catch (err) {
      console.warn('Failed to decode custom font buffer:', familyName, err);
      return null;
    }
  }

  /* ── Font Selector Integration ─────────────────────────────── */
  var SELECTOR_IDS = ['p-font', 'flyout-font-preview', 'tp-font'];

  function refreshAllFontSelectors() {
    SELECTOR_IDS.forEach(function (id) {
      var sel = document.getElementById(id);
      if (!sel) return;
      injectCustomGroup(sel);
    });
    window.dispatchEvent(new CustomEvent('customfonts:updated'));
    if (window.DikaFontLibrary && typeof window.DikaFontLibrary.refreshPickers === 'function') {
      window.DikaFontLibrary.refreshPickers();
    }
  }

  function injectCustomGroup(selectEl) {
    if (!selectEl) return;
    if (selectEl.classList && selectEl.classList.contains('ff-native-hidden')) return;
    var existing = selectEl.querySelector('optgroup[label="★ Custom Fonts"]');
    if (existing) existing.remove();

    if (customFonts.length === 0) return;

    var og = document.createElement('optgroup');
    og.label = '★ Custom Fonts';
    og.className = 'fm-custom-group';
    customFonts.forEach(function (f) {
      var opt = document.createElement('option');
      opt.value = f.name;
      opt.textContent = f.name;
      opt.style.fontFamily = '"' + f.name + '", sans-serif';
      og.appendChild(opt);
    });

    // Prepend before all other optgroups
    var firstChild = selectEl.firstChild;
    if (firstChild) {
      selectEl.insertBefore(og, firstChild);
    } else {
      selectEl.appendChild(og);
    }
  }

  /* ── Font Manager Modal ────────────────────────────────────── */
  var modalEl = null;

  function openFontManager() {
    if (modalEl) { closeFontManager(); }

    var overlay = document.createElement('div');
    overlay.className = 'fm-overlay';
    overlay.onclick = function (e) { if (e.target === overlay) closeFontManager(); };

    var modal = document.createElement('div');
    modal.className = 'fm-modal';

    /* Header */
    var header = document.createElement('div');
    header.className = 'fm-header';
    header.innerHTML =
      '<div class="fm-header-left">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="2"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>' +
        '<span class="fm-title">Font Manager</span>' +
        '<span class="fm-count">' + customFonts.length + ' fonts</span>' +
      '</div>' +
      '<button class="fm-close" title="Close">&times;</button>';
    header.querySelector('.fm-close').onclick = closeFontManager;
    modal.appendChild(header);

    /* Upload Zone */
    var uploadZone = document.createElement('div');
    uploadZone.className = 'fm-upload-zone';
    uploadZone.innerHTML =
      '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
      '<div class="fm-upload-text">Drop font files here or <span class="fm-upload-link">browse</span></div>' +
      '<div class="fm-upload-hint">TTF, OTF, WOFF, WOFF2</div>';

    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.accept = '.ttf,.otf,.woff,.woff2';
    fileInput.style.display = 'none';
    uploadZone.appendChild(fileInput);

    uploadZone.querySelector('.fm-upload-link').onclick = function () { fileInput.click(); };
    uploadZone.onclick = function (e) {
      if (e.target === uploadZone || e.target.closest('.fm-upload-text') || e.target.closest('.fm-upload-hint') || e.target.closest('svg')) {
        fileInput.click();
      }
    };

    fileInput.addEventListener('change', function () {
      if (fileInput.files.length) handleFilesUpload(fileInput.files);
      fileInput.value = '';
    });

    // Drag & drop
    uploadZone.addEventListener('dragover', function (e) {
      e.preventDefault();
      uploadZone.classList.add('fm-drag-over');
    });
    uploadZone.addEventListener('dragleave', function () {
      uploadZone.classList.remove('fm-drag-over');
    });
    uploadZone.addEventListener('drop', function (e) {
      e.preventDefault();
      uploadZone.classList.remove('fm-drag-over');
      if (e.dataTransfer.files.length) handleFilesUpload(e.dataTransfer.files);
    });

    modal.appendChild(uploadZone);

    /* Search + Filter Bar */
    var filterBar = document.createElement('div');
    filterBar.className = 'fm-filter-bar';
    filterBar.innerHTML =
      '<input type="text" class="fm-search" placeholder="Search fonts..." aria-label="Search fonts">' +
      '<select class="fm-filter-cat" aria-label="Filter by category">' +
        '<option value="">All Categories</option>' +
        '<option value="Custom">Custom</option>' +
        '<option value="Sans-serif">Sans-serif</option>' +
        '<option value="Serif">Serif</option>' +
        '<option value="Display">Display</option>' +
        '<option value="Handwriting">Handwriting</option>' +
        '<option value="Monospace">Monospace</option>' +
      '</select>';
    modal.appendChild(filterBar);

    var searchInput = filterBar.querySelector('.fm-search');
    var catFilter = filterBar.querySelector('.fm-filter-cat');
    searchInput.addEventListener('input', function () { renderFontList(); });
    catFilter.addEventListener('change', function () { renderFontList(); });

    /* Font List */
    var fontList = document.createElement('div');
    fontList.className = 'fm-font-list';
    modal.appendChild(fontList);

    /* Detail Panel */
    var detailPanel = document.createElement('div');
    detailPanel.className = 'fm-detail-panel';
    detailPanel.style.display = 'none';
    modal.appendChild(detailPanel);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    modalEl = overlay;

    renderFontList();

    /* ── Inner functions ──────────────────────────────────────── */
    function handleFilesUpload(files) {
      var arr = Array.from(files);
      var chain = Promise.resolve();
      arr.forEach(function (file) {
        chain = chain.then(function () {
          return addFont(file).catch(function (err) {
            showToast('Error: ' + err.message, true);
          });
        });
      });
      chain.then(function () {
        renderFontList();
        updateCount();
        showToast(arr.length + ' font(s) uploaded');
      });
    }

    function updateCount() {
      var countEl = modal.querySelector('.fm-count');
      if (countEl) countEl.textContent = customFonts.length + ' fonts';
    }

    function renderFontList() {
      var query = (searchInput.value || '').toLowerCase();
      var cat = catFilter.value;
      var filtered = customFonts.filter(function (f) {
        if (query && f.name.toLowerCase().indexOf(query) === -1 && (f.tags || '').toLowerCase().indexOf(query) === -1) return false;
        if (cat && f.category !== cat) return false;
        return true;
      });

      if (filtered.length === 0) {
        fontList.innerHTML =
          '<div class="fm-empty">' +
            (customFonts.length === 0
              ? '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" stroke-width="1.5"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>' +
                '<div>No custom fonts yet</div><div class="fm-empty-sub">Upload TTF, OTF, WOFF, or WOFF2 files to get started</div>'
              : '<div>No fonts match your filter</div>') +
          '</div>';
        detailPanel.style.display = 'none';
        return;
      }

      var html = '';
      filtered.forEach(function (f) {
        html +=
          '<div class="fm-font-row" data-id="' + f.id + '">' +
            '<div class="fm-font-preview" style="font-family:\'' + f.name.replace(/'/g, "\\'") + '\',sans-serif">Aa</div>' +
            '<div class="fm-font-info">' +
              '<div class="fm-font-name">' + escapeHtml(f.name) + '</div>' +
              '<div class="fm-font-meta">' + escapeHtml(f.category) + (f.tags ? ' · ' + escapeHtml(f.tags) : '') + '</div>' +
            '</div>' +
            '<div class="fm-font-actions">' +
              '<button class="fm-btn-icon fm-btn-detail" title="Details">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1.08 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1.08z"/></svg>' +
              '</button>' +
              '<button class="fm-btn-icon fm-btn-delete" title="Delete">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
              '</button>' +
            '</div>' +
          '</div>';
      });
      fontList.innerHTML = html;

      // Wire events
      fontList.querySelectorAll('.fm-btn-delete').forEach(function (btn) {
        btn.onclick = function (e) {
          e.stopPropagation();
          var row = btn.closest('.fm-font-row');
          var id = row.dataset.id;
          var font = customFonts.find(function (f) { return f.id === id; });
          if (!font) return;
          if (typeof showCustomConfirm === 'function') {
            showCustomConfirm('Delete font "' + font.name + '"?', function () {
              removeFont(id).then(function () {
                renderFontList();
                updateCount();
              });
            });
          } else {
            removeFont(id).then(function () {
              renderFontList();
              updateCount();
            });
          }
        };
      });

      fontList.querySelectorAll('.fm-btn-detail').forEach(function (btn) {
        btn.onclick = function (e) {
          e.stopPropagation();
          var row = btn.closest('.fm-font-row');
          var id = row.dataset.id;
          showDetailPanel(id);
        };
      });

      fontList.querySelectorAll('.fm-font-row').forEach(function (row) {
        row.onclick = function () {
          showDetailPanel(row.dataset.id);
        };
      });
    }

    function showDetailPanel(fontId) {
      var font = customFonts.find(function (f) { return f.id === fontId; });
      if (!font) { detailPanel.style.display = 'none'; return; }

      // Highlight active row
      fontList.querySelectorAll('.fm-font-row').forEach(function (r) { r.classList.remove('active'); });
      var activeRow = fontList.querySelector('.fm-font-row[data-id="' + fontId + '"]');
      if (activeRow) activeRow.classList.add('active');

      var dateStr = new Date(font.dateAdded).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

      detailPanel.style.display = 'block';
      detailPanel.innerHTML =
        '<div class="fm-detail-header">' +
          '<span class="fm-detail-title">Font Details</span>' +
          '<button class="fm-detail-close" title="Close details">&times;</button>' +
        '</div>' +

        '<div class="fm-detail-preview" style="font-family:\'' + font.name.replace(/'/g, "\\'") + '\',sans-serif">' +
          '<div class="fm-preview-large">The quick brown fox jumps over the lazy dog</div>' +
          '<div class="fm-preview-sizes">' +
            '<span style="font-size:10px">10px – AaBbCcDd 0123</span>' +
            '<span style="font-size:14px">14px – AaBbCcDd 0123</span>' +
            '<span style="font-size:20px">20px – AaBbCcDd</span>' +
            '<span style="font-size:28px">28px – AaBbCc</span>' +
          '</div>' +
        '</div>' +

        '<div class="fm-detail-fields">' +
          '<label class="fm-detail-label">Font Name</label>' +
          '<div class="fm-detail-row">' +
            '<input type="text" class="fm-detail-input" id="fm-d-name" value="' + escapeAttr(font.name) + '">' +
            '<button class="fm-btn-sm fm-btn-rename" title="Rename">Rename</button>' +
          '</div>' +

          '<label class="fm-detail-label">Category</label>' +
          '<select class="fm-detail-select" id="fm-d-category">' +
            '<option value="Custom"' + (font.category === 'Custom' ? ' selected' : '') + '>Custom</option>' +
            '<option value="Sans-serif"' + (font.category === 'Sans-serif' ? ' selected' : '') + '>Sans-serif</option>' +
            '<option value="Serif"' + (font.category === 'Serif' ? ' selected' : '') + '>Serif</option>' +
            '<option value="Display"' + (font.category === 'Display' ? ' selected' : '') + '>Display</option>' +
            '<option value="Handwriting"' + (font.category === 'Handwriting' ? ' selected' : '') + '>Handwriting</option>' +
            '<option value="Monospace"' + (font.category === 'Monospace' ? ' selected' : '') + '>Monospace</option>' +
          '</select>' +

          '<label class="fm-detail-label">Tags</label>' +
          '<input type="text" class="fm-detail-input" id="fm-d-tags" value="' + escapeAttr(font.tags || '') + '" placeholder="e.g. logo, heading, brand...">' +

          '<div class="fm-detail-meta">' +
            '<div><span class="fm-meta-label">Format:</span> ' + font.format + '</div>' +
            '<div><span class="fm-meta-label">Added:</span> ' + dateStr + '</div>' +
            '<div><span class="fm-meta-label">ID:</span> <span style="opacity:0.5;font-size:10px">' + font.id + '</span></div>' +
          '</div>' +

          '<div class="fm-detail-actions">' +
            '<button class="fm-btn-sm fm-btn-apply" title="Apply to selected text">Apply to Text</button>' +
            '<button class="fm-btn-sm fm-btn-del-detail" title="Delete font">Delete</button>' +
          '</div>' +
        '</div>';

      // Wire detail events
      detailPanel.querySelector('.fm-detail-close').onclick = function () {
        detailPanel.style.display = 'none';
        fontList.querySelectorAll('.fm-font-row').forEach(function (r) { r.classList.remove('active'); });
      };

      detailPanel.querySelector('.fm-btn-rename').onclick = function () {
        var nameInput = document.getElementById('fm-d-name');
        if (nameInput && nameInput.value.trim()) {
          renameFont(font.id, nameInput.value.trim()).then(function () {
            renderFontList();
            showDetailPanel(font.id);
            showToast('Font renamed');
          });
        }
      };

      var catSelect = detailPanel.querySelector('#fm-d-category');
      catSelect.onchange = function () {
        updateFontCategory(font.id, catSelect.value).then(function () {
          renderFontList();
          showToast('Category updated');
        });
      };

      var tagsInput = detailPanel.querySelector('#fm-d-tags');
      var tagsTimer;
      tagsInput.addEventListener('input', function () {
        clearTimeout(tagsTimer);
        tagsTimer = setTimeout(function () {
          updateFontTags(font.id, tagsInput.value);
        }, 500);
      });

      detailPanel.querySelector('.fm-btn-apply').onclick = function () {
        applyCustomFontToText(font.name);
        showToast('Applied: ' + font.name);
      };

      detailPanel.querySelector('.fm-btn-del-detail').onclick = function () {
        if (typeof showCustomConfirm === 'function') {
          showCustomConfirm('Delete font "' + font.name + '"?', function () {
            removeFont(font.id).then(function () {
              detailPanel.style.display = 'none';
              renderFontList();
              updateCount();
            });
          });
        }
      };
    }
  }

  function closeFontManager() {
    if (modalEl) {
      modalEl.remove();
      modalEl = null;
    }
  }

  function applyCustomFontToText(familyName) {
    if (window.DikaFontLibrary && typeof window.DikaFontLibrary.applySelection === 'function') {
      window.DikaFontLibrary.applySelection({ family: familyName });
      return;
    }
    var c = (typeof getActiveCanvas === 'function') ? getActiveCanvas() :
            (typeof canvas !== 'undefined') ? canvas : null;
    if (!c) return;
    var o = c.getActiveObject();
    if (!o || (o.type !== 'i-text' && o.type !== 'text' && o.type !== 'textbox')) return;
    o.set('fontFamily', familyName);
    o.dirty = true;
    o.initDimensions();
    c.requestRenderAll();
    setTimeout(function () { c.renderAll(); }, 10);
    if (typeof snap === 'function') snap();

    // Update font selectors
    ['p-font', 'flyout-font-preview', 'tp-font'].forEach(function (id) {
      var sel = document.getElementById(id);
      if (sel) sel.value = familyName;
    });
  }

  /* ── Toast Helper ──────────────────────────────────────────── */
  function showToast(msg, isError) {
    var t = document.createElement('div');
    t.className = 'fm-toast' + (isError ? ' fm-toast-error' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { t.remove(); }, 300);
    }, 2400);
  }

  /* ── Utility ───────────────────────────────────────────────── */
  function escapeHtml(str) {
    var d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }
  function escapeAttr(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ── Init ──────────────────────────────────────────────────── */
  function initFontManager() {
    loadAllCustomFonts().then(function () {
      refreshAllFontSelectors();
      injectGearButtons();
    }).catch(function () {
      // IndexedDB blocked/unavailable (e.g. private mode) — still wire up the UI.
      refreshAllFontSelectors();
      injectGearButtons();
    });
  }

  function injectGearButtons() {
    // Gear button next to #p-font
    var pFont = document.getElementById('p-font');
    if (pFont && !document.getElementById('fm-gear-pfont')) {
      var label = pFont.closest('.prow');
      if (label) {
        var labelSpan = label.querySelector('.plabel');
        if (labelSpan) {
          labelSpan.style.display = 'flex';
          labelSpan.style.alignItems = 'center';
          labelSpan.style.justifyContent = 'space-between';
          labelSpan.style.width = '100%';
          var gear = createGearBtn('fm-gear-pfont');
          labelSpan.appendChild(gear);
        }
      }
    }

    // Gear button next to #flyout-font-preview
    var flyFont = document.getElementById('flyout-font-preview');
    if (flyFont && !document.getElementById('fm-gear-flyout')) {
      var titleDiv = flyFont.previousElementSibling; // .ptitle
      if (titleDiv && titleDiv.classList.contains('ptitle')) {
        titleDiv.style.display = 'flex';
        titleDiv.style.alignItems = 'center';
        titleDiv.style.justifyContent = 'space-between';
        var gear = createGearBtn('fm-gear-flyout');
        titleDiv.appendChild(gear);
      }
    }
  }

  function createGearBtn(id) {
    var btn = document.createElement('button');
    btn.id = id;
    btn.className = 'fm-gear-btn';
    btn.title = 'Font Manager';
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1.08 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1.08z"/></svg>';
    btn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      openFontManager();
    };
    return btn;
  }

  /* ── Bootstrap ─────────────────────────────────────────────── */
  // Faz 8: shared module loads after DOMContentLoaded → self-init on sticky cc:canvas-ready.
  if (window.cc && cc.on) cc.on('cc:canvas-ready', function () { setTimeout(function () { cc.safe('shared.fonts.font-manager', initFontManager); }, 600); });
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(initFontManager, 600); });
  else setTimeout(initFontManager, 600);

  /* ── Expose API ────────────────────────────────────────────── */
  window.FontManager = {
    open: openFontManager,
    close: closeFontManager,
    add: addFont,
    remove: removeFont,
    rename: renameFont,
    getAll: getCustomFonts,
    findByFamily: findFontRecord,
    getArrayBuffer: getFontArrayBuffer,
    refresh: refreshAllFontSelectors,
    injectCustomGroup: injectCustomGroup
  };

})();


// Modular skeleton hook (Faz 8) — font-manager is now a shared loader module (modules/shared/fonts/).
if (window.cc && cc.modules) cc.modules.register({ id: 'font-manager', parent: 'shared.fonts', title: 'Font manager', mount: function () {}, unmount: function () {} });
