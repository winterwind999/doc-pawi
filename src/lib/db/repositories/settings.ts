import { nowIso } from '../../dates';
import type { DbExecutor } from '../types';

/** Per-profile preferences stored inside the encrypted database. */
export interface ProfileSettings {
  /** Minutes of inactivity/background time before the vault locks. */
  idleLockMinutes: number;
  remindersEnabled: boolean;
  /** Show medication names in notification text (off by default for lock-screen privacy). */
  showMedicationNamesInNotifications: boolean;
  biometricUnlock: boolean;
  /** Loads the installed model automatically after unlocking. */
  autoLoadModel: boolean;
}

export const DEFAULT_SETTINGS: ProfileSettings = {
  idleLockMinutes: 5,
  remindersEnabled: true,
  showMedicationNamesInNotifications: false,
  biometricUnlock: false,
  autoLoadModel: true,
};

export async function getSettings(db: DbExecutor): Promise<ProfileSettings> {
  const rows = await db.all<{ key: string; value: string }>('SELECT key, value FROM app_settings');
  const stored: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      stored[row.key] = JSON.parse(row.value);
    } catch {
      // Ignore malformed values and fall back to defaults.
    }
  }
  const merged = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof ProfileSettings)[]) {
    if (typeof stored[key] === typeof DEFAULT_SETTINGS[key]) {
      (merged as Record<string, unknown>)[key] = stored[key];
    }
  }
  return merged;
}

export async function setSetting<K extends keyof ProfileSettings>(
  db: DbExecutor,
  key: K,
  value: ProfileSettings[K],
) {
  await db.run(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, JSON.stringify(value), nowIso()],
  );
}
