import { Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ChoiceChips } from '@/components/ui/Choice';
import { DateField } from '@/components/ui/DateField';
import { KeyValueRow, Mascot, Screen, SectionHeader } from '@/components/ui/Layout';
import { TextField } from '@/components/ui/TextField';
import { ageOn, formatDate, todayLocal } from '@/lib/dates';
import { HEIGHT_UNITS, SEX_VALUES, WEIGHT_UNITS, type HeightUnit, type Sex, type WeightUnit } from '@/lib/db/models';
import { SEX_LABELS } from '@/lib/labels';
import { formatHeight, formatWeight, parseNumber } from '@/lib/units';
import { fieldErrors, profileInputSchema } from '@/lib/validation/schemas';
import { useSession } from '@/stores/session-store';

export default function ProfileScreen() {
  const profile = useSession((s) => s.profile)!;
  const registry = useSession((s) => s.profiles.find((p) => p.id === s.activeProfileId));
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.display_name);
  const [sex, setSex] = useState<Sex | null>(profile.sex);
  const [birth, setBirth] = useState(profile.birth_date ?? '');
  const [height, setHeight] = useState(profile.height_value != null ? String(profile.height_value) : '');
  const [heightUnit, setHeightUnit] = useState<HeightUnit>(profile.height_unit ?? 'cm');
  const [weight, setWeight] = useState(profile.weight_value != null ? String(profile.weight_value) : '');
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(profile.weight_unit ?? 'kg');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const h = parseNumber(height);
    const w = parseNumber(weight);
    const parsed = profileInputSchema.safeParse({
      display_name: name,
      email: profile.email,
      sex,
      birth_date: birth,
      height_value: h,
      height_unit: h != null ? heightUnit : null,
      weight_value: w,
      weight_unit: w != null ? weightUnit : null,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setSaving(true);
    try {
      await useSession.getState().saveProfile(parsed.data);
      setEditing(false);
      setErrors({});
      setMessage('Profile saved.');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const age = profile.birth_date ? ageOn(profile.birth_date, todayLocal()) : null;

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: 'Profile' }} />
      <View className="items-center">
        <Mascot size={80} />
      </View>
      {message ? <Banner tone="success">{message}</Banner> : null}
      {!editing ? (
        <>
          <Card className="gap-1">
            <KeyValueRow label="Name" value={profile.display_name} />
            <KeyValueRow label="Account" value={registry?.authProvider === 'google' ? `Google (${profile.email ?? ''})` : 'Local-only profile'} />
            <KeyValueRow label="Sex" value={profile.sex ? SEX_LABELS[profile.sex] : 'Not recorded'} />
            <KeyValueRow label="Date of birth" value={profile.birth_date ? `${formatDate(profile.birth_date)}${age !== null ? ` (age ${age})` : ''}` : 'Not recorded'} />
            <KeyValueRow label="Height" value={formatHeight(profile.height_value, profile.height_unit)} />
            <KeyValueRow label="Weight" value={formatWeight(profile.weight_value, profile.weight_unit)} />
          </Card>
          <Button label="Edit profile" icon="pencil-outline" variant="outline" onPress={() => setEditing(true)} />
        </>
      ) : (
        <>
          <TextField label="Name" value={name} onChangeText={setName} required error={errors.display_name} />
          <ChoiceChips label="Sex" options={SEX_VALUES.map((v) => ({ value: v, label: SEX_LABELS[v] }))} value={sex} onChange={setSex} allowDeselect />
          <DateField label="Date of birth" value={birth} onChange={setBirth} error={errors.birth_date} quickPicks="none" />
          <SectionHeader title="Height" />
          <ChoiceChips options={HEIGHT_UNITS.map((v) => ({ value: v, label: v }))} value={heightUnit} onChange={(v) => v && setHeightUnit(v)} />
          <TextField label={`Height (${heightUnit})`} value={height} onChangeText={setHeight} keyboardType="decimal-pad" error={errors.height_value} />
          <SectionHeader title="Weight" />
          <ChoiceChips options={WEIGHT_UNITS.map((v) => ({ value: v, label: v }))} value={weightUnit} onChange={(v) => v && setWeightUnit(v)} />
          <TextField label={`Weight (${weightUnit})`} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" error={errors.weight_value} />
          <View className="flex-row gap-2">
            <Button label="Save" icon="content-save-outline" className="flex-1" loading={saving} onPress={() => void save()} />
            <Button label="Cancel" variant="outline" onPress={() => setEditing(false)} />
          </View>
        </>
      )}
    </Screen>
  );
}
