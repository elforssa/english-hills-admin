import assert from 'node:assert/strict';
import { ACTIVE, BOARD_STAGES, COMMAND_LABELS, NEXT_KINDS, OPPORTUNITY_FILTER_VIEWS, OPPORTUNITY_TABS, OPPORTUNITY_VIEWS, TAKEN_MESSAGE, WORK_SCOPES, collapseArrival, learnerLine, opportunityAction, opportunityScope, opportunityTab, opportunityView, ownership, stageChips, toTakeStage, workAssignee, workAssigneeArgs, workScope } from '../src/lib/crm/presentation.mjs';
import { answerLabel, answerProgramme, isProgrammeAnswer, sourceWithoutProgramme } from '../src/lib/ui/presentation.mjs';
// CPO-r2: four tabs, three views in « Filtres »; the three removed views open « Tous ».
assert.deepEqual(OPPORTUNITY_TABS, { all: 'Tous', mine: 'Mes prospects', to_take: 'À prendre', closed: 'Clôturés' });
assert.deepEqual(Object.keys(OPPORTUNITY_FILTER_VIEWS), ['new_today', 'placement', 'no_response']);
assert.equal(Object.keys(OPPORTUNITY_VIEWS).length, 7);
for (const removed of ['attention', 'follow_up_today', 'qualified', 'unknown', '', null, undefined, 'constructor']) assert.equal(opportunityView(removed), 'all', `removed or unknown view ${removed}`);
for (const kept of Object.keys(OPPORTUNITY_VIEWS)) assert.equal(opportunityView(kept), kept);
assert.equal(opportunityTab('no_response'), 'all', 'a « Filtres » view refines « Tous »');
assert.equal(opportunityTab('to_take'), 'to_take');
const someone = 'a3000000-0000-4000-8000-000000000002';
// « À prendre » is the existing owner filter, never a server view; « Mes prospects » ignores the owner filter.
assert.deepEqual(opportunityScope('to_take', someone), { p_view: 'all', p_owner_mode: 'unassigned', p_owner: null });
assert.deepEqual(opportunityScope('mine', someone), { p_view: 'mine', p_owner_mode: 'all', p_owner: null });
assert.deepEqual(opportunityScope('all', someone), { p_view: 'all', p_owner_mode: 'staff', p_owner: someone });
assert.deepEqual(opportunityScope('closed', 'all'), { p_view: 'closed', p_owner_mode: 'all', p_owner: null });
assert.deepEqual(opportunityScope('attention', 'me'), { p_view: 'all', p_owner_mode: 'me', p_owner: null });
assert.deepEqual(opportunityScope('all', 'nonsense'), { p_view: 'all', p_owner_mode: 'all', p_owner: null });
// Under « À prendre » only the four active stages exist: never closed, never enrolled.
assert.deepEqual(stageChips('to_take', ''), ACTIVE);
assert.deepEqual(stageChips('to_take', 'LOST'), ACTIVE);
for (const stage of ['', null, 'CONVERTED', 'LOST', 'NOT_QUALIFIED', 'x']) assert.equal(toTakeStage(stage), 'NEW');
for (const stage of ACTIVE) assert.equal(toTakeStage(stage), stage);
// Tâches: three tabs on the action's holder; the old combined default opens « Mes prospects ».
assert.deepEqual(WORK_SCOPES, { me: 'Mes prospects', unassigned: 'À prendre', all: 'Toute l’équipe' });
for (const value of [null, '', 'me', 'me_or_unassigned', 'staff', 'x']) assert.equal(workAssignee(value), 'me');
assert.equal(workAssignee('unassigned'), 'unassigned'); assert.equal(workAssignee('all'), 'all'); assert.equal(workAssignee(someone), someone);
assert.equal(workScope('me'), 'me'); assert.equal(workScope('unassigned'), 'unassigned'); assert.equal(workScope('all'), 'all'); assert.equal(workScope(someone), 'all');
assert.deepEqual(workAssigneeArgs('me'), { p_assignee_mode: 'me', p_assignee: null });
assert.deepEqual(workAssigneeArgs('unassigned'), { p_assignee_mode: 'unassigned', p_assignee: null });
assert.deepEqual(workAssigneeArgs(someone), { p_assignee_mode: 'staff', p_assignee: someone });
// One « Responsable »: the action's holder only when it is someone else; a take only with no owner.
assert.deepEqual(ownership({ ownerId: 'a', ownerLabel: 'Salma', assigneeId: 'a', assigneeLabel: 'Salma' }), { owner: 'Salma', main: 'Responsable : Salma', action: null, takeable: false });
assert.deepEqual(ownership({ ownerId: 'a', ownerLabel: 'Salma', assigneeId: 'b', assigneeLabel: 'Karim' }), { owner: 'Salma', main: 'Responsable : Salma', action: 'Action confiée à Karim', takeable: false });
assert.deepEqual(ownership({ ownerId: 'a', ownerLabel: 'Salma', assigneeId: null }), { owner: 'Salma', main: 'Responsable : Salma', action: 'Action sans responsable', takeable: false });
assert.deepEqual(ownership({ ownerId: null, assigneeId: null }), { owner: null, main: 'À prendre', action: null, takeable: true });
assert.deepEqual(ownership({ ownerId: null, assigneeId: 'b', assigneeLabel: 'Karim' }), { owner: null, main: 'À prendre', action: 'Action confiée à Karim', takeable: true });
assert.deepEqual(ownership({ ownerId: null, assigneeId: null, active: false, hasAction: false }), { owner: null, main: 'Sans responsable', action: null, takeable: false });
assert.equal(ownership({ ownerId: 'a', ownerLabel: null, assigneeId: 'a' }).main, 'Responsable : Responsable indisponible');
assert.equal(ownership({ ownerId: 'a', ownerLabel: 'Salma', assigneeId: null, hasAction: false }).action, null);
assert.equal(TAKEN_MESSAGE, 'Déjà pris ou modifié. La liste est à jour.');
assert.equal(COMMAND_LABELS.reassign, 'Responsable modifié'); assert.equal(COMMAND_LABELS.create_prospect, 'Prospect créé'); assert.equal(COMMAND_LABELS.update_prospect, 'Fiche modifiée');
// Display clean-ups: French labels for raw form field names; a configured label is kept.
assert.equal(answerLabel({ key: 'program_interest', label: 'program interest' }), 'Programme souhaité');
assert.equal(answerLabel({ key: 'deplacement_centre', label: 'deplacement centre' }), 'Peut se déplacer au centre');
assert.equal(answerLabel({ key: 'current_level', label: 'current level' }), 'Niveau actuel');
assert.equal(answerLabel({ key: 'current_level', label: 'Votre niveau aujourd’hui' }), 'Votre niveau aujourd’hui');
assert.equal(answerLabel({ key: 'favourite_colour', label: 'favourite colour' }), 'Favourite colour');
assert.equal(answerLabel({ key: 'current_level', label: null }), 'Niveau actuel');
assert.equal(answerLabel({}), 'Réponse');
assert(isProgrammeAnswer({ key: 'program_interest' })); assert(!isProgrammeAnswer({ key: 'current_level' }));
// The programme named by a form answer, from the most recent submission that has one.
assert.equal(answerProgramme([{ answers: [{ key: 'program_interest', value: 'Anglais adultes' }] }, { answers: [{ key: 'current_level', value: 'A2' }] }]), 'Anglais adultes');
assert.equal(answerProgramme([{ answers: [{ key: 'program_interest', value: 'Ancien' }] }, { answers: [{ key: 'program_interest', value: 'x', display_value: 'Nouveau' }] }]), 'Nouveau');
assert.equal(answerProgramme([{ answers: [{ key: 'program_interest', value: '' }] }]), null);
assert.equal(answerProgramme(undefined), null);
// The programme once: the origin loses a second part that only repeats it.
assert.equal(sourceWithoutProgramme('Meta • Anglais enfants', 'Anglais enfants'), 'Meta');
assert.equal(sourceWithoutProgramme('Site web • Programme annuel', 'Yearly', 'Programme annuel'), 'Site web');
assert.equal(sourceWithoutProgramme('Meta • Formulaire rentrée', 'Anglais enfants'), 'Meta • Formulaire rentrée');
assert.equal(sourceWithoutProgramme('Manuel · Téléphone', 'Téléphone'), 'Manuel · Téléphone');
assert.equal(sourceWithoutProgramme('Meta • Anglais enfants', null, undefined, ''), 'Meta • Anglais enfants');
assert.equal(sourceWithoutProgramme(null, 'x'), '');
// An arrival by Meta or the website reads as one history line; a user command is never touched.
const at = '2026-11-27T10:00:00+00:00';
const arrival = [{ id: 3, event_type: 'task_created', occurred_at: at }, { id: 2, event_type: 'submission_received', occurred_at: at }, { id: 1, event_type: 'lead_created', occurred_at: at }];
assert.deepEqual(collapseArrival(arrival), [{ id: 1, event_type: 'lead_created', occurred_at: at, arrival: true }]);
const later = { id: 9, event_type: 'submission_received', occurred_at: '2026-11-28T10:00:00+00:00' }, primary = { id: 8, event_type: 'action_recorded', is_primary: true, occurred_at: at };
assert.deepEqual(collapseArrival([later, primary, ...arrival]).map(row => row.id), [9, 8, 1], 'a later request and a user action keep their own lines');
assert.deepEqual(collapseArrival([arrival[2]]), [arrival[2]], 'a lone creation row is left as it is');
assert.deepEqual(collapseArrival([later]), [later]); assert.deepEqual(collapseArrival(undefined), []);
// A card's learner line: no placeholder when the contact is the learner (adult programme).
assert.equal(learnerLine({ learner_name: 'Yanis', learner_age: 9, program: 'Yearly' }), 'Yanis · 9 ans');
assert.equal(learnerLine({ learner_name: null, program: 'Yearly' }), 'Apprenant à préciser');
assert.equal(learnerLine({ learner_name: null, learner_age: 8, program: 'Anglais enfants' }), 'Apprenant à préciser · 8 ans');
assert.equal(learnerLine({ learner_name: null, program: 'Adults' }), null);
assert.equal(learnerLine({ learner_name: null, learner_age: 31, program: 'Communication Adult' }), '31 ans');
assert.equal(learnerLine({ learner_name: 'Nadia', program: 'Adults' }), 'Nadia');
// « Changer »: wording that says who expects what.
assert.equal(NEXT_KINDS.callback, 'Rappeler à l’heure convenue'); assert.equal(NEXT_KINDS.reminder, 'Rappeler plus tard, sans heure promise'); assert.equal(NEXT_KINDS.our_step, 'À faire de notre côté (prix, groupe…)');
assert.deepEqual(BOARD_STAGES, ['NEW','CONTACTING','ENGAGED','QUALIFIED','CONVERTED']);
assert(!ACTIVE.includes('CONVERTED'));
for (const from of [...BOARD_STAGES,'LOST','NOT_QUALIFIED']) for (const to of BOARD_STAGES) {
 const expected = from === to ? null : from === 'NEW' && to === 'CONTACTING' ? 'call'
  : ['NEW','CONTACTING'].includes(from) && to === 'ENGAGED' ? 'conversation'
  : ['NEW','CONTACTING','ENGAGED'].includes(from) && to === 'QUALIFIED' ? 'qualify'
  : from === 'QUALIFIED' && to === 'CONVERTED' ? 'enrollment' : 'unsupported';
 assert.equal(opportunityAction(from,to),expected,`${from} -> ${to}`);
}
console.log('PASS O3 semantic interaction matrix, fixed Views, Converted terminal display');
