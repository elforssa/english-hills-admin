import assert from 'node:assert/strict';
import { ACTIVE, BOARD_STAGES, OPPORTUNITY_VIEWS, opportunityAction } from '../src/lib/crm/presentation.mjs';
assert.equal(Object.keys(OPPORTUNITY_VIEWS).length, 9);
assert.deepEqual(BOARD_STAGES, ['NEW','CONTACTING','ENGAGED','QUALIFIED','CONVERTED']);
assert(!ACTIVE.includes('CONVERTED'));
for (const from of [...BOARD_STAGES,'LOST','NOT_QUALIFIED']) for (const to of BOARD_STAGES) {
 const expected = from === to ? null : from === 'NEW' && to === 'CONTACTING' ? 'call'
  : ['NEW','CONTACTING'].includes(from) && to === 'ENGAGED' ? 'conversation'
  : ['NEW','CONTACTING','ENGAGED'].includes(from) && to === 'QUALIFIED' ? 'qualify'
  : from === 'QUALIFIED' && to === 'CONVERTED' ? 'enrollment' : 'unsupported';
 assert.equal(opportunityAction(from,to),expected,`${from} -> ${to}`);
}
console.log('PASS O3 semantic interaction matrix, fixed Views, Converted terminal display');
