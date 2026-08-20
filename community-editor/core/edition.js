/* ============================================================
   core/edition.js - THE edition switch for the Community Editor.

   This build (apps/community-editor, BUSL-1.1) runs with NO server: no account, no /api, no
   telemetry. Documents live in the browser, media in IndexedDB, and every surface that needed our
   servers is either deleted or renders ONE card that says so.

   Design rules that must survive any edit (same rules system/readonly earned the hard way):

   - ONE SWITCH. `window.CCEdition`. Never scatter `if (community)` through modules again; that
     scattering is exactly how the read-only mode ended up half-locked.
   - THIS FILE LOADS FIRST, before core/bus.js, so no module can ask "which edition am I" before
     there is an answer. It therefore depends on NOTHING (no cc kernel, no fabric, no DOM ready).
   - A HOLLOW SURFACE IS A STATED SURFACE, NEVER A DISABLED ONE. `lockSurface` paints a real card
     with a title, a sentence about what the surface does, a sentence about why it needs an account,
     and (when a URL is configured) one button. A greyed-out panel that does nothing is still a lie,
     and a button that goes nowhere is the ghost UI this whole exception exists to avoid.
   - ONE WRITER. Every hollow surface calls `lockSurface`. Fourteen hand-written upsell states are
     fourteen copies that drift apart within a month.
   - The copy is ENGLISH. This is a global open-source build; the panel's Turkish is a different
     axis and does not follow the code here.

   Record: internal Community Edition plan.
   ============================================================ */
(function () {
  'use strict';

  /* The hosted service this build points at, and the one link every ad card carries. It was null
     from the first build of this edition (plan D1) and the owner answered it with the rename:
     "site linki gerekirse dika.studio ver".

     When it is null the card still renders its full explanation and simply carries no button, which
     is the behaviour to keep: a configuration gap must never become a control that goes nowhere. */
  var UPSELL_URL = 'https://dika.studio';

  /* THE ONE SERVER ADDRESS. Everything that leaves this build (sign in, the account beacon, an ad
     creative) is built from it, so there is exactly one string to change and exactly one to audit.
     `apps/web` is the app that owns /api, and this is its public host.

     `window.CC_API_BASE` overrides it, which is how a staging build and the proof harness point
     somewhere else. That is not a hole: anything able to set a global before this file runs is
     already running code in the page. Nothing shipped sets it. */
  var API_BASE = (typeof window !== 'undefined' && window.CC_API_BASE) || 'https://app.dika.studio';

  /* ── EVERY REQUEST THIS BUILD MAKES, ENUMERATED ────────────────────────────────────────────────
     THE LIST IS THE PRODUCT'S ANSWER to "what does it send", and it is checked against every surface
     that describes it by `tools/_network-claim-proof.mjs`. README.md, SECURITY.md, the first-run
     screen, Settings > Account and the launch copy all have to agree with THIS, and the checker goes
     red when they do not.

     It exists because the build told three different stories at once: SECURITY.md said it made no
     request of its own, which stopped being true when the beacon shipped; the README counted three;
     this comment counted three. Every one of them was written truthfully and then a feature landed.

     ADDING A REQUEST MEANS ADDING A ROW HERE FIRST. Anything else is a claim nobody checked. */
  var NETWORK = [
    { id: 'sign-in', host: 'app.dika.studio',
      when: 'only when you choose to sign in, and it is a code you type in your own browser' },
    { id: 'beacon', host: 'app.dika.studio',
      when: 'once a day, only if you agreed to it, and it carries a random install id and no work' },
    { id: 'notices', host: 'app.dika.studio',
      when: 'the sentence shown on the two panels this build cannot serve' },
    { id: 'update-check', host: 'app.dika.studio',
      when: 'on launch, asking only whether a newer version exists, and sending nothing' },
    { id: 'update-download', host: 'github.com',
      when: 'ONLY if you accept an update. This is the one that is not our server' }
  ];

  /* ── THE PROJECT FILE FORMATS, IN ONE PLACE ────────────────────────────────────────────────────
     Two formats, and the only difference is the media:
        .dika      the project STRUCTURE, no media bytes
        .dikapack  the same, plus the media, as a ZIP
     They live here because this file loads first and depends on nothing, and because the alternative
     is what was here before: the same two strings written out at thirty call sites, which is how a
     rename becomes a week of hunting.

     `readable` is deliberately WIDER than what we write, and stays that way permanently. `.cardcraft`
     and `.ccproj` are what this app called these same two formats before the rename; somebody's file
     must not stop opening because we changed our mind about a name. Nothing inside the file carries
     the old name - its manifest already says `dika studio` - so this is a filename question only.
     WRITE the first two, READ all of them. */
  var FORMATS = {
    project: '.dika',
    package: '.dikapack',
    legacy: ['.cardcraft', '.ccproj'],
    readable: ['.dika', '.dikapack', '.cardcraft', '.ccproj', '.json']
  };
  /* For `input.accept` and drop zones, so no call site hand-joins the list and forgets one. */
  FORMATS.accept = FORMATS.readable.join(',');
  /* `/\.(dika|dikapack|cardcraft|ccproj)$/i` - built from the list rather than written beside it. */
  FORMATS.projectFileRe = new RegExp('\\.(' +
    FORMATS.readable.filter(function (e) { return e !== '.json'; })
      .map(function (e) { return e.slice(1); }).join('|') + ')$', 'i');

  /* Every hollow surface, in one table. A surface not listed here cannot be locked, which is what
     stops "just add another card" from quietly becoming the product. */
  var SURFACES = {
    ai: {
      title: 'AI is part of the dika studio service',
      what: 'Chat, image generation, AI editing, dubbing and translation run on dika studio servers.',
      why: 'This is the Community Edition. It has no AI service behind it, and your work stays on this machine.'
    },
    products: {
      title: 'Your product library lives in your account',
      what: 'Products, categories, brands and attributes come from the dika studio product catalogue.',
      why: 'This is the offline Community Edition, so there is no catalogue to read from.'
    },
    media: {
      title: 'The shared media library needs an account',
      what: 'Folders, tags and files shared across your devices and your team.',
      why: 'Here, media is stored in this browser only. Uploads and local files still work.'
    },
    templates: {
      title: 'Community templates need an account',
      what: 'The template gallery is published from the dika studio service.',
      why: 'Your own saved templates keep working and stay in this browser.'
    },
    works: {
      title: 'Projects in your account',
      what: 'Opening a project from the dika studio service, on any device.',
      why: 'Projects you make here are stored in this browser. Export a .dikapack to move them.'
    },
    tags: {
      title: 'Tags and brand sync need an account',
      what: 'Shared tags and brand kits across your projects and your team.',
      why: 'Local brand sets still work and stay in this browser.'
    },
    comments: {
      title: 'Comments need an account',
      what: 'Threads, mentions and notifications on a shared design.',
      why: 'Comments are stored on the dika studio service so other people can read them.'
    },
    collab: {
      title: 'Sharing and co-editing need an account',
      what: 'Share links, live presence and editing the same page together.',
      why: 'There is no server here to carry the other person.'
    },
    social: {
      title: 'Automatic publishing needs an account',
      what: 'Connect Instagram, Facebook, TikTok, LinkedIn or X once, then post or schedule straight from the editor.',
      why: 'That runs on dika studio servers. Here, use Download and upload the file yourself.'
    },
    /* Kept as a card for any surface that wants to explain the account in place. The launch gate
       (system/first-run) is the thing that actually ASKS, and it renders CCAccount's own panel, so
       what an account BUYS is written once, in core/account.js, not twice. */
    account: {
      title: 'An account adds the parts that need a server',
      what: 'The online template and asset library, plus release news and early access.',
      why: 'Everything you have been using keeps working without one, online or offline.'
    },
    studio: {
      title: 'Studio import needs an account',
      what: 'Bringing a Scene Builder or Studio project into the editor.',
      why: 'Those projects live on the dika studio service.'
    }
  };

  var CSS_ID = 'cc-edition-style';
  var CSS = [
    '.cc-locked{display:flex;align-items:center;justify-content:center;min-height:220px;padding:28px 22px;box-sizing:border-box}',
    '.cc-locked-card{max-width:340px;text-align:center}',
    '.cc-locked-title{font-size:14px;font-weight:600;color:var(--text,#e8e8ea);margin:0 0 10px}',
    '.cc-locked-what{font-size:12px;line-height:1.55;color:var(--text-dim,#9b9ba3);margin:0 0 8px}',
    '.cc-locked-why{font-size:12px;line-height:1.55;color:var(--text-faint,#6e6e78);margin:0}',
    '.cc-locked-btn{display:inline-block;margin-top:16px;padding:8px 18px;border-radius:6px;',
    'background:var(--gold,#f2ff58);color:#16161b;font-size:12px;font-weight:600;text-decoration:none;cursor:pointer}',
    '.cc-locked-btn:hover{filter:brightness(1.08)}',
    /* The same card as a centred dialog, for surfaces that are a BUTTON rather than a panel. */
    '.cc-locked-modal{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;',
    'justify-content:center;background:color-mix(in srgb,#000 55%,transparent)}',
    '.cc-locked-modal .cc-locked{background:var(--surface,#1a1a1f);border:1px solid var(--border,#2c2c33);',
    'border-radius:var(--r-md,8px);box-shadow:0 18px 60px rgba(0,0,0,.6);min-height:0;padding:30px 28px;max-width:400px}',
    '.cc-locked-close{position:absolute;top:14px;right:16px;background:none;border:0;color:var(--text-dim,#9b9ba3);',
    'font-size:22px;line-height:1;cursor:pointer;padding:4px 8px}'
  ].join('');

  function injectCss() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  function resolveEl(target) {
    if (!target) return null;
    if (typeof target === 'string') {
      return target.charAt(0) === '#'
        ? document.getElementById(target.slice(1))
        : document.querySelector(target);
    }
    return target.nodeType === 1 ? target : null;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Paint the card into `target`. Returns true when it painted, so a caller can tell a missing
     container from a locked one instead of assuming. */
  function lockSurface(target, key) {
    var el = resolveEl(target);
    if (!el) {
      if (window.console) console.warn('[edition] lockSurface: no element for', target);
      return false;
    }
    var s = SURFACES[key];
    if (!s) {
      if (window.console) console.warn('[edition] lockSurface: unknown surface "' + key + '"');
      return false;
    }
    injectCss();
    var btn = UPSELL_URL
      ? '<a class="cc-locked-btn" href="' + esc(UPSELL_URL) + '" target="_blank" rel="noopener noreferrer">Learn more</a>'
      : '';
    el.innerHTML =
      '<div class="cc-locked" data-cc-locked="' + esc(key) + '">' +
        '<div class="cc-locked-card">' +
          '<div class="cc-locked-title">' + esc(s.title) + '</div>' +
          '<p class="cc-locked-what">' + esc(s.what) + '</p>' +
          '<p class="cc-locked-why">' + esc(s.why) + '</p>' +
          btn +
        '</div>' +
      '</div>';
    return true;
  }

  /* Opened as a file, `fetch()` of a local file is refused by the browser: origin "null", scheme
     "file" not supported. Measured in Chromium. Everything built from <script>/<link>/<img> tags is
     fine, which is why the bundle, the fonts and the canvas all work from a double-clicked file -
     but anything that READS BYTES (the on-device AI models, a JSON data file) cannot.

     One place answers "can this build read a local file", so a feature that needs one can say WHY it
     is unavailable instead of failing with "Failed to fetch", which tells nobody anything. */
  function localFetchBlocked() {
    return typeof location !== 'undefined' && location.protocol === 'file:';
  }

  var FETCH_NOTE = 'This page was opened as a file, and a browser will not let a file read other ' +
    'files. Serve the folder instead (node scripts/static-server.js 8300) and this works.';

  /* Some surfaces are a BUTTON, not a panel: the share menu's social tiles have nowhere to paint a
     card in place. Same card, same table, shown as a dialog. It is a separate function rather than a
     flag on lockSurface because "paint this container" and "interrupt with a dialog" are different
     things, and only the second one needs dismissing. */
  function showCard(key) {
    var s = SURFACES[key];
    if (!s) { if (window.console) console.warn('[edition] showCard: unknown surface "' + key + '"'); return false; }
    injectCss();
    var prev = document.getElementById('cc-locked-modal');
    if (prev) prev.remove();
    var wrap = document.createElement('div');
    wrap.className = 'cc-locked-modal';
    wrap.id = 'cc-locked-modal';
    var btn = UPSELL_URL
      ? '<a class="cc-locked-btn" href="' + esc(UPSELL_URL) + '" target="_blank" rel="noopener noreferrer">Learn more</a>'
      : '';
    wrap.innerHTML =
      '<div class="cc-locked" data-cc-locked="' + esc(key) + '" style="position:relative">' +
        '<button class="cc-locked-close" type="button" aria-label="Close">&times;</button>' +
        '<div class="cc-locked-card">' +
          '<div class="cc-locked-title">' + esc(s.title) + '</div>' +
          '<p class="cc-locked-what">' + esc(s.what) + '</p>' +
          '<p class="cc-locked-why">' + esc(s.why) + '</p>' +
          btn +
        '</div>' +
      '</div>';
    function close() {
      wrap.remove();
      document.removeEventListener('keydown', onKey, true);
    }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    wrap.querySelector('.cc-locked-close').addEventListener('click', close);
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(wrap);
    return true;
  }

  window.CCEdition = {
    id: 'community',
    showCard: showCard,
    localFetchBlocked: localFetchBlocked,
    fetchNote: FETCH_NOTE,
    /* offline: THE WORK IS LOCAL. Documents, media, version history and every on-device model stay
       on this machine, and the app runs with no network at all.

       It does NOT mean "makes no request", and it used to. R8 (owner decision 2026-08-15) added
       added exactly five: signing in, the account beacon, an ad creative, the launch update check,
       and the installer download. None carries a document, none is required for the
       app to run, and every one of them is a row in NETWORK above.

       serverless: THERE IS NO CONTENT API HERE. No designs, no products, no shared media library, no
       share links, no comments. That is the question the six hollow surfaces ask, and R8 does not
       change the answer, so they keep reading this flag. It is deliberately NOT the same question as
       `offline`, and reading it as "makes no request" is the misreading this comment exists to stop.

       apiBase: the ONE address the permitted requests are built from - with one deliberate
       exception, the update check, whose URL is a constant in the shell precisely so that an
       `--api-base` override cannot repoint the channel that causes an installer to run. */
    offline: true,
    serverless: true,
    apiBase: API_BASE,
    NETWORK: NETWORK,
    upsellUrl: UPSELL_URL,
    formats: FORMATS,
    surfaces: SURFACES,
    lockSurface: lockSurface,
    isLocked: function (key) { return Object.prototype.hasOwnProperty.call(SURFACES, key); }
  };
})();
