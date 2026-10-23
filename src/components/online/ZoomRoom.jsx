'use client';

// The Zoom Video SDK UI Toolkit mounted for one lesson (plan OL-r6 adapter addendum).
// Loaded only on /online/room/<lesson> through a dynamic import, so the toolkit bundle
// never reaches another page. The display name is the platform label from the pass and
// the pre-join name edit is disabled (T-P4); invitations, recording, phone, captions,
// subsessions, virtual backgrounds and the toolkit header are switched off for the pilot. Leaving the room,
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
  // The toolkit header shows the technical session name; learners see the lesson title
  // on the platform page instead.
  header: { enable: false },
  playback: { enable: false },
  virtualBackground: { enable: false },
  screenshot: { video: { enable: false }, share: { enable: false } },
});

export default function ZoomRoom({ embed, onLeft, onError }) {
  const container = useRef(null);
  const left = useRef(false);
  useEffect(() => {
    let toolkit = null, cancelled = false;
    const leave = () => { if (!left.current) { left.current = true; onLeft(); } };
    // A toolkit that cannot load or join is a provider error shown with a retry, never a
    // silent leave; a session that closes or is destroyed is a leave.
    const failed = error => {
      // Diagnostics only: the toolkit's own message, never the token or a room reference.
      console.warn('[online room] provider room failed:', String(error?.reason || error?.message || error?.type || error).slice(0, 200));
      if (!cancelled) onError(error);
    };
    import('@zoom/videosdk-ui-toolkit').then(async module => {
      if (cancelled || !container.current) return;
      toolkit = module.default;
      // The toolkit accepts callbacks only once joinSession has given it a configuration.
      const joining = toolkit.joinSession(container.current, {
        videoSDKJWT: embed.token,
        sessionName: embed.sessionName,
        userName: embed.displayName,
        featuresOptions: FEATURES,
        leaveOnPageUnload: true,
      });
      toolkit.onSessionClosed(leave);
      toolkit.onSessionDestroyed(leave);
      await joining;
    }).catch(failed);
    return () => {
      cancelled = true;
      try { toolkit?.offSessionClosed?.(leave); toolkit?.offSessionDestroyed?.(leave); toolkit?.destroy?.(); } catch { /* already gone */ }
    };
  }, [embed.token, embed.sessionName, embed.displayName, onLeft, onError]);
  return (
    <>
      {/* The toolkit's phone header prints the technical session name; it is not for learners. */}
      <style href="online-zoom-room" precedence="default">{'[data-testid="zoom-room"] .uikit-mobile-header h1 { visibility: hidden; }'}</style>
      <div ref={container} data-testid="zoom-room" className="min-h-[70vh] w-full overflow-hidden rounded-xl border bg-black" />
    </>
  );
}
