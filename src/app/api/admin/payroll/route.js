// =============================================================================
// POST /api/admin/payroll
//
// Server-side payroll calculation endpoint. Receives teacher_id + heures,
// fetches teacher contract details from the DB, recalculates all tax figures
// using the authoritative Morocco CNSS/AMO/IR rates, then saves the Payroll
// record. Prevents client-side manipulation of tax amounts.
// =============================================================================

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerClient, getServiceRoleClient } from '@/lib/supabase';

// CNSS 2024 Morocco rates (authoritative server-side copy)
const CNSS_EMPLOYEE_RATE = 0.0448;
const AMO_EMPLOYEE_RATE  = 0.0226;
const IR_BRACKETS = [
  { max: 2500,     rate: 0    },
  { max: 4166.67,  rate: 0.10 },
  { max: 5000,     rate: 0.20 },
  { max: 6666.67,  rate: 0.30 },
  { max: 15000,    rate: 0.34 },
  { max: Infinity, rate: 0.38 },
];

function calcIR(brut) {
  let tax = 0, prev = 0;
  for (const b of IR_BRACKETS) {
    if (brut <= prev) break;
    tax += (Math.min(brut, b.max) - prev) * b.rate;
    prev = b.max;
  }
  return Math.round(tax);
}

function calcPayroll(teacher, heures) {
  const isEmployee = teacher.contract_type === 'Employé';
  const taux = teacher.taux_horaire || 0;
  const brut = isEmployee ? (teacher.salaire_mensuel || taux * heures) : taux * heures;
  if (isEmployee) {
    const cnss = Math.round(brut * CNSS_EMPLOYEE_RATE);
    const amo  = Math.round(brut * AMO_EMPLOYEE_RATE);
    const ir   = calcIR(brut - cnss - amo);
    return { brut, cnss, amo, ir, net: brut - cnss - amo - ir };
  }
  return { brut, cnss: 0, amo: 0, ir: Math.round(brut * 0.20), net: Math.round(brut * 0.80) };
}

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

const Schema = z.object({
  teacher_id: z.string().uuid(),
  mois:       z.enum(MONTHS),
  annee:      z.string().regex(/^\d{4}$/),
  heures:     z.number().min(0).max(400),
});

export async function POST(request) {
  const supabase = await getServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!profile || !['admin', 'director'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let raw;
  try { raw = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 });
  }
  const { teacher_id, mois, annee, heures } = parsed.data;

  const admin = getServiceRoleClient();
  const { data: teacher, error: teacherErr } = await admin
    .from('teachers')
    .select('id, full_name, contract_type, taux_horaire, salaire_mensuel')
    .eq('id', teacher_id)
    .maybeSingle();
  if (teacherErr || !teacher) {
    return NextResponse.json({ error: 'Enseignant introuvable' }, { status: 404 });
  }

  const calc = calcPayroll(teacher, heures);

  const { data: payroll, error: insertErr } = await admin.from('payroll').insert({
    teacher_id:          teacher.id,
    teacher_name:        teacher.full_name,
    contract_type:       teacher.contract_type,
    mois, annee,
    heures_travaillees:  heures,
    taux_horaire:        teacher.taux_horaire || 0,
    salaire_brut:        calc.brut,
    cotisation_cnss:     calc.cnss,
    cotisation_amo:      calc.amo,
    ir_retenu:           calc.ir,
    salaire_net:         calc.net,
    statut:              'Brouillon',
  }).select().single();

  if (insertErr) {
    // eslint-disable-next-line no-console
    console.error('[payroll] insert failed:', insertErr);
    return NextResponse.json({ error: 'Erreur lors de la création de la fiche.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, payroll });
}
