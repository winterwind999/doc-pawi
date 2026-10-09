import { router } from 'expo-router';
import { useState } from 'react';

import { OnboardingStep } from '@/components/OnboardingStep';
import { Button } from '@/components/ui/Button';
import { DateField } from '@/components/ui/DateField';
import { ageOn, isValidIsoDate, todayLocal } from '@/lib/dates';
import { useOnboardingStore } from '@/stores/onboarding-store';

export default function BirthDateStep() {
  const draft = useOnboardingStore((s) => s.draft);
  const update = useOnboardingStore((s) => s.update);
  const [value, setValue] = useState(draft.birthDate ?? '');
  const [error, setError] = useState<string | null>(null);

  const next = (skip = false) => {
    if (!skip) {
      if (!isValidIsoDate(value)) {
        setError('Enter a real date as YYYY-MM-DD, e.g. 1992-04-15.');
        return;
      }
      if (value > todayLocal() || (ageOn(value, todayLocal()) ?? 0) > 130) {
        setError('That date of birth does not look right.');
        return;
      }
    }
    update({ birthDate: skip ? null : value });
    router.push('/onboarding/body');
  };

  return (
    <OnboardingStep
      step={4}
      title="Date of birth"
      description="Used to show your age when you ask about your own health. You can skip this."
      footer={
        <>
          <Button label="Continue" icon="arrow-right" onPress={() => next(false)} />
          <Button label="Skip for now" variant="ghost" onPress={() => next(true)} />
        </>
      }
    >
      <DateField
        label="Date of birth"
        value={value}
        onChange={(v) => {
          setValue(v);
          setError(null);
        }}
        error={error}
        quickPicks="none"
        hint="Format: YYYY-MM-DD (e.g. 1992-04-15)"
      />
    </OnboardingStep>
  );
}
