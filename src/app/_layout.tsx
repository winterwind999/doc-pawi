import '../global.css';

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { installNotificationHandler } from '@/lib/notifications/reminders';
import { useModelStore } from '@/stores/model-store';
import { useSession } from '@/stores/session-store';
import { colors } from '@/theme/colors';

void SplashScreen.preventAutoHideAsync();

/**
 * Root navigator. Which routes exist depends only on the session state:
 *  - signed_out → welcome + onboarding
 *  - locked     → unlock
 *  - unlocked   → the app (tabs and detail screens)
 * Protected routes redirect automatically when the state changes (e.g. idle lock).
 */
export default function RootLayout() {
  const status = useSession((s) => s.status);

  useEffect(() => {
    installNotificationHandler();
    void useSession.getState().boot();
    void useModelStore.getState().refresh();
  }, []);

  useEffect(() => {
    if (status !== 'booting') void SplashScreen.hideAsync();
  }, [status]);

  const signedOut = status === 'signed_out' || status === 'booting';
  return (
    // Keyboard events for the keyboard-aware views (edge-to-edge Android does not resize the window).
    <KeyboardProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surfaceMuted } }}>
        <Stack.Protected guard={status === 'unlocked'}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={status === 'locked'}>
          <Stack.Screen name="unlock" />
        </Stack.Protected>
        <Stack.Protected guard={signedOut}>
          <Stack.Screen name="welcome" />
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
      </Stack>
    </KeyboardProvider>
  );
}
