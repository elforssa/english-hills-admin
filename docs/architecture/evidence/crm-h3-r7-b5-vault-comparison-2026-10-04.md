# H3 Revision 7 — B5 recovery-vault comparison, 2026-10-04

## Status

**Tier 3 — documentation/research only.**

Baseline main at research start:

`611a934fb92ce39fc84409db2c1507b06fa83a46`

This evidence follows the owner-adopted vendor-neutral B5 architecture:

- **Vercel Production Secret** is the eventual runtime store for accepted credential B.
- A separate **human-only recovery vault** exists only for A/B custody, SAME-A retrieval and recovery evidence.
- The CRM has no runtime dependency on that recovery vault.
- Vault vendor remains **OPEN / UNSELECTED**.
- **B5 = OWNER DECISION REQUIRED**.
- **safe non-event inspector = BLOCKED**.
- **PREFLIGHT VERIFIED = NO**.
- **B1 actual credential acceptance = PENDING**.

No vault account, subscription, project, organization, item, secret, Meta surface, credential, app secret, Vercel setting or Production configuration was accessed or changed by this research.

## Question

Which candidate is the **simplest human-only vault that can satisfy the existing B5 recovery contract without weakening SAME-A evidence**?

Candidates reviewed:

1. 1Password
2. Bitwarden / Bitwarden Secrets Manager
3. Google Cloud Secret Manager

The comparison uses current public official product documentation only. It does not substitute synthetic validation for product behavior that the documentation does not establish.

## B5 acceptance criteria used

A candidate must support or safely permit:

1. stable nonsecret identity for A and B;
2. deterministic retrieval of exact SAME A after B exists;
3. human-only custody with MFA;
4. restricted access and no EH runtime/CI/agent access;
5. safe retention/history so A is not silently overwritten;
6. adequate nonsecret custody/audit evidence;
7. private manual insertion/retrieval without mandatory CLI/env/file exposure;
8. synthetic S1/S2 rehearsal before real credentials;
9. explicit deletion/destruction/history behavior;
10. reasonable owner overhead.

The comparison may use **separate A and B objects/items** instead of one versioned object. B5 requires exact identity and retrieval, not a specific vendor versioning model.

---

## Candidate 1 — 1Password

### Current documented capabilities

Official 1Password documentation states that:

- previous versions of items are retained when an item changes;
- a user can view prior item versions and restore one;
- password history can reveal previously used password values;
- two-factor authentication can be enabled for a 1Password account, including authenticator-app and security-key options;
- 1Password Business provides an audit log for organization activity.

Sources:

- <https://support.1password.com/item-history/>
- <https://support.1password.com/1password-com-items/>
- <https://support.1password.com/two-factor-authentication/>
- <https://support.1password.com/security-key/>
- <https://support.1password.com/activity-log/>

### Fit to B5

**Strengths**

- Lowest likely human operational overhead of the three candidates.
- Strong human-first Mac/web/app experience.
- MFA is documented.
- Historical item versions are human-retrievable.
- Separate A and B items could avoid overwriting A entirely.
- No runtime integration is necessary.

**Current evidence gaps**

1. The reviewed human-facing documentation does **not** establish a stable immutable nonsecret identifier for an individual historical item version that can be used as the repository's SAME-A evidence reference.
2. The documented audit log is a **1Password Business** feature; this research does not establish equivalent built-in audit coverage for a simple individual account.
3. The reviewed documentation does not establish the exact deletion/history persistence behavior needed for the adopted post-invalidity destruction policy.
4. A private item link exists for shared-vault items, but this evidence does not adopt a private URL as a B5 identifier and does not establish that it is appropriate for sole-custodian recovery evidence.

### Safer B5 model to test

Do **not** rely on editing one item from A to B.

Synthetic candidate model:

- dedicated human-only vault;
- create **S1 as one item**;
- create **S2 as a different item**;
- never overwrite S1;
- prove S1 can later be unambiguously identified and retrieved after S2 exists;
- prove a stable nonsecret item reference can be recorded without exposing the secret or relying on a secret-bearing URL;
- determine whether the selected 1Password plan provides sufficient audit/custody history;
- test deletion/recovery/history behavior synthetically.

### Classification

**1PASSWORD = CONDITIONAL / FIRST SIMPLICITY CANDIDATE**

It is the best first candidate for a synthetic human-workflow test because of low owner overhead, but current documentation alone does not yet satisfy the complete stable-reference/audit/destruction evidence contract.

No 1Password account or plan is selected.

---

## Candidate 2 — Bitwarden / Bitwarden Secrets Manager

### Current documented capabilities

Official Bitwarden documentation states that:

- Secrets Manager stores secrets as named key/value objects in projects;
- people and machine accounts can be granted access to secrets;
- Secrets Manager secret objects have stable secret IDs in the documented CLI/API representation;
- a specific secret can be retrieved by its secret ID;
- secret objects expose creation and revision timestamps;
- Bitwarden supports two-step login, including authenticator-app and FIDO2/WebAuthn methods;
- Secrets Manager Teams and Enterprise plans include event/audit logs, while the Free Secrets Manager plan does not;
- Bitwarden event logging includes secret-access actions.

Sources:

- <https://bitwarden.com/help/secrets/>
- <https://bitwarden.com/help/secrets-manager-cli/>
- <https://bitwarden.com/help/secrets-manager-plans/>
- <https://bitwarden.com/help/monitoring-event-logs/>
- <https://bitwarden.com/help/machine-accounts/>
- <https://bitwarden.com/help/setup-two-step-login/>

### Fit to B5

**Strengths**

- Stable secret UUIDs are explicitly documented.
- Separate A and B secret objects can provide deterministic identity without relying on secret-history/versioning.
- MFA is documented.
- Teams/Enterprise provide event/audit logs.
- Human access is supported; machine access is optional and can remain unused.
- Separate-object design means A need never be edited after creation.

**Current evidence gaps**

1. The reviewed Secrets Manager documentation does **not** establish immutable historical secret-value versions after an edit. Therefore B5 must use separate A/B secret objects and prohibit editing A's value.
2. The clearest exact secret-ID retrieval documentation is CLI-oriented. The B5 real handling contract prohibits mandatory CLI/argv/env/file secret handling, so synthetic validation must prove that the normal human web UI can safely identify and retrieve exact S1 by a stable nonsecret reference without requiring CLI use for real credentials.
3. Event/audit logs are not included in the Free Secrets Manager tier according to current plan documentation. A plan with audit logging may therefore be required unless an independently reviewed equivalent custody-evidence mechanism is accepted.
4. Deletion/history semantics for a deleted Secrets Manager secret are not sufficiently established in the reviewed documentation for the B5 destruction record and need synthetic/documentation follow-up.

### Safer B5 model to test

Synthetic candidate model:

- one dedicated project/container;
- human-only access;
- no machine accounts for the lifecycle vault;
- create S1 and S2 as **two distinct secrets with separate IDs**;
- never edit S1's value;
- prove human UI can retrieve exact S1 by its stable identity after S2 exists;
- verify chosen-plan event/audit coverage for create/read/delete actions;
- test deletion and residual-history behavior;
- prohibit Secrets Manager export and CLI for real credential handling.

### Classification

**BITWARDEN = CONDITIONAL / SECOND SIMPLICITY CANDIDATE**

Bitwarden has a stronger documented stable object identifier than 1Password, but the current B5 human-only and audit requirements likely require plan/flow validation before it can be selected.

No Bitwarden plan or organization is selected.

---

## Candidate 3 — Google Cloud Secret Manager

### Current documented capabilities

Official Google Cloud documentation states that:

- secret payload data is immutable once stored as a secret version;
- secret versions receive explicit numbered version IDs;
- a user can access a specific version by exact version ID in the Google Cloud console;
- secret-version metadata can be listed separately from secret payload access;
- IAM includes distinct roles for accessing payloads and managing versions;
- Secret Manager records Admin Activity and Data Access audit logs, including `AccessSecretVersion`;
- destroying a secret version permanently discards its contents and prevents later recovery;
- optional delayed version destruction can schedule destruction while keeping a temporary recovery window.

Sources:

- <https://docs.cloud.google.com/secret-manager/docs/add-secret-version>
- <https://docs.cloud.google.com/secret-manager/docs/access-secret-version>
- <https://docs.cloud.google.com/secret-manager/docs/view-secret-version>
- <https://docs.cloud.google.com/secret-manager/docs/access-control>
- <https://docs.cloud.google.com/iam/docs/roles-permissions/secretmanager>
- <https://docs.cloud.google.com/secret-manager/docs/audit-logging>
- <https://docs.cloud.google.com/secret-manager/docs/destroy-secret-version>
- <https://docs.cloud.google.com/secret-manager/docs/delay-destruction-of-secret-versions>

### Fit to B5

**Strengths**

- Strongest direct match to the existing SAME-A evidence model.
- Exact numbered version ID cleanly binds A.
- Exact old version can be retrieved after later versions exist.
- Human console retrieval is documented; CLI is not required for the intended B5 path.
- IAM can separate payload access from other administrative capabilities.
- Secret reads are covered by Data Access audit logging.
- Destruction semantics are explicit and permanent.
- No application/runtime integration is required.

**Operational cost**

- Requires a Google Cloud project and IAM understanding.
- Requires audit-log configuration/review.
- Requires owner attention to inherited project-level access.
- Adds an infrastructure service solely for recovery custody.
- Higher setup/maintenance overhead than a simple password manager.

### Classification

**GOOGLE CLOUD SECRET MANAGER = TECHNICALLY SUFFICIENT CANDIDATE / HIGHER OVERHEAD**

From the public official documentation reviewed, it is the only candidate of the three whose core exact-version, retrieval, audit and destruction semantics already map cleanly to B5 without changing the evidence model.

This is not an owner selection.

---

## Comparison

| Requirement | 1Password | Bitwarden Secrets Manager | Google Cloud Secret Manager |
| --- | --- | --- | --- |
| Human-first use | Strong | Good | Moderate |
| MFA | Documented | Documented | Google-account/IAM posture must be validated later |
| Stable A/B object identity | Needs synthetic proof for human workflow | Documented secret IDs | Explicit numbered versions |
| Deterministic SAME-A retrieval | Historical retrieval exists; exact evidence binding still needs proof | Good with separate A/B secrets; human UI proof needed | Explicit exact-version retrieval |
| Can avoid overwriting A | Yes, separate items | Yes, separate secrets | Yes, immutable versions |
| Built-in audit evidence | Business audit log documented | Teams/Enterprise event logs | Data Access/Admin Activity logs |
| Clear permanent destruction semantics | Needs follow-up | Needs follow-up | Explicit version destruction |
| No runtime dependency | Yes | Yes | Yes |
| Likely owner overhead | Lowest | Low–medium | Highest |
| Current B5 status | CONDITIONAL | CONDITIONAL | TECHNICALLY SUFFICIENT CANDIDATE |
| Selected? | No | No | No |

## Recommended qualification order

To honor the owner's preference for simplicity without weakening B5:

### 1. Test 1Password first

Reason: likely lowest owner burden.

Use **two separate synthetic items**, not historical versions as the primary identity model.

The test must answer only the unresolved B5 questions:

- can S1 be assigned a stable nonsecret human-visible reference;
- can exact S1 be retrieved after S2 exists without comparing secret text;
- can the chosen plan provide adequate custody/audit history;
- what happens after deletion and to previous versions/history;
- can the workflow comply with browser-sync-disabled credential handling and no export/download.

If all pass, 1Password can become the preferred owner-selection candidate.

If not, stop; do not weaken B5.

### 2. Test Bitwarden second

Use **two separate secrets with separate IDs**, never an edit from A to B.

Confirm human-only exact-ID retrieval, appropriate audit-plan coverage and deletion behavior without CLI for real credentials.

### 3. Use Google Cloud Secret Manager as the strong fallback

If the simpler candidates cannot satisfy exact identity/retrieval/audit/destruction requirements cleanly, Google Cloud Secret Manager already has the clearest documented fit.

## Important architecture conclusion

The comparison does **not** require the recovery vault to provide application runtime secrets.

The accepted final architecture remains:

`Meta accepted B → Vercel Production Secret → EH CRM`

and separately:

`A/B recovery copies → owner-only recovery vault`

The vault exists only for issuance/rotation/recovery evidence.

## Inspector boundary

This comparison does not change the inspector state.

**safe non-event inspector = BLOCKED**

The separately authorized synthetic-only Meta Access Token Debugger assessment remains future work and must not use a real lifecycle token.

## Decision state after research

No vault is selected by this evidence.

Current state remains:

- **B5 = OWNER DECISION REQUIRED**
- **vault vendor = OPEN / UNSELECTED**
- **safe non-event inspector = BLOCKED**
- **PREFLIGHT VERIFIED = NO**
- **B1 actual credential acceptance = PENDING**

### Proposed next step

Prepare a **1Password-first synthetic B5 qualification packet** that uses only synthetic S1/S2 records and current official documentation.

That future packet may inspect/configure 1Password only after separate exact-head review and owner authorization. It must not access Meta, Vercel Production or any real credential.

If the owner does not want to create or pay for 1Password, the same process can begin with Bitwarden instead; no architecture change is required.
