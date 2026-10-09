import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, View } from 'react-native';

import { useModelStore } from '@/stores/model-store';
import { useSession } from '@/stores/session-store';
import { colors } from '@/theme/colors';

/**
 * Unlocked area. Enforces idle locking two ways:
 *  - returning from the background after the idle timeout locks immediately;
 *  - no touches in the foreground for the idle timeout locks too (paused while the local
 *    model is generating or analyzing a document).
 */
export default function AppLayout() {
  const db = useSession((s) => s.db);
  const idleMinutes = useSession((s) => s.settings.idleLockMinutes);
  const lastActivity = useRef(0);
  const response = Notifications.useLastNotificationResponse();

  useEffect(() => {
    const idleMs = idleMinutes * 60_000;
    lastActivity.current = Date.now();
    let backgroundAt: number | null = null;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundAt = backgroundAt ?? Date.now();
      } else if (state === 'active') {
        if (backgroundAt && Date.now() - backgroundAt >= idleMs) void useSession.getState().lock();
        backgroundAt = null;
        lastActivity.current = Date.now();
      }
    });
    const timer = setInterval(() => {
      if (useModelStore.getState().activeJob) {
        lastActivity.current = Date.now();
        return;
      }
      if (AppState.currentState === 'active' && Date.now() - lastActivity.current >= idleMs) {
        void useSession.getState().lock();
      }
    }, 15_000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [idleMinutes]);

  useEffect(() => {
    const url = response?.notification.request.content.data?.url;
    if (url === '/meds') router.navigate('/meds');
  }, [response]);

  const postUnlockRoute = useSession((s) => s.postUnlockRoute);
  useEffect(() => {
    if (!db || !postUnlockRoute) return;
    useSession.setState({ postUnlockRoute: null });
    // Defer one frame so the tabs are mounted before pushing on top of them.
    const t = setTimeout(() => router.push(postUnlockRoute as never), 0);
    return () => clearTimeout(t);
  }, [db, postUnlockRoute]);

  if (!db) return null;

  return (
    <View
      className="flex-1"
      onStartShouldSetResponderCapture={() => {
        lastActivity.current = Date.now();
        return false;
      }}
    >
      <Stack
        screenOptions={{
          headerTintColor: colors.ink,
          headerStyle: { backgroundColor: colors.surface },
          headerTitleStyle: { fontWeight: '700', color: colors.ink },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.surfaceMuted },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </View>
  );
}
