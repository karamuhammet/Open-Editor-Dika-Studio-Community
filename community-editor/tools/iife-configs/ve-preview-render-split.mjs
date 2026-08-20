import { runNsChild } from '../decompose-ns-child.mjs';
const DIR = 'modules/video/video-editor/preview-render';
runNsChild({
  src: DIR + '/preview-render.js', parentFile: DIR + '/preview-render.js', childDir: DIR,
  nsVar: 'VE', nsGlobal: 'window.__ccVideoEditor',
  parentId: 'preview-render', parentDotted: 'video.video-editor.preview-render',
  childComment: g => 'video/video-editor/preview-render/' + g + ' — overlay sync, transition, visibility + selection',
  groupFn: n => /Overlay/.test(n) ? 'overlay' : null   // 4 overlay fns out (~767L); frame compositor stays
});
