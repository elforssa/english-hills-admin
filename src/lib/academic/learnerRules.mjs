// RWR-r5 §6.4 (migration 141): the learner-file rules the form checks before saving.
// The trigger academic_security.student_rules() holds the same rules; the age bounds
// come from each programme's audience (programme_levels: « adultes » 18 and over,
// « enfants » and « ados » under 18, « tous » open), the seed of migration 140.
import { centreDate } from '../centreClock.mjs';
import { PROGRAMMES } from '../programCatalog.mjs';

const AUDIENCE_AGES = { adultes: [18, 120], enfants: [0, 17], ados: [0, 17], tous: [0, 120] };
export const CATEGORY_AGES = {
  'Young Learners (6-12)': [6, 12],
  'Teens (13-17)': [13, 17],
  'Adults (18+)': [18, 120],
  Corporate: [18, 120],
};

export function programmeAges(programme) {
  const audience = PROGRAMMES.find(p => p.code === programme)?.audience;
  return AUDIENCE_AGES[audience] || null;
}

export function programmeAllowsAge(programme, age) {
  const range = programmeAges(programme);
  return !range || age == null || age === '' || (Number(age) >= range[0] && Number(age) <= range[1]);
}

// « Adultes autorisés au retrait » is for children: hidden for an adults programme.
export function isAdultsProgramme(programme) {
  return PROGRAMMES.find(p => p.code === programme)?.audience === 'adultes';
}

// Whole years between a birth date and a date ('YYYY-MM-DD'), as Postgres age().
export function ageOn(birth, onDate = centreDate()) {
  if (!/^\d{4}-\d\d-\d\d$/.test(birth || '') || !/^\d{4}-\d\d-\d\d$/.test(onDate || '')) return null;
  const [by, bm, bd] = birth.split('-').map(Number), [y, m, d] = onDate.split('-').map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

// The latest birth date accepted: exactly one year before the business date.
export function latestBirthDate(today = centreDate()) {
  const [y, m, d] = today.split('-').map(Number);
  // 29 February a year back is 28 February (Postgres: date - interval '1 year').
  const last = new Date(Date.UTC(y - 1, m, 0)).getUTCDate();
  return `${y - 1}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

export function birthDateProblem(birth, today = centreDate()) {
  if (!birth) return null;
  if (birth > today) return 'student.birth_date_future';
  if (birth > latestBirthDate(today)) return 'student.birth_date_too_recent';
  return null;
}

// The category fits the programme when their age ranges overlap (an empty one fits).
export function categoryFits(category, programme) {
  const cat = CATEGORY_AGES[category], range = programmeAges(programme);
  return !cat || !range || (cat[0] <= range[1] && range[0] <= cat[1]);
}

export const STUDENT_MESSAGES = {
  'student.birth_date_future': 'La date de naissance ne peut pas être dans le futur.',
  'student.birth_date_too_recent': 'La date de naissance doit remonter à au moins un an.',
  'student.category_level': 'La catégorie d’âge ne correspond pas au programme ou au niveau.',
};
