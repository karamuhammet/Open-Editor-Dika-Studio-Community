(function () {
  'use strict';

  var RECENT_KEY = 'dika_cmd_recent';
  var MAX_RECENT = 8;

  var overlay = null;
  var input = null;
  var resultsHost = null;
  var trigger = null;
  var flatItems = [];
  var activeIndex = 0;
  var isOpen = false;

  function _safeIcon(name, size) {
    if (typeof getIcon === 'function') return getIcon(name, size || 16);
    if (typeof ICONS !== 'undefined' && ICONS[name]) return ICONS[name];
    return '';
  }

  function _getRecentIds() {
    try {
      var raw = localStorage.getItem(RECENT_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function _saveRecentId(id) {
    if (!id) return;
    var ids = _getRecentIds().filter(function (item) { return item !== id; });
    ids.unshift(id);
    ids = ids.slice(0, MAX_RECENT);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(ids)); } catch (e) {}
  }

  function _commandAllowed(cmd) {
    if (!cmd || typeof cmd.fn !== 'function') return false;
    if (cmd.id === 'open-command-bar') return false;
    var contexts = cmd.contexts || ['global'];
    var ctx = (window.KeyboardManager && KeyboardManager.getContext) ? KeyboardManager.getContext() : 'global';
    var allowed = contexts.indexOf('global') >= 0 || contexts.indexOf(ctx) >= 0;
    if (!allowed) return false;
    if (cmd.whenCondition && typeof cmd.whenCondition === 'function') {
      try { if (!cmd.whenCondition()) return false; } catch (e) { return false; }
    }
    return true;
  }

  function _scoreCommand(cmd, query) {
    var q = (query || '').toLowerCase();
    if (!q) return 1;
    var label = String(cmd.label || '').toLowerCase();
    var desc = String(cmd.description || '').toLowerCase();
    var cat = String(cmd.category || '').toLowerCase();
    var shortcut = '';
    if (window.KeyboardManager && KeyboardManager.getEffectiveShortcut) {
      shortcut = String(KeyboardManager.getEffectiveShortcut(cmd.id) || '').toLowerCase();
    }
    var score = 0;
    if (label === q) score += 160;
    if (label.indexOf(q) === 0) score += 120;
    else if (label.indexOf(q) >= 0) score += 80;
    if (desc.indexOf(q) >= 0) score += 35;
    if (cat.indexOf(q) >= 0) score += 20;
    if (shortcut.indexOf(q) >= 0) score += 25;
    return score;
  }

  function _collectCommandSections(query) {
    var list = (window.KeyboardManager && KeyboardManager.getAllCommands) ? KeyboardManager.getAllCommands() : [];
    list = list.filter(_commandAllowed);

    if (!query) {
      var byId = {};
      list.forEach(function (cmd) { byId[cmd.id] = cmd; });
      var recent = _getRecentIds()
        .map(function (id) { return byId[id] || null; })
        .filter(Boolean)
        .slice(0, 5);
      var suggestedIds = ['download', 'flyout-templates', 'flyout-images', 'add-page', 'toggle-layers', 'show-shortcuts'];
      var suggested = suggestedIds
        .map(function (id) { return byId[id] || null; })
        .filter(Boolean)
        .filter(function (cmd) { return recent.indexOf(cmd) < 0; })
        .slice(0, 6);
      var sections = [];
      if (recent.length) sections.push({ title: 'Recent', items: recent });
      sections.push({ title: recent.length ? 'Suggested' : 'Quick Actions', items: suggested.length ? suggested : list.slice(0, 8) });
      return sections;
    }

    var scored = list
      .map(function (cmd) { return { cmd: cmd, score: _scoreCommand(cmd, query) }; })
      .filter(function (entry) { return entry.score > 0; })
      .sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return String(a.cmd.label || '').localeCompare(String(b.cmd.label || ''));
      })
      .slice(0, 28);

    var buckets = {};
    var order = [];
    scored.forEach(function (entry) {
      var cat = entry.cmd.category || 'Commands';
      if (!buckets[cat]) {
        buckets[cat] = [];
        order.push(cat);
      }
      buckets[cat].push(entry.cmd);
    });

    return order.map(function (title) {
      return { title: title, items: buckets[title] };
    });
  }

  function _renderResults() {
    if (!resultsHost) return;
    var query = input ? input.value.trim() : '';
    var sections = _collectCommandSections(query);
    flatItems = [];

    var html = '';
    sections.forEach(function (section) {
      if (!section.items || !section.items.length) return;
      html += '<div class="cmdk-group">';
      html += '<div class="cmdk-group-title">' + _escape(section.title) + '</div>';
      section.items.forEach(function (cmd) {
        var shortcut = (window.KeyboardManager && KeyboardManager.getEffectiveShortcut) ? KeyboardManager.getEffectiveShortcut(cmd.id) : null;
        var shortcutLabel = (window.KeyboardManager && KeyboardManager.shortcutToLabel) ? KeyboardManager.shortcutToLabel(shortcut) : shortcut;
        var itemIndex = flatItems.length;
        flatItems.push(cmd);
        html += '<button type="button" class="cmdk-item' + (itemIndex === activeIndex ? ' active' : '') + '" data-cmdk-index="' + itemIndex + '">';
        html +=   '<div class="cmdk-item-main">';
        html +=     '<div class="cmdk-item-title">' + _escape(cmd.label || '') + '</div>';
        html +=     '<div class="cmdk-item-desc">' + _escape(cmd.description || cmd.category || '') + '</div>';
        html +=   '</div>';
        html +=   '<div class="cmdk-item-meta">';
        html +=     '<span class="cmdk-item-cat">' + _escape(cmd.category || 'Command') + '</span>';
        if (shortcutLabel && shortcutLabel !== '—') {
          html += '<span class="cmdk-item-kbd">' + _escape(shortcutLabel) + '</span>';
        }
        html +=   '</div>';
        html += '</button>';
      });
      html += '</div>';
    });

    if (!flatItems.length) {
      html = '<div class="cmdk-empty"><div class="cmdk-empty-title">No matching actions</div><div class="cmdk-empty-text">Try searching tools, pages, panels, or export actions.</div></div>';
      activeIndex = 0;
    } else if (activeIndex >= flatItems.length) {
      activeIndex = 0;
      return _renderResults();
    }

    resultsHost.innerHTML = html;
    _syncActiveItem();
  }

  function _syncActiveItem() {
    if (!resultsHost) return;
    var items = resultsHost.querySelectorAll('.cmdk-item');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('active', i === activeIndex);
    }
    var active = items[activeIndex];
    if (active && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({ block: 'nearest' });
    }
  }

  function _escape(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _performCommand(cmd) {
    if (!cmd) return;
    closeCommandBar();
    _saveRecentId(cmd.id);
    if (window.KeyboardManager && KeyboardManager.executeCommand) {
      KeyboardManager.executeCommand(cmd.id);
      return;
    }
    if (typeof cmd.fn === 'function') cmd.fn();
  }

  function openCommandBar(prefill) {
    _ensureDom();
    isOpen = true;
    overlay.classList.add('show');
    document.body.classList.add('cmdk-open');
    if (trigger) trigger.classList.add('active');
    activeIndex = 0;
    input.value = prefill || '';
    _renderResults();
    window.setTimeout(function () {
      try { input.focus(); input.select(); } catch (e) {}
    }, 10);
  }

  function closeCommandBar() {
    if (!overlay) return;
    isOpen = false;
    overlay.classList.remove('show');
    document.body.classList.remove('cmdk-open');
    if (trigger) trigger.classList.remove('active');
  }

  function toggleCommandBar() {
    if (isOpen) closeCommandBar();
    else openCommandBar('');
  }

  function _handleKeydown(e) {
    var isTrigger = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && String(e.key || '').toLowerCase() === 'k';
    if (isTrigger) {
      e.preventDefault();
      e._kmHandled = true;
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      else e.stopPropagation();
      toggleCommandBar();
      return;
    }
    if (!isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e._kmHandled = true;
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      else e.stopPropagation();
      closeCommandBar();
      return;
    }
    if (!flatItems.length) return;
    if (e.key === 'ArrowDown' || ((e.ctrlKey || e.metaKey) && String(e.key || '').toLowerCase() === 'n')) {
      e.preventDefault();
      e._kmHandled = true;
      activeIndex = (activeIndex + 1) % flatItems.length;
      _syncActiveItem();
      return;
    }
    if (e.key === 'ArrowUp' || ((e.ctrlKey || e.metaKey) && String(e.key || '').toLowerCase() === 'p')) {
      e.preventDefault();
      e._kmHandled = true;
      activeIndex = (activeIndex - 1 + flatItems.length) % flatItems.length;
      _syncActiveItem();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      e._kmHandled = true;
      _performCommand(flatItems[activeIndex]);
    }
  }

  function _wireTopTrigger() {
    trigger = document.getElementById('cmdk-trigger');
    if (!trigger) return;
    trigger.innerHTML =
      '<span class="cmdk-trigger-icon">' + _safeIcon('search', 14) + '</span>' +
      '<span class="cmdk-trigger-label">Search</span>' +
      '<span class="cmdk-trigger-kbd">Ctrl K</span>';
    trigger.onclick = function () { openCommandBar(''); };
  }

  function _ensureDom() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'cmdk-overlay';
    overlay.className = 'cmdk-overlay';
    overlay.innerHTML =
      '<div class="cmdk-veil" data-cmdk-close="1"></div>' +
      '<div class="cmdk-positioner">' +
        '<div class="cmdk-box" role="dialog" aria-modal="true" aria-label="Quick Search">' +
          '<div class="cmdk-head">' +
            '<span class="cmdk-head-icon">' + _safeIcon('search', 16) + '</span>' +
            '<input id="cmdk-input" class="cmdk-input" type="text" autocomplete="off" spellcheck="false" placeholder="Search" />' +
            '<span class="cmdk-head-hint">ESC</span>' +
          '</div>' +
          '<div class="cmdk-results" id="cmdk-results"></div>' +
          '<div class="cmdk-footer">' +
            '<span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>' +
            '<span><kbd>Enter</kbd> run</span>' +
            '<span><kbd>Ctrl</kbd><kbd>K</kbd> close</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    input = document.getElementById('cmdk-input');
    resultsHost = document.getElementById('cmdk-results');

    overlay.addEventListener('click', function (e) {
      if (e.target && e.target.getAttribute('data-cmdk-close') === '1') closeCommandBar();
      var item = e.target && e.target.closest ? e.target.closest('.cmdk-item') : null;
      if (!item) return;
      var idx = parseInt(item.getAttribute('data-cmdk-index'), 10);
      if (!isNaN(idx) && flatItems[idx]) _performCommand(flatItems[idx]);
    });

    overlay.addEventListener('mousemove', function (e) {
      var item = e.target && e.target.closest ? e.target.closest('.cmdk-item') : null;
      if (!item) return;
      var idx = parseInt(item.getAttribute('data-cmdk-index'), 10);
      if (!isNaN(idx) && idx !== activeIndex) {
        activeIndex = idx;
        _syncActiveItem();
      }
    });

    input.addEventListener('input', function () {
      activeIndex = 0;
      _renderResults();
    });

    input.addEventListener('keydown', _handleKeydown);
  }

  function initCommandBar() {
    _wireTopTrigger();
    _ensureDom();
    document.addEventListener('keydown', _handleKeydown, true);
    window.addEventListener('keydown', _handleKeydown, true);
  }

  window.openCommandBar = openCommandBar;
  window.closeCommandBar = closeCommandBar;
  window.toggleCommandBar = toggleCommandBar;

  // Faz 8: canvas module loads after DOMContentLoaded → self-init on sticky cc:canvas-ready.
  if (window.cc && cc.on) cc.on('cc:canvas-ready', function () { cc.safe('canvas.command-bar', initCommandBar); });
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initCommandBar);
  else initCommandBar();
})();

// Modular skeleton hook (Faz 8) — command-bar is now a canvas subsystem loader module (modules/canvas/).
if (window.cc && cc.modules) cc.modules.register({ id: 'command-bar', parent: 'canvas', title: 'Command bar', mount: function () {}, unmount: function () {} });
