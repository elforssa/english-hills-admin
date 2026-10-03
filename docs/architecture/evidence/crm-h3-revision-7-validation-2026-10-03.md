# H3 Revision 7 — evidence and decision ledger, 2026-10-03

**Architecture/documentation only; proposed, not owner-approved or operationally verified.** [Revision 7](../plans/crm-h3-05-revision-7-validation.md) is Tier 3 because it changes credential-acceptance and recovery governance. Baseline `ffd06e5a669a51a8b2934dbf648d1d2214f40606`. No new authenticated Meta/account inspection or Production verification occurred.

## Commission and historical evidence

The owner's direct attached request commissions a support-independent, fail-closed architecture and a documentation PR after merged PR #63. It explicitly states that Meta support/attributable engineering must not be a prerequisite and prohibits all Meta/credential/Production mutations, support contact and provider events. This author has authority to propose Revision 7, not to approve or execute it. Future approval must record the exact reviewed revision/commit and explicit owner decisions; none is recorded now.

GitHub readback confirms [PR #63](https://github.com/elforssa/english-hills-admin/pull/63) MERGED, head `e990f026f83ea751a0a8adaad69446cfbea1784d`, base `2d7bb604b765729eb838b63544d0cb15f3d61e5e`, merge `ffd06e5a669a51a8b2934dbf648d1d2214f40606`. Its [B1/B4 dossier](crm-h3-b1-b4-research-2026-10-03.md) is preserved byte-for-byte. Public documentation's missing account-specific details and unsent questions remain historical facts. Those questions are not an active next step under the new commission. The earlier [Option C evidence](crm-h3-05-option-c-2026-10-03.md) is likewise unchanged.

## Source and reasoning ledger

| Evidence | Provenance / observation | Revision-7 use and limit |
| --- | --- | --- |
| Own-app issuance | PR #63 R1/R2/R8: official CAPI Get started, System User install/generate, CRM guide | General mechanism, not an exact OAuth/task recipe. Revision 7 measures bounded effective authority later |
| Group invalidation | PR #63 R3 and earlier account observations in the Option C register | General all-token invalidation plus observed account Revoke controls. No proven new-identity target/control or human API caller contract; mandatory future rehearsal establishes actual usable account control |
| Individual revocation | PR #63 R2 | Remains real but unselected. No assumed human cross-subject caller, second lifecycle token or EH recovery API needed by selected design |
| App/asset/task layers | PR #63 R4/R6/R7 plus Option C C03/C05/C09 and A01–A04 | App capability, role, task, scope and effective assets remain distinct; prior labels/old Admin grants do not establish new Employee uploads |
| Test-event risk | [Revision-5 H3-P2](../plans/crm-h3-technical-readiness.md#revision-1-official-sources), official [Using the API](https://developers.facebook.com/documentation/ads-commerce/conversions-api/using-the-api), read there on 2026-10-02 | Inherited official-source finding: test-coded events can affect measurement/targeting. No isolated exact-CRM sandbox is established; reject synthetic event probe |
| Source implementation | [Adapter](../../../src/lib/crm/lifecycle/adapter.mjs), [worker](../../../src/lib/crm/lifecycle/worker.mjs), [server](../../../src/lib/crm/lifecycle/server.js), [106](../../../supabase/migrations/106_crm_lifecycle_provider_contract_r4_seed.sql) at baseline | Token-only multipart, original lead ID, strict seconds, exact numeric receipt, no uncertain replay and independent gates; no operator-recovery or safe test sandbox implementation |
| App separation | [Inbound webhook](../../../src/app/api/webhooks/meta/leads/route.js) uses the inbound app secret; baseline adapter has no recovery service | C2 isolation benefit is an architectural inference, not a claim about successful provisioning or token-level scope reduction |
| Production dormancy | [H3-04 release evidence](crm-h3-04-production-2026-10-02.md) | Inherited ledger 001–106 and dormant gates; no fresh deployment or data inspection |

A focused public search during drafting did not supply new primary evidence of safe test-event isolation. An attempted official legacy Using the API URL returned HTTP 429. Third-party results were not adopted as provider authority. The inherited official warning is sufficient to reject the proposed synthetic probe; neither a failed fetch nor third-party claims establish an isolated mode. No new broad research loop or support question was undertaken.

## Deliberate architecture judgments, not observed success

- Select **C2** in the proposed architecture to separate app-level administration/secret incidents from existing intake. Existing app/users remain untouched; no extra dataset, Page/ad-account defaults or unrelated responsibilities.
- Define **B1 at architecture level** by inspectable effective-authority constraints and failure behavior; leave actual tasks/scopes/metadata to later validation. Administrative entitlement acceptance is explicitly distinct from successful CAPI receipt. Incomplete/ambiguous entitlement cannot be accepted.
- Select **non-event credential acceptance** plus local synthetic transport tests, because a safe synthetic provider send on the existing dataset is not established. Successful sending stays NOT VERIFIED until separate H4 ordinary eligible use. Owner acceptance of this limitation is required; no unisolated probe is silently allowed instead.
- Define **B4 at architecture level** by exclusive identity-wide invalidation with downtime and a required initial A/revoke/verify/B rehearsal, using actual independent human account control. All operational capability remains unproved until that separately authorized rehearsal passes.
- B2/B3 remain preflight; B5 remains owner custody with exact tool/ACL binding before credentials. No Meta support/engineering response is a gate at any stage. Failed empirical validation stops acceptance and returns a precise failure, not a research/support dependency.

The complete owner decisions and future action sequence are in Revision 7. No claim of ARCHITECTURE APPROVED, PREFLIGHT VERIFIED, CREDENTIAL ACCEPTED, DORMANT INTEGRATION ACCEPTED or LIVE ACTIVATED is made by this task.

## Validation and handoff scope

Documentation-only diff, relative links/anchors, source/provenance, secret/PII absence and `git diff --check`; one focused author self-check; unchanged required CI for current PR head/base. Final PR handoff supplies exact head, base, synthetic tested merge and CI links/results rather than embedding a self-referential commit hash here. No application tests duplicated locally for Markdown-only work. No independent-review verdict from this author.

No Meta/credential/Production mutation or support contact occurred. No credential/app secret accessed, app/user/asset changed, event sent, migration created, Vercel/Supabase configuration changed, H3-06–08/H4 executed or legacy flow modified. Merge/release remains held for explicit owner approval and the required separate review/operator flow.
