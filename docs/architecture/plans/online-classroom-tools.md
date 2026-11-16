# Online classroom tools — whiteboard, breakout rooms and the rest of a real class

**Revision OCT-r3, 2026-11-15. APPROVED by the owner on 2026-11-15 at exact head `711d49286bd6462072ebc508ed69eaaeb1adcaa2` ([approval record](#approval-record)); architecture only, the pull requests of the plan each need their own review and merge approval.** OCT-r1 at head `61451e92c570b85468a9a456242cfc48cb082174` (B1–B5, N1–N8) and OCT-r2 at head `0f0d83954cb6d4c6518bae922ff8523775ca087e` (B6 and four notes) were each independently reviewed CHANGES REQUIRED; this revision applies every finding and records the owner's answers D1–D11, confirmed by the owner on 2026-11-15 ([revision record](#revision-record), [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md#online-classroom-tools--approved-2026-11-15)). Risk tier: **Tier 3** for the outcome (it changes the security header of the room path, an OL-r6 decision); the pull requests inside it are tiered one by one in [PR split](#7-risk-tier-and-pr-split). Baseline: `main` at `ab3cc74` (PR #192 merged). Parent contract: [online learning — pilot architecture](online-learning.md) and [ADR-008](../decisions/ADR-008-online-learning-pilot.md).

**Status update, 2026-11-16 (PR B implementation):** PR A was merged as #194 (`b2198bf`); PR B (groups) is implemented on a pull request, not merged. The toolkit's own groups window turned out to have a timer that does not work, and four other defects; the owner decided how the timer is handled. See the [implementation record for PR B](#implementation-record--pr-b-groups).

**Status update, 2026-11-15 (PR A implementation):** step P1 is done (Production whiteboard host `us04st1.zoom.us`), S1 was decided by the owner (two exact path-scoped sources), and PR A is implemented on a pull request, not merged. What the implementation found and how it differs from the text below is in the [implementation record for PR A](#implementation-record--pr-a-whiteboard); the body of the plan is left as approved.

# Owner summary

The room passed its three-person test on 2026-11-15. This plan turns it into a classroom. The main finding: **almost every tool you asked for is already inside the Zoom toolkit version we ship; no new provider, no database change and no new Zoom purchase is needed.** Two things are in the way, and one tool does not exist.

- **Why the whiteboard "is not working":** the teacher already has a « Start whiteboard » button today (the toolkit switches it on by default and the Zoom account used in my run allows it). Clicking it fails because the room's security header refuses the whiteboard program that Zoom loads from one more Zoom address: **observed in a real Chrome run on 2026-11-15 with the headers exactly as shipped.** In two further runs with a deliberately widened header (diagnosis only) the whiteboard opened, the learner on a computer saw it, the phone-shaped window received it as a picture and a PDF export worked. **The exact header PR A will ship has not been run yet, nobody drew a stroke, and the run used the development Zoom credentials, not a confirmed Production key.** PR A's own test proves the shipped header before it merges, and you confirm the Production address first (step P1).
- **Breakout rooms:** they work with the version we ship and the account used in my run allows them. In the same run two learners were moved into two rooms and brought back; **nobody was sent to the portal**, and the room page never left the lesson. My run drove Zoom's client directly, **not the toolkit's own groups window**. So they need switching on, French text, a confirmation on our leave link, and a test before merge that drives the toolkit's own window through every step, with « return to the main room » both allowed and not allowed.
- **Raise hand and reactions do not exist in the toolkit** (either version). A small button of our own is possible later.

## What will change

1. The whiteboard works for teachers on a computer; learners on a computer see and use it; learners on a phone see it as a live picture (view only).
2. Breakout rooms (« Groupes ») for group activities: create, assign, timer, message to all groups, ask for help, return.
3. French text for both, and for the messages that already leak in English today.
4. A confirmation on our own « Quitter le cours » link, so nobody leaves the lesson by one mistaken tap.
5. Later and separately: the toolkit upgrade to 2.6.10-1, and our own « Lever la main » button.

## What staff/users will be able to do

- **Teacher (computer):** start and stop a whiteboard, export it as PDF; open groups with a timer, send a message to all groups, visit a group, answer a help request, close the groups; mute all, mute one, remove a participant, spotlight a learner; share a screen or a browser tab with its sound; annotate a shared screen; gallery or speaker view.
- **Learner (computer):** see and use the whiteboard; join their group, ask the teacher for help, come back; chat; share their screen when the teacher allows it.
- **Learner (phone):** everything above except drawing on the whiteboard and sharing a screen; the whiteboard arrives as a picture.

## What remains restricted

- Only the teacher (host) starts a whiteboard or opens groups. Learners cannot.
- Recording, captions, phone dial-in, invitations, chat files and the emoji picker stay off.
- No change to who may enter a lesson, to passes, to attendance or to what the teacher sees about a learner.
- Children's groups: breakout rooms put children in a room without the teacher. Groups are on for every course with the teacher rule (D4); **no children's online course is activated before you have decided D4 again** ([stop condition S6](#stop-conditions)).

## UI impact

Inside the room only: a whiteboard button and a « Groupes » button for the teacher; group dialogs for learners; « Quitter » at the top of our page becomes « Quitter le cours » and always asks for confirmation while the participant is in the room; one line for a participant whose device cannot open the whiteboard, while one is open: « Le tableau blanc s’affiche en lecture seule sur cet appareil. Pour écrire au tableau, utilisez un ordinateur. » A short « Guide de la salle » block on the teacher's own lesson list. No other page changes.

## Database impact

None. No migration, no new table, no change to passes, attendance or join evidence.

## Important security decisions

- **The room path's Content-Security-Policy gets three additions** (room path only, the rest of the site is untouched): scripts and styles from the Production whiteboard address only, written as narrowly as the browser allows (`https://<whiteboard host>/web_client_whiteboard/`, the host being the one you confirm in step P1; `us05st1.zoom.us` in my run), and `blob:` in `connect-src` for data the page itself created. No wildcard. This amends decisions A6/A7 of the pilot plan, so it is Tier 3 and needs your approval of this plan (D2 answered).
- **New data goes to Zoom:** what is drawn or typed on a whiteboard is sent to Zoom's document service while the whiteboard is open. Zoom's developer page says the whiteboard is « not persisted by default » and the toolkit warns that it cannot be reopened after closing; **what Zoom's servers retain afterwards is UNVERIFIED.** The platform still sends Zoom only the display label.
- **Breakout rooms and minors:** a group has no adult in it unless the teacher visits. Chat inside a group is visible only to that group.
- Nothing in this plan touches secrets, the join route, tokens or the webhook.

## Risks / owner review points

1. The whiteboard address belongs to Zoom and can change. Only the exact Production address is allowed (D2): a change breaks only the whiteboard, the lesson continues, the room log names the refused address, and the new address needs a fresh decision from you.
2. Real phones were not tested (the run used a phone-shaped Chrome window). iPhone Safari is checked in your Production test.
3. "Share with sound" and annotation were not exercised in the run; they are in your test script, with a stop condition.
4. The toolkit upgrade is not needed for the whiteboard or the groups; it is proposed after both are proven, as its own small PR.
5. The broken whiteboard button stays visible until PR A ships (D1: no separate PR; only test lessons use the room until then). PR A merges before PR B, so PR B never ships beside a broken button and needs no hidden button of its own.

---

## Brief verification (read 2026-11-15)

The brief's facts were checked against the repository, the two npm bundles and a live run. Corrections and contradictions, flagged rather than silently resolved:

| Brief | Found |
| --- | --- |
| Pilot feature choices are recorded in "ADR-017" | They are in [online-learning.md](online-learning.md) and [ADR-008](../decisions/ADR-008-online-learning-pilot.md). ADR-017 is the e-mail links decision. |
| `FEATURES` has no whiteboard key | True, and the consequence was missed: the toolkit's default configuration is `whiteboard: { enable: true, enableExport: true, enableViewerUserExport: true }` (both bundles), so **the host already sees « Start whiteboard » in Production**. The header comment of [ZoomRoom.jsx](../../../src/components/online/ZoomRoom.jsx) and `UNREACHABLE_PREFIXES` in [zoom-toolkit-resources.mjs](../../../scripts/lib/zoom-toolkit-resources.mjs) call the whiteboard strings unreachable; they are reachable today. |
| `subsession: { enable: false }` disables subsessions | It hides the toolkit's own button only. The SDK calls work and the toolkit still shows the subsession dialogs (observed: an English « … asked for help » dialog). Not an exposure: only the host or a manager can create or open subsessions. |
| The whiteboard key is commented out in `index.d.ts` | Confirmed in both versions; read by both bundles. Undocumented, so it can change without notice. |
| 2.6.x adds `emoji-reaction` | Confirmed as an SDK event and an SDK call (`sendEmojiReaction`); **the toolkit has no control that sends one**. |
| Latest npm version 2.6.10-1 | Confirmed (published list read 2026-11-15). |
| Whiteboard not on mobile or ≤ 2 cores | Confirmed in the bundle: enabled only when the account allows it **and** `navigator.hardwareConcurrency > 2` **and** the browser is not Android or iOS. |

## Evidence and its limits

**Sources.** Repository at `ab3cc74`; installed `@zoom/videosdk-ui-toolkit` 2.5.0-1 and the 2.6.10-1 npm tarball (ESM bundles and `index.d.ts`, compared as text); the served `https://source.zoom.us/videosdk/{2.5.0,2.6.10}/lib/js_media.min.js`; Zoom's developer pages for whiteboard, subsessions, share, UI Toolkit, webhooks and developer pricing (the CSP, annotation, billing and changelog pages returned 404 and are **not** sources here); and a live probe.

**Live probe, 2026-11-15, three runs of about two minutes each.** Installed Chrome (headless), the real toolkit 2.5.0-1, the room component and the room path's real headers through [the room harness](../../../scripts/lib/online-room-harness.mjs), throw-away sessions signed with the Video SDK key in the main checkout's git-ignored `.env.local` (the owner's Zoom developer credentials, in use for the acceptance runs since 2026-10-23; **not verified to be the key Production uses**, see [step P1](#4-content-security-policy-and-lazy-chunks)), no database. Participants: teacher (host, 1280 px), learner (1280 px), "phone" (390 px, touch, Android user agent). Run 1 used the headers as shipped. Runs 2 and 3 were **diagnosis runs with a widened policy** and prove nothing about the shipped policy; they exist to list what the whiteboard needs. **The exact policy PR A proposes (path-scoped source, Production host) was not run in any of them.** The probe script was temporary and is not in the repository; PR A adds the permanent whiteboard half and PR B the groups half, both under the shipped headers only.

**Not covered:** real phones and iPhone Safari; a ≤ 2-core computer; drawing strokes, inserting an image, PNG export; share with sound; annotation; the toolkit's own subsession window in any of its steps (the probe drove the same SDK client directly); the « allow return to the main room » option switched off; the Production Zoom key; toolkit 2.6.10-1 live; webhook deliveries; billing reports. Each is marked **UNVERIFIED** where it matters and is covered by a test or a stop condition below.

## Verified current state

- [ZoomRoom.jsx](../../../src/components/online/ZoomRoom.jsx): toolkit 2.5.0-1 pinned; `FEATURES` switches off `subsession`, `recording`, `caption`, `phone`, `invite`, `virtualBackground`, `troubleshoot`, `feedback`, `header`, `playback`, `theme`, chat emoji; no `whiteboard` key.
- Roles: the adapter signs `role_type` 1 for `host` and 0 for `participant` ([zoom-video.mjs](../../../src/lib/online/provider/zoom-video.mjs)); the token lives until the pass expiry (lesson end plus grace) or 30 minutes, whichever is later.
- Leaving: [zoom-room-session.mjs](../../../src/lib/online/zoom-room-session.mjs) calls the page's `onLeft` only from the toolkit's `onSessionClosed` / `onSessionDestroyed`; the page then navigates to the portal. The toolkit raises "session closed" only on the SDK state `Closed` (bundle: its `connection-change` handler). `Fail` shows our error card. `Reconnecting` is logged and nothing else.
- Room headers ([next.config.mjs](../../../next.config.mjs)): `script-src` adds `'wasm-unsafe-eval' https://source.zoom.us`; `connect-src` adds `https://zoom.us https://*.zoom.us wss://*.zoom.us`; `worker-src` adds `https://source.zoom.us`; `media-src` adds `https://st1.zoom.us`; `style-src 'self' 'unsafe-inline'`; `frame-src 'self'` and Turnstile; `img-src … https:`.
- French: [zoom-fr-FR.json](../../../src/lib/online/zoom-fr-FR.json) has 592 keys; `subsession.*` (174 keys in 2.5.0-1) and `whiteboard.*` (29) are excluded as unreachable.
- Join evidence: [`online_record_join_event`](../../../supabase/migrations/117_online_learning_pilot.sql) stores `joined` / `left` once per pass, kind and instant; it never writes attendance. Attendance is entered by the teacher per lesson (D8 of the pilot plan).

**Run 1 (headers as shipped), observed:**

- Teacher's toolbar contains « Start whiteboard ». `isWhiteboardEnabled()` is true for teacher and desktop learner, false for the phone. `canStartWhiteboard()` is true for the host only.
- Starting it is refused twice by the browser: `script-src` blocks `https://us05st1.zoom.us/web_client_whiteboard/<build>/dist/es/whiteboard-sdk.js` and `style-src` blocks `…/dist/css/whiteboard-sdk.css`. The toolkit then shows « Whiteboard Error — Failed to start whiteboard:0 ».
- Subsessions: create, open with auto-move, broadcast, ask for help and close all worked with `subsession.enable` false.

## 1. Feature inventory

"Pinned" is 2.5.0-1, "new" is 2.6.10-1. "Account" says what the Zoom account must allow. "Now" means in the PRs of this plan.

| Tool | Pinned | New | Account / plan | Phone browser | Who | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| Whiteboard | Yes (undocumented key, on by default) | Same | Must be enabled; **enabled on the account behind the development key** (probe); Production confirmed by step P1 | No canvas; arrives as a share picture « ‹name›'s content » (probe, emulated phone). Same on ≤ 2 cores | Host or manager starts; desktop learners get the canvas with its tools | **Enable now** (PR A). Needs the header change |
| Whiteboard export | PDF and PNG; viewer export is a separate switch | Same | Export can be disabled by the account | No | Teacher; learners only if `enableViewerUserExport` | **Now**: teacher yes, learners no. Content is lost when the whiteboard closes, so the teacher exports first |
| Breakout rooms: create, assign (automatic, manual, learners choose) | Yes (documented flag) | Yes, plus « move failed », « Main Session » and help labels | Must be allowed; **allowed on the account behind the development key** (probe); Production checked in PR B's Production test. Up to 50 rooms | Yes: moved in and back (probe, emulated) | Host or manager | **Enable now** (PR B) |
| Breakout timer, auto-close, countdown | Yes | Yes | — | Yes | Host | **Now** |
| Broadcast text / voice to all groups | Yes (text observed) | Yes | — | Receives | Host; voice needs the host on computer audio | **Now** (text); voice in the test script |
| Ask for help | Yes (observed, dialog on the host) | Yes | — | UNVERIFIED on a real phone | Learner asks, host answers | **Now** |
| Return to main room | Yes (observed) | Yes | — | Yes | Learner, or host for all | **Now** |
| Raise hand | **No control in the toolkit** | **No** | — | — | — | **Later**: our own button (PR D). Until then: chat or a real raised hand |
| Reactions (emoji) | No | SDK call only, **no toolkit control** | Account option | — | — | **Later**, with raise hand, or never |
| Annotation on a shared screen | Yes (toolbar strings; chunk `annoter` already preloaded) | Same | — | UNVERIFIED | Sharer and viewers, per the sharer's setting | **Already on**; verify in the test script |
| Share computer sound | The browser's own « share tab audio » box; the toolkit does not hide it | Same | — | No (phones cannot share a screen) | Whoever shares, in Chrome or Edge; a tab on macOS, tab or system on Windows. Not Safari or Firefox | **Already on**; UNVERIFIED under our headers, see [stop condition S2](#stop-conditions) |
| Chat | On | On, plus « delete message » | — | Yes | All; host can restrict or disable | Keep on |
| Chat files | Toolkit has the upload control; account-gated | Same | File transfer setting | — | All | **Never for now**: unmoderated files, and moderation is out of the pilot |
| Chat emoji picker | Off | Off | — | — | — | **Keep off**: it loads images from `cdn.jsdelivr.net`, a third party |
| Mute all, mute one, ask to unmute | Yes (participants panel) | Same | — | Yes | Host | Already on |
| Remove participant | Yes | Same | — | Yes | Host. Rejoin with the same pass is refused by Zoom (T-P7) | Already on |
| Spotlight (for all) / pin (for me) | Yes | Same | — | Yes | Host spotlights; anyone pins | Already on |
| Make host / make manager | Yes | Same | — | — | Host | Already on. Teacher guide: never hand over the host role |
| Gallery / speaker view | Yes (`viewMode`) | Same | — | Yes | All | Already on |
| Virtual background / blur | Flag exists, off | Same | — | Limited | All | **Later**, after a test on a modest laptop: it hides a child's home, but costs CPU |
| Captions | Flag exists, off | Same | **Paid plan** | — | — | **Never for now** |
| Recording | Flag exists, off | Same | **Paid plan** plus storage | — | Host | **Never without its own architecture**: minors, written consent, retention, who may watch; out of the pilot scope |
| Waiting room (« hold ») | No | Yes, needs a `hold` claim in the token | — | — | Host admits | **Never for now**: our own gate already decides who enters, and the claim is a server change |
| Phone dial-in, invitations, feedback, troubleshooting, header | Off | Off | Phone: paid | — | — | Keep off |

**What the toolkit cannot do at all (either version):** raise hand; a reactions bar; polls or quizzes; rooms prepared from our roster before the lesson (the SDK can, the toolkit window cannot); a whiteboard that survives the lesson; per-learner whiteboard rights; an attendance report. Self-rename stays as recorded (T-P4 gap).

## 2. Toolkit upgrade 2.5.0-1 → 2.6.10-1

**Is it needed?** Not for the whiteboard or the groups: every switch this plan uses exists in the pinned version and was exercised live on it. In the probe the toolbar came back complete after leaving a group, so the forum report about 2.4.5-1 was not reproduced on 2.5.0-1 (desktop and emulated phone only).

**What changes (bundles compared as text):**

| Area | Result |
| --- | --- |
| `featuresOptions` keys read by the bundle | Identical (22). No key added or removed. Whiteboard default unchanged |
| Public typings | Events only: adds `emoji-reaction`, `chat-delete-message`, `on-hold-change`, `peer-whiteboard-state-change`, voice-translator and clinical-notes events; renames `webrtc-statistic-data-change` to `webrtc-stats-report-data-change`; drops `whiteboard-privilege-change`. We subscribe to none of the changed ones |
| Hosts and file names in the bundle | Identical. Media library version constant 2.5.0 → 2.6.10 |
| Served media library | Same three lazy chunks, same names: `wmsc`, `pako`, `annoter` |
| Interface strings | 1,112 → 1,137: 25 added, none removed, **no English value changed** |
| Peer dependency | `@zoom/videosdk` `^2.6.10` (today 2.6.0 is installed through the peer) |

**What it touches in our code:**

- [zoom-media-chunks.mjs](../../../src/lib/online/zoom-media-chunks.mjs): `ZOOM_MEDIA_LIB` to `…/videosdk/2.6.10/lib`. [test-online-room-unit.mjs](../../../scripts/test-online-room-unit.mjs) already fails until they match.
- [zoom-fr-FR.json](../../../src/lib/online/zoom-fr-FR.json): the 25 new keys. Reachable and to translate: `chat.delete_message_*` (3), `media.error_camera_interrupted`, `media.error_camera_interrupted_resume`, `media.error_resume_video`, `notification.network_unstable`, `subsession.help`, `subsession.move_failed`, `subsession.main_session`. `hold.*` (15) joins the unreachable list.
- [zoom-room-errors.mjs](../../../src/lib/online/zoom-room-errors.mjs): re-read the numeric codes in the new bundle and confirm the table; the mapping is by code, so no change is expected.
- [zoom-room-session.mjs](../../../src/lib/online/zoom-room-session.mjs): the facts in its header comment (singleton, 60 s join timer, `connection-change` payload, `beforeunload` only) must be re-read in the new bundle and the comment's version updated.
- The undocumented whiteboard key: the new bundle's default configuration must still contain `whiteboard: { enable, enableExport, enableViewerUserExport }` and its code must still read `featuresOptions?.whiteboard?.enable` and the two export options (the unit test added in PR A fails otherwise).
- `window.zmClient`: the toolkit must still expose the SDK client under that name, since the read-only whiteboard line reads `isWhiteboardEnabled()` from it; re-read also the fallback rule in the bundle (Android or iOS browser, or two cores or fewer).
- Added by PR B: the facts behind the two corrections of the groups window ([implementation record for PR B](#implementation-record--pr-b-groups), findings 1 and 2): the toolkit opens groups with `getSubsessionClient().openSubsessions(list, options)` on one client object for the whole session, passes the typed timer value as a string and never sets `isTimerEnabled`; its menu layer hides itself in an effect clean-up and carries the inline style the room's rule matches. If the new version repairs either, the correction is removed, not kept beside the repair. Also re-read: the hard-coded English leave windows of the phone layout (finding 4), the forgotten assignment (finding 3) and the ids of the groups window that the classroom script clicks.
- Added by PR A (review note N3): the SDK's command channel as the room uses it (`getCommandClient().send(text)`, the events `command-channel-message` with a string `senderId` and `command-channel-status` with `Connected`); the fields `userId`, `isHost` and `isManager` of `getAllUser()`, on which the room decides whose whiteboard marker it believes; and Zoom's viewer export behaviour (a learner with `enableExport: true` keeps Zoom's own « Exporter au format PNG » link whatever `enableViewerUserExport` says). The whiteboard half of the classroom script is re-run on the new version, and on the day of any merge decision: Zoom changes the whiteboard program it serves without notice.
- `package.json` pin and overrides, lockfile; the npm audit gate.

**Gains:** a « camera interrupted — touch to resume » path (useful on phones), an « unstable network » notice, the subsession fixes above, message deletion. **Risk:** medium. It replaces the media library that #192 stabilised, on the day after it was stabilised; headless Chromium cannot see that class of failure, so the proof is the real-Chrome scripts plus a real lesson on phones.

**Decided (D5):** upgrade **after** the whiteboard and the groups are proven in Production on the pinned version, as its own PR with its own Production test. Two moving parts at once would make a failure impossible to attribute.

## 3. Breakout rooms and the room lifecycle

**Observed (runs 2 and 3, both learners):** moving into a group raises `connection-change` `Reconnecting` with reason `join breakout room`, then `Connected`. Coming back raises `Reconnecting` with reason `back to main session`, then `Connected`. `Closed` appeared once, at the very end, with reason `ended by host`. The page's phase stayed `in_room` for the whole run. Each move opens a new web socket to another regional `…rwg.<region>.zoom.us` host and re-posts to `https://zoom.us/wc/lsdk`; both are already allowed.

**Why a learner in a group is never sent to the portal by mistake:**

1. There are three ways from the room to the portal, and a move triggers none of them. (a) `onLeft`, called from the toolkit's "session closed" callbacks, which the toolkit raises only on the SDK state `Closed`; a move is `Reconnecting` → `Connected`. (b) Our own top-of-page link ([page.jsx](../../../src/app/(admin)/online/room/[id]/page.jsx), the `room-leave` anchor), which only a tap follows. (c) The 30-second `online_check_join`, which ends the room when the server says the participant no longer qualifies; it does not look at Zoom at all. Path (a) is pinned by tests: a unit test and a fake-toolkit browser test raise `Reconnecting` with each of the three observed reasons **and with an unknown reason**, then `Connected`, and assert that `onLeft` and `onError` were never called and the phase is still `in_room`; the real-Zoom script asserts the same against Zoom through the toolkit's own groups window.
2. Path (b): the link becomes « Quitter le cours » and **always** asks « Quitter le cours ? Vous sortirez de la salle pour tout le cours. » while the participant is in the room, in a group or not. It does not read Zoom's reason strings or any group state, so it cannot be wrong about where the participant is.
3. The toolkit's own leave control inside a group: its French text is written so the choices cannot be confused, « Revenir à la salle principale » and « Quitter le cours ». **UNVERIFIED until PR B's script runs:** the exact dialog a learner gets, with « allow return to the main room » on and off. PR B's pre-merge script drives it both ways ([Tests](#tests)); S3 stops the merge if a single tap leaves the lesson.

**Everything else that touches the lifecycle:**

| Piece | Effect of a move | Change |
| --- | --- | --- |
| `leaveOnPageUnload`, `pagehide` leave | None. Closing the page in a group leaves Zoom as today | None |
| 30-second `online_check_join` | Unchanged and still wanted: when the lesson window ends, the lesson is cancelled or consent is revoked, a participant in a group is taken to the portal too. This is path (c) above and is the server's decision, not a mistake | None |
| Tab guard | Keyed by lesson and person in the browser; a move stays in the same tab | None |
| Passes | No new pass and no call to the join route. The token outlives the lesson window by design, so the re-post on each move is inside its life | None |
| Failure during a move | A network drop mid-move is `Fail`: our error card with « Réessayer ». The retry lands in the **main room**; the teacher moves the learner again | Teacher guide |
| Teacher's page closes while groups are open | The session goes on; the timer returns learners; the teacher rejoins as host | Teacher guide: always set a timer |
| Whiteboard and groups | Zoom drops whiteboard content when a user joins a group | Teacher guide: export first |
| Attendance | Entered by the teacher per lesson; not derived from Zoom | None |
| Webhooks | **UNVERIFIED** whether Zoom sends `session.user_left` / `session.user_joined` on a move. If it does, they are stored once per pass, kind and instant as extra evidence rows; the roster's joined time is the earliest one, so it does not move. Nothing writes attendance | None; the Production test reads the evidence afterwards |
| `[online room]` trace | Zoom gives a participant a **new id on every move**, and the mover's list is rebuilt without "removed" events: in the probe a room of 3 logged `total=6` | On `Reconnecting`, clear the list and log `room move reason=…` (the reason only, never the group name, which the teacher types) |

## 4. Content-Security-Policy and lazy chunks

**Whiteboard, as observed with a widened policy (runs 2 and 3):**

| What | Address | Directive today | Covered? |
| --- | --- | --- | --- |
| Whiteboard program: 13 ES module scripts for the presenter, 8 for a viewer | `https://us05st1.zoom.us/web_client_whiteboard/<build>/dist/es/*.js` | `script-src` | **No** |
| Its stylesheet | same address, `dist/css/whiteboard-sdk.css` | `style-src` | **No** |
| A `fetch` of a `blob:` URL the whiteboard creates in the page | `blob:` | `connect-src` | **No** |
| Fonts and data fetched as `.br` files, images | same address | `connect-src` `*.zoom.us`, `img-src https:` | Yes |
| Document service | `https://us05das.zoom.us` | `connect-src` | Yes |
| Collaboration and logs | `https://dcsznginx-prod-*.{cloud,iad,sjc,hkg,sin,…}.zoom.us` | `connect-src` | Yes |
| Frames | none seen | `frame-src` | Not needed |

With the three missing items allowed, no other violation was reported while starting, viewing, exporting a PDF and stopping. Drawing, inserting an image and PNG export were not exercised.

**Breakout rooms:** no new chunk, no new host, no violation. Workers started from `blob:` during a move are already allowed by `worker-src`.

**Does the #192 preload approach cover the whiteboard? No.** #192 works because the three media chunks have fixed names at a fixed version on a host the room already allows. The whiteboard's address and `<build>` segment are sent by Zoom's server when the participant joins, the build changes with Zoom's own releases, and the program is a graph of modules that import each other. It cannot be preloaded from an allowed host. **A header change on the room path is required: Tier 3.**

**Proposed change, room path only:**

- `script-src` and `style-src`: add the Production whiteboard source and nothing wider (D2). First choice, the path-scoped source `https://<whiteboard host>/web_client_whiteboard/` (a source that ends in `/` matches only addresses under that path). A redirect cannot make the path form fail: after a redirect the browser matches the host only. What can break it is a script or stylesheet that the whiteboard loads from the same host but outside `/web_client_whiteboard/`; if the real-Zoom script shows one, fall back to the exact host `https://<whiteboard host>` and record which form shipped. Never a wildcard: if Zoom moves the host, the `csp blocked` line names the new one and it needs a fresh owner decision. `<whiteboard host>` is the host confirmed in step P1; `us05st1.zoom.us` was the host in the probe. **If P1 returns a host different from the one the development key gets, PR A stops under S1:** the real-Zoom script, which runs on the development key, could not prove the Production source, so nothing is improvised and no header is widened to cover both; the new exact host, and how PR A is then proved, need the owner's decision.
- `connect-src`: add `blob:`. A `blob:` URL can only be created by a script already running in the page and is same-origin; `media-src` and `worker-src` already allow it. The rule kept from A7 (D2): **no `blob:` in `script-src`; no wildcard in `script-src`, `style-src` or `worker-src`.** `worker-src` keeps exactly what it has today, `'self' blob: https://source.zoom.us` (its `blob:` comes from the site-wide policy and Zoom's workers need it), and gains nothing.
- No change to `frame-src`, `worker-src` (still `'self' blob: https://source.zoom.us`), `img-src`, `font-src`, the Permissions-Policy or any other path.
- **P1, before PR A is written (owner step, with my help):** my probe signed its sessions with the Video SDK key in the main checkout's git-ignored `.env.local` (the owner's Zoom developer credentials used for the acceptance runs since 2026-10-23). **I have not verified that this is the key Production uses**, and the whiteboard host is chosen by Zoom per account. So: in a Production test lesson, the teacher opens the browser console (F12), clicks « Start whiteboard » and copies the line that begins `Loading the script 'https://…/web_client_whiteboard/…` (Chrome's refusal message). The host in that line is the Production whiteboard host; it is recorded in [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md#online-classroom-tools--approved-2026-11-15) and is the only host PR A allows. Nothing secret appears in that line.

**So that the next surprise is visible:** the room listens for `securitypolicyviolation` and writes `[online room] … csp blocked directive=… host=…` (directive and host only). Had this existed, the whiteboard and the #192 loop would each have been one line in a teacher's console.

**Toolkit 2.6.10-1:** same hosts and file names in the bundle and the same three media chunks; the whiteboard address comes from Zoom's server, not from the toolkit, so the upgrade does not change this section. Its PR re-runs the real-Chrome scripts to confirm.

## 5. Zoom account side

**Nothing has to be switched on for the whiteboard or the breakout rooms**: the live run shows that the account behind the development key already allows both, and step P1 shows the same for Production the moment the teacher sees « Start whiteboard » there. The steps below are a read-only check, so the record does not rest on my run alone. Do not copy any key, secret or token anywhere; I only need what the screen says.

1. Sign in at `zoom.us` with the account that owns the Video SDK key (the one where you created the SDK credentials in October).
2. Left menu: **Admin → Account Management → Account Settings**.
3. Tab **Meeting**, section **In Meeting (Advanced)**: find **Breakout room**. Expected: on.
4. Tab **Whiteboard** (or the section **Zoom Whiteboard**): find the switch that allows the in-meeting whiteboard, the choice of **who can start a whiteboard** (expected: host only) and the **export** option.
5. Tell me, for each, on or off and the exact label you see. If a label is missing, tell me the names of the tabs you do see.

**UNVERIFIED:** the exact labels. Zoom's developer page only says to « verify that the interactive whiteboard is enabled for the current account », and the October rename test showed that Workplace settings do not always reach SDK sessions. That is why the proof of record is the SDK's own answer in the room (`isWhiteboardEnabled()`), which PR A writes to the room log as `whiteboard available=yes|no`.

Not requested: captions, recording, phone, file transfer, reactions. They stay as they are.

## 6. Teacher and learner experience, in French

Vocabulary: **« Tableau blanc »**, **« Groupes »** for breakout rooms, **« salle principale »** for the main session (D10).

| Who | Sees |
| --- | --- |
| Teacher, computer | Audio, vidéo, partage d'écran, discussion, participants, affichage, **Tableau blanc**, **Groupes**, quitter. In the groups window: créer, répartir (automatiquement / manuellement / laisser choisir), minuteur, « Message à tous les groupes », « Fermer tous les groupes ». In the participants panel: couper tous les micros, retirer, mettre en avant |
| Teacher, phone | No whiteboard button (Zoom does not offer it on phones). Teachers teach from a computer |
| Learner, computer | Audio, vidéo, partage d'écran, discussion, participants, affichage. During a whiteboard: the canvas, without export. During groups: « Vous êtes invité à rejoindre le groupe … », « Demander de l'aide », « Revenir à la salle principale » |
| Learner, phone | Audio, vidéo, discussion, participants. During a whiteboard: a live picture of it and, above the room, « Le tableau blanc s’affiche en lecture seule sur cet appareil. Pour écrire au tableau, utilisez un ordinateur. » Groups as on a computer |

- **When the read-only line shows (N6):** while a whiteboard is open **and** Zoom reports that this participant cannot open the canvas, that is `isWhiteboardEnabled()` false on the SDK client. It is not keyed on screen width: a tablet, a two-core laptop and a phone all get it, a narrow desktop window does not. The whiteboard's start and stop come from the toolkit's documented `whiteboard-status-change` and `peer-whiteboard-state-change` events. The capability is read from the SDK client the toolkit exposes as `window.zmClient` (undocumented; already used by the repository's real-Zoom scripts); when that is missing the room falls back to Zoom's own rule read in the bundle (Android or iOS browser, or two cores or fewer). Both branches are unit-tested and both are on PR C's re-read list.

- On the lesson list for families ([FamilyLessons.jsx](../../../src/components/online/FamilyLessons.jsx)), one standing line: « Conseil : pour les activités au tableau blanc, un ordinateur est préférable. Sur téléphone ou tablette, le tableau s’affiche en lecture seule. »
- The whiteboard's own tools are drawn by Zoom's whiteboard program, which was already in French in the run (« Exporter au format PNG », « Collaborateurs », « Annuler », « Rétablir »). The toolkit's strings around it are ours to translate: `whiteboard.*` (29), `subsession.*` (174, or 177 after the upgrade), and the `share.*` lines that mention the whiteboard, already translated.
- **Teacher guide (N7).** `/helpdesk` is for operations staff only (`canViewHelp` in [roleAccess.mjs](../../../src/lib/roleAccess.mjs)); a teacher cannot open it. The simplest place a teacher can read is the page they already open before every lesson: a collapsed « Guide de la salle » block on `/teacher-portal/online`, static French text, no new route and no permission change. Content: start a whiteboard and export it before closing; open groups, **always with a timer, and visit each group** (D4); **leave learners who are on a phone in the main room** when a group fails for them (D11); share a Chrome tab with its sound; what a phone sees; never give away the host role; a retry after a drop lands in the main room. It ships with PR B; the whiteboard paragraph ships with PR A.

## 7. Risk tier and PR split

The outcome is one: "a real classroom". Its parts have different tiers and land in this order. There is no separate PR to hide the broken whiteboard button (D1): PR A fixes it, and PR B is not merged before PR A, so I see no safety reason to hide the button for PR B alone.

| PR | Content | Tier | Why |
| --- | --- | --- | --- |
| **A — whiteboard that works** | After step P1. Room CSP additions (D2); `whiteboard: { enable: true, enableExport: true, enableViewerUserExport: false }` (D3); French `whiteboard.*`; the read-only line; `csp blocked` and `whiteboard available` trace lines; header and unit tests, including the test that the toolkit still reads the whiteboard key; **the whiteboard half of `scripts/test-online-zoom-classroom.mjs`, run under the exact shipped headers before merge**; the whiteboard paragraph of the teacher guide; ADR-008 amendment | **3** | Security header of the room path (OL-r6 A6/A7) |
| **B — groups** | After PR A is merged. `subsession: { enable: true }`; French `subsession.*`; « Quitter le cours » with confirmation; trace reset on a move; fake-toolkit tests; **the groups half of the classroom script, driving the toolkit's own groups window, run before merge**; teacher guide | 2, client only | Shared room logic; no header, server or database change |
| **Production test** | The owner's script below, on the deployment that contains A and B | Operator step | Needs its own go-ahead |
| **C — toolkit 2.6.10-1** | Pin, lockfile, media library version, 10 strings, re-read facts, real-Chrome scripts, a second short Production test | 2 | Dependency that carries the media path |
| **D — « Lever la main »** | Our own button and a teacher-side list through the SDK's command channel | 2, own short design note first | New client surface; **UNVERIFIED** design |

Each PR: full CI (source changes), a fresh independent review of the exact head for Tier 2 and Tier 3, owner approval to merge. PR A also needs this plan approved first.

### Tests

**Unit ([test-online-room-unit.mjs](../../../scripts/test-online-room-unit.mjs), [test-online-headers.mjs](../../../scripts/test-online-headers.mjs)):**

- `FEATURES` has an explicit `whiteboard` key with the three values (PR A), and `subsession.enable` true (PR B).
- **The toolkit still reads the key (N4):** the installed bundle's default configuration still contains `whiteboard: { enable, enableExport, enableViewerUserExport }` and its code still reads `featuresOptions?.whiteboard?.enable` and the two export options. The key is undocumented, so this test is what tells us if an upgrade drops or renames it.
- Every reachable toolkit key has a French value; `whiteboard.` and `subsession.` are no longer in the unreachable list; no French value is left equal to the English one except an agreed list.
- Session: `Reconnecting` with `join breakout room`, `move to breakout room`, `back to main session` **and with a reason the code has never seen**, then `Connected`, never calls `onLeft`, `onError` or `onClosing`, never starts the join timer, and clears the participant list; `Closed` still leaves; `Fail` still shows the error card. No behaviour depends on the reason text.
- Read-only line: shown when a whiteboard is open and the capability is false; not shown when the capability is true, whatever the window width; the fallback rule is used only when the SDK client is not exposed.
- Trace: a `securitypolicyviolation` event becomes one line with directive and host only; a blocked URL's path and query never appear.
- Headers: the room path's `script-src` and `style-src` contain exactly one whiteboard source, the approved one, and no `*.zoom.us`; `connect-src` contains `blob:`; `script-src` does **not** contain `blob:`; `worker-src` is unchanged from today, compared with the value on `main` (it still contains its existing `blob:` and `https://source.zoom.us`, and nothing is added); none of `script-src`, `style-src` and `worker-src` contains a wildcard; the catch-all policy is byte-for-byte unchanged.

**Browser, fake toolkit, CI ([test-online-room-lifecycle-browser.mjs](../../../scripts/test-online-room-lifecycle-browser.mjs)):** the moves above leave the phase at `in_room`; « Quitter le cours » asks for confirmation whenever the participant is in the room, in a group or not; cancelling keeps the room; confirming navigates; the read-only line follows the capability, not the width.

**Real Zoom, local only, installed Chrome: new `scripts/test-online-zoom-classroom.mjs`.** Teacher, desktop learner and a phone-shaped participant. It serves the room with **the headers exactly as `next.config.mjs` ships them and has no option to widen them**; a diagnosis needs a separate throw-away script. Its report is attached to the PR and names the head it ran on. A failure of any assertion blocks the merge.

*Whiteboard half, in PR A, before PR A merges (B1):*

1. Zero `securitypolicyviolation` events for all three participants over the whole run.
2. The teacher starts the whiteboard through the toolkit's own button; it reaches « in progress » for the teacher and the desktop learner.
3. **A real stroke by the teacher:** a pointer drag on the canvas; the whiteboard's undo control becomes available to the teacher, and the learner's canvas changes (pixel comparison of the canvas area before and after).
4. **A real stroke by the desktop learner** (D3): the same, the other way round; the teacher's canvas changes.
5. The phone-shaped participant reports `isWhiteboardEnabled()` false, receives the whiteboard as a share stream, has no drawing tools and shows the read-only line.
6. The teacher's PDF export resolves; the learner has no export control.
7. Stop: everyone is back on the camera view; the connection never left `Connected`.

*Groups half, in PR B, before PR B merges (B2).* Every step is done by clicking the **toolkit's own groups window and dialogs**, never by calling the SDK:

1. The teacher creates two groups, assigns the two learners manually, opens them with a timer.
2. Each learner accepts the toolkit's invitation and arrives; the teacher sends a broadcast message and both receive it.
3. A learner asks for help; the teacher gets the dialog and joins that group, then returns.
4. **A learner leaves the group through the toolkit's own leave control.** With « allow participants to return to the main session » **on**: the learner is back in the main room. With it **off** (second pass of the whole sequence): whatever the toolkit offers, one tap does not take the learner out of the lesson.
5. The teacher closes all groups; after the countdown both learners are in the main room.
6. Asserted for both passes and both learners at every step: the page phase is `in_room`, the address is still the room, `onLeft` was never called, the connection states are only `Reconnecting` and `Connected`, and after each return the toolbar has the same controls as before the move.

This makes S3 a pre-merge fact, not something first seen in your Production test. The existing two-party and lifecycle scripts are re-run unchanged with each PR.

### Production test script for the owner

Needs: the deployment with PR A and PR B; one test lesson; **teacher on a laptop in Chrome**, **learner 1 on a laptop in Chrome**, **learner 2 on an iPhone (Safari)**, **learner 3 on an Android phone (Chrome)**. On both laptops open the console (F12) and keep it open. Write down the start time.

| # | Do | Expect |
| --- | --- | --- |
| 1 | All four join with sound and camera | Four tiles everywhere; no « Reconnexion » |
| 2 | Teacher: **Tableau blanc**, draw a word and a shape | Opens within 10 s; no « Whiteboard Error » |
| 3 | Learner laptop: look, then draw one line | Sees the teacher's drawing live; their line appears for the teacher |
| 4 | Both phones: look | A live picture of the board and the line « … lecture seule sur cet appareil … »; no drawing tools |
| 5 | Teacher: export as PDF, then stop the whiteboard | A PDF downloads; everybody is back on the camera view |
| 6 | Teacher: **Groupes**, 2 groups, automatic, timer 2 minutes, open | Each learner sees the invitation and arrives in a group within 15 s; **nobody lands on the portal** |
| 7 | In a group: talk; learner laptop presses « Demander de l'aide » | Sound and camera work inside the group; the teacher gets the request and can join that group |
| 8 | Teacher: « Message à tous les groupes » : `Encore une minute` | Shown in both groups |
| 9 | Wait for the timer | Countdown, then everybody is back in the main room with a complete toolbar; again nobody on the portal |
| 10 | A learner in a group (repeat 6 if needed) taps the toolkit's leave control once, then « Quitter le cours » at the top once and cancels | The first offers « Revenir à la salle principale »; the second asks « Quitter le cours ? » (it asks in the main room too); the learner is still in the lesson |
| 11 | Raise hand | Not there yet (PR D): learners write in the chat |
| 12 | Teacher: share a **Chrome tab** playing a short English audio or video, tick the audio box | All three learners hear the sound and see the tab |
| 13 | Teacher: annotate the shared tab | The marks appear for learners |
| 14 | Everyone stays 5 minutes without touching anything | No « Reconnexion », no flicker, sound continuous |
| 15 | Teacher ends the lesson for all | Learners return to their portal |
| 16 | Teacher enters attendance for the lesson, then open the roster | The three learners are listed once each; attendance saved; joined times are the first arrival |
| 17 | **Added 2026-11-16 (review B4).** A learner on a **computer with two processor cores** (an old or entry-level laptop; in Chrome, F12 then type `navigator.hardwareConcurrency` in the console: it answers 2), while the whiteboard is open | A live picture of the board and the line « … lecture seule sur cet appareil … », like a phone; the console has `[online room] … whiteboard available=no`. If no such computer is at hand, write « not tested »: it stays UNVERIFIED and is not a pass |
| 18 | **Added 2026-11-16 (review B4).** On both laptops, at the end, before closing the page: in the console, type `Content Security Policy` in the filter box and copy **every red line** it shows, whatever it starts with (not only the `[online room]` lines), together with the address at the right of each line | Only the one expected refusal: `script-src`, `eval`, from an address under `us04st1.zoom.us/web_client_whiteboard/`. Any other red line is a fail, including a `blob:` line and a line whose address at the right starts with `blob:` (raised inside a worker) |
| 19 | **Added 2026-11-16 (review B4).** If the three `blob:` lines of 2026-11-15 appear again: repeat rows 1–5 once in a Chrome **guest window** (no extensions) and compare | Tells an extension of the browser from the room itself. Lines that disappear in the guest window come from the browser; lines that stay are a fail and stop the real lessons with a whiteboard (S7) |

Send back: a pass or fail per row, the two laptops' console lines that start with `[online room]`, **every red console line that mentions « Content Security Policy » (row 18)**, and a screenshot of anything unexpected. A line containing `ChunkLoadError` or `WMSC` is a fail even if the screen looked fine. A line containing `csp blocked` is a fail **unless it ends with `expected=whiteboard-eval-probe`** (the one refusal named by the owner on 2026-11-16: `script-src`, `eval`, from the approved whiteboard address); the same words from any other address, or without that ending, are a fail.

## 8. Cost

- Zoom's developer pricing page says « The Zoom Video SDK is billed on a minutes usage basis ». The unit used in the pilot plan (T-P6) is the participant-minute. The page read today states no rate and no free allowance, and Zoom's billing page returned 404, so **the rate is UNVERIFIED here**; the figure is the one in your Zoom account.
- **Whiteboard, breakout rooms, screen share with sound, annotation, chat, mute, spotlight, views:** no separate charge is stated anywhere in the pages read, and none of them is marked as needing a paid plan. A participant in a group is still one participant for the same minutes. **UNVERIFIED:** that Zoom meters a group as part of the same session and not as extra sessions. The Production test settles it: about 4 people × the lesson length should appear in the usage report, not more.
- **Marked by Zoom as needing a paid plan:** recording, captions, phone. All stay off, so trial credits now and pay-as-you-go later are consumed exactly as today.
- Owner check after the Production test: in the Zoom account, **Admin → Account Management → Reports → Usage** (or the Video SDK usage page of the developer account), compare the minutes of the test lesson with people × minutes. If it is higher, stop before the first real lesson with groups and tell me the two numbers.

## Scope and non-goals

In: the whiteboard, breakout rooms, their French text, the leave safeguards, the trace lines, the header change, the tests, the teacher guide; then the upgrade and the raise-hand button as separate PRs. Out: recording, captions, chat files, emoji picker, waiting room, virtual backgrounds (until tested), any server, token, webhook, database or attendance change, a per-course switch for groups (see D4), homework and materials (already out of the pilot).

## Security boundaries

1. Only `/online/room/*` changes headers; the catch-all policy is asserted unchanged.
2. `script-src` never gets `blob:`; `script-src`, `style-src` and `worker-src` never get a wildcard or a non-Zoom host; `worker-src` keeps exactly what it has today, `'self' blob: https://source.zoom.us` (its `blob:` comes from the site-wide policy and Zoom's workers need it), and gains nothing; the only new script and style source is the one Production whiteboard source of D2. The emoji picker stays off so no third-party host is contacted.
3. The platform sends Zoom nothing new about a learner. Whiteboard content and group names are typed by participants and go to Zoom; the trace never logs them.
4. Host-only powers (start whiteboard, open groups, mute all, remove) stay decided by Zoom from the signed `role_type`; nothing in the browser can raise a learner's role.
5. Learner export of the whiteboard is off.
6. The teacher data boundary, the join gate, consent for minors, passes and the webhook are untouched.

## Rollout and recovery

Each PR deploys through the normal merge. Recovery is a revert of that PR: PR A's revert restores today's headers (the whiteboard fails again, lessons are unaffected); PR B's revert switches groups off for everyone and is the remedy of S5; PR C's revert restores 2.5.0-1 and its media library. No data to restore in any case. The live switch for online learning is not touched by this plan.

## Expected modules

`src/components/online/ZoomRoom.jsx`, `src/lib/online/zoom-room-session.mjs`, `src/lib/online/zoom-fr-FR.json`, `src/app/(admin)/online/room/[id]/page.jsx`, `src/components/online/FamilyLessons.jsx`, `next.config.mjs` (PR A only), `scripts/lib/zoom-toolkit-resources.mjs`, `scripts/lib/online-room-harness.mjs`, the three test scripts above, a new `scripts/test-online-zoom-classroom.mjs`, `src/app/(admin)/teacher-portal/online/page.jsx` (the guide block), `docs/ai/CURRENT_STATE.md`, `docs/ai/SECURITY_RULES.md` (room header), ADR-008. PR C adds `package.json`, the lockfile, `src/lib/online/zoom-media-chunks.mjs` and `src/lib/online/zoom-room-errors.mjs`.

## Owner decisions required

None is open for this revision.

All answered by the owner (Maroine) on 2026-11-15 with the OCT-r2 revision task, and recorded in [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md#online-classroom-tools--approved-2026-11-15). They answer the questions; the plan itself was approved separately ([approval record](#approval-record)), and no PR, merge or deployment is approved by them.

| # | Question | Owner's answer |
| --- | --- | --- |
| **D1** | Hide the broken « Start whiteboard » button before the fix? | **No separate PR.** Only test lessons use the room until PR A ships; PR A fixes it |
| **D2** | Which whiteboard source does the room header allow? | **The exact Production whiteboard host only**, path-scoped if the browser honours it. **No wildcard and none approved in advance:** if Zoom moves the host, the console line names it and the new exact host needs a fresh owner decision. The A7 rule stays: no `blob:` in `script-src`; no wildcard in `script-src`, `style-src` or `worker-src`; `worker-src` keeps the `blob:` it has today and gains nothing |
| **D3** | May learners on a computer draw and export? | **Draw yes; export off for learners; teacher export on** |
| **D4** | Breakout rooms and children's courses | **Groups on for every course now, with the teacher rule: always a timer, and the teacher visits each group.** To be decided again before the first children's online course is activated ([S6](#stop-conditions)) |
| **D5** | Toolkit upgrade to 2.6.10-1 | **Later, its own PR, after the whiteboard and the groups are proven in Production** |
| **D6** | Raise hand | **Our own button later; chat until then** |
| **D7** | Chat files and the emoji picker | **Stay off** |
| **D8** | Background blur | **Test on a modest laptop later, then decide** |
| **D9** | Recording and captions | **Stay off** |
| **D10** | French word for breakout rooms | **« Groupes »** |
| **D11** | What happens if groups fail for a learner on a real phone (S5)? | **First a teacher rule: learners on a phone stay in the main room and are not assigned to a group. If a phone learner's room still breaks, PR B is reverted (groups off for everyone).** No per-course or per-device switch is built |

**Still to come from the owner:** the Production whiteboard host (step P1); approval of this plan at an exact head after re-review; the D4 decision before any children's online course.


## Stop conditions

- **S1:** step P1 returns a whiteboard host different from the one the development key gets, or under the shipped headers the whiteboard still reports a violation in installed Chrome, or it needs any source other than the one Production whiteboard source of D2 (another Zoom host, a wildcard, a host outside `zoom.us`): stop, report the directive and host, widen nothing without a new owner decision.
- **S2:** share with sound, annotation or drawing is refused by the room headers (for example a script run from a `blob:` URL): stop and report. `blob:` in `script-src`, or a wildcard in `script-src`, `style-src` or `worker-src`, would break the rule the owner kept in D2, so it needs a new owner decision and is not part of this plan. `worker-src` already has `blob:` today and keeps it; that is not a change.
- **S3:** any step of PR B's groups script, in either pass, takes a participant to the portal, calls `onLeft`, lets one tap inside a group leave the lesson, or returns an incomplete toolbar: PR B does not merge. Decided before merge by that script, and checked again on real devices in rows 6–10 of the Production test.
- **S4:** the account's usage report shows more than people × minutes for a lesson with groups: no real lesson with groups until explained.
- **S5:** a real iPhone or Android phone fails row 4, 6 or 9 of the Production test. Row 4 (whiteboard picture): the whiteboard stays on; phone learners keep the camera view and the teacher is told. Rows 6 or 9 (groups): the remedy is the one of D11 and exists today. First the teacher rule, stated in the guide: learners on a phone are left unassigned, which keeps them in the main room (the teacher asks who is on a phone; Zoom does not show it). If a phone learner's room breaks all the same, in the test or in a real lesson, PR B is reverted and groups are off for everyone until fixed. No per-course or per-device switch.
- **S6 — children's online course:** no online course whose audience is children is activated (the pilot plan's course activation step) until the owner has decided D4 again for children and that decision is recorded in OWNER_DECISIONS. Whether any such course exists today was not checked: it would need a Production read, which this plan does not ask for; the stop condition holds either way. **The owner holds this gate:** activating a course is a director or admin action inside the application, not a release step an agent runs, so nothing in the code stops it; the owner does not activate, or let a director or admin activate, a children's online course before recording the new D4 decision.
- **S7 — refusals in Production (added 2026-11-16, review B4):** in the Production test, any Content-Security-Policy refusal other than the named one (`script-src`, `eval`, from an address under the approved whiteboard source) stops real lessons with a whiteboard until it is explained: this covers the three `blob:` lines of 2026-11-15 if they persist in a guest window, a refusal raised inside a worker (its console line has a `blob:` address at the right and may have no `[online room]` line, because the room's listener only sees the page), and the named refusal from any other address. Nothing is widened without a new owner decision.
- **S8 — two-core computer (added 2026-11-16, review B4):** if a two-core computer does not get the picture and the read-only line (row 17), learners on such computers are told to use another device for whiteboard activities until it is fixed; the lesson itself is not affected. Until row 17 has been run on a real two-core computer this behaviour is UNVERIFIED (the automated proof uses a phone-shaped browser, where Zoom applies the same rule).

## IMPLEMENTATION CONTRACT

### Scope

Step P1, then PR A, then PR B, exactly as in [the PR split](#7-risk-tier-and-pr-split), in that order, each on its own branch from current `main`; PR B is not merged before PR A. PR C and PR D only after the Production test passes and the owner says so. Nothing else.

### Prerequisites

This plan approved by the owner at an exact head after re-review (D1–D11 are answered). PR A also needs the Production whiteboard host from step P1, recorded in OWNER_DECISIONS. Read [AGENTS](../../../AGENTS.md), [the pilot plan](online-learning.md) (decisions A6/A7, the room lifecycle record) and the facts in the headers of the modules listed above; re-check each fact in the installed bundle before relying on it.

### Object / module manifest

As in [Expected modules](#expected-modules). No migration. No route. No environment variable. `next.config.mjs` changes only in PR A, only the three additions of [section 4](#4-content-security-policy-and-lazy-chunks) within D2.

### Invariants

1. A breakout move never calls `onLeft`, never navigates, never asks for a new pass.
2. The catch-all Content-Security-Policy and every header outside `/online/room/*` are unchanged.
3. On the room path: no `blob:` in `script-src`; no wildcard in `script-src`, `style-src` or `worker-src`; `worker-src` is byte-for-byte what it is on `main` today (`'self' blob: https://source.zoom.us`); and the only source added to `script-src` and `style-src` is the one Production whiteboard source.
4. The trace prints display labels, connection reasons, directive names and hosts only: never a token, a session or group name, a URL path or whiteboard content.
5. Learners cannot export the whiteboard; recording, captions, phone, invite, chat files and emoji stay off.
6. No French string is added without its key existing in the installed bundle; no reachable key stays in English.

### Acceptance / tests

All tests in [Tests](#tests) pass; for PR A the whiteboard half and for PR B the groups half of the real-Zoom classroom script pass locally in installed Chrome **under the shipped headers, before the merge**, with the report attached to the PR; full CI is green for the exact head; then the owner's Production test, rows 1–16.

### Stop conditions

S1–S6 above, plus the standing ones: any need to touch the join route, the token, the webhook, the database or a header outside the room path stops the work and returns to the owner.

### Docs / status reporting

PR A updates CURRENT_STATE, SECURITY_RULES (room header) and ADR-008 (amendment, with the D2 answer and the host and source form that shipped). PR B updates CURRENT_STATE and adds the teacher guide. Each PR reports under the AGENTS implementation handoff. This plan's revision record below is updated with approvals, PR numbers and the Production test result; planned, merged, deployed and Production-verified stay distinct.

## Implementation record — PR A (whiteboard)

Implemented on branch `feat/online-whiteboard` from `main` `00e9756` on 2026-11-15; a pull request, **not merged, not deployed**, waiting for independent review. Evidence is the real-Zoom script report attached to the pull request and CI on its exact head.

**P1 and S1.** The owner's Production console (2026-11-15 14:43) names `us04st1.zoom.us`; the development key gets `us05st1.zoom.us` (local run of the same day, same build segment `mveoc7k9`). S1 was triggered and decided by the owner: exactly the two path-scoped sources `https://us04st1.zoom.us/web_client_whiteboard/` and `https://us05st1.zoom.us/web_client_whiteboard/` in `script-src` and `style-src` of the room path; never a wildcard; any further host needs a new decision ([OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md#online-classroom-tools--approved-2026-11-15)). The path form is honoured by installed Chrome (the whiteboard loaded with zero refusals), so the exact-host fallback was not used. **The Production source itself has not been exercised:** the pre-merge script runs on the development key; the owner's Production test is its proof.

**The three `blob:` scripts in the owner's console.** Checked before any code, in installed Chrome (headless, fake camera and microphone, development key), with the headers of `main` served unchanged and a report-only copy added only so that refusals inside workers were seen too:

| Run under `main`'s headers | `blob:` refused on `script-src` | Other refusals |
| --- | --- | --- |
| Teacher and learner join, audio and camera, no whiteboard | 0 | 0 |
| The same, then « Start whiteboard » | 0 | the whiteboard script and stylesheet on `us05st1.zoom.us`, for both |
| Three participants (one phone-shaped), audio, camera, a screen share, then « Start whiteboard », Production-mode policy | 0 | the same two |

So the three `blob:` scripts were **not reproduced**: they are not raised by every join in this environment, and starting the whiteboard did not raise them either. In the same runs each participant's page created `blob:` workers (allowed by `worker-src`) and loaded an audio worklet module from a `blob:` URL without any refusal. Under the PR A headers the whiteboard was started, drawn on by teacher and learner, viewed on the phone-shaped participant, exported as PDF and stopped with **zero** refusals, so **the whiteboard does not need `blob:` in `script-src`**; S2 is not triggered and `script-src` has no `blob:`. **What raised the three lines in Production is UNVERIFIED.** Differences from the local runs that could explain them: a real camera and microphone, the owner's own Chrome profile (an extension that injects a `blob:` script is refused by the page's policy and reported against the page), real phones in the session, and the Production build of the page. The room now writes `[online room] … csp blocked directive=… host=blob` for such a refusal, so the next Production test shows whether they still appear and whether anything visibly fails with them.

**Differences from the plan text, each from evidence of the real-Zoom runs:**

1. **The read-only line cannot be keyed on Zoom's events (section 6).** A participant without the canvas receives neither `whiteboard-status-change` nor `peer-whiteboard-state-change`; the whiteboard reaches it as a share stream with exactly the events and participant fields of a screen share. Owner decision, 2026-11-15: the presenter's page sends one fixed marker on the SDK's command channel when its whiteboard opens or closes and again when somebody joins; the receiving page believes it only from the host or a manager. The capability is still `isWhiteboardEnabled()` on `window.zmClient`, with Zoom's device rule as the fallback; nothing is keyed on the window width. New data to Zoom: the fixed texts `eh-whiteboard:open` and `eh-whiteboard:closed`, and since the review of 2026-11-16 `eh-whiteboard:ask` (see below), nothing else.
2. **Learner export (D3).** With the three values of the plan, a learner still has Zoom's own « Exporter au format PNG » link and it downloads a file. The room therefore gives a learner `{ enable: true, enableExport: false, enableViewerUserExport: false }` and the teacher the plan's `{ enable: true, enableExport: true, enableViewerUserExport: false }`; with that, the learner has no export control in the toolkit or in the whiteboard's own menus (asserted by the script).
3. **The script evaluates the Production policy.** `next.config.mjs` adds `'unsafe-eval'` and local hosts outside Production; the classroom script sets `NODE_ENV=production` before reading the configuration, so the header it serves is the one Production sends.

**Not covered by PR A's evidence (UNVERIFIED):** the Production key and `us04st1.zoom.us`; real phones and iPhone Safari; a computer with two cores; image insertion and PNG export by the teacher; what Zoom retains of a whiteboard; the cause of the three `blob:` lines. The teacher's exported file is named after the technical session name unless the teacher types another name in the export dialog.

### Review of 2026-11-16 and what changed

Independent review at head `8108c154…`: **CHANGES REQUIRED** (B1–B4, N1–N5). All addressed on the same branch; evidence is the new report attached to the pull request.

**B1 — Zoom's new whiteboard build and `eval`.** Zoom now serves build `mwfe40q7` (it was `mveoc7k9` the day before) on the same hosts. Under the shipped policy each participant with the canvas gets one refusal: `script-src`, `eval`, from `…/web_client_whiteboard/mwfe40q7/dist/es/pwa-Dj0eFPfC.js`, line 280802. The code there is `try { Function(""); return true } catch { return false }`, guarded by a `jitless` setting: the feature probe of the validation library bundled in Zoom's script; its result is read in one place, where an object parser is either compiled or run as ordinary code. In the eight scripts of the build that were read, two other compile-from-text calls exist (a module-loader shim in the same file and a global-object fallback in the translation file); neither ran in any of the runs, since no second refusal was reported. The owner's conditional decision of 2026-11-16 asked for a comparison before anything else. Runs: installed Chrome, development key, the Production policy, once as shipped and once with `'unsafe-eval'` added to `script-src` **for the diagnosis only**, by a throw-away script that is not in the repository.

| Compared | Eval refused (shipped) | Eval allowed (diagnosis) |
| --- | --- | --- |
| Start (about 5 s), stop | works | same |
| Pen stroke teacher → learner and learner → teacher | seen on the other side | same |
| Undo, redo | canvas and controls change | same |
| Each of the 33 tools of « Tous les outils » picked, then a drag and typed text | 15 change the board with that gesture, 15 do not, 3 could not be clicked | same tool by tool (one cell differed between two runs of the *same* policy: timing) |
| Shapes (two), text, eraser, image inserted by the teacher, undo and redo, targeted | 1,288 / 758 / learner sees text / 386 / 9,216 changed pixels | identical numbers |
| Phone-shaped participant: picture, read-only line | yes | same |
| Teacher's PDF export; learner has no export control | yes; none | same |
| Whiteboard files loaded; errors logged | 99; three kinds, all Zoom's own | same 99; same three |
| Refusals | the `eval` one, per participant with the canvas | none |

**Nothing visible or functional differs, so the first branch of the decision applies:** the refusal is accepted as a named, expected exception (`script-src`, `eval`, source under an approved whiteboard source) and **`'unsafe-eval'` is not added**. The room marks it in its trace (`csp blocked directive=script-src host=eval source=us05st1.zoom.us expected=whiteboard-eval-probe`); the classroom script lets exactly that one through and fails on anything else, and on the same refusal from any other source. **Limits:** one build, one day, the development key; the 15 tools that did nothing with the generic gesture (charts, prototype, diagram, library and similar) were only opened, not used in depth; a sticky note was placed through the tools list, not through its keyboard shortcut. Zoom can change this code again at any time; the script is re-run on the day of any merge decision.

**Two things seen during these runs, neither caused by eval and neither changed here:**

1. The tool « Zoom Canvas » asks for a frame from `https://docs.zoomdev.us`, which the room's `frame-src` refuses (same with eval allowed). That tool does not work in the room; nothing is widened for it. A teacher who picks it produces a `csp blocked directive=frame-src host=docs.zoomdev.us` line, which is a fail under row 18: the Production test does not use that tool, and whether to tell teachers so in the guide is an open point for the owner.
2. Twice, at the join, Zoom's own library host did not answer and the SDK tried a fallback host (`…cloudfront.net/videosdk/2.5.0/lib/js_media.min.js`) that the room's `script-src` refuses; the join button stayed disabled until a reload. This is the behaviour of `main` (PR A does not touch it), it was a network incident on the test machine, and it is recorded here because the new `csp blocked` line makes it visible. Not widened; an item for a later decision if it is ever seen in a real lesson.

**B2 — the stroke step.** The pen is now chosen with the whiteboard's own keyboard shortcut (« p ») after a click on the canvas, not by finding a button; the undo control is found by its accessible name (French, English as a fallback). When the canvas or the undo control is missing, or the stroke does not register, the step fails with a sentence that says which of the three it was and lists the controls the whiteboard offers now.

**B3 and N1 — late join, reload, reconnection.** Cause: the marker the presenter sent on `user-added` left before the newcomer's command channel was connected, so it was never delivered; and a marker that did arrive early could be dropped because its sender was not yet in the newcomer's participant list. Now the newcomer asks (`eh-whiteboard:ask`) when it is connected and again when its command channel reports `Connected`, the presenter answers, a marker from a sender not yet listed waits for that sender, and on `Reconnecting` the line is dropped and asked for again on `Connected`, so a stale line cannot stay. The classroom script has two new steps: a second phone-shaped participant joins while the whiteboard is open, and the first one reloads its page; both must show the line.

**B4.** Rows 17–19 of the Production test and stop conditions S7 and S8: a two-core computer, refusals inside workers, the three `blob:` lines; the owner copies every red console line that mentions « Content Security Policy ».

**N3** PR C's re-read list gains the command channel, the participant fields and Zoom's viewer export behaviour. **N4** the pull request description is rewritten. **N5** « Guide de la salle » now says read-only on a phone, a tablet or a less powerful computer.

## Implementation record — PR B (groups)

Implemented on branch `feat/online-groups` from `main` `b2198bf` (PR A merged as #194) on 2026-11-16; a pull request, **not merged, not deployed**, waiting for independent review. Tier 2, client only, as in the [PR split](#7-risk-tier-and-pr-split): no header, host, chunk, server, token or database change; `next.config.mjs` is untouched and the header suite passes unchanged. Evidence is the real-Zoom script report attached to the pull request and CI on its exact head.

**What it does, as planned:** `subsession: { enable: true }`; the 174 `subsession.*` strings in French with « Groupes » and « salle principale » (D10), and the five strings outside that group that still said « sous-groupe »; « Quitter le cours » at the top of the page, which asks « Quitter le cours ? Vous sortirez de la salle pour tout le cours. » whenever the participant is in the room and reads nothing from Zoom; the participant list emptied and a `room move reason=…` line on every `Reconnecting`; the « Guide de la salle » paragraphs; unit, fake-toolkit and real-Zoom tests. Carried over from the re-review of #194 and from the owner: the presenter answers `eh-whiteboard:ask` at most once per two seconds, with one more answer at the end of a burst (N1); markers from senders not yet listed wait one per sender, so a learner's early marker cannot displace the host's (N2); the guide tells teachers not to use « Zoom Canvas ».

**What the real-Zoom runs found in the toolkit's own groups window (2.5.0-1, installed Chrome, development key, the Production policy), and what was done.** Each was read in the bundle as well; the same code is in the 2.6.10-1 tarball (read, not run).

| # | Found | Consequence | In this PR |
| --- | --- | --- | --- |
| 1 | **The timer of the groups window does not work.** Ticking « Fermer automatiquement les groupes après … » sets only `isTimerAutoEnabled`; Zoom counts down only with `isTimerEnabled`. A value typed in the field is passed to Zoom as a string: the open call times out after 10 s, the toolkit swallows the error and its window says « en cours » while nobody was invited. Compared by calling the SDK directly, diagnosis only: string → timeout (twice); number, box ticked, `isTimerEnabled` false → opened, still open 35 s after a 20 s timer; number with `isTimerEnabled` true → closed at 20 s | The plan's step « open with a timer » and the D4 rule « always a timer » cannot be met through the toolkit as it is | **Owner decision of 2026-11-16 (asked and answered in the implementation session): the room corrects the options on their way to Zoom** ([zoom-groups.mjs](../../../src/lib/online/zoom-groups.mjs)): a typed value is minutes, sent as a number of seconds; the timer is on exactly when the box is ticked; nothing else of the call is touched. Proven by the script: the trace shows `groups open timer=600s` and `timer=120s`, and in the second pass nobody closes the groups, the timer does, 2 minutes after the opening |
| 2 | **With a timer running, the toolkit's leave menu vanishes.** Its menu layer hides itself on every redraw of its button and nothing shows it again; the countdown redraws it every second. The menu (« Quitter le cours », « Revenir à la salle principale », « Terminer le cours ») stayed in the page, invisible and not clickable | A consequence of finding 1 once the timer works: the teacher could not come back from a group or end the lesson with the toolkit's control | One scoped rule in the room's style: once the toolkit has placed that layer, it stays visible until the toolkit removes it ([ZoomRoom.jsx](../../../src/components/online/ZoomRoom.jsx)). Proven by the script: the menu is still visible three seconds after the tap, and the teacher's return goes through it, in both passes |
| 3 | **An assignment made before the opening can be forgotten.** The window keeps it locally and replaces its list by Zoom's (which has no assignment yet) whenever any participant joins, leaves or changes state (microphone, camera). Seen once in the development runs of the script: the groups opened with everybody still in « Participants sans groupe » | The teacher sees it in the window; « Répartir » next to a group, after the opening, goes to Zoom at once and sends the invitation | Not changed in the room. The guide says so; the script does both orders (first pass: assigned, then opened; second pass: opened, then assigned) and records whether the window forgot |
| 4 | **On a phone, the leave control inside a group is an English window that is not in the toolkit's translation table:** « Leave Subsession — Are you sure you want to leave the subsession? » with « To Main » (return to the main room, only when the return is allowed), « Fermer » and « Leave ». **« Leave » leaves the whole lesson.** The main-room version (« Leave Session ») is the same hard-coded English and is in Production today | Section 3, point 3 of this plan (two French choices that cannot be confused) holds on a computer and **not on a phone**. One tap never leaves the lesson (S3 is not triggered: two taps are needed), but a phone learner who wants to leave the group can leave the lesson by mistake | Not changed in the room (the text cannot be reached by the translation file). The guide tells the teacher what the two buttons do. **Owner review point**, with D11 (learners on a phone may be left without a group) |
| 5 | A learner's invitation names the group as Zoom stores it: « Rejoindre Subsession 1 ? » (the teacher's window says « Groupe 1 » for the same group) | One English word unless the teacher renames the group | Not changed |
| 6 | « Compte à rebours avant la fermeture des groupes » has no effect: the toolkit always sends 0 seconds, so « Fermer tous les groupes » and the timer bring everybody back at once | None for safety | Not changed; the guide says « tout de suite » |
| 7 | The toolkit's groups button has no label or tooltip (an icon of four squares) | — | The guide describes the icon |

**What the script asserted, in both passes (return allowed, then not allowed), by clicking the toolkit's own window and dialogs only:** two groups created, the timer set, the learner and the phone assigned by hand, the groups opened; each accepts the invitation and arrives in its own group while the second phone, left without a group, never moves; the message to all groups reaches both; the learner asks for help, the teacher gets the dialog, joins that group and comes back with the toolbar it had; one tap on the toolkit's leave control, on the computer and on the phone, leaves nobody out of the lesson; with the return allowed the second tap brings each back to the main room with the toolbar it had at the invitation; with the return not allowed the toolkit offers no return (computer: « Quitter le cours » only; phone: « Fermer » and « Leave ») and both are still in their group; « Quitter le cours » at the top asks first, inside a group and in the main room, and « Rester dans le cours » keeps the room; the groups end by the teacher's « Fermer tous les groupes » (first pass) and by the timer (second pass); and for every participant at every step the page phase is `in_room`, the address is the room, the room never reports « left », « failed » or « closed », and the connection states are only `Reconnecting` (reasons seen: `join breakout room`, `back to main session`) and `Connected`. **Whiteboard and groups together:** a whiteboard opened in the main room stays open there when the groups open; the phone that goes into a group loses the read-only line (no whiteboard there) and gets it back on its return (it asks, the presenter answers); the phone that stayed keeps it; no line is left after the close. Zero Content-Security-Policy refusals except the named whiteboard one, over the whole run.

**Stop conditions.** S3: not triggered (nobody reached the portal, `onLeft` was never called, no single tap leaves the lesson, toolbars complete after every return). The instruction to stop if groups needed a new host, chunk or header: not triggered (zero refusals; `next.config.mjs` unchanged).

**Not covered by PR B's evidence (UNVERIFIED):** real phones and iPhone Safari (the phone is a phone-shaped Chrome window; finding 4 was seen there and read in the bundle's phone layout); the Production key and account (whether the Production account allows groups is checked in the Production test); automatic assignment and « let participants choose » (the script assigns by hand); voice broadcast; a teacher who visits a group while presenting a whiteboard; a network drop during a move; whether Zoom sends webhook events on a move, and how Zoom meters a group (S4); toolkit 2.6.10-1 live. The corrections of findings 1 and 2 rest on undocumented toolkit behaviour: unit tests read the facts they rest on in the installed bundle and fail when an upgrade changes them, and PR C re-reads them.

## Revision record

- **OCT-r1 (2026-11-15):** first version, from the owner's request after the three-person Production test of 2026-11-15. Proposed; not reviewed; not approved.
- **OCT-r2 (2026-11-15):** independent review of OCT-r1 at head `61451e92c570b85468a9a456242cfc48cb082174`: **CHANGES REQUIRED**, B1–B5 blocking and N1–N8 non-blocking; all applied here, with the owner's answers D1–D11. **B1** the whiteboard half of the real-Zoom script moves into PR A, runs only under the shipped headers and includes real strokes by teacher and learner; the summary no longer suggests the proposed policy was already run. **B2** PR B's script drives the toolkit's own groups window, with return to the main room on and off; S3 is decided before merge. **B3** the probe's credentials are stated; owner step P1 confirms the Production whiteboard host; no pre-approved wildcard. **B4** D1–D10 recorded in OWNER_DECISIONS; S6 ties D4 to activating a children's online course; the unsourced "no children's course has started" claim is removed. **B5** S5 has a remedy that exists today (D11). **N1** the unsourced "recorded after #192" reference is replaced by the D2 rule. **N2** the three paths to the portal are named. **N3** the leave confirmation no longer depends on reason strings. **N4** a test that the toolkit still reads the whiteboard key, also on PR C's list. **N5** path-scoped source first. **N6** the read-only line follows capability, not width. **N7** the teacher guide moves from `/helpdesk` to the teacher's lesson list. **N8** whiteboard retention marked UNVERIFIED with its sources. PR 0 is removed (D1).
- **OCT-r3 (2026-11-15):** re-review of OCT-r2 at head `0f0d83954cb6d4c6518bae922ff8523775ca087e`: **CHANGES REQUIRED**, one blocking finding and four notes; all applied here. **B6** OCT-r2 said `worker-src` has no `blob:`, which is false today and would break Zoom's workers; the rule is now "no `blob:` in `script-src`; no wildcard in `script-src`, `style-src` or `worker-src`", and `worker-src` keeps what it has and gains nothing (section 4, the header test, security boundary 2, S2, invariant 3, the D2 row and OWNER_DECISIONS D2). **Note 1** a P1 host different from the development key's stops PR A under S1. **Note 2** the redirect example is corrected. **Note 3** the owner holds the S6 gate. **Note 4** PR C's re-read list gains the whiteboard key and `window.zmClient`. The owner confirmed D1–D11 as recorded and approved the D2 wording change (2026-11-15). Re-reviewed at head `711d49286bd6462072ebc508ed69eaaeb1adcaa2`: READY FOR FINAL REVIEW, no findings; approved by the owner on 2026-11-15 ([approval record](#approval-record)).

## Approval record

- **Owner approval:** the owner (Maroine) approved OCT-r3 at exact head `711d49286bd6462072ebc508ed69eaaeb1adcaa2` on 2026-11-15 at 14:36 Casablanca time (« approve OCT-r3, merge #193 »), after the independent re-review verdict READY FOR FINAL REVIEW with no findings; PR #193 was squash-merged as `00e9756`. Recorded by the coordinator on PR #194. The approval covers the plan (architecture); each pull request of the plan, its merge, its deployment and the Production test keep their own gates.
