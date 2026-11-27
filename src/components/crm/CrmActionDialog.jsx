'use client';
import { pluralFr } from '@/lib/ui/pluralFr.mjs';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import FormField from '@/components/operational/FormField';
import { Button } from '@/components/ui/button';
import { crmRpc, useCrmRead, useCrmRefresh } from '@/lib/crm/queries';
import DialogStickyFooter, { FOOTER_ALERT, STICKY_DIALOG } from './DialogStickyFooter';
import { NextActionPicker } from './NextActionDialog';
import { NEXT_KINDS, nextActionPayload, STALE_MESSAGE, STATUS, OUTCOMES, NOT_QUALIFIED, SCHEDULE_KINDS, REMINDER_PRESETS, CONVERSATION_OUTCOMES, scheduledLabel, phoneLinks, casablancaInstant, commandError, retryKey, staffLabel, conversationOutcomes, outcomeStage, outcomeTask, scheduleKindRule, nextTaskSpec, conversationDecision, taskTitle, noteRequired as requiresNote } from '@/lib/crm/presentation.mjs';
import { CONFLICT_CODE, isRecordConflict } from '@/lib/conflictErrors.mjs';
import { checkPhone, formatPhoneFr } from '@/lib/phone.mjs';
import { acknowledgedMatches, allAnswered, duplicateMatches, personHref } from '@/lib/people.mjs';
import DuplicateGate from '@/components/people/DuplicateGate';
import { CLOSE_MENU, CLOSE_REASON_LABELS, NOT_INTERESTED_WHY, SELECTABLE_ORIGINS, closeChoice, originNeedsReferrer } from '@/lib/catalogue.mjs';
import { programmeName } from '@/lib/programCatalog.mjs';
import { prospectProgrammes, useCatalogue } from '@/lib/useCatalogue';
const titles = {
  manual: 'Ajouter un prospect',
  sibling: 'Ajouter un enfant',
  call: 'Enregistrer le résultat de l’appel',
  conversation: 'Enregistrer un échange',
  whatsapp: 'Suivi WhatsApp',
  note: 'Ajouter une note',
  schedule: 'Planifier une action',
  reschedule: 'Replanifier l’action',
  complete: 'Terminer l’action',
  cancel: 'Annuler l’action',
  qualify: 'Qualifier / avancer',
  close: 'Clôturer le prospect',
  lost: 'Clôturer le prospect',
  unreachable: 'Clôturer : injoignable',
  notQualified: 'Clôturer le prospect',
  reopen: 'Rouvrir le prospect',
  reassign: 'Attribuer un responsable'
};
const nextTypes = {
  callback: 'Rappel',
  whatsapp_followup: 'Suivi WhatsApp',
  confirm_placement_test: 'Préparer un test de niveau',
  center_visit: 'Rendez-vous au centre',
  enrollment_followup: 'Suivi d’inscription'
};
// A reopened prospect is not qualified: its first appointment is booked through
// « Noter un échange » (OD-11), so reopening offers no appointment.
const REOPEN_TYPES = Object.fromEntries(Object.entries(nextTypes).filter(([key]) => key !== 'center_visit'));
const stepTasks = {
  placement_test: 'confirm_placement_test',
  center_visit: 'center_visit',
  enrollment: 'enrollment_followup'
};
const COMPLETION_LIMIT = 200;
// A walk-in, an inbound call or a WhatsApp conversation is created with its first exchange
// (§4.2/§4.8): the next action agreed now, in the same form; otherwise « Premier contact ».
const FIRST_CHANNEL = { 'Téléphone': 'phone', 'Visite au centre': 'in_person', WhatsApp: 'whatsapp' };
// How the contact reached us now (the manual first touch, « Manuel · … »). Where they
// heard of the centre is the origin (§5.4), chosen separately.
const CHANNELS = { 'Téléphone': 'Téléphone', 'Visite au centre': 'Visite au centre', WhatsApp: 'WhatsApp', Autre: 'Autre' };
// One close form (§5.4): every former entry point opens it; « Injoignable » preselected.
const CLOSE_ACTIONS = ['close', 'lost', 'unreachable', 'notQualified'];
const FIRST_KINDS = ['none', 'center_visit', 'callback', 'our_step', 'awaiting', 'enrol'];
const FIRST_LABELS = { ...NEXT_KINDS, none: 'Pas encore parlé · Premier contact' };
export const Field = FormField;
const inputClass = 'operational-control font-normal';
export default function CrmActionDialog({
  action,
  lead,
  task,
  contact,
  onClose,
  onCreated,
  onCandidate,
  returnFocusRef
}) {
  const [values, setValues] = useState({
    outcome: '',
    interaction: '',
    scheduleKind: '',
    preset: 'tomorrow',
    unsuitableReason: 'age_not_suitable',
    kind: 'whatsapp_sent',
    taskType: 'callback',
    step: 'placement_test',
    reason: action === 'unreachable' ? 'unreachable' : '',
    why: '',
    source: 'Téléphone',
    owner: lead?.owner_id || '',
    assignee: task?.assigned_to || '',
    channel: 'phone'
  });
  const [first, setFirst] = useState({ kind: 'none' });
  // « Ajouter un enfant » (§5.3): a new learner on an existing contact, reused as it is.
  const sibling = action === 'manual' && !!contact?.id;
  // « C'est la même personne » (§5.3): ticked while the learner field is empty; typing a
  // learner name unticks it. The learner is then the contact (contact_kind adult_learner).
  const [sameChoice, setSameChoice] = useState(null);
  const samePerson = action === 'manual' && !sibling && (sameChoice ?? !(values.learner || '').trim());
  // §5.2 duplicate gate: the server's matches, and one answer for each.
  const [matches, setMatches] = useState(null), [answers, setAnswers] = useState({});
  // A walk-in has always spoken with us: no « Pas encore parlé », the agreed next
  // action is chosen now and no « Premier contact » is created (§4.8, review of #208).
  const walkIn = action === 'manual' && values.source === 'Visite au centre';
  const firstForm = walkIn && first.kind === 'none' ? { ...first, kind: '' } : first;
  const firstKinds = walkIn ? FIRST_KINDS.filter(kind => kind !== 'none') : FIRST_KINDS;
  // §4.9 / NF-1: a stale save is refused and the form keeps its draft; « Recharger »
  // re-reads the prospect and shows its new state before the save is enabled again.
  // The dialog never adopts a newer version on its own.
  const [stale, setStale] = useState(false), [reloaded, setReloaded] = useState(null);
  const hours = useCrmRead('crm_get_centre_hours', {}, action === 'manual');
  const catalogue = useCatalogue(action === 'manual');
  const [selectedStaffLabel, setSelectedStaffLabel] = useState((task ? task.assignee_display_label : lead?.owner_display_label) || 'Responsable indisponible');
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
  // Outcome-led: record what happened in a real conversation; the server derives the stage.
  const outcomeLed = action === 'call' && values.outcome === 'spoke_with_contact' || action === 'conversation' || action === 'whatsapp' && values.kind === 'meaningful_whatsapp_conversation';
  const channel = action === 'call' ? 'phone' : action === 'whatsapp' ? 'whatsapp' : values.channel;
  // A hidden conversation result must never influence the form or payload.
  const interactionKey = outcomeLed ? values.interaction : '';
  const interaction = CONVERSATION_OUTCOMES[interactionKey] || null;
  const qualifying = action === 'qualify';
  const closing = CLOSE_ACTIONS.includes(action);
  const closingOutcome = ['lost', 'not_qualified'].includes(interaction?.decision);
  const needsTask = ['schedule', 'reschedule', 'qualify', 'reopen', 'complete', 'cancel'].includes(action) || action === 'call' && values.outcome === 'wrong_number' || !!interaction && !closingOutcome;
  const fixedTask = qualifying ? stepTasks[values.step] : interaction ? outcomeTask(interactionKey, channel) : null;
  const taskType = fixedTask || values.taskType;
  const kindRule = scheduleKindRule(taskType, values.scheduleKind || interaction?.defaultKind);
  const exactTime = action === 'reschedule' || kindRule.kind === 'appointment' || values.preset === 'exact';
  const noteRequired = closing ? values.reason === 'other' || (values.reason === 'not_interested' && values.why === 'not_interested')
    : requiresNote({ action, outcomeLed, interaction: values.interaction, reason: values.reason, step: values.step, unsuitableReason: values.unsuitableReason });
  const agreedCallback = action !== 'reschedule' ? kindRule.kind === 'appointment' && taskType === 'callback' : task?.task_type === 'callback' && task?.schedule_kind === 'appointment';
  const text = (key, label, required = false, type = 'text', maxLength = 200) => <Field label={label}><input className={inputClass} type={type} maxLength={maxLength} required={required} value={values[key] || ''} onChange={e => set(key, e.target.value)} /></Field>;
  const select = (key, label, options) => <Field label={label}><select required className={inputClass} value={values[key]} onChange={e => set(key, e.target.value)}>{!values[key] && <option value="">Choisir explicitement…</option>}{Object.entries(options).map(([value, label]) => <option key={value} value={value} disabled={key === 'reason' && value === 'unreachable' && !lead?.unreachable_eligible}>{label}</option>)}</select></Field>;
  function payload() {
    if (action === 'manual') {
      for (const key of sibling ? [] : ['phone', 'whatsapp']) {
        const checked = checkPhone(values[key]);
        if (!checked.ok) throw new Error(`Saisissez un numéro valide (${key === 'phone' ? 'téléphone' : 'WhatsApp'}) : ${checked.error}.`);
      }
      if (matches?.length && !allAnswered(matches, answers)) throw new Error('Choisissez une réponse pour chaque fiche existante.');
      return ['crm_create_prospect', {
        ...(sibling ? { contact_id: contact.id } : {
          display_name: values.name.trim(),
          phone: values.phone?.trim() || null,
          whatsapp: values.whatsapp?.trim() || null,
          email: values.email?.trim() || null,
          ...(samePerson ? { same_person: true } : { contact_kind: 'unknown' })
        }),
        ...(samePerson ? {} : { learner_name: values.learner.trim() }),
        learner_age: values.age ? Number(values.age) : null,
        ...(values.programme ? { session_type: values.programme } : {}),
        program_interest_text: values.program?.trim() || null,
        source_label: `Manuel · ${values.source}`,
        ...(values.origin ? { origin_code: values.origin } : {}),
        ...(values.origin && originNeedsReferrer(values.origin) ? { referrer: { name: values.referrer?.trim() || null } } : {}),
        ...(matches?.length ? { acknowledged_matches: acknowledgedMatches(matches, answers) } : {}),
        ...(FIRST_CHANNEL[values.source] && firstForm.kind !== 'none' ? { first_exchange: { channel: FIRST_CHANNEL[values.source], next: nextActionPayload(firstForm, null) } } : {})
      }];
    }
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
    const next = needsTask && action !== 'reschedule' ? nextTaskSpec({
      taskType,
      kind: kindRule.kind,
      preset: values.preset,
      due: values.due,
      instructions: values.instructions
    }) : null;
    // M-A2 (migration 137) revokes the old command wrappers. The drawer opens this dialog
    // only to close, reopen or reassign (« Noter un échange » and « Changer » have their own
    // dialogs); any other action is refused here, never sent to a revoked function.
    if (![...CLOSE_ACTIONS, 'reopen', 'reassign'].includes(action)) throw new Error(`Unsupported CRM action: ${action}`);
    // RWR-r5 §4.3 / §5.4: the replacement commands; the server derives the status.
    if (closing) return ['crm_close_prospect', {
      ...data,
      ...closeChoice({ reason: values.reason, why: values.why, closeNote: values.note })
    }];
    if (action === 'reopen') return ['crm_reopen_prospect', {
      ...data,
      reason: values.note.trim(),
      next
    }];
    if (task) { withTask(); return ['crm_reassign', {...data,assigned_to:values.assignee || null}]; }
    return ['crm_reassign', {...data,owner_id:values.owner || null}];
  }
  async function reload() {
    const latest = await crmRpc('crm_get_workspace_detail', { p_lead: lead.id }).catch(() => null);
    if (!latest) { setError('Rechargement impossible. Réessayez.'); return; }
    await refresh();
    setExpected({ lead: latest.version, task: latest.open_tasks?.find(t => t.id === task?.id)?.version });
    setReloaded(latest);
    setStale(false);
  }
  async function submit(event) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      const intent = JSON.stringify([action, values, task?.id, action === 'manual' ? [firstForm, samePerson, answers] : null, expected]);
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
            throw {
              code: CONFLICT_CODE
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
      await refresh();
      // No success pop-up (§4.9): a toast, and a new prospect opens in the drawer. Only
      // possible existing contacts keep the result screen. « Inscrire maintenant » goes on
      // to « Inscrire et encaisser » in the same flow (RWR-r5 C1, day script 2).
      if (action === 'manual' && saved?.contact_candidates?.length) { setResult(saved); toast.success('Prospect créé'); }
      else if (action === 'manual') { toast.success('Prospect créé'); onCreated(saved.lead.id, firstForm.kind === 'enrol'); }
      else { toast.success('Enregistré'); onClose(); }
    } catch (err) {
      const found = action === 'manual' ? duplicateMatches(err) : null;
      if (found) {
        // Nothing was created: the gate lists the matches; the next save sends the answers.
        request.current = null;
        setMatches(found);
        setAnswers(old => Object.fromEntries(Object.entries(old).filter(([key]) => found.some(m => `${m.kind}:${m.id}` === key))));
        setError(found.length ? 'Cette personne existe peut-être déjà : répondez pour chaque fiche, puis enregistrez.' : 'Doublon possible : vérifiez la recherche avant de créer.');
        return;
      }
      if (isRecordConflict(err)) {
        setError('');
        setReloaded(null);
        setStale(true);
        request.current = null;
      } else if (['22023', '42501'].includes(err?.code)) {
        request.current = null;
      }
      if (!isRecordConflict(err)) setError(err instanceof Error && !err.code && /^Choisissez|^Cette heure|^Saisissez|^Précisez/.test(err.message) ? err.message : err?.hint === 'crm_create.walk_in_exchange_required' ? 'Une visite au centre s’enregistre avec ce qui a été convenu : choisissez la prochaine action.' : commandError(err));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return <Dialog open onOpenChange={open => {
    if (!open && !busy) onClose();
  }}><DialogContent onCloseAutoFocus={event => { event.preventDefault(); (returnFocus.current?.isConnected ? returnFocus.current : returnFocusRef?.current)?.focus(); }} className={`operational ${STICKY_DIALOG} sm:max-w-[640px]`} onInteractOutside={e => {
      if (busy) e.preventDefault();
    }} onEscapeKeyDown={e => {
      if (busy) e.preventDefault();
    }}><DialogHeader><DialogTitle>{titles[sibling ? 'sibling' : action]}</DialogTitle><DialogDescription>{sibling ? `Nouvel apprenant pour ${contact.display_name || 'ce contact'} : même téléphone, prochaine action à part.` : action === 'manual' ? 'Un contact, un apprenant, une prochaine conversation.' : lead?.contact_name}</DialogDescription></DialogHeader>
 {result ? <div className="space-y-4" role="status"><p className="font-medium">{action === 'manual' ? 'Nouveau prospect créé.' : 'Action enregistrée.'} {STATUS[result.lead.status]}</p>{result.open_tasks?.[0] && <div className="rounded-lg bg-blue-50 p-4 text-sm"><p className="font-medium" data-testid="result-next-action">Prochaine action · {result.next_action?.label || taskTitle(resultNextTask || result.open_tasks[0])}</p>{SCHEDULE_KINDS[resultNextTask?.schedule_kind] && <p className="mt-1 text-xs font-medium text-blue-900">{SCHEDULE_KINDS[resultNextTask.schedule_kind]}</p>}{!result.next_action?.label && <p className="mt-1">{scheduledLabel(resultNextTask)}</p>}<p className="mt-2 text-xs text-slate-500">{resultNextTask?.local_date ? 'Horaire confirmé par le calendrier de suivi.' : 'Consultez la fiche pour confirmer l’horaire.'}</p></div>}{result.unreachable_eligible && <p className="text-sm">{pluralFr(result.failed_attempts, 'appel infructueux', 'appels infructueux')}. Vous pouvez prévoir un autre appel ou clôturer comme injoignable depuis la fiche.</p>}
  {action === 'manual' && result.contact_candidates?.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm"><p className="font-medium">Contact existant possible</p><p className="my-2">Le nouveau prospect est déjà créé. Aucun contact n’a été fusionné. Ouvrir un contact existant ne rattache pas cette demande à son dossier.</p>{result.contact_candidates.map(candidate => <div key={candidate.id} className="mt-3"><p>{candidate.display_name}</p><Button variant="link" className="px-0" onClick={() => onCandidate(candidate.id)}>Ouvrir les prospects existants</Button></div>)}</div>}

  <Button disabled={busy} onClick={() => action === 'manual' ? onCreated(result.lead.id, firstForm.kind === 'enrol') : onClose()}>{action === 'manual' ? 'Continuer avec le nouveau prospect' : 'Terminé'}</Button>
 </div> : <form onSubmit={submit} className="space-y-4"><fieldset disabled={busy} className="space-y-4">
  {action === 'manual' && <>{sibling ? <p className="rounded-lg bg-slate-50 p-3 text-sm">Contact : <span className="font-medium">{contact.display_name}</span>{contact.phone_masked ? ` · ${contact.phone_masked}` : ''}</p> : <>{text('name', 'Nom du contact', true)}{text('phone', 'Téléphone', false, 'tel')}{text('whatsapp', 'WhatsApp (si différent)', false, 'tel')}</>}
   <div className="grid grid-cols-[2fr_1fr] gap-3"><Field label="Nom de l’apprenant" help={samePerson ? 'Vide : l’apprenant est le contact.' : undefined}><input className={inputClass} maxLength={200} required={!samePerson} value={values.learner || ''} onChange={e => { set('learner', e.target.value); setSameChoice(null); }} /></Field><Field label="Âge"><input className={inputClass} type="number" min="0" max="120" value={values.age || ''} onChange={e => set('age', e.target.value)} /></Field></div>
   {!sibling && <label className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" checked={samePerson} onChange={e => { setSameChoice(e.target.checked); if (e.target.checked) set('learner', ''); }} />C’est la même personne</label>}
   <div className="grid gap-3 sm:grid-cols-2"><Field label="Programme"><select className={inputClass} value={values.programme || ''} onChange={e => set('programme', e.target.value)}><option value="">À préciser</option>{prospectProgrammes(catalogue.data).map(code => <option key={code} value={code}>{programmeName(code)}</option>)}</select></Field>
   {text('program', 'Précision sur le programme (facultatif)', false, 'text', 500)}</div>
   <div className="grid gap-3 sm:grid-cols-2">{select('source', 'Canal', CHANNELS)}
   <Field label="Origine" help="Comment le contact a connu le centre (facultatif)."><select className={inputClass} value={values.origin || ''} onChange={e => set('origin', e.target.value)}><option value="">Non renseignée</option>{SELECTABLE_ORIGINS.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field></div>
   {originNeedsReferrer(values.origin) && text('referrer', 'Recommandé par', true)}{!sibling && <details><summary className="cursor-pointer text-sm text-slate-500">Ajouter un e-mail</summary><div className="mt-3">{text('email', 'E-mail', false, 'email', 254)}</div></details>}
  {matches && <DuplicateGate matches={matches} answers={answers} onAnswer={(key, value) => { setError(''); setAnswers(old => ({ ...old, [key]: value })); }} onOpen={m => { if (m.kind === 'prospect' && onCreated) { onCreated(m.id); } else { window.location.assign(personHref(m)); } }} />}
  {FIRST_CHANNEL[values.source] && <section aria-label="Premier échange" className="space-y-2 rounded-lg border bg-slate-50 p-4"><h3 className="text-sm font-semibold">Premier échange</h3><p className="text-xs text-slate-600">{walkIn ? 'Le visiteur est au centre : choisissez ce qui est convenu avec lui.' : 'Vous parlez avec le contact maintenant ? Choisissez ce qui est convenu. Sinon, un « Premier contact » est prévu.'}</p>
   <NextActionPicker form={firstForm} setForm={value => { setError(''); setFirst(typeof value === 'function' ? old => value(walkIn && old.kind === 'none' ? { ...old, kind: '' } : old) : value); }} current={null} lead={null} hours={hours.data} kinds={firstKinds} labels={FIRST_LABELS} suggestDate /></section>}</>}
  {action === 'call' && <><p className="break-all text-sm">{lead.phone ? formatPhoneFr(lead.phone) : 'Téléphone à préciser'}</p><Button type="button" variant="outline" disabled={!lead.phone} onClick={async () => { try { await navigator.clipboard.writeText(lead.phone); toast.success('Numéro copié'); } catch { setError('Copie indisponible ; sélectionnez le numéro.'); } }}>Copier le numéro</Button>{links.tel && <a className="hidden min-h-11 items-center rounded-md border px-4 text-sm font-medium max-sm:[@media(pointer:coarse)]:inline-flex" href={links.tel}>Appeler {formatPhoneFr(lead.phone)}</a>}<p className="text-xs text-slate-500">Ouvrir l’appel n’enregistre rien. Enregistrez le résultat après votre appel.</p>{select('outcome', 'Résultat de l’appel', OUTCOMES)}{!links.tel && <p className="text-sm text-slate-600">Aucun numéro valide pour lancer l’appel. Vous pouvez enregistrer un échange déjà effectué.</p>}</>}
  {action === 'conversation' && <>{select('channel', 'Canal de la conversation', {phone:'Téléphone',whatsapp:'WhatsApp',in_person:'Au centre'})}{values.channel === 'whatsapp' && <p className="break-all text-sm">WhatsApp : {links.whatsapp ? formatPhoneFr(`+${links.whatsapp.split('/').at(-1)}`) : 'Indisponible'}</p>}</>}
  {action === 'whatsapp' && <><p className="break-all text-sm font-medium">WhatsApp : {links.whatsapp ? formatPhoneFr(`+${links.whatsapp.split('/').at(-1)}`) : 'Indisponible'}</p>{links.whatsapp && <a data-touch-target className="inline-flex min-h-9 items-center rounded-md border px-4 text-sm font-medium" href={links.whatsapp} target="_blank" rel="noopener noreferrer">Ouvrir WhatsApp</a>}<p className="text-xs text-slate-500">Ouvrir WhatsApp n’enregistre aucun envoi.</p>{!links.whatsapp && <p className="text-sm text-slate-600">Aucun numéro WhatsApp valide. Vous pouvez enregistrer un échange déjà effectué.</p>}{select('kind', 'Que souhaitez-vous enregistrer ?', {
              whatsapp_sent: 'Message envoyé',
              meaningful_whatsapp_conversation: 'Conversation réelle avec le contact'
            })}</>}
  {outcomeLed && <>{select('interaction', 'Résultat de l’échange', conversationOutcomes(lead.status))}{values.interaction && <p className="text-xs text-slate-600">Étape après enregistrement : {STATUS[outcomeStage(values.interaction, lead.status)]}. L’étape est calculée par le serveur à partir de ce résultat.</p>}{values.interaction === 'not_suitable' && select('unsuitableReason', 'Motif', NOT_QUALIFIED)}{values.interaction === 'placement_test' && <p className="rounded-lg bg-blue-50 p-3 text-sm">Ce résultat prépare le suivi du test. Il ne réserve aucun test de niveau.</p>}</>}
  {qualifying && <>{select('step', 'Le contact souhaite…', {
              placement_test: 'Préparer un test de niveau',
              center_visit: 'Visiter le centre',
              enrollment: 'Avancer vers une inscription',
              other: 'Autre prochaine étape'
            })}{values.step === 'placement_test' && <p className="rounded-lg bg-blue-50 p-3 text-sm">Cette action prépare le suivi du test. Elle ne réserve aucun test de niveau.</p>}{!lead.last_conversation_at && select('channel', 'Conversation ayant confirmé ce projet', {
              phone: 'Téléphone',
              whatsapp: 'WhatsApp',
              in_person: 'Au centre'
            })}</>}
  {closing && <><Field label="Motif"><select required className={inputClass} value={values.reason} onChange={e => setValues(old => ({ ...old, reason: e.target.value, why: '' }))}>{!values.reason && <option value="">Choisir explicitement…</option>}{CLOSE_MENU.map(code => <option key={code} value={code} disabled={code === 'unreachable' && !lead?.unreachable_eligible}>{CLOSE_REASON_LABELS[code]}</option>)}</select></Field>
   {values.reason === 'not_interested' && <Field label="Pourquoi ?"><select required className={inputClass} value={values.why} onChange={e => set('why', e.target.value)}>{!values.why && <option value="">Choisir explicitement…</option>}{NOT_INTERESTED_WHY.map(code => <option key={code} value={code}>{CLOSE_REASON_LABELS[code]}</option>)}<option value="not_interested">Autre raison</option></select></Field>}
   {values.reason === 'unreachable' && <p className="text-sm">{lead.failed_attempts} / 5 {lead.failed_attempts > 1 ? 'appels infructueux' : 'appel infructueux'} dans la séquence actuelle.</p>}</>}
  {action === 'reassign' && <><Field label={task ? 'Responsable de l’action' : 'Responsable du prospect'}><select className={inputClass} value={task ? values.assignee : values.owner} onChange={e => { set(task ? 'assignee' : 'owner', e.target.value); setSelectedStaffLabel(e.target.selectedOptions[0].textContent); }}><option value="">Non attribué</option>{(task ? values.assignee : values.owner) && !staff.data?.rows.some(p => p.id === (task ? values.assignee : values.owner)) && <option value={task ? values.assignee : values.owner}>{selectedStaffLabel}</option>}{staff.data?.rows.map(person => <option key={person.id} value={person.id}>{staffLabel(person)}</option>)}</select></Field>{staff.isError && <p role="alert" className="text-sm">Liste indisponible. <button type="button" onClick={() => staff.refetch()}>Réessayer</button></p>}{(staff.data?.total > 50 || staffOffset > 0) && <div className="flex gap-2"><Button type="button" variant="outline" disabled={!staffOffset} onClick={() => setStaffOffset(x => Math.max(0, x - 50))}>Précédents</Button><Button type="button" variant="outline" disabled={staffOffset + 50 >= staff.data?.total} onClick={() => setStaffOffset(x => x + 50)}>Suivants</Button></div>}<p className="text-xs text-slate-500">{task ? 'Seule cette action change de responsable. Le responsable du prospect reste inchangé.' : 'Les responsables des actions déjà prévues restent inchangés.'}</p></>}
  {!['manual', 'reassign', 'schedule', 'reschedule'].includes(action) && <Field label={['cancel', 'reopen'].includes(action) ? 'Motif' : action === 'complete' ? 'Résultat de l’action' : 'Note'} help={action === 'complete' ? `${(values.note || '').length} / ${COMPLETION_LIMIT} caractères` : noteRequired ? undefined : 'Facultative : les choix ci-dessus suffisent comme trace.'}><textarea className={`${inputClass} min-h-24`} maxLength={action === 'complete' ? COMPLETION_LIMIT : 4000} required={noteRequired} value={values.note || ''} onChange={e => set('note', e.target.value)} /></Field>}
  {needsTask && <div className="space-y-3 rounded-lg border bg-slate-50 p-4"><h3 className="text-sm font-semibold">{action === 'reschedule' ? 'Nouvel horaire' : 'Prochaine action'}</h3>{action !== 'reschedule' && (fixedTask ? <p className="text-sm">{nextTypes[fixedTask] || taskTitle({ task_type: fixedTask })}{interactionKey === 'considering' ? ' · En réflexion' : ''}</p> : select('taskType', 'Action', action === 'reopen' ? REOPEN_TYPES : nextTypes))}
   {action !== 'reschedule' && (kindRule.fixed ? <p className="text-sm font-medium text-blue-900">{SCHEDULE_KINDS[kindRule.kind]}</p> : <fieldset><legend className="text-sm font-medium">Type de suivi</legend><div className="mt-1 flex flex-wrap gap-x-4">{Object.entries(SCHEDULE_KINDS).map(([value, label]) => <label key={value} className="inline-flex min-h-9 items-center gap-2 text-sm"><input type="radio" name="schedule-kind" value={value} checked={kindRule.kind === value} onChange={() => set('scheduleKind', value)} />{label}</label>)}</div><p className="text-xs text-slate-500">{kindRule.kind === 'appointment' ? 'Horaire fixé avec le contact.' : 'Rappel pour l’équipe ; aucun horaire n’a été promis au contact.'}</p></fieldset>)}
   {action !== 'reschedule' && kindRule.kind === 'reminder' && <Field label="Échéance du rappel" help={values.preset === 'exact' ? undefined : 'Calculée par le serveur selon les horaires de suivi de Casablanca.'}><select className={inputClass} value={values.preset} onChange={e => set('preset', e.target.value)}>{Object.entries(REMINDER_PRESETS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}<option value="exact">Date et heure précises</option></select></Field>}
   {exactTime && <Field label="Date et heure · Casablanca"><input className={inputClass} type="datetime-local" required value={values.due || ''} onChange={e => set('due', e.target.value)} /></Field>}{text('instructions', 'Précisions (facultatif)', false, 'text', 4000)}<p className="text-xs text-slate-500">{agreedCallback ? 'Un rappel convenu garde son heure exacte : elle doit tomber dans les horaires d’appel, sinon l’enregistrement est refusé.' : 'Les appels hors horaires d’ouverture sont décalés au prochain créneau par le calendrier de suivi.'}</p></div>}
  </fieldset><DialogStickyFooter>{stale ? <div role="alert" className={`rounded-md bg-amber-50 p-3 text-sm text-amber-900 ${FOOTER_ALERT}`}><p>{STALE_MESSAGE}</p><Button type="button" size="sm" variant="outline" className="mt-2" onClick={reload}>Recharger</Button></div>
   : error ? <p role="alert" className={`rounded-md bg-red-50 p-3 text-sm text-red-800 ${FOOTER_ALERT}`}>{error}</p>
   : reloaded && <p role="status" className={`rounded-md bg-blue-50 p-3 text-sm text-blue-900 ${FOOTER_ALERT}`} data-testid="reloaded-state">Rechargé · {STATUS[reloaded.status] || reloaded.status}{reloaded.next_action?.label ? ` · prochaine action : ${reloaded.next_action.label}` : ' · aucune prochaine action'}. Vérifiez puis enregistrez.</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Annuler</Button><Button type="submit" disabled={busy || stale || action === 'unreachable' && !lead.unreachable_eligible}>{busy ? 'Enregistrement…' : 'Enregistrer'}</Button></div></DialogStickyFooter>
 </form>}
 </DialogContent></Dialog>;
}
