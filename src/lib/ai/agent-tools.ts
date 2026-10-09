import { z } from 'zod';

import { isValidIsoDate, todayLocal } from '../dates';
import { isGrounded, normalizeForMatch } from './extraction';
import type { ProposalPayload } from '../services/proposal-service';

/**
 * Bounded local agent — tool registry.
 *
 * The model may call only the two *proposal* tools below. They never write to the database:
 * validated arguments become a pending proposal that the user must confirm (see
 * proposal-service.ts). Read-only lookups are performed by the deterministic retrieval router
 * (retrieval.ts) before inference. The model has no access to SQL, files, code execution, or
 * the network.
 */

const RECORD_TOOL_CATEGORIES = [
  'visit',
  'diagnosis',
  'lab_result',
  'procedure',
  'allergy',
  'imaging',
  'note',
] as const;
const TREATMENT_TOOL_KINDS = ['vaccination', 'medication_course', 'therapy', 'procedure', 'other'] as const;

// Kept short on purpose: these definitions are part of every chat prompt, and on a phone CPU each
// prompt token costs time. Confirmation and "only what the user said" rules live in the system prompt.
export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'propose_medical_record',
      description:
        'Suggest saving a doctor visit, diagnosis, lab or test result, procedure, allergy, imaging, or note the user reported about themselves. Not for vaccines or treatment sessions.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: [...RECORD_TOOL_CATEGORIES] },
          title: { type: 'string', description: 'e.g. "Dental check-up"' },
          event_date: { type: 'string', description: 'YYYY-MM-DD' },
          facility: { type: 'string' },
          summary: { type: 'string' },
        },
        required: ['category', 'title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_treatment_event',
      description: 'Suggest saving a vaccine dose or treatment session the user reported as done or scheduled.',
      parameters: {
        type: 'object',
        properties: {
          treatment_name: { type: 'string', description: 'e.g. "Hepatitis B vaccine series"' },
          treatment_type: { type: 'string', enum: [...TREATMENT_TOOL_KINDS] },
          event_title: { type: 'string', description: 'e.g. "Hepatitis B vaccine – dose 2"' },
          status: { type: 'string', enum: ['completed', 'scheduled'] },
          date: { type: 'string', description: 'YYYY-MM-DD' },
          facility: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['treatment_name', 'treatment_type', 'event_title', 'status'],
      },
    },
  },
] as const;

export type ToolName = (typeof TOOL_DEFINITIONS)[number]['function']['name'];

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const optionalDate = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isValidIsoDate(v), 'date must be YYYY-MM-DD');

export const proposeRecordArgs = z
  .object({
    category: z.enum(RECORD_TOOL_CATEGORIES),
    title: text(160),
    event_date: optionalDate,
    facility: optionalText(160),
    summary: optionalText(1000),
  })
  .strip();

export const proposeEventArgs = z
  .object({
    treatment_name: text(160),
    treatment_type: z.enum(TREATMENT_TOOL_KINDS),
    event_title: text(160),
    status: z.enum(['completed', 'scheduled']),
    date: optionalDate,
    facility: optionalText(160),
    notes: optionalText(1000),
  })
  .strip();

export interface RawToolCall {
  name: string;
  arguments: unknown;
}

export type ToolCallOutcome =
  | { ok: true; name: ToolName; payload: ProposalPayload; warnings: string[] }
  | { ok: false; name: string; error: string };

function parseArguments(args: unknown): unknown {
  if (typeof args !== 'string') return args;
  try {
    return JSON.parse(args);
  } catch {
    return Symbol.for('invalid-json');
  }
}

/**
 * True when the model filled in a facility the user did not mention, e.g. copying "Quezon City
 * Health Center" from the records when the user only said "the city health center".
 */
function facilityNotInMessage(facility: string | null, userMessage: string | undefined) {
  if (!facility || userMessage === undefined) return false;
  return !isGrounded(facility, normalizeForMatch(userMessage));
}

/**
 * Validates one model-generated tool call and converts it to a proposal payload.
 * Dates the model produced are checked against today; impossible values become warnings and the
 * field is cleared so the user must supply it. With `userMessage`, a facility that does not appear
 * in the user's own words is listed as unverified so the card asks the user to check it.
 */
export function validateToolCall(call: RawToolCall, today: string = todayLocal(), userMessage?: string): ToolCallOutcome {
  const args = parseArguments(call.arguments);
  if (typeof args === 'symbol') return { ok: false, name: call.name, error: 'Arguments were not valid JSON.' };

  if (call.name === 'propose_medical_record') {
    const parsed = proposeRecordArgs.safeParse(args);
    if (!parsed.success) return { ok: false, name: call.name, error: parsed.error.issues[0]?.message ?? 'Invalid arguments' };
    const a = parsed.data;
    const warnings: string[] = [];
    let eventDate = a.event_date;
    if (eventDate && eventDate > today) {
      warnings.push(`The suggested date ${eventDate} is in the future and was removed.`);
      eventDate = null;
    }
    return {
      ok: true,
      name: 'propose_medical_record',
      warnings,
      payload: {
        kind: 'medical_record',
        record: {
          category: a.category,
          title: a.title,
          event_date: eventDate,
          summary: a.summary,
          facility: a.facility,
          structured_data: {},
        },
        unverified_fields: [
          ...(eventDate ? [] : ['event_date']),
          ...(facilityNotInMessage(a.facility, userMessage) ? ['facility'] : []),
        ],
        warnings,
      },
    };
  }

  if (call.name === 'propose_treatment_event') {
    const parsed = proposeEventArgs.safeParse(args);
    if (!parsed.success) return { ok: false, name: call.name, error: parsed.error.issues[0]?.message ?? 'Invalid arguments' };
    const a = parsed.data;
    const warnings: string[] = [];
    let date = a.date;
    if (date && a.status === 'completed' && date > today) {
      warnings.push(`A completed event cannot be dated in the future (${date}); please check the date.`);
      date = null;
    }
    if (date && a.status === 'scheduled' && date < today) {
      warnings.push(`A scheduled event cannot be in the past (${date}); please check the date.`);
      date = null;
    }
    return {
      ok: true,
      name: 'propose_treatment_event',
      warnings,
      payload: {
        kind: 'treatment_event',
        treatment: { title: a.treatment_name, kind: a.treatment_type, existing_treatment_id: null },
        event: {
          title: a.event_title,
          event_type: a.treatment_type === 'vaccination' ? 'dose' : a.treatment_type === 'therapy' ? 'session' : 'other',
          status: a.status,
          scheduled_date: a.status === 'scheduled' ? date : null,
          completed_date: a.status === 'completed' ? date : null,
          facility: a.facility,
          notes: a.notes,
        },
        unverified_fields: [...(date ? [] : ['date']), ...(facilityNotInMessage(a.facility, userMessage) ? ['facility'] : [])],
        warnings,
      },
    };
  }

  return { ok: false, name: call.name, error: `Unknown tool "${call.name}" was ignored.` };
}

/** Upper bound on proposals accepted from a single model response. */
export const MAX_TOOL_CALLS_PER_RESPONSE = 2;
