// One identity per new learner (plan NRC-r2, REL-4). The form or import picks the
// learner's id before the first send and keeps it until a confirmed success, so a
// retry after a lost answer finds the learner already created instead of
// inserting a second one. The client is injected so the node tests run this code.
export const STUDENT_ALREADY_CREATED_MESSAGE = 'Cet apprenant a déjà été créé lors d’un envoi précédent. Ouvrez sa fiche pour le modifier.';
export const STUDENT_CREATED_THEN_DELETED_MESSAGE = 'Cet apprenant a déjà été créé puis supprimé. Demandez à l’administration de le restaurer.';

// save_receptionist_student (096) replays an identical create by id and refuses a
// different payload, or a soft-deleted row, with this exact refusal.
export function isReceptionistIdentityConflict(error) {
  return error?.code === '23505' && error?.message === 'Student create identity conflict';
}

const ownPrimaryKeyConflict = error =>
  error?.code === '23505' && /students_pkey/.test(`${error.message || ''} ${error.details || ''}`);

function withVirtualDates(row) {
  if (row?.created_at && !('created_date' in row)) row.created_date = row.created_at;
  if (row?.updated_at && !('updated_date' in row)) row.updated_date = row.updated_at;
  return row;
}

// Admin/director insert with the caller's id (authenticated may insert students.id;
// RLS "students admin insert" applies unchanged). A primary-key conflict on our own
// random id can only mean an earlier send committed, so it is read back:
//   { status: 'created' | 'replayed', row }      the learner exists and matches;
//   { status: 'already_created', row, message }  stored name or birth date differ;
//   { status: 'deleted', message }               created, then soft-deleted.
// The restrictive "students soft delete filter" policy hides a deleted row from
// every API read, the admin/director read included, so a conflicting id whose row
// is not readable is a deleted learner (as on the receptionist form). Any other
// error, or a failed read-back, is thrown unchanged.
export async function createStudentOnce(client, id, data) {
  const fields = { ...data };
  for (const key of ['id', 'created_date', 'updated_date', 'created_at', 'updated_at']) delete fields[key];
  const { data: row, error } = await client.from('students').insert({ ...fields, id }).select().single();
  if (!error) return { status: 'created', row: withVirtualDates(row) };
  if (!ownPrimaryKeyConflict(error)) throw error;
  const { data: stored, error: readError } = await client.from('students').select('*').eq('id', id).maybeSingle();
  if (readError) throw error;
  if (!stored || stored.deleted_at) return { status: 'deleted', message: STUDENT_CREATED_THEN_DELETED_MESSAGE };
  const differs = stored.full_name !== fields.full_name || (stored.date_naissance || null) !== (fields.date_naissance || null);
  return differs
    ? { status: 'already_created', row: withVirtualDates(stored), message: STUDENT_ALREADY_CREATED_MESSAGE }
    : { status: 'replayed', row: withVirtualDates(stored) };
}
