'use client';

// "Comptes famille" on the learner file (plan PRF-r2 D3, Q4 = A): the parent and
// student accounts linked to this learner. Director and admin can revoke a link;
// reception reads it. A dossier e-mail edit never changes these links.

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { listFamilyLinks, portalErrorMessage, revokeFamilyLink } from '@/lib/portal';

const RELATION_LABELS = { parent: 'Parent', self: 'Apprenant' };
const STATUS_LABELS = { active: 'Actif', pending: 'Invitation en attente', revoked: 'Retiré' };
const STATUS_COLORS = {
  active: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  revoked: 'bg-slate-100 text-slate-600',
};

export default function FamilyLinksPanel({ studentId, canRevoke }) {
  const [links, setLinks] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    listFamilyLinks(studentId)
      .then(setLinks)
      .catch(() => { setLinks([]); toast.error('Impossible de charger les comptes famille.'); });
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  const revoke = async (link) => {
    const reason = window.prompt('Motif du retrait de l’accès (obligatoire) :');
    if (reason === null) return;
    if (!reason.trim()) { toast.error('Indiquez un motif.'); return; }
    setBusyId(link.id);
    try {
      await revokeFamilyLink(link.id, reason.trim());
      toast.success('Accès retiré.');
    } catch (error) {
      toast.error(portalErrorMessage(error, 'Retrait impossible. Réessayez.'));
    } finally {
      setBusyId(null);
      load();
    }
  };

  if (links === null) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  if (links.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun compte famille relié. Les accès s’ouvrent lors de l’invitation (Paramètres → Inviter).</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {links.map(link => (
        <li key={link.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{link.account_name || link.account_email}</p>
            <p className="text-xs text-muted-foreground">{RELATION_LABELS[link.relation] || link.relation} · {link.account_email}</p>
            {link.address_differs && (
              <p className="text-xs text-amber-700 mt-1">L’adresse du dossier ne correspond plus à ce compte. L’accès n’a pas changé.</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[link.status] || ''}`}>{STATUS_LABELS[link.status] || link.status}</span>
            {canRevoke && link.status === 'active' && (
              <button type="button" onClick={() => revoke(link)} disabled={busyId === link.id}
                className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50">
                Retirer l’accès
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
