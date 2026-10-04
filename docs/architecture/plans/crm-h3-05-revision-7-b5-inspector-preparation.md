# H3 Revision 7 — B5 custody and safe non-event inspector preparation

## Status

**Tier 3 — documentation-only proposal.**

This packet follows the owner-adopted and merged created-object state:

- **4A = VERIFIED C2 CREATION**
- **4B = VERIFIED ASSOCIATION**
- **4C = VERIFIED DATASET GRANT**

Current main at preparation start: `1e32ac77d5234f39e4c6b6511e79cd5efff827a8`.

This packet authorizes **no Google Cloud mutation, Meta access, credential generation, token inspection, app-secret access, revocation, Production mutation, H3-06–08, H4, Test Events or lifecycle sending**.

Its purpose is to turn the existing [B5 custody and handling contract](crm-h3-05-revision-7-step-2-preparation.md#b5-custody-and-handling-contract) and [safe non-event inspection contract](crm-h3-05-revision-7-step-2-preparation.md#safe-non-event-inspection-contract) into one reviewable owner decision and a later synthetic-only validation sequence.

## Existing gate state

Before this packet:

- **CREATED-OBJECT PREFLIGHT COMPLETE = NOT CLAIMED**
- **PREFLIGHT VERIFIED = NO**
- **B1 actual credential acceptance = PENDING**
- **B5 = OWNER DECISION REQUIRED**
- **safe non-event inspector = BLOCKED**
- real A/B issuance, revoke-all rehearsal and Production storage remain unauthorized

Created-object verification does not itself authorize credentials.

## B5 recommended vault candidate

### Recommended product

**Google Cloud Secret Manager**, inside a dedicated Google Cloud project used only for English Hills lifecycle credential custody.

This recommendation is based on the B5 contract's need for exact immutable-version custody rather than general password storage.

Current official Google Cloud documentation states:

- secret version payloads are immutable;
- secret versions are ordered/numbered and can be addressed by exact version ID;
- an exact version can be accessed directly instead of relying on `latest`;
- access can be scoped through Secret Manager IAM roles at secret/resource level;
- Secret Manager provides Admin Activity and Data Access audit-log surfaces.

References:

- <https://docs.cloud.google.com/secret-manager/docs/overview>
- <https://docs.cloud.google.com/secret-manager/docs/add-secret-version>
- <https://docs.cloud.google.com/secret-manager/docs/access-secret-version>
- <https://docs.cloud.google.com/secret-manager/docs/access-control>
- <https://docs.cloud.google.com/secret-manager/docs/audit-logging>
- <https://docs.cloud.google.com/secret-manager/docs/rotation-recommendations>

This is a **recommended owner choice**, not an already selected product.

### Proposed dedicated container

Owner-facing display name:

**EH Lifecycle Credential Vault**

Provider implementation:

- one dedicated Google Cloud project with no EH runtime, Vercel, Supabase, GitHub Actions, agent, CI or service-account credential access;
- exact globally unique Google Cloud project ID is chosen only during a later separately authorized setup;
- no other English Hills application workloads should be placed in this project.

Proposed secret resources inside that project:

1. `eh-meta-lifecycle-custody-rehearsal`
   - synthetic values only;
   - validates handling, versioning, exact-version retrieval and audit evidence before any real token exists.

2. `eh-meta-lifecycle-token`
   - real lifecycle credential custody only after B5 is independently accepted READY and later credential issuance is separately authorized;
   - A and B are separate immutable numbered versions of this same secret;
   - repository evidence uses logical labels A/B plus the provider's nonsecret immutable version resource reference.

No secret value, fragment, hash, URL, screenshot or copy of a token belongs in repository evidence.

## Proposed human custody and ACL

Proposed sole read/write custodian:

**Maroine EL Forssa**

No backup custodian is proposed in this revision. Adding one later requires an explicit owner amendment and ACL review.

Required account posture before B5 can become READY:

- Google account used for custody has MFA / 2-Step Verification enabled;
- only the named custodian has permissions that permit reading or adding versions to the lifecycle secret;
- no EH runtime identity, service account, CI identity, GitHub integration or agent receives Secret Accessor permissions;
- project/secret IAM is reviewed for inherited principals before synthetic validation;
- Secret Manager Data Access audit logging is enabled for the dedicated project so secret reads are auditable;
- audit/log administrators must not receive secret payload access merely to inspect logs.

The exact least-privilege IAM binding must be captured during the later setup/readiness packet. This proposal does not grant roles.

## Nonsecret version-reference format

Repository and operator evidence may record only a nonsecret resource reference in this shape:

`projects/<project-number>/secrets/<secret-name>/versions/<version-number>`

Examples must use placeholders or synthetic resources until real issuance.

For the eventual real credential:

- logical A binds one exact immutable version reference;
- logical B binds a different exact immutable version reference;
- `latest` is never sufficient evidence for A/B identity;
- SAME A post-revoke inspection must be tied to A's unchanged exact version reference.

Secret metadata may record app ID, subject ID, issuance/expiry/data-access metadata and status separately from the value.

## Retention and destruction proposal

Adopt the existing B5 retention rule:

- retain A in restricted encrypted custody until explicit invalidity is independently accepted;
- failed/inconclusive revocation retains A as possibly valid;
- after accepted A-invalid evidence is secured, destroy A's Secret Manager version within **24 hours**;
- preserve the nonsecret version reference, destroyed-state evidence and destruction attestation;
- B remains retained under the active credential lifecycle policy;
- do not delete the whole secret merely to remove A.

Because destroyed Secret Manager versions are not retrievable, destruction happens only after the SAME A verification evidence is complete and independently accepted.

## Private workstation/session contract

All real credential handling remains human-only.

Proposed handling workstation:

- owner's private Mac workstation;
- private browser session used only for the approved operation;
- screen sharing/recording off;
- agent/computer-use automation off before any credential-bearing screen;
- browser sync for sensitive form content disabled;
- clipboard history/cloud clipboard disabled;
- extensions capable of capturing fields/requests disabled;
- no screenshots, HAR capture, developer-tools request recording, diagnostic upload or browser export;
- no plaintext file, Notes document, terminal, shell history, `.env`, chat, repository, database or ordinary clipboard persistence.

If transient local clipboard use is unavoidable, it is cleared immediately and never synced. Direct protected insertion is preferred.

## Synthetic B5 readiness rehearsal

B5 may become READY only after a separately authorized **synthetic-only** setup and validation.

No Meta token, app secret or real credential is involved.

Required synthetic rehearsal:

1. Create/reconcile the dedicated project and exact IAM/audit configuration.
2. Create `eh-meta-lifecycle-custody-rehearsal`.
3. Human privately adds synthetic version S1.
4. Human privately adds distinct synthetic version S2.
5. Record only their nonsecret numbered version references.
6. Retrieve exact S1 by immutable version reference, not `latest`.
7. Retrieve exact S2 separately.
8. Confirm audit evidence for version creation/access without exposing values.
9. Confirm no EH runtime/service-account/CI/agent principal can access the secret.
10. Exercise the chosen destroy/retention behavior using synthetic material and confirm the nonsecret destroyed-state record.
11. Record pass/fail, UTC, product/tool revision and nonsecret references only.

Synthetic value contents are not needed in evidence.

B5 remains NOT READY if any ACL inheritance, audit gap, version ambiguity, value leakage, browser capture, agent access or same-version retrieval problem remains.

## Proposed B5 READY acceptance

After synthetic validation and independent review, B5 may be classified:

**B5 = READY**

only when all of these are true:

- owner has formally selected Google Cloud Secret Manager and the dedicated project/container model;
- Maroine EL Forssa is the sole approved read/write custodian;
- MFA is confirmed;
- exact IAM/inherited-access inventory is accepted;
- no EH runtime/CI/agent access exists;
- immutable numbered version semantics are demonstrated synthetically;
- SAME-version retrieval is demonstrated;
- Data Access audit evidence is demonstrated;
- retention/destruction behavior is bound;
- private human handling contract is accepted and rehearsed;
- exact nonsecret reference format is recorded;
- independent review returns READY.

Selecting the product alone does not make B5 READY.

## Safe non-event inspector — focused next assessment

Inspector remains:

**BLOCKED**

This packet does not approve a real token inspector.

### Preferred candidate

The first candidate for focused assessment is Meta's human **Access Token Debugger**, used in a private authenticated human Meta session.

Meta's public `debug_token` documentation URL remains the canonical reference candidate:

<https://developers.facebook.com/docs/graph-api/reference/debug_token/>

A public fetch during this preparation could not retrieve the page because Meta returned HTTP 429. Therefore no new transport/caller semantics are claimed from that page.

The human debugger is preferred over immediately building a custom utility only if a synthetic-only assessment can prove all existing safety requirements.

### Synthetic-only inspector assessment contract

After B5 selection/readiness preparation, but still before real A:

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

1. B5 READY.
2. Safe non-event inspector READY.
3. Exact credential/recovery operator packet independently reviewed and owner-authorized.
4. Human issues A exactly once into protected custody.
5. Inspect SAME A non-event; accept B1 actual credential metadata/effective-authority record only if complete.
6. Execute the separately authorized exclusive identity-wide revoke-all once.
7. Verify SAME A explicitly invalid under the existing bounded observation/lifetime/clock contract.
8. Only after successful A-invalid proof, human issues B exactly once.
9. Inspect B non-event and complete B1 acceptance.
10. Later separate Production approval may store/reference accepted B and prepare H3-06–08.
11. H4 genuine eligible delivery remains a separate activation stage.

No step in this proposal authorizes that sequence.

## Owner decision required

The smallest next owner decision is:

> Select **Google Cloud Secret Manager** as the external B5 custody product, using a dedicated **EH Lifecycle Credential Vault** Google Cloud project; approve **Maroine EL Forssa as sole read/write custodian with no backup**; approve the immutable numbered-version A/B model, private Mac handling contract, synthetic rehearsal requirement, Data Access audit requirement, and the proposed rule to destroy invalid A within 24 hours after independent acceptance evidence is secured. Commission preparation of a synthetic-only B5 setup/operator packet and a separate synthetic-only Meta Access Token Debugger assessment. This decision authorizes documentation/preparation only, not Google Cloud setup, Meta access, token generation, token inspection, app-secret access, revoke, Production mutation or provider events.

Until exact-head review and explicit owner adoption of that decision:

- **B5 = OWNER DECISION REQUIRED**
- **safe non-event inspector = BLOCKED**
- **PREFLIGHT VERIFIED = NO**
- **B1 actual credential acceptance = PENDING**
- all credential/recovery/Production/H4 operations remain unauthorized
