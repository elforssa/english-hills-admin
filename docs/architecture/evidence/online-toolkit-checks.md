# Online room — live toolkit checks

The live half of the toolkit-facts check ([plan online room reliability, section 4](../plans/online-room-reliability.md#4-the-toolkit-facts-as-a-recurring-check-reliability-pr), decision D8). **The owner triggers it** on the first working day of each month, before each term and before every merge that touches the room or its packages. An operator session runs, with the development Zoom key, in installed Chrome, under the room path's Production headers:

- [`scripts/test-online-zoom-classroom.mjs`](../../../scripts/test-online-zoom-classroom.mjs)
- [`scripts/test-online-zoom-lifecycle.mjs`](../../../scripts/test-online-zoom-lifecycle.mjs)
- [`scripts/test-online-zoom-two-party.mjs`](../../../scripts/test-online-zoom-two-party.mjs)
- [`scripts/test-online-zoom-reliability.mjs`](../../../scripts/test-online-zoom-reliability.mjs)
- and, once the webhook PR is released, the retention job's last run.

The static half runs on every pull request: [`scripts/check-zoom-toolkit-facts.mjs`](../../../scripts/check-zoom-toolkit-facts.mjs) in `npm test`.

**A failed run blocks the next merge that touches the room and the activation of any new online course until a run passes.** Running courses continue; the owner decides whether a failure also needs the emergency procedure.

One dated line per run: date (Casablanca), commit, toolkit version, network, result of each script, failures and what was done. No key, secret, token or session name.

| Date | Commit | Toolkit | Network | Classroom | Lifecycle | Two-party | Reliability | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-18 | `1dbbd20` (reliability PR, D15) | 2.5.0-1 / SDK 2.6.0 | healthy, ~3 MB/s from `source.zoom.us`, 47 ms | 59/59 | 7/7 | 5/5 | 11/11 | First run of the reliability script on a final head; T-R6 not run. Earlier runs of 2026-11-17 on a ~100 KB/s link: the fourth video-sending device timed out, so the reliability devices now join without camera or headset. |
