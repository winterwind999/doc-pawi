import { nowIso } from '../../dates';
import { newId } from '../../ids';
import type { FacilityInput, HmoInput } from '../../validation/schemas';
import type { DoctorRow, FacilityRow, HmoRow, SourceType } from '../models';
import type { Db, DbExecutor } from '../types';

export interface HmoDetail extends HmoRow {
  facilities: (FacilityRow & { link_note: string | null })[];
  doctors: Pick<DoctorRow, 'id' | 'name' | 'specialty'>[];
}

export async function listHmos(db: DbExecutor, profileId: string) {
  return db.all<HmoRow & { facility_count: number; doctor_count: number }>(
    `SELECT h.*,
       (SELECT COUNT(*) FROM hmo_facilities hf WHERE hf.hmo_id = h.id) AS facility_count,
       (SELECT COUNT(*) FROM doctor_hmos dh WHERE dh.hmo_id = h.id) AS doctor_count
     FROM hmos h WHERE h.profile_id = ? ORDER BY h.provider_name COLLATE NOCASE`,
    [profileId],
  );
}

export async function getHmo(db: DbExecutor, hmoId: string): Promise<HmoDetail | null> {
  const hmo = await db.get<HmoRow>('SELECT * FROM hmos WHERE id = ?', [hmoId]);
  if (!hmo) return null;
  const facilities = await db.all<FacilityRow & { link_note: string | null }>(
    `SELECT f.*, hf.note AS link_note FROM hmo_facilities hf JOIN facilities f ON f.id = hf.facility_id
     WHERE hf.hmo_id = ? ORDER BY f.name COLLATE NOCASE`,
    [hmoId],
  );
  const doctors = await db.all<Pick<DoctorRow, 'id' | 'name' | 'specialty'>>(
    `SELECT d.id, d.name, d.specialty FROM doctor_hmos dh JOIN doctors d ON d.id = dh.doctor_id
     WHERE dh.hmo_id = ? ORDER BY d.name COLLATE NOCASE`,
    [hmoId],
  );
  return { ...hmo, facilities, doctors };
}

export async function insertHmo(db: DbExecutor, args: { profileId: string; input: HmoInput; sourceType: SourceType }) {
  const h = args.input;
  const now = nowIso();
  const id = newId();
  await db.run(
    `INSERT INTO hmos (id, profile_id, provider_name, plan_name, member_id, valid_until, coverage_notes, hotline,
       source_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, args.profileId, h.provider_name, h.plan_name, h.member_id, h.valid_until, h.coverage_notes, h.hotline, args.sourceType, now, now],
  );
  return id;
}

export async function updateHmo(db: DbExecutor, hmoId: string, h: HmoInput) {
  await db.run(
    `UPDATE hmos SET provider_name = ?, plan_name = ?, member_id = ?, valid_until = ?, coverage_notes = ?,
       hotline = ?, updated_at = ? WHERE id = ?`,
    [h.provider_name, h.plan_name, h.member_id, h.valid_until, h.coverage_notes, h.hotline, nowIso(), hmoId],
  );
}

/** Deletes an HMO; facility and doctor links cascade, the facilities and doctors themselves remain. */
export async function deleteHmo(db: DbExecutor, hmoId: string) {
  await db.run('DELETE FROM hmos WHERE id = ?', [hmoId]);
}

export async function listFacilities(db: DbExecutor, profileId: string) {
  return db.all<FacilityRow>('SELECT * FROM facilities WHERE profile_id = ? ORDER BY name COLLATE NOCASE', [
    profileId,
  ]);
}

export async function getFacility(db: DbExecutor, facilityId: string) {
  return db.get<FacilityRow>('SELECT * FROM facilities WHERE id = ?', [facilityId]);
}

export async function insertFacilityTx(
  tx: DbExecutor,
  args: { profileId: string; input: FacilityInput; sourceType: SourceType; linkHmoId?: string | null },
) {
  const f = args.input;
  const now = nowIso();
  const id = newId();
  await tx.run(
    `INSERT INTO facilities (id, profile_id, name, facility_type, address, phone, notes, source_type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, args.profileId, f.name, f.facility_type, f.address, f.phone, f.notes, args.sourceType, now, now],
  );
  if (args.linkHmoId) {
    await tx.run('INSERT INTO hmo_facilities (hmo_id, facility_id, note, created_at) VALUES (?, ?, NULL, ?)', [
      args.linkHmoId,
      id,
      now,
    ]);
  }
  return id;
}

export async function createFacility(
  db: Db,
  args: { profileId: string; input: FacilityInput; sourceType: SourceType; linkHmoId?: string | null },
) {
  return db.transaction((tx) => insertFacilityTx(tx, args));
}

export async function updateFacility(db: DbExecutor, facilityId: string, f: FacilityInput) {
  await db.run(
    'UPDATE facilities SET name = ?, facility_type = ?, address = ?, phone = ?, notes = ?, updated_at = ? WHERE id = ?',
    [f.name, f.facility_type, f.address, f.phone, f.notes, nowIso(), facilityId],
  );
}

export async function deleteFacility(db: DbExecutor, facilityId: string) {
  await db.run('DELETE FROM facilities WHERE id = ?', [facilityId]);
}

export async function linkFacility(db: DbExecutor, hmoId: string, facilityId: string, note: string | null = null) {
  await db.run(
    'INSERT OR IGNORE INTO hmo_facilities (hmo_id, facility_id, note, created_at) VALUES (?, ?, ?, ?)',
    [hmoId, facilityId, note, nowIso()],
  );
}

export async function unlinkFacility(db: DbExecutor, hmoId: string, facilityId: string) {
  await db.run('DELETE FROM hmo_facilities WHERE hmo_id = ? AND facility_id = ?', [hmoId, facilityId]);
}
