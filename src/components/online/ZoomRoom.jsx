'use client';

// The Zoom Video SDK UI Toolkit mounted for one lesson (plan OL-r6 adapter addendum).
// Loaded only on /online/room/<lesson> through a dynamic import, so the toolkit bundle
// never reaches another page. The display name is the platform label from the pass and
// the pre-join name edit is disabled (T-P4); invitations, recording, phone, captions,
// subsessions and virtual backgrounds are switched off for the pilot. Leaving the room,
// by the toolkit's own button or by the lesson ending, is a full document navigation
// back to the portal, because the room path carries its own security headers (A6).
import { useEffect, useRef } from 'react';
import '@zoom/videosdk-ui-toolkit/dist/videosdk-ui-toolkit.css';

const FEATURES = Object.freeze({
  preview: { enable: false, isAllowModifyName: false },
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
  header: { enable: true },
  playback: { enable: false },
  virtualBackground: { enable: false },
  screenshot: { video: { enable: false }, share: { enable: false } },
});

export default function ZoomRoom({ embed, onLeft }) {
  const container = useRef(null);
  const left = useRef(false);
  useEffect(() => {
    let toolkit = null, cancelled = false;
    const leave = () => { if (!left.current) { left.current = true; onLeft(); } };
    import('@zoom/videosdk-ui-toolkit').then(module => {
      if (cancelled || !container.current) return;
      toolkit = module.default;
      toolkit.onSessionClosed(leave);
      toolkit.onSessionDestroyed(leave);
      toolkit.joinSession(container.current, {
        videoSDKJWT: embed.token,
        sessionName: embed.sessionName,
        userName: embed.displayName,
        featuresOptions: FEATURES,
        leaveOnPageUnload: true,
      });
    }).catch(leave);
    return () => {
      cancelled = true;
      try { toolkit?.offSessionClosed?.(leave); toolkit?.offSessionDestroyed?.(leave); toolkit?.destroy?.(); } catch { /* already gone */ }
    };
  }, [embed.token, embed.sessionName, embed.displayName, onLeft]);
  return <div ref={container} data-testid="zoom-room" className="min-h-[70vh] w-full overflow-hidden rounded-xl border bg-black" />;
}
