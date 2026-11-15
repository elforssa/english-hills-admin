# Online classroom tools — whiteboard, breakout rooms and the rest of a real class

**Revision OCT-r1, 2026-11-15. PROPOSED — architecture only, not approved, nothing implemented.** Risk tier: **Tier 3** for the outcome (it changes the security header of the room path, an OL-r6 decision); the pull requests inside it are tiered one by one in [PR split](#7-risk-tier-and-pr-split). Baseline: `main` at `ab3cc74` (PR #192 merged). Parent contract: [online learning — pilot architecture](online-learning.md) and [ADR-008](../decisions/ADR-008-online-learning-pilot.md).

# Owner summary

The room passed its three-person test on 2026-11-15. This plan turns it into a classroom. The main finding: **almost every tool you asked for is already inside the Zoom toolkit version we ship; no new provider, no database change and no new Zoom purchase is needed.** Two things are in the way, and one tool does not exist.

- **Why the whiteboard "is not working":** the teacher already has a « Start whiteboard » button today (the toolkit switches it on by default and your Zoom account allows it). Clicking it fails because the room's security header refuses the whiteboard program that Zoom loads from one more Zoom address. Proven in a real Chrome run on 2026-11-15; with three additions to that header the whiteboard opened, the learner on a computer saw it, the phone saw it as a picture, and a PDF export worked.
- **Breakout rooms:** they work with the version we ship and your account allows them. In the same run two learners were moved into two rooms and brought back; **nobody was sent to the portal**, and the room page never left the lesson. They only need switching on, French text and a few safety lines.
- **Raise hand and reactions do not exist in the toolkit** (either version). A small button of our own is possible later.

## What will change

1. The whiteboard works for teachers on a computer; learners on a computer see and use it; learners on a phone see it as a live picture (view only).
2. Breakout rooms (« Groupes ») for group activities: create, assign, timer, message to all groups, ask for help, return.
3. French text for both, and for the messages that already leak in English today.
4. Clearer leave buttons so a learner in a group never leaves the lesson by mistake.
5. Later and separately: the toolkit upgrade to 2.6.10-1, and our own « Lever la main » button.

## What staff/users will be able to do

- **Teacher (computer):** start and stop a whiteboard, export it as PDF; open groups with a timer, send a message to all groups, visit a group, answer a help request, close the groups; mute all, mute one, remove a participant, spotlight a learner; share a screen or a browser tab with its sound; annotate a shared screen; gallery or speaker view.
- **Learner (computer):** see and use the whiteboard; join their group, ask the teacher for help, come back; chat; share their screen when the teacher allows it.
- **Learner (phone):** everything above except drawing on the whiteboard and sharing a screen; the whiteboard arrives as a picture.

## What remains restricted

- Only the teacher (host) starts a whiteboard or opens groups. Learners cannot.
- Recording, captions, phone dial-in, invitations, chat files and the emoji picker stay off.
- No change to who may enter a lesson, to passes, to attendance or to what the teacher sees about a learner.
- Children's groups: breakout rooms put children in a room without the teacher. See decision D4 before the first children's course.

## UI impact

Inside the room only: a whiteboard button and a « Groupes » button for the teacher; group dialogs for learners; « Quitter » at the top of our page becomes « Quitter le cours » and asks for confirmation while the participant is in a group; one line for phone learners while a whiteboard is open: « Le tableau blanc s’affiche en lecture seule sur téléphone. Pour écrire au tableau, utilisez un ordinateur. » No other page changes.

## Database impact

None. No migration, no new table, no change to passes, attendance or join evidence.

## Important security decisions

- **The room path's Content-Security-Policy gets three additions** (room path only, the rest of the site is untouched): scripts and styles from the Zoom whiteboard address `https://us05st1.zoom.us`, and `blob:` for data the page itself created. This amends decisions A6/A7 of the pilot plan, so it is Tier 3 and needs your approval (D2).
- **New data goes to Zoom:** what is drawn or typed on a whiteboard is stored by Zoom's document service for the life of the whiteboard and is not kept after it is closed. The platform still sends Zoom only the display label.
- **Breakout rooms and minors:** a group has no adult in it unless the teacher visits. Chat inside a group is visible only to that group.
- Nothing in this plan touches secrets, the join route, tokens or the webhook.

## Risks / owner review points

1. The whiteboard address belongs to Zoom and can change. With the exact address (recommended) a change breaks only the whiteboard, the lesson continues, and the room log says which address was refused.
2. Real phones were not tested (the run used a phone-shaped Chrome window). iPhone Safari is checked in your Production test.
3. "Share with sound" and annotation were not exercised in the run; they are in your test script, with a stop condition.
4. The toolkit upgrade is not needed for the whiteboard or the groups; it is proposed after both are proven, as its own small PR.
5. The broken whiteboard button is visible to teachers in Production today. D1 hides it at once.

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

**Live probe, 2026-11-15, three runs of about two minutes each.** Installed Chrome (headless), the real toolkit 2.5.0-1, the room component and the room path's real headers through [the room harness](../../../scripts/lib/online-room-harness.mjs), throw-away sessions on the owner's Zoom developer account, no database. Participants: teacher (host, 1280 px), learner (1280 px), "phone" (390 px, touch, Android user agent). Run 1 used the headers as shipped. Runs 2 and 3 were **diagnosis runs with a widened policy** and prove nothing about the shipped policy; they exist to list what the whiteboard needs. The probe script was temporary and is not in the repository; PR B adds a permanent one.

**Not covered:** real phones and iPhone Safari; a ≤ 2-core computer; drawing strokes, inserting an image, PNG export; share with sound; annotation; the toolkit's own subsession window (the probe drove the same SDK client directly); toolkit 2.6.10-1 live; webhook deliveries; billing reports. Each is marked **UNVERIFIED** where it matters and is covered by a test or a stop condition below.

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
| Whiteboard | Yes (undocumented key, on by default) | Same | Must be enabled; **already enabled** (probe) | No canvas; arrives as a share picture « ‹name›'s content » (probe, emulated phone). Same on ≤ 2 cores | Host or manager starts; desktop learners get the canvas with its tools | **Enable now** (PR A). Needs the header change |
| Whiteboard export | PDF and PNG; viewer export is a separate switch | Same | Export can be disabled by the account | No | Teacher; learners only if `enableViewerUserExport` | **Now**: teacher yes, learners no. Content is lost when the whiteboard closes, so the teacher exports first |
| Breakout rooms: create, assign (automatic, manual, learners choose) | Yes (documented flag) | Yes, plus « move failed », « Main Session » and help labels | Must be allowed; **already allowed** (probe). Up to 50 rooms | Yes: moved in and back (probe, emulated) | Host or manager | **Enable now** (PR B) |
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
- `package.json` pin and overrides, lockfile; the npm audit gate.

**Gains:** a « camera interrupted — touch to resume » path (useful on phones), an « unstable network » notice, the subsession fixes above, message deletion. **Risk:** medium. It replaces the media library that #192 stabilised, on the day after it was stabilised; headless Chromium cannot see that class of failure, so the proof is the real-Chrome scripts plus a real lesson on phones.

**Recommendation:** upgrade **after** the whiteboard and the groups are proven in Production on the pinned version, as its own PR with its own Production test. Two moving parts at once would make a failure impossible to attribute.

## 3. Breakout rooms and the room lifecycle

**Observed (runs 2 and 3, both learners):** moving into a group raises `connection-change` `Reconnecting` with reason `join breakout room`, then `Connected`. Coming back raises `Reconnecting` with reason `back to main session`, then `Connected`. `Closed` appeared once, at the very end, with reason `ended by host`. The page's phase stayed `in_room` for the whole run. Each move opens a new web socket to another regional `…rwg.<region>.zoom.us` host and re-posts to `https://zoom.us/wc/lsdk`; both are already allowed.

**Why a learner in a group is never sent to the portal by mistake:**

1. The only code path to the portal is `onLeft`, called from the toolkit's "session closed" callbacks, which the toolkit raises only on the SDK state `Closed`. A move is `Reconnecting` → `Connected`. This is now pinned by tests: a unit test and a fake-toolkit browser test raise `Reconnecting` with each of the three reasons, then `Connected`, and assert that `onLeft` and `onError` were never called and the phase is still `in_room`; the real-Zoom script asserts the same against Zoom.
2. The top-of-page link becomes « Quitter le cours » and, while the participant is in a group, asks « Quitter le cours ? Vous êtes dans un groupe. Pour revenir avec tout le monde, utilisez « Revenir à la salle principale ». ». The state comes from the same `connection-change` reasons, so no new SDK surface is used.
3. The toolkit's own leave control inside a group offers the return to the main room; its French text is written so the two choices cannot be confused: « Revenir à la salle principale » and « Quitter le cours ». **UNVERIFIED:** the exact dialog the toolkit shows a learner; the Production test checks it, and S3 stops the release if a single tap leaves the lesson.

**Everything else that touches the lifecycle:**

| Piece | Effect of a move | Change |
| --- | --- | --- |
| `leaveOnPageUnload`, `pagehide` leave | None. Closing the page in a group leaves Zoom as today | None |
| 30-second `online_check_join` | Unchanged and still wanted: when the lesson window ends, a participant in a group is taken out too | None |
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

- `script-src` and `style-src`: add the whiteboard address. Option A (recommended) the exact host `https://us05st1.zoom.us`; option B `https://*.zoom.us`. See D2.
- `connect-src`: add `blob:`. A `blob:` URL can only be created by a script already running in the page and is same-origin; `media-src` and `worker-src` already allow it. `script-src` does **not** get `blob:`.
- No change to `frame-src`, `worker-src`, `img-src`, `font-src`, the Permissions-Policy or any other path.

**So that the next surprise is visible:** the room listens for `securitypolicyviolation` and writes `[online room] … csp blocked directive=… host=…` (directive and host only). Had this existed, the whiteboard and the #192 loop would each have been one line in a teacher's console.

**Toolkit 2.6.10-1:** same hosts and file names in the bundle and the same three media chunks; the whiteboard address comes from Zoom's server, not from the toolkit, so the upgrade does not change this section. Its PR re-runs the real-Chrome scripts to confirm.

## 5. Zoom account side

**Nothing has to be switched on for the whiteboard or the breakout rooms**: the live run shows the account already allows both. The steps below are a read-only check, so the record does not rest on my run alone. Do not copy any key, secret or token anywhere; I only need what the screen says.

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
| Learner, phone | Audio, vidéo, discussion, participants. During a whiteboard: a live picture of it and, above the room, « Le tableau blanc s’affiche en lecture seule sur téléphone. Pour écrire au tableau, utilisez un ordinateur. » Groups as on a computer |

- On the lesson list for families ([FamilyLessons.jsx](../../../src/components/online/FamilyLessons.jsx)), one standing line: « Conseil : pour les activités au tableau blanc, un ordinateur est préférable. Sur téléphone, le tableau s’affiche en lecture seule. »
- The whiteboard's own tools are drawn by Zoom's whiteboard program, which was already in French in the run (« Exporter au format PNG », « Collaborateurs », « Annuler », « Rétablir »). The toolkit's strings around it are ours to translate: `whiteboard.*` (29), `subsession.*` (174, or 177 after the upgrade), and the `share.*` lines that mention the whiteboard, already translated.
- A one-page teacher guide in French (how to start a whiteboard and export it, open groups with a timer, share a tab with sound, what phones see, never give away the host role) goes with PR B, in the existing help centre.

## 7. Risk tier and PR split

The outcome is one: "a real classroom". Its parts have different tiers and land in this order.

| PR | Content | Tier | Why |
| --- | --- | --- | --- |
| **0 — hide the broken button** | `whiteboard: { enable: false }` in `FEATURES`, one unit assertion | 2, client only | A visible control that always fails, in Production today. Reverted by PR A |
| **A — whiteboard that works** | Room CSP additions; `whiteboard: { enable: true, enableExport: true, enableViewerUserExport: false }`; French `whiteboard.*`; phone line; `csp blocked` and `whiteboard available` trace lines; header and unit tests; ADR-008 amendment | **3** | Security header of the room path (OL-r6 A6/A7) |
| **B — groups** | `subsession: { enable: true }`; French `subsession.*`; « Quitter le cours » with confirmation in a group; trace reset on a move; fake-toolkit and real-Zoom tests; teacher guide | 2, client only | Shared room logic; no header, server or database change |
| **Production test** | The owner's script below, on the deployment that contains A and B | Operator step | Needs its own go-ahead |
| **C — toolkit 2.6.10-1** | Pin, lockfile, media library version, 10 strings, re-read facts, real-Chrome scripts, a second short Production test | 2 | Dependency that carries the media path |
| **D — « Lever la main »** | Our own button and a teacher-side list through the SDK's command channel | 2, own short design note first | New client surface; **UNVERIFIED** design |

Each PR: full CI (source changes), a fresh independent review of the exact head for Tier 2 and Tier 3, owner approval to merge. PR A also needs this plan approved first.

### Tests

**Unit ([test-online-room-unit.mjs](../../../scripts/test-online-room-unit.mjs), [test-online-headers.mjs](../../../scripts/test-online-headers.mjs)):**

- `FEATURES` has an explicit `whiteboard` key with the three values, and `subsession.enable` true.
- Every reachable toolkit key has a French value; `whiteboard.` and `subsession.` are no longer in the unreachable list; no French value is left equal to the English one except an agreed list.
- Session: `Reconnecting` with `join breakout room`, `move to breakout room`, `back to main session`, then `Connected`, never calls `onLeft`, `onError` or `onClosing`, never starts the join timer, and clears the participant list; `Closed` still leaves; `Fail` still shows the error card.
- Trace: a `securitypolicyviolation` event becomes one line with directive and host only; a blocked URL's path and query never appear.
- Headers: the room path's `script-src` and `style-src` contain exactly the approved whiteboard source, `connect-src` contains `blob:`, `script-src` does **not** contain `blob:`, and the catch-all policy is byte-for-byte unchanged.

**Browser, fake toolkit, CI ([test-online-room-lifecycle-browser.mjs](../../../scripts/test-online-room-lifecycle-browser.mjs)):** the same three moves leave the phase at `in_room`; « Quitter le cours » asks for confirmation only while in a group; cancelling keeps the room; the phone line appears only on a narrow screen while a whiteboard is open.

**Real Zoom, local only, installed Chrome (new `scripts/test-online-zoom-classroom.mjs`, the permanent form of the probe):** teacher, desktop learner and emulated phone with the shipped headers. Asserts: no CSP violation; whiteboard reaches « in progress » for the teacher and the desktop learner; the phone receives a share; PDF export resolves; two groups open, both learners move and return with only `Reconnecting` → `Connected`; the toolbar is complete after the return; the phase is `in_room` throughout; `Closed` only when the host ends. The existing two-party and lifecycle scripts are re-run unchanged.

### Production test script for the owner

Needs: the deployment with PR A and PR B; one test lesson; **teacher on a laptop in Chrome**, **learner 1 on a laptop in Chrome**, **learner 2 on an iPhone (Safari)**, **learner 3 on an Android phone (Chrome)**. On both laptops open the console (F12) and keep it open. Write down the start time.

| # | Do | Expect |
| --- | --- | --- |
| 1 | All four join with sound and camera | Four tiles everywhere; no « Reconnexion » |
| 2 | Teacher: **Tableau blanc**, draw a word and a shape | Opens within 10 s; no « Whiteboard Error » |
| 3 | Learner laptop: look, then draw one line | Sees the teacher's drawing live; their line appears for the teacher |
| 4 | Both phones: look | A live picture of the board and the line « … lecture seule sur téléphone … »; no drawing tools |
| 5 | Teacher: export as PDF, then stop the whiteboard | A PDF downloads; everybody is back on the camera view |
| 6 | Teacher: **Groupes**, 2 groups, automatic, timer 2 minutes, open | Each learner sees the invitation and arrives in a group within 15 s; **nobody lands on the portal** |
| 7 | In a group: talk; learner laptop presses « Demander de l'aide » | Sound and camera work inside the group; the teacher gets the request and can join that group |
| 8 | Teacher: « Message à tous les groupes » : `Encore une minute` | Shown in both groups |
| 9 | Wait for the timer | Countdown, then everybody is back in the main room with a complete toolbar; again nobody on the portal |
| 10 | A learner in a group (repeat 6 if needed) taps the toolkit's leave control once, then « Quitter le cours » at the top once and cancels | The first offers « Revenir à la salle principale »; the second asks for confirmation; the learner is still in the lesson |
| 11 | Raise hand | Not there yet (PR D): learners write in the chat |
| 12 | Teacher: share a **Chrome tab** playing a short English audio or video, tick the audio box | All three learners hear the sound and see the tab |
| 13 | Teacher: annotate the shared tab | The marks appear for learners |
| 14 | Everyone stays 5 minutes without touching anything | No « Reconnexion », no flicker, sound continuous |
| 15 | Teacher ends the lesson for all | Learners return to their portal |
| 16 | Teacher enters attendance for the lesson, then open the roster | The three learners are listed once each; attendance saved; joined times are the first arrival |

Send back: a pass or fail per row, the two laptops' console lines that start with `[online room]`, and a screenshot of anything unexpected. A line containing `csp blocked`, `ChunkLoadError` or `WMSC` is a fail even if the screen looked fine.

## 8. Cost

- Zoom's developer pricing page says « The Zoom Video SDK is billed on a minutes usage basis ». The unit used in the pilot plan (T-P6) is the participant-minute. The page read today states no rate and no free allowance, and Zoom's billing page returned 404, so **the rate is UNVERIFIED here**; the figure is the one in your Zoom account.
- **Whiteboard, breakout rooms, screen share with sound, annotation, chat, mute, spotlight, views:** no separate charge is stated anywhere in the pages read, and none of them is marked as needing a paid plan. A participant in a group is still one participant for the same minutes. **UNVERIFIED:** that Zoom meters a group as part of the same session and not as extra sessions. The Production test settles it: about 4 people × the lesson length should appear in the usage report, not more.
- **Marked by Zoom as needing a paid plan:** recording, captions, phone. All stay off, so trial credits now and pay-as-you-go later are consumed exactly as today.
- Owner check after the Production test: in the Zoom account, **Admin → Account Management → Reports → Usage** (or the Video SDK usage page of the developer account), compare the minutes of the test lesson with people × minutes. If it is higher, stop before the first real lesson with groups and tell me the two numbers.

## Scope and non-goals

In: the whiteboard, breakout rooms, their French text, the leave safeguards, the trace lines, the header change, the tests, the teacher guide; then the upgrade and the raise-hand button as separate PRs. Out: recording, captions, chat files, emoji picker, waiting room, virtual backgrounds (until tested), any server, token, webhook, database or attendance change, a per-course switch for groups (see D4), homework and materials (already out of the pilot).

## Security boundaries

1. Only `/online/room/*` changes headers; the catch-all policy is asserted unchanged.
2. `script-src` never gets `blob:` or a non-Zoom host. The emoji picker stays off so no third-party host is contacted.
3. The platform sends Zoom nothing new about a learner. Whiteboard content and group names are typed by participants and go to Zoom; the trace never logs them.
4. Host-only powers (start whiteboard, open groups, mute all, remove) stay decided by Zoom from the signed `role_type`; nothing in the browser can raise a learner's role.
5. Learner export of the whiteboard is off.
6. The teacher data boundary, the join gate, consent for minors, passes and the webhook are untouched.

## Rollout and recovery

Each PR deploys through the normal merge. Recovery is a revert of that PR: PR A's revert restores today's headers (the whiteboard fails again, lessons are unaffected); PR B's revert hides the groups button; PR C's revert restores 2.5.0-1 and its media library. No data to restore in any case. The live switch for online learning is not touched by this plan.

## Expected modules

`src/components/online/ZoomRoom.jsx`, `src/lib/online/zoom-room-session.mjs`, `src/lib/online/zoom-fr-FR.json`, `src/app/(admin)/online/room/[id]/page.jsx`, `src/components/online/FamilyLessons.jsx`, `next.config.mjs` (PR A only), `scripts/lib/zoom-toolkit-resources.mjs`, `scripts/lib/online-room-harness.mjs`, the three test scripts above, a new `scripts/test-online-zoom-classroom.mjs`, the help-centre guide, `docs/ai/CURRENT_STATE.md`, `docs/ai/SECURITY_RULES.md` (room header), ADR-008. PR C adds `package.json`, the lockfile, `src/lib/online/zoom-media-chunks.mjs` and `src/lib/online/zoom-room-errors.mjs`.

## Owner decisions required

| # | Question | Options | Recommendation | Blocks |
| --- | --- | --- | --- | --- |
| **D1** | Hide the broken « Start whiteboard » button now, before the fix? | A: yes, PR 0 today. B: leave it until PR A | **A** | Nothing |
| **D2** | Which whiteboard source does the room header allow? | A: the exact host `https://us05st1.zoom.us`; if Zoom moves it, only the whiteboard breaks and the log names the new host. B: `https://*.zoom.us` for scripts and styles; never breaks, but any Zoom subdomain may serve code to the room | **A**, with B approved in advance as the fallback if the host changes | PR A |
| **D3** | May learners on a computer draw on the whiteboard and export it? | A: draw yes (Zoom's default), export no. B: also export. C: view only for learners, if the account offers it | **A** | PR A |
| **D4** | Breakout rooms for children's courses | A: on for every course, with a written teacher rule (timer always set, the teacher visits every group, groups of three or more where possible). B: adults only, which needs the join route to tell the room the audience: a server change, Tier 3, later | **A now**, because no children's course has started; decide again before the first one | PR B for children only |
| **D5** | Toolkit upgrade to 2.6.10-1 | A: after the whiteboard and groups are proven in Production. B: first | **A** | PR C |
| **D6** | Raise hand | A: our own button later (PR D), chat until then. B: never | **A** | PR D |
| **D7** | Chat files and the emoji picker | A: stay off. B: on | **A** | Nothing |
| **D8** | Background blur | A: test on a modest laptop later, then decide. B: never | **A** | Nothing |
| **D9** | Recording and captions | A: stay off; recording only with its own plan (consent for minors, retention, access). B: plan recording now | **A** | Nothing |
| **D10** | French word for breakout rooms | A: « Groupes ». B: « Salles de groupe » | **A** | PR B |

## Stop conditions

- **S1:** the shipped headers still report a violation for the whiteboard in installed Chrome, or the whiteboard needs a source outside `zoom.us`: stop, report the directive and host, do not widen further without a new decision.
- **S2:** share with sound, annotation or drawing is refused by the room headers (for example a `blob:` script): stop and report; `blob:` in `script-src` is a separate owner decision, as recorded after #192.
- **S3:** any path sends a participant to the portal during a move, or one tap inside a group leaves the lesson: PR B does not merge.
- **S4:** the account's usage report shows more than people × minutes for a lesson with groups: no real lesson with groups until explained.
- **S5:** a real iPhone or Android phone fails rows 4, 6 or 9 of the test: groups or whiteboard stay off for phone learners' courses until fixed.

## IMPLEMENTATION CONTRACT

### Scope

PR 0, PR A and PR B exactly as in [the PR split](#7-risk-tier-and-pr-split), in that order, each on its own branch from current `main`. PR C and PR D only after the Production test passes and the owner says so. Nothing else.

### Prerequisites

This plan approved by the owner at an exact head, with D1–D10 answered. PR A needs D2 and D3; PR B needs D4 and D10. Read [AGENTS](../../../AGENTS.md), [the pilot plan](online-learning.md) (decisions A6/A7, the room lifecycle record) and the facts in the headers of the modules listed above; re-check each fact in the installed bundle before relying on it.

### Object / module manifest

As in [Expected modules](#expected-modules). No migration. No route. No environment variable. `next.config.mjs` changes only in PR A, only the three additions approved in D2.

### Invariants

1. A breakout move never calls `onLeft`, never navigates, never asks for a new pass.
2. The catch-all Content-Security-Policy and every header outside `/online/room/*` are unchanged.
3. `script-src` on the room path contains no `blob:` and no host outside `zoom.us`.
4. The trace prints display labels, connection reasons, directive names and hosts only: never a token, a session or group name, a URL path or whiteboard content.
5. Learners cannot export the whiteboard; recording, captions, phone, invite, chat files and emoji stay off.
6. No French string is added without its key existing in the installed bundle; no reachable key stays in English.

### Acceptance / tests

All tests in [Tests](#tests) pass; the real-Zoom classroom script passes locally in installed Chrome with the shipped headers and its report is attached to the PR; full CI is green for the exact head; then the owner's Production test, rows 1–16.

### Stop conditions

S1–S5 above, plus the standing ones: any need to touch the join route, the token, the webhook, the database or a header outside the room path stops the work and returns to the owner.

### Docs / status reporting

PR A updates CURRENT_STATE, SECURITY_RULES (room header) and ADR-008 (amendment, with the D2 answer). PR B updates CURRENT_STATE and adds the teacher guide. Each PR reports under the AGENTS implementation handoff. This plan's revision record below is updated with approvals, PR numbers and the Production test result; planned, merged, deployed and Production-verified stay distinct.

## Revision record

- **OCT-r1 (2026-11-15):** first version, from the owner's request after the three-person Production test of 2026-11-15. Proposed; not reviewed; not approved.

## Approval record

None yet.
