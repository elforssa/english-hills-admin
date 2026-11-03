# Dependency audit policy

Verify retains two blocking security gates:

- `npm audit --omit=dev --audit-level=moderate`: production dependencies have no exceptions at moderate, high or critical severity.
- `npm run audit:policy`: full dependency audit including dev, optional and peer dependencies. All moderate/high/critical findings block except the exact temporary exception below. Low/info findings are counted but do not block, matching the existing threshold.

## Temporary build/lint exception

[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) affects `braces <=3.0.3`, severity high. On 2026-10-03 the npm registry publishes no patched braces release. This is a temporary exact advisory exception for that upstream issue, not a general vulnerability waiver.

The policy recursively checks npm audit provenance: propagated package findings must lead exclusively to this advisory. It verifies package, high severity, affected range and exact installed node paths. It independently resolves all lockfile dependency, optional and peer edges to braces, including hoisted consumers, and compares the entire incoming graph with the approved tooling graph. Every approved node must be dev-only at its recorded version; manifest and lockfile roots must agree. New runtime or dev consumers, path/version/classification drift, other moderate/high/critical advisories, missing/cyclic provenance and invalid/unavailable metadata fail closed. Application-source literal references to these tooling packages also fail; indirect/computed imports still require human source review.

Compatible npm fix metadata blocks the exception. Every published braces version is validated with the explicitly declared npm semver package; malformed metadata fails closed. Any newer stable release requires reassessment even before advisory metadata catches up. Prereleases alone do not retire the exception. Build metadata does not make a release a prerelease and is ignored for precedence, following normal SemVer semantics. npm's current major Tailwind migration / ESLint-config downgrade suggestions do not count as compatible fixes. Do not adopt those suggestions automatically. A major release or changed path needs a scoped compatibility assessment; remove this exception when a safe remedy becomes available. Errors never print raw audit JSON, registry stderr or credentials.

Approved roots and paths (all dev-only after reclassification):

- `tailwindcss@3.4.19 -> chokidar@3.6.0 -> braces@3.0.3`
- `tailwindcss@3.4.19 -> micromatch@4.0.8 -> braces@3.0.3`
- `tailwindcss@3.4.19 -> fast-glob@3.3.3 -> micromatch@4.0.8 -> braces@3.0.3`
- `eslint-config-next@15.5.24 -> @next/eslint-plugin-next@15.5.24 -> fast-glob@3.3.1 -> micromatch@4.0.8 -> braces@3.0.3`
- `tailwindcss-animate@1.0.7` has a Tailwind peer edge covering the first three paths.

Before this change, tailwindcss-animate was incorrectly a production dependency; its peer edge classified Tailwind and its transitive tooling as production. Its sole code reference is `tailwind.config.js`, where it generates animation CSS during compilation. No browser/server source imports it. The emitted CSS still ships; the plugin itself is build tooling. Tailwind, Next and eslint-config-next versions are unchanged.

DOMPurify is a production optional dependency of `jspdf@4.2.1` with range `^3.3.1`. The lockfile updates `3.4.15 -> 3.4.16`, resolving [GHSA-p98j-92pf-mc4p](https://github.com/advisories/GHSA-p98j-92pf-mc4p) without a direct jsPDF upgrade or override.

Run `npm run test:audit-policy` for synthetic positive/negative policy regressions, then both live gates. These are source/CI policy changes only; they do not authorize merge, deployment or Production operations. Architecture, product invariants, permissions and CRM/H3 behavior are unchanged.

## Temporary dev-only minimatch exception

[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) affects `minimatch <11.0.1`, severity moderate (published 2026-10-30). Owner-approved on 2026-11-03 ("approve audit exception"; [OWNER_DECISIONS](../ai/OWNER_DECISIONS.md#dependency-audit--minimatch-dev-only-exception--approved-2026-11-03)). The only affected copies are dev tooling: `minimatch@3.1.5` (hoisted, used by eslint 8.57.1, @eslint/eslintrc, @humanwhocodes/config-array, eslint-plugin-import, eslint-plugin-jsx-a11y, eslint-plugin-react and rimraf 3 through its glob 7) and `minimatch@10.2.5` nested under `@typescript-eslint/typescript-estree@8.59.3`. The production copy, `minimatch@11.0.4` under `@sentry/bundler-plugins` (installed by the glob 14.0.3 override that closed GHSA-3g3m-2fjr-6pw4 in the production tree), is outside the range and needs no exception. This is a temporary exact exception, not a general waiver.

The policy applies the braces model to this advisory: propagated findings must lead exclusively to it; package, moderate severity, affected range and exact installed node paths are verified; the lockfile graph into both copies is resolved independently (dependency, optional and peer edges, cyclic ESLint peer edges tolerated) and compared with the approved graph of 21 dev-only nodes at their recorded versions; every other installed minimatch must be outside the range. A production node, a new runtime or dev consumer, a version, path or classification change, another advisory, a severity or range change, or a compatible npm fix fails closed. npm's major downgrade suggestions (ESLint 4, eslint-config-next 0.2) are the only accepted fix metadata; a bare `true` on a propagated entry (which npm reports today although `npm audit fix --dry-run` changes nothing) is accepted only while the dry-run fix plan is empty, which the gate re-runs each time. Every published minimatch version is validated; a stable release newer than an approved copy in its own line (3.x or 10.x) requires reassessment and fails, except releases already assessed as still affected (10.2.6, assessed 2026-11-03). Releases in other lines and prereleases do not retire the exception.

Retire it when the ESLint tooling moves to minimatch ≥ 11.0.1 (an ESLint 9 / typescript-eslint upgrade, its own decision) or when a compatible fix is published. The production gate, the braces exception and every dev tool version are unchanged by this exception.

## Compatible selector-parser remediation

The dependency-security correction retains Tailwind CSS 3.4.19 and postcss-nested 6.2.0, and pins `postcss-selector-parser` to `7.1.6` through an exact npm override for [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf). Both consumers request 6.x; registry investigation found no fixed 6.x parser or compatible same-major parent release moving both paths to a patched parser. This is a compatibility override, not an audit exception. The existing `source-map-js` lockfile correction to 1.2.2 also remains in place.

Tailwind uses synchronous parsing, AST factories/traversal/mutation, serialization and `dist/util/unesc`; postcss-nested uses synchronous parsing, nesting replacement, cloning and combinator/prepend serialization. The v7 insertion-during-iteration change and later bounded-depth/serialization fixes require consumer validation. `npm run test:css-toolchain`, included in full app tests, executes both actual consumers and covers application CSS, responsive/dark/group/peer/arbitrary variants, prefix/important modes, `@apply`, nesting and bubbled at-rules. Local differential compilation compared application and UI Foundation CSS plus selector fixtures against parser 6.1.4; browser validation remains separate evidence.

Reassess this exact override when compatible parent releases adopt a fixed parser. Keep both live audit gates and the existing braces policy unchanged; installation alone is not compatibility evidence. This source change remains subject to exact-SHA independent review and owner merge/release approval.
