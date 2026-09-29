'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { auth } from '@/lib/entities';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function ReceptionistAccount() {
  const { user, reload } = useAuth();
  const [name, setName] = useState(user?.full_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [saving, setSaving] = useState(false);
  return <main className="mx-auto max-w-lg p-4 lg:p-8"><h1 className="text-2xl font-bold mb-5">Mon compte</h1>
    <p className="mb-4">{user?.email}</p>
    <form className="space-y-4" onSubmit={async e => { e.preventDefault(); setSaving(true);
      try { await auth.updateMe({ full_name: name, phone }); await reload(); toast.success('Compte mis à jour'); }
      catch { /* auth.updateMe reports errors */ } finally { setSaving(false); }
    }}>
      <label className="block">Nom<input className="block w-full border rounded-md p-2" value={name} onChange={e => setName(e.target.value)} /></label>
      <label className="block">Téléphone<input className="block w-full border rounded-md p-2" value={phone} onChange={e => setPhone(e.target.value)} /></label>
      <Button disabled={saving} type="submit">{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
    </form>
  </main>;
}
