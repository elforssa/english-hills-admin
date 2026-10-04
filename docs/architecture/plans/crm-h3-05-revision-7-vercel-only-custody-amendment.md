# H3 Revision 7 — Vercel-only custody and simplified recovery amendment

## Status

**Tier 3 — documentation-only proposed amendment.**

Baseline main at preparation start:

`611a934fb92ce39fc84409db2c1507b06fa83a46`

This proposal responds to the owner's explicit request to remove the separate paid/high-overhead recovery-vault path and use the existing Vercel deployment platform as the only secret-storage service for the lifecycle sender.

It changes the approved Revision 7 recovery/custody evidence model. It is **not effective until exact-head independent review, owner adoption and merge**.

This proposal authorizes no Vercel mutation, Meta access, credential generation, token inspection, app-secret access, revoke, Production change, H3-06–08, H4, Test Events or lifecycle sending.

## Current fixed created-object state

This amendment does not reopen the completed provider-object work:

- **4A = VERIFIED C2 CREATION**
- **4B = VERIFIED ASSOCIATION**
- **4C = VERIFIED DATASET GRANT**
- Business: Glory Lot / `1741597822557523`
- dedicated lifecycle Employee: `61594989243533 / EH Lifecycle R4 Employee / EMPLOYEE`
- lifecycle-only C2 app: `29771601672426816 / EH Lifecycle R4 C2`
- dataset endpoint: `1152399921284927 / English Hills pixel`
- dataset task: **Use events dataset — Partial access**
- accepted provider-coupled Pixel task: **View Pixels — Partial access**
- protected existing users/app remain outside the lifecycle recovery domain

No external vault decision changes these bindings.

## Why this amendment exists

The prior B5 contract required a separate human-only recovery vault so the owner could retain credential A, revoke the dedicated lifecycle identity, retrieve the exact SAME A and independently inspect A as invalid before issuing B.

That design provides stronger empirical recovery evidence, but it creates a second custody service solely for a small lifecycle sender.

The owner now prefers the simplest architecture with no additional paid vault and no extra cloud project.

This amendment therefore proposes an explicit security/evidence tradeoff:

> Use **Vercel Production Secret as the only persistent lifecycle-token store** and accept Meta's explicit successful dedicated-identity **Revoke tokens** control-plane result as the recovery proof, rather than retaining/retrieving SAME A and empirically re-testing A after revocation.

This is a deliberate weakening of recovery evidence, not a claim that Vercel can perform SAME-A historical retrieval.

## Current Vercel product basis

Current Vercel documentation distinguishes **Config** and **Secret** environment-variable types.

For a **Secret**:

- the value remains available to deployments;
- the value can be replaced;
- team members cannot view or retrieve the value after saving;
- values can be scoped to environments.

Authoritative references:

- <https://vercel.com/changelog/environment-variables-now-use-config-and-secret-types>
- <https://vercel.com/docs/environment-variables/manage-across-environments>

This behavior is suitable for the live server credential because the token should not be readable after storage.

It is intentionally **not** suitable for the old SAME-A retrieval contract. This amendment removes that contract instead of pretending Vercel provides it.

## Proposed B5 custody architecture

### Sole persistent secret store

The accepted lifecycle credential is stored only as a **Vercel Secret** in **Production**.

Planned secret reference:

`CRM_META_LIFECYCLE_TOKEN_EH_R4`

Required boundaries:

- Production only;
- Secret type, never readable Config type;
- server-side use only;
- no `NEXT_PUBLIC_` or other client exposure;
- no Preview value;
- no Development value;
- no shared human-readable copy;
- no separate 1Password, Bitwarden, Google Cloud or other recovery-vault copy;
- no repository/chat/database/plaintext-file copy;
- no screenshots or diagnostic capture;
- no `vercel env pull` or equivalent export workflow for this credential;
- no receptionist/teacher/student visibility;
- only the lifecycle server sender may consume the runtime value.

The CRM does not need a vault API or any new storage integration.

### Human handling

Real credential handling remains private and manual:

1. Meta displays the newly issued credential to the owner.
2. Browser sync for credential-bearing content is disabled.
3. Screen sharing/recording and agent/computer-use automation are off.
4. The owner transfers the value directly into the Vercel Production Secret form.
5. The value is not written to a local file, Notes, terminal, shell history, repository, chat or other persistent store.
6. If transient clipboard use is unavoidable, cloud/clipboard history is disabled and the clipboard is cleared immediately after successful insertion.
7. After Vercel saves the Secret, no attempt is made to retrieve/read it back.

The exact operator workflow remains a later separately reviewed credential packet.

## Proposed B5 state model

This proposal replaces the earlier external-vault requirement.

After owner adoption:

**B5 architecture = DEFINED — VERCEL-ONLY**

B5 is not automatically operationally READY merely because the product is chosen.

Before real credential A/B operations, a later nonsecret Vercel preflight must confirm:

- exact English Hills Vercel team/project;
- owner/operator access is sufficient for Production Secret creation/update;
- Secret type is available;
- target can be scoped to Production only;
- Preview/Development remain absent;
- server-only variable name is correct;
- no conflicting lifecycle token variable already exists;
- deployment/runtime code resolves the planned secret reference server-side;
- no export/readback workflow is required by the operator contract.

No secret value needs to be read to perform that preflight.

B5 may become **READY** after that nonsecret preflight, exact operator contract and independent review; a separate recovery vault is no longer a readiness requirement if this amendment is adopted.

## Recovery amendment — what changes

Revision 7 currently requires an initial:

`A → revoke-all → verify SAME A invalid → B`

rehearsal.

This proposal changes it to:

`A → non-event accept A → revoke-all → explicit Meta success confirmation → B → non-event accept B`

### Preserved recovery controls

The following remain mandatory:

- dedicated lifecycle Employee only;
- dedicated lifecycle C2 only;
- existing protected System Users/app are never targeted;
- identity-wide **Revoke tokens** remains the recovery mechanism;
- revoke-before-reissue downtime remains accepted;
- one deliberate revoke action only;
- no automatic retry on ambiguous mutation;
- live destination/gates remain closed throughout rehearsal;
- no `/events`, Test Events or real lifecycle send is used as a probe;
- no shared-user/bulk revocation is permitted;
- B is not accepted merely because it was issued;
- Production storage and activation remain later gates.

### Removed recovery controls

If this amendment is adopted, the following are removed from the active architecture:

- separate external recovery vault;
- immutable external A/B vault references;
- retaining A after provider revocation for SAME-A verification;
- post-revoke inspection of exact SAME A;
- repeated A-invalid polling at 10/30/120/300/600 seconds;
- expiry-exclusion proof solely for interpreting post-revoke A invalidity;
- requirement that B issuance wait for an empirical `is_valid=false` result for SAME A.

Historical documents retain those rules as the previous stronger design.

## New recovery success evidence

The initial recovery rehearsal still uses a disposable credential A, but A never becomes a Production credential.

Required sequence:

1. **Safe inspector READY** before any real credential.
2. Human issues A exactly once for the dedicated lifecycle Employee/C2.
3. A is inspected non-event in the separately accepted safe inspector.
4. Accept A only if subject/app/scopes/granular grants/lifetime metadata are coherent with B1.
5. A is **not** stored in Production and no event is sent.
6. Human invokes **Revoke tokens** exactly once on the dedicated lifecycle Employee.
7. Require an explicit successful Meta control-plane confirmation tied to the exact Employee.
8. Perform nonsecret readback confirming the dedicated Employee/object relationships remain present and protected existing objects remain unchanged.
9. Do **not** try to reuse, retrieve or inspect A after revocation.
10. **Before B issuance, the exact operator packet must already contain owner-approved conditional authority to store an accepted B into Vercel Production**. That authority is dormant unless B passes the safe non-event/B1 acceptance checks and must bind the exact Vercel team/project, variable, Secret type and Production-only scope.
11. Only after explicit successful revoke confirmation and confirmation that the conditional Vercel storage authority is still valid may the human issue B once.
12. In the **same private human session**, inspect B non-event and complete B1 credential acceptance.
13. If and only if B passes acceptance, immediately insert that same B into `CRM_META_LIFECYCLE_TOKEN_EH_R4` as the pre-authorized Vercel Production Secret before ending the private session. Do not leave an accepted B waiting for a later storage approval.
14. If B inspection fails or is inconclusive, do not store B in Vercel and do not automatically issue another credential; stop fail-closed for a new reviewed decision.
15. H3-06–08, live-gate changes, deployment activation and H4 remain separately gated and are **not** authorized by the conditional storage authority.

### Recovery result categories

**PASS**

- exact dedicated Employee targeted;
- revoke submitted once;
- Meta explicitly reports successful Revoke tokens completion;
- protected/unrelated regression is clean;
- B later issues and passes independent non-event credential acceptance.

**FAIL**

- Meta explicitly reports revocation failure;
- wrong identity/action is discovered before submission;
- protected/unrelated mutation is observed.

**INCONCLUSIVE**

- submit/result is ambiguous;
- provider UI/session fails before a trustworthy success/failure result;
- identity binding cannot be established;
- unexpected credential or permission state appears.

On FAIL or INCONCLUSIVE:

- no automatic retry;
- no B acceptance;
- lifecycle sending remains disabled;
- owner must commission a new reviewed recovery action.

## Explicit owner risk acceptance required

Adopting this amendment requires the owner to accept all of the following:

1. **No empirical SAME-A invalidity proof.**
   The system will not demonstrate that exact A fails authentication after revoke.

2. **Provider control-plane trust.**
   Recovery acceptance relies on Meta's explicit successful Revoke tokens result and the already-selected dedicated identity boundary.

3. **Downtime is acceptable.**
   Revocation occurs before replacement issuance/storage. If Meta or Vercel is unavailable afterward, lifecycle sending remains down.

4. **Vercel Secret is non-retrievable.**
   Once B is saved as a Vercel Secret, humans cannot read it back under the documented Secret model.

5. **Lost-before-save credentials are not accepted.**
   If a newly issued token is lost or the Vercel insertion result is ambiguous before accepted storage, it must be treated as uncontrolled/unaccepted. Do not simply generate another token in the same session; stop for a separately reviewed recovery/reissue decision.

6. **Identity-wide blast radius is intentional.**
   Revoke tokens may invalidate every token for the dedicated lifecycle Employee. That is accepted only because this identity is lifecycle-only and protected existing integrations remain outside it.

7. **A Vercel/account incident can extend downtime.**
   Without an external vault, there is no independent retained production-token copy to bridge Vercel account/project unavailability.

This amendment favors simplicity and lower operational overhead over the stronger previous empirical recovery-evidence model.

## Safe non-event inspector after this amendment

The safe inspector is **still required**.

Its purpose becomes narrower:

- inspect A before the recovery rehearsal;
- inspect B before credential acceptance/Production storage;
- establish validity, app/subject mapping, scopes/granular grants and relevant lifetime metadata.

It is **not** required to retrieve or test A after revoke.

Current state remains:

**safe non-event inspector = BLOCKED**

The previously proposed synthetic-only assessment of Meta's human Access Token Debugger remains the preferred next assessment. No real token may be generated until that inspector is independently accepted READY.

## B1 after this amendment

B1 actual credential acceptance remains:

**PENDING**

The amendment does not lower the requirement to inspect a newly issued credential before accepting it.

Required B1 evidence still includes the approved allowlisted nonsecret metadata that the safe inspector can establish for A/B.

Successful CAPI delivery remains **NOT VERIFIED** until separate H4 ordinary eligible use.

## Vercel Production insertion is conditionally pre-authorized before B issuance

This amendment selects Vercel Secret as the custody mechanism but does not itself authorize any Production mutation.

For the future credential/recovery execution, however, **the Production-storage authorization must be granted before B is generated**, rather than obtained afterward. This prevents an accepted, non-retrievable replacement credential from being stranded between approval stages.

The future operator packet must therefore include one narrowly scoped **conditional Production-storage authorization** that becomes executable only after B passes the safe non-event/B1 acceptance checks. That conditional authority must bind:

- exact Vercel team/project;
- exact variable `CRM_META_LIFECYCLE_TOKEN_EH_R4`;
- type **Secret**;
- environment **Production only**;
- no Preview/Development value;
- one deliberate create/update in the same private human session as B issuance/inspection;
- direct insertion of the exact accepted B, with no intermediate persistent copy;
- deployment/readiness readback without token reveal;
- no live gate, destination enablement, scheduler activation, H3-06–08 execution or H4 activation bundled into the storage step.

If B fails inspection or the storage result is ambiguous, the conditional authority does not permit a fresh token issuance, retry loop or activation. Stop fail-closed.

This remains a separation of **capability** rather than a time gap: credential acceptance and conditional storage may occur in one bounded private session, while application activation and delivery remain later separately authorized stages.

## What this proposal supersedes if adopted

Only for the dedicated lifecycle credential path, this amendment supersedes the active requirements for:

- an external B5 recovery vault;
- persistent recoverable custody of A;
- exact SAME-A post-revoke inspection;
- empirical `is_valid=false` recovery proof;
- the five-call post-revoke A observation schedule;
- vault selection/version/history/audit/destruction gates that existed solely to support SAME-A verification.

It does **not** supersede:

- C2/Employee isolation;
- protected existing-object boundaries;
- B1 non-event acceptance of newly issued credentials;
- safe-inspector handling rules;
- revoke-before-reissue downtime;
- one-submit/no-retry recovery mutation discipline;
- credential secrecy/no logging/no screenshots;
- Vercel Production-only/server-only storage;
- H3-06–08/H4 separation;
- no Test Events or synthetic provider send.

## Current state until review and owner adoption

This is a proposal only.

Until exact-head independent review and explicit owner adoption:

- prior vendor-neutral B5 architecture from merged PR #81 remains current;
- PR #82 vault comparison is closed unmerged and has no authority;
- **B5 = OWNER DECISION REQUIRED**;
- **safe non-event inspector = BLOCKED**;
- **B1 actual credential acceptance = PENDING**;
- **PREFLIGHT VERIFIED = NO**;
- no Vercel/Meta/credential/revoke/Production/event operation is authorized.

## Proposed next steps after adoption

If independently reviewed and owner-adopted:

1. retire external-vault research from the active path;
2. prepare one combined documentation packet for:
   - nonsecret Vercel B5 preflight; and
   - synthetic-only Meta Access Token Debugger assessment;
3. independently review those results;
4. only after **B5 READY + safe inspector READY**, prepare the exact A → revoke-success → B credential/recovery operator packet, including the narrowly scoped conditional Vercel Production-storage authority **before B issuance**;
5. keep H3-06–08, live activation and H4 separately authorized after credential custody succeeds.
