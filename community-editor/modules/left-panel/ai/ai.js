/* ============================================================
   left-panel/ai - the AI rail panel, as an AD SURFACE.

   In the Community Edition every AI feature that talks to a vendor or to our server is DELETED, not
   disabled: chat, conversations, image generation, AI image edit, postkit, skills, the knowledge
   base, the provider key store, dubbing and subtitle translation. The twelve children this module
   used to load are gone from module.json.

   What stays is this shell: the rail button and the flyout section, so the card has somewhere to
   live. Opening AI tells the person, in one card, that AI is part of the dika studio service and that
   this build sends nothing anywhere.

   WHY A SHELL AND NOT A REMOVED BUTTON (owner): the AI menu is one of exactly two surfaces kept as
   an ad. Removing the button would remove the only place a person learns the feature exists.

   WHY THERE IS NO "add your own key" LINK: a hollow surface that offers a way to make itself work is
   a third state nobody asked for, and it would drag the whole vendor-key problem back in through the
   AI door. The six stock media keys are a different question and live in Settings > API Keys.

   On-device AI is NOT this. Cutout, magic select, upscale and Whisper auto-subtitles run in the
   browser with no key, no account and no request to anyone; they are untouched.

   Record: internal Community Edition plan §5b, §5c, §6.4.
   ============================================================ */
(function () {
  'use strict';

  var HOST = '#ai-flyout-host';

  /* core/rail-flyout.js openFlyout('ai') calls this. It is the ONLY entry point the rail has. */
  window.mountAiPanelInFlyout = function () {
    if (window.CCEdition && typeof CCEdition.lockSurface === 'function') {
      CCEdition.lockSurface(HOST, 'ai');
      return;
    }
    /* CCEdition loads before the kernel, so this cannot normally happen. If it ever does, say so
       rather than leaving an empty panel that reads as a broken build. */
    var el = document.querySelector(HOST);
    if (el) el.textContent = 'AI is part of the dika studio service and is not available in this build.';
  };

  /* `closeFlyout` calls window.ensureAiPanelInModal only when it is a function (core/rail-flyout.js
     ~:207). There is no modal to return a panel to, so it is deliberately left undefined. */

  if (window.cc && cc.modules) {
    cc.modules.register({
      id: 'ai',
      parent: 'left-panel',
      title: 'AI',
      icon: 'sparkles',
      mount: function () {},
      unmount: function () {}
    });
  }
})();
