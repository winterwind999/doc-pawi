import { Directory, Paths } from 'expo-file-system';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { llamaEngine } from '@/lib/ai/llama-engine';
import { nowIso } from '@/lib/dates';
import type { ProfileRow } from '@/lib/db/models';
import { deleteProfileDatabase, openProfileDatabase } from '@/lib/db/open';
import { recoverInterruptedMessages } from '@/lib/db/repositories/conversations';
import { recoverInterruptedDocuments } from '@/lib/db/repositories/documents';
import { getProfile, insertProfile, updateProfile } from '@/lib/db/repositories/profiles';
import { DEFAULT_SETTINGS, getSettings, setSetting, type ProfileSettings } from '@/lib/db/repositories/settings';
import type { Db } from '@/lib/db/types';
import { newId } from '@/lib/ids';
import { DocPawiNative } from '@/lib/native';
import { reconcileReminders, removeAllReminders } from '@/lib/notifications/reminders';
import { checkPin, resetThrottle, savePinRecord, type PinCheckResult } from '@/lib/security/pin';
import {
  addProfileToRegistry,
  createDatabaseKey,
  deleteProfileSecrets,
  getDatabaseKey,
  readRegistry,
  removeProfileFromRegistry,
  secureKeys,
  setSignedInProfile,
  updateRegistryProfile,
  vaultKeyAlias,
  type RegistryProfile,
} from '@/lib/security/profile-registry';
import { clearViewCache } from '@/lib/services/document-service';
import type { ProfileInput } from '@/lib/validation/schemas';

import type { OnboardingDraft } from './onboarding-store';
import { useModelStore } from './model-store';

/**
 * Session lifecycle:
 *   booting → signed_out (welcome / onboarding / profile picker)
 *           → locked (PIN or biometric unlock for one profile)
 *           → unlocked (encrypted database open)
 * Locking closes the database and clears in-memory health data; signing out additionally returns
 * to the welcome screen (profile picker). Neither deletes data. Profiles are local-only.
 */
export type SessionStatus = 'booting' | 'signed_out' | 'locked' | 'unlocked';

interface SessionStore {
  status: SessionStatus;
  profiles: RegistryProfile[];
  activeProfileId: string | null;
  db: Db | null;
  profile: ProfileRow | null;
  settings: ProfileSettings;
  cipherVersion: string | null;
  biometricEnabled: boolean;
  dataVersion: number;
  bootError: string | null;
  /** Route to open once the unlocked app has mounted (e.g. model setup after onboarding). */
  postUnlockRoute: string | null;

  boot(): Promise<void>;
  chooseProfile(profileId: string): Promise<void>;
  showWelcome(): void;
  unlockWithPin(pin: string): Promise<PinCheckResult | { ok: false; reason: 'open_failed'; message: string }>;
  unlockWithBiometrics(): Promise<{ ok: boolean; message?: string }>;
  lock(): Promise<void>;
  signOut(): Promise<void>;
  createProfile(draft: OnboardingDraft, input: ProfileInput): Promise<void>;
  saveProfile(input: ProfileInput): Promise<void>;
  updateSettings(patch: Partial<ProfileSettings>): Promise<void>;
  setBiometricEnabled(enabled: boolean): Promise<void>;
  deleteVault(): Promise<void>;
  bumpData(): void;
}

async function readBiometricFlag(profileId: string) {
  return (await SecureStore.getItemAsync(secureKeys.biometric(profileId))) === '1';
}

export const useSession = create<SessionStore>()((set, get) => {
  const bumpData = () => set((s) => ({ dataVersion: s.dataVersion + 1 }));

  async function openSession(profileId: string) {
    const key = await getDatabaseKey(profileId);
    const { db, cipherVersion } = await openProfileDatabase(profileId, key, bumpData);
    try {
      await recoverInterruptedMessages(db);
      await recoverInterruptedDocuments(db);
      const profile = await getProfile(db, profileId);
      if (!profile) throw new Error('The profile record is missing from the encrypted database.');
      const settings = await getSettings(db);
      await resetThrottle(profileId);
      await setSignedInProfile(profileId);
      set({
        status: 'unlocked',
        activeProfileId: profileId,
        db,
        profile,
        settings,
        cipherVersion,
        biometricEnabled: await readBiometricFlag(profileId),
      });
      void afterUnlock(db, profileId, settings);
    } catch (error) {
      await db.close().catch(() => undefined);
      throw error;
    }
  }

  async function afterUnlock(db: Db, profileId: string, settings: ProfileSettings) {
    try {
      await reconcileReminders(db, profileId, settings);
    } catch {
      // Reminders are best-effort; the Meds screen shows permission state.
    }
    if (settings.autoLoadModel) {
      const models = useModelStore.getState();
      await models.refresh();
      const selected = useModelStore.getState().selectedModelId;
      if (useModelStore.getState().files[selected]?.verified && useModelStore.getState().loadState !== 'ready') {
        models.load().catch(() => undefined);
      }
    }
  }

  async function closeSession() {
    const { db } = get();
    useModelStore.getState().stop();
    set({ db: null, profile: null, settings: DEFAULT_SETTINGS, cipherVersion: null });
    clearViewCache();
    await llamaEngine.clearCache().catch(() => undefined);
    await db?.close().catch(() => undefined);
  }

  return {
    status: 'booting',
    profiles: [],
    activeProfileId: null,
    db: null,
    profile: null,
    settings: DEFAULT_SETTINGS,
    cipherVersion: null,
    biometricEnabled: false,
    dataVersion: 0,
    bootError: null,
    postUnlockRoute: null,

    async boot() {
      try {
        const registry = await readRegistry();
        const signedIn = registry.profiles.find((p) => p.id === registry.signedInProfileId) ?? null;
        set({
          profiles: registry.profiles,
          activeProfileId: signedIn?.id ?? null,
          status: signedIn ? 'locked' : 'signed_out',
          biometricEnabled: signedIn ? await readBiometricFlag(signedIn.id) : false,
          bootError: null,
        });
      } catch (error) {
        set({ status: 'signed_out', bootError: `Secure storage could not be read: ${(error as Error).message}` });
      }
    },

    async chooseProfile(profileId) {
      set({ activeProfileId: profileId, status: 'locked', biometricEnabled: await readBiometricFlag(profileId) });
    },

    showWelcome() {
      set({ status: 'signed_out', activeProfileId: null });
    },

    async unlockWithPin(pin) {
      const profileId = get().activeProfileId;
      if (!profileId) return { ok: false, reason: 'no_pin' };
      const result = await checkPin(profileId, pin);
      if (!result.ok) return result;
      try {
        await openSession(profileId);
        return result;
      } catch (error) {
        return { ok: false, reason: 'open_failed', message: (error as Error).message };
      }
    },

    async unlockWithBiometrics() {
      const profileId = get().activeProfileId;
      if (!profileId || !(await readBiometricFlag(profileId))) return { ok: false, message: 'Biometric unlock is off.' };
      const auth = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Doc Pawi',
        cancelLabel: 'Use PIN',
        disableDeviceFallback: true,
      });
      if (!auth.success) return { ok: false, message: auth.error === 'user_cancel' ? undefined : 'Biometric check failed. Use your PIN.' };
      try {
        await openSession(profileId);
        return { ok: true };
      } catch (error) {
        return { ok: false, message: (error as Error).message };
      }
    },

    async lock() {
      if (get().status !== 'unlocked') return;
      set({ status: 'locked' });
      await closeSession();
    },

    async signOut() {
      set({ status: 'signed_out' });
      await closeSession();
      await setSignedInProfile(null);
      const registry = await readRegistry();
      set({ profiles: registry.profiles, activeProfileId: null });
    },

    async createProfile(draft, input) {
      if (!draft.pinRecord) throw new Error('Onboarding is incomplete.');
      const profileId = newId();
      let db: Db | null = null;
      try {
        const key = await createDatabaseKey(profileId);
        const opened = await openProfileDatabase(profileId, key, bumpData);
        db = opened.db;
        // Profiles are local-only: no account, nothing identifies the profile outside this phone.
        await insertProfile(db, { id: profileId, authProvider: 'local', authSubject: null, input });
        await savePinRecord(profileId, draft.pinRecord);
        await addProfileToRegistry(
          {
            id: profileId,
            displayName: input.display_name,
            email: input.email,
            authProvider: 'local',
            authSubject: null,
            createdAt: nowIso(),
          },
          true,
        );
        const profile = await getProfile(db, profileId);
        const settings = await getSettings(db);
        const registry = await readRegistry();
        set({
          status: 'unlocked',
          profiles: registry.profiles,
          activeProfileId: profileId,
          db,
          profile,
          settings,
          cipherVersion: opened.cipherVersion,
          biometricEnabled: false,
        });
      } catch (error) {
        await db?.close().catch(() => undefined);
        await deleteProfileDatabase(profileId).catch(() => undefined);
        await deleteProfileSecrets(profileId).catch(() => undefined);
        await removeProfileFromRegistry(profileId).catch(() => undefined);
        throw error;
      }
    },

    async saveProfile(input) {
      const { db, activeProfileId } = get();
      if (!db || !activeProfileId) throw new Error('Unlock Doc Pawi first.');
      await updateProfile(db, activeProfileId, input);
      await updateRegistryProfile(activeProfileId, { displayName: input.display_name, email: input.email });
      const registry = await readRegistry();
      set({ profile: await getProfile(db, activeProfileId), profiles: registry.profiles });
    },

    async updateSettings(patch) {
      const { db, activeProfileId } = get();
      if (!db || !activeProfileId) return;
      for (const [key, value] of Object.entries(patch) as [keyof ProfileSettings, never][]) {
        await setSetting(db, key, value);
      }
      const settings = await getSettings(db);
      set({ settings });
      if ('remindersEnabled' in patch || 'showMedicationNamesInNotifications' in patch) {
        await reconcileReminders(db, activeProfileId, settings).catch(() => undefined);
      }
    },

    async setBiometricEnabled(enabled) {
      const profileId = get().activeProfileId;
      if (!profileId) return;
      if (enabled) {
        const auth = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Confirm to enable biometric unlock',
          cancelLabel: 'Cancel',
          disableDeviceFallback: true,
        });
        if (!auth.success) throw new Error('Biometric confirmation was not completed.');
        await SecureStore.setItemAsync(secureKeys.biometric(profileId), '1');
      } else {
        await SecureStore.deleteItemAsync(secureKeys.biometric(profileId));
      }
      set({ biometricEnabled: enabled });
    },

    async deleteVault() {
      const profileId = get().activeProfileId;
      if (!profileId) return;
      await removeAllReminders(profileId).catch(() => undefined);
      set({ status: 'signed_out' });
      await closeSession();
      await deleteProfileDatabase(profileId);
      for (const folder of ['vault', 'doctor-photos']) {
        const dir = new Directory(Paths.document, folder, profileId);
        if (dir.exists) dir.delete();
      }
      await DocPawiNative.deleteVaultKey(vaultKeyAlias(profileId)).catch(() => false);
      await deleteProfileSecrets(profileId);
      await removeProfileFromRegistry(profileId);
      const registry = await readRegistry();
      set({ profiles: registry.profiles, activeProfileId: null, biometricEnabled: false });
    },

    bumpData,
  };
});

/** Convenience accessor for screens that only render while unlocked. */
export function useUnlockedSession() {
  const db = useSession((s) => s.db);
  const profile = useSession((s) => s.profile);
  if (!db || !profile) throw new Error('The vault is locked.');
  return { db, profile, profileId: profile.id };
}
