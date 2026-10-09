import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProgressBar } from './ui/Layout';

export const ONBOARDING_STEPS = 7;

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
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView className="flex-1" contentContainerClassName="gap-5 p-5 pb-8" keyboardShouldPersistTaps="handled">
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
        </ScrollView>
        {footer ? <View className="gap-2 border-t border-line bg-surface p-4">{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
