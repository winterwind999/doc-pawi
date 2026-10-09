import * as SecureStore from 'expo-secure-store';

import { DocPawiNative } from '../native';
import { randomHex, secureKeys } from './profile-registry';
import {
  INITIAL_THROTTLE,
  registerFailure,
  remainingLockMs,
  type ThrottleState,
} from './throttle';

/**
 * PIN verifier: PBKDF2-HMAC-SHA256 (native implementation) with a random 128-bit salt, stored in
 * Keystore-backed SecureStore. The PIN gates access in the app; it is NOT the encryption key —
 * the SQLCipher key is a separate random 256-bit secret (see docs/PRIVACY.md).
 */
export const PIN_LENGTH = 4;
const PIN_ITERATIONS = 120_000;

export interface PinRecord {
  v: 1;
  alg: 'pbkdf2-sha256';
  iter: number;
  salt: string;
  hash: string;
}

export function isValidPinFormat(pin: string) {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

export async function createPinRecord(pin: string): Promise<PinRecord> {
  if (!isValidPinFormat(pin)) throw new Error(`The PIN must be ${PIN_LENGTH} digits.`);
  const salt = randomHex(16);
  const hash = await DocPawiNative.pbkdf2Sha256(pin, salt, PIN_ITERATIONS, 32);
  return { v: 1, alg: 'pbkdf2-sha256', iter: PIN_ITERATIONS, salt, hash };
}

export async function savePinRecord(profileId: string, record: PinRecord) {
  await SecureStore.setItemAsync(secureKeys.pin(profileId), JSON.stringify(record));
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function readThrottle(profileId: string): Promise<ThrottleState> {
  const raw = await SecureStore.getItemAsync(secureKeys.throttle(profileId));
  if (!raw) return INITIAL_THROTTLE;
  try {
    const parsed = JSON.parse(raw) as ThrottleState;
    return typeof parsed.failures === 'number' ? parsed : INITIAL_THROTTLE;
  } catch {
    return INITIAL_THROTTLE;
  }
}

async function writeThrottle(profileId: string, state: ThrottleState) {
  await SecureStore.setItemAsync(secureKeys.throttle(profileId), JSON.stringify(state));
}

export type PinCheckResult =
  | { ok: true }
  | { ok: false; reason: 'locked_out'; retryInMs: number; state: ThrottleState }
  | { ok: false; reason: 'wrong_pin'; state: ThrottleState }
  | { ok: false; reason: 'no_pin' };

/** Verifies a PIN with throttling. Failures are persisted before returning. */
export async function checkPin(profileId: string, pin: string, now = Date.now()): Promise<PinCheckResult> {
  const throttle = await readThrottle(profileId);
  const wait = remainingLockMs(throttle, now);
  if (wait > 0) return { ok: false, reason: 'locked_out', retryInMs: wait, state: throttle };

  const raw = await SecureStore.getItemAsync(secureKeys.pin(profileId));
  if (!raw) return { ok: false, reason: 'no_pin' };
  const record = JSON.parse(raw) as PinRecord;
  const candidate = await DocPawiNative.pbkdf2Sha256(pin, record.salt, record.iter, 32);
  if (isValidPinFormat(pin) && constantTimeEqual(candidate, record.hash)) {
    await writeThrottle(profileId, INITIAL_THROTTLE);
    return { ok: true };
  }
  const next = registerFailure(throttle, now);
  await writeThrottle(profileId, next);
  const retryInMs = remainingLockMs(next, now);
  return retryInMs > 0
    ? { ok: false, reason: 'locked_out', retryInMs, state: next }
    : { ok: false, reason: 'wrong_pin', state: next };
}

export async function resetThrottle(profileId: string) {
  await writeThrottle(profileId, INITIAL_THROTTLE);
}
