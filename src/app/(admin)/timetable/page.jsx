'use client';

import { useEffect, useState } from 'react';
import { entities, auth } from '@/lib/entities';

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const COLORS = [
  'bg-blue-100 text-blue-800 border-blue-200',
  'bg-green-100 text-green-800 border-green-200',
  'bg-purple-100 text-purple-800 border-purple-200',
  'bg-orange-100 text-orange-800 border-orange-200',
  'bg-pink-100 text-pink-800 border-pink-200',
  'bg-teal-100 text-teal-800 border-teal-200',
];

export default function Timetable() {
  const [groups, setGroups] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterTerme, setFilterTerme] = useState('');
  const [role, setRole] = useState(null);
  const [myTeacherId, setMyTeacherId] = useState(null);

  useEffect(() => {
    Promise.all([
      entities.Group.list('name', 100),
      entities.Teacher.list('full_name', 100),
      auth.me().catch(() => null),
    ]).then(([g, t, u]) => {
      setGroups(g);
      setTeachers(t);
      setRole(u?.role || null);
      // Teachers see only their own groups. Identify the teacher row by email,
      // the same rule the portal and RLS use.
      if (u?.role === 'teacher') {
        setMyTeacherId(t.find(x => x.email === u.email)?.id || null);
      }
      setLoading(false);
    });
  }, []);

  const teacherName = (tid) => teachers.find(t => t.id === tid)?.full_name || '';
  // Scope the schedule to the teacher's own groups; admins/directors see all.
  const visibleGroups = role === 'teacher'
    ? groups.filter(g => g.teacher_id === myTeacherId)
    : groups;
  const filtered = visibleGroups.filter(g => !filterTerme || g.terme === filterTerme);

  const groupsByDay = DAYS.reduce((acc, day) => {
    acc[day] = filtered.filter(g => g.jours?.toLowerCase().includes(day.toLowerCase().slice(0, 3)));
    return acc;
  }, {});

  const hasAny = Object.values(groupsByDay).some(arr => arr.length > 0);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Emploi du temps</h1>
        <select className="border border-border rounded-md px-3 py-2 text-sm bg-white" value={filterTerme} onChange={e => setFilterTerme(e.target.value)}>
          <option value="">Tous les termes</option>
          {['Sept–Déc','Jan–Mar','Avr–Juin','Été'].map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="p-8 text-center text-muted-foreground">Chargement...</div>
      ) : !hasAny ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center text-muted-foreground">
          Aucun groupe avec horaires définis. Ajoutez des groupes avec jours et horaires depuis la page Groupes.
        </div>
      ) : (
        <>
          <div className="hidden lg:grid grid-cols-7 gap-3">
            {DAYS.map((day) => (
              <div key={day}>
                <div className="text-center text-xs font-bold uppercase tracking-wide text-muted-foreground pb-2 mb-2 border-b border-border">{day}</div>
                <div className="space-y-2">
                  {groupsByDay[day].length === 0 ? (
                    <div className="h-8 rounded border border-dashed border-border" />
                  ) : (
                    groupsByDay[day].map((g, i) => (
                      <div key={g.id} className={`p-2 rounded border text-xs ${COLORS[i % COLORS.length]}`}>
                        <p className="font-semibold">{g.name}</p>
                        <p className="opacity-75">{g.horaire}</p>
                        <p className="opacity-60">{teacherName(g.teacher_id)}</p>
                        {g.salle && <p className="opacity-60">Salle {g.salle}</p>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="lg:hidden space-y-4">
            {DAYS.filter(day => groupsByDay[day].length > 0).map((day) => (
              <div key={day} className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-muted border-b border-border">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{day}</span>
                </div>
                <div className="p-3 space-y-2">
                  {groupsByDay[day].map((g, i) => (
                    <div key={g.id} className={`p-2.5 rounded border text-xs ${COLORS[i % COLORS.length]}`}>
                      <p className="font-semibold">{g.name}</p>
                      {g.horaire && <p className="opacity-75 mt-0.5">{g.horaire}</p>}
                      {g.teacher_id && <p className="opacity-60">{teacherName(g.teacher_id)}</p>}
                      {g.salle && <p className="opacity-60">Salle {g.salle}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
