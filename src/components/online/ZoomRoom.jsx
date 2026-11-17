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
import { useEffect, useRef, useState } from 'react';
import '@zoom/videosdk-ui-toolkit/dist/videosdk-ui-toolkit.css';
import { startZoomRoom } from '@/lib/online/zoom-room-session.mjs';
import { preloadZoomMediaChunks } from '@/lib/online/zoom-media-chunks.mjs';
import { WHITEBOARD_READ_ONLY_TEXT } from '@/lib/online/zoom-whiteboard.mjs';
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
const ROOM_STYLE = `[data-testid="zoom-room"] .uikit-mobile-header h1 { visibility: hidden; }
[data-testid="zoom-room"] .flex-grow.items-center.justify-between:has(.text-2xl.font-semibold.m-2) > .flex.flex-col.items-center:has(> button.rounded-full) { visibility: hidden !important; }
.zoom-ui-toolkit-root > div[style*="visibility: hidden"][style*="z-index: 1000"]:not([style*="top: 0px"]) { visibility: visible !important; }`;

const loadToolkit = () => import('@zoom/videosdk-ui-toolkit');

export default function ZoomRoom({ embed, onLeft, onError }) {
  const container = useRef(null);
  const callbacks = useRef({ onLeft, onError });
  const [closing, setClosing] = useState(false);
  const [boardReadOnly, setBoardReadOnly] = useState(false);
  useEffect(() => { callbacks.current = { onLeft, onError }; });
  const { token, sessionName, displayName, role } = embed;
  useEffect(() => {
    setClosing(false);
    setBoardReadOnly(false);
    const room = startZoomRoom({
      loadToolkit,
      // The SDK's WebRTC and annotation chunks, loaded as plain scripts (see the module).
      preloadMedia: preloadZoomMediaChunks,
      container: container.current,
      config: { videoSDKJWT: token, sessionName, userName: displayName, featuresOptions: featuresFor(role), leaveOnPageUnload: true },
      language: ROOM_LANGUAGE,
      resources: frFR,
      joinLabel: frFR['preview.join_button'],
      onLeft: () => callbacks.current.onLeft?.(),
      onError: detail => callbacks.current.onError?.(detail),
      // Take the toolkit's own (English) error dialog off the screen while the room closes.
      onClosing: () => setClosing(true),
      onWhiteboard: board => setBoardReadOnly(board.readOnly === true),
    });
    return () => { room.stop(); };
  }, [token, sessionName, displayName, role]);
  return (
    <>
      <style href="online-zoom-room" precedence="default">{ROOM_STYLE}</style>
      {boardReadOnly && !closing && <p className="rounded-lg border bg-card p-3 text-sm" role="status" data-testid="room-whiteboard-readonly">{WHITEBOARD_READ_ONLY_TEXT}</p>}
      {closing && <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Fermeture de la salle…</p>}
      <div ref={container} data-testid="zoom-room" lang="fr" hidden={closing}
        className="min-h-[70vh] w-full overflow-hidden rounded-xl border bg-black" />
    </>
  );
}
