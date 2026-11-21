# ADR-018: One capability list for staff roles, written twice and kept identical by a test

## Status

**Accepted for implementation** (Maroine, 2026-11-21) with the [receptionist permissions plan](../plans/receptionist-permissions.md), revision RPW-r2 (RPW-r1 at `08881a1`, N1 = B, N2 = A). Not implemented, merged or released.

## Date

2026-11-20.

## Context

The [role permissions audit](../evidence/role-permissions-audit-2026-11-14.md) found the receptionist's rights written in four places that are kept in step by hand: the JS map `src/lib/roleAccess.mjs` (29 capabilities), the SQL map `operational_security.has_capability` (23 capabilities, other names), about 185 hard-coded role tests in pages, and ten receptionist-only database commands that duplicate admin commands. The two maps disagree (audit C3-1); fixes made on the admin path did not reach her twin path (C3-6, raw English errors in C1-2); and a page rule silently narrowed what the written security rule allowed (C3-3).

The owner's rule (2026-11-14) is that the receptionist can do everything the admin can do except destructive actions and finance. That moves her close to admin parity, so the number of exceptions becomes small while the number of allowed actions becomes large.

## Decision

1. **One capability list, two copies with the same names.** `src/lib/roleAccess.mjs` (pages, menu, routes) and `operational_security.has_capability` (SQL) carry the same capability names and the same role lists for every staff capability. A test reads both and fails CI when a name or a role list differs.
2. **Staff pages and shared commands ask for a capability, not a role.** A page tests `hasCapability(role, '<name>')`; a shared SQL command calls `operational_security.require_capability('<name>')` instead of `get_my_role() in ('director','admin')`. Receptionist-only page branches are removed where her access becomes the admin's.
3. **Routes stay an allowlist.** A new admin page stays closed to the receptionist until it is listed. A new SQL function executable by `authenticated` must be classified (open to reception or locked) in a test fixture; an unclassified function fails CI.
4. **Write-guarded tables keep definer commands.** Where a table has columns she must not write (`students` archive mark, `teachers` pay fields, `groups`), she keeps a definer command with a fail-closed key allowlist; the page uses the admin form and picks the transport by capability.
5. **The online module and the teacher portal are recorded, not redesigned.** Their gates (`online_security.require_role(...)` arrays and the online capabilities in `roleAccess.mjs`) are copied into the list exactly as they are, and a test pins them to today's values. Changing them is a separate decision.

## Consequences

- A fix on the admin path reaches the receptionist, because it is the same path.
- Opening or closing a right is a change to the list plus its test, reviewed in one place.
- The main risk moves: a future admin feature built on an existing capability opens to her by default. The route allowlist and the function classification test are the two guards against that.
- The receptionist-only commands that become unused are revoked in the same release, after a compatibility window for open browser tabs.
