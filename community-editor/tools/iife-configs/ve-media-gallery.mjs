/* Decompose modules/video/ve-media-gallery/ve-media-gallery.js (1479-line IIFE, the video-editor
   media library/browser panel). Namespace VMG. 59 fns, all state/consts → parent. Single
   window.VEMediaGallery (+ alias window.VEMediaBrowser); lazy (show/toggle). */
import { run } from '../decompose-iife.mjs';
const DIR = 'modules/video/ve-media-gallery';
const NS = 'VMG';
const DESC = {
  core: 'Formatters + IndexedDB layer + item/folder queries.',
  panel: 'Panel shell, source tabs, filter UI + show/hide/toggle lifecycle.',
  import: 'File import + image/video/audio metadata + external items.',
  folders: 'Folder + item CRUD (create/rename/icon/delete/move).',
  render: 'Library / grid / list / folder drill-in rendering.',
  menus: 'Context menus + prompts (folder/item/move/new/rename/icon).',
  stock: 'Stock-media search + add-to-timeline.'
};
const EXPORT_MAP = { show: 'show', hide: 'hide', toggle: 'toggle', isOpen: 'isOpen',
  addExternalItem: 'addExternalItem', getItemById: 'getItemById', importFiles: '_importFiles' };
run({
  src: DIR + '/ve-media-gallery.js',
  parentFile: DIR + '/ve-media-gallery.js',
  childDir: DIR,
  nsVar: NS,
  nsGlobal: 'window.__ccVEMediaGallery',
  parentId: 've-media-gallery',
  idPrefix: 've-mg',
  parentDotted: 'video.ve-media-gallery',
  childComment: g => 'video/ve-media-gallery/' + g + ' — ' + DESC[g],
  parentFuncs: [],
  parentWindowFuncs: [],
  groups: {
    core: ['_icon', '_fmtDuration', '_fmtSize', '_fmtRes', '_escHtml', '_dbOpen', '_dbGetAll', '_dbPut', '_dbDelete',
      '_loadFromDB', '_saveItemToDB', '_hydrateItems', '_getItemsForCategory', '_getFoldersForCategory',
      '_getFilteredItems', '_getItemsInFolder', '_getSubfolders', '_countItemsInFolder'],
    panel: ['_buildPanel', '_wireEvents', '_updateSourceTabs', '_updateFilterUI', 'show', 'hide', 'toggle', 'isOpen', 'getItemById'],
    import: ['_importFiles', '_addFile', '_loadImageMeta', '_loadVideoMeta', '_loadAudioMeta', 'addExternalItem'],
    folders: ['_createFolder', '_renameFolder', '_changeFolderIcon', '_deleteFolder', '_deleteItem', '_moveItemToFolder'],
    render: ['_renderContent', '_renderLibrary', '_renderFolderDrillIn', '_renderGrid', '_renderList', '_wireLibraryEvents', '_renderAllItems'],
    menus: ['_showFolderContextMenu', '_showItemContextMenu', '_showMoveToFolderMenu', '_removeContextMenu', '_showNewFolderPrompt', '_showRenamePrompt', '_showIconPicker'],
    stock: ['_renderStock', '_getStockChips', '_stockSearchAPI', '_stockAddToTimeline', '_addToTimeline', '_addImageToTimeline']
  },
  buildParent: (stateLines) => {
    return '/* ============================================================\n' +
      '   ve-media-gallery — GROUP PARENT (decomposed)\n' +
      '   The video-editor media library/browser panel IIFE split per concern. Shared panel state +\n' +
      '   consts (active category/source, items, folders, DB config, source/icon maps) stay on the\n' +
      '   parent; functions go to children (core/panel/import/folders/render/menus/stock). Public API\n' +
      '   stays window.VEMediaGallery (+ alias VEMediaBrowser), lazy getters → ' + NS + '.\n' +
      '   ============================================================ */\n' +
      '(function () {\n' +
      "  'use strict';\n\n" +
      '  var ' + NS + ' = window.__ccVEMediaGallery || (window.__ccVEMediaGallery = {});\n\n' +
      (stateLines.trim() ? '  // ── shared panel state + consts ──\n' + stateLines + '\n\n' : '') +
      '  // ── public API: window.VEMediaGallery (+ VEMediaBrowser alias) — lazy getters → ' + NS + ' ──\n' +
      '  var api = {}, map = ' + JSON.stringify(EXPORT_MAP) + ';\n' +
      '  Object.keys(map).forEach(function (k) {\n' +
      '    Object.defineProperty(api, k, { get: (function (n) { return function () { return ' + NS + '[n]; }; })(map[k]), enumerable: true });\n' +
      '  });\n' +
      '  window.VEMediaGallery = api;\n' +
      '  window.VEMediaBrowser = window.VEMediaGallery;\n' +
      '})();\n\n' +
      "if (window.cc && cc.modules) cc.modules.register({ id: 've-media-gallery', parent: 'video', title: 've-media-gallery', mount: function () {}, unmount: function () {} });\n";
  }
});
