// French plural (RWR-r5 §4.9): 0 and 1 take the singular, 2 and more the plural.
// pluralFr(2, 'apprenant') → '2 apprenants'; pluralFr(1, 'appel infructueux', 'appels infructueux').
export function pluralFr(count, singular, plural = `${singular}s`) {
  const n = Number(count) || 0;
  return `${n} ${Math.abs(n) >= 2 ? plural : singular}`;
}
