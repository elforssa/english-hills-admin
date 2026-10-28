-- Restore for migration 124 (Batch G, plan SCG-r1). Forward-applicable: run only
-- after the application is rolled back to a build that does not call the new
-- functions. It returns every rewritten policy to its 123 expression,
-- search_students_page to its 121 body, and drops the index and the six new read
-- functions. It changes no data. The ledger row 124 is removed by the operator
-- wrapper, not here.
begin;

do $$ begin
  if to_regprocedure('public.report_years()') is null then
    raise exception 'Restore 124: migration 124 is not applied' using errcode = '55000';
  end if;
end $$;

set local search_path = public;

-- BEGIN GENERATED POLICIES (scripts/generate-rls-role-evaluation.mjs)
alter policy "activity_log select" on public."activity_log"
  using ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));

alter policy "receptionist_deny" on public."activity_log"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text))
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "announcements admin all" on public."announcements"
  using ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])))
  with check ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));

alter policy "announcements audience read" on public."announcements"
  using (((auth.uid() IS NOT NULL) AND (COALESCE(get_my_role(), 'pending'::text) <> 'pending'::text) AND ((audience = 'all'::text) OR ((audience = 'parents'::text) AND (get_my_role() = 'parent'::text)) OR ((audience = 'teachers'::text) AND (get_my_role() = 'teacher'::text)) OR ((audience = 'group'::text) AND (group_id IN ( SELECT g.id
   FROM groups g
  WHERE (((get_my_role() = 'teacher'::text) AND (g.teacher_id = get_my_teacher_id())) OR ((get_my_role() = ANY (ARRAY['parent'::text, 'student'::text])) AND (g.id IN ( SELECT my_member_group_ids() AS my_member_group_ids))))))))));

alter policy "receptionist_deny" on public."announcements"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text))
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "receptionist_deny" on public."anon_rate_limits"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text))
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "appconfig admin all" on public."app_config"
  using ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])))
  with check ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));

alter policy "appconfig auth read" on public."app_config"
  using (((auth.uid() IS NOT NULL) AND (COALESCE(get_my_role(), 'pending'::text) <> 'pending'::text)));

alter policy "receptionist_deny" on public."app_config"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text))
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "assessments admin all" on public."assessments"
  using ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])))
  with check ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));

alter policy "assessments parent read" on public."assessments"
  using (((get_my_role() = 'parent'::text) AND (student_id IN ( SELECT get_visible_student_ids() AS get_visible_student_ids))));

alter policy "assessments student read" on public."assessments"
  using (((get_my_role() = 'student'::text) AND (student_id IN ( SELECT get_visible_student_ids() AS get_visible_student_ids))));

alter policy "assessments teacher insert" on public."assessments"
  with check (teacher_can_access_student_group(student_id, group_id));

alter policy "assessments teacher select" on public."assessments"
  using (teacher_can_access_student_group(student_id, group_id));

alter policy "assessments teacher update" on public."assessments"
  using (teacher_can_access_student_group(student_id, group_id))
  with check (teacher_can_access_student_group(student_id, group_id));

alter policy "receptionist_assessment_read" on public."assessments"
  using (((get_my_role() = 'receptionist'::text) AND (student_id IN ( SELECT s.id
   FROM students s
  WHERE (s.deleted_at IS NULL)))));

alter policy "receptionist_delete_deny" on public."assessments"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "receptionist_insert_deny" on public."assessments"
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "receptionist_update_deny" on public."assessments"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text))
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "attendance admin all" on public."attendance"
  using ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])))
  with check ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));

alter policy "attendance teacher insert" on public."attendance"
  with check (((get_my_role() = 'teacher'::text) AND (group_id IS NOT NULL) AND teacher_can_access_student_group(student_id, group_id)));

alter policy "attendance teacher select" on public."attendance"
  using (((get_my_role() = 'teacher'::text) AND (group_id IS NOT NULL) AND teacher_can_access_student_group(student_id, group_id)));

alter policy "attendance teacher update" on public."attendance"
  using (((get_my_role() = 'teacher'::text) AND (group_id IS NOT NULL) AND teacher_can_access_student_group(student_id, group_id)))
  with check (((get_my_role() = 'teacher'::text) AND (group_id IS NOT NULL) AND teacher_can_access_student_group(student_id, group_id)));

alter policy "receptionist_attendance_delete_deny" on public."attendance"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "receptionist_attendance_insert" on public."attendance"
  with check (((get_my_role() = 'receptionist'::text) AND (EXISTS ( SELECT 1
   FROM students s
  WHERE ((s.id = attendance.student_id) AND (s.deleted_at IS NULL))))));

alter policy "receptionist_attendance_read" on public."attendance"
  using (((get_my_role() = 'receptionist'::text) AND (EXISTS ( SELECT 1
   FROM students s
  WHERE ((s.id = attendance.student_id) AND (s.deleted_at IS NULL))))));

alter policy "receptionist_attendance_update" on public."attendance"
  using (((get_my_role() = 'receptionist'::text) AND (EXISTS ( SELECT 1
   FROM students s
  WHERE ((s.id = attendance.student_id) AND (s.deleted_at IS NULL))))))
  with check (((get_my_role() = 'receptionist'::text) AND (EXISTS ( SELECT 1
   FROM students s
  WHERE ((s.id = attendance.student_id) AND (s.deleted_at IS NULL))))));

alter policy "authadults parent read" on public."authorized_adults"
  using (((get_my_role() = 'parent'::text) AND (student_id IN ( SELECT get_visible_student_ids() AS get_visible_student_ids))));

alter policy "authadults staff all" on public."authorized_adults"
  using ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])))
  with check ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));

alter policy "receptionist_authorized_adult_read" on public."authorized_adults"
  using (((get_my_role() = 'receptionist'::text) AND (student_id IN ( SELECT s.id
   FROM students s
  WHERE (s.deleted_at IS NULL)))));

alter policy "receptionist_delete_deny" on public."authorized_adults"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "receptionist_insert_deny" on public."authorized_adults"
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "receptionist_update_deny" on public."authorized_adults"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text))
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "certificates admin all" on public."certificates"
  using ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])))
  with check ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));

alter policy "certificates teacher read" on public."certificates"
  using (teacher_can_access_student_group(student_id, NULL::uuid));

alter policy "receptionist_deny" on public."certificates"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text))
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "charge discount reasons receptionist read" on public."charge_discount_reasons"
  using (((get_my_role() = 'receptionist'::text) AND (EXISTS ( SELECT 1
   FROM (charges c
     JOIN students s ON ((s.id = c.student_id)))
  WHERE ((c.id = charge_discount_reasons.charge_id) AND (s.deleted_at IS NULL))))));

alter policy "charge discount reasons staff read" on public."charge_discount_reasons"
  using ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));

alter policy "charges staff read" on public."charges"
  using ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));

alter policy "receptionist_charge_read" on public."charges"
  using (((get_my_role() = 'receptionist'::text) AND (student_id IN ( SELECT s.id
   FROM students s
  WHERE (s.deleted_at IS NULL)))));

alter policy "receptionist_delete_deny" on public."charges"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "receptionist_insert_deny" on public."charges"
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "receptionist_update_deny" on public."charges"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text))
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "dismissal parent read" on public."dismissal_logs"
  using (((get_my_role() = 'parent'::text) AND (student_id IN ( SELECT get_visible_student_ids() AS get_visible_student_ids))));

alter policy "dismissal staff all" on public."dismissal_logs"
  using ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])))
  with check ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));

alter policy "receptionist_deny" on public."dismissal_logs"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text))
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "enrollments admin all" on public."enrollments"
  using ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])))
  with check ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));

alter policy "receptionist_enrollment_read" on public."enrollments"
  using (((get_my_role() = 'receptionist'::text) AND (EXISTS ( SELECT 1
   FROM students s
  WHERE ((s.id = enrollments.student_id) AND (s.deleted_at IS NULL))))));

alter policy "financial events director read" on public."financial_events"
  using ((get_my_role() = 'director'::text));

alter policy "receptionist_deny" on public."financial_events"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text))
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "receptionist_deny" on public."financial_requests"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text))
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "groups admin all" on public."groups"
  using ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])))
  with check ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));

alter policy "groups read all auth" on public."groups"
  using (((auth.uid() IS NOT NULL) AND (COALESCE(get_my_role(), 'pending'::text) <> 'pending'::text)));

alter policy "learnassess admin all" on public."learning_assessments"
  using ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])))
  with check ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));

alter policy "learnassess parent read" on public."learning_assessments"
  using (((get_my_role() = 'parent'::text) AND (student_id IN ( SELECT get_visible_student_ids() AS get_visible_student_ids))));

alter policy "learnassess student read" on public."learning_assessments"
  using (((get_my_role() = 'student'::text) AND (student_id IN ( SELECT get_visible_student_ids() AS get_visible_student_ids))));

alter policy "learnassess teacher insert" on public."learning_assessments"
  with check (teacher_can_access_student_group(student_id, NULL::uuid));

alter policy "learnassess teacher select" on public."learning_assessments"
  using (teacher_can_access_student_group(student_id, NULL::uuid));

alter policy "learnassess teacher update" on public."learning_assessments"
  using (teacher_can_access_student_group(student_id, NULL::uuid))
  with check (teacher_can_access_student_group(student_id, NULL::uuid));

alter policy "receptionist_deny" on public."learning_assessments"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text))
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "leave admin all" on public."leave_requests"
  using ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])))
  with check ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));

alter policy "leave teacher insert" on public."leave_requests"
  with check (((auth.uid() IS NOT NULL) AND (get_my_role() = 'teacher'::text) AND (teacher_id = get_my_teacher_id()) AND (teacher_name = ( SELECT d.full_name
   FROM get_teacher_directory(leave_requests.teacher_id) d(id, full_name, email)
  WHERE (d.id = leave_requests.teacher_id))) AND (status = 'En attente'::text) AND (remplacant IS NULL) AND (date_fin >= date_debut) AND (created_at = now()) AND (updated_at = now())));

alter policy "leave teacher select" on public."leave_requests"
  using (((auth.uid() IS NOT NULL) AND (get_my_role() = 'teacher'::text) AND (teacher_id = get_my_teacher_id())));

alter policy "receptionist_deny" on public."leave_requests"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text))
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "messages admin all" on public."messages"
  using ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])))
  with check ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));

alter policy "messages self insert" on public."messages"
  with check (((get_my_role() = ANY (ARRAY['director'::text, 'admin'::text])) AND (from_user_email = lower(btrim(get_my_email()))) AND can_message_recipient(to_user_email)));

alter policy "messages self read" on public."messages"
  using (((get_my_role() = ANY (ARRAY['director'::text, 'admin'::text])) AND ((to_user_email = lower(btrim(get_my_email()))) OR (from_user_email = lower(btrim(get_my_email()))))));

alter policy "receptionist_deny" on public."messages"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text))
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "notifications admin all" on public."notifications"
  using ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])))
  with check ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));

alter policy "notifications self read" on public."notifications"
  using ((((get_my_role() = ANY (ARRAY['director'::text, 'admin'::text])) AND (recipient_email = lower(btrim(get_my_email())))) OR ((get_my_role() = ANY (ARRAY['teacher'::text, 'parent'::text, 'student'::text])) AND (recipient_profile_id = auth.uid()) AND ((student_id IS NULL) OR ((get_my_role() = ANY (ARRAY['parent'::text, 'student'::text])) AND (student_id IN ( SELECT get_visible_student_ids() AS get_visible_student_ids))) OR ((get_my_role() = 'teacher'::text) AND teacher_can_access_student_group(student_id, NULL::uuid))))));

alter policy "receptionist_deny" on public."notifications"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text))
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "online_staff_read" on public."online_attendance"
  using ((get_my_role() = ANY (ARRAY['director'::text, 'admin'::text, 'receptionist'::text])));

alter policy "online_staff_read" on public."online_consents"
  using ((get_my_role() = ANY (ARRAY['director'::text, 'admin'::text, 'receptionist'::text])));

alter policy "online_staff_read" on public."online_courses"
  using ((get_my_role() = ANY (ARRAY['director'::text, 'admin'::text, 'receptionist'::text])));

alter policy "online_staff_read" on public."online_lesson_guests"
  using ((get_my_role() = ANY (ARRAY['director'::text, 'admin'::text, 'receptionist'::text])));

alter policy "online_staff_read" on public."online_lesson_patterns"
  using ((get_my_role() = ANY (ARRAY['director'::text, 'admin'::text, 'receptionist'::text])));

alter policy "online_staff_read" on public."online_lessons"
  using ((get_my_role() = ANY (ARRAY['director'::text, 'admin'::text, 'receptionist'::text])));

alter policy "payroll HR staff only" on public."payroll"
  using (((auth.uid() IS NOT NULL) AND (get_my_role() = ANY (ARRAY['admin'::text, 'director'::text]))))
  with check (((auth.uid() IS NOT NULL) AND (get_my_role() = ANY (ARRAY['admin'::text, 'director'::text]))));

alter policy "payroll admin all" on public."payroll"
  using ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])))
  with check ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));

alter policy "receptionist_deny" on public."payroll"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text))
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "pending_roles admin select" on public."pending_roles"
  using ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));

alter policy "receptionist_deny" on public."pending_roles"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text))
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "crm_placement_operational_only" on public."placement_tests"
  using (((crm_lead_id IS NULL) OR (get_my_role() = ANY (ARRAY['director'::text, 'admin'::text, 'receptionist'::text]))))
  with check (((crm_lead_id IS NULL) OR (get_my_role() = ANY (ARRAY['director'::text, 'admin'::text, 'receptionist'::text]))));

alter policy "placement admin all" on public."placement_tests"
  using ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])))
  with check ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));

alter policy "placement teacher insert" on public."placement_tests"
  with check (teacher_can_access_student_group(student_id, NULL::uuid));

alter policy "placement teacher select" on public."placement_tests"
  using (teacher_can_access_student_group(student_id, NULL::uuid));

alter policy "placement teacher update" on public."placement_tests"
  using (teacher_can_access_student_group(student_id, NULL::uuid))
  with check (teacher_can_access_student_group(student_id, NULL::uuid));

alter policy "receptionist_placement_insert" on public."placement_tests"
  with check (((get_my_role() = 'receptionist'::text) AND ((student_id IS NULL) OR (EXISTS ( SELECT 1
   FROM students s
  WHERE ((s.id = placement_tests.student_id) AND (s.deleted_at IS NULL)))))));

alter policy "receptionist_placement_read" on public."placement_tests"
  using ((get_my_role() = 'receptionist'::text));

alter policy "receptionist_placement_update" on public."placement_tests"
  using ((get_my_role() = 'receptionist'::text))
  with check (((get_my_role() = 'receptionist'::text) AND ((student_id IS NULL) OR (EXISTS ( SELECT 1
   FROM students s
  WHERE ((s.id = placement_tests.student_id) AND (s.deleted_at IS NULL)))))));

alter policy "portfolios admin all" on public."portfolios"
  using ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])))
  with check ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));

alter policy "portfolios parent read" on public."portfolios"
  using (((get_my_role() = 'parent'::text) AND (student_id IN ( SELECT get_visible_student_ids() AS get_visible_student_ids)) AND (visible_to_parent = true)));

alter policy "portfolios student delete" on public."portfolios"
  using (((get_my_role() = 'student'::text) AND (student_id IN ( SELECT get_visible_student_ids() AS get_visible_student_ids)) AND (created_by = auth.uid()) AND (teacher_id IS NULL)));

alter policy "portfolios student insert" on public."portfolios"
  with check (((get_my_role() = 'student'::text) AND (student_id IN ( SELECT get_visible_student_ids() AS get_visible_student_ids))));

alter policy "portfolios student select" on public."portfolios"
  using (((get_my_role() = 'student'::text) AND (student_id IN ( SELECT get_visible_student_ids() AS get_visible_student_ids)) AND (visible_to_student = true)));

alter policy "portfolios student update" on public."portfolios"
  using (((get_my_role() = 'student'::text) AND (student_id IN ( SELECT get_visible_student_ids() AS get_visible_student_ids)) AND (created_by = auth.uid()) AND (teacher_id IS NULL)))
  with check (((get_my_role() = 'student'::text) AND (student_id IN ( SELECT get_visible_student_ids() AS get_visible_student_ids)) AND (created_by = auth.uid()) AND (teacher_id IS NULL)));

alter policy "portfolios teacher insert" on public."portfolios"
  with check (teacher_can_access_student_group(student_id, NULL::uuid));

alter policy "portfolios teacher select" on public."portfolios"
  using (teacher_can_access_student_group(student_id, NULL::uuid));

alter policy "portfolios teacher update" on public."portfolios"
  using (teacher_can_access_student_group(student_id, NULL::uuid))
  with check (teacher_can_access_student_group(student_id, NULL::uuid));

alter policy "receptionist_deny" on public."portfolios"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text))
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "premium attendance read" on public."premium_attendance"
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])) OR (student_id IN ( SELECT get_visible_student_ids() AS get_visible_student_ids)) OR ((get_my_role() = 'teacher'::text) AND (EXISTS ( SELECT 1
   FROM premium_sessions session
  WHERE ((session.id = premium_attendance.premium_session_id) AND (session.teacher_id = get_my_teacher_id())))))));

alter policy "premium attendance staff write" on public."premium_attendance"
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])) OR ((get_my_role() = 'teacher'::text) AND (EXISTS ( SELECT 1
   FROM premium_sessions session
  WHERE ((session.id = premium_attendance.premium_session_id) AND (session.teacher_id = get_my_teacher_id())))))))
  with check (((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])) OR ((get_my_role() = 'teacher'::text) AND (EXISTS ( SELECT 1
   FROM premium_sessions session
  WHERE ((session.id = premium_attendance.premium_session_id) AND (session.teacher_id = get_my_teacher_id())))))));

alter policy "receptionist_delete_deny" on public."premium_attendance"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "receptionist_insert_deny" on public."premium_attendance"
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "receptionist_premium_attendance_read" on public."premium_attendance"
  using ((get_my_role() = 'receptionist'::text));

alter policy "receptionist_update_deny" on public."premium_attendance"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text))
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "premium memberships admin write" on public."premium_group_memberships"
  using ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])))
  with check ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));

alter policy "premium memberships visible" on public."premium_group_memberships"
  using (((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])) OR (student_id IN ( SELECT get_visible_student_ids() AS get_visible_student_ids)) OR ((get_my_role() = 'teacher'::text) AND (EXISTS ( SELECT 1
   FROM premium_groups premium_group
  WHERE ((premium_group.id = premium_group_memberships.premium_group_id) AND (premium_group.teacher_id = get_my_teacher_id())))))));

alter policy "receptionist_delete_deny" on public."premium_group_memberships"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "receptionist_insert_deny" on public."premium_group_memberships"
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "receptionist_premium_membership_read" on public."premium_group_memberships"
  using ((get_my_role() = 'receptionist'::text));

alter policy "receptionist_update_deny" on public."premium_group_memberships"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text))
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "premium groups admin write" on public."premium_groups"
  using ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])))
  with check ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));

alter policy "receptionist_delete_deny" on public."premium_groups"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "receptionist_insert_deny" on public."premium_groups"
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "receptionist_premium_group_read" on public."premium_groups"
  using ((get_my_role() = 'receptionist'::text));

alter policy "receptionist_update_deny" on public."premium_groups"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text))
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "premium homework admin all" on public."premium_homework_submissions"
  using ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])))
  with check ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));

alter policy "premium homework parent insert" on public."premium_homework_submissions"
  with check (((get_my_role() = 'parent'::text) AND (student_id IN ( SELECT get_visible_student_ids() AS get_visible_student_ids))));

alter policy "premium homework parent read" on public."premium_homework_submissions"
  using (((get_my_role() = 'parent'::text) AND (student_id IN ( SELECT get_visible_student_ids() AS get_visible_student_ids))));

alter policy "premium homework parent update" on public."premium_homework_submissions"
  using (((get_my_role() = 'parent'::text) AND (student_id IN ( SELECT get_visible_student_ids() AS get_visible_student_ids))))
  with check (((get_my_role() = 'parent'::text) AND (student_id IN ( SELECT get_visible_student_ids() AS get_visible_student_ids))));

alter policy "premium homework student insert" on public."premium_homework_submissions"
  with check (((get_my_role() = 'student'::text) AND (student_id IN ( SELECT get_visible_student_ids() AS get_visible_student_ids))));

alter policy "premium homework student read" on public."premium_homework_submissions"
  using (((get_my_role() = 'student'::text) AND (student_id IN ( SELECT get_visible_student_ids() AS get_visible_student_ids))));

alter policy "premium homework student update" on public."premium_homework_submissions"
  using (((get_my_role() = 'student'::text) AND (student_id IN ( SELECT get_visible_student_ids() AS get_visible_student_ids))))
  with check (((get_my_role() = 'student'::text) AND (student_id IN ( SELECT get_visible_student_ids() AS get_visible_student_ids))));

alter policy "premium homework teacher read" on public."premium_homework_submissions"
  using (((get_my_role() = 'teacher'::text) AND (teacher_id = get_my_teacher_id())));

alter policy "premium homework teacher update" on public."premium_homework_submissions"
  using (((get_my_role() = 'teacher'::text) AND (teacher_id = get_my_teacher_id())))
  with check (((get_my_role() = 'teacher'::text) AND (teacher_id = get_my_teacher_id())));

alter policy "receptionist_deny" on public."premium_homework_submissions"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text))
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "premium sessions admin all" on public."premium_sessions"
  using ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])))
  with check ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));

alter policy "premium sessions parent read" on public."premium_sessions"
  using (((get_my_role() = 'parent'::text) AND ((student_id IN ( SELECT get_visible_student_ids() AS get_visible_student_ids)) OR (EXISTS ( SELECT 1
   FROM premium_group_memberships membership
  WHERE ((membership.premium_group_id = premium_sessions.premium_group_id) AND (membership.student_id IN ( SELECT get_visible_student_ids() AS get_visible_student_ids)) AND (membership.start_date <= premium_sessions.scheduled_date) AND ((membership.end_date IS NULL) OR (membership.end_date >= premium_sessions.scheduled_date))))))));

alter policy "premium sessions student read" on public."premium_sessions"
  using (((get_my_role() = 'student'::text) AND ((student_id IN ( SELECT get_visible_student_ids() AS get_visible_student_ids)) OR (EXISTS ( SELECT 1
   FROM premium_group_memberships membership
  WHERE ((membership.premium_group_id = premium_sessions.premium_group_id) AND (membership.student_id IN ( SELECT get_visible_student_ids() AS get_visible_student_ids)) AND (membership.start_date <= premium_sessions.scheduled_date) AND ((membership.end_date IS NULL) OR (membership.end_date >= premium_sessions.scheduled_date))))))));

alter policy "premium sessions teacher read" on public."premium_sessions"
  using (((get_my_role() = 'teacher'::text) AND (teacher_id = get_my_teacher_id())));

alter policy "premium sessions teacher update" on public."premium_sessions"
  using (((get_my_role() = 'teacher'::text) AND (teacher_id = get_my_teacher_id())))
  with check (((get_my_role() = 'teacher'::text) AND (teacher_id = get_my_teacher_id())));

alter policy "receptionist_delete_deny" on public."premium_sessions"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "receptionist_insert_deny" on public."premium_sessions"
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "receptionist_premium_session_read" on public."premium_sessions"
  using ((get_my_role() = 'receptionist'::text));

alter policy "receptionist_update_deny" on public."premium_sessions"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text))
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "profiles select" on public."profiles"
  using (((id = auth.uid()) OR (get_my_role() = ANY (ARRAY['admin'::text, 'director'::text]))));

alter policy "profiles update" on public."profiles"
  using ((id = auth.uid()))
  with check ((id = auth.uid()));

alter policy "receptionist_deny" on public."rate_limits"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text))
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "receipts admin insert" on public."receipts"
  with check ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));

alter policy "receipts admin select" on public."receipts"
  using ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));

alter policy "receipts admin update" on public."receipts"
  using ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])))
  with check ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));

alter policy "receptionist_delete_deny" on public."receipts"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "receptionist_insert_deny" on public."receipts"
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "receptionist_receipt_read" on public."receipts"
  using (((get_my_role() = 'receptionist'::text) AND (student_id IN ( SELECT s.id
   FROM students s
  WHERE (s.deleted_at IS NULL)))));

alter policy "receptionist_update_deny" on public."receipts"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text))
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "receptionist_deny" on public."storage_asset_bindings"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text))
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "receptionist_deny" on public."storage_assets"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text))
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "receptionist_student_read" on public."students"
  using (((get_my_role() = 'receptionist'::text) AND (deleted_at IS NULL)));

alter policy "students admin insert" on public."students"
  with check ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));

alter policy "students admin select" on public."students"
  using ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));

alter policy "students admin update" on public."students"
  using ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])))
  with check ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));

alter policy "receptionist_deny" on public."teachers"
  using ((get_my_role() IS DISTINCT FROM 'receptionist'::text))
  with check ((get_my_role() IS DISTINCT FROM 'receptionist'::text));

alter policy "teachers HR staff only" on public."teachers"
  using (((auth.uid() IS NOT NULL) AND (get_my_role() = ANY (ARRAY['admin'::text, 'director'::text]))))
  with check (((auth.uid() IS NOT NULL) AND (get_my_role() = ANY (ARRAY['admin'::text, 'director'::text]))));

alter policy "teachers admin insert" on public."teachers"
  with check ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));

alter policy "teachers admin select" on public."teachers"
  using ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));

alter policy "teachers admin update" on public."teachers"
  using ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])))
  with check ((get_my_role() = ANY (ARRAY['admin'::text, 'director'::text])));
-- END GENERATED POLICIES

-- search_students_page: the 121 definition, verbatim.
CREATE OR REPLACE FUNCTION public.search_students_page(p_search text DEFAULT ''::text, p_status text DEFAULT ''::text, p_age_category text DEFAULT ''::text, p_session text DEFAULT ''::text, p_level text DEFAULT ''::text, p_incomplete boolean DEFAULT false, p_source text DEFAULT ''::text, p_plan text DEFAULT ''::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20, p_group text DEFAULT ''::text, p_payment text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
  if p_page < 1 or p_page_size < 0 or p_page_size > 100
    or pg_catalog.length(p_search) > 120
    or coalesce(p_payment, '') not in ('', 'due', 'unpaid', 'partial', 'overdue', 'paid', 'none') then
    raise exception 'Invalid student page request' using errcode = '22023';
  end if;
  if p_page_size = 0 and public.get_my_role()='receptionist' then
    raise exception 'Student export forbidden' using errcode='42501';
  end if;
  if p_page_size = 0 and p_page <> 1 then
    raise exception 'Export page must be first page' using errcode = '22023';
  end if;

  with finance as materialized (
    select c.student_id,
      count(*) as charge_count,
      sum(c.balance)::numeric(12,2) as payment_balance,
      bool_or(c.balance > 0 and c.settlement_status = 'En retard') as has_overdue,
      bool_or(c.balance > 0 and c.paid_amount > 0) as has_partial
    from public.charge_balances c
    where c.voided_at is null
    group by c.student_id
  ), candidates as materialized (
    select s.*,
      (select g.name from public.groups g where g.id = s.groupe_id) as group_name,
      (select count(*) from public.enrollments e where e.student_id = s.id and e.group_id is not null
        and e.status in ('Validated','Trial') and e.group_id is distinct from s.groupe_id) as extra_group_count,
      coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at, e.id)
        from public.enrollments e where e.student_id = s.id
          and e.status = 'Confirmed' and e.group_id is null), '[]'::jsonb) as pending_enrollments,
      coalesce(f.payment_balance, 0)::numeric(12,2) as payment_balance,
      case
        when f.charge_count is null then 'Aucun engagement'
        when f.payment_balance <= 0 then 'Soldé'
        when f.has_overdue then 'En retard'
        when f.has_partial then 'Acompte versé'
        else 'En attente'
      end as payment_status
    from public.students s
    left join finance f on f.student_id = s.id
    where (
      p_status = 'all_shown'
      or (coalesce(p_status,'') = '' and s.status in ('Enrolled','Trial'))
      or (p_status not in ('','all_shown') and s.status = p_status)
    )
    and (coalesce(p_group,'') = '' or
      (p_group = 'unassigned' and (
        exists (select 1 from public.enrollments e where e.student_id = s.id
          and e.status = 'Confirmed' and e.group_id is null)
        or (s.status in ('Enrolled','Trial') and not exists (select 1 from public.enrollments e
          where e.student_id = s.id and e.group_id is not null and e.status in ('Validated','Trial'))
          and not exists (select 1 from public.enrollments e where e.student_id = s.id
            and e.status in ('Submitted','Under Review','Confirmed'))))))
    and (coalesce(p_age_category,'') = '' or s.age_category = p_age_category)
    and (coalesce(p_session,'') = '' or s.session_type = p_session)
    and (coalesce(p_level,'') = '' or s.niveau_cefr = p_level)
    and (not coalesce(p_incomplete,false) or (s.email is null or s.email = '') and (s.parent_email is null or s.parent_email = ''))
    and (coalesce(p_source,'') = '' or s.referral_source = p_source)
    and (coalesce(p_plan,'') = '' or coalesce(s.plan_type,'Standard') = p_plan)
    and (coalesce(p_search,'') = '' or pg_catalog.strpos(pg_catalog.lower(coalesce(s.full_name,'')),pg_catalog.lower(p_search)) > 0
      or pg_catalog.strpos(pg_catalog.lower(coalesce(s.email,'')),pg_catalog.lower(p_search)) > 0)
  ), filtered as materialized (
    select * from candidates
    where coalesce(p_payment, '') = ''
      or (p_payment = 'due' and payment_balance > 0)
      or (p_payment = 'unpaid' and payment_status = 'En attente')
      or (p_payment = 'partial' and payment_status = 'Acompte versé')
      or (p_payment = 'overdue' and payment_status = 'En retard')
      or (p_payment = 'paid' and payment_status = 'Soldé')
      or (p_payment = 'none' and payment_status = 'Aucun engagement')
  ), rows as (
    select * from filtered order by created_at desc, id asc
    limit nullif(p_page_size,0)
    offset case when p_page_size = 0 then 0 else (p_page - 1) * p_page_size end
  )
  select pg_catalog.jsonb_build_object(
    'rows',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.created_at desc,r.id asc) from rows r),'[]'::jsonb),
    'count',(select count(*) from filtered),
    'total',(select count(*) from public.students),
    'active_count',(select count(*) from public.students where status in ('Enrolled','Trial'))
  ) into v_result;
  return v_result;
end;
$function$;

drop function public.list_activity_log(timestamptz, uuid, text, text, date, date, text, integer);
drop function public.list_activity_log_tables();
drop function public.report_attendance_daily(integer);
drop function public.report_payroll_by_teacher(integer);
drop function public.report_student_mix();
drop function public.report_years();
drop index public.activity_log_created_id_idx;

notify pgrst, 'reload schema';
commit;
