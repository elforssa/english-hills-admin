# H3 Revision 7 — 4C-only operator packet

> **HISTORICAL — SUPERSEDED BY S1.** S1 was owner-adopted and merged through PR #93 / main `284c2fe32014f8f3011ac6677ddfe99b0a16ca22`. Use the [sole active S1 Gate-B credential runbook](crm-h3-s1-gate-b-credential-runbook.md). Conflicting credential/bootstrap/inspector/rehearsal/per-action instructions below are retired, not execution requirements. Preserve original dated observations, findings and approval scope; unrelated R4 delivery safeguards remain. No historical approval authorizes current credential execution or activation.

Revision: **4C-OP1**, 2026-10-04. Tier 3: persistent Meta dataset/System User authority mutation. Documentation-only preparation. Base: main **`487c40bf49dbc1d740a98db90586bd5eb9968c4f`**, which includes owner-adopted PR #77 / 4C-SE1 and merged 4B closeout PR #76.

This packet authorizes no Meta mutation.

## Purpose

Prepare one exact future 4C dataset-task assignment and complete final noncredential readback, then **STOP before every credential operation**.

The independent review of 4C-SE1 concluded:

**4C SEMANTICS SUFFICIENT**

Meaning only that **Use events dataset — Partial access** is sufficiently established at the dataset asset-task layer as the least-privilege administrative dataset task used in CAPI setups.

This does not establish token validity, token scopes, effective credential authority or event delivery.

## Exact current bindings

| Object | Binding |
| --- | --- |
| Business | Glory Lot / `1741597822557523` |
| Permanent lifecycle System User | EH Lifecycle R4 Employee / `61594989243533` / EMPLOYEE |
| C2 | EH Lifecycle R4 C2 / `29771601672426816` / Glory Lot |
| Verified 4B app task | Develop app — Partial access |
| Target dataset endpoint | English Hills pixel / `1152399921284927` |
| Dataset navigation row seen historically | English Hills pixel / `1568116421343147` |
| Exact 4C task | **Use events dataset — Partial access** |
| Prohibited broader task | **Manage events dataset — Full access** |
| Protected System Users | `100089438321765`, `61594759444572` |
| Protected app | English-hills / `1069638329182835` |
| 4B closeout | reviewed head `6c3837d33b1c08f59c889550f1f533eca2e25a9c`, merged PR #76 / main `11287d8562d55e09d2598e3cd7b888f689e29d98` |
| 4C semantic evidence | owner-adopted PR #77 / main `487c40bf49dbc1d740a98db90586bd5eb9968c4f` |

The endpoint ID `1152399921284927` is authoritative for the target dataset. The historical navigation ID `1568116421343147` must never replace the endpoint ID in the 4C target binding.

## Exact future 4C mutation

Only the following persistent mutation may later be owner-authorized under this packet:

1. Open Glory Lot Business Settings.
2. Navigate to **Users → System users**.
3. Select **EH Lifecycle R4 Employee / `61594989243533`**.
4. Open **Assigned assets → Assign assets**.
5. Select asset type **Datasets**.
6. Select only **English Hills pixel / endpoint `1152399921284927`**.
7. Enable only **Use events dataset — Partial access**.
8. Confirm **Manage events dataset — Full access** remains OFF.
9. Confirm exactly once with **Assign assets**.
10. Complete the full 4C post-action noncredential readback.
11. **STOP before Generate token or any credential operation.**

No second assignment, retry, removal, reapply, alternate dataset, alternate task or broader task is authorized.

## Explicitly excluded dataset task

Do not enable:

**Manage events dataset — Full access**

Observed current Meta description includes broader authority over settings, events, user access, audiences and conversion-ad use. That authority is not required for the intended lifecycle delivery boundary.

The approved 4C task is exactly:

**Use events dataset — Partial access**

Its acceptance is limited to the administrative dataset grant layer established by 4C-SE1. It does not prove later token/runtime authority.

## Fresh pre-action gates

Before any 4C confirmation, the separately authorized human operator must perform fresh read-only checks inside the approved execution window.

All required evidence must be safely visible and complete. Missing, denied, filtered, incomplete or conflicting required evidence means **INCONCLUSIVE / STOP before mutation**.

### 1. Business / C2

Confirm:

- Glory Lot remains `1741597822557523`;
- C2 remains exactly `29771601672426816 / EH Lifecycle R4 C2`;
- C2 ownership remains Glory Lot;
- the verified 4B relationship remains present;
- lifecycle Employee has C2 with the reviewed partial-access relationship;
- C2 Connected assets remains none unless a reviewed architecture change explicitly says otherwise;
- protected English-hills / `1069638329182835` remains present and separate.

### 2. Lifecycle Employee

Confirm:

- `61594989243533` remains EH Lifecycle R4 Employee;
- role remains EMPLOYEE;
- no Admin elevation;
- Assigned assets baseline contains the verified C2 relationship and no target dataset yet;
- Installed apps is recorded separately;
- no unexplained additional asset/task.

Record the complete safely visible Assigned assets inventory across every asset type:

- typed canonical IDs/labels;
- task/permission labels;
- direct/inherited source where Meta exposes it;
- visible totals/counts;
- clear filters;
- complete pagination/lazy-loaded rows;
- final-page/no-next evidence where available.

If the target dataset already appears assigned, or any prior 4C action is uncertain, STOP and reconcile; do not reapply.

### 3. Target dataset

Confirm the exact dataset identity:

**English Hills pixel / `1152399921284927`**

If the UI surface uses the historical dataset navigation row `1568116421343147`, reconcile it to endpoint `1152399921284927` using the already reviewed mapping. Do not substitute the navigation ID as the target endpoint.

Record the complete safely visible assigned-people/System User inventory for the target dataset before 4C, including:

- canonical actor IDs/labels where visible or already authoritatively mapped;
- task/permission labels;
- direct/inherited source where exposed;
- visible totals/counts;
- filters/pages/lazy rows/completeness limits.

The existing protected Conversions API System User `100089438321765` and its **Use events dataset** relationship must remain protected and unchanged.

### 4. Protected System User 1

**Conversions API System User / `100089438321765` / EMPLOYEE**

Capture the complete safely visible Assigned assets and Installed apps baseline.

Expected protected inventory from the merged 4B closeout:

- Conversions API Application / `6490032931025859` — Partial access (Develop app, View insights and Test app);
- English Hills pixel endpoint / `1152399921284927` — Partial access (View Pixels);
- English Hills pixel dataset navigation row / `1568116421343147` — Partial access (Use events dataset);
- Installed apps: Conversions API Application.

Record any current drift rather than silently normalizing it.

### 5. Protected System User 2

**English Hills CRM / `61594759444572` / ADMIN**

Capture the complete safely visible Assigned assets and Installed apps baseline.

Expected protected inventory from merged 4B evidence:

- English Hills Page / `997579646781805` — Full access;
- KAL ad account / `120226027857760313` — Full access;
- English-hills app / `1069638329182835` — Full access;
- englishhills Instagram / `1010913298779258` — Nothing assigned yet;
- Installed apps: English-hills.

Record drift explicitly if present.

### 6. Protected app

For **English-hills / `1069638329182835`**, capture the same safe metadata surfaces used previously:

- People assigned;
- Partners;
- Connected assets;
- safely visible assignment/configuration metadata relevant to the regression comparison.

Expected prior state:

- People assigned: 2;
- English Hills CRM — Full access;
- Maroine El Forssa — Full access;
- Partners: none;
- Connected assets: none.

Do not open Manage, secret or credential-bearing surfaces.

### 7. Exact 4C control drift

Before confirmation, verify the current modal still exposes:

**Assigned assets → Assign assets → Datasets**

and for the exact target dataset:

- **Use events dataset — Partial access**;
- **Manage events dataset — Full access**;
- persistent confirmation control **Assign assets**.

Only **Use events dataset** may be enabled.

If the task label, semantics, target mapping or confirmation behavior has materially changed, STOP before mutation.

### 8. Unrelated asset exclusion

Before confirmation verify:

- no other dataset selected;
- no Page;
- no ad account;
- no Instagram account;
- no catalogue;
- no audience;
- no protected app;
- no unrelated app;
- no broader dataset management task.

### 9. Credential boundary

Do not:

- click Generate token;
- click Revoke tokens;
- inspect token lists;
- access app secrets;
- open Access Token Debugger;
- open Graph API Explorer;
- access credential-bearing Settings/Basic/Advanced surfaces;
- send Test Events or real events.

Unexpected credential exposure requires immediate STOP and owner handling under the existing credential contract.

### 10. Operator / window

Future execution requires:

- one explicitly named sole human operator;
- no concurrent second Meta session/operator/agent performing 4C;
- exact owner-authorized UTC start/end;
- actual execution start recorded before fresh baseline collection;
- maximum duration **60 minutes**;
- effective deadline = earlier of approved end or actual start + 60 minutes;
- sufficient remaining time for the complete final noncredential readback before clicking Assign assets;
- no automatic extension or replacement session.

If insufficient safe readback time remains, STOP before confirmation.

Deadline expiry after a possible confirmation yields **AMBIGUOUS RESULT** and permits no continuation/retry/removal/reapply.

## One deliberate confirmation

A future owner action authorization may permit exactly one deliberate click of **Assign assets** after every fresh gate passes.

Operational rules:

- no double-click;
- no Enter-plus-click;
- no refresh/resubmit;
- no automation retry;
- no second modal/action to "make sure";
- no removal/reassignment if the result is unclear;
- no switch to Manage events dataset;
- no alternate dataset.

A separate write-ahead allowance ledger is not introduced by this packet. The S4-P1 dataset-grant contract requires exact target binding, fresh before-state, one deliberate confirmation, complete result/readback and fail-closed ambiguity handling. If an independent reviewer requires a durable 4C action ledger, execution remains blocked until that addition is reviewed and adopted.

## Mandatory post-4C readback

Immediately after the one Assign assets confirmation, before any other provider mutation:

### Lifecycle Employee identity and complete assignments

Confirm:

- EH Lifecycle R4 Employee;
- canonical ID `61594989243533`;
- role EMPLOYEE;
- Glory Lot business context.

Re-enumerate the complete safely visible Assigned assets inventory across every asset type.

The intended final lifecycle Employee state is exactly:

1. C2 `29771601672426816 / EH Lifecycle R4 C2`
   - reviewed 4B partial-access relationship preserved;
2. Dataset `1152399921284927 / English Hills pixel`
   - **Use events dataset — Partial access**.

No other asset/task is an authorized 4C delta.

Record Installed apps separately. Do not infer that dataset assignment changes Installed apps.

### Target dataset side

Read the target dataset's safe assigned-people/System User view.

Confirm:

- lifecycle Employee `61594989243533` is present with exactly **Use events dataset — Partial access**;
- protected Conversions API System User `100089438321765` remains unchanged;
- no unexpected actor/task was added;
- no Full access / Manage events dataset grant exists for the lifecycle Employee.

Reconcile visible totals/counts, filters, pages/lazy rows and direct/inherited source where Meta exposes them.

### C2 relationship

Confirm 4B remains unchanged:

- C2 `29771601672426816` still assigned to lifecycle Employee;
- reviewed partial-access relationship preserved;
- no unexpected app permission expansion;
- C2 Connected assets remains none unless the UI explicitly and safely shows a provider-defined relationship that the reviewed architecture expected; any unexplained new connection is a boundary violation.

### Protected System User 1

Revisit the same exact surfaces used before 4C.

Confirm no operator-caused change to:

- Conversions API Application / `6490032931025859`;
- English Hills pixel endpoint / `1152399921284927` — View Pixels;
- dataset navigation row / `1568116421343147` — Use events dataset;
- Installed apps.

### Protected System User 2

Revisit the same exact surfaces used before 4C.

Confirm no operator-caused change to:

- Page `997579646781805`;
- ad account `120226027857760313`;
- app `1069638329182835`;
- Instagram `1010913298779258`;
- Installed apps.

### Protected app

Revisit the same safe surfaces and confirm:

- same assigned people/access;
- Partners unchanged;
- Connected assets unchanged;
- no new integration coupling.

### New unrelated powers

Explicitly confirm no new:

- Page;
- Instagram;
- ad-account;
- catalogue;
- audience;
- other dataset;
- business-admin responsibility;
- Full access dataset task;
- protected-app relationship.

Hidden/denied reads never prove absence. Missing, denied, incomplete or conflicting required evidence means **INCONCLUSIVE / STOP**.

### Credential / event exclusion

Record that no:

- Generate token;
- Revoke token;
- app-secret access;
- token inspection;
- credential A/B;
- Test Event;
- lifecycle event;
- Production secret/configuration

occurred during 4C.

## Outcome classification

### 4C VERIFIED DATASET GRANT

May be claimed only when:

- exactly one Assign assets confirmation occurred;
- dataset endpoint `1152399921284927` is attributable to Employee `61594989243533`;
- exact task **Use events dataset — Partial access** is shown;
- C2/4B relationship remains unchanged;
- lifecycle Employee's complete assignment inventory contains only the reviewed C2 relationship plus the new exact dataset task;
- target-dataset assigned-actor inventory reconciles correctly;
- protected System Users/app pass same-surface before/after regression;
- no unrelated asset/task/power appears;
- no required evidence is missing, denied, incomplete or conflicting;
- no credential/event/Production operation occurred;
- complete readback finished before the effective deadline.

Then **STOP before every credential operation**.

### 4C PRE-SUBMIT STOP

If any required gate fails before confirmation:

- do not click Assign assets;
- record the exact blocker;
- STOP.

### 4C AMBIGUOUS RESULT

If the UI times out, confirmation result is unclear, the deadline expires after a possible confirmation, or required readback is incomplete/denied/conflicting:

- do not reapply;
- do not remove;
- do not switch tasks;
- preserve current state;
- STOP;
- require separately reviewed read-only reconciliation.

### 4C CONFIRMED BOUNDARY VIOLATION

If a broader task, unrelated asset, unexpected actor, protected-object change or other unauthorized persistent mutation is demonstrably created:

- STOP;
- do not attempt cleanup under this packet;
- require separately reviewed remediation.

## Created-object checkpoint boundary

A successful 4C would complete the intended noncredential object sequence:

- 4A verified C2 creation;
- 4B verified C2/Employee association;
- 4C verified exact dataset grant.

However this packet does not silently set full preflight state.

After successful 4C:

- **PREFLIGHT VERIFIED remains NO**;
- **B1 actual credential acceptance remains PENDING**;
- **B5 remains OWNER DECISION REQUIRED**;
- **safe non-event inspector remains BLOCKED**;
- credential A/B, revoke/reissue rehearsal, Production, H3-06–08, H4 and lifecycle sending remain held.

The execution closeout may report **CREATED-OBJECT PREFLIGHT COMPLETE** only if the then-current reviewed/owner-adopted reporting rule explicitly permits that factual checkpoint and every S4-P1 final noncredential readback row passes. Otherwise it must return the itemized 4A/4B/4C facts with **PREFLIGHT VERIFIED = NO** and leave that label unclaimed.

## Future owner action authorization fields

This packet may be executed only after:

- exact-head independent review;
- owner adoption/merge;
- separate owner action authorization.

That future authorization must state:

- sole human operator;
- exact reviewed/adopted 4C-OP1 commit;
- Glory Lot `1741597822557523`;
- Employee `61594989243533`;
- C2 `29771601672426816`;
- dataset endpoint `1152399921284927`;
- exact task **Use events dataset — Partial access**;
- exact UTC start/end;
- maximum duration 60 minutes;
- all other operators/agents/concurrent Meta sessions excluded;
- complete fresh pre-action baseline;
- exactly one Assign assets confirmation;
- complete same-surface final noncredential readback;
- STOP before credentials.

The execution clock must not start during documentation review.

## Prepared owner authorization template

> I authorize 4C-only execution under reviewed and merged 4C-OP1 at [exact commit]. Sole operator: [name]. Authorized UTC window: [start]–[end], maximum 60 minutes. Bind Glory Lot `1741597822557523`, Employee `61594989243533 / EH Lifecycle R4 Employee / EMPLOYEE`, C2 `29771601672426816 / EH Lifecycle R4 C2`, and dataset endpoint `1152399921284927 / English Hills pixel`. After complete fresh nonsecret baselines pass and sufficient readback time remains, select only the target dataset under Assigned assets → Assign assets → Datasets, enable only **Use events dataset — Partial access**, keep **Manage events dataset — Full access** off, and click **Assign assets** exactly once. Perform complete same-surface lifecycle-Employee, target-dataset, C2, protected-user and protected-app readback; accept only the exact dataset grant as the 4C delta. Missing/denied/conflicting evidence or deadline expiry after possible submission is INCONCLUSIVE/AMBIGUOUS and permits no retry/reapply/remove. STOP before Generate token or every other credential/event/Production operation.

## Prepared result

**4C-OP1 PREPARED FOR INDEPENDENT REVIEW.**

No Meta access, dataset assignment, credential operation, Production action or event send is performed by this packet.
