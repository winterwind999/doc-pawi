import { DatabaseSync } from 'node:sqlite';

import { createDb } from '@/lib/db/database';
import { migrate } from '@/lib/db/migrations';
import { insertProfile } from '@/lib/db/repositories/profiles';
import type { Db, RawConnection, SqlValue } from '@/lib/db/types';
import { profileInputSchema } from '@/lib/validation/schemas';

/**
 * In-memory SQLite (Node's built-in node:sqlite) behind the same RawConnection interface the app
 * uses with expo-sqlite/SQLCipher, so migrations and repositories run unchanged in tests.
 * Note: this exercises SQL and constraints, not SQLCipher encryption (verified on device).
 */
export function openRawTestConnection(): RawConnection {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  const args = (params?: readonly SqlValue[]) => (params ?? []) as SqlValue[];
  return {
    exec: async (sql) => {
      sqlite.exec(sql);
    },
    run: async (sql, params) => {
      const r = sqlite.prepare(sql).run(...args(params));
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    all: async <T>(sql: string, params?: readonly SqlValue[]) => sqlite.prepare(sql).all(...args(params)) as T[],
    get: async <T>(sql: string, params?: readonly SqlValue[]) => (sqlite.prepare(sql).get(...args(params)) ?? null) as T | null,
    close: async () => sqlite.close(),
  };
}

export async function openTestDb(): Promise<Db> {
  const db = createDb(openRawTestConnection());
  await migrate(db);
  return db;
}

export const PROFILE_ID = 'profile-test-1';

export async function openTestDbWithProfile(): Promise<Db> {
  const db = await openTestDb();
  await insertTestProfile(db);
  return db;
}

export async function insertTestProfile(db: Db) {
  await insertProfile(db, {
    id: PROFILE_ID,
    authProvider: 'local',
    authSubject: null,
    input: profileInputSchema.parse({
      display_name: 'Test User',
      sex: 'female',
      birth_date: '1990-05-20',
      height_value: 160,
      height_unit: 'cm',
      weight_value: 55,
      weight_unit: 'kg',
    }),
  });
}
