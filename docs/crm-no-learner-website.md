# Website inquiries without a named learner

Migration 092 changes the shared external-intake functions for two website form
keys only: `general_contact_v1` and `campaign_adult_lead_v1`. These forms can
represent a business or adult inquiry before a separate learner is identified.
`campaign_parent_lead_v1`, other website forms, and Meta intake retain the
existing learner-name requirement for automatic lead creation.

An eligible inquiry must still have a contact name, a valid contact method, and
a program interest. It creates a `NEW` lead with `learner_name` and
`learner_name_normalized` both NULL, plus the normal first-contact task. The
contact's name is displayed by the existing Today and Prospects read models;
it is never copied into the learner fields.

For automatic reuse, the contact must be uniquely corroborated by name and
phone/email. If that contact has no active opportunity, a new unnamed one can
be created. If there is exactly one active opportunity, it can be reused only
when its learner is also unnamed and its program and session match. Named
children, multiple active opportunities, conflicting program/session data,
and uncertain contact identity remain in `needs_review`. The named-learner
matching branch, including sibling and birth-date safeguards, is unchanged.

The receptionist review read model marks the two eligible forms so the
existing authenticated `crm_resolve_external_intake` command can create a new
lead with a NULL learner name. That command can resolve a previously accepted
submission after deployment; migration 092 does not replay, rewrite, or
resolve any production submission. The original website request need not be
submitted again. Existing website `form_answers` remain unchanged.
