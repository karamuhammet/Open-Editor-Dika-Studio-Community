var activeTemplateMode = 'post';
var activeSlideTemplateCategory = null;
var _slidePresenterState = null;
var _sdPresenterToken = 0;
var _sdGlobalKeysBound = false;
var _sdSlideCounter = 1;
var SLIDE_DEFAULT_BG = '#0d0d0d';
var _sdUi = {
  swiper: null,
  host: null,
  visibleThumbTimer: 0,
  activeGapIndex: -1,
  activeGapAnchor: null,
  animatedCards: [],
  presenterOverlay: null
};
var SLIDE_TEMPLATE_REGISTRY = {
  blankDeck: {
    name: 'Blank Deck',
    description: 'Create a blank slide page on the current canvas.',
    accent: 'var(--gold)',
    thumb: function(cvs) {
      var ctx = cvs.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      ctx.fillStyle = SLIDE_DEFAULT_BG;
      ctx.fillRect(0, 0, cvs.width, cvs.height);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 2;
      ctx.strokeRect(8, 8, cvs.width - 16, cvs.height - 16);
    },
    build: function() {}
  },
  titleDeck: {
    name: 'Title Slide',
    description: 'Large headline, subtitle, and clean presenter spacing.',
    accent: '#9ad1ff',
    thumb: function(cvs) {
      var ctx = cvs.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      ctx.fillStyle = SLIDE_DEFAULT_BG;
      ctx.fillRect(0, 0, cvs.width, cvs.height);
      ctx.fillStyle = '#f6f6f8';
      ctx.fillRect(cvs.width * 0.1, cvs.height * 0.18, cvs.width * 0.34, cvs.height * 0.08);
      ctx.fillRect(cvs.width * 0.1, cvs.height * 0.32, cvs.width * 0.24, cvs.height * 0.045);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(cvs.width * 0.1, cvs.height * 0.4, cvs.width * 0.28, cvs.height * 0.035);
      ctx.fillStyle = '#f6f6f8';
      ctx.fillRect(cvs.width * 0.7, cvs.height * 0.15, cvs.width * 0.16, cvs.height * 0.5);
      ctx.fillStyle = '#f9a8d4';
      ctx.fillRect(cvs.width * 0.75, cvs.height * 0.22, cvs.width * 0.06, cvs.height * 0.34);
      ctx.fillStyle = '#f6f6f8';
      ctx.fillRect(cvs.width * 0.12, cvs.height * 0.68, cvs.width * 0.13, cvs.height * 0.13);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(cvs.width * 0.29, cvs.height * 0.72, cvs.width * 0.2, cvs.height * 0.032);
      ctx.fillRect(cvs.width * 0.29, cvs.height * 0.79, cvs.width * 0.14, cvs.height * 0.028);
    },
    build: function() {
      var title = new fabric.Textbox('Quarterly Growth Story', {
        left: CW * 0.1,
        top: CH * 0.16,
        width: CW * 0.58,
        fontSize: Math.round(CH * 0.09),
        fontFamily: 'Outfit',
        fontWeight: 700,
        fill: '#f6f6f8'
      });
      var subtitle = new fabric.Textbox('Lead with the one sentence your audience must remember, then support it with one clear data point and one promise.', {
        left: CW * 0.1,
        top: CH * 0.36,
        width: CW * 0.52,
        fontSize: Math.round(CH * 0.034),
        lineHeight: 1.35,
        fontFamily: 'DM Sans',
        fill: '#cbd5e1'
      });
      var card = new fabric.Rect({
        left: CW * 0.7,
        top: CH * 0.17,
        width: CW * 0.18,
        height: CH * 0.52,
        rx: 28,
        ry: 28,
        fill: '#f6f6f8'
      });
      var accent = new fabric.Rect({
        left: CW * 0.75,
        top: CH * 0.23,
        width: CW * 0.08,
        height: CH * 0.38,
        rx: 22,
        ry: 22,
        fill: '#f9a8d4'
      });
      var metric = new fabric.Textbox('42%', {
        left: CW * 0.2,
        top: CH * 0.72,
        width: CW * 0.18,
        fontSize: Math.round(CH * 0.11),
        fontFamily: 'Unbounded',
        fontWeight: 700,
        fill: '#f6f6f8'
      });
      var metricLabel = new fabric.Textbox('increase in qualified responses after simplifying the deck narrative', {
        left: CW * 0.33,
        top: CH * 0.75,
        width: CW * 0.36,
        fontSize: Math.round(CH * 0.03),
        fontFamily: 'DM Sans',
        fill: '#cbd5e1'
      });
      canvas.add(title, subtitle, card, accent, metric, metricLabel);
    }
  },
  splitDeck: {
    name: 'Split Layout',
    description: 'Balanced two-column slide starter with room for media.',
    accent: '#8df0c9',
    thumb: function(cvs) {
      var ctx = cvs.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      ctx.fillStyle = SLIDE_DEFAULT_BG;
      ctx.fillRect(0, 0, cvs.width, cvs.height);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(cvs.width * 0.08, cvs.height * 0.12, cvs.width * 0.28, cvs.height * 0.74);
      ctx.fillStyle = '#fda4af';
      ctx.fillRect(cvs.width * 0.12, cvs.height * 0.2, cvs.width * 0.08, cvs.height * 0.03);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(cvs.width * 0.12, cvs.height * 0.3, cvs.width * 0.16, cvs.height * 0.065);
      ctx.fillRect(cvs.width * 0.12, cvs.height * 0.4, cvs.width * 0.14, cvs.height * 0.05);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(cvs.width * 0.48, cvs.height * 0.15, cvs.width * 0.32, cvs.height * 0.42);
      ctx.fillStyle = '#111827';
      ctx.fillRect(cvs.width * 0.52, cvs.height * 0.67, cvs.width * 0.22, cvs.height * 0.03);
      ctx.fillStyle = '#10b981';
      ctx.fillRect(cvs.width * 0.52, cvs.height * 0.74, cvs.width * 0.14, cvs.height * 0.03);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(cvs.width * 0.52, cvs.height * 0.81, cvs.width * 0.18, cvs.height * 0.03);
    },
    build: function() {
      var panel = new fabric.Rect({
        left: CW * 0.06,
        top: CH * 0.09,
        width: CW * 0.36,
        height: CH * 0.82,
        rx: 30,
        ry: 30,
        fill: '#0f172a'
      });
      var eyebrow = new fabric.Textbox('TEAM UPDATE', {
        left: CW * 0.11,
        top: CH * 0.15,
        width: CW * 0.2,
        fontSize: Math.round(CH * 0.025),
        fontFamily: 'Space Mono',
        fontWeight: 700,
        fill: '#fda4af'
      });
      var title = new fabric.Textbox('Show the headline, then let the canvas carry the detail.', {
        left: CW * 0.11,
        top: CH * 0.22,
        width: CW * 0.26,
        fontSize: Math.round(CH * 0.06),
        lineHeight: 1.1,
        fontFamily: 'Outfit',
        fontWeight: 700,
        fill: '#f8fafc'
      });
      var rightFrame = new fabric.Rect({
        left: CW * 0.48,
        top: CH * 0.12,
        width: CW * 0.42,
        height: CH * 0.5,
        rx: 24,
        ry: 24,
        fill: '#e2e8f0',
        stroke: '#cbd5e1',
        strokeWidth: 2
      });
      var bar1 = new fabric.Rect({ left: CW * 0.52, top: CH * 0.7, width: CW * 0.28, height: CH * 0.035, rx: 14, ry: 14, fill: '#111827' });
      var bar2 = new fabric.Rect({ left: CW * 0.52, top: CH * 0.76, width: CW * 0.18, height: CH * 0.035, rx: 14, ry: 14, fill: '#10b981' });
      var bar3 = new fabric.Rect({ left: CW * 0.52, top: CH * 0.82, width: CW * 0.24, height: CH * 0.035, rx: 14, ry: 14, fill: '#f59e0b' });
      canvas.add(panel, eyebrow, title, rightFrame, bar1, bar2, bar3);
    }
  }
};
var SLIDE_TEMPLATE_CATEGORIES = {
  blank: {
    name: 'Blank',
    description: '1600×900',
    icon: 'story',
    templates: ['blankDeck', 'titleDeck', 'splitDeck']
  },
  business: {
    name: 'Business',
    description: '1600×900',
    icon: 'briefcase',
    templates: []
  },
  realtor: {
    name: 'Realtor',
    description: '1600×900',
    icon: 'layers',
    templates: []
  },
  finance: {
    name: 'Finance',
    description: '1600×900',
    icon: 'charts',
    templates: []
  }
};
var SLIDE_TEMPLATE_CATEGORY_ORDER = ['blank', 'business', 'realtor', 'finance'];

function _sdNextSlideId() {
  var id = 'sld-' + Date.now() + '-' + _sdSlideCounter;
  _sdSlideCounter += 1;
  return id;
}

function _sdClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function _sdCreateBlankSlide(label, w, h, bg) {
  return {
    id: _sdNextSlideId(),
    label: label || 'Slide 1',
    json: null,
    bg: SLIDE_DEFAULT_BG,
    w: w || CW || 1600,
    h: h || CH || 900,
    transition: 'none',
    transitionPreset: 'none',
    transitionDuration: 0.6,
    transitionDirection: 'auto',
    transitionEasing: 'power2.out',
    animations: [],
    notes: '',
    hidden: false,
    _previewRev: 0
  };
}

function _sdNormalizeSlide(slide, fallbackIndex, page) {
  var source = slide || {};
  var normalized = {
    id: source.id || _sdNextSlideId(),
    label: source.label || ('Slide ' + ((fallbackIndex || 0) + 1)),
    json: source.json || null,
    bg: source.bg || SLIDE_DEFAULT_BG,
    w: source.w || page.w || CW || 1600,
    h: source.h || page.h || CH || 900,
    transition: source.transition || 'none',
    transitionPreset: source.transitionPreset || (source.transition || 'none'),
    transitionDuration: (isFinite(parseFloat(source.transitionDuration)) ? parseFloat(source.transitionDuration) : 0.6),
    transitionDirection: source.transitionDirection || 'auto',
    transitionEasing: source.transitionEasing || 'power2.out',
    animations: Array.isArray(source.animations) ? source.animations : [],
    notes: typeof source.notes === 'string' ? source.notes : '',
    hidden: !!source.hidden,
    _bbRowKey: source._bbRowKey || null,   // bulk-builder row identity (deck target, P2 2026-07-18)
    _previewRev: source._previewRev || 0
  };
  return normalized;
}

function _sdNormalizeDeck(page) {
  if (!page) return null;
  if (!page._slideDeck || !page._slideDeck.enabled) return null;
  var deck = page._slideDeck;
  var slides = Array.isArray(deck.slides) ? deck.slides : [];
  if (!slides.length) slides = [_sdCreateBlankSlide('Slide 1', page.w, page.h, SLIDE_DEFAULT_BG)];
  deck.enabled = true;
  deck.slides = slides.map(function(slide, idx) {
    return _sdNormalizeSlide(slide, idx, page);
  });
  if (typeof deck.activeSlideIndex !== 'number' || deck.activeSlideIndex < 0 || deck.activeSlideIndex >= deck.slides.length) {
    deck.activeSlideIndex = 0;
  }
  // page.bg mirrors the ACTIVE slide's own background (per-slide bg), not a forced default —
  // otherwise every normalize pass would wipe a user-picked slide colour back to the dark default.
  var _active = deck.slides[deck.activeSlideIndex];
  page.bg = (_active && _active.bg) || SLIDE_DEFAULT_BG;
  return deck;
}

function pageHasSlideDeck(page) {
  return !!_sdNormalizeDeck(page);
}

function ensureSlideDeck(page, options) {
  if (!page) return null;
  var opts = options || {};
  if (!page._slideDeck || !page._slideDeck.enabled) {
    var slide = _sdCreateBlankSlide(opts.initialLabel || 'Slide 1', opts.w || page.w || 1600, opts.h || page.h || 900, SLIDE_DEFAULT_BG);
    page._slideDeck = {
      enabled: true,
      slides: [slide],
      activeSlideIndex: 0
    };
  }
  page._productType = 'slide';
  if (opts.w) page.w = opts.w;
  if (opts.h) page.h = opts.h;
  // page.bg is derived from the active slide inside _sdNormalizeDeck — do NOT force the default
  // here, or an existing deck's user-picked slide colour is clobbered on every ensureSlideDeck call.
  return _sdNormalizeDeck(page);
}

function getActiveInnerSlide(page) {
  var deck = _sdNormalizeDeck(page);
  if (!deck) return null;
  return deck.slides[deck.activeSlideIndex] || deck.slides[0] || null;
}

function getCurrentInnerSlide() {
  if (typeof pages === 'undefined' || !pages[currentPageIndex]) return null;
  return getActiveInnerSlide(pages[currentPageIndex]);
}

function _sdTouchSlide(slide) {
  if (!slide) return;
  slide._previewRev = (slide._previewRev || 0) + 1;
}

function _sdTouchDeck(page) {
  if (!page) return;
  if (typeof _pgTouchPagePreview === 'function') _pgTouchPagePreview(page);
}

function saveCurrentInnerSlide() {
  if (typeof pages === 'undefined') return;
  var page = pages[currentPageIndex];
  if (!pageHasSlideDeck(page) || typeof canvas === 'undefined' || !canvas || !canvas.toJSON) return;
  var slide = getActiveInnerSlide(page);
  if (!slide) return;
  slide.json = canvas.toJSON(CUSTOM_PROPS);
  // Persist the slide's ACTUAL background (per-slide bg). The full value (solid / gradient / image)
  // also lives inside slide.json; slide.bg keeps a string mirror for thumbnails + the empty-slide path.
  var _sdBg = (canvas && typeof canvas.backgroundColor === 'string' && canvas.backgroundColor)
    ? canvas.backgroundColor
    : (slide.bg || SLIDE_DEFAULT_BG);
  slide.bg = _sdBg;
  slide.w = CW;
  slide.h = CH;
  page.w = slide.w;
  page.h = slide.h;
  page.bg = _sdBg;
  page._productType = 'slide';
  _sdTouchSlide(slide);
  _sdTouchDeck(page);
}

function _sdLoadCanvasSource(source, onDone) {
  var done = typeof onDone === 'function' ? onDone : function() {};
  if (!source) {
    done();
    return;
  }
  if (source.w && source.h) {
    CW = source.w;
    CH = source.h;
    if (canvas && canvas.setWidth && canvas.setHeight) {
      canvas.setWidth(CW);
      canvas.setHeight(CH);
    }
  }
  if (source.json) {
    histLocked = true;
    canvas.loadFromJSON(source.json, function() {
      canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
      canvas.setZoom(1);
      var _finish = function() {
        canvas.renderAll();
        histLocked = false;
        if (typeof _restoreChartsAfterLoad === 'function') _restoreChartsAfterLoad(canvas);
        if (typeof refreshStructure === 'function') refreshStructure();
        done();
      };
      // Preserve the slide's own background (solid / gradient / image) restored by loadFromJSON.
      // Only fall back to the stored slide.bg / dark default when the slide carried no background,
      // so a user-picked slide colour survives a save + reload instead of snapping back to black.
      if (canvas.backgroundColor) { _finish(); }
      else { canvas.setBackgroundColor(source.bg || SLIDE_DEFAULT_BG, _finish); }
    });
    return;
  }
  canvas.clear();
  canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
  canvas.setZoom(1);
  canvas.setBackgroundColor(source.bg || SLIDE_DEFAULT_BG, function() {
    canvas.renderAll();
    if (typeof refreshStructure === 'function') refreshStructure();
    done();
  });
}

function loadInnerSlide(pageIndex, slideIndex, options) {
  if (typeof pages === 'undefined' || !pages[pageIndex]) return null;
  var page = pages[pageIndex];
  var deck = ensureSlideDeck(page);
  var opts = options || {};
  if (!opts.skipSave && pageIndex === currentPageIndex) saveCurrentInnerSlide();
  if (typeof slideIndex !== 'number' || slideIndex < 0 || slideIndex >= deck.slides.length) slideIndex = deck.activeSlideIndex || 0;
  deck.activeSlideIndex = slideIndex;
  var slide = deck.slides[slideIndex];
  page.w = slide.w || page.w;
  page.h = slide.h || page.h;
  page.bg = slide.bg || page.bg;
  page._productType = 'slide';
  activeProduct = 'slide';
  _sdLoadCanvasSource(slide, function() {
    if (typeof updateCanvasSizePanel === 'function') updateCanvasSizePanel();
    if (typeof updateCanvasLabel === 'function') updateCanvasLabel();
    if (typeof refreshStructure === 'function') refreshStructure();
    if (typeof refreshInlineLayers === 'function') refreshInlineLayers();
    if (typeof syncSlideDeckUi === 'function') syncSlideDeckUi();
  });
  return slide;
}

function addInnerSlide(pageIndex, insertAt) {
  if (typeof pages === 'undefined' || !pages[pageIndex]) return null;
  var page = pages[pageIndex];
  var deck = ensureSlideDeck(page);
  var targetIndex = typeof insertAt === 'number' ? insertAt : deck.activeSlideIndex + 1;
  targetIndex = Math.max(0, Math.min(targetIndex, deck.slides.length));
  var slide = _sdCreateBlankSlide('Slide ' + (targetIndex + 1), page.w, page.h, page.bg);
  deck.slides.splice(targetIndex, 0, slide);
  deck.slides.forEach(function(item, idx) {
    if (!item.label || /^Slide \d+$/.test(item.label)) item.label = 'Slide ' + (idx + 1);
  });
  deck.activeSlideIndex = targetIndex;
  _sdTouchDeck(page);
  return slide;
}

function duplicateInnerSlide(pageIndex, slideIndex) {
  if (typeof pages === 'undefined' || !pages[pageIndex]) return null;
  var page = pages[pageIndex];
  var deck = ensureSlideDeck(page);
  var source = deck.slides[typeof slideIndex === 'number' ? slideIndex : deck.activeSlideIndex];
  if (!source) return null;
  var copy = _sdNormalizeSlide(_sdClone(source), deck.activeSlideIndex + 1, page);
  copy.id = _sdNextSlideId();
  copy.label = source.label + ' Copy';
  copy._previewRev = 0;
  deck.slides.splice((typeof slideIndex === 'number' ? slideIndex : deck.activeSlideIndex) + 1, 0, copy);
  deck.activeSlideIndex = deck.slides.indexOf(copy);
  _sdTouchDeck(page);
  return copy;
}

function deleteInnerSlide(pageIndex, slideIndex) {
  if (typeof pages === 'undefined' || !pages[pageIndex]) return false;
  var page = pages[pageIndex];
  var deck = ensureSlideDeck(page);
  if (deck.slides.length <= 1) return false;
  var idx = typeof slideIndex === 'number' ? slideIndex : deck.activeSlideIndex;
  if (idx < 0 || idx >= deck.slides.length) return false;
  deck.slides.splice(idx, 1);
  deck.activeSlideIndex = Math.max(0, Math.min(deck.activeSlideIndex, deck.slides.length - 1));
  _sdTouchDeck(page);
  return true;
}

function moveInnerSlide(pageIndex, from, to) {
  if (typeof pages === 'undefined' || !pages[pageIndex]) return false;
  var page = pages[pageIndex];
  var deck = ensureSlideDeck(page);
  if (from === to || from < 0 || to < 0 || from >= deck.slides.length || to >= deck.slides.length) return false;
  var moved = deck.slides.splice(from, 1)[0];
  deck.slides.splice(to, 0, moved);
  deck.activeSlideIndex = to;
  _sdTouchDeck(page);
  return true;
}

function getPagePreviewSource(page) {
  if (!pageHasSlideDeck(page)) return null;
  var slide = getActiveInnerSlide(page);
  if (!slide) return null;
  return {
    json: slide.json,
    bg: slide.bg,
    w: slide.w,
    h: slide.h
  };
}

function convertSlidePageToNormalPage(page) {
  if (!pageHasSlideDeck(page)) return page;
  var slide = getActiveInnerSlide(page);
  page.json = slide ? _sdClone(slide.json) : page.json;
  page.bg = slide ? slide.bg : page.bg;
  page.w = slide ? slide.w : page.w;
  page.h = slide ? slide.h : page.h;
  delete page._slideDeck;
  page._productType = 'card';
  _sdTouchDeck(page);
  return page;
}

function _sdEnsureCurrentPage() {
  if (typeof pages === 'undefined' || !pages[currentPageIndex]) return null;
  return pages[currentPageIndex];
}

function _sdResetCanvas(bg, done) {
  if (!canvas) return;
  histLocked = true;
  canvas.clear();
  canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
  canvas.setZoom(1);
  canvas.setWidth(CW);
  canvas.setHeight(CH);
  canvas.setBackgroundColor(bg || SLIDE_DEFAULT_BG, function() {
    histLocked = false;
    canvas.renderAll();
    if (typeof refreshStructure === 'function') refreshStructure();
    if (typeof done === 'function') done();
  });
}

function _sdPreparePageAsDeck() {
  var page = _sdEnsureCurrentPage();
  if (!page) return null;
  if (window.wbActive && typeof exitWhiteboardMode === 'function') exitWhiteboardMode();
  delete page._isBoard;
  delete page._isWfBoard;
  page.bg = SLIDE_DEFAULT_BG;
  ensureSlideDeck(page, { w: 1600, h: 900, bg: SLIDE_DEFAULT_BG });
  page._productType = 'slide';
  if (typeof setProductType === 'function') setProductType('slide');
  activeProduct = 'slide';
  var deck = ensureSlideDeck(page, { w: 1600, h: 900, bg: SLIDE_DEFAULT_BG });
  if (deck && typeof deck.activeSlideIndex !== 'number') deck.activeSlideIndex = 0;
  return page;
}

function applySlideTemplate(templateKey) {
  var curPage = (typeof pages !== 'undefined' && typeof currentPageIndex !== 'undefined') ? pages[currentPageIndex] : null;

  // Board mode: prompt to leave board and open slide in a new page
  if (window.wbActive) {
    var reg = SLIDE_TEMPLATE_REGISTRY[templateKey];
    if (!reg) return;
    if (typeof showCustomConfirm === 'function') {
      showCustomConfirm(
        'Slide templates cannot be applied in Board mode. You will leave board mode and the template will open in a new page.',
        function() {
          if (typeof exitWhiteboardMode === 'function') exitWhiteboardMode();
          if (typeof addPage === 'function') addPage(undefined, 1600, 900);
          setTimeout(function() { applySlideTemplate(templateKey); }, 100);
        }
      );
    }
    return;
  }

  // On video pages: create a new page and apply slide template there
  if (curPage && curPage._productType === 'video') {
    var reg = SLIDE_TEMPLATE_REGISTRY[templateKey];
    if (!reg) return;
    if (typeof showToast === 'function') showToast('You are in video mode — the slide opens in a new page', 'info');
    if (typeof saveCurrentPage === 'function') saveCurrentPage();
    pages.push({ json: null, bg: '#ffffff', label: 'Slide ' + (pages.length + 1), w: 1600, h: 900, _productType: 'custom' });
    if (typeof switchPage === 'function') switchPage(pages.length - 1);
    setTimeout(function() { applySlideTemplate(templateKey); }, 100);
    return;
  }
  var reg = SLIDE_TEMPLATE_REGISTRY[templateKey];
  var page = _sdPreparePageAsDeck();
  if (!reg || !page) return;
  var slide = getActiveInnerSlide(page);
  if (!slide) return;
  slide.w = 1600;
  slide.h = 900;
  slide.bg = SLIDE_DEFAULT_BG;
  page.bg = SLIDE_DEFAULT_BG;
  CW = 1600;
  CH = 900;
  _sdResetCanvas(slide.bg, function() {
    if (typeof reg.build === 'function') reg.build();
    canvas.renderAll();
    saveCurrentInnerSlide();
    renderPageTabs();
    if (typeof syncSlideDeckUi === 'function') syncSlideDeckUi();
    if (typeof snap === 'function') snap();
  });
}

function _sdTemplateSearchValue() {
  var input = document.getElementById('tpl-search-input');
  return input ? String(input.value || '').trim() : '';
}

function _sdTemplateModeLabel(mode) {
  if (mode === 'slide') return 'Slide';
  if (mode === 'video') return 'Video';
  return 'Post';
}

function _sdEnsureModeSwitch() {
  if (!_sdGlobalKeysBound && typeof _sdHandleGlobalKeydown === 'function') {
    document.addEventListener('keydown', _sdHandleGlobalKeydown);
    _sdGlobalKeysBound = true;
  }
  var host = document.getElementById('tpl-mode-switch');
  if (!host) return null;
  var modes = ['post', 'slide', 'video'];
  var iconMap = {
    post: 'templates',
    slide: 'story',
    video: 'Film'
  };
  if (host.getAttribute('data-ready') === '1') {
    var buttons = host.querySelectorAll('.tpl-mode-tab');
    buttons.forEach(function(btn) {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === activeTemplateMode);
      btn.setAttribute('aria-pressed', btn.classList.contains('active') ? 'true' : 'false');
    });
    return host;
  }
  host.innerHTML = '';
  host.setAttribute('data-ready', '1');
  modes.forEach(function(mode) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tpl-mode-tab' + (mode === activeTemplateMode ? ' active' : '');
    btn.setAttribute('data-mode', mode);
    btn.setAttribute('aria-pressed', mode === activeTemplateMode ? 'true' : 'false');
    btn.innerHTML =
      '<span class="tpl-mode-tab-icon">' + (typeof getIcon === 'function' ? getIcon(iconMap[mode] || 'templates', 14) : '') + '</span>' +
      '<span class="tpl-mode-tab-label">' + _sdTemplateModeLabel(mode) + '</span>';
    btn.onclick = function() {
      setTemplateMode(mode);
    };
    host.appendChild(btn);
  });
  return host;
}

function setTemplateMode(mode) {
  if (!mode || ['post', 'slide', 'video'].indexOf(mode) === -1) mode = 'post';

  // Allow browsing post/slide templates while on a video page
  // (actual apply will create a new page)
  var curPage = (typeof pages !== 'undefined' && typeof currentPageIndex !== 'undefined') ? pages[currentPageIndex] : null;
  var onVideoPage = curPage && curPage._productType === 'video';

  var prevMode = activeTemplateMode;
  activeTemplateMode = mode;
  if (mode !== 'slide') activeSlideTemplateCategory = null;
  _sdEnsureModeSwitch();

  // Only deactivate video editor when switching AWAY from video tab on a non-video page.
  // Do NOT auto-activate when switching TO video tab — user must pick a template/preset first.
  if (prevMode === 'video' && mode !== 'video' && !onVideoPage && typeof VideoEditor !== 'undefined') {
    VideoEditor.deactivate();
  }
  renderTemplatesPanel('flyout-tpl-grid', _sdTemplateSearchValue());
}

function _sdMakeTemplateCard(registryKey, reg, searchTerm) {
  var q = String(searchTerm || '').toLowerCase();
  var haystack = (reg.name + ' ' + reg.description).toLowerCase();
  if (q && haystack.indexOf(q) === -1) return null;
  var card = document.createElement('div');
  card.className = 'tpl-card';
  card.setAttribute('data-slide-template', registryKey);
  var thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = 352;
  thumbCanvas.height = Math.round(352 * (9 / 16));
  thumbCanvas.style.cssText = 'width:100%;height:auto;border-radius:4px;';
  if (typeof reg.thumb === 'function') {
    try { reg.thumb(thumbCanvas); } catch (err) {}
  }
  card.appendChild(thumbCanvas);
  var lbl = document.createElement('div');
  lbl.className = 'tpl-card-name';
  lbl.textContent = reg.name;
  card.appendChild(lbl);
  card.onclick = function() {
    applySlideTemplate(registryKey);
  };
  return card;
}

function _sdSlideTemplateKeysForCategory(categoryKey) {
  var cat = categoryKey ? SLIDE_TEMPLATE_CATEGORIES[categoryKey] : null;
  return cat && Array.isArray(cat.templates) ? cat.templates.slice() : Object.keys(SLIDE_TEMPLATE_REGISTRY);
}

function _sdMakeSlideBlankCard() {
  var blankCard = document.createElement('div');
  blankCard.className = 'tpl-card';
  blankCard.style.cssText = 'display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;background:var(--surface2);';
  blankCard.innerHTML = '<span style="font-size:24px;color:var(--text-dim)">+</span><span style="font-size:10px;color:var(--text-dim)">Blank</span>';
  blankCard.onclick = function() {
    applySlideTemplate('blankDeck');
  };
  return blankCard;
}

/**
 * Prompt user before activating video editor.
 * If current page is already video → activate directly.
 * If current page has content → ask "Open in new page?".
 * Board mode → exit board, always new page.
 * @param {number} w - Canvas width
 * @param {number} h - Canvas height
 * @param {string|null} ratio - Aspect ratio string (e.g. '16:9')
 * @param {Function|null} afterActivate - Callback after activation
 */
function _sdVideoActivateWithPrompt(w, h, ratio, afterActivate) {
  // Lazy-load the video subsystem on first use — video/ (~180 modules + ffmpeg.wasm) is NOT in the
  // boot manifest (editor-perf-auth-plan B4). Load it, then re-run this with VideoEditor available.
  if (typeof VideoEditor === 'undefined') {
    if (window.cc && cc.loader && cc.loader.loadModule) cc.loader.loadModule('video').then(function () { _sdVideoActivateWithPrompt(w, h, ratio, afterActivate); });
    return;
  }
  var curPage = (typeof pages !== 'undefined' && typeof currentPageIndex !== 'undefined') ? pages[currentPageIndex] : null;

  // Helper: apply aspect ratio w/h to video canvas
  function _applyVideoSize(tw, th, tr) {
    if (tr) {
      var proj = (typeof VideoEditor !== 'undefined' && VideoEditor.getProject) ? VideoEditor.getProject() : null;
      if (proj) proj.aspectRatio = tr;
    }
    // Use VideoCanvas module to change dimensions — updates _ar so
    // enforceDimensions() won't revert the change on the next applyView()
    if (tr && typeof VideoCanvas !== 'undefined' && VideoCanvas.changeAspectRatio) {
      VideoCanvas.changeAspectRatio(tr);
    } else if (tw && th) {
      // Fallback for custom ratios not in VideoCanvas preset table
      if (typeof VideoCanvas !== 'undefined' && VideoCanvas.changeAspectRatio) {
        VideoCanvas.changeAspectRatio(tr || (tw + ':' + th));
      } else if (typeof setCustomCanvasSize === 'function') {
        setCustomCanvasSize(tw, th);
      }
    }
    if (typeof VideoEditor !== 'undefined') {
      if (VideoEditor.syncPreviewSize) VideoEditor.syncPreviewSize();
      if (VideoEditor.renderPreview) VideoEditor.renderPreview();
    }
  }

  // Already on a video page → just change dimensions (no re-activate needed)
  if (curPage && curPage._productType === 'video') {
    _applyVideoSize(w, h, ratio);
    if (afterActivate) afterActivate();
    return;
  }

  // Board mode → must leave board and create new page
  if (window.wbActive) {
    if (typeof showCustomConfirm === 'function') {
      showCustomConfirm(
        'Video mode is not available in Board mode. A new page will be created for the video editor.',
        function() {
          if (typeof exitWhiteboardMode === 'function') exitWhiteboardMode();
          if (typeof addPage === 'function') addPage(undefined, w || 1920, h || 1080);
          VideoEditor.activate();
          _applyVideoSize(w, h, ratio);
          if (afterActivate) afterActivate();
        }
      );
    }
    return;
  }

  // Board page (but not in board mode) → new page
  if (curPage && curPage._isBoard) {
    if (typeof addPage === 'function') addPage(undefined, w || 1920, h || 1080);
    VideoEditor.activate();
    _applyVideoSize(w, h, ratio);
    if (afterActivate) afterActivate();
    return;
  }

  // Current page has content → ask user
  var hasContent = false;
  if (typeof canvas !== 'undefined' && canvas) {
    var objs = canvas.getObjects();
    hasContent = objs && objs.length > 0;
  }

  if (hasContent) {
    if (typeof showCustomConfirm === 'function') {
      showCustomConfirm(
        'This page has existing content. Open the video editor on a <b>new page</b>?<br><small>Your current page will not be modified.</small>',
        function() {
          // Yes → new page
          if (typeof addPage === 'function') addPage(undefined, w || 1920, h || 1080);
          VideoEditor.activate();
          _applyVideoSize(w, h, ratio);
          if (afterActivate) afterActivate();
        }
        // Cancel → do nothing, stay on current page
      );
    }
    return;
  }

  // Empty page → activate directly (no prompt)
  VideoEditor.activate();
  _applyVideoSize(w, h, ratio);
  if (afterActivate) afterActivate();
}

function _sdRenderVideoPlaceholder(container, searchTerm) {
  container.innerHTML = '';
  container.className = 'tpl-grid' + (window._sdVideoToolsSubpage === 'subtitle' ? ' tpl-grid--subtitle' : '');
  var subtitleWorkspace = window._sdVideoToolsSubpage === 'subtitle';
  var flyoutSection = container.closest ? container.closest('.flyout-section') : null;
  var flyoutBody = container.closest ? container.closest('.flyout-body') : null;
  if (flyoutSection && flyoutSection.classList) flyoutSection.classList.toggle('tpl-subtitle-section', subtitleWorkspace);
  if (flyoutBody && flyoutBody.classList) flyoutBody.classList.toggle('tpl-subtitle-body', subtitleWorkspace);

  // Subtitle sub-page = the subtitle editor takes over; hide the general
  // "Search templates" bar (owner: nothing from the general video page inside
  // the subtitle panel). Every other view restores it via renderTemplatesPanel.
  var _tsi2 = document.getElementById('tpl-search-input');
  if (_tsi2) { var _tsw2 = _tsi2.closest ? _tsi2.closest('.tpl-search-wrap') : _tsi2.parentNode; if (_tsw2) _tsw2.style.display = (window._sdVideoToolsSubpage === 'subtitle') ? 'none' : ''; }

  // Aspect ratio presets — same structure as slide category cards
  var presets = [
    { label: '16:9 Landscape', ratio: '16:9', w: 1920, h: 1080, icon: 'monitor' },
    { label: '9:16 Portrait',  ratio: '9:16', w: 1080, h: 1920, icon: 'smartphone' },
    { label: '1:1 Square',     ratio: '1:1',  w: 1080, h: 1080, icon: 'square' },
    { label: '4:5 Instagram',  ratio: '4:5',  w: 1080, h: 1350, icon: 'image' },
    { label: '4:3 Classic',    ratio: '4:3',  w: 1440, h: 1080, icon: 'tv' }
  ];

  // In a sub-page (Subtitle / Recorder) the tools take over the whole panel:
  // hide the Add Media card + aspect-ratio presets, keep only the top tabs +
  // back header + the sub-page content (R2-5, like the Slides category pattern).
  if (!window._sdVideoToolsSubpage) {
  // Add Media card (first card, like a blank/add card)
  var addCard = document.createElement('div');
  addCard.className = 'tpl-cat-card';
  addCard.style.borderColor = 'var(--gold)';
  addCard.style.background = 'rgba(242, 255, 88,0.06)';
  addCard.innerHTML =
    '<div class="tpl-cat-icon">' + (typeof getIcon === 'function' ? getIcon('plus', 18) : '+') + '</div>' +
    '<div class="tpl-cat-name">Add Media</div>' +
    '<div class="tpl-cat-dims">Import video/audio</div>';
  addCard.addEventListener('click', function() {
    if (typeof VideoEditor !== 'undefined') {
      _sdVideoActivateWithPrompt(1920, 1080, null, function() {
        VideoEditor.openFilePicker();
      });
    }
  });
  container.appendChild(addCard);

  // Preset cards — use tpl-cat-card (same as slide categories)
  presets.forEach(function(p) {
    var card = document.createElement('div');
    card.className = 'tpl-cat-card';
    var iconHtml = (typeof getIcon === 'function') ? getIcon(p.icon, 18) : '';
    card.innerHTML =
      '<div class="tpl-cat-icon">' + iconHtml + '</div>' +
      '<div class="tpl-cat-name">' + p.label + '</div>' +
      '<div class="tpl-cat-dims">' + p.w + '\u00D7' + p.h + '</div>';
    card.addEventListener('click', function() {
      if (typeof VideoEditor !== 'undefined') {
        _sdVideoActivateWithPrompt(p.w, p.h, p.ratio, null);
      }
    });
    container.appendChild(card);
  });
  } // end !subpage (Add Media + presets)

  // ── Tools section: category cards that drill into sub-pages ──────────────
  // Recorder tools group into a back-buttoned sub-page (Slides-category pattern);
  // Subtitle opens the auto-subtitle modal. Icons stay gray like the preset cards.
  var containerId = container.id || 'flyout-tpl-grid';
  window._sdLastVideoContainerId = containerId;
  var toolsSection = document.createElement('div');
  toolsSection.className = 'gal-fixed-section';
  toolsSection.style.cssText = 'margin-top:16px;grid-column:1/-1;';

  function _icoGray(name, size) {
    return '<span style="color:var(--text-dim);display:inline-flex">' + ((typeof getIcon === 'function') ? getIcon(name, size || 18) : '') + '</span>';
  }

  var _subHostToRender = null;
  if (window._sdVideoToolsSubpage === 'subtitle') {
    // Sub-page: the subtitle editing panel docked in the Video Tools area.
    var subBack = document.createElement('div');
    subBack.className = 'tpl-subpage-back';
    subBack.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 4px 10px;font-size:12px;font-weight:600;color:var(--text);cursor:pointer;';
    subBack.innerHTML = (typeof getIcon === 'function' ? getIcon('chevron-left', 16) : '&#8249;') + '<span>Subtitles</span>';
    subBack.addEventListener('click', function() { window._sdVideoToolsSubpage = null; renderTemplatesPanel(containerId, ''); });
    toolsSection.appendChild(subBack);
    var subHost = document.createElement('div');
    subHost.className = 've-subtitle-dock';
    toolsSection.appendChild(subHost);
    // Defer renderInto: subHost is not in the document until toolsSection is
    // appended to the container below, and VESubtitlePanel.render bails on a
    // detached target (M3 guard). Render AFTER the container is attached.
    _subHostToRender = subHost;
  } else if (window._sdVideoToolsSubpage === 'recorder') {
    // Sub-page: back header + the 4 recorder tools (gray icons)
    var backHdr = document.createElement('div');
    backHdr.className = 'tpl-subpage-back';
    backHdr.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 4px 10px;font-size:12px;font-weight:600;color:var(--text);cursor:pointer;';
    backHdr.innerHTML = (typeof getIcon === 'function' ? getIcon('chevron-left', 16) : '&#8249;') + '<span>Recorder tools</span>';
    backHdr.addEventListener('click', function() { window._sdVideoToolsSubpage = null; renderTemplatesPanel(containerId, ''); });
    toolsSection.appendChild(backHdr);

    var recGrid = document.createElement('div');
    recGrid.className = 'gal-fixed-grid';
    var recTools = [
      { id: 'rec-audio',         label: 'Audio',           icon: 'mic',     desc: 'Record microphone' },
      { id: 'rec-camera',        label: 'Camera',          icon: 'video',   desc: 'Record webcam' },
      { id: 'rec-screen',        label: 'Screen',          icon: 'monitor', desc: 'Screen capture' },
      { id: 'rec-screen-camera', label: 'Screen + Camera', icon: 'layout',  desc: 'Screen & webcam' }
    ];
    recTools.forEach(function(rt) {
      var card = document.createElement('div');
      card.className = 'img-cat-card ve-rec-card';
      card.innerHTML =
        '<div class="img-cat-icon">' + _icoGray(rt.icon, 22) + '</div>' +
        '<div class="ve-rec-tx"><div class="img-cat-name">' + rt.label + '</div>' +
        '<div class="img-cat-desc">' + rt.desc + '</div></div>';
      card.addEventListener('click', function() {
        if (typeof DikaRecorder === 'undefined') { if (typeof showToast === 'function') showToast('Recorder not available', 'error'); return; }
        if (DikaRecorder.isActive()) { if (typeof showToast === 'function') showToast('A recording is already in progress', 'warning'); return; }
        switch (rt.id) {
          case 'rec-audio':         DikaRecorder.startAudio(); break;
          case 'rec-camera':        DikaRecorder.startCamera(); break;
          case 'rec-screen':        DikaRecorder.startScreen(); break;
          case 'rec-screen-camera': DikaRecorder.startScreenCamera(); break;
        }
      });
      recGrid.appendChild(card);
    });
    toolsSection.appendChild(recGrid);
  } else {
    // Top level: Tools header + category cards
    var toolsHeader = document.createElement('div');
    toolsHeader.className = 'gal-section-header';
    toolsHeader.innerHTML = '<span class="gal-section-title">Tools</span>';
    toolsSection.appendChild(toolsHeader);

    var catGrid = document.createElement('div');
    catGrid.className = 'tpl-grid';
    catGrid.style.marginTop = '8px';

    var recCat = document.createElement('div');
    recCat.className = 'tpl-cat-card';
    recCat.innerHTML = '<div class="tpl-cat-icon">' + _icoGray('mic', 18) + '</div>' +
      '<div class="tpl-cat-name">Recorder tools</div><div class="tpl-cat-dims">Audio / camera / screen</div>';
    recCat.addEventListener('click', function() { window._sdVideoToolsSubpage = 'recorder'; renderTemplatesPanel(containerId, ''); });
    catGrid.appendChild(recCat);

    var subCat = document.createElement('div');
    subCat.className = 'tpl-cat-card';
    subCat.innerHTML = '<div class="tpl-cat-icon">' + _icoGray('captions', 18) + '</div>' +
      '<div class="tpl-cat-name">Subtitle</div><div class="tpl-cat-dims">AI auto-subtitle</div>';
    subCat.addEventListener('click', function() {
      // If subtitles already exist, show the editing panel here; else generate.
      if (window.VESubtitlePanel && VESubtitlePanel.hasCues && VESubtitlePanel.hasCues()) {
        _sdShowSubtitlePanel(window._sdSubtitleTrackId || null);
      } else {
        _sdOpenSubtitleModal();
      }
    });
    catGrid.appendChild(subCat);

    toolsSection.appendChild(catGrid);
  }

  container.appendChild(toolsSection);
  // Now that subHost is attached to the document, render the docked subtitle panel.
  if (_subHostToRender && window.VESubtitlePanel && VESubtitlePanel.renderInto) {
    VESubtitlePanel.renderInto(_subHostToRender, window._sdSubtitleTrackId || null);
  }
}

// Open the auto-subtitle modal from the Video Tools "Subtitle" category. Activates
// a video project first if the editor is not already in video mode.
function _sdOpenSubtitleModal() {
  function _open() { if (window.VEAutoSubtitle && VEAutoSubtitle.showModal) VEAutoSubtitle.showModal(); }
  if (typeof VideoEditor !== 'undefined' && VideoEditor.isActive && VideoEditor.isActive()) { _open(); return; }
  if (typeof _sdVideoActivateWithPrompt === 'function') {
    _sdVideoActivateWithPrompt(1920, 1080, '16:9', function() { setTimeout(_open, 60); });
  } else { _open(); }
}

// Canonical subtitle workspace entry. Every caller opens the existing left
// shell, selects Templates > Video > Subtitle and binds the exact source track.
function _sdShowSubtitlePanel(trackId) {
  if (trackId) window._sdSubtitleTrackId = trackId;
  if (typeof expandEditorLeftPanel === 'function') expandEditorLeftPanel();
  if (typeof openFlyout === 'function') openFlyout('templates');
  window._sdVideoToolsSubpage = 'subtitle';
  if (typeof setTemplateMode === 'function') {
    setTemplateMode('video');
    return;
  }
  if (typeof renderTemplatesPanel === 'function') renderTemplatesPanel('flyout-tpl-grid', '');
}

function renderTemplatesPanel(containerId, searchTerm) {
  var container = document.getElementById(containerId);
  if (!container) return;
  var subtitleWorkspace = activeTemplateMode === 'video' && window._sdVideoToolsSubpage === 'subtitle';
  var flyoutSection = container.closest ? container.closest('.flyout-section') : null;
  var flyoutBody = container.closest ? container.closest('.flyout-body') : null;
  if (flyoutSection && flyoutSection.classList) flyoutSection.classList.toggle('tpl-subtitle-section', subtitleWorkspace);
  if (flyoutBody && flyoutBody.classList) flyoutBody.classList.toggle('tpl-subtitle-body', subtitleWorkspace);
  // The template search bar is shown by default; the video Subtitle sub-page
  // hides it below (it belongs to the general template grid, not the subtitle
  // editor). Reset it here so every other view restores it.
  var _tsi = document.getElementById('tpl-search-input');
  if (_tsi) { var _tsw = _tsi.closest ? _tsi.closest('.tpl-search-wrap') : _tsi.parentNode; if (_tsw) _tsw.style.display = ''; }
  _sdEnsureModeSwitch();
  if (typeof _crSyncChrome === 'function') _crSyncChrome();   // Command Rail: pill only on the Post tab
  if (activeTemplateMode === 'slide') {
    if (searchTerm) {
      _sdRenderSlideTemplateGrid(container, searchTerm, activeSlideTemplateCategory);
      return;
    }
    if (activeSlideTemplateCategory) {
      _sdRenderSlideTemplateGrid(container, '', activeSlideTemplateCategory);
      return;
    }
    _sdRenderSlideCategoryCards(container);
    return;
  }
  if (activeTemplateMode === 'video') {
    _sdRenderVideoPlaceholder(container, searchTerm);
    return;
  }
  if (typeof renderTemplateCategoryCards === 'function') {
    renderTemplateCategoryCards(containerId, searchTerm);   // Command Rail (handles its own search/filter)
  }
}

// syncSlideDeckUi() lives in slide-deck-runtime/ (the real swiper/overlay/panel impl). The old
// placeholder stub here ("Slide strip is preparing…") was a DEAD duplicate: both were global function
// declarations, so whichever file loaded LAST won outright. Runtime wins in the current order, but a
// flipped load order would have locked the strip on "preparing…". Removed so there is ONE definition.
// Every cross-file caller is guarded (typeof check) or runs post-load (after runtime defines it).

function _sdSlideCategoryCount(categoryKey) {
  var keys = _sdSlideTemplateKeysForCategory(categoryKey);
  return Math.max(1, keys.length);
}

function _sdRenderSlideCategoryCards(container) {
  container.innerHTML = '';
  container.className = 'tpl-grid';
  SLIDE_TEMPLATE_CATEGORY_ORDER.forEach(function(categoryKey) {
    var cat = SLIDE_TEMPLATE_CATEGORIES[categoryKey];
    if (!cat) return;
    var card = document.createElement('div');
    card.className = 'tpl-cat-card';
    var iconHtml = (typeof getIcon === 'function') ? getIcon(cat.icon || 'story', 18) : '';
    card.innerHTML =
      '<div class="tpl-cat-icon">' + iconHtml + '</div>' +
      '<div class="tpl-cat-name">' + cat.name + '</div>' +
      '<div class="tpl-cat-dims">' + cat.description + '</div>' +
      '<div class="tpl-cat-count">' + _sdSlideCategoryCount(categoryKey) + '</div>';
    card.onclick = function() {
      activeSlideTemplateCategory = categoryKey;
      renderTemplatesPanel('flyout-tpl-grid', '');
    };
    container.appendChild(card);
  });
}

function _sdRenderSlideTemplateGrid(container, searchTerm, categoryKey) {
  container.innerHTML = '';
  container.className = 'tpl-grid';
  if (categoryKey) {
    var header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;grid-column:1/-1;margin-bottom:4px;cursor:pointer;padding:6px 0;';
    header.innerHTML = '<span style="font-size:16px;color:var(--text-dim)">←</span><span style="font-size:13px;font-weight:600;color:var(--text)">' + SLIDE_TEMPLATE_CATEGORIES[categoryKey].name + '</span>';
    header.onclick = function() {
      activeSlideTemplateCategory = null;
      renderTemplatesPanel('flyout-tpl-grid', '');
    };
    container.appendChild(header);
  }

  var blankCard = document.createElement('div');
  blankCard.className = 'tpl-card';
  blankCard.style.cssText = 'display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;background:var(--surface2);';
  blankCard.innerHTML = '<span style="font-size:24px;color:var(--text-dim)">+</span><span style="font-size:10px;color:var(--text-dim)">Blank</span>';
  blankCard.onclick = function() {
    applySlideTemplate('blankDeck');
  };
  container.appendChild(blankCard);

  var keys = _sdSlideTemplateKeysForCategory(categoryKey);
  var count = 0;
  keys.forEach(function(key) {
    if (key === 'blankDeck') return;
    var reg = SLIDE_TEMPLATE_REGISTRY[key];
    if (!reg) return;
    var card = _sdMakeTemplateCard(key, reg, searchTerm);
    if (!card) return;
    count++;
    container.appendChild(card);
  });

  if (!count && searchTerm) {
    var empty = document.createElement('div');
    empty.className = 'tpl-video-card';
    empty.textContent = 'No slide templates match your search.';
    container.appendChild(empty);
  }
}

// Modular skeleton hook (Faz 8) — slide-deck.js is the entry of the top-level 'slide-deck' group.
if (window.cc && cc.modules) cc.modules.register({ id: 'slide-deck', title: 'Slide deck', icon: 'presentation', mount: function () {}, unmount: function () {} });
