/* ============================================================
   system/desktop - the bridge to the Electron shell, and NOTHING when there is not one.

   `window.CCDesktop` is injected by `apps/community-desktop/preload.js`. In a browser it is absent,
   this module returns immediately, and the build behaves exactly as it did before. That is the whole
   compatibility contract: the desktop app is an additional target, never a fork of the editor.

   WHAT THE DESKTOP BUILD CHANGES, and it is less than people expect:
   - The page is served over `app://`, a normal origin, so `fetch` of a local file works and the
     on-device AI models load. `CCEdition.localFetchBlocked()` already answers false there, so the
     panels that refuse on file:// light up on their own. Nothing here has to tell them.
   - Menus exist, so File > Open and File > Save reach real dialogs.
   - There is a data folder somebody can find and back up.

   REUSE, DO NOT REWRITE. Open and Save go through the EXISTING package reader and writer
   (`CCProjectPackage`) and the existing structure-file path. This module is wiring, not a second
   import/export implementation, because a second one drifts and then loses somebody's file.

   Record: docs/community-edition-release-plan.md §10
   ============================================================ */
(function () {
  'use strict';

  var D = window.CCDesktop;
  if (!D || !D.isDesktop) return;   // browser build: nothing to do, and no trace left behind

  function toast(msg, kind) {
    if (typeof window.showToast === 'function') window.showToast(msg, kind);
  }

  /* ── File > Open ────────────────────────────────────────────────────────
     The bridge hands back raw bytes plus a name. Everything after that is the reader the browser
     build already uses, so a file made on either target opens on both. */
  function openProject() {
    return D.openProject().then(function (picked) {
      if (!picked) return false;
      var file = new File([picked.bytes], picked.name, { type: 'application/zip' });
      if (typeof window.importProjectFile === 'function') return window.importProjectFile(file);
      if (window.CCProjectPackage && CCProjectPackage.openPackage) return CCProjectPackage.openPackage(file);
      if (typeof window.loadCardData === 'function') {
        return file.text().then(function (t) { return window.loadCardData(JSON.parse(t)); });
      }
      toast('Could not open: no importer is loaded', 'error');
      return false;
    })['catch'](function (e) {
      toast('Could not open the project: ' + (e && e.message ? e.message : 'unknown error'), 'error');
      return false;
    });
  }

  /* ── File > Save as ─────────────────────────────────────────────────────
     `CCProjectPackage.writePackage` with no target returns a Blob (its memory-safe path is the
     streaming one, which needs a file handle the browser gives it; here the SHELL owns the file, so
     the Blob path is the correct one and the bytes go out through the bridge). */
  function saveProject() {
    if (!(window.CCProjectPackage && CCProjectPackage.writePackage)) {
      toast('Project export is not loaded', 'error');
      return Promise.resolve(false);
    }
    /* File > Save as writes the MEDIA-CARRYING package, so it takes that extension. */
    var ext = (window.CCEdition && CCEdition.formats && CCEdition.formats.package) || '.dikapack';
    var name = 'project' + ext;
    try {
      var t = (window.pages && window.pages[0] && window.pages[0].label) || '';
      if (t) name = String(t).replace(/[^\w .-]/g, '_').slice(0, 60) + ext;
    } catch (e) {}

    return Promise.resolve(CCProjectPackage.writePackage({}))
      .then(function (blob) {
        if (!blob || !blob.arrayBuffer) throw new Error('the writer returned no file');
        return blob.arrayBuffer();
      })
      .then(function (buf) { return D.saveProject(name, buf); })
      .then(function (saved) {
        if (saved) toast('Saved to ' + saved.name);
        return !!saved;
      })['catch'](function (e) {
        toast('Could not save: ' + (e && e.message ? e.message : 'unknown error'), 'error');
        return false;
      });
  }

  /* ── the window chrome ──────────────────────────────────────────────────
     The shell has NO native title bar and NO menu bar (main.js: `titleBarStyle: 'hidden'` plus a
     `titleBarOverlay`). The window used to stack three rows before the canvas and print "File"
     twice. So the editor's own `#topbar` has to become the title bar, which is two things:

     1. IT MUST BE DRAGGABLE, or the window cannot be moved at all. `-webkit-app-region: drag` on the
        bar, and `no-drag` on everything inside it that can be pressed. Miss the second half and the
        logo, the menus and Share all stop responding: a drag region swallows clicks.
     2. IT MUST NOT PUT ANYTHING UNDER THE WINDOW BUTTONS. The OS draws minimise / maximise / close
        OVER the page at the top right. Their width is not fixed (it differs by platform, by DPI and
        by whether the window is maximised), so it is MEASURED through `windowControlsOverlay`
        rather than guessed, and re-measured when the window changes size. 138px is only the
        fallback for a runtime that does not expose the API. */
  function styleAsTitleBar() {
    var s = document.createElement('style');
    s.id = 'cc-desktop-chrome';
    s.textContent =
      '#topbar{-webkit-app-region:drag;' +
        /* THE RESERVED STRIP IS CSS, NOT JAVASCRIPT. The first version measured
           `windowControlsOverlay.getTitlebarAreaRect()` on load and on resize, and measured it
           correctly on one run and returned `visible: false` on the next, silently falling back to
           a guessed 138px. `env(titlebar-area-*)` is the same numbers as a declaration: the engine
           keeps it current through resize, maximise and DPI changes with no listener to miss an
           event, and the fallback expression is what an engine without the feature uses.

           reserved right = viewport - (area x + area width). */
        'padding-right:calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, calc(100vw - 138px)))}' +
      /* Everything pressable inside the bar, plus the two menus' popouts. A drag region swallows
         clicks, so missing one of these makes that control look broken rather than look undraggable. */
      '#topbar a,#topbar button,#topbar input,#topbar select,#topbar .mbar,' +
      '#topbar .mbar-menu,#topbar .dika-logo,#topbar [role="button"]{-webkit-app-region:no-drag}';
    (document.head || document.documentElement).appendChild(s);
  }

  /* ── the four items the native menu used to hold ────────────────────────
     Appended to the editor's OWN File and Help menus rather than left to a menu bar that no longer
     exists. Removing a menu without rehoming what it did is how a feature becomes unreachable while
     every test still passes. */
  function addMenuItems() {
    var groups = document.querySelectorAll('#mbar .mbar-group');
    var fileMenu = null;
    var helpMenu = null;
    for (var i = 0; i < groups.length; i++) {
      var item = groups[i].querySelector('.mbar-item');
      var label = item ? (item.textContent || '').trim() : '';
      if (label === 'File') fileMenu = groups[i].querySelector('.mbar-menu');
      if (label === 'Help') helpMenu = groups[i].querySelector('.mbar-menu');
    }
    function add(menu, label, fn) {
      if (!menu) return false;
      var b = document.createElement('button');
      b.className = 'mbar-mi';
      b.setAttribute('data-cc-desktop-item', '');
      b.textContent = label;
      b.addEventListener('click', fn);
      menu.appendChild(b);
      return true;
    }
    function sep(menu) {
      if (!menu) return;
      var d = document.createElement('div');
      d.className = 'mbar-sep';
      d.setAttribute('data-cc-desktop-item', '');
      menu.appendChild(d);
    }
    if (fileMenu) {
      sep(fileMenu);
      add(fileMenu, 'Open project file...', function () { openProject(); });
      add(fileMenu, 'Save project file...', function () { saveProject(); });
      add(fileMenu, 'Show data folder', function () { D.showDataDir(); });
    }
    if (helpMenu) {
      sep(helpMenu);
      add(helpMenu, 'Setup wizard', function () { if (window.CCFirstRun) CCFirstRun.open(); });
    }
    return { file: !!fileMenu, help: !!helpMenu };
  }

  function wireChrome() {
    styleAsTitleBar();
    addMenuItems();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireChrome);
  else wireChrome();

  /* ── the menu channel ───────────────────────────────────────────────────
     One inbound channel carrying a short action string, switched here. It is still wired because
     macOS keeps an application menu (see main.js) and because a future tray or jump-list item would
     use the same door. */
  D.onMenu(function (action) {
    if (action === 'open') { openProject(); return; }
    if (action === 'save') { saveProject(); return; }
    if (action === 'wizard') { if (window.CCFirstRun) CCFirstRun.open(); return; }
    if (action === 'licence') {
      if (window.CCEdition && CCEdition.showCard) {
        /* No separate licence dialog: the About section already carries it and the wizard explains
           the edition. Send them to About rather than inventing a fourth surface. */
        if (typeof window.openSettingsScreen === 'function') window.openSettingsScreen('about');
      }
      return;
    }
  });

  /* ── the data folder, surfaced where people look for it ─────────────────
     In the browser build the answer to "where is my work" is "this browser profile, and clearing
     site data deletes it". On the desktop it is a real folder, so say which one. */
  window.CCDesktopInfo = {
    dataDir: function () { return D.dataDir(); },
    showDataDir: function () { return D.showDataDir(); },
    appInfo: function () { return D.appInfo(); },
    openProject: openProject,
    saveProject: saveProject,
    /* Exposed so the proof can assert the chrome rather than photograph it: is the bar draggable, is
       anything left under the window buttons, and did the four rehomed menu items actually land. */
    chrome: function () {
      var bar = document.getElementById('topbar');
      var cs = bar ? getComputedStyle(bar) : null;
      var items = document.querySelectorAll('#mbar [data-cc-desktop-item]');
      var labels = [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].tagName === 'BUTTON') labels.push(items[i].textContent);
      }
      /* The RIGHTMOST visible thing in the bar, whatever it happens to be. Naming one button (the
         first version looked for Share and matched something else) tests the element I guessed at
         rather than the question, which is "is ANYTHING under the window buttons". */
      var kids = document.querySelectorAll('#topbar a,#topbar button,#topbar input,#topbar select');
      var furthest = null;
      var furthestRight = 0;
      for (var k = 0; k < kids.length; k++) {
        var r = kids[k].getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.right > furthestRight) { furthestRight = r.right; furthest = kids[k]; }
      }
      var safeRight = window.innerWidth - parseFloat((cs && cs.paddingRight) || '0');
      return {
        drag: cs ? (cs.webkitAppRegion || cs.appRegion) : null,
        paddingRight: cs ? cs.paddingRight : null,
        rehomedItems: labels,
        rightmost: furthest ? (furthest.id || furthest.className || furthest.tagName) : null,
        rightmostRight: Math.round(furthestRight),
        safeRight: Math.round(safeRight),
        nothingUnderWindowButtons: furthest === null ? null : furthestRight <= safeRight + 1
      };
    }
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'desktop', parent: 'system', title: 'Desktop shell', mount: function () {}, unmount: function () {} });
  }
})();
