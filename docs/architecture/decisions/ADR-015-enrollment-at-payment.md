# ADR-015: Enrollment at payment — no pre-confirmation status

## Status

**Accepted and released** (Maroine; accepted for implementation planning 2026-11-04, released 2026-11-05) with the [enrollment-at-payment plan](../plans/enrollment-at-payment.md), revision EAP-r4 approved at exact head `6d515611d6ca565725373d99fff6bdfc37977af7` after the independent plan review returned READY FOR OWNER APPROVAL (EAP-r1 to EAP-r3 were reviewed CHANGES REQUIRED the same day). Answers: Q1 A, Q2 A, Q3 B, Q4–Q13 A, recorded verbatim in the plan's approval record and in [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md#enrollment-at-payment--retire-pr%C3%A9-inscription-and-essai--released-2026-11-05). Implemented by PR #182 ([Implementation](#implementation)) and **released on 2026-11-05**: migration 127 applied 05:00:36–05:00:42 UTC, the archive step run 05:01:22–05:01:27 UTC, the application merged as `3788132…` and deployed at 05:05:38 UTC, each step under its own owner approval ([closeout](../../ai/CURRENT_STATE.md#enrollment-at-payment-migration-127-production-closeout-r0r4--2026-11-05)). The owner's first reception morning (R5) and the eh-website PR (R6) are pending.

## Date

2026-11-04.

## Context

Since migration 001 an enrollment is born in a waiting state (Submitted, Under Review) or as a trial (Trial) and is confirmed later by a payment or by management. Batch E (migration 122, Q5 = B) added a 10 % threshold below which a reception payment issues the receipt but leaves the enrollment waiting for the director. The CRM (084/112) initiates a pré-inscription from a qualified prospect and converts the prospect only when that enrollment reaches Confirmed/Validated; a « Finaliser l'inscription » task bridges the two moments. The centre gives no trial sessions, the director does not want a confirmation step, and reception does everything at the desk.

## Decision

1. **An enrollment exists only once it is paid.** Reception, admin and director enroll and collect in one step (« Inscrire et encaisser »): the confirmed enrollment and the receipt are created in the same transaction; any payment above zero confirms. The one exception the plan recommends is a fully discounted enrollment (100 % with a reason), confirmed without a receipt and listed in the director's « Contrôles ».
2. **The pre-confirmation statuses are retired, not dropped.** Submitted, Under Review and Trial (and Rejected, per the plan's Q5) remain valid values for history and readable on old rows; a database guard trigger refuses any new row or transition into them, for every role and path. Dropping the values is a later optional release.
3. **Conversion keeps its single authority.** A CRM prospect converts through the existing `evaluate_conversion` on its linked Confirmed/Validated enrollment; the new CRM wrapper composes the existing enrollment command (restricted to Confirmed, no longer callable directly) and the existing payment command, and adds no conversion path.
4. **Every other creation path is closed**: the reception and management modals, the « Pré-inscriptions » page, the public self sign-up form and endpoint, and the parent portal request. Existing waiting rows are archived (ended with a reason, never reopenable) or confirmed (when paid) by a counted, journalled data step; prospects linked to an archived row are detached so they can be enrolled again.
5. **Reception never creates an enrollment through placement** (plan Q3 = B, approved): placing a learner in a group needs a paid enrollment of that programme and year; director and admin may still place without one, with a logged reason that the director's « Contrôles » lists until handled.

## Consequences

- Reception works in one step; the director's review lists show confirmed enrollments without any payment (whatever their date) instead of deposits below 10 %.
- The CRM wrapper commits nothing unless the payment issued a receipt (or the fully discounted exception applies, or it links an enrollment already paid at the desk).
- The conversions caused by the archive step are permanent (immutable conversion fields, append-only activities, cancelled tasks not restored); the revert restores enrollment rows only, and the owner accepts this when approving the step on the day's counts.
- Learner files whose only enrollment was an archived pré-inscription become Inactive under the unchanged derived-status rule (plan Q4).
- The website must stop linking to the retired self sign-up (separate eh-website PR); until then the admin page shows contact information.
- The historical label maps keep the retired words for old rows; new activity never shows « Pré-inscription », « Essai » or the 10 % message.

## Implementation

Implemented by PR #182 (merge `37881325138222b6125dc08bfe70671af647fb0a`) with migration [`127_enrollment_at_payment.sql`](../../../supabase/migrations/127_enrollment_at_payment.sql); **released 2026-11-05: Production runs migrations 001–127 and the merged application.** The migration is the authority:

- Decision 2: trigger `enrollments_retired_status_guard` (`academic_security.guard_retired_enrollment_status()`, SECURITY DEFINER, fixed `search_path`, no API grant) refuses any insert or update into Submitted, Under Review, Trial or Rejected for every role (`23514`, hint `eap.status_retired`), except under the two transaction flags `eh.membership_sync` and `eh.enrollment_command` used by the archive revert.
- Decision 1: `create_charge_payment` confirms on any payment above zero (the 10 % branch removed) and on a new tuition charge discounted at 100 % with its reason (`free_enrollment`, no receipt).
- Decision 3: `public.crm_enroll_and_collect` (SECURITY DEFINER, `authenticated` only) runs `crm_start_enrollment` (Confirmed only, no group, its `authenticated` grant revoked) and `create_charge_payment` in one transaction, with a payment key derived on the server; without a receipt or a free enrollment on a first run it rolls everything back (`eap.payment_required`); a replay returns the original ids; a call without payment links only an enrollment the server finds paid.
- Decision 4: `create_enrollment`, `create_public_registration` and `portal_request_reenrollment` refuse; `save_enrollment_changes` refuses status changes; the pre-enrollment branch of `save_receptionist_enrollment` refuses; `reopen_enrollment` refuses rows the archive step ended; `/api/public/inscription` answers 410 and the « Pré-inscriptions » page is deleted. The data step `supabase/manual/enrollment_at_payment_archive.sql` ran on Production on 2026-11-05 (14 waiting enrollments ended, 14 learner files Inactive, 1 LOST lead detached, no conversion, no review flag); its revert and `scripts/rollback/127_enrollment_at_payment_restore.sql` were not run and each needs its own approval.
- Decision 5: `academic_security.place` and `place_learner_in_group` take `p_without_enrollment_reason`; reception needs a Confirmed/Validated enrollment (`eap.paid_enrollment_required`); director/admin give a separate 1–200 character reason, logged as `placement_without_enrollment` and listed in « Contrôles » (`get_finance_review_queue`: `unpaid_never`, informational `paid_unlinked`).

The read-only R0 count ran once on Production on 2026-11-04 (04:39 UTC); its counts are in the plan's implementation record. The website change is a separate eh-website follow-up, not opened yet.

## Alternatives considered

- Keep a waiting state and only lower the threshold to zero: still needs the page, the modal, the follow-up task and the confirmation step the owner removed.
- Drop the three values now: rewrites or re-creates every reader that lists them (about twenty functions) and the constraint on a Production table, for no behaviour gain; retiring first mirrors Premium retirement.
- Make the CRM dialog call the enrollment command and the payment command separately: a payment failure would leave a confirmed enrollment and a converted prospect without a receipt.
