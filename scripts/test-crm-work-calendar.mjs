import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calendarDate, shiftCalendarDate } from '../src/lib/crm/calendar.mjs';
import { TASKS, CALL_TASKS, scheduledLabel, staffLabel } from '../src/lib/crm/presentation.mjs';
assert.equal(Object.keys(TASKS).length,9); // RWR-r5 adds awaiting_prospect
assert.deepEqual(CALL_TASKS,['first_contact','contact_attempt','callback']);
assert.equal(calendarDate('2026-02-30'),null);
assert.equal(calendarDate('2026-02-15'),'2026-02-15');
assert.equal(shiftCalendarDate('2026-02-15',7),'2026-02-22');
assert.equal(shiftCalendarDate('2026-03-22',-1),'2026-03-21');
const migration=readFileSync('supabase/migrations/108_crm_work_queue_admissions_calendar.sql','utf8');
assert(!/create table|alter table|create policy|create trigger|insert into|update public|delete from/i.test(migration));
assert.equal((migration.match(/perform crm_security.require_reader\(false\)/g)||[]).length,2);
assert(!/crm_submission_attribution|crm_external_deliveries|crm_lifecycle_/i.test(migration));
const page=readFileSync('src/app/(admin)/placement-tests/page.jsx','utf8');
assert(page.includes("params.get('view')==='calendar' ? <AdmissionsCalendar/> : <PlacementTestsList/>"));
const calendar=readFileSync('src/components/placement/AdmissionsCalendar.jsx','utf8');
assert(!/listAll|calendar_events|Annulé|draggable/.test(calendar));
const queue=readFileSync('src/components/crm/WorkQueue.jsx','utf8');
// CPO-r2: Tâches filters on the action's holder through three tabs; the prospect's owner is never a second
// filter (the read's owner parameters stay « all »), and the link to the removed « À traiter » view is gone.
assert(queue.includes('...workAssigneeArgs(assignee), ...ANY_OWNER')&&queue.includes("const ANY_OWNER = { p_owner_mode: 'all', p_owner: null };"));
assert(queue.includes('Object.entries(WORK_SCOPES)')&&!queue.includes('Responsable du prospect')&&!queue.includes('Responsable de la tâche'));
assert(!queue.includes('view=attention'));
// « Je m'en occupe » is the existing owner change with the version on screen and the signed-in account: no new RPC.
const take=readFileSync('src/components/crm/TakeProspectButton.jsx','utf8');
assert(take.includes("take.run('crm_reassign', () => ({ lead_id: lead.id, expected_version: lead.version, owner_id: user.id })")&&take.includes('refreshOnConflict: true'));
assert(queue.includes('{who.takeable && <TakeProspectButton lead={row.lead} primary />}'),'offered only when the prospect has no owner');
console.log('PASS civil-date presentation, task vocabulary, additive-read and bounded-route guards');

// Stable civil labels under host timezone/locale changes; never reinterpret UTC.
assert.equal(scheduledLabel({local_date:'2026-10-07',local_time:'10:35:00',due_at:'2026-10-07T09:35Z'}),'07/10/2026 · 10:35');
assert.equal(scheduledLabel({local_date:'2026-10-07',local_time:null}),'07/10/2026 · Heure non précisée');
assert.equal(scheduledLabel({due_at:'2026-10-07T09:35Z'}),'Horaire à confirmer');
assert.equal(staffLabel({name:'Équipe accueil',display_label:'Équipe accueil · Accueil · Réf. ABC123'}),'Équipe accueil · Accueil · Réf. ABC123');
console.log('PASS PostgreSQL civil-only labels, missing projection explicit, shared staff display rule');
