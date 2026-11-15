// =============================================================================
// /auth/confirm — public landing page of every Auth e-mail link (plan ELW-r3,
// ADR-017). The link's token is verified only when the person presses the
// button: nothing that carries it leaves the browser on load, so link previews
// and mail scanners can no longer use it up.
//
// The server part never reads the address parameters; the client component
// copies them into its state on mount and clears them once Supabase answered.
// =============================================================================

import ConfirmClient from './ConfirmClient';

export const metadata = {
  title: 'English Hills',
  referrer: 'no-referrer',
  robots: { index: false, follow: false, nocache: true },
};

export default function AuthConfirmPage() {
  return <ConfirmClient />;
}
