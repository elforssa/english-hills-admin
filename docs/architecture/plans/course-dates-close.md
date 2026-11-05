# Courses with dates — close a finished course, revision CDC-r2

**Status: PROPOSED (plan only; not approved).** Revision **CDC-r2**, 2026-11-05, superseding CDC-r1 (PR #185 head `c2fbb12a59f2d482a7476ba5ea206934e826ab71`). Risk tier: **3**: enrollment integrity, director commands that end enrollments in bulk, a guard on every placement path, a re-created year close, a narrower read policy on `groups`, and a counted Production data step. Owner: Maroine.

Nothing is implemented, merged, applied or deployed, and **no Production read, count or mutation occurred** while writing this plan.

- **Baseline:** freshly fetched `origin/main` = `6e724ab67f3aa501e99a028b3390cf05aaf9ef74` (PR #184, the enrollment-at-payment closeout, docs only).
- **Migrations:** latest migration file `127_enrollment_at_payment.sql`; Production ledger **001–127** per [CURRENT_STATE](../../ai/CURRENT_STATE.md#deployment-and-credential-evidence-boundaries); next free migration number **128**. That number is provisional and is re-read at implementation. The two other open PRs, #121 and #140, are docs only and claim no number from 128 on.
- **Patterns reused:** Batch D's year close and online course close ([EGC-r2](enrollment-group-consistency.md), [ADR-010](../decisions/ADR-010-group-membership-from-enrollments.md)); conflicts as in [ADR-009](../decisions/ADR-009-conflicts-never-retryable.md); the counted data step of [enrollment at payment](enrollment-at-payment.md) D7.
- **Proposed ADR:** [ADR-016](../decisions/ADR-016-course-dates-and-close.md).

Planned, implemented, merged, deployed and Production-verified are distinct states.

## Revision history

- **CDC-r1** (2026-11-05, head `c2fbb12…`). The independent plan review returned **CHANGES REQUIRED**. The coordinator relayed these items:
  - **Blocker B1:** paid enrollments without a group, of the course's programme, year and level, must be shown and handled at the close.
  - **Should-fix:** S1, S2, S3, S5, S6, S8, S9.
  - **Nits** (listed in the table below).
  - **Five owner answers**, proposed by the coordinator.

  The review reported ten should-fix items, but only seven were relayed individually. S4, S7 and S10 were not. This revision assumes the five owner answers settle them. **The re-review should confirm that or restate them.**
- **CDC-r2** (this revision) applies the relayed items as follows.

| Item | Where |
| --- | --- |
| B1 — paid enrollments without group of the same programme, year and level in the close | D3 (preview, `p_attach`, `p_end_unplaced`), D8 dialog, Q14, R0 lines U1–U3 |
| OA1 — Yearly on the card only with a `date_fin`; « Clôturer l'année » marks its Yearly groups closed | D1, D2, D5, Q2 (superseded), Q16 |
| OA2 — empty groups closable by the director | D3 step 4, D8 |
| OA3 — parents and students read only their own groups; group names reviewed | D6, R0 line B6, R5 |
| OA4 — the year close never closes a group ending after the close date | D5 |
| OA5 — the card counts only programmes that use groups; what it will show | D7, Q17, R0 lines A3–A4 |
| S1 — a close never ends more than it counted and journalled | D3 step 9 |
| S2 — reopen locks learners before the group | D3 « Rouvrir le cours » |
| S3 — the guard share-locks the online course row | D4 |
| S5 — the date window does not depend on trigger order | D1 (window inside the re-created year guard), tests |
| S6 — a later payment never re-creates a Confirmed enrollment | D3 step 8, D10 step 4, Q15, R0 line T7b |
| S8 — release and rollback order with the old application | Release and rollback order |
| S9 — data step counts per approved programme set, one `leave` per learner and programme, revert refuses changed rows | D10, R0 lines T2–T4 |
| Nits | Logged date edits (D1); a run row for every close, including a replay on an empty group (D3); the missing group readers (D4); fixtures and CI wiring (tests); explicit zero rows and the T7 split (R0); dates refused on online groups (D1); the card loaded for the director only (D7); One-to-One end dates (D1, Q4) |

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
  - the **paid learners of the same programme, year and level who were never placed**. For each one the director chooses « A suivi ce cours » (placed, then ended with the course), « Terminer sans groupe » or « Laisser en attente » (B1, Q14).

  On confirmation every live enrollment of that course ends with the reason « Cours terminé »:
  - Learner files become « Ancien apprenant » unless another live enrollment keeps them « Inscrit ».
  - Balances stay owed. A later payment lands on the ended enrollment's own charge and never puts the learner back in « Groupe à affecter » (Q15).
  - Attendance, receipts and the CRM conversion are untouched.
  - The close is journalled and refuses a stale count (« rechargez »). A repeated click after a lost response changes nothing.
- **An empty group** can be closed by the director at any time (OA2).
- **A closed course** no longer accepts learners and disappears from the group pickers, from attendance and from « Groupes actifs ». It stays readable under a « Clôturés » filter with its past learners (Q7). « Rouvrir le cours » undoes a close made by mistake (Q8).
- **« Clôturer l'année »** also marks closed its Yearly groups, and the other groups it empties (Q16). It never touches a course that ends after the close date, such as a summer course (OA4). Its dialog now shows the exact numbers from the database.
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
- **Guide (`/helpdesk`):** the group form (section Q8); a new « Clôturer un cours terminé »; the missing « Clôturer l'année » entry under the director part; the rule that a group name never contains a learner's name.

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
  - `close_school_year` (120).

  No existing row changes: existing groups keep empty dates.
- **One separately approved, counted, journalled data step** (`supabase/manual/`) for the backlog, programme by programme, with a revert from its journal.

## Important security decisions

- The close reuses Batch D's leaver core (`academic_security.end_group_enrollments` → `leave` → `end_enrollment`), the same path as « Clôturer l'année » and the online close. It adds no new way to end an enrollment.
- **Director only** (Q5), checked inside the definer functions from the stored role, as `close_school_year` does.
- **The closed mark is trigger-protected.** `closed_at`/`closed_by` change only under the commands' transaction-local flag, so the management RLS policy on `groups` (direct writes by admin and director) cannot close or reopen a course silently.
- **The placement guard is a trigger on `enrollments`**, like Batch H's year guard. Every path therefore refuses a closed course: group page, learner file, learner form, receipt form, CRM, « Groupe à affecter » and direct writes.
- **Group rows become family-scoped for parents and students** (OA3). Today every signed-in role, parents and students included, reads every group row: policy « groups read all auth », [123 line 1463](../../../supabase/migrations/123_portal_readiness.sql), rewritten by [124 line 386](../../../supabase/migrations/124_speed_as_the_centre_grows.sql). CDC-r2 restricts parents and students to the groups of their own learners. Staff keep the current rule. Group names must still never carry a learner's name, because every staff role reads them.

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
5. **The year close changes behaviour** (OA4, Q16):
   - Enrollments in a course ending after the close date are no longer ended.
   - Groups it empties are marked closed.
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
- **Charges:** the local 127 catalog has no trigger on `public.charges`. Linking an open charge to an enrollment (D3 step 8) meets no finance guard today; re-checked at implementation.
- **Line numbers:** those of the baseline files. The implementer re-reads every function to re-create with `pg_get_functiondef` on a local database first.

## Database dependency inventory (latest definitions)

| Concern | Latest definition | Today | This plan |
| --- | --- | --- | --- |
| `public.groups` columns | [001 lines 68–86](../../../supabase/migrations/001_initial_schema.sql), [049](../../../supabase/migrations/049_session_scoped_groups_and_levels.sql) `session_type`, [117 lines 25–28](../../../supabase/migrations/117_online_learning_pilot.sql) programmes | `name`, `niveau`, `teacher_id`, `salle`, `jours`, `horaire`, `capacite_max` (default 12), `terme` (« Sept–Déc », « Jan–Mar », « Avr–Juin », « Été »), `annee`, `categorie`, `session_type` (Yearly, Adults, Summer Camp, Communication Junior, Communication Adult, One-to-One, Mise à niveau, Other, Online, Online One-to-One). **No date and no closed state.** | **Adds** `date_debut date`, `date_fin date`, `closed_at timestamptz`, `closed_by uuid`, check `date_fin >= date_debut`. `terme` unchanged. |
| Group reads | RLS « groups read all auth » ([123 line 1463](../../../supabase/migrations/123_portal_readiness.sql), [124 line 386](../../../supabase/migrations/124_speed_as_the_centre_grows.sql)): every role except `pending` | Parents and students read every group row. | **Replaced** by « groups read staff » (unchanged rule for every role but parent, student and pending) and « groups read family » (D6). |
| Group writes | RLS « groups admin all » ([124 line 380](../../../supabase/migrations/124_speed_as_the_centre_grows.sql); admin and director; direct insert/update/delete); reception through `public.save_receptionist_group` ([125 line 1762](../../../supabase/migrations/125_audit_follow_ups.sql); key allowlist `assert_keys`; create replay identity check) | The form writes the table directly for management and calls the RPC for reception ([groups/page.jsx 72–78](../../../src/app/(admin)/groups/page.jsx)). | **Re-created** `save_receptionist_group`: the 125 body plus the two date keys (allowlist, insert, update, replay identity). Management keeps its direct writes; the guards cover them. |
| Group guards | `groups_year_guard` → `academic_security.guard_group_year` ([125 lines 117–141](../../../supabase/migrations/125_audit_follow_ups.sql): fills the default year on insert (D-H5a), checks the format, locks the year while live learners of another year exist; trigger `before insert or update of annee`); `groups_membership_level_guard` ([120 line 398](../../../supabase/migrations/120_enrollment_group_consistency.sql), D7); `online_group_guard` ([117 line 875](../../../supabase/migrations/117_online_learning_pilot.sql)) | Year rules only. | **Re-created** `guard_group_year` and its trigger, with the date window (D1, S5). **New** `groups_course_guard` (D1, D4). |
| Placement guards on `enrollments` | `enrollment_group_year_guard` → `guard_enrollment_group_year` ([125 lines 87–111](../../../supabase/migrations/125_audit_follow_ups.sql), share-locks the group); capacity `enforce_group_capacity` ([120 lines 404–421](../../../supabase/migrations/120_enrollment_group_consistency.sql)); online capacity ([117 lines 894–913](../../../supabase/migrations/117_online_learning_pilot.sql)); EAP retired-status guard (127) | No closed-course notion. Placement into a closed online course is **not** refused: open Batch D follow-up 2, review DB-N3 ([OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md#enrollment-and-group-consistency-batch-d--released-2026-10-26)). | Unchanged. **New** `enrollment_course_guard` (D4). |
| Placement command | `academic_security.place` / `public.place_learner_in_group` ([127 lines 1013–1148](../../../supabase/migrations/127_enrollment_at_payment.sql)): reception needs a paid enrollment (Q3 = B); management gives a logged reason; capacity override with reason. `assign_receptionist_student_group` ([120 line 979](../../../supabase/migrations/120_enrollment_group_consistency.sql)) calls the same core. | — | **Unchanged.** The new trigger refuses closed courses and undated short groups underneath it. « A suivi ce cours » (B1) calls the core. |
| Leaver core | `academic_security.end_enrollment` ([120 lines 602–613](../../../supabase/migrations/120_enrollment_group_consistency.sql): sets `Ended`, `ended_at`, `ended_by`, `end_reason`, `ended_group_id`); `academic_security.leave` (lines 624–666: ends the chosen enrollments; file → Alumni/Inactive only when nothing else is live; never touches charges, receipts or attendance); `academic_security.end_group_enrollments` (lines 1529–1548: every live enrollment of one group, learners locked in id order, loops until none is left) | Shared by `end_learner`, `close_school_year`, archive and `online_close_course`. | **Reused unchanged.** |
| Year close | `public.close_school_year(text, integer, text)` ([120 lines 704–736](../../../supabase/migrations/120_enrollment_group_consistency.sql); not re-created since): director only; ends every live enrollment of the year; the live count must equal the expected count (`egc.stale`, `PT409`); Alumni; logged | The dialog counts live enrollments of the year in the browser ([students/page.jsx 81–86](../../../src/app/(admin)/students/page.jsx)) and calls the command. | **Re-created** from 120: spares courses ending later, marks the groups it empties closed, plus a preview (D5). |
| Online close | `public.online_close_course(uuid, bigint)` ([120 lines 1557–1580](../../../supabase/migrations/120_enrollment_group_consistency.sql), from 117/118): director or admin; version-checked; takes the course row `for update`; revokes join passes; ends enrollments with « Cours en ligne clôturé » (first pass, seat lock, second pass, lines 1574–1576). `online_courses.term_start`/`term_end` are limited to 182 days ([117 lines 323–347](../../../supabase/migrations/117_online_learning_pilot.sql)). | Online courses already have dates and a close. | Unchanged (Q9). The course guard share-locks the course row and refuses placement into a closed online course (D4, S3). |
| Payment and enrollment | `create_charge_payment` ([127](../../../supabase/migrations/127_enrollment_at_payment.sql)): a payment on an unlinked tuition charge looks for the learner's **live** enrollment of that programme and year (lines 209–214). If none exists it **inserts a new Confirmed enrollment** (lines 248–252) and links the charge (line 260). An ended enrollment takes payments only on its own linked charge (lines 227–228). | After a close, a payment on an open charge that was never linked would create a fresh Confirmed enrollment and put the learner back on « Groupe à affecter ». | Unchanged. The close and the data step link such charges first (D3 step 8, D10, Q15, S6). |
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
- **Guide:** [GuideContent.jsx](../../../src/app/(admin)/helpdesk/GuideContent.jsx): `#q8` 1015–1060; `#q9` 1061–1103; `#q10` 1109–1141; status cards 1595–1626 (line 1625); `#direction` 1853. **No section describes « Clôturer l'année ».**

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

## D3 — « Clôturer le cours » (director; Q5–Q8, Q14, Q15, OA2, B1, S1, S2, S6)

**Matching paid enrollments without a group (B1).** For a group of programme P, school year Y and level L, the « unplaced paid enrollments » are those that meet all of:

- status Confirmed, `group_id is null`;
- `session_type = P` and school year Y;
- `level is null` or `level = L`;
- the learner file is not archived.

R0 counts them (U1–U3).

### Preview

`public.close_course_preview(p_group uuid) returns jsonb` (director) returns the dialog's numbers:

- `live_count`, `stay_enrolled`, `become_alumni`;
- `open_balance_count` (on linked charges), `unlinked_open_charges` (S6);
- `date_fin`, `closed_at`, `empty`;
- `unplaced`: one entry per unplaced paid enrollment, `{enrollment_id, student_id, full_name, level, paid_total, has_other_live}`, which the dialog shows by name. Only the director, who already reads every learner, receives it.

### Command

`public.close_course(p_group uuid, p_expected_count integer, p_reason text default 'Cours terminé', p_attach uuid[] default '{}', p_end_unplaced uuid[] default '{}') returns jsonb`. Properties: `security definer`; `search_path = pg_catalog, pg_temp`; execute granted to `authenticated` only (revoked from `public`, `anon`, `service_role`); the role is checked inside (`get_my_role() = 'director'`, else `42501`).

1. **Reason:** `academic_security.valid_reason` (1–200 characters; the dialog prefills « Cours terminé »).
2. **Group:**
   - not found → `PT409` `egc.stale`;
   - an online programme → `23514` `course.online` (« Clôturez ce cours depuis sa page Cours en ligne. »).
3. **Replay (idempotency):**
   - Every close writes a **run row** in the journal holding its inputs and its result (nit: an empty close too).
   - If `closed_at` is set, the command returns the latest run row's result with `replayed: true` and writes nothing, which holds for an empty group as well (nit).
   - The same check runs again right after the locks of step 5, so a second director whose close waited on the first one's locks also gets the replay instead of a stale count.
4. **When a close is allowed (Q6 = A, OA2):**
   - A group with no live learner, called with an expected count of 0 and both lists empty, can be closed **at any time, with or without dates**; nothing ends.
   - Otherwise `date_fin` must exist and be before `public.business_date()`, else `23514` `course.not_finished` (« Ce cours n'est pas terminé : sa date de fin est le … »). There is no computed end for Yearly (OA1).
5. **Locks and counts:**
   - The learners of the group's live enrollments and of the `p_attach`/`p_end_unplaced` enrollments are locked together, in one pass in id order (the Batch D order learner → enrollment → group).
   - The live count must equal `p_expected_count`, else `PT409` `course.count_changed` (« Le nombre d'apprenants a changé, rechargez. »).
   - Each id in the two lists must still be an unplaced paid enrollment matching the course, and must appear in only one list, else `PT409` `course.unplaced_changed`.
6. **Journal first:** in `maintenance.course_close_journal` (`source = 'close_course'`, one `run_id`), write:
   - the run row;
   - the before-images of every enrollment the close will touch: action `ended` for members, `attached` and `ended_unplaced` for the two lists (`status`, `group_id`, `level`, `school_year`);
   - the before-image of each learner file (`status`, `groupe_id`).
7. **Attach (B1, « A suivi ce cours »):** each `p_attach` enrollment is placed in the group through the existing placement core (`academic_security.place`, director path). Capacity is overridden with the logged reason « Rattaché à la clôture du cours », because the course is over. These learners then appear in the course's history (`ended_group_id`).
8. **Charges (S6, Q15 = A):**
   - Before anything ends, every **open unlinked tuition charge** of the same learner, programme and school year as an enrollment about to end is linked to that enrollment. The rule is the payment path's own matching rule ([127 lines 209–214](../../../supabase/migrations/127_enrollment_at_payment.sql)): same year, or no year when the enrollment is of the current centre year. Each link is journalled as `charge_linked`.
   - A later payment on such a charge lands on the ended enrollment's own charge. That is accepted without reviving the enrollment (127 lines 227–228), instead of inserting a fresh Confirmed enrollment (127 lines 248–252) that would put the learner back on « Groupe à affecter ».
   - Amounts, receipts and settlement are untouched.
9. **End (S1):**
   - `academic_security.end_group_enrollments(p_group, 'Alumni', reason)` ends the members and the attached rows.
   - Then, per `p_end_unplaced` learner in id order, `academic_security.leave(student, 'Alumni', reason, array[those ids])`.
   - Then the group is marked closed (`closed_at = now()`, `closed_by = auth.uid()`) under the transaction-local flag `eh.course_command = 'on'`. The update re-checks `closed_at is null` and the end date; no row → `PT409` `egc.stale`, and everything rolls back. The group row is not locked before the learners, because locking it first would invert the placement order.
   - Then a second `end_group_enrollments` pass runs (the `online_close_course` pattern, [120 lines 1574–1576](../../../supabase/migrations/120_enrollment_group_consistency.sql)).
   - **The total ended across all passes must equal `p_expected_count + cardinality(p_attach) + cardinality(p_end_unplaced)`, which is exactly the journalled rows.** Anything more means a placement slipped in after the count. The command then raises `PT409` `course.count_changed`, everything rolls back, and the director reloads. « Rouvrir le cours » can therefore always restore exactly what a close ended.
   - A placement that starts after the mark waits on the group row (the year guard and the course guard share-lock it) and is refused once the close commits (D4). There is no lock cycle: placements lock the learner and then the group; the close holds learners first, then the group row.
10. **Log and result:** the command logs `academic_security.log('close_course', null, null, p_group, {run_id, reason, ended, attached, ended_unplaced, alumni, still_enrolled, open_balances, charges_linked})` and writes the same result into the run row. It returns `{group_id, closed_at, ended, attached, ended_unplaced, alumni, still_enrolled, open_balance_count, charges_linked, run_id, replayed: false}`.

**What the close does not touch:** charge amounts, receipts, payments, attendance rows, CRM conversions (D5-A, no review flag), the lifecycle outbox, and the learners' other enrollments. The only change outside enrollments and files is the journalled charge links of step 8.

**Learner files:** `leave` sets Alumni (« Ancien apprenant ») when nothing else is live. Otherwise the file stays Enrolled (« Inscrit ») and the main group moves to the remaining membership, exactly as the year close does.

### « Rouvrir le cours » (Q8 = A, S2)

`public.reopen_course(p_group uuid, p_expected_closed_at timestamptz) returns jsonb` (director):

1. Read, without locks, the group's latest run in the journal (`close_course` or `close_school_year`).
2. **Lock the learners of that run's rows in id order first (S2)**, which is the placement order, so no deadlock (`40P01`) is possible.
3. Then clear the mark: `update … set closed_at = null, closed_by = null where id = p_group and closed_at = p_expected_closed_at`, under `eh.course_command`. No row → `PT409`.
4. Restore each journalled row that is still `Ended` with that run's `ended_at` and reason, and whose learner has no other live enrollment of that programme and year:
   - members return to Validated in the group;
   - `attached` and `ended_unplaced` rows return to Confirmed without a group.

   This uses the « Rouvrir l'inscription » transition followed, for members, by a placement in the same group (capacity override flag set and logged, because the seats were theirs). Rows that changed since are left ended and returned in `skipped` with a reason code.
5. Charge links made by the close are kept: they now point at the restored live enrollment, which is where a payment would have gone anyway.
6. A group closed by the year close carries a run with no enrollment rows. Reopening it only clears the mark, because the year close has no per-course undo, as today.
7. Journal action `reopened`; log `reopen_course`. The placement rules for new learners apply again once the course is reopened.

**Errors** reuse the browser's `PT409` handling (« rechargez »). `membershipActions.mjs` gains French texts for the new hints.

## D4 — The course guard on `enrollments`, and closed courses everywhere (Q7, Q9, S3)

**Placement guard.** `academic_security.guard_course_placement()` (`security definer`, no API grant) runs on trigger `enrollment_course_guard before insert or update of group_id, status on public.enrollments`. It acts only when a row **enters** a group: a new grouped row, a new `group_id`, or a grouped row becoming live again (the same notion as the year guard, 125 lines 99–103). It then refuses:

- a **closed in-person course** (`closed_at is not null`), with the group row share-locked;
- a **closed online course** (Q9 = A; Batch D follow-up 2, second half). The guard reads `select status from public.online_courses where group_id = new.group_id **for share**` (S3), so it serialises with `online_close_course`, which takes that row `for update`. A placement that holds the share lock first is ended by the online close's passes; one that waits sees `closed`. Either way the error is `23514` `course.closed` (« Ce cours est clôturé. »).
  - **No lock cycle:** a placement holds its learner, then the group row, then the online course row. The online close holds the course row, then the learners of the course's committed members, never the learner being placed. A concurrency test proves it (tests).
- a **short-programme group without both dates** (Q1 = A), with `23514` `course.dates_required`.

Exemptions: the Batch D two-flag restore (`eh.membership_sync` and `eh.enrollment_command`, as for every Batch D/H guard), and `eh.course_command` for « Rouvrir le cours ».

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

## D5 — « Clôturer l'année » learns about course dates (OA1, OA4, Q16)

`public.close_school_year(text, integer, text)` is re-created from its [120 body](../../../supabase/migrations/120_enrollment_group_consistency.sql) (lines 704–736) with the same signature, role, reason and count rules.

- **Spares later-ending courses (OA4).** A live enrollment of that year whose group ends **after** `public.business_date()` is neither counted nor ended, and its group is not marked. For an in-person group that means `date_fin` after today; for an online course, `term_end` after today. Every other live enrollment of the year ends as today, including Confirmed rows without a group.
- **Marks groups closed (OA1, Q16 = A).** After ending, the command marks closed, under `eh.course_command`, every in-person group of that school year (`school_year_of(annee)` = the year) that is not already closed and does not end later. That is its Yearly groups (OA1) and, under Q16 = A, the other in-person groups it emptied. Each marked group gets a run row (`source = 'close_school_year'`, no enrollment rows), so « Rouvrir le cours » only clears its mark. Lock order: learners (as in 120), then group rows.
- **Preview.** `public.close_school_year_preview(p_school_year text) returns jsonb` (director) returns `{to_end, kept_in_later_courses, groups_to_mark, unplaced_of_running_programmes}`. The last figure counts paid enrollments without a group of a programme that still has a course of that year ending later. It is shown as a warning so the director can place them first; the command still ends them, as today. The dialog uses this preview instead of its browser count ([students/page.jsx 81–86](../../../src/app/(admin)/students/page.jsx)) and shows the four numbers.

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
  - **« Inscriptions payées sans groupe pour ce cours »** (B1): one line per matching enrollment with the learner's name, level and amount paid. Each needs an explicit choice before the close button is enabled (Q14 = A): « A suivi ce cours », « Terminer sans groupe » or « Laisser en attente »;
  - the reminder « Vérifiez que les présences sont saisies : après la clôture, la liste d'appel du cours n'est plus proposée. »;
  - the reason, prefilled « Cours terminé », and « Clôturer le cours ».

  Success shows a toast with the numbers. On `PT409` the dialog reloads its preview.
- **Group page:**
  - « Clôturer le cours » (director) once finished, or at any time when empty;
  - when closed: a banner « Cours clôturé le … », « Rouvrir le cours » (director), no placement or removal, and a read-only « Anciens apprenants du cours » list (enrollments with `ended_group_id` = the group; staff only, existing RLS).
- **Year-close dialog:** the D5 preview numbers. The warning about unplaced paid learners of running programmes links to « Groupe à affecter ».
- **Group form:** the two dates with the D1 messages; One-to-One capacity 1 and the neutral name proposal.
- **Guide:**
  - `#q8`: dates, plus the naming rule that a group name never contains a learner's name;
  - a new direction entry « Clôturer un cours terminé » (card, dialog, unplaced paid learners, balances, reopening);
  - the missing « Clôturer l'année » entry (later-ending courses spared, groups marked closed);
  - the status cards at line 1625;
  - screenshots of the group form and the close dialog, with synthetic data.

## D9 — Online courses (Q9)

The online close is unchanged. Dates stay on the course, and « Clôturer » stays on its page, because it also revokes join passes and closes the provider room, which the in-person command must not do.

Added:

- online courses appear in « Cours terminés à clôturer » once past `term_end`;
- the D4 guard refuses placement into a closed online course (share lock, S3);
- the year close spares an online course whose `term_end` is after the close date (D5).

Past online rosters (Batch D follow-up 2, first half) stay a follow-up.

## D10 — The one-time data step (Q11–Q13, S6, S9)

**R0 count query.** It is read-only, returns counts only and holds no personal data. It runs through the guarded transport, which runs the file as one implicit transaction and returns only the last statement's rows, so the file is `set transaction read only;` plus exactly one query ([WORKFLOWS convention](../../ai/WORKFLOWS.md#guarded-release-wrapper)).

Every per-programme and per-scenario line returns an explicit zero row (nit). Lines T2–T4 are computed for each possible approved programme set (S9):

- **S1:** Mise à niveau;
- **S2:** + Adults;
- **S3:** + both One-to-One programmes;
- **S4:** all four.

The query was run on a local 127 stack (empty, and with synthetic rows in a rolled-back transaction). It has not run on Production.

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
union all select 'U1 paid without group · ' || session_type || ' · ' || coalesce(school_year, '(none)') || ' · ' || coalesce(level, '(no level)'),
  count(*) from u group by session_type, school_year, level
union all select 'U2 of U1: matches a group of the same programme, year and level (online: course not closed) · ' || ty.st, count(x.id)
  from types ty left join u x on x.session_type = ty.st and exists (select 1 from g where g.open_course
    and g.session_type = x.session_type and g.yr = x.school_year and (x.level is null or x.level = g.niveau))
  group by ty.st
union all select 'U3 groups with at least one matching paid enrollment without group · ' || ty.st, count(g.id)
  from types ty left join g on g.session_type = ty.st and g.open_course and exists (select 1 from u x
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
union all select 'T7b candidates with an open balance on an unlinked tuition charge of the same programme and year (linked by the step, S6) · ' || pr.p, count(x.id)
  from progs pr left join t x on x.session_type = pr.p
    and exists (select 1 from public.charge_balances b where b.student_id = x.student_id and b.enrollment_id is null
      and b.voided_at is null and b.balance > 0 and not b.legacy and b.session_type = x.session_type
      and (b.school_year = x.school_year or (b.school_year is null and x.school_year = public.centre_school_year())))
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
- **Balances:**
  - T7a: balances that stay owed on linked charges.
  - T7b: unlinked open charges that the step links to the ended enrollment (S6). Their balances stay owed too.
- **Receipts and CRM:**
  - T8: rows listed today in the director's « Inscriptions confirmées sans aucun paiement »; they leave that list once ended.
  - T9: conversions that stay valid with no review flag (D5-A).
  - T11: helps the owner judge whether a whole programme is finished (Q12).
- **Unplaced enrollments (B1):**
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
4. **Charges (S6):** each open unlinked tuition charge of a target's learner, programme and year (T7b) is linked to that target, using the D3 step 8 rule.
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

- **New public functions:** `list_courses_to_close`, `close_course_preview`, `close_course`, `reopen_course`, `close_school_year_preview`. Re-created: `close_school_year`.
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
| R0 | Owner authorizes the read-only count | Run the D10 query through the guarded transport and record the counts. Check ledger 001–127 and the catalog digests against a clean local 127 build. Export the functions 128 replaces (`save_receptionist_group`, `crm_enrollment_groups`, `guard_group_year`, `close_school_year`) and the 124 text of the dropped policy to the owner's private folder, with `SHA256SUMS`. |
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
- **Old year-close dialog:** its browser count includes enrollments in courses that end later. When such a course exists, the command answers `PT409` « rechargez » and nothing changes.
- **Closed courses** still appear in the old pickers, but placement into them is refused by the guard.
- **Parent and student screens:** unaffected (no direct `groups` read).

Hence:

- R3 follows R1/R2 immediately, outside reception hours.
- If R3 fails, or if the application must be rolled back for longer than that window, run the **database restore**. It needs its own approval, and it lets the old build work fully again.

The restore is `scripts/rollback/128_course_dates_close_restore.sql`. It:

- drops the new functions, the family helper, the two new triggers and the two new policies;
- re-creates « groups read all auth » with its 124 text;
- restores the 125 bodies of `guard_group_year` (and its 125 trigger), `save_receptionist_group` and `crm_enrollment_groups`, and the 120 body of `close_school_year`;
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
- **S1:** a row placed between the count and the mark makes the close raise `PT409` and change nothing.
- **Replay:** after success, and on an **empty group**, it returns `replayed: true` and writes nothing.
- **Refusals:** stale count; not finished; online group; every other role refused.
- **Empty group:** closable without dates.
- **Placement into a closed course is refused on every path:** `place_learner_in_group`, `assign_receptionist_student_group`, the learner-form path, the receipt-form placement, and a direct management insert. Also into a closed online course.
- **Exemptions:** the two-flag restore and `eh.course_command`.
- **Closed mark:** direct writes of `closed_at` refused for admin, director and `service_role`; the frozen fields of a closed group.
- **`reopen_course`:** restores exactly the journalled rows (members to the group; attached and ended-unplaced rows to Confirmed without group), skips a row reopened or re-enrolled meanwhile, logs the capacity override, and only clears the mark of a year-closed group.
- **S6:** after a close, a payment on a charge that was open and unlinked lands on the ended enrollment. No new Confirmed enrollment, the learner file is unchanged, and the card is unchanged. A payment on a **new** charge created after the close still creates a new enrollment (a genuine re-enrollment).
- **Attendance and payments after the close:** attendance before the end date is still insertable for an ended learner; a payment on the ended enrollment's own charge is accepted without reviving it.
- **Year close (D5):**
  - spares an in-person course with a later `date_fin` and an online course with a later `term_end`;
  - marks the Yearly groups (and, under Q16 = A, the other emptied groups) closed with run rows;
  - its count excludes the spared rows;
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
    - one with an open linked balance and one with an open unlinked charge;
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

- a close against a placement into the same group: either the placement commits first and the close raises `PT409` (S1), or the placement is refused `course.closed`. Never a live enrollment in a closed group, never a deadlock;
- `reopen_course` against a placement and against a leaver on one of its learners: no `40P01` (S2);
- `online_close_course` against a placement into that online course: no `40P01`, and never a live enrollment in a closed course (S3);
- two closes of one group: one ends, the other replays;
- the year close against a course close in the same year.

**Fixtures:** the scripts listed under « Tests that touch the changed areas » gain dates (and One-to-One capacity 1) on their short-programme groups. This is a test-only change with no assertion changes.

**Node (`npm test`):** helpers and error texts (`membershipActions`), pickers excluding closed courses (including communications and placement tests), name lookups keeping them, the dashboard counts and the director-only call, the cache invalidation rules for the new commands, and the guide content test.

**Browser (local):**

- the director closes a finished course from the card and from the group page, with one unplaced paid learner attached and one ended;
- the director closes an empty group;
- reception sees no close button;
- the closed group's page; reopening;
- the year-close dialog with a running summer course;
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

Each question has a recommendation; none is decided until the owner answers. **The proposed owner answers OA1–OA5 above are confirmed with the approval of this revision.**

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
  - « A suivi ce cours »: placed in the course (capacity override logged), then ended with it, so the history shows the course;
  - « Terminer sans groupe »: ended with the close's reason, without a group;
  - « Laisser en attente »: untouched; stays on « Groupe à affecter ».

  Every choice is journalled and undone by « Rouvrir le cours ».
- **B:** information only. The dialog shows them, and the director handles each from the learner file.
- **C:** they are ended automatically with the close. Consequence: a learner waiting for the next session of the same programme would be ended by mistake.

**Q15 — Payments after a close (S6).**
- **A (recommended):** at the close (and in the one-time step), every open unlinked tuition charge of the same learner, programme and year is linked to the enrollment being ended, using the payment path's own matching rule and journalling each link. A later payment then lands on the ended enrollment's own charge: it is accepted, the balance goes down, and nothing is revived. A payment on a **new** charge created after the close still creates a new enrollment, as a genuine re-enrollment does today. Consequence: no change to the payment command.
- **B:** re-create `create_charge_payment` to refuse an implicit new enrollment when an ended one of the same programme and year exists. Consequence: a finance-critical function changes, and a genuine second session in the same year needs an explicit enrollment first.

**Q16 — Which groups « Clôturer l'année » marks closed (OA1).**
- **A (recommended):** every in-person group of that school year it leaves without learners: its Yearly groups (OA1) and the other in-person groups of that year, except those ending after the close date (OA4).
- **B:** only its Yearly groups, as OA1 states. Consequence: the year's other emptied groups appear under « À clôturer » (when dated) or stay « En cours » until the director closes each one (OA2).

**Q17 — Which programmes « use groups » for the card « Inscrits — groupe à affecter » (OA5).**
- **A (recommended):** every programme except `Other` (the programme a payment never turns into an enrollment). On 2026-11-05 this changes nothing: no `Other` row among the 38.
- **B:** also exclude One-to-One, if Q4 = C keeps individual lessons outside groups. Consequence: the 2 One-to-One rows leave the card (18 instead of 20 after S1).

**Approval record.** None yet. The owner approves an exact revision after an independent plan re-review. Implementation, the R0 count, the migration, the data step, the merge and the deployment each need their own approval.

---

## IMPLEMENTATION CONTRACT

### Scope

Deliver D1–D11 with the owner's answers to Q1–Q17 and OA1–OA5, which stand only once the plan is approved.

The implementer may not widen scope to the leaver core, `online_close_course`, `place`, capacity, membership, the payment command, finance amounts, CRM or teacher projections. The re-created functions change only as D1, D4 and D5 state.

### Prerequisites

1. Owner approval of this revision with Q1–Q17 and OA1–OA5, recorded in the approval record and in [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md). Implementation itself is authorized separately.
2. Fresh `origin/main` and the next migration number re-verified (provisionally 128).
3. These definitions re-read with `pg_get_functiondef` (or `pg_policies`) on a local database and compared with the bodies cited:
   - from 125: `save_receptionist_group`, `crm_enrollment_groups`, `guard_group_year` and its trigger, `guard_enrollment_group_year`;
   - from 120: `end_group_enrollments`, `leave`, `end_enrollment`, `close_school_year`, `online_close_course`;
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
- **Re-created functions:** `create or replace` of `public.close_school_year(text, integer, text)` (120 body plus D5), `public.save_receptionist_group(uuid, timestamptz, jsonb)` and `public.crm_enrollment_groups(text, text, integer, integer)` (125 bodies plus D1/D4).
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
- A later payment never re-creates a Confirmed enrollment for a charge that was open at the close.
- No enrollment enters a closed course (in person or online) by any role or path, except through the two-flag restore and « Rouvrir le cours ».
- The closed mark changes only inside the commands.
- The year close never ends an enrollment in a course that ends after the close date.
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
5. The PR lists the migration filename, the Q1–Q17 options applied, any deviation, and the Production steps deferred to the release task.

### Stop conditions

Stop and report if:

- a function's or policy's latest definition differs from the cited one;
- a trigger exists on `public.charges`;
- an ACL snapshot differs;
- an existing EGC, EAP, online, portal or finance test fails for a reason other than the planned rules (closed course, undated short group, family-scoped group read, course-aware year close);
- the close or reopen cannot be shown deadlock-free against placement and the online close;
- the data step cannot be rehearsed with a revert that restores its journal;
- the owner changes a decision;
- Production access, credentials or data would be needed.

### Docs / status reporting

Report per [AGENTS](../../../AGENTS.md#implementation-handoff) with branch, head SHA, PR, tier rationale, checks tied to the SHA, self-check, plan revision, migration filename and unresolved decisions. Independent review is mandatory (Tier 3).
