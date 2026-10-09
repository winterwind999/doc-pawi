import { Stack } from 'expo-router';

import { DoctorForm } from '@/components/DoctorForm';

export default function NewDoctorScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Add doctor' }} />
      <DoctorForm />
    </>
  );
}
