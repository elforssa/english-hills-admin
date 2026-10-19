// Server live gate for every /api/online/* route and the webhook (plan OL-r4 D11).
// Closed unless ONLINE_LEARNING_LIVE_ENABLED is exactly "true"; the fake provider is
// refused whenever VERCEL_ENV is production. No variable here is NEXT_PUBLIC_.
export const ONLINE_PROVIDER_NAMES = ['fake', 'whereby', 'daily', 'zoom-video'];

export function onlineGate(env = process.env) {
  if (env.ONLINE_LEARNING_LIVE_ENABLED !== 'true') return { open: false, reason: 'gate_closed' };
  const provider = env.ONLINE_VIDEO_PROVIDER || '';
  if (!ONLINE_PROVIDER_NAMES.includes(provider)) return { open: false, reason: 'provider_invalid' };
  if (env.VERCEL_ENV === 'production' && provider === 'fake') return { open: false, reason: 'provider_invalid' };
  return { open: true, provider };
}
