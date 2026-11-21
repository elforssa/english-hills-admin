# Receptionist workflow — R0 read-only queries (T-R0 and Production R0)

**Status: T-R0 done locally on 2026-11-21. Production R0 NOT RUN.** It needs the owner's separate approval (« approve R0 read-only », [plan §10](../plans/receptionist-workflow.md#10-migration-and-data-plan)). Every Production result slot below is empty.

- **Plan:** [RWR-r5](../plans/receptionist-workflow.md), approved 2026-11-21 at `824252a` (architecture only); OD-3 hours recorded in #206 (merged at `811dca9`).
- **Queries:** Q01–Q30 as defined in [audit §7](receptionist-workflow-audit-2026-11-21.md#7-read-only-production-queries), one file each in [`supabase/manual/rwr_r0/`](../../../supabase/manual/rwr_r0). Each file is a comment header followed by the audit's SQL **byte for byte** (checked by script against the audit on 2026-11-21). No query was changed.
- **Runner:** [`run_local.sh`](../../../supabase/manual/rwr_r0/run_local.sh), local databases only (it refuses any URL that isn't `127.0.0.1` or `localhost`).
- **Synthetic fixture:** [`local_fixture.sql`](../../../supabase/manual/rwr_r0/local_fixture.sql), local only (it refuses to run without a session flag the runner sets, or on a database that already holds CRM, policy or student rows).
- **Output rules** (audit §7): counts, codes, short hashes and ids only, never names, phones, phone fragments or free text. Every returned row must show `read_only = on`.

## 1. T-R0 — local validation (2026-11-21)

| Item | Value |
| --- | --- |
| Source | `origin/main` `811dca91d18a63a8349cc663751eab3257f12f3c` |
| Database | private local Supabase stack, database only, clean `supabase db reset --local --no-seed`; Postgres 17.11; Supabase CLI 2.121.0 |
| Migration ceiling | 130 (ledger: 130 rows, 001–130), the ceiling of `main`. PR #204 (131–135) is not merged |
| Transport | each file sent as **one** multi-statement request (`psql -c`), as the Management API does, so its leading `set transaction read only;` governs the query |
| Run 1 | empty build: all 30 ran without error, each returned one row with `read_only = on` (« nothing found » rows) |
| Run 2 | synthetic fixture (12 prospects, 11 students, 13 contacts; every shape below): all 30 returned the expected counts, every row `read_only = on` |
| Negative control | `set transaction read only;` followed by a write, sent the same way: refused « cannot execute … in a read-only transaction » |
| Q23 parameter | the fixture's lead L2 (`…000000000202`) |

### Local results on the synthetic fixture

Ids are the fixture's synthetic ids `00000000-0000-4000-8000-<12 digits>`; « L2 » means `…000000000202`, « S1 » `…000000000601`, « T5 » `…000000000505`, « K4 » task `…000000000304`. « Expected » is what the fixture was built to produce; every result matched it.

| Q | What the fixture places | Local result (= expected) |
| --- | --- | --- |
| Q01 | one policy, version 1 | 1 row: version 1, Mon–Fri 09:00–19:00, Sat 09:00–13:00, `date_exceptions` `[]`, offsets `{0,1,2,4,7}`, gap 180 |
| Q02 | 12 leads, L12 merged | CONTACTING 2 leads / 3 open / 2 overdue; CONVERTED 1/0/0; ENGAGED 2/2/0; LOST 1/1/0; NEW 1/1/0; QUALIFIED 4/4/0 |
| Q03 | two overdue actions on L2 | `callback` appointment manual, not at a window opening: 1; `contact_attempt` (none) attempt_sequence, at the 09:00 opening: 1 |
| Q04 | L2 (3), L3 (2), L6 (2) | leads 3, tasks 7, sample L2, L3, L6 |
| Q05 | active leads L1–L9 | 0 actions: 3; 1: 3; 2: 2; 3: 1 |
| Q06 | L3: two callbacks, same type and time (09:00) | leads 1, groups 1, at window opening 1, sample L3 |
| Q07 | L10 LOST with action and test; L11 CONVERTED clean; L12 merged with action | CONVERTED 0/0; LOST 1/1 (L10); MERGED 1/0 (L12) |
| Q08 | L4: visit 10:00 and its test 10:30 | 1 overlapping pair (visit K7) |
| Q09 | K4 WhatsApp follow-up at 21:00; T5 test at 20:00 | `whatsapp_followup` 1 (K4); `placement_test` 1 (T5) |
| Q10 | one of each case | test result in the future 1; callback done before due 1; future attendance 1; planned test with a level 1 |
| Q11 | students S1–S6; contacts incl. one placeholder, one unnormalisable | students: empty 5, E.164 1, no « + » 1, no leading 0 1, placeholder 1, unnormalisable 2; contacts: empty 1, E.164 11, placeholder 1, unnormalisable 1 |
| Q12 | L1's contact shares S1's number; L3 and L4 share one contact (siblings) | keys shared 1, people 2 (the siblings are not counted) |
| Q13 | the same note twice 30 s apart on L2 | pairs 1, sample L2 |
| Q14 | 11 open actions of active-status leads (incl. merged L12) | unassigned 6, unowned leads 2, open 11 |
| Q15 | L11 converted as Yearly, enrollment Adults | no programme 0, mismatch 1 (L11) |
| Q16 | S1: unlinked commitment + linked charge, same programme and year | learners 1 (S1) |
| Q17 | S1: two live receipts, same day and amount (+ one voided) | groups 1, receipts 2 (S1) |
| Q18 | L2: 2 reschedules + 1 cancellation | leads 1 (L2) |
| Q19 | one callback completed before its time | `callback` 1 |
| Q20 | L7, L8 created 20 days ago, no status change | CONTACTING 1 (L8); ENGAGED 1 (L7) |
| Q21 | | enrolled without lead 3; tests with neither 1; student-only tests 1 |
| Q22 | G1 open with no teacher; G2 closed | Yearly 1 (G1) |
| Q23 | L2 | 5 rows (event types, hashes; empty body hash `d41d8cd9`) |
| Q24 | one test student, contact, lead, group; receipts 00459–00461 | 7 rows; 00461 `voided=true` |
| Q25 | | 11 rows of codes, 8-character hashes and counts; student referral returns its five-value code (a validated check constraint, not free text) |
| Q26 | L6: two open visits | leads 1 (L6) |
| Q27 | director and admin named, receptionist unnamed | receptionist 1 of 1 unnamed |
| Q28 | « Fixture Sara Alami » / « alami sara fixture » | groups 1 |
| Q29 | planned tests of L5 (beside a callback) and L9 (no action); L4's test is linked to its visit | tests 2 (L5, L9) |
| Q30 | L7 five failures, L8 nothing, L9 planned test | five_failures 1; other 1; planned_test 1 |

### Observations from T-R0 (flagged, not changed)

The queries stay exactly as the audit defines them; these notes are for whoever reads the Production numbers.

- **O1 — Q11 categories overlap.** A student number stored as `212…` without « + » is counted both as « no + » and as unnormalisable, because `crm_security.normalize_phone` returns NULL for it (checked on the fixture: of its two unnormalisable students, one is the « no + » number and one is plain text; the placeholder number normalises). So Production's unnormalisable count includes every « no + » number, and the columns must not be added together. D3 normalises « no + » numbers on purpose (plan §10).
- **O2 — Q03 and Q14 include merged prospects.** They filter on status only, and a merged prospect keeps its status, so its open actions are counted (the fixture's L12 is in Q14's 11). Q02, Q05, Q12, Q20, Q29 and Q30 exclude merged prospects; Q07 reports them separately as MERGED. Read Q03 and Q14 with Q07's MERGED row.
- **O3 — Q09's placement branch covers closed prospects** (no status filter); a LOST prospect's test outside hours would be counted there too. Q07 shows how many closed prospects still hold a planned test.
- **O4 — `centre_utc_offset()` is `00:00` at the ceiling,** so Q06, Q08 and Q09 read times in UTC. The fixture uses UTC times; Production numbers depend on the same function.
- **O5 — Ceiling.** This run is at 130 (`main`). The audit's earlier check ran at 135 (with PR #204). Audit §7 already requires the operator to re-run T-R0 on R0 day at **Production's latest applied migration**.

## 2. Production R0 procedure (not authorized yet)

Only after the owner's « approve R0 read-only »:

1. Read Production's latest applied migration from its ledger (read-only, under the same approval).
2. Re-run T-R0 on a clean local build at that ceiling: `supabase/manual/rwr_r0/run_local.sh --seed <local-db-url> 00000000-0000-4000-8000-000000000202`. Every line must say `ok`. If the ceiling has moved past 130 and a query fails, stop and report; do not edit a query on R0 day.
3. Run each file once against Production, one file per call, from the main checkout: `supabase db query --linked --project-ref <ref> -f supabase/manual/rwr_r0/<file>`. It returns only the last statement's rows.
4. Check every returned row shows `read_only = on`; a single row with empty columns means « nothing found ».
5. Paste each output into its slot below. Q23 runs once per lead id from Q04 and Q06; its output stays **outside** the repository (audit §7): record only the lead count and the row count per lead.
6. Check every pasted value is a count, code, hash or id before committing; no name, phone, phone fragment or free text.

## 3. Production results (empty)

Date, operator, Production ledger ceiling and the local T-R0 re-run (ceiling, result) are recorded here on R0 day.

| Item | Value |
| --- | --- |
| R0 approval | — |
| Date and time (UTC) | — |
| Production ledger ceiling | — |
| Local T-R0 re-run at that ceiling | — |
| Operator | — |

#### Q01 — live follow-up policies

```text
(not run)
```

#### Q02 — open actions overview

```text
(not run)
```

#### Q03 — overdue tasks by what created them

```text
(not run)
```

#### Q04 — prospects with more than one open action

```text
(not run)
```

#### Q05 — distribution and active-lead check

```text
(not run)
```

#### Q06 — exact duplicate open actions

```text
(not run)
```

#### Q07 — closed, converted or merged prospects with open actions or planned tests

```text
(not run)
```

#### Q08 — overlapping appointments or tests per person

```text
(not run)
```

#### Q09 — open items outside hours

```text
(not run)
```

#### Q10 — results, « Passé » or « done » in the future

```text
(not run)
```

#### Q11 — phone quality

```text
(not run)
```

#### Q12 — shared normalised phone between active people

```text
(not run)
```

#### Q13 — the same note text twice within a minute

```text
(not run)
```

#### Q14 — unowned work

```text
(not run)
```

#### Q15 — converted leads' programme vs enrollment

```text
(not run)
```

#### Q16 — unlinked commitment and linked charge for the same programme and year

```text
(not run)
```

#### Q17 — same learner, same amount, same day

```text
(not run)
```

#### Q18 — prospects rescheduled or replaced 3+ times

```text
(not run)
```

#### Q19 — actions done before their due time

```text
(not run)
```

#### Q20 — prospects stuck in a stage over 14 days

```text
(not run)
```

#### Q21 — students with no CRM prospect; tests linked to nobody

```text
(not run)
```

#### Q22 — groups without a teacher

```text
(not run)
```

#### Q23 — replay one prospect's history

Output stays outside the repository. Record: number of leads replayed, rows per lead.

```text
(not run)
```

#### Q24 — test data inventory

```text
(not run)
```

#### Q25 — free-text programmes and sources

```text
(not run)
```

#### Q26 — appointments and visits per prospect

```text
(not run)
```

#### Q27 — staff accounts without a name

```text
(not run)
```

#### Q28 — student duplicates

```text
(not run)
```

#### Q29 — planned tests of active prospects without their appointment

```text
(not run)
```

#### Q30 — active prospects with no open action, by D1 rule

```text
(not run)
```
