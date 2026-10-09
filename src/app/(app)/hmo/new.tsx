import { Stack } from 'expo-router';

import { HmoForm } from '@/components/HmoForm';

export default function NewHmoScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Add HMO' }} />
      <HmoForm />
    </>
  );
}
