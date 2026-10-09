/**
 * Deterministic safety checks that run on the user's message *before and independently of* the
 * model, so emergency guidance never depends on the model's output quality.
 * Emergency number: 911 is the Philippine nationwide emergency hotline (Executive Order No. 56, s. 2018).
 */
export const EMERGENCY_NUMBER = '911';

const EMERGENCY_PATTERNS: { pattern: RegExp; topic: string }[] = [
  { pattern: /\bchest (pain|pressure|tightness)\b|\bheart attack\b|sakit (sa|ng) dibdib/i, topic: 'chest pain' },
  { pattern: /\b(can'?t|cannot|hard to|trouble|difficulty|struggling to) breath|\bnot breathing\b|\bchoking\b|hirap huminga/i, topic: 'breathing difficulty' },
  { pattern: /\bstroke\b|\bface (is )?droop|\bslurred speech\b|\bsudden (weakness|numbness)\b/i, topic: 'stroke signs' },
  { pattern: /\b(severe|heavy|uncontrolled|won'?t stop) bleeding\b|\bbleeding (a lot|heavily)\b/i, topic: 'severe bleeding' },
  { pattern: /\b(unconscious|unresponsive|passed out|fainted|seizure|convulsi)/i, topic: 'loss of consciousness or seizure' },
  { pattern: /\b(suicid|kill myself|end my life|self[- ]harm|hurt myself|want to die|magpakamatay)/i, topic: 'self-harm' },
  { pattern: /\b(overdose|took too many|poison(ed|ing)?)\b/i, topic: 'overdose or poisoning' },
  { pattern: /\banaphyla|\b(throat|tongue) (is )?swell|\bswollen (throat|tongue)\b/i, topic: 'severe allergic reaction' },
];

export interface SafetyAssessment {
  emergency: boolean;
  topics: string[];
}

export function assessMessage(text: string): SafetyAssessment {
  const topics = EMERGENCY_PATTERNS.filter((p) => p.pattern.test(text)).map((p) => p.topic);
  return { emergency: topics.length > 0, topics };
}

export const EMERGENCY_MESSAGE =
  `If this might be an emergency, call ${EMERGENCY_NUMBER} (Philippines) or your local emergency number now, ` +
  'or go to the nearest emergency room. Doc Pawi cannot assess emergencies.';

const DOSE_CHANGE = /\b(should i|can i|is it ok(ay)? to)\b.{0,40}\b(increase|decrease|double|stop|skip|change|lower|raise)\b.{0,30}\b(dose|dosage|medication|medicine|meds|pills?|insulin|metformin)\b/i;

/** True when the user asks whether to change their own medication or dose. */
export function asksAboutDoseChange(text: string) {
  return DOSE_CHANGE.test(text);
}

export const DOSE_CHANGE_NOTE =
  'Doc Pawi cannot advise changing, stopping, or adjusting medication. Please ask the clinician who prescribed it or a pharmacist.';
