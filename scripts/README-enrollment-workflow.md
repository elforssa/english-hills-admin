# Enrollment and group workflow

Manual student creation uses Enrolled. CSV imports default omitted/empty status to
Enrolled while retaining an explicitly supplied historical status. Public
pre-registration continues to create Prospect / Submitted records.

Only Submitted and Under Review count as pending pre-registrations. Rejected and
Trial remain accessible through their filters. Confirmed and Validated records
are managed from the student profile; no enrollment or payment history is deleted.

The student list shows group placement and a server-paginated unassigned filter.
Group rosters count both the dossier group and validated/trial enrollments,
deduplicated by student. Reports include pending additional sessions.

Direct student group edits synchronize the matching enrollment atomically.
Ambiguous matches require selecting the enrollment from the student profile.
Changing the session of an existing linked membership is rejected rather than
silently repurposing its payment-linked enrollment. Removing a confirmed student's
group retains Enrolled / Confirmed, and removes current attendance membership.
Historical attendance is retained.

Every newly issued receipt, including Other and legacy-balance payments, marks
its student Enrolled. Other/legacy payments do not fabricate tuition enrollments.
Zero payments issue no receipt and do not enroll a prospect. Replayed requests do
not reactivate subsequently archived students. Existing receipt amounts, links,
and balances are preserved; there is no bulk historical status backfill.

## Local verification

Use local Supabase only and a feature branch. Migrations 073 and 074 are required.
Run `npm test`, `npm run build`, and the following rollback-only SQL fixtures
against `postgresql://postgres:postgres@127.0.0.1:54322/postgres`:

- scripts/test-paid-enrollment.sql
- scripts/test-student-placement.sql
- scripts/test-enrollment-workflow.sql

For UI coverage, run `npm run dev -- --port 3017`, then
`node scripts/test-student-placement-browser.mjs`. It checks the local URL and
feature branch, creates synthetic fixtures, and removes them in finally.

## Deployment order

Production deployment requires explicit approval under AGENTS.md. Apply 073 then
074 before deploying the UI. 073 preserves old named RPC calls via a defaulted
parameter. Deploy the frontend together with these database changes. Production
has not been changed by the local verification described here.
