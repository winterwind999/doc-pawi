import { z } from 'zod';

import { isValidIsoDate, isValidTimeOfDay, todayLocal } from '../dates';
import {
  EVENT_STATUSES,
  EVENT_TYPES,
  FACILITY_TYPES,
  HEIGHT_UNITS,
  MEDICATION_FORMS,
  RECORD_CATEGORIES,
  SEX_VALUES,
  TREATMENT_KINDS,
  TREATMENT_STATUSES,
  WEIGHT_UNITS,
} from '../db/models';

/**
 * Domain input schemas. The same schemas validate manual form input and AI-proposed
 * changes, so model output is held to exactly the same rules as user input.
 */

const requiredText = (label: string, max: number) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`);

const optionalText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer`)
    .nullish()
    .transform((v) => (v ? v : null));

const optionalDate = (label: string) =>
  z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || isValidIsoDate(v), `${label} must be a real date (YYYY-MM-DD)`);

const optionalId = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null));

const notInFuture = (v: string | null) => v === null || v <= todayLocal();

export const profileInputSchema = z
  .object({
    display_name: requiredText('Name', 80),
    email: optionalText('Email', 254),
    sex: z.enum(SEX_VALUES).nullish().transform((v) => v ?? null),
    birth_date: optionalDate('Date of birth').refine(notInFuture, 'Date of birth cannot be in the future'),
    height_value: z.number().positive('Height must be positive').nullish().transform((v) => v ?? null),
    height_unit: z.enum(HEIGHT_UNITS).nullish().transform((v) => v ?? null),
    weight_value: z.number().positive('Weight must be positive').nullish().transform((v) => v ?? null),
    weight_unit: z.enum(WEIGHT_UNITS).nullish().transform((v) => v ?? null),
  })
  .superRefine((p, ctx) => {
    if (p.birth_date && p.birth_date < '1900-01-01') {
      ctx.addIssue({ code: 'custom', path: ['birth_date'], message: 'Date of birth looks too early' });
    }
    if (p.height_value != null) {
      const [min, max] = p.height_unit === 'in' ? [12, 108] : [30, 275];
      if (!p.height_unit) {
        ctx.addIssue({ code: 'custom', path: ['height_unit'], message: 'Choose a height unit' });
      } else if (p.height_value < min || p.height_value > max) {
        ctx.addIssue({
          code: 'custom',
          path: ['height_value'],
          message: `Height should be between ${min} and ${max} ${p.height_unit}`,
        });
      }
    }
    if (p.weight_value != null) {
      const [min, max] = p.weight_unit === 'lb' ? [2, 1400] : [1, 635];
      if (!p.weight_unit) {
        ctx.addIssue({ code: 'custom', path: ['weight_unit'], message: 'Choose a weight unit' });
      } else if (p.weight_value < min || p.weight_value > max) {
        ctx.addIssue({
          code: 'custom',
          path: ['weight_value'],
          message: `Weight should be between ${min} and ${max} ${p.weight_unit}`,
        });
      }
    }
  });
export type ProfileInput = z.output<typeof profileInputSchema>;

export const recordInputSchema = z.object({
  category: z.enum(RECORD_CATEGORIES, { error: 'Choose a category' }),
  title: requiredText('Title', 160),
  event_date: optionalDate('Date').refine(notInFuture, 'A record date cannot be in the future'),
  summary: optionalText('Summary', 4000),
  facility: optionalText('Facility', 160),
  doctor_id: optionalId,
  structured_data: z.record(z.string(), z.unknown()).default({}),
});
export type RecordInput = z.output<typeof recordInputSchema>;

export const treatmentInputSchema = z
  .object({
    title: requiredText('Treatment name', 160),
    kind: z.enum(TREATMENT_KINDS, { error: 'Choose a treatment type' }),
    status: z.enum(TREATMENT_STATUSES, { error: 'Choose a status' }),
    start_date: optionalDate('Start date'),
    end_date: optionalDate('End date'),
    facility: optionalText('Facility', 160),
    doctor_id: optionalId,
    notes: optionalText('Notes', 2000),
  })
  .refine((t) => !t.start_date || !t.end_date || t.end_date >= t.start_date, {
    path: ['end_date'],
    message: 'End date must be on or after the start date',
  });
export type TreatmentInput = z.output<typeof treatmentInputSchema>;

export const treatmentEventInputSchema = z
  .object({
    treatment_id: requiredText('Treatment', 64),
    title: requiredText('Event name', 160),
    event_type: z.enum(EVENT_TYPES, { error: 'Choose an event type' }),
    status: z.enum(EVENT_STATUSES, { error: 'Choose a status' }),
    scheduled_date: optionalDate('Scheduled date'),
    completed_date: optionalDate('Completed date').refine(
      notInFuture,
      'A completed date cannot be in the future',
    ),
    facility: optionalText('Facility', 160),
    notes: optionalText('Notes', 2000),
  })
  .superRefine((e, ctx) => {
    if (e.status === 'scheduled' && !e.scheduled_date) {
      ctx.addIssue({
        code: 'custom',
        path: ['scheduled_date'],
        message: 'A scheduled event needs a date',
      });
    }
    if (e.status !== 'completed' && e.completed_date) {
      ctx.addIssue({
        code: 'custom',
        path: ['completed_date'],
        message: 'Only completed events have a completed date',
      });
    }
  });
export type TreatmentEventInput = z.output<typeof treatmentEventInputSchema>;

export const scheduleInputSchema = z.object({
  time_of_day: z.string().refine(isValidTimeOfDay, 'Use a 24-hour time such as 08:00'),
  dose_label: optionalText('Dose', 60),
});

export const medicationInputSchema = z
  .object({
    name: requiredText('Medication name', 120),
    strength: optionalText('Strength', 60),
    form: z.enum(MEDICATION_FORMS).nullish().transform((v) => v ?? null),
    instructions: optionalText('Instructions', 1000),
    prescriber_doctor_id: optionalId,
    start_date: optionalDate('Start date'),
    end_date: optionalDate('End date'),
    schedules: z.array(scheduleInputSchema).max(8, 'Up to 8 daily dose times are supported'),
  })
  .superRefine((m, ctx) => {
    const times = m.schedules.map((s) => s.time_of_day);
    if (new Set(times).size !== times.length) {
      ctx.addIssue({ code: 'custom', path: ['schedules'], message: 'Dose times must be different' });
    }
    if (m.start_date && m.end_date && m.end_date < m.start_date) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_date'],
        message: 'End date must be on or after the start date',
      });
    }
  });
export type MedicationInput = z.output<typeof medicationInputSchema>;

const phone = z
  .string()
  .trim()
  .min(3, 'Phone number is too short')
  .max(40, 'Phone number is too long')
  .regex(/^[0-9+()\-.\s/]+$/, 'Phone numbers may contain digits, spaces, and + ( ) - . /');
const email = z.string().trim().max(254).pipe(z.email('Enter a valid email address'));

export const doctorInputSchema = z.object({
  name: requiredText('Name', 120),
  specialty: optionalText('Specialty', 120),
  organization: optionalText('Clinic or hospital', 160),
  address: optionalText('Address', 300),
  phones: z.array(phone).max(5, 'Up to 5 phone numbers'),
  emails: z.array(email).max(5, 'Up to 5 email addresses'),
  photo_path: optionalText('Photo', 500),
  notes: optionalText('Notes', 2000),
  hmo_ids: z.array(z.string()).max(20).default([]),
});
export type DoctorInput = z.output<typeof doctorInputSchema>;

export const hmoInputSchema = z.object({
  provider_name: requiredText('HMO provider', 120),
  plan_name: optionalText('Plan', 120),
  member_id: optionalText('Member ID', 80),
  valid_until: optionalDate('Valid until'),
  coverage_notes: optionalText('Coverage notes', 4000),
  hotline: optionalText('Hotline', 60),
});
export type HmoInput = z.output<typeof hmoInputSchema>;

export const facilityInputSchema = z.object({
  name: requiredText('Facility name', 160),
  facility_type: z.enum(FACILITY_TYPES, { error: 'Choose a facility type' }),
  address: optionalText('Address', 300),
  phone: optionalText('Phone', 40),
  notes: optionalText('Notes', 2000),
});
export type FacilityInput = z.output<typeof facilityInputSchema>;

/** Flattens Zod issues to `{ fieldName: firstMessage }` for form display. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? String(issue.path[0]) : '_form';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Invalid input';
}
