# E-mail links that work — architecture, revision ELW-r1

**Status: PROPOSED (2026-11-14). Not approved, not implemented.** Architecture only: no application code, no migration, no Supabase or Vercel change is made by this plan. **Tier 3** (sign-in, invitation and password paths for every role; Supabase Auth e-mail templates and URL configuration in Production; a new public page). Presence in the [plans index](README.md) is not approval.

Baseline: `origin/main` `9f0c911fa52a32351a4ec79d5d2e00ffa1c3fbd6` (2026-11-14). Source: PR A of the R4 diagnosis of 2026-11-14, findings 1, 2 and 3. Related: [portal readiness PRF-r2](portal-readiness.md) (D11 sign-in rules, D10 origin check), [ADR-011](../decisions/ADR-011-portal-access-model.md), proposed [ADR-017](../decisions/ADR-017-auth-links-verify-on-click.md).

# Owner summary

## What will change

- **Links in our e-mails stop working "by themselves".** Today an invitation link is used up as soon as anything opens it, including the preview WhatsApp makes when the link is pasted in a chat. After this change every link opens a page of ours with one button. Nothing happens until a person presses the button.
- **Three e-mails, three buttons:** « Activer mon compte » (invitation), « Se connecter » (sign-in link), « Continuer » (new password).
- **A real « Mot de passe oublié ? ».** It sends an e-mail that leads to a « Nouveau mot de passe » form. Today that link only sends a sign-in link and never lets the person choose a password.
- **The sign-in link works in any browser.** Today it fails when the e-mail opens in another browser or inside an app (Gmail, WhatsApp), and the login page shows nothing.
- **The login page explains failures in French** instead of staying silent.
- **A link opened a second time** shows: « Ce lien a déjà été utilisé ou a expiré. Si votre compte est déjà activé, connectez-vous. » with « Se connecter » and « Mot de passe oublié ? » (owner decision, 2026-11-14).
- **After the deployment, you change three e-mail templates in Supabase** (exact text in [E-mail templates](#e-mail-templates-exact-text)). Until you do, everything behaves as today.

## What staff/users will be able to do

- An invited person can paste or forward the link, open it on any device, and still activate the account once.
- Anyone with an account can ask for a sign-in link or choose a new password, from any browser.
- A person whose invitation was already used up, and who never chose a password, can finish alone: « Mot de passe oublié ? » leads them back to the activation step ([D1](#owner-decisions-required)).
- A signed-in person who reopens an old link is told « Votre compte est déjà activé » and sent to their space.

## What remains restricted

- Accounts are still created only by an invitation from a director or an admin. The login page never creates an account (PRF-r2 D11, `shouldCreateUser: false`).
- The pages never say whether an address has an account. Both request forms always answer the same sentence.
- A link still works once and still expires. A 'pending' account still has no access to any operational page.
- No role, permission, policy or database function changes.

## UI impact

- New public page `/auth/confirm` (one card, one button, same look as the login page).
- Login page: three clear modes instead of two: password, « Recevoir un lien de connexion », « Mot de passe oublié ? »; a French message when a link failed.
- Activation page `/inscription-compte`: no longer shows the form to someone already activated; neutral wording instead of "expired".
- Three e-mails rewritten in French.

## Database impact

**None.** No migration, no data change by the application. The only data step is the clean-up of the two stranded test accounts (R5), which needs its own approval.

## Important security decisions

1. **A link never verifies on load.** No request carrying the link's token leaves the browser before the button is pressed. This is what stops previews and mail scanners from using the link ([ADR-017](../decisions/ADR-017-auth-links-verify-on-click.md), proposed).
2. **No account disclosure.** Request forms and the used-link page give the same answer whether or not the address has an account.
3. **The new-password form exists only right after its link was verified**, in that same page. There is no standing page where a signed-in session can set a password without the link.
4. **Where a link leads is decided by the application from the account's stored role**, never by the link. The optional `next` is a same-site path checked by the existing `loginDestination`.
5. **The token is in the page address**, as Supabase documents. It is single-use and short-lived, is removed from the address bar on the click, and is already stripped from Sentry and speed monitoring. It does appear in Vercel's request log ([risk 2](#risks--owner-review-points)).

## Risks / owner review points

1. **Two steps, in order.** The code is deployed first (R2), the templates are changed second (R3). In between, and after any template rollback, « Mot de passe oublié ? » sends the old kind of link: it signs the person in on the same browser without the password form. Do R2 and R3 back to back in a quiet hour.
2. **The token appears in Vercel's request log** for `/auth/confirm`. It is useless once used or expired, but an unused one read from the log within its lifetime would open that account. Access to the Vercel project is already owner-only; the plan keeps it that way and adds no log of its own.
3. **E-mail budget.** Anyone can type any address in the two request forms. Supabase limits one e-mail per address per minute and a project total per hour; a determined visitor could use up the hour's budget and delay real invitations. This exists today with the magic-link form. Follow-up option, not in this plan: Supabase Auth CAPTCHA (Turnstile).
4. **Old links.** Invitations and sign-in links sent before R3 keep their old format and keep working as today (including being used up by previews). They expire on their own.
5. **Evidence limit.** The R4 findings (WhatsApp user agent, the two activated test invitations, the PKCE error) were read from Production by the owner's diagnosis and are not re-verified here. The code paths they name were read on the baseline and match.
6. **Five decisions are needed**: see [Owner decisions required](#owner-decisions-required).

---

# Verified current state (baseline `9f0c911`)

| Area | What the code does | Finding |
| --- | --- | --- |
| Invitation e-mail | [invite route](../../../src/app/api/admin/invite/route.js) calls `auth.admin.inviteUserByEmail(email, { redirectTo: <origin>/inscription-compte })`. No template is kept in the repository; [supabase/config.toml](../../../supabase/config.toml) has the template block commented out, so local and (per the diagnosis) Production use Supabase's default `{{ .ConfirmationURL }}`, a `GET /auth/v1/verify` link. | 1: any GET consumes the token. |
| Activation page | [inscription-compte](../../../src/app/inscription-compte/page.jsx) verifies on mount: `verifyOtp` when `token_hash` is present, `setSession` from the `#access_token` fragment, or `exchangeCodeForSession` for `?code=`. Any failure sets phase `expired`. With no token and a session, it shows the form whatever the role. | 1 (the `token_hash` branch also verifies without a click) and 3. |
| Sign-in link | [login page](../../../src/app/(auth)/login/page.jsx): « Mot de passe oublié ? » and « Connexion par lien magique » both switch to the same magic-link mode; `signInWithOtp` with `emailRedirectTo: /login/callback` and `shouldCreateUser: false`. The browser client is PKCE (`@supabase/ssr` 0.5.2 default). An error from Supabase is shown as is, so an unknown address gets a different answer than a known one. | 2, plus account disclosure. |
| Callback | [login/callback](../../../src/app/(auth)/login/callback/route.js) calls `exchangeCodeForSession(code)`; on error it redirects to `/login?error=callback_failed` (or `missing_code`). The login page reads only `returnTo`. | 2: the error is never shown. |
| Password reset | `resetPasswordForEmail` is not called anywhere in `src`; `updateUser({ password })` is called only by the activation form. | 2: no reset exists. |
| Role application | `apply_pending_role()` (latest body: migration 123) sets the queued role for a confirmed, still-pending account and deletes the queue row; it returns NULL and deletes the row when the queue is expired (7 days) or no longer valid. It is called by the activation form, the callback and the password sign-in. | Unchanged. |
| Re-invitation | `portal_security.queue_role_invitation` (123) returns `needsDelivery = false` when the Auth account already has a confirmed e-mail, so the route sends **no e-mail** for a confirmed account that is still pending. | Stranded accounts cannot be re-invited by e-mail ([D2](#owner-decisions-required)). |
| Middleware | [middleware](../../../src/middleware.js) `PUBLIC_PATHS`: `/login`, `/login/callback`, `/inscription`, `/inscription-compte`, `/privacy`, `/unauthorized`, plus `/login/*`. It calls `auth.getUser()` on every request (the visitor's own cookies only). A pending role is redirected to `/unauthorized` on every non-public path. | `/auth/confirm` is not public yet. |
| Monitoring | [sentry-scrub](../../../src/lib/sentry-scrub.js) drops query strings and redacts `token` keys; [rumScrub](../../../src/lib/rumScrub.mjs) strips query and fragment. CSP `connect-src` already allows the Supabase project ([next.config.mjs](../../../next.config.mjs)); `Referrer-Policy: strict-origin-when-cross-origin`. | No CSP change needed. |
| Libraries | `@supabase/supabase-js` and `auth-js` 2.105.4: `verifyOtp({ token_hash, type })` is available. Supabase's [e-mail template guide](https://supabase.com/docs/guides/auth/auth-email-templates) documents `{{ .SiteURL }}`, `{{ .TokenHash }}`, the prefetch problem and the custom-link remedy. | — |

Not verified here (read at R0): the Production templates, Site URL, redirect allow-list, link lifetime, Auth rate limits, and the state of the accounts r4a and r4b.

# Scope and non-goals

In scope: findings 1, 2 and 3; the landing page; the login page split and error display; the activation page corrections; the three templates as repository files and as owner release text; tests; release, rollback and the test-account clean-up.

Out of scope: room and Zoom changes (PR B/C), the shared-address message (PR D), Supabase plan changes, CAPTCHA, any change to roles, RLS, `apply_pending_role` or the invitation functions, an in-app "change my password" setting, the e-mail change and sign-up confirmation templates (sign-up is not used).

# Design

## 1. Landing page `/auth/confirm`

File `src/app/auth/confirm/page.jsx` (outside the `(admin)` group, same visual shell as the login page). Parameters: `token_hash`, `type`, optional `next`.

**Rule L1 — no verification on load.** On load the page only reads its parameters and the visitor's existing local session. It never sends `token_hash` anywhere before the click. A visitor without a session (every preview bot) causes no Auth request at all. The server part of the page does not read the parameters. Page metadata: generic title « English Hills », `robots: noindex`, `referrer: no-referrer`; no third-party resource.

**Accepted `type` values (closed list):** `invite`, `magiclink`, `email` (Supabase's current name for the sign-in link; accepted so either spelling works), `recovery`. Anything else, or a missing or malformed `token_hash` (accepted shape: 1–200 characters of `[A-Za-z0-9_-]`), shows the used-link screen without any call.

**States.**

| State | Shown | Action |
| --- | --- | --- |
| Ready, no session | Title per type and one button: « Activer mon compte » (`invite`), « Se connecter » (`magiclink`/`email`), « Continuer » (`recovery`). | Click → verify (below). |
| Ready, session with an active role | « Votre compte est déjà activé. » and « Continuer vers mon espace » → the role's home. See [D3](#owner-decisions-required) for the second action. | No verification. |
| Ready, session still 'pending' | Same button as "no session". | Click → verify. |
| Verifying | Button disabled, spinner. | — |
| Used or expired | « Ce lien a déjà été utilisé ou a expiré. Si votre compte est déjà activé, connectez-vous. » with « Se connecter » (→ `/login`) and « Mot de passe oublié ? » (→ `/login?mode=reset`). | — |
| Connection problem | « Connexion impossible. Vérifiez votre connexion puis réessayez. » The button stays; the token was not consumed. | Retry. |
| New password (only after a `recovery` verification in this page) | « Nouveau mot de passe » form: password, confirmation, 8 characters minimum (today's rule). | `updateUser({ password })`, then the role's home. |

**Verify on click.**

1. Disable the button; remove the query from the address bar (`history.replaceState`).
2. `signOut({ scope: 'local' })` if a session exists (as the activation page does today, so the inviter's session in the same browser is never mixed with the invitee's).
3. `verifyOtp({ token_hash, type })` with the browser client. This is a POST that needs no PKCE verifier, so it works in any browser.
4. Auth 4xx → used-or-expired screen. Network error, 5xx or 429 → connection-problem screen.
5. On success, read the account's stored role (`profiles.role`, own row) and route:

| Verified type | Stored role 'pending' | Stored role active |
| --- | --- | --- |
| `invite` | `/inscription-compte` (activation form; it applies the queued role on submit, as today) | role home (cannot normally happen) |
| `magiclink` / `email` | `apply_pending_role()`; if a role is applied → `loginDestination(role, next)`; if still pending → `/inscription-compte` ([D1](#owner-decisions-required)) | `loginDestination(role, next)` |
| `recovery` | `/inscription-compte` ([D1](#owner-decisions-required)): the activation form sets name and password and applies the queued role | new-password form in this page; after success, sign out the other sessions ([D5](#owner-decisions-required)) and go to `loginDestination(role, next)` |

`next` is passed only to `loginDestination` ([roleAccess](../../../src/lib/roleAccess.mjs)), which already refuses anything but a same-site path the role may open. The templates do not send `next` (the Supabase `{{ .RedirectTo }}` value is a full URL and is not safely embeddable); a sign-in link therefore lands on the role's home. `returnTo` keeps working for password sign-in.

## 2. Activation page `/inscription-compte`

- **A `token_hash` parameter is no longer verified here.** The page forwards to `/auth/confirm` with the same `token_hash` and `type` (client-side, no Auth call), so an old bookmark or a template mistake cannot bring back verification on load.
- The `#access_token` fragment and `?code=` branches stay, for invitations sent before the template change and for rollback. They do not carry a link token: Supabase has already verified it.
- After the session is known: stored role active → « Votre compte est déjà activé. » and the role's home (finding 3). Stored role 'pending' → the form, as today.
- No session and no token, or a failed old-format exchange → the same used-or-expired screen and wording as the landing page, instead of « expiré ».
- Submit, when `apply_pending_role()` applies nothing and the account is still pending: « Votre invitation n'est plus valide. Demandez au centre de vous réinviter, puis connectez-vous avec le mot de passe que vous venez de choisir. » (replaces today's « Aucun rôle actif… »). The password is kept; the next password sign-in applies the new invitation, as it does today.

## 3. Login page `/login`

- Modes: `password` (default), `link` (« Recevoir un lien de connexion »), `reset` (« Mot de passe oublié ? »). `?mode=reset` and `?mode=link` preselect a mode (closed list).
- « Mot de passe oublié ? » calls `resetPasswordForEmail(email, { redirectTo: <origin>/login/callback })`. « Recevoir un lien de connexion » keeps `signInWithOtp` with `shouldCreateUser: false` and today's `emailRedirectTo`. The redirect values are kept exactly so a template rollback restores today's behaviour.
- **Same answer for every address.** Both forms end on « Si un compte existe pour cette adresse, un e-mail vient de lui être envoyé. Pensez à vérifier vos courriers indésirables. » whatever Supabase answered, except a rate limit (« Trop de tentatives. Réessayez dans quelques minutes. ») and a connection failure. The submit button stays disabled for 60 seconds after a send.
- `?error=` is read from a closed map and never echoed: `callback_failed` and `missing_code` → « Ce lien de connexion n'a pas pu être vérifié. Il a peut-être déjà été utilisé, a expiré, ou a été ouvert dans un autre navigateur. Demandez un nouveau lien. » and the page opens in `link` mode. Unknown values show nothing.
- [login/callback](../../../src/app/(auth)/login/callback/route.js) is unchanged (old links, rollback).

## 4. Invite route

`redirectTo` stays `/inscription-compte` (old template, rollback). If [D2](#owner-decisions-required) = A: when the invitation function answers `needsDelivery = false` with a `userId`, and that account's stored role, read with the caller's own client, is still 'pending', the route sends the sign-in link e-mail to that address (`signInWithOtp`, `shouldCreateUser: false`, an anon client that holds no cookies) so the person receives a working link. An active account gets no e-mail, as today. No other change; the gates, origin check and rate limits of the route stay.

## 5. Middleware and guards

- Add exactly `/auth/confirm` to `PUBLIC_PATHS`. `/auth`, `/auth/confirmx` and `/auth/confirm/x` stay gated. No matcher change.
- [sessionProfile](../../../src/lib/sessionProfile.mjs): the retry screen is not shown on `/auth/confirm` (same treatment as `/login`).
- **Origin guard:** the plan adds no cookie-authenticated state-changing route; verification, reset request and password change go from the browser to Supabase Auth, as sign-in does today. The existing `rejectCrossOrigin` on the invite route is unchanged.
- **Rate limits:** Supabase Auth's own limits apply (verifications per IP, one e-mail per address per minute, e-mails per hour). They are read at R0 and recorded. The application adds the 60-second button cooldown only.
- **CSP:** unchanged.
- **Logs:** no `console` output on these pages; no parameter is sent to Sentry, speed monitoring or the activity log. Tests assert the scrubbers on `/auth/confirm` addresses.

## 6. Pending account that asks for a password or a link

Recommended (D1 = A): a verified link whose account is still pending always ends on the activation form, never on `/unauthorized`. The form sets name and password and applies the queued role. If the invitation has expired, the person keeps the password and is told to ask the centre for a new invitation. `/unauthorized` remains what a pending account sees on any other page.

## E-mail templates (exact text)

Kept in the repository as `supabase/templates/invite.html`, `magic_link.html`, `recovery.html`, wired in `supabase/config.toml` for local tests, and pasted by the owner into the Supabase dashboard at R3. `{{ .SiteURL }}` must have no trailing slash.

**Invite user** — subject: `Votre invitation à l'espace English Hills`

```html
<h2>Bienvenue à English Hills</h2>
<p>Bonjour,</p>
<p>English Hills Language Center vous invite à activer votre compte sur son espace en ligne.</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite">Activer mon compte</a></p>
<p>Ce lien est personnel et ne peut servir qu'une seule fois. S'il ne fonctionne plus, demandez une nouvelle invitation au centre.</p>
<p>Si vous n'attendiez pas ce message, vous pouvez l'ignorer.</p>
<p>English Hills Language Center, Casablanca</p>
```

**Magic Link** — subject: `Votre lien de connexion English Hills`

```html
<h2>Connexion à votre espace English Hills</h2>
<p>Bonjour,</p>
<p>Vous avez demandé un lien pour vous connecter.</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink">Se connecter</a></p>
<p>Ce lien ne peut servir qu'une seule fois. S'il ne fonctionne plus, demandez-en un nouveau depuis la page de connexion.</p>
<p>Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre compte reste protégé.</p>
<p>English Hills Language Center, Casablanca</p>
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
```

The implementer confirms on the local stack that `type=magiclink` verifies a sign-in link requested by the PKCE browser client. If it does not, the Magic Link template uses `type=email` (already accepted by the page) and the plan text is corrected in the implementation PR; this is not a design change.

# Security review points

1. L1 holds for every entry: `/auth/confirm` and `/inscription-compte` send no request containing `token_hash` on load, with or without JavaScript, with or without a session.
2. No account disclosure: identical screen and wording for known, unknown, pending and unconfirmed addresses on both request forms; identical used-or-expired screen for used, expired and invalid tokens.
3. `next` and `returnTo` reach only `loginDestination`; `mode` and `error` are closed lists; nothing from the address is rendered.
4. The new-password form is reachable only through the in-page state set by a successful `recovery` verification; reloading drops it.
5. A link opened in a browser where someone else is signed in never changes that person's account: the page shows the signed-in state first, and a verification always signs the local session out first.
6. A pending account gains nothing: the activation form applies a role only through the unchanged `apply_pending_role()`.
7. `shouldCreateUser: false` stays on every `signInWithOtp` call, including the D2 re-invitation send.
8. The token is absent from Sentry events, speed-monitoring routes, application logs and the activity log; `referrer: no-referrer` on the landing page.
9. Middleware: only the exact path is public; look-alikes stay gated; a pending session on `/auth/confirm` and `/inscription-compte` is not redirected to `/unauthorized`.
10. The template files in the repository contain no `{{ .ConfirmationURL }}` and no `{{ .Token }}`.

# Test plan

**Unit (`npm test`, new `scripts/test-email-links.mjs`).**
- Parameter parsing: accepted types, malformed `token_hash`, unknown `type`, `mode`, `error` map.
- Routing table of [section 1](#1-landing-page-authconfirm) for each type × role (pending, each active role), including a hostile `next` (`//host`, `/\host`, encoded slashes, a path the role may not open).
- Source scan: `/auth/confirm` and `/inscription-compte` call `verifyOtp` only inside the click handler; `resetPasswordForEmail` and `signInWithOtp` appear only in the login page (and the invite route for D2), always with `shouldCreateUser: false` for the latter; templates contain the `/auth/confirm?token_hash=` link and no `ConfirmationURL`.
- Scrubbers: a `/auth/confirm?token_hash=…` address loses its query in `sentry-scrub` and `rumScrub`.

**Middleware and navigation (`npm run test:middleware`, `npm run test:navigation`, `scripts/test-session-profile.mjs`, `scripts/test-middleware-unavailable.mjs`).**
- `/auth/confirm` answers 200 without a session, with a pending session and with each role; `/auth`, `/auth/confirmx`, `/auth/confirm/x` are gated; the existing callback cases still pass.

**Local Supabase with the three custom templates (new `scripts/test-email-links-local.mjs`, browser-driven, local mail catcher, synthetic addresses, private stack per the repository recipe).**
1. Invitation: read the link from the mail catcher; `curl` it twice (plain GET, WhatsApp user agent); the Auth log shows no verification; then open and click → activation form → account active. **The link still works after the preview.**
2. Second browser: request a sign-in link in browser context A, open it in a fresh context B → signed in.
3. Recovery end to end: request, open in a fresh context, set a new password, old password refused, new password accepted, other session signed out (D5).
4. Reopened link (each type) → used-or-expired screen; no Auth error text shown.
5. Signed-in active user opens an invitation link → « Votre compte est déjà activé »; the invitation is still usable afterwards.
6. Pending account (confirmed, no password): recovery → activation form → role applied; with an expired queue → the "no longer valid" message, account still pending, `/unauthorized` on other pages.
7. Unknown address in both request forms → same screen as a known one; no account created.
8. Old-format links: with the default templates restored, an invitation (fragment) and a same-browser sign-in link (code) still work; a cross-browser one shows the new French message on `/login`.
9. D2 (if A): re-inviting a confirmed pending account produces one sign-in e-mail; re-inviting an active account produces none.
10. `/inscription-compte?token_hash=…` forwards to `/auth/confirm` without any Auth call.

Required CI is the full lane (source change). No database suite changes.

# Release steps

Each step needs the owner's explicit approval; R0 and R3 are done by the owner in the Supabase dashboard.

| Step | What | Who | Stop if |
| --- | --- | --- | --- |
| R0 | Read-only. Dashboard: copy the three current templates and subjects (rollback text), Site URL, redirect allow-list, e-mail link lifetime, Auth rate limits, sender. Read-only query: state of r4a and r4b (Auth confirmed, profile role, queue row and expiry, pending links). | Owner; operator for the query | Site URL is not `https://admin.english-hills.com`; the allow-list lacks `/login/callback` or `/inscription-compte` (fix first, separately approved). |
| R1 | Independent review READY on the implementation PR's exact head; owner merge approval. | Owner | — |
| R2 | Merge → Vercel deploys. Check: `/auth/confirm` answers 200 signed out; a same-browser sign-in link and password sign-in still work; `/login?error=callback_failed` shows the message. | Operator | Any sign-in regression → Vercel rollback to the previous deployment. |
| R3 | Owner pastes the three templates and subjects (Invite user, Magic Link, Reset Password); confirms Site URL has no trailing slash; keeps the existing allow-list entries. No allow-list entry is needed for `/auth/confirm` (it is built from Site URL). | Owner | — |
| R4 | Production proof with owner-controlled test addresses: (a) a fresh invitation pasted into WhatsApp, preview shown, then tapped → activation works; (b) a sign-in link opened in another browser; (c) « Mot de passe oublié ? » end to end; (d) a reopened link → neutral message; (e) r4a through « Mot de passe oublié ? » and r4b through « Recevoir un lien de connexion » reach the activation step ([D4](#owner-decisions-required)). Read Vercel runtime errors and Sentry for the window. | Owner with operator | Any step fails → rollback below. |
| R5 | Clean-up of r4a, r4b and the R4 test account, per [D4](#owner-decisions-required): delete the Auth users in the dashboard (profiles go with them: `profiles.id` is `ON DELETE CASCADE`), then a counted, separately approved statement removes any queue row left for those addresses (their pending links cascade). Read back zero rows. | Owner; operator for the statement | Counts differ from R0. |
| R6 | Documentation closeout PR: CURRENT_STATE, SECURITY_RULES (public path, L1 rule), WORKFLOWS (invitation and reset), ADR-017 status, this plan's release record. | Operator | — |

**Switch-over.** Before R3 nothing changes for users. Links sent before R3 keep their old format and work as today until they expire. Links sent after R3 use the new page.

**Rollback.**
1. Templates first: paste back the R0 copies. Effective for the next e-mail; no deployment. Links already sent in the new format keep working as long as the code stays.
2. Code second, only if needed: Vercel rollback to the pre-R2 deployment (or a revert PR). New-format links already sent then stop working; those people ask for a new link or invitation.
3. Never roll back the code while the new templates are active.

No database restore exists or is needed.

# Expected modules

- New: `src/app/auth/confirm/page.jsx` (and a small client component), `src/lib/authLinks.mjs` (pure parsing and routing, unit-tested), `supabase/templates/{invite,magic_link,recovery}.html`, `scripts/test-email-links.mjs`, `scripts/test-email-links-local.mjs`.
- Changed: `src/app/(auth)/login/page.jsx`, `src/app/inscription-compte/page.jsx`, `src/middleware.js`, `src/lib/sessionProfile.mjs`, `src/app/api/admin/invite/route.js` (D2 only), `supabase/config.toml` (template blocks), `package.json` (test script), the middleware, navigation and session-profile suites.
- Unchanged: `src/app/(auth)/login/callback/route.js`, `src/lib/roleAccess.mjs`, `next.config.mjs`, every migration.

# Owner decisions required

**D1 — A 'pending' account that asks for a new password or a sign-in link.** *Blocking.*
- **A (recommended):** after either link, a still-pending account goes to the activation form (name, password, role applied). Covers people whose invitation was used up by a preview or who closed the page before choosing a password.
- **B:** only the new-password link does this; a sign-in link for a pending account ends on « Compte en attente d'activation ».

**D2 — Re-inviting an address whose account exists but was never activated.** *Blocking.* Today no e-mail is sent in that case.
- **A (recommended):** the re-invitation sends the sign-in link e-mail, so staff's "I re-invited you" always produces a message.
- **B:** no e-mail; staff tell the person to use « Mot de passe oublié ? ».

**D3 — A link opened where someone is already signed in.** *Blocking.* You decided: say « Votre compte est déjà activé » and go to the portal.
- **A (recommended):** as decided, and the screen also names the signed-in address and offers a small « Ce lien est pour un autre compte ? Me déconnecter et l'utiliser ». Without it, a director who opens an invitee's link in their own browser cannot use it.
- **B:** exactly as decided, no second action.

**D4 — The stranded test accounts r4a and r4b.** *Not blocking for implementation; needed before R4.*
- **A (recommended):** keep them until R4, use them as the Production proof of the pending path (re-invite first if their 7-day invitation has expired), then delete them in R5 unless PR B/C still needs them.
- **B:** delete them now, in a separately approved step, and prove the pending path with a new test address.

**D5 — After a new password is chosen.** *Blocking.*
- **A (recommended):** sign the account out on its other devices.
- **B:** leave other devices signed in.

The French wording of the screens and the three e-mails above is approved with the plan unless you change it.

# Approval record

None yet. Owner decision already recorded (2026-11-14): the neutral used-link wording and the signed-in rule, in [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md#e-mail-links-that-work--proposed-2026-11-14).

## IMPLEMENTATION CONTRACT

**Scope.** Exactly the design above with the owner's answers to D1–D5, on a branch from the then-current `origin/main`, one PR, Tier 3, full CI lane. No migration. No Supabase dashboard or Vercel configuration change by the implementer.

**Prerequisites.** This plan approved at an exact head, with D1, D2, D3 and D5 answered and recorded here and in OWNER_DECISIONS.

**Manifest.** The files under [Expected modules](#expected-modules). A change outside that list, a new API route, a migration, a CSP change or a new dependency is a stop condition.

**Invariants.**
1. L1: no request carrying a link token before a click, on any page.
2. No account disclosure on any screen or response.
3. `shouldCreateUser: false` on every `signInWithOtp`.
4. Destinations come from the stored role through `loginDestination`; `/auth/confirm` is the only new public path.
5. `apply_pending_role`, the invitation functions, RLS, grants, the callback route and the `redirectTo` values are unchanged.
6. No token, address or parameter in logs, Sentry, speed monitoring or the activity log.
7. Old-format links keep working.

**Acceptance.** Every item of the [test plan](#test-plan) passes; local items 1, 2 and 3 are recorded with their evidence in the PR; `npm run lint` and `npm run build` pass; required CI is green on the exact head.

**Stop conditions.** `verifyOtp` with `token_hash` fails on the local stack for a type in both spellings; the local stack cannot serve custom templates; a guard or test must be weakened to pass; any need for a database or policy change; any Production read or write.

**Documentation and status.** In the implementation PR: this plan's implementation record, [plans index](README.md), [FEATURE_INDEX](../FEATURE_INDEX.md). SECURITY_RULES, WORKFLOWS, CURRENT_STATE and the ADR status change at release closeout (R6), not before. Hand off with the fields required by [AGENTS](../../../AGENTS.md#implementation-handoff); the author does not review or release.
