/* Config for decomposing modules/system/settings/settings.js (2762-line IIFE, the Settings screen
   with ~9 sections). Namespace SS = window.__ccSettings. Each section → a child; state/consts + the
   public window.* API + the canvas-ready POLL-init live in the parent. Like color-picker, settings
   self-inits on cc:canvas-ready (emitted before the children load), so the parent polls until the
   child fns exist, then calls SS.initSettingsScreen() once. */
import { run } from '../decompose-iife.mjs';

const DIR = 'modules/system/settings';
const NS = 'SS';

const DESC = {
  screen: 'Settings SHELL — the screen container, open/close, section nav, small input helpers.',
  brand: 'BRAND SETS — brand fonts/colours/logo model + editor, apply-to-object.',
  keyboard: 'KEYBOARD MANAGER — the shortcut editor (tabs, record/rebind, conflicts, profiles, fallbacks).',
  'version-history': 'VERSION HISTORY — autosave snapshot list + restore.',
  profiles: 'USER PROFILE section.',
  'ai-api': 'AI / API / SKILLS — provider + API-key config and the skills manager/editor.',
  rail: 'RAIL VISIBILITY — show/hide left-rail items.',
  preferences: 'PREFERENCES — general app preferences.',
  about: 'ABOUT / SUPPORT info sections.'
};

run({
  src: DIR + '/settings.js',
  parentFile: DIR + '/settings.js',
  childDir: DIR,
  nsVar: NS,
  nsGlobal: 'window.__ccSettings',
  parentId: 'settings',
  idPrefix: 'settings',
  parentDotted: 'system.settings',
  childComment: g => 'system/settings/' + g + ' — ' + DESC[g],
  parentFuncs: [],
  parentWindowFuncs: [],
  groups: {
    screen: ['closeSettings', 'initSettingsScreen', 'openSettingsScreen', 'settingsInput', 'escAttr'],
    brand: ['_getBrandSets', '_saveBrandSets', 'getActiveBrandSet', '_newBrandSet', 'buildBrandSetSection',
      'wireBrandSetHandlers', '_refreshBrandUI', '_openBrandSetEditor', '_brandColorRow', '_applyActiveBrandToWF',
      '_replaceBrandLogo', '_applyBrandToObj'],
    keyboard: ['buildKeyboardManagerSection', '_buildKmTabContent', '_buildShortcutsTab', '_buildCommandRow',
      '_renderKeyBadges', '_buildCategoriesTab', '_buildCategoryDetail', '_buildConflictsTab', '_buildProfilesTab',
      '_relativeTime', '_buildAdvancedTab', '_detectPlatform', '_buildFallbackShortcuts', 'wireKeyboardManagerHandlers',
      '_refreshKmList', '_wireRecordButtons', '_startRecording', '_stopRecording', '_showConflictDialog',
      '_wireCategoryResetBtn', '_wireProfileButtons', '_wireAdvancedButtons', '_rebuildTab', '_kbCancelRecording'],
    'version-history': ['formatVersionTs', 'readAutosavePayload', 'readVersionSnapshots', 'buildVersionHistorySection', 'wireVersionHistoryHandlers'],
    profiles: ['profileIcon', 'buildProfileSection', 'wireProfileHandlers'],
    'ai-api': ['buildAISection', '_buildProviderContent', 'buildAPISection', 'wireAPIHandlers', 'wireAIHandlers',
      '_wireProviderContent', 'buildSkillsManagerSection', '_getProviderNamesForSkill', '_buildSkillDetail',
      'wireSkillsManagerHandlers', '_selectSkillInManager', '_wireSkillDetailHandlers', '_saveCurrentEditor', '_loadEditorContent'],
    rail: ['_getRailVisibility', '_saveRailVisibility', 'applyRailVisibility'],
    preferences: ['buildPreferencesSection', 'wirePreferencesHandlers'],
    about: ['buildAboutSection', 'buildSupportSection']
  },
  buildParent: (stateLines) => {
    return '/* ============================================================\n' +
      '   Settings — GROUP PARENT (decomposed)\n' +
      '   The 2762-line Settings-screen IIFE was split per section (screen / brand / keyboard /\n' +
      '   version-history / profiles / ai-api / rail / preferences / about). Shared state + consts +\n' +
      '   the public window.* API live on ONE namespace object  ' + NS + ' = window.__ccSettings; each\n' +
      '   child attaches its section builders/handlers as ' + NS + '.<name> and references siblings\n' +
      '   through ' + NS + ' at call time → load-order-proof, no globals.\n\n' +
      '   Init: settings self-inits on the sticky cc:canvas-ready event, but that fires (app.js) before\n' +
      '   the child scripts load, so the parent POLLS until the section fns exist, then calls\n' +
      '   ' + NS + '.initSettingsScreen() once (which wires #settings-btn → openSettingsScreen).\n' +
      '   ============================================================ */\n' +
      '(function () {\n' +
      "  'use strict';\n\n" +
      '  var ' + NS + ' = window.__ccSettings || (window.__ccSettings = {});\n\n' +
      '  // ── shared state + constants (were the IIFE private vars) ──\n' +
      stateLines + '\n\n' +
      '  // ── public API: thin forwarders to ' + NS + ' (call-time resolution → load-order-proof) ──\n' +
      '  function fwd(name) { return function () { return ' + NS + '[name] ? ' + NS + '[name].apply(null, arguments) : undefined; }; }\n' +
      "  window.openSettingsScreen = fwd('openSettingsScreen');\n" +
      "  window.closeSettings = fwd('closeSettings');\n" +
      "  window.applyRailVisibility = fwd('applyRailVisibility');\n" +
      "  window.getActiveBrandSet = fwd('getActiveBrandSet');\n" +
      "  window._applyActiveBrandToWF = fwd('_applyActiveBrandToWF');\n" +
      "  window._kbCancelRecording = fwd('_kbCancelRecording');\n\n" +
      '  // ── self-init on cc:canvas-ready, deferred until every section child has loaded ──\n' +
      '  if (window.cc && cc.on) {\n' +
      "    cc.on('cc:canvas-ready', function () {\n" +
      '      var tries = 0;\n' +
      '      var iv = setInterval(function () {\n' +
      "        if (typeof " + NS + '.initSettingsScreen === \'function\' &&\n' +
      "            typeof " + NS + ".buildBrandSetSection === 'function' &&\n" +
      "            typeof " + NS + ".buildKeyboardManagerSection === 'function' &&\n" +
      "            typeof " + NS + ".buildVersionHistorySection === 'function' &&\n" +
      "            typeof " + NS + ".buildProfileSection === 'function' &&\n" +
      "            typeof " + NS + ".buildAISection === 'function' &&\n" +
      "            typeof " + NS + ".applyRailVisibility === 'function' &&\n" +
      "            typeof " + NS + ".buildPreferencesSection === 'function' &&\n" +
      "            typeof " + NS + ".buildAboutSection === 'function') {\n" +
      '          clearInterval(iv);\n' +
      "          cc.safe('system.settings', function () { " + NS + '.initSettingsScreen(); });\n' +
      '        } else if (++tries > 250) {\n' +
      '          clearInterval(iv);\n' +
      "          console.warn('[settings] section sub-modules did not all load — init skipped');\n" +
      '        }\n' +
      '      }, 16);\n' +
      '    });\n' +
      '  }\n' +
      '})();\n\n' +
      '// Modular skeleton hook — register the group parent (children self-register under it).\n' +
      "if (window.cc && cc.modules) cc.modules.register({ id: 'settings', parent: 'system', title: 'Settings', mount: function () {}, unmount: function () {} });\n";
  }
});
