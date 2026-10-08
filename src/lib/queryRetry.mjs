// Read retry policy for TanStack Query (reads only; mutations are never retried
// automatically). A failure that carries a PostgreSQL SQLSTATE or a PostgREST
// PGRST code is an answer from the server: retrying rarely helps, so it keeps the
// previous single retry. Anything else (offline, timeout, gateway or proxy error,
// interrupted transfer) never reached a database answer and is retried up to three
// times with TanStack's default backoff (1 s, 2 s, 4 s).
export function isTransientReadFailure(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  return !/^[0-9A-Z]{5}$/.test(code) && !code.startsWith('PGRST');
}

export function shouldRetryRead(failureCount, error) {
  return failureCount < (isTransientReadFailure(error) ? 3 : 1);
}
