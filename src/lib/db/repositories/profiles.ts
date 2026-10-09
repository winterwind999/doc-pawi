import { nowIso } from '../../dates';
import type { ProfileInput } from '../../validation/schemas';
import type { AuthProvider, ProfileRow } from '../models';
import type { DbExecutor } from '../types';

export async function getProfile(db: DbExecutor, profileId: string) {
  return db.get<ProfileRow>('SELECT * FROM profiles WHERE id = ?', [profileId]);
}

export async function insertProfile(
  db: DbExecutor,
  args: { id: string; authProvider: AuthProvider; authSubject: string | null; input: ProfileInput },
) {
  const now = nowIso();
  const p = args.input;
  await db.run(
    `INSERT INTO profiles (id, auth_provider, auth_subject, display_name, email, sex, birth_date,
       height_value, height_unit, weight_value, weight_unit, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      args.id,
      args.authProvider,
      args.authSubject,
      p.display_name,
      p.email,
      p.sex,
      p.birth_date,
      p.height_value,
      p.height_unit,
      p.weight_value,
      p.weight_unit,
      now,
      now,
    ],
  );
}

export async function updateProfile(db: DbExecutor, profileId: string, p: ProfileInput) {
  await db.run(
    `UPDATE profiles SET display_name = ?, email = ?, sex = ?, birth_date = ?, height_value = ?,
       height_unit = ?, weight_value = ?, weight_unit = ?, updated_at = ? WHERE id = ?`,
    [
      p.display_name,
      p.email,
      p.sex,
      p.birth_date,
      p.height_value,
      p.height_unit,
      p.weight_value,
      p.weight_unit,
      nowIso(),
      profileId,
    ],
  );
}
