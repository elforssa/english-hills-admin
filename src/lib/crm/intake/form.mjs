import { MetaError } from '../meta/protocol.mjs';
const sessions = ['Yearly', 'Adults', 'Summer Camp', 'Communication Junior', 'Communication Adult', 'One-to-One', 'Mise à niveau', 'Other'];
const technical = /^(campaignid|campaignname|adsetid|adsetname|adid|adname|accountid|pageid|formid|formname|metaleadid|leadgenid|externalsubmissionid|rawpayload|trackingid|fbclid|fbc|fbp|accesstoken|appsecret|verifytoken|landingpage|referrer|cookies|headers|localstorage|sessionstorage|useragent|ipaddress|utmsource|utmmedium|utmcampaign|utmcontent|utmterm)$/;
const safeKey = key => !technical.test(key.toLowerCase().replace(/[^a-z0-9]/g, ''));
const text = (value, max = 200) => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : null;
export function normalizeForm(fieldData, mapping) {
  const values = new Map(), answers = [];
  for (const field of fieldData) {
    if (!field || !text(field.name, 100) || !Array.isArray(field.values) || field.values.length > 30 || values.has(field.name)) throw new MetaError('invalid_provider_data');
    if (!safeKey(field.name)) continue;
    if (field.values.some(v => !['string', 'number', 'boolean'].includes(typeof v) || (typeof v === 'string' && v.length > 2000) || (typeof v === 'number' && !Number.isFinite(v)))) throw new MetaError('invalid_provider_data');
    const value = field.values.length === 1 ? field.values[0] : field.values;
    values.set(field.name, value);
    const configured = text(mapping.question_labels?.[field.name]);
    answers.push({ key: field.name, label: configured || field.name.replace(/[_-]+/g, ' '), value,
      value_type: Array.isArray(value) ? 'array' : typeof value, label_source: configured ? 'mapping' : 'provider_key' });
  }
  const fields = {};
  for (const [canonical, key] of Object.entries(mapping.field_map)) {
    const value = values.get(key);
    if (value != null && !Array.isArray(value)) fields[canonical] = String(value).trim();
  }
  const core = {};
  for (const key of ['contact_name', 'phone', 'whatsapp', 'email', 'learner_name', 'program_interest_text']) core[key] = text(fields[key], key === 'email' ? 254 : 200);
  if (core.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(core.email)) core.email = null;
  core.learner_age = /^\d{1,3}$/.test(fields.learner_age || '') && Number(fields.learner_age) <= 120 ? Number(fields.learner_age) : null;
  core.learner_birth_date = /^\d{4}-\d{2}-\d{2}$/.test(fields.learner_birth_date || '') && Number.isFinite(Date.parse(fields.learner_birth_date)) && Date.parse(fields.learner_birth_date) <= Date.now() ? fields.learner_birth_date : null;
  core.session_type = sessions.includes(fields.session_type) ? fields.session_type : mapping.default_session_type || null;
  core.program_interest_text ||= mapping.default_program_interest_text || null;
  return { core_fields: core, form_answers: answers };
}
export { safeKey };
