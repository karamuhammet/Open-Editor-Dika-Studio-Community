// ═══════════════════════════════════════════════════════════════════
//  VE-SUBTITLE-PANEL - Left docked captions editing panel (Phase 6)
//  dika studio Video Editor - MirexSoft
//  Appears after subtitles are loaded (CapCut/Canva-style). Lists cues with
//  inline text + timing editing, add (2s at the end, "Default"), merge/split,
//  search, and a bottom button group: upload SRT, download transcript,
//  translate (Phase 9), search. Reads/writes the captions track cues (the
//  single source of truth); every edit re-renders the preview.
// ═══════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  var _target = null;
  var _curTrackId = null;
  var _search = '';
  var _showReplace = false;   // find/replace row toggle
  var _ticker = null;         // playback active-cue highlighter (class-only, no re-render)
  var _listScrollTop = 0;
  var _pendingCueId = null;
  var VIRTUAL_THRESHOLD = 80;
  var VIRTUAL_CUE_HEIGHT = 76;
  var VIRTUAL_GAP_HEIGHT = 24;
  var VIRTUAL_OVERSCAN = 6;

  function _proj() { return (window.VideoEditor && VideoEditor.getProject) ? VideoEditor.getProject() : (window._veProject || null); }

  function _subtitleTracks() {
    var proj = _proj(); if (!proj) return [];
    return proj.tracks.filter(function(t) { return t.type === 'subtitle' || (t.cues && t.cues.length); });
  }

  function _track() {
    var tracks = _subtitleTracks();
    if (!tracks.length) return null;
    if (_curTrackId) {
      for (var i = 0; i < tracks.length; i++) if (tracks[i].id === _curTrackId) return tracks[i];
    }
    // prefer the canvas-selected one, else the first
    var selId = (window.VESubtitleElement && VESubtitleElement.getSelectedTrackId) ? VESubtitleElement.getSelectedTrackId() : null;
    if (selId) { for (var j = 0; j < tracks.length; j++) if (tracks[j].id === selId) { _curTrackId = selId; return tracks[j]; } }
    _curTrackId = tracks[0].id;
    return tracks[0];
  }

  function _trackSet(track) {
    var tracks = _subtitleTracks();
    if (!track || !track.subtitleSetId) return track ? [track] : [];
    return tracks.filter(function(candidate) { return candidate.subtitleSetId === track.subtitleSetId; })
      .sort(function(a, b) { return (a.speakerOrdinal || 999) - (b.speakerOrdinal || 999); });
  }

  function _safeColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : '#f2ff58';
  }

  function _rerender() {
    if (window.VideoEditor && VideoEditor.render) VideoEditor.render();
    if (window.VideoEditor && VideoEditor.renderPreview) VideoEditor.renderPreview();
  }

  function _icon(name, size) {
    if (window.__ccVideoEditor && window.__ccVideoEditor._veIcon) return window.__ccVideoEditor._veIcon(name, size || 14);
    if (typeof getIcon === 'function') { var r = getIcon(name, size || 14); if (r) return r; }
    return '';
  }

  // ── time format / parse (mm:ss.mmm) ──
  function _fmt(s) {
    s = Math.max(0, s || 0);
    var m = Math.floor(s / 60);
    var sec = Math.floor(s % 60);
    var ms = Math.round((s - Math.floor(s)) * 1000);
    function p2(n) { return n < 10 ? '0' + n : '' + n; }
    function p3(n) { return n < 10 ? '00' + n : n < 100 ? '0' + n : '' + n; }
    return p2(m) + ':' + p2(sec) + '.' + p3(ms);
  }
  function _parse(str) {
    var m = String(str).trim().match(/^(\d+):(\d+)(?:\.(\d+))?$/);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseInt((m[3] + '000').slice(0, 3), 10) / 1000 : 0);
  }

  function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function _trackLabel(track) {
    if (track && track.subtitleSetId && track.speakerOrdinal) return 'Speaker ' + track.speakerOrdinal;
    if (track && track.speakerId === 'speaker-unknown') return 'Speaker Unknown';
    return (track && (track.label || track.speakerId)) || 'Speaker';
  }

  function _cueEntries(cues, filtered, showGaps) {
    var entries = [];
    var prefix = [0];
    var cueIndexes = new Map();
    for (var ci = 0; ci < cues.length; ci++) cueIndexes.set(cues[ci], ci);
    for (var i = 0; i < filtered.length; i++) {
      var cue = filtered[i];
      var idx = cueIndexes.get(cue);
      var gap = showGaps && idx > 0 ? cue.startTime - cues[idx - 1].endTime : 0;
      var entry = { cue: cue, idx: idx, gap: gap >= 0.5 ? gap : 0 };
      entries.push(entry);
      prefix.push(prefix[prefix.length - 1] + VIRTUAL_CUE_HEIGHT + (entry.gap ? VIRTUAL_GAP_HEIGHT : 0));
    }
    entries._prefix = prefix;
    return entries;
  }

  function _cueEntryHtml(entry, cues) {
    var h = '';
    if (entry.gap) {
      h += '<div class="vsub-gap" data-t="' + cues[entry.idx - 1].endTime + '" title="Pause: click to go to that point. The Silence Cut tool removes them with one click.">' +
        '(... ' + entry.gap.toFixed(1) + ' sn)</div>';
    }
    return h + _cueRowHtml(entry.cue, entry.idx, entry.idx === cues.length - 1);
  }

  function _renderCueWindow(list, entries, cues, virtual) {
    if (!list) return;
    if (!entries.length) return;
    if (!virtual) {
      list.innerHTML = entries.map(function(entry) { return _cueEntryHtml(entry, cues); }).join('');
      return;
    }
    var prefix = entries._prefix;
    var scrollTop = Math.max(0, _listScrollTop || list.scrollTop || 0);
    var viewport = Math.max(240, list.clientHeight || 500);
    var low = 0, high = entries.length;
    while (low < high) {
      var mid = Math.floor((low + high) / 2);
      if (prefix[mid + 1] < scrollTop) low = mid + 1; else high = mid;
    }
    var start = Math.max(0, low - VIRTUAL_OVERSCAN);
    var end = start;
    var limit = scrollTop + viewport + VIRTUAL_OVERSCAN * VIRTUAL_CUE_HEIGHT;
    while (end < entries.length && prefix[end] < limit) end++;
    end = Math.min(entries.length, Math.max(end, start + 1));
    var h = '<div class="vsub-virtual-spacer" style="height:' + prefix[start] + 'px" aria-hidden="true"></div>';
    for (var i = start; i < end; i++) h += _cueEntryHtml(entries[i], cues);
    h += '<div class="vsub-virtual-spacer" style="height:' + Math.max(0, prefix[entries.length] - prefix[end]) + 'px" aria-hidden="true"></div>';
    var keepScroll = list.scrollTop;
    list.innerHTML = h;
    list.scrollTop = keepScroll;
    list.setAttribute('data-virtual-start', String(start));
    list.setAttribute('data-virtual-end', String(end));
  }

  // ── build / lifecycle ──
  // Render the panel into a host container (docked in the Video Tools flyout).
  function renderInto(container, trackId) {
    if (!container) return;
    if (trackId) _curTrackId = trackId;
    _target = container;
    render();
    _startTicker();
  }

  function isOpen() {
    return !!(_target && _target.isConnected && _target.querySelector && _target.querySelector('.vsub-hd'));
  }

  function render() {
    // Docked target may have been detached by a flyout re-render; bail so we
    // never write into an orphaned node (edits would silently vanish, M3).
    if (!_target || !_target.isConnected) { _target = null; return; }
    var previousList = _target.querySelector && _target.querySelector('#vsub-list');
    if (previousList) _listScrollTop = previousList.scrollTop || 0;
    var track = _track();
    if (!track) { _renderEmpty(); return; }
    _target.style.setProperty('--vsub-speaker-color', _safeColor(track._color));

    var cues = (track.cues || []).slice();
    var filtered = _search ? cues.filter(function(c) { return (c.text || '').toLowerCase().indexOf(_search.toLowerCase()) > -1; }) : cues;
    var setTracks = _trackSet(track);
    var showGaps = !_search;
    var cueEntries = _cueEntries(cues, filtered, showGaps);
    var virtual = cueEntries.length > VIRTUAL_THRESHOLD;
    if (_pendingCueId) {
      for (var pei = 0; pei < cueEntries.length; pei++) {
        if (cueEntries[pei].cue.id !== _pendingCueId) continue;
        _listScrollTop = Math.max(0, cueEntries._prefix[pei] - VIRTUAL_CUE_HEIGHT);
        break;
      }
      _pendingCueId = null;
    }

    var h = '';
    h += '<div class="vsub-hd"><span class="vsub-hd-cc">' + _icon('captions', 16) + '</span><span>Subtitles</span>' +
      '<button class="vsub-x" id="vsub-regen" title="Regenerate (AI)">' + _icon('refresh-cw', 14) + '</button>' +
      '</div>';

    if (track.subtitleSetId) {
      h += '<div class="vsub-track-rail" role="tablist" aria-label="Speaker subtitle tracks">';
      for (var sti = 0; sti < setTracks.length; sti++) {
        var setTrack = setTracks[sti];
        h += '<button class="vsub-track-chip' + (setTrack.id === track.id ? ' active' : '') + '" role="tab" aria-selected="' + (setTrack.id === track.id ? 'true' : 'false') + '" data-track-id="' + _esc(setTrack.id) + '">' +
          '<span class="vsub-track-dot" style="background:' + _safeColor(setTrack._color) + '"></span>' +
          '<span class="vsub-track-name">' + _esc(_trackLabel(setTrack)) + '</span>' +
          '<span class="vsub-track-count">' + ((setTrack.cues || []).length) + '</span></button>';
      }
      h += '</div>';
    }

    /* No "these captions are hidden" notice and no Show button (owner: no switch, it should just
       show). `VESubtitleElement.captionsVisible` derives it instead: a `captionVisible = false` from
       dubbing / translation only holds while the replacement set really carries cues. */

    // search + find/replace (CapCut parity: bulk text correction)
    h += '<div class="vsub-search"><span>' + _icon('search', 13) + '</span>' +
      '<input type="text" id="vsub-search-in" placeholder="Search in subtitle" value="' + _esc(_search) + '">' +
      '<button class="vsub-mini' + (_showReplace ? ' on' : '') + '" id="vsub-replace-toggle" title="Find and replace">' + _icon('replace', 13) + '</button></div>';
    if (_showReplace) {
      h += '<div class="vsub-search vsub-replace"><span>' + _icon('corner-down-right', 13) + '</span>' +
        '<input type="text" id="vsub-replace-in" placeholder="Replace with">' +
        '<button class="vsub-mini" id="vsub-replace-all" title="Replace all">' + _icon('check', 13) + '</button></div>';
    }

    // Cue list. Long transcripts render only visible rows; spacers preserve native scroll height.
    h += '<div class="vsub-list" id="vsub-list">';
    if (!filtered.length) {
      h += '<div class="vsub-empty">' + (cues.length ? 'No matching subtitle.' : 'No subtitles yet. Add or upload below.') + '</div>';
    }
    h += '</div>';

    // add
    h += '<button class="vsub-add" id="vsub-add">' + _icon('plus', 14) + ' Add</button>';

    // bottom button group
    h += '<div class="vsub-foot">' +
      '<button class="vsub-fbtn" id="vsub-style" title="Style and animation (templates)">' + _icon('brush', 15) + '</button>' +
      '<button class="vsub-fbtn" id="vsub-upload" title="Upload new subtitle/SRT">' + _icon('upload', 15) + '</button>' +
      '<button class="vsub-fbtn" id="vsub-download" title="Download transcript (.srt)">' + _icon('download', 15) + '</button>' +
      '<button class="vsub-fbtn" id="vsub-translate" title="Translation">' + _icon('languages', 15) + '</button>' +
      '<button class="vsub-fbtn" id="vsub-dub" title="Dubbing">' + _icon('mic', 15) + '</button>' +
      '<button class="vsub-fbtn" id="vsub-search-btn" title="Search">' + _icon('search', 15) + '</button>' +
      '</div>';

    _target.innerHTML = h;
    var list = _target.querySelector('#vsub-list');
    if (filtered.length) {
      list.scrollTop = _listScrollTop;
      _renderCueWindow(list, cueEntries, cues, virtual);
      list.scrollTop = _listScrollTop;
    }
    _wire(track, cues, cueEntries, virtual);
  }

  function _renderEmpty() {
    _target.innerHTML = '<div class="vsub-hd"><span class="vsub-hd-cc">' + _icon('captions', 16) + '</span><span>Subtitles</span>' +
      '<button class="vsub-x" id="vsub-regen" title="Generate (AI)">' + _icon('sparkles', 15) + '</button>' +
      '</div>' +
      '<div class="vsub-empty">No subtitles in this video.<br>Create with Auto Subtitle (AI).</div>';
    var rg = _target.querySelector('#vsub-regen'); if (rg) rg.onclick = function() { if (window.VEAutoSubtitle) VEAutoSubtitle.showModal(); };
  }

  function _cueRowHtml(cue, idx, isLast) {
    var sel = (window.__ccVideoEditor && window.__ccVideoEditor._veSelectedCueId === cue.id) ? ' selected' : '';
    return '<div class="vsub-cue' + sel + '" data-idx="' + idx + '">' +
        '<div class="vsub-cue-time">' +
          '<input class="vsub-t" data-field="start" data-idx="' + idx + '" value="' + _fmt(cue.startTime) + '"> ' +
          '<span class="vsub-t-sep">-</span> ' +
          '<input class="vsub-t" data-field="end" data-idx="' + idx + '" value="' + _fmt(cue.endTime) + '">' +
          '<span class="vsub-cue-actions">' +
            '<button class="vsub-mini" data-act="play" data-idx="' + idx + '" title="Oynat">' + _icon('play', 12) + '</button>' +
            '<button class="vsub-mini" data-act="split" data-idx="' + idx + '" title="Split">' + _icon('scissors', 12) + '</button>' +
            (isLast ? '' : '<button class="vsub-mini" data-act="merge" data-idx="' + idx + '" title="Merge with next">' + _icon('git-merge', 12) + '</button>') +
            '<button class="vsub-mini vsub-del" data-act="del" data-idx="' + idx + '" title="Delete">' + _icon('trash-2', 12) + '</button>' +
          '</span>' +
        '</div>' +
        '<textarea class="vsub-txt" data-idx="' + idx + '" rows="1">' + _esc(cue.text) + '</textarea>' +
      '</div>';
  }

  function _selectCueFromPanel(track, cue, repaintPanel) {
    var VE = window.__ccVideoEditor;
    if (!VE || !cue) return;
    VE._veSelectedCueId = cue.id;
    VE._veSelectedSubtitleTrackId = track.id;
    if (VE._veSeek) VE._veSeek(cue.startTime);
    if (window.VESubtitleElement && VESubtitleElement.selectTrack) VESubtitleElement.selectTrack(track, cue.id);
    _rerender();
    if (repaintPanel) {
      render();
      return;
    }
    var selectedRows = _target ? _target.querySelectorAll('.vsub-cue.selected') : [];
    for (var sri = 0; sri < selectedRows.length; sri++) selectedRows[sri].classList.remove('selected');
    var row = _target && _target.querySelector('.vsub-cue[data-idx="' + (track.cues || []).indexOf(cue) + '"]');
    if (row) row.classList.add('selected');
  }

  function _wireCueList(list, track, cues, cueEntries, virtual) {
    if (!list) return;
    list.oninput = function(e) {
      var input = e.target && e.target.closest ? e.target.closest('.vsub-txt') : null;
      if (!input) return;
      var cue = cues[+input.getAttribute('data-idx')];
      if (cue) { cue.text = input.value; _rerender(); }
    };
    list.onfocusin = function(e) {
      var input = e.target && e.target.closest ? e.target.closest('.vsub-txt, .vsub-t') : null;
      if (input) _selectCueFromPanel(track, cues[+input.getAttribute('data-idx')], false);
    };
    list.onchange = function(e) {
      var input = e.target && e.target.closest ? e.target.closest('.vsub-t') : null;
      if (!input) return;
      var cue = cues[+input.getAttribute('data-idx')]; if (!cue) return;
      var value = _parse(input.value);
      if (value == null) { input.value = _fmt(input.getAttribute('data-field') === 'start' ? cue.startTime : cue.endTime); return; }
      if (input.getAttribute('data-field') === 'start') cue.startTime = Math.min(value, cue.endTime - 0.1);
      else cue.endTime = Math.max(value, cue.startTime + 0.1);
      input.value = _fmt(input.getAttribute('data-field') === 'start' ? cue.startTime : cue.endTime);
      _rerender(); render();
    };
    list.onclick = function(e) {
      var target = e.target;
      var action = target && target.closest ? target.closest('.vsub-mini[data-act]') : null;
      if (action) {
        var idx = +action.getAttribute('data-idx');
        var act = action.getAttribute('data-act');
        var cue = cues[idx]; if (!cue) return;
        if (act === 'play') { if (window.__ccVideoEditor && window.__ccVideoEditor._veSeek) { window.__ccVideoEditor._veSeek(cue.startTime); _rerender(); } }
        else if (act === 'del') {
          var goneId = cue.id;
          track.cues.splice(idx, 1);
          var VEdel = window.__ccVideoEditor;
          // The deleted cue must not stay in either selection, or the trash button / Del key would
          // then be pointed at a cue that no longer exists.
          if (VEdel) {
            if (VEdel._veSelectedCues) VEdel._veSelectedCues = VEdel._veSelectedCues.filter(function (id) { return id !== goneId; });
            if (VEdel._veSelectedCueId === goneId && window.VESubtitleElement && VESubtitleElement.deselect) VESubtitleElement.deselect(true);
          }
          _pushUndo();
          _rerender(); render();
        }
        else if (act === 'merge') _merge(track, idx);
        else if (act === 'split') _split(track, idx);
        return;
      }
      var gap = target && target.closest ? target.closest('.vsub-gap') : null;
      if (gap) {
        var VE = window.__ccVideoEditor;
        if (VE && VE._veSeek) { VE._veSeek(+gap.getAttribute('data-t')); _rerender(); }
        return;
      }
      var row = target && target.closest ? target.closest('.vsub-cue') : null;
      if (row && !target.closest('input, textarea, button')) {
        var selectedCue = cues[+row.getAttribute('data-idx')]; if (!selectedCue) return;
        var editor = window.__ccVideoEditor;
        if (editor && editor._veSelectedCueId === selectedCue.id) {
          if (window.VESubtitleElement && VESubtitleElement.deselect) VESubtitleElement.deselect();
          else { editor._veSelectedCueId = null; editor._veSelectedSubtitleTrackId = null; _rerender(); render(); }
          return;
        }
        _selectCueFromPanel(track, selectedCue, true);
        return;
      }
      if (target === list || (target && target.classList && target.classList.contains('vsub-virtual-spacer'))) {
        if (window.VESubtitleElement && VESubtitleElement.deselect) VESubtitleElement.deselect();
      }
    };
    var scrollQueued = false;
    list.onscroll = function() {
      _listScrollTop = list.scrollTop || 0;
      if (!virtual || scrollQueued) return;
      scrollQueued = true;
      requestAnimationFrame(function() {
        scrollQueued = false;
        if (!_target || !list.isConnected) return;
        _renderCueWindow(list, cueEntries, cues, true);
      });
    };
  }

  function _wire(track, cues, cueEntries, virtual) {
    var rg = _target.querySelector('#vsub-regen'); if (rg) rg.onclick = function() { if (window.VEAutoSubtitle) VEAutoSubtitle.showModal(); };


    var trackChips = _target.querySelectorAll('.vsub-track-chip');
    for (var tci = 0; tci < trackChips.length; tci++) {
      trackChips[tci].onclick = (function(chip) {
        return function() {
          var trackId = chip.getAttribute('data-track-id');
          var tracks = _subtitleTracks();
          for (var trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
            if (tracks[trackIndex].id !== trackId) continue;
            _curTrackId = trackId;
            _listScrollTop = 0;
            window._sdSubtitleTrackId = trackId;
            if (window.VESubtitleElement && VESubtitleElement.selectTrack) VESubtitleElement.selectTrack(tracks[trackIndex]);
            render();
            return;
          }
        };
      })(trackChips[tci]);
    }

    var searchIn = _target.querySelector('#vsub-search-in');
    if (searchIn) searchIn.oninput = function(e) { _search = e.target.value; _listScrollTop = 0; render(); var s = _target.querySelector('#vsub-search-in'); if (s) { s.focus(); s.setSelectionRange(_search.length, _search.length); } };
    var list = _target.querySelector('#vsub-list');
    _wireCueList(list, track, cues, cueEntries, virtual);
    // find/replace
    var repT = _target.querySelector('#vsub-replace-toggle');
    if (repT) repT.onclick = function() { _showReplace = !_showReplace; render(); };
    var repA = _target.querySelector('#vsub-replace-all');
    if (repA) repA.onclick = function() {
      var find = _search.trim();
      var repl = (_target.querySelector('#vsub-replace-in') || {}).value || '';
      if (!find) { if (typeof showToast === 'function') showToast('First, type search text'); return; }
      var n = _replaceAll(track, find, repl);
      if (typeof showToast === 'function') showToast(n + ' replaced in subtitle');
      _rerender(); render();
    };
    // add
    var add = _target.querySelector('#vsub-add');
    if (add) add.onclick = function() { _addCue(track); };
    // footer
    var st = _target.querySelector('#vsub-style');
    if (st) st.onclick = function() {
      // The style/animation TEMPLATES already live in the right panel's subtitle section
      // (VESubtitleProps: Stil + Animasyon tabs) and appear when the track is selected on
      // canvas: bridge there instead of building a third picker.
      if (window.VESubtitleElement && VESubtitleElement.selectTrack) {
        VESubtitleElement.selectTrack(track);
        if (typeof showToast === 'function') showToast('Style and animation templates in the right panel');
      }
    };
    var up = _target.querySelector('#vsub-upload'); if (up) up.onclick = function() { _upload(track); };
    var dl = _target.querySelector('#vsub-download'); if (dl) dl.onclick = function() { _download(track); };
    var tr = _target.querySelector('#vsub-translate'); if (tr) tr.onclick = function() { _translate(track); };
    var dub = _target.querySelector('#vsub-dub'); if (dub) dub.onclick = function() {
      if (window.VEDubbing && VEDubbing.showDublaj) {
        VEDubbing.showDublaj({ sourceTrackId: track.id, subtitleSetId: track.subtitleSetId || null });
      } else if (typeof showToast === 'function') showToast('Dubbing is unavailable', 'error');
    };
    var sb = _target.querySelector('#vsub-search-btn'); if (sb) { sb.onclick = function() { var s = _target.querySelector('#vsub-search-in'); if (s) s.focus(); }; }
  }

  // ── cue operations ──
  /* Every cue mutation is undoable. None of these pushed an undo entry, so deleting, merging or
     splitting a cue could not be taken back with Ctrl+Z while DRAGGING one on the timeline could -
     the same data, two different answers to the same key. */
  function _pushUndo() {
    var VE = window.__ccVideoEditor;
    if (VE && VE._vePushUndo) VE._vePushUndo();
    if (VE && VE._veRecalcDuration) VE._veRecalcDuration();
  }
  function _addCue(track) {
    track.cues = track.cues || [];
    var last = track.cues.length ? track.cues[track.cues.length - 1] : null;
    var start = last ? last.endTime : (window.__ccVideoEditor ? window.__ccVideoEditor._veProject.playheadTime : 0);
    track.cues.push({ id: 'cue-' + Date.now() + '-' + Math.floor(Math.random() * 1000), startTime: start, endTime: start + 2, text: 'Default', style: {} });
    _pushUndo();
    _rerender(); render();
  }
  function _merge(track, idx) {
    var a = track.cues[idx], b = track.cues[idx + 1];
    if (!a || !b) return;
    a.text = (a.text + ' ' + b.text).trim();
    a.endTime = b.endTime;
    if (a.words && b.words) a.words = a.words.concat(b.words);
    track.cues.splice(idx + 1, 1);
    _pushUndo();
    _rerender(); render();
  }
  /* `atTime` is optional and clamped inside the cue: the panel's scissors button still splits down
     the middle, the timeline context menu splits at the playhead. ONE split implementation, one
     place the word-halving rule lives. */
  function _split(track, idx, atTime) {
    var c = track.cues[idx]; if (!c) return;
    var mid = (c.startTime + c.endTime) / 2;
    if (atTime != null && isFinite(atTime)) {
      var lo = c.startTime + 0.05, hi = c.endTime - 0.05;
      if (hi > lo) mid = Math.max(lo, Math.min(hi, atTime));
    }
    var words = (c.text || '').split(' ');
    var half = Math.ceil(words.length / 2);
    var t1 = words.slice(0, half).join(' '), t2 = words.slice(half).join(' ');
    var nb = { id: 'cue-' + Date.now() + '-' + Math.floor(Math.random() * 1000), startTime: mid, endTime: c.endTime, text: t2 || 'Default', style: {} };
    c.text = t1 || 'Default';
    c.endTime = mid;
    track.cues.splice(idx + 1, 0, nb);
    _pushUndo();
    _rerender(); render();
  }

  /* Find/replace across all cues (case-insensitive, literal). cue.words stays consistent:
     a single-token find patches the matching word tokens in place (karaoke timing kept);
     a multi-word find drops that cue's words array (falls back to even distribution) rather
     than leaving stale word text under the highlight. */
  function _replaceAll(track, find, repl) {
    var esc = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var re = new RegExp(esc, 'gi');
    var multi = /\s/.test(find) || /\s/.test(repl);
    var n = 0;
    (track.cues || []).forEach(function(c) {
      if (!re.test(c.text || '')) { re.lastIndex = 0; return; }
      re.lastIndex = 0;
      c.text = String(c.text).replace(re, repl);
      n++;
      if (c.words && c.words.length) {
        if (multi) { delete c.words; }
        else {
          var wre = new RegExp('^' + esc + '$', 'i');
          var pre = new RegExp('^' + esc + '(?=[.,!?;:…]*$)', 'i');
          c.words.forEach(function(w) {
            if (wre.test(w.w)) w.w = repl;
            else if (pre.test(w.w)) w.w = w.w.replace(pre, repl);
          });
        }
      }
    });
    return n;
  }

  // Playback follow: mark the ACTIVE cue row while the playhead moves. Class-only
  // (no re-render), cheap enough to poll while the panel is open.
  function _startTicker() {
    if (_ticker) return;
    _ticker = setInterval(function() {
      if (!isOpen()) { _stopTicker(); return; }
      var VE = window.__ccVideoEditor;
      var track = _track();
      if (!VE || !track || !_target || !_target.isConnected) return;
      var t = VE._veProject ? VE._veProject.playheadTime : 0;
      var cues = track.cues || [];
      var rows = _target.querySelectorAll('.vsub-cue');
      for (var i = 0; i < rows.length; i++) {
        var c = cues[+rows[i].getAttribute('data-idx')];
        var on = c && t >= c.startTime && t < c.endTime;
        if (on && rows[i].className.indexOf('playing') === -1) rows[i].classList.add('playing');
        else if (!on && rows[i].className.indexOf('playing') !== -1) rows[i].classList.remove('playing');
      }
    }, 300);
  }
  function _stopTicker() { if (_ticker) { clearInterval(_ticker); _ticker = null; } }

  /* Called by the timeline when a cue segment is clicked there: mirror the selection here
     (switch to its track, re-render, scroll the row into view). The other half of
     "tracklistte olması": the two surfaces now point at the same cue. */
  function syncSelection(cueId, trackId) {
    if (trackId) _curTrackId = trackId;
    if (!isOpen()) return;
    _pendingCueId = cueId || null;
    render();
    var sel = _target && _target.querySelector('.vsub-cue.selected');
    if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
  }

  // ── footer actions ──
  function _upload(track) {
    if (!window.VESubtitles || !VESubtitles.importVTT) return;
    VESubtitles.importVTT(function(cues) {
      if (!cues || !cues.length) return;
      track.cues = (track.cues || []).concat(cues);
      _rerender(); render();
    });
  }
  function _download(track) {
    var srt = (window.VEAutoSubtitle && VEAutoSubtitle.exportSRT) ? VEAutoSubtitle.exportSRT(track.cues || []) : '';
    var blob = new Blob([srt], { type: 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = (track.label || 'subtitles') + '.srt'; a.click();
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
  }
  function _translate(track) {
    if (window.VESubtitleTranslate && VESubtitleTranslate.showModal) VESubtitleTranslate.showModal(track);
    else if (typeof showToast === 'function') showToast('Translation soon', 'info');
  }

  window.VESubtitlePanel = {
    isOpen: isOpen, render: render, renderInto: renderInto,
    hasCues: function() { var t = _subtitleTracks(); for (var i = 0; i < t.length; i++) if (t[i].cues && t[i].cues.length) return true; return false; },
    setTrack: function(id) { _curTrackId = id; _listScrollTop = 0; if (isOpen()) render(); },
    syncSelection: syncSelection,
    // The timeline context menu drives the SAME cue operations this panel does (rule: one
    // implementation per behaviour). It passes a track + index, and split takes the playhead.
    addCue: _addCue, mergeCue: _merge, splitCue: _split,
    _replaceAll: _replaceAll   // test harness
  };
})();

// Modular skeleton hook - ve-subtitle-panel is a video loader module. Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-subtitle-panel', parent: 'video', title: 've-subtitle-panel', mount: function () {}, unmount: function () {} });
