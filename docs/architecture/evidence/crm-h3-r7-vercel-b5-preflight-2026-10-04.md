# H3 Revision 7 — Vercel-only B5 nonsecret preflight, 2026-10-04

> **HISTORICAL — SUPERSEDED BY S1.** S1 was owner-adopted and merged through PR #93 / main `284c2fe32014f8f3011ac6677ddfe99b0a16ca22`. Use the [sole active S1 Gate-B credential runbook](../plans/crm-h3-s1-gate-b-credential-runbook.md). Conflicting credential/bootstrap/inspector/rehearsal/per-action instructions below are retired, not execution requirements. Preserve original dated observations, findings and approval scope; unrelated R4 delivery safeguards remain. No historical approval authorizes current credential execution or activation.

## Status

**Tier 3 — read-only/nonsecret provider preflight.**

Owner-adopted Vercel-only custody amendment is merged at main:

`6c62828d7b1edd53db2880ba3823dd25d8823d6f`

This preflight performs no Vercel mutation and reads no decrypted credential value.

Observation completion time:

**2026-10-04 05:32:29 UTC** or earlier.

## Adopted target

Future lifecycle token reference:

`CRM_META_LIFECYCLE_TOKEN_EH_R4`

Adopted custody boundary:

- Vercel Secret / API type `sensitive`
- Production only
- server-side only
- no Preview or Development copy
- no client exposure
- no readback/export
- no `vercel env pull`
- no external recovery-vault copy

## Exact Vercel account/project binding

Read-only Vercel account metadata established:

- Team name: **English Hills' projects**
- Team slug: `english-hills-projects`
- Team ID: `team_egUbt9wN23I40I1K71zxfYGj`
- Project: **english-hills-admin**
- Project ID: `prj_hC0MvqsXYmERXhZWGEfOOma8D6E3`
- Framework: Next.js
- authenticated human principal is a confirmed **OWNER** of this team
- authenticated human account reports **MFA enabled**

No secret value or login credential is recorded here.

## Environment-variable capability/readback

Read-only project environment-variable metadata was retrieved with decryption explicitly disabled.

Relevant findings:

1. `CRM_META_LIFECYCLE_TOKEN_EH_R4` is **absent**.
2. `CRM_META_LIFECYCLE_LIVE_ENABLED` is **absent**.
3. Existing unrelated project variables demonstrate that Vercel supports:
   - API type `sensitive`
   - dashboard visibility `secret`
   - target `production` only
   - metadata readback with `decrypted=false`
4. No hidden Production variable count was reported by the metadata listing.
5. The target lifecycle token therefore has no conflicting existing project variable to overwrite.

This evidence does not read, compare, decrypt or export any existing environment-variable value.

### Terminology binding

For this packet:

- architecture phrase **Vercel Secret**
- Vercel API type **`sensitive`**
- observed metadata visibility **`secret`**

refer to the intended protected non-readable project environment-variable mode.

Do not substitute API type `encrypted`, `plain` or any readable Config-style mode for the lifecycle credential.

## Current official Vercel control surface

Current Vercel documentation and API schema expose project-environment creation with:

- exact project name/ID;
- key;
- value;
- type `sensitive`;
- target containing `production`.

Current official Vercel documentation describes sensitive variables as hidden in the Dashboard and suitable for secrets such as API keys/tokens.

No write call was made in this preflight.

## Application/runtime binding

Current main code independently supports the adopted secret-reference design.

### Server-only boundary

`src/lib/crm/lifecycle/server.js` imports `server-only`.

### Exact secret-reference validation

`src/lib/crm/lifecycle/worker.mjs`:

- retrieves `delivery.mapping.secret_ref`;
- requires the reference to match `^CRM_META_LIFECYCLE_TOKEN_[A-Z0-9_]{1,64}$`;
- resolves the token at runtime from the server environment using `env[ref]`;
- blocks when the referenced environment secret is missing.

The adopted target `CRM_META_LIFECYCLE_TOKEN_EH_R4` satisfies that naming contract.

### Independent live gates

The live worker additionally requires:

- the process-level live gate argument;
- `CRM_META_LIFECYCLE_LIVE_ENABLED === 'true'`;
- live-mode configuration;
- the resolved credential.

The live-enabled environment key is currently absent.

Therefore a later token-storage action alone cannot satisfy the current live-send gate.

This preflight makes no claim that H3-06–08/H4 are ready.

## Future exact conditional storage contract

The later credential/recovery operator packet may conditionally store B only with this exact binding:

- Team: `team_egUbt9wN23I40I1K71zxfYGj / English Hills' projects`
- Project: `prj_hC0MvqsXYmERXhZWGEfOOma8D6E3 / english-hills-admin`
- Key: `CRM_META_LIFECYCLE_TOKEN_EH_R4`
- Type: Vercel Secret / API `sensitive`
- Target: **production only**
- Preview: absent
- Development: absent
- Custom environments: none for this credential
- no upsert/overwrite shortcut if an unexpected conflicting key exists
- one deliberate create/store action only after B passes safe non-event/B1 acceptance
- direct insertion of the exact accepted B in the same private human session
- no intermediate persistent copy
- no CLI/argv/file/env export handling
- no `vercel env pull`
- no activation/gate/scheduler mutation bundled with storage

If the target key appears before the future operator action, stop and reconcile; do not overwrite it by default.

## Future post-storage nonsecret readback

After separately authorized successful B insertion, the allowed evidence is metadata only:

- key exists exactly once;
- API type `sensitive`;
- visibility `secret` when exposed by the surface;
- target exactly `production`;
- `decrypted=false`;
- no Preview/Development/custom target;
- no security warning indicating a readable-secret mode;
- creation/update result is unambiguous.

Do not call a decrypted-value endpoint.
Do not display, copy, hash, fingerprint or compare the token.
Do not use a screenshot that exposes the secret value.

## Preflight result

All currently knowable nonsecret Vercel conditions for the Vercel-only B5 architecture pass:

- exact team/project: **PASS**
- authenticated owner role: **PASS**
- human MFA enabled: **PASS**
- sensitive/secret project-variable capability: **PASS**
- Production-only target capability: **PASS**
- target lifecycle secret absent: **PASS**
- Preview/Development target lifecycle secret absent: **PASS**
- lifecycle live-enabled env key absent: **PASS**
- runtime exact-ref/server-only binding: **PASS**
- independent live-gate separation: **PASS**
- no provider mutation or secret read: **PASS**

Classification:

**B5 NONSECRET VERCEL PREFLIGHT = PASS**

This does not itself authorize credential issuance/storage.

Proposed later readiness classification after exact-head independent review and owner adoption of this evidence plus the exact conditional-storage contract:

**B5 = READY**

The safe non-event inspector remains an independent prerequisite and is not cleared by this Vercel result.

## Holds

- **safe non-event inspector = BLOCKED**
- **B1 actual credential acceptance = PENDING**
- **PREFLIGHT VERIFIED = NO**
- no real A/B generation
- no real token inspection
- no Revoke tokens
- no Vercel mutation
- no H3-06–08
- no H4
- no Test Events or lifecycle send
