/* Module: video/video-editor/preview — PREVIEW CANVAS — build/show/size the preview surface + background bridge.
   Part of the video-editor group (decomposed from the 7695-line IIFE). Functions hang off the
   shared namespace VE (window.__ccVideoEditor, created by the parent); cross-module refs resolve
   through VE at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VE = window.__ccVideoEditor;
  if (!VE) return;

  VE._veBuildPreviewCanvas = function () {
    if (VE._veUi.previewCanvas) return;
    // Remove any legacy DOM preview canvas from previous versions
    var oldCvs = document.getElementById('ve-preview-canvas');
    if (oldCvs) oldCvs.remove();
    // Offscreen canvas — NOT added to DOM; rendered via Fabric backgroundImage
    var cvs = document.createElement('canvas');
    cvs.width = 1920;
    cvs.height = 1080;
    VE._veUi.previewCanvas = cvs;
    VE._veUi.previewCtx = cvs.getContext('2d');
    // Create a Fabric.Image wrapping the offscreen canvas for use as backgroundImage
    if (typeof fabric !== 'undefined' && fabric.Image) {
      VE._veUi.previewFabricImg = new fabric.Image(cvs, {
        left: 0, top: 0, originX: 'left', originY: 'top',
        objectCaching: false
      });
    }
  };

  VE._veShowPreviewCanvas = function (show) {
    // Legacy stub — preview is now rendered via Fabric backgroundImage, no DOM element to show/hide
  };

  VE._veEnforceDimensions = function () {
    if (!VE._veActive || VE._veExporting) return;
    if (typeof VideoCanvas !== 'undefined' && VideoCanvas.enforceDimensions) {
      VideoCanvas.enforceDimensions();
    }
    VE._veSyncPreviewSize();
  };

  VE._veSyncPreviewSize = function () {
    if (!VE._veUi.previewCanvas) return;
    // Plan 1.2: during an export the preview surface is deliberately held at the EXPORT resolution
    // (VE._veExportPreviewSize) so the compositor draws real 4K pixels instead of a 1080p upscale.
    // Anything that syncs it back mid-run (a media import, a page event) would silently drop the
    // export to project resolution and wipe the in-flight frame, so this is a no-op while exporting.
    if (VE._veExporting && VE._veExportPreviewSize) return;
    var sz = (typeof VideoCanvas !== 'undefined' && VideoCanvas.getExpectedSize) ? VideoCanvas.getExpectedSize() : { w: 1920, h: 1080 };
    var w = sz.w;
    var h = sz.h;
    // Writing canvas.width/height clears the bitmap (wipes the rendered video frame) —
    // only reassign when the size actually changed, else adding any object blanks the video.
    if (VE._veUi.previewCanvas.width !== w || VE._veUi.previewCanvas.height !== h) {
      VE._veUi.previewCanvas.width = w;
      VE._veUi.previewCanvas.height = h;
    }
    // Update the Fabric.Image wrapper dimensions
    if (VE._veUi.previewFabricImg) {
      VE._veUi.previewFabricImg.width = w;
      VE._veUi.previewFabricImg.height = h;
      VE._veUi.previewFabricImg.dirty = true;
    }
  };

  VE._veAttachPreviewBg = function () {
    if (!VE._veUi.previewFabricImg) return;
    if (typeof canvas === 'undefined' || !canvas) return;
    canvas.backgroundImage = VE._veUi.previewFabricImg;
    canvas.backgroundColor = '';
  };

  VE._veDetachPreviewBg = function () {
    if (typeof canvas === 'undefined' || !canvas) return;
    canvas.backgroundImage = null;
  };

  VE._veSyncLayoutPadding = function () {
    var ca = document.getElementById('canvas-area');
    if (!ca || !ca.classList.contains('ve-active')) return;
    var h = VE._veUi.panelHeight || VE.DEFAULT_PANEL_HEIGHT;
    ca.style.paddingBottom = (h + 40) + 'px';
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'preview', parent: 'video.video-editor', title: 'video-editor: preview', mount: function () {}, unmount: function () {} });
  }
})();
