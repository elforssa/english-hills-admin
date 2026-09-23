import { Suspense } from 'react';
import CrmWorkspace from '@/components/crm/CrmWorkspace';
export default function Page() {
  return <Suspense fallback={<p className="p-8">Chargement…</p>}><CrmWorkspace mode="leads" /></Suspense>;
}
