import { Stack, useLocalSearchParams } from 'expo-router';

import { TreatmentForm } from '@/components/records/TreatmentForm';
import { TREATMENT_KINDS, type TreatmentKind } from '@/lib/db/models';

export default function NewTreatmentScreen() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const initialKind = TREATMENT_KINDS.includes(kind as TreatmentKind) ? (kind as TreatmentKind) : undefined;
  return (
    <>
      <Stack.Screen options={{ title: initialKind === 'vaccination' ? 'Add vaccination' : 'Add treatment' }} />
      <TreatmentForm initialKind={initialKind} />
    </>
  );
}
