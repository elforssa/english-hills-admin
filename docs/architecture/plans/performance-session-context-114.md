# Session context and connection resilience — migration 114, provisional (architecture, revision S-r1)

**Status: PROPOSED — architecture only, awaiting owner review. Not implemented, not approved for implementation.** Tier 3 (authentication, roles, client authorization gate). This is Phase 2 of the performance plan P-r1 (PR #119); evidence: [performance audit](https://github.com/elforssa/english-hills-admin/blob/perf/phase0-measurement/docs/architecture/evidence/performance-audit-2026-10-08.md). Baseline: `origin/main` `857b159746b78233578790bdb999878cd113e088`, migration ledger 001–112.

**Migration number is provisional.** This design was first written as migration 113. Production has since taken 113 (Premium retirement Release A, PR #125), so this revision calls it 114. The real number is whichever is next free in `supabase/migrations` on `origin/main` when the migration file is written; the Premium retirement plan also names 114 provisionally for its Release B. Renumbering changes nothing in the design.

# Owner summary

## What will change

Each full page load today makes four calls, one after another, before anything is drawn:

1. `getUser`;
2. `getUser` again (a duplicate);
3. the profile read;
4. `apply_pending_role`.

That costs about 1 s on the centre's link. The proposal replaces them with **one** call, a new database function `get_session_context()` that returns the signed-in person's stored profile and role. It applies a queued invitation using the **unchanged** current rule.

The page frame (sidebar outline and loading skeleton) draws immediately, but no page content or role-specific menu appears until the role has been confirmed.

A failed or slow call no longer signs staff out or tells them they are unauthorized. They see a French *connection problem* screen that retries on its own and offers **Réessayer maintenant**.

## What staff/users will be able to do

Everything they can do today, sooner. On a flaky connection they stay on their page and it recovers when the network returns.

## What remains restricted

Everything:

- **Middleware** keeps checking the session with Auth and reading the stored role on every navigation.
- **Database permissions** are unchanged: RLS, RPC role checks and grants.
- **Invitation rule:** the new function contains no new role logic and calls the existing `apply_pending_role` unchanged. Who may activate which role, and when, is identical, as proven below.

## UI impact

- Faster first paint.
- A skeleton instead of a blank page while the role is being confirmed.
- The new connection-problem and *session could not be verified* screens (French copy below).

## Database impact

Migration 114 adds one function, executable by `authenticated` only. There is no table, column, policy or data change, and no change to any existing function.

## Important security decisions

1. **Identical pending-role rule.** The new function **delegates** to the unchanged `apply_pending_role()` for every existing profile, including its global role-change lock and its cleanup of stale invitations for non-pending accounts. A shortcut such as "only call it for pending users" is **rejected**, because it is measurably not identical (156 of 424 scenarios differ).
2. **Never fail open.** A failure can never produce a role the server did not return for this user in this session, and nothing role-specific renders before confirmation. See the [proof](#5-failure-states-and-the-no-fail-open-proof).
3. **No browser `getUser` call.** The browser stops calling `getUser`. Server-side session verification remains in middleware on every navigation, and PostgREST verifies the token on every data call, as today.

## Risks / owner review points

- **D1:** on a transient failure during a *background* refresh (tab focus or user-update events), keep the last role the server confirmed for the same user instead of hiding the page. This matches today's behavior, where background refreshes are partly ignored. Recommended: A.
- **D2:** add diagnostic connection-failure events to Sentry (errors-only, scrubbed). Recommended: A.
- The migration is applied **before** the app deploy, because the old app does not use the new function.

## Verified current state

### Client path

- [AuthContext.jsx](../../../src/context/AuthContext.jsx) `loadSession()` calls `getUser()`, then reads the profile with `select('*')`. If the profile is missing it calls `recover_missing_profile()` and reads again. It then calls `apply_pending_role()`, ignoring errors, and sets `role = applied ?? profile.role ?? 'pending'`.
- `onAuthStateChange('SIGNED_IN')` fires at start-up and runs a second, silent `loadSession`, which discards the first `getUser`.
- `TOKEN_REFRESHED` is ignored.
- `SIGNED_OUT` clears state.

### Current failure behavior (measured)

| Failure | Result |
| --- | --- |
| `getUser` network failure | User is treated as signed out and redirected to `/login`. |
| Profile read failure | Recovery, then a re-read that also fails; role becomes `pending` and the user is redirected to `/unauthorized`. |
| `apply_pending_role` failure | Ignored. |

[ProtectedRoute.jsx](../../../src/components/ProtectedRoute.jsx) renders nothing while `isLoading`, and it decides redirects *before* rendering children. [Middleware](../../../src/middleware.js) runs `auth.getUser()` plus a `profiles.role` read on every non-API navigation and gates every role.

### Database

- `apply_pending_role()` is defined in [042](../../../supabase/migrations/042_batch2_role_management.sql) and was not modified later. [077](../../../supabase/migrations/077_receptionist_role_and_operational_access.sql) adds receptionist to `role_security.assert_transition` and requires a director to issue a receptionist invitation. The function:
  - locks the `director_guard` singleton;
  - locks the caller's profile;
  - requires a confirmed Auth email equal to the profile email after trimming and lower-casing;
  - consumes a matching invitation only for a `pending` profile with a valid, unexpired, identity-bound invitation from an issuer that is currently authorized;
  - **deletes** an invitation that cannot apply, which includes every non-pending caller;
  - audits activation.
- `recover_missing_profile()` ([061](../../../supabase/migrations/061_recover_missing_profile.sql)) inserts a `pending` profile from `auth.users`.

## Scope and non-goals

**In scope:**

- migration 114, `public.get_session_context()`;
- the `AuthContext` rewrite;
- the shell skeleton and resolution states;
- the connection-problem UI;
- diagnostic events (if D2 = A);
- tests.

**Out of scope:**

- middleware (unchanged; `getClaims()` was deferred by the owner);
- RLS (migration 115);
- any change to role rules, invitations or `apply_pending_role`;
- service-worker or offline caching;
- the deterministic-`40001` outcome.

## Design

### 1. Migration 114 — `public.get_session_context()`

```sql
create function public.get_session_context() returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, pg_temp
as $$
declare p public.profiles%rowtype; u record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  -- Same safety net the browser runs today when the profile row is missing.
  if not exists (select 1 from public.profiles where id = auth.uid()) then
    perform public.recover_missing_profile();
  end if;
  -- Unchanged pending-role rule for every existing profile. A failure keeps the
  -- stored role, exactly as today's browser ignores a failed call.
  if exists (select 1 from public.profiles where id = auth.uid()) then
    begin
      perform public.apply_pending_role();
    exception when others then
      null;
    end;
  end if;
  select * into p from public.profiles where id = auth.uid();
  select id, email, created_at, raw_user_meta_data->>'full_name' as meta_name
    into u from auth.users where id = auth.uid();
  return jsonb_build_object(
    'user_id', u.id, 'email', u.email,
    'role', coalesce(p.role, 'pending'),
    'full_name', coalesce(nullif(p.full_name, ''), u.meta_name, ''),
    'linked_student_id', p.linked_student_id, 'linked_teacher_id', p.linked_teacher_id,
    'phone', p.phone, 'created_date', coalesce(p.created_at, u.created_at));
end $$;
revoke all on function public.get_session_context() from public, anon, authenticated, service_role;
grant execute on function public.get_session_context() to authenticated;
```

The function returns only fields today's `AuthContext` already exposes, for the caller's own row. It raises no `40001` itself, and a `40001` from the nested call is caught, so it cannot enter the PostgREST in-process retry loop described in the evidence.

The exception block runs the delegated call as a subtransaction: a failure rolls back that call's effects, just as a failed separate RPC does today. Row locks taken by a successful call last to commit, as today.

### 2. Equivalence with the current rule — proof

**Construction.** For any caller with a profile, the new function performs exactly the statements of today's browser sequence:

1. `recover_missing_profile()` if the profile is missing;
2. then `apply_pending_role()`, with its error ignored;
3. then a read of the resulting profile.

The only differences are that the steps now run in one transaction instead of three and that the profile is read after the apply rather than before. `apply_pending_role` changes only `role`, and today's client overrides the role with the applied value, so the outcome is the same.

**Experiment** (local, ledger 112, single transaction, always rolled back). A prototype with the body above was compared with an emulation of today's browser sequence. Both ran as `authenticated` with the caller's JWT claims, from an identical savepoint per scenario. The matrix had 424 scenarios:

- **Caller state (8):** director, admin, receptionist, teacher, parent, student, pending, missing profile.
- **Invitation state (14):**
  - none;
  - from a director for teacher, receptionist, director or admin;
  - from an admin for parent or teacher;
  - from an admin for admin or receptionist (not permitted);
  - expired;
  - no inviter;
  - bound to another user;
  - bound to the caller;
  - issuer demoted after inviting.
- **Identity state (4):** normal, unconfirmed Auth email, profile email differing only in case and spaces, profile email different.

**Compared per scenario:**

- the returned role and whether a profile was found;
- the caller's full profile row;
- invitation rows for the email;
- new audit rows (action, table, target, columns, after-image);
- the director count.

**Result: 0 mismatches in 424 scenarios.**

- 35 scenarios change the role. All are a pending or profileless caller with a valid invitation and a confirmed, matching email.
- 221 scenarios delete an invitation that cannot apply, identically on both paths. This includes every non-pending role.
- Unconfirmed or mismatched emails, non-permitted issuer and role pairs, expired invitations, invitations without an inviter, invitations bound to another user and invitations from a demoted issuer never activate.

**Sensitivity.** The same harness, run against the shortcut "call `apply_pending_role` only when the stored role is `pending`", reports **156 mismatches**: stale invitations are no longer deleted for non-pending accounts. The harness detects real differences, and the shortcut is not equivalent. The implementation turns this experiment into a permanent local test, `scripts/test-session-context-local.mjs`.

### 3. Client: `AuthContext` and resolution states

`loadSession()` becomes:

1. Call `supabase.auth.getSession()`. This reads cookies locally, and refreshes the token over the network only if it has expired.
2. With no session, the state is `signedOut`.
3. Otherwise call `rpc('get_session_context')`.
4. **Validate the payload:**
   - `user_id` equals the session user's id;
   - `role` is a string;
   - the payload is otherwise structurally complete.
5. A valid payload gives `ready`. An invalid one gives `failed`.

One request runs at a time. The start-up `SIGNED_IN` event is coalesced with the initial load (same user, load in flight), so the duplicate disappears.

The public surface keeps `{ user, role, isLoading, logout, reload }`, with the same `user` fields. It adds `status ∈ {resolving, ready, unavailable, failed, signedOut}` and `retry()`. `isLoading` is true unless the status is `ready` or `signedOut`.

**Failure classification** reuses [queryRetry.mjs](https://github.com/elforssa/english-hills-admin/blob/perf/no-redundant-reads/src/lib/queryRetry.mjs) (PR B) and the RCC-A2 convention:

| Response | Class | Next state |
| --- | --- | --- |
| No HTTP response: offline, DNS, TLS, reset or timeout (15 s abort) | transient | `unavailable` |
| HTTP 5xx, 408, 429, or a gateway error without SQLSTATE/PGRST | transient | `unavailable` |
| Token refresh fails because the network failed (`AuthRetryableFetchError`) | transient | `unavailable` |
| Token refresh rejected (`invalid_grant`, refresh token revoked) | definitive | `signedOut` |
| `42501 Authentication required`, `PGRST301`/JWT invalid after one forced refresh | definitive | `signedOut` |
| Any other SQLSTATE or PGRST code, malformed payload, user-id mismatch | unexpected | `failed` |

**Retry:**

- **Backoff:** 0.5, 1, 2, 4 and 8 s, then every 15 s while the tab is visible.
- **Immediate retry:** on the browser `online` event, on `visibilitychange` to visible, and on **Réessayer maintenant**.
- **Bounded:** at most one request in flight.

### 4. Rendering rules (the client gate)

| Status | Shell | Children | Role-specific navigation | Data queries |
| --- | --- | --- | --- | --- |
| `resolving` | skeleton (neutral sidebar outline) | **no** | **no** | **none** (no page mounted; CRM hooks need `user` and `role`) |
| `unavailable` | connection-problem screen | **no** | **no** | none |
| `failed` | *session could not be verified* screen | **no** | **no** | none |
| `signedOut` | — | **no** | **no** | none; redirect to `/login?returnTo=…` |
| `ready` | full shell | only after the unchanged `ProtectedRoute` decision for (role, path) | yes, for the confirmed role | as today |

`ProtectedRoute`'s role and path rules are not edited. Only the non-ready branches render the skeleton or status screens instead of `null`.

**French copy:**

| Screen | Title | Body | Buttons |
| --- | --- | --- | --- |
| Connection problem | **Problème de connexion** | « Impossible de joindre le serveur pour le moment. Nouvelle tentative dans *n* s… » | **Réessayer maintenant** |
| Offline | **Vous êtes hors ligne** | « La page reprendra automatiquement dès le retour de la connexion. » | — |
| Unexpected failure | **Votre session n’a pas pu être vérifiée** | « Réessayez. Si le problème persiste, déconnectez-vous puis reconnectez-vous. » | **Réessayer**, **Se déconnecter** |

### 5. Failure states and the no-fail-open proof

**Definition.** The client fails open if any of the following happens:

- (a) page content or role-specific navigation renders for a role that `get_session_context` did not return for this user in this browser session;
- (b) a data query is enabled under such a role;
- (c) any server-side check accepts something it rejects today.

**(c) is impossible by construction:**

- middleware, RLS, grants and every RPC are unchanged;
- the new function reads only the caller's own row;
- it executes only functions the caller can already execute (`apply_pending_role` and `recover_missing_profile` are already granted to `authenticated`);
- it adds no grant.

**(a) and (b).** A role is set in exactly one place: the transition to `ready`, from a validated payload whose `user_id` equals the session user. Every other transition leads to `resolving`, `unavailable`, `failed` or `signedOut`, and each of those has a `null` role and renders no children (table above). Children mount only inside `ready` and only after the unchanged `ProtectedRoute` decision. Data queries live in children or require `user && role` (`useCrmRead`). Exhaustively:

| Failure point | Possible outcomes | Role exposed |
| --- | --- | --- |
| Initial `getSession` | none or expired-unrefreshable → `signedOut`; network → `unavailable` | none |
| Initial RPC | success → `ready(server role)`; transient → `unavailable`; definitive → `signedOut`; unexpected or mismatch → `failed` | server's only |
| Retry success | `ready(server role)` | server's only |
| Different user signs in (another tab) | identity change → clear query cache → `resolving` | none until confirmed |
| `SIGNED_OUT` | clear cache → `signedOut` | none |
| Background refresh, same user (`SIGNED_IN`/`USER_UPDATED`) | success → `ready(new server role)`. **D1** transient failure → keep last server-confirmed role for **this** user, no elevation; definitive → `signedOut`; unexpected → `failed` | last server-confirmed, never higher |
| Malformed or unknown role string | a recognized role continues; an unrecognized role passes to the unchanged `ProtectedRoute`, which sends it to `/unauthorized` as today | none granted |

**Before vs after.** Today a transient failure fails *closed but misleading*: it shows `/login` or `/unauthorized`. After this change it fails *closed and truthful*. In neither design does a failure grant access.

**D1 rationale.** Today a background refresh failure clears the user and forces a sign-out, and `TOKEN_REFRESHED` never re-reads the role at all. Keeping the last server-confirmed role for the same user is no weaker than today. The server still enforces any demotion on the next request.

### 6. Diagnostics (D2)

When the state becomes `unavailable`, send at most one scrubbed Sentry event per page load. It carries:

- `kind` (offline, timeout, reset/DNS/TLS, http_5xx);
- the target host class (`supabase` or `self`);
- `navigator.onLine` and `navigator.connection.effectiveType` when available;
- the elapsed time;
- the attempt count.

It carries no URL query, no identity and no payload. This shows whether requests left the browser, and it complements the centre-computer network checklist. Navigation failures that occur before any app code runs (`ERR_…` browser pages) remain outside what the app can observe.

## Migration, test, rollout and recovery

**Migration** `114_session_context.sql` is additive. It creates the function and sets its grants. Nothing else changes.

**Local tests (required):**

1. `scripts/test-session-context-local.mjs`:
   - the permanent equivalence harness (424 scenarios, zero mismatches);
   - the sensitivity check proving the shortcut is detected;
   - ACL: `anon` and `service_role` are denied, `authenticated` is allowed;
   - `auth.uid()` null → 42501;
   - profileless caller → `pending` profile created;
   - no `40001` escapes.
2. **Browser (Chromium + WebKit),** extending the Phase-0 probes:
   - sustained `get_session_context` failure → connection screen, URL unchanged, no children, no `/login` or `/unauthorized`;
   - recovery → page renders;
   - token-refresh network failure → `unavailable`;
   - a revoked refresh token → `/login`;
   - malformed payload or user-id mismatch → `failed` screen with no children;
   - `pending` → `/unauthorized`;
   - every role's existing route matrix is unchanged.
3. `npm run test:middleware` is unchanged and must pass. The "disallowed children never render" DOM test is extended to the new non-ready states.
4. **Performance:** `npm run perf:baseline` shows **1** session call before the heading, and the *center* profile improves by about one second.

**Rollout:** apply 114 (it is additive; the old app is unaffected), verify the ACL and a director-scoped probe in a rolled-back transaction, then deploy the app. **Rollback:** revert the app; the old client never calls the function. Drop the function later only through a forward migration, if desired.

## Owner decisions required

- **D1 — background refresh failure.**
  - **A:** keep the last server-confirmed role for the same user. Recommended.
  - **B:** switch to the connection screen. This hides the page and loses unsaved form input on every focus glitch.
  - **Blocking:** yes, for implementation.
- **D2 — diagnostic events.**
  - **A:** send scrubbed, rate-limited Sentry events for connection failures. Recommended.
  - **B:** no events. The centre-computer issue then stays unobservable from the app.
  - **Blocking:** no.

## IMPLEMENTATION CONTRACT

- **Prerequisites:**
  - owner approval of this revision and D1/D2;
  - PR B merged (retry classifier) or its classifier vendored identically;
  - the latest migration rechecked on `origin/main` before naming the file `114_…`.
- **Manifest:**
  - `supabase/migrations/114_session_context.sql`;
  - `src/context/AuthContext.jsx`;
  - `src/components/ProtectedRoute.jsx` (non-ready rendering only);
  - a new `src/components/layout/SessionStatus.jsx` (skeleton and status screens);
  - `src/app/(admin)/layout.jsx` (shell during resolution);
  - tests listed above;
  - updates to CURRENT_STATE, SECURITY_RULES and ARCHITECTURE at release.
- **Invariants:**
  - `apply_pending_role`, `recover_missing_profile`, middleware, RLS and grants are unchanged apart from the new function's grant;
  - roles come only from a validated `get_session_context` payload;
  - no children or role navigation render outside `ready`;
  - no `40001` escapes the function;
  - French copy as specified.
- **Stop conditions:**
  - any equivalence mismatch;
  - any non-ready state rendering children;
  - any need to modify an existing function or policy;
  - any test weakened.
- **Status reporting:** per [AGENTS](../../../AGENTS.md#implementation-handoff); Tier 3 independent review of the exact head SHA; separate release approval.
