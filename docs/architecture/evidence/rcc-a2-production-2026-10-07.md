# RCC-A2 Production release — 2026-10-07

Release record for [RCC-A2](../plans/completed/rcc-a2-enrollment-ux-hardening.md) (Tier 3), a child of [RCC-r1](../plans/rcc-r1-receptionist-crm-completion.md#rcc-a2--enrollment-ux-hardening). It records what was released and observed; product rules live in [PRODUCT_RULES](../../ai/PRODUCT_RULES.md) and current state in [CURRENT_STATE](../../ai/CURRENT_STATE.md). Times are UTC.

**State: MERGED / DEPLOYED / PRODUCTION VERIFIED WITH BOUNDED ACCEPTANCE.**

## Release identity

| Item | Value |
| --- | --- |
| PR | #112 `feature/rcc-a2` |
| Reviewed and approved head | `b213e93408ccca2514a48bd9c68d483f8ee46999` |
| Base before release | `6dae2346e4dcbed2faab87429cdf5f57d83c63d0` |
| Exact-head CI | Verify run `37597093696`, success |
| Independent review | Exact-SHA implementation re-review of `b213e93…`: READY FOR FINAL REVIEW. Source: the owner's release approval; the verdict is not posted on PR #112. |
| Owner release approval | 2026-10-07, explicit, Tier 3, migration-first, bounded to RCC-A2 |
| Merge | `79b08359363abd2e83c842c7360b14fadce88dea` (merge commit; parents are the base and the reviewed head; tree identical to the reviewed head), merged with an exact-head guard at 2026-10-07T10:25:43Z |
| Vercel Production | `dpl_6NEt396vjcKG53c6WEHgKQoGp4Ho`, target production, READY at 10:27:25Z, source `79b08359363abd2e83c842c7360b14fadce88dea` on `main`, alias `admin.english-hills.com` |
| Previous Production deployment | `dpl_GRUc5snGnD9fSau1oCBvkgZ38Ws2`, source `6dae234…` (frontend recovery target) |
| Supabase project | `hopcezradkhrixwwswxn` |

## Rollout order

The owner approved migration-first. The old frontend is fully compatible with migration 112: SQLSTATEs and messages are unchanged, and it ignores the new `hint`, `linked_student` and `enrollment_followup` fields.

1. Pre-checks, all matching: PR head and base unchanged; PR mergeable and clean; Verify green on the exact head; Production deployment on `6dae234…` (equal to main); ledger 001–111 ending at `111 = crm_rcc_a1_outcome_led_followup`; 112 the only new migration, on no other remote branch.
2. Migration 112 applied at 2026-10-07T10:24:14–10:24:19Z.
3. Merge at 10:25:43Z; Production deployment READY on the merge commit at 10:27:25Z.

## Migration 112

- The exact reviewed SQL ran in one transaction. Its ledger row was inserted inside the same transaction, before the file's own `commit`, as for 111. No ledger normalization was needed.
- Ledger: 112 rows, versions 001–112. The tail is `111 = crm_rcc_a1_outcome_led_followup`, `112 = crm_rcc_a2_enrollment_ux`.
- The stored statement is one element of 18,312 bytes. Its MD5 `213c9a435b93a2fa267b8e0072a95caa` equals the reviewed file's.
- Functions: 294 in `public`/`crm_security` before and after. Only these two definitions changed:
  - `public.crm_start_enrollment(uuid,jsonb)`: `abad7807…` → `ef35bb42…`
  - `public.crm_get_enrollment_context(uuid)`: `ebbcf9fa…` → `99afda60…`
- Each deployed body (`prosrc`) is byte-identical to the reviewed file's.
- Properties of both functions are unchanged: SECURITY DEFINER, `search_path=pg_catalog, pg_temp`, EXECUTE for `authenticated` only.
- The other 292 definitions and all property/ACL fingerprints are byte-for-byte identical to the pre-release baseline. Guarded functions confirmed unchanged:
  - `crm_security.command`
  - `crm_security.new_task`
  - `crm_security.next_window`
  - `crm_security.evaluate_conversion`
  - `public.create_charge_payment`
  - `crm_security.lock_enrollment_intent`
- Unchanged hashes, compared before and after:
  - RLS policies (166), RLS flags (68 tables), triggers (160);
  - table grants (1491 rows), column grants, routine grants, schema and default ACLs;
  - columns, constraints, indexes, relations and roles;
  - functions outside `public`/`crm_security`, and the cron job definitions.
- The fingerprints were rechecked after acceptance and were still unchanged.
- The migration wrote no rows: no table, trigger, policy or grant changed.

## Time zone (owner-authorized configuration reads)

| Item | Observed at 10:23Z |
| --- | --- |
| PostgreSQL `TimeZone` | `UTC` (source: configuration file; boot value `GMT`) |
| Effective `Africa/Casablanca` | UTC+01:00, `is_dst` false, abbreviation `+01` (PostgreSQL 17.6 tz data) |
| `current_date` vs Casablanca civil date | Both `2026-10-07` |

**Comparison with the reviewed contract:**

- With the session in UTC and Casablanca at +01:00, the Casablanca civil date equals the UTC date except from 23:00 to 24:00 UTC. In that hour it is one day later.
- So `crm_start_enrollment` now accepts, during that hour only, a new learner's birth date equal to the Casablanca date that the old `current_date` check rejected.
- This is the documented, reviewed change: it matches the browser bound and the adopted Casablanca civil contract. The behavior is safe and not materially different from the contract.
- PostgreSQL's +01:00 agrees with current Morocco rules. The CI Node 22 tz-data divergence recorded during implementation concerned the test runtime, not the server.

## Bounded Production acceptance

The checks ran in one transaction whose final statement always raises, so the whole transaction rolled back.

- **Identities:** seven synthetic identities (director, admin, receptionist, teacher, parent, student, pending), created inside the transaction, called the RPCs with the real `authenticated` role.
- **Data:** synthetic leads and learners only. A guard aborted the run if any synthetic phone, name or identity collided with an existing record; none did.
- **Result:** 41 checks, 41 passed.
- **No residue:** afterwards no synthetic user, student, lead or contact existed. No CRM, enrollment or student table uses a sequence.

| Check | Result |
| --- | --- |
| Birth date = Casablanca today + 1 | `22023` *Invalid new learner*, hint `crm_enrollment.birth_date_future` |
| Explicit follow-up 30 days in the past | `22023` *Valid future task required*, hint `crm_enrollment.followup_in_past` |
| Unknown program; Confirmed initial status; unqualified lead | Historical SQLSTATE/message with `program_invalid`, `initial_status_not_permitted` (`42501`) and `lead_not_qualified` |
| Every observed hint | Matches `^crm_enrollment\.[a-z_]+$`; no data, SQL or internal text |
| Receptionist pre-enrollment, new learner, birth date = Casablanca today | Enrollment Submitted; opportunity stays QUALIFIED, linked and not converted; no conversion activity |
| Follow-up after initiation | One open `enrollment_followup` at `next_window(policy, now + 1 day)` |
| Initiation result | `enrollment_followup` = `{id, created: true, local_date, local_time}` |
| Second start on the now-linked lead | `lead_already_enrolled` |
| `linked_student` as receptionist, admin and director | Active learner: `{id, name, birth_date, available: true}`. Unlinked lead: `null`. Archived learner: `{id, available: false}`, with no name or birth date |
| New learner on a linked lead / archived linked learner | `learner_already_linked` / `linked_learner_unavailable`; nothing written |
| Linked path | Enrolls the linked learner; QUALIFIED |
| Teacher, parent, student and pending: start and context read | `42501` *CRM access denied*, no hint |
| `anon`: start and context read | `42501` |
| Director and admin initiation | Do not convert |
| Linking an existing Confirmed enrollment | Converts through the trusted path as before; `enrollment_followup` is `null` |
| Charges, receipts, financial events, lifecycle intents and activation epochs, external deliveries and attempts, Meta sync runs | Counts unchanged within the probe transaction |

No fresh authenticated browser walkthrough was performed. Browser acceptance remains the exact-head CI evidence.

## Finance, conversion and lifecycle/Meta

- No finance or conversion function changed. `create_charge_payment`, `evaluate_conversion` and `lock_enrollment_intent` are byte-identical, as are all grants, policies and triggers.
- Lead, enrollment, student, task and activity row counts were the same before the migration and after acceptance.
- Lifecycle/Meta remains dormant and unchanged:
  - zero activation epochs, pending intents, eligibility checks, identity links, sharing stops, retry audits, Meta sync runs and Meta objects;
  - one seeded provider contract, as before;
  - `crm-lifecycle-primary` cron inactive, with zero runs in the previous 24 hours.

## Runtime health

- `crm-intake-primary` is active. All 24 runs in the two hours before the release succeeded, and the 10:30 run after it succeeded.
- `/` and `/crm/leads` redirect unauthenticated requests to `/login` (307), and `/login` returns 200.
- Vercel reported no error-level Production runtime logs in the 20 minutes after the deployment.
- Postgres ERROR entries since the apply all come from this operator session: three rejected snapshot queries, two aborted probe attempts that rolled back, and the intentional probe-result exception.
  - The two aborted probe attempts failed before any write commit (a wrong guard column; a harness insert under the `authenticated` role).
  - Two `supabase_admin` password-authentication failures at 07:43Z predate the release and are outside its scope.
- The security advisor shows only its long-standing categories. The A2 RPCs appear only under the expected `authenticated` SECURITY DEFINER category, and their grants are unchanged.
- Querying through the Supabase CLI uses its standard short-lived `cli_login_postgres` login role.

## Known limitations and deferred items

1. **Browser `casablancaInstant` tz data (pre-existing, outside RCC-A2):** CRM wall-clock inputs are converted with the browser's time-zone data. A browser with stale Morocco rules can shift entered times by an hour relative to the server's civil projection. Near Casablanca midnight, the dialog's birth-date `max` and follow-up `min` follow the browser's tz data while the server's civil date stays authoritative. Deferred reliability item in the [RCC-r1 backlog](../plans/rcc-r1-receptionist-crm-completion.md#deferred-crm-reliability-backlog).
2. **Birth-date rule scope:** the Casablanca birth-date rule covers enrollment initiation only. Manual lead creation keeps `current_date` (session UTC), which is the owner-accepted B2 divergence.
3. **Nouvelle pré-inscription:** unchanged; its duplicate risk remains (no D8).
4. **Follow-up consolidation:** broader generic callback/WhatsApp consolidation is still deferred (D6).
5. **Review record:** the independent re-review verdict is recorded from the owner's approval, not from a PR comment.

RCC-r1 is **not** complete: RCC-B1 remains **PLANNED / NOT YET APPROVED**. No other Production operation was performed.
