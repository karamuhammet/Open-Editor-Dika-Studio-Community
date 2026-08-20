import { runNsChild } from '../decompose-ns-child.mjs';
const DIR = 'modules/video/video-editor/events';
runNsChild({
  src: DIR + '/events.js', parentFile: DIR + '/events.js', childDir: DIR,
  nsVar: 'VE', nsGlobal: 'window.__ccVideoEditor',
  parentId: 'events', parentDotted: 'video.video-editor.events',
  childComment: g => 'video/video-editor/events/' + g + ' — the master event-binding pass + ruler seek',
  groupFn: n => (n === '_veBindEvents' || n === '_veRulerSeek') ? 'binding' : null  // 712L out; zoom/track/lifecycle/media stay
});
