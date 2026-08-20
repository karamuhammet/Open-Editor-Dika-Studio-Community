/* FLAT decompose modules/left-panel/gallery/canvas/canvas.js (1943-line FLAT — canvas media
   integration: file drop, the _cc* video engine, the _galAudio* audio player). 65 global functions
   → drop/video/audio children (stay global). 8 window.* exports → forwarders; canvas-ready init → poll. */
import { runFlat } from '../decompose-flat.mjs';
const DIR = 'modules/left-panel/gallery/canvas';
const DESC = { drop: 'file/gallery drop onto canvas + media import', video: 'on-canvas video engine (IDB, render loop, hover controls)', audio: 'on-canvas audio player + transport' };
runFlat({
  src: DIR + '/canvas.js',
  parentFile: DIR + '/canvas.js',
  childDir: DIR,
  parentId: 'canvas',
  parentDotted: 'left-panel.gallery.canvas',
  childComment: g => 'left-panel/gallery/canvas/' + g + ' — ' + (DESC[g] || g),
  canvasReadyPoll: ['_initCanvasFileDrop', '_ccInitVideoCanvasEvents'],
  groupFn: function (n) {
    if (/audio/i.test(n)) return 'audio';
    if (/video/i.test(n) || /^_cc/.test(n)) return 'video';
    return 'drop';
  }
});
