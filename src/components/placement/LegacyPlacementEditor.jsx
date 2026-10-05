'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { getBrowserClient } from '@/lib/supabase';
import PlacementTestModal from './PlacementTestModal';
import { Button } from '@/components/ui/button';

// Full placement detail and bounded option reads occur only after an explicit
// click. Calendar's fixed projection never includes notes/scores/student rows.
export default function LegacyPlacementEditor({ id,onClose,onSave }) {
  const {user,role}=useAuth();
  const [studentSearch,setStudentSearch]=useState(''), [groupSearch,setGroupSearch]=useState('');
  const [studentPage,setStudentPage]=useState(0), [groupPage,setGroupPage]=useState(0);
  const [test,setTest]=useState(null);
  const query=useQuery({queryKey:['crm',user?.id,role,'calendar-editor',id,studentSearch,studentPage,groupSearch,groupPage],enabled:!!user,
    queryFn:async()=>{
      const sb=getBrowserClient();
      const detail=await sb.from('placement_tests').select('*').eq('id',id).is('crm_lead_id',null).single();
      if(detail.error)throw detail.error;
      const studentQuery=sb.from('students').select('id,full_name,session_type,niveau_cefr,parent_email,email').is('deleted_at',null).order('full_name').order('id').range(studentPage*25,studentPage*25+25);
      const groupQuery=sb.from('groups').select('id,name,session_type,niveau').order('name').order('id').range(groupPage*25,groupPage*25+25);
      if(studentSearch)studentQuery.ilike('full_name',`%${studentSearch}%`);
      if(groupSearch)groupQuery.ilike('name',`%${groupSearch}%`);
      const results=await Promise.all([studentQuery,groupQuery,
        detail.data.student_id ? sb.from('students').select('id,full_name,session_type,niveau_cefr,parent_email,email').eq('id',detail.data.student_id).maybeSingle() : Promise.resolve({data:null}),
        detail.data.groupe_affecte_id ? sb.from('groups').select('id,name,session_type,niveau').eq('id',detail.data.groupe_affecte_id).maybeSingle() : Promise.resolve({data:null})]);
      for(const result of results)if(result.error)throw result.error;
      const [students,groups,student,group]=results;
      const options=(rows,selected)=>[...(selected&&!rows.slice(0,25).some(r=>r.id===selected.id)?[selected]:[]),...rows.slice(0,25)];
      return {test:detail.data,students:options(students.data,student.data),groups:options(groups.data,group.data),moreStudents:students.data.length>25,moreGroups:groups.data.length>25};
    },retry:1});
  useEffect(()=>{if(query.data?.test)setTest(t=>t || query.data.test);},[query.data]);
  const options=<div className="space-y-3 rounded-md border p-3 text-sm">
    <p className="text-xs text-slate-500">Listes limitées à 25 résultats. Recherchez un apprenant ou un groupe.</p>
    {[[studentSearch,setStudentSearch,studentPage,setStudentPage,query.data?.moreStudents,'apprenant'],[groupSearch,setGroupSearch,groupPage,setGroupPage,query.data?.moreGroups,'groupe']].map(([value,setValue,page,setPage,more,label])=><div key={label}>
      <input aria-label={`Rechercher un ${label}`} maxLength={100} className="min-h-11 w-full rounded-md border px-3" value={value} onChange={e=>{setValue(e.target.value);setPage(0);}}/>
      <div className="flex gap-2"><Button type="button" variant="ghost" disabled={!page} onClick={()=>setPage(p=>p-1)}>Précédents · {label}</Button><Button type="button" variant="ghost" disabled={!more||query.isFetching} onClick={()=>setPage(p=>p+1)}>Suivants · {label}</Button></div>
    </div>)}
    {query.isError&&<p role="alert">Données indisponibles. <Button type="button" variant="ghost" onClick={()=>query.refetch()}>Réessayer</Button></p>}
  </div>;
  if(!test)return <div role="status" className="rounded-md border p-4 text-sm">{query.isError ? 'Test indisponible.' : 'Chargement du test…'} <Button variant="ghost" onClick={onClose}>Fermer</Button>{query.isError&&<Button variant="outline" onClick={()=>query.refetch()}>Réessayer</Button>}</div>;
  return <PlacementTestModal test={test} students={query.data?.students || []} groups={query.data?.groups || []} optionControls={options} onClose={onClose} onSave={onSave}/>;
}
