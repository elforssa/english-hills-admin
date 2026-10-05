import { readFileSync } from 'node:fs';
// Reuse the existing synthetic 10k opportunities / 50k tasks / long history.
export function workCalendarFixture() {
  const source=readFileSync('scripts/test-crm-opportunities.sql','utf8');
  return source.slice(source.indexOf('begin;'),source.indexOf('do $$ declare r jsonb;'))+
    readFileSync('scripts/fixtures/crm-work-calendar.sql','utf8');
}
