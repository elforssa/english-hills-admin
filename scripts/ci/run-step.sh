#!/usr/bin/env bash
# Step shell for the local-database CI job. It runs the step script exactly like
# GitHub's default bash shell (bash --noprofile --norc -eo pipefail), streams its
# output, and on failure repeats the last lines as one error annotation, so the
# failing assertion is visible on the PR checks page without opening the raw log.
# The local-database job only handles synthetic data and local placeholder keys.
set -uo pipefail
log="$(mktemp)"
bash --noprofile --norc -eo pipefail "$1" 2>&1 | tee "$log"
status=${PIPESTATUS[0]}
if [ "$status" -ne 0 ]; then
  tail -n 40 "$log" \
    | sed -e 's/\x1b\[[0-9;]*[A-Za-z]//g' -e 's/%/%25/g' -e 's/\r/%0D/g' \
    | awk -v title="${GITHUB_JOB:-step} (${CI_SHARD:-unsharded}) failed with exit ${status}" \
        'BEGIN { ORS = "" } { body = body $0 "%0A" } END { print "::error title=" title "::" body "\n" }'
fi
rm -f "$log"
exit "$status"
