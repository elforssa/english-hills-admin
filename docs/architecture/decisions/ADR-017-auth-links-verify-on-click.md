# ADR-017: Auth e-mail links verify on a click, never on load

## Status

**Proposed** (2026-11-14) with the [e-mail links that work plan](../plans/email-links-that-work.md), revision ELW-r1. Not accepted, not implemented.

## Date

2026-11-14.

## Context

Supabase's default e-mail templates link to `GET /auth/v1/verify`. Any GET consumes the one-time token: a chat application's link preview, a mail security scanner, or the person. The R4 diagnosis of 2026-11-14 (owner evidence, read-only from Production) found two test invitations activated by WhatsApp's preview before the invitee tapped them. The sign-in link uses the PKCE code exchange, which only succeeds in the browser that asked for the link, and there is no password reset. Supabase documents the prefetch problem and the remedy of a custom link to a page of the application.

## Decision

1. **Every Auth e-mail links to a page of the application** (`/auth/confirm?token_hash=…&type=…`), built from the Site URL and the token hash in the template.
2. **That page verifies only on an explicit click.** No request carrying the token leaves the browser on load; a visitor without a session causes no Auth request.
3. **Verification is `verifyOtp({ token_hash, type })`**, a POST without a PKCE verifier, so a link works in any browser.
4. **The destination after verification comes from the account's stored role**, never from the link.
5. **The templates are kept in the repository** and applied to Production by the owner as a release step.
6. **Pages never reveal whether an address has an account**, and cannot tell a used link from an expired one.

## Consequences

- Previews and scanners no longer consume links; one more tap for the person.
- The token appears in the application's request address (and the host's request log) instead of only in Supabase's; it stays single-use and short-lived and is kept out of application monitoring.
- Template text becomes a release artefact: code first, templates second; rollback in the reverse order.
- The older code-exchange callback and fragment handling stay for links already sent and for rollback.

## Alternatives considered

- **Six-digit code typed by the person** (Supabase's other documented remedy): safe against prefetch, but a harder step for parents on a phone and a new input surface to rate-limit.
- **Token in the address fragment** (never sent to any server): better for logs, but undocumented and some mail gateways drop fragments, which would break links silently.
- **Server route that verifies on GET with a bot filter:** user-agent filtering is unreliable; one missed scanner consumes the link.
