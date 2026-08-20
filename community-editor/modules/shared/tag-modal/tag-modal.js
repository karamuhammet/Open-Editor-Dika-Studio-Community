/* Module: shared/tag-modal — CCTagModal (G1). A global, Figma/Canva-style tag manager + assigner that
   opens anywhere: CCTagModal.open({ target?, onChange? }). With a `target` ({type,id} or a raw page/frame)
   it's in ASSIGN mode — click a tag to toggle it on that target. Without one it's MANAGE mode — create,
   edit, recolor, re-icon, regroup, delete. Pure UI over the shared/tags G0 data layer (window.CCTags);
   it adds no storage logic. Chrome mirrors CCImageModal (center overlay, --surface panel, ESC/✕, 160ms).
   See docs/tagging-system-plan.md §5. */
(function (global) {
  'use strict';

  var _overlay = null, _panel = null, _titleEl = null, _sideEl = null, _mainEl = null;
  var _built = false, _open = false;
  var _target = null, _onChange = null;
  var _activeGroup = 'all';            // 'all' | <groupId> | 'library'
  var _editTagId = null;               // tag being edited (form open) | null
  var _creating = false;               // create-tag form open
  var _creatingGroup = false;          // create-group inline input open
  var _form = { color: '', icon: 'tag', groupId: null };
  var _unsub = null;

  // Validated Lucide names (every one renders via getIcon — checked live). Curated for tagging.
  var TAG_ICONS = ['tag', 'star', 'heart', 'flag', 'bookmark', 'check-circle', 'circle-check', 'pencil',
    'clock', 'calendar', 'user', 'users', 'briefcase', 'folder', 'image', 'camera', 'palette', 'droplet',
    'zap', 'flame', 'sparkles', 'award', 'trophy', 'target', 'bell', 'map-pin', 'package', 'layers', 'hash',
    'alert-circle', 'info', 'eye', 'lock', 'send', 'rocket', 'gift', 'thumbs-up', 'leaf', 'shopping-cart',
    'dollar-sign', 'megaphone', 'shield', 'globe', 'filter', 'crown', 'gem', 'sticky-note', 'clipboard',
    'list', 'bug', 'wrench', 'smile'];

  var PALETTE = ['#f2ff58', '#e05252', '#e0a852', '#52e0a8', '#5290e0', '#a852e0', '#52e0e0', '#e0e052',
    '#f59e0b', '#14b8a6', '#f43f5e', '#8b5cf6'];

  function _icon(name, size) {
    if (typeof getIcon !== 'function') return '';
    var s = getIcon(name || 'tag', size || 16);
    return s || getIcon('tag', size || 16) || '';
  }
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // _target may be a single {type,id} OR an array (bulk tagging from the works browser).
  function _targets() { return Array.isArray(_target) ? _target : (_target ? [_target] : []); }
  function _isAssign() { return _targets().length > 0; }
  function _has(tag) {
    var ts = _targets(); if (!ts.length || !global.CCTags) return false;
    for (var i = 0; i < ts.length; i++) if (!CCTags.has(ts[i], tag.id)) return false;
    return true;   // ✓ shown only when ALL selected targets carry the tag
  }

  // ── build chrome once ──
  function _build() {
    if (_built) return;
    _overlay = document.createElement('div');
    _overlay.className = 'cctm-overlay';
    _overlay.addEventListener('mousedown', function (e) { if (e.target === _overlay) close(); });

    _panel = document.createElement('div');
    _panel.className = 'cctm';
    _panel.setAttribute('role', 'dialog');
    _panel.setAttribute('aria-modal', 'true');

    var head = document.createElement('div');
    head.className = 'cctm-head';
    _titleEl = document.createElement('div');
    _titleEl.className = 'cctm-title';
    var x = document.createElement('button');
    x.className = 'cctm-x'; x.type = 'button'; x.innerHTML = _icon('x', 18) || '✕';
    x.addEventListener('click', close);
    head.appendChild(_titleEl);
    head.appendChild(x);

    var body = document.createElement('div');
    body.className = 'cctm-body';
    _sideEl = document.createElement('div'); _sideEl.className = 'cctm-side';
    _mainEl = document.createElement('div'); _mainEl.className = 'cctm-main';
    body.appendChild(_sideEl);
    body.appendChild(_mainEl);

    _panel.appendChild(head);
    _panel.appendChild(body);
    _overlay.appendChild(_panel);
    document.body.appendChild(_overlay);

    _sideEl.addEventListener('click', _onSideClick);
    _mainEl.addEventListener('click', _onMainClick);
    _mainEl.addEventListener('input', _onMainInput);
    _built = true;
  }

  function _onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  }

  // ── render ──
  function _renderAll() { _renderTitle(); _renderSide(); _renderMain(); }

  function _renderTitle() {
    var label = 'Tags', ts = _targets();
    if (ts.length > 1) label = 'Tag · ' + ts.length + ' work';
    else if (ts.length === 1) label = 'Tag · ' + (ts[0].type === 'frame' ? 'Frame' : ts[0].type === 'page' ? 'Page' : 'Item');
    _titleEl.innerHTML = (_icon('tags', 17) || '') + '<span>' + _esc(label) + '</span>';
  }

  function _renderSide() {
    var groups = CCTags.groups();
    var html = '';
    html += _sideItem('all', _icon('tags', 15), 'All', null, CCTags.list({ scope: 'project' }).length);
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var cnt = CCTags.list({ scope: 'project' }).filter(function (t) { return t.groupId === g.id; }).length;
      var badge = g.rule === 'exclusive' ? '<span class="cctm-rule" title="Single selection (status)">1×</span>'
                : g.rule === 'required' ? '<span class="cctm-rule" title="Required">!</span>' : '';
      html += _sideItem(g.id, _icon('folder', 15), g.name, g.color, cnt, badge);
    }
    html += '<div class="cctm-side-sep"></div>';
    html += _sideItem('library', _icon('package', 15), 'Library', null, CCTags.list({ scope: 'library' }).length);
    _sideEl.innerHTML = html;
  }
  function _sideItem(id, ico, name, color, count, badge) {
    var dot = color ? '<span class="cctm-side-dot" style="background:' + _esc(color) + '"></span>' : ico;
    return '<button type="button" class="cctm-side-item' + (_activeGroup === id ? ' on' : '') + '" data-g="' + _esc(id) + '">' +
      '<span class="cctm-side-ico">' + dot + '</span><span class="cctm-side-name">' + _esc(name) + '</span>' +
      (badge || '') + '<span class="cctm-side-cnt">' + count + '</span></button>';
  }

  function _renderMain() {
    var isLib = _activeGroup === 'library';
    var html = '';

    // actions (manage tools hidden in library view)
    html += '<div class="cctm-actions">';
    if (!isLib) {
      html += '<button type="button" class="cctm-btn" data-act="new-tag">' + (_icon('plus', 15) || '+') + ' New tag</button>';
      html += '<button type="button" class="cctm-btn" data-act="new-group">' + (_icon('folder-plus', 15) || _icon('folder', 15)) + ' New group</button>';
    } else {
      html += '<span class="cctm-hint">Cross-project shared pool — click a tag → add to project.</span>';
    }
    html += '</div>';

    // inline group-create (v2: + kural seçici — serbest / tek-seçim(durum) / zorunlu)
    if (_creatingGroup && !isLib) {
      html += '<div class="cctm-groupnew">' +
        '<input class="cctm-input" data-role="gname" placeholder="Group name (e.g. Status, Customer)" maxlength="40">' +
        '<select class="cctm-select" data-role="grule" title="Group rule">' +
          '<option value="free">Free (multiple)</option>' +
          '<option value="exclusive">Single selection (status)</option>' +
          '<option value="required">Required</option>' +
        '</select>' +
        '<button type="button" class="cctm-save" data-act="save-group">Create</button>' +
        '<button type="button" class="cctm-cancel" data-act="cancel-group">Cancel</button></div>';
    }

    // create/edit form
    if ((_creating || _editTagId) && !isLib) html += _formHtml();

    // chips
    var tags = isLib ? CCTags.list({ scope: 'library' })
      : CCTags.list({ scope: 'project' }).filter(function (t) { return _activeGroup === 'all' || t.groupId === _activeGroup; });
    html += '<div class="cctm-chips">';
    if (!tags.length) {
      html += '<div class="cctm-empty">' + (isLib ? 'Library empty. You can add a project tag with ✎ → "Send to Library".' : 'No tags yet. Start with “New tag”.') + '</div>';
    } else {
      for (var i = 0; i < tags.length; i++) html += _chipHtml(tags[i], isLib);
    }
    html += '</div>';

    _mainEl.innerHTML = html;

    var nameInput = _mainEl.querySelector('[data-role="tname"]') || _mainEl.querySelector('[data-role="gname"]');
    if (nameInput) { try { nameInput.focus(); nameInput.select(); } catch (e) {} }
  }

  function _chipHtml(tag, isLib) {
    var assigned = !isLib && _has(tag);
    var mark = '';
    if (_target && !isLib) mark = '<span class="cctm-chip-check">' + (assigned ? (_icon('check', 14) || '✓') : '') + '</span>';
    var act = isLib ? '<span class="cctm-chip-pull">' + (_icon('plus', 14) || '+') + '</span>'
      : '<button type="button" class="cctm-chip-edit" data-edit="' + _esc(tag.id) + '" title="Edit">' + (_icon('pencil', 13) || '✎') + '</button>';
    return '<div class="cctm-chip' + (assigned ? ' assigned' : '') + '" data-chip="' + _esc(tag.id) + '" data-lib="' + (isLib ? '1' : '0') + '">' +
      mark +
      '<span class="cctm-chip-dot" style="background:' + _esc(tag.color) + '">' + (_icon(tag.icon, 12) || '') + '</span>' +
      '<span class="cctm-chip-name">' + _esc(tag.name) + '</span>' + act + '</div>';
  }

  function _formHtml() {
    var editing = !!_editTagId;
    var tag = editing ? CCTags.get(_editTagId) : null;
    var name = tag ? tag.name : '';
    if (!_form.color) _form.color = (tag && tag.color) || PALETTE[CCTags.list({ scope: 'project' }).length % PALETTE.length];
    if (editing && tag) { _form.icon = tag.icon; _form.groupId = tag.groupId || null; }
    var groups = CCTags.groups();

    var sw = '';
    for (var i = 0; i < PALETTE.length; i++) sw += '<button type="button" class="cctm-sw' + (PALETTE[i] === _form.color ? ' sel' : '') + '" style="background:' + PALETTE[i] + '" data-color="' + PALETTE[i] + '"></button>';
    sw += '<label class="cctm-sw cctm-sw-custom" title="Custom color"><input type="color" data-role="customcolor" value="' + _esc(_form.color) + '"></label>';

    var ico = '';
    for (var j = 0; j < TAG_ICONS.length; j++) ico += '<button type="button" class="cctm-ico' + (TAG_ICONS[j] === _form.icon ? ' sel' : '') + '" data-icon="' + TAG_ICONS[j] + '" title="' + TAG_ICONS[j] + '">' + _icon(TAG_ICONS[j], 16) + '</button>';

    var grpOpts = '<option value="">— No group —</option>';
    for (var k = 0; k < groups.length; k++) grpOpts += '<option value="' + _esc(groups[k].id) + '"' + (groups[k].id === _form.groupId ? ' selected' : '') + '>' + _esc(groups[k].name) + '</option>';

    return '<div class="cctm-form" data-form="1">' +
      '<div class="cctm-form-head">' + (editing ? (_icon('pencil', 14) || '') + ' Edit tag' : (_icon('plus', 14) || '') + ' New tag') + '</div>' +
      '<input class="cctm-input" data-role="tname" placeholder="Tag name (e.g. Approved)" maxlength="40" value="' + _esc(name) + '">' +
      '<div class="cctm-field-l">Color</div><div class="cctm-sw-grid">' + sw + '</div>' +
      '<div class="cctm-field-l">Icon</div><div class="cctm-ico-grid">' + ico + '</div>' +
      '<div class="cctm-field-l">Group</div><select class="cctm-select" data-role="tgroup">' + grpOpts + '</select>' +
      '<div class="cctm-form-actions">' +
      '<button type="button" class="cctm-save" data-act="save-tag">' + (editing ? 'Save' : 'Create') + '</button>' +
      '<button type="button" class="cctm-cancel" data-act="cancel-tag">Cancel</button>' +
      (editing ? '<button type="button" class="cctm-lib" data-act="to-lib" title="Send to shared library">' + (_icon('package', 13) || '') + ' To Library</button>' +
        '<button type="button" class="cctm-del" data-act="del-tag">' + (_icon('trash-2', 13) || _icon('trash', 13) || '') + ' Delete</button>' : '') +
      '</div></div>';
  }

  // ── events ──
  function _onSideClick(e) {
    var btn = e.target.closest ? e.target.closest('.cctm-side-item') : null;
    if (!btn) return;
    _activeGroup = btn.getAttribute('data-g');
    _creating = false; _editTagId = null; _creatingGroup = false; _form.color = '';
    _renderSide(); _renderMain();
  }

  function _onMainInput(e) {
    var cc = e.target;
    if (cc.getAttribute && cc.getAttribute('data-role') === 'customcolor') {
      _form.color = cc.value;
      var grid = _mainEl.querySelector('.cctm-sw-grid');
      if (grid) { var sel = grid.querySelectorAll('.cctm-sw'); for (var i = 0; i < sel.length; i++) sel[i].classList.remove('sel'); }
    }
  }

  function _onMainClick(e) {
    var t = e.target;
    var el;

    // color swatch
    if ((el = t.closest && t.closest('.cctm-sw[data-color]'))) {
      _form.color = el.getAttribute('data-color');
      var sws = _mainEl.querySelectorAll('.cctm-sw'); for (var i = 0; i < sws.length; i++) sws[i].classList.remove('sel');
      el.classList.add('sel');
      var ci = _mainEl.querySelector('[data-role="customcolor"]'); if (ci) ci.value = _form.color;
      return;
    }
    // icon pick
    if ((el = t.closest && t.closest('.cctm-ico[data-icon]'))) {
      _form.icon = el.getAttribute('data-icon');
      var ics = _mainEl.querySelectorAll('.cctm-ico'); for (var j = 0; j < ics.length; j++) ics[j].classList.remove('sel');
      el.classList.add('sel');
      return;
    }
    // action buttons
    var act = (el = t.closest && t.closest('[data-act]')) ? el.getAttribute('data-act') : null;
    if (act) { _doAction(act); return; }
    // edit pencil
    if ((el = t.closest && t.closest('.cctm-chip-edit'))) {
      _editTagId = el.getAttribute('data-edit'); _creating = false; _form.color = ''; _renderMain(); return;
    }
    // chip body
    if ((el = t.closest && t.closest('.cctm-chip'))) {
      var id = el.getAttribute('data-chip'), isLib = el.getAttribute('data-lib') === '1';
      _chipActivate(id, isLib);
      return;
    }
  }

  function _chipActivate(tagId, isLib) {
    if (isLib) {                       // pull a library tag into the project
      CCTags.fromLibrary(tagId);
      _activeGroup = 'all';
      _renderSide(); _renderMain();
      return;
    }
    if (_isAssign()) {                 // assign mode → toggle across ALL targets (bulk-aware)
      var ts = _targets(), all = true;
      for (var i = 0; i < ts.length; i++) if (!CCTags.has(ts[i], tagId)) { all = false; break; }
      ts.forEach(function (t) { if (all) CCTags.unassign(t, tagId); else CCTags.assign(t, tagId); });
      if (_onChange) try { _onChange(); } catch (e) {}
      _renderMain();
    } else {                           // manage mode → edit
      _editTagId = tagId; _creating = false; _form.color = ''; _renderMain();
    }
  }

  function _doAction(act) {
    if (act === 'new-tag') { _creating = true; _editTagId = null; _creatingGroup = false; _form = { color: '', icon: 'tag', groupId: (_activeGroup !== 'all' && _activeGroup !== 'library') ? _activeGroup : null }; _renderMain(); return; }
    if (act === 'new-group') { _creatingGroup = true; _creating = false; _editTagId = null; _renderMain(); return; }
    if (act === 'cancel-tag') { _creating = false; _editTagId = null; _form.color = ''; _renderMain(); return; }
    if (act === 'cancel-group') { _creatingGroup = false; _renderMain(); return; }

    if (act === 'save-group') {
      var gn = _mainEl.querySelector('[data-role="gname"]');
      var grl = _mainEl.querySelector('[data-role="grule"]');
      var name = gn ? gn.value.trim() : '';
      if (name) { var g = CCTags.createGroup({ name: name, rule: grl ? grl.value : 'free' }); _creatingGroup = false; _activeGroup = g.id; _renderSide(); _renderMain(); }
      return;
    }

    if (act === 'save-tag') {
      var ni = _mainEl.querySelector('[data-role="tname"]');
      var gs = _mainEl.querySelector('[data-role="tgroup"]');
      var nm = ni ? ni.value.trim() : '';
      if (!nm) { if (ni) ni.focus(); return; }
      var groupId = gs && gs.value ? gs.value : null;
      if (_editTagId) {
        CCTags.update(_editTagId, { name: nm, color: _form.color, icon: _form.icon, groupId: groupId });
      } else {
        CCTags.create({ name: nm, color: _form.color, icon: _form.icon, groupId: groupId, scope: 'project' });
      }
      _creating = false; _editTagId = null; _form.color = '';
      _renderSide(); _renderMain();
      return;
    }

    if (act === 'del-tag' && _editTagId) {
      CCTags.remove(_editTagId);
      _editTagId = null; _form.color = '';
      if (_onChange) try { _onChange(); } catch (e) {}
      _renderSide(); _renderMain();
      return;
    }

    if (act === 'to-lib' && _editTagId) {
      CCTags.toLibrary(_editTagId);
      if (typeof showToast === 'function') showToast('Tag sent to library');
      return;
    }
  }

  // ── public ──
  function open(opts) {
    opts = opts || {};
    _build();
    _target = opts.target || null;
    _onChange = typeof opts.onChange === 'function' ? opts.onChange : null;
    _activeGroup = 'all'; _editTagId = null; _creating = false; _creatingGroup = false; _form = { color: '', icon: 'tag', groupId: null };
    _renderAll();
    _overlay.classList.add('show');
    _open = true;
    document.addEventListener('keydown', _onKey, true);
    if (!_unsub && global.cc && cc.on) _unsub = cc.on('tags:changed', function () { if (_open) { _renderSide(); _renderMain(); } });
  }
  function close() {
    if (_overlay) _overlay.classList.remove('show');
    document.removeEventListener('keydown', _onKey, true);
    _open = false; _target = null; _onChange = null;
  }
  function isOpen() { return _open; }

  global.CCTagModal = { open: open, close: close, isOpen: isOpen };

  if (global.cc && cc.modules) {
    cc.modules.register({ id: 'tag-modal', parent: 'shared', title: 'shared: tag-modal', mount: function () {}, unmount: function () {} });
  }
})(window);
