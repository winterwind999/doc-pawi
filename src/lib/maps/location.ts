import * as Location from 'expo-location';

import type { LatLng } from './geo';

/**
 * The phone's location, only when the user asks for it (nearby map, "Use my current location").
 * Doc Pawi keeps positions on the phone; it does not send them anywhere.
 */
export type LocationOutcome =
  | { ok: true; coords: LatLng; accuracyMeters: number | null }
  | { ok: false; reason: 'denied' | 'blocked' | 'services_off' | 'unavailable'; message: string };

export type LocationPermission = 'granted' | 'ask' | 'blocked';

/** Current permission state, without asking. */
export async function locationPermission(): Promise<LocationPermission> {
  const p = await Location.getForegroundPermissionsAsync();
  return p.granted ? 'granted' : p.canAskAgain ? 'ask' : 'blocked';
}

async function ensurePermission(): Promise<Extract<LocationOutcome, { ok: false }> | null> {
  let p = await Location.getForegroundPermissionsAsync();
  if (!p.granted && p.canAskAgain) p = await Location.requestForegroundPermissionsAsync();
  if (p.granted) return null;
  return p.canAskAgain
    ? { ok: false, reason: 'denied', message: 'Location permission was not given.' }
    : {
        ok: false,
        reason: 'blocked',
        message: 'Location permission is off for Doc Pawi. You can turn it on in the phone settings.',
      };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('it took too long. Try again outdoors or near a window.')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Asks for permission when needed, then reads the position. GPS works without internet. With
 * `maxAgeMs`, a recent position the phone already has is used when it is accurate enough.
 */
export async function getCurrentCoords(options: { precise?: boolean; maxAgeMs?: number } = {}): Promise<LocationOutcome> {
  const denied = await ensurePermission();
  if (denied) return denied;
  if (!(await Location.hasServicesEnabledAsync())) {
    return {
      ok: false,
      reason: 'services_off',
      message: 'Location is turned off on this phone. Turn it on in the quick settings and try again.',
    };
  }
  try {
    if (options.maxAgeMs) {
      const last = await Location.getLastKnownPositionAsync({ maxAge: options.maxAgeMs, requiredAccuracy: 500 });
      if (last) {
        return {
          ok: true,
          coords: { latitude: last.coords.latitude, longitude: last.coords.longitude },
          accuracyMeters: last.coords.accuracy ?? null,
        };
      }
    }
    const position = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: options.precise ? Location.Accuracy.High : Location.Accuracy.Balanced }),
      30_000,
    );
    return {
      ok: true,
      coords: { latitude: position.coords.latitude, longitude: position.coords.longitude },
      accuracyMeters: position.coords.accuracy ?? null,
    };
  } catch (error) {
    return { ok: false, reason: 'unavailable', message: `Could not get your location: ${(error as Error).message}` };
  }
}

/**
 * Finds an address with the phone's geocoding service. On most Android phones that service is
 * Google's: the address text is sent over the internet. Returns null when nothing was found.
 */
export async function geocodeAddress(address: string): Promise<LatLng | null> {
  const denied = await ensurePermission();
  if (denied) throw new Error(denied.message);
  const results = await Location.geocodeAsync(address);
  const first = results[0];
  return first ? { latitude: first.latitude, longitude: first.longitude } : null;
}
