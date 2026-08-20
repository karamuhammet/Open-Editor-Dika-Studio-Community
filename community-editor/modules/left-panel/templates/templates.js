/* Module group: left-panel/templates — decomposed (data/apply/renderer/saved children).
   This thin parent only registers the templates group; the designs/apply/renderer/saved sub-modules
   own the actual code. mount() renders the FULL panel via renderTemplatesPanel (slide-deck.js) —
   that draws the Post/Slide/Video mode tabs (_sdEnsureModeSwitch) + the right grid; only if it's not
   loaded do we fall back to renderTemplateCategoryCards (post-mode cards, no tabs). */

if (window.cc && cc.modules) {
  cc.modules.register({
    id: 'templates', parent: 'left-panel',
    parent: 'left-panel',
    title: 'Templates',
    icon: 'layout-template',
    mount: function () {
      if (typeof renderTemplatesPanel === 'function') renderTemplatesPanel('flyout-tpl-grid');
      else if (typeof renderTemplateCategoryCards === 'function') renderTemplateCategoryCards('flyout-tpl-grid');
    },
    unmount: function () {}
  });
}

