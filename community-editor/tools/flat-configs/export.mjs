/* FLAT decompose modules/export/export.js (1489-line FLAT — the main export dialog: 39 global
   functions, no IIFE/namespace. Functions stay window globals (index.html onclick + other modules
   call them at runtime). Grouped by export path into 5 children; the group-entry parent keeps the
   4 state vars + the group register. No window.* exports, no init, no data referencing moved fns. */
import { runFlat } from '../decompose-flat.mjs';
const DIR = 'modules/export';
const DESC = {
  video: 'video export — WebCodecs/MediaRecorder capture, webm→mp4 transcode, live-canvas render',
  image: 'still-image + PDF render & download (renderPageToDataURL / downloadSingleSide)',
  modal: 'export dialog UI — open/close, page select, format/DPI/size controls',
  getmycard: 'Get-My-Card email verify + success-coupon flow',
  promo: 'promo popup + coupon timer'
};
runFlat({
  src: DIR + '/export.js',
  parentFile: DIR + '/export.js',
  childDir: DIR,
  parentId: 'export',
  parentDotted: 'export',
  childComment: g => 'export/' + g + ' — ' + (DESC[g] || g),
  groupFn: function (n) {
    if (/^_export/.test(n) || n === 'downloadSelectedPageAsVideo') return 'video';
    if (/Promo/.test(n)) return 'promo';
    if (/^mf|GetMyCard|Coupon/.test(n)) return 'getmycard';
    if (/Modal|PageCheckbox|SelectedPage|ExportFormat|DownloadBtn|DPIPreset|ExportWidth|ExportHeight/.test(n)) return 'modal';
    return 'image';
  }
});
