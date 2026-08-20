/* Module: video/ve-media-pipeline/format — Format detection / probe / validation / mime.
   Part of the ve-media-pipeline group (decomposed from the 1385-line IIFE). Functions hang off the
   shared namespace VMP (window.__ccVEMediaPipeline, created by the parent); cross-module refs resolve
   through VMP at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VMP = window.__ccVEMediaPipeline;
  if (!VMP) return;

  VMP._mpDetectFormat = function (file) {
    return file.slice(0, 16).arrayBuffer().then(function(buf) {
      var bytes = new Uint8Array(buf);

      // MP4/MOV: check for 'ftyp' at offset 4
      if (bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
        // Subtype detection from ftyp brand
        var brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
        if (brand === 'qt  ' || brand === 'mqt ') return 'mov';
        if (brand === '3gp4' || brand === '3gp5' || brand === '3gp6') return '3gp';
        return 'mp4';
      }

      // EBML → WebM or MKV (distinguish by doctype later)
      if (bytes.length >= 4 && bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) {
        // Simple heuristic: check if filename hints at mkv
        var ext = (file.name || '').split('.').pop().toLowerCase();
        return ext === 'mkv' ? 'mkv' : 'webm';
      }

      // RIFF: could be AVI, WAV, or WebP
      if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
        var subtype = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
        if (subtype === 'WAVE') return 'wav';
        if (subtype === 'WEBP') return 'webp';
        if (subtype === 'AVI ') return 'avi';
        return 'riff';
      }

      // FLV
      if (bytes.length >= 4 && bytes[0] === 0x46 && bytes[1] === 0x4C && bytes[2] === 0x56) return 'flv';

      // FLAC
      if (bytes.length >= 4 && bytes[0] === 0x66 && bytes[1] === 0x4C && bytes[2] === 0x61 && bytes[3] === 0x43) return 'flac';

      // OGG
      if (bytes.length >= 4 && bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return 'ogg';

      // MP3 sync bytes
      if (bytes.length >= 2 && bytes[0] === 0xFF && (bytes[1] === 0xFB || bytes[1] === 0xF3 || bytes[1] === 0xF2)) return 'mp3';
      // ID3 tag (MP3)
      if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return 'mp3';

      // Image formats
      if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'png';
      if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'jpeg';
      if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'gif';

      // Fallback to MIME type
      var mime = VMP.MIME_MAP[file.type];
      if (mime) return mime;

      return 'unknown';
    });
  };

  VMP._mpCanPlay = function (mimeWithCodec) {
    // Level 1: MediaSource API check
    if (typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported) {
      if (MediaSource.isTypeSupported(mimeWithCodec)) return 'native';
    }

    // Level 1b: simple video.canPlayType
    var testVideo = document.createElement('video');
    var canPlay = testVideo.canPlayType(mimeWithCodec);
    if (canPlay === 'probably' || canPlay === 'maybe') return 'native';

    // Level 2: WebCodecs check (async, but we do sync estimate)
    if (typeof VideoDecoder !== 'undefined') {
      // Extract codec string from MIME
      var codecMatch = mimeWithCodec.match(/codecs[= ]+"?([^"]+)"?/i);
      if (codecMatch) return 'webcodecs'; // Optimistic — WebCodecs available
    }

    // Level 3: FFmpeg.wasm — removed

    return 'unsupported';
  };

  VMP._mpBuildMime = function (format, videoCodec, audioCodec) {
    var container = 'video/mp4';
    if (format === 'webm' || format === 'mkv') container = 'video/webm';
    else if (format === 'ogg') container = 'video/ogg';
    else if (format === 'avi') container = 'video/x-msvideo';
    else if (format === 'mov') container = 'video/quicktime';

    var codecs = [];
    if (videoCodec) codecs.push(videoCodec);
    if (audioCodec) codecs.push(audioCodec);
    if (codecs.length) return container + '; codecs="' + codecs.join(', ') + '"';
    return container;
  };

  VMP.MediaProbe = {
    /**
     * Full analysis of a media file
     * @param {File} file
     * @returns {Promise<MediaInfo>}
     */
    analyze: function(file) {
      var info = {
        container: {
          format: 'unknown',
          duration: 0,
          bitrate: 0,
          fileSize: file.size
        },
        streams: [],
        metadata: {
          fileName: file.name,
          mimeType: file.type,
          lastModified: file.lastModified
        },
        compatibility: 'unknown', // 'native' | 'webcodecs' | 'transcode' | 'unsupported'
        warnings: [],
        errors: []
      };

      return VMP._mpDetectFormat(file).then(function(format) {
        info.container.format = format;

        // Validate
        if (format === 'unknown') {
          info.errors.push('Unrecognized file format');
          info.compatibility = 'unsupported';
          return info;
        }

        if (file.size > VMP.MAX_FILE_SIZE) {
          info.errors.push('File too large (max 4GB)');
          return info;
        }

        if (file.size > VMP.WARN_FILE_SIZE) {
          info.warnings.push('Large file (' + Math.round(file.size / 1024 / 1024) + 'MB). Consider using proxy workflow.');
        }

        // Use browser native to get duration, dimensions
        return VMP.MediaProbe._probeBrowserNative(file, info);
      });
    },

    /**
     * Level 1: Browser native probing via HTML media elements
     */
    _probeBrowserNative: function(file, info) {
      var url = URL.createObjectURL(file);
      var format = info.container.format;
      var isVideo = file.type.indexOf('video') === 0 ||
                    ['mp4', 'webm', 'mkv', 'mov', 'avi', 'flv', '3gp'].indexOf(format) >= 0;
      var isAudio = file.type.indexOf('audio') === 0 ||
                    ['mp3', 'wav', 'flac', 'ogg', 'aac', 'm4a'].indexOf(format) >= 0;
      var isImage = file.type.indexOf('image') === 0 ||
                    ['png', 'jpeg', 'gif', 'webp'].indexOf(format) >= 0;

      if (isImage) {
        info.container.duration = 0;
        info.streams.push({
          index: 0, type: 'image', codec: format,
          width: 0, height: 0 // Will be filled by Image load
        });
        info.compatibility = 'native';
        info._objectUrl = url;
        info._mediaType = 'image';

        return new Promise(function(resolve) {
          var img = new Image();
          img.onload = function() {
            info.streams[0].width = img.naturalWidth;
            info.streams[0].height = img.naturalHeight;
            resolve(info);
          };
          img.onerror = function() {
            info.warnings.push('Could not load image preview');
            resolve(info);
          };
          img.src = url;
        });
      }

      var el = document.createElement(isVideo ? 'video' : 'audio');
      el.preload = 'metadata';
      el.muted = true;

      return new Promise(function(resolve) {
        var timeout = setTimeout(function() {
          info.warnings.push('Metadata load timeout — file may be unsupported');
          info.compatibility = VMP._mpCanPlay(file.type || ('video/' + format));
          info._objectUrl = url;
          info._mediaType = isVideo ? 'video' : 'audio';
          resolve(info);
        }, 5000);

        el.addEventListener('loadedmetadata', function() {
          clearTimeout(timeout);

          info.container.duration = isFinite(el.duration) ? el.duration : 0;
          info.container.bitrate = info.container.duration > 0
            ? Math.round((file.size * 8) / info.container.duration)
            : 0;

          if (isVideo) {
            info.streams.push({
              index: 0,
              type: 'video',
              codec: VMP._mpGuessCodecFromFormat(format, 'video'),
              width: el.videoWidth || 0,
              height: el.videoHeight || 0,
              fps: 0, // Browser doesn't expose FPS directly
              pixelFormat: 'unknown'
            });
            // Assume audio stream exists for video files
            info.streams.push({
              index: 1,
              type: 'audio',
              codec: VMP._mpGuessCodecFromFormat(format, 'audio'),
              sampleRate: 0,
              channels: 0,
              channelLayout: 'unknown'
            });
          } else {
            info.streams.push({
              index: 0,
              type: 'audio',
              codec: VMP._mpGuessCodecFromFormat(format, 'audio'),
              sampleRate: 0,
              channels: 0,
              channelLayout: 'unknown'
            });
          }

          info.compatibility = VMP._mpCanPlay(file.type || (VMP._mpBuildMime(format)));
          info._objectUrl = url;
          info._mediaType = isVideo ? 'video' : 'audio';
          info._mediaElement = el;
          resolve(info);
        });

        el.addEventListener('error', function() {
          clearTimeout(timeout);
          info.errors.push('Browser cannot decode this file');
          info.compatibility = 'unsupported';
          info._objectUrl = url;
          info._mediaType = isVideo ? 'video' : 'audio';
          resolve(info);
        });

        el.src = url;
      });
    }
  };

  VMP._mpGuessCodecFromFormat = function (format, streamType) {
    if (streamType === 'video') {
      var videoMap = {
        'mp4': 'h264', 'mov': 'h264', 'webm': 'vp9', 'mkv': 'h264',
        'avi': 'h264', 'flv': 'h264', '3gp': 'h264'
      };
      return videoMap[format] || 'unknown';
    }
    var audioMap = {
      'mp4': 'aac', 'mov': 'aac', 'webm': 'opus', 'mkv': 'aac',
      'mp3': 'mp3', 'wav': 'pcm', 'flac': 'flac', 'ogg': 'vorbis',
      'aac': 'aac', 'm4a': 'aac', 'avi': 'mp3', '3gp': 'aac'
    };
    return audioMap[format] || 'unknown';
  };

  VMP._mpValidateImport = function (file) {
    return VMP.MediaProbe.analyze(file).then(function(info) {
      if (info.errors.length > 0) {
        return { valid: false, info: info, message: info.errors.join('; ') };
      }

      // Build friendly message
      var msg = '';
      var format = info.container.format.toUpperCase();
      var dur = info.container.duration;
      var durStr = dur > 0 ? VMP._mpFormatDuration(dur) : '';

      if (info.streams.length > 0 && info.streams[0].type === 'video') {
        var vs = info.streams[0];
        msg = format + ' video (' + (vs.codec || '').toUpperCase() + ', ' +
          vs.width + '×' + vs.height;
        if (durStr) msg += ', ' + durStr;
        msg += ')';
      } else if (info.streams.length > 0 && info.streams[0].type === 'audio') {
        msg = format + ' audio';
        if (durStr) msg += ' (' + durStr + ')';
      } else if (info.streams.length > 0 && info.streams[0].type === 'image') {
        var is = info.streams[0];
        msg = format + ' image (' + is.width + '×' + is.height + ')';
      } else {
        msg = format + ' file';
      }

      if (info.compatibility === 'unsupported') {
        return { valid: false, info: info, message: msg + ' — format not supported' };
      }

      if (info.compatibility === 'transcode') {
        msg += ' — requires transcoding';
        info.warnings.push('Transcoding required for playback');
      }

      return { valid: true, info: info, message: msg };
    });
  };

  VMP._mpFormatDuration = function (sec) {
    var m = Math.floor(sec / 60);
    var s = Math.round(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'format', parent: 'video.ve-media-pipeline', title: 've-media-pipeline: format', mount: function () {}, unmount: function () {} });
  }
})();
