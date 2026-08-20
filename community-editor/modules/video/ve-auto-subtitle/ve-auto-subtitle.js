// ═══════════════════════════════════════════════════════════════════
//  VEAutoSubtitle - local and cloud subtitle generation.
//  Local Whisper stays in browser. ElevenLabs Scribe and Deepgram Nova-3 use
//  server-side provider policy, keys, quota, billing, and availability gates.
//  All paths normalize into one timed cue schema; cloud words may carry speaker metadata.
// ═══════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  /* COMMUNITY EDITION: upstream loads transformers.js through `/api/cdn`, a same-origin bridge to
     jsdelivr whose handler lives in apps/web. There is no apps/web here, so that route 404s and
     local subtitles would be dead on arrival. The library and its onnxruntime WASM are VENDORED
     (tools/vendor-assets.mjs documents the pattern; these two came from the same jsdelivr package
     at the same pinned version), so the engine itself needs no network at all.

     The MODEL is the one thing that cannot be vendored: whisper-large-v3-turbo is ~200 MB and is
     fetched from huggingface.co on first use, cached by the browser afterwards. That is the single
     permitted outbound request in this build and it only happens when the person asks for
     subtitles. The panel says so before it starts. */
  function _libUrl()  { return 'vendor/transformers/transformers.js'; }
  function _wasmDir() { return 'vendor/transformers/'; }
  function _hfHost()  { return 'https://huggingface.co'; }

  /* COMMUNITY EDITION: one engine, on this device. The two cloud transcribers upstream ships
     (ElevenLabs Scribe, Deepgram Nova-3) are DELETED here along with everything else that talks to
     a vendor. Whisper Turbo needs WebGPU and about 200 MB on first run; when the browser has no
     WebGPU the modal REFUSES with a sentence rather than offering an empty engine list. */
  var MODELS = {
    turbo:  { id: 'onnx-community/whisper-large-v3-turbo', label: 'Whisper Turbo (on-device ~200 MB)', size: 200, gpuOnly: true }
  };

  function _abortError() {
    var err = new Error('Transcription cancelled.');
    err.name = 'AbortError';
    return err;
  }

  function _throwIfAborted(signal) {
    if (signal && signal.aborted) throw _abortError();
  }

  function _hasWebGPU() {
    return typeof navigator !== 'undefined' && !!navigator.gpu;
  }

  // ─── Video Editor bridges (current API: VideoEditor.getProject / getMediaElement / render) ──
  function _proj() {
    if (window.VideoEditor && VideoEditor.getProject) {
      var p = VideoEditor.getProject();
      if (p) return p;
    }
    return window._veProject || null;
  }

  function _mediaEl(clipId) {
    if (window.VideoEditor && VideoEditor.getMediaElement) {
      var el = VideoEditor.getMediaElement(clipId);
      if (el) return el;
    }
    if (window._vePlayback && _vePlayback.videoPool) return _vePlayback.videoPool[clipId] || null;
    return null;
  }

  function _refreshTimeline() {
    if (window.VideoEditor && VideoEditor.render) VideoEditor.render();
    else {
      if (window._veRenderTimeline) _veRenderTimeline();
      if (window._veRenderPreview) _veRenderPreview();
    }
    if (typeof saveCurrentPage === 'function') saveCurrentPage();
    if (typeof cc !== 'undefined' && cc.emit) cc.emit('action:ran', { id: 'video:auto-subtitle-checkpoint' });
  }

  var LANGUAGES = [
    { code: null, label: 'Auto-detect' },
    { code: 'en', label: 'English' },
    { code: 'tr', label: 'Turkish' },
    { code: 'de', label: 'German' },
    { code: 'fr', label: 'French' },
    { code: 'es', label: 'Spanish' },
    { code: 'ja', label: 'Japanese' },
    { code: 'zh', label: 'Chinese' },
    { code: 'ko', label: 'Korean' },
    { code: 'pt', label: 'Portuguese' },
    { code: 'ru', label: 'Russian' },
    { code: 'ar', label: 'Arabic' }
  ];

  var _transcriber = null;
  var _currentModelId = null;
  var _libLoaded = false;
  var _libLoading = false;
  // Word-level timestamp capability: probed on the FIRST real span (null = unknown). transformers.js
  // supports return_timestamps:'word' via attention alignment but reliability varies per model/build,
  // so it is measured at runtime instead of assumed, and the answer is cached for the session.
  var _wordTsSupported = null;

  /* One pipeline call with graceful degradation: word timestamps -> segment timestamps, and the
     no_repeat_ngram_size brake dropped if this build rejects it. Returns { res, wordMode }. */
  function _runPipe(pipe, seg, language) {
    var wantWord = _wordTsSupported !== false;
    var opts = {
      return_timestamps: wantWord ? 'word' : true,
      chunk_length_s: 30, stride_length_s: 5,
      no_repeat_ngram_size: 3
    };
    if (language) opts.language = language;
    var attempt = function (o) {
      return pipe(seg, o).catch(function (e) {
        if (o.no_repeat_ngram_size) {
          var c = {}; for (var k in o) if (o.hasOwnProperty(k) && k !== 'no_repeat_ngram_size') c[k] = o[k];
          return pipe(seg, c);
        }
        throw e;
      });
    };
    return attempt(opts).then(function (res) {
      if (!wantWord) return { res: res, wordMode: false };
      var ch = res && res.chunks;
      // word-mode verdict: chunks exist and are single tokens (no internal whitespace in >=80%)
      var wordy = !!(ch && ch.length && ch.filter(function (c) {
        return !/\s/.test(String(c.text || '').trim());
      }).length >= ch.length * 0.8);
      _wordTsSupported = wordy;
      return { res: res, wordMode: wordy };
    }).catch(function (e) {
      if (wantWord && _wordTsSupported === null) {
        // this build rejects 'word' outright: remember and redo as segments
        _wordTsSupported = false;
        var o2 = { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 };
        if (language) o2.language = language;
        return pipe(seg, o2).then(function (res) { return { res: res, wordMode: false }; });
      }
      throw e;
    });
  }

  // ─── Library Loader (same-origin ESM via dynamic import) ────

  function _loadTransformersLib(onProgress) {
    return new Promise(function(resolve, reject) {
      if (_libLoaded && window.transformers) { resolve(); return; }
      if (_libLoading) {
        var poll = setInterval(function() {
          if (_libLoaded) { clearInterval(poll); resolve(); }
        }, 200);
        setTimeout(function() { clearInterval(poll); reject(new Error('Timeout loading Transformers.js')); }, 60000);
        return;
      }
      _libLoading = true;
      if (onProgress) onProgress({ stage: 'library', progress: 0, text: 'Loading engine...' });

      // Same-origin import → the onnxruntime worker it spawns is same-origin too,
      // which is required under the editor's COEP (require-corp) isolation.
      import(_libUrl()).then(function(mod) {
        window.transformers = mod;
        _libLoaded = true;
        _libLoading = false;
        if (mod && mod.env) {
          mod.env.allowLocalModels = false;
          mod.env.useBrowserCache = true;
          // Route model weights through our bridge (same-origin, COEP-safe).
          mod.env.remoteHost = _hfHost();
          mod.env.remotePathTemplate = '{model}/resolve/{revision}/';
          // onnxruntime wasm lives next to the library in the jsdelivr dist folder.
          if (mod.env.backends && mod.env.backends.onnx && mod.env.backends.onnx.wasm) {
            mod.env.backends.onnx.wasm.wasmPaths = _wasmDir();
          }
        }
        if (onProgress) onProgress({ stage: 'library', progress: 1, text: 'Engine loaded' });
        resolve();
      }).catch(function(err) {
        _libLoading = false;
        reject(new Error('Failed to load the engine: ' + (err && err.message ? err.message : err)));
      });
    });
  }

  // ─── Audio Extraction (16kHz mono for Whisper) ─────────────
  function _timelineDuration() {
    var proj = _proj();
    var duration = 0;
    if (!proj || !proj.tracks) return duration;
    proj.tracks.forEach(function(track) {
      if (!track.clips) return;
      track.clips.forEach(function(clip) {
        var end = (clip.startTime || 0) + (clip.duration || 0);
        if (end > duration) duration = end;
      });
    });
    return duration;
  }

  function _extractTimelineAudio(onProgress, range) {
    return new Promise(function(resolve, reject) {
      if (onProgress) onProgress({ stage: 'audio', progress: 0, text: 'Extracting audio from timeline...' });

      var proj = _proj();
      if (!proj || !proj.tracks) {
        reject(new Error('No video project loaded'));
        return;
      }

      var totalDuration = _timelineDuration();
      var windowStart = range && typeof range.start === 'number' ? Math.max(0, range.start) : 0;
      var windowEnd = range && typeof range.end === 'number' ? Math.min(totalDuration, range.end) : totalDuration;
      var duration = Math.max(0, windowEnd - windowStart);

      if (duration <= 0) {
        reject(new Error('Timeline is empty (no audio/video content found)'));
        return;
      }

      var targetSR = 16000; // Whisper expects 16kHz mono
      var offlineCtx = new OfflineAudioContext(1, Math.ceil(targetSR * duration), targetSR);
      var clipPromises = [];
      // Per-clip diagnostics: when the rendered buffer comes out silent, the difference between
      // "no sources", "every decode failed" (AI-generated / recorder clips often have NO audio
      // track) and "decoded but silent" is the whole diagnosis - say which one it was.
      var stats = { scheduled: 0, decoded: 0, failed: 0, firstError: null };

      proj.tracks.forEach(function(track) {
        if (track.muted || !track.clips) return;
        var trackVol = track.volume != null ? track.volume : 1;

        track.clips.forEach(function(clip) {
          if (clip.type !== 'video' && clip.type !== 'audio') return;
          var clipStart = clip.startTime || 0;
          var clipEnd = clipStart + (clip.duration || 0);
          if (clipEnd <= windowStart || clipStart >= windowEnd) return;
          var el = _mediaEl(clip.id);
          if (!el || !(el.src || el.currentSrc)) return;
          stats.scheduled++;
          clipPromises.push(_scheduleClipOffline(offlineCtx, clip, el, trackVol, stats, windowStart, windowEnd));
        });
      });

      if (clipPromises.length === 0) {
        if (range) {
          resolve({ pcm: null, start: windowStart, end: windowEnd, totalDuration: totalDuration, silent: true });
          return;
        }
        reject(new Error('No audio source in timeline (add a non-silent video/audio clip).'));
        return;
      }

      Promise.all(clipPromises).then(function() {
        if (onProgress) onProgress({ stage: 'audio', progress: 0.5, text: 'Rendering offline audio...' });
        return offlineCtx.startRendering();
      }).then(function(renderedBuffer) {
        var data = renderedBuffer.getChannelData(0);
        // Guard against silent/empty audio: Whisper hallucinates short words
        // ("and", "you") on silence, which looks like a broken transcript. Detect
        // it and give a MESSAGE THAT NAMES THE ACTUAL CAUSE.
        var peak = 0;
        for (var si = 0; si < data.length; si += 97) { var a = Math.abs(data[si]); if (a > peak) peak = a; }
        if (peak < 0.002) {
          console.warn('[VEAutoSubtitle] silent buffer. stats:', JSON.stringify(stats));
          if (range && stats.decoded > 0) {
            resolve({ pcm: null, start: windowStart, end: windowEnd, totalDuration: totalDuration, silent: true });
            return;
          }
          var msg;
          if (stats.decoded === 0) {
            msg = 'Audio channel of clips could not be decoded' +
              (stats.firstError ? ' (' + stats.firstError + ')' : '') +
              '. Note: AI-generated videos and some recordings may not contain an audio channel.';
          } else {
            msg = 'Audio decoded but appears completely silent (' + stats.decoded + '/' + stats.scheduled +
              ' clip). Check that the clip/track audio is not muted.';
          }
          reject(new Error(msg));
          return;
        }
        if (onProgress) onProgress({ stage: 'audio', progress: 1, text: 'Audio window extracted (' + Math.round(windowStart) + '-' + Math.round(windowEnd) + 's)' });
        resolve({ pcm: data, start: windowStart, end: windowEnd, totalDuration: totalDuration });
      }).catch(function(err) {
        reject(new Error('Audio extraction failed: ' + err.message));
      });
    });
  }

  function _scheduleClipOffline(ctx, clip, el, trackVol, stats, windowStart, windowEnd) {
    return new Promise(function(resolve) {
      var src = el.src || el.currentSrc;
      if (!src) { resolve(); return; }
      fetch(src).then(function(resp) {
        if (!resp.ok) throw new Error('source could not be read: HTTP ' + resp.status);
        return resp.arrayBuffer();
      }).then(function(arrBuf) {
        return ctx.decodeAudioData(arrBuf);
      }).then(function(audioBuf) {
        var source = ctx.createBufferSource();
        source.buffer = audioBuf;
        var gain = ctx.createGain();
        gain.gain.value = (clip.volume != null ? clip.volume : 1) * trackVol;
        source.connect(gain);
        gain.connect(ctx.destination);
        var trimStart = clip.trimStart || 0;
        var speed = clip.speed || 1;
        var clipStart = clip.startTime || 0;
        var clipEnd = clipStart + (clip.duration || 0);
        var overlapStart = Math.max(clipStart, windowStart || 0);
        var overlapEnd = Math.min(clipEnd, typeof windowEnd === 'number' ? windowEnd : clipEnd);
        var timelineDuration = Math.max(0, overlapEnd - overlapStart);
        if (!timelineDuration) { resolve(); return; }
        source.playbackRate.value = speed;
        var startAt = Math.max(0, overlapStart - (windowStart || 0));
        var sourceOffset = trimStart + Math.max(0, overlapStart - clipStart) * speed;
        var sourceDuration = Math.min(timelineDuration * speed, Math.max(0, audioBuf.duration - sourceOffset));
        if (!sourceDuration) { resolve(); return; }
        source.start(startAt, sourceOffset, sourceDuration);
        if (stats) stats.decoded++;
        resolve();
      }).catch(function(e) {
        // skip clips we can't decode, but REMEMBER why (video-only mp4, CORS, fragmented mp4...)
        if (stats) {
          stats.failed++;
          if (!stats.firstError) stats.firstError = (e && e.message) ? String(e.message).slice(0, 120) : 'decode error';
        }
        console.warn('[VEAutoSubtitle] clip audio skipped:', clip.id, e);
        resolve();
      });
    });
  }

  // ─── VAD (Silero v5, local ONNX) ───────────────────────────
  /* Speech spans BEFORE Whisper. Whisper hallucinates on silence/music (the owner's
     "why why why" loop): the fix with the highest leverage is to never hand it non-speech.
     Runs on the same vendored onnxruntime the cutout tool ships (/vendor/cutout/), model
     vendored locally (/vendor/vad/silero_vad_v5.onnx, ~2.3MB) - no CDN, COEP-safe.
     Interface is probed from the session (v5: 'state' [2,1,128] + 576-sample input with
     64-sample context; legacy v4: 'h'/'c' [2,1,64] + 1536-sample input), so a model swap
     does not silently break inference. */
  var _vadSession = null, _vadOrt = null;

  function _loadVad() {
    if (_vadSession) return Promise.resolve(_vadSession);
    var base = (typeof location !== 'undefined' ? location.origin : '') + '/vendor/';
    return import(base + 'cutout/ort.wasm.bundle.min.mjs').then(function (ort) {
      _vadOrt = ort;
      ort.env.wasm.wasmPaths = base + 'cutout/';
      ort.env.wasm.numThreads = 1; // tiny model; threads buy nothing
      ort.env.logLevel = 'error';
      return fetch(base + 'vad/silero_vad_v5.onnx').then(function (r) {
        if (!r.ok) throw new Error('VAD model fetch failed: ' + r.status);
        return r.arrayBuffer();
      });
    }).then(function (bytes) {
      return _vadOrt.InferenceSession.create(new Uint8Array(bytes), { executionProviders: ['wasm'] });
    }).then(function (sess) {
      _vadSession = sess;
      return sess;
    });
  }

  /* pcm: Float32Array @16kHz mono. Returns [{start, end}] seconds of SPEECH, padded and merged.
     Hysteresis per Silero's reference defaults: enter speech at prob>0.5, leave below 0.35. */
  function _vadSegments(pcm, onProgress) {
    return _loadVad().then(function (sess) {
      var ort = _vadOrt;
      var isV5 = sess.inputNames.indexOf('state') !== -1;
      var FRAME = isV5 ? 512 : 1536;
      var CTX = isV5 ? 64 : 0;
      var stateDims = isV5 ? [2, 1, 128] : [2, 1, 64];
      var stateLen = stateDims[0] * stateDims[1] * stateDims[2];
      var state = new Float32Array(stateLen);
      var h = new Float32Array(stateLen), c = new Float32Array(stateLen);
      var srTensor = new ort.Tensor('int64', BigInt64Array.from([BigInt(16000)]), [1]);
      var input = new Float32Array(FRAME + CTX);
      var nFrames = Math.floor(pcm.length / FRAME);
      var probs = new Float32Array(nFrames);
      var fi = 0;

      function step() {
        var end = Math.min(fi + 1500, nFrames); // ~48s of audio per slice, then yield to the UI
        var chain = Promise.resolve();
        var run = function (idx) {
          return function () {
            var off = idx * FRAME;
            if (CTX) {
              // 64 samples of left context, zeros at the very start
              for (var k = 0; k < CTX; k++) input[k] = off - CTX + k >= 0 ? pcm[off - CTX + k] : 0;
              input.set(pcm.subarray(off, off + FRAME), CTX);
            } else {
              input.set(pcm.subarray(off, off + FRAME), 0);
            }
            var feeds = { input: new ort.Tensor('float32', input, [1, FRAME + CTX]), sr: srTensor };
            if (isV5) feeds.state = new ort.Tensor('float32', state, stateDims);
            else { feeds.h = new ort.Tensor('float32', h, stateDims); feeds.c = new ort.Tensor('float32', c, stateDims); }
            return sess.run(feeds).then(function (out) {
              probs[idx] = out.output ? out.output.data[0] : out[sess.outputNames[0]].data[0];
              if (isV5 && out.stateN) state = out.stateN.data;
              else if (!isV5) { if (out.hn) h = out.hn.data; if (out.cn) c = out.cn.data; }
            });
          };
        };
        for (var i = fi; i < end; i++) chain = chain.then(run(i));
        return chain.then(function () {
          fi = end;
          if (onProgress) onProgress(nFrames ? fi / nFrames : 1);
          if (fi < nFrames) return new Promise(function (res) { setTimeout(res, 0); }).then(step);
        });
      }

      return step().then(function () {
        // Hysteresis -> raw spans (frame = FRAME/16000 sec)
        var fsec = FRAME / 16000;
        var spans = [], inSpeech = false, s0 = 0;
        for (var q = 0; q < nFrames; q++) {
          if (!inSpeech && probs[q] > 0.5) { inSpeech = true; s0 = q; }
          else if (inSpeech && probs[q] < 0.35) {
            if ((q - s0) * fsec >= 0.1) spans.push({ start: s0 * fsec, end: q * fsec });
            inSpeech = false;
          }
        }
        if (inSpeech) spans.push({ start: s0 * fsec, end: nFrames * fsec });
        // pad 0.2s each side, then merge spans closer than 0.4s (keeps sentence context together
        // without re-admitting long silences, which is what hallucinates)
        var padded = spans.map(function (sp) {
          return { start: Math.max(0, sp.start - 0.2), end: Math.min(pcm.length / 16000, sp.end + 0.2) };
        });
        var merged = [];
        for (var m = 0; m < padded.length; m++) {
          var last = merged[merged.length - 1];
          if (last && padded[m].start - last.end < 0.4) last.end = padded[m].end;
          else merged.push(padded[m]);
        }
        return merged;
      });
    });
  }

  /* Symbol-garbage gate. The owner's real-footage test produced a cue that was ONE long token of
     repeated punctuation ("!!!!!!..."): token-level dedupe never sees it because there is no
     whitespace. Two rules: (1) any same-character run of 4+ collapses to 3 ("!!!!!!!" -> "!!!",
     legit "..." survives), (2) a text with NO letter or digit anywhere is not language - it is a
     no-speech artifact (music/waves pushed through the decoder) and the cue is DROPPED. */
  function _cleanText(text) {
    var t = String(text || '').replace(/(.)\1{3,}/g, '$1$1$1').trim();
    if (!t) return '';
    var hasWord = false;
    try { hasWord = /[\p{L}\p{N}]/u.test(t); }
    catch (e) { hasWord = /[A-Za-z0-9À-ɏЀ-ӿ一-鿿]/.test(t); }
    return hasWord ? t : '';
  }

  // ─── Text repair: collapse hallucination loops ─────────────
  /* "why why why why" -> "why why". Keeps up to 2 consecutive repeats (natural speech has
     doubles); 3+ identical tokens in a row are a decoder loop, never real dialogue. A whole-cue
     low-entropy guard then catches multi-word loops ("thank you thank you thank you"). */
  function _collapseRepeats(text) {
    var toks = String(text || '').trim().split(/\s+/);
    if (toks.length < 3) return text;
    var norm = function (t) { return t.toLowerCase().replace(/[.,!?;:…"']+$/g, ''); };
    var out = [], run = 1;
    for (var i = 0; i < toks.length; i++) {
      if (i > 0 && norm(toks[i]) === norm(toks[i - 1]) && norm(toks[i]) !== '') run++;
      else run = 1;
      if (run <= 2) out.push(toks[i]);
    }
    // multi-word loop guard: bigram repetition ("thank you thank you ...")
    var res = out, changed = true;
    while (changed && res.length >= 6) {
      changed = false;
      for (var w = 2; w <= 4; w++) {
        var collapsed = [];
        var j = 0;
        while (j < res.length) {
          collapsed.push(res[j]);
          // count how many times the w-gram starting at j repeats immediately
          var reps = 0;
          while (j + (reps + 1) * w + w <= res.length + w) {
            var same = true;
            for (var k = 0; k < w; k++) {
              var a = res[j + k], b = res[j + (reps + 1) * w + k];
              if (a === undefined || b === undefined || norm(a) !== norm(b)) { same = false; break; }
            }
            if (!same) break;
            reps++;
          }
          if (reps >= 2) { // gram repeated 3+ times total -> keep one copy
            for (var k2 = 1; k2 < w; k2++) collapsed.push(res[j + k2]);
            j += (reps + 1) * w;
            changed = true;
          } else j++;
        }
        res = collapsed;
      }
    }
    return res.join(' ');
  }

  // ─── Readable cue segmentation ─────────────────────────────
  /* 1 Whisper chunk used to become 1 cue: a 30s chunk = one giant Textbox. Split chunk text into
     subtitle-sized pieces (<= 2 lines x ~42 chars) at sentence boundaries first, word boundaries
     second, and distribute the chunk's timespan by character share. Display capped at 5s per cue. */
  var CUE_MAX_CHARS = 84, CUE_MAX_DUR = 5, CUE_MIN_DUR = 0.6;

  function _splitToPieces(text) {
    var sentences = String(text).trim().match(/[^.!?…]+[.!?…]*\s*/g) || [String(text).trim()];
    var pieces = [], cur = '';
    var flush = function () { if (cur.trim()) pieces.push(cur.trim()); cur = ''; };
    for (var i = 0; i < sentences.length; i++) {
      var s = sentences[i].trim();
      if (!s) continue;
      if ((cur + ' ' + s).trim().length <= CUE_MAX_CHARS) { cur = (cur + ' ' + s).trim(); continue; }
      flush();
      if (s.length <= CUE_MAX_CHARS) { cur = s; continue; }
      // long sentence: pack words
      var words = s.split(/\s+/), buf = '';
      for (var w = 0; w < words.length; w++) {
        if ((buf + ' ' + words[w]).trim().length > CUE_MAX_CHARS) { pieces.push(buf.trim()); buf = words[w]; }
        else buf = (buf + ' ' + words[w]).trim();
      }
      cur = buf;
    }
    flush();
    return pieces;
  }

  function _segmentChunk(text, t0, t1, cues) {
    var pieces = _splitToPieces(text);
    if (!pieces.length) return;
    var total = 0;
    for (var i = 0; i < pieces.length; i++) total += pieces[i].length;
    var span = Math.max(0.2, (t1 - t0));
    var t = t0;
    for (var p = 0; p < pieces.length; p++) {
      var dur = span * (pieces[p].length / total);
      if (dur < CUE_MIN_DUR) dur = Math.min(CUE_MIN_DUR, span);
      var end = Math.min(t1, t + dur);
      cues.push({
        id: 'auto-' + (cues.length + 1),
        startTime: +t.toFixed(3),
        endTime: +Math.max(t + 0.2, Math.min(end, t + CUE_MAX_DUR)).toFixed(3),
        text: pieces[p],
        style: {}
      });
      t = end;
    }
  }

  // ─── Transcription Pipeline ────────────────────────────────

  function _getTranscriber(modelKey, onProgress) {
    var model = MODELS[modelKey] || MODELS.base;

    if (_transcriber && _currentModelId === model.id) {
      return Promise.resolve(_transcriber);
    }

    if (onProgress) onProgress({ stage: 'model', progress: 0, text: 'Loading model: ' + model.label });

    var T = window.transformers;
    if (!T || !T.pipeline) {
      return Promise.reject(new Error('Transformers.js API not available'));
    }

    var useGPU = _hasWebGPU();
    // Byte-aggregate download progress. transformers.js fires progress_callback PER FILE
    // (encoder.onnx, decoder.onnx, tokenizer, config...), each streaming its OWN 0..100. The old
    // code reported whichever file's event fired last, so with two big files downloading at once
    // the bar flip-flopped between their separate percentages (the owner's 90->35->90 sawtooth).
    var agg = _makeProgressAggregator((model.size || 80) * 1024 * 1024);
    return T.pipeline('automatic-speech-recognition', model.id, {
      device: useGPU ? 'webgpu' : 'wasm',
      dtype: useGPU
        ? { encoder_model: 'fp16', decoder_model_merged: 'q4' }
        : { encoder_model: 'q8', decoder_model_merged: 'q8' },
      progress_callback: function(info) {
        if (!info) return;
        var p = agg(info);
        if (onProgress) onProgress({
          stage: 'model',
          progress: p,
          text: (info.status === 'ready' || info.status === 'done')
            ? 'Preparing model...'
            : 'Downloading model: ' + Math.round(p * 100) + '%'
        });
      }
    }).then(function(pipe) {
      if (onProgress) onProgress({ stage: 'model', progress: 1, text: 'Model loaded' });
      _transcriber = pipe;
      _currentModelId = model.id;
      return pipe;
    });
  }

  /* One aggregator per model load. Tracks each file's loaded/total bytes and reports
     sum(loaded) / max(sum(total), expectedBytes). The expected-size floor stops the bar leaping
     to ~90% while only the FIRST file is in flight; the non-decreasing clamp stops a later file
     enlarging the denominator from making the bar jump BACKWARD. Result: one smooth, monotonic bar
     instead of two interleaved per-file bars. Pure + closure-based so it is unit-testable. */
  function _makeProgressAggregator(expectBytes) {
    var dl = {}, lastP = 0;
    return function (info) {
      if (info && info.file) {
        var prev = dl[info.file] || { loaded: 0, total: 0 };
        if (info.status === 'done') {
          dl[info.file] = { loaded: prev.total || prev.loaded, total: prev.total || prev.loaded };
        } else if (info.total != null) {
          dl[info.file] = { loaded: (info.loaded != null ? info.loaded : prev.loaded), total: info.total };
        }
      }
      var totL = 0, totT = 0, f;
      for (f in dl) { if (dl[f].total > 0) { totL += dl[f].loaded; totT += dl[f].total; } }
      var denom = Math.max(totT, expectBytes || 0);
      var p = denom > 0 ? totL / denom : 0;
      if (p < lastP) p = lastP;   // dilution guard: never step backward
      if (p > 0.999) p = 0.999;   // 100% is reserved for the pipeline actually resolving
      lastP = p;
      return p;
    };
  }

  /* Whisper chunks (already offset to TIMELINE seconds) -> repaired, readable cues.
     Replaces the old 1-chunk = 1-cue mapping that put a whole 30s chunk (and any hallucination
     loop inside it) verbatim into one giant Textbox. */
  function _chunksToCues(allChunks) {
    var cues = [];
    for (var i = 0; i < allChunks.length; i++) {
      var ch = allChunks[i];
      var txt = _cleanText(_collapseRepeats(_cleanText(ch.text)));
      if (!txt) continue;
      _segmentChunk(txt, ch.t0, ch.t1, cues);
    }
    return cues;
  }

  /* WORD-timestamp path: words [{w, start, end}] (absolute timeline secs) -> cues with REAL
     cue.words attached, so the karaoke/popin animations highlight the word actually being said
     instead of an even guess. Grouping: new cue on 84-char overflow, a speech gap > 0.8s, a
     sentence end past ~40 chars, or 5s of duration. Repeated-word loops are collapsed on the
     word ARRAY first so text and timings stay consistent. */
  function _wordsToCues(words) {
    var norm = function (t) { return String(t).toLowerCase().replace(/[.,!?;:…"']+$/g, ''); };
    // symbol-garbage gate first (a "word" of pure punctuation is a no-speech artifact),
    // then collapse 3+ identical consecutive words (keep 2)
    var kept = [], run = 1, prev = null;
    for (var i = 0; i < words.length; i++) {
      var cw = _cleanText(words[i].w);
      if (!cw) continue;
      if (prev !== null && norm(cw) === norm(prev) && norm(cw) !== '') run++;
      else run = 1;
      prev = cw;
      if (run <= 2) kept.push({
        w: cw,
        start: words[i].start,
        end: words[i].end,
        speakerId: words[i].speakerId || null,
        speakerConfidence: typeof words[i].speakerConfidence === 'number' ? words[i].speakerConfidence : null,
        confidence: typeof words[i].confidence === 'number' ? words[i].confidence : null,
        sourceProvider: words[i].sourceProvider || null
      });
    }
    var cues = [], cur = [];
    var flush = function () {
      if (!cur.length) return;
      var text = cur.map(function (x) { return x.w; }).join(' ').replace(/\s+/g, ' ').trim();
      if (text) {
        cues.push({
          id: 'auto-' + (cues.length + 1),
          startTime: +cur[0].start.toFixed(3),
          endTime: +Math.max(cur[cur.length - 1].end, cur[0].start + 0.2).toFixed(3),
          text: text,
          words: cur.map(function (x) {
            return {
              w: x.w, start: x.start, end: x.end,
              speakerId: x.speakerId, speakerConfidence: x.speakerConfidence, confidence: x.confidence
            };
          }),
          speakerId: cur[0].speakerId || null,
          speakerConfidence: cur.reduce(function(best, x) {
            return typeof x.speakerConfidence === 'number' && (best === null || x.speakerConfidence > best)
              ? x.speakerConfidence : best;
          }, null),
          sourceProvider: cur[0].sourceProvider || null,
          style: {}
        });
      }
      cur = [];
    };
    for (var j = 0; j < kept.length; j++) {
      var wd = kept[j];
      if (cur.length) {
        var curChars = cur.reduce(function (a, x) { return a + x.w.length + 1; }, 0);
        var last = cur[cur.length - 1];
        var gap = wd.start - last.end;
        var dur = wd.end - cur[0].start;
        var sentenceEnd = /[.!?…]$/.test(last.w);
        var speakerChanged = !!(wd.speakerId && last.speakerId && wd.speakerId !== last.speakerId);
        if (speakerChanged || curChars + wd.w.length > CUE_MAX_CHARS || gap > 0.8 || dur > CUE_MAX_DUR ||
            (sentenceEnd && curChars >= 40)) flush();
      }
      cur.push(wd);
    }
    flush();
    return cues;
  }

  // ─── Main Transcription Entry Point ────────────────────────

  /**
   * Run auto-subtitle generation on the current timeline
   * @param {Object} opts
   * @param {string} opts.model - 'base'|'turbo'|'tiny' (default: 'base')
   * @param {string|null} opts.language - ISO code or null for auto-detect
   * @param {Function} opts.onProgress - ({stage, progress, text}) => void
   * @param {Function} opts.onComplete - (cues[]) => void
   * @param {Function} opts.onError - (Error) => void
   */
  function transcribe(opts) {
    opts = opts || {};
    var modelKey = opts.model || 'turbo';
    var language = opts.language || null;
    var onProgress = opts.onProgress || function() {};
    var onComplete = opts.onComplete || function() {};
    var onError = opts.onError || function() {};

    onProgress({ stage: 'start', progress: 0, text: 'Starting auto-subtitle...' });

    var audioData = null;

    _loadTransformersLib(onProgress)
      .then(function() {
        _throwIfAborted(opts.signal);
        return _extractTimelineAudio(onProgress);
      })
      .then(function(data) {
        _throwIfAborted(opts.signal);
        audioData = data.pcm;
        return _getTranscriber(modelKey, onProgress);
      })
      .then(function(pipe) {
        _throwIfAborted(opts.signal);
        // VAD FIRST: only speech reaches Whisper. Silence/music windows are what made the decoder
        // loop one word ("why why why"); with them gone the loop has no fuel. If the VAD stack
        // fails to load (missing vendor file etc.) fall back to the old whole-buffer path rather
        // than blocking transcription outright.
        onProgress({ stage: 'vad', progress: 0, text: 'Detecting speech segments...' });
        return _vadSegments(audioData, function(p) {
          onProgress({ stage: 'vad', progress: p, text: 'Detecting speech segments... ' + Math.round(p * 100) + '%' });
        }).catch(function(err) {
          console.warn('[VEAutoSubtitle] VAD unavailable, transcribing the whole buffer:', err);
          return null;
        }).then(function(spans) {
          if (spans && spans.length === 0) {
            throw new Error('No speech detected in video. Check the audio level and that the correct clip has sound.');
          }
          if (!spans) spans = [{ start: 0, end: audioData.length / 16000 }];

          var allChunks = [], allWords = [];
          var chain = Promise.resolve();
          spans.forEach(function(sp, si) {
            chain = chain.then(function() {
              _throwIfAborted(opts.signal);
              onProgress({
                stage: 'transcribe',
                progress: spans.length ? si / spans.length : 0,
                text: 'Transcribing speech ' + (si + 1) + '/' + spans.length + '...'
              });
              // copy, not subarray: the pipeline may hold/transfer the buffer
              var seg = new Float32Array(audioData.subarray(
                Math.max(0, Math.floor(sp.start * 16000)),
                Math.min(audioData.length, Math.ceil(sp.end * 16000))
              ));
              return _runPipe(pipe, seg, language).then(function(rw) {
                var res = rw.res;
                if (rw.wordMode) {
                  var wch = res.chunks;
                  for (var wi = 0; wi < wch.length; wi++) {
                    var wts = wch[wi].timestamp || [null, null];
                    var wt0 = (wts[0] != null ? wts[0] : 0) + sp.start;
                    var wt1 = (wts[1] != null ? wts[1] : (wts[0] || 0) + 0.3) + sp.start;
                    var wtx = String(wch[wi].text || '').trim();
                    if (wtx) allWords.push({ w: wtx, start: wt0, end: Math.min(Math.max(wt1, wt0 + 0.05), sp.end) });
                  }
                  return;
                }
                var chunks = (res && res.chunks && res.chunks.length) ? res.chunks
                  : (res && res.text ? [{ timestamp: [0, sp.end - sp.start], text: res.text }] : []);
                for (var ci = 0; ci < chunks.length; ci++) {
                  var ts = chunks[ci].timestamp || [0, null];
                  var t0 = (ts[0] != null ? ts[0] : 0) + sp.start;
                  var t1 = (ts[1] != null ? ts[1] : (sp.end - sp.start)) + sp.start;
                  allChunks.push({ t0: t0, t1: Math.min(Math.max(t1, t0 + 0.2), sp.end), text: chunks[ci].text || '' });
                }
              });
            });
          });
          return chain.then(function() { return { chunks: allChunks, words: allWords }; });
        });
      })
      .then(function(collected) {
        _throwIfAborted(opts.signal);
        // word path when available (real karaoke timings), segment path otherwise; a mixed run
        // (capability discovered mid-way) merges both, sorted by time.
        var cues = _wordsToCues(collected.words).concat(_chunksToCues(collected.chunks));
        cues.sort(function(a, b) { return a.startTime - b.startTime; });
        for (var ri = 0; ri < cues.length; ri++) cues[ri].id = 'auto-' + (ri + 1);
        if (!cues.length) {
          // Everything the decoder produced was no-speech garbage (music, waves, ambience):
          // an honest "no speech" beats an empty success.
          throw new Error('No speech found: video may not contain speech (music/ambient sound is not considered speech).');
        }
        onProgress({ stage: 'done', progress: 1, text: 'Done! ' + cues.length + ' subtitle cues generated.' });
        onComplete(cues);
      })
      .catch(function(err) {
        console.error('[VEAutoSubtitle] Error:', err);
        onError(err);
      });
  }
  var SPEAKER_TRACK_COLORS = ['#57c7ff', '#67d7a3', '#f0ad4e', '#b89cff', '#ff7f7f', '#58d6d6', '#d7c45b', '#ed91c2', '#8fb5ff'];

  function _languageLabel(code) {
    if (!code) return 'Detected Language';
    for (var i = 0; i < LANGUAGES.length; i++) if (LANGUAGES[i].code === code) return LANGUAGES[i].label;
    return String(code).toUpperCase();
  }

  function _isAutoCue(cue) {
    return !!(cue && typeof cue.id === 'string' && cue.id.indexOf('auto-') === 0);
  }

  function _speakerOrdinal(speakerId, fallback) {
    var match = String(speakerId || '').match(/(\d+)/);
    return match ? Math.max(1, parseInt(match[1], 10)) : fallback;
  }

  function _addSpeakerCuesToTimeline(cues, opts, proj) {
    var provider = opts.sourceProvider || cues[0].sourceProvider || 'unknown';
    var language = opts.language || cues[0].lang || null;
    var setId = null;
    var setTracks = [];
    for (var i = 0; i < proj.tracks.length; i++) {
      var existing = proj.tracks[i];
      if (existing && existing.subtitleSetId && existing.autoSubtitleGenerated
          && existing.sourceProvider === provider && (existing.lang || null) === language) {
        if (!setId) setId = existing.subtitleSetId;
        if (existing.subtitleSetId === setId) setTracks.push(existing);
      }
    }
    if (!setId) setId = 'subtitle-set-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

    var grouped = {};
    var lastSpeakerId = null;
    var sortedCues = cues.slice().sort(function(a, b) { return a.startTime - b.startTime; });
    for (var ci = 0; ci < sortedCues.length; ci++) {
      var cue = sortedCues[ci];
      var speakerId = cue.speakerId || lastSpeakerId || 'speaker-unknown';
      if (cue.speakerId) lastSpeakerId = cue.speakerId;
      if (!grouped[speakerId]) grouped[speakerId] = [];
      grouped[speakerId].push(cue);
    }
    var speakerIds = Object.keys(grouped).sort(function(a, b) {
      if (a === 'speaker-unknown') return 1;
      if (b === 'speaker-unknown') return -1;
      return _speakerOrdinal(a, 999) - _speakerOrdinal(b, 999);
    });

    for (var st = 0; st < setTracks.length; st++) {
      setTracks[st].cues = (setTracks[st].cues || []).filter(function(c) { return !_isAutoCue(c); });
    }

    var primaryTrackId = null;
    for (var si = 0; si < speakerIds.length; si++) {
      var id = speakerIds[si];
      var ordinal = _speakerOrdinal(id, si + 1);
      var track = null;
      for (var ti = 0; ti < setTracks.length; ti++) if (setTracks[ti].speakerId === id) { track = setTracks[ti]; break; }
      if (!track && window.VESubtitleElement && VESubtitleElement.ensureCaptionsTrack) {
        track = VESubtitleElement.ensureCaptionsTrack({
          forceNew: true,
          label: id === 'speaker-unknown' ? 'Speaker Unknown' : 'Speaker ' + ordinal,
          lang: language
        });
        if (track) setTracks.push(track);
      }
      if (!track) continue;
      track.subtitleSetId = setId;
      track.speakerId = id;
      track.speakerOrdinal = ordinal;
      track.sourceProvider = provider;
      track.speechProvider = provider;
      track.autoSubtitleGenerated = true;
      track.label = id === 'speaker-unknown' ? 'Speaker Unknown' : 'Speaker ' + ordinal;
      if (!track._color) track._color = SPEAKER_TRACK_COLORS[si % SPEAKER_TRACK_COLORS.length];
      if (!track.cues) track.cues = [];
      for (var gi = 0; gi < grouped[id].length; gi++) {
        var sourceCue = grouped[id][gi];
        var copy = Object.assign({}, sourceCue);
        copy.id = 'auto-' + setId + '-' + id + '-' + (gi + 1);
        copy.sourceCueId = sourceCue.sourceCueId || sourceCue.id;
        copy.speakerId = id;
        copy.sourceProvider = provider;
        track.cues.push(copy);
      }
      track.cues.sort(function(a, b) { return a.startTime - b.startTime; });
      if (!primaryTrackId) primaryTrackId = track.id;
    }

    for (var ri = proj.tracks.length - 1; ri >= 0; ri--) {
      var stale = proj.tracks[ri];
      if (stale && stale.subtitleSetId === setId && stale.autoSubtitleGenerated && (!stale.cues || !stale.cues.length)) {
        proj.tracks.splice(ri, 1);
      }
    }
    return primaryTrackId;
  }

  /**
   * Add cues to timeline. Diarized results become one normal track per speaker;
   * speakers without diarization keep the established single-track behavior.
   */
  function addCuesToTimeline(cues, opts) {
    if (!cues || !cues.length) return null;
    opts = opts || {};
    var proj = _proj();
    if (!proj) return null;

    var hasSpeakers = cues.some(function(cue) { return !!(cue && cue.speakerId); });
    if (hasSpeakers) {
      var speakerTrackId = _addSpeakerCuesToTimeline(cues, opts, proj);
      _refreshTimeline();
      return speakerTrackId;
    }

    // Find or create a captions track with the full subtitle-element schema.
    // Uses the dedicated helper (not VideoEditor.addTrack) so no file dialog pops.
    var subTrack = null;
    if (window.VESubtitleElement && VESubtitleElement.ensureCaptionsTrack) {
      for (var existingIndex = 0; existingIndex < proj.tracks.length; existingIndex++) {
        var candidate = proj.tracks[existingIndex];
        if (!candidate.subtitleSetId && ((candidate.cues && candidate.cues.length) || candidate.type === 'subtitle')) {
          subTrack = candidate;
          break;
        }
      }
      if (!subTrack) subTrack = VESubtitleElement.ensureCaptionsTrack({ forceNew: true, label: _languageLabel(opts.language) + ' Subtitles', lang: opts.language || null });
    } else {
      for (var i = 0; i < proj.tracks.length; i++) {
        var pt = proj.tracks[i];
        if ((pt.cues && pt.cues.length) || pt.type === 'subtitle') { subTrack = pt; break; }
      }
    }

    if (!subTrack) return null;

    if (!subTrack.cues) subTrack.cues = [];
    /* REPLACE, don't append: regeneration used to stack the new transcript on top of the old one,
       so the panel showed the previous run's garbage cues above the fresh ones (owner screenshot:
       two stale rows + one new). Auto-generated cues (id 'auto-*') are replaced wholesale, exactly
       like CapCut's regenerate; hand-made cues (panel add/split, 'cue-*' ids) are kept. */
    var removed = 0;
    subTrack.cues = subTrack.cues.filter(function (c) {
      var isAuto = _isAutoCue(c);
      if (isAuto) removed++;
      return !isAuto;
    });
    for (var k = 0; k < cues.length; k++) {
      var singleCopy = Object.assign({}, cues[k]);
      singleCopy.sourceCueId = cues[k].sourceCueId || cues[k].id;
      singleCopy.id = 'auto-single-' + subTrack.id + '-' + (k + 1);
      subTrack.cues.push(singleCopy);
    }
    subTrack.sourceProvider = opts.sourceProvider || cues[0].sourceProvider || subTrack.sourceProvider || null;
    subTrack.autoSubtitleGenerated = true;
    subTrack.cues.sort(function (a, b) { return a.startTime - b.startTime; });

    _refreshTimeline();
    console.log('[VEAutoSubtitle] Added', cues.length, 'cues (replaced', removed, 'previous auto cues)');
    return subTrack.id;
  }

  // ─── Export to SRT/VTT ─────────────────────────────────────

  function exportSRT(cues) {
    var lines = [];
    for (var i = 0; i < cues.length; i++) {
      var c = cues[i];
      lines.push(String(i + 1));
      lines.push(_formatSRTTime(c.startTime) + ' --> ' + _formatSRTTime(c.endTime));
      lines.push(c.text);
      lines.push('');
    }
    return lines.join('\n');
  }

  function _formatSRTTime(sec) {
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = Math.floor(sec % 60);
    var ms = Math.round((sec % 1) * 1000);
    return _pad2(h) + ':' + _pad2(m) + ':' + _pad2(s) + ',' + _pad3(ms);
  }

  function _pad2(n) { return n < 10 ? '0' + n : String(n); }
  function _pad3(n) { return n < 10 ? '00' + n : n < 100 ? '0' + n : String(n); }

  // ─── UI Modal ──────────────────────────────────────────────

  function showModal() {
    var existing = document.getElementById('ve-auto-subtitle-modal');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 've-auto-subtitle-modal';
    overlay.className = 've-auto-subtitle-overlay';

    var modal = document.createElement('div');
    modal.className = 've-auto-subtitle-dialog';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 've-auto-subtitle-title');

    var eyebrow = document.createElement('div');
    eyebrow.className = 've-auto-subtitle-eyebrow';
    eyebrow.textContent = 'TRANSCRIPT TO TIMELINE';
    modal.appendChild(eyebrow);
    var header = document.createElement('h3');
    header.id = 've-auto-subtitle-title';
    header.textContent = 'Auto Subtitles';
    modal.appendChild(header);

    var _gpu = _hasWebGPU();
    var running = false;
    var controller = null;

    /* COMMUNITY EDITION: no Method and no Cloud provider control. There is one engine, so a picker
       with one option is a control that cannot be used. Speaker diarization went with the cloud
       engines: Whisper returns words, not speakers, and a "Preserve speakers" switch over an engine
       that cannot answer it is a promise the output never keeps. */
    var languageField = document.createElement('div');
    languageField.className = 've-auto-subtitle-field';
    languageField.appendChild(_createLabel('Language'));
    var langSel = document.createElement('select');
    langSel.style.cssText = _selectStyle();
    for (var li = 0; li < LANGUAGES.length; li++) {
      var lo = document.createElement('option');
      lo.value = LANGUAGES[li].code || 'auto';
      lo.textContent = LANGUAGES[li].label;
      langSel.appendChild(lo);
    }
    languageField.appendChild(langSel);
    modal.appendChild(languageField);

    var info = document.createElement('p');
    info.className = 've-auto-subtitle-info';
    modal.appendChild(info);

    var progressArea = document.createElement('div');
    progressArea.className = 've-auto-subtitle-progress';
    var progressText = document.createElement('div');
    progressText.className = 've-auto-subtitle-progress-text';
    progressText.setAttribute('aria-live', 'polite');
    progressArea.appendChild(progressText);
    var progressBarBg = document.createElement('div');
    progressBarBg.className = 've-auto-subtitle-progress-track';
    var progressBarFill = document.createElement('div');
    progressBarFill.className = 've-auto-subtitle-progress-fill';
    progressBarBg.appendChild(progressBarFill);
    progressArea.appendChild(progressBarBg);
    modal.appendChild(progressArea);

    var btnRow = document.createElement('div');
    btnRow.className = 've-auto-subtitle-actions';

    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = _btnStyle(false);

    var startBtn = document.createElement('button');
    startBtn.textContent = 'Generate Subtitles';
    startBtn.style.cssText = _btnStyle(true);
    startBtn.disabled = true;

    function syncControls() {
      /* Opened as a file, the model and its runtime cannot be READ (a browser refuses fetch on
         file://). Say that, rather than starting and dying on "Failed to fetch". */
      if (window.CCEdition && CCEdition.localFetchBlocked && CCEdition.localFetchBlocked()) {
        info.textContent = 'Subtitles need to read the speech model from disk. ' + CCEdition.fetchNote;
        startBtn.disabled = true;
        return;
      }
      if (!_gpu) {
        info.textContent = 'Local subtitles need WebGPU, which this browser does not have. Chrome or Edge 121+ on a machine with a supported GPU can run it.';
        startBtn.disabled = true;
        return;
      }
      startBtn.disabled = running;
      info.textContent = 'Whisper Turbo runs on this device. The audio never leaves this machine. The first run downloads about 200 MB of model.';
    }

    function closeModal() {
      if (controller) controller.abort();
      overlay.remove();
    }
    cancelBtn.onclick = closeModal;

    startBtn.onclick = function() {
      var selModel = 'turbo';
      var selLang = langSel.value === 'auto' ? null : langSel.value;
      controller = new AbortController();
      running = true;
      startBtn.disabled = true;
      startBtn.style.opacity = '0.5';
      langSel.disabled = true;
      progressArea.style.display = 'block';

      transcribe({
        model: selModel,
        language: selLang,
        signal: controller.signal,
        onProgress: function(info) {
          var p = Math.max(0, Math.min(1, Number(info.progress) || 0));
          var percent = Math.round(p * 100);
          progressText.textContent = (info.text || 'Working...') + ' · ' + percent + '%';
          progressText.style.color = 'var(--text-dim,#aaa)';
          progressBarFill.style.width = percent + '%';
          progressBarBg.setAttribute('role', 'progressbar');
          progressBarBg.setAttribute('aria-valuemin', '0');
          progressBarBg.setAttribute('aria-valuemax', '100');
          progressBarBg.setAttribute('aria-valuenow', String(percent));
          progressBarFill.style.background = 'var(--gold,#f2ff58)';
        },
        /* No onChunk here: progressive cues were a Deepgram feature (it streams words back as it
           goes). Whisper answers per speech segment through onProgress and lands once. */
        onComplete: function(cues) {
          running = false;
          var addedTrackId = addCuesToTimeline(cues, {
            sourceProvider: 'local',
            language: selLang
          });
          progressText.textContent = 'Done! ' + cues.length + ' subtitles added to timeline · 100%';
          progressBarFill.style.width = '100%';
          // Subtitles are auto-added to the timeline (no download prompt here);
          // download lives in the left subtitle panel's bottom button group.
          startBtn.textContent = 'Close';
          startBtn.disabled = false;
          startBtn.style.opacity = '1';
          startBtn.onclick = function() {
            closeModal();
            // Auto-switch to the docked subtitle panel now that cues exist.
            if (typeof _sdShowSubtitlePanel === 'function') _sdShowSubtitlePanel(addedTrackId);
          };
          // Also reveal it immediately so the user sees the result.
          if (typeof _sdShowSubtitlePanel === 'function') _sdShowSubtitlePanel(addedTrackId);
        },
        onError: function(err) {
          running = false;
          if (err && err.name === 'AbortError') return;
          progressText.textContent = 'Error: ' + err.message;
          progressText.style.color = '#ff6b6b';
          progressBarFill.style.background = '#ff6b6b';
          startBtn.disabled = false;
          startBtn.style.opacity = '1';
          startBtn.textContent = 'Retry';
          langSel.disabled = false;
          syncControls();
        }
      });
    };

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(startBtn);
    modal.appendChild(btnRow);

    overlay.onclick = function(e) { if (e.target === overlay) closeModal(); };
    overlay.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeModal(); });
    overlay.tabIndex = -1;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    overlay.focus();

    syncControls();
  }

  // ─── UI Helpers ────────────────────────────────────────────

  function _createLabel(text) {
    var lbl = document.createElement('label');
    lbl.textContent = text;
    lbl.style.cssText = 'display:block;font-size:12px;font-weight:600;margin:12px 0 4px 0;color:var(--text-dim,#aaa);text-transform:uppercase;letter-spacing:0.5px;';
    return lbl;
  }

  function _selectStyle() {
    return 'width:100%;padding:8px 10px;border:1px solid var(--border,#27272d);border-radius:6px;background:var(--surface,#131316);color:var(--text,#ededf0);font-size:14px;outline:none;cursor:pointer;';
  }

  function _btnStyle(primary) {
    if (primary) {
      return 'padding:8px 20px;border:none;border-radius:6px;background:var(--gold,#f2ff58);color:#0b0b0d;font-weight:600;font-size:14px;cursor:pointer;';
    }
    return 'padding:8px 16px;border:1px solid var(--border,#27272d);border-radius:6px;background:var(--surface3,#232328);color:var(--text,#ededf0);font-size:14px;cursor:pointer;';
  }

  // ─── Model Cache (Cache Storage API) ───────────────────────
  // Transformers.js stores downloaded model weights in the Cache Storage API.
  // These helpers let the editor's "clear all cache" report + free that space.

  function _modelCacheNames() {
    if (typeof caches === 'undefined' || !caches.keys) return Promise.resolve([]);
    return caches.keys().then(function(names) {
      // 'cutout' = canvas/cutout's IS-Net weights: same idea, same sweep, so the
      // reported size stays honest and "clear all cache" actually frees them.
      return names.filter(function(n) { return /transformers|cutout|upscale/i.test(n); });
    }).catch(function() { return []; });
  }

  function getCacheBytes() {
    return _modelCacheNames().then(function(names) {
      var total = 0;
      var chain = Promise.resolve();
      names.forEach(function(name) {
        chain = chain.then(function() {
          return caches.open(name).then(function(cache) {
            return cache.keys().then(function(reqs) {
              var inner = Promise.resolve();
              reqs.forEach(function(req) {
                inner = inner.then(function() {
                  return cache.match(req).then(function(resp) {
                    if (!resp) return;
                    var len = resp.headers.get('content-length');
                    if (len) { total += parseInt(len, 10) || 0; return; }
                    return resp.clone().blob().then(function(b) { total += b.size; });
                  });
                });
              });
              return inner;
            });
          });
        });
      });
      return chain.then(function() { return total; });
    }).catch(function() { return 0; });
  }

  function clearModelCache() {
    return getCacheBytes().then(function(bytes) {
      return _modelCacheNames().then(function(names) {
        var chain = Promise.resolve();
        names.forEach(function(name) {
          chain = chain.then(function() { return caches.delete(name); });
        });
        return chain.then(function() {
          _transcriber = null;
          _currentModelId = null;
          try { localStorage.removeItem('cc_sub_model_ready'); } catch (e) {}
          return bytes;
        });
      });
    }).catch(function() { return 0; });
  }

  // ─── Public API ────────────────────────────────────────────

  window.VEAutoSubtitle = {
    showModal: showModal,
    transcribe: transcribe,
    addCuesToTimeline: addCuesToTimeline,
    exportSRT: exportSRT,
    getCacheBytes: getCacheBytes,
    clearModelCache: clearModelCache,
    MODELS: MODELS,
    LANGUAGES: LANGUAGES,
    // internals exposed for the test harness (not product API)
    _vadSegments: _vadSegments,
    _collapseRepeats: _collapseRepeats,
    _segmentChunk: _segmentChunk,
    _chunksToCues: _chunksToCues,
    _wordsToCues: _wordsToCues,
    _cleanText: _cleanText,
    _makeProgressAggregator: _makeProgressAggregator
  };

})();

// Modular skeleton hook (Faz 8) - ve-auto-subtitle is now a video loader module (modules/video/). Define-only at load.
if (window.cc && cc.modules) cc.modules.register({ id: 've-auto-subtitle', parent: 'video', title: 've-auto-subtitle', mount: function () {}, unmount: function () {} });
