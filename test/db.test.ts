import { LATEST_SCHEMA_VERSION, migrate } from '@/lib/db/migrations';
import { createConversation, deleteConversation, insertMessage, listMessages } from '@/lib/db/repositories/conversations';
import { createDoctor, deleteDoctor, getDoctor } from '@/lib/db/repositories/doctors';
import { getHmo, insertHmo } from '@/lib/db/repositories/hmos';
import {
  archiveMedication,
  createMedication,
  deleteDoseEvent,
  deleteMedication,
  getDoseSlotsForDate,
  getMedication,
  listDoseHistory,
  recordDose,
  updateMedication,
} from '@/lib/db/repositories/medications';
import { getProfile } from '@/lib/db/repositories/profiles';
import { deleteRecord, getRecord, insertRecord, listRecords, updateRecord } from '@/lib/db/repositories/records';
import { getSettings, setSetting } from '@/lib/db/repositories/settings';
import { insertEvent, insertTreatment, listUpcomingEvents } from '@/lib/db/repositories/treatments';
import {
  doctorInputSchema,
  hmoInputSchema,
  medicationInputSchema,
  recordInputSchema,
  treatmentEventInputSchema,
  treatmentInputSchema,
} from '@/lib/validation/schemas';

import { openTestDb, openTestDbWithProfile, PROFILE_ID } from './helpers/node-db';

describe('migrations', () => {
  it('creates the schema and records the version', async () => {
    const db = await openTestDb();
    const row = await db.get<{ v: number }>('SELECT MAX(version) AS v FROM schema_migrations');
    expect(row?.v).toBe(LATEST_SCHEMA_VERSION);
    const tables = await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
    expect(tables.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        'profiles',
        'conversations',
        'messages',
        'medical_documents',
        'medical_records',
        'treatments',
        'treatment_events',
        'medications',
        'medication_schedules',
        'dose_events',
        'doctors',
        'hmos',
        'facilities',
        'hmo_facilities',
        'doctor_hmos',
        'record_proposals',
        'app_settings',
      ]),
    );
  });

  it('is idempotent', async () => {
    const db = await openTestDb();
    const result = await migrate(db);
    expect(result.applied).toEqual([]);
  });

  it('refuses a database from a newer app version', async () => {
    const db = await openTestDb();
    await db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (999, ?, ?)', ['future', 'now']);
    await expect(migrate(db)).rejects.toThrow(/newer than this app supports/);
  });
});

describe('constraints', () => {
  it('rejects invalid enum values and dates at the database level', async () => {
    const db = await openTestDbWithProfile();
    await expect(
      db.run(
        `INSERT INTO medical_records (id, profile_id, category, title, source_type, created_at, updated_at)
         VALUES ('r1', ?, 'not-a-category', 'x', 'manual', 'n', 'n')`,
        [PROFILE_ID],
      ),
    ).rejects.toThrow();
    await expect(
      db.run(
        `INSERT INTO medical_records (id, profile_id, category, title, event_date, source_type, created_at, updated_at)
         VALUES ('r2', ?, 'visit', 'x', '15/09/2026', 'manual', 'n', 'n')`,
        [PROFILE_ID],
      ),
    ).rejects.toThrow();
  });

  it('enforces foreign keys', async () => {
    const db = await openTestDbWithProfile();
    await expect(
      db.run(
        `INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES ('m1', 'missing', 'user', 'hi', 'n')`,
      ),
    ).rejects.toThrow();
  });

  it('rolls back a failed transaction completely', async () => {
    const db = await openTestDbWithProfile();
    await expect(
      db.transaction(async (tx) => {
        await insertRecord(tx, { profileId: PROFILE_ID, sourceType: 'manual', input: recordInputSchema.parse({ category: 'note', title: 'kept?' }) });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await listRecords(db, PROFILE_ID)).toHaveLength(0);
  });
});

describe('profiles and settings', () => {
  it('stores the profile with units', async () => {
    const db = await openTestDbWithProfile();
    const p = await getProfile(db, PROFILE_ID);
    expect(p).toMatchObject({ display_name: 'Test User', height_value: 160, height_unit: 'cm', weight_unit: 'kg' });
  });

  it('merges stored settings with defaults', async () => {
    const db = await openTestDbWithProfile();
    expect((await getSettings(db)).showMedicationNamesInNotifications).toBe(false);
    await setSetting(db, 'idleLockMinutes', 10);
    expect((await getSettings(db)).idleLockMinutes).toBe(10);
  });
});

describe('records', () => {
  it('supports create, search, filter, update, and delete', async () => {
    const db = await openTestDbWithProfile();
    const a = await insertRecord(db, {
      profileId: PROFILE_ID,
      sourceType: 'manual',
      input: recordInputSchema.parse({ category: 'lab_result', title: 'Lipid profile', event_date: '2026-05-08', summary: 'Cholesterol 5.6' }),
    });
    await insertRecord(db, {
      profileId: PROFILE_ID,
      sourceType: 'manual',
      input: recordInputSchema.parse({ category: 'visit', title: 'Dental check-up', event_date: '2026-06-01' }),
    });
    expect(await listRecords(db, PROFILE_ID)).toHaveLength(2);
    expect((await listRecords(db, PROFILE_ID, { search: 'cholesterol' })).map((r) => r.title)).toEqual(['Lipid profile']);
    expect((await listRecords(db, PROFILE_ID, { category: 'visit' })).map((r) => r.title)).toEqual(['Dental check-up']);
    // LIKE wildcards in user input are escaped.
    expect(await listRecords(db, PROFILE_ID, { search: '%' })).toHaveLength(0);

    await updateRecord(db, a.id, recordInputSchema.parse({ category: 'lab_result', title: 'Lipid panel', event_date: '2026-05-08' }));
    const updated = await getRecord(db, a.id);
    expect(updated?.title).toBe('Lipid panel');
    expect(updated?.source_type).toBe('manual');

    await deleteRecord(db, a.id);
    expect(await getRecord(db, a.id)).toBeNull();
  });

  it('rejects future record dates in validation', () => {
    const result = recordInputSchema.safeParse({ category: 'visit', title: 'x', event_date: '2999-01-01' });
    expect(result.success).toBe(false);
  });
});

describe('conversations', () => {
  it('persists messages and cascades deletes', async () => {
    const db = await openTestDbWithProfile();
    const c = await createConversation(db, PROFILE_ID);
    await insertMessage(db, { conversationId: c.id, role: 'user', content: 'Hello' });
    await insertMessage(db, { conversationId: c.id, role: 'assistant', content: 'Hi', modelMetadata: { modelId: 'm' } });
    const messages = await listMessages(db, c.id);
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    await deleteConversation(db, c.id);
    expect(await listMessages(db, c.id)).toHaveLength(0);
  });
});

describe('treatments', () => {
  it('lists upcoming scheduled events in date order', async () => {
    const db = await openTestDbWithProfile();
    const t = await insertTreatment(db, {
      profileId: PROFILE_ID,
      sourceType: 'manual',
      input: treatmentInputSchema.parse({ title: 'Hep B', kind: 'vaccination', status: 'ongoing' }),
    });
    for (const [title, date] of [
      ['Dose 3', '2026-12-01'],
      ['Dose 2', '2026-11-01'],
    ]) {
      await insertEvent(db, {
        profileId: PROFILE_ID,
        sourceType: 'manual',
        input: treatmentEventInputSchema.parse({ treatment_id: t.id, title, event_type: 'dose', status: 'scheduled', scheduled_date: date }),
      });
    }
    const upcoming = await listUpcomingEvents(db, PROFILE_ID, '2026-10-09');
    expect(upcoming.map((e) => e.title)).toEqual(['Dose 2', 'Dose 3']);
  });

  it('requires a date for scheduled events', () => {
    expect(
      treatmentEventInputSchema.safeParse({ treatment_id: 't', title: 'x', event_type: 'dose', status: 'scheduled' }).success,
    ).toBe(false);
  });
});

describe('medications and dose history', () => {
  async function setup() {
    const db = await openTestDbWithProfile();
    const med = await createMedication(db, {
      profileId: PROFILE_ID,
      sourceType: 'manual',
      input: medicationInputSchema.parse({
        name: 'Metformin',
        strength: '500 mg',
        schedules: [
          { time_of_day: '08:00', dose_label: '1 tablet' },
          { time_of_day: '20:00', dose_label: '1 tablet' },
        ],
      }),
    });
    return { db, med };
  }

  it('builds today’s slots and keeps taken and skipped distinct', async () => {
    const { db, med } = await setup();
    let slots = await getDoseSlotsForDate(db, PROFILE_ID, '2026-10-09', '2026-10-09T12:00');
    expect(slots.map((s) => s.state)).toEqual(['due', 'upcoming']);

    await recordDose(db, { profileId: PROFILE_ID, medicationId: med.id, scheduleId: med.schedules[0].id, scheduledFor: '2026-10-09T08:00', status: 'taken' });
    await recordDose(db, { profileId: PROFILE_ID, medicationId: med.id, scheduleId: med.schedules[1].id, scheduledFor: '2026-10-09T20:00', status: 'skipped' });
    slots = await getDoseSlotsForDate(db, PROFILE_ID, '2026-10-09', '2026-10-09T12:00');
    expect(slots.map((s) => s.state)).toEqual(['taken', 'skipped']);
    const history = await listDoseHistory(db, PROFILE_ID);
    expect(history.map((h) => h.status).sort()).toEqual(['skipped', 'taken']);
  });

  it('records one event per slot and lets the user correct or undo it', async () => {
    const { db, med } = await setup();
    const args = { profileId: PROFILE_ID, medicationId: med.id, scheduleId: med.schedules[0].id, scheduledFor: '2026-10-09T08:00' };
    await recordDose(db, { ...args, status: 'skipped' });
    const corrected = await recordDose(db, { ...args, status: 'taken' });
    expect(await listDoseHistory(db, PROFILE_ID)).toHaveLength(1);
    expect(corrected?.status).toBe('taken');
    await deleteDoseEvent(db, corrected!.id);
    expect(await listDoseHistory(db, PROFILE_ID)).toHaveLength(0);
  });

  it('keeps history when archiving and when a dose time is kept on edit', async () => {
    const { db, med } = await setup();
    await recordDose(db, { profileId: PROFILE_ID, medicationId: med.id, scheduleId: med.schedules[0].id, scheduledFor: '2026-10-08T08:00', status: 'taken' });
    await updateMedication(
      db,
      med.id,
      medicationInputSchema.parse({ name: 'Metformin', strength: '500 mg', schedules: [{ time_of_day: '08:00' }, { time_of_day: '21:00' }] }),
    );
    const updated = await getMedication(db, med.id);
    expect(updated?.schedules.map((s) => s.time_of_day)).toEqual(['08:00', '21:00']);
    expect(updated?.schedules[0].id).toBe(med.schedules[0].id);
    await archiveMedication(db, med.id);
    expect((await getMedication(db, med.id))?.status).toBe('archived');
    expect(await listDoseHistory(db, PROFILE_ID)).toHaveLength(1);
    expect(await getDoseSlotsForDate(db, PROFILE_ID, '2026-10-09', '2026-10-09T12:00')).toHaveLength(0);
  });

  it('deletes dose history only on permanent delete', async () => {
    const { db, med } = await setup();
    await recordDose(db, { profileId: PROFILE_ID, medicationId: med.id, scheduleId: null, scheduledFor: '2026-10-08T08:00', status: 'taken' });
    await deleteMedication(db, med.id);
    expect(await listDoseHistory(db, PROFILE_ID)).toHaveLength(0);
  });

  it('rejects duplicate dose times', () => {
    expect(
      medicationInputSchema.safeParse({ name: 'X', schedules: [{ time_of_day: '08:00' }, { time_of_day: '08:00' }] }).success,
    ).toBe(false);
  });
});

describe('doctors and HMOs', () => {
  it('links doctors to HMOs and unlinks on delete', async () => {
    const db = await openTestDbWithProfile();
    const hmoId = await insertHmo(db, { profileId: PROFILE_ID, sourceType: 'manual', input: hmoInputSchema.parse({ provider_name: 'Sample HMO' }) });
    const doctor = await createDoctor(db, {
      profileId: PROFILE_ID,
      sourceType: 'manual',
      input: doctorInputSchema.parse({ name: 'Dr. Test', phones: ['(02) 8555 0101'], emails: ['dr@example.com'], hmo_ids: [hmoId] }),
    });
    expect(doctor.hmos.map((h) => h.provider_name)).toEqual(['Sample HMO']);
    expect((await getHmo(db, hmoId))?.doctors.map((d) => d.name)).toEqual(['Dr. Test']);
    await deleteDoctor(db, doctor.id);
    expect(await getDoctor(db, doctor.id)).toBeNull();
    expect((await getHmo(db, hmoId))?.doctors).toHaveLength(0);
  });

  it('validates phone numbers and emails', () => {
    expect(doctorInputSchema.safeParse({ name: 'X', phones: ['call me'], emails: [] }).success).toBe(false);
    expect(doctorInputSchema.safeParse({ name: 'X', phones: [], emails: ['not-an-email'] }).success).toBe(false);
  });
});
