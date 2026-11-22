'use client';

// The Zoom Video SDK UI Toolkit mounted for one lesson (plan OL-r6 adapter addendum).
// Loaded only on /online/room/<lesson> through a dynamic import, so the toolkit bundle
// never reaches another page. The display name is the platform label from the pass. The
// toolkit's pre-join device screen is shown with the name locked (owner decision of
// 2026-11-14; T-P4 unchanged), so a participant chooses microphone and camera before
// entering instead of arriving with both off. Invitations, recording, phone, captions,
// virtual backgrounds and the toolkit header are switched off for the pilot.
// The whiteboard is on (plan online-classroom-tools.md, D3): the teacher starts and
// exports it, learners on a computer draw but cannot export, and a participant whose
// device cannot open the canvas gets it as a picture, with one line saying so.
// The interface is French: the resource file is in the repository and registered inline,
// so no new host is contacted. Leaving the room, by the toolkit's own button or by the
// lesson ending, is a full document navigation back to the portal, because the room path
// carries its own security headers (A6).
// The room is started once per pass: the effect depends on the embed only, the page's
// callbacks are read through refs, and the lifecycle (serialised teardown, failures,
// page exit, console trace) lives in zoom-room-session.mjs.
// Raise hand (PR D, « Lever la main »): RoomHands.jsx above the room, outside the
// toolkit: the button for a learner, « Mains levées (n) » for the teacher (the pass's
// host). Who may lower another's hand is decided from Zoom's list, not from this role.
// Reliability (plan online-room-reliability.md, reliability PR): `onJoined` when Zoom has
// let the participant in (the page then confirms its pass), `onNewer` when a newer
// device's marker arrives, and `link.current.announceNewer()` for the page to send the
// marker after a confirmation that superseded an older connection. `onLeft` receives
// `{ closed }`: 'removed', 'ended' or null.
import { useEffect, useRef, useState } from 'react';
import '@zoom/videosdk-ui-toolkit/dist/videosdk-ui-toolkit.css';
import { startZoomRoom } from '@/lib/online/zoom-room-session.mjs';
import { preloadZoomMediaChunks } from '@/lib/online/zoom-media-chunks.mjs';
import { WHITEBOARD_READ_ONLY_TEXT } from '@/lib/online/zoom-whiteboard.mjs';
import RoomHands from '@/components/online/RoomHands';
import frFR from '@/lib/online/zoom-fr-FR.json';

export const ROOM_LANGUAGE = 'fr-FR';
export const FEATURES = Object.freeze({
  preview: { enable: true, isAllowModifyName: false },
  video: { enable: true },
  audio: { enable: true, backgroundNoiseSuppression: false },
  secondaryAudio: { enable: false },
  share: { enable: true },
  chat: { enable: true, enableEmoji: false },
  users: { enable: true },
  settings: { enable: true },
  recording: { enable: false },
  invite: { enable: false },
  theme: { enable: false, defaultTheme: 'light' },
  viewMode: { enable: true },
  phone: { enable: false },
  feedback: { enable: false },
  troubleshoot: { enable: false },
  caption: { enable: false },
  // Groups (« Groupes », plan online-classroom-tools.md, PR B, D4/D10): only the host or a
  // co-host can create or open them, whatever the page says.
  subsession: { enable: true },
  // Undocumented key (commented out in the toolkit's typings, read by its bundle). These
  // are the teacher's values; a learner gets LEARNER_WHITEBOARD below.
  whiteboard: { enable: true, enableExport: true, enableViewerUserExport: false },
  leave: { enable: true },
  footer: { enable: true },
  // The toolkit header shows the technical session name; learners see the lesson title
  // on the platform page instead.
  header: { enable: false },
  playback: { enable: false },
  virtualBackground: { enable: false },
  screenshot: { video: { enable: false }, share: { enable: false } },
});

// D3: learners draw but do not export. `enableViewerUserExport: false` only removes the
// toolkit's own export button; Zoom's whiteboard program keeps its « Exporter au format
// PNG » link for a viewer unless the viewer's own `enableExport` is false (observed with
// Zoom, 2026-11-15). The role comes from the pass; it decides what the page offers, not
// what Zoom allows: only a host can start or stop a whiteboard, whatever the page says.
export const LEARNER_WHITEBOARD = Object.freeze({ enable: true, enableExport: false, enableViewerUserExport: false });
export const featuresFor = role => (role === 'host' ? FEATURES : Object.freeze({ ...FEATURES, whiteboard: LEARNER_WHITEBOARD }));

// Scoped to the room container:
//  - the toolkit's phone header prints the technical session name; it is not for learners;
//  - with nobody else in the gallery the toolkit's pager prints « 1 / -1 »: hide the pager
//    while the « Aucun autre participant » message is shown.
// And one rule on the toolkit's own menu layer, which it draws outside the container:
//  - the toolkit's leave menu (« Quitter le cours », « Revenir à la salle principale »,
//    « Terminer le cours ») hides itself whenever the toolkit draws its button again, and
//    nothing shows it again (read in the bundle: the menu's clean-up sets it hidden on
//    every new render of its parent). While a group timer counts down that is every
//    second, so the menu vanished under the pointer (observed with Zoom, 2026-11-16):
//    once the toolkit has placed the menu, it stays visible until the toolkit removes it.
// Size (the squeezed whiteboard, owner, Production, 2026-11-22). The page gives the room
// a definite height (RoomFrame.jsx: the screen below the title and the hands); the
// toolkit fills it from `h-full` on its app box. Three toolkit boxes size themselves
// from the whole window instead, read in the bundle of 2.5.0-1; inside the room they
// fill the room:
//  - the phone layout: `height: 100svh; width: 100vw` (its footer fell below the room,
//    and the page was wider than the phone);
//  - the pre-join device screen: `min-h-[100dvh] max-h-[100dvh]`, with the join button
//    centred in it (it would have been cut off at the bottom of a shorter room);
//  - the whiteboard: `height: 75%` of the video area, the rest for a strip of
//    thumbnails above it that needs about 8.5rem; the whiteboard gets everything above
//    that strip, never less than the toolkit's 75%.
const ROOM_STYLE = `[data-testid="zoom-room"] div[style*="100svh"] { height: 100% !important; }
[data-testid="zoom-room"] div[style*="100vw"] { width: 100% !important; }
[data-testid="zoom-room"] .min-h-\\[100dvh\\] { min-height: 100%; }
[data-testid="zoom-room"] .max-h-\\[100dvh\\] { max-height: 100%; }
[data-testid="zoom-room"] #uikit-whiteboard-container[style*="height: 75%"] { height: max(75%, calc(100% - 8.5rem)) !important; }
[data-testid="zoom-room"] .uikit-mobile-header h1 { visibility: hidden; }
[data-testid="zoom-room"] .flex-grow.items-center.justify-between:has(.text-2xl.font-semibold.m-2) > .flex.flex-col.items-center:has(> button.rounded-full) { visibility: hidden !important; }
.zoom-ui-toolkit-root > div[style*="visibility: hidden"][style*="z-index: 1000"]:not([style*="top: 0px"]) { visibility: visible !important; }`;

const loadToolkit = () => import('@zoom/videosdk-ui-toolkit');

export default function ZoomRoom({ embed, onLeft, onError, onJoined, onNewer, link }) {
  const container = useRef(null);
  const callbacks = useRef({ onLeft, onError, onJoined, onNewer, link });
  const [closing, setClosing] = useState(false);
  const [boardReadOnly, setBoardReadOnly] = useState(false);
  const [hands, setHands] = useState(null);
  const room = useRef(null);
  useEffect(() => { callbacks.current = { onLeft, onError, onJoined, onNewer, link }; });
  const { token, sessionName, displayName, role } = embed;
  useEffect(() => {
    setClosing(false);
    setBoardReadOnly(false);
    setHands(null);
    const started = startZoomRoom({
      loadToolkit,
      // The SDK's WebRTC and annotation chunks, loaded as plain scripts (see the module).
      preloadMedia: preloadZoomMediaChunks,
      container: container.current,
      config: { videoSDKJWT: token, sessionName, userName: displayName, featuresOptions: featuresFor(role), leaveOnPageUnload: true },
      language: ROOM_LANGUAGE,
      resources: frFR,
      joinLabel: frFR['preview.join_button'],
      onLeft: detail => callbacks.current.onLeft?.(detail),
      onJoined: () => callbacks.current.onJoined?.(),
      onNewer: () => callbacks.current.onNewer?.(),
      onError: detail => callbacks.current.onError?.(detail),
      // Take the toolkit's own (English) error dialog off the screen while the room closes.
      onClosing: () => setClosing(true),
      onWhiteboard: board => setBoardReadOnly(board.readOnly === true),
      hands: role === 'host' ? 'teacher' : 'learner',
      onHands: setHands,
    });
    room.current = started;
    const link = callbacks.current.link;
    const handle = { announceNewer: () => started.announceNewer() };
    if (link) link.current = handle;
    return () => {
      if (room.current === started) room.current = null;
      if (link && link.current === handle) link.current = null;
      started.stop();
    };
  }, [token, sessionName, displayName, role]);
  // The toolkit measures its video area (computer and phone layouts) when the window is
  // resized, and at no other time (read in the bundle of 2.5.0-1). The room's box also
  // changes height when the page changes around it: the hands list grows, the read-only
  // line or a notice appears. Each time, the toolkit is told, as if the window had been
  // resized, so its footer stays inside the room.
  useEffect(() => {
    const box = container.current;
    if (!box || typeof ResizeObserver === 'undefined') return undefined;
    let size = null, frame = 0;
    const observer = new ResizeObserver(([entry]) => {
      const now = `${Math.round(entry.contentRect.width)}x${Math.round(entry.contentRect.height)}`;
      const first = size === null;
      if (now === size) return;
      size = now;
      if (first) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    });
    observer.observe(box);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);
  return (
    <>
      <style href="online-zoom-room" precedence="default">{ROOM_STYLE}</style>
      {boardReadOnly && !closing && <p className="rounded-lg border bg-card p-3 text-sm" role="status" data-testid="room-whiteboard-readonly">{WHITEBOARD_READ_ONLY_TEXT}</p>}
      {!closing && <RoomHands state={hands} onRaise={() => room.current?.hands.raise()} onLower={() => room.current?.hands.lower()}
        onLowerOf={id => room.current?.hands.lowerOf(id)} onLowerAll={() => room.current?.hands.lowerAll()} />}
      {closing && <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Fermeture de la salle…</p>}
      <div ref={container} data-testid="zoom-room" lang="fr" hidden={closing}
        className="min-h-72 w-full flex-1 overflow-hidden rounded-xl border bg-black" />
    </>
  );
}
