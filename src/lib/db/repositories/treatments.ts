import { nowIso } from '../../dates';
import { newId } from '../../ids';
import type { TreatmentEventInput, TreatmentInput } from '../../validation/schemas';
import type { SourceType, TreatmentEventRow, TreatmentKind, TreatmentRow, TreatmentStatus } from '../models';
import type { DbExecutor } from '../types';

export interface TreatmentWithEvents extends TreatmentRow {
  events: TreatmentEventRow[];
}

export interface TreatmentFilter {
  kind?: TreatmentKind | null;
  excludeKind?: TreatmentKind | null;
  statuses?: TreatmentStatus[];
}

export async function listTreatments(db: DbExecutor, profileId: string, filter: TreatmentFilter = {}) {
  const where = ['profile_id = ?'];
  const params: string[] = [profileId];
  if (filter.kind) {
    where.push('kind = ?');
    params.push(filter.kind);
  }
  if (filter.excludeKind) {
    where.push('kind != ?');
    params.push(filter.excludeKind);
  }
  if (filter.statuses?.length) {
    where.push(`status IN (${filter.statuses.map(() => '?').join(', ')})`);
    params.push(...filter.statuses);
  }
  return db.all<TreatmentRow>(
    `SELECT * FROM treatments WHERE ${where.join(' AND ')}
     ORDER BY CASE status WHEN 'ongoing' THEN 0 WHEN 'planned' THEN 1 ELSE 2 END,
       COALESCE(start_date, created_at) DESC`,
    params,
  );
}

/** Orders events chronologically by their effective date (completed, else scheduled). */
const EVENT_ORDER = `ORDER BY (COALESCE(completed_date, scheduled_date) IS NULL),
  COALESCE(completed_date, scheduled_date) ASC, created_at ASC`;

export async function listTreatmentsWithEvents(
  db: DbExecutor,
  profileId: string,
  filter: TreatmentFilter = {},
): Promise<TreatmentWithEvents[]> {
  const treatments = await listTreatments(db, profileId, filter);
  if (!treatments.length) return [];
  const events = await db.all<TreatmentEventRow>(
    `SELECT * FROM treatment_events WHERE treatment_id IN (${treatments.map(() => '?').join(', ')}) ${EVENT_ORDER}`,
    treatments.map((t) => t.id),
  );
  return treatments.map((t) => ({ ...t, events: events.filter((e) => e.treatment_id === t.id) }));
}

export async function getTreatment(db: DbExecutor, treatmentId: string) {
  return db.get<TreatmentRow>('SELECT * FROM treatments WHERE id = ?', [treatmentId]);
}

export async function getTreatmentWithEvents(db: DbExecutor, treatmentId: string) {
  const treatment = await getTreatment(db, treatmentId);
  if (!treatment) return null;
  const events = await listEvents(db, treatmentId);
  return { ...treatment, events } satisfies TreatmentWithEvents;
}

export async function insertTreatment(
  db: DbExecutor,
  args: { profileId: string; input: TreatmentInput; sourceType: SourceType },
) {
  const now = nowIso();
  const t = args.input;
  const row: TreatmentRow = {
    id: newId(),
    profile_id: args.profileId,
    title: t.title,
    kind: t.kind,
    status: t.status,
    start_date: t.start_date,
    end_date: t.end_date,
    facility: t.facility,
    doctor_id: t.doctor_id,
    notes: t.notes,
    source_type: args.sourceType,
    created_at: now,
    updated_at: now,
  };
  await db.run(
    `INSERT INTO treatments (id, profile_id, title, kind, status, start_date, end_date, facility, doctor_id,
       notes, source_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.profile_id,
      row.title,
      row.kind,
      row.status,
      row.start_date,
      row.end_date,
      row.facility,
      row.doctor_id,
      row.notes,
      row.source_type,
      row.created_at,
      row.updated_at,
    ],
  );
  return row;
}

export async function updateTreatment(db: DbExecutor, treatmentId: string, t: TreatmentInput) {
  await db.run(
    `UPDATE treatments SET title = ?, kind = ?, status = ?, start_date = ?, end_date = ?, facility = ?,
       doctor_id = ?, notes = ?, updated_at = ? WHERE id = ?`,
    [t.title, t.kind, t.status, t.start_date, t.end_date, t.facility, t.doctor_id, t.notes, nowIso(), treatmentId],
  );
}

/** Deletes a treatment and (by cascade) its events. Linked medical records are kept. */
export async function deleteTreatment(db: DbExecutor, treatmentId: string) {
  await db.run('DELETE FROM treatments WHERE id = ?', [treatmentId]);
}

export async function listEvents(db: DbExecutor, treatmentId: string) {
  return db.all<TreatmentEventRow>(
    `SELECT * FROM treatment_events WHERE treatment_id = ? ${EVENT_ORDER}`,
    [treatmentId],
  );
}

export async function getEvent(db: DbExecutor, eventId: string) {
  return db.get<TreatmentEventRow>('SELECT * FROM treatment_events WHERE id = ?', [eventId]);
}

export async function insertEvent(
  db: DbExecutor,
  args: { profileId: string; input: TreatmentEventInput; sourceType: SourceType; medicalRecordId?: string | null },
) {
  const now = nowIso();
  const e = args.input;
  const row: TreatmentEventRow = {
    id: newId(),
    treatment_id: e.treatment_id,
    profile_id: args.profileId,
    title: e.title,
    event_type: e.event_type,
    status: e.status,
    scheduled_date: e.scheduled_date,
    completed_date: e.completed_date,
    facility: e.facility,
    notes: e.notes,
    medical_record_id: args.medicalRecordId ?? null,
    source_type: args.sourceType,
    created_at: now,
    updated_at: now,
  };
  await db.run(
    `INSERT INTO treatment_events (id, treatment_id, profile_id, title, event_type, status, scheduled_date,
       completed_date, facility, notes, medical_record_id, source_type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.treatment_id,
      row.profile_id,
      row.title,
      row.event_type,
      row.status,
      row.scheduled_date,
      row.completed_date,
      row.facility,
      row.notes,
      row.medical_record_id,
      row.source_type,
      row.created_at,
      row.updated_at,
    ],
  );
  await db.run('UPDATE treatments SET updated_at = ? WHERE id = ?', [now, e.treatment_id]);
  return row;
}

export async function updateEvent(db: DbExecutor, eventId: string, e: TreatmentEventInput) {
  await db.run(
    `UPDATE treatment_events SET treatment_id = ?, title = ?, event_type = ?, status = ?, scheduled_date = ?,
       completed_date = ?, facility = ?, notes = ?, updated_at = ? WHERE id = ?`,
    [
      e.treatment_id,
      e.title,
      e.event_type,
      e.status,
      e.scheduled_date,
      e.completed_date,
      e.facility,
      e.notes,
      nowIso(),
      eventId,
    ],
  );
}

export async function deleteEvent(db: DbExecutor, eventId: string) {
  await db.run('DELETE FROM treatment_events WHERE id = ?', [eventId]);
}

export interface UpcomingEvent extends TreatmentEventRow {
  treatment_title: string;
  treatment_kind: TreatmentKind;
}

export async function listUpcomingEvents(db: DbExecutor, profileId: string, fromDate: string, limit = 10) {
  return db.all<UpcomingEvent>(
    `SELECT e.*, t.title AS treatment_title, t.kind AS treatment_kind
     FROM treatment_events e JOIN treatments t ON t.id = e.treatment_id
     WHERE e.profile_id = ? AND e.status = 'scheduled' AND e.scheduled_date >= ?
     ORDER BY e.scheduled_date ASC LIMIT ?`,
    [profileId, fromDate, limit],
  );
}

/** Scheduled events whose date has passed without being marked completed. */
export async function listOverdueEvents(db: DbExecutor, profileId: string, today: string) {
  return db.all<UpcomingEvent>(
    `SELECT e.*, t.title AS treatment_title, t.kind AS treatment_kind
     FROM treatment_events e JOIN treatments t ON t.id = e.treatment_id
     WHERE e.profile_id = ? AND e.status = 'scheduled' AND e.scheduled_date < ?
     ORDER BY e.scheduled_date ASC`,
    [profileId, today],
  );
}

/** Case-insensitive lookup used to attach an AI-proposed event to an existing treatment. */
export async function findTreatmentByTitle(db: DbExecutor, profileId: string, title: string) {
  return db.get<TreatmentRow>(
    'SELECT * FROM treatments WHERE profile_id = ? AND lower(trim(title)) = lower(trim(?)) LIMIT 1',
    [profileId, title],
  );
}
