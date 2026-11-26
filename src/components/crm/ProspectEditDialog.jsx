'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import FormField from '@/components/operational/FormField';
import { isRecordConflict } from '@/lib/conflictErrors.mjs';
import { checkPhone, formatPhoneFr } from '@/lib/phone.mjs';
import { STICKY_DIALOG } from './DialogStickyFooter';
import { FormFooter, control, useDirtyClose, useReturnFocus } from './NextActionDialog';
import { useCrmCommand } from './useCrmCommand';
import { ORIGINS, SELECTABLE_ORIGINS, originLabel, originNeedsReferrer } from '@/lib/catalogue.mjs';
import { programmeName } from '@/lib/programCatalog.mjs';
import { prospectProgrammes, useCatalogue } from '@/lib/useCatalogue';

// « Modifier la fiche » (RWR-r5 §5.3, crm_update_prospect): contact and learner fields,
// version-checked. Only the fields that changed are sent, so a legacy number that is
// not valid never blocks a name correction. One history entry « Fiche modifiée »,
// phones masked; possible duplicates are listed on the drawer afterwards.
const FIELDS = [
  ['display_name', 'Nom du contact', 'text', 200, true],
  ['phone', 'Téléphone', 'tel', 40],
  ['whatsapp', 'WhatsApp (si différent)', 'tel', 40],
  ['email', 'E-mail', 'email', 254],
  ['learner_name', 'Nom de l’apprenant', 'text', 200, true],
  ['learner_birth_date', 'Date de naissance', 'date'],
  ['learner_age', 'Âge', 'number'],
  ['program_interest_text', 'Précision sur le programme', 'text', 500]
];
// §5.4 (migration 140): programme and origin from the catalogues (below the fields);
// the origin is edited on manual prospects only (OD-10 A), « Recommandé par » on all.

function initialValues(lead) {
  const c = lead.contact || {};
  return {
    display_name: c.display_name || lead.contact_name || '',
    // Shown in the national form (B1); only a field the user changes is sent.
    phone: c.phone ? formatPhoneFr(c.phone) : '',
    whatsapp: c.whatsapp_own ? formatPhoneFr(c.whatsapp_own) : '',
    email: c.email || '',
    learner_name: lead.learner_name || '',
    learner_birth_date: lead.learner_birth_date || '',
    learner_age: lead.learner_age ?? '',
    program_interest_text: lead.program_interest_text || '',
    session_type: lead.session_type || '',
    origin_code: lead.origin_code || '',
    referrer: lead.referrer?.name || ''
  };
}

export default function ProspectEditDialog({ lead, onClose }) {
  const [start] = useState(() => initialValues(lead));
  const [values, setValues] = useState(start);
  const command = useCrmCommand();
  const catalogue = useCatalogue();
  const set = (key, value) => { command.clearError(); setValues(old => ({ ...old, [key]: value })); };
  const showReferrer = originNeedsReferrer(values.origin_code) || !!lead.referrer || !!values.referrer;
  const changed = Object.keys(values).filter(key => String(values[key] ?? '').trim() !== String(start[key] ?? '').trim());
  const closer = useDirtyClose(changed.length > 0, command.busy, onClose);
  const returnFocus = useReturnFocus();
  const stale = isRecordConflict(command.error);
  async function submit(event) {
    event.preventDefault();
    const saved = await command.run('crm_update_prospect', () => {
      if (!changed.length) throw new Error('Précisez au moins une modification.');
      for (const key of ['phone', 'whatsapp']) {
        if (!changed.includes(key)) continue;
        const checked = checkPhone(values[key]);
        if (!checked.ok) throw new Error(`Saisissez un numéro valide (${key === 'phone' ? 'téléphone' : 'WhatsApp'}) : ${checked.error}.`);
      }
      const data = { lead_id: lead.id, expected_version: lead.version };
      for (const key of changed) {
        const value = String(values[key] ?? '').trim();
        if (key === 'referrer') data.referrer = value ? { name: value } : null;
        else data[key] = key === 'learner_age' ? (value === '' ? null : Number(value)) : value === '' ? null : value;
      }
      // A new origin that asks for its referrer sends the one typed (or kept).
      if (changed.includes('origin_code') && originNeedsReferrer(values.origin_code) && !changed.includes('referrer') && values.referrer.trim()) data.referrer = { name: values.referrer.trim() };
      return data;
    }, [lead.id, lead.version, changed.map(key => [key, values[key]])]);
    if (saved) {
      toast.success(saved.duplicate_candidates?.length ? 'Fiche modifiée · doublon possible à vérifier' : 'Fiche modifiée');
      onClose();
    }
  }
  return <Dialog open onOpenChange={value => { if (!value) closer.request(); }}><DialogContent onCloseAutoFocus={returnFocus} className={`operational ${STICKY_DIALOG} sm:max-w-[560px]`}>
    <DialogHeader><DialogTitle>Modifier la fiche</DialogTitle><DialogDescription>Contact et apprenant. L’historique garde l’ancienne et la nouvelle valeur (numéros masqués).</DialogDescription></DialogHeader>
    <form noValidate onSubmit={submit} className="space-y-4"><fieldset disabled={command.busy} className="grid gap-3 sm:grid-cols-2">
      {FIELDS.map(([key, label, type, max, required]) => <div key={key} className={['display_name', 'learner_name', 'program_interest_text', 'email'].includes(key) ? 'sm:col-span-2' : ''}><FormField label={label}>
        <input className={control} type={type} maxLength={max} required={required} min={type === 'number' ? 0 : undefined} max={type === 'number' ? 120 : undefined}
          value={values[key] ?? ''} onChange={e => set(key, e.target.value)} /></FormField></div>)}
      <FormField label="Programme"><select className={control} value={values.session_type} onChange={e => set('session_type', e.target.value)}><option value="">À préciser</option>{prospectProgrammes(catalogue.data, start.session_type).map(code => <option key={code} value={code}>{programmeName(code)}</option>)}</select></FormField>
      {lead.origin_editable === false
        ? <FormField label="Origine" help="Celle de son formulaire (Meta ou site web) : elle ne se modifie pas."><input className={control} disabled value={originLabel(lead.origin_code)} /></FormField>
        : <FormField label="Origine"><select className={control} value={values.origin_code} onChange={e => set('origin_code', e.target.value)}><option value="">Non renseignée</option>{[...SELECTABLE_ORIGINS, ...ORIGINS.filter(o => !o.selectable && o.code === start.origin_code)].map(o => <option key={o.code} value={o.code}>{o.label}</option>)}</select></FormField>}
      {showReferrer && <div className="sm:col-span-2"><FormField label="Recommandé par" help={lead.referrer && !lead.referrer.name ? `Actuellement : ${lead.referrer.label}. Un nom saisi le remplace.` : undefined}><input className={control} maxLength={200} required={originNeedsReferrer(values.origin_code)} value={values.referrer} onChange={e => set('referrer', e.target.value)} /></FormField></div>}
      {lead.contact?.phone_needs_review && <p className="text-xs text-amber-900 sm:col-span-2">Numéro à vérifier : le numéro enregistré n’est pas valide. Corrigez-le ou laissez-le vide.</p>}
      {(lead.siblings?.length > 0) && <p className="text-xs text-slate-600 sm:col-span-2">Le contact est partagé avec {lead.siblings.length} autre{lead.siblings.length > 1 ? 's' : ''} apprenant{lead.siblings.length > 1 ? 's' : ''} : ses changements s’appliquent à toutes leurs fiches.</p>}
    </fieldset><FormFooter error={stale ? null : command.error} stale={stale} busy={command.busy} onReload={onClose} onCancel={closer.request} cancelLabel="Annuler" /></form>
    {closer.guard}
  </DialogContent></Dialog>;
}
