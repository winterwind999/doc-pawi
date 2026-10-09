import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProgressBar, StickyFooter } from './ui/Layout';

export const ONBOARDING_STEPS = 6;

/** Shared scaffold for first-launch steps: progress, title, explanation, content, and footer actions. */
export function OnboardingStep({
  step,
  title,
  description,
  children,
  footer,
}: {
  step: number;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-surface-muted">
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={footer ? 96 : 24}
      >
        <View className="gap-5">
          <View className="gap-2">
            <Text className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Step {step} of {ONBOARDING_STEPS}
            </Text>
            <ProgressBar value={(step / ONBOARDING_STEPS) * 100} />
          </View>
          <View className="gap-2">
            <Text accessibilityRole="header" className="text-2xl font-bold text-ink">
              {title}
            </Text>
            {description ? <Text className="text-base leading-6 text-ink-muted">{description}</Text> : null}
          </View>
          {children}
        </View>
      </KeyboardAwareScrollView>
      {footer ? <StickyFooter bottomEdge>{footer}</StickyFooter> : null}
    </SafeAreaView>
  );
}
