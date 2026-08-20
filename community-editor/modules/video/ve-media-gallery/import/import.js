/* Module: video/ve-media-gallery/import — File import + image/video/audio metadata + external items.
   Part of the ve-media-gallery group (decomposed from the 1480-line IIFE). Functions hang off the
   shared namespace VMG (window.__ccVEMediaGallery, created by the parent); cross-module refs resolve
   through VMG at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VMG = window.__ccVEMediaGallery;
  if (!VMG) return;

  VMG._importFiles = function () {
    var input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = VMG.CAT_ACCEPT[VMG._activeCategory] || 'image/*,video/*,audio/*';
    input.addEventListener('change', function() {
      if (!input.files || !input.files.length) return;
      for (var i = 0; i < input.files.length; i++) {
        VMG._addFile(input.files[i]);
      }
    });
    input.click();
  };

  VMG._addFile = function (file) {
    var type = null;
    if (file.type && file.type.indexOf('image') === 0) type = 'image';
    else if (file.type && file.type.indexOf('video') === 0) type = 'video';
    else if (file.type && file.type.indexOf('audio') === 0) type = 'audio';
    if (!type) return;

    var id = 'mg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);

    // Read file as blob for IDB storage
    var reader = new FileReader();
    reader.onload = function() {
      var blob = new Blob([reader.result], { type: file.type });
      var url = URL.createObjectURL(blob);

      var item = {
        id: id,
        type: type,
        name: file.name,
        folderId: VMG._drillFolderId || null,
        blob: reader.result,   // ArrayBuffer for IDB
        blobType: file.type,
        url: url,              // transient object URL (recreated on load)
        duration: 0,
        width: 0,
        height: 0,
        size: file.size,
        thumb: null,
        createdAt: Date.now()
      };

      // Track recent
      if (!VMG._recentIds[type]) VMG._recentIds[type] = [];
      VMG._recentIds[type].unshift(id);
      if (VMG._recentIds[type].length > 20) VMG._recentIds[type].pop();

      if (type === 'image') {
        VMG._loadImageMeta(item, blob, function() {
          VMG._mediaItems.push(item);
          VMG._saveItemToDB(item);
          VMG._renderContent();
        });
      } else if (type === 'video') {
        VMG._loadVideoMeta(item, url, function() {
          VMG._mediaItems.push(item);
          VMG._saveItemToDB(item);
          VMG._renderContent();
        });
      } else {
        VMG._loadAudioMeta(item, url, function() {
          VMG._mediaItems.push(item);
          VMG._saveItemToDB(item);
          VMG._renderContent();
        });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  VMG._loadImageMeta = function (item, blob, cb) {
    var img = new Image();
    img.onload = function() {
      item.width = img.naturalWidth || img.width;
      item.height = img.naturalHeight || img.height;
      // Generate thumbnail
      try {
        var tc = document.createElement('canvas');
        tc.width = 120; tc.height = 68;
        var ctx = tc.getContext('2d');
        var scale = Math.min(120 / item.width, 68 / item.height);
        var w = item.width * scale, h = item.height * scale;
        ctx.drawImage(img, (120 - w) / 2, (68 - h) / 2, w, h);
        item.thumb = tc.toDataURL('image/jpeg', 0.6);
      } catch (e) {}
      URL.revokeObjectURL(img.src);
      cb();
    };
    img.onerror = function() { URL.revokeObjectURL(img.src); cb(); };
    img.src = URL.createObjectURL(blob);
  };

  VMG._loadVideoMeta = function (item, url, cb) {
    var el = document.createElement('video');
    el.preload = 'metadata';
    el.src = url;
    el.addEventListener('loadedmetadata', function() {
      item.duration = el.duration || 0;
      item.width = el.videoWidth || 0;
      item.height = el.videoHeight || 0;
      // Thumbnail at 1s or 25%
      el.currentTime = Math.min(1, el.duration / 4);
      el.addEventListener('seeked', function onSeek() {
        el.removeEventListener('seeked', onSeek);
        try {
          var tc = document.createElement('canvas');
          tc.width = 120; tc.height = 68;
          tc.getContext('2d').drawImage(el, 0, 0, 120, 68);
          item.thumb = tc.toDataURL('image/jpeg', 0.6);
        } catch (e) {}
        cb();
      }, { once: true });
    });
    el.addEventListener('error', function() { cb(); });
  };

  VMG._loadAudioMeta = function (item, url, cb) {
    var el = document.createElement('audio');
    el.preload = 'metadata';
    el.src = url;
    el.addEventListener('loadedmetadata', function() {
      item.duration = el.duration || 0;
      cb();
    });
    el.addEventListener('error', function() { cb(); });
  };

  VMG.addExternalItem = function (file, url, mediaEl) {
    var type = 'video';
    if (file.type && file.type.indexOf('image') === 0) type = 'image';
    else if (file.type && file.type.indexOf('audio') === 0) type = 'audio';

    // Avoid duplicates
    for (var i = 0; i < VMG._mediaItems.length; i++) {
      if (VMG._mediaItems[i].name === file.name && VMG._mediaItems[i].size === file.size) return;
    }

    var id = 'mg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
    var item = {
      id: id,
      type: type,
      name: file.name,
      folderId: null,
      url: url,
      duration: mediaEl.duration || 0,
      width: mediaEl.videoWidth || mediaEl.naturalWidth || 0,
      height: mediaEl.videoHeight || mediaEl.naturalHeight || 0,
      size: file.size,
      thumb: null,
      createdAt: Date.now()
    };

    // Generate thumb for video
    if (type === 'video' && mediaEl.videoWidth) {
      try {
        var tc = document.createElement('canvas');
        tc.width = 120; tc.height = 68;
        tc.getContext('2d').drawImage(mediaEl, 0, 0, 120, 68);
        item.thumb = tc.toDataURL('image/jpeg', 0.6);
      } catch (e) {}
    }

    VMG._mediaItems.push(item);
    if (!VMG._recentIds[type]) VMG._recentIds[type] = [];
    VMG._recentIds[type].unshift(id);
    if (VMG._recentIds[type].length > 20) VMG._recentIds[type].pop();

    // Save blob to IDB (read from file)
    var reader = new FileReader();
    reader.onload = function() {
      item.blob = reader.result;
      item.blobType = file.type;
      VMG._saveItemToDB(item);
    };
    reader.readAsArrayBuffer(file);

    if (VMG._isOpen) VMG._renderContent();
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'import', parent: 'video.ve-media-gallery', title: 've-media-gallery: import', mount: function () {}, unmount: function () {} });
  }
})();
