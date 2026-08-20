import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = {
  autoSubtitle: 'modules/video/ve-auto-subtitle/ve-auto-subtitle.js',
  dubbing: 'modules/video/ve-dubbing/ve-dubbing.js',
  translate: 'modules/video/ve-subtitle-translate/ve-subtitle-translate.js',
  importMedia: 'modules/video/video-editor/import/import.js',
  project: 'modules/video/video-editor/project/project.js',
  render: 'modules/video/video-editor/render/render.js',
  videoEditor: 'modules/video/video-editor/video-editor.js',
  preview: 'modules/video/video-editor/preview-render/preview-render.js',
  storage: 'core/storage-remote.js',
  subtitleLayout: 'modules/video/video-editor/video-editor.css',
  railFlyout: 'core/rail-flyout.js',
  subtitleElement: 'modules/video/ve-subtitle-element/ve-subtitle-element.js',
  subtitlePanel: 'modules/video/ve-subtitle-panel/ve-subtitle-panel.js',
  eventBinding: 'modules/video/video-editor/events/binding/binding.js',
  events: 'modules/video/video-editor/events/events.js',
  synthesizeRoute: '../web/src/app/api/ai/speech/synthesize/route.ts',
  transcribeRoute: '../web/src/app/api/ai/speech/transcribe/route.ts'
};

function source(key) {
  return readFileSync(resolve(root, files[key]), 'utf8');
}

export async function runVideoSpeechRegression() {
  for (const relativePath of Object.values(files)) {
    if (!/\.m?js$/.test(relativePath)) continue;
    const result = spawnSync(process.execPath, ['--check', resolve(root, relativePath)], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${relativePath} syntax failed:\n${result.stderr}`);
  }

  const autoSubtitle = source('autoSubtitle');
  assert.doesNotMatch(autoSubtitle, /CLOUD_WINDOW_OVERLAP_SECONDS|_mapChunkSpeakers|_appendDeepgramWindowWords/);
  assert.match(autoSubtitle, /requestRef=' \+ encodeURIComponent\(runRef \+ '-document'\)/);
  assert.match(autoSubtitle, /fd\.append\('num_speakers', String\(opts\.expectedSpeakers\)\)/);
  assert.match(autoSubtitle, /progressText\.textContent[\s\S]*percent \+ '%'/);
  assert.doesNotMatch(autoSubtitle, /speakerState\.localMap\[remaining\]/);

  const subtitleContext = { console, Blob, ArrayBuffer, DataView, Uint8Array };
  subtitleContext.window = {};
  const testableAutoSubtitle = autoSubtitle.replace(
    /_buildCloudWindows: _buildCloudWindows\r?\n  };/,
    '_buildCloudWindows: _buildCloudWindows, __testPcm16Part: _pcm16Part, __testPcmPartsToWav: _pcmPartsToWav, __testDeepgramWords: _deepgramWords\n  };'
  );
  vm.runInNewContext(testableAutoSubtitle, subtitleContext);
  const subtitleApi = subtitleContext.window.VEAutoSubtitle;
  const hourWindows = subtitleApi._buildCloudWindows(3600);
  assert.equal(hourWindows.length, 12, 'one hour must use 12 bounded extraction windows');
  assert.equal(
    JSON.stringify(hourWindows.map((item) => [item.start, item.end])),
    JSON.stringify(Array.from({ length: 12 }, (_, index) => [index * 300, (index + 1) * 300])),
    'audio windows must be contiguous and must not duplicate overlap audio'
  );
  const documentWords = subtitleApi.__testDeepgramWords([
    { text: 'hello', start: 0, end: 0.4, speakerId: 'speaker-1' },
    { text: 'world', start: 301, end: 301.4, speakerId: 'speaker-1' },
    { text: 'reply', start: 302, end: 302.4, speakerId: 'speaker-2' }
  ], 3600);
  assert.equal(
    JSON.stringify(Array.from(new Set(documentWords.map((word) => word.speakerId)))),
    JSON.stringify(['speaker-1', 'speaker-2']),
    'document-scoped Deepgram speaker IDs must survive extraction-window boundaries'
  );
  const wav = subtitleApi.__testPcmPartsToWav([
    subtitleApi.__testPcm16Part(new Float32Array(16000), 16000)
  ], 16000, 16000);
  assert.equal(wav.size, 32044, 'PCM16 WAV must contain one header plus exact sample bytes');

  const dubbing = source('dubbing');
  assert.match(dubbing, /function landOnTrackReady/);
  assert.match(dubbing, /deferCheckpoint:\s*true/);
  assert.match(dubbing, /sourceMix === 'documentary'/);
  assert.match(dubbing, /Dubbing complete/);
  assert.match(dubbing, /CUE_DUB_JOB_VERSION\s*=\s*1/);
  assert.match(dubbing, /Resume Cue Dub/);
  assert.match(dubbing, /withCueRetry[\s\S]*generateFittedAuraLine/);
  assert.match(dubbing, /trustedGeneratedAudio:\s*true/);
  assert.match(dubbing, /function staticWaveformPeaks/);
  assert.match(dubbing, /waveformPeaks\s*=\s*peaks/);
  assert.match(dubbing, /function renderSpeakerAudit/);
  assert.match(dubbing, /Diarization ' \+ Math\.round\(confidence \* 100\) \+ '%'/);
  assert.match(dubbing, /\.slice\(0, 3\)/);
  assert.match(dubbing, /nothing merges automatically/);
  assert.match(dubbing, /_veBeginUndoGroup\('Merge speakers'\)/);
  assert.match(dubbing, /_veEndUndoGroup\(\)/);
  assert.match(dubbing, /CUE_DUB_AUDIO_REVISION\s*=\s*'cue-dub-audio-v3'/);
  assert.doesNotMatch(dubbing, /var playbackSpeed\s*=/);
  assert.match(dubbing, /speed:\s*1,[\s\S]*timelineDuration:\s*fasterDuration/);
  assert.match(dubbing, /var nextCue = translated\[index \+ 1\]/);
  assert.match(dubbing, /dubStartTime = Math\.max\(dubStartTime, scheduledDubEnd\)/);
  assert.match(dubbing, /syncState = 'delayed-review'/);
  assert.match(dubbing, /applySourceMix\(placedMixCues, sourceMix, 0, true\)/);
  assert.match(dubbing, /id="ve-dub-dropbg" checked/);
  assert.match(dubbing, /dropBg:\s*!videoMode \|\|/);
  assert.match(dubbing, /return blobToWav\(media, clip\)/);
  assert.match(dubbing, /sourceClipId:\s*clip\.id/);
  assert.match(dubbing, /Video-copy dubbing supports untrimmed 1x clips only/);
  assert.doesNotMatch(dubbing, /Remaining drift uses clip playback speed/);

  const durationBlobs = [];
  const synthRequests = [];
  function durationBlob(seconds) {
    return {
      type: 'audio/wav',
      async arrayBuffer() {
        const bytes = new ArrayBuffer(8);
        new DataView(bytes).setFloat64(0, seconds, true);
        return bytes;
      }
    };
  }
  class FakeAudioContext {
    decodeAudioData(bytes) { return Promise.resolve({ duration: new DataView(bytes).getFloat64(0, true) }); }
    close() {}
  }
  const dubbingContext = {
    console,
    Blob,
    setTimeout,
    clearTimeout,
    AbortController,
    URL,
    fetch(_url, options) {
      synthRequests.push(JSON.parse(options.body));
      return Promise.resolve({ ok: true, blob: () => Promise.resolve(durationBlobs.shift()) });
    }
  };
  dubbingContext.window = { AudioContext: FakeAudioContext };
  const testableDubbing = dubbing.replace(
    'window.VEDubbing = { showModal: show, show: show, showTts: showTts, showDublaj: showDublaj, hide: hide, toggle: toggle };',
    'window.VEDubbing = { showModal: show, show: show, showTts: showTts, showDublaj: showDublaj, hide: hide, toggle: toggle, __testGenerateFittedAuraLine: generateFittedAuraLine, __testClipSourceRange: clipSourceRange, __testAudioBufToWav: audioBufToWav };'
  );
  vm.runInNewContext(testableDubbing, dubbingContext);
  const fitCue = dubbingContext.window.VEDubbing.__testGenerateFittedAuraLine;
  durationBlobs.push(durationBlob(4), durationBlob(3));
  const fittedEnglish = await fitCue('aura-2-thalia-en', 'Long translated line', 2, 'fit', 'test-en', new AbortController().signal);
  assert.equal(fittedEnglish.speed, 1, 'cue dubbing must never use pitch-shifting client playback speed');
  assert.equal(fittedEnglish.timelineDuration, 3, 'overlong provider audio must remain complete on the timeline');
  assert.equal(fittedEnglish.syncState, 'needs-review');
  assert.equal(synthRequests.at(-1).speed, 1.5, 'English fitting should use Deepgram natural speed control first');

  durationBlobs.push(durationBlob(4));
  const fittedFrench = await fitCue('aura-2-agathe-fr', 'Ligne longue', 2, 'fit', 'test-fr', new AbortController().signal);
  assert.equal(fittedFrench.speed, 1);
  assert.equal(fittedFrench.timelineDuration, 4);
  assert.equal(fittedFrench.syncState, 'needs-review');

  const clippedRange = dubbingContext.window.VEDubbing.__testClipSourceRange({ trimStart: 2, duration: 3, speed: 2 }, 10);
  assert.equal(JSON.stringify(clippedRange), JSON.stringify({ start: 2, end: 8 }));
  const sampleData = Float32Array.from({ length: 100 }, (_, index) => index / 100);
  const clippedWav = dubbingContext.window.VEDubbing.__testAudioBufToWav({
    numberOfChannels: 1,
    sampleRate: 10,
    length: 100,
    duration: 10,
    getChannelData() { return sampleData; }
  }, clippedRange.start, clippedRange.end);
  assert.equal(clippedWav.size, 164, 'automatic dubbing input must contain only selected source range');
  const clippedBytes = await clippedWav.arrayBuffer();
  assert.ok(Math.abs(new DataView(clippedBytes).getInt16(44, true) - 6553) <= 1, 'trimmed WAV must start at trimStart sample');

  const synthesizeRoute = source('synthesizeRoute');
  assert.match(synthesizeRoute, /input\.purpose === "cue_dubbing"/);
  assert.match(synthesizeRoute, /target\.searchParams\.set\("encoding", "linear16"\)/);
  assert.match(synthesizeRoute, /target\.searchParams\.set\("container", "wav"\)/);
  assert.match(synthesizeRoute, /sampleAccurateCueAudio \? "audio\/wav" : "audio\/mpeg"/);

  const transcribeRoute = source('transcribeRoute');
  assert.match(transcribeRoute, /MAX_AUDIO_BYTES\s*=\s*192 \* 1024 \* 1024/);
  assert.match(transcribeRoute, /Audio is larger than 192 MB/);
  assert.match(transcribeRoute, /target\.searchParams\.set\("diarize_model", "latest"\)/);
  assert.doesNotMatch(transcribeRoute, /target\.searchParams\.set\("diarize", "true"\)/);

  const translate = source('translate');
  assert.match(translate, /sourceTrack\.captionVisible = false/);

  const importMedia = source('importMedia');
  assert.match(importMedia, /generatedTimelineDuration != null/);
  assert.match(importMedia, /importOptions\.deferUi/);
  assert.match(importMedia, /importOptions\.trustedGeneratedAudio/);
  assert.match(importMedia, /importOptions\.onError/);
  assert.match(importMedia, /VEFrameSource\.isAvailable\(\)/);

  const project = source('project');
  const serializedReturn = project.slice(project.indexOf('return {', project.indexOf('VE._veSerializeProject')),
    project.indexOf('\n    };', project.indexOf('return {', project.indexOf('VE._veSerializeProject'))));
  assert.doesNotMatch(serializedReturn, /undoStack|undoIdx|selectedClips/);
  assert.match(project, /VE\._vePageHistories/);
  assert.match(project, /key === '_filmstripCache'/);

  assert.match(source('render'), /visibleStart - 300/);
  assert.match(source('render'), /VE\._veRenderVirtualFilmstrip/);
  assert.match(source('render'), /VE\._veFilmstripQueues\[clip\.id\]/);
  assert.match(source('render'), /clip\._filmstripRequestToken !== requestToken/);
  assert.match(source('render'), /VE\._veStaticWaveformUrl/);
  assert.match(source('render'), /isDubbingClip = clip\.type === 'audio' && !!clip\.dubbing/);
  assert.match(source('render'), /ve-clip-waveform ve-clip-waveform--dubbing/);
  assert.match(source('render'), /_veStaticWaveformUrl\(clip\.dubbing\.waveformPeaks, '#d7a0cf'\)/);
  assert.match(source('render'), /ctx\.fillRect\([^\n]+40 - height/);
  assert.match(source('render'), /function \(clip\)[\s\S]*VEMediaPipeline\.waveformCache\.get\(clip\.id\)/);
  assert.match(source('render'), /_veResolveDubbingWaveformSource[\s\S]*VEPersistence\.loadMedia\(clip\._ccMediaId\)/);
  assert.match(source('render'), /_veDubbingWaveformActive < 2/);
  assert.match(source('render'), /savedScrollLeft/);
  assert.match(source('preview'), /track\.captionVisible === false/);
  assert.match(source('preview'), /VE\._veViewportMode === 'free'/);
  assert.match(source('preview'), /VE\._veOpenProgramMonitor/);
  assert.match(source('events'), /VE\._veFitProjectZoom/);
  assert.match(source('videoEditor'), /PX_PER_SEC_MIN = 0\.2/);
  assert.match(source('storage'), /e\.status === 429/);

  const subtitleLayout = source('subtitleLayout');
  assert.match(subtitleLayout, /\.ve-clip--dubbing\s*\{[\s\S]*background:\s*var\(--surface3[\s\S]*border-color:\s*var\(--border\)[\s\S]*var\(--gold/);
  assert.match(subtitleLayout, /\.ve-clip--dubbing\.ve-clip--selected\s*\{[\s\S]*border-color:\s*var\(--gold/);
  assert.doesNotMatch(subtitleLayout, /\.ve-clip--dubbing\s*\{[\s\S]{0,240}--ve-dub-speaker-color/);
  assert.match(subtitleLayout, /\.ve-clip-waveform--dubbing\s*\{[\s\S]*inset:\s*11px 3px 0 4px[\s\S]*height:\s*calc\(100% - 11px\)/);
  assert.match(subtitleLayout, /\.flyout-body\.tpl-subtitle-body\s*\{[\s\S]*display:\s*flex/);
  assert.match(subtitleLayout, /\.ve-subtitle-dock \.vsub-list\s*\{[\s\S]*flex:\s*1 1 auto/);
  assert.match(subtitleLayout, /\.ve-subtitle-dock \.vsub-foot\s*\{[\s\S]*background:/);
  assert.match(subtitleLayout, /\.vsub-track-rail:hover::-webkit-scrollbar-thumb\s*\{[\s\S]*background:/);

  const railFlyout = source('railFlyout');
  assert.match(railFlyout, /tab !== 'templates'[\s\S]*classList\.remove\('tpl-subtitle-body'\)/);

  assert.match(source('subtitleElement'), /function _deselect\(silent\)[\s\S]*_veSelectedCueId = null[\s\S]*syncSelection\(null, null\)/);
  assert.match(source('subtitlePanel'), /editor && editor\._veSelectedCueId === selectedCue\.id[\s\S]*VESubtitleElement\.deselect\(\)/);
  assert.match(source('subtitlePanel'), /function _selectCueFromPanel[\s\S]*VESubtitleElement\.selectTrack\(track, cue\.id\)/);
  assert.match(source('subtitlePanel'), /\.onfocusin[\s\S]*_selectCueFromPanel/);
  assert.match(source('subtitlePanel'), /VIRTUAL_THRESHOLD = 80/);
  assert.match(source('subtitlePanel'), /function _renderCueWindow[\s\S]*data-virtual-start/);
  assert.match(source('subtitlePanel'), /_pendingCueId = cueId \|\| null/);
  assert.match(source('eventBinding'), /Click on empty track area[\s\S]*VESubtitleElement\.deselect\(true\)/);
  assert.match(source('render'), /Clip click[\s\S]*VESubtitleElement\.deselect\(true\)/);
  assert.match(source('events'), /Escape[^\n]*deselect[\s\S]*VESubtitleElement\.deselect\(true\)/);

  const selectionCalls = { panel: 0, preview: 0, timeline: 0 };
  const selectionVE = {
    _veSelectedCueId: 'cue-1',
    _veSelectedSubtitleTrackId: 'track-1',
    _veRender() { selectionCalls.timeline++; }
  };
  const selectionContext = {
    console,
    canvas: null,
    VideoEditor: { renderPreview() { selectionCalls.preview++; } },
    VESubtitlePanel: { syncSelection(cueId, trackId) {
      assert.equal(cueId, null);
      assert.equal(trackId, null);
      selectionCalls.panel++;
    } }
  };
  selectionContext.window = {
    __ccVideoEditor: selectionVE,
    VideoEditor: selectionContext.VideoEditor,
    VESubtitlePanel: selectionContext.VESubtitlePanel
  };
  vm.runInNewContext(source('subtitleElement'), selectionContext);
  assert.equal(selectionContext.window.VESubtitleElement.deselect(), true);
  assert.equal(selectionVE._veSelectedCueId, null);
  assert.equal(selectionVE._veSelectedSubtitleTrackId, null);
  assert.deepEqual(selectionCalls, { panel: 1, preview: 1, timeline: 1 });

  return Object.keys(files).length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const checked = await runVideoSpeechRegression();
  console.log(`[video-speech-regression] ${checked} modules checked`);
}
