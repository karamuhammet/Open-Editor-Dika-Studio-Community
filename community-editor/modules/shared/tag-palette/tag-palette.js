/* Module: shared/tag-palette — CCTagPalette (N8 + N6). A Ctrl+K command palette to jump to any tag or work
   in the project, and tag-scoped navigation (Alt+→/Alt+← cycle through the works carrying a tag). Pure UI
   over CCTags + CCWorks. Shortcuts via KeyboardManager.registerCommand (same pattern as the scene toolbar). */
(function (global) {
  'use strict';

  var _overlay = null, _box = null, _inputEl = null, _listEl = null, _built = false, _open = false;
  var _navTag = null, _navList = [], _navIndex = 0;

  function _icon(names, size) { if (typeof getIcon !== 'function') return ''; for (var i = 0; i < names.length; i++) { var s = getIcon(names[i], size || 16); if (s) return s; } return ''; }
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function _typing() { var a = document.activeElement; return !!(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)); }
  function _worksWithTag(tagId) { return global.CCWorks ? CCWorks.all().filter(function (w) { for (var i = 0; i < w.tags.length; i++) if (w.tags[i].id === tagId) return true; return false; }) : []; }

  function _build() {
    if (_built) return;
    _overlay = document.createElement('div'); _overlay.className = 'ccpal-overlay';
    _overlay.addEventListener('mousedown', function (e) { if (e.target === _overlay) close(); });
    _box = document.createElement('div'); _box.className = 'ccpal';
    _box.innerHTML = '<div class="ccpal-in">' + (_icon(['search'], 16) || '') + '<input type="text" class="ccpal-input" placeholder="Search tag or work… (Press Enter)"></div><div class="ccpal-list"></div>';
    _overlay.appendChild(_box); document.body.appendChild(_overlay);
    _inputEl = _box.querySelector('.ccpal-input'); _listEl = _box.querySelector('.ccpal-list');
    _inputEl.addEventListener('input', function () { _render(_inputEl.value); });
    _inputEl.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); close(); } else if (e.key === 'Enter') { var first = _listEl.querySelector('.ccpal-item'); if (first) first.click(); } });
    _listEl.addEventListener('click', _onItemClick);
    _built = true;
  }

  function _render(q) {
    q = (q || '').toLowerCase().trim();
    var html = '';
    var tags = (global.CCTags ? CCTags.list({ scope: 'project' }) : []).filter(function (t) { return !q || String(t.name).toLowerCase().indexOf(q) >= 0; });
    if (tags.length) {
      html += '<div class="ccpal-h">Tags</div>';
      tags.slice(0, 8).forEach(function (t) {
        html += '<button type="button" class="ccpal-item" data-tag="' + _esc(t.id) + '"><span class="ccpal-dot" style="background:' + _esc(t.color) + '"></span><span class="ccpal-nm">' + _esc(t.name) + '</span><span class="ccpal-cnt">' + _worksWithTag(t.id).length + ' work →</span></button>';
      });
    }
    var works = (global.CCWorks ? CCWorks.all() : []).filter(function (w) { return !q || String(w.label).toLowerCase().indexOf(q) >= 0; });
    if (works.length) {
      html += '<div class="ccpal-h">Works</div>';
      works.slice(0, 8).forEach(function (w) {
        var ico = w.type === 'frame' ? 'frame' : w.type === 'slide' ? 'presentation' : 'photo';
        html += '<button type="button" class="ccpal-item" data-work="' + w.type + ':' + _esc(w.id) + '"><span class="ccpal-ico">' + (_icon([ico], 15) || '') + '</span><span class="ccpal-nm">' + _esc(w.label) + '</span><span class="ccpal-cnt">' + _esc(w.platform) + '</span></button>';
      });
    }
    _listEl.innerHTML = html || '<div class="ccpal-empty">No results</div>';
  }

  function _onItemClick(e) {
    var el = e.target.closest ? e.target.closest('[data-tag],[data-work]') : null; if (!el) return;
    if (el.hasAttribute('data-tag')) { navTo(el.getAttribute('data-tag')); close(); return; }
    var wk = el.getAttribute('data-work'), i = wk.indexOf(':');
    if (global.CCWorks) CCWorks.open({ type: wk.slice(0, i), id: wk.slice(i + 1) });
    close();
  }

  // N6: focus a tag → jump to its first work; Alt+→ / Alt+← cycle through the rest.
  function navTo(tagId) {
    _navTag = tagId; _navList = _worksWithTag(tagId); _navIndex = 0;
    if (_navList.length && global.CCWorks) CCWorks.open(_navList[0]);
    return _navList.length;
  }
  function navStep(dir) {
    if (!_navList.length) return false;
    _navIndex = (_navIndex + dir + _navList.length) % _navList.length;
    if (global.CCWorks) CCWorks.open(_navList[_navIndex]);
    return true;
  }

  function _onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }
  function open() { _build(); _inputEl.value = ''; _render(''); _overlay.classList.add('show'); _open = true; setTimeout(function () { try { _inputEl.focus(); } catch (e) {} }, 0); document.addEventListener('keydown', _onKey, true); }
  function close() { if (_overlay) _overlay.classList.remove('show'); _open = false; document.removeEventListener('keydown', _onKey, true); }
  function isOpen() { return _open; }
  function navCount() { return _navList.length; }

  global.CCTagPalette = { open: open, close: close, isOpen: isOpen, navTo: navTo, navStep: navStep, navCount: navCount };

  function _registerShortcuts() {
    var KM = global.KeyboardManager;
    if (!KM || typeof KM.registerCommand !== 'function' || _registerShortcuts._done) return;
    _registerShortcuts._done = true;
    // Ctrl+K is the app's existing general command bar (open-command-bar) — use Ctrl+Shift+P for the tag/work palette.
    KM.registerCommand({ id: 'tag-palette', label: 'Tag/work palette', description: 'Jump to tag or work (Ctrl+Shift+P)', category: 'Tags', contexts: ['global'], defaultShortcut: 'Ctrl+Shift+P', priority: 20, whenCondition: function () { return _open || !_typing(); }, fn: function () { if (_open) close(); else open(); return true; } });
    KM.registerCommand({ id: 'tag-nav-next', label: 'Next work in tag', category: 'Tags', contexts: ['global'], defaultShortcut: 'Alt+ArrowRight', priority: 20, whenCondition: function () { return _navList.length > 0 && !_typing(); }, fn: function () { return navStep(1); } });
    KM.registerCommand({ id: 'tag-nav-prev', label: 'Previous work in tag', category: 'Tags', contexts: ['global'], defaultShortcut: 'Alt+ArrowLeft', priority: 20, whenCondition: function () { return _navList.length > 0 && !_typing(); }, fn: function () { return navStep(-1); } });
  }
  // shared/* loads BEFORE system/keyboard-manager, so KM isn't ready at load. Retry until it is (and on the
  // modules-ready event), mirroring how the scene toolbar registers lazily once KM exists.
  function _tryRegister(n) {
    if (_registerShortcuts._done) return;
    _registerShortcuts();
    if (!_registerShortcuts._done && (n || 0) < 25) setTimeout(function () { _tryRegister((n || 0) + 1); }, 250);
  }
  if (global.cc && cc.on) cc.on('modules:ready', function () { _registerShortcuts(); });   // loader emits 'modules:ready' (was 'cc:modules-ready', never fired → backup registration dead on slow loads)
  _tryRegister(0);

  if (global.cc && cc.modules) cc.modules.register({ id: 'tag-palette', parent: 'shared', title: 'shared: tag-palette', mount: function () {}, unmount: function () {} });
})(window);
