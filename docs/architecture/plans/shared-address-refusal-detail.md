# Shared-address refusal detail (PR D of the R4 diagnosis)

Revision **SAR-r1**, 2026-11-17. **PROPOSED — awaiting owner approval; architecture only.** Nothing here is implemented. Tier 3 (see [risk tier](#risk-tier)).

Baseline: `origin/main` `b581d95` (2026-11-17). Source: PR D of the R4 diagnosis of 2026-11-14, listed as out of scope in [e-mail links that work](email-links-that-work.md) and in [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md#e-mail-links-that-work--released-2026-11-14). Related: [portal readiness PRF-r2](portal-readiness.md) (D3 invitation refusals), [ADR-011](../decisions/ADR-011-portal-access-model.md).

**Naming.** "PR D" is also used by the [online classroom tools plan](online-classroom-tools.md) for the raise-hand button. To avoid the clash this plan is called **SAR**. The task brief pointed at OL-r6: OL-r6 has no PR D; the item comes from the R4 diagnosis recorded with ELW.

# Owner summary

## What will change

When the invitation form refuses an address because it already sits on another file, it says **which file** and **what to do**, in French. Today it says only the rule (for example « Cette adresse est l’adresse parent d’un autre apprenant — corrigez les fiches avant d’inviter. ») without naming the learner, so staff cannot find the file to correct.

## What staff/users will be able to do

Director and admin, in « Inviter un utilisateur » (Paramètres), after « Vérifier les apprenants de cette adresse »:

- see the name of each file that holds the address, which field holds it (adresse parent / adresse de l’apprenant / fiche enseignant / compte existant), with « Ouvrir la fiche » for learner and teacher files;
- see one « Que faire » line: use the other file (invite as Parent and tick the child), or correct the e-mail on the wrong file, then check again.

## What remains restricted

- Only director and admin can invite (PRF-r2 Q4 = A). Nobody else, including reception, sees this detail; non-managers are refused before any lookup, as today.
- Only names and the field are shown. No other family's e-mail, phone, group, payment or link is shown.
- The rules themselves do not change: the same addresses are refused as today. Nothing is unlocked.

## UI impact

The red refusal box in the invitation form gains a short list (at most 10 names, then « et N autres ») and a « Que faire » line. No other screen changes.

## Database impact

One forward migration, `129_shared_address_refusal_detail.sql`, re-creates the read-only function `public.preview_family_invitation` from its 123 body (unchanged since), adding a `conflicts` list to its answer and one refusal it does not check today (an account of the other family role, Q2). No table, policy, grant or data change. The invitation, link and activation functions are not touched.

## Important security decisions

- The names travel only in the preview's answer to a director or admin. Error messages stay exactly as they are, so no name reaches database error logs, Sentry, the invite API's answer or the browser console.
- The lookup uses the same address normalisation and the same rows as the refusal itself (one rule, server side).

## Risks / owner review points

1. **The exact refusal of 2026-11-14 is not in the repository.** A refusal writes nothing (the preview is read-only; a refused invitation rolls back). The design covers all four reasons that fit "the address belonged to another learner's file" (below), so this is not blocking. If you want it confirmed: tell us the message staff saw, or approve a read-only R0 (see [release](#release-each-step-separately-approved)).
2. A placeholder address on many files shows 10 names and a count, not all of them.
3. Q1–Q3 below.

# Verified current state (baseline `b581d95`)

| Area | What the code does |
| --- | --- |
| Refusal source | `portal_security.check_family_address` ([123](../../../supabase/migrations/123_portal_readiness.sql), never re-created; latest migration is 128). Order: invalid role/e-mail, centre domain, `staff_address` (a director/admin/receptionist/teacher profile), `teacher_address` (any teacher record, archived included), `no_match`, `shared_address` (more than 4 parent matches or more than 1 student match), `address_is_parent` (student invitation whose address is another active learner's `parent_email`). Each raises `portal_security.fail(reason, code, message)`: a fixed French message, hint `portal.<reason>`, no names. |
| Preview | `public.preview_family_invitation(p_email, p_role)` calls `require_manager()` first (re-review N4), computes `matches`, then catches a `portal.*` refusal into `refusal: {reason, message}`. It already returns `matches` (names, groups) for `shared_address`, but the form hides them when refused. For `address_is_parent`, `teacher_address` and `staff_address` the conflicting record is never returned. |
| Form | [settings/page.jsx](../../../src/app/(admin)/settings/page.jsx) `InviteUserForm`: family roles must run the preview; a refusal shows `preview.refusal.message` in a red box and blocks « Inviter ». |
| Existing account of the other family role | Not checked by the preview. `prepare_family_invitation` → `queue_role_invitation` raises `23514` « Use explicit role management for an existing account »; the [invite route](../../../src/app/api/admin/invite/route.js) answers « Ce compte existe déjà ou a changé. Utilisez la gestion des rôles puis réessayez. » without naming the account. |
| Later links | `public.link_family_student` uses the same checks; no screen calls it today (tests only). Unchanged. |
| Who may call | `require_manager()`: director, admin. Reception reads « Comptes famille » on the learner file but cannot invite. |

# Scope

In scope: the four refusals `address_is_parent`, `shared_address`, `teacher_address`, `staff_address`, plus the existing-account case of Q2, in the preview and the invitation form; tests; release.

Out of scope: changing any refusal rule or limit; `prepare_family_invitation`, `prepare_teacher_invitation`, `link_family_student`, `queue_role_invitation`, `apply_pending_role`; the orphan-Auth-account case (PR #140 backlog note); the teacher invitation's `teacher_mismatch`; data clean-up of shared addresses; anything under `src/components/online/*` and the room.

# Design

## 1. Migration 129 — `preview_family_invitation` with `conflicts`

Re-created from the 123 body with `create or replace`, same signature, `security definer`, `search_path = pg_catalog, pg_temp`, same grants (re-asserted: as 123: revoked from `public`, `anon`, `service_role`; execute to `authenticated`). `require_manager()` stays the first statement.

After the existing check, when `refusal.reason` is one of the five below, the answer adds:

```text
conflicts: [{ kind, id, full_name, field, archived, role }]   -- at most 10, ordered by full_name, id
conflicts_total: integer
```

| Reason | `conflicts` rows (same predicate as the refusal) |
| --- | --- |
| `address_is_parent` | active learners (`deleted_at is null`) with `norm_email(parent_email) = address`, other than the single student match; `kind 'student'`, `field 'parent_email'` |
| `shared_address` | the matches themselves (`kind 'student'`, `field 'parent_email'` for a parent invitation, `'email'` for a student invitation) |
| `teacher_address` | teacher records with `norm_email(email) = address`; `kind 'teacher'`, `archived` = `deleted_at is not null` |
| `staff_address` | profiles with that address and a staff role; `kind 'account'`, `role` |
| `account_other_role` (Q2) | the Auth account (profile joined to `auth.users` on the normalised address, as `queue_role_invitation` does) whose role is `parent` or `student` and differs from the invited role; `kind 'account'`, `role`. New preview refusal, message « Un compte existe déjà avec cette adresse sous un autre rôle. », hint `portal.account_other_role`, raised only inside the preview's own catch block (the invitation path is unchanged and still refuses with `23514`). |

No other column is read into the answer. A blank `full_name` is returned as null; the form shows « (nom non renseigné) ».

Exception messages are unchanged and still carry no name.

## 2. Form

A pure helper `src/lib/portalRefusalDetail.mjs` turns `{ reason, conflicts, conflicts_total, role }` into display lines; the form renders them under the existing message. Learner rows link to `/students/<id>`, teacher rows to `/teachers/<id>`; account rows have no link (the user list is on the same page). Wording:

| Reason | List heading | « Que faire » |
| --- | --- | --- |
| `address_is_parent` | « Adresse parent de : » | « Si c’est le parent, choisissez le rôle Parent et cochez ses enfants. Si l’apprenant a sa propre adresse, corrigez l’e-mail sur sa fiche, puis vérifiez à nouveau. » |
| `shared_address` (parent) | « Adresse parent sur ces fiches : » | « Un compte parent couvre 4 apprenants au plus, d’une seule famille. Corrigez l’adresse sur les fiches d’une autre famille, puis vérifiez à nouveau. » |
| `shared_address` (student) | « Adresse de l’apprenant sur ces fiches : » | « Une adresse apprenant ne va que sur une fiche. Gardez-la sur la bonne fiche et corrigez les autres. » |
| `teacher_address` | « Fiche enseignant : » (+ « archivée ») | « Une famille ne peut pas utiliser l’adresse d’un enseignant. Demandez une autre adresse et corrigez la fiche de l’apprenant. » |
| `staff_address` | « Compte du personnel : » (+ rôle) | same as `teacher_address` |
| `account_other_role` | « Compte existant : » (+ rôle) | « Si c’est la même personne, invitez-la avec ce rôle. Sinon, utilisez une autre adresse. Un rôle actif ne change pas par invitation. » |

More than 10: « et N autres ». The form tolerates an answer without `conflicts` (shows today's box), so the migration can go first.

# Security boundaries

1. Caller check first, unchanged: a receptionist, teacher, parent, student or anonymous caller gets `portal.forbidden` and no lookup.
2. Disclosed per conflicting record: id, name, field, archived flag, role. Never an address, phone, group, link, payment or note of that record.
3. Names appear only in the preview's return value, never in an exception, log line, `activity_log` row or the invite route's answer.
4. Same normalisation and predicates as the refusal: the list never names a record the rule did not count.
5. No rule, limit, grant, policy or write changes; the function stays read-only (`stable`).

# Risk tier

**Tier 3.** It re-creates a `security definer` function on the family-invitation path (Auth/roles in the [tier table](../../../AGENTS.md#risk-based-lifecycle)) that returns data from other families' records, and needs a Production migration. The client-only alternative (Q1 B) would be Tier 2 by itself, but it is still the invitation screen and is not recommended.

# Owner decisions required

**Q1 — Where the names come from. Blocking.**
- **A (recommended):** migration 129, the server returns `conflicts` from the same rule (above). One rule; covers teacher and staff records exactly; Tier 3 with a Production migration.
- **B:** client only: on refusal, the form reads learners, teachers and profiles by address under existing RLS. No migration, Tier 2, but a second copy of the matching rule in the browser (normalisation drift: 4 `parent_email` and 2 learner `email` values were not normalised at PRF-r2 R0), and the account case cannot be read the same way.

**Q2 — Existing account of the other family role (a parent account invited as Apprenant, or the reverse). Not blocking.**
- **A (recommended):** the preview detects it and names the account (`account_other_role`), so staff learn it before pressing « Inviter ».
- **B:** leave it to today's generic answer from the invite route.

**Q3 — What each named record shows. Not blocking.**
- **A (recommended):** name, field, archived flag/role, and « Ouvrir la fiche »; at most 10 names then a count.
- **B:** also the learner's groups and status (more help to identify, more data shown).

# Release (each step separately approved)

- **R0 (optional, read-only):** ledger ceiling still 128. If the owner wants the 2026-11-14 case confirmed: one call of `preview_family_invitation` as a director for that address and role, result read only by the owner. Writes nothing.
- **R1:** apply 129 (migration first; the old form ignores the new fields).
- **R2:** merge and deploy the form.
- **R3:** in Production, the director previews one known shared address and sees the names; then a clean address shows no refusal.

**Recovery:** revert the PR (the form falls back to today's box). If the function itself must go back, a forward migration re-creates the 123 body; no data to restore.

## IMPLEMENTATION CONTRACT

Valid only after owner approval of SAR-r1 with Q1–Q3 answered. If Q1 = B, this contract is replaced by a client-only revision (Tier 2) before implementation.

**Prerequisites:** latest migration on `origin/main` is 128; `preview_family_invitation` still has its 123 body (re-check; if re-created later, build on that body).

**Manifest:**
- `supabase/migrations/129_shared_address_refusal_detail.sql` — re-create `public.preview_family_invitation` as in [design 1](#1-migration-129--preview_family_invitation-with-conflicts); guard that 128 is applied; re-assert grants.
- `src/lib/portalRefusalDetail.mjs` (new, pure) and `src/app/(admin)/settings/page.jsx` (`InviteUserForm` refusal box only).
- Tests: `scripts/test-portal-readiness.sql` (new cases), a node unit test for the helper registered in `package.json`, upgrade/ledger ceiling scripts moved to 129, the invite form's existing browser coverage or a focused new check.
- Docs: this plan's records, plans README row, CURRENT_STATE at release, OWNER_DECISIONS approval record, staff guide one sentence if the owner wants it.

**Invariants:** refusal reasons, codes, messages and rules unchanged for every function; `require_manager()` first; the preview writes nothing; no name in any exception; at most 10 conflicts returned; no file under `src/components/online/` or the room touched.

**Acceptance / tests:**
1. Each of the five reasons returns the exact conflicting ids (SQL fixtures: a parent address on two families' learners; a placeholder on 12 learners → 10 rows, total 12; a student invitation on a sibling's parent address; an archived and an active teacher record; a staff profile; an active parent account invited as student).
2. A clean address: `refusal` and `conflicts` null; `matches` unchanged from 123.
3. Receptionist, teacher, parent, student and anon callers: `portal.forbidden`, no `conflicts`.
4. `prepare_family_invitation` and `link_family_student` refusals keep their exact messages (no name) — regression.
5. Helper unit tests: every reason, both roles, blank name, more than 10, missing `conflicts`.
6. Browser: the form shows the name with a working « Ouvrir la fiche » and the « Que faire » line for `address_is_parent`.

**Stop conditions:** any need to change a refusal rule, the invitation functions or a grant; a name appearing in an error path; a reason not listed here; `preview_family_invitation` re-created after 123 by another migration on `main`.

**Reporting:** Tier 3 handoff per [AGENTS](../../../AGENTS.md#implementation-handoff); READY FOR INDEPENDENT REVIEW only with green required CI on the exact head.
