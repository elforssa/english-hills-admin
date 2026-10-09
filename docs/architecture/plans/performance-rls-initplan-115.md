# RLS role evaluation — migration 115, provisional (architecture, revision R-r1)

**Status: PROPOSED — architecture only, awaiting owner review. Not implemented, not approved for implementation.** Tier 3 (RLS). This is Phase 3 of the performance plan P-r1 (PR #119); evidence: [performance audit](https://github.com/elforssa/english-hills-admin/blob/perf/phase0-measurement/docs/architecture/evidence/performance-audit-2026-10-08.md). Baseline: `origin/main` at the time of writing; migration ledger 001–112.

**Migration number is provisional.** This design was first written as migration 114. Production has since taken 113 (Premium retirement Release A, PR #125), and the session-context design (PR #121) now provisionally takes 114, so this revision calls it 115. The real number is whichever is next free in `supabase/migrations` on `origin/main` when the migration file is written; the Premium retirement plan also names 114 provisionally for its Release B. Renumbering changes nothing in the design.

# Owner summary

## What will change

Reading the students list (and similar tables) asks the database, for **every row**, whether the reader is a teacher linked to that student. It asks this even for directors, admins and the receptionist, for whom the answer is always "no".

Migration 115 rewrites policy expressions so that:

1. the role helpers are evaluated once per query instead of once per row;
2. the expensive teacher check runs only when the reader actually is a teacher.

Who can see or change which rows does not change.

## What staff/users will be able to do

The same as today, faster.

| Measure | Production | Isolated local experiment |
| --- | --- | --- |
| Students read for non-teachers | 516 ms mean for 213 rows | 3.8 s → 4 ms for 5,000 rows |

## What remains restricted

Everything:

- every policy keeps its name, table, command, roles and PERMISSIVE/RESTRICTIVE kind;
- each rewritten expression has the same truth value for every reader;
- no policy is added, dropped or merged.

## UI impact

None, apart from speed.

## Database impact

Migration 115 runs `ALTER POLICY … USING (…) WITH CHECK (…)` on about 150 public policies. It changes no data, table, function or grant.

## Important security decisions

- **Text-only rewrite.** Rewrites are generated mechanically from the live policy text and committed as literal, reviewed SQL. The only change is wrapping zero-argument helpers as `(select f())` and adding the teacher guard.
- **No consolidation.** Merging permissive policies (the advisor's 165 warnings) is **excluded**, because merging changes how policies combine and carries real authorization risk.
- **Teacher path unchanged.** It stays per-row. A set-based teacher helper would be a separate, later design.

## Risks / owner review points

- **Broad change.** About 150 policies change at once. Mitigations: mechanical generation, a before/after visible-row and write-matrix equivalence test for every role, and a single forward rollback migration prepared in advance.
- **Lock window.** Applying it briefly takes table locks. Schedule it outside centre hours.

## Verified current state

| Helper | Policies using it (of 163) | Volatility | Wrapped today |
| --- | --- | --- | --- |
| `public.get_my_role()` | 144 | STABLE, SECURITY DEFINER | 0 |
| `public.get_my_teacher_id()` | 15 | STABLE, SECURITY DEFINER | 0 |
| `auth.uid()` | 10 (the advisor's `auth_rls_initplan` warnings) | STABLE | 0 |
| `public.get_my_email()` | 3 | STABLE, SECURITY DEFINER | 0 |
| `public.get_visible_student_ids()` | 35 | STABLE, SECURITY DEFINER | already a subselect |

All four helpers take no arguments and depend only on the request's JWT claims and the caller's own profile or teacher row. Inside one statement they return the same value for every row, so `(select f())` (an InitPlan evaluated once) is equivalent to calling `f()` per row.

Six permissive policies call per-row helpers with arguments, which cannot be hoisted:

| Table | Policy |
| --- | --- |
| `students` | `students teacher read groups` → `teacher_can_see_student(id)` |
| `assessments` | `assessments teacher rw` |
| `certificates` | `certificates teacher read` |
| `learning_assessments` | `learnassess teacher rw` |
| `placement_tests` | `placement teacher rw` |
| `portfolios` | `portfolios teacher rw` |

The last five call `teacher_can_access_student_group(...)`. Both helpers are SECURITY DEFINER, so the planner never inlines them, and both begin with `get_my_role() = 'teacher' AND …` on every branch. For any other role they evaluate to false or NULL, but only after a full function call per row. Policies are ORed, so these calls run for every row a non-teacher reads.

## Design

1. **Initplan wrapping.** In every public policy, replace each call to `auth.uid()`, `get_my_role()`, `get_my_teacher_id()` or `get_my_email()` that is not already in a subselect with `(SELECT f())`, in both `USING` and `WITH CHECK`.
2. **Teacher guard.** In the six policies above, prefix each expression with `((SELECT get_my_role()) = 'teacher'::text) AND (…)`.
   - **Equivalence:** for a teacher the guard is true and the original expression decides. For anyone else, the original is false or NULL (deny), and the guarded expression is false or NULL (deny).
   - `WITH CHECK` rejects both false and NULL, so write checks keep their meaning.
3. **Generation.** A generator script reads `pg_policies` on a database at the latest ledger and emits one `ALTER POLICY` per changed policy, with the original expression in a comment beside it. The generated SQL is committed and reviewed. The paired rollback file holds the original expressions.
4. **Unchanged:** helper functions, permissive/restrictive structure, policy names, roles and commands, grants, and the advisor's FK, unused-index and duplicate-index findings (separate items).

## Evidence — isolated experiment (2026-10-08)

To avoid interfering with another local session on the shared stack, the experiment ran in a **separate throwaway Postgres container**:

- the same `supabase/postgres:17.6.1.155` image as Production;
- migrations 001–112 applied in order, with a minimal stand-in for the storage service's tables;
- result: 163 public policies, matching Production.

It used one transaction, always rolled back, and did the following:

1. Seeded 7 role fixtures (director, admin, receptionist, linked teacher, parent, student, pending), 5,000 synthetic students (2% soft-deleted, mixed statuses), 50 groups (5 taught by the teacher) and 4,000 enrollments.
2. For every role, recorded the visible row count and a content digest of **every RLS table in `public`** (68 tables, 476 comparisons), and timed `select * from students order by full_name` (median of 5).
3. Applied step 1 (150 policies rewritten), then observed again.
4. Applied step 2 (6 policies guarded), then observed again.

| Result | Value |
| --- | --- |
| Visible-row differences, before vs wrapped | **0** of 476 |
| Visible-row differences, before vs wrapped and guarded | **0** of 476 |
| Students read, admin | 3,804 ms → 4.2 ms |
| Students read, director | 3,836 ms → 4.1 ms |
| Students read, receptionist | 3,857 ms → 4.2 ms |
| Students read, parent | 4,423 ms → 3.2 ms |
| Students read, student | 4,079 ms → 3.5 ms |
| Students read, pending | 4,228 ms → 2.2 ms |
| Students read, teacher | about 7.0 s → about 8.4 s (unchanged within noise; still per-row by design) |
| Wrapping alone | no consistent change; the per-row teacher helper dominates |

The container ran under x86 emulation, so absolute times are inflated. Only the ratios are meaningful.

**Coverage limit.** Only 33 of the 476 role × table cells were non-empty with this fixture. The implementation test must populate every policy-bearing table for each role, and must add the write-path matrix.

## Migration, test, rollout and recovery

**Files:**

- `supabase/migrations/115_rls_role_evaluation.sql`, generated as above;
- `scripts/generate-rls-role-evaluation.mjs` (generator, deterministic output);
- `scripts/rollback/115_rls_role_evaluation_restore.sql`, a forward-applicable restore of the original expressions.

**Required local tests:**

1. **Text equivalence.** After normalizing `(SELECT f())` back to `f()` and removing the guard, every rewritten expression equals its original. Names, commands, roles and permissive flags are unchanged. There are no new or dropped policies.
2. **Read equivalence.** For each role fixture (director, admin, receptionist, linked teacher, unlinked teacher, parent, student, pending, profileless), the visible-row digest of every RLS table is identical before and after. Fixtures must make every table non-empty for at least one role.
3. **Write equivalence.** For each role and each table with INSERT, UPDATE or DELETE policies, attempt one representative write per command in rolled-back savepoints, before and after. Outcomes must be identical (allowed, or the same SQLSTATE).
4. **Performance.** `EXPLAIN (ANALYZE)` of the students read for admin shows no per-row `teacher_can_see_student` calls, and the median drops by at least 10× on the 5,000-row fixture.
5. Existing suites: `npm run test:middleware`, the receptionist and teacher security suites, and the CRM local suites.

**Rollout:**

1. Apply 115 outside centre hours, as a migration-first release with no app change.
2. Verify the policy count and kinds against the pre-release snapshot.
3. Run a rolled-back role probe.
4. Check that `pg_stat_statements` shows the students read mean falling.

**Recovery:** apply the restore migration, which uses the same generator in reverse.

## Owner decisions required

- **D1 — include the teacher guard (step 2).**
  - **A:** wrapping plus guard. Recommended: this is where the measured gain comes from.
  - **B:** wrapping only. This satisfies the advisor but gives no measured speed-up.
  - **Blocking:** yes.
- **D2 — scope of wrapping.**
  - **A:** all public policies (about 150). Recommended: one consistent rule.
  - **B:** only the hot tables (students, enrollments, receipts, groups, teachers, profiles). A smaller diff, but an inconsistent pattern.
  - **Blocking:** yes.

## IMPLEMENTATION CONTRACT

- **Prerequisites:**
  - owner approval of this revision and D1/D2;
  - the latest migration rechecked on `origin/main` (114 may be allocated first; renumber if needed);
  - the generator run against a database at the latest ledger.
- **Invariants:**
  - expressions are semantically unchanged by construction;
  - policy metadata is unchanged;
  - no function, grant or data change;
  - no policy consolidation.
- **Stop conditions:**
  - any equivalence difference (text, read or write);
  - any policy whose rewrite is not purely mechanical;
  - any need to alter a helper function.
- **Status reporting:** per [AGENTS](../../../AGENTS.md#implementation-handoff); Tier 3 independent review of the exact head SHA; separate release approval.
