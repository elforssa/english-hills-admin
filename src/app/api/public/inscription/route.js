// =============================================================================
// POST /api/public/inscription — retired (plan Enrollment at payment, D4).
//
// Online pre-registration is closed: an enrollment starts at the centre with a
// payment. The route answers 410 before reading anything from the request, so
// the origin, the rate limiter and Turnstile are never consulted and no body is
// parsed. The database function refuses as well (eap.public_registration_retired).
// =============================================================================

import { NextResponse } from 'next/server';

const PUBLIC_REGISTRATION_CLOSED = 'Les inscriptions en ligne sont fermées. Contactez le centre.';

export async function POST() {
  return NextResponse.json({ error: PUBLIC_REGISTRATION_CLOSED }, { status: 410 });
}
