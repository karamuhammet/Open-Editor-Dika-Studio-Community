/* gallery/stock — STOCK MEDIA browser (Image/Video/Audio × Unsplash/Pexels/Pixabay/Freesound/Jamendo).
   Split from the 6553-line gallery.js (decomposition). FLAT sub-module: its functions + _stock* state
   stay window globals — ve-media-gallery.js and the gallery UI reference _stockPage/_stockQuery/etc. at
   runtime, so load order is irrelevant. Registers under left-panel.gallery for fault isolation. */

/* ═══════════════════════════════════════════════════════════
   STOCK MEDIA TABS (Image/Video/Audio × Library/Unsplash/Pexels/Pixabay)
   ═══════════════════════════════════════════════════════════ */
var _stockTabInited = {};          // { unsplash: true, pexels: true, pixabay: true, freesound: true, jamendo: true }
var _stockPage = { unsplash: 1, pexels: 1, pixabay: 1, freesound: 1, jamendo: 1 };
var _stockQuery = { unsplash: '', pexels: '', pixabay: '', freesound: '', jamendo: '' };
var _stockOrientation = { unsplash: '', pexels: '', pixabay: '', freesound: '', jamendo: '' };
var _activeMediaCat = 'image';  // 'image' | 'video' | 'audio'

/* ── Media category → available STOCK providers (drives the default provider per
   type now that the provider sub-tab strip is gone; 'library' is the other MODE). ── */
var _MEDIA_SOURCE_MAP = {
  image: ['unsplash', 'pexels', 'pixabay'],
  video: ['pexels', 'pixabay'],
  audio: ['freesound', 'jamendo', 'elevenlabs', 'elevenlabs-music']
};

/* ── Library vs Stock mode (portal /media .cc-viewseg parity) ── */
var _mediaMode = 'lib';   // 'lib' | 'stock'

/* Non-DOM API-key probe (used to pick a sensible default stock provider). */
function _stockHasKey(provider) {
  if (typeof window.ccStockSearch === 'function') return true;
  var keyMap = { unsplash: '_unsplash', pexels: '_pexels', pixabay: '_pixabay', freesound: '_freesound', jamendo: '_jamendo' };
  var keyField = keyMap[provider] || ('_' + provider);
  var state = (typeof _aiGetState === 'function') ? _aiGetState() : null;
  return !!(state && state.providerKeys && state.providerKeys[keyField]);
}

/* Default stock provider for a media type: first provider that has a key, else first. */
function _stockDefaultProvider(cat) {
  var list = _MEDIA_SOURCE_MAP[cat] || [];
  for (var i = 0; i < list.length; i++) { if (_stockHasKey(list[i])) return list[i]; }
  return list[0] || null;
}

/* Remember the user's chosen stock provider per media type (else the default). */
var _stockProviderByCat = { image: null, video: null, audio: null };
var _STOCK_PROVIDER_LABELS = { unsplash: 'Unsplash', pexels: 'Pexels', pixabay: 'Pixabay', freesound: 'Freesound', jamendo: 'Jamendo', elevenlabs: 'AI Efekt', 'elevenlabs-music': 'AI Music' };

/* Stock provider strip (.cc-genrebar) — scrollable pill row replacing the old provider
   tab strip. Shown only in Stok mode; one chip per provider available for the type. */
function _renderStockProviderStrip(cat, activeProvider) {
  var bar = document.getElementById('stock-genrebar');
  if (!bar) return;
  var list = _MEDIA_SOURCE_MAP[cat] || [];
  bar.innerHTML = list.map(function(p) {
    return '<button type="button" class="cc-chip' + (p === activeProvider ? ' active' : '') + '" data-provider="' + p + '">' +
      (_STOCK_PROVIDER_LABELS[p] || p) + '</button>';
  }).join('');
  bar.style.display = list.length ? '' : 'none';
  if (!bar._bound) {
    bar._bound = true;
    bar.addEventListener('click', function(e) {
      var chip = e.target.closest('[data-provider]');
      if (!chip) return;
      var p = chip.dataset.provider;
      _stockProviderByCat[_activeMediaCat] = p;
      bar.querySelectorAll('.cc-chip').forEach(function(c) { c.classList.toggle('active', c === chip); });
      _resetStockProviderView(p, _activeMediaCat);
      _switchStockTab(p);
    });
  }
}
function _hideStockProviderStrip() {
  var bar = document.getElementById('stock-genrebar');
  if (bar) bar.style.display = 'none';
}

/* ── Type facet strip (Image / Video / Audio) — .cc-typetab ── */
function _initMediaCatTabs() {
  var catIcons = { image: 'image', video: 'film', audio: 'music' };
  var catLabels = { image: 'Image', video: 'Video', audio: 'Audio' };
  document.querySelectorAll('.cc-typetab').forEach(function(tab) {
    if (tab._mcBound) return;
    tab._mcBound = true;
    var cat = tab.dataset.mediaCat;
    var iconHtml = (typeof getIcon === 'function') ? getIcon(catIcons[cat] || 'circle', 15) : '';
    tab.innerHTML = iconHtml + '<span>' + (catLabels[cat] || cat) + '</span>' +
      '<span class="cc-cnt" data-count-for="' + cat + '">0</span>';
    tab.addEventListener('click', function() { _switchMediaCategory(cat); });
  });
  _updateTypeCounts();
}

/* Count badges on the type strip (local store; Phase 4 makes it portal-backed). */
function _galTypeCount(store, cat) {
  var n = 0;
  var folders = (typeof _galFilterFolders === 'function') ? _galFilterFolders(store.folders || [], cat) : (store.folders || []);
  folders.forEach(function(f) { n += (f.images ? f.images.length : 0); });
  var recent = (typeof _galFilterRecent === 'function') ? _galFilterRecent(store.recent || [], cat) : [];
  n += recent.length;
  return n;
}
function _updateTypeCounts() {
  var store = (typeof _galInit === 'function') ? _galInit() : null;
  if (!store) return;
  ['image', 'video', 'audio'].forEach(function(cat) {
    var el = document.querySelector('.cc-cnt[data-count-for="' + cat + '"]');
    if (el) el.textContent = _galTypeCount(store, cat);
  });
}

/* ── Library/Stock switcher (.cc-viewseg) injected into the flyout header ── */
function _ensureMediaModeSwitcher(show) {
  // Kutuphanem / Stok ara sits DIRECTLY ABOVE the Image/Video/Audio strip (owner: it was misplaced
  // in the flyout header) — a full-width segmented bar, mirroring the Templates header order.
  var typeStrip = document.getElementById('media-type-strip');
  var mount = typeStrip ? typeStrip.parentNode : null;
  if (!mount) return;
  var seg = document.getElementById('media-mode-seg');
  if (!seg) {
    seg = document.createElement('div');
    seg.id = 'media-mode-seg';
    seg.className = 'cc-viewseg media-mode-seg';
    var libIco = (typeof getIcon === 'function') ? getIcon('image', 14) : '';
    var stkIco = (typeof getIcon === 'function') ? getIcon('search', 14) : '';
    seg.innerHTML =
      '<button type="button" data-mode="lib">' + libIco + '<span>My Library</span></button>' +
      '<button type="button" data-mode="stock">' + stkIco + '<span>Search stock</span></button>';
    seg.addEventListener('click', function(e) {
      var btn = e.target.closest('button[data-mode]');
      if (btn) _setMediaMode(btn.dataset.mode);
    });
  }
  // (re)place it right before the type strip, out of the header
  if (seg.nextSibling !== typeStrip || seg.parentNode !== mount) mount.insertBefore(seg, typeStrip);
  seg.style.display = show ? '' : 'none';
  seg.querySelectorAll('button[data-mode]').forEach(function(b) {
    b.classList.toggle('active', b.dataset.mode === _mediaMode);
  });
}

function _setMediaMode(mode) {
  if (mode !== 'lib' && mode !== 'stock') return;
  _mediaMode = mode;
  var seg = document.getElementById('media-mode-seg');
  if (seg) seg.querySelectorAll('button[data-mode]').forEach(function(b) {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  _switchMediaCategory(_activeMediaCat || 'image');
}

/* ── Switch media type; routes content by the active Library/Stock mode ── */
function _switchMediaCategory(cat) {
  _activeMediaCat = cat;
  document.querySelectorAll('.cc-typetab').forEach(function(t) {
    t.classList.toggle('active', t.dataset.mediaCat === cat);
  });
  var titles = { image: 'Images', video: 'Videos', audio: 'Audio' };
  var header = document.getElementById('flyout-header-title');
  if (!header) header = document.getElementById('flyout-title');
  if (header) header.textContent = titles[cat] || 'Media';
  _updateTypeCounts();

  if (_mediaMode === 'stock') {
    var provider = _stockProviderByCat[cat] || _stockDefaultProvider(cat);
    if (provider) {
      _stockProviderByCat[cat] = provider;
      _renderStockProviderStrip(cat, provider);
      _resetStockProviderView(provider, cat);
      _switchStockTab(provider);
      return;
    }
    // no provider for this type — fall back to the library view
  }
  _hideStockProviderStrip();
  _switchStockTab('library');
  renderImagesCategoryView();
}

/* Reset a single stock provider view (input/results/placeholder/state) for a type. */
function _resetStockProviderView(provider, cat) {
  var placeholders = {
    image: { unsplash: 'Search Unsplash photos...', pexels: 'Search Pexels photos...', pixabay: 'Search Pixabay images...' },
    video: { pexels: 'Search Pexels videos...', pixabay: 'Search Pixabay videos...' },
    audio: {
      freesound: 'Search Freesound effects...', jamendo: 'Search Jamendo music...',
      // Not a search: these two compose from the prompt, so the placeholder must ask for one.
      elevenlabs: 'Describe a sound effect...', 'elevenlabs-music': 'Describe the music...'
    }
  };
  var results = document.getElementById('stock-' + provider + '-results');
  var empty = document.getElementById('stock-' + provider + '-empty');
  var input = document.getElementById('stock-' + provider + '-input');
  if (results) results.innerHTML = '';
  if (empty) empty.style.display = '';
  if (input) {
    input.value = '';
    var ph = placeholders[cat] && placeholders[cat][provider];
    if (ph) input.placeholder = ph;
  }
  _stockQuery[provider] = '';
  _stockPage[provider] = 1;
  var wrap = document.getElementById('img-tab-' + provider);
  if (wrap) { var noKey = wrap.querySelector('.stock-no-key'); if (noKey) noKey.remove(); }
}

/* Entry point (rail-flyout calls this when the Media panel opens). */
function _initStockTabs() {
  _initMediaCatTabs();
  _ensureMediaModeSwitcher(true);
}

/* Show one .img-tab-content wrapper (library or a stock provider); lazy-init search. */
function _switchStockTab(tabId) {
  document.querySelectorAll('.img-tab-content').forEach(function(c) {
    c.style.display = 'none';
    c.classList.remove('active');
  });
  var target = document.getElementById('img-tab-' + tabId);
  if (target) { target.style.display = ''; target.classList.add('active'); }

  var stockTabs = ['unsplash', 'pexels', 'pixabay', 'freesound', 'jamendo', 'elevenlabs', 'elevenlabs-music'];
  if (stockTabs.indexOf(tabId) !== -1 && !_stockTabInited[tabId]) {
    _stockTabInited[tabId] = true;
    _initStockSearch(tabId);
  }
}

function _initStockSearch(provider) {
  var input = document.getElementById('stock-' + provider + '-input');
  var btn = document.getElementById('stock-' + provider + '-btn');
  var chips = document.getElementById('stock-' + provider + '-chips');

  // Only bind event listeners once per provider (guard against re-init on category switch)
  var wrap = document.getElementById('img-tab-' + provider);
  if (!wrap || wrap._stockEventsBound) {
    // Already bound — just re-check API key
    _stockCheckKey(provider);
    return;
  }
  wrap._stockEventsBound = true;

  if (input) {
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') _stockSearch(provider, input.value.trim(), false);
    });
  }
  if (btn) {
    btn.addEventListener('click', function() {
      if (input) _stockSearch(provider, input.value.trim(), false);
    });
  }
  if (chips) {
    chips.addEventListener('click', function(e) {
      var chip = e.target.closest('.stock-chip');
      if (!chip) return;
      var q = chip.dataset.q;
      if (input) input.value = q;
      _stockSearch(provider, q, false);
    });
  }

  // Orientation filter button & menu
  var orientBtn = document.getElementById('stock-' + provider + '-orient-btn');
  var orientMenu = document.getElementById('stock-' + provider + '-orient-menu');
  if (orientBtn && orientMenu) {
    orientBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var isOpen = orientMenu.style.display !== 'none';
      orientMenu.style.display = isOpen ? 'none' : '';
    });
    orientMenu.addEventListener('click', function(e) {
      var item = e.target.closest('.stock-orient-item');
      if (!item) return;
      var orient = item.dataset.orientation || '';
      _stockOrientation[provider] = orient;
      orientMenu.querySelectorAll('.stock-orient-item').forEach(function(el) { el.classList.remove('active'); });
      item.classList.add('active');
      orientMenu.style.display = 'none';
      orientBtn.classList.toggle('active', !!orient);
      // Re-search if there's an active query
      if (_stockQuery[provider]) _stockSearch(provider, _stockQuery[provider], false);
    });
    // Close menu on outside click
    document.addEventListener('click', function(e) {
      if (!orientBtn.contains(e.target) && !orientMenu.contains(e.target)) {
        orientMenu.style.display = 'none';
      }
    });
  }

  // AI tabs: the card, not a banner about spending credit on something that cannot run here.
  if (_stockAiIsAi(provider)) {
    _stockAiLocked(provider);
    if (btn && typeof getIcon === 'function') {
      var ic = getIcon('sparkles', 14);
      if (ic) { btn.innerHTML = ic; btn.title = 'Generate…'; }
    }
  }

  // Check if API key exists
  _stockCheckKey(provider);
}

function _stockCheckKey(provider) {
  /* COMMUNITY EDITION: ElevenLabs sound and music GENERATION is vendor AI. It runs on our pooled
     key through /api/proxy, so there is no version of it that works without the server and no
     client key that could stand in. It gets the same card as the AI panel rather than a tab whose
     Generate button can only ever fail. The stock media SEARCH providers below are unaffected:
     those take the user's own key (Settings > API Keys). */
  if (provider === 'elevenlabs' || provider === 'elevenlabs-music') {
    if (window.CCEdition && CCEdition.serverless) {
      var host = document.getElementById('stock-' + provider + '-results');
      if (host && CCEdition.lockSurface) CCEdition.lockSurface(host, 'ai');
      return false;
    }
    return true;
  }
  if (typeof window.ccStockSearch === 'function') return true;
  var keyMap = { unsplash: '_unsplash', pexels: '_pexels', pixabay: '_pixabay', freesound: '_freesound', jamendo: '_jamendo' };
  var keyField = keyMap[provider] || ('_' + provider);
  var state = (typeof _aiGetState === 'function') ? _aiGetState() : null;
  var key = state && state.providerKeys ? state.providerKeys[keyField] : '';
  if (!key) {
    var results = document.getElementById('stock-' + provider + '-results');
    var empty = document.getElementById('stock-' + provider + '-empty');
    if (results) results.innerHTML = '';
    if (empty) empty.style.display = 'none';
    var wrap = document.getElementById('img-tab-' + provider);
    if (wrap) {
      var existing = wrap.querySelector('.stock-no-key');
      if (!existing) {
        var msg = document.createElement('div');
        msg.className = 'stock-no-key';
        msg.innerHTML = 'API key required.<br><a onclick="if(typeof closeFlyout===\'function\')closeFlyout();if(typeof openSettingsScreen===\'function\')openSettingsScreen(\'api\');">Go to Settings → API Keys</a>';
        wrap.appendChild(msg);
      }
    }
    return false;
  }
  // Remove no-key message if key exists
  var wrap2 = document.getElementById('img-tab-' + provider);
  if (wrap2) {
    var old = wrap2.querySelector('.stock-no-key');
    if (old) old.remove();
  }
  return true;
}

/* ═══════════════════════════════════════════════════════════
   ElevenLabs AI audio (AI Efekt / AI Music) — GENERATE, not search
   ═══════════════════════════════════════════════════════════
   ElevenLabs has no searchable catalogue: /v1/sound-generation and /v1/music each take a prompt
   and return exactly ONE clip. Sitting next to Freesound/Jamendo that read as a broken search
   ("cozy" -> 1 result). So one prompt now fans out into a BATCH of parallel generations and the
   grid fills with variations, which is the "options for what I typed" feel the other tabs have.

   SFX varies prompt_influence per variation (loose interpretation -> literal), so the batch is
   genuinely different takes rather than four rolls of the same dice. Music has no such knob and
   costs far more per call (20s of composition), so it gets a smaller batch on the model's own
   randomness. Each call is a real generation and spends real credit: that is why the batch is a
   fixed small number behind an explicit setup modal, never an infinite scroll. */
/* COMMUNITY EDITION: the ElevenLabs sound and music GENERATION tabs are DELETED, not disabled.
   They ran on the dika studio pooled key through /api/proxy, so unlike the stock SEARCH providers
   beside them there is no user key that could stand in and no version that works offline. What went
   with them: the batch generator, the per-provider settings, the setup modal, the "spends credit"
   banner, and the vendor endpoint itself. An unreachable credential path is still a
   credential path, and the bundle is grepped for that host in the release checks.

   `_stockAiIsAi` survives as the predicate at the two entry points, which now show the shared AI
   card instead of a tab whose Generate button could only fail. */
var _stockAiOpts = {};
function _stockAiIsAi(provider) { return provider === 'elevenlabs' || provider === 'elevenlabs-music'; }

function _stockAiLocked(provider) {
  var host = document.getElementById('stock-' + provider + '-results');
  if (host && window.CCEdition && CCEdition.lockSurface) CCEdition.lockSurface(host, 'ai');
  return false;
}


function _stockSearch(provider, query, loadMore) {
  if (!query) return;

  // ElevenLabs generation is deleted in this edition; both doors show the card.
  if (_stockAiIsAi(provider)) { _stockAiLocked(provider); return; }

  if (!_stockCheckKey(provider)) return;

  var keyMap = { unsplash: '_unsplash', pexels: '_pexels', pixabay: '_pixabay', freesound: '_freesound', jamendo: '_jamendo' };
  var keyField = keyMap[provider] || ('_' + provider);
  var state = (typeof _aiGetState === 'function') ? _aiGetState() : null;
  var apiKey = state && state.providerKeys ? state.providerKeys[keyField] : '';
  if (!apiKey && typeof window.ccStockSearch !== 'function') return;

  var resultsEl = document.getElementById('stock-' + provider + '-results');
  var emptyEl = document.getElementById('stock-' + provider + '-empty');
  if (!resultsEl) return;

  if (!loadMore) {
    _stockPage[provider] = 1;
    _stockQuery[provider] = query;
    resultsEl.innerHTML = '';
  } else {
    _stockPage[provider]++;
    var oldBtn = resultsEl.querySelector('.stock-load-more');
    if (oldBtn) oldBtn.remove();
  }

  if (emptyEl) emptyEl.style.display = 'none';

  var loadingEl = document.createElement('div');
  if (loadMore) {
    loadingEl.className = 'stock-loading';
    loadingEl.textContent = 'Loading...';
  } else {
    // Skeleton tiles for the initial search (portal MediaSkeleton parity).
    loadingEl.className = 'stock-skel-wrap';
    loadingEl.innerHTML = '<div class="stock-skel"></div><div class="stock-skel"></div><div class="stock-skel"></div><div class="stock-skel"></div><div class="stock-skel"></div><div class="stock-skel"></div>';
  }
  resultsEl.appendChild(loadingEl);

  var page = _stockPage[provider];
  var perPage = 20;
  var url, headers = {};
  var mediaCat = _activeMediaCat || 'image';

  var orient = _stockOrientation[provider] || '';
  if (provider === 'unsplash' && orient === 'square') orient = 'squarish';

  if (provider === 'unsplash') {
    url = 'https://api.unsplash.com/search/photos?query=' + encodeURIComponent(query) + '&per_page=' + perPage + '&page=' + page + '&content_filter=high';
    if (orient) url += '&orientation=' + orient;
    headers = { 'Authorization': 'Client-ID ' + apiKey };
  } else if (provider === 'pexels') {
    if (mediaCat === 'video') {
      url = 'https://api.pexels.com/videos/search?query=' + encodeURIComponent(query) + '&per_page=' + perPage + '&page=' + page;
      if (orient) url += '&orientation=' + orient;
    } else {
      url = 'https://api.pexels.com/v1/search?query=' + encodeURIComponent(query) + '&per_page=' + perPage + '&page=' + page;
      if (orient) url += '&orientation=' + orient;
    }
    headers = { 'Authorization': apiKey };
  } else if (provider === 'pixabay') {
    // Pixabay's orientation vocabulary is horizontal/vertical (no square, and
    // its video API has no orientation param at all).
    var pixOrient = orient === 'landscape' ? 'horizontal' : orient === 'portrait' ? 'vertical' : '';
    if (mediaCat === 'video') {
      url = 'https://pixabay.com/api/videos/?key=' + encodeURIComponent(apiKey) + '&q=' + encodeURIComponent(query) + '&per_page=' + perPage + '&page=' + page + '&safesearch=true';
    } else {
      url = 'https://pixabay.com/api/?key=' + encodeURIComponent(apiKey) + '&q=' + encodeURIComponent(query) + '&per_page=' + perPage + '&page=' + page + '&safesearch=true';
      if (pixOrient) url += '&orientation=' + pixOrient;
    }
  } else if (provider === 'freesound') {
    url = 'https://freesound.org/apiv2/search/text/?query=' + encodeURIComponent(query) + '&fields=id,name,tags,username,previews,duration&page_size=' + perPage + '&page=' + page;
    headers = { 'Authorization': 'Token ' + apiKey };
  } else if (provider === 'jamendo') {
    var offset = (page - 1) * perPage;
    // fullcount=true is required for results_fullcount in the response
    // headers; without it hasMore is always false and pagination never shows.
    url = 'https://api.jamendo.com/v3.0/tracks/?client_id=' + encodeURIComponent(apiKey) + '&format=json&fullcount=true&limit=' + perPage + '&offset=' + offset + '&search=' + encodeURIComponent(query);
  }

  if (!url && typeof window.ccStockSearch !== 'function') { loadingEl.remove(); return; }

  var request = typeof window.ccStockSearch === 'function'
    ? window.ccStockSearch(provider, query, page, mediaCat, _stockOrientation[provider] || 'all')
    : fetch(url, { headers: headers }).then(function(r) {
    if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
    return r.json();
  });
  request.then(function(data) {
    loadingEl.remove();

    var items = [];

    // ── Parse Unsplash images ──
    if (Array.isArray(data.items)) {
      items = data.items.map(function(item) {
        return { type: item.type, url: item.url, thumb: item.thumb, alt: item.title || query, name: item.title || '', author: item.author || '', w: item.w || 0, h: item.h || 0, duration: item.duration || 0 };
      });
    }
    else if (provider === 'unsplash' && data.results) {
      items = data.results.map(function(img) {
        return { type: 'image', url: img.urls.regular, thumb: img.urls.small, alt: img.alt_description || query, author: img.user.name, w: img.width, h: img.height };
      });
    }
    // ── Parse Pexels images ──
    else if (provider === 'pexels' && mediaCat === 'image' && data.photos) {
      items = data.photos.map(function(img) {
        return { type: 'image', url: img.src.large2x, thumb: img.src.medium, alt: img.alt || query, author: img.photographer, w: img.width, h: img.height };
      });
    }
    // ── Parse Pexels videos ──
    else if (provider === 'pexels' && mediaCat === 'video' && data.videos) {
      items = data.videos.map(function(v) {
        var best = v.video_files && v.video_files.length ? v.video_files[0] : null;
        if (v.video_files) {
          for (var vfi = 0; vfi < v.video_files.length; vfi++) {
            if (v.video_files[vfi].quality === 'hd' || v.video_files[vfi].height >= 720) { best = v.video_files[vfi]; break; }
          }
        }
        var pxAuthor = v.user ? v.user.name : 'Pexels';
        return { type: 'video', url: best ? best.link : '', thumb: v.image, alt: query, name: 'Pexels #' + v.id + ' — ' + pxAuthor, author: pxAuthor, w: v.width, h: v.height, duration: v.duration };
      });
    }
    // ── Parse Pixabay images ──
    else if (provider === 'pixabay' && mediaCat === 'image' && data.hits) {
      items = data.hits.map(function(img) {
        return { type: 'image', url: img.largeImageURL, thumb: img.previewURL, alt: img.tags || query, author: img.user, w: img.imageWidth, h: img.imageHeight };
      });
    }
    // ── Parse Pixabay videos ──
    else if (provider === 'pixabay' && mediaCat === 'video' && data.hits) {
      items = data.hits.map(function(v) {
        var best = v.videos && v.videos.medium ? v.videos.medium : (v.videos && v.videos.small ? v.videos.small : null);
        var thumb = '';
        if (best && best.thumbnail) thumb = best.thumbnail;
        else if (v.videos && v.videos.small && v.videos.small.thumbnail) thumb = v.videos.small.thumbnail;
        else if (v.videos && v.videos.tiny && v.videos.tiny.thumbnail) thumb = v.videos.tiny.thumbnail;
        var pbTags = v.tags ? v.tags.split(',').slice(0, 3).map(function(t) { return t.trim(); }).join(', ') : '';
        var pbName = pbTags || ('Pixabay #' + v.id);
        return { type: 'video', url: best ? best.url : '', thumb: thumb, alt: v.tags || query, name: pbName, author: v.user, w: best ? best.width : 0, h: best ? best.height : 0, duration: v.duration };
      });
    }
    // ── Parse Freesound audio ──
    else if (provider === 'freesound' && data.results) {
      items = data.results.map(function(s) {
        var previewUrl = s.previews ? (s.previews['preview-hq-mp3'] || s.previews['preview-lq-mp3'] || '') : '';
        return { type: 'audio', url: previewUrl, thumb: '', alt: s.name || query, author: s.username || 'Freesound', duration: s.duration ? Math.round(s.duration) : 0 };
      });
    }
    // ── Parse Jamendo tracks ──
    else if (provider === 'jamendo' && data.results) {
      items = data.results.map(function(t) {
        return { type: 'audio', url: t.audio || '', thumb: t.image || '', alt: t.name || query, author: t.artist_name || 'Jamendo', duration: t.duration ? Math.round(t.duration) : 0 };
      });
    }

    // Client-side orientation filter — several provider APIs can't filter server-side (Pixabay's
    // VIDEO API has no orientation param at all), so the dropdown did nothing there (owner:
    // "filtresi çalışmıyor"). w/h come from the parse; items with unknown aspect are kept.
    var _orientSel = _stockOrientation[provider] || '';
    if (_orientSel === 'landscape' || _orientSel === 'portrait') {
      items = items.filter(function(it) {
        if (!(it.w > 0 && it.h > 0)) return true;
        return _orientSel === 'landscape' ? (it.w >= it.h) : (it.h > it.w);
      });
    }

    if (items.length === 0 && !loadMore) {
      var noRes = document.createElement('div');
      noRes.className = 'stock-loading';
      noRes.textContent = 'No results for "' + query + '"';
      resultsEl.appendChild(noRes);
      return;
    }

    items.forEach(function(item) {
      if (item.type === 'audio') {
        // ── Audio result cell ──
        var cell = document.createElement('div');
        cell.className = 'stock-result-cell stock-audio-cell';
        cell.title = item.alt;
        cell.innerHTML =
          '<div class="stock-audio-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>' +
          '<div class="stock-audio-info">' +
            '<div class="stock-audio-title">' + _escHtml(item.alt).substring(0, 40) + '</div>' +
            '<div class="stock-result-credit">' + _escHtml(item.author) + (item.duration ? ' · ' + item.duration + 's' : '') + '</div>' +
          '</div>' +
          '<button class="stock-audio-play" title="Preview"><svg width="14" height="14" viewBox="0 0 24 24" fill="var(--text)"><polygon points="5,3 19,12 5,21"/></svg></button>';
        var playBtn = cell.querySelector('.stock-audio-play');
        (function(audioUrl, audioName, audioAuthor, btnEl) {
          btnEl.addEventListener('click', function(e) {
            e.stopPropagation();
            if (_galAudioState.audio && _galAudioState.url === audioUrl && !_galAudioState.audio.paused) {
              _galAudioToggle();
            } else {
              _galAudioPlay(audioUrl, audioName, audioAuthor);
            }
          });
        })(item.url, item.alt, item.author, playBtn);
        cell.addEventListener('click', function() {
          _stockSaveAudioToGallery(item.url, provider, item.author, item.alt, item.duration);
          _addAudioToCanvas(item.url, item.alt, item.author);
        });
        resultsEl.appendChild(cell);
      } else if (item.type === 'video') {
        // ── Video result cell ──
        var cell = document.createElement('div');
        cell.className = 'stock-result-cell stock-video-cell';
        cell.title = item.alt;
        if (item.thumb) {
          var img = document.createElement('img');
          img.crossOrigin = 'anonymous'; // COEP require-corp blocks no-cors cross-origin <img>; CORS request loads it (must precede .src)
          img.src = item.thumb;
          img.alt = item.alt;
          img.loading = 'lazy';
          img.onerror = function() {
            // Fallback: use tiny video as poster via video element
            this.style.display = 'none';
            var vEl = document.createElement('video');
            vEl.crossOrigin = 'anonymous'; // same COEP reason — CORS request so the preview loads
            vEl.src = item.url;
            vEl.muted = true;
            vEl.preload = 'metadata';
            vEl.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;pointer-events:none';
            cell.insertBefore(vEl, cell.firstChild);
          };
          cell.appendChild(img);
        } else {
          // No thumb: use video element for preview
          var vEl = document.createElement('video');
          vEl.crossOrigin = 'anonymous'; // COEP require-corp blocks no-cors cross-origin <video>; CORS request loads it
          vEl.src = item.url;
          vEl.muted = true;
          vEl.preload = 'metadata';
          vEl.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;pointer-events:none';
          cell.appendChild(vEl);
        }
        var badge = document.createElement('div');
        badge.className = 'stock-video-badge';
        badge.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>' + (item.duration ? ' ' + item.duration + 's' : '');
        cell.appendChild(badge);
        var credit = document.createElement('div');
        credit.className = 'stock-result-credit';
        credit.textContent = item.author;
        cell.appendChild(credit);
        (function(videoItem) {
          cell.addEventListener('click', function() {
            _stockAddVideoToCanvas(videoItem.url, provider, videoItem.author, videoItem.thumb, videoItem.name);
          });
        })(item);
        resultsEl.appendChild(cell);
      } else {
        // ── Image result cell (existing) ──
        var cell = document.createElement('div');
        cell.className = 'stock-result-cell';
        cell.title = item.alt;
        var img = document.createElement('img');
        img.crossOrigin = 'anonymous'; // COEP require-corp blocks no-cors cross-origin <img>; CORS request loads it (must precede .src)
        img.src = item.thumb;
        img.alt = item.alt;
        img.loading = 'lazy';
        var credit = document.createElement('div');
        credit.className = 'stock-result-credit';
        credit.textContent = item.author;
        cell.appendChild(img);
        cell.appendChild(credit);
        (function(imgItem) {
          cell.addEventListener('click', function() {
            _stockAddToCanvas(imgItem.url, provider, imgItem.author);
          });
        })(item);
        resultsEl.appendChild(cell);
      }
    });

    // Load more button
    var totalHits = data.totalHits || data.total || 0;
    var hasMore = data.hasMore === true;
    if (Array.isArray(data.items)) hasMore = data.hasMore === true;
    else if (provider === 'unsplash') hasMore = data.total_pages && page < data.total_pages;
    else if (provider === 'pexels') hasMore = !!data.next_page;
    else if (provider === 'pixabay') hasMore = totalHits > page * perPage;
    else if (provider === 'freesound') hasMore = !!data.next;
    else if (provider === 'jamendo') hasMore = data.headers && parseInt(data.headers.results_fullcount || 0) > page * perPage;
    if (hasMore) {
      var moreBtn = document.createElement('button');
      moreBtn.className = 'stock-load-more';
      moreBtn.textContent = 'Load more...';
      moreBtn.addEventListener('click', function() {
        _stockSearch(provider, _stockQuery[provider], true);
      });
      resultsEl.appendChild(moreBtn);
      // Infinite scroll: auto-load the next page as the button nears the viewport (button stays as a fallback).
      if (typeof IntersectionObserver !== 'undefined') {
        var io = new IntersectionObserver(function(entries) {
          if (entries[0] && entries[0].isIntersecting) { io.disconnect(); moreBtn.click(); }
        }, { rootMargin: '300px' });
        io.observe(moreBtn);
      }
    }
  }).catch(function(err) {
    loadingEl.remove();
    var errEl = document.createElement('div');
    errEl.className = 'stock-loading';
    errEl.textContent = 'Error: ' + err.message;
    errEl.style.color = '#ff6b6b';
    resultsEl.appendChild(errEl);
    // A failed page-2+ fetch must stay retryable: roll the page counter back
    // and re-offer Load more, otherwise one transient 429/5xx (the observer
    // auto-fires it) permanently dead-ends pagination as "a single page".
    if (loadMore) {
      _stockPage[provider] = Math.max(1, (_stockPage[provider] || 2) - 1);
      var retryBtn = document.createElement('button');
      retryBtn.className = 'stock-load-more';
      retryBtn.textContent = 'Load more...';
      retryBtn.addEventListener('click', function() {
        errEl.remove();
        _stockSearch(provider, _stockQuery[provider], true);
      });
      resultsEl.appendChild(retryBtn);
    }
  });
}

function _stockSaveToGallery(imgEl, provider, author) {
  try {
    var thumbMax = 1200;
    var tw = imgEl.naturalWidth || imgEl.width;
    var th = imgEl.naturalHeight || imgEl.height;
    if (tw <= 0 || th <= 0) return;
    if (tw > thumbMax || th > thumbMax) {
      var ts = Math.min(thumbMax / tw, thumbMax / th);
      tw = Math.round(tw * ts); th = Math.round(th * ts);
    }
    var tmpC = document.createElement('canvas');
    tmpC.width = tw; tmpC.height = th;
    tmpC.getContext('2d').drawImage(imgEl, 0, 0, tw, th);
    var du = tmpC.toDataURL('image/jpeg', 0.92);
    var st = _galInit();
    var provNames = { unsplash: 'Unsplash', pexels: 'Pexels', pixabay: 'Pixabay' };
    var provIcons = { unsplash: 'camera', pexels: 'image', pixabay: 'image' };
    var provName = provNames[provider] || provider;
    var provIcon = provIcons[provider] || 'image';
    var provFolder = null;
    for (var fi = 0; fi < st.folders.length; fi++) {
      if (st.folders[fi].name === provName && !st.folders[fi].parentId) {
        provFolder = st.folders[fi]; break;
      }
    }
    if (!provFolder) {
      provFolder = galAddFolder(provName, provIcon, null);
      st = _galInit();
    }
    if (provFolder) {
      if (!provFolder.images) provFolder.images = [];
      if (provFolder.images.indexOf(du) === -1) provFolder.images.unshift(du);
      var pf2 = st.folders.filter(function(f){ return f.id === provFolder.id; })[0];
      if (pf2) { pf2.images = provFolder.images; }
    }
    if (!st.recent) st.recent = [];
    st.recent.unshift(du);
    var imgName = provName + ' \u2014 ' + (author || 'Unknown');
    if (!st.imageNames) st.imageNames = {};
    st.imageNames[_galImgHash(du)] = imgName;
    _galSave(st);
    // P3: also push the stock image to the panel media library (same bridge as gallery adds → /api/assets)
    try { if (typeof _galBridgeImage === 'function') _galBridgeImage(du, null); } catch (e) {}
    var cv = document.getElementById('images-cat-view');
    if (cv && cv.style.display !== 'none') renderImagesCategoryView();
  } catch(e) {}
}

// _stockSaveVideoToGallery removed — stock videos now use _saveVideoToGallery (with IDB key) via _stockAddVideoToCanvas

/* ── Download Progress Popup ─────────────────────────────────────────────── */
var _dlPopupState = { items: {}, el: null, dragging: false, collapsed: false, sx: 0, sy: 0, sl: 0, st: 0 };

function _dlPopupEnsure() {
  if (_dlPopupState.el && document.body.contains(_dlPopupState.el)) return _dlPopupState.el;
  var p = document.createElement('div');
  p.className = 'dl-popup';
  p.id = 'dl-popup';
  p.innerHTML =
    '<div class="dl-popup-head">' +
      '<span class="dl-popup-title"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Downloading</span>' +
      '<button class="dl-popup-collapse" title="Collapse">\u2212</button>' +
    '</div>' +
    '<div class="dl-popup-body" id="dl-popup-body"></div>';
  document.body.appendChild(p);
  _dlPopupState.el = p;
  _dlPopupState.collapsed = false;
  // Drag
  p.querySelector('.dl-popup-head').addEventListener('mousedown', function (e) {
    if (e.target.closest('.dl-popup-collapse')) return;
    _dlPopupState.dragging = true;
    _dlPopupState.sx = e.clientX; _dlPopupState.sy = e.clientY;
    var r = p.getBoundingClientRect();
    _dlPopupState.sl = r.left; _dlPopupState.st = r.top;
    e.preventDefault();
  });
  document.addEventListener('mousemove', function (e) {
    if (!_dlPopupState.dragging) return;
    p.style.left = (_dlPopupState.sl + e.clientX - _dlPopupState.sx) + 'px';
    p.style.top = (_dlPopupState.st + e.clientY - _dlPopupState.sy) + 'px';
    p.style.right = 'auto'; p.style.bottom = 'auto';
  });
  document.addEventListener('mouseup', function () { _dlPopupState.dragging = false; });
  // Collapse
  p.querySelector('.dl-popup-collapse').addEventListener('click', function () {
    _dlPopupState.collapsed = !_dlPopupState.collapsed;
    p.classList.toggle('collapsed', _dlPopupState.collapsed);
    this.textContent = _dlPopupState.collapsed ? '+' : '\u2212';
  });
  return p;
}

function _dlPopupShow(id, name) {
  _dlPopupEnsure();
  var body = document.getElementById('dl-popup-body');
  if (!body) return;
  var row = document.createElement('div');
  row.className = 'dl-popup-item';
  row.id = 'dl-item-' + id;
  row.innerHTML =
    '<div class="dl-popup-name" title="' + _escHtml(name) + '">' + _escHtml(name.length > 28 ? name.substring(0, 26) + '\u2026' : name) + '</div>' +
    '<div class="dl-popup-bar"><div class="dl-popup-fill" id="dl-fill-' + id + '" style="width:0%"></div></div>' +
    '<div class="dl-popup-pct" id="dl-pct-' + id + '">0%</div>';
  body.appendChild(row);
  _dlPopupState.items[id] = { name: name, done: false };
}

function _dlPopupUpdate(id, loaded, total) {
  var fill = document.getElementById('dl-fill-' + id);
  var pct = document.getElementById('dl-pct-' + id);
  if (!fill || !pct || !total) return;
  var p = Math.min(100, Math.round((loaded / total) * 100));
  fill.style.width = p + '%';
  pct.textContent = p + '% (' + Math.round(loaded / 1024) + '\u00a0KB\u00a0/\u00a0' + Math.round(total / 1024) + '\u00a0KB)';
}

function _dlPopupDone(id, success) {
  var row = document.getElementById('dl-item-' + id);
  if (!row) return;
  var fill = document.getElementById('dl-fill-' + id);
  if (fill) fill.style.width = '100%';
  var pct = document.getElementById('dl-pct-' + id);
  if (pct) pct.textContent = success ? 'Done \u2713' : 'Failed';
  row.classList.add(success ? 'dl-done' : 'dl-error');
  setTimeout(function () {
    if (row.parentNode) row.parentNode.removeChild(row);
    delete _dlPopupState.items[id];
    // Remove popup if no items pending
    if (_dlPopupState.el) {
      var body = document.getElementById('dl-popup-body');
      if (body && body.childElementCount === 0) {
        _dlPopupState.el.parentNode && _dlPopupState.el.parentNode.removeChild(_dlPopupState.el);
        _dlPopupState.el = null;
      }
    }
  }, 2500);
}

function _fetchWithProgress(url, onProgress) {
  return fetch(url).then(function (resp) {
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var total = parseInt(resp.headers.get('content-length') || '0', 10);
    if (!resp.body || !resp.body.getReader) {
      // Fallback: no streaming support
      return resp.blob();
    }
    var reader = resp.body.getReader();
    var chunks = [];
    var loaded = 0;
    function pump() {
      return reader.read().then(function (result) {
        if (result.done) {
          return new Blob(chunks);
        }
        chunks.push(result.value);
        loaded += result.value.byteLength;
        if (onProgress) onProgress(loaded, total);
        return pump();
      });
    }
    return pump();
  });
}

function _stockAddVideoToCanvas(videoUrl, provider, author, poster, itemName) {
  if (!videoUrl) { if (typeof showToast === 'function') showToast('Video URL not available'); return; }
  var vidName = itemName || (provider + ' \u2014 ' + (author || 'Unknown'));
  var idbKey = _ccVideoGenKey();
  var dlId = idbKey;
  _dlPopupShow(dlId, vidName);

  // 1) Fetch video as blob with progress
  _fetchWithProgress(videoUrl, function (loaded, total) {
    _dlPopupUpdate(dlId, loaded, total);
  }).then(function (blob) {
    var blobUrl = URL.createObjectURL(blob);
    // P3: also upload the downloaded stock video to the panel media library (blob in hand → no re-fetch).
    // NOT when the video editor is active: there the timeline import + save path uploads the same bytes
    // once already (deduped by source id), so this second fire-and-forget upload made every stock add
    // in video mode file TWO library rows (owner duplicate bug).
    var _veUp = typeof VideoEditor !== 'undefined' && VideoEditor.isActive && VideoEditor.isActive();
    try { if (!_veUp && window.CCAssets && CCAssets.active) CCAssets.uploadBlob(blob, { name: vidName + '.mp4', mime: blob.type || 'video/mp4' }); } catch (e) {}

    // 2) Save blob to IndexedDB
    return _ccVideoIdbPut(idbKey, blob).then(function() {
      return blobUrl;
    }).catch(function() {
      // IDB save failed — still continue with blobUrl but no persistent key
      idbKey = null;
      return blobUrl;
    });
  }).then(function(blobUrl) {

    // 3) Capture poster frame from downloaded blob
    var vid = document.createElement('video');
    vid.preload = 'auto';
    vid.muted = true;
    vid.playsInline = true;
    vid.crossOrigin = 'anonymous';
    vid.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(vid);
    var _done = false;

    function _finish(posterUrl) {
      if (_done) return;
      _done = true;
      var vidDuration = (vid.duration && isFinite(vid.duration)) ? vid.duration : 0;
      vid.pause();
      try { vid.src = ''; } catch (_) {}
      if (vid.parentNode) vid.parentNode.removeChild(vid);

      // 4) Save to gallery
      _dlPopupDone(dlId, true);
      _saveVideoToGallery(posterUrl, blobUrl, vidName, idbKey, vidDuration);
      var cv = document.getElementById('images-cat-view');
      if (cv && cv.style.display !== 'none' && typeof renderImagesCategoryView === 'function') renderImagesCategoryView();

      // 5) If Video Editor is active, route to timeline instead of Fabric canvas
      var _veIsOn = typeof VideoEditor !== 'undefined' && VideoEditor.isActive && VideoEditor.isActive();
      if (_veIsOn && window.VideoEditor && VideoEditor.importMediaFile) {
        var _doVeImport = function(b) {
          if (!b) return;
          var ext = 'mp4';
          if (b.type && b.type.indexOf('webm') !== -1) ext = 'webm';
          var f = new File([b], (vidName || 'video') + '.' + ext, { type: b.type || 'video/mp4' });
          VideoEditor.importMediaFile(f, vidDuration);
          if (typeof showToast === 'function') showToast('Video added to timeline (' + provider + ')');
        };
        if (idbKey && typeof _ccVideoIdbGet === 'function') {
          _ccVideoIdbGet(idbKey).then(function(b) {
            if (b) { _doVeImport(b); } else { fetch(blobUrl).then(function(r) { return r.blob(); }).then(_doVeImport).catch(function(){}); }
          }).catch(function() { fetch(blobUrl).then(function(r) { return r.blob(); }).then(_doVeImport).catch(function(){}); });
        } else {
          fetch(blobUrl).then(function(r) { return r.blob(); }).then(_doVeImport).catch(function(){});
        }
        return;
      }

      // 6) Normal mode: add to canvas
      fabric.Image.fromURL(posterUrl, function(img) {
        var s = (typeof getCanvasScale === 'function') ? getCanvasScale() : 1;
        var iw = Math.round(200 * s);
        img.scaleToWidth(iw);
        var c = (typeof getCanvasCenter === 'function') ? getCanvasCenter() : { x: (CW || 700) / 2, y: (CH || 400) / 2 };
        img.set({
          left: c.x - iw / 2,
          top: c.y - iw / 2,
          _isVideoMedia: true,
          _videoSrc: blobUrl,
          _videoPoster: posterUrl,
          _videoName: vidName,
          _videoIdbKey: idbKey,
          objectCaching: false
        });
        canvas.add(img);
        canvas.setActiveObject(img);
        _ccAttachVideoElement(img, blobUrl);
        canvas.renderAll();
        if (typeof snap === 'function') snap();
        if (typeof showToast === 'function') showToast('Video added (' + provider + ', by ' + (author || 'Unknown') + ')');
      });
    }

    vid.addEventListener('loadeddata', function() {
      vid.currentTime = 0.5;
    });
    vid.addEventListener('seeked', function() {
      var vw = vid.videoWidth || 640;
      var vh = vid.videoHeight || 360;
      var oc = document.createElement('canvas');
      oc.width = vw; oc.height = vh;
      oc.getContext('2d').drawImage(vid, 0, 0, vw, vh);
      _finish(oc.toDataURL('image/jpeg', 0.8));
    });
    vid.addEventListener('error', function() {
      // Poster capture failed — use thumbnail or placeholder
      var fallback = poster || 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect fill="%23232328" width="320" height="180"/><text x="160" y="95" text-anchor="middle" fill="%23f2ff58" font-size="14">Video</text></svg>');
      _finish(fallback);
    });
    // Timeout fallback in case events don't fire
    setTimeout(function() {
      if (!_done) {
        var fallback = poster || 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect fill="%23232328" width="320" height="180"/><text x="160" y="95" text-anchor="middle" fill="%23f2ff58" font-size="14">Video</text></svg>');
        _finish(fallback);
      }
    }, 8000);
    vid.src = blobUrl;

  }).catch(function(err) {
    _dlPopupDone(dlId, false);
    if (typeof showToast === 'function') showToast('Video download failed: ' + (err.message || err), 'error');
  });
}

function _stockSaveAudioToGallery(audioUrl, provider, author, tags, duration) {
  try {
    var st = _galInit();
    if (!st.recent) st.recent = [];
    st.recent.unshift({ type: 'audio', url: audioUrl, provider: provider, author: author || 'Unknown', tags: tags || '', duration: duration || 0, _addedAt: Date.now() });
    _galSave(st);
    // P3: also save the stock audio to the panel media library (server-side fetch → CORS-safe)
    try { if (window.CCAssets && CCAssets.active) CCAssets.saveStock(audioUrl, { kind: 'audio', name: (author ? author + ' — ' : '') + provider, source: provider }); } catch (e) {}
    if (typeof showToast === 'function') showToast('Audio saved to library (' + provider + ')');
    var cv = document.getElementById('images-cat-view');
    if (cv && cv.style.display !== 'none') renderImagesCategoryView();
  } catch(e) {}
}

function _stockAddToCanvas(imgUrl, provider, author) {
  // If grid cell select mode is active, place into cell instead
  if (typeof _glIsSelectMode === 'function' && _glIsSelectMode()) {
    if (typeof _glPlaceImageInCell === 'function' && typeof _glExitSelectMode === 'function') {
      var _sg = typeof _glGetSelectingGrid === 'function' ? _glGetSelectingGrid() : null;
      var _sc = typeof _glGetSelectingCell === 'function' ? _glGetSelectingCell() : null;
      if (_sg && _sc) {
        _glPlaceImageInCell(_sg, _sc, imgUrl);
        _glExitSelectMode();
        if (typeof showToast === 'function') showToast('Stock photo placed in cell (' + provider + ')');
        // Also save to gallery (provider folder + Recent Uploads)
        var _gridImg = new Image();
        _gridImg.crossOrigin = 'anonymous';
        _gridImg.onload = function() { _stockSaveToGallery(_gridImg, provider, author); };
        _gridImg.src = imgUrl;
        return;
      }
    }
  }
  if (typeof showToast === 'function') showToast('Adding image...');
  fabric.Image.fromURL(imgUrl, function(img) {
    var maxW = (typeof CW !== 'undefined' ? CW : 700) * 0.8;
    var maxH = (typeof CH !== 'undefined' ? CH : 400) * 0.8;
    var scale = Math.min(maxW / img.width, maxH / img.height, 1);
    img.set({ scaleX: scale, scaleY: scale });
    if (typeof addToCenter === 'function') addToCenter(img);
    else { canvas.add(img); canvas.setActiveObject(img); canvas.requestRenderAll(); }
    if (typeof showToast === 'function') showToast('Photo added (' + provider + ', by ' + author + ')');
    // Portal-backed: let the server fetch the ORIGINAL (full-res, CORS-safe) into the org
    // library via /api/stock/save, then re-sync so it shows in the Library grid. Standalone
    // keeps the local client-side re-encode path.
    if (window.CCAssets && CCAssets.active && CCAssets.saveStock) {
      CCAssets.saveStock(imgUrl, { kind: 'image', source: provider, name: provider + ' - ' + (author || 'Unknown') })
        .then(function(a) { if (a && typeof galSyncRemote === 'function') galSyncRemote(); });
    } else {
      _stockSaveToGallery(img.getElement(), provider, author);
    }
  }, { crossOrigin: 'anonymous' });
}

/* ── HTML escape helper ── */
function _escHtml(str) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

/* ── Render gallery grid (legacy compat — now renders recent) ── */
function renderGalleryGrid(container) {
  var recent = galGetRecent();
  if (recent.length === 0) {
    container.innerHTML = '<p class="gal-empty-msg">No images yet.</p>';
    return;
  }
  var grid = document.createElement('div');
  grid.className = 'gal-image-grid';
  grid.dataset.folderId = '__recent';
  recent.forEach(function(entry, idx) {
    var isVideo = (typeof entry === 'object' && entry.type === 'video');
    var dataUrl = isVideo ? entry.poster : entry;
    var cell = _createImageCell(dataUrl, '__recent', idx);
    if (isVideo) {
      _patchVideoCell(cell, entry, '__recent', idx);
      var badge = document.createElement('div');
      badge.className = 'gallery-cell-play-badge';
      badge.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>';
      cell.style.position = 'relative';
      cell.appendChild(badge);
    }
    grid.appendChild(cell);
  });
  container.appendChild(grid);
}

// Self-init the load-time setup app.js used to call in initContextMenu (canvas file-drop +
// video hover/canvas events). The gallery owns these now → they run on module load, with no
// race against the loader and no error if the gallery is disabled.

if (window.cc && cc.modules) cc.modules.register({ id: 'stock', parent: 'left-panel.gallery', title: 'Gallery: stock', mount: function () {}, unmount: function () {} });
