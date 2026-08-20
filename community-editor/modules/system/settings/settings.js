/* ============================================================
   Settings — GROUP PARENT (decomposed)
   The 2762-line Settings-screen IIFE was split per section (screen / brand / keyboard /
   version-history / profiles / api-keys / rail / preferences / about). Shared state + consts +
   the public window.* API live on ONE namespace object  SS = window.__ccSettings; each
   child attaches its section builders/handlers as SS.<name> and references siblings
   through SS at call time → load-order-proof, no globals.

   Init: settings self-inits on the sticky cc:canvas-ready event, but that fires (app.js) before
   the child scripts load, so the parent POLLS until the section fns exist, then calls
   SS.initSettingsScreen() once (which wires #settings-btn → openSettingsScreen).
   ============================================================ */
(function () {
  'use strict';

  var SS = window.__ccSettings || (window.__ccSettings = {});

  // ── shared state + constants (were the IIFE private vars) ──
  SS._settingsEscHandler = null;
  SS.BRAND_SETS_KEY = 'dika_brandsets';
  SS.BRAND_FONTS = [
    'DM Sans','Inter','Roboto','Open Sans','Montserrat','Poppins','Raleway',
    'Nunito','Work Sans','Source Sans Pro','Rubik','Quicksand','Mulish',
    'Barlow','Manrope','Sora','Plus Jakarta Sans','Outfit','Josefin Sans',
    'Merriweather','Lora','Playfair Display','EB Garamond','Cormorant Garamond',
    'Oswald','Bebas Neue','Pacifico','Dancing Script','Space Mono'
  ];
  SS._kbActiveTab = 'shortcuts';
  SS._kbSearchQuery = '';
  SS._kbFilter = {};
  SS._kbRecordingCmd = null;  // command id currently recording
  SS._kbRecordHandler = null;
  SS._skSelectedRef = null; // currently editing ref index, null = SKILL.md
  SS.RAIL_ITEMS = [
    { tab: 'templates',  label: 'Templates'  },
    { tab: 'text',       label: 'Text'       },
    { tab: 'background', label: 'Background' },
    { tab: 'shape',      label: 'Items'      },   // Icons is a category INSIDE Items since 2026-07-25 (no own rail button)
    { tab: 'images',     label: 'Images'     },
    { tab: 'wireframe',  label: 'Wireframe'  },
    { tab: 'whiteboard', label: 'Board'      },
    { tab: 'charts',     label: 'Charts'     }
  ];
  SS.RAIL_VIS_KEY = 'dika_railVisibility';

  // ── public API: thin forwarders to SS (call-time resolution → load-order-proof) ──
  function fwd(name) { return function () { return SS[name] ? SS[name].apply(null, arguments) : undefined; }; }
  window.openSettingsScreen = fwd('openSettingsScreen');
  window.closeSettings = fwd('closeSettings');
  window.applyRailVisibility = fwd('applyRailVisibility');
  window.getActiveBrandSet = fwd('getActiveBrandSet');
  window._applyActiveBrandToWF = fwd('_applyActiveBrandToWF');
  window._kbCancelRecording = fwd('_kbCancelRecording');

  // ── self-init on cc:canvas-ready, deferred until every section child has loaded ──
  if (window.cc && cc.on) {
    cc.on('cc:canvas-ready', function () {
      var tries = 0;
      var iv = setInterval(function () {
        if (typeof SS.initSettingsScreen === 'function' &&
            typeof SS.buildBrandSetSection === 'function' &&
            typeof SS.buildKeyboardManagerSection === 'function' &&
            typeof SS.buildVersionHistorySection === 'function' &&
            typeof SS.buildProfileSection === 'function' &&
            typeof SS.buildApiKeysSection === 'function' &&
            typeof SS.applyRailVisibility === 'function' &&
            typeof SS.buildPreferencesSection === 'function' &&
            typeof SS.buildWorkSection === 'function' &&
            typeof SS.buildAboutSection === 'function') {
          clearInterval(iv);
          cc.safe('system.settings', function () { SS.initSettingsScreen(); });
        } else if (++tries > 250) {
          clearInterval(iv);
          console.warn('[settings] section sub-modules did not all load — init skipped');
        }
      }, 16);
    });
  }
})();

// Modular skeleton hook — register the group parent (children self-register under it).
if (window.cc && cc.modules) cc.modules.register({ id: 'settings', parent: 'system', title: 'Settings', mount: function () {}, unmount: function () {} });
