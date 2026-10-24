"""Reject new deterministic SQLSTATE 40001 raises in Supabase migrations (audit REL-1).

PostgREST releases before 16 treat SQLSTATE 40001 (serialization_failure) raised
by an RPC as transient and re-run the transaction inside the server. A conflict
that is deterministic (a stale version stays stale) therefore never returns and
loops at about 100 transactions per second until PostgREST restarts. Migration
105 moved reconciliation off 40001 for this reason; the remaining raises are an
open owner decision.

Existing raises in migrations 001-118 are frozen in BASELINE below. A migration
fails this check when it holds more matches than its baseline (zero for any new
file). Comments, `exception when serialization_failure` handlers and
`when sqlstate '40001'` handlers are not raises and are ignored. A reviewed
genuine serialization retry can be allowed with a same-line comment
`-- ci-allow-40001: <reason>`.
"""
import argparse
from pathlib import Path
import re
import sys

BASELINE = {
    '080_crm_commands_and_followup_engine.sql': 6,
    '082_crm_conversation_decision.sql': 3,
    '083_crm_placement_integration.sql': 8,
    '084_crm_enrollment_and_conversion.sql': 6,
    '086_crm_meta_ingestion.sql': 10,
    '087_crm_website_ingestion.sql': 11,
    '088_crm_meta_lifecycle_delivery.sql': 12,
    '089_crm_meta_insights_and_reporting.sql': 7,
    '092_crm_website_optional_learner.sql': 3,
    '093_crm_mapping_learner_policy.sql': 3,
    '094_crm_meta_reconciliation.sql': 5,
    '096_receptionist_operational_permissions.sql': 11,
    '098_crm_lifecycle_evidence_and_delivery.sql': 2,
    '099_crm_lifecycle_delivery_runtime.sql': 10,
    '102_crm_meta_funnel_r4_runtime_safety.sql': 11,
    '103_crm_meta_funnel_r4_advisory_d2.sql': 32,
    '111_crm_rcc_a1_outcome_led_followup.sql': 8,
    '112_crm_rcc_a2_enrollment_ux.sql': 5,
    '114_crm_meta_insights_live_sync.sql': 5,
    '115_crm_meta_attribution_hierarchy.sql': 2,
    '117_online_learning_pilot.sql': 7,
}

ALLOW = re.compile(r'--\s*ci-allow-40001:\s*\S')
# Any literal 40001 (errcode = '40001', raise sqlstate '40001', helper
# arguments such as fail('stale', '40001', ...)) or a raise by condition name.
RAISES = re.compile(
    r"(?<![0-9A-Za-z_])40001(?![0-9A-Za-z_])"
    r"|errcode\s*=\s*'serialization_failure'"
    r"|\braise\s+(?:exception\s+)?serialization_failure\b",
    re.I,
)
HANDLER = re.compile(r"when\s+sqlstate\s+'40001'", re.I)


def strip_comments(text):
    text = re.sub(r'/\*.*?\*/', lambda m: '\n' * m.group().count('\n'), text, flags=re.S)
    return [line.split('--', 1)[0] for line in text.split('\n')]


def raises(text):
    """Return the 1-based line numbers of each non-allowed 40001 raise."""
    raw = text.split('\n')
    hits = []
    for number, code in enumerate(strip_comments(text), 1):
        if ALLOW.search(raw[number - 1]):
            continue
        code = HANDLER.sub('', code)
        hits.extend(number for _ in RAISES.finditer(code))
    return hits


def check(root):
    errors = []
    for path in sorted((Path(root) / 'supabase' / 'migrations').glob('*.sql')):
        hits = raises(path.read_text(encoding='utf-8'))
        allowed = BASELINE.get(path.name, 0)
        if len(hits) > allowed:
            lines = ', '.join(map(str, hits))
            errors.append(f'{path.name}: {len(hits)} SQLSTATE 40001 raise(s), baseline {allowed} (lines {lines})')
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n', 1)[0])
    parser.add_argument('--root', default='.')
    errors = check(parser.parse_args().root)
    if errors:
        print('New deterministic SQLSTATE 40001 raises found (audit REL-1):', file=sys.stderr)
        for error in errors:
            print('  ' + error, file=sys.stderr)
        print('Raise stale/conflict errors with a non-retryable code (for example PT409, or P0001 with a HINT) '
              'and map it in the browser. For a reviewed genuine serialization retry, add '
              "'-- ci-allow-40001: <reason>' on that line.", file=sys.stderr)
        return 1
    print('No new SQLSTATE 40001 raises in migrations')
    return 0


if __name__ == '__main__':
    sys.exit(main())
