import { Stack, useLocalSearchParams } from 'expo-router';

import { MedicationForm } from '@/components/meds/MedicationForm';
import { ErrorState, LoadingState } from '@/components/ui/Layout';
import { useLiveQuery } from '@/hooks/use-live-query';
import { getMedication } from '@/lib/db/repositories/medications';

export default function EditMedicationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const med = useLiveQuery((db) => getMedication(db, id), [id]);
  return (
    <>
      <Stack.Screen options={{ title: 'Edit medication' }} />
      {med.loading && !med.data ? <LoadingState /> : null}
      {med.data === null ? <ErrorState message="This medication no longer exists." /> : null}
      {med.data ? <MedicationForm existing={med.data} /> : null}
    </>
  );
}
