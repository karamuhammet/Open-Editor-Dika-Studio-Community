/* Module: export/share-menu — the "Paylaş" (Share) mega-dropdown (export-import-manager-plan Phase 2).
   A body-appended, anchor-positioned popover that replaces the legacy "Get My Card" (#btn-export ->
   openModal) topbar button. Paged card grid (root quick-actions + social + message, with a "Tumunu gor"
   social sub-screen), real outside-click + Escape close. Every action wires to a REAL handler (no ghost):
     Indir        -> ExportManager.open('page')  (Phase 3 rebuilds that modal)
     Yazdir       -> _shPrint()  (renders the current part via renderPart, prints it)
     Proje dosyasi-> exportCardFile()  (Phase 7 makes it lossless)
     Baglanti     -> copies window.location.href  (Phase 8 = real share token)
     social/mesaj -> real web-intent share of the current link
   FLAT sub-module of export: functions are window globals; the topbar button calls toggleShareMenu at
   runtime, so load order is irrelevant. */
(function (global) {
  'use strict';

  var POP = null;          // the popover element (built once, reused)
  var OPEN = false;
  var _docBound = false;

  /* ── Icons ──────────────────────────────────────────────────────────────────────────────────────
     UI actions use Lucide-style stroke glyphs; social/messaging use monochrome brand marks (inherit
     currentColor, gold on hover — matches the editor's .wf-cat-card language). Self-contained so no tile
     is ever iconless. */
  var IC = {
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
    project: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 12 15 15"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>',
    email: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22 4 12 13 2 4"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>',
    youtube: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"/></svg>',
    linkedin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 11v5"/><path d="M8 8v.01"/><path d="M12 16v-5"/><path d="M16 16v-3a2 2 0 0 0-4 0"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l6.5 8L4 20h2l5.5-6.8L16 20h4l-6.8-8.5L19.5 4H18l-5 6.2L9 4z"/></svg>',
    pinterest: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 20c-.5-2 .5-5 1-7 .3-1.2-.2-2.5.6-3.4A2.6 2.6 0 0 1 16 11.4c-.3 2-1.6 3.6-3.3 3.6-1 0-1.8-.8-1.5-1.9"/></svg>',
    reddit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><circle cx="9" cy="13" r="1"/><circle cx="15" cy="13" r="1"/><path d="M9 16.5c1.8 1 4.2 1 6 0"/><path d="M12 5l1 3.5"/><circle cx="13.5" cy="4.5" r="1.2"/><circle cx="20" cy="10" r="1.4"/><circle cx="4" cy="10" r="1.4"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-4-1L3 21l2-5.5a8.38 8.38 0 0 1-1-4A8.5 8.5 0 0 1 21 11.5z"/><path d="M8.5 8.5c.5 2 2.5 4 4.5 4.5l1.2-1a.7.7 0 0 1 .8-.1l1.4.7c.3.2.4.5.3.8-.4 1.2-1.7 1.8-2.9 1.4a8 8 0 0 1-5.4-5.4c-.4-1.2.2-2.5 1.4-2.9.3-.1.6 0 .8.3l.7 1.4a.7.7 0 0 1-.1.8z"/></svg>',
    telegram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 4.5 2.5 12l5 2 2 5.5 3-3.5 5 3.5z"/><path d="M7.5 14 18 6.5 9.5 15.5"/></svg>',
    messenger: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3C6.9 3 3 6.8 3 11.5c0 2.5 1.1 4.7 3 6.2V21l2.7-1.5c.9.3 1.9.4 3 .4 5.1 0 9-3.8 9-8.5S17.1 3 12 3z"/><path d="M7 13l3-3 2 2 3-3-3 3-2-2z"/></svg>'
  };
  function icon(name) { return '<span class="sharepop-ic">' + (IC[name] || IC.share) + '</span>'; }
  function _t(source) {
    return global.CCI18n && typeof global.CCI18n.t === 'function' ? global.CCI18n.t(source) : source;
  }

  /* Current shareable link. Phase 8 replaces this with a real read-only share-token URL. */
  var _cachedShareUrl = null;
  function _shDesignId() {
    try { var p = new URLSearchParams(global.location.search); return p.get('designId') || p.get('design') || null; } catch (e) { return null; }
  }
  function _shLink() {
    if (_cachedShareUrl) return _cachedShareUrl;
    try { return global.location.href; } catch (e) { return ''; }
  }
  // Ensure a public read-only share link for the current authenticated design (POST .../share → token URL),
  // falling back to the current URL when standalone / already a guest view. Warmed on menu-open + cached so
  // the social/message tiles open synchronously (an async window.open after fetch gets popup-blocked).
  function _ensureShareUrl(cb) {
    if (_cachedShareUrl) { cb(_cachedShareUrl); return; }
    var did = _shDesignId();
    if (!did || global.__ccGuestView) { cb(_shLink()); return; }
    fetch('/api/designs/' + encodeURIComponent(did) + '/share', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ share: true }) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (res) {
        if (res && res.shareToken) _cachedShareUrl = global.location.origin + '/editor?view=' + encodeURIComponent(res.shareToken);
        cb(_shLink());
      })
      .catch(function () { cb(_shLink()); });
  }
  function _shTitle() {
    try {
      if (typeof pages !== 'undefined' && typeof currentPageIndex !== 'undefined' && pages[currentPageIndex] && pages[currentPageIndex].label) {
        return pages[currentPageIndex].label;
      }
    } catch (e) {}
    return 'dika studio';
  }
  function _toast(msg, type) { if (typeof showToast === 'function') showToast(msg, type); }

  /* ── Real action handlers (no ghost) ──────────────────────────────────────────────────────────── */
  function _actDownload() { closeShareMenu(); if (typeof ExportManager === 'object' && ExportManager && typeof ExportManager.open === 'function') ExportManager.open('page'); else _toast('Export manager not available', 'error'); }
  function _actProject() { closeShareMenu(); if (typeof exportCardFile === 'function') exportCardFile(); else _toast('Project export not available', 'error'); }
  function _actCopyLink() {
    var url = _shLink();
    var done = function () { _toast('Link copied'); };
    try {
      if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(url).then(done, function () { _fallbackCopy(url, done); }); }
      else _fallbackCopy(url, done);
    } catch (e) { _fallbackCopy(url, done); }
    closeShareMenu();
  }
  function _fallbackCopy(text, done) {
    try { var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); if (done) done(); } catch (e) { _toast('Copy failed', 'error'); }
  }

  /* Print: render the current part off-canvas via the unified core, then print just that image. */
  function _actPrint() {
    closeShareMenu();
    var idx = (typeof currentPageIndex !== 'undefined') ? currentPageIndex : 0;
    var page = (typeof pages !== 'undefined') ? pages[idx] : null;
    if (!page || typeof renderPart !== 'function' || typeof resolvePartSource !== 'function') { try { global.print(); } catch (e) {} return; }
    if (typeof saveCurrentPage === 'function') saveCurrentPage();
    var src = resolvePartSource(page);
    if (!src) { try { global.print(); } catch (e) {} return; }
    renderPart(
      { kind: src.kind, json: src.json, w: src.w, h: src.h, bg: (src.bg != null ? src.bg : page.bg), x: src.x, y: src.y },
      { format: 'png', dpi: 300 }
    ).then(function (dataURL) {
      if (!dataURL) { _toast('Print render failed', 'error'); return; }
      var w = global.open('', '_blank');
      if (!w) { _toast('Print window blocked', 'error'); return; }
      w.document.write('<!doctype html><title>' + _shTitle() + '</title><style>html,body{margin:0}img{max-width:100%;display:block;margin:0 auto}@media print{@page{margin:8mm}}</style><img src="' + dataURL + '" onload="setTimeout(function(){window.focus();window.print();},80)">');
      w.document.close();
    });
  }

  /* Web-intent social/messaging share of the current link (real; Phase 8 upgrades tiles to OAuth publish
     without changing this UI). */
  var INTENTS = {
    instagram: null, // no web share-intent; open the app/site (handled below)
    facebook: 'https://www.facebook.com/sharer/sharer.php?u={u}',
    youtube: 'https://www.youtube.com/upload',
    tiktok: 'https://www.tiktok.com/upload',
    linkedin: 'https://www.linkedin.com/sharing/share-offsite/?url={u}',
    x: 'https://twitter.com/intent/tweet?url={u}&text={t}',
    pinterest: 'https://pinterest.com/pin/create/button/?url={u}&description={t}',
    reddit: 'https://www.reddit.com/submit?url={u}&title={t}',
    whatsapp: 'https://wa.me/?text={t}%20{u}',
    telegram: 'https://t.me/share/url?url={u}&text={t}',
    messenger: 'https://www.facebook.com/dialog/send?link={u}&app_id=0&redirect_uri={u}',
    email: 'mailto:?subject={t}&body={u}'
  };
  var LABELS = {
    instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok',
    linkedin: 'LinkedIn', x: 'X', pinterest: 'Pinterest', reddit: 'Reddit',
    whatsapp: 'WhatsApp', telegram: 'Telegram', messenger: 'Messenger', email: 'Email'
  };
  var PUBLISH_PLATFORMS = { instagram: 1, facebook: 1, tiktok: 1, linkedin: 1, x: 1 };
  function _actShare(key) {
    /* COMMUNITY EDITION: every tile here needs something this build does not have, and each was
       failing in its own way.

       The five PUBLISH platforms called ExportManager.openSocial, which went with export/social-publish,
       so they answered with a red "Social sharing unavailable" error toast: a control that looks
       enabled and reports a fault. The messaging and web-intent tiles were worse in a quieter way -
       they shared `_shLink()`, the current address, and here that is a local file path or a localhost
       URL. Nobody on the receiving end can open it, and nothing says so.

       So the tiles STAY (this is the third ad surface after AI and Products, owner) and clicking one
       says what automatic publishing is and why it needs an account. Download in the same menu still
       works, which is the honest alternative and the card names it. */
    if (window.CCEdition && CCEdition.serverless && CCEdition.showCard) {
      closeShareMenu();
      CCEdition.showCard('social');
      return;
    }
    // Publish-capable platforms open the social-publish flow (part -> platform -> now/scheduled),
    // NOT a raw external link intent. Messaging + non-publish targets keep the web-intent below.
    if (PUBLISH_PLATFORMS[key]) {
      closeShareMenu();
      if (typeof ExportManager === 'object' && ExportManager && typeof ExportManager.openSocial === 'function') ExportManager.openSocial(key);
      else _toast('Social sharing unavailable', 'error');
      return;
    }
    var url = _shLink(), title = _shTitle();
    var tmpl = INTENTS[key];
    closeShareMenu();
    if (!tmpl) {
      // No public web-intent (e.g. Instagram): copy the link + open the platform so the user can paste.
      _fallbackCopy(url, function () { _toast('Link copied, ' + (LABELS[key] || key) + ' opening'); });
      var home = { instagram: 'https://www.instagram.com/' }[key];
      if (home) global.open(home, '_blank', 'noopener');
      return;
    }
    var href = tmpl.replace(/\{u\}/g, encodeURIComponent(url)).replace(/\{t\}/g, encodeURIComponent(title));
    global.open(href, '_blank', 'noopener');
  }

  /* ── DOM ────────────────────────────────────────────────────────────────────────────────────── */
  function _tile(key) {
    return '<button class="sharepop-tile" data-share="' + key + '" type="button">' + icon(key) + '<span>' + _t(LABELS[key] || key) + '</span></button>';
  }
  function _card(act, ic, name, desc) {
    return '<button class="sharepop-card" data-act="' + act + '" type="button">' + icon(ic) +
      '<span class="sharepop-card-t">' + _t(name) + '</span><span class="sharepop-card-d">' + _t(desc) + '</span></button>';
  }

  /* The "İndir" subtitle is part-aware: a video page downloads MP4, a slide deck can also give PPTX,
     everything else gives raster/PDF. Recomputed on every open (the menu DOM is cached). */
  function _downloadDesc() {
    try {
      var p = (typeof pages !== 'undefined' && typeof currentPageIndex === 'number') ? pages[currentPageIndex] : null;
      if (p) {
        if (p._productType === 'video') return 'Video (MP4)';
        if (typeof pageHasSlideDeck === 'function' && pageHasSlideDeck(p)) return 'PPTX / PDF / PNG';
      }
    } catch (e) {}
    return 'PNG / JPG / PDF';
  }

  function _build() {
    var el = document.createElement('div');
    el.className = 'sharepop';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Share');
    el.innerHTML =
      '<div class="sharepop-arrow"></div>' +
      '<div class="sharepop-screen" data-screen="root">' +
      '<div class="sharepop-head">' + icon('share') + '<span>' + _t('Share') + '</span></div>' +
        '<div class="sharepop-sec">' +
          '<div class="sharepop-grid sharepop-grid-4">' +
            _card('download', 'download', 'Download', 'PNG / JPG / PDF') +
            _card('print', 'print', 'Print', 'Printer') +
            _card('project', 'project', 'Project file',
        (window.CCEdition && CCEdition.formats && CCEdition.formats.project) || '.dika') +
            _card('copylink', 'link', 'Copy link', 'Link') +
          '</div>' +
        '</div>' +
        '<div class="sharepop-sec">' +
          '<div class="sharepop-sec-t">' + _t('Share on social media') + '</div>' +
          '<div class="sharepop-grid sharepop-grid-social">' +
            _tile('instagram') + _tile('facebook') + _tile('youtube') + _tile('tiktok') +
            '<button class="sharepop-tile sharepop-tile-more" data-act="social-all" type="button">' + icon('more') + '<span>' + _t('View all') + '</span></button>' +
          '</div>' +
        '</div>' +
        '<div class="sharepop-sec">' +
          '<div class="sharepop-sec-t">' + _t('Send via message') + '</div>' +
          '<div class="sharepop-grid sharepop-grid-social">' +
            _tile('whatsapp') + _tile('email') + _tile('telegram') + _tile('messenger') +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="sharepop-screen" data-screen="social-all" hidden>' +
        '<div class="sharepop-back" data-act="back">' + icon('back') + '<span>' + _t('Back') + '</span></div>' +
        '<div class="sharepop-grid sharepop-grid-social">' +
          _tile('instagram') + _tile('facebook') + _tile('youtube') + _tile('tiktok') +
          _tile('linkedin') + _tile('x') + _tile('pinterest') + _tile('reddit') +
        '</div>' +
      '</div>';

    el.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-act],[data-share]') : null;
      if (!t) return;
      e.preventDefault();
      var share = t.getAttribute('data-share');
      if (share) { _actShare(share); return; }
      var act = t.getAttribute('data-act');
      if (act === 'download') _actDownload();
      else if (act === 'print') _actPrint();
      else if (act === 'project') _actProject();
      else if (act === 'copylink') _actCopyLink();
      else if (act === 'social-all') _drill('social-all');
      else if (act === 'back') _drill('root');
    });
    document.body.appendChild(el);
    return el;
  }

  function _drill(screen) {
    if (!POP) return;
    var scr = POP.querySelectorAll('.sharepop-screen');
    for (var i = 0; i < scr.length; i++) {
      var isTarget = scr[i].getAttribute('data-screen') === screen;
      if (isTarget) scr[i].removeAttribute('hidden'); else scr[i].setAttribute('hidden', '');
    }
  }

  function _position(anchor) {
    if (!POP || !anchor) return;
    var r = anchor.getBoundingClientRect();
    var vw = global.innerWidth || document.documentElement.clientWidth;
    var pw = POP.offsetWidth || 340;   // measurable while visibility:hidden (no display toggle needed)
    var left = Math.min(r.right - pw, vw - pw - 8);
    if (left < 8) left = 8;
    POP.style.left = Math.round(left) + 'px';
    POP.style.top = Math.round(r.bottom + 8) + 'px';
    var arrow = POP.querySelector('.sharepop-arrow');
    if (arrow) arrow.style.left = Math.round(r.left + r.width / 2 - left - 6) + 'px';
  }

  function openShareMenu(anchor) {
    if (!POP) POP = _build();
    _drill('root');
    // Refresh the part-aware "İndir" subtitle (video page => MP4, not PNG/JPG/PDF).
    var dd = POP.querySelector('[data-act="download"] .sharepop-card-d');
    if (dd) dd.textContent = _t(_downloadDesc());
    _position(anchor || document.getElementById('btn-export'));
    POP.classList.add('show');
    OPEN = true;
    _ensureShareUrl(function () {}); // warm the share-token URL so the tiles open synchronously on click
    var btn = document.getElementById('btn-export');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    if (!_docBound) {
      document.addEventListener('mousedown', _onDocDown, true);
      document.addEventListener('keydown', _onKey, true);
      global.addEventListener('resize', _onResize);
      _docBound = true;
    }
  }
  function closeShareMenu() {
    if (POP) POP.classList.remove('show');
    OPEN = false;
    var btn = document.getElementById('btn-export');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    if (_docBound) {
      document.removeEventListener('mousedown', _onDocDown, true);
      document.removeEventListener('keydown', _onKey, true);
      global.removeEventListener('resize', _onResize);
      _docBound = false;
    }
  }
  function toggleShareMenu(anchor) {
    var a = (anchor && anchor.getBoundingClientRect) ? anchor : document.getElementById('btn-export');
    if (OPEN) closeShareMenu(); else openShareMenu(a);
  }

  function _onDocDown(e) {
    if (!OPEN) return;
    var btn = document.getElementById('btn-export');
    if (POP && POP.contains(e.target)) return;
    if (btn && (btn === e.target || btn.contains(e.target))) return;
    closeShareMenu();
  }
  function _onKey(e) { if (OPEN && (e.key === 'Escape' || e.keyCode === 27)) { e.stopPropagation(); closeShareMenu(); } }
  function _onResize() { if (OPEN) _position(document.getElementById('btn-export')); }

  global.toggleShareMenu = toggleShareMenu;
  global.openShareMenu = openShareMenu;
  global.closeShareMenu = closeShareMenu;

  if (global.cc && cc.modules) cc.modules.register({ id: 'share-menu', parent: 'export', title: 'export: share-menu', mount: function () {}, unmount: function () {} });
})(window);
