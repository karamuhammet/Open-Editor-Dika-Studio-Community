/* ============================================================
   system/register-wizard - THE registration wizard, full screen, published from :3001.

   IT IS NOT WRITTEN HERE. The steps come from `GET {apiBase}/api/community/wizard`, which serves the
   wizard the owner authors in the admin console (Forms > "Signup (Community Editor)"). Editing it
   there changes what this app shows on the next launch, with no release. That is the whole point:
   the first version of this screen was a small dialog with two buttons written into the app, and a
   registration flow that lives in the app is a registration flow nobody can change.

   IT RENDERS THE SAME VOCABULARY as the website's wizard (`WizardStep` in packages/db):
   `content`, `fields`, `cards`, `list`, with `layout`, `selection`, `showWhen`, `required` and
   `skippable`. A step type it cannot draw is dropped BY THE SERVER, not silently skipped here, so
   nobody ever meets a blank screen with a Next button under it.

   Rules that must survive an edit:

   - FULL SCREEN, and it is the first thing a person sees while signed out. Not a card, not a corner
     prompt: the owner asked for the real wizard and this is what "the real wizard" means.
   - THERE IS ALWAYS A WAY PAST IT. "Later" walks out for that session and writes nothing that
     suppresses the next launch. A person must be able to reach work already on their own disk.
   - IT NEVER BLOCKS THE BOOT. The definition is fetched with a timeout; with no answer it shows the
     built-in screen instead, which is the same screen it shows offline.
   - IT KEEPS THE LAST DEFINITION IT SAW (`CCIdb` settings, key `registerWizard`). Somebody who has
     been online once gets the authored flow afterwards even on a plane.
   - THE ANSWERS ARE NOT SENT UNTIL THE END, and the account is created by the server. Nothing here
     stores a password: it is held in the field, posted once, and the field is dropped with the DOM.

   Record: docs/community-edition-release-plan.md §18b
   ============================================================ */
(function () {
  'use strict';

  var CACHE_KEY = 'registerWizard';
  var FETCH_MS = 7000;

  var _def = null;        // { id, name, updatedAt, steps: [...] }
  var _el = null;
  var _step = 0;
  var _answers = {};
  var _busy = false;
  var _error = null;
  var _onClose = null;
  var _registered = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* "Have the answers been posted and are we now waiting on a browser." Asked of CCAccount rather
     than tracked here, because CCAccount owns the flow and a second copy of "are we waiting" is a
     second thing to get out of step. */
  function _flowHandoff() {
    if (_registered) return true;
    if (!window.CCAccount || !CCAccount.flow) return false;
    var f = CCAccount.flow();
    return !!(f && (f.status === 'pending' || f.status === 'starting' || f.status === 'expired' || f.status === 'denied' || f.status === 'error'));
  }

  function base() {
    var b = (window.CCEdition && CCEdition.apiBase) || null;
    return b ? String(b).replace(/\/+$/, '') : null;
  }

  /* ── the definition ─────────────────────────────────────────────────────── */

  /* The built-in flow. It is NOT a copy of the authored one and does not try to be: it is the
     smallest honest screen for somebody who has never been online, and it says so. Writing a second
     full flow here is exactly the drift this module exists to avoid. */
  function builtIn() {
    return {
      id: null,
      name: 'built-in',
      builtIn: true,
      steps: [{
        id: 'offline',
        type: 'content',
        layout: 'centered',
        title: 'Create your dika studio account',
        subtitle: 'An account unlocks the online template and asset library, and release news. The editor itself works either way.',
        consequences: [
          'This app could not reach dika studio just now, so the full sign-up flow is not available.',
          'You can carry on using the editor: everything except the online library works offline.',
          'It will ask again next time you open it.'
        ]
      }]
    };
  }

  function readCache() {
    if (!window.CCIdb || !CCIdb.available()) return Promise.resolve(null);
    return CCIdb.get('settings', CACHE_KEY).then(function (v) {
      return (v && v.def && v.def.steps && v.def.steps.length) ? v.def : null;
    })['catch'](function () { return null; });
  }

  function writeCache(def) {
    if (!window.CCIdb || !CCIdb.available()) return Promise.resolve(false);
    return CCIdb.put('settings', { at: Date.now(), def: def }, CACHE_KEY)['catch'](function () { return false; });
  }

  function fetchDefinition() {
    var b = base();
    if (!b) return Promise.resolve(null);
    var ctl = null;
    var timer = null;
    try { ctl = new AbortController(); } catch (e) { ctl = null; }
    if (ctl) timer = setTimeout(function () { try { ctl.abort(); } catch (e) {} }, FETCH_MS);
    var opts = { method: 'GET', credentials: 'omit', mode: 'cors', cache: 'no-store', redirect: 'error' };
    if (ctl) opts.signal = ctl.signal;
    return fetch(b + '/api/community/wizard', opts).then(function (r) {
      if (timer) clearTimeout(timer);
      if (!r.ok) return null;
      return r.json()['catch'](function () { return null; });
    })['catch'](function () {
      if (timer) clearTimeout(timer);
      return null;
    }).then(function (j) {
      var w = j && j.wizard;
      if (!w || !w.steps || !w.steps.length) return null;
      writeCache(w);
      return w;
    });
  }

  /* Network first, then the last definition seen, then the built-in screen. In that order, because a
     stale authored flow is closer to the truth than a hand-written apology. */
  function load() {
    return fetchDefinition().then(function (net) {
      if (net) return net;
      return readCache().then(function (c) { return c || builtIn(); });
    });
  }

  /* ── steps ──────────────────────────────────────────────────────────────── */

  /* `showWhen` is answered against the mapKey of an EARLIER step, exactly as the website's renderer
     does it, so a company-only step stays hidden for an individual. A hidden step is also skipped by
     the counter, or the progress reads "3 of 8" on a flow that is really five. */
  function visibleSteps() {
    var out = [];
    var steps = (_def && _def.steps) || [];
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i];
      if (s.showWhen && s.showWhen.key) {
        var v = _answers[s.showWhen.key];
        if (v !== s.showWhen.equals) continue;
      }
      out.push(s);
    }
    return out;
  }

  function answerKey(step) { return step.mapKey || step.id; }

  function isAnswered(step) {
    if (step.type === 'content') return true;
    if (step.type === 'fields') {
      var f = step.fields || [];
      for (var i = 0; i < f.length; i++) {
        if (!f[i].required) continue;
        var v = _answers[f[i].mapKey || f[i].key];
        /* A REQUIRED CHECKBOX IS UNANSWERED WHEN IT IS FALSE, and the general test below does not
           catch that: `false` is not undefined, not null and not an empty string, so an unticked
           "I accept the terms" box counted as answered and Next stayed enabled. Nobody would have
           accepted anything. */
        if (f[i].kind === 'checkbox') { if (!v) return false; continue; }
        if (v === undefined || v === null || v === '') return false;
      }
      return true;
    }
    var a = _answers[answerKey(step)];
    if (step.selection === 'multi') {
      var min = step.minSelections || (step.required ? 1 : 0);
      return Array.isArray(a) && a.length >= min;
    }
    return a !== undefined && a !== null && a !== '';
  }

  function canAdvance(step) {
    if (!step) return true;
    if (step.skippable) return true;
    if (!step.required) return true;
    return isAnswered(step);
  }

  /* ── rendering ──────────────────────────────────────────────────────────── */

  function localize(value) {
    return window.CCI18n && typeof CCI18n.t === 'function' ? CCI18n.t(value) : value;
  }

  function optionHtml(step, o, selected) {
    var isCard = step.type === 'cards';
    return '<button type="button" class="cc-rw-opt' + (isCard ? ' is-card' : ' is-row') + (selected ? ' is-on' : '') +
      '" data-rw-opt="' + esc(o.value) + '">' +
      '<span class="cc-rw-opt-label">' + esc(o.label) + '</span>' +
      (o.description ? '<span class="cc-rw-opt-desc">' + esc(o.description) + '</span>' : '') +
      '<span class="cc-rw-tick" aria-hidden="true"></span>' +
    '</button>';
  }

  /* A checkbox label may carry links, written `[text](https://...)`, because the one place a person
     must be able to reach the terms is the box that says they accept them. Everything else is still
     escaped, and the URL is accepted ONLY if it parses as https: a label is authored content that
     arrives over the network, so `javascript:` in it would be the whole attack. Rendered as a real
     anchor with `data-rw-link` so the click handler can send it to the system browser instead of
     navigating the app away from a half-filled form. */
  function linkify(text) {
    var out = '';
    var rest = String(text == null ? '' : text);
    var re = /\[([^\]]+)\]\(([^)\s]+)\)/;
    var m;
    while ((m = re.exec(rest))) {
      out += esc(rest.slice(0, m.index));
      var href = null;
      try {
        var u = new URL(m[2]);
        if (u.protocol === 'https:') href = u.href;
      } catch (e) { href = null; }
      out += href
        ? '<a class="cc-rw-link" data-rw-link href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' + esc(m[1]) + '</a>'
        : esc(m[1]);
      rest = rest.slice(m.index + m[0].length);
    }
    return out + esc(rest);
  }

  function fieldHtml(f) {
    var key = f.mapKey || f.key;
    var v = _answers[key];
    var id = 'rw-f-' + esc(f.key);
    var req = f.required ? ' <span class="cc-rw-req">*</span>' : '';
    /* `full` spans the row. The grid is two-up, which suits a first name beside a surname and leaves
       a lone dropdown sitting in half a row with a hole next to it. */
    var wide = f.full ? ' is-full' : '';
    var head = '<label class="cc-rw-field' + wide + '" for="' + id + '"><span class="cc-rw-flabel">' + esc(f.label) + req + '</span>';

    if (f.kind === 'checkbox') {
      return '<label class="cc-rw-check' + wide + '"><input type="checkbox" id="' + id + '" data-rw-field="' + esc(key) + '"' +
        (v ? ' checked' : '') + '><span>' + linkify(f.label) + req + '</span></label>';
    }
    if (f.kind === 'select' || f.kind === 'country') {
      var opts = f.options || [];
      /* Locale choices belong to the editor's one runtime catalogue. The published wizard once
         carried only Turkish and English, while Settings already offered eleven working locales.
         Reuse that catalogue so registration cannot drift behind the product again. */
      if (key === 'locale' && window.CCI18n && Array.isArray(CCI18n.locales) && CCI18n.locales.length) {
        opts = [];
        for (var li = 0; li < CCI18n.locales.length; li++) {
          opts.push({ value: CCI18n.locales[li].code, label: CCI18n.locales[li].label });
        }
        if ((v === undefined || v === null || v === '') && typeof CCI18n.locale === 'function') {
          v = CCI18n.locale();
          _answers[key] = v;
        }
      }
      var body = '<option value="">' + esc(f.placeholder || 'Select') + '</option>';
      for (var i = 0; i < opts.length; i++) {
        body += '<option value="' + esc(opts[i].value) + '"' + (v === opts[i].value ? ' selected' : '') + '>' + esc(opts[i].label) + '</option>';
      }
      /* A `country` field with no authored options has no list to draw, so it degrades to a text box
         rather than rendering an empty dropdown that cannot be answered. */
      if (f.kind === 'country' && !opts.length) {
        return head + '<input class="cc-rw-input" id="' + id + '" type="text" data-rw-field="' + esc(key) +
          '" value="' + esc(v || '') + '" placeholder="' + esc(f.placeholder || '') + '"></label>';
      }
      return head + '<select class="cc-rw-input" id="' + id + '" data-rw-field="' + esc(key) + '">' + body + '</select></label>';
    }
    var type = f.kind === 'phone' ? 'tel' : (f.kind === 'url' ? 'url' : (f.kind === 'email' ? 'email' : (f.kind === 'password' ? 'password' : 'text')));
    var extra = f.kind === 'password' ? ' autocomplete="new-password"' : (f.kind === 'email' ? ' autocomplete="email"' : '');
    return head + '<input class="cc-rw-input" id="' + id + '" type="' + type + '" data-rw-field="' + esc(key) + '"' + extra +
      ' value="' + esc(v == null ? '' : v) + '" placeholder="' + esc(f.placeholder || '') + '"></label>';
  }

  /* Once the answers are posted, the screen stops being a form and becomes the code the person has
     to type in a browser. Rendered by `CCAccount`, the same panel Settings > Account uses, so the
     six states of the flow exist once. */
  function handoffHtml() {
    return '<div class="cc-rw-handoff">' +
      (window.CCAccount && CCAccount.signInPanelHtml ? CCAccount.signInPanelHtml() : '') +
    '</div>';
  }

  function bodyHtml(step) {
    if (_flowHandoff()) return handoffHtml();
    if (step.type === 'content') {
      var lines = step.consequences || [];
      var out = '';
      for (var i = 0; i < lines.length; i++) out += '<li>' + esc(localize(lines[i])) + '</li>';
      return out ? '<ul class="cc-rw-list">' + out + '</ul>' : '';
    }
    if (step.type === 'fields') {
      var fs = step.fields || [];
      var h = '<div class="cc-rw-fields">';
      for (var j = 0; j < fs.length; j++) h += fieldHtml(fs[j]);
      return h + '</div>';
    }
    var opts = step.options || [];
    var cur = _answers[answerKey(step)];
    var multi = step.selection === 'multi';
    var g = '<div class="cc-rw-opts' + (step.type === 'cards' ? ' is-grid' : '') + '">';
    for (var k = 0; k < opts.length; k++) {
      var on = multi ? (Array.isArray(cur) && cur.indexOf(opts[k].value) !== -1) : cur === opts[k].value;
      g += optionHtml(step, opts[k], on);
    }
    return g + '</div>';
  }

  /* ── the media panel (layout: "split") ──────────────────────────────────
     The same shape the website renders: `media.slides[].imageKey` is used AS A URL (the server has
     already made it absolute), with an optional caption and tags over it. It is the surface the
     owner asked for so a picture can sit beside the question, which is also where a promotion goes.

     TWO RULES. It is hidden below 900px rather than stacked: a decorative image above the fold on a
     small window pushes the actual question off screen, and the question is the point. And a slide
     that fails to load leaves the panel empty rather than a broken-image box, because these URLs
     come from a server that may not be reachable. */
  var _slideTimer = null;
  var _slide = 0;

  function stopSlides() {
    if (_slideTimer) { clearInterval(_slideTimer); _slideTimer = null; }
  }

  function mediaHtml(step) {
    var m = step.media;
    if (!m || !m.slides || !m.slides.length) return '';
    var h = '<div class="cc-rw-media" data-rw-media>';
    for (var i = 0; i < m.slides.length; i++) {
      var s = m.slides[i];
      if (!s || !s.imageKey) continue;
      h += '<img class="cc-rw-slide' + (i === 0 ? ' is-on' : '') + '" data-rw-slide="' + i + '" src="' + esc(s.imageKey) +
        '" alt="" loading="lazy" onerror="this.style.display=\'none\'">';
    }
    var first = m.slides[0] || {};
    h += '<div class="cc-rw-media-cap" data-rw-cap>';
    if (first.caption) h += '<p>' + esc(first.caption) + '</p>';
    if (first.tags && first.tags.length) {
      h += '<div class="cc-rw-tags">';
      for (var t = 0; t < first.tags.length; t++) h += '<span>' + esc(first.tags[t]) + '</span>';
      h += '</div>';
    }
    h += '</div></div>';
    return h;
  }

  function startSlides(step) {
    stopSlides();
    var m = step.media;
    if (!m || !m.slides || m.slides.length < 2 || m.autoplay === false) return;
    _slide = 0;
    var every = Math.max(1500, Number(m.intervalMs) || 4500);
    _slideTimer = setInterval(function () {
      if (!_el) { stopSlides(); return; }
      var imgs = _el.querySelectorAll('[data-rw-slide]');
      if (!imgs.length) { stopSlides(); return; }
      _slide = (_slide + 1) % imgs.length;
      for (var i = 0; i < imgs.length; i++) imgs[i].className = 'cc-rw-slide' + (i === _slide ? ' is-on' : '');
      var cap = _el.querySelector('[data-rw-cap]');
      var s = m.slides[_slide] || {};
      if (cap) {
        var c = s.caption ? '<p>' + esc(s.caption) + '</p>' : '';
        if (s.tags && s.tags.length) {
          c += '<div class="cc-rw-tags">';
          for (var k = 0; k < s.tags.length; k++) c += '<span>' + esc(s.tags[k]) + '</span>';
          c += '</div>';
        }
        cap.innerHTML = c;
      }
    }, every);
  }

  function render() {
    if (!_el) return;
    var steps = visibleSteps();
    if (_step >= steps.length) _step = Math.max(0, steps.length - 1);
    var step = steps[_step];
    var last = _step === steps.length - 1;
    var pct = steps.length ? Math.round(((_step + 1) / steps.length) * 100) : 100;

    /* scaleX rather than width: see the note in register-wizard.css. The bar is full width and
       squeezed, so the number here is a fraction, not a percentage string. */
    _el.querySelector('.cc-rw-progress-fill').style.transform = 'scaleX(' + (pct / 100) + ')';
    _el.querySelector('.cc-rw-count').textContent = (_step + 1) + ' / ' + steps.length;
    _el.querySelector('[data-rw="back"]').style.visibility = (_registered || _step === 0) ? 'hidden' : '';

    var h = _el.querySelector('.cc-rw-head');
    h.innerHTML = _registered
      ? '<h1 class="cc-rw-title">Account ready</h1><p class="cc-rw-sub">You are signed in on this device.</p>'
      : '<h1 class="cc-rw-title">' + esc(localize(step.title || '')) + '</h1>' +
        (step.subtitle ? '<p class="cc-rw-sub">' + esc(localize(step.subtitle)) + '</p>' : '');
    _el.querySelector('.cc-rw-body').innerHTML = bodyHtml(step);

    /* Split: the question keeps the left column and the picture takes the right. `mediaSide: "left"`
       flips it with one class rather than a second markup path. */
    stopSlides();
    var main = _el.querySelector('.cc-rw-main');
    var media = _el.querySelector('.cc-rw-mediaslot');
    var split = step.layout === 'split' && step.media && step.media.slides && step.media.slides.length;
    main.className = 'cc-rw-main' + (split ? ' is-split' : '') + (split && step.mediaSide === 'left' ? ' is-left' : '');
    media.innerHTML = split ? mediaHtml(step) : '';
    if (split) startSlides(step);

    var err = _el.querySelector('.cc-rw-error');
    err.textContent = _error || '';
    err.style.display = _error ? '' : 'none';

    var next = _el.querySelector('[data-rw="next"]');
    next.textContent = _registered ? 'Continue to editor' : (_busy ? 'Working...' : (last ? 'Create my account' : 'Next'));
    next.disabled = _registered ? false : (_busy || !canAdvance(step));

    var skip = _el.querySelector('[data-rw="skip"]');
    skip.style.display = (!_registered && step.skippable && !last) ? '' : 'none';
    _el.querySelector('[data-rw="later"]').style.visibility = _registered ? 'hidden' : '';
  }

  function collect() {
    if (!_el) return;
    var inputs = _el.querySelectorAll('[data-rw-field]');
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      var key = el.getAttribute('data-rw-field');
      _answers[key] = el.type === 'checkbox' ? !!el.checked : el.value;
    }
    persistConsent();
  }

  /* The analytics consent is the ONE answer this app acts on LOCALLY, so it is written the moment it
     is given rather than waiting for the flow to finish. Somebody who ticks it and then presses
     Later has still answered the question, and somebody who unticks it must stop the beacon even if
     they never register. `CCFirstRun` owns the flag; there is no second copy. */
  var _lastConsent = null;
  function persistConsent() {
    if (!('analytics' in _answers)) return;
    var on = !!_answers.analytics;
    if (on === _lastConsent) return;
    _lastConsent = on;
    if (window.CCFirstRun && CCFirstRun.setTelemetry) CCFirstRun.setTelemetry(on);
  }

  /* THE FOOTER ONLY, NEVER A FULL RENDER, AND THIS IS THE WHOLE REASON IT EXISTS.
     Measured: without it, typing into a required field left "Next" disabled forever, because
     `canAdvance` was only re-evaluated when something re-rendered and nothing re-renders on a
     keystroke. Somebody would fill the form correctly and conclude the app was broken.
     Re-rendering the body instead would be worse: `innerHTML` on every keystroke destroys focus and
     the caret position, so the field cannot be typed into at all. */
  function refreshFooter() {
    if (!_el) return;
    var steps = visibleSteps();
    var step = steps[_step];
    var next = _el.querySelector('[data-rw="next"]');
    if (next) next.disabled = _busy || !canAdvance(step);
  }

  function onInput(e) {
    var t = e.target;
    if (!t || !t.getAttribute || !t.getAttribute('data-rw-field')) return;
    var key = t.getAttribute('data-rw-field');
    _answers[key] = t.type === 'checkbox' ? !!t.checked : t.value;
    if (key === 'analytics') persistConsent();
    refreshFooter();
  }

  /* ── submit ─────────────────────────────────────────────────────────────── */

  function submit() {
    var b = base();
    if (!b) { _error = 'This build has no server address configured, so it cannot create an account.'; render(); return; }
    _busy = true; _error = null; render();

    var ctl = null;
    var timer = null;
    try { ctl = new AbortController(); } catch (e) { ctl = null; }
    if (ctl) timer = setTimeout(function () { try { ctl.abort(); } catch (e) {} }, 15000);
    var opts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wizardId: _def && _def.id,
        installId: window.CCAccount ? CCAccount.installId() : null,
        platform: (window.CCDesktop && CCDesktop.isDesktop) ? 'desktop' : 'file',
        answers: _answers
      }),
      credentials: 'omit', mode: 'cors', cache: 'no-store'
    };
    if (ctl) opts.signal = ctl.signal;

    fetch(b + '/api/community/register', opts).then(function (r) {
      if (timer) clearTimeout(timer);
      return r.json().then(function (j) { return { ok: r.ok, status: r.status, data: j }; },
        function () { return { ok: false, status: r.status, data: null }; });
    })['catch'](function () {
      if (timer) clearTimeout(timer);
      return { ok: false, status: 0, data: null };
    }).then(function (res) {
      _busy = false;
      /* THE SERVER NO LONGER RETURNS A TOKEN HERE, and that is a security fix rather than a change
         of shape. An email address is a CLAIM, not a proof, so an endpoint that handed back a
         credential for any address typed into a free desktop app was account takeover by guessing.
         Registration now always ends in the device flow: an account created a moment ago is
         pre-approved, an address that already belongs to somebody waits for that person to approve
         it in a browser. The response is identical either way, which is also what stops this being
         an account-existence oracle - and it means this code cannot branch on which happened. */
      if (res.ok && res.data && res.data.deviceCode) {
        if (window.CCAccount && CCAccount.adoptDeviceFlow) {
          CCAccount.adoptDeviceFlow(res.data);
          CCAccount.onChange(function () {
            if (!_el) return;
            if (CCAccount.signedIn()) { _registered = true; _busy = false; render(); }
            else render();
          });
        }
        render();
        return;
      }
      _error = (res.data && res.data.error)
        ? String(res.data.error)
        : (res.status === 0
          ? 'Could not reach dika studio. Your answers are still here; try again, or continue and sign up later.'
          : 'That did not work (' + res.status + '). Try again, or continue and sign up later.');
      render();
    });
  }

  /* ── shell ──────────────────────────────────────────────────────────────── */

  function onClick(e) {
    var t = e.target;
    /* A terms link inside a checkbox label: open it in the real browser and DO NOT let the click
       reach the label, or reading the terms would silently tick the box that says you accepted
       them. Handled before anything else for that reason. */
    var link = t.closest && t.closest('[data-rw-link]');
    if (link) {
      e.preventDefault();
      e.stopPropagation();
      if (window.CCAccount && CCAccount.openExternal) CCAccount.openExternal(link.getAttribute('href'));
      else window.open(link.getAttribute('href'), '_blank', 'noopener');
      return;
    }
    var opt = t.closest && t.closest('[data-rw-opt]');
    if (opt) {
      var steps = visibleSteps();
      var step = steps[_step];
      var val = opt.getAttribute('data-rw-opt');
      var key = answerKey(step);
      if (step.selection === 'multi') {
        var cur = Array.isArray(_answers[key]) ? _answers[key].slice() : [];
        var at = cur.indexOf(val);
        if (at === -1) {
          if (step.maxSelections && cur.length >= step.maxSelections) return;
          cur.push(val);
        } else cur.splice(at, 1);
        _answers[key] = cur;
      } else {
        _answers[key] = val;
      }
      render();
      return;
    }
    var b = t.closest && t.closest('[data-rw]');
    if (!b) return;
    var act = b.getAttribute('data-rw');
    if (act === 'next' && _registered) { close(true); return; }
    if (act === 'later') { collect(); close(false); return; }
    if (act === 'back') { collect(); _error = null; _step = Math.max(0, _step - 1); render(); return; }
    if (act === 'skip') { collect(); _error = null; _step++; render(); return; }
    if (act === 'next') {
      collect();
      _error = null;
      var list = visibleSteps();
      if (_step === list.length - 1) { submit(); return; }
      _step++;
      render();
      return;
    }
  }

  /* Escape does not close it, for the same reason the setup wizard refuses: a gate that dismisses on
     a stray keypress is not one. "Later" is the way out and it is a labelled button. */
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return; }
    if (e.key === 'Enter' && _el && !_busy) {
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'TEXTAREA') return;
      var next = _el.querySelector('[data-rw="next"]');
      if (next && !next.disabled) { e.preventDefault(); next.click(); }
    }
  }

  function close(registered) {
    if (!_el) return;
    stopSlides();
    document.removeEventListener('keydown', onKey, true);
    _el.remove();
    _el = null;
    var cb = _onClose;
    _onClose = null;
    if (cb) cb(!!registered);
  }

  function open(def, onClose) {
    if (_el) return;
    _def = def || builtIn();
    _step = 0;
    _error = null;
    _busy = false;
    _registered = false;
    _onClose = onClose || null;

    var ov = document.createElement('div');
    ov.className = 'cc-rw-ov';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.innerHTML =
      '<div class="cc-rw-progress"><div class="cc-rw-progress-fill"></div></div>' +
      '<div class="cc-rw-top">' +
        '<button type="button" class="cc-rw-ghost" data-rw="back">Back</button>' +
        '<div class="cc-rw-brand"><img src="dika-logo.svg" alt="" class="cc-rw-mark"></div>' +
        '<div class="cc-rw-topright">' +
          '<span class="cc-rw-count"></span>' +
          '<button type="button" class="cc-rw-ghost" data-rw="later">Later</button>' +
        '</div>' +
      '</div>' +
      '<div class="cc-rw-main">' +
        '<div class="cc-rw-col">' +
          '<div class="cc-rw-head"></div>' +
          '<div class="cc-rw-body"></div>' +
          '<p class="cc-rw-error" role="alert"></p>' +
        '</div>' +
        '<div class="cc-rw-mediaslot"></div>' +
      '</div>' +
      '<div class="cc-rw-foot"><div class="cc-rw-footin">' +
        '<button type="button" class="cc-rw-ghost" data-rw="skip">Skip</button>' +
        '<button type="button" class="cc-rw-go" data-rw="next"></button>' +
      '</div></div>';
    ov.addEventListener('click', onClick);
    /* `input` covers typing, `change` covers a select and a checkbox. Both, or one of the three
       kinds of field silently fails to enable the button. */
    ov.addEventListener('input', onInput);
    ov.addEventListener('change', onInput);
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(ov);
    _el = ov;
    render();
  }

  window.CCRegisterWizard = {
    /* Fetch, then show. Returns a promise that resolves when it closes: true = they registered. */
    start: function (onClose) {
      return load().then(function (def) {
        open(def, onClose);
        return def;
      });
    },
    open: open,
    /* Drop the cached definition so the NEXT `start()` goes to the network. Without this, "show it
       again" re-renders the flow this machine already had and an edit published at :3001 is
       invisible until the cache ages out six hours later. */
    forget: function () {
      _def = null;
      if (!window.CCIdb || !CCIdb.available()) return Promise.resolve(false);
      return CCIdb.del('settings', CACHE_KEY).then(function () { return true; })
        ['catch'](function () { return false; });
    },
    isOpen: function () { return !!_el; },
    close: close,
    definition: function () { return _def; },
    /* Exposed so a proof can drive the flow without a server and without guessing selectors. */
    _state: function () {
      return {
        source: _def ? (_def.builtIn ? 'built-in' : 'published') : null,
        wizardId: _def ? _def.id : null,
        stepIndex: _step,
        stepCount: visibleSteps().length,
        stepId: (visibleSteps()[_step] || {}).id || null,
        stepType: (visibleSteps()[_step] || {}).type || null,
        answers: _answers,
        registered: _registered,
        error: _error
      };
    },
    _answer: function (key, value) { _answers[key] = value; render(); }
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'register-wizard', parent: 'system', title: 'Registration wizard', mount: function () {}, unmount: function () {} });
  }
})();
