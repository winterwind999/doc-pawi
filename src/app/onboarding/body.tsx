import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { OnboardingStep } from '@/components/OnboardingStep';
import { Button } from '@/components/ui/Button';
import { ChoiceChips } from '@/components/ui/Choice';
import { TextField } from '@/components/ui/TextField';
import { parseNumber } from '@/lib/units';
import { profileInputSchema } from '@/lib/validation/schemas';
import { useOnboardingStore } from '@/stores/onboarding-store';

export default function BodyStep() {
  const draft = useOnboardingStore((s) => s.draft);
  const update = useOnboardingStore((s) => s.update);
  const [heightUnit, setHeightUnit] = useState(draft.heightUnit);
  const [weightUnit, setWeightUnit] = useState(draft.weightUnit);
  const [height, setHeight] = useState(draft.heightValue ? String(draft.heightValue) : '');
  const [weight, setWeight] = useState(draft.weightValue ? String(draft.weightValue) : '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const next = (skip = false) => {
    const heightValue = skip ? null : parseNumber(height);
    const weightValue = skip ? null : parseNumber(weight);
    const check = profileInputSchema.safeParse({
      display_name: draft.displayName || 'x',
      height_value: heightValue,
      height_unit: heightValue != null ? heightUnit : null,
      weight_value: weightValue,
      weight_unit: weightValue != null ? weightUnit : null,
    });
    if (!check.success) {
      const out: Record<string, string> = {};
      for (const issue of check.error.issues) out[String(issue.path[0])] ??= issue.message;
      setErrors(out);
      return;
    }
    update({ heightValue, heightUnit, weightValue, weightUnit });
    router.push('/onboarding/privacy');
  };

  return (
    <OnboardingStep
      step={4}
      title="Height and weight"
      description="Optional. Stored with the units you choose; Doc Pawi does not convert or interpret them clinically."
      footer={
        <>
          <Button label="Continue" icon="arrow-right" onPress={() => next(false)} />
          <Button label="Skip for now" variant="ghost" onPress={() => next(true)} />
        </>
      }
    >
      <View className="gap-3">
        <ChoiceChips
          label="Height unit"
          options={[
            { value: 'cm', label: 'Centimeters (cm)' },
            { value: 'in', label: 'Inches (in)' },
          ]}
          value={heightUnit}
          onChange={(v) => v && setHeightUnit(v)}
        />
        <TextField
          label={`Height (${heightUnit})`}
          value={height}
          onChangeText={(t) => {
            setHeight(t);
            setErrors({});
          }}
          keyboardType="decimal-pad"
          placeholder={heightUnit === 'cm' ? 'e.g. 165' : 'e.g. 65'}
          hint={heightUnit === 'in' ? '5 ft 5 in = 65 in' : undefined}
          error={errors.height_value}
        />
      </View>
      <View className="gap-3">
        <ChoiceChips
          label="Weight unit"
          options={[
            { value: 'kg', label: 'Kilograms (kg)' },
            { value: 'lb', label: 'Pounds (lb)' },
          ]}
          value={weightUnit}
          onChange={(v) => v && setWeightUnit(v)}
        />
        <TextField
          label={`Weight (${weightUnit})`}
          value={weight}
          onChangeText={(t) => {
            setWeight(t);
            setErrors({});
          }}
          keyboardType="decimal-pad"
          placeholder={weightUnit === 'kg' ? 'e.g. 62' : 'e.g. 137'}
          error={errors.weight_value}
        />
      </View>
    </OnboardingStep>
  );
}
