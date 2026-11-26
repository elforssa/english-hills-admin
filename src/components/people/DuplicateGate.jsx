'use client';

import { MATCH_DECISIONS, MATCH_REASONS, PERSON_KINDS, personHref, personLine } from '@/lib/people.mjs';

// The duplicate gate (RWR-r5 §5.2): before a create, each strong match (same phone,
// or same name and birth date) gets one answer. « C'est cette personne » opens the
// existing record instead of creating; the two other answers are recorded with the
// create. Shared phone alone never merges anything.
export default function DuplicateGate({ matches, answers, onAnswer, onOpen, openLabel = 'C’est cette personne' }) {
  if (!matches?.length) return null;
  return <section aria-labelledby="duplicate-gate-title" data-testid="duplicate-gate" className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
    <div><h3 id="duplicate-gate-title" className="text-sm font-semibold text-amber-950">Cette personne existe peut-être déjà</h3>
      <p className="mt-1 text-xs text-amber-900">Rien n’est encore créé. Pour chaque fiche, dites s’il s’agit de la même personne.</p></div>
    <ul className="space-y-3">{matches.map(m => {
      const key = `${m.kind}:${m.id}`;
      return <li key={key} data-testid="duplicate-match" data-kind={m.kind} data-id={m.id} className="rounded-md border border-amber-200 bg-white p-3">
        <p className="break-words text-sm font-medium">{m.name || 'Sans nom'}<span className="ml-2 text-xs font-normal text-slate-600">{MATCH_REASONS[m.reason] || ''}</span></p>
        <p className="break-words text-xs text-slate-600">{personLine(m) || PERSON_KINDS[m.kind]}</p>
        <fieldset className="mt-2"><legend className="sr-only">Réponse pour {m.name}</legend><div className="flex flex-wrap gap-x-4 gap-y-1">
          {onOpen && <button type="button" className="min-h-9 text-sm font-medium text-blue-800 underline" onClick={() => onOpen(m)}>{openLabel}</button>}
          {!onOpen && <a className="inline-flex min-h-9 items-center text-sm font-medium text-blue-800 underline" href={personHref(m)} target="_blank" rel="noopener noreferrer">Ouvrir la fiche</a>}
          {Object.entries(MATCH_DECISIONS).map(([value, label]) => <label key={value} className="inline-flex min-h-9 items-center gap-2 text-sm"><input type="radio" name={`match-${key}`} value={value} checked={answers?.[key] === value} onChange={() => onAnswer(key, value)} />{label}</label>)}
        </div></fieldset>
      </li>;
    })}</ul>
  </section>;
}
