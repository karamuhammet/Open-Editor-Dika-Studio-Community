/* ═══════════════════════════════════════════════════════════
   Module: left-panel/items — Items panel (Shapes/Emoji/GIFs/Stickers).
   PARENT: owns the shared engine the tabs reuse — SVG sanitizer, GIPHY
   fetch, animated-GIF frame decoder + render loop, add-to-canvas — and
   the main-view + drill orchestration via a small tab registry. Tabs are
   sub-modules (shapes/emoji/gif/stickers) that register through
   window.ItemsCore. The GIF runtime + sanitizer stay here (cohesive) and
   on window because export-manager/app.js call them. Depends on cc.*.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (!window.cc || !cc.modules) { console.warn('[items] cc skeleton missing'); return; }

  var TWEMOJI_SVG_BASE = 'js/vendor/twemoji/';
  var GIPHY_BASE = 'https://api.giphy.com/v1';
  var _giphyCache = {};
  var CACHE_TTL = 5 * 60 * 1000;

  function _cv() { return (window.cc && cc.rawCanvas) ? cc.rawCanvas() : (typeof canvas !== 'undefined' ? canvas : null); }
  function _scale() { return (window.cc && cc.scale) ? cc.scale() : 1; }
  function _add(o) { if (window.cc && cc.addToCenter) return cc.addToCenter(o); var c = _cv(); if (c) { c.add(o); c.setActiveObject(o); c.renderAll(); } }
  function _snap() { if (window.cc && cc.snap) cc.snap(); }

  function _getGiphyKey() {
    if (typeof window.ccStockSearch === 'function') return '__server_proxy__';
    if (typeof window._aiGetState === 'function') { var st = window._aiGetState(); return (st.providerKeys || {})._giphy || ''; }
    return '';
  }

  // ── SVG sanitizer (whitelist-based; also used by export-manager) ──
  var _SVG_SAFE_TAGS = { svg:1,g:1,path:1,circle:1,ellipse:1,rect:1,line:1,polyline:1,polygon:1,text:1,tspan:1,textpath:1,defs:1,use:1,symbol:1,clippath:1,mask:1,lineargradient:1,radialgradient:1,stop:1,filter:1,fegaussianblur:1,feoffset:1,feblend:1,fecolormatrix:1,fecomposite:1,feflood:1,femerge:1,femergenode:1,femorphology:1,image:1,title:1,desc:1,metadata:1,pattern:1,marker:1 };
  var _SVG_SAFE_ATTRS = { id:1,'class':1,style:1,d:1,fill:1,stroke:1,'stroke-width':1,'stroke-linecap':1,'stroke-linejoin':1,'stroke-dasharray':1,'stroke-dashoffset':1,'stroke-opacity':1,'fill-opacity':1,opacity:1,transform:1,viewbox:1,width:1,height:1,x:1,y:1,x1:1,y1:1,x2:1,y2:1,cx:1,cy:1,r:1,rx:1,ry:1,fx:1,fy:1,points:1,preserveaspectratio:1,xmlns:1,'xmlns:xlink':1,version:1,'font-size':1,'font-family':1,'font-weight':1,'font-style':1,'text-anchor':1,'text-decoration':1,'letter-spacing':1,'word-spacing':1,'dominant-baseline':1,'alignment-baseline':1,dx:1,dy:1,rotate:1,textlength:1,lengthadjust:1,startoffset:1,gradientunits:1,gradienttransform:1,spreadmethod:1,offset:1,'stop-color':1,'stop-opacity':1,'clip-path':1,'clip-rule':1,'fill-rule':1,'marker-start':1,'marker-mid':1,'marker-end':1,patternunits:1,patterntransform:1,patterncontentunits:1,filterunits:1,stddeviation:1,'in':1,in2:1,result:1,mode:1,values:1,type:1,basefrequency:1,numoctaves:1,seed:1,'xlink:href':1,href:1,overflow:1,display:1,visibility:1,color:1,'flood-color':1,'flood-opacity':1,'lighting-color':1,
    // Emitted by fabric's own toSVG() (measured on 5.3.0): `xml:space` on every <text>, `operator`
    // on the <feComposite> of a shadow. Without these, sanitising our OWN export dropped them.
    'xml:space':1,operator:1 };
  // Own-property lookup: a bare `MAP[name]` also resolves inherited Object.prototype keys, so an
  // attribute/tag literally named `constructor` or `toString` would pass the allowlist.
  function _allowed(map, name) { return Object.prototype.hasOwnProperty.call(map, name); }

  /* Strip every unsafe attribute from ONE element. Split out of _sanitizeNode so the ROOT <svg>
     goes through the same rules as its children — _sanitizeNode only ever walked childNodes, so
     `<svg onload="...">` survived sanitising untouched (svg-security-plan Faz 2). */
  // `java\tscript:` / `java&#9;script:` both reach the parser as `javascript:`, so compare against a
  // form with whitespace, control chars and numeric entities folded away — a bare indexOf misses them.
  function _hasActiveScheme(v) {
    var f = v.replace(/&#x?[0-9a-f]+;?/gi, function (e) {
      var hex = /^&#x/i.test(e), n = parseInt(e.replace(/[^0-9a-f]/gi, ''), hex ? 16 : 10);
      return isNaN(n) ? '' : String.fromCharCode(n);
    }).replace(/[\s\u0000-\u001F]/g, '');
    return f.indexOf('javascript:') !== -1 || f.indexOf('vbscript:') !== -1 || f.indexOf('data:text/html') !== -1;
  }

  // Only a same-document reference or an embedded RASTER image. `data:image/svg+xml` is dropped:
  // a nested SVG is another active document, and fabric only ever emits PNG here.
  function _safeRef(v) {
    return v.charAt(0) === '#' || v.indexOf('http://') === 0 || v.indexOf('https://') === 0 ||
      /^data:image\/(png|jpeg|gif|webp);base64,/i.test(v);
  }

  function _sanitizeAttrs(el) {
    var tag = el.nodeName.toLowerCase();
    var attrs = Array.prototype.slice.call(el.attributes);
    for (var a = attrs.length - 1; a >= 0; a--) {
      var an = attrs[a].name.toLowerCase();
      var av = (attrs[a].value || '').trim().toLowerCase();
      if (an.indexOf('on') === 0 || !_allowed(_SVG_SAFE_ATTRS, an)) { el.removeAttribute(attrs[a].name); continue; }
      if (_hasActiveScheme(av)) { el.removeAttribute(attrs[a].name); continue; }
      if (an === 'style') {
        // `style` CANNOT simply be dropped: fabric's own toSVG() writes every paint property through
        // it (measured), so removing it would gut our exports. Scrub the actively dangerous CSS
        // instead, and allow url() only for same-document paint servers (gradients: `url(#SVGID_0)`)
        // and embedded raster images — an external url() is at minimum a tracking beacon.
        if (/expression\s*\(|behaviou?r\s*:|@import/.test(av)) { el.removeAttribute(attrs[a].name); continue; }
        var urls = av.match(/url\(([^)]*)\)/g) || [];
        for (var u = 0; u < urls.length; u++) {
          var inner = urls[u].replace(/^url\(\s*['"]?/, '').replace(/['"]?\s*\)$/, '');
          if (!(inner.charAt(0) === '#' || /^data:image\/(png|jpeg|gif|webp);base64,/i.test(inner))) {
            el.removeAttribute(attrs[a].name); break;
          }
        }
        continue;
      }
      if (an === 'href' || an === 'xlink:href') {
        // <use> may only point INSIDE this document; an external <use> can pull in foreign markup.
        if (tag === 'use' ? av.charAt(0) !== '#' : !_safeRef(av)) { el.removeAttribute(attrs[a].name); }
      }
    }
  }

  function _sanitizeNode(node) {
    var children = Array.prototype.slice.call(node.childNodes);
    for (var i = children.length - 1; i >= 0; i--) {
      var child = children[i];
      if (child.nodeType === 1) {
        var tag = child.nodeName.toLowerCase();
        if (tag === 'script' || tag === 'iframe' || tag === 'object' || tag === 'embed' || tag === 'link' || tag === 'style' || tag === 'foreignobject' || tag === 'set' || tag === 'animate' || tag === 'animatetransform' || tag === 'animatemotion' || !_allowed(_SVG_SAFE_TAGS, tag)) { node.removeChild(child); continue; }
        _sanitizeAttrs(child);
        _sanitizeNode(child);
      } else if (child.nodeType !== 3) { node.removeChild(child); }
    }
  }
  function _sanitizeSVG(svgString) {
    if (!svgString || typeof svgString !== 'string') return '';
    var clean = svgString.replace(/<\?xml[^?]*\?>/gi, '').replace(/<!DOCTYPE[^>]*>/gi, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
    var doc = new DOMParser().parseFromString(clean, 'image/svg+xml');
    if (doc.querySelector('parsererror')) return '';
    var svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== 'svg') return '';
    _sanitizeAttrs(svg);   // the root's OWN attributes (Faz 2: `<svg onload=…>` used to survive)
    _sanitizeNode(svg);
    return new XMLSerializer().serializeToString(svg);
  }
  window._sanitizeSVG = _sanitizeSVG;

  // ── GIPHY fetch (cached) ──
  function _giphyFetch(type, endpoint, query, offset, limit, cb) {
    var cacheKey = type + ':' + endpoint + ':' + query + ':' + offset;
    var cached = _giphyCache[cacheKey];
    if (cached && (Date.now() - cached.ts < CACHE_TTL)) { cb(cached.data); return; }
    if (typeof window.ccStockSearch === 'function') {
      var page = Math.floor(Math.max(0, offset) / 24) + 1;
      var kind = type === 'stickers' ? 'sticker' : 'gif';
      var safeQuery = endpoint === 'search' ? (query || '') : '';
      window.ccStockSearch('giphy', safeQuery, page, kind, 'all').then(function (json) {
        var items = json && Array.isArray(json.items) ? json.items : [];
        var data = items.map(function (item) {
          var animated = item.url || '';
          var still = item.thumb || animated;
          return {
            id: item.id || '', title: item.title || '',
            images: {
              original: { url: animated }, downsized: { url: animated }, fixed_width: { url: animated },
              fixed_height: { url: animated }, fixed_height_small: { url: animated },
              fixed_width_still: { url: still }, downsized_still: { url: still }, original_still: { url: still }
            }
          };
        });
        _giphyCache[cacheKey] = { data: data, ts: Date.now() };
        cb(data);
      }).catch(function (err) { console.warn('GIPHY proxy error:', err); cb([]); });
      return;
    }
    var key = _getGiphyKey();
    if (!key) { cb([]); return; }
    var url = GIPHY_BASE + '/' + type + '/' + endpoint + '?api_key=' + encodeURIComponent(key) + '&limit=' + limit + '&offset=' + offset + '&rating=g';
    if (query && endpoint === 'search') url += '&q=' + encodeURIComponent(query);
    fetch(url).then(function (r) { if (!r.ok) throw new Error('GIPHY HTTP ' + r.status); return r.json(); })
      .then(function (json) { var data = json.data || []; _giphyCache[cacheKey] = { data: data, ts: Date.now() }; cb(data); })
      .catch(function (err) { console.warn('GIPHY fetch error:', err); cb([]); });
  }

  // ── Infinite scroll on the .flyout-body ancestor ──
  function _attachInfiniteScroll(viewEl, loadMoreFn) {
    var flyoutBody = viewEl.closest('.flyout-body');
    if (!flyoutBody) return;
    if (flyoutBody._itemsScrollFn) flyoutBody.removeEventListener('scroll', flyoutBody._itemsScrollFn);
    flyoutBody._itemsScrollFn = function () {
      if (viewEl.style.display === 'none') return;
      if (flyoutBody.scrollTop + flyoutBody.clientHeight >= flyoutBody.scrollHeight - 120) loadMoreFn();
    };
    flyoutBody.addEventListener('scroll', flyoutBody._itemsScrollFn);
  }

  // ── Add emoji (SVG) to canvas ──
  function _addEmojiToCanvas(cp) {
    var svgUrl = TWEMOJI_SVG_BASE + cp + '.svg';
    fetch(svgUrl).then(function (r) { if (!r.ok) throw new Error('Twemoji fetch ' + r.status); return r.text(); })
      .then(function (svgText) {
        var clean = _sanitizeSVG(svgText);
        if (!clean) { console.warn('Emoji SVG sanitize failed for', cp); return; }
        fabric.loadSVGFromString(clean, function (objects, options) {
          if (!objects || !objects.length) return;
          var group = fabric.util.groupSVGElements(objects, options);
          group.scaleToWidth(Math.round(80 * _scale()));
          group.set({ _isEmoji: true, _emojiCp: cp });
          _add(group);
          _snap();
        });
      })
      .catch(function (err) { console.warn('Emoji add failed:', err); });
  }

  // ── Animated-GIF frame decoder (omggif) + render loop ──
  var _gifAnimRafId = 0, _gifAnimActive = false;
  var _gifActiveObjects = [];
  var _GIF_MAX_SOURCE_BYTES = 20 * 1024 * 1024;
  var _GIF_MAX_FRAMES = 240;
  var _GIF_MAX_PIXELS = 4000000;
  var _GIF_MAX_DECODED_BYTES = 48 * 1024 * 1024;
  function _gifRegister(obj) {
    if (obj && _gifActiveObjects.indexOf(obj) === -1) _gifActiveObjects.push(obj);
  }
  function _gifDecodeFrames(url, cb) {
    var xhr = new XMLHttpRequest();
    var completed = false;
    function finish(value) { if (completed) return; completed = true; cb(value); }
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.timeout = 15000;
    xhr.onprogress = function (e) {
      if ((e.lengthComputable && e.total > _GIF_MAX_SOURCE_BYTES) || e.loaded > _GIF_MAX_SOURCE_BYTES) {
        xhr.abort();
        finish(null);
      }
    };
    xhr.onload = function () {
      if (!xhr.response || xhr.response.byteLength > _GIF_MAX_SOURCE_BYTES) { finish(null); return; }
      try {
        var buf = new Uint8Array(xhr.response);
        var reader = new GifReader(buf);
        var w = reader.width, h = reader.height, numFrames = reader.numFrames();
        var pixels = w * h;
        var decodedBytes = pixels * 4 * numFrames;
        if (numFrames < 1 || numFrames > _GIF_MAX_FRAMES || pixels < 1 || pixels > _GIF_MAX_PIXELS || decodedBytes > _GIF_MAX_DECODED_BYTES) {
          console.warn('GIF rejected: source exceeds frame/pixel/memory budget');
          finish(null);
          return;
        }
        var compCanvas = document.createElement('canvas');
        compCanvas.width = w; compCanvas.height = h;
        var compCtx = compCanvas.getContext('2d');
        var frames = [], prevImageData = null;
        for (var i = 0; i < numFrames; i++) {
          var fi = reader.frameInfo(i);
          var delay = fi.delay * 10;
          if (delay < 20) delay = 100;
          if (fi.disposal === 3) prevImageData = compCtx.getImageData(0, 0, w, h);
          var tempPixels = new Uint8Array(w * h * 4);
          reader.decodeAndBlitFrameRGBA(i, tempPixels);
          var patchData = new ImageData(new Uint8ClampedArray(tempPixels.buffer), w, h);
          var tempCvs = document.createElement('canvas');
          tempCvs.width = w; tempCvs.height = h;
          var tempCtx = tempCvs.getContext('2d');
          tempCtx.putImageData(patchData, 0, 0);
          compCtx.drawImage(tempCvs, 0, 0);
          frames.push({ imageData: compCtx.getImageData(0, 0, w, h), delay: delay });
          if (fi.disposal === 2) compCtx.clearRect(fi.x, fi.y, fi.width, fi.height);
          else if (fi.disposal === 3 && prevImageData) compCtx.putImageData(prevImageData, 0, 0);
        }
        finish({ width: w, height: h, frames: frames });
      } catch (e) { console.warn('GIF decode error:', e); finish(null); }
    };
    xhr.onerror = function () { finish(null); };
    xhr.ontimeout = function () { finish(null); };
    xhr.onabort = function () { finish(null); };
    xhr.send();
  }

  // M-M7: bounded LRU over decoded GIF frame stacks. Undo / page switches drop
  // _gifFrames and reattach re-fetched + re-decoded EVERY gif (full RGBA stacks)
  // each time — pure churn, the frames are immutable. Frames are shared by
  // reference (readers only putImageData), fetches in flight are deduped, and
  // the cache is capped by real pixel bytes with least-recently-used eviction.
  var _gifCache = {};                       // url -> { data, bytes, at }
  var _gifCacheBytes = 0;
  var _GIF_CACHE_MAX = 48 * 1024 * 1024;    // ~48MB of decoded frames
  var _gifPending = {};                     // url -> [cb...] (in-flight dedupe)
  function _gifDecodeFramesCached(url, cb) {
    var hit = _gifCache[url];
    if (hit) { hit.at = Date.now(); cb(hit.data); return; }
    if (_gifPending[url]) { _gifPending[url].push(cb); return; }
    _gifPending[url] = [cb];
    _gifDecodeFrames(url, function (decoded) {
      var cbs = _gifPending[url] || [];
      delete _gifPending[url];
      if (decoded && decoded.frames && decoded.frames.length) {
        var bytes = decoded.width * decoded.height * 4 * decoded.frames.length;
        if (bytes <= _GIF_CACHE_MAX) {
          _gifCache[url] = { data: decoded, bytes: bytes, at: Date.now() };
          _gifCacheBytes += bytes;
          while (_gifCacheBytes > _GIF_CACHE_MAX) {
            var oldest = null, oldestAt = Infinity;
            for (var k in _gifCache) { if (k !== url && _gifCache[k].at < oldestAt) { oldest = k; oldestAt = _gifCache[k].at; } }
            if (!oldest) break;
            _gifCacheBytes -= _gifCache[oldest].bytes;
            delete _gifCache[oldest];
          }
        }
      }
      for (var i = 0; i < cbs.length; i++) { try { cbs[i](decoded); } catch (e) {} }
    });
  }

  function _addGiphyToCanvas(giphyObj, type) {
    var origUrl = '', stillUrl = '';
    if (giphyObj.images) {
      origUrl = (giphyObj.images.original || {}).url || (giphyObj.images.downsized || {}).url || '';
      stillUrl = (giphyObj.images.fixed_width_still || {}).url || (giphyObj.images.downsized_still || {}).url || (giphyObj.images.original_still || {}).url || '';
    }
    if (!origUrl && !stillUrl) return;
    var loadUrl = origUrl || stillUrl;
    _gifDecodeFramesCached(loadUrl, function (decoded) {
      if (!decoded || !decoded.frames.length) {
        fabric.Image.fromURL(stillUrl || origUrl, function (img) {
          if (!img) return;
          var s2 = _scale();
          if (img.width > Math.round(200 * s2)) img.scaleToWidth(Math.round(200 * s2));
          var p = {};
          if (type === 'gif') { p._isGif = true; p._gifUrl = origUrl; p._gifTitle = giphyObj.title || ''; }
          else { p._isSticker = true; p._stickerUrl = origUrl; p._stickerTitle = giphyObj.title || ''; }
          img.set(p); _add(img); _snap();
        }, { crossOrigin: 'anonymous' });
        return;
      }
      var oc = document.createElement('canvas');
      oc.width = decoded.width; oc.height = decoded.height;
      var ctx = oc.getContext('2d');
      ctx.putImageData(decoded.frames[0].imageData, 0, 0);
      var fabricImg = new fabric.Image(oc, { objectCaching: false });
      var s = _scale();
      var maxW = Math.round(200 * s);
      if (fabricImg.width > maxW) fabricImg.scaleToWidth(maxW);
      var props = { _isAnimatedGif: true, _gifOrigUrl: origUrl, _gifStillUrl: stillUrl };
      if (type === 'gif') { props._isGif = true; props._gifUrl = origUrl; props._gifTitle = giphyObj.title || ''; }
      else { props._isSticker = true; props._stickerUrl = origUrl; props._stickerTitle = giphyObj.title || ''; }
      fabricImg.set(props);
      fabricImg._gifFrames = decoded.frames;
      fabricImg._gifFrameIndex = 0;
      fabricImg._gifLastFrameTime = performance.now();
      fabricImg._gifOffCanvas = oc;
      fabricImg._gifOffCtx = ctx;
      _gifRegister(fabricImg);
      _add(fabricImg); _snap();
      _startGifAnimLoop();
    });
  }

  function _startGifAnimLoop() { if (_gifAnimActive) return; _gifAnimActive = true; _gifAnimRafId = requestAnimationFrame(_gifRenderLoop); }
  function _gifRenderLoop(now) {
    if (!_gifAnimActive) return;
    var c = _cv(); if (!c) { _gifAnimActive = false; return; }
    var hasGif = false, changed = false;
    for (var i = _gifActiveObjects.length - 1; i >= 0; i--) {
      var obj = _gifActiveObjects[i];
      if (!obj || obj.canvas !== c || !obj._isAnimatedGif || !obj._gifFrames || !obj._gifOffCtx) {
        _gifActiveObjects.splice(i, 1);
        continue;
      }
      hasGif = true;
      if (document.hidden || (typeof obj.isOnScreen === 'function' && !obj.isOnScreen())) continue;
      var frames = obj._gifFrames;
      var elapsed = now - (obj._gifLastFrameTime || now);
      if (elapsed >= frames[obj._gifFrameIndex].delay) {
        obj._gifFrameIndex = (obj._gifFrameIndex + 1) % frames.length;
        obj._gifLastFrameTime = now;
        try { obj._gifOffCtx.putImageData(frames[obj._gifFrameIndex].imageData, 0, 0); obj.dirty = true; changed = true; } catch (e) {}
      }
    }
    if (hasGif) { if (changed) c.renderAll(); _gifAnimRafId = requestAnimationFrame(_gifRenderLoop); }
    else _gifAnimActive = false;
  }
  window._gifStopAnimLoop = function () { _gifAnimActive = false; if (_gifAnimRafId) { cancelAnimationFrame(_gifAnimRafId); _gifAnimRafId = 0; } };
  window._gifStartAnimLoop = function () { _startGifAnimLoop(); };
  window._gifRenderFrame = function (obj) {
    if (!obj || !obj._isAnimatedGif || !obj._gifFrames || !obj._gifOffCtx) return;
    _gifRegister(obj);
    try { var frame = obj._gifFrames[obj._gifFrameIndex || 0]; obj._gifOffCtx.putImageData(frame.imageData, 0, 0); obj.dirty = true; } catch (e) {}
  };
  window._gifReattachElements = function () {
    var c = _cv(); if (!c) return;
    var objs = c.getObjects(), needsLoop = false;
    for (var i = 0; i < objs.length; i++) {
      var obj = objs[i];
      if (obj._isAnimatedGif && !obj._gifFrames) {
        var url = obj._gifOrigUrl || obj._gifUrl || obj._stickerUrl || '';
        if (!url) continue;
        needsLoop = true;
        (function (target, gifUrl) {
          _gifDecodeFramesCached(gifUrl, function (decoded) {
            if (!decoded || !decoded.frames.length) return;
            var oc = document.createElement('canvas');
            oc.width = decoded.width; oc.height = decoded.height;
            var ctx = oc.getContext('2d');
            ctx.putImageData(decoded.frames[0].imageData, 0, 0);
            target._gifFrames = decoded.frames;
            target._gifFrameIndex = 0;
            target._gifLastFrameTime = performance.now();
            target._gifOffCanvas = oc;
            target._gifOffCtx = ctx;
            _gifRegister(target);
            target.setElement(oc);
            target.set({ dirty: true, objectCaching: false });
            c.renderAll();
            _startGifAnimLoop();
          });
        })(obj, url);
      }
    }
    if (needsLoop) _startGifAnimLoop();
  };

  // ── Tab registry — sub-modules register their tab here ──
  var _tabs = {};                       // key → { key, label, order, fillSlider, renderDrill }
  function registerTab(def) { if (def && def.key) _tabs[def.key] = def; }
  function _tabList() { return Object.keys(_tabs).map(function (k) { return _tabs[k]; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); }); }

  // ── Main view (one slider row per tab) ──
  function _buildCatRow(parent, tab) {
    var row = document.createElement('div');
    row.className = 'items-cat-row';
    var hdr = document.createElement('div');
    hdr.className = 'items-cat-header';
    hdr.innerHTML = '<span class="items-cat-title">' + tab.label + '</span><span class="items-cat-arrow">&rsaquo;</span>';
    hdr.addEventListener('click', function () { _drillIntoCategory(tab.key); });
    row.appendChild(hdr);
    var slider = document.createElement('div');
    slider.className = 'items-slider';
    if (typeof tab.fillSlider === 'function') { try { tab.fillSlider(slider); } catch (e) { console.error('[items] ' + tab.key + ' fillSlider failed:', e); } }
    row.appendChild(slider);
    parent.appendChild(row);
  }

  function renderItemsMainView() {
    var main = document.getElementById('items-main-view');
    if (!main) return;
    main.style.display = '';
    _hideDrillViews();
    var header = document.getElementById('flyout-header-title') || document.getElementById('flyout-title');
    if (header) header.textContent = 'Items';
    if (main.querySelector('.items-cat-row')) return;   // build once
    main.innerHTML = '';
    _tabList().forEach(function (tab) { _buildCatRow(main, tab); });
  }
  window.renderItemsMainView = renderItemsMainView;

  function _hideDrillViews() {
    ['items-icons-view', 'items-shapes-view', 'items-emoji-view', 'items-gif-view', 'items-lottie-view', 'items-stickers-view', 'items-myshapes-view'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.style.display = 'none';
    });
  }

  function _drillIntoCategory(key) {
    var main = document.getElementById('items-main-view');
    if (main) main.style.display = 'none';
    _hideDrillViews();
    var tab = _tabs[key];
    var view = document.getElementById('items-' + key + '-view');
    if (view) view.style.display = '';
    var header = document.getElementById('flyout-header-title') || document.getElementById('flyout-title');
    if (header && tab) header.textContent = tab.label;
    if (tab && typeof tab.renderDrill === 'function') { try { tab.renderDrill(); } catch (e) { console.error('[items] ' + key + ' renderDrill failed:', e); } }
  }

  window.itemsGoBack = function () { renderItemsMainView(); };
  window.initItemsPanel = function () { /* panel self-inits via module mount */ };

  // ── Shared API for the tab sub-modules ──
  window.ItemsCore = {
    sanitizeSVG: _sanitizeSVG,
    giphyFetch: _giphyFetch,
    addEmoji: _addEmojiToCanvas,
    addGiphy: _addGiphyToCanvas,
    attachInfiniteScroll: _attachInfiniteScroll,
    getGiphyKey: _getGiphyKey,
    registerTab: registerTab,
    drillInto: _drillIntoCategory
  };

  function mountChildren() { cc.modules.children('left-panel.items').forEach(function (c) { cc.modules.mount(c.fullId); }); }

  cc.modules.register({
    id: 'items', parent: 'left-panel',
    parent: 'left-panel',
    title: 'Items',
    icon: 'shapes',
    mount: function () { mountChildren(); },   // mount tabs (they register), then app.js openFlyout renders
    unmount: function () {}
  });
  if (cc.on) cc.on('modules:ready', mountChildren);
})();
