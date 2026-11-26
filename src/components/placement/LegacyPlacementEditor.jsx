'use client';
import StudentTestDialog from './StudentTestDialog';

// The calendar's editor for a learner's own test (one without a prospect). RWR-r5 §6.2
// (migration 141): it is StudentTestDialog, which writes through update_placement_test_result;
// full detail is read only after the click, as before (the calendar's projection has no
// notes, scores or learner rows).
export default function LegacyPlacementEditor({ id, onClose, onSave }) {
  return <StudentTestDialog testId={id} onClose={onClose} onSaved={onSave} />;
}
