import { nowIso } from '../../dates';
import { newId } from '../../ids';
import type { DoctorInput } from '../../validation/schemas';
import type { DoctorRow, HmoRow, SourceType } from '../models';
import type { Db, DbExecutor } from '../types';
import { likePattern } from './records';

export interface DoctorWithHmos extends DoctorRow {
  hmos: Pick<HmoRow, 'id' | 'provider_name' | 'plan_name'>[];
}

export async function listDoctors(db: DbExecutor, profileId: string, search = '') {
  const term = search.trim();
  if (!term) {
    return db.all<DoctorRow>('SELECT * FROM doctors WHERE profile_id = ? ORDER BY name COLLATE NOCASE', [
      profileId,
    ]);
  }
  const p = likePattern(term);
  return db.all<DoctorRow>(
    `SELECT * FROM doctors WHERE profile_id = ? AND (name LIKE ? ESCAPE '\\' OR specialty LIKE ? ESCAPE '\\'
       OR organization LIKE ? ESCAPE '\\' OR address LIKE ? ESCAPE '\\')
     ORDER BY name COLLATE NOCASE`,
    [profileId, p, p, p, p],
  );
}

export async function getDoctor(db: DbExecutor, doctorId: string): Promise<DoctorWithHmos | null> {
  const doctor = await db.get<DoctorRow>('SELECT * FROM doctors WHERE id = ?', [doctorId]);
  if (!doctor) return null;
  const hmos = await db.all<Pick<HmoRow, 'id' | 'provider_name' | 'plan_name'>>(
    `SELECT h.id, h.provider_name, h.plan_name FROM doctor_hmos dh JOIN hmos h ON h.id = dh.hmo_id
     WHERE dh.doctor_id = ? ORDER BY h.provider_name COLLATE NOCASE`,
    [doctorId],
  );
  return { ...doctor, hmos };
}

async function replaceHmoLinks(tx: DbExecutor, doctorId: string, hmoIds: string[]) {
  await tx.run('DELETE FROM doctor_hmos WHERE doctor_id = ?', [doctorId]);
  const now = nowIso();
  for (const hmoId of new Set(hmoIds)) {
    await tx.run('INSERT INTO doctor_hmos (doctor_id, hmo_id, created_at) VALUES (?, ?, ?)', [
      doctorId,
      hmoId,
      now,
    ]);
  }
}

export async function insertDoctorTx(
  tx: DbExecutor,
  args: { profileId: string; input: DoctorInput; sourceType: SourceType },
) {
  const d = args.input;
  const now = nowIso();
  const id = newId();
  await tx.run(
    `INSERT INTO doctors (id, profile_id, name, specialty, organization, address, phones, emails, photo_path,
       notes, source_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      args.profileId,
      d.name,
      d.specialty,
      d.organization,
      d.address,
      JSON.stringify(d.phones),
      JSON.stringify(d.emails),
      d.photo_path,
      d.notes,
      args.sourceType,
      now,
      now,
    ],
  );
  await replaceHmoLinks(tx, id, d.hmo_ids);
  return id;
}

export async function createDoctor(db: Db, args: { profileId: string; input: DoctorInput; sourceType: SourceType }) {
  const id = await db.transaction((tx) => insertDoctorTx(tx, args));
  return (await getDoctor(db, id))!;
}

export async function updateDoctor(db: Db, doctorId: string, d: DoctorInput) {
  await db.transaction(async (tx) => {
    await tx.run(
      `UPDATE doctors SET name = ?, specialty = ?, organization = ?, address = ?, phones = ?, emails = ?,
         photo_path = ?, notes = ?, updated_at = ? WHERE id = ?`,
      [
        d.name,
        d.specialty,
        d.organization,
        d.address,
        JSON.stringify(d.phones),
        JSON.stringify(d.emails),
        d.photo_path,
        d.notes,
        nowIso(),
        doctorId,
      ],
    );
    await replaceHmoLinks(tx, doctorId, d.hmo_ids);
  });
  return (await getDoctor(db, doctorId))!;
}

/** Deletes a doctor. Records, treatments, and medications that referenced them are unlinked (SET NULL). */
export async function deleteDoctor(db: DbExecutor, doctorId: string) {
  await db.run('DELETE FROM doctors WHERE id = ?', [doctorId]);
}
