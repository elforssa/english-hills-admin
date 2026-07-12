'use client';

// =============================================================================
// /students/import — bulk-create students from a CSV.
//
// Flow:
//   1. User pastes CSV text OR drops a .csv file. We parse client-side.
//   2. Each row is normalised + validated. Errors stay in the preview so
//      the admin can fix the file before committing.
//   3. On "Importer", rows are inserted one-by-one through entities.Student
//      (so per-row errors are isolated and the rest of the batch still
//      lands). On success we invalidate the Student query cache so the
//      list page picks up the new rows immediately.
//
// Column mapping is fixed (case-insensitive header match) — see HEADER_MAP.
// =============================================================================

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { toast } from 'sonner';
import { ArrowLeft, Upload, FileText, CheckCircle, AlertTriangle, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { parseCsv } from '@/utils/parseCsv';
import { useEntityCreate } from '@/lib/queries';
import { entityKeys } from '@/lib/queries';

const LEVELS = ['A1','A2','B1','B2','C1','C2'];
const CATEGORIES = ['Young Learners (6-12)','Teens (13-17)','Adults (18+)','Corporate'];
const STATUSES = ['Prospect','Enrolled','Trial','Inactive','Alumni'];
const SESSION_TYPES = ['Yearly','Summer Camp','Communication Junior'];

// Accept multiple header spellings so a teacher's spreadsheet works without
// renaming columns. Keys are normalised (lowercase, no spaces, no accents).
const HEADER_MAP = {
  nom:            'full_name',
  name:           'full_name',
  fullname:       'full_name',
  nomprenom:      'full_name',
  email:          'email',
  parentemail:    'parent_email',
  emailparent:    'parent_email',
  telephone:      'telephone',
  phone:          'telephone',
  tel:            'telephone',
  datenaissance:  'date_naissance',
  birthdate:      'date_naissance',
  niveau:         'niveau_cefr',
  level:          'niveau_cefr',
  cefr:           'niveau_cefr',
  categorie:      'age_category',
  category:       'age_category',
  agecategorie:   'age_category',
  session:        'session_type',
  sessiontype:    'session_type',
  statut:         'status',
  status:         'status',
  notes:          'notes',
};

function normaliseHeader(h) {
  return h
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9]/g, '');
}

const StudentRow = z.object({
  full_name:      z.string().min(1, 'Nom requis').max(120),
  email:          z.string().email('Email invalide').or(z.literal('')).optional(),
  parent_email:   z.string().email('Email parent invalide').or(z.literal('')).optional(),
  telephone:      z.string().max(40).optional(),
  date_naissance: z.string()
                    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date au format YYYY-MM-DD')
                    .or(z.literal('')).optional(),
  niveau_cefr:    z.enum(LEVELS).or(z.literal('')).optional(),
  age_category:   z.enum(CATEGORIES).or(z.literal('')).optional(),
  session_type:   z.enum(SESSION_TYPES).or(z.literal('')).optional(),
  status:         z.enum(STATUSES).or(z.literal('')).optional(),
  notes:          z.string().max(2000).optional(),
});

function rowsFromCsv(text) {
  const { headers, rows } = parseCsv(text);
  if (headers.length === 0) return { mapped: [], unknownHeaders: [], missingName: true };

  // Build header → student field map.
  const fieldFor = {};
  const unknown = [];
  headers.forEach(h => {
    const key = HEADER_MAP[normaliseHeader(h)];
    if (key) fieldFor[h] = key;
    else unknown.push(h);
  });

  if (!Object.values(fieldFor).includes('full_name')) {
    return { mapped: [], unknownHeaders: unknown, missingName: true };
  }

  const mapped = rows.map(raw => {
    const row = {};
    for (const [h, value] of Object.entries(raw)) {
      const field = fieldFor[h];
      if (field) row[field] = value;
    }
    return row;
  });

  return { mapped, unknownHeaders: unknown, missingName: false };
}

function validateRows(rawRows) {
  return rawRows.map((row, idx) => {
    const parsed = StudentRow.safeParse(row);
    if (parsed.success) {
      // Strip empty optional strings so they land as NULL in Postgres.
      const data = {};
      for (const [k, v] of Object.entries(parsed.data)) {
        if (v === '' || v === undefined) continue;
        data[k] = v;
      }
      return { idx, ok: true, data };
    }
    return {
      idx, ok: false, data: row,
      errors: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
    };
  });
}

const SAMPLE_CSV =
  'full_name,email,parent_email,telephone,niveau_cefr,age_category,status\n' +
  'Amal El Idrissi,amal@example.com,parent@example.com,+212600000000,B1,Teens (13-17),Enrolled\n' +
  'Yassine Bennani,,parent2@example.com,+212611111111,A2,Young Learners (6-12),Trial\n';

export default function StudentImportPage() {
  const [csvText, setCsvText]     = useState('');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress]   = useState({ done: 0, total: 0, failed: 0 });
  const fileRef = useRef(null);

  const queryClient = useQueryClient();
  const createStudent = useEntityCreate('Student');

  const parsed = useMemo(() => {
    if (!csvText.trim()) return null;
    const { mapped, unknownHeaders, missingName } = rowsFromCsv(csvText);
    if (missingName) {
      return { fatal: 'Aucune colonne "Nom" / "full_name" détectée.', unknownHeaders };
    }
    return {
      unknownHeaders,
      rows: validateRows(mapped),
    };
  }, [csvText]);

  const stats = useMemo(() => {
    if (!parsed?.rows) return null;
    return {
      total:   parsed.rows.length,
      valid:   parsed.rows.filter(r => r.ok).length,
      invalid: parsed.rows.filter(r => !r.ok).length,
    };
  }, [parsed]);

  function handleFile(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Fichier trop volumineux (max 5 Mo).');
      return;
    }
    const reader = new FileReader();
    reader.onload = e => setCsvText(String(e.target?.result || ''));
    reader.onerror = () => toast.error('Lecture du fichier échouée.');
    reader.readAsText(file, 'utf-8');
  }

  async function handleImport() {
    if (!parsed?.rows || stats.valid === 0) return;
    const valid = parsed.rows.filter(r => r.ok);
    setImporting(true);
    setProgress({ done: 0, total: valid.length, failed: 0 });

    let done = 0;
    let failed = 0;
    // Sequential rather than Promise.all so RLS / unique-constraint errors
    // don't take down the whole batch and so the progress bar advances.
    for (const row of valid) {
      try {
        await createStudent.mutateAsync(row.data);
      } catch {
        failed += 1;
      }
      done += 1;
      setProgress({ done, total: valid.length, failed });
    }

    setImporting(false);
    queryClient.invalidateQueries({ queryKey: entityKeys.all('Student') });

    if (failed === 0) toast.success(`${done} apprenant(s) importé(s).`);
    else toast.error(`${done - failed} importé(s), ${failed} échec(s).`);
  }

  const previewRows = parsed?.rows?.slice(0, 50) || [];

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/students" className="p-1.5 rounded-md hover:bg-muted text-muted-foreground">
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Import en lot — Apprenants</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Importez plusieurs apprenants depuis un fichier CSV.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <aside className="lg:col-span-1 space-y-4">
          <div className="bg-card border border-border rounded-xl p-4 text-xs space-y-2">
            <p className="font-semibold text-foreground text-sm flex items-center gap-2">
              <FileText size={14} /> Colonnes acceptées
            </p>
            <p className="text-muted-foreground">Une seule est requise: <code>full_name</code> (ou <code>Nom</code>).</p>
            <ul className="text-muted-foreground space-y-0.5">
              <li><code>email</code> · <code>parent_email</code></li>
              <li><code>telephone</code> · <code>date_naissance</code> (YYYY-MM-DD)</li>
              <li><code>niveau_cefr</code> · {LEVELS.join(', ')}</li>
              <li><code>age_category</code> · {CATEGORIES.join(' / ')}</li>
              <li><code>session_type</code> · {SESSION_TYPES.join(' / ')} (défaut : Yearly)</li>
              <li><code>status</code> · {STATUSES.join(' / ')}</li>
              <li><code>notes</code></li>
            </ul>
            <button
              onClick={() => setCsvText(SAMPLE_CSV)}
              className="text-xs font-semibold underline mt-1"
              style={{ color: 'var(--brand)' }}
            >
              Charger un exemple
            </button>
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <p className="font-semibold text-sm mb-2 flex items-center gap-2">
              <Upload size={14} /> Fichier
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="text-xs w-full"
              onChange={e => handleFile(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => { setCsvText(''); if (fileRef.current) fileRef.current.value = ''; }}
              className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Trash2 size={12} /> Effacer
            </button>
          </div>
        </aside>

        <div className="lg:col-span-2 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              CSV
            </label>
            <textarea
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              placeholder="Collez votre CSV ici ou utilisez le champ Fichier."
              className="w-full h-44 font-mono text-xs border border-border rounded-md p-3 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {parsed?.fatal && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 flex gap-2">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <span>{parsed.fatal}</span>
            </div>
          )}

          {parsed && !parsed.fatal && (
            <>
              {parsed.unknownHeaders?.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-700">
                  Colonnes ignorées (non reconnues) :{' '}
                  <span className="font-mono">{parsed.unknownHeaders.join(', ')}</span>
                </div>
              )}

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>Total: <strong className="text-foreground">{stats.total}</strong></span>
                <span className="text-emerald-700">
                  Valides: <strong>{stats.valid}</strong>
                </span>
                <span className="text-red-600">
                  Erreurs: <strong>{stats.invalid}</strong>
                </span>
              </div>

              <div className="bg-card border border-border rounded-md overflow-hidden">
                <div className="px-3 py-2 border-b border-border text-xs font-semibold bg-muted">
                  Aperçu {stats.total > 50 ? '(50 premières lignes)' : ''}
                </div>
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted">
                      <tr>
                        <th className="text-left px-3 py-2">#</th>
                        <th className="text-left px-3 py-2">Nom</th>
                        <th className="text-left px-3 py-2">Email</th>
                        <th className="text-left px-3 py-2">Niveau</th>
                        <th className="text-left px-3 py-2">Catégorie</th>
                        <th className="text-left px-3 py-2">Statut</th>
                        <th className="text-left px-3 py-2">État</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {previewRows.map(r => (
                        <tr key={r.idx} className={r.ok ? '' : 'bg-red-50'}>
                          <td className="px-3 py-1.5 text-muted-foreground">{r.idx + 2}</td>
                          <td className="px-3 py-1.5">{r.data.full_name || '—'}</td>
                          <td className="px-3 py-1.5">{r.data.email || '—'}</td>
                          <td className="px-3 py-1.5">{r.data.niveau_cefr || '—'}</td>
                          <td className="px-3 py-1.5">{r.data.age_category || '—'}</td>
                          <td className="px-3 py-1.5">{r.data.status || '—'}</td>
                          <td className="px-3 py-1.5">
                            {r.ok
                              ? <span className="text-emerald-700 inline-flex items-center gap-1"><CheckCircle size={11} /> OK</span>
                              : <span className="text-red-700" title={r.errors?.join(' · ')}>{r.errors?.[0]}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {importing && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    Import en cours… {progress.done}/{progress.total}
                    {progress.failed > 0 && ` · ${progress.failed} échec(s)`}
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="h-2 rounded-full bg-primary transition-all"
                      style={{ width: `${(progress.done / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <Link
                  href="/students"
                  className="px-4 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted"
                >
                  Annuler
                </Link>
                <button
                  onClick={handleImport}
                  disabled={importing || stats.valid === 0}
                  className="px-5 py-2 text-sm font-semibold text-white rounded-md bg-primary hover:opacity-90 disabled:opacity-50"
                >
                  {importing ? 'Import…' : `Importer ${stats.valid} apprenant(s)`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
