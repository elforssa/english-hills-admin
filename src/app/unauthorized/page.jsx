'use client';

import { useState } from 'react';
import { ShieldOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { getBrowserClient } from '@/lib/supabase';

export default function UnauthorizedPage() {
  const { user, role, logout, reload } = useAuth();
  const router = useRouter();
  const [claiming, setClaiming] = useState(false);

  const handleClaimDirector = async () => {
    setClaiming(true);
    const sb = getBrowserClient();
    const { data: ok, error } = await sb.rpc('claim_director_if_none');
    if (error || !ok) {
      setClaiming(false);
      toast.error(
        error?.message ||
        'Impossible de revendiquer le rôle directeur. Un directeur existe peut-être déjà.'
      );
      return;
    }
    toast.success('Vous êtes maintenant Directeur. Redirection...');
    await reload();
    router.replace('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-slate-100 p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-5">
          <ShieldOff size={24} className="text-amber-600" />
        </div>
        <h1 className="text-xl font-bold text-foreground mb-2">Accès non autorisé</h1>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          Votre compte ne dispose pas des permissions nécessaires pour accéder à cette page.
          {role === 'pending' && (
            <>
              <br /><br />
              Votre rôle est en attente d&apos;attribution par un administrateur.
            </>
          )}
        </p>

        {user && (
          <div className="text-xs text-muted-foreground mb-5 p-3 rounded-lg bg-muted">
            Connecté en tant que <strong className="text-foreground">{user.email}</strong>
            {role && <> · rôle <strong className="text-foreground">{role}</strong></>}
          </div>
        )}

        {role === 'pending' && (
          <div className="mb-5 p-4 rounded-lg border border-amber-300 bg-amber-50 text-left">
            <p className="text-xs font-semibold text-amber-900 mb-1">
              Premier accès au centre&nbsp;?
            </p>
            <p className="text-xs text-amber-800 leading-relaxed mb-3">
              Si aucun directeur n&apos;a encore été désigné, vous pouvez vous attribuer ce rôle.
              Cette action n&apos;est possible qu&apos;une seule fois.
            </p>
            <button
              onClick={handleClaimDirector}
              disabled={claiming}
              className="w-full px-4 py-2 text-sm font-semibold text-white rounded-lg bg-primary hover:opacity-90 disabled:opacity-50 transition"
            >
              {claiming ? '...' : 'Devenir Directeur'}
            </button>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 transition"
            style={{ backgroundColor: '#1E4D8B' }}
          >
            Retour à l&apos;accueil
          </Link>
          <button
            onClick={logout}
            className="text-xs text-muted-foreground hover:text-foreground transition"
          >
            Se déconnecter
          </button>
        </div>
      </div>
    </div>
  );
}
