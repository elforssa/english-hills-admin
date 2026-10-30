import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const importPure = async relativePath => {
  const source = await readFile(new URL(relativePath, import.meta.url));
  return import(`data:text/javascript;base64,${source.toString('base64')}`);
};
const { scrubEvent, scrubBreadcrumb } = await importPure('../src/lib/sentry-scrub.js');
const { csvCell } = await importPure('../src/utils/exportCsv.js');

const event = scrubEvent({
  message: 'Bearer abc.def.ghi contact child@example.invalid',
  request: {
    url: 'https://school.example/route?access_token=secret#refresh_token=other',
    query_string: 'access_token=secret', data: { password: 'secret' },
    headers: { Authorization: 'Bearer secret', COOKIE: 'sb-access=secret', 'X-Api-Key': 'secret', 'x-eh-visitor-token': 'v1.1700000000.MjAzLjAuMTEzLjk.secret' },
  },
  extra: { redirectUrl: 'https://school.example/callback?code=secret#token', nested: { phone: '0612345678' } },
  contexts: { trace: { sessionToken: 'secret' } },
});
const serialized = JSON.stringify(event);
for (const secret of ['secret', 'refresh_token', 'child@example.invalid', '0612345678']) {
  assert(!serialized.includes(secret), `Telemetry retained ${secret}`);
}
assert.equal(event.request.url, 'https://school.example/route');
assert.equal(event.extra.redirectUrl, 'https://school.example/callback');
assert.equal(event.request.headers.Authorization, '[redacted]');
assert.equal(event.request.headers['x-eh-visitor-token'], '[redacted]');
assert(!serialized.includes('MjAzLjAuMTEzLjk'), 'Telemetry retained the signed visitor IP');

// H6 turns server reporting on: phone numbers with separators are redacted too, dates kept.
for (const phone of ['+212 6 12 34 56 78', '06-12-34-56-78', '06.12.34.56.78', '0612 345 678', '+212612345678']) {
  const scrubbed = JSON.stringify(scrubEvent({ message: `Rappeler ${phone} demain`, extra: { note: `tel ${phone}` } }));
  assert(!scrubbed.includes(phone) && !/\d{2}[ .-]\d{2}[ .-]\d{2}/.test(scrubbed), `Telemetry retained ${phone}`);
}
assert.equal(scrubEvent({ message: 'Échéance 2026-10-29 à 10:30' }).message, 'Échéance 2026-10-29 à 10:30', 'an ISO date is not a phone number');

const crumb = scrubBreadcrumb({
  message: 'student@example.invalid',
  data: { url: 'https://school.example/path?token=secret#code', body: 'secret', Authorization: 'Bearer secret' },
});
assert.equal(crumb.data.url, 'https://school.example/path');
assert(!JSON.stringify(crumb).includes('secret'));

for (const value of ['=1+1', '+SUM(A1:A2)', '-CMD', '@HYPERLINK', '\t=1+1']) {
  assert(csvCell(value).startsWith("'"), `CSV formula not escaped: ${value}`);
}
assert.equal(csvCell('a,"b"'), '"a,""b"""');
console.log('PASS telemetry sanitization and CSV formula regression tests');
