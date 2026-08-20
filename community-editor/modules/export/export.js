/* Module: export — top-level "Export / IO" group entry.
   Registers the export module group (children: share-menu, export-manager, bulk-export,
   group-export-excel, import-export, recorder). The legacy "Get My Card" download flow was removed with
   Chain A (export-import-manager-plan Phase 2) and the broken MediaRecorder Page-Video path
   (modules/export/video) with the video-engine unification (Phase 6); the "Paylas" share menu
   (modules/export/share-menu) + the NLE WebCodecs export (modules/video) are the replacements. */

if (window.cc && cc.modules) cc.modules.register({ id: 'export', title: 'Export / IO', icon: 'download', mount: function () {}, unmount: function () {} });
