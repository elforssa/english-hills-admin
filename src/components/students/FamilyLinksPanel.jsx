'use client';

// "Comptes famille" on the learner file (plan PRF-r2 D3, Q4 = A): the parent and
// student accounts linked to this learner. RPW-r2 item 7: every role holding
// canInviteFamily (director, admin, reception) invites the parent or the learner at the
// dossier's address and revokes a link. A dossier e-mail edit never changes these links.
// Resending a pending invitation stays with canManageUsers (Paramètres); reception sees who
// resends it (RPW-r2 review N2, follow-up).

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { listFamilyLinks, portalErrorMessage, revokeFamilyLink } from '@/lib/portal';
import { users } from '@/lib/auth';

const YOUNG = 'Young Learners (6-12)';

const RELATION_LABELS = { parent: 'Parent', self: 'Apprenant' };
const STATUS_LABELS = { active: 'Actif', pending: 'Invitation en attente', revoked: 'Retiré' };
const STATUS_COLORS = {
  active: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  revoked: 'bg-slate-100 text-slate-600',
};

export default function FamilyLinksPanel({ studentId, canRevoke, canInvite = false, canResend = false, student = null }) {
  const [links, setLinks] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [inviting, setInviting] = useState(false);

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

  // The dossier's address, for a relation with no active or pending link (a child has no account of its own).
  const invitable = canInvite && student ? [
    { role: 'parent', relation: 'parent', email: student.parent_email, label: 'Inviter le parent' },
    ...(student.age_category === YOUNG ? [] : [{ role: 'student', relation: 'self', email: student.email, label: 'Inviter l’apprenant' }]),
  ].filter(option => option.email && !(links || []).some(link => link.relation === option.relation && ['active', 'pending'].includes(link.status))) : [];
  const invite = async (option) => {
    const address = option.email.trim();
    if (!window.confirm(`Envoyer une invitation à ${address} ?`)) return;
    setInviting(true);
    try {
      const result = await users.inviteUser(address, option.role, { studentIds: [studentId] });
      toast.success(result?.alreadyRegistered ? `${address} : le compte existant est relié à ce dossier.` : `Invitation envoyée à ${address}.`);
    } catch (error) {
      toast.error(error?.message || 'Invitation impossible. Réessayez.');
    } finally {
      setInviting(false);
      load();
    }
  };
  const inviteButtons = invitable.length > 0 && <div className="mt-3 flex flex-wrap gap-2">
    {invitable.map(option => <button key={option.role} type="button" onClick={() => invite(option)} disabled={inviting}
      className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-primary hover:bg-muted disabled:opacity-50">
      {option.label} · {option.email}</button>)}
  </div>;

  if (links === null) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  if (links.length === 0) {
    return <div><p className="text-sm text-muted-foreground">{canInvite
      ? 'Aucun compte famille relié. L’invitation part à l’adresse du dossier.'
      : 'Aucun compte famille relié. Les accès s’ouvrent lors de l’invitation (Paramètres → Inviter).'}</p>{inviteButtons}</div>;
  }
  return (
    <div>
    <ul className="divide-y divide-border">
      {links.map(link => (
        <li key={link.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{link.account_name || link.account_email}</p>
            <p className="text-xs text-muted-foreground">{RELATION_LABELS[link.relation] || link.relation} · {link.account_email}</p>
            {canInvite && !canResend && link.status === 'pending' && (
              <p className="text-xs text-muted-foreground mt-1">Lien d’invitation perdu ou expiré ? La direction ou l’administration le renvoie (Paramètres → Inviter un utilisateur).</p>
            )}
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
    {inviteButtons}
    </div>
  );
}
