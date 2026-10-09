import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ChoiceChips } from '@/components/ui/Choice';
import { Screen } from '@/components/ui/Layout';
import { TextField } from '@/components/ui/TextField';
import { FACILITY_TYPES, type FacilityType } from '@/lib/db/models';
import { createFacility, getFacility, updateFacility } from '@/lib/db/repositories/hmos';
import { FACILITY_TYPE_LABELS } from '@/lib/labels';
import { facilityInputSchema, fieldErrors } from '@/lib/validation/schemas';
import { useUnlockedSession } from '@/stores/session-store';

export default function FacilityEditScreen() {
  const { hmoId, facilityId } = useLocalSearchParams<{ hmoId?: string; facilityId?: string }>();
  const { db, profileId } = useUnlockedSession();
  const [name, setName] = useState('');
  const [type, setType] = useState<FacilityType | null>('clinic');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!facilityId) return;
    void getFacility(db, facilityId).then((f) => {
      if (!f) return;
      setName(f.name);
      setType(f.facility_type);
      setAddress(f.address ?? '');
      setPhone(f.phone ?? '');
      setNotes(f.notes ?? '');
    });
  }, [db, facilityId]);

  const save = async () => {
    const parsed = facilityInputSchema.safeParse({ name, facility_type: type, address, phone, notes });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setSaving(true);
    try {
      if (facilityId) await updateFacility(db, facilityId, parsed.data);
      else await createFacility(db, { profileId, input: parsed.data, sourceType: 'manual', linkHmoId: hmoId ?? null });
      router.back();
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={['bottom']} footer={<Button label="Save facility" icon="content-save-outline" loading={saving} onPress={() => void save()} />}>
      <Stack.Screen options={{ title: facilityId ? 'Edit facility' : 'Add facility' }} />
      <Banner tone="neutral">Enter the location manually. Doc Pawi does not use your location or look facilities up online.</Banner>
      <TextField label="Facility name" value={name} onChangeText={setName} required error={errors.name} />
      <ChoiceChips label="Type" options={FACILITY_TYPES.map((v) => ({ value: v, label: FACILITY_TYPE_LABELS[v] }))} value={type} onChange={setType} error={errors.facility_type} />
      <TextField label="Address" value={address} onChangeText={setAddress} multiline error={errors.address} />
      <TextField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" error={errors.phone} />
      <TextField label="Notes" value={notes} onChangeText={setNotes} multiline error={errors.notes} hint="e.g. what your HMO said is covered here (user-reported)." />
      {failure ? <Banner tone="danger">{failure}</Banner> : null}
    </Screen>
  );
}
