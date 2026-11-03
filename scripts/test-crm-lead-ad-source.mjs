// Lead ad source (migration 126): the pure label helper and the panel's structure.
// No database, no browser.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adSourceLabel } from '../src/lib/crm/presentation.mjs';

// Names show; ids alone never do; the campaign is a muted suffix or, alone, the main text.
assert.equal(adSourceLabel(null), null);
assert.equal(adSourceLabel(undefined), null);
assert.equal(adSourceLabel('x'), null);
assert.equal(adSourceLabel({}), null);
assert.equal(adSourceLabel({ campaign_id: '1', adset_id: '2', ad_id: '3' }), null, 'ids alone show nothing');
assert.equal(adSourceLabel({ campaign_name: ' ', adset_name: '', ad_name: null }), null, 'blank names show nothing');
assert.deepEqual(adSourceLabel({ campaign_name: 'Rentrée', adset_name: 'Casa 25-45', ad_name: 'Vidéo', ad_id: '3' }), { main: 'Casa 25-45 › Vidéo', campaign: 'Rentrée' });
assert.deepEqual(adSourceLabel({ campaign_name: 'Rentrée', adset_name: 'Casa 25-45' }), { main: 'Casa 25-45', campaign: 'Rentrée' }, 'only the parts present');
assert.deepEqual(adSourceLabel({ ad_name: 'Vidéo' }), { main: 'Vidéo', campaign: null });
assert.deepEqual(adSourceLabel({ campaign_name: 'Rentrée' }), { main: 'Rentrée', campaign: null }, 'a campaign alone is the main text');
assert.deepEqual(adSourceLabel({ campaign_name: ' Rentrée ', adset_name: ' Casa ', ad_name: ' ' }), { main: 'Casa', campaign: 'Rentrée' }, 'trimmed');

// The panel: "Publicité · " under Dernière demande and under Première demande, French,
// muted campaign, wrapping; the component renders nothing without a label.
const sheet = readFileSync('src/components/crm/LeadDetailSheet.jsx', 'utf8');
assert.match(sheet, /import \{[^}]*\badSourceLabel\b[^}]*\} from '@\/lib\/crm\/presentation\.mjs'/, 'the panel uses the shared helper');
assert.match(sheet, /function AdSource\(\{ ad \}\) \{\s*const label = adSourceLabel\(ad\);\s*if \(!label\) return null;/, 'nothing is rendered without a label');
assert.match(sheet, /<dt className="inline text-muted-foreground">Publicité · <\/dt><dd className="inline">\{label\.main\}\{label\.campaign && <span className="ml-1 text-xs text-muted-foreground">\{label\.campaign\}<\/span>\}<\/dd>/, 'ad set › ad then the campaign as small muted text');
assert.match(sheet, /Dernière demande · <\/dt><dd className="inline break-words">\{inquiryLabel\(latest\)\}<\/dd><\/div><AdSource ad=\{latest\?\.ad\} \/>/, 'under Dernière demande');
assert.match(sheet, /Première demande · <\/dt><dd className="inline break-words">\{inquiryLabel\(first\)\}<\/dd><\/div><AdSource ad=\{first\?\.ad\} \/><\/>\}/, 'under Première demande only when it differs');
assert.equal((sheet.match(/<AdSource /g) || []).length, 2);
assert.match(sheet, /function AdSource[\s\S]*?<div className="break-words">/, 'wraps on phones');

// The migration builds the ad object from six fixed keys and nothing technical.
const migration = readFileSync('supabase/migrations/126_crm_lead_ad_source.sql', 'utf8');
const built = [...migration.matchAll(/jsonb_build_object\(([^;]*?)\)\s*;/gs)].map(m => m[1]);
for (const body of built) {
  const keys = [...body.matchAll(/'([a-z_]+)',/g)].map(m => m[1]);
  for (const key of keys) assert.doesNotMatch(key, /utm|fbclid|fbc|fbp|landing|referrer|raw_payload|consent|external|page_id|form_id|hierarchy|status/, `${key} never leaves the database`);
}
assert.match(migration, /revoke all on function crm_security\.inquiry_ad_source\(uuid\) from public,anon,authenticated,service_role;/);
assert.match(migration, /revoke all on function public\.crm_get_operational_acquisition_summary\(uuid\) from public,anon,authenticated,service_role;\s*grant execute on function public\.crm_get_operational_acquisition_summary\(uuid\) to authenticated;/, '107 revoke/grant pattern');
assert.match(migration, /perform crm_security\.require_reader\(false\);/);
assert.doesNotMatch(migration, /\b(insert|update|delete)\s+(into\s+)?public\./i, 'no data write');
console.log('PASS lead ad source: label helper, panel structure, migration shape');
