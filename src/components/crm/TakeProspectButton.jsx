'use client';

import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { isRecordConflict } from '@/lib/conflictErrors.mjs';
import { TAKEN_MESSAGE, actionErrorMessage } from '@/lib/crm/presentation.mjs';
import { useCrmCommand } from './useCrmCommand';

// « Je m'en occupe » (CPO-r2): one tap makes the signed-in account the responsable of a
// prospect nobody has. It is the existing owner change (`crm_reassign`) with the version
// this screen shows, so a second person tapping at the same moment is refused by the
// server (PT409), never retried, and sees the refreshed list. Callers render it only for
// an active prospect with no owner: it never replaces an existing responsable.
export default function TakeProspectButton({ lead, primary = false }) {
  const { user } = useAuth();
  // The refusal is a toast: after the refresh this button is gone with its row.
  const take = useCrmCommand({ refreshOnConflict: true, onError: error => toast.error(isRecordConflict(error) ? TAKEN_MESSAGE : actionErrorMessage(error)) });
  if (!user?.id) return null;
  async function run() {
    const saved = await take.run('crm_reassign', () => ({ lead_id: lead.id, expected_version: lead.version, owner_id: user.id }), [lead.id, 'take']);
    if (saved) toast.success('Ce prospect est le vôtre');
  }
  return <Button type="button" size="sm" variant={primary ? 'default' : 'outline'} className="min-h-9" data-testid="take-prospect" disabled={take.busy} onClick={run}>{take.busy ? 'Enregistrement…' : 'Je m’en occupe'}</Button>;
}
