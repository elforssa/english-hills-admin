// Video provider adapter interface (plan OL-r4 D11). Server only: an adapter may read
// a provider secret from the environment at call time and must never be bundled for
// the browser. Every adapter implements
//   createRoom({ courseRef, audience }) → { roomRef }          (opaque, never an address)
//   closeRoom(roomRef)
//   mintJoinToken({ roomRef, displayName, role, expiresAt, participantRef }) → { token, embed }
//   verifyWebhook({ rawBody, headers, secret }) → { ok, events }
//   revokeParticipant(roomRef, participantRef)                 (when supportsRevoke)
// and declares supportsWebhooks / supportsRevoke. Only the fake adapter exists until the
// owner chooses a provider through the provider acceptance tests T-P1–T-P7 (Q12).
import { fakeProvider } from './fake.mjs';

const ADAPTERS = Object.freeze({ fake: fakeProvider });

export const ADAPTER_METHODS = ['createRoom', 'closeRoom', 'mintJoinToken', 'verifyWebhook'];

export function getProvider(name) {
  if (typeof window !== 'undefined') throw new Error('Video provider adapters are server-only');
  return Object.hasOwn(ADAPTERS, name) ? ADAPTERS[name] : null;
}
