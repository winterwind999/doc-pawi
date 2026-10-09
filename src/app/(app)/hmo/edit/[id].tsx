import { Stack, useLocalSearchParams } from 'expo-router';

import { HmoForm } from '@/components/HmoForm';
import { ErrorState, LoadingState } from '@/components/ui/Layout';
import { useLiveQuery } from '@/hooks/use-live-query';
import { getHmo } from '@/lib/db/repositories/hmos';

export default function EditHmoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const hmo = useLiveQuery((db) => getHmo(db, id), [id]);
  return (
    <>
      <Stack.Screen options={{ title: 'Edit HMO' }} />
      {hmo.loading && !hmo.data ? <LoadingState /> : null}
      {hmo.data === null ? <ErrorState message="This HMO no longer exists." /> : null}
      {hmo.data ? <HmoForm existing={hmo.data} /> : null}
    </>
  );
}
