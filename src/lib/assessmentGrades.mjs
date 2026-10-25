// Assessment grades (ACA-9): an empty field is "no grade", a 0 is a grade of 0.
export function parseGrade(value) {
  if (value === '' || value === null || value === undefined) return null;
  const grade = Number(value);
  return Number.isFinite(grade) ? grade : null;
}

// Weighted final grade out of 20; a missing component counts as 0, as before.
export function finalGrade(form) {
  const part = (value, weight) => (parseGrade(value) ?? 0) * (Number(weight) || 0);
  return Number(((part(form.note_oral, form.poids_oral) + part(form.note_ecrit, form.poids_ecrit)
    + part(form.note_devoirs, form.poids_devoirs)) / 100).toFixed(1));
}
