# H3 Revision 7 — 4B-only operator packet

Revision: **4B-OP1**, 2026-10-04. Tier 3: persistent Meta app/System User authority mutation. Documentation-only preparation. Base: main **`6ae006fc0f9322ecc3a843cf8f52e37e0c2ccb91`**, which includes owner-adopted PR #74 / 4BC-EB1. This packet authorizes no Meta mutation.

## Purpose

Prepare one exact future 4B association action and mandatory readback, then STOP before 4C.

The independent review of PR #74 concluded:

- **4B control binding is review-ready**
- **4C SEMANTICS INSUFFICIENT**
- next execution must be **4B only**
- no dataset grant may occur in the same execution window unless separately reviewed and authorized later

## Exact current bindings

| Object | Binding |
| --- | --- |
| Business | Glory Lot / `1741597822557523` |
| Permanent lifecycle System User | EH Lifecycle R4 Employee / `61594989243533` / EMPLOYEE |
| C2 | EH Lifecycle R4 C2 / `29771601672426816` / Glory Lot owned |
| Target dataset, future only | English Hills pixel / `1152399921284927` |
| Protected app | English-hills / `1069638329182835` |
| Protected System Users | `100089438321765` and `61594759444572` |
| 4A ledger closeout | `fd6ffe070e09161615b5dcf836b5bf33c75c89fa` |
| 4B/4C binding | owner-adopted PR #74 / main `6ae006fc0f9322ecc3a843cf8f52e37e0c2ccb91` |

4A is complete: exactly one C2 exists, C2 had no connected assets at 4A closeout, and the lifecycle Employee had no assigned assets and no installed apps.

## Exact authorized 4B mutation

Only the following future persistent mutation may be authorized under this packet:

1. Open Glory Lot Business Settings.
2. Navigate to **Users → System users**.
3. Select **EH Lifecycle R4 Employee / `61594989243533`**.
4. Open **Assigned assets → Assign assets**.
5. Select asset type **Apps**.
6. Select only **EH Lifecycle R4 C2 / `29771601672426816`**.
7. Enable only **Develop app — Partial access**.
8. Confirm exactly once with **Assign assets**.
9. Read back the result completely.
10. **STOP.**

No second assignment, retry, removal, reapply, alternate task or alternate app is authorized.

## Explicitly excluded app tasks

Do not enable:

- **View insights**
- **Test app**
- **Manage app — Full access**

The approved candidate is exactly:

**Develop app — Partial access**

Observed current Meta description:

> Can change app settings, test the app and view analytics.

This is accepted only for the isolated lifecycle-only C2. It does not establish future CAPI/token authority by itself.

## Pre-action gates

Before any 4B confirmation, the separately authorized human operator must perform fresh read-only checks inside the approved execution window.

All must pass:

1. **Business / C2**
   - Glory Lot remains `1741597822557523`.
   - C2 remains exactly `29771601672426816` / EH Lifecycle R4 C2.
   - protected English-hills / `1069638329182835` remains present and separate.

2. **Employee**
   - `61594989243533` remains EH Lifecycle R4 Employee.
   - role remains EMPLOYEE.
   - no unexpected role/admin elevation.

3. **Complete relationship / assignment baseline**
   - For EH Lifecycle R4 Employee, read the complete safely visible **Assigned assets** inventory before mutation across every asset type: record each typed asset canonical ID/label, task/permission label and direct/inherited source where Meta exposes it.
   - Clear filters and traverse all pages/lazy-loaded rows; record visible totals/counts and final-page/no-next evidence where the UI provides them.
   - Record **Installed apps** separately with the same completeness discipline; do not equate it with Assigned assets.
   - C2 must not already appear in Assigned assets or Installed apps, and there must be no unexplained existing C2 relationship.
   - For protected System User `100089438321765`, capture the complete safely visible assigned-asset/relationship inventory, including typed IDs, task/permission labels and direct/inherited source where shown.
   - For protected System User `61594759444572`, capture the same complete safely visible assigned-asset/relationship inventory.
   - For protected app `1069638329182835`, capture the complete safely visible Business Apps assignment/connected-asset/configuration metadata needed to compare the same surfaces after 4B.
   - Preserve source surface, visible counts/totals, filter state and completeness limits for every baseline.
   - Missing, denied, filtered, incomplete or conflicting evidence is **INCONCLUSIVE**: STOP before mutation rather than treating absence or continued object presence as proof of unchanged authority.
   - if C2 already appears assigned or any prior 4B action is uncertain, STOP and reconcile; do not reapply.

4. **Exact control drift**
   - current path still exposes **Assigned assets → Assign assets → Apps**.
   - C2 remains selectable.
   - **Develop app — Partial access** remains available with materially unchanged semantics.
   - **Assign assets** remains the persistent confirmation.
   - any changed/broader/uninspectable semantics = STOP.

5. **Unrelated assets**
   - no dataset is selected.
   - no Page, ad account, Instagram account, catalogue, audience or other app is selected.
   - protected app is not selected.

6. **Credential boundary**
   - do not click **Generate token** or **Revoke tokens**.
   - do not open token, app-secret or credential-bearing surfaces.

7. **Operator / window**
   - one named human operator only.
   - no concurrent second Meta session or agent/operator performing 4B.
   - exact UTC start/end must be owner-authorized immediately before execution.
   - record the actual execution start before fresh baseline collection.
   - maximum window: **60 minutes**; the effective deadline is the earlier of the approved UTC end or actual start + 60 minutes.
   - before clicking **Assign assets**, confirm enough time remains to complete the mandatory post-action readback safely. If not, STOP before confirmation.
   - no automatic extension, replacement session or continuation beyond the effective deadline.
   - expiry after a possible **Assign assets** confirmation is an **AMBIGUOUS RESULT**: preserve state, do not continue/reapply/remove, and require separately reviewed reconciliation.

If any gate fails, evidence is incomplete/conflicting, or insufficient safe readback time remains, STOP before Assign assets.

## One deliberate confirmation

A future owner action authorization may permit exactly one deliberate click of **Assign assets** after all pre-action gates pass.

Operational rules:

- no double-click;
- no Enter-plus-click;
- no refresh/resubmit;
- no automation retry;
- no second modal/action to "make sure";
- no removal/reassignment if the result is unclear;
- no alternate app task;
- no switch to Manage app.

Unlike the 4A creation action, this packet does not introduce a separate write-ahead allowance ledger. The safety mechanism is the exact single-action commission plus mandatory fresh before-state, one confirmation, and no-reapply ambiguity handling. If independent review requires a durable 4B action ledger before mutation, execution remains blocked until that addition is reviewed and adopted.

## Mandatory post-4B readback

Immediately after the one Assign assets confirmation, before any other provider mutation:

### Employee identity

Confirm:

- EH Lifecycle R4 Employee
- canonical ID `61594989243533`
- role EMPLOYEE
- Glory Lot business context

### Assigned assets

Confirm:

- exactly C2 `29771601672426816` is newly assigned for this 4B action;
- task/control is exactly **Develop app — Partial access**;
- no protected app;
- no unrelated app;
- no dataset;
- no Page/ad account/Instagram/catalogue/audience or other asset.

### Installed apps

Record **Installed apps** separately.

Do not infer that an Assigned assets relationship must automatically appear under Installed apps.

If Installed apps remains empty, record that fact.

Do not click Generate token to change or investigate the installed-app state.

### C2 side readback

Using safe nonsecret Business Apps/C2 metadata only:

- C2 canonical ID and Glory Lot ownership remain unchanged;
- no unexpected connected assets;
- no protected-object coupling.

### Complete protected regression and assignment comparison

Revisit the **same exact safe surfaces used for the fresh baseline** and compare before versus after.

For EH Lifecycle R4 Employee:

- enumerate the complete safely visible Assigned assets inventory across every asset type, with typed canonical IDs/labels, task/permission labels and direct/inherited source where shown;
- record Installed apps separately;
- clear filters, traverse all pages/lazy rows, and reconcile visible totals/counts and final-page/no-next evidence where available;
- the only authorized assignment delta is C2 `29771601672426816` with **Develop app — Partial access**.

For protected System User `100089438321765`:

- compare the complete safely visible assigned-asset/relationship inventory to the fresh pre-action baseline;
- record typed asset IDs, task/permission labels and direct/inherited source where shown;
- no operator-caused assignment/configuration delta is permitted.

For protected System User `61594759444572`:

- perform the same complete before/after comparison;
- no operator-caused assignment/configuration delta is permitted.

For protected app English-hills / `1069638329182835`:

- compare the same safely visible Business Apps assignment/connected-asset/configuration surfaces used before 4B;
- no operator-caused change or new integration coupling is permitted.

Completeness rules:

- object names merely remaining present do **not** prove permissions/assignments are unchanged;
- hidden/denied reads never prove absence;
- filtered, paginated or lazy-loaded views must be completed and reconciled;
- any missing, denied, incomplete or conflicting required before/after evidence makes the result **INCONCLUSIVE** and requires STOP;
- any demonstrated unauthorized assignment/configuration delta is a **CONFIRMED BOUNDARY VIOLATION**.

No secret/token inventory is required or allowed.

## Success / ambiguity / failure

### 4B VERIFIED ASSOCIATION

May be claimed only when:

- one Assign assets confirmation occurred;
- C2 `29771601672426816` is attributable to Employee `61594989243533`;
- exactly Develop app — Partial access is shown;
- the complete post-action Employee Assigned assets inventory has been reconciled against the complete fresh baseline, with the C2/Develop app relationship as the only authorized delta;
- Installed apps is recorded and reconciled separately;
- complete safely visible before/after assignment/task/inheritance comparisons for protected System Users `100089438321765` and `61594759444572` pass;
- the protected app `1069638329182835` passes the same-surface before/after assignment/connected-asset/configuration comparison;
- filters/pages/lazy rows/counts have been reconciled sufficiently to support completeness;
- no required evidence is missing, denied, incomplete or conflicting;
- no unrelated/protected asset/task was added or changed;
- no token/credential/dataset operation occurred;
- the complete readback finished within the effective execution deadline.

If any required completeness or regression fact cannot be established safely, classify **INCONCLUSIVE** rather than VERIFIED ASSOCIATION.

Then **STOP before 4C**.

### 4B PRE-SUBMIT STOP

If any required gate fails before confirmation:

- do not click Assign assets;
- record the exact blocker;
- STOP.

### 4B AMBIGUOUS RESULT

If the UI times out, confirmation result is unclear, the effective deadline expires after a possible submission, or required readback is incomplete/denied/conflicting:

- do not reapply;
- do not remove;
- do not change permissions experimentally;
- preserve current state;
- STOP;
- require separately reviewed read-only reconciliation.

### 4B CONFIRMED BOUNDARY VIOLATION

If an unexpected broader assignment or unrelated asset is demonstrably added:

- STOP;
- do not attempt cleanup under this packet;
- require separately reviewed remediation.

## 4C hold

**4C is not authorized by this packet.**

Current candidate remains:

- Employee `61594989243533`
- dataset `1152399921284927`
- candidate task **Use events dataset — Partial access**

But independent review of PR #74 concluded:

**4C SEMANTICS INSUFFICIENT**

Therefore the operator must not select or assign the dataset during 4B.

Stronger nonsecret provider evidence must first establish that the exact task provides the administrative event-upload entitlement required by S4-P1. No grant experiment, event test or substitution of **Manage events dataset — Full access** is allowed.

## Credential and downstream holds

This packet does not authorize:

- Generate token;
- Revoke tokens;
- app secret;
- token inspection;
- Access Token Debugger;
- Graph API Explorer;
- credential A/B;
- B1 effective-authority acceptance;
- B4 revoke/reissue rehearsal;
- B5 custody;
- Production secret/configuration;
- H3-06–08;
- H4;
- lifecycle event sending;
- Yearly / Google Sheet / Apps Script / Zapier changes.

After successful 4B, full state remains:

- **PREFLIGHT VERIFIED = NO**
- **CREATED-OBJECT PREFLIGHT COMPLETE = NOT CLAIMED**
- **4C = BLOCKED pending semantic evidence**
- **B1 actual credential acceptance = PENDING**
- **B5 = OWNER DECISION REQUIRED**
- **safe non-event inspector = BLOCKED**

## Future owner action authorization fields

This packet may be executed only after:

- exact-head independent review;
- owner adoption/merge;
- separate owner action authorization.

That future action authorization must state:

- sole human operator: **Maroine El Forssa** or another explicitly named owner-approved human;
- exact reviewed/adopted 4B-OP1 commit;
- exact target business, Employee, C2 and task;
- exact UTC start;
- exact UTC end;
- maximum duration 60 minutes;
- other operators/agents/concurrent Meta sessions excluded;
- fresh **complete** pre-action Employee/protected-object assignment/task/inheritance inventories with pagination/filter/count reconciliation;
- exactly one Assign assets confirmation;
- complete same-surface post-action readback and before/after regression comparison;
- submission-boundary confirmation that sufficient safe readback time remains;
- deadline expiry after possible submission treated as ambiguity with no continuation/retry;
- STOP before 4C.

The execution clock must not start during documentation review. The exact window is intentionally unfilled here so review/adoption cannot consume the operational window.

## Prepared owner authorization template

> I authorize 4B-only execution under reviewed and merged 4B-OP1 at [exact commit]. Sole operator: [name]. Authorized UTC window: [start]–[end], maximum 60 minutes. Bind Glory Lot `1741597822557523`, Employee `61594989243533 / EH Lifecycle R4 Employee / EMPLOYEE`, and C2 `29771601672426816 / EH Lifecycle R4 C2`. Record actual start before fresh baseline collection. Capture complete safely visible Employee/protected-object assignment/task/inheritance baselines with typed IDs/tasks/direct-or-inherited source where shown and reconcile filters/pages/lazy rows/counts. If evidence is incomplete, denied or conflicting, STOP. Before confirmation, verify enough time remains for complete readback. Then select only C2 under Assigned assets → Assign assets → Apps, enable only **Develop app — Partial access**, and click **Assign assets** exactly once. Perform complete same-surface post-action Assigned assets, separate Installed apps, C2 and protected-object before/after regression readback, and accept only the C2/Develop app relationship as the authorized delta. Deadline expiry after possible submission is ambiguity with no continuation/retry. Then STOP before 4C. No retry/reapply/remove on ambiguity. 4C/dataset assignment, Generate token, credentials, app secrets, Production, H3-06–08, H4 and lifecycle sending are not authorized.

## Prepared result

**4B-OP1 PREPARED FOR INDEPENDENT REVIEW.**

No Meta mutation or credential operation is performed by this packet.
