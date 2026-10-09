import { Stack, useLocalSearchParams } from 'expo-router';

import { DoctorForm } from '@/components/DoctorForm';
import { ErrorState, LoadingState } from '@/components/ui/Layout';
import { useLiveQuery } from '@/hooks/use-live-query';
import { getDoctor } from '@/lib/db/repositories/doctors';

export default function EditDoctorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const doctor = useLiveQuery((db) => getDoctor(db, id), [id]);
  return (
    <>
      <Stack.Screen options={{ title: 'Edit doctor' }} />
      {doctor.loading && !doctor.data ? <LoadingState /> : null}
      {doctor.data === null ? <ErrorState message="This doctor no longer exists." /> : null}
      {doctor.data ? <DoctorForm existing={doctor.data} /> : null}
    </>
  );
}
