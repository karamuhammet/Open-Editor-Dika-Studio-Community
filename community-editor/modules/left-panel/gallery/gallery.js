/* Module: left-panel/gallery (Media: images / video / audio).
   Extracted VERBATIM from app.js (Faz 2). FLAT — intentionally NOT wrapped in an IIFE so the
   gallery's top-level globals (_galMemStore/_galIDB/_stockPage…) stay global for ve-media-gallery.js
   and all external callers. Loads via core/loader.js. See git tag faz2-gallery / pre-gallery zip. */

// ── 18b. Images & Gallery Folder System ──────────────────────
var GALLERY_KEY = 'dika_gallery';
var GALLERY_FOLDERS_KEY = 'dika_gallery_v2';
var GAL_RECENT_PAGE_SIZE = 20;
var _galRecentShowCount = GAL_RECENT_PAGE_SIZE;

/* ── IndexedDB gallery backend (replaces localStorage — no 5 MB limit) ── */
var _galIDB = null;
var _galMemStore = null;   // in-memory mirror for sync reads
var _galMemTrash = null;   // in-memory mirror for trash
var _galIDBReady = false;
var _galDropRefreshTimer = null;

/* Searchable icon picker — mounts a trigger + dropdown (search + Lucide grid) into host.
   Calls onSelect(iconName) when a glyph is chosen. */
var _GAL_ICON_FAVS = ['folder', 'star', 'heart', 'image', 'images', 'briefcase', 'flame', 'tag', 'crown', 'shield', 'ribbon', 'leaf', 'sun', 'moon', 'clock', 'bookmark', 'camera', 'music', 'video', 'file', 'users', 'rocket', 'box', 'palette', 'globe', 'map-pin', 'gift', 'zap'];

/* Shared desktop drag-drop importer.
   parentId === null → top-level (home); a folder id → import INTO that folder
   (dropped directories become sub-folders, loose files land in the folder). */

/* ── Tools tab: generator tools (Device Mockups / QR Code / Barcode) open in a
   sub-view inside the Tools flyout, mirroring the old images sub-view. ── */


if (window.cc && cc.modules) {
  cc.modules.register({ id: 'gallery', parent: 'left-panel', title: 'Media', icon: 'image', mount: function () {}, unmount: function () {} });
}
