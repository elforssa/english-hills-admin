'use client';

import { useEffect, useState } from 'react';
import { entities } from '@/lib/entities';
import { toast } from 'sonner';

export default function ReceptionistAssessments() {
  const [rows, setRows] = useState([]);
  const [students, setStudents] = useState([]);
  useEffect(() => {
    let active = true;
    Promise.all([entities.Assessment.listAll('-created_at'), entities.Student.listAll('full_name')])
      .then(([assessments, learners]) => { if (active) { setRows(assessments); setStudents(learners); } })
      .catch(error => toast.error(error.message));
    return () => { active = false; };
  }, []);
  const names = new Map(students.map(student => [student.id, student.full_name]));
  return <main className="p-4 lg:p-8"><h1 className="text-2xl font-bold mb-6">Notes & bulletins</h1>
    <div className="overflow-x-auto rounded-lg border bg-card"><table className="w-full text-sm">
      <thead><tr className="border-b bg-muted text-left"><th className="p-3">Apprenant</th><th className="p-3">Terme</th>
        <th className="p-3">Oral</th><th className="p-3">Écrit</th><th className="p-3">Finale</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.id} className="border-b"><td className="p-3">{names.get(row.student_id) || '—'}</td>
        <td className="p-3">{row.terme || '—'}</td><td className="p-3">{row.note_oral ?? '—'}</td>
        <td className="p-3">{row.note_ecrit ?? '—'}</td><td className="p-3">{row.note_finale ?? '—'}</td></tr>)}</tbody>
    </table>{rows.length === 0 && <p className="p-5 text-sm text-muted-foreground">Aucune évaluation.</p>}</div>
  </main>;
}
