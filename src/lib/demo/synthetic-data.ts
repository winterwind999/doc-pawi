import { addDays, currentTimeZone, nowIso, todayLocal } from '../dates';
import { insertDoctorTx } from '../db/repositories/doctors';
import { insertFacilityTx, insertHmo, linkFacility } from '../db/repositories/hmos';
import { insertMedicationTx } from '../db/repositories/medications';
import { insertRecord } from '../db/repositories/records';
import { getActivitySummary } from '../db/repositories/stats';
import { insertEvent, insertTreatment } from '../db/repositories/treatments';
import type { Db } from '../db/types';
import { newId } from '../ids';
import {
  doctorInputSchema,
  facilityInputSchema,
  hmoInputSchema,
  medicationInputSchema,
  recordInputSchema,
  treatmentEventInputSchema,
  treatmentInputSchema,
} from '../validation/schemas';

/**
 * Synthetic evaluation dataset. Every person, facility, plan, and value here is fictional and
 * labelled "(demo)" or "(fictional)". Historical dates are fixed so the Panelist Testing Guide can
 * state exact expected answers; scheduled events are relative to the load date so they are
 * always upcoming. Documented in docs/PANELIST_TESTING_GUIDE.md §4.
 */
export const DEMO_FACTS = {
  hepBDose1: '2026-03-02',
  hepBDose2: '2026-04-06',
  hepBDose3OffsetDays: 14,
  fluShot: '2026-05-15',
  lipidDate: '2026-05-08',
  physicalExam: '2026-01-20',
  diabetesDiagnosis: '2026-05-10',
  ptSessions: ['2026-09-03', '2026-09-10', '2026-09-17'],
  ptNextOffsets: [3, 10],
} as const;

export class DemoDataAlreadyLoadedError extends Error {
  constructor() {
    super('Synthetic demo data is already loaded for this profile.');
  }
}

export async function hasDemoData(db: Db, profileId: string) {
  const summary = await getActivitySummary(db, profileId, '0000-00-00T00:00');
  return summary.demoRows > 0;
}

export async function loadDemoData(db: Db, profileId: string, now: Date = new Date()) {
  if (await hasDemoData(db, profileId)) throw new DemoDataAlreadyLoadedError();
  const today = todayLocal(now);
  const yesterday = addDays(today, -1);
  const src = 'demo' as const;

  await db.transaction(async (tx) => {
    // HMO and facilities
    const hmoId = await insertHmo(tx, {
      profileId,
      sourceType: src,
      input: hmoInputSchema.parse({
        provider_name: 'Sample HMO Health Plan (demo)',
        plan_name: 'Gold 150 (fictional)',
        member_id: 'DEMO-0000-1234',
        valid_until: '2027-06-30',
        coverage_notes:
          'Sample text, not real policy terms: outpatient consultations and basic laboratory tests at listed facilities; annual limit PHP 150,000.',
        hotline: '(02) 8555 0199',
      }),
    });
    const labId = await insertFacilityTx(tx, {
      profileId,
      sourceType: src,
      input: facilityInputSchema.parse({
        name: 'Bayanihan Diagnostic Laboratory (fictional)',
        facility_type: 'laboratory',
        address: '45 Sampaguita Avenue, Quezon City (fictional address)',
        phone: '(02) 8555 0100',
      }),
    });
    const clinicId = await insertFacilityTx(tx, {
      profileId,
      sourceType: src,
      input: facilityInputSchema.parse({
        name: 'Quezon City Health Center (fictional)',
        facility_type: 'clinic',
        address: '12 Kalayaan Street, Quezon City (fictional address)',
      }),
    });
    await linkFacility(tx, hmoId, labId, 'User-reported, not verified');
    await linkFacility(tx, hmoId, clinicId, 'User-reported, not verified');

    // Doctors
    const drSantos = await insertDoctorTx(tx, {
      profileId,
      sourceType: src,
      input: doctorInputSchema.parse({
        name: 'Dr. Maria Santos (demo)',
        specialty: 'Internal Medicine',
        organization: 'Bayanihan Medical Clinic (fictional)',
        address: '45 Sampaguita Avenue, Quezon City (fictional address)',
        phones: ['(02) 8555 0101'],
        emails: ['maria.santos@example.com'],
        notes: 'Synthetic demo doctor.',
        hmo_ids: [hmoId],
      }),
    });
    const drReyes = await insertDoctorTx(tx, {
      profileId,
      sourceType: src,
      input: doctorInputSchema.parse({
        name: 'Dr. Jose Reyes (demo)',
        specialty: 'Physical Medicine and Rehabilitation',
        organization: 'Mabuhay Rehab Center (fictional)',
        address: '8 Mabini Street, Manila (fictional address)',
        phones: ['(02) 8555 0202'],
        emails: [],
        notes: 'Synthetic demo doctor.',
        hmo_ids: [],
      }),
    });

    // Vaccinations
    const hepB = await insertTreatment(tx, {
      profileId,
      sourceType: src,
      input: treatmentInputSchema.parse({
        title: 'Hepatitis B vaccine series',
        kind: 'vaccination',
        status: 'ongoing',
        start_date: DEMO_FACTS.hepBDose1,
        facility: 'Quezon City Health Center (fictional)',
        notes: 'Three-dose series (synthetic demo data).',
      }),
    });
    for (const [title, date] of [
      ['Hepatitis B vaccine – dose 1', DEMO_FACTS.hepBDose1],
      ['Hepatitis B vaccine – dose 2', DEMO_FACTS.hepBDose2],
    ] as const) {
      await insertEvent(tx, {
        profileId,
        sourceType: src,
        input: treatmentEventInputSchema.parse({
          treatment_id: hepB.id,
          title,
          event_type: 'dose',
          status: 'completed',
          completed_date: date,
          facility: 'Quezon City Health Center (fictional)',
        }),
      });
    }
    await insertEvent(tx, {
      profileId,
      sourceType: src,
      input: treatmentEventInputSchema.parse({
        treatment_id: hepB.id,
        title: 'Hepatitis B vaccine – dose 3',
        event_type: 'dose',
        status: 'scheduled',
        scheduled_date: addDays(today, DEMO_FACTS.hepBDose3OffsetDays),
        facility: 'Quezon City Health Center (fictional)',
      }),
    });

    const flu = await insertTreatment(tx, {
      profileId,
      sourceType: src,
      input: treatmentInputSchema.parse({
        title: 'Influenza vaccine 2026',
        kind: 'vaccination',
        status: 'completed',
        start_date: DEMO_FACTS.fluShot,
        end_date: DEMO_FACTS.fluShot,
      }),
    });
    await insertEvent(tx, {
      profileId,
      sourceType: src,
      input: treatmentEventInputSchema.parse({
        treatment_id: flu.id,
        title: 'Annual flu shot',
        event_type: 'dose',
        status: 'completed',
        completed_date: DEMO_FACTS.fluShot,
        facility: 'Quezon City Health Center (fictional)',
      }),
    });

    // Ongoing treatment
    const pt = await insertTreatment(tx, {
      profileId,
      sourceType: src,
      input: treatmentInputSchema.parse({
        title: 'Physical therapy – left knee',
        kind: 'therapy',
        status: 'ongoing',
        start_date: '2026-09-01',
        facility: 'Mabuhay Rehab Center (fictional)',
        doctor_id: drReyes,
        notes: 'Twice-weekly knee strengthening plan (synthetic demo data).',
      }),
    });
    for (const [i, date] of DEMO_FACTS.ptSessions.entries()) {
      await insertEvent(tx, {
        profileId,
        sourceType: src,
        input: treatmentEventInputSchema.parse({
          treatment_id: pt.id,
          title: `Therapy session ${i + 1}`,
          event_type: 'session',
          status: 'completed',
          completed_date: date,
          facility: 'Mabuhay Rehab Center (fictional)',
        }),
      });
    }
    for (const [i, offset] of DEMO_FACTS.ptNextOffsets.entries()) {
      await insertEvent(tx, {
        profileId,
        sourceType: src,
        input: treatmentEventInputSchema.parse({
          treatment_id: pt.id,
          title: `Therapy session ${DEMO_FACTS.ptSessions.length + i + 1}`,
          event_type: 'session',
          status: 'scheduled',
          scheduled_date: addDays(today, offset),
          facility: 'Mabuhay Rehab Center (fictional)',
        }),
      });
    }

    // Medical records
    const records = [
      {
        category: 'visit',
        title: 'Annual physical examination',
        event_date: DEMO_FACTS.physicalExam,
        facility: 'Bayanihan Medical Clinic (fictional)',
        doctor_id: drSantos,
        summary: 'Routine check-up. Blood pressure 118/76 mmHg. Advised regular exercise. (Synthetic demo record.)',
      },
      {
        category: 'lab_result',
        title: 'Lipid profile',
        event_date: DEMO_FACTS.lipidDate,
        facility: 'Bayanihan Diagnostic Laboratory (fictional)',
        doctor_id: drSantos,
        summary: 'Total cholesterol, LDL, and triglycerides above the reference range. (Synthetic demo record.)',
        structured_data: {
          lab_results: [
            { test: 'Total cholesterol', value: '5.6', unit: 'mmol/L', reference_range: 'below 5.2', flag: 'high' },
            { test: 'LDL cholesterol', value: '3.6', unit: 'mmol/L', reference_range: 'below 3.4', flag: 'high' },
            { test: 'HDL cholesterol', value: '1.1', unit: 'mmol/L', reference_range: 'above 1.0', flag: 'normal' },
            { test: 'Triglycerides', value: '1.9', unit: 'mmol/L', reference_range: 'below 1.7', flag: 'high' },
          ],
        },
      },
      {
        category: 'diagnosis',
        title: 'Type 2 diabetes mellitus',
        event_date: DEMO_FACTS.diabetesDiagnosis,
        doctor_id: drSantos,
        summary: 'Diagnosed during follow-up; metformin started. (Synthetic demo record.)',
      },
      {
        category: 'allergy',
        title: 'Shellfish allergy (shrimp)',
        event_date: '2019-08-12',
        summary: 'Hives after eating shrimp. (Synthetic demo record.)',
      },
    ] as const;
    for (const r of records) {
      await insertRecord(tx, { profileId, sourceType: src, input: recordInputSchema.parse(r) });
    }

    // Medications and dose history
    const metformin = await insertMedicationTx(tx, {
      profileId,
      sourceType: src,
      input: medicationInputSchema.parse({
        name: 'Metformin (demo)',
        strength: '500 mg',
        form: 'tablet',
        instructions: 'Take with breakfast and dinner, as prescribed (synthetic demo).',
        prescriber_doctor_id: drSantos,
        start_date: DEMO_FACTS.diabetesDiagnosis,
        schedules: [
          { time_of_day: '08:00', dose_label: '1 tablet' },
          { time_of_day: '20:00', dose_label: '1 tablet' },
        ],
      }),
    });
    await insertMedicationTx(tx, {
      profileId,
      sourceType: src,
      input: medicationInputSchema.parse({
        name: 'Vitamin D3 (demo)',
        strength: '1000 IU',
        form: 'capsule',
        instructions: 'Once daily after breakfast (synthetic demo).',
        start_date: '2026-06-01',
        schedules: [{ time_of_day: '09:00', dose_label: '1 capsule' }],
      }),
    });
    const amoxicillin = await insertMedicationTx(tx, {
      profileId,
      sourceType: src,
      input: medicationInputSchema.parse({
        name: 'Amoxicillin (demo)',
        strength: '500 mg',
        form: 'capsule',
        instructions: 'Completed 7-day course (synthetic demo).',
        start_date: '2026-02-10',
        end_date: '2026-02-17',
        schedules: [],
      }),
    });
    const archivedAt = nowIso();
    await tx.run(
      "UPDATE medications SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ?",
      [archivedAt, archivedAt, amoxicillin],
    );
    const schedules = await tx.all<{ id: string; time_of_day: string }>(
      'SELECT id, time_of_day FROM medication_schedules WHERE medication_id = ?',
      [metformin],
    );
    for (const s of schedules) {
      await tx.run(
        `INSERT INTO dose_events (id, medication_id, schedule_id, profile_id, scheduled_for, event_at, timezone, status, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId(),
          metformin,
          s.id,
          profileId,
          `${yesterday}T${s.time_of_day}`,
          nowIso(),
          currentTimeZone(),
          s.time_of_day === '08:00' ? 'taken' : 'skipped',
          'Synthetic demo dose event',
          nowIso(),
        ],
      );
    }
  });
}

/**
 * Removes every row created by `loadDemoData`. User-entered data is untouched: events the user
 * added to a demo treatment series (which would otherwise cascade-delete with it) are first moved
 * to a new series of their own with the same title and kind.
 */
export async function removeDemoData(db: Db, profileId: string) {
  await db.transaction(async (tx) => {
    await tx.run("DELETE FROM treatment_events WHERE profile_id = ? AND source_type = 'demo'", [profileId]);
    const keep = await tx.all<{ id: string; title: string; kind: string; status: string }>(
      `SELECT id, title, kind, status FROM treatments t
       WHERE profile_id = ? AND source_type = 'demo'
         AND EXISTS (SELECT 1 FROM treatment_events e WHERE e.treatment_id = t.id)`,
      [profileId],
    );
    for (const t of keep) {
      const id = newId();
      const now = nowIso();
      await tx.run(
        `INSERT INTO treatments (id, profile_id, title, kind, status, start_date, source_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, (SELECT MIN(COALESCE(completed_date, scheduled_date)) FROM treatment_events WHERE treatment_id = ?), 'manual', ?, ?)`,
        [id, profileId, t.title, t.kind, t.status, t.id, now, now],
      );
      await tx.run('UPDATE treatment_events SET treatment_id = ?, updated_at = ? WHERE treatment_id = ?', [id, now, t.id]);
    }
    for (const table of ['medical_records', 'treatments', 'medications', 'doctors', 'hmos', 'facilities']) {
      await tx.run(`DELETE FROM ${table} WHERE profile_id = ? AND source_type = 'demo'`, [profileId]);
    }
  });
}
