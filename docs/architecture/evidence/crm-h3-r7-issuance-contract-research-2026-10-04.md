# H3 Revision 7 — issuance-contract evidence for PR #91

Observed/researched 2026-10-04; **Tier 3, noncredential evidence only**. Supports [R7-BOOT-OP1](../plans/crm-h3-r7-bootstrap-credential-operator-packet.md). **G0 remains BLOCKED; the execution-ready outcome is not achieved.** Continue resolution in the same task/PR. Missing evidence alone requires no architecture amendment.

## Provenance and limits

| Source | Version / observation and bounded result |
| --- | --- |
| [Meta debug-access-token source](https://github.com/facebook/agentic-tools/blob/fb896e4106e43ce033830a8ee478c64285f47d2c/plugins/devtools/skills/debug-access-token/SKILL.md) | Official `facebook/agentic-tools`, pinned commit `fb896e4106e43ce033830a8ee478c64285f47d2c`; fetched raw source 2026-10-04, interpretation section lines 89–103. Distinguishes validity, class, owning app and permissions. A past `expires_at` denotes expiration; `expires_at=0` denotes no expiry. A past `data_access_expires_at` denotes lapsed data access. Does not define zero/missing data-access expiry, zero/missing issuance time, literal System User enum, C2 issuance choices or target completeness |
| [Meta bundled probe source](https://github.com/facebook/agentic-tools/blob/fb896e4106e43ce033830a8ee478c64285f47d2c/plugins/devtools/skills/debug-access-token/scripts/debug_token_probe.py) | Same pinned version, fetched 2026-10-04. Projects diagnostic fields and granular scope names; excludes identifying target values. Projection is not a provider completeness guarantee. The script is neither executed nor adopted as a credential route |
| [Meta System User issuance documentation](https://developers.facebook.com/docs/business-management-apis/system-users/install-apps-and-generate-tokens), [debug_token reference](https://developers.facebook.com/docs/graph-api/reference/debug_token/), [CAPI get started](https://developers.facebook.com/documentation/ads-commerce/conversions-api/get-started) | Current fetch attempts returned HTTP 429 or inaccessible responses. No current page text was obtained; titles/URLs do not establish semantics. Browser inventory contained no available browser; no account was opened |
| [Prior B1/B4 research](crm-h3-b1-b4-research-2026-10-03.md), [4C semantic evidence](crm-h3-r7-4c-semantic-evidence-2026-10-04.md), [4C closeout](crm-h3-r7-4c-execution-closeout-2026-10-04.md) | Adopted grant evidence: Employee, C2 Develop app partial, intended dataset Use events dataset partial and accepted same-endpoint View Pixels partial. Administrative tasks do not identify an OAuth selection, expiration choice or automatically returned scope set |
| [Subject/target research](crm-h3-r7-inspector-linkage-subject-binding-research-2026-10-04.md), [two-stage amendment](../plans/crm-h3-05-r7-two-stage-inspector-bootstrap-amendment.md), [Revision 7 B1](../plans/crm-h3-05-revision-7-validation.md#b1-effective-authority-acceptance-contract) | Adopted continuity/S0–S3 and effective-authority reconciliation remain mandatory. Optional raw subject corroboration unsupported without canonical mapping; granular target completeness cannot be inferred from absence |
| Owner's PR #91 continuation instruction | Reports independent Tier-3 preparation review of `15da2600461ffea1d672ab0872d5c481b0e4c429` as READY FOR FINAL REVIEW, with no packet defect; ambiguous-A containment complies with architecture. This is owner-supplied review evidence, not this author's verdict or a claimed GitHub-native review. It does not review the new head or clear G0 |

The official source files are research material, not newly invoked operational skills. Their environment-variable/app-secret probe and generic remediation examples are outside the adopted human-only route and one-revoke architecture. Other integrations' permission or expiration recipes, third-party guides, and SDK fields that merely copy values cannot bind this C2 contract.

## G0-A — exact A/B scope contract

**Unresolved.** No authoritative exact requested set, forced/locked additions, task-derived scope rule or legitimate unselected returned scope set has been established for `61594989243533 / EH Lifecycle R4 Employee` and `29771601672426816 / EH Lifecycle R4 C2` against endpoint `1152399921284927`. The navigation row `1568116421343147` remains navigation only.

The eventual contract must enumerate both the requested set and any independently evidenced returned additions, explain each power within the adopted boundary, and bind **identical A and B selections**. Available UI options alone are not an approved requested set or proof of sufficiency. Never choose an empty set, `ads_read`, `ads_management`, `business_management` or `leads_retrieval` by inference. Missing an established required scope is FAIL. An established extra forbidden authority is FAIL. A scope whose requirement, addition rule or effective reach cannot be reconciled is INCONCLUSIVE; neither result permits expansion or storage.

## G0-B/C — inspection contract and remaining interpretation gaps

“Required” below is the adopted acceptance requirement, not a claim that Meta guarantees the field for every token. Availability is empirical during separately approved A/B inspection. Unsupported required semantics or missing required evidence stay INCONCLUSIVE. Only optional subject corroboration is currently classified unsupported without preventing S0–S3 acceptance.

| Field / evidence | Classification and acceptance rule |
| --- | --- |
| `is_valid` | **Required** explicit true; false FAIL; absent/ambiguous INCONCLUSIVE. Never infer validity from a rendered result |
| `type` | **Required** expected System User class. Official source names the class but does not bind a literal enum for this issuance. Human/app/Page class contradiction FAIL; unbound representation INCONCLUSIVE. Do not invent `SYSTEM_USER` as a literal expected value |
| `app_id` | **Required** exact C2 `29771601672426816`; different app FAIL; missing/ambiguous INCONCLUSIVE |
| `application` | **Required coherent app corroboration** under the packet: expected EH Lifecycle R4 C2. Contradiction FAIL; absent or unestablished alias/representation INCONCLUSIVE; label alone cannot substitute for exact app ID |
| `issued_at` | **Required lifetime/issuance coherence**; no class-specific zero/missing behavior or timestamp tolerance established. Unexplained absence/special value INCONCLUSIVE. Do not silently use continuity as a timestamp substitute |
| `expires_at` | **Required lifetime interpretation**. Generic official semantics support past → FAIL (expired), zero → no expiry. Zero does not itself prove this issuance's selected lifetime or permanent irrevocability. Future expiry still needs coherence with the approved issuance choice and feasible rotation; unresolved choice/coherence INCONCLUSIVE |
| `data_access_expires_at` | **Required lifetime interpretation**. A documented applicable past value → FAIL (lapsed). Zero, absence, applicability to this System User class and relation to selected expiry are unresolved → INCONCLUSIVE. Do not equate zero with unlimited data access |
| `scopes` | **Required** reconcile names against the exact requested/returned contract; G0-A prevents PASS now. Missing required scope or confirmed extra forbidden authority FAIL; unestablished scope semantics/additions INCONCLUSIVE |
| `granular_scopes` / target details | **Required target-binding evidence when authority carries targets**. Scope names may be retained; raw target IDs may not. No reviewed class/scope-specific namespace or completeness rule currently binds target lists. Missing target detail, unknown namespace or incomplete inventory INCONCLUSIVE; positively mapped forbidden target FAIL. Absence never proves no extra authority |
| Raw `user_id` or another subject field | **Optional corroboration / unsupported mapping**. Never persist. Record `unsupported` unless separately evidenced canonical mapping exists. Mandatory subject proof remains uninterrupted continuity plus exact issuance subject/app and fresh debugger class/app; contradictory evidence stops |
| Broader asset/inheritance evidence | **Required** complete reconciliation with adopted B1; known allowed IDs are reference inventory, not proof that unknown token-target IDs represent them. No inventory fallback is introduced without reviewed completeness evidence |

No exact numeric token lifetime, permanent selection or selector availability is established for this C2 surface. Revision 7's metadata review every 30 days and rotation before the earlier of issuance + 90 days or actual expiry − 7 days remain lifecycle policy, **not provider lifetime guarantees**. An expired/incoherent credential or infeasible rotation fails acceptance; unknown lifetime interpretation remains INCONCLUSIVE. Neither A nor B may be issued to discover missing semantics.

## One bounded owner evidence request — pending

In Meta **Business Settings → Users → System users**, select **61594989243533 / EH Lifecycle R4 Employee**. Only if an already-known nonmutating token-configuration chooser is safely accessible, select **29771601672426816 / EH Lifecycle R4 C2** and report **text only**:

- Exact permission names; defaults, locked/forced additions and explicit-selection versus task-derived behavior; nonsecret explanatory text about returned additions.
- Expiration choices, default, units and nonsecret explanatory/help text, including any linked official field-semantics reference.
- If the chooser is unavailable or opening it could issue a token, report that limitation and stop.

Do **not** click final Generate/Issue/Confirm, revoke, assign, save or change grants; do not open existing credentials or the debugger. Do not copy a token/fragment/hash, app secret, cookies/session headers, raw subject or unknown target IDs, raw request/response, query-bearing URL or screenshot. Do not ask the operator to generate a token to fill this observation.

This is a noncredential evidence request, not approval to execute the packet, and this author does not access the account. On receipt, bind provenance/date and assess the observation in **this same task/PR**. It may resolve chooser facts; it does not automatically prove required scopes, debugger type/expiry meanings or exhaustive effective authority. Corroborate those against first-party evidence before clearing G0. If evidence remains unavailable, identify the exact remaining fact without creating a preparation-PR chain. Request architecture resolution only for an evidenced boundary conflict or inability of the adopted safe inspector to establish a required acceptance fact, not merely a failed public fetch.

No monitor install/operation, authenticated Meta account observation by the author, credential generation/inspection/revoke, grant mutation, Vercel operation or event action occurred. **G0-A unresolved; G0-B partially evidenced/unresolved; G0-C partially evidenced/unresolved.** No execution-ready or execution-authorized claim is made.
