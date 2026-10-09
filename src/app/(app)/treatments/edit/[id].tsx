import { Stack, useLocalSearchParams } from 'expo-router';

import { TreatmentForm } from '@/components/records/TreatmentForm';
import { ErrorState, LoadingState } from '@/components/ui/Layout';
import { useLiveQuery } from '@/hooks/use-live-query';
import { getTreatment } from '@/lib/db/repositories/treatments';

export default function EditTreatmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useLiveQuery((db) => getTreatment(db, id), [id]);
  return (
    <>
      <Stack.Screen options={{ title: 'Edit treatment' }} />
      {t.loading && !t.data ? <LoadingState /> : null}
      {t.data === null ? <ErrorState message="This treatment no longer exists." /> : null}
      {t.data ? <TreatmentForm existing={t.data} /> : null}
    </>
  );
}
