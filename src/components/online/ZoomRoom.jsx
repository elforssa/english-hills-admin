'use client';

// The Zoom Video SDK UI Toolkit mounted for one lesson (plan OL-r6 adapter addendum).
// Loaded only on /online/room/<lesson> through a dynamic import, so the toolkit bundle
// never reaches another page. The display name is the platform label from the pass. The
// toolkit's pre-join device screen is shown with the name locked (owner decision of
// 2026-11-14; T-P4 unchanged), so a participant chooses microphone and camera before
// entering instead of arriving with both off. Invitations, recording, phone, captions,
// subsessions, virtual backgrounds and the toolkit header are switched off for the pilot.
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
  subsession: { enable: false },
  leave: { enable: true },
  footer: { enable: true },
  // The toolkit header shows the technical session name; learners see the lesson title
  // on the platform page instead.
  header: { enable: false },
  playback: { enable: false },
  virtualBackground: { enable: false },
  screenshot: { video: { enable: false }, share: { enable: false } },
});

// Scoped to the room container:
//  - the toolkit's phone header prints the technical session name; it is not for learners;
//  - with nobody else in the gallery the toolkit's pager prints « 1 / -1 »: hide the pager
//    while the « Aucun autre participant » message is shown.
const ROOM_STYLE = `[data-testid="zoom-room"] .uikit-mobile-header h1 { visibility: hidden; }
[data-testid="zoom-room"] .flex-grow.items-center.justify-between:has(.text-2xl.font-semibold.m-2) > .flex.flex-col.items-center:has(> button.rounded-full) { visibility: hidden !important; }`;

const loadToolkit = () => import('@zoom/videosdk-ui-toolkit');

export default function ZoomRoom({ embed, onLeft, onError }) {
  const container = useRef(null);
  const callbacks = useRef({ onLeft, onError });
  const [closing, setClosing] = useState(false);
  useEffect(() => { callbacks.current = { onLeft, onError }; });
  const { token, sessionName, displayName } = embed;
  useEffect(() => {
    setClosing(false);
    const room = startZoomRoom({
      loadToolkit,
      container: container.current,
      config: { videoSDKJWT: token, sessionName, userName: displayName, featuresOptions: FEATURES, leaveOnPageUnload: true },
      language: ROOM_LANGUAGE,
      resources: frFR,
      joinLabel: frFR['preview.join_button'],
      onLeft: () => callbacks.current.onLeft?.(),
      onError: detail => callbacks.current.onError?.(detail),
      // Take the toolkit's own (English) error dialog off the screen while the room closes.
      onClosing: () => setClosing(true),
    });
    return () => { room.stop(); };
  }, [token, sessionName, displayName]);
  return (
    <>
      <style href="online-zoom-room" precedence="default">{ROOM_STYLE}</style>
      {closing && <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Fermeture de la salle…</p>}
      <div ref={container} data-testid="zoom-room" lang="fr" hidden={closing}
        className="min-h-[70vh] w-full overflow-hidden rounded-xl border bg-black" />
    </>
  );
}
