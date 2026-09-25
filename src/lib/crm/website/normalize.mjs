import { normalizeForm } from '../intake/form.mjs';
import { MetaError } from '../meta/protocol.mjs';
export function normalizeWebsite(job, mapping) {
  if (!mapping) throw new MetaError('missing_mapping');
  const fields = Object.entries(job.payload.answers).map(([name, value]) => ({ name, values: Array.isArray(value) ? value : [value] }));
  const normalized = normalizeForm(fields, mapping);
  const contact = job.payload.contact;
  normalized.core_fields = { ...normalized.core_fields, contact_name: contact.name || normalized.core_fields.contact_name,
    phone: contact.phone || null, email: contact.email || null, whatsapp: contact.whatsapp || null };
  return { ...normalized, source_label: `Site web • ${normalized.core_fields.program_interest_text || mapping.form_name || "Demande d’information"}` };
}
