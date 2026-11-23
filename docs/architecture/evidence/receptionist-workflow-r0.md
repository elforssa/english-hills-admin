# Receptionist workflow — R0 read-only queries (T-R0 and Production R0)

**Status: T-R0 done locally and Production R0 run read-only on 2026-11-21** (22:18 UTC), after the owner's approval (« Approve R0 », 2026-11-21, [plan §10](../plans/receptionist-workflow.md#10-migration-and-data-plan)). Every returned row showed `read_only = on`; nothing was written. Results are in §3, findings in §4.

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

## 2. Production R0 procedure (as run on 2026-11-21)

Run after the owner's approval:

1. Read Production's latest applied migration from its ledger (read-only, under the same approval).
2. Re-run T-R0 on a clean local build at that ceiling: `supabase/manual/rwr_r0/run_local.sh --seed <local-db-url> 00000000-0000-4000-8000-000000000202`. Every line must say `ok`. If the ceiling has moved past 130 and a query fails, stop and report; do not edit a query on R0 day.
3. Run each file once against Production, one file per call, from the main checkout: `supabase db query --linked --project-ref <ref> -f supabase/manual/rwr_r0/<file>`. It returns only the last statement's rows.
4. Check every returned row shows `read_only = on`; a single row with empty columns means « nothing found ».
5. Paste each output into its slot below. Q23 runs once per lead id from Q04 and Q06; its output stays **outside** the repository (audit §7): record only the lead count and the row count per lead.
6. Check every pasted value is a count, code, hash or id before committing; no name, phone, phone fragment or free text.

## 3. Production results

| Item | Value |
| --- | --- |
| R0 approval | owner, in chat to the A1 implementation session, 2026-11-21: « Approve R0 » (in answer to « Approve R0 read-only on Production? ») |
| Date and time (UTC) | 2026-11-21, 22:18:07–22:18:38 (Q01–Q30 except Q23), Q23 right after |
| Production ledger ceiling | 130 (130 rows), read with a `set transaction read only;` file under the same approval |
| Local T-R0 re-run at that ceiling | 2026-11-21 22:17 UTC, clean reset at 130, files at `5eb38b1b`: 31/31 `ok` (30 queries + negative control) |
| Transport | `supabase db query --linked --project-ref <ref> --output-format json -f <file>`, one file per call, from the main checkout (CLI 2.121.0, its standard short-lived login role) |
| Operator | the A1 implementation session (Claude Code) |

Each slot lists the returned rows as `column=value`; `null` is SQL NULL. Ids are Production row ids only.

#### Q01 — live follow-up policies

```text
read_only=on  version=1  weekly_hours={"1":[["15:00","20:00"]],"2":[["10:00","12:30"],["15:20","20:00"]],"3":[["10:00","12:30"],["15:20","20:00"]],"4":[["10:00","12:30"],["15:20","20:00"]],"5":[["10:00","12:30"],["15:20","20:00"]],"6":[["10:00","12:30"],["15:20","20:00"]],"7":[]}  date_exceptions=[]  attempt_offsets=[0,0,1,3,5]  minimum_attempt_gap_minutes=180  first_contact_sla_minutes=15  post_test_sla_minutes=120  effective_from=2026-09-25 03:56:21.20531+00  retired_at=null
```

#### Q02 — open actions overview

```text
read_only=on  status=CONTACTING  leads=58  open_tasks=41  overdue=41
read_only=on  status=CONVERTED  leads=3  open_tasks=0  overdue=0
read_only=on  status=ENGAGED  leads=44  open_tasks=43  overdue=24
read_only=on  status=LOST  leads=83  open_tasks=0  overdue=0
read_only=on  status=NEW  leads=4  open_tasks=4  overdue=2
read_only=on  status=NOT_QUALIFIED  leads=53  open_tasks=0  overdue=0
read_only=on  status=QUALIFIED  leads=52  open_tasks=78  overdue=65
```

#### Q03 — overdue tasks by what created them

```text
read_only=on  task_type=callback  schedule_kind=reminder  source_kind=manual  at_window_opening=True  n=34
read_only=on  task_type=center_visit  schedule_kind=appointment  source_kind=manual  at_window_opening=False  n=33
read_only=on  task_type=contact_attempt  schedule_kind=(none)  source_kind=attempt_sequence  at_window_opening=False  n=32
read_only=on  task_type=contact_attempt  schedule_kind=(none)  source_kind=attempt_sequence  at_window_opening=True  n=15
read_only=on  task_type=confirm_placement_test  schedule_kind=reminder  source_kind=manual  at_window_opening=False  n=5
read_only=on  task_type=confirm_placement_test  schedule_kind=reminder  source_kind=manual  at_window_opening=True  n=5
read_only=on  task_type=callback  schedule_kind=appointment  source_kind=manual  at_window_opening=False  n=3
read_only=on  task_type=callback  schedule_kind=reminder  source_kind=manual  at_window_opening=False  n=2
read_only=on  task_type=first_contact  schedule_kind=(none)  source_kind=intake  at_window_opening=False  n=2
read_only=on  task_type=callback  schedule_kind=appointment  source_kind=manual  at_window_opening=True  n=1
```

#### Q04 — prospects with more than one open action

```text
read_only=on  leads=19  tasks=45  sample=["213c392a-cc6d-4ab5-bedb-9373447cf951","df5398a6-0a57-4737-bea5-8a2fb16985c6","808a83cf-756b-4625-b7a7-438fb9e11968","076bee87-f812-4639-86f3-5f926e3799c5","113628c2-b088-4d02-952e-afc903a20b31"]
```

#### Q05 — distribution and active-lead check

```text
read_only=on  open_actions=0  leads=18
read_only=on  open_actions=1  leads=121
read_only=on  open_actions=2  leads=16
read_only=on  open_actions=3  leads=1
read_only=on  open_actions=5  leads=2
```

#### Q06 — exact duplicate open actions

```text
read_only=on  at_window_opening=7  groups=9  leads=9  sample=["076bee87-f812-4639-86f3-5f926e3799c5","113628c2-b088-4d02-952e-afc903a20b31","9e1c3d9f-a869-4d31-8551-1d04632c113e","ade97c5d-8bcd-41b6-a9ef-3e4cf19a6d79","c32d0505-8526-437d-8453-c13f069131a1"]
```

#### Q07 — closed, converted or merged prospects with open actions or planned tests

```text
read_only=on  state=CONVERTED  with_open_action=0  with_planned_test=0  sample=null
read_only=on  state=LOST  with_open_action=0  with_planned_test=0  sample=null
read_only=on  state=NOT_QUALIFIED  with_open_action=0  with_planned_test=0  sample=null
```

#### Q08 — overlapping appointments or tests per person

```text
read_only=on  overlapping_pairs=3  sample=["2afcc3e0-bdad-42b1-b28e-3ced06dc2af0","330f6a22-911a-4bd6-8544-27013802a7cd","5787cf48-8bcd-4394-b4af-f58b2c73dacf"]
```

#### Q09 — open items outside hours

```text
read_only=on  task_type=center_visit  n=2  sample=["5787cf48-8bcd-4394-b4af-f58b2c73dacf","be829a87-7a11-45d0-b17a-7925a3724af8"]
read_only=on  task_type=placement_test  n=0  sample=null
```

#### Q10 — results, « Passé » or « done » in the future

```text
read_only=on  k=test_result_future  n=3  s=["23bf2be5-c444-4bfd-bef9-93ea34f7361d","8c40b2d5-c8d9-4cd9-927a-e94d14b75c21","d3217f12-fb6f-41f6-b082-961ca16a714d"]
read_only=on  k=task_done_before_due  n=11  s=["51984aee-7194-428f-8d9a-18b11d530026","945cd93d-d0a4-40a4-bf60-cfe5f2b8b755","728b94e6-2bbd-4bab-a78c-4900971fd4bc","9e71f4cb-da45-4330-bcf2-382241067100","6086a95c-d39d-4b9e-8f79-e593b78a1255"]
read_only=on  k=attendance_future  n=1  s=["3175fde4-ccf7-4c6c-8ef5-e87e16785477"]
read_only=on  k=test_planned_with_level  n=0  s=null
```

#### Q11 — phone quality

```text
read_only=on  src=students  e164=7  empty=18  no_leading_zero=45  no_plus=46  placeholder=1  unnormalisable=47
read_only=on  src=crm_contacts  e164=275  empty=3  no_leading_zero=null  no_plus=null  placeholder=1  unnormalisable=19
```

#### Q12 — shared normalised phone between active people

```text
read_only=on  keys_shared=19  people=41  sample_ids=["0428674d-4d46-408d-b257-cee3a06d2c1c","0954e2ad-1200-4851-872b-b39ebefbb37b","0a583d8b-19ef-4c6c-95b2-2667482b832c","0f6b9d8f-eed6-4041-9a5e-2a05281db35b","107066ce-f5b5-40f9-bdab-6a2ec6226fd9"]
```

#### Q13 — the same note text twice within a minute

```text
read_only=on  pairs=513  sample=["73ed34cb-b7af-4f74-8a6e-747b24f05524","73ed34cb-b7af-4f74-8a6e-747b24f05524","488b273d-591c-45de-8316-ba912975a702","488b273d-591c-45de-8316-ba912975a702","488b273d-591c-45de-8316-ba912975a702"]
```

#### Q14 — unowned work

```text
read_only=on  open_tasks=166  unassigned_open_tasks=131  unowned_active_leads=102
```

#### Q15 — converted leads' programme vs enrollment

```text
read_only=on  mismatch=2  no_session_type=2  sample=["a6d13ee5-58ef-4fd4-ba21-80a2f1b3201b","1b127120-14b1-4dff-be23-2b402b8a0b79"]
```

#### Q16 — unlinked commitment and linked charge for the same programme and year

```text
read_only=on  learners=0  sample=null
```

#### Q17 — same learner, same amount, same day

```text
read_only=on  groups=4  receipts=8  sample=["90682cfa-24c2-4e2c-983f-7025972f7918","f0ac4976-d422-4e27-b919-0edda48dee6d","1ada9341-35f8-4ebc-af2b-9b05d63e11df","b390ab98-4059-4cd8-9d29-8350d531d01b"]
```

#### Q18 — prospects rescheduled or replaced 3+ times

```text
read_only=on  leads=22  sample=["9f464a86-cd78-44bc-87e7-50703df05eb9","f349f742-7425-4e8a-b9a5-062915cb04ad","72efd46f-58cf-4657-8888-02314f1a6273","0a5ea055-d754-49c1-bf30-86be8b104b6d","d2bab231-3ce3-4a95-97c2-926a2dd16840"]
```

#### Q19 — actions done before their due time

```text
read_only=on  task_type=first_contact  avg_early=08:17:15.162277  n=48
read_only=on  task_type=contact_attempt  avg_early=18:29:00.694364  n=19
read_only=on  task_type=callback  avg_early=1 day 28:37:36.791663  n=7
read_only=on  task_type=center_visit  avg_early=1 day 30:05:47.726084  n=4
read_only=on  task_type=confirm_placement_test  avg_early=2 days 02:07:32.280108  n=2
```

#### Q20 — prospects stuck in a stage over 14 days

```text
read_only=on  status=CONTACTING  n=15  sample=["dfbdde49-ae84-49e1-80d6-52aca92a530a","28ea7fa2-c785-4277-9ccf-9a1e74d6eab3","517b1f4b-a72b-421b-9d41-09c97d1cecea","a70cb0ae-6675-4dcc-9ba5-91654d073ccd","ce691aa1-aef1-4c6c-808a-13c807844ce7"]
read_only=on  status=ENGAGED  n=5  sample=["6890a2bd-11c5-4f46-8522-4948877f15b4","3cad3f45-ea66-41fa-b22a-bc197eff3678","aeb5ddc0-a110-46a6-854a-9f97c6afc537","5f285876-ee29-4126-97e1-9f390732aea1","631d4cb1-5c80-40e3-8363-e112128fe8ab"]
read_only=on  status=QUALIFIED  n=5  sample=["c32d0505-8526-437d-8453-c13f069131a1","213c392a-cc6d-4ab5-bedb-9373447cf951","b6aabd9c-97db-4a11-81a3-3bc4d5d67dfb","d78e766f-a825-46d8-a626-e87899ab6495","72efd46f-58cf-4657-8888-02314f1a6273"]
```

#### Q21 — students with no CRM prospect; tests linked to nobody

```text
read_only=on  k=enrolled_without_lead  n=107
read_only=on  k=tests_without_lead_or_student  n=1
read_only=on  k=tests_student_only  n=0
```

#### Q22 — groups without a teacher

```text
read_only=on  session_type=Yearly  n=8  sample=["2d03afe1-dcdb-4caf-b80c-e1dedbaee1a9","19ff511c-91ea-4b18-950d-3d6625def6fd","bae69053-c405-4589-9797-3b5e5f2ec2b1","cd72d501-b5fb-415d-9139-e6283ebee80c","763ac6c7-2632-413c-bb85-98c78f72ecc6"]
read_only=on  session_type=Online  n=1  sample=["b51b8a97-ebfa-49f6-b333-fd7715915ffc"]
```

#### Q23 — replay one prospect's history

Output stays outside the repository. Record: number of leads replayed, rows per lead.

```text
8 leads replayed (the distinct ids of the Q04 and Q06 samples); output kept outside the repository.
076bee87-f812-4639-86f3-5f926e3799c5  rows=13  read_only=on in every row
113628c2-b088-4d02-952e-afc903a20b31  rows=15  read_only=on in every row
213c392a-cc6d-4ab5-bedb-9373447cf951  rows=16  read_only=on in every row
808a83cf-756b-4625-b7a7-438fb9e11968  rows=11  read_only=on in every row
9e1c3d9f-a869-4d31-8551-1d04632c113e  rows=9  read_only=on in every row
ade97c5d-8bcd-41b6-a9ef-3e4cf19a6d79  rows=15  read_only=on in every row
c32d0505-8526-437d-8453-c13f069131a1  rows=15  read_only=on in every row
df5398a6-0a57-4737-bea5-8a2fb16985c6  rows=17  read_only=on in every row
```

#### Q24 — test data inventory

```text
read_only=on  k=student  id=f0ac4976-d422-4e27-b919-0edda48dee6d
read_only=on  k=student  id=104769ae-2e51-4c93-b774-a6d22535dabb
read_only=on  k=contact  id=1693bd81-befb-4a4b-b7d3-6665379a7670
read_only=on  k=contact  id=0fa5639c-a95e-4115-9ada-652efc46367e
read_only=on  k=contact  id=c8706514-49c5-46b3-8622-2bea6361c57a
read_only=on  k=contact  id=ab9f9a91-575a-46cf-a42d-344a38f87141
read_only=on  k=contact  id=3bdeaeeb-b6d3-4068-8439-f6542120a01c
read_only=on  k=contact  id=4ccdee96-7321-4c5d-98b3-b0f02f5c499e
read_only=on  k=contact  id=2b2e394d-9e7f-448a-a6d8-99c5c9d0f0ee
read_only=on  k=contact  id=c6bd971a-65f9-477e-9d83-f796ef85e18b
read_only=on  k=contact  id=9febfcbb-58d6-4a07-97c4-b3ae4da56424
read_only=on  k=lead  id=a6d13ee5-58ef-4fd4-ba21-80a2f1b3201b
read_only=on  k=lead  id=8d46bdbd-ac12-46c6-8f99-60c8f35d63ac
read_only=on  k=lead  id=3b172a41-2c27-4722-a8ce-2fd60abf8f7d
read_only=on  k=lead  id=1b127120-14b1-4dff-be23-2b402b8a0b79
read_only=on  k=lead  id=bf794516-36c8-42c9-92e7-a5f436461237
read_only=on  k=lead  id=88c210fe-3850-4308-8e08-121215469b7f
read_only=on  k=lead  id=e5e3936e-e4a8-4a40-b976-92cab76d8857
read_only=on  k=lead  id=d2bab231-3ce3-4a95-97c2-926a2dd16840
read_only=on  k=lead  id=a5ed3227-b1e2-440d-9ab8-0b5f16d2b43b
read_only=on  k=group  id=b51b8a97-ebfa-49f6-b333-fd7715915ffc
read_only=on  k=receipt  id=EH-2026-00459 voided=false
read_only=on  k=receipt  id=EH-2026-00460 voided=false
read_only=on  k=receipt  id=EH-2026-00461 voided=false
```

#### Q25 — free-text programmes and sources

```text
read_only=on  k=program  code=∅  n=3  text_hash=9681a3b3
read_only=on  k=program  code=Yearly  n=41  text_hash=9681a3b3
read_only=on  k=program  code=∅  n=80  text_hash=92cd779c
read_only=on  k=program  code=∅  n=7  text_hash=d41d8cd9
read_only=on  k=program  code=∅  n=1  text_hash=34bdf650
read_only=on  k=program  code=∅  n=5  text_hash=0f9e4164
read_only=on  k=program  code=∅  n=1  text_hash=6cd4cef8
read_only=on  k=program  code=∅  n=2  text_hash=2f0911c7
read_only=on  k=program  code=∅  n=4  text_hash=2e85a22d
read_only=on  k=program  code=∅  n=1  text_hash=21881222
read_only=on  k=program  code=∅  n=1  text_hash=cce7d5fd
read_only=on  k=program  code=∅  n=151  text_hash=6a56f0ee
read_only=on  k=source  code=meta_instant_form  n=41  text_hash=6647aa01
read_only=on  k=source  code=manual  n=5  text_hash=1776fed1
read_only=on  k=source  code=website  n=2  text_hash=ede189e9
read_only=on  k=source  code=manual  n=10  text_hash=0d05087b
read_only=on  k=source  code=website  n=1  text_hash=b1c0a479
read_only=on  k=source  code=website  n=80  text_hash=ccc8bc5a
read_only=on  k=source  code=manual  n=6  text_hash=d74a6efa
read_only=on  k=source  code=website  n=1  text_hash=a836a4bf
read_only=on  k=source  code=website  n=150  text_hash=c77f9e9c
read_only=on  k=source  code=manual  n=1  text_hash=3ebdac8d
read_only=on  k=student_referral  code=Famille / Ami(e)  n=4  text_hash=null
read_only=on  k=student_referral  code=Passage devant le centre (walk-in)  n=6  text_hash=null
read_only=on  k=student_referral  code=∅  n=153  text_hash=null
read_only=on  k=student_referral  code=Réseaux sociaux (Facebook / Instagram)  n=77  text_hash=null
read_only=on  k=student_referral  code=Recherche Google  n=1  text_hash=null
```

#### Q26 — appointments and visits per prospect

```text
read_only=on  leads=4  sample=["f349f742-7425-4e8a-b9a5-062915cb04ad","808a83cf-756b-4625-b7a7-438fb9e11968","df5398a6-0a57-4737-bea5-8a2fb16985c6","9e1c3d9f-a869-4d31-8551-1d04632c113e"]
```

#### Q27 — staff accounts without a name

```text
read_only=on  role=director  total=1  unnamed=1
read_only=on  role=receptionist  total=3  unnamed=1
read_only=on  role=admin  total=1  unnamed=0
```

#### Q28 — student duplicates

```text
read_only=on  groups=1  sample=["e847bf1a-7ad5-4454-a70c-aeddcac16058"]
```

#### Q29 — planned tests of active prospects without their appointment

```text
read_only=on  tests=0  sample=null
```

Run with the original predicate (open appointment only). Q29 was amended on 2026-11-22 to also accept the open enrolment action (owner decision, [plan implementation record](../plans/receptionist-workflow.md#implementation-record)); the amended query only exempts more rows, so this 0 stands.

#### Q30 — active prospects with no open action, by D1 rule

```text
read_only=on  d1_rule=five_failures  leads=18  sample=["28ea7fa2-c785-4277-9ccf-9a1e74d6eab3","2b63dc87-a379-4434-bcfb-80f04a87d595","4d2f8e75-213c-4176-86b1-7cc9e9ce6838","517b1f4b-a72b-421b-9d41-09c97d1cecea","631d4cb1-5c80-40e3-8363-e112128fe8ab"]
```

## 4. R0 findings (2026-11-21)

Read against the plan's stop condition « R0 reveals counts or shapes this plan doesn't handle ». None blocks A1; R1 and R2 need an owner answer before the steps they affect (D6, D3).

**What D1 will meet** (expected counts for its dry run, not approved counts):

| D1 rule | R0 evidence | Count |
| --- | --- | --- |
| (a) several open actions | Q04; Q05 rows 2, 3 and 5 | 19 prospects, 45 open actions (16 with 2, 1 with 3, 2 with 5); 9 of them hold exact duplicates (Q06, 9 groups) |
| (b) planned CRM test of an active prospect without its appointment | Q29 | **0**. No active prospect has a planned CRM test (Q09's test branch and Q10's « planned with level » are 0 too) |
| (c) active prospect with no open action | Q05 row 0; Q30 | 18, **all** after five failed calls: « En attente » with no relance date (OD-17 = A) |
| (d) closed, converted or merged prospect with open actions | Q07 | **0**. No closed or converted prospect holds an action or a planned test, and **no merged prospect exists** (Q07 has no MERGED row) |

After D1, 121 + 19 + 18 = 158 active prospects would each hold one action (Q05).

**Owner points:**

- **R1 — receipts 00459–00461 are not voided.** Q24 shows all three live (`voided=false`), while plan §10 D6 says « voided receipts 00459–00461 **stay** ». D6 (release C, OD-13) can't rest on that premise; the owner says what these three receipts are before D6 is planned in detail. The same Q24 lists the test records: 2 students, 9 contacts, 9 prospects, 1 group; the Q15 mismatch sample (2 prospects), one Q17 learner and the Q22 « Online » group are among them.
- **R2 — Q11 has no column for national numbers written `0…`.** Students: 18 empty, 7 E.164, 46 without « + », 45 without the leading 0, 1 placeholder, 47 unnormalisable (O1: the 46 without « + » are inside the 47). A number stored in the national `0…` form falls in none of these columns, so the owner's « 83 standard » can't be compared with Q11. D3's `d3_plan()` (release B) must count that form itself.
- **R3 — ownership (OD-6).** 131 of 166 open actions are unassigned and 102 active prospects have no owner (Q14): the size of D1's ownership backfill once the default owner is named.
- **R4 — unnamed staff.** 1 of 1 director and 1 of 3 receptionists have no name (Q27); the history would show them without a name until fixed in Settings (plan §4.7).
- **R5 — hours (OD-3).** The live policy (Q01, version 1, the only one): Monday 15:00–20:00; Tuesday to Saturday 10:00–12:30 and 15:20–20:00; Sunday closed; `date_exceptions` `[]`; attempt offsets `{0,0,1,3,5}`; minimum gap 180 minutes; first-contact SLA 15 minutes; post-test SLA 120 minutes. These are the hours the owner said to keep (« same time as before »). Two open visits are outside them (Q09) and 3 visit/test pairs overlap (Q08).

**Other counts for the record:** Q13 finds 513 same-note pairs within a minute (one action writes several rows, RC-8); Q18 22 prospects rescheduled or cancelled 3+ times; Q20 25 prospects stuck over 14 days; Q21 107 enrolled students with no prospect; Q26 4 prospects with 2+ open visits; Q28 1 student name group.

**Owner's counts of 21/11 (plan §1):** « 20 leads with 2+ actions » → R0 says 19; « 9 with exact duplicates » → R0 says 9.
