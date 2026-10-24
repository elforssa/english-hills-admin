// Deliberate record conflicts (ADR-009, plan NRC-r2). The database refuses a
// stale version, a lost lease or a busy lock with SQLSTATE PT409 (HTTP 409),
// which PostgREST never retries. The legacy 40001 is still accepted on read so
// the app behaves the same before and after the migration; this is the only
// browser module allowed to name it (CI src/ scan).
export const CONFLICT_CODE = 'PT409';
const LEGACY_CONFLICT_CODE = '40001';

export function isRecordConflict(error) {
  return error?.code === CONFLICT_CODE || error?.code === LEGACY_CONFLICT_CODE;
}

export function recordConflictMessage() {
  return 'Cette fiche a été modifiée entre-temps. Les informations sont actualisées : vérifiez puis recommencez.';
}
