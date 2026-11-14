// Reads the English interface strings out of the installed UI Toolkit bundle
// (@zoom/videosdk-ui-toolkit, pinned): the toolkit ships en-US and zh-CN inline and offers
// no separate resource file. The bundle declares the strings as one object literal whose
// values are string literals or constants declared just before it; this evaluates exactly
// that slice. A toolkit upgrade that changes the shape fails loudly here, which is wanted:
// the French file must be re-checked against the new key list.
import { readFileSync } from 'node:fs';

export const TOOLKIT_BUNDLE = new URL('../../node_modules/@zoom/videosdk-ui-toolkit/dist/videosdk-ui-toolkit.min.esm.js', import.meta.url);

export function toolkitEnglish(source = readFileSync(TOOLKIT_BUNDLE, 'utf8')) {
  // The resource table: "en-US": { translation: <name> }.
  const name = /"en-US":\s*\{\s*translation:\s*([\w$]+)\s*\}/.exec(source)?.[1];
  if (!name) throw new Error('toolkit bundle: en-US resource table not found');
  const start = source.indexOf(`${name} = {`);
  if (start < 0) throw new Error('toolkit bundle: en-US resource object not found');
  const open = source.indexOf('{', start);
  let end = open, depth = 0, quote = null;
  for (; end < source.length; end++) {
    const c = source[end];
    if (quote) { if (c === '\\') end++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) break;
  }
  const body = source.slice(open, end + 1);
  let first = start;
  for (const [, constant] of body.matchAll(/^\s+[\w$]+: ([\w$]+),?$/gm)) {
    const at = source.lastIndexOf(`, ${constant} = `, start);
    if (at >= 0 && at < first) first = at;
  }
  const strings = new Function(`var ${source.slice(first + 2, start)} __strings = ${body}; return __strings;`)();
  for (const [key, value] of Object.entries(strings)) if (typeof value !== 'string') throw new Error(`toolkit bundle: ${key} is not a string`);
  return strings;
}

// Key groups that belong to features the room switches off (ZoomRoom.jsx FEATURES) or
// that the toolkit never renders in a session (demo and web-app shells). They stay in
// English in the bundle and are never shown.
export const UNREACHABLE_PREFIXES = Object.freeze([
  'subsession.', // subsession: off
  'troubleshooting.', // troubleshoot: off
  'caption.', 'language.', // caption: off (language.* are caption languages)
  'phone.', 'call.', 'room.', // phone: off (dial-in, call-out, room systems)
  'recording.', // recording: off
  'broadcast_', 'livestream.', 'real_time_media_streams.', // live streaming and RTMS: not enabled
  'whiteboard.', // whiteboard: not enabled
  'feedback.', // feedback: off
  'invite.', // invite: off
  'playback.', // playback: off
  'processor.', // raw-data processors: not enabled
  'avatar.', 'emoji.', // avatars and the emoji picker (chat.enableEmoji: false)
  'demo.', 'webapp.', // the toolkit's demo shell
]);

export const reachable = key => !UNREACHABLE_PREFIXES.some(prefix => key.startsWith(prefix));
