# RCC-A1 Production release — 2026-10-07

Release record for [RCC-A1](../plans/completed/rcc-r1-receptionist-crm-completion.md#rcc-a1--outcome-led-receptionist-crm) (Tier 3). It records what was released and observed; product rules live in [PRODUCT_RULES](../../ai/PRODUCT_RULES.md) and current state in [CURRENT_STATE](../../ai/CURRENT_STATE.md).

**State: MERGED / DEPLOYED / PRODUCTION VERIFIED WITH BOUNDED ACCEPTANCE.**

## Release identity

| Item | Value |
| --- | --- |
| PR | #108 `feature/rcc-a1` |
| Reviewed and approved head | `7444fdc5fa7155c57d36cef2605160b36b280fe4` |
| Base before release | `4cb0eb9d060c70dd69cf55a975d76b7cf6700e83` |
| Exact-head CI | Verify run `37563976680`, success on the full lane |
| Independent review | [Exact-SHA Tier-3 review](https://github.com/elforssa/english-hills-admin/pull/108#issuecomment-6030791433): READY FOR FINAL REVIEW, no blocking findings |
| Owner release approval | 2026-10-07, explicit, with migration-first order and the accepted limitations below |
| Merge | `8d5af40bc21177c582efe5df96d31ada8d7d9ff5` (merge commit; parents are the base and the reviewed head; tree identical to the reviewed head), merged with an exact-head guard at 2026-10-07T04:20:24Z |
| Vercel Production | `dpl_CBvNM7AzLrqR6frH3NQ8CZMrmNHU`, target production, READY, source `8d5af40bc21177c582efe5df96d31ada8d7d9ff5` on `main`, alias `admin.english-hills.com` |
| Supabase project | `hopcezradkhrixwwswxn` |

## Rollout order

The owner approved migration-first. The new frontend sends keys that the 110 database rejects (`channel`, the `considering` decision, `schedule_kind`, `due_preset`, note-free structured outcomes), while migration 111 keeps legacy payloads compatible. The existing frontend therefore stayed live while 111 was applied, and the PR was merged only after 111 was verified.

1. Pre-checks: PR head, base, mergeability and CI unchanged; ledger 001–110; 111 the only migration in the PR.
2. Migration 111 applied at 2026-10-07T04:19Z.
3. Merge at 04:20:24Z; Production deployment READY on the merge commit.

## Migration 111

- The exact repository SQL ran in one transaction, together with its ledger row. No later ledger normalization was needed.
- Ledger tail: `109 = crm_operational_scheduled_display`, `110 = crm_operational_row_staff_labels`, `111 = crm_rcc_a1_outcome_led_followup`.
- The stored statement's MD5 `78522f1ef86349cd6eccceb192d67e00` equals the reviewed file's.
- Schema: `crm_tasks.schedule_kind` and `followup_reason` added as nullable with no default, with the three expected check constraints. All 39 existing tasks keep NULL in both fields, so there was no backfill.
- Functions: 293 → 294 in `public`/`crm_security`. The only addition is private `crm_security.reminder_due`; only the seven definitions named in the plan changed. The 286 other function definitions, ACLs and security-definer flags are byte-for-byte identical to the pre-release baseline.
- Security: RLS policies (166), table grants (1118), RLS flags (68 tables) and triggers (160) have hashes identical to the baseline.
  - `reminder_due` is not executable by `anon`, `authenticated` or `service_role`, and `crm_security.command` is not executable by `authenticated`.
  - The three public RPCs keep their previous `authenticated` grants, and none is executable by `anon`.
- `crm_security.command` keeps the lifecycle barrier, the pre-identity keys, the pending-stop handoff and `search_path=pg_catalog, pg_temp`.
- No Postgres errors were logged after the apply.

## Bounded Production acceptance

The checks ran as the Production receptionist identity with the real `authenticated` role, inside a single transaction that always rolled back. They used synthetic lead data; no CRM table uses a sequence, so nothing persisted.

| Check | Result |
| --- | --- |
| `crm_list_open_tasks` | Returned rows that carry `schedule_kind` and `followup_reason`, with no email or phone fields |
| `crm_get_work_queue` (`all` assignees) | Today 2 rows, Overdue 25 rows, each carrying both new fields; lead projections carry no email or phone |
| Phone conversation result *En réflexion* with preset `in_2_days`, no note | Lead ENGAGED; one open callback, kind `reminder`, reason `considering` |
| WhatsApp *En réflexion* with preset `next_week` | Previous callback cancelled as "Conversation follow-up replaced"; one open WhatsApp follow-up, kind `reminder`, reason `considering` |
| Phone callback decision with preset `tomorrow` | WhatsApp follow-up cancelled the same way; one open callback, kind `reminder`, no reason |
| Agreed callback at 03:00 Casablanca (outside the calling window) | Rejected `22023`, not shifted |
| Preset combined with `appointment` | Rejected `22023` |
| Legacy payload (decision with note and explicit `due_at`, no new keys) | Accepted; the task has NULL `schedule_kind` |
| Direct `crm_tasks` read, or `reminder_due` call, as `authenticated` | Denied `42501` |
| Authenticated identity without a profile: decision and open-task read | Both denied `42501` |
| Lifecycle pending intents created by the probes | 0 |

The decision payload requires a phone conversation to complete a call task (`22023`). This is existing server behavior.

## Finance, conversion and lifecycle/Meta

- No finance or conversion RPC changed. Every function outside the seven RCC-A1 definitions is identical to the baseline, as are grants, policies and triggers.
- Row counts of leads, activities, receipts and enrollments were unchanged by the release.
- Lifecycle/Meta remains dormant and unchanged:
  - zero activation epochs, pending intents, eligibility checks, identity links, sharing stops, Meta sync runs and Meta objects;
  - one seeded provider contract, as before;
  - `crm-lifecycle-primary` cron inactive;
  - `crm-intake-primary` still active, and all 12 runs since 03:30Z succeeded.

## Runtime health

- `/` and `/crm/leads` redirect unauthenticated requests to `/login` (307), and `/login` returns 200.
- Vercel reported no error-level runtime logs for the deployment.
- Supabase Postgres logs showed no ERROR, FATAL or PANIC entries after the release.
- The security advisor reports only categories that existed before the release. `crm_tasks` remains RPC-only (RLS enabled, no policies), and the RCC-A1 RPCs keep their existing authenticated security-definer grants.
- Applying through the Supabase CLI created its standard short-lived `cli_login_postgres` login role, which expired at 04:24Z.

## Accepted limitations

The owner accepted these on 2026-10-07. They are release limitations, not defects to fix in RCC-A1.

1. Replacing open generic callback and WhatsApp follow-ups is guaranteed only for explicit conversation decisions (callback, considering or qualify through `crm_record_conversation_decision`), across channels.
   - Other task-creation paths keep their existing behavior and may add a second open generic follow-up: manual **Planifier**, a wrong-number follow-up, a next task created on completion or cancellation, and reopening a lead.
   - Broader "at most one generic follow-up from every creation path" consolidation is deferred and needs a separate owner decision.
2. A placement-preparation `confirm_placement_test` task as an internal reminder is enforced by the receptionist UI, not as a universal direct-RPC invariant. A direct RPC caller can store `appointment`.
3. Newly created center visits use appointment semantics. A legacy-compatible payload without `schedule_kind` still stores NULL.
4. No fresh authenticated receptionist browser walkthrough was performed during release verification. Browser acceptance remains the exact-SHA CI evidence for the reviewed head.

RCC-A2 and RCC-B1 remain **PLANNED / NOT YET APPROVED**. No other Production operation was performed.
