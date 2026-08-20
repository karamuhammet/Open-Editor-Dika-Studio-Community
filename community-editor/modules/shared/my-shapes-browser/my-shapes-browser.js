/* ============================================================
   dika studio — My Shapes: enterprise folder browser
   Folders + sub-folders, drill-in navigation, drag-drop,
   bulk select (shapes AND folders), search. Mirrors the image
   library pattern. Storage is shared with brush-tool.js
   (window._openMyShapesDB / store names), DB version 2.
   ============================================================ */
(function () {
  'use strict';

  var SHAPES  = window._MY_SHAPES_STORE || 'shapes';
  var FOLDERS = window._MY_SHAPES_FOLDER_STORE || 'shapeFolders';
  var MAX_DEPTH = 3;                  // root → sub → sub-sub  (depth indices 0,1,2)

  // ── in-memory caches (synchronous rendering) ──
  var _folders = [];                  // {id,name,icon,parentId,created,order}
  var _shapes  = [];                  // {id,name,thumb,folderId,created,...}
  var _cur = null;                    // current folder id (null = home/root)
  var _query = '';
  var _selMode = false;
  var _selShapes = {};                // id → true
  var _selFolders = {};               // id → true
  var _loaded = false;
  var _visible = false;

  function _db(cb) { if (typeof window._openMyShapesDB === 'function') window._openMyShapesDB(cb); }

  // ── load everything ──
  function _loadAll(cb) {
    _db(function (db) {
      var tx = db.transaction([SHAPES, FOLDERS], 'readonly');
      var s = [], f = [];
      tx.objectStore(SHAPES).openCursor().onsuccess = function (e) { var c = e.target.result; if (c) { s.push(c.value); c.continue(); } };
      tx.objectStore(FOLDERS).openCursor().onsuccess = function (e) { var c = e.target.result; if (c) { f.push(c.value); c.continue(); } };
      tx.oncomplete = function () { _shapes = s; _folders = f; _loaded = true; _updateEnterCount(); if (cb) cb(); };
      tx.onerror = function () { if (cb) cb(); };
    });
  }

  // ── folder-tree helpers ──
  function _byOrder(a, b) { return (a.order || 0) - (b.order || 0) || (a.created || 0) - (b.created || 0); }
  function _children(pid) { pid = pid || null; return _folders.filter(function (f) { return (f.parentId || null) === pid; }).sort(_byOrder); }
  function _folderById(id) { for (var i = 0; i < _folders.length; i++) if (_folders[i].id === id) return _folders[i]; return null; }
  function _depthOf(id) { var d = 0, f = _folderById(id); while (f && f.parentId) { d++; f = _folderById(f.parentId); if (d > 20) break; } return d; }
  function _descendants(id) { var out = [], stack = [id]; while (stack.length) { var p = stack.pop(); _folders.forEach(function (f) { if ((f.parentId || null) === p) { out.push(f.id); stack.push(f.id); } }); } return out; }
  function _subtreeHeight(id) { var h = 0; (function rec(p, d) { _children(p).forEach(function (c) { if (d + 1 > h) h = d + 1; rec(c.id, d + 1); }); })(id, 0); return h; }
  function _shapesIn(fid) { fid = fid || null; return _shapes.filter(function (s) { return (s.folderId || null) === fid; }).sort(function (a, b) { return b.created - a.created; }); }
  function _countShapesRec(fid) { var ids = [fid].concat(_descendants(fid)); var n = 0; _shapes.forEach(function (s) { if (ids.indexOf(s.folderId || null) !== -1) n++; }); return n; }
  function _crumbPath(id) { var p = [], f = _folderById(id); while (f) { p.unshift(f); f = f.parentId ? _folderById(f.parentId) : null; } return p; }
  function _canHaveChild(id) { return id == null ? true : _depthOf(id) < (MAX_DEPTH - 1); }

  // ── persistence ──
  function _putFolder(folder, cb) { _db(function (db) { var tx = db.transaction(FOLDERS, 'readwrite'); tx.objectStore(FOLDERS).put(folder); tx.oncomplete = function () { if (cb) cb(); }; }); }
  function _delFolders(ids, cb) { _db(function (db) { var tx = db.transaction(FOLDERS, 'readwrite'); ids.forEach(function (id) { tx.objectStore(FOLDERS).delete(id); }); tx.oncomplete = function () { if (cb) cb(); }; }); }
  function _putShape(entry, cb) { _db(function (db) { var tx = db.transaction(SHAPES, 'readwrite'); tx.objectStore(SHAPES).put(entry); tx.oncomplete = function () { if (cb) cb(); }; }); }
  function _putShapes(entries, cb) { _db(function (db) { var tx = db.transaction(SHAPES, 'readwrite'); entries.forEach(function (e) { tx.objectStore(SHAPES).put(e); }); tx.oncomplete = function () { if (cb) cb(); }; }); }
  function _delShapes(ids, cb) { _db(function (db) { var tx = db.transaction(SHAPES, 'readwrite'); ids.forEach(function (id) { tx.objectStore(SHAPES).delete(id); }); tx.oncomplete = function () { if (cb) cb(); }; }); }

  function _uid(p) { return (p || 'fld_') + Date.now().toString(36) + Math.random().toString(36).substr(2, 5); }
  function _toast(m) { if (typeof showToast === 'function') showToast(m); }
  function _updateEnterCount() {
    var el = document.getElementById('msb-enter-count'); if (!el) return;
    var n = _shapes.length, fn = _folders.length;
    el.textContent = n ? (n + ' shape' + (n === 1 ? '' : 's') + (fn ? ' · ' + fn + ' folder' + (fn === 1 ? '' : 's') : '')) : '';
  }

  // ── folder CRUD ──
  function addFolder(name, parentId, icon) {
    parentId = parentId || null;
    if (!_canHaveChild(parentId)) { _toast('Max folder depth reached'); return null; }
    var folder = { id: _uid(), name: (name || 'New folder').slice(0, 60), icon: icon || 'folder', parentId: parentId, created: Date.now(), order: _children(parentId).length };
    _folders.push(folder);
    _putFolder(folder, function () { _loadAll(render); });
    return folder;
  }
  function renameFolder(id, name) { var f = _folderById(id); if (!f || !name) return; f.name = name.slice(0, 60); _putFolder(f, function () { _loadAll(render); }); }
  function setFolderIcon(id, icon) { var f = _folderById(id); if (!f) return; f.icon = icon; _putFolder(f, function () { _loadAll(render); }); }

  // delete folder(s): child shapes (recursive) bubble up to the deleted folder's parent — nothing lost
  function deleteFolders(ids) {
    var delSet = {};
    ids.forEach(function (id) { delSet[id] = 1; _descendants(id).forEach(function (d) { delSet[d] = 1; }); });
    var allIds = Object.keys(delSet);
    // where should orphaned shapes go? nearest surviving ancestor of each deleted folder root
    var reassign = [];
    _shapes.forEach(function (s) {
      var fid = s.folderId || null;
      if (fid && delSet[fid]) {
        var anc = _folderById(fid);
        while (anc && delSet[anc.id]) anc = anc.parentId ? _folderById(anc.parentId) : null;
        var dest = anc ? anc.id : null;
        if ((s.folderId || null) !== dest) { s.folderId = dest; reassign.push(s); }
      }
    });
    function done() { _delFolders(allIds, function () { _loadAll(render); }); }
    if (reassign.length) _putShapes(reassign, done); else done();
  }
  function deleteFolder(id) { deleteFolders([id]); }

  function moveFolder(id, newParent) {
    newParent = newParent || null;
    if (id === newParent) return false;
    if (newParent && _descendants(id).indexOf(newParent) !== -1) { _toast("Can't move a folder into its own subfolder"); return false; }
    var newDepth = (newParent == null ? 0 : _depthOf(newParent) + 1);
    if (newDepth + _subtreeHeight(id) > MAX_DEPTH - 1) { _toast('That move would exceed the folder depth limit'); return false; }
    var f = _folderById(id); if (!f) return false;
    f.parentId = newParent; f.order = _children(newParent).length;
    _putFolder(f, function () { _loadAll(render); });
    return true;
  }

  function moveShape(shapeId, folderId) {
    folderId = folderId || null;
    var s = null; for (var i = 0; i < _shapes.length; i++) if (_shapes[i].id === shapeId) { s = _shapes[i]; break; }
    if (!s) return; s.folderId = folderId; _putShape(s, function () { _loadAll(render); });
  }
  function moveShapes(ids, folderId) {
    folderId = folderId || null;
    var batch = [];
    _shapes.forEach(function (s) { if (ids.indexOf(s.id) !== -1) { s.folderId = folderId; batch.push(s); } });
    if (batch.length) _putShapes(batch, function () { _loadAll(render); });
  }

  // ── selection ──
  function _selCount() { return Object.keys(_selShapes).length + Object.keys(_selFolders).length; }
  function _clearSel() { _selShapes = {}; _selFolders = {}; }
  function _setSelMode(on) { _selMode = on; if (!on) _clearSel(); render(); }

  // ── icons ──
  var _ICONS = {
    folder: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6l2 3h6a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2z"/>',
    star: '<polygon points="12 2 15 9 22 9.3 16.5 14 18.5 21 12 17 5.5 21 7.5 14 2 9.3 9 9"/>',
    heart: '<path d="M20.8 6a5 5 0 0 0-8.8-2 5 5 0 0 0-8.8 2c-1 2.4 0 4.7 2 6.8L12 21l6.8-8.2c2-2.1 3-4.4 2-6.8z"/>',
    shapes: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><circle cx="17" cy="7" r="4"/><path d="M7 14l5 7H2z"/>',
    tag: '<path d="M20 12l-8 8-9-9V4h7z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
    bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>'
  };
  function _iconSvg(name, size) { var p = _ICONS[name] || _ICONS.folder; size = size || 22; return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>'; }

  function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // ══════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════
  function _view() { return document.getElementById('items-myshapes-view'); }

  function _ensureChrome() {
    var v = _view(); if (!v) return null;
    if (v.querySelector('.msb-body')) return v;
    v.innerHTML =
      '<div class="msb-head">' +
        '<button class="msb-back" type="button" title="Back">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>' +
        '</button>' +
        '<div class="msb-crumb"></div>' +
      '</div>' +
      '<div class="msb-toolbar">' +
        '<div class="msb-search-wrap">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
          '<input type="text" class="msb-search" placeholder="Search shapes & folders">' +
        '</div>' +
        '<button class="msb-btn msb-newfolder" type="button" title="New folder">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6l2 3h6a2 2 0 0 1 2 2v3"/><line x1="12" y1="13" x2="12" y2="19"/><line x1="9" y1="16" x2="15" y2="16"/></svg>' +
        '</button>' +
        '<button class="msb-btn msb-select" type="button" title="Select">Select</button>' +
      '</div>' +
      '<div class="msb-bulkbar" hidden>' +
        '<span class="msb-bulk-count">0 selected</span>' +
        '<span style="flex:1"></span>' +
        '<button class="msb-bulk-move msb-btn" type="button">Move</button>' +
        '<button class="msb-bulk-del msb-btn danger" type="button">Delete</button>' +
        '<button class="msb-bulk-cancel msb-btn" type="button">✕</button>' +
      '</div>' +
      '<div class="msb-body"></div>';

    v.querySelector('.msb-back').addEventListener('click', back);
    v.querySelector('.msb-newfolder').addEventListener('click', _promptNewFolder);
    v.querySelector('.msb-select').addEventListener('click', function () { _setSelMode(!_selMode); });
    var search = v.querySelector('.msb-search');
    search.addEventListener('input', function () { _query = (search.value || '').trim().toLowerCase(); _renderBody(); });
    v.querySelector('.msb-bulk-cancel').addEventListener('click', function () { _setSelMode(false); });
    v.querySelector('.msb-bulk-del').addEventListener('click', _bulkDelete);
    v.querySelector('.msb-bulk-move').addEventListener('click', _bulkMove);
    _wireBodyDrop(v.querySelector('.msb-body'));
    _wireCrumbDrop(v.querySelector('.msb-crumb'), v.querySelector('.msb-back'));
    return v;
  }

  function _updateHeader() {
    var v = _view(); if (!v) return;
    var crumb = v.querySelector('.msb-crumb');
    var path = _cur ? _crumbPath(_cur) : [];
    var html = '<span class="msb-crumb-link" data-fid="">My Shapes</span>';
    path.forEach(function (f) { html += '<span class="msb-crumb-sep">/</span><span class="msb-crumb-link" data-fid="' + f.id + '">' + _esc(f.name) + '</span>'; });
    crumb.innerHTML = html;
    crumb.querySelectorAll('.msb-crumb-link').forEach(function (el) {
      el.addEventListener('click', function () { var id = el.getAttribute('data-fid'); _cur = id || null; _query = ''; var s = v.querySelector('.msb-search'); if (s) s.value = ''; render(); });
    });
    v.classList.toggle('msb-selecting', _selMode);
    v.querySelector('.msb-select').classList.toggle('active', _selMode);
    v.querySelector('.msb-select').textContent = _selMode ? 'Done' : 'Select';
    var bar = v.querySelector('.msb-bulkbar');
    bar.hidden = !_selMode;
    if (_selMode) v.querySelector('.msb-bulk-count').textContent = _selCount() + ' selected';
  }

  function render() {
    var v = _ensureChrome(); if (!v) return;
    window._myShapesSaveTarget = _cur;     // new saves land in the open folder
    _updateHeader();
    _renderBody();
  }

  function _matchQuery(name) { return !_query || String(name || '').toLowerCase().indexOf(_query) !== -1; }

  function _renderBody() {
    var v = _view(); if (!v) return;
    var body = v.querySelector('.msb-body'); if (!body) return;
    body.innerHTML = '';

    var folders, shapes;
    if (_query) {
      folders = _folders.filter(function (f) { return _matchQuery(f.name); }).sort(_byOrder);
      shapes = _shapes.filter(function (s) { return _matchQuery(s.name); }).sort(function (a, b) { return b.created - a.created; });
    } else {
      folders = _children(_cur);
      shapes = _shapesIn(_cur);
    }

    if (!folders.length && !shapes.length) {
      body.innerHTML = '<div class="msb-empty">' + (_query ? 'No matches.' : (_cur ? 'This folder is empty.<br>Drag shapes here or save a new one.' : 'No shapes or folders yet.<br>Save a shape, then organise it into folders.')) + '</div>';
      return;
    }

    if (folders.length) {
      var fsec = document.createElement('div'); fsec.className = 'msb-grid msb-folder-grid';
      folders.forEach(function (f) { fsec.appendChild(_folderCard(f)); });
      body.appendChild(fsec);
    }
    if (shapes.length) {
      var ssec = document.createElement('div'); ssec.className = 'msb-grid msb-shape-grid';
      shapes.forEach(function (s) { ssec.appendChild(_shapeCard(s)); });
      body.appendChild(ssec);
    }
  }

  // ── folder card ──
  function _folderCard(f) {
    var card = document.createElement('div');
    card.className = 'msb-folder' + (_selFolders[f.id] ? ' msb-selected' : '');
    card.setAttribute('draggable', _selMode ? 'false' : 'true');
    card.dataset.fid = f.id;
    var count = _countShapesRec(f.id), subs = _children(f.id).length;
    var meta = (subs ? subs + ' folder' + (subs > 1 ? 's' : '') + ' · ' : '') + count + ' shape' + (count === 1 ? '' : 's');
    card.innerHTML =
      '<div class="msb-cb"></div>' +
      '<div class="msb-folder-ico">' + _iconSvg(f.icon, 22) + '</div>' +
      '<div class="msb-folder-meta"><div class="msb-folder-name">' + _esc(f.name) + '</div><div class="msb-folder-sub">' + meta + '</div></div>' +
      '<button class="msb-folder-more" type="button" title="Folder options">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>' +
      '</button>';
    card.addEventListener('click', function (e) {
      if (e.target.closest('.msb-folder-more')) return;
      if (_selMode) { if (_selFolders[f.id]) delete _selFolders[f.id]; else _selFolders[f.id] = true; render(); return; }
      _cur = f.id; _query = ''; var s = _view().querySelector('.msb-search'); if (s) s.value = ''; render();
    });
    card.querySelector('.msb-folder-more').addEventListener('click', function (e) { e.stopPropagation(); _folderMenu(f, e.currentTarget); });
    _wireFolderDrag(card, f);
    return card;
  }

  // ── shape card ──
  function _shapeCard(s) {
    var card = document.createElement('div');
    card.className = 'msb-shape' + (_selShapes[s.id] ? ' msb-selected' : '');
    card.setAttribute('draggable', _selMode ? 'false' : 'true');
    card.dataset.sid = s.id;
    card.title = s.name;
    card.innerHTML =
      '<div class="msb-cb"></div>' +
      '<img class="msb-shape-thumb" src="' + (s.thumb || '') + '" alt="' + _esc(s.name) + '">' +
      '<div class="msb-shape-name">' + _esc(s.name) + '</div>' +
      '<div class="msb-shape-actions">' +
        '<button class="msb-sa" data-act="rename" title="Rename"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' +
        '<button class="msb-sa danger" data-act="delete" title="Delete"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
      '</div>';
    card.addEventListener('click', function (e) {
      var act = e.target.closest('.msb-sa');
      if (act) { e.stopPropagation(); if (act.getAttribute('data-act') === 'rename') { if (window.renameMyShape) window.renameMyShape(s.id); } else { if (window.deleteMyShape) window.deleteMyShape(s.id); } return; }
      if (_selMode) { if (_selShapes[s.id]) delete _selShapes[s.id]; else _selShapes[s.id] = true; render(); return; }
      if (window.insertMyShape) window.insertMyShape(s.id);
    });
    _wireShapeDrag(card, s);
    return card;
  }

  // ── drag & drop ──
  var _drag = null;   // {kind:'shape'|'folder', id} — dragover can't read dataTransfer, so mirror it here
  function _shapeById(id) { for (var i = 0; i < _shapes.length; i++) if (_shapes[i].id === id) return _shapes[i]; return null; }
  function _readPayload(e) { try { var d = JSON.parse(e.dataTransfer.getData('text/plain')); if (d && d.msb) return d; } catch (x) {} return _drag; }
  function _wireShapeDrag(card, s) {
    card.addEventListener('dragstart', function (e) {
      if (_selMode) { e.preventDefault(); return; }
      _drag = { kind: 'shape', id: s.id }; e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', JSON.stringify({ msb: 1, kind: 'shape', id: s.id })); } catch (x) {}
      card.classList.add('msb-dragging');
    });
    card.addEventListener('dragend', function () { card.classList.remove('msb-dragging'); _drag = null; });
  }
  function _wireFolderDrag(card, f) {
    card.addEventListener('dragstart', function (e) {
      if (_selMode) { e.preventDefault(); return; }
      e.stopPropagation(); _drag = { kind: 'folder', id: f.id }; e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', JSON.stringify({ msb: 1, kind: 'folder', id: f.id })); } catch (x) {}
      card.classList.add('msb-dragging');
    });
    card.addEventListener('dragend', function () { card.classList.remove('msb-dragging'); _drag = null; });
    function valid(p) {
      if (!p) return false;
      if (p.kind === 'shape') { var s = _shapeById(p.id); return !s || (s.folderId || null) !== f.id; }
      if (p.kind === 'folder') {
        if (p.id === f.id) return false;
        if (_descendants(p.id).indexOf(f.id) !== -1) return false;
        if ((_folderById(p.id) || {}).parentId === f.id) return false;
        return (_depthOf(f.id) + 1 + _subtreeHeight(p.id)) <= (MAX_DEPTH - 1);
      }
      return false;
    }
    card.addEventListener('dragover', function (e) { if (valid(_readPayload(e))) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; card.classList.add('msb-dragover'); } });
    card.addEventListener('dragleave', function () { card.classList.remove('msb-dragover'); });
    card.addEventListener('drop', function (e) {
      e.preventDefault(); e.stopPropagation(); card.classList.remove('msb-dragover');
      var p = _readPayload(e); if (!valid(p)) return;
      if (p.kind === 'shape') moveShape(p.id, f.id); else moveFolder(p.id, f.id);
    });
  }
  function _wireBodyDrop(body) {
    body.addEventListener('dragover', function (e) { if (_drag && !e.target.closest('.msb-folder')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } });
    body.addEventListener('drop', function (e) {
      if (e.target.closest('.msb-folder')) return;       // folder handles its own drop
      var p = _readPayload(e); if (!p) return; e.preventDefault();
      if (p.kind === 'shape') { var s = _shapeById(p.id); if (s && (s.folderId || null) !== (_cur || null)) moveShape(p.id, _cur); }
      else if (p.kind === 'folder' && p.id !== _cur && (_folderById(p.id) || {}).parentId !== (_cur || null)) moveFolder(p.id, _cur);
    });
  }
  function _wireCrumbDrop(crumb, back) {
    function over(e) { if (_drag) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; e.currentTarget.classList.add('msb-dragover'); } }
    function leave(e) { e.currentTarget.classList.remove('msb-dragover'); }
    function dropUp(e) {
      e.preventDefault(); e.currentTarget.classList.remove('msb-dragover');
      var p = _readPayload(e); if (!p) return;
      var dest = _cur ? ((_folderById(_cur) || {}).parentId || null) : null;   // move up one level
      if (p.kind === 'shape') moveShape(p.id, dest); else moveFolder(p.id, dest);
    }
    [crumb, back].forEach(function (el) { if (!el) return; el.addEventListener('dragover', over); el.addEventListener('dragleave', leave); el.addEventListener('drop', dropUp); });
  }

  // ── folder context menu ──
  function _folderMenu(f, anchor) {
    _closeMenu();
    var m = document.createElement('div'); m.className = 'msb-menu'; m.id = 'msb-folder-menu';
    var items = [
      { k: 'rename', t: 'Rename' },
      { k: 'icon', t: 'Change icon' },
      { k: 'sub', t: 'New subfolder', dis: !_canHaveChild(f.id) },
      { k: 'del', t: 'Delete', danger: true }
    ];
    items.forEach(function (it) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'msb-menu-item' + (it.danger ? ' danger' : '') + (it.dis ? ' disabled' : '');
      b.textContent = it.t;
      if (!it.dis) b.addEventListener('click', function () { _closeMenu(); _folderAction(it.k, f); });
      m.appendChild(b);
    });
    document.body.appendChild(m);
    var r = anchor.getBoundingClientRect();
    m.style.left = Math.min(r.left, window.innerWidth - m.offsetWidth - 8) + 'px';
    m.style.top = (r.bottom + 4) + 'px';
    if (r.bottom + m.offsetHeight > window.innerHeight - 8) m.style.top = Math.max(8, r.top - m.offsetHeight - 4) + 'px';
    setTimeout(function () { document.addEventListener('click', _closeMenu, { once: true }); }, 0);
  }
  function _closeMenu() { var m = document.getElementById('msb-folder-menu'); if (m) m.remove(); var ip = document.getElementById('msb-icon-pop'); if (ip) ip.remove(); }
  function _folderAction(k, f) {
    if (k === 'rename') { var n = prompt('Rename folder:', f.name); if (n && n.trim()) renameFolder(f.id, n.trim()); }
    else if (k === 'del') { if (typeof showCustomConfirm === 'function') showCustomConfirm('Delete "' + f.name + '" and its subfolders? Shapes inside move up a level.', function () { deleteFolder(f.id); }); else if (confirm('Delete folder "' + f.name + '"?')) deleteFolder(f.id); }
    else if (k === 'sub') { var sn = prompt('New subfolder name:', 'New folder'); if (sn && sn.trim()) addFolder(sn.trim(), f.id); }
    else if (k === 'icon') { _iconPicker(f); }
  }
  function _iconPicker(f) {
    _closeMenu();
    var pop = document.createElement('div'); pop.className = 'msb-menu msb-icon-pop'; pop.id = 'msb-icon-pop';
    Object.keys(_ICONS).forEach(function (name) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'msb-icon-opt' + (f.icon === name ? ' active' : '');
      b.innerHTML = _iconSvg(name, 20); b.title = name;
      b.addEventListener('click', function () { _closeMenu(); setFolderIcon(f.id, name); });
      pop.appendChild(b);
    });
    document.body.appendChild(pop);
    var card = _view().querySelector('.msb-folder[data-fid="' + f.id + '"]');
    var r = (card || _view()).getBoundingClientRect();
    pop.style.left = Math.min(r.left + 10, window.innerWidth - pop.offsetWidth - 8) + 'px';
    pop.style.top = Math.min(r.bottom + 4, window.innerHeight - pop.offsetHeight - 8) + 'px';
    setTimeout(function () { document.addEventListener('click', _closeMenu, { once: true }); }, 0);
  }

  function _promptNewFolder() {
    var n = prompt(_cur ? 'New subfolder name:' : 'New folder name:', 'New folder');
    if (n && n.trim()) addFolder(n.trim(), _cur);
  }

  // ── bulk ops (shapes AND folders) ──
  function _bulkDelete() {
    var sIds = Object.keys(_selShapes), fIds = Object.keys(_selFolders);
    if (!sIds.length && !fIds.length) return;
    var n = _selCount();
    var msg = 'Delete ' + n + ' item' + (n > 1 ? 's' : '') + '?' + (fIds.length ? ' Shapes inside deleted folders move up a level (unless also selected).' : '');
    var go = function () {
      var delSet = {}; fIds.forEach(function (id) { delSet[id] = 1; _descendants(id).forEach(function (d) { delSet[d] = 1; }); });
      var folderIds = Object.keys(delSet);
      var reassign = [];
      _shapes.forEach(function (s) {
        if (sIds.indexOf(s.id) !== -1) return;
        var fid = s.folderId || null;
        if (fid && delSet[fid]) { var anc = _folderById(fid); while (anc && delSet[anc.id]) anc = anc.parentId ? _folderById(anc.parentId) : null; var dest = anc ? anc.id : null; if ((s.folderId || null) !== dest) { s.folderId = dest; reassign.push(s); } }
      });
      _db(function (db) {
        var tx = db.transaction([SHAPES, FOLDERS], 'readwrite'); var ss = tx.objectStore(SHAPES), fs = tx.objectStore(FOLDERS);
        reassign.forEach(function (s) { ss.put(s); });
        sIds.forEach(function (id) { ss.delete(id); });
        folderIds.forEach(function (id) { fs.delete(id); });
        tx.oncomplete = function () { _selMode = false; _clearSel(); _loadAll(render); _toast('Deleted ' + n + ' item' + (n > 1 ? 's' : '')); };
      });
    };
    if (typeof showCustomConfirm === 'function') showCustomConfirm(msg, go); else if (confirm(msg)) go();
  }

  function _bulkMove() {
    if (!_selCount()) return;
    _folderPicker(function (dest) {
      var sIds = Object.keys(_selShapes), fIds = Object.keys(_selFolders);
      var moveF = [];
      fIds.forEach(function (id) {
        if (id === dest) return;
        if (dest && _descendants(id).indexOf(dest) !== -1) return;
        if (((dest == null ? 0 : _depthOf(dest) + 1) + _subtreeHeight(id)) > MAX_DEPTH - 1) return;
        var f = _folderById(id); if (f) { f.parentId = dest; moveF.push(f); }
      });
      var moveS = [];
      _shapes.forEach(function (s) { if (sIds.indexOf(s.id) !== -1) { s.folderId = dest; moveS.push(s); } });
      var total = moveS.length + moveF.length;
      if (!total) { _toast('Nothing could move there'); return; }
      _db(function (db) {
        var tx = db.transaction([SHAPES, FOLDERS], 'readwrite'); var ss = tx.objectStore(SHAPES), fs = tx.objectStore(FOLDERS);
        moveS.forEach(function (s) { ss.put(s); }); moveF.forEach(function (f) { fs.put(f); });
        tx.oncomplete = function () { _selMode = false; _clearSel(); _loadAll(render); _toast('Moved ' + total + ' item' + (total > 1 ? 's' : '')); };
      });
    });
  }

  function _folderPicker(onPick) {
    _closeMenu();
    var m = document.createElement('div'); m.className = 'msb-menu msb-picker'; m.id = 'msb-folder-menu';
    var head = document.createElement('div'); head.className = 'msb-picker-head'; head.textContent = 'Move to'; m.appendChild(head);
    function row(label, id, depth) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'msb-menu-item'; b.style.paddingLeft = (11 + depth * 14) + 'px';
      b.textContent = (depth ? '↳ ' : '') + label;
      b.addEventListener('click', function () { _closeMenu(); onPick(id); });
      m.appendChild(b);
    }
    row('My Shapes (root)', null, 0);
    (function walk(pid, depth) { _children(pid).forEach(function (f) { row(f.name, f.id, depth + 1); walk(f.id, depth + 1); }); })(null, 0);
    document.body.appendChild(m);
    m.style.maxHeight = '60vh'; m.style.overflowY = 'auto';
    m.style.left = Math.max(8, (window.innerWidth - m.offsetWidth) / 2) + 'px';
    m.style.top = Math.max(8, (window.innerHeight - m.offsetHeight) / 2) + 'px';
    setTimeout(function () { document.addEventListener('click', _closeMenu, { once: true }); }, 0);
  }

  // ══════════════════════════════════════════════════════════════
  //  NAVIGATION
  // ══════════════════════════════════════════════════════════════
  function open() {
    var v = _view(); if (!v) return;
    // hide every sibling in the Items "shape" section, show ours
    var section = v.parentElement;
    if (section) { for (var i = 0; i < section.children.length; i++) section.children[i].style.display = 'none'; }
    v.style.display = '';
    var header = document.getElementById('flyout-header-title') || document.getElementById('flyout-title');
    if (header) header.textContent = 'My Shapes';
    _visible = true; _cur = null; _query = ''; _selMode = false; _clearSel();
    _loadAll(render);            // always show current data on open (cache may be stale)
  }
  function back() {
    if (_cur) { var f = _folderById(_cur); _cur = (f && f.parentId) ? f.parentId : null; _query = ''; var s = _view().querySelector('.msb-search'); if (s) s.value = ''; render(); return; }
    // at home → return to the shapes presets view
    _visible = false; window._myShapesSaveTarget = null;
    var v = _view(); if (v) v.style.display = 'none';
    var sv = document.getElementById('items-shapes-view'); if (sv) sv.style.display = '';
    var header = document.getElementById('flyout-header-title') || document.getElementById('flyout-title');
    if (header) header.textContent = 'Shapes';
  }
  function isOpen() { return _visible && _view() && _view().style.display !== 'none'; }
  function refresh() { _loadAll(function () { if (isOpen()) render(); }); }

  window.MyShapesBrowser = {
    open: open, back: back, refresh: refresh, isOpen: isOpen,
    addFolder: addFolder, renameFolder: renameFolder, deleteFolder: deleteFolder,
    moveFolder: moveFolder, moveShape: moveShape,
    _state: function () { return { folders: _folders.slice(), shapes: _shapes.slice(), cur: _cur, selMode: _selMode, selCount: _selCount() }; }
  };

  // preload so counts are ready the first time the panel opens
  // Faz 8: shared module loads after DOMContentLoaded → preload on sticky cc:canvas-ready.
  if (window.cc && cc.on) cc.on('cc:canvas-ready', function () { setTimeout(function () { cc.safe('shared.my-shapes-browser', _loadAll); }, 600); });
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(function () { _loadAll(); }, 600); });
  else setTimeout(function () { _loadAll(); }, 600);
})();

// Modular skeleton hook (Faz 8) — my-shapes-browser is now a loader module (modules/shared/).
if (window.cc && cc.modules) cc.modules.register({ id: 'my-shapes-browser', parent: 'shared', title: 'My shapes browser', mount: function () {}, unmount: function () {} });
