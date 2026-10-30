# ADR-014: One centre clock with a fixed offset

## Status

**Accepted for implementation** (Maroine, 2026-10-29 about 11:10 Asia/Shanghai) as decision D-TZ = A of the [audit follow-ups plan](../plans/audit-follow-ups.md), revision AFU-r1 at head `d02a305`. **Implementation:** migration `125_audit_follow_ups.sql` and `src/lib/centreClock.mjs` (PR #175). **Live since 2026-10-30:** 125 was applied in Production at 05:01 UTC and the application deployed at 05:17 UTC ([release record](../plans/audit-follow-ups.md#release-record-r0r3)). [CURRENT_STATE](../../ai/CURRENT_STATE.md) owns release evidence.

## Date

2026-10-29.

## Context

Morocco has been on plain UTC+0 since 2026-09-20 (tzdata 2026c). Production PostgreSQL resolves `Africa/Casablanca` to UTC+01:00, as do browsers and Node builds with older ICU data; newer local stacks resolve it to UTC+00:00. Until this decision the database and the browser asked their own time-zone tables, so:

- the database's "today" (receipt year, payment window, reports) turned at 23:00 Moroccan time;
- CRM calling windows and callback times were read one hour off;
- two browsers could disagree about the date.

The centre controls neither the database's nor the browsers' time-zone data.

## Decision

1. **One centre clock, a fixed offset, defined twice and nowhere else:**
   - `public.centre_utc_offset()` (an `interval`, today `0 hours`) in the database;
   - `CENTRE_UTC_OFFSET_MINUTES` (today `0`) in `src/lib/centreClock.mjs`.

   Each names the other. Changing the centre's clock is one migration plus one constant.
2. **No time computation reads a zone name for Casablanca.**
   - In the database, `AT TIME ZONE public.centre_utc_offset()` replaces `AT TIME ZONE 'Africa/Casablanca'` and the CRM policy `timezone` column. An `interval` uses the ISO sign (east positive); a text offset such as `'+01:00'` would be read with the POSIX sign and is never used.
   - In the browser, `centreClock` shifts the instant by the offset and reads it with the UTC getters, or formats it with `timeZone: 'UTC'`.
3. **`public.business_date()` is the centre date of an instant.** Every "today", day boundary and school year derives from it or from `centreClock`.
4. **Kept on purpose:**
   - **The Meta ad account's own time zone.** Insights spend days and the cohort report follow Meta's account setting.
   - **The `crm_tasks.timezone` and `crm_followup_policies.timezone` columns and their checks.** They stay as stored labels.
   - **The consumed Batch D clean-up function `egc_cleanup_c1`.**
5. **A repository test and a catalog test fail on any new use of the zone name** outside that list.

## Alternatives considered

- **Keep the zone name and wait for the time-zone data to update** (D-TZ = B). Rejected: neither Supabase's PostgreSQL nor staff browsers are under the centre's control, and the mismatch stays until they update.
- **A director-editable offset in a settings table** (D-TZ = C). Rejected: changing it mid-day would move receipt years, payment windows and report days, and it adds a security-relevant setting for a rare event.

## Consequences

- **Dates.** Every date outcome is identical except between 23:00 and 24:00 Moroccan time, where the database said "tomorrow". Affected outcomes:
  - receipt-number year;
  - payment-date window;
  - overdue status;
  - reports;
  - dashboard month.
- **Times of day are read at UTC+0:**
  - CRM calling windows;
  - callback validation;
  - scheduled labels;
  - online lesson times.

  This is one hour from the database's previous reading, and correct. Stored task instants never change (D-TZ-2 = A).
- **Historical instants between 23:00 and 24:00 UTC** before 2026-09-20 now fall on the UTC date in report buckets. Their stored dates (`payment_date`, receipt numbers) never change.
- **A future change of Morocco's clock** is a deliberate migration and release, not a silent tzdata update.
