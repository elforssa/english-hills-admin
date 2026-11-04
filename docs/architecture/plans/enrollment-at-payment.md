# Enrollment at payment — retire pré-inscription and essai, revision EAP-r1

**Status: PROPOSED — PLAN ONLY, NOT APPROVED.** Owner decisions 1–7 of 2026-11-04 (Maroine) are recorded below and in [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md#enrollment-at-payment--retire-pr%C3%A9-inscription-and-essai--planned--not-approved-2026-11-04); the open decisions Q1–Q10 are under [Owner decisions required](#owner-decisions-required). Nothing is implemented, merged, applied or deployed; no Production read, count or mutation has occurred. Risk tier: **3** (enrollment/conversion integrity, finance function, existing Production data, a database guard, a public endpoint). Owner: Maroine. Baseline: `origin/main` `89fb68383e6066a163ae4836711ce2e10df66bee` (PR #180 merge, docs only); Production ledger 001–126 per [CURRENT_STATE](../../ai/CURRENT_STATE.md#deployment-and-credential-evidence-boundaries); next free migration number **127** (provisional, re-read at implementation). Pattern: [Premium retirement](premium-retirement.md) (retire, keep history readable, counted data step, drop later if ever). Planned, implemented, merged, deployed and Production-verified are distinct states.

# Owner summary

**Enrollment at payment.** Today an enrollment is born as a « pré-inscription » (Submitted, Under Review) or an « essai » (Trial), waits for a payment, and a reception payment confirms it only from 10 % of the net price; below that the director has to confirm. From this release, **an enrollment exists only once it is paid**: reception enrolls and collects in one step, any payment above zero confirms, and the remaining balance stays tracked as today (« Acompte versé », « En retard »). The three waiting statuses and the « Pré-inscriptions » page are retired, never dropped: old rows stay readable in the learner file, and a database guard prevents any new one.

## What will change

- **One flow, « Inscrire et encaisser »**, for walk-ins (from the learner file or the receipt form) and for CRM prospects (from the prospect panel): programme, school year, level, group (optional), price, discount with its reason, payment. One click creates the confirmed enrollment and the receipt together; a chosen group is assigned right after (a full group never blocks the payment: the learner is then « Inscrit — groupe à affecter »).
- **Any payment above zero confirms** (owner decision 2 withdraws Batch E Q5 = B). The message « Acompte inférieur à 10 % … » and the director list « Acomptes inférieurs à 10 % en attente de confirmation » disappear.
- **A CRM prospect becomes « Converti » at that moment** and its « Finaliser l'inscription » task closes, through the existing trusted conversion rule (unchanged: only a linked Confirmed/Validated enrollment converts).
- **« Pré-inscription » and « Essai » disappear** from reception, the CRM dialog, the learner file, the enrollments page, the dashboard, the Students list filters, the public form, the parent portal and the guide. The « Pré-inscriptions » page is removed; « Clôturer l'année » moves (Q7).
- **The public self sign-up is turned off**: `/inscription` becomes a short « contact us » page (call, WhatsApp, visit) and `/api/public/inscription` refuses with 410. The website's « S'inscrire » buttons are changed in a separate small eh-website PR (listed below); its contact/inquiry form (`/api/public/crm-inquiry`) is untouched.
- **Existing data** (counts first, on a read-only Production query): unpaid pré-inscriptions and essais are **archived** (status « Terminée » with the reason « Pré-inscription abandonnée » or « Essai terminé »), never deleted; every pré-inscription or essai with a live payment becomes confirmed (Validated when it has a group), which converts its CRM prospect; prospects whose pré-inscription was archived are detached from it so they can be enrolled again (Q6).

## What staff/users will be able to do

- **Reception:** enroll and collect in one step for a walk-in or a prospect; give a discount with a reason as today (Batch H); assign the group at the same time or later. A fully discounted enrollment (100 %, with a reason) is confirmed without a receipt and listed in « Contrôles » (Q1, recommended).
- **Director / admin:** the same flow; « Contrôles » keeps its four sections, the 10 % section replaced by « Inscriptions confirmées sans paiement » (Q3).
- **Nobody** can create a pré-inscription or an essai any more: reception, management, the public form, the parent portal and any direct write are refused by the database with one French message.

## What remains restricted

- Roles, RLS, the finance engine's numbering, discounts, dates and idempotency, the enrollment/group invariants of Batch D and H, and the conversion authority are unchanged. Reception still cannot void, correct, end or reopen an enrollment, nor exceed a group's capacity.
- Conversion still comes only from a trusted linked Confirmed/Validated enrollment; the new flow produces exactly that, in the same transaction as the receipt.
- No new permission is added. Two reception-reachable functions lose their pre-enrollment branch; one CRM function loses its direct API grant and is reached only through the new wrapper.

## UI impact

- Learner file: the button « Nouvelle pré-inscription » / « Nouvelle inscription » becomes **« Inscrire et encaisser »** (opens the receipt form for that learner). « Modifier l'inscription » keeps level, date and notes; status is read-only; the group goes through placement as today.
- Receipt form (`/receipts/new`): a « Groupe (facultatif) » field for tuition sessions; the 10 % notice disappears; a 100 % discount shows « Inscription confirmée sans paiement, visible dans Contrôles ».
- Prospect panel: « Commencer l'inscription » becomes **« Inscrire et encaisser »**, a three-step dialog (learner, enrollment, payment); « Continuer l'inscription » disappears (no waiting state); the success panel says « Inscription confirmée · reçu EH-… ».
- Menu: « Inscriptions » (the « Pré-inscriptions » page) and « Formulaire public » are removed. Dashboard: the « Pré-inscriptions en attente » card becomes « Inscrits — groupe à affecter ».
- Students list: the « Essai (dossier) » filter value goes; « Groupe à affecter » only for a Confirmed enrollment without group.
- Guide (`/helpdesk`): C6 rewritten as one step; Q3 and Q7 rewritten; status reference cards, the message table and « J'ai fait une erreur » updated; four screenshots retaken (s08, q02b, q07, q07b).
- Labels of historical rows stay readable: « Soumise », « En cours d'examen », « Essai », « Refusée » only appear on old rows and on ended ones (with their reason).
- Public: `/inscription` becomes a static contact page (no form, no Turnstile); the privacy page's pré-inscription paragraphs are reworded (historical consent rows keep their stored policy version string).

## Database impact

- **One forward migration (provisional 127)**, no table dropped, no column dropped, the status check constraint unchanged (old values stay valid for history):
  - a guard trigger on `enrollments` refusing any new row, or any transition, **into** Submitted, Under Review, Trial (and Rejected, Q5);
  - `create_charge_payment` re-created from its 122 body without the 10 % branch, with the free-enrollment branch (Q1) and the detach-aware link check;
  - `get_finance_review_queue` re-created from 122 with section (d) replaced (Q3);
  - `crm_start_enrollment` re-created from 125 to create only Confirmed enrollments, API grant revoked; new wrapper `crm_enroll_and_collect` (enrollment + payment in one transaction);
  - `save_receptionist_enrollment` (125), `create_enrollment` and `save_enrollment_changes` (120), `create_public_registration` (125) and `portal_request_reenrollment` (125) re-created so their pre-enrollment branches refuse;
  - `crm_security.protect_enrollment_link` (084) re-created to admit the archive step's detach under a transaction-local flag (Q6), the same exemption the approved [LIR-r1 step 2e](lead-intake-reliability.md) will reuse.
- **One separately approved, counted, journalled data step** (`supabase/manual/`), after the migration, in the same window: confirm the paid rows, archive the unpaid ones, detach the linked prospects, with a revert script from its journal (the Batch D clean-up pattern).
- **Nothing is dropped.** Dropping the three values from the constraint, the dead branches of readers that still list them, and the unused rate-limit scope is a later optional release (owner decision 6).

## Important security decisions

- **The payment function keeps the authority.** Confirmation still happens inside `create_charge_payment` (finance capability, stored role), in the same transaction as the receipt. The CRM wrapper composes the existing CRM command and the existing payment command; it adds no new authority and both inner commands keep their own idempotency.
- **A direct enrollment creation is closed for every role**, including `service_role` and the public form: the guard is a trigger, like the Batch D and H guards, so no RPC, policy or client can create a waiting enrollment.
- **The public endpoint is retired, not merely hidden**: the route answers 410 and the definer function it called refuses; the Turnstile secret, the website proxy secret and the inquiry endpoint are untouched.
- **The archive step converts prospects** (every paid pré-inscription becomes Confirmed, so its lead becomes CONVERTED through the existing trigger). This is the intended effect of owner decision 5 and is counted first (category B/C/E/G of the count query). The lifecycle outbox stays dormant: no destination, no epoch, no delivery (verified at R4).

## Risks / owner review points

1. **Q1 (free enrollment)** and **Q2 (enrollment without payment by management)** decide whether an enrollment can ever exist without a receipt. The recommendation keeps exactly one such path (100 % discount with a reason, listed in Contrôles).
2. **Q3**: placement from the group page today creates a Validated enrollment with no payment (Batch D, `academic_security.place`); the plan leaves it and lists such enrollments in Contrôles instead of blocking placement.
3. **Q6**: prospects linked to an archived pré-inscription must be detached, or they can never be enrolled again from the CRM (the link is immutable by design, 084).
4. **Learner files of archived pré-inscriptions become « Inactif »** (Q4), which is what a refused pré-inscription already does today; the file is then outside the default Students list.
5. **The archive step changes statuses on Production rows** and converts leads. It is journalled and reversible before the next payment on those rows; after that, reversal is a reviewed forward correction.
6. **Rollout order is migration first, app within minutes, outside reception hours.** Between the two, the old application refuses pre-enrollment creation with the guard's French message and takes payments without the 10 % rule; nothing else breaks.
7. **The website keeps pointing at `/inscription` until its PR is merged**; the page shows the contact information meanwhile, so no visitor meets an error.

---

# Verified current state

## Baseline and evidence limits

- **Baseline:** freshly fetched `origin/main` = `89fb68383e6066a163ae4836711ce2e10df66bee`. Latest migration file `126_crm_lead_ad_source.sql`; the Production ledger is 001–126 ([CURRENT_STATE](../../ai/CURRENT_STATE.md#deployment-and-credential-evidence-boundaries)). The next free number is **127**; re-verify at implementation.
- **Method:** static inspection of migrations 001–126, `src/`, `scripts/`, `docs/` and the local eh-website checkout (branch `crm-website-inquiry-integration`, `origin/main` `a550b15`). No test was run, no local database started, **no Production read, count or mutation occurred**. Every Production fact (how many pré-inscriptions, essais, linked leads exist) is unknown and is produced by the read-only count query in R0.
- Line numbers below are those of the baseline files; they orient the implementer and are re-read with `pg_get_functiondef` on a local database before any function is re-created.

## Cumulative database architecture (latest definitions) — dependency inventory

| Concern | Latest definition | Dependency on Submitted / Under Review / Trial or on the 10 % rule | This plan |
| --- | --- | --- | --- |
| `enrollments.status` check | [120](../../../supabase/migrations/120_enrollment_group_consistency.sql) line 33: `Submitted, Under Review, Confirmed, Validated, Rejected, Trial, Ended` | Values allowed. Also 120 lines 44–49: `enrollments_active_requires_group` (Validated/Trial need a group), `enrollments_confirmed_has_programme` (Confirmed/Validated/Trial need programme and year); unique index `enrollments_one_active_programme_year` (status not Rejected/Ended). | **Unchanged** (values stay readable). New guard trigger (D1). |
| `public.create_charge_payment(jsonb)` | [122](../../../supabase/migrations/122_finance_corrections_numbering_guardrails.sql) lines 596–797 (125 re-created only the inner function) | Reception 10 % block (lines 705–711, `v_confirmation_pending`); pending mapping on the linked enrollment (734–745: Submitted/Under Review → Confirmed or Validated, Trial → Validated, created as Under Review when pending); early return when no receipt (lines 639–641: zero payment creates no enrollment); result keys `enrollment_confirmation_pending` (790–797); candidate match list includes the retired values (695). | **Re-created** from 122 (D2, Q1). |
| `public.create_charge_payment_financial(jsonb)` | [125](../../../supabase/migrations/125_audit_follow_ups.sql) line 1269 | No status or threshold logic (H1 removed the discount cap). | Unchanged. |
| `public.get_finance_review_queue(date)` | 122 lines 874–941 | Section (d) `pending_confirmation` (921–938): status in the three retired values and paid × 10 < net. | **Re-created** (D5, Q3). |
| `finance_security.review_enrollment_without_live_payment` | 122 line 151 | Confirmed/Validated only. | Unchanged. |
| `public.crm_start_enrollment(uuid, jsonb)` | 125 line 1519 (from 084/112/117/119/120) | `initial_status` default Submitted, allowed Submitted/Trial (lines 1562, 1569, hint `crm_enrollment.initial_status_not_permitted`); `trial_requires_group` (1628); inserts the row with `initial_status` (1632); creates the « Finaliser l'inscription » follow-up when the lead is not CONVERTED (1640–1670). | **Re-created** (D3): Confirmed only, no group at creation; API grant revoked; reached through the new wrapper. |
| `crm_security.evaluate_conversion` | 120 line 1319 | Converts only on Confirmed/Validated; cancels every open task on conversion; flags review on a later downgrade. | Unchanged (it is the mechanism of decision 4). |
| `crm_security.enrollment_status_transition` (trigger `zz_crm_enrollment_status`) | [084](../../../supabase/migrations/084_crm_enrollment_and_conversion.sql) lines 116–124 | Calls `evaluate_conversion` on every status change of a linked enrollment. | Unchanged; it converts the paid rows during the archive step. |
| `crm_security.protect_enrollment_link` (trigger `crm_enrollment_link_immutable`) | 084 lines 8–16 | `crm_leads.enrollment_id` is immutable once set. | **Re-created** with the detach exemption (D7, Q6; aligned with [LIR-r1 2e](lead-intake-reliability.md)). |
| `crm_security.enrollment_summary`, `public.crm_get_enrollment_context` | 084 line 24; [112](../../../supabase/migrations/112_crm_rcc_a2_enrollment_ux.sql) line 164 | Pass the status through; no vocabulary. | Unchanged. |
| `public.receipt_enrollment_candidates(uuid)` | [096](../../../supabase/migrations/096_receptionist_operational_permissions.sql) line 715 | Lists every non-deleted learner enrollment with its status and `crm_linked`. | Unchanged (read). |
| `public.save_receptionist_enrollment(…)` | 125 line 1685 (from 096/117/120) | Pre-enrollment branch: `p_status` in Submitted/Under Review/Trial (lines 1740–1741), default `'Submitted'`; the other branch assigns a group to a Confirmed/Validated row. | **Re-created**: the pre-enrollment branch refuses (D4). |
| `public.create_enrollment(uuid, jsonb)` | 120 line 815 | Director/admin creation as Submitted or Under Review only (line 827). | **Re-created** to refuse (D4). |
| `public.save_enrollment_changes(uuid, timestamptz, jsonb)` | 120 line 860 | Status changes allowed into Submitted/Under Review/Trial/Rejected/Validated (883–887). | **Re-created**: status changes refused; level, date and notes unchanged (D4, Q5). |
| `academic_security.place` / `public.place_learner_in_group` | 120 lines 455–545 | Candidate list includes the retired values (474, 478, 497); **without any enrollment it inserts a Validated one** (line 525), i.e. an enrollment without payment. | Unchanged; **Q3**. |
| `academic_security.remove` / `remove_learner_from_group` | 120 lines 568–597 | Trial → Under Review on removal (595). | Unchanged; unreachable once no Trial row is live (asserted by the rehearsal). |
| `academic_security.end_enrollment`, `leave`, `end_group_enrollments`, `close_school_year`, `reopen_enrollment` | 120 lines 600–760 | Live-status lists include the retired values; reopen gives Confirmed. | Unchanged (readers of zero rows after the archive). |
| `public.sync_student_from_enrollments` | [121](../../../supabase/migrations/121_enrollment_group_consistency_enforce.sql) line 60 | Derives the file status: Enrolled from Confirmed/Validated, **Trial from a Trial enrollment**, Inactive from Rejected or Ended (a Prospect with only ended enrollments becomes Inactive), Prospect otherwise. | Unchanged; the Trial branch becomes dead. **Q4** states the consequence for archived files. |
| `academic_security.guard_student_membership` | 120 line 345 | Lists the retired values in its live checks. | Unchanged. |
| `academic_security.guard_enrollment_history` | 120 line 425 | Deleting a Submitted/Under Review/Rejected row is allowed. | Unchanged (the only screen that deleted is removed). |
| `enforce_enrollment_student_sync`, `check_enrollment_student_sync` | 120 lines 262–335 | Validated/Trial need a group; Confirmed with a group becomes Validated. | Unchanged. |
| `academic_security.guard_enrollment_group_year`, `guard_group_year` | 125 lines 88–145 | `v_live` lists the retired values. | Unchanged. |
| `academic_security.seats_taken`, `enforce_group_capacity` | 120 lines 146–200 | Count every non-Rejected enrollment in the group. | Unchanged. |
| Online module: `online_security.holds_seat`, roster and capacity | [117](../../../supabase/migrations/117_online_learning_pilot.sql) lines 581, 894, 973 | Seats are Confirmed/Validated only; Trial never counted. Guest invitations have a kind `'trial'` labelled « Essai » (117 lines 396, 1230; `src/app/(admin)/online/[id]/page.jsx` 173, 219) — a per-lesson guest, not an enrollment. | Unchanged; **Q9**. |
| `public.portal_request_reenrollment(uuid)` | 125 line 515 (from 123) | Inserts a Submitted enrollment for a parent's child (policy `enrollments parent insert` was dropped by 123 line 502; this function is the only parent path). | **Re-created** to refuse (D4, Q8). |
| `public.create_public_registration(jsonb, uuid, text)` | 125 line 393 (from 062) | Inserts the learner as Prospect and the enrollment as Submitted with the consent evidence (line 434); `service_role` execute only (062 line 62). | **Re-created** to refuse (D4). |
| Enrollment RLS | 006 (anon insert dropped by 025 line 26; receptionist insert dropped by 015), 077 `receptionist_enrollment_read`, 123 (parent insert/select dropped, projections) | No API role can insert directly except admin/director (`enrollments admin all`, 006). | Unchanged; the guard covers direct admin writes too. |
| Teacher roster projection | [123](../../../supabase/migrations/123_portal_readiness.sql) lines 537, 1210 | Reads Validated/Trial members. | Unchanged. |
| `search_students_page`, `report_*` | [124](../../../supabase/migrations/124_speed_as_the_centre_grows.sql) lines 1069–1079, 1242–1260 | Default list is Enrolled/Trial files; « Groupe à affecter » also for a Submitted/Under Review/Confirmed row without group. | Unchanged (zero rows); the browser side simplifies (D6). |
| `crm_security.command`, lifecycle outbox (098–104), Insights (114–116) | 125 line 694; 098–106 | No reference to enrollment statuses; Converted events come from the lead status. | Unchanged. |
| EGC clean-up revert | `scripts/egc-revert-m1.sql` (consumed) | Restores before-images under `eh.membership_sync` + `eh.enrollment_command`. | The new guard honours the same two-flag exemption, like 125's year guard. |

## Application inventory (verified)

- **Finance:** `src/lib/financeCorrections.mjs` (lines 14–21 `RECEPTION_CONFIRMATION_THRESHOLD`, `PENDING_CONFIRMATION_MESSAGE`; 66–72 `receptionConfirmationPending`), `src/components/receipts/ReceiptForm.jsx` (12, 211–214 candidate filter, 227–230, 330; no group field today), `src/app/(admin)/receipts/new/page.jsx` (13, 42 result messages), `src/components/finance/FinanceReviewQueue.jsx` (line 62 « Acomptes inférieurs à 10 % … »).
- **CRM:** `src/components/crm/CrmEnrollmentDialog.jsx` (step 2 « Démarrage » Pré-inscription/Essai, lines 33, 138–149; submit 84–89 `crm_start_enrollment`), `src/components/crm/LeadEnrollmentSection.jsx` (« Commencer l'inscription »), `src/components/crm/LeadDetailSheet.jsx` (128), `src/lib/crm/enrollmentActions.mjs` (`PRE_CONFIRMATION`, rows 3–5 « Continuer », `CREATED` labels), `src/lib/crm/enrollment.mjs` (`ENROLLMENT_STATUS` labels), `src/lib/crm/enrollmentErrors.mjs` (`initial_status_not_permitted`, `trial_requires_group` texts), `src/components/crm/CrmActionDialog.jsx` (34 « Suivi de pré-inscription »).
- **Enrollments and learners:** `src/app/(admin)/enrollments/page.jsx` (the « Pré-inscriptions » page: filter, « Nouvelle inscription », Valider with confirmation e-mail, Refuser, Supprimer, **« Clôturer l'année »** for the director), `src/components/students/EnrollmentModal.jsx` (status options, « Nouvelle pré-inscription », receptionist path through `save_receptionist_enrollment`, management path through `create_enrollment` / `save_enrollment_changes` / placement), `src/app/(admin)/students/[id]/page.jsx` (290–291 button and receptionist note; 1491 guide-like text), `src/app/(admin)/students/page.jsx` (197 status list, 330–332 « Essai (dossier) » filter, 485), `src/lib/enrollmentWorkflow.mjs` (`PENDING_PRE_ENROLLMENT_STATUSES`, `isPreEnrollment`, `isPendingPreEnrollment`, line 31), `src/lib/ui/presentation.mjs` (`DOSSIER_LABELS` Essai (dossier); `ENROLLMENT_LABELS`), `src/lib/statusColors.js` (13–18, 31), `src/app/(admin)/dashboard/page.jsx` (89 pending count), `src/app/(admin)/students-directory/page.jsx` (12, 124), `src/app/(admin)/students/import/page.jsx` (37, 137–152, 272, 349: Trial rows imported as Prospect — kept), `src/app/(admin)/settings/page.jsx` (679 role description), `src/app/(admin)/assessments/page.jsx` (162) and `teacher-portal/page.jsx` (480) filter Validated/Trial (reads, unchanged).
- **Routes and navigation:** `src/components/layout/Sidebar.jsx` (28 « Inscriptions » → `/enrollments`; 103 « Formulaire public » → `/inscription`), `src/lib/roleAccess.mjs` (51 `/enrollments` → `canManageAdmissions`), `src/lib/navigation.mjs` (4 return-screen allowlist), `src/middleware.js` (17 `/inscription` public).
- **Public form:** `src/app/inscription/page.jsx` (Turnstile, `PUBLIC_SESSION_TYPES`), `src/app/api/public/inscription/route.js` (origin check, rate limit scope `inscription:hour`, Turnstile, strict schema, `create_public_registration`), `src/lib/publicInscription.mjs`, `src/app/privacy/page.jsx` (34–56 pré-inscription wording). `/inscription-compte` is the account-activation page and is unrelated.
- **Portal:** `src/app/(admin)/parent-portal/page.jsx` (134–138, 302 « Demander une réinscription »), `src/lib/portal.js` (66).
- **Guide:** `src/app/(admin)/helpdesk/GuideContent.jsx` (C6 lines 619–677 two-step enrol; Q3 660, 891–899 the 10 % message; Q2 790–792 and 922 « Nouvelle pré-inscription »; Q7 1003–1035 the whole page; 1125, 1289, 1301, 1368, 1456–1458, 1491, 1612–1636, 1668 references and status cards), `HelpdeskNav.jsx` (25 « Q7 · Pré-inscriptions »), screenshots `public/helpdesk/s08-enroll.jpg`, `q02b-fiche-inscriptions.jpg`, `q07-preinscriptions.jpg`, `q07b-preinscription-formulaire.jpg`.
- **Website (separate repository `elforssa/eh-website`):** 12 « S'inscrire » links to `https://admin.english-hills.com/inscription` in 9 files of the working tree (`src/components/layout/Header.tsx` `PUBLIC_FORM_URL` lines 6, 106, 180; `src/app/page.tsx` 42, 372, 439; `about/page.tsx` 49; `souvenirs/SouvenirsBanner.tsx` 20 and `EnrollmentCTA.tsx` 30; `programs/kids/page.tsx` 50, 82; `programs/general-english/page.tsx` 72; `programs/business-english/page.tsx` 81). The contact page and `/api/public/crm-inquiry` integration are separate and untouched.
- **Docs:** [PRODUCT_RULES](../../ai/PRODUCT_RULES.md#conversion-and-finance) (initiation, Q5 = B, D3-A « Trial »), [SECURITY_RULES](../../ai/SECURITY_RULES.md#current-roles) (« Receptionist enrollment writes allow Submitted/Under Review/Trial »), [WORKFLOWS](../../ai/WORKFLOWS.md#crm--enrollment) (CRM → enrollment, placement « Retirer … Trial into Under Review », payment), [ARCHITECTURE](../../ai/ARCHITECTURE.md#core-workflows) (« Submitted/Trial initiation is not conversion »), [FEATURE_INDEX](../FEATURE_INDEX.md) (rows 12, 26, 34), [receipt model](../../receipt-financial-model.md) lines 187–191, [enrollment workflow README](../../../scripts/README-enrollment-workflow.md) lines 9–72, [website inquiries](../../crm-website-inquiries.md) line 5 (« official public pre-registration »), [ADR-003](../decisions/ADR-003-receptionist-operations-role.md#walk-in) (walk-in direction: same engine, no fake lead), [LIR-r1 2e](lead-intake-reliability.md) (detach design).

## Tests touching the retired values or the 10 % rule (counts of matches: Submitted / Under Review / Trial / threshold)

CI-wired SQL (`verify.yml`): `test-finance-batch-e.sql` (9/1/0/6; lines 526–541 are the Q5 = B cases), `test-receptionist-batch1.sql` (7/1/0/0), `test-receptionist-security.sql` (3/1/10/0), `test-receptionist-group-filter.sql` (3/2/3/0), `test-enrollment-group-consistency.sql` (18/6/17/0), `test-crm-rcc-a2.sql` (6/2/7/0), `test-crm-phase6.sql` (5/2/4/0), `test-crm-phase7.sql` (3/0/0/0), `test-crm-phase2.sql`, `test-crm-phase5.sql`, `test-crm-phase12-e2e.sql` (1 each), `test-paid-enrollment.sql` (1/0/0/0), `test-portal-readiness.sql` (3/0/0/0), `test-online-learning.sql` (9/3/6/0), `test-audit-follow-ups.sql` (6/1/4/0), `test-audit-remediation.sql` (2/0/5/0), `test-speed-as-the-centre-grows-fixture.sql` (2/0/3/0). CI-wired upgrade rehearsals: `test-egc-upgrade.mjs` (2/2/6), `test-crm-rcc-a2-upgrade.mjs` (1), `test-finance-batch-e-concurrency.py` (1). Node (`npm test`): `test-enrollment-workflow.mjs` (2/1/3), `test-membership-actions.mjs` (1), `test-receipt-client-regressions.mjs` (1/1/1/6), `test-report-data.mjs` (1/1/3), `test-audit-follow-ups-ui.mjs` (0/0/3), `test-navigation.mjs` (`/enrollments`), `test-public-programs.mjs` and `test-public-input-bounds.mjs` (the public form), `test-helpdesk-content.mjs` (Q1–Q14 anchors, ≥ 29 contents entries, ≥ 30 screenshots). Browser (CI): `test-receptionist-browser.mjs` (7/4/3), `test-student-placement-browser.mjs` (1), `test-crm-rcc-a2-browser.mjs` (4/0/3), `test-crm-phase6-browser.mjs` (2), `test-portal-readiness-browser.mjs`. Not CI-wired: `test-crm-rcc-a2.mjs` (11/5/8), `test-receipt-charge-payments.sql` (0).

---

# Owner decisions already made (Maroine, 2026-11-04; cited below as "owner decision 1–7")

1. **Reception handles everything.** No director confirmation step and no « Pré-inscriptions » page for admin or director.
2. **Remove the 10 % rule** (withdraws Batch E Q5 = B): any payment > 0 confirms the enrollment. The remaining balance stays tracked as today (« Acompte versé », « En retard »).
3. **Remove « Essai »**: the centre gives no trial sessions.
4. **One reception flow, for walk-ins and CRM prospects: « Inscrire et encaisser »** (programme, school year, level, group optional, price, discount with reason, payment) creates a confirmed enrollment and the receipt in one step. A CRM prospect becomes « Converti » at that moment, and its « Finaliser l'inscription » task closes.
5. **Existing data: counts first.** Unpaid pré-inscriptions and essais are archived (ended with a reason such as « Pré-inscription abandonnée » / « Essai terminé »), never deleted. Enrollments with any live payment become confirmed.
6. **Retire rather than drop:** stop creating Submitted / Under Review / Trial everywhere (reception, CRM « Commencer l'inscription », public `/inscription` form and `/api/public/inscription`, any portal re-enrollment path, online module), add a database guard, remove the screens and labels; keep the old values readable for history. Dropping them is a later optional release.
7. **Website: turn off self sign-up.** Keep the CRM contact/inquiry form (`/api/public/crm-inquiry`); the website shows call / WhatsApp / visit. The eh-website change is a separate small PR.

The open questions are numbered **Q1–Q10** so they cannot be confused with decisions 1–7. These decisions are registered in [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md#enrollment-at-payment--retire-pr%C3%A9-inscription-and-essai--planned--not-approved-2026-11-04).

# Scope and non-goals

**In scope:** the status model and the guard; the payment confirmation rule; the one reception flow for walk-ins and prospects; the retirement of every other creation path (reception modal, management modal and page, public form and endpoint, parent portal request); the director review list; screens, labels, dashboard, filters, guide; the counted Production data step with its revert; tests; docs; the website PR list.

**Non-goals:** dropping the three values, columns, the rate-limit scope or the dead reader branches (later optional release, owner decision 6); any change to receipt numbering, discounts, payment dates, voids or e-mail delivery; any change to the enrollment/group invariants of Batch D and H (one live enrollment per programme and year, capacity, year check, membership from enrollments); the LIR-r1 director detach command 2e (this plan only prepares the shared exemption); the online pilot's guest invitations (Q9); the website's contact form, limiter and attribution; any Production read or mutation by the architecture or implementation task.

# Design

## D1 — Status model and the database guard

After this release an enrollment is **Confirmed** (paid, awaiting a group), **Validated** (paid, in a group) or **Ended** (history with a reason). **Submitted**, **Under Review**, **Trial** and (Q5) **Rejected** are *retired*: valid in the constraint, displayed on old rows with their French label, never created or re-entered.

- New trigger `academic_security.guard_retired_enrollment_status()` on `enrollments`, `before insert or update of status`, for every role: raises `23514` with hint `eap.status_retired` and the message « La pré-inscription et l'essai n'existent plus : l'inscription se confirme à l'encaissement. » when `new.status` is a retired value and (insert, or `old.status` is distinct from `new.status`). Exemption only when both `eh.membership_sync` and `eh.enrollment_command` are `'on'` (the consumed Batch D revert, exactly as 125's year guard). The archive step never needs it: it only moves rows *out* of retired values.
- The guard is listed before `enrollments_history_guard` alphabetically so that an ended row's protection is unchanged; the implementer confirms firing order in the rehearsal.
- No constraint, column or index changes. The French label map (`ENROLLMENT_LABELS`, `ENROLLMENT_STATUS_COLORS`) keeps the four retired entries for history and gains nothing.

## D2 — Any payment confirms; free enrollment (owner decision 2, Q1)

`public.create_charge_payment(jsonb)` is re-created from its **122** body (never 120's) with these changes only:

1. The receptionist block (122 lines 705–711) and `v_confirmation_pending` are removed; the enrollment update sets Confirmed (Validated when a group is set) for any live payment, as the admin/director path does today. The legacy mapping lines for Submitted/Under Review/Trial stay (they read zero rows after the archive and keep the function identical for an old row that a replay might touch).
2. **Free enrollment (Q1, recommended A):** when the inner call returns no `receipt_id` **and** this request created a new tuition charge (not Other, not legacy) with `gross_amount > 0`, `discount_amount = gross_amount` and a discount reason row, the wrapper does not return early: it runs the same enrollment branch (confirm the selected or matching enrollment, or create a Confirmed one), links the charge, and returns `free_enrollment: true`, `enrollment_confirmed: true`, `receipt_id: null`. A zero-price charge (`gross_amount = 0`) is not an agreement and keeps today's behaviour (no enrollment). The « Contrôles » discount section (b) already lists every new discount, so the 100 % case is visible there without a new section.
3. The result keys `enrollment_confirmation_pending` is dropped (an absent key reads as false in the current client, which keeps the window between migration and deploy safe).
4. The CRM-link check (lines 683–693) is unchanged; the detach of D7 clears `l.enrollment_id`, so a detached lead no longer blocks the implicit branch.

Owner, `security definer`, `search_path`, ACLs and the lock order (shared intent lock, student, inner command, charge, enrollment, leads last) are identical to 122 and asserted in CI. `create_charge_payment_financial` (125) is unchanged.

Client: `RECEPTION_CONFIRMATION_THRESHOLD`, `PENDING_CONFIRMATION_MESSAGE` and `receptionConfirmationPending` are deleted; the receipt page's messages become « Paiement enregistré. Inscription confirmée. » / « … Apprenant inscrit — groupe à affecter. » / « Remise de 100 % : inscription confirmée sans paiement (visible dans Contrôles). » The receipt form's enrollment candidate list hides rows whose status is retired or Ended unless CRM-linked (a historical row is never selected for a new payment).

## D3 — One flow: « Inscrire et encaisser »

**Walk-in (receipt form, `/receipts/new`).** The form already creates the learner, the charge and the receipt, and the wrapper already confirms or creates the enrollment. Changes: (a) the learner file's button becomes « Inscrire et encaisser » → `/receipts/new?student_id=…`; (b) a « Groupe (facultatif) » select appears for tuition sessions once programme, year and level are chosen, listing groups of that programme/level/year with their free seats (read through the existing `crm_enrollment_groups` or the groups entity; the database remains the authority); (c) after a successful payment that returns `enrollment_id`, the page re-reads the learner row and calls `place_learner_in_group(student, group, student_updated_at, enrollment)`; a refusal (full group, year mismatch, stale) shows « Paiement enregistré. Groupe non affecté : <message>. Apprenant inscrit — groupe à affecter. » and never undoes the payment. Placement is a second command on purpose: a full group must not roll back a numbered receipt.

**CRM prospect (prospect panel).** « Commencer l'inscription » becomes « Inscrire et encaisser », a three-step dialog: (1) learner identity exactly as today (candidate review, linked learner preselected, birth date rule); (2) enrollment: programme, school year, level, group optional (no « Démarrage » choice); (3) payment: the same fields as the receipt form (price, discount with reason, payment amount, date, method, transaction reference, e-mail opt-in), with the desk-guard preview. Submit calls one new command:

- `public.crm_enroll_and_collect(p_request_key uuid, p_data jsonb) returns jsonb`, SECURITY DEFINER, fixed `search_path`, executable by `authenticated` only (the 084 revoke/grant pattern), with `crm_security.require_reader(false)` and `operational_security.require_capability('manage_finance_operations')` (reception, admin, director). `p_data` = `{enrollment: {…the crm_start_enrollment payload minus initial_status and group_id…}, payment: {…the create_charge_payment payload minus student_id, enrollment_id, session_type, school_year, level…}}`, bounded (16 KB) and key-checked like the inner commands.
- Body, one transaction: (i) `crm_start_enrollment(p_request_key, enrollment || {initial_status: 'Confirmed'})` — the lead is locked, the learner chosen or created, the Confirmed enrollment inserted and linked, `evaluate_conversion` converts the lead and cancels its open tasks (decision 4; the follow-up branch of the function finds the lead CONVERTED and creates nothing); (ii) `create_charge_payment(payment || {student_id, enrollment_id, session_type, school_year, level} taken from the enrollment result)` — the receipt is issued and linked to that enrollment; (iii) returns the lead result, `enrollment`, `charge_id`, `receipt_id`, `balance`, `replayed` flags of both commands.
- **Idempotency:** both inner commands keep their own identity (`crm_command_requests` by `p_request_key`; `financial_requests` by `payment.idempotency_key`, generated by the client with the request key and kept with it for an exact resend). A retry replays both; a retry whose payment payload differs raises the existing fingerprint conflict (the Q7 French wording of Premium retirement). The wrapper stores nothing itself.
- **Atomicity:** a desk-guard refusal or any payment error rolls back the enrollment, the lead link and the conversion: no enrollment ever exists without its receipt (or its 100 % discount, Q1).
- **Locks:** `crm_start_enrollment` takes the exclusive enrollment-intent lock, then `create_charge_payment` takes the shared one in the same transaction (a session never conflicts with its own advisory locks); students are locked `for update` by both. The concurrency test (two wrappers, one wrapper against one receipt form) proves `PT409` on the loser and one receipt.
- **Group:** as for the walk-in, the dialog calls `place_learner_in_group` after success when a group was chosen; the success panel shows « Inscription confirmée · reçu <number> » and, if placement failed, « Groupe à affecter ».

`crm_start_enrollment` is re-created from its 125 body: `initial_status` must be `'Confirmed'` (anything else raises `42501`, hint `crm_enrollment.initial_status_not_permitted`, message unchanged); `group_id` is refused (`crm_enrollment.request_invalid`); the `trial_requires_group` line is removed; everything else (locks, candidate token, learner creation, existing-enrollment checks, linking, conversion, follow-up fallback, hints) is byte-identical and proven by the unchanged-lines check used for 117. Its `authenticated` execute grant is **revoked** so that no client can create a Confirmed enrollment without the payment; the wrapper (definer) still calls it.

## D4 — Retire the other creation paths (owner decision 6)

| Path | Latest body | Change |
| --- | --- | --- |
| Reception modal → `save_receptionist_enrollment` | 125 | Re-created: the pre-enrollment branch raises `42501`, hint `eap.status_retired`, the D1 message; the group-assignment branch on Confirmed/Validated rows is unchanged (the modal's receptionist path keeps using it, or moves to `place_learner_in_group` / `remove_learner_from_group`; implementer's choice, tested either way). Default `p_status` stays `'Submitted'` in the signature (a signature change would change the function identity) but is never accepted. |
| Management modal/page → `create_enrollment` | 120 | Re-created to raise `42501`, hint `eap.status_retired`. Not dropped: an old build between migration and deploy gets the French message. |
| Management modal → `save_enrollment_changes` | 120 | Re-created: a `status` key raises `23514`, hint `egc.status_not_permitted` (« Ce changement de statut passe par le paiement, l'affectation ou « Ancien apprenant ». »); level, date, notes unchanged; Ended rows unchanged. |
| Public form → `/api/public/inscription`, `create_public_registration` | route; 125 | The route answers `410` `{ error: 'Les inscriptions en ligne sont fermées. Contactez le centre.' }` before any parsing (origin, rate limit and Turnstile are not consulted); the function is re-created to raise `42501`, hint `eap.public_registration_retired`; its `service_role` grant is kept (nothing else can call it). `src/app/inscription/page.jsx` becomes a static page: title « Inscriptions au centre », phone, WhatsApp link (the website's existing redirect), address, opening hours, a link to the website contact page; no form, no script. The middleware keeps `/inscription` public. Turnstile and the `anon_rate_limits` scope become unused and are not removed. |
| Parent portal → `portal_request_reenrollment` | 125 | Re-created to raise `42501`, hint `eap.status_retired` (Q8). The portal button becomes a line « Pour une réinscription, contactez l'accueil » with the existing portal message composer. No portal account exists yet (Batch F R3–R6 pending). |
| Online module | 117/118 | Unchanged: it never created a waiting enrollment; guests are not enrollments (Q9). |
| Direct writes | — | The D1 guard refuses every role, `service_role` included. |

## D5 — Director « Contrôles » (Q3)

`get_finance_review_queue` is re-created from 122: section (d) `pending_confirmation` becomes **`unpaid_never`** « Inscriptions confirmées sans paiement »: Confirmed/Validated enrollments created on or after `p_since` that have **no receipt at all** (live or voided; section (a) covers « had one, none live ») and no fully discounted charge (`discount_amount = gross_amount > 0`), with learner, programme, year, created-on and the path that created them when known (`academic_security` log kind `capacity_override`/placement, reopen). This is where Q3's placement-without-payment and a reopened enrollment become visible. The page `FinanceReviewQueue.jsx` renames the list. Sections (a), (b), (c) and grants are unchanged.

## D6 — Screens, labels, dashboard, filters, guide

- **Removed:** `src/app/(admin)/enrollments/` (the page), its sidebar entry, `roleAccess` route entry and `navigation.mjs` allowlist entry; `/enrollments` then follows the existing unlisted-route behaviour (not-found for admin/director, home redirect for the receptionist). « Clôturer l'année » (director) moves per Q7. The « Valider » confirmation e-mail of that page disappears with it (Q10). « Formulaire public » sidebar entry removed.
- **Learner file:** « Inscrire et encaisser » (reception and management); the receptionist note becomes « La réception inscrit et encaisse. Les corrections et les fins d'inscription passent par la direction. »; « Modifier l'inscription » keeps level, date, notes and the group through placement; `EnrollmentModal` loses its status select and its « Nouvelle pré-inscription » title; the enrollment-creation branches of the modal are deleted.
- **Dashboard:** the « Pré-inscriptions en attente » count becomes « Inscrits — groupe à affecter » (Confirmed with `group_id` null).
- **Students list:** `DOSSIER_LABELS` keeps « Essai (dossier) » for reading but the filter offers Inscrit, Prospect, Ancien apprenant, Inactif; the receptionist placement read and `enrollmentWorkflow.mjs` list only Confirmed/Validated as live, « Groupe à affecter » only for a Confirmed row without group (`PENDING_PRE_ENROLLMENT_STATUSES` and `isPreEnrollment` are deleted). The import page keeps coercing Trial/Enrolled CSV rows to Prospect (old files).
- **CRM:** labels « Pré-inscription créée · En attente », « Essai en cours » stay in the read map for history; `enrollmentActions` rows 3–5 become a single historical row (« Ancienne pré-inscription archivée ; relancez « Inscrire et encaisser » si le prospect s'inscrit. ») and row 8 starts the new dialog; « Suivi de pré-inscription » becomes « Suivi d'inscription » (the `enrollment_followup` task type is unchanged for history).
- **Settings:** the receptionist role description reads « Tests de niveau, apprenants, inscriptions et encaissements ».
- **Guide (`/helpdesk`):** C6 becomes one step (three-step dialog, payment included, « Converti » at once); Q3 loses the 10 % message and gains the optional group; Q7 becomes « Inscrire et encaisser depuis la fiche apprenant » (same anchor so the contents test's Q1–Q14 rule holds); the status reference cards drop Soumise/En cours d'examen/Essai from the live list and describe them as historical; the learner-status table loses « Essai (dossier) » and rewrites Prospect; the message table loses the 10 % row; « J'ai fait une erreur » loses « Pré-inscription créée par erreur »; lines 1125, 1289, 1301, 1456–1458, 1491, 1632, 1654 reworded; screenshots s08, q02b, q07, q07b retaken on synthetic data; `test-helpdesk-content.mjs` thresholds kept (≥ 29 entries, ≥ 30 screenshots).

## D7 — Existing data (owner decision 5; Q4, Q6)

**R0 count query** (read-only, counts only, no personal data; run through the guarded transport which returns the last statement's rows):

```sql
set transaction read only;
with live as (
  select e.id, e.status, e.group_id, e.student_id, e.session_type, e.school_year, e.consent_source,
    (select coalesce(sum(r.montant_paye), 0) from public.receipts r
      where r.voided_at is null and r.deleted_at is null
        and (r.enrollment_id = e.id or r.charge_id in (select c.id from public.charges c where c.enrollment_id = e.id))) as paid,
    (select coalesce(sum(c.gross_amount - c.discount_amount), 0) from public.charges c
      where c.enrollment_id = e.id and c.voided_at is null) as net,
    exists (select 1 from public.crm_leads l where l.enrollment_id = e.id and l.merged_into_lead_id is null) as linked
  from public.enrollments e
  where e.status in ('Submitted', 'Under Review', 'Trial')
)
select 'A1 unpaid Submitted' as category, count(*) from live where status = 'Submitted' and paid = 0
union all select 'A2 unpaid Under Review', count(*) from live where status = 'Under Review' and paid = 0
union all select 'A3 of A1+A2: with a group', count(*) from live where status in ('Submitted','Under Review') and paid = 0 and group_id is not null
union all select 'A4 of A1+A2: from the public form', count(*) from live where status in ('Submitted','Under Review') and paid = 0 and consent_source = 'public_inscription'
union all select 'A5 of A1+A2: learner has an open non-legacy charge for the same programme and year', count(*) from live x
  where x.status in ('Submitted','Under Review') and x.paid = 0 and exists (select 1 from public.charge_balances b
    where b.student_id = x.student_id and b.session_type = x.session_type and b.school_year is not distinct from x.school_year
      and b.voided_at is null and not b.legacy and b.balance > 0)
union all select 'B paid below 10 % (Submitted/Under Review)', count(*) from live where status in ('Submitted','Under Review') and paid > 0 and paid * 10 < net
union all select 'C paid 10 % or more (Submitted/Under Review)', count(*) from live where status in ('Submitted','Under Review') and paid > 0 and paid * 10 >= net
union all select 'D Trial without payment', count(*) from live where status = 'Trial' and paid = 0
union all select 'E Trial with payment', count(*) from live where status = 'Trial' and paid > 0
union all select 'F paid rows missing programme or year (need the charge year)', count(*) from live where paid > 0 and (session_type is null or school_year is null)
union all select 'G1 of the unpaid rows: linked to a CRM lead', count(*) from live where paid = 0 and linked
union all select 'G2 of the paid rows: linked to a CRM lead', count(*) from live where paid > 0 and linked
union all select 'G3 linked leads by status: QUALIFIED', count(*) from public.crm_leads l where l.merged_into_lead_id is null and l.status = 'QUALIFIED' and l.enrollment_id in (select id from live)
union all select 'G4 linked leads by status: CONVERTED', count(*) from public.crm_leads l where l.merged_into_lead_id is null and l.status = 'CONVERTED' and l.enrollment_id in (select id from live)
union all select 'G5 linked leads by status: other', count(*) from public.crm_leads l where l.merged_into_lead_id is null and l.status not in ('QUALIFIED','CONVERTED') and l.enrollment_id in (select id from live)
union all select 'G6 open « Finaliser l''inscription » tasks of linked leads', count(*) from public.crm_tasks t
  where t.task_type = 'enrollment_followup' and t.status = 'open' and t.lead_id in (select l.id from public.crm_leads l where l.enrollment_id in (select id from live))
union all select 'H1 learner files with status Trial', count(*) from public.students s where s.status = 'Trial' and s.deleted_at is null
union all select 'H2 Prospect files whose only enrollments are unpaid rows above (become Inactif, Q4)', count(*) from public.students s
  where s.status = 'Prospect' and s.deleted_at is null and exists (select 1 from live x where x.student_id = s.id and x.paid = 0)
    and not exists (select 1 from public.enrollments e where e.student_id = s.id and (e.id not in (select id from live) or e.id in (select id from live where paid > 0)))
union all select 'I Rejected rows (history, untouched)', count(*) from public.enrollments where status = 'Rejected'
union all select 'J1 total Confirmed', count(*) from public.enrollments where status = 'Confirmed'
union all select 'J2 total Validated', count(*) from public.enrollments where status = 'Validated'
union all select 'J3 total Ended', count(*) from public.enrollments where status = 'Ended'
union all select 'J4 total retired-status rows (A+B+C+D+E)', count(*) from live;
```

Expectations: C is 0 (management payments confirm at any amount and reception payments at 10 % or more already confirm); any other value is explained before approval. F rows need the charge's year to satisfy `enrollments_confirmed_has_programme`; the step derives it exactly as `create_charge_payment` does (`coalesce(charge.school_year, enrollment_year)`), or stops when no charge gives one.

**Archive step** (`supabase/manual/enrollment_at_payment_archive.sql`, run only on explicit release approval of the day's counts, after migration 127, in the same window, through the guarded wrapper; the owner-declared expected counts for A1, A2, B, C, D, E, G1 and G2 are session settings and the script raises, changing nothing, if any differs):

1. Journal every targeted enrollment row and every targeted lead link as before-images in `maintenance.eap_archive_journal` (the Batch D pattern; `maintenance` has no API access).
2. **Paid rows (B, C, E):** set `status = 'Confirmed'` (a grouped row becomes Validated through `check_enrollment_student_sync`), fill a missing year from the charge (F). The existing triggers resync the learner file (Enrolled) and `zz_crm_enrollment_status` converts the linked leads (G2), cancelling their open tasks with the reason « Inscription confirmée » (decision 4 applied retroactively). Capacity: the row is already in its group, so `enforce_group_capacity` sees no new placement (asserted in the rehearsal; otherwise the step runs with `eh.capacity_override` and logs it).
3. **Unpaid rows (A, D):** `academic_security.end_enrollment(id, reason)` with « Pré-inscription abandonnée (retrait des pré-inscriptions, <date>) » or « Essai terminé (retrait des essais, <date>) », then `public.sync_student_from_enrollments(student, true, old group)` for each learner: Trial files become Inactive (ended, « Essai terminé »); Prospect files with nothing else become Inactive (Q4, recommended A); files with another live enrollment keep their status.
4. **Detach (G1, Q6):** for each lead whose linked enrollment was ended in step 3 and whose status is not CONVERTED: `update crm_leads set enrollment_id = null, version = version + 1` (student_id kept) under the transaction-local flag `eh.crm_detach = 'on'` that the re-created `protect_enrollment_link` admits only for clearing `enrollment_id` of a non-converted lead whose enrollment is Ended; an `enrollment_detached` activity (« Pré-inscription archivée : le prospect peut être inscrit à l'encaissement. », details `{reason, archived_enrollment_id}`) is appended. The open « Finaliser l'inscription » task stays open: it is still the right next action. The LIR-r1 director command 2e will reuse this exemption and activity name.
5. Post-conditions: zero rows in a retired status; J counts shifted by the targeted numbers; every converted lead has its `lead_converted` activity; lifecycle outbox unchanged (zero deliveries, zero epochs); a second run finds zero targets.
6. **Revert** (`supabase/manual/enrollment_at_payment_archive_revert.sql`, prepared, never run without its own approval): restores the journalled before-images under the two-flag exemption (status, group, ended fields, lead links), and reverses the conversions it caused only where no later activity exists on the lead (otherwise it stops and lists them). It is valid until a new payment or placement touches a restored row.

## D8 — Website (owner decision 7)

Separate PR on `elforssa/eh-website` (base its `main` at `a550b15` or later; the working tree is on `crm-website-inquiry-integration`): replace the 12 « S'inscrire » links listed in the inventory by « Nous contacter » → `/contact` (or the WhatsApp redirect where the context is a banner), delete `PUBLIC_FORM_URL`, keep the contact form and `/api/public/crm-inquiry` integration untouched, reword the two FAQ/terms sentences that mention online enrolment if they promise a form. Deploy order: after the admin release (the admin page shows contact information meanwhile, so the old links never fail). Tier 1 on the website, no secret, no data.

## D9 — Docs at implementation and closeout

PRODUCT_RULES (conversion and finance: initiation sentence, Q5 = B withdrawn, free enrollment; people/academics: D3-A without Trial), SECURITY_RULES (receptionist row; the wrapper and the revoked grant; the guard), WORKFLOWS (CRM → enrollment, placement, payment, « Clôturer l'année » location), ARCHITECTURE (core workflows), FEATURE_INDEX (rows 12, 26, 34), receipt model (lines 187–191), enrollment workflow README, website inquiries doc line 5, [ADR-003](../decisions/ADR-003-receptionist-operations-role.md) (walk-in direction delivered by this flow), new [ADR-015](../decisions/ADR-015-enrollment-at-payment.md) (proposed), plans README, OWNER_DECISIONS; CURRENT_STATE only at closeout with dated evidence.

# Security boundaries

- No role gains a capability. Reception keeps `manage_finance_operations` and `assign_group`; the wrapper requires both of what its two inner commands require. Management keeps its commands minus the pre-enrollment branches.
- `crm_start_enrollment` loses its `authenticated` grant; the test suite proves the direct call is refused for every role and that the wrapper works for reception, admin and director and is refused for teacher, parent, student, `anon` and `service_role`.
- The guard is a trigger with `security definer` and a fixed `search_path`, no API grant, like the Batch D and H guards; it refuses `service_role` and the migration role alike (only the two-flag exemption passes).
- The public endpoint keeps its origin and body-size posture until it answers 410; the retired function keeps its narrow grant and refuses.
- No RLS policy changes. No finance invariant changes: numbering, immutability, discounts, dates, voids, idempotency and the append-only history are untouched; the free-enrollment branch creates a charge and no receipt, exactly as a zero payment does today, and only adds the enrollment link.
- The archive step runs as the migration role through the guarded transport, journals before it writes, and is counted twice (R0 and the declared counts). Conversions it causes are ordinary conversion activities; the lifecycle outbox stays dormant (no destination, no epoch).
- Exports: none needed (the journal is in the database); R0 output holds counts only.

# Migration, test, rollout and recovery strategy

## Sequence (migration first, app within minutes, outside reception hours)

| Step | Gate | Action |
| --- | --- | --- |
| R0 | Owner authorizes the read-only count query | Run the D7 query on Production through the guarded transport; record the counts in the release record; confirm ledger 001–126 and the catalog digest against a clean local 126 build; targeted export of the functions 127 replaces (owner's private folder, `SHA256SUMS`). |
| R0b | Owner reads the counts and approves the release with the exact numbers | Includes Q1–Q10 answers already recorded and the declared counts for the archive step. |
| R1 | Release approval, window outside reception hours | Apply migration 127 (dry run `DRYRUN_OK`, then apply) through the guarded wrapper; read-only checks: guard present, functions re-created, grant revoked, catalog diff exactly the manifest. |
| R2 | Same approval, same window, right after R1 | Run the archive step with the declared counts; read-only post-conditions (D7 step 5). |
| R3 | Same approval | Merge the reviewed head; Vercel Production READY on that commit; anonymous probes: `/inscription` 200 static page, `/api/public/inscription` 410, `/enrollments` redirects/not-found, `/login` 200. |
| R4 | Same approval, within the hour | Zero-payment rolled-back probes as reception (the D2 branch, the wrapper's refusal without payment, the guard's refusal), role denials, lifecycle counters unchanged (zero deliveries/epochs), Postgres and API logs clean, 30 minutes of observation. Receipt-producing probes are not run (numbers). |
| R5 | Owner | First reception morning: one walk-in and one prospect through « Inscrire et encaisser », the group assignment, Contrôles. Recorded as owner evidence. |
| R6 | Website PR | Separate approval and merge on eh-website. |
| R7 | Closeout | Docs per D9 and CURRENT_STATE with dated evidence; the plan moves to completed. |

## Local test strategy (synthetic data only)

- **Database, CI-run:** a new `scripts/test-enrollment-at-payment.sql` in the rollback-only block: guard refusals for every role and path (direct insert, `create_enrollment`, `save_receptionist_enrollment`, `save_enrollment_changes` status, `portal_request_reenrollment`, `create_public_registration`, `crm_start_enrollment` direct call), the two-flag exemption; any-amount confirmation by reception (1 MAD on a 3 000 MAD charge confirms; the result has no `enrollment_confirmation_pending`); free enrollment (100 % with reason confirms, no receipt, `free_enrollment` true; 100 % without reason refused by the existing guard; `gross = 0` creates nothing); the wrapper end to end (new learner and existing learner; lead CONVERTED, tasks cancelled, receipt linked, one `financial_requests` row and one `crm_command_requests` row; replay returns both ids with `replayed` flags; a changed payment payload raises the fingerprint conflict and leaves nothing); a wrapper whose payment is refused by a desk guard leaves no enrollment, no link, no conversion; placement after payment and a full group leaving « groupe à affecter »; `unpaid_never` lists a placement-created enrollment and not a fully discounted one; grants and ACL snapshot equal to 126 for every untouched function.
- **Stateful upgrade rehearsal 126 → 127 (CI-run, the existing pattern):** seed at 126 through the 126 functions (`crm_start_enrollment` Submitted and Trial with linked leads and open follow-ups, reception pre-enrollments with and without group, a public registration, a parent request, paid-below-10 % rows, paid rows missing a year, Prospect and Trial files); `supabase migration up --local`; assert the guard and functions; run the archive step with the correct declared counts (and once with a wrong count: raises, changes nothing); assert every row's outcome, the learner statuses (Q4), the conversions and cancelled tasks, the detached leads with their activity and still-open follow-ups, the journal; run the revert and compare with the journal; run the archive again (no-op). The three existing upgrade-to-current scripts and `test-egc-upgrade.mjs` / `test-crm-rcc-a2-upgrade.mjs` expect ceiling 127 and keep their seeded Submitted rows readable (they create them through the pre-127 functions, so the guard never fires in them).
- **Concurrency (CI, the existing Python harness):** two wrappers on one lead (one `PT409`, one receipt); wrapper against receipt form on one learner (one wins, the other `PT409` or the duplicate conflict, never two live enrollments for one programme and year).
- **Existing suites, updated only where they asserted the retired behaviour** (listed in the inventory): the Q5 = B cases of `test-finance-batch-e.sql` become any-amount cases; pre-enrollment creation cases become refusal cases; fixtures that need a live enrollment create a Confirmed one through a payment or through the two-flag exemption inside the fixture only (never in a command); `test-portal-readiness.sql`'s re-enrollment case becomes a refusal; `test-online-learning.sql` seeds Confirmed where it seeded Submitted; the RCC-A2 SQL/Node/browser suites exercise the wrapper and the new dialog (their hint vocabulary stays).
- **Node (`npm test`):** `test-enrollment-workflow.mjs`, `test-membership-actions.mjs`, `test-receipt-client-regressions.mjs` (no 10 % message; free-enrollment message), `test-report-data.mjs`, `test-navigation.mjs` (`/enrollments` absent everywhere), `test-middleware-security.mjs` (`/inscription` still public, `/api/public/inscription` answers 410 without a session), `test-public-programs.mjs` rewritten as « the public page offers no programme and the route refuses », `test-public-input-bounds.mjs` (410 before parsing), `test-helpdesk-content.mjs` (unchanged thresholds), `test-audit-follow-ups-ui.mjs`; a new absence guard `scripts/test-enrollment-at-payment-absence.mjs` that scans `src/` for writers of the retired values and for the strings « Pré-inscription », « Essai » (as an enrollment), « 10 % » and « Acompte inférieur », with an allowlist of the read-only label maps and history texts, each listed in the test.
- **Browser (local, synthetic):** `test-receptionist-browser.mjs` (walk-in « Inscrire et encaisser » with and without group; the learner file; no status select), `test-crm-rcc-a2-browser.mjs` (the three-step dialog, replay, refusal), `test-student-placement-browser.mjs`, `test-crm-phase6-browser.mjs`, `test-portal-readiness-browser.mjs` (the portal line), the guide route.
- `npm run lint`, `npm run build` (dead imports of the deleted page and helpers must fail the build).

## Recovery

- **Application:** redeploy the previous build. It works against 127 except that its pre-enrollment paths are refused with the guard's message and its CRM dialog cannot call `crm_start_enrollment` (grant revoked); payments work without the 10 % rule.
- **Database:** a prepared forward restore script (`scripts/rollback/127_enrollment_at_payment_restore.sql`, never run without its own approval) re-creates the 122/125/120/084 bodies, re-grants `crm_start_enrollment`, drops the wrapper and the guard. Never restore the 10 % branch by editing a deployed migration.
- **Data:** the archive revert from its journal (D7 step 6), valid until a restored row receives a new payment or placement; after that, a reviewed forward correction.
- Local failures are diagnosed and fixed autonomously; Production failures stop and report.

# Expected modules

Database: `supabase/migrations/127_enrollment_at_payment.sql` (provisional name), `supabase/manual/enrollment_at_payment_archive.sql`, `…_archive_revert.sql`, `scripts/rollback/127_enrollment_at_payment_restore.sql`. Finance: `create_charge_payment`, `get_finance_review_queue`, `financeCorrections.mjs`, `ReceiptForm.jsx`, `receipts/new/page.jsx`, `FinanceReviewQueue.jsx`. CRM: `crm_start_enrollment`, `crm_enroll_and_collect`, `protect_enrollment_link`, `CrmEnrollmentDialog.jsx`, `LeadEnrollmentSection.jsx`, `enrollmentActions.mjs`, `enrollment.mjs`, `enrollmentErrors.mjs`, `CrmActionDialog.jsx`. Learners: `EnrollmentModal.jsx`, `students/[id]/page.jsx`, `students/page.jsx`, `enrollmentWorkflow.mjs`, `presentation.mjs`, `dashboard/page.jsx`, `students-directory/page.jsx`, `settings/page.jsx`. Routes: delete `src/app/(admin)/enrollments/`, `Sidebar.jsx`, `roleAccess.mjs`, `navigation.mjs`. Public: `inscription/page.jsx`, `api/public/inscription/route.js`, `privacy/page.jsx`, `create_public_registration`. Portal: `parent-portal/page.jsx`, `portal.js`, `portal_request_reenrollment`. Guide: `GuideContent.jsx`, `HelpdeskNav.jsx`, four screenshots. Tests and docs as listed. Website: the separate eh-website PR.

# Owner decisions required

**Q1 — Free enrollment (0 MAD with a 100 % discount).**
- **A (recommended): reception may confirm it when the discount is 100 % with a reason**; no receipt is issued (nothing was paid); the charge appears in « Contrôles » under the discounts list like every new discount. Consequence: one path to an enrollment without a receipt, visible to the director; the receipt form shows a clear notice.
- **B: no free enrollment**: a 100 % discount creates the charge only (today's behaviour); such learners would have to be placed from the group page (Q3) or pay 1 MAD. Consequence: an awkward workaround for staff children or sponsored learners.
- Not blocking the plan; blocking implementation of D2 step 2.

**Q2 — Management enrollment without any payment (« pay later »).**
- **A (recommended): not possible.** Director and admin use « Inscrire et encaisser » like reception; a learner who will pay later stays a prospect (CRM lead or Prospect file) until the first payment or a 100 % discount (Q1). Consequence: consistent with decision 2; no silent unpaid enrollment.
- **B: director/admin may confirm without payment**, logged and listed in Contrôles (d). Consequence: a second path to unpaid enrollments; more code and one more director-only command.
- Not blocking the plan; A needs no code.

**Q3 — Placement from the group page without an enrollment.** Today « Ajouter des apprenants » on a group creates a Validated enrollment for a learner who has none (Batch D, `academic_security.place`), i.e. an enrollment without payment.
- **A (recommended): leave it, make it visible.** Section (d) of Contrôles becomes « Inscriptions confirmées sans paiement » (D5) so the director sees every such enrollment. Consequence: a placed-but-unpaid learner is possible, as today, but never hidden.
- **B: block it** — the group page may only place learners who already have a Confirmed enrollment of that programme and year. Consequence: a Batch D behaviour change (re-creating `academic_security.place`), and the group page cannot be used to enrol.
- Not blocking the plan; A is the default.

**Q4 — Learner file status after archiving an unpaid pré-inscription.** The derived rule (121) makes a file whose only enrollment is Ended « Inactif » — the same as a refused pré-inscription today.
- **A (recommended): Inactif**, no rule change. Consequence: those files leave the default « Dossiers actifs » list; they remain searchable under « Tous les statuts », and the CRM prospect (when linked) stays QUALIFIED with its follow-up.
- **B: Prospect** for files that never had a paid enrollment. Consequence: a change to `sync_student_from_enrollments` (ended rows ended by this archive map to Prospect), one more re-created function and its tests.
- Not blocking the plan.

**Q5 — « Refusée » (Rejected).** With no waiting state there is nothing to refuse.
- **A (recommended): retire Rejected too** (the guard refuses new Rejected rows; old ones stay readable). Consequence: « Refuser » disappears with the page; an unwanted confirmed enrollment is voided (payment) and ended (« Ancien apprenant ») as today.
- **B: keep Rejected writable** for management through `save_enrollment_changes`. Consequence: a status change path survives for a state that cannot occur.
- Not blocking the plan.

**Q6 — Prospects linked to an archived pré-inscription.** The link `crm_leads.enrollment_id` is immutable (084), so without action these leads could never be enrolled from the CRM again.
- **A (recommended): detach them in the archive step** (D7 step 4), keep the learner link and the open « Finaliser l'inscription » task, add an `enrollment_detached` activity; `protect_enrollment_link` admits this one transition under a transaction-local flag that the approved LIR-r1 director command 2e will reuse. Consequence: « Inscrire et encaisser » works again on those prospects.
- **B: leave them linked**; such prospects need a new lead to be enrolled. Consequence: duplicates and confusion at reception.
- Not blocking the plan; A changes one trigger.

**Q7 — Where « Clôturer l'année » lives** (director only, today on the removed page).
- **A (recommended): Students list header**, beside « Dossiers archivés » (director only). Consequence: one existing page, no new route.
- **B: a « Groupes » page action.** Consequence: equally small; less discoverable for a yearly task.
- Not blocking.

**Q8 — Parent portal « Demander une réinscription ».**
- **A (recommended): retire the request** (the function refuses; the button becomes a contact line with the existing message composer to the office login). Consequence: nothing to clean, no portal account exists yet.
- **B: keep a request that creates no enrollment** (a message or a CRM activity). Consequence: new design for a feature nobody uses yet.
- Not blocking.

**Q9 — Online pilot guest invitations of kind « trial » (« Essai »).** They invite a non-enrolled learner to one online lesson; they are not enrollments and the pilot is deployed with its switch off.
- **A (recommended): out of scope, unchanged.** Consequence: the word « Essai » survives on the online course page for guests; renaming it is a later wording change of the online plan.
- **B: rename the kind's label now** (« Invité »). Consequence: a small change inside the online module's files, Tier 1, bundled here.
- Not blocking.

**Q10 — Confirmation e-mail.** The removed page sent « [English Hills] Inscription confirmée » when an admin validated a pré-inscription.
- **A (recommended): no replacement**; the receipt e-mail (opt-in on the form) is the confirmation. Consequence: one e-mail fewer.
- **B: send an enrollment confirmation e-mail from the new flow.** Consequence: a new e-mail path through `/api/email/send` with content to approve.
- Not blocking.

**Approval record.** Pending. The owner records the answers to Q1–Q10 and the approved plan revision here and in OWNER_DECISIONS before implementation starts. Plan approval authorizes architecture only; implementation, the migration, the archive step, the merge, the deployment and the website PR each need their own approval.

---

## IMPLEMENTATION CONTRACT

### Scope

Retire the pre-confirmation statuses and the 10 % rule and deliver « Inscrire et encaisser » as specified above, applying owner decisions 1–7 and the owner's answers to Q1–Q10 (which stand only once the plan is approved). The implementer may not widen scope to numbering, discounts, voids, the Batch D/H invariants, the LIR-r1 detach command 2e, the online module (beyond Q9 = B if chosen) or the website repository.

### Prerequisites

1. Owner approval of this plan revision with the Q1–Q10 answers, recorded in the approval record and [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md).
2. Fresh `origin/main`; the latest migration number re-verified (provisionally 127); every function to be re-created re-read with `pg_get_functiondef` on a local database at the current head and compared with the bodies this plan cites (`create_charge_payment` 122, `get_finance_review_queue` 122, `crm_start_enrollment` 125, `save_receptionist_enrollment` 125, `create_enrollment` and `save_enrollment_changes` 120, `create_public_registration` 125, `portal_request_reenrollment` 125, `protect_enrollment_link` 084). A difference is a stop condition.
3. Local Supabase only, synthetic data, external e-mail disabled, a dedicated feature branch.
4. No Production read or write by the implementation task; the count query is run by the release task under R0.

### Object / module manifest

**Migration `127_enrollment_at_payment.sql` (provisional):** `academic_security.guard_retired_enrollment_status()` + trigger; `create or replace` of `public.create_charge_payment(jsonb)` (122 + D2), `public.get_finance_review_queue(date)` (122 + D5), `public.crm_start_enrollment(uuid, jsonb)` (125 + D3, grant revoked from `authenticated`), new `public.crm_enroll_and_collect(uuid, jsonb)` (grant to `authenticated` only), `public.save_receptionist_enrollment(…)` (125 + D4), `public.create_enrollment(uuid, jsonb)` and `public.save_enrollment_changes(uuid, timestamptz, jsonb)` (120 + D4), `public.create_public_registration(jsonb, uuid, text)` (125 + D4), `public.portal_request_reenrollment(uuid)` (125 + D4), `crm_security.protect_enrollment_link()` (084 + D7 exemption); `maintenance.eap_archive_journal`; identical owners, security modes, `search_path` and ACLs for every untouched function (snapshot-compared). Conflicts raise `PT409` (ADR-009); the file contains no `40001`.

**Data scripts, committed and not run:** `supabase/manual/enrollment_at_payment_archive.sql` (declared counts, journal, steps 2–5), `supabase/manual/enrollment_at_payment_archive_revert.sql`; `scripts/rollback/127_enrollment_at_payment_restore.sql`.

**Application:** as listed under Expected modules; delete `src/app/(admin)/enrollments/`.

**Tests:** `scripts/test-enrollment-at-payment.sql`, the 126 → 127 stateful upgrade pair and its `verify.yml` step, the concurrency cases, `scripts/test-enrollment-at-payment-absence.mjs` (in `npm test`), and the updates listed in the test strategy; the three upgrade-to-current ceilings move to 127.

**Docs:** D9, plus the ADR-015 status and the plan's implementation record.

### Invariants

- No enrollment is created or re-entered in Submitted, Under Review, Trial (or Rejected, Q5) by any role or path; the constraint and the old rows are untouched.
- An enrollment is confirmed in the same transaction as its first payment (or its 100 % discount, Q1); a payment failure leaves no enrollment, no lead link and no conversion.
- Conversion still comes only from `evaluate_conversion` on a linked Confirmed/Validated enrollment; the wrapper adds no conversion path.
- Numbering, discounts, payment dates, voids, idempotency, append-only history, the one-live-enrollment rule, capacity, the year check and membership from enrollments are unchanged; the same inputs give the same amounts and balances.
- Reception gains no capability; `crm_start_enrollment` is not callable by any API role; the guard refuses `service_role`.
- Production SQL, the archive step and the deployment happen only by explicit release approval, in the order R0–R7.

### Acceptance / tests

1. The CI SQL suite, the 126 → 127 rehearsal (archive, revert, no-op) and the concurrency cases pass; the access-rights snapshot equals 126 for every untouched function; exactly the manifest changes in the catalog diff.
2. No « Pré-inscription », « Essai » (enrollment), « 10 % », « Acompte inférieur » or retired-status writer remains in `src/` outside the allowlisted read-only maps (absence guard); `/enrollments` absent from sidebar, roleAccess, navigation and tests; « Formulaire public » absent.
3. Walk-in and prospect flows work in the browser as reception, admin and director, with and without a group, with a full group, with a 100 % discount (Q1 = A), with a replay and with a refused payment.
4. `/inscription` renders the static page, `/api/public/inscription` answers 410 to any body, the middleware tests pass.
5. Guide: C6, Q3 and Q7 rewritten, cards and tables updated, four screenshots retaken, `test-helpdesk-content.mjs` passes.
6. `npm run lint`, `npm run build`, changed-Markdown checks clean.
7. The PR lists the migration filename, the Q1–Q10 options applied, the deviations (if any) and the Production steps deferred to the release task.

### Stop conditions

Stop and report if: a re-created function's latest definition differs from the cited body; an ACL snapshot differs; an existing finance, EGC or CRM test fails for a reason other than a retired-status or 10 % assertion; the archive step cannot be rehearsed with a revert that restores the journal; the guard's firing order lets an ended row be modified; the owner changes a decision after approval; Production access, credentials or data would be needed.

### Docs / status reporting

Report per [AGENTS](../../../AGENTS.md#implementation-handoff) with branch, head SHA, PR, tier rationale, checks tied to the SHA, self-check, plan revision, migration filename and unresolved decisions. Do not mark Production state until a dated release record exists; keep merge, deployment and Production verification distinct. Independent review is mandatory (Tier 3).
