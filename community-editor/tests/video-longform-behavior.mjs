import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

function classList() {
  const values = new Set();
  return {
    add(value) { values.add(value); },
    remove(value) { values.delete(value); },
    contains(value) { return values.has(value); },
    toggle(value, force) {
      const enabled = force == null ? !values.has(value) : !!force;
      if (enabled) values.add(value); else values.delete(value);
      return enabled;
    }
  };
}

function element(value = '') {
  const attrs = {};
  const style = { setProperty(name, next) { this[name] = String(next); } };
  return {
    value,
    checked: false,
    disabled: false,
    hidden: false,
    style,
    children: [],
    classList: classList(),
    textContent: '',
    innerHTML: '',
    title: '',
    setAttribute(name, next) { attrs[name] = String(next); },
    getAttribute(name) { return attrs[name] ?? null; },
    appendChild(child) { this.children.push(child); return child; },
    addEventListener() {},
    removeEventListener() {}
  };
}

function makePanel() {
  const nodes = new Map();
  const values = {
    '#ve-dub-lang': 'en',
    '#ve-dub-fit': 'fit',
    '#ve-dub-source-mix': 'keep',
    '#ve-dub-lead': '2',
    '#ve-dub-srclang': 'en',
    '#ve-dub-tr-provider': 'deepseek',
    '#ve-dub-tr-model': 'deepseek-chat',
    '#ve-dub-tts-provider': 'deepgram'
  };
  Object.entries(values).forEach(([selector, value]) => nodes.set(selector, element(value)));
  const voice = element('aura-2-thalia-en');
  voice.setAttribute('data-speaker', 'speaker-1');
  return {
    style: {},
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, element());
      return nodes.get(selector);
    },
    querySelectorAll(selector) {
      return selector === '#ve-dub-voice-map [data-speaker]' ? [voice] : [];
    }
  };
}

function pcmWav(seconds = 1, sampleRate = 8000) {
  const frames = Math.max(1, Math.floor(seconds * sampleRate));
  const buffer = new ArrayBuffer(44 + frames * 2);
  const view = new DataView(buffer);
  const text = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, 36 + frames * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, frames * 2, true);
  for (let i = 0; i < frames; i++) view.setInt16(44 + i * 2, Math.round(Math.sin(i / 9) * 12000), true);
  return new Blob([buffer], { type: 'audio/wav' });
}

class TestFile extends Blob {
  constructor(parts, name, options = {}) { super(parts, options); this.name = name; }
}

function speakerTracks() {
  return [{
    id: 'sub-1',
    type: 'subtitle',
    label: 'Speaker 1',
    subtitleSetId: 'set-1',
    speakerId: 'speaker-1',
    speakerOrdinal: 1,
    _color: '#4dc4ff',
    cues: [
      { id: 'cue-1', speakerId: 'speaker-1', startTime: 0, endTime: 1, text: 'First line' },
      { id: 'cue-2', speakerId: 'speaker-1', startTime: 1.2, endTime: 2.2, text: 'Second line' }
    ]
  }];
}

function createDubbingHarness(tracks, failSynthesisAt = 0) {
  const panel = makePanel();
  let uid = 0;
  let synthCalls = 0;
  let checkpoints = 0;
  const VE = {
    _veProject: { tracks, duration: 3, playheadTime: 0, zoom: 1 },
    _vePlayback: { videoPool: {} },
    _veUi: {},
    _veSelectedClips: [],
    _veUid(prefix) { uid += 1; return `${prefix}-${uid}`; },
    _veImportFile(file, track, startTime, _hintDuration, options) {
      const clip = {
        id: this._veUid('dub'),
        type: 'audio',
        src: `blob:test-${uid}`,
        fileName: file.name,
        startTime,
        duration: options.duration,
        speed: options.speed || 1,
        dubbing: JSON.parse(JSON.stringify(options.dubbing)),
        _file: file
      };
      track.clips.push(clip);
      this._vePlayback.videoPool[clip.id] = { src: clip.src, paused: true, pause() {}, removeAttribute() {} };
      if (options.onClip) options.onClip(clip, track);
      if (options.onReady) options.onReady(clip, track);
      return true;
    },
    _veRecalcDuration() {},
    _veRender() {},
    _vePushUndo() {},
    _veStaticWaveformUrl(peaks) { return `data:waveform,${peaks.length}`; }
  };
  class FakeAudioContext {
    decodeAudioData() { return Promise.resolve({ duration: 1 }); }
    close() {}
  }
  const context = {
    console,
    Blob,
    File: TestFile,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    DataView,
    Math,
    Date,
    saveCurrentPage() { checkpoints += 1; },
    showToast() {},
    cc: { emit() {} },
    fetch(url) {
      if (!String(url).includes('/api/ai/speech/synthesize')) throw new Error(`Unexpected fetch: ${url}`);
      synthCalls += 1;
      if (failSynthesisAt && synthCalls === failSynthesisAt) {
        return Promise.resolve({
          ok: false,
          status: 400,
          headers: { get() { return null; } },
          json() { return Promise.resolve({ error: { message: 'forced failure', code: 'FORCED' } }); }
        });
      }
      return Promise.resolve({ ok: true, status: 200, blob() { return Promise.resolve(pcmWav()); } });
    }
  };
  context.window = context;
  context.window.AudioContext = FakeAudioContext;
  context.window.__ccVideoEditor = VE;
  context.confirm = () => true;

  const originalExport = 'window.VEDubbing = { showModal: show, show: show, showTts: showTts, showDublaj: showDublaj, hide: hide, toggle: toggle };';
  const testExport = `window.VEDubbing = {
    showModal: show, show: show, showTts: showTts, showDublaj: showDublaj, hide: hide, toggle: toggle,
    __testConfigure: function (panel, track, ids) { _p = panel; _mode = 'dublaj'; _dubEngine = 'speaker'; _speakerTrack = track; _speakerIds = ids.slice(); },
    __testRunSpeakerDubbing: onSpeakerDubbing,
    __testMergeSpeakerLabels: mergeSpeakerLabels
  };`;
  const source = read('modules/video/ve-dubbing/ve-dubbing.js').replace(originalExport, testExport);
  assert.notEqual(source, read('modules/video/ve-dubbing/ve-dubbing.js'), 'test export hook must be installed');
  vm.runInNewContext(source, context, { filename: 've-dubbing.js' });
  context.VEDubbing.__testConfigure(panel, tracks[0], ['speaker-1']);
  return {
    context,
    panel,
    VE,
    get synthCalls() { return synthCalls; },
    get checkpoints() { return checkpoints; }
  };
}

async function waitForJob(track, status, timeoutMs = 4000) {
  const started = Date.now();
  while ((!track.cueDubJob || track.cueDubJob.status !== status) && Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(track.cueDubJob && track.cueDubJob.status, status);
}

async function verifyDubbingResume() {
  const first = createDubbingHarness(speakerTracks(), 2);
  first.context.VEDubbing.__testRunSpeakerDubbing();
  await waitForJob(first.VE._veProject.tracks[0], 'failed');
  const firstDubClips = first.VE._veProject.tracks.filter((track) => track.role === 'dublaj').flatMap((track) => track.clips);
  assert.equal(first.synthCalls, 2);
  assert.equal(firstDubClips.length, 1);
  assert.equal(first.VE._veProject.tracks[0].cueDubJob.completedCount, 1);
  assert.ok(firstDubClips[0].dubbing.waveformPeaks.length >= 48, 'fixed waveform peaks must be cached');

  const restoredTracks = JSON.parse(JSON.stringify(first.VE._veProject.tracks, (key, value) => key === '_file' ? undefined : value));
  const resumed = createDubbingHarness(restoredTracks, 0);
  resumed.context.VEDubbing.__testRunSpeakerDubbing();
  await waitForJob(resumed.VE._veProject.tracks[0], 'completed');
  const finalClips = resumed.VE._veProject.tracks.filter((track) => track.role === 'dublaj').flatMap((track) => track.clips);
  assert.equal(resumed.synthCalls, 1, 'reload resume must synthesize only missing cue');
  assert.equal(finalClips.length, 2, 'reload resume must not duplicate cached cue');
  assert.equal(new Set(finalClips.map((clip) => clip.dubbing.sourceCueId)).size, 2);
  assert.equal(resumed.VE._veProject.tracks[0].cueDubJob.completedCount, 2);
  assert.ok(resumed.checkpoints >= 3, 'resume must write durable checkpoints');
}

function verifyUndoableSpeakerMerge() {
  const tracks = speakerTracks();
  tracks.push({
    id: 'sub-2', type: 'subtitle', label: 'Speaker 2', subtitleSetId: 'set-1', speakerId: 'speaker-2',
    speakerOrdinal: 2, _color: '#62d6a5', cues: [{ id: 'cue-3', speakerId: 'speaker-2', startTime: 3, endTime: 4, text: 'Guest' }]
  });
  const harness = createDubbingHarness(tracks, 0);
  let began = 0;
  let ended = 0;
  harness.VE._veBeginUndoGroup = (label) => { assert.equal(label, 'Merge speakers'); began += 1; };
  harness.VE._veEndUndoGroup = () => { ended += 1; };
  harness.context.VEDubbing.__testConfigure(harness.panel, tracks[0], ['speaker-1', 'speaker-2']);
  harness.context.VEDubbing.__testMergeSpeakerLabels('speaker-2', 'speaker-1');
  assert.equal(began, 1);
  assert.equal(ended, 1);
  assert.equal(tracks[0].cues.length, 3);
  assert.equal(tracks[0].cues.at(-1).speakerId, 'speaker-1');
  assert.equal(harness.VE._veProject.tracks.some((track) => track.id === 'sub-2'), false);
}

async function verifyFilmstripSerialization() {
  let active = 0;
  let maxActive = 0;
  let calls = 0;
  let waveformExtracts = 0;
  const VE = {
    _vePlayback: { videoPool: {} },
    _veUi: {},
    _veFilmstripSources: {},
    _veFilmstripQueues: {},
    _veExporting: false,
    _veSelectedClips: [],
    _veProject: { zoom: 10 },
    _veIcon() { return ''; },
    _esc(value) { return String(value); },
    _veGetClipFilterCSS() { return ''; }
  };
  const source = {
    async frameAt() {
      calls += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 8));
      active -= 1;
      return { videoWidth: 160, videoHeight: 90 };
    }
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext() { return { drawImage() {}, clearRect() {}, fillRect() {}, set fillStyle(_value) {}, set globalAlpha(_value) {} }; },
    toDataURL() { return 'data:image/jpeg;base64,test'; }
  };
  const frameSource = { isAvailable() { return true; }, create() { return Promise.resolve(source); } };
  const mediaPipeline = {
    waveformCache: { get() { return Promise.resolve(null); } },
    extractWaveform() {
      waveformExtracts += 1;
      return Promise.resolve({
        peaks: [[-0.1, 0.2, -0.7, 0.8, -0.3, 0.5, -0.9, 0.6]],
        waveformUrl: 'data:image/png;base64,pipeline'
      });
    }
  };
  const context = {
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame(callback) { callback(); return 1; },
    document: { createElement(tag) { return tag === 'canvas' ? canvas : element(); }, getElementById() { return null; } },
    VEFrameSource: frameSource,
    VEMediaPipeline: mediaPipeline
  };
  context.window = context;
  context.window.__ccVideoEditor = VE;
  context.window.VEFrameSource = frameSource;
  vm.runInNewContext(read('modules/video/video-editor/render/render.js'), context, { filename: 'render.js' });
  const clip = { id: 'video-1' };
  VE._veRequestFilmstripTile(clip, 1, '1@1', { isConnected: true, src: '' });
  VE._veRequestFilmstripTile(clip, 2, '2@1', { isConnected: true, src: '' });
  VE._veRequestFilmstripTile(clip, 3, '3@1', { isConnected: true, src: '' });
  const started = Date.now();
  while (Object.keys(clip._filmstripCache || {}).length < 3 && Date.now() - started < 2000) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(calls, 3);
  assert.equal(maxActive, 1, 'one decoder source must never seek concurrently');
  assert.equal(Object.keys(clip._filmstripCache).length, 3);
  clip._filmstripRequestToken = 'old-view';
  VE._veRequestFilmstripTile(clip, 4, '4@1', { isConnected: true, src: '' }, 'old-view');
  VE._veRequestFilmstripTile(clip, 5, '5@1', { isConnected: true, src: '' }, 'old-view');
  clip._filmstripRequestToken = 'new-view';
  VE._veRequestFilmstripTile(clip, 6, '6@1', { isConnected: true, src: '' }, 'new-view');
  const switched = Date.now();
  while ((clip._filmstripPending['6@1'] || !clip._filmstripCache['6@1']) && Date.now() - switched < 2000) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(calls, 4, 'queued requests from an obsolete viewport must be cancelled');
  assert.equal(clip._filmstripCache['4@1'], undefined);
  assert.equal(clip._filmstripCache['5@1'], undefined);
  VE._veExporting = true;
  VE._veRequestFilmstripTile(clip, 7, '7@1', { isConnected: true, src: '' }, 'new-view');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(calls, 4, 'filmstrip work must pause during export');

  VE._veExporting = false;
  const dubbingClip = VE._veRenderClip({
    id: 'dub-1', type: 'audio', startTime: 0, duration: 2, name: 'Dub Speaker 1',
    dubbing: { mode: 'cue', waveformPeaks: [0.1, 0.5, 0.9, 0.3] }
  }, { role: 'dublaj', _color: '#4dc4ff' });
  assert.match(dubbingClip.className, /ve-clip--dubbing/);
  assert.equal(dubbingClip.style['--ve-dub-speaker-color'], '#4dc4ff');
  assert.equal(dubbingClip.children.some((child) => child.className === 've-clip-waveform ve-clip-waveform--dubbing'), true);

  const normalAudioClip = VE._veRenderClip({ id: 'audio-1', type: 'audio', startTime: 0, duration: 2, name: 'Source Audio' }, { role: 'dublaj' });
  assert.doesNotMatch(normalAudioClip.className, /ve-clip--dubbing/);
  assert.equal(normalAudioClip.children.some((child) => String(child.className).includes('ve-clip-waveform--dubbing')), false);

  const restoredDub = {
    id: 'dub-restored', type: 'audio', startTime: 0, duration: 2, name: 'Restored Dub',
    dubbing: { mode: 'cue', sourceCueId: 'cue-restored' }
  };
  VE._vePlayback.videoPool[restoredDub.id] = { src: 'blob:restored-dub' };
  VE._veRenderClip(restoredDub, { role: 'dublaj', _color: '#b698ff' });
  const waveformStarted = Date.now();
  while (!restoredDub._waveformUrl && Date.now() - waveformStarted < 1000) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(waveformExtracts, 1, 'restored dubbing clip must lazily rebuild missing waveform');
  assert.ok(restoredDub.dubbing.waveformPeaks.length >= 48, 'rebuilt compact peaks must persist with dubbing metadata');
  assert.ok(restoredDub._waveformUrl, 'rebuilt waveform must render without regenerating speech');
  clearTimeout(VE._veDubbingWaveformCheckpointTimer);
}

function verifyTimelineWorkspace() {
  const wrap = { clientWidth: 1000, scrollLeft: 1000, scrollTop: 0, getBoundingClientRect() { return { left: 0 }; } };
  const follow = element();
  const nodes = { 've-scroll-wrap': wrap, 've-follow-playhead': follow };
  const VE = {
    PX_PER_SEC_MIN: 0.2,
    PX_PER_SEC_DEFAULT: 60,
    PX_PER_SEC_MAX: 500,
    DEFAULT_PANEL_HEIGHT: 300,
    _veProject: { zoom: 1, duration: 3600, playheadTime: 1000, tracks: [] },
    _veUi: { zoomSlider: element(), host: { style: {}, parentElement: null }, panelHeight: 340 },
    _veViewportMode: 'follow',
    _veRender() {}
  };
  const context = {
    console,
    window: null,
    document: {
      getElementById(id) { return nodes[id] || null; },
      createElement() { return element(); },
      addEventListener() {},
      removeEventListener() {}
    },
    requestAnimationFrame(callback) { callback(); return 1; },
    setTimeout,
    clearTimeout
  };
  context.window = context;
  context.window.__ccVideoEditor = VE;
  vm.runInNewContext(read('modules/video/video-editor/events/events.js'), context, { filename: 'events.js' });
  VE._veSetViewportMode('free');
  assert.equal(VE._veViewportMode, 'free');
  assert.equal(follow.classList.contains('is-free'), true);
  VE._veSetZoom(2, 250);
  assert.equal((wrap.scrollLeft + 250) / VE._veProject.zoom, 1250, 'zoom must preserve cursor time');
  VE._veFitProjectZoom();
  assert.ok(VE._veProject.zoom >= VE.PX_PER_SEC_MIN && VE._veProject.zoom < 0.23);
  assert.equal(wrap.scrollLeft, 0);
  assert.equal(VE._veViewportMode, 'free');

  const area = { classList: classList() };
  const focusButton = element();
  nodes['canvas-area'] = area;
  nodes['ve-btn-timeline-focus'] = focusButton;
  let renders = 0;
  VE._veRender = () => { renders += 1; };
  vm.runInNewContext(read('modules/video/video-editor/preview-render/preview-render.js'), context, { filename: 'preview-render.js' });
  VE._veToggleTimelineFocus();
  assert.equal(area.classList.contains('ve-timeline-focus'), true);
  assert.equal(focusButton.classList.contains('is-active'), true);
  assert.equal(VE._veUi.host.style.height, '');
  VE._veToggleTimelineFocus();
  assert.equal(area.classList.contains('ve-timeline-focus'), false);
  assert.equal(VE._veUi.host.style.height, '340px');
  assert.equal(renders, 2);

  wrap.scrollLeft = 0;
  wrap.clientWidth = 500;
  VE._veProject.zoom = 1;
  VE._veProject.playheadTime = 1000;
  VE._veViewportMode = 'free';
  VE._veAutoScrollPlayhead(false);
  assert.equal(wrap.scrollLeft, 0, 'free navigation must own viewport during playback');
  VE._veViewportMode = 'follow';
  VE._veAutoScrollPlayhead(false);
  assert.equal(wrap.scrollLeft, 850, 'follow mode may move viewport to playhead');
}

function verifyProgramMonitor() {
  const listeners = {};
  const video = { srcObject: null, play() { return Promise.resolve(); } };
  const mirror = { hidden: false, getContext() { return { drawImage() {} }; } };
  const play = element();
  const full = element();
  const close = element();
  const time = element();
  play.addEventListener = (name, handler) => { listeners[`play:${name}`] = handler; };
  full.addEventListener = (name, handler) => { listeners[`full:${name}`] = handler; };
  close.addEventListener = (name, handler) => { listeners[`close:${name}`] = handler; };
  const popupDocument = {
    open() {}, write() {}, close() {},
    getElementById(id) { return ({ 'pm-video': video, 'pm-canvas': mirror, 'pm-play': play, 'pm-full': full, 'pm-close': close, 'pm-time': time })[id]; }
  };
  let focused = 0;
  let windowClosed = 0;
  let trackStopped = 0;
  const popup = {
    closed: false,
    document: popupDocument,
    focus() { focused += 1; },
    close() { this.closed = true; windowClosed += 1; },
    addEventListener(name, handler) { listeners[`window:${name}`] = handler; }
  };
  const source = {
    width: 1280,
    height: 720,
    captureStream() { return { getTracks() { return [{ stop() { trackStopped += 1; } }]; } }; }
  };
  const VE = {
    _veUi: { previewCanvas: source },
    _veProject: { playheadTime: 1, duration: 10 },
    _veFormatTime(value) { return String(value); },
    _veTogglePlay() {},
    _veRender() {}
  };
  const context = {
    console,
    window: null,
    canvas: { lowerCanvasEl: source },
    document: { getElementById() { return null; }, createElement() { return element(); } },
    requestAnimationFrame(callback) { callback(); return 1; },
    cancelAnimationFrame() {},
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout
  };
  context.window = context;
  context.window.open = () => popup;
  context.window.__ccVideoEditor = VE;
  vm.runInNewContext(read('modules/video/video-editor/preview-render/preview-render.js'), context, { filename: 'preview-render.js' });
  VE._veOpenProgramMonitor();
  assert.equal(video.srcObject != null, true);
  assert.equal(typeof listeners['play:click'], 'function');
  assert.equal(typeof listeners['close:click'], 'function');
  VE._veOpenProgramMonitor();
  assert.equal(focused, 1, 'second open must focus existing monitor');
  VE._veCloseProgramMonitor();
  assert.equal(trackStopped, 1);
  assert.equal(windowClosed, 1);
  assert.equal(VE._veProgramMonitor, null);
}

function verifySerializerBoundaries() {
  const track = speakerTracks()[0];
  track.cueDubJob = { version: 1, status: 'failed', completedCueIds: ['cue-1'], translatedCues: [{ id: 'cue-1', text: 'First line' }] };
  track.clips = [{
    id: 'dub-1', type: 'audio', src: 'blob:test', _file: pcmWav(), _thumbCache: ['large'],
    _waveformUrl: `data:image/png;base64,${'x'.repeat(2000)}`,
    _filmstripCache: { huge: 'data:image/jpeg;base64,test' },
    _filmstripRequestToken: '1:0:10',
    dubbing: { sourceCueId: 'cue-1', waveformPeaks: [0.1, 0.5, 0.2] }
  }];
  const VE = {
    _veProject: { tracks: [track], duration: 3, playheadTime: 0, zoom: 1, aspectRatio: '16:9' },
    _vePlayback: { videoPool: {} },
    _veSourcePersisted: {},
    _vePageHistories: {},
    _vePause() {}
  };
  const context = {
    console,
    window: null,
    document: { createElement() { return element(); }, getElementById() { return null; } },
    localStorage: { getItem() { return null; }, setItem() {} },
    setTimeout,
    clearTimeout,
    fetch
  };
  context.window = context;
  context.window.__ccVideoEditor = VE;
  vm.runInNewContext(read('modules/video/video-editor/project/project.js'), context, { filename: 'project.js' });
  const saved = VE._veSerializeProject();
  const savedClip = saved.tracks[0].clips[0];
  assert.equal(saved.tracks[0].cueDubJob.status, 'failed');
  assert.deepEqual(Array.from(savedClip.dubbing.waveformPeaks), [0.1, 0.5, 0.2]);
  assert.equal('_waveformUrl' in savedClip, false);
  assert.equal('_filmstripCache' in savedClip, false);
  assert.equal('_filmstripRequestToken' in savedClip, false);
  assert.equal('_thumbCache' in savedClip, false);
  assert.equal('_file' in savedClip, false);

  vm.runInNewContext(read('modules/video/video-editor/export/export.js'), context, { filename: 'export.js' });
  const frozen = VE._veFreezeTracksForExport();
  const frozenClip = frozen[0].clips[0];
  assert.equal(frozenClip.startTime, savedClip.startTime);
  assert.deepEqual(Array.from(frozenClip.dubbing.waveformPeaks), [0.1, 0.5, 0.2]);
  assert.equal('_filmstripCache' in frozenClip, false);
  assert.equal('_filmstripRequestToken' in frozenClip, false);
  assert.equal('_waveformUrl' in frozenClip, false);
}

function verifySubtitleVirtualization() {
  const context = {
    console,
    window: null,
    document: { createElement() { return element(); } },
    requestAnimationFrame(callback) { callback(); return 1; },
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout,
    clearTimeout
  };
  context.window = context;
  context.window.__ccVideoEditor = { _veIcon() { return ''; }, _veSelectedCueId: null };
  const original = '_replaceAll: _replaceAll   // test harness';
  const replacement = `_replaceAll: _replaceAll,
    __testCueEntries: _cueEntries,
    __testRenderCueWindow: _renderCueWindow   // test harness`;
  const source = read('modules/video/ve-subtitle-panel/ve-subtitle-panel.js').replace(original, replacement);
  assert.notEqual(source, read('modules/video/ve-subtitle-panel/ve-subtitle-panel.js'), 'subtitle test hooks must be installed');
  vm.runInNewContext(source, context, { filename: 've-subtitle-panel.js' });

  const cues = Array.from({ length: 500 }, (_, index) => ({
    id: `cue-${index}`,
    startTime: index * 2,
    endTime: index * 2 + 1.8,
    text: `Subtitle ${index}`
  }));
  const entries = context.VESubtitlePanel.__testCueEntries(cues, cues, true);
  const attrs = {};
  const list = {
    scrollTop: 76 * 240,
    clientHeight: 420,
    innerHTML: '',
    setAttribute(name, value) { attrs[name] = String(value); }
  };
  context.VESubtitlePanel.__testRenderCueWindow(list, entries, cues, true);
  const renderedRows = (list.innerHTML.match(/class="vsub-cue(?: selected)?"/g) || []).length;
  assert.ok(renderedRows > 0 && renderedRows < 40, 'long transcript must render only viewport rows');
  assert.ok(Number(attrs['data-virtual-start']) > 200, 'deep scroll must render matching cue window');
  assert.ok(list.innerHTML.includes('vsub-virtual-spacer'), 'virtual list must preserve native scroll height');
  assert.equal(list.scrollTop, 76 * 240, 'virtual repaint must preserve scroll position');
}

export async function runVideoLongformBehavior() {
  await verifyDubbingResume();
  verifyUndoableSpeakerMerge();
  await verifyFilmstripSerialization();
  verifyTimelineWorkspace();
  verifyProgramMonitor();
  verifySerializerBoundaries();
  verifySubtitleVirtualization();
  return 7;
}
