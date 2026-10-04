# H3 Revision 7 — 4B/4C control binding, 2026-10-04

> **HISTORICAL — SUPERSEDED BY S1.** S1 was owner-adopted and merged through PR #93 / main `284c2fe32014f8f3011ac6677ddfe99b0a16ca22`. Use the [sole active S1 Gate-B credential runbook](../plans/crm-h3-s1-gate-b-credential-runbook.md). Conflicting credential/bootstrap/inspector/rehearsal/per-action instructions below are retired, not execution requirements. Preserve original dated observations, findings and approval scope; unrelated R4 delivery safeguards remain. No historical approval authorizes current credential execution or activation.

Revision: **4BC-EB1**. Tier 3: persistent Meta business-asset authority and future credential prerequisites; documentation-only binding evidence. Base: main **`8d4e6d72b8d8c37b0d19c76f3ecddfa24baa0419`**. This artifact authorizes no Meta mutation.

## Result

- **4A = VERIFIED C2 CREATION** from the completed single-use operator ledger on branch `ops/h3-r7-c2-attempt-ledger`, final closeout commit **`fd6ffe070e09161615b5dcf836b5bf33c75c89fa`**.
- **4B exact control binding = READY FOR INDEPENDENT REVIEW.**
- **4C exact target/task control = BOUND FOR REVIEW; mutation remains held until independent review determines whether the observed task semantics satisfy S4-P1's administrative event-upload-entitlement requirement.**
- **PREFLIGHT VERIFIED = NO.**
- **CREATED-OBJECT PREFLIGHT COMPLETE = NOT CLAIMED.**
- No 4B/4C mutation, credential, token, app-secret access, Production change or lifecycle event occurred during this discovery.

Authoritative parent: [S4-P1](../plans/crm-h3-05-revision-7-step-4-created-object-preparation.md). The parent explicitly allows 4A to return nonsecret installation/dataset-control evidence after verified creation, with separate reviewed authorization required before 4B/4C mutation.

## Current exact objects

| Object | Current verified binding |
| --- | --- |
| Business | Glory Lot / `1741597822557523` |
| C2 | **EH Lifecycle R4 C2 / `29771601672426816`** / Glory Lot owned |
| Permanent lifecycle System User | **EH Lifecycle R4 Employee / `61594989243533` / EMPLOYEE** |
| Target dataset | **English Hills pixel / `1152399921284927`** |
| Protected app | English-hills / `1069638329182835` |
| Protected System Users | `100089438321765` (Conversions API System User / EMPLOYEE); `61594759444572` (English Hills CRM / ADMIN) |

4A post-state established that C2 had no connected assets, the lifecycle Employee had no assigned assets and no installed apps, and the protected objects remained present in the safe observed views.

## Discovery authority and provenance

The owner performed the read-only discovery manually in the authenticated Meta Business Settings UI during the already-approved 4A execution window. S4-P1/4A permits safe nonsecret discovery of available association/dataset controls after verified C2 creation and before STOP, without clicking a mutation or entering credential surfaces.

Evidence source classes in this artifact:

- **Owner-observed current Meta UI:** screenshots supplied in conversation and explicit owner confirmations.
- **4A operational fact:** exact final ledger commit `fd6ffe070e09161615b5dcf836b5bf33c75c89fa`.
- **Architecture requirement:** S4-P1.
- No author-side Meta access occurred.
- No provider mutation was performed during 4B/4C discovery.
- The asset-assignment modal was used for read-only control discovery only; **Assign assets was not clicked**.
- **Generate token** was not clicked.
- No permission toggle was enabled and saved.

The owner should cancel/close any still-open assignment modal after evidence capture so no staged selection remains.

## 4B — exact C2 / Employee association control

### Starting state

Safe current surface:

**Glory Lot → Settings → Users → System users → EH Lifecycle R4 Employee / `61594989243533`**

Two distinct relationship views are visible:

1. **Assigned assets**
2. **Installed apps**

The views must not be treated as synonyms.

### Installed apps observation

The **Installed apps** tab currently shows:

> No apps installed yet

and a secondary instruction:

> Generate a token to manage your business assets.

There is no separate visible **Install app** action on this empty state.

**Binding consequence:** 4B must not use **Generate token** merely to create/discover an installed-app relationship. Token generation is a later credential stage and remains prohibited. Installed-app readback remains relevant after future credential work, but it is not the current 4B mutation surface.

### Assigned assets control

From:

**Assigned assets → Assign assets → Apps**

the modal title is:

**Select assets and assign permissions**

The Apps asset list contains at least:

- **EH Lifecycle R4 C2**
- protected **English-hills**

Only C2 is an allowed 4B target. The protected app must never be selected or modified.

Selecting C2 in the modal, without saving, exposes these current app permission choices:

#### Partial access

- **Develop app**
  - Meta UI description: can change app settings, test the app and view analytics.
- **View insights**
  - Meta UI description: can view app analytics.
- **Test app**
  - Meta UI description: can test the app.

#### Full access

- **Manage app**
  - Meta UI description: can manage roles, change app settings, test the app and view analytics.

Persistent mutation control:

**Assign assets**

It was not clicked.

### Proposed exact 4B action for review

Target:

- Employee: **`61594989243533` / EH Lifecycle R4 Employee / EMPLOYEE**
- App: **`29771601672426816` / EH Lifecycle R4 C2**
- Surface: **Assigned assets → Assign assets → Apps**
- Proposed task: **Develop app — Partial access**
- Persistent confirmation: **Assign assets**

Rationale for review:

- It is the narrowest observed app task that provides an operational/development relationship rather than analytics-only or test-only access.
- It avoids **Manage app / Full access**, which additionally permits role administration and is broader than currently justified.
- It binds only the dedicated C2; no protected app or unrelated asset is included.

This rationale does **not** assert that Develop app itself proves future token/CAPI sufficiency. Credential effective authority remains a later B1/credential-stage question. If independent review concludes a broader app task is demonstrably required, 4B must not proceed under this binding; an exact amended task requires review and owner approval first.

### Required future 4B readback

After a separately authorized 4B mutation, read back before any 4C action:

- exact Employee ID/label/EMPLOYEE role;
- exact C2 ID/label;
- C2 appears under the Employee's **Assigned assets** with exactly the approved app task;
- no protected or unrelated app appears newly assigned;
- complete **Installed apps** view recorded separately, without assuming assignment equals installation;
- no dataset, Page, ad account, Instagram, catalogue, audience or other unrelated assignment;
- protected app/users unchanged in safe observable metadata;
- no token/secret/credential operation;
- no retry/reapply if the result is ambiguous.

If the assignment result is uncertain, STOP. Do not remove/reassign experimentally.

## 4C — exact dataset target and task control

### Current dataset control surface

Within the same **Select assets and assign permissions** modal, the **Datasets** category exposes multiple datasets. Owner read-only inspection selected the visible **English Hills pixel** row only to reveal available permission labels; no permission was enabled/saved.

The owner then searched the canonical target ID and confirmed the exact identity mapping:

**English Hills pixel = `1152399921284927`**

No other dataset is an authorized target.

### Current dataset permission choices

For the exact target dataset the UI exposes:

#### Partial access

- **Use events dataset**
  - Meta UI description: **View data, view analytics and create conversion ads with this dataset.**

#### Full access

- **Manage events dataset**
  - Meta UI description: **Control all settings, add or remove events, edit user access and create audiences or conversion ads with this dataset.**

Persistent mutation control:

**Assign assets**

It was not clicked.

### Proposed exact 4C target/task for review

Target:

- Employee: **`61594989243533`**
- Dataset: **`1152399921284927` / English Hills pixel**
- Proposed task: **Use events dataset — Partial access**
- Explicitly reject: **Manage events dataset — Full access**
- Persistent confirmation: **Assign assets**

Least-privilege rationale:

- **Use events dataset** is the only observed partial-access dataset task.
- **Manage events dataset** additionally grants settings control, event add/remove controls, user-access administration and audience creation, which exceed the intended lifecycle delivery boundary.

### Semantic limitation that review must resolve

S4-P1 requires the later dataset grant contract to establish **administrative event-upload entitlement** for the permanent Employee/C2 relationship.

The current Meta UI description for **Use events dataset** does **not explicitly say "upload/send events"**. It says view data, view analytics and create conversion ads. Therefore this artifact binds the exact current task/control and its least-privilege position, but does not silently convert the label into proven event-upload authority.

Independent review must decide one of these outcomes:

1. **4C semantics sufficient:** existing approved architecture/provider evidence plus the exact current task label/control are enough to treat **Use events dataset** as the required administrative dataset-use grant for the later direct CAPI credential path; or
2. **4C semantics insufficient:** authorize **4B only**, perform/read back 4B, and keep 4C blocked until stronger nonsecret provider evidence establishes the upload-entitlement meaning.

No dataset mutation may be performed merely to discover semantics.

## Recommended staged execution after review

Because 4B's exact control is now known while 4C has the semantic limitation above, the safe default is:

### Commission 4B only

After independent review and owner adoption:

1. fresh read-only Employee/C2/protected baseline;
2. select only C2 `29771601672426816`;
3. enable only **Develop app — Partial access**;
4. one deliberate **Assign assets** confirmation;
5. complete assigned-assets vs installed-app readback;
6. protected/unrelated asset regression check;
7. **STOP**.

No token generation. No dataset grant unless 4C was separately and explicitly found semantically sufficient and included in a reviewed owner commission.

### Commission 4C later if/when semantic gate passes

Bind only:

- dataset `1152399921284927`;
- Employee `61594989243533`;
- established C2 relationship `29771601672426816`;
- **Use events dataset — Partial access**;
- one deliberate **Assign assets** confirmation;
- complete final noncredential readback.

Then STOP before every credential operation.

## Explicit exclusions

This binding does not authorize:

- clicking **Assign assets**;
- **Generate token** or **Revoke tokens**;
- app-secret access;
- Settings / Basic / Advanced credential-bearing surfaces;
- protected app `1069638329182835`;
- protected System User mutation;
- Manage app full access;
- Manage events dataset full access;
- any other dataset;
- Page/ad-account/Instagram/catalogue/audience assignment;
- App Review/publication/business-verification change;
- Production/Supabase/Vercel credential configuration;
- H3-06–08;
- H4;
- sending lifecycle events;
- changing the Yearly / Google Sheet / Apps Script / Zapier flow.

## Review questions

Independent reviewer should determine:

1. Is **Develop app — Partial access** a sufficiently bounded 4B association task under S4-P1, without overclaiming future credential sufficiency?
2. Does the separation between **Assigned assets** and **Installed apps** remain explicit enough?
3. Is **Use events dataset — Partial access** the correct least-privilege 4C target task?
4. Does current evidence satisfy S4-P1's administrative event-upload-entitlement requirement, or must 4C remain held after 4B?
5. Are protected/unrelated asset exclusions and readback requirements sufficient?
6. Is a 4B-only next commission required, or may a later Commission B safely bind both 4B and 4C?

## Current classification

**4B CONTROL BINDING READY FOR INDEPENDENT REVIEW.**

**4C TARGET/TASK CONTROL BOUND FOR REVIEW; EXECUTION NOT AUTHORIZED.**

No 4B/4C mutation occurred. 4A's persistent C2 remains preserved. Full preflight remains incomplete; credentials and event delivery remain unverified.
