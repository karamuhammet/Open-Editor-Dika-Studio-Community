/* ============================================================
   system/work-stats — per-PROJECT work & focus tracking engine.

   Answers "how long did I actually work on THIS project, on which days,
   at which hours, and how many Pomodoros did I finish here". Feeds the
   Settings > Work tab and the Pomodoro widget's project counter.

   Design rules that must survive any edit:
   - LOCAL-FIRST. localStorage is the source of truth while you work; the
     server copy is a mirror. A day is marked clean ONLY on a real 2xx
     (the db-sync lesson: never mark clean because a push "probably" worked).
   - ABSOLUTE totals per device. Each browser owns one row per (design, day)
     server-side, keyed by a stable clientId, and always PUTs the whole day.
     A retry can therefore never double count, and two devices never
     overwrite each other (the server SUMs them).
   - Day strings are LOCAL ('YYYY-MM-DD' from getFullYear/Month/Date), never
     derived from a UTC timestamp: a heatmap cell must match the day the
     person felt they worked.
   - activeMs counts only a VISIBLE tab with input in the last 90s. focusMs
     counts wall-clock inside a running Pomodoro focus block (an intentional
     session stays counted even if you look away from the screen).
   - The page counter POLLS currentPageIndex. It deliberately does NOT wrap
     switchPage: that seam is load-bearing (kb/editor §8.12) and analytics
     must never sit in its call path.
   ============================================================ */
(function () {
  'use strict';

  var V = 1;
  var K_CLIENT = 'cc_work_client';
  var K_INDEX = 'cc_work_index_v1';
  var K_PREFIX = 'cc_work_v1_';

  var TICK_MS = 5000;          // accrual granularity
  var PAGE_POLL_MS = 1000;     // page-change watcher
  var IDLE_MS = 90000;         // no input for this long = not working
  var SESSION_GAP_MS = 900000; // 15 min away = a new sitting
  var FLUSH_MS = 60000;        // push cadence
  var MAX_DAYS = 400;          // per design
  var MAX_DESIGNS = 40;        // pruned by last touch
  var MAX_PAGE_KEYS = 500;

  var _clientId = null;
  var _key = null;              // localStorage key of the active design
  var _data = null;             // { v, days: {} }
  var _lastInput = Date.now();
  var _lastTick = Date.now();
  var _lastActiveAt = 0;
  var _lastPageIndex = -1;
  var _flushT = 0;
  var _flushing = false;
  var _timers = [];
  var _listeners = [];

  /* ── helpers ── */
  function _uuid() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, ''); } catch (e) {}
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }
  function _pad(n) { return n < 10 ? '0' + n : '' + n; }
  function dayKey(d) { d = d || new Date(); return d.getFullYear() + '-' + _pad(d.getMonth() + 1) + '-' + _pad(d.getDate()); }
  function _get(k, fb) { try { var s = localStorage.getItem(k); return s ? JSON.parse(s) : fb; } catch (e) { return fb; } }
  function _set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

  function clientId() {
    if (_clientId) return _clientId;
    try { _clientId = localStorage.getItem(K_CLIENT) || ''; } catch (e) { _clientId = ''; }
    if (!_clientId || _clientId.length < 8) { _clientId = _uuid(); try { localStorage.setItem(K_CLIENT, _clientId); } catch (e) {} }
    return _clientId;
  }

  /** The remote design id when the editor is panel-backed, else null (standalone/local file). */
  function designId() {
    try { if (window.CCRemote && window.CCRemote.active && window.CCRemote.designId) return String(window.CCRemote.designId); } catch (e) {}
    return null;
  }
  /** Storage bucket: the design id when we have one, otherwise a single local bucket. */
  function designKey() { return designId() || 'local'; }

  function _zeros24() { var a = [], i; for (i = 0; i < 24; i++) a.push(0); return a; }
  function _blankDay() {
    return { a: 0, f: 0, b: 0, p: 0, o: 0, s: 0, h: _zeros24(), g: {}, ft: 0, lt: 0, d: 1 };
  }

  /* ── storage ── */
  function _touchIndex(key) {
    var idx = _get(K_INDEX, {}) || {};
    idx[key] = Date.now();
    var keys = Object.keys(idx);
    if (keys.length > MAX_DESIGNS) {
      keys.sort(function (a, b) { return idx[a] - idx[b]; });
      while (keys.length > MAX_DESIGNS) {
        var drop = keys.shift();
        delete idx[drop];
        try { localStorage.removeItem(K_PREFIX + drop); } catch (e) {}
      }
    }
    _set(K_INDEX, idx);
  }

  function _load(key) {
    var raw = _get(K_PREFIX + key, null);
    if (!raw || raw.v !== V || !raw.days) raw = { v: V, days: {} };
    return raw;
  }
  function _persist() {
    if (!_key || !_data) return;
    var days = Object.keys(_data.days);
    if (days.length > MAX_DAYS) {
      days.sort();
      while (days.length > MAX_DAYS) delete _data.days[days.shift()];
    }
    _set(K_PREFIX + _key, _data);
  }

  function _day(create) {
    if (!_data) return null;
    var k = dayKey();
    var d = _data.days[k];
    if (!d) {
      if (create === false) return null;
      d = _blankDay();
      d.ft = Date.now();
      _data.days[k] = d;
    }
    return d;
  }
  function _mark(d) { d.d = 1; d.lt = Date.now(); if (!d.ft) d.ft = d.lt; }

  function _emit() {
    for (var i = 0; i < _listeners.length; i++) { try { _listeners[i](); } catch (e) {} }
  }

  /* ── the design the engine is bound to can change (portal opens another doc) ── */
  function _rebind() {
    var k = designKey();
    if (k === _key) return;
    if (_key) { _persist(); flush(true); }
    _key = k;
    _data = _load(_key);
    _touchIndex(_key);
    _startSitting();
    _lastPageIndex = _currentPageIndex();
    _emit();
  }

  function _startSitting() {
    var d = _day();
    if (!d) return;
    d.s = (d.s || 0) + 1;
    _mark(d);
    _persist();
  }

  /* ── accrual ── */
  function _isActive() {
    if (document.visibilityState === 'hidden') return false;
    return (Date.now() - _lastInput) < IDLE_MS;
  }

  function _tick() {
    _rebind();
    var now = Date.now();
    var dt = now - _lastTick;
    _lastTick = now;
    // A machine that slept, or a throttled background tab, must not bank hours it never worked.
    if (dt > TICK_MS * 4) dt = TICK_MS;
    if (dt <= 0) return;

    var d = _day(false);
    var active = _isActive();
    var pomo = _pomodoroState();
    var inFocus = pomo && pomo.running && pomo.mode === 'focus';
    var inBreak = pomo && pomo.running && pomo.mode !== 'focus';
    if (!active && !inFocus && !inBreak) return;

    if (!d) d = _day(true);
    if (_lastActiveAt && (now - _lastActiveAt) > SESSION_GAP_MS) d.s = (d.s || 0) + 1;
    _lastActiveAt = now;

    if (active) {
      d.a += dt;
      var h = new Date().getHours();
      d.h[h] = (d.h[h] || 0) + dt;
    }
    if (inFocus) d.f += dt;
    if (inBreak) d.b += dt;
    _mark(d);
    _persist();
  }

  function _pomodoroState() {
    try { return (window.CCPomodoro && CCPomodoro.state) ? CCPomodoro.state() : null; } catch (e) { return null; }
  }

  /* ── page opens ── */
  function _currentPageIndex() {
    try { return (typeof currentPageIndex === 'number') ? currentPageIndex : -1; } catch (e) { return -1; }
  }
  function _pageIdAt(i) {
    try {
      var p = (typeof pages !== 'undefined' && pages) ? pages[i] : null;
      if (!p) return null;
      return String(p._pageId || ('page-' + (i + 1)));
    } catch (e) { return null; }
  }
  function _pagePoll() {
    var i = _currentPageIndex();
    if (i < 0 || i === _lastPageIndex) return;
    _lastPageIndex = i;
    notePageOpen(_pageIdAt(i));
  }

  /* ── public writes ── */
  function notePageOpen(pageId) {
    var d = _day(); if (!d) return;
    d.o = (d.o || 0) + 1;
    if (pageId) {
      if (d.g[pageId] == null && Object.keys(d.g).length >= MAX_PAGE_KEYS) { /* cap: stop adding new keys */ }
      else d.g[pageId] = (d.g[pageId] || 0) + 1;
    }
    _mark(d); _persist();
  }

  /** Called by the Pomodoro widget when a FOCUS block completes (skips do not count). */
  function notePomodoro() {
    var d = _day(); if (!d) return;
    d.p = (d.p || 0) + 1;
    _mark(d); _persist(); _emit();
    flush(false);
  }

  /* ── server sync ── */
  // The API validates hours.length === 24 exactly; a short/legacy array must be padded here,
  // otherwise one malformed day would 400 the whole flush and freeze every later day with it.
  function _hours24(h) {
    var out = _zeros24(), i;
    if (h && h.length) for (i = 0; i < 24 && i < h.length; i++) out[i] = Math.min(86400000, Math.max(0, Math.round(h[i] || 0)));
    return out;
  }
  function _dirtyDays() {
    if (!_data) return [];
    var out = [], keys = Object.keys(_data.days).sort();
    for (var i = keys.length - 1; i >= 0 && out.length < 40; i--) {
      var k = keys[i], d = _data.days[k];
      if (!d || !d.d) continue;
      out.push({
        key: k,
        body: {
          day: k,
          activeMs: Math.min(86400000, Math.round(d.a || 0)),
          focusMs: Math.min(86400000, Math.round(d.f || 0)),
          breakMs: Math.min(86400000, Math.round(d.b || 0)),
          pomodoros: Math.min(200, d.p || 0),
          pageOpens: Math.min(100000, d.o || 0),
          sessions: Math.min(2000, d.s || 0),
          hours: _hours24(d.h),
          pages: d.g || {},
          firstAt: new Date(d.ft || Date.now()).toISOString(),
          lastAt: new Date(d.lt || d.ft || Date.now()).toISOString()
        }
      });
    }
    return out;
  }

  /** Push dirty days. Resolves true only when the server really accepted them. */
  function flush(force) {
    var id = designId();
    if (!id || !_data) return Promise.resolve(false);
    if (_flushing) return Promise.resolve(false);
    var now = Date.now();
    if (!force && (now - _flushT) < FLUSH_MS) return Promise.resolve(false);
    var dirty = _dirtyDays();
    if (!dirty.length) { _flushT = now; return Promise.resolve(false); }

    _flushing = true;
    _flushT = now;
    var payload = { clientId: clientId(), days: dirty.map(function (x) { return x.body; }) };
    return fetch('/api/designs/' + encodeURIComponent(id) + '/work', {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      // Clean ONLY on a real 2xx. A 429/500/offline leaves the day dirty so the next
      // flush heals it, instead of silently freezing the row forever (db-sync lesson).
      if (!r.ok) return false;
      for (var i = 0; i < dirty.length; i++) {
        var d = _data.days[dirty[i].key];
        if (d) d.d = 0;
      }
      _persist();
      return true;
    }).catch(function () { return false; })
      .then(function (ok) { _flushing = false; return ok; });
  }

  /** GET the server rollup (me + team). Returns null when there is no remote design. */
  function fetchRemote(range) {
    var id = designId();
    if (!id) return Promise.resolve(null);
    var q = '?range=' + encodeURIComponent(range || 'all') + '&today=' + encodeURIComponent(dayKey());
    return fetch('/api/designs/' + encodeURIComponent(id) + '/work' + q, { credentials: 'include' })
      .then(function (r) { if (!r.ok) throw new Error('work ' + r.status); return r.json(); });
  }

  /* ── reads for the UI ── */
  /** Local day series for a design, newest last. Always includes today (even at 0). */
  function series(key) {
    var data = (key && key !== _key) ? _load(key) : _data;
    if (!data) return [];
    var out = [];
    var keys = Object.keys(data.days).sort();
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], d = data.days[k];
      out.push({
        day: k, activeMs: d.a || 0, focusMs: d.f || 0, breakMs: d.b || 0,
        pomodoros: d.p || 0, pageOpens: d.o || 0, sessions: d.s || 0,
        hours: (d.h || []).slice(0, 24), pages: d.g || {}
      });
    }
    return out;
  }

  /** Today's numbers for the widget's project badge. */
  function todayStats() {
    var d = _day(false);
    return { activeMs: d ? d.a : 0, focusMs: d ? d.f : 0, pomodoros: d ? d.p : 0 };
  }

  function onChange(fn) { if (typeof fn === 'function') _listeners.push(fn); }

  /* ── boot ── */
  function _bindInput() {
    var mark = function () { _lastInput = Date.now(); };
    var evts = ['mousedown', 'mousemove', 'keydown', 'wheel', 'touchstart', 'pointerdown'];
    var last = 0;
    var throttled = function () { var n = Date.now(); if (n - last < 1000) return; last = n; mark(); };
    for (var i = 0; i < evts.length; i++) document.addEventListener(evts[i], throttled, { passive: true, capture: true });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') { _lastInput = Date.now(); _lastTick = Date.now(); }
      else { _persist(); flush(true); }
    });
    window.addEventListener('pagehide', function () { _persist(); flush(true); });
  }

  function init() {
    clientId();
    _key = designKey();
    _data = _load(_key);
    _touchIndex(_key);
    _lastTick = Date.now();
    _lastInput = Date.now();
    _lastActiveAt = Date.now();
    _lastPageIndex = _currentPageIndex();
    _startSitting();
    _bindInput();
    _timers.push(setInterval(_tick, TICK_MS));
    _timers.push(setInterval(_pagePoll, PAGE_POLL_MS));
    _timers.push(setInterval(function () { flush(false); }, FLUSH_MS));
    window.CCWork.ready = true;
  }

  window.CCWork = {
    ready: false,
    clientId: clientId,
    designId: designId,
    designKey: designKey,
    today: dayKey,
    series: series,
    todayStats: todayStats,
    notePomodoro: notePomodoro,
    notePageOpen: notePageOpen,
    fetchRemote: fetchRemote,
    flush: flush,
    onChange: onChange
  };

  if (window.cc && cc.on) cc.on('cc:canvas-ready', function () { cc.safe('system.work-stats', init); });
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  if (window.cc && cc.modules) cc.modules.register({ id: 'work-stats', parent: 'system', title: 'Work stats', mount: function () {}, unmount: function () {} });
})();
