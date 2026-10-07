# Owner summary

> **Status: PROPOSED / AWAITING OWNER DECISIONS — NOT APPROVED. Implementation is not authorized.** Architecture revision **A2-r1**, recorded 2026-10-07 from repository baseline `origin/main` `f1b8ba8ebdd820fb0242c6e68f439e2696b09e59`. Parent plan: [RCC-r1](rcc-r1-receptionist-crm-completion.md#rcc-a2--enrollment-ux-hardening).

## What will change

- When the receptionist starts an enrollment from a CRM opportunity and something is wrong, she sees a specific French explanation of what is wrong. The dialog moves her to the step and field that caused it, and tells her what to do next. Today most of these cases show the same generic sentence.
- The server keeps every existing check. Each known business-validation failure also returns a fixed, machine-readable reason code. Messages and error codes stay exactly as they are today, so current screens keep working.
- The dialog prevents a future birth date. It also prevents a past follow-up date before sending anything.
- If the opportunity is already tied to a learner, the dialog shows that learner, preselected. It does not offer "Créer un nouvel apprenant", so no duplicate learner can be created.
- The follow-up field becomes clear. By default, the follow-up is tomorrow at the next allowed calling time. If a follow-up already exists, the dialog shows it and keeps it. A specific date can still be chosen.
- In the drawer, the enrollment section shows exactly one action that matches the situation: **Commencer l’inscription**, **Continuer l’inscription** or **Ouvrir l’apprenant**.
- After a pre-enrollment is created, the confirmation states what was created and that the opportunity stays Qualified. It also gives the actual follow-up date and time.

## What staff/users will be able to do

- **Receptionists** can fix a failed enrollment start without guessing. Examples: correct a birth date, pick a later follow-up time, or use the learner already linked to the opportunity.
- **Receptionists** can resume an opportunity that already has a pre-enrollment with **Continuer l’inscription**. This opens the learner's file at the enrollment section, where the existing payment and enrollment actions already are.
- **Admins and directors** use the same dialog with the same behavior. Nothing changes in their permissions.

## What remains restricted

- Starting a pre-enrollment never converts the opportunity. Only a trusted, linked Confirmed/Validated enrollment converts it.
- The receptionist still cannot confirm an enrollment directly, choose a different learner for an opportunity that is already linked, or relink an enrollment.
- No change to finance, permissions, RLS, grants, Meta/lifecycle, the follow-up cadence or RCC-A1 behavior.

## UI impact

- Changes are limited to the CRM enrollment dialog, the drawer's enrollment section, and one anchor on the learner page so **Continuer** can land on its enrollment section.
- There is no visual or responsive redesign. That remains RCC-B1.

## Database impact

- One forward migration (expected `112`, confirmed at implementation time). It replaces two existing functions with the same signatures and grants:
  - `crm_start_enrollment`, which adds reason codes and explicit pre-checks;
  - `crm_get_enrollment_context`, which gains a read-only `linked_student` field.
- The enrollment result gains an extra field with the follow-up date and time.
- No new table, column, index, trigger, policy or grant. Existing data is not modified, and there is no backfill.

## Important security decisions

- Reason codes are a fixed list of plain tokens. They never contain names, dates, identifiers, SQL or table names.
- Unexpected failures show a safe generic message. They are never translated into a guessed explanation.
- No new permission or public function. The privileged task, command and conversion functions are not touched.

## Risks / owner review points

- **Tier 3.** The change replaces a Production enrollment/conversion-integrity function.
- The main risk is accidentally changing an existing check, lock or retry behavior while rewriting the function. Mitigations:
  - copy the function exactly and change only the listed places;
  - an upgrade test proves nothing else changed;
  - every existing enrollment test suite must still pass.
- **The cause of the owner's original Production failure is still unknown.** This design makes every known cause self-explanatory next time, but it does not prove which one happened.
- The broader "one generic follow-up from every path" rule is recommended as a **separate** outcome (decision D6).
- Seven decisions need the owner (D1–D7). Approving "as recommended" resolves D1–D6. D7 does not block.

---

## Baseline and evidence limits

| Fact | Evidence |
| --- | --- |
| Baseline | Fetched `origin/main` = `f1b8ba8ebdd820fb0242c6e68f439e2696b09e59` (PR #110, RCC-A1 closeout docs), matching the expected baseline. |
| Production ledger | [CURRENT_STATE](../../ai/CURRENT_STATE.md#deployment-and-credential-evidence-boundaries) records **001–111** (111 applied 2026-10-07). The repository ceiling is `111_crm_rcc_a1_outcome_led_followup.sql`, and no remote branch carries a 112+ migration at this baseline. |
| Deployed source | `8d5af40…` (PR #108 merge) per CURRENT_STATE. The baseline differs from it only by documentation. |
| Production observation | **None.** No Production data, logs, students, leads, enrollments or Auth users were read. See D7. |
| Scope of inspection | Cumulative SQL definitions (below), the receptionist UI, error mapping, and the existing test suites. All of it was read from the repository; nothing was executed against any database during this task. |

## Verified current state

### Cumulative definitions

| Object | Latest definition | Notes |
| --- | --- | --- |
| `public.crm_start_enrollment(uuid,jsonb)` | [084](../../../supabase/migrations/084_crm_enrollment_and_conversion.sql) only | SECURITY DEFINER, `search_path=pg_catalog,pg_temp`, executable by `authenticated` only. It is not redefined by any later migration. |
| `public.crm_get_enrollment_context(uuid)` | 084 only | Returns `learner_name`, `birth_date`, `age`, `session_type`, `program_interest`, contact name/phone/email, `student_id` and `recommended_level`. |
| `crm_security.new_task` | [111](../../../supabase/migrations/111_crm_rcc_a1_outcome_led_followup.sql) | Called by `crm_start_enrollment` for the `enrollment_followup` task. |
| `crm_security.next_window`, `finish_task`, `result` | [080](../../../supabase/migrations/080_crm_commands_and_followup_engine.sql) | Unchanged since 080. |
| `crm_security.require_reader` | [079](../../../supabase/migrations/079_crm_read_interfaces_and_permissions.sql) | Allows receptionist, admin and director. |
| `crm_security.evaluate_conversion`, `student_candidates`, `candidate_token`, `lock_enrollment_intent`, `enrollment_summary` | 084 only | |
| `crm_security.command` | 111 (migration 103's definition plus three RCC-A1 edits) | **Not used by enrollment initiation.** A2 does not touch it. |
| Enrollment row triggers | [070](../../../supabase/migrations/070_enrollment_student_atomic_sync.sql)/[074](../../../supabase/migrations/074_enrollment_workflow_consistency.sql) and the 084 conversion trigger | For example, `Trial`/`Validated` without a group raises `23514 Active enrollment requires a group`. |

### Enrollment initiation: what actually happens

`crm_start_enrollment(p_request_key, p_data)` runs these steps in this order:

1. `require_reader`, then a bounded payload with exactly the allowed keys.
2. The exclusive enrollment-intent advisory lock on the payload `student_id`, if one is present. A held lock fails fast with `40001 Inscription ou paiement en cours…`.
3. A payload SHA-256 digest, and the per-actor request-key advisory lock. **Replay check:** the same key with the same payload returns the stored result before any state validation; the same key with a different payload gives `22023 Request key payload conflict`.
4. Lock the lead `FOR UPDATE`. Reject `22023 Qualified unlinked lead required` if the lead is not found, not `QUALIFIED`, merged, or already has an `enrollment_id`. Only then compare `expected_version`, and reject a mismatch with `40001`.
5. Parse `learner_name` and `birth_date`, then validate program, school year and notes (`22023 Invalid enrollment program or school year`). `initial_status` must be `Submitted` or `Trial`, otherwise `42501`.
6. **New learner** (`student_choice='new'`): reject `22023 Invalid new learner` when **any** of the following holds:
   - `lead.student_id` is set;
   - the payload carries `student_id` or `enrollment_id`;
   - the name is not 2–120 characters;
   - `birth > current_date`;
   - the birth date is not finite.

   Then take the new-student name advisory lock, compare the candidate review token (mismatch gives `40001`), and require `confirm_new` when candidates exist. Finally insert a `Prospect` student.
7. **Existing learner:** the chosen student must exist and not be deleted, and must equal `lead.student_id` when that is set. Otherwise `22023 Student unavailable or inconsistent`. If no choice is given: `Explicit student choice required`.
8. **Selected enrollment:** it must be compatible, unlinked, have a matching group, and have a fresh `updated_at`. **No selected enrollment:** a null-status enrollment for the same program and year blocks the start (`requires review`). Any other non-Rejected enrollment for the same program and year blocks it too (`requires explicit selection`). A chosen group must match session and level, and the level must be valid. Then insert the enrollment with `initial_status` and today's date.
9. Link the lead (`student_id`, `enrollment_id`, version+1). Insert the `enrollment_started` activity, then run `evaluate_conversion`. Conversion happens **only** if the linked enrollment is already Confirmed/Validated, which is possible only when the receptionist links an existing confirmed enrollment.
10. If the lead is not converted:
    - **No open `enrollment_followup`:** compute `due := next_window(policy, coalesce(followup_at, now()+1 day))`, then `new_task(...)`. `new_task` rejects `due<now()` (`22023 Valid future task required`) and an owner who is not operational staff (`22023 Assignee must be operational staff`).
    - **Otherwise:** keep the earliest open enrollment follow-up, cancel any duplicates, and **ignore `followup_at`**.
11. Store the result (`crm_security.result` plus the enrollment summary) under the request key.
12. Exception handler: deadlock or unique violation becomes `40001 Concurrent enrollment change`. Text/datetime/check/not-null errors become `22023 Invalid enrollment fields or incompatible group`. This includes a malformed `birth_date` or `followup_at`, and `Trial` without a group (trigger `23514`).

Status, task and activity effects: the opportunity **stays `QUALIFIED`**, gains the `enrollment_started` activity and an `enrollment_followup` task ("Finaliser l’inscription avec le parent.", `schedule_kind` NULL), and gets a version bump. Conversion happens later, when the linked enrollment becomes Confirmed/Validated. The 084 trigger then calls `evaluate_conversion`, which records `lead_converted` and cancels open tasks. The usual route is a payment through `create_charge_payment`, which moves Submitted/Under Review to Confirmed (or Validated with a group) and Trial to Validated. A2 changes none of this.

### Learner linkage

- `crm_leads.student_id` and `crm_leads.enrollment_id` are written **together, and only by `crm_start_enrollment`**. A schema check requires `student_id` whenever `enrollment_id` is set. Once `enrollment_id` is set, the 084 trigger makes both immutable.
- **No current code path sets `student_id` without `enrollment_id`.** The schema still permits it, for example through historical or manual SQL. RCC-A0 reproduced it synthetically. Whether such Production rows exist is unknown (see D7).
- `crm_get_enrollment_context` returns `student_id`, but **the dialog never reads it**. The linked student may not appear in the name/phone/email candidate search, and the dialog always offers "Créer un nouvel apprenant". In that state, the new-learner path and every other candidate fail on the server.

### Receptionist UI

- **Drawer section** ([LeadEnrollmentSection.jsx](../../../src/components/crm/LeadEnrollmentSection.jsx)):
  - no enrollment and `QUALIFIED`: **Commencer l’inscription**;
  - an enrollment exists: status, learner, program and an **Ouvrir l’apprenant** link to `/students/{id}`;
  - **there is no "Continuer" entry point.**
  - `isPreEnrollment()` includes `Rejected`, so a refused enrollment on a Qualified lead shows "Finaliser l’inscription avec le parent."
  - Dragging a card from QUALIFIED to CONVERTED opens the drawer with `initialAction='enrollment'`. That either opens the dialog or focuses the enrollment section ([LeadDetailSheet.jsx](../../../src/components/crm/LeadDetailSheet.jsx)).
- **Dialog** ([CrmEnrollmentDialog.jsx](../../../src/components/crm/CrmEnrollmentDialog.jsx)) is a three-step wizard (Apprenant → Inscription → Vérification). The steps are client state only; **no draft is persisted on the server**.
  - The birth date input has no `max`. The follow-up `datetime-local` input has no `min`.
  - The follow-up field is shown even when an enrollment follow-up already exists. Its help text says an existing one is kept.
  - On any `22023`/`42501` the dialog jumps to **step 2**, even when the cause is on step 1 (learner or birth date).
  - On `40001` it refetches detail. If an enrollment now exists, it shows it; otherwise it resets to step 1.
  - The request key is retained while the payload is unchanged, which supports uncertain-response retries. It is discarded after a `22023`/`42501`.
- **Error mapping** (`commandError` in [presentation.mjs](../../../src/lib/crm/presentation.mjs)) matches English message substrings. There is **no structured reason contract** for browser-facing CRM commands. The only machine tokens in the repository are migration 105's server-side `PT409` reconciliation tokens. supabase-js passes PostgREST `code`, `message`, `details` and `hint` through to `crmRpc` callers unchanged.

### Current error inventory and what the receptionist sees today

"Generic" means: *Vérifiez les champs, la date future et les conditions de cette action.*

| Server condition (SQLSTATE / message) | Current UI text |
| --- | --- |
| `22023 Invalid new learner`: linked student, invalid name, future birth date, infinite birth date, or bad payload shape | **Generic** |
| `22023 Valid future task required` (past follow-up after window resolution) | **Generic** |
| `22023 Assignee must be operational staff` (lead owner is no longer operational staff) | **Generic** |
| `22023 Qualified unlinked lead required` (not found, merged, not Qualified, or already linked) | **Generic** |
| `22023 Enrollment group must match session and level` | **Generic** |
| `22023 Policy has no available calling window` | **Generic** |
| `22023 Request key payload conflict` / `Valid bounded enrollment request required` | **Generic** |
| `22023 Invalid enrollment fields or incompatible group` (malformed date, Trial without group, other data error) | "Vérifiez le programme, l’année scolaire, le niveau et le groupe." — **wrong for a malformed birth or follow-up date** |
| `22023 Invalid enrollment program or school year`, including notes over 2000 characters | Same program/year text, which is wrong for notes |
| `42501 Only pre-confirmation enrollment initiation is permitted` | "Vous n’avez pas accès à cette action." (misleading) |
| `Existing enrollment requires explicit selection` / `status requires review` / `Explicit new learner` / `Student unavailable` / `Enrollment unavailable` / `Invalid level` | Specific mapped text |
| `40001` variants | "Ce prospect a changé…" with a refresh |
| No server response (network) | "Impossible de confirmer l’enregistrement. Réessayez sans modifier les champs…" |

**Implication for the owner's original failure (still INCONCLUSIVE).** If the owner saw the generic sentence, the cause is one of the rows marked **Generic**. RCC-A0 reproduced three of them, but the Production branch is not known, and **this plan does not assume one.** Two causes in that set that RCC-A0 did not test, and which blank optional fields would not explain, are an owner who is no longer operational staff and a lead linked by someone else while the drawer was open. They are listed as possibilities only.

## Confirmed problems

**Confirmed defects**

1. Several distinct validations share one message, so the browser cannot explain them without guessing: `Invalid new learner` (five causes) and `Qualified unlinked lead required` (four causes).
2. The dialog jumps to step 2 for step-1 failures (learner or birth date). The field at fault is not visible.
3. **Linked learner dead end.** A lead with `student_id` and no enrollment is not preselected. The linked student can be missing from the candidates, and "Créer un nouvel apprenant" is offered although the server must reject it.
4. **Linked-elsewhere dead end.** If the chosen student's only enrollment for that program and year is linked to another opportunity, the dialog disables the button ("Déjà rattachée à un prospect"). It still requires a selection ("Choisissez l’inscription existante…") and gives no way forward.
5. A malformed birth or follow-up date and `Trial` without a group are reported as program/level/group problems. Notes over 2000 characters are reported as a program/year problem. A disallowed `initial_status` is reported as an access problem.
6. A refused (`Rejected`) linked enrollment shows "Finaliser l’inscription avec le parent."

**UX ambiguity**

7. No `max` on the birth date and no `min` on the follow-up. A value can go stale while the dialog stays open.
8. A follow-up value typed while an enrollment follow-up exists is silently ignored. The help text mentions it, but the field is still offered.
9. The success panel does not say when the follow-up is.
10. There is no "Continuer" entry point for an existing pre-enrollment, only a plain link.
11. The server's birth-date check uses `current_date` in the database session time zone (UTC by Supabase default; the Production setting is not verified). Between 00:00 and 01:00 Casablanca, "today" is one day ahead of UTC.

**Not defects (preserved)**

- Blank optional fields succeed, as RCC-A0 proved.
- The opportunity stays QUALIFIED after initiation.
- The idempotent replay ordering is correct.
- The server ignores a follow-up value while an enrollment follow-up is kept.

## Scope

1. A structured, safe error contract for `crm_start_enrollment` expected business-validation failures. Each failure gets a reason code, a French message, a field or step, and a recovery action, plus an honest fallback (D1).
2. Future-birth-date prevention in the browser, with the existing server rule kept, aligned to the Casablanca civil date and given a reason code (D2).
3. Linked-learner handling: preselect the linked learner, offer no new or other learner, and explain linkage races (D3).
4. Follow-up clarity: show the default, show an existing follow-up, validate a chosen date, and confirm the actual time (D4).
5. Contextual enrollment actions in the drawer: one action at a time, with a defined destination (D5).
6. A clearer success state.
7. Tests, compatibility and rollout design for the above.

## Non-goals

These are excluded:

- broader generic follow-up consolidation (D6 recommends a separate outcome);
- finance, payment or receipt changes;
- conversion-authority changes;
- permissions, grants or RLS;
- Meta/lifecycle;
- RCC-B1 visual or responsive redesign;
- Director CRM / Growth Intelligence;
- online learning;
- historical cleanup or backfill;
- the walk-in redesign;
- admissions outside the CRM entry flow;
- task-engine, cadence or `crm_security.command` changes;
- director tools to relink or unlink a learner;
- enrollment-follow-up reminder presets (D4 option B);
- giving `enrollment_followup` a `schedule_kind`.

## Proposed product behavior

### 1. Error contract

The server keeps every **SQLSTATE and message text unchanged**. For known business validations it adds `HINT = 'crm_enrollment.<reason>'`, a closed, stable ASCII token that never contains data. The browser behaves as follows:

- It maps known reasons with a pure table: French message, step, field, whether submission remains available, and recovery action.
- On a field reason, it navigates to the field's step, sets `aria-invalid`, links the inline message with `aria-describedby`, moves focus to the field, and also shows the summary `role="alert"`.
- After any server rejection, the pending request key is discarded, as today. Correcting the field changes the payload, so a new key is used.
- **Fallback:**
  - no hint, or an unknown hint, with `40001`: the current refresh flow;
  - `42501` with no hint: the current access text;
  - any other server error with no hint or an unknown hint: the existing legacy message matcher (for the new-frontend-with-old-database window and replays), otherwise *« L’inscription n’a pas pu être créée et rien n’a été enregistré. Réessayez ; si le problème persiste, contactez la direction. »*;
  - no server response: the current uncertain-retry text, keeping the same key.

  Raw `message`, `details`, `hint`, SQLSTATE and identifiers are never rendered.

| Reason (`crm_enrollment.…`) | Condition | Message (French) | Step · field | Submit stays available | Recovery |
| --- | --- | --- | --- | --- | --- |
| `lead_unavailable` | lead not found or merged | Ce prospect n’est plus disponible. Fermez puis rouvrez la liste. | — | No | Close the dialog and refresh |
| `lead_already_enrolled` | `enrollment_id` already set | Une inscription a déjà été commencée pour ce prospect. | — | No | Refetch the detail and show the linked state (as `40001` does today) |
| `lead_not_qualified` | status ≠ QUALIFIED | Ce prospect n’est plus « Qualifié ». Qualifiez le projet avant de commencer une inscription. | — | No | Close the dialog and refresh |
| `program_invalid` | unknown program | Choisissez un programme de la liste. | 2 · Programme | Yes | Correct the field |
| `school_year_invalid` | bad format or non-consecutive years | Indiquez l’année scolaire au format 2026/2027 (deux années consécutives). | 2 · Année scolaire | Yes | Correct the field |
| `notes_too_long` | notes over 2000 characters | La note ne peut pas dépasser 2000 caractères. | 2 · Note | Yes | Shorten the note |
| `initial_status_not_permitted` | status not Submitted or Trial | Seule une pré-inscription ou un essai peut être démarré ici. La confirmation suit le parcours habituel. | 2 · Démarrage | Yes | Choose Pré-inscription or Essai |
| `learner_already_linked` | new learner chosen while `lead.student_id` is set | Ce prospect est déjà rattaché à un apprenant. L’inscription doit être créée pour cet apprenant. | 1 | Yes | Refetch the context and preselect the linked learner |
| `learner_link_mismatch` | another existing learner chosen while linked | (same text as above) | 1 | Yes | Same |
| `linked_learner_unavailable` | the linked learner's file is deleted or missing | Le dossier de l’apprenant rattaché à ce prospect n’est plus actif. Contactez la direction. | 1 | No | Escalate |
| `learner_unavailable` | chosen learner deleted or missing (not linked) | Ce dossier d’apprenant n’est plus disponible. Choisissez un autre apprenant. | 1 | Yes | Reselect |
| `learner_choice_required` | no explicit choice | Choisissez un apprenant existant ou créez un nouvel apprenant. | 1 | Yes | Choose |
| `learner_name_invalid` | name not 2–120 characters | Indiquez le nom de l’apprenant (2 à 120 caractères). | 1 · Nom | Yes | Correct |
| `birth_date_future` | after today (Casablanca) | La date de naissance ne peut pas être dans le futur. | 1 · Date de naissance | Yes | Correct or clear |
| `birth_date_invalid` | unparsable or infinite | Date de naissance invalide. Corrigez-la ou laissez le champ vide. | 1 · Date de naissance | Yes | Correct or clear |
| `candidates_changed` (40001) | candidate token mismatch | Les apprenants existants ont changé. Vérifiez à nouveau les correspondances. | 1 | Yes | Current reset-to-step-1 flow |
| `new_learner_confirmation_required` | candidates exist and new learner not confirmed | Vérifiez les correspondances et confirmez qu’il s’agit d’un autre apprenant. | 1 · confirmation checkbox | Yes | Tick the box or pick a match |
| `enrollment_incompatible` | selected enrollment missing, other learner, Rejected or null status, other program/year | Cette inscription ne correspond plus à l’apprenant, au programme ou à l’année. Choisissez à nouveau. | 2 | Yes | Refetch the candidates |
| `enrollment_already_linked` | selected enrollment linked to another opportunity | Cette inscription est déjà rattachée à un autre prospect. | 2 | Yes | Choose another program or year, or see "linked elsewhere" below |
| `enrollment_group_incompatible` | selected enrollment's own group mismatches | Le groupe de cette inscription ne correspond pas à son programme ou niveau. Demandez à l’administration de la corriger. | 2 | No, for that enrollment | Escalate |
| `enrollment_changed` (40001) | stale `updated_at` | Cette inscription a changé. Les informations sont actualisées. | 2 | Yes | Refetch |
| `existing_enrollment_needs_review` | a null-status enrollment exists | Une inscription existe sans statut. Demandez à l’administration de la vérifier avant de poursuivre. | 2 | No | Escalate |
| `existing_enrollment_requires_selection` | unlinked existing enrollment for the same program and year | Une inscription existe déjà pour ce programme et cette année. Sélectionnez-la. | 2 | Yes | Select it |
| `existing_enrollment_linked_elsewhere` | every such enrollment is linked to another opportunity | Cet apprenant a déjà une inscription pour ce programme et cette année, rattachée à un autre prospect. Choisissez un autre programme ou une autre année, ou clôturez ce prospect comme doublon. | 2 · Programme | Yes | Change program or year, or close as NOT_QUALIFIED `duplicate` (existing command) |
| `group_incompatible` | chosen group missing or mismatched | Le groupe choisi ne correspond plus au programme ou au niveau. Choisissez un autre groupe. | 2 · Groupe | Yes | Reselect |
| `level_invalid` | level invalid for the program | Choisissez un niveau compatible avec le programme. | 2 · Niveau | Yes | Correct |
| `trial_requires_group` | Trial without a group | Un essai nécessite un groupe. Choisissez un groupe ou démarrez une pré-inscription. | 2 · Groupe | Yes | Choose a group or Pré-inscription |
| `followup_invalid` | unparsable or infinite `followup_at` | Date de suivi invalide. Choisissez une date et une heure, ou laissez la valeur par défaut. | 2 · Prochain suivi | Yes | Correct or reset |
| `followup_in_past` | resolved follow-up before `now()` | Cette date de suivi est passée. Choisissez une date future ou gardez le suivi par défaut. | 2 · Prochain suivi | Yes | Correct or reset |
| `owner_not_operational` | lead owner is no longer operational staff | Le responsable de ce prospect n’est plus un membre actif de l’équipe. Attribuez un responsable (Autres actions → Attribuer un responsable), puis réessayez. | — | Yes, after the fix | Existing reassign command |
| `followup_policy_unavailable` | no calling window in the policy | Le calendrier de suivi ne permet pas de planifier ce suivi. Demandez à la direction de vérifier les horaires. | — | No | Escalate |
| `enrollment_in_progress` (40001) | intent lock held | Une inscription ou un paiement est en cours pour cet apprenant. Patientez puis réessayez. | — | Yes | Retry |
| `concurrent_change` (40001) | deadlock or unique violation | Ce prospect a changé pendant l’enregistrement. Les informations sont actualisées. | — | Yes | Current refresh |
| `record_rejected` | remaining data or constraint error in the handler | Ces informations n’ont pas pu être enregistrées. Vérifiez le programme, le niveau et le groupe ; si le problème persiste, contactez la direction. | 2 | Yes | Check, then escalate |
| `request_invalid` / `request_conflict` | malformed payload, or reused key with a different payload (programming errors) | Generic fallback above | — | Yes, with a new key | Escalate if repeated |

`lead_changed` (stale version, `40001`) keeps today's text and flow. Access denial from `require_reader` gets no hint and keeps today's access text.

### 2. Future birth date

The browser and the server both enforce it.

- **Browser:** the birth date input gets `max` set to Casablanca today, computed with `Intl` as `enrollmentSchoolYear` already does. A future value shows an inline error and blocks **Continuer** on step 1. A blank value stays valid. Today is allowed: the product has no minimum-age rule, and A2 invents none.
- **Server:** the existing rejection is kept for every caller, with reason `birth_date_future`. The comparison date becomes the Casablanca civil date, `(now() at time zone 'Africa/Casablanca')::date`. This matches the adopted Casablanca civil contract and the browser. It widens acceptance by at most one day, between 00:00 and 01:00 Casablanca. The message stays `Invalid new learner`.
- The existing-learner path does not write a birth date and is unchanged.

### 3. Existing / linked learner

The server invariant is unchanged and stays authoritative:

- `lead.student_id`, when set, is the only learner that `crm_start_enrollment` will enroll for that opportunity;
- `enrollment_id` and the link are immutable once set;
- a new student is created only on the new path, after candidate review, under the name lock.

Dialog behavior:

| Situation | Behavior |
| --- | --- |
| Lead has an `enrollment_id` | The dialog is not offered; the drawer shows Continuer or Ouvrir (§5). If it is stale and still opened, `lead_already_enrolled` refetches and shows the linked state. **No new learner is possible.** |
| Lead has `student_id`, no enrollment, learner active | Step 1 shows "Apprenant rattaché à ce prospect : {nom}{ · date de naissance}" **preselected** (choice `existing`). The candidate list and **Créer un nouvel apprenant are hidden**, with one line: "Ce prospect est déjà rattaché à cet apprenant ; l’inscription sera créée pour lui. Pour changer d’apprenant, contactez la direction." Name and birth inputs are hidden; the payload sends `student_id`. Step 2 behaves as for any existing learner. |
| Lead has `student_id`, linked learner deleted or missing | Step 1 shows `linked_learner_unavailable` text. Submission is unavailable; the receptionist escalates. |
| Lead not linked | Today's candidate review: choose an existing learner or explicitly confirm a new one. |
| Linkage changes after the dialog opens | The server rejects before any insert (`learner_already_linked`, `learner_link_mismatch` or `lead_already_enrolled`). The browser refetches context or detail and moves to the linked presentation. **No duplicate learner is created.** |
| Existing learner whose same-program/year enrollment is linked to another opportunity | Step 2 explains `existing_enrollment_linked_elsewhere` before submit, using the existing `already_linked` flag. Instead of the dead-end "Choisissez l’inscription existante", the receptionist can change program or year, or close the opportunity as a duplicate with the existing command. |

The receptionist cannot override the linked learner in A2. A director correction tool would be a separate decision.

### 4. Follow-up date

- **Required or optional:** the receptionist is never required to enter a date. After a non-converting initiation, the server always ensures one open `enrollment_followup`: it creates the default or keeps the earliest existing one, unchanged. Linking an already Confirmed/Validated enrollment converts the opportunity and closes commercial tasks, so no follow-up field is shown in that case (as today).
- **Presentation (step 2):**
  - **No open enrollment follow-up:** "Suivi « Finaliser l’inscription » : demain, au prochain créneau d’appel autorisé." plus a **Choisir une autre date** control. That control reveals the `datetime-local` input (Casablanca wall clock, `min` = Casablanca now) and the help text "L’heure est ajustée au prochain créneau d’appel autorisé si nécessaire." **Garder la date par défaut** clears it.
  - **Open enrollment follow-up already exists** (from the drawer's projected open tasks): "Un suivi d’inscription est déjà prévu le {date civile} à {heure}. Il est conservé." **No input** is shown and `followup_at` is not sent.
  - Step 3 restates the follow-up line.
- **Validation:** the browser blocks a past value on change and again at final submit. A value that went stale while the dialog was open returns to step 2 with the `followup_in_past` text and is **not** moved automatically. The server keeps today's rule exactly: an explicit value is resolved to the policy's calling window, and the request is rejected only if the resolved time is before `now()`. The reason code is added; a supplied value is still ignored when a follow-up is kept.
- **Timezone:** browser wall clock to instant through the existing `casablancaInstant`. The calling window is resolved by the server only. Display uses server-projected civil date and time.
- **Retry and idempotency:** an identical payload reuses the key and replays the stored result, even if the date has since passed. A changed date means a new payload and a new key.
- **Unchanged:** the enrollment follow-up remains an internal task. Agreed appointments and RCC-A1 scheduling semantics are untouched.

### 5. Contextual enrollment actions

The drawer's enrollment section shows **at most one** action, chosen by a pure function in this priority order:

| # | Opportunity / enrollment state | Action | Destination / meaning | Note shown |
| --- | --- | --- | --- | --- |
| 1 | Enrollment exists, status Confirmed or Validated (lead normally CONVERTED) | **Ouvrir l’apprenant** | `/students/{student_id}` with `returnTo` (existing) | Status label, e.g. "Inscription confirmée" |
| 2 | Enrollment exists, status Submitted, Under Review or Trial, lead QUALIFIED | **Continuer l’inscription** (primary) | `/students/{student_id}#inscriptions` with `returnTo`: the learner file's **Inscriptions et groupes** section, where the existing pre-enrollment edit, documents and payment ("Encaisser") actions live (D5) | "Pré-inscription en attente de confirmation." |
| 3 | Enrollment exists, status Rejected | **Ouvrir l’apprenant** | Learner file | "Inscription refusée. Ce prospect reste rattaché à cette inscription ; pour une nouvelle demande, contactez la direction." No "Finaliser" text. |
| 4 | Enrollment exists, pre-confirmation, lead LOST or NOT_QUALIFIED | **Ouvrir l’apprenant** | Learner file | "Prospect clôturé : l’inscription reste visible dans le dossier de l’apprenant." |
| 5 | Enrollment exists, any other or unknown status | **Ouvrir l’apprenant** | Learner file | "Statut d’inscription à vérifier par l’administration." |
| 6 | No enrollment, lead QUALIFIED | **Commencer l’inscription** | Opens the dialog (linked-learner preselection applies) | — |
| 7 | No enrollment, NEW, CONTACTING or ENGAGED | none | — | "Qualifiez le projet avant de commencer une inscription." |
| 8 | No enrollment, LOST or NOT_QUALIFIED | none | — | "Rouvrez le prospect pour reprendre une inscription." |

- A wizard closed half-way persists nothing, so **Continuer** never means "resume an unfinished dialog". It always means "finish an existing pre-enrollment".
- The board's QUALIFIED → CONVERTED drag keeps its behavior: it opens the dialog in row 6, otherwise it focuses this section.
- The director-only conversion-review notice stays as it is.
- None of these actions changes conversion authority.

### 6. Success behavior

- The dialog keeps its in-dialog `role="status"` panel as the single confirmation. There is **no additional toast**, to avoid announcing twice. The heading depends on the result:

  | Result | Heading |
  | --- | --- |
  | Submitted | **Pré-inscription créée** |
  | Trial | **Essai démarré** |
  | Under Review (existing enrollment linked) | **Inscription rattachée** |
  | Confirmed or Validated linked | **Inscription confirmée rattachée** |

- The panel shows learner · program · year, then one of these lines:
  - QUALIFIED: "Le prospect reste qualifié : l’inscription n’est pas encore confirmée. Elle sera confirmée par le parcours habituel (paiement ou validation)."
  - CONVERTED: the existing "Le suivi commercial est terminé" text.
- **Follow-up line** from the new result field `enrollment_followup`:
  - created: "Suivi « Finaliser l’inscription » prévu le {date} à {heure}.";
  - kept: "Le suivi d’inscription déjà prévu est conservé : {date} à {heure}.";
  - field absent (a replayed pre-migration result): "Le suivi d’inscription apparaît dans Prochaine action."
- **Terminé** closes the dialog. The refreshed drawer shows the opportunity still **Qualifié**, the pre-enrollment card with **Continuer l’inscription**, and the "Finaliser l’inscription" next action with its server civil time.
- Activities and tasks are unchanged: `enrollment_started`, `task_created`, and audited duplicate enrollment-task cancellations.

## Architecture / design

- **Mechanism:** use PostgreSQL `RAISE … USING ERRCODE, MESSAGE, HINT`. PostgREST returns `hint` in the JSON error, and supabase-js exposes it on the error object `crmRpc` throws. Changing messages or SQLSTATEs was rejected because it would break old screens and existing tests. The `HINT` is additive.
- **Function edit discipline:** copy `crm_start_enrollment` **verbatim from 084** and change only the enumerated edits in the [contract](#implementation-contract):
  - split the conflated conditions, keeping the same message per condition;
  - attach hints;
  - parse `birth_date` and `followup_at` explicitly, keeping the same message;
  - pre-check owner eligibility, Trial group, follow-up futurity and the calling window, with the same message and SQLSTATE their current path produces; `new_task` keeps validating as defense in depth;
  - compare the birth date with Casablanca today;
  - add `enrollment_followup` to the result;
  - add hints in the exception handler.

  Lock order, replay position, validation order, inserts, activities, the conversion call and follow-up selection are unchanged.
- **Pre-check equivalence:** each pre-check must be logically identical to the downstream condition it anticipates. A divergence, for example rejecting an input that previously succeeded, is a contract violation. The only documented widening is the Casablanca birth date.
- **Browser modules:**
  - a pure reason table, `enrollmentErrors.mjs`;
  - pure date bounds and the CTA rule, `enrollmentActions.mjs`;
  - the dialog and section consume them.

  The existing `commandError` remains the legacy fallback and is not changed for other commands.
- **Reads:** `crm_get_enrollment_context` gains `linked_student`, using the same `require_reader` authorization and fields that `crm_find_student_candidates` already exposes:
  - an active learner: `{id, name, birth_date, available: true}`;
  - a soft-deleted or missing learner: `{id, available: false}`, with no name or birth date;
  - no linked learner: null. The drawer's existing open-task projection supplies an existing enrollment follow-up.

## Server / database implications

| Question | Answer |
| --- | --- |
| Frontend-only? | No, under recommended D1. A frontend-only variant is described in D1 option B. |
| Server/RPC change | Yes: `public.crm_start_enrollment` replaced, same signature. |
| New migration | Yes: one migration, expected `112_crm_rcc_a2_enrollment_ux.sql`. Confirm the ceiling at implementation time. |
| Guarded functions | `crm_start_enrollment` is enrollment/conversion-integrity code. `crm_security.command`, `new_task`, `evaluate_conversion`, `create_charge_payment`, triggers and `next_window` are **not** modified. |
| New error contract | Yes: the `crm_enrollment.*` hint vocabulary, a closed list in this plan. |
| Schema changes | None. No table, column, constraint, index or trigger. |
| Permission/RLS changes | None. Grants are re-asserted identically to 084. An optional private raise helper in `crm_security` is revoked from all API roles. |
| Task-engine changes | None. |
| Data changes | None. No backfill or repair. |

## Security / authority boundaries

- No new grant, policy, role capability or public function. `require_reader` is unchanged, and direct-table access stays revoked.
- Hints are drawn from the enumerated list only: no learner names, dates, UUIDs, SQL or table names. Tests assert this.
- `linked_student` exposes only fields that `crm_find_student_candidates` already returns to the same roles. It contains no contact, finance or acquisition data.
- Conversion still happens only through `evaluate_conversion` on linked Confirmed/Validated enrollment. `initial_status` stays limited to Submitted/Trial (`42501` is preserved). Finance, Meta/lifecycle and RCC-A1 are untouched.

## Compatibility

| Combination | Result |
| --- | --- |
| Old frontend + new database | Identical behavior. SQLSTATE and message are unchanged per condition, and the old UI ignores `hint`, `linked_student` and `enrollment_followup`. The only difference is a Casablanca-today birth date accepted in the 00:00–01:00 window. |
| New frontend + old database | No hints, so the legacy matcher and generic fallback apply. Linked-learner preselection is absent (no `linked_student`), so today's behavior applies. The follow-up line uses the "Prochaine action" fallback. No incorrect action is possible. |
| Replays | Results stored before the migration lack `enrollment_followup`, and the UI tolerates that. Replay still precedes validation. |
| Direct RPC callers | Same acceptance set, except the documented birth-date widening. They gain hints. |

## Migration strategy

- Forward-only `CREATE OR REPLACE` of the two functions inside one transaction. Re-assert the 084 `revoke`/`grant` lines for both, then `notify pgrst, 'reload schema'`.
- Deployed migrations 001–111 are immutable. Allocate the number only after confirming the `111` ceiling on `origin/main`, remote branches and CURRENT_STATE.

## Testing strategy

| Layer | Content |
| --- | --- |
| Pure (`scripts/test-crm-rcc-a2.mjs`) | Reason table completeness: every listed reason has a message, step and field. The fallback never renders raw text. CTA state machine rows 1–8. Casablanca birth `max` and follow-up `min` across the 00:00–01:00 boundary. |
| SQL acceptance (`scripts/test-crm-rcc-a2.sql`, rollback-only) | Every reason: SQLSTATE, **unchanged message** and exact hint. Happy paths. Replay. Authority checks. |
| Upgrade (`scripts/test-crm-rcc-a2-upgrade.mjs`, 111→112) | Only the two functions changed; other function bodies, grants, RLS, triggers, table hashes and row counts are identical; no backfill. |
| Browser (`scripts/test-crm-rcc-a2-browser.mjs`) | Field focus and step navigation, linked learner, follow-up presentation, CTAs, success panel, no raw text. |
| Concurrency | The existing `scripts/test-crm-phase6-concurrency.py` must pass. Add a linkage race: two sessions, one linking, one submitting new, giving exactly one student and the expected reason. |
| Regression | Phase-6 SQL/browser, RCC-A1 SQL/browser/pure, opportunities, work-calendar, lifecycle/R4 suites, `npm test`, lint, build. |
| CI lane | **full**, because migration, `src/`, `scripts/` and `verify.yml` change. |

The full matrix is in the [contract](#acceptance-criteria).

## Rollout / recovery strategy (design only; no rollout authorized)

1. Use the same release order as RCC-A1: **migration first**, then merge and deploy the frontend. Old frontend + new database is fully compatible.
2. Release verification would use bounded, rolled-back synthetic probes, as RCC-A1 did, under separate release approval:
   - the hint is present for a future birth date and for a past follow-up;
   - `linked_student` is projected;
   - grants and other function bodies are unchanged;
   - lifecycle is dormant.
3. Recovery:
   - **Frontend:** revert (safe with the new database).
   - **Database:** forward-fix with a new migration restoring the 084 body. Hints are additive, so a database rollback should rarely be needed.
   - **Data:** none is written by the migration, so no data repair is needed.

## Expected modules / files

- `supabase/migrations/112_crm_rcc_a2_enrollment_ux.sql` (new; number provisional)
- [CrmEnrollmentDialog.jsx](../../../src/components/crm/CrmEnrollmentDialog.jsx), [LeadEnrollmentSection.jsx](../../../src/components/crm/LeadEnrollmentSection.jsx), and [LeadDetailSheet.jsx](../../../src/components/crm/LeadDetailSheet.jsx) (props pass-through only, if needed)
- `src/lib/crm/enrollmentErrors.mjs`, `src/lib/crm/enrollmentActions.mjs` (new, pure)
- [students/[id]/page.jsx](../../../src/app/(admin)/students/[id]/page.jsx): an `id="inscriptions"` anchor on the existing section only
- `scripts/test-crm-rcc-a2.sql`, `scripts/test-crm-rcc-a2.mjs`, `scripts/test-crm-rcc-a2-upgrade.mjs`, `scripts/test-crm-rcc-a2-browser.mjs` (new), plus [package.json](../../../package.json) and [verify.yml](../../../.github/workflows/verify.yml) wiring
- Documentation: this plan's implementation record, [RCC-r1](rcc-r1-receptionist-crm-completion.md), [WORKFLOWS](../../ai/WORKFLOWS.md#crm--enrollment), [PRODUCT_RULES](../../ai/PRODUCT_RULES.md#conversion-and-finance) (birth-date and linked-learner rules), [ARCHITECTURE](../../ai/ARCHITECTURE.md) (the error-reason contract) and [FEATURE_INDEX](../FEATURE_INDEX.md)

## Owner decisions required

Approving "as recommended" resolves D1–D6 together. D7 does not block.

### D1 — Error contract mechanism

- **Question:** Should field-specific errors be backed by server reason codes, or by browser-only diagnosis?
- **Option A:** Server reason codes in the PostgreSQL `HINT`, with SQLSTATE and message unchanged. This needs one migration.
- **Option B:** Frontend only, with no migration. The browser pre-validates and, on an ambiguous server message, refetches state and infers the cause.
- **Consequences:**
  - A gives a stable, tested contract that also serves direct callers and survives message edits. It is Tier 3, with full CI and migration-first release.
  - B is smaller, but it still matches English message text. It cannot separate the five `Invalid new learner` causes or the `record_rejected` catch-all without racy inference, which is the guessing this task forbids. It also cannot preselect a linked learner by name, and it cannot show the follow-up time in the success panel.
- **Recommendation:** **A.**
- **Blocks implementation:** Yes. It determines whether a migration is needed and the scope.

### D2 — Future birth date enforcement

- **Question:** Where should a future birth date be prevented?
- **Option A:** Browser only.
- **Option B:** Server only, as today.
- **Option C:** Both: browser `max` and inline error, plus the existing server rule with a reason code, compared against the Casablanca date.
- **Consequences:**
  - A would weaken data integrity for direct callers if the server rule were removed. Keeping the server rule without a reason code leaves the generic message.
  - B keeps the poor experience.
  - C prevents the error up front and keeps integrity. It widens acceptance by one day for one hour (Casablanca vs UTC).
- **Recommendation:** **C.** "Today" stays allowed; A2 adds no minimum-age rule.
- **Blocks implementation:** Yes, but narrowly.

### D3 — Linked learner UX

- **Question:** How should the dialog behave when the opportunity is already linked to a learner?
- **Option A:** Preselect the linked learner. Hide the candidates and **Créer un nouvel apprenant**, show a one-line explanation, and offer no override in A2.
- **Option B:** Show the candidates and **Créer un nouvel apprenant** disabled, with an explanation.
- **Consequences:**
  - A is the simplest path and cannot create a duplicate.
  - B shows choices that can never be used, which adds clutter.
  - Both keep the server invariant. Choosing a different learner would need a separate director correction tool.
- **Recommendation:** **A.**
- **Blocks implementation:** Yes.

### D4 — Follow-up presentation

- **Question:** How should the follow-up date be presented in the enrollment dialog?
- **Option A:** Default-first. Show the server default, an optional **Choisir une autre date** (with `min`), the existing follow-up when there is one (no input), and the actual time on success. Server semantics stay unchanged, with a reason code added.
- **Option B:** Replace the explicit date with RCC-A1-style reminder presets (`followup_preset` resolved by `crm_security.reminder_due`), with an explicit date as a secondary option.
- **Consequences:**
  - A changes no request contract and no scheduling semantics.
  - B matches the RCC-A1 reminder style, but it adds a request key, changes enrollment-follow-up resolution, and needs more tests.
- **Recommendation:** **A.** Presets can follow later.
- **Blocks implementation:** Yes.

### D5 — Contextual actions and the "Continuer" destination

- **Question:** Should the drawer use the single-action rules in [§5](#5-contextual-enrollment-actions), and where should **Continuer l’inscription** go?
- **Option A:** The learner file's **Inscriptions et groupes** section, where pre-enrollment edits, documents and payment actions already are.
- **Option B:** Directly to **Encaisser un paiement** (`/receipts/new?student_id=…`).
- **Consequences:**
  - A reuses one safeguarded place for every next step and adds only an anchor.
  - B is faster for payment-first families, but it assumes payment is always the next step. The receipt form has no enrollment prefill and must still require explicit CRM-enrollment selection.
- **Recommendation:** **A**, with the rule table as written.
- **Blocks implementation:** Yes.

### D6 — Broader generic follow-up consolidation

- **Question:** Should the "at most one open generic callback/WhatsApp follow-up from every path" invariant be implemented in this A2 batch?
- **Option A:** Include it in RCC-A2.
- **Option B:** Keep it as a separate future outcome.
- **Consequences:**
  - The two changes are architecturally independent. A2's enrollment follow-up (`enrollment_followup`) is not a generic follow-up, and A2 touches neither `crm_security.command` nor `crm_security.new_task`.
  - The invariant would have to be enforced in exactly those two migration-103/111-safeguarded objects, the most central and most guarded task code, across six creation paths (manual Planifier, wrong number, complete and cancel with next task, reopen) and their interplay with the RCC-A1 wrapper and cadence tasks.
  - It would also raise a separate question about existing Production duplicates, which needs Production observation.
  - Bundling would roughly double A2's blast radius and review surface for a different outcome (follow-up integrity, not enrollment UX). CI savings are not a justification.
- **Recommendation:** **B.** Record it as a separate future outcome with its own architecture. Its candidate enforcement point is the `new_task` primitive, under the existing lead lock, with audited supersession. Its paths, concurrency, legacy duplicates and full test matrix are designed there, not here.
- **Blocks implementation:** Yes, as a scope decision. Under B, A2 proceeds without it.

### D7 — Optional Production forensic read (not required for architecture)

- **Question:** Should a read-only Production observation be authorized to try to identify the original failure?
- **Option A:** Authorize a bounded read-only observation: **(i)** the database or PostgREST log entry for the owner's failed `crm_start_enrollment` call, at a time the owner supplies (SQLSTATE and message only); and/or **(ii)** count-only aggregates, with no rows:
  - leads with `student_id` set and no enrollment;
  - QUALIFIED unlinked leads whose owner is not operational staff;
  - QUALIFIED leads linked to a Rejected enrollment.
- **Option B:** No Production access now.
- **Why repository evidence is insufficient:** only Production shows which branch fired, and whether the dead-end states exist.
- **Sensitive exposure:**
  - Log entries can carry request bodies with a child's name, birth date and contact details.
  - Aggregates expose counts only.
- **Consequences:** The design already handles every branch and dead end explicitly, so the result is forensic, not architectural. After release, the reason codes make any recurrence self-identifying.
- **Recommendation:** **B.** If wanted, authorize only (ii) during later release verification.
- **Blocks implementation:** **No.**

## Recommended risk tier

**Tier 3.** A2 replaces a Production SECURITY DEFINER enrollment/conversion-integrity function, the only CRM path that creates students and enrollments and links them to opportunities. AGENTS lists conversion/enrollment integrity, and migrations affecting Production invariants, as Tier 3. A small diff does not lower the tier. Required flow:

1. owner approval of this plan;
2. a separate implementation task;
3. full CI;
4. fresh independent exact-SHA review;
5. owner release approval;
6. a separate release/operator task (migration first);
7. Production verification;
8. documentation closeout.

---

## IMPLEMENTATION CONTRACT

**Not authorized until the owner records approval of revision A2-r1 (date, decisions D1–D6 as chosen, approved plan revision) in this file and in [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md).** This contract assumes the recommended options. Any other choice requires the matching amendment before implementation.

### Authorized scope (upon approval)

Implement product behavior §1–§6 of this plan for the receptionist CRM enrollment entry flow, through one forward migration and the frontend modules listed below.

### Prerequisites

1. Fetch `origin/main`. Create a dedicated `feature/rcc-a2` branch or worktree.
2. Confirm the migration ceiling is still `111` on `origin/main`, on every remote branch and in CURRENT_STATE. Otherwise STOP and re-allocate with the owner.
3. Confirm `public.crm_start_enrollment` and `public.crm_get_enrollment_context` are still defined only by 084. Verify that the local function bodies at ledger 111 are byte-identical to 084.
4. Run local Supabase with synthetic data only.

### Object and module manifest

| Object | Change |
| --- | --- |
| `public.crm_start_enrollment(uuid,jsonb)` | `CREATE OR REPLACE` from the 084 body with **only** the edits E1–E9 below |
| `public.crm_get_enrollment_context(uuid)` | `CREATE OR REPLACE` from the 084 body, adding the `linked_student` key only |
| Optional `crm_security.enrollment_reject(code text, message text, reason text)` | Private raise helper. `revoke all … from public, anon, authenticated, service_role` |
| Grants | Re-assert 084's revoke and grant for both public functions, unchanged |
| Frontend | `enrollmentErrors.mjs`, `enrollmentActions.mjs` (new); `CrmEnrollmentDialog.jsx`, `LeadEnrollmentSection.jsx`, `LeadDetailSheet.jsx` (only if props require it); `students/[id]/page.jsx` (anchor only) |
| Tests and CI | The four new scripts; `package.json` scripts; the `verify.yml` full-lane local-database and browser steps |

**Edits to `crm_start_enrollment`.** Message text and SQLSTATE stay as in 084 for every condition, unless an edit says otherwise.

- **E1.** Lead check: split into `lead_unavailable` (not found or merged) → `lead_already_enrolled` (`enrollment_id` set) → `lead_not_qualified`. All three keep `22023 Qualified unlinked lead required`. The version check stays after them.
- **E2.** Program and year check: split into `program_invalid`, `school_year_invalid` and `notes_too_long`. All three keep the same message. `initial_status` keeps `42501` with hint `initial_status_not_permitted`.
- **E3.** Birth date: parse `birth_date` in place inside a sub-block. On a parse error, raise `22023 Invalid enrollment fields or incompatible group` with `birth_date_invalid`. In the new path, split `Invalid new learner` into:
  - `learner_already_linked` (`lead.student_id` set);
  - `request_invalid` (`student_id` or `enrollment_id` present);
  - `learner_name_invalid`;
  - `birth_date_future`, comparing against `(now() at time zone 'Africa/Casablanca')::date`;
  - `birth_date_invalid` (not finite).

  The candidate token check (`40001`) gets `candidates_changed`; the confirmation check gets `new_learner_confirmation_required`; a missing choice gets `learner_choice_required`.
- **E4.** Existing path: split `Student unavailable or inconsistent` into:
  - `linked_learner_unavailable`: the requested id equals `lead.student_id` and is not active;
  - `learner_link_mismatch`;
  - `learner_unavailable`.
- **E5.** Selected enrollment: split into `enrollment_incompatible`, `enrollment_already_linked`, `enrollment_group_incompatible` and `enrollment_changed` (`40001`).
- **E6.** No selected enrollment: `existing_enrollment_needs_review`; then `existing_enrollment_linked_elsewhere` when every matching non-Rejected enrollment is linked to a lead, otherwise `existing_enrollment_requires_selection`. Both keep the message `Existing enrollment requires explicit selection`. Also add `group_incompatible` and `level_invalid`. Add a pre-check before the enrollment insert: `Trial` without a group raises `22023 Invalid enrollment fields or incompatible group` with `trial_requires_group`.
- **E7.** Follow-up branch only, where no open `enrollment_followup` exists. Apply these pre-checks before `new_task`, in this order:
  1. Parse `followup_at` in a sub-block. A parse error raises `22023 Invalid enrollment fields or incompatible group` with `followup_invalid`, which is the handler's message today. An infinite value raises `22023 Finite due time required` with `followup_invalid`, which is `next_window`'s message today.
  2. Compute `due := next_window(...)` exactly as today. If it raises `Policy has no available calling window`, re-raise the same SQLSTATE and message with `followup_policy_unavailable`.
  3. If `due < now()`, raise `22023 Valid future task required` with `followup_in_past`.
  4. If the lead owner is non-null and has no profile with role `director`, `admin` or `receptionist`, raise `22023 Assignee must be operational staff` with `owner_not_operational`. This is the same predicate as `assert_staff`.

  This order reproduces today's order: `next_window`, then `new_task`'s due check, then its assignee check. Then call `new_task` unchanged.
- **E8.** Result: append `enrollment_followup` = `{id, created boolean} || crm_security.scheduled_civil(due_at)` for the open enrollment follow-up after the operation, or `null` when the opportunity converted. The stored result includes it.
- **E9.** Exception handler: keep the same mappings and messages, adding the hints `concurrent_change` and `record_rejected`. The intent lock keeps its French message and adds `enrollment_in_progress`. The replay conflict adds `request_conflict`. The bounded-payload check adds `request_invalid`. The lead-version `40001` adds `lead_changed`.

Nothing else changes, including: lock acquisition order, replay position, the new-student name lock, inserts, the activity source key, `evaluate_conversion`, follow-up keep/cancel logic and the result base.

### Invariants

1. Initiation never converts. Only `evaluate_conversion` on a linked Confirmed/Validated enrollment converts.
2. No new student is ever created when `lead.student_id` or `lead.enrollment_id` is set, nor without candidate review.
3. Lock order, replay-before-validation, payload-hash conflicts and `expected_version` checks are unchanged.
4. SQLSTATE and message are unchanged for every pre-existing condition. Hints are the only additive error data, drawn from the enumerated list.
5. No grant, RLS, trigger, table or other function changes. `crm_security.command`, `new_task`, `next_window`, `evaluate_conversion` and `create_charge_payment` are byte-identical.
6. Follow-up semantics are unchanged: the default, window resolution, the resolved-time rule, keeping the earliest existing follow-up while ignoring a supplied value, and `schedule_kind` NULL.
7. RCC-A1 behavior, the failed-call cadence, Meta/lifecycle dormancy and finance are unchanged.
8. The browser never renders raw server `message`, `details`, `hint`, SQLSTATE or identifiers.

### Acceptance criteria

**Enrollment happy path:**

- A new learner with all optional fields blank creates a Submitted pre-enrollment.
- The opportunity stays QUALIFIED, with `enrollment_started` and one open `enrollment_followup` (default time).
- The result has `enrollment_followup.created = true` with a civil date and time.
- The drawer then shows **Continuer l’inscription**.
- Trial with a group works, and linking an existing unlinked enrollment works.
- Linking an existing Confirmed enrollment converts the lead, as today, and shows **Ouvrir l’apprenant**.

**Birth date:**

- Blank: accepted.
- A valid past date: accepted.
- Today (Casablanca): accepted in the browser and on the server. The browser bound has a fixed-clock unit test that includes 00:30 Casablanca. The SQL suite asserts that Casablanca today is accepted and Casablanca tomorrow is rejected.
- Tomorrow: blocked in the browser with an inline message; the server gives `22023` with the same message and hint `birth_date_future`.
- A malformed string through a direct RPC gives `birth_date_invalid`.
- The existing-learner path is unaffected.

**Existing learner:**

- A lead with `student_id` (synthetic) gives `linked_student` in the context. The dialog preselects it and shows no candidates and no "Créer". Submission succeeds on that learner.
- A direct `new` request gives `learner_already_linked` with no student insert (counts unchanged).
- Choosing another learner gives `learner_link_mismatch`.
- A deleted linked learner gives `linked_learner_unavailable`, and submission is unavailable.
- **Race:** session A links the lead while session B's dialog submits "new". B gets `lead_already_enrolled` or `learner_already_linked`, exactly one student exists, and B's UI moves to the linked state.
- Linked elsewhere: the step-2 explanation appears and the server gives `existing_enrollment_linked_elsewhere`.

**Follow-up:**

- None supplied: the default applies.
- A valid future time is accepted and resolved to the window. The success panel shows the server civil time.
- A past value: blocked in the browser; through a direct RPC, `followup_in_past`.
- A value typed while the dialog was open and now past: blocked at submit and returned to step 2, not moved.
- Malformed: `followup_invalid`.
- An existing open enrollment follow-up: no input shown, no `followup_at` sent, and `created = false` with that task's time.
- A past `followup_at` sent directly with an existing follow-up still succeeds (unchanged semantics).
- A policy without windows: `followup_policy_unavailable`.
- A non-operational owner: `owner_not_operational`, with no partial writes.
- An identical retry after the response was dropped replays with the same key, even after the time passes. A changed value uses a new key.

**Contextual actions:** rows 1–8 of §5, each with exactly one action or none. Rejected shows no "Finaliser" text. A CONVERTED lead shows **Ouvrir l’apprenant**. **Continuer** lands on `#inscriptions` and Retour returns to the drawer context. The drag entry point keeps its behavior.

**Errors:**

- Every reason in §1 is produced by SQL with SQLSTATE, the unchanged message and the exact hint, and maps in the browser to its French text, step and field.
- An unknown hint, or none, with `22023` gives the legacy matcher, otherwise the generic fallback.
- A network drop gives the uncertain-retry text with the key preserved.
- A DOM scan finds no SQL, table, function or English server text, UUID or hint token rendered.

**Security / authority:**

- Receptionist, admin and director execute the RPC; anon and other roles are denied, as today.
- Grants and RLS on all objects equal the 111 baseline.
- No conversion on initiation.
- `initial_status=Confirmed` gives `42501`.
- Finance tables and `create_charge_payment` are unchanged.
- Lifecycle cron is inactive and no outbox rows are produced by initiation beyond today's behavior.
- The private helper, if added, is non-executable by API roles.

**Upgrade:**

- 111→112 on a stateful synthetic database: only the two function definitions differ.
- All other function bodies, grants, policies, triggers, table hashes and row counts are identical, with no backfill.
- Results stored before the migration replay unchanged.

**Compatibility:**

- The old frontend, the RCC-A1 dialog code at `f1b8ba8`, against the new database gives identical texts for every scenario above (as a browser test or a pure assertion over the legacy `commandError`).
- The new frontend against a stubbed hint-less error gives the fallback behavior.

**Required suites:**

- the new suites above;
- `test-crm-phase6.sql`, `test-crm-phase6-browser.mjs`, `test-crm-phase6-concurrency.py`;
- the RCC-A1 SQL, upgrade, pure and browser suites;
- opportunities, work-calendar and lifecycle/R4 suites;
- `npm test`, `npm run lint`, `npm run build`;
- **full** CI lane green on the exact head SHA.

### Compatibility requirements

- **Release order:** migration first, then frontend. The frontend must also run correctly against the 111 database (fallback mode).
- No request-key or payload-shape change. `linked_student` and `enrollment_followup` are additive and optional for consumers.

### Stop conditions

STOP and return to the owner or architecture if any of these occurs:

- The migration ceiling is not 111, or another branch has allocated the number.
- Any change to `crm_security.command`, `new_task`, `next_window`, `evaluate_conversion`, `create_charge_payment`, triggers, grants, RLS or schema appears necessary.
- A pre-check cannot be made logically equivalent to its downstream condition.
- Any pre-existing condition's SQLSTATE or message would change.
- Linked-learner handling seems to require relinking, unlinking or merging students or leads.
- Production data, logs or configuration access appears necessary.
- The upgrade test shows a difference outside the manifest.
- A test failure cannot be fixed without weakening a check.

### Documentation and status updates (implementation PR)

- Add an implementation record to this plan: branch, base SHA, the migration filename, validation evidence, and any deviation, which must be none or owner-approved.
- Update the RCC-r1 phase table to "IMPLEMENTED — awaiting review" (not deployed).
- WORKFLOWS: CRM → enrollment contextual actions and linked-learner behavior.
- PRODUCT_RULES: a birth date cannot be after today (Casablanca); an opportunity linked to a learner can only enrol that learner; a pre-enrollment shows Continuer, not conversion.
- ARCHITECTURE: the enrollment reason-hint contract.
- FEATURE_INDEX: the migration entry.
- CURRENT_STATE is **not** updated until release evidence exists.
- Add an ADR only if the owner decides the hint convention should become CRM-wide.

### Explicit exclusions

- Generic follow-up consolidation (D6 B).
- Reminder presets for the enrollment follow-up.
- `schedule_kind` for the enrollment follow-up.
- Director link correction tools.
- Finance, receipt or payment changes.
- Conversion or permission changes.
- Meta/lifecycle.
- RCC-B1 visual or responsive work.
- Walk-in redesign.
- Historical backfill or repair.
- Production reads or mutations.
- Merge or deploy without the separate Tier-3 review and release gates.
