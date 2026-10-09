import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';

/**
 * Google Sign-In (legacy Google Sign-In SDK on Android via @react-native-google-signin 16.1.5).
 *
 * It only establishes the account identity of a new local profile; no tokens are stored and no
 * health data is sent. It requires an Android OAuth client (package name + signing SHA-1) in a
 * Google Cloud project, so builds enable it explicitly with EXPO_PUBLIC_GOOGLE_SIGN_IN_ENABLED=true.
 * See README → "Google Sign-In configuration".
 */
export const GOOGLE_SIGN_IN_ENABLED = process.env.EXPO_PUBLIC_GOOGLE_SIGN_IN_ENABLED === 'true';
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

export interface GoogleIdentity {
  subject: string;
  email: string;
  name: string | null;
  givenName: string | null;
}

export type GoogleSignInResult =
  | { status: 'success'; identity: GoogleIdentity }
  | { status: 'cancelled' }
  | { status: 'error'; message: string; code: string | null };

let configured = false;
function configure() {
  if (configured) return;
  GoogleSignin.configure(WEB_CLIENT_ID ? { webClientId: WEB_CLIENT_ID } : {});
  configured = true;
}

export function describeGoogleError(code: string | null, fallback: string): string {
  switch (code) {
    case '10':
      return 'Google sign-in is not configured for this app build (DEVELOPER_ERROR). The app’s package name and signing certificate must be registered in Google Cloud. You can continue with a local-only profile.';
    case '7':
      return 'No internet connection. Google sign-in needs to be online once; you can retry when connected or continue with a local-only profile.';
    case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
      return 'Google Play services is unavailable or out of date on this device.';
    case statusCodes.IN_PROGRESS:
      return 'Google sign-in is already in progress.';
    default:
      return fallback;
  }
}

export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  if (!GOOGLE_SIGN_IN_ENABLED) {
    return {
      status: 'error',
      code: 'not_enabled',
      message: 'Google sign-in is not enabled in this build. Continue with a local-only profile.',
    };
  }
  try {
    configure();
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return { status: 'cancelled' };
    const user = response.data.user;
    return {
      status: 'success',
      identity: { subject: user.id, email: user.email, name: user.name ?? null, givenName: user.givenName ?? null },
    };
  } catch (error) {
    const code = isErrorWithCode(error) ? String(error.code) : null;
    if (code === statusCodes.SIGN_IN_CANCELLED) return { status: 'cancelled' };
    return { status: 'error', code, message: describeGoogleError(code, `Google sign-in failed: ${(error as Error).message}`) };
  }
}

/** Ends the Google session on this device. Local data is unaffected. Never throws. */
export async function signOutOfGoogle() {
  if (!GOOGLE_SIGN_IN_ENABLED) return;
  try {
    configure();
    await GoogleSignin.signOut();
  } catch {
    // Signing out locally must not fail because Play services is unavailable.
  }
}
