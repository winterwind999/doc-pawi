import { Stack, useLocalSearchParams } from 'expo-router';

import { RecordForm } from '@/components/records/RecordForm';
import { ErrorState, LoadingState } from '@/components/ui/Layout';
import { useLiveQuery } from '@/hooks/use-live-query';
import { getRecord } from '@/lib/db/repositories/records';

export default function EditRecordScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const record = useLiveQuery((db) => getRecord(db, id), [id]);
  return (
    <>
      <Stack.Screen options={{ title: 'Edit record' }} />
      {record.loading && !record.data ? <LoadingState /> : null}
      {record.data === null ? <ErrorState message="This record no longer exists." /> : null}
      {record.data ? <RecordForm existing={record.data} /> : null}
    </>
  );
}
