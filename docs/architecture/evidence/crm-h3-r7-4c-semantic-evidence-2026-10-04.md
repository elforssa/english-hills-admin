# H3 Revision 7 — 4C semantic evidence, 2026-10-04

Revision: **4C-SE1**. Tier 3, documentation-only research/evidence. This artifact evaluates whether the current Meta Business Settings task **Use events dataset — Partial access** is sufficiently connected to the intended direct Conversions API System User path to satisfy S4-P1's noncredential administrative upload-entitlement requirement.

This artifact authorizes no Meta mutation, dataset assignment, credential operation or event send.

## Current provider state

Inherited from completed owner-authorized 4A/4B execution:

- Business: **Glory Lot / `1741597822557523`**
- C2: **EH Lifecycle R4 C2 / `29771601672426816`**
- permanent lifecycle Employee: **EH Lifecycle R4 Employee / `61594989243533` / EMPLOYEE**
- 4B relationship: C2 assigned to the lifecycle Employee with **Develop app — Partial access**
- target dataset: **English Hills pixel / `1152399921284927`**
- candidate 4C task: **Use events dataset — Partial access**
- full-access alternative **Manage events dataset** remains excluded as broader than required
- 4B execution closeout is recorded on branch `docs/h3-r7-4b-execution-closeout`, head `b8ca297d82ddf8e729c74037aae3ef73335fca70`
- 4C remains unexecuted

The prior independent review of PR #74 concluded **4C SEMANTICS INSUFFICIENT** because the Meta UI description itself says only:

> View data, view analytics and create conversion ads with this dataset.

That wording does not explicitly state send/upload/write events. The reviewer required stronger nonsecret evidence connecting this exact task to the intended direct CAPI System User path.

## Evidence question

Does **Use events dataset — Partial access** constitute the least-privilege administrative dataset assignment used for a Meta System User in a direct Conversions API setup, such that it can satisfy the S4-P1 4C administrative grant requirement without escalating to **Manage events dataset — Full access**?

This is an administrative-setup question only. It is not proof that a future token is valid, has the expected scopes/effective authority, or can actually deliver an event. Those remain later B1/credential/H4 gates.

## Evidence A — exact CAPI System User setup using “Use events dataset”

Source:

**Extract by Singular — Meta Ads Conversions API setup guide**  
https://docs.extract.to/reverse-etl-destinations/meta-ads-conversions-api

The guide describes a Meta Ads Conversions API destination and explicitly separates:

1. obtaining the dataset ID;
2. obtaining the CAPI access token;
3. granting the Meta **Conversions API System User** access to the dataset.

For the grant step it instructs:

- open Business Manager;
- choose **System Users**;
- select **Conversions API System User**;
- assign assets;
- select **Datasets**;
- select the target dataset;
- select **Use events dataset**;
- confirm **Assign assets**.

This is the exact current human-visible task label observed in Glory Lot.

### Evidentiary value

This directly connects **Use events dataset** to a System User's dataset access in a Conversions API setup. It is materially stronger than the Meta UI description alone because the task is explicitly used as the dataset-access step for CAPI.

### Limitation

This is a current third-party implementation guide, not Meta's own policy/permission reference. It does not prove future token scopes or runtime event delivery for EH.

## Evidence B — independent Meta CAPI program requiring the same task

Source:

**LiveRamp — The Meta Conversions API Program for Offline Conversions**  
https://docs.liveramp.com/connect/en/the-meta-conversions-api-for-offline-conversions.html

The documented Meta CAPI workflow requires the advertiser to create/share the relevant Pixel or Dataset and assign **use events dataset** level permission before conversion data is sent through the program to the dataset.

The same guide's asset-sharing steps instruct enabling the **Use events dataset** toggle for the dataset.

### Evidentiary value

This independently corroborates that Meta's **Use events dataset** permission is an operational dataset-use grant in a CAPI conversion-delivery workflow, not merely a reporting/analytics label.

### Limitation

The documented flow is a partner/offline-conversion program, not EH's exact own-business direct System User implementation. It supports the meaning of the task but does not replace later EH token/effective-authority verification.

## Evidence C — Meta-owned Business SDK event-upload path

Source:

**Meta-owned GitHub repository: facebook/facebook-nodejs-business-sdk**  
https://github.com/facebook/facebook-nodejs-business-sdk

Relevant server-side CAPI implementation includes `EventRequest` for server events and the Meta Business SDK exposes the pixel/dataset `/events` event-posting path.

For example, Meta's Node Business SDK server-side event request accepts:

- an access token;
- a pixel/dataset identifier;
- server events;

and the SDK's Ads Pixel object exposes an `/events` edge for event posting.

### Evidentiary value

This establishes from a Meta-owned source that direct Conversions API delivery is an authenticated event-post operation against the pixel/dataset object. It corroborates that the administrative dataset grant being evaluated is the relevant asset-access layer for later event delivery.

### Limitation

The SDK does not itself map the Business Settings UI label **Use events dataset** to a specific internal task enum in the evidence captured here. It therefore corroborates the asset/action model but is not the sole basis for the UI-task mapping.

## Evidence D — same-business empirical CAPI baseline

Fresh 4B pre-action inventory recorded the existing protected:

**Conversions API System User / `100089438321765` / EMPLOYEE**

with:

- installed app: **Conversions API Application**
- dataset: **English Hills pixel**
- dataset permission: **Partial access — Use events dataset**
- pixel permission: **Partial access — View Pixels**

This protected user is explicitly named and configured as the existing Conversions API System User in the same Glory Lot business.

### Evidentiary value

This is same-account corroboration that the exact target dataset/task label is already used by the business's existing CAPI System User.

### Limitation

As the PR #74 reviewer correctly noted, an existing assignment alone does not prove that the task establishes upload authority. It is supporting evidence only and must be read together with the external CAPI setup evidence above.

## Synthesis

The evidence now forms a three-layer chain:

1. **Exact UI task mapping to CAPI System User setup:** the CAPI implementation guide instructs assigning the dataset with **Use events dataset** to the Conversions API System User.
2. **Independent CAPI delivery corroboration:** LiveRamp's Meta CAPI workflow likewise requires **Use events dataset** before conversions are delivered to the dataset.
3. **Meta-owned event path:** Meta's Business SDK confirms that direct server-side CAPI sends authenticated events to the pixel/dataset `/events` path.
4. **Same-business corroboration:** Glory Lot's existing protected Conversions API System User currently holds this exact dataset task.

This is materially stronger than the evidence reviewed in PR #74 and directly addresses the reviewer's required resolution: stronger nonsecret evidence connecting the exact task to the intended CAPI System User path.

## Least-privilege comparison

### Use events dataset — Partial access

Observed current Meta UI description:

> View data, view analytics and create conversion ads with this dataset.

External CAPI setup evidence uses this exact permission for CAPI dataset access.

### Manage events dataset — Full access

Observed current Meta UI description includes control over:

- all settings;
- adding/removing events;
- user-access administration;
- audience creation;
- conversion ads.

Those powers exceed the intended lifecycle delivery boundary and are not demonstrated as necessary for event submission.

Therefore **Manage events dataset** remains explicitly excluded.

## Proposed semantic conclusion for independent review

**Proposed: 4C SEMANTICS SUFFICIENT FOR THE ADMINISTRATIVE GRANT LAYER.**

Meaning only:

- `Use events dataset — Partial access` is sufficiently evidenced as the least-privilege administrative dataset-use assignment for the intended direct CAPI System User path;
- S4-P1 may bind it as the exact 4C dataset task for Employee `61594989243533` on dataset `1152399921284927`;
- the task may be separately authorized for one future 4C assignment after review/adoption;
- **Manage events dataset** is not required and remains prohibited.

It does **not** mean:

- future credential generation is authorized;
- the future token is valid;
- the token has the correct scopes/effective asset authority;
- B1 actual credential acceptance is complete;
- event delivery works;
- H4 is complete;
- PREFLIGHT VERIFIED is YES.

Those are later gates.

## Proposed exact 4C mutation after review/adoption

Only if independent review accepts the semantic conclusion:

1. Fresh complete nonsecret Employee/C2/protected baseline.
2. Verify 4B C2 relationship remains intact.
3. Open Employee `61594989243533` → Assigned assets → Assign assets.
4. Select asset type **Datasets**.
5. Select only **English Hills pixel / `1152399921284927`**.
6. Enable only **Use events dataset — Partial access**.
7. Keep **Manage events dataset — Full access** OFF.
8. Confirm **Assign assets** exactly once.
9. Complete all S4-P1 final noncredential readback/regression rows.
10. STOP before every credential operation.

No grant experiment is authorized by this document.

## Required independent-review decision

Reviewer should return one explicit semantic result:

### 4C SEMANTICS SUFFICIENT

Only if the combined evidence is adequate to establish **Use events dataset** as the administrative dataset-use grant for the later direct CAPI System User path while preserving runtime/token verification for later gates.

or:

### 4C SEMANTICS INSUFFICIENT

If the evidence still does not establish the required administrative meaning without a stronger Meta-first-party permission mapping.

If insufficient, do not escalate to **Manage events dataset** and do not test by assigning/sending an event.

## Current state

**4C semantic evidence: READY FOR INDEPENDENT REVIEW.**

No 4C mutation, credential, token, app-secret access, Production action or event send occurred in producing this artifact.

Until independent review and owner adoption:

- **4C remains BLOCKED**
- **PREFLIGHT VERIFIED = NO**
- **CREATED-OBJECT PREFLIGHT COMPLETE = NOT CLAIMED**
- **B1 actual credential acceptance = PENDING**
- **B5 = OWNER DECISION REQUIRED**
- **safe non-event inspector = BLOCKED**
