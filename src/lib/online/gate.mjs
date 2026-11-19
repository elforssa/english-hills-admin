// Server live gate for every /api/online/* route (plan OL-r4 D11).
// Closed unless ONLINE_LEARNING_LIVE_ENABLED is exactly "true"; the fake provider is
// refused whenever VERCEL_ENV is production; a real provider without its credential
// fails closed. No variable here is NEXT_PUBLIC_.
// Reliability PR (plan ORR-r2, section 2): a provider whose adapter finds a paste mistake
// in its credentials (adapter.credentialShape) is refused like a missing one, with
// provider_invalid. The status route (GET /api/online/status) is the one online route
// that is not behind this gate: it reports what the gate would say.
// Webhook PR (plan ORR-r2, section 3, D5): the webhook routes are not behind this gate
// either; they have their own, onlineWebhookGate below, independent of the live switch.
import { getProvider } from './provider/index.mjs';
import { hasPasteMistake } from './provider/credential-shape.mjs';

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

// The webhook secret in words only: 'present', 'incorrect' (a paste mistake, section 2)
// or 'absent'. Never the value, its length or its class.
export function onlineWebhookSecretShape(env = process.env) {
  const secret = env.ONLINE_VIDEO_PROVIDER_WEBHOOK_SECRET;
  if (!secret) return 'absent';
  return hasPasteMistake(secret) ? 'incorrect' : 'present';
}

// The webhook gate (plan ORR-r2, section 3, D5 = A, B3). /api/webhooks/online/<provider>
// answers if and only if all five hold, whatever ONLINE_LEARNING_LIVE_ENABLED says:
//   1. <provider> is in the provider list and equals ONLINE_VIDEO_PROVIDER;
//   2. it is not the fake provider while VERCEL_ENV is production (ADR-008 invariant);
//   3. the adapter supports webhooks;
//   4. the provider's credentials are set and free of paste mistakes (credentialShape);
//   5. ONLINE_VIDEO_PROVIDER_WEBHOOK_SECRET is set and free of paste mistakes.
// Otherwise the route answers 404 having read at most the headers. Kill switch: remove
// the webhook secret and redeploy (condition 5). Joins never read the webhook secret.
export function onlineWebhookGate(env = process.env, provider, getAdapter = getProvider) {
  const closed = { open: false, reason: 'not_found' };
  const configured = env.ONLINE_VIDEO_PROVIDER || '';
  if (!ONLINE_PROVIDER_NAMES.includes(provider) || provider !== configured) return closed;
  if (env.VERCEL_ENV === 'production' && provider === 'fake') return closed;
  const adapter = getAdapter(provider);
  if (!adapter?.supportsWebhooks || typeof adapter.verifyWebhook !== 'function') return closed;
  if (onlineCredentialShape(env, getAdapter) !== 'correct') return closed;
  if (onlineWebhookSecretShape(env) !== 'present') return closed;
  return { open: true, provider, adapter };
}
