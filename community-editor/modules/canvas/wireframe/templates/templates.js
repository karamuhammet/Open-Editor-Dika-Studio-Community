/* wireframe/templates — WF template cards + registry. Split from the 2652-line wireframe.js (decomposition).
   FLAT sub-module: functions stay window globals (the wireframe init + each other call them at runtime).
   Registers under canvas.wireframe. NOTE: wireframe is a paused/hidden feature — load-level verified. */

// ═════════════════════════════════════════════════════════════
// PART A: TEMPLATE CATEGORY CARDS (flyout wf-templates)
// ═════════════════════════════════════════════════════════════

function renderWfTemplateCategoryCards() {
  var container = document.getElementById('wf-tpl-cat-view');
  var drillView = document.getElementById('wf-tpl-drill-view');
  if (!container) return;
  container.style.display = '';
  if (drillView) drillView.style.display = 'none';
  container.innerHTML = '';

  WF_TEMPLATE_CATEGORIES.forEach(function(cat) {
    var card = document.createElement('div');
    card.className = 'wf-cat-card';
    var iconHtml = (typeof getIcon === 'function') ? getIcon(cat.icon, 22) : '';
    card.innerHTML =
      '<div class="wf-cat-icon">' + iconHtml + '</div>' +
      '<div class="wf-cat-name">' + cat.label + '</div>' +
      '<div class="wf-cat-desc">' + cat.desc + '</div>';
    card.addEventListener('click', function() {
      drillIntoWfTemplateCategory(cat.id, cat.label);
    });
    container.appendChild(card);
  });
}

function drillIntoWfTemplateCategory(catId, label) {
  var catView   = document.getElementById('wf-tpl-cat-view');
  var drillView = document.getElementById('wf-tpl-drill-view');
  var drillGrid = document.getElementById('wf-tpl-drill-grid');
  var titleEl   = document.getElementById('wf-tpl-sub-title');
  var backBtn   = document.getElementById('wf-tpl-back-btn');

  if (catView)   catView.style.display = 'none';
  if (drillView) drillView.style.display = '';
  if (titleEl)   titleEl.textContent = label;

  if (backBtn) {
    backBtn.onclick = function() {
      renderWfTemplateCategoryCards();
    };
  }

  if (!drillGrid) return;
  drillGrid.innerHTML = '';

  var templates = WF_TEMPLATES.filter(function(t) { return t.category === catId; });

  if (templates.length === 0) {
    drillGrid.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-dim);font-size:12px">Coming soon…</div>';
    return;
  }

  templates.forEach(function(tpl) {
    var item = document.createElement('div');
    item.className = 'wf-tpl-thumb';
    item.innerHTML =
      '<div class="wf-tpl-preview">' +
        '<svg viewBox="0 0 288 180" xmlns="http://www.w3.org/2000/svg">' + (tpl.svg || '') + '</svg>' +
      '</div>' +
      '<div class="wf-tpl-name">' + tpl.name + '</div>';
    item.addEventListener('click', function() {
      applyWfTemplate(tpl.id);
    });
    drillGrid.appendChild(item);
  });
}

// ═════════════════════════════════════════════════════════════
// PART B: TEMPLATE REGISTRY
// ═════════════════════════════════════════════════════════════

var WF_TEMPLATES = [
  // ── Home ──
  { id: 'home-classic', name: 'Classic Home', category: 'home',
    svg: '<rect x="0" y="0" width="288" height="24" fill="#E5E7EB"/><rect x="10" y="6" width="40" height="12" rx="2" fill="#D1D5DB"/><rect x="200" y="8" width="20" height="8" rx="2" fill="#D1D5DB"/><rect x="225" y="8" width="20" height="8" rx="2" fill="#D1D5DB"/><rect x="250" y="8" width="30" height="8" rx="2" fill="#3B82F6"/><rect x="0" y="30" width="288" height="70" rx="0" fill="#F3F4F6"/><rect x="20" y="45" width="120" height="10" rx="2" fill="#9CA3AF"/><rect x="20" y="60" width="80" height="6" rx="2" fill="#D1D5DB"/><rect x="20" y="72" width="60" height="14" rx="4" fill="#3B82F6"/><rect x="170" y="38" width="100" height="55" rx="4" fill="#E5E7EB"/><rect x="10" y="110" width="84" height="60" rx="4" fill="#F3F4F6"/><rect x="102" y="110" width="84" height="60" rx="4" fill="#F3F4F6"/><rect x="194" y="110" width="84" height="60" rx="4" fill="#F3F4F6"/>',
    fn: function() { _applyWfHome('classic'); }
  },
  { id: 'home-split', name: 'Split Hero', category: 'home',
    svg: '<rect x="0" y="0" width="288" height="24" fill="#E5E7EB"/><rect x="0" y="28" width="144" height="80" fill="#F3F4F6"/><rect x="20" y="48" width="100" height="10" rx="2" fill="#9CA3AF"/><rect x="20" y="64" width="70" height="6" rx="2" fill="#D1D5DB"/><rect x="144" y="28" width="144" height="80" fill="#E5E7EB"/><rect x="10" y="118" width="268" height="50" rx="4" fill="#F3F4F6"/>',
    fn: function() { _applyWfHome('split'); }
  },
  // ── About ──
  { id: 'about-team', name: 'Team Page', category: 'about',
    svg: '<rect x="0" y="0" width="288" height="24" fill="#E5E7EB"/><rect x="80" y="35" width="128" height="10" rx="2" fill="#9CA3AF"/><rect x="100" y="50" width="88" height="6" rx="2" fill="#D1D5DB"/><circle cx="60" cy="100" r="25" fill="#E5E7EB"/><circle cx="144" cy="100" r="25" fill="#E5E7EB"/><circle cx="228" cy="100" r="25" fill="#E5E7EB"/><rect x="38" y="130" width="44" height="6" rx="2" fill="#D1D5DB"/><rect x="122" y="130" width="44" height="6" rx="2" fill="#D1D5DB"/><rect x="206" y="130" width="44" height="6" rx="2" fill="#D1D5DB"/>',
    fn: function() { _applyWfAbout('team'); }
  },
  { id: 'about-story', name: 'Our Story', category: 'about',
    svg: '<rect x="0" y="0" width="288" height="24" fill="#E5E7EB"/><rect x="0" y="30" width="288" height="60" fill="#F3F4F6"/><rect x="20" y="42" width="120" height="10" rx="2" fill="#9CA3AF"/><rect x="20" y="58" width="200" height="6" rx="2" fill="#D1D5DB"/><rect x="20" y="68" width="160" height="6" rx="2" fill="#D1D5DB"/><rect x="20" y="100" width="120" height="70" rx="4" fill="#E5E7EB"/><rect x="155" y="100" width="120" height="70" rx="4" fill="#E5E7EB"/>',
    fn: function() { _applyWfAbout('story'); }
  },
  // ── Project ──
  { id: 'project-grid', name: 'Portfolio Grid', category: 'project',
    svg: '<rect x="0" y="0" width="288" height="24" fill="#E5E7EB"/><rect x="80" y="32" width="128" height="10" rx="2" fill="#9CA3AF"/><rect x="10" y="50" width="130" height="55" rx="4" fill="#F3F4F6"/><rect x="148" y="50" width="130" height="55" rx="4" fill="#F3F4F6"/><rect x="10" y="113" width="130" height="55" rx="4" fill="#F3F4F6"/><rect x="148" y="113" width="130" height="55" rx="4" fill="#F3F4F6"/>',
    fn: function() { _applyWfProject('grid'); }
  },
  { id: 'project-case', name: 'Case Study', category: 'project',
    svg: '<rect x="0" y="0" width="288" height="24" fill="#E5E7EB"/><rect x="0" y="28" width="288" height="50" fill="#F3F4F6"/><rect x="20" y="38" width="160" height="10" rx="2" fill="#9CA3AF"/><rect x="20" y="54" width="200" height="6" rx="2" fill="#D1D5DB"/><rect x="20" y="86" width="248" height="80" rx="4" fill="#E5E7EB"/>',
    fn: function() { _applyWfProject('case'); }
  },
  // ── Contact ──
  { id: 'contact-form', name: 'Form & Map', category: 'contact',
    svg: '<rect x="0" y="0" width="288" height="24" fill="#E5E7EB"/><rect x="80" y="32" width="128" height="10" rx="2" fill="#9CA3AF"/><rect x="10" y="52" width="130" height="110" rx="4" fill="#F3F4F6"/><rect x="22" y="64" width="106" height="12" rx="2" fill="#E5E7EB"/><rect x="22" y="82" width="106" height="12" rx="2" fill="#E5E7EB"/><rect x="22" y="100" width="106" height="24" rx="2" fill="#E5E7EB"/><rect x="22" y="132" width="60" height="16" rx="4" fill="#3B82F6"/><rect x="148" y="52" width="130" height="110" rx="4" fill="#E5E7EB"/>',
    fn: function() { _applyWfContact('form'); }
  },
  // ── Services ──
  { id: 'services-cards', name: 'Service Cards', category: 'services',
    svg: '<rect x="0" y="0" width="288" height="24" fill="#E5E7EB"/><rect x="80" y="32" width="128" height="10" rx="2" fill="#9CA3AF"/><rect x="10" y="52" width="84" height="70" rx="4" fill="#F3F4F6"/><rect x="102" y="52" width="84" height="70" rx="4" fill="#F3F4F6"/><rect x="194" y="52" width="84" height="70" rx="4" fill="#F3F4F6"/><rect x="10" y="130" width="84" height="40" rx="4" fill="#F3F4F6"/><rect x="102" y="130" width="84" height="40" rx="4" fill="#F3F4F6"/><rect x="194" y="130" width="84" height="40" rx="4" fill="#F3F4F6"/>',
    fn: function() { _applyWfServices('cards'); }
  },
  // ── Single Service ──
  { id: 'single-detail', name: 'Service Detail', category: 'singleService',
    svg: '<rect x="0" y="0" width="288" height="24" fill="#E5E7EB"/><rect x="0" y="28" width="288" height="50" fill="#F3F4F6"/><rect x="20" y="38" width="160" height="10" rx="2" fill="#9CA3AF"/><rect x="20" y="54" width="120" height="6" rx="2" fill="#D1D5DB"/><rect x="20" y="86" width="180" height="6" rx="2" fill="#D1D5DB"/><rect x="20" y="96" width="248" height="6" rx="2" fill="#D1D5DB"/><rect x="20" y="106" width="200" height="6" rx="2" fill="#D1D5DB"/><rect x="20" y="120" width="248" height="50" rx="4" fill="#E5E7EB"/>',
    fn: function() { _applyWfSingleService('detail'); }
  },

  // ── Landing Page – Corporate ──
  { id: 'lp-corp-hero', name: 'Corporate Hero', category: 'lp-corporate',
    svg: '<rect x="0" y="0" width="288" height="24" fill="#1E293B"/><rect x="10" y="6" width="40" height="12" rx="2" fill="#334155"/><rect x="200" y="8" width="30" height="8" rx="2" fill="#3B82F6"/><rect x="0" y="28" width="288" height="90" fill="#1E293B"/><rect x="50" y="42" width="188" height="12" rx="2" fill="#E2E8F0"/><rect x="70" y="60" width="148" height="8" rx="2" fill="#94A3B8"/><rect x="104" y="78" width="80" height="20" rx="4" fill="#3B82F6"/><rect x="10" y="125" width="84" height="45" rx="4" fill="#F1F5F9"/><rect x="102" y="125" width="84" height="45" rx="4" fill="#F1F5F9"/><rect x="194" y="125" width="84" height="45" rx="4" fill="#F1F5F9"/>',
    fn: function() { _applyWfLpCorporate('hero'); }
  },
  { id: 'lp-corp-features', name: 'Corporate Features', category: 'lp-corporate',
    svg: '<rect x="0" y="0" width="288" height="24" fill="#1E293B"/><rect x="80" y="32" width="128" height="10" rx="2" fill="#334155"/><rect x="10" y="52" width="130" height="60" rx="4" fill="#F1F5F9"/><rect x="148" y="52" width="130" height="60" rx="4" fill="#F1F5F9"/><rect x="10" y="120" width="130" height="60" rx="4" fill="#F1F5F9"/><rect x="148" y="120" width="130" height="60" rx="4" fill="#F1F5F9"/>',
    fn: function() { _applyWfLpCorporate('features'); }
  },

  // ── Landing Page – Restaurant ──
  { id: 'lp-rest-welcome', name: 'Restaurant Welcome', category: 'lp-restaurant',
    svg: '<rect x="0" y="0" width="288" height="180" fill="#1C1917"/><rect x="0" y="0" width="288" height="24" fill="#292524"/><rect x="10" y="6" width="40" height="12" rx="2" fill="#44403C"/><rect x="70" y="40" width="148" height="14" rx="2" fill="#D6D3D1"/><rect x="90" y="62" width="108" height="8" rx="2" fill="#78716C"/><rect x="104" y="80" width="80" height="20" rx="10" fill="#EA580C"/><rect x="10" y="115" width="84" height="55" rx="4" fill="#292524"/><rect x="102" y="115" width="84" height="55" rx="4" fill="#292524"/><rect x="194" y="115" width="84" height="55" rx="4" fill="#292524"/>',
    fn: function() { _applyWfLpRestaurant('welcome'); }
  },
  { id: 'lp-rest-menu', name: 'Restaurant Menu', category: 'lp-restaurant',
    svg: '<rect x="0" y="0" width="288" height="180" fill="#1C1917"/><rect x="80" y="10" width="128" height="12" rx="2" fill="#D6D3D1"/><rect x="20" y="32" width="120" height="10" rx="2" fill="#78716C"/><rect x="20" y="48" width="200" height="6" rx="1" fill="#44403C"/><rect x="228" y="48" width="40" height="6" rx="1" fill="#EA580C"/><rect x="20" y="62" width="200" height="6" rx="1" fill="#44403C"/><rect x="228" y="62" width="40" height="6" rx="1" fill="#EA580C"/><rect x="20" y="80" width="120" height="10" rx="2" fill="#78716C"/><rect x="20" y="96" width="200" height="6" rx="1" fill="#44403C"/><rect x="228" y="96" width="40" height="6" rx="1" fill="#EA580C"/><rect x="20" y="110" width="200" height="6" rx="1" fill="#44403C"/><rect x="228" y="110" width="40" height="6" rx="1" fill="#EA580C"/><rect x="20" y="130" width="248" height="40" rx="8" fill="#292524"/>',
    fn: function() { _applyWfLpRestaurant('menu'); }
  },

  // ── Landing Page – Portfolio ──
  { id: 'lp-port-showcase', name: 'Portfolio Showcase', category: 'lp-portfolio',
    svg: '<rect x="0" y="0" width="288" height="24" fill="#18181B"/><rect x="10" y="6" width="40" height="12" rx="2" fill="#3F3F46"/><rect x="0" y="28" width="288" height="60" fill="#18181B"/><rect x="50" y="40" width="188" height="12" rx="2" fill="#E4E4E7"/><rect x="80" y="58" width="128" height="8" rx="2" fill="#71717A"/><rect x="10" y="96" width="88" height="72" rx="4" fill="#27272A"/><rect x="102" y="96" width="84" height="72" rx="4" fill="#27272A"/><rect x="194" y="96" width="84" height="72" rx="4" fill="#27272A"/>',
    fn: function() { _applyWfLpPortfolio('showcase'); }
  },
  { id: 'lp-port-minimal', name: 'Minimal Portfolio', category: 'lp-portfolio',
    svg: '<rect x="0" y="0" width="288" height="180" fill="#FAFAFA"/><rect x="10" y="10" width="60" height="10" rx="2" fill="#18181B"/><rect x="40" y="50" width="208" height="14" rx="2" fill="#18181B"/><rect x="60" y="72" width="168" height="8" rx="2" fill="#A1A1AA"/><rect x="10" y="100" width="130" height="70" rx="4" fill="#F4F4F5" stroke="#E4E4E7" stroke-width="1"/><rect x="148" y="100" width="130" height="70" rx="4" fill="#F4F4F5" stroke="#E4E4E7" stroke-width="1"/>',
    fn: function() { _applyWfLpPortfolio('minimal'); }
  }
];

// ─── Template Apply Functions ────────────────────────────────

function applyWfTemplate(id) {
  var tpl = WF_TEMPLATES.find(function(t) { return t.id === id; });
  if (!tpl || typeof tpl.fn !== 'function') return;

  // Switch to wireframe product type if not already
  if (typeof setProductType === 'function' && activeProduct !== 'wireframe') {
    setProductType('wireframe');
  }

  var coedit = window.CCCoEdit;
  var structural = !!(coedit && coedit.beginStructural && coedit.beginStructural());
  try {
    canvas.clear();
    canvas.backgroundColor = WF.bgPage;
    tpl.fn();
    canvas.renderAll();
    if (typeof snap === 'function') snap();
  } finally {
    if (structural) coedit.endStructural();
  }
}

// ─── Helper: group wireframe template objects and add to canvas ──
var WF_TEMPLATE_NAMES = {
  'home-classic':      'WF – Home Classic',
  'home-split':        'WF – Home Split',
  'about-team':        'WF – About Team',
  'about-story':       'WF – About Story',
  'project-grid':      'WF – Project Grid',
  'project-case':      'WF – Project Case Study',
  'contact-form':      'WF – Contact Form',
  'contact-map':       'WF – Contact Map',
  'services-grid':     'WF – Services Grid',
  'services-list':     'WF – Services List',
  'single-service':    'WF – Single Service'
};

function _wfGroupAndAdd(objs, templateKey) {
  _wfStamp(objs, 'template');
  var group = new fabric.Group(objs, {
    left: 0,
    top: 0,
    subTargetCheck: true
  });
  group._isWireframe = true;
  group._wfType = 'template';
  group._groupName = WF_TEMPLATE_NAMES[templateKey] || ('WF – ' + templateKey);
  canvas.add(group);
  canvas.setActiveObject(group);
}

function _applyWfHome(variant) {
  var W = CW, H = CH;
  var objs = [];

  // Navbar
  objs.push(_wfRect({ left:0, top:0, width:W, height:60, rx:0, ry:0, fill:WF.bgSection }));
  objs.push(_wfRect({ left:20, top:18, width:80, height:24, fill:WF.bgCard }));
  objs.push(_wfText('Logo', { left:35, top:20, fontSize:14, fill:WF.textMid }));
  objs.push(_wfRect({ left:W-280, top:20, width:50, height:20, fill:'transparent', stroke:WF.border }));
  objs.push(_wfRect({ left:W-220, top:20, width:50, height:20, fill:'transparent', stroke:WF.border }));
  objs.push(_wfRect({ left:W-160, top:20, width:50, height:20, fill:'transparent', stroke:WF.border }));
  objs.push(_wfRect({ left:W-100, top:16, width:80, height:28, fill:WF.accent, rx:4, ry:4 }));
  objs.push(_wfText('CTA', { left:W-78, top:19, fontSize:12, fill:'#FFFFFF' }));

  if (variant === 'classic') {
    // Hero
    objs.push(_wfRect({ left:0, top:70, width:W, height:300, rx:0, ry:0, fill:WF.bgSection }));
    objs.push(_wfText('Hero Headline Goes Here', { left:60, top:140, fontSize:32, fill:WF.textDark, fontWeight:'bold' }));
    objs.push(_wfText('Subtitle description text for the hero section', { left:60, top:185, fontSize:16, fill:WF.textMid }));
    objs.push(_wfRect({ left:60, top:220, width:140, height:40, fill:WF.accent, rx:6, ry:6 }));
    objs.push(_wfText('Get Started', { left:82, top:230, fontSize:14, fill:'#FFFFFF' }));
    objs.push(_wfRect({ left:W-400, top:100, width:340, height:220, fill:WF.bgCard, rx:8, ry:8 }));

    // Features row
    var cardW = (W - 120) / 3;
    for (var i = 0; i < 3; i++) {
      var cx = 40 + i * (cardW + 20);
      objs.push(_wfRect({ left:cx, top:400, width:cardW, height:180, fill:WF.bgSection, rx:8, ry:8 }));
      objs.push(_wfRect({ left:cx+20, top:420, width:40, height:40, fill:WF.bgCard, rx:20, ry:20 }));
      objs.push(_wfText('Feature ' + (i+1), { left:cx+20, top:475, fontSize:14, fill:WF.textDark, fontWeight:'bold' }));
      objs.push(_wfText('Short description text', { left:cx+20, top:498, fontSize:11, fill:WF.textMid }));
    }
  } else {
    // Split hero
    objs.push(_wfRect({ left:0, top:70, width:W/2, height:340, rx:0, ry:0, fill:WF.bgSection }));
    objs.push(_wfText('Big Headline\nFor Your\nProduct', { left:60, top:140, fontSize:28, fill:WF.textDark, fontWeight:'bold' }));
    objs.push(_wfText('Description text goes here', { left:60, top:240, fontSize:14, fill:WF.textMid }));
    objs.push(_wfRect({ left:60, top:280, width:120, height:36, fill:WF.accent, rx:6, ry:6 }));
    objs.push(_wfText('Learn More', { left:78, top:289, fontSize:12, fill:'#FFFFFF' }));
    objs.push(_wfRect({ left:W/2, top:70, width:W/2, height:340, rx:0, ry:0, fill:WF.bgCard }));
    // CTA section
    objs.push(_wfRect({ left:0, top:430, width:W, height:200, rx:0, ry:0, fill:WF.bgSection }));
    objs.push(_wfText('Ready to start?', { left:W/2-100, top:480, fontSize:24, fill:WF.textDark }));
    objs.push(_wfRect({ left:W/2-70, top:530, width:140, height:40, fill:WF.accent, rx:6, ry:6 }));
    objs.push(_wfText('Sign Up', { left:W/2-38, top:540, fontSize:14, fill:'#FFFFFF' }));
  }

  // Footer
  objs.push(_wfRect({ left:0, top:H-80, width:W, height:80, rx:0, ry:0, fill:'#E5E7EB' }));
  objs.push(_wfText('© 2026 Company. All rights reserved.', { left:40, top:H-52, fontSize:11, fill:WF.textMid }));

  _wfGroupAndAdd(objs, variant === 'classic' ? 'home-classic' : 'home-split');
}

function _applyWfAbout(variant) {
  var W = CW, H = CH;
  var objs = [];

  // Navbar
  objs.push(_wfRect({ left:0, top:0, width:W, height:60, rx:0, ry:0, fill:WF.bgSection }));
  objs.push(_wfRect({ left:20, top:18, width:80, height:24, fill:WF.bgCard }));

  if (variant === 'team') {
    objs.push(_wfText('Meet Our Team', { left:W/2-80, top:90, fontSize:28, fill:WF.textDark, fontWeight:'bold' }));
    objs.push(_wfText('The amazing people behind the product', { left:W/2-140, top:130, fontSize:14, fill:WF.textMid }));
    // Team members
    var cols = 4, sz = 120, gap = 40;
    var startX = (W - (cols * sz + (cols-1) * gap)) / 2;
    for (var i = 0; i < cols; i++) {
      var cx = startX + i * (sz + gap);
      objs.push(new fabric.Circle({ left:cx + sz/2 - 40, top:180, radius:40, fill:WF.bgCard, stroke:WF.border, strokeWidth:1 }));
      objs.push(_wfText('Person ' + (i+1), { left:cx+15, top:270, fontSize:13, fill:WF.textDark }));
      objs.push(_wfText('Role Title', { left:cx+20, top:290, fontSize:11, fill:WF.textMid }));
    }
  } else {
    objs.push(_wfText('Our Story', { left:60, top:90, fontSize:28, fill:WF.textDark, fontWeight:'bold' }));
    objs.push(_wfText('How it all started and where we are going...', { left:60, top:130, fontSize:14, fill:WF.textMid }));
    objs.push(_wfRect({ left:60, top:170, width:W/2-80, height:250, fill:WF.bgCard, rx:8, ry:8 }));
    objs.push(_wfRect({ left:W/2+20, top:170, width:W/2-80, height:250, fill:WF.bgCard, rx:8, ry:8 }));
    objs.push(_wfText('Founded in 2020, we set out to...', { left:W/2+40, top:200, fontSize:12, fill:WF.textMid }));
  }

  // Footer
  objs.push(_wfRect({ left:0, top:H-70, width:W, height:70, rx:0, ry:0, fill:'#E5E7EB' }));

  _wfGroupAndAdd(objs, variant === 'team' ? 'about-team' : 'about-story');
}

function _applyWfProject(variant) {
  var W = CW, H = CH;
  var objs = [];
  objs.push(_wfRect({ left:0, top:0, width:W, height:60, rx:0, ry:0, fill:WF.bgSection }));
  objs.push(_wfRect({ left:20, top:18, width:80, height:24, fill:WF.bgCard }));

  if (variant === 'grid') {
    objs.push(_wfText('Our Work', { left:W/2-60, top:85, fontSize:26, fill:WF.textDark, fontWeight:'bold' }));
    var cols = 3, rows = 2, cw = (W-100)/cols, ch = 180;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var px = 30 + c * (cw+20), py = 130 + r * (ch+20);
        objs.push(_wfRect({ left:px, top:py, width:cw, height:ch, fill:WF.bgSection, rx:8, ry:8 }));
        objs.push(_wfText('Project ' + (r*cols+c+1), { left:px+15, top:py+ch-30, fontSize:12, fill:WF.textDark }));
      }
    }
  } else {
    objs.push(_wfRect({ left:0, top:65, width:W, height:200, rx:0, ry:0, fill:WF.bgSection }));
    objs.push(_wfText('Case Study: Project Name', { left:60, top:110, fontSize:26, fill:WF.textDark, fontWeight:'bold' }));
    objs.push(_wfText('Client overview and challenge description', { left:60, top:155, fontSize:14, fill:WF.textMid }));
    objs.push(_wfRect({ left:60, top:290, width:W-120, height:300, fill:WF.bgCard, rx:8, ry:8 }));
    objs.push(_wfText('Project visual / screenshot area', { left:W/2-120, top:420, fontSize:14, fill:WF.textLight }));
  }

  objs.push(_wfRect({ left:0, top:H-70, width:W, height:70, rx:0, ry:0, fill:'#E5E7EB' }));
  _wfGroupAndAdd(objs, variant === 'grid' ? 'project-grid' : 'project-case');
}

function _applyWfContact(variant) {
  var W = CW, H = CH;
  var objs = [];
  objs.push(_wfRect({ left:0, top:0, width:W, height:60, rx:0, ry:0, fill:WF.bgSection }));
  objs.push(_wfRect({ left:20, top:18, width:80, height:24, fill:WF.bgCard }));
  objs.push(_wfText('Contact Us', { left:W/2-70, top:85, fontSize:26, fill:WF.textDark, fontWeight:'bold' }));

  // Form area
  var fw = W/2 - 80;
  objs.push(_wfRect({ left:40, top:130, width:fw, height:400, fill:WF.bgSection, rx:8, ry:8 }));
  var fields = ['Full Name', 'Email Address', 'Subject', 'Message'];
  for (var i = 0; i < fields.length; i++) {
    var fh = i === 3 ? 80 : 36;
    var fy = 155 + i * 60;
    objs.push(_wfText(fields[i], { left:65, top:fy, fontSize:11, fill:WF.textMid }));
    objs.push(_wfRect({ left:65, top:fy+16, width:fw-50, height:fh, fill:'#FFFFFF', stroke:WF.border, rx:4, ry:4 }));
  }
  objs.push(_wfRect({ left:65, top:420, width:120, height:36, fill:WF.accent, rx:6, ry:6 }));
  objs.push(_wfText('Send Message', { left:82, top:429, fontSize:12, fill:'#FFFFFF' }));

  // Map placeholder
  objs.push(_wfRect({ left:W/2+20, top:130, width:fw, height:400, fill:WF.bgCard, rx:8, ry:8 }));
  objs.push(_wfText('Map / Location', { left:W/2+fw/2-30, top:310, fontSize:14, fill:WF.textLight }));

  objs.push(_wfRect({ left:0, top:H-70, width:W, height:70, rx:0, ry:0, fill:'#E5E7EB' }));
  _wfGroupAndAdd(objs, 'contact-form');
}

function _applyWfServices(variant) {
  var W = CW, H = CH;
  var objs = [];
  objs.push(_wfRect({ left:0, top:0, width:W, height:60, rx:0, ry:0, fill:WF.bgSection }));
  objs.push(_wfRect({ left:20, top:18, width:80, height:24, fill:WF.bgCard }));
  objs.push(_wfText('Our Services', { left:W/2-70, top:85, fontSize:26, fill:WF.textDark, fontWeight:'bold' }));
  objs.push(_wfText('What we offer to help you grow', { left:W/2-110, top:120, fontSize:14, fill:WF.textMid }));

  var cols = 3, rows = 2, cw = (W-120)/cols, ch = 160;
  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < cols; c++) {
      var px = 40 + c * (cw+20), py = 160 + r * (ch+20);
      objs.push(_wfRect({ left:px, top:py, width:cw, height:ch, fill:WF.bgSection, rx:8, ry:8 }));
      objs.push(_wfRect({ left:px+20, top:py+20, width:36, height:36, fill:WF.bgCard, rx:18, ry:18 }));
      objs.push(_wfText('Service ' + (r*cols+c+1), { left:px+20, top:py+70, fontSize:14, fill:WF.textDark, fontWeight:'bold' }));
      objs.push(_wfText('Brief description of service', { left:px+20, top:py+92, fontSize:11, fill:WF.textMid }));
    }
  }

  objs.push(_wfRect({ left:0, top:H-70, width:W, height:70, rx:0, ry:0, fill:'#E5E7EB' }));
  _wfGroupAndAdd(objs, 'services-grid');
}

function _applyWfSingleService(variant) {
  var W = CW, H = CH;
  var objs = [];
  objs.push(_wfRect({ left:0, top:0, width:W, height:60, rx:0, ry:0, fill:WF.bgSection }));
  objs.push(_wfRect({ left:20, top:18, width:80, height:24, fill:WF.bgCard }));

  objs.push(_wfRect({ left:0, top:65, width:W, height:180, rx:0, ry:0, fill:WF.bgSection }));
  objs.push(_wfText('Service Name', { left:60, top:100, fontSize:28, fill:WF.textDark, fontWeight:'bold' }));
  objs.push(_wfText('Detailed description of what this service includes', { left:60, top:145, fontSize:14, fill:WF.textMid }));
  objs.push(_wfRect({ left:60, top:175, width:120, height:36, fill:WF.accent, rx:6, ry:6 }));
  objs.push(_wfText('Get Quote', { left:82, top:184, fontSize:12, fill:'#FFFFFF' }));

  // Content blocks
  objs.push(_wfText('What\'s Included', { left:60, top:280, fontSize:20, fill:WF.textDark, fontWeight:'bold' }));
  for (var i = 0; i < 3; i++) {
    var by = 320 + i * 60;
    objs.push(_wfRect({ left:60, top:by, width:W-120, height:50, fill:WF.bgSection, rx:6, ry:6 }));
    objs.push(_wfText('Feature bullet ' + (i+1) + ' — Explanation text', { left:85, top:by+17, fontSize:12, fill:WF.textMid }));
  }

  // Image area
  objs.push(_wfRect({ left:60, top:520, width:W-120, height:200, fill:WF.bgCard, rx:8, ry:8 }));
  objs.push(_wfText('Service visual / showcase', { left:W/2-90, top:610, fontSize:14, fill:WF.textLight }));

  objs.push(_wfRect({ left:0, top:H-70, width:W, height:70, rx:0, ry:0, fill:'#E5E7EB' }));
  _wfGroupAndAdd(objs, 'single-service');
}

// ─── Landing Page – Corporate ────────────────────────────────

function _applyWfLpCorporate(variant) {
  var W = CW, H = CH;
  var objs = [];
  var dark = '#1E293B', surface = '#F1F5F9', mid = '#334155', light = '#94A3B8';

  // Nav (dark)
  objs.push(_wfRect({ left:0, top:0, width:W, height:64, rx:0, ry:0, fill:dark }));
  objs.push(_wfLine([0, 64, W, 64], { stroke:'#334155' }));
  objs.push(new fabric.Circle({ left:20, top:18, radius:14, fill:mid, stroke:mid, strokeWidth:1 }));
  objs.push(_wfText('Corp.', { left:52, top:24, fontSize:14, fill:'#E2E8F0', fontWeight:'bold' }));
  objs.push(_wfText('About', { left:W-280, top:25, fontSize:13, fill:light }));
  objs.push(_wfText('Services', { left:W-220, top:25, fontSize:13, fill:light }));
  objs.push(_wfText('Team', { left:W-150, top:25, fontSize:13, fill:light }));
  objs.push(_wfRect({ left:W-90, top:18, width:70, height:28, fill:WF.accent, rx:6, ry:6 }));
  objs.push(_wfText('Contact', { left:W-82, top:24, fontSize:12, fill:'#FFFFFF' }));

  if (variant === 'hero') {
    // Dark hero
    objs.push(_wfRect({ left:0, top:64, width:W, height:380, rx:0, ry:0, fill:dark }));
    objs.push(_wfText('Transform Your Business\nWith Our Solutions', { left:W/2-220, top:150, fontSize:36, fill:'#E2E8F0', fontWeight:'bold', textAlign:'center' }));
    objs.push(_wfText('Enterprise-grade technology that scales with your ambitions.', { left:W/2-220, top:250, fontSize:16, fill:light, textAlign:'center' }));
    objs.push(_wfRect({ left:W/2-80, top:300, width:160, height:44, fill:WF.accent, rx:6, ry:6 }));
    objs.push(_wfText('Get Started', { left:W/2-42, top:312, fontSize:14, fill:'#FFFFFF' }));

    // Trust bar
    objs.push(_wfRect({ left:0, top:460, width:W, height:80, rx:0, ry:0, fill:surface }));
    objs.push(_wfText('Trusted by 500+ companies worldwide', { left:W/2-140, top:475, fontSize:12, fill:light }));
    var logos = 5, lw = 80;
    var lx = (W - logos * lw - (logos-1) * 30) / 2;
    for (var i = 0; i < logos; i++) {
      objs.push(_wfRect({ left:lx + i * (lw+30), top:498, width:lw, height:30, fill:'#E2E8F0', rx:4, ry:4 }));
    }

    // Features grid
    objs.push(_wfText('Why Choose Us', { left:W/2-80, top:570, fontSize:24, fill:WF.textDark, fontWeight:'bold' }));
    var cardW = (W - 140) / 3;
    for (var j = 0; j < 3; j++) {
      var cx = 50 + j * (cardW + 20);
      objs.push(_wfRect({ left:cx, top:620, width:cardW, height:160, fill:surface, rx:8, ry:8 }));
      objs.push(_wfRect({ left:cx+20, top:640, width:40, height:40, fill:WF.accent, rx:8, ry:8 }));
      objs.push(_wfText('Feature ' + (j+1), { left:cx+20, top:698, fontSize:14, fill:WF.textDark, fontWeight:'bold' }));
      objs.push(_wfText('Description text for\nthis business feature', { left:cx+20, top:720, fontSize:11, fill:WF.textMid }));
    }
  } else {
    // Features variant with 2x2 grid
    objs.push(_wfRect({ left:0, top:64, width:W, height:120, rx:0, ry:0, fill:dark }));
    objs.push(_wfText('Our Solutions', { left:W/2-80, top:95, fontSize:28, fill:'#E2E8F0', fontWeight:'bold' }));
    objs.push(_wfText('End-to-end enterprise solutions', { left:W/2-120, top:135, fontSize:14, fill:light }));

    var cardW2 = (W - 100) / 2;
    for (var r = 0; r < 2; r++) {
      for (var c = 0; c < 2; c++) {
        var px = 30 + c * (cardW2+40), py = 210 + r * 200;
        objs.push(_wfRect({ left:px, top:py, width:cardW2, height:180, fill:surface, rx:8, ry:8 }));
        objs.push(_wfRect({ left:px+20, top:py+20, width:44, height:44, fill:WF.accent, rx:8, ry:8 }));
        objs.push(_wfText('Solution ' + (r*2+c+1), { left:px+20, top:py+80, fontSize:16, fill:WF.textDark, fontWeight:'bold' }));
        objs.push(_wfText('Comprehensive description of\nthis enterprise solution.', { left:px+20, top:py+106, fontSize:12, fill:WF.textMid }));
      }
    }
  }

  // CTA section
  objs.push(_wfRect({ left:0, top:H-200, width:W, height:120, rx:0, ry:0, fill:dark }));
  objs.push(_wfText('Ready to take the next step?', { left:W/2-140, top:H-180, fontSize:22, fill:'#E2E8F0', fontWeight:'bold' }));
  objs.push(_wfRect({ left:W/2-70, top:H-140, width:140, height:40, fill:WF.accent, rx:6, ry:6 }));
  objs.push(_wfText('Contact Us', { left:W/2-42, top:H-130, fontSize:13, fill:'#FFFFFF' }));

  // Footer
  objs.push(_wfRect({ left:0, top:H-80, width:W, height:80, rx:0, ry:0, fill:'#0F172A' }));
  objs.push(_wfText('© 2026 Corporation. All rights reserved.', { left:40, top:H-52, fontSize:11, fill:light }));

  _wfGroupAndAdd(objs, 'lp-corp-' + variant);
}

// ─── Landing Page – Restaurant ───────────────────────────────

function _applyWfLpRestaurant(variant) {
  var W = CW, H = CH;
  var objs = [];
  var dark = '#1C1917', surface = '#292524', warm = '#EA580C', cream = '#D6D3D1', mid = '#78716C';

  // Nav
  objs.push(_wfRect({ left:0, top:0, width:W, height:64, rx:0, ry:0, fill:surface }));
  objs.push(_wfText('✦ Ristorante', { left:24, top:22, fontSize:16, fill:cream, fontWeight:'bold' }));
  objs.push(_wfText('Menu', { left:W-260, top:25, fontSize:13, fill:mid }));
  objs.push(_wfText('About', { left:W-200, top:25, fontSize:13, fill:mid }));
  objs.push(_wfText('Reserve', { left:W-140, top:25, fontSize:13, fill:mid }));
  objs.push(_wfRect({ left:W-70, top:18, width:50, height:28, fill:warm, rx:14, ry:14 }));
  objs.push(_wfText('Book', { left:W-60, top:24, fontSize:11, fill:'#FFFFFF' }));

  if (variant === 'welcome') {
    // Full-width hero with dark overlay feel
    objs.push(_wfRect({ left:0, top:64, width:W, height:400, rx:0, ry:0, fill:dark }));
    objs.push(_wfText('A Taste of\nAuthentic Cuisine', { left:W/2-160, top:160, fontSize:38, fill:cream, fontWeight:'bold', textAlign:'center' }));
    objs.push(_wfText('Fresh ingredients, traditional recipes, unforgettable flavors', { left:W/2-200, top:270, fontSize:15, fill:mid, textAlign:'center' }));
    objs.push(_wfRect({ left:W/2-80, top:310, width:160, height:44, fill:warm, rx:22, ry:22 }));
    objs.push(_wfText('Reserve a Table', { left:W/2-52, top:322, fontSize:13, fill:'#FFFFFF' }));

    // Featured dishes
    objs.push(_wfRect({ left:0, top:480, width:W, height:260, rx:0, ry:0, fill:surface }));
    objs.push(_wfText('Our Specialties', { left:W/2-80, top:500, fontSize:22, fill:cream, fontWeight:'bold' }));
    var cols = 3, cw = (W - 120) / cols;
    for (var i = 0; i < cols; i++) {
      var cx = 40 + i * (cw + 20);
      objs.push(_wfRect({ left:cx, top:545, width:cw, height:170, fill:dark, rx:8, ry:8 }));
      objs.push(_wfRect({ left:cx+15, top:555, width:cw-30, height:90, fill:'#44403C', rx:6, ry:6 }));
      objs.push(_wfText('Dish ' + (i+1), { left:cx+15, top:660, fontSize:13, fill:cream, fontWeight:'bold' }));
      objs.push(_wfText('$24', { left:cx+cw-50, top:660, fontSize:13, fill:warm, fontWeight:'bold' }));
    }
  } else {
    // Menu variant
    objs.push(_wfRect({ left:0, top:64, width:W, height:100, rx:0, ry:0, fill:dark }));
    objs.push(_wfText('Our Menu', { left:W/2-60, top:90, fontSize:28, fill:cream, fontWeight:'bold' }));
    objs.push(_wfText('Freshly prepared every day', { left:W/2-90, top:128, fontSize:13, fill:mid }));

    // Menu categories
    var menuY = 190;
    var categories = ['Starters', 'Main Course', 'Desserts'];
    categories.forEach(function(cat) {
      objs.push(_wfText(cat, { left:60, top:menuY, fontSize:18, fill:cream, fontWeight:'bold' }));
      objs.push(_wfLine([60, menuY+26, W-60, menuY+26], { stroke:'#44403C', strokeWidth:1 }));
      for (var j = 0; j < 3; j++) {
        var iy = menuY + 36 + j * 44;
        objs.push(_wfText('Menu Item ' + (j+1), { left:80, top:iy, fontSize:13, fill:cream }));
        objs.push(_wfText('Fresh ingredients, house special', { left:80, top:iy+18, fontSize:10, fill:mid }));
        objs.push(_wfText('$' + (18 + j * 6), { left:W-120, top:iy+6, fontSize:14, fill:warm, fontWeight:'bold' }));
      }
      menuY += 180;
    });

    // Reservation CTA
    objs.push(_wfRect({ left:0, top:menuY + 20, width:W, height:120, rx:0, ry:0, fill:surface }));
    objs.push(_wfText('Make a Reservation', { left:W/2-90, top:menuY + 40, fontSize:20, fill:cream, fontWeight:'bold' }));
    objs.push(_wfRect({ left:W/2-70, top:menuY + 76, width:140, height:40, fill:warm, rx:20, ry:20 }));
    objs.push(_wfText('Book Now', { left:W/2-35, top:menuY + 86, fontSize:13, fill:'#FFFFFF' }));
  }

  // Footer
  objs.push(_wfRect({ left:0, top:H-80, width:W, height:80, rx:0, ry:0, fill:'#0C0A09' }));
  objs.push(_wfText('✦ Ristorante · Open Tue–Sun 12pm–10pm', { left:40, top:H-55, fontSize:11, fill:mid }));
  objs.push(_wfText('123 Culinary St · +1 (555) 000-0000', { left:40, top:H-38, fontSize:10, fill:'#57534E' }));

  _wfGroupAndAdd(objs, 'lp-rest-' + variant);
}

// ─── Landing Page – Portfolio ────────────────────────────────

function _applyWfLpPortfolio(variant) {
  var W = CW, H = CH;
  var objs = [];
  var dark = '#18181B', surface = '#27272A', light = '#71717A', bright = '#E4E4E7';

  if (variant === 'showcase') {
    // Dark portfolio
    objs.push(_wfRect({ left:0, top:0, width:W, height:H, rx:0, ry:0, fill:dark }));
    // Nav
    objs.push(_wfText('JD', { left:30, top:24, fontSize:20, fill:bright, fontWeight:'bold' }));
    objs.push(_wfText('Work', { left:W-220, top:28, fontSize:13, fill:light }));
    objs.push(_wfText('About', { left:W-160, top:28, fontSize:13, fill:light }));
    objs.push(_wfText('Contact', { left:W-100, top:28, fontSize:13, fill:light }));

    // Hero text
    objs.push(_wfText('Creative Designer\n& Developer', { left:W/2-180, top:120, fontSize:40, fill:bright, fontWeight:'bold', textAlign:'center' }));
    objs.push(_wfText('I craft digital experiences that people love.', { left:W/2-160, top:230, fontSize:16, fill:light, textAlign:'center' }));

    // Project grid 3-col
    objs.push(_wfText('Selected Work', { left:W/2-70, top:310, fontSize:18, fill:bright, fontWeight:'bold' }));
    var cols = 3, cw = (W - 100) / cols;
    for (var r = 0; r < 2; r++) {
      for (var c = 0; c < cols; c++) {
        var px = 30 + c * (cw + 20), py = 360 + r * (cw * 0.7 + 30);
        objs.push(_wfRect({ left:px, top:py, width:cw, height:cw * 0.65, fill:surface, rx:8, ry:8 }));
        objs.push(_wfText('Project ' + (r*cols+c+1), { left:px+12, top:py + cw*0.65 - 28, fontSize:12, fill:bright }));
      }
    }

    // Contact CTA
    objs.push(_wfText("Let's work together", { left:W/2-100, top:H-160, fontSize:22, fill:bright, fontWeight:'bold' }));
    objs.push(_wfText('hello@designer.com', { left:W/2-70, top:H-128, fontSize:14, fill:WF.accent }));
  } else {
    // Minimal light portfolio
    objs.push(_wfRect({ left:0, top:0, width:W, height:H, rx:0, ry:0, fill:'#FAFAFA' }));
    // Nav
    objs.push(_wfText('Jane Doe', { left:30, top:24, fontSize:16, fill:dark, fontWeight:'bold' }));
    objs.push(_wfText('Projects', { left:W-220, top:28, fontSize:13, fill:light }));
    objs.push(_wfText('Resume', { left:W-152, top:28, fontSize:13, fill:light }));
    objs.push(_wfText('Contact', { left:W-90, top:28, fontSize:13, fill:light }));

    // Big intro
    objs.push(_wfText('Designer, developer\n& problem solver.', { left:60, top:100, fontSize:36, fill:dark, fontWeight:'bold' }));
    objs.push(_wfText('Currently available for freelance work.', { left:60, top:200, fontSize:15, fill:light }));

    // 2-col project grid
    var pw = (W - 100) / 2;
    for (var i = 0; i < 4; i++) {
      var col = i % 2, row = Math.floor(i / 2);
      var ppx = 30 + col * (pw + 40), ppy = 270 + row * (pw * 0.6 + 50);
      objs.push(_wfRect({ left:ppx, top:ppy, width:pw, height:pw * 0.55, fill:'#F4F4F5', stroke:'#E4E4E7', strokeWidth:1, rx:8, ry:8 }));
      objs.push(_wfText('Project ' + (i+1), { left:ppx+12, top:ppy + pw*0.55 + 10, fontSize:14, fill:dark, fontWeight:'bold' }));
      objs.push(_wfText('Branding / Web Design', { left:ppx+12, top:ppy + pw*0.55 + 30, fontSize:11, fill:light }));
    }
  }

  // Footer
  objs.push(_wfText('© 2026 · Made with ♡', { left:W/2-60, top:H-40, fontSize:11, fill:light }));

  _wfGroupAndAdd(objs, 'lp-port-' + variant);
}



if (window.cc && cc.modules) cc.modules.register({ id: 'templates', parent: 'canvas.wireframe', title: 'Wireframe: templates', mount: function(){}, unmount: function(){} });
