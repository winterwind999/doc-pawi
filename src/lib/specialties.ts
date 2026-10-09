/** Common medical specialties offered as suggestions on the doctor form (free text is still allowed). */
export const SPECIALTIES = [
  'Internal Medicine',
  'Family Medicine',
  'Pediatrics',
  'Obstetrics and Gynecology (OB-GYN)',
  'General Surgery',
  'Cardiology',
  'Pulmonology',
  'Gastroenterology',
  'Endocrinology',
  'Nephrology',
  'Neurology',
  'Psychiatry',
  'Dermatology',
  'Ophthalmology',
  'Otorhinolaryngology (ENT)',
  'Orthopedics',
  'Urology',
  'Oncology',
  'Hematology',
  'Rheumatology',
  'Infectious Diseases',
  'Allergy and Immunology',
  'Physical Medicine and Rehabilitation',
  'Geriatrics',
  'Emergency Medicine',
  'Radiology',
  'Pathology',
  'Anesthesiology',
  'Neurosurgery',
  'Plastic and Reconstructive Surgery',
  'Sports Medicine',
  'Dentistry',
  'Psychology',
  'Nutrition and Dietetics',
] as const;

const POPULAR = ['Internal Medicine', 'Family Medicine', 'Pediatrics', 'Obstetrics and Gynecology (OB-GYN)', 'Cardiology', 'Dentistry'];

/**
 * Suggestions for what the user has typed: names starting with the text first, then names
 * containing it (also matching words such as "ENT" or "OB"). Empty input shows popular choices.
 */
export function suggestSpecialties(query: string, limit = 6): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return POPULAR.slice(0, limit);
  const starts = SPECIALTIES.filter((s) => s.toLowerCase().startsWith(q));
  const contains = SPECIALTIES.filter((s) => !s.toLowerCase().startsWith(q) && s.toLowerCase().includes(q));
  return [...starts, ...contains].filter((s) => s.toLowerCase() !== q).slice(0, limit);
}
