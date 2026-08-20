/* Module: video/video-editor/timing — TIMING helpers — uid, PTS↔seconds, frame snap, timecode formatting, html-escape.
   Part of the video-editor group (decomposed from the 7695-line IIFE). Functions hang off the
   shared namespace VE (window.__ccVideoEditor, created by the parent); cross-module refs resolve
   through VE at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VE = window.__ccVideoEditor;
  if (!VE) return;

  VE._veUid = function (prefix) {
    return (prefix || 've') + '-' + Date.now().toString(36) + '-' + (++VE._veIdCounter);
  };

  VE._veToPTS = function (seconds) {
    return Math.round(seconds * VE.PTS_TIMEBASE);
  };

  VE._veFromPTS = function (pts) {
    return pts / VE.PTS_TIMEBASE;
  };

  VE._veSnapToFrame = function (seconds, fps) {
    fps = fps || 30;
    var frameDur = 1.0 / fps;
    return Math.round(seconds / frameDur) * frameDur;
  };

  VE._veFormatTimecode = function (seconds, fps) {
    fps = fps || 30;
    var totalFrames = Math.round(seconds * fps);
    var f = totalFrames % fps;
    var totalSec = Math.floor(totalFrames / fps);
    var s = totalSec % 60;
    var m = Math.floor(totalSec / 60) % 60;
    var h = Math.floor(totalSec / 3600);
    return (h > 0 ? (h < 10 ? '0' : '') + h + ':' : '') +
      (m < 10 ? '0' : '') + m + ':' +
      (s < 10 ? '0' : '') + s + ':' +
      (f < 10 ? '0' : '') + f;
  };

  VE._veFormatTime = function (sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    var whole = Math.floor(s);
    var frac = Math.round((s - whole) * 100);
    return m + ':' + (whole < 10 ? '0' : '') + whole + '.' + (frac < 10 ? '0' : '') + frac;
  };

  VE._esc = function (s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'timing', parent: 'video.video-editor', title: 'video-editor: timing', mount: function () {}, unmount: function () {} });
  }
})();
