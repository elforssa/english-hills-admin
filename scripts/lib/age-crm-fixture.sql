-- Test-only (RWR-r5 §9 time travel): shift one synthetic prospect's timestamps by
-- -:delta so the data looks as if the clock had moved forward by :delta. Run as
-- postgres on a local stack only, with psql variables lead (uuid) and delta (interval).
-- No clock override exists in application code; this is the only time machine.
\set ON_ERROR_STOP on
begin;
set local session_replication_role=replica; -- history is append-only for application roles
update public.crm_leads set created_at=created_at-:'delta'::interval,updated_at=updated_at-:'delta'::interval,
 last_attempt_at=last_attempt_at-:'delta'::interval,last_conversation_at=last_conversation_at-:'delta'::interval,
 closed_at=closed_at-:'delta'::interval,converted_at=converted_at-:'delta'::interval,
 outreach_anchor_date=((outreach_anchor_date::timestamp-:'delta'::interval))::date
where id=:'lead';
update public.crm_tasks set due_at=due_at-:'delta'::interval,created_at=created_at-:'delta'::interval,updated_at=updated_at-:'delta'::interval,
 completed_at=completed_at-:'delta'::interval,cancelled_at=cancelled_at-:'delta'::interval,
 scheduled_end_at=scheduled_end_at-:'delta'::interval,outcome_at=outcome_at-:'delta'::interval
where lead_id=:'lead';
update public.crm_activities set occurred_at=occurred_at-:'delta'::interval,created_at=created_at-:'delta'::interval where lead_id=:'lead';
commit;
