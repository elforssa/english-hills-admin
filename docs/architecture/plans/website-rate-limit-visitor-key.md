# Architecture plan — website inquiry rate limiter keyed on the visitor, not the proxy

Status: **APPROVED WITH CHANGES** (owner, 2026-10-13); Tier 3. Admin implementation on branch `feat/crm-website-visitor-rate-key`; not merged, not deployed, not Production verified. Architecture written 2026-10-13 from the admin worktree at `6ec7986` (main) and `elforssa/eh-website` main at `2864b02`. The [approval record](#approval-record) and its binding review changes override any conflicting text in §1–§9, which is kept as the reviewed architecture text with only the header name updated.

## Approval record

- **Owner approval:** "approve rate-limit plan with changes", 2026-10-13. Option E approved as scoped.
- **Independent architecture review verdict:** READY WITH CHANGES. The changes below are binding and were applied in the admin implementation.
- **Owner decisions** (also in [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md#website-inquiry-rate-limiter-keyed-on-the-visitor--approved)): Option E chosen; Option D (site ceiling, migration) parked; Sentry warning on 429 yes; WhatsApp CTA on the website's rate-limit message yes, via the existing `/contact-camp` redirect; pre-fix probe yes; one shared secret now; rotation (`_PREVIOUS` fallback) later.

### Binding review changes (applied)

1. Header name `x-eh-visitor-token`, so the existing Sentry `PII_KEY` "token" fragment redacts it. Value `v1.<ts>.<ipb64>.<sig>`; signed string `v1.<ts>.<ipb64>.<request_key>`; HMAC-SHA256 with `CRM_WEBSITE_PROXY_SECRET` (≥32 chars); `ts` window ±300 s; unpadded base64url for `ipb64` and `sig` (a 32-byte signature is exactly 43 characters).
2. `visitorIp()` is total: it never throws; every defect returns a reason (`missing` / `unconfigured` / `invalid` / `stale`) and the existing egress-IP expression is used. The raw header is capped at 256 characters before parsing (header values are byte strings, so also 256 bytes); part shapes are validated (decimal `ts`, base64url `ipb64`, 43-character base64url `sig`); lengths are checked before `timingSafeEqual`; the signature must be canonical (re-encoding the decoded bytes reproduces it exactly, so spare-bit variants are rejected); the decoded IP must match `^[0-9A-Fa-f:.]{1,45}$`; the `.slice(0,128)` stays. A malformed header never causes 503 and never skips the limiter.
3. `Access-Control-Allow-Headers` in the OPTIONS handler is **not** extended (the header is server-to-server only).
4. Logging: `console.warn('[crm-inquiry] visitor_rejected', { site, form, visitor })` on every result where a header is present but not accepted (`unconfigured`, `invalid`, `stale`; amended by the code review of `1d676bd` to include `unconfigured`) and `console.warn('[crm-inquiry] rate_limited', { site, form, visitor })` on every 429. Never the header, the IP or contact data. On 429 also a Sentry `captureMessage` at level `warning` with tags `site`/`form`/`visitor`, through the existing scrubber; the scrub regression asserts `x-eh-visitor-token` is redacted.
5. Tests in `scripts/test-crm-phase9.mjs` (fake secrets only) cover the full fallback matrix in §5.1 as amended below.
6. Documentation: website contract, `.env.example` (both secrets), this plan, OWNER_DECISIONS, SECURITY_RULES, ARCHITECTURE and CURRENT_STATE (website intake live; shared-egress defect).
7. The Production probe procedure is replaced by [§5.3 as amended](#53-amended-production-probe-procedure-binding).
8. Release secret handling, for **both** Vercel projects: set `CRM_WEBSITE_PROXY_SECRET` for Production only, uncheck Preview and Development, then redeploy. This supersedes §3.3/§3.4 wording.

Independent code review of PR #136 at `1d676bd` (READY WITH CHANGES) added: deterministic window tests (exact ±300/±301 boundaries pinned through the helper's clock argument), a 31- vs 32-character secret test, the `unconfigured` warning, the canonical-signature check, the release wording in item 8 and the residual-risk list below.

### Accepted residual risks

- **Loss of the accidental global ceiling.** Today's shared egress bucket incidentally capped the whole site at roughly 10/hour per egress IP. Per-visitor keys remove that, so Turnstile is the only control against distributed senders. The operator must confirm by name that `TURNSTILE_SECRET_KEY` exists in the admin Production environment before the probe and before activation. A site-wide ceiling is Option D (parked).
- **IPv6 /64 rotation.** One IPv6 client can rotate addresses within its /64 and get a fresh bucket per address. Follow-up on the admin side together with Option D; not implemented here.
- **Carrier-grade NAT sharing.** Mobile visitors behind one NAT address share a bucket (as in the original design).
- **Sentry volume on 429s.** Each 429 sends one Sentry warning with no throttle. The owner is to confirm Sentry spike protection; no throttle is implemented here.
- **Proxy-secret leak and rotation.** Anyone holding the secret can sign arbitrary IPs to spread load over buckets (still subject to Origin, honeypot and Turnstile). Single secret, no `_PREVIOUS` fallback: rotating means a short window where headers come back `invalid`, warn and fall back to the egress key, never failing intake.

### ADR

Not added. AGENTS.md requires an ADR when a significant architectural decision changes. This change keeps the existing public-intake controls, order, storage and limit; it only corrects the input to the existing limiter key and adds an authenticated, fail-safe hint from the first-party proxy. The trust-boundary rule is recorded in [SECURITY_RULES](../../ai/SECURITY_RULES.md) and the [website contract](../../crm-website-inquiries.md#visitor-key-header), and the decision in this plan. If Option D or another sender is ever added, that decision should get an ADR.

## 0. Summary of the problem as verified

| Fact | Evidence |
| --- | --- |
| CRM limiter key = `HMAC(CRM_WEBSITE_RATE_LIMIT_SECRET, x-real-ip ∥ first x-forwarded-for ∥ 'unknown')`, 10 hits per rolling hour, scope `crm_inquiry:hour`. | admin `src/lib/crm/website/endpoint.mjs:55-59`; `supabase/migrations/087_crm_website_ingestion.sql:233-242` (limit `hits>=10` hard-coded in the function body). |
| The website never calls the CRM from the browser. Its Node route proxies server-to-server and forwards only `Content-Type` and `Origin`. | eh-website `src/app/api/crm-inquiry/route.ts:34-40`; `src/lib/crm/transport.ts:18-22` (browser posts to the same-origin `/api/crm-inquiry`). |
| Both `www.english-hills.com` and `admin.english-hills.com` are served directly by Vercel (`server: Vercel`, `x-vercel-id` present, no Cloudflare/other CDN in front). | `curl -sI` on both hosts, 2026-10-13. |
| Vercel overwrites `x-forwarded-for` on every inbound request and does not forward external values. `x-real-ip` and `x-vercel-forwarded-for` are documented as identical to it. Custom XFF needs the Enterprise "Trusted Proxy" add-on. | https://vercel.com/docs/headers/request-headers (fetched 2026-10-13, see §1). |
| Vercel Functions use dynamic outbound IPs unless Static IPs / Secure Compute are purchased. | https://vercel.com/docs/networking/static-ips (fetched 2026-10-13). |
| Production `anon_rate_limits` has had exactly one `crm_inquiry:hour` row ever (the 26 Sep test), so no real campaign traffic has exercised the bucket yet. | Problem statement (owner). |

Conclusion: in Production the CRM's `x-real-ip` is the website function's **egress IP** (a dynamic AWS/Vercel address), never the visitor's. Every visitor whose request happens to leave through the same egress IP shares one 10-per-hour bucket. Because egress IPs are dynamic, the effective ceiling is "10 per hour per egress IP in use", which is unpredictable but small. A campaign that drives more than ~10 submissions per hour will start returning 429 to legitimate visitors. The visitor does **not** get a success screen on 429 (see §4), so the lead is not silently miscounted as received, but it is silently lost to the business and nothing logs or alerts it.

## 1. Vercel header semantics (design question 1)

Fetched `https://vercel.com/docs/headers/request-headers` on 2026-10-13 (Accept: text/markdown). Relevant text, quoted:

- `x-forwarded-for`: "The public IP address of the client that made the request. If you are trying to use Vercel behind a proxy, we currently overwrite the X-Forwarded-For header and **do not forward external IPs**. This restriction is in place to prevent IP spoofing."
- "Custom X-Forwarded-For IP — Availability: Trusted Proxy is available on Enterprise plans."
- `x-vercel-forwarded-for`: "This header is identical to the x-forwarded-for header. However, x-forwarded-for could be overwritten if you're using a proxy on top of Vercel."
- `x-real-ip`: "This header is identical to the x-forwarded-for header."

Applied to a request made from the website's Vercel Function to the admin's Vercel project:

1. The website route (eh-website `route.ts:34`) sends no IP headers at all. Even if it set `x-forwarded-for`, Vercel's edge in front of `admin.english-hills.com` would overwrite it with the TCP peer address, i.e. the website function's egress IP. Same for `x-real-ip` and `x-vercel-forwarded-for`.
2. Therefore on the CRM side all three headers carry the **egress IP of the website function**, which is dynamic (Static IPs are a paid add-on and not configured).
3. The visitor's real IP is available only on the **website** side, in its own inbound `x-forwarded-for` / `x-real-ip` (Vercel-set, trustworthy there because nothing sits in front of Vercel). eh-website already reads it this way in `src/lib/crm/legacy-meta.ts:40` for Meta CAPI.
4. Spoofing: a client cannot inject a fake visitor IP via the standard headers (Vercel overwrites them). But any client can POST directly to `admin.english-hills.com/api/public/crm-inquiry` with any **custom** header; Vercel forwards custom headers untouched. So any custom visitor-IP header must be authenticated, not merely present.
5. Vercel Trusted Proxy (Enterprise) would let the website set XFF legitimately, but it is a paid plan feature and still wouldn't distinguish the website from any other sender. Not pursued.

## 2. Options compared and recommendation (design question 2)

| Option | Fixes the shared bucket? | Migration? | Abuse resistance | Cost / risk |
| --- | --- | --- | --- | --- |
| **E. Signed visitor-IP header from the proxy (recommended)** | Yes, limiter keys per visitor again. | No. | Same as today per visitor; direct callers without the secret fall into today's egress/unknown bucket. | ~40 lines across both repos, one shared secret, safe fallback. |
| A. Raise the shared limit (e.g. 10 → 300/hour) | Partly; still one bucket per egress IP; ceiling is still arbitrary and unpredictable. | Yes (limit is inside `crm_check_website_rate_limit`). | Weakens per-attacker limit 30× for anyone posting directly. | Migration + Tier 3 release for a half-fix. |
| B. Per-`request_key` limit | No. `request_key` is a client-chosen UUID; infinitely many keys. It is a dedupe key, not an identity. | — | None. | Rejected. |
| C. Turnstile only (drop the IP limiter) | Yes, by removal. | Yes (or dead code). | Loses the only control that works when Turnstile is unset (`TURNSTILE_SECRET_KEY` optional, `endpoint.mjs:67`) and against token farms. Contradicts SECURITY_RULES.md:42 ("public intake validation/rate limiting/origin policy"). | Policy change; rejected. |
| D. Per-site ceiling + per-visitor buckets | Yes, and adds a global circuit breaker. | Yes (new scope and limits in SQL). | Best long term. | Larger; needs a migration and owner decisions on numbers. Parked as follow-up; E is a strict subset of D and does not block it. |

**Recommendation: E.** It is the smallest change that restores the limiter's intended meaning, needs no SQL, degrades to exactly today's behaviour when anything is missing, and keeps the IP pseudonymous on disk. D can be added later if campaign volume justifies a site-wide breaker.

### 2.1 Signed header contract (shared between repos)

> Superseded in part by the [approval record](#approval-record): the header is capped at 256 characters, the decoded IP must match `^[0-9A-Fa-f:.]{1,45}$` (not "1..128 chars"), the signature must be canonical, and `unconfigured` headers also warn.

- Header name: `x-eh-visitor-token`. Sent only by the website proxy, only on the server-to-server call.
- Value: `v1.<ts>.<ipb64>.<sig>` where
  - `ts` = Unix seconds at signing (decimal),
  - `ipb64` = base64url(visitor IP string as read from the website's inbound `x-forwarded-for` first entry, else `x-real-ip`), base64url avoids IPv6 `:` and `.` ambiguity,
  - `sig` = base64url(HMAC-SHA256(`CRM_WEBSITE_PROXY_SECRET`, `v1.<ts>.<ipb64>.<request_key>`)).
- Binding to `request_key` (already in the JSON body, UUID, deduped by `crm_website_inquiry_status`) means a captured header cannot be reused for a different submission; replaying it for the same submission is idempotent by design.
- CRM acceptance rules, all must hold or the header is ignored:
  1. `CRM_WEBSITE_PROXY_SECRET` configured on the CRM (≥32 chars);
  2. exact 4-part shape, version `v1`, `ts` integer, `|now − ts| ≤ 300 s`;
  3. decoded IP 1..128 chars, no control characters;
  4. `sig` compared with `timingSafeEqual` against HMAC over the same string using the body's `request_key` (so the check runs after schema parse, which is already before the limiter at `endpoint.mjs:49-59`).
- On acceptance, `ip` := decoded visitor IP and the existing line `rateKey = HMAC(CRM_WEBSITE_RATE_LIMIT_SECRET, ip)` is unchanged. On rejection or absence, `ip` := today's expression (egress IP or `'unknown'`). Nothing else in the flow changes; honeypot, Turnstile, dedupe and acceptance stay in their current order.
- Why not reject invalid signatures with 4xx: a wrong or rotated secret would then take the whole inquiry channel down instead of degrading to the current behaviour. Fail-safe is the shared bucket plus a warning log (§4).

## 3. Exact change list, secrets, rollout, rollback (design question 3)

### 3.1 Admin repo (`hills-admin-next`)

> Superseded in part by the [approval record](#approval-record): warnings fire for every present-but-rejected header (`unconfigured`/`invalid`/`stale`) and every 429; the Sentry warning on 429 is required, not optional; `.env.example` gains both secrets.

| File | Change |
| --- | --- |
| `src/lib/crm/website/endpoint.mjs:55-58` | Add `visitorIp(request, requestKey, env)` helper (pure, exported for tests) implementing §2.1; replace the `ip` expression with `visitorIp(...) ?? <today's expression>`. Return a reason (`ok` / `missing` / `invalid` / `stale` / `unconfigured`) for the log line. |
| `src/lib/crm/website/endpoint.mjs:59` | On 429, and when the reason is not `ok`, emit one structured `console.warn('[crm-inquiry] rate_limited', { site, form, visitor: reason })` — no IP, no header value, no contact data. Optionally `Sentry.captureMessage` at `warning` with the same tags (Sentry has `sendDefaultPii:false` and `scrubEvent`, `sentry.server.config.js:11-13`). |
| `src/app/api/public/crm-inquiry/route.js` | No change (already passes `process.env`). |
| `scripts/test-crm-phase9.mjs` | New assertions (see §5). |
| `docs/crm-website-inquiries.md:39-41` | Document the header contract, the new secret, and replace "Deploy only behind the trusted Vercel/edge proxy that overwrites client address headers" with the accurate statement that the proxy's own IP is what the edge provides and the signed header carries the visitor. |
| `docs/ai/SECURITY_RULES.md:42`, `docs/ai/ARCHITECTURE.md:98`, `docs/ai/CURRENT_STATE.md:24` | One-line updates at closeout (Tier 3 documentation step). |
| `.env.example` (admin) | Add `CRM_WEBSITE_PROXY_SECRET=` with a comment. |

No change to `supabase/migrations`, `crm_check_website_rate_limit`, `anon_rate_limits`, `src/middleware.js` or `vercel.json`.

### 3.2 Website repo (`elforssa/eh-website`)

| File | Change |
| --- | --- |
| `src/lib/crm/visitor-signature.ts` (new, `server-only`) | `signVisitor(ip, requestKey, secret, now = Date.now())` producing the §2.1 value; `visitorIpFrom(req)` reading `x-forwarded-for` first entry else `x-real-ip` (same expression as `legacy-meta.ts:40`, extract to share). |
| `src/app/api/crm-inquiry/route.ts:36` | `headers: { "Content-Type": "application/json", Origin: canonicalOrigin, ...(proxySecret ? { "x-eh-visitor-token": signVisitor(...) } : {}) }` where `proxySecret = process.env.CRM_WEBSITE_PROXY_SECRET` if length ≥ 32. Missing secret → header omitted → today's behaviour; do not fail the request. |
| `src/app/api/crm-inquiry/route.ts:57` | Keep the 429 mapping; add a structured `console.warn("[crm-inquiry] upstream 429", { form_key })` (no contact data) so Vercel runtime logs show the event. |
| `src/lib/crm/client.ts:48` (optional UX) | On `rate_limit`, message becomes "Trop de tentatives. Réessayez dans une heure ou contactez-nous sur WhatsApp." with the existing `WHATSAPP_CTA_URL` link, so a blocked visitor has a path to the school. Owner decision; not required for the fix. |
| `scripts/test-crm-inquiry.mjs` | Mock server asserts the header (see §5). |
| `.env.example`, `docs/crm-inquiry-integration.md:11-17` | Add `CRM_WEBSITE_PROXY_SECRET`. |

### 3.3 Secrets and env vars (names only; the owner holds values)

| Name | Where | Notes |
| --- | --- | --- |
| `CRM_WEBSITE_PROXY_SECRET` | Admin Vercel project (Production) and eh-website Vercel project (Production). Same value. | New. ≥32 random chars. Server-only (no `NEXT_PUBLIC_`). Distinct from `CRM_WEBSITE_RATE_LIMIT_SECRET` (stays admin-only) and `CRM_WEBSITE_RECEIPT_SECRET` (stays website-only). Do not reuse either. |
| `CRM_WEBSITE_RATE_LIMIT_SECRET` | Admin, existing | Unchanged. |

Preview environments: leave the secret unset on Preview in both projects so Preview deployments keep today's behaviour and cannot sign for Production.

### 3.4 Rollout order

1. Owner approves this plan (Tier 3 gate 1).
2. Admin PR (implementation + tests + docs) → independent review of the exact head SHA → owner release approval → merge/deploy. Safe alone: with no secret configured the code path is inert.
3. Owner, on the admin Vercel project: set `CRM_WEBSITE_PROXY_SECRET` for Production only, uncheck Preview and Development, then redeploy (an env change needs a new deployment on Vercel). Still inert: no header arrives.
4. Website PR → review → merge/deploy. Still inert until its secret exists.
5. Owner, on the eh-website Vercel project, with the same value: set `CRM_WEBSITE_PROXY_SECRET` for Production only, uncheck Preview and Development, then redeploy. Header now flows.
6. Production proof per §5.3 (two probes, zero leads). Record in CURRENT_STATE.
7. Documentation closeout.

Each step is independently safe; the feature activates only at step 5.

### 3.5 Rollback

- Fastest: remove `CRM_WEBSITE_PROXY_SECRET` from the eh-website project and redeploy → header stops → CRM falls back to today's keying. No admin change needed.
- Or remove it from the admin project → header ignored (`unconfigured`).
- Code rollback: revert either PR independently; neither depends on the other being present.
- No data to roll back: `anon_rate_limits` rows are pseudonymous and self-prune after one hour on the next limiter call (`087:238`).

## 4. Visitor experience on 429 and lead protection (design question 4)

Today, traced end to end:

1. CRM returns `429` with `Retry-After: 3600` and `{error:'Trop de demandes. Réessayez dans une heure.'}` **before** any durable write (`endpoint.mjs:59` precedes `crm_accept_website_inquiry` at `:78`).
2. Website proxy maps it to `429 {error:'Trop de tentatives.'}` (`route.ts:57`); no receipt cookie, no Meta CAPI Lead event (both are inside the `response.ok` branch at `:41-55`).
3. Browser hook throws `InquiryError('rate_limit', 'Trop de tentatives. Veuillez réessayer plus tard.')` (`client.ts:46-51`). `prepared.current` is cleared only on success (`:53`), so a retry reuses the same `request_key` and business payload with a fresh Turnstile token.
4. So the visitor sees an error, not a success screen. The lead is not falsely counted as received, but it is lost unless the visitor comes back after an hour. Nothing is logged on either side and nothing alerts.

Protection after this plan:

- Root cause removed: legitimate visitors each get their own 10-per-hour bucket; a campaign's volume no longer trips it.
- Observability: structured warn lines on both sides (no PII) whenever a 429 occurs, with the `visitor` reason on the CRM side so an `unconfigured`/`invalid`/`missing` streak is visible in Vercel runtime logs immediately after step 5. Optional Sentry warning message with tags `site`, `form`, `visitor` for alerting through the existing Sentry project; no new alerting stack.
- Visitor guidance (optional, owner decision): the `rate_limit` message offers the WhatsApp CTA so a blocked visitor still reaches the school.
- Not proposed: queueing rejected submissions or failing open. Both would change the limiter's security meaning and need their own architecture.

## 5. Test plan (design question 5)

### 5.1 Admin unit tests (`scripts/test-crm-phase9.mjs`, fake secrets only)

Amended by review: fallbacks additionally cover `ts` 301 s in the future, empty parts, non-base64url characters, wrong-length and padded signatures, oversize header (>256), non-numeric/negative `ts`, IP over 45 characters or with invalid characters, a throwing header accessor and a missing `request_key`; every malformed case asserts status ≠ 503 and that the limiter ran exactly once. OPTIONS still allows only `Content-Type`. Sentry scrub regression in `scripts/test-audit-pure.mjs` asserts the header is redacted.


- Valid header: `rpc('crm_check_website_rate_limit')` receives `HMAC(rate secret, '203.0.113.9')`, not the `x-real-ip` key; assert the two differ.
- Fallback cases each yield the `x-real-ip` key: header absent; `CRM_WEBSITE_PROXY_SECRET` unset; bad signature; `ts` 301 s old or 301 s in the future; signature made with a different `request_key`; malformed shape; IP > 128 chars.
- IPv6 and IPv4-mapped IPv6 round-trip through base64url.
- Header value and decoded IP never appear in `rpc` args other than as the 64-hex key (extend the existing `!args.p_key.includes('192.0.2')` guard).
- 429 path emits the warn line without the IP (capture `console.warn`).

### 5.2 Website unit test (`scripts/test-crm-inquiry.mjs`)

- With `CRM_WEBSITE_PROXY_SECRET` set in the spawned `next start` env, the mock CRM asserts `x-eh-visitor-token` is present, has 4 parts, `ts` within 5 s, decoded IP equals the mock's view of the client (`127.0.0.1` or `::1`), and the signature verifies with the test secret and the body's `request_key`.
- With the secret unset, the header is absent and everything else is unchanged.
- Honeypot submissions still never reach the mock (`route.ts:29`).

### 5.3 amended Production probe procedure (binding)

Documented only; not run by the implementation task. Requires separate owner/operator authorization.

1. **Precondition:** the operator confirms by name (not value) that `TURNSTILE_SECRET_KEY` exists in the admin Vercel **Production** environment.
2. **Probe body:** a normal website inquiry body with a fresh `request_key` and `attribution.landing_page` set to `"https://english-hills.com/"` (apex, not the configured `www` origin). The CRM consumes one limiter slot, then rejects with **400** at the landing-page origin check (`endpoint.mjs`, after the limiter and before dedupe, Turnstile and acceptance). An invalid Turnstile token (`turnstileToken: "probe"`) is the second guard. No lead, no receipt cookie, no CAPI event.
3. **Evidence is the row, not the HTTP status:** the website maps several CRM errors to 422, so the status alone cannot distinguish the cause. Read `select ip_key, created_at from public.anon_rate_limits where scope='crm_inquiry:hour' order by created_at desc limit 12;` through the Production read-only operator path. Distinct networks must produce distinct `ip_key` values after activation; before activation (the approved pre-fix probe) they share one `ip_key`.
4. **Exhaustion:** a request blocked by the limiter inserts no row, so 11 probes from one network leave 10 rows and the 11th returns 429 (website maps to 429). This blocks that network for one hour only.
5. Check admin runtime logs for `[crm-inquiry] rate_limited` with `visitor: 'ok'` and no `visitor_rejected` lines.

### 5.3 (original text, superseded by the amended procedure above) Proving bucket behaviour in Production without creating a lead

Key property used: the limiter runs **before** honeypot, Turnstile and acceptance (`endpoint.mjs:59` vs `:60`, `:67`, `:78`). A request that passes the limiter but then fails Turnstile consumes one bucket slot and creates nothing.

Probe procedure (owner or operator, from two different networks, e.g. office Wi-Fi and a phone on mobile data):

1. From network A, submit the real Contact form on `www.english-hills.com` but with a deliberately invalid Turnstile token (operator-side: a one-line `fetch('/api/crm-inquiry', …)` in the browser console with `turnstileToken: 'probe'` and a fresh UUID). Expected: website returns 422 ("Vérifiez vos informations"), CRM returned 403 after the limiter. No lead, no receipt cookie, no CAPI event.
2. Repeat once from network B.
3. Using the Production read-only operator path (memory: read-only, no writes), run
   `select ip_key, created_at from public.anon_rate_limits where scope='crm_inquiry:hour' order by created_at desc limit 5;`
   - Before the fix (optional, proves the defect): both rows share one `ip_key` → shared bucket confirmed. Cost: two slots of the shared bucket for one hour; do it off-peak.
   - After step 5 of the rollout: the two rows have **different** `ip_key` values → per-visitor keying confirmed. No secret is needed; only equality is compared.
4. Optional exhaustion proof after the fix, from network A only: send 11 probes; the 11th returns 429 from the website; network B still gets 422. This blocks only network A's address for an hour.
5. Check admin Vercel runtime logs for the `[crm-inquiry] rate_limited` line with `visitor: 'ok'` (step 4) and no `invalid`/`unconfigured` lines.

The probe rows self-delete on the next limiter call after an hour; no cleanup write is required.

### 5.4 Local integration (optional, isolated stack per memory recipe)

Run the admin against a private local Supabase with the website pointing at it (`CRM_INQUIRY_ENDPOINT=http://127.0.0.1:…`), `TURNSTILE_SECRET_KEY` unset, and send 11 signed submissions with distinct IPs (all 200) then 11 with one IP (11th 429). Local-only leads; not required for approval if §5.1–5.3 pass.

## 6. SQL migration (design question 6)

**None.** `crm_check_website_rate_limit(text)` keeps its signature, scope, 10-per-hour limit and pruning; only the input key becomes the visitor's pseudonym instead of the egress IP's. `anon_rate_limits` is unchanged. Option D (site ceiling) would need a migration and is explicitly out of scope.

## 7. Privacy confirmation (design question 7)

- The website function already holds the visitor IP (Vercel-set headers) and already transmits it to Meta CAPI when that compatibility switch is on (`legacy-meta.ts:40`). This plan adds one more hop: website → CRM over TLS in a signed header.
- On the CRM the IP exists only in request memory; the only persisted derivative is `HMAC-SHA256(CRM_WEBSITE_RATE_LIMIT_SECRET, ip)` in `anon_rate_limits.ip_key`, exactly as today (`endpoint.mjs:55-58`, `087:237`). Rows are pruned after one hour.
- Nothing logs the header or the IP: the warn lines carry only site, form and a reason enum. Sentry runs with `sendDefaultPii:false` and the CNDP scrubber on both projects' admin side (`sentry.server.config.js:11-13`); implementation must add `x-eh-visitor-token` to the header deny-list in `src/lib/sentry-scrub.js` if request headers are ever attached to an event, and must not add the header to any breadcrumb.
- No cookies, no new browser-side identifiers, no change to the consent flow. Confirmed: IP is used only for a pseudonymous limiter key and is never stored raw.

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| Secret mismatch between projects silently reverts to the shared bucket. | `visitor:'invalid'` warn line on every CRM request; the §5.3 proof is part of rollout; both secrets are set from one value in one sitting. |
| Clock skew between Vercel regions > 5 min. | Vercel hosts are NTP-synced; 300 s window is generous; `stale` reason is logged distinctly. |
| Visitor behind a carrier-grade NAT shares an IP with others (common on Moroccan mobile networks). | Same limitation as the original design, 10/hour per address; far better than one bucket for the whole site. If it bites, raise the per-visitor limit via Option D. |
| Someone obtains the proxy secret and signs arbitrary IPs to dodge the limiter. | They would still have to pass Origin, site key, honeypot and Turnstile; rotate the secret (rollback §3.5 then re-set). Secret is server-only on both projects. |
| Website Preview deployments can't sign (secret unset on Preview). | Intended; Preview already cannot pass Turnstile's canonical-hostname rule (`InquiryTurnstile.tsx:54`). |
| Probe procedure mis-executed with a valid token creates a real lead. | Procedure uses an invalid token by construction; the operator checks the 422, not a success screen, before proceeding. |

## 9. Open questions for the owner

1. Approve Option E as scoped, or ask for Option D (site ceiling, migration) in the same release?
2. Adopt the optional 429 message with the WhatsApp CTA on the website (`client.ts:48`)?
3. Sentry warning on 429 (yes/no). Default proposal: yes, warning level, tags only.
4. Run the pre-fix two-probe proof (§5.3 step 3 "before") to document the defect, or go straight to the post-fix proof? Pre-fix costs two shared-bucket slots for one hour.
5. Secret rotation policy: single secret now; a `_PREVIOUS` fallback can be added later if rotation without a blip is ever needed.
