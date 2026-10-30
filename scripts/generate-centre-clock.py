#!/usr/bin/env python3
"""Generate the re-created function bodies of migration 125 (Batch H, plan AFU-r1)
and its restore script from a LOCAL database at migration 124.

  python3 scripts/generate-centre-clock.py --write   rewrite both generated blocks
  python3 scripts/generate-centre-clock.py --check   both committed blocks equal the output

Every body starts from pg_get_functiondef, its latest cumulative definition:
- H7: 'Africa/Casablanca' and the CRM policy timezone column (which may only hold
  that name) in AT TIME ZONE / timezone() become public.centre_utc_offset(); the
  number of substitutions per function is fixed below and asserted;
- H1/H5/N3: five functions with the exact edits listed in EDITS;
- H7: the session-zone `current_date` in re-created functions becomes
  public.business_date() (AFTER_H7 for crm_security.command, EDITS otherwise).
The restore block holds the 124 body of every function the migration replaces.
Port: AFU_PORT (default 54322).
"""
import os, re, subprocess, sys

PORT = os.environ.get('AFU_PORT', '54322')
MIGRATION = 'supabase/migrations/125_audit_follow_ups.sql'
RESTORE = 'scripts/rollback/125_audit_follow_ups_restore.sql'
BEGIN, END = '-- BEGIN GENERATED FUNCTIONS (scripts/generate-centre-clock.py)', '-- END GENERATED FUNCTIONS'

def q(sql):
    return subprocess.run(['psql', '-X', '-qAt', '-h', '127.0.0.1', '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-c', sql],
                          env={**os.environ, 'PGPASSWORD': 'postgres'}, capture_output=True, text=True, check=True).stdout

def one(name):
    schema, fn = name.split('.')
    rows = [r for r in q(f"select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
                         f"where n.nspname = '{schema}' and p.proname = '{fn}'").split('\n') if r]
    assert len(rows) == 1, (name, rows)
    body = q(f'select pg_get_functiondef({rows[0]})')
    assert body.endswith('\n')
    return body.rstrip('\n')

AT_LIT = re.compile(r"(at time zone) 'Africa/Casablanca'", re.I)
AT_COL = re.compile(r"(at time zone) p\.timezone\b", re.I)
TZ_FN = re.compile(r"timezone\('Africa/Casablanca', ")
OFFSET = 'public.centre_utc_offset()'

# Function -> (literal AT TIME ZONE, policy timezone column, timezone('…', …)) substitutions.
H7 = {
    'academic_security.today': (1, 0, 0),
    'online_security.today': (1, 0, 0),
    'online_security.local_date': (1, 0, 0),
    'online_security.local_time': (1, 0, 0),
    'online_security.french_when': (2, 0, 0),
    'online_security.pattern_slots': (2, 0, 0),
    'public.online_update_lesson': (2, 0, 0),
    'public.attendance_student_in_group': (1, 0, 0),
    'public.count_today_dismissals': (2, 0, 0),
    'public.enforce_dismissal_integrity': (2, 0, 0),
    'public.create_public_registration': (1, 0, 0),
    'public.guard_premium_homework_write': (0, 0, 2),
    'public.portal_request_reenrollment': (1, 0, 0),
    'public.list_activity_log': (2, 0, 0),
    'public.crm_get_today': (7, 0, 0),
    'public.crm_get_admissions_calendar': (5, 0, 0),
    'crm_security.command': (1, 1, 0),
    'crm_security.enrollment_year': (2, 0, 0),
    'crm_security.opportunity_card': (1, 0, 0),
    'crm_security.reminder_due': (0, 5, 0),
    'crm_security.opportunity_ids': (11, 0, 0),
    'crm_security.work_boundaries': (4, 0, 0),
    'crm_security.placement_integrity': (1, 0, 0),
    'crm_security.placement_summary': (1, 0, 0),
    'crm_security.scheduled_civil': (2, 0, 0),
    'crm_security.next_window': (0, 3, 0),
    'crm_security.attempt_due': (0, 1, 0),
    'crm_security.accept_external_submission': (0, 1, 0),
}
# Kept on purpose: the Meta ad account's own time zone, and the consumed Batch D clean-up.
KEPT = {'academic_security.egc_cleanup_c1', 'public.crm_get_marketing_cohort'}

# Further edits applied after the H7 substitution (the review's N6).
AFTER_H7 = {
    'crm_security.command': [("if (data->>'learner_birth_date')::date>current_date then",
                              "if (data->>'learner_birth_date')::date>public.business_date() then")],
}

def convert(name, body):
    found = (len(AT_LIT.findall(body)), len(AT_COL.findall(body)), len(TZ_FN.findall(body)))
    assert found == H7[name], (name, found, H7[name])
    body = AT_LIT.sub(lambda m: f'{m.group(1)} {OFFSET}', body)
    body = AT_COL.sub(lambda m: f'{m.group(1)} {OFFSET}', body)
    body = TZ_FN.sub(f'timezone({OFFSET}, ', body)
    assert not re.search(r"at time zone\s+('Africa|p\.timezone)", body, re.I) and "timezone('Africa" not in body, name
    for old, new in AFTER_H7.get(name, []):
        assert body.count(old) == 1, (name, old[:60], body.count(old))
        body = body.replace(old, new)
    assert not re.search(r'\bcurrent_date\b', body, re.I), name
    return body

EDITS = {
    'public.create_charge_payment_financial': ('H1: reception may give any discount with a reason (latest definition: 122).', [(
        """    -- Q3 = B: reception gives at most 10 % without the director.
    if v_role = 'receptionist' and v_gross > 0 and v_discount > 0.10 * v_gross then
      raise exception 'Remise supérieure à 10 %% : demandez au directeur.' using errcode = '22023';
    end if;
""", """    -- Batch H (H1): no discount cap for reception; the reason above stays mandatory.
""")]),
    'public.crm_start_enrollment': ('H7 + H5: the centre date for the birth-date check, and the group year (latest definition: 120).', [
        ("if birth>(now() at time zone 'Africa/Casablanca')::date then", "if birth>public.business_date() then"),
        ("values(s.id,session,year,level,g.id,initial_status,current_date,p_data->>'notes')",
         "values(s.id,session,year,level,g.id,initial_status,public.business_date(),p_data->>'notes')"),
        ("""   level:=g.niveau;
  end if;""", """   level:=g.niveau;
   -- Batch H (H5): the enrollment year must be the group's (22023: the handler
   -- below turns 23514 into a generic refusal).
   perform academic_security.check_group_year(g.annee, year, '22023');
  end if;""")]),
    'public.save_receptionist_enrollment': ('H5: the year comes from the group; H7: the date defaults to the business date (latest definition: 120).', [
        ("p_date date DEFAULT CURRENT_DATE", "p_date date DEFAULT public.business_date()"),
        (
        """    if g.niveau is distinct from effective_level then
      raise exception 'Enrollment group must match its session and level' using errcode='23514'; end if;
  end if;""", """    if g.niveau is distinct from effective_level then
      raise exception 'Enrollment group must match its session and level' using errcode='23514'; end if;
    -- Batch H (H5): the year comes from the group when none is given, and must match it.
    effective_year:=coalesce(effective_year,academic_security.school_year_of(g.annee));
    perform academic_security.check_group_year(g.annee, effective_year);
  end if;""")]),
    'public.save_receptionist_group': ('N3: a replayed create without a year matches the year the guard gave the group (latest definition: 119).', [(
        "g.terme is distinct from p_changes->>'terme' or g.annee is distinct from p_changes->>'annee' or",
        "g.terme is distinct from p_changes->>'terme' or g.annee is distinct from coalesce(nullif(btrim(p_changes->>'annee'),''),g.annee) or")]),
    'public.crm_enrollment_groups': ('H5: each group with its school year, so the CRM form takes the enrollment year from it.', [(
        "with eligible as(select id,name,niveau,session_type from public.groups",
        "with eligible as(select id,name,niveau,session_type,annee from public.groups")]),
}

def edit(name, body):
    for old, new in EDITS[name][1]:
        assert body.count(old) == 1, (name, old[:60], body.count(old))
        body = body.replace(old, new)
    assert not re.search(r'\bcurrent_date\b', body, re.I), name
    return body

def generate():
    assert q('select max(version) from supabase_migrations.schema_migrations').strip() == '124', 'run on a database at migration 124'
    assert q("select to_regprocedure('public.centre_utc_offset()') is null").strip() == 't'
    left = sorted(r for r in q("""select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname not in ('pg_catalog', 'information_schema')
        and (p.prosrc ~* 'at time zone\\s+''Africa/Casablanca''' or p.prosrc ~* 'at time zone\\s+p\\.timezone'
          or p.prosrc ~* 'timezone\\(''Africa/Casablanca''')""").split('\n') if r)
    expected = sorted(set(H7) | {'public.business_date', 'public.crm_start_enrollment', 'academic_security.egc_cleanup_c1'})
    assert left == expected, sorted(set(left) ^ set(expected))
    forward, restore = [BEGIN], [BEGIN]
    forward.append('-- H7: the zone name, or the CRM policy timezone column, replaced by public.centre_utc_offset().')
    for name in H7:
        before = one(name)
        forward.append(f'-- {name}: {sum(H7[name])} substitution(s).\n{convert(name, before)};')
        restore.append(f'{before};')
    for name, (why, _) in EDITS.items():
        before = one(name)
        forward.append(f'-- {name}: {why}\n{edit(name, before)};')
        restore.append(f'{before};')
    restore.append(f'{one("public.business_date")};')
    forward.append(END)
    restore.append(END)
    return '\n\n'.join(forward), '\n\n'.join(restore)

def splice(path, block):
    text = open(path).read()
    start, stop = text.index(BEGIN), text.index(END) + len(END)
    return text[:start] + block + text[stop:]

if __name__ == '__main__':
    forward, restore = generate()
    if '--write' in sys.argv:
        for path, block in ((MIGRATION, forward), (RESTORE, restore)):
            text = splice(path, block)
            with open(path, 'w') as out:
                out.write(text)
        print('written', MIGRATION, RESTORE)
    elif '--check' in sys.argv:
        for path, block in ((MIGRATION, forward), (RESTORE, restore)):
            assert open(path).read() == splice(path, block), f'{path}: generated block differs; run --write'
        print(f'PASS {len(H7)} H7 and {len(EDITS)} edited function bodies equal the 124 catalog plus the listed changes')
    else:
        sys.exit('usage: --write | --check')
