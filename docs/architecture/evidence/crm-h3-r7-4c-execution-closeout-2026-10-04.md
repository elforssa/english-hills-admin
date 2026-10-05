# H3 Revision 7 — 4C execution closeout, 2026-10-04

> **HISTORICAL — SUPERSEDED BY S1.** S1 was owner-adopted and merged through PR #93 / main `284c2fe32014f8f3011ac6677ddfe99b0a16ca22`. Use the [sole active S1 Gate-B credential runbook](../plans/crm-h3-s1-gate-b-credential-runbook.md). Conflicting credential/bootstrap/inspector/rehearsal/per-action instructions below are retired, not execution requirements. Preserve original dated observations, findings and approval scope; unrelated R4 delivery safeguards remain. No historical approval authorizes current credential execution or activation.

## Scope and authority

**Tier 3 — documentation-only execution closeout.** This artifact records the owner-authorized 4C-only Meta dataset assignment performed under reviewed and merged [4C-OP1](../plans/historical/crm-h3-05-revision-7-4c-operator-packet.md), adopted on main **`ae3d7fffb31aa3e296c05ddac1ddc535d31e13e0`**.

This closeout authorizes no further Meta mutation, remediation, credential action or event send.

Owner action authorization bound:

- Business: Glory Lot / `1741597822557523`
- Employee: EH Lifecycle R4 Employee / `61594989243533` / EMPLOYEE
- preserved C2: EH Lifecycle R4 C2 / `29771601672426816`
- target dataset endpoint: English Hills pixel / `1152399921284927`
- historical dataset navigation row: `1568116421343147`
- exact 4C task: **Use events dataset — Partial access**
- broader **Manage events dataset — Full access** prohibited
- exactly one persistent **Assign assets** confirmation
- complete noncredential readback required
- STOP before every credential operation

## Execution window and operator

| Field | Recorded fact |
| --- | --- |
| Sole human operator | **Maroine El Forssa** |
| Authorized UTC window | **2026-10-04 04:00–05:00 UTC** |
| Actual execution start | **2026-10-04 04:00:42 UTC** |
| Side-effect characterization / stop | **2026-10-04 04:12:33 UTC** |
| Final regression-confirmation completion | **No later than 2026-10-04 04:31:05 UTC**; owner confirmations were supplied before the clock read at that time |
| Effective deadline | **2026-10-04 05:00 UTC** |
| Persistent 4C confirmations | **Exactly one Assign assets confirmation reported** |
| Retry/reapply/remove | **None** |
| Credential operations | **None** |

The exact confirmation-click second was not separately captured and is not inferred.

## Fresh pre-action baseline

### Lifecycle Employee

**EH Lifecycle R4 Employee / `61594989243533` / EMPLOYEE**

Fresh Assigned assets state before 4C:

- UI total: **1 business asset**
- App: **EH Lifecycle R4 C2**
- Partial access summary: **Develop app, View insights and Test app**
- target dataset not assigned
- no Pixel row assigned to the lifecycle Employee

Installed apps remained the previously established empty state; the owner requested not to repeat unchanged screenshots and no change was reported before 4C.

### Target dataset

**English Hills pixel**

Canonical endpoint:

**`1152399921284927`**

Current Business Settings URL/navigation used historical row ID:

**`1568116421343147`**

The endpoint/navigation distinction remains explicit; the navigation ID does not replace the target endpoint.

Fresh target-dataset baseline before 4C:

- owner: Glory Lot
- status: Dataset is receiving events
- People: **1**
  - Conversions API System User
  - Partial access: **Use events dataset**
- Partners: **0**
- Connected assets: **1**
  - KAL ad account

The existing KAL ad-account connection and protected Conversions API System User relationship pre-existed 4C and were not authorized to change.

### Protected objects

The owner explicitly requested not to repeat screenshots for previously established protected baselines where nothing had changed. The 4C action authorization nevertheless preserved the merged 4B closeout baseline as the comparison reference:

- Conversions API System User `100089438321765`
- English Hills CRM `61594759444572`
- protected app English-hills `1069638329182835`
- C2 `29771601672426816`

No pre-4C drift was reported.

## Submission-boundary reconfirmation

Immediately before the one persistent 4C confirmation, the owner supplied a current Meta modal showing:

- asset type: **Datasets**
- selected dataset: **English Hills pixel** only
- target already reconciled to endpoint `1152399921284927`
- **Use events dataset — Partial access** ON
- **Manage events dataset — Full access** OFF
- no other dataset selected
- final persistent control: **Assign assets**
- sufficient time remained for complete post-action characterization

## Performed mutation

The owner clicked **Assign assets exactly once** for:

- Employee `61594989243533`
- target dataset endpoint `1152399921284927`
- **Use events dataset — Partial access**

No second confirmation, retry, removal, reapplication, alternate dataset or alternate task occurred.

## Immediate post-action Employee readback

The normal lifecycle Employee → Assigned assets view showed **three** visible business-asset rows:

1. App: **EH Lifecycle R4 C2**
   - Partial access (Develop app, View insights and Test app)
2. Pixel: **English Hills pixel**
   - Partial access (**View Pixels**)
3. Dataset: **English Hills pixel**
   - Partial access (**Use events dataset**)

The intended dataset grant is visible.

However, the new Pixel / View Pixels row was **not part of the exact authorized 4C final state**. Before 4C the lifecycle Employee had only the C2 relationship; after the single dataset grant the UI displayed both the dataset task and a separate Pixel task.

No operator action selected a Pixel asset or View Pixels permission.

## Target-dataset-side post-action readback

The target dataset People view now shows **2 people assigned to this dataset**:

1. Conversions API System User
   - Partial access (**Use events dataset**)
2. EH Lifecycle R4 Employee
   - Partial access (**Use events dataset**)

This confirms the intended dataset assignment itself committed successfully.

No Manage events dataset permission is shown for the lifecycle Employee.

## Unexpected provider-coupled side effect

Observed unauthorized delta under the reviewed 4C-OP1 success contract:

**EH Lifecycle R4 Employee gained a separate English Hills pixel → Partial access (View Pixels) row.**

This appears provider-coupled to the dataset assignment because:

- the operator selected only the Datasets category and exact target dataset;
- the operator enabled only **Use events dataset**;
- **Manage events dataset** remained off;
- no Pixel asset was selected;
- no second confirmation occurred;
- the same dual pattern exists on the protected Conversions API System User baseline: Pixel/View Pixels plus Dataset/Use events dataset.

The final bullet is corroboration only. It does not itself prove provider coupling or retroactively authorize the side effect.



## Final read-only regression confirmations

After the dataset assignment and side-effect characterization, the owner performed the remaining required read-only confirmations without making any further Meta mutation:

- **EH Lifecycle R4 Employee Installed apps:** none
- **Protected System User `100089438321765`:** unchanged from the fresh pre-action baseline
- **Protected System User `61594759444572`:** unchanged from the fresh pre-action baseline
- **Protected app English-hills / `1069638329182835`:** unchanged from the fresh pre-action baseline
- **C2 `29771601672426816` Connected assets:** none
- **Target dataset Partners:** 0, unchanged
- **Target dataset Connected assets:** only the pre-existing **KAL ad account**, unchanged

No retry, remove, reapply, Manage action, token action, credential access, Production action or event send occurred during these confirmations.

The confirmations were complete before the clock was checked at **2026-10-04 04:31:05 UTC**, establishing a conservative completion upper bound of **04:31:05 UTC**, which is inside the authorized 04:00–05:00 UTC execution window. The exact final-confirmation second is not inferred.

These confirmations complete the remaining same-surface protected-object and target-dataset regression checks required by 4C-OP1, subject to the already documented visibility limits of the safe Meta Business Settings surfaces.

## Focused provider-coupling assessment

The evidence now supports the following narrow assessment for independent review:

1. The operator selected only the **Datasets** asset type.
2. Only **English Hills pixel** was selected.
3. Only **Use events dataset — Partial access** was enabled.
4. **Manage events dataset — Full access** remained off.
5. Exactly one **Assign assets** confirmation occurred.
6. Target-dataset-side readback shows the intended lifecycle Employee grant exactly as **Use events dataset — Partial access**.
7. The lifecycle Employee also gained a separate visible **Pixel / View Pixels** row without any separate Pixel selection or confirmation.
8. The protected existing Conversions API System User in the same Glory Lot business already exhibits the same paired pattern:
   - Pixel / View Pixels
   - Dataset / Use events dataset
9. No unrelated dataset, app, Page, ad account, Instagram, catalogue, audience or protected-object permission changed.
10. All remaining post-action protected and dataset-side regression checks passed.

This pattern is consistent with Meta automatically surfacing a coupled Pixel-read permission when the dataset task is granted for this combined Pixel/Dataset object. The evidence does **not** establish a general provider rule beyond this observed object/flow, and no hidden provider behavior is inferred.

### Proposed narrow acceptance amendment

Independent review may accept the following amendment without any new Meta mutation:

> For the specific English Hills combined Pixel/Dataset endpoint `1152399921284927`, assigning **Use events dataset — Partial access** to the lifecycle Employee may cause Meta Business Settings to additionally surface **Pixel → English Hills pixel → View Pixels** as a provider-coupled visible permission. This paired View Pixels row is acceptable only when it appears automatically from the one reviewed dataset assignment, remains limited to the same target endpoint, introduces no management/full-access authority, and all protected/unrelated regression checks remain unchanged.

If accepted, the observed paired Pixel row becomes part of the reviewed expected post-state for this exact 4C action, and no cleanup/removal is required.

If not accepted, the state remains a boundary violation requiring separately reviewed remediation.

No further provider action is required merely to decide this question.



## Independent review disposition

Independent Tier-3 review of this closeout concluded:

- **PROVIDER-COUPLED VIEW PIXELS ACCEPTABLE**
- the evidence supports **4C = VERIFIED DATASET GRANT** with no further Meta mutation, once:
  1. the owner adopts the narrow provider-coupling amendment; and
  2. final readback completion within the authorized window is confirmed.

The timestamp condition is now satisfied by the conservative upper-bound evidence above: all final confirmations were supplied before **04:31:05 UTC**, earlier than the **05:00 UTC** deadline.

The accepted amendment remains intentionally narrow:

- same English Hills endpoint only;
- automatic appearance from the single reviewed dataset assignment;
- Partial access / View Pixels only;
- no dataset-management/full-access authority;
- no unrelated asset/task/power;
- protected and unrelated regression unchanged;
- no general claim that Meta universally couples these permissions.

**Owner adoption completed after independent review and merge of PR #79.** The owner explicitly adopted the narrow provider-coupling amendment for this exact English Hills endpoint and accepted the reviewed classification **4C = VERIFIED DATASET GRANT**.

## Classification under the current approved packet

The reviewed 4C-OP1 intended final lifecycle Employee state was exactly:

1. existing C2 relationship;
2. target dataset `1152399921284927` with **Use events dataset — Partial access**.

The observed additional Pixel / View Pixels row is a persistent visible authority delta outside that exact expected state.

The independent review accepted the automatically surfaced View Pixels row as a narrowly scoped provider-coupled effect for this exact endpoint, and the owner adopted that amendment.

Final classification:

**4C = VERIFIED DATASET GRANT**

No further Meta mutation was required. The complete post-action regression record passes under the adopted narrow amendment.

## Stop / preservation rule

The operator must preserve the current provider state.

Do not:

- remove the Pixel / View Pixels row;
- remove/reapply the dataset grant;
- retry Assign assets;
- switch to Manage events dataset;
- Generate token;
- Revoke tokens;
- inspect credentials;
- send a Test Event or real lifecycle event;
- attempt cleanup.

Any remediation or acceptance of the coupled Pixel task requires separately reviewed architecture/evidence and owner authorization.

## Adopted provider-coupling amendment

Independent review concluded **PROVIDER-COUPLED VIEW PIXELS ACCEPTABLE**, and the owner adopted the following narrow amendment:

> For the specific English Hills combined Pixel/Dataset endpoint `1152399921284927`, assigning **Use events dataset — Partial access** to the lifecycle Employee may cause Meta Business Settings to additionally surface **Pixel → English Hills pixel → View Pixels** as a provider-coupled visible permission. This paired View Pixels row is acceptable only when it appears automatically from the one reviewed dataset assignment, remains limited to the same target endpoint, introduces no management/full-access authority, and all protected/unrelated regression checks remain unchanged.

This amendment does not generalize to other datasets, routes or permissions.

## Remaining state

After owner adoption:

- **4A = VERIFIED C2 CREATION**
- **4B = VERIFIED ASSOCIATION**
- **4C = VERIFIED DATASET GRANT**
- **CREATED-OBJECT PREFLIGHT COMPLETE = NOT CLAIMED**
- **PREFLIGHT VERIFIED = NO**
- **B1 actual credential acceptance = PENDING**
- **B5 = OWNER DECISION REQUIRED**
- **safe non-event inspector = BLOCKED**
- Generate/Revoke token, credentials A/B, Production, H3-06–08, H4 and lifecycle sending remain unauthorized

No further Meta access or mutation is authorized by this closeout.
