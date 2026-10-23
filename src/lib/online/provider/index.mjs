// Video provider adapter interface (plan OL-r4 D11, OL-r6 adapter addendum). Server only:
// an adapter may read a provider secret from the environment at call time and must
// never be bundled for the browser. Every adapter implements
//   createRoom({ courseRef, audience }) → { roomRef }          (opaque, never an address)
//   closeRoom(roomRef)
//   mintJoinToken({ roomRef, displayName, role, expiresAt, participantRef, lessonRef }) → { token, embed }
//   verifyWebhook({ rawBody, headers, secret }) → { ok, events, challenge? }
//   revokeParticipant(roomRef, participantRef)                 (when supportsRevoke)
// and declares supportsWebhooks / supportsRevoke. The fake adapter serves tests, local
// development and CI; zoom-video is the provider the owner chose on 2026-10-22 (Q12).
import { fakeProvider } from './fake.mjs';
import { zoomVideoProvider } from './zoom-video.mjs';

const ADAPTERS = Object.freeze({ fake: fakeProvider, 'zoom-video': zoomVideoProvider });

export const ADAPTER_METHODS = ['createRoom', 'closeRoom', 'mintJoinToken', 'verifyWebhook'];

export function getProvider(name) {
  if (typeof window !== 'undefined') throw new Error('Video provider adapters are server-only');
  return Object.hasOwn(ADAPTERS, name) ? ADAPTERS[name] : null;
}
