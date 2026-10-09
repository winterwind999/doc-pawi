import { Directory, File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

import { createDb } from './database';
import { migrate } from './migrations';
import type { Db, RawConnection, SqlValue } from './types';

/**
 * Opens a profile's encrypted SQLCipher database.
 *
 * - The key is a random 256-bit value passed as a raw key (`x'…'`), so SQLCipher skips its own
 *   PBKDF2 derivation; the key itself comes from Keystore-backed SecureStore.
 * - `PRAGMA key` must be the first statement on the connection.
 * - `withExclusiveTransactionAsync` is deliberately not used: it opens a second, unkeyed
 *   connection. Transactions go through `createDb`'s serialized BEGIN/COMMIT instead.
 */
export const databaseName = (profileId: string) => `docpawi-${profileId}.db`;

export class DatabaseKeyError extends Error {
  constructor() {
    super('The health database could not be decrypted with this profile’s key.');
  }
}

export interface OpenedDatabase {
  db: Db;
  cipherVersion: string | null;
}

export async function openProfileDatabase(
  profileId: string,
  keyHex: string,
  onWrite?: () => void,
): Promise<OpenedDatabase> {
  if (!/^[0-9a-f]{64}$/.test(keyHex)) throw new DatabaseKeyError();
  const sqlite = await SQLite.openDatabaseAsync(databaseName(profileId), { useNewConnection: true });
  let cipherVersion: string | null = null;
  try {
    await sqlite.execAsync(`PRAGMA key = "x'${keyHex}'";`);
    try {
      // Fails with "file is not a database" when the key is wrong.
      await sqlite.getFirstAsync('SELECT count(*) AS n FROM sqlite_master');
    } catch {
      throw new DatabaseKeyError();
    }
    const cipher = await sqlite.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version');
    cipherVersion = cipher?.cipher_version ?? null;
    await sqlite.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  } catch (error) {
    await sqlite.closeAsync().catch(() => undefined);
    throw error;
  }

  const raw: RawConnection = {
    exec: (sql) => sqlite.execAsync(sql),
    run: (sql, params) => sqlite.runAsync(sql, (params ?? []) as SqlValue[]),
    all: <T>(sql: string, params?: readonly SqlValue[]) =>
      sqlite.getAllAsync<T>(sql, (params ?? []) as SqlValue[]),
    get: <T>(sql: string, params?: readonly SqlValue[]) =>
      sqlite.getFirstAsync<T>(sql, (params ?? []) as SqlValue[]),
    close: () => sqlite.closeAsync(),
  };
  const db = createDb(raw, { onWrite });
  try {
    await migrate(db);
  } catch (error) {
    await db.close().catch(() => undefined);
    throw error;
  }
  return { db, cipherVersion };
}

/** Deletes a profile's database files (main, WAL, SHM). The database must be closed first. */
export async function deleteProfileDatabase(profileId: string) {
  const name = databaseName(profileId);
  const dir = new Directory(Paths.document, 'SQLite');
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const file = new File(dir, `${name}${suffix}`);
    if (file.exists) file.delete();
  }
}
