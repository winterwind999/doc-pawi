import { router } from 'expo-router';
import { useState } from 'react';

import { OnboardingStep } from '@/components/OnboardingStep';
import { Button } from '@/components/ui/Button';
import { ChoiceChips } from '@/components/ui/Choice';
import { TextField } from '@/components/ui/TextField';
import { SEX_VALUES } from '@/lib/db/models';
import { SEX_LABELS } from '@/lib/labels';
import { useOnboardingStore } from '@/stores/onboarding-store';

export default function AboutYouStep() {
  const draft = useOnboardingStore((s) => s.draft);
  const update = useOnboardingStore((s) => s.update);
  const [name, setName] = useState(draft.displayName);
  const [error, setError] = useState<string | null>(null);

  const next = () => {
    if (!name.trim()) {
      setError('Enter the name Doc Pawi should use for you.');
      return;
    }
    update({ displayName: name.trim().slice(0, 80) });
    router.push('/onboarding/birth-date');
  };

  return (
    <OnboardingStep
      step={2}
      title="About you"
      description="This helps Doc Pawi personalize your dashboard. Sex is optional and only used as context for your own questions."
      footer={<Button label="Continue" icon="arrow-right" onPress={next} />}
    >
      <TextField
        label="Your name"
        value={name}
        onChangeText={(t) => {
          setName(t);
          setError(null);
        }}
        placeholder="e.g. Juan"
        autoCapitalize="words"
        autoComplete="name"
        error={error}
        required
        maxLength={80}
      />
      <ChoiceChips
        label="Sex"
        options={SEX_VALUES.map((value) => ({ value, label: SEX_LABELS[value] }))}
        value={draft.sex}
        onChange={(sex) => update({ sex })}
        allowDeselect
      />
    </OnboardingStep>
  );
}
