export function createStableIdempotencyKey(generate = () => crypto.randomUUID()) {
  const key = generate();
  return () => key;
}
