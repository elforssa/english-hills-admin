# Audit follow-ups (Batch H) — architecture, revision AFU-r1

**Status: APPROVED FOR IMPLEMENTATION — revision AFU-r1 at exact head `d02a305`, approved by the owner on 2026-10-29 about 11:10 Asia/Shanghai with D-TZ = A, D-TZ-2 = A, D-H5a = A, D-H5b = A, D-H5c = A, and the read-only H5 dry run ([approval record](#approval-record)). **Implemented** with migration `125_audit_follow_ups.sql` ([implementation record](#implementation-record)). **RELEASED 2026-10-30:** migration 125 applied 05:01 UTC, PR #175 squash-merged as `858e5ee` and deployed 05:17 UTC ([release record](#release-record-r0r3)).** Tier 3: it changes a finance function (the reception discount limit), placement integrity (the school-year check on every placement path), the business date behind receipt numbers, payment-date windows and reports, and the server error reporting. Baseline: `origin/main` `ec63d32a57554e0005eb476944354ae0498b826e`, Production migration ledger 001–124 (recorded in [CURRENT_STATE](../../ai/CURRENT_STATE.md)).

**Scope.** Eight follow-ups left after Batches A–G and the 2026-10-24 audit, delivered as **one outcome**: one implementation PR, one migration, one release. Every item below was checked against the code at the baseline; file and line references are to that commit.

**Owner decisions already taken** (Maroine, in chat, relayed by the coordinating session):

- **2026-10-28** (reception discount cap), verbatim: "Remove the cap for reception but not now until we finish with everything". Batches A–G are now released, so this is the time.
- **2026-10-29 10:41 Asia/Shanghai**, verbatim: "do all these fixes in one go … for the square (a pill) so all matches and consistent design … only inscrit". Meaning: H1–H8 in one batch; the programme "square" becomes a pill matching the other pills (H2); the dossier label becomes "Inscrit" only (H3).
- **Batch D follow-ups 1, 3 and 4** ([OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md#enrollment-and-group-consistency-batch-d--released-2026-10-26)): an editable group year, then the placement year check (implementation decision 5); « — » instead of « Groupe à affecter » for « Ancien apprenant »; `groupMemberIds` enrollment-only (D-8, allowed after C6).
- **Batch G D4 = A**: the client-side Casablanca dates outside reports were left for a separate follow-up; H7 is that follow-up. It also closes the deferred backlog item "Browser Casablanca timezone reliability".

New questions are in [Owner decisions required](#owner-decisions-required): **D-TZ** (with D-TZ-2), **D-H5a**, **D-H5b** and **D-H5c**. The [H5 Production dry run](#h5-production-dry-run-read-only) is a separate read-only step that needs its own approval.

# Owner summary

## What will change

1. **H1 — Reception may give any discount, with a reason.** The 10 % limit on reception discounts goes. Unchanged:
   - every discount still needs a reason from the list ("Autre" needs a short text);
   - a reception payment still confirms an enrollment only from 10 % of the net price;
   - every new discount still appears in the director's « Contrôles » list, with its percentage and reason.
2. **H2 — Programme shown as a pill.** In the Students list, the programme of a learner in a group becomes a small rounded pill, exactly like the status and payment pills next to it: same size, same colours per programme as today, never wrapped onto two lines. The hover text and the link to the learner page stay. The editable dropdown (learner without a group) keeps working and gets the same pill look. The student page, the enrollments page, the groups list and the group page show the programme with the same pill.
3. **H3 — "Inscrit".** The learner-file status shows « Inscrit » instead of « Inscrit (dossier) » everywhere (list, filter, learner page, guide). « Essai (dossier) » and the other labels stay.
4. **H4 — No false « Groupe à affecter ».** In the Students list, the Groupe column shows « Groupe à affecter » only for a learner who really waits for a group: the same learners the « Groupe à affecter » filter returns (28 at the 2026-10-26 check). An « Ancien apprenant », « Inactif » or « Prospect » file without a group shows « — ».
5. **H5 — Group school year.** The group form shows the school year, editable. A new group proposes a school year by today's date (rule in [D-H5a](#owner-decisions-required)). Placement then checks again that the learner's enrollment year equals the group's year, on every placement path, with « 2026/2027 » and « 2026-2027 » treated as the same year. An enrollment form with a group takes its year from that group. **This check is switched on only after a read-only Production count shows no group with a missing or different year, or after the owner approves a correction.**
6. **H6 — Server errors reach Sentry.** The Sentry start-up file moves to where Next.js looks for it in this project (`src/`), so server errors are reported. Today only browser errors are. Personal data is still removed before sending. The check is done on a local copy only, never on Production.
7. **H7 — One centre clock.** Morocco has been on UTC+0 since 2026-09-20, but the Production database and some browsers still think Casablanca is UTC+1. The application stops asking time-zone databases about Casablanca. One setting (UTC+0) decides "today", the receipt year, the payment-date window, overdue status, report days and the dashboard month, in the database and in the browser. Dates change only between 23:00 and 24:00 (Moroccan time), where today the database already says "tomorrow". CRM times of day (calling windows, callback times) become correct by one hour; see [D-TZ-2](#owner-decisions-required).
8. **H8 — One membership rule in the app.** The app's roster helper uses enrollments only, as the database already does. No visible change: since the 2026-10-26 clean-up both rules give the same rosters.

## What staff/users will be able to do

- Reception records any discount with a reason, without calling the director.
- Staff set and correct a group's school year in the group form.
- Everything else is the same, with correct dates late in the evening and clearer lists.

## What remains restricted

- No role gains access to any page, row or action except H1 (larger reception discounts, still with a reason and still listed for the director).
- Who may create or edit groups is unchanged (director, admin; reception through its existing command).
- Who may place a learner is unchanged; placement gains a check, not a permission.
- Teachers, families and learners see nothing new.

## UI impact

Programme pills (H2), the « Inscrit » label (H3), « — » in the Groupe column (H4), a school-year field in the group form and a group-driven year in enrollment forms (H5), and a new refusal message when the years differ: « L’année scolaire de l’inscription (2026/2027) ne correspond pas à celle du groupe (2025/2026). »

## Database impact

One forward migration, `XXX_audit_follow_ups.sql`, numbered at merge (next free number at the baseline: 125). It contains:

- H1: `public.create_charge_payment_financial` re-created from its latest definition (migration 122) without the Q3 block;
- H5: one guard trigger on `enrollments` and a year guard on `groups` (or the per-function form, [D-H5c](#owner-decisions-required));
- H7: four centre-clock helpers, a new body for `public.business_date`, and the functions listed in [H7 inventory](#h7-inventory) re-created on their latest definitions with the zone name replaced.

It changes **no row**. A group-year correction, if the dry run finds one, is a separate data step with its own approval.

## Important security decisions

- **H1 widens one reception limit only.** The reason list, the 10 % confirmation threshold (Q5), the payment-date window (Q4), the stored role, idempotency and replay order are unchanged. The director list keeps every new discount.
- **H5 adds a refusal; it grants nothing.** The trigger runs for every role and every path (`service_role` included), like the Batch D guards, and raises `23514` with hint `egc.school_year_mismatch`.
- **H6 sends nothing new.** The same scrubbing (`src/lib/sentry-scrub.js`) and DSN handling run; the local check uses a local capture endpoint, never the real DSN.
- **H7 is not a permission change.** Every re-created function keeps its signature, SECURITY DEFINER/INVOKER posture, `search_path`, owner and grants.

## Rollout risk

Low to medium. The riskiest parts are H5 (a wrong group year would block placements; hence the dry run and STOP condition) and H7 (many functions re-created; protected by a catalog guard and before/after equivalence tests). Release outside reception hours, migration first, application within minutes; see [Rollout](#rollout).

## Owner decision needed

Yes: [D-TZ, D-TZ-2, D-H5a, D-H5b, D-H5c](#owner-decisions-required), then separately the [H5 dry run](#h5-production-dry-run-read-only).

# Technical design

## H1 — Remove the reception discount cap

**Today.** `public.create_charge_payment_financial` (latest definition: [migration 122](../../../supabase/migrations/122_finance_corrections_numbering_guardrails.sql), lines 461–464; not redefined by 123 or 124) raises « Remise supérieure à 10 % : demandez au directeur. » when `v_role = 'receptionist'` and the discount is above 10 % of the gross price. The client mirror is `RECEPTION_DISCOUNT_CAP` and the cap branch of the discount guard in [financeCorrections.mjs](../../../src/lib/financeCorrections.mjs) (lines 14–15 and 58).

**Change.**

- Re-create `create_charge_payment_financial` from the 122 body (byte-for-byte except the removed `if v_role = 'receptionist' …` block and its comment, replaced by a one-line comment naming this plan). Kept: the reason checks (Q2 = A), the replay-first order, the payment-date window (Q4), the 10 % confirmation threshold (Q5, in `create_charge_payment` and the financial core, untouched), `charge_discount_reasons` writes.
- Client: remove `RECEPTION_DISCOUNT_CAP` and its message; the guard keeps "reason required", "unknown reason" and "Autre needs text". `ReceiptForm` shows no cap warning.
- The « Contrôles » list (`get_finance_review_queue`, director-only) is unchanged: it already lists every new non-legacy discount with its percentage and reason.

**Tests.** In `scripts/test-finance-batch-e.sql`, the Q3 refusal becomes "reception may give any discount with a reason" (for example 50 % with `sibling` succeeds and is listed in the queue with `discount_percent` 50.0); "reception without a reason" is still refused; Q4 and Q5 tests unchanged. In `scripts/test-receipt-client-regressions.mjs`, the cap cases become "no cap for reception" and the migration-text assertion checks the new migration has no `Remise supérieure`.

**Docs.** [PRODUCT_RULES](../../ai/PRODUCT_RULES.md) (Batch E bullet: "reception may discount at most 10 %") and [SECURITY_RULES](../../ai/SECURITY_RULES.md) (Batch E bullet: "10 % reception cap") are updated. The [payment corrections plan](payment-corrections-receipts.md) is a historical record and is not rewritten; its Q3 is superseded by this plan.

## H2 — Programme pill

**Today** ([students/page.jsx](../../../src/app/(admin)/students/page.jsx) lines 389–398): the read-only programme is plain coloured text (a `Link` with a hover title for roles that can edit, a `span` otherwise), so it wraps and looks like a square block. Status and payment pills use `rounded-full px-2 … text-xs`.

**Change.**

- One small shared component, `ProgrammePill` (in `src/components/operational/`), renders `programmeLabel(session_type)` with `inline-block whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium` and the existing `SESSION_TYPE_COLORS` class. With an `href` it renders a `Link` with the same `title` text; without, a `span`.
- The status pill in the same table uses the same classes (`px-2 py-1`, plus `whitespace-nowrap`); the payment pill's `py-0.5` becomes `py-1`, so the three pills align. The mobile card status pill drops `break-words` for the same `whitespace-nowrap`.
- The editable `InlineSelect` for the programme (learner without a group) keeps the native `select`, styled as a pill: `rounded-full`, `text-xs`, the programme's colour classes, compact padding and the existing chevron. Keyboard and screen-reader behaviour stay native.
- Same pill on the other programme displays:
  - Students list mobile card;
  - student page: « Programme du dossier » and each enrollment row;
  - enrollments page rows, which show the raw `session_type` today and switch to `programmeLabel`;
  - groups list (card and table), which also show the raw value today;
  - group page header, which uses `rounded` today.
- Filters and form selects stay ordinary controls.

**Tests.** Extend the Students browser assertions (`scripts/test-ui-foundation-browser.mjs`) to check, at desktop and phone width, that the read-only programme cell is a single-line pill (`rounded-full`, computed `white-space: nowrap`, one line box) with its hover title and link, and that the editable select carries the pill classes. A unit check on `ProgrammePill` covers the label and colour mapping.

## H3 — « Inscrit »

`DOSSIER_LABELS.Enrolled` in [presentation.mjs](../../../src/lib/ui/presentation.mjs) becomes `'Inscrit'`. Updated with it:

- `scripts/test-ui-foundation.mjs` (line 21) and any browser assertion reading the status filter;
- the guide table in [GuideContent.jsx](../../../src/app/(admin)/helpdesk/GuideContent.jsx) (line 1581) and the guide content test;
- the [UI Foundation plan](english-hills-ui-foundation.md), status-map paragraph: a dated note, not a rewrite.

The guide screenshots under `public/helpdesk` are checked; any that shows « Inscrit (dossier) » is listed in the implementation record, and retaken on synthetic data only if the label is legible in it. `ENROLLMENT_LABELS` (« Inscrit — groupe à affecter ») is unchanged.

## H4 — « — » for files that do not await a group

**Today** ([students/page.jsx](../../../src/app/(admin)/students/page.jsx) `renderGroup`, lines 199–231): a file without a main group and without a pending enrollment shows « Groupe à affecter » (a link for director/admin, a placement button for reception), whatever its status. So « Ancien apprenant », « Inactif » and enrollment-less « Prospect » rows show it.

**Change.** The cell uses the same rule as the « Groupe à affecter » filter (`search_students_page`, `p_group = 'unassigned'`, migration 124) and as `studentNeedsGroup`:

- a Confirmed enrollment without a group; or
- an Inscrit/Essai file with no membership and no Submitted, Under Review or Confirmed enrollment.

Otherwise it shows « — ». The existing per-enrollment buttons for Confirmed enrollments without a group are unchanged.

Side effect, stated for the owner: reception loses the list shortcut that placed a Prospect or former learner with no enrollment straight into a group. This is still possible from the learner page, and the database command is unchanged.

**Tests.** A unit test of the shared predicate (Alumni without membership → « — »; Confirmed without group → « Groupe à affecter »; Inscrit without membership or pending enrollment → « Groupe à affecter »; Prospect without enrollment → « — »). A browser check on the Students list for director and receptionist.

## H5 — Editable group year and the placement year check

**Today.**

- `groups.annee` is free text, `'YYYY-YYYY'` by convention. The group form sets it silently to `groupYear(currentSchoolYear())` at creation and never shows it ([groups/page.jsx](../../../src/app/(admin)/groups/page.jsx) line 36).
- Placement does not compare years (Batch D implementation decision 5). The three paths, all on their migration-120 definitions:
  - `academic_security.place`, behind `place_learner_in_group` and `assign_receptionist_student_group`;
  - `save_receptionist_enrollment`;
  - `crm_start_enrollment`.
- `academic_security.school_year_of(annee)` already normalises `YYYY-YYYY` or `YYYY/YYYY` to `YYYY/YYYY` and returns NULL for anything else.

**School-year rule (stated).** A school year runs from 1 September to 31 August. A business date from September to December of year Y belongs to « Y/Y+1 »; from January to August of year Y it belongs to « Y-1/Y ». The business date is the centre date of H7. For example, 2026-10-29 belongs to 2026/2027 and 2027-07-10 to 2026/2027.

**Change.**

1. **Group form.**
   - A « Année scolaire » field, required, format `YYYY/YYYY` with the end year one more than the start, stored as `YYYY-YYYY` (`groupYear`).
   - Shown for director, admin and reception; reception saves through `save_receptionist_group`, which already accepts `annee`.
   - Default for a new group by [D-H5a](#owner-decisions-required).
   - Changing the year of a group with learners follows [D-H5b](#owner-decisions-required).
2. **Year check, on every placement path** ([D-H5c](#owner-decisions-required) A, recommended): a trigger `academic_security.guard_enrollment_group_year`.
   - It runs `BEFORE INSERT OR UPDATE OF group_id, school_year ON public.enrollments`, and acts only when the new row has a group and either it is an insert or `group_id` or `school_year` changed. Status-only updates, ends and the year close never fire it.
   - It refuses when `school_year_of(group.annee)` and `school_year_of(enrollment.school_year)` differ, both normalised, so `2026-2027 = 2026/2027`. Error: `23514`, hint `egc.school_year_mismatch`, with the French message of the UI impact section.
   - A group without a valid year: [D-H5b](#owner-decisions-required).
   - This covers `place`, `save_receptionist_enrollment`, `crm_start_enrollment`, `create_enrollment`/`save_enrollment_changes`, `reopen_enrollment`, the online commands and direct director/admin writes. The three named functions also get the same check before their first write, so the refusal reaches the caller with the specific hint, and the browser maps `egc.school_year_mismatch` to the message.
3. **Group year guard.** The existing `academic_security.guard_group_level` (trigger `groups_membership_level_guard`) is extended. It refuses an `annee` change while a live enrollment (Submitted, Under Review, Confirmed, Validated, Trial) of a different school year references the group, with the same lock rules as D7. It also refuses a new or changed `annee` that does not normalise. Existing rows are not touched.
4. **Default year from the group.**
   - Server: where a path receives a group and no year, the year comes from the group. `place` already does this; `save_receptionist_enrollment` and `crm_start_enrollment` gain it, with an explicit year still checked against the group.
   - Client: the enrollment forms with a group (`EnrollmentModal`, the reception enrollment form, `CrmEnrollmentDialog` when a group is chosen, the placement dialog) set the year from the chosen group and show it read-only while a group is selected.
5. **STOP condition (binding).**
   - Before the check is enabled, the [read-only Production dry run](#h5-production-dry-run-read-only) is run, with the owner's approval.
   - If it finds **any** group with a missing or non-normalisable year, or any live enrollment in a group whose year differs, the result goes to the owner with the correction proposal below. **The check is not enabled without that approval.**
   - Concretely, the implementation PR keeps the trigger and the three function checks in a separate, clearly marked section of the migration. If the owner has not approved by release time, that section is removed before release and shipped later; the rest of Batch H does not wait.

**Correction proposal (if the dry run finds differences).** One logged data step, with before-images and its own approval, run before the migration:

- **missing year, all live members in one year:** set the group year to that year;
- **year set, all live members in one other year:** set the group year to the members' year. The group year was a silent form default, while enrollment years were chosen or derived from dates;
- **members in several years, or no members and no derivable year:** listed for the owner to decide by hand; nothing automatic;
- **non-normalisable text such as « 2026 »:** normalised where unambiguous, otherwise listed.

**Tests.** A new SQL suite, `scripts/test-audit-follow-ups.sql`:

- refusal on each path for every role that can reach it;
- acceptance of `2026-2027` against `2026/2027`;
- status-only updates, ends and the year close are not affected;
- the group-year change guard;
- the missing-year behaviour per D-H5b;
- the year defaulting from the group.

Unit tests cover the school-year rule (dates in May, June, August and September) and the default for a new group. Batch D's `scripts/test-enrollment-group-consistency.sql` keeps passing.

## H6 — Sentry server instrumentation under `src/`

**Today.** [`instrumentation.js`](../../../instrumentation.js) is at the repository root, but the app lives in `src/app`. With a `src/` directory, Next.js 15 loads `src/instrumentation.js` only, so `sentry.server.config.js` and `sentry.edge.config.js` are never imported and server errors are not reported. Evidence at plan time: none of the six local production builds under this repository contains a compiled `.next/server/instrumentation.js`. Its comment still mentions Next 14's `experimental.instrumentationHook`.

**Change.**

- Move the file to `src/instrumentation.js` (`git mv`, imports adjusted to `../sentry.server.config` and `../sentry.edge.config`) and correct the comment.
- Keep `onRequestError`, the DSN handling (`SENTRY_DSN` or `NEXT_PUBLIC_SENTRY_DSN`; inert without one), `sendDefaultPii: false`, `beforeSend`/`beforeBreadcrumb` scrubbing and the separate RUM scrub (`src/lib/rumScrub.mjs`).
- No new integration, tracing, Replay or data field.
- The same check confirms the browser start-up (`sentry.client.config.js`) is still bundled by `@sentry/nextjs` 10. If it is not, it moves to `src/instrumentation-client.js` with the same options, recorded as a deviation.

**Local-only verification.**

- Build and start the app with `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` pointing to a local capture listener on `127.0.0.1`, never the real DSN (`.env.local` holds it; the run overrides it).
- Trigger one synthetic server error through a throwaway route in a scratch copy, never committed.
- Assert that:
  - the envelope arrives;
  - it carries the synthetic message;
  - it has no cookies, auth headers, query strings, e-mail-shaped or phone-shaped values;
  - the build output contains the compiled instrumentation hook.
- A repository test (`scripts/test-sentry-instrumentation.mjs`, full lane) asserts the file location and that the configs import the scrubbers.
- **No error is ever triggered on Production.**

## H7 — One centre clock (decision D-TZ)

**Problem.**

- Production PostgreSQL resolves `Africa/Casablanca` to UTC+01:00 (recorded at the RCC-A2 release and again by Batch G). Since tzdata 2026c, Morocco is plain UTC+0 (from 2026-09-20). The local stacks already resolve it to +00:00.
- Browsers and Node builds with older ICU data also say +01:00.
- So today the database's "today" flips at 23:00 Moroccan time, and browsers disagree with one another.
- Earlier batches chose "follow the zone name, never a fixed offset" (PCR-r2, `receiptFinance.js` comment). That choice depends on tz data the centre does not control; D-TZ revisits it.

**Recommended design (D-TZ = A).** One centre clock with a fixed offset, defined once in the database and once in the browser code. Each side carries a comment naming the other.

Database (new migration; all `STABLE`, deliberately not `IMMUTABLE`, so no index or generated column can depend on the value; `search_path = pg_catalog, pg_temp`; execute grants as `public.business_date` today):

```sql
-- The centre's clock: Morocco, UTC+0 since 2026-09-20 (tzdata 2026c).
-- The one place to change it; mirrors CENTRE_UTC_OFFSET_MINUTES in src/lib/centreClock.mjs.
-- No time-zone name is used, so stale tz data on any server cannot move it.
public.centre_utc_offset() returns interval        -- interval '0 hours'
public.centre_local(p_at timestamptz) returns timestamp   -- (p_at at time zone 'UTC') + centre_utc_offset()
public.centre_instant(p_local timestamp) returns timestamptz  -- (p_local - centre_utc_offset()) at time zone 'UTC'
public.business_date(p_at timestamptz default now()) returns date  -- centre_local(p_at)::date
```

The offset is an `interval`, never a text offset: PostgreSQL reads a text offset such as `'+01:00'` in `AT TIME ZONE` with the POSIX sign (west positive), which would silently invert it.

Mechanical substitution in every function of the [H7 inventory](#h7-inventory), each re-created on its latest cumulative definition:

- `x AT TIME ZONE 'Africa/Casablanca'` with `x timestamptz` becomes `public.centre_local(x)`;
- with `x timestamp` (wall clock to instant) it becomes `public.centre_instant(x)`;
- `(now() AT TIME ZONE 'Africa/Casablanca')::date` becomes `public.business_date()`;
- the CRM task/policy `timezone` column used in `AT TIME ZONE t.timezone` becomes the same helpers. The column and its check (`timezone = 'Africa/Casablanca'`) stay as stored labels; no row changes.

Browser and Node: a new `src/lib/centreClock.mjs`:

- `CENTRE_UTC_OFFSET_MINUTES = 0`;
- `centreParts(now)`, `centreDate(now)`, `centreMonthStart(now)`, `centreInstant('YYYY-MM-DDTHH:mm')`, and `formatCentre(value, locale, options)`, which shifts the instant by the offset and formats with `timeZone: 'UTC'`. So no tz database is consulted for Casablanca, and the result is the same on every engine.

Every helper below becomes a thin wrapper or is replaced:

- `localBusinessDate`, `businessMonthStart` and `BUSINESS_TIME_ZONE` (`receiptFinance.js`);
- `todayInCasablanca` (attendance, teacher portal);
- `schoolDate`/`schoolTime` (dismissal);
- `currentSchoolYear` (`enrollmentWorkflow.mjs`), the school-year clock in `receiptPresentation.js`, and `crm/enrollment.mjs`;
- `casablancaParts` and `casablancaInstant` (`crm/enrollmentActions.mjs`, `crm/presentation.mjs`);
- the CRM calendar day (`crm/calendar.mjs`) and CRM display formatters (`presentation.mjs`, `LeadIntakePanel`, `LifecycleOperations`);
- the dashboard month label, activity-log, receipt-deletion and archived-date displays, the online lesson time helper (`online/queries.js`, `online/page.jsx`) and `MarketingAnalytics`' "today".

**Kept on purpose:**

- the Meta ad account's own time zone (`crm_meta_daily_insights.account_timezone`, the Insights configuration default in `MarketingInsightsPanels`, `attributionDay` and the `tz` read from that configuration in `crm_get_marketing_cohort`). These follow Meta's account setting for spend days, not the centre clock;
- the consumed Batch D clean-up function `academic_security.egc_cleanup_c1`. It already ran once and cannot run again, and re-creating it adds risk for nothing.

**Guards.**

- A repository test fails if `Africa/Casablanca` appears in `src/` outside the Meta allowlist.
- A catalog test fails if any function body (outside the same allowlist) contains it after the migration.
- A unit test pins `CENTRE_UTC_OFFSET_MINUTES` to the SQL `centre_utc_offset()` read in the local suite.

**Behaviour (acceptance).**

| Outcome | Before (Production) | After |
| --- | --- | --- |
| Receipt-number year (`set_receipt_number` via `business_date`) | year of UTC+1 date | year of UTC+0 date; differs only 31 Dec 23:00–24:00 |
| Payment date window (Q4) and the « aujourd’hui à Casablanca » refusal | UTC+1 today | UTC+0 today; differs 23:00–24:00 only |
| Overdue status (`receiptStatus`), review queue « since » date | browser-dependent | UTC+0 today everywhere |
| Report days (`report_*`, `list_activity_log` date filters) and dashboard month | UTC+1 day / browser month | UTC+0 day; differs 23:00–24:00 only |
| Attendance/dismissal "today", school-year defaults, CRM birth-date "today" | mixed | UTC+0 today |
| CRM calling windows, callback validation, scheduled labels, online lesson times | wall clock read at UTC+1 in the database | wall clock read at UTC+0: **one hour earlier in real time than today**; see D-TZ-2 |

Date outcomes are identical outside 23:00–24:00 Moroccan time. CRM time-of-day outcomes become correct, which is a one-hour change from today's database behaviour.

**Tests.**

- Unit tests of `centreClock` at 22:59, 23:30 and 00:00 UTC and on 31 December, independent of the test machine's zone. The test runs with `TZ` set to `Asia/Shanghai` and to `America/New_York`.
- SQL tests of the four helpers, including the interval sign.
- A before/after equivalence run on the local stack. Its PostgreSQL already resolves Casablanca to +00:00, so every converted function must return exactly what it returned before the migration, over a grid of fixtures and inputs.
- Boundary tests at 23:30 UTC for:
  - the receipt year;
  - the payment window;
  - overdue status;
  - the report day bucket;
  - the dashboard month.
- The existing CRM, online and finance suites that name `Africa/Casablanca` in fixtures are updated only where they assert the zone itself, never the expected outcome.

### H7 inventory

Database functions that use `Africa/Casablanca` or the CRM `timezone` column in time arithmetic. This is the local catalog at ledger 124; the latest definition is the last migration that creates it. The release R0 re-reads the Production catalog.

| Function | Latest definition | Use |
| --- | --- | --- |
| `public.business_date` | 122 | today / date of an instant |
| `academic_security.today` | 120 | today |
| `online_security.today`, `local_date`, `local_time`, `french_when`, `pattern_slots` | 117 | online lesson dates and times |
| `public.online_update_lesson` | 117 | lesson wall clock to instant |
| `public.attendance_student_in_group` | 121 | end date of an enrollment |
| `public.count_today_dismissals` | 068 | today |
| `public.enforce_dismissal_integrity` | 060 | today |
| `public.create_public_registration` | 062 | today |
| `public.guard_premium_homework_write` | 054 | today (workshop module, until Release B) |
| `public.portal_request_reenrollment` | 123 | today / school year |
| `public.list_activity_log` | 124 | date filters |
| `public.crm_start_enrollment` | 120 | birth date not after today |
| `public.crm_get_today` | 083 | today's work |
| `public.crm_get_opportunities` | 107 | dates |
| `public.crm_get_work_queue` | 111 | day boundaries |
| `public.crm_get_admissions_calendar` | 109 | calendar days and times |
| `crm_security.command` | 119 | task times (literal and `timezone` column) |
| `crm_security.enrollment_year` | 084 | school year of a date |
| `crm_security.opportunity_card`, `reminder_due` | 111 | presets and labels |
| `crm_security.opportunity_ids`, `work_boundaries` | 108 | day boundaries |
| `crm_security.placement_integrity` | 083 | dates |
| `crm_security.placement_summary`, `scheduled_civil` | 109 | civil date/time labels |
| `crm_security.next_window`, `attempt_due` | 080 | calling windows (`timezone` column) |
| `crm_security.accept_external_submission` | 119 | first due date (`timezone` column) |
| `public.crm_get_marketing_cohort` | 116 | **kept**: Meta account time zone |
| `academic_security.egc_cleanup_c1` | 120 | **kept**: consumed clean-up |

Views, materialised views, policies and indexes contain no reference. Column defaults and checks exist only on `crm_tasks.timezone` and `crm_followup_policies.timezone` (kept as labels). Functions that call `business_date()` follow it without change, among them `set_receipt_number`, the payment functions, `get_finance_review_queue` and `report_*`.

## H8 — `groupMemberIds` enrollment-only

[`groupMemberIds`](../../../src/lib/enrollmentWorkflow.mjs) (line 34) returns learners whose file group is the group **or** who have a membership enrollment. D-8 allows enrollment-only after C6, which matched on 2026-10-26 (and the M2 guards keep the file group a copy of a membership). Change: drop the `groupe_id` branch and the stale comment. `studentGroupIds` keeps the main group first for ordering only.

Every caller's enrollment set must contain the group's memberships. Checked at implementation and recorded:

- attendance, assessments, the groups list and the group page (staff loaders);
- the teacher portal (`rosterToAcademicRows`);
- `reportData`.

`scripts/test-enrollment-workflow.mjs` changes: a file group without a membership enrollment no longer counts.

# Owner decisions required

**D-TZ — how the application decides "today" and the time of day.**

- **A (recommended):** one centre clock with a fixed offset, set to UTC+0, in one database function and one browser module ([design](#h7--one-centre-clock-decision-d-tz)). No time-zone database is consulted for Casablanca. Changing the offset later (for example if Morocco moves its clock again) is one migration plus one constant.
- **B:** keep `Africa/Casablanca` and wait for Supabase and every browser to update their tz data. Not recommended: the centre controls neither, and today's mismatch stays.
- **C:** a director-editable offset stored in a settings table. Not recommended: a runtime change would move receipt years, payment windows and report days mid-day, and adds a security-relevant setting for a rare event.

**D-TZ-2 — open CRM tasks created under the old UTC+1 reading.** Stored task instants never change. Server-resolved reminders and windows created before the release were computed at UTC+1, so after the release their labels read one hour earlier: a 09:00 reminder shows 08:00. Appointments typed in a browser depend on that browser's tz data.

- **A (recommended):** keep every stored instant. At release (R0), count open future tasks read-only; reception re-checks the open **appointments** in « Mon travail » the next morning.
- **B:** shift open future server-resolved reminders by one hour in a logged data step. Not recommended: it cannot tell browser-entered appointments apart, and a wrong shift is worse than a visible one.

**D-H5a — default school year of a new group.**

- **A (recommended):** the school year containing today's centre date (1 September – 31 August).
- **B:** from 1 June, new groups propose the school year starting the next September; before that, the current one. Summer Camp groups (July) would then need a manual change, because under the September–August rule they belong to the ending year.

In both cases the field is editable.

**D-H5b — a group without a valid year, and changing a populated group's year.**

- **A (recommended):**
  - after the dry run is clean or corrected, placement into a group without a valid year is refused (« Renseignez l’année scolaire du groupe. »);
  - a group's year cannot change while a live enrollment of another year is in it, as for programme and level (D7).
- **B:** a group without a year accepts any enrollment year; year changes are free. Not recommended: it reopens the gap the check closes.

**D-H5c — where the check lives.**

- **A (recommended):** a trigger on `enrollments` (every path, every role, future paths included), plus early checks with the same hint in the three named functions for a clear message.
- **B:** checks in the three named functions only. Not recommended: online, reopen and direct staff writes would stay unchecked.

**Separate approval: the H5 dry run.** A read-only count on Production (below). It changes nothing, and is run only when the owner approves it.

## H5 Production dry run (read-only)

Run through the existing read-only operator path, inside a read-only transaction. It returns only counts and group-level rows: group names, programmes and years. No learner name, contact or identifier.

```sql
begin transaction isolation level repeatable read read only;
set local statement_timeout = '20s';
with g as (
  select g.id, g.name, g.session_type, g.annee,
    case when btrim(g.annee) ~ '^[0-9]{4}[-/][0-9]{4}$'
          and right(btrim(g.annee), 4)::integer = left(btrim(g.annee), 4)::integer + 1
         then left(btrim(g.annee), 4) || '/' || right(btrim(g.annee), 4) end as group_year
  from public.groups g
), live as (
  select e.group_id,
    case when btrim(e.school_year) ~ '^[0-9]{4}[-/][0-9]{4}$'
          and right(btrim(e.school_year), 4)::integer = left(btrim(e.school_year), 4)::integer + 1
         then left(btrim(e.school_year), 4) || '/' || right(btrim(e.school_year), 4) end as enrollment_year,
    e.school_year is null as year_missing
  from public.enrollments e
  join public.students s on s.id = e.student_id and s.deleted_at is null
  where e.group_id is not null
    and e.status in ('Submitted', 'Under Review', 'Confirmed', 'Validated', 'Trial')
), per_group as (
  select g.id, g.name, g.session_type, g.annee, g.group_year,
    count(l.group_id) as live_members,
    count(*) filter (where l.group_id is not null and g.group_year is not null
      and l.enrollment_year is distinct from g.group_year) as members_other_year,
    count(*) filter (where l.year_missing) as members_without_year,
    array_agg(distinct l.enrollment_year) filter (where l.group_id is not null) as member_years
  from g left join live l on l.group_id = g.id
  group by g.id, g.name, g.session_type, g.annee, g.group_year
)
-- 1. Summary.
select count(*) as groups_total,
  count(*) filter (where annee is null or btrim(annee) = '') as groups_year_missing,
  count(*) filter (where annee is not null and btrim(annee) <> '' and group_year is null) as groups_year_unreadable,
  count(*) filter (where members_other_year > 0) as groups_with_other_year_members,
  coalesce(sum(members_other_year), 0) as live_enrollments_other_year,
  coalesce(sum(members_without_year), 0) as live_enrollments_without_year,
  count(*) filter (where group_year is null and live_members > 0) as populated_groups_without_valid_year
from per_group;
-- 2. Detail, problem groups only (same CTEs repeated in the session):
--    select id, name, session_type, annee, group_year, live_members, members_other_year,
--           members_without_year, member_years
--    from per_group
--    where group_year is null or members_other_year > 0 or members_without_year > 0
--    order by session_type, name;
rollback;
```

**Expected use.**

- If the summary shows zero problem groups and zero other-year or yearless live enrollments, the check ships with the migration.
- Otherwise the detail and the [correction proposal](#h5--editable-group-year-and-the-placement-year-check) go to the owner. Nothing is corrected or enabled without that approval.
- At release R0 the summary is re-read, and any difference from the approved numbers goes back to the owner.

# Migration approach

- **One migration**, `XXX_audit_follow_ups.sql`, numbered at merge from the then-current ledger.
- **Order inside it:**
  1. the H7 helpers and `business_date`;
  2. the H7 function re-creations;
  3. H1;
  4. the H5 guards, in their own marked section (see the STOP condition).
- **One transaction, idempotent where the existing migrations are.**
- **Each re-created function** starts from its latest cumulative definition, never an earlier snapshot. Its body is diffed against the local catalog before and after, so the only differences are the substitutions listed here. The implementation record keeps that diff.
- **No data change, no grant change, no new table.** The guard trigger function lives in `academic_security` (no API grant).
- **Restore script.** `scripts/audit-follow-ups-restore.sql` re-creates every replaced function from its pre-migration body and drops the new trigger and helpers. It is prepared and tested locally, and **not run** without its own approval.

# Tests and CI

All local work runs on a private Supabase stack with remapped ports (never the shared default stack, never Production data), with external e-mail disabled and the Sentry DSN unset or local.

| Area | Suite (new or extended) | Lane |
| --- | --- | --- |
| H1 | `test-finance-batch-e.sql`, `test-receipt-client-regressions.mjs` | full |
| H2–H4 | `test-ui-foundation.mjs`, `test-ui-foundation-browser.mjs`, new predicate unit test, `test-helpdesk-content.mjs` | full |
| H5 | new `test-audit-follow-ups.sql`, `test-enrollment-group-consistency.sql`, school-year unit tests | full |
| H6 | new `test-sentry-instrumentation.mjs`; local envelope check (recorded, not in CI: it needs a built server) | full |
| H7 | new `test-centre-clock.mjs`, SQL helper tests, catalog guard, before/after equivalence run, updated CRM/online/finance suites | full |
| H8 | `test-enrollment-workflow.mjs` | full |

New scripts are wired into `package.json` and the `full` lane of [verify](../../../.github/workflows/verify.yml) in the same PR. Lint and build run as usual. The implementation PR uses the full CI lane.

# Rollout

Release, after the implementation PR's independent review and the owner's release approval:

- **Window.** Outside reception hours, and never between 22:30 and 01:00 UTC, the window H7 changes. Recommended: **05:00–08:00 UTC**, which is night or early morning in Casablanca and 13:00–16:00 in Asia/Shanghai.
- **R0, read-only:**
  - ledger is 001–124 (or the recorded ceiling);
  - catalog bodies of the functions to be replaced equal the repository's latest definitions;
  - PostgreSQL's reading of `Africa/Casablanca` is recorded;
  - the H5 dry-run summary is re-read;
  - open future CRM tasks are counted (D-TZ-2).
- **R1, only if approved separately:** the group-year correction, with before-images.
- **R2:** apply the migration through the guarded wrapper and verify read-only:
  - ledger row and MD5;
  - helpers return offset 0;
  - `business_date()` equals the UTC date;
  - no remaining zone name outside the allowlist;
  - the trigger exists;
  - the payment function has no cap.
- **R3:** merge the PR and deploy the application **within minutes** of R2. Old application with the new database is safe:
  - the old client still stops reception at 10 %, which is merely stricter;
  - old forms send the year the group already has;
  - old browser dates are the ones in use today.
- **R4:** read-only checks and a docs closeout PR. Afterwards the owner makes the first morning check: reception discount above 10 %, programme pills, group year, and that the open appointments look right.

Each step needs the approvals named in [AGENTS](../../../AGENTS.md); this plan approves none of them.

# Rollback

- **Application:** redeploy the previous Production deployment. The previous application works on the new database, as in R3.
- **Database:** the prepared restore script, run only with approval, brings back:
  - the 122 payment function with the cap;
  - the zone-name bodies;
  - the previous `guard_group_level`.

  It also drops the year trigger and the helpers. No data needs restoring, because the migration changes no row.
- **R1 correction**, if run: reversed from its before-images.

# Documentation changes in the implementation PR

- [PRODUCT_RULES](../../ai/PRODUCT_RULES.md): Batch E discount bullet (H1); the business-date paragraph and the Batch E date sentence (H7); the EGC paragraph's "Placement does not check the group's school year" (H5).
- [SECURITY_RULES](../../ai/SECURITY_RULES.md): the reception placement sentence (H5) and the Batch E bullet (H1).
- [ARCHITECTURE](../../ai/ARCHITECTURE.md): the reports line and the scheduled-display contract (H7).
- [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md): Batch H section; Batch D follow-ups 1, 3 and 4 marked as delivered by this batch; the deferred tz backlog item closed.
- [CURRENT_STATE](../../ai/CURRENT_STATE.md): at release only.
- A new ADR-014, "One centre clock with a fixed offset", records D-TZ.

# Approval record

- **Approved by:** Maroine (owner), in chat with Claude, relayed by the coordinating session, **2026-10-29 about 11:10 Asia/Shanghai** (03:10 UTC).
- **Plan head approved:** revision AFU-r1 at exact head `d02a305245d88e3945bbe4b1e9a80cab10b8f022` (PR #174).
- **Verbatim:** "approve H plan, D-TZ A, D-TZ-2 A, D-H5a A, D-H5b A, D-H5c A."
- **Answers:**
  - **D-TZ = A:** one centre clock with a fixed offset, UTC+0.
  - **D-TZ-2 = A:** keep stored task instants; count open future tasks at R0; reception re-checks open appointments.
  - **D-H5a = A:** the school year containing today's centre date (1 September – 31 August).
  - **D-H5b = A:** a group without a valid year refuses placement; a populated group's year is locked against other-year members.
  - **D-H5c = A:** a trigger on `enrollments`, plus early checks in the three named functions.
- **Also approved in the same message:** the read-only H5 Production dry run "exactly as written in the plan (summary + problem-group detail, read-only transaction, group names/years/counts only, no learner data)". The STOP condition stays binding: any non-zero problem count goes back to the owner with the correction proposal, and the year-check section stays out until approved.
- **Implementation:** the owner asked for the H1–H8 implementation PR to start from a fresh `origin/main` after this plan merges, on the full CI lane.
- **Not approved by this decision:** the merge of this plan (done by the owner), any correction data step, the migration, the merge of the implementation PR and every release step. Each needs its own approval.

## H5 dry-run record

- **Run:** 2026-10-29 about 03:11 UTC (11:11 Asia/Shanghai), under the approval above. The run used the read-only operator path (`supabase db query --linked`, the CLI's standard short-lived login role). The query was the plan's text, with `set transaction read only` first and `transaction_read_only` returned as `on`. It was validated first on a local synthetic stack.
- **Summary:**
  - 8 groups;
  - 0 without a year and 0 with an unreadable year;
  - 0 groups with live members of another year;
  - 0 live enrollments of another year and 0 without a year;
  - 0 populated groups without a valid year.
- **Detail:** 0 problem rows.
- **Consequence:** the STOP condition is met with nothing to correct. No R1 correction step is needed, and the year check ships in the implementation migration. Release R0 re-reads the summary; any difference goes back to the owner.

## Implementation record

Branch `feat/audit-follow-ups`, rebased on `origin/main` `a3d4202` (this plan merged as PR #174). Migration `125_audit_follow_ups.sql`: the recorded Production ledger is 001–124, and no open PR adds a migration. Restore: `scripts/rollback/125_audit_follow_ups_restore.sql`, prepared and tested locally, not run.

**What was built, per item:**

- **H1:** `create_charge_payment_financial` (latest definition: 122), re-created without the Q3 block. The client cap, its message and the reception hint in the receipt form are removed.
- **H2:**
  - `ProgrammePill` (`src/components/operational/ProgrammePill.jsx`) and one pill shape (`src/lib/ui/pill.mjs`).
  - Used on the Students list (table and phone card), the student page, the enrollments page, the groups list and the group page.
  - The editable programme select is drawn as the same pill.
- **H3:** `DOSSIER_LABELS.Enrolled` = « Inscrit »; the guide and tests are updated.
- **H4:** `fileAwaitsGroup` decides the Groupe column's fallback (« Groupe à affecter » for an active file, otherwise « — »).
- **H5:**
  - Three triggers and helper functions in `academic_security`: `check_group_year`, `guard_enrollment_group_year` on `enrollments`, and `guard_group_year` on `groups`.
  - Early year checks in `save_receptionist_enrollment` and `crm_start_enrollment`; `crm_enrollment_groups` returns `annee`.
  - A required year in the group form; a new enrollment takes its year from the chosen group in `EnrollmentModal` and `CrmEnrollmentDialog`.
- **H6:** `src/instrumentation.js`, moved from the root.
- **H7:**
  - `public.centre_utc_offset()`, `public.centre_school_year()` and a new body for `public.business_date()`.
  - 28 functions re-created from the 124 catalog with only the zone substitution.
  - `src/lib/centreClock.mjs` behind every client date and time helper.
- **H8:** `groupMemberIds` is enrollment-only.

**Deviations from the plan text** (within the approved decisions):

1. **H7, two helpers instead of four.** `AT TIME ZONE` accepts an `interval` (ISO sign, verified), so each substitution keeps the original expression and only the zone token changes. The planned `centre_local`/`centre_instant` helpers were unnecessary.
2. **H7, labels kept.** The JSON `timezone` label in four CRM read models and the task command's label check still say `Africa/Casablanca`. They are labels, not time computation. The guards check computation, not labels.
3. **H7, the generator owns every re-created body.** `scripts/generate-centre-clock.py --write|--check` reads the 124 catalog. It also holds the H1/H5 edits and the review's N3/N6 edits (five edited functions), so a reviewer can regenerate every re-created function. CI runs `--check` at 124.
4. **H5, a missing year on group insert.**
   - A group inserted without a year takes the current school year in the trigger, not through a column default. This is because the reception command passes an explicit NULL.
   - The year trigger steps aside only for the consumed Batch D clean-up revert, which alone sets both `eh.membership_sync` and `eh.enrollment_command`.
5. **H5, an old year-less enrollment placed in a group now takes the group's year.** This applies to an old Confirmed enrollment row without a year, which the I9 check used to refuse. Status-only updates, ends and the year close are not year checks.
6. **H2, level badges are pills too.** The group list and group page level badges get the same pill shape (owner: "all matches and consistent design").
7. **H3, guide screenshots not retaken.** Three guide screenshots (`s12`, `s13`, `q02b` in `public/helpdesk`) still show « Inscrit (dossier) » and the former programme style. Retaking them is left to the documentation closeout.

**Test fixtures changed for the new rule.** Several existing fixtures placed enrollments of different school years in one group. They now use a group of the right year, or seed legacy rows with the year trigger disabled, as they already drop the I9 check. No assertion was weakened:
- `test-receptionist-security.sql`;
- `test-online-learning.sql`;
- `test-portal-readiness.sql`;
- `test-enrollment-group-consistency.sql`.

`test-finance-batch-e.sql` asserts the centre clock and the uncapped reception discount instead of the zone name and the cap.

**CI correction (run 40815669660 on `8ef8813`, six database shards failed).**

- **Cause of the time failures.**
  - The CI runner's PostgreSQL (`supabase/postgres:17.6.1.165`, CLI 2.116.0) reads `Africa/Casablanca` as **+01:00** on 2026-10-29; this was measured locally on that exact image.
  - The private stack used for the first evidence ran `17.11.0.004`, which reads +00:00. So tests that computed their expected value with the zone name agreed with the centre clock locally but not in CI.
  - The re-check below runs on the CI image.
- **Ledger ceilings.** Six upgrade checks were bumped from 124 to 125 (ceiling, version list, count), the same files Batch G bumped:
  - `test-crm-batch2-upgrade-current.sql`, `test-crm-h3-upgrade-103-current.sql`;
  - `test-crm-r4-upgrade-100-current.sql`, `test-crm-r4-upgrade-102-current.sql`;
  - `test-premium-retirement-upgrade-113-current.sql`, `test-conflicts-without-retry-upgrade.mjs`.

  `scripts/ci/test_verify.py` pins no ceiling.
- **Expected values on the centre clock.** In 22 test files, expected values computed with `AT TIME ZONE 'Africa/Casablanca'`, with `AT TIME ZONE p.timezone`, or as `'… Africa/Casablanca'` literals now use `AT TIME ZONE public.centre_utc_offset()` (114 substitutions). `scripts/fixtures/crm-work-calendar.sql`, which upgrade rehearsals also load at 107–111, uses a session helper instead: the centre clock once `public.centre_utc_offset()` exists, the zone reading before, so the fixture matches the functions of the version it seeds. The RCC-A2 browser wall clock uses `CENTRE_UTC_OFFSET_MINUTES`. No assertion was relaxed. (The plan's `centre_instant`/`centre_local` helpers do not exist, see deviation 1; the interval form is the same computation.)

  Kept with the zone name on purpose:
  - **Meta ad-account settings and labels:** Insights configurations, `account_timezone`, `attributionDay` and the JSON `timezone` label.
  - **`test-crm-phase7.sql`:** loaded by upgrade tests at 108–112, where the functions under test still read the zone.
  - **`egc-revert-m1.sql`:** a historical body.
  - **`test-report-data.mjs`:** loops machine zones.
  - **The forced-disagreement Intl override in `test-crm-work-calendar-browser.mjs`.**
- **Expected instants before → after, as the CI PostgreSQL computed them:**

  | Test | Before (zone name, CI) | After (centre clock) |
  | --- | --- | --- |
  | `test-crm-phase5.sql` input « 2026-09-22 11:30 » | 2026-09-22 10:30Z | 11:30Z |
  | « 120 minute SLA rolls over lunch » | 2026-09-22 14:20Z | 15:20Z |
  | « SLA rolls after closing » | 2026-09-23 09:00Z | 10:00Z |
  | « SLA rolls closed Sunday » | 2026-09-28 14:00Z | 15:00Z |
  | `test-crm-rcc-a1.sql` « preset in_2_hours resolves to configured Casablanca opening » (CI run at 04:07Z on a Thursday; first opening 10:00) | 09:00Z | 10:00Z |
  | `test-crm-phase4-browser.mjs` « stored callback moves from lunch to the configured Casablanca opening » (next Tuesday 15:20) | 14:20Z | 15:20Z |

  In each case the function under test (migration 125) returned the "after" value; the oracle was one hour early.
- **Year-mismatch fixtures.** In each case the year came from a literal in the fixture, not from an application path. Each enrollment now goes into a group of its own year:
  - **`test-batch3b-security.mjs`:** staff enrollments of 2027/2028 and 2028/2029 are now validated into groups of those years.
  - **`test-receptionist-browser.mjs`:** the 2027/2028 Under Review enrollment is placed in a 2027-2028 group, created and removed with the fixture.
  - **`test-crm-phase6.sql`:** the 2027/2028 Validated enrollment uses a 2027-2028 group.
- **Two date-specific expectations of the former time-zone switches** (`test-crm-work-calendar.sql`) follow the approved fixed offset (D-TZ = A); they are not relaxed:
  - **Day length:** « 23/25 hour Casablanca day » becomes an exact 86,400 s for 2026-02-15 and 2026-03-22.
  - **Appointment instant:** « 10:30 on 2026-03-22 » is expected at 10:30Z instead of 09:30Z.
- **The CI log records the server's reading.** `test-audit-follow-ups.sql` prints it: `01:00:00` on the CI image, against the centre clock's `00:00:00`.
- **Re-check on the CI image** (`17.6.1.165`, private stack, the job's steps replayed from `verify.yml` with remapped ports):
  - `sql-and-concurrency`: 12 of 12 steps pass.
  - `upgrades-from-097-to-105`: 8 of 8.
  - `upgrades-from-106-to-111`: 6 of 6, Work and Calendar after the fixture fix.
  - `upgrades-from-112-to-116`: 11 of 11.
  - `browser-security`: 13 of 13.
  - `browser-crm`: every step except one run of the RCC-B1 suite, which recorded `ChunkLoadError` page errors in its deliberate failed-chunk scenario. The same suite then passed twice in full in Chromium and WebKit. It is treated as a load flake to be confirmed by CI.

**Independent review corrections (review of `b55ab3b`, CHANGES REQUIRED).** Fixed on the same branch; no rule is weakened.

Database:

- **B1 (blocker), reactivation bypass.** `guard_enrollment_group_year` also fires on `status`. A grouped row that becomes live again (from Rejected, Ended or no status) is checked like a new placement, as the capacity guard treats leaving Rejected. `test-audit-follow-ups.sql` adds three paths and the reverse order:
  - the director RPC `save_enrollment_changes` from Rejected;
  - a direct write from Rejected;
  - a direct write from no status;
  - the reverse order: same-year reactivation is accepted, then the group's year is locked.
- **S1.** The portal-readiness "NULL school-year membership" fixture seeds with the year trigger disabled, and asserts the year is still NULL.
- **N1.** A test of the wall-clock → instant direction at UTC+1, using a temporarily replaced clock: the 09:00 opening is 08:00Z and 23:30Z is already the next day.
- **N2.** A test that one clean-up flag alone does not bypass the year check; both are needed.
- **N3.**
  - An update can no longer clear a group's year (`egc.group_year_missing`).
  - The invalid-year message uses « 2026/2027 ».
  - The 23505 on a replayed reception group create without a year came from `save_receptionist_group` (latest definition: 119). It compared the replayed NULL with the year the guard stored. The generator now re-creates it so that a NULL year matches the stored one (fifth edited function).
- **N4, deviations recorded:**
  - `academic_security.place` has no early year check; the trigger raises it with the same hint.
  - The CRM early check in `crm_start_enrollment` uses 22023, not 23514, because its handler turns 23514 into a generic refusal.
  - The generator now really edits five functions, matching its docstring.
- **N5, not inlined (kept).** `public.centre_utc_offset()` keeps `SET search_path`; removing it would trip Supabase's `function_search_path_mutable` lint. Measured on 200k rows (local, CI image):
  - with `SET`: 282–295 ms;
  - without `SET` (inlined): 27 ms;
  - the former zone literal: 56 ms.

  That is about 1.3 µs per row. Batch G's budget test passes in CI. Wrapping the call as `(SELECT public.centre_utc_offset())` (one evaluation per statement) is left as an optional follow-up.
- **N6.**
  - `crm_security.command` (manual-lead birth date), `crm_start_enrollment` (enrollment date) and `save_receptionist_enrollment` (parameter default) now use `public.business_date()` instead of the session `current_date`.
  - The generator asserts that no re-created body contains `current_date`, and the SQL suite has a catalog guard for it.
  - Two Premium workshop functions (`save_receptionist_premium_membership`, `sync_premium_membership_entitlement`) still use `current_date`. They are not converted and are removed by Release B.
- **N7, recorded.** The "no row changes" check of the upgrade test runs on a near-empty database.
- **N8, recorded.** The zone guard catches only the literal zone name.

Application:

- **S1.**
  - In the CRM enrollment dialog, the year field is read-only while a group with a year is chosen.
  - `egc.school_year_mismatch` and `egc.group_year_missing` map to their own French text, with no « Réessayez » (`YEAR_REASONS`), with unit cases.
- **S2.**
  - `test-ui-foundation-browser.mjs` checks, for receptionist and director, the single-line programme pill and the « — » for an Ancien apprenant or Prospect file.
  - For the director it also checks the pill's title and link and that the editable select carries the pill classes.
  - The « Inscrit » assertion is scoped to the status pill.
  - This suite is not wired into CI (known load-sensitive). It ran locally on the CI image.
- **S3, deviation recorded (owner decision: `search_students_page` unchanged).** For director/admin the Groupe cell can show « Groupe à affecter » for an Inscrit file whose only live enrollment is Submitted or Under Review.
- **N1.** The student page's new-enrollment date is the business date (`localBusinessDate`). Five export file names still use the UTC date, which equals the centre date at UTC+0; recorded.
- **N3.**
  - The group form checks consecutive years (`isSchoolYear`).
  - `schoolYearOfGroup` rejects non-consecutive years.
- **N4.**
  - `EnrollmentModal` offers only groups of the enrollment's school year when it is known.
  - The group page's learner picker already filtered by the group's year.
- **N5.** The group page shows « Programme » as a pill and the school year on its own line.
- **N6, recorded.** The Sentry checks live in `test-audit-follow-ups-ui.mjs`, not in a separate `test-sentry-instrumentation.mjs`.
- **N7.** The Sentry scrubber also redacts phone numbers written with spaces, dots or dashes (eight digits or more; ISO dates kept), with unit cases.
- **N9.** `centreParts`/`centreDate`/`formatCentre` throw `RangeError` on an invalid date, as the former Intl helpers did.

**Local evidence** (private Supabase stack on remapped ports, synthetic data only):

- **Unit, lint and build:** `npm test`, lint and build pass.
- **SQL suites:** the 33 rollback-only SQL suites of the CI `sql-and-concurrency` shard pass. So does the new `test-audit-follow-ups.sql`.
- **Concurrency:** the placement and portal concurrency suites pass.
- **Upgrade test:** `test-audit-follow-ups-upgrade.mjs` passes. It shows that the 124 bodies read at UTC equal the 125 bodies over 13 instants, that the catalog changes only in the listed functions with their security posture and grants kept, that no row changes, and that a restore then reapply round trip works.
- **Browser:** `test-ui-foundation-browser.mjs` passes in Chromium and WebKit. A visual check of the Students list, group form and student page was done on a local build.
- **Sentry (H6), local only:**
  - The built app now contains `.next/server/instrumentation.js`.
  - A synthetic route-handler error reached a local capture listener. The e-mail and phone number were redacted, the cookie redacted and the query string removed.
  - No error was sent to the real DSN or triggered on Production.

# Release record (R0–R3)

**R0, R2 and R3 DONE (2026-10-30); R1 not needed; restore not run.** A fresh release session received the owner's release approval at about 04:14 UTC. Verbatim: "approve H release now: R0 and R2 only. No R1 (the H5 dry run was clean: 8 groups, all zeros)."

- **Reviewed artifact:** PR #175 head `a3950e75180a514567c9a3ca1d012071fc0998c3`; `125_audit_follow_ups.sql` with MD5 `110098f92be6543c46a9fd844a590004` and blob `3c233cb097f06eab1927f38d9802ca5bc50c7341`.
- **Restore script:** `125_audit_follow_ups_restore.sql`, MD5 `15bc47db78c24fb9411b07a34bc68d2d`; not approved to run.
- **Merge (R3):** the owner told the coordinating session to merge after R2, as the approval set out.

Times are UTC on 2026-10-30. Counts and hashes only, no personal data.

- **Before Production:**
  - The PR head was unchanged, `required` was green, and the file's MD5 and blob matched the approved values.
  - `main` was `a3d4202`.
  - All of this was re-checked at 05:00:32.
- **R0 (04:15–04:18, read-only):**
  - **Ledger:** exactly 001–124; rows 122–124 have their recorded MD5s.
  - **Catalog:** equal to a clean local 124 build.
    - All 467 functions matched one by one on body, owner, ACL, security mode and settings, including the 34 that 125 replaces.
    - Relations, columns, constraints, policies, triggers, indexes and schemas also matched.
    - The only difference is D1's `receipts_number_required` constraint, from the approved data step of 2026-10-28.
  - **Clock:** PostgreSQL 17.6, server `TimeZone` UTC; `Africa/Casablanca` still reads as **+01:00**.
  - **H5:** the dry-run summary re-read unchanged: 8 groups, all zeros.
  - **D-TZ-2:** **1** open future CRM task, a manual `center_visit` appointment, plus 46 overdue open tasks (47 open in all). D-TZ-2 = A keeps the stored instants.
  - **Safety copy:** a targeted catalog export into the owner's private backup folder (folder 700, files 600, not uploaded or committed). It holds:
    - definitions, owners and ACLs of the 34 replaced functions, as JSON and SQL;
    - the 14 triggers on `enrollments` and `groups`;
    - `SHA256SUMS`.

    Migration 125 changes no row data.
- **R1:** not run; the H5 dry run found nothing to correct.
- **R2 (guarded wrapper, [method](../../ai/WORKFLOWS.md#guarded-release-wrapper)):**
  - **Rehearsal:** both wrapper files ran first on a private local stack: dry run, apply, and a second apply refused with `R2_PRE_LEDGER`.
  - **Dry run (05:00:39–05:00:47):** ended in `DRYRUN_OK all 125 guards passed`. A re-read afterwards showed ledger 124 and every digest unchanged.
  - **Apply (05:01:08–05:01:14):** committed, exit 0. Wrapper SHA-256 `3098beb4…`; it differs from the dry run only in its header line and in ending with `commit` instead of the sentinel.
  - **Read-only checks (05:01:30):**
    - **Ledger:** 001–125. Row 125 `audit_follow_ups` has stored MD5 `110098f92be6543c46a9fd844a590004`, equal to the reviewed file, and `created_by` copied from row 124.
    - **Clock:** `centre_utc_offset()` is `00:00:00`, `business_date()` is 2026-10-30 (the UTC date) and `centre_school_year()` is 2026/2027.
    - **Zone name:** no function body uses `Africa/Casablanca` in a time calculation. The name remains only in:
      - the two functions kept on purpose, `crm_get_marketing_cohort` and `egc_cleanup_c1`;
      - text labels in five CRM functions ([deviation 2](#implementation-record)).
    - **Triggers:** `enrollment_group_year_guard` is enabled, `BEFORE INSERT OR UPDATE OF group_id, school_year, status` on `enrollments`. `groups_year_guard` is enabled, `BEFORE INSERT OR UPDATE OF annee` on `groups`.
    - **Payment function:** `create_charge_payment_financial` has no reception cap.
    - **Catalog:** all nine digests equal a clean local 125 build.
      - Functions 467 → 472: 5 added, none dropped.
      - Exactly the 34 expected functions changed, each keeping its owner, ACL, security mode and settings.
      - Triggers 168 → 170; nothing else changed.
- **R3:**
  - PR #175 was squash-merged at 05:15:17 as `858e5eec980331b91407e8a6b83880f3d1533f3b`.
  - GitHub `Production` deployment `7431321529` reported `success` at 05:17:07.
  - Between 05:01 and 05:17 the previous application ran on the new database, which [Rollout](#rollout) shows is safe.
- **R4 (this docs closeout):**
  - CURRENT_STATE, the plans index, OWNER_DECISIONS and ADR-014 are updated.
  - The guide screenshots s12, s13 and q02b were retaken. They now show the « Inscrit » status pill, the programme pills and « Groupe principal ».
  - The retake used the released build on a private local stack with synthetic data, at the same sizes and with the same call-outs.
- **Not recorded:** Vercel runtime errors (not readable from these sessions), an HTTP probe of the deployed application and an observation window.
- **Open:**
  - The owner's first morning check: a reception discount above 10 %, the programme pills, the group year, and that the one open future appointment shows the right time.
  - The restore script stays unapplied and needs its own approval.
- **Process note:** the release brief pointed to a "guarded release wrapper" section of [WORKFLOWS](../../ai/WORKFLOWS.md), which did not exist. The release session followed the method of the [Batch G release record](speed-as-the-centre-grows.md#release-record-r0r3). This closeout adds a short [Guarded release wrapper](../../ai/WORKFLOWS.md#guarded-release-wrapper) section describing that method as it was used for 125.
