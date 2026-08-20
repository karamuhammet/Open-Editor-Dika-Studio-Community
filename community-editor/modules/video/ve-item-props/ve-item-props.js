// ═══════════════════════════════════════════════════════════════════
//  VE-ITEM-PROPS - the docked, tabbed properties panel for the timeline
//  items that are NOT a media clip: a canvas OVERLAY object and a SUBTITLE.
//  dika studio Video Editor - MirexSoft
//
//  WHY THIS EXISTS (owner 2026-08-12: "bu paneli altyazılar ve track listeye
//  eklenen her şey için de göster, ama her obje için özel menü ayarları"):
//  a media clip already had a tabbed inspector docked in the right Properties
//  panel (VEInspector.renderInto). Everything else on the timeline did not.
//  An overlay fell through to the plain fabric sections, so its CLIP half -
//  when it starts, how long it lasts, its in/out transition - had no control
//  anywhere, even though the compositor has always applied an overlay's
//  transition (VE._veApplyOverlayTransition). A subtitle got its Style and
//  Animation pinned ABOVE the panel as a second, differently-shaped block.
//
//  THE PANEL IS NOT REBUILT HERE. VEInspector owns the one dock shell (the
//  pill bar, the accordion sections, the slider fill, the "show all" grids) and
//  lends it through `dockRender`; the per-type controls are the REAL panel
//  modules (#rp-text, #rp-uni-fill, #rp-shape, #rp-image, ...), MOVED into a
//  tab rather than cloned - a clone re-prefixes ids and kills every native
//  handler (kb/editor/context.md §10). Moving preserves the listeners because
//  every binding in those modules resolves by getElementById.
//
//  THE LOAN MUST BE GIVEN BACK, AND THE GIVE-BACK MUST NOT DEPEND ON ORDER
//  (§4g). Each borrowed block leaves a PLACEHOLDER COMMENT at its home, so a
//  restore is a single insertBefore that cannot throw and cannot care what any
//  other block did meanwhile. The expando is `_ccVipHome`, deliberately NOT the
//  image inspector's `_ccHome`: both may borrow the same block (an image
//  overlay lends #rp-uni-appearance to the image inspector, which is then
//  carried into this dock inside #rp-image), and each must restore to its own
//  position. VEInspector fires the release before ANY write to the dock's
//  innerHTML, or that write would delete the borrowed control from the
//  document for the rest of the session.
// ═══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var HOST_ID = 'rp-properties-wrap';

  /* Per-kind tab vocabulary. The pill row is DERIVED by VEInspector from the
     sections that really exist, so a tab listed here with nothing in it never
     renders - an empty tab is indistinguishable from a broken one. */
  /* An overlay's own controls take Basic/Color/Effect; its TIMELINE half (when it
     starts, how long, its in/out transition) gets a tab of its own rather than
     being mixed in. That is also what keeps an IMAGE overlay readable: #rp-image
     is itself a four-tab inspector, so folding the clip controls into a tab
     called "Effect" would have put the word twice on one screen, once for the
     picture and once for the clip. Derived pills then leave an image overlay
     with exactly two: Basic (the picture) and Clip (the timing). */
  var TABS = {
    overlay: [['temel', 'Basic'], ['renk', 'Color'], ['efekt', 'Effect'], ['clip', 'Clip']],
    subtitle: [['temel', 'Basic'], ['renk', 'Color'], ['efekt', 'Effect'], ['stil', 'Style'], ['anim', 'Animation']]
  };

  /* Where a borrowed panel block lands. A block whose tab is not in this kind's
     vocabulary falls back to the first tab rather than being filtered into a
     tab with no pill, which would hide a working control with no way back. */
  var ADOPT_TAB = {
    'rp-fig-bar': 'temel',
    'rp-text': 'temel',
    'rp-shape': 'temel',
    'rp-image': 'temel',
    'rp-qr': 'temel',
    'rp-barcode': 'temel',
    'rp-chart': 'temel',
    'rp-effect': 'temel',
    'rp-perspective': 'temel',
    'rp-wf-css': 'temel',
    'rp-design-fields': 'temel',
    'rp-uni-fill': 'renk',
    'rp-uni-appearance': 'renk',
    'rp-selcolors': 'renk',
    'rp-shadow': 'efekt',
    'rp-text-fx': 'efekt'
  };

  /* Never borrowed: these describe the PAGE or the empty state, not the
     selected item, and they are hidden by syncRightPanel anyway. Listing them
     keeps a future page-level block from silently drifting into an item panel. */
  var NEVER_ADOPT = { 'rp-empty': 1, 'rp-bg-panel': 1, 'rp-canvas-size': 1, 'rp-bg-effects': 1, 'rp-page-design-note': 1, 'rp-board': 1 };

  var _borrowed = [];      // [{el, disp}] currently living inside the dock
  var _lastObj = null;     // the object this panel was last built for (refresh)
  var _syncing = false;    // re-entrancy guard: refresh() re-runs syncRightPanel

  function _VE() { return window.__ccVideoEditor || null; }
  function _host() { return document.getElementById(HOST_ID); }
  function _ui() { return (window.VEInspector && VEInspector.ui) ? VEInspector.ui : null; }

  function _proj() {
    return (window.VideoEditor && VideoEditor.getProject) ? VideoEditor.getProject() : null;
  }

  function _findClip(clipId) {
    var p = _proj(); if (!p || !clipId) return null;
    for (var i = 0; i < p.tracks.length; i++) {
      var cl = p.tracks[i].clips || [];
      for (var j = 0; j < cl.length; j++) if (cl[j].id === clipId) return cl[j];
    }
    return null;
  }

  function _findTrack(trackId) {
    var p = _proj(); if (!p || !trackId) return null;
    for (var i = 0; i < p.tracks.length; i++) if (p.tracks[i].id === trackId) return p.tracks[i];
    return null;
  }

  function _esc(s) {
    var u = _ui();
    if (u && u.esc) return u.esc(s);
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function _num(v, dec) { var n = parseFloat(v); if (isNaN(n)) n = 0; return n.toFixed(dec == null ? 2 : dec); }

  // ── Which kind of timeline item is selected ─────────────────────────────
  function _kindFor(obj) {
    var VE = _VE();
    if (!VE || !VE._veActive || !obj) return null;
    if (obj._isCCSubtitle) return 'subtitle';
    if (obj._veClipId) {
      var clip = _findClip(obj._veClipId);
      // A media clip that happens to have a fabric object (a video dropped on the
      // canvas) is the MEDIA inspector's job - that panel knows about pooled
      // playback, grading and audio, and this one deliberately does not.
      if (clip && clip.type === 'overlay') return 'overlay';
    }
    return null;
  }

  /* The cue this panel edits is the one whose Textbox proxy is live
     (`_veSelectedCueId`, §7b: a strictly narrower question than "is it in the
     timeline selection"). With no live proxy the panel follows the PLAYHEAD,
     which is what the proxy itself does, so the two never describe different
     cues. `_veFindCueById` answers {track, cue, index}. */
  function _activeCue(VE, track) {
    if (VE && VE._veFindCueById && VE._veSelectedCueId) {
      var hit = VE._veFindCueById(VE._veSelectedCueId);
      if (hit && hit.cue && hit.track === track) return hit.cue;
    }
    var p = _proj();
    var t = p ? (p.playheadTime || 0) : 0;
    var cues = (track && track.cues) || [];
    for (var i = 0; i < cues.length; i++) {
      if (t >= (cues[i].startTime || 0) && t < (cues[i].endTime || 0)) return cues[i];
    }
    return null;
  }

  // ── Borrowing ───────────────────────────────────────────────────────────
  // Snapshot the blocks the normal panel decided to SHOW for this object, taken
  // BEFORE the dock hides its siblings (after that every display reads 'none'
  // and the answer would be "nothing is visible").
  function _visibleBlocks(kind) {
    var host = _host(); if (!host) return [];
    var out = [];
    Array.prototype.forEach.call(host.children, function (el) {
      var id = el.id || '';
      if (!id || id.indexOf('rp-') !== 0) return;
      if (NEVER_ADOPT[id]) return;
      if (el.style.display === 'none') return;
      out.push({ id: id, el: el, disp: el.style.display || '' });
    });
    return out;
  }

  function _tabOf(id, tabs) {
    var want = ADOPT_TAB[id] || 'temel';
    for (var i = 0; i < tabs.length; i++) if (tabs[i][0] === want) return want;
    return tabs[0][0];
  }

  function _borrow(rec, tab, wrap) {
    var slot = wrap.querySelector('#vip-adopt-' + tab);
    if (!slot) return;
    if (!rec.el._ccVipHome && rec.el.parentNode) {
      rec.el._ccVipHome = document.createComment('cc-vip-home:' + rec.id);
      rec.el.parentNode.insertBefore(rec.el._ccVipHome, rec.el);
    }
    slot.appendChild(rec.el);
    rec.el.style.display = rec.disp;   // the dock hid every sibling; this block is on purpose
    _borrowed.push(rec);
  }

  // Give every borrowed block back to its own placeholder. Order-free by
  // construction and it must never throw: VEInspector calls it from a hook.
  function release() {
    for (var i = 0; i < _borrowed.length; i++) {
      var rec = _borrowed[i], el = rec.el;
      if (!el) continue;
      var home = el._ccVipHome;
      if (home && home.parentNode) {
        if (el.parentNode !== home.parentNode || el.nextSibling !== home) home.parentNode.insertBefore(el, home);
      }
    }
    _borrowed = [];
    _lastObj = null;
  }

  // ── Sections this module owns ───────────────────────────────────────────
  function _timelineSection(clip, tab) {
    var u = _ui(); if (!u) return '';
    return u.accOpen('clock', 'Timeline', tab) +
      '<div class="ve-insp-row"><span class="ve-insp-label">Name</span>' +
        '<input class="ve-insp-input" id="vip-name" value="' + _esc(clip.name || '') + '"></div>' +
      '<div class="ve-insp-pair">' +
        '<div class="ve-insp-field"><span class="ve-insp-field-lb">Start</span>' +
          '<input type="number" class="ve-insp-input ve-insp-num" id="vip-start" value="' + _num(clip.startTime) + '" step="0.1" min="0"></div>' +
        '<div class="ve-insp-field"><span class="ve-insp-field-lb">Duration</span>' +
          '<input type="number" class="ve-insp-input ve-insp-num" id="vip-dur" value="' + _num(clip.duration) + '" step="0.1" min="0.1"></div>' +
      '</div>' +
    u.accClose();
  }

  function _transitionSection(clip, tab) {
    var u = _ui(); if (!u) return '';
    var trIn = (clip.transitions && clip.transitions.in) || { type: 'none', duration: 0.5 };
    var trOut = (clip.transitions && clip.transitions.out) || { type: 'none', duration: 0.5 };
    return u.accOpen('shuffle', 'Transitions', tab) +
      '<div class="ve-insp-trhead"><span>Intro</span><button class="ve-insp-fxall" data-trall="ve-insp-tr-in">Show all</button></div>' +
      u.transCards('ve-insp-tr-in', trIn.type || 'none') + u.durRow('ve-insp-tr-in-dur', trIn.duration || 0.5) +
      '<div class="ve-insp-trhead"><span>Exit</span><button class="ve-insp-fxall" data-trall="ve-insp-tr-out">Show all</button></div>' +
      u.transCards('ve-insp-tr-out', trOut.type || 'none') + u.durRow('ve-insp-tr-out-dur', trOut.duration || 0.5) +
    u.accClose();
  }

  function _cueSection(track, cue) {
    var u = _ui(); if (!u) return '';
    var n = (track.cues || []).length;
    var body = '';
    if (cue) {
      body += '<div class="ve-insp-pair">' +
        '<div class="ve-insp-field"><span class="ve-insp-field-lb">Start</span>' +
          '<input type="number" class="ve-insp-input ve-insp-num" id="vip-cue-start" value="' + _num(cue.startTime) + '" step="0.1" min="0"></div>' +
        '<div class="ve-insp-field"><span class="ve-insp-field-lb">End</span>' +
          '<input type="number" class="ve-insp-input ve-insp-num" id="vip-cue-end" value="' + _num(cue.endTime) + '" step="0.1" min="0"></div>' +
      '</div>';
    } else {
      // No cue under the playhead: say so rather than render two inputs that
      // write nowhere.
      body += '<div class="ve-insp-row"><span class="ve-insp-value">No cue at the playhead.</span></div>';
    }
    body += '<div class="ve-insp-specs">' +
        '<div class="ve-insp-spec"><span class="ve-insp-spec-k">Track</span><span class="ve-insp-spec-v">' + _esc(track.label || 'Subtitle') + '</span></div>' +
        '<div class="ve-insp-spec"><span class="ve-insp-spec-k">Cues</span><span class="ve-insp-spec-v">' + n + '</span></div>' +
      '</div>' +
      '<div class="ve-insp-row"><button class="ve-insp-btn" id="vip-open-cues">' + u.icon('list', 12) + ' Cue list</button></div>';
    return u.accOpen('captions', 'Subtitle', 'temel') + body + u.accClose();
  }

  function _panelSection(iconName, title, tab, bodyId) {
    var u = _ui(); if (!u) return '';
    return '<div class="ve-insp-section" data-veitab="' + tab + '">' +
      '<div class="ve-insp-section-title">' + u.icon(iconName, 12) + ' ' + _esc(title) + '</div>' +
      '<div class="ve-insp-section-body"><div id="' + bodyId + '"></div></div></div>';
  }

  function _adoptSlot(tab) {
    return '<div class="ve-insp-section vip-adopt" data-veitab="' + tab + '"><div class="vip-adopt-host" id="vip-adopt-' + tab + '"></div></div>';
  }

  // ── Writers ─────────────────────────────────────────────────────────────
  function _pushUndo(label) { var VE = _VE(); if (VE && VE._vePushUndo) VE._vePushUndo(label); }

  function _afterTimingChange() {
    var VE = _VE(); if (!VE) return;
    if (VE._veRecalcDuration) VE._veRecalcDuration();
    if (VE._veRender) VE._veRender();
    if (window.VideoEditor && VideoEditor.renderPreview) VideoEditor.renderPreview();
  }

  function _rerenderSubtitle() {
    if (window.VideoEditor && VideoEditor.render) VideoEditor.render();
    if (window.VideoEditor && VideoEditor.renderPreview) VideoEditor.renderPreview();
    if (window.VESubtitleElement && VESubtitleElement.refitSelected) VESubtitleElement.refitSelected();
  }

  function _bindNumber(wrap, id, apply) {
    var el = wrap.querySelector('#' + id); if (!el) return;
    el.addEventListener('change', function () {
      var v = parseFloat(el.value);
      if (isNaN(v)) { return; }
      apply(v);
    });
  }

  // ── Build ───────────────────────────────────────────────────────────────
  function _buildOverlay(obj, clip, blocks) {
    var tabs = TABS.overlay;
    var used = {};
    blocks.forEach(function (b) { used[_tabOf(b.id, tabs)] = true; });
    var html = '';
    if (used.temel) html += _adoptSlot('temel');
    if (used.renk) html += _adoptSlot('renk');
    if (used.efekt) html += _adoptSlot('efekt');
    html += _timelineSection(clip, 'clip') + _transitionSection(clip, 'clip');
    return { tabs: tabs, html: html };
  }

  function _buildSubtitle(obj, track, cue, blocks) {
    var tabs = TABS.subtitle;
    var used = {};
    blocks.forEach(function (b) { used[_tabOf(b.id, tabs)] = true; });
    var html = '';
    html += _cueSection(track, cue);
    if (used.temel) html += _adoptSlot('temel');
    if (used.renk) html += _adoptSlot('renk');
    if (used.efekt) html += _adoptSlot('efekt');
    html += _panelSection('palette', 'Style', 'stil', 'vip-sub-style');
    html += _panelSection('sparkles', 'Animation', 'anim', 'vip-sub-anim');
    return { tabs: tabs, html: html };
  }

  // ── Entry point (called at the end of syncRightPanel) ───────────────────
  // Returns true when this module took the panel over, so the caller knows the
  // normal sections are no longer the ones on screen.
  function sync(obj) {
    var kind = _kindFor(obj);
    if (!kind) { _lastObj = null; return false; }
    var host = _host();
    if (!host || !window.VEInspector || !VEInspector.dockRender || !_ui()) return false;

    var blocks = _visibleBlocks(kind);
    var built = null, clip = null, track = null, cue = null;

    if (kind === 'overlay') {
      clip = _findClip(obj._veClipId);
      if (!clip) return false;
      built = _buildOverlay(obj, clip, blocks);
    } else {
      var VE = _VE();
      track = _findTrack(obj._ccTrackId);
      if (!track) return false;
      cue = _activeCue(VE, track);
      built = _buildSubtitle(obj, track, cue, blocks);
    }

    _syncing = true;
    try {
    VEInspector.dockRender(host, {
      key: kind,
      tabs: built.tabs,
      html: built.html,
      // A re-render goes through the WHOLE pipeline, not through this function:
      // syncRightPanel is what decides which blocks are visible for this object,
      // and a shortcut back into sync() would read a panel whose siblings are
      // already hidden and conclude the object has no controls at all.
      rerender: function () { if (typeof syncRightPanel === 'function') syncRightPanel(); },
      onBound: function (wrap) {
        blocks.forEach(function (b) { _borrow(b, _tabOf(b.id, built.tabs), wrap); });
        if (kind === 'overlay') _bindOverlay(wrap, clip);
        else _bindSubtitle(wrap, track, cue);
      }
    });
    } finally { _syncing = false; }
    // Set LAST: dockRender fires the release hook, which clears it. A refresh
    // asked for before this line would have described a panel already gone.
    _lastObj = obj;
    return true;
  }

  function _bindOverlay(wrap, clip) {
    var u = _ui();
    var nameEl = wrap.querySelector('#vip-name');
    if (nameEl) nameEl.addEventListener('change', function () {
      clip.name = nameEl.value;
      var VE = _VE(); if (VE && VE._veRender) VE._veRender();
    });
    _bindNumber(wrap, 'vip-start', function (v) {
      _pushUndo('move clip');
      clip.startTime = Math.max(0, v);
      _afterTimingChange();
    });
    _bindNumber(wrap, 'vip-dur', function (v) {
      _pushUndo('resize clip');
      clip.duration = Math.max(0.1, v);
      _afterTimingChange();
    });
    // Transitions: the SAME binder the media inspector uses, so an overlay's
    // in/out behaves exactly like a clip's (undo + render + seek to the window).
    if (u && u.bindTransUI) u.bindTransUI(wrap, clip);
  }

  function _bindSubtitle(wrap, track, cue) {
    if (cue) {
      _bindNumber(wrap, 'vip-cue-start', function (v) {
        _pushUndo('cue timing');
        cue.startTime = Math.max(0, v);
        if (cue.endTime <= cue.startTime) cue.endTime = cue.startTime + 0.1;
        _afterTimingChange();
      });
      _bindNumber(wrap, 'vip-cue-end', function (v) {
        _pushUndo('cue timing');
        cue.endTime = Math.max((cue.startTime || 0) + 0.1, v);
        _afterTimingChange();
      });
    }
    var openBtn = wrap.querySelector('#vip-open-cues');
    if (openBtn) openBtn.addEventListener('click', function () {
      // The cue LIST is one editor and it lives in the left flyout. Rendering a
      // second copy here would fight it for VESubtitlePanel's single target.
      window._sdSubtitleTrackId = track.id;
      if (typeof window._sdShowSubtitlePanel === 'function') window._sdShowSubtitlePanel();
    });
    // Style + Animation are the REAL catalogue modules rendered into a tab body.
    var st = wrap.querySelector('#vip-sub-style');
    if (st && window.VESubtitleStyles && VESubtitleStyles.renderPanel) VESubtitleStyles.renderPanel(st, track, _rerenderSubtitle);
    var an = wrap.querySelector('#vip-sub-anim');
    if (an && window.VESubtitleAnim && VESubtitleAnim.renderPanel) VESubtitleAnim.renderPanel(an, track, _rerenderSubtitle);
  }

  // Re-run the whole selection pipeline (used by the subtitle element after a
  // track-side change). Cheap: syncRightPanel is what every selection does.
  function refresh() {
    if (_syncing || !_lastObj) return;
    if (typeof syncRightPanel === 'function') syncRightPanel();
  }

  function isActive() { return _borrowed.length > 0 || !!_lastObj; }

  window.VEItemProps = {
    sync: sync,
    release: release,
    refresh: refresh,
    isActive: isActive
  };

  // The dock is shared, so the borrowed blocks must go home before ANY write to
  // it - including a media clip re-render that would otherwise delete them.
  if (window.VEInspector && VEInspector.onDockRelease) VEInspector.onDockRelease(release);
  else if (window.cc && cc.on) cc.on('cc:canvas-ready', function () {
    if (window.VEInspector && VEInspector.onDockRelease) VEInspector.onDockRelease(release);
  });
})();

// Modular skeleton hook - ve-item-props is a video loader module. Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-item-props', parent: 'video', title: 've-item-props', mount: function () {}, unmount: function () {} });
