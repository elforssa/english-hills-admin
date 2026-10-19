'use client';

import FamilyLessons from '@/components/online/FamilyLessons';
import { useOnlineRead } from '@/lib/online/queries';

export default function StudentOnlineLessons() {
  const query = useOnlineRead('online_list_lessons_for_me', {}, { roles: ['student'], refetchInterval: 60000 });
  return <FamilyLessons title="Mes cours en ligne" query={query} backHref="/student-portal" />;
}
