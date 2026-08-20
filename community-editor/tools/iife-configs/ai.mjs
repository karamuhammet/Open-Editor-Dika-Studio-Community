/* Config for decomposing modules/left-panel/ai/ai.js (3316-line IIFE, the AI Assistant — one
   feature with deeply-shared state across ~10 sub-areas). Namespace AIA = window.__ccAI.
   State/consts (providers, skills, tools, conversations) + the public window.* API + the
   canvas-ready POLL-init live in the parent; each sub-area is a child. */
import { run } from '../decompose-iife.mjs';

const DIR = 'modules/left-panel/ai';
const NS = 'AIA';

const DESC = {
  images: 'IMAGE ATTACHMENTS — resize/read/capture + pending-image strip.',
  storage: 'PERSISTENCE — settings/skills load+save + skill lookups + the skills CRUD API.',
  prompt: 'PROMPT/CONTEXT — design context, system prompt, vision/model/url/header builders.',
  chat: 'CHAT — send/receive a message, render messages, copy/apply-to-canvas.',
  panel: 'PANEL UI — build/flyout/modal/sidebar/wire the assistant panel.',
  slash: 'SLASH MENU — slash-command input, skill indicator, model badge.',
  imagegen: 'IMAGE GENERATION — Google/OpenAI/Qwen image gen + the progress overlay.',
  tools: 'TOOL-CALLING — parse tool calls + build the tools context.',
  conversations: 'CONVERSATIONS — load/save/switch/delete/auto-title chat threads.',
  shell: 'SHELL — toggle/modal/shortcuts/radial + init, plus the state/settings/test API.'
};

run({
  src: DIR + '/ai.js',
  parentFile: DIR + '/ai.js',
  childDir: DIR,
  nsVar: NS,
  nsGlobal: 'window.__ccAI',
  parentId: 'ai',
  idPrefix: 'ai',
  parentDotted: 'left-panel.ai',
  childComment: g => 'left-panel/ai/' + g + ' — ' + DESC[g],
  parentFuncs: [],
  parentWindowFuncs: [],
  groups: {
    images: ['_aiResizeImage', '_aiReadFileAsImage', '_aiCaptureCanvas', '_renderPendingImages'],
    storage: ['_aiSave', '_skillsSave', '_aiLoad', '_getAllSkills', '_getActiveSkill', '_getActiveSkillIdForProvider',
      '_setActiveSkillForProvider', '_findSkillBySlashName', '_aiGetSkills', '_aiCreateSkill', '_aiUpdateSkill',
      '_aiDeleteSkill', '_aiDuplicateSkill', '_aiSetActiveSkill'],
    prompt: ['_getDesignContext', '_buildSystemPrompt', '_supportsVision', '_getVisionModel', '_getApiUrl', '_getModelName', '_buildHeaders'],
    chat: ['_aiSendMessage', '_doSend', '_renderMessages', '_showImageLightbox', '_formatContent', '_copyText', '_applyTextToCanvas'],
    panel: ['_createPanel', '_ensureAiPanelInFlyout', '_ensureAiPanelInModal', '_buildProviderOptions', '_buildModelOptions', '_renderSidebar', '_escHtml', '_wirePanel'],
    slash: ['_handleSlashInput', '_navigateSlashMenu', '_hideSlashMenu', '_updateSkillIndicator', '_updateModelBadge'],
    imagegen: ['_showBunnyLoading', '_updateBunnyProgress', '_hideBunnyLoading', '_genImageGoogle', '_genImageOpenAI', '_genImageQwen', '_pollImageTask'],
    tools: ['_parseToolCalls', '_executeToolCalls', '_getToolsContext'],
    conversations: ['_loadConversations', '_saveConversations', '_createConversation', '_getActiveConversation', '_switchConversation', '_deleteConversation', '_autoTitleConversation'],
    shell: ['toggleAiPanel', 'openAiModalPanel', '_registerAiShortcuts', '_registerRadialAction', 'initAiAssistant', '_aiGetState', '_aiApplySettings', '_aiTestConnection']
  },
  buildParent: (stateLines) => {
    return '/* ============================================================\n' +
      '   AI Assistant — GROUP PARENT (decomposed)\n' +
      '   The 3316-line AI-assistant IIFE was split into ~10 sub-areas (images / storage / prompt /\n' +
      '   chat / panel / slash / imagegen / tools / conversations / shell). The feature shares a lot\n' +
      '   of state, so it all lives on ONE namespace object  ' + NS + ' = window.__ccAI (providers,\n' +
      '   skills, tools, conversations, panel refs); each child attaches its functions as ' + NS + '.<name>\n' +
      '   and references siblings through ' + NS + ' at call time → load-order-proof, no globals.\n' +
      '   Public window.* exports are thin forwarders, so app.js openFlyout + every caller is unchanged.\n' +
      '   Init: self-inits on cc:canvas-ready, deferred (poll) until the child fns load.\n' +
      '   ============================================================ */\n' +
      '(function () {\n' +
      "  'use strict';\n\n" +
      '  var ' + NS + ' = window.__ccAI || (window.__ccAI = {});\n\n' +
      '  // ── shared state + constants (were the IIFE private vars) ──\n' +
      stateLines + '\n\n' +
      '  // ── public API: thin forwarders to ' + NS + ' (call-time resolution → load-order-proof) ──\n' +
      '  function fwd(name) { return function () { return ' + NS + '[name] ? ' + NS + '[name].apply(null, arguments) : undefined; }; }\n' +
      "  window.toggleAiPanel = fwd('toggleAiPanel');\n" +
      "  window.openAiModalPanel = fwd('openAiModalPanel');\n" +
      "  window.mountAiPanelInFlyout = fwd('_ensureAiPanelInFlyout');\n" +
      "  window.ensureAiPanelInModal = fwd('_ensureAiPanelInModal');\n" +
      "  window.initAiAssistant = fwd('initAiAssistant');\n" +
      "  window._aiTriggerSend = fwd('_doSend');\n" +
      "  window._aiSave = fwd('_aiSave');\n" +
      "  window._aiGetState = fwd('_aiGetState');\n" +
      "  window._aiApplySettings = fwd('_aiApplySettings');\n" +
      "  window._aiGetSkills = fwd('_aiGetSkills');\n" +
      "  window._aiCreateSkill = fwd('_aiCreateSkill');\n" +
      "  window._aiUpdateSkill = fwd('_aiUpdateSkill');\n" +
      "  window._aiDeleteSkill = fwd('_aiDeleteSkill');\n" +
      "  window._aiDuplicateSkill = fwd('_aiDuplicateSkill');\n" +
      "  window._aiSetActiveSkill = fwd('_aiSetActiveSkill');\n" +
      "  window._aiTestConnection = fwd('_aiTestConnection');\n" +
      '  window.AI_PROVIDERS = ' + NS + '.AI_PROVIDERS;\n' +
      '  window.AI_TOOLS = ' + NS + '.AI_TOOLS;\n' +
      '  window.SKILL_SVG = ' + NS + '.SKILL_SVG;\n' +
      '  window.SKILL_ICON_KEYS = ' + NS + '.SKILL_ICON_KEYS;\n\n' +
      '  // ── self-init on cc:canvas-ready, deferred until every sub-area child has loaded ──\n' +
      '  if (window.cc && cc.on) {\n' +
      "    cc.on('cc:canvas-ready', function () {\n" +
      '      var tries = 0;\n' +
      '      var iv = setInterval(function () {\n' +
      "        if (typeof " + NS + ".initAiAssistant === 'function' && typeof " + NS + "._aiLoad === 'function' &&\n" +
      "            typeof " + NS + "._loadConversations === 'function' && typeof " + NS + "._createPanel === 'function' &&\n" +
      "            typeof " + NS + "._buildSystemPrompt === 'function' && typeof " + NS + "._doSend === 'function' &&\n" +
      "            typeof " + NS + "._handleSlashInput === 'function' && typeof " + NS + "._genImageQwen === 'function' &&\n" +
      "            typeof " + NS + "._parseToolCalls === 'function' && typeof " + NS + "._aiCaptureCanvas === 'function') {\n" +
      '          clearInterval(iv);\n' +
      "          cc.safe('left-panel.ai.init', function () { " + NS + '.initAiAssistant(); });\n' +
      '        } else if (++tries > 250) {\n' +
      '          clearInterval(iv);\n' +
      "          console.warn('[ai] sub-modules did not all load — init skipped');\n" +
      '        }\n' +
      '      }, 16);\n' +
      '    });\n' +
      '  }\n' +
      '})();\n\n' +
      '// Modular skeleton hook — register the group parent (children self-register under it).\n' +
      "if (window.cc && cc.modules) cc.modules.register({ id: 'ai', parent: 'left-panel', title: 'AI', icon: 'sparkles', mount: function () {}, unmount: function () {} });\n";
  }
});
