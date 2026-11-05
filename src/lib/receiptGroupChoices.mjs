// EAP (migration 127, D3): the groups the walk-in receipt form offers for the chosen
// programme, level and school year, with their free seats counted as the placement
// core does (academic_security.seats_taken, migration 120): learners not archived
// with a non-Rejected enrollment in the group, or with it as their file's main group.
// Online groups have no seat limit. The count is indicative: place_learner_in_group
// decides. The client is injected so the node tests run this code.
import { groupMatchesSelection, isOnlineSessionType } from './academicPrograms.js';
import { groupYear, schoolYearOfGroup } from './enrollmentWorkflow.mjs';

export async function loadGroupChoices(client, { sessionType, level, schoolYear }) {
  if (!sessionType || sessionType === 'Other' || !level || !schoolYear) return [];
  const { data: groups, error } = await client.from('groups')
    .select('id,name,niveau,session_type,annee,capacite_max,horaire,jours')
    .eq('niveau', level).in('annee', [...new Set([groupYear(schoolYear), schoolYear])]).order('name');
  if (error) throw error;
  const rows = (groups || []).filter((group) => groupMatchesSelection(group, sessionType, level)
    && schoolYearOfGroup(group) === schoolYear);
  if (!rows.length) return [];
  const ids = rows.map((group) => group.id);
  const [{ data: enrolled, error: enrolledError }, { data: mainGroup, error: mainGroupError }] = await Promise.all([
    client.from('enrollments').select('student_id,group_id').in('group_id', ids).neq('status', 'Rejected'),
    client.from('students').select('id,groupe_id').in('groupe_id', ids).is('deleted_at', null),
  ]);
  if (enrolledError || mainGroupError) throw enrolledError || mainGroupError;
  const enrolledIds = [...new Set((enrolled || []).map((row) => row.student_id))];
  let live = new Set();
  if (enrolledIds.length) {
    const { data, error: liveError } = await client.from('students').select('id').in('id', enrolledIds).is('deleted_at', null);
    if (liveError) throw liveError;
    live = new Set((data || []).map((row) => row.id));
  }
  const members = new Map(ids.map((id) => [id, new Set()]));
  for (const row of enrolled || []) if (live.has(row.student_id)) members.get(row.group_id)?.add(row.student_id);
  for (const row of mainGroup || []) members.get(row.groupe_id)?.add(row.id);
  return rows.map((group) => {
    const limited = group.capacite_max != null && !isOnlineSessionType(group.session_type);
    return { ...group, free: limited ? Math.max(0, Number(group.capacite_max) - members.get(group.id).size) : null };
  });
}

// « 3 places libres », « complet » or, for an unlimited group, « places non limitées ».
export function groupSeatsLabel(free) {
  if (free === null || free === undefined) return 'places non limitées';
  if (free <= 0) return 'complet';
  return `${free} place${free > 1 ? 's' : ''} libre${free > 1 ? 's' : ''}`;
}
