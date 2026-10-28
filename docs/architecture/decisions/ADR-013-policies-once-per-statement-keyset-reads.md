# ADR-013: Policies evaluate the caller once per statement; list reads are keyset

## Status

**Proposed** (2026-10-28) with the [speed-as-the-centre-grows plan](../plans/speed-as-the-centre-grows.md), revision SCG-r1. The owner approved the plan for implementation on 2026-10-28 at head `649056f` (D1 = A, D2 = A, D3 = B, D4 = A; [approval record](../plans/speed-as-the-centre-grows.md#approval-record)). **Implementation:** migration `124_speed_as_the_centre_grows.sql` (number taken at merge) on branch `feat/speed-as-the-centre-grows`; not merged, not applied in Production. The status stays Proposed until release closeout; [CURRENT_STATE](../../ai/CURRENT_STATE.md) owns implementation evidence once it exists.

## Date

2026-10-28.

## Context

The role helpers (`get_my_role()`, `get_my_teacher_id()`, `get_my_email()`, `auth.uid()`) are SECURITY DEFINER or opaque to the planner. Written bare in a policy, they run once per row, per policy. The per-row teacher helper `teacher_can_access_student_group(…)` returns false for every non-teacher, but only after a function call on every row a director, admin or receptionist reads. At ledger 123, the students list and staff reads of grades cost time proportional to the whole school even for a 20-row page. Separately, the browser read whole tables by offset with an exact count, and aborted when another user's insert changed the count.

## Decision

1. **Policy expressions call a zero-argument role helper only as `( SELECT f() AS f)`**, an InitPlan evaluated once per statement. Every public policy follows this; migration 124 rewrote them mechanically with `scripts/generate-rls-role-evaluation.mjs`, which is kept for future rewrites.
2. **A per-row helper that only grants a single role is guarded by that role first**, also wrapped. For example: `((( SELECT get_my_role() AS get_my_role) = 'teacher'::text) AND teacher_can_access_student_group(…))`.
3. **A rewrite never changes who sees or writes what.** A policy keeps its name, table, command, roles and kind. Equivalence is proven by a before/after read, write and function-output comparison over every identity, not argued.
4. **A read model that only shapes rows the caller may already read is SECURITY INVOKER**, with `search_path = pg_catalog, pg_temp` and execute granted to `authenticated` only. RLS stays the single authority.
5. **The browser reads lists in pages it asks for**, or, where a full read remains, by keyset on (order column, `id`) in the database's own order, with no exact count. A concurrent write never aborts a read.

## Alternatives considered

- **Merge permissive policies** (the advisor's warnings). Rejected for now: merging changes how policies combine, and that is a real authorization risk.
- **A set-based teacher helper.** Deferred; the teacher path stays per-row and correct.
- **Wrap only the hot tables.** Rejected by the owner (D2 = A): one rule everywhere.
- **Fetch by `id`, sort in the browser.** Rejected in implementation: browser collation differs from the database's ICU/libc collation, so name order would change.

## Consequences

- A new policy that calls a role helper bare is a regression. A reviewer checks it, and the upgrade test asserts that no public policy calls one per row.
- A future policy change regenerates from the latest catalog and re-proves equivalence.
- The restore script `scripts/rollback/124_speed_as_the_centre_grows_restore.sql` returns the 123 expressions.
- `paginateAll` remains only for the large-data regression script; application code uses `src/lib/keysetRead.mjs`.
