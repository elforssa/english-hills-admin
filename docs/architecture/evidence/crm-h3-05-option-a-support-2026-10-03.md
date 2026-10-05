# H3-05 Option A — Meta support clarification

**H3-05 OPTION A: NOT VIABLE UNDER APPROVED RECOVERY REQUIREMENT**

## Provenance and evidence boundary

Recorded 2026-10-03 (Asia/Shanghai) for [PR #60](https://github.com/elforssa/english-hills-admin/pull/60), correcting pre-update head `1faa5141a21583c9513b914c9f0df04514deae7f`. Source: the owner's account-specific Meta support AI clarification supplied to this task. This is **Meta support AI/account-specific support evidence**, not independently verified engineering documentation, a credential inspection or a tested revocation result. The owner explicitly authorized recording these conclusions and concluding Option A; this authorization does not approve Option C or any account/Production operation.

The preceding authenticated conversation was with **Meta AI business assistant**, titled **Events Manager Direct CAPI Tokens**, at [Meta Business Support Home](https://www.facebook.com/business-support-home/). The original response was observed at 2026-10-02 16:46:26 UTC / 2026-10-03 00:46:26 Asia/Shanghai; that is an observation timestamp, not the exact provider reply timestamp. The latest clarification is owner-relayed: its exact provider reply timestamp, case/reference ID and individual support-agent identity were not supplied. No case ID or engineering escalation is claimed. The clarification was not independently retrieved in this documentation correction.

Account/route context: Glory Lot business `1741597822557523`, English Hills dataset `1152399921284927`, Events Manager → Settings → Conversions API → Set up direct integration → **without Dataset Quality API** → Generate access token. The support inquiry included only nonsecret asset IDs. No token/app-secret value was supplied or requested by this task. A generic documentation link is not treated as account-specific confirmation.

## Exact owner-supplied material conclusions

The following preserves the owner's supplied wording of the material conclusions. It is not represented as a verbatim full Meta chat transcript:

> 1. The without-DQA Events Manager direct credential is described as a **Meta-managed System User Access Token**, not a Page Access Token.
> 2. Repeated `Generate access token` creates a **new token under the same Meta-managed app/System User identity**, not a new app or System User.
> 3. Events Manager does **not** expose an individual-token inventory/revoke control for this route.
> 4. Meta does not expose the managed app `client_secret`, so the customer's documented `oauth/revoke` route cannot be established as an operator-controlled recovery mechanism.
> 5. Business Settings `Revoke tokens` operates at System User level and invalidates all tokens for that System User.
> 6. Therefore the approved Option A requirement for isolated replacement/revocation cannot currently be satisfied.

This clarification supersedes the initial Meta AI answer's descriptions of a Page Access Token, a new identity per generation and granular individual revocation in Events Manager. Those earlier claims are not accepted as recovery authority. The initial answer also suggested credential-debugger and Test Events checks; neither was performed. The correction does not supply exact numerical future issuing-app/subject bindings or a complete token-to-consumer inventory, and this task does not equate the future token with previously observed asset IDs.

## Assessment against the approved requirement

The [recovery plan](../plans/historical/crm-h3-05-credential-recovery.md) requires isolated replacement/revocation and survival of unrelated integrations. Official [individual revocation documentation](https://developers.facebook.com/docs/business-management-apis/system-users/install-apps-and-generate-tokens#revoke-token) remains a documented mechanism for qualifying system-user tokens; the support clarification does not establish the managed app secret or independent same-app caller prerequisites for this route. Its applicability as an operator-controlled recovery mechanism remains unestablished. Support also reports no token-specific Events Manager control.

Consequently, **generate replacement → switch → revoke old** does not provide isolated recovery using the currently established System User control. Old and replacement credentials share the same System User revocation domain. `Revoke tokens` invalidates all tokens for that System User, including the replacement; switching the EH environment secret does not change the provider revocation domain. It may also interrupt other consumers in that domain, whose exact dependencies remain unknown. A new token value alone does not create an isolated identity or recovery boundary.

Option A therefore cannot satisfy **English Hills' approved isolated-recovery requirement with the controls currently established**. This is a bounded suitability conclusion, not a claim that Meta's managed route is inherently insecure or impossible to use. No revocation experiment was conducted. No blanket claim about unaffected legacy/inbound integrations is justified.

## Bounded next step and preserved holds

**Option C is now the preferred next architecture step: design an EH-lifecycle-only credential/revocation domain using a dedicated Employee System User and reviewed issuing-app arrangement.** This remains a proposal until separately owner-approved. Its issuing app, effective permissions, independent recovery authority, custody, invalidation scope and effect on existing consumers require architecture review; neither custom-app reuse nor new-app creation is approved here.

- H3-05 remains **BLOCKED** before credential issuance.
- No credential has been generated; no existing token or app-secret value has been exposed.
- No Meta or Production setting changed; no System User created, asset assigned, DQA enabled, Vercel configuration changed or lifecycle destination configured.
- No credential revoked/invalidated and no provider event sent.
- H3-06–08/H4 remain unauthorized. Option C is not implemented or approved by this evidence record.

Risk: **Tier 3**, because this evidence informs credential recovery and provider invalidation decisions. This correction is documentation only. Fresh independent review of the corrected PR head and separate human merge/release approval remain required; neither clears the H3-05 hold.
