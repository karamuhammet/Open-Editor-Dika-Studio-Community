import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = process.cwd();
const LOCALES = ['zh', 'fr', 'de', 'tr', 'pt', 'ja', 'pl', 'ru', 'hi'];
const BASELINE_FILE = path.join(ROOT, 'scripts', 'i18n', 'extracted', 'community-editor.en.json');
const LOCALE_DIR = path.join(ROOT, 'apps', 'community-editor', 'locales');

function loadDictionary(code) {
  const out = {};
  const CCI18n = { add: (locale, entries) => { out[locale] = entries; } };
  vm.runInNewContext(fs.readFileSync(path.join(LOCALE_DIR, `${code}.js`), 'utf8'), {
    window: { CCI18n }, CCI18n
  }, { filename: `${code}.js` });
  return out[code] || {};
}

function visible(value) {
  return String(value ?? '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/gi, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const TECHNICAL_EXACT = new Set([
  'AI', 'CSV', 'DM Sans', 'Facebook', 'GIF', 'Business Source License 1.1', 'Instagram', 'JPG', 'JSON', 'LUT', 'LUTs',
  'LinkedIn', 'MP4', 'Messenger', 'PDF', 'PNG', 'Pinterest', 'Reddit', 'S-Log', 'SVG', 'TikTok', 'URL',
  'Unsplash', 'WebM', 'WebP', 'WhatsApp', 'X', 'YouTube', 'dika studio', 'dika.studio', 'iPad', 'iPhone',
  'Mirex Agency', 'Version 2.0', 'dika studio Standard', '4:5 Instagram', 'Instagram (4:5)', 'S-Log → Rec.709', '%c[SCDBG]',
  'YouTube • Instagram • TikTok', 't', 'v', 'N', 'Plan:', 'Saturation 0', 'FPS:'
  , '9:16 Portrait', 'Portrait (9:16)', 'Hand (1)', 'Ellipse (4)', 'Text (T)', 'Google Gemini'
  , 'Format:', 'Encoder:', 'Audio:', 'Kalite:', 'limit=200', 'i'
]);

function isTechnical(value) {
  const text = visible(value);
  if (!text || TECHNICAL_EXACT.has(text)) return true;
  if (/^(?:Ctrl|Alt)\+/.test(text) || /^iPad\s+\d/.test(text) || /^dika studio\b/.test(text)) return true;
  if (/^:scope\s*>|^ve-clip-/.test(text)) return true;
  if (/^M(?:\s+\d+|\s+[A-Z])+$/.test(text) || /^(?:Page|Image)\s+\d+$/.test(text)) return true;
  if (/^iPhone\s+\d/.test(text) || /^(?:Qwen|GLM|Kimi)\s+\(.+\)$/.test(text)) return true;
  if (/^(?:Full|Ultra|Vertical Full|4K|1080p|1440p)\b.*(?:HD|UHD|QHD|\d+:\d+)|^\d+\s+fps$/.test(text)) return true;
  if (/^(?:App Store|Mac App Store|Apple Watch|Google Play|Twitter\s*\/\s*X|X \(Twitter\)|Bebas Neue|Josefin Sans|Source Sans Pro|Plus Jakarta Sans|EB Garamond|Film Noir|Kodak Portra|Fuji Superia|John (?:Doe|Smith)|john@example\.com|TikTok \(.+\)|Twitter\/X \(.+\)|Export \/ IO|BW Modern|Chroma Key|Flash (?:In|Out)|US Clean|EU Modern|Flyer A5|Poster A3|(?:Full|Ultra) HD)$/.test(text)) return true;
  if (/^[\w/-]+(?:\s+[\w-]+)*$/.test(text) && /\b(?:ve|img|text)\b|^ve-|^img-/.test(text)) return true;
  if (/\b\d+px\b|var\(--/i.test(text)) return true;
  if (/^[\w-]+:[\w-]+$/.test(text) || /^(?:[A-Z0-9]{2,}|\d+[A-Za-z]+)$/.test(text)) return true;
  if (/^</.test(text) || /(?:onclick|data-[\w-]+|aria-[\w-]+|class=|id=)/i.test(text)) return true;
  if (TECHNICAL_EXACT.has(text.trim())) return true;
  if (/[;{}]/.test(text) || /(?:^|[;\s])(?:var\(--|font-|background(?:-color)?|border(?:-\w+)?|padding|margin|display|position|height|width|color|justify-content|align-items|text-align|box-shadow|flex|grid|transform|z-index|opacity|transition|cursor|overflow|inset|top|left|right|bottom|content|white-space|user-select|outline|accent-color|line-height|pointer-events)\s*:/i.test(text)) return true;
  if (/^(?:\[.*\]|@group\(|(?:ve|cc|rp|idb|wb)-[\w-]*:|(?:ve|cc|rp|idb|wb|scene|panel):[\w -]+|modules\/|_[A-Za-z]|[A-Za-z_][\w]*\.[A-Za-z]{1,5}$)/.test(text)) return true;
  if (/^(?:[a-z]+[-_][a-z0-9-]+|[A-Z]{2,}[\w.-]*|\.?[a-z0-9/_-]+\.[a-z0-9]+)$/i.test(text) && !/\s/.test(text)) return true;
  if (/^(?:https?|mailto|data):/i.test(text)) return true;
  if (/^(?:[.#][\w-]+|--[\w-]+|var\(|rgba?\(|rgb\(|hsl\(|hsla\()/i.test(text)) return true;
  return false;
}

function isCandidate(source, translation) {
  const sourceText = visible(source);
  const translatedText = visible(translation);
  if (String(source) !== String(translation)) return false;
  if (!sourceText || !translatedText || sourceText !== translatedText || isTechnical(source)) return false;
  if (!/[A-Za-z]/.test(sourceText)) return false;
  if (/^\[.*\]$/.test(sourceText) || /^(?:function|const|let|var|return)\b/.test(sourceText)) return false;
  return true;
}

const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
const items = (baseline.items || []).filter((item) => item && typeof item.text === 'string' && typeof item.en === 'string');
const requested = process.argv.slice(2).filter((code) => LOCALES.includes(code));
const codes = requested.length ? requested : LOCALES;
const summaryOnly = process.argv.includes('--summary');
const keysOnly = process.argv.includes('--keys-only');
let failed = false;
for (const code of codes) {
  const dictionary = loadDictionary(code);
  const candidates = [];
  for (const item of items) {
    const translation = dictionary[item.text] ?? item.text;
    if (isCandidate(item.text, translation)) candidates.push({ key: item.text, text: visible(translation) });
  }
  if (keysOnly) {
    console.log(`## ${code} ${candidates.length}`);
    candidates.forEach((candidate) => console.log(candidate.key.replace(/\r?\n/g, '\\n')));
  } else {
    console.log(JSON.stringify({ code, count: candidates.length, candidates: summaryOnly ? candidates.slice(0, 30) : candidates }, null, 2));
  }
  if (candidates.length) failed = true;
}
process.exitCode = failed ? 1 : 0;
