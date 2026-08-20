/* Module: system/settings/screen — Settings SHELL — the screen container, open/close, section nav, small input helpers.
   Part of the settings group (decomposed from the 2763-line IIFE). Functions hang off the
   shared namespace SS (window.__ccSettings, created by the parent); cross-module refs resolve
   through SS at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var SS = window.__ccSettings;
  if (!SS) return;

  function applyLocale(root) {
    if (window.CCI18n && typeof CCI18n.apply === 'function') CCI18n.apply(root || document);
  }

  SS.closeSettings = function () {
    // Stop any active key recording before closing
    if (SS._kbRecordingCmd) SS._stopRecording();
    var screen = document.getElementById('settings-screen');
    if (screen) screen.remove();
    if (SS._settingsEscHandler) {
      document.removeEventListener('keydown', SS._settingsEscHandler);
      SS._settingsEscHandler = null;
    }
  };

  SS.initSettingsScreen = function () {
    var btn = document.getElementById('settings-btn');
    if (!btn) return;

    btn.onclick = function () {
      SS.openSettingsScreen();
    };
  };

  SS.openSettingsScreen = function (initialSection) {
    var existing = document.getElementById('settings-screen');
    if (existing && !initialSection) { SS.closeSettings(); return; }
    if (existing && initialSection) {
      // Already open — just switch to requested section
      var navBtn = existing.querySelector('.settings-nav[data-section="' + initialSection + '"]');
      if (navBtn) navBtn.click();
      return;
    }

    var activeSection = initialSection || 'profile';
    var screen = document.createElement('div');
    screen.id = 'settings-screen';
    screen.className = 'settings-screen';

    var sidebar = '<div class="settings-sidebar">' +
      '<div class="settings-sidebar-header">' +
        '<div class="settings-logo">' + (typeof getIcon === 'function' ? getIcon('gear', 20) : '') + '</div>' +
        '<span>Settings</span>' +
      '</div>' +
      '<button class="settings-nav' + (activeSection === 'profile' ? ' active' : '') + '" data-section="profile">Profile</button>' +
      /* COMMUNITY EDITION R8: the way OUT of the account. This build asks for registration at every
         launch until you have one, so there has to be a door in the other direction, and it has to
         be somewhere obvious rather than in About. */
      '<button class="settings-nav' + (activeSection === 'account' ? ' active' : '') + '" data-section="account">Account</button>' +
      /* COMMUNITY EDITION: "AI Settings" and "Knowledge Base" are gone with the AI tree. What takes
         their place is API Keys - the six stock media providers, which the Stock, Images, Audio,
         GIFs and Stickers tabs have been pointing at all along. */
      '<button class="settings-nav' + (activeSection === 'apikeys' ? ' active' : '') + '" data-section="apikeys">API Keys</button>' +
      '<div class="settings-nav-sep"></div>' +
      '<button class="settings-nav' + (activeSection === 'work' ? ' active' : '') + '" data-section="work">Work</button>' +
      '<button class="settings-nav" data-section="vhistory">Version History</button>' +
      '<button class="settings-nav" data-section="shortcuts">Keyboard Manager</button>' +
      '<div class="settings-nav-sep"></div>' +
      '<button class="settings-nav" data-section="preferences">Preferences</button>' +
      '<button class="settings-nav" data-section="sleep">Page Sleep</button>' +
      '<button class="settings-nav" data-section="upload">Upload Queue</button>' +
      // Brand Sets removed from the editor: brand management now lives in the panel
      // at /brand ("Markam"), the single brand authority (docs/brand-layer-plan.md D7).
      '<div class="settings-nav-sep"></div>' +
      '<button class="settings-nav" data-section="about">About</button>' +
      '<button class="settings-nav" data-section="radial">Radial Menu</button>' +
      '<button class="settings-nav" data-section="support">Support</button>' +
    '</div>';

    var initialContent;
    if (activeSection === 'apikeys') {
      initialContent = SS.buildApiKeysSection();
    } else if (activeSection === 'work') {
      initialContent = SS.buildWorkSection ? SS.buildWorkSection() : '<div>Work module not loaded</div>';
    } else {
      initialContent = SS.buildProfileSection();
    }
    var content = '<div class="settings-content" id="settings-content">' +
      initialContent +
    '</div>';

    var closeBtn = '<button class="settings-close" id="settings-close-btn" title="Close settings" aria-label="Close settings">&times;</button>';

    screen.innerHTML = sidebar + content + closeBtn;
    document.body.appendChild(screen);
    applyLocale(screen);

    // Wire handlers for initial section
    if (activeSection === 'apikeys') {
      SS.wireApiKeysHandlers();
    } else if (activeSection === 'work') {
      if (SS.wireWorkHandlers) SS.wireWorkHandlers();
    } else {
      SS.wireProfileHandlers();
    }

    SS._settingsEscHandler = function (e) {
      if (e.key === 'Escape') {
        // If recording, Esc only cancels recording (don't close settings)
        if (SS._kbRecordingCmd) return;
        SS.closeSettings();
      }
    };
    document.addEventListener('keydown', SS._settingsEscHandler);

    screen.querySelectorAll('.settings-nav').forEach(function (navBtn) {
      navBtn.onclick = function () {
        screen.querySelectorAll('.settings-nav').forEach(function (n) { n.classList.remove('active'); });
        navBtn.classList.add('active');
        var section = navBtn.dataset.section;
        var ct = document.getElementById('settings-content');
        if (section === 'profile') {
          ct.innerHTML = SS.buildProfileSection();
          SS.wireProfileHandlers();
        }
        else if (section === 'account') {
          ct.innerHTML = SS.buildAccountSection ? SS.buildAccountSection() : '<div>Account module not loaded</div>';
          if (SS.wireAccountHandlers) SS.wireAccountHandlers();
        }
        else if (section === 'apikeys') {
          ct.innerHTML = SS.buildApiKeysSection();
          SS.wireApiKeysHandlers();
        }
        else if (section === 'work') {
          ct.innerHTML = SS.buildWorkSection ? SS.buildWorkSection() : '<div>Work module not loaded</div>';
          if (SS.wireWorkHandlers) SS.wireWorkHandlers();
        }
        else if (section === 'vhistory') {
          ct.innerHTML = SS.buildVersionHistorySection();
          SS.wireVersionHistoryHandlers();
        }
        else if (section === 'shortcuts') {
          ct.innerHTML = SS.buildKeyboardManagerSection();
          SS.wireKeyboardManagerHandlers();
        }
        else if (section === 'preferences') {
          ct.innerHTML = SS.buildPreferencesSection();
          SS.wirePreferencesHandlers();
        }
        else if (section === 'sleep') {
          ct.innerHTML = window.CCPageSleepSettings ? window.CCPageSleepSettings.build() : '<div>Sleep module not loaded</div>';
          if (window.CCPageSleepSettings) window.CCPageSleepSettings.wire();
        }
        else if (section === 'upload') {
          ct.innerHTML = window.UploadQueue ? window.UploadQueue.buildSettingsSection() : '<div>Upload module not loaded</div>';
          if (window.UploadQueue) window.UploadQueue.wireSettingsHandlers();
        }
        else if (section === 'about') {
          ct.innerHTML = SS.buildAboutSection();
          if (SS.wireAboutHandlers) SS.wireAboutHandlers();
        }
        else if (section === 'radial') {
          ct.innerHTML = typeof buildRadialMenuSection === 'function' ? buildRadialMenuSection() : '<div>Radial menu not loaded</div>';
          if (typeof wireRadialMenuHandlers === 'function') wireRadialMenuHandlers();
        }
        else if (section === 'support') ct.innerHTML = SS.buildSupportSection();
        applyLocale(screen);
      };
    });

    document.getElementById('settings-close-btn').onclick = function () { SS.closeSettings(); };
  };

  SS.settingsInput = function (label, id, val, iconKey) {
    var ico = iconKey ? SS.profileIcon(iconKey, 14) : '';
    var icoHtml = ico ? '<span class="si-icon">' + ico + '</span>' : '';
    return '<div class="settings-field' + (ico ? ' has-icon' : '') + '">' +
      icoHtml +
      '<div class="si-content">' +
        '<label class="settings-label" for="' + id + '">' + label + '</label>' +
        '<input class="settings-input" id="' + id + '" value="' + SS.escAttr(val) + '" placeholder="' + label + '">' +
      '</div>' +
    '</div>';
  };

  SS.escAttr = function (str) {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'screen', parent: 'system.settings', title: 'settings: screen', mount: function () {}, unmount: function () {} });
  }
})();
