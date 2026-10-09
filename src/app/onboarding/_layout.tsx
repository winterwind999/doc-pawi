import { Stack } from 'expo-router';

import { colors } from '@/theme/colors';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.ink,
        headerStyle: { backgroundColor: colors.surfaceMuted },
        headerShadowVisible: false,
        headerTitle: '',
        contentStyle: { backgroundColor: colors.surfaceMuted },
      }}
    />
  );
}
