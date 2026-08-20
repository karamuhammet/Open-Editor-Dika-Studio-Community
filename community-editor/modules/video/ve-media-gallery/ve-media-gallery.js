/* ============================================================
   ve-media-gallery — GROUP PARENT (decomposed)
   The video-editor media library/browser panel IIFE split per concern. Shared panel state +
   consts (active category/source, items, folders, DB config, source/icon maps) stay on the
   parent; functions go to children (core/panel/import/folders/render/menus/stock). Public API
   stays window.VEMediaGallery (+ alias VEMediaBrowser), lazy getters → VMG.
   ============================================================ */
(function () {
  'use strict';

  var VMG = window.__ccVEMediaGallery || (window.__ccVEMediaGallery = {});

  // ── shared panel state + consts ──
  VMG._panel = null;
  VMG._isOpen = false;
  VMG._activeCategory = 'image';    // 'image' | 'video' | 'audio'
  VMG._activeSource = 'library';    // 'library' | 'unsplash' | 'pexels'
  VMG._viewMode = 'grid';           // 'grid' | 'list'
  VMG._filterText = '';
  VMG._drillFolderId = null;        // current folder drill-in (null = root)
  VMG._mediaItems = [];             // all items across categories
  VMG._folders = [];                // all folders across categories
  VMG._recentIds = { image: [], video: [], audio: [] };
  VMG._stockQuery = {};
  VMG._stockPage = {};
  VMG._stockOrientation = {};
  VMG._stockLoading = false;
  VMG._db = null;
  VMG.DB_NAME = 'dika_ve_gallery';
  VMG.DB_VERSION = 1;
  VMG.STORE_MEDIA = 'media';
  VMG.STORE_FOLDERS = 'folders';
  VMG.SOURCES = {
    image: ['library', 'unsplash', 'pexels'],
    video: ['library', 'pexels'],
    audio: ['library']
  };
  VMG.SOURCE_LABELS = { library: 'Library', unsplash: 'Unsplash', pexels: 'Pexels' };
  VMG.CAT_ICONS = { image: 'image', video: 'film', audio: 'music' };
  VMG.CAT_ACCEPT = { image: 'image/*', video: 'video/*', audio: 'audio/*' };
  VMG.FOLDER_ICONS = [
    'folder','star','heart','image','film','music','briefcase','tag','crown','shield','flame','leaf','sun','moon','clock','zap'
  ];

  // ── public API: window.VEMediaGallery (+ VEMediaBrowser alias) — lazy getters → VMG ──
  var api = {}, map = {"show":"show","hide":"hide","toggle":"toggle","isOpen":"isOpen","addExternalItem":"addExternalItem","getItemById":"getItemById","importFiles":"_importFiles"};
  Object.keys(map).forEach(function (k) {
    Object.defineProperty(api, k, { get: (function (n) { return function () { return VMG[n]; }; })(map[k]), enumerable: true });
  });
  window.VEMediaGallery = api;
  window.VEMediaBrowser = window.VEMediaGallery;
})();

if (window.cc && cc.modules) cc.modules.register({ id: 've-media-gallery', parent: 'video', title: 've-media-gallery', mount: function () {}, unmount: function () {} });
