# Dependency-security parser compatibility — 2026-10-06

## Scope and authorization

Tier 2: a compatible dependency-security correction on PR #105, branch `codex/source-map-js-security-fix`, based on main `b8fe8eb31659358e9c2817e0f5740716bc29f6d5`. The owner's 2026-10-06 correction request explicitly authorizes investigating and proving an exact parser override after compatible parent upgrades are ruled out. No separate architecture decision, migration, domain/application change, permission change or Production operation is included. Independent review found the preceding `source-map-js` correction sound; its `1.2.2` lock resolution is retained.

## Registry and consumer evidence

The registry's latest Tailwind 3.x release is `3.4.19`, still requesting `postcss-selector-parser ^6.1.2`. The latest postcss-nested 6.x release is `6.2.0`, requesting `^6.1.1`; 7.0.2 adopts `^7.0.0` but does not resolve Tailwind's direct 6.x path. The latest nested 8.0.1 also adopts a 7.x parser and changes its Node support range. The parser's 6.x registry line ends at vulnerable `6.1.4`; the [fixed release](https://github.com/postcss/postcss-selector-parser/releases/tag/7.1.6) is `7.1.6`. Neither parent needs to change for the demonstrated override, and Tailwind v4 is excluded.

Before: `tailwindcss@3.4.19 -> postcss-selector-parser@6.1.4`, and `tailwindcss@3.4.19 -> postcss-nested@6.2.0 -> postcss-selector-parser@6.1.4`.

After: the same parent versions resolve one deduplicated `postcss-selector-parser@7.1.6` through the exact npm override. `next@15.5.25 -> postcss@8.5.28 -> source-map-js@1.2.2` remains unchanged. Automated lock comparison proves only the two patched nodes' version, registry URL and integrity fields differ from main; no package additions/removals, dependency-edge changes or unrelated upgrades.

Actual installed Tailwind consumer modules inspected: `generateRules`, `setupContextUtils`, `expandApplyAtRules`, `resolveDefaultsAtRules`, `formatVariantSelector`, `prefixSelector`, `escapeClassName` and `applyImportantSelector`. They use the CommonJS factory, `processSync`/`astSync`, class/attribute/pseudo/root/selector/combinator/comment/universal factories, traversal/mutation/clone/serialization and `dist/util/unesc`. postcss-nested's `index.js` uses callback `processSync`, `at(0)`, `each`, recursive nesting replacement, clone, combinator/prepend and serialization. These interfaces remain available in 7.1.6.

The [v7 major change](https://github.com/postcss/postcss-selector-parser/releases/tag/v7.0.0) corrects insertion iteration indexes; Tailwind's selector mutation and nested ampersand replacement are exercised by the differential fixtures. The installed 7.1.6 implementation also preserves serialization of raw array children used by Tailwind `:merge()` expansion and provides bounded-depth safety. Compatibility is established by actual consumer execution and generated output, not by npm accepting the override.

## Validation

The final source changes add an exact override, two patch lock resolutions, a focused compiler regression wired into `npm test`, and explanatory evidence/[audit-policy documentation](../../security/dependency-audit-policy.md#compatible-selector-parser-remediation). The audit policy implementation and exception are unchanged.

- `npm ci`: PASS, 752 packages. Local Node 25.2.1 / npm 11.6.2; repository CI retains Node 22.
- `npm audit --omit=dev --audit-level=moderate`: PASS, zero vulnerabilities.
- `npm run audit:policy`: PASS, only the existing seven propagated braces findings accepted under GHSA-vfj7-8cjw-p6xm; zero low findings. Both newly patched advisories are absent.
- `npm run test:audit-policy`: PASS, including rejection of new advisories, consumer/path/classification drift, compatible fixes and malformed registry metadata.
- `npm ls postcss-selector-parser source-map-js`: PASS, exact deduplicated patched versions and unchanged parent versions.
- `npm run lint`: PASS; existing Sidebar image and Next lint deprecation warnings remain nonblocking.
- Production `npm run build`: PASS, all 59 pages, local-only Supabase credentials, external email and Sentry disabled.
- `npm run test:css-toolchain`: PASS. Actual repository CSS, 23 utility/variant probes, prefix/important modes, `@apply`, and seven postcss-nested fixtures covering comma parents, ampersands, functional pseudos, escaped names, descendants, media/supports bubbling and `@at-root`.
- Differential compiler run: PASS, all generated application, representative-fixture and UI Foundation CSS byte-identical against parser 6.1.4. The pre-change snapshot is temporary validation data, not an application dependency or committed vulnerable fixture.
- UI Foundation semantic tests: PASS in isolated scratch source checkout `2006f572346398986b1105db7cc27aff3e8b8fd8`, using the remediation checkout's patched node_modules. These tests are absent from PR #105's older main baseline, so this is supplementary compatibility evidence, not a claim they exist in this PR. That checkout's patched production build also passes. No UI Foundation source is merged into this correction.
- CI classifier/gate/policy regressions: PASS, 14 tests. Script portability: PASS, 57 entrypoints.

The existing Work/Calendar browser suite passed its task, filter, stale-guard, calendar, responsive/reduced-motion and display checks in both Chromium and WebKit, then failed its final exact RPC-shape assertion: the shared local database has the separately developed migration-110 `assignee_display_label` field, absent from this PR’s 109 source baseline. Read-only function metadata confirms the extra field. No database reset, test weakening or domain fix was made; clean-baseline database validation remains in remote Verify.

The full UI Foundation browser harness passed in Chromium and WebKit: CRM/Students/Dashboard/Placement read states, bounded answers/destinations, filter reset, responsive widths, zoom/contrast, focus, touch targets and return context. Exact final SHA/full Verify scheduling are recorded in the PR handoff. Browser harnesses use only local synthetic fixtures, block external browser requests and clean up their own fixtures. Existing port 3101 is preserved; scratch harness copies change only their app URL to private ports 3115/3116.

## Handoff boundary

One focused author self-check completed: compatible parent alternatives, actual parser API/mutation usage, unchanged audit safeguards, narrow lock graph, regression coverage, secret/PII exclusion and final diff were inspected before handoff. Full Verify CI and fresh exact-SHA independent re-review remain required. This evidence does not authorize merge, release or Production mutation. Reassess the exact override when compatible parents adopt a patched parser; do not turn it into an advisory exception.
