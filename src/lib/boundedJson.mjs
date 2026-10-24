// Server-only JSON body reader with a byte cap, enforced on Content-Length and
// again while streaming, so oversized bodies are rejected before parsing.
import { boundedBody } from './crm/meta/protocol.mjs';

export async function readBoundedJson(request, limit) {
  try { return { data: JSON.parse((await boundedBody(request, limit)).toString('utf8')) }; }
  catch (error) { return { status: error.code === 'oversized' ? 413 : 400 }; }
}
