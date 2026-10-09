import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Directory, File, Paths } from 'expo-file-system';
import { useState } from 'react';
import { Image, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Screen, SectionHeader } from '@/components/ui/Layout';
import { TextField } from '@/components/ui/TextField';
import { useLiveQuery } from '@/hooks/use-live-query';
import { createDoctor, updateDoctor, type DoctorWithHmos } from '@/lib/db/repositories/doctors';
import { listHmos } from '@/lib/db/repositories/hmos';
import { newId } from '@/lib/ids';
import { parseStringArray } from '@/lib/json';
import { doctorInputSchema, fieldErrors } from '@/lib/validation/schemas';
import { useUnlockedSession } from '@/stores/session-store';

const splitList = (text: string) =>
  text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

export function DoctorForm({ existing }: { existing?: DoctorWithHmos }) {
  const { db, profileId } = useUnlockedSession();
  const hmos = useLiveQuery((db, p) => listHmos(db, p));
  const [name, setName] = useState(existing?.name ?? '');
  const [specialty, setSpecialty] = useState(existing?.specialty ?? '');
  const [organization, setOrganization] = useState(existing?.organization ?? '');
  const [address, setAddress] = useState(existing?.address ?? '');
  const [phones, setPhones] = useState(parseStringArray(existing?.phones).join('\n'));
  const [emails, setEmails] = useState(parseStringArray(existing?.emails).join('\n'));
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [photo, setPhoto] = useState<string | null>(existing?.photo_path ?? null);
  const [hmoIds, setHmoIds] = useState<string[]>(existing?.hmos.map((h) => h.id) ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (result.canceled || !result.assets?.[0]) return;
    // Doctor photos are not health records; they are copied into app-private storage (not the encrypted vault).
    const dir = new Directory(Paths.document, 'doctor-photos', profileId);
    dir.create({ intermediates: true, idempotent: true });
    const dest = new File(dir, `${newId()}.jpg`);
    await new File(result.assets[0].uri).copy(dest);
    setPhoto(dest.uri);
  };

  const save = async () => {
    const parsed = doctorInputSchema.safeParse({
      name,
      specialty,
      organization,
      address,
      phones: splitList(phones),
      emails: splitList(emails),
      photo_path: photo,
      notes,
      hmo_ids: hmoIds,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setSaving(true);
    try {
      const doctor = existing
        ? await updateDoctor(db, existing.id, parsed.data)
        : await createDoctor(db, { profileId, input: parsed.data, sourceType: 'manual' });
      router.replace({ pathname: '/doctors/[id]', params: { id: doctor.id } });
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={['bottom']} footer={<Button label={existing ? 'Save changes' : 'Save doctor'} icon="content-save-outline" loading={saving} onPress={() => void save()} />}>
      <View className="flex-row items-center gap-3">
        {photo ? (
          <Image source={{ uri: photo }} accessibilityLabel="Doctor photo" className="rounded-full" style={{ width: 72, height: 72 }} />
        ) : null}
        <Button label={photo ? 'Change photo' : 'Add photo (optional)'} variant="outline" size="sm" icon="camera-outline" onPress={() => void pickPhoto()} />
        {photo ? <Button label="Remove" variant="ghost" size="sm" onPress={() => setPhoto(null)} /> : null}
      </View>
      <TextField label="Name" value={name} onChangeText={setName} required error={errors.name} autoCapitalize="words" placeholder="e.g. Dr. Ana Cruz" />
      <TextField label="Specialty" value={specialty} onChangeText={setSpecialty} error={errors.specialty} placeholder="e.g. Pediatrics" />
      <TextField label="Clinic, hospital, or organization" value={organization} onChangeText={setOrganization} error={errors.organization} />
      <TextField label="Address" value={address} onChangeText={setAddress} multiline error={errors.address} />
      <TextField label="Phone numbers" value={phones} onChangeText={setPhones} multiline keyboardType="phone-pad" hint="One per line (up to 5)." error={errors.phones} />
      <TextField label="Email addresses" value={emails} onChangeText={setEmails} multiline keyboardType="email-address" autoCapitalize="none" hint="One per line (up to 5)." error={errors.emails} />
      <SectionHeader title="HMOs this doctor accepts" />
      <Text className="text-xs leading-4 text-ink-muted">User-reported only — Doc Pawi does not verify HMO accreditation. Confirm with the clinic or your HMO.</Text>
      {hmos.data?.length ? (
        <View className="flex-row flex-wrap gap-2">
          {hmos.data.map((h) => {
            const on = hmoIds.includes(h.id);
            return (
              <Button
                key={h.id}
                label={h.provider_name}
                size="sm"
                variant={on ? 'primary' : 'outline'}
                icon={on ? 'check' : 'plus'}
                onPress={() => setHmoIds((ids) => (on ? ids.filter((x) => x !== h.id) : [...ids, h.id]))}
              />
            );
          })}
        </View>
      ) : (
        <Text className="text-sm text-ink-muted">No HMOs saved yet. Add one in the HMO tab to link it here.</Text>
      )}
      <TextField label="Notes" value={notes} onChangeText={setNotes} multiline error={errors.notes} />
      {failure ? <Banner tone="danger">{failure}</Banner> : null}
    </Screen>
  );
}
