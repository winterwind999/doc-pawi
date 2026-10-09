import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { OnboardingStep } from '@/components/OnboardingStep';
import { Button } from '@/components/ui/Button';
import { ToggleRow } from '@/components/ui/Choice';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { colors } from '@/theme/colors';

const POINTS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'cellphone-lock',
    title: 'Your data stays on this phone',
    text: 'Records, documents, and conversations are stored in an encrypted database on this device. There is no cloud sync or backup.',
  },
  {
    icon: 'chip',
    title: 'The AI runs on this phone',
    text: 'Answers and document reading use a local language model and on-device text recognition. Nothing is sent to a cloud AI service.',
  },
  {
    icon: 'wifi',
    title: 'When the internet is used',
    text: 'There are no accounts. The internet is used only for the one-time AI model download from Hugging Face and for maps you open yourself. Google’s on-device text recognition may send anonymous usage statistics (never your images or text).',
  },
  {
    icon: 'doctor',
    title: 'Not a doctor',
    text: 'Doc Pawi can be wrong. It does not diagnose, prescribe, or change medication doses. Always confirm with a licensed healthcare professional.',
  },
  {
    icon: 'ambulance',
    title: 'Emergencies',
    text: 'For chest pain, trouble breathing, stroke signs, severe bleeding, or thoughts of self-harm, call 911 (Philippines) or your local emergency number immediately.',
  },
];

export default function PrivacyStep() {
  const acknowledged = useOnboardingStore((s) => s.draft.acknowledgedDisclosure);
  const update = useOnboardingStore((s) => s.update);
  return (
    <OnboardingStep
      step={5}
      title="Privacy and medical limits"
      description="Please read how Doc Pawi handles your information and what it can and cannot do."
      footer={
        <Button
          label="Continue"
          icon="arrow-right"
          disabled={!acknowledged}
          onPress={() => router.push('/onboarding/setup')}
          accessibilityHint="Available after you confirm you understand"
        />
      }
    >
      <View className="gap-3">
        {POINTS.map((p) => (
          <View key={p.title} className="flex-row gap-3 rounded-2xl border border-line bg-surface p-4">
            <Icon name={p.icon} size={24} color={colors.primary700} />
            <View className="flex-1 gap-1">
              <Text className="text-base font-semibold text-ink">{p.title}</Text>
              <Text className="text-sm leading-5 text-ink-muted">{p.text}</Text>
            </View>
          </View>
        ))}
      </View>
      <View className="rounded-2xl border border-line bg-surface px-4">
        <ToggleRow
          label="I understand"
          description="Doc Pawi is an information and record-keeping tool, not medical advice."
          value={acknowledged}
          onChange={(v) => update({ acknowledgedDisclosure: v })}
        />
      </View>
    </OnboardingStep>
  );
}
