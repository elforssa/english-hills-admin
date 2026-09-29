# Security and permission boundaries

Authorization is not sidebar visibility. UI, page route, server/API/RPC and RLS/database must agree. Middleware skips API role gating so each handler must authenticate itself. Database role is authoritative; client input and editable Auth metadata are not role proof. Never broaden RLS or remove checks/tests merely to make frontend access work.

## Current roles

| Role | Current boundary |
| --- | --- |
| director | Broad school operations, CRM technical/configuration/revenue/reporting access, privileged role transitions and financial voids. |
| admin | Broad school operations including authorized finance/payroll and operational CRM. CRM analytics and technical integration RPCs remain director-only. Cannot assign privileged director/admin/receptionist roles through role-management RPCs. |
| receptionist | Batch 1: exact Today, prospects, placement, student dossier and admissions, groups/attendance/Premium operations, receipt creation/list/print, safe teacher directory/edit, read-only assessments and own account. Narrow RPCs and matching RLS enforce actions. No finance analytics or destructive corrections, teacher HR/payroll, integrations, users or system administration. The owner reports 096 deployed in Production. |
| teacher | Allowlisted teaching pages; student/group access depends on linked academic relationships. No full teacher HR/payroll table access. |
| parent / student | Own portal plus settings routes; linked family/self records as constrained by database policies. |
| pending / unknown | No operational access. |

Sources: [middleware](../../src/middleware.js), [ProtectedRoute](../../src/components/ProtectedRoute.jsx), [roleAccess](../../src/lib/roleAccess.mjs), [077](../../supabase/migrations/077_receptionist_role_and_operational_access.sql), deployed [096](../../supabase/migrations/096_receptionist_operational_permissions.sql) per owner evidence, [079](../../supabase/migrations/079_crm_read_interfaces_and_permissions.sql), [071](../../supabase/migrations/071_teacher_academic_relationships.sql). `/settings` route access does not grant system configuration rights. CRM technical reads/configuration require director, even though admin has broad page access.

Receptionist enrollment writes allow Submitted/Under Review/Trial; they cannot independently confirm an enrollment. Assignment of an already Confirmed/Validated enrollment is narrowly permitted. Batch 1 routes new charges/payments through the existing financial engine and confines teacher reads to a fixed operational projection. The pending UI correction uses the shared operational Students list and gates CSV import/export and programme inline edits; the existing narrow RPCs remain the write authority. This correction is not yet deployed.

## Sensitive data and privileged code

- Financial and payroll-sensitive data require explicit authorization. [043](../../supabase/migrations/043_teacher_sensitive_data_isolation.sql) isolates full teacher/compensation rows to admin/director; non-HR consumers use a fixed teacher directory projection. [Payroll API](../../src/app/api/admin/payroll/route.js) checks stored admin/director role before privileged computation/write; [065](../../supabase/migrations/065_payroll_direct_write_guard.sql) blocks client payroll writes.
- CRM tables are not ordinary client CRUD surfaces: use authorized read models/commands. SECURITY DEFINER code needs explicit actor/role validation, fixed search paths and restricted execute grants. Service-role access is not a substitute for checking the caller.
- Keep secrets/tokens/private credentials out of repository, browser bundles, logs and documentation. [Service-role client](../../src/lib/supabase-admin.js) is server-only. Secret references may be documented; secret values must not be.
- Meta lifecycle feedback must never send child name, child DOB, child age, level, placement-test data, internal notes/history, task history, finance/payment data or arbitrary form answers. Adult contact matching and eligible lifecycle evidence remain separately controlled by consent and delivery rules. Current [payload adapter](../../src/lib/crm/lifecycle/adapter.mjs) uses a restricted adult contact envelope and hashed phone/email with configured event identity. Preserve consent/eligibility checks and stable delivery IDs. Mock support is not permission to activate live delivery.
- Protect Meta webhook raw-body signature verification, public intake validation/rate limiting/origin policy, internal worker authentication and the separate scheduler bearer. Origin/CORS alone is not authentication. [Integration runbook](../crm-operations-runbook.md).
- Preserve storage authorization, PII scrubbing and immutable audit/financial evidence. Never export real customer data into local fixtures without explicit authorization.

## Production boundary

Production migrations, provider activation, secrets, scheduler and Vercel configuration require explicit approval. Never automatically push linked migrations or mutate production to verify documentation. Deployed migrations are immutable and new migrations must first pass local verification. [AGENTS](../../AGENTS.md) is the execution policy; [CURRENT_STATE](CURRENT_STATE.md) records the limits of deployment evidence.
