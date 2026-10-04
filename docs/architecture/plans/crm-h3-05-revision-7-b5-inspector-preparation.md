# H3 Revision 7 — B5 custody and safe non-event inspector preparation

## Status

**Tier 3 — documentation-only proposal.**

This packet follows the owner-adopted and merged created-object state:

- **4A = VERIFIED C2 CREATION**
- **4B = VERIFIED ASSOCIATION**
- **4C = VERIFIED DATASET GRANT**

Current main at preparation start: `1e32ac77d5234f39e4c6b6511e79cd5efff827a8`.

This packet authorizes **no Vercel mutation, vault setup, Meta access, credential generation, token inspection, app-secret access, revocation, Production mutation, H3-06–08, H4, Test Events or lifecycle sending**.

Its purpose is to turn the existing [B5 custody and handling contract](crm-h3-05-revision-7-step-2-preparation.md#b5-custody-and-handling-contract) and [safe non-event inspection contract](crm-h3-05-revision-7-step-2-preparation.md#safe-non-event-inspection-contract) into a simpler reviewable design:

1. **Vercel Production Secret is the runtime store** for the accepted live Meta credential.
2. A separate **human-only recovery vault** preserves exact A/B custody and SAME-A recovery evidence.
3. The recovery-vault vendor remains **unselected** until a focused qualification comparison proves the simplest acceptable option.

## Existing gate state

Before this packet:

- **CREATED-OBJECT PREFLIGHT COMPLETE = NOT CLAIMED**
- **PREFLIGHT VERIFIED = NO**
- **B1 actual credential acceptance = PENDING**
- **B5 = OWNER DECISION REQUIRED**
- **safe non-event inspector = BLOCKED**
- real A/B issuance, revoke-all rehearsal and Production storage remain unauthorized

Created-object verification does not itself authorize credentials.

## Runtime-versus-recovery separation

### Runtime store

The accepted live credential will later be stored in **Vercel Production** under the already planned protected Production secret reference.

Vercel is the application/runtime custody layer only.

The normal runtime path is:

`accepted Meta credential B → Vercel Production Secret → EH CRM lifecycle sender`

The CRM must not fetch lifecycle credentials from a separate recovery vault during normal operation.

No receptionist, teacher, student, browser client, Preview deployment or Development environment receives the credential.

### Recovery custody

B5 requires a **separate human-only recovery vault** because the approved recovery contract requires preserving exact historical A so the custodian can:

1. bind A to an immutable/nonambiguous reference;
2. revoke A under the later approved recovery rehearsal;
3. retrieve the exact SAME A;
4. verify that SAME A is explicitly invalid;
5. only then permit issuance/acceptance of B.

The recovery vault is therefore not a CRM dependency. It is an owner/custodian safety mechanism used only for issuance, rotation, recovery and evidence.

### Why Vercel alone is not accepted for B5

Vercel Production remains the correct runtime store, but **Vercel alone is not accepted as the complete B5 recovery store under the current recovery contract** unless a later vendor-capability review proves all B5 requirements, including exact historical SAME-A retrieval after replacement/revocation.

The current architecture must not weaken SAME-A verification merely to avoid a second custody tool.

The B5 comparison should therefore choose the simplest external human-only vault that satisfies the existing contract rather than introducing a cloud service by default.

## B5 vault qualification requirements

The vault vendor is **OPEN / UNSELECTED**.

A candidate may be a password manager, secrets manager or other protected human custody product only if it passes every requirement below.

### Required capabilities

1. **Exact A/B identity**
   - A and B must be distinguishable by stable nonsecret version/item references.
   - Repository evidence must not rely on a token fragment, hash, URL or the word `latest`.

2. **SAME-A retrieval**
   - after B is created or after ordinary item updates, the custodian must still be able to retrieve the exact stored A needed for the approved post-revoke validity check;
   - retrieval must be deterministic rather than relying on memory or manually comparing token text.

3. **Protected human custody**
   - encrypted storage and transport;
   - MFA on the human account;
   - restricted ACL to the named custodian;
   - no EH runtime, Vercel runtime identity, Supabase, GitHub Actions, CI, agent or browser automation access.

4. **History / retention**
   - A remains available while revoke evidence is pending or inconclusive;
   - an accidental update must not silently overwrite the only recoverable copy of A;
   - retention/destruction behavior must be explicit and testable.

5. **Auditability**
   - sufficient nonsecret evidence exists to show access/version/update/destruction activity or an equivalent custody history;
   - audit administration must not itself expose secret values.

6. **Private manual handling**
   - human-only insertion/retrieval;
   - no mandatory command-line, environment-variable, plaintext export or agent-visible handling path.

7. **Synthetic rehearsal**
   - distinct synthetic S1/S2 values can be stored;
   - exact S1 can later be retrieved after S2 exists;
   - access/history/audit behavior can be demonstrated without exposing values in repository evidence;
   - retention/destruction semantics can be rehearsed before real credentials.

8. **Reasonable owner overhead**
   - among products that satisfy the security contract, prefer the simplest setup and daily ownership burden.

### Candidate comparison to commission

The next documentation/research task should compare a small set of simple candidates, for example:

- **1Password**
- **Bitwarden / Bitwarden Secrets Manager**
- **Google Cloud Secret Manager**

These names are candidates only. This packet does not select, install, subscribe to or configure any of them.

The comparison must use current authoritative product documentation and, where necessary, synthetic-only validation. It must explicitly determine:

- whether exact prior-version retrieval is supported;
- what stable nonsecret version/item identifier can bind SAME A;
- whether historical A remains retrievable after later versions/updates;
- audit/access-history coverage;
- MFA/ACL controls;
- deletion/destruction semantics;
- whether a sole-custodian configuration is practical;
- whether the product requires infrastructure/runtime integration that B5 does not need;
- total operational overhead for the owner.

### Selection rule

Choose the **simplest** product that fully satisfies all B5 requirements.

Do not choose Google Cloud merely because it has strong versioning.
Do not choose a password manager merely because it is convenient.
Do not weaken SAME-A or audit requirements to force a simpler product to pass.

If two products both satisfy B5, prefer the one with lower ongoing owner overhead and less unrelated infrastructure.

## Proposed custodian policy

Proposed sole read/write custodian:

**Maroine EL Forssa**

No backup custodian is proposed in this revision.

The owner must explicitly accept that sole custody creates a recovery limitation: loss, lockout or unavailability of the custodian's vault account could delay rotation/recovery until account access is restored.

Adding a backup later requires an explicit owner amendment and ACL review.

## Nonsecret evidence/reference contract

Whatever vault is selected, repository/operator evidence may record only the minimum nonsecret reference needed to bind a logical credential to an exact custody object/version.

Acceptable shape is product-dependent, for example:

- logical credential label: `A` or `B`
- vault product
- vault/container/item identifier
- immutable version/history identifier if the product exposes one
- issuance UTC
- app ID / subject ID
- token expiry / data-access metadata
- state: stored / active / revoked / invalid / destroyed

Never record:

- token value
- token fragment
- token hash
- secret-bearing URL
- app secret
- screenshot containing a secret
- raw provider response
- clipboard contents

If a candidate cannot provide a nonambiguous SAME-A reference without using the secret itself, it does not satisfy B5.

## Retention and destruction policy

The existing B5 policy remains:

- retain A in restricted encrypted custody until explicit invalidity is independently accepted;
- failed/inconclusive revoke retains A as possibly valid;
- after accepted A-invalid evidence is secured, destroy/remove A from ordinary retrievable custody within **24 hours** if the selected product can do so without invalidating the evidence model;
- preserve the nonsecret custody reference and destruction/retention attestation;
- if the product necessarily retains encrypted historical versions, document that behavior and obtain explicit owner acceptance rather than falsely claiming physical destruction;
- B remains under active lifecycle retention/rotation rules.

The vendor comparison must therefore classify each candidate's deletion/history behavior before owner selection.

## Private workstation/session contract

All real credential handling remains human-only.

Proposed handling workstation:

- owner's private Mac workstation;
- private browser/app session used only for the approved operation;
- screen sharing/recording off;
- agent/computer-use automation off before any credential-bearing screen;
- browser/app sync behavior for sensitive fields understood and accepted;
- clipboard history/cloud clipboard disabled;
- extensions/tools capable of capturing fields/requests disabled;
- no screenshots, HAR capture, developer-tools request recording or diagnostic upload;
- no plaintext file, Notes document, terminal, shell history, `.env`, chat, repository or database copy.

If transient clipboard use is unavoidable, it is cleared immediately and never synced. Direct protected insertion is preferred.

## B5 synthetic readiness rehearsal

After a vault candidate is owner-selected and separately authorized, B5 may become READY only after a **synthetic-only** setup and validation.

No Meta token, app secret or real credential is involved.

Required rehearsal:

1. Configure/reconcile the chosen human-only vault/container and ACL.
2. Confirm MFA and sole-custodian effective access.
3. Add synthetic credential S1.
4. Add distinct synthetic credential S2 in the product's intended A/B version/item model.
5. Record only nonsecret references.
6. Retrieve exact S1 after S2 exists.
7. Retrieve exact S2 separately.
8. Confirm audit/history evidence without exposing values.
9. Confirm no EH runtime/CI/agent principal can access the vault.
10. Exercise the selected retention/destruction behavior using synthetic material.
11. Record pass/fail, UTC, product/tool revision and nonsecret references only.

B5 remains NOT READY if there is ACL ambiguity, history/version ambiguity, inability to retrieve SAME S1, value leakage, agent/runtime access, audit uncertainty or unacceptable retention behavior.

## Proposed B5 READY acceptance

After vendor selection, synthetic validation and independent review, B5 may be classified:

**B5 = READY**

only when all of these are true:

- owner formally selected a qualifying vault product;
- Maroine EL Forssa is the sole approved read/write custodian, unless an explicit reviewed amendment names a backup;
- MFA is confirmed;
- effective ACL/inherited access inventory is accepted;
- no EH runtime/CI/agent access exists;
- exact A/B identity semantics are demonstrated synthetically;
- SAME-version/item retrieval is demonstrated;
- audit/history behavior is demonstrated;
- retention/destruction behavior is bound;
- private human handling contract is accepted and rehearsed;
- exact nonsecret reference format is recorded;
- independent review returns READY.

Product selection alone does not make B5 READY.

## Vercel Production custody contract

The accepted B credential later goes to **Vercel Production Secret** under a separate Production authorization.

That later runtime action must preserve these boundaries:

- Production only;
- server-side only;
- no Preview/Development copy;
- no client exposure;
- no receptionist/user visibility;
- no runtime call to the recovery vault;
- no secret export into repository/chat/logs;
- no `vercel env pull` or equivalent secret-export workflow for this credential;
- deployment/configuration happens only after credential acceptance and separate Production approval.

The recovery-vault copy and Vercel Production copy serve different purposes and must not be conflated.

## Safe non-event inspector — focused next assessment

Inspector remains:

**BLOCKED**

This packet does not approve a real token inspector.

### Preferred candidate

The first candidate remains Meta's human **Access Token Debugger**, used in a private authenticated human Meta session.

Meta's public `debug_token` documentation URL remains the canonical reference candidate:

<https://developers.facebook.com/docs/graph-api/reference/debug_token/>

No unsupported transport/caller semantics are inferred from this proposal.

The human debugger is preferred over immediately building a custom utility only if a synthetic-only assessment can prove all existing safety requirements.

### Synthetic-only inspector assessment contract

After B5 vendor selection/preparation, but still before real A:

1. Use a private human Meta session with MFA.
2. Do not issue or expose any lifecycle token.
3. Open only the current official Access Token Debugger surface.
4. Use a clearly synthetic/noncredential test string if input behavior must be exercised.
5. Confirm the browser page URL/history never contains the submitted value.
6. Confirm no redirect places the value in a URL.
7. Confirm no screenshot, HAR, request log, developer-tools capture or diagnostics are required.
8. Establish what authenticates the inspector and whether that authority is independent of the future lifecycle System User/revoke-all identity.
9. Establish a nonsecret health signal that distinguishes an inspector/authentication failure from evaluated-token invalidity.
10. Establish the exact allowlisted output fields required by the existing inspection contract.
11. Record source/tool/version, UTC and pass/fail only.

The assessment must stop if a credential value would be placed in a URL/history, copied into agent-visible state, require an app secret/new recovery credential, or if inspector health cannot be independently distinguished.

### Prohibited shortcuts

Do not:

- use Graph Explorer as an assumed substitute;
- use `GET /debug_token?...input_token=...` with token values in a URL;
- invent GET-with-body or POST semantics without current supported evidence;
- pass tokens through shell arguments, environment variables, files or EH application code;
- use A/B or another token from the same revoked lifecycle identity to authenticate the inspector;
- call `/events`, Test Events or any write endpoint;
- infer invalidity from a dataset permission error or other loss of access.

### Inspector outcome

Only after a separate focused assessment and independent review may the state change to:

**safe non-event inspector = READY**

If the human debugger cannot satisfy the contract, remain BLOCKED and prepare a separately reviewed standalone operator-utility design. No speculative utility is authorized by this packet.

## Sequence after B5 + inspector readiness

Even after both become READY, real credentials remain a later separate Tier-3 operator stage.

Required future order remains:

1. Select and validate the simplest qualifying B5 recovery vault.
2. B5 READY.
3. Safe non-event inspector READY.
4. Exact credential/recovery operator packet independently reviewed and owner-authorized.
5. Human issues A exactly once into protected recovery custody.
6. Inspect SAME A non-event; accept B1 actual credential metadata/effective-authority record only if complete.
7. Execute the separately authorized exclusive identity-wide revoke-all once.
8. Verify SAME A explicitly invalid under the existing bounded observation/lifetime/clock contract.
9. Only after successful A-invalid proof, human issues B exactly once.
10. Inspect B non-event and complete B1 acceptance.
11. Later separate Production approval stores accepted B as the Vercel Production Secret.
12. H3-06–08 remain separately gated.
13. H4 genuine eligible delivery remains a separate activation stage.

No step in this proposal authorizes that sequence.

## Owner decision required

The smallest next owner decision is:

> Approve the vendor-neutral B5 architecture: **Vercel Production Secret is the runtime store**, while a separate **human-only recovery vault** is used solely for A/B custody and SAME-A verification. Keep the recovery-vault vendor unselected. Approve Maroine EL Forssa as sole proposed read/write custodian with no backup at this stage, accept the associated account-loss/unavailability limitation, retain the existing private-Mac handling and retention rules, and commission a short comparison of the simplest qualifying vault candidates plus the synthetic-only Meta Access Token Debugger assessment. This decision authorizes documentation/research only, not Vercel configuration, vault setup, Meta access, token generation, token inspection, app-secret access, revoke, Production mutation or provider events.

Until exact-head review and explicit owner adoption:

- **B5 = OWNER DECISION REQUIRED**
- **safe non-event inspector = BLOCKED**
- **PREFLIGHT VERIFIED = NO**
- **B1 actual credential acceptance = PENDING**
- all credential/recovery/Production/H4 operations remain unauthorized
