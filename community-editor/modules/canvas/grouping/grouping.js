/* ============================================================
   dika studio – Group / Ungroup (Fabric.js)
   Depends on: fabric, getActiveCanvas, snap, CUSTOM_PROPS,
   SHORTCUTS (shortcuts.js), getIcon (icons.js), refreshStructure
   ============================================================ */

function groupSelected() {
  var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
  if (!cvs) return;

  var obj = cvs.getActiveObject();
  if (!obj || obj.type !== 'activeSelection') return;

  var parts = obj.getObjects ? obj.getObjects() : obj._objects;
  if (!parts || parts.length < 2) return;

  var coedit = window.CCCoEdit;
  var structural = !!(coedit && coedit.beginStructural && coedit.beginStructural());
  try {
    var group = obj.toGroup();
    if (group && typeof group.set === 'function') {
      group.set({ subTargetCheck: true });
    }
    cvs.setActiveObject(group);
    cvs.requestRenderAll();
    if (typeof refreshStructure === 'function') refreshStructure();
    if (typeof snap === 'function') snap();
  } finally {
    if (structural) coedit.endStructural();
  }
}

function ungroupSelected() {
  var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
  if (!cvs) return;

  var obj = cvs.getActiveObject();
  if (!obj || obj.type !== 'group') return;

  var coedit = window.CCCoEdit;
  var structural = !!(coedit && coedit.beginStructural && coedit.beginStructural());
  try {
    var sel = obj.toActiveSelection();
    cvs.setActiveObject(sel);
    cvs.requestRenderAll();
    if (typeof refreshStructure === 'function') refreshStructure();
    if (typeof snap === 'function') snap();
  } finally {
    if (structural) coedit.endStructural();
  }
}

function registerGroupingShortcuts() {
  // In the concatenated bundle SHORTCUTS is a later `const`; even `typeof SHORTCUTS` throws while
  // that lexical binding is in its TDZ. Catch that boot phase and retry after the module finishes.
  var shortcuts = null;
  try { if (typeof SHORTCUTS !== 'undefined') shortcuts = SHORTCUTS; } catch (e) {}
  if (!Array.isArray(shortcuts)) return false;
  if (window._ccGroupingShortcutsRegistered) return true;
  for (var i = 0; i < shortcuts.length; i++) {
    if (shortcuts[i].category === 'Edit') {
      shortcuts[i].shortcuts.push(
        { keys: ['Ctrl', 'G'], action: 'Group Selection', fn: groupSelected },
        { keys: ['Ctrl', 'Shift', 'G'], action: 'Ungroup Selection', fn: ungroupSelected }
      );
      window._ccGroupingShortcutsRegistered = true;
      return true;
    }
  }
  return false;
}

function injectFloatToolbarGrouping() {
  var ftb = document.getElementById('float-tb');
  if (!ftb || ftb.querySelector('[data-grouping-action]')) return;

  var sep = document.createElement('div');
  sep.className = 'ft-sep';
  sep.id = 'ft-group-sep';
  sep.style.display = 'none';

  var btnGroup = document.createElement('button');
  btnGroup.type = 'button';
  btnGroup.id = 'ft-group-btn';
  btnGroup.setAttribute('data-grouping-action', 'group');
  btnGroup.title = 'Group (Ctrl+G)';
  btnGroup.onclick = function () { groupSelected(); };
  btnGroup.innerHTML = typeof getIcon === 'function' ? getIcon('layers', 14) : 'Grp';
  btnGroup.style.display = 'none';

  var btnUngroup = document.createElement('button');
  btnUngroup.type = 'button';
  btnUngroup.id = 'ft-ungroup-btn';
  btnUngroup.setAttribute('data-grouping-action', 'ungroup');
  btnUngroup.title = 'Ungroup (Ctrl+Shift+G)';
  btnUngroup.onclick = function () { ungroupSelected(); };
  btnUngroup.innerHTML = typeof getIcon === 'function' ? getIcon('unlock', 14) : 'Ung';
  btnUngroup.style.display = 'none';

  var danger = ftb.querySelector('button.danger');
  if (danger && danger.parentNode === ftb) {
    ftb.insertBefore(sep, danger);
    ftb.insertBefore(btnGroup, danger);
    ftb.insertBefore(btnUngroup, danger);
  } else {
    ftb.appendChild(sep);
    ftb.appendChild(btnGroup);
    ftb.appendChild(btnUngroup);
  }
}

function injectContextMenuGrouping() {
  var menu = document.getElementById('ctx-menu');
  if (!menu || menu.querySelector('[data-ctx-grouping]')) return;

  var sep = document.createElement('div');
  sep.className = 'ctx-sep';
  sep.setAttribute('data-ctx-grouping', 'sep');

  function makeCtxBtn(label, iconName, fn) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ctx-item';
    b.setAttribute('data-ctx-grouping', '1');
    b.onclick = function () {
      fn();
      menu.classList.remove('show');
    };
    if (typeof getIcon === 'function') {
      b.innerHTML = getIcon(iconName, 14) + ' ' + label;
    } else {
      b.textContent = label;
    }
    return b;
  }

  var btnGroup = makeCtxBtn('Group', 'layers', groupSelected);
  var btnUngroup = makeCtxBtn('Ungroup', 'unlock', ungroupSelected);

  var firstAddText = menu.querySelector('.ctx-item[onclick*="openFlyout(\'text\')"]');
  if (firstAddText && firstAddText.parentNode === menu) {
    menu.insertBefore(sep, firstAddText);
    menu.insertBefore(btnGroup, firstAddText);
    menu.insertBefore(btnUngroup, firstAddText);
  } else {
    menu.appendChild(sep);
    menu.appendChild(btnGroup);
    menu.appendChild(btnUngroup);
  }
}

// ── Double-click to enter/edit group sub-objects ─────────────
var _activeGroupEditMode = null; // reference to the group being edited

function enterGroupEditMode(group) {
  if (!group || group.type !== 'group') return;
  _activeGroupEditMode = group;
  
  // Ungroup temporarily to allow editing individual items
  var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
  var items = group.getObjects().slice();
  var groupLeft = group.left;
  var groupTop = group.top;
  var groupScaleX = group.scaleX || 1;
  var groupScaleY = group.scaleY || 1;
  var groupAngle = group.angle || 0;
  
  // Store original group transform for re-grouping
  _activeGroupEditMode._editMeta = {
    left: groupLeft,
    top: groupTop,
    scaleX: groupScaleX,
    scaleY: groupScaleY,
    angle: groupAngle
  };
  _activeGroupEditMode._editItems = items;   // remember THIS group's own children so exit re-groups only these
  
  // Convert to active selection so items can be individually selected
  var coedit = window.CCCoEdit;
  var structural = !!(coedit && coedit.beginStructural && coedit.beginStructural());
  try {
    var sel = group.toActiveSelection();
    cvs.discardActiveObject();
    cvs.requestRenderAll();
  } finally {
    if (structural) coedit.endStructural();
  }
  
  // Show toast hint
  if (typeof showToast === 'function') showToast('Group edit mode — click items to edit, ESC to exit');
  
  // Add visual indicator
  var indicator = document.getElementById('group-edit-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'group-edit-indicator';
    indicator.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:3000;background:var(--gold,#c9a227);color:#111;padding:6px 16px;border-radius:20px;font-size:11px;font-weight:600;display:flex;align-items:center;gap:8px;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
    indicator.innerHTML = '<span>Group Edit Mode</span><button type="button" id="group-edit-exit-btn" style="background:rgba(0,0,0,0.2);border:none;color:#111;padding:2px 8px;border-radius:12px;cursor:pointer;font-size:11px;font-weight:700">ESC to exit</button>';
    document.body.appendChild(indicator);
  }
  indicator.style.display = 'flex';
  
  var exitBtn = document.getElementById('group-edit-exit-btn');
  if (exitBtn) {
    exitBtn.onclick = function() { exitGroupEditMode(); };
  }
}

function exitGroupEditMode() {
  if (!_activeGroupEditMode) return;
  var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : canvas;
  
  // Re-group ONLY the objects that belonged to the edited group — NOT cvs.getObjects() (every object on
  // the page), which swept unrelated objects into one giant group and broke the layout. Filter to members
  // still on the canvas (some may have been deleted while editing).
  var coedit = window.CCCoEdit;
  var structural = !!(coedit && coedit.beginStructural && coedit.beginStructural());
  try {
  var onCanvas = cvs.getObjects();
  var members = (_activeGroupEditMode._editItems || []).filter(function (o) { return onCanvas.indexOf(o) !== -1; });
  if (members.length > 1) {
    var sel = new fabric.ActiveSelection(members, { canvas: cvs });
    cvs.setActiveObject(sel);
    var newGroup = sel.toGroup();
    if (newGroup) {
      newGroup.set({ subTargetCheck: true });
      cvs.setActiveObject(newGroup);
    }
  } else if (members.length === 1) {
    cvs.setActiveObject(members[0]);   // a lone survivor can't be a group — just select it
  }
  
  _activeGroupEditMode = null;
  cvs.requestRenderAll();
  } finally {
    if (structural) coedit.endStructural();
  }
  
  // Hide indicator
  var indicator = document.getElementById('group-edit-indicator');
  if (indicator) indicator.style.display = 'none';
  
  if (typeof refreshStructure === 'function') refreshStructure();
  if (typeof snap === 'function') snap();
}

function initGroupEditing() {
  var _waitCanvas = setInterval(function() {
    if (typeof canvas === 'undefined' || !canvas || !canvas.on) return;
    clearInterval(_waitCanvas);

    canvas.on('mouse:dblclick', function(opt) {
      var target = opt.target;
      if (!target || target.type !== 'group') return;

      // Skip group edit for pattern text groups
      if (target._isTextPattern) return;

      // Enter group edit mode — ungroup temporarily for full editing
      enterGroupEditMode(target);
    });
    
    // ESC to exit group edit mode
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && _activeGroupEditMode) {
        exitGroupEditMode();
      }
    });
  }, 200);
}

function initGrouping() {
  if (!registerGroupingShortcuts()) {
    var tries = 0;
    var shortcutWait = setInterval(function () {
      tries++;
      if (registerGroupingShortcuts() || tries >= 20) clearInterval(shortcutWait);
    }, 100);
  }
  injectFloatToolbarGrouping();
  injectContextMenuGrouping();
  initGroupEditing();
}

// Faz 8: canvas module loads after DOMContentLoaded → self-init on sticky cc:canvas-ready.
if (window.cc && cc.on) cc.on('cc:canvas-ready', function () { cc.safe('canvas.grouping', initGrouping); });
else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initGrouping);
else initGrouping();

// Modular skeleton hook (Faz 8) — grouping is now a canvas subsystem loader module (modules/canvas/).
if (window.cc && cc.modules) cc.modules.register({ id: 'grouping', parent: 'canvas', title: 'Grouping', mount: function () {}, unmount: function () {} });
