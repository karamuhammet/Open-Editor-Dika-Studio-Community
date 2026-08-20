/* wireframe/elements — WF element cards + registry/add. Split from the 2652-line wireframe.js (decomposition).
   FLAT sub-module: functions stay window globals (the wireframe init + each other call them at runtime).
   Registers under canvas.wireframe. NOTE: wireframe is a paused/hidden feature — load-level verified. */

// ═════════════════════════════════════════════════════════════
// PART C: ELEMENT CATEGORY CARDS (flyout wf-elements)
// ═════════════════════════════════════════════════════════════

function renderWfElementCategoryCards() {
  var container = document.getElementById('wf-el-cat-view');
  var drillView = document.getElementById('wf-el-drill-view');
  if (!container) return;
  container.style.display = '';
  if (drillView) drillView.style.display = 'none';
  container.innerHTML = '';

  WF_ELEMENT_CATEGORIES.forEach(function(cat) {
    var card = document.createElement('div');
    card.className = 'wf-cat-card';
    var iconHtml = (typeof getIcon === 'function') ? getIcon(cat.icon, 22) : '';
    card.innerHTML =
      '<div class="wf-cat-icon">' + iconHtml + '</div>' +
      '<div class="wf-cat-name">' + cat.label + '</div>' +
      '<div class="wf-cat-desc">' + cat.desc + '</div>';
    card.addEventListener('click', function() {
      drillIntoWfElementCategory(cat.id, cat.label);
    });
    container.appendChild(card);
  });
}

function drillIntoWfElementCategory(catId, label) {
  var catView   = document.getElementById('wf-el-cat-view');
  var drillView = document.getElementById('wf-el-drill-view');
  var drillGrid = document.getElementById('wf-el-drill-grid');
  var titleEl   = document.getElementById('wf-el-sub-title');
  var backBtn   = document.getElementById('wf-el-back-btn');

  if (catView)   catView.style.display = 'none';
  if (drillView) drillView.style.display = '';
  if (titleEl)   titleEl.textContent = label;

  if (backBtn) {
    backBtn.onclick = function() {
      renderWfElementCategoryCards();
    };
  }

  if (!drillGrid) return;
  drillGrid.innerHTML = '';

  var elements = WF_ELEMENTS.filter(function(el) { return el.category === catId; });

  if (elements.length === 0) {
    drillGrid.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-dim);font-size:12px">Coming soon…</div>';
    return;
  }

  elements.forEach(function(el) {
    var item = document.createElement('div');
    item.className = 'wf-el-variant';
    item.innerHTML =
      '<div class="wf-el-preview">' +
        '<svg viewBox="0 0 240 80" xmlns="http://www.w3.org/2000/svg">' + (el.svg || '') + '</svg>' +
      '</div>' +
      '<div class="wf-el-name">' + el.name + '</div>';
    item.addEventListener('click', function() {
      addWfElement(el.id);
    });
    drillGrid.appendChild(item);
  });
}

// ═════════════════════════════════════════════════════════════
// PART D: ELEMENT REGISTRY & ADD FUNCTION
// ═════════════════════════════════════════════════════════════

var WF_ELEMENTS = [
  // ── Header ──
  { id: 'header-simple', name: 'Simple Nav', category: 'header',
    svg: '<rect x="0" y="15" width="240" height="50" rx="4" fill="#F3F4F6" stroke="#D1D5DB" stroke-width="1"/><rect x="10" y="30" width="40" height="16" rx="2" fill="#E5E7EB"/><rect x="140" y="33" width="25" height="10" rx="2" fill="#D1D5DB"/><rect x="170" y="33" width="25" height="10" rx="2" fill="#D1D5DB"/><rect x="200" y="30" width="30" height="16" rx="4" fill="#3B82F6"/>' },
  { id: 'header-centered', name: 'Centered Nav', category: 'header',
    svg: '<rect x="0" y="15" width="240" height="50" rx="4" fill="#F3F4F6" stroke="#D1D5DB" stroke-width="1"/><rect x="95" y="22" width="50" height="14" rx="2" fill="#E5E7EB"/><rect x="50" y="43" width="25" height="10" rx="2" fill="#D1D5DB"/><rect x="80" y="43" width="25" height="10" rx="2" fill="#D1D5DB"/><rect x="110" y="43" width="25" height="10" rx="2" fill="#D1D5DB"/><rect x="140" y="43" width="25" height="10" rx="2" fill="#D1D5DB"/><rect x="170" y="43" width="25" height="10" rx="2" fill="#D1D5DB"/>' },
  { id: 'header-burger', name: 'Burger Menu', category: 'header',
    svg: '<rect x="0" y="15" width="240" height="50" rx="4" fill="#F3F4F6" stroke="#D1D5DB" stroke-width="1"/><rect x="10" y="30" width="40" height="16" rx="2" fill="#E5E7EB"/><line x1="210" y1="32" x2="228" y2="32" stroke="#6B7280" stroke-width="2"/><line x1="210" y1="38" x2="228" y2="38" stroke="#6B7280" stroke-width="2"/><line x1="210" y1="44" x2="228" y2="44" stroke="#6B7280" stroke-width="2"/>' },

  // ── Footer ──
  { id: 'footer-simple', name: 'Simple Footer', category: 'footer',
    svg: '<rect x="0" y="10" width="240" height="60" rx="4" fill="#E5E7EB" stroke="#D1D5DB" stroke-width="1"/><rect x="10" y="22" width="40" height="10" rx="2" fill="#D1D5DB"/><rect x="60" y="22" width="30" height="10" rx="2" fill="#D1D5DB"/><rect x="100" y="22" width="30" height="10" rx="2" fill="#D1D5DB"/><rect x="10" y="48" width="120" height="8" rx="2" fill="#D1D5DB" opacity="0.5"/>' },
  { id: 'footer-columns', name: 'Multi-Column', category: 'footer',
    svg: '<rect x="0" y="5" width="240" height="70" rx="4" fill="#E5E7EB" stroke="#D1D5DB" stroke-width="1"/><rect x="10" y="15" width="50" height="8" rx="2" fill="#9CA3AF"/><rect x="10" y="28" width="40" height="6" rx="1" fill="#D1D5DB"/><rect x="10" y="38" width="40" height="6" rx="1" fill="#D1D5DB"/><rect x="80" y="15" width="50" height="8" rx="2" fill="#9CA3AF"/><rect x="80" y="28" width="40" height="6" rx="1" fill="#D1D5DB"/><rect x="80" y="38" width="40" height="6" rx="1" fill="#D1D5DB"/><rect x="150" y="15" width="50" height="8" rx="2" fill="#9CA3AF"/><rect x="150" y="28" width="40" height="6" rx="1" fill="#D1D5DB"/><rect x="150" y="38" width="40" height="6" rx="1" fill="#D1D5DB"/><rect x="10" y="56" width="100" height="6" rx="1" fill="#D1D5DB" opacity="0.5"/>' },

  // ── Buttons ──
  { id: 'btn-primary', name: 'Primary Button', category: 'buttons',
    svg: '<rect x="60" y="25" width="120" height="36" rx="6" fill="#3B82F6"/><text x="120" y="48" text-anchor="middle" font-size="12" fill="white" font-family="sans-serif">Primary</text>' },
  { id: 'btn-outline', name: 'Outline Button', category: 'buttons',
    svg: '<rect x="60" y="25" width="120" height="36" rx="6" fill="none" stroke="#3B82F6" stroke-width="2"/><text x="120" y="48" text-anchor="middle" font-size="12" fill="#3B82F6" font-family="sans-serif">Outline</text>' },
  { id: 'btn-pair', name: 'Button Pair', category: 'buttons',
    svg: '<rect x="20" y="25" width="95" height="36" rx="6" fill="#3B82F6"/><text x="67" y="48" text-anchor="middle" font-size="11" fill="white" font-family="sans-serif">Primary</text><rect x="125" y="25" width="95" height="36" rx="6" fill="none" stroke="#D1D5DB" stroke-width="1.5"/><text x="172" y="48" text-anchor="middle" font-size="11" fill="#6B7280" font-family="sans-serif">Secondary</text>' },

  // ── Hero ──
  { id: 'hero-left', name: 'Left-Aligned Hero', category: 'hero',
    svg: '<rect x="0" y="0" width="240" height="80" rx="4" fill="#F3F4F6" stroke="#D1D5DB" stroke-width="1"/><rect x="12" y="15" width="100" height="10" rx="2" fill="#9CA3AF"/><rect x="12" y="30" width="80" height="6" rx="2" fill="#D1D5DB"/><rect x="12" y="42" width="60" height="6" rx="2" fill="#D1D5DB"/><rect x="12" y="58" width="55" height="16" rx="4" fill="#3B82F6"/><rect x="150" y="10" width="80" height="60" rx="4" fill="#E5E7EB"/>' },
  { id: 'hero-centered', name: 'Centered Hero', category: 'hero',
    svg: '<rect x="0" y="0" width="240" height="80" rx="4" fill="#F3F4F6" stroke="#D1D5DB" stroke-width="1"/><rect x="55" y="12" width="130" height="10" rx="2" fill="#9CA3AF"/><rect x="70" y="28" width="100" height="6" rx="2" fill="#D1D5DB"/><rect x="85" y="50" width="70" height="18" rx="4" fill="#3B82F6"/>' },

  // ── FAQ ──
  { id: 'faq-accordion', name: 'Accordion FAQ', category: 'faq',
    svg: '<rect x="10" y="5" width="220" height="20" rx="3" fill="#F3F4F6" stroke="#D1D5DB" stroke-width="1"/><rect x="16" y="11" width="100" height="8" rx="2" fill="#D1D5DB"/><text x="222" y="19" font-size="12" fill="#9CA3AF" font-family="sans-serif">+</text><rect x="10" y="30" width="220" height="20" rx="3" fill="#F3F4F6" stroke="#D1D5DB" stroke-width="1"/><rect x="16" y="36" width="90" height="8" rx="2" fill="#D1D5DB"/><text x="222" y="44" font-size="12" fill="#9CA3AF" font-family="sans-serif">+</text><rect x="10" y="55" width="220" height="20" rx="3" fill="#F3F4F6" stroke="#D1D5DB" stroke-width="1"/><rect x="16" y="61" width="110" height="8" rx="2" fill="#D1D5DB"/><text x="222" y="69" font-size="12" fill="#9CA3AF" font-family="sans-serif">+</text>' },

  // ── Form ──
  { id: 'form-contact', name: 'Contact Form', category: 'form',
    svg: '<rect x="20" y="2" width="200" height="76" rx="4" fill="#F3F4F6" stroke="#D1D5DB" stroke-width="1"/><rect x="30" y="10" width="80" height="6" rx="1" fill="#D1D5DB"/><rect x="30" y="20" width="180" height="12" rx="3" fill="white" stroke="#D1D5DB" stroke-width="1"/><rect x="30" y="38" width="80" height="6" rx="1" fill="#D1D5DB"/><rect x="30" y="48" width="180" height="12" rx="3" fill="white" stroke="#D1D5DB" stroke-width="1"/><rect x="30" y="64" width="60" height="12" rx="4" fill="#3B82F6"/>' },
  { id: 'form-subscribe', name: 'Subscribe Form', category: 'form',
    svg: '<rect x="20" y="15" width="200" height="50" rx="4" fill="#F3F4F6" stroke="#D1D5DB" stroke-width="1"/><rect x="30" y="25" width="80" height="8" rx="2" fill="#9CA3AF"/><rect x="30" y="40" width="120" height="16" rx="3" fill="white" stroke="#D1D5DB" stroke-width="1"/><rect x="155" y="40" width="55" height="16" rx="3" fill="#3B82F6"/>' },

  // ── Content ──
  { id: 'content-text-img', name: 'Text + Image', category: 'content',
    svg: '<rect x="10" y="5" width="105" height="70" rx="4" fill="#F3F4F6"/><rect x="16" y="14" width="80" height="8" rx="2" fill="#9CA3AF"/><rect x="16" y="28" width="90" height="5" rx="1" fill="#D1D5DB"/><rect x="16" y="37" width="85" height="5" rx="1" fill="#D1D5DB"/><rect x="16" y="46" width="70" height="5" rx="1" fill="#D1D5DB"/><rect x="125" y="5" width="105" height="70" rx="4" fill="#E5E7EB"/>' },
  { id: 'content-stats', name: 'Stats Row', category: 'content',
    svg: '<rect x="5" y="15" width="55" height="50" rx="4" fill="#F3F4F6"/><text x="32" y="38" text-anchor="middle" font-size="14" fill="#374151" font-family="sans-serif" font-weight="bold">250+</text><rect x="10" y="48" width="40" height="6" rx="1" fill="#D1D5DB"/><rect x="65" y="15" width="55" height="50" rx="4" fill="#F3F4F6"/><text x="92" y="38" text-anchor="middle" font-size="14" fill="#374151" font-family="sans-serif" font-weight="bold">50K</text><rect x="70" y="48" width="40" height="6" rx="1" fill="#D1D5DB"/><rect x="125" y="15" width="55" height="50" rx="4" fill="#F3F4F6"/><text x="152" y="38" text-anchor="middle" font-size="14" fill="#374151" font-family="sans-serif" font-weight="bold">99%</text><rect x="130" y="48" width="40" height="6" rx="1" fill="#D1D5DB"/><rect x="185" y="15" width="50" height="50" rx="4" fill="#F3F4F6"/><text x="210" y="38" text-anchor="middle" font-size="14" fill="#374151" font-family="sans-serif" font-weight="bold">24/7</text><rect x="190" y="48" width="40" height="6" rx="1" fill="#D1D5DB"/>' },

  // ── Gallery ──
  { id: 'gallery-grid', name: '3-Column Grid', category: 'gallery',
    svg: '<rect x="5" y="5" width="72" height="32" rx="3" fill="#E5E7EB"/><rect x="83" y="5" width="72" height="32" rx="3" fill="#E5E7EB"/><rect x="161" y="5" width="72" height="32" rx="3" fill="#E5E7EB"/><rect x="5" y="43" width="72" height="32" rx="3" fill="#E5E7EB"/><rect x="83" y="43" width="72" height="32" rx="3" fill="#E5E7EB"/><rect x="161" y="43" width="72" height="32" rx="3" fill="#E5E7EB"/>' },
  { id: 'gallery-masonry', name: 'Masonry', category: 'gallery',
    svg: '<rect x="5" y="5" width="72" height="40" rx="3" fill="#E5E7EB"/><rect x="83" y="5" width="72" height="25" rx="3" fill="#E5E7EB"/><rect x="161" y="5" width="72" height="50" rx="3" fill="#E5E7EB"/><rect x="5" y="50" width="72" height="25" rx="3" fill="#E5E7EB"/><rect x="83" y="35" width="72" height="40" rx="3" fill="#E5E7EB"/><rect x="161" y="60" width="72" height="15" rx="3" fill="#E5E7EB"/>' },

  // ── Features ──
  { id: 'features-3col', name: '3-Column Cards', category: 'features',
    svg: '<rect x="5" y="5" width="72" height="70" rx="4" fill="#F3F4F6" stroke="#D1D5DB" stroke-width="1"/><circle cx="41" cy="22" r="8" fill="#E5E7EB"/><rect x="15" y="36" width="50" height="6" rx="1" fill="#9CA3AF"/><rect x="12" y="48" width="56" height="4" rx="1" fill="#D1D5DB"/><rect x="83" y="5" width="72" height="70" rx="4" fill="#F3F4F6" stroke="#D1D5DB" stroke-width="1"/><circle cx="119" cy="22" r="8" fill="#E5E7EB"/><rect x="93" y="36" width="50" height="6" rx="1" fill="#9CA3AF"/><rect x="90" y="48" width="56" height="4" rx="1" fill="#D1D5DB"/><rect x="161" y="5" width="72" height="70" rx="4" fill="#F3F4F6" stroke="#D1D5DB" stroke-width="1"/><circle cx="197" cy="22" r="8" fill="#E5E7EB"/><rect x="171" y="36" width="50" height="6" rx="1" fill="#9CA3AF"/><rect x="168" y="48" width="56" height="4" rx="1" fill="#D1D5DB"/>' },
  { id: 'features-list', name: 'Feature List', category: 'features',
    svg: '<circle cx="20" cy="16" r="8" fill="#E5E7EB"/><rect x="36" y="10" width="80" height="6" rx="1" fill="#9CA3AF"/><rect x="36" y="20" width="180" height="4" rx="1" fill="#D1D5DB"/><circle cx="20" cy="42" r="8" fill="#E5E7EB"/><rect x="36" y="36" width="80" height="6" rx="1" fill="#9CA3AF"/><rect x="36" y="46" width="180" height="4" rx="1" fill="#D1D5DB"/><circle cx="20" cy="68" r="8" fill="#E5E7EB"/><rect x="36" y="62" width="80" height="6" rx="1" fill="#9CA3AF"/><rect x="36" y="72" width="180" height="4" rx="1" fill="#D1D5DB"/>' },

  // ── Pricing ──
  { id: 'pricing-3col', name: '3-Tier Pricing', category: 'pricing',
    svg: '<rect x="5" y="2" width="72" height="76" rx="4" fill="#F3F4F6" stroke="#D1D5DB" stroke-width="1"/><rect x="15" y="10" width="50" height="6" rx="1" fill="#9CA3AF"/><text x="41" y="30" text-anchor="middle" font-size="11" fill="#374151" font-family="sans-serif" font-weight="bold">$19</text><rect x="15" y="38" width="50" height="4" rx="1" fill="#D1D5DB"/><rect x="15" y="46" width="50" height="4" rx="1" fill="#D1D5DB"/><rect x="15" y="58" width="50" height="12" rx="3" fill="#3B82F6"/><rect x="83" y="2" width="72" height="76" rx="4" fill="#F3F4F6" stroke="#3B82F6" stroke-width="2"/><rect x="93" y="10" width="50" height="6" rx="1" fill="#9CA3AF"/><text x="119" y="30" text-anchor="middle" font-size="11" fill="#374151" font-family="sans-serif" font-weight="bold">$49</text><rect x="93" y="38" width="50" height="4" rx="1" fill="#D1D5DB"/><rect x="93" y="46" width="50" height="4" rx="1" fill="#D1D5DB"/><rect x="93" y="58" width="50" height="12" rx="3" fill="#3B82F6"/><rect x="161" y="2" width="72" height="76" rx="4" fill="#F3F4F6" stroke="#D1D5DB" stroke-width="1"/><rect x="171" y="10" width="50" height="6" rx="1" fill="#9CA3AF"/><text x="197" y="30" text-anchor="middle" font-size="11" fill="#374151" font-family="sans-serif" font-weight="bold">$99</text><rect x="171" y="38" width="50" height="4" rx="1" fill="#D1D5DB"/><rect x="171" y="46" width="50" height="4" rx="1" fill="#D1D5DB"/><rect x="171" y="58" width="50" height="12" rx="3" fill="#3B82F6"/>' }
];

// ─── Add Element to Canvas (GROUPED with auto-names) ────────

// Map element IDs to friendly group names
var WF_ELEMENT_NAMES = {
  'header-simple':    'Header – Simple Nav',
  'header-centered':  'Header – Centered',
  'header-burger':    'Header – Burger Menu',
  'footer-simple':    'Footer – Simple',
  'footer-columns':   'Footer – Columns',
  'btn-primary':      'Button – Primary',
  'btn-outline':      'Button – Outline',
  'btn-pair':         'Button – Pair',
  'hero-left':        'Hero – Left Aligned',
  'hero-centered':    'Hero – Centered',
  'faq-accordion':    'FAQ – Accordion',
  'form-contact':     'Form – Contact',
  'form-subscribe':   'Form – Subscribe',
  'content-text-img': 'Content – Text & Image',
  'content-stats':    'Content – Stats Row',
  'gallery-grid':     'Gallery – Grid',
  'gallery-masonry':  'Gallery – Masonry',
  'features-3col':    'Features – 3 Column',
  'features-list':    'Features – List',
  'pricing-3col':     'Pricing – 3 Tier'
};

function addWfElement(elementId) {
  var el = WF_ELEMENTS.find(function(e) { return e.id === elementId; });
  if (!el) return;

  var builder = WF_ELEMENT_BUILDERS[elementId];
  if (!builder) return;

  var objs = builder();
  if (!objs || !objs.length) return;

  _wfStamp(objs, el.category);

  var group = new fabric.Group(objs, {
    left: objs[0].left || 0,
    top: objs[0].top || 0,
    subTargetCheck: true
  });
  group._isWireframe = true;
  group._wfType = el.category;
  group._groupName = WF_ELEMENT_NAMES[elementId] || el.name;

  // Apply active brand set to newly added element
  if (typeof getActiveBrandSet === 'function') {
    var _brand = getActiveBrandSet();
    if (_brand) {
      group._objects.forEach(function(child) {
        if (child.type === 'i-text' || child.type === 'text' || child.type === 'textbox') {
          if (child.fill !== '#FFFFFF' && child.fill !== 'white') child.set('fill', _brand.colors.text);
          if (_brand.font.family) child.set('fontFamily', _brand.font.family);
          if (child.fontSize >= 20) child.set('fontSize', _brand.font.hSize);
          else child.set('fontSize', _brand.font.size);
        }
        if (child.type === 'rect' && child.fill === '#3B82F6') child.set('fill', _brand.colors.primary);
      });
      group.dirty = true;
    }
  }

  canvas.add(group);
  canvas.setActiveObject(group);
  canvas.renderAll();
  if (typeof snap === 'function') snap();
  if (typeof playSound === 'function') playSound('add');
}

// ─── Element Builder Functions ───────────────────────────────

var WF_ELEMENT_BUILDERS = {

  // ── Headers ──
  'header-simple': function() {
    var W = CW, h = 64;
    return [
      _wfRect({ left:0, top:0, width:W, height:h, rx:0, ry:0, fill:'#FFFFFF', stroke:WF.border, strokeWidth:0 }),
      _wfLine([0, h-1, W, h-1], { stroke:'#E2E8F0' }),
      // Logo area
      new fabric.Circle({ left:16, top:h/2-14, radius:14, fill:WF.bgSection, stroke:WF.border, strokeWidth:1 }),
      _wfText('A', { left:24, top:h/2-8, fontSize:13, fill:WF.accent, fontWeight:'bold' }),
      _wfText('Acme Inc', { left:50, top:h/2-8, fontSize:14, fill:WF.textDark, fontWeight:'bold' }),
      // Nav links
      _wfText('Products', { left:W-340, top:h/2-7, fontSize:13, fill:WF.textMid }),
      _wfText('Solutions', { left:W-268, top:h/2-7, fontSize:13, fill:WF.textMid }),
      _wfText('Pricing', { left:W-196, top:h/2-7, fontSize:13, fill:WF.textMid }),
      _wfText('Docs', { left:W-136, top:h/2-7, fontSize:13, fill:WF.textMid }),
      // CTA button
      _wfRect({ left:W-84, top:h/2-16, width:68, height:32, fill:WF.accent, rx:6, ry:6 }),
      _wfText('Sign Up', { left:W-76, top:h/2-7, fontSize:12, fill:'#FFFFFF', fontWeight:'500' })
    ];
  },

  'header-centered': function() {
    var W = CW, h = 72, objs = [];
    objs.push(_wfRect({ left:0, top:0, width:W, height:h, rx:0, ry:0, fill:'#FFFFFF' }));
    objs.push(_wfLine([0, h-1, W, h-1], { stroke:'#E2E8F0' }));
    // Centered logo
    objs.push(new fabric.Circle({ left:W/2-14, top:10, radius:14, fill:WF.bgSection, stroke:WF.border, strokeWidth:1 }));
    objs.push(_wfText('✦', { left:W/2-6, top:14, fontSize:12, fill:WF.accent }));
    // Nav links centered
    var links = ['Home','Features','Pricing','About','Contact'];
    var totalW = links.length * 72;
    var startX = W/2 - totalW/2;
    for (var i = 0; i < links.length; i++) {
      var isActive = i === 0;
      objs.push(_wfText(links[i], { left:startX + i*72, top:46, fontSize:13, fill: isActive ? WF.textDark : WF.textMid, fontWeight: isActive ? 'bold' : 'normal' }));
    }
    // Active indicator line
    objs.push(_wfLine([startX, h-2, startX+36, h-2], { stroke:WF.accent, strokeWidth:2 }));
    return objs;
  },

  'header-burger': function() {
    var W = CW, h = 64;
    return [
      _wfRect({ left:0, top:0, width:W, height:h, rx:0, ry:0, fill:'#FFFFFF' }),
      _wfLine([0, h-1, W, h-1], { stroke:'#E2E8F0' }),
      // Logo
      new fabric.Circle({ left:16, top:h/2-14, radius:14, fill:WF.bgSection, stroke:WF.border, strokeWidth:1 }),
      _wfText('✦', { left:24, top:h/2-8, fontSize:12, fill:WF.accent }),
      _wfText('Brand', { left:50, top:h/2-8, fontSize:14, fill:WF.textDark, fontWeight:'bold' }),
      // Search bar placeholder
      _wfRect({ left:W/2-100, top:h/2-14, width:200, height:28, fill:WF.bgSection, stroke:WF.border, rx:6, ry:6 }),
      _wfText('Search...', { left:W/2-88, top:h/2-7, fontSize:12, fill:WF.textLight }),
      // Hamburger icon (3 lines)
      _wfRect({ left:W-48, top:h/2-12, width:32, height:24, fill:'transparent', stroke:WF.border, rx:6, ry:6 }),
      _wfLine([W-42, h/2-5, W-22, h/2-5], { stroke:WF.textMid, strokeWidth:1.5 }),
      _wfLine([W-42, h/2, W-22, h/2], { stroke:WF.textMid, strokeWidth:1.5 }),
      _wfLine([W-42, h/2+5, W-22, h/2+5], { stroke:WF.textMid, strokeWidth:1.5 })
    ];
  },

  // ── Footers ──
  'footer-simple': function() {
    var W = CW, h = 80, y0 = 0, objs = [];
    objs.push(_wfRect({ left:0, top:y0, width:W, height:h, rx:0, ry:0, fill:WF.bgSection }));
    objs.push(_wfLine([0, y0, W, y0], { stroke:'#E2E8F0' }));
    // Left: copyright
    objs.push(_wfText('© 2025 Acme Inc. All rights reserved.', { left:24, top:y0+h/2-7, fontSize:12, fill:WF.textMid }));
    // Right: links with dots
    var links = ['Privacy Policy','Terms of Service','Cookie Settings'];
    var rx = W - 24;
    for (var i = links.length - 1; i >= 0; i--) {
      var tw = links[i].length * 6.5;
      rx -= tw;
      objs.push(_wfText(links[i], { left:rx, top:y0+h/2-7, fontSize:12, fill:WF.textMid }));
      if (i > 0) {
        rx -= 16;
        objs.push(_wfText('·', { left:rx+4, top:y0+h/2-8, fontSize:14, fill:WF.textLight }));
      }
    }
    return objs;
  },

  'footer-columns': function() {
    var W = CW, h = 200, y0 = 0, objs = [];
    objs.push(_wfRect({ left:0, top:y0, width:W, height:h, rx:0, ry:0, fill:WF.bgSection }));
    objs.push(_wfLine([0, y0, W, y0], { stroke:'#E2E8F0' }));
    // Brand column
    objs.push(new fabric.Circle({ left:24, top:y0+24, radius:12, fill:WF.bgCard, stroke:WF.border, strokeWidth:1 }));
    objs.push(_wfText('✦', { left:30, top:y0+28, fontSize:11, fill:WF.accent }));
    objs.push(_wfText('Acme Inc', { left:54, top:y0+28, fontSize:13, fill:WF.textDark, fontWeight:'bold' }));
    objs.push(_wfText('Building the future of design\ntools for everyone.', { left:24, top:y0+54, fontSize:11, fill:WF.textMid }));
    // Link columns
    var cols = [
      { title:'Product', links:['Features','Pricing','Changelog','Docs'] },
      { title:'Company', links:['About','Blog','Careers','Press'] },
      { title:'Legal', links:['Privacy','Terms','Security','Status'] }
    ];
    var colW = 120, startCol = W - cols.length * colW - 24;
    for (var c = 0; c < cols.length; c++) {
      var cx = startCol + c * colW;
      objs.push(_wfText(cols[c].title, { left:cx, top:y0+24, fontSize:12, fill:WF.textDark, fontWeight:'bold' }));
      for (var li = 0; li < cols[c].links.length; li++) {
        objs.push(_wfText(cols[c].links[li], { left:cx, top:y0+48 + li*22, fontSize:12, fill:WF.textMid }));
      }
    }
    // Bottom bar
    objs.push(_wfLine([24, y0+h-36, W-24, y0+h-36], { stroke:WF.border }));
    objs.push(_wfText('© 2025 Acme Inc. All rights reserved.', { left:24, top:y0+h-26, fontSize:11, fill:WF.textLight }));
    // Social icons (circles)
    for (var s = 0; s < 4; s++) {
      objs.push(new fabric.Circle({ left:W-24-s*30, top:y0+h-30, radius:10, fill:'transparent', stroke:WF.border, strokeWidth:1 }));
    }
    return objs;
  },

  // ── Buttons ──
  'btn-primary': function() {
    var bw = 180, bh = 44, x = CW/2 - bw/2, y = CH/2 - bh/2;
    return [
      // Shadow layer
      _wfRect({ left:x+1, top:y+2, width:bw, height:bh, fill:'#DBEAFE', rx:8, ry:8, opacity:0.6 }),
      // Button
      _wfRect({ left:x, top:y, width:bw, height:bh, fill:WF.accent, rx:8, ry:8 }),
      _wfText('Get Started →', { left:x+bw/2-48, top:y+13, fontSize:14, fill:'#FFFFFF', fontWeight:'bold' })
    ];
  },

  'btn-outline': function() {
    var bw = 180, bh = 44, x = CW/2 - bw/2, y = CH/2 - bh/2;
    return [
      _wfRect({ left:x, top:y, width:bw, height:bh, fill:'#FFFFFF', stroke:WF.border, strokeWidth:1.5, rx:8, ry:8 }),
      _wfText('Learn More', { left:x+bw/2-40, top:y+13, fontSize:14, fill:WF.textDark, fontWeight:'500' })
    ];
  },

  'btn-pair': function() {
    var bw = 160, bh = 44, gap = 12;
    var totalW = bw*2 + gap;
    var x = CW/2 - totalW/2, y = CH/2 - bh/2;
    return [
      // Primary shadow
      _wfRect({ left:x+1, top:y+2, width:bw, height:bh, fill:'#DBEAFE', rx:8, ry:8, opacity:0.6 }),
      // Primary button
      _wfRect({ left:x, top:y, width:bw, height:bh, fill:WF.accent, rx:8, ry:8 }),
      _wfText('Get Started', { left:x+bw/2-40, top:y+13, fontSize:14, fill:'#FFFFFF', fontWeight:'bold' }),
      // Secondary button (outline)
      _wfRect({ left:x+bw+gap, top:y, width:bw, height:bh, fill:'#FFFFFF', stroke:WF.border, strokeWidth:1.5, rx:8, ry:8 }),
      _wfText('Learn More', { left:x+bw+gap+bw/2-40, top:y+13, fontSize:14, fill:WF.textDark, fontWeight:'500' })
    ];
  },

  // ── Hero Sections ──
  'hero-left': function() {
    var W = CW, pad = 48;
    return [
      // Background
      _wfRect({ left:0, top:60, width:W, height:400, rx:0, ry:0, fill:WF.bgSection }),
      // Badge
      _wfRect({ left:pad, top:100, width:130, height:26, fill:'#EFF6FF', stroke:'#BFDBFE', rx:13, ry:13 }),
      _wfText('✦  New Release', { left:pad+12, top:105, fontSize:11, fill:WF.accent, fontWeight:'500' }),
      // Headline
      _wfText('Build beautiful\nproducts, faster.', { left:pad, top:140, fontSize:36, fill:WF.textDark, fontWeight:'bold', lineHeight:1.15 }),
      // Subtitle
      _wfText('A modern toolkit for designers and developers.\nShip your next idea in record time.', { left:pad, top:228, fontSize:14, fill:WF.textMid, lineHeight:1.5 }),
      // CTA pair
      _wfRect({ left:pad+1, top:282, width:140, height:42, fill:'#DBEAFE', rx:8, ry:8, opacity:0.6 }),
      _wfRect({ left:pad, top:280, width:140, height:42, fill:WF.accent, rx:8, ry:8 }),
      _wfText('Get Started →', { left:pad+22, top:291, fontSize:14, fill:'#FFFFFF', fontWeight:'bold' }),
      _wfRect({ left:pad+152, top:280, width:120, height:42, fill:'#FFFFFF', stroke:WF.border, rx:8, ry:8 }),
      _wfText('Live Demo', { left:pad+172, top:291, fontSize:14, fill:WF.textDark }),
      // Image placeholder with icon
      _wfRect({ left:W-340-pad, top:90, width:340, height:320, fill:'#FFFFFF', stroke:WF.border, rx:12, ry:12 }),
      _wfRect({ left:W-340-pad+20, top:110, width:300, height:260, fill:WF.bgSection, rx:8, ry:8 }),
      _wfText('📷', { left:W-340-pad+150, top:220, fontSize:28, fill:WF.textLight }),
      _wfText('Hero Image', { left:W-340-pad+130, top:260, fontSize:12, fill:WF.textLight })
    ];
  },

  'hero-centered': function() {
    var W = CW, cy = 80;
    return [
      _wfRect({ left:0, top:60, width:W, height:360, rx:0, ry:0, fill:WF.bgSection }),
      // Badge
      _wfRect({ left:W/2-70, top:cy+20, width:140, height:26, fill:'#EFF6FF', stroke:'#BFDBFE', rx:13, ry:13 }),
      _wfText('🚀  Now Available', { left:W/2-52, top:cy+25, fontSize:11, fill:WF.accent, fontWeight:'500' }),
      // Big headline
      _wfText('The Modern Way to\nBuild for the Web', { left:W/2-160, top:cy+62, fontSize:34, fill:WF.textDark, fontWeight:'bold', textAlign:'center' }),
      // Subtitle
      _wfText('Everything you need to create stunning interfaces.\nOpen source. Customizable. Accessible.', { left:W/2-178, top:cy+142, fontSize:14, fill:WF.textMid, textAlign:'center', lineHeight:1.5 }),
      // CTA pair
      _wfRect({ left:W/2-150+1, top:cy+198, width:140, height:42, fill:'#DBEAFE', rx:8, ry:8, opacity:0.6 }),
      _wfRect({ left:W/2-150, top:cy+196, width:140, height:42, fill:WF.accent, rx:8, ry:8 }),
      _wfText('Get Started', { left:W/2-120, top:cy+207, fontSize:14, fill:'#FFFFFF', fontWeight:'bold' }),
      _wfRect({ left:W/2+2, top:cy+196, width:140, height:42, fill:'#FFFFFF', stroke:WF.border, rx:8, ry:8 }),
      _wfText('GitHub →', { left:W/2+38, top:cy+207, fontSize:14, fill:WF.textDark }),
      // Trust bar
      _wfText('Trusted by 10,000+ developers worldwide', { left:W/2-126, top:cy+260, fontSize:11, fill:WF.textLight })
    ];
  },

  // ── FAQ ──
  'faq-accordion': function() {
    var W = CW - 120, pad = 60, objs = [];
    // Section header
    objs.push(_wfText('Frequently Asked\nQuestions', { left:pad, top:180, fontSize:28, fill:WF.textDark, fontWeight:'bold', lineHeight:1.2 }));
    objs.push(_wfText('Find answers to common questions about\nour product and services.', { left:pad, top:240, fontSize:13, fill:WF.textMid, lineHeight:1.5 }));
    // FAQ items
    var questions = [
      { q:'What payment methods do you accept?', open:true, a:'We accept all major credit cards, PayPal, and wire transfers.' },
      { q:'Can I cancel my subscription anytime?', open:false },
      { q:'Do you offer a free trial?', open:false },
      { q:'How do I contact support?', open:false }
    ];
    var yy = 290;
    for (var i = 0; i < questions.length; i++) {
      var itemH = questions[i].open ? 72 : 46;
      objs.push(_wfRect({ left:pad, top:yy, width:W, height:itemH, fill:'#FFFFFF', stroke:WF.border, rx:8, ry:8 }));
      objs.push(_wfText(questions[i].q, { left:pad+16, top:yy+14, fontSize:13, fill:WF.textDark, fontWeight:'bold' }));
      objs.push(_wfText(questions[i].open ? '−' : '+', { left:pad+W-28, top:yy+12, fontSize:16, fill:WF.textMid }));
      if (questions[i].open) {
        objs.push(_wfText(questions[i].a, { left:pad+16, top:yy+40, fontSize:12, fill:WF.textMid }));
      }
      yy += itemH + 8;
    }
    return objs;
  },

  // ── Forms ──
  'form-contact': function() {
    var fw = 420, x = CW/2 - fw/2, y = 160, objs = [];
    // Card container
    objs.push(_wfRect({ left:x+2, top:y+3, width:fw, height:366, fill:'#E2E8F0', rx:12, ry:12, opacity:0.4 }));
    objs.push(_wfRect({ left:x, top:y, width:fw, height:366, fill:'#FFFFFF', stroke:WF.border, rx:12, ry:12 }));
    // Header
    objs.push(_wfText('Get in Touch', { left:x+24, top:y+24, fontSize:20, fill:WF.textDark, fontWeight:'bold' }));
    objs.push(_wfText('Fill out the form below and we\'ll get back to you.', { left:x+24, top:y+50, fontSize:12, fill:WF.textMid }));
    // Fields
    var fields = [
      { label:'Full Name', placeholder:'John Doe' },
      { label:'Email Address', placeholder:'john@example.com' },
      { label:'Message', placeholder:'How can we help?', tall:true }
    ];
    var fy = y + 80;
    for (var i = 0; i < fields.length; i++) {
      objs.push(_wfText(fields[i].label, { left:x+24, top:fy, fontSize:12, fill:WF.textDark, fontWeight:'500' }));
      var fh = fields[i].tall ? 56 : 36;
      objs.push(_wfRect({ left:x+24, top:fy+18, width:fw-48, height:fh, fill:'#FFFFFF', stroke:WF.border, rx:6, ry:6 }));
      objs.push(_wfText(fields[i].placeholder, { left:x+36, top:fy+18+(fh/2-7), fontSize:12, fill:WF.textLight }));
      fy += fh + 28;
    }
    // Submit button
    objs.push(_wfRect({ left:x+24, top:y+316, width:fw-48, height:40, fill:WF.accent, rx:8, ry:8 }));
    objs.push(_wfText('Send Message →', { left:x+fw/2-48, top:y+327, fontSize:13, fill:'#FFFFFF', fontWeight:'bold' }));
    return objs;
  },

  'form-subscribe': function() {
    var fw = 480, x = CW/2 - fw/2, y = CH/2-70, objs = [];
    // Card
    objs.push(_wfRect({ left:x+2, top:y+3, width:fw, height:140, fill:'#E2E8F0', rx:12, ry:12, opacity:0.4 }));
    objs.push(_wfRect({ left:x, top:y, width:fw, height:140, fill:'#FFFFFF', stroke:WF.border, rx:12, ry:12 }));
    // Icon
    objs.push(_wfText('📬', { left:x+24, top:y+20, fontSize:22 }));
    // Title + subtitle
    objs.push(_wfText('Stay up to date', { left:x+56, top:y+20, fontSize:16, fill:WF.textDark, fontWeight:'bold' }));
    objs.push(_wfText('Get notified about new features and updates. No spam.', { left:x+56, top:y+42, fontSize:12, fill:WF.textMid }));
    // Input + button row
    objs.push(_wfRect({ left:x+24, top:y+80, width:fw-180, height:38, fill:'#FFFFFF', stroke:WF.border, rx:6, ry:6 }));
    objs.push(_wfText('you@example.com', { left:x+36, top:y+90, fontSize:12, fill:WF.textLight }));
    objs.push(_wfRect({ left:x+fw-144, top:y+80, width:120, height:38, fill:WF.accent, rx:6, ry:6 }));
    objs.push(_wfText('Subscribe', { left:x+fw-124, top:y+90, fontSize:13, fill:'#FFFFFF', fontWeight:'bold' }));
    return objs;
  },

  // ── Content ──
  'content-text-img': function() {
    var W = CW - 96, hw = (W - 24) / 2, pad = 48, objs = [];
    // Text side card
    objs.push(_wfRect({ left:pad, top:180, width:hw, height:264, fill:'#FFFFFF', stroke:WF.border, rx:12, ry:12 }));
    // Badge
    objs.push(_wfRect({ left:pad+20, top:200, width:80, height:22, fill:'#EFF6FF', stroke:'#BFDBFE', rx:11, ry:11 }));
    objs.push(_wfText('Feature', { left:pad+38, top:204, fontSize:11, fill:WF.accent, fontWeight:'500' }));
    // Title
    objs.push(_wfText('Powerful Analytics\nDashboard', { left:pad+20, top:234, fontSize:22, fill:WF.textDark, fontWeight:'bold', lineHeight:1.2 }));
    // Description
    objs.push(_wfText('Track your key metrics in real-time\nwith our intuitive dashboard. Get\nactionable insights instantly.', { left:pad+20, top:290, fontSize:12, fill:WF.textMid, lineHeight:1.5 }));
    // CTA link
    objs.push(_wfText('Learn more →', { left:pad+20, top:358, fontSize:13, fill:WF.accent, fontWeight:'500' }));
    // Image side
    objs.push(_wfRect({ left:pad+hw+24, top:180, width:hw, height:264, fill:WF.bgSection, stroke:WF.border, rx:12, ry:12 }));
    objs.push(_wfText('📊', { left:pad+hw+24+hw/2-14, top:280, fontSize:32, fill:WF.textLight }));
    objs.push(_wfText('Dashboard Preview', { left:pad+hw+24+hw/2-50, top:324, fontSize:12, fill:WF.textLight }));
    return objs;
  },

  'content-stats': function() {
    var W = CW - 96, x = 48, y = CH/2-60, objs = [];
    // Container
    objs.push(_wfRect({ left:x+2, top:y+3, width:W, height:120, fill:'#E2E8F0', rx:12, ry:12, opacity:0.4 }));
    objs.push(_wfRect({ left:x, top:y, width:W, height:120, fill:'#FFFFFF', stroke:WF.border, rx:12, ry:12 }));
    var stats = [
      { val:'10K+', label:'Active Users', icon:'👥' },
      { val:'99.9%', label:'Uptime SLA', icon:'⚡' },
      { val:'150+', label:'Integrations', icon:'🔗' },
      { val:'24/7', label:'Support', icon:'💬' }
    ];
    var cw = W / 4;
    for (var i = 0; i < 4; i++) {
      var cx = x + cw * i + cw/2;
      objs.push(_wfText(stats[i].icon, { left:cx-8, top:y+18, fontSize:16 }));
      objs.push(_wfText(stats[i].val, { left:cx-24, top:y+44, fontSize:24, fill:WF.textDark, fontWeight:'bold' }));
      objs.push(_wfText(stats[i].label, { left:cx-32, top:y+76, fontSize:11, fill:WF.textMid }));
      // Vertical separator
      if (i < 3) objs.push(_wfLine([x + cw*(i+1), y+20, x + cw*(i+1), y+100], { stroke:WF.border }));
    }
    return objs;
  },

  // ── Gallery ──
  'gallery-grid': function() {
    var W = CW - 96, cols = 3, rows = 2, gap = 16, pad = 48, objs = [];
    var cw = (W - (cols-1)*gap) / cols;
    var ch = 150;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        objs.push(_wfRect({ left:pad+c*(cw+gap), top:200+r*(ch+gap), width:cw, height:ch, fill:'#FFFFFF', stroke:WF.border, rx:10, ry:10 }));
        // Inner image area
        objs.push(_wfRect({ left:pad+c*(cw+gap)+8, top:200+r*(ch+gap)+8, width:cw-16, height:ch-44, fill:WF.bgSection, rx:6, ry:6 }));
        // Caption
        objs.push(_wfText('Image ' + (r*cols+c+1), { left:pad+c*(cw+gap)+8, top:200+r*(ch+gap)+ch-30, fontSize:11, fill:WF.textDark, fontWeight:'500' }));
        objs.push(_wfText('Description', { left:pad+c*(cw+gap)+8, top:200+r*(ch+gap)+ch-16, fontSize:10, fill:WF.textLight }));
      }
    }
    return objs;
  },

  'gallery-masonry': function() {
    var W = CW - 96, cols = 3, gap = 12, pad = 48, objs = [];
    var cw = (W - (cols-1)*gap) / cols;
    var heights = [[180,110],[120,170],[160,130]];
    for (var c = 0; c < cols; c++) {
      var y = 200;
      for (var r = 0; r < 2; r++) {
        var h = heights[c][r];
        objs.push(_wfRect({ left:pad+c*(cw+gap), top:y, width:cw, height:h, fill:'#FFFFFF', stroke:WF.border, rx:10, ry:10 }));
        objs.push(_wfRect({ left:pad+c*(cw+gap)+6, top:y+6, width:cw-12, height:h-12, fill:WF.bgSection, rx:6, ry:6 }));
        y += h + gap;
      }
    }
    return objs;
  },

  // ── Features ──
  'features-3col': function() {
    var W = CW - 96, cols = 3, gap = 16, pad = 48, objs = [];
    var cw = (W - (cols-1)*gap) / cols;
    var features = [
      { icon:'⚡', title:'Lightning Fast', desc:'Built for performance.\nRenders in milliseconds.' },
      { icon:'🎨', title:'Fully Customizable', desc:'Every component is\ndesigned to be tweaked.' },
      { icon:'🔒', title:'Secure by Default', desc:'Enterprise-grade security\nout of the box.' }
    ];
    for (var c = 0; c < cols; c++) {
      var cx = pad + c * (cw + gap);
      // Card with shadow
      objs.push(_wfRect({ left:cx+2, top:203, width:cw, height:200, fill:'#E2E8F0', rx:12, ry:12, opacity:0.4 }));
      objs.push(_wfRect({ left:cx, top:200, width:cw, height:200, fill:'#FFFFFF', stroke:WF.border, rx:12, ry:12 }));
      // Icon circle
      objs.push(_wfRect({ left:cx+20, top:222, width:40, height:40, fill:WF.bgSection, stroke:WF.border, rx:10, ry:10 }));
      objs.push(_wfText(features[c].icon, { left:cx+30, top:230, fontSize:18 }));
      // Title
      objs.push(_wfText(features[c].title, { left:cx+20, top:278, fontSize:15, fill:WF.textDark, fontWeight:'bold' }));
      // Description
      objs.push(_wfText(features[c].desc, { left:cx+20, top:302, fontSize:12, fill:WF.textMid, lineHeight:1.5 }));
      // Link
      objs.push(_wfText('Learn more →', { left:cx+20, top:354, fontSize:12, fill:WF.accent, fontWeight:'500' }));
    }
    return objs;
  },

  'features-list': function() {
    var W = CW - 96, pad = 48, objs = [];
    var items = [
      { icon:'📊', title:'Advanced Analytics', desc:'Track every metric that matters to your business and team.' },
      { icon:'🔄', title:'Seamless Integration', desc:'Connect with your favorite tools in just a few clicks.' },
      { icon:'🛡️', title:'Enterprise Security', desc:'SOC 2 compliant with end-to-end encryption for all data.' },
      { icon:'🚀', title:'Auto Scaling', desc:'Infrastructure that grows with you, from startup to enterprise.' }
    ];
    for (var i = 0; i < items.length; i++) {
      var y = 180 + i * 72;
      // Icon box
      objs.push(_wfRect({ left:pad, top:y, width:44, height:44, fill:WF.bgSection, stroke:WF.border, rx:10, ry:10 }));
      objs.push(_wfText(items[i].icon, { left:pad+12, top:y+12, fontSize:16 }));
      // Text
      objs.push(_wfText(items[i].title, { left:pad+60, top:y+4, fontSize:14, fill:WF.textDark, fontWeight:'bold' }));
      objs.push(_wfText(items[i].desc, { left:pad+60, top:y+24, fontSize:12, fill:WF.textMid }));
      // Separator
      if (i < items.length - 1) objs.push(_wfLine([pad, y+62, pad+W, y+62], { stroke:WF.border }));
    }
    return objs;
  },

  // ── Pricing ──
  'pricing-3col': function() {
    var W = CW - 96, cols = 3, gap = 16, pad = 48, objs = [];
    var cw = (W - (cols-1)*gap) / cols;
    var tiers = [
      { name:'Hobby', price:'Free', sub:'/forever', items:['3 Projects','Basic Analytics','Community Support','1GB Storage'], btn:'Start Free', highlight:false },
      { name:'Pro', price:'$29', sub:'/month', items:['Unlimited Projects','Advanced Analytics','Priority Support','100GB Storage'], btn:'Upgrade to Pro', highlight:true, badge:'Popular' },
      { name:'Enterprise', price:'$99', sub:'/month', items:['Custom Limits','Custom Analytics','Dedicated Support','Unlimited Storage'], btn:'Contact Sales', highlight:false }
    ];
    for (var c = 0; c < cols; c++) {
      var cx = pad + c * (cw + gap);
      var t = tiers[c];
      var cardH = 320;
      // Card shadow
      if (t.highlight) {
        objs.push(_wfRect({ left:cx+2, top:193, width:cw, height:cardH, fill:'#BFDBFE', rx:12, ry:12, opacity:0.5 }));
      }
      // Card
      objs.push(_wfRect({ left:cx, top:190, width:cw, height:cardH, fill:'#FFFFFF', rx:12, ry:12,
        stroke: t.highlight ? WF.accent : WF.border, strokeWidth: t.highlight ? 2 : 1 }));
      // Badge
      if (t.badge) {
        objs.push(_wfRect({ left:cx+cw-72, top:198, width:60, height:20, fill:WF.accent, rx:10, ry:10 }));
        objs.push(_wfText(t.badge, { left:cx+cw-62, top:201, fontSize:10, fill:'#FFFFFF', fontWeight:'bold' }));
      }
      // Tier name
      objs.push(_wfText(t.name, { left:cx+20, top:210, fontSize:13, fill:WF.textMid, fontWeight:'500' }));
      // Price
      objs.push(_wfText(t.price, { left:cx+20, top:232, fontSize:30, fill:WF.textDark, fontWeight:'bold' }));
      objs.push(_wfText(t.sub, { left:cx+20+(t.price.length)*16, top:244, fontSize:12, fill:WF.textLight }));
      // Divider
      objs.push(_wfLine([cx+20, 272, cx+cw-20, 272], { stroke:WF.border }));
      // Feature list
      for (var fi = 0; fi < t.items.length; fi++) {
        objs.push(_wfText('✓', { left:cx+20, top:284+fi*26, fontSize:13, fill:'#22C55E', fontWeight:'bold' }));
        objs.push(_wfText(t.items[fi], { left:cx+40, top:284+fi*26, fontSize:12, fill:WF.textMid }));
      }
      // Button
      var btnFill = t.highlight ? WF.accent : '#FFFFFF';
      var btnStroke = t.highlight ? WF.accent : WF.border;
      var btnTextColor = t.highlight ? '#FFFFFF' : WF.textDark;
      objs.push(_wfRect({ left:cx+16, top:190+cardH-56, width:cw-32, height:40, fill:btnFill, stroke:btnStroke, rx:8, ry:8 }));
      objs.push(_wfText(t.btn, { left:cx+cw/2-40, top:190+cardH-45, fontSize:13, fill:btnTextColor, fontWeight:'bold' }));
    }
    return objs;
  }
};


// ─── Wireframe Flyout Sub-Tab Switching ──────────────────────

function switchWfFlyoutTab(tab) {
  var pagesView = document.getElementById('wf-pages-view');
  var blocksView = document.getElementById('wf-blocks-view');
  document.querySelectorAll('.wf-flyout-tab').forEach(function(b) {
    b.classList.toggle('active', b.dataset.wfFlyout === tab);
  });
  if (pagesView) pagesView.style.display = (tab === 'pages') ? '' : 'none';
  if (blocksView) blocksView.style.display = (tab === 'blocks') ? '' : 'none';
}



if (window.cc && cc.modules) cc.modules.register({ id: 'elements', parent: 'canvas.wireframe', title: 'Wireframe: elements', mount: function(){}, unmount: function(){} });
