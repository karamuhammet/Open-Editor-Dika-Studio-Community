/* ============================================================
   dika studio core — ICON RAIL & FLYOUT host. Extracted from app.js §18 (Faz 8 core slimming).
   The left rail + flyout host every left-panel module opens through. Flat global before app.js:
   initIconRail (initApp calls it) + openFlyout (23 callers across modules) + closeFlyout/
   toggleLeftPanel/board-page helpers stay window globals. activeFlyoutTab state moves with them.
   ============================================================ */

// ── 18. Icon Rail & Flyout Panel Logic ───────────────────────
var activeFlyoutTab = null;

function toggleLeftPanel() {
  var collapsed = document.body.classList.toggle('editor-left-collapsed');
  var toggleBtn = document.getElementById('lp-toggle-btn');
  if (toggleBtn) toggleBtn.setAttribute('aria-expanded', !collapsed);
  var shell = document.getElementById('editor-left-shell');
  if (shell) shell.style.width = collapsed ? '0px' : '';
  if (!collapsed) syncEditorLeftShellWidth();
}

function syncEditorLeftShellWidth() {
  var shell = document.getElementById('editor-left-shell');
  if (!shell) return;
  var panel = document.getElementById('flyout-panel');
  var isOpen = panel && panel.classList.contains('open');
  var railW = 70;
  var flyoutW = isOpen ? 336 : 0;
  shell.style.width = (railW + flyoutW) + 'px';
  var toggleBtn = document.getElementById('lp-toggle-btn');
  if (toggleBtn) toggleBtn.style.setProperty('--lp-toggle-x', (railW + flyoutW) + 'px');
}

function expandEditorLeftPanel() {
  document.body.classList.remove('editor-left-collapsed');
  var toggleBtn = document.getElementById('lp-toggle-btn');
  if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
  var shell = document.getElementById('editor-left-shell');
  if (shell) shell.style.width = '';
  syncEditorLeftShellWidth();
}

function initIconRail() {
  /* `[data-tab]` IS THE FIX, and it is the whole bug. This bound a click to EVERY `.rail-item`,
     including `#settings-btn`, which has no `data-tab`. Pressing Settings therefore also called
     `openFlyout(undefined)`: `activeFlyoutTab` became undefined, no `.flyout-section` matched,
     `#flyout-undefined` does not exist, and the panel was given `.open` with nothing in it. The rail
     item highlighted itself too, because `i.dataset.tab === tab` is `undefined === undefined`.
     That is exactly the reported "after leaving settings the left panel stays open and empty", and
     it was there before this fork: the settings screen covered it, so it was only visible on the
     way out. */
  document.querySelectorAll('.rail-item[data-tab]').forEach(function (item) {
    item.addEventListener('click', function () {
      var tab = item.dataset.tab;
      if (activeFlyoutTab === tab) {
        closeFlyout();
      } else {
        openFlyout(tab);
      }
    });
  });

  // Toggle button for collapsing/expanding left panel
  var toggleBtn = document.getElementById('lp-toggle-btn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', function () {
      var collapsed = document.body.classList.toggle('editor-left-collapsed');
      toggleBtn.setAttribute('aria-expanded', !collapsed);
      var shell = document.getElementById('editor-left-shell');
      if (shell) shell.style.width = collapsed ? '0px' : '';
      if (!collapsed) syncEditorLeftShellWidth();
    });
  }

  syncEditorLeftShellWidth();
}

function openFlyout(tab) {
  // Icons moved INTO Items as its first category (2026-07-25): there is no data-section="icons"
  // any more. Keep every existing entry point alive (radial menu, Alt+4, keyboard command) by
  // opening Items and drilling straight into the Icons category.
  if (tab === 'icons') {
    openFlyout('shape');
    if (window.ItemsCore && ItemsCore.drillInto) ItemsCore.drillInto('icons');
    return;
  }

  // Subtitle is a Templates subpage, not a global flyout mode. Leaving
  // Templates must restore the shared flyout scroll contract immediately;
  // otherwise Media and other panels inherit subtitle's overflow lock.
  if (tab !== 'templates') {
    var sharedFlyoutBody = document.querySelector('.flyout-body');
    var templatesSection = document.querySelector('.flyout-section[data-section="templates"]');
    var templatesGrid = document.getElementById('flyout-tpl-grid');
    if (sharedFlyoutBody) sharedFlyoutBody.classList.remove('tpl-subtitle-body');
    if (templatesSection) templatesSection.classList.remove('tpl-subtitle-section');
    if (templatesGrid) templatesGrid.classList.remove('tpl-grid--subtitle');
    if (window._sdVideoToolsSubpage === 'subtitle') window._sdVideoToolsSubpage = null;
    var templateSearch = document.getElementById('tpl-search-input');
    if (templateSearch) {
      var templateSearchWrap = templateSearch.closest ? templateSearch.closest('.tpl-search-wrap') : templateSearch.parentNode;
      if (templateSearchWrap) templateSearchWrap.style.display = '';
    }
  }

  // Stop audio when switching away from media panel
  if (activeFlyoutTab === 'images' && tab !== 'images' && typeof _galAudioOnPanelLeave === 'function') {
    _galAudioOnPanelLeave();
  }
  activeFlyoutTab = tab;

  document.querySelectorAll('.rail-item').forEach(function (i) {
    i.classList.toggle('active', i.dataset.tab === tab);
  });

  document.querySelectorAll('.flyout-section').forEach(function (sec) {
    sec.classList.toggle('active', sec.dataset.section === tab);
  });

  var section = document.getElementById('flyout-' + tab);
  if (section) section.classList.add('active');

  var panel = document.getElementById('flyout-panel');
  if (panel) panel.classList.add('open');
  syncEditorLeftShellWidth();

  var titles = {
    templates: 'Templates',
    text: 'Text',
    background: 'Background',
    shape: 'Items',
    images: 'Media',
    products: 'Products',
    patterns: 'Patterns',
    animate: 'Animate',
    whiteboard: 'Board',
    'wf-templates': 'WF Pages',
    'wf-elements': 'WF Blocks',
    wireframe: 'Wireframe',
    charts: 'Charts',
    tools: 'Tools',
  };
  var header = document.getElementById('flyout-header-title');
  if (!header) header = document.getElementById('flyout-title');
  if (header) header.textContent = titles[tab] || tab;

  if (tab === 'wireframe') {
    if (typeof renderWfTemplateCategoryCards === 'function') renderWfTemplateCategoryCards();
    if (typeof renderWfElementCategoryCards === 'function') renderWfElementCategoryCards();
  }
  if (tab === 'wf-templates' && typeof renderWfTemplateCategoryCards === 'function') {
    renderWfTemplateCategoryCards();
  }

  if (tab === 'wf-elements' && typeof renderWfElementCategoryCards === 'function') {
    renderWfElementCategoryCards();
  }

  if (tab === 'whiteboard') {
    if (!window.wbActive) {
      closeFlyout();
      showBoardConfirm();
      return;
    }
  }

  if (tab === 'charts' && typeof renderChartCategoryCards === 'function') {
    // Preload Chart.js (~250KB) when the charts flyout opens — removed from index.html boot (editor-perf B3).
    if (window.cc && cc.requireLib) cc.requireLib('js/vendor/chart.umd.min.js').catch(function () {});
    renderChartCategoryCards();
  }

  if (tab === 'templates' && typeof renderTemplateCategoryCards === 'function') {
    var searchInput = document.getElementById('tpl-search-input');
    if (searchInput) searchInput.value = '';
    renderTemplateCategoryCards('flyout-tpl-grid');
  }

  if (tab === 'shape') {
    if (typeof renderItemsMainView === 'function') renderItemsMainView();
  }

  if (tab === 'images') {
    // ED-SP-022 added bounded network timeouts. A transient boot timeout must not leave Media on its
    // local fallback for the whole editor session: opening the panel is an explicit recovery point.
    if (typeof galSyncRemote === 'function') galSyncRemote(true);
    if (typeof _initStockTabs === 'function') _initStockTabs();
    if (typeof _switchMediaCategory === 'function') _switchMediaCategory(_activeMediaCat || 'image');
    if (typeof renderImagesCategoryView === 'function') renderImagesCategoryView();
    if (typeof _initGallerySearch === 'function') _initGallerySearch();
    if (typeof _initMediaToolbar === 'function') _initMediaToolbar();
    if (typeof _showFolderCreateHeaderBtn === 'function') _showFolderCreateHeaderBtn(true);
  } else {
    if (typeof _showFolderCreateHeaderBtn === 'function') _showFolderCreateHeaderBtn(false);
  }

  if (tab === 'products' && typeof renderProductsPanel === 'function') {
    renderProductsPanel();
  }

  if (tab === 'background') {
    // Reset to category view when opening background tab
    bgDrillBack();
  }

  if (tab === 'text') {
    // Reset to main view when opening text tab
    textDrillBack();
  }

  if (tab === 'ai') {
    if (typeof mountAiPanelInFlyout === 'function') mountAiPanelInFlyout();
  }

  if (window.CCI18n && typeof CCI18n.apply === 'function') CCI18n.apply(panel || document);
}

function closeFlyout() {
  if (activeFlyoutTab === 'ai' && typeof window.ensureAiPanelInModal === 'function') {
    window.ensureAiPanelInModal();
  }
  // Stop audio preview when leaving media panel (unless popup active)
  if (activeFlyoutTab === 'images' && typeof _galAudioOnPanelLeave === 'function') {
    _galAudioOnPanelLeave();
  }
  activeFlyoutTab = null;
  document.querySelectorAll('.rail-item').forEach(function (i) {
    i.classList.remove('active');
  });
  var panel = document.getElementById('flyout-panel');
  if (panel) panel.classList.remove('open');
  syncEditorLeftShellWidth();
}

function showBoardConfirm() {
  var existing = document.getElementById('board-confirm-modal');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'board-confirm-modal';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;animation:fadeIn .15s;';

  var box = document.createElement('div');
  box.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:28px 32px;max-width:380px;width:90%;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,0.5);';

  var icon = '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.5" style="margin-bottom:8px"><rect x="2" y="3" width="20" height="18" rx="3"/><circle cx="7" cy="8" r="1" fill="var(--gold)"/><circle cx="12" cy="8" r="1" fill="var(--gold)"/><circle cx="17" cy="8" r="1" fill="var(--gold)"/><line x1="2" y1="11" x2="22" y2="11"/></svg>';

  box.innerHTML = icon +
    '<h3 style="margin:0 0 6px;font-size:16px;color:var(--text);">Switch to Board Mode</h3>' +
    '<p style="margin:0 0 18px;font-size:12px;color:var(--text-dim);line-height:1.5;">A new page will open as your whiteboard. You can draw, add shapes, sticky notes and connectors freely across the entire canvas.</p>' +
    '<div style="display:flex;gap:8px;justify-content:center;">' +
      '<button id="board-confirm-cancel" style="padding:8px 18px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text-dim);font-size:12px;cursor:pointer;transition:all .12s;">Cancel</button>' +
      '<button id="board-confirm-ok" style="padding:8px 18px;border-radius:8px;border:none;background:var(--gold);color:#111;font-size:12px;font-weight:600;cursor:pointer;transition:all .12s;">Open Board</button>' +
    '</div>';

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };
  document.getElementById('board-confirm-cancel').onclick = function () { overlay.remove(); };
  document.getElementById('board-confirm-ok').onclick = function () {
    overlay.remove();
    activateBoardPage();
  };
}

function activateBoardPage() {
  var curGroupId = (pages[currentPageIndex] && pages[currentPageIndex].groupId) || null;

  // Find board in current group (or ungrouped if not in a group)
  var localBoardIdx = -1;
  // Find boards in OTHER groups/ungrouped
  var otherBoards = [];

  for (var i = 0; i < pages.length; i++) {
    if (!pages[i]._isBoard) continue;
    var pg = pages[i].groupId || null;
    if (pg === curGroupId) {
      localBoardIdx = i;
    } else {
      otherBoards.push(i);
    }
  }

  // Current group already has a board → switch to it
  if (localBoardIdx >= 0) {
    switchPage(localBoardIdx);
    _finishBoardActivation();
    return;
  }

  // Another group has a board → ask user
  if (otherBoards.length > 0) {
    _showBoardChoiceDialog(otherBoards[0], curGroupId);
    return;
  }

  // No boards anywhere → create new board in current group
  _createBoardInGroup(curGroupId);
}

/* Ask: switch to existing board or create new one in current group */
function _showBoardChoiceDialog(existingBoardIdx, targetGroupId) {
  var existing = document.getElementById('board-choice-modal');
  if (existing) existing.remove();

  var otherPage = pages[existingBoardIdx];
  var otherGroupName = '';
  if (otherPage.groupId && typeof pageGroups !== 'undefined') {
    for (var i = 0; i < pageGroups.length; i++) {
      if (pageGroups[i].id === otherPage.groupId) { otherGroupName = pageGroups[i].name; break; }
    }
  }
  var locationText = otherGroupName ? ('in "' + otherGroupName + '" group') : 'outside any group';

  var overlay = document.createElement('div');
  overlay.id = 'board-choice-modal';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;animation:fadeIn .15s;';

  var box = document.createElement('div');
  box.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:28px 32px;max-width:420px;width:90%;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,0.5);';

  var icon = '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.5" style="margin-bottom:8px"><rect x="2" y="3" width="20" height="18" rx="3"/><circle cx="7" cy="8" r="1" fill="var(--gold)"/><circle cx="12" cy="8" r="1" fill="var(--gold)"/><circle cx="17" cy="8" r="1" fill="var(--gold)"/><line x1="2" y1="11" x2="22" y2="11"/></svg>';

  box.innerHTML = icon +
    '<h3 style="margin:0 0 6px;font-size:16px;color:var(--text);">Board Already Exists</h3>' +
    '<p style="margin:0 0 18px;font-size:12px;color:var(--text-dim);line-height:1.5;">There is already an open board ' + locationText + '. Would you like to switch to the existing board or create a new one for this group?</p>' +
    '<div style="display:flex;gap:10px;justify-content:center;align-items:center;">' +
      '<button id="board-choice-cancel" style="padding:8px 18px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text-dim);font-size:12px;cursor:pointer;transition:all .12s;white-space:nowrap;">Cancel</button>' +
      '<button id="board-choice-switch" style="padding:8px 18px;border-radius:8px;border:1px solid var(--gold);background:transparent;color:var(--gold);font-size:12px;font-weight:600;cursor:pointer;transition:all .12s;white-space:nowrap;">Go to Existing Board</button>' +
      '<button id="board-choice-new" style="padding:8px 18px;border-radius:8px;border:none;background:var(--gold);color:#111;font-size:12px;font-weight:600;cursor:pointer;transition:all .12s;white-space:nowrap;">Create New Board</button>' +
    '</div>';

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };
  document.getElementById('board-choice-cancel').onclick = function () { overlay.remove(); };
  document.getElementById('board-choice-switch').onclick = function () {
    overlay.remove();
    switchPage(existingBoardIdx);
    _finishBoardActivation();
  };
  document.getElementById('board-choice-new').onclick = function () {
    overlay.remove();
    _createBoardInGroup(targetGroupId);
  };
}

/* Create a new board page assigned to the given group */
function _createBoardInGroup(groupId) {
  if (typeof saveCurrentPage === 'function') saveCurrentPage();
  var area = document.getElementById('canvas-area');
  var aW = area ? area.clientWidth : 1400;
  var aH = area ? area.clientHeight : 900;
  var newBoard = { json: null, bg: '#1a1a2e', label: 'Board', w: aW, h: aH, _isBoard: true };
  if (groupId) newBoard.groupId = groupId;
  pages.push(newBoard);
  switchPage(pages.length - 1);
  _finishBoardActivation();
}

function _finishBoardActivation() {
  setTimeout(function () {
    if (typeof enterWhiteboardMode === 'function') enterWhiteboardMode();
    openFlyoutDirect('whiteboard');
  }, 120);
}

function openFlyoutDirect(tab) {
  activeFlyoutTab = tab;
  document.querySelectorAll('.rail-item').forEach(function (i) {
    i.classList.toggle('active', i.dataset.tab === tab);
  });
  document.querySelectorAll('.flyout-section').forEach(function (sec) {
    sec.classList.toggle('active', sec.dataset.section === tab);
  });
  var section = document.getElementById('flyout-' + tab);
  if (section) section.classList.add('active');
  var panel = document.getElementById('flyout-panel');
  if (panel) panel.classList.add('open');
  var titles = { templates:'Templates', text:'Text', background:'Background', shape:'Items', images:'Images', patterns:'Patterns', animate:'Animate', whiteboard:'Board', 'wf-templates':'WF Pages', 'wf-elements':'WF Blocks', wireframe:'Wireframe' };
  var header = document.getElementById('flyout-header-title');
  if (!header) header = document.getElementById('flyout-title');
  if (header) header.textContent = titles[tab] || tab;
  if (window.CCI18n && typeof CCI18n.apply === 'function') CCI18n.apply(panel || document);
}

// ── 18b. Images & Gallery Folder System → extracted to modules/left-panel/gallery/gallery.js (Faz 2) ──

// ── 18c. Icons → modules/left-panel/items/icons/icons.js (Faz 2 extract; moved under Items 2026-07-25) ──
