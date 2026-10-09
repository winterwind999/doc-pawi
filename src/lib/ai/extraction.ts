import { z } from 'zod';

import { isValidIsoDate, todayLocal } from '../dates';
import type { RecordCategory } from '../db/models';
import type { RecordProposalPayload } from '../services/proposal-service';

/**
 * Document field extraction. The local LLM is constrained with this JSON schema (llama.cpp
 * converts it to a grammar), the result is validated with Zod, and every extracted value is
 * checked against the OCR text. Values that do not appear in the text are flagged for review.
 */
export const DOCUMENT_TYPES = [
  'lab_result',
  'prescription',
  'vaccination_record',
  'imaging_report',
  'consultation_note',
  'discharge_summary',
  'medical_certificate',
  'other',
] as const;

export const EXTRACTION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    document_type: { type: 'string', enum: [...DOCUMENT_TYPES] },
    title: { type: 'string' },
    document_date: { type: 'string' },
    facility: { type: 'string' },
    clinician: { type: 'string' },
    summary: { type: 'string' },
    lab_results: {
      type: 'array',
      maxItems: 15,
      items: {
        type: 'object',
        properties: {
          test: { type: 'string' },
          value: { type: 'string' },
          unit: { type: 'string' },
          reference_range: { type: 'string' },
          flag: { type: 'string', enum: ['high', 'low', 'normal', 'abnormal', ''] },
        },
        required: ['test', 'value', 'unit', 'reference_range', 'flag'],
      },
    },
    medications: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, strength: { type: 'string' }, instructions: { type: 'string' } },
        required: ['name', 'strength', 'instructions'],
      },
    },
    vaccinations: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        properties: { vaccine: { type: 'string' }, dose: { type: 'string' }, date: { type: 'string' } },
        required: ['vaccine', 'dose', 'date'],
      },
    },
    diagnoses: { type: 'array', maxItems: 8, items: { type: 'string' } },
  },
  required: [
    'document_type',
    'title',
    'document_date',
    'facility',
    'clinician',
    'summary',
    'lab_results',
    'medications',
    'vaccinations',
    'diagnoses',
  ],
} as const;

const str = (max: number) =>
  z
    .string()
    .transform((s) => s.trim().slice(0, max))
    .catch('');

export const extractionSchema = z.object({
  document_type: z.enum(DOCUMENT_TYPES).catch('other'),
  title: str(160),
  document_date: str(20),
  facility: str(160),
  clinician: str(120),
  summary: str(1200),
  lab_results: z
    .array(
      z.object({
        test: str(120),
        value: str(60),
        unit: str(40),
        reference_range: str(80),
        flag: z.enum(['high', 'low', 'normal', 'abnormal', '']).catch(''),
      }),
    )
    .max(15)
    .catch([]),
  medications: z
    .array(z.object({ name: str(120), strength: str(60), instructions: str(300) }))
    .max(10)
    .catch([]),
  vaccinations: z
    .array(z.object({ vaccine: str(120), dose: str(60), date: str(20) }))
    .max(10)
    .catch([]),
  diagnoses: z.array(str(200)).max(8).catch([]),
});
export type Extraction = z.output<typeof extractionSchema>;

/** Lowercase, unify dashes/whitespace, and drop characters OCR often mangles. */
export function normalizeForMatch(text: string) {
  return text
    .toLowerCase()
    .replace(/[‐-―−]/g, '-')
    .replace(/[^a-z0-9.\-/%^ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when `value` (or, for multi-word values, all of its tokens) occurs in the OCR text. */
export function isGrounded(value: string, normalizedSource: string): boolean {
  const v = normalizeForMatch(value);
  if (!v) return true;
  if (normalizedSource.includes(v)) return true;
  const tokens = v.split(' ').filter((t) => t.length > 1);
  return tokens.length > 1 && tokens.every((t) => normalizedSource.includes(t));
}

export interface GroundingReport {
  /** Dotted paths of extracted values that were not found in the source text. */
  ungrounded: string[];
  checked: number;
}

export function checkGrounding(extraction: Extraction, sourceText: string): GroundingReport {
  const source = normalizeForMatch(sourceText);
  const ungrounded: string[] = [];
  let checked = 0;
  const check = (path: string, value: string) => {
    if (!value.trim()) return;
    checked += 1;
    if (!isGrounded(value, source)) ungrounded.push(path);
  };
  check('document_date', extraction.document_date);
  check('facility', extraction.facility);
  check('clinician', extraction.clinician);
  extraction.lab_results.forEach((l, i) => {
    check(`lab_results.${i}.test`, l.test);
    check(`lab_results.${i}.value`, l.value);
    check(`lab_results.${i}.unit`, l.unit);
    check(`lab_results.${i}.reference_range`, l.reference_range);
  });
  extraction.medications.forEach((m, i) => {
    check(`medications.${i}.name`, m.name);
    check(`medications.${i}.strength`, m.strength);
  });
  extraction.vaccinations.forEach((v, i) => {
    check(`vaccinations.${i}.vaccine`, v.vaccine);
    check(`vaccinations.${i}.date`, v.date);
  });
  return { ungrounded, checked };
}

const ABNORMAL_WORDS = /\b(high|higher|elevated|raised|increased|low|lower|decreased|reduced|abnormal)\b/;
const NORMAL_WORD = /\bnormal\b/;

/**
 * The summary is free text written by the model, so it is not word-matched like the extracted
 * values. This flags clauses that call a test abnormal when the document does not mark it, or
 * normal when it does (seen on device: "elevated creatinine" for an unflagged 88 umol/L).
 */
export function checkSummaryConsistency(summary: string, labResults: readonly { test: string; flag?: string | null }[]): string[] {
  if (!summary.trim() || !labResults.length) return [];
  const clauses = summary
    .split(/[,.;:()]|\b(?:and|but|while|whereas|with)\b/i)
    .map(normalizeForMatch)
    .filter(Boolean);
  const warnings: string[] = [];
  for (const lab of labResults) {
    const name = normalizeForMatch(lab.test);
    if (!name) continue;
    const marked = Boolean(lab.flag) && lab.flag !== 'normal';
    for (const clause of clauses) {
      if (!clause.includes(name)) continue;
      if (ABNORMAL_WORDS.test(clause) && !marked) {
        warnings.push(`The summary describes ${lab.test} as abnormal, but the document does not mark it.`);
        break;
      }
      if (!ABNORMAL_WORDS.test(clause) && NORMAL_WORD.test(clause) && marked) {
        warnings.push(`The summary calls ${lab.test} normal, but the document marks it ${lab.flag}.`);
        break;
      }
    }
  }
  return warnings;
}

const CATEGORY_FOR_TYPE: Record<(typeof DOCUMENT_TYPES)[number], RecordCategory> = {
  lab_result: 'lab_result',
  prescription: 'prescription',
  vaccination_record: 'vaccination',
  imaging_report: 'imaging',
  consultation_note: 'visit',
  discharge_summary: 'visit',
  medical_certificate: 'note',
  other: 'other',
};

/**
 * Builds the medical-record proposal shown on the review screen. Ungrounded or invalid values are
 * kept visible but listed in `unverified_fields`; an invalid or future date is cleared.
 */
export function extractionToProposal(
  extraction: Extraction,
  grounding: GroundingReport,
  fallbackTitle: string,
  today: string = todayLocal(),
): RecordProposalPayload {
  const unverified = new Set(grounding.ungrounded);
  let eventDate: string | null = extraction.document_date || null;
  if (eventDate && (!isValidIsoDate(eventDate) || eventDate > today)) {
    unverified.add('document_date');
    eventDate = null;
  }
  const keepLab = extraction.lab_results.filter((l) => l.test && l.value);
  const summaryWarnings = checkSummaryConsistency(extraction.summary, keepLab);
  if (summaryWarnings.length) unverified.add('summary');
  return {
    kind: 'medical_record',
    record: {
      category: CATEGORY_FOR_TYPE[extraction.document_type],
      title: (extraction.title || fallbackTitle).slice(0, 160),
      event_date: eventDate,
      summary: extraction.summary || null,
      facility: extraction.facility || null,
      structured_data: {
        document_type: extraction.document_type,
        clinician: extraction.clinician || null,
        lab_results: keepLab,
        medications: extraction.medications.filter((m) => m.name),
        vaccinations: extraction.vaccinations.filter((v) => v.vaccine),
        diagnoses: extraction.diagnoses.filter(Boolean),
      },
    },
    unverified_fields: [...unverified],
    warnings: summaryWarnings,
  };
}

/** Parses the model's JSON text. Returns null when it is not valid JSON. */
export function parseExtraction(jsonText: string): Extraction | null {
  const start = jsonText.indexOf('{');
  const end = jsonText.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return extractionSchema.parse(JSON.parse(jsonText.slice(start, end + 1)));
  } catch {
    return null;
  }
}
