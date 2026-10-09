/**
 * Failed-PIN throttling. The state is persisted in Keystore-backed SecureStore so restarting the
 * app does not reset it. Limitation (documented in docs/PRIVACY.md): moving the device clock
 * forward shortens a lockout, because Android offers no persistent monotonic clock across reboots.
 */
export interface ThrottleState {
  failures: number;
  /** Epoch ms until which unlock attempts are refused, or null. */
  lockedUntil: number | null;
}

export const FREE_ATTEMPTS = 5;
const LOCKOUT_STEPS_MS = [30_000, 60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000];

export const INITIAL_THROTTLE: ThrottleState = { failures: 0, lockedUntil: null };

export function lockoutMsAfter(failures: number): number {
  if (failures < FREE_ATTEMPTS) return 0;
  return LOCKOUT_STEPS_MS[Math.min(failures - FREE_ATTEMPTS, LOCKOUT_STEPS_MS.length - 1)];
}

export function remainingLockMs(state: ThrottleState, now: number): number {
  return state.lockedUntil && state.lockedUntil > now ? state.lockedUntil - now : 0;
}

export function registerFailure(state: ThrottleState, now: number): ThrottleState {
  const failures = state.failures + 1;
  const lockMs = lockoutMsAfter(failures);
  return { failures, lockedUntil: lockMs ? now + lockMs : null };
}

export function attemptsBeforeLockout(state: ThrottleState): number {
  return Math.max(0, FREE_ATTEMPTS - state.failures);
}

export function formatDuration(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s} second${s === 1 ? '' : 's'}`;
  const m = Math.ceil(s / 60);
  return `${m} minute${m === 1 ? '' : 's'}`;
}
