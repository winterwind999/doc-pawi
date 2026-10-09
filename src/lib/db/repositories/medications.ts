import { currentTimeZone, localDateTime, nowIso } from '../../dates';
import { newId } from '../../ids';
import type { MedicationInput } from '../../validation/schemas';
import type {
  DoseEventRow,
  DoseStatus,
  MedicationRow,
  MedicationScheduleRow,
  MedicationStatus,
  SourceType,
} from '../models';
import type { Db, DbExecutor } from '../types';

export interface MedicationWithSchedules extends MedicationRow {
  schedules: MedicationScheduleRow[];
}

export async function listMedications(
  db: DbExecutor,
  profileId: string,
  status: MedicationStatus | null = null,
): Promise<MedicationWithSchedules[]> {
  const meds = await db.all<MedicationRow>(
    `SELECT * FROM medications WHERE profile_id = ? ${status ? 'AND status = ?' : ''}
     ORDER BY status ASC, name COLLATE NOCASE ASC`,
    status ? [profileId, status] : [profileId],
  );
  if (!meds.length) return [];
  const schedules = await db.all<MedicationScheduleRow>(
    `SELECT * FROM medication_schedules WHERE medication_id IN (${meds.map(() => '?').join(', ')})
     ORDER BY time_of_day ASC`,
    meds.map((m) => m.id),
  );
  return meds.map((m) => ({ ...m, schedules: schedules.filter((s) => s.medication_id === m.id) }));
}

export async function getMedication(db: DbExecutor, medicationId: string) {
  const med = await db.get<MedicationRow>('SELECT * FROM medications WHERE id = ?', [medicationId]);
  if (!med) return null;
  const schedules = await db.all<MedicationScheduleRow>(
    'SELECT * FROM medication_schedules WHERE medication_id = ? ORDER BY time_of_day',
    [medicationId],
  );
  return { ...med, schedules } satisfies MedicationWithSchedules;
}

async function insertSchedules(tx: DbExecutor, medicationId: string, input: MedicationInput) {
  const now = nowIso();
  for (const s of input.schedules) {
    await tx.run(
      `INSERT INTO medication_schedules (id, medication_id, time_of_day, dose_label, reminder_enabled,
         notification_id, created_at, updated_at) VALUES (?, ?, ?, ?, 1, NULL, ?, ?)`,
      [newId(), medicationId, s.time_of_day, s.dose_label, now, now],
    );
  }
}

/** Executor-level insert so callers can compose it into a larger transaction. */
export async function insertMedicationTx(
  tx: DbExecutor,
  args: { profileId: string; input: MedicationInput; sourceType: SourceType },
) {
  const now = nowIso();
  const m = args.input;
  const id = newId();
  await tx.run(
    `INSERT INTO medications (id, profile_id, name, strength, form, instructions, prescriber_doctor_id,
       start_date, end_date, status, archived_at, source_type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?, ?)`,
    [
      id,
      args.profileId,
      m.name,
      m.strength,
      m.form,
      m.instructions,
      m.prescriber_doctor_id,
      m.start_date,
      m.end_date,
      args.sourceType,
      now,
      now,
    ],
  );
  await insertSchedules(tx, id, m);
  return id;
}

export async function createMedication(
  db: Db,
  args: { profileId: string; input: MedicationInput; sourceType: SourceType },
) {
  const id = await db.transaction((tx) => insertMedicationTx(tx, args));
  return (await getMedication(db, id))!;
}

/**
 * Updates a medication and replaces its schedule times. Schedule rows that keep the same time
 * are preserved so their dose history keeps its `schedule_id`.
 */
export async function updateMedication(db: Db, medicationId: string, m: MedicationInput) {
  await db.transaction(async (tx) => {
    await tx.run(
      `UPDATE medications SET name = ?, strength = ?, form = ?, instructions = ?, prescriber_doctor_id = ?,
         start_date = ?, end_date = ?, updated_at = ? WHERE id = ?`,
      [
        m.name,
        m.strength,
        m.form,
        m.instructions,
        m.prescriber_doctor_id,
        m.start_date,
        m.end_date,
        nowIso(),
        medicationId,
      ],
    );
    const existing = await tx.all<MedicationScheduleRow>(
      'SELECT * FROM medication_schedules WHERE medication_id = ?',
      [medicationId],
    );
    const wanted = new Map(m.schedules.map((s) => [s.time_of_day, s]));
    for (const row of existing) {
      const keep = wanted.get(row.time_of_day);
      if (keep) {
        await tx.run('UPDATE medication_schedules SET dose_label = ?, updated_at = ? WHERE id = ?', [
          keep.dose_label,
          nowIso(),
          row.id,
        ]);
        wanted.delete(row.time_of_day);
      } else {
        await tx.run('DELETE FROM medication_schedules WHERE id = ?', [row.id]);
      }
    }
    await insertSchedules(tx, medicationId, { ...m, schedules: [...wanted.values()] });
  });
  return (await getMedication(db, medicationId))!;
}

/** Archives a medication. Dose history and schedules are preserved; reminders must be cancelled by the caller. */
export async function archiveMedication(db: Db, medicationId: string) {
  await db.transaction(async (tx) => {
    const now = nowIso();
    await tx.run(
      "UPDATE medications SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ?",
      [now, now, medicationId],
    );
    await tx.run('UPDATE medication_schedules SET notification_id = NULL WHERE medication_id = ?', [
      medicationId,
    ]);
  });
}

export async function restoreMedication(db: DbExecutor, medicationId: string) {
  await db.run(
    "UPDATE medications SET status = 'active', archived_at = NULL, updated_at = ? WHERE id = ?",
    [nowIso(), medicationId],
  );
}

/** Permanently deletes a medication, its schedules, and its dose history (cascade). */
export async function deleteMedication(db: DbExecutor, medicationId: string) {
  await db.run('DELETE FROM medications WHERE id = ?', [medicationId]);
}

export async function setScheduleNotificationId(
  db: DbExecutor,
  scheduleId: string,
  notificationId: string | null,
) {
  await db.run('UPDATE medication_schedules SET notification_id = ?, updated_at = ? WHERE id = ?', [
    notificationId,
    nowIso(),
    scheduleId,
  ]);
}

export async function listActiveSchedules(db: DbExecutor, profileId: string) {
  return db.all<MedicationScheduleRow & { medication_name: string; strength: string | null }>(
    `SELECT s.*, m.name AS medication_name, m.strength AS strength
     FROM medication_schedules s JOIN medications m ON m.id = s.medication_id
     WHERE m.profile_id = ? AND m.status = 'active'
     ORDER BY s.time_of_day`,
    [profileId],
  );
}

/**
 * Records a dose as taken or skipped. One event exists per (medication, scheduled slot);
 * recording again replaces the previous status (e.g. correcting Skipped → Taken).
 */
export async function recordDose(
  db: DbExecutor,
  args: {
    profileId: string;
    medicationId: string;
    scheduleId: string | null;
    scheduledFor: string;
    status: DoseStatus;
    eventAt?: string;
    note?: string | null;
  },
) {
  const now = nowIso();
  await db.run(
    `INSERT INTO dose_events (id, medication_id, schedule_id, profile_id, scheduled_for, event_at, timezone,
       status, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(medication_id, scheduled_for) DO UPDATE SET
       status = excluded.status, event_at = excluded.event_at, timezone = excluded.timezone, note = excluded.note`,
    [
      newId(),
      args.medicationId,
      args.scheduleId,
      args.profileId,
      args.scheduledFor,
      args.eventAt ?? now,
      currentTimeZone(),
      args.status,
      args.note ?? null,
      now,
    ],
  );
  return db.get<DoseEventRow>(
    'SELECT * FROM dose_events WHERE medication_id = ? AND scheduled_for = ?',
    [args.medicationId, args.scheduledFor],
  );
}

export async function deleteDoseEvent(db: DbExecutor, eventId: string) {
  await db.run('DELETE FROM dose_events WHERE id = ?', [eventId]);
}

export interface DoseHistoryItem extends DoseEventRow {
  medication_name: string;
  strength: string | null;
}

export async function listDoseHistory(
  db: DbExecutor,
  profileId: string,
  args: { medicationId?: string; limit?: number } = {},
) {
  return db.all<DoseHistoryItem>(
    `SELECT d.*, m.name AS medication_name, m.strength AS strength
     FROM dose_events d JOIN medications m ON m.id = d.medication_id
     WHERE d.profile_id = ? ${args.medicationId ? 'AND d.medication_id = ?' : ''}
     ORDER BY d.scheduled_for DESC LIMIT ?`,
    args.medicationId ? [profileId, args.medicationId, args.limit ?? 100] : [profileId, args.limit ?? 100],
  );
}

export type DoseSlotState = 'taken' | 'skipped' | 'due' | 'upcoming';

export interface DoseSlot {
  medication: MedicationRow;
  schedule: MedicationScheduleRow;
  scheduledFor: string;
  event: DoseEventRow | null;
  state: DoseSlotState;
}

/**
 * Builds the dose slots for a local calendar date from active schedules and recorded events.
 * Pure function so it can be unit-tested with fixed clocks and time zones.
 */
export function buildDoseSlots(
  meds: MedicationWithSchedules[],
  events: DoseEventRow[],
  date: string,
  nowLocal: string,
): DoseSlot[] {
  const byKey = new Map(events.map((e) => [`${e.medication_id}|${e.scheduled_for}`, e]));
  const slots: DoseSlot[] = [];
  for (const med of meds) {
    if (med.status !== 'active') continue;
    if (med.start_date && med.start_date > date) continue;
    if (med.end_date && med.end_date < date) continue;
    for (const schedule of med.schedules) {
      const scheduledFor = localDateTime(date, schedule.time_of_day);
      const event = byKey.get(`${med.id}|${scheduledFor}`) ?? null;
      const state: DoseSlotState = event ? event.status : scheduledFor <= nowLocal ? 'due' : 'upcoming';
      slots.push({ medication: med, schedule, scheduledFor, event, state });
    }
  }
  return slots.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor) || a.medication.name.localeCompare(b.medication.name));
}

export async function getDoseSlotsForDate(db: DbExecutor, profileId: string, date: string, nowLocal: string) {
  const meds = await listMedications(db, profileId, 'active');
  const events = await db.all<DoseEventRow>(
    'SELECT * FROM dose_events WHERE profile_id = ? AND scheduled_for LIKE ?',
    [profileId, `${date}T%`],
  );
  return buildDoseSlots(meds, events, date, nowLocal);
}
