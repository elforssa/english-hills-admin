// ACA-9 (plan EGC-r2): a grade of 0 is stored and shown as 0; only an empty field is no grade.
import assert from 'node:assert/strict';
import { finalGrade, parseGrade } from '../src/lib/assessmentGrades.mjs';

assert.equal(parseGrade('0'), 0);
assert.equal(parseGrade(0), 0);
assert.equal(parseGrade('12.5'), 12.5);
assert.equal(parseGrade(''), null);
assert.equal(parseGrade(null), null);
assert.equal(parseGrade(undefined), null);
assert.equal(parseGrade('abc'), null);
const weights = { poids_oral: 40, poids_ecrit: 30, poids_devoirs: 30 };
assert.equal(finalGrade({ ...weights, note_oral: '0', note_ecrit: '0', note_devoirs: '0' }), 0);
assert.equal(finalGrade({ ...weights, note_oral: '20', note_ecrit: '10', note_devoirs: '' }), 11);
assert.equal(finalGrade({ ...weights, note_oral: 15, note_ecrit: 15, note_devoirs: 15 }), 15);
console.log('PASS assessment grades: 0 kept, empty is no grade, weighted final grade');
