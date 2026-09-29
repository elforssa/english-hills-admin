'use client';

import StudentForm from '@/components/students/StudentForm';
import ReceptionistStudentForm from '@/components/students/ReceptionistStudentForm';
import { useAuth } from '@/context/AuthContext';

export default function NewStudentPage() {
  const { role } = useAuth();
  return role === 'receptionist' ? <ReceptionistStudentForm /> : <StudentForm />;
}
