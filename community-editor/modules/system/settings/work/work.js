/* Module: system/settings/work — the "Work" settings pane.
   Per-PROJECT work & focus analytics: how long this project was worked on, on which days
   and hours, how many Pomodoros were finished in it, which pages were opened, and - when the
   project is shared - the same breakdown per collaborator.

   Data comes from two places and is MERGED per day (max per metric, never summed):
     - window.CCWork (system/work-stats): this device's local-first truth, includes anything
       not flushed yet, and is the ONLY source when the editor runs without an account.
     - GET /api/designs/<id>/work: the server rollup across the user's devices, plus the team.
   Max, not sum, because the server copy already contains what this device flushed; summing
   would double count the day you are sitting in.

   Privacy: the API decides what comes back (owner sees everyone, a grantee sees only itself
   plus the project total). This file renders what it is given and never asks for more.

   Charts are plain DOM/SVG on purpose: a settings pane must not pull a chart library over the
   network to draw eight bars. The heatmap sizes its cells (and, on "All", its week count) to
   the REAL pane width, so it fills the card instead of hiding in a corner of it. */
(function () {
  'use strict';
  var SS = window.__ccSettings;
  if (!SS) return;

  var state = { tab: 'overview', range: 'all', remote: null, err: null, loading: false, person: null, q: '' };
  var _resizeBound = false;
  var _lastW = 0;

  var WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* ── tiny helpers ── */
  function _i(n, s) { return (typeof getIcon === 'function') ? getIcon(n, s || 14) : ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function dKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseDay(s) { var p = String(s).split('-'); return new Date(+p[0], (+p[1]) - 1, +p[2]); }
  function shiftDay(s, n) { var t = parseDay(s); t.setDate(t.getDate() + n); return dKey(t); }
  function today() { return (window.CCWork && CCWork.today) ? CCWork.today() : dKey(new Date()); }

  function dur(ms) {
    var m = Math.round((ms || 0) / 60000);
    if (m < 1) return '0m';
    if (m < 60) return m + 'm';
    var h = Math.floor(m / 60), r = m % 60;
    return r ? h + 'h ' + r + 'm' : h + 'h';
  }
  function dayLabel(s) {
    var d = parseDay(s), month = MON[d.getMonth()];
    if (window.CCI18n && typeof CCI18n.t === 'function') month = CCI18n.t(month);
    return month + ' ' + d.getDate();
  }
  function relDay(s) {
    if (s === today()) return 'today';
    if (s === shiftDay(today(), -1)) return 'yesterday';
    return dayLabel(s);
  }
  /** A page id means nothing to a human: resolve it to its tab position when it still exists. */
  function pageLabel(id) {
    try {
      if (typeof pages !== 'undefined' && pages && pages.length) {
        for (var i = 0; i < pages.length; i++) {
          if (pages[i] && String(pages[i]._pageId) === String(id)) return 'Page ' + (i + 1);
        }
      }
    } catch (e) {}
    return 'Page ' + String(id).slice(-4).toUpperCase() + ' (removed)';
  }

  /* ── data ── */
  function blankDay(day) { return { day: day, activeMs: 0, focusMs: 0, breakMs: 0, pomodoros: 0, pageOpens: 0, sessions: 0, hours: [] }; }

  function mergeDays(a, b) {
    var map = {}, i, k, d;
    function put(list) {
      for (i = 0; i < list.length; i++) {
        d = list[i];
        k = d.day;
        if (!map[k]) map[k] = blankDay(k);
        var t = map[k];
        t.activeMs = Math.max(t.activeMs, d.activeMs || 0);
        t.focusMs = Math.max(t.focusMs, d.focusMs || 0);
        t.breakMs = Math.max(t.breakMs, d.breakMs || 0);
        t.pomodoros = Math.max(t.pomodoros, d.pomodoros || 0);
        t.pageOpens = Math.max(t.pageOpens, d.pageOpens || 0);
        t.sessions = Math.max(t.sessions, d.sessions || 0);
        var h = d.hours || [], j;
        for (j = 0; j < 24; j++) t.hours[j] = Math.max(t.hours[j] || 0, h[j] || 0);
        if (d.pages) { t.pages = t.pages || {}; for (var p in d.pages) if (d.pages.hasOwnProperty(p)) t.pages[p] = Math.max(t.pages[p] || 0, d.pages[p]); }
      }
    }
    put(a || []); put(b || []);
    var out = [];
    for (k in map) if (map.hasOwnProperty(k)) out.push(map[k]);
    return out.sort(function (x, y) { return x.day < y.day ? -1 : 1; });
  }

  function myDays() {
    var loc = [];
    try { if (window.CCWork) loc = CCWork.series(); } catch (e) {}
    var rem = (state.remote && state.remote.me) ? state.remote.me.days : [];
    return mergeDays(loc, rem);
  }

  function rangeDays() { return state.range === '7' ? 7 : state.range === '30' ? 30 : state.range === '90' ? 90 : 0; }
  function clip(days) {
    var n = rangeDays();
    if (!n) return days;
    var since = shiftDay(today(), -(n - 1));
    return days.filter(function (d) { return d.day >= since; });
  }

  function calc(days) {
    var s = {
      activeMs: 0, focusMs: 0, breakMs: 0, pomodoros: 0, pageOpens: 0, sessions: 0,
      activeDays: 0, hours: [], best: null, first: null, last: null, pages: {}
    };
    var i, j;
    for (i = 0; i < 24; i++) s.hours.push(0);
    for (i = 0; i < days.length; i++) {
      var d = days[i], worked = (d.activeMs > 0 || d.pomodoros > 0);
      s.activeMs += d.activeMs || 0; s.focusMs += d.focusMs || 0; s.breakMs += d.breakMs || 0;
      s.pomodoros += d.pomodoros || 0; s.pageOpens += d.pageOpens || 0; s.sessions += d.sessions || 0;
      if (worked) {
        s.activeDays++;
        if (!s.first) s.first = d.day;
        s.last = d.day;
        if (!s.best || d.activeMs > s.best.activeMs) s.best = d;
      }
      var h = d.hours || [];
      for (j = 0; j < 24; j++) s.hours[j] += h[j] || 0;
      if (d.pages) for (var p in d.pages) if (d.pages.hasOwnProperty(p)) s.pages[p] = (s.pages[p] || 0) + d.pages[p];
    }
    s.peak = -1;
    var mx = 0;
    for (j = 0; j < 24; j++) if (s.hours[j] > mx) { mx = s.hours[j]; s.peak = j; }
    s.avgDay = s.activeDays ? Math.round(s.activeMs / s.activeDays) : 0;
    var st2 = streaks(days);
    s.streak = st2.cur; s.longest = st2.best;
    return s;
  }

  /** Consecutive worked days. Today not being worked YET does not break the streak. */
  function streaks(days) {
    var set = {}, i;
    for (i = 0; i < days.length; i++) if (days[i].activeMs > 0 || days[i].pomodoros > 0) set[days[i].day] = 1;
    var keys = Object.keys(set).sort();
    if (!keys.length) return { cur: 0, best: 0 };
    var best = 1, run = 1;
    for (i = 1; i < keys.length; i++) {
      if (shiftDay(keys[i - 1], 1) === keys[i]) { run++; if (run > best) best = run; }
      else run = 1;
    }
    var t = today(), cur = 0, cursor = set[t] ? t : (set[shiftDay(t, -1)] ? shiftDay(t, -1) : null);
    while (cursor && set[cursor]) { cur++; cursor = shiftDay(cursor, -1); }
    return { cur: cur, best: best };
  }

  /* ── fragments ── */
  function tile(icon, key, value, sub, accent) {
    var label = (window.CCI18n && typeof CCI18n.t === 'function') ? CCI18n.t(key) : key;
    return '<div class="cw-stat' + (accent ? ' accent' : '') + '">' +
      '<div class="cw-stat-k">' + _i(icon, 13) + '<span>' + esc(label) + '</span></div>' +
      '<div class="cw-stat-v">' + value + '</div>' +
      (sub ? '<div class="cw-stat-s">' + esc(sub) + '</div>' : '') +
      '</div>';
  }

  /** Usable inner width of a chart card, measured from the live pane (fallback: a sane desktop). */
  function paneWidth() {
    var el = document.getElementById('cw-pane') || document.getElementById('settings-content');
    var w = el ? el.clientWidth : 0;
    if (!w) return 940;
    return Math.min(1080, w) - 40; // card padding + border
  }

  /**
   * The calendar is deliberately NOT cut by the range chips: three columns of squares in a
   * 1000px card is not a calendar. It always shows as many weeks as the card can hold (the
   * header says how many), while the range chips govern the tiles, the timeline and the
   * rankings. Same reasoning as every contribution graph: the long window IS the point.
   */
  var HEAT_GAP = 3, HEAT_LABEL = 34; // weekday column + its column gap
  function heatFit() {
    var avail = Math.max(240, paneWidth() - HEAT_LABEL);
    var weeks = Math.max(20, Math.min(53, Math.floor((avail + HEAT_GAP) / (15 + HEAT_GAP))));
    var cell = Math.max(12, Math.min(22, Math.floor((avail + HEAT_GAP) / weeks) - HEAT_GAP));
    return { weeks: weeks, cell: cell };
  }

  function heatmap(days) {
    var GAP = HEAT_GAP;
    var fit = heatFit(), weeks = fit.weeks, cell = fit.cell;

    var map = {}, i;
    for (i = 0; i < days.length; i++) map[days[i].day] = days[i];
    var t = today(), td = parseDay(t);
    // Column = a Monday-started week; the last column contains today.
    var dow = (td.getDay() + 6) % 7;
    var lastMon = shiftDay(t, -dow);
    var start = shiftDay(lastMon, -7 * (weeks - 1));

    var mx = 0;
    for (i = 0; i < days.length; i++) if (days[i].activeMs > mx) mx = days[i].activeMs;

    var cols = '', months = '', prevMon = -1, c, r;
    for (c = 0; c < weeks; c++) {
      var colStart = shiftDay(start, c * 7);
      var cm = parseDay(colStart).getMonth();
      months += '<span>' + (cm !== prevMon ? MON[cm] : '') + '</span>';
      prevMon = cm;
      var cells = '';
      for (r = 0; r < 7; r++) {
        var day = shiftDay(colStart, r);
        if (day > t) { cells += '<div class="cw-cell void"></div>'; continue; }
        var d = map[day], v = d ? d.activeMs : 0;
        var lvl = v <= 0 ? 0 : Math.max(1, Math.min(4, Math.ceil((v / (mx || 1)) * 4)));
        var tip = relDay(day) + ' · ' + dur(v) + (d && d.pomodoros ? ' · ' + d.pomodoros + ' pomodoro' : '');
        cells += '<div class="cw-cell" data-l="' + lvl + '" title="' + esc(tip) + '"></div>';
      }
      cols += '<div class="cw-heat-col">' + cells + '</div>';
    }

    var wd = '';
    for (r = 0; r < 7; r++) wd += '<span>' + (r % 2 === 0 ? WD[r] : '') + '</span>';

    var leg = '';
    for (i = 0; i < 5; i++) leg += '<i class="cw-cell" data-l="' + i + '" style="width:11px;height:11px"></i>';

    return '<div class="cw-heat-scroll"><div class="cw-heat" style="--cell:' + cell + 'px;--cgap:' + GAP + 'px">' +
        '<div class="cw-heat-wd">' + wd + '</div>' +
        '<div class="cw-heat-body">' +
          '<div class="cw-heat-months">' + months + '</div>' +
          '<div class="cw-heat-grid">' + cols + '</div>' +
        '</div>' +
      '</div></div>' +
      '<div class="cw-heat-legend"><span>Less</span>' + leg + '<span>More</span>' +
        '<span style="margin-left:auto">Busiest day: ' + (mx ? dur(mx) : '-') + '</span></div>';
  }

  /** Daily bars; collapses to weekly buckets past 45 days so the chart never turns into hair. */
  function bars(days, field, unit) {
    field = field || 'activeMs';
    var t = today(), n = rangeDays() || 0, list = [], i;
    if (!n) {
      var first = days.length ? days[0].day : t;
      n = Math.min(365, Math.max(14, Math.round((parseDay(t) - parseDay(first)) / 86400000) + 1));
    }
    var map = {};
    for (i = 0; i < days.length; i++) map[days[i].day] = days[i];
    for (i = n - 1; i >= 0; i--) {
      var k = shiftDay(t, -i);
      list.push({ day: k, v: map[k] ? (map[k][field] || 0) : 0 });
    }

    var weekly = list.length > 45;
    if (weekly) {
      var buck = [], cur = null;
      for (i = 0; i < list.length; i++) {
        var d0 = parseDay(list[i].day), dw = (d0.getDay() + 6) % 7;
        var wk = shiftDay(list[i].day, -dw);
        if (!cur || cur.day !== wk) { cur = { day: wk, v: 0 }; buck.push(cur); }
        cur.v += list[i].v;
      }
      list = buck;
    }

    var mx = 0;
    for (i = 0; i < list.length; i++) if (list[i].v > mx) mx = list[i].v;
    if (!mx) mx = 1;

    var html = '';
    for (i = 0; i < list.length; i++) {
      var h = Math.round((list[i].v / mx) * 100);
      var lab = (weekly ? ('week of ' + dayLabel(list[i].day)) : relDay(list[i].day)) + ' · ' +
        (unit === 'count' ? list[i].v + ' pomodoro' : dur(list[i].v));
      html += '<div class="cw-bar' + (list[i].v > 0 ? ' has' : '') + (list[i].day === t ? ' today' : '') + '" title="' + esc(lab) + '">' +
        '<i style="height:' + Math.max(list[i].v > 0 ? 4 : 2, h) + '%"></i></div>';
    }
    return '<div class="cw-bars">' + html + '</div>' +
      '<div class="cw-axis"><span>' + (list.length ? (weekly ? dayLabel(list[0].day) : relDay(list[0].day)) : '') + '</span>' +
      '<span>' + (weekly ? 'per week' : 'per day') + '</span><span>today</span></div>';
  }

  function hourChart(hours) {
    var mx = 0, i;
    for (i = 0; i < 24; i++) if (hours[i] > mx) mx = hours[i];
    var html = '';
    for (i = 0; i < 24; i++) {
      var h = mx ? Math.round((hours[i] / mx) * 100) : 0;
      html += '<div class="cw-hour' + (hours[i] > 0 ? ' has' : '') + (mx && hours[i] === mx ? ' peak' : '') + '" title="' + pad(i) + ':00 · ' + esc(dur(hours[i])) + '">' +
        '<i style="height:' + Math.max(2, h) + '%"></i></div>';
    }
    return '<div class="cw-hours">' + html + '</div>' +
      '<div class="cw-hours-ax"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>';
  }

  function rank(items, fmt) {
    if (!items.length) return '<div class="cw-note">' + _i('info', 14) + '<span>No data yet.</span></div>';
    var mx = items[0].v || 1, html = '', i;
    for (i = 0; i < items.length; i++) {
      html += '<div class="cw-rank-row">' +
        '<span class="cw-rank-n"' + (items[i].t ? ' title="' + esc(items[i].t) + '"' : '') + '>' + esc(items[i].k) + '</span>' +
        '<span class="cw-rank-v">' + esc(fmt(items[i].v)) + '</span>' +
        '<span class="cw-rank-t"><i style="width:' + Math.max(3, Math.round((items[i].v / mx) * 100)) + '%"></i></span>' +
        '</div>';
    }
    return '<div class="cw-rank">' + html + '</div>';
  }

  function empty(icon, title, body, btn) {
    return '<div class="cw-card"><div class="cw-empty">' +
      '<span class="cw-empty-ic">' + _i(icon, 22) + '</span>' +
      '<h4>' + esc(title) + '</h4><p>' + esc(body) + '</p>' + (btn || '') +
      '</div></div>';
  }
  function skeleton(rows) {
    var h = '', i;
    for (i = 0; i < (rows || 3); i++) h += '<div class="cw-sk cw-sk-row"></div>';
    return '<div class="cw-card">' + h + '</div>';
  }

  /* ── panes ── */
  function paneOverview() {
    var days = clip(myDays());
    var s = calc(days);
    if (!s.activeDays && !s.activeMs) {
      return (state.err ? errNote() : '') + empty('timer', 'No work recorded in this project yet',
        'The moment you start working in the editor, your time, the pages you open and the Pomodoros you finish land here.',
        '<button class="cw-btn" id="cw-open-pomo" type="button">' + _i('timer', 15) + 'Open Pomodoro</button>');
    }

    var pages = [];
    for (var p in s.pages) if (s.pages.hasOwnProperty(p)) pages.push({ k: pageLabel(p), v: s.pages[p], t: p });
    pages.sort(function (a, b) { return b.v - a.v; });
    pages = pages.slice(0, 5);

    return (state.err ? errNote() : '') +
      '<div class="cw-stats">' +
        tile('clock', 'Total time', dur(s.activeMs), s.sessions + ' sessions', true) +
        tile('target', 'Focus time', dur(s.focusMs), s.pomodoros + ' pomodoros') +
        tile('calendar', 'Active days', s.activeDays + '<small>days</small>', s.first ? dayLabel(s.first) + ' → ' + dayLabel(s.last) : '') +
        tile('trending-up', 'Daily average', dur(s.avgDay), s.best ? 'Best: ' + dur(s.best.activeMs) : '') +
      '</div>' +
      '<div class="cw-stats">' +
        tile('flame', 'Current streak', s.streak + '<small>days</small>', s.streak ? 'still going' : 'start one today') +
        tile('award', 'Longest streak', s.longest + '<small>days</small>') +
        tile('sunrise', 'Peak hour', s.peak >= 0 ? pad(s.peak) + ':00' : '-', s.peak >= 0 ? dur(s.hours[s.peak]) : '') +
        tile('file-text', 'Page opens', String(s.pageOpens), Object.keys(s.pages).length + ' distinct pages') +
      '</div>' +
      // The calendar reads the FULL series on purpose (see heatFit): it is the long-window view.
      '<div class="cw-card"><div class="cw-card-h"><h4>Work calendar</h4><span>last ' + heatFit().weeks + ' weeks · active time per day</span></div>' + heatmap(myDays()) + '</div>' +
      '<div class="cw-card"><div class="cw-card-h"><h4>Timeline</h4><span>' + (rangeDays() ? 'last ' + rangeDays() + ' days' : 'all time') + '</span></div>' + bars(days, 'activeMs') + '</div>' +
      '<div class="cw-card"><div class="cw-card-h"><h4>Time of day</h4><span>when you actually work</span></div>' + hourChart(s.hours) + '</div>' +
      '<div class="cw-card"><div class="cw-card-h"><h4>Most opened pages</h4><span>top 5</span></div>' +
        rank(pages, function (v) { return v + ' opens'; }) + '</div>';
  }

  function panePomodoro() {
    var days = clip(myDays());
    var s = calc(days);
    var cfg = {};
    try { cfg = JSON.parse(localStorage.getItem('dika_pomodoro_v1') || '{}').cfg || {}; } catch (e) {}
    if (!s.pomodoros && !s.focusMs) {
      return empty('target', 'No Pomodoro finished in this project yet',
        'A focus block counts once you take it all the way to the end. Skipped sessions are not counted.',
        '<button class="cw-btn" id="cw-open-pomo" type="button">' + _i('timer', 15) + 'Open Pomodoro</button>');
    }

    // Pomodoro count per weekday, so a rhythm is visible and not just a total.
    var wd = [0, 0, 0, 0, 0, 0, 0], i;
    for (i = 0; i < days.length; i++) {
      var idx = (parseDay(days[i].day).getDay() + 6) % 7;
      wd[idx] += days[i].pomodoros || 0;
    }
    var wdItems = [];
    for (i = 0; i < 7; i++) wdItems.push({ k: WD[i], v: wd[i] });
    var wdSorted = wdItems.slice().sort(function (a, b) { return b.v - a.v; });

    var ratio = s.focusMs + s.breakMs ? Math.round((s.focusMs / (s.focusMs + s.breakMs)) * 100) : 0;

    return '<div class="cw-stats">' +
        tile('target', 'Pomodoros', String(s.pomodoros), 'completed focus blocks', true) +
        tile('clock', 'Focus time', dur(s.focusMs)) +
        tile('coffee', 'Break time', dur(s.breakMs), ratio ? ratio + '% focus ratio' : '') +
        tile('activity', 'Daily average', (s.activeDays ? (s.pomodoros / s.activeDays).toFixed(1) : '0') + '<small>blocks</small>', s.activeDays + ' active days') +
      '</div>' +
      '<div class="cw-card"><div class="cw-card-h"><h4>Pomodoro history</h4><span>' + (rangeDays() ? 'last ' + rangeDays() + ' days' : 'all time') + '</span></div>' + bars(days, 'pomodoros', 'count') + '</div>' +
      '<div class="cw-card"><div class="cw-card-h"><h4>By weekday</h4><span>' + (wdSorted[0].v ? 'most productive: ' + wdSorted[0].k : '') + '</span></div>' +
        rank(wdSorted, function (v) { return v + ' blocks'; }) + '</div>' +
      '<div class="cw-card"><div class="cw-card-h"><h4>Timer settings</h4><span>edited in the Pomodoro window</span></div>' +
        '<div class="cw-stats">' +
          tile('target', 'Focus', (cfg.focusMin || 25) + '<small>min</small>') +
          tile('coffee', 'Short break', (cfg.shortMin || 5) + '<small>min</small>') +
          tile('coffee', 'Long break', (cfg.longMin || 15) + '<small>min</small>') +
          tile('repeat', 'Long break every', (cfg.longAfter || 4) + '<small>blocks</small>') +
        '</div>' +
        '<div style="margin-top:12px"><button class="cw-btn ghost" id="cw-open-pomo" type="button">' + _i('timer', 15) + 'Open Pomodoro</button></div>' +
      '</div>';
  }

  function personCard(p, isMe, openId) {
    var s = calc(p.days || []);
    var initials = (p.name || '?').trim().charAt(0).toUpperCase();
    var av = p.image ? '<img src="' + esc(p.image) + '" alt="">' : esc(initials);
    var inviteState = p.inviteStatus === 'pending' ? 'INVITED' : (p.inviteStatus === 'active' && !s.activeDays ? 'NO ACTIVITY YET' : '');
    var head = '<button class="cw-person' + (openId === p.userId ? ' on' : '') + '" type="button" data-person="' + esc(p.userId) + '" aria-expanded="' + (openId === p.userId) + '">' +
      '<span class="cw-av">' + av + '</span>' +
      '<span class="cw-who"><b>' + esc(p.name || 'User') + (isMe ? '<span class="cw-me">YOU</span>' : '') + (inviteState ? '<span class="cw-invite">' + inviteState + '</span>' : '') + '</b><span>' + esc(p.email || '') + '</span></span>' +
      '<span class="cw-pnums">' +
        '<span class="cw-pnum"><b>' + dur(s.activeMs) + '</b><span>time</span></span>' +
        '<span class="cw-pnum"><b>' + s.pomodoros + '</b><span>pomodoros</span></span>' +
        '<span class="cw-pnum"><b>' + s.activeDays + '</b><span>days</span></span>' +
      '</span></button>';
    if (openId !== p.userId) return head;

    var spark = '', i, mx = 0;
    var last = (p.days || []).slice(-30);
    for (i = 0; i < last.length; i++) if (last[i].activeMs > mx) mx = last[i].activeMs;
    for (i = 0; i < last.length; i++) spark += '<i style="height:' + Math.max(2, Math.round((last[i].activeMs / (mx || 1)) * 100)) + '%" title="' + esc(relDay(last[i].day) + ' · ' + dur(last[i].activeMs)) + '"></i>';

    return head + '<div class="cw-card" style="margin-top:-4px">' +
      '<div class="cw-stats">' +
        tile('clock', 'Total time', dur(s.activeMs), s.sessions + ' sessions', true) +
        tile('target', 'Focus', dur(s.focusMs), s.pomodoros + ' pomodoros') +
        tile('calendar', 'Active days', s.activeDays + '<small>days</small>', s.first ? dayLabel(s.first) + ' → ' + dayLabel(s.last) : '') +
        tile('sunrise', 'Peak hour', s.peak >= 0 ? pad(s.peak) + ':00' : '-') +
      '</div>' +
      (last.length ? '<div class="cw-detail"><div class="cw-card-h"><h4>Last 30 days</h4><span>' + esc(p.lastAt ? 'last seen ' + relDay(String(p.lastAt).slice(0, 10)) : '') + '</span></div><div class="cw-spark">' + spark + '</div></div>' : '') +
      '</div>';
  }

  function paneTeam() {
    var hasRemote = false;
    try { hasRemote = !!(window.CCWork && CCWork.designId()); } catch (e) {}
    if (!hasRemote) {
      return empty('cloud-off', 'This project is not saved to your account yet',
        'Team data is only kept for cloud-backed projects opened from the panel. Save this design and the per-collaborator breakdown shows up here.');
    }
    if (state.loading && !state.remote) return skeleton(4);
    if (state.err && !state.remote) {
      return '<div class="cw-card"><div class="cw-empty">' +
        '<span class="cw-empty-ic">' + _i('alert-circle', 22) + '</span>' +
        '<h4>Could not load team data</h4><p>' + esc(state.err) + '</p>' +
        '<button class="cw-btn ghost" id="cw-retry" type="button">' + _i('refresh-cw', 15) + 'Try again</button></div></div>';
    }
    var r = state.remote;
    if (!r) return skeleton(3);

    var people = r.people || [];
    var isOwner = r.scope === 'owner';
    var meId = r.me ? r.me.userId : null;

    if (isOwner && people.length <= 1) {
      return '<div class="cw-note">' + _i('users', 14) + '<span>You are the only one working on this project right now. Share it with someone and everyone\'s time, Pomodoros and active days get listed here separately.</span></div>' +
        (people.length ? '<div class="cw-people" id="cw-people">' + personCard(people[0], true, state.person) + '</div>' : '');
    }

    var q = (state.q || '').toLowerCase();
    var list = people.filter(function (p) {
      if (!q) return true;
      return (p.name || '').toLowerCase().indexOf(q) >= 0 || (p.email || '').toLowerCase().indexOf(q) >= 0;
    });

    var head = '';
    if (people.length > 8) {
      head = '<div class="cw-search">' + _i('search', 15) +
        '<input type="text" id="cw-team-q" placeholder="Search collaborators" value="' + esc(state.q) + '" autocomplete="off"></div>';
    }

    var pj = r.project || { activeMs: 0, pomodoros: 0, participants: 0, sessions: 0 };
    var collaboratorSub = (typeof pj.recordedParticipants === 'number')
      ? pj.recordedParticipants + ' with activity · ' + (pj.invitedParticipants || 0) + ' invited'
      : 'with recorded work';
    var summary = '<div class="cw-stats">' +
      tile('users', 'Collaborators', String(pj.participants || 0), collaboratorSub, true) +
      tile('clock', 'Project total', dur(pj.activeMs), pj.sessions + ' sessions') +
      tile('target', 'Pomodoros', String(pj.pomodoros || 0), 'all collaborators') +
      tile('file-text', 'Page opens', String(pj.pageOpens || 0)) +
      '</div>';

    if (!isOwner) {
      return summary +
        '<div class="cw-note">' + _i('lock', 14) + '<span>You are not the owner of this project, so you see your own breakdown and the project total only. Other collaborators\' individual data is never shared.</span></div>' +
        '<div class="cw-people" id="cw-people">' + (r.me ? personCard(r.me, true, state.person) : '') + '</div>';
    }

    var rows = '';
    for (var i = 0; i < list.length; i++) rows += personCard(list[i], list[i].userId === meId, state.person);
    if (!rows) rows = '<div class="cw-note">' + _i('search', 14) + '<span>No collaborator matches your search.</span></div>';

    return summary + head + '<div class="cw-people" id="cw-people">' + rows + '</div>';
  }

  function errNote() {
    return '<div class="cw-note warn">' + _i('alert-circle', 14) +
      '<span>Could not reach the server, showing what this device has recorded. ' + esc(state.err || '') + '</span></div>';
  }

  /* ── shell ── */
  function paneHtml() {
    if (state.tab === 'pomodoro') return panePomodoro();
    if (state.tab === 'team') return paneTeam();
    return paneOverview();
  }

  SS.buildWorkSection = function () {
    var tabs = [['overview', 'Overview'], ['pomodoro', 'Pomodoro'], ['team', 'Team']];
    var ranges = [['all', 'All'], ['90', '90d'], ['30', '30d'], ['7', '7d']];
    var t = '', r = '', i;
    for (i = 0; i < tabs.length; i++) t += '<button class="cw-tab' + (state.tab === tabs[i][0] ? ' on' : '') + '" data-t="' + tabs[i][0] + '" type="button" role="tab" aria-selected="' + (state.tab === tabs[i][0]) + '">' + tabs[i][1] + '</button>';
    for (i = 0; i < ranges.length; i++) r += '<button class="cw-rg' + (state.range === ranges[i][0] ? ' on' : '') + '" data-r="' + ranges[i][0] + '" type="button">' + ranges[i][1] + '</button>';
    return '<h2 class="settings-section-title">Work</h2>' +
      '<div class="cw">' +
        '<div class="cw-top"><div class="cw-tabs" role="tablist">' + t + '</div><div class="cw-range">' + r + '</div></div>' +
        '<div class="cw-pane" id="cw-pane">' + paneHtml() + '</div>' +
      '</div>';
  };

  function renderPane() {
    var el = document.getElementById('cw-pane');
    if (!el) return;
    _lastW = paneWidth();
    el.innerHTML = paneHtml();
    wirePane();
    if (window.CCI18n && typeof CCI18n.apply === 'function') CCI18n.apply(el);
  }

  function wirePane() {
    var el = document.getElementById('cw-pane');
    if (!el) return;
    var pomo = el.querySelector('#cw-open-pomo');
    if (pomo) pomo.addEventListener('click', function () {
      if (window.CCPomodoro) { SS.closeSettings(); CCPomodoro.open(); }
    });
    var retry = el.querySelector('#cw-retry');
    if (retry) retry.addEventListener('click', function () { state.err = null; state.remote = null; renderPane(); load(true); });
    var q = el.querySelector('#cw-team-q');
    if (q) q.addEventListener('input', function () {
      state.q = this.value;
      var box = document.getElementById('cw-people');
      if (!box) return;
      // Re-render only the list so the search box never loses focus mid-typing.
      var tmp = document.createElement('div');
      tmp.innerHTML = paneTeam();
      var fresh = tmp.querySelector('#cw-people');
      box.innerHTML = fresh ? fresh.innerHTML : '';
      wirePeople();
      if (window.CCI18n && typeof CCI18n.apply === 'function') CCI18n.apply(box);
    });
    wirePeople();
  }

  function wirePeople() {
    var box = document.getElementById('cw-people');
    if (!box) return;
    box.querySelectorAll('.cw-person').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = this.getAttribute('data-person');
        state.person = (state.person === id) ? null : id;
        renderPane();
      });
    });
  }

  function load(force) {
    var id = null;
    try { id = window.CCWork ? CCWork.designId() : null; } catch (e) {}
    if (!id) return;
    if (state.loading) return;
    if (state.remote && !force) return;
    state.loading = true;
    // Push whatever this device is holding first, so the rollup we read back includes today.
    var push = (window.CCWork && CCWork.flush) ? CCWork.flush(true) : Promise.resolve(false);
    push.catch(function () { return false; }).then(function () {
      return CCWork.fetchRemote(state.range);
    }).then(function (r) {
      state.remote = r; state.err = null;
    }).catch(function (e) {
      state.err = (e && e.message) ? e.message : 'Connection error';
    }).then(function () {
      state.loading = false;
      if (document.getElementById('cw-pane')) renderPane();
    });
  }

  SS.wireWorkHandlers = function () {
    var root = document.getElementById('settings-content');
    if (!root) return;
    root.querySelectorAll('.cw-tab').forEach(function (b) {
      b.addEventListener('click', function () {
        state.tab = this.getAttribute('data-t');
        root.querySelectorAll('.cw-tab').forEach(function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-selected', on); });
        renderPane();
        if (state.tab === 'team') load(false);
      });
    });
    root.querySelectorAll('.cw-rg').forEach(function (b) {
      b.addEventListener('click', function () {
        state.range = this.getAttribute('data-r');
        root.querySelectorAll('.cw-rg').forEach(function (x) { x.classList.toggle('on', x === b); });
        state.remote = null;
        renderPane();
        load(true);
      });
    });
    // The section string is built BEFORE it is in the DOM, so the charts start at the fallback
    // width; one re-render now sizes the heatmap to the real pane.
    renderPane();
    load(false);

    if (!_resizeBound) {
      _resizeBound = true;
      var t = null;
      window.addEventListener('resize', function () {
        if (!document.getElementById('cw-pane')) return; // self-guarding: no-op when the pane is closed
        if (t) clearTimeout(t);
        t = setTimeout(function () {
          if (!document.getElementById('cw-pane')) return;
          if (Math.abs(paneWidth() - _lastW) < 40) return; // only when the fit would really change
          renderPane();
        }, 180);
      });
    }
  };

  /** Open Settings straight on this pane (used by the Pomodoro widget's project strip). */
  window.CCWorkTab = {
    open: function () {
      var scr = document.getElementById('settings-screen');
      if (!scr) { SS.openSettingsScreen(); scr = document.getElementById('settings-screen'); }
      if (!scr) return;
      var btn = scr.querySelector('.settings-nav[data-section="work"]');
      if (btn) btn.click();
    }
  };

  if (window.cc && cc.modules) cc.modules.register({ id: 'work', parent: 'system.settings', title: 'Work', mount: function () {}, unmount: function () {} });
})();
