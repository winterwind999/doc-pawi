import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { OnboardingStep } from '@/components/OnboardingStep';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { profileInputSchema } from '@/lib/validation/schemas';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useSession } from '@/stores/session-store';
import { colors } from '@/theme/colors';

const STEPS = [
  'Generate a random 256-bit encryption key in the Android Keystore-protected store',
  'Create your encrypted SQLCipher health database',
  'Save your profile and PIN verifier',
];

export default function SetupStep() {
  const draft = useOnboardingStore((s) => s.draft);
  const [state, setState] = useState<'idle' | 'working' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setState('working');
    setError(null);
    const input = profileInputSchema.safeParse({
      display_name: draft.displayName,
      email: null,
      sex: draft.sex,
      birth_date: draft.birthDate,
      height_value: draft.heightValue,
      height_unit: draft.heightValue != null ? draft.heightUnit : null,
      weight_value: draft.weightValue,
      weight_unit: draft.weightValue != null ? draft.weightUnit : null,
    });
    if (!input.success || !draft.pinRecord) {
      setState('error');
      setError('Some onboarding answers are missing or invalid. Go back and review them.');
      return;
    }
    try {
      // The app layout opens this route once the protected (app) group has mounted.
      useSession.setState({ postUnlockRoute: '/model?onboarding=1' });
      await useSession.getState().createProfile(draft, input.data);
      useOnboardingStore.getState().reset();
    } catch (e) {
      useSession.setState({ postUnlockRoute: null });
      setState('error');
      setError(`Secure storage could not be set up: ${(e as Error).message}. Nothing was saved; you can try again.`);
    }
  };

  return (
    <OnboardingStep
      step={6}
      title="Set up secure storage"
      description="Doc Pawi will now create your encrypted health vault on this phone. This works offline."
      footer={
        <Button
          label={state === 'error' ? 'Try again' : 'Create my secure vault'}
          icon="shield-lock-outline"
          loading={state === 'working'}
          onPress={() => void run()}
        />
      }
    >
      <View className="gap-3 rounded-2xl border border-line bg-surface p-4">
        {STEPS.map((s) => (
          <View key={s} className="flex-row items-center gap-3">
            {state === 'working' ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Icon name="shield-check-outline" size={22} color={colors.primary700} />
            )}
            <Text className="flex-1 text-sm leading-5 text-ink">{s}</Text>
          </View>
        ))}
      </View>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Text className="text-xs leading-4 text-ink-muted">
        Next, you can download the on-device AI model (about 1.3 GB, Wi-Fi recommended) or do it later from
        Settings.
      </Text>
    </OnboardingStep>
  );
}
