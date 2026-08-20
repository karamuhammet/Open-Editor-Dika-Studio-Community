import { runVideoSpeechRegression } from './video-speech-regression.mjs';
import { runVideoLongformBehavior } from './video-longform-behavior.mjs';

const checked = await runVideoSpeechRegression();
const behaviors = await runVideoLongformBehavior();
console.log(`[smoke] editor speech pipeline ready, ${checked} modules and ${behaviors} long-form behaviors checked`);
