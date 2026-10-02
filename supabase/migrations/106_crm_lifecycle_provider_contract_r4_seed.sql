-- H3-04 only: immutable revision-5 provider contract, no activation/configuration.
-- Owner manifest approval: PR #51 comment 5950202458, 2026-10-02T10:19:01Z.
-- Final public documentation verification: 2026-10-02; see dated H3-04 evidence.
begin;

insert into public.crm_lifecycle_provider_contracts (
  id,
  contract_key,
  revision,
  api_version,
  qualified_event_name,
  converted_event_name,
  lifecycle_model,
  event_map,
  action_source,
  maximum_event_age_seconds,
  uncertainty_policy,
  deduplication_window_seconds,
  accepted_response_field,
  accepted_response_count,
  lead_id_only,
  required_constants,
  evidence_urls,
  verified_on,
  approved_at,
  active
) values (
  '7cf9833e-4f77-4335-b1ec-c047d9353f54',
  'eh_meta_crm_r4_v26_r1',
  1,
  'v26.0',
  'Qualified',
  'Converted',
  'r4_stage_entry',
  '{"intake":"Intake","not_qualified":"Not qualified","lost":"Lost","qualified":"Qualified","converted":"Converted"}'::jsonb,
  'system_generated',
  604800,
  'no_uncertain_replay',
  null,
  'events_received',
  1,
  true,
  '{"event_source":"crm","lead_event_source":"English Hills CRM"}'::jsonb,
  '["https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration/payload-specification","https://developers.facebook.com/documentation/ads-commerce/conversions-api/using-the-api","https://developers.facebook.com/documentation/ads-commerce/conversions-api/get-started","https://developers.facebook.com/docs/graph-api/guides/secure-requests","https://developers.facebook.com/documentation/facebook-login/guides/access-tokens","https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ads-pixel/events","https://github.com/facebook/facebook-nodejs-business-sdk/blob/0d245ec888c1af38d68994fd7f2e24cd38abc82f/src/objects/serverside/user-data.js"]'::jsonb,
  '2026-10-02',
  '2026-10-02T10:19:01Z',
  true
);

commit;
