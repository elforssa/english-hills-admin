// Server live gate for every /api/online/* route and the webhook (plan OL-r4 D11).
// Closed unless ONLINE_LEARNING_LIVE_ENABLED is exactly "true"; the fake provider is
// refused whenever VERCEL_ENV is production; a real provider without its credential
// fails closed. No variable here is NEXT_PUBLIC_.
// Reliability PR (plan ORR-r2, section 2): a provider whose adapter finds a paste mistake
// in its credentials (adapter.credentialShape) is refused like a missing one, with
// provider_invalid. The status route (GET /api/online/status) is the one online route
// that is not behind this gate: it reports what the gate would say.
import { getProvider } from './provider/index.mjs';

export const ONLINE_PROVIDER_NAMES = ['fake', 'whereby', 'daily', 'zoom-video'];

// The credential state of the configured provider, in words only: 'correct',
// 'incorrect' or 'absent' (an unknown provider or one without an adapter is 'absent').
export function onlineCredentialShape(env = process.env, getAdapter = getProvider) {
  const provider = env.ONLINE_VIDEO_PROVIDER || '';
  if (!ONLINE_PROVIDER_NAMES.includes(provider)) return 'absent';
  const adapter = getAdapter(provider);
  if (typeof adapter?.credentialShape !== 'function') return 'absent';
  try {
    const shape = adapter.credentialShape(env);
    return ['correct', 'incorrect', 'absent'].includes(shape) ? shape : 'incorrect';
  } catch { return 'incorrect'; }
}

export function onlineGate(env = process.env, getAdapter = getProvider) {
  if (env.ONLINE_LEARNING_LIVE_ENABLED !== 'true') return { open: false, reason: 'gate_closed' };
  const provider = env.ONLINE_VIDEO_PROVIDER || '';
  if (!ONLINE_PROVIDER_NAMES.includes(provider)) return { open: false, reason: 'provider_invalid' };
  if (env.VERCEL_ENV === 'production' && provider === 'fake') return { open: false, reason: 'provider_invalid' };
  if (provider === 'zoom-video' && !(env.ONLINE_VIDEO_PROVIDER_API_KEY && env.ONLINE_VIDEO_PROVIDER_API_SECRET)) {
    return { open: false, reason: 'provider_invalid' };
  }
  // A provider without an adapter keeps today's path (the handler refuses it).
  if (getAdapter(provider) && onlineCredentialShape(env, getAdapter) !== 'correct') return { open: false, reason: 'provider_invalid' };
  return { open: true, provider };
}
