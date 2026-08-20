/* ============================================================
   system/ads - the live creative, and the static card it falls back to.

   OWNER DECISION 2026-08-15 (plan D7): connect the ads. What that means here, and what it must never
   mean:

   - **THE STATIC CARD IS NOT REPLACED, IT IS THE FLOOR.** `CCEdition.lockSurface` paints an
     explanation into every hollow surface, offline, always, with no request. This module upgrades
     that card to a served creative WHEN one arrives. A person with no network sees exactly what they
     saw before, which is why the offline promise survives this phase.
   - **IT NEVER DELAYS THE CANVAS.** One request, a timeout, and a silent failure. The surfaces are
     already painted before this module has an answer; it swaps the contents in afterwards.
   - **OVERLAY FORMATS ARE REFUSED OUTRIGHT.** Not "handled carefully": refused. The hosted editor
     measured this the hard way and it cost the owner two bug reports. An `overlay` creative
     deliberately swallows the whole viewport, and if it is in the DOM but NOT PAINTED it captures
     every click and scroll while looking exactly like a frozen app, with no visible cause. The fix
     over there is a painted backdrop plus a timer floor plus telling the host about the painted
     state. Reimplementing that here, in a build nobody operates and cannot hotfix, is three chances
     to get it wrong. A panel that renders a card is worth having; a whole-screen ad is not.
   - **NOTHING ABOUT THE DOCUMENT IS SENT.** The request names a placement and the edition. It does
     not carry a design, a title, a page count, a selection or anything typed.
   - **IT IS NEVER A SCRIPT.** The creative is a title, a body, an image URL and a link. Serving
     executable code to an offline desktop app is an update channel nobody agreed to, and the CSP of
     the desktop shell would refuse it anyway.

   Record: docs/community-edition-release-plan.md §18b.5 item 8
   ============================================================ */
(function () {
  'use strict';

  /* The two panel surfaces the owner named, and the share tiles' card key. A placement not listed
     here cannot be served, which is what stops "just add another slot" from becoming the product. */
  var PLACEMENTS = ['ai', 'products', 'account', 'social'];

  var ALLOWED_FORMATS = ['card'];   // never 'overlay', see the header
  var TIMEOUT = 6000;
  var CACHE_KEY = 'adsCache';
  var CACHE_MS = 6 * 60 * 60 * 1000;

  var _creatives = null;   // placement -> creative, once fetched
  var _tried = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Only http(s), and only into the real browser. A creative is third-party copy in a first-party
     window; a `javascript:` or `data:` link there would be the whole attack. */
  function safeUrl(u) {
    if (!u) return null;
    try {
      var p = new URL(String(u), 'https://x.invalid');
      if (p.protocol !== 'http:' && p.protocol !== 'https:') return null;
      return p.href;
    } catch (e) { return null; }
  }

  function _endpoint() {
    var b = (window.CCEdition && CCEdition.apiBase) || null;
    return b ? String(b).replace(/\/+$/, '') + '/api/community/ads' : null;
  }

  function _cacheRead() {
    if (!window.CCIdb || !CCIdb.available()) return Promise.resolve(null);
    return CCIdb.get('settings', CACHE_KEY).then(function (v) {
      if (!v || !v.at || Date.now() - v.at > CACHE_MS) return null;
      return v.creatives || null;
    })['catch'](function () { return null; });
  }

  function _cacheWrite(creatives) {
    if (!window.CCIdb || !CCIdb.available()) return Promise.resolve(false);
    return CCIdb.put('settings', { at: Date.now(), creatives: creatives }, CACHE_KEY)
      ['catch'](function () { return false; });
  }

  /* One request per app start, cached for six hours. An editor session is long and an ad that
     changes under somebody mid-edit is a distraction, not a conversion. */
  function fetchCreatives() {
    if (_tried) return Promise.resolve(_creatives);
    _tried = true;
    var url = _endpoint();
    if (!url) return Promise.resolve(null);

    return _cacheRead().then(function (cached) {
      if (cached) { _creatives = cached; return _creatives; }
      var ctl = null;
      var timer = null;
      try { ctl = new AbortController(); } catch (e) { ctl = null; }
      if (ctl) timer = setTimeout(function () { try { ctl.abort(); } catch (e) {} }, TIMEOUT);
      var opts = { method: 'GET', credentials: 'omit', mode: 'cors', cache: 'no-store', redirect: 'error' };
      if (ctl) opts.signal = ctl.signal;

      var q = '?edition=community&placements=' + encodeURIComponent(PLACEMENTS.join(','));
      return fetch(url + q, opts).then(function (r) {
        if (timer) clearTimeout(timer);
        if (!r.ok) return null;
        return r.json()['catch'](function () { return null; });
      })['catch'](function () {
        if (timer) clearTimeout(timer);
        return null;
      }).then(function (json) {
        _creatives = _sanitize(json);
        if (_creatives) _cacheWrite(_creatives);
        return _creatives;
      });
    });
  }

  /* Everything a served creative may contain, and nothing else survives this function. An unknown
     placement, an unknown format and an unusable link are all dropped rather than rendered. */
  function _sanitize(json) {
    if (!json || typeof json !== 'object') return null;
    var src = json.creatives || json;
    var out = null;
    for (var i = 0; i < PLACEMENTS.length; i++) {
      var key = PLACEMENTS[i];
      var c = src[key];
      if (!c || typeof c !== 'object') continue;
      var format = String(c.format || 'card');
      if (ALLOWED_FORMATS.indexOf(format) === -1) continue;
      var clean = {
        title: c.title ? String(c.title).slice(0, 120) : null,
        body: c.body ? String(c.body).slice(0, 400) : null,
        image: safeUrl(c.image),
        ctaLabel: c.ctaLabel ? String(c.ctaLabel).slice(0, 40) : null,
        ctaUrl: safeUrl(c.ctaUrl)
      };
      if (!clean.title && !clean.body && !clean.image) continue;
      if (!out) out = {};
      out[key] = clean;
    }
    return out;
  }

  function creativeFor(placement) {
    return (_creatives && _creatives[placement]) || null;
  }

  /* Upgrade a card that is ALREADY on screen. The static card painted first, so a failure here
     leaves the surface exactly as `lockSurface` left it. */
  function paintInto(el, placement) {
    var c = creativeFor(placement);
    if (!el || !c) return false;
    var card = el.querySelector ? el.querySelector('.cc-locked-card') : null;
    if (!card) return false;
    var html = '';
    if (c.image) {
      html += '<img class="cc-ad-img" src="' + esc(c.image) + '" alt="" loading="lazy">';
    }
    if (c.title) html += '<div class="cc-locked-title">' + esc(c.title) + '</div>';
    if (c.body) html += '<p class="cc-locked-what">' + esc(c.body) + '</p>';
    if (c.ctaUrl) {
      html += '<a class="cc-locked-btn" data-cc-ad-cta href="' + esc(c.ctaUrl) + '" target="_blank" rel="noopener noreferrer">' +
        esc(c.ctaLabel || 'Learn more') + '</a>';
    }
    card.innerHTML = html;
    card.setAttribute('data-cc-ad', placement);
    _injectCss();
    return true;
  }

  var CSS_ID = 'cc-ads-style';
  function _injectCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = '.cc-ad-img{display:block;width:100%;max-width:280px;height:auto;margin:0 auto 14px;' +
      'border-radius:var(--r-md,8px);border:1px solid var(--border,#2c2c33)}';
    (document.head || document.documentElement).appendChild(s);
  }

  /* Sweep whatever is on screen. Called once after the fetch resolves, and again whenever a panel
     paints a card later (the Products panel is built on demand). */
  function refresh() {
    if (!_creatives) return 0;
    var n = 0;
    var nodes = document.querySelectorAll('[data-cc-locked]');
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute('data-cc-locked');
      if (nodes[i].querySelector('[data-cc-ad]')) continue;
      if (paintInto(nodes[i], key)) n++;
    }
    return n;
  }

  window.CCAds = {
    placements: PLACEMENTS,
    allowedFormats: ALLOWED_FORMATS,
    creativeFor: creativeFor,
    fetchCreatives: fetchCreatives,
    paintInto: paintInto,
    refresh: refresh,
    /* Read by the proof: an overlay creative must be dropped by _sanitize, never rendered. */
    _sanitize: _sanitize
  };

  if (window.cc && cc.on) {
    cc.on('cc:canvas-ready', function () {
      setTimeout(function () {
        cc.safe('system.ads', function () {
          fetchCreatives().then(function () { refresh(); });
        });
      }, 4000);
    });
  }

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'ads', parent: 'system', title: 'Ads', mount: function () {}, unmount: function () {} });
  }
})();
