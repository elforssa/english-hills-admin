# CRM prospect ownership — « À prendre », « Je m'en occupe », one responsable, WhatsApp link — architecture, revision CPO-r2

**Status: APPROVED FOR IMPLEMENTATION (owner, in chat, 2026-11-27, verbatim « Approved as recommended. Start the single PR. », at plan head `15fad9951beec938f12650cd7bdb0524cedc2d53`; [approval record](#approval-record)). Not implemented yet.** The round is **one client-only PR, Tier 2, no migration**, plus three steps done by the owner or an operator, each with its own approval. Baseline: `origin/main` `a89bac3` (ledger 001–142 per [CURRENT_STATE](../../ai/CURRENT_STATE.md)). Database bodies were read from a clean local replay of migrations 001–141 plus the text of [142](../../../supabase/migrations/142_rwr_follow_ups.sql), which re-creates none of the functions named here. Every Production figure in this plan is the owner's, not measured ([what could not be verified](#what-could-not-be-verified)).

| Revision | Date | Change |
| --- | --- | --- |
| CPO-r1 | 2026-11-27 | First version: three PRs (two Tier 2, one Tier 3 with a migration), « Mon compte » for every staff role. Head `6acec17`. |
| CPO-r2 | 2026-11-27 | Owner instructions of the same day ([record](#owner-instructions-of-2026-11-27)): everything in one client-only PR; « the first exchange takes the prospect » dropped from this round; new prospects with nobody = clearing the existing setting; staff names = a one-time data step, not a screen; WhatsApp link in the panel header and a « WhatsApp » button in the lists; anything needing a migration becomes a [follow-up](#follow-ups-not-in-this-round). |

# Owner summary

## What will change

Today a prospect has two « responsables » (one for the prospect, one for its task), taking a prospect is hidden three taps deep, new Meta and website prospects all go to one account, and the cards do not say who has what. After this round:

- A prospect that nobody has taken sits in one place called **« À prendre »**.
- Anyone on the team takes it with **one button, « Je m'en occupe »**.
- Each prospect shows **one name**: its responsable.
- « Tâches » opens on **« Mes prospects »**: only your own follow-ups.
- In the prospect panel, the **WhatsApp number is a link** that opens WhatsApp.
- Nobody appears as « Équipe accueil » any more, once the names are entered.

All the screen changes are one piece of work with no change to the database. Three short steps are done outside it: clearing the default responsable, entering the staff names, and giving the second partner their own login.

**One thing you asked for does not fit without a database change:** the « WhatsApp » button on Tâches rows and Opportunités cards. Those two lists do not receive the phone number today. As you instructed, it is listed as a follow-up and does not block the PR ([details](#whatsapp)).

## What staff/users will be able to do

The whole workflow, as the receptionist will read it in the guide:

1. Un nouveau prospect arrive dans **« À prendre »**.
2. Vous touchez **« Je m'en occupe »** : il devient le vôtre.
3. **« Mes prospects »** montre vos suivis : en retard, aujourd'hui, demain, à venir, en attente.
4. Le nom du responsable est écrit sur chaque prospect.
5. Pour le passer à un collègue : **« ··· »** → **« Changer de responsable »**.

## What remains restricted

- Nothing new is opened. The three desk roles (direction, administration, accueil) can already see every prospect and change any responsable; that stays exactly so. « Mes prospects » is a filter, not a wall.
- Teachers, parents and students still have no access to the CRM.
- No screen lets anyone edit a name, a role or a login.
- Opening WhatsApp records nothing in the prospect's history, as today. « Tél. » stays plain text.
- The 122 active prospects without a responsable and the 126 actions without one are **not touched**. They simply appear in « À prendre ». Sharing them out is a later step.

## UI impact

- **Tâches:** the two dropdowns (about nine choices each) become three tabs: « Mes prospects », « À prendre », « Toute l'équipe ». The five time tabs stay.
- **Opportunités:** nine view tabs become four (« Tous », « Mes prospects », « À prendre », « Clôturés »). Three views move into « Filtres »; three are removed because « Tâches » or the stage columns already show the same thing. Each card shows the responsable's name.
- **Fiche prospect:** one « Responsable » line, with « Je m'en occupe » when nobody has it; the WhatsApp number becomes a link.
- All new wording is French, and every changed screen is checked at phone width.

## Database impact

**None in this round.** No migration, no new function, no table, no column. The PR uses only what the database already accepts. The only Production data that changes is what you approve separately: the default-responsable setting (cleared by the director in « Paramètres ») and the staff names (one counted data step).

## Important security decisions

- No new permission, role, grant or function. « Je m'en occupe » is the existing, already authorised « change the responsable » command, sent with your own account as the new responsable.
- Two people tapping at the same moment cannot both win: the database locks the prospect and refuses the second request ([race](#the-race-two-people-take-the-same-prospect)).
- The WhatsApp link is built only from a number in international format and opens `wa.me` in a new tab. With no valid number there is no link.
- The lists keep receiving no phone number in this round. Adding it is the follow-up's decision, not this PR's.
- One login per person is itself a security improvement: today the history cannot tell the two partners apart.

## Risks / owner review points

- **This plan changes four earlier decisions of yours**, listed in [Decisions this would change](#decisions-this-would-change). The most recent is OD-6 of 2026-11-21 (new prospects go to a default responsable), which your instruction of today reverses.
- **Without « the first call takes the prospect », taking is a habit.** Someone who calls a prospect from « À prendre » and forgets « Je m'en occupe » leaves it there, and a colleague may call the same parent. In « À prendre » the button is therefore the first, filled button of the row. The automatic version stays available as a follow-up.
- **« À prendre » only works if people look at it.** Its tab in Tâches shows a counter and its late ones stay red.
- **« À prendre » in Opportunités is shown stage by stage**, not as one list, because the one-list version needs a database change ([why](#opportunités-four-tabs)). Tâches shows the one list.
- **The shared login cannot be untangled for the past.** The system recorded one account; no change can say afterwards which partner did what.
- **Entering a name activates an account** for the e-mail-link logic. The data step checks first that each account has already signed in.
- **Five questions remain** with a recommendation each: [Owner decisions](#owner-decisions).

# Owner instructions of 2026-11-27

Given in chat after CPO-r1, recorded here as scope, not yet as approval of the plan:

1. **WhatsApp.** The WhatsApp number in the prospect panel header becomes a link (reusing `phoneLinks().whatsapp`); a small « WhatsApp » button on Tâches rows and Opportunités cards. Only the WhatsApp number or button opens WhatsApp; « Tél. » stays as it is. No link when there is no valid WhatsApp number.
2. **One client-only PR**, Tier 2, no migration.
3. **« The first exchange takes the prospect » is dropped from this round.**
4. **New prospects with nobody** = clearing the existing `crm_reception_default_owner` setting, not new code.
5. **Staff names** = a one-time data step the owner approves, not a new screen.
6. **Anything that needs a migration** is listed separately as a follow-up instead of blocking the PR.
7. **After the owner approves the plan, it is implemented in that single PR without another planning round.**

What instruction 7 does and does not cover is written in the [implementation contract](#implementation-contract).

# Verified current state

## The flow today, end to end

| Step | What happens | Where |
| --- | --- | --- |
| Meta or website prospect arrives | `owner_id` = `crm_security.reception_default_owner()`, or NULL when the setting is empty. Comment in the code: « intake belongs to the director-chosen default owner, or nobody ». | `crm_security.accept_external_submission`, [136](../../../supabase/migrations/136_crm_one_next_action.sql):1350 |
| The setting | `app_config` key `crm_reception_default_owner`; returns NULL when unset, malformed or no longer a staff account. Director-only write. | `reception_default_owner` 136:233; `crm_set_reception_default_owner` 136:244; read by `crm_get_centre_hours` 136:2178 |
| Where the director sets it | « Paramètres » → « Horaires du centre » → « Responsable par défaut des nouveaux prospects (Meta, site) ». **« Aucun (non attribué) » is already an option.** Only named accounts are offered. | [CentreHoursCard.jsx](../../../src/components/crm/CentreHoursCard.jsx):69–75 |
| Manual prospect | `owner_id` = the creator (the screens send no other owner). | `crm_security.command`, branch `create_prospect`, [140](../../../supabase/migrations/140_catalogues.sql):364 |
| Next action | Created with `assigned_to` = the prospect's owner unless the request names another person. No screen names one when it creates an action, so in practice it always follows the owner. | `crm_security.new_task` 136:321; `set_next_action` [139](../../../supabase/migrations/139_people_identity.sql):858 |
| Change the responsable | Command `reassign` with `owner_id`: checks the account is staff, locks the prospect, checks its version, writes « Responsable modifié » in the history, and moves the open action to the new owner (any separate delegation is lost). | `crm_security.command` branch `reassign`; `set_next_action` step D (`_reassign`); wrapper `crm_reassign` [080](../../../supabase/migrations/080_crm_commands_and_followup_engine.sql):533 |
| Delegate one action | `reassign` with `task_id` + `assigned_to`: only that action changes; it lasts until the action is replaced. | `set_next_action` step E (`_delegate`) |
| Who may do it | Any account whose stored role is director, admin or receptionist. No finer rule; capability `canManageCRM` (131) opens the pages. | `crm_security.require_reader` [079](../../../supabase/migrations/079_crm_read_interfaces_and_permissions.sql):10; [roleAccess.mjs](../../../src/lib/roleAccess.mjs):19 |
| Tâches read | Filters on the **action's** assignee (`all`, `me`, `unassigned`, `staff`, `me_or_unassigned`) AND on the **prospect's** owner (`all`, `me`, `unassigned`, `staff`). One row per contact and bucket. **Carries no phone number.** | `crm_get_work_queue` 139:2324 |
| Opportunités read | Nine views; `mine` = owner is me, every status. Separate owner filter (`all`, `me`, `unassigned`, `staff`). **Cards carry no phone number.** | `crm_get_opportunities` [107](../../../supabase/migrations/107_crm_opportunities_workspace_reads.sql):78; `crm_security.opportunity_ids` 139:1804; `opportunity_card` 136:1853 |
| Panel read | Carries `phone`, `phone_e164` and `whatsapp_e164`; the WhatsApp number falls back to the phone number when the contact has no separate one. | `crm_security.operational_card` 136:1878; `crm_get_workspace_detail` 140:1101 |
| Names shown | `profiles.full_name`, or « Équipe accueil » when empty; two accounts with the same name get the role, then « Réf. … », appended. | `crm_security.staff_display_label` [110](../../../supabase/migrations/110_crm_operational_row_staff_labels.sql):7; `crm_list_staff` 110:25 |
| History names | The **current** name of the account that acted, read at display time (not a stored copy). | `crm_get_timeline` 139:2035 |

## Every place ownership is read, written or shown

**Written:** `accept_external_submission` (intake), `command` branches `create_prospect` / `create_manual_lead` (creator) and `reassign` (owner, delegation), `new_task` (assignee copied from the owner), `set_next_action` steps D and E, `crm_set_reception_default_owner` (the setting). Nothing else writes `crm_leads.owner_id` or `crm_tasks.assigned_to`; the D1 data step of 2026-11-23 did not write owners.

**Read by the database:** `crm_get_work_queue`, `crm_get_opportunities` / `opportunity_ids`, `opportunity_card` and `operational_card` (owner and assignee labels on every card and on the panel), `action_json` (136:442), `crm_list_open_tasks` ([111](../../../supabase/migrations/111_crm_rcc_a1_outcome_led_followup.sql):495), `crm_get_admissions_calendar` (the assignee of a visit), `crm_security.result` (136:461, returned after each command), `crm_start_enrollment` (139:2154, refuses an owner who is no longer staff). Indexes `crm_leads_status_owner_idx` and `crm_tasks_open_owner_idx` serve the filters. Marketing, Meta lifecycle and finance read neither column.

**Shown or chosen on screen:**

| Screen | Element | File |
| --- | --- | --- |
| Tâches | dropdown « Responsable de la tâche » (default « Moi + non attribué ») | [WorkQueue.jsx](../../../src/components/crm/WorkQueue.jsx):64, 81, 87 |
| Tâches | dropdown « Responsable du prospect » (default « Toute l'équipe ») | WorkQueue.jsx:87 |
| Tâches | row line « Responsable de la tâche : … · Responsable du prospect : … » | WorkQueue.jsx:99 |
| Tâches | « ··· » → « Réattribuer l'action » | WorkQueue.jsx:100 |
| Tâches | link « À traiter · prospects nécessitant un suivi » (opens an Opportunités view) | WorkQueue.jsx:88 |
| Opportunités | nine view tabs (a dropdown below 1280 px) | [OpportunityFilters.jsx](../../../src/components/crm/OpportunityFilters.jsx):71, 79; [presentation.mjs](../../../src/lib/crm/presentation.mjs):236 |
| Opportunités | « Filtres » → « Responsable » (Tous, Moi, Non attribué, each person) and its chip | OpportunityFilters.jsx:57, 64 |
| Opportunités | card: **no responsable shown**; « ··· » → « Attribuer un responsable » | [OpportunityCard.jsx](../../../src/components/crm/OpportunityCard.jsx):16, 36 |
| Opportunités | desktop table: column « Responsable » | [OpportunitiesList.jsx](../../../src/components/crm/OpportunitiesList.jsx) |
| Fiche prospect | header « Responsable : … » | [LeadDetailSheet.jsx](../../../src/components/crm/LeadDetailSheet.jsx):107 |
| Fiche prospect | « Prochaine action » card: « Responsable de la tâche : … » | [NextActionPanel.jsx](../../../src/components/crm/NextActionPanel.jsx):35 |
| Fiche prospect | « Autres actions » → « Attribuer un responsable », « Réattribuer la prochaine action » | LeadDetailSheet.jsx:115 |
| Dialog | person picker from `crm_list_staff`; no « moi » shortcut | [CrmActionDialog.jsx](../../../src/components/crm/CrmActionDialog.jsx):213–214, 335 |
| Paramètres | default responsable of new prospects | CentreHoursCard.jsx:69–75 |
| Guide Accueil | six passages describe the above | [GuideContent.jsx](../../../src/app/(admin)/helpdesk/GuideContent.jsx):297, 299, 358, 404–406, 1490, 1908 |

## WhatsApp today

| Where | Today | File |
| --- | --- | --- |
| The link builder | `phoneLinks(contact)` returns `https://wa.me/<digits>` only when `whatsapp_e164` is a valid international number, otherwise nothing. Covered by `test-crm-phase4.mjs` and `test-crm-rcc-b1.mjs`. | presentation.mjs:180 |
| Panel header | « Tél. … · WhatsApp … » as **plain text**; « Indisponible » when there is no valid number. Plain text was the RCC-B1 design, checked by `test-ui-foundation-browser.mjs`. | LeadDetailSheet.jsx:108 |
| « Noter un échange », channel WhatsApp | the number **is already a link** to `wa.me`, in a new tab. This is the pattern to reuse. | [ExchangeDialog.jsx](../../../src/components/crm/ExchangeDialog.jsx):103 |
| Tâches rows, Opportunités cards | no number and no link: the two reads do not return one. | `crm_get_work_queue`, `opportunity_card` |

## Your starting points, checked

| You wrote | Verdict |
| --- | --- |
| Ownership exists; `reassign` sets it; the action's assignee follows the owner | **Confirmed.** |
| Taking a prospect is hidden; no « assign to me » | **Confirmed.** Three taps and a list of names. |
| Two « responsables » everywhere; two dropdowns in Tâches; nine views plus a filter in Opportunités; « À traiter » and « Suivi aujourd'hui » overlap Tâches | **Confirmed.** Since migration 137 every active prospect has exactly one action, so those two views list what Tâches lists. |
| Cards do not show the owner | **Confirmed** for cards (board, and the phone list). The desktop table has the column. |
| New Meta/website prospects get the default owner, so they are never unowned | **Confirmed as a setting, not a rule**: the code accepts « Aucun ». |
| Empty name shows « Équipe accueil »; no screen to edit a staff name | **Partly.** The receptionist has « Mon compte » (name, phone). Directors and administrators have no form, and nobody can edit another person's name. |
| Two unnamed accounts, one shared login, about 122 unowned prospects and 126 unassigned actions | **Not verifiable from the repository** (Production). Consistent with the code: before migration 136 new prospects had no owner, and D1 did not back-fill them. |

## What the database rules allow and forbid

| Rule | Effect on this plan |
| --- | --- |
| One open action per active prospect: unique index `crm_tasks_one_open_per_lead`, deferred triggers `crm_next_action_presence` ([137](../../../supabase/migrations/137_crm_one_next_action_enforce.sql):71, 132–134) | **Allows everything here.** Taking a prospect changes who holds the action, never how many there are. It also makes « À prendre » complete: every active prospect is in exactly one person's list or in « À prendre ». |
| Only `set_next_action` writes actions (137; `scripts/test-single-writer.sql`, `scripts/test-crm-task-writers.sql`) | Respected: the PR writes nothing itself; `crm_reassign` already goes through it. |
| Version check and row lock on every command; conflicts are `PT409`, never retried (ADR-009, migration 119) | Gives the [race](#the-race-two-people-take-the-same-prospect) its answer with no new mechanism. |
| Old command wrappers revoked (137); `crm_reassign` kept and granted to `authenticated` | « Je m'en occupe » can use it as it is. |
| Capability list (131, ADR-018): `has_capability` must stay identical to `roleAccess.mjs` (`scripts/test-capability-parity.mjs`) | No capability is added or changed, so the parity test is unaffected. |
| `profiles`: `authenticated` may update only `full_name` and `phone`, and only on its own row | Nobody can enter a colleague's name from a screen. Hence the names data step, run by an operator with your approval. |
| An account counts as « activated » when its name is not blank ([SECURITY_RULES](../../ai/SECURITY_RULES.md), e-mail links plan) | The names data step activates the accounts it names. Correct for people who already sign in; the step checks that first. |

**What the tests cover today.** Owner change moves the action and keeps one action (`test-crm-next-action.sql`, `test-crm-next-action-enforced.sql`); delegation and un-assignment (`test-crm-phase3.sql`); every Tâches filter combination and the default view (`test-crm-work-calendar.sql`, `test-crm-next-action.sql` T10, `test-crm-work-calendar-browser.mjs`); « mine », « unassigned » and « mine AND another owner = 0 » in Opportunités (`test-crm-opportunities.sql`); labels with more than 50 staff and duplicate names (`test-crm-receptionist-ux.sql`, `test-crm-row-staff-labels-browser.mjs`); a stale second tab refused with `PT409` and two parallel requests where one wins (`test-crm-concurrency-local.mjs`); the menus and dialogs (`test-crm-rcc-a1-browser.mjs`, `test-crm-rcc-b1-browser.mjs`, `test-crm-phase4-browser.mjs`, `test-reception-forms-browser.mjs`); the day scripts (`test-reception-day-scripts-browser.mjs`); the WhatsApp link builder and the header text (above). **Not covered:** two people changing the owner of the same prospect at once (only exchanges are raced), and anything about names or accounts.

## Decisions this would change

| Earlier decision | What this plan does to it |
| --- | --- |
| **OD-6 = A** (you, 2026-11-21, [receptionist workflow](receptionist-workflow.md) §4.6): intake prospects go to a default responsable chosen by the direction; back-fill the unowned ones to that person. | **Reversed** to option B (nobody) by your instruction 4 of today. The mechanism is the same setting, cleared. Note: the back-fill half of OD-6 was never run (D1 did not write owners), which is why about 122 are still unowned. |
| **Invariant 10 and the Tâches default** (same plan; [PRODUCT_RULES](../../ai/PRODUCT_RULES.md) « opens on Moi + non attribué »): unassigned work is visible in everyone's default view. | **Changed:** the default becomes « Mes prospects »; unassigned work moves to the next tab, with a counter. See Q1. |
| **RCC-r1 rule 10** (2026-10-07, [completed plan](completed/rcc-r1-receptionist-crm-completion.md)): reassignment stays out of the everyday foreground; the owner line is plain text. Tested by `test-crm-rcc-a1-browser.mjs`. | **Narrowed:** one foreground button, only on a prospect nobody has. Changing an existing responsable stays in « ··· ». See Q2. |
| **Outcome 3** ([completed plan](completed/outcome-3-receptionist-workspace.md); [WORKFLOWS](../../ai/WORKFLOWS.md)): independent assignee and owner filters combined with AND; nine system views. | **Simplified:** one filter in Tâches; four tabs in Opportunités. No server view is deleted. See Q3 and Q4. |
| **RCC-B1 panel header** (2026-10-07, [completed plan](completed/rcc-b1-responsive-opportunities.md)): destinations as plain text, « Tél. {numéro} · WhatsApp {numéro} ». | **Changed for WhatsApp only** by your instruction 1: the number becomes a link. « Tél. » stays plain text. Opening WhatsApp still records nothing. |

**Documents and texts already out of date** (found while reading; corrected in the PR):

- [WORKFLOWS](../../ai/WORKFLOWS.md) still says « default assignee me » and « Owner changes do not silently reassign tasks ». Since migration 136 the default is « Moi + non attribué » and an owner change does move the action.
- The dialog « Attribuer un responsable » still says « Les responsables des actions déjà prévues restent inchangés » (CrmActionDialog.jsx:335). That has been false since 136.
- A comment in LeadDetailSheet.jsx says the history shows the actor's name « as recorded »; the read returns the account's current name.
- The receptionist workflow plan (§4.7) says the Settings form makes the name required for staff. It does not, and it exists for the receptionist only. Not changed in this round (names are a data step).

# Proposal, evaluated

## New prospects: « À prendre »

In the code, « nobody » and « a default responsable » are the same setting with a different value. Your instruction 4 chooses « nobody ». It is one click by the director (« Paramètres » → « Horaires du centre » → « Responsable par défaut » → « Aucun (non attribué) » → « Enregistrer »), it is undone the same way, and it needs no release. It can be done before or after the PR: until the PR, such prospects appear in everyone's « Moi + non attribué »; after it, in « À prendre ».

Why it is the right choice: with a default account, every untouched prospect carries the same name, so the name on a card says nothing. With « nobody », a name means someone really took it.

## « Je m'en occupe »

**No new database function is needed.** The button sends the existing `crm_reassign` with the prospect's version and your own account as the responsable. The database then does what it does today: lock, version check, history line « Responsable modifié », and the open action moves to you.

It appears only when the prospect has no responsable, in three places: the Tâches row, the Opportunités card, the header of the fiche. In « À prendre » it is the first, filled button of the row. Taking a prospect from a colleague stays a deliberate act in « ··· ».

## The race: two people take the same prospect

Salma and Karim both see the same prospect in « À prendre » and tap within the same second.

1. Both requests carry the version they saw, say 7.
2. The database locks the prospect row. Salma's request is first: version 7 matches, she becomes responsable, the version becomes 8.
3. Karim's request waits for the lock, then finds version 8 ≠ 7 and is refused with `PT409`. Nothing of his is written. The browser never retries a `PT409` (ADR-009).
4. Karim's screen shows « Déjà pris ou modifié. La liste est à jour. » and reloads: the card now reads « Salma ».

Because any change of responsable raises the version, a screen that is out of date can never take a prospect from someone. The same lock already protects two people recording an exchange at once (tested). **To add in the PR:** today the screens refresh after a success only; after this refusal they must refresh too, and one new concurrency test races two takes.

## One visible « Responsable »

The second name is shown **only when it differs**. « Responsable : Salma » on almost every prospect; « Responsable : Salma · action confiée à Karim » on the rare delegated one. In « Mes prospects » the line is omitted when it would only say « vous ».

## Tâches: three tabs

No database change: the three tabs are three of the filter values the read already accepts.

| Tab | What it lists | Existing filter |
| --- | --- | --- |
| « Mes prospects » | actions that are yours: your prospects, plus any action a colleague confided to you | assignee = me |
| « À prendre » | actions that nobody holds | assignee = unassigned |
| « Toute l'équipe » | everything; a person picker narrows it | assignee = all, or one person |

« À prendre » is defined by the **action** having no one, not by the prospect. Otherwise an owned prospect whose action is unassigned (a few exist: 126 actions against 122 prospects) would be in no tab at all. Tapping « Je m'en occupe » on such a row repairs it. Together the first two tabs are exactly today's « Moi + non attribué », split in two. The counter on « À prendre » is one more small read of the same function.

## Opportunités: four tabs

| Today | Verdict | Reason |
| --- | --- | --- |
| Tous les prospects | **keep** as « Tous » | |
| Mes prospects | **keep** | |
| Clôturés | **keep** | |
| — | **add** « À prendre » | see below |
| Nouveaux aujourd'hui | **move** into « Filtres » as « Arrivés aujourd'hui » | useful, not daily |
| Tests de niveau | **move** into « Filtres » | the « Tests de niveau » page already lists them |
| Sans réponse | **move** into « Filtres » | useful for a call-back session |
| À traiter | **remove** | same list as Tâches « En retard » + « Aujourd'hui » |
| Suivi aujourd'hui | **remove** | same list as Tâches « Aujourd'hui » |
| Qualifiés | **remove** | it is the « Qualifié » column, chip and status filter |

« Remove » means removed from the screen; the database keeps the views, so nothing breaks and they can return. An old link to a removed view opens « Tous ».

**« À prendre » in Opportunités, without a migration.** The existing filter « Non attribué » also returns closed and enrolled prospects, and most old ones never had a responsable. So the tab uses that filter but shows **only the four active stages**:

- as a board (computer): the columns « Nouveau » to « Qualifié »; the « Converti » column is not shown under this tab;
- as a list (phone, tablet, or « Liste »): the stage chips « Nouveau », « Contact en cours », « En discussion », « Qualifié », opening on « Nouveau »; no « Tous » chip under this tab.

The numbers shown are the four active counts the read already returns. What this cannot give is one single list across the stages; that needs a small server view and is [follow-up F3](#follow-ups-not-in-this-round). Tâches « À prendre » is that single list.

## The other ownership elements

| Element | Verdict | Reason |
| --- | --- | --- |
| Tâches dropdown « Responsable de la tâche » | **merge** into the three tabs | |
| Tâches dropdown « Responsable du prospect » | **remove** | with one responsable shown, a second filter has no question to answer |
| Tâches person picker | **keep**, only under « Toute l'équipe » | |
| Tâches link « À traiter · prospects nécessitant un suivi » | **remove** | it leads to a removed duplicate view |
| Tâches row « Responsable de la tâche · Responsable du prospect » | **merge** into one name | |
| Tâches « ··· » → « Réattribuer l'action » | **keep**, renamed « Confier cette action à… » | delegation stays possible, out of sight |
| Opportunités « Filtres » → « Responsable » | **keep**, shortened to « Tous » + the names; hidden under « Mes prospects » and « À prendre » | « Moi » and « Non attribué » are now tabs |
| Opportunités card « ··· » → « Attribuer un responsable » | **keep**, renamed « Changer de responsable » | |
| Fiche « Responsable de la tâche » line | **merge**: shown only when it differs | |
| Fiche « Autres actions » → « Attribuer un responsable » | **keep**, renamed « Changer de responsable »; the dialog gets « Moi » first in the list | |
| Fiche « Autres actions » → « Réattribuer la prochaine action » | **keep**, renamed « Confier cette action à… » | |
| Paramètres « Responsable par défaut » | **keep**; cleared in step S1 | the way back if « À prendre » does not suit |

## WhatsApp

**In the PR: the panel header.** « WhatsApp 06 12 34 56 78 » where the number is a link built by `phoneLinks().whatsapp`, opening `wa.me` in a new tab, exactly as « Noter un échange » already does. When there is no valid number the header keeps « WhatsApp Indisponible » with no link. « Tél. … » stays plain text. Nothing is recorded when the link is opened.

One fact to know: when a contact has no separate WhatsApp number, the panel uses the phone number as the WhatsApp number. That is today's rule for the text and becomes the rule for the link.

**Not in the PR: the button on Tâches rows and Opportunités cards.** The two list reads return no phone number, and « no button when there is no valid number » means the screen must know the number before drawing the row. That needs the two reads to return it, which is a migration, so by your instruction 6 it is [follow-up F1](#follow-ups-not-in-this-round).

A client-only version exists and is **not recommended** (Q5): a button on every row that fetches the number when tapped. It would show the button on prospects with no number, answer them with a message, and on phones the browser may block or leave an empty tab because WhatsApp is opened after a wait rather than directly by the tap.

## Names: a one-time data step

By your instruction 5, no screen is added. An operator sets the names, with your approval, as step N1:

- **You give:** for each staff account without a name, the name to show (and, for the shared login, the name of the partner who keeps it; see below).
- **Dry run (read only, its own approval):** the staff accounts with a blank name, as a count and short references, and whether each has already signed in. Nothing personal enters the repository.
- **Apply (your « approve N1 » with the count):** one transaction that sets `profiles.full_name` for exactly those accounts, refuses if the count differs, and touches nothing else. The existing audit trigger records each change.
- **Effect:** every list, card, filter and history line shows the names at once, because names are read when displayed.
- **Revert:** the same step with the previous values (blank).

It does not depend on the PR and can run before it.

## The shared login

Facts that decide it:

- Every history line keeps the account that acted, for ever. Nothing can be lost.
- The **name** shown in the history is the account's current name. Rename the account and every past line shows the new name.
- No change can separate, afterwards, what each partner did under the shared account.

| | A. One partner keeps it | B. Freeze it |
| --- | --- | --- |
| How | The partner whose e-mail it is keeps the account; N1 puts their name on it. The other is invited from the invitation form in « Paramètres » with their own e-mail and types their name when they activate the account. | N1 names it « Ancien compte partagé »; both partners are invited afresh; its prospects are moved; its sign-in is blocked. |
| Past history reads | all under the first partner's name | « Ancien compte partagé » |
| Effort | one invitation, in the application | two invitations, a move of prospects, and a sign-in block that needs Supabase access |
| Leftover | none | a dormant account that still appears in the lists of names |

**Recommendation: A**, on a date you write down. Before that date a line under that name may be either partner; after it, each line is one person. The second partner then takes their own prospects with « Changer de responsable », or in the later sharing-out step.

# Before and after

## Tâches

Before:

```text
Tâches · Mon travail
[Responsable de la tâche ▾ Moi + non attribué]  [Responsable du prospect ▾ Toute l'équipe]
[À traiter · prospects nécessitant un suivi]
Une ligne par contact … Les deux filtres se combinent.
En retard 4 | Aujourd'hui 9 | Demain 3 | À venir 12 | En attente 6

Premier contact                                              En retard
Mme Alaoui                                                   [Nouveau]
Yanis · Anglais enfants
Responsable de la tâche : Non attribuée · Responsable du prospect : Non attribué
[Pas de réponse] [Noter un échange] [Changer] [Voir le prospect] [···]
```

After:

```text
Tâches
[ Mes prospects ]  [ À prendre 122 ]  [ Toute l'équipe ]
En retard 4 | Aujourd'hui 9 | Demain 3 | À venir 12 | En attente 6

— under « À prendre » —
Premier contact                                              En retard
Mme Alaoui                                                   [Nouveau]
Yanis · Anglais enfants
[Je m'en occupe] [Pas de réponse] [Noter un échange] [Changer] [Voir le prospect] [···]

— under « Mes prospects » —
Rappeler                                                     Aujourd'hui
M. Bennani                                            [Contact en cours]
Lina · Anglais ados
[Pas de réponse] [Noter un échange] [Changer] [Voir le prospect] [···]

— under « Toute l'équipe » —  [Toute l'équipe ▾ | Salma | Karim | …]
…
Responsable : Salma · action confiée à Karim
```

## Opportunités

Before:

```text
[Tous les prospects][Mes prospects][Nouveaux aujourd'hui][À traiter][Suivi aujourd'hui]
[Tests de niveau][Qualifiés][Sans réponse][Clôturés]
Filtres : Responsable ▾ (Tous, Moi, Non attribué, + chaque personne) · Canal · Source · Statut

┌ Mme Alaoui                 ··· ┐
│ Yanis · 9 ans                  │
│ En retard · Premier contact    │
│ Meta · Anglais enfants · …     │
└────────────────────────────────┘
```

After:

```text
[Tous] [Mes prospects] [À prendre] [Clôturés]
Filtres : Vue ▾ (Arrivés aujourd'hui, Tests de niveau, Sans réponse)
          Responsable ▾ (Tous, + chaque personne) · Canal · Source · Statut

┌ Mme Alaoui                 ··· ┐     ┌ M. Bennani                 ··· ┐
│ Yanis · 9 ans                  │     │ Lina · 14 ans                  │
│ En retard · Premier contact    │     │ Rappeler · demain 16:00        │
│ Meta · Anglais enfants · …     │     │ Site · Anglais ados · …        │
│ À prendre    [Je m'en occupe]  │     │ Salma                          │
└────────────────────────────────┘     └────────────────────────────────┘

— under « À prendre », as a list —
[Nouveau 118] [Contact en cours 3] [En discussion 1] [Qualifié 0]
```

## Fiche prospect

Before:

```text
Mme Alaoui
[Nouveau]  Responsable : Non attribué
Tél. 06 12 34 56 78 · WhatsApp 06 12 34 56 78            (texte simple)
PROCHAINE ACTION
Premier contact
Responsable de la tâche : Non attribuée
…
[··· Autres actions] → Clôturer le prospect · Attribuer un responsable · Réattribuer la prochaine action
```

After:

```text
Mme Alaoui
[Nouveau]  À prendre  [Je m'en occupe]          (ensuite : Responsable : Salma)
Tél. 06 12 34 56 78 · WhatsApp 06 12 34 56 78            (le numéro WhatsApp est un lien)
PROCHAINE ACTION
Premier contact
…
[··· Autres actions] → Clôturer le prospect · Changer de responsable · Confier cette action à…
```

# Delivery

## The single PR

| | |
| --- | --- |
| **Content** | « Je m'en occupe » in the three places (existing command) and the refresh after a refused take; Tâches three tabs with the « À prendre » counter; Opportunités four tabs, three views moved into « Filtres », three removed from the screen; the responsable's name on every card; one « Responsable » line (second name only when different); the WhatsApp number as a link in the panel header; menu items renamed, « Moi » first in the picker; the wrong texts corrected; the guide, PRODUCT_RULES and WORKFLOWS updated. |
| **Tier** | 2: shared CRM screens, existing authorised commands and reads only. |
| **Migration** | none. If the implementation finds it needs one for any item, that item leaves the PR and joins the follow-ups. |
| **Rollback** | revert the PR. No stored data has a new shape; prospects taken meanwhile stay with whoever took them (ordinary changes of responsable). |

**Tests to add or change:** `test-crm-work-calendar-browser.mjs` (tabs replace the two dropdowns; the « À traiter » link is gone; the counter); `test-crm-row-staff-labels-browser.mjs` (one line, second name only when different); `test-crm-rcc-a1-browser.mjs` (the foreground assertion narrows to « no change of an existing responsable in the foreground »); `test-crm-rcc-b1-browser.mjs` and `test-crm-phase4-browser.mjs` (renamed menu items); `test-crm-opportunities-browser.mjs` (four tabs, the moved views, « À prendre » without « Converti » and without closed prospects, the name on cards); `test-ui-foundation-browser.mjs` (the header: the WhatsApp number is a link to `wa.me`, « Tél. » is not a link, « Indisponible » has no link); `test-reception-forms-browser.mjs` (the renamed dialog entry, the stale case); `test-reception-day-scripts-browser.mjs` (take, then call); `test-crm-concurrency-local.mjs` (two simultaneous takes: one wins, one `PT409`, one history line); the guide's screenshots and texts; every changed screen at 320 and 390 px. The SQL suites need no change.

## Steps outside the PR

| Step | Who | What | Risk | Undo |
| --- | --- | --- | --- | --- |
| **S1 — « À prendre » on** | the director, in « Paramètres » | « Responsable par défaut » → « Aucun (non attribué) ». Any time. | a Production setting, changed in the application | choose the account again; prospects that arrived meanwhile stay in « À prendre » |
| **N1 — staff names** | an operator, after your « approve N1 » | the [data step](#names-a-one-time-data-step) above | Tier 3: Production data, its own dry run and approval | the same step with the previous values |
| **S2 — one login per person** | you, in « Paramètres » | invite the second partner (Q6 option A); N1 names the kept account | accounts | the director can change the invited account's role back |

None of the three waits for the PR, and the PR waits for none of them.

## Follow-ups, not in this round

Each needs its own approval. None blocks the PR.

| # | What | Why it is not in the PR |
| --- | --- | --- |
| **F1** | « WhatsApp » button on Tâches rows and Opportunités cards, shown only when the contact has a valid number. | Needs a migration: the two list reads must return the WhatsApp number (functions only, no stored row changes). Tier 3. It also puts phone numbers into the list data, which they do not carry today; the same three roles already see them in the panel. |
| **F2** | The first recorded call or exchange takes a prospect that nobody has. | Dropped from this round by your instruction 3. Needs a migration that re-creates the CRM command function. Tier 3. |
| **F3** | « À prendre » in Opportunités as one list across the stages. | Needs a small server view. Only worth doing if the stage-by-stage version bothers you. |
| **F4** | Sharing out the existing prospects with no responsable, and the default account's backlog. | A data step with its own plan and counts. |
| **F5** | « Mon compte » for directors and administrators, so a future name change needs no data step. | Client-only, but you asked for no new screen in this round. |
| **F6** | In the lists (cards, Tâches rows), show the programme a form answer names when the prospect has none of its own. | The list reads do not return form answers: a migration. The panel does it in this PR. |
| **F7** | The action names on rows and cards (« Rappel convenu », « À faire par nous (WhatsApp) ») aligned with the new « Changer » wording. | Those names are produced by a database function. |
| **F8** | On cards, hide « Apprenant à préciser » exactly when the contact is the learner. | Cards do not receive the kind of contact: a migration. This PR hides it on adult programmes, and exactly in the panel. |
| **F9** | A « Rendez-vous passés sans résultat » reminder at the top of Tâches. | Listed by the owner on 2026-11-27, not to build now. The rows are already in « En retard »; a complete block needs a small read (a migration), or a client-only version limited to the loaded page. |
| **F10** | Hide prospects whose name starts with « TEST » from the lists and the counts. | Listed by the owner on 2026-11-27, not to build now. Counts are computed by the database: a migration, or a data step that closes them as test data (as D6 did). |
| **F11** | On Tâches rows and cards, replace the bare « En retard » on call attempts with the attempt count and the next try (« 4 appels sans réponse · … »). | Listed by the owner on 2026-11-27, not to build now. The count and the next try are already in the list data (client-only); the time of the last attempt is not (a migration for that part). |
| **F12** | « Clôturer : injoignable » on the Tâches row once it is available. | Listed by the owner on 2026-11-27, not to build now. Client-only: the row carries the status and the failed attempts, and the command exists. |

# Owner decisions

**Already decided by your instructions of today** (recorded in OWNER_DECISIONS when you approve the plan): one client-only PR; no automatic take in this round; new prospects with nobody, by clearing the setting (reverses OD-6); names by a data step; the WhatsApp number as a link in the panel header; implementation starts on approval.

**Still open.** Approving the plan without comment means the recommended answer.

| # | Question | Options | Recommended |
| --- | --- | --- | --- |
| Q1 | Does « Tâches » open on « Mes prospects » only, with unassigned work one tab away (counter shown)? This changes « opens on Moi + non attribué ». | A: yes. B: keep the combined default. | **A** |
| Q2 | May a visible « Je m'en occupe » button appear on prospects nobody has? This narrows the 2026-10-07 rule that reassignment stays in menus. Taking from a colleague stays in « ··· ». | A: yes, unowned only. B: also on colleagues' prospects. | **A** |
| Q3 | One « Responsable » shown, the action's holder only when different; the second Tâches filter removed? | A: yes. B: keep both names. | **A** |
| Q4 | Opportunités: four tabs; « Arrivés aujourd'hui », « Tests de niveau », « Sans réponse » in « Filtres »; « À traiter », « Suivi aujourd'hui », « Qualifiés » removed from the screen? | A: as written. B: move all six into « Filtres », remove none. | **A** |
| Q5 | The « WhatsApp » button in the two lists. | A: follow-up F1, with a small migration, shown only where a number exists. B: now, client-only, on every row, with the drawbacks described under [WhatsApp](#whatsapp). | **A** |
| Q6 | The shared login. | A: one partner keeps it under their name, the other is invited. B: freeze it as « Ancien compte partagé », two new accounts. | **A** |

**Needed from you for N1 and S2 only** (it does not block the PR): which accounts have no name and the name for each; which account is shared, who keeps it, and whether it is the director account.

# Additions after approval (owner, 2026-11-27)

Three further messages from the owner on 2026-11-27, after the approval, all for the same single PR. They add display-only work and conditions for the handoff; they do not change the approved ownership design.

## Ten display clean-ups (same PR, display only)

The owner's rule for these: if one needs a migration or a server change, it becomes a follow-up and does not block the PR. The six quick call-result buttons stay as they are.

| # | Asked | In the PR | Left for a follow-up |
| --- | --- | --- | --- |
| 1 | Programme once in the panel's « Demande » (it appeared five times) and on cards (twice). | « Demande » has one « Programme » line. « Précision » appears only when the typed text says something else. « Arrivé par », « Dernière demande » and the summary's title lose a second part that only repeats the programme (« Meta • Anglais enfants » reads « Meta »). The summary drops the answer that repeats it. Cards and the table: the origin loses the repeated programme. The header's identity line keeps the programme. | — |
| 2 | French labels instead of raw form field names (« program interest », « deplacement centre », « current level »). | A French label for the known field names, and a tidy capitalised label for unknown ones. A label configured in the form mapping is shown as it is. | The lasting fix needs no code: the director can enter question labels in the form mapping (« Réception des leads »). |
| 3 | When the programme is « à préciser » but a form answer names one, show the answer. | In the panel (header and « Demande », marked « réponse au formulaire »). | F6: the lists. |
| 4 | « Tél. / WhatsApp / e-mail » line at normal size. | Done. | — |
| 5 | The panel's action buttons in one row; « Modifier la fiche » and « Ajouter un enfant » inside « Autres actions ». | « Noter un échange », « Changer » and « Autres actions » share one row (on a narrow phone « Autres actions » shows as « ··· »). The menu: « Modifier la fiche », « Ajouter un enfant », « Changer de responsable », « Confier cette action à… », « Clôturer le prospect ». | — |
| 6 | Historique: one line for a new prospect's arrival instead of three system lines. | « Nouveau prospect arrivé », outside « Détails ». A later request and every user action keep their own line. | — |
| 7 | The « Test de niveau » explanation only when a test exists. | Done. | — |
| 8 | « Changer »: clearer wording. | « Rappeler à l'heure convenue », « Rappeler plus tard, sans heure promise », « À faire de notre côté (prix, groupe…) », each with a sentence saying who expects what. | F7: the action names on rows and cards. |
| 9 | Cards: no « Apprenant à préciser » when the learner is the contact. | Hidden on adult programmes; exact in the panel header. | F8: exact on cards. |
| 10 | One page name: « Opportunités ». | Done (the heading « Pipeline admissions » is gone). | — |

Also corrected in passing, because the new screens made them visible: the history titles of three commands that read « Action enregistrée » (« Prospect créé », « Responsable modifié », « Fiche modifiée »).

## Conditions before the handoff

1. Run every existing CRM test suite and report the result; add tests for « Je m'en occupe » (success, and a colleague taking the prospect first), the three Tâches tabs and the WhatsApp link.
2. Give the preview deployment link and a French checklist of at most ten steps for the owner's own check on a computer and a phone.
3. Check every changed screen at phone width (390 px) and say what could not be verified.
4. No database function, migration or command changes in this PR; anything that needs one is a follow-up.
5. Follow-ups to write down, not to build: F9 and F10.
6. Follow-ups to write down, not to build: F11 and F12.
7. A question answered from code and tests, and a one-page guide (below).

## Several children: what the code does (question 7)

**(a) One « Inscrire et encaisser » and one receipt per child.** A receipt, a charge and an enrolment each belong to exactly one learner (`receipts.student_id`, `charges.student_id` and `charges.enrollment_id`; `create_charge_payment` takes one learner). The enrolment command takes one prospect, which is one learner (`crm_enroll_and_collect`, [139](../../../supabase/migrations/139_people_identity.sql)). No screen or function takes one payment and splits it across learners. The discount reason « Fratrie » exists and is entered by hand on each child's enrolment; nothing calculates it. In the tests, day script 4 creates two learners under one contact and checks one Tâches row for the family; day script 2 checks one receipt per learner; **no test enrols siblings together**.

**(b) The steps** are written for the receptionist as scenario C8 of the help guide ([GuideContent.jsx](../../../src/app/(admin)/helpdesk/GuideContent.jsx), « Une mère, ses deux enfants et un cousin »). In short: one prospect per child (« Ajouter un prospect », then « Autres actions » › « Ajouter un enfant »), an appointment with « Avec test de niveau » for each, the result of the appointment and of the test on each file, then three times « Inscrire et encaisser » a week later.

Found while reading, for the owner:

- **The cousin.** The code allows both ways (a third learner under the mother's contact, or his own prospect with his parents as contact). Nothing in the code says which is intended. The guide says: under the mother when she answers and pays for him, otherwise his own prospect. To confirm.
- **A test taken on the spot.** The appointment only offers hours to come, and a result is refused before the test's start time. A walk-in who takes the test immediately is booked on the next slot and the result is entered after that hour. The guide says so. A « test now » path would be a change of rule, not display.
- **Order of the two results.** After « Venu · reviendra » the next action is « En attente du prospect »; entering the test result then does not change it to « Proposer l'inscription ». The guide uses that order, which fits a family that comes back later. The other order is not covered by a test.

# Approval record

**Approved by the owner (Maroine) in chat on 2026-11-27:** « Approved as recommended. Start the single PR. », for revision CPO-r2 at exact head `15fad9951beec938f12650cd7bdb0524cedc2d53` (required CI green on that head). Under instruction 7 this authorises implementing [the single PR](#the-single-pr) and its handoff. It does not authorise merge, deployment, steps S1, N1 or S2, any follow-up, or any Production read or change.

**Answers:** Q1 A (« Tâches » opens on « Mes prospects »); Q2 A (« Je m'en occupe » on prospects nobody has, only); Q3 A (one « Responsable »; the second Tâches filter removed); Q4 A (four tabs; three views in « Filtres »; three removed from the screen); Q5 A (the « WhatsApp » button in the two lists is follow-up F1). OD-6 is reversed to « nobody » by instruction 4.

**Q6, the shared login — the owner's own answer, replacing options A and B:**

- The shared login is a company address that belongs to neither partner. Its role is Admin, it is not the director account, and it is named « English Hills Admin ».
- It is **not renamed**. It stays « English Hills Admin », as a spare login.
- Both partners move to their own existing accounts. The owner changes those two accounts' roles from Apprenant himself, in « Paramètres ».
- The active prospects on the shared account (18, the owner's figure) are handed over by hand later, with « Changer de responsable ».

So step S2 needs no invitation and no new account: it is the owner's role changes. History lines written under the shared account keep showing « English Hills Admin », which is truthful.

**Inputs for N1 (staff names), given with the approval.** No e-mail address is written in the repository; the accounts are identified to the operator by the owner's message.

| Account | Today | N1 |
| --- | --- | --- |
| the director account | no name | « Maroine El Forssa » |
| a partner's own account | « Abderrahim Test » | « Abderrahim Omari » |
| the other partner's own account | already named | no change |
| a second reception account | no name | left as it is: the account is not used |
| the shared login | « English Hills Admin » | no change |

N1 therefore sets **exactly two names**, one of which replaces an existing test name (so the step identifies its two accounts explicitly, not « every blank name »). It still needs its read-only dry run and the owner's « approve N1 » before anything is written. The unused reception account keeps showing « Équipe accueil » wherever it appears in a list of names.

# What could not be verified

- **Every Production number**: 122 active prospects without a responsable, 126 open actions without one, two unnamed accounts, the shared login, the current default account. No Production read was made; they are quoted from you.
- **That Production runs the bodies read here.** They come from a local replay of 001–141 and the text of 142. The PR changes none of them, so the only consequence would be a parameter the live read refuses; the browser suites run against the same migrations.
- **Why 126 and not 122.** The plan assumes a few owned prospects whose action is unassigned (older rows or a delegation to nobody). The « À prendre » definition was chosen so they are visible either way.
- **That the OD-6 back-fill never ran.** Inferred from D1's functions (they do not write owners) and from your 122.
- **How many closed or enrolled prospects have no responsable.** It is why « À prendre » in Opportunités shows active stages only.
- **Whether the two unnamed accounts have already signed in.** N1's dry run answers it.
- **How WhatsApp opens on the receptionist's phone** (the app or the web page). The link is the same one « Noter un échange » already uses.
- **The mock-ups on a real phone.** Nothing was built. The PR checks its screens at 320 and 390 px, the widths the browser suites already use.
- **The test lists.** Drawn from reading the suites, not from running them.

# Scope and non-goals

In scope: the single PR and the three steps above. Not in scope: the follow-ups F1–F5; any migration; any change to who may see or change a prospect; statistics per responsable; notifications; teachers or portals; the marketing, Meta lifecycle or finance paths (none reads ownership); deleting any server view or parameter; blocking or deleting any account; making « Tél. » a link. No ADR is added: [ADR-019](../decisions/ADR-019-one-next-action-per-prospect.md) (the action's assignee is derived from the owner) is unchanged, and the rest is presentation and a setting, recorded in PRODUCT_RULES.

## IMPLEMENTATION CONTRACT

**Scope:** [the single PR](#the-single-pr) at revision CPO-r2, as amended by the owner's answers to Q1–Q6. Client-only, Tier 2, no migration.

**What the owner's approval of this plan authorises (instruction 7):** implementing that PR at once, in one PR, with no further planning round: branch, code, tests, documentation, push, pull request, and the handoff. **What it does not authorise:** merging or deploying the PR; steps S1, N1 and S2; any follow-up; any Production read or change; any migration. Tier 2 keeps its mandatory independent review of the exact PR head before the owner's merge decision ([AGENTS](../../../AGENTS.md#risk-based-lifecycle)); the implementer stops at READY FOR INDEPENDENT REVIEW and does not review its own work.

**Prerequisites:** the owner's approval, recorded with the exact plan head and the answers in this plan and in [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md); a named branch from then-current `main` (from the approved plan head if the plan PR is not merged yet, so the plan and its implementation record travel together).

**Object manifest:** `WorkQueue.jsx`, `CrmWorkspace.jsx`, `OpportunityFilters.jsx`, `OpportunityCard.jsx`, `OpportunitiesBoard.jsx`, `OpportunitiesList.jsx`, `LeadDetailSheet.jsx`, `NextActionPanel.jsx`, `CrmActionDialog.jsx` (texts, « Moi » first), `useCrmCommand.js` (refresh after a conflict), `presentation.mjs` (tabs, labels, removed views mapped to « Tous »), `GuideContent.jsx` and its screenshots, the test scripts listed above, `docs/ai/PRODUCT_RULES.md`, `docs/ai/WORKFLOWS.md`, this plan's implementation record. Database calls: only `crm_reassign`, `crm_get_work_queue`, `crm_get_opportunities`, `crm_list_staff` and `crm_get_workspace_detail`, with values they accept today.

**Invariants:**
- No file under `supabase/`, no new RPC, grant, role or capability. `has_capability` and `roleAccess.mjs` stay identical.
- A take is `crm_reassign` with the prospect's version and the signed-in account as owner, offered only when the prospect has no owner. It never replaces an existing responsable; only « Changer de responsable » does.
- A conflict (`PT409`) is never retried, writes nothing, shows the French message and refreshes the lists.
- « À prendre » in Tâches is `assignee = unassigned`; « Mes prospects » is `assignee = me`; the owner parameter stays `all`. Every open action is therefore in exactly one person's « Mes prospects » or in « À prendre ».
- « À prendre » in Opportunités never shows a closed or enrolled prospect and never shows a total that counts them.
- The WhatsApp link comes only from `phoneLinks().whatsapp`, opens in a new tab with `rel="noopener noreferrer"`, and exists only for a valid number. « Tél. » stays text. Opening it records nothing. The lists receive no phone number.
- Removed views stay accepted by the server; an old URL opens « Tous ».
- French UI strings; « prospect » or « contact », never « parent »; every changed screen works at 320 and 390 px.

**Acceptance:** from « À prendre », one tap makes the prospect appear in « Mes prospects » with the taker's name on its row, card and fiche; two simultaneous takes give one responsable, one refusal and one history line; no screen shows two « responsables » unless they differ; Tâches has three tabs and five time buckets; Opportunités has four tabs and its cards show the responsable; the header's WhatsApp number opens `wa.me` and « Indisponible » opens nothing; all existing suites are green with the changes listed under [Delivery](#delivery).

**Stop conditions:** an item that cannot be done without a migration, a new function or a new grant (move it to the follow-ups and continue with the rest, saying so in the handoff); a read that refuses a parameter this plan relies on; a way for a take to replace an existing responsable; any Meta lifecycle, intake, single-writer or one-action test needing a new expectation.

**Docs and status:** the PR updates PRODUCT_RULES, WORKFLOWS and the guide; CURRENT_STATE after release. Handoff per [AGENTS](../../../AGENTS.md#implementation-handoff). The release follows the rollout template with the owner's separate approval.
