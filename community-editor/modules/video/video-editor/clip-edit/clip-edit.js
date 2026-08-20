/* Module: video/video-editor/clip-edit — CLIP EDIT — link, slip/slide, freeze, speed ramp, filter/transform/transition.
   Part of the video-editor group (decomposed from the 7695-line IIFE). Functions hang off the
   shared namespace VE (window.__ccVideoEditor, created by the parent); cross-module refs resolve
   through VE at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VE = window.__ccVideoEditor;
  if (!VE) return;

  VE._veLinkClips = function (clipIds) {
    var linkId = VE._veUid('link');
    VE._veLinkedClips[linkId] = clipIds.slice();
    clipIds.forEach(function(id) {
      VE._veProject.tracks.forEach(function(track) {
        track.clips.forEach(function(c) {
          if (c.id === id) c._linkGroupId = linkId;
        });
      });
    });
    VE._vePushUndo('link clips');
    VE._veRender();
    return linkId;
  };

  VE._veUnlinkClips = function (linkId) {
    var ids = VE._veLinkedClips[linkId];
    if (!ids) return;
    ids.forEach(function(id) {
      VE._veProject.tracks.forEach(function(track) {
        track.clips.forEach(function(c) {
          if (c.id === id) delete c._linkGroupId;
        });
      });
    });
    delete VE._veLinkedClips[linkId];
    VE._vePushUndo('unlink clips');
    VE._veRender();
  };

  VE._veGetLinkedClips = function (clipId) {
    var linkId = null;
    VE._veProject.tracks.forEach(function(track) {
      track.clips.forEach(function(c) {
        if (c.id === clipId && c._linkGroupId) linkId = c._linkGroupId;
      });
    });
    return linkId ? (VE._veLinkedClips[linkId] || []) : [clipId];
  };

  VE._veSlipEdit = function (clipId, delta) {
    VE._veProject.tracks.forEach(function(track) {
      track.clips.forEach(function(c) {
        if (c.id !== clipId) return;
        var newTrimStart = Math.max(0, (c.trimStart || 0) + delta);
        // Don't slip past source duration
        var srcDur = c._srcDuration || 999;
        if (newTrimStart + c.duration * (c.speed || 1) > srcDur) {
          newTrimStart = Math.max(0, srcDur - c.duration * (c.speed || 1));
        }
        c.trimStart = newTrimStart;
      });
    });
    VE._vePushUndo('slip edit');
    VE._veRender();
    VE._veRenderPreviewFrame();
  };

  VE._veSlideEdit = function (clipId, delta) {
    var clip = null, track = null, clipIdx = -1;
    VE._veProject.tracks.forEach(function(t) {
      t.clips.forEach(function(c, i) {
        if (c.id === clipId) { clip = c; track = t; clipIdx = i; }
      });
    });
    if (!clip || !track) return;

    // Sort clips by startTime
    var sorted = track.clips.slice().sort(function(a, b) { return a.startTime - b.startTime; });
    var si = sorted.indexOf(clip);

    var prevClip = si > 0 ? sorted[si - 1] : null;
    var nextClip = si < sorted.length - 1 ? sorted[si + 1] : null;

    // Calculate bounds
    var minStart = prevClip ? prevClip.startTime : 0;
    var maxStart = nextClip ? nextClip.startTime + nextClip.duration - clip.duration : VE._veProject.duration;

    var newStart = Math.max(minStart, Math.min(maxStart, clip.startTime + delta));
    var actualDelta = newStart - clip.startTime;

    // Adjust adjacent clips
    if (prevClip && actualDelta < 0) {
      prevClip.duration = Math.max(VE.MIN_CLIP_DURATION, prevClip.duration + actualDelta);
    }
    if (nextClip && actualDelta > 0) {
      nextClip.startTime += actualDelta;
      nextClip.duration = Math.max(VE.MIN_CLIP_DURATION, nextClip.duration - actualDelta);
      nextClip.trimStart = (nextClip.trimStart || 0) + actualDelta * (nextClip.speed || 1);
    }

    clip.startTime = newStart;
    VE._vePushUndo('slide edit');
    VE._veRecalcDuration();
    VE._veRender();
  };

  VE._veFreezeFrame = function (clipId, duration) {
    duration = duration || 2; // default 2 seconds
    var clip = null, track = null;
    VE._veProject.tracks.forEach(function(t) {
      t.clips.forEach(function(c) {
        if (c.id === clipId) { clip = c; track = t; }
      });
    });
    if (!clip || !track) return;

    var time = VE._veProject.playheadTime;
    if (time <= clip.startTime || time >= clip.startTime + clip.duration) return;

    // Capture current frame as image
    var videoEl = VE._vePlayback.videoPool[clipId];
    if (!videoEl) return;

    var canvas2 = document.createElement('canvas');
    canvas2.width = videoEl.videoWidth || 1920;
    canvas2.height = videoEl.videoHeight || 1080;
    var ctx2 = canvas2.getContext('2d');
    try { ctx2.drawImage(videoEl, 0, 0); } catch (e) { return; }
    var dataUrl = canvas2.toDataURL('image/jpeg', 0.85);

    VE._veBeginUndoGroup('freeze frame');

    // Split at playhead first
    var savedSelection = VE._veSelectedClips.slice();
    VE._veSelectedClips = [clipId];
    VE._veSplitAtPlayhead();
    VE._veSelectedClips = savedSelection;

    // Insert image clip at the split point
    var freezeClip = {
      id: VE._veUid('clip'),
      name: 'Freeze Frame',
      type: 'image',
      startTime: time,
      duration: duration,
      trimStart: 0,
      trimEnd: 0,
      speed: 1,
      volume: 0,
      transform: clip.transform ? JSON.parse(JSON.stringify(clip.transform)) : { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      blendMode: 'source-over',
      filters: {},
      transitions: { in: {}, out: {} },
      keyframes: {},
      _thumbCache: [dataUrl],
      _freezeSource: clipId
    };

    // Push subsequent clips to make room
    track.clips.forEach(function(c) {
      if (c.startTime >= time && c.id !== freezeClip.id) {
        c.startTime += duration;
      }
    });
    track.clips.push(freezeClip);

    VE._veEndUndoGroup();
    VE._veRecalcDuration();
    VE._veRender();
  };

  VE._veCreateSpeedRamp = function (clipId, rampPoints) {
    // rampPoints: [{time: 0..1 normalized within the clip, speed, easing?}]
    // Canonical write path: VEKeyframes.applySpeedCurve (object-shaped clip.keyframes.speed,
    // clip-local times, duration re-derived from the curve so the source span is conserved).
    if (!window.VEKeyframes) return;
    var clip = null;
    VE._veProject.tracks.forEach(function(track) {
      track.clips.forEach(function(c) { if (c.id === clipId) clip = c; });
    });
    if (!clip) return;
    var dur = Math.max(0.01, clip.duration || 0.01);
    var kfs = rampPoints.map(function(pt) {
      return { time: pt.time * dur, value: pt.speed, easing: pt.easing || 'easeInOut' };
    });
    VEKeyframes.applySpeedCurve(clip, kfs);
    VE._vePushUndo('speed ramp');
    VE._veRecalcDuration();
    VE._veRender();
  };

  VE._veDetachAudio = function (clipId) {
    var clip = null, track = null;
    VE._veProject.tracks.forEach(function(t) {
      t.clips.forEach(function(c) {
        if (c.id === clipId && c.type === 'video') {
          clip = c;
          track = t;
        }
      });
    });
    if (!clip) return;

    // Create audio clip from video
    var audioClip = VE._veCloneClip(clip);
    audioClip.id = VE._veUid('clip');
    audioClip.type = 'audio';
    audioClip.name = clip.name + ' (audio)';
    audioClip._thumbCache = [];

    // Find first audio track
    var audioTrack = VE._veProject.tracks.filter(function(t) { return t.type === 'audio'; })[0];
    if (!audioTrack) {
      VE._veAddTrack('audio');
      audioTrack = VE._veProject.tracks[VE._veProject.tracks.length - 1];
    }
    audioTrack.clips.push(audioClip);

    /* OWNER BUG 2026-07-25: "the detached audio has no sound, it is only added as a track widget".
       The clip was created with a NEW id but nothing ever put a media element into the playback pool
       under that id, and EVERY audio path keys off the pool: playback goes through
       VEAudioEngine.connectClip(clip.id, element, ...) and the export mixdown reads
       opts.videoPool[clip.id] (_scheduleClipOffline). So the detached clip was silent everywhere and
       only its waveform showed, because the waveform is drawn straight from clip.src. Since the
       original video clip is muted here (volume = 0) the whole sound simply disappeared.
       Give it a real element, and carry the SOURCE identity onto it (kb/editor §8.11): without
       data-cc-media-id / _ccAssetUrl the save path would file a second copy of bytes we already own. */
    var srcEl = VE._vePlayback.videoPool[clip.id];
    var mediaUrl = (srcEl && (srcEl.src || srcEl.currentSrc)) || clip.src || null;
    if (mediaUrl) {
      var aEl = document.createElement('audio');
      aEl.preload = 'auto';
      aEl.src = mediaUrl;
      var mediaId = VE._veSourceIdFor ? VE._veSourceIdFor(clip, srcEl, clip.id) : (clip._ccMediaId || null);
      if (mediaId) {
        aEl.setAttribute('data-cc-media-id', mediaId);
        audioClip._ccMediaId = mediaId;
      }
      if (clip._ccAssetUrl) audioClip._ccAssetUrl = clip._ccAssetUrl;
      audioClip.src = mediaUrl;
      VE._vePlayback.videoPool[audioClip.id] = aEl;
      if (window.VEAudioEngine && VEAudioEngine.connectClip) {
        VEAudioEngine.connectClip(audioClip.id, aEl, audioTrack.id,
          audioClip.volume != null ? audioClip.volume : 1);
      }
    } else if (typeof showToast === 'function') {
      showToast('Audio could not be detached: this clip has no readable media source', 'error');
    }

    // Mute original video clip's built-in audio
    clip._audioDetached = true;
    clip.volume = 0;

    VE._vePushUndo();
    VE._veRender();

    // Generate waveform for the new audio clip
    if (audioClip.src) VE._veGenerateWaveform(audioClip, audioClip.src);
  };

  VE._veSetClipSpeed = function (clipId, speed) {
    VE._veProject.tracks.forEach(function(track) {
      track.clips.forEach(function(c) {
        if (c.id === clipId) {
          // A constant rate replaces any speed curve; clear it FIRST (restores the true source
          // span into duration at 1x) or the duration math below reads a stale duration*speed.
          if (window.VEKeyframes && VEKeyframes.hasKeyframes(c, 'speed')) {
            VEKeyframes.clearSpeedKeyframes(c);
          }
          var origDuration = c.duration * c.speed;
          c.speed = speed;
          c.duration = origDuration / speed;
        }
      });
    });
    VE._vePushUndo();
    VE._veRecalcDuration();
    VE._veRender();
  };

  VE._veSetClipFilter = function (clipId, filterName, value) {
    VE._veProject.tracks.forEach(function(track) {
      track.clips.forEach(function(c) {
        if (c.id === clipId) {
          if (!c.filters) c.filters = {};
          c.filters[filterName] = value;
        }
      });
    });
    VE._vePushUndo();
    VE._veRender();
    VE._veRenderPreviewFrame();
  };

  VE._veGetClipFilterCSS = function (clip) {
    if (!clip.filters) return '';
    var parts = [];
    if (clip.filters.brightness != null) parts.push('brightness(' + clip.filters.brightness + '%)');
    if (clip.filters.contrast != null)   parts.push('contrast(' + clip.filters.contrast + '%)');
    if (clip.filters.saturation != null) parts.push('saturate(' + clip.filters.saturation + '%)');
    if (clip.filters.hue != null)        parts.push('hue-rotate(' + clip.filters.hue + 'deg)');
    if (clip.filters.blur != null)       parts.push('blur(' + clip.filters.blur + 'px)');
    if (clip.filters.sepia != null && clip.filters.sepia > 0) parts.push('sepia(' + clip.filters.sepia + '%)');
    if (clip.filters.invert != null && clip.filters.invert > 0) parts.push('invert(' + clip.filters.invert + '%)');
    if (clip.filters.grayscale != null && clip.filters.grayscale > 0) parts.push('grayscale(' + clip.filters.grayscale + '%)');
    return parts.join(' ');
  };

  VE._veSetClipTransform = function (clipId, prop, value) {
    VE._veProject.tracks.forEach(function(track) {
      track.clips.forEach(function(c) {
        if (c.id === clipId) {
          if (!c.transform) c.transform = { x: 0, y: 0, scale: 1, rotation: 0, flipH: false, flipV: false };
          c.transform[prop] = value;
        }
      });
    });
    VE._vePushUndo();
    VE._veRender();
  };

  VE._veRotateClip = function (clipId, degrees) {
    VE._veProject.tracks.forEach(function(track) {
      track.clips.forEach(function(c) {
        if (c.id === clipId) {
          if (!c.transform) c.transform = { x: 0, y: 0, scale: 1, rotation: 0, flipH: false, flipV: false };
          c.transform.rotation = (c.transform.rotation + degrees) % 360;
        }
      });
    });
    VE._vePushUndo();
    VE._veRender();
  };

  VE._veFlipClip = function (clipId, axis) {
    VE._veProject.tracks.forEach(function(track) {
      track.clips.forEach(function(c) {
        if (c.id === clipId) {
          if (!c.transform) c.transform = { x: 0, y: 0, scale: 1, rotation: 0, flipH: false, flipV: false };
          if (axis === 'h') c.transform.flipH = !c.transform.flipH;
          else c.transform.flipV = !c.transform.flipV;
        }
      });
    });
    VE._vePushUndo();
    VE._veRender();
  };

  VE._veSetTransition = function (clipId, direction, type, duration) {
    VE._veProject.tracks.forEach(function(track) {
      track.clips.forEach(function(c) {
        if (c.id === clipId) {
          if (!c.transitions) c.transitions = { in: null, out: null };
          c.transitions[direction] = { type: type, duration: duration || 0.5 };
        }
      });
    });
    VE._vePushUndo();
    VE._veRender();
    VE._veRenderPreviewFrame();
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'clip-edit', parent: 'video.video-editor', title: 'video-editor: clip-edit', mount: function () {}, unmount: function () {} });
  }
})();
