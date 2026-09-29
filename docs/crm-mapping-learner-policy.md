# Immutable form-mapping learner policy

> Implementation/activation reference with historical phase notes. Deployment and enablement statements below describe that phase, not necessarily the present environment; consult [CURRENT_STATE](ai/CURRENT_STATE.md). Later reconciliation/scheduling behavior is documented in [ADR-002](architecture/decisions/ADR-002-meta-intake-and-reconciliation.md).

Migration 093 replaces migration 092's website-only form-key check with
`crm_form_mappings.learner_policy`, a non-null `required` / `optional` field.
Both publishing RPCs accept the field, reject null, invalid values and unknown
properties, and return the stored policy. Omitting the field when publishing a
new version stores `required`, including for website general/adult forms.
Publishers must explicitly send `optional` for new optional versions.

## Compatibility and immutability

The migration backfills existing website `general_contact_v1` and
`campaign_adult_lead_v1` versions to `optional`, including retired versions.
Every other existing mapping remains `required`. The backfill captures exactly
092's behavior; it does not replay or edit submissions, leads, tasks or answers.
It holds an exclusive mapping-table lock and temporarily disables only the
mapping immutability trigger inside the migration transaction. The trigger is
restored before commit and protects the new field automatically.

Submissions retain their original `form_mapping_id`. Publishing or retiring a
version cannot change that submission's learner policy. Missing mappings fail
closed. The old `website_learner_optional` helper is removed; form-key exceptions
exist only in the one-time data backfill, not in runtime resolution or publishing.

## Resolution and receptionist behavior

The shared accept/resolver functions and intake review now use
`crm_security.mapping_learner_optional(submission_id)`. Required mappings retain
the existing named-learner branch, sibling handling, birth evidence checks,
contact corroboration, program/session matching and review behavior.

Optional unnamed inquiries still require a contact name, phone or email, and
program. They create a NEW lead with both learner name fields NULL and the
normal first-contact task. An existing contact must be uniquely corroborated
by name and available phone/email evidence. Reuse requires exactly one active
opportunity, also unnamed and unconverted, with the same program and session.
Named opportunities, competing active opportunities and inconsistent or
uncertain evidence stay in review. No learner name is inferred from a contact.

The review response keeps its existing `learner_optional` boolean contract.
The existing UI consequently shows “Apprenant (facultatif)” for either channel,
permits an empty learner, and displays “Apprenant à préciser” in Today,
Prospects and the detail drawer. Explicit staff attachment after review remains
an existing, intentional action; automatic matching is conservative.

Both providers already share normalization. Canonical mappings populate
`core_fields`; safe questions remain in `form_answers`, including typed answers
and provider question labels. Age ranges are not integer learner ages.

## Future Yearly-program payload (not published)

```json
{
  "form_key": "1086266294126723",
  "form_name": "Yearly-program",
  "field_map": {
    "contact_name": "full_name",
    "phone": "phone_number",
    "whatsapp": "whatsapp_number"
  },
  "learner_policy": "optional",
  "default_session_type": "Yearly",
  "default_program_interest_text": "Programme annuel"
}
```

`âge_de_l'enfant` (for example `7-8`) and the travel answer remain unmapped
answers. No production connection, mapping, token, setting or test lead is
created by this change.

## Local verification

Use only local Supabase (`127.0.0.1:54322`) with synthetic fixtures. SQL suites
run in transactions and roll back. Concurrency/browser suites remove their
committed fixtures in `finally` and restore history guards.

- `scripts/test-crm-phase8.sql`, `scripts/test-crm-phase9.sql`
- `scripts/test-crm-no-learner-website.sql`
- `scripts/test-crm-mapping-learner-policy.sql`
- `python3 scripts/test-crm-phase8-concurrency.py`
- `CRM_TEST_LEARNER_POLICY=optional python3 scripts/test-crm-phase8-concurrency.py`
- `python3 scripts/test-crm-phase9-concurrency.py`
- `node scripts/test-crm-phase8-browser.mjs`
- `CRM_TEST_LEARNER_POLICY=optional node scripts/test-crm-phase8-browser.mjs`
- `node scripts/test-crm-phase9-browser.mjs`
- `npm test`, `npm run test:crm-intake`, `npm run lint`, `npm run build`

The browser suites expect the local app on port 3101; Phase 8 uses the synthetic
process values `CRM_META_VERIFY_TOKEN=phase8-local-fixture-verify` and
`CRM_META_APP_SECRET=phase8-local-fixture-secret`. Website browser tests also
need a synthetic `CRM_WEBSITE_RATE_LIMIT_SECRET` and an empty
`TURNSTILE_SECRET_KEY` in the local server process to avoid external CAPTCHA
calls (CAPTCHA contracts are tested separately with mocked responses).
Do not configure these in any
external service or persist them as production secrets.

For historical replay, supply a schema-only dump from an application-empty
local Supabase platform database to
`python3 scripts/test-crm-mapping-policy-replay.py /path/to/platform-schema.sql`.
The runner creates and removes two dedicated databases in the local Supabase
container. It replays unchanged 001–092 before 093, runs SQL regressions on a
fresh database, and checks that upgrading active/retired mappings preserves
stored submissions, resolved leads, tasks and each original policy decision.
It never resets the development database or copies application data.

## Verification result

Fresh 001–093 replay and the 092→093 upgrade fixture passed. Phase 8/9 SQL,
normalization/worker tests, unnamed-learner regressions, required/optional Meta
concurrency, cross-channel concurrency, required/optional Meta receptionist
browsers, and Website Today/Prospects/review browsers passed. `npm test`, lint,
production build and diff whitespace checks passed; lint/build report the
existing Sidebar image warning. Initial browser runs needed the documented
local fixture environment and route warm-up before passing.

Final local checks found zero CRM test connections, mappings, jobs,
submissions, contacts, leads, tasks, activities and policies; no fixture users,
disabled CRM triggers or disposable replay databases remained. Migration 093
is applied and recorded locally. No commit, push or production change occurred.
