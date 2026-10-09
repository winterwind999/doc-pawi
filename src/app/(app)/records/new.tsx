import { Stack } from 'expo-router';

import { RecordForm } from '@/components/records/RecordForm';

export default function NewRecordScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Add record' }} />
      <RecordForm />
    </>
  );
}
