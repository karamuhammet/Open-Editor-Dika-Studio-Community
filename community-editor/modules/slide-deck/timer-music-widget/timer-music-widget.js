/* ============================================================
   slide-deck/timer-music-widget — Pomodoro focus timer.
   Floating, resizable, minimizable widget built on the editor design system
   (theme.css tokens + Lucide getIcon() + --font-ui/--font-mono, volt accent).

   Three shells, ONE engine and ONE render path:
     - inline   : the floating card on the canvas (drag by the grip, resize by any edge/corner)
     - mini     : a small circular timer that keeps counting
     - pop-out  : a REAL separate browser window (window.open). The engine never moves - the
                  parent tab keeps ticking and simply paints the popup's DOM, so closing the
                  popup can never lose a running session. Every render helper writes to BOTH
                  documents (_els), which is why the popup can share the markup ids.

   Completed FOCUS blocks are reported to CCWork (system/work-stats), so the Pomodoro count
   is per PROJECT and shows up in Settings > Work. Skips deliberately do not count.
   ============================================================ */
(function () {
  'use strict';

  var LS = 'dika_pomodoro_v1';
  var C = 2 * Math.PI * 52; // ring circumference (r=52)

  var MINW = 240, MINH = 320, MAXW = 560, MAXH = 760;
  var DEFW = 226, DEFH = 334;

  var MODES = {
    focus: { label: 'Focus', icon: 'target' },
    short: { label: 'Short break', icon: 'coffee' },
    long:  { label: 'Long break', icon: 'coffee' }
  };

  var st = {
    mode: 'focus', running: false, endTs: 0, remainingMs: 0, doneCount: 0,
    open: false, mini: false, popped: false, view: 'timer', settingsTab: 'sure',
    pos: null, size: null,
    cfg: {
      focusMin: 25, shortMin: 5, longMin: 15, longAfter: 4,
      autoBreak: true, autoFocus: false,
      notifyToast: true, notifyModal: false, notifySound: true
    }
  };

  var tickT = null, ac = null, _drag = null, _rz = null, _built = false;
  var _pw = null;              // the pop-out window
  var _proj = { activeMs: 0, total: 0 };
  var _projT = 0;

  function _q(id) { return document.getElementById(id); }
  function _i(n, s) { return (typeof getIcon === 'function') ? getIcon(n, s || 16) : ''; }
  function _toast(m) { if (typeof showToast === 'function') showToast(m); }

  /** Every element with this id across the shells that are currently live. */
  function _els(id) {
    var out = [], a = document.getElementById(id);
    if (a) out.push(a);
    if (_pw && !_pw.closed && _pw.document) {
      var b = _pw.document.getElementById(id);
      if (b) out.push(b);
    }
    return out;
  }
  function _text(id, v) { var e = _els(id), i; for (i = 0; i < e.length; i++) e[i].textContent = v; }
  function _html(id, v) { var e = _els(id), i; for (i = 0; i < e.length; i++) e[i].innerHTML = v; }
  function _style(id, prop, v) { var e = _els(id), i; for (i = 0; i < e.length; i++) e[i].style[prop] = v; }
  function _cls(id, name, on) { var e = _els(id), i; for (i = 0; i < e.length; i++) e[i].classList.toggle(name, !!on); }

  function _load() {
    try {
      var p = JSON.parse(localStorage.getItem(LS) || '{}');
      if (p.cfg) st.cfg = Object.assign(st.cfg, p.cfg);
      if (p.pos) st.pos = p.pos;
      if (p.size && p.size.w) st.size = p.size;
      if (typeof p.doneCount === 'number') st.doneCount = p.doneCount;
      if (p.mode && MODES[p.mode]) st.mode = p.mode;
    } catch (e) {}
  }
  function _save() { try { localStorage.setItem(LS, JSON.stringify({ cfg: st.cfg, pos: st.pos, size: st.size, doneCount: st.doneCount, mode: st.mode })); } catch (e) {} }

  function _modeMs(m) { return (m === 'focus' ? st.cfg.focusMin : m === 'short' ? st.cfg.shortMin : st.cfg.longMin) * 60000; }
  function _fmt(ms) { var t = Math.max(0, Math.round(ms / 1000)); var mm = Math.floor(t / 60), ss = t % 60; return (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss; }
  function _dur(ms) {
    var m = Math.round((ms || 0) / 60000);
    if (m < 60) return m + 'm';
    var h = Math.floor(m / 60);
    return h + 'h ' + (m % 60) + 'm';
  }

  /* ── audio ── */
  function _ac() { try { if (!ac && (window.AudioContext || window.webkitAudioContext)) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac && ac.state === 'suspended') ac.resume(); } catch (e) {} return ac; }
  function _chime() {
    var a = _ac(); if (!a) return; var t0 = a.currentTime + 0.02;
    [784, 1046, 1318].forEach(function (f, i) {
      var o = a.createOscillator(), g = a.createGain(); o.type = 'sine'; o.frequency.value = f;
      var s = t0 + i * 0.15;
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.09, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.42);
      o.connect(g).connect(a.destination); o.start(s); o.stop(s + 0.45);
    });
  }

  /* ── top-bar toggle button (Lucide clock) ── */
  function _injectTopButton() {
    var topbar = _q('topbar'); if (!topbar || _q('tmw-top-btn')) return;
    var b = document.createElement('button');
    b.className = 'gear-btn tmw-top-btn'; b.id = 'tmw-top-btn'; b.type = 'button'; b.title = 'Pomodoro';
    b.innerHTML = _i('timer', 16) + '<span id="pomo-top-time" class="tmw-top-time" style="display:none">25:00</span>';
    b.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });
    var anchor = _q('gear-btn') && _q('gear-btn').parentNode;
    if (anchor) topbar.insertBefore(b, anchor); else topbar.appendChild(b);
  }
  function _topBadge() { var el = _q('pomo-top-time'); if (!el) return; if (st.running) { el.textContent = _fmt(st.endTs - Date.now()); el.style.display = ''; } else el.style.display = 'none'; }

  /* ── the timer body markup, shared by the inline card and the pop-out ── */
  function _bodyHtml(popped) {
    return '<div class="pomo-ring-wrap" id="pomo-ring-wrap">' +
        '<svg class="pomo-ring" viewBox="0 0 120 120" aria-hidden="true">' +
          '<circle class="pomo-ring-bg" cx="60" cy="60" r="52"/>' +
          '<circle class="pomo-ring-fg" id="' + (popped ? 'pop-' : '') + 'pomo-ring-fg" cx="60" cy="60" r="52" transform="rotate(-90 60 60)" stroke-dasharray="' + C + '" stroke-dashoffset="' + C + '"/>' +
        '</svg>' +
        '<div class="pomo-face">' +
          '<span class="pomo-face-ic" id="pomo-face-ic"></span>' +
          '<div class="pomo-time" id="pomo-time">25:00</div>' +
          '<div class="pomo-dots" id="pomo-dots"></div>' +
        '</div>' +
      '</div>' +
      '<div class="pomo-sub">' +
        '<button class="pomo-sub-btn" id="' + (popped ? 'pop-' : '') + 'pomo-reset" type="button">' + _i('rotate-ccw', 14) + '<span>Reset</span></button>' +
        '<button class="pomo-sub-btn" id="' + (popped ? 'pop-' : '') + 'pomo-skip" type="button">' + _i('skip-forward', 14) + '<span>Skip</span></button>' +
      '</div>' +
      '<div class="pomo-ctrls">' +
        '<button class="pomo-primary" id="' + (popped ? 'pop-' : '') + 'pomo-toggle" type="button"><span class="pomo-primary-ic" id="pomo-primary-ic"></span><span id="pomo-primary-lbl">Start</span></button>' +
        (popped ? '' : '<button class="pomo-ico pomo-gear" id="pomo-settings" type="button" title="Settings" aria-label="Settings">' + _i('settings', 16) + '</button>') +
      '</div>' +
      '<button class="pomo-proj" id="' + (popped ? 'pop-' : '') + 'pomo-proj" type="button" title="Open work statistics">' +
        '<span class="pomo-proj-c"><em id="pomo-proj-time">0m</em><i>today</i></span>' +
        '<span class="pomo-proj-sep"></span>' +
        '<span class="pomo-proj-c"><em id="pomo-proj-pomo">0</em><i>pomodoro</i></span>' +
        '<span class="pomo-proj-go">' + _i('chevron-right', 14) + '</span>' +
      '</button>';
  }

  /* ── build (inline shell) ── */
  function _ensureWidget() {
    if (_built) return; _built = true;
    var w = document.createElement('div');
    w.id = 'pomo-widget'; w.className = 'pomo-widget';
    w.innerHTML =
      '<div class="pomo-card" id="pomo-card">' +
        '<div class="pomo-head">' +
          '<button class="pomo-grip" id="pomo-grip" type="button" title="Drag to move" aria-label="Move">' + _i('ellipsis-vertical', 16) + '</button>' +
          '<span class="pomo-name" id="pomo-name">Focus</span>' +
          '<div class="pomo-head-r">' +
            '<button class="pomo-ico" id="pomo-pop" type="button" title="Open in a separate window" aria-label="Open in a separate window">' + _i('external-link', 15) + '</button>' +
            '<button class="pomo-ico" id="pomo-min" type="button" title="Minimize" aria-label="Minimize">' + _i('minimize-2', 15) + '</button>' +
            '<button class="pomo-ico" id="pomo-close" type="button" title="Close" aria-label="Close">' + _i('x', 15) + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="pomo-body" id="pomo-view-timer">' + _bodyHtml(false) + '</div>' +
        '<div class="pomo-body pomo-settings-body" id="pomo-view-settings"></div>' +
      '</div>' +
      '<div class="pomo-docked" id="pomo-docked">' +
        '<span class="pomo-docked-ic">' + _i('external-link', 15) + '</span>' +
        '<span class="pomo-docked-t">In a separate window</span>' +
        '<button class="pomo-docked-btn" id="pomo-redock" type="button">Bring back</button>' +
      '</div>' +
      '<button class="pomo-mini" id="pomo-mini" type="button" title="Pomodoro (open)" aria-label="Pomodoro">' +
        '<svg class="pomo-mini-ring" viewBox="0 0 44 44" aria-hidden="true"><circle class="pomo-mini-bg" cx="22" cy="22" r="19"/><circle class="pomo-mini-fg" id="pomo-mini-fg" cx="22" cy="22" r="19" transform="rotate(-90 22 22)" stroke-dasharray="' + (2 * Math.PI * 19) + '" stroke-dashoffset="' + (2 * Math.PI * 19) + '"/></svg>' +
        '<span class="pomo-mini-time" id="pomo-mini-time">25:00</span>' +
      '</button>';
    document.body.appendChild(w);

    _q('pomo-toggle').addEventListener('click', _toggle);
    _q('pomo-reset').addEventListener('click', _reset);
    _q('pomo-skip').addEventListener('click', function () { _complete(true); });
    _q('pomo-settings').addEventListener('click', function () { st.view = 'settings'; _renderView(); });
    _q('pomo-pop').addEventListener('click', _popOut);
    _q('pomo-redock').addEventListener('click', _redock);
    _q('pomo-proj').addEventListener('click', _openWorkTab);
    _q('pomo-min').addEventListener('click', function () { st.mini = true; _renderChrome(); _save(); });
    _q('pomo-close').addEventListener('click', close);
    _q('pomo-mini').addEventListener('click', function () { if (_drag && _drag.moved) return; st.mini = false; _renderChrome(); _save(); });
    _dragBind(_q('pomo-grip'));
    _dragBind(_q('pomo-mini'));
    _buildResizeHandles(w);
    _applySize();
  }

  /* ── drag (grip + mini) ── */
  function _dragBind(handle) {
    if (!handle) return;
    handle.addEventListener('mousedown', function (e) {
      var w = _q('pomo-widget'), r = w.getBoundingClientRect();
      _drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
      document.body.classList.add('pomo-dragging'); e.preventDefault();
    });
  }

  /* ── resize (8 handles, inline shell only) ── */
  var DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
  function _buildResizeHandles(root) {
    DIRS.forEach(function (dir) {
      var h = document.createElement('div');
      h.className = 'pomo-rz pomo-rz-' + dir;
      h.setAttribute('data-dir', dir);
      h.setAttribute('aria-hidden', 'true');
      root.appendChild(h);
      h.addEventListener('mousedown', function (e) {
        e.preventDefault(); e.stopPropagation();
        var r = root.getBoundingClientRect();
        _rz = { dir: dir, x: e.clientX, y: e.clientY, w: r.width, h: r.height, l: r.left, t: r.top };
        document.body.classList.add('pomo-resizing');
      });
    });
  }

  function _clampSize(w, h) {
    return {
      w: Math.max(MINW, Math.min(MAXW, Math.round(w))),
      h: Math.max(MINH, Math.min(MAXH, Math.round(h)))
    };
  }
  /** Ring + type scale derive from the box, so any size stays a designed layout, never a stretched one.
      chromeH = everything above/below the ring in that shell (inline card 196, pop-out 218: it also
      carries the window head and the hint line). Pass the RAW box, never a pre-subtracted one. */
  function _fitBody(doc, boxW, boxH, chromeH) {
    var wrap = doc.getElementById('pomo-ring-wrap');
    if (!wrap) return;
    var ring = Math.max(96, Math.min(300, Math.min(boxW - 56, boxH - (chromeH || 196))));
    wrap.style.width = ring + 'px';
    wrap.style.height = ring + 'px';
    var t = doc.getElementById('pomo-time');
    if (t) t.style.fontSize = Math.max(22, Math.min(76, Math.round(ring * 0.235))) + 'px';
  }
  /** Hand the body back to the stylesheet (the untouched default layout). */
  function _resetBody(doc) {
    var wrap = doc.getElementById('pomo-ring-wrap');
    if (wrap) { wrap.style.width = ''; wrap.style.height = ''; }
    var t = doc.getElementById('pomo-time');
    if (t) t.style.fontSize = '';
  }
  function _applySize() {
    var w = _q('pomo-widget'); if (!w) return;
    var s = st.size;
    // mini and popped are content-sized shells: a fixed box would stretch them.
    if (!s || st.mini || st.popped) {
      w.style.width = ''; w.style.height = '';
      _resetBody(document); // un-minimising re-enters this fn with a size and re-fits
      return;
    }
    w.style.width = s.w + 'px';
    w.style.height = s.h + 'px';
    _fitBody(document, s.w, s.h);
  }
  function _applyPos() { var w = _q('pomo-widget'); if (w && st.pos) { w.style.left = st.pos.x + 'px'; w.style.top = st.pos.y + 'px'; w.style.right = 'auto'; w.style.bottom = 'auto'; } }

  document.addEventListener('mousemove', function (e) {
    if (_rz) {
      var dx = e.clientX - _rz.x, dy = e.clientY - _rz.y, d = _rz.dir;
      var nw = _rz.w + (d.indexOf('e') >= 0 ? dx : d.indexOf('w') >= 0 ? -dx : 0);
      var nh = _rz.h + (d.indexOf('s') >= 0 ? dy : d.indexOf('n') >= 0 ? -dy : 0);
      var s = _clampSize(nw, nh);
      // Dragging a north/west edge moves the origin by exactly what the box actually took,
      // so a clamped edge stops dead instead of sliding the whole widget away.
      var left = _rz.l + (d.indexOf('w') >= 0 ? (_rz.w - s.w) : 0);
      var top = _rz.t + (d.indexOf('n') >= 0 ? (_rz.h - s.h) : 0);
      st.size = s;
      st.pos = { x: Math.max(6, Math.min(window.innerWidth - s.w - 6, left)), y: Math.max(6, Math.min(window.innerHeight - 40, top)) };
      _applySize(); _applyPos();
      return;
    }
    if (!_drag) return;
    _drag.moved = true;
    var w = _q('pomo-widget'), ww = w.offsetWidth, wh = w.offsetHeight;
    st.pos = { x: Math.max(6, Math.min(window.innerWidth - ww - 6, e.clientX - _drag.dx)), y: Math.max(6, Math.min(window.innerHeight - wh - 6, e.clientY - _drag.dy)) };
    _applyPos();
  });
  document.addEventListener('mouseup', function () {
    if (_rz) { _rz = null; document.body.classList.remove('pomo-resizing'); _save(); }
    if (_drag) { document.body.classList.remove('pomo-dragging'); if (_drag.moved) _save(); var d = _drag; setTimeout(function () { if (_drag === d) _drag = null; }, 0); }
  });

  /* ── pop-out window ─────────────────────────────────────────────────────
     A real browser window. The engine stays here: the parent paints the popup
     (same-origin, same ids) and the popup owns no state of its own, so pulling
     its plug at any moment costs nothing. */
  function _popTokens() {
    var names = ['--bg', '--surface', '--surface2', '--surface3', '--border', '--border2', '--text', '--text-dim', '--text-faint',
      '--gold', '--gold-light', '--gold-dim', '--text-on-gold', '--r-sm', '--r-md', '--r-lg', '--r-pill', '--font-ui', '--font-mono'];
    var cs = getComputedStyle(document.documentElement), out = '', i, v;
    for (i = 0; i < names.length; i++) {
      v = (cs.getPropertyValue(names[i]) || '').trim();
      if (v) out += names[i] + ':' + v + ';';
    }
    return ':root{' + out + '}';
  }
  function _popCss() {
    return _popTokens() +
      'html,body{margin:0;height:100%;background:var(--bg,#16161b);color:var(--text,#fff);font-family:var(--font-ui),system-ui,sans-serif;overflow:hidden}' +
      '.pp{display:flex;flex-direction:column;height:100%;padding:10px 14px 14px;box-sizing:border-box}' +
      '.pp-head{display:flex;align-items:center;gap:8px;padding-bottom:2px;-webkit-app-region:drag}' +
      '.pp-name{flex:1;font-size:12.5px;font-weight:600;color:var(--text)}' +
      '.pp-dock{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border);background:transparent;color:var(--text-dim);border-radius:var(--r-sm);padding:5px 9px;font:600 11px/1 var(--font-ui);cursor:pointer}' +
      '.pp-dock:hover{background:var(--surface2);color:var(--text)}' +
      '.pomo-body{flex:1;display:flex;flex-direction:column;justify-content:center;padding:0}' +
      '.pomo-ring-wrap{position:relative;width:172px;height:172px;margin:2px auto 10px}' +
      '.pomo-ring{width:100%;height:100%;display:block}' +
      '.pomo-ring-bg{fill:none;stroke:var(--surface3);stroke-width:5}' +
      '.pomo-ring-fg{fill:none;stroke:var(--gold);stroke-width:5;stroke-linecap:round;transition:stroke-dashoffset .5s linear}' +
      '.pomo-face{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px}' +
      '.pomo-face-ic{color:var(--gold);display:flex;height:18px}' +
      '.pomo-time{font-family:var(--font-mono),ui-monospace,monospace;font-size:40px;font-weight:600;color:var(--text);line-height:1}' +
      '.pomo-dots{display:flex;gap:5px;margin-top:4px}' +
      '.pomo-dot{width:5px;height:5px;border-radius:50%;background:var(--surface3)}' +
      '.pomo-dot.on{background:var(--gold)}' +
      '.pomo-sub{display:flex;justify-content:center;gap:6px;margin-bottom:12px}' +
      '.pomo-sub-btn{display:inline-flex;align-items:center;gap:6px;background:transparent;border:0;color:var(--text-dim);padding:5px 10px;border-radius:var(--r-sm);font:500 11.5px/1 var(--font-ui);cursor:pointer}' +
      '.pomo-sub-btn:hover{background:var(--surface2);color:var(--text)}' +
      '.pomo-ctrls{display:flex;gap:8px}' +
      '.pomo-primary{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:7px;height:42px;border:0;border-radius:var(--r-md);cursor:pointer;font:600 13px/1 var(--font-ui);background:var(--gold);color:var(--text-on-gold)}' +
      '.pomo-primary.paused{background:var(--surface2);color:var(--text);border:1px solid var(--border)}' +
      '.pomo-proj{display:flex;align-items:center;gap:10px;width:100%;margin-top:10px;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-md);color:var(--text-dim);cursor:pointer;text-align:left}' +
      '.pomo-proj:hover{border-color:var(--border2)}' +
      '.pomo-proj-c{display:flex;flex-direction:column;gap:1px}' +
      '.pomo-proj-c em{font-style:normal;font:600 12px/1 var(--font-ui);color:var(--text)}' +
      '.pomo-proj-c i{font-style:normal;font:500 9.5px/1 var(--font-ui);letter-spacing:.06em;text-transform:uppercase;color:var(--text-faint)}' +
      '.pomo-proj-sep{width:1px;height:20px;background:var(--border)}' +
      '.pomo-proj-go{margin-left:auto;display:flex;color:var(--text-faint)}' +
      '.pp-hint{margin-top:8px;font:500 10px/1.4 var(--font-ui);color:var(--text-faint);text-align:center}';
  }

  function _popOut() {
    if (_pw && !_pw.closed) { try { _pw.focus(); } catch (e) {} return; }
    var s = st.size || { w: DEFW, h: DEFH };
    var w = Math.max(300, Math.min(560, s.w + 90)), h = Math.max(430, Math.min(780, s.h + 110));
    var feat = 'popup=yes,width=' + w + ',height=' + h + ',menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no';
    var win = null;
    try { win = window.open('', 'ccFocusWindow', feat); } catch (e) { win = null; }
    if (!win) { _toast('Your browser blocked the pop-up window. Allow pop-ups for this site.'); return; }
    _pw = win;
    _paintPopup();
    st.popped = true; st.mini = false;
    _renderChrome();
    _save();
  }

  function _paintPopup() {
    if (!_pw || _pw.closed) return;
    var d = _pw.document;
    // Web fonts live in the parent document; copy their <link>s so the popup matches the editor.
    var fonts = '';
    try {
      var links = document.querySelectorAll('link[rel="stylesheet"][href^="http"]');
      for (var i = 0; i < links.length && i < 4; i++) fonts += '<link rel="stylesheet" href="' + links[i].getAttribute('href') + '">';
    } catch (e) {}
    d.open();
    d.write('<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Focus</title>' + fonts +
      '<style>' + _popCss() + '</style></head><body><div class="pp">' +
      '<div class="pp-head"><span class="pp-name" id="pomo-name">Focus</span>' +
      '<button class="pp-dock" id="pop-dock" type="button">Bring back</button></div>' +
      '<div class="pomo-body">' + _bodyHtml(true) + '</div>' +
      '<div class="pp-hint">The timer keeps running in the editor even if you close this window.</div>' +
      '</div></body></html>');
    d.close();

    var g = function (id) { return d.getElementById(id); };
    if (g('pop-pomo-toggle')) g('pop-pomo-toggle').addEventListener('click', _toggle);
    if (g('pop-pomo-reset')) g('pop-pomo-reset').addEventListener('click', _reset);
    if (g('pop-pomo-skip')) g('pop-pomo-skip').addEventListener('click', function () { _complete(true); });
    if (g('pop-pomo-proj')) g('pop-pomo-proj').addEventListener('click', function () { try { window.focus(); } catch (e) {} _openWorkTab(); });
    if (g('pop-dock')) g('pop-dock').addEventListener('click', _redock);
    _pw.addEventListener('resize', _fitPopup);
    _fitPopup();
    _renderTimer();
    _refreshProject(true);
  }
  function _fitPopup() {
    if (!_pw || _pw.closed) return;
    _fitBody(_pw.document, _pw.innerWidth, _pw.innerHeight, 218);
  }
  function _redock() {
    if (_pw && !_pw.closed) { try { _pw.close(); } catch (e) {} }
    _pw = null; st.popped = false; _renderChrome(); _save();
    try { window.focus(); } catch (e) {}
  }
  function _popGone() {
    if (!st.popped) return false;
    if (_pw && !_pw.closed) return false;
    _pw = null; st.popped = false; _renderChrome(); _save();
    return true;
  }

  /* ── project strip ── */
  function _refreshProject(force) {
    var now = Date.now();
    if (!force && (now - _projT) < 20000) return;
    _projT = now;
    try {
      if (!window.CCWork) return;
      var t = CCWork.todayStats(), s = CCWork.series(), total = 0, i;
      for (i = 0; i < s.length; i++) total += s[i].pomodoros || 0;
      _proj = { activeMs: t.activeMs, total: total }; // today's work + this project's all-time Pomodoros
    } catch (e) { return; }
    _text('pomo-proj-time', _dur(_proj.activeMs));
    _text('pomo-proj-pomo', String(_proj.total));
  }
  function _openWorkTab() {
    if (window.CCWorkTab && CCWorkTab.open) { CCWorkTab.open(); return; }
    _toast('Work tab could not be loaded');
  }

  /* ── settings ── */
  function _row(label, key, val, unit) { return '<button class="pomo-set-row" data-open="' + key + '" type="button"><span>' + label + '</span><span class="pomo-set-val">' + val + ' <em>' + unit + '</em>' + _i('chevron-right', 15) + '</span></button>'; }
  function _sw(label, key, on) { return '<div class="pomo-set-row pomo-swrow"><span>' + label + '</span><button class="pomo-switch' + (on ? ' on' : '') + '" data-sw="' + key + '" type="button" role="switch" aria-checked="' + on + '"><span></span></button></div>'; }
  function _renderSettings() {
    var v = _q('pomo-view-settings'); if (!v) return; var c = st.cfg;
    var sure = _row('Focus duration', 'focusMin', c.focusMin, 'min') + _row('Short break', 'shortMin', c.shortMin, 'min') + _row('Long break', 'longMin', c.longMin, 'min') + _row('Long break every', 'longAfter', c.longAfter, 'blocks') + _sw('Auto-start breaks', 'autoBreak', c.autoBreak) + _sw('Auto-start focus', 'autoFocus', c.autoFocus);
    var bil = _sw('Toast notification', 'notifyToast', c.notifyToast) + _sw('Modal notification', 'notifyModal', c.notifyModal) + _sw('Sound notification', 'notifySound', c.notifySound);
    v.innerHTML =
      '<div class="pomo-set-head"><button class="pomo-ico" id="pomo-set-back" type="button" aria-label="Back">' + _i('chevron-left', 16) + '</button><strong>Settings</strong></div>' +
      '<div class="pomo-set-tabs"><button class="pomo-set-tab' + (st.settingsTab === 'sure' ? ' on' : '') + '" data-t="sure" type="button">Duration</button><button class="pomo-set-tab' + (st.settingsTab === 'bildirim' ? ' on' : '') + '" data-t="bildirim" type="button">Notification</button></div>' +
      '<div class="pomo-set-list">' + (st.settingsTab === 'sure' ? sure : bil) + '</div>';
    _q('pomo-set-back').addEventListener('click', function () { st.view = 'timer'; _renderView(); });
    v.querySelectorAll('.pomo-set-tab').forEach(function (t) { t.addEventListener('click', function () { st.settingsTab = this.getAttribute('data-t'); _renderSettings(); }); });
    v.querySelectorAll('.pomo-set-row[data-open]').forEach(function (r) { r.addEventListener('click', function () { _openStepper(this.getAttribute('data-open')); }); });
    v.querySelectorAll('.pomo-switch').forEach(function (s) { s.addEventListener('click', function () { var k = this.getAttribute('data-sw'); st.cfg[k] = !st.cfg[k]; this.classList.toggle('on', st.cfg[k]); this.setAttribute('aria-checked', st.cfg[k]); _save(); }); });
  }
  var STEP = { focusMin: { l: 'Focus duration', u: 'min', min: 1, max: 90 }, shortMin: { l: 'Short break', u: 'min', min: 1, max: 30 }, longMin: { l: 'Long break', u: 'min', min: 5, max: 60 }, longAfter: { l: 'Long break every', u: 'blocks', min: 2, max: 8 } };
  function _openStepper(key) {
    var m = STEP[key]; if (!m) return; var v = _q('pomo-view-settings');
    v.innerHTML =
      '<div class="pomo-set-head"><button class="pomo-ico" id="pomo-step-back" type="button" aria-label="Back">' + _i('chevron-left', 16) + '</button><strong>' + m.l + '</strong></div>' +
      '<div class="pomo-stepper">' +
        '<button class="pomo-step-btn" id="pomo-dec" type="button" aria-label="Decrease">' + _i('minus', 18) + '</button>' +
        '<div class="pomo-step-val"><span id="pomo-step-num">' + st.cfg[key] + '</span><em>' + m.u + '</em></div>' +
        '<button class="pomo-step-btn" id="pomo-inc" type="button" aria-label="Increase">' + _i('plus', 18) + '</button>' +
      '</div>';
    _q('pomo-step-back').addEventListener('click', _renderSettings);
    var upd = function (d) { st.cfg[key] = Math.max(m.min, Math.min(m.max, st.cfg[key] + d)); _q('pomo-step-num').textContent = st.cfg[key]; _save(); if (!st.running && (m === STEP[st.mode + 'Min'])) { st.remainingMs = _modeMs(st.mode); _renderTimer(); } };
    _q('pomo-dec').addEventListener('click', function () { upd(-1); });
    _q('pomo-inc').addEventListener('click', function () { upd(1); });
  }

  /* ── render ── */
  function _renderView() { var b = _q('pomo-card'); if (!b) return; var s = st.view === 'settings'; b.classList.toggle('showing-settings', s); if (s) _renderSettings(); else _renderTimer(); }
  function _renderChrome() {
    var w = _q('pomo-widget'); if (!w) return;
    w.classList.toggle('open', st.open);
    w.classList.toggle('mini', st.mini);
    w.classList.toggle('popped', st.popped);
    _applyPos(); _applySize();
    if (st.open && !st.mini && !st.popped) _renderView();
    else _renderTimer();
  }
  function _renderTimer() {
    var m = MODES[st.mode];
    var remain = st.running ? Math.max(0, st.endTs - Date.now()) : st.remainingMs;
    var total = _modeMs(st.mode), frac = total ? (total - remain) / total : 0, s = _fmt(remain);
    _text('pomo-time', s);
    var mt = _q('pomo-mini-time'); if (mt) mt.textContent = s;
    _text('pomo-name', m.label);
    _html('pomo-face-ic', _i(m.icon, 17));
    _style('pomo-ring-fg', 'strokeDashoffset', C * (1 - frac));
    _style('pop-pomo-ring-fg', 'strokeDashoffset', C * (1 - frac));
    var mfg = _q('pomo-mini-fg'); if (mfg) mfg.style.strokeDashoffset = (2 * Math.PI * 19) * (1 - frac);
    var n = st.cfg.longAfter, cur = st.doneCount % n, h = '', i;
    for (i = 0; i < n; i++) h += '<span class="pomo-dot' + (i < cur ? ' on' : '') + '"></span>';
    _html('pomo-dots', h);
    _text('pomo-primary-lbl', st.running ? 'Pause' : (remain < total ? 'Resume' : 'Start'));
    _html('pomo-primary-ic', _i(st.running ? 'pause' : 'play', 15));
    _cls('pomo-toggle', 'paused', st.running);
    _cls('pop-pomo-toggle', 'paused', st.running);
    var card = _q('pomo-card'); if (card) card.classList.toggle('pomo-run', st.running);
    _topBadge();
  }

  /* ── engine ── */
  function _tickLoop() { if (tickT) clearInterval(tickT); tickT = setInterval(_tick, 250); }
  function _tick() {
    _popGone();
    if (st.running && st.endTs - Date.now() <= 0) { _complete(false); return; }
    var visible = st.popped || st.mini || (st.open && st.view === 'timer');
    if (st.running || visible) { if (visible) _renderTimer(); else _topBadge(); }
    if (visible) _refreshProject(false);
  }
  function _toggle() { _ac(); if (st.running) { st.remainingMs = Math.max(0, st.endTs - Date.now()); st.running = false; st.endTs = 0; } else { if (!st.remainingMs || st.remainingMs <= 0) st.remainingMs = _modeMs(st.mode); st.endTs = Date.now() + st.remainingMs; st.remainingMs = 0; st.running = true; } _renderTimer(); }
  function _reset() { st.running = false; st.endTs = 0; st.remainingMs = _modeMs(st.mode); _renderTimer(); }
  function _setMode(m) { st.mode = m; st.running = false; st.endTs = 0; st.remainingMs = _modeMs(m); _save(); _renderTimer(); }
  function _complete(skipped) {
    var wasFocus = st.mode === 'focus';
    st.running = false; st.endTs = 0;
    if (!skipped) {
      var card = _q('pomo-card');
      if (card) { card.classList.add('pomo-flash'); setTimeout(function () { card.classList.remove('pomo-flash'); }, 900); }
      // Only a COMPLETED focus block counts for the project (a skip is not work).
      if (wasFocus) { try { if (window.CCWork) CCWork.notePomodoro(); } catch (e) {} _refreshProject(true); }
      _notify(wasFocus);
    }
    var next = wasFocus ? ((++st.doneCount % st.cfg.longAfter === 0) ? 'long' : 'short') : 'focus';
    _save(); _setMode(next);
    if (!skipped && (next === 'focus' ? st.cfg.autoFocus : st.cfg.autoBreak)) { st.remainingMs = _modeMs(next); _toggle(); }
  }

  /* ── notifications ── */
  function _notify(wasFocus) {
    var msg = wasFocus ? 'Focus block complete, time for a break! 🎉' : 'Break over, time to focus again! 🎯';
    if (st.cfg.notifySound) _chime();
    if (st.cfg.notifyToast) _toast(msg);
    if (st.cfg.notifyModal) _modal(wasFocus, msg);
  }
  function _modal(wasFocus, msg) {
    var ov = document.createElement('div'); ov.className = 'pomo-nmodal';
    ov.innerHTML = '<div class="pomo-nmodal-card"><span class="pomo-nmodal-ic">' + _i(wasFocus ? 'coffee' : 'target', 26) + '</span><h3>' + (wasFocus ? 'Great work!' : 'Break over') + '</h3><p>' + msg + '</p><button type="button" class="pomo-primary"><span>OK</span></button></div>';
    document.body.appendChild(ov);
    requestAnimationFrame(function () { ov.classList.add('show'); });
    var kill = function () { ov.classList.remove('show'); setTimeout(function () { if (ov.parentNode) ov.remove(); }, 220); };
    ov.querySelector('button').addEventListener('click', kill);
    ov.addEventListener('click', function (e) { if (e.target === ov) kill(); });
    setTimeout(kill, 8000);
  }

  /* ── open/close ── */
  function open() { _ensureWidget(); st.open = true; st.mini = false; st.view = 'timer'; if (!st.running && !st.remainingMs) st.remainingMs = _modeMs(st.mode); _renderChrome(); _refreshProject(true); _save(); }
  function close() { st.open = false; var w = _q('pomo-widget'); if (w) w.classList.remove('open'); _topBadge(); _save(); }
  function toggle() { if (st.open) close(); else open(); }

  function init() {
    _load();
    if (!st.remainingMs) st.remainingMs = _modeMs(st.mode);
    _injectTopButton();
    _tickLoop();
    try { if (window.CCWork && CCWork.onChange) CCWork.onChange(function () { _refreshProject(true); }); } catch (e) {}
    window.addEventListener('beforeunload', function () { if (_pw && !_pw.closed) { try { _pw.close(); } catch (e) {} } });
  }

  window.CCPomodoro = {
    open: open, close: close, toggle: toggle, setMode: _setMode, popOut: _popOut,
    /** Read-only snapshot for work-stats (focus vs break accrual). */
    state: function () {
      return {
        mode: st.mode, running: st.running,
        remainingMs: st.running ? Math.max(0, st.endTs - Date.now()) : st.remainingMs,
        doneCount: st.doneCount, popped: st.popped
      };
    }
  };

  if (window.cc && cc.on) cc.on('cc:canvas-ready', function () { cc.safe('slide-deck.timer-music-widget', init); });
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  if (window.cc && cc.modules) cc.modules.register({ id: 'timer-music-widget', parent: 'slide-deck', title: 'Pomodoro', mount: function () {}, unmount: function () {} });
})();
