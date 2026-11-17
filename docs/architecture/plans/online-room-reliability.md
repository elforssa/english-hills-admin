# Online room reliability — newest connection wins, credential check, webhook evidence, recurring toolkit check

**Revision ORR-r1 (2026-11-17). Status: PROPOSED — architecture only, not reviewed, not approved.** Tier 3 (tokens and passes, a migration on existing online tables, an external provider webhook, a Production secret and provider configuration). Child of the online-learning pilot ([plan](online-learning.md), [ADR-008](../decisions/ADR-008-online-learning-pilot.md)) and sibling of [online classroom tools](online-classroom-tools.md). Nothing here is implemented; no migration is written; no Production step is approved.

**Name.** The owner's task calls this « PR C — online room reliability ». It is the server-side follow-up that the room lifecycle record left open ([« Not done here (server side, a separate Tier-3 change) »](online-learning.md#implementation-record--room-lifecycle-and-french-client-only-2026-11-14)). **Conflict flagged, not resolved silently:** in [online classroom tools](online-classroom-tools.md#7-risk-tier-and-pr-split) « PR C » already means the toolkit upgrade to 2.6.10-1 (Tier 2, owner decision D5 of that plan), and that plan's « PR C re-read list » belongs to the upgrade. This plan uses **« reliability PR »** for its own pull request and **« toolkit upgrade »** for the other one; see [D1](#owner-decisions-required).

# Owner summary

## What will change

1. **One live connection per learner and per teacher in a lesson; the newest wins.** Opening the room again (a reload, « Réessayer », a second phone or computer) makes the earlier connection leave by itself with a French message. A connection that can no longer answer (a killed browser, a lost network) is removed from the room by the teacher's page automatically; the teacher can also remove anyone by hand with the toolkit's « Retirer ».
2. **The server checks the shape of the Zoom key and secret** before it signs anything. A badly pasted value closes the room with « La salle de cours n’est pas disponible pour le moment. » instead of sending every learner « Connexion instable ».
3. **Zoom's webhook is put into service:** secret verification as already built, the subscription created in Zoom, four events stored (a participant joined or left, a session started or ended), shown to staff as evidence and added up as minutes for the Zoom bill. **It never writes attendance.**
4. **The facts the room relies on inside Zoom's toolkit become a recurring check** instead of a list read once at the upgrade.
5. **Preparation for a second room type** (Zoom Meeting SDK with Pro licences, decided by the owner on 2026-11-17, built later): passes and lessons carry the room type, the server picks the adapter per pass, attendance stays independent of the room type. No second room type is built.
6. **A written emergency procedure** for the pilot (one Zoom Pro licence kept as a backup). No code.

## What staff/users will be able to do

- Learners and parents: nothing new to learn. « Rejoindre » works as today; a second device takes over cleanly.
- Teachers: no more double of themselves or of a learner in the participant list after a reload; leftovers disappear without action.
- Reception, admin, director: on the course page, for each learner, the time of the first join and of the last leave reported by Zoom.
- Director and admin: a status line on « Cours en ligne » (key shape correct or not, webhook secret present or not, time of the last Zoom event) and the connected minutes of the month.

## What remains restricted

- Attendance is still marked by the teacher or the office, never by Zoom.
- The teacher still sees first name and initial only; nothing new about a learner reaches the teacher or Zoom.
- The live switch, the join gate, consent for minors, capacity and every header of the room path are unchanged.
- No second credential at Zoom, no server-side removal through Zoom's REST interface, no recording, no new host in the Content-Security-Policy.
- No « Type de salle » choice in the admin and no Meeting SDK room in this plan.

## UI impact

- Room page: one new card, « Ce cours est ouvert sur un autre appareil ou dans un autre onglet. » with « Utiliser cet appareil ».
- Staff course page: « A rejoint à 18:02 · Parti à 19:31 » beside each learner (today: the join time only).
- « Cours en ligne » list, director and admin only: the status line and the month's minutes.
- No change to the toolkit's own interface.

## Database impact

One additive, forward-only migration, **listed here and not written**: `<next free number>_online_room_reliability.sql` (129 at this baseline; the unmerged plan of PR #196 names 129 provisionally, so the first implementation to start takes it). Two columns on `online_join_tokens`, one on `online_lessons`, one new table `online_session_events`, five new functions, three functions re-created from their latest cumulative bodies. No backfill; no existing row changes. Detail in [Migration](#migration-listed-not-written).

## Important security decisions

- The Zoom identity stays **one per pass** (`user_key` = pass id). A stable identity per person was considered and rejected: Zoom refuses a participant it has removed (code 3009, recorded in T-P7), so a removed leftover could lock the real person out.
- The teacher's page receives a list of opaque pass ids to remove, never names, and only for its own lesson while it holds a live host pass.
- A participant may ask only about **its own** pass.
- The webhook route answers only to Zoom's signature; with [D5](#owner-decisions-required) = A it answers while the live switch is off, which changes the approved text of decision A3.
- No raw Zoom payload and no Zoom display name is stored.

## Risks / owner review points

- **« Newest wins » can put a learner out for a moment** when the new device fails to connect after it has taken over; the old device then shows « Utiliser cet appareil ».
- **A parent who opens the room for a child takes the child's place** ([D2](#owner-decisions-required)).
- The automatic removal rests on one SDK field (`userIdentity`) whose live behaviour is **UNVERIFIED**; stop condition S1 covers it.
- Without a teacher in the room nobody can remove a dead connection; Zoom drops it by itself after a delay that is **UNVERIFIED**.
- The pilot safeguard as worded (« the teacher sends a Zoom link on WhatsApp ») conflicts with the teacher boundary ([D11](#owner-decisions-required)).
- Zoom's prices, the pay-as-you-go terms and whether Zoom offers a spending alert were **not read** for this plan.

---

## Baseline and evidence limits

- Baseline: `origin/main` `b581d957e9ede000b80549630d2316f1cc636427` (PR #195 merged), fetched 2026-11-17. PR #197 (classroom polish, head `07994c3fe380118ed420e73fb897943b27f23d1b`) is open and **has no independent review on record**; its own record was read on its branch.
- Read: [AGENTS](../../../AGENTS.md); [online-learning.md](online-learning.md) (D6, D7, D8, D11, the Zoom addendum A1–A7 and Z1–Z11, the Step 2 and room lifecycle records); [online-classroom-tools.md](online-classroom-tools.md) (re-read list, PR A, PR B and polish records, stop conditions); [ADR-008](../decisions/ADR-008-online-learning-pilot.md); the online sections of [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md#online-learning--unparked-for-architecture-2026-10-17), [CURRENT_STATE](../../ai/CURRENT_STATE.md) and [SECURITY_RULES](../../ai/SECURITY_RULES.md); `src/lib/online/**`; the five `/api/online/*` routes and the two webhook routes; migration [117](../../../supabase/migrations/117_online_learning_pilot.sql) (passes, events, join functions) and the later re-creations in 118, 119, 120, 123 and 125; the SDK typings in `node_modules/@zoom/videosdk/dist/types`.
- **Not in the repository:** the owner's R4 diagnosis (the document that numbers PR A–D). The « ghost » participant is known here from finding 7 of the room lifecycle record and from the owner's task. The independent reviews of #194 and #195 were relayed by the owner; their findings are taken from the plan records, not from a review document.
- **Not done:** no Zoom documentation was re-read (the addendum's sources are dated 2026-10-22), no Zoom call, no Production read, no local run. Every statement about Zoom's live behaviour that the repository does not record is marked **UNVERIFIED** and tied to a test.
- Production state as recorded: the live switch is off except for supervised test lessons; `ONLINE_VIDEO_PROVIDER_WEBHOOK_SECRET` is not set and no Zoom event subscription exists; the Zoom account is on trial credits.

## Verified current state

| Point | Fact (file) |
| --- | --- |
| Identity | Every `POST /api/online/join` inserts a new `online_join_tokens` row; its `jti` is the Zoom `user_key` ([handlers.mjs](../../../src/lib/online/handlers.mjs), [zoom-video.mjs](../../../src/lib/online/provider/zoom-video.mjs)). A reload is therefore a new Zoom participant. |
| Old connection | Leaves only if the page can still run: `pagehide`, the awaited teardown and the same-browser tab guard ([zoom-room-session.mjs](../../../src/lib/online/zoom-room-session.mjs), [room-tab-guard.mjs](../../../src/lib/online/room-tab-guard.mjs)). Nothing covers a second device or a page that died. |
| Re-check | The room page calls `online_check_join(lesson, student)` every 30 s; it evaluates the person, not the pass, so it cannot tell an older connection from the newest. |
| Capacity | `evaluate_join` counts distinct learners, so several passes of one learner use one seat. |
| Removal | The SDK has `removeUser(userId)` for a host or manager and `Participant.userIdentity` in its typings; the toolkit's participant menu has « Retirer ». Zoom refuses the removed connection's token afterwards (T-P7, code 3009). No server-side removal exists (`supportsRevoke: false`). |
| Credentials | [gate.mjs](../../../src/lib/online/gate.mjs) requires both Zoom variables to be non-empty and nothing more. A wrong key or secret reaches learners as Zoom's catch-all code 200, shown as « Connexion instable… ». |
| Webhook | Route, signature (`v0:{timestamp}:{raw body}`, 300 s window), challenge and the mapping of `session.user_joined` / `session.user_left` to a pass are built and unit-tested. The route answers 404 while the live switch is off. Never exercised by Zoom. `online_join_events` has no API read; the staff course read shows the first `joined` time. |
| Provider model | `online_courses.provider` is written at activation from the one configured adapter; `handleJoin` refuses a pass whose provider differs from it; the room page mounts by `provider` and `embed.kind` and shows `provider_invalid` for anything else; lessons carry no provider. |
| Attendance | `online_attendance` and `online_save_attendance` carry no provider field and read nothing from Zoom. |

## Scope and non-goals

In scope: the five items of the owner's task and the minimal preparation for a second room type. **Not in scope:** the toolkit upgrade (2.6.10-1), « Lever la main », any header or Content-Security-Policy change, a second Zoom credential or REST moderation, the Meeting SDK adapter, its room path, the « Type de salle » screens and the emergency switch, any change to attendance rules, the shared-address plan of PR #196.

## Design

### 1. Newest connection wins; the host removes leftovers

**Rule.** For one lesson, one person has at most one current pass. Person means the learner for a learner pass ([D2](#owner-decisions-required)), the teacher for a host pass, the signed-in account for an observer pass.

1. **Issue.** `online_issue_join`, after inserting the new pass, sets `superseded_at = now()` on every earlier pass of the same lesson and person that is neither revoked nor expired. The per-lesson advisory lock it already takes orders two simultaneous requests; the later one wins. `online_resolve_join` additionally refuses a superseded pass.
2. **The older page leaves by itself.** The join response gains `pass` (the pass id, which the participant can already read inside its Zoom token). While in the room the page calls the new `online_check_pass(pass)` every 10 s in place of the 30-second `online_check_join`. It returns the same evaluation plus `superseded` and the revoked state, and answers only for a pass issued to the caller. On `superseded` the page leaves Zoom, destroys the toolkit and shows « Ce cours est ouvert sur un autre appareil ou dans un autre onglet. » with « Utiliser cet appareil », which asks for a new pass. There is no automatic retry, so two devices cannot take the room from each other in a loop.
3. **No ten-second wait in the usual case.** A page that has just connected sends one fixed marker, `eh-room:newer`, on Zoom's command channel (the channel the whiteboard markers already use). A page that receives it runs `online_check_pass` at once, at most once per two seconds. The marker carries nothing and decides nothing: the server's answer does, so a forged marker costs one extra read.
4. **Dead connections.** A page that cannot run cannot leave. The teacher's page, once connected with the role `host`, asks the new `online_list_room_leftovers(lesson)` at join, on every `user-added` and every 20 s. It returns the ids of the lesson's superseded and revoked passes ([D4](#owner-decisions-required)), nothing else, and only to the lesson's effective teacher holding a current host pass. For every participant in `getAllUser()` whose `userIdentity` is in that list and who is not itself, the page calls `removeUser`. One trace line per removal, label only. If the client refuses (not host, call fails), nothing else happens and the next round tries again.
5. **The teacher's own double.** The teacher's new connection carries the host role in its token. Whether Zoom gives it host rights while the old host connection lingers is **UNVERIFIED** (T-R4, stop condition S2).
6. **By hand.** The toolkit's « Retirer » stays available to the teacher; the « Guide de la salle » gains one sentence.
7. **Removed by the host.** When Zoom closes a connection with « kicked by host », the page asks `online_check_pass` and shows the superseded card or the existing removed text accordingly.

Not chosen: a stable `user_key` per person (3009 lock-out, above); Zoom's REST `user.remove` (a second credential, possibly an enablement by Zoom support, Z5 of the addendum) — kept as [D3](#owner-decisions-required) option C.

### 2. Credential shape check

- `onlineGate` refuses with `provider_invalid` (503) when `ONLINE_VIDEO_PROVIDER_API_KEY` or `ONLINE_VIDEO_PROVIDER_API_SECRET` fails a shape rule, and the webhook route refuses when the webhook secret fails it. The rule lives in the adapter (`credentialShape`), so each provider brings its own.
- Rule for `zoom-video`: no leading or trailing white space, no quote, no line break, characters from one fixed alphabet, a length range, key different from secret. **The exact alphabet and lengths are UNVERIFIED:** the implementer reads them in Zoom's documentation and measures the developer and Production values by length and character class only, never printing them; the rule must accept both (S5). A check against Zoom itself is not possible with the SDK credential alone.
- Result is visible to the director in the status line (section 3) as « clé : forme correcte / incorrecte », never the value, its length or a fragment.
- Limit, stated plainly: a well-shaped but wrong value still reaches learners as code 200. The check removes the paste mistakes; it does not prove the key.

### 3. Zoom webhook

- **Verification:** unchanged (A3): signature and 300-second window before parsing, bounded challenge, nothing written for a challenge. Unit tests exist.
- **Reachability ([D5](#owner-decisions-required)).** Zoom validates the endpoint when the subscription is created and again every 72 hours, and disables a subscription after repeated failures (addendum Z6). The route answers 404 while the live switch is off, and the switch is on only during supervised lessons, so the subscription cannot survive today. Recommended: the webhook route answers whenever the provider is configured, its credentials pass the shape check and the webhook secret is set, **whatever the live switch says**; the fake provider stays refused in Production. Events are still written only for a pass or a lesson that exists.
- **Subscription (Production step):** `session.user_joined`, `session.user_left`, `session.started`, `session.ended`. Nothing else.
- **Stored ([D6](#owner-decisions-required)):** join and leave as today in `online_join_events` (pass, kind, time, Zoom's opaque participant reference). Session start and end in the new `online_session_events` (lesson, provider, kind, time, Zoom's opaque session reference); the adapter reads the lesson id from the session name and the database verifies that the name equals the course's room reference plus that lesson id. No payload, no name, no device data.
- **Use ([D7](#owner-decisions-required)):** (a) the staff course page shows the first join and the last leave per learner; (b) `online_usage_month(month)` for director and admin adds up connected minutes per course, per pass, so a leftover counts as Zoom bills it; it is the figure to compare with Zoom's usage report (stop condition S4 of online classroom tools); (c) the status line shows the time of the last event. The teacher roster is unchanged. **Attendance is never written or pre-filled from events.**
- **Settled at the first validation, UNVERIFIED until then:** that Video SDK webhooks use the same headers; that `user.user_key` equals the pass id; whether a group move sends leave and join events; how Zoom meters a group.

### 4. The toolkit facts as a recurring check

The list (whiteboard key and its two export options, `window.zmClient`, the command channel and its events, `userId` / `isHost` / `isManager` of `getAllUser()`, Zoom's viewer export link, the two corrections of the groups window with its ids, the error codes, the lifecycle facts, and after #197 the camera message and the token console line) stays owned by [online classroom tools](online-classroom-tools.md). This plan adds `userIdentity` and `removeUser` to it and turns it into a check with two parts:

- **Static, every pull request:** one script, `scripts/check-zoom-toolkit-facts.mjs`, in `npm test`, reads the installed bundles and asserts every fact that can be read as text. It gathers the assertions that today sit in several unit tests into one named list, each with the module that depends on it. Run with a version argument it checks a packed tarball of another toolkit version without installing it, which is the first step of any upgrade.
- **Live, on a calendar ([D8](#owner-decisions-required)):** the existing real-Zoom scripts (classroom, lifecycle, two-party) plus the new reliability script, with the development key. Zoom changes its side without notice (the whiteboard build was replaced overnight on 2026-11-16), so the static part alone is not enough. Each run is recorded in one dated line of an evidence file.

### 5. Reliability items from the #194, #195 and #197 records

| # | Item (source) | In this plan |
| --- | --- | --- |
| a | A reload issues a new Zoom identity; the old connection lingers (R4 finding 7) | Section 1 |
| b | The tab guard does not cover a second device or browser (lifecycle record) | Section 1 |
| c | Code 200 hides a refused key behind « Connexion instable » (lifecycle record) | Section 2, partly; the limit is stated there |
| d | Zoom does not drop a participant whose token expires (T-P3, R4 Phase A) | Not changed: the page leaves at its check, and at lesson end plus grace the teacher may already be gone |
| e | Zoom replaced its whiteboard build overnight; one named `eval` refusal (#194 review) | Section 4, live part |
| f | Three refused `blob:` scripts in Production, cause unknown (S7) | Not changed; stays a Production test row |
| g | Whiteboard marker rate limit and sender rule (#194 re-review N1, N2) | The new marker follows the same rate limit; on the list |
| h | After a group return the audio control reads « join audio » for 0–7 s; real iPhone unverified (#195 review N1, #197) | No code; Production test row G-f stands |
| i | The timer correction must fail safe and say so (#195 review N2; fixed in #197, unmerged) | Prerequisite Q2; on the list |
| j | A network drop during a group move (S9, unverified) | Test only: the reliability script cuts the network during a move and records the outcome |
| k | Whether Zoom sends webhook events on a group move, and how it meters groups (PR B record) | Section 3, recorded at the first validation |
| l | The flicker « 1 / -1 » (R4, unexplained) | Not in scope; the trace stays |

#197 has no review yet: any reliability finding of that review is added to this table in the next revision.

### 6. Preparation for a second room type (owner decision of 2026-11-17)

Decision to design for, in the owner's words from the task: the platform will later offer a second room provider, Zoom Meeting SDK « client view » with Pro licences, selectable per course (« Type de salle ») with a per-lesson emergency switch, chosen in the admin; students always use « Rejoindre ».

**What the reliability PR changes, and nothing more ([D10](#owner-decisions-required)):**

1. **The model carries the room type.** `online_courses.provider` (exists) is the course's room type. New nullable `online_lessons.provider` is the per-lesson override; no screen or command writes it in this PR. New `online_join_tokens.provider` records the room type each pass was issued for.
2. **The join path resolves the room type per pass.** `online_resolve_join` returns `coalesce(lesson.provider, course.provider)` and refuses when the override names a room type for which the course has no room. `handleJoin` takes the adapter of the pass's provider and checks it against the **set** of enabled providers, which today contains exactly `ONLINE_VIDEO_PROVIDER`. The response already carries `provider` and `embed.kind`; that pair is the contract. Behaviour today is identical.
3. **The room page stays per provider.** `/online/room/<lesson>` is the Zoom Video SDK room with its own headers; it already refuses a pass of any other provider. The path `/online/meeting/<lesson>` is reserved for the Meeting SDK room, outside `/online/room/*` so that neither header set can reach the other's page; the header test asserts that this path carries only the catch-all headers today.
4. **Evidence and attendance stay neutral.** `online_join_events` is keyed by pass; `online_session_events` and passes carry `provider`; attendance tables and commands are untouched.
5. **Webhook routes stay one per provider** (`/api/webhooks/online/<provider>`), each refused unless its provider is enabled.

**Left for the later Meeting SDK plan (its own Tier 3 architecture):** the `zoom-meeting` adapter and its credentials (Meeting SDK key and secret, the account credential that creates meetings, host start), their variable names and the enabled-provider list; where a meeting number and passcode live and how that fits « no durable room address »; licences and overlapping lessons; the room page at the reserved path, its headers and Content-Security-Policy; the neutral « Rejoindre » entry that sends each lesson to the right path; « Type de salle » in the course form and the activation route; the emergency switch command, its pass revocation and the notice to people already in the room; name lock, waiting room and removal in a meeting; its webhook route and events; T-P1–T-P7 again; an ADR-008 amendment (below); cost.

**Proposed ADR-008 amendment (written into the ADR only with the owner's approval of this plan):** « The provider is a property of the course with an optional per-lesson override. A pass records the provider it was issued for. Each provider has its own room path, headers, adapter, credentials and webhook route. Join evidence and attendance are independent of the provider. »

### 7. Pilot safeguard — operational procedure, no code

Owner's rule: one Zoom Pro licence is kept as an emergency backup; if the room fails during a lesson, the lesson continues in a Zoom meeting whose link is sent on WhatsApp.

1. **Before the pilot:** the licence is on a centre account; the owner tests one meeting from a phone and a computer; the office keeps, per online course, the WhatsApp list of its families. Meeting settings: waiting room on, passcode on, participants cannot rename themselves, recording off.
2. **When to use it:** the teacher cannot enter, or more than one learner cannot enter or hear, for five minutes after « Réessayer ». One learner alone: the office helps that learner; the lesson stays in the room.
3. **Who does what ([D11](#owner-decisions-required)):** the teacher calls the office; the office creates a meeting for this incident (never a permanent personal link), sends the link from the centre's WhatsApp to that course's list and gives it to the teacher; the teacher admits from the waiting room only the names on the roster.
4. **Afterwards:** the teacher marks attendance on the platform as usual (it needs no room evidence); the office writes one line (date, course, what failed, minutes lost) for the owner; the link is not reused.
5. **Children's courses:** used only if the recorded video consent covers a lesson held on Zoom outside the platform; the owner confirms this with the consent wording before the first children's course.

**Conflict flagged:** the owner's wording is « the teacher sends ». The approved teacher boundary (D5 of the pilot plan, decision 3 of ADR-008) gives an online teacher no learner contact, and WhatsApp is out of scope there. A teacher who sends the link needs the families' numbers or a shared group. The procedure above keeps the boundary by having the office send. The other reading is option B of D11.

## Security boundaries

1. Passes, tokens and the secret stay server-side as today; the token claims are unchanged.
2. `online_check_pass` answers only for a pass whose `profile_id` is the caller; `online_list_room_leftovers` only to the lesson's effective teacher with a current host pass; both `security definer`, fixed `search_path`, `authenticated` only. The service-role functions stay service-role only. The new table has row security on and no API grant.
3. The leftover list holds opaque ids of passes that the database has already ended. The page removes only participants whose identity is in it. No name, learner id or contact is added to any teacher read.
4. Zoom receives nothing new. The command-channel marker is a constant.
5. The webhook writes only after the signature check, only fixed fields, only for an existing pass or lesson; unknown events are acknowledged and dropped.
6. The status route and the usage read are director and admin only and return booleans, times and counts.
7. Headers, Content-Security-Policy, middleware allowlists and the teacher projections are unchanged.

## Migration (listed, not written)

`<next free number>_online_room_reliability.sql`, additive, tested with `supabase migration up --local`, upgrade ceilings moved as in every migration PR.

| Object | Change |
| --- | --- |
| `online_join_tokens` | `superseded_at timestamptz`; `provider text` (same pattern check as the course column; NULL on existing rows) |
| `online_lessons` | `provider text` NULL (override; same check) |
| `online_session_events` (new) | `lesson_id`, `provider`, `kind` (`started`, `ended`), `at`, `provider_session_ref` (≤ 200), `received_at`; unique (`lesson_id`, `kind`, `at`); row security on, no API grant |
| `online_issue_join` (re-created from the latest cumulative body) | supersedes earlier passes of the same lesson and person; writes `provider` |
| `online_resolve_join` (re-created) | refuses a superseded pass; returns the effective provider |
| `online_get_course` (re-created) | adds the last leave time per learner |
| `online_check_pass(p_jti)` (new, authenticated) | own pass only; evaluation plus `superseded` / revoked |
| `online_list_room_leftovers(p_lesson)` (new, authenticated) | host of the lesson only; ids of superseded and revoked passes |
| `online_record_session_event(…)` (new, service role) | verifies lesson and session name; idempotent |
| `online_usage_month(p_month)`, `online_room_status()` (new, director and admin) | minutes per course; time of the last event |

Each re-created function is proven by a catalog diff against its previous definition (only the intended lines differ; same signature, owner, security mode, `search_path` and privileges), as migration 117 did for `crm_start_enrollment`. `online_check_join` is kept: the room page still uses it before entry. Old application code keeps working on the new schema, so the migration can be applied before the merge.

## Tests

- **SQL suite ([test-online-learning.sql](../../../scripts/test-online-learning.sql)):** supersession for learner, host and observer; a parent's pass supersedes the child's (D2); two simultaneous issues; capacity unchanged; `online_check_pass` refuses another account's pass; `online_list_room_leftovers` refused to learners, parents, staff, another teacher and a teacher without a current host pass, and returns no name; session events verified against the room reference and idempotent; usage figures on a fixture; the lesson override resolves and fails closed without a room; the cross-role denial suite extended to every new function and the new table; catalog diffs; the upgrade rehearsal.
- **Node unit ([test-online-unit.mjs](../../../scripts/test-online-unit.mjs), [test-online-room-unit.mjs](../../../scripts/test-online-room-unit.mjs)):** shape rule (accepted, each refusal, never echoed); gate and webhook gate under D5; the handler picks the adapter by pass provider and refuses a provider outside the enabled set; the four webhook events, an unknown event, a session name that does not match; the leftover sweep with a fake toolkit (removes only listed identities, never itself, survives a refusal); the marker's rate limit; `scripts/check-zoom-toolkit-facts.mjs` on the installed bundle.
- **Headers ([test-online-headers.mjs](../../../scripts/test-online-headers.mjs)):** unchanged values; the reserved path carries only the catch-all headers.
- **Browser, fake toolkit (CI):** the superseded card, no automatic retry, « Utiliser cet appareil » takes over, « kicked by host » chooses the right card.
- **Real Zoom, local, development key (`scripts/test-online-zoom-reliability.mjs`, new; report attached to the pull request):**
  - **T-R1** the host reads `userIdentity` of the other participants and it equals each pass id.
  - **T-R2** the same learner in two separate browsers: the first leaves within 15 s, one participant remains, the card is shown.
  - **T-R3** a learner's browser is killed, then cut from the network in a second pass: the teacher's page removes the leftover within 30 s; the learner's new connection is not refused.
  - **T-R4** the teacher's browser is killed and the teacher comes back: the new connection has host rights and removes the old one; how Zoom assigns the host is recorded.
  - **T-R5** five fast reloads of the teacher and of a learner: never more than one of each for longer than 15 s.
  - **T-R6** groups: a leftover inside a group, a sweep while groups are open, and a network cut during a move (item j); recorded.
  - How long Zoom itself keeps a dead connection is measured with the sweep off and recorded.
- **Webhook against Zoom:** only in Production, at the first validation (step P5), because a local machine has no public address.

## Rollout, Production steps and rollback

Each step needs the owner's own approval at the time; an operator session runs it, never the author.

| Step | What | Rollback |
| --- | --- | --- |
| P0 | Read-only: ledger ceiling, the three functions equal to their expected bodies, no real course | — |
| P1 | Apply the migration (dry run first), read-only proofs | Forward migration only; the old code runs on the new schema |
| P2 | Merge and deploy, live switch as it is | Revert the pull request |
| P3 | **Zoom billing (owner):** move the Video SDK account from trial credits to pay-as-you-go; set a spending alert at **30 to 40 USD** a month if the account offers one (**UNVERIFIED**); otherwise a monthly reminder to compare Zoom's usage report with the application's minutes. Price and free allowance are read in the account on the day and written into the release record | Billing change is the owner's to undo |
| P4 | **Webhook secret (owner):** copy the Secret Token of the Video SDK app into `ONLINE_VIDEO_PROVIDER_WEBHOOK_SECRET` (Vercel, Production only, Sensitive; recorded by name only), then redeploy | Remove the variable, redeploy |
| P5 | **Event subscription (owner, in Zoom):** endpoint `https://<Production host>/api/webhooks/online/zoom-video`, the four events of section 3, validate. Record: validation result, headers as expected, `user_key` equal to a pass id on the first event | Delete the subscription |
| P6 | Supervised test lesson on the test course: second device takes over; a phone put in aeroplane mode disappears from the teacher's list; teacher reload; a group move; the course page shows join and leave; the status line and the minutes move; Zoom's usage report compared | Live switch off |
| P7 | Documentation closeout (CURRENT_STATE, SECURITY_RULES, WORKFLOWS, ADR-008, release record) | — |

With D5 = B, P5 moves to the day the live switch is turned on for good.

## Expected modules

`supabase/migrations/<n>_online_room_reliability.sql`; `src/lib/online/gate.mjs`, `handlers.mjs`, `reasons.mjs` (reason `superseded`), `provider/index.mjs`, `provider/zoom-video.mjs`, `provider/fake.mjs`, `zoom-room-session.mjs`, a new `src/lib/online/room-leftovers.mjs`; `src/app/api/online/join/route.js`, both webhook routes, a new `src/app/api/online/status/route.js`; `src/app/(admin)/online/room/[id]/page.jsx`, `src/components/online/ZoomRoom.jsx`, `src/app/(admin)/online/page.jsx` and `[id]/page.jsx`, the teacher guide block; `scripts/check-zoom-toolkit-facts.mjs`, `scripts/test-online-zoom-reliability.mjs`, the suites named above, `package.json` (test script only); `.env.example` (no new name); the durable documents at closeout. **No change:** `next.config.mjs`, `src/middleware.js`, the lockfile, the toolkit version.

## Owner decisions required

| # | Question | Options | Recommendation | Blocks |
| --- | --- | --- | --- | --- |
| **D1** | Two things are called « PR C » | **A** this work is « reliability PR », the 2.6.10-1 work is « toolkit upgrade »; the re-read list stays in online classroom tools and is run by section 4. **B** rename otherwise | **A** | Nothing; wording |
| **D2** | One connection per what? | **A** per learner: a parent who opens the room for a child replaces the child's connection. **B** per signed-in account: parent and child can both be in the room as the same learner, two tiles with one name | **A** (a seat is a learner; the tab guard already works this way) | Implementation |
| **D3** | Who removes a dead connection? | **A** the teacher's page automatically, plus « Retirer » by hand. **B** by hand only. **C** the server through Zoom's REST interface: works without a teacher, needs a second Zoom credential and possibly Zoom support | **A** | Implementation |
| **D4** | Does the automatic removal also cover revoked passes (lesson cancelled, guest removed, consent withdrawn)? | **A** yes. **B** superseded only | **A** (same list; it makes the approved revocation effective inside Zoom) | Implementation |
| **D5** | Webhook route while the live switch is off | **A** answers when provider, credentials and webhook secret are in place, signature required (changes A3's « gate still required »). **B** unchanged: the subscription exists only once the switch stays on | **A** | Webhook part and P5 |
| **D6** | Events stored | **A** joined, left, session started, session ended; fixed fields. **B** joined and left only: no session minutes | **A** | Webhook part |
| **D7** | Use of the events | **A** evidence on the staff course page, monthly minutes and status for director and admin; attendance untouched. **B** also propose « Présent » to the teacher from events | **A** (B changes the approved rule that Zoom data is never attendance) | Webhook part |
| **D8** | How often the live check runs | **A** before every merge that touches the room or its packages, on the first working day of each month and before each term, by an operator session with the development key, one line of evidence each time. **B** automated on a schedule: needs the development key as a CI secret and a scheduler, both Tier 3 | **A** | Nothing in the code |
| **D9** | Status line and monthly minutes for the director | **A** include. **B** leave out; check by SQL at release time | **A** | Small part |
| **D10** | Second room type: the preparation of section 6 | **A** as listed (two columns, per-pass adapter, reserved path). **B** none now; the later plan does all of it | **A** | Implementation |
| **D11** | Pilot safeguard: who sends the Zoom link | **A** the office, from the centre's WhatsApp, to the course list; the teacher calls the office. **B** the teacher, in a WhatsApp group owned by the centre: the teacher then sees the families' numbers, an accepted exception to the teacher boundary that must be recorded | **A** | Nothing in the code; needed before the pilot |
| **D12** | Spending alert level | 30 USD or 40 USD a month | 30 as the alert, 40 as the point where the owner looks at the usage report the same day | P3 |

## Stop conditions

- **S1:** in real Zoom the host cannot read `userIdentity` of others, or it differs from the pass id: no automatic removal; stop and return to D3.
- **S2:** the teacher's new connection has no host or manager rights while the old one lingers: stop; the teacher's own double then needs D3 option C or Zoom's own timeout.
- **S3:** after a leftover is removed, Zoom refuses the same person's new connection: stop; the design rests on Zoom blocking the removed connection only.
- **S4:** any test in which the sweep removes a live, current connection: the pull request does not merge.
- **S5:** the shape rule refuses the working development or Production credential: the rule does not ship as written; report the class of the difference, never the value.
- **S6:** the latest cumulative body of a function to re-create is not the one this plan read, or the migration number is taken: re-read, renumber, report.
- **S7:** anything needs a header, a Content-Security-Policy source, a new host, a second Zoom credential, a new package or a toolkit version change: stop; outside this plan.
- **S8:** at P5 Zoom's validation fails, the headers differ from the built scheme, or `user_key` is not the pass id: the subscription is removed and the webhook part waits; sections 1, 2, 4 and 6 stand.
- **S9:** the preparation of section 6 needs more than its five points: stop; it belongs to the Meeting SDK plan.
- **S10:** Zoom's usage report shows more minutes than the application's figure can explain: no real lesson until explained (with S4 of online classroom tools).

## IMPLEMENTATION CONTRACT

### Scope

Sections 1 to 4 and 6 as decided in D1–D10, in one pull request (« reliability PR ») from current `main`, with one migration. Section 7 is a procedure: it is copied into [WORKFLOWS](../../ai/WORKFLOWS.md) at closeout and has no code.

### Prerequisites

- **Q1:** this plan approved by the owner at an exact head after independent review, D1–D12 answered and recorded in OWNER_DECISIONS; the ADR-008 amendment written with the approval record.
- **Q2:** PR #197 merged or closed. If merged, the branch starts after it and the check of section 4 includes its two facts.
- **Q3:** the owner's development Zoom credentials in `.env.local` for the real-Zoom script.
- Read [AGENTS](../../../AGENTS.md), the pilot plan's D6, D7, D11 and addendum, and the header comments of the modules listed; re-check each toolkit fact in the installed bundle before relying on it.

### Object / module manifest

As in [Migration](#migration-listed-not-written) and [Expected modules](#expected-modules). No new environment variable. No header change.

### Invariants

1. Attendance is never written, proposed or changed from provider data.
2. The Zoom token's claims, lifetime rule and session name rule are unchanged; `user_key` is the pass id.
3. No teacher, parent or student read gains a field about another person; the leftover list is opaque ids for the host's own lesson.
4. A participant can query only its own pass.
5. The webhook writes nothing before the signature check and stores no payload and no name.
6. No credential value, length or fragment appears in a response, a log, a trace, a test report or a document.
7. Behaviour with one configured provider is identical to today's for every existing test.
8. `next.config.mjs` and the middleware are byte-for-byte unchanged.
9. Re-created functions differ from their previous bodies only by the lines this plan names.

### Acceptance / tests

Every suite in [Tests](#tests) passes on the exact head; T-R1–T-R6 pass or are recorded as the section says; the real-Zoom report and the classroom, lifecycle and two-party reports for the same head are attached to the pull request; full CI is green.

### Stop conditions

S1–S10 above. On any of them: stop, report the evidence, change nothing outside the approved scope.

### Docs / status reporting

The implementation record is added to this file. At closeout: CURRENT_STATE (evidence only), SECURITY_RULES (pass supersession, leftover list, webhook gate), WORKFLOWS (the safeguard and the monthly check), ADR-008 (amendment and status), the plans index. Handoff per AGENTS with the exact head SHA, the migration filename and the status **READY FOR INDEPENDENT REVIEW** only on terminal green CI.

## Revision record

- **ORR-r1 (2026-11-17):** first version, from the owner's architecture task of 2026-11-17. Not reviewed.

## Approval record

None. This revision is proposed.
