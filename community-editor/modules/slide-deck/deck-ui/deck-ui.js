/* slide-suite.js — enterprise slide subsystem (owner rebuild 2026-07-12).
   ONE consolidated module that OWNS the modern slide experience and overrides the
   old broken pieces (present player, transition popover). Loaded LAST under the
   slide-deck group so its window.* assignments win in BOTH the dev shell (per-module
   scripts) and the prod bundle (hoisting-safe, because these are assignments not
   declarations). Depends on app globals resolved at call time: fabric, anime, pages,
   currentPageIndex, getActiveInnerSlide, pageHasSlideDeck, saveCurrentInnerSlide,
   loadInnerSlide, syncSlideDeckUi, SLIDE_DEFAULT_BG, _sdEnsureCurrentPage,
   _sdTouchSlide, _sdTouchDeck. No em-dash anywhere (owner rule). */
(function () {
  'use strict';

  var SUITE = window.__ccDeckUi || (window.__ccDeckUi = {});
  var DEFAULT_BG = (typeof SLIDE_DEFAULT_BG !== 'undefined') ? SLIDE_DEFAULT_BG : '#0d0d0d';

  // ── Transition registry (10 distinct, each with an inline SVG glyph so icons
  //    always render regardless of the Lucide set). directional flag drives the
  //    direction control in the modal. ──
  var TX = [
    { key:'none',   label:'None',        dir:false, svg:'<circle cx="12" cy="12" r="8"/><line x1="7" y1="7" x2="17" y2="17"/>' },
    { key:'fade',   label:'Dissolve',    dir:false, svg:'<rect x="3" y="5" width="8" height="14" rx="1"/><rect x="13" y="5" width="8" height="14" rx="1" opacity="0.4"/>' },
    { key:'slide',  label:'Slide',       dir:true,  svg:'<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M9 12h7M13 9l3 3-3 3"/>' },
    { key:'push',   label:'Push',        dir:true,  svg:'<path d="M4 12h6M8 9l3 3-3 3"/><path d="M14 12h6M18 9l3 3-3 3"/>' },
    { key:'wipe',   label:'Line Wipe',   dir:true,  svg:'<rect x="3" y="5" width="18" height="14" rx="1"/><line x1="12" y1="5" x2="12" y2="19"/>' },
    { key:'circle', label:'Circle Wipe', dir:false, svg:'<rect x="3" y="5" width="18" height="14" rx="1"/><circle cx="12" cy="12" r="4.5"/>' },
    { key:'cover',  label:'Stack',       dir:true,  svg:'<rect x="5" y="7" width="14" height="10" rx="1"/><rect x="3" y="5" width="14" height="10" rx="1"/>' },
    { key:'zoom',   label:'Zoom',        dir:false, svg:'<circle cx="11" cy="11" r="6"/><line x1="15.5" y1="15.5" x2="20" y2="20"/><line x1="11" y1="8.5" x2="11" y2="13.5"/><line x1="8.5" y1="11" x2="13.5" y2="11"/>' },
    { key:'flip',   label:'Flip',        dir:false, svg:'<path d="M12 4v16"/><path d="M6 8l-3 4 3 4z"/><path d="M18 8l3 4-3 4z"/>' },
    { key:'slice',  label:'Slice',       dir:false, svg:'<rect x="3" y="6" width="18" height="3" rx="1"/><rect x="3" y="11" width="18" height="3" rx="1" opacity="0.6"/><rect x="3" y="16" width="18" height="3" rx="1" opacity="0.3"/>' }
  ];
  var TX_BY_KEY = {}; TX.forEach(function (t) { TX_BY_KEY[t.key] = t; });
  SUITE.TX = TX;

  // ── Element entrance animation registry ──
  var ELEM = [
    { key:'none',    label:'None',      svg:'<circle cx="12" cy="12" r="8"/><line x1="7" y1="7" x2="17" y2="17"/>' },
    { key:'fade',    label:'Fade',      svg:'<rect x="4" y="6" width="16" height="12" rx="1" opacity="0.45"/>' },
    { key:'rise',    label:'Rise',      svg:'<path d="M12 20V6"/><path d="M7 11l5-5 5 5"/>' },
    { key:'sink',    label:'Sink',      svg:'<path d="M12 4v14"/><path d="M7 13l5 5 5-5"/>' },
    { key:'panL',    label:'Pan Left',  svg:'<path d="M4 12h14"/><path d="M9 7l-5 5 5 5"/>' },
    { key:'panR',    label:'Pan Right', svg:'<path d="M6 12h14"/><path d="M15 7l5 5-5 5"/>' },
    { key:'pop',     label:'Pop',       svg:'<circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>' },
    { key:'zoom',    label:'Zoom In',   svg:'<circle cx="11" cy="11" r="6"/><line x1="20" y1="20" x2="15.5" y2="15.5"/><line x1="11" y1="8.5" x2="11" y2="13.5"/><line x1="8.5" y1="11" x2="13.5" y2="11"/>' },
    { key:'spin',    label:'Spin',      svg:'<path d="M20 12a8 8 0 1 1-3-6.2"/><path d="M20 4v5h-5"/>' },
    { key:'breathe', label:'Breathe',   svg:'<circle cx="12" cy="12" r="7" opacity="0.4"/><circle cx="12" cy="12" r="3.5"/>' }
  ];
  var ELEM_BY_KEY = {}; ELEM.forEach(function (e) { ELEM_BY_KEY[e.key] = e; });
  SUITE.ELEM = ELEM;

  var EASINGS = [
    { key:'power2.out', label:'Ease Out' },
    { key:'power2.inOut', label:'Ease In-Out' },
    { key:'power4.out', label:'Ease Out Strong' },
    { key:'back.out(1.6)', label:'Overshoot' },
    { key:'none', label:'Linear' }
  ];

  function _svg(inner, size) {
    var s = size || 22;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  }

  function _curPage() { return (typeof _sdEnsureCurrentPage === 'function') ? _sdEnsureCurrentPage() : (typeof pages !== 'undefined' ? pages[currentPageIndex] : null); }
  function _deck() { var p = _curPage(); return (p && p._slideDeck) ? p._slideDeck : null; }
  function _hasDeck() { return typeof pageHasSlideDeck === 'function' && pageHasSlideDeck(_curPage()); }

  // Make a floating surface draggable by a handle (owner: modals must be movable).
  function _makeDraggable(panel, handle) {
    if (!panel || !handle || handle._ccDrag) return;
    handle._ccDrag = true;
    handle.style.cursor = 'move';
    handle.style.userSelect = 'none';
    handle.addEventListener('mousedown', function (e) {
      if (e.target && e.target.closest && e.target.closest('button, input, select, textarea')) return;
      var rect = panel.getBoundingClientRect();
      panel.style.setProperty('position', 'fixed', 'important');
      panel.style.setProperty('margin', '0', 'important');
      panel.style.setProperty('right', 'auto', 'important');
      panel.style.setProperty('bottom', 'auto', 'important');
      panel.style.setProperty('transform', 'none', 'important');
      panel.style.setProperty('left', rect.left + 'px', 'important');
      panel.style.setProperty('top', rect.top + 'px', 'important');
      var dx = e.clientX - rect.left, dy = e.clientY - rect.top;
      function mv(ev) {
        var l = Math.max(4, Math.min(window.innerWidth - 60, ev.clientX - dx));
        var t = Math.max(4, Math.min(window.innerHeight - 40, ev.clientY - dy));
        panel.style.setProperty('left', l + 'px', 'important');
        panel.style.setProperty('top', t + 'px', 'important');
      }
      function up() { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); }
      document.addEventListener('mousemove', mv);
      document.addEventListener('mouseup', up);
      e.preventDefault();
    });
  }

  // ============================================================
  // TRANSITION MODAL (B4) — scrollable, real icons, direction + easing + duration,
  // apply-to-all, live preview strip. Writes the rich transition fields on the slide.
  // ============================================================
  var _txModal = null, _txDraft = null, _txSlideIndex = -1;

  function _ensureTxModal() {
    if (_txModal && _txModal.parentNode) return _txModal;
    var m = document.createElement('div');
    m.className = 'cc-tx-modal';
    m.innerHTML =
      '<div class="cc-tx-panel" role="dialog" aria-label="Transitions and animations">' +
        '<div class="cc-tx-head"><span class="cc-tx-title">Transition &amp; Animation</span>' +
          '<button type="button" class="cc-tx-x" aria-label="Close">' + _svg('<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>', 16) + '</button></div>' +
        '<div class="cc-tx-tabs">' +
          '<button type="button" class="cc-tx-tab is-active" data-tab="transition">Slide transition</button>' +
          '<button type="button" class="cc-tx-tab" data-tab="animate">Element animation</button>' +
        '</div>' +
        '<div class="cc-tx-body">' +
          '<div class="cc-tx-sec cc-tx-sec-transition">' +
            '<div class="cc-tx-grid"></div>' +
            '<div class="cc-tx-controls">' +
              '<div class="cc-tx-row cc-tx-dirrow"><label>Direction</label><div class="cc-tx-seg" data-seg="dir"></div></div>' +
              '<div class="cc-tx-row"><label>Duration <span class="cc-tx-dur">0.6s</span></label><input type="range" class="cc-tx-range" min="0.2" max="2" step="0.1" value="0.6"></div>' +
              '<div class="cc-tx-row"><label>Easing</label><select class="cc-tx-ease"></select></div>' +
            '</div>' +
          '</div>' +
          '<div class="cc-tx-sec cc-tx-sec-animate" style="display:none">' +
            '<div class="cc-tx-row"><label>Element</label><select class="cc-tx-objsel"></select></div>' +
            '<div class="cc-tx-agrid"></div>' +
            '<div class="cc-tx-row cc-tx-trigrow"><label>Start</label><div class="cc-tx-seg" data-seg="trig"></div></div>' +
            '<button type="button" class="cc-tx-btn cc-tx-playanim">Preview on canvas</button>' +
          '</div>' +
        '</div>' +
        '<div class="cc-tx-foot">' +
          '<button type="button" class="cc-tx-btn cc-tx-cancel">Close</button>' +
          '<button type="button" class="cc-tx-btn cc-tx-all">Apply transition to all</button>' +
          '<button type="button" class="cc-tx-btn cc-tx-apply cc-tx-primary">Apply</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);
    _txModal = m;
    _makeDraggable(m.querySelector('.cc-tx-panel'), m.querySelector('.cc-tx-head'));

    var grid = m.querySelector('.cc-tx-grid');
    TX.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'cc-tx-choice'; b.setAttribute('data-tx', t.key);
      b.innerHTML = '<span class="cc-tx-ico">' + _svg(t.svg) + '</span><span class="cc-tx-lbl">' + t.label + '</span>';
      b.onclick = function () { _txDraft.preset = t.key; _txSyncModal(); };
      grid.appendChild(b);
    });

    var seg = m.querySelector('[data-seg="dir"]');
    [['auto','Auto'],['left','Left'],['right','Right'],['up','Up'],['down','Down']].forEach(function (d) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'cc-tx-segbtn'; b.setAttribute('data-dir', d[0]); b.textContent = d[1];
      b.onclick = function () { _txDraft.direction = d[0]; _txSyncModal(); };
      seg.appendChild(b);
    });

    var ease = m.querySelector('.cc-tx-ease');
    EASINGS.forEach(function (e) { var o = document.createElement('option'); o.value = e.key; o.textContent = e.label; ease.appendChild(o); });
    ease.onchange = function () { _txDraft.easing = ease.value; };

    var range = m.querySelector('.cc-tx-range');
    range.oninput = function () { _txDraft.duration = parseFloat(range.value); m.querySelector('.cc-tx-dur').textContent = _txDraft.duration.toFixed(1) + 's'; };

    // Element animation tab: a preset grid with icons (owner: animations need icons).
    var agrid = m.querySelector('.cc-tx-agrid');
    ELEM.forEach(function (e) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'cc-tx-choice cc-tx-achoice'; b.setAttribute('data-anim', e.key);
      b.innerHTML = '<span class="cc-tx-ico">' + _svg(e.svg) + '</span><span class="cc-tx-lbl">' + e.label + '</span>';
      b.onclick = function () { _txSetAnim(e.key); };
      agrid.appendChild(b);
    });
    var tseg = m.querySelector('[data-seg="trig"]');
    [['with','With prev'],['after','After prev']].forEach(function (d) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'cc-tx-segbtn'; b.setAttribute('data-trig', d[0]); b.textContent = d[1];
      b.onclick = function () { _txSetAnimTrigger(d[0]); };
      tseg.appendChild(b);
    });
    m.querySelector('.cc-tx-objsel').onchange = function () { _txSyncAnimate(); };
    m.querySelector('.cc-tx-playanim').onclick = function () { var s = _txTargetSlide(); if (s && window.canvas && s === _activeSlide()) { if (typeof saveCurrentInnerSlide === 'function') saveCurrentInnerSlide(); _prPlayElemAnims(window.canvas, s); } };

    Array.prototype.forEach.call(m.querySelectorAll('.cc-tx-tab'), function (tab) { tab.onclick = function () { _txSetTab(tab.getAttribute('data-tab')); }; });

    m.querySelector('.cc-tx-x').onclick = closeTxModal;
    m.querySelector('.cc-tx-cancel').onclick = closeTxModal;
    m.querySelector('.cc-tx-apply').onclick = function () { _txCommit(false); };
    m.querySelector('.cc-tx-all').onclick = function () { _txCommit(true); };
    m.addEventListener('mousedown', function (e) { if (e.target === m) closeTxModal(); });
    return m;
  }

  function _txTargetSlide() { var deck = _deck(); return deck ? deck.slides[_txSlideIndex] : null; }

  function _txSetTab(tab) {
    var m = _txModal; if (!m) return;
    Array.prototype.forEach.call(m.querySelectorAll('.cc-tx-tab'), function (t) { t.classList.toggle('is-active', t.getAttribute('data-tab') === tab); });
    m.querySelector('.cc-tx-sec-transition').style.display = tab === 'transition' ? '' : 'none';
    m.querySelector('.cc-tx-sec-animate').style.display = tab === 'animate' ? '' : 'none';
    m.querySelector('.cc-tx-all').style.display = tab === 'transition' ? '' : 'none';
    m.querySelector('.cc-tx-apply').style.display = tab === 'transition' ? '' : 'none';
    if (tab === 'animate') _txSyncAnimate();
  }

  function _txSyncAnimate() {
    var m = _txModal; if (!m) return;
    var deck = _deck(); if (!deck) return;
    var slide = deck.slides[_txSlideIndex]; if (!slide) return;
    var isActive = _txSlideIndex === deck.activeSlideIndex;
    var srcAll = (isActive && window.canvas) ? window.canvas.getObjects() : ((slide.json && slide.json.objects) || []);
    var objs = srcAll.filter(function (o) { return !o._isFrameBg; });
    var sel = m.querySelector('.cc-tx-objsel');
    if (sel._ccCount !== objs.length) {
      sel.innerHTML = '';
      objs.forEach(function (o, i) { var opt = document.createElement('option'); opt.value = String(i); opt.textContent = _objLabel(o, i); sel.appendChild(opt); });
      sel._ccCount = objs.length;
    }
    m.querySelector('.cc-tx-sec-animate').classList.toggle('is-empty', !objs.length);
    var oi = parseInt(sel.value, 10); if (isNaN(oi)) oi = 0;
    var obj = objs[oi];
    var realIndex = obj ? srcAll.indexOf(obj) : -1;
    m._txAnimRealIndex = realIndex; m._txAnimOrder = oi;
    var cur = (realIndex >= 0) ? _animGet(slide, realIndex) : null;
    var preset = cur ? cur.preset : 'none';
    var trig = cur ? cur.trigger : 'after';
    Array.prototype.forEach.call(m.querySelectorAll('.cc-tx-achoice'), function (b) { b.classList.toggle('is-active', b.getAttribute('data-anim') === preset); });
    Array.prototype.forEach.call(m.querySelectorAll('[data-trig]'), function (b) { b.classList.toggle('is-active', b.getAttribute('data-trig') === trig); });
  }

  function _txSetAnim(key) {
    var m = _txModal; var slide = _txTargetSlide(); if (!slide) return;
    var idx = m._txAnimRealIndex; if (typeof idx !== 'number' || idx < 0) return;
    _animSet(slide, idx, { preset: key, order: m._txAnimOrder || 0 });
    _txSyncAnimate();
  }
  function _txSetAnimTrigger(trig) {
    var m = _txModal; var slide = _txTargetSlide(); if (!slide) return;
    var idx = m._txAnimRealIndex; if (typeof idx !== 'number' || idx < 0) return;
    var cur = _animGet(slide, idx); if (!cur || cur.preset === 'none') return;
    _animSet(slide, idx, { trigger: trig });
    _txSyncAnimate();
  }

  function _txSyncModal() {
    var m = _txModal; if (!m) return;
    var choices = m.querySelectorAll('.cc-tx-choice');
    for (var i = 0; i < choices.length; i++) {
      choices[i].classList.toggle('is-active', choices[i].getAttribute('data-tx') === _txDraft.preset);
    }
    var t = TX_BY_KEY[_txDraft.preset] || TX_BY_KEY.none;
    m.querySelector('.cc-tx-dirrow').style.display = t.dir ? '' : 'none';
    var segbtns = m.querySelectorAll('.cc-tx-segbtn');
    for (var j = 0; j < segbtns.length; j++) {
      segbtns[j].classList.toggle('is-active', segbtns[j].getAttribute('data-dir') === _txDraft.direction);
    }
    m.querySelector('.cc-tx-range').value = _txDraft.duration;
    m.querySelector('.cc-tx-dur').textContent = _txDraft.duration.toFixed(1) + 's';
    m.querySelector('.cc-tx-ease').value = _txDraft.easing;
  }

  function openTxModal(slideIndex) {
    if (!_hasDeck()) return;
    var deck = _deck();
    var idx = (typeof slideIndex === 'number') ? slideIndex : (deck.activeSlideIndex || 0);
    var slide = deck.slides[idx];
    if (!slide) return;
    _txSlideIndex = idx;
    _txDraft = {
      preset: slide.transition || 'none',
      direction: slide.transitionDirection || 'auto',
      duration: isFinite(parseFloat(slide.transitionDuration)) ? parseFloat(slide.transitionDuration) : 0.6,
      easing: slide.transitionEasing || 'power2.out'
    };
    var m = _ensureTxModal();
    var sel = m.querySelector('.cc-tx-objsel'); if (sel) sel._ccCount = -1;
    m.classList.add('is-open');
    _txSyncModal();
    _txSetTab('transition');
  }

  function closeTxModal() { if (_txModal) _txModal.classList.remove('is-open'); }

  function _writeTxToSlide(slide) {
    slide.transition = _txDraft.preset;
    slide.transitionPreset = _txDraft.preset;
    slide.transitionDirection = _txDraft.direction;
    slide.transitionDuration = _txDraft.duration;
    slide.transitionEasing = _txDraft.easing;
    if (typeof _sdTouchSlide === 'function') _sdTouchSlide(slide);
  }

  function _txCommit(all) {
    var deck = _deck(); if (!deck) { closeTxModal(); return; }
    if (all) { deck.slides.forEach(function (s) { _writeTxToSlide(s); }); }
    else if (deck.slides[_txSlideIndex]) { _writeTxToSlide(deck.slides[_txSlideIndex]); }
    if (typeof _sdTouchDeck === 'function') _sdTouchDeck(_curPage());
    if (typeof syncSlideDeckUi === 'function') syncSlideDeckUi();
    closeTxModal();
  }

  SUITE.openTxModal = openTxModal;

  // ============================================================
  // PRESENT ENGINE (B5 transitions + B6/B7 element animations + presenter)
  // Live fabric StaticCanvas per slide, real transitions on the stage layers,
  // per-element entrance animations played on slide enter.
  // ============================================================
  var PR = { open:false, idx:0, token:0, cur:0, stages:[null,null], scs:[null,null], overlay:null, autoplay:false, timer:0, black:false, scale:1 };

  function _prBuild() {
    if (PR.overlay) return PR.overlay;
    var o = document.createElement('div');
    o.className = 'cc-present';
    o.innerHTML =
      '<div class="cc-pr-progress"><div class="cc-pr-progress-fill"></div></div>' +
      '<div class="cc-pr-viewport">' +
        '<div class="cc-pr-track">' +
          '<div class="cc-pr-stage" data-stage="0"></div>' +
          '<div class="cc-pr-stage" data-stage="1"></div>' +
        '</div>' +
      '</div>' +
      '<div class="cc-pr-notes" aria-hidden="true"></div>' +
      '<div class="cc-pr-bar">' +
        '<button type="button" class="cc-pr-b" data-a="prev" aria-label="Previous">' + _svg('<path d="M15 6l-6 6 6 6"/>', 18) + '</button>' +
        '<span class="cc-pr-count">1 / 1</span>' +
        '<button type="button" class="cc-pr-b" data-a="next" aria-label="Next">' + _svg('<path d="M9 6l6 6-6 6"/>', 18) + '</button>' +
        '<button type="button" class="cc-pr-b" data-a="autoplay" aria-label="Autoplay">' + _svg('<path d="M8 5v14l11-7z"/>', 18) + '</button>' +
        '<button type="button" class="cc-pr-b" data-a="notes" aria-label="Notes">' + _svg('<path d="M4 5h16v11H8l-4 4z"/>', 18) + '</button>' +
        '<button type="button" class="cc-pr-b" data-a="close" aria-label="Exit">' + _svg('<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>', 18) + '</button>' +
      '</div>';
    document.body.appendChild(o);
    PR.overlay = o;
    PR.stages = [o.querySelector('[data-stage="0"]'), o.querySelector('[data-stage="1"]')];
    o.querySelectorAll('.cc-pr-b').forEach(function (b) {
      b.onclick = function () {
        var a = b.getAttribute('data-a');
        if (a === 'prev') prPrev();
        else if (a === 'next') prNext();
        else if (a === 'close') closePresent();
        else if (a === 'autoplay') prToggleAutoplay();
        else if (a === 'notes') o.classList.toggle('show-notes');
      };
    });
    return o;
  }

  function _prFit() {
    if (!PR.open) return;
    var deck = _deck(); if (!deck) return;
    var slide = deck.slides[PR.idx] || deck.slides[0];
    var sw = slide.w || 1600, sh = slide.h || 900;
    var vw = window.innerWidth, vh = window.innerHeight - 8;
    var scale = Math.min(vw / sw, vh / sh);
    PR.scale = scale;
    PR.stages.forEach(function (st) {
      st.style.width = sw + 'px';
      st.style.height = sh + 'px';
      st.style.transform = 'translate(-50%,-50%) scale(' + scale + ')';
    });
  }

  function _prRenderInto(stageEl, slide, cb) {
    stageEl.innerHTML = '';
    var cEl = document.createElement('canvas');
    stageEl.appendChild(cEl);
    var sc = new fabric.StaticCanvas(cEl, { width: slide.w || 1600, height: slide.h || 900, backgroundColor: slide.bg || DEFAULT_BG, renderOnAddRemove: false });
    if (slide.json) {
      sc.loadFromJSON(slide.json, function () { sc.renderAll(); if (cb) cb(sc); });
    } else { sc.renderAll(); if (cb) cb(sc); }
    return sc;
  }

  function _elemAnimStates(preset, obj) {
    var to = { opacity: (obj.opacity == null ? 1 : obj.opacity), left: obj.left || 0, top: obj.top || 0, scaleX: obj.scaleX || 1, scaleY: obj.scaleY || 1, angle: obj.angle || 0 };
    var from = { opacity: to.opacity, left: to.left, top: to.top, scaleX: to.scaleX, scaleY: to.scaleY, angle: to.angle };
    switch (preset) {
      case 'fade': from.opacity = 0; break;
      case 'rise': from.opacity = 0; from.top = to.top + 46; break;
      case 'sink': from.opacity = 0; from.top = to.top - 46; break;
      case 'panL': from.opacity = 0; from.left = to.left + 70; break;
      case 'panR': from.opacity = 0; from.left = to.left - 70; break;
      case 'pop': from.opacity = 0; from.scaleX = to.scaleX * 0.6; from.scaleY = to.scaleY * 0.6; break;
      case 'zoom': from.opacity = 0; from.scaleX = to.scaleX * 1.35; from.scaleY = to.scaleY * 1.35; break;
      case 'spin': from.opacity = 0; from.angle = to.angle - 90; from.scaleX = to.scaleX * 0.7; from.scaleY = to.scaleY * 0.7; break;
      case 'breathe': from.opacity = 0; from.scaleX = to.scaleX * 0.85; from.scaleY = to.scaleY * 0.85; break;
      default: return null;
    }
    return { from: from, to: to };
  }


  /* -- tweening: anime.js, not GSAP -----------------------------------------
     GSAP was dropped from this build for a licensing reason, not a technical one: it ships under
     GreenSock's own terms, which are free of charge but not an OSI licence, and this edition is
     BUSL-1.1 and redistributed. anime.js (MIT) was already loaded on the same page.

     The port is small because the old code never really used GSAP: every animation here tweens a
     plain NUMBER on a proxy object and writes the styles by hand in onUpdate. So one helper covers
     all of it, and it is also the one place two unit differences are handled:
       - GSAP counts SECONDS, anime.js counts MILLISECONDS. A missed x1000 makes a 0.6s transition
         look instant, which is exactly the kind of thing that reads as "the animation is broken".
       - Easing names differ. Saved decks carry GSAP names like "power2.out", so they are TRANSLATED
         rather than passed through; an unknown name falls back instead of throwing. */
  var _twActive = [];

  function _twEase(name) {
    var g = String(name || 'power2.out');
    if (g === 'none' || g === 'linear') return 'linear';
    var parts = g.split('.');
    var fam = parts[0];
    var dir = parts[1] || 'out';
    var MAP = {
      power0: 'Linear', power1: 'Quad', power2: 'Cubic', power3: 'Quart', power4: 'Quint',
      sine: 'Sine', expo: 'Expo', circ: 'Circ', back: 'Back', elastic: 'Elastic', bounce: 'Bounce',
      quad: 'Quad', cubic: 'Cubic', quart: 'Quart', quint: 'Quint'
    };
    var f = MAP[fam];
    if (!f) return 'easeOutCubic';
    if (f === 'Linear') return 'linear';
    var D = { 'in': 'In', out: 'Out', inOut: 'InOut', 'in-out': 'InOut' };
    return 'ease' + (D[dir] || 'Out') + f;
  }

  /* Tween obj's numeric keys to props. Durations and delays are in SECONDS here, matching every
     call site and the values stored in a deck. */
  function _tw(obj, props, opts) {
    opts = opts || {};
    if (typeof anime !== 'function') {
      /* No library: land on the end state immediately rather than leaving the slide half-drawn. */
      for (var k in props) obj[k] = props[k];
      if (opts.onUpdate) opts.onUpdate();
      if (opts.onComplete) opts.onComplete();
      return null;
    }
    var conf = {
      targets: obj,
      duration: Math.max(1, (opts.duration || 0.6) * 1000),
      delay: Math.max(0, (opts.delay || 0) * 1000),
      easing: _twEase(opts.ease),
      update: opts.onUpdate || undefined
    };
    for (var key in props) conf[key] = props[key];
    conf.complete = function () {
      var i = _twActive.indexOf(obj);
      if (i !== -1) _twActive.splice(i, 1);
      if (opts.onComplete) opts.onComplete();
    };
    _twActive.push(obj);
    return anime(conf);
  }

  /* GSAP's killTweensOf. Ours target proxy objects we created, so the registry is ours to keep. */
  function _twKillAll() {
    if (typeof anime === 'function' && anime.remove) {
      for (var i = 0; i < _twActive.length; i++) { try { anime.remove(_twActive[i]); } catch (e) {} }
    }
    _twActive.length = 0;
  }

  function _prPlayElemAnims(sc, slide) {
    if (!slide.animations || !slide.animations.length) return;
    var objs = sc.getObjects();
    var list = slide.animations.filter(function (a) { return a && a.preset && a.preset !== 'none' && objs[a.index]; });
    list.sort(function (a, b) { return (a.order || 0) - (b.order || 0) || a.index - b.index; });
    list.forEach(function (a, i) {
      var obj = objs[a.index];
      var st = _elemAnimStates(a.preset, obj);
      if (!st) return;
      obj.set(st.from);
      var delay = (a.delay || 0) + (a.trigger === 'after' ? i * 0.18 : i * 0.05);
      var proxy = { t: 0 };
      _tw(proxy, { t: 1 }, {
        duration: a.duration || 0.55, delay: delay, ease: a.easing || 'power2.out',
        onUpdate: function () {
          var k = proxy.t, s = {};
          for (var key in st.to) { s[key] = st.from[key] + (st.to[key] - st.from[key]) * k; }
          obj.set(s);
        },
        onComplete: function () { obj.set(st.to); }
      });
    });
    // drive fabric render each frame while any tween runs
    _prStartTicker(sc);
  }

  /* Fabric does not repaint itself, so something has to call renderAll every frame while the object
     animations run. That was the GSAP ticker; anime.js has no shared ticker, and a plain rAF loop is the
     honest replacement. Same 2600 ms cap as before, and one final render so the last frame is the
     end state rather than whatever the loop happened to stop on. */
  function _prStartTicker(sc) {
    var until = Date.now() + 2600;
    (function frame() {
      sc.renderAll();
      if (Date.now() >= until) { sc.renderAll(); return; }
      requestAnimationFrame(frame);
    })();
  }

  function _resolveDir(dir, navDir) {
    if (dir && dir !== 'auto') return dir;
    return navDir === 'prev' ? 'right' : 'left';
  }

  function _prTransition(outStage, inStage, tx, navDir, done) {
    var dur = isFinite(parseFloat(tx.duration)) ? parseFloat(tx.duration) : 0.6;
    var ease = tx.easing || 'power2.out';
    var preset = tx.preset || tx.transition || 'none';
    inStage.style.zIndex = '2'; outStage.style.zIndex = '1';
    inStage.style.opacity = '1'; inStage.style.clipPath = 'none';
    var base = 'translate(-50%,-50%) scale(' + PR.scale + ')';
    function finish() { outStage.style.clipPath = 'none'; inStage.style.clipPath = 'none'; outStage.style.opacity = '1'; outStage.style.transform = base; inStage.style.transform = base; if (done) done(); }
    if (preset === 'none') { finish(); return; }
    var dir = _resolveDir(tx.direction, navDir);
    var sign = (dir === 'left' || dir === 'up') ? 1 : -1;
    var axis = (dir === 'left' || dir === 'right') ? 'X' : 'Y';
    _twKillAll();

    if (preset === 'fade') {
      inStage.style.opacity = '0';
      var pfd = { v: 0 };
      _tw(pfd, { v: 1 }, { duration: dur, ease: ease, onUpdate: function () {
        inStage.style.opacity = String(pfd.v);
        outStage.style.opacity = String(1 - pfd.v);
      }, onComplete: finish });
      return;
    }
    if (preset === 'zoom') {
      /* The old code ran a fromTo on the ELEMENT and a proxy tween that overwrote the same two
         properties every frame, plus a `set` that undid the fromTo's transform. Only the proxy ever
         had an effect; the other two were leftovers and are gone with GSAP. */
      inStage.style.opacity = '0';
      var pz = { s: 0.7, o: 0 };
      _tw(pz, { s: 1, o: 1 }, { duration: dur, ease: ease, onUpdate: function () {
        inStage.style.transform = 'translate(-50%,-50%) scale(' + (PR.scale * pz.s) + ')';
        inStage.style.opacity = String(pz.o);
      }, onComplete: finish });
      return;
    }
    if (preset === 'slide' || preset === 'cover' || preset === 'push') {
      var p = { v: 0 };
      var startPct = sign * 110;
      _tw(p, { v: 1 }, { duration: dur, ease: ease, onUpdate: function () {
        var inPos = startPct * (1 - p.v);
        inStage.style.transform = base + ' translate' + axis + '(' + inPos + '%)';
        if (preset === 'push') { outStage.style.transform = base + ' translate' + axis + '(' + (-sign * 110 * p.v) + '%)'; }
        else if (preset === 'cover') { /* out stays under */ }
        else { /* slide: out stays */ }
      }, onComplete: finish });
      return;
    }
    if (preset === 'wipe') {
      var edge = (dir === 'left') ? 'right' : (dir === 'right') ? 'left' : (dir === 'up') ? 'bottom' : 'top';
      var pw = { v: 0 };
      _tw(pw, { v: 1 }, { duration: dur, ease: ease, onUpdate: function () {
        var inset = (100 * (1 - pw.v));
        var ins = { left:'0 0 0 ' + inset + '%', right: '0 ' + inset + '% 0 0', top: inset + '% 0 0 0', bottom: '0 0 ' + inset + '% 0' };
        inStage.style.clipPath = 'inset(' + ins[edge] + ')';
      }, onComplete: finish });
      return;
    }
    if (preset === 'circle') {
      var pc = { v: 0 };
      _tw(pc, { v: 1 }, { duration: dur, ease: ease, onUpdate: function () { inStage.style.clipPath = 'circle(' + (pc.v * 75) + '% at 50% 50%)'; }, onComplete: finish });
      return;
    }
    if (preset === 'slice') {
      var ps = { v: 0 };
      _tw(ps, { v: 1 }, { duration: dur, ease: ease, onUpdate: function () {
        var r = (1 - ps.v) * 50;
        inStage.style.clipPath = 'inset(' + r + '% 0 ' + r + '% 0)';
      }, onComplete: finish });
      return;
    }
    if (preset === 'flip') {
      var pf = { v: 0 };
      inStage.style.opacity = '0';
      _tw(pf, { v: 1 }, { duration: dur, ease: ease, onUpdate: function () {
        var ang = (1 - pf.v) * 90;
        inStage.style.opacity = pf.v > 0.5 ? '1' : '0';
        inStage.style.transform = base + ' perspective(1200px) rotateY(' + (-ang) + 'deg)';
        outStage.style.transform = base + ' perspective(1200px) rotateY(' + (pf.v * 90) + 'deg)';
      }, onComplete: finish });
      return;
    }
    finish();
  }

  function _prShow(index, navDir) {
    var deck = _deck(); if (!deck) return;
    if (index < 0 || index >= deck.slides.length) return;
    var token = ++PR.token;
    var slide = deck.slides[index];
    var inIdx = 1 - PR.cur;
    var inStage = PR.stages[inIdx];
    _prRenderInto(inStage, slide, function (sc) {
      if (token !== PR.token) { sc.dispose && sc.dispose(); return; }
      PR.scs[inIdx] = sc;
      _prFit();
      var outStage = PR.stages[PR.cur];
      var first = PR.idx === index && !PR._started;
      PR._started = true;
      var tx = { preset: slide.transition, direction: slide.transitionDirection, duration: slide.transitionDuration, easing: slide.transitionEasing };
      _prTransition(outStage, inStage, first ? { preset:'none' } : tx, navDir, function () {
        if (token !== PR.token) return;
        // dispose old
        var oldSc = PR.scs[PR.cur];
        PR.cur = inIdx;
        PR.idx = index;
        _prUpdateChrome();
        _prPlayElemAnims(sc, slide);
        if (oldSc && oldSc.dispose) { setTimeout(function () { try { oldSc.dispose(); } catch (e) {} }, 50); }
        _prScheduleAutoplay();
      });
    });
  }

  function _prUpdateChrome() {
    var deck = _deck(); if (!deck || !PR.overlay) return;
    var slide = deck.slides[PR.idx];
    PR.overlay.querySelector('.cc-pr-count').textContent = (PR.idx + 1) + ' / ' + deck.slides.length;
    var notes = PR.overlay.querySelector('.cc-pr-notes');
    notes.textContent = (slide && slide.notes) ? slide.notes : '';
    notes.classList.toggle('is-empty', !(slide && slide.notes));
  }

  function prNext() { var deck = _deck(); if (!deck) return; if (PR.idx < deck.slides.length - 1) _prShow(PR.idx + 1, 'next'); }
  function prPrev() { if (PR.idx > 0) _prShow(PR.idx - 1, 'prev'); }

  function _prSetAutoplayIcon() {
    if (!PR.overlay) return;
    var b = PR.overlay.querySelector('.cc-pr-b[data-a="autoplay"]');
    if (b) b.innerHTML = _svg(PR.autoplay ? '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>' : '<path d="M8 5v14l11-7z"/>', 18);
  }
  function _prProgress(ms) {
    if (!PR.overlay) return;
    var fill = PR.overlay.querySelector('.cc-pr-progress-fill');
    if (!fill) return;
    fill.style.transition = 'none';
    fill.style.width = '0%';
    void fill.offsetWidth; // reflow so the reset takes effect before the timed fill
    if (PR.autoplay && ms > 0) { fill.style.transition = 'width ' + ms + 'ms linear'; fill.style.width = '100%'; }
  }

  function _prScheduleAutoplay() {
    clearTimeout(PR.timer);
    if (!PR.autoplay) { _prProgress(0); return; }
    var deck = _deck(); if (!deck) return;
    var slide = deck.slides[PR.idx];
    var d = (slide && slide.autoMs) ? slide.autoMs : 3000;
    _prProgress(d);
    PR.timer = setTimeout(function () {
      if (PR.idx < deck.slides.length - 1) prNext();
      else _prShow(0, 'next');
    }, d);
  }

  function prToggleAutoplay() {
    PR.autoplay = !PR.autoplay;
    if (PR.overlay) PR.overlay.classList.toggle('is-autoplay', PR.autoplay);
    _prSetAutoplayIcon();
    if (PR.autoplay) _prScheduleAutoplay(); else { clearTimeout(PR.timer); _prProgress(0); }
  }

  function openPresent(startIndex) {
    if (!_hasDeck()) return;
    if (typeof saveCurrentInnerSlide === 'function') saveCurrentInnerSlide();
    var deck = _deck();
    _prBuild();
    PR.open = true; PR._started = false; PR.cur = 0; PR.autoplay = false;
    _prSetAutoplayIcon(); _prProgress(0);
    PR.idx = (typeof startIndex === 'number') ? startIndex : (deck.activeSlideIndex || 0);
    PR.overlay.classList.remove('is-autoplay');
    PR.overlay.classList.add('is-open');
    document.addEventListener('keydown', _prKey, true);
    _prShow(PR.idx, 'next');
  }

  function closePresent() {
    if (!PR.open) return;
    PR.open = false;
    PR.token++;
    clearTimeout(PR.timer);
    PR.autoplay = false;
    document.removeEventListener('keydown', _prKey, true);
    if (PR.overlay) PR.overlay.classList.remove('is-open', 'show-notes', 'is-autoplay', 'is-black');
    [0, 1].forEach(function (i) { if (PR.scs[i] && PR.scs[i].dispose) { try { PR.scs[i].dispose(); } catch (e) {} } PR.scs[i] = null; if (PR.stages[i]) PR.stages[i].innerHTML = ''; });
  }

  function _prKey(e) {
    if (!PR.open) return;
    var k = e.key;
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); closePresent(); return; }
    if (k === 'ArrowRight' || k === ' ' || k === 'PageDown') { e.preventDefault(); e.stopPropagation(); prNext(); return; }
    if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); e.stopPropagation(); prPrev(); return; }
    if (k === 'Home') { e.preventDefault(); _prShow(0, 'prev'); return; }
    if (k === 'End') { var d = _deck(); if (d) { e.preventDefault(); _prShow(d.slides.length - 1, 'next'); } return; }
    if (k === 'b' || k === 'B' || k === 'w' || k === 'W') { e.preventDefault(); PR.black = !PR.black; PR.overlay.classList.toggle('is-black', PR.black); PR.overlay.classList.toggle('is-white', PR.black && (k === 'w' || k === 'W')); return; }
    if (k >= '1' && k <= '9') { var di = _deck(); var n = parseInt(k, 10) - 1; if (di && n < di.slides.length) { e.preventDefault(); _prShow(n, n > PR.idx ? 'next' : 'prev'); } return; }
  }

  window.addEventListener('resize', function () { if (PR.open) _prFit(); });

  SUITE.openPresent = openPresent;
  SUITE.closePresent = closePresent;

  // ============================================================
  // ELEMENT ANIMATIONS UI (B6) — assign entrance animations per object on the
  // active slide. Writes slide.animations[]; the present engine plays them.
  // ============================================================
  function _activeSlide() { var d = _deck(); return d ? d.slides[d.activeSlideIndex] : null; }

  function _animGet(slide, idx) { for (var i = 0; i < slide.animations.length; i++) { if (slide.animations[i].index === idx) return slide.animations[i]; } return null; }
  function _animSet(slide, idx, patch) {
    var e = _animGet(slide, idx);
    if (!e) { e = { index: idx, preset: 'none', trigger: 'after', delay: 0, duration: 0.55, order: idx, easing: 'power2.out' }; slide.animations.push(e); }
    for (var k in patch) { if (patch.hasOwnProperty(k)) e[k] = patch[k]; }
    if (e.preset === 'none') { slide.animations = slide.animations.filter(function (x) { return x.index !== idx; }); }
    if (typeof _sdTouchSlide === 'function') _sdTouchSlide(slide);
    if (typeof _sdTouchDeck === 'function') _sdTouchDeck(_curPage());
  }

  function _objLabel(o, i) {
    var t = o.type || 'object';
    if ((t === 'textbox' || t === 'text' || t === 'i-text') && o.text) return '"' + String(o.text).slice(0, 16) + '"';
    var names = { rect:'Rectangle', circle:'Circle', ellipse:'Ellipse', triangle:'Triangle', polygon:'Polygon', path:'Shape', image:'Image', group:'Group', line:'Line' };
    return (names[t] || t) + ' ' + (i + 1);
  }

  // (The element-animation UI now lives in the transition modal's Animate tab.)

  // ============================================================
  // STRIP (clean rebuild) — renders into #slide-strip-host with brand-new .sd-*
  // classes (no swiper, no legacy slide-strip CSS). Background matches the page-tabs
  // bar; anchored just above it; hidden native scroll (wheel/drag only).
  // ============================================================
  var IC_EYE = '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>';
  var IC_PLUS = '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>';
  var IC_DOTS = '<circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/>';
  var IC_DUP = '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>';
  var IC_FX = '<path d="M12 3l2.1 5.4L20 10l-5.9 1.6L12 17l-2.1-5.4L4 10l5.9-1.6z"/>';
  var IC_TRASH = '<path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 13h10l1-13"/>';
  var IC_FIRST = '<polygon points="18 19 9 12 18 5"/><line x1="6" y1="5" x2="6" y2="19"/>';
  var IC_PREV = '<polyline points="15 18 9 12 15 6"/>';
  var IC_NEXT = '<polyline points="9 18 15 12 9 6"/>';
  var IC_LAST = '<polygon points="6 5 15 12 6 19"/><line x1="18" y1="5" x2="18" y2="19"/>';
  var IC_LAYERS = '<rect x="3" y="4" width="18" height="5" rx="1"/><rect x="3" y="11" width="18" height="4" rx="1"/><rect x="3" y="17" width="12" height="3" rx="1"/>';
  var IC_NOTES = '<path d="M4 5h16v11H8l-4 4z"/>';
  var IC_GRIP = '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>';

  function _txLabel(k) { var t = TX_BY_KEY[k]; return t ? t.label : k; }

  function _jsonToUrl(json, bg, w, h, cb) {
    var el = document.createElement('canvas');
    var sc = new fabric.StaticCanvas(el, { width: w || 1600, height: h || 900, backgroundColor: bg || DEFAULT_BG, enableRetinaScaling: false });
    function done() { sc.renderAll(); var u = null; try { u = sc.toDataURL({ format: 'png', multiplier: 0.2 }); } catch (e) {} try { sc.dispose(); } catch (e) {} cb(u); }
    if (json) sc.loadFromJSON(json, done); else done();
  }

  function _thumb(slide, img, isActive) {
    if (isActive && window.canvas) {
      _jsonToUrl(canvas.toJSON(typeof CUSTOM_PROPS !== 'undefined' ? CUSTOM_PROPS : undefined), canvas.backgroundColor || slide.bg, (typeof CW !== 'undefined' && CW) || slide.w, (typeof CH !== 'undefined' && CH) || slide.h, function (u) { if (u) img.src = u; });
      return;
    }
    var key = (slide.id || '') + ':' + (slide._previewRev || 0);
    if (slide._thumbKey === key && slide._thumbSrc) { img.src = slide._thumbSrc; return; }
    _jsonToUrl(slide.json, slide.bg, slide.w, slide.h, function (u) { slide._thumbKey = key; slide._thumbSrc = u; img.src = u || ''; });
  }

  function _openSlide(i) { if (typeof saveCurrentInnerSlide === 'function') saveCurrentInnerSlide(); loadInnerSlide(currentPageIndex, i, { skipSave: true }); if (typeof renderPageTabs === 'function') renderPageTabs(); syncSlideDeckUi(); }
  function _dupSlide(i) { if (typeof saveCurrentInnerSlide === 'function') saveCurrentInnerSlide(); duplicateInnerSlide(currentPageIndex, i); var d = _deck(); loadInnerSlide(currentPageIndex, d.activeSlideIndex, { skipSave: true }); if (typeof renderPageTabs === 'function') renderPageTabs(); syncSlideDeckUi(); }
  function _delSlide(i) { if (!deleteInnerSlide(currentPageIndex, i)) return; var d = _deck(); loadInnerSlide(currentPageIndex, d.activeSlideIndex, { skipSave: true }); if (typeof renderPageTabs === 'function') renderPageTabs(); syncSlideDeckUi(); }
  function _moveSlide(from, to) { if (typeof saveCurrentInnerSlide === 'function') saveCurrentInnerSlide(); moveInnerSlide(currentPageIndex, from, to); loadInnerSlide(currentPageIndex, to, { skipSave: true }); syncSlideDeckUi(); }
  function _addSlideEnd() { var d = _deck(); if (!d) return; if (typeof saveCurrentInnerSlide === 'function') saveCurrentInnerSlide(); addInnerSlide(currentPageIndex, d.slides.length); loadInnerSlide(currentPageIndex, d.slides.length - 1, { skipSave: true }); if (typeof renderPageTabs === 'function') renderPageTabs(); syncSlideDeckUi(); }

  // ── Right-click slide settings menu (strip cards + layers rows) ──
  var _sctx = null, _sctxOutside = null;
  function _closeSlideCtx() { if (_sctx) { if (_sctx.parentNode) _sctx.parentNode.removeChild(_sctx); _sctx = null; } if (_sctxOutside) { document.removeEventListener('mousedown', _sctxOutside); _sctxOutside = null; } }
  function _renameSlide(si) {
    var deck = _deck(); var slide = deck && deck.slides[si]; if (!slide) return;
    if (typeof showCustomPrompt !== 'function') return;
    showCustomPrompt('Slide name', slide.label || ('Slide ' + (si + 1)), function (v) {
      v = (v || '').trim(); if (!v) return;
      slide.label = v; if (typeof _sdTouchDeck === 'function') _sdTouchDeck(_curPage());
      syncSlideDeckUi();
      if (_layersPanel && _layersPanel.classList.contains('is-open')) _refreshLayersPanel();
    });
  }
  function _setDuration(si) {
    var deck = _deck(); var slide = deck && deck.slides[si]; if (!slide) return;
    if (typeof showCustomPrompt !== 'function') return;
    var cur = slide.autoMs ? (slide.autoMs / 1000) : 3;
    showCustomPrompt('Slide duration in seconds (used by autoplay)', String(cur), function (v) {
      var n = parseFloat(v); if (!isFinite(n) || n <= 0) return;
      slide.autoMs = Math.round(n * 1000); if (typeof _sdTouchDeck === 'function') _sdTouchDeck(_curPage());
    });
  }
  function _slideCtxMenu(x, y, si) {
    _closeSlideCtx();
    var deck = _deck(); if (!deck || !deck.slides[si]) return;
    var slide = deck.slides[si];
    var m = document.createElement('div');
    m.className = 'cc-sctx';
    function item(label, fn, cls) { var b = document.createElement('button'); b.type = 'button'; b.className = 'cc-sctx-item' + (cls ? ' ' + cls : ''); b.textContent = label; b.onclick = function () { _closeSlideCtx(); fn(); }; m.appendChild(b); }
    function sep() { var d = document.createElement('div'); d.className = 'cc-sctx-sep'; m.appendChild(d); }
    item('Rename slide', function () { _renameSlide(si); });
    item('Slide duration' + (slide.autoMs ? ' (' + (slide.autoMs / 1000) + 's)' : ''), function () { _setDuration(si); });
    item('Transition and animation', function () { openTxModal(si); });
    sep();
    item('Duplicate', function () { _dupSlide(si); });
    item('Delete', function () { _delSlide(si); }, 'is-danger');
    document.body.appendChild(m);
    _sctx = m;
    var mw = m.offsetWidth, mh = m.offsetHeight;
    m.style.left = Math.max(6, Math.min(x, window.innerWidth - mw - 8)) + 'px';
    m.style.top = Math.max(6, Math.min(y, window.innerHeight - mh - 8)) + 'px';
    _sctxOutside = function (e) { if (_sctx && !_sctx.contains(e.target)) _closeSlideCtx(); };
    setTimeout(function () { document.addEventListener('mousedown', _sctxOutside); }, 0);
  }
  SUITE.slideCtxMenu = _slideCtxMenu;

  function _buildStripShell(host) {
    // Actions are a sibling of the cards strip (not inside it) so they float ABOVE
    // the deck as an external control pill (owner request), next to the zoom pill.
    // Nav groups (first/prev at the start, next/last at the end) scroll the cards.
    host.innerHTML =
      '<div class="sd-strip">' +
        '<div class="sd-nav sd-nav-start">' +
          '<button type="button" class="sd-nav-btn sd-first" aria-label="Go to first slide">' + _svg(IC_FIRST, 15) + '</button>' +
          '<button type="button" class="sd-nav-btn sd-prev" aria-label="Scroll back">' + _svg(IC_PREV, 15) + '</button>' +
        '</div>' +
        '<div class="sd-cards"></div>' +
        '<div class="sd-nav sd-nav-end">' +
          '<button type="button" class="sd-nav-btn sd-next" aria-label="Scroll forward">' + _svg(IC_NEXT, 15) + '</button>' +
          '<button type="button" class="sd-nav-btn sd-last" aria-label="Go to last slide">' + _svg(IC_LAST, 15) + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="sd-actions">' +
        '<button type="button" class="sd-act sd-act-preview" aria-label="Preview">' + _svg(IC_EYE, 18) + '</button>' +
        '<button type="button" class="sd-act sd-act-add" aria-label="Add slide">' + _svg(IC_PLUS, 18) + '</button>' +
        '<button type="button" class="sd-act sd-act-layers" aria-label="Slide layers">' + _svg(IC_LAYERS, 17) + '</button>' +
        '<button type="button" class="sd-act sd-act-notes" aria-label="Speaker notes">' + _svg(IC_NOTES, 17) + '</button>' +
        '<button type="button" class="sd-act sd-act-more" aria-label="More">' + _svg(IC_DOTS, 18) + '</button>' +
      '</div>';
    var cards = host.querySelector('.sd-cards');
    // Wheel over the deck scrolls the cards horizontally and NEVER the canvas/screen
    // (stopPropagation so the editor's global zoom/pan wheel handler does not fire).
    cards.addEventListener('wheel', function (e) {
      var d = e.deltaY || e.deltaX;
      if (!d) return;
      cards.scrollLeft += d;
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });
    // Drag the empty strip area (not a card) to pan the deck.
    var _ds = null;
    cards.addEventListener('mousedown', function (e) {
      if (e.target.closest('.sd-card')) return;
      _ds = { x: e.clientX, sl: cards.scrollLeft };
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) { if (_ds) cards.scrollLeft = _ds.sl - (e.clientX - _ds.x); });
    document.addEventListener('mouseup', function () { _ds = null; });
    host.querySelector('.sd-act-preview').onclick = function () { openPresent(); };
    host.querySelector('.sd-act-add').onclick = function () { _addSlideEnd(); };
    host.querySelector('.sd-act-layers').onclick = function () { toggleLayersPanel(); };
    host.querySelector('.sd-act-notes').onclick = function () { toggleNotesPanel(); };
    host.querySelector('.sd-act-more').onclick = function () { _toggleMoreMenu(this); };
    // Nav: first/prev at the start, next/last at the end. prev/next nudge by ~3 cards
    // (NOT a viewport page, which overshot straight to the end); first/last jump.
    function _step() { var c = cards.querySelector('.sd-card'); var cw = c ? (c.offsetWidth + 10) : 102; return Math.max(102, cw * 3); }
    host.querySelector('.sd-first').onclick = function () { cards.scrollTo({ left: 0, behavior: 'smooth' }); };
    host.querySelector('.sd-prev').onclick = function () { cards.scrollBy({ left: -_step(), behavior: 'smooth' }); };
    host.querySelector('.sd-next').onclick = function () { cards.scrollBy({ left: _step(), behavior: 'smooth' }); };
    host.querySelector('.sd-last').onclick = function () { cards.scrollTo({ left: cards.scrollWidth, behavior: 'smooth' }); };
    cards.addEventListener('scroll', function () { _updateNav(host); }, { passive: true });
  }

  function _updateNav(host) {
    host = host || document.getElementById('slide-strip-host');
    if (!host) return;
    var cards = host.querySelector('.sd-cards');
    if (!cards) return;
    var overflow = cards.scrollWidth > cards.clientWidth + 2;
    Array.prototype.forEach.call(host.querySelectorAll('.sd-nav'), function (n) { n.style.display = overflow ? '' : 'none'; });
    var atStart = cards.scrollLeft <= 1;
    var atEnd = cards.scrollLeft >= (cards.scrollWidth - cards.clientWidth - 1);
    var f = host.querySelector('.sd-first'), p = host.querySelector('.sd-prev'), n = host.querySelector('.sd-next'), l = host.querySelector('.sd-last');
    if (f) f.disabled = atStart; if (p) p.disabled = atStart;
    if (n) n.disabled = atEnd; if (l) l.disabled = atEnd;
  }

  function _renderCards(host, deck) {
    var cards = host.querySelector('.sd-cards');
    if (!cards) return;
    cards.innerHTML = '';
    deck.slides.forEach(function (slide, i) {
      var isActive = i === deck.activeSlideIndex;
      var card = document.createElement('div');
      card.className = 'sd-card' + (isActive ? ' is-active' : '');
      card.setAttribute('data-i', i);
      card.innerHTML =
        '<div class="sd-thumb-wrap"><img class="sd-thumb" alt=""></div>' +
        '<span class="sd-num">' + (i + 1) + '</span>' +
        (slide.transition && slide.transition !== 'none' ? '<span class="sd-badge">' + _txLabel(slide.transition) + '</span>' : '') +
        '<div class="sd-hover">' +
          '<button type="button" class="sd-h sd-h-dup" title="Duplicate">' + _svg(IC_DUP, 13) + '</button>' +
          '<button type="button" class="sd-h sd-h-fx" title="Transition and animation">' + _svg(IC_FX, 13) + '</button>' +
          '<button type="button" class="sd-h sd-h-del" title="Delete">' + _svg(IC_TRASH, 13) + '</button>' +
        '</div>';
      _thumb(slide, card.querySelector('.sd-thumb'), isActive);
      card.onclick = function (e) {
        if (card._sdSuppressClick) { card._sdSuppressClick = false; return; }
        if (e.target.closest('.sd-h-dup')) { e.stopPropagation(); _dupSlide(i); return; }
        if (e.target.closest('.sd-h-fx')) { e.stopPropagation(); openTxModal(i); return; }
        if (e.target.closest('.sd-h-del')) { e.stopPropagation(); _delSlide(i); return; }
        _openSlide(i);
      };
      // Pointer-based reorder (NOT HTML5 draggable, which triggered the canvas
      // image-drop overlay). Drag a card horizontally to move it among the slides.
      card.addEventListener('mousedown', function (e) {
        if (e.button !== 0 || e.target.closest('.sd-h')) return;
        var startX = e.clientX, moved = false;
        function clearDrop() { Array.prototype.forEach.call(cards.querySelectorAll('.sd-card'), function (c2) { c2.classList.remove('is-drop'); }); }
        function mm(ev) {
          if (!moved && Math.abs(ev.clientX - startX) > 6) { moved = true; card.classList.add('is-dragging'); }
          if (moved) { clearDrop(); var t = _cardTargetIndex(cards, ev.clientX); var tc = cards.querySelector('.sd-card[data-i="' + t + '"]'); if (tc && tc !== card) tc.classList.add('is-drop'); }
        }
        function mu(ev) {
          document.removeEventListener('mousemove', mm);
          document.removeEventListener('mouseup', mu);
          clearDrop(); card.classList.remove('is-dragging');
          if (moved) {
            card._sdSuppressClick = true;
            var target = _cardTargetIndex(cards, ev.clientX);
            var to = (i < target) ? target - 1 : target;
            var len = (_deck() && _deck().slides.length) || 0;
            if (to !== i && to >= 0 && to < len) _moveSlide(i, to);
          }
        }
        document.addEventListener('mousemove', mm);
        document.addEventListener('mouseup', mu);
      });
      card.addEventListener('contextmenu', function (e) { e.preventDefault(); _slideCtxMenu(e.clientX, e.clientY, i); });
      cards.appendChild(card);
    });
    var ac = cards.querySelector('.sd-card.is-active');
    if (ac && ac.scrollIntoView) ac.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }

  // Insertion point (0..n) for a pointer at screen-x over the card row.
  function _cardTargetIndex(cardsEl, x) {
    var cs = cardsEl.querySelectorAll('.sd-card');
    for (var j = 0; j < cs.length; j++) {
      var r = cs[j].getBoundingClientRect();
      if (x < r.left + r.width / 2) return parseInt(cs[j].getAttribute('data-i'), 10);
    }
    return cs.length ? parseInt(cs[cs.length - 1].getAttribute('data-i'), 10) + 1 : 0;
  }

  function _positionStrip(host) {
    var tabs = document.querySelector('.page-tabs-bar');
    var tabsH = tabs ? tabs.offsetHeight : 36;
    host.style.position = 'absolute';
    host.style.left = '0';
    host.style.right = '0';
    host.style.top = 'auto';
    host.style.bottom = tabsH + 'px';
    host.style.zIndex = '4';
    host.style.height = '';
    var hh = host.offsetHeight;
    var ca = document.getElementById('canvas-area');
    if (ca && hh > 0) ca.style.setProperty('--sd-active-lane-total-h', (hh + tabsH) + 'px');
    // Lift the canvas zoom pill ABOVE the strip (owner: it must not sit on the deck).
    var zoom = document.querySelector('.zoom-pill');
    if (zoom && hh > 0) zoom.style.setProperty('bottom', (tabsH + hh + 14) + 'px', 'important');
  }

  function syncSlideDeckUi() {
    var host = document.getElementById('slide-strip-host');
    if (!host) return;
    var page = _curPage();
    if (!pageHasSlideDeck(page)) { host.style.display = 'none'; host.innerHTML = ''; return; }
    host.style.display = '';
    if (!host.querySelector('.sd-strip')) _buildStripShell(host);
    _renderCards(host, page._slideDeck);
    _positionStrip(host);
    _updateNav(host);
  }

  var _moreMenu = null;
  function _moreItem(label, onclick) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'cc-more-item'; b.textContent = label;
    b.onclick = function () { if (_moreMenu) _moreMenu.classList.remove('is-open'); onclick(); };
    return b;
  }
  function _moreHead(t) { var d = document.createElement('div'); d.className = 'cc-more-head'; d.textContent = t; return d; }
  function _buildMoreMenu() {
    var m = document.createElement('div'); m.className = 'cc-more-menu';
    m.appendChild(_moreHead('Insert slide'));
    LAYOUTS.forEach(function (l) { m.appendChild(_moreItem(l.label, function () { addLayoutSlide(l.key); })); });
    m.appendChild(_moreHead('Panels'));
    m.appendChild(_moreItem('Slide layers', function () { toggleLayersPanel(); }));
    m.appendChild(_moreItem('Speaker notes', function () { toggleNotesPanel(); }));
    m.appendChild(_moreHead('Export / Import'));
    m.appendChild(_moreItem('Images (.zip)', function () { exportImages(); }));
    m.appendChild(_moreItem('PowerPoint (.pptx)', function () { exportPptxFull(); }));
    m.appendChild(_moreItem('dika studio (.dikadeck)', function () { exportDeckFile(); }));
    m.appendChild(_moreItem('Import dika studio file', function () { importDeckFile(); }));
    document.body.appendChild(m);
    document.addEventListener('click', function (e) { if (_moreMenu && !_moreMenu.contains(e.target) && !(e.target.closest && e.target.closest('.sd-act-more'))) _moreMenu.classList.remove('is-open'); });
    return m;
  }
  function _toggleMoreMenu(anchor) {
    if (!_moreMenu) _moreMenu = _buildMoreMenu();
    if (_moreMenu.classList.contains('is-open')) { _moreMenu.classList.remove('is-open'); return; }
    var r = anchor.getBoundingClientRect();
    _moreMenu.style.left = Math.round(Math.min(r.left, window.innerWidth - 216)) + 'px';
    _moreMenu.style.top = Math.round(r.bottom + 6) + 'px';
    _moreMenu.classList.add('is-open');
    var mr = _moreMenu.getBoundingClientRect();
    if (mr.bottom > window.innerHeight - 8) _moreMenu.style.top = Math.round(Math.max(8, r.top - mr.height - 6)) + 'px';
  }

  // (Strip is rendered by the clean syncSlideDeckUi above; no legacy restyle/wrap.)


  // ============================================================
  // PER-SLIDE LAYERS (B8) — each slide is a collapsible group of its elements,
  // like an infinite-canvas frame. Active slide reads the live canvas; other
  // slides read their stored JSON. Data-tree approach (no canvas remount).
  // ============================================================
  var _layersPanel = null, _layersExpanded = {};

  function _slideElements(slide, isActive) {
    if (isActive && window.canvas) return window.canvas.getObjects().filter(function (o) { return !o._isFrameBg; });
    var j = slide.json;
    return (j && j.objects) ? j.objects.filter(function (o) { return !o._isFrameBg; }) : [];
  }

  function _ensureLayersPanel() {
    if (_layersPanel && _layersPanel.parentNode) return _layersPanel;
    var p = document.createElement('div');
    p.className = 'cc-layers-panel';
    p.innerHTML = '<div class="cc-lp-head"><span>Slide Layers</span><button type="button" class="cc-lp-x" aria-label="Close">' + _svg('<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>', 15) + '</button></div><div class="cc-lp-body"></div>';
    document.body.appendChild(p);
    _layersPanel = p;
    _makeDraggable(p, p.querySelector('.cc-lp-head'));
    p.querySelector('.cc-lp-x').onclick = function () { p.classList.remove('is-open'); };
    // Mouse wheel scrolls the panel body (and never the editor canvas behind it).
    var body = p.querySelector('.cc-lp-body');
    body.addEventListener('wheel', function (e) { body.scrollTop += e.deltaY; e.preventDefault(); e.stopPropagation(); }, { passive: false });
    return p;
  }

  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function _lpClearDrop(body) { Array.prototype.forEach.call(body.querySelectorAll('.cc-lp-group'), function (g) { g.classList.remove('is-lp-drop'); }); }
  function _lpGroupTarget(body, y) {
    var gs = body.querySelectorAll('.cc-lp-group');
    for (var j = 0; j < gs.length; j++) { var r = gs[j].getBoundingClientRect(); if (y < r.top + r.height / 2) return j; }
    return gs.length;
  }
  function _lpToggle(slide, si, isActive, pi) {
    var nowExp = !_layersExpanded[slide.id];
    _layersExpanded[slide.id] = nowExp;
    if (nowExp && !isActive && typeof loadInnerSlide === 'function') {
      if (typeof saveCurrentInnerSlide === 'function') saveCurrentInnerSlide();
      loadInnerSlide(pi, si, { skipSave: true });
      if (typeof renderPageTabs === 'function') renderPageTabs();
      if (typeof syncSlideDeckUi === 'function') syncSlideDeckUi();
    }
    _refreshLayersPanel();
  }
  function _lpStartRename(gname, slide) {
    var input = document.createElement('input');
    input.className = 'cc-lp-rename';
    input.value = slide.label || '';
    gname.parentNode.replaceChild(input, gname);
    input.focus(); input.select();
    var done = false;
    function commit(cancel) {
      if (done) return; done = true;
      if (!cancel) { var v = input.value.trim(); if (v) { slide.label = v; if (typeof _sdTouchDeck === 'function') _sdTouchDeck(_curPage()); } }
      _refreshLayersPanel();
      if (typeof syncSlideDeckUi === 'function') syncSlideDeckUi();
    }
    input.addEventListener('blur', function () { commit(false); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); commit(false); } else if (e.key === 'Escape') { commit(true); } });
    input.addEventListener('click', function (e) { e.stopPropagation(); });
    input.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  }

  function _refreshLayersPanel() {
    var p = _ensureLayersPanel();
    var body = p.querySelector('.cc-lp-body');
    var deck = _deck();
    body.innerHTML = '';
    if (!deck) { body.innerHTML = '<div class="cc-lp-empty">No slide deck.</div>'; return; }
    var pi = currentPageIndex;
    deck.slides.forEach(function (slide, si) {
      var isActive = si === deck.activeSlideIndex;
      var els = _slideElements(slide, isActive);
      // Default: only the active slide is expanded so a long deck stays compact.
      // The chevron toggles any slide (including the active one).
      if (typeof _layersExpanded[slide.id] === 'undefined') _layersExpanded[slide.id] = isActive;
      var expanded = _layersExpanded[slide.id];
      var group = document.createElement('div');
      group.className = 'cc-lp-group' + (isActive ? ' is-active' : '') + (expanded ? '' : ' is-collapsed');
      var head = document.createElement('div');
      head.className = 'cc-lp-ghead';
      head.innerHTML =
        '<span class="cc-lp-grip" title="Drag to reorder">' + _svg(IC_GRIP, 13) + '</span>' +
        '<span class="cc-lp-chev">' + _svg('<path d="M9 6l6 6-6 6"/>', 13) + '</span>' +
        '<span class="cc-lp-gname" title="Double-click to rename">' + _esc(slide.label || ('Slide ' + (si + 1))) + '</span>' +
        '<span class="cc-lp-gcount">' + els.length + '</span>';
      // Click anywhere on the header (name included) toggles the accordion; a click on
      // the name is deferred briefly so a double-click renames instead of toggling.
      head.addEventListener('click', function (e) {
        if (e.target.closest('.cc-lp-grip')) return;
        if (e.target.closest('.cc-lp-gname')) {
          if (head._ct) return;
          head._ct = setTimeout(function () { head._ct = null; _lpToggle(slide, si, isActive, pi); }, 210);
          return;
        }
        _lpToggle(slide, si, isActive, pi);
      });
      head.addEventListener('dblclick', function (e) {
        if (!e.target.closest('.cc-lp-gname')) return;
        if (head._ct) { clearTimeout(head._ct); head._ct = null; }
        _lpStartRename(head.querySelector('.cc-lp-gname'), slide);
      });
      // Grip: pointer-drag to reorder slides.
      head.querySelector('.cc-lp-grip').addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        var startY = e.clientY, moved = false;
        function mm(ev) {
          if (!moved && Math.abs(ev.clientY - startY) > 5) { moved = true; group.classList.add('is-dragging'); }
          if (moved) { _lpClearDrop(body); var t = _lpGroupTarget(body, ev.clientY); var gs = body.querySelectorAll('.cc-lp-group'); if (gs[t] && gs[t] !== group) gs[t].classList.add('is-lp-drop'); }
        }
        function mu(ev) {
          document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu);
          _lpClearDrop(body); group.classList.remove('is-dragging');
          if (moved) {
            var target = _lpGroupTarget(body, ev.clientY);
            var to = (si < target) ? target - 1 : target;
            var len = (_deck() && _deck().slides.length) || 0;
            if (to !== si && to >= 0 && to < len) { _moveSlide(si, to); setTimeout(_refreshLayersPanel, 60); }
          }
        }
        document.addEventListener('mousemove', mm); document.addEventListener('mouseup', mu);
      });
      head.addEventListener('contextmenu', function (e) { e.preventDefault(); _slideCtxMenu(e.clientX, e.clientY, si); });
      group.appendChild(head);
      if (expanded) {
        var listWrap = document.createElement('div');
        listWrap.className = 'cc-lp-list';
        if (!els.length) { listWrap.innerHTML = '<div class="cc-lp-emptyrow">Empty slide</div>'; }
        els.forEach(function (o, ei) {
          var row = document.createElement('div');
          row.className = 'cc-lp-row';
          row.innerHTML = '<span class="cc-lp-ic">' + _svg(_typeGlyph(o.type), 13) + '</span><span class="cc-lp-lbl">' + _objLabel(o, ei) + '</span>';
          row.onclick = function () {
            if (isActive && window.canvas) { window.canvas.setActiveObject(o); window.canvas.requestRenderAll(); }
            else if (typeof loadInnerSlide === 'function') { if (typeof saveCurrentInnerSlide === 'function') saveCurrentInnerSlide(); loadInnerSlide(pi, si, { skipSave: true }); if (typeof syncSlideDeckUi === 'function') syncSlideDeckUi(); setTimeout(_refreshLayersPanel, 60); }
          };
          listWrap.appendChild(row);
        });
        group.appendChild(listWrap);
      }
      body.appendChild(group);
    });
  }

  function _typeGlyph(t) {
    var m = {
      textbox: '<path d="M4 7V5h16v2M9 5v14M7 19h4"/>', text: '<path d="M4 7V5h16v2M9 5v14M7 19h4"/>', 'i-text': '<path d="M4 7V5h16v2M9 5v14M7 19h4"/>',
      image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 15l-5-5L5 19"/>',
      rect: '<rect x="4" y="6" width="16" height="12" rx="1"/>', group: '<rect x="4" y="4" width="10" height="10" rx="1"/><rect x="10" y="10" width="10" height="10" rx="1"/>'
    };
    return m[t] || '<circle cx="12" cy="12" r="7"/>';
  }

  function toggleLayersPanel() {
    var p = _ensureLayersPanel();
    if (p.classList.contains('is-open')) { p.classList.remove('is-open'); return; }
    _refreshLayersPanel();
    p.classList.add('is-open');
  }
  SUITE.toggleLayersPanel = toggleLayersPanel;

  // ============================================================
  // SPEAKER NOTES (B9) — per-slide notes editor bound to slide.notes; shown in
  // the presenter overlay during Present.
  // ============================================================
  var _notesPanel = null;

  function _ensureNotesPanel() {
    if (_notesPanel && _notesPanel.parentNode) return _notesPanel;
    var p = document.createElement('div');
    p.className = 'cc-notes-panel';
    p.innerHTML = '<div class="cc-notes-head"><span>Speaker notes</span><button type="button" class="cc-notes-x" aria-label="Close">' + _svg('<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>', 15) + '</button></div><textarea class="cc-notes-area" placeholder="Notes for this slide (shown in Presenter view)..."></textarea>';
    document.body.appendChild(p);
    _notesPanel = p;
    _makeDraggable(p, p.querySelector('.cc-notes-head'));
    p.querySelector('.cc-notes-x').onclick = function () { p.classList.remove('is-open'); };
    p.querySelector('.cc-notes-area').addEventListener('input', function (e) {
      var s = _activeSlide(); if (s) { s.notes = e.target.value; if (typeof _sdTouchSlide === 'function') _sdTouchSlide(s); }
    });
    return p;
  }

  function toggleNotesPanel() {
    var p = _ensureNotesPanel();
    if (p.classList.contains('is-open')) { p.classList.remove('is-open'); return; }
    var s = _activeSlide();
    p.querySelector('.cc-notes-area').value = (s && s.notes) ? s.notes : '';
    p.classList.add('is-open');
  }
  SUITE.toggleNotesPanel = toggleNotesPanel;

  // ============================================================
  // SLIDE LAYOUTS LIBRARY (B9) — insert a new slide pre-populated with a layout
  // (title, title+body, two-column, section, blank). Placeholders are real editable
  // text objects on the slide canvas.
  // ============================================================
  var LAYOUTS = [
    { key: 'title', label: 'Title' },
    { key: 'titleBody', label: 'Title + Body' },
    { key: 'twoCol', label: 'Two Column' },
    { key: 'section', label: 'Section' },
    { key: 'blank', label: 'Blank' }
  ];

  function _tb(text, opts) {
    var o = { left: opts.left, top: opts.top, width: opts.width, fontSize: opts.fontSize, fill: opts.fill || '#ffffff', fontFamily: opts.font || 'DM Sans', textAlign: opts.align || 'left', editable: true };
    if (opts.weight) o.fontWeight = opts.weight;
    return new fabric.Textbox(text, o);
  }

  function _buildLayout(key, w, h) {
    var cx = w / 2;
    if (key === 'blank') return [];
    if (key === 'section') {
      return [_tb('Section title', { left: w * 0.1, top: h * 0.42, width: w * 0.8, fontSize: Math.round(h * 0.12), font: 'Unbounded', weight: '700', align: 'center' })];
    }
    if (key === 'title') {
      return [
        _tb('Presentation title', { left: w * 0.12, top: h * 0.36, width: w * 0.76, fontSize: Math.round(h * 0.1), font: 'Unbounded', weight: '700', align: 'center' }),
        _tb('Subtitle or author', { left: w * 0.12, top: h * 0.56, width: w * 0.76, fontSize: Math.round(h * 0.042), fill: '#c9c9d4', align: 'center' })
      ];
    }
    if (key === 'titleBody') {
      return [
        _tb('Slide title', { left: w * 0.075, top: h * 0.1, width: w * 0.85, fontSize: Math.round(h * 0.072), font: 'Unbounded', weight: '700' }),
        _tb('Body text goes here. Add your content, bullet points, or supporting detail for this slide.', { left: w * 0.075, top: h * 0.28, width: w * 0.85, fontSize: Math.round(h * 0.036), fill: '#d0d0d8' })
      ];
    }
    if (key === 'twoCol') {
      return [
        _tb('Slide title', { left: w * 0.075, top: h * 0.1, width: w * 0.85, fontSize: Math.round(h * 0.072), font: 'Unbounded', weight: '700' }),
        _tb('Left column content.', { left: w * 0.075, top: h * 0.3, width: w * 0.4, fontSize: Math.round(h * 0.034), fill: '#d0d0d8' }),
        _tb('Right column content.', { left: w * 0.525, top: h * 0.3, width: w * 0.4, fontSize: Math.round(h * 0.034), fill: '#d0d0d8' })
      ];
    }
    return [];
  }

  function addLayoutSlide(key) {
    var page = _curPage();
    if (!pageHasSlideDeck(page)) return;
    if (typeof saveCurrentInnerSlide === 'function') saveCurrentInnerSlide();
    var deck = page._slideDeck;
    addInnerSlide(currentPageIndex, deck.slides.length);
    loadInnerSlide(currentPageIndex, deck.slides.length - 1, { skipSave: true });
    var objs = _buildLayout(key, (typeof CW !== 'undefined' && CW) || 1600, (typeof CH !== 'undefined' && CH) || 900);
    objs.forEach(function (o) { window.canvas.add(o); });
    window.canvas.requestRenderAll();
    if (typeof saveCurrentInnerSlide === 'function') saveCurrentInnerSlide();
    if (typeof renderPageTabs === 'function') renderPageTabs();
    if (typeof syncSlideDeckUi === 'function') syncSlideDeckUi();
  }
  SUITE.addLayoutSlide = addLayoutSlide;
  // (Layouts are offered from the lane "..." more-menu, see _buildMoreMenu.)

  // ============================================================
  // EXPORT (B10) — render every slide to PNG and download a zip (JSZip). Uses the
  // same live-fabric render as Present; no jsPDF dependency (it is lazy-loaded
  // elsewhere and not always present).
  // ============================================================
  function _slideToDataURL(slide, cb) {
    var tmp = document.createElement('canvas');
    var sc = new fabric.StaticCanvas(tmp, { width: slide.w || 1600, height: slide.h || 900, backgroundColor: slide.bg || DEFAULT_BG, enableRetinaScaling: false });
    function done() {
      sc.renderAll();
      var url = null;
      try { url = sc.toDataURL({ format: 'png' }); } catch (e) {}
      try { sc.dispose(); } catch (e) {}
      cb(url);
    }
    if (slide.json) sc.loadFromJSON(slide.json, done); else done();
  }

  function _download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  function exportImages(cb) {
    var deck = _deck();
    if (!deck || typeof JSZip === 'undefined') { if (cb) cb(null); return; }
    if (typeof saveCurrentInnerSlide === 'function') saveCurrentInnerSlide();
    var zip = new JSZip();
    var i = 0;
    function next() {
      if (i >= deck.slides.length) {
        zip.generateAsync({ type: 'blob' }).then(function (blob) {
          window.__ccLastExportSize = blob.size;
          _download(blob, 'dika-slides.zip');
          if (cb) cb(blob);
        });
        return;
      }
      var s = deck.slides[i]; var idx = i; i++;
      _slideToDataURL(s, function (url) {
        if (url && url.indexOf(',') >= 0) zip.file('slide-' + (idx + 1) + '.png', url.split(',')[1], { base64: true });
        next();
      });
    }
    next();
  }
  SUITE.exportImages = exportImages;

  /* ── Our own deck format (.dikadeck) export + import ──
     `.cartcraft` was this format's extension before the rename and stays in the accept filter: the
     importer validates only that `slides` is an array and never looks at `doc.format`, so a deck
     exported by an earlier build still opens. */
  function exportDeckFile() {
    var page = _curPage();
    if (!pageHasSlideDeck(page)) return;
    if (typeof saveCurrentInnerSlide === 'function') saveCurrentInnerSlide();
    var deck = page._slideDeck;
    var doc = {
      format: 'dika-slide-deck', version: 1,
      w: page.w || 1600, h: page.h || 900,
      slides: deck.slides.map(function (s) {
        return { id: s.id, label: s.label, json: s.json, bg: s.bg, w: s.w, h: s.h, transition: s.transition, transitionPreset: s.transitionPreset, transitionDirection: s.transitionDirection, transitionDuration: s.transitionDuration, transitionEasing: s.transitionEasing, animations: s.animations, notes: s.notes, hidden: s.hidden, autoMs: s.autoMs };
      })
    };
    _download(new Blob([JSON.stringify(doc)], { type: 'application/json' }), 'dika-deck.dikadeck');
  }
  SUITE.exportDeckFile = exportDeckFile;

  function _newId() { return (typeof _sdNextSlideId === 'function') ? _sdNextSlideId() : ('imp-' + Math.random().toString(36).slice(2)); }

  function importDeckFile() {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.dikadeck,.cartcraft,application/json';
    inp.onchange = function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        var doc;
        try { doc = JSON.parse(r.result); } catch (e) { doc = null; }
        if (!doc || !Array.isArray(doc.slides)) { if (typeof showCustomAlert === 'function') showCustomAlert('Not a valid dika studio deck file.'); return; }
        var page = _curPage();
        if (typeof ensureSlideDeck === 'function') ensureSlideDeck(page, { w: doc.w || 1600, h: doc.h || 900 });
        if (typeof saveCurrentInnerSlide === 'function') saveCurrentInnerSlide();
        doc.slides.forEach(function (s) { s.id = _newId(); page._slideDeck.slides.push(s); });
        if (typeof _sdNormalizeDeck === 'function') _sdNormalizeDeck(page);
        if (typeof loadInnerSlide === 'function') loadInnerSlide(currentPageIndex, page._slideDeck.slides.length - 1, { skipSave: true });
        if (typeof renderPageTabs === 'function') renderPageTabs();
        if (typeof syncSlideDeckUi === 'function') syncSlideDeckUi();
      };
      r.readAsText(f);
    };
    inp.click();
  }
  SUITE.importDeckFile = importDeckFile;

  // ── PowerPoint (.pptx) FULL export: lazy-loads the converter on demand (keeps startup
  // light) and shows a progress modal while it renders entirely in the browser. ──
  var _pptxScriptLoading = null;
  function _loadPptxConverter() {
    if (window.CCPptxConvert) return Promise.resolve();
    if (_pptxScriptLoading) return _pptxScriptLoading;
    _pptxScriptLoading = new Promise(function (resolve, reject) {
      var sc = document.createElement("script");
      sc.src = "js/vendor/cc-pptx-convert.js?v=1";
      sc.onload = function () { resolve(); };
      sc.onerror = function () { _pptxScriptLoading = null; reject(new Error("Could not load the PPTX converter")); };
      document.head.appendChild(sc);
    });
    return _pptxScriptLoading;
  }
  var _pptxModal = null;
  function _pptxProgressModal() {
    if (_pptxModal && _pptxModal.parentNode) return _pptxModal;
    var m = document.createElement("div");
    m.className = "cc-pptx-modal";
    m.innerHTML = "<div class=\"cc-pptx-box\"><div class=\"cc-pptx-title\">Exporting to PowerPoint</div><div class=\"cc-pptx-sub\">Converting slides in your browser...</div><div class=\"cc-pptx-bar\"><div class=\"cc-pptx-fill\"></div></div><div class=\"cc-pptx-count\">0%</div></div>";
    document.body.appendChild(m);
    _pptxModal = m;
    return m;
  }
  function _pptxSetProgress(done, total, label) {
    if (!_pptxModal) return;
    var pct = total ? Math.round(done / total * 100) : 0;
    _pptxModal.querySelector(".cc-pptx-fill").style.width = pct + "%";
    _pptxModal.querySelector(".cc-pptx-count").textContent = pct + "%";
    if (label) _pptxModal.querySelector(".cc-pptx-sub").textContent = label;
  }
  function _pptxClose() { if (_pptxModal && _pptxModal.parentNode) { _pptxModal.parentNode.removeChild(_pptxModal); _pptxModal = null; } }
  function exportPptxFull() {
    if (!_hasDeck()) return;
    if (typeof saveCurrentInnerSlide === "function") saveCurrentInnerSlide();
    var deck = _deck(); if (!deck || !deck.slides.length) return;
    var page = _curPage();
    var slides = deck.slides;
    _pptxProgressModal(); _pptxSetProgress(0, slides.length, "Preparing...");
    _loadPptxConverter().then(function () {
      return window.CCPptxConvert.build(slides, { w: page.w || 1600, h: page.h || 900, onProgress: function (d, t, label) { _pptxSetProgress(d, t, label); } });
    }).then(function (blob) {
      window.__ccLastPptxSize = blob.size;
      _download(blob, "dika-slides.pptx");
      _pptxSetProgress(1, 1, "Done");
      setTimeout(_pptxClose, 500);
    }).catch(function (e) {
      _pptxClose();
      if (typeof showCustomAlert === "function") showCustomAlert("PowerPoint export failed: " + (e && e.message ? e.message : e));
    });
  }
  SUITE.exportPptxFull = exportPptxFull;

  // ============================================================
  // OVERRIDES — point the existing UI triggers at the new engine.
  // Assignments (not declarations) so they win in dev and prod regardless of order.
  // ============================================================
  window.syncSlideDeckUi = syncSlideDeckUi;
  window.openSlidePresenter = openPresent;
  window.closeSlidePresenter = closePresent;
  window._sdOpenTransitionPopover = function (idx) { openTxModal(idx); };
  SUITE.syncSlideDeckUi = syncSlideDeckUi;

  if (window.cc && cc.modules) cc.modules.register({ id: 'deck-ui', parent: 'slide-deck', title: 'Slide deck UI', mount: function () {}, unmount: function () {} });
})();
