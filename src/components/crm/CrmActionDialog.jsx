'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import FormField from '@/components/operational/FormField';
import { Button } from '@/components/ui/button';
import { crmRpc, useCrmRead, useCrmRefresh } from '@/lib/crm/queries';
import { STATUS, TASKS, OUTCOMES, LOST, NOT_QUALIFIED, scheduledLabel, phoneLinks, casablancaInstant, commandError, retryKey, staffLabel } from '@/lib/crm/presentation.mjs';
const titles = {
  manual: 'Ajouter un prospect',
  call: 'Enregistrer le résultat de l’appel',
  conversation: 'Enregistrer une conversation réelle',
  whatsapp: 'Suivi WhatsApp',
  note: 'Ajouter une note',
  schedule: 'Planifier une action',
  reschedule: 'Replanifier l’action',
  complete: 'Terminer l’action',
  cancel: 'Annuler l’action',
  qualify: 'Qualifier / avancer',
  lost: 'Clôturer comme perdu',
  unreachable: 'Clôturer : injoignable',
  notQualified: 'Clôturer comme non qualifié',
  reopen: 'Rouvrir le prospect',
  reassign: 'Attribuer un responsable'
};
const nextTypes = {
  callback: 'Rappel',
  whatsapp_followup: 'Suivi WhatsApp',
  confirm_placement_test: 'Préparer un test de niveau',
  center_visit: 'Visite au centre',
  enrollment_followup: 'Suivi de pré-inscription'
};
export const Field = FormField;
const inputClass = 'operational-control font-normal';
export default function CrmActionDialog({
  action,
  lead,
  task,
  onClose,
  onCreated,
  onCandidate,
  returnFocusRef
}) {
  const [values, setValues] = useState({
    outcome: '',
    decision: 'callback',
    unsuitableReason: 'age_not_suitable',
    kind: 'whatsapp_sent',
    taskType: 'callback',
    step: 'placement_test',
    reason: action === 'unreachable' ? 'unreachable' : action === 'notQualified' ? 'age_not_suitable' : 'not_interested',
    source: 'Téléphone',
    owner: lead?.owner_id || '',
    assignee: task?.assigned_to || '',
    channel: 'phone'
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [result, setResult] = useState(null),
    [staffOffset, setStaffOffset] = useState(0);
  const [expected, setExpected] = useState({
    lead: lead?.version,
    task: task?.version
  });
  const locked = useRef(false),
    request = useRef(null);
  const refresh = useCrmRefresh();
  const resultTasks = useCrmRead('crm_list_open_tasks', {p_lead:result?.lead?.id,p_limit:1,p_offset:0}, !!result?.lead?.id && !!result?.open_tasks?.[0] && !result.open_tasks[0].local_date);
  const resultNextTask = result?.open_tasks?.[0]?.local_date ? result.open_tasks[0] : resultTasks.data?.[0];
  const staff = useCrmRead('crm_list_staff', {
    p_limit: 50,
    p_offset: staffOffset
  }, action === 'reassign');
  const set = (key, value) => setValues(old => ({
    ...old,
    [key]: value
  }));
  const links = phoneLinks(lead?.contact);
  const returnFocus = useRef(typeof document !== 'undefined' ? document.activeElement : null);
  const conversation = action === 'call' && values.outcome === 'spoke_with_contact';
  const qualifying = action === 'qualify' || conversation && values.decision === 'qualify';
  const closing = ['lost', 'unreachable', 'notQualified'].includes(action);
  const needsTask = ['conversation', 'schedule', 'reschedule', 'qualify', 'reopen', 'complete', 'cancel'].includes(action) || action === 'call' && (values.outcome === 'wrong_number' || conversation && ['callback', 'qualify'].includes(values.decision)) || action === 'whatsapp' && values.kind === 'meaningful_whatsapp_conversation';
  const text = (key, label, required = false, type = 'text', maxLength = 200) => <Field label={label}><input className={inputClass} type={type} maxLength={maxLength} required={required} value={values[key] || ''} onChange={e => set(key, e.target.value)} /></Field>;
  const select = (key, label, options) => <Field label={label}><select required className={inputClass} value={values[key]} onChange={e => set(key, e.target.value)}>{!values[key] && <option value="">Choisir explicitement…</option>}{Object.entries(options).map(([value, label]) => <option key={value} value={value} disabled={key === 'reason' && value === 'unreachable' && !lead?.unreachable_eligible}>{label}</option>)}</select></Field>;
  function payload() {
    if (action === 'manual') return ['crm_create_manual_lead', {
      display_name: values.name.trim(),
      learner_name: values.learner.trim(),
      learner_age: values.age ? Number(values.age) : null,
      phone: values.phone || null,
      whatsapp: values.whatsapp || null,
      email: values.email || null,
      program_interest_text: values.program || null,
      source_label: `Manuel · ${values.source}`,
      contact_kind: 'unknown'
    }];
    const data = {
      lead_id: lead.id,
      expected_version: expected.lead
    };
    const withTask = () => {
      if (task) {
        data.task_id = task.id;
        data.expected_task_version = expected.task;
      }
    };
    const next = needsTask ? {
      task_type: qualifying ? {
        placement_test: 'confirm_placement_test',
        center_visit: 'center_visit',
        enrollment: 'enrollment_followup'
      }[values.step] || values.taskType : conversation ? 'callback' : values.taskType,
      due_at: casablancaInstant(values.due),
      instructions: values.instructions || null
    } : null;
    if (action === 'note') return ['crm_add_note', {
      ...data,
      note: values.note.trim()
    }];
    if (action === 'call') {
      withTask();
      if (conversation) return ['crm_record_conversation_decision', {
        ...data, decision: values.decision, note: values.note.trim(),
        ...(next ? { next_task: next } : {}),
        ...(values.decision === 'qualify' ? { qualification_step: values.step } : {}),
        ...(values.decision === 'lost' ? { reason: 'not_interested' } : {}),
        ...(values.decision === 'not_qualified' ? { reason: values.unsuitableReason } : {})
      }];
      return ['crm_record_call_outcome', {
        ...data,
        outcome: values.outcome,
        note: values.note || null,
        ...(next ? {
          next_task: next
        } : {})
      }];
    }
    if (action === 'conversation') {
      if (values.channel === 'phone') return ['crm_record_conversation_decision', {...data,decision:'callback',note:values.note.trim(),next_task:{...next,task_type:'callback'}}];
      if (values.channel === 'whatsapp') return ['crm_record_whatsapp', {...data,kind:'meaningful_whatsapp_conversation',note:values.note.trim(),next_task:next}];
      return ['crm_record_conversation', {...data,channel:'in_person',note:values.note.trim(),next_task:next}];
    }
    if (action === 'whatsapp') return ['crm_record_whatsapp', {
      ...data,
      kind: values.kind,
      note: values.note || null,
      ...(next ? {
        next_task: next
      } : {})
    }];
    if (['schedule', 'reschedule'].includes(action)) {
      withTask();
      return ['crm_schedule_task', {
        ...data,
        task: task ? {
          due_at: next.due_at,
          instructions: next.instructions
        } : next
      }];
    }
    if (action === 'complete') {
      withTask();
      return ['crm_complete_task', {
        ...data,
        outcome: values.note.trim(),
        next_task: next
      }];
    }
    if (action === 'cancel') {
      withTask();
      return ['crm_cancel_task', {
        ...data,
        reason: values.note.trim(),
        next_task: next
      }];
    }
    if (action === 'qualify') return ['crm_qualify_lead', {
      ...data,
      qualification_step: values.step,
      note: values.note || null,
      ...(!lead.last_conversation_at ? {
        conversation_channel: values.channel
      } : {}),
      next_task: next
    }];
    if (closing) return [action === 'notQualified' ? 'crm_close_not_qualified' : 'crm_close_lost', {
      ...data,
      reason: values.reason,
      note: values.note || null
    }];
    if (action === 'reopen') return ['crm_reopen_lead', {
      ...data,
      reason: values.note.trim(),
      next_task: next
    }];
    if (task) { withTask(); return ['crm_reassign', {...data,assigned_to:values.assignee || null}]; }
    return ['crm_reassign', {...data,owner_id:values.owner || null}];
  }
  async function submit(event) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      const intent = JSON.stringify([action, values, task?.id]);
      // An uncertain response may have committed. Preserve its exact payload even
      // if a background refresh has since advanced the lead/task versions.
      if (request.current?.intent !== intent) {
        const [command, data] = payload();
        // Catch already-stale forms promptly. The command still enforces versions
        // transactionally; this observational check never replaces that guard.
        // Never preflight an uncertain retry: its original key may already exist.
        if (action !== 'manual') {
          const latest = await crmRpc('crm_get_workspace_detail', {
            p_lead: lead.id
          });
          const latestTask = latest?.open_tasks?.find(t => t.id === task?.id);
          if (!latest || latest.version !== expected.lead || task && (latestTask && latestTask.version !== expected.task || !latestTask && latest.open_task_count <= 100)) {
            setExpected({
              lead: latest?.version,
              task: latestTask?.version
            });
            throw {
              code: '40001'
            };
          }
        }
        request.current = {
          ...retryKey(null, command, data),
          intent,
          command,
          data
        };
      }
      const saved = await crmRpc(request.current.command, {
        p_request_key: request.current.key,
        p_data: request.current.data
      });
      setResult(saved);
      await refresh();
      toast.success('Enregistré');
    } catch (err) {
      setError(err instanceof Error && !err.code && /^Choisissez|^Cette heure/.test(err.message) ? err.message : commandError(err));
      if (err?.code === '40001') {
        const latest = await crmRpc('crm_get_workspace_detail', {
          p_lead: lead.id
        }).catch(() => null);
        if (latest) setExpected({
          lead: latest.version,
          task: latest.open_tasks?.find(t => t.id === task?.id)?.version
        });
        await refresh();
        request.current = null;
      } else if (['22023', '42501'].includes(err?.code)) {
        request.current = null;
      }
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return <Dialog open onOpenChange={open => {
    if (!open && !busy) onClose();
  }}><DialogContent onCloseAutoFocus={event => { event.preventDefault(); (returnFocus.current?.isConnected ? returnFocus.current : returnFocusRef?.current)?.focus(); }} className="operational max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[640px]" onInteractOutside={e => {
      if (busy) e.preventDefault();
    }} onEscapeKeyDown={e => {
      if (busy) e.preventDefault();
    }}><DialogHeader><DialogTitle>{titles[action]}</DialogTitle><DialogDescription>{action === 'manual' ? 'Un contact, un apprenant, une prochaine conversation.' : lead?.contact_name}</DialogDescription></DialogHeader>
 {result ? <div className="space-y-4" role="status"><p className="font-medium">{action === 'manual' ? 'Nouveau prospect créé.' : 'Action enregistrée.'} {STATUS[result.lead.status]}</p>{result.open_tasks?.[0] && <div className="rounded-lg bg-blue-50 p-4 text-sm"><p className="font-medium">Prochaine action · {TASKS[resultNextTask?.task_type || result.open_tasks[0].task_type] || 'Action'}</p><p className="mt-1">{scheduledLabel(resultNextTask)}</p><p className="mt-2 text-xs text-slate-500">{resultNextTask?.local_date ? 'Horaire confirmé par le calendrier de suivi.' : 'Consultez la fiche pour confirmer l’horaire.'}</p></div>}{result.unreachable_eligible && <p className="text-sm">{result.failed_attempts} appels infructueux. Vous pouvez prévoir un autre appel ou clôturer comme injoignable depuis la fiche.</p>}
  {action === 'manual' && result.contact_candidates?.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm"><p className="font-medium">Contact existant possible</p><p className="my-2">Le nouveau prospect est déjà créé. Aucun contact n’a été fusionné. Ouvrir un contact existant ne rattache pas cette demande à son dossier.</p>{result.contact_candidates.map(candidate => <div key={candidate.id} className="mt-3"><p>{candidate.display_name}</p><Button variant="link" className="px-0" onClick={() => onCandidate(candidate.id)}>Ouvrir les prospects existants</Button></div>)}</div>}

  <Button disabled={busy} onClick={() => action === 'manual' ? onCreated(result.lead.id) : onClose()}>{action === 'manual' ? 'Continuer avec le nouveau prospect' : 'Terminé'}</Button>
 </div> : <form onSubmit={submit} className="space-y-4"><fieldset disabled={busy} className="space-y-4">
  {action === 'manual' && <>{text('name', 'Nom du contact', true)}{text('phone', 'Téléphone', false, 'tel')}{text('whatsapp', 'WhatsApp (si différent)', false, 'tel')}<div className="grid grid-cols-[2fr_1fr] gap-3">{text('learner', 'Nom de l’apprenant', true)}<Field label="Âge"><input className={inputClass} type="number" min="0" max="120" value={values.age || ''} onChange={e => set('age', e.target.value)} /></Field></div>{text('program', 'Programme / intérêt')}{select('source', 'Origine', {
              'Téléphone': 'Téléphone',
              'Visite au centre': 'Visite au centre',
              WhatsApp: 'WhatsApp',
              Recommandation: 'Recommandation',
              Autre: 'Autre'
            })}<details><summary className="cursor-pointer text-sm text-slate-500">Ajouter un e-mail</summary><div className="mt-3">{text('email', 'E-mail', false, 'email', 254)}</div></details></>}
  {action === 'call' && <><p className="break-all text-sm">{lead.phone || 'Téléphone à préciser'}</p><Button type="button" variant="outline" disabled={!lead.phone} onClick={async () => { try { await navigator.clipboard.writeText(lead.phone); toast.success('Numéro copié'); } catch { setError('Copie indisponible ; sélectionnez le numéro.'); } }}>Copier le numéro</Button>{links.tel && <a data-touch-target className="inline-flex min-h-9 items-center rounded-md border px-4 text-sm font-medium" href={links.tel}>Appeler {lead.phone}</a>}<p className="text-xs text-slate-500">Ouvrir l’appel n’enregistre rien. Enregistrez le résultat après votre appel.</p>{select('outcome', 'Résultat de l’appel', OUTCOMES)}{!links.tel && <p className="text-sm text-slate-600">Aucun numéro valide pour lancer l’appel. Vous pouvez enregistrer un échange déjà effectué.</p>}{conversation && <>{select('decision', 'Quelle suite donner ?', { callback: 'Rappeler plus tard', ...(lead.status !== 'QUALIFIED' ? { qualify: 'Avancer dans le projet' } : {}), lost: 'Pas intéressé', not_qualified: 'Non adapté' })}{values.decision === 'not_qualified' && select('unsuitableReason', 'Motif', NOT_QUALIFIED)}</>}</>}
  {action === 'conversation' && <>{select('channel', 'Canal de la conversation', {phone:'Téléphone',whatsapp:'WhatsApp',in_person:'Au centre'})}{values.channel === 'whatsapp' && <p className="break-all text-sm">WhatsApp : {links.whatsapp ? `+${links.whatsapp.split('/').at(-1)}` : 'Indisponible'}</p>}</>}
  {action === 'whatsapp' && <><p className="break-all text-sm font-medium">WhatsApp : {links.whatsapp ? `+${links.whatsapp.split('/').at(-1)}` : 'Indisponible'}</p>{links.whatsapp && <a data-touch-target className="inline-flex min-h-9 items-center rounded-md border px-4 text-sm font-medium" href={links.whatsapp} target="_blank" rel="noopener noreferrer">Ouvrir WhatsApp</a>}<p className="text-xs text-slate-500">Ouvrir WhatsApp n’enregistre aucun envoi.</p>{!links.whatsapp && <p className="text-sm text-slate-600">Aucun numéro WhatsApp valide. Vous pouvez enregistrer un échange déjà effectué.</p>}{select('kind', 'Que souhaitez-vous enregistrer ?', {
              whatsapp_sent: 'Message envoyé',
              meaningful_whatsapp_conversation: 'Conversation réelle avec le parent'
            })}</>}
  {qualifying && <>{select('step', 'Le parent souhaite…', {
              placement_test: 'Préparer un test de niveau',
              center_visit: 'Visiter le centre',
              enrollment: 'Avancer vers une inscription',
              other: 'Autre prochaine étape'
            })}{values.step === 'placement_test' && <p className="rounded-lg bg-blue-50 p-3 text-sm">Cette action prépare le suivi du test. Elle ne réserve aucun test de niveau.</p>}{!conversation && !lead.last_conversation_at && select('channel', 'Conversation ayant confirmé ce projet', {
              phone: 'Téléphone',
              whatsapp: 'WhatsApp',
              in_person: 'Au centre'
            })}</>}
  {closing && <>{select('reason', 'Motif', action === 'notQualified' ? NOT_QUALIFIED : LOST)}{values.reason === 'unreachable' && <p className="text-sm">{lead.failed_attempts} / 5 appels infructueux dans la séquence actuelle.</p>}</>}
  {action === 'reassign' && <><Field label={task ? 'Responsable de l’action' : 'Responsable du prospect'}><select className={inputClass} value={task ? values.assignee : values.owner} onChange={e => set(task ? 'assignee' : 'owner', e.target.value)}><option value="">Non attribué</option>{(task ? values.assignee : values.owner) && !staff.data?.rows.some(p => p.id === (task ? values.assignee : values.owner)) && <option value={task ? values.assignee : values.owner}>Responsable sélectionné</option>}{staff.data?.rows.map(person => <option key={person.id} value={person.id}>{staffLabel(person)}</option>)}</select></Field>{staff.isError && <p role="alert" className="text-sm">Liste indisponible. <button type="button" onClick={() => staff.refetch()}>Réessayer</button></p>}{(staff.data?.total > 50 || staffOffset > 0) && <div className="flex gap-2"><Button type="button" variant="outline" disabled={!staffOffset} onClick={() => setStaffOffset(x => Math.max(0, x - 50))}>Précédents</Button><Button type="button" variant="outline" disabled={staffOffset + 50 >= staff.data?.total} onClick={() => setStaffOffset(x => x + 50)}>Suivants</Button></div>}<p className="text-xs text-slate-500">{task ? 'Seule cette action change de responsable. Le responsable du prospect reste inchangé.' : 'Les responsables des actions déjà prévues restent inchangés.'}</p></>}
  {!['manual', 'reassign', 'schedule', 'reschedule'].includes(action) && <Field label={['cancel', 'reopen'].includes(action) ? 'Motif' : action === 'complete' ? 'Résultat de l’action' : 'Note'}><textarea className={`${inputClass} min-h-24`} maxLength={4000} required={conversation || action === 'conversation' || action === 'whatsapp' && values.kind === 'meaningful_whatsapp_conversation' || ['note', 'cancel', 'reopen', 'complete'].includes(action) || closing && values.reason === 'other' || action === 'qualify' && (!lead.last_conversation_at || values.step === 'other')} value={values.note || ''} onChange={e => set('note', e.target.value)} /></Field>}
  {needsTask && <div className="space-y-3 rounded-lg border bg-slate-50 p-4"><h3 className="text-sm font-semibold">{action === 'reschedule' ? 'Nouvel horaire' : 'Prochaine action'}</h3>{action !== 'reschedule' && !(qualifying && values.step !== 'other') && !(conversation && values.decision === 'callback') && !(action === 'conversation' && values.channel === 'phone') && select('taskType', 'Action', nextTypes)}<Field label="Date et heure · Casablanca"><input className={inputClass} type="datetime-local" required value={values.due || ''} onChange={e => set('due', e.target.value)} /></Field>{text('instructions', 'Précisions (facultatif)', false, 'text', 4000)}<p className="text-xs text-slate-500">Les appels hors horaires d’ouverture sont décalés au prochain créneau par le calendrier de suivi.</p></div>}
  </fieldset>{error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Annuler</Button><Button type="submit" disabled={busy || action === 'unreachable' && !lead.unreachable_eligible}>{busy ? 'Enregistrement…' : 'Enregistrer'}</Button></div>
 </form>}
 </DialogContent></Dialog>;
}
