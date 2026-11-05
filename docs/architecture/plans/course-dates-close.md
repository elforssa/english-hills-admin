# Courses with dates — close a finished course, revision CDC-r3

**Implementation: IMPLEMENTED ON BRANCH `feat/course-dates-close` (2026-11-05), implementation PR open, not merged, not deployed; migration 128 not applied on Production; the one-time step, its revert and the restore are prepared and not run. R0 ran once on Production, read-only, 2026-11-05 13:05Z. See the [implementation record](#implementation-record-cdc-r3-2026-11-05).**

**Status: APPROVED FOR IMPLEMENTATION (Maroine, 2026-11-05) at exact head `47a02e6a56f08290f85fe2bf0c703b12fc6a6c19`, revision CDC-r3, after the independent plan review returned READY FOR OWNER APPROVAL on that head. Q1 and Q3–Q18 all A and OA1–OA6 as recorded, verbatim in the [approval record](#owner-decisions-required) and in [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md#courses-with-dates--close-a-finished-course--approved-for-implementation-2026-11-05). This approves the plan only: the R0 count, implementation, migration 128, the one-time step (Adults and One-to-One only after the owner's confirmation per programme), merge and deploy each need their own approval.** Revision **CDC-r3**, 2026-11-05, superseding CDC-r2 (PR #185 head `09e7b4e1348299231a18917b97de5ee1fbf931a0`) and CDC-r1 (head `c2fbb12a59f2d482a7476ba5ea206934e826ab71`). Risk tier: **3**: enrollment integrity, director commands that end enrollments in bulk, a guard on every placement path, a re-created year close, a narrower read policy on `groups`, and a counted Production data step. Owner: Maroine.

At approval nothing was implemented, merged, applied or deployed, and **no Production read, count or mutation occurred** while writing this plan.

- **Baseline:** freshly fetched `origin/main` = `6e724ab67f3aa501e99a028b3390cf05aaf9ef74` (PR #184, the enrollment-at-payment closeout, docs only).
- **Migrations:** latest migration file `127_enrollment_at_payment.sql`; Production ledger **001–127** per [CURRENT_STATE](../../ai/CURRENT_STATE.md#deployment-and-credential-evidence-boundaries); next free migration number **128**. That number is provisional and is re-read at implementation. The two other open PRs, #121 and #140, are docs only and claim no number from 128 on.
- **Patterns reused:** Batch D's year close and online course close ([EGC-r2](enrollment-group-consistency.md), [ADR-010](../decisions/ADR-010-group-membership-from-enrollments.md)); conflicts as in [ADR-009](../decisions/ADR-009-conflicts-never-retryable.md); the counted data step of [enrollment at payment](enrollment-at-payment.md) D7.
- **ADR:** [ADR-016](../decisions/ADR-016-course-dates-and-close.md), accepted for implementation planning with this approval.

Planned, implemented, merged, deployed and Production-verified are distinct states.

## Revision history

- **CDC-r1** (2026-11-05, head `c2fbb12…`). The independent plan review returned **CHANGES REQUIRED**. The coordinator relayed these items:
  - **Blocker B1:** paid enrollments without a group, of the course's programme, year and level, must be shown and handled at the close.
  - **Should-fix:** S1, S2, S3, S5, S6, S8, S9.
  - **Nits** (listed in the table below).
  - **Five owner answers**, proposed by the coordinator.

  The review reported ten should-fix items, but only seven were relayed individually. S4, S7 and S10 were not. This revision assumes the five owner answers settle them. **The re-review should confirm that or restate them.**
- **CDC-r2** (head `09e7b4e…`) applied the relayed items as in the first table below.
- **Re-review of CDC-r2** (2026-11-05, head `09e7b4e…`): **CHANGES REQUIRED**, three small fixes and nits, as relayed by the coordinator:
  - **N-1:** CDC-r2 claimed the close could never deadlock. That claim was **wrong**: « A suivi ce cours » runs `academic_security.place`, which takes the group's seat advisory lock (held to commit), and the close then updated the group row. A concurrent placement held the group share lock and waited for the seat lock, so the two transactions deadlocked (reproduced by the reviewer).
  - **N-2:** link only open unlinked tuition charges with something paid; zero-paid charges are « engagements », shown and never linked; pre-057 charges without a year from earlier years are excluded.
  - **N-3:** the year close must lock the year's group rows after the learners and never mark a group that still has a live learner.
  - **Owner answer OA6** (proposed by the coordinator) and **nits** (second table).

  The re-review relayed no remaining item for S4, S7 or S10.
- **CDC-r3** (this revision) applies the re-review as in the second table.

**CDC-r2 changes (review of CDC-r1):**

| Item | Where |
| --- | --- |
| B1 — paid enrollments without group of the same programme, year and level in the close | D3 (preview, `p_attach`, `p_end_unplaced`), D8 dialog, Q14, R0 lines U1–U3 |
| OA1 — Yearly on the card only with a `date_fin`; « Clôturer l'année » marks its Yearly groups closed | D1, D2, D5, Q2 (superseded), Q16 |
| OA2 — empty groups closable by the director | D3 step 4, D8 |
| OA3 — parents and students read only their own groups; group names reviewed | D6, R0 line B6, R5 |
| OA4 — the year close never closes a group ending after the close date | D5 |
| OA5 — the card counts only programmes that use groups; what it will show | D7, Q17, R0 lines A3–A4 |
| S1 — a close never ends more than it counted and journalled | D3 step 11 |
| S2 — reopen locks learners before the group | D3 « Rouvrir le cours » |
| S3 — the guard share-locks the online course row | D4 |
| S5 — the date window does not depend on trigger order | D1 (window inside the re-created year guard), tests |
| S6 — a later payment never re-creates a Confirmed enrollment | D3 charge link rule and step 10, D10 step 4, Q15, R0 lines T7b1–T7b3b |
| S8 — release and rollback order with the old application | Release and rollback order |
| S9 — data step counts per approved programme set, one `leave` per learner and programme, revert refuses changed rows | D10, R0 lines T2–T4 |
| Nits | Logged date edits (D1); a run row for every close, including a replay on an empty group (D3); the missing group readers (D4); fixtures and CI wiring (tests); explicit zero rows and the T7 split (R0); dates refused on online groups (D1); the card loaded for the director only (D7); One-to-One end dates (D1, Q4) |

**CDC-r3 changes (re-review of CDC-r2):**

| Item | Where |
| --- | --- |
| N-1 — the close marks (locks) the group row right after the learner locks and before any attach; every path takes the group row before the seat lock; the false "never a deadlock" claims are corrected | D3 lock order and steps 5–11, D3 « Rouvrir le cours », D4 (lock order on every path; `enforce_group_capacity` re-created with a share lock), concurrency tests, manifest, restore |
| N-2 — only partly paid open unlinked tuition charges are linked; « engagements » (nothing paid) are shown and never linked; pre-057 charges without a year from earlier years are excluded | D3 charge link rule, preview and step 10, D8 dialog, D10 step 4, Q15, invariants, R0 lines T7b1–T7b3b, tests |
| N-3 — the year close locks the year's group rows after the learners, then, in a separate statement, marks only those without a live learner | D5, concurrency tests |
| OA6 — the June « Clôturer l'année » leaves waiting the paid enrollments without a group of short programmes whose course has not ended | Owner answers, D5, Q18, release and rollback order, tests |
| Nits | What « A suivi ce cours » means for attendance (D3 step 9, Q14); the U-lines exclude archived learner files (R0); OWNER_DECISIONS question range; year-close fixtures need past end dates (tests); the guide citation (application inventory) |

# Owner summary

**The problem (owner, 2026-11-05).** A group has a school year (`annee`) but no start or end date, so the application cannot tell that a short course is over. When a Mise à niveau or an Adults session finishes, its paid enrollments stay « Inscrit » (Confirmed or Validated) for ever. The director's dashboard card « Inscrits — groupe à affecter » shows **38**:

| Programme | Paid, no group (2026/2027) |
| --- | --- |
| Mise à niveau | 18 |
| Adults | 10 |
| Yearly | 7 |
| One-to-One | 2 |
| Online One-to-One | 1 |

The only bulk close today is « Clôturer l'année », for a whole school year. Online courses have their own close.

**What this plan proposes.** Groups get a start and an end date. The director sees which courses are finished and closes each one explicitly with « Clôturer le cours ». The close also deals with the course's paid learners who were never placed, and « Clôturer l'année » learns about course dates. A one-time, counted step ends the finished Mise à niveau backlog. Nothing ends automatically.

## What will change

- **Dates on the group form:** « Date de début » and « Date de fin ».
  - Required for the short programmes: Mise à niveau, Adults, Summer Camp and One-to-One (Q1).
  - Optional for Yearly and the other programmes.
  - Both dates must fall inside the group's school year (Q3).
  - Online courses keep the term dates they already have.
- **Dashboard card « Cours terminés à clôturer »** (director only): the number of courses whose end date has passed and which still have learners. It links to the list on the Groups page. A Yearly group appears there only once it has an end date (OA1).
- **Director command « Clôturer le cours »** on a finished course. The dialog shows:
  - how many learners the close ends;
  - how many stay « Inscrit » because they have another live enrollment;
  - how many still owe money;
  - the **paid learners of the same programme, year and level who were never placed**. For each one the director chooses « A suivi ce cours » (placed, then ended with the course; no attendance is created), « Terminer sans groupe » or « Laisser en attente » (B1, Q14);
  - the open **« engagements »**: amounts committed with nothing paid yet, often for a next session. They are shown and left as they are.

  On confirmation every live enrollment of that course ends with the reason « Cours terminé »:
  - Learner files become « Ancien apprenant » unless another live enrollment keeps them « Inscrit ».
  - Balances stay owed. A later payment on a partly paid charge lands on the ended enrollment's own charge and never puts the learner back in « Groupe à affecter » (Q15). A later payment on an « engagement » creates a new enrollment, as for any new session.
  - Attendance, receipts and the CRM conversion are untouched.
  - The close is journalled and refuses a stale count (« rechargez »). A repeated click after a lost response changes nothing.
- **An empty group** can be closed by the director at any time (OA2).
- **A closed course** no longer accepts learners and disappears from the group pickers, from attendance and from « Groupes actifs ». It stays readable under a « Clôturés » filter with its past learners (Q7). « Rouvrir le cours » undoes a close made by mistake (Q8).
- **« Clôturer l'année »** also marks closed its Yearly groups, and the other groups it empties (Q16), but never a group that still has a learner. It never touches a course that ends after the close date, such as a summer course (OA4). It also leaves waiting the paid learners without a group of a short programme whose course has not ended, such as a Summer Camp paid in May (OA6, Q18). Its dialog now shows the exact numbers from the database.
- **Parents and students** see only their own groups. Staff are unchanged (OA3). Existing group names are reviewed so that none contains a learner's name.
- **« Inscrits — groupe à affecter »** counts only paid enrollments without a group for programmes that use groups (OA5, Q17). From the 2026-11-05 figures it will show:

  | Data step runs | Card shows |
  | --- | --- |
  | Mise à niveau only | 20 |
  | Mise à niveau and Adults | 10 |
  | Mise à niveau and both One-to-One programmes | 17 |
  | All four programmes | 7 |

  The exact numbers come from R0. D7 has the details.
- **One-to-One** becomes a course of capacity 1 with its own dates, closed like any course (Q4, recommended; owner to confirm).
- **One-time clean-up**, counted first and approved separately: the 18 Mise à niveau enrollments « Confirmed » without a group end with the reason « Mise à niveau terminée ». Learners with another live enrollment stay « Inscrit ».
  - Adults (10) and One-to-One (2 + 1 online) are included only after the owner confirms each programme (Q12).
  - The 7 Yearly are never touched: they need a group.

## What staff will be able to do

- **Reception:**
  - enter and edit course dates when creating or editing a group, as with the other group fields today;
  - place paid learners in a finished course that is not yet closed, to tidy up before the close.

  Reception cannot close or reopen a course.
- **Director:**
  - see the finished courses and close each one, handling its unplaced paid learners;
  - close an empty group;
  - reopen a course closed by mistake;
  - close the school year with the new preview (Q5, Q8).
- **Admin:** as reception for groups. Closing stays with the director (Q5).

## What remains restricted

- No role gains a capability beyond the director's new commands.
- These are unchanged:
  - the placement rules (reception needs a paid enrollment: EAP Q3 = B);
  - capacity;
  - the group school-year check;
  - one live enrollment per programme and year;
  - membership derived from enrollments;
  - the finance engine.
- Parents and students lose read access to other families' groups, which they never needed. No portal page reads that table directly.
- Nothing ends automatically: no scheduled job and no end-of-date trigger.
- A closed course's dates, year, programme, level and capacity are frozen until it is reopened. Its closed mark can be written only by the commands (« Clôturer le cours », « Rouvrir le cours », « Clôturer l'année »), never by a direct table write.

## UI impact

- **Group form** (`/groups`):
  - the two dates;
  - One-to-One capacity fixed at 1, with a neutral name proposed (Q4);
  - the messages « Renseignez les dates du cours », « Les dates doivent être dans l'année scolaire du groupe » and « La date de fin précède la date de début ».
- **Groups list:** dates shown; filters « En cours » (default), « À clôturer » and « Clôturés »; a « Clôturer » action on empty groups (director).
- **Group page:**
  - « Clôturer le cours » (director) once the end date has passed, or at any time for an empty group;
  - the close dialog with its unplaced paid learners (B1);
  - for a closed course: a banner « Cours clôturé le … », no « Ajouter des apprenants » or « Retirer », and a read-only « Anciens apprenants du cours » list.
- **Students list:** the « Clôturer l'année » dialog reads its numbers from a director preview (D5).
- **Dashboard:**
  - the new card, director only;
  - « Groupes actifs » counts only groups not closed (today it counts every group, [dashboard 87](../../../src/app/(admin)/dashboard/page.jsx));
  - « Inscrits — groupe à affecter » counts only programmes that use groups (OA5).
- **Learner file:** an ended row already shows « Ancien groupe », the reason and the date. Nothing new.
- **Guide (`/helpdesk`, reception guide):** the group form dates and the rule that a group name never contains a learner's name (`#q8`); the message « Ce cours est clôturé » (`#q9`); the course close next to the year close as a way enrollments end (lines 1594 and 1625); « Clôturer un cours terminé ou le rouvrir » and « Clôturer l'année scolaire » in the `#direction` table (« Académique » row).

## Database impact

- **One forward migration** (provisional `128_course_dates_close.sql`). Nothing is dropped except one read policy, which is replaced. It adds:
  - four columns on `groups` (`date_debut`, `date_fin`, `closed_at`, `closed_by`);
  - one new guard trigger on `groups` and one on `enrollments`;
  - one journal table;
  - six director functions;
  - one family helper;
  - two read policies replacing « groups read all auth ».

  It re-creates these from their latest bodies:
  - the year guard `guard_group_year` and its trigger (125);
  - `save_receptionist_group` (125);
  - `crm_enrollment_groups` (125);
  - `close_school_year` (120);
  - the capacity trigger function `enforce_group_capacity` (120), changed only to share-lock the group row before its seat lock (N-1).

  No existing row changes: existing groups keep empty dates.
- **One separately approved, counted, journalled data step** (`supabase/manual/`) for the backlog, programme by programme, with a revert from its journal.

## Important security decisions

- The close reuses Batch D's leaver core (`academic_security.end_group_enrollments` → `leave` → `end_enrollment`), the same path as « Clôturer l'année » and the online close. It adds no new way to end an enrollment.
- **Director only** (Q5), checked inside the definer functions from the stored role, as `close_school_year` does.
- **The closed mark is trigger-protected.** `closed_at`/`closed_by` change only under the commands' transaction-local flag, so the management RLS policy on `groups` (direct writes by admin and director) cannot close or reopen a course silently.
- **The placement guard is a trigger on `enrollments`**, like Batch H's year guard. Every path therefore refuses a closed course: group page, learner file, learner form, receipt form, CRM, « Groupe à affecter » and direct writes.
- **Group rows become family-scoped for parents and students** (OA3). Today every signed-in role, parents and students included, reads every group row: policy « groups read all auth », [123 line 1463](../../../supabase/migrations/123_portal_readiness.sql), rewritten by [124 line 386](../../../supabase/migrations/124_speed_as_the_centre_grows.sql). This plan restricts parents and students to the groups of their own learners. Staff keep the current rule. Group names must still never carry a learner's name, because every staff role reads them.

## Risks / owner review points

1. **Q1 decides when a group must have dates.** The recommendation makes a short-programme group without dates refuse its next placement, as Batch H did for a group without a year. The director enters the dates of the existing short groups after the release; R0 counts them (B2).
2. **Closing ends real enrollments in bulk.** Three safeguards:
   - the dialog's count must match at execution (stale → « rechargez »);
   - a close that would end anything it did not count rolls back (S1);
   - every close is journalled, and « Rouvrir le cours » restores exactly what that close ended (Q8).
3. **Attendance after a close.** The database still accepts corrections of a leaver's attendance for sessions before the end date ([121 lines 117–125](../../../supabase/migrations/121_enrollment_group_consistency_enforce.sql), [125 line 319](../../../supabase/migrations/125_audit_follow_ups.sql)). The attendance page, however, lists current members only, so after a close the course's past attendance can no longer be corrected from the screen. The close is therefore offered only after the end date (except for empty groups), and its dialog asks to check attendance first.
4. **The backlog rows are not in any group.**
   - Only the one-time step, or the close of a course of the same programme, year and level (B1), can reach them.
   - The step ends paid enrollments. T8 counts those with no receipt at all.
   - Adults and One-to-One need the owner's confirmation per programme (Q12).
5. **The year close changes behaviour** (OA4, OA6, Q16, Q18):
   - Enrollments in a course ending after the close date are no longer ended.
   - Paid enrollments without a group of a short programme whose course has not ended are left waiting. They stay on « Inscrits — groupe à affecter » until their course's close or « Ancien apprenant » reaches them.
   - Groups it empties are marked closed; a group that still has a learner is left open.
   - Its dialog switches to a database preview.

   During the release gap or after an application rollback, the old dialog can get « rechargez »; nothing changes when it does. See the release and rollback order section.
6. **The read-policy change** could break a parent or student screen that reads `groups` directly. None exists today (verified), and a browser test for both roles is in the acceptance list.
7. **Teachers lose sight of a closed course's learners**, because rosters, access and assessments follow membership. No teacher is assigned to any group yet (Batch D follow-up 5), so nobody is affected today. Teacher read of closed courses is a follow-up (Q10).

---

# Verified current state

## Baseline and evidence limits

- **Baseline:** `origin/main` `6e724ab…`; migrations 001–127 on file; Production ledger 001–127 (CURRENT_STATE); next free number 128.
- **Method:** static inspection of migrations 001–127, `src/`, `scripts/`, `.github/workflows/verify.yml` and the docs. The read-only count query below was run on a private local stack at migration 127. On an empty database every category returns an explicit zero. With a few synthetic rows inside a rolled-back transaction it returns the expected scenario counts. **No Production read occurred.**
- **The 38:** the owner's figure is the dashboard of 2026-11-05. It agrees with the EAP release record of the same morning, which recorded Confirmed 38 before and after the archive step ([CURRENT_STATE](../../ai/CURRENT_STATE.md#enrollment-at-payment-migration-127-production-closeout-r0r4--2026-11-05)). A Confirmed row placed in a group becomes Validated, so every Confirmed row has no group.
- **Charges:** the local 127 catalog has no trigger on `public.charges`. Linking an open charge to an enrollment (the D3 charge link rule) meets no finance guard today; re-checked at implementation.
- **Line numbers:** those of the baseline files. The implementer re-reads every function to re-create with `pg_get_functiondef` on a local database first.

## Database dependency inventory (latest definitions)

| Concern | Latest definition | Today | This plan |
| --- | --- | --- | --- |
| `public.groups` columns | [001 lines 68–86](../../../supabase/migrations/001_initial_schema.sql), [049](../../../supabase/migrations/049_session_scoped_groups_and_levels.sql) `session_type`, [117 lines 25–28](../../../supabase/migrations/117_online_learning_pilot.sql) programmes | `name`, `niveau`, `teacher_id`, `salle`, `jours`, `horaire`, `capacite_max` (default 12), `terme` (« Sept–Déc », « Jan–Mar », « Avr–Juin », « Été »), `annee`, `categorie`, `session_type` (Yearly, Adults, Summer Camp, Communication Junior, Communication Adult, One-to-One, Mise à niveau, Other, Online, Online One-to-One). **No date and no closed state.** | **Adds** `date_debut date`, `date_fin date`, `closed_at timestamptz`, `closed_by uuid`, check `date_fin >= date_debut`. `terme` unchanged. |
| Group reads | RLS « groups read all auth » ([123 line 1463](../../../supabase/migrations/123_portal_readiness.sql), [124 line 386](../../../supabase/migrations/124_speed_as_the_centre_grows.sql)): every role except `pending` | Parents and students read every group row. | **Replaced** by « groups read staff » (unchanged rule for every role but parent, student and pending) and « groups read family » (D6). |
| Group writes | RLS « groups admin all » ([124 line 380](../../../supabase/migrations/124_speed_as_the_centre_grows.sql); admin and director; direct insert/update/delete); reception through `public.save_receptionist_group` ([125 line 1762](../../../supabase/migrations/125_audit_follow_ups.sql); key allowlist `assert_keys`; create replay identity check) | The form writes the table directly for management and calls the RPC for reception ([groups/page.jsx 72–78](../../../src/app/(admin)/groups/page.jsx)). | **Re-created** `save_receptionist_group`: the 125 body plus the two date keys (allowlist, insert, update, replay identity). Management keeps its direct writes; the guards cover them. |
| Group guards | `groups_year_guard` → `academic_security.guard_group_year` ([125 lines 117–141](../../../supabase/migrations/125_audit_follow_ups.sql): fills the default year on insert (D-H5a), checks the format, locks the year while live learners of another year exist; trigger `before insert or update of annee`); `groups_membership_level_guard` ([120 line 398](../../../supabase/migrations/120_enrollment_group_consistency.sql), D7); `online_group_guard` ([117 line 875](../../../supabase/migrations/117_online_learning_pilot.sql)) | Year rules only. | **Re-created** `guard_group_year` and its trigger, with the date window (D1, S5). **New** `groups_course_guard` (D1, D4). |
| Placement guards on `enrollments` | `enrollment_group_year_guard` → `guard_enrollment_group_year` ([125 lines 87–111](../../../supabase/migrations/125_audit_follow_ups.sql), share-locks the group, line 103); capacity `enrollment_group_capacity` → `enforce_group_capacity` ([120 lines 404–421](../../../supabase/migrations/120_enrollment_group_consistency.sql): a plain read of the group at line 411, then the seat advisory lock `group:seats:<id>` at line 413); online capacity ([117 lines 894–913](../../../supabase/migrations/117_online_learning_pilot.sql)); EAP retired-status guard (127) | No closed-course notion. Placement into a closed online course is **not** refused: open Batch D follow-up 2, review DB-N3 ([OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md#enrollment-and-group-consistency-batch-d--released-2026-10-26)). Same-event triggers fire in name order, so on a direct write the capacity trigger takes the seat lock **before** the year guard share-locks the group. | **New** `enrollment_course_guard` (D4). **Re-created** `enforce_group_capacity`: its group read takes `for share`, so the group row is locked before the seat lock on every path (N-1). No rule changes. |
| Placement command | `academic_security.place` / `public.place_learner_in_group` ([127 lines 1013–1148](../../../supabase/migrations/127_enrollment_at_payment.sql)): reception needs a paid enrollment (Q3 = B); management gives a logged reason; capacity override with reason. Lock order: learner (line 1023), enrollment, group row `for share` (line 1057), then the seat advisory lock (line 1096), held to commit. `assign_receptionist_student_group` ([120 line 979](../../../supabase/migrations/120_enrollment_group_consistency.sql)) calls the same core. | — | **Unchanged.** The new trigger refuses closed courses and undated short groups underneath it. « A suivi ce cours » (B1) calls the core after the close holds the group row (N-1). |
| Leaver core | `academic_security.end_enrollment` ([120 lines 602–613](../../../supabase/migrations/120_enrollment_group_consistency.sql): sets `Ended`, `ended_at`, `ended_by`, `end_reason`, `ended_group_id`); `academic_security.leave` (lines 624–666: ends the chosen enrollments; file → Alumni/Inactive only when nothing else is live; never touches charges, receipts or attendance); `academic_security.end_group_enrollments` (lines 1529–1548: every live enrollment of one group, learners locked in id order, loops until none is left) | Shared by `end_learner`, `close_school_year`, archive and `online_close_course`. | **Reused unchanged.** |
| Year close | `public.close_school_year(text, integer, text)` ([120 lines 704–736](../../../supabase/migrations/120_enrollment_group_consistency.sql); not re-created since): director only; ends every live enrollment of the year; the live count must equal the expected count (`egc.stale`, `PT409`); Alumni; logged | The dialog counts live enrollments of the year in the browser ([students/page.jsx 81–86](../../../src/app/(admin)/students/page.jsx)) and calls the command. It locks learners only; it locks no group. | **Re-created** from 120: spares courses ending later, leaves waiting the paid unplaced rows of short programmes whose course has not ended (OA6), locks the year's group rows after the learners and marks closed only those left without a live learner (N-3), plus a preview (D5). |
| Online close | `public.online_close_course(uuid, bigint)` ([120 lines 1557–1580](../../../supabase/migrations/120_enrollment_group_consistency.sql), from 117/118): director or admin; version-checked; takes the course row `for update`; revokes join passes; ends enrollments with « Cours en ligne clôturé » (first pass, seat lock, second pass, lines 1574–1576). `online_courses.term_start`/`term_end` are limited to 182 days ([117 lines 323–347](../../../supabase/migrations/117_online_learning_pilot.sql)). | Online courses already have dates and a close. | Unchanged (Q9). The course guard share-locks the course row and refuses placement into a closed online course (D4, S3). |
| Payment and enrollment | `create_charge_payment` ([127](../../../supabase/migrations/127_enrollment_at_payment.sql)): a payment on an unlinked tuition charge looks for the learner's **live** enrollment of that programme and year (lines 209–214). If none exists it **inserts a new Confirmed enrollment** (lines 248–252) and links the charge (line 260). An ended enrollment takes payments only on its own linked charge (lines 227–228). | After a close, a payment on an open charge that was never linked would create a fresh Confirmed enrollment and put the learner back on « Groupe à affecter ». An undated charge (only charges created before 057, which made the year required at [057 line 169](../../../supabase/migrations/057_receipt_school_year_workflow.sql)) is treated as the current school year (127 lines 204–217). A charge with nothing paid is an EAP commitment (« engagement »), often for a next session. | Unchanged. The close and the data step first link the **partly paid** such charges, never an « engagement » and never an undated charge created before the enrollment's school year (the D3 charge link rule, D10, Q15, S6, N-2). |
| Conflicts | `academic_security.stale()` ([120 lines 75–78](../../../supabase/migrations/120_enrollment_group_consistency.sql); `PT409`, `egc.stale`), ADR-009 | The browser maps `PT409` to « rechargez » ([membershipActions.mjs 71–93](../../../src/lib/academic/membershipActions.mjs)). | New commands raise `PT409` only; no `40001`. |
| Reopen | `public.reopen_enrollment` ([127 line 882](../../../supabase/migrations/127_enrollment_at_payment.sql)): director or admin; Ended → Confirmed without group; refuses rows ended by the EAP archive (journal membership) | — | Unchanged. Rows ended by a close or the data step stay reopenable (Q13). |
| Learner status | `public.sync_student_from_enrollments` ([121 line 51](../../../supabase/migrations/121_enrollment_group_consistency_enforce.sql)), D3-A | Enrolled while a Confirmed/Validated enrollment exists; Alumni/Inactive only through the leaver paths. | Unchanged. |
| CRM conversion | `crm_security.evaluate_conversion` ([120 lines 1317–1336](../../../supabase/migrations/120_enrollment_group_consistency.sql), D5-A) | An enrollment ended from Confirmed/Validated keeps its conversion, **with no review flag**. | Unchanged (counted: T9). |
| Attendance | `public.attendance_student_in_group` ([125 line 319](../../../supabase/migrations/125_audit_follow_ups.sql)) and `enforce_attendance_integrity` ([121 line 129](../../../supabase/migrations/121_enrollment_group_consistency_enforce.sql)) | Accepted for a member, or for an ended enrollment of that group for a session **before** its end date. | Unchanged. The close happens after `date_fin` (Q6). |
| Teacher access | `teacher_can_access_student_group` ([123 line 200](../../../supabase/migrations/123_portal_readiness.sql)), `portal_teacher_roster` (123 line 516) | Membership only. | Unchanged (Q10). |
| Family visibility | `public.get_visible_student_ids()` ([123 line 210](../../../supabase/migrations/123_portal_readiness.sql)); portal projections such as `online_list_lessons_for_me` / `_for_my_children` ([117 lines 1585–1595](../../../supabase/migrations/117_online_learning_pilot.sql), SECURITY DEFINER, reading groups through `online_security.family_lessons`, line 1552) | The definer projections are not affected by RLS. | The new « groups read family » policy uses a definer helper built on `get_visible_student_ids()` (D6). |
| Group pickers | `public.crm_enrollment_groups` ([125 line 1837](../../../supabase/migrations/125_audit_follow_ups.sql)) | Lists every group of the programme/level with its year. | **Re-created** from 125 to omit closed courses. |
| « Groupe à affecter » | `search_students_page` ([124 lines 1072–1078](../../../supabase/migrations/124_speed_as_the_centre_grows.sql)); dashboard count: Confirmed with no group ([dashboard 90](../../../src/app/(admin)/dashboard/page.jsx)) | — | The list is unchanged. The card counts programmes that use groups (D7). The data step lowers both. |
| Journals | `maintenance.egc_cleanup_log` (120 lines 62–72), `maintenance.eap_archive_journal` (127 lines 41–55) | Each is tied to its own batch. The EGC revert refuses after M2. | **New** `maintenance.course_close_journal` (D3, D10), with the same posture: RLS on, no API grant. |
| Activity log | `academic_security.log(p_kind, p_enrollment, p_student, p_group, p_details)` ([120 line 168](../../../supabase/migrations/120_enrollment_group_consistency.sql)) | Used by the leaver and the year close. | Used for closes, reopenings and group date edits. |
| Clock | `public.business_date()`, `public.centre_school_year()` ([125 lines 42–61](../../../supabase/migrations/125_audit_follow_ups.sql)), `academic_security.today()` (125 line 153) | One centre clock, UTC+0 (ADR-014). | « Today » in every new rule is `public.business_date()`. |

## Application inventory (verified)

- **Groups:**
  - [groups/page.jsx](../../../src/app/(admin)/groups/page.jsx): `GroupModal` 36–144 (default form line 40; `terme` options 127; school year 41/62/70); save 72–80 (reception RPC, management direct write, `PT409` reload); list 179–194; delete 200–208 (reception cannot delete, 270/309); filters 211–215 (terme, programme, level; no date or year filter).
  - [groups/[id]/page.jsx](../../../src/app/(admin)/groups/[id]/page.jsx): roster 30–43; teachers 80–85; seats 111–114; « Ajouter des apprenants » 143–181/235–242; « Retirer » 183–203/302–308; meta 209–218.
  - Roles: `canManageGroups` ([roleAccess.mjs 14, 52, 61](../../../src/lib/roleAccess.mjs)), [Sidebar.jsx 45](../../../src/components/layout/Sidebar.jsx), [middleware.js 26–30](../../../src/middleware.js).
- **Pickers that start something new:** [EnrollmentModal.jsx 51–54](../../../src/components/students/EnrollmentModal.jsx); [StudentForm.jsx 152–155, 352](../../../src/components/students/StudentForm.jsx); [receiptGroupChoices.mjs 10–38](../../../src/lib/receiptGroupChoices.mjs) with [ReceiptForm.jsx 350](../../../src/components/receipts/ReceiptForm.jsx); [LegacyPlacementEditor.jsx 22, 27](../../../src/components/placement/LegacyPlacementEditor.jsx); [CrmEnrollmentDialog.jsx 75](../../../src/components/crm/CrmEnrollmentDialog.jsx) (`crm_enrollment_groups`); the announcement group picker in [communications/page.jsx 209](../../../src/app/(admin)/communications/page.jsx); the placement-test group picker in [placement-tests/page.jsx 42](../../../src/app/(admin)/placement-tests/page.jsx).
- **Name lookups, which must keep closed groups:**
  - [students/[id]/page.jsx 140](../../../src/app/(admin)/students/[id]/page.jsx): « Ancien groupe », lines 295–302;
  - [students-directory/page.jsx 63](../../../src/app/(admin)/students-directory/page.jsx);
  - [leave-requests/page.jsx 87](../../../src/app/(admin)/leave-requests/page.jsx);
  - [cacheInvalidation.mjs](../../../src/lib/cacheInvalidation.mjs).
- **Dashboard** ([dashboard/page.jsx](../../../src/app/(admin)/dashboard/page.jsx)): counts 84–93 (groups: every row, line 87; awaiting group: Confirmed with no group, line 90); cards 153–163 (« Groupes actifs » 156; « Inscrits — groupe à affecter » 159, admin and director).
- **Year close, leaver, reopen:**
  - [students/page.jsx 75–112, 334–343](../../../src/app/(admin)/students/page.jsx): `YearCloseDialog`. The browser count is at 81–86; the command then runs with the expected count.
  - [students/[id]/page.jsx](../../../src/app/(admin)/students/[id]/page.jsx): 46–94 (`LeaverDialog`); 189–196 and 306 (« Rouvrir l'inscription »); 297–303 (ended rows).
  - Helpers in [membershipActions.mjs](../../../src/lib/academic/membershipActions.mjs) 120–133; error texts at 12–42 and 71–93.
- **Online:** [online/[id]/page.jsx](../../../src/app/(admin)/online/[id]/page.jsx) 45–79 (`term_start`, `term_end`), 48 (Online One-to-One capacity 1), 247–266 (« Clôturer »); [api/online/courses/close/route.js](../../../src/app/api/online/courses/close/route.js); [online/handlers.mjs 75, 93](../../../src/lib/online/handlers.mjs).
- **Attendance, timetable, teacher portal, assessments:** [attendance/page.jsx](../../../src/app/(admin)/attendance/page.jsx) 56–86 (every group; roster from membership), 134–141; [timetable/page.jsx 41, 63](../../../src/app/(admin)/timetable/page.jsx); [teacher-portal/page.jsx 458–480, 617](../../../src/app/(admin)/teacher-portal/page.jsx); [assessments/page.jsx 158–162](../../../src/app/(admin)/assessments/page.jsx).
- **Parent and student portals:** `/parent-portal` and `/student-portal` ([roleAccess.mjs 92–93](../../../src/lib/roleAccess.mjs)) do **not** read `groups` directly. Their data comes through definer projections.
- **Reports:** [reportData.mjs 75–111](../../../src/lib/reportData.mjs) and [AcademicOperationsReport.jsx 94–129](../../../src/components/reports/AcademicOperationsReport.jsx); `report_student_mix` ([124 line 1242](../../../supabase/migrations/124_speed_as_the_centre_grows.sql)).
- **Programmes:** [programCatalog.mjs 21–31](../../../src/lib/programCatalog.mjs) (`SESSION_TYPES`). A payment for the `Other` programme never creates an enrollment ([127 lines 154–173](../../../supabase/migrations/127_enrollment_at_payment.sql)).
- **Guide** ([GuideContent.jsx](../../../src/app/(admin)/helpdesk/GuideContent.jsx), the reception guide « Guide Accueil »):
  - `#q8` 1015–1060: the group form (school year 1033, edit 1048, the year callout 1050);
  - `#q9` 1061–1103 and `#q10` 1109–1141: placement and moves;
  - `#q14` « La rentrée », the groups line 1262;
  - reception's Groups screen, line 1472;
  - the « Terminée » paragraph, line 1594, and the file-status table 1595–1626. Lines 1594 and 1625 already name « la clôture de l'année scolaire ou d'un cours en ligne » as a way enrollments end;
  - `#direction` 1853: the table « Réservé à la direction » of what reception must ask the director; its « Académique » row is line 1880.

  The year close is mentioned only in passing (lines 1594 and 1625): the guide is for reception, and the director's commands appear only as rows of the `#direction` table.

## Tests that touch the changed areas, fixtures and CI wiring

- **Suites:**
  - `test-enrollment-group-consistency.sql`: 751–759 `close_school_year`; 362–372 level lock.
  - `test-egc-upgrade.mjs`: 179 and 254–275, the shared `end_group_enrollments` core.
  - `test-online-learning.sql`: 241, 505, 555, 858 `online_close_course`.
  - `test-online-unit.mjs`: 156–169.
  - `test-receptionist-batch1.sql`: 185–218 `save_receptionist_group`.
  - `test-audit-follow-ups.sql` and `test-audit-follow-ups-ui.mjs`: year-close shape and the dashboard card label.
  - `test-student-placement-browser.mjs`: 98–101.
  - `test-cache-invalidation.mjs`, `test-enrollment-workflow.mjs`, `test-membership-actions.mjs`, `test-receipt-client-regressions.mjs` and `test-enrollment-at-payment-absence.mjs`: these read the dashboard source.
  - `test-enrollment-at-payment.sql` and `test-enrollment-at-payment-upgrade.mjs`: upgrade ceiling 127.
  - `test-receptionist-group-filter.sql`, `test-student-placement.sql`, `test-enrollment-group-concurrency.py`.
  - `test-portal-readiness.sql`: the 123 policies.
- **Fixtures creating short-programme groups:** these scripts insert Mise à niveau, Adults, Summer Camp or One-to-One groups, usually without dates, and many then place learners in them. Under Q1 = A the insert or the placement is refused, so each fixture gains dates (a test-only change, no assertion changes). The scripts are:
  - `test-audit-follow-ups.sql`, `test-crm-phase6.sql`;
  - `test-crm-rcc-a2.sql` (line 266, an undated Adults group);
  - `test-enrollment-workflow.sql`, `test-enrollment-at-payment.sql`, `test-portal-readiness.sql`, `test-enrollment-group-consistency.sql`, `test-online-learning.sql`, `test-paid-enrollment.sql`;
  - `test-receptionist-security.sql`, `test-receptionist-group-filter.sql`, `test-student-placement.sql`, `test-receptionist-batch1.sql`, `test-speed-as-the-centre-grows-fixture.sql`;
  - `test-egc-upgrade.mjs`, `test-enrollment-at-payment-upgrade.mjs`, `test-portal-readiness-upgrade.mjs`;
  - `test-receptionist-browser.mjs`, `test-student-placement-browser.mjs`, `test-enrollment-group-concurrency.py`.

  One-to-One fixtures also get capacity 1. The implementer re-greps, because this list comes from a static search.
- **CI wiring** ([verify.yml](../../../.github/workflows/verify.yml)): the new SQL suite gets its own step like lines 383/391; the upgrade rehearsal like line 353; the concurrency harness like line 424.

---

# Owner direction (2026-11-05), proposed by the coordinator

Recorded as **proposed**. The owner confirms or changes each point through the answers below.

1. Groups get `date_debut` and `date_fin`: required for short programmes (Mise à niveau, Adults, Summer Camp, One-to-One); for Yearly, proposed as the end of the school year; validated against the group's school year. → Q1, Q3, OA1.
2. A director dashboard card « Cours terminés à clôturer » (end date passed, still active enrollments). → D2, D7, Q5.
3. A director command « Clôturer le cours ». It ends every live enrollment of that group with the reason « Cours terminé » and resyncs the files (Ancien apprenant, unless another live enrollment keeps Inscrit). Balances stay owed; attendance and receipts are kept. It is journalled and idempotent, and reuses the Batch D leaver/year-close machinery and ADR-009 conflicts. It is not automatic. → D3, Q5–Q8, Q14, Q15.
4. One-to-One as a course of capacity 1 with its own dates (recommendation; the owner is asked). → Q4.
5. One-time data step, counted first and approved separately. It ends the 18 Mise à niveau Confirmed enrollments without a group with the reason « Mise à niveau terminée »; learners with another live enrollment keep Inscrit. Adults (10) and One-to-One (3) are included only after the owner's confirmation per programme. → D10, Q11–Q13.

## Owner answers to the CDC-r1 review (Maroine, proposed by the coordinator, 2026-11-05)

Recorded as **proposed**. They stand once the owner approves this revision.

- **OA1:** Yearly groups appear on « Cours terminés à clôturer » only if they have a `date_fin`. « Clôturer l'année » also marks its Yearly groups closed. This replaces CDC-r1's implicit 31 August end for the card.
- **OA2:** empty groups (no live enrollment) can be closed by the director and move to « Clôturés ».
- **OA3:** parents and students read only their own groups, by restricting the policies at 123:1463 / 124:386. Staff are unchanged. Existing group names are reviewed so that none contains a learner's name.
- **OA4:** « Clôturer l'année » never closes a group whose `date_fin` is after the close date (summer courses).
- **OA5:** after the one-time step, the dashboard card counts only paid enrollments without a group for programmes that use groups. The plan states what it will show (D7).

## Owner answer to the CDC-r2 re-review (Maroine, proposed by the coordinator, 2026-11-05)

Recorded as **proposed**, like OA1–OA5 above.

- **OA6:** the June « Clôturer l'année » does **not** end the paid enrollments without a group of short programmes (Summer Camp, Mise à niveau) whose course has not ended; it leaves them waiting. D5 defines « whose course has not ended »; Q18 asks about rows whose course does not exist yet.

# Scope and non-goals

**In scope:**

- the group dates and their validation;
- the finished-course list and dashboard card;
- « Clôturer le cours » (with the unplaced paid learners), empty-group close and « Rouvrir le cours »;
- the closed-course placement guard, in person and online;
- the year close's course-aware changes and its preview;
- the family-scoped group read policy;
- the pickers, lists and dashboard counts that must ignore closed courses;
- One-to-One as a capacity-1 course (if Q4 = A);
- the counted data step for the backlog, with its revert;
- tests, fixtures, CI wiring, docs and the guide.

**Non-goals:**

- any automatic close or reminder job;
- changing the leaver core, `online_close_course`, placement (`place`), capacity, the membership rule or the payment command;
- dropping or migrating `terme` (it stays, now redundant with the dates; retiring it is a later wording change);
- filling dates on existing groups by migration (no guessed data; the director enters them, Q1);
- teacher read of closed courses (Q10) and past online rosters (Batch D follow-up 2, first half);
- re-creating `search_students_page`: the « Groupe à affecter » list can differ from the card only by `Other` rows, of which there are 0 today (D7);
- finance amounts, numbering or CRM changes;
- any Production read or mutation by the architecture or implementation task.

# Design

## D1 — Group dates and their validation (Q1, Q3, Q4, OA1, S5)

**Columns.** `date_debut date` and `date_fin date` on `public.groups`, nullable so existing rows stay empty, with `groups_course_dates_order check (date_debut is null or date_fin is null or date_fin >= date_debut)`.

**Short programmes** (Q1 = A: Mise à niveau, Adults, Summer Camp, One-to-One):

- A new group of these programmes needs both dates, and so does a group whose programme changes into one of them.
- Once set, the dates are never cleared.
- An existing short group without dates keeps working, except that a **new placement** into it is refused: « Renseignez les dates du cours avant d'y affecter un apprenant. » (hint `course.dates_required`). This mirrors D-H5b, where Batch H made a group without a year refuse placement.

**Yearly, Other, Communication Junior/Adult:** dates optional. **No computed end (OA1):** a Yearly group is finished only once it has a `date_fin` that has passed. Otherwise « Clôturer l'année » ends it (D5).

**Online groups:** their date columns must stay empty. The guard refuses a date on Online or Online One-to-One (« Les dates d'un cours en ligne se modifient sur sa page Cours en ligne. », hint `course.online_dates`). Their dates are `online_courses.term_start`/`term_end`, edited on the online course page as today (Q9).

**Window (Q3 = A), order-independent (S5):**

- For a group of school year `Y/Y+1`, both dates lie between **1 June Y and 31 August Y+1**. This is the window the EAP « paid elsewhere » rule already uses ([PRODUCT_RULES](../../ai/PRODUCT_RULES.md#enrollment-at-payment-migration-127-released-2026-11-05)).
- The check lives **inside the year guard**. `academic_security.guard_group_year()` is re-created from its [125 body](../../../supabase/migrations/125_audit_follow_ups.sql) (lines 117–139), with the window check added **after** the year is filled (insert without a year → the D-H5a default) or validated.
- Its trigger is re-created as `groups_year_guard before insert or update of annee, date_debut, date_fin`.
- The 125 early return for an unchanged year (line 123) now skips only the year checks, not the window.
- So the window always sees the effective year, whatever the trigger order. A change of `annee` re-checks the dates.
- Refusal message: « Les dates du cours doivent être comprises dans l'année scolaire du groupe (du 1er juin … au 31 août …). » (hint `course.dates_outside_year`).

**Course guard (no year dependency).** `academic_security.guard_course_group()` (`security definer`, fixed `search_path`, no API grant) runs on trigger `groups_course_guard before insert or update of date_debut, date_fin, session_type, capacite_max, niveau, annee, closed_at, closed_by on public.groups`. It reads only the row's new and old values, and it refuses rather than modifies, so its order relative to the year guard changes no outcome. It enforces:

- the required dates;
- the dates refused on online groups;
- the One-to-One capacity;
- the protected closed mark and the frozen fields of a closed group (D4).

**Logged date edits (nit, Q6).** Every change of `date_debut` or `date_fin` on an existing group is written to the activity log as `group_dates_changed`, with the old and new values, through `academic_security.log(kind, null, null, group, details)` ([120 line 168](../../../supabase/migrations/120_enrollment_group_consistency.sql)). Moving an end date to stop a course early is therefore traceable.

**One-to-One (Q4 = A):**

- Capacity is 1. The form fixes it; the guard refuses another value on insert and on a change of `capacite_max` or `session_type`.
- Existing One-to-One groups with another capacity are counted at R0 (B5) and corrected when next edited.
- **End date (nit):** the planned end of the lesson package. It can be moved later (logged) while the course is open, for instance when lessons are added. The card lists the course once that date has passed.
- The form proposes the name « Cours individuel · <niveau> · <date de début> », and the guide forbids learner names in group names.

**Reception RPC.** `save_receptionist_group` is re-created from its [125 body](../../../supabase/migrations/125_audit_follow_ups.sql) (line 1762). `date_debut` and `date_fin` are added to `assert_keys`, the insert, the update (`case when p_changes ? … then … else g.… end`) and the create-replay identity comparison. Nothing else changes; a one-line unchanged-from-125 proof is required, as in EAP.

## D2 — The finished-course list (OA1, OA2)

`public.list_courses_to_close()` is director only, `security definer`, `stable`, and granted to `authenticated`. Each row has: `kind` (`in_person` or `online`), `group_id`, `name`, `session_type`, `niveau`, `school_year`, the dates (or the online term), `live_count`, `unplaced_count` (B1: the paid enrollments without a group that match the course, D3) and `empty`. The rows are:

- **In-person groups** with `closed_at is null` and a `date_fin` **before** `public.business_date()`. This includes Yearly groups only when they have a `date_fin` (OA1). Empty ones are included and flagged `empty`, so the « À clôturer » filter shows them.
- **Online courses** (Q9 = A) with `term_end` before today, `status <> 'closed'`, and at least one live enrollment.

The list is ordered by end date, oldest first, and bounded to 200 rows. « Live » means the Batch D live set (`Submitted, Under Review, Confirmed, Validated, Trial`); since 127 only Validated rows can be in a group.

## D3 — « Clôturer le cours » (director; Q5–Q8, Q14, Q15, OA2, B1, S1, S2, S6, N-1, N-2)

**Matching paid enrollments without a group (B1).** For a group of programme P, school year Y and level L, the « unplaced paid enrollments » are those that meet all of:

- status Confirmed, `group_id is null`;
- `session_type = P` and school year Y;
- `level is null` or `level = L`;
- the learner file is not archived.

R0 counts them (U1–U3).

**The charge link rule (S6, N-2).** Before an enrollment ends (course close or one-time step), an open charge of its learner is linked to it only when all of these hold:

- tuition: `session_type` is the enrollment's programme; not `legacy`; not voided; `enrollment_id is null`;
- open and **partly paid**: in `charge_balances`, `balance > 0` **and** `paid_amount > 0`;
- of the enrollment's school year. A charge **without a year** (created before 057, which made the year required at [057 line 169](../../../supabase/migrations/057_receipt_school_year_workflow.sql)) qualifies only when the enrollment's year is the current centre year, which is the payment path's rule for undated charges ([127 lines 204–217](../../../supabase/migrations/127_enrollment_at_payment.sql)), **and** the charge was created during that school year (`public.centre_school_year(public.business_date(created_at))` equals it). An undated charge of an earlier year is never linked.

**Never linked:**

- **« Engagements »:** open unlinked tuition charges of the same learner and programme, of that year or undated, with **nothing paid** (`paid_amount = 0`). Under EAP an engagement is a commitment, often for the next session of the programme. A later payment on one finds no live enrollment and creates a new Confirmed enrollment (127 lines 248–252), which is right for a new session. The preview shows them, and the dialog says so.
- Undated charges of earlier years (above).

Each link is journalled as `charge_linked`. Amounts, receipts and settlement are untouched.

### Preview

`public.close_course_preview(p_group uuid) returns jsonb` (director) returns the dialog's numbers:

- `live_count`, `stay_enrolled`, `become_alumni`;
- `open_balance_count` (balances on charges already linked to the enrollments that end);
- `charges_to_link`: count and total balance of the charges the link rule will link (S6, N-2);
- `engagements`: count and total of the « engagements » of those learners, programme and year, shown and never linked (N-2);
- `date_fin`, `closed_at`, `empty`;
- `unplaced`: one entry per unplaced paid enrollment, `{enrollment_id, student_id, full_name, level, paid_total, has_other_live}`, which the dialog shows by name. Only the director, who already reads every learner, receives it.

### Command

`public.close_course(p_group uuid, p_expected_count integer, p_reason text default 'Cours terminé', p_attach uuid[] default '{}', p_end_unplaced uuid[] default '{}') returns jsonb`. Properties: `security definer`; `search_path = pg_catalog, pg_temp`; execute granted to `authenticated` only (revoked from `public`, `anon`, `service_role`); the role is checked inside (`get_my_role() = 'director'`, else `42501`).

**Lock order (N-1).** The close takes, in this order: the learners (id order), then the group row, then the group's seat advisory lock (`group:seats:<id>`, only through « A suivi ce cours »). Every path that enters a group follows the same order (D4):

- `academic_security.place`: learner (127 line 1023), enrollment, group row `for share` (line 1057), seat lock (line 1096);
- a direct write: the course guard and the re-created capacity trigger share-lock the group row before the seat lock;
- `reopen_course` and the year close: learners, then group rows.

So a transaction that holds a group row never waits for a seat lock held by a transaction waiting for that row. **CDC-r2 claimed the close could never deadlock; that was wrong.** It marked the group after « A suivi ce cours » had taken the seat lock, while a concurrent placement held the group share lock and waited for that seat lock, and the reviewer reproduced the deadlock. CDC-r3 marks the group before any attach, and the concurrency harness covers that case (tests).

1. **Reason:** `academic_security.valid_reason` (1–200 characters; the dialog prefills « Cours terminé »).
2. **Group:**
   - not found → `PT409` `egc.stale`;
   - an online programme → `23514` `course.online` (« Clôturez ce cours depuis sa page Cours en ligne. »).
3. **Replay (idempotency):**
   - Every close writes a **run row** in the journal holding its inputs and its result (nit: an empty close too).
   - If `closed_at` is set, the command returns the latest run row's result with `replayed: true` and writes nothing, which holds for an empty group as well (nit).
4. **When a close is allowed (Q6 = A, OA2):**
   - A group with no live learner, called with an expected count of 0 and both lists empty, can be closed **at any time, with or without dates**; nothing ends.
   - Otherwise `date_fin` must exist and be before `public.business_date()`, else `23514` `course.not_finished` (« Ce cours n'est pas terminé : sa date de fin est le … »). There is no computed end for Yearly (OA1).
5. **Learner locks:** the learners of the group's live enrollments (read without locks) and of the `p_attach`/`p_end_unplaced` enrollments are locked together, in one pass in id order.
6. **Mark the group, right after the learner locks and before any attach or end (N-1):** `update public.groups set closed_at = now(), closed_by = auth.uid() where id = p_group and closed_at is null` and the step 4 rule still holds, under the transaction-local flag `eh.course_command = 'on'`. This takes the group row lock.
   - No row: the group is re-read. If it is now closed (a second director's close waited on this row), the command returns the replay of step 3. Otherwise `PT409` `egc.stale`.
   - From here no placement can enter the group. Every path takes the group row before its seat lock, so it waits until this transaction ends and is then refused `course.closed` (D4).
7. **Counts, in a new statement after the mark,** so they see every placement that committed before the mark:
   - The live count must equal `p_expected_count`, and every live member's learner must be one locked in step 5, else `PT409` `course.count_changed` (« Le nombre d'apprenants a changé, rechargez. »). Everything rolls back, the mark included. The close therefore never locks a learner after the group row.
   - Each id in the two lists must still be an unplaced paid enrollment matching the course, and must appear in only one list, else `PT409` `course.unplaced_changed`.
8. **Journal first:** in `maintenance.course_close_journal` (`source = 'close_course'`, one `run_id`), write:
   - the run row;
   - the before-images of every enrollment the close will touch: action `ended` for members, `attached` and `ended_unplaced` for the two lists (`status`, `group_id`, `level`, `school_year`);
   - the before-image of each learner file (`status`, `groupe_id`).
9. **Attach (B1, « A suivi ce cours »):** each `p_attach` enrollment is placed in the now-marked group through the existing placement core (`academic_security.place`, director path), under the `eh.course_command` exemption of the course guard (D4). `place` takes its learner (already held), the enrollment, the group row (already held by this transaction) and then the seat lock. Capacity is overridden with the logged reason « Rattaché à la clôture du cours », because the course is over. These learners then appear in the course's history (`ended_group_id`).
   - **Attendance (nit):** « A suivi ce cours » creates **no** attendance row. It records the course in the learner's history only. The learner was never a member of this group, so they have no attendance in it. Their attendance in other groups is kept unchanged, like every other attendance row.
10. **Charges (S6, Q15 = A):** before anything ends, the charge link rule above links the qualifying charges to the enrollments about to end (members, attached and listed rows). A later payment on such a charge lands on the ended enrollment's own charge. That is accepted without reviving the enrollment (127 lines 227–228), instead of inserting a fresh Confirmed enrollment (127 lines 248–252) that would put the learner back on « Groupe à affecter ».
11. **End (S1):**
    - `academic_security.end_group_enrollments(p_group, 'Alumni', reason)` ends the members and the attached rows. Their learners are already held (step 7).
    - Then, per `p_end_unplaced` learner in id order, `academic_security.leave(student, 'Alumni', reason, array[those ids])`.
    - No second pass is needed, because no row can enter the group after the mark.
    - **The total ended must equal `p_expected_count + cardinality(p_attach) + cardinality(p_end_unplaced)`, which is exactly the journalled rows.** This stays as an assertion: any difference raises `PT409` `course.count_changed` and everything rolls back. « Rouvrir le cours » can therefore always restore exactly what a close ended.
12. **Log and result:** the command logs `academic_security.log('close_course', null, null, p_group, {run_id, reason, ended, attached, ended_unplaced, alumni, still_enrolled, open_balances, charges_linked, engagements})` and writes the same result into the run row. It returns `{group_id, closed_at, ended, attached, ended_unplaced, alumni, still_enrolled, open_balance_count, charges_linked, engagements, run_id, replayed: false}`.

**What the close does not touch:** charge amounts, receipts, payments, attendance rows, CRM conversions (D5-A, no review flag), the lifecycle outbox, and the learners' other enrollments. The only change outside enrollments and files is the journalled charge links of step 10.

**Learner files:** `leave` sets Alumni (« Ancien apprenant ») when nothing else is live. Otherwise the file stays Enrolled (« Inscrit ») and the main group moves to the remaining membership, exactly as the year close does.

### « Rouvrir le cours » (Q8 = A, S2)

`public.reopen_course(p_group uuid, p_expected_closed_at timestamptz) returns jsonb` (director):

1. Read, without locks, the group's latest run in the journal (`close_course` or `close_school_year`).
2. **Lock the learners of that run's rows in id order first (S2).**
3. Then clear the mark: `update … set closed_at = null, closed_by = null where id = p_group and closed_at = p_expected_closed_at`, under `eh.course_command`. No row → `PT409`.
4. Restore each journalled row that is still `Ended` with that run's `ended_at` and reason, and whose learner has no other live enrollment of that programme and year:
   - members return to Validated in the group;
   - `attached` and `ended_unplaced` rows return to Confirmed without a group.

   This uses the « Rouvrir l'inscription » transition followed, for members, by a placement in the same group (capacity override flag set and logged, because the seats were theirs). Rows that changed since are left ended and returned in `skipped` with a reason code.
5. Charge links made by the close are kept: they now point at the restored live enrollment, which is where a payment would have gone anyway.
6. A group closed by the year close carries a run with no enrollment rows. Reopening it only clears the mark, because the year close has no per-course undo, as today.
7. Journal action `reopened`; log `reopen_course`. The placement rules for new learners apply again once the course is reopened.

The reopen follows the close's lock order (learners, group row, then the seat lock when it restores members). The concurrency harness tests it against a placement and against a leaver (tests).

**Errors** reuse the browser's `PT409` handling (« rechargez »). `membershipActions.mjs` gains French texts for the new hints.

## D4 — The course guard on `enrollments`, and closed courses everywhere (Q7, Q9, S3, N-1)

**Placement guard.** `academic_security.guard_course_placement()` (`security definer`, no API grant) runs on trigger `enrollment_course_guard before insert or update of group_id, status on public.enrollments`. It acts only when a row **enters** a group: a new grouped row, a new `group_id`, or a grouped row becoming live again (the same notion as the year guard, 125 lines 98–102). For every such row it first share-locks the group row (`for share`, the lock `place` and the year guard already take), then refuses:

- a **closed in-person course** (`closed_at is not null`);
- a **closed online course** (Q9 = A; Batch D follow-up 2, second half). The guard reads `select status from public.online_courses where group_id = new.group_id **for share**` (S3), so it serialises with `online_close_course`, which takes that row `for update`. A placement that holds the share lock first is ended by the online close's passes; one that waits sees `closed`. Either way the error is `23514` `course.closed` (« Ce cours est clôturé. »).
  - **Lock order:** a placement holds its learner, then the group row, then the online course row. The online close holds the course row, then the learners of the course's committed members, never the learner being placed. The concurrency harness tests this pair (tests).
- a **short-programme group without both dates** (Q1 = A), with `23514` `course.dates_required`.

Exemptions: the Batch D two-flag restore (`eh.membership_sync` and `eh.enrollment_command`, as for every Batch D/H guard), and `eh.course_command` for the close's own « A suivi ce cours » attach into its just-marked group (D3 step 9) and for « Rouvrir le cours ».

**The group row before the seat lock, on every path (N-1).** The close holds the group row and may then take the seat lock (D3), so no other path may take the seat lock first and then wait for the group row:

- `place` takes the group row (127 line 1057) before the seat lock (127 line 1096).
- On a direct write, Postgres fires same-event triggers in name order, so `enrollment_course_guard` (this guard) already fires before `enrollment_group_capacity`. Today the capacity trigger takes the seat lock (120 line 413) after a plain read of the group (line 411), **before** the year guard's share lock (125 line 103).
- The plan does not rest the lock order on trigger names (the S5 principle). `academic_security.enforce_group_capacity()` is **re-created** from its 120 body (lines 404–419) with one change: its group read takes `for share`. The seat lock then always follows the group row lock inside the function that takes it.
- No rule, message, exemption or trigger changes. An unchanged-from-120 proof except that clause is required, as for the other re-created bodies.
- `reopen_course` and the year close take learners, then group rows (D3, D5).

**Group guard (D1 trigger).**

- `closed_at` and `closed_by` change only under `eh.course_command`.
- While a group is closed, `date_debut`, `date_fin`, `annee`, `session_type`, `niveau` and `capacite_max` are frozen (« Rouvrez le cours pour le modifier. », hint `course.closed`). Name, teacher, room and schedule stay editable.
- A closed group that has ended enrollments cannot be deleted, because they reference it through `ended_group_id … on delete restrict` (120 line 38). The delete message says so.

**Readers that ignore closed courses** (pickers that start something new):

- database: `crm_enrollment_groups`, re-created from 125 with `and g.closed_at is null` and closed online courses excluded;
- browser pickers: EnrollmentModal, StudentForm, receipt group choices, LegacyPlacementEditor, the group-page placement, the **announcement picker** (communications 209) and the **placement-test picker** (placement-tests 42);
- the attendance, timetable, assessments and teacher-portal group selects;
- the reports' academic operations (groups without a teacher, occupancy);
- the dashboard « Groupes actifs » count.

A finished but **not yet closed** course stays selectable, marked « terminé le … », so a forgotten paid learner can still be placed before the close.

**Readers that keep every group** (name lookups): the learner file (students/[id] 140, « Ancien groupe »), students-directory 63, leave-requests 87 and the cache keys. Their history must keep its names.

## D5 — « Clôturer l'année » learns about course dates (OA1, OA4, OA6, Q16, Q18, N-3)

`public.close_school_year(text, integer, text)` is re-created from its [120 body](../../../supabase/migrations/120_enrollment_group_consistency.sql) (lines 704–736). It keeps the same signature and integer result (the number of enrollments ended), the director-only role, the reason, and the learner locks in id order before the count. The expected count is now the number of rows it will end (the preview's `to_end`).

- **Spares later-ending courses (OA4).** A live enrollment of that year whose group ends **after** `public.business_date()` is neither counted nor ended, and its group is not marked. For an in-person group that means `date_fin` after today; for an online course, `term_end` after today.
- **Leaves waiting the paid enrollments without a group whose course has not ended (OA6, Q18 = A).**
  - **Scope:** Confirmed enrollments without a group, of that year, of a programme whose courses carry dates. These are the Q1 short programmes (Mise à niveau, Adults, Summer Camp, One-to-One) and the two online programmes.
  - **« Its course »** means the courses that match it by the D3 rule: same programme and year, its level or no level, open or closed.
  - **Kept waiting** (neither counted nor ended) when:
    - a matching course has not ended: in person, not closed and its `date_fin` is after today or still empty; online, not closed and its `term_end` is after today;
    - **or no matching course exists yet** (Q18 = A). A Summer Camp group, for instance, is often created after the June close.
  - **Ended** as today when matching courses exist and every one has ended (closed, or its end date is today or earlier).
  - Kept rows stay on « Inscrits — groupe à affecter » (OA5). The close of their course (B1) or « Ancien apprenant » reaches them later. A later year close never touches them, because it only ends its own year.
- **Every other live enrollment of the year ends as today:** Yearly, Communication and the other rows without a group, and the members of every group that does not end later.
- **Marks groups closed (OA1, Q16 = A), never a group with a live learner (N-3).** After ending:
  1. **Lock the candidate group rows** with `for update`, in id order: the in-person groups of that school year (`school_year_of(annee)` = the year) that are not closed and do not end later. The learners were locked first (as in 120), so the order is learners, then group rows, the order of every placement path (D4). While these locks are held, no placement can enter the groups: it waits for the group row and is refused `course.closed` if the group gets marked.
  2. **Then, in a separate statement,** mark closed (under `eh.course_command`) only the locked groups that have **no live enrollment**. Under READ COMMITTED a new statement takes a new snapshot, so it sees every placement that committed while the year close waited for those row locks. A single `update … where not exists (…)` would instead check the enrollments against the snapshot taken before it waited, and could mark a group whose placement committed during the wait.
  3. A locked group that still has a live learner (a placement that committed during the close) is **left unmarked**. The log entry reports it as `groups_left_open`, and the director closes it later with « Clôturer le cours ». Raising `PT409` instead was rejected: the year's enrollments were already ended correctly, and one late placement would force the director to repeat the whole close.
  - Under Q16 = A the marked groups are its Yearly groups and the other in-person groups of that year left without learners; under Q16 = B, its Yearly groups only. Each marked group gets a run row (`source = 'close_school_year'`, no enrollment rows), so « Rouvrir le cours » only clears its mark.
  - The year close takes no seat lock.
- **Log.** The `close_school_year` log entry gains `kept_in_later_courses`, `kept_waiting`, `groups_marked` and `groups_left_open`.
- **Preview.** `public.close_school_year_preview(p_school_year text) returns jsonb` (director) returns `{to_end, kept_in_later_courses, kept_waiting_unplaced, groups_to_mark}`; `kept_waiting_unplaced` is given per programme. The dialog uses this preview instead of its browser count ([students/page.jsx 81–86](../../../src/app/(admin)/students/page.jsx)) and shows the four numbers, including « N inscriptions payées sans groupe restent en attente de leur cours ».

## D6 — Group visibility for parents and students (OA3)

- **Drop** « groups read all auth » ([123 line 1463](../../../supabase/migrations/123_portal_readiness.sql), as rewritten by [124 line 386](../../../supabase/migrations/124_speed_as_the_centre_grows.sql)).
- **Create « groups read staff »:** `for select to authenticated using ((select auth.uid()) is not null and coalesce((select get_my_role()), 'pending') not in ('pending', 'parent', 'student'))`. This is exactly today's rule for every staff role.
- **Create « groups read family »:** `for select to authenticated using ((select get_my_role()) in ('parent', 'student') and id in (select portal_security.family_group_ids()))`.
  - The new helper `portal_security.family_group_ids()` is `stable`, `security definer`, has a fixed `search_path` and is granted to `authenticated` only.
  - It returns the groups of every enrollment of the caller's visible learners (`get_visible_student_ids()`, [123 line 210](../../../supabase/migrations/123_portal_readiness.sql)): `group_id` for live ones and `ended_group_id` for ended ones, plus their `students.groupe_id`. Past groups therefore keep their names in history.
  - It runs once per statement, following ADR-013.
- **Unaffected:** the definer portal projections (for example `online_list_lessons_for_me`/`_for_my_children`, [117 lines 1585–1595](../../../supabase/migrations/117_online_learning_pilot.sql)) and the admin screens. No parent or student page reads `groups` directly.
- **Existing names:** R0 line B6 counts group names that contain a learner's full name, as counts only. At R5 the director reviews the group list in the application and renames any such group. The form proposes neutral names and the guide states the rule.

## D7 — The dashboard cards (OA5, Q5, Q17)

- **« Cours terminés à clôturer »** (director):
  - The count is the in-person rows of `list_courses_to_close()` with `live_count > 0`, plus its online rows.
  - It links to `/groups?vue=a-cloturer`.
  - **The dashboard calls the function only when the role is director (nit).** Admin's dashboard never calls it and shows no card.
- **« Groupes actifs »:** groups not closed (in person `closed_at is null`; online, not closed).
- **« Inscrits — groupe à affecter » (OA5).** It counts Confirmed enrollments without a group whose programme uses groups: under Q17 = A, every programme except `Other`. On 2026-11-05 none of the 38 rows is `Other`, so the rule changes nothing that day; it keeps future `Other` rows off the card.
  - **What the card will show after the one-time step** (2026-11-05 figures; R0 lines A3–A4 give the exact figures of the release day):

    | Programmes ended by the step | Card shows | Made up of |
    | --- | --- | --- |
    | Mise à niveau only (S1) | **20** | Adults 10, Yearly 7, One-to-One 2, Online One-to-One 1 |
    | Mise à niveau + Adults (S2) | **10** | Yearly 7, One-to-One 2, Online One-to-One 1 |
    | Mise à niveau + both One-to-One programmes (S3) | **17** | Adults 10, Yearly 7 |
    | All four (S4) | **7** | Yearly |

  - Each later close with « Terminer sans groupe » or « A suivi ce cours » lowers it further.
  - The « Groupe à affecter » list behind the card (`search_students_page` `unassigned`, [124 lines 1072–1078](../../../supabase/migrations/124_speed_as_the_centre_grows.sql)) is not re-created. It can differ from the card only by `Other` rows.

## D8 — Screens

- **Groups list:**
  - date columns « Du … au … »;
  - filters « En cours » (default: not closed), « À clôturer » (the D2 list, director) and « Clôturés »;
  - each « À clôturer » row offers « Clôturer le cours » for in-person courses and « Ouvrir le cours en ligne » for online ones;
  - in « En cours », a group without live learners offers « Clôturer » (director, OA2).
- **Close dialog:**
  - the course name and dates;
  - « N apprenants : X deviennent Ancien apprenant, Y restent Inscrits (autre inscription en cours) » and « Z ont un solde à payer : il reste dû »;
  - **« Inscriptions payées sans groupe pour ce cours »** (B1): one line per matching enrollment with the learner's name, level and amount paid. Each needs an explicit choice before the close button is enabled (Q14 = A): « A suivi ce cours », « Terminer sans groupe » or « Laisser en attente ». A note under « A suivi ce cours » says « Ajoute le cours à son historique ; aucune présence n'est créée. »;
  - the charges (N-2): « W soldes partiellement payés seront rattachés à l'inscription terminée » and « E engagements sans paiement (total …) restent ouverts : un paiement ultérieur créera une nouvelle inscription »;
  - the reminder « Vérifiez que les présences sont saisies : après la clôture, la liste d'appel du cours n'est plus proposée. »;
  - the reason, prefilled « Cours terminé », and « Clôturer le cours ».

  Success shows a toast with the numbers. On `PT409` the dialog reloads its preview.
- **Group page:**
  - « Clôturer le cours » (director) once finished, or at any time when empty;
  - when closed: a banner « Cours clôturé le … », « Rouvrir le cours » (director), no placement or removal, and a read-only « Anciens apprenants du cours » list (enrollments with `ended_group_id` = the group; staff only, existing RLS).
- **Year-close dialog:** the D5 preview numbers. The line about the paid learners left waiting for their course (OA6) links to « Groupe à affecter ».
- **Group form:** the two dates with the D1 messages; One-to-One capacity 1 and the neutral name proposal.
- **Guide** (the reception guide; citations in the application inventory):
  - `#q8`: the two dates, their messages, and the naming rule that a group name never contains a learner's name; `#q14` (line 1262): course dates at the rentrée; reception's Groups screen (line 1472): dates and the « Clôturés » filter;
  - `#q9`: « Ce cours est clôturé » and « Renseignez les dates du cours » when placing;
  - the « Terminée » paragraph (line 1594) and the status note (line 1625): « la clôture d'un cours terminé » joins the year close and the online close;
  - the `#direction` table, « Académique » row (line 1880): « Clôturer un cours terminé ou le rouvrir » and « Clôturer l'année scolaire », so reception knows to ask the director. The director's dialog itself is not described in the reception guide;
  - a screenshot of the group form with synthetic data.

## D9 — Online courses (Q9)

The online close is unchanged. Dates stay on the course, and « Clôturer » stays on its page, because it also revokes join passes and closes the provider room, which the in-person command must not do.

Added:

- online courses appear in « Cours terminés à clôturer » once past `term_end`;
- the D4 guard refuses placement into a closed online course (share lock, S3);
- the year close spares an online course whose `term_end` is after the close date, and leaves waiting a paid online enrollment without a group whose course has not ended (D5, OA6).

Past online rosters (Batch D follow-up 2, first half) stay a follow-up.

## D10 — The one-time data step (Q11–Q13, S6, S9, N-2)

**R0 count query.** It is read-only, returns counts only and holds no personal data. It runs through the guarded transport, which runs the file as one implicit transaction and returns only the last statement's rows, so the file is `set transaction read only;` plus exactly one query ([WORKFLOWS convention](../../ai/WORKFLOWS.md#guarded-release-wrapper)).

Every per-programme and per-scenario line returns an explicit zero row (nit). Lines T2–T4 are computed for each possible approved programme set (S9):

- **S1:** Mise à niveau;
- **S2:** + Adults;
- **S3:** + both One-to-One programmes;
- **S4:** all four.

The query was run on a local 127 stack, empty and with synthetic rows in a rolled-back transaction, including an archived learner and one charge for each T7b line. It has not run on Production.

```sql
set transaction read only;
with live as (
  select e.id, e.student_id, e.status, e.group_id, e.session_type, e.school_year, e.level, e.notes, e.date_inscription
  from public.enrollments e
  where e.status in ('Submitted', 'Under Review', 'Confirmed', 'Validated', 'Trial')
), types(st) as (values ('Yearly'), ('Adults'), ('Summer Camp'), ('Communication Junior'), ('Communication Adult'),
  ('One-to-One'), ('Mise à niveau'), ('Other'), ('Online'), ('Online One-to-One'))
, progs(p) as (values ('Mise à niveau'), ('Adults'), ('One-to-One'), ('Online One-to-One'))
, scen(s, ps) as (values
  ('S1 Mise à niveau', array['Mise à niveau']),
  ('S2 Mise à niveau + Adults', array['Mise à niveau', 'Adults']),
  ('S3 Mise à niveau + One-to-One + Online One-to-One', array['Mise à niveau', 'One-to-One', 'Online One-to-One']),
  ('S4 all four programmes', array['Mise à niveau', 'Adults', 'One-to-One', 'Online One-to-One']))
, u as (select x.* from live x where x.status = 'Confirmed' and x.group_id is null)
, ua as (select x.* from u x where exists (select 1 from public.students s where s.id = x.student_id and s.deleted_at is null))
, t as (select x.* from u x where x.session_type in (select p from progs))
, g as (
  select gr.id, gr.name, gr.session_type, gr.niveau, gr.capacite_max, gr.annee,
    replace(btrim(gr.annee), '-', '/') as yr,
    (select count(*) from live x where x.group_id = gr.id) as live_n,
    gr.session_type not in ('Online', 'Online One-to-One')
      or exists (select 1 from public.online_courses c where c.group_id = gr.id and c.status <> 'closed') as open_course
  from public.groups gr
)
, st as (select sc.s, x.id, x.student_id, x.session_type from scen sc join t x on x.session_type = any(sc.ps))
, sl as (
  select d.s, exists (select 1 from live y where y.student_id = d.student_id
    and y.id not in (select z.id from st z where z.s = d.s)) as keeps
  from (select distinct s, student_id from st) d
)
select 'A1 live enrollments · ' || coalesce(session_type, '(none)') || ' · ' || coalesce(school_year, '(none)')
    || ' · ' || status || case when group_id is null then ' · sans groupe' else ' · en groupe' end as category,
  count(*) as n
  from live group by session_type, school_year, status, (group_id is null)
union all select 'A2 card today « Inscrits — groupe à affecter » (Confirmed, no group)', count(*) from u
union all select 'A3 card under OA5 (programmes that use groups: every programme but Other)', count(*) from u
  where session_type <> 'Other'
union all select 'A4 card under OA5 after the one-time step · ' || sc.s,
  (select count(*) from u where session_type <> 'Other') - (select count(*) from st where st.s = sc.s) from scen sc
union all select 'B1 groups · ' || ty.st, count(g.id) from types ty left join g on g.session_type = ty.st group by ty.st
union all select 'B2 groups with live learners · ' || ty.st, count(g.id) filter (where g.live_n > 0)
  from types ty left join g on g.session_type = ty.st group by ty.st
union all select 'B3 live learners in groups · ' || ty.st, coalesce(sum(g.live_n), 0)::bigint
  from types ty left join g on g.session_type = ty.st group by ty.st
union all select 'B4 groups whose year is not a valid school year (expected 0)', count(*) from g
  where coalesce(btrim(annee) ~ '^[0-9]{4}[-/][0-9]{4}$' and right(btrim(annee), 4)::integer = left(btrim(annee), 4)::integer + 1, false) is not true
union all select 'B5 One-to-One groups with a capacity other than 1', count(*) from g
  where session_type = 'One-to-One' and capacite_max is distinct from 1
union all select 'B6 groups whose name contains a learner''s full name (OA3 review)', count(*) from g
  where exists (select 1 from public.students s where length(btrim(s.full_name)) >= 5
    and position(lower(btrim(s.full_name)) in lower(g.name)) > 0)
union all select 'C1 online courses · ' || status, count(*) from public.online_courses group by status
union all select 'C2 online courses past their term end and not closed', count(*) from public.online_courses c
  where c.term_end < public.business_date() and c.status <> 'closed'
union all select 'C3 live enrollments in the C2 courses', count(*) from live x
  where x.group_id in (select c.group_id from public.online_courses c where c.term_end < public.business_date() and c.status <> 'closed')
union all select 'U1 paid without group, learner file not archived · ' || session_type || ' · ' || coalesce(school_year, '(none)') || ' · ' || coalesce(level, '(no level)'),
  count(*) from ua group by session_type, school_year, level
union all select 'U2 of U1: matches a group of the same programme, year and level (online: course not closed) · ' || ty.st, count(x.id)
  from types ty left join ua x on x.session_type = ty.st and exists (select 1 from g where g.open_course
    and g.session_type = x.session_type and g.yr = x.school_year and (x.level is null or x.level = g.niveau))
  group by ty.st
union all select 'U3 groups with at least one matching paid enrollment without group · ' || ty.st, count(g.id)
  from types ty left join g on g.session_type = ty.st and g.open_course and exists (select 1 from ua x
    where x.session_type = g.session_type and x.school_year = g.yr and (x.level is null or x.level = g.niveau))
  group by ty.st
union all select 'T1 one-time step candidates · ' || pr.p || ' · ' || coalesce(x.school_year, '—'), count(x.id)
  from progs pr left join t x on x.session_type = pr.p group by pr.p, x.school_year
union all select 'T2 ' || sc.s || ' · enrollments ended · ' || pr.p, count(x.id)
  from scen sc join progs pr on pr.p = any(sc.ps) left join st x on x.s = sc.s and x.session_type = pr.p
  group by sc.s, pr.p
union all select 'T3 ' || sc.s || ' · learner files that stay Inscrit', count(l.s) filter (where l.keeps)
  from scen sc left join sl l on l.s = sc.s group by sc.s
union all select 'T4 ' || sc.s || ' · learner files that become Ancien apprenant', count(l.s) filter (where not l.keeps)
  from scen sc left join sl l on l.s = sc.s group by sc.s
union all select 'T5 candidates whose learner file is archived (expected 0) · ' || pr.p, count(x.id)
  from progs pr left join t x on x.session_type = pr.p
    and exists (select 1 from public.students s where s.id = x.student_id and s.deleted_at is not null) group by pr.p
union all select 'T6 candidates whose learner file is not Enrolled (expected 0) · ' || pr.p, count(x.id)
  from progs pr left join t x on x.session_type = pr.p
    and exists (select 1 from public.students s where s.id = x.student_id and s.status is distinct from 'Enrolled') group by pr.p
union all select 'T7a candidates with an open balance on a charge linked to the enrollment · ' || pr.p, count(x.id)
  from progs pr left join t x on x.session_type = pr.p
    and exists (select 1 from public.charge_balances b where b.enrollment_id = x.id and b.voided_at is null and b.balance > 0)
  group by pr.p
union all select 'T7b1 candidates with a partly paid open unlinked tuition charge of the same programme and year (linked by the step) · ' || pr.p, count(x.id)
  from progs pr left join t x on x.session_type = pr.p
    and exists (select 1 from public.charge_balances b where b.student_id = x.student_id and b.enrollment_id is null
      and b.voided_at is null and not b.legacy and b.session_type = x.session_type
      and b.balance > 0 and b.paid_amount > 0 and b.school_year = x.school_year)
  group by pr.p
union all select 'T7b2 candidates with an engagement: open unlinked tuition charge of the same programme, that year or no year, nothing paid (never linked) · ' || pr.p, count(x.id)
  from progs pr left join t x on x.session_type = pr.p
    and exists (select 1 from public.charge_balances b where b.student_id = x.student_id and b.enrollment_id is null
      and b.voided_at is null and not b.legacy and b.session_type = x.session_type
      and b.balance > 0 and b.paid_amount = 0 and (b.school_year = x.school_year or b.school_year is null))
  group by pr.p
union all select 'T7b3a candidates with a partly paid open unlinked tuition charge without a year, created during the candidate''s school year, the current one (linked by the step) · ' || pr.p, count(x.id)
  from progs pr left join t x on x.session_type = pr.p
    and exists (select 1 from public.charge_balances b where b.student_id = x.student_id and b.enrollment_id is null
      and b.voided_at is null and not b.legacy and b.session_type = x.session_type
      and b.balance > 0 and b.paid_amount > 0 and b.school_year is null
      and x.school_year = public.centre_school_year()
      and public.centre_school_year(public.business_date(b.created_at)) = x.school_year)
  group by pr.p
union all select 'T7b3b candidates with a partly paid open unlinked tuition charge without a year from an earlier school year (pre-057, never linked) · ' || pr.p, count(x.id)
  from progs pr left join t x on x.session_type = pr.p
    and exists (select 1 from public.charge_balances b where b.student_id = x.student_id and b.enrollment_id is null
      and b.voided_at is null and not b.legacy and b.session_type = x.session_type
      and b.balance > 0 and b.paid_amount > 0 and b.school_year is null
      and not (x.school_year = public.centre_school_year()
        and public.centre_school_year(public.business_date(b.created_at)) = x.school_year))
  group by pr.p
union all select 'T8 candidates with no live receipt on the enrollment or its charges · ' || pr.p, count(x.id)
  from progs pr left join t x on x.session_type = pr.p
    and not exists (select 1 from public.receipts r where r.voided_at is null and r.deleted_at is null
      and (r.enrollment_id = x.id or r.charge_id in (select c.id from public.charges c where c.enrollment_id = x.id)))
  group by pr.p
union all select 'T9 candidates linked to a CRM lead (conversion kept, no review flag) · ' || pr.p, count(x.id)
  from progs pr left join t x on x.session_type = pr.p
    and exists (select 1 from public.crm_leads l where l.enrollment_id = x.id and l.merged_into_lead_id is null)
  group by pr.p
union all select 'T10 candidates created by the Batch D clean-up (notes « Rattrapage EGC … ») · ' || pr.p, count(x.id)
  from progs pr left join t x on x.session_type = pr.p and x.notes like 'Rattrapage EGC%' group by pr.p
union all select 'T11 candidates by enrollment month · ' || x.session_type || ' · ' || coalesce(to_char(x.date_inscription, 'YYYY-MM'), '(none)'),
  count(*) from t x group by x.session_type, to_char(x.date_inscription, 'YYYY-MM')
union all select 'T12 Yearly paid without group (never in the step)', count(*) from u where session_type = 'Yearly'
union all select 'J1 Ended enrollments total', count(*) from public.enrollments where status = 'Ended'
union all select 'J2 learner files Alumni', count(*) from public.students where status = 'Alumni' and deleted_at is null;
```

**Expectations:**

- **Card:** A2 = 38 and A3 = 38 (no `Other` row).
- **Candidates:** T1 = 18 / 10 / 2 / 1 for Mise à niveau / Adults / One-to-One / Online One-to-One, all 2026/2027. These are the owner's 2026-11-05 figures; any difference goes back to the owner before approval.
- **Card after the step:** A4 = 20 / 10 / 17 / 7 for S1–S4 (D7).
- **Zero checks:** T5 = T6 = 0 and B4 = 0.
- **Yearly:** T12 = 7.
- **Scenario lines:**
  - For each scenario, T2 summed over its programmes equals the targets.
  - T3 + T4 is the number of distinct learners among the targets.
  - T3 counts files that stay « Inscrit » because of a live enrollment outside the scenario's targets.
  - T4 counts files that become « Ancien apprenant ».
  - The approved scenario's T2, T3 and T4 become the step's declared counts.
- **Balances (N-2):**
  - T7a: balances that stay owed on linked charges.
  - T7b1: partly paid open unlinked charges of the same programme and year, which the step links to the ended enrollment (S6).
  - T7b2: « engagements » with nothing paid, never linked. A later payment on one creates a new enrollment.
  - T7b3a: partly paid charges without a year created during the candidate's school year, the current one, which the step links.
  - T7b3b: partly paid charges without a year from an earlier school year (pre-057), never linked.
  - Every balance stays owed.
- **Receipts and CRM:**
  - T8: rows listed today in the director's « Inscriptions confirmées sans aucun paiement »; they leave that list once ended.
  - T9: conversions that stay valid with no review flag (D5-A).
  - T11: helps the owner judge whether a whole programme is finished (Q12).
- **Unplaced enrollments (B1):** the U-lines exclude archived learner files, like the matching rule.
  - U1: the paid enrollments without a group by programme, year and level.
  - U2: those a course close could reach.
  - U3: the groups whose close dialog will list unplaced learners.
- **Groups and online courses:**
  - B2/B3: the short-programme groups that will need dates before their next placement (Q1).
  - B5: One-to-One groups to correct.
  - B6: group names to review (OA3).
  - C2/C3: the online courses that would appear on the card.

**Data step** (`supabase/manual/course_close_backlog.sql`). It runs only on the owner's explicit approval of the day's counts, after migration 128 (Q11 = A), through the guarded wrapper, as the migration role, in one transaction. It is a dry run by default.

1. **Parameters** (transaction-local):
   - the approved programme set (one of S1–S4, Q12) and the school year `2026/2027`;
   - one reason per programme: « Mise à niveau terminée », « Session Adults terminée », « Cours individuel terminé »;
   - **the declared counts of that scenario (S9):** T2 per approved programme, T3 and T4.

   Any difference raises and changes nothing.
2. **Targets:** Confirmed, `group_id is null`, an approved programme, that year. The step refuses (`PT409`, nothing changed) when:
   - a targeted learner is mid-enrollment or mid-payment (the intent locks of the payment path);
   - a target is no longer Confirmed without a group.
3. **Journal first** in `maintenance.course_close_journal` (`source = 'backlog_step'`, one `run_id`, a run row): enrollment before-images, learner-file before-images and the charge links of step 4.
4. **Charges (S6, N-2):** the D3 charge link rule links each qualifying charge of a target's learner, programme and year to that target: partly paid charges of that year (T7b1) and undated ones created during that year (T7b3a). « Engagements » with nothing paid (T7b2) and undated charges of earlier years (T7b3b) are never linked.
5. **End (S9):** **one `academic_security.leave(student, 'Alumni', <that programme's reason>, <that learner's targets of that programme>)` per learner and programme.**
   - Programmes run in the fixed order Mise à niveau, Adults, One-to-One, Online One-to-One; learners in id order.
   - Each ended row keeps its own programme's reason.
   - The learner file's final status follows the learner's last call: « Inscrit » if anything outside the targets is still live, otherwise « Ancien apprenant ».
6. **Post-conditions** (any failure rolls everything back):
   - every target is `Ended` with its programme's reason;
   - A2 is lowered by exactly the targets, and the OA5 card equals the scenario's A4;
   - T3 files are unchanged (Enrolled) and T4 files are Alumni;
   - charge amounts, receipts, attendance, CRM leads and activities are unchanged (row counts and a balance checksum taken before and after inside the transaction);
   - the lifecycle outbox is unchanged;
   - a second run finds no target (declared counts 0).
7. **Revert** (`supabase/manual/course_close_backlog_revert.sql`; prepared, never run without its own approval):
   - It restores the journalled enrollment before-images (Confirmed, no group, ended fields cleared) under the Batch D two-flag exemption, re-syncs each learner file and journals `reverted` rows referencing the originals.
   - It restores a row only if the row is still `Ended` with this run's `ended_at` and reason **and** its learner has no live enrollment of that programme and year.
   - **If any journalled row fails that test** (reopened, re-enrolled or re-ended since), the revert refuses and changes nothing. Only an operator-declared skip count allows a partial revert, and the skipped rows are listed (S9).
   - Charge links made by the step are kept, because they point at the restored enrollment.

Rows ended by the step are ordinary ended enrollments: « Rouvrir l'inscription » works on them (Q13 = A).

## D11 — Docs at implementation and closeout

- PRODUCT_RULES: people and academics — course dates, the close and its unplaced learners, closed courses, the year close, One-to-One, group visibility.
- WORKFLOWS: the placement section — dates, « Clôturer le cours », « Rouvrir le cours », the year close preview.
- SECURITY_RULES: the director commands; the protected closed mark; the family-scoped group read; the naming rule.
- ARCHITECTURE: the core-workflows line on closes.
- FEATURE_INDEX: the groups row.
- The [enrollment workflow README](../../../scripts/README-enrollment-workflow.md), the guide, the ADR-016 status, the plans README and OWNER_DECISIONS.
- CURRENT_STATE: only at closeout, with dated evidence.

# Security boundaries

- **New public functions:** `list_courses_to_close`, `close_course_preview`, `close_course`, `reopen_course`, `close_school_year_preview`. Re-created: `close_school_year`. The re-created trigger function `academic_security.enforce_group_capacity()` keeps its 120 posture (no API grant).
  - All are `security definer` with `search_path = pg_catalog, pg_temp` and execute for `authenticated` only (revoked from `public`, `anon`, `service_role`). The director role is checked inside from the stored role.
  - Tests prove refusal for admin (if Q5 = A), reception, teacher, parent, student, `anon` and `service_role`.
- **Family helper:** `portal_security.family_group_ids()` is a definer, `stable`, fixed `search_path`, and returns only group ids visible to the caller.
- **Guards and the journal:** no API grant. The journal has RLS enabled and every privilege revoked (the Batch D/EAP posture). It holds ids, statuses, groups, years and charge ids only.
- **The closed mark** cannot be set or cleared by a direct table write of any role, including the management policy and `service_role` (trigger; the flag is set only inside the commands).
- **RLS change:** « groups read all auth » is replaced by « groups read staff » (unchanged for staff) and « groups read family » (parents and students: their learners' groups only). Tests cover every role, `pending` and `anon`, and a parent and a student in the browser.
- **Reception** keeps `assign_group` and its group RPC. It gains only the two date keys.
- **The one-time step** runs as the migration role through the guarded transport, journals before it writes, and is counted twice: at R0 and in the declared counts.

# Migration, test, rollout and recovery strategy

## Sequence (migration first, application within minutes, outside reception hours)

| Step | Gate | Action |
| --- | --- | --- |
| R0 | Owner authorizes the read-only count | Run the D10 query through the guarded transport and record the counts. Check ledger 001–127 and the catalog digests against a clean local 127 build. Export the functions 128 replaces (`save_receptionist_group`, `crm_enrollment_groups`, `guard_group_year`, `close_school_year`, `enforce_group_capacity`) and the 124 text of the dropped policy to the owner's private folder, with `SHA256SUMS`. |
| R0b | Owner reads the counts | Approves the release with the exact numbers, the approved scenario (Q12) and its declared counts. |
| R1 | Release approval; window outside reception hours | Apply migration 128 through the guarded wrapper (dry run `DRYRUN_OK`, then apply). Read-only checks: the four columns, the triggers, the journal posture, the functions and their ACLs, the re-created bodies, the two policies; the catalog diff is exactly the manifest. |
| R2 | Same approval, right after R1 | Data step (D10) for the approved scenario: dry run, then run with the declared counts; read-only post-conditions. A raise changes nothing, and the release reports before deploying. |
| R3 | Same approval, immediately after R2 | Merge the reviewed head; Vercel Production READY on that commit; anonymous probes (`/groups` and `/dashboard` redirect to `/login`). |
| R4 | Same approval | Rolled-back probes as director, admin and reception: `close_course` on an open, unfinished group with learners refused `course.not_finished`; reception and admin refused `42501`; `list_courses_to_close` and `close_school_year_preview` return without error. No successful close and no year close in Production by the release task. Postgres and API logs for 30 minutes. |
| R5 | Owner / director | Enter the dates of the short-programme groups listed at R0 (B2). Review the group names (B6) and rename any that contain a learner's name. Check the parent and student portals. Make the first real « Clôturer le cours » on a finished course. Check the card and the Groups filters. Recorded as owner evidence. |
| R6 | Closeout | Docs per D11; CURRENT_STATE with dated evidence; the plan moves to completed. |

## Release and rollback order with the old application (S8)

In two situations the database runs 128 while the browser runs the **previous** build: the minutes between R1 and R3, and an application-only rollback. In that state:

- **Group creation:** the old form cannot create a Mise à niveau, Adults, Summer Camp or One-to-One group. It has no date fields, so the database refuses with `course.dates_required`. One-to-One creation is also refused for a capacity other than 1, since the old form defaults to 12. Editing other fields of an existing group works.
- **Placement** into an undated short-programme group is refused. That is the intended rule.
- **Old year-close dialog:** its browser count includes enrollments in courses that end later and the paid rows without a group now left waiting (OA6). When either exists, the command answers `PT409` « rechargez » and nothing changes.
- **Closed courses** still appear in the old pickers, but placement into them is refused by the guard.
- **Parent and student screens:** unaffected (no direct `groups` read).

Hence:

- R3 follows R1/R2 immediately, outside reception hours.
- If R3 fails, or if the application must be rolled back for longer than that window, run the **database restore**. It needs its own approval, and it lets the old build work fully again.

The restore is `scripts/rollback/128_course_dates_close_restore.sql`. It:

- drops the new functions, the family helper, the two new triggers and the two new policies;
- re-creates « groups read all auth » with its 124 text;
- restores the 125 bodies of `guard_group_year` (and its 125 trigger), `save_receptionist_group` and `crm_enrollment_groups`, and the 120 bodies of `close_school_year` and `enforce_group_capacity`;
- keeps the columns, the journal and the marks, which become inert. Dropping them is a separate decision.

While the restore is in effect, closed courses are no longer protected and parents and students again read every group row.

## Local test strategy (synthetic data only)

**Database, CI-run:** a new `scripts/test-course-dates-close.sql`, wired into `verify.yml` like lines 383/391. It covers:

- **Dates:**
  - the window;
  - date order;
  - required programmes on create and on programme change;
  - never cleared;
  - Yearly optional;
  - **refused on online groups**;
  - **a create without a year receives the default year and is then window-checked (S5)**, both accepted and refused cases;
  - a year change re-checks the dates;
  - date edits logged;
  - One-to-One capacity 1.
- **`save_receptionist_group`** with dates (create, replay identity, update), plus an unchanged-from-125 proof for the rest.
- **`close_course` as director:**
  - ended count;
  - Alumni versus stays Enrolled;
  - main group recomputed;
  - open-balance counts;
  - journal rows, including the run row;
  - activity log;
  - charges, receipts, attendance and CRM untouched except the journalled charge links;
  - conversion kept without a review flag.
- **B1:** `p_attach` places the row and ends it with the course (`ended_group_id` set); `p_end_unplaced` ends it without a group; a listed id that changed raises `PT409` `course.unplaced_changed`; an id in both lists is refused; a non-matching programme, year or level is refused.
- **N-1 order:** the group is marked before any attach; « A suivi ce cours » enters the closed group only under the close's `eh.course_command`, and the same attach outside the command is refused `course.closed`.
- **S1:** a placement that commits between the learner locks and the mark makes the count of step 7 raise `PT409` and change nothing, the mark included (driven by the concurrency harness).
- **`enforce_group_capacity`:** an unchanged-from-120 proof except the `for share` clause; the existing capacity tests pass unchanged.
- **Replay:** after success, and on an **empty group**, it returns `replayed: true` and writes nothing.
- **Refusals:** stale count; not finished; online group; every other role refused.
- **Empty group:** closable without dates.
- **Placement into a closed course is refused on every path:** `place_learner_in_group`, `assign_receptionist_student_group`, the learner-form path, the receipt-form placement, and a direct management insert. Also into a closed online course.
- **Exemptions:** the two-flag restore and `eh.course_command`.
- **Closed mark:** direct writes of `closed_at` refused for admin, director and `service_role`; the frozen fields of a closed group.
- **`reopen_course`:** restores exactly the journalled rows (members to the group; attached and ended-unplaced rows to Confirmed without group), skips a row reopened or re-enrolled meanwhile, logs the capacity override, and only clears the mark of a year-closed group.
- **S6 and N-2:**
  - After a close, a payment on a **partly paid** charge that was open and unlinked lands on the ended enrollment: no new Confirmed enrollment, and the learner file and the card are unchanged.
  - An **« engagement »** with nothing paid is not linked; a later payment on it creates a new Confirmed enrollment (a next session).
  - An undated charge created during the current school year is linked; one created in an earlier school year (pre-057) is not.
  - A payment on a **new** charge created after the close still creates a new enrollment (a genuine re-enrollment).
  - The preview's `charges_to_link` and `engagements` match what the command links and leaves.
- **Attendance and payments after the close:** attendance before the end date is still insertable for an ended learner; a payment on the ended enrollment's own charge is accepted without reviving it.
- **Year close (D5):**
  - spares an in-person course with a later `date_fin` and an online course with a later `term_end`;
  - **OA6:** leaves waiting a paid Summer Camp row without a group whose matching course ends later, and one with no matching course yet (Q18 = A); ends a paid Mise à niveau row without a group whose only matching course has ended; ends a paid Yearly row without a group as today;
  - marks the Yearly groups (and, under Q16 = A, the other emptied groups) closed with run rows, and logs `groups_marked` and `groups_left_open`;
  - its count excludes the spared and the kept-waiting rows;
  - the preview matches the command.
- **Policies:** parent and student read only their learners' groups, including past ones through `ended_group_id`; teacher, reception, admin and director read every group; `pending` and `anon` read none.
- **Lists:** `list_courses_to_close` (Yearly only with `date_fin`; empty groups flagged) and the D10 R0 query on the fixture, which must return the expected counts with explicit zeros.

**Stateful upgrade rehearsal 127 → 128** (CI-run, the existing pattern, wired like line 353):

- Seed at 127:
  - short groups without dates, with Validated learners in them;
  - a learner in a Yearly and a Mise à niveau group;
  - the backlog shape: Confirmed-without-group rows of the four programmes;
    - one whose learner has another live enrollment;
    - one learner with targets in two programmes;
    - one with an open linked balance, one with a partly paid unlinked charge, one with an « engagement » (nothing paid) and one with an undated charge of an earlier school year;
    - one linked to a converted lead;
  - a summer course of the current year;
  - a group named after a synthetic learner.
- Run `supabase migration up --local` and assert the catalog manifest.
- Run the data step for S1 and S4 in turn:
  - dry;
  - with a wrong count (raises; nothing changed);
  - then with the right counts.
- Check the post-conditions.
- Revert; then a revert after one row was reopened (refused without a declared skip); compare with the journal; rerun (no-op).
- Existing upgrade-to-current scripts move their ceiling to 128.

**Concurrency** (CI, the Python harnesses, wired like line 424), with two sessions each:

- **N-1, the reviewer's reproduction:** a close with « A suivi ce cours » against a placement into the same group, through `place_learner_in_group` and through a direct management insert, in both orders. Either the placement commits first and the close raises `PT409` at its count (S1), or the placement waits for the group row and is then refused `course.closed`. Never a live enrollment in a closed group; no `40P01`;
- the same against a close without attach;
- `reopen_course` against a placement and against a leaver on one of its learners: no `40P01` (S2);
- `online_close_course` against a placement into that online course: no `40P01`, and never a live enrollment in a closed course (S3);
- two closes of one group: one ends, the other replays;
- **N-3:** the year close against a placement into a group of that year, through `place_learner_in_group` and through a direct insert. Either the placement commits first and that group stays unmarked (`groups_left_open` = 1), or it waits and is refused `course.closed`. Never a live learner in a closed group; no `40P01`;
- the year close against a course close in the same year: no `40P01`.

CDC-r2 asserted that the close could never deadlock; the reviewer's reproduction showed otherwise. Deadlock-freedom is now a claim about one lock order (learners, group row, seat lock; D3, D4), and these harness cases are its evidence.

**Fixtures:** the scripts listed under « Tests that touch the changed areas » gain dates (and One-to-One capacity 1) on their short-programme groups. This is a test-only change with no assertion changes, with one exception for the year close:

- The fixtures that call `close_school_year` (`test-enrollment-group-consistency.sql` 751–759, `test-egc-upgrade.mjs`, `test-audit-follow-ups-ui.mjs`; re-grepped at implementation) give their dated groups **end dates in the past**: before the run's `business_date()` and inside their year's window. The re-created year close then still ends their learners, as these tests expect.
- A paid short-programme row without a group in those fixtures needs a matching course that has ended. Otherwise OA6 keeps it waiting, and the test takes its expected count from the preview.

**Node (`npm test`):** helpers and error texts (`membershipActions`), pickers excluding closed courses (including communications and placement tests), name lookups keeping them, the dashboard counts and the director-only call, the cache invalidation rules for the new commands, and the guide content test.

**Browser (local):**

- the director closes a finished course from the card and from the group page, with one unplaced paid learner attached and one ended;
- the director closes an empty group;
- reception sees no close button;
- the closed group's page; reopening;
- the year-close dialog with a running summer course and a paid Summer Camp learner without a group left waiting;
- the group form dates and One-to-One capacity;
- the parent and student portals still load their pages.

`npm run lint` and `npm run build`.

## Recovery

Order: **application first, then database**, with the constraints of the release and rollback order section.

1. **Application:** redeploy the previous build. Its limits against 128 are listed in that section.
2. **Database** (only if needed; separate approval): `scripts/rollback/128_course_dates_close_restore.sql`, as described there.
3. **Data:**
   - a director's close is undone with « Rouvrir le cours »;
   - the one-time step with its revert script (its own approval);
   - a year close's group marks with « Rouvrir le cours » per group.

Local failures are diagnosed and fixed autonomously. Production failures stop and report.

# Expected modules

- **Database:**
  - `supabase/migrations/128_course_dates_close.sql` (provisional);
  - `supabase/manual/course_close_backlog.sql` and `…_revert.sql`;
  - `scripts/rollback/128_course_dates_close_restore.sql`.
- **Application:**
  - groups: `groups/page.jsx`, `groups/[id]/page.jsx`;
  - dashboard and students: `dashboard/page.jsx`, `students/page.jsx` (`YearCloseDialog`);
  - shared helpers and pickers: `membershipActions.mjs`, `EnrollmentModal.jsx`, `StudentForm.jsx`, `receiptGroupChoices.mjs`, `LegacyPlacementEditor.jsx`, `programCatalog.mjs` (programmes that use groups);
  - other pages: `communications/page.jsx`, `placement-tests/page.jsx`, `attendance/page.jsx`, `timetable/page.jsx`, `teacher-portal/page.jsx`, `assessments/page.jsx`;
  - reports: `reportData.mjs`;
  - the guide: `GuideContent.jsx`, `HelpdeskNav.jsx`, screenshots.
- **Tests:** the new suite, the upgrade rehearsal, the concurrency harness, the fixture updates and the `verify.yml` steps.
- **Docs:** as listed in D11.

# Owner decisions required

Each question has a recommendation; none is decided until the owner answers. **The proposed owner answers OA1–OA6 above are confirmed with the approval of this revision.** **Answered (Maroine, 2026-11-05): Q1 and Q3–Q18 all A, OA1–OA6 as recorded; see the approval record at the end of this section.**

**Q1 — Which programmes require dates, and existing groups without dates.**
- **A (recommended):** required for Mise à niveau, Adults, Summer Camp and One-to-One, on creation and on a change into one of these programmes, and never cleared. An existing group of these programmes without dates keeps its learners but refuses any new placement until its dates are entered (« Renseignez les dates du cours »). Yearly, Other and the Communication programmes: optional. Consequence: the director enters the dates of the short groups counted at R0 (B2) right after the release; no guessed data. Existing test fixtures gain dates.
- **B:** required only when a group is created. Consequence: existing short groups may never get dates and never appear on the card.
- **C:** required for every in-person programme, Yearly included. Consequence: every Yearly group must be edited.

**Q2 — Yearly groups.** *Superseded by OA1 (proposed):* dates are optional; a Yearly group is on the card only with a `date_fin`; « Clôturer l'année » marks its Yearly groups closed. There is no computed 31 August end.

**Q3 — Date window against the group's school year.**
- **A (recommended):** both dates between 1 June of the first year and 31 August of the second (the window of the EAP « paid elsewhere » rule), with the end on or after the start. Consequence: a summer Mise à niveau before September fits the coming year.
- **B:** strictly 1 September – 31 August. Consequence: a course taught in late August for the coming year must be filed under the ending year.

**Q4 — One-to-One.**
- **A (recommended):** an in-person One-to-One is a course of capacity 1 with its own dates, placed and closed like any course. Each learner and period gets its own group, with a neutral name that never contains the learner's name. Its end date is the planned end of the lesson package and can be moved later (logged) while the course is open. This is the model Online One-to-One already follows (capacity 1, term dates). Consequence: one more group per individual learner; teachers, attendance and the close work unchanged.
- **B:** no group; the enrollment carries its own dates and a per-learner close. Consequence: new enrollment columns, a second close path, and attendance without a group, which is not possible today.
- **C:** unchanged. One-to-One learners are ended one by one with « Ancien apprenant ».

**Q5 — Who closes a course and sees the card.**
- **A (recommended, per the direction):** director only, like « Clôturer l'année ». Consequence: admin sees the dates and the closed state but cannot close, and its dashboard does not call the director function.
- **B:** director and admin, like « Ancien apprenant » and the online close.

**Q6 — Closing before the end date.**
- **A (recommended):** refused for a group with learners. To stop a course early, the director first moves its end date (logged), then closes it the next day. Empty groups can be closed at any time (OA2). Consequence: one rule decides when a course is over, and attendance up to the end date stays correctable in the database.
- **B:** allowed with a reason. Consequence: attendance of the remaining sessions can no longer be recorded.

**Q7 — State of a closed course.**
- **A (recommended):** a closed mark on the group. Placement is refused on every path. The course is hidden from pickers, attendance, timetable, teacher and assessment selects, announcement and placement-test pickers, reports and « Groupes actifs ». It is listed under « Clôturés » with its past learners, read-only, and its core fields are frozen until it is reopened. Name lookups keep showing it.
- **B:** no mark; only the enrollments end, and the group can be reused. Consequence: a finished group keeps appearing everywhere and can be refilled by mistake.

**Q8 — Undoing a close.**
- **A (recommended):** « Rouvrir le cours » (director) clears the mark and restores exactly the enrollments that close ended or attached, when each is unchanged since; others are reported and left ended. For a group closed by the year close it only clears the mark.
- **B:** only clear the mark; each learner is reopened and placed again by hand.

**Q9 — Online courses.**
- **A (recommended):** they keep their dates and their own « Clôturer », and appear on the card once past their term end. The new guard (share-locking the course row) refuses placement into a closed online course, which closes the second half of Batch D follow-up 2. The year close spares a course whose term ends later. Consequence: one card for every finished course; no change to the online close.
- **B:** the card and the guard ignore online courses.

**Q10 — Teachers and past rosters after a close.**
- **A (recommended):** staff see the past learners on the closed course's page; teacher rosters, access and assessments stay membership-based. No teacher is assigned to any group yet (Batch D follow-up 5). Teacher read of closed courses becomes a follow-up, together with Batch D follow-up 2 (past online rosters).
- **B:** give teachers read-only access to their closed courses now. Consequence: changes to the 123 teacher projections and a wider security review.

**Q11 — Timing of the one-time step.**
- **A (recommended):** after migration 128, in the same release window, journalled in the new `maintenance.course_close_journal`. Consequence: one review and one release; the 38 stays visible until then.
- **B:** earlier, before the feature, through the live Batch D leaver core. It would be journalled in the existing `maintenance.egc_cleanup_log` under a new step name, with its own reviewed script and revert. Consequence: the 18 end sooner, at the cost of a second Production operation, and without the S6 charge links unless that script adds them.

**Q12 — Which backlog programmes the step ends** (scenarios S1–S4 of the R0 query).
- Mise à niveau (18), reason « Mise à niveau terminée »: in the step, per the direction (S1).
- Adults (10) and One-to-One (2 in person + 1 online):
  - **A (recommended):** in the step only for a programme the owner confirms entirely finished at R0b (T11 shows the enrollment months). Otherwise the director handles them after the release, by attaching or ending them in the close of their course (Q14), by « Ancien apprenant », or by placement into a dated course.
  - **B:** include them now (S4).
- Yearly (7): never; they need a group.

**Q13 — Reopening a row ended by the step or by a course close.**
- **A (recommended):** allowed, like any ended paid enrollment (« Rouvrir l'inscription », director or admin). The row goes back to « Inscrit — groupe à affecter » and is listed in Contrôles when unpaid.
- **B:** never reopenable, as with the EAP archive (Q11 there). Consequence: a learner returning to the same programme and year would need a new enrollment and payment.

**Q14 — Paid enrollments without a group at the close of their course (B1).**
- **A (recommended):** the preview lists every paid enrollment without a group of the course's programme and school year, with no level or the course's level. The dialog requires an explicit choice for each before it can close:
  - « A suivi ce cours »: placed in the course (capacity override logged), then ended with it, so the history shows the course. No attendance row is created, and the learner's existing attendance (in other groups) is kept;
  - « Terminer sans groupe »: ended with the close's reason, without a group;
  - « Laisser en attente »: untouched; stays on « Groupe à affecter ».

  Every choice is journalled and undone by « Rouvrir le cours ».
- **B:** information only. The dialog shows them, and the director handles each from the learner file.
- **C:** they are ended automatically with the close. Consequence: a learner waiting for the next session of the same programme would be ended by mistake.

**Q15 — Payments after a close (S6).**
- **A (recommended):** at the close (and in the one-time step), every **partly paid** open unlinked tuition charge of the same learner, programme and year is linked to the enrollment being ended, journalling each link (the D3 charge link rule, N-2). An undated charge qualifies only when it was created during the enrollment's school year and that year is the current one; undated charges of earlier years (pre-057) are never linked. A later payment on a linked charge lands on the ended enrollment's own charge: it is accepted, the balance goes down, and nothing is revived. **« Engagements »** (nothing paid, often for a next session) are shown in the preview and never linked: a later payment on one creates a new enrollment, as for any new session. A payment on a **new** charge created after the close also creates a new enrollment, as a genuine re-enrollment does today. Consequence: no change to the payment command.
- **B:** re-create `create_charge_payment` to refuse an implicit new enrollment when an ended one of the same programme and year exists. Consequence: a finance-critical function changes, and a genuine second session in the same year needs an explicit enrollment first.

**Q16 — Which groups « Clôturer l'année » marks closed (OA1).**
- **A (recommended):** every in-person group of that school year it leaves without learners: its Yearly groups (OA1) and the other in-person groups of that year, except those ending after the close date (OA4).
- **B:** only its Yearly groups, as OA1 states. Consequence: the year's other emptied groups appear under « À clôturer » (when dated) or stay « En cours » until the director closes each one (OA2).

**Q17 — Which programmes « use groups » for the card « Inscrits — groupe à affecter » (OA5).**
- **A (recommended):** every programme except `Other` (the programme a payment never turns into an enrollment). On 2026-11-05 this changes nothing: no `Other` row among the 38.
- **B:** also exclude One-to-One, if Q4 = C keeps individual lessons outside groups. Consequence: the 2 One-to-One rows leave the card (18 instead of 20 after S1).

**Q18 — Paid enrollments without a group at the June year close when their course does not exist yet (OA6).** OA6 keeps waiting the paid rows without a group of a short programme whose course has not ended (D5). The open point is a row with no matching course at all, open or closed.
- **A (recommended):** kept waiting too. A Summer Camp or a summer Mise à niveau is often paid before its group is created. The row stays on « Inscrits — groupe à affecter » (OA5), and the close of its course (B1) or « Ancien apprenant » reaches it later. Consequence: a paid short-programme row whose course is never created stays on the card until the director ends it.
- **B:** ended as today; the preview lists these rows first so the director can create the course and place them. Consequence: a Summer Camp paid in May whose group is created in July is ended by the June close.

**Approval record.** CDC-r1 at head `c2fbb12…` was reviewed CHANGES REQUIRED on 2026-11-05 (B1, should-fix items, nits); CDC-r2 at head `09e7b4e…` applied them, and its re-review returned CHANGES REQUIRED (N-1, N-2, N-3, nits), applied by CDC-r3. The independent plan review returned **READY FOR OWNER APPROVAL** at head `47a02e6…`. This record is a documentation-only commit on top of that head; it changes no design text, scope or invariant. **Owner approval (Maroine, 2026-11-05), verbatim:**

> Owner approval (Maroine, 2026-11-05): approve the "Courses with dates — close a finished course" plan at exact head 47a02e6a56f08290f85fe2bf0c703b12fc6a6c19 (revision CDC-r3), Q1 and Q3–Q18 all A, OA1–OA6 as recorded. Independent plan review: READY FOR OWNER APPROVAL at 47a02e6 (after CHANGES REQUIRED at c2fbb12 and 09e7b4e).
>
> 1. Record this approval verbatim in the plan's Approval record and in OWNER_DECISIONS (approved for implementation), update ADR-016 and both index rows, push to PR #185. Do not merge; I merge separately.
> 2. Carry these reviewer points into the implementation record (no plan revision needed):
>    - R3-1: word the stop condition and the concurrency harness as "through place, or a direct write of a learner the command does not hold"; record the same-learner direct API update deadlock as a known, pre-existing, out-of-scope limitation (the app never writes enrollments.group_id directly).
>    - Year close locks groups with `for no key update` instead of `for update`.
>    - One-to-One: in the close dialog and OA6 matching, never offer another learner's course of one (restrict or label).
>    - Close preview flags receipts for a next-session deposit attached to the enrollment being ended (the learner would need « Rouvrir l'inscription »).
>    - Flag waiting rows carried over from an earlier school year in the year-close preview and on the card.
>    - T7b3a is expected 0 (057 made the year required); keep the line.
> 3. This approves the plan only. The R0 count, implementation, migration 128, the one-time step (Adults and One-to-One only after my confirmation per programme), merge and deploy each need their own approval.
>
> Stop and report when the approval is recorded.

**Approved answers:** Q1 A and Q3–Q18 A (Q2 is superseded by OA1); OA1–OA6 as recorded under [Owner answers to the CDC-r1 review](#owner-answers-to-the-cdc-r1-review-maroine-proposed-by-the-coordinator-2026-11-05) and [Owner answer to the CDC-r2 re-review](#owner-answer-to-the-cdc-r2-re-review-maroine-proposed-by-the-coordinator-2026-11-05).

**Carried into the implementation record (owner instruction 2, no plan revision).** The implementation applies these points where the approved text says otherwise:

- **R3-1, lock-order scope.** The [stop condition](#stop-conditions) on deadlock-freedom and the concurrency harness ([local test strategy](#local-test-strategy-synthetic-data-only)) are worded "through `place`, or a direct write of a learner the command does not hold". A direct API update of `enrollments.group_id` for a learner the close (or reopen, or year close) already holds can still deadlock with it. That is recorded as a known, pre-existing, out-of-scope limitation: the application never writes `enrollments.group_id` directly.
- **Year-close group lock strength.** D5's year close locks the candidate group rows `for no key update` instead of `for update`.
- **One-to-One.** The close dialog (« A suivi ce cours » candidates) and the OA6 matching of D5 never offer or match another learner's course of one (capacity 1); the implementation restricts those courses out or labels them.
- **Next-session deposits.** The close preview flags receipts for a next-session deposit attached to an enrollment it ends; that learner would then need « Rouvrir l'inscription ».
- **Carried-over waiting rows.** Waiting rows carried over from an earlier school year are flagged in the year-close preview and on the card « Inscrits — groupe à affecter ».
- **T7b3a.** Expected 0, because migration 057 made the school year required on charges; the line stays in the R0 query.

Plan approval authorizes architecture only. The R0 count, implementation, migration 128, the one-time step (Adults and One-to-One only after the owner's confirmation per programme), the merge and the deployment each need their own approval. The owner merges PR #185 separately. Nothing is implemented, merged, applied or deployed.

---

## IMPLEMENTATION CONTRACT

### Scope

Deliver D1–D11 with the owner's answers to Q1–Q18 and OA1–OA6, which stand only once the plan is approved.

The implementer may not widen scope to the leaver core, `online_close_course`, `place`, capacity, membership, the payment command, finance amounts, CRM or teacher projections. The one exception is the lock-order-only re-creation of `enforce_group_capacity` (D4): no capacity rule changes. The re-created functions change only as D1, D4 and D5 state.

### Prerequisites

1. Owner approval of this revision with Q1–Q18 and OA1–OA6, recorded in the approval record and in [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md) (given 2026-11-05 for CDC-r3 at head `47a02e6…`). Implementation itself is authorized separately.
2. Fresh `origin/main` and the next migration number re-verified (provisionally 128).
3. These definitions re-read with `pg_get_functiondef` (or `pg_policies`) on a local database and compared with the bodies cited:
   - from 125: `save_receptionist_group`, `crm_enrollment_groups`, `guard_group_year` and its trigger, `guard_enrollment_group_year`;
   - from 120: `end_group_enrollments`, `leave`, `end_enrollment`, `close_school_year`, `online_close_course`, `enforce_group_capacity` and its trigger `enrollment_group_capacity`;
   - from 127: `place`/`place_learner_in_group`, `reopen_enrollment`, `create_charge_payment` (the matching rule at lines 209–214);
   - from 123: `get_visible_student_ids`;
   - the policies « groups read all auth » and « groups admin all » (124);
   - the absence of triggers on `public.charges`.

   A difference is a stop condition.
4. Local Supabase, synthetic data, external e-mail disabled, a dedicated feature branch.
5. No Production read or write by the implementation task.

### Object / module manifest

**Migration `128_course_dates_close.sql`** (provisional):

- **Columns:** `alter table public.groups add column date_debut date, add column date_fin date, add column closed_at timestamptz, add column closed_by uuid`, with `groups_course_dates_order`.
- **Re-created year guard:** `academic_security.guard_group_year()` (125 body plus the date window), and trigger `groups_year_guard` re-created as `before insert or update of annee, date_debut, date_fin`.
- **New guards:** `academic_security.guard_course_group()` + trigger `groups_course_guard`; `academic_security.guard_course_placement()` + trigger `enrollment_course_guard`.
- **Journal:** `maintenance.course_close_journal` (RLS on; all privileges revoked from `public`, `anon`, `authenticated`, `service_role`).
- **New functions:** `public.list_courses_to_close()`, `public.close_course_preview(uuid)`, `public.close_course(uuid, integer, text, uuid[], uuid[])`, `public.reopen_course(uuid, timestamptz)`, `public.close_school_year_preview(text)`.
- **Re-created functions:** `create or replace` of `public.close_school_year(text, integer, text)` (120 body plus D5), `public.save_receptionist_group(uuid, timestamptz, jsonb)` and `public.crm_enrollment_groups(text, text, integer, integer)` (125 bodies plus D1/D4); `academic_security.enforce_group_capacity()` (120 body, with `for share` on its group read only; trigger unchanged).
- **Policies:** `portal_security.family_group_ids()`; `drop policy "groups read all auth"`; `create policy "groups read staff"` and `"groups read family"`.
- **Finally:** `notify pgrst, 'reload schema'`.

Every untouched function keeps identical owners, security modes, `search_path` and ACLs (snapshot-compared). Conflicts raise `PT409` (ADR-009); no `40001`.

**Data scripts, committed and not run:** `supabase/manual/course_close_backlog.sql`, `supabase/manual/course_close_backlog_revert.sql`, `scripts/rollback/128_course_dates_close_restore.sql`.

**Application, tests, fixtures, CI and docs:** as listed above.

### Invariants

- Nothing ends automatically. Every close is a director command:
  - on a course whose end date has passed;
  - on an empty group;
  - through the year close;
  - or the separately approved one-time step.
- A close ends exactly the rows it counted, attached or listed and journalled; anything more rolls it back.
- A close ends only the live enrollments of that course and the unplaced enrollments the director chose, through the Batch D leaver core. Files become Alumni only when nothing else is live.
- Charge amounts, receipts, payments, attendance, CRM conversions and the lifecycle outbox are untouched. The only exception is the journalled linking of open unlinked charges to the enrollments being ended.
- A later payment never re-creates a Confirmed enrollment for a partly paid charge that was open at the close. « Engagements » with nothing paid and undated charges of earlier school years are never linked.
- No enrollment enters a closed course (in person or online) by any role or path, except through the two-flag restore and « Rouvrir le cours ».
- The closed mark changes only inside the commands.
- The year close never ends an enrollment in a course that ends after the close date, nor a paid enrollment without a group whose course has not ended (OA6). It never marks closed a group that has a live learner.
- Every path that enters a group takes the group row before the seat lock; the close, the reopen and the year close take learners, then group rows (N-1, N-3).
- Parents and students read only the groups of their own learners; every staff role reads every group, as before.
- A repeated close of a closed course returns the original result and writes nothing; a stale count raises `PT409`.
- Placement, capacity, the year check, one live enrollment per programme and year, membership from enrollments, and every role's other capabilities are unchanged.
- Production SQL, the data step and the deployment happen only by explicit release approval, in the order R0–R6.

### Acceptance / tests

1. These pass:
   - the CI SQL suite;
   - the 127 → 128 rehearsal (data step S1 and S4, wrong count, revert, revert refused after a reopen, no-op);
   - the concurrency cases (no `40P01`).

   The ACL snapshot equals 127 for every untouched function, and the catalog diff is exactly the manifest.
2. In the browser:
   - the director closes, with unplaced learners attached and ended, and reopens a course;
   - the director closes an empty group;
   - reception and admin (Q5 = A) have no close;
   - closed courses are absent from every picker and select listed in D4;
   - the cards and « Groupes actifs » show the right counts;
   - the year-close dialog spares a running summer course;
   - parent and student portals work, and parents and students read only their groups.
3. Dates and One-to-One rules work from both the reception RPC and the management form, including a create without a year.
4. The guide is updated and its content test passes. `npm run lint`, `npm run build` and the changed-Markdown checks are clean.
5. The PR lists the migration filename, the Q1–Q18 options applied, any deviation, and the Production steps deferred to the release task.

### Stop conditions

Stop and report if:

- a function's or policy's latest definition differs from the cited one;
- a trigger exists on `public.charges`;
- an ACL snapshot differs;
- an existing EGC, EAP, online, portal or finance test fails for a reason other than the planned rules (closed course, undated short group, family-scoped group read, course-aware year close);
- the close, the reopen or the year close cannot be shown deadlock-free against placement (through `place` and a direct write) and the online close;
- the data step cannot be rehearsed with a revert that restores its journal;
- the owner changes a decision;
- Production access, credentials or data would be needed.

### Docs / status reporting

Report per [AGENTS](../../../AGENTS.md#implementation-handoff) with branch, head SHA, PR, tier rationale, checks tied to the SHA, self-check, plan revision, migration filename and unresolved decisions. Independent review is mandatory (Tier 3).

# Implementation record (CDC-r3, 2026-11-05)

**State at implementation (2026-11-05): IMPLEMENTED ON BRANCH `feat/course-dates-close`, in the implementation pull request; not merged, not deployed; migration 128 not applied on Production; the one-time step, its revert and the restore are prepared and not run.** Implemented under the owner's authorization of 2026-11-05 (Maroine), Tier 3, from a fresh `origin/main` at `9211a5a` (the plan merge, PR #185). Planned, implemented, merged, deployed and Production-verified remain distinct states; CURRENT_STATE changes only at closeout with dated evidence.

## Prerequisites as found

- Next free migration number: **128**, confirmed from `supabase/migrations` on `origin/main` `9211a5a` and from CURRENT_STATE (Production ledger 001–127).
- `pg_get_functiondef` of every definition listed in prerequisite 3 on a clean local build at 127 (CI image `supabase/postgres 17.6.1.165`) equals the body this plan cites, and the two `groups` policies are as cited. No trigger exists on `public.charges`. No stop condition.

## R0 count (Production, read-only, run once)

Run **once** on 2026-11-05 from 13:05:04 to 13:05:09 UTC, under the owner's approval in the implementation instruction of that day: `set transaction read only;` and the plan's single SELECT, committed unchanged as [`supabase/manual/course_close_r0_counts.sql`](../../../supabase/manual/course_close_r0_counts.sql). It returned 145 count rows and no personal data. Nothing else touched Production.

| Line | Count |
| --- | --- |
| A1 live enrollments, 2026/2027 | Yearly Validated in a group 86; Yearly Confirmed without group 7; Mise à niveau 18, Adults 10, One-to-One 2, Online One-to-One 1 (all Confirmed without group) |
| A2 card today / A3 card under OA5 | 38 / 38 |
| A4 card after the step, S1 / S2 / S3 / S4 | 20 / 10 / 17 / 7 |
| B1 groups / B2 with live learners / B3 live learners in groups | Yearly 8 / 8 / 86; every other programme 0 |
| B4 / B5 / B6 / C2 / C3 | 0 / 0 / 0 / 0 / 0 |
| U1 paid without group (file not archived) | Yearly 7 (Child 1: 5, Junior 3: 1, no level: 1); Mise à niveau 18, Adults 10, One-to-One 2, Online One-to-One 1 (no level) |
| U2 that a course close could reach / U3 groups that would list them | Yearly 7 / 8; every other programme 0 |
| T1 candidates (2026/2027), Mise à niveau / Adults / One-to-One / Online One-to-One | 18 / 10 / 2 / 1 |
| T2 per scenario | the T1 figures of each scenario's programmes |
| T3 files that stay « Inscrit » / T4 files that become « Ancien apprenant » | S1 6 / 12, S2 6 / 22, S3 6 / 14, S4 6 / 24 |
| T5 / T6 | 0 / 0 for every programme |
| T7a open balance on a linked charge | Adults 3; others 0 |
| T7b1 / T7b2 / T7b3a / T7b3b | 0 / 0 / 0 / 0 for every programme |
| T8 no live receipt / T10 Batch D clean-up rows | Mise à niveau 10 / 10; others 0 / 0 |
| T9 linked to a CRM lead | 0 |
| T11 by enrollment month | Mise à niveau 2026-09: 7, 2026-10: 11; Adults 2026-09: 7, 2026-10: 3; One-to-One 2026-09: 2; Online One-to-One 2026-10: 1 |
| T12 Yearly paid without group | 7 |
| J1 Ended enrollments / J2 Alumni files | 23 / 97 |

Every figure the plan states matches: A2 = A3 = 38, T1 = 18 / 10 / 2 / 1, A4 = 20 / 10 / 17 / 7, T5 = T6 = B4 = 0, T12 = 7, and T7b3a = 0 (reviewer point six; the line stays). Counts that are not a mismatch but need the owner's attention; none changes the design:

- **No short-programme group and no online course exist.** The eight groups are all Yearly (86 learners); there is no Mise à niveau, Adults, Summer Camp or One-to-One group and no online course (B1–B3, C2 = C3 = 0). On day one « Cours terminés à clôturer » is therefore empty, no group needs dates before its next placement, and every short-programme waiting row (31) is a paid enrollment that never had a group: only the one-time step (or « Ancien apprenant », row by row) takes them off the card. The close dialog's unplaced list applies today only to Yearly groups once they have a `date_fin` (U2 = 7 rows, U3 = 8 groups); a learner with no level matches any level of the course, as D3 states.
- **T3 + T4 against T2.** S1 has 18 targets for 18 learners (6 + 12). S3 has 21 targets for 20 learners and S4 31 targets for 30: one learner has targets in two programmes (Mise à niveau and one of the two One-to-One programmes), counted once; the step calls `leave` once per learner and programme, as D10 states. The six T3 learners keep another live enrollment.
- **T8 = T10 = 10.** The ten Mise à niveau rows without a live receipt are the ten rows of the Batch D clean-up (« Rattrapage EGC »). They are today's content of the director's « Inscriptions confirmées sans aucun paiement » and leave that list when the step ends them.
- **T7a = 3** Adults candidates keep an owed balance on their linked charge (only if the owner turns Adults on). No charge would be linked by the step (T7b1 = T7b3a = 0) and no CRM conversion is touched (T9 = 0).

The declared counts of [`course_close_backlog.sql`](../../../supabase/manual/course_close_backlog.sql) follow these numbers: T2 per programme 18 / 10 / 2 / 1; T3 / T4 / A4 per scenario S1 `6/12/20`, S2 `6/22/10`, S3 `6/14/17`, S4 `6/24/7`; Mise à niveau only by default (`cdc.adults` and `cdc.one_to_one` stay `off` until the owner confirms each programme). The release task re-runs R0 before the step and re-declares if anything moved.

## Reviewer points carried into the implementation (approval instruction 2)

1. **R3-1, lock-order scope.** Deadlock-freedom is claimed and tested **through `place`, or a direct write of a learner the command does not hold**: the harness drives `place_learner_in_group`, reception's assignment and an admin's direct insert (through RLS) of a learner the command does not hold, against the close (N-1) and the year close (N-3), and placements and leavers against the reopen. A direct API update of `enrollments.group_id` for a learner that a close, reopen or year close already holds can still deadlock with it. That is a **known, pre-existing, out-of-scope limitation**: the application never writes `enrollments.group_id` directly.
2. **Year-close group lock strength.** The re-created `close_school_year` locks the candidate group rows `for no key update` (after the learners, in id order), then marks them in a separate statement.
3. **One-to-One.** `academic_security.course_of_one_allows` keeps a capacity-1 course to its own learner (a live or ended enrollment in that group). The close dialog's « A suivi ce cours » candidates (`course_unplaced`) and the OA6 matching of the year close (`year_close_rows`) never offer or match another learner's course of one.
4. **Next-session deposits.** The close preview flags, per member and per unplaced row, live receipts on charges of the enrollment being ended (its own and those the close links) created after the course's `date_fin` (`next_session_deposit`, with `created_after_end` on each receipt), and the dialog says that such a learner would need « Rouvrir l'inscription ». The close result counts them over every row it ends. Limitation: a deposit paid before the end date cannot be told apart from an instalment and is not flagged.
5. **Carried-over waiting rows.** `close_school_year_preview` returns `carried_over_waiting` (Confirmed rows without a group, programme other than « Autre », of a school year earlier than the one being closed), shown in the year-close dialog; the card « Inscrits — groupe à affecter » adds « dont N d'une année scolaire précédente » for rows of a year earlier than the centre's current school year.
6. **T7b3a.** Expected 0 and found 0; the line stays in the R0 query.

## Deviations and clarifications (none changes a decision)

1. **The family read helper is `public.family_group_ids()`**, not `portal_security.family_group_ids()`: `authenticated` has no USAGE on any `*_security` schema and every existing policy helper lives in `public` (as `get_visible_student_ids`). It is SECURITY DEFINER with a fixed `search_path`, executable by `authenticated` only, and returns the groups of the caller's visible learners (current `group_id`, past `ended_group_id`, and the file's `groupe_id`).
2. **The preview's `paid_total`** for a member or an unplaced row includes the receipts on the charges the close would link, so the dialog shows what the learner paid for that course.
3. **The preview's `charges_to_link` and `engagements`** count the members; each unplaced row carries its own counts. The command links the charges of every row it ends (members, attached and ended-unplaced).
4. **« Rouvrir le cours »** restores members through `academic_security.place` with the capacity-override reason « Rouvrir le cours » (logged as a capacity override when the group is full meanwhile); attached and ended-unplaced rows return to Confirmed without a group. Rows changed since the close are left ended and returned in `skipped` (each with its reason); the toast counts them.
5. **Teacher-facing pickers** (attendance, assessments, the teacher portal) exclude closed in-person courses only: teachers cannot read `online_courses`. The database guard refuses a placement into a closed online course on every path.
6. **The dashboard card** counts Confirmed rows without group of every programme but « Autre » (OA5); a row without a programme is not counted either.
7. **Risk noted, not changed:** `academic_security.leave` keeps a file Enrolled when its `groupe_id` still names a group without a matching membership (a legacy shape). The step's post-conditions (T3 files Enrolled, T4 files Alumni) catch it, and the step then refuses and changes nothing.
8. **Fixtures beyond the inventory.** The re-grep found more suites with short-programme groups or year closes than the inventory listed; they gained dates (One-to-One capacity 1) or past end dates without assertion changes, except where the planned rules apply (see Tests).

## Tests

New:

- `scripts/test-course-dates-close.sql` (CI SQL step): the dates (window, order, required programmes, never cleared, Yearly optional, refused on online groups, create without a year then window-checked, year change re-checked, logged date edits, One-to-One capacity 1); `save_receptionist_group` with dates; the close as director (ended count, Alumni versus Enrolled, main group, balances, journal and run row, activity log, finance and CRM untouched except the journalled links, B1 attach and end-unplaced with every refusal, N-1 order, replay, empty group, refusals by state and role); placement refused into a closed course on every path, in person and online, with the two exemptions; the protected mark and frozen fields; `reopen_course` (restored, skipped, capacity override, year-closed group); S6/N-2 (later payments on linked, engagement, undated and new charges; preview equals command); attendance and payments after the close; the year close (D5, OA4, OA6, Q16, Q18, carried-over rows, preview equals command); the policies by role; `list_courses_to_close`; the R0 query on the fixture with explicit zeros.
- `scripts/test-course-dates-close-upgrade.mjs` (upgrades shard, 127 → 128): seeded 127 patterns, R0 counts, the 128 manifest and posture, the step for S1 and S4 (refused on a wrong count, dry run, run, journal, no-op rerun), the revert (refused after a reopen without a declared skip, with it, full revert, second revert refused), and the restore back to the 127 catalog.
- `scripts/test-course-close-concurrency.py` (concurrency shard): N-1 against `place_learner_in_group` (director), reception's assignment and a direct management insert of a learner the close does not hold, in both orders, with and without attach; two closes of one group; reopen against a placement, `reopen_enrollment` and `remove_learner_from_group`; S3 online close against a placement; N-3 year close against a placement and against a direct management insert, in both orders; the year close against a course close. No `40P01` in any case.
- `scripts/test-course-close.mjs` (`npm test`): helpers, French texts equal to the migration's, pickers and lists excluding closed courses, name lookups keeping them, the director-only card, the RPC wrappers, the guide text.

Updated (fixture dates, One-to-One capacity 1, past end dates for year closes, or the planned rules): `test-audit-follow-ups.sql`, `test-audit-follow-ups-ui.mjs`, `test-crm-rcc-a2.sql`, `test-enrollment-at-payment.sql`, `test-enrollment-group-concurrency.py`, `test-enrollment-group-consistency.sql`, `test-enrollment-workflow.sql`, `test-online-learning.sql`, `test-paid-enrollment.sql`, `test-portal-readiness.sql`, `test-receipt-client-regressions.mjs`, `test-receptionist-batch1.sql`, `test-receptionist-browser.mjs`, `test-receptionist-group-filter.sql`, `test-receptionist-security.sql`, `test-report-data.mjs`, `test-student-placement-browser.mjs`. Ledger ceiling 127 → 128: `test-conflicts-without-retry-upgrade.mjs`, `test-crm-batch2-upgrade-current.sql`, `test-crm-h3-upgrade-103-current.sql`, `test-crm-r4-upgrade-100-current.sql`, `test-crm-r4-upgrade-102-current.sql`, `test-premium-retirement-upgrade-113-current.sql`.

## Local verification (2026-11-05)

Private local Supabase stack (CI image `supabase/postgres 17.6.1.165`, its own ports and project id), synthetic data only, on a clone of this branch.

- **A first, full replay of the six `local-database` shards stopped on the local machine, not on a test.** Nine local Supabase stacks shared the 8 GB Docker VM (about 6.7 GB used), and the shards failed on Auth 504 timeouts, an unhealthy database container after a reset, a connection timeout and a container setup error. No assertion failed. The steps that completed passed:
  - in sql-and-concurrency, the rollback-only SQL suites, including `test-course-dates-close.sql` and every updated suite, then advisory D2 and H3-02;
  - in upgrades-from-097-to-105, the synthetic 097 and stateful 100 upgrades;
  - in browser-security, Batch 2 (798 checks), Batch 1 (153), Batch 3A (197), Batch 3B (198) and Batch 4A (182).

  The owner then stopped the replay (instruction of 2026-11-05). **GitHub's Verify run on the implementation pull request is the reference for the six shards.**
- **Then only what is new**, as the owner instructed, on the code of this pull request:
  - `test-course-dates-close.sql` on a fresh reset to 128: **pass**, 83 checks, rolled back.
  - `test-course-close-concurrency.py`: **pass**, ten cases, no `40P01`.
    - The first run failed in the new N-3 direct-write case. The two N-3 year closes before it had already marked the empty fixture groups that it uses, so its insert met « Ce cours est clôturé » before any race.
    - The case now reopens those groups first. This is a test-only fix: the migration is unchanged.
  - `test-course-dates-close-upgrade.mjs` after a reset to 127: **pass**. It covers:
    - the R0 counts and the manifest-only catalog change;
    - the step for S1 and S4: refused on a wrong count, dry run, run, and a re-run that changes nothing;
    - the revert with a declared skip;
    - the restore to the 127 functions.

    The stack was then reset to 128.
  - `npm test`: **pass**.
  - `npm run lint`: **clean**. Its one warning (`<img>` in `Sidebar.jsx`) is in a file this branch does not touch.
  - `npm run build`: **pass**, with the app lane's environment (placeholder Supabase keys, no Sentry DSN).
- **Not run locally; open before merge:**
  - **The browser checks of acceptance 2 (D8).** CI's browser shards run the updated browser suites but have no dedicated course-close browser suite.
  - **The guide's group-form screenshot.** `public/helpdesk/q08-groupe-formulaire.jpg` is still the guide 2.1 image, without the two date fields, while the legend under it now has six items, including « Date de début » and « Date de fin ».
