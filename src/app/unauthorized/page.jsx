'use client';

import { ShieldOff } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function UnauthorizedPage() {
  const { user, role, logout } = useAuth();

  const isPending = !role || role === 'pending';

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-slate-100 p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-5">
          <ShieldOff size={24} className="text-amber-600" />
        </div>

        {isPending ? (
          <>
            <h1 className="text-xl font-bold text-foreground mb-2">
              Compte en attente d&apos;activation
            </h1>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              Votre compte est en attente d&apos;activation. Veuillez contacter l&apos;administration English Hills.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-foreground mb-2">Accès non autorisé</h1>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              Votre compte ne dispose pas des permissions nécessaires pour accéder à cette page.
            </p>
          </>
        )}

        {user && (
          <div className="text-xs text-muted-foreground mb-5 p-3 rounded-lg bg-muted">
            Connecté en tant que <strong className="text-foreground">{user.email}</strong>
            {role && role !== 'pending' && (
              <> · rôle <strong className="text-foreground">{role}</strong></>
            )}
          </div>
        )}

        <button
          onClick={logout}
          className="text-xs text-muted-foreground hover:text-foreground transition"
        >
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
