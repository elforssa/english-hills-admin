'use client';

import FamilyLessons from '@/components/online/FamilyLessons';
import { useOnlineRead } from '@/lib/online/queries';

export default function ParentOnlineLessons() {
  const query = useOnlineRead('online_list_lessons_for_my_children', {}, { roles: ['parent'], refetchInterval: 60000 });
  return <FamilyLessons title="Cours en ligne de mes enfants" query={query} showLearner backHref="/parent-portal" />;
}
