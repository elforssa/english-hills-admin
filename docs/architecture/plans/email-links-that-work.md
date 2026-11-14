# E-mail links that work — architecture, revision ELW-r3

**Status: PROPOSED (2026-11-14). Not approved, not implemented.** Revision ELW-r2 applies the independent review of ELW-r1 at head `b3b63e827d3a6b8857c0662f30e06dbb1ccabb76` (CHANGES REQUIRED: B1–B6, N1–N9 and test gaps; [review corrections](#review-corrections-elw-r2)) and records the owner's answers D1–D5 = A (Maroine, 2026-11-14). Revision ELW-r3 applies the re-review of ELW-r2 at head `d5878d953c1b61b6d54ddcd2b90cf0335f4061c6` (CHANGES REQUIRED: B7, B8, N1–N5; [corrections](#review-corrections-elw-r3)); it needs no new owner decision and awaits re-review and owner approval. Architecture only: no application code, no migration, no Supabase or Vercel change is made by this plan. **Tier 3** (sign-in, invitation and password paths for every role; Supabase Auth e-mail templates and URL configuration in Production; a new public page). Presence in the [plans index](README.md) is not approval.

Baseline: `origin/main` `9f0c911fa52a32351a4ec79d5d2e00ffa1c3fbd6` (2026-11-14). Source: PR A of the R4 diagnosis of 2026-11-14, findings 1, 2 and 3. Related: [portal readiness PRF-r2](portal-readiness.md) (D11 sign-in rules, D10 origin check), [ADR-011](../decisions/ADR-011-portal-access-model.md), proposed [ADR-017](../decisions/ADR-017-auth-links-verify-on-click.md).

# Owner summary

## What will change

- **Links in our e-mails stop working "by themselves".** Today an invitation link is used up as soon as anything opens it, including the preview WhatsApp makes when the link is pasted in a chat. After this change every link opens a page of ours with one button. Nothing happens until a person presses the button.
- **Three buttons:** « Activer mon compte » (invitation), « Se connecter » (sign-in link), « Continuer » (new password).
- **A real « Mot de passe oublié ? ».** It sends an e-mail that leads to a « Nouveau mot de passe » form. Today that link only sends a sign-in link and never lets the person choose a password.
- **The sign-in link works in any browser.** Today it fails when the e-mail opens in another browser or inside an app (Gmail, WhatsApp), and the login page shows nothing.
- **The login page explains failures in French** instead of staying silent.
- **A link opened a second time** shows: « Ce lien a déjà été utilisé ou a expiré. Si votre compte est déjà activé, connectez-vous. » with « Se connecter » and « Mot de passe oublié ? » (owner decision, 2026-11-14).
- **After the deployment, you change four e-mail templates in Supabase** (exact text in [E-mail templates](#e-mail-templates-exact-text)). Until you do, everything behaves as today.

## What staff/users will be able to do

- An invited person can paste or forward the link, open it on any device, and still activate the account once.
- Anyone with an account can ask for a sign-in link or choose a new password, from any browser.
- A person whose invitation was already used up, and who never chose a name and password, can finish alone: « Mot de passe oublié ? » or a sign-in link leads them back to the activation step (D1 = A).
- When staff re-invite such a person, an e-mail is sent (D2 = A). Today none is.
- A signed-in person who reopens an old link is told « Votre compte est déjà activé » and sent to their space, and can choose to sign out and use the link for another account (D3 = A).
- After a new password is chosen, the account's other devices are signed out (D5 = A).

## What remains restricted

- Accounts are still created only by an invitation from a director or an admin. The login page never creates an account (PRF-r2 D11, `shouldCreateUser: false`).
- The application's screens never say whether an address has an account. Both request forms always answer the same sentence.
- A link still works once and still expires. A 'pending' account still has no access to any operational page.
- No role, permission, policy or database function changes.

## UI impact

- New public page `/auth/confirm` (one card, one button, same look as the login page).
- Login page: three clear modes instead of two: password, « Recevoir un lien de connexion », « Mot de passe oublié ? »; a French message when a link failed.
- Activation page `/inscription-compte`: no longer shows the form to someone already activated; neutral wording instead of "expired".
- Four e-mails rewritten in French.

## Database impact

**None.** No migration, no data change by the application. The only data step is the clean-up of the two stranded test accounts (R5), which needs its own approval.

## Important security decisions

1. **A link never verifies on load.** No request carrying the link's token leaves the browser before the button is pressed. This is what stops previews and mail scanners from using the link ([ADR-017](../decisions/ADR-017-auth-links-verify-on-click.md), proposed).
2. **No account disclosure on the application's screens.** Request forms and the used-link page give the same answer whether or not the address has an account.
3. **The new-password form exists only right after its link was verified**, in that same page. There is no standing page where a signed-in session can set a password without the link.
4. **Where a link leads is decided by the application from the account's stored data**, never by the link. The page takes no destination parameter.
5. **The token is in the page address**, as Supabase documents. It is single-use and short-lived, is removed from the address bar once Supabase has answered, and is kept out of Sentry and speed monitoring (the Sentry filter is extended for this, [section 5](#5-middleware-guards-and-monitoring)). It does appear in Vercel's request log ([risk 2](#risks--owner-review-points)).
6. **"Already activated" is a positive mark, not the role.** The mark is a completed profile name, written only by the activation form ([section 1](#1-landing-page-authconfirm)).

## Risks / owner review points

1. **Two steps, in order.** The code is deployed first (R2), the templates are changed second (R3). In between, and after any template rollback, « Mot de passe oublié ? » sends the old kind of link: it signs the person in on the same browser without the password form. Do R2 and R3 back to back in a quiet hour.
2. **The token appears in Vercel's request log** for `/auth/confirm`. It is useless once used or expired, but an unused one read from the log within its lifetime would open that account. Access to the Vercel project is already owner-only; the plan keeps it that way and adds no log of its own.
3. **E-mail budget.** Anyone can type any address in the two request forms. Supabase limits one e-mail per address per minute and a project total per hour; a determined visitor could use up the hour's budget and delay real invitations. This exists today with the magic-link form. Follow-up option, not in this plan: Supabase Auth CAPTCHA (Turnstile).
4. **Old links.** Invitations and sign-in links sent before R3 keep their old format and keep working as today (including being used up by previews). They expire on their own.
5. **Evidence limit.** The R4 findings (WhatsApp user agent, the two activated test invitations, the PKCE error) were read from Production by the owner's diagnosis and are not re-verified here. The code paths they name were read on the baseline and match.
6. **The five decisions are answered** (D1–D5 = A, Maroine, 2026-11-14; [record](#owner-decisions-answered-2026-11-14)). The plan itself still needs the re-review and your approval.
7. **Other devices after a new password (D5).** They can no longer renew their session, but a device already signed in keeps working until its current access token expires (the token lifetime is read at R0; one hour on the local stack).
8. **A role can be active before the form is finished.** As today, the application applies the invited role as soon as the session exists ([current state](#verified-current-state-baseline-9f0c911), sweep). The form then completes name and password. This plan does not change that; it only stops relying on the role to decide who sees the form.

---

# Verified current state (baseline `9f0c911`)

| Area | What the code does | Finding |
| --- | --- | --- |
| Invitation e-mail | [invite route](../../../src/app/api/admin/invite/route.js) calls `auth.admin.inviteUserByEmail(email, { redirectTo: <origin>/inscription-compte })`. No template is kept in the repository; [supabase/config.toml](../../../supabase/config.toml) has the template block commented out, so local and (per the diagnosis) Production use Supabase's default `{{ .ConfirmationURL }}`, a `GET /auth/v1/verify` link. | 1: any GET consumes the token. |
| Activation page | [inscription-compte](../../../src/app/inscription-compte/page.jsx) verifies on mount: `verifyOtp` when `token_hash` is present, `setSession` from the `#access_token` fragment, or `exchangeCodeForSession` for `?code=`. Any failure sets phase `expired`. With no token and a session, it shows the form whatever the role. On submit it sets the password, writes `profiles.full_name`, calls `apply_pending_role()` and, when that returns nothing, reads the stored role. | 1 (the `token_hash` branch also verifies without a click) and 3. |
| Sign-in link | [login page](../../../src/app/(auth)/login/page.jsx): « Mot de passe oublié ? » and « Connexion par lien magique » both switch to the same magic-link mode; `signInWithOtp` with `emailRedirectTo: /login/callback` and `shouldCreateUser: false`. The browser client is PKCE (`@supabase/ssr` 0.5.2 default). An error from Supabase is shown as is, so an unknown address gets a different answer than a known one. | 2, plus account disclosure. |
| Callback | [login/callback](../../../src/app/(auth)/login/callback/route.js) calls `exchangeCodeForSession(code)`; on error it redirects to `/login?error=callback_failed` (or `missing_code`). The login page reads only `returnTo`. | 2: the error is never shown. |
| Password reset | `resetPasswordForEmail` is not called anywhere in `src`; `updateUser({ password })` is called only by the activation form. | 2: no reset exists. |
| Role application | `apply_pending_role()` (latest body: migration 123) sets the queued role for a confirmed, still-pending account and deletes the queue row; it returns NULL and deletes the row when the queue is expired (7 days) or no longer valid. It has **four** callers: the activation form, the callback, the password sign-in, and the **session sweep** in [AuthContext](../../../src/context/AuthContext.jsx) (`applyPendingRoleIfAny`, lines 44–53), which runs on load and on every `SIGNED_IN` / `USER_UPDATED` event, on every page, because [providers](../../../src/app/providers.jsx) wraps the whole application. | The sweep makes a just-verified invitee's role active before any page can read it as 'pending' (review B1). |
| Re-invitation | `portal_security.queue_role_invitation` (123) returns `needsDelivery = false` when the Auth account already has a confirmed e-mail, so the route sends **no e-mail** for a confirmed account that is still pending. The public wrappers do not return the queue id. | Stranded accounts cannot be re-invited by e-mail (D2). |
| Middleware | [middleware](../../../src/middleware.js) `PUBLIC_PATHS`: `/login`, `/login/callback`, `/inscription`, `/inscription-compte`, `/privacy`, `/unauthorized`, plus `/login/*`. It calls `auth.getUser()` on every request (the visitor's own cookies only). A pending role is redirected to `/unauthorized` on every non-public path. | `/auth/confirm` is not public yet. |
| Monitoring | [rumScrub](../../../src/lib/rumScrub.mjs) strips query and fragment. [sentry-scrub](../../../src/lib/sentry-scrub.js) removes the query from **absolute** `http(s)` addresses, from values under keys named like `url`/`href`/`src`, and from the request context. It does **not** remove it from a relative path under another key: a navigation breadcrumb's `from` / `to` (`/auth/confirm?token_hash=…`) would keep the token. CSP `connect-src` already allows the Supabase project ([next.config.mjs](../../../next.config.mjs)); `Referrer-Policy: strict-origin-when-cross-origin`. | The Sentry filter needs a change (review B4). No CSP change. |
| Libraries | `@supabase/supabase-js` and `auth-js` 2.105.4: `verifyOtp({ token_hash, type })` is available. Supabase's [e-mail template guide](https://supabase.com/docs/guides/auth/auth-email-templates) documents `{{ .SiteURL }}`, `{{ .TokenHash }}`, the prefetch problem and the custom-link remedy, and uses `type=email` for sign-in and sign-up links. | — |

Not verified here (read at R0): the Production templates, Site URL, redirect allow-list, link lifetime, sign-up and confirmation settings, the Auth version, Auth rate limits, and the state of the accounts r4a and r4b.

**If sign-ups are disabled in Production** (read at R0): a sign-in link requested for an invited address that is not confirmed yet sends nothing, and the form shows the same neutral sentence as for any address. « Mot de passe oublié ? » still works for that person and leads to the activation form, and so does a re-invitation by staff. Sign-ups must **not** be enabled to change this: the Confirm signup template is prepared only so that, where Supabase does send that e-mail, its link is a click-to-verify link.

# Scope and non-goals

In scope: findings 1, 2 and 3; the landing page; the login page split and error display; the activation page corrections; the four templates as repository files and as owner release text; the Sentry filter correction; tests; release, rollback and the test-account clean-up.

Out of scope: room and Zoom changes (PR B/C), the shared-address message (PR D), Supabase plan changes, CAPTCHA, any change to roles, RLS, `apply_pending_role`, the invitation functions or the AuthContext sweep, an in-app "change my password" setting, the e-mail change template.

# Design

## 1. Landing page `/auth/confirm`

File `src/app/auth/confirm/page.jsx` (outside the `(admin)` group, same visual shell as the login page). Parameters: `token_hash` and `type` only. The page takes no destination parameter; a `next` in the address is ignored.

**Rule L1 — no verification on load.** No request made on load carries `token_hash`: not by this page, not by the middleware, not by the shared session provider. A visitor without a session (every preview bot) causes no Auth request at all. A signed-in visitor's browser does make its usual requests with its own session on load (session refresh, own profile read, the AuthContext sweep); none of them includes the link's token. The server part of the page does not read the parameters. Page metadata: generic title « English Hills », `robots: noindex`; no third-party resource. The response carries `Referrer-Policy: no-referrer` ([section 5](#5-middleware-guards-and-monitoring)).

**Accepted `type` values (closed list):** `invite`, `email` (sign-in link and sign-up confirmation), `magiclink` (older spelling of the sign-in link, accepted so either works), `recovery`. Anything else, or a missing or malformed `token_hash` (accepted shape: 1–200 characters of `[A-Za-z0-9_-]`), shows the used-link screen without any call.

**The activation mark (review B1, option a).** An account counts as activated when its own `profiles.full_name` is not blank. Only the activation form writes it for an invited account. The role is **not** used to decide who sees the form, because the AuthContext sweep may already have applied the invited role by the time any page reads it.

Why this option and not stopping the sweep on these two pages:
- it changes no shared provider, so `AuthContext.jsx` stays out of the manifest and invariant 5 stands;
- it does not depend on the person staying on two pages: with the sweep stopped there, a visit to any other page (the middleware sends a pending account to `/unauthorized`) would still apply the role and silently skip the form;
- the activation form's submit already tolerates the sweep (it reads the stored role when `apply_pending_role()` returns nothing);
- when the mark is wrong the result is harmless: the form is shown once more and can only set the caller's own name and password.

**States.**

| State | Shown | Action |
| --- | --- | --- |
| Ready, no session | Title per type and one button: « Activer mon compte » (`invite`), « Se connecter » (`email`/`magiclink`), « Continuer » (`recovery`). | Click → verify (below). |
| Ready, session with the activation mark | « Votre compte est déjà activé. » with the signed-in address, « Continuer vers mon espace » → the account's destination, and the small action « Ce lien est pour un autre compte ? Me déconnecter et l'utiliser » (D3 = A), which signs the local session out and shows the "no session" state. | No verification. |
| Ready, session without the mark | Same button as "no session". | Click → verify. |
| Verifying | Button disabled, spinner. | — |
| Used or expired | « Ce lien a déjà été utilisé ou a expiré. Si votre compte est déjà activé, connectez-vous. » with « Se connecter » (→ `/login`) and « Mot de passe oublié ? » (→ `/login?mode=reset`). | — |
| Connection problem | « Connexion impossible. Vérifiez votre connexion puis réessayez. » The button stays; the token was not consumed and is still in the address, so a reload also works. | Retry. |
| New password (only after a `recovery` verification in this page, for an account with the mark) | « Nouveau mot de passe » form: password, confirmation, 8 characters minimum (today's rule). | `updateUser({ password })`, then sign out the other sessions, then the destination. |

**Verify on click.**

1. The token and type were copied into the page's state when it mounted. Disable the button.
2. `signOut({ scope: 'local' })` if a session exists (as the activation page does today, so the inviter's session in the same browser is never mixed with the invitee's).
3. `verifyOtp({ token_hash, type })` with the browser client. This is a POST that needs no PKCE verifier, so it works in any browser.
4. No HTTP answer, a 5xx or a 429 → connection-problem screen; the address is left untouched. Any other Auth 4xx → remove the query from the address bar (`history.replaceState`) and show the used-or-expired screen.
5. On success, remove the query from the address bar, read the account's own profile row and route:

| Verified type | No activation mark | Activation mark present |
| --- | --- | --- |
| `invite` | `/inscription-compte` (activation form) | the destination (cannot normally happen) |
| `email` / `magiclink` | `/inscription-compte` (D1 = A). The page makes **no** `apply_pending_role()` call first. | `apply_pending_role()`, then the destination |
| `recovery` | `/inscription-compte` (D1 = A): the activation form sets name and password | new-password form in this page; after success `signOut({ scope: 'others' })` (D5 = A), `apply_pending_role()`, then the destination |

**The destination** is `loginDestination(role)` with the stored role and no requested path ([roleAccess](../../../src/lib/roleAccess.mjs)): the role's home, or `/unauthorized` for a pending account. `returnTo` keeps working for password sign-in, unchanged.

**The four cases of review B1.**

| Case | What happens |
| --- | --- |
| Invitation, happy path | Click → verified → the sweep may apply the role at once → no mark → activation form → submit sets the password first, then writes the name (the mark, the form's last write), then calls `apply_pending_role()` (nothing left to apply if the sweep won) and reads the stored role → the role's home. |
| Reload during the form | `/inscription-compte` with a session and no mark → the form again, whatever the role now is. |
| Old-format invitation (fragment or `?code=`) | Lands on `/inscription-compte` as today; the session is installed; no mark → the form. Invariant 7 holds. |
| Recovery or sign-in link for a never-activated account, including reload | Verified → no mark → `/inscription-compte` → the form (it sets the password the person asked for). A reload shows the form again. |

**D5, exact behaviour.** `signOut({ scope: 'others' })` revokes the other sessions' refresh tokens on the server. A device already signed in keeps working until its current access token expires, then cannot renew and is sent to `/login`. If the call fails, the new password is kept and the page shows « Mot de passe modifié. Vos autres appareils resteront connectés quelques instants. » before continuing.

## 2. Activation page `/inscription-compte`

- **A `token_hash` parameter is no longer verified here.** The page forwards to `/auth/confirm` with the same `token_hash` and `type` (client-side, no Auth call), so an old bookmark or a template mistake cannot bring back verification on load.
- The `#access_token` fragment and `?code=` branches stay, for invitations sent before the template change and for rollback. They do not carry a link token: Supabase has already verified it.
- After the session is known: activation mark present → « Votre compte est déjà activé. » and the destination (finding 3). No mark → the form, whatever the role.
- No session and no token, or a failed old-format exchange → the same used-or-expired screen and wording as the landing page, instead of « expiré ».
- **Submit order (review B7).** (1) the password, with `updateUser({ password })`; (2) the name, written to the caller's own `profiles.full_name`: this is the activation mark and the form's last write; (3) `apply_pending_role()` and the read of the stored role, which write nothing on behalf of the form. The mark is therefore never present without a password.
- **An account that already has this password.** Supabase refuses a password equal to the current one (HTTP 422, code `same_password`, « New password should be different from the old password »). The form treats that answer as "password already set" and continues to the name write. This covers an active account with a blank name that re-enters its current password, and a retry after the name write failed.
- **A failed name write** after the password succeeded shows « Votre nom n'a pas pu être enregistré. Réessayez. » and keeps the form; the retry, with the same password, passes through the rule above.
- **Auth errors are never shown as received.** Closed French map, used by this form and by the new-password form of the landing page: weak password → « Ce mot de passe est trop faible. Choisissez-en un autre d'au moins 8 caractères. »; missing or expired session (401, 403) → « Votre session a expiré. Rouvrez votre lien ou demandez-en un nouveau. »; 429 → « Trop de tentatives. Réessayez dans quelques minutes. »; no answer → the connection message; anything else → « Le mot de passe n'a pas pu être enregistré. Réessayez. » On the new-password form, `same_password` also counts as success.
- Submit, when no role is active afterwards (`apply_pending_role()` applied nothing and the stored role is still pending): « Votre invitation n'est plus valide. Demandez au centre de vous réinviter, puis connectez-vous avec le mot de passe que vous venez de choisir. » (replaces today's « Aucun rôle actif… »). The password is kept; the next password sign-in applies the new invitation, as it does today. The implementer confirms on the local stack that a still-pending account can write its own name; if it cannot, this message is shown at that point instead of the profile error, and no policy is changed.

## 3. Login page `/login`

- Modes: `password` (default), `link` (« Recevoir un lien de connexion »), `reset` (« Mot de passe oublié ? »). `?mode=reset` and `?mode=link` preselect a mode (closed list).
- « Mot de passe oublié ? » calls `resetPasswordForEmail(email, { redirectTo: <origin>/login/callback })`. « Recevoir un lien de connexion » keeps `signInWithOtp` with `shouldCreateUser: false` and today's `emailRedirectTo`. The redirect values are kept exactly so a template rollback restores today's behaviour.
- **Same answer for every address (review B5).** Both forms end on « Si un compte existe pour cette adresse, un e-mail vient de lui être envoyé. Pensez à vérifier vos courriers indésirables. » for **every** answer Supabase gives: success and any error status, 429 included (Supabase's one-per-minute limit applies only to an existing account, so a rate-limit message would disclose it). The only other message is for a request that got no answer at all: « Connexion impossible. Vérifiez votre connexion puis réessayez. » The submit button stays disabled for 60 seconds after every answered request, whatever the answer.
- `?error=` is read from a closed map and never echoed: `callback_failed` and `missing_code` → « Ce lien de connexion n'a pas pu être vérifié. Il a peut-être déjà été utilisé, a expiré, ou a été ouvert dans un autre navigateur. Demandez un nouveau lien. » and the page opens in `link` mode. Unknown values show nothing.
- [login/callback](../../../src/app/(auth)/login/callback/route.js) is unchanged (old links, rollback).

**Scope of the disclosure rule.** It covers what the application's screens and the application's own routes show. Supabase's Auth endpoints are public and answer anyone who calls them directly; their answers are outside this plan.

## 4. Invite route (D2 = A)

`redirectTo` stays `/inscription-compte` (old template, rollback).

When the invitation function answers `needsDelivery = false` with a `userId`, and that account's stored role, read with the caller's own client, is still 'pending', the route sends that address a sign-in e-mail so the person receives a working link. An active account gets no e-mail, as today.

- The send is `signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: <origin>/inscription-compte } })` from an anon client created for the request with no cookie storage and the implicit flow. Under the default templates (before R3, after a rollback) the link therefore lands on `/inscription-compte` with a fragment, like an invitation, and reaches the form.
- The decision uses only `needsDelivery`, `userId` and the stored role. It never needs the queue id, which the public functions do not return; the route's answer never contains one.
- If the send fails, the route answers 502 with today's « Envoi non confirmé. Réessayez l'invitation; aucun rôle existant n'a été modifié. »; the queue row stays and the invitation can be retried.
- The e-mail is the sign-in or the confirmation template; both are worded so they also fit a person who did not ask for a link ([templates](#e-mail-templates-exact-text)).
- The gates, origin check and rate limits of the route stay.

## 5. Middleware, guards and monitoring

- Add exactly `/auth/confirm` to `PUBLIC_PATHS`. `/auth`, `/auth/confirmx` and `/auth/confirm/x` stay gated. No matcher change.
- The middleware sets `Referrer-Policy: no-referrer` on the `/auth/confirm` response (a response header, so it applies before any script runs).
- [sessionProfile](../../../src/lib/sessionProfile.mjs): the retry screen is not shown on `/auth/confirm` (same treatment as `/login`).
- **Sentry (review B4).** [sentry-scrub](../../../src/lib/sentry-scrub.js) is changed so that no `token_hash` value can leave the browser: the query and fragment are removed from relative paths as well as absolute addresses (breadcrumb `from` and `to` included), and any `token_hash=…` left in free text is redacted.
- **Origin guard:** the plan adds no cookie-authenticated state-changing route; verification, reset request and password change go from the browser to Supabase Auth, as sign-in does today. The existing `rejectCrossOrigin` on the invite route is unchanged.
- **Rate limits:** Supabase Auth's own limits apply (verifications per IP, one e-mail per address per minute, e-mails per hour). They are read at R0 and recorded. The application adds the 60-second button cooldown (after every answered request) only.
- **CSP:** unchanged.
- **Logs:** no `console` output on these pages; no parameter is sent to Sentry, speed monitoring or the activity log.

## 6. Never-activated account that asks for a password or a link (D1 = A)

A verified link whose account has no activation mark always ends on the activation form, never on `/unauthorized`. The form sets name and password; the invited role is applied by the form or, earlier, by the sweep. If the invitation has expired, the person keeps the password and is told to ask the centre for a new invitation. `/unauthorized` remains what a pending account sees on any other page.

## E-mail templates (exact text)

Kept in the repository as `supabase/templates/invite.html`, `magic_link.html`, `recovery.html` and `confirmation.html`, wired in `supabase/config.toml` for local tests, and pasted by the owner into the Supabase dashboard at R3. `{{ .SiteURL }}` must have no trailing slash.

| Template | `type` in the link | Why |
| --- | --- | --- |
| Invite user | `invite` | The invitation token. |
| Magic Link | `email` | Supabase's current value for a sign-in link; `magiclink` is the older spelling and is still accepted by the page. |
| Confirm signup | `email` | Where sign-ups are enabled, sent instead of the Magic Link e-mail when a sign-in link is requested for an invited address that is not confirmed yet (review B3). Where they are disabled, nothing is sent ([current state](#verified-current-state-baseline-9f0c911)). |
| Reset Password | `recovery` | The recovery token. |

Each template ends with an invisible marker comment naming it (`<!-- eh-template: invite -->`, `magic_link`, `confirmation`, `recovery`), so a test can tell which one Supabase sent.

The implementer confirms each row on the local stack. Which e-mail Supabase sends to an invited, unconfirmed address that requests a link or a new password is confirmed in two settings: under the repository's shared local configuration (e-mail confirmations off), in CI, by the marker of the e-mail that arrives ([local test 9](#test-plan)); and with e-mail confirmations on, in one recorded author run on a private stack ([local test 9b](#test-plan)), because switching confirmations on in the shared `supabase/config.toml` would change sign-up behaviour for every other local suite. A different `type` value for a row is corrected in the implementation PR and is not a design change; a flow that cannot be verified by token hash is a stop condition.

**Invite user** — subject: `Votre invitation à l'espace English Hills`

```html
<h2>Bienvenue à English Hills</h2>
<p>Bonjour,</p>
<p>English Hills Language Center vous invite à activer votre compte sur son espace en ligne.</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite">Activer mon compte</a></p>
<p>Ce lien est personnel et ne peut servir qu'une seule fois. S'il ne fonctionne plus, demandez une nouvelle invitation au centre.</p>
<p>Si vous n'attendiez pas ce message, vous pouvez l'ignorer.</p>
<p>English Hills Language Center, Casablanca</p>
<!-- eh-template: invite -->
```

**Magic Link** — subject: `Votre lien d'accès à l'espace English Hills`

```html
<h2>Accès à votre espace English Hills</h2>
<p>Bonjour,</p>
<p>Voici votre lien pour accéder à votre espace English Hills.</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Se connecter</a></p>
<p>Ce lien ne peut servir qu'une seule fois. S'il ne fonctionne plus, demandez-en un nouveau depuis la page de connexion.</p>
<p>Si vous n'attendiez pas ce message, ignorez-le : votre compte reste protégé.</p>
<p>English Hills Language Center, Casablanca</p>
<!-- eh-template: magic_link -->
```

**Confirm signup** — subject: `Votre lien d'accès à l'espace English Hills`

```html
<h2>Accès à votre espace English Hills</h2>
<p>Bonjour,</p>
<p>Voici votre lien pour accéder à votre espace English Hills et terminer l'activation de votre compte.</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Se connecter</a></p>
<p>Ce lien ne peut servir qu'une seule fois. S'il ne fonctionne plus, demandez-en un nouveau depuis la page de connexion.</p>
<p>Si vous n'attendiez pas ce message, ignorez-le.</p>
<p>English Hills Language Center, Casablanca</p>
<!-- eh-template: confirmation -->
```

**Reset Password** — subject: `Choisir un nouveau mot de passe English Hills`

```html
<h2>Nouveau mot de passe</h2>
<p>Bonjour,</p>
<p>Vous avez demandé à choisir un nouveau mot de passe pour votre espace English Hills.</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Choisir un nouveau mot de passe</a></p>
<p>Ce lien ne peut servir qu'une seule fois. S'il ne fonctionne plus, utilisez « Mot de passe oublié ? » sur la page de connexion.</p>
<p>Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe ne change pas.</p>
<p>English Hills Language Center, Casablanca</p>
<!-- eh-template: recovery -->
```

# Security review points

1. L1 holds for every entry: `/auth/confirm` and `/inscription-compte` send no request containing `token_hash` on load, with or without JavaScript, with or without a session.
2. No account disclosure on the application's screens: identical screen and wording for known, unknown, pending, unconfirmed and rate-limited addresses on both request forms; identical used-or-expired screen for used, expired and invalid tokens.
3. The landing page takes no destination parameter; `returnTo` on `/login` still reaches only `loginDestination`; `mode` and `error` are closed lists; nothing from the address is rendered.
4. The new-password form is reachable only through the in-page state set by a successful `recovery` verification; reloading drops it.
5. A link opened in a browser where someone else is signed in never changes that person's account: the page shows the signed-in state first, and a verification always signs the local session out first.
6. A never-activated account gains nothing new: `apply_pending_role()` is unchanged; the landing page calls it only for an account with the mark.
7. `shouldCreateUser: false` stays on every `signInWithOtp` call, including the re-invitation send.
8. The token is absent from Sentry events and breadcrumbs (relative paths included), speed-monitoring routes, application logs and the activity log; `Referrer-Policy: no-referrer` on the landing page response.
9. Middleware: only the exact path is public; look-alikes stay gated; a pending session on `/auth/confirm` and `/inscription-compte` is not redirected to `/unauthorized`.
10. The four template files in the repository (`invite`, `magic_link`, `recovery`, `confirmation`) contain no `{{ .ConfirmationURL }}` and no `{{ .Token }}`.
11. The activation mark only ever decides which of the caller's own screens is shown; it grants nothing.

# Test plan

**Unit (`npm test`, new `scripts/test-email-links.mjs`).**
- Parameter parsing: accepted types, malformed `token_hash`, unknown `type`, `mode`, `error` map; a `next` parameter (plain and hostile: `//host`, `/\host`, encoded slashes) is ignored.
- Routing table of [section 1](#1-landing-page-authconfirm) for each type × mark (absent, present) × role (pending, each active role); the "no mark" rows never call `apply_pending_role()`.
- Source scan: `/auth/confirm` and `/inscription-compte` call `verifyOtp` only inside the click handler; `resetPasswordForEmail` and `signInWithOtp` appear only in the login page and the invite route, the latter always with `shouldCreateUser: false`; the four templates contain the `/auth/confirm?token_hash=` link and no `ConfirmationURL` or `{{ .Token }}`.
- Sentry (B4): a navigation breadcrumb whose `from` and `to` are relative (`/auth/confirm?token_hash=…&type=invite`) leaves `scrubBreadcrumb` without the query; an event message and an exception value containing `token_hash=…` are redacted; an absolute address still loses its query. `rumScrub` on a `/auth/confirm` address.
- Request forms (B5): for a stubbed success, 400, 422, 429 and 500 answer the rendered text is identical; only a rejected fetch shows the connection message.
- Invite route (D2): the answer never contains a queue id; the send decision is unchanged when the function result has no queue id; a failed send answers 502 with the existing message.

**Middleware and navigation (`npm run test:middleware`, `npm run test:navigation`, `scripts/test-session-profile.mjs`, `scripts/test-middleware-unavailable.mjs`).**
- `/auth/confirm` answers 200 without a session, with a pending session and with each role, with `Referrer-Policy: no-referrer`; `/auth`, `/auth/confirmx`, `/auth/confirm/x` are gated; the existing callback cases still pass.

**Local Supabase with the four custom templates (new `scripts/test-email-links-local.mjs`, script `test:email-links-local`, browser-driven, local mail catcher, synthetic addresses).** It runs in CI: it is added to the `browser-security` shard of [verify.yml](../../../.github/workflows/verify.yml), so the required gate covers it on the exact head. The author also records one local run in the PR.

How the suite runs anywhere (review B8):
- **New-format links.** The suite never follows the address printed in the e-mail, because `{{ .SiteURL }}` is the fixed local value (`127.0.0.1:3000`) while the application under test listens elsewhere (port 3101 in CI). It reads `token_hash` and `type` from the caught e-mail, asserts the printed link has the form `<SiteURL>/auth/confirm?token_hash=…&type=…`, and opens `/auth/confirm` with those two values on its own application origin.
- **Old-format links.** The custom templates stay in place for the whole run. An old-format link is synthesised from the same caught token: `<API>/auth/v1/verify?token=<token_hash>&type=<type>&redirect_to=<application origin>/inscription-compte` (or `/login/callback`). This is what the default template would have printed.
- **Redirect allow-list.** `supabase/config.toml` gains one `additional_redirect_urls` entry for the test application origin, so the synthesised links may redirect to it. Local configuration only.
- **Template identity.** Asserted by the marker comment in the e-mail body.
1. Invitation and previews: read the link from the mail catcher and the account's stored confirmation token from the database. `curl` the link twice (plain GET, WhatsApp user agent). Load it in a headless browser with JavaScript and **no click**, wait for the network to settle: zero requests to `/auth/v1/verify`. Read the database again: the confirmation token is unchanged and the address is still unconfirmed. Then click → activation form → account active. **The link still works after the previews.**
2. Second browser: request a sign-in link in browser context A, open it in a fresh context B → signed in.
3. Recovery end to end: request, open in a fresh context, set a new password, old password refused, new password accepted. A second, already signed-in context then fails to refresh its session (D5) and is sent to `/login`.
4. Reopened link (each type) → used-or-expired screen; no Auth error text shown.
5. Signed-in activated user opens an invitation link → « Votre compte est déjà activé » with the second action; the invitation is still usable afterwards; using the second action signs out and activates the invitee.
6. Never-activated account (confirmed, no password, no name): recovery → activation form → role active; a sign-in link does the same; with an expired queue → the "no longer valid" message, account still pending, `/unauthorized` on other pages.
7. Reload (B1): during the activation form after an invitation, after a recovery for a never-activated account, and after an old-format fragment invitation → the form is shown again each time, although the stored role is already active.
8. Request forms (B5): a known, an unknown, a never-activated and an invited-unconfirmed address, and a second request for the same address inside the local per-address limit (`max_frequency` in `supabase/config.toml`, line 229), all end on the same sentence; no account is created for the unknown address.
9. Invited, unconfirmed address requests a sign-in link (B3), under the shared local configuration: the suite records which e-mail arrives by its marker (or that none does), asserts that any link is an `/auth/confirm?token_hash=…` link, and that a click leads to the activation form. Same check for « Mot de passe oublié ? ».
9b. The same case with e-mail confirmations **on**. Not run in CI. One recorded author run on a private stack whose own configuration copy sets `enable_confirmations = true` (the repository's `supabase/config.toml` is not changed for this): the e-mail carries the `confirmation` marker, its link is an `/auth/confirm?token_hash=…&type=email` link, and a click leads to the activation form. The run's output is attached to the PR.
10. Old-format links, synthesised as described above: an invitation (fragment) and a same-browser sign-in link (code) still work; a cross-browser one shows the new French message on `/login`.
11. Re-invitation (D2) with the custom templates: re-inviting a confirmed, never-activated account produces one e-mail whose link reaches the activation form; re-inviting an active account produces none.
12. Re-invitation (D2) in the old format: the link synthesised from the re-invitation e-mail's token, with `redirect_to` `/inscription-compte`, lands there and reaches the activation form.
13. `/inscription-compte?token_hash=…` forwards to `/auth/confirm` without any Auth call.
14. Connection error on the click (verify request blocked): the connection message is shown, the address still carries the token, a reload shows the button again and a second click succeeds.
15. Active account with a blank name and a password (B7): sign-in link → activation form → the current password re-entered and a name → the name is saved → the role's destination; no Auth error text is shown.
16. Name write fails after the password succeeded (B7; the profile write is blocked for one attempt): the French name message is shown and the form stays; the retry with the same password saves the name and reaches the destination.

Required CI is the full lane (source and workflow change). No database suite changes.

# Release steps

Each step needs the owner's explicit approval; R0 and R3 are done by the owner in the Supabase dashboard.

| Step | What | Who | Stop if |
| --- | --- | --- | --- |
| R0 | Read-only. **Dashboard:** copy the four current templates and subjects (Invite user, Magic Link, Confirm signup, Reset Password: the rollback text); Site URL; redirect allow-list; the "allow new users to sign up" and "confirm e-mail" settings; e-mail link lifetime; access-token lifetime; "secure password change"; Auth rate limits; sender; the Production Auth version. **Read-only query:** for r4a and r4b, the exact address and Auth user id of each account that R5 will delete, with its confirmation state, stored role, name, queue row and expiry, and pending links; the list of active accounts with a blank name, by role only (they will see the activation form once on their next e-mail link, where they may re-enter their current password; the owner can warn them). The addresses, ids and the blank-name list are recorded in the private release notes, not in the repository. | Owner; operator for the query | Site URL is not `https://admin.english-hills.com`; the allow-list lacks `/login/callback` or `/inscription-compte` (fix first, separately approved). |
| R1 | Independent review READY on the implementation PR's exact head; owner merge approval. | Owner | — |
| R2 | Merge → Vercel deploys. Check: `/auth/confirm` answers 200 signed out; a same-browser sign-in link and password sign-in still work; `/login?error=callback_failed` shows the message. | Operator | Any sign-in regression → Vercel rollback to the previous deployment. |
| R3 | Owner pastes the four templates and subjects (Invite user, Magic Link, Confirm signup, Reset Password); confirms Site URL has no trailing slash; keeps the existing allow-list entries. No allow-list entry is needed for `/auth/confirm` (it is built from Site URL). | Owner | — |
| R4 | Production proof with owner-controlled test addresses: (a) a fresh invitation pasted into WhatsApp, preview shown, then tapped → activation works; (b) a sign-in link opened in another browser; (c) « Mot de passe oublié ? » end to end; (d) a reopened link → neutral message; (e) r4a through « Mot de passe oublié ? » and r4b through « Recevoir un lien de connexion » reach the activation step (D4 = A; re-invite first if their 7-day invitation has expired, which also proves D2). Read Vercel runtime errors and Sentry for the window. | Owner with operator | Any step fails → rollback below. |
| R5 | Clean-up, **only after the PR B room test is closed** (D4 = A). Deleted: exactly the accounts listed at R0 (r4a, r4b) and the fresh test account of R4 (a), by address and user id. **Never deleted by this plan:** the R4 room-test accounts, that is the teacher « Test R4 Prof » and the learners C and D, and any learner or teacher record. Immediately before the deletion, a fresh read-only count of what will go (Auth users, profiles, queue rows, pending links for those addresses) is taken and shown to the owner for approval; the deletion follows that count, not R0's. Then: delete the Auth users in the dashboard (profiles go with them: `profiles.id` is `ON DELETE CASCADE`), and a counted, separately approved statement removes any queue row left for those addresses (their pending links cascade). Read back zero rows. | Owner; operator for the statement | The fresh count names anything other than the R0 list and the R4 (a) test account created after R0; the PR B room test is still open. |
| R6 | Documentation closeout PR: CURRENT_STATE, SECURITY_RULES (public path, L1 rule, activation mark), WORKFLOWS (invitation and reset), ADR-017 status, this plan's release record. | Operator | — |

**Separate owner step, not part of this plan:** restoring the learners' own e-mail addresses on the R4 test learner files. R5 neither performs it nor waits for it.

**Switch-over.** Before R3 nothing changes for users. Links sent before R3 keep their old format and work as today until they expire. Links sent after R3 use the new page.

**Rollback.**
1. Templates first: paste back the R0 copies. Effective for the next e-mail; no deployment. Links already sent in the new format keep working as long as the code stays.
2. Code second, only if needed: Vercel rollback to the pre-R2 deployment (or a revert PR). New-format links already sent then stop working; those people ask for a new link or invitation.
3. Never roll back the code while the new templates are active.

No database restore exists or is needed.

# Expected modules

- New: `src/app/auth/confirm/page.jsx` (and a small client component), `src/lib/authLinks.mjs` (pure parsing and routing, unit-tested), `supabase/templates/{invite,magic_link,recovery,confirmation}.html`, `scripts/test-email-links.mjs`, `scripts/test-email-links-local.mjs`.
- Changed: `src/app/(auth)/login/page.jsx`, `src/app/inscription-compte/page.jsx`, `src/middleware.js`, `src/lib/sessionProfile.mjs`, `src/lib/sentry-scrub.js`, `src/app/api/admin/invite/route.js`, `supabase/config.toml` (template blocks, and one `additional_redirect_urls` entry for the test application origin), `package.json` (test scripts), `.github/workflows/verify.yml` (one step in the `browser-security` shard), the middleware, navigation and session-profile suites.
- Unchanged: `src/context/AuthContext.jsx`, `src/app/providers.jsx`, `src/app/(auth)/login/callback/route.js`, `src/lib/roleAccess.mjs`, `next.config.mjs`, every migration.

# Owner decisions (answered 2026-11-14)

All five were answered **A** by the owner (Maroine, 2026-11-14), as recommended.

**D1 — A never-activated account that asks for a new password or a sign-in link. Answered: A.** After either link, the account goes to the activation form (name, password; the invited role applied). Covers people whose invitation was used up by a preview or who closed the page before choosing a password. (B, not chosen: only the new-password link does this.)

**D2 — Re-inviting an address whose account exists but was never activated. Answered: A.** The re-invitation sends a sign-in e-mail, so staff's "I re-invited you" always produces a message. (B, not chosen: no e-mail.)

**D3 — A link opened where someone is already signed in. Answered: A.** As decided on 2026-11-14 (« Votre compte est déjà activé », go to the portal), and the screen also names the signed-in address and offers « Ce lien est pour un autre compte ? Me déconnecter et l'utiliser ». (B, not chosen: no second action.)

**D4 — The stranded test accounts r4a and r4b. Answered: A.** Keep them until R4, use them as the Production proof of the never-activated path (re-invite first if their 7-day invitation has expired), then delete them in R5 once the PR B room test is closed. (B, not chosen: delete them now.)

**D5 — After a new password is chosen. Answered: A.** Sign the account out on its other devices. (B, not chosen: leave them signed in.)

The French wording of the screens and the four e-mails above is approved with the plan unless the owner changes it.

# Approval record

- **Owner decisions (Maroine, 2026-11-14, with the architecture task):** the click-to-verify page, the login split with `shouldCreateUser: false`, the neutral used-link wording, the signed-in rule, and that a pending account resetting its password must reach the activation step.
- **Owner answers (Maroine, 2026-11-14, with the ELW-r2 revision task):** D1 = A, D2 = A, D3 = A, D4 = A, D5 = A.
- **Independent review of ELW-r1** at head `b3b63e827d3a6b8857c0662f30e06dbb1ccabb76`: CHANGES REQUIRED. Applied in ELW-r2.
- **Independent re-review of ELW-r2** at head `d5878d953c1b61b6d54ddcd2b90cf0335f4061c6`: CHANGES REQUIRED (B7, B8, N1–N5). Applied in ELW-r3; no new owner decision.
- **Plan approval:** none yet. ELW-r3 awaits re-review of its exact head and the owner's approval. Recorded also in [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md#e-mail-links-that-work--proposed-2026-11-14).

# Review corrections (ELW-r2)

| Finding | Correction |
| --- | --- |
| B1 — the AuthContext sweep is a fourth `apply_pending_role()` caller and defeats a role-based form | Recorded in [current state](#verified-current-state-baseline-9f0c911). Option (a) chosen: the activation mark, with its justification and the four cases, in [section 1](#1-landing-page-authconfirm); sections 2 and 6, security points 6 and 11, invariant 8, local tests 6 and 7. `AuthContext.jsx` stays unchanged. |
| B2 — routing row called `apply_pending_role()` before the form | Routing table of section 1: no mark → `/inscription-compte` with no prior call; unit test asserts it. |
| B3 — Confirm signup template missing | Fourth template and type table in [E-mail templates](#e-mail-templates-exact-text); R0, R3, security point 10, manifest (`confirmation.html`), local test 9; implementer confirmation on the local stack. |
| B4 — Sentry does not strip relative paths | Current state corrected; section 5; `sentry-scrub.js` in the manifest; unit test with a relative `from`/`to` breadcrumb. |
| B5 — rate-limit message discloses an account | Section 3: the neutral sentence for every answer, 429 included; distinct message only without an answer; unit and local parity tests (8). |
| B6 — clean-up precision | R0 records exact addresses and ids; R5 names the room-test accounts never deleted, is gated on the PR B room test, uses a fresh count before deletion; the learner e-mail restore is listed as a separate owner step. |
| N1 — D2 details | Section 4: `emailRedirectTo` `/inscription-compte`, cookie-less implicit client, 502 on failure, no queue id, wording of the two templates; unit test and local tests 11–12. |
| N2 — D5 is server behaviour | Section 1 "D5, exact behaviour", risk 7, local test 3 (failed refresh), R0 reads the token lifetime. |
| N3 — scope of the disclosure rule | "What remains restricted", security decision 2, section 3 "Scope of the disclosure rule", security point 2, invariant 2. |
| N4 — token capture and reload after a connection error | Section 1: token kept in state; the address is cleaned only after Supabase answered; local test 14. |
| N5 — referrer | `Referrer-Policy: no-referrer` response header from the middleware (section 5, security point 8, middleware test). |
| N6 — `loginDestination` sentence | `next` dropped from the landing page; the destination is `loginDestination(role)` only (section 1, security point 3, unit test). |
| N7 — L1 wording for signed-in visitors | Rule L1 in section 1, ADR-017 decision 2. |
| N8 — template `type` choices | Type table in [E-mail templates](#e-mail-templates-exact-text). |
| N9 — R0 additions | R0: sign-up and confirmation settings, token lifetimes, secure password change, blank-name count, fourth template. |
| Test gaps | The local suite runs in CI (`browser-security` shard; `verify.yml` in the manifest); item 1 strengthened (database token check, headless load without a click); reload case 7; B3 case 9; B4 unit case; B5 cases; D2 under default templates case 12. |
| Owner answers | D1–D5 = A recorded here, in risk 6, the decision section, OWNER_DECISIONS and the plans index; conditional wording removed. |

# Review corrections (ELW-r3)

| Finding | Correction |
| --- | --- |
| B7 — activation form dead end for an account that already has a password | Submit order, the `same_password` rule, the failed-name-write retry and the closed French error map in [section 2](#2-activation-page-inscription-compte); the happy-path row of section 1; local tests 15 and 16; R0 lists the blank-name accounts by role. |
| B8 — local tests runnable in CI | "How the suite runs anywhere" in the [test plan](#test-plan): token taken from the e-mail and opened on the suite's own origin; old-format links synthesised (items 10 and 12); the redirect allow-list entry in the manifest; template markers and items 9 and 9b (confirmations on: a recorded private-stack run, acceptance amended); the template paragraph corrected; item 8 uses the local limit. |
| N1 | Security point 6 and invariant 5. |
| N2 | Cooldown after every answered request (sections 3 and 5). |
| N3 | R5 stop condition allows the R4 (a) account. |
| N4 | R0 reads the Production Auth version. |
| N5 | Sign-ups disabled: paragraph after the current-state table; template type table. |

## IMPLEMENTATION CONTRACT

**Scope.** Exactly the design above (D1–D5 = A), on a branch from the then-current `origin/main`, one PR, Tier 3, full CI lane. No migration. No Supabase dashboard or Vercel configuration change by the implementer.

**Prerequisites.** This plan approved by the owner at an exact head after the independent re-review.

**Manifest.** The files under [Expected modules](#expected-modules). A change outside that list, a new API route, a migration, a CSP change or a new dependency is a stop condition.

**Invariants.**
1. L1: no request carrying a link token before a click, on any page.
2. No account disclosure on any application screen or application route response.
3. `shouldCreateUser: false` on every `signInWithOtp`.
4. Destinations come from the stored role through `loginDestination(role)`; the landing page takes no destination parameter; `/auth/confirm` is the only new public path.
5. `apply_pending_role()` is unchanged; the landing page calls it only for an account with the mark. Its four existing callers including the AuthContext sweep, the invitation functions, RLS, grants, the callback route and the existing `redirectTo` values are unchanged.
6. No token, address or parameter in logs, Sentry (relative paths included), speed monitoring or the activity log.
7. Old-format links keep working.
8. The activation form is decided by the activation mark, never by the role.

**Acceptance.** Every item of the [test plan](#test-plan) passes; the local suite passes in CI on the exact head and one author run is recorded in the PR; local test 9b is a recorded private-stack run attached to the PR, not a CI result; `npm run lint` and `npm run build` pass; required CI is green on the exact head.

**Stop conditions.** A flow in the template table cannot be verified by token hash on the local stack; the local stack cannot serve custom templates; a guard or test must be weakened to pass; any need for a database or policy change; any need to change `AuthContext.jsx`; any Production read or write.

**Documentation and status.** In the implementation PR: this plan's implementation record, [plans index](README.md), [FEATURE_INDEX](../FEATURE_INDEX.md). SECURITY_RULES, WORKFLOWS, CURRENT_STATE and the ADR status change at release closeout (R6), not before. Hand off with the fields required by [AGENTS](../../../AGENTS.md#implementation-handoff); the author does not review or release.
