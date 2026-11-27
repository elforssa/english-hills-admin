# CRM prospect ownership — « À prendre », « Je m'en occupe », one responsable — architecture, revision CPO-r1

**Status: PROPOSED (2026-11-27). Not approved. Architecture only: no code, no migration, no Production read or change was made for this plan.** Tier 3 for the outcome (one PR re-creates the CRM command function; two steps change Production settings and accounts); the first two PRs are Tier 2 and need no migration. Baseline: `origin/main` `a89bac3` (ledger 001–142 per [CURRENT_STATE](../../ai/CURRENT_STATE.md)). Database bodies were read from a clean local replay of migrations 001–141 plus the text of [142](../../../supabase/migrations/142_rwr_follow_ups.sql), which re-creates none of the functions named here. Every Production figure in this plan is the owner's, not measured ([what could not be verified](#what-could-not-be-verified)).

# Owner summary

## What will change

Today a prospect has two « responsables » (one for the prospect, one for its task), taking a prospect is hidden three taps deep, new Meta and website prospects all go to one account, and the cards do not say who has what. After this plan:

- A new prospect that nobody has taken yet sits in one place called **« À prendre »**.
- Anyone on the team takes it with **one button, « Je m'en occupe »**, or simply by calling: the first person who records a call or an exchange becomes the responsable.
- Each prospect shows **one name**: its responsable.
- « Tâches » opens on **« Mes prospects »**: only your own follow-ups.
- Nobody appears as « Équipe accueil » any more: each person has their own name and their own login.

It is delivered in three small pieces, plus three short steps that you or the director do in the application, with no programming.

## What staff/users will be able to do

The whole workflow, as the receptionist will read it in the guide:

1. Un nouveau prospect arrive dans **« À prendre »**.
2. Vous l'appelez, ou vous touchez **« Je m'en occupe »** : il devient le vôtre.
3. **« Mes prospects »** montre vos suivis : en retard, aujourd'hui, demain, à venir, en attente.
4. Le nom du responsable est écrit sur chaque prospect.
5. Pour le passer à un collègue : **« ··· »** → **« Changer de responsable »**.

## What remains restricted

- Nothing new is opened. The three desk roles (direction, administration, accueil) can already see every prospect and change any responsable; that stays exactly so. « Mes prospects » is a filter, not a wall.
- Teachers, parents and students still have no access to the CRM.
- A person can change **their own** name only. Nobody edits another person's name, role or login from these screens.
- The 122 active prospects without a responsable and the 126 actions without one are **not touched**. They simply appear in « À prendre ». Sharing them out is a later step with its own plan.

## UI impact

- **Tâches:** the two dropdowns (about nine choices each) become three tabs: « Mes prospects », « À prendre », « Toute l'équipe ». The five time tabs stay.
- **Opportunités:** nine view tabs become four (« Tous », « Mes prospects », « À prendre », « Clôturés »). Three views move into « Filtres »; three are removed because « Tâches » or the stage columns already show the same thing. Each card shows the responsable's name.
- **Fiche prospect:** one « Responsable » line, with « Je m'en occupe » when nobody has it.
- **Paramètres:** « Mon compte » (name, phone) for every member of the team, not only the receptionist.
- All new wording is French, and every screen is checked at phone width.

## Database impact

- **PR 1 and PR 2: none.** They use what the database already does.
- **PR 3: one migration** (provisional number 143). It changes two functions: the CRM command (the first recorded exchange on a prospect with no responsable gives it to the person who recorded it) and the Opportunités read (a real « À prendre » view). No table, no column, no stored row changes.
- **No data step.** No existing prospect or action is rewritten by a release.

## Important security decisions

- No new permission, role, table or public function. « Je m'en occupe » is the existing, already authorised « change the responsable » command, sent with your own account as the new responsable.
- Two people tapping at the same moment cannot both win: the database locks the prospect and refuses the second request ([race](#the-race-two-people-take-the-same-prospect)).
- Names: the database already lets each account change only its own name and phone. No rule is loosened.
- One login per person is itself a security improvement: today the history cannot tell the two partners apart.

## Risks / owner review points

- **This plan reverses three earlier decisions of yours**, listed in [Decisions this would change](#decisions-this-would-change). The most recent is OD-6 of 2026-11-21 (new prospects go to a default responsable). They are flagged, not silently changed.
- **« À prendre » only works if people look at it.** With no default responsable, a new prospect that nobody takes is nobody's. The tab shows a counter, and its late ones stay red, but the habit matters.
- **PR 3 touches the largest CRM function.** It is a four-line change inside it, built on the live body, with a restore script. It is the only high-risk piece, and the workflow already works without it.
- **The shared login cannot be untangled for the past.** The system recorded one account; no change can say afterwards which partner did what.
- **Ten questions need your answer** before implementation: [Owner decisions required](#owner-decisions-required).

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
| Tâches read | Filters on the **action's** assignee (`all`, `me`, `unassigned`, `staff`, `me_or_unassigned`) AND on the **prospect's** owner (`all`, `me`, `unassigned`, `staff`). One row per contact and bucket. | `crm_get_work_queue` 139:2324 |
| Opportunités read | Nine views; `mine` = owner is me, every status. Separate owner filter (`all`, `me`, `unassigned`, `staff`). | `crm_get_opportunities` [107](../../../supabase/migrations/107_crm_opportunities_workspace_reads.sql):78; `crm_security.opportunity_ids` 139:1804 |
| Names shown | `profiles.full_name`, or « Équipe accueil » when empty; two accounts with the same name get the role, then « Réf. … », appended. | `crm_security.staff_display_label` [110](../../../supabase/migrations/110_crm_operational_row_staff_labels.sql):7; `crm_list_staff` 110:25 |
| History names | The **current** name of the account that acted, read at display time (not a stored copy). | `crm_get_timeline` 139:2035 |

## Every place ownership is read, written or shown

**Written:** `accept_external_submission` (intake), `command` branches `create_prospect` / `create_manual_lead` (creator) and `reassign` (owner, delegation), `new_task` (assignee copied from the owner), `set_next_action` steps D and E, `crm_set_reception_default_owner` (the setting). Nothing else writes `crm_leads.owner_id` or `crm_tasks.assigned_to`; the D1 data step of 2026-11-23 did not write owners.

**Read by the database:** `crm_get_work_queue`, `crm_get_opportunities` / `opportunity_ids`, `opportunity_card` and `operational_card` (136:1853, 136:1878; owner and assignee labels on every card and on the panel), `action_json` (136:442), `crm_list_open_tasks` ([111](../../../supabase/migrations/111_crm_rcc_a1_outcome_led_followup.sql):495), `crm_get_admissions_calendar` (the assignee of a visit), `crm_security.result` (136:461, returned after each command), `crm_start_enrollment` (139:2154, refuses an owner who is no longer staff). Indexes `crm_leads_status_owner_idx` and `crm_tasks_open_owner_idx` serve the filters. Marketing, Meta lifecycle and finance read neither column.

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
| Paramètres | « Mon compte » (name, phone): **receptionist only** | [settings/page.jsx](../../../src/app/(admin)/settings/page.jsx):469; [ReceptionistOperations.jsx](../../../src/components/students/ReceptionistOperations.jsx) |
| Guide Accueil | six passages describe the above | [GuideContent.jsx](../../../src/app/(admin)/helpdesk/GuideContent.jsx):297, 299, 358, 404–406, 1490, 1908 |

## Your starting points, checked

| You wrote | Verdict |
| --- | --- |
| Ownership exists; `reassign` sets it; the action's assignee follows the owner | **Confirmed.** |
| Taking a prospect is hidden; no « assign to me » | **Confirmed.** Three taps and a list of names. |
| Two « responsables » everywhere; two dropdowns in Tâches; nine views plus a filter in Opportunités; « À traiter » and « Suivi aujourd'hui » overlap Tâches | **Confirmed.** Since migration 137 every active prospect has exactly one action, so those two views list what Tâches lists. |
| Cards do not show the owner | **Confirmed** for cards (board, and the phone list). The desktop table has the column. |
| New Meta/website prospects get the default owner, so they are never unowned | **Confirmed as a setting, not a rule**: the code accepts « Aucun ». |
| Empty name shows « Équipe accueil »; no screen to edit a staff name | **Partly.** The receptionist has « Mon compte ». Directors and administrators have no form, and nobody can edit another person's name. The form does not require a name. |
| Two unnamed accounts, one shared login, about 122 unowned prospects and 126 unassigned actions | **Not verifiable from the repository** (Production). Consistent with the code: before migration 136 new prospects had no owner, and D1 did not back-fill them. |

## What the database rules allow and forbid

| Rule | Effect on this plan |
| --- | --- |
| One open action per active prospect: unique index `crm_tasks_one_open_per_lead`, deferred triggers `crm_next_action_presence` ([137](../../../supabase/migrations/137_crm_one_next_action_enforce.sql):71, 132–134) | **Allows everything here.** Taking a prospect changes who holds the action, never how many there are. It also makes « À prendre » complete: every active prospect is in exactly one person's list or in « À prendre ». |
| Only `set_next_action` writes actions (137; `scripts/test-single-writer.sql`, `scripts/test-crm-task-writers.sql`) | The automatic take in PR 3 **must** move the action through `set_next_action` (`_reassign`), exactly as `reassign` does. |
| Version check and row lock on every command; conflicts are `PT409`, never retried (ADR-009, migration 119) | Gives the [race](#the-race-two-people-take-the-same-prospect) its answer with no new mechanism. |
| Old command wrappers revoked (137); `crm_reassign` kept and granted to `authenticated` | « Je m'en occupe » can use it as it is. |
| Capability list (131, ADR-018): `has_capability` must stay identical to `roleAccess.mjs` (`scripts/test-capability-parity.mjs`) | No capability is added or changed, so the parity test is unaffected. |
| A new prospect's owner must be a staff account (`assert_staff`) | Unchanged; the actor is staff by definition. |
| `profiles`: `authenticated` may update only `full_name` and `phone`, and only on its own row | « Mon compte » for every staff role needs no database change. Editing someone else's name is impossible without a new function. |
| An account counts as « activated » when its name is not blank ([SECURITY_RULES](../../ai/SECURITY_RULES.md), e-mail links plan) | Saving a name activates an account for the e-mail-link logic. Correct for people who already sign in; a reason not to let one person fill in another's name. |

**What the tests cover today.** Owner change moves the action and keeps one action (`test-crm-next-action.sql`, `test-crm-next-action-enforced.sql`); delegation and un-assignment (`test-crm-phase3.sql`); every Tâches filter combination and the default view (`test-crm-work-calendar.sql`, `test-crm-next-action.sql` T10, `test-crm-work-calendar-browser.mjs`); « mine », « unassigned » and « mine AND another owner = 0 » in Opportunités (`test-crm-opportunities.sql`); labels with more than 50 staff and duplicate names (`test-crm-receptionist-ux.sql`, `test-crm-row-staff-labels-browser.mjs`); a stale second tab refused with `PT409` and two parallel requests where one wins (`test-crm-concurrency-local.mjs`); the menus and dialogs (`test-crm-rcc-a1-browser.mjs`, `test-crm-rcc-b1-browser.mjs`, `test-crm-phase4-browser.mjs`, `test-reception-forms-browser.mjs`); the day scripts (`test-reception-day-scripts-browser.mjs`). **Not covered:** two people changing the owner of the same prospect at once (only exchanges are raced), and anything about names or accounts.

## Decisions this would change

| Earlier decision | What this plan does to it |
| --- | --- |
| **OD-6 = A** (you, 2026-11-21, [receptionist workflow](receptionist-workflow.md) §4.6): intake prospects go to a default responsable chosen by the direction; back-fill the unowned ones to that person. | **Reversed** to option B (unowned). The mechanism is the same setting, set to « Aucun ». Note: the back-fill half of OD-6 was never run (D1 did not write owners), which is why about 122 are still unowned. See Q1. |
| **Invariant 10 and the Tâches default** (same plan; [PRODUCT_RULES](../../ai/PRODUCT_RULES.md) « opens on Moi + non attribué »): unassigned work is visible in everyone's default view. | **Changed:** the default becomes « Mes prospects »; unassigned work moves to the next tab, with a counter. See Q2. |
| **RCC-r1 rule 10** (2026-10-07, [completed plan](completed/rcc-r1-receptionist-crm-completion.md)): reassignment stays out of the everyday foreground; the owner line is plain text. Tested by `test-crm-rcc-a1-browser.mjs`. | **Narrowed:** one foreground button, only on a prospect nobody has. Changing an existing responsable stays in « ··· ». See Q3. |
| **Outcome 3** ([completed plan](completed/outcome-3-receptionist-workspace.md); [WORKFLOWS](../../ai/WORKFLOWS.md)): independent assignee and owner filters combined with AND; nine system views. | **Simplified:** one filter in Tâches; four tabs in Opportunités. No server view is deleted. See Q5 and Q6. |

**Documents and texts already out of date** (found while reading; fixed inside PR 1):

- [WORKFLOWS](../../ai/WORKFLOWS.md) still says « default assignee me » and « Owner changes do not silently reassign tasks ». Since migration 136 the default is « Moi + non attribué » and an owner change does move the action.
- The dialog « Attribuer un responsable » still says « Les responsables des actions déjà prévues restent inchangés » (CrmActionDialog.jsx:335). That has been false since 136.
- The receptionist workflow plan (§4.7) says the Settings form makes the name required for staff. The form has no such check and exists for the receptionist only.
- A comment in LeadDetailSheet.jsx says the history shows the actor's name « as recorded »; the read returns the account's current name.

# Proposal, evaluated

## New prospects: « À prendre » or « receptionist first »?

In the code they are the same thing: one setting, « Responsable par défaut », with a person or « Aucun ». Neither needs programming.

| | « À prendre » (setting = Aucun) | « Receptionist first » (today) |
| --- | --- | --- |
| Who sees a new prospect | all four, in « À prendre » | only the default account, in its own list |
| What the name on the card means | someone really took it | nothing yet: every untouched prospect carries the same name |
| A partner takes one | one tap | « ··· », « Changer de responsable », pick a name |
| Risk | nobody takes it | one list grows; the partners never look |

**Recommendation: « À prendre ».** It is the only one of the two where the name answers « who has this prospect? ». It costs one click in Paramètres and can be undone the same way.

## « Je m'en occupe »

**No new database function is needed.** The button sends the existing `crm_reassign` with the prospect's version and your own account as the responsable. The database then does what it does today: lock, version check, history line « Responsable modifié », and the open action moves to you.

It appears only when the prospect has no responsable, in three places: the Tâches row, the Opportunités card, the header of the fiche. Taking a prospect from a colleague stays a deliberate act in « ··· ».

## The race: two people take the same prospect

Salma and Karim both see the same prospect in « À prendre » and tap within the same second.

1. Both requests carry the version they saw, say 7.
2. The database locks the prospect row. Salma's request is first: version 7 matches, she becomes responsable, the version becomes 8.
3. Karim's request waits for the lock, then finds version 8 ≠ 7 and is refused with `PT409`. Nothing of his is written. The browser never retries a `PT409` (ADR-009).
4. Karim's screen shows « Déjà pris ou modifié. La liste est à jour. » and reloads: the card now reads « Salma ».

Because any change of responsable raises the version, a screen that is out of date can never take a prospect from someone. The same lock already protects two people recording an exchange at once (tested). **To add in PR 2:** today the screens refresh after a success only; after this refusal they must refresh too, and one new concurrency test races two takes.

## The first exchange takes the prospect (PR 3)

**Recommended, including failed calls.** When someone records « Pas de réponse », another call result, a WhatsApp or a conversation on a prospect with no responsable, they become its responsable in the same save. A plain note does not count. Reasons:

- It makes the name truthful without anyone thinking about it. The button becomes the exception.
- If a failed call did not count, the next attempt would stay in « À prendre » and two people would call the same parent.
- It keeps « Pas de réponse » at one tap from the Tâches row.

It is one small addition inside `crm_security.command` (branch `log_exchange`): if the prospect has no owner, set the owner to the actor before the next action is written, add the history line, and let `set_next_action` move the action. It never changes an existing responsable. The cost is touching the largest CRM function, which is why it is alone in a Tier 3 PR and the rest ships first.

## One visible « Responsable »

Recommended as proposed, with one refinement: the second name is shown **only when it differs**. « Responsable : Salma » on almost every prospect; « Responsable : Salma · action confiée à Karim » on the rare delegated one. In « Mes prospects » the line is omitted when it would only say « vous ».

## Tâches: three tabs

Recommended, and it needs no database change, because the three tabs are three of the filter values the read already accepts:

| Tab | What it lists | Existing filter |
| --- | --- | --- |
| « Mes prospects » | actions that are yours: your prospects, plus any action a colleague confided to you | assignee = me |
| « À prendre » | actions that nobody holds | assignee = unassigned |
| « Toute l'équipe » | everything; a person picker narrows it | assignee = all, or one person |

One refinement to your proposal: « À prendre » is defined by the **action** having no one, not by the prospect. Otherwise an owned prospect whose action is unassigned (a few exist: 126 actions against 122 prospects) would be in no tab at all. Tapping « Je m'en occupe » on such a row repairs it. Together the first two tabs are exactly today's « Moi + non attribué », split in two.

## Opportunités: four tabs

Recommended, with a firmer line than « move the rest into Filtres »:

| Today | Verdict | Reason |
| --- | --- | --- |
| Tous les prospects | **keep** as « Tous » | |
| Mes prospects | **keep** | |
| Clôturés | **keep** | |
| — | **add** « À prendre » (PR 3) | see below |
| Nouveaux aujourd'hui | **move** into « Filtres » as « Arrivés aujourd'hui » | useful, not daily |
| Tests de niveau | **move** into « Filtres » | the « Tests de niveau » page already lists them |
| Sans réponse | **move** into « Filtres » | useful for a call-back session |
| À traiter | **remove** | same list as Tâches « En retard » + « Aujourd'hui » |
| Suivi aujourd'hui | **remove** | same list as Tâches « Aujourd'hui » |
| Qualifiés | **remove** | it is the « Qualifié » column, chip and status filter |

« Remove » means removed from the screen; the database keeps the views, so nothing breaks and they can return. An old link to a removed view opens « Tous ».

**Why « À prendre » in Opportunités waits for PR 3.** The existing filter « Non attribué » includes closed and enrolled prospects, and most old ones never had a responsable. A tab built on it would be full of dead files. PR 3 adds a proper view: active prospects with no responsable. Until then « À prendre » lives in Tâches, which lists every one of them anyway.

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
| Paramètres « Responsable par défaut » | **keep**; set to « Aucun » (step S3) | the way back if « À prendre » does not suit |

## Names

**Each person sets their own name; no migration.** « Mon compte » exists, works and is permitted by the database for every account; it is simply not shown to directors and administrators. PR 1 shows it to them (a card at the top of « Paramètres ») and makes the name required.

The director editing other people's names is **not recommended**: the database forbids it today, so it would need a new privileged function, and a name is also what marks an account as activated. Four people each typing their own name once is simpler and safer.

## The shared login

Facts that decide it:

- Every history line keeps the account that acted, for ever. Nothing can be lost.
- The **name** shown in the history is the account's current name. Rename the account and every past line shows the new name.
- No change can separate, afterwards, what each partner did under the shared account.

| | A. One partner keeps it | B. Freeze it |
| --- | --- | --- |
| How | The partner whose e-mail it is keeps the account and puts their own name on it. The other is invited from the invitation form in « Paramètres » with their own e-mail and sets their own name. | Rename it « Ancien compte partagé », invite both partners afresh, move its prospects, then block its sign-in. |
| Past history reads | all under the first partner's name | « Ancien compte partagé » |
| Effort | two minutes, in the application | two invitations, a move of prospects, and a sign-in block that needs Supabase access |
| Leftover | none | a dormant account that still appears in the lists of names |

**Recommendation: A**, on a date you write down. Before that date a line under that name may be either partner; after it, each line is one person. The second partner then takes their own prospects with « Changer de responsable », or in the later sharing-out step. Choose B only if it matters to you that old lines never carry one partner's name for the other's work.

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
[ Mes prospects 14 ]  [ À prendre 122 ]  [ Toute l'équipe ]
En retard 4 | Aujourd'hui 9 | Demain 3 | À venir 12 | En attente 6

— under « À prendre » —
Premier contact                                              En retard
Mme Alaoui                                                   [Nouveau]
Yanis · Anglais enfants
À prendre                                          [Je m'en occupe]
[Pas de réponse] [Noter un échange] [Changer] [Voir le prospect] [···]

— under « Mes prospects » —
Rappeler                                                     Aujourd'hui
M. Bennani                                                   [En contact]
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
[Tous] [Mes prospects] [À prendre 122] [Clôturés]
Filtres : Vue ▾ (Arrivés aujourd'hui, Tests de niveau, Sans réponse)
          Responsable ▾ (Tous, + chaque personne) · Canal · Source · Statut

┌ Mme Alaoui                 ··· ┐     ┌ M. Bennani                 ··· ┐
│ Yanis · 9 ans                  │     │ Lina · 14 ans                  │
│ En retard · Premier contact    │     │ Rappeler · demain 16:00        │
│ Meta · Anglais enfants · …     │     │ Site · Anglais ados · …        │
│ À prendre    [Je m'en occupe]  │     │ Salma                          │
└────────────────────────────────┘     └────────────────────────────────┘
```

## Fiche prospect

Before:

```text
Mme Alaoui
[Nouveau]  Responsable : Non attribué
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
PROCHAINE ACTION
Premier contact
…
[··· Autres actions] → Clôturer le prospect · Changer de responsable · Confier cette action à…
```

## Paramètres

Before: the receptionist sees « Mon compte »; directors and administrators see the centre settings and no place for their own name. After: everyone has « Mon compte » (« Nom », required; « Téléphone »).

# Delivery

| Piece | Content | Tier | Migration | Rollback |
| --- | --- | --- | --- | --- |
| **PR 1 — « Voir qui a quoi »** | Responsable's name on every card; one « Responsable » line (second name only when different); « Mon compte » for every staff role, name required; the two wrong texts corrected; menu items renamed; WORKFLOWS corrected. Display only. | 2 | none | revert the PR; no stored data has a new shape |
| **S1 — names** (each person, in the app) | Everyone opens « Mon compte » and types their name. | Production data, by each account on itself | none | retype the name |
| **S2 — one login per person** (you, in the app) | Q8 option A: rename the shared account, invite the second partner. | 3 (accounts) | none | the director can change the invited account's role back; a rename is retyped |
| **PR 2 — « Prendre en un clic »** | « Je m'en occupe » in the three places (existing command); refresh after a refused take; Tâches three tabs with counters; Opportunités reduced to « Tous », « Mes prospects », « Clôturés » with the three moved views in « Filtres »; « Moi » first in the picker; guide and PRODUCT_RULES updated. | 2 | none | revert the PR; prospects taken meanwhile stay with whoever took them (ordinary owner changes) |
| **S3 — « À prendre » on** (director, in Paramètres) | « Responsable par défaut » → « Aucun ». After PR 2. | 3 (Production setting) | none | choose the account again; prospects that arrived meanwhile are in « À prendre » |
| **PR 3 — « Le premier appel prend »** | Migration 143 (provisional): the first recorded exchange takes an unowned prospect; a real « À prendre » view for Opportunités and its tab. | 3 | **yes**, functions only | `scripts/rollback/143_…_restore.sql` re-creates the previous bodies; owners set meanwhile stay (ordinary data) |
| Later, separate plan | Sharing out the existing unowned prospects and the default account's backlog. | 3 (data step) | — | — |

Order: PR 1 → S1 and S2 → PR 2 → S3 → PR 3. PR 3 may be declined without harming the rest (Q4).

**Tests to add or change.** PR 1: `test-crm-row-staff-labels-browser.mjs` (one line, second name only when different), `test-crm-rcc-b1-browser.mjs` and `test-crm-phase4-browser.mjs` (renamed menu items), a « Mon compte » check for the three roles. PR 2: `test-crm-work-calendar-browser.mjs` (tabs replace the two dropdowns; the « À traiter » link is gone), `test-crm-rcc-a1-browser.mjs` (the foreground assertion narrows to « no change of an existing responsable in the foreground »), `test-crm-opportunities-browser.mjs` (four tabs, the moved views), `test-reception-day-scripts-browser.mjs` (take, then call), `test-crm-concurrency-local.mjs` (two simultaneous takes: one wins, one `PT409`, one history line), phone-width checks. PR 3: `test-crm-next-action.sql` and `test-crm-next-action-enforced.sql` (first exchange takes; an owned prospect is never taken; a note does not take; one action throughout), `test-crm-opportunities.sql` (the new view), an upgrade rehearsal, `test-single-writer.sql` unchanged and green.

# Owner decisions required

Every question blocks only the piece named. « Recommended » is my answer if you want one.

| # | Question | Options | Recommended | Blocks |
| --- | --- | --- | --- | --- |
| Q1 | Do new Meta and website prospects arrive with nobody (« À prendre ») instead of going to the default account? This reverses your OD-6 answer of 2026-11-21. | A: nobody. B: keep the default account. | **A** | S3 |
| Q2 | Does « Tâches » open on « Mes prospects » only, with unassigned work one tab away (counter shown)? This changes « opens on Moi + non attribué ». | A: yes. B: keep the combined default. | **A** | PR 2 |
| Q3 | May a visible « Je m'en occupe » button appear on prospects nobody has? This narrows the 2026-10-07 rule that reassignment stays in menus. Taking from a colleague stays in « ··· ». | A: yes, unowned only. B: also on colleagues' prospects. C: no button. | **A** | PR 2 |
| Q4 | Does the first recorded exchange take an unowned prospect automatically? | A: yes, failed calls included. B: only when the person was reached. C: no, the button only (then PR 3 shrinks to the Opportunités view, or is dropped). | **A** | PR 3 |
| Q5 | One « Responsable » shown, the action's holder only when different; the second Tâches filter removed? | A: yes. B: keep both names. | **A** | PR 1, PR 2 |
| Q6 | Opportunités: four tabs; « Arrivés aujourd'hui », « Tests de niveau », « Sans réponse » in « Filtres »; « À traiter », « Suivi aujourd'hui », « Qualifiés » removed from the screen? | A: as written. B: move all six into « Filtres », remove none. | **A** | PR 2 |
| Q7 | Who sets a staff name? | A: each person, their own, in « Mon compte ». B: the director may also set others' (needs a migration and a new privileged function). | **A** | PR 1 |
| Q8 | The shared login. | A: one partner keeps it under their name, the other is invited. B: freeze it as « Ancien compte partagé », two new accounts. | **A** | S2 |
| Q9 | Is « À prendre » also a tab in Opportunités (needs PR 3's migration), or in Tâches only? | A: both screens. B: Tâches only. | **A** if Q4 ≠ C, else **B** | PR 3 |
| Q10 | Which account is the shared one, which two have no name, and is the shared one the director account? | your answer | — | S1, S2 |

# What could not be verified

- **Every Production number**: 122 active prospects without a responsable, 126 open actions without one, two unnamed accounts, the shared login, the current default account. No Production read was made; they are quoted from you.
- **That Production runs the bodies read here.** They come from a local replay of 001–141 and the text of 142. The release pre-check of PR 3 compares the live bodies before changing anything.
- **Why 126 and not 122.** The plan assumes a few owned prospects whose action is unassigned (older rows or a delegation to nobody). The « À prendre » definition was chosen so they are visible either way.
- **That the OD-6 back-fill never ran.** Inferred from D1's functions (they do not write owners) and from your 122.
- **How many closed or enrolled prospects have no responsable.** It decides how wrong a « Non attribué »-based tab would look, hence PR 3's view.
- **The mock-ups on a real phone.** Nothing was built. Each PR checks its screens at 320 and 390 px, the widths the browser suites already use.
- **The test lists.** Drawn from reading the suites, not from running them.

# Scope and non-goals

In scope: the three PRs and three steps above. Not in scope: sharing out existing prospects; any change to who may see or change a prospect; statistics per responsable; notifications; teachers or portals; the marketing, Meta lifecycle or finance paths (none reads ownership); deleting any server view or parameter; blocking or deleting any account. No ADR is added: [ADR-019](../decisions/ADR-019-one-next-action-per-prospect.md) (the action's assignee is derived from the owner) is unchanged, and the rest is presentation, a setting and one derivation rule recorded in PRODUCT_RULES.

## IMPLEMENTATION CONTRACT

**Scope:** the pieces of [Delivery](#delivery) at revision CPO-r1, as amended by the owner's answers to Q1–Q10. Each PR and each step needs its own approval; approval of this plan authorises none of them.

**Prerequisites:** owner approval of this plan with the answers recorded here and in [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md); a clean branch from then-current `main`; for PR 3, the next free migration number at merge and the answers to Q4 and Q9.

**Object manifest:**
- PR 1: `OpportunityCard.jsx`, `OpportunitiesList.jsx`, `WorkQueue.jsx` (row line only), `LeadDetailSheet.jsx`, `NextActionPanel.jsx`, `CrmActionDialog.jsx` (text, « Moi » first), `presentation.mjs` (labels), `settings/page.jsx`, `ReceptionistOperations.jsx`, `GuideContent.jsx`, `docs/ai/WORKFLOWS.md`.
- PR 2: `WorkQueue.jsx`, `CrmWorkspace.jsx`, `OpportunityFilters.jsx`, `OpportunityCard.jsx`, `LeadDetailSheet.jsx`, `presentation.mjs`, `useCrmCommand.js` (refresh after a conflict), `GuideContent.jsx`, `docs/ai/PRODUCT_RULES.md`, `docs/ai/WORKFLOWS.md`. Calls only `crm_reassign`, `crm_get_work_queue`, `crm_get_opportunities`, `crm_list_staff` with values they accept today.
- PR 3: one migration re-creating `crm_security.command`, `crm_security.opportunity_ids` and `public.crm_get_opportunities` from their **live** bodies (140, 139 and 107 at this baseline; re-read before writing), its restore script, the Opportunités tab, the tests above.

**Invariants:**
- No new table, column, role, capability, grant or public function. `has_capability` and `roleAccess.mjs` stay identical.
- Exactly one open action per active prospect, before and after every command; every action write goes through `set_next_action`.
- A take never changes an existing responsable. Only an explicit « Changer de responsable » does.
- Every command keeps its version check; a conflict is `PT409`, never retried, and leaves nothing written.
- Intake code is not changed: the default responsable stays a director setting, and Meta lifecycle and intake tests keep their expectations.
- The automatic take runs for `log_exchange` results other than a plain note, for a staff actor, on a prospect whose owner is NULL, and writes one history line with the existing event type.
- No existing prospect or action is rewritten by a migration or a release.
- French UI strings; « prospect » or « contact », never « parent »; every changed screen works at 320 and 390 px.

**Acceptance:** from « À prendre », one tap makes the prospect appear in « Mes prospects » with the taker's name on its card, row and fiche; two simultaneous takes give one responsable, one refusal and one history line; a recorded « Pas de réponse » on an unowned prospect leaves it with the caller (PR 3); no screen shows two « responsables » unless they differ; Tâches has three tabs and five time buckets; Opportunités has four tabs; every staff role can set its own name and cannot save an empty one; all existing suites are green with the changes listed under [Delivery](#delivery).

**Stop conditions:** a need for a new permission, grant or public function; a live body that differs from the one this plan names; any Meta lifecycle or intake test needing a new expectation; a way for a take to replace an existing responsable; the single-writer or one-action tests failing; a Production count that contradicts the plan's assumptions at a release pre-check.

**Docs and status:** each PR updates PRODUCT_RULES, WORKFLOWS and the guide where behaviour changes, and CURRENT_STATE after release. Handoff per [AGENTS](../../../AGENTS.md#implementation-handoff), stopping at READY FOR INDEPENDENT REVIEW; releases follow the rollout template with separate approvals.
