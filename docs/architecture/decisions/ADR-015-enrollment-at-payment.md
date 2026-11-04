# ADR-015: Enrollment at payment — no pre-confirmation status

## Status

**Proposed** (2026-11-04) with the [enrollment-at-payment plan](../plans/enrollment-at-payment.md), revision EAP-r1. Owner decisions 1–7 of 2026-11-04 are recorded in [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md#enrollment-at-payment--retire-pr%C3%A9-inscription-and-essai--planned--not-approved-2026-11-04); the plan itself is not approved. Nothing is implemented.

## Date

2026-11-04.

## Context

Since migration 001 an enrollment is born in a waiting state (Submitted, Under Review) or as a trial (Trial) and is confirmed later by a payment or by management. Batch E (migration 122, Q5 = B) added a 10 % threshold below which a reception payment issues the receipt but leaves the enrollment waiting for the director. The CRM (084/112) initiates a pré-inscription from a qualified prospect and converts the prospect only when that enrollment reaches Confirmed/Validated; a « Finaliser l'inscription » task bridges the two moments. The centre gives no trial sessions, the director does not want a confirmation step, and reception does everything at the desk.

## Decision

1. **An enrollment exists only once it is paid.** Reception, admin and director enroll and collect in one step (« Inscrire et encaisser »): the confirmed enrollment and the receipt are created in the same transaction; any payment above zero confirms. The one exception the plan recommends is a fully discounted enrollment (100 % with a reason), confirmed without a receipt and listed in the director's « Contrôles ».
2. **The pre-confirmation statuses are retired, not dropped.** Submitted, Under Review and Trial (and Rejected, per the plan's Q5) remain valid values for history and readable on old rows; a database guard trigger refuses any new row or transition into them, for every role and path. Dropping the values is a later optional release.
3. **Conversion keeps its single authority.** A CRM prospect converts through the existing `evaluate_conversion` on its linked Confirmed/Validated enrollment; the new CRM wrapper composes the existing enrollment command (restricted to Confirmed, no longer callable directly) and the existing payment command, and adds no conversion path.
4. **Every other creation path is closed**: the reception and management modals, the « Pré-inscriptions » page, the public self sign-up form and endpoint, and the parent portal request. Existing waiting rows are archived (ended with a reason) or confirmed (when paid) by a counted, journalled data step; prospects linked to an archived row are detached so they can be enrolled again.

## Consequences

- Reception works in one step; the director's review lists show confirmed enrollments without payment instead of deposits below 10 %.
- A placement from the group page without an enrollment still creates a Validated enrollment (Batch D); the plan makes it visible rather than forbidding it (plan Q3).
- Learner files whose only enrollment was an archived pré-inscription become Inactive under the unchanged derived-status rule (plan Q4).
- The website must stop linking to the retired self sign-up (separate eh-website PR); until then the admin page shows contact information.
- The historical label maps keep the retired words for old rows; new activity never shows « Pré-inscription », « Essai » or the 10 % message.

## Alternatives considered

- Keep a waiting state and only lower the threshold to zero: still needs the page, the modal, the follow-up task and the confirmation step the owner removed.
- Drop the three values now: rewrites or re-creates every reader that lists them (about twenty functions) and the constraint on a Production table, for no behaviour gain; retiring first mirrors Premium retirement.
- Make the CRM dialog call the enrollment command and the payment command separately: a payment failure would leave a confirmed enrollment and a converted prospect without a receipt.
