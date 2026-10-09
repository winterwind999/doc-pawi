import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Directory, File, Paths } from 'expo-file-system';
import { useState } from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Screen, SectionHeader } from '@/components/ui/Layout';
import { OptionDialog } from '@/components/ui/OptionDialog';
import { TextField } from '@/components/ui/TextField';
import { useLiveQuery } from '@/hooks/use-live-query';
import { createDoctor, updateDoctor, type DoctorWithHmos } from '@/lib/db/repositories/doctors';
import { listHmos } from '@/lib/db/repositories/hmos';
import { newId } from '@/lib/ids';
import { parseStringArray } from '@/lib/json';
import { suggestSpecialties } from '@/lib/specialties';
import { doctorInputSchema, fieldErrors } from '@/lib/validation/schemas';
import { useUnlockedSession } from '@/stores/session-store';

const MAX_CONTACTS = 5;

/** Five fixed slots, filled from the saved list. */
const slots = (saved: string | null | undefined) => {
  const values = parseStringArray(saved).slice(0, MAX_CONTACTS);
  return [...values, ...Array<string>(MAX_CONTACTS - values.length).fill('')];
};

export function DoctorForm({ existing }: { existing?: DoctorWithHmos }) {
  const { db, profileId } = useUnlockedSession();
  const hmos = useLiveQuery((db, p) => listHmos(db, p));
  const [name, setName] = useState(existing?.name ?? '');
  const [specialty, setSpecialty] = useState(existing?.specialty ?? '');
  const [specialtyFocused, setSpecialtyFocused] = useState(false);
  const [organization, setOrganization] = useState(existing?.organization ?? '');
  const [address, setAddress] = useState(existing?.address ?? '');
  const [phones, setPhones] = useState(() => slots(existing?.phones));
  const [emails, setEmails] = useState(() => slots(existing?.emails));
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [photo, setPhoto] = useState<string | null>(existing?.photo_path ?? null);
  const [photoChoice, setPhotoChoice] = useState(false);
  const [cameraDenied, setCameraDenied] = useState(false);
  const [hmoIds, setHmoIds] = useState<string[]>(existing?.hmos.map((h) => h.id) ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const keepPhoto = async (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || !result.assets?.[0]) return;
    // Doctor photos are not health records; they are copied into app-private storage (not the encrypted vault).
    const dir = new Directory(Paths.document, 'doctor-photos', profileId);
    dir.create({ intermediates: true, idempotent: true });
    const dest = new File(dir, `${newId()}.jpg`);
    await new File(result.assets[0].uri).copy(dest);
    setPhoto(dest.uri);
  };

  const fromCamera = async () => {
    setPhotoChoice(false);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setCameraDenied(true);
      return;
    }
    setCameraDenied(false);
    await keepPhoto(await ImagePicker.launchCameraAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.7 }));
  };

  const fromGallery = async () => {
    setPhotoChoice(false);
    await keepPhoto(await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.7 }));
  };

  const setSlot = (list: string[], index: number, value: string) => list.map((v, i) => (i === index ? value : v));

  const save = async () => {
    // Remember which slot each filled value came from so errors appear under the right field.
    const filledPhones = phones.map((v, i) => ({ v: v.trim(), i })).filter((x) => x.v);
    const filledEmails = emails.map((v, i) => ({ v: v.trim(), i })).filter((x) => x.v);
    const parsed = doctorInputSchema.safeParse({
      name,
      specialty,
      organization,
      address,
      phones: filledPhones.map((x) => x.v),
      emails: filledEmails.map((x) => x.v),
      photo_path: photo,
      notes,
      hmo_ids: hmoIds,
    });
    if (!parsed.success) {
      const next = fieldErrors(parsed.error);
      for (const issue of parsed.error.issues) {
        const [field, index] = issue.path;
        if (typeof index !== 'number') continue;
        const slot = field === 'phones' ? filledPhones[index]?.i : field === 'emails' ? filledEmails[index]?.i : undefined;
        if (slot !== undefined) next[`${String(field)}.${slot}`] = issue.message;
      }
      setErrors(next);
      return;
    }
    setSaving(true);
    try {
      if (existing) {
        await updateDoctor(db, existing.id, parsed.data);
        // Return to the doctor screen the user came from instead of stacking a second copy of it.
        router.back();
      } else {
        const doctor = await createDoctor(db, { profileId, input: parsed.data, sourceType: 'manual' });
        router.replace({ pathname: '/doctors/[id]', params: { id: doctor.id } });
      }
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const suggestions = specialtyFocused ? suggestSpecialties(specialty) : [];

  return (
    <Screen edges={['bottom']} footer={<Button label={existing ? 'Save changes' : 'Save doctor'} icon="content-save-outline" loading={saving} onPress={() => void save()} />}>
      <View className="flex-row items-center gap-3">
        {photo ? (
          <Image source={{ uri: photo }} accessibilityLabel="Doctor photo" className="rounded-full" style={{ width: 72, height: 72 }} />
        ) : null}
        <Button label={photo ? 'Change photo' : 'Add photo (optional)'} variant="outline" size="sm" icon="camera-outline" onPress={() => setPhotoChoice(true)} />
        {photo ? <Button label="Remove" variant="ghost" size="sm" onPress={() => setPhoto(null)} /> : null}
      </View>
      {cameraDenied ? (
        <Banner tone="pending" title="Camera permission is off" action={<Button label="Open app settings" size="sm" variant="outline" onPress={() => void Linking.openSettings()} />}>
          Allow camera access in Android settings to take a photo, or choose one from your gallery.
        </Banner>
      ) : null}
      <OptionDialog
        visible={photoChoice}
        title="Doctor photo"
        message="The photo stays on this phone."
        options={[
          { label: 'Take a photo', description: 'Use the camera', icon: 'camera-outline', onPress: () => void fromCamera() },
          { label: 'Choose from gallery', description: 'Pick an existing photo', icon: 'image-multiple-outline', onPress: () => void fromGallery() },
        ]}
        onCancel={() => setPhotoChoice(false)}
      />
      <TextField label="Name" value={name} onChangeText={setName} required error={errors.name} autoCapitalize="words" placeholder="e.g. Dr. Ana Cruz" />
      <View className="gap-2">
        <TextField
          label="Specialty"
          value={specialty}
          onChangeText={setSpecialty}
          onFocus={() => setSpecialtyFocused(true)}
          onBlur={() => setTimeout(() => setSpecialtyFocused(false), 150)}
          error={errors.specialty}
          placeholder="e.g. Pediatrics"
          autoCapitalize="words"
        />
        {suggestions.length ? (
          <View accessibilityLabel="Specialty suggestions" className="flex-row flex-wrap gap-2">
            {suggestions.map((s) => (
              <Pressable
                key={s}
                onPress={() => {
                  setSpecialty(s);
                  setSpecialtyFocused(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Use specialty ${s}`}
                className="min-h-[36px] justify-center rounded-full border border-line-strong bg-surface px-3 active:bg-primary-50"
              >
                <Text numberOfLines={1} className="text-sm text-ink">
                  {s}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      <TextField label="Clinic, hospital, or organization" value={organization} onChangeText={setOrganization} error={errors.organization} />
      <TextField label="Address" value={address} onChangeText={setAddress} multiline error={errors.address} />
      <SectionHeader title="Phone numbers" />
      {phones.map((value, i) => (
        <TextField
          key={`phone-${i}`}
          label={`Phone ${i + 1}`}
          value={value}
          onChangeText={(v) => setPhones((list) => setSlot(list, i, v))}
          keyboardType="phone-pad"
          placeholder={i === 0 ? 'e.g. (02) 8555 0101' : 'Optional'}
          error={errors[`phones.${i}`]}
        />
      ))}
      <SectionHeader title="Email addresses" />
      {emails.map((value, i) => (
        <TextField
          key={`email-${i}`}
          label={`Email ${i + 1}`}
          value={value}
          onChangeText={(v) => setEmails((list) => setSlot(list, i, v))}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder={i === 0 ? 'e.g. clinic@example.com' : 'Optional'}
          error={errors[`emails.${i}`]}
        />
      ))}
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
