-- =============================================================================
-- 021_activity_log_pii_scrub.sql
--
-- CNDP (Loi 09-08) requires audit logs to be pseudonymized — storing
-- plaintext PII (names, emails, phone numbers, payment amounts, grades) in
-- a long-lived audit table is non-compliant.
--
-- The existing log_activity() trigger (migration 012) snapshots full rows
-- into `before` / `after` JSONB columns. This migration replaces that
-- function with a PII-scrubbing variant:
--
--   • A per-table allowlist of NON-sensitive columns is defined inline.
--     For every other column, the `before`/`after` value is replaced with
--     the sentinel string '<redacted>' so we still see WHICH column changed
--     but not the contents.
--   • `changed_columns` (already a denormalized list of column names) is
--     unaffected — it never contained values.
--
-- This is the "Option A" approach from the audit follow-up: simpler than
-- column-level encryption and sufficient for current compliance posture.
--
-- Backfill: existing activity_log rows are left as-is. They were written
-- under the old policy; treating retroactively is out of scope. Operators
-- who need to wipe them can run a one-off:
--     update activity_log set before = null, after = null;
-- =============================================================================

create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id     uuid;
  v_actor_email  text;
  v_target_id    uuid;
  v_before       jsonb;
  v_after        jsonb;
  v_changed      text[];
  k              text;
  v_safe_columns text[];
begin
  -- ── Per-table allowlist of columns whose VALUES are safe to snapshot.
  -- Anything not in the allowlist gets '<redacted>' in before/after.
  v_safe_columns := case tg_table_name
    when 'profiles' then
      array['id', 'role', 'created_at', 'updated_at']
    when 'students' then
      array['id', 'status', 'age_category', 'niveau_cefr',
            'groupe_id', 'deleted_at', 'created_at', 'updated_at']
    when 'teachers' then
      array['id', 'contract_type', 'deleted_at', 'created_at', 'updated_at']
    when 'enrollments' then
      array['id', 'student_id', 'group_id', 'status', 'date_inscription',
            'created_at', 'updated_at']
    when 'receipts' then
      array['id', 'student_id', 'statut_paiement', 'mode_paiement',
            'deleted_at', 'created_at', 'updated_at']
    when 'payments' then
      array['id', 'student_id', 'receipt_id', 'mode_paiement',
            'deleted_at', 'created_at', 'updated_at']
    when 'payroll' then
      array['id', 'teacher_id', 'mois', 'annee', 'statut',
            'created_at', 'updated_at']
    when 'leave_requests' then
      array['id', 'teacher_id', 'status', 'date_debut', 'date_fin',
            'created_at', 'updated_at']
    when 'certificates' then
      array['id', 'student_id', 'niveau_complete', 'terme', 'annee',
            'date_emission', 'issued', 'created_at', 'updated_at']
    else
      array['id', 'created_at', 'updated_at']
  end;

  v_actor_id := auth.uid();
  if v_actor_id is not null then
    select email into v_actor_email
      from public.profiles where id = v_actor_id;
  end if;

  if tg_op = 'INSERT' then
    v_before    := null;
    v_after     := to_jsonb(new);
    v_target_id := (v_after->>'id')::uuid;
  elsif tg_op = 'UPDATE' then
    v_before    := to_jsonb(old);
    v_after     := to_jsonb(new);
    v_target_id := (v_after->>'id')::uuid;

    v_changed := array[]::text[];
    for k in select jsonb_object_keys(v_after) loop
      if k = 'updated_at' then continue; end if;
      if (v_before->k) is distinct from (v_after->k) then
        v_changed := array_append(v_changed, k);
      end if;
    end loop;

    if array_length(v_changed, 1) is null then
      return new;
    end if;
  else -- DELETE
    v_before    := to_jsonb(old);
    v_after     := null;
    v_target_id := (v_before->>'id')::uuid;
  end if;

  -- ── PII scrub: replace VALUES of sensitive columns with '<redacted>'.
  -- We rebuild before/after one key at a time so the structure is
  -- preserved for downstream tooling, but only allowlisted columns keep
  -- their real values.
  if v_before is not null then
    declare
      v_scrubbed jsonb := '{}'::jsonb;
    begin
      for k in select jsonb_object_keys(v_before) loop
        if k = any(v_safe_columns) then
          v_scrubbed := v_scrubbed || jsonb_build_object(k, v_before->k);
        else
          v_scrubbed := v_scrubbed || jsonb_build_object(k, to_jsonb('<redacted>'::text));
        end if;
      end loop;
      v_before := v_scrubbed;
    end;
  end if;

  if v_after is not null then
    declare
      v_scrubbed jsonb := '{}'::jsonb;
    begin
      for k in select jsonb_object_keys(v_after) loop
        if k = any(v_safe_columns) then
          v_scrubbed := v_scrubbed || jsonb_build_object(k, v_after->k);
        else
          v_scrubbed := v_scrubbed || jsonb_build_object(k, to_jsonb('<redacted>'::text));
        end if;
      end loop;
      v_after := v_scrubbed;
    end;
  end if;

  insert into public.activity_log
    (actor_id, actor_email, action, target_table,
     target_id, changed_columns, before, after)
  values
    (v_actor_id, v_actor_email, tg_op, tg_table_name,
     v_target_id, v_changed, v_before, v_after);

  return coalesce(new, old);
end;
$$;

-- The explicit audit-log inserts in /api/admin/update-role and
-- /api/admin/invite write to activity_log directly (not via the trigger);
-- those rows are crafted by the application and already contain only
-- non-sensitive fields (role values, action labels). No change needed
-- there beyond the existing routes.
