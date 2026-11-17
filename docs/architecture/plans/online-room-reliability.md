# Online room reliability — newest connection wins, credential check, webhook evidence, recurring toolkit check

**Revision ORR-r2 (2026-11-17). Status: PROPOSED — architecture only; owner decisions D1–D14 recorded; not approved.** ORR-r1 (head `7518d14b60c26ddb751969d38c4fa4ad6d307d51`) was independently reviewed **CHANGES REQUIRED** (B1–B6, N1–N10) on 2026-11-17; this revision applies every finding and the owner's answers of the same day ([revision record](#revision-record)). Tier 3 (tokens and passes, two migrations on online tables, an external provider webhook, a Production secret and provider configuration). Child of the online-learning pilot ([plan](online-learning.md), [ADR-008](../decisions/ADR-008-online-learning-pilot.md)) and sibling of [online classroom tools](online-classroom-tools.md). Nothing here is implemented; no migration is written; no Production step is approved.

**Name (D1 = A, decided).** The owner's task calls this « PR C — online room reliability ». It is the server-side follow-up that the room lifecycle record left open ([« Not done here (server side, a separate Tier-3 change) »](online-learning.md#implementation-record--room-lifecycle-and-french-client-only-2026-11-14)). In [online classroom tools](online-classroom-tools.md#7-risk-tier-and-pr-split) « PR C » already means the toolkit upgrade to 2.6.10-1. This plan therefore names its two pull requests **« reliability PR »** and **« webhook PR »**, and the other work **« toolkit upgrade »**.

# Owner summary

## What will change

1. **One live connection per learner and per teacher in a lesson; the newest wins once it is inside Zoom.** Opening the room again (a reload, « Réessayer », a second phone or computer) makes the earlier connection leave by itself with a French message, but only after the new device has actually entered Zoom: a new device that fails to connect takes nothing from the old one. A connection that can no longer answer (a killed browser, a lost network) is removed from the room by the teacher's page automatically; the teacher can also remove anyone by hand with the toolkit's « Retirer ».
2. **The server catches pasted-credential mistakes** (spaces, quotes, line breaks, invisible characters, an absurd length, the key pasted as the secret) before it signs anything. Such a value closes the room with « La salle de cours n’est pas disponible pour le moment. » instead of sending every learner « Connexion instable », and the director sees « incorrecte » on the status line.
3. **Zoom's webhook is put into service** (second pull request): the subscription created in Zoom, four events stored (a participant joined or left, a session started or ended), shown to staff as evidence and added up as minutes for the Zoom bill, kept twelve months. **It never writes attendance.**
4. **The facts the room relies on inside Zoom's toolkit become a recurring check**: in CI on every pull request, and live once a month, triggered by the owner; a failed live run blocks the next room merge and any new online course until fixed.
5. **Preparation for a second room type** (Zoom Meeting SDK with Pro licences, owner decision D14 of 2026-11-17, built after the online module and the pilot): each pass records its room type, the server picks the adapter per pass, a separate room address is reserved, attendance stays independent of the room type. No second room type and no per-lesson setting are built.
6. **A written emergency procedure** for the pilot (the centre's one Zoom Pro licence, hosted by the director). No code.

## What staff/users will be able to do

- Learners and parents: nothing new to learn. « Rejoindre » works as today; a second device takes over cleanly. A parent who opens the room for a child is told that they have taken the child's place.
- Teachers: no more double of themselves or of a learner in the participant list after a reload; leftovers disappear without action.
- Reception, admin, director: on the course page, for each learner, the time of the first join and of the last leave reported by Zoom (webhook PR).
- Director and admin: a status line on « Cours en ligne » (credentials correct or not from the reliability PR; webhook secret present or not and the time of the last Zoom event from the webhook PR) and the connected minutes of the month (webhook PR).

## What remains restricted

- Attendance is still marked by the teacher or the office, never by Zoom.
- The teacher still sees first name and initial only; nothing new about a learner reaches the teacher or Zoom. The leftover list the teacher's page receives holds pass ids only, never the reason a pass ended.
- The live switch, the join gate, consent for minors, capacity and every header of the room path are unchanged. The webhook route gets its own gate (D5), stated exactly in [section 3](#3-zoom-webhook-webhook-pr).
- No second credential at Zoom, no server-side removal through Zoom's REST interface, no recording, no new host in the Content-Security-Policy.
- No « Type de salle » choice, no per-lesson room setting and no Meeting SDK room in this plan.

## UI impact

- Room page: one new card, « Ce cours est ouvert sur un autre appareil ou dans un autre onglet. » with « Utiliser cet appareil »; one notice for a parent who took a child's place; distinct texts when the teacher removes a participant and when the teacher ends the lesson for everyone.
- Staff course page (webhook PR): « A rejoint à 18:02 · Parti à 19:31 » beside each learner (today: the join time only).
- « Cours en ligne » list, director and admin only: the status line (both PRs) and the month's minutes (webhook PR).
- No change to the toolkit's own interface.

## Database impact

Two additive, forward-only migrations, **listed here and not written**, one per pull request. **Each takes its number at merge:** the next free number on `main` when its file lands there; no plan reserves a number (finding N9; the parked shared-address plan of PR #196 now says the same). Reliability PR: two columns on `online_join_tokens`, three new functions, two re-created. Webhook PR: one new table, four new functions, two re-created, one monthly retention job. No backfill; no existing row changes. Detail in [Migrations](#migrations-listed-not-written).

## Important security decisions

- The Zoom identity stays **one per pass** (`user_key` = pass id). The room reads it back as `userKey` on Zoom's participant object, never through the deprecated `userIdentity` (finding B1). A stable identity per person was rejected: Zoom refuses a participant it has removed (code 3009, recorded in T-P7), so a removed leftover could lock the real person out.
- An earlier pass is superseded **only when the newer pass's device confirms it is inside Zoom** (finding B2), so a failed token or a failed Zoom join never puts the working device out.
- The teacher's page receives a list of opaque pass ids to remove, never names or reasons, and only for its own lesson while it holds a live host pass.
- A participant may ask only about **its own** pass.
- The webhook route answers only to Zoom's signature and only under its own exact gate; the fake provider stays refused in Production; removing the webhook secret and redeploying closes it. This amends decision A3 of the adapter addendum and one consequence of ADR-008; the amendment texts are quoted in [section 3](#3-zoom-webhook-webhook-pr) and in [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md#online-room-reliability--decisions-d1d14-2026-11-17).
- No raw Zoom payload and no Zoom display name is stored; join and leave times are deleted after twelve months (D13).

## Risks / owner review points

- The automatic removal rests on one SDK field (`userKey`) whose live behaviour is **UNVERIFIED**; stop condition S1 covers it.
- Without a teacher in the room nobody can remove a dead connection; Zoom drops it by itself after a delay that is **UNVERIFIED** (measured in the reliability script).
- A device that never confirms (its page dies between the token and Zoom) supersedes nothing; the person's previous connection stays, as today.
- Co-host assignment in the emergency meeting without a Zoom account for the teacher is **UNVERIFIED**; the procedure gives the alternative ([section 7](#7-pilot-safeguard--emergency-procedure-no-code)).
- Zoom's prices, the pay-as-you-go terms, Zoom's webhook retry policy and whether Zoom offers a spending alert were **not read** for this plan.

---

## Baseline and evidence limits

- Baseline: `origin/main` `95eff1b1eeef2c23000a6d169d3f8d66568da7f7` (PR #197, classroom polish, merged), fetched 2026-11-17; the branch is rebased on it. The #197 record was read on `main`; the notes of its review as relayed in the review of ORR-r1 are placed in [section 5](#5-reliability-items-from-the-194-195-and-197-records).
- Read: [AGENTS](../../../AGENTS.md); [online-learning.md](online-learning.md) (D6, D7, D8, D11, the Zoom addendum A1–A7 and Z1–Z11, the Step 2 and room lifecycle records); [online-classroom-tools.md](online-classroom-tools.md) (re-read list, PR A, PR B and polish records, stop conditions); [ADR-008](../decisions/ADR-008-online-learning-pilot.md); the online sections of [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md#online-learning--unparked-for-architecture-2026-10-17), [CURRENT_STATE](../../ai/CURRENT_STATE.md) and [SECURITY_RULES](../../ai/SECURITY_RULES.md); `src/lib/online/**`; the five `/api/online/*` routes and the two webhook routes; migration [117](../../../supabase/migrations/117_online_learning_pilot.sql) (passes, events, join functions) and the later re-creations in 118, 119, 120, 123 and 125; the SDK typings of `@zoom/videosdk` 2.6.0 in `node_modules/@zoom/videosdk/dist/types` (`common.d.ts`, `event-callback.d.ts`).
- **Not in the repository:** the owner's R4 diagnosis (the document that numbers PR A–D). The « ghost » participant is known here from finding 7 of the room lifecycle record and from the owner's task. The reviews of #194, #195 and #197 were relayed by the owner; their findings are taken from the plan records and the review of ORR-r1.
- **Not done:** no Zoom developer documentation was re-read (the addendum's sources are dated 2026-10-22), no Zoom call, no Production read, no local run. One web search on 2026-11-17 (Zoom support result summaries, the co-host article not read in full) informs [section 7](#7-pilot-safeguard--emergency-procedure-no-code). Every statement about Zoom's live behaviour that the repository does not record is marked **UNVERIFIED** and tied to a test.
- Production state as recorded: the live switch is off except for supervised test lessons; `ONLINE_VIDEO_PROVIDER_WEBHOOK_SECRET` is not set and no Zoom event subscription exists; the Zoom account is on trial credits.

## Verified current state

| Point | Fact (file) |
| --- | --- |
| Identity | Every `POST /api/online/join` inserts a new `online_join_tokens` row; its `jti` is the Zoom `user_key` claim ([handlers.mjs](../../../src/lib/online/handlers.mjs), [zoom-video.mjs](../../../src/lib/online/provider/zoom-video.mjs) line 84). A reload is therefore a new Zoom participant. The token sets no `user_identity`. |
| Identity in the SDK | `Participant.userKey` is « the `user_key` from the JWT payload »; `Participant.userIdentity` is « the `user_identity` from the JWT payload », marked `@deprecated use userKey instead` (`common.d.ts`, lines 124–131). With our token `userIdentity` is therefore expected to be empty: ORR-r1's sweep on `userIdentity` would have matched nothing (finding B1). |
| Old connection | Leaves only if the page can still run: `pagehide`, the awaited teardown and the same-browser tab guard ([zoom-room-session.mjs](../../../src/lib/online/zoom-room-session.mjs), [room-tab-guard.mjs](../../../src/lib/online/room-tab-guard.mjs)). Nothing covers a second device or a page that died. |
| Closed reasons | The SDK closes a session with `'kicked by host'`, `'ended by host'` or `'expeled by host'` (`event-callback.d.ts`, `ClosedReason`). The room treats every `Closed` alike today. |
| Re-check | The room page calls `online_check_join(lesson, student)` every 30 s; it evaluates the person, not the pass, so it cannot tell an older connection from the newest. |
| Capacity | `evaluate_join` counts distinct learners, so several passes of one learner use one seat. |
| Removal | The SDK has `removeUser(userId)` for a host or manager; the toolkit's participant menu has « Retirer ». Zoom refuses the removed connection's token afterwards (T-P7, code 3009). No server-side removal exists (`supportsRevoke: false`). |
| Credentials | [gate.mjs](../../../src/lib/online/gate.mjs) requires both Zoom variables to be non-empty and nothing more. A wrong key or secret reaches learners as Zoom's catch-all code 200, shown as « Connexion instable… ». |
| Webhook | Route, signature (`v0:{timestamp}:{raw body}`, 300 s window), challenge and the mapping of `session.user_joined` / `session.user_left` to a pass are built and unit-tested. The route answers 404 while the live switch is off. It reads the whole body (`request.text()`) before any check, and it answers 200 even when the database write fails, because `handleWebhook` ignores the RPC error ([handlers.mjs](../../../src/lib/online/handlers.mjs), lines 155–162). Never exercised by Zoom. `online_join_events` is unique on (pass, kind, time) and its insert is `on conflict do nothing`. The staff course read shows the first `joined` time. |
| Provider model | `online_courses.provider` is written at activation from the one configured adapter; `handleJoin` refuses a pass whose provider differs from it; the room page mounts by `provider` and `embed.kind` and shows `provider_invalid` for anything else; lessons and passes carry no provider. |
| Attendance | `online_attendance` and `online_save_attendance` carry no provider field and read nothing from Zoom. |
| Scheduler | `pg_cron` is in use for the CRM (migrations 095, 100, 114). |

## Scope and non-goals

In scope: the five items of the owner's task and the minimal preparation for a second room type, in **two pull requests** (N10):

- **Reliability PR:** connections ([section 1](#1-newest-connection-wins-the-host-removes-leftovers-reliability-pr)), the credential check and its status line row ([section 2](#2-credential-check-paste-mistakes-only-reliability-pr)), the toolkit facts ([section 4](#4-the-toolkit-facts-as-a-recurring-check-reliability-pr)), the preparation of [section 6](#6-preparation-for-a-second-room-type-reliability-pr); its migration.
- **Webhook PR**, after the reliability PR is released: events, minutes, the rest of the status line and retention ([section 3](#3-zoom-webhook-webhook-pr)); its migration.

**Not in scope:** the toolkit upgrade (2.6.10-1), « Lever la main », any header or Content-Security-Policy change, a second Zoom credential or REST moderation, the Meeting SDK adapter, its room path, a per-lesson room record, the « Type de salle » screens and the emergency switch, any change to attendance rules, the shared-address plan of PR #196.

## Design

### 1. Newest connection wins; the host removes leftovers (reliability PR)

**Rule (D2 = A).** For one lesson, one person has at most one current pass. Person means the learner for a learner pass (a parent who opens the room for a child replaces the child's connection), the teacher for a host pass, the signed-in account for an observer pass.

1. **Issue does not supersede (B2).** `online_issue_join` is unchanged in what it decides. It takes `issued_at` from `clock_timestamp()` **after** its per-lesson advisory lock, so that the order of `issued_at` is the order of issue even for two simultaneous requests, and it writes the pass's `provider` (section 6). If the token cannot be minted after the pass is inserted, the earlier pass is untouched and stays current.
2. **The new device confirms, then the older passes are superseded (B2).** The join response gains `pass` (the pass id, which the participant can already read inside its Zoom token). Once the toolkit reports the page connected to the session, the page calls the new `online_confirm_pass(pass)`. Under the same per-lesson lock it: answers only for a pass issued to the caller; returns the pass's state if it is revoked, expired or already superseded (and then supersedes nothing); otherwise sets `superseded_at = now()` on every other pass of the same lesson and person that is neither revoked, expired nor superseded **and was issued before it** (`issued_at`, then `id`). It returns the same evaluation as `online_check_pass` plus `took_over_other_account`, true when a superseded pass belonged to another account. So the newest **issued** pass that **reaches Zoom** wins: an older device that confirms late finds itself superseded; a newer device that never reaches Zoom supersedes nothing.
3. **First check right after connecting (N7).** `online_confirm_pass` is that first check: the page acts on its answer at once (a pass already superseded while connecting leaves immediately), before any timer.
4. **The older page leaves by itself.** While in the room the page calls the new `online_check_pass(pass)` every 10 s in place of the 30-second `online_check_join`. It returns the same evaluation plus `superseded` and `revoked` and answers only for a pass issued to the caller. It is provider-neutral: it names no Zoom field (N5). On `superseded` the page leaves Zoom, destroys the toolkit and shows « Ce cours est ouvert sur un autre appareil ou dans un autre onglet. » with « Utiliser cet appareil », which asks for a new pass. There is no automatic retry, so two devices cannot take the room from each other in a loop.
5. **The parent is told (D2 refinement).** When `took_over_other_account` is true, the new page shows once, inside the room, « Vous avez pris la place de {Prénom I.} dans ce cours : son autre connexion a été fermée. », where the label is the pass's own display label (first name and initial, already on the page). Nothing else is revealed: not which device, not when.
6. **No ten-second wait in the usual case.** After `online_confirm_pass` has superseded something, the page sends one fixed marker, `eh-room:newer`, on Zoom's command channel (the channel the whiteboard markers already use). A page that receives it runs `online_check_pass` at once, at most once per two seconds. The marker carries nothing and decides nothing: the server's answer does, so a forged marker costs one extra read. The marker and the sweep below are Zoom-specific and live in the Zoom room module (`src/lib/online/zoom-room-session.mjs` and a new `src/lib/online/zoom-room-leftovers.mjs`), not in the provider-neutral room page (N5).
7. **Dead connections (D3 = A, D4 = A).** A page that cannot run cannot leave. The teacher's page, once connected with the role `host`, asks the new `online_list_room_leftovers(lesson)` at join, on every `user-added` and every 20 s. It returns **the ids only** of the lesson's superseded and revoked passes — never the reason a pass was revoked, never a name — and only to the lesson's effective teacher holding a current host pass. For every participant in `getAllUser()` whose **`userKey`** is in that list and who is not itself, the page calls `removeUser(userId)`. `userIdentity` is never read (B1). One trace line per removal, label only. If the client refuses (not host, call fails), nothing else happens and the next round tries again.
8. **The teacher's own double.** The teacher's new connection carries the host role in its token. Whether Zoom gives it host rights while the old host connection lingers is **UNVERIFIED** (T-R4, stop condition S2).
9. **By hand.** The toolkit's « Retirer » stays available to the teacher; the « Guide de la salle » gains one sentence.
10. **Closed by the host (N6).** On `connection-change` with state `Closed`:
    - `'kicked by host'` or `'expeled by host'`: the page asks `online_check_pass`; `superseded` → the card of point 4; `revoked` → the existing text for that state; otherwise « L’enseignant vous a retiré du cours. » with « Rejoindre » (a removal by hand is not a ban: a new pass is a new Zoom identity, as T-P7 recorded). No automatic retry.
    - `'ended by host'`: « L’enseignant a terminé le cours pour tous. », no check, no retry, « Quitter » only.
    - Any other or no reason: today's handling, unchanged.
    Which of the two removal reasons Zoom sends for « Retirer » is recorded by T-R7.

Not chosen: superseding at issue (ORR-r1; a failed mint or Zoom join put the working device out, B2); superseding after a successful mint in a separate service-role step (better than at issue, but a device that has a token and still fails to enter Zoom would put the working device out); a stable `user_key` per person (3009 lock-out); Zoom's REST `user.remove` (a second credential, possibly an enablement by Zoom support, Z5 of the addendum).

### 2. Credential check: paste mistakes only (reliability PR)

- **What it checks (B5).** `onlineGate` refuses with `provider_invalid` (503) when `ONLINE_VIDEO_PROVIDER_API_KEY` or `ONLINE_VIDEO_PROVIDER_API_SECRET` shows a paste mistake, and the webhook gate refuses when `ONLINE_VIDEO_PROVIDER_WEBHOOK_SECRET` does. A paste mistake is exactly one of: leading or trailing white space; any white space inside; a straight or typographic quote; a line break; a character that is not printable ASCII (control characters, zero-width and other invisible characters, any non-ASCII character); a length under 8 or over 512 characters; the key equal to the secret. **No alphabet rule and no exact length:** nothing here depends on Zoom's format, which this plan did not read. The rule lives in the adapter (`credentialShape`), so each provider brings its own; `zoom-video` uses exactly the rule above.
- **What it does not do.** A well-formed but wrong value still reaches learners as code 200. The check removes paste mistakes; it does not prove the key. A check against Zoom itself is not possible with the SDK credential alone.
- **Status line (reliability PR part).** A new `GET /api/online/status`, director and admin only, returns for the configured provider « clés : correctes / incorrectes / absentes » from the same rule, never the value, its length, its class of mistake or a fragment. « Cours en ligne » shows it to director and admin. The webhook PR adds its rows to the same route (section 3).
- **Production step (B5).** Right after the reliability PR is deployed, before any lesson (step R-P3), the director opens « Cours en ligne » and reads the line. « correctes » → lessons may run. **« incorrectes » → the reliability PR is reverted the same day and no lesson runs until the revert is deployed**; the rule is then presumed wrong (S5) and the class of the difference is investigated by the implementer without printing the value.
- The implementer measures the development and Production values by length band and character class only, never printing them, and the rule must accept both (S5).

### 3. Zoom webhook (webhook PR)

- **Verification:** unchanged (A3): signature and 300-second window before parsing, bounded challenge, nothing written for a challenge. Unit tests exist.
- **Webhook gate (D5 = A; B3).** The webhook route `/api/webhooks/online/<provider>` answers **if and only if all** of these hold, **whatever `ONLINE_LEARNING_LIVE_ENABLED` says**; otherwise it answers 404 with `{ reason: 'not_found' }`, reads at most the headers and writes nothing:
  1. `<provider>` is in the provider list and equals `ONLINE_VIDEO_PROVIDER`;
  2. it is not the case that `VERCEL_ENV` is `production` and the provider is `fake` (**invariant, kept from ADR-008: the fake provider is refused in Production on every route**);
  3. the adapter supports webhooks;
  4. the provider's credential variables are set and pass section 2 (for `zoom-video`: key and secret);
  5. `ONLINE_VIDEO_PROVIDER_WEBHOOK_SECRET` is set and passes section 2.
  It is a separate function, `onlineWebhookGate(env, provider)`, next to `onlineGate`, which stays exactly as it is for every `/api/online/*` route. Events are still written only for a pass or a lesson that exists.
- **Kill switch (B3).** Remove `ONLINE_VIDEO_PROVIDER_WEBHOOK_SECRET` from Vercel Production and redeploy: condition 5 fails, the route answers 404 to everything, nothing is written, and joins are unaffected (they do not use that variable). Zoom's revalidation then fails and Zoom disables the subscription after its failures (Z6); the owner may also delete the subscription in Zoom.
- **Amendment texts (B3), approved with D5 and written into the documents at the plan's approval:**
  - Addendum decision A3 (`online-learning.md`, Z6 and A3), replacing « The route still answers 404 while the live gate is off, so the Zoom event subscription is created and validated only at R5, and a later gate-off period disables it after about 18 days (re-validate manually when the gate returns). » (Z6) and « (gate still required) » (A3's summary line): « The webhook route has its own gate, independent of the live switch: it answers only when its provider is the configured provider, is not the fake provider in Production, supports webhooks, and its credentials and the webhook secret are set and free of paste mistakes; otherwise 404. Removing the webhook secret and redeploying closes it. The challenge and every event are still answered only after the signature, the 5-minute window and the `plainToken` bound are checked, and nothing is written for a challenge. »
  - ADR-008, Consequences, replacing « The activation route, the lesson-action routes, the join route and the webhook route are gated; the fake provider is refused in Production. »: « The activation route, the lesson-action routes and the join route are behind the live switch; the webhook route is behind its own gate (configured provider, credentials and webhook secret present and free of paste mistakes), independent of the live switch, and is closed by removing the webhook secret; the fake provider is refused in Production on every route. »
- **Request limits (N8).**
  - **Size before body:** the route refuses with 413 a request whose `Content-Length` is missing or above 64 KiB, before reading the body, and reads the body as a stream that stops at 64 KiB (a lying header gets 413 too). The signature is computed over the bytes read.
  - **Rate limit:** no database work happens before the signature check, so an unsigned flood costs the 64 KiB read and one HMAC per request. Signed events are capped: each record function refuses with `rate_limited` when more than 600 rows were received in the previous 60 seconds across both event tables (one pilot lesson produces a few dozen); the route then answers 429 and the status line counts it. A Vercel Firewall rule on the path is an owner option, not part of this plan.
  - **Replay safety:** a captured signed request replayed after 300 seconds is refused (401). Replayed within the window, it writes nothing new: join and leave events are unique on (pass, kind, time) and session events on (lesson, kind, time), and both inserts are `on conflict do nothing`. A replay can only re-deliver what Zoom signed.
- **Failed write (B4).** If any database call fails (error, timeout, `rate_limited`), the route answers **503** `{ reason: 'unavailable' }` (429 for `rate_limited`), never 200, so that a retry by Zoom can deliver it. Events of the same request already written stay; a retry writes nothing twice because of the unique keys above. Whether and how often Zoom retries a non-2xx answer is **UNVERIFIED** and recorded at W-P6; the minutes figure states its estimated part (below) so a lost event is visible.
- **Subscription (Production step W-P6):** `session.user_joined`, `session.user_left`, `session.started`, `session.ended`. Nothing else.
- **Stored (D6 = A):** join and leave as today in `online_join_events` (pass, kind, time, Zoom's opaque participant reference). Session start and end in the new `online_session_events` (lesson, provider, kind, time, Zoom's opaque session reference); the adapter reads the lesson id from the session name and the database verifies that the name equals the course's room reference plus that lesson id. No payload, no name, no device data.
- **Retention (D13 = decided):** rows of `online_join_events` and `online_session_events` whose time is more than 12 months old are deleted by `online_purge_session_evidence()`, scheduled monthly by `pg_cron` in the webhook migration (the pattern of migrations 095 and 100). The monthly live check (section 4) reads the job's last run; if the job is not running, the operator runs the function by hand and records it.
- **Use (D7 = A):** (a) the staff course page shows the first join and the last leave per learner; (b) `online_usage_month(month)` for director and admin adds up connected minutes per course, per pass, so a leftover counts as Zoom bills it; it is the figure to compare with Zoom's usage report (stop condition S4 of online classroom tools); (c) the status line shows the time of the last event, whether the webhook secret is set (never its value) and the count of refused writes since the last deploy. The teacher roster is unchanged. **Attendance is never written or pre-filled from events.**
- **Pairing rule of `online_usage_month` (B4).** Per pass, the events are taken in time order:
  1. `joined` followed by `left` → one interval.
  2. **`joined` with no later `left`** (lost event, or still connected) → the interval ends at the earliest of: the pass's next `joined`, the lesson's `ended` session event, the pass's expiry, the time of the read. Counted and marked **estimated**.
  3. **`left` with no earlier open `joined`** (lost join) → the interval starts at the latest of: the pass's issue time, the lesson's `started` session event. Counted and marked **estimated**.
  4. A second `joined` while one is open closes the first at the second's time (rule 2); a second `left` with nothing open is ignored.
  5. Intervals are clipped to the month in UTC (whether Zoom's usage report uses UTC is **UNVERIFIED**, compared at W-P7).
  The read returns per course: minutes, passes, and the number and minutes of estimated intervals, so the director sees how much of the figure is estimated.
- **Settled at the first validation, UNVERIFIED until then:** that Video SDK webhooks use the same headers; that `user.user_key` equals the pass id; whether a group move sends leave and join events; how Zoom meters a group; Zoom's retry behaviour.

### 4. The toolkit facts as a recurring check (reliability PR)

The list (whiteboard key and its two export options, `window.zmClient`, the command channel and its events, `userId` / `isHost` / `isManager` of `getAllUser()`, Zoom's viewer export link, the two corrections of the groups window with its ids, the error codes, the lifecycle facts, and from #197 the camera message and the token console line) stays owned by [online classroom tools](online-classroom-tools.md). This plan adds to it: **`userKey`** on the participant (the `user_key` of the token; B1) and the deprecation of `userIdentity`; `removeUser`; the three `ClosedReason` values; and turns it into a check with two parts:

- **Static, every pull request:** one script, `scripts/check-zoom-toolkit-facts.mjs`, in `npm test`, reads the installed bundles and typings and asserts every fact that can be read as text. It gathers the assertions that today sit in several unit tests into one named list, each with the module that depends on it. Run with a version argument it checks a packed tarball of another toolkit version without installing it, which is the first step of any upgrade.
- **The token-log wrapper is undone at teardown (#197 note, N2).** The room's drop of the toolkit's `[JWT] participant decoded payload` line replaces `console.log` for the page's life today. The reliability PR restores the original `console.log` in the room's teardown (leave, superseded card, unmount) and only if the current one is still the room's own wrapper; a unit test asserts both, and the lifecycle suite asserts that a console line after « Quitter » goes through unchanged.
- **Live, monthly (D8 = A, decided).** **The owner (Maroine) triggers it** on the first working day of each month, before each term and before every merge that touches the room or its packages; an operator session runs the existing real-Zoom scripts (classroom, lifecycle, two-party) plus the new reliability script with the development key, and reads the retention job's last run once the webhook PR is released. Each run is one dated line in `docs/architecture/evidence/online-toolkit-checks.md`. **A failed run blocks the next merge that touches the room and the activation of any new online course until a run passes**; running courses continue, and the owner decides whether a failure also needs the emergency procedure. Zoom changes its side without notice (the whiteboard build was replaced overnight on 2026-11-16), so the static part alone is not enough.

### 5. Reliability items from the #194, #195 and #197 records

| # | Item (source) | In this plan |
| --- | --- | --- |
| a | A reload issues a new Zoom identity; the old connection lingers (R4 finding 7) | Section 1 |
| b | The tab guard does not cover a second device or browser (lifecycle record) | Section 1 |
| c | Code 200 hides a refused key behind « Connexion instable » (lifecycle record) | Section 2, paste mistakes only; the limit is stated there |
| d | Zoom does not drop a participant whose token expires (T-P3, R4 Phase A) | Not changed: the page leaves at its check, and at lesson end plus grace the teacher may already be gone |
| e | Zoom replaced its whiteboard build overnight; one named `eval` refusal (#194 review) | Section 4, live part |
| f | Three refused `blob:` scripts in Production, cause unknown (S7) | Not changed; stays a Production test row |
| g | Whiteboard marker rate limit and sender rule (#194 re-review N1, N2) | The new marker follows the same rate limit; on the list |
| h | After a group return the audio control reads « join audio » for 0–7 s; real iPhone unverified (#195 review N1, #197) | No code; Production test row G-f stands |
| i | The timer correction must fail safe and say so (#195 review N2) | Fixed in #197 (merged); on the list |
| j | A network drop during a group move (S9, unverified) | Test only: the reliability script cuts the network during a move and records the outcome |
| k | Whether Zoom sends webhook events on a group move, and how it meters groups (PR B record) | Section 3, recorded at the first validation |
| l | The flicker « 1 / -1 » (R4, unexplained) | Not in scope; the trace stays |
| m | The token-log wrapper stays installed after the room ends (#197 review) | Section 4: restored at teardown |
| n | « [object Object] » after the toolkit's start-devices step (#197 review) | **Covered by the raise-hand PR** (in progress, branch `feat/online-raise-hand`); not repeated here |
| o | The phone's annotation toolbar; the learner's share label in English (« Test P.'s content ») (#197 record and review) | Stay in [online classroom tools](online-classroom-tools.md#implementation-record--classroom-polish-after-pr-b); not here |

### 6. Preparation for a second room type (reliability PR)

Owner decision D14 (2026-11-17): a second room provider, **Zoom Meeting SDK « client view » with Pro licences**, will be built **after the online module and the pilot**, selectable per course with a per-lesson emergency switch in the admin; students always use « Rejoindre ».

**What the reliability PR changes, and nothing more (D10 = A without the per-lesson column, N4):**

1. **The pass records its room type.** `online_courses.provider` (exists) is the course's room type. New `online_join_tokens.provider` records the room type each pass was issued for (written by `online_issue_join` from the course; NULL on existing rows, read as the course's). **No column on `online_lessons`:** the per-lesson room record belongs to the later Meeting SDK plan.
2. **The join path resolves the adapter per pass.** `online_resolve_join` returns the pass's provider. `handleJoin` takes the adapter of that provider and checks it against the **set** of enabled providers, which today contains exactly `ONLINE_VIDEO_PROVIDER`. The response already carries `provider` and `embed.kind`; that pair is the contract. Behaviour today is identical.
3. **The room page stays per provider.** `/online/room/<lesson>` is the Zoom Video SDK room with its own headers; it already refuses a pass of any other provider. The path `/online/meeting/<lesson>` is reserved for the Meeting SDK room, outside `/online/room/*` so that neither header set can reach the other's page; the header test asserts that this path carries only the catch-all headers today.
4. **Evidence and attendance stay neutral.** `online_join_events` is keyed by pass; passes and (webhook PR) `online_session_events` carry `provider`; `online_check_pass` and `online_confirm_pass` are provider-neutral; attendance tables and commands are untouched.
5. **Webhook routes stay one per provider** (`/api/webhooks/online/<provider>`), each behind the webhook gate of section 3.

**Left for the later Meeting SDK plan (its own Tier 3 architecture):** the per-lesson room record and the emergency switch command, with its pass revocation and the notice to people already in the room; the `zoom-meeting` adapter and its credentials (Meeting SDK key and secret, the account credential that creates meetings, host start), their variable names and the enabled-provider list; where a meeting number and passcode live and how that fits « no durable room address »; licences and overlapping lessons; the room page at the reserved path, its headers and Content-Security-Policy; the neutral « Rejoindre » entry that sends each lesson to the right path; « Type de salle » in the course form and the activation route; name lock, waiting room and removal in a meeting; its webhook route and events; T-P1–T-P7 again; cost.

**ADR-008 amendment (D10, D14; written into the ADR at the plan's approval):** « The provider is a property of the course. A pass records the provider it was issued for, and the server picks the adapter per pass. Each provider has its own room path, headers, adapter, credentials and webhook route; `/online/meeting/<lesson>` is reserved for the Zoom Meeting SDK room decided on 2026-11-17, to be built after the online module and the pilot. Join evidence and attendance are independent of the provider. A per-lesson room record and the per-lesson emergency switch belong to the Meeting SDK plan. »

### 7. Pilot safeguard — emergency procedure, no code

Owner's decision (D11 = A, refined 2026-11-17): the centre's single Zoom Pro licence is the backup; the office runs it; the teacher never receives the centre's Zoom credentials.

1. **Before the pilot.** The licence is on a centre account held by the director. The director tests one meeting from a phone and a computer, including the co-host step below with a participant who is not signed in to Zoom. Meeting settings: **waiting room on, private chat off** (participants may write to everyone only), passcode on, recording off. The office keeps, per online course, the WhatsApp list of its families.
2. **When to use it.** The teacher cannot enter, or more than one learner cannot enter or hear, for five minutes after « Réessayer ». One learner alone: the office helps that learner; the lesson stays in the room.
3. **Who does what.** The teacher calls the office. The director (or the office on the director's account, signed in on the office's device) starts **one meeting for this incident** (never a permanent personal link) and is its host. The office sends the link from the centre's WhatsApp to that course's list and to the teacher, with one line: « Rejoignez avec votre prénom et l’initiale de votre nom (exemple : Sara B.) ». The director admits from the waiting room only names on the roster and **makes the teacher co-host in the meeting**; the teacher then teaches, mutes and shares. The director stays in the meeting as host until the end.
4. **Co-host without a Zoom account (UNVERIFIED).** Zoom's co-host article, seen only as a search summary on 2026-11-17, requires a paid plan for the host and an assignment during the meeting; no rule that the co-host must be signed in was found. The pre-pilot test of point 1 settles it. **If Zoom requires the co-host to be signed in:** the teacher signs in with the teacher's own free Zoom account (never the centre's credentials). **If the teacher has none, or co-host still fails:** the director keeps every host action (waiting room, mute, removal) and sets « Qui peut partager » to all participants for that meeting, so the teacher can share as an ordinary participant; the director stops any learner's share.
5. **One emergency meeting at a time.** The centre has one licence: if two online lessons fail at the same time, the second lesson is rescheduled, not moved to Zoom.
6. **Afterwards.** The teacher marks attendance on the platform as usual (it needs no room evidence); the office writes one line (date, course, what failed, minutes lost) for the owner; the link is not reused.
7. **Children's courses.** Not used for a children's course until the owner has confirmed that the consent wording covers a lesson held on Zoom outside the platform. Until then a failed children's lesson is rescheduled.

This keeps the approved teacher boundary (D5 of the pilot plan, decision 3 of ADR-008): the teacher receives a link from the office, never the families' numbers and never the centre's credentials.

## Security boundaries

1. Passes, tokens and the secrets stay server-side as today; the token claims are unchanged.
2. `online_check_pass` and `online_confirm_pass` answer only for a pass whose `profile_id` is the caller; `online_list_room_leftovers` only to the lesson's effective teacher with a current host pass and returns ids only; all three `security definer`, fixed `search_path`, `authenticated` only. The service-role functions stay service-role only. The new table has row security on and no API grant.
3. The leftover list holds opaque ids of passes that the database has already ended, never the reason. The page removes only participants whose `userKey` is in it. No name, learner id or contact is added to any teacher read.
4. Zoom receives nothing new. The command-channel marker is a constant.
5. The webhook writes only under its gate, after the size limit and the signature check, only fixed fields, only for an existing pass or lesson; unknown events are acknowledged and dropped; a failed write is a 5xx.
6. The status route and the usage read are director and admin only and return words, booleans, times and counts.
7. Headers, Content-Security-Policy, middleware allowlists and the teacher projections are unchanged.

## Migrations (listed, not written)

Each additive, tested with `supabase migration up --local`, upgrade ceilings moved as in every migration PR, **number taken at merge** (`<n>` = the next free number on `main` when the file lands there).

**Reliability PR — `<n>_online_room_reliability.sql`**

| Object | Change |
| --- | --- |
| `online_join_tokens` | `superseded_at timestamptz`; `provider text` (same pattern check as the course column; NULL on existing rows) |
| `online_issue_join` (re-created from the latest cumulative body) | `issued_at` from `clock_timestamp()` after the lock; writes `provider`. Supersedes nothing |
| `online_resolve_join` (re-created) | refuses a superseded pass (reason `superseded`); returns the pass's provider |
| `online_confirm_pass(p_jti)` (new, authenticated) | own pass only; under the lesson lock, supersedes earlier current passes of the same lesson and person; evaluation plus `took_over_other_account` |
| `online_check_pass(p_jti)` (new, authenticated) | own pass only; evaluation plus `superseded` / `revoked` |
| `online_list_room_leftovers(p_lesson)` (new, authenticated) | host of the lesson only; ids of superseded and revoked passes, no reason |

**Webhook PR — `<n>_online_session_evidence.sql`**

| Object | Change |
| --- | --- |
| `online_session_events` (new) | `lesson_id`, `provider`, `kind` (`started`, `ended`), `at`, `provider_session_ref` (≤ 200), `received_at`; unique (`lesson_id`, `kind`, `at`); index on `received_at`; row security on, no API grant |
| `online_join_events` | index on `received_at` |
| `online_record_join_event` (re-created) | the 60-second write ceiling; otherwise unchanged |
| `online_record_session_event(…)` (new, service role) | verifies lesson and session name; idempotent; the same ceiling |
| `online_get_course` (re-created) | adds the last leave time per learner |
| `online_usage_month(p_month)`, `online_room_status()` (new, director and admin) | minutes per course with the pairing rule; time of the last event |
| `online_purge_session_evidence()` (new, owner only) and a monthly `pg_cron` job | deletes event rows older than 12 months; returns counts |

Each re-created function is proven by a catalog diff against its previous definition (only the intended lines differ; same signature, owner, security mode, `search_path` and privileges), as migration 117 did for `crm_start_enrollment`. `online_check_join` is kept: the room page still uses it before entry. Old application code keeps working on each new schema, so each migration can be applied before its merge.

## Tests

- **SQL suite ([test-online-learning.sql](../../../scripts/test-online-learning.sql)):**
  - Supersession for learner, host and observer, **only at confirmation**: an issued, unconfirmed pass leaves the earlier pass current (**"mint fails, old pass stays current"**: issue a second pass and never confirm it; the first stays current, its `online_check_pass` says not superseded and the leftover list is empty); confirming the newer pass supersedes the older; an older pass confirming after a newer one is told `superseded` and supersedes nothing; two simultaneous issues get ordered `issued_at`; a parent's confirmed pass supersedes the child's and returns `took_over_other_account`.
  - Capacity unchanged; `online_check_pass` and `online_confirm_pass` refuse another account's pass; `online_list_room_leftovers` refused to learners, parents, staff, another teacher and a teacher without a current host pass, and returns ids only (no name, no reason).
  - Webhook PR: session events verified against the room reference and idempotent; the write ceiling; usage figures on a fixture including **a join without a leave** (closed at the next join, the session end, the pass expiry or the read, marked estimated) and **a leave without a join** (opened at the later of issue and session start, marked estimated); the purge deletes exactly the rows older than 12 months.
  - The cross-role denial suite extended to every new function and the new table; catalog diffs; the upgrade rehearsal.
- **Node unit ([test-online-unit.mjs](../../../scripts/test-online-unit.mjs), [test-online-room-unit.mjs](../../../scripts/test-online-room-unit.mjs)):**
  - The paste-mistake rule: accepted values; each refusal class (leading, trailing and inner white space, each quote, a line break, a control character, a zero-width character, a non-ASCII letter, 7 and 513 characters, key equal to secret); no message, log or response carries the value, its length or its class.
  - **Mint fails, old pass stays current** at the handler: the adapter's mint throws after the pass is inserted; the handler answers its error and calls no supersession.
  - The webhook gate: open with every condition true and the live switch off; closed by each condition alone, including **no webhook secret** (the kill switch) and **`fake` with `VERCEL_ENV=production`**; `onlineGate` unchanged for every `/api/online/*` route.
  - The webhook route: 413 on a missing or oversized `Content-Length` without reading the body, and on a body that overruns a lying header; 401 before any database call; **a failed write answers 503**, `rate_limited` answers 429, and a retry of the same request writes nothing twice; the four events, an unknown event, a session name that does not match.
  - The handler picks the adapter by the pass's provider and refuses a provider outside the enabled set.
  - The leftover sweep with a fake toolkit: matches on `userKey`, ignores `userIdentity` (a participant with a listed `userIdentity` and another `userKey` is not removed), removes only listed participants, never itself, survives a refusal.
  - `connection-change` `Closed` with each of the three reasons and with none chooses the right text; the marker's rate limit; the console wrapper restored at teardown; `scripts/check-zoom-toolkit-facts.mjs` on the installed bundle.
- **Headers ([test-online-headers.mjs](../../../scripts/test-online-headers.mjs)):** unchanged values; the reserved path carries only the catch-all headers.
- **Browser, fake toolkit (CI):** the superseded card, no automatic retry, « Utiliser cet appareil » takes over, the parent's notice, the removed and ended texts.
- **Real Zoom, local, development key (`scripts/test-online-zoom-reliability.mjs`, new; report attached to the reliability PR):**
  - **T-R1** the host reads **`userKey`** of the other participants and it equals each pass id; `userIdentity` is recorded (expected empty).
  - **T-R2** the same learner in two separate browsers: the first leaves within 15 s of the second entering Zoom, one participant remains, the card is shown.
  - **T-R2b** the second browser is refused by Zoom (its network cut before the join completes): the first stays in the room and is never shown the card.
  - **T-R3** a learner's browser is killed, then cut from the network in a second pass: the teacher's page removes the leftover within 30 s; the learner's new connection is not refused.
  - **T-R4** the teacher's browser is killed and the teacher comes back: the new connection has host rights and removes the old one; how Zoom assigns the host is recorded.
  - **T-R5** five fast reloads of the teacher and of a learner: never more than one of each for longer than 15 s.
  - **T-R6** groups: a leftover inside a group, a sweep while groups are open, and a network cut during a move (item j); recorded.
  - **T-R7** the teacher removes a learner with « Retirer », then ends the session for all: the learner's page shows the removed text, then every page shows the ended text; the reason Zoom sends for « Retirer » (`kicked by host` or `expeled by host`) is recorded.
  - How long Zoom itself keeps a dead connection is measured with the sweep off and recorded.
- **Webhook against Zoom:** only in Production, at the first validation (step W-P6), because a local machine has no public address.

## Rollout, Production steps and rollback

Each step needs the owner's own approval at the time; an operator session runs it, never the author.

**Reliability PR**

| Step | What | Rollback |
| --- | --- | --- |
| R-P0 | Read-only: ledger ceiling, the two functions equal to their expected bodies, no real course | — |
| R-P1 | Apply the migration (dry run first), read-only proofs | Forward migration only; the old code runs on the new schema |
| R-P2 | Merge and deploy, live switch as it is | Revert the pull request |
| R-P3 | **Before any lesson, the director reads the status line** on « Cours en ligne » (B5). « correctes » → continue. « incorrectes » → revert R-P2 the same day; no lesson until the revert is deployed | Revert |
| R-P4 | Supervised test lesson on the test course: second device takes over; a phone put in aeroplane mode disappears from the teacher's list; teacher reload; a parent takes the child's place; « Retirer »; « end for all »; a group move | Live switch off |
| R-P5 | Documentation closeout for this PR | — |

**Webhook PR** (after R-P5)

| Step | What | Rollback |
| --- | --- | --- |
| W-P0 | Read-only: ledger ceiling, the two functions equal to their expected bodies | — |
| W-P1 | Apply the migration (dry run first), read-only proofs, the retention job listed | Forward migration only |
| W-P2 | Merge and deploy | Revert the pull request |
| W-P3 | The director reads the status line: keys « correctes », webhook secret « absent » | Revert |
| W-P4 | **Zoom billing (owner, D12 = 30 / 40 USD):** move the Video SDK account from trial credits to pay-as-you-go; an alert at **30 USD** a month if the account offers one (**UNVERIFIED**), and at **40 USD** the owner reads the usage report the same day; otherwise a monthly reminder at the D8 check. Price and free allowance are read in the account on the day and written into the release record | Billing change is the owner's to undo |
| W-P5 | **Webhook secret (owner):** copy the Secret Token of the Video SDK app into `ONLINE_VIDEO_PROVIDER_WEBHOOK_SECRET` (Vercel, Production only, Sensitive; recorded by name only), then redeploy; the status line says « présent » | **Kill switch:** remove the variable, redeploy |
| W-P6 | **Event subscription (owner, in Zoom):** endpoint `https://<Production host>/api/webhooks/online/zoom-video`, the four events of section 3, validate. Record: validation result, headers as expected, `user_key` equal to a pass id on the first event, Zoom's retry behaviour if a 5xx occurs | Delete the subscription, then the kill switch |
| W-P7 | Supervised test lesson: the course page shows join and leave; the status line and the minutes move; Zoom's usage report compared, estimated part read | Kill switch |
| W-P8 | Documentation closeout (CURRENT_STATE, SECURITY_RULES, WORKFLOWS, ADR-008, release record) | — |

## Expected modules

**Reliability PR:** `supabase/migrations/<n>_online_room_reliability.sql`; `src/lib/online/gate.mjs` (the paste-mistake rule through the adapter), `handlers.mjs`, `reasons.mjs` (reason `superseded`), `provider/index.mjs`, `provider/zoom-video.mjs` and `provider/fake.mjs` (`credentialShape`), `zoom-room-session.mjs`, `zoom-toolkit-messages.mjs` (console restore), a new `src/lib/online/zoom-room-leftovers.mjs`; `src/app/api/online/join/route.js`, a new `src/app/api/online/status/route.js`; `src/app/(admin)/online/room/[id]/page.jsx`, `src/components/online/ZoomRoom.jsx`, `src/app/(admin)/online/page.jsx`, the teacher guide block; `scripts/check-zoom-toolkit-facts.mjs`, `scripts/test-online-zoom-reliability.mjs`, the suites named above, `package.json` (test script only); `docs/architecture/evidence/online-toolkit-checks.md` (new, one line per live run).

**Webhook PR:** `supabase/migrations/<n>_online_session_evidence.sql`; `src/lib/online/gate.mjs` (`onlineWebhookGate`), `handlers.mjs`, `provider/zoom-video.mjs` (session events); both webhook routes (size limit, gate, 5xx); `src/app/api/online/status/route.js` (webhook rows); `src/app/(admin)/online/page.jsx` and `[id]/page.jsx`; the suites named above.

Both: `.env.example` (no new name); the durable documents at closeout. **No change:** `next.config.mjs`, `src/middleware.js`, the lockfile, the toolkit version.

## Owner decisions

All answered by the owner (Maroine) on 2026-11-17 and recorded in [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md#online-room-reliability--decisions-d1d14-2026-11-17). They do not approve the plan, either pull request, either migration or any Production step.

| # | Question | Decision |
| --- | --- | --- |
| **D1** | Two things are called « PR C » | **A:** « reliability PR » and « webhook PR » here, « toolkit upgrade » for 2.6.10-1; the re-read list stays in online classroom tools and is run by section 4 |
| **D2** | One connection per what? | **A, refined:** per learner; a parent who opens the room for a child replaces the child's connection, **and the parent is told they have taken the child's place** (section 1, point 5) |
| **D3** | Who removes a dead connection? | **A:** the teacher's page automatically, plus « Retirer » by hand |
| **D4** | Does the automatic removal also cover revoked passes? | **A, refined:** yes; **the list returns ids only, never the reason** |
| **D5** | Webhook route while the live switch is off | **A:** its own exact gate (section 3), the fake provider refused in Production, the kill switch; A3 and ADR-008 amended as quoted |
| **D6** | Events stored | **A:** joined, left, session started, session ended; fixed fields |
| **D7** | Use of the events | **A:** evidence on the staff course page, monthly minutes and status for director and admin; attendance untouched |
| **D8** | How often the live check runs | **A, refined:** **the owner (Maroine) triggers** the monthly run (and before each term and each room merge); **a failed run blocks the next room merge and any new online course until fixed** |
| **D9** | Status line and monthly minutes for the director | **A:** include |
| **D10** | Second room type: the preparation of section 6 | **A without the per-lesson column:** provider on each pass, adapter per pass, `/online/meeting/<lesson>` reserved; the per-lesson room record is left to the Meeting SDK plan |
| **D11** | Pilot safeguard | **A, refined:** the office sends the link; the director hosts on the centre's single Pro licence and makes the teacher co-host; the teacher never receives the centre's credentials; waiting room on, private chat off, « Prénom + initiale »; one emergency meeting at a time; not for children's courses until the consent wording is confirmed (section 7) |
| **D12** | Spending alert level | **A:** 30 USD alert, 40 USD the owner reads the usage report the same day |
| **D13** (new) | Retention of Zoom join and leave times | **Decided:** kept 12 months, then deleted by a scheduled purge (section 3) |
| **D14** (new) | Second room provider | **Decided (recorded):** Zoom Meeting SDK client view on Pro licences, built after the online module and the pilot, selectable per course with a per-lesson emergency switch in the admin; students always use « Rejoindre » |

## Stop conditions

- **S1:** in real Zoom the host cannot read `userKey` of others, or it differs from the pass id: no automatic removal; stop and return to D3.
- **S2:** the teacher's new connection has no host or manager rights while the old one lingers: stop; the teacher's own double then needs Zoom's REST removal (a new owner decision) or Zoom's own timeout.
- **S3:** after a leftover is removed, Zoom refuses the same person's new connection: stop; the design rests on Zoom blocking the removed connection only.
- **S4:** any test in which the sweep removes a live, current connection, or in which a device that did not reach Zoom puts the working device out: the pull request does not merge.
- **S5:** the paste-mistake rule refuses the working development or Production credential: the rule does not ship as written; report the class of the difference, never the value.
- **S6:** the latest cumulative body of a function to re-create is not the one this plan read: re-read, report. The migration number is taken at merge and is never a stop.
- **S7:** anything needs a header, a Content-Security-Policy source, a new host, a second Zoom credential, a new package or a toolkit version change: stop; outside this plan.
- **S8:** at W-P6 Zoom's validation fails, the headers differ from the built scheme, or `user_key` is not the pass id: the subscription is removed, the kill switch is used and the webhook PR's evidence part waits; the reliability PR stands.
- **S9:** the preparation of section 6 needs more than its five points: stop; it belongs to the Meeting SDK plan.
- **S10:** Zoom's usage report shows more minutes than the application's figure can explain, estimated part included: no real lesson until explained (with S4 of online classroom tools).
- **S11:** any test in which the webhook route answers with no webhook secret, or for the fake provider with `VERCEL_ENV=production`: the webhook PR does not merge.

## IMPLEMENTATION CONTRACT

### Scope

Two pull requests from current `main`, in this order, each with its own migration numbered at merge:

1. **Reliability PR:** sections 1, 2 (with the status route's credential row), 4 and 6, as decided in D1–D4, D8, D10.
2. **Webhook PR:** section 3, as decided in D5–D7, D9, D12, D13; it starts after the reliability PR is released (R-P5).

Section 7 is a procedure: it is copied into [WORKFLOWS](../../ai/WORKFLOWS.md) at the reliability PR's closeout and has no code.

### Prerequisites

- **Q1:** this plan approved by the owner at an exact head after independent re-review; D1–D14 recorded in OWNER_DECISIONS (done in ORR-r2); the ADR-008 and A3 amendment texts written into those documents with the approval record.
- **Q2:** ~~PR #197 merged or closed.~~ Done: merged as `95eff1b`; the check of section 4 includes its two facts.
- **Q3:** the owner's development Zoom credentials in `.env.local` for the real-Zoom script.
- **Q4:** the raise-hand PR's state is read at the start of the reliability PR: both touch `ZoomRoom.jsx`, `zoom-room-session.mjs` and `zoom-toolkit-messages.mjs`; the second to merge rebases on the first.
- Read [AGENTS](../../../AGENTS.md), the pilot plan's D6, D7, D11 and addendum, and the header comments of the modules listed; re-check each toolkit fact in the installed bundle before relying on it.

### Object / module manifest

As in [Migrations](#migrations-listed-not-written) and [Expected modules](#expected-modules). No new environment variable. No header change.

### Invariants

1. Attendance is never written, proposed or changed from provider data.
2. The Zoom token's claims, lifetime rule and session name rule are unchanged; `user_key` is the pass id; the room reads it as `userKey`.
3. No teacher, parent or student read gains a field about another person; the leftover list is opaque ids for the host's own lesson, without reasons.
4. A participant can query or confirm only its own pass.
5. An earlier pass is superseded only by the confirmation of a later-issued pass whose device is in the session.
6. The webhook writes nothing before its gate, the size limit and the signature check, stores no payload and no name, and never answers 200 to a failed write.
7. The fake provider is refused in Production on every route, the webhook route included.
8. No credential value, length, class or fragment appears in a response, a log, a trace, a test report or a document.
9. Behaviour with one configured provider is identical to today's for every existing test.
10. `next.config.mjs` and the middleware are byte-for-byte unchanged.
11. Re-created functions differ from their previous bodies only by the lines this plan names.

### Acceptance / tests

Every suite in [Tests](#tests) for the pull request passes on its exact head; for the reliability PR T-R1–T-R7 pass or are recorded as the section says, and the real-Zoom report plus the classroom, lifecycle and two-party reports for the same head are attached; full CI is green.

### Stop conditions

S1–S11 above. On any of them: stop, report the evidence, change nothing outside the approved scope.

### Docs / status reporting

The implementation records are added to this file. At each closeout: CURRENT_STATE (evidence only), SECURITY_RULES (pass supersession at confirmation and the leftover list; then the webhook gate, its kill switch and retention), WORKFLOWS (the emergency procedure and the monthly check), ADR-008 (amendments and status), the plans index. Handoff per AGENTS with the exact head SHA, the migration filename and the status **READY FOR INDEPENDENT REVIEW** only on terminal green CI.

## Revision record

- **ORR-r1 (2026-11-17):** first version, from the owner's architecture task of 2026-11-17. Independent review at head `7518d14b60c26ddb751969d38c4fa4ad6d307d51`: **CHANGES REQUIRED** (B1–B6, N1–N10).
- **ORR-r2 (2026-11-17):** applies every finding and records the owner's answers D1–D14 (OWNER_DECISIONS).
  - **B1** the sweep matches `userKey` (the token's `user_key`), never the deprecated `userIdentity`; T-R1, S1 and a unit test reworded; `userKey` added to the toolkit facts.
  - **B2** supersession moved from issue to the new device's confirmation inside Zoom (`online_confirm_pass`); tests « mint fails, old pass stays current » (SQL and handler) and T-R2b; invariant 5.
  - **B3** the exact webhook gate, the fake provider's Production refusal as invariant 7, the kill switch, and the amended A3 and ADR-008 texts quoted; S11.
  - **B4** a failed write answers 5xx and is safe to retry with the unique keys; the pairing rule of `online_usage_month` with tests for a join without a leave and a leave without a join.
  - **B5** the credential check limited to paste mistakes; step R-P3, the director reads the status line before any lesson, revert on « incorrectes ».
  - **B6** the emergency procedure rewritten from the owner's decision (director hosts, teacher co-host, no credentials to the teacher, settings, one at a time, children excluded); the co-host-without-account question marked UNVERIFIED with its alternative.
  - **N1** baseline rebased on `main` `95eff1b` (#197 merged); Q2 done. **N2** #197's notes placed: console restore in section 4, « [object Object] » in table 5 as covered by the raise-hand PR, the phone annotation toolbar and English share label left in online classroom tools. N3 was not part of the owner's revision task and nothing was changed for it. **N4** the per-lesson column dropped. **N5** marker and sweep in the Zoom room module; `online_check_pass` provider-neutral. **N6** the three closed reasons handled; T-R7. **N7** the first check right after connecting. **N8** size before body, rate limit, replay safety, retention (D13). **N9** migration numbers taken at merge; PR #196's plan, index row and body corrected the same day. **N10** split into the reliability PR and the webhook PR; the D8 operator and consequence named. **One placement to confirm at re-review:** the status line's credential row ships with the reliability PR, not the webhook PR, because B5 needs the director to read it right after the reliability PR's deploy (R-P3); the webhook PR adds the webhook rows and the minutes to the same route.

## Approval record

None. ORR-r2 is proposed; the owner's answers D1–D14 are decisions on the questions, not an approval of the plan.
