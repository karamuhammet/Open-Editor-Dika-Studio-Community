/* FLAT decompose modules/left-panel/templates/designs/designs.js (2289-line FLAT file — 83 global
   template builder/thumbnail functions + TEMPLATE_REGISTRY/CATEGORIES data). Functions stay window
   globals; grouped by design family into children, the data stays in the parent. */
import { runFlat } from '../decompose-flat.mjs';
const DIR = 'modules/left-panel/templates/designs';
const DESC = {
  'card-builders': 'business-card template builders (tpl*)',
  'card-thumbs': 'business-card thumbnail drawers (drawThumb*)',
  logo: 'logo templates + thumbs',
  cv: 'CV/resume templates + thumbs',
  marketing: 'social/story/banner/email templates + thumbs',
  invoice: 'invoice helpers + US/UK/EU invoice templates'
};
runFlat({
  src: DIR + '/designs.js',
  parentFile: DIR + '/designs.js',
  childDir: DIR,
  parentId: 'designs',
  parentDotted: 'left-panel.templates.designs',
  deferData: ['TEMPLATE_REGISTRY'],
  childComment: g => 'left-panel/templates/designs/' + g + ' — ' + (DESC[g] || g),
  groupFn: function (n) {
    if (/^_invoice/.test(n) || /^tplInvoice/.test(n)) return 'invoice';
    if (/Logo/.test(n)) return 'logo';
    if (/Cv/.test(n)) return 'cv';
    if (/^(tpl|drawThumb)(SocialQuote|SocialPromo|SocialMinimal|Story|Banner|Email)/.test(n)) return 'marketing';
    if (/^drawThumb/.test(n)) return 'card-thumbs';
    if (/^tpl/.test(n)) return 'card-builders';
    return null;
  }
});
