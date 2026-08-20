/* templates/saved — SAVED user templates (IndexedDB storage). Split from the 3107-line templates.js (decomposition).
   FLAT sub-module: its functions stay window globals (the panel/boot/each other call them at runtime,
   so load order among siblings is irrelevant). Registers under left-panel.templates for fault isolation. */

function _openTplDB(cb) {
  if (!window.indexedDB) { cb(null); return; }
  /* Saved templates moved from `CardCraftTemplatesDB` with the rename; the copy runs before this
     open, never beside it (docs/dika-rename-plan.md P5). */
  var moved = (window.CCMigrate && window.CCMigrate.db)
    ? window.CCMigrate.db('CardCraftTemplatesDB', _TPLDB_NAME) : Promise.resolve(false);
  moved.then(function () { _openTplDBNow(cb); });
}

function _openTplDBNow(cb) {
  var req = indexedDB.open(_TPLDB_NAME, _TPLDB_VERSION);
  req.onupgradeneeded = function (e) {
    var db = e.target.result;
    if (!db.objectStoreNames.contains(_TPLDB_STORE)) {
      db.createObjectStore(_TPLDB_STORE, { keyPath: 'id' });
    }
  };
  req.onsuccess = function (e) { cb(e.target.result); };
  req.onerror = function () { cb(null); };
}

/* Read all templates from IDB → cache */
function _loadAllTemplatesFromIDB(cb) {
  _openTplDB(function (db) {
    if (!db) { cb([]); return; }
    try {
      var tx = db.transaction(_TPLDB_STORE, 'readonly');
      var store = tx.objectStore(_TPLDB_STORE);
      var req = store.getAll();
      req.onsuccess = function () {
        var arr = req.result || [];
        arr.sort(function (a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
        cb(arr);
      };
      req.onerror = function () { cb([]); };
    } catch (e) { cb([]); }
  });
}

/* Migrate old localStorage templates into IDB (one-time) */
function _migrateLSTplsToIDB(cb) {
  try {
    var raw = localStorage.getItem(SAVED_TEMPLATES_KEY);
    if (!raw) { cb(); return; }
    var arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) { cb(); return; }
    _openTplDB(function (db) {
      if (!db) { cb(); return; }
      var tx = db.transaction(_TPLDB_STORE, 'readwrite');
      var store = tx.objectStore(_TPLDB_STORE);
      arr.forEach(function (t) { try { store.put(t); } catch (e) {} });
      tx.oncomplete = function () {
        try { localStorage.removeItem(SAVED_TEMPLATES_KEY); } catch (e) {}
        cb();
      };
      tx.onerror = function () { cb(); };
    });
  } catch (e) { cb(); }
}

/* Initialise template DB: migrate then load */
function _initTemplateDB() {
  _migrateLSTplsToIDB(function () {
    _loadAllTemplatesFromIDB(function (arr) {
      _tplDbCache = arr;
      _tplDbReady = true;
      // The IDB load is async; if the templates panel already rendered before the saved templates
      // finished loading, the "My Templates" card was skipped (getSavedTemplates() returned []).
      // Re-render the open panel now so it appears. (Guarded: only when there ARE saved templates
      // and the grid is currently populated/open, and renderTemplatesPanel is available.)
      if (arr && arr.length && typeof renderTemplatesPanel === 'function') {
        var g = document.getElementById('flyout-tpl-grid');
        if (g && g.children.length) { try { renderTemplatesPanel('flyout-tpl-grid'); } catch (e) {} }
      }
    });
  });
}
_initTemplateDB();

/* Synchronous getter – returns cached array */
function getSavedTemplates() {
  if (_tplDbCache) return _tplDbCache;
  // Fallback: try localStorage while IDB is loading
  try {
    var raw = localStorage.getItem(SAVED_TEMPLATES_KEY);
    if (raw) { var a = JSON.parse(raw); if (Array.isArray(a)) return a; }
  } catch (e) {}
  return [];
}

/* Write single template to IDB */
function _putTemplateIDB(tpl, onDone) {
  _openTplDB(function (db) {
    if (!db) { if (onDone) onDone(false); return; }
    try {
      var tx = db.transaction(_TPLDB_STORE, 'readwrite');
      var store = tx.objectStore(_TPLDB_STORE);
      store.put(tpl);
      tx.oncomplete = function () { if (onDone) onDone(true); };
      tx.onerror = function () { if (onDone) onDone(false); };
    } catch (e) { if (onDone) onDone(false); }
  });
}

/* Delete single template from IDB */
function _deleteTemplateIDB(id, onDone) {
  _openTplDB(function (db) {
    if (!db) { if (onDone) onDone(false); return; }
    try {
      var tx = db.transaction(_TPLDB_STORE, 'readwrite');
      tx.objectStore(_TPLDB_STORE).delete(id);
      tx.oncomplete = function () { if (onDone) onDone(true); };
      tx.onerror = function () { if (onDone) onDone(false); };
    } catch (e) { if (onDone) onDone(false); }
  });
}

/* Rewrite entire list (for rename, reorder, etc.) */
function setSavedTemplates(arr) {
  _tplDbCache = arr;
  _openTplDB(function (db) {
    if (!db) return;
    try {
      var tx = db.transaction(_TPLDB_STORE, 'readwrite');
      var store = tx.objectStore(_TPLDB_STORE);
      store.clear();
      arr.forEach(function (t) { store.put(t); });
    } catch (e) {}
  });
}

function saveAsTemplate() {
  // Close gear dropdown
  var dd = document.getElementById('gear-dropdown');
  if (dd) dd.classList.remove('show');

  // Prompt for template name
  var defaultName = 'My Template ' + (getSavedTemplates().length + 1);
  if (typeof showCustomPrompt === 'function') {
    showCustomPrompt('Template Name', defaultName, function (name) {
      if (!name || !name.trim()) return;
      _doSaveTemplate(name.trim());
    });
  } else {
    var name = prompt('Template name:', defaultName);
    if (!name || !name.trim()) return;
    _doSaveTemplate(name.trim());
  }
}

function _doSaveTemplate(name) {
  // Save current page first
  if (typeof saveCurrentPage === 'function') saveCurrentPage();

  var cvs = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : canvas;
  var props = (typeof CUSTOM_PROPS !== 'undefined') ? CUSTOM_PROPS : [];
  var jsonData = cvs.toJSON(props);

  // Generate thumbnail as dataURL
  var thumbDataUrl = '';
  try {
    thumbDataUrl = cvs.toDataURL({ format: 'jpeg', quality: 0.5, multiplier: 0.25 });
  } catch (e) {}

  var tplData = {
    id: 'saved_' + Date.now(),
    name: name,
    timestamp: Date.now(),
    productType: (typeof activeProduct !== 'undefined') ? activeProduct : 'card',
    canvasWidth: (typeof CW !== 'undefined') ? CW : 700,
    canvasHeight: (typeof CH !== 'undefined') ? CH : 400,
    bg: cvs.backgroundColor || '#0d0d0d',
    json: jsonData,
    thumb: thumbDataUrl
  };

  // Update cache immediately
  if (!_tplDbCache) _tplDbCache = [];
  _tplDbCache.unshift(tplData);

  // Persist to IndexedDB
  _putTemplateIDB(tplData, function (ok) {
    if (ok) {
      if (typeof showToast === 'function') showToast('Template saved: ' + name);
    } else {
      // Remove from cache on failure
      _tplDbCache = _tplDbCache.filter(function (t) { return t.id !== tplData.id; });
      if (typeof showToast === 'function') showToast('Failed to save template (storage full?)', 'error');
    }
    // Refresh template flyout if visible
    var tplGrid = document.getElementById('flyout-tpl-grid');
    if (tplGrid) renderTemplateCategoryCards('flyout-tpl-grid');
  });
}

function applySavedTemplate(id) {
  var saved = getSavedTemplates();
  var tpl = null;
  for (var i = 0; i < saved.length; i++) {
    if (saved[i].id === id) { tpl = saved[i]; break; }
  }
  if (!tpl) return;

  // A saved template carries its OWN canvas size, so it opens in a NEW page at that size — exactly
  // like a community template (_ccApplyDoc). It used to overwrite the CURRENT page and keep the
  // current size, so a 1080x1080 design landed on a 500x500 canvas (owner 2026-07-24).
  var w = Math.max(50, Math.min(4096, tpl.canvasWidth || 700));
  var h = Math.max(50, Math.min(4096, tpl.canvasHeight || 400));

  var loadOnto = function () {
    var cvs = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : canvas;
    var coedit = window.CCCoEdit;
    var structural = !!(coedit && coedit.beginStructural && coedit.beginStructural());
    histLocked = true;
    cvs.loadFromJSON(tpl.json, function () {
      cvs.setBackgroundColor(tpl.bg || '#0d0d0d', function () {
        cvs.renderAll();
        histLocked = false;
        if (structural) coedit.endStructural();
        if (typeof snap === 'function') setTimeout(snap, 120);
        if (typeof refreshStructure === 'function') refreshStructure();
        if (typeof showToast === 'function') showToast('Template opened in a new page: ' + tpl.name);
      });
    });
  };

  if (typeof addPage === 'function') addPage(undefined, w, h);
  // Restore the template's product type, but never let its DEFAULT dimensions win: setProductType
  // overwrites CW/CH from PRODUCT_TYPES, so the saved size is re-applied right after. 'video' is
  // skipped on purpose — a new page is never a video page (addPage already made it 'custom').
  if (tpl.productType && tpl.productType !== 'video' && typeof PRODUCT_TYPES !== 'undefined' &&
      PRODUCT_TYPES[tpl.productType] && tpl.productType !== activeProduct && typeof setProductType === 'function') {
    setProductType(tpl.productType);
  }
  if (typeof setCustomCanvasSize === 'function') setCustomCanvasSize(w, h);
  // Keep the page record in sync with CW/CH, or switching away and back would restore the old size.
  if (typeof pages !== 'undefined' && pages[currentPageIndex]) {
    pages[currentPageIndex].w = w;
    pages[currentPageIndex].h = h;
  }
  setTimeout(loadOnto, 120); // let the page switch / video-board exit settle
}

function deleteSavedTemplate(id) {
  var doDelete = function () {
    if (_tplDbCache) _tplDbCache = _tplDbCache.filter(function (t) { return t.id !== id; });
    _deleteTemplateIDB(id, function () {
      if (typeof showToast === 'function') showToast('Template deleted');
      var tplGrid = document.getElementById('flyout-tpl-grid');
      if (tplGrid) renderTemplateCategoryCards('flyout-tpl-grid');
    });
  };

  if (typeof showCustomConfirm === 'function') {
    showCustomConfirm('Delete this saved template?', doDelete);
  } else {
    if (confirm('Delete this saved template?')) doDelete();
  }
}

function renameSavedTemplate(id) {
  var saved = getSavedTemplates();
  var tpl = null;
  for (var i = 0; i < saved.length; i++) {
    if (saved[i].id === id) { tpl = saved[i]; break; }
  }
  if (!tpl) return;

  if (typeof showCustomPrompt === 'function') {
    showCustomPrompt('Rename template', tpl.name, function (newName) {
      if (!newName || !newName.trim()) return;
      tpl.name = newName.trim();
      _putTemplateIDB(tpl, function () {
        if (typeof showToast === 'function') showToast('Template renamed');
        var tplGrid = document.getElementById('flyout-tpl-grid');
        if (tplGrid) renderTemplateCategoryCards('flyout-tpl-grid');
      });
    });
  } else {
    var newName = prompt('Rename template:', tpl.name);
    if (!newName || !newName.trim()) return;
    tpl.name = newName.trim();
    _putTemplateIDB(tpl, function () {
      if (typeof showToast === 'function') showToast('Template renamed');
      var tplGrid = document.getElementById('flyout-tpl-grid');
      if (tplGrid) renderTemplateCategoryCards('flyout-tpl-grid');
    });
  }
}

function exportSavedTemplateFile(id) {
  var saved = getSavedTemplates();
  var tpl = null;
  for (var i = 0; i < saved.length; i++) {
    if (saved[i].id === id) { tpl = saved[i]; break; }
  }
  if (!tpl) return;

  var blob = new Blob([JSON.stringify(tpl, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  var safeName = tpl.name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-_]/g, '').toLowerCase();
  a.download = 'template-' + safeName + '.json';
  a.href = url;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  if (typeof showToast === 'function') showToast('Template exported: ' + tpl.name);
}

/* ══════════════════════════════════════════════════════════════════
   COMMUNITY SHARING (profiles-community-plan P13)
   "Toplulukla paylaş" — share a saved template to the community template
   marketplace. The editor is served at /editor/* on the PANEL origin, so
   /api/* is same-origin: a credentialed fetch carries the panel session.
   Flow: consent-gate → (first time) consent modal → share dialog → POST.
   The community copy is an independent snapshot (server sanitizes + copies
   assets, P12) — deleting the local My-Templates copy does NOT remove it.
   ══════════════════════════════════════════════════════════════════ */

function _ccApi(path) { return '/api' + path; }

// My-Templates entries are classic single-page designs; videos map to 'video'.
// (frame/slide are shared from their own scene/slide contexts, later.)
function _ccTemplateFormat(productType) { return productType === 'video' ? 'video' : 'single'; }

// Community categories — dynamic from the editor's template catalog (TEMPLATE_CATEGORIES); adding a
// category there grows the share dropdown automatically. Falls back to distinct registry categories.
// (Owner: kategori serbest-metin değil, mevcut kategorilerden dinamik seçilsin — ilerde eklenebilsin.)
function _ccTemplateCategories() {
  // The editor's own product-type categories (Business Card, Logo, CV/Resume, Invoice, Social Post,
  // Story/Reel, Banner, Email) — the same sections shown in the templates panel. (Owner: hazır
  // kategoriler.) Falls back to PRODUCT_TYPES labels if CR_ORDER is unavailable.
  var cats = [];
  if (typeof CR_ORDER !== 'undefined' && typeof PRODUCT_TYPES !== 'undefined') {
    CR_ORDER.forEach(function (k) {
      var cfg = PRODUCT_TYPES[k];
      if (cfg && cfg.label && cats.indexOf(cfg.label) === -1) cats.push(cfg.label);
    });
  }
  return cats;
}

function _ccFindSaved(id) {
  var saved = getSavedTemplates();
  for (var i = 0; i < saved.length; i++) { if (saved[i].id === id) return saved[i]; }
  return null;
}

/* ── "Use this template" — open a community template in the editor ──────────────────────────────
   The gallery (panel /templates) links to /editor?template=<id>. On boot we read that param, fetch
   the published portable doc + meta, and load it onto a fresh, correctly-sized page. */
function _ccUseCommunityTemplate(id, asFrame) {
  if (typeof showToast === 'function') showToast('Loading template…');
  fetch(_ccApi('/templates/' + encodeURIComponent(id) + '/doc'), { credentials: 'include' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!data || !data.doc) { if (typeof showToast === 'function') showToast('Template failed to load', 'error'); return; }
      // On an infinite (scene) canvas, add the shared template as a FRAME — same as the built-in and
      // saved cards — not as loose objects on a fresh classic page. Reuses the saved-template frame
      // builder (community doc has the same canvas-LOCAL object shape). The gallery deep-link path
      // (_ccBootUseTemplate) passes no flag, so it still opens as a normal page to edit.
      if (asFrame && typeof _scAddSavedFrame === 'function') {
        _scAddSavedFrame({ json: data.doc, canvasWidth: data.width, canvasHeight: data.height, name: data.title, bg: (data.doc && data.doc.background) || '#ffffff' });
        return;
      }
      _ccApplyDoc(data);
    })
    .catch(function () { if (typeof showToast === 'function') showToast('Template failed to load', 'error'); });
}

function _ccApplyDoc(data) {
  var w = data.width || 700, h = data.height || 400;
  var bg = (data.doc && data.doc.background) || '#ffffff';
  var doLoad = function () {
    var cvs = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : (typeof canvas !== 'undefined' ? canvas : null);
    if (!cvs) return;
    if (typeof histLocked !== 'undefined') histLocked = true;
    cvs.loadFromJSON(data.doc, function () {
      cvs.setBackgroundColor(bg, function () {
        cvs.renderAll();
        if (typeof histLocked !== 'undefined') histLocked = false;
        if (typeof snap === 'function') setTimeout(snap, 150);
        if (typeof refreshStructure === 'function') refreshStructure();
        if (typeof showToast === 'function') showToast('Template loaded' + (data.title ? ': ' + data.title : ''));
      });
    });
  };
  // Open in a fresh page sized to the template (don't overwrite whatever the user already had open).
  if (typeof addPage === 'function') { addPage(undefined, w, h); setTimeout(doLoad, 150); }
  else doLoad();
}

/* On editor boot: if the URL carries ?template=<id> (from the gallery), wait for the canvas, apply,
   then strip the param so a refresh doesn't re-apply. */
function _ccBootUseTemplate() {
  var id;
  try { id = new URLSearchParams(window.location.search).get('template'); } catch (e) { return; }
  if (!id) return;
  try { if (window.history && window.history.replaceState) window.history.replaceState({}, '', window.location.pathname); } catch (e) {}
  var tries = 0;
  var iv = setInterval(function () {
    tries++;
    var cvs = (typeof getActiveCanvas === 'function' && getActiveCanvas()) || (typeof canvas !== 'undefined' && canvas) || null;
    if (cvs || tries > 50) {
      clearInterval(iv);
      if (cvs) _ccUseCommunityTemplate(id);
    }
  }, 150);
}
if (window.cc && cc.on) cc.on('modules:ready', _ccBootUseTemplate);
else if (typeof window !== 'undefined') { setTimeout(_ccBootUseTemplate, 1000); }

/* Entry point — wired from the card's Share button + right-click menu. Opens the dialog IMMEDIATELY
   (never gated on a network call — that's what previously made it "not appear"); the moderation mode
   only refines the button label, and consent is enforced server-side on submit (CONSENT_REQUIRED). */
function shareSavedTemplate(id) {
  var tpl = _ccFindSaved(id);
  if (!tpl) return;
  var overlay = _ccOpenShareDialog(tpl, 'auto');
  fetch(_ccApi('/community/consent'), { credentials: 'include' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (c) { if (c && c.moderationMode && overlay && overlay._ccSetMode) overlay._ccSetMode(c.moderationMode); })
    .catch(function () {});
}

function _ccShowLoginNeeded() {
  if (typeof showCustomConfirm === 'function') {
    showCustomConfirm('You need to be logged in to the panel to share with the community. Shall we open the login page?',
      function () { window.open('/login', '_blank'); });
  } else if (typeof showToast === 'function') {
    showToast('Login to panel required for sharing', 'error');
  }
}

/* First-time consent: render the versioned terms; require an explicit checkbox. */
function _ccOpenConsentModal(consent, onAccepted) {
  var terms = (consent && consent.terms) || { title: 'Community Contribution Agreement', body: '' };
  var overlay = document.createElement('div');
  overlay.className = 'cmodal-overlay';
  var box = document.createElement('div');
  box.className = 'cmodal-box';
  box.style.cssText = 'max-width:560px;width:92%;text-align:left;';

  var h = document.createElement('div');
  h.style.cssText = 'font-size:15px;font-weight:700;color:var(--text);margin-bottom:10px;';
  h.textContent = terms.title;

  var body = document.createElement('div');
  body.style.cssText = 'white-space:pre-wrap;font-size:12px;line-height:1.6;color:var(--text-dim);max-height:46vh;overflow:auto;border:1px solid var(--border,#333);border-radius:8px;padding:12px;background:var(--surface2,#1a1a1a);';
  body.textContent = terms.body;

  var chkRow = document.createElement('label');
  chkRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin:12px 0 6px;font-size:12px;color:var(--text);cursor:pointer;';
  var chk = document.createElement('input'); chk.type = 'checkbox';
  chkRow.appendChild(chk);
  chkRow.appendChild(document.createTextNode('I have read and agree.'));

  // consent-flows (owner 2026-07-11): community registration REQUIRES the
  // marketing/cookie consent — the server refuses the POST without it, so the
  // checkbox is not decorative. Accept enables only when BOTH boxes are ticked.
  var mkRow = document.createElement('label');
  mkRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin:0 0 12px;font-size:12px;color:var(--text);cursor:pointer;';
  var mk = document.createElement('input'); mk.type = 'checkbox';
  mkRow.appendChild(mk);
  mkRow.appendChild(document.createTextNode('Optional: send me product news and allow marketing cookies. Sharing does not depend on this.'));

  var actions = document.createElement('div');
  actions.className = 'cmodal-actions';
  var cancel = document.createElement('button'); cancel.className = 'cmodal-btn cmodal-cancel'; cancel.textContent = 'Cancel';
  var accept = document.createElement('button'); accept.className = 'cmodal-btn cmodal-yes'; accept.textContent = 'Accept and continue';
  accept.disabled = true; accept.style.opacity = '0.5';
  function _syncAccept() { var ok = chk.checked; accept.disabled = !ok; accept.style.opacity = ok ? '1' : '0.5'; }
  chk.addEventListener('change', _syncAccept);
  mk.addEventListener('change', _syncAccept);
  cancel.onclick = function () { overlay.remove(); };
  accept.onclick = function () {
    if (!chk.checked) return;
    accept.disabled = true; accept.textContent = 'Saving…';
    fetch(_ccApi('/community/consent'), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ marketingConsent: mk.checked }) })
      .then(function (r) { return r.ok; })
      .then(function (ok) {
        if (!ok) { accept.disabled = false; accept.textContent = 'Accept and continue'; _syncAccept(); if (typeof showToast === 'function') showToast('Consent could not be saved', 'error'); return; }
        // Ads consent gate reads this key; the editor shares the portal origin.
        if (mk.checked) { try { localStorage.setItem('cc_cookie_consent', 'granted'); } catch (e) {} }
        overlay.remove();
        if (onAccepted) onAccepted();
      })
      .catch(function () { accept.disabled = false; accept.textContent = 'Accept and continue'; _syncAccept(); if (typeof showToast === 'function') showToast('Consent could not be saved', 'error'); });
  };
  actions.appendChild(cancel); actions.appendChild(accept);

  box.appendChild(h); box.appendChild(body); box.appendChild(chkRow); box.appendChild(mkRow); box.appendChild(actions);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
}

/* Render a crisp gallery cover from the template doc. The saved thumb is tiny (multiplier 0.25,
   q0.5) → pixelated when shown big. Re-render the doc to a bounded high-res JPEG. Falls back to the
   thumb if Fabric/doc is missing, rendering times out, or the canvas is tainted (cross-origin asset). */
function _ccRenderCover(tpl, cb) {
  var fallback = (tpl && tpl.thumb) || '';
  if (typeof fabric === 'undefined' || !tpl || !tpl.json) { cb(fallback); return; }
  var done = false;
  function finish(u) { if (!done) { done = true; cb(u || fallback); } }
  try {
    var w = tpl.canvasWidth || 700, h = tpl.canvasHeight || 400;
    var sc = new fabric.StaticCanvas(document.createElement('canvas'), { width: w, height: h, enableRetinaScaling: false });
    var bail = setTimeout(function () { try { sc.dispose(); } catch (e) {} finish(fallback); }, 4000);
    sc.loadFromJSON(tpl.json, function () {
      try {
        sc.setBackgroundColor(tpl.bg || '#ffffff', function () {
          sc.renderAll();
          clearTimeout(bail);
          var cap = 1280, mult = Math.min(cap / Math.max(w, h), 2);
          if (!isFinite(mult) || mult <= 0) mult = 1;
          var url;
          try { url = sc.toDataURL({ format: 'jpeg', quality: 0.85, multiplier: mult }); } catch (e) { url = fallback; }
          try { sc.dispose(); } catch (e) {}
          finish(url);
        });
      } catch (e) { clearTimeout(bail); try { sc.dispose(); } catch (e2) {} finish(fallback); }
    });
  } catch (e) { finish(fallback); }
}

/* The share form: title/description/category/license + read-only auto-detected format. */
function _ccOpenShareDialog(tpl, mode) {
  var review = (mode === 'review'); // review = needs approval; otherwise publishes immediately
  // F7: re-sharing an already-PUBLISHED template submits a NEW VERSION (moderation), not a new template.
  // The live version keeps serving the gallery until a moderator approves the edit.
  var isVersion = !!(tpl.sharedTemplateId && typeof tpl.sharedTemplateId === 'string' && tpl.sharedStatus === 'published');
  var fmt = _ccTemplateFormat(tpl.productType);
  var inStyle = 'width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--border,#333);border-radius:8px;background:var(--surface2,#1a1a1a);color:var(--text);font-size:13px;';

  var overlay = document.createElement('div'); overlay.className = 'cmodal-overlay';
  var box = document.createElement('div'); box.className = 'cmodal-box'; box.style.cssText = 'max-width:480px;width:92%;text-align:left;';

  function field(labelText, el) {
    var w = document.createElement('div'); w.style.cssText = 'margin-bottom:12px;';
    var l = document.createElement('div'); l.style.cssText = 'font-size:11px;font-weight:600;color:var(--text-dim);margin-bottom:4px;'; l.textContent = labelText;
    w.appendChild(l); w.appendChild(el); return w;
  }

  var h = document.createElement('div'); h.style.cssText = 'font-size:15px;font-weight:700;color:var(--text);margin-bottom:14px;'; h.textContent = isVersion ? 'Update template (new version)' : 'Share with community';

  var title = document.createElement('input'); title.type = 'text'; title.value = tpl.name || ''; title.style.cssText = inStyle;
  var desc = document.createElement('textarea'); desc.rows = 3; desc.style.cssText = inStyle + 'resize:vertical;'; desc.placeholder = 'Short description (optional)';
  var cat = document.createElement('select'); cat.style.cssText = inStyle;
  var catEmpty = document.createElement('option'); catEmpty.value = ''; catEmpty.textContent = 'Select category (optional)'; cat.appendChild(catEmpty);
  _ccTemplateCategories().forEach(function (c) { var op = document.createElement('option'); op.value = c; op.textContent = c; cat.appendChild(op); });
  // Auto-select the category that matches the design's product type (owner: shared designs auto-
  // categorize into the existing categories). The user can still change it.
  try { var _autoCat = (typeof PRODUCT_TYPES !== 'undefined' && PRODUCT_TYPES[tpl.productType]) ? PRODUCT_TYPES[tpl.productType].label : ''; if (_autoCat) cat.value = _autoCat; } catch (e) {}
  var lic = document.createElement('select'); lic.style.cssText = inStyle;
  [['dika-standard', 'dika studio Standard'], ['cc-by', 'CC-BY (attribution required)'], ['cc0', 'CC0 (public domain)']].forEach(function (o) {
    var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; lic.appendChild(op);
  });
  var fmtName = { single: 'Single design (e.g. Instagram post)', frame: 'Scene frame', slide: 'Slide', video: 'Video' }[fmt] || fmt;
  var fmtChip = document.createElement('span'); fmtChip.style.cssText = 'display:inline-block;font-size:11px;color:var(--text-dim);background:var(--surface2,#1a1a1a);border:1px solid var(--border,#333);border-radius:999px;padding:3px 10px;'; fmtChip.textContent = fmtName;

  var info = document.createElement('div'); info.style.cssText = 'font-size:11px;color:var(--text-faint,#888);line-height:1.5;margin:6px 0 14px;';
  info.textContent = isVersion
    ? 'This template is published in the community. Your edit will be submitted for approval as a NEW VERSION; the current version remains published until approved.'
    : ((review
      ? 'This template will be submitted for approval; after an admin approves it, it will be published in the community. '
      : 'This template is published immediately in the community. ') + 'This is a separate copy from the copy in My Templates — it stays in the community even if you delete your own copy.');

  var actions = document.createElement('div'); actions.className = 'cmodal-actions';
  var cancel = document.createElement('button'); cancel.className = 'cmodal-btn cmodal-cancel'; cancel.textContent = 'Cancel';
  var submit = document.createElement('button'); submit.className = 'cmodal-btn cmodal-yes'; submit.textContent = isVersion ? 'Submit update' : (review ? 'Submit for approval' : 'Share');
  cancel.onclick = function () { overlay.remove(); };
  submit.onclick = function () {
    var t = (title.value || '').trim();
    if (!t) { title.focus(); title.style.borderColor = '#e5484d'; return; }
    submit.disabled = true; submit.textContent = 'Preparing…';
    _ccRenderCover(tpl, function (cover) {
      submit.textContent = isVersion ? 'Posting…' : (review ? 'Posting…' : 'Sharing…');
      var restore = isVersion ? 'Submit update' : (review ? 'Submit for approval' : 'Share');
      var payload = {
        title: t,
        description: (desc.value || '').trim() || null,
        format: fmt,
        category: (cat.value || '').trim() || null,
        license: lic.value,
        width: tpl.canvasWidth || null,
        height: tpl.canvasHeight || null,
        doc: tpl.json,
        coverDataUrl: (cover && cover.indexOf('data:') === 0) ? cover : undefined
      };
      var done = function (err, data) {
        if (err === 401) { submit.disabled = false; submit.textContent = restore; _ccShowLoginNeeded(); return; }
        if (err === 'CONSENT_REQUIRED') { overlay.remove(); _ccOpenConsentModal(null, function () { _ccOpenShareDialog(tpl, mode); }); return; }
        if (err) { submit.disabled = false; submit.textContent = restore; if (typeof showToast === 'function') showToast((data && data.error) ? data.error : (isVersion ? 'Update failed' : 'Share failed'), 'error'); return; }
        overlay.remove();
        if (isVersion) {
          if (typeof showToast === 'function') showToast('Your update submitted for approval — once approved, the new version will be published.');
          return;
        }
        _ccMarkShared(tpl.id, data && data.template);
        if (typeof showToast === 'function') {
          var published = data && data.template && data.template.status === 'published';
          showToast(published ? 'Template published in Community 🎉' : 'Submitted for approval — will be published after review.');
        }
      };
      if (isVersion) _ccSubmitVersion(tpl.sharedTemplateId, { doc: tpl.json, coverDataUrl: payload.coverDataUrl, changelog: (desc.value || '').trim() || null }, done);
      else _ccSubmitTemplate(payload, done);
    });
  };
  actions.appendChild(cancel); actions.appendChild(submit);

  // Late-arriving moderation mode (fetched after the dialog opened) refines the button + info text.
  overlay._ccSetMode = function (m) {
    if (isVersion) return; // version submissions always go to moderation; mode text doesn't apply
    review = (m === 'review');
    if (submit.textContent === 'Share' || submit.textContent === 'Submit for approval') submit.textContent = review ? 'Submit for approval' : 'Share';
    info.textContent = (review
      ? 'This template will be submitted for approval; after an admin approves it, it will be published in the community. '
      : 'This template is published immediately in the community. ') + 'This is a separate copy from the copy in My Templates — it stays in the community even if you delete your own copy.';
  };

  box.appendChild(h);
  box.appendChild(field('Title', title));
  box.appendChild(field('Description', desc));
  box.appendChild(field('Category', cat));
  box.appendChild(field('Lisans', lic));
  box.appendChild(field('Type', fmtChip));
  box.appendChild(info);
  box.appendChild(actions);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  title.focus(); title.select();
  overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
  return overlay;
}

function _ccSubmitTemplate(payload, cb) {
  fetch(_ccApi('/templates'), {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(function (r) {
    return r.json().then(function (j) {
      if (r.ok) { cb(null, j); return; }
      if (r.status === 401) { cb(401, j); return; }
      if (j && j.code === 'CONSENT_REQUIRED') { cb('CONSENT_REQUIRED', j); return; }
      cb(r.status || 'err', j);
    }).catch(function () { cb(r.ok ? null : 'err'); });
  }).catch(function () { cb('net'); });
}

/* F7 — submit an EDIT to an already-published template as a new PENDING version (moderation). */
function _ccSubmitVersion(templateId, payload, cb) {
  fetch(_ccApi('/templates/' + encodeURIComponent(templateId) + '/version'), {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(function (r) {
    return r.json().then(function (j) {
      if (r.ok) { cb(null, j); return; }
      if (r.status === 401) { cb(401, j); return; }
      if (j && j.code === 'CONSENT_REQUIRED') { cb('CONSENT_REQUIRED', j); return; }
      cb(r.status || 'err', j);
    }).catch(function () { cb(r.ok ? null : 'err'); });
  }).catch(function () { cb('net'); });
}

/* ── One-time batch: seed the built-in system templates into the community gallery ──────────────
   The gallery had no covers for built-ins because they never went through the share pipeline. This
   runs each registry template through the EXACT SAME pipeline as "Toplulukla paylaş": render it →
   serialize its portable doc (CUSTOM_PROPS) → render a crisp cover (_ccRenderCover) → POST /templates
   (_ccSubmitTemplate). Result: built-ins become normal community templates (real cover + detail page
   + like/save/use). Owner-run once from the console: ccSeedSystemTemplates(). Creates one throwaway
   page per template — discard/reload the editor afterwards (nothing is auto-saved to your work). */
var _CC_SYS_LABEL = { card: 'Business card', logo: 'Logo', cv: 'CV', invoice: 'Invoice', socialPost: 'Social Post', story: 'Story', banner: 'Poster', emailHeader: 'Email', all: 'Template' };
window.ccSeedSystemTemplates = function (redirectWhenDone) {
  if (typeof TEMPLATE_REGISTRY === 'undefined' || typeof applyTemplate !== 'function' ||
      typeof _ccRenderCover !== 'function' || typeof _ccSubmitTemplate !== 'function') {
    if (typeof showToast === 'function') showToast('Editor must be fully loaded (registry/share not ready)', 'error');
    return;
  }
  var keys = Object.keys(TEMPLATE_REGISTRY);
  var i = 0, ok = 0, fail = 0, skip = 0;
  var _existing = {};
  function _titleFor(reg) { var label = _CC_SYS_LABEL[reg.productType] || ''; return reg.name + (label ? ' · ' + label : ''); }
  function step() {
    if (i >= keys.length) {
      if (typeof showToast === 'function') showToast('Built-in templates: ' + ok + ' added' + (skip ? (', ' + skip + ' skipped') : '') + (fail ? (', ' + fail + ' failed') : ''));
      console.info('[ccSeedSystemTemplates] done — ' + ok + ' ok, ' + skip + ' skip, ' + fail + ' fail');
      if (ok > 0) { try { localStorage.setItem('cc_sys_seeded', '1'); } catch (e) {} }
      if (redirectWhenDone && ok > 0) setTimeout(function () { window.location.href = '/templates'; }, 1600);
      return;
    }
    var key = keys[i++];
    var reg = TEMPLATE_REGISTRY[key];
    if (!reg) { fail++; step(); return; }
    if (_existing[_titleFor(reg)]) { skip++; step(); return; } // already in the gallery — idempotent re-run
    if (typeof showToast === 'function') showToast('Generating cover ' + i + '/' + keys.length + '…');
    try {
      var pt = (reg.productType && reg.productType !== 'all') ? reg.productType : null;
      if (pt && typeof setProductType === 'function') setProductType(pt); // size the page to the product
      if (typeof addPage === 'function') addPage();
      applyTemplate(key);
    } catch (e) { fail++; setTimeout(step, 60); return; }
    setTimeout(function () {
      try {
        var cvs = (typeof getActiveCanvas === 'function') ? getActiveCanvas() : canvas;
        var props = (typeof CUSTOM_PROPS !== 'undefined') ? CUSTOM_PROPS : [];
        var w = (typeof CW !== 'undefined') ? CW : 700, h = (typeof CH !== 'undefined') ? CH : 400;
        var tpl = { json: cvs.toJSON(props), canvasWidth: w, canvasHeight: h, bg: cvs.backgroundColor || '#ffffff', productType: reg.productType, thumb: '' };
        _ccRenderCover(tpl, function (cover) {
          var label = _CC_SYS_LABEL[reg.productType] || '';
          _ccSubmitTemplate({
            title: reg.name + (label ? ' · ' + label : ''),
            description: null,
            format: (typeof _ccTemplateFormat === 'function') ? _ccTemplateFormat(reg.productType) : 'single',
            category: reg.category || null,
            license: 'dika-standard',
            width: w, height: h,
            doc: tpl.json,
            coverDataUrl: (cover && cover.indexOf('data:') === 0) ? cover : undefined
          }, function (err) {
            if (err) { fail++; console.warn('[ccSeedSystemTemplates] ' + key + ' failed:', err); }
            else ok++;
            setTimeout(step, 150);
          });
        });
      } catch (e) { fail++; setTimeout(step, 60); }
    }, 320);
  }
  // Pre-accept community consent + load existing gallery titles (for idempotent re-runs), then run.
  // (Owner-triggered seeding tool: marketingConsent is required by the server since consent-flows.)
  fetch(_ccApi('/community/consent'), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ marketingConsent: true }) }).catch(function () {})
    .then(function () { return fetch('/api/templates/gallery?limit=60', { credentials: 'include' }); })
    .then(function (r) { return (r && r.ok) ? r.json() : { items: [] }; })
    .then(function (d) { (d.items || []).forEach(function (it) { if (it && it.title) _existing[it.title] = 1; }); step(); })
    .catch(function () { step(); });
};

/* Auto-run the seeder when the editor opens with ?seedSystem=1 — a one-time owner action triggered by
   a link/button (no console). Waits for the canvas + registry, seeds, then returns to /templates. A
   localStorage flag prevents accidental re-runs; ?seedSystem=force re-seeds anyway. */
function _ccBootSeedSystem() {
  var flag;
  try { flag = new URLSearchParams(window.location.search).get('seedSystem'); } catch (e) { return; }
  if (!flag) return;
  try { if (window.history && window.history.replaceState) window.history.replaceState({}, '', window.location.pathname); } catch (e) {}
  if (flag !== 'force') {
    try { if (localStorage.getItem('cc_sys_seeded') === '1') {
      if (typeof showToast === 'function') showToast('Built-in templates already loaded');
      setTimeout(function () { window.location.href = '/templates'; }, 1200);
      return;
    } } catch (e) {}
  }
  var tries = 0;
  var iv = setInterval(function () {
    tries++;
    var cvs = (typeof getActiveCanvas === 'function' && getActiveCanvas()) || (typeof canvas !== 'undefined' && canvas) || null;
    var ready = cvs && typeof TEMPLATE_REGISTRY !== 'undefined' && Object.keys(TEMPLATE_REGISTRY).length > 0 && typeof window.ccSeedSystemTemplates === 'function';
    if (ready || tries > 80) {
      clearInterval(iv);
      if (ready) window.ccSeedSystemTemplates(true);
      else if (typeof showToast === 'function') showToast('Built-in template generator could not be prepared', 'error');
    }
  }, 200);
}
if (window.cc && cc.on) cc.on('modules:ready', _ccBootSeedSystem);
else if (typeof window !== 'undefined') { setTimeout(_ccBootSeedSystem, 1200); }

/* Persist a "shared" marker on the local copy so the card shows a badge. */
function _ccMarkShared(id, template) {
  var tpl = _ccFindSaved(id);
  if (!tpl) return;
  tpl.sharedTemplateId = (template && template.id) ? template.id : (tpl.sharedTemplateId || true);
  tpl.sharedStatus = (template && template.status) ? template.status : 'published';
  tpl.sharedAt = Date.now();
  _putTemplateIDB(tpl, function () {
    // Refresh the templates panel so the "✓ Paylaşıldı" badge appears.
    if (typeof renderTemplatesPanel === 'function' && document.getElementById('flyout-tpl-grid')) {
      try { renderTemplatesPanel('flyout-tpl-grid'); return; } catch (e) {}
    }
    if (document.querySelector('#flyout-tpl-grid .tpl-card-saved') && typeof drillIntoSavedTemplates === 'function') {
      drillIntoSavedTemplates('flyout-tpl-grid');
    }
  });
}

/* Right-click menu for a saved-template card (owner's actions + Share). */
function _ccShowCardMenu(evt, tpl) {
  var ex = document.getElementById('cc-card-menu'); if (ex) ex.remove();
  var menu = document.createElement('div'); menu.id = 'cc-card-menu';
  menu.style.cssText = 'position:fixed;z-index:100000;min-width:190px;background:var(--surface,#1e1e1e);border:1px solid var(--border,#333);border-radius:10px;padding:6px;box-shadow:0 10px 30px rgba(0,0,0,0.5);font-size:13px;';
  // [lucideIcon, label, action, emphasize, danger]
  var items = [
    ['play', 'Apply', function () { applySavedTemplate(tpl.id); }, false, false],
    ['pencil', 'Rename', function () { renameSavedTemplate(tpl.id); }, false, false],
    ['download', 'Export JSON', function () { exportSavedTemplateFile(tpl.id); }, false, false],
    ['share-2', 'Share with community', function () { shareSavedTemplate(tpl.id); }, true, false],
    ['trash-2', 'Delete', function () { deleteSavedTemplate(tpl.id); }, false, true]
  ];
  items.forEach(function (it) {
    var danger = it[4], emphasize = it[3];
    var b = document.createElement('div');
    b.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;cursor:pointer;white-space:nowrap;color:' + (danger ? '#e5484d' : 'var(--text)') + ';' + (emphasize ? 'font-weight:600;' : '');
    var ic = document.createElement('span'); ic.style.cssText = 'display:inline-flex;width:16px;height:16px;flex:none;align-items:center;justify-content:center;';
    ic.innerHTML = (typeof getIcon === 'function') ? getIcon(it[0], 16) : '';
    var tx = document.createElement('span'); tx.textContent = it[1];
    b.appendChild(ic); b.appendChild(tx);
    b.onmouseenter = function () { b.style.background = 'var(--surface2,#2a2a2a)'; };
    b.onmouseleave = function () { b.style.background = 'transparent'; };
    b.onclick = function () { menu.remove(); it[2](); };
    menu.appendChild(b);
  });
  document.body.appendChild(menu);
  var x = evt.clientX, y = evt.clientY, r = menu.getBoundingClientRect();
  if (x + r.width > window.innerWidth) x = window.innerWidth - r.width - 8;
  if (y + r.height > window.innerHeight) y = window.innerHeight - r.height - 8;
  menu.style.left = x + 'px'; menu.style.top = y + 'px';
  var close = function (ev) {
    if (!menu.contains(ev.target)) {
      menu.remove();
      document.removeEventListener('mousedown', close, true);
      document.removeEventListener('contextmenu', close, true);
    }
  };
  setTimeout(function () { document.addEventListener('mousedown', close, true); document.addEventListener('contextmenu', close, true); }, 0);
}

/* ── Modular skeleton hook (Faz 2) ─────────────────────────────
   This file kept its global function declarations (renderTemplateCategoryCards,
   applyTemplate, …) — app.js openFlyout + the index.html search input still call
   them. It now loads via core/loader.js (no index.html <script>) and registers
   with cc.modules for isolation/health. mount() (re)renders the category grid. */

if (window.cc && cc.modules) cc.modules.register({ id: 'saved', parent: 'left-panel.templates', title: 'Templates: saved', mount: function () {}, unmount: function () {} });
