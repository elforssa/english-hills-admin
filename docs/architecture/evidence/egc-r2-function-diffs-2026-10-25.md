# EGC-r2 per-function diffs against their sources

Evidence for the [implementation record](../plans/enrollment-group-consistency.md#implementation-record) (contract: "the PR includes the per-function diffs against their sources"). Produced on 2026-10-25 from a local Supabase reset to migration 119 (the cumulative definitions on `origin/main` `3f97c458db857db02204b0bf6a0e3c7d6e09828d`), then `supabase migration up` to 121. Each block is `pg_get_functiondef` (or the policy definition) at 119 against the same object after M1 and M2, with its grants. Synthetic local data only; no Production access.

| Object | Latest source | Re-created by | Result |
| --- | --- | --- | --- |
| `public.sync_student_from_enrollments` | 074 | M1 (M2 removes the transition branch) | 60 changed lines |
| `public.enforce_enrollment_student_sync` | 072 | M1 | identical (re-created unchanged) |
| `public.check_enrollment_student_sync` | 072 | M1 | 13 changed lines |
| `public.create_charge_payment` | 119 | M1 | 92 changed lines |
| `public.assign_receptionist_student_group` | 119 | M1 | 27 changed lines |
| `public.save_receptionist_student` | 119 | M1 | 4 changed lines |
| `public.save_receptionist_enrollment` | 117 | M1 | 12 changed lines |
| `public.soft_delete_student` | 041 | M1 | 4 changed lines |
| `public.remove_student_group` | 074 | M1 | 14 changed lines |
| `crm_security.evaluate_conversion` | 084 | M1 | 3 changed lines |
| `public.crm_start_enrollment` | 119 | M1 | 6 changed lines |
| `public.online_close_course` | 118 | M1 | 8 changed lines |
| `public.attendance_student_in_group` | 063 | M2 | 14 changed lines |
| `public.enforce_attendance_integrity` | 096 | M2 | 2 changed lines |
| `public.teacher_can_access_student_group` | 071 | M2 | 8 changed lines |
| `public.can_message_recipient` | 069 | M2 | 13 changed lines |
| `storage_security.can_write` | 096 | M2 | 2 changed lines |
| `public.resolve_storage_asset` | 096 | M2 | 2 changed lines |
| `public.search_students_page` | 097 | M2 | 23 changed lines |
| `public.sync_enrollments_from_student` | 074 | M1 | dropped |
| `policy.announcements_audience_read` | 024 | M2 | 4 changed lines |

`enforce_enrollment_student_sync` is re-created byte-identical: 072 already passes the previous group with a forced downgrade for every status outside Validated, Trial and Confirmed, which includes `Ended`. `attendance_student_in_group` changes signature (third argument `p_session_date`); the two-argument function is dropped, so its diff shows the old body removed and the new one added.

## `public.sync_student_from_enrollments`

Source: migration 074. Re-created by M1 (M2 removes the transition branch).

```diff
--- public.sync_student_from_enrollments @119 (source 074)
+++ public.sync_student_from_enrollments @121
@@ -7,16 +7,20 @@
 declare
   v_current public.students%rowtype;
   v_status text;
-  v_group uuid;
   v_student_status text;
+  v_leaver text := current_setting('eh.leaver_status', true);
+  v_main uuid;
   v_session text;
   v_level text;
+  v_flag text;
 begin
-  if p_student is null or pg_trigger_depth() > 1 then return; end if;
+  -- No depth guard any more: no trigger on students writes enrollments, so a
+  -- nested enrollment write (from another trigger) must still resync.
+  if p_student is null then return; end if;
   select * into v_current from public.students where id = p_student for update;
   if not found then return; end if;

-  select e.status, e.group_id, e.session_type, e.level into v_status, v_group, v_session, v_level
+  select e.status into v_status
   from public.enrollments e where e.student_id = p_student
   order by case e.status
     when 'Validated' then 0 when 'Trial' then 1 when 'Confirmed' then 2
@@ -24,33 +28,39 @@
     e.updated_at desc, e.created_at desc, e.id desc
   limit 1;

-  v_student_status := case v_status
-    when 'Validated' then 'Enrolled'
-    when 'Confirmed' then 'Enrolled'
-    when 'Trial' then 'Trial'
-    when 'Rejected' then 'Inactive'
-    else 'Prospect' end;
-  if not p_force_downgrade and v_status not in ('Validated','Confirmed','Trial')
-    and v_current.status in ('Enrolled','Trial','Alumni') then
-    v_student_status := v_current.status;
+  -- I7: Enrolled from a confirmed enrollment, Trial from a trial; Alumni and
+  -- Inactive only from the leaver/archive core; otherwise the 074 mapping.
+  if exists (select 1 from public.enrollments e where e.student_id = p_student and e.status in ('Confirmed','Validated')) then
+    v_student_status := 'Enrolled';
+  elsif exists (select 1 from public.enrollments e where e.student_id = p_student and e.status = 'Trial') then
+    v_student_status := 'Trial';
+  elsif v_leaver in ('Alumni','Inactive') then
+    v_student_status := v_leaver;
+  else
+    v_student_status := case v_status
+      when 'Rejected' then 'Inactive'
+      when 'Ended' then case when v_current.status in ('Alumni','Inactive') then v_current.status else 'Inactive' end
+      else 'Prospect' end;
+    if not p_force_downgrade and v_current.status in ('Enrolled','Trial','Alumni','Inactive') then
+      v_student_status := v_current.status;
+    end if;
   end if;

+  v_main := academic_security.main_group_for(p_student, v_current.groupe_id, v_current.session_type);
+  if v_main is not null then
+    select g.session_type, g.niveau into v_session, v_level from public.groups g where g.id = v_main;
+  end if;
+
+  v_flag := academic_security.set_flag('eh.membership_sync', 'on');
   update public.students s set
     status = v_student_status,
-    session_type = case when v_group is not null and v_status in ('Validated','Trial') then coalesce(v_session, s.session_type) else s.session_type end,
-    niveau_cefr = case when v_group is not null and v_status in ('Validated','Trial') then coalesce(v_level, s.niveau_cefr) else s.niveau_cefr end,
-    groupe_id = case
-      when v_status in ('Validated','Trial') then v_group
-      when p_force_downgrade and s.groupe_id is not distinct from p_previous_group then null
-      else s.groupe_id end
+    groupe_id = v_main,
+    session_type = coalesce(v_session, s.session_type),
+    niveau_cefr = case when v_session is not null then v_level else s.niveau_cefr end
   where s.id = p_student
-    and (s.status is distinct from v_student_status
-      or (v_group is not null and v_status in ('Validated','Trial') and (s.session_type is distinct from coalesce(v_session,s.session_type)
-        or s.niveau_cefr is distinct from coalesce(v_level,s.niveau_cefr)))
-      or s.groupe_id is distinct from case
-        when v_status in ('Validated','Trial') then v_group
-        when p_force_downgrade and s.groupe_id is not distinct from p_previous_group then null
-        else s.groupe_id end);
+    and (s.status is distinct from v_student_status or s.groupe_id is distinct from v_main
+      or (v_session is not null and (s.session_type is distinct from v_session or s.niveau_cefr is distinct from v_level)));
+  perform academic_security.set_flag('eh.membership_sync', v_flag);
 end;
 $function$
```

## `public.check_enrollment_student_sync`

Source: migration 072. Re-created by M1.

```diff
--- public.check_enrollment_student_sync @119 (source 072)
+++ public.check_enrollment_student_sync @121
@@ -20,7 +20,18 @@
   if new.status in ('Validated','Trial') and new.group_id is null then
     raise exception 'Active enrollment requires a group' using errcode = '23514';
   end if;
-  if new.group_id is not null and new.session_type is not null then
+  -- I1: an ended enrollment has an end date and no group; only it has an end date.
+  if new.status = 'Ended' and (new.group_id is not null or new.ended_at is null) then
+    raise exception 'Une inscription terminée n’a plus de groupe et porte sa date de fin.' using errcode = '23514';
+  end if;
+  if new.status is distinct from 'Ended' and new.ended_at is not null then
+    raise exception 'Seule une inscription terminée porte une date de fin.' using errcode = '23514';
+  end if;
+  -- I4, evaluated only when the assignment itself changes, so an untouched row
+  -- (a payment, a status change) never fails on a group edit.
+  if new.group_id is not null and new.session_type is not null and (tg_op = 'INSERT'
+      or new.group_id is distinct from old.group_id or new.session_type is distinct from old.session_type
+      or new.level is distinct from old.level) then
     select g.session_type, g.niveau into v_group_session, v_group_level
     from public.groups g where g.id = new.group_id;
     if found and (v_group_session is distinct from new.session_type
```

## `public.create_charge_payment`

Source: migration 119. Re-created by M1.

```diff
--- public.create_charge_payment @119 (source 119)
+++ public.create_charge_payment @121
@@ -12,6 +12,9 @@
   v_enrollment_id uuid;
   v_prior_request public.financial_requests%rowtype;
   v_crm_matches integer;
+  v_matches uuid[];
+  v_year text;
+  v_constraint text;
 begin
   -- Same staff boundary as the inner financial command; never trust caller roles.
   perform operational_security.require_capability('manage_finance_operations');
@@ -48,15 +51,13 @@
       niveau_cefr = coalesce(v_charge.level, niveau_cefr)
     where id = v_charge.student_id;
   end if;
-  -- Every newly issued receipt enrolls its student. Historical receipts and
-  -- idempotent retries are not rewritten or used to reactivate archived records.
-  update public.students set status = 'Enrolled' where id = v_charge.student_id;
-  v_result := v_result || jsonb_build_object('student_enrolled', true);
+  -- EGC (D3-A, FIN-10): a receipt no longer sets the learner's status; an Other
+  -- or legacy receipt changes none, a tuition receipt confirms an enrollment.
   if v_charge.session_type = 'Other' or v_charge.legacy then
     if v_requested_id is not null then
       raise exception 'This service cannot be linked to a tuition enrollment.';
     end if;
-    return v_result;
+    return v_result || jsonb_build_object('student_enrolled', false);
   end if;

   -- Lock the student across different charges in the same request period.
@@ -67,28 +68,7 @@
   end if;
   v_enrollment_id := coalesce(v_charge.enrollment_id, v_requested_id);

-  if v_enrollment_id is not null then
-    select * into v_enrollment from public.enrollments
-    where id = v_enrollment_id for update;
-    if not found or v_enrollment.student_id is distinct from v_charge.student_id
-      or v_enrollment.status = 'Rejected'
-      or (v_enrollment.session_type is not null
-          and v_enrollment.session_type <> v_charge.session_type)
-      or (v_enrollment.school_year is not null and v_charge.school_year is not null
-          and v_enrollment.school_year <> v_charge.school_year) then
-      raise exception 'Selected enrollment does not match this student, session and school year.';
-    end if;
-    update public.enrollments set
-      session_type = v_charge.session_type,
-      school_year = coalesce(v_charge.school_year, v_enrollment.school_year),
-      level = coalesce(v_enrollment.level, v_charge.level),
-      status = case
-        when status in ('Submitted','Under Review') then
-          case when group_id is null then 'Confirmed' else 'Validated' end
-        when status = 'Trial' then 'Validated'
-        else status end
-    where id = v_enrollment_id;
-  else
+  if v_enrollment_id is null then
     -- Guard only the implicit tuition-enrollment creation branch. Explicit charge
     -- or request links retain 074 validation. Exceptions roll back the entire
     -- inner financial transaction, including receipt/event/student side effects.
@@ -96,7 +76,7 @@
     from public.crm_leads l join public.enrollments e on e.id=l.enrollment_id
     join public.students s on s.id=e.student_id
     where e.student_id=v_charge.student_id and s.deleted_at is null
-      and e.status is distinct from 'Rejected' and l.merged_into_lead_id is null
+      and e.status is distinct from 'Rejected' and e.status is distinct from 'Ended' and l.merged_into_lead_id is null
       and coalesce(e.session_type,s.session_type)=v_charge.session_type
       -- Unknown year on an old charge cannot establish a distinct intent.
       and (v_charge.school_year is null or crm_security.enrollment_year(e)=v_charge.school_year);
@@ -106,12 +86,61 @@
         else 'Plusieurs inscriptions CRM correspondent. Sélectionnez explicitement l’inscription à payer.' end
         using errcode='22023';
     end if;
+    -- EGC (D-5, I3): reuse the learner's single active enrollment of this
+    -- programme and year that is not CRM-linked. An undated (pre-057) charge
+    -- matches an undated enrollment or one of the current school year, which
+    -- the new or confirmed enrollment receives (I9).
+    v_year := coalesce(v_charge.school_year, academic_security.school_year_on(academic_security.today()));
+    select array_agg(e.id order by e.id) into v_matches from public.enrollments e
+    where e.student_id = v_charge.student_id and e.session_type = v_charge.session_type
+      and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial')
+      and (e.school_year = v_charge.school_year
+        or (v_charge.school_year is null and (e.school_year is null or e.school_year = v_year)))
+      and not exists (select 1 from public.crm_leads l where l.enrollment_id = e.id);
+    if cardinality(v_matches) > 1 then
+      raise exception 'Plusieurs inscriptions correspondent. Sélectionnez l’inscription à payer.' using errcode='22023';
+    end if;
+    v_enrollment_id := v_matches[1];
+  end if;
+
+  begin
+  if v_enrollment_id is not null then
+    select * into v_enrollment from public.enrollments
+    where id = v_enrollment_id for update;
+    if not found or v_enrollment.student_id is distinct from v_charge.student_id
+      or v_enrollment.status = 'Rejected'
+      -- An ended enrollment only takes payments on its own charge (an old balance).
+      or (v_enrollment.status = 'Ended' and v_charge.enrollment_id is distinct from v_enrollment.id)
+      or (v_enrollment.session_type is not null
+          and v_enrollment.session_type <> v_charge.session_type)
+      or (v_enrollment.school_year is not null and v_charge.school_year is not null
+          and v_enrollment.school_year <> v_charge.school_year) then
+      raise exception 'Selected enrollment does not match this student, session and school year.';
+    end if;
+    if v_enrollment.status is distinct from 'Ended' then
+      update public.enrollments set
+        session_type = v_charge.session_type,
+        school_year = coalesce(v_charge.school_year, v_enrollment.school_year, crm_security.enrollment_year(v_enrollment)),
+        level = coalesce(v_enrollment.level, v_charge.level),
+        status = case
+          when status in ('Submitted','Under Review') then
+            case when group_id is null then 'Confirmed' else 'Validated' end
+          when status = 'Trial' then 'Validated'
+          else status end
+      where id = v_enrollment_id;
+    end if;
+  else
     insert into public.enrollments
       (student_id, status, date_inscription, session_type, school_year, level)
     values (v_charge.student_id, 'Confirmed', current_date,
-            v_charge.session_type, v_charge.school_year, v_charge.level)
+            v_charge.session_type, v_year, v_charge.level)
     returning id into v_enrollment_id;
   end if;
+  exception when unique_violation then
+    get stacked diagnostics v_constraint = constraint_name;
+    if v_constraint = 'enrollments_one_active_programme_year' then perform academic_security.duplicate(); end if;
+    raise;
+  end;

   update public.charges set enrollment_id = v_enrollment_id
   where id = v_charge.id and enrollment_id is distinct from v_enrollment_id;
@@ -119,8 +148,9 @@
   where id = (v_result->>'receipt_id')::uuid;
   select * into v_enrollment from public.enrollments where id = v_enrollment_id;
   return v_result || jsonb_build_object('enrollment_id', v_enrollment_id,
-                                       'enrollment_confirmed', true,
-                                       'group_pending', v_enrollment.group_id is null);
+                                       'enrollment_confirmed', v_enrollment.status in ('Confirmed','Validated'),
+                                       'group_pending', v_enrollment.status = 'Confirmed' and v_enrollment.group_id is null,
+                                       'student_enrolled', v_enrollment.status in ('Confirmed','Validated'));
 end;
 $function$
```

## `public.assign_receptionist_student_group`

Source: migration 119. Re-created by M1.

```diff
--- public.assign_receptionist_student_group @119 (source 119)
+++ public.assign_receptionist_student_group @121
@@ -4,7 +4,7 @@
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
 AS $function$
-declare s public.students%rowtype; e public.enrollments%rowtype; g public.groups%rowtype; v_count integer;
+declare s public.students%rowtype; e public.enrollments%rowtype; g public.groups%rowtype;
 begin
   perform operational_security.require_receptionist();
   select * into s from public.students where id=p_student and deleted_at is null for update;
@@ -15,37 +15,26 @@
     if not found then raise exception 'Group unavailable' using errcode='23514'; end if;
   end if;
   if p_enrollment is null then
-    if exists(select 1 from public.enrollments where student_id=p_student and status<>'Rejected'
-      and (group_id=s.groupe_id or (group_id is null and p_group is not null))) then
-      raise exception 'Select an enrollment explicitly' using errcode='23514'; end if;
-    if p_group is not null and (g.session_type is distinct from s.session_type or
-      g.niveau is distinct from s.niveau_cefr) then
-      raise exception 'Group must match dossier session/level' using errcode='23514'; end if;
-    update public.students set groupe_id=p_group where id=p_student;
-    return null;
+    if p_group is null then
+      if s.groupe_id is null then return null; end if;
+      return academic_security.remove(p_student,s.groupe_id,null,null,null,false);
+    end if;
+    return academic_security.place(p_student,p_group,null,null,null,null,null,false);
   end if;
   select * into e from public.enrollments where id=p_enrollment and student_id=p_student for update;
   if not found or p_enrollment_updated_at is null or e.updated_at is distinct from p_enrollment_updated_at then
     raise exception 'Enrollment unavailable or stale' using errcode='PT409'; end if;
   if p_group is null then
     if e.group_id is null then return e.id; end if;
-    select count(*) into v_count from public.enrollments
-      where student_id=p_student and group_id=e.group_id and status in ('Validated','Trial');
-    if v_count>1 then raise exception 'Multiple memberships require separate selection' using errcode='23514'; end if;
     if e.status in ('Validated','Trial') then
-      perform public.remove_student_group(p_student,e.group_id);
+      perform academic_security.remove(p_student,e.group_id,e.id,null,null,false);
     elsif e.status in ('Submitted','Under Review') then
       perform public.save_receptionist_enrollment(p_student,e.id,null,e.status,e.level,
         e.date_inscription,e.notes,e.session_type,e.school_year);
     else raise exception 'Removal unavailable' using errcode='42501'; end if;
     return e.id;
   end if;
-  if g.session_type is distinct from coalesce(e.session_type,s.session_type) or
-    g.niveau is distinct from coalesce(e.level,s.niveau_cefr) then
-    raise exception 'Enrollment group must match session/level' using errcode='23514'; end if;
-  perform public.save_receptionist_enrollment(p_student,e.id,p_group,e.status,e.level,
-    e.date_inscription,e.notes,e.session_type,e.school_year);
-  return e.id;
+  return academic_security.place(p_student,p_group,e.id,null,null,null,null,false);
 end $function$

 -- grants: postgres=X/postgres authenticated=X/postgres
```

## `public.save_receptionist_student`

Source: migration 119. Re-created by M1.

```diff
--- public.save_receptionist_student @119 (source 119)
+++ public.save_receptionist_student @121
@@ -21,11 +21,11 @@
     values(p_student,p_changes->>'full_name',(p_changes->>'date_naissance')::date,p_changes->>'telephone',
       p_changes->>'email',p_changes->>'parent_email',p_changes->>'age_category',p_changes->>'notes',
       coalesce(p_changes->>'session_type','Yearly'),p_changes->>'niveau_cefr',p_changes->>'referral_source',
-      p_changes->>'photo_url','Enrolled','Standard') on conflict on constraint students_pkey do nothing
+      p_changes->>'photo_url','Prospect','Standard') on conflict on constraint students_pkey do nothing
     returning students.id,students.updated_at into id,updated_at;
     if id is null then
       select * into s from public.students where students.id=p_student for update;
-      if s.deleted_at is not null or s.status is distinct from 'Enrolled' or s.plan_type is distinct from 'Standard' or
+      if s.deleted_at is not null or s.status is distinct from 'Prospect' or s.plan_type is distinct from 'Standard' or
         s.full_name is distinct from p_changes->>'full_name' or
         s.date_naissance is distinct from (p_changes->>'date_naissance')::date or
         s.telephone is distinct from p_changes->>'telephone' or
```

## `public.save_receptionist_enrollment`

Source: migration 117. Re-created by M1.

```diff
--- public.save_receptionist_enrollment @119 (source 117)
+++ public.save_receptionist_enrollment @121
@@ -5,7 +5,7 @@
  SET search_path TO 'pg_catalog', 'pg_temp'
 AS $function$
 declare s public.students%rowtype; e public.enrollments%rowtype; g public.groups%rowtype;
-  result uuid; effective_session text; effective_level text; effective_year text;
+  result uuid; effective_session text; effective_level text; effective_year text; v_constraint text;
 begin
   perform operational_security.require_receptionist();
   select * into s from public.students where id=p_student and deleted_at is null for update;
@@ -38,6 +38,11 @@
     if g.niveau is distinct from effective_level then
       raise exception 'Enrollment group must match its session and level' using errcode='23514'; end if;
   end if;
+  if effective_year is not null and exists(select 1 from public.enrollments x where x.student_id=p_student
+    and x.session_type=effective_session and x.school_year=effective_year and x.status not in ('Rejected','Ended')
+    and x.id is distinct from e.id) then
+    perform academic_security.duplicate(); end if;
+  begin
   if e.status in ('Confirmed','Validated') then
     if p_group is null or p_status not in ('Confirmed','Validated') then
       raise exception 'Only group assignment is permitted' using errcode='42501'; end if;
@@ -58,6 +63,11 @@
       where id=e.id returning id into result;
     end if;
   end if;
+  exception when unique_violation then
+    get stacked diagnostics v_constraint = constraint_name;
+    if v_constraint = 'enrollments_one_active_programme_year' then perform academic_security.duplicate(); end if;
+    raise;
+  end;
   return result;
 end $function$
```

## `public.soft_delete_student`

Source: migration 041. Re-created by M1.

```diff
--- public.soft_delete_student @119 (source 041)
+++ public.soft_delete_student @121
@@ -9,6 +9,10 @@
      or (public.get_my_role() in ('admin', 'director')) is not true then
     raise exception 'Forbidden' using errcode = '42501';
   end if;
+  perform 1 from public.students where id = p_student_id and deleted_at is null for update;
+  if found then
+    perform academic_security.leave(p_student_id, 'Inactive', 'Dossier archivé', null);
+  end if;
   update public.students set deleted_at = now()
     where id = p_student_id and deleted_at is null;
 end;
```

## `public.remove_student_group`

Source: migration 074. Re-created by M1.

```diff
--- public.remove_student_group @119 (source 074)
+++ public.remove_student_group @121
@@ -1,14 +1,18 @@
 CREATE OR REPLACE FUNCTION public.remove_student_group(p_student uuid, p_group uuid)
  RETURNS void
  LANGUAGE plpgsql
+ SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
 AS $function$
+declare v_id uuid;
 begin
-  perform 1 from public.students where id=p_student for update;
-  update public.enrollments set group_id=null,
-    status=case when status='Trial' then 'Under Review' else 'Confirmed' end
-  where student_id=p_student and group_id=p_group and status in ('Validated','Trial');
-  update public.students set groupe_id=null where id=p_student and groupe_id=p_group;
+  perform operational_security.require_capability('assign_group');
+  perform academic_security.lock_learner(p_student, null, false);
+  for v_id in select e.id from public.enrollments e where e.student_id=p_student and e.group_id=p_group
+      and e.status in ('Validated','Trial') order by e.id loop
+    perform academic_security.remove(p_student, p_group, v_id, null, null, false);
+  end loop;
+  perform public.sync_student_from_enrollments(p_student, false, p_group);
 end;
 $function$
```

## `crm_security.evaluate_conversion`

Source: migration 084. Re-created by M1.

```diff
--- crm_security.evaluate_conversion @119 (source 084)
+++ crm_security.evaluate_conversion @121
@@ -9,7 +9,8 @@
  select * into strict e from public.enrollments where id=l.enrollment_id for update;
  if e.student_id is distinct from l.student_id then raise exception 'CRM enrollment/student mismatch' using errcode='23514'; end if;
  if l.status='CONVERTED' then
-  if (e.status is null or e.status not in ('Confirmed','Validated')) and (not l.conversion_review_required or previous_status is distinct from e.status and previous_status is not null) then
+  if (e.status is null or e.status not in ('Confirmed','Validated')) and not (e.status='Ended' and previous_status in ('Confirmed','Validated'))
+   and (not l.conversion_review_required or previous_status is distinct from e.status and previous_status is not null) then
    insert into public.crm_activities(lead_id,enrollment_id,occurred_at,actor_id,actor_kind,event_type,source_key,body,details)
    values(l.id,e.id,happened,auth.uid(),case when auth.uid() is null then 'system' else 'user' end,'conversion_review_required',
     'conversion-review:'||e.id||':'||gen_random_uuid(),'Inscription modifiée après confirmation : vérification par la direction.',
```

## `public.crm_start_enrollment`

Source: migration 119. Re-created by M1.

```diff
--- public.crm_start_enrollment @119 (source 119)
+++ public.crm_start_enrollment @121
@@ -78,7 +78,7 @@
  if p_data->>'enrollment_id' is not null then
   select * into e from public.enrollments where id=(p_data->>'enrollment_id')::uuid for update;
   -- E5: the former combined check, split into incompatibility and linkage.
-  if not found or e.student_id is distinct from s.id or e.status is null or e.status='Rejected'
+  if not found or e.student_id is distinct from s.id or e.status is null or e.status in ('Rejected','Ended')
   or coalesce(e.session_type,s.session_type) is distinct from session or crm_security.enrollment_year(e) is distinct from year then
    raise exception 'Enrollment unavailable or incompatible' using errcode='22023',hint='crm_enrollment.enrollment_incompatible'; end if;
   if exists(select 1 from public.crm_leads where enrollment_id=e.id) then raise exception 'Enrollment unavailable or incompatible' using errcode='22023',hint='crm_enrollment.enrollment_already_linked'; end if;
@@ -92,8 +92,8 @@
   if exists(select 1 from public.enrollments x where x.student_id=s.id and x.status is null and coalesce(x.session_type,s.session_type)=session and crm_security.enrollment_year(x)=year) then
    raise exception 'Existing enrollment status requires review' using errcode='22023',hint='crm_enrollment.existing_enrollment_needs_review'; end if;
   -- E6: same condition and message; the hint says whether any match is still selectable.
-  if exists(select 1 from public.enrollments x where x.student_id=s.id and x.status<>'Rejected' and coalesce(x.session_type,s.session_type)=session and crm_security.enrollment_year(x)=year) then
-   raise exception 'Existing enrollment requires explicit selection' using errcode='22023',hint=case when exists(select 1 from public.enrollments x where x.student_id=s.id and x.status<>'Rejected'
+  if exists(select 1 from public.enrollments x where x.student_id=s.id and x.status not in ('Rejected','Ended') and coalesce(x.session_type,s.session_type)=session and crm_security.enrollment_year(x)=year) then
+   raise exception 'Existing enrollment requires explicit selection' using errcode='22023',hint=case when exists(select 1 from public.enrollments x where x.student_id=s.id and x.status not in ('Rejected','Ended')
     and coalesce(x.session_type,s.session_type)=session and crm_security.enrollment_year(x)=year and not exists(select 1 from public.crm_leads where enrollment_id=x.id))
     then 'crm_enrollment.existing_enrollment_requires_selection' else 'crm_enrollment.existing_enrollment_linked_elsewhere' end; end if;
   if p_data->>'group_id' is not null then
```

## `public.online_close_course`

Source: migration 118. Re-created by M1.

```diff
--- public.online_close_course @119 (source 118)
+++ public.online_close_course @121
@@ -4,7 +4,7 @@
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
 AS $function$
-declare c public.online_courses%rowtype; v_revoked integer;
+declare c public.online_courses%rowtype; v_revoked integer; v_ended integer;
 begin
   perform online_security.require_role(array['director', 'admin']);
   c := online_security.course_for_update(p_group, p_expected_version);
@@ -15,9 +15,13 @@
   from public.online_lessons l
   where t.lesson_id = l.id and l.group_id = p_group and t.revoked_at is null and t.expires_at > now();
   get diagnostics v_revoked = row_count;
+  v_ended := academic_security.end_group_enrollments(p_group, 'Alumni', 'Cours en ligne clôturé');
+  perform pg_advisory_xact_lock(hashtextextended('online:seats:' || p_group::text, 0));
+  v_ended := v_ended + academic_security.end_group_enrollments(p_group, 'Alumni', 'Cours en ligne clôturé');
   -- The opaque room reference stays on the server: the close route resolves it as the
   -- service role through online_resolve_room (migration 118, review fix N1).
-  return jsonb_build_object('group_id', c.group_id, 'version', c.version, 'status', c.status, 'revoked', v_revoked);
+  return jsonb_build_object('group_id', c.group_id, 'version', c.version, 'status', c.status, 'revoked', v_revoked,
+    'ended', v_ended);
 end $function$

 -- grants: postgres=X/postgres authenticated=X/postgres
```

## `public.attendance_student_in_group`

Source: migration 063. Re-created by M2.

```diff
--- public.attendance_student_in_group @119 (source 063)
+++ public.attendance_student_in_group @121
@@ -1,17 +1,13 @@
-CREATE OR REPLACE FUNCTION public.attendance_student_in_group(p_student uuid, p_group uuid)
+CREATE OR REPLACE FUNCTION public.attendance_student_in_group(p_student uuid, p_group uuid, p_session_date date DEFAULT NULL::date)
  RETURNS boolean
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'pg_temp'
 AS $function$
-  select exists (
-    select 1 from public.students s where s.id = p_student
-      and (s.groupe_id = p_group or exists (
-        select 1 from public.enrollments e
-        where e.student_id = s.id and e.group_id = p_group
-          and e.status in ('Validated','Trial')
-      ))
-  );
+  select academic_security.is_group_member(p_student, p_group)
+    or (p_session_date is not null and exists (select 1 from public.enrollments e
+      where e.student_id = p_student and e.status = 'Ended' and e.ended_group_id = p_group
+        and p_session_date < (e.ended_at at time zone 'Africa/Casablanca')::date))
 $function$

 -- grants: postgres=X/postgres service_role=X/postgres
```

## `public.enforce_attendance_integrity`

Source: migration 096. Re-created by M2.

```diff
--- public.enforce_attendance_integrity @119 (source 096)
+++ public.enforce_attendance_integrity @121
@@ -30,7 +30,7 @@
       is distinct from (old.student_id, old.group_id, old.session_date) then
     raise exception 'Attendance identity is immutable' using errcode = '23514';
   end if;
-  if not public.attendance_student_in_group(new.student_id, new.group_id) then
+  if not public.attendance_student_in_group(new.student_id, new.group_id, new.session_date) then
     raise exception 'Student is not enrolled in group' using errcode = '23514';
   end if;
   if tg_op = 'INSERT' then
```

## `public.teacher_can_access_student_group`

Source: migration 071. Re-created by M2.

```diff
--- public.teacher_can_access_student_group @119 (source 071)
+++ public.teacher_can_access_student_group @121
@@ -10,13 +10,7 @@
       select 1 from public.groups g
       where g.teacher_id = public.get_my_teacher_id()
         and (p_group is null or g.id = p_group)
-        and (
-          exists (select 1 from public.students s where s.id = p_student
-            and s.groupe_id = g.id and s.status in ('Enrolled','Trial'))
-          or exists (select 1 from public.enrollments e
-            where e.student_id = p_student and e.group_id = g.id
-              and e.status in ('Validated','Trial'))
-        )
+        and academic_security.is_group_member(p_student, g.id)
     );
 $function$
```

## `public.can_message_recipient`

Source: migration 069. Re-created by M2.

```diff
--- public.can_message_recipient @119 (source 069)
+++ public.can_message_recipient @121
@@ -19,12 +19,8 @@
     select g.id as group_id from public.groups g, actor a
     where a.role = 'teacher' and g.teacher_id = public.get_my_teacher_id()
   ), student_groups as (
-    select id as group_id from public.groups g
-    where g.id in (select groupe_id from students_for_actor)
-    union
-    select e.group_id from public.enrollments e
-    where e.student_id in (select id from students_for_actor)
-      and e.status in ('Validated','Trial')
+    select g.id as group_id from public.groups g
+    where exists (select 1 from students_for_actor sa where academic_security.is_group_member(sa.id, g.id))
   )
   select exists (
     select 1 from actor a, target t
@@ -43,10 +39,7 @@
         ))
         or (a.role = 'teacher' and exists (
           select 1 from public.students s where
-            (s.groupe_id in (select group_id from actor_groups)
-             or exists(select 1 from public.enrollments e
-               where e.student_id = s.id and e.group_id in (select group_id from actor_groups)
-                 and e.status in ('Validated','Trial')))
+            exists (select 1 from actor_groups ag where academic_security.is_group_member(s.id, ag.group_id))
             and (pg_catalog.lower(s.email) = t.email or pg_catalog.lower(s.parent_email) = t.email)
         ))
       )
```

## `storage_security.can_write`

Source: migration 096. Re-created by M2.

```diff
--- storage_security.can_write @119 (source 096)
+++ storage_security.can_write @121
@@ -13,7 +13,7 @@
      or (purpose='portfolio' and exists(select 1 from public.students s where s.id=sid and s.deleted_at is null and (
        (p.role='student' and s.email=p.email) or
        (p.role='teacher' and exists(select 1 from public.groups g join public.teachers t on t.id=g.teacher_id
-         where g.id=s.groupe_id and t.email=p.email and t.deleted_at is null)))))
+         where academic_security.is_group_member(s.id, g.id) and t.email=p.email and t.deleted_at is null)))))
      or (purpose='premium_homework' and exists(select 1 from public.students s where s.id=sid and s.deleted_at is null
        and s.plan_type='Premium' and (
          (p.role='student' and s.email=p.email) or (p.role='parent' and s.parent_email=p.email))))
```

## `public.resolve_storage_asset`

Source: migration 096. Re-created by M2.

```diff
--- public.resolve_storage_asset @119 (source 096)
+++ public.resolve_storage_asset @121
@@ -30,7 +30,7 @@
          (caller_role='parent' and s.parent_email=(select email from public.profiles where id=auth.uid()) and (a.purpose='student_photo' or pf.visible_to_parent is true)) or
          (caller_role='student' and s.email=(select email from public.profiles where id=auth.uid()) and (a.purpose='student_photo' or pf.visible_to_student is true)) or
          (caller_role='teacher' and exists(select 1 from public.groups g join public.teachers t on t.id=g.teacher_id
-           where g.id=s.groupe_id and t.email=(select email from public.profiles where id=auth.uid()) and t.deleted_at is null))
+           where academic_security.is_group_member(s.id, g.id) and t.email=(select email from public.profiles where id=auth.uid()) and t.deleted_at is null))
        )) or
        (a.purpose='premium_homework' and ph.id is not null and (
          (caller_role='parent' and s.parent_email=(select email from public.profiles where id=auth.uid())) or
```

## `public.search_students_page`

Source: migration 097. Re-created by M2.

```diff
--- public.search_students_page @119 (source 097)
+++ public.search_students_page @121
@@ -5,7 +5,6 @@
  SET search_path TO 'pg_catalog', 'pg_temp'
 AS $function$
 declare v_result jsonb;
-  v_is_receptionist boolean := public.get_my_role() = 'receptionist';
 begin
   if p_page < 1 or p_page_size < 0 or p_page_size > 100
     or pg_catalog.length(p_search) > 120
@@ -31,6 +30,8 @@
   ), candidates as materialized (
     select s.*,
       (select g.name from public.groups g where g.id = s.groupe_id) as group_name,
+      (select count(*) from public.enrollments e where e.student_id = s.id and e.group_id is not null
+        and e.status in ('Validated','Trial') and e.group_id is distinct from s.groupe_id) as extra_group_count,
       coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at, e.id)
         from public.enrollments e where e.student_id = s.id
           and e.status = 'Confirmed' and e.group_id is null), '[]'::jsonb) as pending_enrollments,
@@ -46,21 +47,17 @@
     left join finance f on f.student_id = s.id
     where (
       p_status = 'all_shown'
-      or (coalesce(p_status,'') = '' and s.status in ('Enrolled','Trial','Alumni'))
+      or (coalesce(p_status,'') = '' and s.status in ('Enrolled','Trial'))
       or (p_status not in ('','all_shown') and s.status = p_status)
     )
     and (coalesce(p_group,'') = '' or
       (p_group = 'unassigned' and (
-        (v_is_receptionist and (
-          exists (select 1 from public.enrollments e
-            where e.student_id = s.id and e.group_id is null
-              and e.status in ('Submitted','Under Review','Trial','Confirmed','Validated'))
-          or (s.groupe_id is null and not exists (
-            select 1 from public.enrollments e where e.student_id = s.id
-              and e.status in ('Submitted','Under Review','Trial','Confirmed','Validated')))))
-        or (not v_is_receptionist and (s.groupe_id is null or exists (
-          select 1 from public.enrollments e where e.student_id = s.id
-            and e.status = 'Confirmed' and e.group_id is null))))))
+        exists (select 1 from public.enrollments e where e.student_id = s.id
+          and e.status = 'Confirmed' and e.group_id is null)
+        or (s.status in ('Enrolled','Trial') and not exists (select 1 from public.enrollments e
+          where e.student_id = s.id and e.group_id is not null and e.status in ('Validated','Trial'))
+          and not exists (select 1 from public.enrollments e where e.student_id = s.id
+            and e.status in ('Submitted','Under Review','Confirmed'))))))
     and (coalesce(p_age_category,'') = '' or s.age_category = p_age_category)
     and (coalesce(p_session,'') = '' or s.session_type = p_session)
     and (coalesce(p_level,'') = '' or s.niveau_cefr = p_level)
@@ -87,7 +84,7 @@
     'rows',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.created_at desc,r.id asc) from rows r),'[]'::jsonb),
     'count',(select count(*) from filtered),
     'total',(select count(*) from public.students),
-    'active_count',(select count(*) from public.students where status in ('Enrolled','Trial','Alumni'))
+    'active_count',(select count(*) from public.students where status in ('Enrolled','Trial'))
   ) into v_result;
   return v_result;
 end;
```

## `public.sync_enrollments_from_student`

Source: migration 074. Re-created by M1.

```diff
--- public.sync_enrollments_from_student @119 (source 074)
+++ public.sync_enrollments_from_student @121
@@ -1,53 +1 @@
-CREATE OR REPLACE FUNCTION public.sync_enrollments_from_student()
- RETURNS trigger
- LANGUAGE plpgsql
- SET search_path TO 'pg_catalog', 'pg_temp'
-AS $function$
-declare
-  v_ids uuid[];
-  v_session text;
-  v_level text;
-begin
-  if pg_trigger_depth() > 1 then return new; end if;
-  if new.groupe_id is not distinct from old.groupe_id
-    and new.session_type is not distinct from old.session_type
-    and new.niveau_cefr is not distinct from old.niveau_cefr then return new; end if;

-  select array_agg(e.id) into v_ids from public.enrollments e
-  where e.student_id = new.id and e.status in ('Confirmed','Validated','Trial')
-    and old.groupe_id is not null and e.group_id = old.groupe_id;
-  if v_ids is null and new.groupe_id is not null then
-    select array_agg(e.id) into v_ids from public.enrollments e
-    where e.student_id=new.id and e.status='Confirmed' and e.group_id is null
-      and coalesce(e.session_type,old.session_type)=new.session_type;
-  end if;
-  if coalesce(array_length(v_ids,1),0) > 1 then
-    raise exception 'Plusieurs inscriptions sont concernées. Modifiez chaque inscription depuis la fiche apprenant.' using errcode='23514';
-  end if;
-  if new.groupe_id is not null then
-    select session_type,niveau into v_session,v_level from public.groups where id=new.groupe_id;
-    if v_session is distinct from new.session_type or v_level is distinct from new.niveau_cefr then
-      raise exception 'Le groupe doit correspondre à la session et au niveau.' using errcode='23514';
-    end if;
-  end if;
-  if v_ids is not null then
-    if exists(select 1 from public.enrollments where id=any(v_ids)
-      and coalesce(session_type,old.session_type) is distinct from new.session_type) then
-      raise exception 'Modifiez la session depuis son inscription dans la fiche apprenant.' using errcode='23514';
-    end if;
-    update public.enrollments set group_id=new.groupe_id,
-      level=new.niveau_cefr,
-      status=case when new.groupe_id is null then
-        case when status='Trial' then 'Under Review' else 'Confirmed' end
-        when status='Confirmed' then 'Validated' else status end
-    where id=any(v_ids);
-    if exists(select 1 from public.enrollments where id=any(v_ids) and status in ('Confirmed','Validated')) then
-      new.status := 'Enrolled';
-    end if;
-  end if;
-  return new;
-end;
-$function$
-
--- grants: postgres=X/postgres service_role=X/postgres
-
```

## `policy.announcements_audience_read`

Source: migration 024. Re-created by M2.

```diff
--- policy.announcements_audience_read @119 (source 024)
+++ policy.announcements_audience_read @121
@@ -1,6 +1,4 @@
 policy "announcements audience read" on public.announcements for SELECT to public
 using (((auth.uid() IS NOT NULL) AND ((audience = 'all'::text) OR ((audience = 'parents'::text) AND (get_my_role() = 'parent'::text)) OR ((audience = 'teachers'::text) AND (get_my_role() = 'teacher'::text)) OR ((audience = 'group'::text) AND (group_id IN ( SELECT g.id
    FROM groups g
-  WHERE (((get_my_role() = 'teacher'::text) AND (g.teacher_id = get_my_teacher_id())) OR ((get_my_role() = ANY (ARRAY['parent'::text, 'student'::text])) AND (g.id IN ( SELECT students.groupe_id
-           FROM students
-          WHERE (students.id IN ( SELECT get_visible_student_ids() AS get_visible_student_ids))))))))))))
+  WHERE (((get_my_role() = 'teacher'::text) AND (g.teacher_id = get_my_teacher_id())) OR ((get_my_role() = ANY (ARRAY['parent'::text, 'student'::text])) AND (g.id IN ( SELECT my_member_group_ids() AS my_member_group_ids))))))))))
```
