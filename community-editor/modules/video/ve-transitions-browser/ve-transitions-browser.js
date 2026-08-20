/* ═══════════════════════════════════════════════════════════════
   VE Transitions Browser — Visual grid browser for 37 transitions
   Faz 2 — Kategorize grid, canvas thumbnail preview, drag-drop
   ═══════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  var _panel = null;
  var _isOpen = false;
  var _activeCategory = 'all';
  var _selectedTransId = null;
  var _thumbCache = {};
  var _activeDirection = 'in';

  var CATEGORIES = [
    { id: 'all',     label: 'All',     icon: 'grid' },
    { id: 'fade',    label: 'Fade',    icon: 'sun' },
    { id: 'wipe',    label: 'Wipe',    icon: 'arrow-right' },
    { id: 'slide',   label: 'Slide',   icon: 'move' },
    { id: 'zoom',    label: 'Zoom',    icon: 'zoom-in' },
    { id: 'rotate',  label: 'Rotate',  icon: 'rotate-cw' },
    { id: 'blur',    label: 'Blur',    icon: 'droplet' },
    { id: 'special', label: 'Special', icon: 'zap' }
  ];

  function _icon(name, sz) {
    if (typeof getIcon === 'function') { var r = getIcon(name, sz || 14); if (r) return r; }
    return '';
  }

  // ── Get all transitions from VETransitions ──
  function _getTransitions() {
    if (window.VETransitions && VETransitions.TRANSITIONS) return VETransitions.TRANSITIONS;
    // Fallback static list
    return [
      {id:'crossfade',label:'Crossfade',cat:'fade'},{id:'fade-black',label:'Fade to Black',cat:'fade'},
      {id:'fade-white',label:'Fade to White',cat:'fade'},{id:'flash',label:'Flash',cat:'fade'},
      {id:'dissolve',label:'Dissolve',cat:'fade'},{id:'wipe-left',label:'Wipe Left',cat:'wipe'},
      {id:'wipe-right',label:'Wipe Right',cat:'wipe'},{id:'wipe-up',label:'Wipe Up',cat:'wipe'},
      {id:'wipe-down',label:'Wipe Down',cat:'wipe'},{id:'iris-open',label:'Iris Open',cat:'wipe'},
      {id:'iris-close',label:'Iris Close',cat:'wipe'},{id:'diamond',label:'Diamond',cat:'wipe'},
      {id:'clock',label:'Clock Wipe',cat:'wipe'},{id:'slide-left',label:'Slide Left',cat:'slide'},
      {id:'slide-right',label:'Slide Right',cat:'slide'},{id:'slide-up',label:'Slide Up',cat:'slide'},
      {id:'slide-down',label:'Slide Down',cat:'slide'},{id:'push-left',label:'Push Left',cat:'slide'},
      {id:'push-right',label:'Push Right',cat:'slide'},{id:'cover-left',label:'Cover Left',cat:'slide'},
      {id:'cover-right',label:'Cover Right',cat:'slide'},{id:'zoom-in',label:'Zoom In',cat:'zoom'},
      {id:'zoom-out',label:'Zoom Out',cat:'zoom'},{id:'zoom-rotate',label:'Zoom+Rotate',cat:'zoom'},
      {id:'zoom-bounce',label:'Zoom Bounce',cat:'zoom'},{id:'spin-cw',label:'Spin CW',cat:'rotate'},
      {id:'spin-ccw',label:'Spin CCW',cat:'rotate'},{id:'flip-x',label:'Flip H',cat:'rotate'},
      {id:'flip-y',label:'Flip V',cat:'rotate'},{id:'blur-in',label:'Blur In',cat:'blur'},
      {id:'blur-out',label:'Blur Out',cat:'blur'},{id:'pixelate',label:'Pixelate',cat:'blur'},
      {id:'glitch',label:'Glitch',cat:'special'},{id:'morph',label:'Morph',cat:'special'},
      {id:'burn',label:'Burn',cat:'special'},{id:'ripple',label:'Ripple',cat:'special'},
      {id:'curtain',label:'Curtain',cat:'special'}
    ];
  }


  // ── Make the panel draggable by its header ──
  function _wireDrag(handle) {
    if (!handle) return;
    var sx, sy, ox, oy, dragging = false;
    function onMove(e) {
      if (!dragging) return;
      var nx = Math.max(0, Math.min(window.innerWidth - 80, ox + (e.clientX - sx)));
      var ny = Math.max(0, Math.min(window.innerHeight - 40, oy + (e.clientY - sy)));
      _panel.style.left = nx + 'px'; _panel.style.top = ny + 'px';
    }
    function onUp() { dragging = false; handle.classList.remove('vtb-dragging'); document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
    handle.addEventListener('mousedown', function(e) {
      if (e.target.closest('.vtb-close')) return;
      dragging = true; handle.classList.add('vtb-dragging');
      var r = _panel.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      e.preventDefault();
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // ── Build panel DOM ──
  function _buildPanel() {
    if (_panel) return _panel;
    _panel = document.createElement('div');
    _panel.className = 've-trans-browser';

    var DIRS = [
      { d: 'in',   label: 'In', icon: 'log-in' },
      { d: 'out',  label: 'Out', icon: 'log-out' },
      { d: 'both', label: 'Both', icon: 'repeat' }
    ];
    var tabsHtml = CATEGORIES.map(function(c) {
      return '<button class="vtb-tab' + (c.id === 'all' ? ' active' : '') + '" data-cat="' + c.id + '">' + c.label + '</button>';
    }).join('');
    var dirsHtml = DIRS.map(function(x) {
      return '<button class="vtb-dir' + (x.d === 'in' ? ' active' : '') + '" data-dir="' + x.d + '">' + _icon(x.icon, 13) + x.label + '</button>';
    }).join('');

    _panel.innerHTML =
      '<div class="vtb-header">' +
        '<span class="vtb-title">' + _icon('shuffle', 16) + 'Transitions</span>' +
        '<button class="vtb-close" aria-label="Close">' + _icon('x', 14) + '</button>' +
      '</div>' +
      '<div class="vtb-tabs">' + tabsHtml + '</div>' +
      '<div class="vtb-settings">' +
        '<div class="vtb-row"><span class="vtb-label">Duration</span>' +
          '<input type="range" id="ve-trans-dur" class="vtb-slider" min="0.1" max="3.0" step="0.1" value="0.5">' +
          '<span id="ve-trans-dur-val" class="vtb-durval">0.5s</span></div>' +
        '<div class="vtb-row"><span class="vtb-label">Apply</span><div class="vtb-dirs">' + dirsHtml + '</div></div>' +
      '</div>' +
      '<div id="ve-trans-grid" class="vtb-grid ve-panel-scroll"></div>';

    document.body.appendChild(_panel);

    // ── Events ──
    _panel.querySelector('.vtb-close').addEventListener('click', function() { _hide(); });

    _panel.addEventListener('click', function(e) {
      var tab = e.target.closest('.vtb-tab');
      if (tab) {
        _activeCategory = tab.dataset.cat;
        _panel.querySelectorAll('.vtb-tab').forEach(function(t) { t.classList.toggle('active', t.dataset.cat === _activeCategory); });
        _renderGrid();
        return;
      }
      var dirBtn = e.target.closest('.vtb-dir');
      if (dirBtn) {
        _activeDirection = dirBtn.dataset.dir;
        _panel.querySelectorAll('.vtb-dir').forEach(function(b) { b.classList.toggle('active', b.dataset.dir === _activeDirection); });
      }
    });

    var durSlider = _panel.querySelector('#ve-trans-dur');
    var durVal = _panel.querySelector('#ve-trans-dur-val');
    durSlider.addEventListener('input', function() { durVal.textContent = parseFloat(this.value).toFixed(1) + 's'; });

    _wireDrag(_panel.querySelector('.vtb-header'));

    _renderGrid();
    if (window.VEPanelHelpers) VEPanelHelpers.decorate(_panel);
    return _panel;
  }

  // ── Render transition grid ──
  function _renderGrid() {
    var container = _panel.querySelector('#ve-trans-grid');
    if (!container) return;
    container.innerHTML = '';
    var all = _getTransitions();
    var filtered = _activeCategory === 'all' ? all : all.filter(function(t) { return t.cat === _activeCategory; });

    // REUSE the right-panel inspector card (icon + label) so the modal matches Efekt > Geçişler 1:1.
    var iconFor = (window.VETransitions && VETransitions.iconFor) ? VETransitions.iconFor : function() { return 'shuffle'; };
    filtered.forEach(function(t) {
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 've-insp-trcard ve-insp-fxcard--grid' + (t.id === _selectedTransId ? ' active' : '');
      card.dataset.transId = t.id;
      card.draggable = true;
      card.title = t.label;
      card.innerHTML = '<span class="ve-insp-trcard-ic">' + _icon(iconFor(t.id), 16) + '</span>' +
        '<span class="ve-insp-trcard-lb"></span>';
      card.querySelector('.ve-insp-trcard-lb').textContent = t.label;

      // Click → apply to selected clip
      card.addEventListener('click', function() {
        _selectedTransId = t.id;
        _panel.querySelectorAll('.ve-insp-trcard').forEach(function(c) { c.classList.toggle('active', c.dataset.transId === t.id); });
        _applyTransition(t.id);
      });

      // Drag → drop between clips
      card.addEventListener('dragstart', function(e) {
        e.dataTransfer.setData('text/plain', 've-transition:' + t.id);
        e.dataTransfer.effectAllowed = 'copy';
      });

      container.appendChild(card);
    });
  }

  // ── Apply transition to selected clips ──
  function _applyTransition(transId) {
    var durEl = _panel ? _panel.querySelector('#ve-trans-dur') : null;
    var dur = durEl ? parseFloat(durEl.value) : 0.5;
    var applied = false;
    var firstClipStart = null;
    var firstClipEnd = null;
    // getSelectedClips returns array of clip IDs
    if (window.VideoEditor && VideoEditor.getSelectedClips) {
      var clipIds = VideoEditor.getSelectedClips();
      if (clipIds && clipIds.length > 0) {
        clipIds.forEach(function(clipId) {
          if (VideoEditor.setTransition) {
            // Find clip to get its start/end time for seeking
            var clip = VideoEditor.findClipById ? VideoEditor.findClipById(clipId) : null;
            if (clip && firstClipStart === null) {
              firstClipStart = clip.startTime;
              firstClipEnd = clip.startTime + clip.duration;
            }
            // Apply based on direction selector
            if (_activeDirection === 'in' || _activeDirection === 'both') {
              VideoEditor.setTransition(clipId, 'in', transId, dur);
            }
            if (_activeDirection === 'out' || _activeDirection === 'both') {
              VideoEditor.setTransition(clipId, 'out', transId, dur);
            }
            applied = true;
          }
        });
        // Seek to the transition area so user can see the effect immediately
        if (applied && firstClipStart !== null && VideoEditor.seek) {
          if (_activeDirection === 'out' && firstClipEnd !== null) {
            // Seek near the end for out-transition preview
            VideoEditor.seek(Math.max(0, firstClipEnd - dur));
          } else {
            // Seek to clip start for in-transition preview
            VideoEditor.seek(firstClipStart);
          }
        }
      } else {
        if (typeof showToast === 'function') showToast('Select a clip first', 'warning');
      }
    }
    // Flash applied feedback (ring via box-shadow so the CSS border is left intact)
    var cards = _panel ? _panel.querySelectorAll('.ve-insp-trcard') : [];
    cards.forEach(function(c) {
      if (c.dataset.transId === transId) {
        c.style.boxShadow = applied ? '0 0 0 2px #4ade80' : '0 0 0 2px #ef4444';
        setTimeout(function() { c.style.boxShadow = ''; }, 600);
      }
    });
    if (applied && typeof showToast === 'function') {
      var dirLabel = _activeDirection === 'both' ? 'In+Out' : (_activeDirection === 'out' ? 'Out' : 'In');
      showToast('Transition ' + dirLabel + ': ' + transId);
    }
  }

  function _show() {
    var p = _buildPanel();
    p.style.display = 'flex';
    _isOpen = true;
  }

  function _hide() {
    if (_panel) _panel.style.display = 'none';
    _isOpen = false;
  }

  function _toggle() {
    _isOpen ? _hide() : _show();
  }

  // ── Public API ──
  window.VETransitionsBrowser = {
    show: _show,
    hide: _hide,
    toggle: _toggle,
    isOpen: function() { return _isOpen; },
    applyTransition: _applyTransition
  };
})();

// Modular skeleton hook (Faz 8) — ve-transitions-browser is now a video loader module (modules/video/). Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-transitions-browser', parent: 'video', title: 've-transitions-browser', mount: function () {}, unmount: function () {} });
