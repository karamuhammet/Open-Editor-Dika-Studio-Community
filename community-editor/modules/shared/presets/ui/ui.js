/* Shared module: presets/ui — the save dialog and the preset library modal.

   Built on the video inspector's modal shell (`.ve-cgm` / `.ve-cgm-head` / `.ve-cgm-body`) and its
   control classes, the same way the image panel is: reusing those classes is what makes a third
   surface look like it belongs instead of merely resembling the other two.

   The buttons are INJECTED, not authored into each panel. Any `.ve-insp-section-title` that carries
   `data-preset-part="filters|grade|lut|curves|film|effect"` gets a save + library pair; a
   `data-preset-part="*"` means "the whole look". The video clip inspector is decorated by matching
   its own section titles, so no edit to that shipped module is needed. */
(function () {
  'use strict';

  function P() { return window.CCPresets; }
  function _icon(n, s) { return (typeof getIcon === 'function' && getIcon(n, s || 13)) || ''; }
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var UI = window.CCPresetsUI = {};
  var _state = { part: 'all', q: '', selected: null };

  /* ── Shell ─────────────────────────────────────────────────────────────────────────────── */
  function _modal(id, titleIcon, title, bodyHtml, width) {
    _close(id);
    var back = document.createElement('div');
    back.id = id + '-back';
    back.className = 'cc-ps-back';
    var box = document.createElement('div');
    box.id = id;
    box.className = 've-cgm cc-ps-modal';
    box.style.width = (width || 600) + 'px';
    box.innerHTML =
      '<div class="ve-cgm-head"><span class="ve-cgm-title">' + _icon(titleIcon, 13) + ' ' + title + '</span>' +
        '<button type="button" class="ve-cgm-x" data-psclose="1" title="Close">' + _icon('x', 13) + '</button></div>' +
      '<div class="ve-cgm-body">' + bodyHtml + '</div>';
    back.appendChild(box);
    document.body.appendChild(back);
    back.addEventListener('mousedown', function (e) { if (e.target === back) _close(id); });
    box.addEventListener('click', function (e) { if (e.target.closest('[data-psclose]')) _close(id); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { _close(id); document.removeEventListener('keydown', esc); }
    });
    return box;
  }
  function _close(id) {
    var b = document.getElementById(id + '-back');
    if (b && b.parentNode) b.parentNode.removeChild(b);
  }

  /* ── Save dialog ───────────────────────────────────────────────────────────────────────── */
  UI.openSave = function (onlyPart) {
    var api = P(); if (!api) return;
    var target = api.currentTarget();
    if (!target) { if (typeof showToast === 'function') showToast('Select an image or a clip first'); return; }
    var cap = api.capture(target);
    var support = api.PART_SUPPORT[target.kind] || {};

    var rows = '';
    api.PARTS.forEach(function (k) {
      var has = cap.parts[k] != null;
      var on = has && (!onlyPart || onlyPart === '*' || onlyPart === k);
      var note = !support[k] ? 'not for ' + target.kind : (has ? _partNote(k, cap.parts[k]) : 'not set');
      rows += '<label class="cc-ps-ck' + (has && support[k] ? '' : ' is-off') + '">' +
        '<input type="checkbox" data-pspart="' + k + '"' + (on ? ' checked' : '') + (has && support[k] ? '' : ' disabled') + '>' +
        '<span>' + api.PART_LABEL[k] + '</span><span class="cc-ps-mut">' + _esc(note) + '</span></label>';
    });

    var box = _modal('cc-ps-save', 'save', 'Save preset',
      '<input type="text" class="cc-ps-input" id="cc-ps-name" placeholder="Moody teal" maxlength="60">' +
      '<div class="ve-cg-grp">What to save</div>' + rows +
      '<div class="ve-cg-grp">Applies to</div>' +
      '<div class="rpf-seg" id="cc-ps-scope">' +
        '<button type="button" data-psscope="both" class="on">Both</button>' +
        '<button type="button" data-psscope="image">Image</button>' +
        '<button type="button" data-psscope="video">Video</button></div>' +
      '<div class="cc-ps-btns"><button type="button" class="ve-insp-btn" data-psclose="1">Cancel</button>' +
      '<button type="button" class="ve-insp-btn is-pri" id="cc-ps-do">' + _icon('check', 12) + ' Save</button></div>', 320);

    var nameEl = box.querySelector('#cc-ps-name');
    if (nameEl) setTimeout(function () { nameEl.focus(); }, 30);
    var scope = 'both';
    box.querySelector('#cc-ps-scope').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-psscope]'); if (!b) return;
      scope = b.getAttribute('data-psscope');
      box.querySelectorAll('#cc-ps-scope button').forEach(function (x) { x.classList.toggle('on', x === b); });
    });
    box.querySelector('#cc-ps-do').addEventListener('click', function () {
      var picked = {}, any = false;
      box.querySelectorAll('[data-pspart]:checked').forEach(function (c) {
        var k = c.getAttribute('data-pspart');
        if (cap.parts[k] != null) { picked[k] = cap.parts[k]; any = true; }
      });
      if (cap.parts.curvesDesaturate && picked.curves) picked.curvesDesaturate = true;
      if (!any) { if (typeof showToast === 'function') showToast('Pick at least one part'); return; }
      api.save({ name: (nameEl && nameEl.value) || 'Untitled', scope: scope, parts: picked, thumb: api.thumbFor(target) });
      _close('cc-ps-save');
      if (typeof showToast === 'function') showToast('Preset saved');
    });
  };

  function _partNote(k, v) {
    if (k === 'lut') return String(v);
    if (k === 'film') return String(v);
    if (k === 'curves') return Object.keys(v).join(', ');
    if (k === 'filters') return Object.keys(v).length + ' values';
    if (k === 'effect') return Object.keys(v).filter(function (x) { return v[x] && v[x] !== 100 && v[x] !== 'source-over'; }).join(', ') || 'set';
    return 'set';
  }

  /* ── Library modal ─────────────────────────────────────────────────────────────────────── */
  UI.openLibrary = function (part) {
    var api = P(); if (!api) return;
    _state.part = part && part !== '*' ? part : 'all';
    _state.q = ''; _state.selected = null;
    var chips = ['all'].concat(api.PARTS);
    var chipHtml = chips.map(function (c) {
      return '<button type="button" class="rpf-chipbtn' + (c === _state.part ? ' on' : '') + '" data-pschip="' + c + '">' +
        (c === 'all' ? 'All' : api.PART_LABEL[c]) + '</button>';
    }).join('');

    var box = _modal('cc-ps-lib', 'library', 'Preset library',
      '<div class="cc-ps-search">' + _icon('search', 13) + '<input type="text" id="cc-ps-q" placeholder="Search presets"></div>' +
      '<div class="rpf-chipbtns" id="cc-ps-chips">' + chipHtml + '</div>' +
      '<div class="cc-ps-grid" id="cc-ps-grid"></div>' +
      '<div class="cc-ps-btns">' +
        '<button type="button" class="ve-insp-btn" id="cc-ps-rename">' + _icon('pencil', 12) + ' Rename</button>' +
        '<button type="button" class="ve-insp-btn" id="cc-ps-del">' + _icon('trash', 12) + ' Delete</button>' +
        '<button type="button" class="ve-insp-btn" id="cc-ps-exp">' + _icon('download', 12) + ' Export</button>' +
        '<button type="button" class="ve-insp-btn" id="cc-ps-imp">' + _icon('upload', 12) + ' Import</button>' +
        '<button type="button" class="ve-insp-btn is-pri" id="cc-ps-apply">' + _icon('check', 12) + ' Apply to selection</button>' +
      '</div><input type="file" id="cc-ps-file" accept="application/json,.json" style="display:none">', 600);

    function render() {
      var target = api.currentTarget();
      var list = api.list({ part: _state.part === 'all' ? null : _state.part, q: _state.q, kind: target ? target.kind : null });
      var g = box.querySelector('#cc-ps-grid');
      if (!list.length) {
        /* An empty library is an invitation, not an error: the one thing a person can do here is
           save what they already made. */
        g.innerHTML = '<div class="cc-ps-empty">' + (api.list().length ? 'No preset matches that filter.' : 'No presets yet. Style an image or a clip, then press Save.') + '</div>';
        return;
      }
      g.innerHTML = list.map(function (p) {
        var badges = api.PARTS.filter(function (k) { return p.parts[k] != null; });
        var full = badges.length >= 4;
        return '<button type="button" class="cc-ps-card' + (p.id === _state.selected ? ' on' : '') + '" data-psid="' + p.id + '">' +
          (p.thumb ? '<img class="cc-ps-thumb" src="' + p.thumb + '" alt="">' : '<span class="cc-ps-thumb cc-ps-nothumb">' + _icon('image', 16) + '</span>') +
          '<span class="cc-ps-cname">' + _esc(p.name) + '</span>' +
          '<span class="cc-ps-badges">' +
            (full ? '<span class="cc-ps-bdg is-full">Full</span>' : badges.map(function (k) { return '<span class="cc-ps-bdg">' + api.PART_LABEL[k] + '</span>'; }).join('')) +
            '<span class="cc-ps-bdg">' + (p.scope === 'both' ? 'img+vid' : p.scope) + '</span>' +
          '</span></button>';
      }).join('');
    }
    render();

    box.querySelector('#cc-ps-chips').addEventListener('click', function (e) {
      var b = e.target.closest('[data-pschip]'); if (!b) return;
      _state.part = b.getAttribute('data-pschip');
      box.querySelectorAll('#cc-ps-chips .rpf-chipbtn').forEach(function (x) { x.classList.toggle('on', x === b); });
      render();
    });
    box.querySelector('#cc-ps-q').addEventListener('input', function (e) { _state.q = e.target.value; render(); });
    box.querySelector('#cc-ps-grid').addEventListener('click', function (e) {
      var c = e.target.closest('[data-psid]'); if (!c) return;
      _state.selected = c.getAttribute('data-psid');
      box.querySelectorAll('.cc-ps-card').forEach(function (x) { x.classList.toggle('on', x === c); });
    });
    box.querySelector('#cc-ps-grid').addEventListener('dblclick', function (e) {
      var c = e.target.closest('[data-psid]'); if (!c) return;
      _state.selected = c.getAttribute('data-psid');
      doApply();
    });

    function need() {
      if (_state.selected) return true;
      if (typeof showToast === 'function') showToast('Pick a preset first');
      return false;
    }
    function doApply() {
      if (!need()) return;
      var res = api.apply(api.get(_state.selected));
      if (typeof showToast === 'function') {
        if (!res.ok) showToast(res.error || 'Could not apply');
        else if (res.skipped && res.skipped.length) showToast('Applied. Skipped: ' + res.skipped.join(', '));
        else showToast('Preset applied');
      }
      if (res.ok) _close('cc-ps-lib');
    }
    box.querySelector('#cc-ps-apply').addEventListener('click', doApply);
    box.querySelector('#cc-ps-del').addEventListener('click', function () {
      if (!need()) return;
      api.remove(_state.selected); _state.selected = null; render();
    });
    box.querySelector('#cc-ps-rename').addEventListener('click', function () {
      if (!need()) return;
      var cur = api.get(_state.selected);
      var n = window.prompt('Preset name', cur ? cur.name : '');
      if (n != null) { api.rename(_state.selected, n); render(); }
    });
    box.querySelector('#cc-ps-exp').addEventListener('click', function () {
      var blob = new Blob([api.exportAll()], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'dika-presets.json'; a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    });
    var fileEl = box.querySelector('#cc-ps-file');
    box.querySelector('#cc-ps-imp').addEventListener('click', function () { fileEl.click(); });
    fileEl.addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0]; e.target.value = '';
      if (!f) return;
      var r = new FileReader();
      r.onload = function (ev) {
        var res = api.importJson(ev.target.result);
        if (typeof showToast === 'function') showToast(res.ok ? (res.added + ' preset imported') : (res.error || 'Import failed'));
        render();
      };
      r.readAsText(f);
    });
  };

  /* ── Injecting the buttons ─────────────────────────────────────────────────────────────── */
  function _btns(part) {
    var w = document.createElement('span');
    w.className = 'cc-ps-hdr';
    w.innerHTML =
      '<button type="button" class="cc-ps-hbtn" data-pssave="' + part + '" title="Save as preset">' + _icon('save', 13) + '</button>' +
      '<button type="button" class="cc-ps-hbtn" data-pslib="' + part + '" title="Preset library">' + _icon('folder', 13) + '</button>';
    w.addEventListener('click', function (e) {
      // The header is also the accordion toggle; a button press must not fold the section shut.
      e.stopPropagation();
      var s = e.target.closest('[data-pssave]'), l = e.target.closest('[data-pslib]');
      if (s) UI.openSave(s.getAttribute('data-pssave'));
      else if (l) UI.openLibrary(l.getAttribute('data-pslib'));
    });
    return w;
  }

  /* Titles the VIDEO inspector renders, mapped to the part they hold. Matching on the visible text
     is deliberate: it needs no edit to that shipped module, and those two strings are the same ones
     the image panel uses, so one map covers both. */
  var TITLE_PART = { 'Filters': 'filters', 'Color Grading': 'grade', 'Film': 'film', 'Duotone': 'curves', 'Remove Color': 'effect' };

  UI.decorate = function (root) {
    root = root || document;
    var titles = root.querySelectorAll('.ve-insp-section-title');
    for (var i = 0; i < titles.length; i++) {
      var t = titles[i];
      if (t._ccPsDone) continue;
      var sec = t.closest('.ve-insp-section');
      var part = (sec && sec.getAttribute('data-preset-part')) || TITLE_PART[t.textContent.trim()] || '';
      if (!part) continue;
      t._ccPsDone = true;
      var chev = t.querySelector('.ve-acc-chev');
      var b = _btns(part);
      if (chev) t.insertBefore(b, chev); else t.appendChild(b);
    }
  };

  function init() {
    /* The docked clip inspector re-renders its whole body on every selection, so a one-shot
       decoration would last exactly until the next click. Watch the panel instead. */
    var host = document.getElementById('rp-properties-wrap') || document.querySelector('.rpanel');
    if (host && window.MutationObserver) {
      var mo = new MutationObserver(function () { UI.decorate(host); });
      mo.observe(host, { childList: true, subtree: true });
    }
    UI.decorate(document);

    // "Save the whole look" lives on the image panel's tab strip.
    var tabs = document.getElementById('rp-img-tabs');
    if (tabs && !tabs.querySelector('[data-pssave]')) {
      var all = document.createElement('button');
      all.type = 'button';
      all.className = 'cc-ps-hbtn cc-ps-tabbtn';
      all.title = 'Save every setting as one preset';
      all.setAttribute('data-pssave', '*');
      all.innerHTML = _icon('save', 14);
      all.addEventListener('click', function (e) { e.stopPropagation(); UI.openSave('*'); });
      tabs.appendChild(all);
    }
  }

  if (window.cc && cc.on) cc.on('cc:canvas-ready', function () { setTimeout(function () { cc.safe('shared.presets.ui', init); }, 400); });
  if (window.cc && cc.modules) cc.modules.register({ id: 'ui', parent: 'shared.presets', title: 'Preset library UI', mount: function () {}, unmount: function () {} });
})();
