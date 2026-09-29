'use client';

import TeacherForm from '@/components/teachers/TeacherForm';
import ReceptionistTeacherForm from '@/components/teachers/ReceptionistTeacherForm';
import { useAuth } from '@/context/AuthContext';

export default function EditTeacherPage() {
  const { role } = useAuth();
  return role === 'receptionist' ? <ReceptionistTeacherForm /> : <TeacherForm />;
}
