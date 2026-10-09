import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import type { AuthProvider } from '../db/models';

/**
 * Device-level registry of local profiles, stored in expo-secure-store (values encrypted with an
 * Android Keystore AES-GCM key). Each profile owns: an encrypted SQLCipher database, a random
 * database key, a PIN verifier, throttle state, and a Keystore key for its document vault.
 */
export interface RegistryProfile {
  id: string;
  displayName: string;
  email: string | null;
  /** Always `'local'`: profiles exist only on this phone (kept for registry compatibility). */
  authProvider: AuthProvider;
  /** Always null for local-only profiles (kept for registry compatibility). */
  authSubject: string | null;
  createdAt: string;
}

interface Registry {
  v: 1;
  profiles: RegistryProfile[];
  /** Profile with an active (possibly locked) session; null after sign-out. */
  signedInProfileId: string | null;
}

const REGISTRY_KEY = 'docpawi.registry.v1';

export const secureKeys = {
  dbKey: (profileId: string) => `docpawi.dbkey.${profileId}`,
  pin: (profileId: string) => `docpawi.pin.${profileId}`,
  throttle: (profileId: string) => `docpawi.throttle.${profileId}`,
  biometric: (profileId: string) => `docpawi.bio.${profileId}`,
};

/** Android Keystore alias for a profile's document-encryption key (used by the native vault). */
export const vaultKeyAlias = (profileId: string) => `docpawi_vault_${profileId.replace(/-/g, '')}`;

const EMPTY: Registry = { v: 1, profiles: [], signedInProfileId: null };

export async function readRegistry(): Promise<Registry> {
  const raw = await SecureStore.getItemAsync(REGISTRY_KEY);
  if (!raw) return { ...EMPTY, profiles: [] };
  try {
    const parsed = JSON.parse(raw) as Registry;
    if (parsed?.v === 1 && Array.isArray(parsed.profiles)) return parsed;
  } catch {
    // fall through
  }
  return { ...EMPTY, profiles: [] };
}

async function writeRegistry(registry: Registry) {
  await SecureStore.setItemAsync(REGISTRY_KEY, JSON.stringify(registry));
}

export async function addProfileToRegistry(profile: RegistryProfile, signIn = true) {
  const registry = await readRegistry();
  registry.profiles = [...registry.profiles.filter((p) => p.id !== profile.id), profile];
  if (signIn) registry.signedInProfileId = profile.id;
  await writeRegistry(registry);
}

export async function updateRegistryProfile(profileId: string, patch: Partial<Omit<RegistryProfile, 'id'>>) {
  const registry = await readRegistry();
  registry.profiles = registry.profiles.map((p) => (p.id === profileId ? { ...p, ...patch } : p));
  await writeRegistry(registry);
}

export async function removeProfileFromRegistry(profileId: string) {
  const registry = await readRegistry();
  registry.profiles = registry.profiles.filter((p) => p.id !== profileId);
  if (registry.signedInProfileId === profileId) registry.signedInProfileId = null;
  await writeRegistry(registry);
}

export async function setSignedInProfile(profileId: string | null) {
  const registry = await readRegistry();
  registry.signedInProfileId = profileId;
  await writeRegistry(registry);
}

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export function randomHex(byteCount: number) {
  return toHex(Crypto.getRandomBytes(byteCount));
}

/** Creates and stores a random 256-bit SQLCipher key for a new profile. */
export async function createDatabaseKey(profileId: string) {
  const key = randomHex(32);
  await SecureStore.setItemAsync(secureKeys.dbKey(profileId), key);
  return key;
}

export async function getDatabaseKey(profileId: string) {
  const key = await SecureStore.getItemAsync(secureKeys.dbKey(profileId));
  if (!key || !/^[0-9a-f]{64}$/.test(key)) {
    throw new Error('The encryption key for this profile is missing. The health vault cannot be opened.');
  }
  return key;
}

/** Deletes all SecureStore entries belonging to a profile. */
export async function deleteProfileSecrets(profileId: string) {
  for (const key of Object.values(secureKeys)) {
    await SecureStore.deleteItemAsync(key(profileId));
  }
}
