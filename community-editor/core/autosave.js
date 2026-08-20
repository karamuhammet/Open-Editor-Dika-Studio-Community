/* ============================================================
   dika studio – autosave.js
   Auto-save (IndexedDB via core/local-store.js), version history, restore UI.
   COMMUNITY EDITION: CCRemote is permanently inactive (core/no-server.js), so every `CCRemote.active`
   branch below is unreachable. They are left in place deliberately for now: this is the one
   subsystem where a blind deletion loses work, and the fork ledger records it as a follow-up.
   Depends on globals from app.js: canvas, CW, CH, CUSTOM_PROPS,
   histLocked, wizSettings, userInfo, selectedTpl, snap()
   Multi-page globals: pages, currentPageIndex, activeProduct,
   saveCurrentPage(), initPages(), switchPage(), renderPageTabs(),
   setProductType()
   Legacy globals (backward compat): frontJSON, backJSON, frontBG,
   backBG, currentFace, splitMode, backCanvas, dualSideEnabled
   Optional: getActiveCanvas(), disableSplitMode(), switchFace(),
   refreshStructure(), applyView(), updateSizeBadge(), syncUserInfoUI()
   ============================================================ */

(function () {
  var AUTOSAVE_MS = 30000;
  var MAX_VERSIONS = 50;
  var MAX_VERSIONS_BYTES = 4 * 1024 * 1024; // cap total serialized version history (~4MB)
  var VH_PER_PAGE = 10;
  var vhPage = 0;

  var autosaveTimerId = null;
  var editorPollId = null;
  var autosaveStarted = false;
  var savedIndicatorTimer = null;
  var _ccLastSavedFlash = 0;   // success-flash throttle (a rehydration burst must not blink "Saved" every second)
  // ROLLED BACK (owner directive 2026-07-10 "eski koddan mantığı bul"): the C3
  // dirty-flag/struct-signature SAVE GATES are removed. In the owner's real
  // environment their interplay with the boot restore produced save/revert
  // cycles worse than the multi-tab risk they guarded against. Remote saves
  // flow unconditionally again (pre-scan semantics); the server keeps the
  // pre-scan shields (payload-timestamp regression + content-collapse + CAS).
  // Multi-tab stale-write protection is to be REDESIGNED deliberately
  // (lease/websocket) post-alpha, not patched into the save path.

  // Remote mode: version snapshots are scoped PER DESIGN. The single shared
  // key let the version modal restore ANOTHER design's snapshot over the
  // current one (scan-3000 C4). Standalone keeps the legacy shared key.
  function serializationProps() {
    return typeof CUSTOM_PROPS !== 'undefined' && CUSTOM_PROPS ? CUSTOM_PROPS : [];
  }

  /** Sync frontJSON/backJSON/frontBG/backBG from live canvases (handles split mode + current face). */
  function syncSnapshotFromEditor() {
    var props = serializationProps();
    if (typeof splitMode !== 'undefined' && splitMode && typeof backCanvas !== 'undefined' && backCanvas) {
      frontJSON = canvas.toJSON(props);
      frontBG = canvas.backgroundColor;
      backJSON = backCanvas.toJSON(props);
      backBG = backCanvas.backgroundColor;
      return;
    }
    if (typeof currentFace === 'string' && currentFace === 'back') {
      backJSON = canvas.toJSON(props);
      backBG = canvas.backgroundColor;
    } else {
      frontJSON = canvas.toJSON(props);
      frontBG = canvas.backgroundColor;
    }
  }

  function ensureSingleCanvasMode() {
    if (typeof splitMode !== 'undefined' && splitMode && typeof disableSplitMode === 'function') {
      disableSplitMode();
    }
  }

  function qrNormalizeObjects(cvs) {
    if (!cvs || !cvs.getObjects) return;
    cvs.getObjects().forEach(function (obj) {
      if (obj.qrUrl || obj.isQR) {
        obj.isQR = true;
        obj.qrUrl = obj.qrUrl || 'https://example.com';
        obj.qrFg = obj.qrFg || '#000000';
        obj.qrBg = obj.qrBg || '#ffffff';
      }
    });
  }

  function formatAutoLabel(ts) {
    var d = new Date(ts);
    var h = d.getHours();
    var m = d.getMinutes();
    return 'Auto-save ' + (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  /* COMMUNITY EDITION: version history lives in IndexedDB (core/local-store.js), not localStorage.
     The 5 MB localStorage quota was measured FULL on a real machine, most of it exactly this data,
     and with no server behind us a rejected write is lost work rather than a lost convenience. */
  function getVersions() {
    return window.CCLocalStore ? CCLocalStore.getVersions() : [];
  }

  function setVersions(arr) {
    if (window.CCLocalStore) CCLocalStore.setVersions(arr);
  }

  function pushVersionSnapshot(entry) {
    var arr = getVersions();
    arr.unshift(entry);
    if (arr.length > MAX_VERSIONS) arr = arr.slice(0, MAX_VERSIONS);
    // Cap total serialized size: each entry holds full page JSON, so the count cap alone
    // can still blow past the localStorage quota on heavy designs. Drop oldest entries
    // (tail) until the serialized array is under MAX_VERSIONS_BYTES, always keeping at
    // least the newest entry.
    while (arr.length > 1 && JSON.stringify(arr).length > MAX_VERSIONS_BYTES) {
      arr.pop();
    }
    setVersions(arr);
  }

  function pageToPayload(p) {
    // Page-sleep v2: a slept page's json is parked in IndexedDB. _psJsonForSave returns it
    // when available synchronously (transient copy, or a prefetchForSave save-map for
    // remote/file exports); otherwise this page serializes as a MARKER
    // (json:null + _slept/_sleptKey) - valid ONLY for same-browser localStorage docs,
    // where IndexedDB holds the content. Remote/file callers MUST prefetch first.
    var _pj = (typeof _psJsonForSave === 'function') ? _psJsonForSave(p) : p.json;
    return {
      json: _pj ? JSON.parse(JSON.stringify(_pj)) : null,
      _slept: (p._slept && !_pj) ? true : undefined,
      _sleptKey: (p._slept && !_pj) ? (p._sleptKey || null) : undefined,
      _psObjCount: p._psObjCount || undefined,
      bg: p.bg,
      label: p.label,
      w: p.w,
      h: p.h,
      _isBoard: p._isBoard,
      _isWfBoard: p._isWfBoard,
      _pageId: p._pageId || null,
      groupId: p.groupId || null,
      _productType: p._productType || null,
      _pageDesignNote: p._pageDesignNote || '',
      _bbRowKey: p._bbRowKey || null,   // bulk-builder row identity (in-place re-run, P1 2026-07-18)
      /* Comments, and ONLY for a standalone document. Since P1 of
         docs/editor-comments-enterprise-plan.md a design opened with ?designId= keeps its comments in
         `design_comment` rows, so writing them into the document too would be a second copy that
         immediately drifts (the row can change while this tab holds a stale array, and the document
         would then "win" on the next save). A standalone editor has no such table and localStorage IS
         the store, so there the key must be written or a comment is lost on reload, which is exactly
         what happened before P0. One store, chosen by whether the design is a real row. */
      comments: (window.CCRemote && window.CCRemote.active)
        ? undefined
        : (Array.isArray(p.comments) && p.comments.length ? JSON.parse(JSON.stringify(p.comments)) : undefined),
      _slideDeck: p._slideDeck ? JSON.parse(JSON.stringify(p._slideDeck)) : null,
      _videoProject: p._videoProject ? JSON.parse(JSON.stringify(p._videoProject)) : null,
      // Frame-canvas scene model (frames[].json + world + freeElements). saveCurrentPage() already ran
      // _scSerializeWorld for the active scene page, so _scene holds plain JSON (no live fabric refs).
      // Deep-cloned like _slideDeck/_videoProject so version snapshots don't share the live ref.
      _scene: p._scene ? JSON.parse(JSON.stringify(p._scene)) : null,
    };
  }

  function normalizeRestoredPage(p, data) {
    var fallbackW = data.CW != null ? data.CW : typeof CW !== 'undefined' ? CW : 700;
    var fallbackH = data.CH != null ? data.CH : typeof CH !== 'undefined' ? CH : 400;
    return {
      json: p.json,
      bg: p.bg,
      label: p.label || 'Page',
      w: p.w != null ? p.w : fallbackW,
      h: p.h != null ? p.h : fallbackH,
      _isBoard: p._isBoard,
      _isWfBoard: p._isWfBoard,
      _pageId: p._pageId || null,
      groupId: p.groupId || null,
      _productType: p._productType || null,
      _pageDesignNote: p._pageDesignNote || '',
      _bbRowKey: p._bbRowKey || null,   // bulk-builder row identity (in-place re-run, P1 2026-07-18)
      _slept: p._slept || undefined,    // page-sleep marker survives restore (IDB holds the content)
      _sleptKey: p._slept ? (p._sleptKey || null) : undefined,
      _psObjCount: p._psObjCount || undefined,
      comments: Array.isArray(p.comments) ? p.comments : undefined,  // the inverse of pageToPayload above
      _slideDeck: p._slideDeck ? JSON.parse(JSON.stringify(p._slideDeck)) : null,
      _videoProject: p._videoProject ? JSON.parse(JSON.stringify(p._videoProject)) : null,
      _scene: p._scene ? JSON.parse(JSON.stringify(p._scene)) : null,
    };
  }

  // Restore the shared/tags G0 state from an autosave payload. Writes the globals IN PLACE — created
  // here if the tags module hasn't loaded yet, then picked up by `global.ccTags || (global.ccTags = [])`
  // on its load (order-independent). Standalone (not inlined in restoreV2Payload) so it round-trips even
  // when the full page-restore can't run — e.g. a scene project whose _scene isn't serialized yet.
  function applyRestoredTags(data) {
    if (!data) return;
    if (Array.isArray(data.tags)) {
      window.ccTags = window.ccTags || [];
      window.ccTags.length = 0;
      data.tags.forEach(function (t) { window.ccTags.push(t); });
    }
    if (Array.isArray(data.tagGroups)) {
      window.ccTagGroups = window.ccTagGroups || [];
      window.ccTagGroups.length = 0;
      data.tagGroups.forEach(function (g) { window.ccTagGroups.push(g); });
    }
    if (data.tagAssignments && typeof data.tagAssignments === 'object') {
      window.ccTagAssignments = window.ccTagAssignments || {};
      var ta = window.ccTagAssignments;
      for (var k in ta) if (ta.hasOwnProperty(k)) delete ta[k];
      for (var k2 in data.tagAssignments) if (data.tagAssignments.hasOwnProperty(k2)) ta[k2] = data.tagAssignments[k2].slice();
    }
    if (Array.isArray(data.tagViews)) {
      window.tagViews = window.tagViews || [];
      window.tagViews.length = 0;
      data.tagViews.forEach(function (v) { window.tagViews.push(v); });
    }
    if (Array.isArray(data.tagCollections)) {
      window.tagCollections = window.tagCollections || [];
      window.tagCollections.length = 0;
      data.tagCollections.forEach(function (v) { window.tagCollections.push(v); });
    }
    if (Array.isArray(data.tagRules)) {
      window.ccTagRules = window.ccTagRules || [];
      window.ccTagRules.length = 0;
      data.tagRules.forEach(function (r) { window.ccTagRules.push(r); });
    }
    if (data.tagMeta && typeof data.tagMeta === 'object') {
      window.ccTagMeta = window.ccTagMeta || {};
      var tm = window.ccTagMeta;
      for (var mk in tm) if (tm.hasOwnProperty(mk)) delete tm[mk];
      for (var mk2 in data.tagMeta) if (data.tagMeta.hasOwnProperty(mk2)) tm[mk2] = data.tagMeta[mk2];
    }
    if (typeof cc !== 'undefined' && cc.emit) cc.emit('tags:changed', {});
  }

  function buildAutosavePayload() {
    if (typeof saveCurrentPage === 'function') saveCurrentPage();

    var pagesData = [];
    if (typeof pages !== 'undefined' && Array.isArray(pages)) {
      pagesData = pages.map(pageToPayload);
    } else {
      syncSnapshotFromEditor();
      pagesData = [{ json: frontJSON, bg: frontBG || '#0d0d0d', label: 'Front' }];
      if (typeof dualSideEnabled !== 'undefined' && dualSideEnabled) {
        pagesData.push({ json: backJSON, bg: backBG || '#1a1a2e', label: 'Back' });
      }
    }

    return {
      version: 2,
      activeProduct: typeof activeProduct !== 'undefined' ? activeProduct : 'card',
      pages: pagesData,
      pageGroups: typeof pageGroups !== 'undefined' ? pageGroups : [],
      tags: typeof ccTags !== 'undefined' ? ccTags : [],
      tagGroups: typeof ccTagGroups !== 'undefined' ? ccTagGroups : [],
      tagAssignments: typeof ccTagAssignments !== 'undefined' ? ccTagAssignments : {},
      tagViews: typeof tagViews !== 'undefined' ? tagViews : [],
      tagCollections: typeof tagCollections !== 'undefined' ? tagCollections : [],
      tagRules: typeof ccTagRules !== 'undefined' ? ccTagRules : [],
      tagMeta: typeof ccTagMeta !== 'undefined' ? ccTagMeta : {},
      CW: typeof CW !== 'undefined' ? CW : 700,
      CH: typeof CH !== 'undefined' ? CH : 400,
      timestamp: Date.now(),
      currentPageIndex: typeof currentPageIndex !== 'undefined' ? currentPageIndex : 0,
      wizSettings: typeof wizSettings !== 'undefined' ? Object.assign({}, wizSettings) : {},
      userInfo: typeof userInfo !== 'undefined' ? Object.assign({}, userInfo) : {},
      template: typeof selectedTpl !== 'undefined' ? selectedTpl : 'noir',
    };
  }

  function persistAutosave(payload) {
    /* COMMUNITY EDITION: one destination, this browser. The remote branch is gone with the API
       adapter, and the "storage full -> throw away the version history and retry" dance is gone too:
       the store caps history by bytes on the way in, and a real failure is REPORTED with numbers
       instead of being absorbed. "Saved" is the one word here that must never be a guess. */
    if (!window.CCLocalStore) return false;
    return CCLocalStore.writeDoc(payload);
  }

  function showSavedIndicator() {
    var el = document.getElementById('dika-saved-indicator');
    if (!el) return;
    el.style.opacity = '1';
    clearTimeout(savedIndicatorTimer);
    savedIndicatorTimer = setTimeout(function () {
      el.style.opacity = '0';
    }, 1600);
  }

  function showSaveErrorIndicator(msg, persistent) {
    ensureSavedIndicator();
    var el = document.getElementById('dika-saved-indicator');
    if (!el) return;
    el.textContent = msg;
    el.style.color = '#ff6b6b';
    el.style.opacity = '1';
    clearTimeout(savedIndicatorTimer);
    if (!persistent) {
      savedIndicatorTimer = setTimeout(function () {
        el.style.opacity = '0';
        el.textContent = 'Saved';
        el.style.color = 'rgba(255,255,255,0.45)';
      }, 4000);
    }
  }

  // Honest remote-save state (scan-3000 H22): storage-remote reports every real
  // flush outcome here. Success clears the dirty flag + shows Saved; a network
  // failure shows a transient error; a 409 conflict shows a PERSISTENT banner
  // (that tab's writes are stopped, silent-green would be a lie).
  if (typeof window !== 'undefined') {
    window._ccRemoteSaveResult = function (ok, isConflicted, message) {
      if (ok) {
        // Throttle the success flash: post-load rehydration (fonts, charts,
        // video posters) legitimately triggers a burst of flushes, and a
        // "Saved" blinking every second reads as the app misbehaving.
        if (Date.now() - _ccLastSavedFlash < 10000) return;
        _ccLastSavedFlash = Date.now();
        ensureSavedIndicator();
        var el = document.getElementById('dika-saved-indicator');
        if (el) { el.textContent = 'Saved'; el.style.color = 'rgba(255,255,255,0.45)'; }
        showSavedIndicator();
        return;
      }
      if (isConflicted) showSaveErrorIndicator('Save halted: design updated elsewhere, refresh with F5', true);
      else if (message) showSaveErrorIndicator(message, false);
      else showSaveErrorIndicator('Could not save — connection problem', false);
    };
  }

  function ensureSavedIndicator() {
    var existing = document.getElementById('dika-saved-indicator');
    if (existing) return;
    var topbar = document.getElementById('topbar');
    if (!topbar) return;
    var el = document.createElement('span');
    el.id = 'dika-saved-indicator';
    el.className = 'dika-saved-indicator';
    el.textContent = 'Saved';
    el.setAttribute('aria-live', 'polite');
    el.style.cssText =
      'font-size:11px;font-weight:500;letter-spacing:0.02em;color:rgba(255,255,255,0.45);' +
      'opacity:0;transition:opacity 0.45s ease;margin-right:8px;pointer-events:none;white-space:nowrap;';
    var spacer = topbar.querySelector('.spacer');
    if (spacer) topbar.insertBefore(el, spacer);
    else topbar.appendChild(el);
  }

  // A save must NEVER run while a canvas is mid-rebuild — the canvas is momentarily empty/half-built and
  // serializing it would overwrite the good page/doc. histLocked covers classic + scene loads; the VIDEO
  // editor guards its async canvas swaps (deactivate/activate/restore loadFromJSON) with its OWN private
  // flag VE._veRestoring, which the save path must ALSO honor — otherwise a save landing in a video page
  // transition serializes an empty canvas over the page → the intermittent "all pages reset" total loss.
  var _ccRemoteRestoreDone = false;   // remote mode: NO persist may run before the initial doc load settles (boot-window wipe fix)
  /* COMMUNITY EDITION: the same gate for the LOCAL path, and it is not optional. Measured on this
     build: the autosave timer starts while the canvas is still empty, the restore lands a second
     later, and the empty save had already overwritten the project (1771 bytes -> 765, the work gone).
     `_ccPersistAllowed` cannot catch it, because its baseline `_ccLastGoodScore` starts at 0 on a
     fresh load, so empty-over-empty looks like no collapse at all. Saves stay suspended until the
     restore settles, exactly like the remote path. */
  var _ccLocalRestoreDone = false;
  function _ccSuspendReason() {
    // 'workspace': the active workspace was changed in ANOTHER TAB (they share one session row), so every
    // request from this tab is now aimed at a workspace this document does not live in. Saving would either
    // 404 forever with nobody told, or land new content in the wrong company's library. Pausing keeps the
    // document in memory, untouched, until the person picks one; modules/system/org-guard owns the bar that
    // asks. It is deliberately FIRST: nothing below it matters while the target is wrong.
    try {
      if (typeof window !== 'undefined' && window.CCOrgGuard && window.CCOrgGuard.blocked()) return 'workspace';
    } catch (e) { /* the guard must never be able to take saving down */ }
    // 'restore': the design's doc hasn't been loaded yet — saves armed at ~0.4s but the restore lands seconds
    // later; anything persisted in that window is the boot-default empty page OVER the good doc (the F5 wipe).
    if (typeof window !== 'undefined' && window.CCRemote && window.CCRemote.active && !_ccRemoteRestoreDone) return 'restore';
    if (!_ccLocalRestoreDone) return 'restore';
    if (typeof histLocked !== 'undefined' && histLocked) return 'transition';
    var _VE = window.__ccVideoEditor;
    // _veRestoring: video's own async canvas-swap flag; _veSwitching: set by switchPage across the WHOLE
    // lazy video activate window (the internal _veReset/_veRestore toggles _veRestoring off mid-way, so a
    // dedicated switch flag is needed to cover the activate's canvas.clear() too).
    if (_VE && (_VE._veRestoring || _VE._veSwitching)) return 'transition';
    return null;
  }
  function _ccSaveSuspended() { return !!_ccSuspendReason(); }
  // Co-editing owns remote persistence. Direct browser autosaves would race the relay's page-room
  // merge and turn the last tab to tick into an accidental second writer. A shared view still keeps
  // __ccGuestView for its no-copy guarantee; an editable collaborator asks this same elected writer.
  function _ccCoeditActive() {
    try { return !!(window.CCCoEdit && typeof window.CCCoEdit.active === 'function' && window.CCCoEdit.active()); }
    catch (e) { return false; }
  }
  function _ccRequestCoeditFlush(manual) {
    try {
      if (window.CCCoEdit && typeof window.CCCoEdit.requestFlush === 'function') return window.CCCoEdit.requestFlush(!!manual);
    } catch (e) {}
    return Promise.resolve({ ok: false, reason: 'coedit-unavailable' });
  }
  // Watchdog: a transition flag stuck true (a throw inside a loadFromJSON callback, a wedged media enliven)
  // silently disables ALL saves forever while the UI keeps saying "Saved". Force-clear after 12s and say so.
  // ('restore' is excluded — that gate is lifted by the load's own retry path, never by force.)
  var _ccSuspSince = 0;
  setInterval(function () {
    var r = _ccSuspendReason();
    if (r !== 'transition') { _ccSuspSince = 0; return; }
    if (!_ccSuspSince) { _ccSuspSince = Date.now(); return; }
    if (Date.now() - _ccSuspSince < 12000) return;
    _ccSuspSince = 0;
    try {
      if (typeof histLocked !== 'undefined') histLocked = false;
      var _VE = window.__ccVideoEditor;
      if (_VE) { _VE._veRestoring = false; _VE._veSwitching = false; }
      if (typeof console !== 'undefined') console.error('[dika studio] save suspension stuck >12s — force-cleared');
      if (typeof showToast === 'function') showToast('Save lock hung — automatically released', 'error');
    } catch (e) {}
  }, 3000);

  // ── Don't-regress guard (never lose data, Canva/Figma-style) ──
  // Belt-and-suspenders beyond the transition guards: a save must NEVER overwrite a good doc with a suddenly
  // EMPTY one. Score the payload's total content (objects + frames + clips + slides); if it collapses to
  // (near) zero while we had content, SKIP the persist and keep the good doc. A GENUINE "clear everything"
  // still goes through after a few consecutive collapses, so real deletes aren't permanently blocked.
  var _ccLastGoodScore = 0, _ccEmptyStreak = 0;
  function _ccContentScore(payload) {
    var n = 0, pgs = (payload && payload.pages) || [];
    for (var i = 0; i < pgs.length; i++) {
      var p = pgs[i] || {};
      if (p.json && p.json.objects) n += p.json.objects.length;
      else if (p._slept && p._psObjCount) n += p._psObjCount;   // page-sleep marker: count the parked objects, or the collapse shield would block every save
      if (p._scene) { if (p._scene.frames) n += p._scene.frames.length; if (p._scene.freeElements) n += p._scene.freeElements.length; }
      if (p._videoProject && p._videoProject.tracks) for (var t = 0; t < p._videoProject.tracks.length; t++) n += ((p._videoProject.tracks[t] || {}).clips || []).length;
      if (p._slideDeck && p._slideDeck.slides) n += p._slideDeck.slides.length;
    }
    return n;
  }
  function _ccPersistAllowed(payload) {
    var score = _ccContentScore(payload);
    var collapsed = (score === 0 && _ccLastGoodScore > 0) || (_ccLastGoodScore >= 5 && score <= _ccLastGoodScore * 0.2);
    if (collapsed) {
      // NEVER auto-persist a collapse. (The old 3-strike escape let a stuck-empty editor legitimize its own
      // wipe within ~90s — DB forensics showed exactly that.) A genuine clear-everything only goes up via
      // MANUAL save, which asks the user and sends force (saveProjectNow).
      if (typeof console !== 'undefined') console.warn('[dika studio] autosave blocked: content collapsed (' + _ccLastGoodScore + ' -> ' + score + ')');
      return false;
    }
    _ccEmptyStreak = 0;
    _ccLastGoodScore = score;   // re-baseline to the accepted score (so later normal edits aren't flagged)
    return true;
  }

  function performAutoSave() {
    if (typeof canvas === 'undefined' || !canvas || !canvas.toJSON) return;
    // Read-only viewing of someone else's project (?view= guest link / ?shared= grant): never persist.
    // Without this the owner's document would land in the viewer's localStorage (clobbering their own
    // standalone work) and, with a designId present, in their account (collaboration-sharing-plan R7:
    // a share is a permission, never a copy).
    if (window.__ccGuestView) return;
    if (_ccCoeditActive()) { _ccRequestCoeditFlush(false); return; }
    // Page-sleep: the 30s tick doubles as the awake-budget watchdog, catching any page
    // creation path that slipped past the explicit evict hooks.
    if (typeof _psEvictIfNeeded === 'function') { try { _psEvictIfNeeded(); } catch (e) {} }
    if (document.hidden) return;   // background tab: its state may be STALE vs another tab on the same design — never tick-save it (flushSaveNow already ran at hide)
    // Don't persist while a page is loading (switchPage's loadFromJSON sets histLocked);
    // the canvas is half-populated and saving it would overwrite the real page.
    if (_ccSaveSuspended()) return;
    // Page-sleep: a REMOTE save must ship the FULL doc (cross-device; a marker doc must
    // never reach the server). Prefetch slept jsons from IndexedDB, then re-run.
    if (typeof CCPageSleep !== 'undefined' && CCPageSleep.hasSlept() &&
        typeof window !== 'undefined' && window.CCRemote && window.CCRemote.active && !CCPageSleep._prefetched) {
      CCPageSleep.prefetchForSave(function () {
        CCPageSleep._prefetched = true;
        try { performAutoSave(); } finally { CCPageSleep._prefetched = false; CCPageSleep.releaseSaveMap(); }
      });
      return;
    }
    var payload = buildAutosavePayload();
    if (!_ccPersistAllowed(payload)) return;   // don't-regress: skip a save that would wipe the doc
    var _saved = persistAutosave(payload);
    pushVersionSnapshot({
      version: 2,
      activeProduct: payload.activeProduct,
      pages: payload.pages,
      CW: payload.CW,
      CH: payload.CH,
      currentPageIndex: payload.currentPageIndex,
      wizSettings: payload.wizSettings,
      userInfo: payload.userInfo,
      template: payload.template,
      timestamp: payload.timestamp,
      label: formatAutoLabel(payload.timestamp),
    });
    ensureSavedIndicator();
    // Remote mode returns 'pending': the indicator is driven by the REAL flush
    // outcome via _ccRemoteSaveResult (H22), never by assumption.
    if (_saved === true) showSavedIndicator();
  }

  /** Manual save. In remote (DB) mode this is an IMMEDIATE, NAMED restore point: flush the doc now
      (not the ~1.2s debounce) AND create a version, so a manual save is a distinct save point in the
      portal — not just the rolling autosave doc. Standalone keeps the local snapshot + version entry. */
  function saveProjectNow(_retry) {
    // Manual save must ALSO honor the transition guard — a click landing mid video restore/switch would
    // otherwise build a payload from a half-restored state (the one save path that skipped this check).
    // Defer + retry so the save still lands once the transition settles, instead of faking a "Saved".
    var _susp = _ccSuspendReason();
    if (_susp) {
      // A WORKSPACE mismatch never settles by waiting: it needs a decision, and the org-guard bar is
      // already asking for one. Retrying twenty times and then saying "document still loading/busy"
      // would be five seconds of nothing followed by a sentence about the wrong problem.
      if (_susp === 'workspace') {
        if (typeof showToast === 'function') showToast('Saving is paused: the workspace was changed in another tab. Use the bar at the top to switch back.', 'error');
        return;
      }
      if ((_retry || 0) < 20) setTimeout(function () { saveProjectNow((_retry || 0) + 1); }, 250);
      else if (typeof showToast === 'function') showToast('Could not save — document still loading/busy, try again shortly', 'error');
      return;
    }
    if (_ccCoeditActive()) {
      var cr = _ccRequestCoeditFlush(true);
      if (cr && cr.then) cr.then(function (result) {
        if (result && result.ok) {
          ensureSavedIndicator(); showSavedIndicator();
          if (typeof showToast === 'function') showToast('Shared changes saved');
        } else if (result && result.queued) {
          if (typeof showToast === 'function') showToast('Save requested from the active writer');
        } else if (typeof showToast === 'function') {
          showToast('Could not save shared changes — check collaboration connection', 'error');
        }
      });
      return;
    }
    if (typeof window !== 'undefined' && window.CCRemote && window.CCRemote.active) {
      // Page-sleep: manual save must also ship the FULL doc (see performAutoSave).
      if (typeof CCPageSleep !== 'undefined' && CCPageSleep.hasSlept() && !CCPageSleep._prefetched) {
        CCPageSleep.prefetchForSave(function () {
          CCPageSleep._prefetched = true;
          try { saveProjectNow(_retry); } finally { CCPageSleep._prefetched = false; CCPageSleep.releaseSaveMap(); }
        });
        return;
      }
      var payload = buildAutosavePayload();
      var score = _ccContentScore(payload);
      var collapsed = (score === 0 && _ccLastGoodScore > 0) || (_ccLastGoodScore >= 5 && score <= _ccLastGoodScore * 0.2);
      var force = false;
      if (collapsed) {
        // The ONLY legitimate path for a wipe-sized save: the user explicitly confirms it (autosave never can).
        var okc = window.confirm('Document appears empty/too small (' + score + ' item; previous ~' + _ccLastGoodScore + '). Save it anyway?');
        if (!okc) { if (typeof showToast === 'function') showToast('Save canceled', 'error'); return; }
        force = true;
      }
      _ccLastGoodScore = score; _ccEmptyStreak = 0;
      try {
        var pr = window.CCRemote.saveNow ? window.CCRemote.saveNow(payload, force ? { force: true } : undefined) : null;
        ensureSavedIndicator();
        var onOk = function () {
          showSavedIndicator();
          if (typeof showToast === 'function') showToast('Saved');
          if (window.CCRemote.createVersion) window.CCRemote.createVersion('Manual save');
        };
        if (pr && pr.then) {
          // Truthful Saved: only after the PATCH actually resolved OK (flush resolves false on failure/409).
          pr.then(function (ok2) {
            if (ok2 === false) { if (typeof showToast === 'function') showToast('Could not save — check connection/other tabs', 'error'); return; }
            onOk();
          }, function () { if (typeof showToast === 'function') showToast('Could not save — check connection', 'error'); });
        } else {
          onOk();
        }
      } catch (e) {}
      return;
    }
    performAutoSave();
    /* The wording is the promise. "Saved" would be a claim about somewhere safe; this build
       saves into one browser profile, and clearing site data deletes it. */
    if (typeof showToast === 'function') showToast('Saved in this browser');
  }

  function readAutosave() {
    return window.CCLocalStore ? CCLocalStore.readDoc() : null;
  }

  function applyDimensionsFromPayload(data) {
    if (!data) return;
    if (data.CW) CW = data.CW;
    if (data.CH) CH = data.CH;
    if (canvas && canvas.setWidth && canvas.setHeight) {
      canvas.setWidth(CW);
      canvas.setHeight(CH);
    }
    if (data.wizSettings && typeof wizSettings !== 'undefined') {
      if (data.wizSettings.orientation) wizSettings.orientation = data.wizSettings.orientation;
      if (data.wizSettings.corners) wizSettings.corners = data.wizSettings.corners;
      if (data.wizSettings.sides) wizSettings.sides = data.wizSettings.sides;
    }
    if (typeof dualSideEnabled !== 'undefined' && data.dualSideEnabled !== undefined) {
      dualSideEnabled = data.dualSideEnabled;
    }
    var faceBar = document.getElementById('face-tabs-bar');
    if (faceBar) faceBar.style.display = dualSideEnabled ? '' : 'none';
    if (typeof setCardCorners === 'function' && data.wizSettings && data.wizSettings.corners) {
      setCardCorners(data.wizSettings.corners);
    }
    var orientH = document.getElementById('orient-h');
    var orientV = document.getElementById('orient-v');
    if (orientH && orientV && data.wizSettings) {
      orientH.classList.toggle('active', data.wizSettings.orientation === 'horizontal');
      orientV.classList.toggle('active', data.wizSettings.orientation === 'vertical');
    }
    if (typeof applyView === 'function') applyView();
    if (typeof updateSizeBadge === 'function') updateSizeBadge();
  }

  /**
   * Load snapshot onto the main canvas and globals (front/back JSON + BG).
   * @param {object} snap - { frontJSON, backJSON, frontBG, backBG }
   * @param {string} [face] - 'front' | 'back'
   */
  function restoreCardSnapshot(snapData, face) {   // param was 'snap' — it SHADOWED the global snap() so the
    if (!snapData || typeof canvas === 'undefined' || !canvas) return;   // history-snapshot calls below never fired
    ensureSingleCanvasMode();

    frontJSON = snapData.frontJSON;
    backJSON = snapData.backJSON;
    frontBG = snapData.frontBG != null ? snapData.frontBG : '#0d0d0d';
    backBG = snapData.backBG != null ? snapData.backBG : '#1a1a2e';

    var targetFace = face || (typeof currentFace === 'string' ? currentFace : 'front');
    if (targetFace !== 'front' && targetFace !== 'back') targetFace = 'front';

    var json = targetFace === 'back' ? backJSON : frontJSON;
    var bg = targetFace === 'back' ? backBG : frontBG;

    currentFace = targetFace;

    var tabFront = document.getElementById('tab-front');
    var tabBack = document.getElementById('tab-back');
    var tabSplit = document.getElementById('tab-split');
    if (tabFront) tabFront.classList.toggle('active', targetFace === 'front');
    if (tabBack) tabBack.classList.toggle('active', targetFace === 'back');
    if (tabSplit) tabSplit.classList.remove('active');

    if (typeof updateCanvasLabel === 'function') updateCanvasLabel();

    if (!json) {
      canvas.clear();
      canvas.setBackgroundColor(bg, canvas.renderAll.bind(canvas));
      if (typeof snap === 'function') snap();
      if (typeof refreshStructure === 'function') refreshStructure();
      return;
    }

    histLocked = true;
    canvas.loadFromJSON(json, function () {
      window._rehydrateCanvasVideoMedia(canvas, function () {
        canvas.backgroundColor = bg;
        qrNormalizeObjects(canvas);
        canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
        if (typeof canvas.setZoom === 'function') canvas.setZoom(1);
        canvas.renderAll();
        histLocked = false;
        if (typeof snap === 'function') snap();
        if (typeof refreshStructure === 'function') refreshStructure();
      });
      if (typeof applyView === 'function') applyView();
    });
  }

  /** Restore a v2 (multi-page/multi-product) payload. */
  function restoreV2Payload(data) {
    var product = data.activeProduct || 'card';
    if (typeof setProductType === 'function') {
      setProductType(product);
    } else if (typeof activeProduct !== 'undefined') {
      activeProduct = product;
    }

    if (data.CW) CW = data.CW;
    if (data.CH) CH = data.CH;
    if (canvas && canvas.setWidth && canvas.setHeight) {
      canvas.setWidth(CW);
      canvas.setHeight(CH);
    }

    if (data.wizSettings && typeof wizSettings !== 'undefined') {
      Object.assign(wizSettings, data.wizSettings);
      if (typeof setCardCorners === 'function' && wizSettings.corners) {
        setCardCorners(wizSettings.corners);
      }
    }

    if (data.userInfo && typeof userInfo !== 'undefined') Object.assign(userInfo, data.userInfo);
    if (data.template && typeof selectedTpl !== 'undefined') selectedTpl = data.template;
    if (typeof syncUserInfoUI === 'function') syncUserInfoUI();

    if (typeof pages !== 'undefined' && Array.isArray(data.pages)) {
      pages.length = 0;
      data.pages.forEach(function (p) {
        pages.push(normalizeRestoredPage(p, data));
      });
    }

    // Restore page groups
    if (Array.isArray(data.pageGroups) && typeof pageGroups !== 'undefined') {
      pageGroups.length = 0;
      data.pageGroups.forEach(function (g) { pageGroups.push(g); });
      if (typeof _pgNextGroupId !== 'undefined') {
        _pgNextGroupId = pageGroups.reduce(function (mx, g) {
          var n = parseInt((g.id || '').replace('grp-', ''), 10);
          return isNaN(n) ? mx : Math.max(mx, n + 1);
        }, _pgNextGroupId);
      }
    }

    applyRestoredTags(data);   // shared/tags G0

    if (typeof renderPageTabs === 'function') renderPageTabs();
    var targetPage = data.currentPageIndex || 0;
    currentPageIndex = -1;
    if (typeof switchPage === 'function') switchPage(targetPage, true);

    if (typeof applyView === 'function') applyView();
    if (typeof updateSizeBadge === 'function') updateSizeBadge();
  }

  function restoreFromAutosavePayload(data) {
    if (!data) return;
    // Baseline the don't-regress guard to what we just LOADED — so a save racing the async page rebuild
    // right after load can't wipe the doc (it would collapse below this score and be skipped).
    _ccLastGoodScore = _ccContentScore(data); _ccEmptyStreak = 0;

    var landing = document.getElementById('landing');
    if (landing) landing.classList.add('hidden');
    var wiz = document.getElementById('wizard');
    if (wiz) wiz.classList.add('hidden');

    if (data.version === 2 && data.pages) {
      restoreV2Payload(data);
      return;
    }

    // Legacy format: front/back JSON
    applyDimensionsFromPayload(data);
    if (data.userInfo && typeof userInfo !== 'undefined') Object.assign(userInfo, data.userInfo);
    if (data.template && typeof selectedTpl !== 'undefined') selectedTpl = data.template;
    if (typeof syncUserInfoUI === 'function') syncUserInfoUI();

    var face = data.currentFace === 'back' ? 'back' : 'front';
    restoreCardSnapshot(
      {
        frontJSON: data.frontJSON,
        backJSON: data.backJSON,
        frontBG: data.frontBG,
        backBG: data.backBG,
      },
      face
    );
  }

  function clearAutosaveStorage() {
    if (window.CCLocalStore) CCLocalStore.clearDoc();
  }

  // ── Version history modal ─────────────────────────────────
  function ensureVersionHistoryModal() {
    if (document.getElementById('version-history-modal')) return;

    var modal = document.createElement('div');
    modal.id = 'version-history-modal';
    modal.className = 'version-history-modal';
    modal.style.cssText =
      'display:none;position:fixed;inset:0;z-index:5000;align-items:center;justify-content:center;' +
      'background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);';

    var panel = document.createElement('div');
    panel.className = 'version-history-panel';
    panel.style.cssText =
      'width:min(420px,92vw);max-height:min(80vh,700px);display:flex;flex-direction:column;' +
      'background:var(--surface, #141418);border:1px solid var(--border, #2a2a30);' +
      'border-radius:12px;box-shadow:0 24px 48px rgba(0,0,0,0.45);overflow:hidden;';

    var head = document.createElement('div');
    head.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;padding:14px 16px;' +
      'border-bottom:1px solid var(--border, #2a2a30);';
    var title = document.createElement('div');
    title.textContent = 'Version history';
    title.style.cssText = 'font-size:15px;font-weight:600;color:var(--text, #fff);';
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText =
      'background:transparent;border:1px solid var(--border, #2a2a30);color:var(--text-muted, #888);' +
      'padding:6px 12px;border-radius:8px;cursor:pointer;font-size:12px;';
    closeBtn.onclick = function () {
      modal.style.display = 'none';
    };
    head.appendChild(title);
    head.appendChild(closeBtn);

    var listWrap = document.createElement('div');
    listWrap.id = 'version-history-list';
    listWrap.style.cssText =
      'flex:1;overflow-y:auto;padding:8px 12px 12px;display:flex;flex-direction:column;gap:8px;';

    var foot = document.createElement('div');
    foot.style.cssText =
      'display:flex;justify-content:flex-end;gap:8px;padding:10px 16px 14px;' +
      'border-top:1px solid var(--border, #2a2a30);';
    var clearAll = document.createElement('button');
    clearAll.type = 'button';
    clearAll.textContent = 'Clear all';
    clearAll.style.cssText =
      'background:transparent;border:1px solid var(--border, #2a2a30);color:var(--red, #e74c3c);' +
      'padding:8px 14px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;';
    clearAll.onclick = function () {
      showCustomConfirm('Delete all saved versions on this device?', function () {
        setVersions([]);
        renderVersionList();
      });
    };
    foot.appendChild(clearAll);

    panel.appendChild(head);
    panel.appendChild(listWrap);
    panel.appendChild(foot);
    modal.appendChild(panel);

    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.style.display = 'none';
    });

    document.body.appendChild(modal);
  }

  function rowStyleBase() {
    return (
      'display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;' +
      'border:1px solid var(--border, #2a2a30);background:rgba(255,255,255,0.03);flex-wrap:wrap;'
    );
  }

  function renderVersionList() {
    ensureVersionHistoryModal();
    var list = document.getElementById('version-history-list');
    if (!list) return;
    list.innerHTML = '';
    var versions = getVersions();
    if (!versions.length) {
      vhPage = 0;
      var empty = document.createElement('div');
      empty.textContent = 'No versions yet. Auto-save runs every 30 seconds while you edit.';
      empty.style.cssText = 'font-size:12px;color:var(--text-muted, #888);padding:12px 8px;line-height:1.5;';
      list.appendChild(empty);
      return;
    }

    var totalPages = Math.max(1, Math.ceil(versions.length / VH_PER_PAGE));
    if (vhPage >= totalPages) vhPage = totalPages - 1;
    if (vhPage < 0) vhPage = 0;

    var start = vhPage * VH_PER_PAGE;
    var end = Math.min(start + VH_PER_PAGE, versions.length);
    var pageItems = versions.slice(start, end);

    pageItems.forEach(function (ver, localIdx) {
      var idx = start + localIdx;
      var row = document.createElement('div');
      row.style.cssText = rowStyleBase();

      var meta = document.createElement('div');
      meta.style.cssText = 'flex:1;min-width:140px;display:flex;flex-direction:column;gap:2px;';
      var label = document.createElement('div');
      label.style.cssText = 'font-size:13px;font-weight:600;color:var(--text, #eee);';
      label.textContent = ver.label || formatAutoLabel(ver.timestamp || Date.now());
      var sub = document.createElement('div');
      sub.style.cssText = 'font-size:11px;color:var(--text-muted, #777);';
      sub.textContent = new Date(ver.timestamp || Date.now()).toLocaleString();
      meta.appendChild(label);
      meta.appendChild(sub);

      var badges = document.createElement('div');
      badges.style.cssText = 'display:flex;align-items:center;gap:6px;';
      if (idx === 0) {
        var cur = document.createElement('span');
        cur.textContent = 'Current';
        cur.style.cssText =
          'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;' +
          'color:var(--gold, #c9a227);border:1px solid rgba(201,162,39,0.35);padding:2px 8px;border-radius:999px;';
        badges.appendChild(cur);
      }

      var actions = document.createElement('div');
      actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;width:100%;justify-content:flex-end;';

      var restoreBtn = document.createElement('button');
      restoreBtn.type = 'button';
      restoreBtn.textContent = 'Restore';
      restoreBtn.style.cssText =
        'background:var(--gold, #c9a227);color:#111;border:none;padding:6px 12px;border-radius:8px;' +
        'cursor:pointer;font-size:12px;font-weight:600;';
      restoreBtn.onclick = function () {
        if (ver.version === 2 && ver.pages) {
          restoreV2Payload(ver);
        } else {
          restoreCardSnapshot(ver, typeof currentFace === 'string' ? currentFace : 'front');
        }
        if (typeof showToast === 'function') showToast('Version restored');
        document.getElementById('version-history-modal').style.display = 'none';
      };

      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.textContent = 'Delete';
      delBtn.style.cssText =
        'background:transparent;border:1px solid var(--border, #2a2a30);color:var(--text-muted, #aaa);' +
        'padding:6px 12px;border-radius:8px;cursor:pointer;font-size:12px;';
      delBtn.onclick = function () {
        var next = getVersions().filter(function (_, i) {
          return i !== idx;
        });
        setVersions(next);
        renderVersionList();
      };

      actions.appendChild(restoreBtn);
      actions.appendChild(delBtn);

      row.appendChild(meta);
      row.appendChild(badges);
      row.appendChild(actions);
      list.appendChild(row);
    });

    var pagBar = document.createElement('div');
    pagBar.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;' +
      'padding:10px 4px 4px;margin-top:4px;border-top:1px solid var(--border, #2a2a30);';

    var btnBase =
      'background:transparent;border:1px solid var(--border, #2a2a30);color:var(--text-muted, #aaa);' +
      'padding:6px 12px;border-radius:8px;cursor:pointer;font-size:12px;';

    var prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.textContent = 'Previous';
    prevBtn.style.cssText = btnBase;
    prevBtn.disabled = vhPage <= 0;
    if (prevBtn.disabled) {
      prevBtn.style.opacity = '0.45';
      prevBtn.style.cursor = 'not-allowed';
    }
    prevBtn.onclick = function () {
      if (vhPage <= 0) return;
      vhPage--;
      renderVersionList();
    };

    var pageInfo = document.createElement('div');
    pageInfo.textContent = 'Page ' + (vhPage + 1) + ' of ' + totalPages;
    pageInfo.style.cssText = 'font-size:12px;color:var(--text-muted, #888);flex:1;text-align:center;min-width:100px;';

    var nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.textContent = 'Next';
    nextBtn.style.cssText = btnBase;
    nextBtn.disabled = vhPage >= totalPages - 1;
    if (nextBtn.disabled) {
      nextBtn.style.opacity = '0.45';
      nextBtn.style.cursor = 'not-allowed';
    }
    nextBtn.onclick = function () {
      if (vhPage >= totalPages - 1) return;
      vhPage++;
      renderVersionList();
    };

    pagBar.appendChild(prevBtn);
    pagBar.appendChild(pageInfo);
    pagBar.appendChild(nextBtn);
    list.appendChild(pagBar);
  }

  function openVersionHistoryModal() {
    ensureVersionHistoryModal();
    renderVersionList();
    var m = document.getElementById('version-history-modal');
    if (m) m.style.display = 'flex';
  }

  // RB4: the boot overlay holds until the remote doc restore settles (index.html
  // inline script); this releases it. No-op outside remote mode / if overlay gone.
  function _ccBootDocReady() {
    try { if (window.__ccBoot && window.__ccBoot.docReady) window.__ccBoot.docReady(); } catch (e) {}
  }

  // ── Restore toast on load ─────────────────────────────────
  var _ccRemoteAutoLoaded = false;   // remote auto-restore must run ONCE per page load (loader emits modules:ready 2-3×)
  var _ccRemoteLoadTries = 0;        // failed-load retry counter (saves stay blocked until a load settles)
  // RB8: the retry path resets _ccRemoteAutoLoaded on EVERY failure, so two
  // doLoad chains (modules:ready fires 2-3x + retries) can OVERLAP: a slow
  // failure's catch re-arms the gate while another attempt is already
  // succeeding, and a SECOND full restore lands seconds into the live session,
  // wiping every page/edit made since (the owner's "opened it, added page 11,
  // it instantly went back to 10"). Two hard latches close it: a restore may
  // run at most ONCE per page load, and only ONE load may be in flight.
  var _ccRemoteRestoreRan = false;
  var _ccRemoteLoadInFlight = false;
  function showAutosaveRestoreOffer() {
    /* Read-only viewing of someone else's project (?view= guest link / ?shared= grant): no restore
       offer at all. It is not merely noise there, it is WRONG: the payload it offers belongs to the
       VIEWER's own previous standalone session, so accepting it would replace the shared project on
       screen with an unrelated document. Same guard as performAutoSave, for the same reason - a
       read-only session must be checked for write side effects, not only for what it renders. */
    if (typeof window !== 'undefined' && (window.__ccGuestView || window.__ccReadOnly)) return;
    // P2: remote mode — auto-load the design from the API once the canvas is
    // ready (no "restore?" toast; the design IS the session).
    if (typeof window !== 'undefined' && window.CCRemote && window.CCRemote.active) {
      var doLoad = function () {
        // RB8 latches: a restore may run at most ONCE per page load, no matter
        // how the retry timers interleave; and while a load is in flight no
        // second chain may start (a slow failure's catch used to re-arm
        // _ccRemoteAutoLoaded and let a SECOND restore wipe the live session).
        if (_ccRemoteRestoreRan || _ccRemoteLoadInFlight) return;
        if (_ccRemoteAutoLoaded) return;   // ONCE per page load — a 2nd auto-restore reloads the DB doc OVER the
        _ccRemoteAutoLoaded = true;        // live session, wiping unsaved in-memory edits (pages/video/scene added
                                            // after boot). This is the F5 total-wipe: modules:ready re-fires → re-restore.
        _ccRemoteLoadInFlight = true;
        window.CCRemote.load().then(function (doc) {
          _ccRemoteLoadInFlight = false;
          if (_ccRemoteRestoreRan) return;   // another chain already restored — NEVER restore twice
          _ccRemoteRestoreRan = true;
          // Reconcile the synchronous unload snapshot (flushSaveNow writes it because a network flush from an
          // unload is a dead letter): if it's NEWER than the server doc and not empty, it IS the truth —
          // push it up and restore from it instead.
          var merged = doc;
          try {
            var pkey = 'dika_pending_' + window.CCRemote.designId;
            var praw = localStorage.getItem(pkey);
            if (praw) {
              var pend = JSON.parse(praw);
              var newer = pend && pend.timestamp && (!doc || !doc.timestamp || pend.timestamp > doc.timestamp);
              var safe = pend && (_ccContentScore(pend) > 0 || !doc || _ccContentScore(doc) === 0);
              if (newer && safe) {
                merged = pend;
                window.CCRemote.saveNow(pend);
                if (typeof console !== 'undefined') console.log('[dika studio] unload snapshot recovered (newer than server doc)');
              }
              localStorage.removeItem(pkey);
            }
          } catch (e) {}
          _ccRemoteRestoreDone = true;   // saves may flow — the loaded doc (or a genuinely fresh design) is now the baseline
          if (!merged) { _ccBootDocReady(); return; }
          restoreFromAutosavePayload(merged);
          // RB4: lift the boot overlay only NOW — the pages array is swapped in, so
          // nothing the user does from here on can be wiped by a late restore.
          _ccBootDocReady();
          // portal-tags-page Phase 9: merge portal tag definitions + assignments into CCTags (additive),
          // so portal edits appear in the editor and survive the next save (doc->relational rebuild).
          // window.CCTags, NOT global.CCTags: this file's IIFE binds no `global`, so the
          // old reference THREW after every successful restore; the throw fell into the
          // load .catch, which re-armed the retry and ran a SECOND restore seconds later
          // (wiping everything the user did in between), then after 5 rounds disabled
          // saving entirely. THE root cause of the owner's save/revert reports (RB8).
          if (window.CCTags && CCTags.reconcileFromServer) setTimeout(function () { try { CCTags.reconcileFromServer(); } catch (e) {} }, 800);
          // portal-tags-page Phase 8: if opened with ?reveal=<kind>:<id>, reveal that target once the scene settles.
          if (typeof _ccRevealFromUrl === 'function') setTimeout(_ccRevealFromUrl, 600);
          // Each restore path now clears histLocked when its OWN async load lands (classic loadFromJSON
          // callback; scene _scRenderWorld when the last frame enlivens). This is only a LAST-RESORT unstick
          // in case something never clears it — long enough not to fire mid-load on a heavy scene (the old
          // fixed 800ms cleared the lock while frames were still enlivening → empty-save race).
          setTimeout(function () {
            if (typeof histLocked !== 'undefined') histLocked = false;
          }, 4000);
        }).catch(function (err) {
          _ccRemoteLoadInFlight = false;
          if (_ccRemoteRestoreRan) return;   // a parallel chain already restored — this late failure must not re-arm anything
          // Load failed → saves STAY BLOCKED (booting blank while bound to a designId and then autosaving is
          // exactly the wipe loop). Retry with backoff; give up loudly, never silently.
          // A PERMANENT ANSWER IS NOT A RETRY (measured 2026-08-11). The ladder below waits
          // 2+4+6+8+8s, so a design the server will NEVER hand over held the boot overlay at 98%
          // ("Loading design...") for ~26 SECONDS and then opened blank - indistinguishable from
          // the editor being broken. 404/410 = deleted, or the tab is pointing at another
          // workspace's design (the x-cc-org case); 403 = no access; 401 = the session is gone.
          // None of those become true by asking again. Saves stay blocked exactly as before: the
          // gate is `_ccRemoteRestoreDone`, which this path deliberately never sets.
          var _st = err && err.status;
          if (_st === 404 || _st === 410 || _st === 403 || _st === 401) {
            var _msg = _st === 401
              ? 'Your session has expired. Sign in again to open this design.'
              : _st === 403
                ? 'You do not have access to this design. Nothing was loaded and saving is disabled.'
                : 'This design is not in the current workspace. It may have been deleted, or this tab is pointing at another workspace. Nothing was loaded and saving is disabled.';
            if (typeof console !== 'undefined') console.error('[dika studio] design load refused (' + _st + ') — not retrying', err);
            if (typeof showToast === 'function') showToast(_msg, 'error');
            _ccBootDocReady();   // lift the overlay NOW so the message is the first thing seen
            return;
          }
          _ccRemoteLoadTries++;
          if (_ccRemoteLoadTries <= 5) {
            if (typeof console !== 'undefined') console.warn('[dika studio] design load failed (try ' + _ccRemoteLoadTries + '/5) — retrying', err);
            _ccRemoteAutoLoaded = false;
            setTimeout(doLoad, Math.min(2000 * _ccRemoteLoadTries, 8000));
          } else {
            if (typeof console !== 'undefined') console.error('[dika studio] design load FAILED — saving disabled to protect the server doc', err);
            if (typeof showToast === 'function') showToast('Design could not be loaded — save protection enabled. Refresh the page (F5).', 'error');
            _ccBootDocReady();   // RB4: lift the overlay so the failure toast is visible (saves stay blocked)
          }
        });
      };
      // Wait until ALL modules are mounted (sticky) so the page system + canvas
      // are fully ready — restoring at cc:canvas-ready raced module init.
      // Fallback timer: if modules:ready never fires (manifest fetch blip), still load — doLoad is once-gated.
      if (typeof cc !== 'undefined' && cc.on) { cc.on('modules:ready', doLoad); setTimeout(doLoad, 15000); }
      else setTimeout(doLoad, 1200);
      return;
    }

    /* COMMUNITY EDITION: the project IS the session, so it is RESTORED, not offered.
       Upstream's "previous session found - Restore / Dismiss" toast belongs to a build where one
       browser held one anonymous document and reopening it might not be what you wanted. Here the
       URL names a project (`?project=<id>`) and the store is that project's only home: offering to
       maybe open it is asking a question whose wrong answer loses the work. Dismiss used to CLEAR
       the autosave, which offline would delete the project outright.

       It waits on CCLocalStore.ready first. The store is async and this runs on DOMContentLoaded,
       so reading it directly is a race that resolves to "no previous work" on a slow disk - the
       most dangerous possible wrong answer. */
    /* ONCE. `modules:ready` fires 2-3 times (the loader emits it per tree) and the fallback timer
       fires too, and a SECOND restore seconds into a live session wipes everything done since. That
       is a real defect the remote path already had to latch against; do not remove this. */
    var _restoreRan = false;

    /* SUBSCRIBE SYNCHRONOUSLY. `modules:ready` is emitted with cc.emit, NOT cc.emitSticky
       (core/loader.js), so a listener added inside a promise callback can miss it entirely and then
       sit on the 8s fallback with saving suspended the whole time. Measured exactly that. The store
       is awaited INSIDE the handler instead, where being late costs nothing. */
    var _storeReady = (window.CCLocalStore && CCLocalStore.ready && CCLocalStore.ready.then)
      ? CCLocalStore.ready
      : Promise.resolve(true);

    var _doRestore = function () {
      if (_restoreRan) return;
      _restoreRan = true;
      _storeReady.then(function () {
        var data = readAutosave();
        if (!data || !data.timestamp) { _ccLocalRestoreDone = true; _ccBootDocReady(); return; }
        restoreFromAutosavePayload(data);
        _ccLocalRestoreDone = true;   // only now may a save go out
        _ccBootDocReady();
      });
    };

    if (typeof cc !== 'undefined' && cc.on) { cc.on('modules:ready', _doRestore); setTimeout(_doRestore, 8000); }
    else setTimeout(_doRestore, 1200);
  }

  // ── Gear menu: Version History before last separator ─────
  function injectGearVersionHistory() {
    var gearDrop = document.getElementById('gear-dropdown');
    if (!gearDrop || gearDrop.querySelector('[data-dika-version-history]')) return;

    var seps = gearDrop.querySelectorAll('.gear-sep');
    var lastSep = seps[seps.length - 1];
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gear-item';
    btn.setAttribute('data-dika-version-history', '1');
    btn.textContent = 'Version history';
    btn.onclick = function () {
      openVersionHistoryModal();
      gearDrop.classList.remove('show');
    };

    if (lastSep) gearDrop.insertBefore(btn, lastSep);
    else gearDrop.appendChild(btn);
  }

  // Lightweight save: updates the autosave snapshot only (no version push), so it can run
  // often without flooding version history.
  function quickAutoSave() {
    if (typeof canvas === 'undefined' || !canvas || !canvas.toJSON) return;
    if (_ccCoeditActive()) { _ccRequestCoeditFlush(false); return; }
    if (document.hidden) return;   // background tab: never save stale state over the doc (see performAutoSave)
    // Skip while a page load is in flight (histLocked) so we don't snapshot a half-loaded canvas.
    if (_ccSaveSuspended()) return;
    // G7: stamp the active work's lastEdited BEFORE building the payload (silent → no autosave re-trigger).
    try {
      if (typeof CCWorks !== 'undefined' && typeof pages !== 'undefined' && pages[currentPageIndex] && typeof _pgEnsurePageId === 'function') {
        CCWorks.touch({ type: 'page', id: _pgEnsurePageId(pages[currentPageIndex]) });
      }
    } catch (e) { /* ignore */ }
    // Page-sleep: remote quick-saves also need the full doc (see performAutoSave).
    if (typeof CCPageSleep !== 'undefined' && CCPageSleep.hasSlept() &&
        typeof window !== 'undefined' && window.CCRemote && window.CCRemote.active) {
      CCPageSleep.prefetchForSave(function () {
        try { var _qp2 = buildAutosavePayload(); if (_ccPersistAllowed(_qp2)) persistAutosave(_qp2); } catch (e) { /* ignore */ }
        CCPageSleep.releaseSaveMap();
      });
      return;
    }
    try { var _qp = buildAutosavePayload(); if (_ccPersistAllowed(_qp)) persistAutosave(_qp); } catch (e) { /* ignore */ }
  }
  var _quickSaveTimer = null;
  function scheduleQuickSave() {
    if (_quickSaveTimer) clearTimeout(_quickSaveTimer);
    _quickSaveTimer = setTimeout(quickAutoSave, 1200);   // snappier, Canva-like (was 2000)
  }

  // Not every editor mutation emits Fabric's object:modified (for example text entry, panel controls
  // and page/scene actions). Capture genuine control changes and the shared action bus so those edits
  // use the same trailing 1.2s save, while the 30s timer remains only a recovery/version checkpoint.
  function scheduleQuickSaveFromControl(ev) {
    if (!autosaveStarted || !ev || ev.isTrusted === false) return;
    var target = ev.target;
    if (!target || !target.closest || target.closest('#landing, #wizard')) return;
    scheduleQuickSave();
  }

  // Immediate flush — used on page hide / unload, where the remote save()'s ~1.2s debounce would be
  // lost with the page. In remote mode this fires CCRemote.saveNow (a synchronous flush); standalone
  // writes localStorage. So closing the tab / switching away persists the latest work reliably.
  function flushSaveNow() {
    if (typeof canvas === 'undefined' || !canvas || !canvas.toJSON) return;
    if (_ccSaveSuspended()) return;
    if (_ccCoeditActive()) { _ccRequestCoeditFlush(true); return; }
    // Page-sleep: a remote flush with slept pages needs the IDB prefetch (async). On tab-HIDE
    // it completes fine; on a hard unload the async may not finish - the periodic saves
    // already carried the slept pages (they are immutable while slept), so only the last
    // seconds of HOT edits ride on this best-effort flush, same as any unload fetch.
    if (typeof CCPageSleep !== 'undefined' && CCPageSleep.hasSlept() &&
        typeof window !== 'undefined' && window.CCRemote && window.CCRemote.active && !CCPageSleep._flushing) {
      CCPageSleep._flushing = true;
      CCPageSleep.prefetchForSave(function () {
        try { flushSaveNow(); } finally { CCPageSleep._flushing = false; CCPageSleep.releaseSaveMap(); }
      });
      return;
    }
    try {
      var payload = buildAutosavePayload();
      if (!_ccPersistAllowed(payload)) return;   // don't-regress: never flush an empty snapshot over the good doc (F5 / tab-hide)
      /* COMMUNITY EDITION: one destination. The upstream unload path also wrote a synchronous
         localStorage snapshot because a network flush during navigation is a dead letter; here the
         write is local already, and core/local-store.js flushes on `visibilitychange` and
         `pagehide` for exactly this moment. */
      persistAutosave(payload);
      if (window.CCLocalStore) CCLocalStore.flush();
    } catch (e) { /* ignore */ }
  }

  function startAutosaveTimer() {
    if (autosaveTimerId) return;
    autosaveTimerId = setInterval(performAutoSave, AUTOSAVE_MS);
    // Near-real-time safety: save shortly after edits and right before the page unloads,
    // so a reload doesn't lose work made between the 30s ticks. (The 30s tick still records versions.)
    if (typeof canvas !== 'undefined' && canvas && canvas.on) {
      ['object:added', 'object:modified', 'object:removed', 'text:changed', 'path:created'].forEach(function (ev) {
        canvas.on(ev, scheduleQuickSave);
      });
    }
    window.addEventListener('beforeunload', flushSaveNow);
    // Tab hidden / app backgrounded → flush now too (mobile especially may never fire beforeunload).
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushSaveNow(); });
  }

  function tryStartAutosaveWhenEditorVisible() {
    if (autosaveStarted) return;
    var landing = document.getElementById('landing');
    var wiz = document.getElementById('wizard');
    // An ABSENT landing/wizard means we're already in the editor (the startup
    // screens were retired). Treat absent as hidden, else autosave never starts.
    var landHidden = !landing || landing.classList.contains('hidden');
    var wizHidden = !wiz || wiz.classList.contains('hidden');
    if (landHidden && wizHidden) {
      autosaveStarted = true;
      if (editorPollId) {
        clearInterval(editorPollId);
        editorPollId = null;
      }
      startAutosaveTimer();
    }
  }

  function init() {
    injectGearVersionHistory();
    ensureSavedIndicator();

    // Shared action events cover module-level changes which do not mutate a Fabric object directly.
    if (typeof cc !== 'undefined' && cc.on) {
      ['tags:changed', 'action:ran', 'cc:page-changed', 'scene:frame-resize'].forEach(function (ev) {
        cc.on(ev, scheduleQuickSave);
      });
    }
    // Capture panel input/select changes in the editor. Capture phase survives controls that stop
    // propagation; untrusted/programmatic initialization events are ignored above.
    document.addEventListener('input', scheduleQuickSaveFromControl, true);
    document.addEventListener('change', scheduleQuickSaveFromControl, true);

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        setTimeout(injectGearVersionHistory, 250);
        showAutosaveRestoreOffer();
      });
    } else {
      setTimeout(injectGearVersionHistory, 250);
      showAutosaveRestoreOffer();
    }

    editorPollId = setInterval(tryStartAutosaveWhenEditorVisible, 400);
    tryStartAutosaveWhenEditorVisible();
  }

  init();

  window.saveProjectNow = saveProjectNow;
  /* THE SYNCHRONOUS LAST-CHANCE WRITE, exported so one more caller can use it: the updater, which is
     about to hand the machine to an installer that will terminate this process. Everything else that
     needs it (beforeunload, tab-hide) is wired inside this file; this is the one caller that lives in
     a module and cannot reach a closure. IndexedDB is the only copy of this person's work. */
  window.flushSaveNow = flushSaveNow;
  window.applyRestoredTags = applyRestoredTags;
  window.buildAutosavePayload = buildAutosavePayload;   // portal-bridge get-project-data/save-project referenced this as a global; it never was one (fixed 2026-07-18, Tier-2 render worker)
  window.pageToPayload = pageToPayload;                 // lossless part-aware page serializer (export-import-manager-plan Phase 7)
  window.normalizeRestoredPage = normalizeRestoredPage; // its inverse (payload → page)
  window.openVersionHistoryModal = openVersionHistoryModal;
  window.restoreDikaAutosave = function () {
    var d = readAutosave();
    if (d) restoreFromAutosavePayload(d);
  };
  window.clearDikaAutosaveKey = clearAutosaveStorage;
})();
