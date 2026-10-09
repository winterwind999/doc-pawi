import { Stack } from 'expo-router';

import { MedicationForm } from '@/components/meds/MedicationForm';

export default function NewMedicationScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Add medication' }} />
      <MedicationForm />
    </>
  );
}
