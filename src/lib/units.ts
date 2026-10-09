/** Parses a user-typed number ("65", "65.5", "65,5"). Returns null for empty or invalid input. */
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function formatHeight(value: number | null, unit: 'cm' | 'in' | null): string {
  if (value == null || !unit) return 'Not recorded';
  if (unit === 'cm') return `${value} cm`;
  const feet = Math.floor(value / 12);
  const inches = Math.round((value - feet * 12) * 10) / 10;
  return `${value} in (${feet} ft ${inches} in)`;
}

export function formatWeight(value: number | null, unit: 'kg' | 'lb' | null): string {
  if (value == null || !unit) return 'Not recorded';
  return `${value} ${unit}`;
}
