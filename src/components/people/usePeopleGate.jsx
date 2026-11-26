'use client';

import { useState } from 'react';
import { getBrowserClient } from '@/lib/supabase';
import { acknowledgedMatches, allAnswered, strongMatches } from '@/lib/people.mjs';
import DuplicateGate from './DuplicateGate';

// The duplicate gate of the student create paths (RWR-r5 §5.2): StudentForm and the
// receipt's « Nouvel apprenant » ask find_people for strong matches (same phone, or
// same name and birth date) before creating. Each match needs an answer; the answers
// are recorded (person_match_decisions) once the student exists.
export function usePeopleGate() {
  const [matches, setMatches] = useState(null), [answers, setAnswers] = useState({});
  // true: create now; false: the gate is shown and waits for answers.
  async function check({ phone, name, birth }) {
    const { data, error } = await getBrowserClient().rpc('find_people', {
      p_query: '', p_phone: phone || null, p_name: name || null, p_birth: birth || null, p_limit: 10
    });
    if (error) throw error;
    const strong = strongMatches(data);
    if (!strong.length) { setMatches(null); return true; }
    if (allAnswered(strong, answers)) { setMatches(strong); return true; }
    setMatches(strong);
    return false;
  }
  async function record(studentId) {
    if (!matches?.length) return true;
    const { error } = await getBrowserClient().rpc('record_person_match_decisions', {
      p_subject_kind: 'student', p_subject_id: studentId, p_decisions: acknowledgedMatches(matches, answers)
    });
    return !error;
  }
  const gate = matches?.length ? <DuplicateGate matches={matches} answers={answers} onAnswer={(key, value) => setAnswers(old => ({ ...old, [key]: value }))} /> : null;
  return { check, record, gate, pending: !!matches?.length && !allAnswered(matches, answers) };
}
