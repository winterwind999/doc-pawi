import { nowIso } from '../../dates';
import { newId } from '../../ids';
import type { RecordInput } from '../../validation/schemas';
import type { MedicalRecordRow, RecordCategory, SourceType } from '../models';
import type { DbExecutor } from '../types';

export interface RecordFilter {
  search?: string;
  category?: RecordCategory | null;
  limit?: number;
}

/** Escapes `%`, `_` and `\` for use in a LIKE pattern with `ESCAPE '\'`. */
export function likePattern(term: string) {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export async function listRecords(db: DbExecutor, profileId: string, filter: RecordFilter = {}) {
  const where = ['profile_id = ?'];
  const params: (string | number)[] = [profileId];
  if (filter.category) {
    where.push('category = ?');
    params.push(filter.category);
  }
  const search = filter.search?.trim();
  if (search) {
    where.push(
      "(title LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\' OR facility LIKE ? ESCAPE '\\' OR structured_data LIKE ? ESCAPE '\\')",
    );
    const p = likePattern(search);
    params.push(p, p, p, p);
  }
  params.push(filter.limit ?? 500);
  return db.all<MedicalRecordRow>(
    `SELECT * FROM medical_records WHERE ${where.join(' AND ')}
     ORDER BY (event_date IS NULL), event_date DESC, created_at DESC LIMIT ?`,
    params,
  );
}

export async function getRecord(db: DbExecutor, recordId: string) {
  return db.get<MedicalRecordRow>('SELECT * FROM medical_records WHERE id = ?', [recordId]);
}

export async function insertRecord(
  db: DbExecutor,
  args: { profileId: string; input: RecordInput; sourceType: SourceType; documentId?: string | null },
) {
  const now = nowIso();
  const r = args.input;
  const row: MedicalRecordRow = {
    id: newId(),
    profile_id: args.profileId,
    category: r.category,
    title: r.title,
    event_date: r.event_date,
    source_type: args.sourceType,
    summary: r.summary,
    structured_data: JSON.stringify(r.structured_data ?? {}),
    document_id: args.documentId ?? null,
    doctor_id: r.doctor_id,
    facility: r.facility,
    created_at: now,
    updated_at: now,
  };
  await db.run(
    `INSERT INTO medical_records (id, profile_id, category, title, event_date, source_type, summary,
       structured_data, document_id, doctor_id, facility, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.profile_id,
      row.category,
      row.title,
      row.event_date,
      row.source_type,
      row.summary,
      row.structured_data,
      row.document_id,
      row.doctor_id,
      row.facility,
      row.created_at,
      row.updated_at,
    ],
  );
  return row;
}

/** Updates user-editable fields. Provenance (`source_type`, `document_id`) is never changed. */
export async function updateRecord(db: DbExecutor, recordId: string, r: RecordInput) {
  await db.run(
    `UPDATE medical_records SET category = ?, title = ?, event_date = ?, summary = ?, structured_data = ?,
       doctor_id = ?, facility = ?, updated_at = ? WHERE id = ?`,
    [
      r.category,
      r.title,
      r.event_date,
      r.summary,
      JSON.stringify(r.structured_data ?? {}),
      r.doctor_id,
      r.facility,
      nowIso(),
      recordId,
    ],
  );
}

/** Deletes a record. Linked documents are kept; treatment events referencing it are unlinked. */
export async function deleteRecord(db: DbExecutor, recordId: string) {
  await db.run('DELETE FROM medical_records WHERE id = ?', [recordId]);
}

export async function listRecordsForDocument(db: DbExecutor, documentId: string) {
  return db.all<MedicalRecordRow>(
    'SELECT * FROM medical_records WHERE document_id = ? ORDER BY created_at',
    [documentId],
  );
}
