# CI tooling-only fast path

Date: 2026-10-04.

## Purpose

Reduce unnecessary GitHub Actions time for changes that cannot affect the application database contract, while preserving fail-closed CI routing.

The previous classifier had only two modes:

- `docs`
- `full`

Any non-documentation change therefore ran the full local Supabase matrix. This made isolated non-runtime tooling changes pay for repeated database resets, migration upgrades, concurrency suites and browser/database acceptance even when no runtime/database-sensitive path changed.

## New mode

The classifier adds:

`tooling`

For pull requests, the required paths become:

| Mode | Docs checks | App/unit/build/security | Local database |
| --- | --- | --- | --- |
| `docs` | required | skipped | skipped |
| `tooling` | required | required | skipped |
| `full` | skipped | required | required |

Pushes to `main` continue to use `full` classification; this optimization is a pull-request fast path only.

## Conservative tooling allowlist

A path is tooling-eligible only when it is:

- a regular `100644` blob under `tools/**`; or
- exactly `scripts/test-meta-debugger-transport-monitor.mjs`; or
- a safe Markdown file under `docs/**` accompanying an otherwise tooling-only PR.

Everything else selects `full`.

In particular, these remain full CI:

- `src/**`
- `supabase/**`
- migrations
- `.github/**`
- `scripts/ci/**`
- database/CRM test SQL
- `package.json`
- `package-lock.json`
- root configuration
- unknown paths
- symlinks/non-regular Git modes
- unsupported status types
- runtime-to-tooling renames, because both old and new paths are evaluated with rename detection disabled.

The allowlist is intentionally narrow. New tooling paths must be added deliberately with regression coverage rather than being implicitly trusted.

## Fail-closed behavior

Classifier uncertainty still selects `full`.

The required aggregate gate accepts `tooling` only when:

- classifier succeeds;
- docs verification succeeds;
- app verification succeeds;
- local-database is skipped.

A tooling PR cannot satisfy the required gate if app checks fail or if database routing unexpectedly runs/fails.

## Expected benefit

Non-runtime tooling PRs no longer start Supabase or execute the repeated local migration/concurrency matrix. They still run the existing application/unit/build/security path.

Database-sensitive and unknown changes retain the full local-database suite.

## Validation

`scripts/ci/test_verify.py` adds regression cases for:

- tooling-only files;
- tooling + docs;
- the monitor test script;
- database test paths forcing full;
- tooling symlinks forcing full;
- runtime-to-tools rename forcing full;
- the complete required-gate matrix for `docs`, `tooling` and `full`.

This CI-routing change itself modifies `.github/**` and `scripts/ci/**`, so its own PR must run **full CI once** before merge.
