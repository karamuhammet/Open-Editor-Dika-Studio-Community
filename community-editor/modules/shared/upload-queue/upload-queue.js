/* ═══════════════════════════════════════════════════════════════════
   dika studio — Upload Queue Engine + Floating Progress Modal
   Sequential / concurrent image upload with rate-limiting,
   minimizable floating progress UI, and settings integration.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── localStorage key ──
  var UPLOAD_SETTINGS_KEY = 'dika_upload_settings';

  // ── Default settings ──
  var DEFAULTS = {
    concurrency: 3,       // simultaneous uploads (1-10)
    maxSizeMB: 10,        // skip files larger than this
    ratePerMin: 0,        // 0 = unlimited, else images/min
    showModal: true       // auto-show progress modal
    // Image resize/quality is governed by Settings → Depolama → Performans (ccCompressToDataUrl).
  };

  // ── Read / write settings ──
  function _getSettings() {
    try {
      var raw = localStorage.getItem(UPLOAD_SETTINGS_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        // merge with defaults for any missing keys
        for (var k in DEFAULTS) {
          if (!(k in s)) s[k] = DEFAULTS[k];
        }
        return s;
      }
    } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULTS));
  }

  function _saveSettings(s) {
    try { localStorage.setItem(UPLOAD_SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
  }

  // ── Queue state ──
  var _queue = [];           // {file, folderId, status:'pending'|'processing'|'done'|'error', fileName}
  var _running = 0;          // active workers
  var _stats = { total: 0, done: 0, errors: 0 };
  var _paused = false;
  var _cancelled = false;
  var _currentFileName = '';
  var _rateTokens = [];      // timestamps of processed items for rate limiting
  var _errorFiles = [];       // {name, reason} for failed items

  // ── Modal DOM refs ──
  var _modal = null;
  var _minimized = false;

  // ═══════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════

  var _started = false;      // startQueue ran for the current batch

  /** Is there unfinished work (pending or in-flight)? */
  function _isBusy() {
    for (var i = 0; i < _queue.length; i++) {
      if (_queue[i].status === 'pending' || _queue[i].status === 'processing') return true;
    }
    return false;
  }

  /** Enqueue a single file for processing */
  function enqueue(file, folderId) {
    _queue.push({
      file: file,
      folderId: folderId,
      status: 'pending',
      fileName: file.name || 'image'
    });
    _stats.total++;
    // Items can arrive AFTER the queue drained (async folder recursion enqueues
    // subfolder files late; a root with zero direct images pumped an empty
    // queue). A started queue picks up every late arrival itself.
    if (_started && !_paused && !_cancelled) _pump();
  }

  /** Begin processing the queue */
  function startQueue() {
    _paused = false;
    _cancelled = false;
    _started = true;
    var settings = _getSettings();
    if (settings.showModal && _stats.total > 0) _showModal();
    _pump();
  }

  /** Pause processing */
  function pauseQueue() {
    _paused = true;
    _updateModal();
  }

  /** Resume after pause */
  function resumeQueue() {
    _paused = false;
    _updateModal();
    _pump();
  }

  /** Cancel remaining items */
  function cancelQueue() {
    _cancelled = true;
    _queue.forEach(function (item) {
      if (item.status === 'pending') item.status = 'cancelled';
    });
    // _running is NOT zeroed: in-flight workers decrement it themselves in
    // _fail/_store; zeroing here drove it negative and broke the concurrency
    // cap for the next batch.
    _updateModal();
    if (typeof showToast === 'function') showToast('Upload cancelled');
  }

  /** Reset queue for a new batch. Refuses while a batch is in flight: a reset
      mid-batch silently discarded every pending item (and the completion toast
      then lied about what was imported). Returns whether the reset happened. */
  function resetQueue() {
    if (_isBusy()) return false;
    _queue = [];
    _running = 0;
    _stats = { total: 0, done: 0, errors: 0 };
    _paused = false;
    _cancelled = false;
    _started = false;
    _currentFileName = '';
    _rateTokens = [];
    _errorFiles = [];
    return true;
  }

  // ═══════════════════════════════════════════════════
  //  QUEUE PUMP — respects concurrency + rate limit
  // ═══════════════════════════════════════════════════

  function _pump() {
    if (_paused || _cancelled) return;
    var settings = _getSettings();
    var maxConcurrency = (settings.concurrency === 0) ? 999 : Math.max(1, settings.concurrency || 3);

    while (_running < maxConcurrency) {
      // rate limit check
      if (settings.ratePerMin > 0) {
        var now = Date.now();
        // clean old tokens (older than 60s)
        _rateTokens = _rateTokens.filter(function (t) { return now - t < 60000; });
        if (_rateTokens.length >= settings.ratePerMin) {
          // schedule retry after oldest token expires
          var wait = 60000 - (now - _rateTokens[0]) + 100;
          setTimeout(_pump, wait);
          return;
        }
      }

      var next = null;
      for (var i = 0; i < _queue.length; i++) {
        if (_queue[i].status === 'pending') { next = _queue[i]; break; }
      }
      if (!next) break;

      next.status = 'processing';
      _running++;
      _currentFileName = next.fileName;
      _updateModal();
      _processItem(next);
    }
  }

  function _fail(item, reason) {
    item.status = 'error';
    item._errorReason = reason;
    _stats.errors++;
    _errorFiles.push({ name: item.fileName, reason: reason });
    _running--;
    _itemDone();
  }

  function _processItem(item) {
    var settings = _getSettings();
    var maxBytes = (settings.maxSizeMB || 10) * 1024 * 1024;

    if (item.file.size && item.file.size > maxBytes) {
      _fail(item, 'File too large (' + Math.round(item.file.size / 1024 / 1024) + ' MB)');
      return;
    }

    // Browser-side compress (Settings → Depolama → Performans; off/skip/error returns the
    // original), then store the resulting dataURL. Single shared compressor path (no inline resize).
    function _store(url) {
      if (!url) { _fail(item, 'Empty image data'); return; }
      // The store can refuse (target folder gone, e.g. a remote library sync
      // replaced local folder ids mid-batch): that is a FAILURE, not a done.
      var stored = true;
      try { stored = galAddImageToFolder(item.folderId, url) !== false; }
      catch (e) { stored = false; }
      if (!stored) { _fail(item, 'Folder no longer available'); return; }
      item.status = 'done';
      _stats.done++;
      _running--;
      if (typeof _galScheduleRefresh === 'function') _galScheduleRefresh();
      _itemDone();
    }
    if (typeof ccCompressToDataUrl === 'function') {
      ccCompressToDataUrl(item.file).then(_store, function () { _fail(item, 'Compress/read error'); });
    } else {
      var reader = new FileReader();
      reader.onload = function (ev) { _store(ev.target.result); };
      reader.onerror = function () { _fail(item, 'File read error'); };
      reader.readAsDataURL(item.file);
    }
  }

  function _itemDone() {
    // record rate token
    _rateTokens.push(Date.now());
    _updateModal();

    // Check if all done
    var pending = _queue.filter(function (q) { return q.status === 'pending' || q.status === 'processing'; });
    if (pending.length === 0) {
      _onQueueComplete();
      return;
    }
    _pump();
  }

  function _onQueueComplete() {
    if (typeof _galScheduleRefresh === 'function') _galScheduleRefresh();
    if (typeof showToast === 'function') {
      var msg = _stats.done + ' image' + (_stats.done !== 1 ? 's' : '') + ' imported';
      if (_stats.errors > 0) {
        msg += ' (' + _stats.errors + ' failed';
        if (_errorFiles.length > 0) msg += ': ' + _errorFiles[0].reason;
        msg += ')';
      }
      showToast(msg, _stats.errors > 0 && _stats.done === 0);
    }
    _updateModal();
    // Auto-hide modal after 2s
    setTimeout(function () {
      if (_modal && _stats.done > 0) _hideModal();
    }, 2500);
  }

  // ═══════════════════════════════════════════════════
  //  FLOATING PROGRESS MODAL
  // ═══════════════════════════════════════════════════

  function _showModal() {
    if (_modal) { _modal.style.display = ''; _minimized = false; _renderModalBody(); return; }
    _minimized = false;
    var el = document.createElement('div');
    el.id = 'uq-modal';
    el.className = 'uq-modal';
    el.innerHTML =
      '<div class="uq-modal-header" id="uq-header">' +
        '<span class="uq-modal-title">Importing Images</span>' +
        '<div class="uq-modal-btns">' +
          '<button class="uq-btn" id="uq-btn-min" title="Minimize">&#x2015;</button>' +
          '<button class="uq-btn" id="uq-btn-close" title="Cancel">&times;</button>' +
        '</div>' +
      '</div>' +
      '<div class="uq-modal-body" id="uq-body"></div>';
    document.body.appendChild(el);
    _modal = el;

    // draggable
    _makeDraggable(el, el.querySelector('#uq-header'));

    // minimize
    el.querySelector('#uq-btn-min').onclick = function () {
      _minimized = !_minimized;
      _renderModalBody();
    };
    // close/cancel
    el.querySelector('#uq-btn-close').onclick = function () {
      var pending = _queue.filter(function (q) { return q.status === 'pending' || q.status === 'processing'; });
      if (pending.length > 0) {
        cancelQueue();
      }
      _hideModal();
    };

    _renderModalBody();
  }

  function _hideModal() {
    if (_modal) { _modal.style.display = 'none'; }
  }

  function _updateModal() {
    if (!_modal || _modal.style.display === 'none') return;
    _renderModalBody();
  }

  function _renderModalBody() {
    if (!_modal) return;
    var body = _modal.querySelector('#uq-body');
    if (!body) return;

    var pct = _stats.total > 0 ? Math.round((_stats.done + _stats.errors) / _stats.total * 100) : 0;
    var allDone = _queue.filter(function (q) { return q.status === 'pending' || q.status === 'processing'; }).length === 0 && _stats.total > 0;

    if (_minimized) {
      _modal.classList.add('uq-minimized');
      body.innerHTML =
        '<div class="uq-mini-row">' +
          '<div class="uq-mini-bar"><div class="uq-mini-fill" style="width:' + pct + '%"></div></div>' +
          '<span class="uq-mini-text">' + (_stats.done + _stats.errors) + '/' + _stats.total + '</span>' +
        '</div>';
      return;
    }
    _modal.classList.remove('uq-minimized');

    var statusText = '';
    if (_cancelled) statusText = '<span style="color:var(--red)">Cancelled</span>';
    else if (_paused) statusText = '<span style="color:var(--gold)">Paused</span>';
    else if (allDone) statusText = '<span style="color:#4ade80">Complete</span>';
    else statusText = '<span style="color:var(--text-dim)">Processing: ' + _escHtml(_currentFileName) + '</span>';

    var actionBtns = '';
    if (!allDone && !_cancelled) {
      if (_paused) {
        actionBtns = '<button class="uq-action-btn" id="uq-resume">Resume</button>';
      } else {
        actionBtns = '<button class="uq-action-btn" id="uq-pause">Pause</button>';
      }
    }

    // Error detail list (show first 3 failed files)
    var errorDetail = '';
    if (_errorFiles.length > 0 && allDone) {
      var show = _errorFiles.slice(0, 3);
      errorDetail = '<div class="uq-error-list">';
      show.forEach(function (e) {
        errorDetail += '<div class="uq-error-item">' + _escHtml(e.name) + ' — <span style="color:var(--text-dim)">' + _escHtml(e.reason) + '</span></div>';
      });
      if (_errorFiles.length > 3) errorDetail += '<div class="uq-error-item" style="color:var(--text-dim)">+' + (_errorFiles.length - 3) + ' more</div>';
      errorDetail += '</div>';
    }

    // Storage info (IndexedDB — no limit)
    var storageBar = '';
    if (allDone && _stats.done > 0) {
      storageBar = '<div class="uq-storage-row"><span class="uq-storage-label" style="color:#4ade80">Storage: IndexedDB (unlimited)</span></div>';
    }

    body.innerHTML =
      '<div class="uq-progress-row">' +
        '<div class="uq-progress-bar"><div class="uq-progress-fill" style="width:' + pct + '%"></div></div>' +
        '<span class="uq-progress-pct">' + pct + '%</span>' +
      '</div>' +
      '<div class="uq-info-row">' +
        '<span class="uq-count">' + (_stats.done + _stats.errors) + ' / ' + _stats.total + ' images</span>' +
        ((_stats.errors > 0) ? '<span class="uq-errors">' + _stats.errors + ' failed</span>' : '') +
      '</div>' +
      '<div class="uq-status-row">' + statusText + '</div>' +
      storageBar +
      errorDetail +
      (actionBtns ? '<div class="uq-action-row">' + actionBtns + '</div>' : '');

    // wire action buttons
    var pauseBtn = body.querySelector('#uq-pause');
    if (pauseBtn) pauseBtn.onclick = function () { pauseQueue(); };
    var resumeBtn = body.querySelector('#uq-resume');
    if (resumeBtn) resumeBtn.onclick = function () { resumeQueue(); };
  }

  function _escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  // ── Simple drag ──
  function _makeDraggable(el, handle) {
    var ox = 0, oy = 0, sx = 0, sy = 0;
    handle.style.cursor = 'move';
    handle.onmousedown = function (e) {
      if (e.target.tagName === 'BUTTON') return;
      e.preventDefault();
      sx = e.clientX; sy = e.clientY;
      var rect = el.getBoundingClientRect();
      ox = rect.left; oy = rect.top;
      document.onmousemove = function (ev) {
        var dx = ev.clientX - sx, dy = ev.clientY - sy;
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        el.style.left = Math.max(0, ox + dx) + 'px';
        el.style.top = Math.max(0, oy + dy) + 'px';
      };
      document.onmouseup = function () {
        document.onmousemove = null;
        document.onmouseup = null;
      };
    };
  }

  // ═══════════════════════════════════════════════════
  //  BATCH HELPER — used by upload paths
  // ═══════════════════════════════════════════════════

  /** Enqueue an array of File objects for a folder, then start. If a batch is
      already in flight the new files JOIN it (reset refuses mid-batch) instead
      of silently discarding the pending remainder. */
  function enqueueBatch(files, folderId) {
    resetQueue();
    var settings = _getSettings();
    var maxBytes = (settings.maxSizeMB || 10) * 1024 * 1024;
    var skipped = 0;
    for (var i = 0; i < files.length; i++) {
      if (!_isImageFile(files[i])) continue;
      if (files[i].size && files[i].size > maxBytes) { skipped++; continue; }
      enqueue(files[i], folderId);
    }
    if (skipped > 0 && typeof showToast === 'function') {
      showToast(skipped + ' file' + (skipped > 1 ? 's' : '') + ' skipped (too large)');
    }
    if (_stats.total > 0) startQueue();
    else if (typeof showToast === 'function') showToast('No valid images found');
  }

  // ═══════════════════════════════════════════════════
  //  SETTINGS UI BUILDER (for settings.js integration)
  // ═══════════════════════════════════════════════════

  function buildUploadSettingsSection() {
    var s = _getSettings();

    function selOpts(current, opts) {
      var h = '';
      opts.forEach(function (o) {
        h += '<option value="' + o.v + '"' + (current == o.v ? ' selected' : '') + '>' + o.l + '</option>';
      });
      return h;
    }

    var concurrencyOpts = [
      { v: 1, l: '1 (Sequential)' }, { v: 2, l: '2' }, { v: 3, l: '3 (Default)' },
      { v: 5, l: '5' }, { v: 8, l: '8' }, { v: 10, l: '10' }, { v: 0, l: 'Unlimited' }
    ];
    var maxSizeOpts = [
      { v: 2, l: '2 MB' }, { v: 5, l: '5 MB' }, { v: 10, l: '10 MB' }, { v: 25, l: '25 MB' }, { v: 50, l: '50 MB' }
    ];
    var rateOpts = [
      { v: 0, l: 'Unlimited' }, { v: 10, l: '10 / min' }, { v: 30, l: '30 / min' }, { v: 60, l: '60 / min' }, { v: 120, l: '120 / min' }
    ];

    return '<div class="settings-section-title">Upload Settings</div>' +
      '<p style="color:var(--text-dim);font-size:12px;margin-bottom:14px">Configure image upload queue behavior for gallery imports.</p>' +
      '<div class="settings-form">' +

        // ── Queue Settings accordion ──
        '<div class="sp-accordion open" id="uq-acc-queue">' +
          '<div class="sp-acc-header" onclick="this.parentElement.classList.toggle(\'open\')">' +
            '<span class="sp-acc-ico" style="color:var(--text-dim)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></span>' +
            '<span class="sp-acc-title">Queue Settings</span>' +
            '<span class="sp-acc-arrow">&#9662;</span>' +
          '</div>' +
          '<div class="sp-acc-body">' +

            // Concurrent uploads
            '<div class="uq-setting-row">' +
              '<label class="uq-setting-label">Concurrent Uploads</label>' +
              '<select id="uq-set-concurrency" class="uq-select">' + selOpts(s.concurrency, concurrencyOpts) + '</select>' +
            '</div>' +
            '<p class="uq-setting-hint">Number of images processed at once. Use 1 for weak servers, Unlimited for local.</p>' +

            // Rate limit
            '<div class="uq-setting-row">' +
              '<label class="uq-setting-label">Rate Limit</label>' +
              '<select id="uq-set-rate" class="uq-select">' + selOpts(s.ratePerMin, rateOpts) + '</select>' +
            '</div>' +
            '<p class="uq-setting-hint">Maximum images per minute. Useful for rate-limited servers.</p>' +

            // Auto-show modal
            '<div class="pref-rail-row" style="margin-top:10px">' +
              '<span class="pref-rail-label">Show progress modal</span>' +
              '<label class="pref-toggle">' +
                '<input type="checkbox" id="uq-set-modal" ' + (s.showModal ? 'checked' : '') + '>' +
                '<span class="pref-toggle-slider"></span>' +
              '</label>' +
            '</div>' +

          '</div>' +
        '</div>' +

        // ── Image Settings accordion ──
        '<div class="sp-accordion open" id="uq-acc-image">' +
          '<div class="sp-acc-header" onclick="this.parentElement.classList.toggle(\'open\')">' +
            '<span class="sp-acc-ico" style="color:var(--text-dim)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></span>' +
            '<span class="sp-acc-title">Image Settings</span>' +
            '<span class="sp-acc-arrow">&#9662;</span>' +
          '</div>' +
          '<div class="sp-acc-body">' +

            // Max file size
            '<div class="uq-setting-row">' +
              '<label class="uq-setting-label">Max File Size</label>' +
              '<select id="uq-set-maxsize" class="uq-select">' + selOpts(s.maxSizeMB, maxSizeOpts) + '</select>' +
            '</div>' +
            '<p class="uq-setting-hint">Files larger than this will be skipped.</p>' +
            '<p class="uq-setting-hint">Image compression is done automatically during upload (Settings &rarr; Storage &rarr; Performance).</p>' +

          '</div>' +
        '</div>' +

        // ── Current Queue Status accordion ──
        '<div class="sp-accordion" id="uq-acc-status">' +
          '<div class="sp-acc-header" onclick="this.parentElement.classList.toggle(\'open\')">' +
            '<span class="sp-acc-ico" style="color:var(--text-dim)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></span>' +
            '<span class="sp-acc-title">Queue Status</span>' +
            '<span class="sp-acc-arrow">&#9662;</span>' +
          '</div>' +
          '<div class="sp-acc-body">' +
            '<div id="uq-status-info">' + _buildStatusInfo() + '</div>' +
          '</div>' +
        '</div>' +

      '</div>';
  }

  function _buildStatusInfo() {
    var storageHtml =
      '<div style="margin-bottom:10px">' +
        '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px">' +
          '<span style="color:var(--text-dim)">Gallery Storage</span>' +
          '<span style="color:#4ade80">IndexedDB (unlimited)</span>' +
        '</div>' +
      '</div>';

    if (_stats.total === 0) {
      return storageHtml + '<p style="font-size:12px;color:var(--text-dim)">No active upload queue.</p>';
    }
    var pending = _queue.filter(function (q) { return q.status === 'pending'; }).length;
    return storageHtml + '<p style="font-size:12px;color:var(--text)">' +
      'Total: ' + _stats.total + ' &bull; Done: ' + _stats.done +
      ' &bull; Errors: ' + _stats.errors + ' &bull; Pending: ' + pending +
    '</p>';
  }

  function wireUploadSettingsHandlers() {
    var conc = document.getElementById('uq-set-concurrency');
    if (conc) conc.onchange = function () {
      var s = _getSettings();
      s.concurrency = parseInt(conc.value, 10);
      _saveSettings(s);
    };

    var rate = document.getElementById('uq-set-rate');
    if (rate) rate.onchange = function () {
      var s = _getSettings();
      s.ratePerMin = parseInt(rate.value, 10) || 0;
      _saveSettings(s);
    };

    var modalCb = document.getElementById('uq-set-modal');
    if (modalCb) modalCb.onchange = function () {
      var s = _getSettings();
      s.showModal = modalCb.checked;
      _saveSettings(s);
    };

    var maxSz = document.getElementById('uq-set-maxsize');
    if (maxSz) maxSz.onchange = function () {
      var s = _getSettings();
      s.maxSizeMB = parseInt(maxSz.value, 10) || 10;
      _saveSettings(s);
    };
  }

  // ═══════════════════════════════════════════════════
  //  WINDOW EXPORTS
  // ═══════════════════════════════════════════════════
  window.UploadQueue = {
    enqueue: enqueue,
    enqueueBatch: enqueueBatch,
    start: startQueue,
    pause: pauseQueue,
    resume: resumeQueue,
    cancel: cancelQueue,
    reset: resetQueue,
    isBusy: _isBusy,
    getSettings: _getSettings,
    saveSettings: _saveSettings,
    buildSettingsSection: buildUploadSettingsSection,
    wireSettingsHandlers: wireUploadSettingsHandlers,
    getStats: function () { return { total: _stats.total, done: _stats.done, errors: _stats.errors }; }
  };

})();

// Modular skeleton hook (Faz 8) — upload-queue is now a shared loader module (modules/shared/).
if (window.cc && cc.modules) cc.modules.register({ id: 'upload-queue', parent: 'shared', title: 'Upload queue', mount: function () {}, unmount: function () {} });
